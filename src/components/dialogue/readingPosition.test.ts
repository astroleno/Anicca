import { captureReadingPosition, restoreReadingPosition } from "./readingPosition";

it("keeps a character on the same visible line when a long single paragraph reflows", () => {
  const panel = document.createElement("section"), passage = document.createElement("div"), paragraph = document.createElement("p");
  passage.dataset.seedPassage = ""; paragraph.dataset.passageStart = "0"; paragraph.textContent = "内容".repeat(1000);
  passage.append(paragraph); panel.append(passage); document.body.append(panel);
  let columns = 40;
  panel.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  paragraph.getBoundingClientRect = () => new DOMRect(0, 100 - panel.scrollTop, 400, 2000 / columns * 20);
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value(this: Range) {
    return new DOMRect(0, 100 + Math.floor(this.startOffset / columns) * 20 - panel.scrollTop, 10, 20);
  } });
  try {
    panel.scrollTop = 450;
    const before = captureReadingPosition(panel); expect(before.anchor?.offset).toBeGreaterThan(0);
    columns = 20; restoreReadingPosition(panel, before);
    expect(panel.scrollTop).toBeGreaterThan(before.scrollTop);
    expect(captureReadingPosition(panel).anchor).toEqual(before.anchor);
  } finally {
    panel.remove();
    if (descriptor) Object.defineProperty(Range.prototype, "getBoundingClientRect", descriptor);
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  }
});
