"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  SearchX,
  ShieldAlert,
  Undo2,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { NearMiss, Relaxation } from "@/lib/filter";
import type { Round } from "@/lib/schema";
import type { SearchChange } from "@/lib/diff";
import type { ErrorState } from "@/lib/session";

/* ─────────────────────────── Thinking ─────────────────────────── */

const PHASE_LABEL: Record<string, string> = {
  interpreting: "Reading your requirement",
  scoring: "Scoring matches",
  refining: "Applying your feedback",
};

/**
 * Fixed to the top of the window, so it is visible whatever the layout does and
 * however far the recruiter has scrolled. On a narrow screen the filter column
 * stacks above the results and pushes the skeletons a full screen down. A
 * loading state you have to go looking for is not a loading state.
 */
export function TopProgress({ phase }: { phase: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="fixed inset-x-0 top-0 z-50" role="status" aria-live="polite">
      <div className="h-0.5 w-full overflow-hidden bg-forest/10">
        <div className="progress-bar h-full w-full bg-lime-deep [animation:progress-slide_1.5s_ease-in-out_infinite]" />
      </div>
      <div className="flex justify-center">
        <span className="flex items-center gap-2 rounded-b-lg bg-forest px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-sm">
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
          {PHASE_LABEL[phase] ?? "Working"}
          {seconds >= 2 && <span className="tnum text-primary-foreground/60">{seconds}s</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * Each phase's real sub-steps, with how long each typically takes before the
 * next begins. The final step has no duration: it stays active until the
 * response actually lands, so the UI never claims to have finished work it
 * cannot see.
 */
const STEPS: Record<string, { label: string; after: number }[]> = {
  interpreting: [
    { label: "Reading your requirement", after: 0 },
    { label: "Separating facts from judgement", after: 2200 },
    { label: "Expanding skills into tiers", after: 5200 },
  ],
  scoring: [
    { label: "Filtering the pool", after: 0 },
    { label: "Reading matched profiles", after: 1400 },
    { label: "Scoring against each criterion", after: 4200 },
  ],
  refining: [
    { label: "Reading your feedback", after: 0 },
    { label: "Diagnosing what to change", after: 2400 },
    { label: "Re-running the search", after: 6000 },
  ],
};

/** Past this, the wait is unusual and the recruiter deserves to be told why. */
const SLOW_AFTER_MS = 14_000;

function StepRow({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs transition-colors duration-500",
        state === "done" && "text-muted-foreground",
        state === "active" && "font-medium text-foreground",
        state === "pending" && "text-muted-foreground/45",
      )}
    >
      <span className="relative flex size-3.5 shrink-0 items-center justify-center">
        {state === "done" ? (
          <Check className="size-3 text-forest" />
        ) : state === "active" ? (
          <>
            {/* A ring that expands and fades: motion with direction, not a blink. */}
            <span className="absolute inline-flex size-3.5 animate-ping rounded-full bg-lime-deep/40 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-lime-deep" />
          </>
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/25" />
        )}
      </span>
      {label}
    </div>
  );
}

export function Thinking({ phase, note }: { phase: keyof typeof STEPS | string; note?: string }) {
  const steps = STEPS[phase] ?? [{ label: "Working", after: 0 }];
  // Mounted fresh per phase (the parent keys on it), so state needs no resetting.
  const [current, setCurrent] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Advance through this phase's steps, but never past the last one.
  useEffect(() => {
    const timers = steps
      .map((step, i) =>
        step.after > 0 ? setTimeout(() => setCurrent((c) => Math.max(c, i)), step.after) : null,
      )
      .filter((t): t is ReturnType<typeof setTimeout> => t !== null);
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The one genuinely truthful progress signal we have.
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(id);
  }, []);

  const seconds = Math.floor(elapsed / 1000);
  const slow = elapsed > SLOW_AFTER_MS;

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <StepRow
              key={step.label}
              label={step.label}
              state={i < current ? "done" : i === current ? "active" : "pending"}
            />
          ))}
        </div>

        <div className="flex flex-col items-end gap-1 self-start">
          {seconds >= 3 && (
            <span className="tnum text-[11px] text-muted-foreground">{seconds}s</span>
          )}
          {slow && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> the model is busy, still trying
            </span>
          )}
        </div>
      </div>

      {note && (
        <p className="flex items-center gap-1.5 rounded-lg bg-tint-butter/50 px-2.5 py-1.5 text-[11px] text-forest">
          <RotateCcw className="size-3 shrink-0" /> {note}
        </p>
      )}

      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="shimmer rounded-2xl border border-border bg-card p-4"
            style={{ animationDelay: `${i * 180}ms` }}
          >
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Failure ─────────────────────────── */

const ERROR_ICON: Record<string, typeof AlertCircle> = {
  rate_limit: Clock,
  timeout: Clock,
  network: WifiOff,
  auth: ShieldAlert,
  malformed: AlertCircle,
};

const STAGE_LABEL: Record<string, string> = {
  interpret: "reading your requirement",
  score: "scoring the matches",
  refine: "applying your feedback",
};

/**
 * A failure the recruiter can act on: what broke, what we already tried on their
 * behalf, and the one button that makes sense next.
 */
export function Failure({
  error,
  onRetry,
  onDismiss,
}: {
  error: ErrorState;
  onRetry: () => void;
  onDismiss?: () => void;
}) {
  const Icon = ERROR_ICON[error.kind] ?? AlertCircle;
  const configProblem = error.kind === "auth" || error.kind === "not_found";

  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Something went wrong {STAGE_LABEL[error.stage] ?? ""}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
          </div>

          {error.attempts > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Tried <span className="tnum">{error.attempts}</span> times with backoff, and switched
              models where that could help.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {!configProblem && (
              <Button size="sm" onClick={onRetry} className="h-8 bg-forest text-primary-foreground hover:bg-forest/90">
                <RotateCcw className="size-3.5" /> Try again
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss} className="h-8 text-muted-foreground">
                Dismiss
              </Button>
            )}
          </div>

          {configProblem && (
            <p className="rounded-lg bg-card px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
              Set GEMINI_API_KEY in .env.local, then restart the dev server.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scoring failed but filtering did not. Say so plainly rather than showing a blank page. */
export function DegradedBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-tint-butter/60 px-3.5 py-2.5">
      <p className="flex items-center gap-2 text-xs text-forest">
        <AlertCircle className="size-3.5 shrink-0" />
        Ranking is unavailable, so these are filter matches in no particular order.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} className="h-7 border-forest/20 bg-card text-xs">
        <RotateCcw className="size-3" /> Retry ranking
      </Button>
    </div>
  );
}

/* ─────────────────────────── Empty ─────────────────────────── */

/**
 * The empty state diagnoses instead of apologising. We already know which
 * criterion emptied the pool and what dropping any single one would yield, so
 * the recruiter gets the way out rather than a shrug.
 */
export function EmptyResults({
  relaxations,
  onRelax,
}: {
  relaxations: Relaxation[];
  onRelax: (criterionIds: string[]) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <SearchX className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Nobody matches all of these filters</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {relaxations.length > 0
              ? "The funnel shows where the pool ran out. Relaxing one filter would open it back up:"
              : "Try removing a filter, or accepting a weaker skill tier."}
          </p>

          {relaxations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {relaxations.slice(0, 3).map((r) => (
                <button
                  key={r.criterionIds.join("+")}
                  type="button"
                  onClick={() => onRelax(r.criterionIds)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-cream px-3 py-2.5 text-left transition-colors hover:border-forest/30 hover:bg-tint-mint/40"
                >
                  <span className="min-w-0 text-xs text-foreground">
                    Drop <span className="font-medium">{r.labels.join(" and ")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-forest">
                    <span className="tnum">{r.wouldYield}</span> matches
                    <ArrowRight className="size-3" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Near misses ─────────────────────────── */

/**
 * The recruiter's real question is rarely "who matches". It is "who nearly
 * matches, and is it worth bending?" These are profiles failing exactly one
 * criterion, which the funnel already tells us for free.
 */
export function NearMisses({
  nearMisses,
  onRelax,
}: {
  nearMisses: NearMiss[];
  onRelax: (criterionIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (nearMisses.length === 0) return null;

  const byCriterion = nearMisses.reduce<Record<string, NearMiss[]>>((acc, nm) => {
    (acc[nm.missedId] ??= []).push(nm);
    return acc;
  }, {});

  return (
    <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="text-xs text-foreground">
          <span className="tnum font-semibold">{nearMisses.length}</span> profiles missed by exactly one filter
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {Object.entries(byCriterion).map(([id, group]) => (
            <div key={id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  Missed only on <span className="font-medium text-foreground">{group[0].missedLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRelax([id])}
                  className="shrink-0 text-[11px] font-medium text-forest underline decoration-dotted underline-offset-2 hover:text-forest-soft"
                >
                  drop this filter
                </button>
              </div>
              <div className="space-y-1">
                {group.map((nm) => (
                  <div key={nm.profile.id} className="flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="truncate text-foreground">{nm.profile.name}</span>
                    <span className="shrink-0 truncate text-muted-foreground">
                      {nm.profile.current_title} · {nm.profile.years_experience}y · {nm.profile.location}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Change log ─────────────────────────── */

/**
 * Changes are rendered from the structural diff, never from the model's own
 * before/after strings. Those were raw JSON, and they went stale as soon as the
 * recruiter edited a filter by hand. Structure comes from the real state; the
 * model contributes the reasoning, which is what it is actually good at.
 */
export function ChangeList({
  changes,
  reasons = [],
  emptyLabel = "No changes. Your feedback confirmed the current search.",
}: {
  changes: SearchChange[];
  /** The model's plain-language explanations, when a refinement drove this. */
  reasons?: string[];
  emptyLabel?: string;
}) {
  if (changes.length === 0 && reasons.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {changes.length > 0 && (
        <ul className="space-y-1.5">
          {changes.map((c, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">{c.what}</span>

              {c.added && (
                <span className="inline-flex items-center gap-1 rounded-md bg-tint-mint px-1.5 py-0.5 font-medium text-forest">
                  <Plus className="size-2.5" />
                  {c.added}
                </span>
              )}

              {c.removed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive line-through decoration-destructive/40">
                  <Minus className="size-2.5" />
                  {c.removed}
                </span>
              )}

              {c.to !== undefined && c.from !== undefined && (
                <span className="inline-flex items-center gap-1.5">
                  {c.from && <span className="text-muted-foreground line-through decoration-muted-foreground/40">{c.from}</span>}
                  {c.from && <ArrowRight className="size-2.5 text-muted-foreground" />}
                  <span className="font-medium text-foreground">{c.to}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {reasons.length > 0 && (
        <ul className="space-y-1.5 border-t border-border pt-2.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/40" />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Contradictions are surfaced, not smoothed over. A tool that silently flips a
 * filter back and forth to please whoever spoke last is one a recruiter stops
 * believing.
 */
export function Contradiction({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-tint-butter/60 px-3 py-2.5">
      <AlertCircle className="mt-px size-3.5 shrink-0 text-amber-700" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-forest">This conflicts with earlier feedback</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-forest/80">{text}</p>
      </div>
    </div>
  );
}

export function RoundHistory({
  rounds,
  onRevert,
  readOnly = false,
}: {
  rounds: Round[];
  onRevert?: (n: number) => void;
  readOnly?: boolean;
}) {
  if (rounds.length === 0) return null;
  return (
    <ol className="space-y-3">
      {rounds.map((r) => (
        <li key={r.n} className="relative space-y-1.5 border-l-2 border-border pl-3.5">
          <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-forest" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-foreground">Round {r.n}</span>
            {!readOnly && onRevert && (
              <button
                type="button"
                onClick={() => onRevert(r.n)}
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-forest"
              >
                <Undo2 className="size-2.5" /> revert to here
              </button>
            )}
          </div>
          {r.note && <p className="text-[11px] italic leading-relaxed text-muted-foreground">“{r.note}”</p>}
          {r.contradiction && <Contradiction text={r.contradiction} />}
          <ChangeList changes={r.changes} reasons={r.reasons} />
        </li>
      ))}
    </ol>
  );
}
