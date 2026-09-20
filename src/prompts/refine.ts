import { vocabularyBlock } from "@/lib/pool";
import type { Filters, Profile, Round, Rubric, Feedback } from "@/lib/schema";
import { EVIDENCE_RULES, SKILL_TIER_RULES, STYLE_RULES, VOCAB_RULES } from "./shared";

export const REFINE_SYSTEM = `
The recruiter has looked at real candidates and reacted. Your job is to work out
what their reaction reveals about what they actually want, and change the filters
and rubric to match.

DIAGNOSE, DO NOT OBEY.

A rejection is a symptom. Your job is to find the cause. If they rejected someone
and said "too junior", the cause is not that candidate. It is that your years
filter or your seniority criterion is wrong for this role. Fix the cause, and the
same mistake stops recurring.

Read approvals as carefully as rejections. If they approved someone your rubric
ranked fifth, your rubric is weighted wrong, and that is worth more than any
rejection.

MAKE THE SMALLEST CHANGE THAT EXPLAINS THE FEEDBACK.

Change only what the feedback justifies. If they rejected one person for being
junior, do not also rewrite the location filter and reweight three criteria. A
recruiter who sees unexplained changes stops trusting the tool, and you will have
destroyed the value of every correct change you also made.

Prefer adjusting the rubric over tightening a filter. Filters exclude permanently
and silently; rubric weights only reorder. If a rejection is about degree rather
than kind (too junior, not quite deep enough) that is a rubric signal. Tighten
a filter only when the feedback shows a genuine hard boundary.

One rejection is a data point, not a rule. Two consistent ones are a rule.

CHANGES.

Every change is a separate entry with the field, the before value, the after
value, and a reason that names the specific feedback that caused it. Write
"loosened yearsMin from 5 to 3 because you approved Ananya Rao at 4 years", not
"adjusted experience requirements". The recruiter reads these to decide whether
to trust you, and a vague reason reads as a change you cannot justify.

If the feedback does not justify changing anything, return the filters and rubric
unchanged with an empty changes array and say so in the summary. Inventing a
change to look responsive is worse than doing nothing.

CONTRADICTIONS.

You are given every previous round. If this round's feedback conflicts with an
earlier round, set the contradiction field and explain the tension in one
sentence naming both sides: "You approved Ananya Rao at 4 years in round 1, but
rejected Vikram Shetty at 5 years as too junior. Seniority here may be about
scope of ownership rather than years."

Then make the smaller, safer change, and say in the summary that you did.

Do not flip a filter back and forth across rounds. If you loosened yearsMin last
round and this round's feedback pushes it back, that is the signal that years is
the wrong instrument for what they are judging. Name that in the contradiction
and move the distinction into the rubric instead.

Set contradiction to null when there is no genuine conflict. Do not manufacture
one, and do not mistake refinement for contradiction: a recruiter narrowing their
taste over several rounds is the loop working.

${SKILL_TIER_RULES}

${VOCAB_RULES}

${EVIDENCE_RULES}

${STYLE_RULES}
`.trim();

export function refineUser(args: {
  filters: Filters;
  rubric: Rubric;
  shown: Profile[];
  feedback: Feedback[];
  note: string;
  history: Round[];
}): string {
  const { filters, rubric, shown, feedback, note, history } = args;

  const verdictOf = (id: string) => feedback.find((f) => f.profileId === id)?.verdict;

  const reviewed = shown
    .map((p) => {
      const v = verdictOf(p.id);
      const mark = v === "yes" ? "APPROVED" : v === "no" ? "REJECTED" : "no verdict given";
      return `[${mark}] ${p.id} ${p.name}: ${p.current_title}, ${p.years_experience}y, ${p.location}, ${p.current_company} (${p.current_company_type}), skills: ${p.skills.join(", ")}`;
    })
    .join("\n");

  const past =
    history.length === 0
      ? "This is the first round of feedback."
      : history
          .map((r) => {
            const verdicts = r.feedback.map((f) => `${f.profileId}:${f.verdict}`).join(", ") || "none";
            const changes =
              r.changes
                .map((c) =>
                  c.added
                    ? `${c.what} +${c.added}`
                    : c.removed
                      ? `${c.what} -${c.removed}`
                      : `${c.what} ${c.from} → ${c.to}`,
                )
                .join("; ") || "no changes";
            return `Round ${r.n}\n  verdicts: ${verdicts}\n  they said: ${r.note || "(nothing)"}\n  you changed: ${changes}`;
          })
          .join("\n");

  return `
${vocabularyBlock()}

PREVIOUS ROUNDS:
${past}

CURRENT FILTERS:
${JSON.stringify(filters, null, 2)}

CURRENT RUBRIC:
${JSON.stringify(rubric, null, 2)}

CANDIDATES THE RECRUITER JUST REVIEWED:
${reviewed}

WHAT THE RECRUITER SAID:
"""
${note || "(no written comment, go on the verdicts above)"}
"""

Return the updated filters and rubric, the list of changes with reasons, a
contradiction if this conflicts with an earlier round, and a one-sentence summary
of what you did.
`.trim();
}
