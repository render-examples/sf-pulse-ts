import { getPushSubscriptionResponse } from "../../../server/api/push.js";

export const prerender = false;

export const GET = ({ request }: { request: Request }) => getPushSubscriptionResponse(request);
