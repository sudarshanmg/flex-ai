import { z } from "zod";
import { callModel, errorResponse, FaultSchema, LlmError } from "@/lib/llm";
import { applyFilters } from "@/lib/filter";
import { PROFILES } from "@/lib/pool";
import { FiltersSchema, RubricSchema, ScoreResponseSchema } from "@/lib/schema";
import { SCORE_SYSTEM, scoreUser } from "@/prompts/score";

/**
 * Bound on how many profiles go to the model in one call. Keeps latency and
 * token cost predictable; beyond this the recruiter should be tightening filters
 * rather than reading a longer list.
 */
const SCORE_LIMIT = 15;

const BodySchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
  fault: FaultSchema,
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      return Response.json(
        { error: { kind: "bad_request", message: "Invalid filters or rubric.", attempts: 0 } },
        { status: 400 },
      );
    }
    const { filters, rubric, fault } = body.data;

    // Filtering is local and deterministic, so it cannot fail. Everything below
    // is best-effort on top of a result we already hold.
    const result = applyFilters(PROFILES, filters);
    const toScore = result.matched.slice(0, SCORE_LIMIT);
    const truncated = Math.max(0, result.matched.length - SCORE_LIMIT);

    if (toScore.length === 0) {
      return Response.json({ ...result, scores: [], truncated, meta: { attempts: 0, notes: [] } });
    }

    try {
      const { data, attempts, notes } = await callModel({
        label: "score",
        system: SCORE_SYSTEM,
        user: scoreUser(rubric, toScore),
        schema: ScoreResponseSchema,
        fault,
        temperature: 0.2,
        // Scoring sends every matched profile and asks for per-criterion reasoning;
        // it is by far the heaviest call in the product.
        timeoutMs: 60_000,
      });
      return Response.json({ ...result, scores: data.scores, truncated, meta: { attempts, notes } });
    } catch (err) {
      // Ranking failed, but the recruiter's filters still produced a real
      // shortlist. Returning it unranked, with the failure attached, is far
      // more useful than throwing the whole search away.
      const e = err instanceof LlmError ? err : null;
      if (!e) throw err;
      console.error(`[score] degrading to unranked results after ${e.kind}`);
      return Response.json({
        ...result,
        scores: [],
        truncated,
        llmError: { kind: e.kind, message: e.userMessage, attempts: e.attempts },
        meta: { attempts: e.attempts, notes: [] },
      });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
