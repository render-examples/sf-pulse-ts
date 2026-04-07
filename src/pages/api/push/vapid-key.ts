import { getPushVapidKeyResponse } from "../../../server/api/push.js";

export const prerender = false;

export const GET = () => getPushVapidKeyResponse();
