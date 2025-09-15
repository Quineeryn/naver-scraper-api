type CBState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CBState = "closed";
  private failStreak = 0;
  private openedAt = 0;

  constructor(
    private readonly failThreshold: number,
    private readonly openMs: number
  ) {}

  canAttempt(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.openMs) {
        this.state = "half-open";
        return true;
      }
      return false;
    }
    
    return true;
  }

  onSuccess() {
    this.failStreak = 0;
    this.state = "closed";
  }

  onFailure() {
    this.failStreak++;
    
    if (this.state === "closed" && this.failStreak >= this.failThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}