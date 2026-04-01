import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  CanvasTexture,
  Color,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { buildContinentTexture } from "./continents";
import { animateBeacons, createBeacons, type Room, type BeaconEntry } from "./beacons";

const GLOBE_RADIUS = 1.5;
const SPHERE_SEGMENTS = 96;
const CAMERA_DEFAULT_DISTANCE = 3.7;
const CAMERA_MIN_DISTANCE = 2.85;
const CAMERA_MAX_DISTANCE = 5.15;
const WHEEL_ZOOM_SENSITIVITY = 0.0024;
const PINCH_ZOOM_SENSITIVITY = 0.006;
const BUTTON_ZOOM_STEP = 0.22;
const DEFAULT_ZOOM_THUMB_SIZE = 20;
const ZOOM_CONTROL_ROOT_CLASSES =
  "pointer-events-none absolute left-0 top-1/2 z-10 flex w-14 -translate-y-1/2 justify-start pl-4";
const ZOOM_CONTROL_RAIL_CLASSES = "pointer-events-auto flex flex-col items-center gap-3 rounded-full bg-foreground p-2";
const ZOOM_BUTTON_BASE_CLASSES =
  "flex size-10 p-2 items-center justify-center rounded-full transition-colors duration-400";
const ZOOM_BUTTON_ENABLED_CLASSES = "cursor-pointer text-text-secondary hover:bg-surface hover:text-primary";
const ZOOM_BUTTON_DISABLED_CLASSES = "cursor-default text-text-secondary opacity-40";
const ZOOM_TRACK_CLASSES = "relative flex h-44 w-10 cursor-ns-resize items-center justify-center touch-none";
const ZOOM_TRACK_LINE_CLASSES = "absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-surface";
const ZOOM_THUMB_CLASSES =
  "absolute left-1/2 size-5 -translate-x-1/2 rotate-45 rounded-sm border border-border bg-primary";
const FALLBACK_COLORS = {
  core: "#0d0613",
  land: "#f3b6fb",
  landOutline: "#fff2fe",
  atmosphere: "#f0a5ff",
  glow: "#e86bf8",
  beacon: "#fff6ff",
  text: "#f8fafc",
};

type GlobePalette = {
  coreCss: string;
  landCss: string;
  landOutlineCss: string;
  atmosphereCss: string;
  glowCss: string;
  beaconCss: string;
  textCss: string;
  core: Color;
  atmosphere: Color;
  glow: Color;
  beacon: Color;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getZoomButtonIcon(type: "in" | "out"): string {
  const symbol = type === "in" ? '<path d="M12 8v8" /><path d="M8 12h8" />' : '<path d="M8 12h8" />';

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.75 21.25 12 12 21.25 2.75 12 12 2.75Z" />${symbol}</svg>`;
}

function toRgba(color: Color, alpha: number): string {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

class AppGlobe extends HTMLElement {
  private renderer!: WebGLRenderer;
  private canvas: HTMLCanvasElement | null = null;
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private globeGroup = new Group();
  private beaconGroup = new Group();
  private beacons = new Map<string, BeaconEntry>();
  private poleTex: CanvasTexture | null = null;
  private continentTex: CanvasTexture | null = null;
  private rafId = 0;
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private prevMouse = { x: 0, y: 0 };
  private tooltipEl!: HTMLDivElement;
  private onRoomsChanged = () => void this.fetchAndRender();
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private palette!: GlobePalette;
  private selectedRoomId = "";
  private hoveredRoomId = "";
  private cameraDistance = CAMERA_DEFAULT_DISTANCE;
  private pinchDistance = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private zoomTrackEl: HTMLDivElement | null = null;
  private zoomThumbEl: HTMLDivElement | null = null;
  private zoomInButton: HTMLButtonElement | null = null;
  private zoomOutButton: HTMLButtonElement | null = null;
  private zoomTrackPointerId: number | null = null;

  static get observedAttributes() {
    return ["selected-room"];
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === "selected-room") {
      this.selectedRoomId = value ?? "";
      this.syncBeaconStates();
    }
  }

  connectedCallback() {
    this.innerHTML = "";
    this.palette = this.resolvePalette();
    this.style.cssText = [
      "display:block",
      "overflow:hidden",
      "position:relative",
      `background:
        radial-gradient(circle at 50% 46%, ${toRgba(this.palette.beacon, 0.18)} 0%, ${toRgba(this.palette.glow, 0.22)} 14%, ${toRgba(this.palette.atmosphere, 0.14)} 28%, rgba(0, 0, 0, 0) 56%),
        radial-gradient(circle at 50% 60%, ${toRgba(this.palette.glow, 0.12)} 0%, rgba(0, 0, 0, 0) 60%),
        linear-gradient(180deg, ${toRgba(this.palette.core, 0.98)} 0%, ${this.palette.coreCss} 100%)`,
    ].join(";");
    this.initRenderer();
    this.buildScene();
    this.createZoomControls();
    this.setupPointerEvents();
    document.addEventListener("rooms-changed", this.onRoomsChanged);
    window.addEventListener("resize", this.onResize);
    void this.fetchAndRender();
    this.rafId = requestAnimationFrame(this.tick);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("rooms-changed", this.onRoomsChanged);
    window.removeEventListener("resize", this.onResize);
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas = null;
    }
    if (this.zoomInButton) {
      this.zoomInButton.removeEventListener("click", this.onZoomInClick);
      this.zoomInButton = null;
    }
    if (this.zoomOutButton) {
      this.zoomOutButton.removeEventListener("click", this.onZoomOutClick);
      this.zoomOutButton = null;
    }
    if (this.zoomTrackEl) {
      this.zoomTrackEl.removeEventListener("pointerdown", this.onZoomTrackPointerDown);
      this.zoomTrackEl.removeEventListener("pointermove", this.onZoomTrackPointerMove);
      this.zoomTrackEl.removeEventListener("pointerup", this.onZoomTrackPointerUp);
      this.zoomTrackEl.removeEventListener("pointercancel", this.onZoomTrackPointerCancel);
      this.zoomTrackEl = null;
    }
    this.zoomThumbEl = null;
    this.zoomTrackPointerId = null;
    this.disposeScene();
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
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setClearColor(this.palette.core, 0);
    this.onResize();
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.position = "relative";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.cursor = "grab";
    this.renderer.domElement.style.touchAction = "none";
    this.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.style.cssText = `position:absolute;pointer-events:none;background:${toRgba(this.palette.core, 0.92)};border:1px solid ${toRgba(this.palette.beacon, 0.55)};box-shadow:0 0 22px ${toRgba(this.palette.glow, 0.18)};color:${this.palette.textCss};font-size:12px;padding:4px 10px;border-radius:999px;display:none;white-space:nowrap;z-index:10;backdrop-filter:blur(10px);`;
    this.appendChild(this.tooltipEl);
  }

  private createZoomControls() {
    const control = document.createElement("div");
    control.className = ZOOM_CONTROL_ROOT_CLASSES;

    const rail = document.createElement("div");
    rail.className = ZOOM_CONTROL_RAIL_CLASSES;

    const zoomInButton = this.createZoomButton("in", "Zoom in");
    const zoomOutButton = this.createZoomButton("out", "Zoom out");

    const track = document.createElement("div");
    track.className = ZOOM_TRACK_CLASSES;
    track.setAttribute("aria-hidden", "true");

    const trackLine = document.createElement("div");
    trackLine.className = ZOOM_TRACK_LINE_CLASSES;

    const thumb = document.createElement("div");
    thumb.className = ZOOM_THUMB_CLASSES;
    thumb.style.top = "0px";

    track.append(trackLine, thumb);
    rail.append(zoomInButton, track, zoomOutButton);
    control.appendChild(rail);
    this.appendChild(control);

    this.zoomTrackEl = track;
    this.zoomThumbEl = thumb;
    this.zoomInButton = zoomInButton;
    this.zoomOutButton = zoomOutButton;

    zoomInButton.addEventListener("click", this.onZoomInClick);
    zoomOutButton.addEventListener("click", this.onZoomOutClick);
    track.addEventListener("pointerdown", this.onZoomTrackPointerDown);
    track.addEventListener("pointermove", this.onZoomTrackPointerMove);
    track.addEventListener("pointerup", this.onZoomTrackPointerUp);
    track.addEventListener("pointercancel", this.onZoomTrackPointerCancel);

    this.syncZoomControls();
  }

  private createZoomButton(type: "in" | "out", label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.className = `${ZOOM_BUTTON_BASE_CLASSES} ${ZOOM_BUTTON_ENABLED_CLASSES}`;
    button.innerHTML = getZoomButtonIcon(type);
    return button;
  }

  private buildScene() {
    this.scene = new Scene();
    const w = this.offsetWidth || window.innerWidth;
    const h = this.offsetHeight || window.innerHeight;
    this.camera = new PerspectiveCamera(38, w / h, 0.1, 100);
    this.setCameraDistance(CAMERA_DEFAULT_DISTANCE);

    this.scene.add(new AmbientLight(this.palette.atmosphere.clone(), 1.55));
    const skyLight = new HemisphereLight(this.palette.beacon.clone(), this.palette.core.clone(), 1.35);
    this.scene.add(skyLight);
    const keyLight = new PointLight(this.palette.glow, 8.5, 14, 2);
    keyLight.position.set(3.1, 2.3, 4.2);
    this.scene.add(keyLight);
    const fillLight = new PointLight(this.palette.atmosphere, 5.4, 12, 2);
    fillLight.position.set(-2.6, -1.1, 3.7);
    this.scene.add(fillLight);

    const innerGlowMat = new MeshBasicMaterial({
      color: this.palette.glow.clone().lerp(this.palette.beacon, 0.22),
      transparent: true,
      opacity: 0.22,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const innerGlow = new Mesh(
      new SphereGeometry(GLOBE_RADIUS * 0.968, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      innerGlowMat,
    );
    innerGlow.renderOrder = 0;
    this.globeGroup.add(innerGlow);

    const globeMat = new MeshLambertMaterial({
      color: this.palette.core.clone().lerp(this.palette.atmosphere, 0.13),
      emissive: this.palette.glow.clone().lerp(this.palette.atmosphere, 0.44),
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 0.86,
    });
    const globe = new Mesh(new SphereGeometry(GLOBE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS), globeMat);
    globe.renderOrder = 1;
    this.globeGroup.add(globe);

    this.continentTex = buildContinentTexture({
      fillColor: this.palette.landCss,
      outlineColor: this.palette.landOutlineCss,
      glowColor: this.palette.atmosphereCss,
    });
    this.continentTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const continentMat = new MeshBasicMaterial({
      map: this.continentTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const continents = new Mesh(
      new SphereGeometry(GLOBE_RADIUS * 1.0025, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      continentMat,
    );
    continents.renderOrder = 2;
    this.globeGroup.add(continents);

    this.globeGroup.add(this.beaconGroup);
    this.scene.add(this.globeGroup);
  }

  private disposeScene() {
    if (this.continentTex) {
      this.continentTex.dispose();
      this.continentTex = null;
    }
    if (this.poleTex) {
      this.poleTex.dispose();
      this.poleTex = null;
    }
    this.globeGroup.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  private async fetchAndRender() {
    try {
      const res = await fetch("/api/v1/rooms");
      if (!res.ok) return;
      const { rooms } = (await res.json()) as { rooms: Room[] };
      if (this.poleTex) {
        this.poleTex.dispose();
      }
      this.poleTex = createBeacons(rooms, this.beaconGroup, this.beacons, this.palette.beaconCss);
      this.syncBeaconStates();
    } catch {
      // ignore — globe still renders without beacons
    }
  }

  private resolvePalette(): GlobePalette {
    const landCss = this.resolveCssColor("--color-globe-land", FALLBACK_COLORS.land);
    const coreCss = this.resolveCssColor("--color-globe-core", FALLBACK_COLORS.core);
    const landOutlineCss = this.resolveCssColor("--color-globe-land-outline", FALLBACK_COLORS.landOutline);
    const atmosphereCss = this.resolveCssColor("--color-globe-atmosphere", FALLBACK_COLORS.atmosphere);
    const glowCss = this.resolveCssColor("--color-globe-glow", FALLBACK_COLORS.glow);
    const beaconCss = this.resolveCssColor("--color-globe-beacon", FALLBACK_COLORS.beacon);
    const textCss = this.resolveCssColor("--color-text", FALLBACK_COLORS.text);

    return {
      coreCss,
      landCss,
      landOutlineCss,
      atmosphereCss,
      glowCss,
      beaconCss,
      textCss,
      core: new Color(coreCss),
      atmosphere: new Color(atmosphereCss),
      glow: new Color(glowCss),
      beacon: new Color(beaconCss),
    };
  }

  private resolveCssColor(variableName: string, fallback: string): string {
    const probe = document.createElement("span");
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    probe.style.backgroundColor = `var(${variableName}, ${fallback})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor || fallback;
    probe.remove();
    return this.normalizeCssColor(resolved, fallback);
  }

  private normalizeCssColor(value: string, fallback: string): string {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = fallback;

    try {
      ctx.fillStyle = value;
    } catch {
      return fallback;
    }

    ctx.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
    if (alpha === 255) {
      return `rgb(${red}, ${green}, ${blue})`;
    }

    return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3)})`;
  }

  private syncBeaconStates() {
    for (const [roomId, entry] of this.beacons) {
      entry.isSelected = roomId === this.selectedRoomId;
      entry.isHovered = roomId === this.hoveredRoomId;
    }
  }

  private getZoomProgress(): number {
    return clamp((this.cameraDistance - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE), 0, 1);
  }

  private getCameraDistanceFromProgress(progress: number): number {
    return CAMERA_MIN_DISTANCE + clamp(progress, 0, 1) * (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE);
  }

  private getCameraDistanceFromTrackPointer(event: PointerEvent): number {
    if (!this.zoomTrackEl) {
      return this.cameraDistance;
    }

    const rect = this.zoomTrackEl.getBoundingClientRect();
    const thumbSize = this.zoomThumbEl?.offsetHeight ?? DEFAULT_ZOOM_THUMB_SIZE;
    const usableHeight = Math.max(rect.height - thumbSize, 1);
    const thumbOffset = clamp(event.clientY - rect.top - thumbSize / 2, 0, usableHeight);
    return this.getCameraDistanceFromProgress(thumbOffset / usableHeight);
  }

  private syncZoomButtonState(button: HTMLButtonElement | null, disabled: boolean) {
    if (!button) {
      return;
    }

    button.disabled = disabled;
    button.className = `${ZOOM_BUTTON_BASE_CLASSES} ${disabled ? ZOOM_BUTTON_DISABLED_CLASSES : ZOOM_BUTTON_ENABLED_CLASSES}`;
  }

  private syncZoomControls() {
    if (this.zoomTrackEl && this.zoomThumbEl) {
      const thumbSize = this.zoomThumbEl.offsetHeight || DEFAULT_ZOOM_THUMB_SIZE;
      const usableHeight = Math.max(this.zoomTrackEl.clientHeight - thumbSize, 0);
      this.zoomThumbEl.style.top = `${this.getZoomProgress() * usableHeight}px`;
    }

    this.syncZoomButtonState(this.zoomInButton, this.cameraDistance <= CAMERA_MIN_DISTANCE + 0.001);
    this.syncZoomButtonState(this.zoomOutButton, this.cameraDistance >= CAMERA_MAX_DISTANCE - 0.001);
  }

  private setCameraDistance(distance: number) {
    this.cameraDistance = clamp(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);

    if (this.camera) {
      this.camera.position.z = this.cameraDistance;
      this.camera.updateProjectionMatrix();
    }

    this.syncZoomControls();
  }

  private zoomCamera(delta: number) {
    this.setCameraDistance(this.cameraDistance + delta);
  }

  private clearHoverState() {
    if (this.hoveredRoomId) {
      this.hoveredRoomId = "";
      this.syncBeaconStates();
    }
  }

  private hideTooltip() {
    this.tooltipEl.style.display = "none";
  }

  private getActivePointerDistance(): number {
    const [first, second] = Array.from(this.activePointers.values());
    if (!first || !second) return 0;

    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.prevMouse = { x: e.clientX, y: e.clientY };
    } else {
      this.isDragging = false;
      this.pinchDistance = this.getActivePointerDistance();
      this.clearHoverState();
      this.hideTooltip();
    }

    this.renderer.domElement.style.cursor = "grabbing";
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.activePointers.size >= 2) {
      const nextDistance = this.getActivePointerDistance();
      if (this.pinchDistance > 0) {
        this.zoomCamera((this.pinchDistance - nextDistance) * PINCH_ZOOM_SENSITIVITY);
      }
      this.pinchDistance = nextDistance;
      this.clearHoverState();
      this.hideTooltip();
      this.renderer.domElement.style.cursor = "grabbing";
      return;
    }

    if (this.isDragging) {
      this.clearHoverState();
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.globeGroup.rotation.y += dx * 0.005;
      this.globeGroup.rotation.x += dy * 0.003;
      this.globeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, this.globeGroup.rotation.x));
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.hideTooltip();
    } else if (this.activePointers.size === 0) {
      this.checkHover(e);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const wasPinching = this.activePointers.size > 1;
    this.activePointers.delete(e.pointerId);
    this.isDragging = false;
    this.pinchDistance = this.activePointers.size > 1 ? this.getActivePointerDistance() : 0;

    const canvas = e.currentTarget as HTMLCanvasElement;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (!wasPinching && moved < 4) this.checkClick(e);
    this.renderer.domElement.style.cursor =
      this.activePointers.size > 0 ? "grabbing" : this.hoveredRoomId ? "pointer" : "grab";
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.isDragging = false;
    this.pinchDistance = this.activePointers.size > 1 ? this.getActivePointerDistance() : 0;
    this.clearHoverState();
    this.hideTooltip();
    this.renderer.domElement.style.cursor = this.activePointers.size > 0 ? "grabbing" : "grab";
  };

  private onPointerLeave = () => {
    if (this.activePointers.size > 0) {
      return;
    }

    this.isDragging = false;
    this.clearHoverState();
    this.hideTooltip();
    this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomCamera(e.deltaY * WHEEL_ZOOM_SENSITIVITY);
    this.hideTooltip();
    this.renderer.domElement.style.cursor = this.hoveredRoomId ? "pointer" : "grab";
  };

  private onZoomInClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.clearHoverState();
    this.hideTooltip();
    this.zoomCamera(-BUTTON_ZOOM_STEP);
  };

  private onZoomOutClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.clearHoverState();
    this.hideTooltip();
    this.zoomCamera(BUTTON_ZOOM_STEP);
  };

  private onZoomTrackPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.clearHoverState();
    this.hideTooltip();
    this.zoomTrackPointerId = e.pointerId;

    const track = e.currentTarget as HTMLDivElement;
    track.setPointerCapture(e.pointerId);
    this.setCameraDistance(this.getCameraDistanceFromTrackPointer(e));
  };

  private onZoomTrackPointerMove = (e: PointerEvent) => {
    if (this.zoomTrackPointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    this.setCameraDistance(this.getCameraDistanceFromTrackPointer(e));
  };

  private onZoomTrackPointerUp = (e: PointerEvent) => {
    if (this.zoomTrackPointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const track = e.currentTarget as HTMLDivElement;
    if (track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    this.zoomTrackPointerId = null;
  };

  private onZoomTrackPointerCancel = (e: PointerEvent) => {
    if (this.zoomTrackPointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const track = e.currentTarget as HTMLDivElement;
    if (track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    this.zoomTrackPointerId = null;
  };

  private setupPointerEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private getRay(e: PointerEvent): Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc.set(x, y), this.camera);
    return this.raycaster;
  }

  private isFrontFacing(object: Object3D): boolean {
    const globeCenter = this.globeGroup.getWorldPosition(new Vector3());
    const point = object.getWorldPosition(new Vector3());
    const surfaceNormal = point.clone().sub(globeCenter).normalize();
    const toCamera = this.camera.position.clone().sub(point).normalize();
    return surfaceNormal.dot(toCamera) > 0;
  }

  private getIntersectedBeacon(e: PointerEvent): { roomId: string; roomName: string } | null {
    const targets = Array.from(this.beacons.values()).map(({ hitArea }) => hitArea);
    const hits = this.getRay(e).intersectObjects(targets);
    for (const hit of hits) {
      if (!this.isFrontFacing(hit.object)) continue;
      const { roomId, roomName } = hit.object.userData as {
        roomId: string;
        roomName: string;
      };
      return { roomId, roomName };
    }
    return null;
  }

  private checkHover(e: PointerEvent) {
    const beacon = this.getIntersectedBeacon(e);
    if (beacon) {
      if (this.hoveredRoomId !== beacon.roomId) {
        this.hoveredRoomId = beacon.roomId;
        this.syncBeaconStates();
      }
      this.tooltipEl.textContent = beacon.roomName;
      this.tooltipEl.style.display = "block";
      this.tooltipEl.style.left = `${e.offsetX + 14}px`;
      this.tooltipEl.style.top = `${e.offsetY - 10}px`;
      this.renderer.domElement.style.cursor = "pointer";
    } else {
      this.clearHoverState();
      this.hideTooltip();
      this.renderer.domElement.style.cursor = "grab";
    }
  }

  private checkClick(e: PointerEvent) {
    const beacon = this.getIntersectedBeacon(e);
    if (beacon) {
      this.dispatchEvent(
        new CustomEvent("room-select", {
          bubbles: true,
          detail: { roomId: beacon.roomId },
        }),
      );
    }
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick);
    if (this.activePointers.size === 0 && !this.hoveredRoomId) {
      this.globeGroup.rotation.y += 0.0009;
    }
    animateBeacons(this.beacons);
    this.renderer.render(this.scene, this.camera);
  };
}

customElements.define("app-globe", AppGlobe);
