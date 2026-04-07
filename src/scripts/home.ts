import type { DietaryFlags, InitialData, Restaurant, SFEvent } from "../../shared/types.ts";
import { buildTimeline } from "../../shared/timeline.ts";

const dataNode = document.getElementById("sf-pulse-data");
if (!(dataNode instanceof HTMLScriptElement)) {
  throw new Error("Missing page data");
}

const state = {
  data: JSON.parse(dataNode.textContent || "{}") as InitialData,
};

const DIET_LABELS: {
  key: keyof DietaryFlags;
  symbol: string;
  label: string;
  color: string;
}[] = [
  { key: "gluten_free", symbol: "GF", label: "Gluten-free", color: "#d4a017" },
  { key: "vegan", symbol: "VG", label: "Vegan", color: "#4caf50" },
  { key: "vegetarian", symbol: "V", label: "Vegetarian", color: "#66bb6a" },
];

const restaurantsInput = document.querySelector<HTMLInputElement>('[data-filter-input="restaurants"]');
const eventsInput = document.querySelector<HTMLInputElement>('[data-filter-input="events"]');
const restaurantsBody = document.querySelector<HTMLTableSectionElement>('[data-table-body="restaurants"]');
const eventsBody = document.querySelector<HTMLTableSectionElement>('[data-table-body="events"]');
const restaurantsEmpty = document.querySelector<HTMLElement>('[data-empty="restaurants"]');
const eventsEmpty = document.querySelector<HTMLElement>('[data-empty="events"]');
const restaurantsCount = document.querySelector<HTMLElement>('[data-count="restaurants"]');
const eventsCount = document.querySelector<HTMLElement>('[data-count="events"]');
const pushButton = document.querySelector<HTMLButtonElement>("[data-push-button]");
const pushBanner = document.querySelector<HTMLElement>("[data-push-banner]");
const lastUpdatedNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-last-updated]"));
const toastRegion = document.querySelector<HTMLElement>("[data-toast-region]");

let toastId = 0;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function externalLinkIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  `;
}

function pinIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;display:inline;vertical-align:middle;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  `;
}

function menuIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;display:inline;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
      <line x1="4" y1="22" x2="4" y2="15"></line>
    </svg>
  `;
}

function michelinIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="michelinIcon">
      <path d="M12 1.5l2.1 5.17 5.58-1.66-1.66 5.58L23.2 12l-5.17 2.1 1.66 5.58-5.58-1.66L12 23.2l-2.1-5.17-5.58 1.66 1.66-5.58L.8 12l5.17-2.1L4.31 4.32l5.58 1.66z" fill="currentColor"></path>
      <circle cx="12" cy="12" r="3.25" fill="var(--surface)"></circle>
    </svg>
  `;
}

function renderDietaryBadges(flags: DietaryFlags | null): string {
  if (!flags) return "";

  const badges = DIET_LABELS.filter((diet) => flags[diet.key].available);
  if (badges.length === 0) return "";

  return `<span class="dietaryBadges">${badges
    .map((diet) => {
      const flag = flags[diet.key];
      const classes = ["dietaryBadge"];
      if (flag.confidence === "inferred") {
        classes.push("dietaryInferred");
      }
      return `<span class="${classes.join(" ")}" style="border-color:${diet.color};color:${diet.color}" title="${escapeHtml(
        `${diet.label}${flag.confidence === "inferred" ? " (likely)" : ""}`,
      )}">${diet.symbol}</span>`;
    })
    .join("")}</span>`;
}

function renderRestaurantRows(restaurants: Restaurant[]): string {
  return buildTimeline(restaurants, (restaurant) => restaurant.opened_date)
    .map((row) => {
      if (row.kind === "today") {
        return `
          <tr class="todayRow" data-today-row="restaurants">
            <td colspan="5" class="todayCell">
              <span class="todayLabel">Today</span>
            </td>
          </tr>
        `;
      }

      const restaurant = row.item;
      return `
        <tr>
          <td>
            <div class="cellPrimary">
              ${escapeHtml(restaurant.name)}
              ${
                restaurant.menu_url
                  ? `<a href="${escapeHtml(restaurant.menu_url)}" target="_blank" rel="noopener noreferrer" class="menuLink" title="View menu">${menuIcon()} Menu</a>`
                  : ""
              }
            </div>
            ${
              restaurant.address
                ? `<div class="cellSub" style="display:flex;align-items:center;gap:3px">${pinIcon()} ${escapeHtml(restaurant.address)}</div>`
                : ""
            }
            ${
              restaurant.source_url
                ? `<a href="${escapeHtml(restaurant.source_url)}" target="_blank" rel="noopener noreferrer" class="cellSource">Source ${externalLinkIcon()}</a>`
                : ""
            }
          </td>
          <td class="colNeighborhood"><span class="badge">${escapeHtml(restaurant.neighborhood)}</span></td>
          <td class="colCuisine" style="color:var(--text-2)">${escapeHtml(restaurant.cuisine)}</td>
          <td class="colDiet">${renderDietaryBadges(restaurant.dietary_flags)}</td>
          <td>${
            restaurant.highlight_kind === "michelin"
              ? `<span class="michelinOpened">${michelinIcon()}<span>${escapeHtml(restaurant.opened_date)}</span></span>`
              : `<span style="color:var(--text-2);white-space:nowrap;font-size:12px">${escapeHtml(restaurant.opened_date)}</span>`
          }</td>
        </tr>
      `;
    })
    .join("");
}

function renderEventRows(events: SFEvent[]): string {
  return buildTimeline(events, (event) => event.date)
    .map((row) => {
      if (row.kind === "today") {
        return `
          <tr class="todayRow" data-today-row="events">
            <td colspan="4" class="todayCell">
              <span class="todayLabel">Today</span>
            </td>
          </tr>
        `;
      }

      const event = row.item;
      return `
        <tr>
          <td>
            <div class="cellPrimary">${escapeHtml(event.title)}</div>
            ${
              event.description
                ? `<div class="cellSub">${escapeHtml(event.description)}</div>`
                : ""
            }
            ${
              event.source_url
                ? `<a href="${escapeHtml(event.source_url)}" target="_blank" rel="noopener noreferrer" class="cellSource">Source ${externalLinkIcon()}</a>`
                : ""
            }
          </td>
          <td class="colNeighborhood" style="color:var(--text-2);font-size:12px">${escapeHtml(event.location)}</td>
          <td style="color:var(--text-2);white-space:nowrap;font-size:12px">${escapeHtml(event.date)}</td>
          <td class="colTime" style="color:var(--text-2);white-space:nowrap;font-size:12px">${escapeHtml(event.time ?? "—")}</td>
        </tr>
      `;
    })
    .join("");
}

function filterRestaurants(value: string): Restaurant[] {
  const query = value.trim().toLowerCase();
  if (!query) return state.data.restaurants;

  return state.data.restaurants.filter(
    (restaurant) =>
      restaurant.name.toLowerCase().includes(query) ||
      restaurant.neighborhood.toLowerCase().includes(query) ||
      restaurant.cuisine.toLowerCase().includes(query),
  );
}

function filterEvents(value: string): SFEvent[] {
  const query = value.trim().toLowerCase();
  if (!query) return state.data.events;

  return state.data.events.filter(
    (event) =>
      event.title.toLowerCase().includes(query) ||
      event.location.toLowerCase().includes(query) ||
      (event.description ?? "").toLowerCase().includes(query),
  );
}

function scrollToday(kind: "restaurants" | "events"): void {
  const container = document.querySelector<HTMLElement>(`[data-scroll-container="${kind}"]`);
  const today = document.querySelector<HTMLElement>(`[data-today-row="${kind}"]`);
  if (!container || !today) return;

  const containerTop = container.getBoundingClientRect().top;
  const todayTop = today.getBoundingClientRect().top;
  const relativeTop = todayTop - containerTop + container.scrollTop;
  const target = relativeTop - container.clientHeight / 2 + today.offsetHeight / 2;
  container.scrollTop = Math.max(0, target);
}

function renderRestaurants(): void {
  if (!restaurantsBody || !restaurantsEmpty) return;
  const filtered = filterRestaurants(restaurantsInput?.value ?? "");
  restaurantsBody.innerHTML = renderRestaurantRows(filtered);
  restaurantsEmpty.hidden = filtered.length !== 0;
  if (restaurantsCount) {
    restaurantsCount.textContent = String(state.data.restaurants.length);
  }
  requestAnimationFrame(() => scrollToday("restaurants"));
}

function renderEvents(): void {
  if (!eventsBody || !eventsEmpty) return;
  const filtered = filterEvents(eventsInput?.value ?? "");
  eventsBody.innerHTML = renderEventRows(filtered);
  eventsEmpty.hidden = filtered.length !== 0;
  if (eventsCount) {
    eventsCount.textContent = String(state.data.events.length);
  }
  requestAnimationFrame(() => scrollToday("events"));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function refreshRestaurants(showToast = false): Promise<void> {
  state.data.restaurants = await fetchJson<Restaurant[]>("/api/restaurants");
  state.data.lastUpdated = (await fetchJson<{ lastUpdated: string | null }>("/api/updates/last-updated")).lastUpdated;
  renderRestaurants();
  updateLastUpdated();
  if (showToast) {
    addToast("Restaurants updated", "New openings have been added.");
  }
}

async function refreshEvents(showToast = false): Promise<void> {
  state.data.events = await fetchJson<SFEvent[]>("/api/events");
  state.data.lastUpdated = (await fetchJson<{ lastUpdated: string | null }>("/api/updates/last-updated")).lastUpdated;
  renderEvents();
  updateLastUpdated();
  if (showToast) {
    addToast("Events updated", "New Mission District events added.");
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
    renderRestaurants();
    renderEvents();
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
  pushButton.hidden = false;

  let available = false;
  let subscribed = false;
  let vapidKey: string | null = null;

  const setButtonState = () => {
    pushButton.classList.toggle("active", subscribed);
    pushButton.ariaLabel = subscribed
      ? "Disable push notifications"
      : available
        ? "Enable push notifications"
        : "Push notifications unavailable";
    pushButton.disabled = !available;
    pushButton.innerHTML = subscribed
      ? `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.9 17.9 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  };

  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      subscribed = Boolean(await registration.pushManager.getSubscription());
    }

    const response = await fetch("/api/push/vapid-key");
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Push notifications are unavailable right now."));
    }

    const body = (await response.json()) as { key?: string };
    vapidKey = body.key ?? null;
    available = Boolean(vapidKey);
    setButtonState();
  } catch (error) {
    available = false;
    setButtonState();
    addToast(
      "Push notifications",
      error instanceof Error ? error.message : "Push notifications are unavailable right now.",
    );
  }

  pushButton.addEventListener("click", async () => {
    if (!available || !vapidKey) return;

    try {
      const registration = await navigator.serviceWorker.ready;

      if (subscribed) {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          const response = await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          });
          if (!response.ok) {
            throw new Error(await readErrorMessage(response, "Failed to remove the push subscription."));
          }
          await existing.unsubscribe();
        }
        subscribed = false;
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePushKey(vapidKey),
        });
        const payload = subscription.toJSON();
        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: payload.endpoint, keys: payload.keys }),
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Failed to save the push subscription."));
        }
        subscribed = true;
      }

      setButtonState();
    } catch (error) {
      addToast(
        "Push notifications",
        error instanceof Error ? error.message : "Push notifications could not be updated.",
      );
    }
  });
}

function initSse(): void {
  const stream = new EventSource("/api/events-stream");

  stream.addEventListener("restaurants", () => {
    refreshRestaurants(true).catch(() => undefined);
  });

  stream.addEventListener("events", () => {
    refreshEvents(true).catch(() => undefined);
  });
}

restaurantsInput?.addEventListener("input", renderRestaurants);
eventsInput?.addEventListener("input", renderEvents);
window.addEventListener("hashchange", () => {
  requestAnimationFrame(() => {
    scrollToday(window.location.hash === "#events" ? "events" : "restaurants");
  });
});

renderRestaurants();
renderEvents();
updateLastUpdated();
void refreshIfBuildIsStale();
void initPush();
initSse();
