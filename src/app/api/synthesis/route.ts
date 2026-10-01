import { NextRequest, NextResponse } from "next/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
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

type SynthesisStageContext = Parameters<typeof buildSynthesisDraftPrompt>[0];

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

function getErrorInfo(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
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
      !["正", "反", "合", "想法"].includes(item.stance)) return null;
    ids.add(item.id);
    sources.push({ text: item.text.trim(), summary: item.summary.trim(), label: item.label.trim(), stance: item.stance });
  }
  return sources as [SynthesisSource, SynthesisSource];
}

async function generateSynthesisStage(
  model: string,
  client: ReturnType<typeof getDialecticOpenAiClient>,
  prompt: string,
  context: SynthesisStageContext,
  requireContract = true
): Promise<{ synthesis: SynthesisResult | null; errors: string[]; outputText: string }> {
  const first = await generateText({ model, client, input: prompt, maxOutputTokens: 1400 });
  let analysis = analyzeSynthesisOutput(first.text, context.rootInput, { requireContract });
  if (analysis.synthesis) {
    return { synthesis: analysis.synthesis, errors: [], outputText: first.text };
  }

  const repair = await generateText({
    model,
    client,
    input: buildSynthesisContractRepairPrompt(context, first.text, analysis.errors),
    maxOutputTokens: 1400
  });
  analysis = analyzeSynthesisOutput(repair.text, context.rootInput, { requireContract });
  return {
    synthesis: analysis.synthesis,
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

  try {
    requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const rootInput = typeof body.rootInput === "string" ? body.rootInput.trim() : "";
    const thesis = body.thesis;
    const antithesis = body.antithesis;
    const seedMode = "sources" in body;
    const sources = seedMode ? readSeedSources(body.sources) : null;

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
    const client = getDialecticOpenAiClient();

    const cards = retrieveDialecticPolicyCards(seedMode && sources
      ? `${rootInput}\n${sources.map((source) => source.text).join("\n")}` : rootInput);
    const context: SynthesisStageContext = {
      sourceMode: seedMode ? "seeds" : undefined,
      rootInput,
      thesis: sources?.[0] || toSynthesisSource(thesis as Required<SynthesisInput>, "正"),
      antithesis: sources?.[1] || toSynthesisSource(antithesis as Required<SynthesisInput>, "反"),
      contextMessages: serializeContextMessages(body.contextMessages),
      cards
    };

    const draft = await generateSynthesisStage(
      model,
      client,
      buildSynthesisDraftPrompt(context),
      context,
      false
    );
    if (!draft.synthesis) {
      console.warn("/api/synthesis draft failed contract", {
        requestId,
        errors: draft.errors,
        outputText: draft.outputText.slice(0, 500)
      });
      return invalidModelOutput(requestId, "synthesis draft failed contract after one repair");
    }

    const critic = await generateSynthesisStage(
      model,
      client,
      buildSynthesisCriticPrompt(context, draft.synthesis),
      context
    );
    if (!critic.synthesis) {
      console.warn("/api/synthesis critic failed contract", {
        requestId,
        errors: critic.errors,
        outputText: critic.outputText.slice(0, 500)
      });
      return invalidModelOutput(requestId, "synthesis critic failed contract after one repair");
    }

    let synthesis = critic.synthesis;
    if (isHighRiskDialectic(cards)) {
      const auditResponse = await generateText({
        model,
        client,
        input: buildSynthesisAuditPrompt(context, critic.synthesis),
        maxOutputTokens: 1800
      });
      const audit = parseSynthesisAudit(auditResponse.text, cards);
      if (!audit) {
        console.warn("/api/synthesis malformed high-risk audit", {
          requestId,
          policyCardIds: cards.map((card) => card.id),
          outputText: auditResponse.text.slice(0, 500)
        });
        return invalidModelOutput(requestId, "high-risk semantic audit failed");
      }

      const final = await generateSynthesisStage(
        model,
        client,
        buildSynthesisFinalPrompt(context, critic.synthesis, audit),
        context
      );
      if (!final.synthesis) {
        console.warn("/api/synthesis final rewrite failed contract", {
          requestId,
          errors: final.errors,
          outputText: final.outputText.slice(0, 500)
        });
        return invalidModelOutput(requestId, "synthesis final rewrite failed contract after one repair");
      }
      synthesis = final.synthesis;
    }

    return NextResponse.json({ requestId, synthesis });
  } catch (error: unknown) {
    console.error("/api/synthesis error", { requestId, ...getErrorInfo(error) });
    const failure = describeProviderFailure(error);
    return NextResponse.json(
      {
        requestId,
        error: "synthesis_failed",
        details: failure.details
      },
      { status: failure.status }
    );
  }
}
