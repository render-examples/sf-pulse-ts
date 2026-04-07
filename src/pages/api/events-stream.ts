import { getEventsStreamResponse } from "../../server/api/events-stream.js";

export const prerender = false;

export const GET = ({ request }: { request: Request }) => getEventsStreamResponse(request);
