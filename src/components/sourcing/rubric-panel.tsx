"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEIGHTS, type Rubric, type Weight } from "@/lib/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WEIGHT_STYLE: Record<Weight, string> = {
  low: "bg-secondary text-muted-foreground border-border",
  medium: "bg-tint-sky text-forest border-forest/15",
  high: "bg-lime text-forest border-forest/20",
};

/**
 * The subjective half. Weights are applied in the browser, so dragging a
 * criterion from medium to high re-ranks the whole shortlist immediately:
 * no model call, no spinner. The expensive judgement was bought once, per
 * criterion; the arithmetic is free and belongs here.
 */
export function RubricPanel({
  rubric,
  readOnly = false,
  onChange,
}: {
  rubric: Rubric;
  readOnly?: boolean;
  onChange: (next: Rubric) => void;
}) {
  const setWeight = (id: string, weight: Weight) =>
    onChange({ ...rubric, criteria: rubric.criteria.map((c) => (c.id === id ? { ...c, weight } : c)) });

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-tint-mint/50 p-3">
        <p className="text-xs leading-relaxed text-forest">{rubric.roleSummary}</p>
      </div>

      <div className="space-y-2.5">
        {rubric.criteria.map((c) => (
          <div key={c.id} className="space-y-1.5 rounded-xl border border-border bg-card/60 p-3">
            <div className="space-y-2">
              <span className="block text-sm font-medium leading-snug text-foreground">{c.label}</span>
              <div className="flex gap-1">
                {WEIGHTS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setWeight(c.id, w)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-all",
                      c.weight === w
                        ? WEIGHT_STYLE[w]
                        : "border-transparent bg-transparent text-muted-foreground/50 hover:bg-secondary hover:text-muted-foreground",
                      readOnly && "pointer-events-none",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>
          </div>
        ))}
      </div>

      {!readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="flex cursor-help items-center gap-1.5 text-[11px] text-muted-foreground">
              <Zap className="size-3 text-lime-deep" />
              Changing a weight re-ranks instantly
            </p>
          </TooltipTrigger>
          <TooltipContent className="max-w-72 text-xs leading-relaxed">
            The model scores each criterion separately. Weighting happens here in the browser, so
            re-ordering the shortlist costs nothing and needs no model call.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
