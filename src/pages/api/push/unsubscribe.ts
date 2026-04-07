import { unsubscribeFromPushResponse } from "../../../server/api/push.js";

export const prerender = false;

export const POST = ({ request }: { request: Request }) => unsubscribeFromPushResponse(request);
