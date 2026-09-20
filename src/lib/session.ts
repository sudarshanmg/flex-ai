"use client";

import type { FilterResult } from "./filter";
import type {
  Change,
  Feedback,
  Filters,
  ProfileScore,
  Round,
  Rubric,
  Verdict,
} from "./schema";
import type { Fault } from "./llm";
import type { SearchChange } from "./diff";

/* ───────────────────────────────────────────────────────────────────────────
 * All session state lives here, in the browser. The server is stateless: each
 * call carries the state it needs. There is no persistence, no session store
 * and no database. The brief rules them out, and without them there is simply
 * less that can be wrong.
 * ─────────────────────────────────────────────────────────────────────────── */

export type Phase =
  | "landing"
  | "interpreting"
  | "scoring"
  | "reviewing"
  | "refining"
  | "frozen";

export type Stage = "interpret" | "score" | "refine";

export type ErrorState = {
  stage: Stage;
  kind: string;
  message: string;
  attempts: number;
};

export type SessionState = {
  phase: Phase;
  query: string;
  interpretation: string;
  filters: Filters | null;
  rubric: Rubric | null;
  result: FilterResult | null;
  scores: ProfileScore[];
  /** Set when filters/rubric were edited after the last scoring run. */
  stale: boolean;
  /** Scoring failed but filtering succeeded: show matches unranked, honestly. */
  degraded: boolean;
  truncated: number;
  verdicts: Record<string, Verdict>;
  note: string;
  rounds: Round[];
  /** The state the last scoring run was based on, for diffing the next one. */
  baseline: { filters: Filters; rubric: Rubric } | null;
  lastChanges: SearchChange[];
  lastReasons: string[];
  lastSummary: string;
  /** Who made the last change: the model, or the recruiter by hand. */
  lastAuthor: "model" | "you";
  contradiction: string | null;
  notes: string[];
  error: ErrorState | null;
  fault: Fault;
};

export const initialSession: SessionState = {
  phase: "landing",
  query: "",
  interpretation: "",
  filters: null,
  rubric: null,
  result: null,
  scores: [],
  stale: false,
  degraded: false,
  truncated: 0,
  verdicts: {},
  note: "",
  rounds: [],
  baseline: null,
  lastChanges: [],
  lastReasons: [],
  lastSummary: "",
  lastAuthor: "model",
  contradiction: null,
  notes: [],
  error: null,
  fault: "none",
};

/* ─────────────────────────── API ─────────────────────────── */

export type ApiError = { kind: string; message: string; attempts: number };

export class RequestFailed extends Error {
  constructor(readonly info: ApiError) {
    super(info.message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // The request never reached the server: offline, or the dev server died.
    throw new RequestFailed({
      kind: "network",
      message: "Could not reach the server. Check that it is still running.",
      attempts: 0,
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const info = (payload as { error?: ApiError } | null)?.error;
    throw new RequestFailed(
      info ?? { kind: "unknown", message: `Request failed (${response.status}).`, attempts: 0 },
    );
  }
  return payload as T;
}

export type Meta = { attempts: number; notes: string[] };

export type InterpretResult = {
  filters: Filters;
  rubric: Rubric;
  interpretation: string;
  meta: Meta;
};

export type ScoreResult = FilterResult & {
  scores: ProfileScore[];
  truncated: number;
  /** Set when filtering succeeded but ranking did not. Results are unranked. */
  llmError?: ApiError;
  meta: Meta;
};

export type RefineResult = {
  filters: Filters;
  rubric: Rubric;
  /** The model's own report. We keep the reasons and derive structure ourselves. */
  changes: Change[];
  contradiction: string | null;
  summary: string;
  meta: Meta;
};

export const api = {
  interpret: (query: string, fault: Fault) =>
    post<InterpretResult>("/api/interpret", { query, fault }),

  score: (filters: Filters, rubric: Rubric, fault: Fault) =>
    post<ScoreResult>("/api/score", { filters, rubric, fault }),

  refine: (args: {
    filters: Filters;
    rubric: Rubric;
    shownIds: string[];
    feedback: Feedback[];
    note: string;
    history: Round[];
    fault: Fault;
  }) => post<RefineResult>("/api/refine", args),
};

/* ─────────────────────────── Helpers ─────────────────────────── */

export function toFeedback(verdicts: Record<string, Verdict>): Feedback[] {
  return Object.entries(verdicts).map(([profileId, verdict]) => ({ profileId, verdict }));
}

/** A readable one-liner for the composer, so clicking thumbs produces words. */
export function describeVerdicts(
  verdicts: Record<string, Verdict>,
  nameOf: (id: string) => string,
): string {
  const yes = Object.entries(verdicts).filter(([, v]) => v === "yes").map(([id]) => nameOf(id));
  const no = Object.entries(verdicts).filter(([, v]) => v === "no").map(([id]) => nameOf(id));
  const parts: string[] = [];
  if (yes.length) parts.push(`${yes.join(", ")} ${yes.length === 1 ? "is" : "are"} right`);
  if (no.length) parts.push(`${no.join(", ")} ${no.length === 1 ? "is" : "are"} not`);
  return parts.join("; ");
}
