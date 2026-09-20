import raw from "../data/profiles.json";
import { ProfileSchema, type Profile } from "./schema";

/** The entire talent pool. Parsed once at module load; malformed data fails loudly at boot. */
export const PROFILES: Profile[] = ProfileSchema.array().parse(raw);

const uniq = (xs: string[]) => [...new Set(xs)].sort();

/**
 * The controlled vocabulary of the dataset.
 *
 * Injected into the interpret and refine prompts so the model proposes values
 * that can actually match. Without it the model reaches for "Bengaluru" or
 * "Postgres" and the filter returns zero for reasons no recruiter could guess.
 */
export const VOCAB = {
  skills: uniq(PROFILES.flatMap((p) => p.skills)),
  locations: uniq(PROFILES.map((p) => p.location)),
  companyTypes: uniq([
    ...PROFILES.map((p) => p.current_company_type),
    ...PROFILES.flatMap((p) => p.past_companies.map((c) => c.company_type)),
  ]),
  titles: uniq(PROFILES.map((p) => p.current_title)),
  years: {
    min: Math.min(...PROFILES.map((p) => p.years_experience)),
    max: Math.max(...PROFILES.map((p) => p.years_experience)),
  },
} as const;

export function vocabularyBlock(): string {
  return [
    `SKILLS PRESENT IN THE POOL (${VOCAB.skills.length}): ${VOCAB.skills.join(", ")}`,
    `LOCATIONS: ${VOCAB.locations.join(", ")}`,
    `COMPANY TYPES: ${VOCAB.companyTypes.join(", ")}`,
    `TITLES: ${VOCAB.titles.join(", ")}`,
    `EXPERIENCE RANGE: ${VOCAB.years.min}–${VOCAB.years.max} years`,
  ].join("\n");
}

/** Compact rendering for the scoring prompt: every field the model may cite, nothing else. */
export function renderProfile(p: Profile): string {
  const past = p.past_companies.map((c) => `${c.title} at ${c.company} (${c.company_type}, ${c.years}y)`).join("; ");
  return [
    `id: ${p.id}`,
    `name: ${p.name}`,
    `current_title: ${p.current_title}`,
    `years_experience: ${p.years_experience}`,
    `location: ${p.location}`,
    `current_company: ${p.current_company} (current_company_type: ${p.current_company_type})`,
    `skills: ${p.skills.join(", ")}`,
    `past_companies: ${past || "none"}`,
    `education: ${p.education}`,
    `summary: ${p.summary}`,
  ].join("\n");
}
