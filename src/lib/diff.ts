import { SKILL_TIERS, type Filters, type Rubric, type SkillTier } from "./schema";

/* ───────────────────────────────────────────────────────────────────────────
 * What actually changed between two states of the search.
 *
 * The model also reports its own changes, but those describe only the edits it
 * made: the moment the recruiter edits a filter by hand, the model's account is
 * stale and starts describing a search that no longer exists. So structure is
 * derived here, from the real before and after, and the model is left to supply
 * the one thing it is better at, which is why.
 * ─────────────────────────────────────────────────────────────────────────── */

export type SearchChange = {
  /** What was touched, in the recruiter's words. */
  what: string;
  /** A single added or removed value. */
  added?: string;
  removed?: string;
  /** A value that moved between two states. */
  from?: string;
  to?: string;
};

const listOf = (xs: string[]) => (xs.length === 0 ? "anywhere" : xs.join(", "));

function yearsLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return "any";
  if (max === null) return `${min}+ years`;
  if (min === null) return `up to ${max} years`;
  return `${min}–${max} years`;
}

function diffList(what: string, before: string[], after: string[]): SearchChange[] {
  const changes: SearchChange[] = [];
  for (const v of after) if (!before.includes(v)) changes.push({ what, added: v });
  for (const v of before) if (!after.includes(v)) changes.push({ what, removed: v });
  return changes;
}

export function diffFilters(before: Filters, after: Filters): SearchChange[] {
  const changes: SearchChange[] = [];

  // Skills, matched by canonical name.
  const beforeSkills = new Map(before.skillRequirements.map((r) => [r.canonical, r]));
  const afterSkills = new Map(after.skillRequirements.map((r) => [r.canonical, r]));

  for (const [name, req] of afterSkills) {
    const was = beforeSkills.get(name);
    if (!was) {
      changes.push({ what: req.required ? "Required skill added" : "Bonus skill added", added: name });
      continue;
    }
    if (was.required !== req.required) {
      changes.push({ what: name, from: was.required ? "required" : "bonus", to: req.required ? "required" : "bonus" });
    }
    for (const tier of SKILL_TIERS) {
      changes.push(...diffList(`${name} · ${tier}`, was[tier as SkillTier], req[tier as SkillTier]));
    }
  }
  for (const [name] of beforeSkills) {
    if (!afterSkills.has(name)) changes.push({ what: "Skill removed", removed: name });
  }

  const beforeYears = yearsLabel(before.yearsMin, before.yearsMax);
  const afterYears = yearsLabel(after.yearsMin, after.yearsMax);
  if (beforeYears !== afterYears) changes.push({ what: "Experience", from: beforeYears, to: afterYears });

  if (before.acceptedTier !== after.acceptedTier) {
    changes.push({ what: "Weakest match allowed", from: before.acceptedTier, to: after.acceptedTier });
  }

  for (const [what, key] of [
    ["Location", "locations"],
    ["Company type", "companyTypes"],
    ["Title contains", "titleKeywords"],
  ] as const) {
    const b = before[key];
    const a = after[key];
    // An emptied list reads better as one statement than as N removals.
    if (a.length === 0 && b.length > 0) changes.push({ what, from: listOf(b), to: "anywhere" });
    else changes.push(...diffList(what, b, a));
  }

  return changes;
}

export function diffRubric(before: Rubric, after: Rubric): SearchChange[] {
  const changes: SearchChange[] = [];
  const beforeCriteria = new Map(before.criteria.map((c) => [c.id, c]));
  const afterCriteria = new Map(after.criteria.map((c) => [c.id, c]));

  for (const [id, c] of afterCriteria) {
    const was = beforeCriteria.get(id);
    if (!was) {
      changes.push({ what: "Criterion added", added: `${c.label} (${c.weight})` });
      continue;
    }
    if (was.weight !== c.weight) changes.push({ what: c.label, from: was.weight, to: c.weight });
    if (was.description !== c.description) changes.push({ what: c.label, from: "", to: "reworded" });
  }
  for (const [id, c] of beforeCriteria) {
    if (!afterCriteria.has(id)) changes.push({ what: "Criterion removed", removed: c.label });
  }

  if (before.roleSummary !== after.roleSummary) {
    changes.push({ what: "Role summary", from: "", to: "reworded" });
  }
  return changes;
}

export function diffSearch(
  before: { filters: Filters; rubric: Rubric },
  after: { filters: Filters; rubric: Rubric },
): SearchChange[] {
  return [...diffFilters(before.filters, after.filters), ...diffRubric(before.rubric, after.rubric)];
}
