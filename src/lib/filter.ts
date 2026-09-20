import type { Filters, Profile, SkillRequirement, SkillTier } from "./schema";

/* ───────────────────────────────────────────────────────────────────────────
 * The deterministic half of the product.
 *
 * The LLM decides *what* to look for. This file decides *who matches*, in
 * plain code: instant, repeatable, and inspectable. Every recruiter-visible
 * number (the funnel, the near-misses, the relaxation hints) is derived
 * here from one list of named criteria, so they can never disagree with
 * each other.
 * ─────────────────────────────────────────────────────────────────────────── */

const TIER_RANK: Record<SkillTier, number> = { direct: 0, implied: 1, transferable: 2 };

/** Lowercase, strip punctuation and spaces: "AWS RDS" → "awsrds". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Deliberately conservative. Exact match, or a prefix match where the shorter
 * string is at least 6 characters ("postgres" ⊂ "postgresql"). The 6-char floor
 * is what stops the classic "java" ⊂ "javascript" false positive.
 *
 * Anything looser than spelling is the model's job: it enumerates real variants
 * into `direct`, and the recruiter can see and edit that list.
 */
function skillsEqual(a: string, b: string): boolean {
  const [x, y] = [norm(a), norm(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short);
}

export type SkillMatch = {
  canonical: string;
  tier: SkillTier;
  /** The profile skill that satisfied the requirement: the bridge we show the recruiter. */
  via: string;
};

/** Strongest tier at which this profile satisfies the requirement, or null. */
export function matchSkill(profile: Profile, req: SkillRequirement): SkillMatch | null {
  const tiers: [SkillTier, string[]][] = [
    ["direct", req.direct],
    ["implied", req.implied],
    ["transferable", req.transferable],
  ];
  for (const [tier, candidates] of tiers) {
    for (const want of candidates) {
      const hit = profile.skills.find((have) => skillsEqual(have, want));
      if (hit) return { canonical: req.canonical, tier, via: hit };
    }
  }
  return null;
}

/** Every required skill satisfied at or above the accepted tier. */
export function skillMatches(profile: Profile, filters: Filters): SkillMatch[] {
  return filters.skillRequirements
    .map((req) => matchSkill(profile, req))
    .filter((m): m is SkillMatch => m !== null);
}

/** The weakest bridge used, which is what the profile's overall match is worth. */
export function weakestTier(matches: SkillMatch[]): SkillTier | null {
  if (matches.length === 0) return null;
  return matches.reduce((worst, m) => (TIER_RANK[m.tier] > TIER_RANK[worst] ? m.tier : worst), "direct" as SkillTier);
}

/* ─────────────────────────── Criteria ─────────────────────────── */

export type Criterion = {
  id: string;
  label: string;
  test: (p: Profile) => boolean;
};

const matchesText = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Turn a Filters object into an ordered list of independent predicates.
 * Everything downstream is a fold over this list.
 */
export function buildCriteria(filters: Filters): Criterion[] {
  const criteria: Criterion[] = [];

  for (const req of filters.skillRequirements) {
    if (!req.required) continue;
    criteria.push({
      id: `skill:${req.canonical}`,
      label: req.canonical,
      test: (p) => {
        const m = matchSkill(p, req);
        return m !== null && TIER_RANK[m.tier] <= TIER_RANK[filters.acceptedTier];
      },
    });
  }

  if (filters.yearsMin !== null || filters.yearsMax !== null) {
    const lo = filters.yearsMin ?? 0;
    const hi = filters.yearsMax ?? Infinity;
    criteria.push({
      id: "years",
      label:
        filters.yearsMax === null
          ? `${lo}+ years`
          : filters.yearsMin === null
            ? `up to ${hi} years`
            : `${lo}–${hi} years`,
      test: (p) => p.years_experience >= lo && p.years_experience <= hi,
    });
  }

  if (filters.locations.length > 0) {
    criteria.push({
      id: "location",
      label: filters.locations.join(" or "),
      test: (p) => filters.locations.some((l) => matchesText(p.location, l)),
    });
  }

  if (filters.companyTypes.length > 0) {
    criteria.push({
      id: "companyType",
      label: filters.companyTypes.join(" or "),
      // Past companies count: "worked at startups" is a career fact, not a current one.
      test: (p) =>
        filters.companyTypes.includes(p.current_company_type) ||
        p.past_companies.some((c) => filters.companyTypes.includes(c.company_type)),
    });
  }

  if (filters.titleKeywords.length > 0) {
    criteria.push({
      id: "title",
      label: filters.titleKeywords.join(" or "),
      test: (p) =>
        filters.titleKeywords.some(
          (k) => matchesText(p.current_title, k) || p.past_companies.some((c) => matchesText(c.title, k)),
        ),
    });
  }

  return criteria;
}

/* ─────────────────────────── Results ─────────────────────────── */

export type Matched = {
  profile: Profile;
  skillMatches: SkillMatch[];
  tier: SkillTier | null;
};

export type FunnelStep = {
  id: string;
  label: string;
  /** Survivors remaining after this criterion is applied on top of the previous ones. */
  remaining: number;
  /** How many this criterion alone removed at this point. */
  removed: number;
};

export type NearMiss = {
  profile: Profile;
  /** The single criterion standing between this profile and the shortlist. */
  missedId: string;
  missedLabel: string;
};

export type Relaxation = {
  /** The criteria to drop together. Usually one, but an over-constrained
   *  search often needs a pair before anybody survives. */
  criterionIds: string[];
  labels: string[];
  wouldYield: number;
};

export type FilterResult = {
  matched: Matched[];
  funnel: FunnelStep[];
  nearMisses: NearMiss[];
  relaxations: Relaxation[];
  total: number;
};

export function applyFilters(profiles: Profile[], filters: Filters): FilterResult {
  const criteria = buildCriteria(filters);

  // Funnel: progressive intersection, so each row reads as "and then".
  const funnel: FunnelStep[] = [];
  let surviving = profiles;
  for (const c of criteria) {
    const before = surviving.length;
    surviving = surviving.filter(c.test);
    funnel.push({ id: c.id, label: c.label, remaining: surviving.length, removed: before - surviving.length });
  }

  const matched: Matched[] = surviving.map((profile) => {
    const ms = skillMatches(profile, filters);
    return { profile, skillMatches: ms, tier: weakestTier(ms) };
  });

  // Near misses: failing exactly one criterion. The recruiter's real question.
  const nearMisses: NearMiss[] = [];
  if (criteria.length > 1) {
    for (const profile of profiles) {
      const failed = criteria.filter((c) => !c.test(profile));
      if (failed.length === 1) {
        nearMisses.push({ profile, missedId: failed[0].id, missedLabel: failed[0].label });
      }
    }
  }

  // What dropping filters would buy. This powers the empty state, so it has to
  // find an answer even when several filters independently empty the pool.
  // Single drops first, then pairs, then a greedy fallback: always the smallest
  // concession that actually gets the recruiter moving again.
  const yieldWithout = (dropped: Set<string>) =>
    profiles.filter((p) => criteria.every((c) => dropped.has(c.id) || c.test(p))).length;

  const relaxations: Relaxation[] = [];
  const describe = (ids: string[]): Relaxation => ({
    criterionIds: ids,
    labels: ids.map((id) => criteria.find((c) => c.id === id)!.label),
    wouldYield: yieldWithout(new Set(ids)),
  });

  for (const c of criteria) {
    const r = describe([c.id]);
    if (r.wouldYield > matched.length) relaxations.push(r);
  }

  if (relaxations.length === 0) {
    for (let i = 0; i < criteria.length; i++) {
      for (let j = i + 1; j < criteria.length; j++) {
        const r = describe([criteria[i].id, criteria[j].id]);
        if (r.wouldYield > matched.length) relaxations.push(r);
      }
    }
  }

  if (relaxations.length === 0 && criteria.length > 2) {
    // Drop the most destructive criteria in turn until something survives.
    const order = [...criteria].sort(
      (a, b) => yieldWithout(new Set([b.id])) - yieldWithout(new Set([a.id])),
    );
    const dropped: string[] = [];
    for (const c of order) {
      dropped.push(c.id);
      const r = describe([...dropped]);
      if (r.wouldYield > matched.length) {
        relaxations.push(r);
        break;
      }
    }
  }

  relaxations.sort(
    (a, b) => a.criterionIds.length - b.criterionIds.length || b.wouldYield - a.wouldYield,
  );

  return { matched, funnel, nearMisses, relaxations, total: profiles.length };
}
