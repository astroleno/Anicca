import type { ReadingPosition } from "@/lib/persist/readingState";

function characterRect(element: Element, offset: number): DOMRect | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text) {
    const length = text.textContent?.length || 0;
    if (offset < length) {
      const range = document.createRange();
      range.setStart(text, offset); range.setEnd(text, offset + 1);
      return typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
    }
    offset -= length; text = walker.nextNode();
  }
  return null;
}

export function captureReadingPosition(panel: HTMLElement): ReadingPosition {
  const position: ReadingPosition = { scrollTop: panel.scrollTop };
  const box = panel.getBoundingClientRect(), top = box.top + 20;
  if (!box.height) return position;
  for (const passage of panel.querySelectorAll<HTMLElement>("[data-seed-passage] [data-passage-start]")) {
    const bounds = passage.getBoundingClientRect(), length = passage.textContent?.length || 0;
    if (!length || bounds.bottom < top || bounds.top >= box.bottom) continue;
    // Find a character on the first visible line, even when the entire text is
    // one paragraph. A paragraph-only anchor loses its place after reflow.
    let low = 0, high = length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2), rect = characterRect(passage, mid);
      if (!rect) return position;
      if (rect.bottom < top) low = mid + 1; else high = mid;
    }
    const rect = characterRect(passage, low);
    if (rect?.height) position.anchor = { offset: Number(passage.dataset.passageStart) + low, top: rect.top - box.top };
    break;
  }
  return position;
}

export function restoreReadingPosition(panel: HTMLElement, position: ReadingPosition) {
  panel.scrollTop = position.scrollTop;
  if (!position.anchor) return;
  const { offset, top } = position.anchor;
  for (const passage of panel.querySelectorAll<HTMLElement>("[data-seed-passage] [data-passage-start]")) {
    const start = Number(passage.dataset.passageStart), length = passage.textContent?.length || 0;
    if (offset < start || offset >= start + length) continue;
    const rect = characterRect(passage, offset - start);
    if (rect?.height) panel.scrollTop += rect.top - panel.getBoundingClientRect().top - top;
    break;
  }
}
