"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  RoundtableCommand,
  RoundtableResponse,
  RoundtableRound,
  RoundtableState
} from "@/features/roundtable/types";
import styles from "./RoundtableWorkbench.module.css";

const STORAGE_KEY = "anicca:roundtable:v1";

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `rt_${crypto.randomUUID()}`;
  }

  return `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("openai_api_key_missing")) {
    return "当前环境没有配置 OPENAI_API_KEY，圆桌请求还不能发给模型。";
  }

  if (message.includes("invalid_model_output")) {
    return "模型这轮没有按圆桌 JSON 契约返回，状态没有更新。";
  }

  if (message.includes("provider_auth_failed")) {
    return "模型服务认证失败，请检查 OPENAI_API_KEY 或代理配置。";
  }

  if (message.includes("provider_unreachable")) {
    return "模型服务暂时不可达，请检查网络或 baseURL。";
  }

  if (message.includes("provider_rate_limited")) {
    return "模型服务触发限流，请稍后再试或切换到负载更低的模型。";
  }

  if (message.includes("provider_overloaded")) {
    return "模型服务负载已满，请稍后再试或临时切换到其他模型服务。";
  }

  return "这轮圆桌没有完成，当前状态没有被覆盖。";
}

async function postRoundtable(body: Record<string, unknown>): Promise<RoundtableResponse> {
  const response = await fetch("/api/roundtable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof data?.error === "string" ? data.error : `http_${response.status}`;
    const details = typeof data?.details === "string" ? data.details : "";
    throw new Error(details ? `${error}: ${details}` : error);
  }

  return data as RoundtableResponse;
}

function RoundBlock({ round, index }: { round: RoundtableRound; index: number }) {
  return (
    <article className={styles.round}>
      <header className={styles.roundHeader}>
        <small>第 {index + 1} 轮</small>
        <h3>{round.guidingQuestion}</h3>
      </header>

      <div className={styles.utterances}>
        {round.utterances.map((utterance, utteranceIndex) => (
          <section className={styles.utterance} key={`${utterance.speaker}-${utteranceIndex}`}>
            <div className={styles.utteranceHeader}>
              <strong>{utterance.speaker}</strong>
              <span className={styles.action}>【{utterance.action}】</span>
            </div>
            <p>{utterance.text}</p>
            <span className={styles.summary}>简言之：{utterance.summary}</span>
          </section>
        ))}
      </div>

      <div className={styles.synthesis}>
        <div>
          <strong>核心争议：</strong>
          <span> {round.coreTension}</span>
        </div>
        <pre className={styles.pre}>{round.framework}</pre>
        <div>
          <strong>下一问：</strong>
          <span> {round.nextQuestion}</span>
        </div>
      </div>
    </article>
  );
}

export default function RoundtablePage() {
  const [topic, setTopic] = useState("");
  const [state, setState] = useState<RoundtableState | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [pending, setPending] = useState<RoundtableCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLabUi, setShowLabUi] = useState(false);

  useEffect(() => {
    setShowLabUi(new URLSearchParams(window.location.search).get("lab") === "1");

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as RoundtableState;
      setState(parsed);
      setTopic(parsed.topic);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const runCommand = async (command: RoundtableCommand) => {
    if (pending) {
      return;
    }

    const cleanTopic = topic.trim();
    const cleanParticipantName = participantName.trim();
    if (command === "start" && !cleanTopic) {
      setError("先输入一个议题。");
      return;
    }

    if (command !== "start" && !state) {
      setError("先启动一场圆桌。");
      return;
    }

    if (command === "addParticipant" && !cleanParticipantName) {
      setError("先输入要引入的人物姓名。");
      return;
    }

    setPending(command);
    setError(null);

    try {
      const response = await postRoundtable({
        requestId: createRequestId(),
        command,
        topic: command === "start" ? cleanTopic : undefined,
        state: command === "start" ? undefined : state,
        participantName: command === "addParticipant" ? cleanParticipantName : undefined
      });
      setState(response.state);
      setTopic(response.state.topic);
      if (command === "addParticipant") {
        setParticipantName("");
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPending(null);
    }
  };

  const handleStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCommand("start");
  };

  const reset = () => {
    setState(null);
    setTopic("");
    setParticipantName("");
    setError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const active = state?.status === "active";
  const concluded = state?.status === "concluded";

  if (!showLabUi) {
    return (
      <main className={`${styles.shell} ${styles.handoffShell}`}>
        <section className={styles.handoffPanel} aria-labelledby="roundtable-handoff-title">
          <p className={styles.eyebrow}>Roundtable Theater</p>
          <h1 id="roundtable-handoff-title">圆桌已经并入对话场。</h1>
          <p>
            旁路讨论会贴在当前问题谱系旁边，不再把你带进独立后台页。
          </p>
          <a className={styles.navLink} href="/dialogue">
            回到对话场
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.layout}>
        <aside className={styles.side}>
          <header className={`${styles.panel} ${styles.header}`}>
            <p className={styles.eyebrow}>Anicca Roundtable</p>
            <h1 className={styles.title}>圆桌讨论</h1>
            <p className={styles.copy}>
              真实代表人物围绕同一议题交锋，主持人每轮提炼核心争议和下一层问题。
            </p>
            <a className={styles.navLink} href="/dialogue">
              返回对话场
            </a>
          </header>

          <form className={`${styles.panel} ${styles.form}`} onSubmit={handleStart}>
            <label className={styles.label}>
              议题
              <textarea
                className={styles.textarea}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="例如：AI 是否拥有真正的创造力？"
                disabled={Boolean(pending)}
              />
            </label>
            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit" disabled={Boolean(pending)}>
                {pending === "start" ? "启动中..." : state ? "重开圆桌" : "启动圆桌"}
              </button>
              {state ? (
                <button className={styles.secondaryButton} type="button" onClick={reset} disabled={Boolean(pending)}>
                  清空
                </button>
              ) : null}
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </form>

          <section className={`${styles.panel} ${styles.section}`}>
            <div className={styles.sectionTitle}>
              <h2>参会者</h2>
              <small>{state?.participants.length || 0} 人</small>
            </div>
            <div className={styles.participants}>
              {state?.participants.length ? (
                state.participants.map((participant) => (
                  <article className={styles.participant} key={participant.name}>
                    <strong>
                      {participant.name}
                      <span>{participant.mbti}</span>
                    </strong>
                    <p>{participant.stance}</p>
                    <p>{participant.reason}</p>
                  </article>
                ))
              ) : (
                <p className={styles.copy}>启动后会自动提议 3-5 位代表人物。</p>
              )}
            </div>
          </section>
        </aside>

        <section className={styles.main}>
          <div className={`${styles.panel} ${styles.statusBar}`}>
            <p>
              <strong>{state?.topic || "未开始"}</strong>
              {state?.nextQuestion ? ` ｜ 下一问：${state.nextQuestion}` : ""}
            </p>
            <div className={styles.buttonRow}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void runCommand("continue")}
                disabled={!active || Boolean(pending)}
              >
                {pending === "continue" ? "推进中..." : "推进一轮"}
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void runCommand("deepen")}
                disabled={!active || Boolean(pending)}
              >
                {pending === "deepen" ? "深挖中..." : "深挖一轮"}
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={() => void runCommand("conclude")}
                disabled={!active || Boolean(pending)}
              >
                {pending === "conclude" ? "总结中..." : "结束并总结"}
              </button>
            </div>
          </div>

          <div className={`${styles.panel} ${styles.transcript}`}>
            {state?.rounds.length ? (
              <div className={styles.rounds}>
                {state.rounds.map((round, index) => (
                  <RoundBlock round={round} index={index} key={`${round.guidingQuestion}-${index}`} />
                ))}

                {concluded ? (
                  <section className={styles.conclusion}>
                    <h3>全局总结</h3>
                    <p>{state.conclusion}</p>
                    {state.knowledgeNetwork ? <pre className={styles.pre}>{state.knowledgeNetwork}</pre> : null}
                    {state.openQuestions?.length ? (
                      <ul className={styles.questions}>
                        {state.openQuestions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : (
              <div className={styles.empty}>输入议题后启动圆桌。</div>
            )}
          </div>

          <form
            className={`${styles.panel} ${styles.form}`}
            onSubmit={(event) => {
              event.preventDefault();
              void runCommand("addParticipant");
            }}
          >
            <label className={styles.label}>
              引入新人物
              <input
                className={styles.input}
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                placeholder="例如：汉娜·阿伦特"
                disabled={!active || Boolean(pending)}
              />
            </label>
            <div className={styles.buttonRow}>
              <button className={styles.secondaryButton} type="submit" disabled={!active || Boolean(pending)}>
                {pending === "addParticipant" ? "引入中..." : "引入新人物"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
