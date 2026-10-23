export type PixelPoint = { x: number; y: number };
type Pending<T> = { fence: WebGLSync; count: number; token: T; at: number };

/** One bounded GPU batch. Polling never waits; read completed pixels before
 * issuing the next frame's draw commands. Optional ink must not stall the scene. */
export class AsyncPixelReadback<T> {
  private buffer: WebGLBuffer | null = null;
  private capacity = 0;
  private queued: Pending<T> | null = null;
  private disabled: boolean;

  constructor(private gl: WebGL2RenderingContext) {
    this.disabled = !["createBuffer","bindBuffer","bufferData","readPixels","fenceSync","flush","clientWaitSync","getBufferSubData","getParameter","deleteSync","deleteBuffer"]
      .every(name => typeof (gl as unknown as Record<string, unknown>)[name] === "function");
  }

  get pending() { return this.queued !== null; }

  submit(points: readonly PixelPoint[], token: T, timestamp: number): boolean {
    if (this.disabled || this.queued || !points.length || points.length > 96) return false;
    const gl = this.gl;
    const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
    try {
      this.buffer ??= gl.createBuffer();
      if (!this.buffer) return false;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.buffer);
      const bytes = points.length*4;
      if (bytes > this.capacity) {
        this.capacity = Math.max(64,2**Math.ceil(Math.log2(bytes)));
        gl.bufferData(gl.PIXEL_PACK_BUFFER,this.capacity,gl.STREAM_READ);
      }
      points.forEach((point,index) => gl.readPixels(point.x,point.y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,index*4));
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if (!fence) return false;
      this.queued = { fence, count: points.length, token, at: timestamp };
      gl.flush();
      return true;
    } catch {
      this.disabled = true;
      this.dispose();
      return false;
    } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous); }
  }

  poll(timestamp: number): { token: T; pixels: Uint8Array } | null {
    const queued = this.queued;
    if (!queued) return null;
    const gl = this.gl;
    try {
      const status = gl.clientWaitSync(queued.fence,0,0);
      if (status === gl.TIMEOUT_EXPIRED) {
        if (timestamp-queued.at > 250) this.cancel();
        return null;
      }
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) { this.cancel(); return null; }
      const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
      const pixels = new Uint8Array(queued.count*4);
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.buffer);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,pixels);
      } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous); }
      this.cancel();
      return { token: queued.token, pixels };
    } catch {
      this.disabled = true;
      this.dispose();
      return null;
    }
  }

  cancel() {
    if (this.queued) this.gl.deleteSync(this.queued.fence);
    this.queued = null;
  }

  dispose() {
    this.cancel();
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    this.buffer = null;
    this.capacity = 0;
  }
}
