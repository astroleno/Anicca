import { NextRequest, NextResponse } from "next/server";
import { readThinkingSpaceRequest, thinkingSpacePrompt, type ThinkingSpace } from "@/features/perspectives/model";
import { perspectiveEnvelope, responsePerspective } from "@/features/perspectives/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { createGenerationTrace, type GenerationTrace } from "@/features/dialectic/server/generationTrace";
import { parseStrictJsonObject } from "@/lib/openai/parseStrictJsonObject";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import { finalizeSynthesisMeaning, userReportedMaterial } from "@/features/dialectic/server/meaningReview";
import type { DeferredDraft } from "@/features/dialectic/meaning";
import {
  analyzeSynthesisOutput,
  buildSynthesisAuditPrompt,
  buildSynthesisContractRepairPrompt,
  buildSynthesisCriticPrompt,
  buildSynthesisDraftPrompt,
  buildSynthesisFinalPrompt,
  parseSynthesisAudit,
  type SynthesisAudit,
  SynthesisResult,
  SynthesisSource
} from "@/features/dialectic/server/synthesisQuality";
import {
  isHighRiskDialectic,
  retrieveDialecticPolicyCards,
  selectDialecticPolicyCards,
  type DialecticPolicyCard
} from "@/features/dialectic/server/policyCards";

type ContextMessage = {
  role?: string;
  content?: string;
};

type SynthesisInput = {
  text?: unknown;
  summary?: unknown;
  label?: unknown;
  stance?: unknown;
};

type SynthesisStageContext = Parameters<typeof buildSynthesisDraftPrompt>[0] & { perspective?: ThinkingSpace };

function serializeContextMessages(contextMessages: unknown): string {
  if (!Array.isArray(contextMessages)) {
    return "";
  }

  return contextMessages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return "";
      }

      const entry = message as ContextMessage;
      const role = typeof entry.role === "string" ? entry.role : "user";
      const content = typeof entry.content === "string" ? entry.content.trim() : "";
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function invalidModelOutput(requestId: string, details: string) {
  return NextResponse.json({ requestId, error: "invalid_model_output", details }, { status: 502 });
}

function hasRequiredBranch(value: unknown, stance: "正" | "反"): value is Required<SynthesisInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const branch = value as Record<string, unknown>;
  return (
    typeof branch.text === "string" &&
    Boolean(branch.text.trim()) &&
    typeof branch.summary === "string" &&
    Boolean(branch.summary.trim()) &&
    typeof branch.label === "string" &&
    branch.stance === stance
  );
}

function toSynthesisSource(value: Required<SynthesisInput>, stance: "正" | "反"): SynthesisSource {
  return {
    text: String(value.text).trim(),
    summary: String(value.summary).trim(),
    label: String(value.label).trim(),
    stance
  };
}

function readSeedSources(value: unknown): [SynthesisSource, SynthesisSource] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const ids = new Set<string>();
  const sources: SynthesisSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() ||
      ids.has(item.id) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 12000 ||
      typeof item.summary !== "string" || typeof item.label !== "string" ||
      !["正", "反", "合", "想法", "视角"].includes(item.stance)) return null;
    ids.add(item.id);
    sources.push({ text: item.text.trim(), summary: item.summary.trim(), label: item.label.trim(), stance: item.stance });
  }
  return sources as [SynthesisSource, SynthesisSource];
}

async function generateSynthesisStage(
  trace: GenerationTrace,
  stage: "draft" | "critic" | "final",
  client: ReturnType<typeof getDialecticOpenAiClient>,
  prompt: string,
  context: SynthesisStageContext,
  draftCandidates?: DialecticPolicyCard[]
): Promise<{ synthesis: SynthesisResult | null; deferred?: DeferredDraft; errors: string[]; outputText: string; cards: DialecticPolicyCard[] }> {
  const lensPrompt = thinkingSpacePrompt(context.perspective, "synthesis", context.meaning);
  const suppliedInput = [context.rootInput, context.connectionInput].filter(Boolean).join("\n");
  function analyze(text: string) {
    let { content } = perspectiveEnvelope(text, context.perspective);
    let cards = context.cards;
    if (draftCandidates?.length) {
      const { applicablePolicyCardIds, ...draft } = parseStrictJsonObject(content) ?? {};
      const selected = selectDialecticPolicyCards(draftCandidates, applicablePolicyCardIds);
      if (selected === null) {
        return { synthesis: null, deferred: undefined, cards: [], errors: ["applicablePolicyCardIds must be a unique array of candidate IDs"] };
      }
      cards = selected;
      content = JSON.stringify(draft);
    }
    return { ...analyzeSynthesisOutput(content, suppliedInput, { requireContract: stage !== "draft", meaning: context.meaning }), cards };
  }

  // In a gated draft the root metadata contract must follow the optional lens example.
  const withLens = (stagePrompt: string) => (draftCandidates?.length ? [lensPrompt, stagePrompt] : [stagePrompt, lensPrompt])
    .filter(Boolean).join("\n\n");
  const maxOutputTokens = context.perspective ? 1800 : 1400;
  const first = await trace.generate(stage, { client, input: withLens(prompt), maxOutputTokens });
  let analysis = analyze(first.text);
  trace.check(stage, Boolean(analysis.synthesis || analysis.deferred));
  if (analysis.synthesis || analysis.deferred) {
    return { ...analysis, outputText: first.text };
  }

  const repair = await trace.generate(stage, {
    client,
    input: withLens(buildSynthesisContractRepairPrompt(context, first.text, analysis.errors, draftCandidates)),
    maxOutputTokens
  }, true);
  analysis = analyze(repair.text);
  trace.check(stage, Boolean(analysis.synthesis || analysis.deferred), true);
  return { ...analysis, outputText: repair.text };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await req.json();
    body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? (parsedBody as Record<string, unknown>)
      : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let requestId = "";
  let trace: GenerationTrace | undefined;

  try {
    requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const rootInput = typeof body.rootInput === "string" ? body.rootInput.trim() : "";
    const thesis = body.thesis;
    const antithesis = body.antithesis;
    const seedMode = "sources" in body;
    const sources = seedMode ? readSeedSources(body.sources) : null;
    const connectionInput = typeof body.connectionInput === "string" ? body.connectionInput.trim() : "";
    if (body.connectionInput !== undefined && (typeof body.connectionInput !== "string" || Array.from(connectionInput).length > 2000)) {
      return NextResponse.json({ requestId, error: "invalid_connection_input" }, { status: 400 });
    }

    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    if (!rootInput) {
      return NextResponse.json({ requestId, error: "rootInput required" }, { status: 400 });
    }

    if (seedMode ? !sources : (!hasRequiredBranch(thesis, "正") || !hasRequiredBranch(antithesis, "反"))) {
      return NextResponse.json({ requestId, error: "thesis and antithesis required" }, { status: 400 });
    }

    const model = getDialecticModel(typeof body.model === "string" ? body.model : undefined);
    trace = createGenerationTrace("synthesis", model, req.signal);
    const client = getDialecticOpenAiClient();
    const perspective = readThinkingSpaceRequest(body.perspective);

    const selectedSources = sources || [
      toSynthesisSource(thesis as Required<SynthesisInput>, "正"),
      toSynthesisSource(antithesis as Required<SynthesisInput>, "反")
    ];
    const candidates = retrieveDialecticPolicyCards([rootInput, connectionInput, ...selectedSources.map(source => source.text)]);
    trace.recordPolicyCards(candidates);
    const draftContext: SynthesisStageContext = {
      meaning: body.meaningVersion === 1,
      connectionInput,
      sourceMode: seedMode ? "seeds" : undefined,
      perspective,
      rootInput,
      thesis: selectedSources[0],
      antithesis: selectedSources[1],
      contextMessages: serializeContextMessages(body.contextMessages),
      cards: []
    };

    const draft = await generateSynthesisStage(
      trace,
      "draft",
      client,
      buildSynthesisDraftPrompt(draftContext, candidates),
      draftContext,
      candidates
    );
    if (!draft.synthesis && !draft.deferred) {
      trace.finish("invalid_output");
      return invalidModelOutput(requestId, "synthesis draft failed contract after one repair");
    }

    const { cards } = draft;
    trace.recordPolicyCards(candidates, cards);
    const context = { ...draftContext, cards };
    const critic = await generateSynthesisStage(
      trace,
      "critic",
      client,
      buildSynthesisCriticPrompt(context, (draft.synthesis || draft.deferred)!),
      context
    );
    const meaningInput = {
      sources: [{ id: "source-a", ...context.thesis }, { id: "source-b", ...context.antithesis }],
      userMaterial: [rootInput, connectionInput, userReportedMaterial(body.contextMessages)].join("\n"),
      context: context.contextMessages, perspective, meaning: Boolean(context.meaning), trace, client, signal: req.signal
    };
    function deferredResponse(deferred: DeferredDraft) {
      req.signal.throwIfAborted();
      trace!.finish("success");
      return NextResponse.json({ requestId, outcome: "deferred", deferred });
    }

    function reviewStage(stage: "critic" | "final", output: typeof critic, finalContext?: { audit: SynthesisAudit; original: SynthesisResult }) {
      const candidate = output.deferred ? { deferred: output.deferred, outputText: output.outputText }
        : output.synthesis ? { synthesis: output.synthesis, outputText: output.outputText } : null;
      if (!candidate) return null;
      return finalizeSynthesisMeaning<SynthesisResult>(meaningInput, candidate, stage === "critic" || context.meaning
        ? async (issues, previous) => {
          const previousDraft = "deferred" in previous ? previous.deferred : previous.synthesis;
          const prompt = finalContext
            ? `${buildSynthesisFinalPrompt(context, "synthesis" in previous ? previous.synthesis : finalContext.original, finalContext.audit)}\n待修正输出：${JSON.stringify(previousDraft)}`
            : buildSynthesisCriticPrompt(context, previousDraft);
          const repairedOutput = await trace!.generate(stage, { client, maxOutputTokens: perspective ? 1800 : 1400,
            input: [prompt, thinkingSpacePrompt(perspective, "synthesis", context.meaning),
              `必须修复以下审校问题：${issues.join("；")}`].filter(Boolean).join("\n\n") }, true, 12000);
          const repaired = analyzeSynthesisOutput(perspectiveEnvelope(repairedOutput.text, perspective).content,
            [rootInput, connectionInput].filter(Boolean).join("\n"), { meaning: context.meaning });
          trace!.check(stage, Boolean(repaired.synthesis || repaired.deferred), true);
          if (repaired.deferred) return { deferred: repaired.deferred, outputText: repairedOutput.text };
          return repaired.synthesis ? { synthesis: repaired.synthesis, outputText: repairedOutput.text } : null;
        } : undefined);
    }

    if (!critic.synthesis && !critic.deferred) {
      trace.finish("invalid_output");
      return invalidModelOutput(requestId, "synthesis critic failed contract after one repair");
    }
    const checked = await reviewStage("critic", critic);
    if (!checked) {
      trace.finish("invalid_output");
      return invalidModelOutput(requestId, context.meaning ? "synthesis prose could not be verified" : "hypothesis grounding could not be verified");
    }
    if ("deferred" in checked) return deferredResponse(checked.deferred);

    let { synthesis, outputText: selectedOutput } = checked;
    if (isHighRiskDialectic(cards)) {
      const auditResponse = await trace.generate("audit", {
        client,
        input: buildSynthesisAuditPrompt(context, synthesis),
        maxOutputTokens: 1800
      });
      const audit = parseSynthesisAudit(auditResponse.text, cards);
      trace.check("audit", Boolean(audit));
      if (!audit) {
        trace.finish("invalid_output");
        return invalidModelOutput(requestId, "high-risk semantic audit failed");
      }

      const final = await generateSynthesisStage(
        trace,
        "final",
        client,
        buildSynthesisFinalPrompt(context, synthesis, audit),
        context
      );
      if (!final.synthesis && !final.deferred) {
        trace.finish("invalid_output");
        return invalidModelOutput(requestId, "synthesis final rewrite failed contract after one repair");
      }
      const checkedFinal = await reviewStage("final", final, { audit, original: synthesis });
      if (!checkedFinal) {
        trace.finish("invalid_output");
        return invalidModelOutput(requestId, context.meaning ? "final synthesis prose could not be verified" : "final hypothesis grounding could not be verified");
      }
      if ("deferred" in checkedFinal) return deferredResponse(checkedFinal.deferred);
      synthesis = checkedFinal.synthesis;
      selectedOutput = checkedFinal.outputText;
    }

    req.signal.throwIfAborted();
    trace.finish("success");
    const envelope = perspectiveEnvelope(selectedOutput, perspective);
    return NextResponse.json({ requestId, synthesis: { ...synthesis, ...responsePerspective(perspective, envelope.spatial.synthesis) },
      ...(envelope.suggestions.length ? { suggestedAxes: envelope.suggestions } : {}) });
  } catch (error: unknown) {
    if (req.signal.aborted) return NextResponse.json({ requestId, error: "cancelled" }, { status: 499 });
    const failure = describeProviderFailure(error);
    return NextResponse.json(
      {
        requestId,
        error: "synthesis_failed",
        details: failure.details
      },
      { status: failure.status }
    );
  } finally {
    trace?.finish("failed");
  }
}
