/** Sustained frame cost informs resolution. An isolated pause is not evidence
 * that every subsequent frame needs a smaller drawing buffer. */
export class LiquidQuality {
  private previous: number | null = null;
  private intervals: number[] = [];
  private elapsed = 0;
  private fastTime = 0;
  private recovery = 1;
  private scale = 1;

  resetTiming() { this.previous=null;this.intervals=[];this.elapsed=0;this.fastTime=0; }

  step(timestamp: number, active: boolean, held: boolean): number {
    if (!active) this.resetTiming();
    else {
      if (this.previous !== null) {
        const dt=timestamp-this.previous;
        if (dt>0) { this.intervals.push(dt);this.elapsed+=dt; }
      }
      this.previous=timestamp;
      if (this.elapsed>=1200 && this.intervals.length>=12) {
        const sorted=[...this.intervals].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)],p90=sorted[Math.floor(sorted.length*.9)];
        if (median>24.5) { this.scale=Math.max(.5,this.scale-.15);this.fastTime=0;this.recovery=this.scale; }
        else if (median<18.5 && p90<22) {
          this.fastTime+=this.elapsed;
          if (this.fastTime>=4800) { this.recovery=Math.min(1,this.scale+.15);this.fastTime=0; }
        } else this.fastTime=0;
        this.intervals=[];this.elapsed=0;
      }
    }
    // A larger buffer is allocated after release, rather than mid gesture.
    if (!held && this.recovery>this.scale) this.scale=this.recovery;
    return this.scale;
  }
}
