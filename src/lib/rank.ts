import type { Matched } from "./filter";
import { PROFILE_FIELDS, WEIGHT_VALUE, type ProfileScore, type Rubric, type SkillTier } from "./schema";

/* ───────────────────────────────────────────────────────────────────────────
 * Combining and ordering. Deliberately pure and client-safe: the model returns
 * per-criterion scores once, and re-weighting the rubric re-ranks the list here
 * in the browser, instantly, with no further LLM calls.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Drop evidence citing field names that do not exist on a Profile. */
export function validEvidence(score: ProfileScore) {
  return score.evidence.filter((e) => (PROFILE_FIELDS as readonly string[]).includes(e.field));
}

export function droppedEvidenceCount(score: ProfileScore): number {
  return score.evidence.length - validEvidence(score).length;
}

/** Weighted mean of the criterion scores, using the rubric's current weights. */
export function overallScore(score: ProfileScore, rubric: Rubric): number {
  let weighted = 0;
  let total = 0;
  for (const c of rubric.criteria) {
    const cs = score.criterionScores.find((s) => s.criterionId === c.id);
    if (!cs) continue;
    const w = WEIGHT_VALUE[c.weight];
    weighted += cs.score * w;
    total += w;
  }
  return total === 0 ? 0 : Math.round(weighted / total);
}

const TIER_PENALTY: Record<SkillTier, number> = { direct: 0, implied: 2, transferable: 6 };

export type Ranked = Matched & {
  score: ProfileScore | null;
  overall: number;
};

/**
 * Rank by weighted rubric score, with a small penalty for weaker skill bridges
 * so a transferable match never outranks a direct one at equal rubric fit. The
 * penalty is deliberately small: it breaks ties, it does not override judgement.
 */
export function rank(matched: Matched[], scores: ProfileScore[], rubric: Rubric): Ranked[] {
  return matched
    .map((m) => {
      const score = scores.find((s) => s.profileId === m.profile.id) ?? null;
      const base = score ? overallScore(score, rubric) : 0;
      const penalty = m.tier ? TIER_PENALTY[m.tier] : 0;
      return { ...m, score, overall: Math.max(0, base - penalty) };
    })
    .sort((a, b) => b.overall - a.overall || a.profile.name.localeCompare(b.profile.name));
}
