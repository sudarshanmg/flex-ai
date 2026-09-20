import { z } from "zod";
import { callModel, errorResponse, FaultSchema } from "@/lib/llm";
import { InterpretResponseSchema } from "@/lib/schema";
import { INTERPRET_SYSTEM, interpretUser } from "@/prompts/interpret";

const BodySchema = z.object({
  query: z.string().min(3, "Describe the role you are hiring for."),
  fault: FaultSchema,
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      return Response.json(
        { error: { kind: "bad_request", message: body.error.issues[0].message, attempts: 0 } },
        { status: 400 },
      );
    }

    const { data, attempts, notes } = await callModel({
      label: "interpret",
      system: INTERPRET_SYSTEM,
      user: interpretUser(body.data.query),
      schema: InterpretResponseSchema,
      fault: body.data.fault,
      temperature: 0.3,
    });

    return Response.json({ ...data, meta: { attempts, notes } });
  } catch (err) {
    return errorResponse(err);
  }
}
