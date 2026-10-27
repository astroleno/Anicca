import { act, renderHook } from "@testing-library/react";
import { LIQUID_RENDERER_KEY, type LiquidRendererMode } from "./liquid/preference";
import { useLiquidRenderer } from "./useLiquidRenderer";

function device(coarse = false, narrow = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (query.includes("pointer: coarse") && coarse) || (query.includes("max-width: 640px") && narrow)
  }));
}

beforeEach(() => { localStorage.clear(); device(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  ["desktop", false, false, "tsl"],
  ["wide touch device", true, false, "original"],
  ["phone layout", false, true, "original"]
] as const)("uses the %s default without saving an explicit choice", (_name, coarse, narrow, expected) => {
  device(coarse, narrow);
  const first = renderHook(() => useLiquidRenderer());
  expect(first.result.current.rendererMode).toBe(expected);
  expect(localStorage.getItem(LIQUID_RENDERER_KEY)).toBeNull();
  first.unmount();
  expect(renderHook(() => useLiquidRenderer()).result.current.rendererMode).toBe(expected);
});

it.each([
  [false, "original"],
  [true, "tsl"],
  [true, "tsl-webgl"]
] as const)("restores explicit %s / %s regardless of the device default", (mobile, saved) => {
  device(mobile, mobile);
  localStorage.setItem(LIQUID_RENDERER_KEY, saved);
  expect(renderHook(() => useLiquidRenderer()).result.current.rendererMode).toBe(saved);
});

it("ignores an invalid preference while preserving unrelated workspace data", () => {
  localStorage.setItem(LIQUID_RENDERER_KEY, "old-renderer");
  localStorage.setItem("anicca_workspace_active_v1", "my-workspace");
  expect(renderHook(() => useLiquidRenderer()).result.current.rendererMode).toBe("tsl");
  expect(localStorage.getItem("anicca_workspace_active_v1")).toBe("my-workspace");
});

it("keeps a manual choice through resize and restores it on a later visit", () => {
  const first = renderHook(() => useLiquidRenderer());
  act(() => first.result.current.selectRenderer("tsl-webgl"));
  device(true, true);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(first.result.current.rendererMode).toBe("tsl-webgl");
  expect(localStorage.getItem(LIQUID_RENDERER_KEY)).toBe("tsl-webgl");
  first.unmount();
  expect(renderHook(() => useLiquidRenderer()).result.current.rendererMode).toBe("tsl-webgl");
});

it.each([false, true])("returns to the device default when another tab clears the choice (mobile=%s)", mobile => {
  device(mobile, mobile);
  const { result } = renderHook(() => useLiquidRenderer());
  const update = (key: string | null, value: LiquidRendererMode | null) => act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  });
  update(LIQUID_RENDERER_KEY, "tsl-webgl");
  expect(result.current.rendererMode).toBe("tsl-webgl");
  update(LIQUID_RENDERER_KEY, null);
  expect(result.current.rendererMode).toBe(mobile ? "original" : "tsl");
  update(LIQUID_RENDERER_KEY, "tsl-webgl");
  update(null, null);
  expect(result.current.rendererMode).toBe(mobile ? "original" : "tsl");
});

it("retains the desktop default and manual switching when storage is unavailable", () => {
  vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("denied"); });
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
  const { result } = renderHook(() => useLiquidRenderer());
  expect(result.current.rendererMode).toBe("tsl");
  act(() => result.current.selectRenderer("original"));
  expect(result.current.rendererMode).toBe("original");
});

it("uses original if media capabilities are unavailable", () => {
  vi.stubGlobal("matchMedia", undefined);
  expect(renderHook(() => useLiquidRenderer()).result.current.rendererMode).toBe("original");
});
