"use client";

import { Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterPanel } from "./filter-panel";
import { RubricPanel } from "./rubric-panel";
import { ProfileCard } from "./profile-card";
import { RoundHistory } from "./states";
import { TierLegend } from "./tier";
import type { Ranked } from "@/lib/rank";
import type { FilterResult } from "@/lib/filter";
import type { Filters, Round, Rubric } from "@/lib/schema";

/**
 * The frozen state is a receipt. It shows not just the final answer but how it
 * was arrived at: every round, every change and the reason given at the time,
 * because that history is what makes the shortlist defensible to someone who
 * was not in the room.
 */
export function FrozenView({
  query,
  filters,
  rubric,
  result,
  ranked,
  rounds,
  onReopen,
  onRestart,
}: {
  query: string;
  filters: Filters;
  rubric: Rubric;
  result: FilterResult;
  ranked: Ranked[];
  rounds: Round[];
  onReopen: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 rounded-2xl bg-forest p-6 text-primary-foreground">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-[11px] font-semibold text-forest">
              <Lock className="size-3" /> Search frozen
            </span>
            <h1 className="text-pretty text-xl font-semibold leading-snug">{query}</h1>
            <p className="text-xs text-primary-foreground/70">
              <span className="tnum">{ranked.length}</span> profiles shortlisted from{" "}
              <span className="tnum">{result.total}</span> ·{" "}
              <span className="tnum">{rounds.length}</span>{" "}
              {rounds.length === 1 ? "round" : "rounds"} of refinement
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onReopen}
              className="h-8 bg-white/10 text-xs text-primary-foreground hover:bg-white/20"
            >
              Reopen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRestart}
              className="h-8 text-xs text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
            >
              <RotateCcw className="size-3.5" /> New search
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Frozen filters
            </h2>
            <FilterPanel filters={filters} result={result} readOnly onChange={() => {}} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Frozen rubric
            </h2>
            <RubricPanel rubric={rubric} readOnly onChange={() => {}} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Final shortlist
              </h2>
              <TierLegend />
            </div>
            <div className="space-y-3">
              {ranked.map((r, i) => (
                <ProfileCard key={r.profile.id} ranked={r} rubric={rubric} rank={i + 1} readOnly />
              ))}
            </div>
          </section>

          {rounds.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How this search was refined
              </h2>
              <RoundHistory rounds={rounds} readOnly />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
