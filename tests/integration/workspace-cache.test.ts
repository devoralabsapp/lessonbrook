import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { workspaceReader } from "@/lib/server/workspace-cache";
import { client, googleToken } from "./helpers";

it("refreshes warmed directory data on commit while preserving account isolation and revocation", async () => {
  const teacher = await client();
  const other = await client();
  const { uid, idToken } = await googleToken();
  await teacher.login(idToken);
  await other.login((await googleToken()).idToken);

  const path = "/api/students?order=name&q=Cache";
  const list = async (account: typeof teacher) => {
    const response = await account.call(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    return (await response.json()).items;
  };
  expect(await list(teacher)).toEqual([]);
  expect(await list(other)).toEqual([]);

  const input = { displayName: "Cache test learner" };
  const key = randomUUID();
  const created = await teacher.call("/api/students", "POST", input, key);
  expect(created.status).toBe(200);
  const { id } = await created.json();
  const first = await list(teacher);
  expect(first).toMatchObject([{ id, ...input }]);
  expect(await list(other)).toEqual([]);

  const versions = admin().db.doc(
    `apps/chotcong/users/${uid}/preferences/workspace-cache`,
  );
  const revision = (await versions.get()).get("revisions.students");
  expect(revision).toMatch(/^[0-9a-f-]{36}$/);
  expect((await teacher.call("/api/students", "POST", input, key)).status).toBe(
    200,
  );
  expect(
    (
      await teacher.call(
        "/api/students",
        "POST",
        { displayName: "Cache conflict" },
        key,
      )
    ).status,
  ).toBe(409);
  expect((await versions.get()).get("revisions.students")).toBe(revision);

  const renamed = { displayName: "Cache updated learner" };
  expect(
    (await teacher.call(`/api/students/${id}`, "PATCH", renamed)).status,
  ).toBe(200);
  expect(await list(teacher)).toMatchObject([{ id, ...renamed }]);
  expect(await list(other)).toEqual([]);
  await admin().auth.updateUser(uid, { disabled: true });
  expect((await teacher.call(path)).status).toBe(401);
});

it("shares results across readers and keeps a late old load out of the committed revision", async () => {
  const teacher = await client();
  const { uid, idToken } = await googleToken();
  await teacher.login(idToken);
  const before = await workspaceReader(uid);
  let release!: (value: string[]) => void;
  const waiting = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  const oldRead = before("students", [{ q: "Race" }], () => waiting);
  const created = await teacher.call("/api/students", "POST", {
    displayName: "Race learner",
  });
  expect(created.status).toBe(200);
  const load = vi.fn(async () => ["new record"]);
  const after = await workspaceReader(uid);
  expect(await after("students", [{ q: "Race" }], load)).toEqual([
    "new record",
  ]);
  release(["old record"]);
  expect(await oldRead).toEqual(["old record"]);
  const fresh = await workspaceReader(uid);
  expect(await fresh("students", [{ q: "Race" }], load)).toEqual([
    "new record",
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(
    (await teacher.call("/api/appearance", "PATCH", { theme: "mono-os" }))
      .status,
  ).toBe(200);
  const changedTheme = await workspaceReader(uid);
  expect(await changedTheme("students", [{ q: "Race" }], load)).toEqual([
    "new record",
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  await changedTheme("students", [{ q: "Other" }], load);
  expect(load).toHaveBeenCalledTimes(2);
});
