# Lobby Globe Zoom And Clarity Refresh — Design Spec

**Date:** 2026-03-30
**Scope:** Make the lobby globe feel larger, support wheel and pinch zoom, remove the separate atmosphere shell, and improve visual clarity with a sharper fuchsia-first render aligned to the app theme.

---

## Overview

The current globe reads smaller and softer than intended. Its camera framing and semi-transparent materials make the sphere feel hazy rather than solid and luminous.

This change keeps the existing globe component architecture and room beacon behavior, but improves how the globe is framed and rendered. The end result should feel closer to a real interactive globe: larger by default, user-zoomable, darker at the core, brighter at the rim, visually crisper overall, and better aligned with the app's fuchsia-led visual language.

---

## Approach

Upgrade the existing implementation in place rather than rebuilding the rendering stack.

The work should combine three focused improvements:

- interaction upgrades so the globe can be zoomed with mouse wheel and touch pinch gestures while preserving drag rotation
- rendering upgrades so the globe uses a sharper, app-aligned fuchsia-first visual treatment and higher-resolution continent rendering
- cleanup of the separate atmosphere shell layer, which is intentionally removed because the globe reads cleaner without that extra haze layer

The approved direction explicitly excludes a hex overlay. The visual target is a dark core, bright rim lighting, and clearer continent separation, without introducing new decorative geometry or a standalone atmosphere mesh.

---

## Theme Token Changes

**File:** `apps/frontend/_ui/styles/theme.css`

Update the existing globe-specific tokens so they stay in the app's established fuchsia family while preserving the current contrast hierarchy:

- `--color-globe-core` should stay very dark, with a subtle fuchsia cast instead of the colder cyan pass
- `--color-globe-land` should stay bright and readable, but shift to a pale fuchsia fill
- `--color-globe-land-outline` should remain brighter than the fill so coastlines stay crisp
- `--color-globe-atmosphere` and `--color-globe-glow` should provide the main halo and rim-light effect, but now in a fuchsia-first range
- `--color-globe-beacon` should remain readable over the brighter globe and can stay close to a pale fuchsia-white

These token changes should stay within the app's existing Tailwind color system and should not introduce one-off hardcoded colors outside the normal globe fallbacks already used by the component. The token name `--color-globe-atmosphere` remains valid as a lighting and halo color even though the separate atmosphere shell geometry is removed.

---

## Globe Component Changes

**File:** `apps/frontend/_ui/components/globe/index.ts`

### Framing And Zoom

The globe should appear larger at rest by increasing the effective on-screen size through a closer camera position and, if still needed, a modest radius increase. The starting view should feel intentionally zoomed in while still leaving enough room for halo glow and beacon visibility.

Add interactive zoom with these behaviors:

- mouse wheel zoom on desktop
- pinch zoom on touch devices
- clamp the zoom range so users cannot zoom so far out that the globe feels tiny or so far in that beacon interaction becomes awkward
- preserve the current drag-to-rotate behavior and idle auto-rotation when not interacting

Zoom implementation should remain local to the component and should not require external control libraries.

### Rendering And Clarity

Tune the scene so the globe reads as sharper and less opaque:

- reduce the muddy, translucent look of the globe body by increasing definition in the dark core and limiting excessive haze
- remove the separate atmosphere shell mesh entirely because it looks better without that extra translucent layer
- preserve a bright, dimensional silhouette through background halo, lighting, and inner glow rather than through an extra atmospheric shell
- keep the background halo centered on the globe, but make it cleaner and less foggy than the current look
- keep beacon readability above the globe body so interactive points remain the clearest active element

The base sphere, inner glow, and continent overlay structure can stay in place. This is a tuning pass on the existing layers, not a new rendering pipeline.

---

## Continent Texture Changes

**File:** `apps/frontend/_ui/components/globe/continents.ts`

Retain the existing polygon data and texture-generation approach, but increase the texture resolution so continent edges render more cleanly on a larger, closer globe.

The texture output should support these visual goals:

- crisper coastlines and continent edges
- less blurry fill at the larger default zoom level
- controlled glow around landmasses without washing them into the atmosphere

No hex pattern, grid layer, or additional decorative overlay should be added.

---

## Beacons

**Files:** `apps/frontend/_ui/components/globe/index.ts`, `apps/frontend/_ui/components/globe/beacons.ts`

Beacon behavior remains functionally unchanged:

- room positions are still derived from room IDs
- hover and selected animations still work as they do today
- clicking a beacon still dispatches `room-select`
- `selected-room` still controls selected state

If the new zoom defaults or brighter globe treatment reduce beacon readability, only minimal tuning is allowed. Acceptable changes include small scale, opacity, or brightness adjustments that preserve the current interaction model.

---

## Data Flow

No data-flow or API changes are required.

The component should continue to:

- fetch rooms from `GET /api/v1/rooms`
- rebuild beacon visuals from the returned room list
- react to `rooms-changed`
- emit `room-select` for panel synchronization

Zoom state is purely local UI state inside `app-globe` and should not be persisted or exposed as a public API.

---

## Error Handling

Existing resilience should remain intact:

- the globe still renders with fallback colors if theme token resolution fails
- room fetch failures still leave the globe visible without beacons
- pointer interactions should fail safely if pinch or wheel input is unavailable or interrupted
- removing the atmosphere shell must not leave behind dead code paths or render-order assumptions

Zoom input handling should avoid leaving the globe in a broken interaction state when a pointer sequence ends unexpectedly.

---

## Testing

Verification should cover both rendering safety and interaction behavior:

- run the relevant frontend build or project build to ensure the updated component compiles cleanly
- run the relevant test suite if available for frontend regressions
- manually confirm the globe renders larger by default
- manually confirm wheel zoom works on desktop and pinch zoom works on touch-capable devices or emulation
- manually confirm drag rotation still works smoothly after zoom changes
- manually confirm the globe appears sharper and less opaque than before
- manually confirm the fuchsia-first palette matches the app's established visual language without losing contrast
- manually confirm the removed atmosphere shell does not make the globe feel flat or dim
- manually confirm beacon hover, tooltip, click, and selected states still work at different zoom levels

---

## Out Of Scope

- replacing the current globe component with a new control system or rendering library
- adding post-processing, bloom passes, or shader-heavy effects
- adding a hex pattern or any other new decorative overlay
- changing room-fetching behavior, room placement logic, or page layout
