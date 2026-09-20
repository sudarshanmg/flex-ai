import { z } from "zod";

/* ─────────────────────────── Talent pool ─────────────────────────── */

export const PastCompanySchema = z.object({
  company: z.string(),
  company_type: z.string(),
  title: z.string(),
  years: z.number(),
});

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  current_title: z.string(),
  years_experience: z.number(),
  location: z.string(),
  current_company: z.string(),
  current_company_type: z.string(),
  skills: z.array(z.string()),
  past_companies: z.array(PastCompanySchema),
  education: z.string(),
  summary: z.string(),
});

export type Profile = z.infer<typeof ProfileSchema>;

/** Field names an explanation is allowed to cite. Used to reject invented evidence. */
export const PROFILE_FIELDS = ProfileSchema.keyof().options as readonly string[];

/* ─────────────────────────── Objective filters ───────────────────────────
 * A skill requirement is not a string. It is the model's *reasoning* about a
 * skill, expanded into three tiers, so that code can apply it deterministically
 * and the recruiter can audit and edit every inference the model made.
 *
 *   direct       the skill itself, plus pure spelling variants (Postgres/PostgreSQL)
 *   implied      listing this strongly implies the canonical skill (K8s ⇒ Docker)
 *   transferable adjacent enough to pick up quickly (C++ ⇒ C)
 */

export const SKILL_TIERS = ["direct", "implied", "transferable"] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];

export const SkillRequirementSchema = z.object({
  canonical: z.string(),
  direct: z.array(z.string()),
  implied: z.array(z.string()),
  transferable: z.array(z.string()),
  /** false = nice to have; contributes to score but never excludes. */
  required: z.boolean(),
});

export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;

export const FiltersSchema = z.object({
  skillRequirements: z.array(SkillRequirementSchema),
  yearsMin: z.number().nullable(),
  yearsMax: z.number().nullable(),
  locations: z.array(z.string()),
  companyTypes: z.array(z.string()),
  titleKeywords: z.array(z.string()),
  /** Weakest skill tier allowed through the filter. Recruiter-controlled. */
  acceptedTier: z.enum(SKILL_TIERS),
});

export type Filters = z.infer<typeof FiltersSchema>;

/* ─────────────────────────── Subjective rubric ─────────────────────────── */

export const WEIGHTS = ["low", "medium", "high"] as const;
export type Weight = (typeof WEIGHTS)[number];

export const WEIGHT_VALUE: Record<Weight, number> = { low: 1, medium: 2, high: 3 };

export const CriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** What "good" looks like for this criterion, in the recruiter's terms. */
  description: z.string(),
  weight: z.enum(WEIGHTS),
});

export type Criterion = z.infer<typeof CriterionSchema>;

export const RubricSchema = z.object({
  roleSummary: z.string(),
  criteria: z.array(CriterionSchema),
});

export type Rubric = z.infer<typeof RubricSchema>;

/* ─────────────────────────── Scoring ───────────────────────────
 * The model returns a score per criterion, never a single blended number.
 * Weighting happens in the browser, so changing a weight re-ranks instantly
 * with no LLM call.
 */

export const EvidenceSchema = z.object({
  /** Must be a real Profile key; anything else is dropped before render. */
  field: z.string(),
  value: z.string(),
});

export const CriterionScoreSchema = z.object({
  criterionId: z.string(),
  score: z.number().min(0).max(100),
  reason: z.string(),
});

export const ProfileScoreSchema = z.object({
  profileId: z.string(),
  headline: z.string(),
  criterionScores: z.array(CriterionScoreSchema),
  evidence: z.array(EvidenceSchema),
  /** Named risk or gap. The model is instructed never to leave this empty. */
  concern: z.string(),
});

export type ProfileScore = z.infer<typeof ProfileScoreSchema>;

export const ScoreResponseSchema = z.object({
  scores: z.array(ProfileScoreSchema),
});

/* ─────────────────────────── LLM call envelopes ─────────────────────────── */

export const InterpretResponseSchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
  /** Plain-language readback of what the model understood. Shown to the recruiter. */
  interpretation: z.string(),
});

export type InterpretResponse = z.infer<typeof InterpretResponseSchema>;

export const ChangeSchema = z.object({
  field: z.string(),
  before: z.string(),
  after: z.string(),
  /** Must reference the specific feedback that caused it. */
  reason: z.string(),
});

export type Change = z.infer<typeof ChangeSchema>;

export const RefineResponseSchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
  changes: z.array(ChangeSchema),
  /**
   * Set when this round's feedback contradicts an earlier round. The app
   * surfaces this instead of silently thrashing a filter back and forth.
   */
  contradiction: z.string().nullable(),
  summary: z.string(),
});

export type RefineResponse = z.infer<typeof RefineResponseSchema>;

/* ─────────────────────────── Session ─────────────────────────── */

export const VerdictSchema = z.enum(["yes", "no"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const FeedbackSchema = z.object({
  profileId: z.string(),
  verdict: VerdictSchema,
});

export type Feedback = z.infer<typeof FeedbackSchema>;

export const RoundSchema = z.object({
  n: z.number(),
  feedback: z.array(FeedbackSchema),
  note: z.string(),
  /** Structural diff, derived from the real filters rather than reported. */
  changes: z.array(
    z.object({
      what: z.string(),
      added: z.string().optional(),
      removed: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  ),
  /** The model's explanations for this round. */
  reasons: z.array(z.string()),
  summary: z.string(),
  contradiction: z.string().nullable(),
  filters: FiltersSchema,
  rubric: RubricSchema,
});

export type Round = z.infer<typeof RoundSchema>;
