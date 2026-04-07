import { getUpdatesResponse } from "../../../server/api/updates.js";

export const prerender = false;

export const GET = () => getUpdatesResponse();
