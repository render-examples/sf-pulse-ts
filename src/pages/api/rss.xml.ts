import { getRssResponse } from "../../server/api/rss.js";

export const prerender = false;

export const GET = () => getRssResponse();
