import { withStore } from "@/lib/web/server";
import {
  apiError,
  callBudget,
  readBody,
  RequestError,
  textField,
  toolNames,
  uuid,
} from "@/lib/web/validation.mts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const runId = uuid(body.runId);
    const name = textField(body.name, "Regression name", 160);
    const overrides = {
      ...(body.requiredTools === undefined
        ? {}
        : { requiredTools: toolNames(body.requiredTools) }),
      ...(body.forbiddenTools === undefined
        ? {}
        : { forbiddenTools: toolNames(body.forbiddenTools) }),
      ...(body.maxToolCalls === undefined
        ? {}
        : { maxToolCalls: callBudget(body.maxToolCalls) }),
    };
    const saved = await withStore(async (store, service) => {
      const baseline = await store.getRun(runId);
      if (!baseline) throw new RequestError("Run not found.", 404);
      if (baseline.run.status !== "completed")
        throw new RequestError(
          "Only completed runs can be saved. Inspect the failed execution and run it again.",
          409,
        );
      return service.saveAsRegression(runId, name, overrides);
    });
    return Response.json({ evalCaseId: saved.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
