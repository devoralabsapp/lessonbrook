"use client";
let csrf: Promise<string> | undefined;
let csrfRefreshAt = 0;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function csrfToken() {
  if (csrf && Date.now() < csrfRefreshAt) return csrf;
  // Renew before the one-hour cookie lifetime, including on long-open forms.
  csrfRefreshAt = Date.now() + 55 * 60_000;
  csrf = fetch("/api/auth/csrf", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error("Không thể tạo phiên bảo mật.");
      return (await r.json()).token as string;
    })
    .catch((error) => {
      csrf = undefined;
      throw error;
    });
  return csrf;
}
async function request<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    requestId?: string;
    returnRecord?: boolean;
  },
): Promise<T> {
  const mutation = options?.method && options.method !== "GET";
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    cache: "no-store",
    headers: mutation
      ? {
          "Content-Type": "application/json",
          "x-csrf-token": await csrfToken(),
          ...(options.returnRecord ? { Prefer: "return=representation" } : {}),
          ...(options.requestId
            ? { "Idempotency-Key": options.requestId }
            : {}),
        }
      : {},
    body: mutation ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 403) csrf = undefined;
    if (response.status === 423 && !path.startsWith("/api/account/"))
      window.location.assign("/account/deletion");
    if (
      response.status === 401 &&
      !path.startsWith("/api/auth/") &&
      path !== "/api/account/deletion"
    )
      window.location.assign("/login?expired=1");
    throw new ApiError(
      response.status,
      data.error ?? "Không thể lưu. Vui lòng thử lại.",
    );
  }
  return data;
}

// RAM only, and only while an authenticated read is in flight. Completed results
// remain governed by the server cache and its transactional revisions.
const pendingReads = new Map<string, Promise<unknown>>();
export async function api<T>(
  path: string,
  options?: Parameters<typeof request<T>>[1],
): Promise<T> {
  if (
    path !== "/api/locale" &&
    /^\/demo(?:\/|$)/.test(window.location.pathname)
  ) {
    const { demoApi } = await import("./demo-api");
    return demoApi<T>(path, options);
  }
  const mutation = options?.method && options.method !== "GET";
  if (mutation) {
    pendingReads.clear();
    try {
      return await request<T>(path, options);
    } finally {
      // A read started before/during a write cannot be reused after that write.
      pendingReads.clear();
    }
  }
  const previous = pendingReads.get(path);
  if (previous) return JSON.parse(JSON.stringify(await previous)) as T;
  if (pendingReads.size >= 64) return request<T>(path, options);
  const loading = request<T>(path, options);
  pendingReads.set(path, loading);
  try {
    return await loading;
  } finally {
    if (pendingReads.get(path) === loading) pendingReads.delete(path);
  }
}
