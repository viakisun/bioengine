export class SeededRandom {
  private seed: number;
  private initialSeed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.initialSeed = seed;
  }

  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  gaussian(mean: number, stddev: number): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }

  reset(): void {
    this.seed = this.initialSeed;
  }

  fork(offset: number): SeededRandom {
    return new SeededRandom(this.initialSeed + offset * 7919);
  }
}
