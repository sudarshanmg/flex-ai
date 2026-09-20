"use client";

import { cn } from "@/lib/utils";
import type { FunnelStep } from "@/lib/filter";

const TINTS = ["bg-tint-mint", "bg-tint-sky", "bg-tint-lilac", "bg-tint-peach", "bg-tint-butter"];

/**
 * Where the pool went.
 *
 * A recruiter looking at six results wants to know what happened to the other
 * forty-two, and a recruiter looking at zero results needs to know which filter
 * did it. This is the same data in both cases, so it is always on screen rather
 * than appearing only when something goes wrong.
 */
export function Funnel({ total, steps }: { total: number; steps: FunnelStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No objective filters yet, so all <span className="tnum font-medium text-foreground">{total}</span> profiles
        are in play.
      </p>
    );
  }

  const left = steps[steps.length - 1].remaining;

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Talent pool
          </span>
          <span className="tnum text-[11px] text-muted-foreground">{total} profiles</span>
        </div>
        {/* Two bare numbers per row told the recruiter nothing. Say what the
            column means once, in words, and the rows read themselves. */}
        <p className="text-[11px] leading-snug text-muted-foreground">
          Each filter narrows the pool in turn. The number is how many are still left.
        </p>
      </div>

      <div className="space-y-1">
        {steps.map((step, i) => {
          const width = total === 0 ? 0 : (step.remaining / total) * 100;
          const emptied = step.remaining === 0;
          return (
            <div
              key={step.id}
              className="flex items-center gap-2"
              title={`${step.label}: ruled out ${step.removed}, left ${step.remaining}`}
            >
              {/* The label lives outside the bar: the steps that cut deepest have
                  the shortest bars, and those are exactly the ones worth reading. */}
              <span className="w-[5.5rem] shrink-0 truncate text-[11px] font-medium text-foreground">
                {step.label}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-md bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-md transition-[width] duration-500 ease-out",
                    emptied ? "bg-destructive/25" : TINTS[i % TINTS.length],
                  )}
                  style={{ width: `${emptied ? 100 : Math.max(width, 3)}%` }}
                />
              </div>
              <span
                className={cn(
                  "tnum w-[4.5rem] shrink-0 text-right text-[11px]",
                  emptied ? "font-semibold text-destructive" : "text-foreground",
                )}
              >
                {step.remaining} left
              </span>
            </div>
          );
        })}
      </div>

      <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span className="tnum font-semibold text-foreground">{left}</span> of{" "}
        <span className="tnum">{total}</span> profiles match every filter
        {total - left > 0 && (
          <>
            {" "}
            · <span className="tnum">{total - left}</span> ruled out
          </>
        )}
      </p>
    </div>
  );
}
