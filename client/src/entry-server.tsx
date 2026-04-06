/**
 * Server-side rendering entry point.
 * Imported by the Express server (both dev via Vite SSR transform and
 * prod via the pre-built dist/ssr-server.cjs bundle).
 */
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./pages/Home";
import { defaultQueryFn } from "./App";
import type { InitialData } from "./types";

export function renderApp(data: InitialData): string {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: defaultQueryFn,
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });

  // Pre-populate the cache so Home renders with real data immediately
  queryClient.setQueryData(["/api/restaurants"], data.restaurants);
  queryClient.setQueryData(["/api/events"], data.events);
  queryClient.setQueryData(["/api/updates/last-updated"], { lastUpdated: data.lastUpdated });

  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );

  return html;
}
