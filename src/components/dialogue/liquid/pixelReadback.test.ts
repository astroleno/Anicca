import { AsyncPixelReadback } from "./pixelReadback";

export function createReadbackGl() {
  return {
    PIXEL_PACK_BUFFER: 1, PIXEL_PACK_BUFFER_BINDING: 2, STREAM_READ: 3, RGBA: 4, UNSIGNED_BYTE: 5,
    SYNC_GPU_COMMANDS_COMPLETE: 6, TIMEOUT_EXPIRED: 7, ALREADY_SIGNALED: 8, CONDITION_SATISFIED: 9, WAIT_FAILED: 10,
    createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(), bufferData: vi.fn(), readPixels: vi.fn(),
    fenceSync: vi.fn(() => ({})), flush: vi.fn(), clientWaitSync: vi.fn(() => 7),
    getBufferSubData: vi.fn((_target: number,_offset: number,data: Uint8Array) => data.set(Array.from({length:data.length},(_,i)=>i%4===3?255:20))),
    getParameter: vi.fn(() => null), deleteSync: vi.fn(), deleteBuffer: vi.fn()
  };
}

describe("non-blocking caption readback",()=>{
  it("queues byte offsets, polls with zero timeout, and only reads a completed fence",()=>{
    const gl=createReadbackGl(),reader=new AsyncPixelReadback<string>(gl as unknown as WebGL2RenderingContext);
    expect(reader.submit([{x:4,y:8},{x:12,y:16}],"light",100)).toBe(true);
    expect(gl.readPixels.mock.calls.map(call=>call[6])).toEqual([0,4]);
    expect(reader.submit([{x:1,y:1}],"new",110)).toBe(false);
    expect(reader.poll(116)).toBeNull();
    expect(gl.clientWaitSync).toHaveBeenLastCalledWith(expect.any(Object),0,0);
    expect(gl.getBufferSubData).not.toHaveBeenCalled();
    gl.clientWaitSync.mockReturnValue(gl.CONDITION_SATISFIED);
    expect(reader.poll(132)).toEqual({token:"light",pixels:new Uint8Array([20,20,20,255,20,20,20,255])});
    expect(gl.deleteSync).toHaveBeenCalledOnce();expect(reader.pending).toBe(false);
    expect(gl.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,null);
  });

  it("cancels stale work and reuses a bounded buffer until disposal",()=>{
    const gl=createReadbackGl(),reader=new AsyncPixelReadback<string>(gl as unknown as WebGL2RenderingContext);
    reader.submit([{x:1,y:1}],"old-theme",0);reader.cancel();
    expect(reader.poll(16)).toBeNull();expect(gl.getBufferSubData).not.toHaveBeenCalled();
    reader.submit([{x:2,y:2}],"current",32);
    expect(gl.createBuffer).toHaveBeenCalledOnce();expect(gl.bufferData).toHaveBeenCalledOnce();
    reader.dispose();reader.dispose();expect(gl.deleteBuffer).toHaveBeenCalledOnce();expect(gl.deleteSync).toHaveBeenCalledTimes(2);
  });

  it("abandons a slow fence without waiting and never falls back to synchronous reads",()=>{
    const gl=createReadbackGl(),reader=new AsyncPixelReadback<string>(gl as unknown as WebGL2RenderingContext);
    reader.submit([{x:1,y:1}],"slow",0);expect(reader.poll(300)).toBeNull();
    expect(reader.pending).toBe(false);expect(gl.getBufferSubData).not.toHaveBeenCalled();
    expect(gl.readPixels.mock.calls.every(call=>typeof call[6]==="number")).toBe(true);
    const unavailable=new AsyncPixelReadback({readPixels:gl.readPixels} as unknown as WebGL2RenderingContext);
    expect(unavailable.submit([{x:1,y:1}],"unsupported",0)).toBe(false);
    expect(gl.readPixels).toHaveBeenCalledTimes(1);
  });

  it("releases failed fences and restores the caller's buffer binding",()=>{
    const gl=createReadbackGl(),prior={};gl.getParameter.mockReturnValue(prior as never);
    const reader=new AsyncPixelReadback<string>(gl as unknown as WebGL2RenderingContext);
    reader.submit([{x:1,y:1}],"failed",0);gl.clientWaitSync.mockReturnValue(gl.WAIT_FAILED);
    expect(reader.poll(16)).toBeNull();expect(reader.pending).toBe(false);
    expect(gl.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    expect(gl.getBufferSubData).not.toHaveBeenCalled();reader.dispose();
  });
});
