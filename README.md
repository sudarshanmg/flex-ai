# Sourcing Refinement Loop

You type what kind of person you're hiring, in normal English. The app turns that into two things: a
set of filters (skills, years, location, company type) and a rubric for the stuff you can't filter
on, like how deep someone's experience actually goes. It runs the filters over 48 profiles, asks the
model to score whoever survives against the rubric, and shows you the top few. You say which ones
are right and which aren't. It adjusts the filters and the rubric, runs it again, and you keep going
until you're happy. Then you freeze it.

Built for the Flexiple engineering challenge.

Two videos:

- **[Product walkthrough](https://drive.google.com/file/d/1wXWXPbBvIxF-dVNF9wnf8cwRzLYwc23S/view?usp=sharing)**:
  one search from typing to frozen shortlist, a round of feedback changing the results, and an LLM
  failure that doesn't break the app.
- **[Code walkthrough](https://www.loom.com/share/54c6898037fd4eecb52e1ed2c7f6bb1a)**: following one
  request through the code, from the zod contract to the filter engine, the LLM boundary and the
  prompts.

> **The prompts are in [`src/prompts/`](src/prompts/)**, four plain text files. No templating, nothing
> built at runtime. [`shared.ts`](src/prompts/shared.ts) has the rules all three calls share, and the
> other three are one file per call. More on them in [Prompts](#prompts) below.

---

## Running it

```bash
npm install
cp .env.example .env.local     # then paste your key into it
npm run dev                    # http://localhost:3000
```

**The env variable is `GEMINI_API_KEY`.** You can get a free one from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). That's the only thing you need,
and no key is committed anywhere.

Two more commands if you want them:

```bash
npm test      # checks the filter engine against the real 48 profiles
npm run smoke # makes one real call per failure type, to check your key works
```

### About the free tier

Google's free tier gives you **20 requests per model per day**. A search costs 2 calls, and every
round of feedback costs 2 more.

That limit is counted per model, which is handy, because it means you can just use a different one.
So when a model runs out, the app moves to the next of eight I've checked work, which gets you to
roughly 160 requests a day. It also remembers which models are done for the day, so only the first
request after a model dies has to find out the hard way. Everything after that goes straight to one
that still works.

Google tells you how long to wait before retrying, but on a daily limit it sometimes says two
seconds, which isn't true. So I take its number but never go below a minute.

If every model really is out, the app says so and tells you roughly when it'll work again, instead
of showing you a "try again" button that can't possibly help.

---

## How it works

1. **Interpret.** Your text becomes filters and a rubric, plus a sentence saying what it thought you
   meant.
2. **Filter.** Run in code against `src/data/profiles.json`. No model involved.
3. **Score.** The model scores everyone who got through, against each part of the rubric, quoting
   real fields from their profile.
4. **Refine.** You react, and the model works out what to change and tells you why.
5. **Freeze.** A read-only summary: the final filters, the final rubric, the ranked list, and every
   round that got you there.

---

## Why it's built this way

### The model writes the filters. Code runs them.

This is the decision everything else hangs off. The model's only job is translation: turning
"RDS developers, 4-7 years, startups, Bangalore" into a structured object. Deciding who actually
matches that object is a plain function in `src/lib/filter.ts`.

Three reasons. It's instant and free, so you can edit a filter and watch the number change without
waiting on anything. It's the same every time, so the same filters always give you the same people.
And I can test it: `npm test` checks it against the real 48 profiles, which you can't do when the
logic is buried in a prompt.

### Skills are matched loosely, in three levels

If you match skills by exact text, this dataset breaks straight away:

```
"JavaScript"  → 0 exact matches, but 17 profiles list TypeScript
"Docker"      → 0 exact matches, but  2 profiles list Kubernetes
"Postgres"    → 0 exact matches, but 20 profiles list PostgreSQL
```

Someone searching for JavaScript engineers gets an empty screen while 17 of them sit right there.
And they never find out. That's the worst thing that can go wrong in sourcing, because nothing on
screen tells you it happened.

So instead of giving back a skill name, the model gives back three levels of it:

| level | what it means | example |
|---|---|---|
| `direct` | the skill itself, and other ways of spelling it | Postgres / PostgreSQL |
| `implied` | if you've got this, you've got that | Kubernetes ⇒ Docker |
| `transferable` | close enough to pick up in days, not months | C++ ⇒ C |

Three things follow from that, all on purpose:

- **It always tells you how it matched.** A profile matched on `implied` says *"AWS RDS via
  PostgreSQL"* on the card. If you can't see why someone matched, you're not going to trust the list.
- **You can edit it.** Every term the model guessed is a chip you can delete. Don't think Node.js
  means someone can do frontend JavaScript? Take it out, and the count updates right away with no
  model call. It's the model suggesting and you checking, not the model quietly deciding.
- **Loose matching is opt-in.** A three-way toggle controls how weak a match is allowed to be, and
  weaker levels get a small ranking penalty so someone who only transfers in never beats someone who
  actually has the skill. The scoring prompt is also told to say *"no direct Docker, but runs
  Kubernetes in production"* rather than pretend they have experience they don't.

The matching itself stays strict on purpose: exact, or a prefix of at least six characters, which is
what stops `java` matching `javascript`. Anything looser than spelling is the model's job, and it
has to show you its working.

### The model scores each part separately, the browser does the maths

The model gives a score per rubric criterion, never one combined number. The weights get applied in
the browser, so dragging a criterion from medium to high **reorders the whole list immediately** with
no model call. You pay for the judgement once, and adding up numbers is free.

It also means you can see why someone ranked where they did, because each card shows the bars behind
the score.

### All the failure handling is in one place

All three routes go through `callModel` in `src/lib/llm.ts`, which handles:

- **Getting proper JSON back.** The zod schema is converted into Gemini's `responseJsonSchema` so the
  API constrains the shape, then the same schema validates the response as a backstop.
- **Broken JSON** gets one repair attempt, where the validation errors are handed back to the model.
- **Rate limits, timeouts and 503s** get backoff with jitter, plus the model chain. Running out is a
  per-model thing, so waiting around on a model you know is finished just wastes your time. It moves
  to the next of eight and parks the dead one so later requests skip it. This wasn't me guessing at
  problems: I ran the entire chain dry building this, and it's the only reason the app kept working.
- **Config problems** like a bad key or a wrong model name are **not** retried. Asking a rejected API
  key three times isn't going to change its mind.
- **Losing the ranking doesn't lose the search.** Filtering happens in code and can't fail, so the
  score route runs it *before* calling the model and returns it either way. If ranking dies you still
  get the funnel, the matches and the near-misses, just unordered, and the app says so instead of
  showing you a blank page. You can check this without using up any quota: send `fault: "auth"` to
  `/api/score` and you get a 200 back with all the filter results and the error attached.

Anything it recovered from gets shown. The UI tells you when it retried and when a backup model
answered.

There's also a **fault injector** (the dropdown next to the message box, dev only) that forces any of
these on demand. Rate limits are real, but they show up whenever they feel like it, which is never
when you're trying to demo that you handle them.

### When nothing matches, it tells you why

Because the filtering is code, it can answer things a prompt can't:

- A **funnel** showing where everyone went, `48 → 33 → 15 → 7 → 6`, always on screen, so an empty
  result explains itself.
- **Working out what to drop.** When nothing matches, it finds the smallest change that gets you
  moving again. It tries single filters first, then pairs, then falls back to dropping them in order
  of damage. That matters because when a search is badly over-constrained, several filters each kill
  it on their own, so only offering single drops leaves you stuck exactly when you needed help.
  *"Drop 12+ years and Berlin → 2 matches."*
- **Near misses**: people who failed exactly one filter. What you actually want to know is rarely
  "who matches", it's "who nearly matches, and is it worth bending?"

All three come out of the same list of filters, so they can never contradict each other.

### Refining works out what you meant, not just what you said

`refine` is a separate prompt from `interpret` because it has a different job: give back a **list of
changes with reasons**, each pointing at the specific thing you said. *"Reduced startup_experience
weight from high to medium because you said you care about depth of database ownership more than raw
experience."*

It's told to lean on the rubric before tightening a filter, because a filter removes someone
permanently and quietly while a weight just moves them down. It's told to make the smallest change
your feedback justifies. And if your feedback doesn't justify changing anything, it's told to say so
rather than invent something to look busy.

**The list of changes is worked out, not taken from the model.** The model reports what it changed,
but it never sees you edit a filter by hand, so its version goes stale the second you touch
something. That was a real bug. Now the changes come from comparing the actual filters before and
after (`src/lib/diff.ts`), and the model only supplies the reasoning. If you made the change
yourself it says "Your edits" and shows what you did. No raw JSON ever ends up on screen.

It also gets every previous round, so it can point out when you've **contradicted yourself** instead
of quietly going along with it: *"you approved someone at 4 years in round 1 but rejected 5 years as
too junior, so seniority here might be about scope rather than years."* A tool that flips a filter
back and forth to please whoever spoke last is one you stop believing.

### Nothing is saved

The session lives in React and gets sent with each request. No database, no session store, no login.
The brief ruled them out anyway, and without them there's less that can go wrong.

---

## What I left out, and why

- **Tests beyond the filter engine.** That's where the important rules live and where a bug would go
  unnoticed. The UI and the prompts I checked by actually using the app. With more time I'd add tests
  on the schema validation paths next.
- **Profile detail pages, saved searches, multiple users, mobile layout.** None of it is in the flow
  the brief described.
- **Streaming responses.** Better perceived speed, but it fights with structured output and schema
  validation, which matter more here.
- **Scoring more than 15 profiles at once.** Capped for speed and token cost. Past that the honest
  answer is to tighten your filters, and the UI tells you how many weren't scored.
- **Paging through the shortlist.** You look at the top 5, give feedback, and the list re-ranks.
  Paging further down competes with refining, which is the actual point.

---

## Prompts

All four are in **`src/prompts/`**, as plain readable strings. Nothing gets assembled at runtime and
there's no prompt library in the way, so what's in the file is what the model gets.

| file | used by | exports | what it does |
|---|---|---|---|
| [`src/prompts/shared.ts`](src/prompts/shared.ts) | all three | `SKILL_TIER_RULES`, `VOCAB_RULES`, `EVIDENCE_RULES`, `STYLE_RULES` | the rules all three calls share, in one place so they can't drift apart |
| [`src/prompts/interpret.ts`](src/prompts/interpret.ts) | `POST /api/interpret` | `INTERPRET_SYSTEM`, `interpretUser()` | your text → filters + rubric + a readback of what it understood |
| [`src/prompts/score.ts`](src/prompts/score.ts) | `POST /api/score` | `SCORE_SYSTEM`, `scoreUser()` | rubric + matching profiles → a score per criterion, quoted evidence, one concern each |
| [`src/prompts/refine.ts`](src/prompts/refine.ts) | `POST /api/refine` | `REFINE_SYSTEM`, `refineUser()` | your feedback → updated filters and rubric, changes with reasons, contradictions flagged |

They're all the same shape: a `*_SYSTEM` constant with the instructions, and a `*User()` function
that builds the per-request part. The thinking is all in the system prompts, so start there.

**If you only read one,** read [`shared.ts`](src/prompts/shared.ts). `SKILL_TIER_RULES` is the core
idea of the whole thing. It's what turns a skill name into three levels, which is what stops a search
for JavaScript coming back empty while 17 TypeScript engineers sit in the pool.

Four things about the prompts worth pointing out:

**Skill matching is spelled out, not hoped for.** `SKILL_TIER_RULES` names the exact problem it
exists to prevent, gives worked examples for each level, and specifically tells the model to return
an empty list rather than pad one out to get more results.

**The model is given the actual vocabulary of the dataset**: every skill, location, company type and
job title that really appears in the pool, pulled from the data in
[`src/lib/pool.ts`](src/lib/pool.ts) and injected by `VOCAB_RULES`. Without it the model says
"Bengaluru" when the data says "Bangalore", nothing matches, and you get an empty screen for a
reason you'd never work out.

**Evidence gets checked, not trusted.** `EVIDENCE_RULES` lists the exact field names an explanation
is allowed to quote, and anything made up gets dropped before it renders, by `validEvidence` in
[`src/lib/rank.ts`](src/lib/rank.ts). Every card also has a concern on it, because a shortlist where
nobody has a weakness is one you stop reading.

**The model writes text you actually read**, so the writing rules reach it too. `STYLE_RULES` covers
the headlines, reasons, concerns, summaries and change explanations.

The JSON shape for every response is kept separate from the wording, in
[`src/lib/schema.ts`](src/lib/schema.ts). Those zod types get converted into Gemini's
`responseJsonSchema` to constrain what it generates, then reused to check what comes back.

---

## Where things are

```
src/
  app/
    page.tsx              the whole flow: landing → reviewing → frozen
    api/{interpret,score,refine}/route.ts
  lib/
    filter.ts             matching, funnel, near misses, working out what to drop
    filter.test.ts        checks against the real 48 profiles
    llm.ts                the one place LLM calls happen: schema, timeouts, retries, model chain
    rank.ts               weighting, evidence checking, ordering
    diff.ts               works out what changed between two versions of a search
    pool.ts               the dataset and its vocabulary
    schema.ts             zod types shared by the client and server
    session.ts            client state and API calls
  prompts/                the four prompt files above
  components/sourcing/    filter panel, rubric panel, profile card, states, frozen view
  data/profiles.json      the 48 profiles
```
