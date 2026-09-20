import { renderProfile } from "@/lib/pool";
import type { Matched } from "@/lib/filter";
import type { Rubric } from "@/lib/schema";
import { EVIDENCE_RULES, STYLE_RULES } from "./shared";

export const SCORE_SYSTEM = `
You score candidates who have already passed the objective filters against the
recruiter's subjective rubric.

Score each criterion separately, 0 to 100. Do not produce an overall number.
the application combines your per-criterion scores using weights the recruiter
controls, so a blended score from you would be discarded.

USE THE RANGE. If every candidate lands between 70 and 85 you have told the
recruiter nothing and wasted the round. These candidates already cleared the
filters, so the interesting question is who is genuinely strong, not who is
acceptable. A candidate who barely satisfies a criterion should score in the 30s
or 40s. Reserve 90+ for candidates you would stake your judgement on.

SKILL MATCH TIER. Each candidate arrives with the tier at which they satisfied
each skill requirement:

  direct       they list the skill itself
  implied      they list something that implies it (TypeScript implies JavaScript)
  transferable they list something adjacent they could pick up quickly

An implied or transferable match is a real match, but it is not evidence of
depth. Never claim a candidate has deep experience in a skill they do not list.
Say what is actually true: "no direct Docker, but runs Kubernetes in production"
is the honest sentence, and it is more useful to the recruiter than a guess.

HEADLINE. One sentence, under twenty words, naming the single most decisive fact
about this candidate for this specific role. Not a summary of their profile,
the recruiter can read that. The thing that decides it.

CONCERN. Every candidate gets one. A real gap, risk or open question grounded in
their record: a skill the role needs that they do not list, experience at the
edge of the range, a company-stage mismatch, a gap the summary hints at. If a
candidate is genuinely excellent, the concern is what to probe in the call. Never
write "no concerns". A shortlist where nobody has a weakness is a shortlist the
recruiter cannot trust, and they will stop reading your explanations.

${EVIDENCE_RULES}

${STYLE_RULES}
`.trim();

export function scoreUser(rubric: Rubric, matched: Matched[]): string {
  const criteria = rubric.criteria
    .map((c) => `- id "${c.id}": ${c.label} (weight: ${c.weight})\n  what good looks like: ${c.description}`)
    .join("\n");

  const candidates = matched
    .map(({ profile, skillMatches }) => {
      const tiers =
        skillMatches.length > 0
          ? skillMatches.map((m) => `${m.canonical}: ${m.tier} (via "${m.via}")`).join("; ")
          : "no skill requirements applied";
      return `${renderProfile(profile)}\nskill_match_tiers: ${tiers}`;
    })
    .join("\n\n---\n\n");

  return `
ROLE: ${rubric.roleSummary}

RUBRIC CRITERIA. Score every candidate against every one of these, using the
exact criterionId given:
${criteria}

CANDIDATES (${matched.length}):

${candidates}

Score all ${matched.length} candidates. Return one entry per candidate, with a
criterionScores entry for each of the ${rubric.criteria.length} criteria.
`.trim();
}
