// Horloges absolues : Safari peut suspendre les timers en arrière-plan.
export class SessionLock {
  private stopped = false;
  private idleDeadline: number;
  private hiddenAt: number | null = null;
  private authUntil = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly lock: () => void,
    private readonly timeoutMs: number,
    private readonly now = () => Date.now(),
  ) {
    this.idleDeadline = this.now() + timeoutMs;
    this.schedule();
  }
  activity() {
    if (!this.check()) return;
    this.idleDeadline = this.now() + this.timeoutMs;
    this.schedule();
  }
  authorization(active: boolean) {
    this.authUntil = active ? this.now() + Math.min(this.timeoutMs, 300000) : 0;
    this.check();
    this.schedule();
  }
  visibility(hidden: boolean) {
    if (hidden) {
      this.hiddenAt = this.now();
    } else {
      this.check();
      this.hiddenAt = null;
    }
    this.schedule();
  }
  check() {
    if (this.stopped) return false;
    const now = this.now();
    const backgroundDeadline =
      this.hiddenAt === null ? Infinity : this.hiddenAt + 30000;
    const effectiveBackground = Math.max(backgroundDeadline, this.authUntil);
    if (now >= this.idleDeadline || now >= effectiveBackground) {
      this.stop();
      this.lock();
      return false;
    }
    return true;
  }
  private schedule() {
    clearTimeout(this.timer);
    const background =
      this.hiddenAt === null
        ? Infinity
        : Math.max(this.hiddenAt + 30000, this.authUntil);
    const wait = Math.max(
      0,
      Math.min(this.idleDeadline, background) - this.now(),
    );
    if (!this.stopped)
      this.timer = setTimeout(() => {
        if (this.check()) this.schedule();
      }, wait);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
