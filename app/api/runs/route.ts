import { SITE_HEALTH_EVAL } from "@/lib/evals/site-health.mts";
import { withStore } from "@/lib/web/server";
import {
  apiError,
  executionOptions,
  readBody,
  textField,
} from "@/lib/web/validation.mts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const options = {
      ...executionOptions(body),
      scenario: textField(body.scenario, "Scenario"),
    };
    const runId = await withStore((_, service) =>
      service.run(options, { ...SITE_HEALTH_EVAL, scenario: options.scenario }),
    );
    return Response.json({ runId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
