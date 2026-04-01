# Lobby Globe Zoom Bar Design Spec

**Date:** 2026-04-01
**Scope:** Add an app-styled vertical zoom bar to the lobby globe, pinned to the far left edge of the viewport area and wired into the globe's existing zoom behavior.

---

## Overview

The lobby globe already supports mouse-wheel and pinch zoom, but that capability is not discoverable. This change adds a visible vertical zoom bar that matches the globe's fuchsia-on-dark presentation and gives users an explicit control on the absolute left side of the screen.

The implementation should extend the existing `app-globe` component instead of introducing a separate page-level controller. The new control is an overlay UI that sits above the canvas while the Three.js rendering and camera logic remain inside the component.

---

## Approach

Implement the zoom bar as DOM elements created by `app-globe` during initialization.

This is the preferred approach because it keeps all globe zoom state local to the globe component, reuses the current zoom clamp and camera-distance logic, and avoids cross-component wiring from `index.html` or `index.ts`.

The control should provide three interaction modes:

- top button to zoom in
- bottom button to zoom out
- draggable thumb on a vertical track for direct zoom positioning

Wheel zoom and pinch zoom remain active and should update the thumb position so all zoom inputs stay in sync.

---

## Component Changes

**File:** `apps/frontend/_ui/components/globe/index.ts`

Add a left-edge overlay control inside `app-globe`.

The new UI should:

- be absolutely positioned against the left edge of the component and vertically centered
- sit above the WebGL canvas with its own hit area while leaving the rest of the globe fully draggable
- use the app's existing navigation language so the control feels consistent with `app-nav` rather than introducing a separate glass treatment
- visually reference the provided design with a slim track and diamond-like thumb, adapted to the app's current visual language rather than copied literally

The component should continue to treat `cameraDistance` as the single source of truth for zoom.

Add helper logic so the component can:

- convert the current camera distance into a normalized zoom progress value
- convert track pointer position back into a camera distance inside the existing min and max limits
- update the thumb position whenever zoom changes through buttons, wheel, pinch, or drag

Use incremental button zoom steps rather than adding a second zoom model. The button handlers should call the same camera-distance update path already used by wheel and pinch input.

---

## Layout And Styling

The bar should remain visually anchored to the screen's left edge inside the globe area, including on mobile.

Styling expectations:

- compact vertical rail with top and bottom icon buttons
- thin central track with a brighter active thumb
- solid pill container and hover states aligned with `apps/frontend/_ui/components/nav.ts`
- comfortable touch targets without making the control feel bulky
- sufficient contrast against both the dark background and the brighter globe halo

The overlay should use Tailwind utility classes defined through named constants inside the component so layout and visual values are not scattered as magic strings.

---

## Data Flow

No backend or page-level data flow changes are required.

The zoom bar is purely local UI inside `app-globe`:

- `cameraDistance` remains internal component state
- `setCameraDistance()` remains the canonical zoom update path
- wheel, pinch, buttons, and track drag all feed the same update path
- the control does not emit new public events and does not require persistence

---

## Error Handling

The control should fail safely:

- if the overlay elements are unavailable, the globe should still render and existing wheel/pinch zoom should continue to work
- drag interactions should release cleanly on pointer up or cancel
- zoom input must always stay clamped to the existing minimum and maximum camera distances
- the overlay must not leave the globe stuck in a dragging state after interrupted pointer sequences

Prevent the control's pointer handling from accidentally rotating the globe when the user is interacting with the zoom bar.

---

## Testing

Verification should include:

- frontend build passes with the updated component
- zoom in and zoom out buttons move the camera within the existing limits
- dragging the thumb or track updates zoom smoothly and clamps correctly at both ends
- wheel zoom and pinch zoom continue to work and keep the thumb synchronized
- the control stays pinned to the left edge on desktop and mobile-sized layouts
- the overlay remains above the canvas and does not block globe interaction outside its own bounds
- the control visually matches the app nav language and does not use blur or glass effects

---

## Out Of Scope

- moving zoom state outside `app-globe`
- changing room fetching, beacon behavior, or page layout structure
- replacing existing wheel or pinch zoom behavior
- adding new global CSS architecture just for this control
