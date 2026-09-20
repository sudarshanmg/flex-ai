# Sourcing Refinement Loop

A recruiter describes a role in plain English. The app turns that into **objective filters** and a
**subjective fit rubric**, applies the filters to a 48-profile talent pool, scores the survivors
against the rubric, and then refines both from the recruiter's yes/no feedback, round after round,
until they freeze the search.

Built for the Flexiple engineering challenge.

**[Watch the walkthrough](https://drive.google.com/file/d/1wXWXPbBvIxF-dVNF9wnf8cwRzLYwc23S/view?usp=sharing)**
for the full loop: one search from free text to frozen shortlist, a refinement round driven by
recruiter feedback, and an LLM failure handled without losing the search.

> **The LLM prompts live in [`src/prompts/`](src/prompts/)**: four plain-text files, no templating
> layer, nothing generated at runtime. [`shared.ts`](src/prompts/shared.ts) holds the rules all three
> calls inherit; the other three are one file per LLM call. What each one does, and why, is in
> [Prompts](#prompts) below.

---

## Running it

```bash
npm install
cp .env.example .env.local     # then paste your key into it
npm run dev                    # http://localhost:3000
```

**Environment variable: `GEMINI_API_KEY`**. A free Google AI Studio key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Nothing else is required, and no
key is committed.

Two optional commands:

```bash
npm test      # assertions for the deterministic filter engine, against the real dataset
npm run smoke # one live call per failure mode, to prove the key and the retry layer work
```

### A note on the free tier

The Gemini free tier meters **20 requests per model per day** (`GenerateRequestsPerDayPerProjectPerModel`).
A search costs 2 calls and each refinement round costs 2 more.

The quota is per model, so the app walks a chain of **eight** verified models on capacity errors,
giving roughly 160 requests a day. It also remembers which models are exhausted: the first request
after a model dies discovers it and moves on, and every later request goes straight to one that can
answer, instead of re-walking the dead chain each time. Google's own `retryDelay` sets the cooldown,
floored at a minute, because on a daily quota it sometimes reports two seconds.

When every model really is spent, the app says so plainly and tells you roughly when it frees up,
rather than offering a Try again that cannot work.

---

## The loop

1. **Interpret**. Free text becomes `{ filters, rubric }`, plus a plain-language readback of what
   the model understood.
2. **Filter**. Applied locally, in code, against `src/data/profiles.json`.
3. **Score**. The model scores each surviving profile per rubric criterion, citing real fields.
4. **Refine**. The recruiter reacts; the model diagnoses what to change and returns a diff with
   reasons.
5. **Freeze**. A read-only summary: final filters, final rubric, ranked shortlist, and every round
   that got them there.

---

## Decisions

### The LLM writes the filters. Code applies them.

The single most important decision in the build. The model's job is *translation*: turning
"RDS developers, 4–7 years, startups, Bangalore" into a structured object. A pure function in
`src/lib/filter.ts` decides who actually matches.

This buys three things. Filtering is instant and free, so the recruiter can edit a filter and watch
the count change with no model call. It is deterministic, so the same filters always produce the same
shortlist. And it is testable: `npm test` asserts the behaviour against the real 48 profiles, which
you cannot do with judgement buried in a prompt.

### Skills are matched by adjacency, in three tiers

A naive skill filter is quietly broken on this dataset:

```
"JavaScript"  → 0 exact matches, but 17 profiles list TypeScript
"Docker"      → 0 exact matches, but  2 profiles list Kubernetes
"Postgres"    → 0 exact matches, but 20 profiles list PostgreSQL
```

A recruiter typing "JavaScript engineers" would get an empty screen while 17 matches sat in the pool,
and would never learn those people existed. That is the worst failure mode in sourcing, because it is
invisible.

So the model expands every skill into three tiers rather than emitting a bare string:

| tier | meaning | example |
|---|---|---|
| `direct` | the skill itself, plus spelling variants | Postgres / PostgreSQL |
| `implied` | listing this implies the canonical skill | Kubernetes ⇒ Docker |
| `transferable` | adjacent; days to pick up, not months | C++ ⇒ C |

Three consequences, each deliberate:

- **The bridge is always named.** A profile matched via `implied` says *"AWS RDS via PostgreSQL"* on
  the card. A match the recruiter cannot trace is a match they cannot trust.
- **The expansion is editable.** Every inferred term is a removable chip. Disagree that Node.js
  implies frontend JavaScript? Delete it; the count updates instantly, with no model call. The
  model's guesses are proposals the recruiter audits, not hidden behaviour.
- **Looseness is opt-in and tier-aware.** A three-way toggle controls how weak a match may be, and
  weaker tiers carry a small ranking penalty so a transferable match never outranks a direct one at
  equal rubric fit. Scoring prompts are told to say *"no direct Docker, but runs Kubernetes in
  production"* rather than claim depth that is not in the record.

Matching itself stays conservative: exact or prefix with a six-character floor, which is what stops
`java` matching `javascript`. Everything looser is the model's job, in a list you can see.

### The model scores per criterion; the browser does the weighting

Scoring returns a score for each rubric criterion, never a blended number. Weights are applied
client-side, so dragging a criterion from medium to high **re-ranks the entire shortlist instantly**
with no model call. Expensive judgement is bought once; arithmetic is free and belongs in code.

It also makes the ranking legible: each card shows the per-criterion bars behind its score, so the
recruiter can see *why* it placed where it did.

### Every failure is handled in one place

All three routes go through `callModel` in `src/lib/llm.ts`, which owns:

- **Structured output** via Gemini's `responseJsonSchema`, generated from the zod schema, then
  validated with that same schema. The API constrains the shape, zod is the safety net.
- **Malformed output** goes to one repair attempt, handing the validation errors back to the model.
- **Rate limits, timeouts, provider 503s** get exponential backoff with jitter, and a **model chain**.
  Capacity is per-model, so backing off on a saturated model just wastes the recruiter's time; we
  move to the next of eight verified models instead, and park the dead one so later requests skip
  it. This was not speculative: the whole chain was genuinely exhausted during development, and the
  chain plus the cooldown is what kept the app usable.
- **Config errors** (bad key, missing model) are *not* retried. Retrying a rejected API key three
  times helps nobody.
- **Graceful degradation**. Filtering is local and cannot fail, so the score route computes it
  *before* calling the model and returns it either way. When ranking fails the recruiter still gets
  the funnel, the shortlist and the near-misses, unranked, with an honest banner, never a blank
  page. This is verifiable without spending quota: `fault: "auth"` on `/api/score` returns HTTP 200
  with the full filter result and the failure attached.

Every recovery is surfaced: the UI says when it retried, and when a fallback model answered.

A **dev-only fault injector** (the dropdown next to the composer) forces any of these paths on
demand. Rate limits are real but arrive on their own schedule, which is never the moment you need to
show they are handled.

### The empty state diagnoses instead of apologising

Because the filter engine is code, it can answer questions a prompt cannot:

- A **funnel** showing where the pool went, `48 → 33 → 15 → 7 → 6`, always visible, so zero results
  are self-explaining rather than mysterious.
- **Relaxation search**: when nothing matches, it finds the smallest set of filters to drop. Single
  drops first, then pairs, then a greedy fallback, because in an over-constrained search several
  filters each independently empty the pool, and offering only single drops fails exactly when the
  recruiter most needs help. *"Drop 12+ years and Berlin → 2 matches."*
- A **near-miss drawer**: profiles failing exactly one criterion. The recruiter's real question is
  rarely "who matches" but "who nearly matches, and is it worth bending?"

All three fall out of one list of named criteria, so they can never disagree with each other.

### Refinement diagnoses rather than obeys

`refine` is a separate prompt from `interpret` because it has a different job: return a **diff with
reasons**, each naming the feedback that caused it: *"reduced startup_experience weight from high to
medium because you said you care about depth of database ownership more than raw experience."*

It is instructed to prefer adjusting the rubric over tightening a filter (filters exclude
permanently and silently; weights only reorder), to make the smallest change the feedback justifies,
and to return no changes at all rather than invent one to look responsive.

**The change log is derived, not reported.** The model returns its own before/after strings, but
those describe only the edits *it* made: the moment the recruiter drops a skill by hand, the model's
account is stale and describes a search that no longer exists. So structure comes from diffing the
real filters (`src/lib/diff.ts`) and the model contributes only the reasoning. A hand edit is
attributed to the recruiter and shown as "Your edits", and raw JSON is never put on screen.

It also receives every previous round and flags **contradictions** instead of smoothing them over:
*"you approved someone at 4 years in round 1 but rejected 5 years as too junior; seniority here may
be about scope rather than years."* A tool that silently flips a filter to please whoever spoke last
is one a recruiter stops believing.

### No persistence, stateless server

Session state lives in React and is posted with each request. No database, no session store, no
login. The brief rules them out, and without them there is simply less that can be wrong.

---

## What I cut, and why

- **Tests beyond the filter engine.** The deterministic core carries the invariants worth asserting
  and is where a regression would be silent. UI and prompt behaviour I verified by driving the real
  app. Given more time, snapshot tests on the schema-validation paths would come next.
- **Profile detail views, saved searches, multi-seat, mobile layout.** Outside the flow in the brief.
- **Streaming responses.** Nicer perceived latency, but it fights structured output and schema
  validation, which matter more here.
- **Scoring beyond 15 profiles per round.** Bounded for latency and token cost; past that the honest
  answer is to tighten the filters, and the UI says how many went unscored.
- **Pagination through the shortlist.** The recruiter reviews the top 5, gives feedback, and the loop
  re-ranks. Paging deeper competes with refining, which is the actual product.

---

## Prompts

All four live in **`src/prompts/`**, as plain readable template strings. Nothing is assembled at
runtime and there is no prompt framework in between, so what you read in the file is what the model
receives.

| file | used by | exports | what it does |
|---|---|---|---|
| [`src/prompts/shared.ts`](src/prompts/shared.ts) | all three | `SKILL_TIER_RULES`, `VOCAB_RULES`, `EVIDENCE_RULES`, `STYLE_RULES` | the rules every call inherits, kept in one place so the three cannot drift apart on the things that matter most |
| [`src/prompts/interpret.ts`](src/prompts/interpret.ts) | `POST /api/interpret` | `INTERPRET_SYSTEM`, `interpretUser()` | free text → objective filters + subjective rubric + a plain-language readback |
| [`src/prompts/score.ts`](src/prompts/score.ts) | `POST /api/score` | `SCORE_SYSTEM`, `scoreUser()` | rubric + matched profiles → per-criterion scores, cited evidence, a named concern each |
| [`src/prompts/refine.ts`](src/prompts/refine.ts) | `POST /api/refine` | `REFINE_SYSTEM`, `refineUser()` | recruiter feedback → updated filters and rubric, a diff with reasons, contradiction detection |

Each file follows the same shape: a `*_SYSTEM` constant holding the instructions, and a `*User()`
function that renders the per-request payload. The system prompts are where the judgement lives, so
start there.

**If you only read one:** [`shared.ts`](src/prompts/shared.ts). `SKILL_TIER_RULES` is the heart of
the product. It turns a skill name into the three-tier expansion that stops a JavaScript
search returning zero while seventeen TypeScript engineers sit in the pool.

Four prompt decisions worth calling out:

**Skill adjacency is specified, not hoped for.** `SKILL_TIER_RULES` names the failure it exists to
prevent, gives worked examples for each tier, and explicitly tells the model to return empty arrays
rather than pad a tier to manufacture more results.

**The model is given the dataset's controlled vocabulary**: every skill, location, company type and
title actually present in the pool, generated from the data in
[`src/lib/pool.ts`](src/lib/pool.ts) and injected by `VOCAB_RULES`. Without it the model reaches for
"Bengaluru" when the data says "Bangalore", the filter matches nobody, and the recruiter sees an
empty screen for a reason they could never guess.

**Evidence is validated, not trusted.** `EVIDENCE_RULES` lists the exact profile field names an
explanation may cite; any invented field is dropped before render by `validEvidence` in
[`src/lib/rank.ts`](src/lib/rank.ts). Every card also carries a named concern, because a shortlist
where nobody has a weakness is one a recruiter stops reading.

**The model writes copy the recruiter reads**, so house style reaches it too. `STYLE_RULES` covers
headlines, reasons, concerns, summaries and change explanations.

The JSON contract for every response is separate from the prose, in
[`src/lib/schema.ts`](src/lib/schema.ts): zod types that are converted to Gemini's `responseJsonSchema`
to constrain generation, then reused to validate what comes back.

---

## Layout

```
src/
  app/
    page.tsx              the whole flow: landing → reviewing → frozen
    api/{interpret,score,refine}/route.ts
  lib/
    filter.ts             deterministic matching, funnel, near-misses, relaxation
    filter.test.ts        assertions against the real 48 profiles
    llm.ts                the one LLM boundary: schema, timeout, backoff, model chain, faults
    rank.ts               weighting, evidence validation, tier-aware ordering
    pool.ts               dataset + controlled vocabulary
    schema.ts             zod types shared by client and server
    session.ts            client session state and API calls
  prompts/                the four prompt files above
  components/sourcing/    filter panel, rubric panel, profile card, states, frozen view
  data/profiles.json      the talent pool
```
