"use client";

import { CheckCircle2, GitBranch, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillTier } from "@/lib/schema";

/**
 * The tier vocabulary, defined once. Every place a tier appears (badge, filter
 * chip, legend, frozen summary) reads from here, so the language the recruiter
 * learns in one part of the screen is the language they meet everywhere else.
 */
export const TIER_META: Record<
  SkillTier,
  { label: string; icon: typeof CheckCircle2; chip: string; dot: string; blurb: string }
> = {
  direct: {
    label: "Direct",
    icon: CheckCircle2,
    chip: "bg-tint-mint text-forest border-forest/15",
    dot: "bg-forest",
    blurb: "Lists the skill itself",
  },
  implied: {
    label: "Implied",
    icon: GitBranch,
    chip: "bg-tint-sky text-forest border-forest/15",
    dot: "bg-sky-700",
    blurb: "Lists something that implies it: TypeScript implies JavaScript",
  },
  transferable: {
    label: "Transferable",
    icon: Shuffle,
    chip: "bg-tint-butter text-forest border-forest/15",
    dot: "bg-amber-600",
    blurb: "Adjacent enough to pick up quickly: C++ transfers to C",
  },
};

export function TierBadge({
  tier,
  via,
  canonical,
  className,
}: {
  tier: SkillTier;
  via?: string;
  canonical?: string;
  className?: string;
}) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        meta.chip,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {via && canonical ? (
        // Always name the bridge. A match the recruiter cannot trace is a match
        // they cannot trust.
        <span>
          {tier === "direct" ? canonical : `${canonical} via ${via}`}
        </span>
      ) : (
        <span>{meta.label}</span>
      )}
    </span>
  );
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {(Object.keys(TIER_META) as SkillTier[]).map((tier) => (
        <span key={tier} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", TIER_META[tier].dot)} aria-hidden />
          <span className="font-medium text-foreground">{TIER_META[tier].label}</span>
          <span className="hidden sm:inline">· {TIER_META[tier].blurb}</span>
        </span>
      ))}
    </div>
  );
}
