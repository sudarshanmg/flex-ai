import { z } from "zod";
import { callModel, LlmError, MODEL } from "../src/lib/llm";

const Schema = z.object({ ok: z.boolean(), model_said: z.string() });
console.log(`model: ${MODEL}\n`);

for (const fault of ["none", "malformed", "rate_limit", "timeout"] as const) {
  try {
    const r = await callModel({
      label: "smoke",
      system: "You are a test harness. Reply exactly as asked.",
      user: 'Set ok to true and model_said to the single word "hello".',
      schema: Schema,
      fault,
    });
    console.log(`fault=${fault.padEnd(11)} → OK   attempts=${r.attempts}  data=${JSON.stringify(r.data)}`);
    if (r.notes.length) console.log(`${" ".repeat(20)}notes: ${r.notes.join(" ")}`);
  } catch (e) {
    const le = e as LlmError;
    console.log(`fault=${fault.padEnd(11)} → FAIL[${le.kind}] after ${le.attempts} attempts: ${le.userMessage}`);
  }
}
