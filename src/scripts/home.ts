import {
  normalizePushPreferences,
} from "../../shared/catalog.ts";
import {
  applyEventFilters,
  applyRestaurantFilters,
  parseHomeFilters,
  serializeHomeFilters,
  type HomeFilters,
} from "../../shared/filters.ts";
import {
  escapeHtml,
  renderEventTableBody,
  renderRestaurantTableBody,
} from "../../shared/render.ts";
import type {
  InitialData,
  PushPreferences,
  RealtimeCollectionEvent,
  Restaurant,
  SFEvent,
} from "../../shared/types.ts";

const dataNode = document.getElementById("sf-pulse-data");
if (!(dataNode instanceof HTMLScriptElement)) {
  throw new Error("Missing page data");
}

type TimelineKind = "restaurants" | "events";
type FilterKind = keyof HomeFilters;
type PushField = keyof PushPreferences;

const state = {
  data: JSON.parse(dataNode.textContent || "{}") as InitialData,
  filters: parseHomeFilters(new URLSearchParams(window.location.search)),
  pushPreferences: normalizePushPreferences(),
};

const restaurantsInput = document.querySelector<HTMLInputElement>('[data-filter-input="restaurants"]');
const eventsInput = document.querySelector<HTMLInputElement>('[data-filter-input="events"]');
const restaurantsBody = document.querySelector<HTMLTableSectionElement>('[data-table-body="restaurants"]');
const eventsBody = document.querySelector<HTMLTableSectionElement>('[data-table-body="events"]');
const restaurantsEmpty = document.querySelector<HTMLElement>('[data-empty="restaurants"]');
const eventsEmpty = document.querySelector<HTMLElement>('[data-empty="events"]');
const restaurantsCount = document.querySelector<HTMLElement>('[data-count="restaurants"]');
const eventsCount = document.querySelector<HTMLElement>('[data-count="events"]');
const pushButton = document.querySelector<HTMLButtonElement>("[data-push-button]");
const pushPanel = document.querySelector<HTMLElement>("[data-push-panel]");
const pushBanner = document.querySelector<HTMLElement>("[data-push-banner]");
const pushClose = document.querySelector<HTMLButtonElement>("[data-push-close]");
const pushSave = document.querySelector<HTMLButtonElement>("[data-push-save]");
const pushDisable = document.querySelector<HTMLButtonElement>("[data-push-disable]");
const pushReset = document.querySelector<HTMLButtonElement>("[data-push-reset]");
const pushChipButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-push-chip]"));
const lastUpdatedNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-last-updated]"));
const toastRegion = document.querySelector<HTMLElement>("[data-toast-region]");

let toastId = 0;
let pushAvailable = false;
let pushSubscribed = false;
let pushPanelOpen = false;
let pushVapidKey: string | null = null;
let pushEndpoint: string | null = null;

function formatLastUpdated(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function updateLastUpdated(): void {
  const formatted = formatLastUpdated(state.data.lastUpdated);
  for (const node of lastUpdatedNodes) {
    if (formatted) {
      node.hidden = false;
      node.textContent = formatted;
    } else {
      node.hidden = true;
    }
  }
}

function addToast(title: string, body?: string): void {
  if (!toastRegion) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.toastId = String(++toastId);
  toast.innerHTML = `<div class="toastTitle">${escapeHtml(title)}</div>${
    body ? `<div class="toastBody">${escapeHtml(body)}</div>` : ""
  }`;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 5000);
}

function filteredRestaurants(): Restaurant[] {
  return applyRestaurantFilters(state.data.restaurants, state.filters.restaurants);
}

function filteredEvents(): SFEvent[] {
  return applyEventFilters(state.data.events, state.filters.events);
}

function activeTimelineKind(): TimelineKind {
  return window.location.hash === "#events" ? "events" : "restaurants";
}

function scrollToday(kind: TimelineKind): void {
  const container = document.querySelector<HTMLElement>(`[data-scroll-container="${kind}"]`);
  const today = document.querySelector<HTMLElement>(`[data-today-row="${kind}"]`);
  if (!container || !today) return;

  const containerTop = container.getBoundingClientRect().top;
  const todayTop = today.getBoundingClientRect().top;
  const relativeTop = todayTop - containerTop + container.scrollTop;
  const target = relativeTop - container.clientHeight / 2 + today.offsetHeight / 2;
  container.scrollTop = Math.max(0, target);
}

function scheduleTodayScroll(kind: TimelineKind, waitForLayout = false): void {
  requestAnimationFrame(() => {
    if (waitForLayout) {
      requestAnimationFrame(() => scrollToday(kind));
      return;
    }
    scrollToday(kind);
  });
}

function scheduleActiveTodayScroll(waitForLayout = false): void {
  scheduleTodayScroll(activeTimelineKind(), waitForLayout);
}

function syncFilterControls(kind: FilterKind): void {
  const filters = state.filters[kind];
  const queryInput = kind === "restaurants" ? restaurantsInput : eventsInput;
  if (queryInput && queryInput.value !== filters.query) {
    queryInput.value = filters.query;
  }
}

function syncUrl(): void {
  const params = serializeHomeFilters(state.filters);
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}

function renderRestaurants(): void {
  if (!restaurantsBody || !restaurantsEmpty) return;
  const filtered = filteredRestaurants();
  restaurantsBody.innerHTML = renderRestaurantTableBody(filtered);
  restaurantsEmpty.hidden = filtered.length !== 0;
  if (restaurantsCount) {
    restaurantsCount.textContent = String(filtered.length);
  }
  syncFilterControls("restaurants");
  scheduleTodayScroll("restaurants");
}

function renderEvents(): void {
  if (!eventsBody || !eventsEmpty) return;
  const filtered = filteredEvents();
  eventsBody.innerHTML = renderEventTableBody(filtered);
  eventsEmpty.hidden = filtered.length !== 0;
  if (eventsCount) {
    eventsCount.textContent = String(filtered.length);
  }
  syncFilterControls("events");
  scheduleTodayScroll("events");
}

function renderAllFilters(): void {
  renderRestaurants();
  renderEvents();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `${response.status} ${response.statusText}`));
  }
  return response.json() as Promise<T>;
}

function updateCollection<T extends { id: number }>(
  current: T[],
  delta: RealtimeCollectionEvent<T>,
): T[] {
  const next = new Map(current.map((item) => [item.id, item]));
  for (const item of delta.upserted) {
    next.set(item.id, item);
  }
  for (const id of delta.deleted) {
    next.delete(id);
  }
  return Array.from(next.values());
}

function applyRealtimeDelta(kind: TimelineKind, delta: RealtimeCollectionEvent<Restaurant | SFEvent>): void {
  if (kind === "restaurants") {
    state.data.restaurants = updateCollection(state.data.restaurants, delta as RealtimeCollectionEvent<Restaurant>);
    renderRestaurants();
  } else {
    state.data.events = updateCollection(state.data.events, delta as RealtimeCollectionEvent<SFEvent>);
    renderEvents();
  }

  if (delta.version) {
    state.data.lastUpdated = delta.version;
    updateLastUpdated();
  }

  if (delta.summary) {
    addToast(kind === "restaurants" ? "Restaurants updated" : "Events updated", delta.summary);
  }
}

async function refreshIfBuildIsStale(): Promise<void> {
  try {
    const latest = await fetchJson<{ lastUpdated: string | null }>("/api/updates/last-updated");
    if (latest.lastUpdated === state.data.lastUpdated) return;

    state.data.lastUpdated = latest.lastUpdated;
    const [restaurants, events] = await Promise.all([
      fetchJson<Restaurant[]>("/api/restaurants"),
      fetchJson<SFEvent[]>("/api/events"),
    ]);

    state.data.restaurants = restaurants;
    state.data.events = events;
    renderAllFilters();
    updateLastUpdated();
  } catch {
    // Keep the prerendered content if the API is unavailable.
  }
}

function decodePushKey(value: string): Uint8Array {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function syncPushPreferenceControls(): void {
  for (const button of pushChipButtons) {
    const field = button.dataset.field as PushField | undefined;
    const value = button.dataset.value ?? "";
    if (!field) continue;
    button.classList.toggle("active", (state.pushPreferences[field] as string[]).includes(value));
  }
}

function setPushPanelOpen(nextOpen: boolean): void {
  pushPanelOpen = nextOpen && pushAvailable;
  pushPanel?.toggleAttribute("hidden", !pushPanelOpen);
  pushButton?.setAttribute("aria-expanded", pushPanelOpen ? "true" : "false");
}

function setPushButtonState(): void {
  if (!pushButton) return;

  pushButton.hidden = !pushAvailable;
  pushButton.disabled = !pushAvailable;
  pushButton.classList.toggle("active", pushSubscribed);
  pushButton.ariaLabel = pushSubscribed
    ? "Configure push alerts"
    : pushAvailable
      ? "Enable push alerts"
      : "Push notifications unavailable";
  pushButton.innerHTML = pushSubscribed
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.9 17.9 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  if (pushSave) {
    pushSave.textContent = pushSubscribed ? "Save alerts" : "Enable alerts";
  }
  pushDisable?.toggleAttribute("hidden", !pushSubscribed);
}

async function loadStoredPushPreferences(): Promise<void> {
  if (!pushEndpoint) {
    state.pushPreferences = normalizePushPreferences();
    syncPushPreferenceControls();
    return;
  }

  try {
    const response = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(pushEndpoint)}`);
    if (response.status === 404) {
      state.pushPreferences = normalizePushPreferences();
      syncPushPreferenceControls();
      return;
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load alert preferences."));
    }

    const body = (await response.json()) as { preferences?: PushPreferences };
    state.pushPreferences = normalizePushPreferences(body.preferences);
    syncPushPreferenceControls();
  } catch (error) {
    addToast(
      "Push notifications",
      error instanceof Error ? error.message : "Failed to load alert preferences.",
    );
  }
}

async function subscribeCurrentBrowser(): Promise<void> {
  if (!pushVapidKey) {
    throw new Error("Push notifications are unavailable right now.");
  }

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodePushKey(pushVapidKey),
  });
  const payload = subscription.toJSON();
  await fetchJson("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: payload.endpoint,
      keys: payload.keys,
      preferences: state.pushPreferences,
    }),
  });
  pushSubscribed = true;
  pushEndpoint = payload.endpoint ?? null;
}

async function unsubscribeCurrentBrowser(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    pushSubscribed = false;
    pushEndpoint = null;
    setPushButtonState();
    return;
  }

  await fetchJson("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: existing.endpoint }),
  });
  await existing.unsubscribe();
  pushSubscribed = false;
  pushEndpoint = null;
  state.pushPreferences = normalizePushPreferences();
  syncPushPreferenceControls();
}

async function savePushPreferences(): Promise<void> {
  if (!pushSubscribed) {
    await subscribeCurrentBrowser();
    return;
  }

  if (!pushEndpoint) {
    throw new Error("No active subscription was found.");
  }

  await fetchJson("/api/push/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: pushEndpoint, preferences: state.pushPreferences }),
  });
}

async function initPush(): Promise<void> {
  if (!pushButton) return;

  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!supported) {
    pushButton.hidden = true;
    pushBanner?.removeAttribute("hidden");
    return;
  }

  pushBanner?.setAttribute("hidden", "");

  try {
    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    pushSubscribed = Boolean(existing);
    pushEndpoint = existing?.endpoint ?? null;

    const body = await fetchJson<{ key?: string }>("/api/push/vapid-key");
    pushVapidKey = body.key ?? null;
    pushAvailable = Boolean(pushVapidKey);
    setPushButtonState();
    syncPushPreferenceControls();

    if (pushSubscribed) {
      await loadStoredPushPreferences();
    }
  } catch (error) {
    pushAvailable = false;
    setPushButtonState();
    addToast(
      "Push notifications",
      error instanceof Error ? error.message : "Push notifications are unavailable right now.",
    );
  }

  pushButton.addEventListener("click", () => {
    if (!pushAvailable) return;
    setPushPanelOpen(!pushPanelOpen);
  });

  pushClose?.addEventListener("click", () => setPushPanelOpen(false));

  pushReset?.addEventListener("click", () => {
    state.pushPreferences = normalizePushPreferences();
    syncPushPreferenceControls();
  });

  pushDisable?.addEventListener("click", async () => {
    try {
      await unsubscribeCurrentBrowser();
      setPushPanelOpen(false);
      addToast("Push notifications", "Alerts disabled for this device.");
    } catch (error) {
      addToast(
        "Push notifications",
        error instanceof Error ? error.message : "Push notifications could not be updated.",
      );
    } finally {
      setPushButtonState();
    }
  });

  pushSave?.addEventListener("click", async () => {
    const wasSubscribed = pushSubscribed;
    try {
      await savePushPreferences();
      setPushButtonState();
      setPushPanelOpen(true);
      addToast("Push notifications", wasSubscribed ? "Alert preferences saved." : "Alerts enabled.");
    } catch (error) {
      addToast(
        "Push notifications",
        error instanceof Error ? error.message : "Push notifications could not be updated.",
      );
    }
  });

  for (const button of pushChipButtons) {
    button.addEventListener("click", () => {
      const field = button.dataset.field as PushField | undefined;
      const value = button.dataset.value;
      if (!field || !value) return;

      const current = new Set(state.pushPreferences[field]);
      if (current.has(value as never)) {
        current.delete(value as never);
      } else {
        current.add(value as never);
      }
      state.pushPreferences = {
        ...state.pushPreferences,
        [field]: Array.from(current).sort(),
      };
      syncPushPreferenceControls();
    });
  }
}

function initSse(): void {
  const stream = new EventSource("/api/events-stream");

  stream.addEventListener("restaurants", (event) => {
    applyRealtimeDelta(
      "restaurants",
      JSON.parse((event as MessageEvent<string>).data) as RealtimeCollectionEvent<Restaurant>,
    );
  });

  stream.addEventListener("events", (event) => {
    applyRealtimeDelta(
      "events",
      JSON.parse((event as MessageEvent<string>).data) as RealtimeCollectionEvent<SFEvent>,
    );
  });
}

function setRestaurantQuery(query: string): void {
  state.filters.restaurants = { ...state.filters.restaurants, query };
  syncUrl();
  renderRestaurants();
}

function setEventQuery(query: string): void {
  state.filters.events = { ...state.filters.events, query };
  syncUrl();
  renderEvents();
}

restaurantsInput?.addEventListener("input", () => {
  setRestaurantQuery(restaurantsInput.value);
});

eventsInput?.addEventListener("input", () => {
  setEventQuery(eventsInput.value);
});

window.addEventListener("hashchange", () => {
  scheduleActiveTodayScroll(true);
});

window.addEventListener("load", () => {
  scheduleActiveTodayScroll(true);
}, { once: true });

window.addEventListener("pageshow", () => {
  scheduleActiveTodayScroll(true);
});

window.addEventListener("popstate", () => {
  state.filters = parseHomeFilters(new URLSearchParams(window.location.search));
  renderAllFilters();
});

renderAllFilters();
scheduleActiveTodayScroll(true);
updateLastUpdated();
void refreshIfBuildIsStale();
void initPush();
initSse();
