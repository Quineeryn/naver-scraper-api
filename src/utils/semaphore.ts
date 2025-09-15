export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly cap: number) {}

  async acquire() {
    if (this.active < this.cap) {
      this.active++;
      return;
    }
    
    await new Promise<void>((res) => this.queue.push(res));
    this.active++;
  }

  release() {
    this.active--;
    
    const next = this.queue.shift();
    if (next) next();
  }
}