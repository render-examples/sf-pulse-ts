/**
 * Client hydration entry point.
 * Uses hydrateRoot so React attaches to the server-rendered HTML without
 * discarding and re-rendering it.
 */
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./pages/Home";
import { defaultQueryFn } from "./App";
import "./globals.css";
import type { InitialData } from "./types";

declare global {
  interface Window {
    __INITIAL_DATA__?: InitialData;
  }
}

const initial = window.__INITIAL_DATA__;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Pre-populate query cache from server data so the client never re-fetches
// on hydration and there's no loading flash.
if (initial) {
  queryClient.setQueryData(["/api/restaurants"], initial.restaurants);
  queryClient.setQueryData(["/api/events"], initial.events);
  queryClient.setQueryData(["/api/updates/last-updated"], { lastUpdated: initial.lastUpdated });
}

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  </StrictMode>
);
