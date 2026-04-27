import {
  findNearestNeighborhood,
  groupByNeighborhood,
} from '../../shared/catalog.ts'
import { escapeHtml, restaurantDetailHref, eventDetailHref } from '../../shared/render.ts'
import type {
  InitialData,
  RealtimeCollectionEvent,
  Restaurant,
  SFEvent,
} from '../../shared/types.ts'

const SF_BOUNDS = { latMin: 37.70, latMax: 37.81, lngMin: -122.52, lngMax: -122.35 }

const dataNode = document.getElementById('sf-pulse-data')
if (!(dataNode instanceof HTMLScriptElement)) {
  throw new Error('Missing page data')
}

const state = {
  data: JSON.parse(dataNode.textContent || '{}') as InitialData,
  selectedNeighborhood: null as string | null,
}

const panelEmpty = document.querySelector<HTMLElement>('[data-panel-empty]')
const panelContent = document.querySelector<HTMLElement>('[data-panel-content]')
const locateBtn = document.querySelector<HTMLButtonElement>('[data-locate-btn]')
const userDot = document.querySelector<HTMLElement>('[data-user-dot]')
const toastRegion = document.querySelector<HTMLElement>('[data-toast-region]')

let toastId = 0

function addToast(title: string, body?: string): void {
  if (!toastRegion) return
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.dataset.toastId = String(++toastId)
  toast.innerHTML = `<div class="toastTitle">${escapeHtml(title)}</div>${
    body ? `<div class="toastBody">${escapeHtml(body)}</div>` : ''
  }`
  toastRegion.append(toast)
  window.setTimeout(() => toast.remove(), 5000)
}

function updateCollection<T extends { id: number }>(
  current: T[],
  delta: RealtimeCollectionEvent<T>,
): T[] {
  const next = new Map(current.map((item) => [item.id, item]))
  for (const item of delta.upserted) {
    next.set(item.id, item)
  }
  for (const id of delta.deleted) {
    next.delete(id)
  }
  return Array.from(next.values())
}

function computeGroups() {
  return groupByNeighborhood(state.data.restaurants, state.data.events)
}

function updateBadges(): void {
  const groups = computeGroups()
  for (const [label, group] of groups) {
    const count = group.restaurants.length + group.events.length
    const badge = document.querySelector<SVGTextElement>(`[data-badge-neighborhood="${label}"]`)
    const badgeBg = document.querySelector<SVGCircleElement>(`[data-badge-bg-neighborhood="${label}"]`)
    if (badge) {
      badge.textContent = String(count)
      badge.style.display = count > 0 ? '' : 'none'
    }
    if (badgeBg) {
      badgeBg.style.display = count > 0 ? '' : 'none'
    }
  }
}

function updateAriaLabels(): void {
  const groups = computeGroups()
  for (const [label, group] of groups) {
    const path = document.querySelector<SVGPathElement>(`[data-neighborhood="${label}"]`)
    if (path) {
      path.setAttribute(
        'aria-label',
        `${label}: ${group.restaurants.length} restaurants, ${group.events.length} events`,
      )
    }
  }
}

function renderPanel(): void {
  if (!panelEmpty || !panelContent) return

  if (!state.selectedNeighborhood) {
    panelEmpty.hidden = false
    panelContent.hidden = true
    return
  }

  const groups = computeGroups()
  const group = groups.get(state.selectedNeighborhood)
  if (!group) {
    panelEmpty.hidden = false
    panelContent.hidden = true
    return
  }

  panelEmpty.hidden = true
  panelContent.hidden = false

  const restaurants = [...group.restaurants].sort((a, b) => {
    if (!a.opened_start_date || !b.opened_start_date) return 0
    return b.opened_start_date.localeCompare(a.opened_start_date)
  })

  const events = [...group.events].sort((a, b) => {
    if (!a.start_date || !b.start_date) return 0
    return a.start_date.localeCompare(b.start_date)
  })

  const total = restaurants.length + events.length

  let html = `
    <div class="mapPanelHeader">
      <div class="mapPanelTitle">${escapeHtml(state.selectedNeighborhood)}</div>
      <div class="mapPanelMeta">${restaurants.length} restaurants, ${events.length} events</div>
    </div>
  `

  if (total === 0) {
    html += `<div class="mapPanelEmpty">No restaurants or events in ${escapeHtml(state.selectedNeighborhood)} yet.</div>`
  }

  if (restaurants.length > 0) {
    html += `<div class="mapSectionLabel">Restaurants</div>`
    for (const r of restaurants) {
      html += `
        <div class="mapCard">
          <div class="mapCardName"><a href="${restaurantDetailHref(r.id)}">${escapeHtml(r.name)}</a></div>
          <div class="mapCardMeta">${escapeHtml(r.cuisine)} · ${escapeHtml(r.opened_date)}</div>
        </div>
      `
    }
  }

  if (events.length > 0) {
    html += `<div class="mapSectionLabel">Events</div>`
    for (const e of events) {
      html += `
        <div class="mapCard">
          <div class="mapCardName"><a href="${eventDetailHref(e.id)}">${escapeHtml(e.title)}</a></div>
          <div class="mapCardMeta">${escapeHtml(e.date)}${e.time ? ` · ${escapeHtml(e.time)}` : ''}</div>
        </div>
      `
    }
  }

  panelContent.innerHTML = html
}

function selectNeighborhood(label: string | null): void {
  const paths = document.querySelectorAll<SVGPathElement>('[data-neighborhood]')
  for (const path of paths) {
    path.dataset.selected = String(path.dataset.neighborhood === label)
  }
  state.selectedNeighborhood = label
  renderPanel()
}

function initMapInteraction(): void {
  const paths = document.querySelectorAll<SVGPathElement>('[data-neighborhood]')

  for (const path of paths) {
    path.addEventListener('click', () => {
      const label = path.dataset.neighborhood ?? null
      if (state.selectedNeighborhood === label) {
        selectNeighborhood(null)
      } else {
        selectNeighborhood(label)
      }
    })

    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        const label = path.dataset.neighborhood ?? null
        if (state.selectedNeighborhood === label) {
          selectNeighborhood(null)
        } else {
          selectNeighborhood(label)
        }
      }
    })
  }
}

function showUserLocation(lat: number, lng: number): void {
  if (!userDot) return
  const svg = document.querySelector<SVGSVGElement>('.mapContainer svg')
  if (!svg) return

  const svgX = ((lng - SF_BOUNDS.lngMin) / (SF_BOUNDS.lngMax - SF_BOUNDS.lngMin)) * 500
  const svgY = ((SF_BOUNDS.latMax - lat) / (SF_BOUNDS.latMax - SF_BOUNDS.latMin)) * 600

  const svgRect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  const scaleX = svgRect.width / viewBox.width
  const scaleY = svgRect.height / viewBox.height

  const pixelX = svgX * scaleX + svgRect.left - svg.parentElement!.getBoundingClientRect().left
  const pixelY = svgY * scaleY + svgRect.top - svg.parentElement!.getBoundingClientRect().top

  userDot.style.left = `${pixelX}px`
  userDot.style.top = `${pixelY}px`
  userDot.dataset.visible = 'true'
}

function initGeolocation(): void {
  if (!locateBtn) return

  locateBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      addToast('Location unavailable', "Your browser doesn't support geolocation.")
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const nearest = findNearestNeighborhood(latitude, longitude)
        selectNeighborhood(nearest.label)
        showUserLocation(latitude, longitude)
        addToast('Location found', `You're nearest to ${nearest.label}.`)
      },
      () => {
        addToast('Location unavailable', "Couldn't get your location. Tap a neighborhood instead.")
      },
    )
  })
}

function initSse(): void {
  const stream = new EventSource('/api/events-stream')

  stream.addEventListener('restaurants', (event) => {
    const delta = JSON.parse(
      (event as MessageEvent<string>).data,
    ) as RealtimeCollectionEvent<Restaurant>
    state.data.restaurants = updateCollection(state.data.restaurants, delta)
    updateBadges()
    updateAriaLabels()
    if (state.selectedNeighborhood) {
      renderPanel()
    }
    if (delta.summary) {
      addToast('Restaurants updated', delta.summary)
    }
  })

  stream.addEventListener('events', (event) => {
    const delta = JSON.parse(
      (event as MessageEvent<string>).data,
    ) as RealtimeCollectionEvent<SFEvent>
    state.data.events = updateCollection(state.data.events, delta)
    updateBadges()
    updateAriaLabels()
    if (state.selectedNeighborhood) {
      renderPanel()
    }
    if (delta.summary) {
      addToast('Events updated', delta.summary)
    }
  })
}

updateBadges()
updateAriaLabels()
initMapInteraction()
initGeolocation()
initSse()
