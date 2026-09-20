import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

/* ───────────────────────────────────────────────────────────────────────────
 * The single boundary between this app and a network that will, eventually,
 * do something rude. Every LLM call in the product goes through callModel, so
 * timeouts, rate limits, malformed JSON and outages are handled once and the
 * three routes inherit the behaviour rather than each reinventing it.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Free-tier capacity is genuinely unreliable: 503 "high demand" is common and
 * hits hardest exactly when you are demonstrating. Capacity is per-model, so a
 * saturated model stays saturated no matter how long we back off. We therefore
 * walk a chain on capacity errors rather than retrying a model we know is busy.
 *
 * All four are verified to work with this API key and with responseJsonSchema.
 * Later entries are newer, so failing over never costs output quality.
 */
export const MODEL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
] as const;

export const MODEL = MODEL_CHAIN[0];

const DEFAULT_TIMEOUT_MS = 25_000;

/** Hard ceiling on network calls for one request, so a bad day cannot hang. */
const MAX_CALLS = 6;
/** Schema repairs are expensive and rarely help twice. */
const MAX_REPAIRS = 1;

/**
 * The free tier meters per model per day, so an exhausted model stays exhausted
 * for a while. Remembering that across requests is the difference between
 * spending five wasted calls rediscovering it and going straight to a model
 * that can actually answer.
 */
const cooldownUntil = new Map<string, number>();

/**
 * Google reports how long to wait, but on a daily quota it sometimes says two
 * seconds. Honouring that verbatim means re-walking a chain of dead models on
 * every request, so its number sets the floor, never the ceiling.
 */
const MIN_COOLDOWN_MS = 60_000;

function retryDelayMs(detail: string | undefined): number {
  const m = detail?.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  const reported = m ? Math.ceil(Number(m[1]) * 1000) : MIN_COOLDOWN_MS;
  return Math.max(MIN_COOLDOWN_MS, reported);
}

function nextUsableModel(from: number): number {
  const now = Date.now();
  for (let i = from; i < MODEL_CHAIN.length; i++) {
    if ((cooldownUntil.get(MODEL_CHAIN[i]) ?? 0) <= now) return i;
  }
  return -1;
}

/** How long until the soonest model frees up, for an honest error message. */
function soonestRecoveryMs(): number {
  const times = MODEL_CHAIN.map((m) => cooldownUntil.get(m) ?? 0);
  return Math.max(0, Math.min(...times) - Date.now());
}

export type FailureKind =
  | "rate_limit"
  | "timeout"
  | "server"
  | "malformed"
  | "auth"
  | "not_found"
  | "unknown";

export class LlmError extends Error {
  constructor(
    readonly kind: FailureKind,
    /** Shown to the recruiter. Plain language, says what to do next. */
    readonly userMessage: string,
    readonly attempts: number,
    readonly detail?: string,
  ) {
    super(userMessage);
    this.name = "LlmError";
  }
}

/**
 * "Still busy" is useless when the real answer is "wait ninety seconds". The
 * free tier meters 20 requests per model per day, so say that plainly.
 */
function exhaustedMessage(waitSeconds: number): string {
  const when =
    waitSeconds <= 0
      ? "It should free up now."
      : waitSeconds < 120
        ? `It frees up in about ${waitSeconds} seconds.`
        : `It frees up in about ${Math.ceil(waitSeconds / 60)} minutes.`;
  return `The free tier allows 20 requests per model per day, and every model we can reach has hit that. ${when}`;
}

const USER_MESSAGE: Record<FailureKind, string> = {
  rate_limit: "The model is rate limited right now. We backed off and retried, but it is still busy.",
  timeout: "The model took too long to respond.",
  server: "The model provider returned an error.",
  malformed: "The model returned a response we could not read, and the repair attempt also failed.",
  auth: "The API key was rejected. Check GEMINI_API_KEY in .env.local.",
  not_found: "The requested model is not available to this API key. See the model name in the server log.",
  unknown: "Something went wrong talking to the model.",
};

function classify(err: unknown): FailureKind {
  if (err instanceof LlmError) return err.kind;
  const e = err as { status?: number; message?: string; name?: string };
  if (e?.name === "AbortError") return "timeout";
  const text = `${e?.status ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (text.includes("429") || text.includes("resource_exhausted") || text.includes("quota")) return "rate_limit";
  if (text.includes("401") || text.includes("403") || text.includes("api key") || text.includes("permission_denied"))
    return "auth";
  if (text.includes("404") || text.includes("not_found") || text.includes("no longer available")) return "not_found";
  if (/\b5\d\d\b/.test(text) || text.includes("unavailable") || text.includes("internal")) return "server";
  if (text.includes("abort") || text.includes("timeout") || text.includes("deadline")) return "timeout";
  return "unknown";
}

/* ─────────────────────────── Fault injection ───────────────────────────
 * Development only. Rate limits are real but unreliable to trigger on demand,
 * and the error paths need to be exercised deliberately rather than hoped for.
 * Gated on NODE_ENV so it cannot fire in a production build.
 */

export const FAULTS = ["none", "rate_limit", "timeout", "malformed", "auth", "server"] as const;
export type Fault = (typeof FAULTS)[number];
export const FaultSchema = z.enum(FAULTS).optional();

const faultsEnabled = () => process.env.NODE_ENV !== "production";

/** Thrown on the first attempt only, so retry and recovery stay observable. */
function injectFault(fault: Fault, attempt: number): void {
  if (!faultsEnabled() || !fault || fault === "none") return;
  // "rate_limit" persists one extra attempt so the UI actually shows a retry.
  const persistFor = fault === "rate_limit" ? 2 : 1;
  if (attempt > persistFor) return;
  if (fault === "malformed") throw new LlmError("malformed", USER_MESSAGE.malformed, attempt, "injected");
  throw Object.assign(new Error(`injected ${fault}`), {
    status: { rate_limit: 429, timeout: 408, auth: 403, server: 503 }[fault] ?? 500,
    name: fault === "timeout" ? "AbortError" : "Error",
  });
}

/* ─────────────────────────── Client ─────────────────────────── */

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LlmError("auth", "GEMINI_API_KEY is not set. Copy .env.example to .env.local and add your key.", 0);
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Gemini accepts JSON Schema but rejects a few draft keywords zod emits. */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties" || k === "exclusiveMinimum" || k === "exclusiveMaximum")
          continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type CallResult<T> = {
  data: T;
  /** How many attempts it took. >1 means the UI should say it recovered. */
  attempts: number;
  /** Non-fatal notes worth surfacing, e.g. "first response was malformed; repaired". */
  notes: string[];
};

export type CallOptions<T extends z.ZodType> = {
  label: string;
  system: string;
  user: string;
  schema: T;
  fault?: Fault;
  temperature?: number;
  /** Scoring sends many profiles and needs longer than an interpret call. */
  timeoutMs?: number;
};

export async function callModel<T extends z.ZodType>(opts: CallOptions<T>): Promise<CallResult<z.infer<T>>> {
  const { label, system, user, schema, fault = "none", temperature = 0.2, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const notes: string[] = [];
  let repairHint = "";
  let lastError: unknown;
  let repairs = 0;

  let modelIndex = nextUsableModel(0);
  if (modelIndex === -1) {
    // Every model is in cooldown. Say so now rather than after six doomed calls.
    const wait = Math.ceil(soonestRecoveryMs() / 1000);
    throw new LlmError("rate_limit", exhaustedMessage(wait), 0, "all models cooling down");
  }
  let model: string = MODEL_CHAIN[modelIndex];

  for (let attempt = 1; attempt <= MAX_CALLS; attempt++) {
    const timer = AbortSignal.timeout(timeoutMs);
    try {
      injectFault(fault, attempt);

      const response = await getClient().models.generateContent({
        model,
        contents: repairHint ? `${user}\n\n${repairHint}` : user,
        config: {
          systemInstruction: system,
          temperature,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(schema),
          abortSignal: timer,
        },
      });

      const text = response.text;
      if (!text) throw new LlmError("malformed", USER_MESSAGE.malformed, attempt, "empty response body");

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new LlmError("malformed", USER_MESSAGE.malformed, attempt, `not JSON: ${text.slice(0, 200)}`);
      }

      const result = schema.safeParse(parsedJson);
      if (!result.success) {
        const issues = result.error.issues
          .slice(0, 6)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new LlmError("malformed", USER_MESSAGE.malformed, attempt, issues);
      }

      if (attempt > 1) notes.push(`Recovered on attempt ${attempt}.`);
      if (model !== MODEL) notes.push(`Answered by ${model} after the primary model was unavailable.`);
      return { data: result.data, attempts: attempt, notes };
    } catch (err) {
      lastError = err;
      const kind = classify(err);
      const detail = err instanceof LlmError ? err.detail : (err as Error)?.message;
      // auth and not_found are configuration problems: retrying only wastes the
      // recruiter's time and the rate limit.
      if (kind === "auth" || kind === "not_found") {
        console.error(`[llm:${label}] failed (${kind}): ${detail}`);
        throw new LlmError(kind, USER_MESSAGE[kind], attempt, detail);
      }

      if (kind === "malformed") {
        if (repairs >= MAX_REPAIRS) {
          throw new LlmError(kind, USER_MESSAGE.malformed, attempt, detail);
        }
        repairs++;
        // Hand the validation errors back and ask for a corrected document.
        repairHint =
          `Your previous response did not satisfy the required schema (${detail}). ` +
          `Return the corrected JSON only. No prose, no markdown fence.`;
        notes.push("Response was malformed; asked the model to repair it.");
        continue;
      }

      if (kind === "rate_limit" || kind === "server") {
        // Capacity follows the model, not the request. Park this one for as long
        // as Google says, then move to one that is not parked.
        const parkFor = kind === "rate_limit" ? retryDelayMs(detail) : 20_000;
        cooldownUntil.set(model, Date.now() + parkFor);

        const next = nextUsableModel(0);
        if (next === -1) {
          const wait = Math.ceil(soonestRecoveryMs() / 1000);
          console.error(`[llm:${label}] every model is rate limited; soonest in ${wait}s`);
          throw new LlmError("rate_limit", exhaustedMessage(wait), attempt, detail);
        }

        modelIndex = next;
        const previous = model;
        model = MODEL_CHAIN[modelIndex];
        notes.push(`${previous} was unavailable; switched to ${model}.`);
        console.warn(`[llm:${label}] ${kind} on ${previous} (parked ${Math.round(parkFor / 1000)}s), trying ${model}`);
        await sleep(250);
        continue;
      }

      if (kind === "timeout") {
        const backoff = 600 * 2 ** (attempt - 1) + Math.random() * 300;
        notes.push(`Timed out; retrying.`);
        console.warn(`[llm:${label}] timeout on attempt ${attempt}, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }

      throw new LlmError(kind, USER_MESSAGE[kind], attempt, detail);
    }
  }

  const kind = classify(lastError);
  throw new LlmError(kind, USER_MESSAGE[kind], MAX_CALLS, String(lastError));
}

/** Uniform error body so every route fails the same shape. */
export function errorResponse(err: unknown): Response {
  const e =
    err instanceof LlmError ? err : new LlmError(classify(err), USER_MESSAGE[classify(err)], 1, String(err));
  const status = { rate_limit: 429, timeout: 504, auth: 401, not_found: 502, server: 502, malformed: 502, unknown: 500 }[e.kind];
  console.error(`[llm] responding ${status} (${e.kind}): ${e.detail ?? e.message}`);
  return Response.json(
    { error: { kind: e.kind, message: e.userMessage, attempts: e.attempts } },
    { status },
  );
}
