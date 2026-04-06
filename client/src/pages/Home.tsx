import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import s from "./Home.module.css";
import type { Restaurant, SFEvent, DietaryFlags } from "../types";
import { buildTimeline } from "../lib/timeline";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ── Types ─────────────────────────────────────────────────────────────── */
interface Toast { id: number; title: string; body?: string }

/* ── Icons (inline SVG, no deps) ───────────────────────────────────────── */
function IconUtensils() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconBell({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ fill: filled ? "currentColor" : "none" }}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconBellOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function IconExternalLink() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconMichelinStar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={s.michelinIcon}>
      <path
        d="M12 1.5l2.1 5.17 5.58-1.66-1.66 5.58L23.2 12l-5.17 2.1 1.66 5.58-5.58-1.66L12 23.2l-2.1-5.17-5.58 1.66 1.66-5.58L.8 12l5.17-2.1L4.31 4.32l5.58 1.66z"
        fill="currentColor"
      />
      <circle cx="12" cy="12" r="3.25" fill="var(--surface)" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", flexShrink: 0, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* ── Dietary badges ─────────────────────────────────────────────────── */
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

const DIET_LABELS: { key: keyof DietaryFlags; symbol: string; label: string; color: string }[] = [
  { key: "gluten_free", symbol: "GF", label: "Gluten-free", color: "#d4a017" },
  { key: "vegan", symbol: "VG", label: "Vegan", color: "#4caf50" },
  { key: "vegetarian", symbol: "V", label: "Vegetarian", color: "#66bb6a" },
];

function DietaryBadges({ flags }: { flags: DietaryFlags | null }) {
  if (!flags) return null;

  const badges = DIET_LABELS.filter((d) => flags[d.key].available);
  if (badges.length === 0) return null;

  return (
    <span className={s.dietaryBadges}>
      {badges.map((d) => {
        const flag = flags[d.key];
        const dimmed = flag.confidence === "inferred";
        return (
          <span
            key={d.key}
            className={`${s.dietaryBadge} ${dimmed ? s.dietaryInferred : ""}`}
            style={{ borderColor: d.color, color: d.color }}
            title={`${d.label}${dimmed ? " (likely)" : ""}`}
          >
            {d.symbol}
          </span>
        );
      })}
    </span>
  );
}

function decodePushKey(value: string): Uint8Array {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function OpenedLabel({ restaurant }: { restaurant: Restaurant }) {
  if (restaurant.highlight_kind !== "michelin") {
    return (
      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>
        {restaurant.opened_date}
      </span>
    );
  }

  return (
    <span className={s.michelinOpened}>
      <IconMichelinStar />
      <span>{restaurant.opened_date}</span>
    </span>
  );
}

/* ── Push notifications ─────────────────────────────────────────────────── */
function usePush() {
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) {
      setAvailable(false);
      return;
    }

    let cancelled = false;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) {
          setSubscribed(!!sub);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubscribed(false);
        }
      });

    fetch("/api/push/vapid-key")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, "Push notifications are unavailable right now."),
          );
        }
        return response.json() as Promise<{ key?: string }>;
      })
      .then((body) => {
        if (cancelled || !body.key) return;
        setVapidKey(body.key);
        setAvailable(true);
        setUnavailableReason(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setAvailable(false);
        setVapidKey(null);
        setUnavailableReason(
          caught instanceof Error
            ? caught.message
            : "Push notifications are unavailable right now.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || !available || !vapidKey) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePushKey(vapidKey),
      });
      const j = sub.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Failed to save the push subscription."),
        );
      }
      setSubscribed(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Push notifications could not be enabled.",
      );
    } finally {
      setLoading(false);
    }
  }, [available, supported, vapidKey]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const response = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, "Failed to remove the push subscription."),
          );
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Push notifications could not be disabled.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    subscribed,
    supported,
    available,
    loading,
    error,
    unavailableReason,
    subscribe,
    unsubscribe,
  };
}

/* ── useScrollToToday ───────────────────────────────────────────────────── */
/**
 * After layout, scroll the TODAY row to the vertical center of the container.
 * Re-runs whenever `deps` change (e.g. data loads or tab switches).
 */
function useScrollToToday(
  containerRef: React.RefObject<HTMLDivElement | null>,
  todayRef: React.RefObject<HTMLTableRowElement | null>,
  deps: unknown[]
) {
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const todayEl = todayRef.current;
    if (!container || !todayEl) return;

    // Offset from top of the scrollable container to the TODAY row
    const containerTop = container.getBoundingClientRect().top;
    const todayTop = todayEl.getBoundingClientRect().top;
    const relativeTop = todayTop - containerTop + container.scrollTop;

    // Center it: scroll so today row's top is at (containerHeight / 2)
    const target = relativeTop - container.clientHeight / 2 + todayEl.offsetHeight / 2;
    container.scrollTop = Math.max(0, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ── Restaurant timeline ─────────────────────────────────────────────────── */
function RestaurantTimeline({ data, filter }: { data: Restaurant[]; filter: string }) {
  const q = filter.toLowerCase();
  const filtered = filter
    ? data.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.neighborhood.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q)
      )
    : data;

  const rows = useMemo(() => buildTimeline(filtered, (r) => r.opened_date), [filtered]);

  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLTableRowElement>(null);
  useScrollToToday(containerRef, todayRef, [rows]);

  if (filtered.length === 0) return <p className={s.empty}>No restaurants match your filter.</p>;

  return (
    <div className={s.timelineScroll} ref={containerRef}>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className={s.colNeighborhood}>Neighborhood</th>
            <th className={s.colCuisine}>Cuisine</th>
            <th className={s.colDiet}>Diet</th>
            <th>Opened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "today") {
              return (
                <tr key="__today__" ref={todayRef} className={s.todayRow}>
                  <td colSpan={5} className={s.todayCell}>
                    <span className={s.todayLabel}>Today</span>
                  </td>
                </tr>
              );
            }
            const r = row.item;
            return (
              <tr key={r.id}>
                <td>
                  <div className={s.cellPrimary}>
                    {r.name}
                    {r.menu_url && (
                      <a href={r.menu_url} target="_blank" rel="noopener noreferrer" className={s.menuLink} title="View menu">
                        <IconMenu /> Menu
                      </a>
                    )}
                  </div>
                  {r.address && (
                    <div className={s.cellSub} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <IconPin /> {r.address}
                    </div>
                  )}
                  {r.source_url && (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className={s.cellSource}>
                      Source <IconExternalLink />
                    </a>
                  )}
                </td>
                <td className={s.colNeighborhood}>
                  <span className={s.badge}>{r.neighborhood}</span>
                </td>
                <td className={s.colCuisine} style={{ color: "var(--text-2)" }}>{r.cuisine}</td>
                <td className={s.colDiet}>
                  <DietaryBadges flags={r.dietary_flags} />
                </td>
                <td><OpenedLabel restaurant={r} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Events timeline ─────────────────────────────────────────────────────── */
function EventTimeline({ data, filter }: { data: SFEvent[]; filter: string }) {
  const q = filter.toLowerCase();
  const filtered = filter
    ? data.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
      )
    : data;

  const rows = useMemo(() => buildTimeline(filtered, (e) => e.date), [filtered]);

  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLTableRowElement>(null);
  useScrollToToday(containerRef, todayRef, [rows]);

  if (filtered.length === 0) return <p className={s.empty}>No events match your filter.</p>;

  return (
    <div className={s.timelineScroll} ref={containerRef}>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th className={s.colNeighborhood}>Location</th>
            <th>Date</th>
            <th className={s.colTime}>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "today") {
              return (
                <tr key="__today__" ref={todayRef} className={s.todayRow}>
                  <td colSpan={4} className={s.todayCell}>
                    <span className={s.todayLabel}>Today</span>
                  </td>
                </tr>
              );
            }
            const e = row.item;
            return (
              <tr key={e.id}>
                <td>
                  <div className={s.cellPrimary}>{e.title}</div>
                  {e.description && <div className={s.cellSub}>{e.description}</div>}
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noopener noreferrer" className={s.cellSource}>
                      Source <IconExternalLink />
                    </a>
                  )}
                </td>
                <td className={s.colNeighborhood} style={{ color: "var(--text-2)", fontSize: 12 }}>
                  {e.location}
                </td>
                <td style={{ color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>{e.date}</td>
                <td className={s.colTime} style={{ color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>
                  {e.time ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Home page ───────────────────────────────────────────────────────────── */
export default function Home() {
  const qc = useQueryClient();
  const push = usePush();
  const [tab, setTab] = useState<"restaurants" | "events">("restaurants");
  const [rFilter, setRFilter] = useState("");
  const [eFilter, setEFilter] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const addToast = useCallback((title: string, body?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (push.error) {
      addToast("Push notifications", push.error);
    }
  }, [addToast, push.error]);

  const { data: restaurants } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
  });

  const { data: events } = useQuery<SFEvent[]>({
    queryKey: ["/api/events"],
  });

  const { data: lastUpdated } = useQuery<{ lastUpdated: string | null }>({
    queryKey: ["/api/updates/last-updated"],
  });

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  // SSE — live updates from server
  useEffect(() => {
    const es = new EventSource("/api/events-stream");

    es.addEventListener("restaurants", () => {
      qc.invalidateQueries({ queryKey: ["/api/restaurants"] });
      qc.invalidateQueries({ queryKey: ["/api/updates/last-updated"] });
      addToast("Restaurants updated", "New openings have been added.");
    });

    es.addEventListener("events", () => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/updates/last-updated"] });
      addToast("Events updated", "New Mission District events added.");
    });

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => es.close();
  }, [qc, addToast]);

  const lastUpdatedStr = lastUpdated?.lastUpdated
    ? new Date(lastUpdated.lastUpdated).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className={s.page}>
      {/* Header */}
      <header className={s.header}>
        <div className={s.headerInner}>
          <div className={s.logo}>
            <div className={s.logoMark}>SF</div>
            <div>
              <div className={s.siteTitle}>SF Pulse</div>
              <div className={s.siteSubtitle}>New restaurants & Mission District events</div>
            </div>
          </div>
          <div className={s.headerActions}>
            {push.supported && (
              <button
                className={`${s.iconBtn} ${push.subscribed ? s.active : ""}`}
                onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                disabled={push.loading || !push.available}
                aria-label={
                  push.subscribed
                    ? "Disable push notifications"
                    : push.available
                      ? "Enable push notifications"
                      : "Push notifications unavailable"
                }
                title={push.available ? undefined : push.unavailableReason ?? undefined}
              >
                {push.subscribed ? <IconBell filled /> : <IconBellOff />}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={s.main}>
        {/* Tabs */}
        <div className={s.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === "restaurants"}
            className={`${s.tab} ${tab === "restaurants" ? s.tabActive : ""}`}
            onClick={() => setTab("restaurants")}
          >
            <IconUtensils /> Restaurants
          </button>
          <button
            role="tab"
            aria-selected={tab === "events"}
            className={`${s.tab} ${tab === "events" ? s.tabActive : ""}`}
            onClick={() => setTab("events")}
          >
            <IconCalendar /> Events
          </button>
        </div>

        {/* Restaurants */}
        {tab === "restaurants" && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <div>
                <h2 className={s.sectionTitle}>New SF Restaurants</h2>
                <p className={s.sectionMeta}>
                  <span className={s.liveDot} />
                  Recent openings, upcoming spots, and Michelin stars — {restaurants?.length ?? "…"} tracked
                </p>
              </div>
              <input
                type="search"
                className={s.filter}
                placeholder="Filter by name, area, cuisine…"
                value={rFilter}
                onChange={(e) => setRFilter(e.target.value)}
                aria-label="Filter restaurants"
              />
            </div>
            <div className={s.tableCard}>
              {restaurants
                ? <RestaurantTimeline data={restaurants} filter={rFilter} />
                : <div className={s.skeleton}>{Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={s.skeletonRow}>
                      <div className={s.skeletonCell} style={{ width: "30%" }} />
                      <div className={s.skeletonCell} style={{ width: "20%" }} />
                      <div className={s.skeletonCell} style={{ width: "25%" }} />
                      <div className={s.skeletonCell} style={{ width: "15%" }} />
                    </div>
                  ))}</div>
              }
            </div>
          </section>
        )}

        {/* Events */}
        {tab === "events" && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <div>
                <h2 className={s.sectionTitle}>Mission District Events</h2>
                <p className={s.sectionMeta}>
                  <span className={s.liveDot} />
                  Upcoming events in and around the Mission — {events?.length ?? "…"} listed
                </p>
              </div>
              <input
                type="search"
                className={s.filter}
                placeholder="Filter events…"
                value={eFilter}
                onChange={(e) => setEFilter(e.target.value)}
                aria-label="Filter events"
              />
            </div>
            <div className={s.tableCard}>
              {events
                ? <EventTimeline data={events} filter={eFilter} />
                : <div className={s.skeleton}>{Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={s.skeletonRow}>
                      <div className={s.skeletonCell} style={{ width: "30%" }} />
                      <div className={s.skeletonCell} style={{ width: "20%" }} />
                      <div className={s.skeletonCell} style={{ width: "25%" }} />
                      <div className={s.skeletonCell} style={{ width: "15%" }} />
                    </div>
                  ))}</div>
              }
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className={s.footer}>
          <span>
            Sources: Eater SF, The Infatuation, Eddie's List, SFGate, SF Chronicle, Funcheap, Brick &amp; Mortar, Roxie Theater
          </span>
          {lastUpdatedStr && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconClock /> Last updated: {lastUpdatedStr}
            </span>
          )}
        </footer>

        {/* iOS push install instructions */}
        {!push.supported && (
          <div className={s.pushBanner}>
            <strong>iOS Push Notifications:</strong> Add to Home Screen (Share → Add to Home Screen) then tap the bell icon. Requires iOS 16.4+.
          </div>
        )}
      </main>

      {/* Toast region */}
      <div className={s.toastRegion} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={s.toast}>
            <div className={s.toastTitle}>{t.title}</div>
            {t.body && <div className={s.toastBody}>{t.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
