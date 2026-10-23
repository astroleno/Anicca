import { NextRequest, NextResponse } from "next/server";
import { readThinkingSpaceRequest, thinkingSpacePrompt, type ThinkingSpace } from "@/features/perspectives/model";
import { perspectiveEnvelope, responsePerspective } from "@/features/perspectives/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { createGenerationTrace, type GenerationTrace } from "@/features/dialectic/server/generationTrace";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import type { DeferredDraft } from "@/features/dialectic/meaning";
import {
  analyzeSynthesisOutput,
  buildSynthesisAuditPrompt,
  buildSynthesisContractRepairPrompt,
  buildSynthesisCriticPrompt,
  buildSynthesisDraftPrompt,
  buildSynthesisFinalPrompt,
  parseSynthesisAudit,
  SynthesisResult,
  SynthesisSource
} from "@/features/dialectic/server/synthesisQuality";
import {
  isHighRiskDialectic,
  retrieveDialecticPolicyCards
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
  requireContract = true
): Promise<{ synthesis: SynthesisResult | null; deferred?: DeferredDraft; errors: string[]; outputText: string }> {
  const lensPrompt = thinkingSpacePrompt(context.perspective, "synthesis", context.meaning);
  const suppliedInput = [context.rootInput, context.connectionInput].filter(Boolean).join("\n");
  const first = await trace.generate(stage, { client, input: [prompt, lensPrompt].filter(Boolean).join("\n\n"), maxOutputTokens: context.perspective ? 1800 : 1400 });
  let analysis = analyzeSynthesisOutput(perspectiveEnvelope(first.text, context.perspective).content, suppliedInput, { requireContract, meaning: context.meaning });
  trace.check(stage, Boolean(analysis.synthesis || analysis.deferred));
  if (analysis.synthesis || analysis.deferred) {
    return { ...analysis, outputText: first.text };
  }

  const repair = await trace.generate(stage, {
    client,
    input: [buildSynthesisContractRepairPrompt(context, first.text, analysis.errors), lensPrompt].filter(Boolean).join("\n\n"),
    maxOutputTokens: context.perspective ? 1800 : 1400
  }, true);
  analysis = analyzeSynthesisOutput(perspectiveEnvelope(repair.text, context.perspective).content, suppliedInput, { requireContract, meaning: context.meaning });
  trace.check(stage, Boolean(analysis.synthesis || analysis.deferred), true);
  return {
    synthesis: analysis.synthesis,
    deferred: analysis.deferred,
    errors: analysis.errors,
    outputText: repair.text
  };
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

    const cards = retrieveDialecticPolicyCards([rootInput, connectionInput,
      ...(seedMode && sources ? sources.map(source => source.text) : [])].filter(Boolean).join("\n"));
    const context: SynthesisStageContext = {
      meaning: body.meaningVersion === 1,
      connectionInput,
      sourceMode: seedMode ? "seeds" : undefined,
      perspective,
      rootInput,
      thesis: sources?.[0] || toSynthesisSource(thesis as Required<SynthesisInput>, "正"),
      antithesis: sources?.[1] || toSynthesisSource(antithesis as Required<SynthesisInput>, "反"),
      contextMessages: serializeContextMessages(body.contextMessages),
      cards
    };

    const draft = await generateSynthesisStage(
      trace,
      "draft",
      client,
      buildSynthesisDraftPrompt(context),
      context,
      false
    );
    if (!draft.synthesis && !draft.deferred) {
      trace.finish("invalid_output");
      return invalidModelOutput(requestId, "synthesis draft failed contract after one repair");
    }

    const critic = await generateSynthesisStage(
      trace,
      "critic",
      client,
      buildSynthesisCriticPrompt(context, (draft.synthesis || draft.deferred)!),
      context
    );
    if (critic.deferred) {
      req.signal.throwIfAborted();
      trace.finish("success");
      return NextResponse.json({ requestId, outcome: "deferred", deferred: critic.deferred });
    }
    if (!critic.synthesis) {
      trace.finish("invalid_output");
      return invalidModelOutput(requestId, "synthesis critic failed contract after one repair");
    }

    let synthesis = critic.synthesis;
    let selectedOutput = critic.outputText;
    if (isHighRiskDialectic(cards)) {
      const auditResponse = await trace.generate("audit", {
        client,
        input: buildSynthesisAuditPrompt(context, critic.synthesis),
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
        buildSynthesisFinalPrompt(context, critic.synthesis, audit),
        context
      );
      if (final.deferred) {
        req.signal.throwIfAborted();
        trace.finish("success");
        return NextResponse.json({ requestId, outcome: "deferred", deferred: final.deferred });
      }
      if (!final.synthesis) {
        trace.finish("invalid_output");
        return invalidModelOutput(requestId, "synthesis final rewrite failed contract after one repair");
      }
      synthesis = final.synthesis;
      selectedOutput = final.outputText;
    }

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
