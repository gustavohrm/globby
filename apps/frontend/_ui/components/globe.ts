import * as THREE from "three";

type Room = { id: string; code: string; name: string; creatorId: string; createdAt: string };

const GLOBE_RADIUS = 1.5;
const BEACON_HEIGHT = GLOBE_RADIUS * 0.5;

function hashRoomId(id: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  const lat = ((h1 % 140) - 70) * (Math.PI / 180);
  const lon = ((h2 % 360) - 180) * (Math.PI / 180);
  return [lat, lon];
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
}

type BeaconEntry = { pole: THREE.Mesh; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; t: number };

class AppGlobe extends HTMLElement {
  private renderer!: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private globeGroup = new THREE.Group();
  private beaconGroup = new THREE.Group();
  private beacons = new Map<string, BeaconEntry>();
  private poleTex: THREE.CanvasTexture | null = null;
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x030712);
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

  private disposeScene() {
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
    // Dispose previous beacon resources
    if (this.poleTex) {
      this.poleTex.dispose();
      this.poleTex = null;
    }
    for (const { pole, ring, ringMat } of this.beacons.values()) {
      pole.geometry.dispose();
      (pole.material as THREE.MeshBasicMaterial).dispose();
      ring.geometry.dispose();
      ringMat.dispose();
    }
    this.beaconGroup.clear();
    this.beacons.clear();
    this.poleTex = this.buildPoleTexture();

    for (const room of rooms) {
      const [lat, lon] = hashRoomId(room.id);
      const dir = latLonToVec3(lat, lon, 1);

      const poleGeo = new THREE.CylinderGeometry(0.006, 0.014, BEACON_HEIGHT, 6, 1, true);
      const poleMat = new THREE.MeshBasicMaterial({
        map: this.poleTex,
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
    const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
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
