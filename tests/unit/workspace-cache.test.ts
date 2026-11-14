import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { readThroughWorkspaceCache } from "@/lib/server/workspace-cache";

it("shares a pending load, reuses the result, and reloads an expired value", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const key = randomUUID();
    const load = vi.fn(async () => ({ total: 30_000 }));
    await expect(
      Promise.all([
        readThroughWorkspaceCache(key, load),
        readThroughWorkspaceCache(key, load),
      ]),
    ).resolves.toEqual([{ total: 30_000 }, { total: 30_000 }]);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(readThroughWorkspaceCache(key, load)).resolves.toEqual({
      total: 30_000,
    });
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(46_000);
    load.mockResolvedValue({ total: 60_000 });
    await expect(readThroughWorkspaceCache(key, load)).resolves.toEqual({
      total: 60_000,
    });
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("reloads after a rejected origin read", async () => {
  const key = randomUUID();
  const load = vi
    .fn<() => Promise<number>>()
    .mockRejectedValueOnce(new Error("Origin unavailable"))
    .mockResolvedValueOnce(1);
  await expect(readThroughWorkspaceCache(key, load)).rejects.toThrow();
  await expect(readThroughWorkspaceCache(key, load)).resolves.toBe(1);
});
