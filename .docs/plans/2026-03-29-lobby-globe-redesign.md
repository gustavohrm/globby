# Lobby Globe Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-only lobby with a fullscreen interactive sci-fi globe showing rooms as fuchsia beacon poles, plus a collapsible side panel for browsing, creating, and deleting rooms.

**Architecture:** Two new Web Components — `<app-globe>` (Three.js, self-fetches rooms, renders beacons) and `<rooms-panel>` (fetches rooms + online count, handles all CRUD) — wired together by a thin `index.ts` coordinator via custom events. Sync between components uses a `rooms-changed` event dispatched on `document`.

**Tech Stack:** Three.js, Vanilla TypeScript, Web Components, TailwindCSS v4, Vite, Cloudflare Workers backend (already has all needed API endpoints).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/frontend/_ui/components/globe.ts` | `<app-globe>` — Three.js globe, beacons, drag, raycasting |
| Create | `apps/frontend/_ui/components/rooms-panel.ts` | `<rooms-panel>` — room list, create, delete, stats |
| Modify | `apps/frontend/_ui/components/index.ts` | Register both new components |
| Modify | `apps/frontend/index.html` | Fullscreen globe + overlay panel layout |
| Modify | `apps/frontend/index.ts` | Thin coordinator — session pre-warm + cross-component wiring |
| Modify | `package.json` | Add `three` dependency |

---

## Task 1: Install Three.js

**Files:**
- Modify: `package.json`

- [ ] **Install Three.js**

```bash
npm install three
```

- [ ] **Verify `package.json` now contains `three` in `dependencies`**

```bash
grep '"three"' package.json
```

Expected output: `"three": "^0.x.x"` (exact version will vary)

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add three.js dependency"
```

---

## Task 2: Create `<app-globe>` component

**Files:**
- Create: `apps/frontend/_ui/components/globe.ts`

- [ ] **Create `apps/frontend/_ui/components/globe.ts` with the full content below**

```typescript
import * as THREE from "three";

type Room = { id: string; code: string; name: string; creatorId: string; createdAt: string };

const GLOBE_RADIUS = 1.5;
const BEACON_HEIGHT = GLOBE_RADIUS * 0.5;

function hashRoomId(id: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = (Math.imul(h1 ^ c, 0x01000193) >>> 0);
    h2 = (Math.imul(h2 ^ c, 0x01000193) >>> 0);
  }
  const lat = ((h1 % 140) - 70) * (Math.PI / 180);
  const lon = ((h2 % 360) - 180) * (Math.PI / 180);
  return [lat, lon];
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.cos(lon),
  );
}

type BeaconEntry = { pole: THREE.Mesh; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; t: number };

class AppGlobe extends HTMLElement {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private globeGroup = new THREE.Group();
  private beaconGroup = new THREE.Group();
  private beacons = new Map<string, BeaconEntry>();
  private rafId = 0;
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private prevMouse = { x: 0, y: 0 };
  private tooltipEl!: HTMLDivElement;
  private onRoomsChanged = () => void this.fetchAndRender();

  static get observedAttributes() {
    return ["selected-room"];
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === "selected-room") this.highlightBeacon(value ?? "");
  }

  connectedCallback() {
    this.style.cssText = "display:block;position:relative;overflow:hidden;";
    this.initRenderer();
    this.buildScene();
    this.setupPointerEvents();
    document.addEventListener("rooms-changed", this.onRoomsChanged);
    window.addEventListener("resize", this.onResize);
    void this.fetchAndRender();
    this.rafId = requestAnimationFrame(this.animate);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("rooms-changed", this.onRoomsChanged);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }

  private onResize = () => {
    const w = this.offsetWidth || window.innerWidth;
    const h = this.offsetHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  };

  private initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x030712);
    this.onResize();
    this.renderer.domElement.style.display = "block";
    this.appendChild(this.renderer.domElement);

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.style.cssText =
      "position:absolute;pointer-events:none;background:rgba(15,23,42,0.9);border:1px solid rgba(192,38,211,0.5);color:#e2e8f0;font-size:12px;padding:4px 10px;border-radius:4px;display:none;white-space:nowrap;z-index:10;";
    this.appendChild(this.tooltipEl);
  }

  private buildScene() {
    this.scene = new THREE.Scene();
    const w = this.offsetWidth || window.innerWidth;
    const h = this.offsetHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.z = 4.5;

    this.scene.add(new THREE.AmbientLight(0x1a1a2e, 3));
    const dir = new THREE.DirectionalLight(0xc026d3, 2.5);
    dir.position.set(5, 3, 5);
    this.scene.add(dir);

    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x050d1a,
      emissive: 0x2d0040,
      emissiveIntensity: 0.5,
      shininess: 60,
    });
    this.globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64), globeMat));

    const hexMat = new THREE.MeshBasicMaterial({
      map: this.buildHexTexture(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.002, 64, 64), hexMat));

    const atmMat = new THREE.MeshPhongMaterial({
      color: 0xc026d3,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 64, 64), atmMat));

    this.globeGroup.add(this.beaconGroup);
    this.scene.add(this.globeGroup);
  }

  private buildHexTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "rgba(192,38,211,0.5)";
    ctx.lineWidth = 0.8;
    const r = 22;
    const cw = r * Math.sqrt(3);
    const ch = r * 2;
    for (let row = -1; row <= size / (ch * 0.75) + 1; row++) {
      for (let col = -1; col <= size / cw + 1; col++) {
        const cx = col * cw + (row % 2 ? cw / 2 : 0);
        const cy = row * ch * 0.75;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  private buildPoleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, "rgba(192,38,211,1)");
    g.addColorStop(0.5, "rgba(192,38,211,0.5)");
    g.addColorStop(1, "rgba(192,38,211,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
    return new THREE.CanvasTexture(canvas);
  }

  private async fetchAndRender() {
    try {
      const res = await fetch("/api/v1/rooms");
      if (!res.ok) return;
      const { rooms } = (await res.json()) as { rooms: Room[] };
      this.buildBeacons(rooms);
    } catch {
      // ignore — globe still renders without beacons
    }
  }

  private buildBeacons(rooms: Room[]) {
    this.beaconGroup.clear();
    this.beacons.clear();
    const poleTex = this.buildPoleTexture();

    for (const room of rooms) {
      const [lat, lon] = hashRoomId(room.id);
      const dir = latLonToVec3(lat, lon, 1).normalize();

      const poleGeo = new THREE.CylinderGeometry(0.006, 0.014, BEACON_HEIGHT, 6, 1, true);
      const poleMat = new THREE.MeshBasicMaterial({
        map: poleTex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(dir.clone().multiplyScalar(GLOBE_RADIUS + BEACON_HEIGHT / 2));
      pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      pole.userData = { roomId: room.id, roomName: room.name };
      this.beaconGroup.add(pole);

      const ringGeo = new THREE.RingGeometry(0.025, 0.055, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc026d3,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(dir.clone().multiplyScalar(GLOBE_RADIUS + 0.005));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      this.beaconGroup.add(ring);

      this.beacons.set(room.id, { pole, ring, ringMat, t: Math.random() });
    }
  }

  private highlightBeacon(roomId: string) {
    for (const [id, { pole }] of this.beacons) {
      pole.scale.setScalar(id === roomId ? 1.6 : 1);
    }
  }

  private setupPointerEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("pointerdown", (e) => {
      this.isDragging = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.prevMouse = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;
        this.globeGroup.rotation.y += dx * 0.005;
        this.globeGroup.rotation.x += dy * 0.003;
        this.globeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, this.globeGroup.rotation.x));
        this.prevMouse = { x: e.clientX, y: e.clientY };
        this.tooltipEl.style.display = "none";
      } else {
        this.checkHover(e);
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (moved < 4) this.checkClick(e);
    });

    canvas.addEventListener("pointerleave", () => {
      this.isDragging = false;
      this.tooltipEl.style.display = "none";
    });
  }

  private getRay(e: PointerEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    return ray;
  }

  private checkHover(e: PointerEvent) {
    const poles = Array.from(this.beacons.values()).map((b) => b.pole);
    const hits = this.getRay(e).intersectObjects(poles);
    if (hits.length > 0) {
      const { roomName } = hits[0].object.userData as { roomName: string };
      this.tooltipEl.textContent = roomName;
      this.tooltipEl.style.display = "block";
      this.tooltipEl.style.left = `${e.offsetX + 14}px`;
      this.tooltipEl.style.top = `${e.offsetY - 10}px`;
    } else {
      this.tooltipEl.style.display = "none";
    }
  }

  private checkClick(e: PointerEvent) {
    const poles = Array.from(this.beacons.values()).map((b) => b.pole);
    const hits = this.getRay(e).intersectObjects(poles);
    if (hits.length > 0) {
      const { roomId } = hits[0].object.userData as { roomId: string };
      this.dispatchEvent(new CustomEvent("room-select", { bubbles: true, detail: { roomId } }));
    }
  }

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate);
    if (!this.isDragging) {
      this.globeGroup.rotation.y += 0.001;
    }
    for (const entry of this.beacons.values()) {
      entry.t = (entry.t + 0.008) % 1;
      entry.ring.scale.setScalar(1 + entry.t * 2);
      entry.ringMat.opacity = (1 - entry.t) * 0.75;
    }
    this.renderer.render(this.scene, this.camera);
  };
}

customElements.define("app-globe", AppGlobe);
```

- [ ] **Commit**

```bash
git add apps/frontend/_ui/components/globe.ts
git commit -m "feat: add app-globe Three.js web component"
```

---

## Task 3: Create `<rooms-panel>` component

**Files:**
- Create: `apps/frontend/_ui/components/rooms-panel.ts`

- [ ] **Create `apps/frontend/_ui/components/rooms-panel.ts` with the full content below**

```typescript
import { getOrCreateSession, type Session } from "../../_core/services/session";

type Room = { id: string; code: string; name: string; creatorId: string; createdAt: string };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class RoomsPanel extends HTMLElement {
  private session: Session | null = null;
  private rooms: Room[] = [];
  private onlineCount = 0;
  private isOpen = true;
  private showForm = false;

  connectedCallback() {
    this.isOpen = this.hasAttribute("open");
    this.style.cssText = "display:flex;align-items:stretch;pointer-events:none;";
    this.render();
    void this.init();
  }

  private async init() {
    try {
      this.session = await getOrCreateSession();
    } catch {
      // continue without session — create/delete won't work
    }
    await this.fetchData();
  }

  private async fetchData() {
    try {
      const [roomsRes, usersRes] = await Promise.all([
        fetch("/api/v1/rooms"),
        fetch("/api/v1/lobby/users"),
      ]);
      if (roomsRes.ok) {
        const { rooms } = (await roomsRes.json()) as { rooms: Room[] };
        this.rooms = rooms;
      }
      if (usersRes.ok) {
        const { users } = (await usersRes.json()) as { users: unknown[] };
        this.onlineCount = users.length;
      }
    } catch {
      // ignore — stale data shown
    }
    this.render();
  }

  /** Called by index.ts when a beacon is clicked on the globe. */
  selectRoom(id: string) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.render();
    }
    requestAnimationFrame(() => {
      const el = this.querySelector(`[data-room-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.classList.add("ring-2", "ring-fuchsia-500");
      setTimeout(() => el.classList.remove("ring-2", "ring-fuchsia-500"), 1500);
    });
  }

  private render() {
    const inputVal = (this.querySelector(".room-name-input") as HTMLInputElement | null)?.value ?? "";
    const chevron = this.isOpen ? "›" : "‹";

    this.innerHTML = `
      <button class="panel-toggle pointer-events-auto flex items-center justify-center w-6 self-stretch bg-slate-800 border-l border-t border-b border-slate-700 rounded-l-lg cursor-pointer hover:bg-slate-700 transition-colors z-10">
        <span class="text-fuchsia-400 font-bold text-sm select-none">${chevron}</span>
      </button>
      <div class="pointer-events-auto flex flex-col bg-slate-900 border-l border-slate-700 overflow-hidden transition-all duration-300 ${this.isOpen ? "w-72" : "w-0"}">
        <div class="px-4 py-3 border-b border-slate-700 shrink-0">
          <p class="text-xs text-slate-400">${this.rooms.length} rooms · ${this.onlineCount} online</p>
        </div>
        <ul class="flex-1 overflow-y-auto divide-y divide-slate-800">
          ${
            this.rooms.length === 0
              ? '<li class="px-4 py-6 text-sm text-slate-500 text-center">No rooms yet</li>'
              : this.rooms
                  .map(
                    (r) => `
            <li data-room-id="${esc(r.id)}" class="flex items-center gap-2 px-4 py-3 hover:bg-slate-800 cursor-pointer group transition-colors">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-100 truncate">${esc(r.name)}</p>
                <p class="text-xs text-slate-500 font-mono">${esc(r.code)}</p>
              </div>
              ${
                this.session && r.creatorId === this.session.id
                  ? `<button data-delete="${esc(r.id)}" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1 shrink-0" title="Delete room">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>`
                  : ""
              }
            </li>`,
                  )
                  .join("")
          }
        </ul>
        <div class="px-4 py-3 border-t border-slate-700 shrink-0">
          ${
            this.showForm
              ? `<form class="create-form flex flex-col gap-2">
                  <input class="room-name-input w-full bg-slate-800 border border-slate-600 focus:border-fuchsia-500 text-slate-100 text-sm rounded-lg px-3 py-2 outline-none" placeholder="Room name" maxlength="64" value="${esc(inputVal)}" />
                  <div class="flex gap-2">
                    <button type="submit" class="flex-1 bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm rounded-lg py-1.5 transition-colors">Create</button>
                    <button type="button" class="cancel-btn flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg py-1.5 transition-colors">Cancel</button>
                  </div>
                </form>`
              : `<button class="new-room-btn w-full text-sm text-fuchsia-400 hover:text-fuchsia-300 border border-fuchsia-800 hover:border-fuchsia-600 rounded-lg py-2 transition-colors">+ New Room</button>`
          }
        </div>
      </div>
    `;

    this.bindEvents();

    if (this.showForm) {
      (this.querySelector(".room-name-input") as HTMLInputElement | null)?.focus();
    }
  }

  private bindEvents() {
    this.querySelector(".panel-toggle")!.addEventListener("click", () => {
      this.isOpen = !this.isOpen;
      this.render();
    });

    this.querySelectorAll("[data-room-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("[data-delete]")) return;
        const roomId = (el as HTMLElement).dataset.roomId!;
        this.dispatchEvent(new CustomEvent("room-select", { bubbles: true, detail: { roomId } }));
      });
    });

    this.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.deleteRoom((btn as HTMLElement).dataset.delete!);
      });
    });

    this.querySelector(".new-room-btn")?.addEventListener("click", () => {
      this.showForm = true;
      this.render();
    });

    this.querySelector(".create-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (this.querySelector(".room-name-input") as HTMLInputElement).value.trim();
      if (name) await this.createRoom(name);
    });

    this.querySelector(".cancel-btn")?.addEventListener("click", () => {
      this.showForm = false;
      this.render();
    });
  }

  private async createRoom(name: string) {
    if (!this.session) return;
    try {
      const res = await fetch("/api/v1/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.session.secret}` },
        body: JSON.stringify({ name, creatorId: this.session.id }),
      });
      if (!res.ok) return;
      this.showForm = false;
      await this.fetchData();
      document.dispatchEvent(new CustomEvent("rooms-changed"));
    } catch {
      // ignore
    }
  }

  private async deleteRoom(roomId: string) {
    if (!this.session) return;
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.session.secret}`, "X-User-Id": this.session.id },
      });
      if (!res.ok) return;
      await this.fetchData();
      document.dispatchEvent(new CustomEvent("rooms-changed"));
    } catch {
      // ignore
    }
  }
}

customElements.define("rooms-panel", RoomsPanel);
```

- [ ] **Commit**

```bash
git add apps/frontend/_ui/components/rooms-panel.ts
git commit -m "feat: add rooms-panel web component"
```

---

## Task 4: Register new components

**Files:**
- Modify: `apps/frontend/_ui/components/index.ts`

- [ ] **Replace the full content of `apps/frontend/_ui/components/index.ts`**

```typescript
import "./globe";
import "./input";
import "./nav";
import "./rooms-panel";
import "./shell";
import "./toggle";
```

- [ ] **Commit**

```bash
git add apps/frontend/_ui/components/index.ts
git commit -m "feat: register app-globe and rooms-panel components"
```

---

## Task 5: Rewrite `index.html`

**Files:**
- Modify: `apps/frontend/index.html`

- [ ] **Replace the full content of `apps/frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Globby</title>
    <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="stylesheet" href="./_ui/styles/index.css" />
    <script type="module" src="./_ui/components/index.ts"></script>
    <script type="module" src="./_ui/scripts/index.ts"></script>
    <script type="module" src="./index.ts"></script>
  </head>
  <body>
    <app-shell>
      <div class="relative size-full overflow-hidden">
        <app-globe id="globe" class="absolute inset-0"></app-globe>
        <rooms-panel id="panel" open class="absolute top-0 right-0 h-full z-10"></rooms-panel>
      </div>
    </app-shell>
  </body>
</html>
```

- [ ] **Commit**

```bash
git add apps/frontend/index.html
git commit -m "feat: redesign lobby layout with fullscreen globe and side panel"
```

---

## Task 6: Rewrite `index.ts` coordinator

**Files:**
- Modify: `apps/frontend/index.ts`

- [ ] **Replace the full content of `apps/frontend/index.ts`**

```typescript
import { getOrCreateSession } from "./_core/services/session";

interface PanelElement extends HTMLElement {
  selectRoom(id: string): void;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Pre-warm session so the panel's own getOrCreateSession call returns instantly.
  // Errors are swallowed here — the panel handles its own session failure gracefully.
  try {
    await getOrCreateSession();
  } catch {
    // ignore
  }

  const globe = document.getElementById("globe");
  const panel = document.getElementById("panel") as PanelElement | null;
  if (!globe || !panel) return;

  // Beacon clicked on globe → highlight matching row in panel
  globe.addEventListener("room-select", (e) => {
    const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
    globe.setAttribute("selected-room", roomId);
    panel.selectRoom(roomId);
  });

  // Row clicked in panel → highlight matching beacon on globe
  panel.addEventListener("room-select", (e) => {
    const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
    globe.setAttribute("selected-room", roomId);
  });
});
```

- [ ] **Commit**

```bash
git add apps/frontend/index.ts
git commit -m "feat: wire globe and rooms-panel in lobby coordinator"
```

---

## Task 7: Smoke test

- [ ] **Run the linter to check formatting**

```bash
npm run lint:check
```

If it reports issues, fix them with:

```bash
npm run lint:fix
```

- [ ] **Run the backend tests to confirm nothing is broken**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Start the full-stack local dev server**

```bash
npm run preview:local
```

- [ ] **Open `http://localhost:8787` and verify**

1. The dark globe with a fuchsia hex grid fills the screen and auto-rotates
2. The rooms panel is visible on the right with a collapse tab
3. Clicking the collapse tab slides the panel in/out
4. Creating a room via "New Room" → enter a name → Create: the room appears in the list and a beacon appears on the globe
5. Hovering a beacon shows a tooltip with the room name
6. Clicking a beacon highlights its pole and scrolls the panel to that room
7. The delete icon appears on hover for your own rooms; clicking it removes the room and its beacon

- [ ] **If lint had fixes, commit them**

```bash
git add -A
git commit -m "style: lint fixes for lobby redesign"
```
