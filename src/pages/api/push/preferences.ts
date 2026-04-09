import { updatePushPreferencesResponse } from "../../../server/api/push.js";

export const prerender = false;

export const POST = ({ request }: { request: Request }) => updatePushPreferencesResponse(request);
