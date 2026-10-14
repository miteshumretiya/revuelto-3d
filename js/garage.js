import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMechanic } from './mechanic.js';

/*
 * Isometric cut-away garage: a floor slab, four walls that hide themselves when the
 * camera is on their outer side, workshop props and a mechanic.
 * The car sits at the origin facing +Z (its left side is +X).
 */

export const HALF = 5.6;      // half the floor size, metres
const WALL_H = 3.2;
const WALL_T = 0.2;
const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/* ------------------------------------------------------------ textures */
function canvasTexture(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.userData.redraw = () => { draw(g, w, h); t.needsUpdate = true; };
  return t;
}
function mottle(g, w, h, n, size, colors) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = size * (0.4 + Math.random());
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, colors[i % colors.length]);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function speckle(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
  }
}
function hazard(g, x, y, w, h, stripe) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#d9a90f'; g.fillRect(x, y, w, h);
  g.fillStyle = '#1c1d20';
  for (let i = -h; i < w + h; i += stripe * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h); g.lineTo(x + i + stripe, y + h); g.lineTo(x + i + stripe + h, y); g.lineTo(x + i + h, y);
    g.closePath(); g.fill();
  }
  g.restore();
}
function setFont(g, size, weight = 800) {
  g.font = `${weight} ${size}px Archivo, system-ui, sans-serif`;
  if ('fontStretch' in g) g.fontStretch = 'expanded';
}

const floorTexture = () => canvasTexture(2048, 2048, (g, w) => {
  const ppm = w / (HALF * 2);
  const X = (x) => (x + HALF) * ppm;
  const Z = (z) => (z + HALF) * ppm;
  g.fillStyle = '#5c6168'; g.fillRect(0, 0, w, w);
  mottle(g, w, w, 260, 140, ['rgba(255,255,255,0.025)', 'rgba(0,0,0,0.04)']);
  speckle(g, w, w, 26000, 0.07);
  // saw-cut joints in the concrete
  g.strokeStyle = 'rgba(20,22,25,0.35)'; g.lineWidth = 2;
  for (let v = -HALF + 2.8; v < HALF; v += 2.8) {
    g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), w); g.stroke();
    g.beginPath(); g.moveTo(0, Z(v)); g.lineTo(w, Z(v)); g.stroke();
  }
  // service bay outline round the car
  g.strokeStyle = 'rgba(238,238,232,0.85)'; g.lineWidth = 0.09 * ppm;
  g.strokeRect(X(-1.75), Z(-3.05), 3.5 * ppm, 6.35 * ppm);
  // yellow walkway lines inside the walls
  g.strokeStyle = 'rgba(217,169,15,0.9)'; g.lineWidth = 0.07 * ppm;
  const inset = HALF - WALL_T - 0.55;
  g.strokeRect(X(-inset), Z(-inset), inset * 2 * ppm, inset * 2 * ppm);
  // hazard stripes in front of the roller door (west wall)
  hazard(g, X(-HALF + WALL_T), Z(-2.4), 0.7 * ppm, 3.8 * ppm, 0.22 * ppm);
  // floor drain behind the car
  g.fillStyle = '#2a2d31'; g.fillRect(X(-0.9), Z(-3.75), 1.8 * ppm, 0.16 * ppm);
  g.fillStyle = '#4a4f56';
  for (let i = 0; i < 30; i++) g.fillRect(X(-0.88 + i * 0.06), Z(-3.73), 0.025 * ppm, 0.12 * ppm);
  // an old oil stain near the bench
  const sx = X(-1.2), sy = Z(-4.3);
  const st = g.createRadialGradient(sx, sy, 0, sx, sy, 0.6 * ppm);
  st.addColorStop(0, 'rgba(20,18,16,0.35)'); st.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = st; g.fillRect(sx - 0.6 * ppm, sy - 0.6 * ppm, 1.2 * ppm, 1.2 * ppm);
});

const wallTexture = () => canvasTexture(1024, 300, (g, w, h) => {
  const ppm = h / WALL_H;
  g.fillStyle = '#4c5158'; g.fillRect(0, 0, w, h);
  mottle(g, w, h, 90, 60, ['rgba(255,255,255,0.03)', 'rgba(0,0,0,0.05)']);
  speckle(g, w, h, 6000, 0.08);
  const dado = h - 1.15 * ppm;
  g.fillStyle = '#2f3338'; g.fillRect(0, dado, w, h - dado);
  g.fillStyle = '#d9a90f'; g.fillRect(0, dado - 0.05 * ppm, w, 0.05 * ppm);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  for (let x = 0; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, dado - 0.05 * ppm); g.stroke(); }
}, { repeat: [1, 1] });

const pegboardTexture = () => canvasTexture(1040, 480, (g, w, h) => {
  g.fillStyle = '#3a3f46'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#23262b';
  for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); }
  const outline = (draw) => { g.save(); g.strokeStyle = 'rgba(235,235,230,0.75)'; g.lineWidth = 5; draw(true); g.restore(); draw(false); };
  // spanners, in a row of decreasing size
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 46, len = 230 - i * 18, y = 70;
    outline((o) => {
      g.fillStyle = '#b9bec5';
      const path = new Path2D();
      path.roundRect(x - 7, y, 14, len, 7);
      path.arc(x, y + 6, 17, 0, Math.PI * 2);
      path.arc(x, y + len - 6, 14, 0, Math.PI * 2);
      o ? g.stroke(path) : g.fill(path);
    });
  }
  // screwdrivers
  const handles = ['#c9302c', '#e0a400', '#c9302c', '#2c5a8c', '#e0a400'];
  for (let i = 0; i < 5; i++) {
    const x = 450 + i * 40, y = 60;
    outline((o) => {
      const p = new Path2D(); p.roundRect(x - 12, y, 24, 80, 10); p.rect(x - 3, y + 80, 6, 130);
      if (o) g.stroke(p); else { g.fillStyle = handles[i]; g.fill(new Path2D(`M${x - 12} ${y + 10} a12 12 0 0 1 24 0 v62 a8 8 0 0 1 -8 8 h-8 a8 8 0 0 1 -8 -8z`)); g.fillStyle = '#b9bec5'; g.fillRect(x - 3, y + 80, 6, 130); }
    });
  }
  // hammer
  outline((o) => {
    const p = new Path2D(); p.roundRect(700, 60, 120, 40, 8); p.roundRect(748, 100, 22, 190, 8);
    if (o) g.stroke(p); else { g.fillStyle = '#9aa0a8'; g.fillRect(700, 60, 120, 40); g.fillStyle = '#7a5434'; g.fillRect(748, 100, 22, 190); }
  });
  // pliers
  outline((o) => {
    const p = new Path2D('M880 60 l18 70 l-10 160 h18 l14 -150 l14 150 h18 l-10 -160 l18 -70 z');
    if (o) g.stroke(p); else { g.fillStyle = '#c9302c'; g.fill(p); }
  });
  // tape measure and a socket rail
  outline((o) => { const p = new Path2D(); p.roundRect(960, 70, 56, 56, 12); if (o) g.stroke(p); else { g.fillStyle = '#e0a400'; g.fill(p); } });
  g.fillStyle = '#9aa0a8'; g.fillRect(60, 380, 900, 14);
  for (let i = 0; i < 18; i++) { g.fillStyle = '#c3c8ce'; g.beginPath(); g.roundRect(70 + i * 49, 350, 30, 30 + (i % 3) * 6, 6); g.fill(); }
});

const signTexture = (text, sub) => canvasTexture(1024, 288, (g, w, h) => {
  g.fillStyle = '#1d1f23'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9a90f'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#eceef0'; setFont(g, 150, 860); g.textBaseline = 'middle';
  g.fillText(text, 70, sub ? 120 : h / 2 + 6, w - 140);
  if (sub) { setFont(g, 52, 600); g.fillStyle = '#a5abb3'; g.fillText(sub, 74, 220, w - 148); }
});

const rollerTexture = () => canvasTexture(512, 512, (g, w, h) => {
  for (let y = 0; y < h; y += 16) {
    const grd = g.createLinearGradient(0, y, 0, y + 16);
    grd.addColorStop(0, '#9aa1aa'); grd.addColorStop(0.5, '#7d848d'); grd.addColorStop(1, '#5f656d');
    g.fillStyle = grd; g.fillRect(0, y, w, 16);
  }
  speckle(g, w, h, 3000, 0.06);
  g.fillStyle = '#2a2d31'; g.fillRect(0, h - 22, w, 22);
  g.fillStyle = '#c3c8ce'; g.fillRect(w / 2 - 40, h - 60, 80, 12);
});

const cabinetFront = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h);
  const rows = [0, 0.13, 0.26, 0.39, 0.55, 0.75, 1];
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i] * h, y1 = rows[i + 1] * h;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y1 - 3, w, 3);
    g.fillStyle = '#d6dade'; g.fillRect(w * 0.12, y0 + 7, w * 0.76, 6);
  }
});

const laptopScreen = () => canvasTexture(256, 160, (g, w, h) => {
  g.fillStyle = '#0d1a2a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#4fc3f7'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= w; x += 8) g.lineTo(x, 100 - Math.sin(x / 18) * 26 - Math.random() * 6);
  g.stroke();
  g.fillStyle = '#4fc3f7'; for (let i = 0; i < 5; i++) g.fillRect(16, 16 + i * 10, 40 + Math.random() * 80, 4);
});

/* ------------------------------------------------------------ geometry helpers */
function std(color, roughness = 0.7, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function add(parent, geo, mat, x, y, z, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.s) m.scale.set(...o.s);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  m.userData.static = o.static ?? true;
  parent.add(m);
  return m;
}
const box = (p, w, h, d, mat, x, y, z, o) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
const cyl = (p, rt, rb, h, mat, x, y, z, o = {}) => add(p, new THREE.CylinderGeometry(rt, rb, h, o.seg || 24), mat, x, y, z, o);

/** Merge every static mesh under `group` into one mesh per material. */
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const byMat = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.userData.static) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, { geos: [], cast: false });
    const e = byMat.get(o.material);
    e.geos.push(geo);
    e.cast ||= o.castShadow;
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [mat, { geos, cast }] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
  }
}

/* ------------------------------------------------------------ garage */
export function createGarage(renderer) {
  const group = new THREE.Group();
  group.name = 'GARAGE';
  group.visible = false;

  const M = {
    slab: std(0x25282d, 0.9),
    cap: std(0x8c9198, 0.85),
    wallBack: std(0x2b2e33, 0.9),
    wall: std(0xffffff, 0.92, 0, { map: wallTexture() }),
    metal: std(0x9097a0, 0.35, 0.75),
    metalDark: std(0x30343a, 0.5, 0.5),
    red: std(0xb3261e, 0.38, 0.15),
    redFront: std(0xffffff, 0.38, 0.15, { map: cabinetFront() }),
    blue: std(0x2c5a8c, 0.45, 0.2),
    yellow: std(0xd9a90f, 0.5),
    orange: std(0xe0561c, 0.55),
    rubber: std(0x151619, 0.88),
    rim: std(0xa9afb6, 0.3, 0.85),
    wood: std(0x8a6a48, 0.75),
    card: std(0xa37d4f, 0.9),
    black: std(0x1b1c1f, 0.6),
    white: std(0xe9eaec, 0.6),
    peg: std(0xffffff, 0.8, 0, { map: pegboardTexture() }),
    roller: std(0xffffff, 0.5, 0.4, { map: rollerTexture() }),
    signBay: std(0xffffff, 0.6, 0, { map: signTexture('BAY 01', 'Service and detailing') }),
    signShop: std(0xffffff, 0.6, 0, { map: signTexture('WORKSHOP') }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf4f7ff, emissiveIntensity: 2.6 }),
    window: new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x9fb3c8, emissiveIntensity: 0.55, roughness: 0.1 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, emissiveMap: laptopScreen() }),
  };
  // redraw text once the web font has arrived
  document.fonts?.ready.then(() => { M.signBay.map.userData.redraw(); M.signShop.map.userData.redraw(); });

  /* ---- floor slab ---- */
  const base = new THREE.Group();
  group.add(base);
  box(base, HALF * 2, 0.34, HALF * 2, M.slab, 0, -0.2, 0, { cast: false }); // top sits 3 cm under the floor plane
  const floor = add(base, new THREE.PlaneGeometry(HALF * 2, HALF * 2), std(0xffffff, 0.5, 0, { map: floorTexture(), envMapIntensity: 0.9 }), 0, 0, 0, { rx: -Math.PI / 2, cast: false });
  floor.userData.static = false;

  /* ---- walls: local frame has +Z pointing into the room, X along the wall ---- */
  const walls = [];
  function makeWall(id, ry, len) {
    const g = new THREE.Group();
    g.name = 'WALL_' + id;
    g.rotation.y = ry;
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    g.position.copy(n.clone().multiplyScalar(-(HALF - WALL_T)));
    box(g, len, WALL_H, WALL_T, M.wallBack, 0, WALL_H / 2, -WALL_T / 2);
    box(g, len, 0.02, WALL_T + 0.002, M.cap, 0, WALL_H + 0.01, -WALL_T / 2, { cast: false });
    const face = add(g, new THREE.PlaneGeometry(len, WALL_H), M.wall, 0, WALL_H / 2, 0.003, { cast: false });
    face.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * (len / (HALF * 2)); });
    // a strip light high on every wall
    box(g, len * 0.55, 0.06, 0.08, M.metalDark, 0, WALL_H - 0.28, 0.06);
    box(g, len * 0.53, 0.025, 0.05, M.lamp, 0, WALL_H - 0.315, 0.07, { cast: false });
    group.add(g);
    walls.push({ group: g, normal: n, point: g.position.clone(), scale: 0 });
    return g;
  }
  const innerLen = HALF * 2 - WALL_T * 2;
  const north = makeWall('N', 0, HALF * 2);            // behind the car (z = -HALF)
  const west = makeWall('W', Math.PI / 2, innerLen);   // car's right side (x = -HALF)
  const east = makeWall('E', -Math.PI / 2, innerLen);  // car's left side (x = +HALF)
  const south = makeWall('S', Math.PI, HALF * 2);      // in front of the car (z = +HALF)

  // In each wall's local frame, +X runs: N -> world +X, W -> world -Z, E -> world +Z, S -> world -X.

  const tire = (p, x, y, z, o = {}) => {
    const t = new THREE.Group();
    t.position.set(x, y, z);
    if (o.rx) t.rotation.x = o.rx;
    if (o.ry) t.rotation.y = o.ry;
    p.add(t);
    add(t, new THREE.TorusGeometry(0.3, 0.115, 14, 36), M.rubber, 0, 0, 0);
    cyl(t, 0.2, 0.2, 0.16, M.rim, 0, 0, 0, { rx: Math.PI / 2 });
    return t;
  };

  /* north wall: workbench, pegboard, tool cabinet, tyre stack, sign */
  {
    const g = north;
    // bench
    box(g, 2.6, 0.06, 0.75, M.wood, -0.4, 0.93, 0.4);
    for (const x of [-1.6, 0.8]) for (const z of [0.1, 0.7]) box(g, 0.06, 0.9, 0.06, M.metalDark, x, 0.45, z);
    box(g, 2.5, 0.03, 0.62, M.metalDark, -0.4, 0.2, 0.4);
    box(g, 0.6, 0.6, 0.66, M.red, 0.45, 0.6, 0.4);
    box(g, 0.56, 0.02, 0.02, M.metal, 0.45, 0.75, 0.735, { cast: false });
    box(g, 0.56, 0.02, 0.02, M.metal, 0.45, 0.55, 0.735, { cast: false });
    // vice
    box(g, 0.22, 0.12, 0.2, M.blue, -1.35, 1.02, 0.6);
    box(g, 0.08, 0.06, 0.18, M.metal, -1.35, 1.1, 0.74, { rx: Math.PI / 2 });
    // small toolbox and a diagnostics laptop on the bench
    box(g, 0.5, 0.22, 0.24, M.red, -0.75, 1.07, 0.35);
    box(g, 0.36, 0.02, 0.26, M.metalDark, 0.0, 0.97, 0.5, { ry: -0.25 });
    box(g, 0.36, 0.24, 0.015, M.metalDark, 0.03, 1.08, 0.37, { rx: -0.25, ry: -0.25 });
    add(g, new THREE.PlaneGeometry(0.32, 0.2), M.screen, 0.033, 1.085, 0.381, { rx: -0.25, ry: -0.25, cast: false });
    // pegboard and shelf
    add(g, new THREE.PlaneGeometry(2.6, 1.2), M.peg, -0.4, 1.75, 0.02, { cast: false });
    box(g, 2.7, 0.04, 0.3, M.metalDark, -0.4, 2.62, 0.15);
    const cans = [M.red, M.blue, M.yellow, M.white, M.red, M.card];
    for (let i = 0; i < 6; i++) {
      if (i % 3 === 2) box(g, 0.32, 0.26, 0.24, M.card, -1.5 + i * 0.42, 2.77, 0.15);
      else cyl(g, 0.08, 0.08, 0.18, cans[i], -1.5 + i * 0.42, 2.73, 0.15, { seg: 16 });
    }
    // roller tool cabinet (the mechanic's drawer lives here)
    const cab = new THREE.Group();
    cab.position.set(2.35, 0, 0.3);
    g.add(cab);
    box(cab, 1.15, 0.95, 0.5, M.red, 0, 0.6, 0);
    add(cab, new THREE.PlaneGeometry(1.1, 0.9), M.redFront, 0, 0.6, 0.252, { cast: false });
    box(cab, 1.0, 0.42, 0.42, M.red, 0, 1.29, -0.02);
    box(cab, 1.04, 0.04, 0.46, M.metalDark, 0, 1.52, -0.02);
    for (const x of [-0.5, 0.5]) for (const z of [-0.18, 0.18]) cyl(cab, 0.05, 0.05, 0.04, M.black, x, 0.06, z, { rz: Math.PI / 2, seg: 12 });
    const drawer = box(cab, 1.02, 0.11, 0.44, M.red, 0, 0.92, 0.03, { static: false, cast: false });
    box(drawer, 0.8, 0.02, 0.02, M.metal, 0, 0, 0.23, { static: false, cast: false });
    // tyre stack in the corner
    for (let i = 0; i < 4; i++) tire(g, -3.2, 0.115 + i * 0.23, 0.55, { rx: Math.PI / 2 });
    // sign
    add(g, new THREE.PlaneGeometry(1.7, 0.48), M.signBay, -3.4, 2.35, 0.02, { cast: false });
    north.userData.drawer = drawer;
  }

  /* west wall (car's right): roller door, shelving, sign */
  {
    const g = west;
    add(g, new THREE.PlaneGeometry(3.4, 2.75), M.roller, 0.6, 1.375, 0.015, { cast: false });
    box(g, 0.14, 2.9, 0.16, M.metalDark, 0.6 - 1.77, 1.45, 0.08);
    box(g, 0.14, 2.9, 0.16, M.metalDark, 0.6 + 1.77, 1.45, 0.08);
    cyl(g, 0.17, 0.17, 3.7, M.metalDark, 0.6, 2.95, 0.16, { rz: Math.PI / 2 });
    add(g, new THREE.PlaneGeometry(1.5, 0.42), M.signShop, -2.6, 2.45, 0.02, { cast: false });
    // shelving unit near the back corner
    const sx = 3.55, sz = 0.28;
    for (const dx of [-0.78, 0.78]) for (const dz of [-0.24, 0.24]) box(g, 0.04, 2.1, 0.04, M.metal, sx + dx, 1.05, sz + dz);
    for (let i = 0; i < 4; i++) {
      const y = 0.18 + i * 0.6;
      box(g, 1.62, 0.03, 0.52, M.metalDark, sx, y, sz);
      if (i < 3) {
        box(g, 0.5, 0.32, 0.4, M.card, sx - 0.45, y + 0.17, sz);
        box(g, 0.36, 0.22, 0.36, M.card, sx + 0.1, y + 0.12, sz);
        for (let k = 0; k < 3; k++) cyl(g, 0.055, 0.055, 0.24, [M.red, M.blue, M.yellow][(i + k) % 3], sx + 0.45 + k * 0.12, y + 0.135, sz, { seg: 12 });
      }
    }
    // drums near the front corner
    cyl(g, 0.29, 0.29, 0.88, M.blue, -4.1, 0.44, 0.45);
    cyl(g, 0.29, 0.29, 0.88, M.red, -4.15, 0.44, 1.12);
    for (const [z, y] of [[0.45, 0.885], [1.12, 0.885]]) add(g, new THREE.TorusGeometry(0.28, 0.02, 6, 28), M.metalDark, -4.1, y, z, { rx: Math.PI / 2 });
  }

  /* east wall (car's left): tyre rack, compressor, hose reel, extinguisher */
  {
    const g = east;
    box(g, 2.0, 0.05, 0.4, M.metalDark, 1.6, 1.62, 0.22);
    box(g, 2.0, 0.04, 0.04, M.metal, 1.6, 2.25, 0.42);
    for (let i = 0; i < 6; i++) tire(g, 0.85 + i * 0.3, 1.99, 0.3, { ry: Math.PI / 2 });
    // compressor: blue tank on feet with a motor on top
    const cx = -3.3;
    cyl(g, 0.24, 0.24, 1.1, M.blue, cx, 0.42, 0.45, { rz: Math.PI / 2 });
    for (const d of [-0.42, 0.42]) box(g, 0.06, 0.2, 0.36, M.metalDark, cx + d, 0.1, 0.45);
    box(g, 0.42, 0.3, 0.3, M.metalDark, cx - 0.1, 0.8, 0.45);
    cyl(g, 0.13, 0.13, 0.08, M.metal, cx + 0.25, 0.75, 0.45, { rx: Math.PI / 2 });
    // hose reel and extinguisher
    add(g, new THREE.TorusGeometry(0.22, 0.07, 10, 28), M.yellow, -1.9, 1.6, 0.09);
    cyl(g, 0.1, 0.1, 0.1, M.metalDark, -1.9, 1.6, 0.05, { rx: Math.PI / 2 });
    cyl(g, 0.09, 0.09, 0.5, M.red, -0.9, 0.62, 0.14);
    cyl(g, 0.04, 0.05, 0.1, M.black, -0.9, 0.92, 0.14);
  }

  /* south wall (in front of the car): office door, windows, clock */
  {
    const g = south;
    box(g, 1.0, 2.15, 0.06, M.metalDark, 3.0, 1.075, 0.04);
    add(g, new THREE.PlaneGeometry(0.42, 0.5), M.window, 3.0, 1.55, 0.075, { cast: false });
    box(g, 0.14, 0.04, 0.04, M.metal, 2.65, 1.0, 0.09, { cast: false });
    add(g, new THREE.PlaneGeometry(3.4, 1.1), M.window, -2.2, 1.85, 0.012, { cast: false });
    for (let i = 0; i <= 4; i++) box(g, 0.05, 1.14, 0.06, M.metalDark, -2.2 - 1.7 + i * 0.85, 1.85, 0.03);
    box(g, 3.5, 0.06, 0.08, M.metalDark, -2.2, 1.28, 0.04);
    box(g, 3.5, 0.06, 0.08, M.metalDark, -2.2, 2.42, 0.04);
    cyl(g, 0.22, 0.22, 0.04, M.white, 0.6, 2.45, 0.03, { rx: Math.PI / 2 });
    box(g, 0.015, 0.15, 0.01, M.black, 0.6, 2.5, 0.055, { cast: false });
    box(g, 0.1, 0.015, 0.01, M.black, 0.64, 2.45, 0.055, { cast: false });
  }

  /* free-standing props on the floor */
  const props = new THREE.Group();
  group.add(props);
  {
    // trolley jack by the front-left wheel
    const j = new THREE.Group();
    j.position.set(1.85, 0, 2.15);
    j.rotation.y = -0.5;
    props.add(j);
    box(j, 0.34, 0.12, 0.75, M.red, 0, 0.1, 0);
    for (const x of [-0.15, 0.15]) for (const z of [-0.3, 0.3]) cyl(j, 0.045, 0.045, 0.04, M.black, x, 0.045, z, { rz: Math.PI / 2, seg: 12 });
    cyl(j, 0.08, 0.08, 0.05, M.metal, 0, 0.19, -0.3, { seg: 16 });
    cyl(j, 0.018, 0.018, 1.1, M.metalDark, 0, 0.42, 0.72, { rx: 0.95 });
    // spare wheel lying next to the mechanic
    tire(props, 2.45, 0.115, -0.45, { rx: Math.PI / 2 });
    // cones in the front-right corner
    for (const [x, z] of [[4.35, 4.25], [3.75, 4.6]]) {
      cyl(props, 0.03, 0.17, 0.5, M.orange, x, 0.29, z, { seg: 18 });
      box(props, 0.4, 0.04, 0.4, M.orange, x, 0.02, z);
      cyl(props, 0.105, 0.135, 0.07, M.white, x, 0.26, z, { seg: 18 });
    }
    // creeper board tucked by the right-hand side of the car
    box(props, 0.45, 0.05, 1.0, M.blue, -1.85, 0.11, 0.9);
    for (const z of [-0.4, 0.4]) for (const x of [-0.18, 0.18]) cyl(props, 0.035, 0.035, 0.04, M.black, -1.85 + x, 0.04, 0.9 + z, { rz: Math.PI / 2, seg: 10 });
  }

  for (const w of walls) mergeStatic(w.group);
  mergeStatic(props);

  /* ---- mechanic ---- */
  const drawer = north.userData.drawer;
  const mechanic = createMechanic({
    work: new THREE.Vector3(1.66, 0, -1.39),
    via: new THREE.Vector3(2.15, 0, -2.75),
    cabinet: new THREE.Vector3(2.35, 0, -4.32),
    onDrawer: (v) => { drawer.position.z = 0.03 + v * 0.32; },
  });
  group.add(mechanic.group);

  /* ---- environment map for reflections inside the garage ---- */
  function buildEnvMap() {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 4, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x33373d, side: THREE.BackSide }));
    room.position.y = 2;
    env.add(room);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x575c63 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = 0.01;
    env.add(fl);
    const panel = (w, h, power, pos, rot, tint = [1, 1, 1]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint).multiplyScalar(power), side: THREE.DoubleSide }));
      m.position.set(...pos); m.rotation.set(...rot); env.add(m);
    };
    for (const x of [-2.2, 0, 2.2]) panel(0.35, 8, 10, [x, 3.9, 0], [Math.PI / 2, 0, 0]);   // ceiling strip lights
    panel(3.4, 2.7, 2.2, [-HALF + 0.05, 1.4, 0.6], [0, Math.PI / 2, 0], [0.86, 0.92, 1]);  // daylight through the roller door
    panel(3.4, 1.1, 1.5, [-2.2, 1.85, HALF - 0.05], [0, Math.PI, 0], [0.86, 0.92, 1]);     // windows
    for (const [x, z, ry] of [[0, -HALF + 0.1, 0], [0, HALF - 0.1, Math.PI], [-HALF + 0.1, 0, Math.PI / 2], [HALF - 0.1, 0, -Math.PI / 2]]) {
      panel(5.5, 0.06, 6, [x, WALL_H - 0.3, z], [0, ry, 0]);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    return tex;
  }
  const envMap = buildEnvMap();

  /* ---- show / hide / update ---- */
  let build = 1;
  let instant = false;
  function show(skipAnimation = false) {
    group.visible = true;
    instant = skipAnimation;
    build = skipAnimation ? 1 : 0;
  }
  function hide() { group.visible = false; }

  const toCam = new THREE.Vector3();
  function update(dt, camera) {
    if (!group.visible) return false;
    const building = build < 1;
    build = Math.min(1, build + dt / 1.2);
    // walls rise one after another, then the props pop in
    walls.forEach((w, i) => {
      const k = instant ? 1 : clamp01((build - i * 0.08) / 0.55);
      w.group.scale.y = Math.max(0.001, k >= 1 ? 1 : easeOutBack(k));
      toCam.copy(camera.position).sub(w.point);
      w.group.visible = toCam.dot(w.normal) > 0;
    });
    const pk = instant ? 1 : clamp01((build - 0.35) / 0.5);
    const ps = Math.max(0.001, pk >= 1 ? 1 : easeOutBack(pk));
    props.scale.setScalar(ps);
    mechanic.group.scale.setScalar(ps);
    mechanic.update(dt);
    return building;
  }

  return { group, envMap, show, hide, update, mechanic, walls };
}
