import { deleteEventResponse } from "../../../server/api/events.js";

export const prerender = false;

export const DELETE = async ({ request, params }: { request: Request; params: { id: string } }) =>
  deleteEventResponse(request, Number(params.id));
