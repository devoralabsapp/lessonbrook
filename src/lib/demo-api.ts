"use client";

import { vietnamToday } from "@/domain";
import type { DemoCommand } from "@/features/demo/workspace";
import { ApiError } from "./client-api";

// Only the current browser tab retains the fake workspace's change history.
let date: string | undefined;
const changes: DemoCommand[] = [];
let pending: Promise<unknown> = Promise.resolve();

export async function demoApi<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    requestId?: string;
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  if (method !== "GET" && method !== "POST" && method !== "PATCH")
    throw new ApiError(405, "Demo request not supported.");
  const command: DemoCommand = {
    path,
    method,
    body: options?.body,
    id: options?.requestId ?? crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  const change = method !== "GET" && path !== "/api/share/resolve";
  async function run() {
    date ??= vietnamToday();
    const response = await fetch("/api/demo", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        locale: document.documentElement.lang === "vi" ? "vi" : "en",
        command,
        changes,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(response.status, data.error);
    if (change && !changes.some((item) => item.id === command.id))
      changes.push(command);
    if (change && (path === "/api/profile" || path === "/api/onboarding")) {
      const profile = command.body as { displayName?: unknown };
      if (typeof profile.displayName === "string") {
        window.dispatchEvent(
          new CustomEvent("lessonbrook:demo-name", {
            detail: profile.displayName.trim(),
          }),
        );
      }
    }
    return data as T;
  }
  if (!change) return run();
  const next = pending.then(run);
  pending = next.catch(() => {});
  return next;
}
