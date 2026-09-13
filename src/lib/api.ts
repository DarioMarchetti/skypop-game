export type CloudSession = {
  id: string;
  seed: number;
  token: string;
};

export type SessionResult = {
  score: number;
  perfectCount: number;
  holds: number[];
  durationMs: number;
};

export type LeaderboardEntry = {
  id: string;
  nickname: string;
  score: number;
  created_at: string;
};

type ApiErrorBody = { error?: unknown; message?: unknown };

const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
export const isCloudConfigured = Boolean(configuredUrl && publishableKey);

const functionUrl = isCloudConfigured ? `${configuredUrl}/functions/v1/cloud-hop-v2` : "";
const REQUEST_TIMEOUT_MS = 8_000;

function cloudUnavailable(): Error {
  return new Error("云端比赛未配置，请使用本地练习");
}

async function request<T>(init: RequestInit = {}, suffix = ""): Promise<T> {
  if (!isCloudConfigured) throw cloudUnavailable();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set("apikey", publishableKey);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const result = await fetch(`${functionUrl}${suffix}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await result.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!result.ok) {
      const errorBody = body as ApiErrorBody | null;
      const rawMessage = typeof errorBody?.message === "string" ? errorBody.message : '';
      const message = errorBody?.error === 'rate_limited' ? '操作太频繁，请稍候再试'
        : /expired|timing/.test(rawMessage) ? '本局已过期或计时不一致，请重新开局'
        : /session|token/.test(rawMessage) ? '本局凭证失效，请重新开局'
        : /nickname/.test(rawMessage) ? '请输入 1–16 个有效字符的昵称'
        : `云端请求失败（${result.status}），请稍后重试`;
      throw new Error(message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("云端请求超时，请稍后重试");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function startSession(): Promise<CloudSession> {
  const body = await request<Partial<CloudSession>>({
    method: "POST",
    body: JSON.stringify({ action: "start" }),
  });
  if (typeof body.id !== "string" || typeof body.seed !== "number" || !Number.isInteger(body.seed) || typeof body.token !== "string") {
    throw new Error("云端局号响应无效");
  }
  return { id: body.id, seed: body.seed, token: body.token };
}

export async function finishSession(
  session: CloudSession,
  result: SessionResult,
  nickname: string,
): Promise<{ score: number }> {
  if (!session || !Array.isArray(result?.holds)) throw new Error("成绩数据无效");
  const body = await request<{ score?: unknown }>({
    method: "POST",
    body: JSON.stringify({ action: "finish", session, result, nickname }),
  });
  if (!Number.isInteger(body?.score) || (body.score as number) < 0) throw new Error("云端成绩响应无效");
  return { score: body.score as number };
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!isCloudConfigured) return [];
  const body = await request<unknown>({ method: "GET" });
  if (!Array.isArray(body)) throw new Error("云端排行榜响应无效");
  return body.filter((entry): entry is LeaderboardEntry => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Partial<LeaderboardEntry>;
    return typeof item.id === "string" && typeof item.nickname === "string" && Number.isInteger(item.score) && typeof item.created_at === "string";
  });
}
