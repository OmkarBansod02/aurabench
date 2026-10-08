import { withStore } from "@/lib/web/server";
import {
  apiError,
  executionOptions,
  readBody,
  RequestError,
  uuid,
} from "@/lib/web/validation.mts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = uuid((await context.params).id);
    const options = executionOptions(await readBody(request));
    const result = await withStore(async (store, service) => {
      const saved = await store.getCase(id);
      if (!saved || !(await store.getRun(saved.baselineRunId)))
        throw new RequestError("Regression or baseline not found.", 404);
      return service.replay(id, options);
    });
    return Response.json(
      { runId: result.candidateRunId, comparisonId: result.candidateRunId },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
