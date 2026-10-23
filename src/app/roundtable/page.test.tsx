import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoundtablePage from "./page";

const storageKey = "anicca:roundtable:v1";
const saved = JSON.stringify({ topic: "保留讨论", participants: [], rounds: [], currentQuestion: "保留讨论",
  nextQuestion: "接着讨论什么？", lastCoreTension: "探索与确定", status: "active" });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(storageKey, saved);
  window.history.replaceState({}, "", "/roundtable?lab=1");
});
afterEach(() => window.history.replaceState({}, "", "/dialogue"));

it("retains the saved roundtable until confirmed and allows keeping it", async () => {
  const user = userEvent.setup();
  render(<RoundtablePage />);
  await user.click(await screen.findByRole("button", { name: "清空" }));
  expect(localStorage.getItem(storageKey)).toBe(saved);
  await user.click(screen.getByRole("button", { name: "保留圆桌" }));
  expect(localStorage.getItem(storageKey)).toBe(saved);
  await user.click(screen.getByRole("button", { name: "清空" }));
  await user.click(screen.getByRole("button", { name: "确认清空圆桌" }));
  expect(localStorage.getItem(storageKey)).toBeNull();
  const topic = screen.getByPlaceholderText("例如：AI 是否拥有真正的创造力？");
  expect(topic).toHaveValue("");
  await waitFor(() => expect(topic).toHaveFocus());
});

it("requires a new confirmation after the topic is edited", async () => {
  const user = userEvent.setup();
  render(<RoundtablePage />);
  await user.click(await screen.findByRole("button", { name: "清空" }));
  await user.type(screen.getByPlaceholderText("例如：AI 是否拥有真正的创造力？"), "，补充");
  expect(screen.queryByRole("button", { name: "确认清空圆桌" })).not.toBeInTheDocument();
  expect(localStorage.getItem(storageKey)).toBe(saved);
});
