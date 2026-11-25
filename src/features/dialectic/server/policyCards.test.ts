import {
  isHighRiskDialectic,
  retrieveDialecticPolicyCards
} from "@/features/dialectic/server/policyCards";

describe("dialectic policy retrieval", () => {
  it.each([
    "我在家里总扮演懂事的角色",
    "我为什么总觉得时间过得越来越快",
    "我在家庭中的角色改变后，要多久才能恢复平静？",
    "每天只有半小时和家人吃饭，为什么那段时间总觉得特别短？",
    "每周只有一个晚上能见家人，这段时间怎么过得这么快？",
    "每周只有两天能和孩子相处，我怎样减少自己的愧疚？",
    "手机缓存里留着过去的照片，每次看到都会想起小时候。",
    "我每天只有2小时陪孩子，工作太忙，该怎么平衡？",
    "我每周只能投入3个晚上写小说，这个项目还值得继续吗？",
    "我觉得我和朋友之间的一致性越来越差，权限感也变弱了",
    "分手后要不要删除所有聊天记录和备份？",
    "怎么看待历史数据对个人记忆的影响？",
    "我每天只有2小时陪孩子",
    "工作让我很愧疚",
    "为什么我总怕让别人失望？",
    "我小学时的梦想，如今还算是我的梦想吗？",
    "当了员工以后，我好像不再敢表达困惑了。",
    "姐姐替我拍板，我却说不清自己到底在介意什么。",
    "朋友没问我就打开了我的日记，我该怎么谈自己的隐私？",
    "别人说我没有同意，但我当时其实只是不敢说话。",
    "我想用中文写长篇日记，英文词句总先出现在脑子里。",
    "总在刷短视频的时候想起童年，怎么理解这件事？",
    "我喜欢的审美和我的合作者不同，为什么会让我不安？",
    "我总是把别人的选择当焦点，看不见自己想要什么。",
    "朋友已经用屏幕阅读器很久了，我能怎样理解他的阅读感受？",
    "我想复现奶奶包饺子的味道，但每次都不太像。",
    "我以前干销售，为什么离开以后还是习惯讨好别人？",
    "家里人叫我要定制一份更像样的生活，我却不想那样做。",
    "照片的日期被我记错了，找回记忆时相信照片还是自己？",
    "删掉日记的备份以后，我会不会连那段生活也忘掉？",
    "我是公司的员工，老觉得被父母监控，让我很压抑。",
    "我跟室友共用一块磁盘，分开后该删除我们在一起的照片吗？",
    "我做产品开发，每天只有2小时陪孩子，工作和家庭该怎么平衡？",
    "每周只剩两个晚上，怎样平衡维护友情和照顾父母？",
    "分手后要不要删除备份在磁盘里的聊天记录？我想知道自己为何舍不得。",
    "每天只有三个晚上这样的说法，为什么听起来比三个晚上更漫长？"
  ])("does not attach unrelated policy cards to %s", (input) => {
    const cards = retrieveDialecticPolicyCards(input);

    expect(cards).toEqual([]);
    expect(isHighRiskDialectic(cards)).toBe(false);
  });

  it.each([
    ["多租户 API 的用户角色存在缓存中，如何按权限隔离并及时撤权？", "authoritative-decision", true],
    ["给访问控制结果做本地快取，撤权后下一次请求怎样强制回源？", "authoritative-decision", true],
    ["撤权后快取何时应回源？", "authoritative-decision", true],
    ["读取接口的 p95 延迟过高，应该增加缓存并接受短期不一致，还是保持强一致并接受更慢响应？", "authoritative-decision", true],
    ["每周只有两个小时，怎样兼顾旧项目维护和新项目验证？", "bounded-attention", false],
    ["每周只有一个晚上，怎样平衡旧项目维护和新项目验证？", "bounded-attention", false],
    ["每周只有两天，怎样兼顾旧项目维护和新项目验证？", "bounded-attention", false],
    ["三个晚上要在旧工具维护和新功能验证之间如何分配？", "bounded-attention", false],
    ["维护开源库和试做功能一周最多 4 小时，怎样分配？", "bounded-attention", false],
    ["发布和补测试共用一份工时预算，怎样设定交付顺序？", "bounded-attention", false],
    ["删除生产历史数据前，怎样用独立备份验证可以恢复？", "verified-recovery", true],
    ["核对数据库快照能否在隔离环境执行恢复，再回收旧副本。", "verified-recovery", true],
    ["团队资金只剩四周，是要继续做增长还是先争取一笔预付款？", "survival-cash", true],
    ["旧协议无法弃用，怎样让新旧服务并行过渡？", "safe-compatibility", true],
    ["公司要求追踪员工的浏览历史，为了绩效评估是否应该采集？", "employee-monitoring", true],
    ["数据中心准备删除所有异地备份，怎样确认能从磁带还原？", "verified-recovery", true],
    ["怎样在生产环境验证备份真的能恢复，之后才删原来的数据？", "verified-recovery", true],
    ["我每周只有两个晚上能做个人项目。应该维护已经有人使用的笔记工具，还是开始一直想做的声音作品？", "bounded-attention", false],
    ["我每周只有一个下午维护自己的词典网站。我没有收集过用户反馈，也不知道有没有人需要新功能。该先修整现有页面，还是试做一个离线功能？", "bounded-attention", false]
  ])("matches the relevant domain card for %s", (input, id, highRisk) => {
    const cards = retrieveDialecticPolicyCards(input);

    expect(cards.map((card) => card.id)).toEqual([id]);
    expect(isHighRiskDialectic(cards)).toBe(highRisk);
  });

  it("keeps a matched high-risk card ahead of stronger low-risk scores and caps results at two", () => {
    const cards = retrieveDialecticPolicyCards(
      "公开上线的产品要增加隐私遥测采集。同时两位合作者、合伙人对品牌定位长期冲突，应该由谁拍板？新项目和旧项目共用固定时间预算，如何分配旧项目维护和新功能验证？"
    );

    expect(cards.map((card) => card.id)).toEqual([
      "consent-privacy",
      "revocable-ownership"
    ]);
    expect(isHighRiskDialectic(cards)).toBe(true);
  });

  it("preserves both monitoring safeguards when work devices are recorded for evaluation", () => {
    const cards = retrieveDialecticPolicyCards("公司准备对员工电脑全天录屏，用来考核绩效，这样合适吗？");
    expect(cards.map(card => card.id)).toEqual(["employee-monitoring", "consent-privacy"]);
    expect(isHighRiskDialectic(cards)).toBe(true);
  });
});
