"use client";

import { AlertTriangle, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WEIGHT_VALUE, type Rubric, type Verdict } from "@/lib/schema";
import type { Ranked } from "@/lib/rank";
import { validEvidence } from "@/lib/rank";
import { TierBadge } from "./tier";

function ScoreDial({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl border text-base font-semibold",
        muted
          ? "border-border bg-secondary text-muted-foreground"
          : value >= 80
            ? "border-forest/20 bg-lime text-forest"
            : value >= 60
              ? "border-forest/15 bg-tint-mint text-forest"
              : "border-border bg-secondary text-muted-foreground",
      )}
    >
      <span className="tnum">{muted ? "–" : value}</span>
    </div>
  );
}

/** Per-criterion bars: the ranking is legible rather than a single opaque number. */
function CriterionBars({ ranked, rubric }: { ranked: Ranked; rubric: Rubric }) {
  if (!ranked.score) return null;
  return (
    <div className="space-y-1">
      {rubric.criteria.map((c) => {
        const cs = ranked.score!.criterionScores.find((s) => s.criterionId === c.id);
        if (!cs) return null;
        return (
          <div key={c.id} className="group/bar flex items-center gap-2" title={cs.reason}>
            <span className="w-32 shrink-0 truncate text-[10px] text-muted-foreground">{c.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  cs.score >= 80 ? "bg-forest" : cs.score >= 55 ? "bg-forest-soft" : "bg-muted-foreground/40",
                )}
                style={{ width: `${cs.score}%` }}
              />
            </div>
            <span className="tnum w-6 shrink-0 text-right text-[10px] text-muted-foreground">{cs.score}</span>
            <span
              className={cn(
                "w-10 shrink-0 text-[9px] uppercase tracking-wide",
                WEIGHT_VALUE[c.weight] === 3 ? "text-forest" : "text-muted-foreground/60",
              )}
            >
              {c.weight}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ProfileCard({
  ranked,
  rubric,
  rank,
  verdict,
  readOnly = false,
  onVerdict,
}: {
  ranked: Ranked;
  rubric: Rubric;
  rank: number;
  verdict?: Verdict;
  readOnly?: boolean;
  onVerdict?: (v: Verdict | undefined) => void;
}) {
  const { profile, score, skillMatches } = ranked;
  const evidence = score ? validEvidence(score) : [];

  return (
    <article
      className={cn(
        "group rounded-2xl border bg-card p-4 transition-all",
        verdict === "yes" && "border-forest/40 bg-tint-mint/30 ring-1 ring-forest/20",
        verdict === "no" && "border-border opacity-55",
        !verdict && "border-border hover:border-forest/25 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <ScoreDial value={ranked.overall} muted={!score} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="tnum text-[11px] text-muted-foreground">#{rank}</span>
                <h3 className="truncate text-sm font-semibold text-foreground">{profile.name}</h3>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {profile.current_title} · {profile.years_experience}y · {profile.location}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {profile.current_company}{" "}
                <span className="text-muted-foreground/70">({profile.current_company_type})</span>
              </p>
            </div>

            {!readOnly && onVerdict && (
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${profile.name} is a match`}
                  aria-pressed={verdict === "yes"}
                  onClick={() => onVerdict(verdict === "yes" ? undefined : "yes")}
                  className={cn(
                    "size-8 rounded-lg",
                    verdict === "yes"
                      ? "bg-forest text-primary-foreground hover:bg-forest/90"
                      : "text-muted-foreground hover:bg-tint-mint hover:text-forest",
                  )}
                >
                  <ThumbsUp className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${profile.name} is not a match`}
                  aria-pressed={verdict === "no"}
                  onClick={() => onVerdict(verdict === "no" ? undefined : "no")}
                  className={cn(
                    "size-8 rounded-lg",
                    verdict === "no"
                      ? "bg-destructive text-white hover:bg-destructive/90"
                      : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  )}
                >
                  <ThumbsDown className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {skillMatches.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skillMatches.map((m) => (
                <TierBadge key={m.canonical} tier={m.tier} via={m.via} canonical={m.canonical} />
              ))}
            </div>
          )}
        </div>
      </div>

      {score ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-[13px] font-medium leading-snug text-foreground">{score.headline}</p>

          <CriterionBars ranked={ranked} rubric={rubric} />

          {evidence.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {evidence.map((e, i) => (
                <span
                  key={`${e.field}-${i}`}
                  className="inline-flex items-baseline gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px]"
                >
                  <span className="font-mono text-muted-foreground">{e.field}</span>
                  <span className="text-foreground">{e.value}</span>
                </span>
              ))}
            </div>
          )}

          {score.concern && (
            <p className="flex items-start gap-1.5 rounded-lg bg-tint-peach/50 px-2.5 py-2 text-[11px] leading-relaxed text-forest">
              <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
              <span>{score.concern}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Matched on filters. Not ranked, because scoring was unavailable.
        </p>
      )}
    </article>
  );
}
