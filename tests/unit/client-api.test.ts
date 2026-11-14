import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetModules();
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("window", {
    location: { pathname: "/app/students", assign: vi.fn() },
  });
});
afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) => Response.json(value);

it("shares overlapping reads but validates again after the read finishes", async () => {
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { api } = await import("@/lib/client-api");
  const first = api("/api/students");
  const second = api("/api/students");
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(response({ items: ["first"] }));
  const results = await Promise.all([first, second]);
  expect(results[0]).not.toBe(results[1]);
  expect(results).toEqual([
    { items: ["first"] },
    { items: ["first"] },
  ]);
  fetcher.mockResolvedValueOnce(response({ items: ["fresh"] }));
  expect(await api("/api/students")).toEqual({ items: ["fresh"] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not reuse a read started before a completed mutation", async () => {
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { api } = await import("@/lib/client-api");
  const old = api("/api/students");
  fetcher.mockResolvedValueOnce(response({ token: "test-csrf" }));
  fetcher.mockResolvedValueOnce(response({ id: "new" }));
  await api("/api/students", {
    method: "POST",
    body: { displayName: "Demo learner" },
  });
  let finishNew!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishNew = resolve;
      }),
  );
  const fresh = api("/api/students");
  finish(response({ items: ["old"] }));
  expect(await old).toEqual({ items: ["old"] });
  const overlapping = api("/api/students");
  expect(fetcher).toHaveBeenCalledTimes(4);
  finishNew(response({ items: ["new"] }));
  expect(await Promise.all([fresh, overlapping])).toEqual([
    { items: ["new"] },
    { items: ["new"] },
  ]);
});

it("retries rejected reads and keeps distinct filter keys separate", async () => {
  const { api } = await import("@/lib/client-api");
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  await expect(api("/api/students?q=A")).rejects.toThrow("Offline");
  fetcher.mockResolvedValueOnce(response(["A"]));
  fetcher.mockResolvedValueOnce(response(["B"]));
  expect(
    await Promise.all([api("/api/students?q=A"), api("/api/students?q=B")]),
  ).toEqual([["A"], ["B"]]);
});

it("checks authorization again after a successful read", async () => {
  const { api } = await import("@/lib/client-api");
  fetcher.mockResolvedValueOnce(response({ items: [] }));
  await api("/api/students");
  fetcher.mockResolvedValueOnce(
    Response.json({ error: "Session revoked" }, { status: 401 }),
  );
  await expect(api("/api/students")).rejects.toMatchObject({ status: 401 });
  expect(window.location.assign).toHaveBeenCalledWith("/login?expired=1");
});
