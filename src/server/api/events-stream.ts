import { initializeRealtime, createSseResponse } from "../../../server/sse.js";

export async function getEventsStreamResponse(request: Request): Promise<Response> {
  await initializeRealtime();
  return createSseResponse(request.signal);
}
