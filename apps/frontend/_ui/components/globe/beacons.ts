import * as THREE from "three";

const GLOBE_RADIUS = 1.5;
const BEACON_HEIGHT = GLOBE_RADIUS * 0.35;

export type Room = {
  id: string;
  code: string;
  name: string;
  creatorId: string;
  createdAt: string;
};

export type BeaconEntry = {
  pole: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
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
): THREE.Vector3 {
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.cos(lon),
  );
}

function buildPoleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, "rgba(192,38,211,0.9)");
  g.addColorStop(0.5, "rgba(192,38,211,0.3)");
  g.addColorStop(1, "rgba(192,38,211,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createBeacons(
  rooms: Room[],
  beaconGroup: THREE.Group,
  beacons: Map<string, BeaconEntry>,
) {
  // Dispose previous
  for (const { pole, ring, ringMat } of beacons.values()) {
    pole.geometry.dispose();
    (pole.material as THREE.MeshBasicMaterial).dispose();
    ring.geometry.dispose();
    ringMat.dispose();
  }
  beaconGroup.clear();
  beacons.clear();

  const poleTex = buildPoleTexture();

  for (const room of rooms) {
    const [lat, lon] = hashRoomId(room.id);
    const dir = latLonToVec3(lat, lon, 1);

    // Thinner pole
    const poleGeo = new THREE.CylinderGeometry(
      0.003,
      0.006,
      BEACON_HEIGHT,
      6,
      1,
      true,
    );
    const poleMat = new THREE.MeshBasicMaterial({
      map: poleTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.copy(
      dir.clone().multiplyScalar(GLOBE_RADIUS + BEACON_HEIGHT / 2),
    );
    pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pole.userData = { roomId: room.id, roomName: room.name };
    beaconGroup.add(pole);

    // Thin ring (narrow difference between inner and outer radius)
    const ringGeo = new THREE.RingGeometry(0.035, 0.04, 32);
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
    beaconGroup.add(ring);

    beacons.set(room.id, { pole, ring, ringMat, t: Math.random() });
  }

  return poleTex;
}

export function animateBeacons(beacons: Map<string, BeaconEntry>) {
  for (const entry of beacons.values()) {
    entry.t = (entry.t + 0.008) % 1;
    entry.ring.scale.setScalar(1 + entry.t * 3);
    entry.ringMat.opacity = (1 - entry.t) * 0.7;
  }
}

export function disposeBeacons(
  beacons: Map<string, BeaconEntry>,
  poleTex: THREE.CanvasTexture | null,
) {
  if (poleTex) poleTex.dispose();
  for (const { pole, ring, ringMat } of beacons.values()) {
    pole.geometry.dispose();
    (pole.material as THREE.MeshBasicMaterial).dispose();
    ring.geometry.dispose();
    ringMat.dispose();
  }
}
