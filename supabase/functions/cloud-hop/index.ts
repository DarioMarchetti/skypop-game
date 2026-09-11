import { applyJump, createRun, JUMP_DURATION_MS, MAX_HOLD_MS } from "../_shared/game.ts";

type StartResponse = { id: string; seed: number; token: string };
type FinishBody = {
  action?: string;
  session?: { id?: unknown; token?: unknown };
  result?: {
    score?: unknown;
    perfectCount?: unknown;
    holds?: unknown;
    durationMs?: unknown;
  };
  nickname?: unknown;
};
type ReplayResult = { score: number; perfectCount: number };

type SubmitResult = {
  accepted: boolean;
  duplicate: boolean;
  score: number;
  perfect_count: number;
};

const MAX_BODY_BYTES = 128 * 1024;
const SESSION_TTL_MS = 15 * 60 * 1000;
const START_LIMIT = 20;
const FINISH_LIMIT = 20;
const LEADERBOARD_LIMIT = 60;
const REST_TIMEOUT_MS = 8_000;

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = getServiceKey();
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "apikey, authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

function getServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const values = JSON.parse(raw) as Record<string, unknown>;
      for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "service_role"]) {
        if (typeof values[name] === "string" && values[name]) return values[name] as string;
      }
    } catch {
      // A malformed secret is handled as a missing server credential below.
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return response({ error: code, message }, status);
}

function requireServerConfig(): void {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server configuration is incomplete");
}

async function restRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  requireServerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set("apikey", SERVICE_KEY);
    headers.set("authorization", `Bearer ${SERVICE_KEY}`);
    headers.set("content-type", "application/json");
    const result = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers,
      signal: controller.signal,
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
      console.error("supabase REST request failed", result.status, path, body);
      throw new DatabaseError(result.status, body);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

async function consumeRateLimit(key: string, limit: number): Promise<boolean> {
  const body = await restRequest("rpc/cloud_hop_consume_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_rate_key: key, p_limit: limit, p_window_seconds: 60 }),
  });
  return body === true || (typeof body === "string" && body === "t") || (Array.isArray(body) && body[0] === true);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function networkHint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

async function rateKey(req: Request, bucket: string): Promise<string> {
  // The raw network hint never leaves this request. A server-only salt prevents
  // the persisted digest from becoming a reversible IP identifier.
  const salt = Deno.env.get("CLOUD_HOP_RATE_LIMIT_SALT") || SERVICE_KEY || "cloud-hop";
  return `${bucket}:${await sha256Hex(`${salt}:${networkHint(req)}`)}`;
}

async function readJson(req: Request): Promise<unknown> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new InputError("request body is too large");
  const reader = req.body?.getReader();
  if (!reader) throw new InputError("request body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InputError("request body is too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError("request body must be valid JSON");
  }
}

class InputError extends Error {}

class DatabaseError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super("database request failed");
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validNickname(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return Array.from(name).length >= 1 && Array.from(name).length <= 16 && !/[\u0000-\u001f\u007f]/u.test(name);
}

function replay(seed: number, holds: number[]): ReplayResult {
  let state = createRun(seed);
  for (let index = 0; index < holds.length; index += 1) {
    const jump = applyJump(state, holds[index]);
    state = jump.state;
    if (!jump.landed) {
      // The terminal failed jump is part of the GameResult hold history.
      if (index !== holds.length - 1 || !state.over) throw new InputError("jump history is invalid");
      break;
    }
    if (state.over) {
      if (index !== holds.length - 1) throw new InputError("jump history continues after game over");
      break;
    }
  }
  if (!state.over) throw new InputError("a finished game is required");
  return { score: state.score, perfectCount: state.perfectCount };
}

function parseFinish(body: FinishBody): {
  sessionId: string;
  token: string;
  holds: number[];
  durationMs: number;
  nickname: string;
  seed?: never;
} {
  const session = body.session;
  const result = body.result;
  if (!session || !validUuid(session.id) || typeof session.token !== "string" || session.token.length < 32 || session.token.length > 128) {
    throw new InputError("invalid session");
  }
  if (!result || !Array.isArray(result.holds) || result.holds.length < 1 || result.holds.length > 1000) {
    throw new InputError("invalid jump history");
  }
  const holds = result.holds.map((hold) => {
    if (!Number.isInteger(hold) || (hold as number) < 0 || (hold as number) > MAX_HOLD_MS) throw new InputError("invalid hold duration");
    return hold as number;
  });
  if (!Number.isInteger(result.durationMs) || (result.durationMs as number) < 0 || (result.durationMs as number) > 2 * 60 * 60 * 1000) {
    throw new InputError("invalid duration");
  }
  if (!validNickname(body.nickname)) throw new InputError("nickname must be 1-16 Unicode characters");
  return { sessionId: session.id, token: session.token, holds, durationMs: result.durationMs as number, nickname: body.nickname.trim() };
}

async function start(req: Request): Promise<Response> {
  if (!(await consumeRateLimit(await rateKey(req, "start"), START_LIMIT))) return errorResponse(429, "rate_limited", "too many starts");
  const token = randomToken();
  const id = crypto.randomUUID();
  const seed = randomSeed();
  const now = Date.now();
  const rows = asRows(await restRequest("cloud_hop_sessions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      id,
      seed,
      token_hash: await sha256Hex(token),
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
    }),
  }));
  if (rows.length !== 1) throw new Error("session was not created");
  return response({ id, seed, token } satisfies StartResponse);
}

async function finish(req: Request, body: FinishBody): Promise<Response> {
  if (!(await consumeRateLimit(await rateKey(req, "finish"), FINISH_LIMIT))) return errorResponse(429, "rate_limited", "too many submissions");
  const parsed = parseFinish(body);
  const tokenHash = await sha256Hex(parsed.token);
  // Read only the seed through the privileged server path. The submit RPC then
  // locks the same row and re-checks the token before writing the score.
  const sessionRows = asRows(await restRequest(`cloud_hop_sessions?id=eq.${encodeURIComponent(parsed.sessionId)}&token_hash=eq.${tokenHash}&select=id,seed,created_at,expires_at,used_at`));
  if (sessionRows.length !== 1 || !Number.isInteger(Number(sessionRows[0].seed))) throw new InputError("invalid session or token");
  const session = sessionRows[0];
  const seed = Number(session.seed);
  const createdAt = Date.parse(String(session.created_at));
  const expiresAt = Date.parse(String(session.expires_at));
  const elapsed = Date.now() - createdAt;
  const expectedDuration = parsed.holds.reduce((total, hold) => total + hold, 0) + parsed.holds.length * JUMP_DURATION_MS;
  const alreadyUsed = session.used_at !== null && session.used_at !== undefined;
  // Server time is authoritative. durationMs is only a consistency check on the
  // client report; it cannot make a submission appear older than it is.
  if (!alreadyUsed && (!Number.isFinite(createdAt) || Date.now() >= expiresAt || elapsed + 1000 < expectedDuration || parsed.durationMs + 1000 < expectedDuration)) throw new InputError("session timing is invalid");
  const replayedWithSeed = replay(seed, parsed.holds);

  const resultRows = asRows(await restRequest("rpc/cloud_hop_submit_score", {
    method: "POST",
    body: JSON.stringify({
      p_session_id: parsed.sessionId,
      p_token_hash: tokenHash,
      p_score: replayedWithSeed.score,
      p_perfect_count: replayedWithSeed.perfectCount,
      p_nickname: parsed.nickname,
    }),
  }));
  const result = resultRows[0] as Partial<SubmitResult> | undefined;
  if (!result || typeof result.score !== "number") throw new Error("score was not saved");
  return response({ score: result.score });
}

async function leaderboard(req: Request): Promise<Response> {
  if (!(await consumeRateLimit(await rateKey(req, "leaderboard"), LEADERBOARD_LIMIT))) return errorResponse(429, "rate_limited", "too many leaderboard requests");
  const rows = asRows(await restRequest("cloud_hop_scores?select=id,nickname,score,created_at&order=score.desc,created_at.asc,id.asc&limit=20"));
  return response(rows.map((row) => ({ id: row.id, nickname: row.nickname, score: row.score, created_at: row.created_at })));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    if (req.method === "GET") return await leaderboard(req);
    if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "method not allowed");
    const body = await readJson(req) as FinishBody;
    if (!body || typeof body !== "object") throw new InputError("invalid JSON object");
    if (body.action === "start") return await start(req);
    if (body.action === "finish") return await finish(req, body);
    throw new InputError("unknown action");
  } catch (error) {
    if (error instanceof InputError) return errorResponse(400, "invalid_request", error.message);
    if (error instanceof DatabaseError && error.status >= 400 && error.status < 500) {
      return errorResponse(400, "invalid_request", "session is invalid or expired");
    }
    console.error("cloud-hop request failed", error);
    return errorResponse(500, "server_error", "cloud hop backend is unavailable");
  }
});
