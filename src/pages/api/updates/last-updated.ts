import { getLastUpdatedResponse } from "../../../server/api/updates.js";

export const prerender = false;

export const GET = () => getLastUpdatedResponse();
