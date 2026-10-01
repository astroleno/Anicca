import { ResourceScope } from "./resourceScope";

it("releases partial setup in reverse order exactly once, even if one release fails", () => {
  const calls: number[] = [];
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const scope = new ResourceScope();
  scope.add(() => calls.push(1));
  scope.add(() => { calls.push(2); throw Error("already lost"); });
  scope.add(() => calls.push(3));
  scope.dispose(); scope.dispose();
  expect(calls).toEqual([3, 2, 1]);
  scope.add(() => calls.push(4));
  expect(calls).toEqual([3, 2, 1, 4]);
  warning.mockRestore();
});
