/** Own partial initialization as well as normal unmount; disposal is idempotent. */
export class ResourceScope {
  private releases: Array<() => void> = [];
  private disposed = false;
  add(release: () => void) {
    if (this.disposed) release();
    else this.releases.push(release);
  }
  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.releases.reverse()) {
      try { release(); } catch (error) { console.warn("Resource cleanup failed", error); }
    }
    this.releases = [];
  };
}
