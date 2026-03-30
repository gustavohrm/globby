import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type ColorRepresentation,
} from "three";

const GLOBE_RADIUS = 1.5;
const BEACON_HEIGHT = GLOBE_RADIUS * 0.35;
const DEFAULT_PRIMARY_COLOR = "#f5d0fe";

export type Room = {
  id: string;
  code: string;
  name: string;
  creatorId: string;
  createdAt: string;
};

export type BeaconEntry = {
  pole: Mesh;
  ring: Mesh;
  hitArea: Mesh;
  ringMat: MeshBasicMaterial;
  isHovered: boolean;
  isSelected: boolean;
  t: number;
};

export function hashRoomId(id: string): [number, number] {
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

export function latLonToVec3(
  lat: number,
  lon: number,
  r: number,
): Vector3 {
  return new Vector3(
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.cos(lon),
  );
}

function toRgba(color: Color, alpha: number): string {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildPoleTexture(
  primaryColor: ColorRepresentation,
): CanvasTexture {
  const color = new Color(primaryColor);
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, toRgba(color, 1));
  g.addColorStop(0.35, toRgba(color, 0.78));
  g.addColorStop(0.7, toRgba(color, 0.28));
  g.addColorStop(1, toRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 64);
  return new CanvasTexture(canvas);
}

export function createBeacons(
  rooms: Room[],
  beaconGroup: Group,
  beacons: Map<string, BeaconEntry>,
  primaryColor: ColorRepresentation = DEFAULT_PRIMARY_COLOR,
) {
  // Dispose previous
  for (const { pole, ring, hitArea, ringMat } of beacons.values()) {
    pole.geometry.dispose();
    (pole.material as MeshBasicMaterial).dispose();
    ring.geometry.dispose();
    ringMat.dispose();
    hitArea.geometry.dispose();
    (hitArea.material as Material).dispose();
  }
  beaconGroup.clear();
  beacons.clear();

  const poleTex = buildPoleTexture(primaryColor);

  for (const room of rooms) {
    const [lat, lon] = hashRoomId(room.id);
    const dir = latLonToVec3(lat, lon, 1);

    // Thinner pole
    const poleGeo = new CylinderGeometry(
      0.003,
      0.006,
      BEACON_HEIGHT,
      6,
      1,
      true,
    );
    const poleMat = new MeshBasicMaterial({
      map: poleTex,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    const pole = new Mesh(poleGeo, poleMat);
    pole.position.copy(
      dir.clone().multiplyScalar(GLOBE_RADIUS + BEACON_HEIGHT / 2),
    );
    pole.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    pole.userData = { roomId: room.id, roomName: room.name };
    beaconGroup.add(pole);

    // Thin ring (narrow difference between inner and outer radius)
    const ringGeo = new RingGeometry(0.035, 0.04, 32);
    const ringMat = new MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.88,
      side: DoubleSide,
      depthWrite: false,
    });
    const ring = new Mesh(ringGeo, ringMat);
    ring.position.copy(dir.clone().multiplyScalar(GLOBE_RADIUS + 0.005));
    ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);
    beaconGroup.add(ring);

    const hitArea = new Mesh(
      new SphereGeometry(0.12, 12, 12),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    hitArea.position.copy(
      dir.clone().multiplyScalar(GLOBE_RADIUS + BEACON_HEIGHT * 0.55),
    );
    hitArea.userData = { roomId: room.id, roomName: room.name };
    beaconGroup.add(hitArea);

    beacons.set(room.id, {
      pole,
      ring,
      hitArea,
      ringMat,
      isHovered: false,
      isSelected: false,
      t: Math.random(),
    });
  }

  return poleTex;
}

export function animateBeacons(beacons: Map<string, BeaconEntry>) {
  for (const entry of beacons.values()) {
    const pulseRate = entry.isHovered ? 0.006 : 0.008;
    const hoverThickness = entry.isHovered ? 1.35 : 1;
    const selectedHeight = entry.isSelected ? 1.6 : 1;
    const selectedRingBoost = entry.isSelected ? 1.18 : 1;
    const hoverRingBoost = entry.isHovered ? 1.08 : 1;

    entry.t = (entry.t + pulseRate) % 1;
    entry.pole.scale.set(hoverThickness, selectedHeight, hoverThickness);
    entry.ring.scale.setScalar(
      (1 + entry.t * 3) * selectedRingBoost * hoverRingBoost,
    );
    entry.ringMat.opacity = Math.max(
      entry.isSelected ? 0.38 : 0,
      (1 - entry.t) * (entry.isHovered ? 0.92 : 0.78),
    );
  }
}

export function disposeBeacons(
  beacons: Map<string, BeaconEntry>,
  poleTex: CanvasTexture | null,
) {
  if (poleTex) poleTex.dispose();
  for (const { pole, ring, hitArea, ringMat } of beacons.values()) {
    pole.geometry.dispose();
    (pole.material as MeshBasicMaterial).dispose();
    ring.geometry.dispose();
    ringMat.dispose();
    hitArea.geometry.dispose();
    (hitArea.material as Material).dispose();
  }
}
