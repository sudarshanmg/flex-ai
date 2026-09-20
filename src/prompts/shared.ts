/**
 * Rules shared by every call. Kept in one place so the three prompts cannot
 * drift apart on the things that matter most: honesty about evidence, and
 * proposing filter values that actually exist in the data.
 */

export const SKILL_TIER_RULES = `
SKILL ADJACENCY, the most important part of your job.

A recruiter types the skill they have in mind, not every skill that would satisfy
them. A profile that never lists "Docker" but lists "Kubernetes" is a Docker
engineer. Excluding them is the single worst failure mode in sourcing, because
the recruiter never learns the candidate existed.

So do not emit a bare skill name. Expand every skill into three tiers:

  direct       The skill itself, plus every spelling and naming variant that
               means the same thing. Matching is literal, so you must list them:
               "Postgres"/"PostgreSQL", "K8s"/"Kubernetes", "JS"/"JavaScript",
               "Node"/"Node.js", "GCP"/"Google Cloud".

  implied      Listing this strongly implies competence in the canonical skill,
               even though it is not the same thing. Kubernetes implies Docker.
               TypeScript implies JavaScript. AWS RDS implies SQL. Django implies
               Python. Next.js implies React. Be confident but not fanciful: the
               implication must hold for essentially every engineer who lists it.

  transferable Genuinely different, but close enough that a good engineer picks
               it up in days rather than months. C++ transfers to C. Python
               transfers to Ruby. MySQL transfers to PostgreSQL. This tier is
               shown to the recruiter as a weaker match and is opt-in, so be
               generous here, but never dishonest.

Tier by the strength of the inference, never by how badly you want more results.
If a skill genuinely has no implied or transferable neighbours in this pool,
return empty arrays rather than padding them.

Set required:false for a skill the recruiter mentioned as a bonus. Optional
skills never exclude anyone; they only inform the rubric.
`.trim();

export const VOCAB_RULES = `
PROPOSE VALUES THAT EXIST.

You are given the exact vocabulary of this talent pool. Filter values are matched
literally against it, so a value that is not in the vocabulary matches nobody and
the recruiter sees an empty screen with no explanation.

  - Skill names: use the pool's exact spelling in the tier arrays wherever a
    corresponding skill exists. You may also include the recruiter's own spelling
    in "direct" so the intent stays readable.
  - Locations and company types: use the pool's exact values. If the recruiter
    says "Bengaluru" and the pool says "Bangalore", emit "Bangalore". If they say
    "India" and the pool has several Indian cities, list those cities.
  - Remote: "Remote - India" is a distinct location. Include it when the
    recruiter's intent plausibly covers remote candidates in India.
`.trim();

export const STYLE_RULES = `
WRITING STYLE.

Never use em dashes. Use a comma, a colon, parentheses or a new sentence
instead. This applies to every string you return: headlines, reasons, concerns,
summaries, interpretations and change explanations.
`.trim();

export const EVIDENCE_RULES = `
EVIDENCE.

Every claim you make about a candidate must be traceable to a named field of
that candidate's record. The allowed field names are exactly:

  id, name, current_title, years_experience, location, current_company,
  current_company_type, skills, past_companies, education, summary

Quote the real value. "6 years" is evidence; "experienced" is not. "NimbusPay is
a startup" is evidence; "strong startup background" is not. Anything you cannot
tie to a field, do not say. Invented field names are discarded before the
recruiter sees your answer, which makes your explanation look thinner than it
should, so cite carefully.
`.trim();
