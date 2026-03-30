import * as THREE from "three";

type Polygon = [number, number][];

// Equirectangular landmass outlines as [longitude, latitude] pairs
const NORTH_AMERICA: Polygon = [
  [-168, 65],
  [-162, 60],
  [-150, 58],
  [-138, 56],
  [-131, 54],
  [-126, 50],
  [-124, 42],
  [-118, 34],
  [-110, 30],
  [-105, 26],
  [-100, 22],
  [-97, 19],
  [-92, 16],
  [-87, 14],
  [-83, 10],
  [-80, 8],
  [-77, 8],
  [-82, 10],
  [-84, 11],
  [-88, 18],
  [-91, 19],
  [-97, 26],
  [-95, 28],
  [-90, 29],
  [-85, 29],
  [-82, 25],
  [-80, 27],
  [-81, 31],
  [-77, 35],
  [-75, 38],
  [-72, 41],
  [-70, 43],
  [-67, 45],
  [-64, 46],
  [-60, 47],
  [-55, 47],
  [-53, 50],
  [-55, 52],
  [-58, 55],
  [-60, 58],
  [-64, 61],
  [-68, 62],
  [-73, 65],
  [-78, 68],
  [-85, 70],
  [-95, 72],
  [-105, 73],
  [-120, 73],
  [-135, 72],
  [-145, 70],
  [-155, 68],
  [-165, 67],
  [-168, 65],
];

const GREENLAND: Polygon = [
  [-55, 60],
  [-48, 60],
  [-42, 62],
  [-36, 65],
  [-22, 70],
  [-18, 74],
  [-20, 77],
  [-30, 80],
  [-42, 82],
  [-52, 82],
  [-58, 80],
  [-68, 76],
  [-60, 72],
  [-50, 68],
  [-46, 65],
  [-48, 62],
  [-55, 60],
];

const SOUTH_AMERICA: Polygon = [
  [-80, 10],
  [-76, 10],
  [-72, 11],
  [-68, 12],
  [-62, 10],
  [-55, 6],
  [-51, 4],
  [-48, 0],
  [-45, -3],
  [-42, -5],
  [-38, -8],
  [-35, -10],
  [-35, -15],
  [-37, -18],
  [-40, -22],
  [-42, -23],
  [-45, -24],
  [-48, -27],
  [-50, -30],
  [-52, -33],
  [-55, -35],
  [-58, -38],
  [-63, -40],
  [-65, -42],
  [-67, -45],
  [-68, -50],
  [-70, -52],
  [-72, -50],
  [-73, -46],
  [-72, -42],
  [-71, -38],
  [-70, -33],
  [-70, -28],
  [-70, -22],
  [-70, -18],
  [-75, -15],
  [-76, -10],
  [-78, -5],
  [-80, 0],
  [-80, 5],
  [-77, 7],
  [-80, 10],
];

const EUROPE: Polygon = [
  [-10, 36],
  [-9, 40],
  [-8, 43],
  [-5, 45],
  [-2, 48],
  [2, 50],
  [6, 52],
  [10, 54],
  [14, 55],
  [18, 56],
  [22, 56],
  [26, 55],
  [29, 54],
  [31, 52],
  [30, 49],
  [28, 46],
  [25, 43],
  [22, 41],
  [19, 40],
  [16, 39],
  [13, 39],
  [10, 40],
  [7, 42],
  [4, 43],
  [1, 43],
  [-2, 43],
  [-5, 42],
  [-8, 40],
  [-10, 36],
];

const AFRICA: Polygon = [
  [-17, 37],
  [-10, 36],
  [-4, 35],
  [2, 35],
  [8, 36],
  [14, 34],
  [20, 32],
  [26, 32],
  [31, 31],
  [34, 29],
  [36, 25],
  [40, 20],
  [44, 15],
  [47, 12],
  [50, 11],
  [49, 7],
  [45, 4],
  [43, 0],
  [42, -5],
  [40, -10],
  [39, -15],
  [37, -20],
  [35, -25],
  [32, -29],
  [28, -33],
  [23, -35],
  [18, -35],
  [14, -34],
  [11, -31],
  [9, -26],
  [8, -20],
  [10, -12],
  [11, -5],
  [10, 0],
  [8, 3],
  [5, 4],
  [2, 5],
  [-2, 5],
  [-6, 5],
  [-10, 6],
  [-14, 9],
  [-17, 14],
  [-17, 20],
  [-16, 25],
  [-14, 29],
  [-12, 32],
  [-10, 35],
  [-17, 37],
];

const ASIA: Polygon = [
  [30, 42],
  [35, 40],
  [40, 38],
  [42, 37],
  [45, 38],
  [50, 37],
  [55, 36],
  [60, 34],
  [65, 32],
  [70, 30],
  [72, 28],
  [75, 25],
  [77, 20],
  [78, 15],
  [80, 10],
  [80, 6],
  [82, 8],
  [85, 12],
  [88, 22],
  [90, 22],
  [92, 22],
  [95, 18],
  [98, 16],
  [100, 14],
  [102, 10],
  [104, 8],
  [104, 2],
  [106, 0],
  [108, 2],
  [110, 5],
  [112, 8],
  [115, 10],
  [118, 15],
  [120, 18],
  [121, 22],
  [120, 25],
  [122, 30],
  [125, 33],
  [128, 35],
  [130, 38],
  [132, 40],
  [135, 42],
  [138, 44],
  [142, 46],
  [145, 50],
  [148, 52],
  [152, 55],
  [155, 58],
  [160, 60],
  [165, 62],
  [170, 64],
  [175, 65],
  [180, 66],
  [180, 72],
  [170, 72],
  [160, 70],
  [150, 68],
  [140, 62],
  [135, 58],
  [130, 55],
  [120, 55],
  [110, 53],
  [100, 52],
  [90, 50],
  [80, 50],
  [70, 52],
  [60, 55],
  [55, 58],
  [50, 58],
  [42, 55],
  [38, 52],
  [35, 50],
  [30, 48],
  [28, 45],
  [30, 42],
];

const AUSTRALIA: Polygon = [
  [114, -12],
  [118, -14],
  [122, -14],
  [128, -14],
  [132, -12],
  [136, -12],
  [138, -14],
  [140, -16],
  [142, -14],
  [145, -15],
  [148, -18],
  [150, -22],
  [152, -25],
  [153, -28],
  [153, -30],
  [150, -34],
  [148, -36],
  [145, -38],
  [142, -38],
  [138, -36],
  [136, -35],
  [132, -33],
  [128, -32],
  [124, -33],
  [120, -34],
  [116, -34],
  [114, -32],
  [114, -28],
  [113, -24],
  [114, -22],
  [115, -20],
  [118, -18],
  [120, -16],
  [118, -15],
  [115, -14],
  [114, -12],
];

const INDONESIA: Polygon[] = [
  // Sumatra
  [
    [95, 5],
    [98, 4],
    [100, 2],
    [104, -2],
    [106, -5],
    [104, -6],
    [102, -4],
    [98, -1],
    [96, 2],
    [95, 5],
  ],
  // Borneo
  [
    [108, 5],
    [112, 5],
    [116, 4],
    [118, 2],
    [118, 0],
    [116, -3],
    [114, -4],
    [110, -3],
    [108, -1],
    [108, 2],
    [108, 5],
  ],
  // Java
  [
    [105, -6],
    [108, -6],
    [110, -7],
    [114, -8],
    [114, -9],
    [110, -8],
    [106, -7],
    [105, -6],
  ],
];

const JAPAN: Polygon[] = [
  [
    [130, 31],
    [131, 33],
    [133, 34],
    [135, 35],
    [137, 36],
    [140, 38],
    [141, 40],
    [140, 42],
    [142, 44],
    [145, 45],
    [145, 44],
    [143, 42],
    [142, 40],
    [141, 38],
    [138, 35],
    [136, 34],
    [134, 33],
    [132, 32],
    [130, 31],
  ],
];

const UK: Polygon = [
  [-6, 50],
  [-4, 50],
  [-2, 51],
  [0, 52],
  [1, 54],
  [0, 56],
  [-2, 55],
  [-4, 57],
  [-5, 58],
  [-6, 58],
  [-5, 56],
  [-4, 54],
  [-3, 52],
  [-4, 52],
  [-5, 51],
  [-6, 50],
];

const ICELAND: Polygon = [
  [-24, 64],
  [-20, 63],
  [-15, 64],
  [-13, 65],
  [-15, 66],
  [-20, 66],
  [-24, 66],
  [-24, 64],
];

const NEW_ZEALAND: Polygon[] = [
  // North Island
  [
    [173, -37],
    [175, -36],
    [178, -37],
    [178, -39],
    [176, -41],
    [174, -41],
    [173, -39],
    [173, -37],
  ],
  // South Island
  [
    [168, -44],
    [170, -43],
    [173, -42],
    [174, -43],
    [172, -45],
    [170, -46],
    [168, -46],
    [167, -45],
    [168, -44],
  ],
];

const SCANDINAVIA: Polygon = [
  [5, 56],
  [8, 57],
  [12, 59],
  [16, 61],
  [20, 64],
  [24, 68],
  [27, 71],
  [26, 72],
  [22, 71],
  [18, 68],
  [15, 65],
  [12, 62],
  [9, 59],
  [6, 57],
  [5, 56],
];

const MADAGASCAR: Polygon = [
  [44, -12],
  [48, -14],
  [50, -18],
  [50, -22],
  [48, -25],
  [44, -25],
  [44, -22],
  [43, -18],
  [44, -14],
  [44, -12],
];

const SRI_LANKA: Polygon = [
  [80, 10],
  [82, 8],
  [82, 6],
  [80, 6],
  [80, 8],
  [80, 10],
];

const ITALY: Polygon = [
  [8, 44],
  [10, 45],
  [12, 44],
  [13, 43],
  [14, 42],
  [15, 41],
  [16, 39],
  [16, 38],
  [15, 37],
  [14, 38],
  [13, 39],
  [12, 41],
  [11, 42],
  [10, 43],
  [8, 44],
];

const ALL_CONTINENTS: { polygons: Polygon[] }[] = [
  { polygons: [NORTH_AMERICA] },
  { polygons: [GREENLAND] },
  { polygons: [SOUTH_AMERICA] },
  { polygons: [EUROPE, UK, ICELAND, SCANDINAVIA, ITALY] },
  { polygons: [AFRICA, MADAGASCAR] },
  { polygons: [ASIA, SRI_LANKA] },
  { polygons: [AUSTRALIA, ...INDONESIA, ...JAPAN, ...NEW_ZEALAND] },
];

function lonLatToXY(
  lon: number,
  lat: number,
  w: number,
  h: number,
): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

function smoothPolygon(poly: Polygon, passes: number): Polygon {
  const isClosed =
    poly.length > 2 &&
    poly[0][0] === poly[poly.length - 1][0] &&
    poly[0][1] === poly[poly.length - 1][1];
  let points = isClosed ? poly.slice(0, -1) : [...poly];

  for (let pass = 0; pass < passes; pass++) {
    const next: Polygon = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const following = points[(i + 1) % points.length];
      next.push(
        [
          current[0] * 0.75 + following[0] * 0.25,
          current[1] * 0.75 + following[1] * 0.25,
        ],
        [
          current[0] * 0.25 + following[0] * 0.75,
          current[1] * 0.25 + following[1] * 0.75,
        ],
      );
    }
    points = next;
  }

  if (isClosed && points.length > 0) {
    points.push([points[0][0], points[0][1]]);
  }

  return points;
}

function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  poly: Polygon,
  w: number,
  h: number,
) {
  const smoothed = smoothPolygon(poly, 2);
  ctx.beginPath();
  for (let i = 0; i < smoothed.length; i++) {
    const [x, y] = lonLatToXY(smoothed[i][0], smoothed[i][1], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function tintMask(
  maskCanvas: HTMLCanvasElement,
  color: string,
): HTMLCanvasElement {
  const tintedCanvas = createCanvas(maskCanvas.width, maskCanvas.height);
  const tintedCtx = tintedCanvas.getContext("2d")!;
  tintedCtx.drawImage(maskCanvas, 0, 0);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tintedCanvas.width, tintedCanvas.height);
  return tintedCanvas;
}

function buildSoftGlowCanvas(
  maskCanvas: HTMLCanvasElement,
  glowColor: string,
): HTMLCanvasElement {
  const glowCanvas = createCanvas(maskCanvas.width, maskCanvas.height);
  const glowCtx = glowCanvas.getContext("2d")!;
  glowCtx.drawImage(maskCanvas, 0, 0);
  glowCtx.globalCompositeOperation = "source-in";

  const gradient = glowCtx.createLinearGradient(
    0,
    0,
    glowCanvas.width,
    glowCanvas.height,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.4, glowColor);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.55)");
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

  return glowCanvas;
}

function buildOutlineCanvas(
  w: number,
  h: number,
  outlineColor: string,
): HTMLCanvasElement {
  const outlineCanvas = createCanvas(w, h);
  const outlineCtx = outlineCanvas.getContext("2d")!;
  outlineCtx.strokeStyle = outlineColor;
  outlineCtx.lineWidth = 2;
  outlineCtx.lineJoin = "round";
  outlineCtx.lineCap = "round";

  for (const group of ALL_CONTINENTS) {
    for (const poly of group.polygons) {
      drawPolygonPath(outlineCtx, poly, w, h);
      outlineCtx.stroke();
    }
  }

  return outlineCanvas;
}

function drawTerrainDetail(
  ctx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  w: number,
  h: number,
) {
  const detailCanvas = createCanvas(w, h);
  const detailCtx = detailCanvas.getContext("2d")!;
  detailCtx.drawImage(maskCanvas, 0, 0);
  detailCtx.globalCompositeOperation = "source-in";

  const lightSweep = detailCtx.createLinearGradient(0, 0, w, h);
  lightSweep.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  lightSweep.addColorStop(0.45, "rgba(255, 255, 255, 0.02)");
  lightSweep.addColorStop(1, "rgba(0, 0, 0, 0.2)");
  detailCtx.fillStyle = lightSweep;
  detailCtx.fillRect(0, 0, w, h);

  for (let i = 0; i < 28; i++) {
    const x = (((i * 73) % 101) / 100) * w;
    const y = (((i * 37) % 89) / 88) * h;
    const radius = (0.04 + ((i * 19) % 17) / 120) * h;
    const gradient = detailCtx.createRadialGradient(x, y, 0, x, y, radius);
    if (i % 2 === 0) {
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    } else {
      gradient.addColorStop(0, "rgba(0, 0, 0, 0.16)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    }
    detailCtx.fillStyle = gradient;
    detailCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.globalAlpha = 0.55;
  ctx.drawImage(detailCanvas, 0, 0);
  ctx.globalAlpha = 1;
}

export interface ContinentTextureOptions {
  fillColor: string;
  outlineColor: string;
  glowColor: string;
}

export function buildContinentTexture(
  options: ContinentTextureOptions,
): THREE.CanvasTexture {
  const w = 2048;
  const h = 1024;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const landMaskCanvas = createCanvas(w, h);
  const landMaskCtx = landMaskCanvas.getContext("2d")!;

  ctx.clearRect(0, 0, w, h);
  landMaskCtx.fillStyle = "#fff";

  for (const group of ALL_CONTINENTS) {
    for (const poly of group.polygons) {
      drawPolygonPath(landMaskCtx, poly, w, h);
      landMaskCtx.fill();
    }
  }

  const landFillCanvas = tintMask(landMaskCanvas, options.fillColor);
  const outlineCanvas = buildOutlineCanvas(w, h, options.outlineColor);
  const landGlowCanvas = tintMask(landMaskCanvas, options.glowColor);
  const softFillGlowCanvas = buildSoftGlowCanvas(
    landMaskCanvas,
    options.glowColor,
  );

  ctx.globalAlpha = 0.52;
  ctx.filter = "blur(22px)";
  ctx.drawImage(landGlowCanvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 0.46;
  ctx.filter = "blur(10px)";
  ctx.drawImage(softFillGlowCanvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 0.2;
  ctx.filter = "blur(5px)";
  ctx.drawImage(outlineCanvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 0.58;
  ctx.drawImage(landFillCanvas, 0, 0);
  drawTerrainDetail(ctx, landMaskCanvas, w, h);
  ctx.globalAlpha = 0.72;
  ctx.drawImage(outlineCanvas, 0, 0);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
