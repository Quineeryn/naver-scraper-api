type CacheEntry<T> = { 
  value: T; 
  exp: number 
};

export class TTLCache<K, V> {
  private m = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number, 
    private readonly max = 1000
  ) {}

  get(key: K): V | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    
    if (e.exp < Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    
    return e.value;
  }

  set(key: K, val: V) {
    if (this.m.size >= this.max) {
      const k0 = this.m.keys().next().value;
      if (k0 !== undefined) this.m.delete(k0);
    }
    
    this.m.set(key, { 
      value: val, 
      exp: Date.now() + this.ttlMs 
    });
  }
}