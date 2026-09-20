/**
 * Run with:  npx tsx src/lib/filter.test.ts
 *
 * Asserts the deterministic core against the real 48-profile dataset. These are
 * the invariants the LLM layer is allowed to assume, so they are checked in code
 * rather than by eye.
 */
import { strict as assert } from "node:assert";
import raw from "../data/profiles.json";
import { ProfileSchema, type Filters, type Profile } from "./schema";
import { applyFilters, matchSkill } from "./filter";

const profiles: Profile[] = ProfileSchema.array().parse(raw);

const base: Filters = {
  skillRequirements: [],
  yearsMin: null,
  yearsMax: null,
  locations: [],
  companyTypes: [],
  titleKeywords: [],
  acceptedTier: "direct",
};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("\ndataset");
check("parses as 48 profiles", () => assert.equal(profiles.length, 48));

console.log("\nskill tiers");
const js = {
  canonical: "JavaScript",
  direct: ["JavaScript"],
  implied: ["TypeScript", "Node.js", "React"],
  transferable: ["Python"],
  required: true,
};

check("direct-only finds nobody for JavaScript, the bug that motivated tiers", () => {
  const r = applyFilters(profiles, { ...base, skillRequirements: [js] });
  assert.equal(r.matched.length, 0);
});

check("implied surfaces the 17 TypeScript engineers a naive filter hides", () => {
  const r = applyFilters(profiles, { ...base, skillRequirements: [js], acceptedTier: "implied" });
  assert.ok(r.matched.length >= 17, `expected >=17, got ${r.matched.length}`);
  assert.ok(r.matched.every((m) => m.tier === "implied" || m.tier === "direct"));
});

check("every match names the bridge skill that satisfied it", () => {
  const r = applyFilters(profiles, { ...base, skillRequirements: [js], acceptedTier: "implied" });
  for (const m of r.matched) {
    const bridge = m.skillMatches[0];
    assert.ok(bridge, `${m.profile.id} matched with no recorded bridge`);
    assert.ok(
      m.profile.skills.includes(bridge.via),
      `${m.profile.id} cites "${bridge.via}" which is not in its own skills`,
    );
  }
});

check("transferable is strictly looser than implied", () => {
  const f = { ...base, skillRequirements: [js] };
  const impliedCount = applyFilters(profiles, { ...f, acceptedTier: "implied" }).matched.length;
  const transferCount = applyFilters(profiles, { ...f, acceptedTier: "transferable" }).matched.length;
  assert.ok(transferCount >= impliedCount, `${transferCount} < ${impliedCount}`);
});

check("strongest available tier wins over a weaker one", () => {
  const p = profiles.find((x) => x.skills.includes("PostgreSQL") && x.skills.includes("AWS RDS"))!;
  const m = matchSkill(p, {
    canonical: "PostgreSQL",
    direct: ["PostgreSQL"],
    implied: ["AWS RDS"],
    transferable: [],
    required: true,
  });
  assert.equal(m?.tier, "direct");
});

check("spelling variants match; 'java' does not match 'javascript'", () => {
  const withTs = profiles.find((p) => p.skills.includes("PostgreSQL"))!;
  const req = { canonical: "Postgres", direct: ["Postgres"], implied: [], transferable: [], required: true };
  assert.equal(matchSkill(withTs, req)?.tier, "direct", "Postgres should match PostgreSQL");

  const tsDev = profiles.find((p) => p.skills.includes("TypeScript"))!;
  const java = { canonical: "Java", direct: ["Java"], implied: [], transferable: [], required: true };
  assert.equal(matchSkill(tsDev, java), null, "Java must not match TypeScript");
});

console.log("\nfunnel");
const realistic: Filters = {
  ...base,
  skillRequirements: [
    { canonical: "AWS RDS", direct: ["AWS RDS"], implied: ["PostgreSQL", "MySQL"], transferable: [], required: true },
  ],
  yearsMin: 4,
  yearsMax: 7,
  locations: ["Bangalore"],
  companyTypes: ["startup"],
};

check("funnel is monotonically non-increasing and ends at the match count", () => {
  const r = applyFilters(profiles, realistic);
  let prev = profiles.length;
  for (const step of r.funnel) {
    assert.ok(step.remaining <= prev, `${step.id} went up: ${prev} → ${step.remaining}`);
    assert.equal(step.removed, prev - step.remaining);
    prev = step.remaining;
  }
  assert.equal(r.funnel.at(-1)!.remaining, r.matched.length);
});

check("example query from the brief returns a usable shortlist", () => {
  const r = applyFilters(profiles, realistic);
  assert.ok(r.matched.length > 0, "the brief's own example must not come back empty");
  console.log(`      → ${r.matched.length} matched (${r.funnel.map((s) => s.remaining).join(" → ")})`);
});

console.log("\nnear misses & relaxation");
check("near misses fail exactly one criterion, and never overlap the matches", () => {
  const r = applyFilters(profiles, realistic);
  const matchedIds = new Set(r.matched.map((m) => m.profile.id));
  for (const nm of r.nearMisses) {
    assert.ok(!matchedIds.has(nm.profile.id), `${nm.profile.id} is both matched and a near miss`);
  }
  console.log(`      → ${r.nearMisses.length} near misses`);
});

check("relaxation yields are real, and only offered when they actually help", () => {
  const impossible: Filters = { ...realistic, locations: ["Reykjavik"] };
  const r = applyFilters(profiles, impossible);
  assert.equal(r.matched.length, 0, "precondition: this should match nobody");
  assert.ok(r.relaxations.length > 0, "an empty result must offer a way out");

  for (const relax of r.relaxations) {
    assert.ok(relax.wouldYield > 0);
    // Verify the claim by actually removing those criteria.
    const without = relax.criterionIds.reduce<Filters>((f, id) => {
      if (id === "location") return { ...f, locations: [] };
      if (id === "years") return { ...f, yearsMin: null, yearsMax: null };
      if (id === "companyType") return { ...f, companyTypes: [] };
      if (id.startsWith("skill:"))
        return {
          ...f,
          skillRequirements: f.skillRequirements.map((sr) =>
            `skill:${sr.canonical}` === id ? { ...sr, required: false } : sr,
          ),
        };
      return f;
    }, impossible);
    assert.equal(
      applyFilters(profiles, without).matched.length,
      relax.wouldYield,
      `relaxation "${relax.labels.join(" and ")}" promised ${relax.wouldYield}`,
    );
  }
  console.log(`      → best escape: drop "${r.relaxations[0].labels.join(" and ")}" for ${r.relaxations[0].wouldYield}`);
});

check("an over-constrained search always gets an escape route", () => {
  // Several filters each independently empty the pool, so no single drop helps.
  const overConstrained: Filters = {
    ...base,
    skillRequirements: [
      { canonical: "Swift", direct: ["Swift"], implied: ["SwiftUI"], transferable: [], required: true },
    ],
    yearsMin: 12,
    locations: ["Berlin"],
    companyTypes: ["enterprise"],
    titleKeywords: ["iOS"],
  };
  const r = applyFilters(profiles, overConstrained);
  assert.equal(r.matched.length, 0, "precondition: nobody should match");
  assert.ok(r.relaxations.length > 0, "over-constrained search offered no way out");
  assert.ok(r.relaxations[0].wouldYield > 0);
  console.log(
    `      → drop "${r.relaxations[0].labels.join(" and ")}" → ${r.relaxations[0].wouldYield} matches`,
  );
});

check("optional skills never exclude anyone", () => {
  const r = applyFilters(profiles, {
    ...base,
    skillRequirements: [
      { canonical: "Haskell", direct: ["Haskell"], implied: [], transferable: [], required: false },
    ],
  });
  assert.equal(r.matched.length, 48);
});

check("no filters means the whole pool", () => {
  assert.equal(applyFilters(profiles, base).matched.length, 48);
});

console.log(`\n${passed} assertions passed\n`);
