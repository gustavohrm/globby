# Lobby Globe Redesign

**Date:** 2026-03-29

## Overview

Replace the current text-only lobby (which lists public users) with an interactive sci-fi globe that shows public rooms as beacon poles. Users can browse rooms, see live stats, and create or delete rooms — all without leaving the home page.

---

## Layout

The home page (`/`) becomes a fullscreen experience:

- `<app-globe>` fills the entire viewport behind everything
- `<rooms-panel>` overlays the right edge as a collapsible slide-in panel
- The existing `app-shell` and `app-nav` remain unchanged; the globe and panel sit inside the shell's `<main>`

---

## Component: `<app-globe>`

**File:** `apps/frontend/_ui/components/globe.ts`

### Responsibilities

- Render an interactive 3D globe using Three.js
- Fetch `GET /api/v1/rooms` on `connectedCallback` and place a beacon for each room
- Re-fetch whenever a `rooms-changed` event fires on `document`
- Highlight the selected beacon when `selected-room` attribute changes

### Attributes

| Attribute | Type | Description |
|---|---|---|
| `selected-room` | `string` | Room ID of the beacon to highlight. Set externally by `index.ts`. |

### Events Dispatched

| Event | Detail | Description |
|---|---|---|
| `room-select` | `{ roomId: string }` | Fired when user clicks a beacon |

### Visual Specification

- **Background:** `#030712` (slate-950), fills the full component
- **Globe sphere:** `MeshPhongMaterial`, dark navy base (`#050d1a`), fuchsia emissive glow
- **Hex grid overlay:** second sphere (radius +1%) with a canvas-generated repeating hexagonal texture, semi-transparent fuchsia lines
- **Atmosphere:** outermost sphere (radius +4%), fully transparent with a soft fuchsia radial glow at the edge
- **Auto-rotation:** slow continuous Y-axis rotation; mouse drag overrides rotation temporarily

### Beacons

Each room is represented by a beacon at a deterministic position on the globe:

- **Position:** lat/lon derived from a simple hash of the room's `id` (UUID) — same room always appears at the same position across re-renders
- **Pole:** `CylinderGeometry`, radius ~0.5% of globe radius, height = 50% of globe radius
- **Material:** vertex colors — full fuchsia opacity at the base, fully transparent at the tip (gradient fade)
- **Pulse ring:** `RingGeometry` disc at the pole's base; animation loop scales it from 1× to 2.5× and fades opacity from 0.8 to 0 over ~1.5s, then repeats
- **Selected state:** pole brightens (emissive intensity increases), pulse ring turns white

### Interactivity

- Raycasting on pointer events detects beacon clicks
- Clicking a beacon dispatches `room-select` with the room's ID
- Hovering a beacon shows a tooltip with the room name (HTML overlay, not Three.js canvas text)

---

## Component: `<rooms-panel>`

**File:** `apps/frontend/_ui/components/rooms-panel.ts`

### Responsibilities

- Fetch and display all rooms (`GET /api/v1/rooms`)
- Display online user count (`GET /api/v1/lobby/users`)
- Handle room creation (`POST /api/v1/rooms`) inline
- Handle room deletion (`DELETE /api/v1/rooms/:id`) for owned rooms
- Dispatch `rooms-changed` on `document` after any mutation so `<app-globe>` stays in sync
- Collapse/expand via a toggle tab

### Attributes

| Attribute | Type | Description |
|---|---|---|
| `open` | `boolean` | Initial open state. Toggled internally by the user. |

### Public Methods

| Method | Description |
|---|---|
| `selectRoom(id: string)` | Scrolls the room list to the given room and briefly highlights its row. Called by `index.ts` when a beacon is clicked on the globe. |

### Events Dispatched

| Event | Detail | Description |
|---|---|---|
| `room-select` | `{ roomId: string }` | Fired when user clicks a room row |
| `rooms-changed` | — | Dispatched on `document` after create or delete |

### Internal Data

On `connectedCallback`:
1. Calls `getOrCreateSession()` to get `{ id, secret }` — stored privately on the instance
2. Fetches `GET /api/v1/rooms` for the room list
3. Fetches `GET /api/v1/lobby/users` for the online count

### UI Structure

```
┌─[chevron tab]──────────────────┐
│  N rooms · M online             │  ← header (stats)
├─────────────────────────────────┤
│  Room Name          CODE  [🗑]  │  ← row (delete only if owned)
│  Room Name          CODE        │
│  ...                            │
├─────────────────────────────────┤
│  [+ New Room]                   │  ← toggles inline form below
│  ┌──────────────────────────┐  │
│  │ Room name...   [Create]  │  │  ← inline form (hidden by default)
│  │               [Cancel]   │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

- **Toggle tab:** narrow strip on the left edge of the panel; clicking it slides the panel in/out (CSS `transform: translateX`)
- **Room row:** clicking anywhere on the row (except the delete button) dispatches `room-select`
- **Delete button:** only rendered when `room.creatorId === session.id`; calls `DELETE /api/v1/rooms/:id` with `Authorization` and `X-User-Id` headers; on success re-fetches and dispatches `rooms-changed`
- **Create form:** name input (max 64 chars) + "Create" + "Cancel"; on submit calls `POST /api/v1/rooms`, collapses form, re-fetches, dispatches `rooms-changed`

### Styling

- Panel background: `slate-900` with a left border `slate-700`
- Width: `280px` expanded, `0` collapsed (hidden behind toggle tab)
- Toggle tab: always visible, `slate-800` background, fuchsia chevron icon
- Scrollable room list (`overflow-y: auto`) with fixed header and footer

---

## Page Wiring: `index.ts`

Thin coordinator — no rendering logic:

1. Call `getOrCreateSession()` (pre-warms session; panel will also call it)
2. On `room-select` from `<rooms-panel>`: set `selected-room` attribute on `<app-globe>`
3. On `room-select` from `<app-globe>`: scroll `<rooms-panel>` to that room (via a `selectRoom(id)` public method)
4. Show error alert if session init fails

---

## `index.html` Layout

```html
<app-shell>
  <div class="relative size-full">
    <app-globe id="globe" class="absolute inset-0"></app-globe>
    <rooms-panel id="panel" open class="absolute top-0 right-0 h-full"></rooms-panel>
  </div>
</app-shell>
```

---

## Dependencies

- `three` — Three.js (npm, added to `devDependencies`)
- `@types/three` — TypeScript types for Three.js

---

## Sync Contract

`rooms-changed` (custom event, dispatched on `document`) is the sole coupling between `<rooms-panel>` and `<app-globe>`. Neither component imports or references the other. `index.ts` handles the one cross-component interaction: translating a `room-select` from one component into an action on the other.

---

## Out of Scope

- Real-time updates via WebSocket (polling/re-fetch on mutation only)
- Geographic room placement (positions are deterministic from room ID, not real coordinates)
- Joining / entering a room (navigation to `/chat/` is a separate feature)
- Mobile layout optimisation (panel collapses by default on narrow viewports — behaviour only, no special breakpoint logic)
