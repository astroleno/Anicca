/** Keep the material and springs on the same visible scene time. */
export class LiquidSceneClock {
  private previous: number | null = null;
  private elapsed: number | null = null;

  pause() { this.previous = null; }

  step(timestamp: number): number {
    if (this.elapsed === null) this.elapsed = timestamp;
    else if (this.previous !== null) this.elapsed += Math.max(0, timestamp - this.previous);
    this.previous = Math.max(this.previous ?? timestamp, timestamp);
    return this.elapsed;
  }
}
