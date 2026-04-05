/**
 * Shared async query function — used by both client and server QueryClients.
 * On the server it never actually executes (cache is pre-populated), but it
 * must be present so react-query doesn't complain about a missing queryFn.
 */
export async function defaultQueryFn({ queryKey }: { queryKey: readonly unknown[] }) {
  const url = queryKey[0] as string;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
