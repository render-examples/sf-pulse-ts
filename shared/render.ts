import { buildTimeline } from "./timeline.ts";
import {
  deriveEventCategory,
  deriveEventNeighborhood,
  formatEventCategory,
} from "./catalog.ts";
import type { Restaurant, SFEvent } from "./types.ts";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function restaurantDetailHref(id: number): string {
  return `/restaurants/${id}`;
}

export function eventDetailHref(id: number): string {
  return `/events/${id}`;
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

function michelinIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="michelinIcon">
      <path d="M12 1.5l2.1 5.17 5.58-1.66-1.66 5.58L23.2 12l-5.17 2.1 1.66 5.58-5.58-1.66L12 23.2l-2.1-5.17-5.58 1.66 1.66-5.58L.8 12l5.17-2.1L4.31 4.32l5.58 1.66z" fill="currentColor"></path>
      <circle cx="12" cy="12" r="3.25" fill="var(--surface)"></circle>
    </svg>
  `;
}

export function renderRestaurantTableBody(restaurants: Restaurant[]): string {
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
        <tr data-row-id="${restaurant.id}">
          <td>
            <div class="cellPrimary">
              <a class="detailLink" href="${restaurantDetailHref(restaurant.id)}">${escapeHtml(restaurant.name)}</a>
            </div>
            ${
              restaurant.address
                ? `<div class="cellSub cellAddress">${pinIcon()} ${escapeHtml(restaurant.address)}</div>`
                : ""
            }
            ${
              restaurant.source_url
                ? `<a href="${escapeHtml(restaurant.source_url)}" target="_blank" rel="noopener noreferrer" class="cellSource">Source ${externalLinkIcon()}</a>`
                : ""
            }
          </td>
          <td class="colNeighborhood"><span class="badge">${escapeHtml(restaurant.neighborhood)}</span></td>
          <td class="colCuisine tableMuted">${escapeHtml(restaurant.cuisine)}</td>
          <td>${
            restaurant.highlight_kind === "michelin"
              ? `<span class="michelinOpened">${michelinIcon()}<span>${escapeHtml(restaurant.opened_date)}</span></span>`
              : `<span class="tableMuted tableDate">${escapeHtml(restaurant.opened_date)}</span>`
          }</td>
        </tr>
      `;
    })
    .join("");
}

export function renderEventTableBody(events: SFEvent[]): string {
  return buildTimeline(events, (event) => event.date)
    .map((row) => {
      if (row.kind === "today") {
        return `
          <tr class="todayRow" data-today-row="events">
            <td colspan="5" class="todayCell">
              <span class="todayLabel">Today</span>
            </td>
          </tr>
        `;
      }

      const event = row.item;
      const category = deriveEventCategory(event);
      const neighborhood = deriveEventNeighborhood(event);
      return `
        <tr data-row-id="${event.id}">
          <td>
            <div class="cellPrimary">
              <a class="detailLink" href="${eventDetailHref(event.id)}">${escapeHtml(event.title)}</a>
            </div>
            ${
              event.location
                ? `<div class="cellSub cellAddress">${pinIcon()} ${escapeHtml(event.location)}</div>`
                : ""
            }
            ${
              event.description
                ? `<div class="cellSub eventDescription" data-event-description data-expanded="false">
                    <span class="eventDescriptionText" id="event-description-${event.id}" data-event-description-text>${escapeHtml(event.description)}</span>
                    <button class="eventDescriptionToggle" type="button" data-event-description-toggle aria-expanded="false" aria-controls="event-description-${event.id}" hidden>more</button>
                  </div>`
                : ""
            }
            ${
              event.source_url
                ? `<a href="${escapeHtml(event.source_url)}" target="_blank" rel="noopener noreferrer" class="cellSource">Source ${externalLinkIcon()}</a>`
                : ""
            }
          </td>
          <td class="colNeighborhood"><span class="badge">${escapeHtml(neighborhood)}</span></td>
          <td class="colCuisine tableMuted">${escapeHtml(formatEventCategory(category))}</td>
          <td class="colTime tableMuted tableDate">${escapeHtml(event.time ?? "—")}</td>
          <td class="tableMuted tableDate">${escapeHtml(event.date)}</td>
        </tr>
      `;
    })
    .join("");
}
