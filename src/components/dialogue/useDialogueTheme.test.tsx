import { act, renderHook } from "@testing-library/react";
import { DIALOGUE_THEME_KEY, useDialogueTheme } from "./useDialogueTheme";

let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
beforeEach(()=>{
  localStorage.clear();
  media={matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()};
  vi.stubGlobal("matchMedia",()=>media);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it("preserves light as the existing default and restores an explicit appearance on remount",()=>{
  const first=renderHook(()=>useDialogueTheme());
  expect(first.result.current.theme).toBe("light");
  act(()=>first.result.current.selectTheme("dark"));
  expect(localStorage.getItem(DIALOGUE_THEME_KEY)).toBe("dark");
  first.unmount();
  expect(renderHook(()=>useDialogueTheme()).result.current.theme).toBe("dark");
});

it("follows system changes only when system is selected",()=>{
  const {result}=renderHook(()=>useDialogueTheme());
  act(()=>result.current.selectTheme("system"));
  expect(result.current.theme).toBe("dark");
  const update=media.addEventListener.mock.calls[0][1] as ()=>void;
  act(()=>{media.matches=false;update();});
  expect(result.current.theme).toBe("light");
  act(()=>{result.current.selectTheme("dark");update();});
  expect(result.current.theme).toBe("dark");
});

it("keeps switching usable if preference storage is denied",()=>{
  vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new Error("denied");});
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("denied");});
  const {result}=renderHook(()=>useDialogueTheme());
  act(()=>result.current.selectTheme("dark"));
  expect(result.current.theme).toBe("dark");
});
