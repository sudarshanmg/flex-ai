import { z } from "zod";
import { callModel, errorResponse, FaultSchema } from "@/lib/llm";
import { PROFILES } from "@/lib/pool";
import { FeedbackSchema, FiltersSchema, RefineResponseSchema, RoundSchema, RubricSchema } from "@/lib/schema";
import { REFINE_SYSTEM, refineUser } from "@/prompts/refine";

const BodySchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
  shownIds: z.array(z.string()),
  feedback: z.array(FeedbackSchema),
  note: z.string(),
  history: z.array(RoundSchema),
  fault: FaultSchema,
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      return Response.json(
        { error: { kind: "bad_request", message: "Invalid refinement request.", attempts: 0 } },
        { status: 400 },
      );
    }
    const { filters, rubric, shownIds, feedback, note, history, fault } = body.data;

    if (feedback.length === 0 && note.trim() === "") {
      return Response.json(
        {
          error: {
            kind: "bad_request",
            message: "Mark a few profiles yes or no, or tell us what is wrong, and we will adjust the search.",
            attempts: 0,
          },
        },
        { status: 400 },
      );
    }

    const shown = shownIds
      .map((id) => PROFILES.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const { data, attempts, notes } = await callModel({
      label: "refine",
      system: REFINE_SYSTEM,
      user: refineUser({ filters, rubric, shown, feedback, note, history }),
      schema: RefineResponseSchema,
      fault,
      temperature: 0.3,
    });

    // Models reach for the string "none" instead of JSON null. Treat those as
    // absent so the UI never renders a contradiction banner saying "None".
    const empty = /^\s*(none|null|n\/a|no contradiction|no contradictions)\.?\s*$/i;
    const contradiction =
      data.contradiction && !empty.test(data.contradiction) ? data.contradiction : null;

    return Response.json({ ...data, contradiction, meta: { attempts, notes } });
  } catch (err) {
    return errorResponse(err);
  }
}
