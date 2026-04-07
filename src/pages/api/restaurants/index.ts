import { getRestaurantsResponse } from "../../../server/api/restaurants.js";

export const prerender = false;

export const GET = () => getRestaurantsResponse();
