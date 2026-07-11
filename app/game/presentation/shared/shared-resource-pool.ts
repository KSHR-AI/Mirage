type ResourceEntry<Value> = {
  generation: number;
  references: number;
  value: Value;
};

type Schedule = (callback: () => void) => void;

export class DeferredSharedResourcePool<Key extends object, Value> {
  readonly #create: (key: Key) => Value;
  readonly #dispose: (value: Value) => void;
  readonly #entries = new WeakMap<Key, ResourceEntry<Value>>();
  readonly #schedule: Schedule;

  constructor(
    create: (key: Key) => Value,
    dispose: (value: Value) => void,
    schedule: Schedule = (callback) => queueMicrotask(callback),
  ) {
    this.#create = create;
    this.#dispose = dispose;
    this.#schedule = schedule;
  }

  resolve(key: Key): Value {
    const entry = this.#entry(key);
    entry.generation += 1;
    return entry.value;
  }

  retain(key: Key): () => void {
    const entry = this.#entry(key);
    entry.generation += 1;
    entry.references += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      entry.references = Math.max(0, entry.references - 1);
      if (entry.references !== 0) return;

      const releaseGeneration = ++entry.generation;
      this.#schedule(() => {
        if (
          entry.references !== 0 ||
          entry.generation !== releaseGeneration ||
          this.#entries.get(key) !== entry
        ) {
          return;
        }
        this.#dispose(entry.value);
        this.#entries.delete(key);
      });
    };
  }

  #entry(key: Key): ResourceEntry<Value> {
    const existing = this.#entries.get(key);
    if (existing) return existing;
    const entry = {
      generation: 0,
      references: 0,
      value: this.#create(key),
    };
    this.#entries.set(key, entry);
    return entry;
  }
}
