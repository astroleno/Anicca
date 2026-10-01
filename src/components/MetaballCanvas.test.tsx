import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { createDeferred } from "../../tests/deferred";
import MetaballCanvas from "./MetaballCanvas";

const init = vi.hoisted(() => vi.fn());
vi.mock("@/utils/webgpuInit", () => ({ initWebGPU: init }));
vi.mock("@/shaders/metaball_compute.wgsl", () => ({ default: "" }));
vi.mock("@/shaders/shade_fullscreen.wgsl", () => ({ default: "" }));
vi.mock("./MetaballLabels", () => ({ default: () => null }));
vi.mock("./GSAPChatInput", () => ({ default: () => null }));

it("cleans up both late initializations when StrictMode mounts then unmounts", async () => {
  const first = createDeferred<unknown>(), second = createDeferred<unknown>();
  init.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const firstDevice = { destroy: vi.fn(), createShaderModule: vi.fn() };
  const secondDevice = { destroy: vi.fn(), createShaderModule: vi.fn() };
  const firstContext = { unconfigure: vi.fn() }, secondContext = { unconfigure: vi.fn() };
  const { unmount } = render(<StrictMode><MetaballCanvas /></StrictMode>);
  expect(init).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => {
    first.resolve({ device: firstDevice, context: firstContext });
    second.resolve({ device: secondDevice, context: secondContext });
    await Promise.all([first.promise, second.promise]);
  });
  for (const device of [firstDevice, secondDevice]) {
    expect(device.destroy).toHaveBeenCalledOnce();
    expect(device.createShaderModule).not.toHaveBeenCalled();
  }
  expect(firstContext.unconfigure).toHaveBeenCalledOnce();
  expect(secondContext.unconfigure).toHaveBeenCalledOnce();
});
