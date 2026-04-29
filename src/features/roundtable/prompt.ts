import { RoundtableCommand, RoundtableState } from "@/features/roundtable/types";

function serializeState(state: RoundtableState): string {
  return JSON.stringify(state, null, 2);
}

function commandInstruction(command: RoundtableCommand, participantName?: string): string {
  if (command === "start") {
    return [
      "启动圆桌。",
      "先为议题选择 3-5 位真实历史或当代人物，必须形成张力网络，并至少包含一位领域外的意外视角。",
      "本轮必须从统一核心概念的定义问题开始。"
    ].join("\n");
  }

  if (command === "continue") {
    return "接受上一轮主持人提出的下一层问题，继续推进一轮动态发言。";
  }

  if (command === "deepen") {
    return "不要推进新问题，围绕上一轮核心争议继续深挖一轮。";
  }

  if (command === "addParticipant") {
    return `引入新人物「${participantName || ""}」。先补充此人的参会资料，再请其就当前问题表态，并让至少两位原参会者回应。`;
  }

  return [
    "结束讨论。",
    "做全局总结，生成完整知识网络 ASCII 图，并列出未解决的开放问题。"
  ].join("\n");
}

export function buildRoundtablePrompt(input: {
  command: RoundtableCommand;
  topic?: string;
  state?: RoundtableState;
  participantName?: string;
}): string {
  const responseSchema =
    input.command === "conclude"
      ? {
          participants: [
            {
              name: "真实人物姓名",
              mbti: "INTJ",
              stance: "一句话核心立场",
              reason: "选择理由"
            }
          ],
          conclusion: "全局总结",
          knowledgeNetwork: "ASCII 知识网络图",
          openQuestions: ["开放问题"],
          status: "concluded"
        }
      : {
          participants: [
            {
              name: "真实人物姓名",
              mbti: "INTJ",
              stance: "一句话核心立场",
              reason: "选择理由"
            }
          ],
          round: {
            guidingQuestion: "本轮引导问题",
            utterances: [
              {
                speaker: "人物姓名",
                action: "陈述",
                text: "发言内容",
                summary: "一句话简言之"
              }
            ],
            coreTension: "本轮最深的核心争议点",
            framework: "ASCII 思考框架图",
            nextQuestion: "下一层引导问题"
          },
          status: "active"
        };

  const sections = [
    "你是 Anicca 的圆桌讨论引擎，一位以求真为目标的理性主持人。",
    "参考框架：李继刚「圆桌讨论」。核心是多位真实代表人物的即时响应式辩证讨论、主持人元认知综述、ASCII 思考框架、逐轮深入。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    `JSON schema 示例:\n${JSON.stringify(responseSchema, null, 2)}`,
    "硬性规则：",
    "- 参会者必须是真实历史或当代人物，不得使用虚构角色。",
    "- 每位人物必须有 name、mbti、stance、reason。",
    "- 每段 utterance 必须回应前文或当前 guidingQuestion，action 只能是：陈述、质疑、补充、反驳、修正、综合。",
    "- 每段 utterance 必须有 summary，对应原框架的「简言之」。",
    "- framework 必须是 ASCII 图，用矩阵、光谱、因果链、拓扑图或树形中最贴切的一种表达结构，不要只复述内容。",
    "- 主持人每轮只追一条最深裂缝，避免面面俱到。",
    `当前操作:\n${commandInstruction(input.command, input.participantName)}`,
    input.topic ? `议题:\n${input.topic}` : "",
    input.state ? `既有圆桌状态:\n${serializeState(input.state)}` : ""
  ];

  return sections.filter(Boolean).join("\n\n");
}
