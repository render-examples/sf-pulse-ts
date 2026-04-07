import { deleteRestaurantResponse } from "../../../server/api/restaurants.js";

export const prerender = false;

export const DELETE = async ({ request, params }: { request: Request; params: { id: string } }) =>
  deleteRestaurantResponse(request, Number(params.id));
