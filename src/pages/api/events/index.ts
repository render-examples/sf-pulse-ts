import { getEventsResponse } from "../../../server/api/events.js";

export const prerender = false;

export const GET = () => getEventsResponse();
