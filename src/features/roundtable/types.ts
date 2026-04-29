export type RoundtableAction = "陈述" | "质疑" | "补充" | "反驳" | "修正" | "综合";

export type RoundtableCommand = "start" | "continue" | "deepen" | "addParticipant" | "conclude";

export type RoundtableParticipant = {
  name: string;
  mbti: string;
  stance: string;
  reason: string;
};

export type RoundtableUtterance = {
  speaker: string;
  action: RoundtableAction;
  text: string;
  summary: string;
};

export type RoundtableRound = {
  guidingQuestion: string;
  utterances: RoundtableUtterance[];
  coreTension: string;
  framework: string;
  nextQuestion: string;
};

export type RoundtableStatus = "active" | "concluded";

export type RoundtableState = {
  topic: string;
  participants: RoundtableParticipant[];
  rounds: RoundtableRound[];
  currentQuestion: string;
  nextQuestion: string;
  lastCoreTension: string;
  status: RoundtableStatus;
  conclusion?: string;
  knowledgeNetwork?: string;
  openQuestions?: string[];
};

export type RoundtablePayload = {
  requestId: string;
  topic?: string;
  command: RoundtableCommand;
  state?: RoundtableState;
  participantName?: string;
  model?: string;
};

export type RoundtableResponse = {
  requestId: string;
  state: RoundtableState;
  round?: RoundtableRound;
};
