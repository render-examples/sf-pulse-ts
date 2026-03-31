import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Bell, BellOff, ExternalLink, MapPin, Clock, Utensils, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback } from "react";

interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  openedDate: string;
  sourceUrl: string | null;
  addedAt: string;
}

interface Event {
  id: number;
  title: string;
  location: string;
  date: string;
  time: string | null;
  description: string | null;
  sourceUrl: string | null;
  addedAt: string;
}

function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setIsLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await apiRequest("GET", "/api/push/vapid-key");
      const { key } = await keyRes.json();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });

      const subJson = sub.toJSON();
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      });

      setIsSubscribed(true);
    } catch (err) {
      console.error("Push subscribe error:", err);
    }
    setIsLoading(false);
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    }
    setIsLoading(false);
  }, []);

  return { isSubscribed, isSupported, isLoading, subscribe, unsubscribe };
}

function RestaurantTable({ data, filter }: { data: Restaurant[]; filter: string }) {
  const filtered = data.filter((r) => {
    const q = filter.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.neighborhood.toLowerCase().includes(q) ||
      r.cuisine.toLowerCase().includes(q)
    );
  });

  return (
    <div className="overflow-x-auto" data-testid="restaurants-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Name</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden sm:table-cell">Neighborhood</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden md:table-cell">Cuisine</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Opened</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border/50 hover:bg-accent/50 transition-colors"
              data-testid={`restaurant-row-${r.id}`}
            >
              <td className="py-3 px-3">
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground sm:hidden mt-0.5">
                  {r.neighborhood}
                </div>
                {r.address && (
                  <div className="text-xs text-muted-foreground mt-0.5 hidden lg:block">
                    <MapPin className="inline w-3 h-3 mr-1 opacity-60" />
                    {r.address}
                  </div>
                )}
                {r.sourceUrl && (
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                    data-testid={`restaurant-source-${r.id}`}
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
              <td className="py-3 px-3 hidden sm:table-cell">
                <Badge variant="secondary" className="font-normal">{r.neighborhood}</Badge>
              </td>
              <td className="py-3 px-3 text-muted-foreground hidden md:table-cell">{r.cuisine}</td>
              <td className="py-3 px-3 text-muted-foreground whitespace-nowrap text-xs">{r.openedDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No restaurants match your filter.</p>
      )}
    </div>
  );
}

function EventTable({ data, filter }: { data: Event[]; filter: string }) {
  const filtered = data.filter((e) => {
    const q = filter.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="overflow-x-auto" data-testid="events-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Event</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden sm:table-cell">Location</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Date</th>
            <th className="text-left py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden md:table-cell">Time</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr
              key={e.id}
              className="border-b border-border/50 hover:bg-accent/50 transition-colors"
              data-testid={`event-row-${e.id}`}
            >
              <td className="py-3 px-3">
                <div className="font-medium text-foreground">{e.title}</div>
                <div className="text-xs text-muted-foreground sm:hidden mt-0.5">
                  {e.location}
                </div>
                {e.description && (
                  <div className="text-xs text-muted-foreground mt-1 max-w-md hidden lg:block">
                    {e.description}
                  </div>
                )}
                {e.sourceUrl && (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                    data-testid={`event-source-${e.id}`}
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
              <td className="py-3 px-3 text-muted-foreground hidden sm:table-cell text-xs">
                <MapPin className="inline w-3 h-3 mr-1 opacity-60" />
                {e.location}
              </td>
              <td className="py-3 px-3 text-muted-foreground whitespace-nowrap text-xs">{e.date}</td>
              <td className="py-3 px-3 text-muted-foreground whitespace-nowrap text-xs hidden md:table-cell">{e.time || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No events match your filter.</p>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const push = usePushNotifications();
  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"restaurants" | "events">("restaurants");

  const { data: restaurants, isLoading: loadingR } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: events, isLoading: loadingE } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: lastUpdated } = useQuery<{ lastUpdated: string | null }>({
    queryKey: ["/api/last-updated"],
    refetchInterval: 5 * 60 * 1000,
  });

  // Register service worker on mount
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs" style={{ fontFamily: "var(--font-display)" }}>SF</span>
            </div>
            <div>
              <h1 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-site-title">
                SF Pulse
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                New restaurants & Mission District events
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {push.isSupported && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                disabled={push.isLoading}
                data-testid="button-push-toggle"
                title={push.isSubscribed ? "Disable notifications" : "Enable notifications"}
              >
                {push.isSubscribed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Tab toggle */}
        <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 max-w-xs">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "restaurants"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("restaurants")}
            data-testid="button-tab-restaurants"
          >
            <Utensils className="h-3.5 w-3.5" />
            Restaurants
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "events"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("events")}
            data-testid="button-tab-events"
          >
            <Calendar className="h-3.5 w-3.5" />
            Events
          </button>
        </div>

        {/* Restaurants Section */}
        {activeTab === "restaurants" && (
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  New SF Restaurants
                </h2>
                <p className="text-xs text-muted-foreground">
                  Openings from the last 3 months &mdash; {restaurants?.length ?? "..."} tracked
                </p>
              </div>
              <Input
                type="search"
                placeholder="Filter by name, area, cuisine..."
                className="max-w-xs h-8 text-sm"
                value={restaurantFilter}
                onChange={(e) => setRestaurantFilter(e.target.value)}
                data-testid="input-restaurant-filter"
              />
            </div>
            <div className="rounded-lg border border-border bg-card">
              {loadingR ? <TableSkeleton /> : <RestaurantTable data={restaurants || []} filter={restaurantFilter} />}
            </div>
          </section>
        )}

        {/* Events Section */}
        {activeTab === "events" && (
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Mission District Events
                </h2>
                <p className="text-xs text-muted-foreground">
                  Upcoming events in and around the Mission &mdash; {events?.length ?? "..."} listed
                </p>
              </div>
              <Input
                type="search"
                placeholder="Filter events..."
                className="max-w-xs h-8 text-sm"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                data-testid="input-event-filter"
              />
            </div>
            <div className="rounded-lg border border-border bg-card">
              {loadingE ? <TableSkeleton /> : <EventTable data={events || []} filter={eventFilter} />}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
          <span>
            Data sourced from Eater SF, The Infatuation, Eddie's List, SFGate, Funcheap, Brick &amp; Mortar, Roxie Theater
          </span>
          {lastUpdated?.lastUpdated && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last updated: {new Date(lastUpdated.lastUpdated).toLocaleDateString()}
            </span>
          )}
        </footer>

        {/* iOS Push Instructions */}
        {push.isSupported === false && (
          <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
            <strong>iOS Notifications:</strong> Add this page to your Home Screen (Share → Add to Home Screen), then tap the bell icon to enable push notifications. Requires iOS 16.4+.
          </div>
        )}
      </main>
    </div>
  );
}
