export type DialecticPolicyCard = {
  id: string;
  title: string;
  priority: number;
  keywords: string[];
  invariants: string[];
  forbidden: string[];
};

export type DialecticRuleCheck = {
  id: string;
  kind: "invariant" | "forbidden";
  rule: string;
};

export const DIALECTIC_POLICY_CARD_VERSION = "1.4.0-dev-derived";
export const MAX_DIALECTIC_POLICY_CARDS = 2;
export const HIGH_RISK_POLICY_PRIORITY = 80;

const DIALECTIC_POLICY_CARDS: DialecticPolicyCard[] = [
  {
    id: "survival-cash",
    title: "现金生存窗口",
    priority: 90,
    keywords: ["现金流", "现金窗口", "只剩六周", "只剩四周", "续命", "付费客户", "销售"],
    invariants: [
      "题设给出的现金期限优先于长期增长、融资故事和虚荣指标",
      "继续投入必须连接定金、付费试点、可核验采购承诺或明确削减消耗动作",
      "实验必须短于现金窗口、范围单一，失败后能停止"
    ],
    forbidden: ["把注册、活跃、留存或口头兴趣直接当作收入证据", "假设题设没有的融资、预算或人手"]
  },
  {
    id: "bounded-abstraction",
    title: "客户定制与抽象",
    priority: 45,
    keywords: ["集成", "连接器", "插件平台", "SDK", "单一集成", "专属报表", "定制"],
    invariants: [
      "缺少第二份复用证据时不得先建设完整平台或生态",
      "客户专属字段和条件必须隔离于核心领域模型",
      "开工绑定签约、付款、验收和变更边界；第二份复用证据才触发抽象"
    ],
    forbidden: ["把首个客户硬编码扩散进核心", "用未来可能复用代替实际复用证据"]
  },
  {
    id: "consent-privacy",
    title: "同意与隐私",
    priority: 100,
    keywords: [
      "隐私",
      "遥测",
      "埋点",
      "行为追踪",
      "行为分析",
      "录屏",
      "session replay",
      "个人效率监控",
      "键盘活动",
      "没有同意"
    ],
    invariants: [
      "业务期限、增长或排错需要不能替代独立明示同意",
      "没有合法数据时如实披露缺失；新研究必须目的绑定、可拒绝、可退出且不影响原服务或评价",
      "数据来源、用途、最短保留期和删除路径必须可审计",
      "研究开始前检查重识别风险并保留可立即远程停用与删除的路径"
    ],
    forbidden: [
      "秘密或默认开启个人行为追踪",
      "用匿名化或事后删除合理化未经同意采集",
      "把示意或合成数据冒充真实证据"
    ]
  },
  {
    id: "employee-monitoring",
    title: "员工监控边界",
    priority: 120,
    keywords: ["员工", "个人效率监控", "键盘活动", "窗口活动", "绩效评价", "董事会"],
    invariants: [
      "如实披露目前没有合法的个人行为数据，管理期限不能替代同意",
      "拒绝窗口、键盘、录屏或等价的个人行为采样，包括聚合、匿名、短期或抽样版本",
      "改用合法取得的任务完成、阻塞、交付周期或团队流程记录，并说明其不能证明个人努力",
      "任何新增研究必须独立明示同意、可拒绝可退出且不影响绩效评价"
    ],
    forbidden: [
      "把监控改名为团队负载或聚合指数后继续采集",
      "默认采集后再匿名化或删除",
      "把没有合法依据的数据包装成董事会结论"
    ]
  },
  {
    id: "contain-security-risk",
    title: "安全风险止血",
    priority: 95,
    keywords: ["跨租户", "权限泄漏", "数据污染", "数据错乱", "无法复现", "复现", "安全漏洞", "泄漏", "审计日志"],
    invariants: [
      "先停止可能扩大爆炸半径的写入、权限变更或危险路径",
      "调查使用不可变证据与只读回放，不能再次写入权威数据",
      "隔离且可回滚的工作可继续；新增影响或恢复失败时升级处置"
    ],
    forbidden: ["在没有停写或回滚开关时继续全部发布", "无限期冻结与风险边界完全隔离的工作"]
  },
  {
    id: "authoritative-decision",
    title: "权威判定与缓存",
    priority: 85,
    keywords: ["缓存", "陈旧", "强一致", "权威服务", "权限查询", "角色", "余额", "库存"],
    invariants: [
      "先区分可陈旧展示与会改变授权或写入结果的关键读取",
      "权限、余额、库存及敏感动作最终由权威服务校验",
      "只从一个慢端点小范围验证，并保留立即回源路径"
    ],
    forbidden: ["让陈旧值直接授权敏感动作", "只用命中率或延迟证明正确性"]
  },
  {
    id: "safe-compatibility",
    title: "限寿兼容层",
    priority: 80,
    keywords: ["旧客户端", "旧协议", "旧设备", "无法升级", "schema", "请求签名", "强制升级"],
    invariants: [
      "兼容不能削弱鉴权、数据或写入语义",
      "旧协议只进入限寿隔离层，核心只维护新语义",
      "无法证明等价的操作关闭，并提供通知、只读、导出或迁移窗口"
    ],
    forbidden: ["无限期维护核心双协议分支", "静默翻译有歧义或不安全写入"]
  },
  {
    id: "bounded-attention",
    title: "固定时间预算",
    priority: 55,
    keywords: ["每天九十分钟", "每周只有", "时间", "旧项目", "开源工具", "新项目", "教程产品"],
    invariants: [
      "所有承诺合计不得超过题设时间预算",
      "公开旧方向只处理阻断事项的维护边界，普通事项进入固定批次而不持续占用",
      "新方向使用连续且限时的验证窗口，不能把时间切碎成两套长期周常",
      "继续依据完成、复用、贡献或付款行为，失败后停止一个方向"
    ],
    forbidden: ["同时维持两套无限工作", "用主观兴奋、点赞或星标代替真实使用"]
  },
  {
    id: "downstream-distribution",
    title: "母体与下游分发",
    priority: 50,
    keywords: ["中文", "英文", "长篇", "短视频", "读者群", "内容生产线", "翻译"],
    invariants: [
      "保护已验证的原创母体，不立即建立第二条完整生产线",
      "只改编已有深度阅读、收藏、转述或订阅证据的命题，并按新媒介重构",
      "实验有批次或时间边界，以目标读者深度反馈而非泛流量决定继续"
    ],
    forbidden: ["逐句机械翻译或截取摘要", "用播放量或泛流量替代目标读者质量"]
  },
  {
    id: "revocable-ownership",
    title: "可撤回主理权",
    priority: 50,
    keywords: ["合作者", "合伙人", "审美", "品牌定位", "拍板", "产品线", "商业表达"],
    invariants: [
      "每个作品、产品或决策域有清楚的最终责任人",
      "争议前写明目标用户、价值或体验承诺与不可触碰边界",
      "授权可撤回，验证依据成品和目标用户反馈"
    ],
    forbidden: ["永久把全部权力交给同一人", "以无截止共识会议反复重开决定"]
  },
  {
    id: "accessible-release-gate",
    title: "无障碍发布门槛",
    priority: 110,
    keywords: ["键盘用户", "屏幕阅读器", "无障碍", "焦点", "核心流程", "结账页"],
    invariants: [
      "目标用户无法完成核心流程属于发布阻断，日期和用户占比不能豁免",
      "延期或关闭该流程，冻结非必要变更并修复最短核心路径",
      "发布前由独立人员用纯键盘或屏幕阅读器验收，并加入回归保护"
    ],
    forbidden: ["核心流程仍不可用时先上线后补", "失败后仍按原日期上线", "用人工客服替代核心可访问性"]
  },
  {
    id: "verified-recovery",
    title: "恢复先于删除",
    priority: 110,
    keywords: ["备份", "恢复", "删除生产", "历史数据", "加密密钥", "存储费用", "磁盘"],
    invariants: [
      "备份对象与解密材料必须独立于生产故障域",
      "不可再生数据只有在隔离环境实际恢复并抽查成功后才能删除",
      "删除按清单小批执行且有停止点；先用只读、停写或清理可再生物争取空间"
    ],
    forbidden: ["把上传、复制或校验和完成等同可恢复", "在密钥或备份仍是单点时删除唯一数据", "把同盘副本称为可靠回滚"]
  }
];

const TIME_ALLOCATION = /(?:时间|工时|执行)预算|(?:\d+(?:\.\d+)?|[一二两三四五六七八九十百半]+)\s*(?:个?小时|分钟|工作日|天|周|个月|个?(?:上午|下午|晚上|早上|夜晚))/u;
const WORK_OBJECT = /项目|工具|插件|开源库|网站|页面|功能|课程|产品|作品|发布|补测试|issue|交付/u;
const WORK_ACTION = /维护|处理|验证|试做|开始|发布|修整|开发|补测试|交付/u;
const ALLOCATION_DECISION = /分配|兼顾|平衡|排期|优先|先后顺序|交付顺序|同时维护|集中验证|只能选|还是/u;

type EvidenceRule = readonly [object: RegExp, decision: RegExp];
const POLICY_EVIDENCE: Record<string, EvidenceRule> = {
  "survival-cash": [
    /现金流|现金窗口|资金(?:只|还)剩|(?:团队|公司)(?=[^，,]{0,12}(?:资金|现金))|付费客户|(?:大|首个)客户|销售/u,
    /只剩|还剩|只够|付费|预付款|定金|融资|收入|希望.{0,8}先做|缩.*消耗|转化|先接|签约|换专属/u
  ],
  "bounded-abstraction": [/客户|签约|订单|采购/u, /接入|集成|连接器|插件平台|sdk|专属(?:报表|字段)|定制/u],
  "consent-privacy": [
    /隐私|遥测|埋点|行为追踪|行为分析|session replay|个人效率监控|键盘活动|录屏|窗口与键盘/u,
    /采集|监控|开启|定位|增加|收集|拒绝|同意|默认|绩效|没有合法|全天|增长漏斗/u
  ],
  "employee-monitoring": [
    /员工|公司|董事会|企业设备|办公设备|绩效|窗口与键盘活动/u,
    /个人效率|个人行为|键盘活动|窗口活动|窗口与键盘|监控员工|员工监控|(?:追踪|采集)[^，,]{0,12}浏览历史|行为采样|(?:电脑|设备|窗口)[^，,]{0,8}录屏|采集(?=窗口与键盘活动)/u
  ],
  "contain-security-risk": [
    /跨租户|越租户|权限泄漏|数据污染|数据错乱|安全漏洞|审计日志|账本/u,
    /泄漏|错乱|污染|停写|暂停|冻结|发布|回放|排查|调查|写入|复现|补抓|交付/u
  ],
  "authoritative-decision": [
    /缓存|快取|权威服务|角色权限|权限查询|权限(?=隔离)|访问控制|撤权后|余额|库存|读(?:取)?接口|读请求|读端点/u,
    /撤权|回源|失效|写入|隔离|强一致|陈旧|校验|延迟|增加(?=缓存)|接受.*不一致/u
  ],
  "safe-compatibility": [
    /客户端|旧设备|旧协议|扫码枪|schema|请求签名/u,
    /兼容|迁移|升级|鉴权|写入|弃用|并行|过渡|签名/u
  ],
  "bounded-attention": [WORK_OBJECT, ALLOCATION_DECISION],
  "downstream-distribution": [
    /中文|英文|长篇|长文|短视频|播客|翻译/u,
    /受众|读者|扩大影响|分发|生产线|增长|转化|订阅/u
  ],
  "revocable-ownership": [
    /作品|品牌|新品|产品线|主理人|团队.{0,8}责任人|负责的范围|商业表达|试销结果/u,
    /拍板|责任人|授权|负责的范围|决定|共识|冲突|拆分/u
  ],
  "accessible-release-gate": [
    /键盘用户|纯键盘|屏幕阅读器|无障碍|焦点/u,
    /发布|上线|阻断|核心流程|结账页|退款申请|无法完成|开放购买/u
  ],
  "verified-recovery": [
    /生产(?:数据|库|历史数据|机|系统|环境|快照)|数据库|异地快照|快照(?=(?:能|可)(?:以)?(?:恢复|还原))|灾备|对象存储|数据中心|磁带|密钥/u,
    /备份|恢复|还原|删除|归档|回滚|回收/u
  ]
};

function literalSentences(fragment: string) {
  return fragment.split(/[。！？!?；;\n]+/u).map(sentence => sentence
    .replace(/(?:仿佛|如同|犹如|好似|好像|(?:^|(?<=[我你他她里就很总]))像|像(?=一个|一套|一台|一部|是|个))[^，,]+/gu, "")
    .replace(/[\p{Script=Han}\w]{1,12}(?:一样|似的)(?:的[^，,]{0,4})?/gu, "")
    .trim()).filter(Boolean);
}

const ELLIPTICAL_DECISION = /^(?:(?:要不要|是否(?:应该)?|如何|能否|能不能|该不该|什么时候|多久)(?:先|再)?(?:备份|恢复|还原|回源|撤权|弃用|升级|暂停|停写|删除|归档|回滚)|(?:本次|这次)?(?:应该)?由谁(?:拍板|决定))$/u;
function literalDecisionSpans(sentences: string[]) {
  return sentences.flatMap(sentence => {
    const clauses = sentence.split(/[,，]+/u).map(value => value.trim()).filter(Boolean);
    return clauses.flatMap((clause, index) => {
      const firstDecision = clause.split("、", 1)[0].trim();
      return index > 0 && ELLIPTICAL_DECISION.test(firstDecision)
        ? [clause, `${clauses[index - 1]}${firstDecision}`] : [clause];
    });
  });
}

function occurrences(pattern: RegExp, span: string) {
  return [...span.matchAll(new RegExp(pattern.source, "gu"))];
}

function hasIndependentEvidence(span: string, [object, decision]: EvidenceRule) {
  const decisions = occurrences(decision, span);
  return occurrences(object, span).some(target => decisions.some(action =>
    action[0] !== target[0] &&
    (target.index + target[0].length <= action.index || action.index + action[0].length <= target.index)));
}

function hasTimeAllocation(sentences: string[], span: string) {
  const workIsTimed = TIME_ALLOCATION.test(span) || sentences.some(value =>
    TIME_ALLOCATION.test(value) && WORK_OBJECT.test(value) &&
    (/一边[^。]{0,40}一边|(?:能|可)做|投入|用于/u.test(value) || hasIndependentEvidence(value, [WORK_OBJECT, WORK_ACTION])));
  if (!workIsTimed) return false;
  // Each side of a trade-off must identify work to do. An explicit delivery order can do so without “还是”.
  const alternatives = span.split(/还是|抑或/u);
  if (alternatives.length > 1) {
    if (alternatives.every(choice => hasIndependentEvidence(choice, [WORK_OBJECT, WORK_ACTION]))) return true;
    return /同时维护/.test(span) && /验证一个方向/.test(span) &&
      sentences.some(value => /一边[^。]{0,40}一边/u.test(value) && occurrences(WORK_OBJECT, value).length >= 2);
  }
  return hasIndependentEvidence(span, POLICY_EVIDENCE["bounded-attention"]) && occurrences(WORK_ACTION, span).length >= 2;
}

export function retrieveDialecticPolicyCards(input: string | readonly string[]): DialecticPolicyCard[] {
  const fragments = (typeof input === "string" ? [input] : input).map(fragment => {
    const sentences = literalSentences(fragment.trim().toLowerCase());
    return { sentences, spans: literalDecisionSpans(sentences) };
  });

  return DIALECTIC_POLICY_CARDS.map((card) => {
    const evidence = POLICY_EVIDENCE[card.id];
    const matches = fragments.flatMap(({ sentences, spans }) => card.id === "bounded-attention"
      ? sentences.filter(sentence => hasTimeAllocation(sentences, sentence))
      : spans.filter(span => hasIndependentEvidence(span, evidence)));
    if (!matches.length) return { card, score: 0 };
    const score = card.keywords.reduce(
      (sum, keyword) => sum + Number(matches.some(span => span.includes(keyword.toLowerCase()))),
      0
    );
    return { card, score: evidence.length + score };
  })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        Number(right.card.priority >= HIGH_RISK_POLICY_PRIORITY) -
          Number(left.card.priority >= HIGH_RISK_POLICY_PRIORITY) ||
        right.score - left.score ||
        right.card.priority - left.card.priority ||
        left.card.id.localeCompare(right.card.id)
    )
    .slice(0, MAX_DIALECTIC_POLICY_CARDS)
    .map((entry) => entry.card);
}

export function isHighRiskDialectic(cards: DialecticPolicyCard[]): boolean {
  return cards.some((card) => card.priority >= HIGH_RISK_POLICY_PRIORITY);
}

export function getDialecticRuleChecks(cards: DialecticPolicyCard[]): DialecticRuleCheck[] {
  return cards.flatMap((card) => [
    ...card.invariants.map((rule, index) => ({
      id: `${card.id}:I${index + 1}`,
      kind: "invariant" as const,
      rule
    })),
    ...card.forbidden.map((rule, index) => ({
      id: `${card.id}:F${index + 1}`,
      kind: "forbidden" as const,
      rule
    }))
  ]);
}

export function formatDialecticPolicyCards(cards: DialecticPolicyCard[]): string {
  if (!cards.length) {
    return "未检索到专门规则卡：只使用题设明示约束，并保守排除题设外假设。";
  }

  return cards
    .map(
      (card) =>
        `规则卡【${card.title}】\n必须保持：${card.invariants.join("；")}\n禁止动作：${card.forbidden.join("；")}`
    )
    .join("\n\n");
}
