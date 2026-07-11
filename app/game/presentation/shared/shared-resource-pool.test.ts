import { describe, expect, it, vi } from "vitest";
import { DeferredSharedResourcePool } from "./shared-resource-pool";

describe("DeferredSharedResourcePool", () => {
  it("shares one resource until the final lease is released", () => {
    const callbacks: Array<() => void> = [];
    const dispose = vi.fn();
    const create = vi.fn(() => ({ id: "resource" }));
    const pool = new DeferredSharedResourcePool(create, dispose, (callback) =>
      callbacks.push(callback),
    );
    const key = {};

    expect(pool.resolve(key)).toBe(pool.resolve(key));
    const releaseA = pool.retain(key);
    const releaseB = pool.retain(key);
    releaseA();
    expect(callbacks).toHaveLength(0);
    releaseB();
    expect(callbacks).toHaveLength(1);
    callbacks.shift()?.();

    expect(create).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels deferred disposal when a strict-mode lease is reacquired", () => {
    const callbacks: Array<() => void> = [];
    const dispose = vi.fn();
    const pool = new DeferredSharedResourcePool(
      () => ({ id: "resource" }),
      dispose,
      (callback) => callbacks.push(callback),
    );
    const key = {};

    const releaseFirst = pool.retain(key);
    releaseFirst();
    const releaseSecond = pool.retain(key);
    callbacks.shift()?.();
    expect(dispose).not.toHaveBeenCalled();

    releaseSecond();
    callbacks.shift()?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("makes release functions idempotent", () => {
    const callbacks: Array<() => void> = [];
    const dispose = vi.fn();
    const pool = new DeferredSharedResourcePool(
      () => ({ id: "resource" }),
      dispose,
      (callback) => callbacks.push(callback),
    );
    const release = pool.retain({});

    release();
    release();
    expect(callbacks).toHaveLength(1);
    callbacks.shift()?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("uses the browser microtask scheduler without rebinding it", async () => {
    const dispose = vi.fn();
    const pool = new DeferredSharedResourcePool(
      () => ({ id: "resource" }),
      dispose,
    );

    pool.retain({})();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
