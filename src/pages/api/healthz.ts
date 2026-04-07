import { getHealthResponse } from "../../server/api/health.js";

export const prerender = false;

export const GET = () => getHealthResponse();
