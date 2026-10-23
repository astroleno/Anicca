import { readDialogueViewport } from "./platform";

describe("dialogue platform viewport", () => {
  it("derives the usable viewport and keyboard inset", () => {
    expect(readDialogueViewport({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: {
        width: 390,
        height: 520,
        offsetTop: 0
      } as VisualViewport
    })).toEqual({
      width: 390,
      height: 520,
      offsetTop: 0,
      keyboardInset: 324
    });
  });

  it("retains the layout viewport during native pinch zoom without falsely opening keyboard mode", () => {
    expect(readDialogueViewport({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { width: 195, height: 422, offsetTop: 150, scale: 2 } as VisualViewport
    })).toEqual({ width: 390, height: 844, offsetTop: 0, keyboardInset: 0 });
  });
});
