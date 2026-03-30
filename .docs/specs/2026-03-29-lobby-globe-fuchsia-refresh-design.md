# Lobby Globe Fuchsia Refresh — Design Spec

**Date:** 2026-03-29
**Scope:** Refresh the lobby globe visuals so they resemble a soft atmospheric reference image while staying inside Globby's existing dark/fuchsia theme system.

---

## Overview

The current globe already uses the app's fuchsia theme, but it still reads as a flat neon object. This refresh shifts it toward a deeper, hazier, more atmospheric look: darker core, mistier landmasses, stronger edge glow, and brighter beacons that remain clearly readable over the globe.

This is a visual-only refinement. The room data model, event flow, interaction model, and page layout remain unchanged.

---

## Approach

Add a small set of globe-specific theme tokens in `apps/frontend/_ui/styles/theme.css`, then update the Three.js globe materials in `apps/frontend/_ui/components/globe/` to consume those tokens instead of relying only on the generic surface/foreground colors.

The globe should look closer to the supplied reference image in composition and atmosphere, but it must stay aligned with Globby's existing palette. The resulting look is dark plum-to-fuchsia rather than cyan, and it must not introduce any hexagon grid or geometric overlay.

---

## Theme Tokens

Add globe-specific tokens under `@theme` so the globe can evolve independently without changing the rest of the UI:

- `--color-globe-core`
- `--color-globe-land`
- `--color-globe-land-outline`
- `--color-globe-atmosphere`
- `--color-globe-glow`
- `--color-globe-beacon`

These tokens should derive from the existing slate/fuchsia/pink family already used by the app. They are not a second theme, only a more specific palette slice for the lobby globe.

---

## Globe Component Changes

**Files:** `apps/frontend/_ui/components/globe/index.ts`, `apps/frontend/_ui/components/globe/continents.ts`

### Palette Resolution

The globe component should resolve the new globe tokens first and keep its current fallback behavior for safety. If any globe token is unavailable, the component must still render using sensible fuchsia/slate defaults.

### Visual Specification

- **Background/core:** deeper near-black plum tone instead of the current flatter slate foreground
- **Sphere shading:** globe surface should use a darker base with a subtle emissive lift rather than looking uniformly lit
- **Continents:** keep the existing continent texture approach, but tint the continents with a hazier, softer fuchsia-pink treatment that feels atmospheric instead of solid
- **Outlines:** continent outlines should be present but softer and less graphic than the current sharp neon edge
- **Atmosphere:** increase the sense of edge glow using the outer sphere and scene lighting so the globe feels illuminated from within
- **No hexagons:** do not add any grid, honeycomb, or technical pattern overlay

### Layering

The globe should still render as three main layers:

1. base sphere
2. continent overlay sphere
3. atmosphere shell

The difference is material tuning, opacity, and token usage rather than structural changes to the scene graph.

---

## Beacon Changes

**File:** `apps/frontend/_ui/components/globe/beacons.ts`

Beacons should remain visually separate from the globe and intentionally brighter than the atmospheric shell.

### Visual Specification

- poles and pulse rings should use the dedicated beacon token or a brighter variant of the fuchsia palette
- hover and selected states should remain stronger than the idle state
- the brighter beacon treatment must preserve room discoverability against the darker globe core and stronger outer glow

Beacon geometry and interaction do not need to change unless a small size or opacity adjustment is needed to preserve contrast.

---

## Data Flow

No data-flow changes:

- `GET /api/v1/rooms` still drives beacon creation
- `selected-room` still controls selected state
- `room-select` is still dispatched from the globe
- `rooms-changed` still triggers re-fetching

The refresh changes only how existing state is presented.

---

## Error Handling

Existing resilience remains in place:

- missing theme tokens fall back to baked-in defaults
- room fetch failures still leave the globe visible without beacons
- no new runtime dependencies are introduced

---

## Testing

This change is primarily visual, so verification focuses on regression safety and deterministic behavior:

- ensure the project still type-checks and tests pass for unaffected logic
- verify the globe still mounts, rotates, and renders without rooms
- verify beacons still appear, hover, and select correctly
- verify the new tokens do not break other surfaces that use the shared theme file

Manual review should confirm:

- atmospheric globe reads closer to the reference image
- palette remains fuchsia and theme-consistent
- beacons stay brighter than the globe
- no hexagon overlay appears

---

## Out of Scope

- changing room placement logic
- adding post-processing effects or new rendering libraries
- modifying the rooms panel layout
- reworking the rest of the app theme around the globe
