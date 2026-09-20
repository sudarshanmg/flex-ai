"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Landing } from "@/components/sourcing/landing";
import { FilterPanel } from "@/components/sourcing/filter-panel";
import { RubricPanel } from "@/components/sourcing/rubric-panel";
import { ProfileCard } from "@/components/sourcing/profile-card";
import { Composer } from "@/components/sourcing/composer";
import { FrozenView } from "@/components/sourcing/frozen";
import { TierLegend } from "@/components/sourcing/tier";
import {
  ChangeList,
  Contradiction,
  DegradedBanner,
  EmptyResults,
  Failure,
  NearMisses,
  RoundHistory,
  Thinking,
  TopProgress,
} from "@/components/sourcing/states";
import { rank } from "@/lib/rank";
import { diffSearch } from "@/lib/diff";
import {
  api,
  describeVerdicts,
  initialSession,
  RequestFailed,
  toFeedback,
  type SessionState,
  type Stage,
} from "@/lib/session";
import type { Filters, Rubric, Verdict } from "@/lib/schema";

/** How many profiles the recruiter reviews per round. */
const PAGE = 5;

export default function Page() {
  const [s, setS] = useState<SessionState>(initialSession);
  const patch = useCallback((p: Partial<SessionState>) => setS((prev) => ({ ...prev, ...p })), []);

  /* Ranking is derived, never stored: it recomputes from the rubric's current
   * weights, so editing a weight re-orders the list with no model call. */
  const ranked = useMemo(
    () => (s.result && s.rubric ? rank(s.result.matched, s.scores, s.rubric) : []),
    [s.result, s.scores, s.rubric],
  );

  const shown = ranked.slice(0, PAGE);
  const nameOf = useCallback(
    (id: string) => s.result?.matched.find((m) => m.profile.id === id)?.profile.name ?? id,
    [s.result],
  );

  const fail = (stage: Stage, err: unknown) => {
    const info = err instanceof RequestFailed ? err.info : { kind: "unknown", message: String(err), attempts: 0 };
    setS((prev) => ({
      ...prev,
      phase: prev.filters ? "reviewing" : "landing",
      // Scoring can fail while filtering succeeded, so show what we have rather
      // than throwing the whole screen away.
      degraded: stage === "score" && prev.result !== null,
      error: { stage, ...info },
    }));
  };

  /* ─────────────── search ─────────────── */

  const runScore = useCallback(
    async (filters: Filters, rubric: Rubric, base?: Partial<SessionState>) => {
      setS((prev) => ({
        ...prev,
        ...base,
        phase: "scoring",
        error: null,
        // Snapshot what this run is based on, so the next run can diff against
        // it whether the change came from the model or from the recruiter.
        baseline: { filters, rubric },
      }));
      try {
        const r = await api.score(filters, rubric, s.fault);
        setS((prev) => ({
          ...prev,
          phase: "reviewing",
          result: { matched: r.matched, funnel: r.funnel, nearMisses: r.nearMisses, relaxations: r.relaxations, total: r.total },
          scores: r.scores,
          truncated: r.truncated,
          stale: false,
          // The filters still ran, so the funnel and the shortlist are real.
          // only the ranking is missing, and we say so rather than hide it.
          degraded: r.llmError !== undefined,
          verdicts: {},
          notes: r.meta.notes,
          error: null,
        }));
      } catch (err) {
        fail("score", err);
      }
    },
    [s.fault],
  );

  const search = useCallback(
    async (query: string) => {
      setS({ ...initialSession, query, fault: s.fault, phase: "interpreting" });
      try {
        const r = await api.interpret(query, s.fault);
        await runScore(r.filters, r.rubric, {
          filters: r.filters,
          rubric: r.rubric,
          interpretation: r.interpretation,
          notes: r.meta.notes,
        });
      } catch (err) {
        fail("interpret", err);
      }
    },
    [s.fault, runScore],
  );

  /* ─────────────── refine ─────────────── */

  const refine = useCallback(async () => {
    if (!s.filters || !s.rubric) return;
    patch({ phase: "refining", error: null });
    try {
      const r = await api.refine({
        filters: s.filters,
        rubric: s.rubric,
        shownIds: shown.map((x) => x.profile.id),
        feedback: toFeedback(s.verdicts),
        note: s.note,
        history: s.rounds,
        fault: s.fault,
      });

      // Derived from the real before and after, so it cannot disagree with the
      // filters on screen. The model supplies only the reasoning.
      const changes = diffSearch(
        { filters: s.filters, rubric: s.rubric },
        { filters: r.filters, rubric: r.rubric },
      );
      const reasons = r.changes.map((c) => c.reason).filter(Boolean);

      const round = {
        n: s.rounds.length + 1,
        feedback: toFeedback(s.verdicts),
        note: s.note,
        changes,
        reasons,
        summary: r.summary,
        contradiction: r.contradiction,
        filters: r.filters,
        rubric: r.rubric,
      };

      await runScore(r.filters, r.rubric, {
        filters: r.filters,
        rubric: r.rubric,
        rounds: [...s.rounds, round],
        lastChanges: changes,
        lastReasons: reasons,
        lastSummary: r.summary,
        lastAuthor: "model",
        contradiction: r.contradiction,
        note: "",
      });
    } catch (err) {
      fail("refine", err);
    }
  }, [s, shown, patch, runScore]);

  /* ─────────────── local edits ─────────────── */

  const editFilters = (next: Filters) => patch({ filters: next, stale: true });
  const editRubric = (next: Rubric) => patch({ rubric: next, stale: true });

  /** Re-run after hand edits. The change log describes what the recruiter did. */
  const rerun = () => {
    if (!s.filters || !s.rubric) return;
    const changes = s.baseline ? diffSearch(s.baseline, { filters: s.filters, rubric: s.rubric }) : [];
    runScore(s.filters, s.rubric, {
      lastChanges: changes,
      lastReasons: [],
      lastSummary: "",
      lastAuthor: "you",
      contradiction: null,
    });
  };

  const setVerdict = (id: string, v: Verdict | undefined) => {
    setS((prev) => {
      const verdicts = { ...prev.verdicts };
      if (v) verdicts[id] = v;
      else delete verdicts[id];
      // Thumbs compose into words, so the model receives one clear signal and
      // the recruiter can extend it before sending.
      return { ...prev, verdicts, note: describeVerdicts(verdicts, nameOf) };
    });
  };

  /** Drop criteria. Powers both the empty state and the near-miss drawer. */
  const relax = (criterionIds: string[]) => {
    if (!s.filters || !s.rubric) return;
    const next = criterionIds.reduce<Filters>((f, id) => {
      if (id.startsWith("skill:"))
        return {
          ...f,
          skillRequirements: f.skillRequirements.map((r) =>
            `skill:${r.canonical}` === id ? { ...r, required: false } : r,
          ),
        };
      if (id === "years") return { ...f, yearsMin: null, yearsMax: null };
      if (id === "location") return { ...f, locations: [] };
      if (id === "companyType") return { ...f, companyTypes: [] };
      if (id === "title") return { ...f, titleKeywords: [] };
      return f;
    }, s.filters);
    runScore(next, s.rubric, { filters: next });
  };

  const revert = (n: number) => {
    const round = s.rounds.find((r) => r.n === n);
    if (!round) return;
    runScore(round.filters, round.rubric, {
      filters: round.filters,
      rubric: round.rubric,
      rounds: s.rounds.slice(0, n),
      lastChanges: round.changes,
      lastReasons: round.reasons,
      lastSummary: round.summary,
      lastAuthor: "model",
      contradiction: round.contradiction,
    });
  };

  const retry = () => {
    if (!s.error) return;
    if (s.error.stage === "interpret") search(s.query);
    else if (s.filters && s.rubric) runScore(s.filters, s.rubric);
  };

  /* ─────────────── render ─────────────── */

  const busy = s.phase === "interpreting" || s.phase === "scoring" || s.phase === "refining";

  if (s.phase === "landing") {
    return (
      <Landing
        busy={busy}
        fault={s.fault}
        initialQuery={s.query}
        error={s.error}
        onSearch={search}
        onFaultChange={(f) => patch({ fault: f })}
        onDismissError={() => patch({ error: null })}
      />
    );
  }

  if (s.phase === "frozen" && s.filters && s.rubric && s.result) {
    return (
      <FrozenView
        query={s.query}
        filters={s.filters}
        rubric={s.rubric}
        result={s.result}
        ranked={ranked}
        rounds={s.rounds}
        onReopen={() => patch({ phase: "reviewing" })}
        onRestart={() => setS({ ...initialSession, fault: s.fault })}
      />
    );
  }

  if (!s.filters || !s.rubric) {
    return (
      <>
        <TopProgress phase={s.phase} />
        <div className="mx-auto max-w-2xl px-5 py-16">
          <Thinking key={s.phase} phase={s.phase} />
        </div>
      </>
    );
  }

  const empty = s.result !== null && s.result.matched.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      {busy && <TopProgress phase={s.phase} />}

      {/* ── header ── */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Searching for</p>
          <h1 className="text-pretty text-lg font-semibold leading-snug text-foreground">{s.query}</h1>
          {s.interpretation && (
            <p className="max-w-3xl text-pretty text-xs leading-relaxed text-muted-foreground">
              {s.interpretation}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setS({ ...initialSession, fault: s.fault })}
          className="h-8 shrink-0 text-xs text-muted-foreground"
        >
          <RotateCcw className="size-3.5" /> New search
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── filters + rubric: always visible ── */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</h2>
            <FilterPanel filters={s.filters} result={s.result} onChange={editFilters} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fit rubric</h2>
            <RubricPanel rubric={s.rubric} onChange={editRubric} />
          </section>

          {s.stale && (
            <div className="sticky bottom-4 rounded-xl border border-forest/20 bg-forest p-3 shadow-lg">
              <p className="text-[11px] text-primary-foreground/80">
                Filters or rubric changed since the last run.
              </p>
              <Button
                size="sm"
                onClick={rerun}
                disabled={busy}
                className="mt-2 h-7 w-full bg-lime text-xs font-semibold text-forest hover:bg-lime-deep"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Re-run search"}
              </Button>
            </div>
          )}
        </aside>

        {/* ── results ── */}
        <main className="min-w-0 space-y-4">
          {s.error && <Failure error={s.error} onRetry={retry} onDismiss={() => patch({ error: null })} />}
          {s.degraded && !s.error && (
            <DegradedBanner onRetry={() => s.filters && s.rubric && runScore(s.filters, s.rubric)} />
          )}

          {s.lastChanges.length > 0 && !busy && (
            <section className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.lastAuthor === "you" ? "Your edits" : "What changed"}
                </h2>
                <span className="tnum text-[11px] text-muted-foreground">
                  {s.lastAuthor === "you" ? "hand edited" : `Round ${s.rounds.length}`}
                </span>
              </div>
              {s.contradiction && <Contradiction text={s.contradiction} />}
              {s.lastSummary && <p className="text-xs leading-relaxed text-foreground">{s.lastSummary}</p>}
              <ChangeList
                changes={s.lastChanges}
                reasons={s.lastReasons}
                emptyLabel="Nothing changed in the filters or rubric."
              />
            </section>
          )}

          {busy ? (
            <Thinking
              key={s.phase}
              phase={s.phase}
              note={s.notes.find((n) => n.includes("switch") || n.includes("retry"))}
            />
          ) : empty ? (
            <EmptyResults relaxations={s.result?.relaxations ?? []} onRelax={relax} />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top <span className="tnum">{shown.length}</span> of{" "}
                  <span className="tnum">{ranked.length}</span> matches
                  {s.truncated > 0 && (
                    <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
                      ({s.truncated} more matched but were not scored)
                    </span>
                  )}
                </h2>
                <TierLegend />
              </div>

              <div className="space-y-3">
                {shown.map((r, i) => (
                  <ProfileCard
                    key={r.profile.id}
                    ranked={r}
                    rubric={s.rubric!}
                    rank={i + 1}
                    verdict={s.verdicts[r.profile.id]}
                    onVerdict={(v) => setVerdict(r.profile.id, v)}
                  />
                ))}
              </div>
            </>
          )}

          {s.result && !busy && <NearMisses nearMisses={s.result.nearMisses} onRelax={relax} />}

          {!busy && (
            <div className="sticky bottom-4">
              <Composer
                note={s.note}
                verdictCount={Object.keys(s.verdicts).length}
                busy={busy}
                canFreeze={ranked.length > 0}
                fault={s.fault}
                onNoteChange={(v) => patch({ note: v })}
                onRefine={refine}
                onFreeze={() => patch({ phase: "frozen" })}
                onFaultChange={(f) => patch({ fault: f })}
              />
            </div>
          )}

          {s.rounds.length > 0 && !busy && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Refinement history
              </h2>
              <RoundHistory rounds={s.rounds} onRevert={revert} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
