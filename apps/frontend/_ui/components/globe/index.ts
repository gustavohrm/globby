import * as THREE from "three";
import { buildContinentTexture } from "./continents";
import {
  animateBeacons,
  createBeacons,
  type BeaconEntry,
  type Room,
} from "./beacons";

const GLOBE_RADIUS = 1.5;

class AppGlobe extends HTMLElement {
  private renderer!: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private globeGroup = new THREE.Group();
  private beaconGroup = new THREE.Group();
  private beacons = new Map<string, BeaconEntry>();
  private poleTex: THREE.CanvasTexture | null = null;
  private continentTex: THREE.CanvasTexture | null = null;
  private rafId = 0;
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private prevMouse = { x: 0, y: 0 };
  private tooltipEl!: HTMLDivElement;
  private onRoomsChanged = () => void this.fetchAndRender();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  static get observedAttributes() {
    return ["selected-room"];
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ) {
    if (name === "selected-room") this.highlightBeacon(value ?? "");
  }

  connectedCallback() {
    this.innerHTML = "";
    this.style.cssText = "display:block;overflow:hidden;";
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x030712, 1);
    this.onResize();
    this.renderer.domElement.style.display = "block";
    this.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

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

    // Lighting
    this.scene.add(new THREE.AmbientLight(0x1a1a2e, 3));
    const dir = new THREE.DirectionalLight(0xc026d3, 2);
    dir.position.set(5, 3, 5);
    this.scene.add(dir);

    // Base globe (dark ocean)
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x050d1a,
      emissive: 0x1a0028,
      emissiveIntensity: 0.4,
      shininess: 60,
      transparent: true,
      opacity: 0.95,
    });
    this.globeGroup.add(
      new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64), globeMat),
    );

    // Continent layer
    this.continentTex = buildContinentTexture();
    const continentMat = new THREE.MeshBasicMaterial({
      map: this.continentTex,
      transparent: true,
      depthWrite: false,
    });
    this.globeGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS * 1.002, 64, 64),
        continentMat,
      ),
    );

    // Atmosphere glow (back-side sphere)
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0xc026d3,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.globeGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS * 1.1, 64, 64),
        atmMat,
      ),
    );

    this.globeGroup.add(this.beaconGroup);
    this.scene.add(this.globeGroup);
  }

  private disposeScene() {
    if (this.continentTex) {
      this.continentTex.dispose();
      this.continentTex = null;
    }
    this.globeGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
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
      this.poleTex = createBeacons(
        rooms,
        this.beaconGroup,
        this.beacons,
      );
    } catch {
      // ignore — globe still renders without beacons
    }
  }

  private highlightBeacon(roomId: string) {
    if (!this.scene) return;
    for (const [id, { pole }] of this.beacons) {
      pole.scale.setScalar(id === roomId ? 1.6 : 1);
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.prevMouse = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.isDragging) {
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.globeGroup.rotation.y += dx * 0.005;
      this.globeGroup.rotation.x += dy * 0.003;
      this.globeGroup.rotation.x = Math.max(
        -1.2,
        Math.min(1.2, this.globeGroup.rotation.x),
      );
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.tooltipEl.style.display = "none";
    } else {
      this.checkHover(e);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;
    const moved = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (moved < 4) this.checkClick(e);
  };

  private onPointerLeave = () => {
    this.isDragging = false;
    this.tooltipEl.style.display = "none";
  };

  private setupPointerEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  private getRay(e: PointerEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc.set(x, y), this.camera);
    return this.raycaster;
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
      this.dispatchEvent(
        new CustomEvent("room-select", { bubbles: true, detail: { roomId } }),
      );
    }
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick);
    if (!this.isDragging) {
      this.globeGroup.rotation.y += 0.001;
    }
    animateBeacons(this.beacons);
    this.renderer.render(this.scene, this.camera);
  };
}

customElements.define("app-globe", AppGlobe);
