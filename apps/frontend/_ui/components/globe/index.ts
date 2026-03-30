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
const FALLBACK_COLORS = {
  core: "#09030f",
  land: "#f5d0fe",
  landOutline: "#f0abfc",
  atmosphere: "#e879f9",
  glow: "#d946ef",
  beacon: "#fae8ff",
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
        radial-gradient(circle at 50% 48%, ${toRgba(this.palette.glow, 0.2)} 0%, ${toRgba(this.palette.atmosphere, 0.12)} 22%, rgba(0, 0, 0, 0) 48%),
        radial-gradient(circle at 50% 50%, ${toRgba(this.palette.glow, 0.1)} 0%, rgba(0, 0, 0, 0) 62%),
        linear-gradient(180deg, ${toRgba(this.palette.core, 0.98)} 0%, ${this.palette.coreCss} 100%)`,
    ].join(";");
    this.initRenderer();
    this.buildScene();
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
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas = null;
    }
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
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(this.palette.core, 0);
    this.onResize();
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.position = "relative";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.cursor = "grab";
    this.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.style.cssText = `position:absolute;pointer-events:none;background:${toRgba(this.palette.core, 0.92)};border:1px solid ${toRgba(this.palette.beacon, 0.55)};box-shadow:0 0 22px ${toRgba(this.palette.glow, 0.18)};color:${this.palette.textCss};font-size:12px;padding:4px 10px;border-radius:999px;display:none;white-space:nowrap;z-index:10;backdrop-filter:blur(10px);`;
    this.appendChild(this.tooltipEl);
  }

  private buildScene() {
    this.scene = new Scene();
    const w = this.offsetWidth || window.innerWidth;
    const h = this.offsetHeight || window.innerHeight;
    this.camera = new PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.z = 4.5;

    this.scene.add(new AmbientLight(this.palette.atmosphere.clone(), 1.35));
    const skyLight = new HemisphereLight(
      this.palette.beacon.clone(),
      this.palette.core.clone(),
      1.15,
    );
    this.scene.add(skyLight);
    const keyLight = new PointLight(this.palette.glow, 7, 12, 2);
    keyLight.position.set(3.2, 2.1, 4.6);
    this.scene.add(keyLight);
    const fillLight = new PointLight(this.palette.atmosphere, 4.5, 11, 2);
    fillLight.position.set(-2.8, -0.9, 3.8);
    this.scene.add(fillLight);

    const innerGlowMat = new MeshBasicMaterial({
      color: this.palette.glow.clone().lerp(this.palette.beacon, 0.14),
      transparent: true,
      opacity: 0.16,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const innerGlow = new Mesh(
      new SphereGeometry(GLOBE_RADIUS * 0.965, 64, 64),
      innerGlowMat,
    );
    innerGlow.renderOrder = 0;
    this.globeGroup.add(innerGlow);

    const globeMat = new MeshLambertMaterial({
      color: this.palette.core.clone().lerp(this.palette.atmosphere, 0.08),
      emissive: this.palette.glow.clone().lerp(this.palette.atmosphere, 0.3),
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.7,
    });
    const globe = new Mesh(
      new SphereGeometry(GLOBE_RADIUS, 64, 64),
      globeMat,
    );
    globe.renderOrder = 1;
    this.globeGroup.add(globe);

    this.continentTex = buildContinentTexture({
      fillColor: this.palette.landCss,
      outlineColor: this.palette.landOutlineCss,
      glowColor: this.palette.atmosphereCss,
    });
    const continentMat = new MeshBasicMaterial({
      map: this.continentTex,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
    const continents = new Mesh(
      new SphereGeometry(GLOBE_RADIUS * 1.002, 64, 64),
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

  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.prevMouse = { x: e.clientX, y: e.clientY };
    this.renderer.domElement.style.cursor = "grabbing";
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.isDragging) {
      if (this.hoveredRoomId) {
        this.hoveredRoomId = "";
        this.syncBeaconStates();
      }
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
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;
    (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (moved < 4) this.checkClick(e);
    this.renderer.domElement.style.cursor = this.hoveredRoomId ? "pointer" : "grab";
  };

  private onPointerLeave = () => {
    this.isDragging = false;
    if (this.hoveredRoomId) {
      this.hoveredRoomId = "";
      this.syncBeaconStates();
    }
    this.tooltipEl.style.display = "none";
    this.renderer.domElement.style.cursor = "grab";
  };

  private setupPointerEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
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
      if (this.hoveredRoomId) {
        this.hoveredRoomId = "";
        this.syncBeaconStates();
      }
      this.tooltipEl.style.display = "none";
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
    if (!this.isDragging && !this.hoveredRoomId) {
      this.globeGroup.rotation.y += 0.001;
    }
    animateBeacons(this.beacons);
    this.renderer.render(this.scene, this.camera);
  };
}

customElements.define("app-globe", AppGlobe);
