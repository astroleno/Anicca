import { buildParentContext } from "@/chat/context";
import { BranchGraphStore } from "@/store/branchGraph";

describe("buildParentContext", () => {
  it("preserves lineage via lineageParentId and injects synthesis sources", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("我要不要继续这个项目");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });
    const synthesisId = store.createSynthesisAssistant([thesisId, antithesisId], {
      text: "重开主线",
      summary: "主线重开",
      label: "重开"
    });
    const childUserId = store.createChildUserNode(synthesisId, "如果继续，要怎么开始");
    const { thesisId: nextThesisId } = store.createAssistantPair(childUserId, {
      thesis: { text: "", summary: "", label: "拆小" },
      antithesis: { text: "", summary: "", label: "暂停" }
    });

    const built = buildParentContext(nextThesisId, "system", undefined, store.getGraph());

    expect(built.messages.map((message) => message.id)).toContain(rootUserId);
    expect(built.messages.map((message) => message.id)).toContain(childUserId);
    expect(built.messages.some((message) => message.content.includes("来源：继续：继续推进；暂停：暂停重构"))).toBe(true);
  });

  it("keeps branch-filtered summaries for legacy branch continuation", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("我要不要继续这个项目");
    const { thesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });

    const built = buildParentContext(thesisId, "system", "正", store.getGraph());

    expect(built.messages.some((message) => message.content.includes("继续：继续推进"))).toBe(true);
    expect(built.messages.some((message) => message.content.includes("暂停：暂停重构"))).toBe(false);
  });
});
