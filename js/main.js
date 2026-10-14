import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const MODEL_URL = 'models/revuelto.glb';
const MODEL_BYTES = 5_289_624; // fallback for progress when Content-Length is missing
const SNAP = new URLSearchParams(location.search).has('snap'); // test mode: no easing, for screenshots
const reduceMotion = SNAP || matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, SNAP ? 1 : 1 - Math.exp(-k * dt));
const ease = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ options */
const PAINTS = [
  { id: 'ember', name: 'Ember Red', hex: '#a3160b', metal: 0.5 },
  { id: 'signal', name: 'Signal Yellow', hex: '#e0a400', metal: 0.35 },
  { id: 'lime', name: 'Lime Green', hex: '#5a9a10', metal: 0.4 },
  { id: 'orange', name: 'Burnt Orange', hex: '#cf4209', metal: 0.45 },
  { id: 'blue', name: 'Deep Blue', hex: '#103b96', metal: 0.6 },
  { id: 'violet', name: 'Violet', hex: '#47207a', metal: 0.6 },
  { id: 'grey', name: 'Titanium Grey', hex: '#5a5e65', metal: 0.7 },
  { id: 'white', name: 'Pearl White', hex: '#e6e5e0', metal: 0.08 },
  { id: 'black', name: 'Gloss Black', hex: '#0a0a0b', metal: 0.3 },
];
const FINISHES = [{ id: 'gloss', name: 'Gloss' }, { id: 'matte', name: 'Matte' }];
const RIMS = [
  { id: 'black', name: 'Gloss black', hex: '#0c0c0d', rough: 0.28 },
  { id: 'gunmetal', name: 'Gunmetal', hex: '#3d4045', rough: 0.35 },
  { id: 'silver', name: 'Silver', hex: '#b8bbbf', rough: 0.22 },
  { id: 'bronze', name: 'Bronze', hex: '#6a4d24', rough: 0.32 },
];
const CALIPERS = [
  { id: 'black', name: 'Black', hex: '#111112' },
  { id: 'red', name: 'Red', hex: '#b0130b' },
  { id: 'yellow', name: 'Yellow', hex: '#dfa600' },
  { id: 'green', name: 'Green', hex: '#4c8a14' },
  { id: 'blue', name: 'Blue', hex: '#1b4cae' },
  { id: 'orange', name: 'Orange', hex: '#d0460a' },
];
const INTERIORS = [
  { id: 'black', name: 'Black', leather: '#0d0d0e', suede: '#070707', stitch: '#404044' },
  { id: 'red', name: 'Red', leather: '#5c0c08', suede: '#120707', stitch: '#b4231a' },
  { id: 'tan', name: 'Tan', leather: '#6b4123', suede: '#14100d', stitch: '#c48f57' },
  { id: 'white', name: 'Ice white', leather: '#cfcac1', suede: '#0f0f10', stitch: '#ddd9d1' },
  { id: 'navy', name: 'Navy', leather: '#101c36', suede: '#08090c', stitch: '#5172b0' },
];
const DEFAULT_SPEC = { paint: 'ember', finish: 'gloss', rims: 'black', calipers: 'black', interior: 'black' };
const OPTION_SETS = { paint: PAINTS, finish: FINISHES, rims: RIMS, calipers: CALIPERS, interior: INTERIORS };
const spec = { ...DEFAULT_SPEC };
const find = (key, id) => OPTION_SETS[key].find((o) => o.id === id) || OPTION_SETS[key][0];

function readSpecFromHash() {
  const m = location.hash.match(/spec=([^&]+)/);
  if (!m) return false;
  for (const pair of decodeURIComponent(m[1]).split(',')) {
    const [k, v] = pair.split(':');
    if (OPTION_SETS[k] && OPTION_SETS[k].some((o) => o.id === v)) spec[k] = v;
  }
  return true;
}
const startInConfigurator = readSpecFromHash();

/* ------------------------------------------------------------------ renderer */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 700);
camera.position.set(6, 1.4, 8);
const lookTarget = V(0, 0.6, 0);

const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.7;

/* ----------------------------------------------- studio environment (reflections) */
function buildEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.BackSide }));
  room.position.y = 7.9;
  env.add(room);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x2e3238 }));
  ground.rotation.x = -Math.PI / 2;
  env.add(ground);
  const panel = (w, h, power, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };
  panel(5, 12, 4.5, [0, 9, 0], [Math.PI / 2, 0, 0]);          // overhead softbox
  panel(0.5, 22, 9, [-2.6, 8.8, 0], [Math.PI / 2, 0, 0]);       // overhead strips
  panel(0.5, 22, 9, [2.6, 8.8, 0], [Math.PI / 2, 0, 0]);
  panel(26, 0.9, 6, [-12, 3.2, 0], [0, Math.PI / 2, 0]);        // long side strips
  panel(26, 0.9, 6, [12, 3.2, 0], [0, -Math.PI / 2, 0]);
  panel(10, 3, 2.2, [0, 3, 16], [0, Math.PI, 0]);               // front and rear fill
  panel(10, 3, 1.6, [0, 3, -16], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = buildEnvironment();

/* ------------------------------------------------------------------ canvas textures */
function radialTexture(stops, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Studio floor: a pool of light that fades into the page background
const studioFloor = new THREE.Mesh(
  new THREE.CircleGeometry(15, 96),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(50,54,61,1)'], [0.32, 'rgba(41,44,50,0.95)'], [0.62, 'rgba(30,33,37,0.55)'], [1, 'rgba(24,26,30,0)']]),
    transparent: true, depthWrite: false, toneMapped: false,
  })
);
studioFloor.rotation.x = -Math.PI / 2;
studioFloor.renderOrder = -2;
scene.add(studioFloor);

/* ------------------------------------------------------------------ drive world */
const FOG_COLOR = 0x16181c;
const driveWorld = new THREE.Group();
driveWorld.visible = false;
scene.add(driveWorld);
function buildDriveWorld() {
  const SIZE = 420;
  // fine asphalt grain
  const n = document.createElement('canvas');
  n.width = n.height = 256;
  const ng = n.getContext('2d');
  ng.fillStyle = '#2b2d31';
  ng.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 30 + Math.random() * 40;
    ng.fillStyle = `rgba(${v},${v + 2},${v + 5},${Math.random() * 0.6})`;
    ng.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  const grain = new THREE.CanvasTexture(n);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(SIZE / 3, SIZE / 3);
  grain.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: grain, color: 0x9a9da3, roughness: 0.92, metalness: 0, envMapIntensity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  driveWorld.add(ground);

  // painted markings: runway, skid pad, start grid
  const m = document.createElement('canvas');
  m.width = m.height = 2048;
  const g = m.getContext('2d');
  const px = 2048 / SIZE; // pixels per metre
  const X = (x) => 1024 + x * px;
  const Z = (z) => 1024 - z * px;
  g.strokeStyle = 'rgba(235,235,230,0.85)';
  g.fillStyle = 'rgba(235,235,230,0.85)';
  g.lineWidth = 0.18 * px;
  // runway edges and dashed centre line
  for (const x of [-7, 7]) { g.beginPath(); g.moveTo(X(x), Z(-12)); g.lineTo(X(x), Z(190)); g.stroke(); }
  g.setLineDash([3 * px, 4 * px]);
  g.beginPath(); g.moveTo(X(0), Z(-12)); g.lineTo(X(0), Z(190)); g.stroke();
  g.setLineDash([]);
  // start grid boxes
  for (let i = 0; i < 4; i++) { g.strokeRect(X(-3.6 + (i % 2) * 4.2), Z(10 - i * 2.2 * 1.5), 3 * px, 1.2 * px); }
  // skid pad
  g.lineWidth = 0.22 * px;
  for (const r of [26, 34]) { g.beginPath(); g.arc(X(-70), Z(80), r * px, 0, Math.PI * 2); g.stroke(); }
  // big loop
  g.setLineDash([2 * px, 2 * px]);
  g.beginPath(); g.ellipse(X(0), Z(70), 140 * px, 115 * px, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  const marks = new THREE.CanvasTexture(m);
  marks.colorSpace = THREE.SRGBColorSpace;
  marks.anisotropy = 8;
  const markings = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: marks, transparent: true, roughness: 0.8, envMapIntensity: 0.4, depthWrite: false }));
  markings.rotation.x = -Math.PI / 2;
  markings.position.y = 0.005;
  driveWorld.add(markings);

  // cones: slalom down the runway and a ring round the skid pad
  const pos = [];
  for (let i = 0; i < 12; i++) pos.push([i % 2 ? 2.2 : -2.2, 40 + i * 11]);
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pos.push([-70 + Math.cos(a) * 30, 80 + Math.sin(a) * 30]); }
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0xe0561c, roughness: 0.55 }), pos.length);
  const mtx = new THREE.Matrix4();
  pos.forEach(([x, z], i) => { mtx.makeTranslation(x, 0.25, z); cone.setMatrixAt(i, mtx); });
  driveWorld.add(cone);
  // sky dome in the fog colour so the horizon dissolves (tone-mapped the same way as the fog)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 12), new THREE.MeshBasicMaterial({ color: FOG_COLOR, side: THREE.BackSide, depthWrite: false }));
  driveWorld.add(sky);
}
buildDriveWorld();

/* ------------------------------------------------------------------ car */
const car = new THREE.Group();
scene.add(car);

// soft contact shadow that travels with the car
const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.92)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']], 256);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, 0.006, 0.1);
shadow.renderOrder = -1;
car.add(shadow);
const shadowCore = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 5.0), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
shadowCore.rotation.x = -Math.PI / 2;
shadowCore.position.set(0, 0.008, 0.1);
shadowCore.renderOrder = -1;
car.add(shadowCore);

// headlight beams for drive mode (always present, so toggling never recompiles shaders)
const beams = [];
for (const x of [0.62, -0.62]) {
  const s = new THREE.SpotLight(0xf2f5ff, 0, 70, 0.5, 0.55, 1.4);
  s.position.set(x, 0.55, 2.2);
  s.target.position.set(x * 1.4, 0, 14);
  car.add(s, s.target);
  beams.push(s);
}

const mats = {};       // shared, editable materials
const parts = {};      // pivots for moving panels
const wheels = [];
const xrayMeshes = [];
const partState = {
  doors: { cur: 0, target: 0 },
  hood: { cur: 0, target: 0 },
  engine: { cur: 0, target: 0 },
  lights: { cur: 0, target: 0 },
};
const userParts = { doors: 0, hood: 0, engine: 0, lights: 0 }; // configurator toggles

function setupCar(root) {
  car.add(root);
  const byName = (n) => root.getObjectByName(n);

  // --- materials ---
  mats.paint = new THREE.MeshPhysicalMaterial({ color: 0xa3160b, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.25 });
  mats.rim = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, metalness: 1, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.08 });
  mats.caliper = new THREE.MeshPhysicalMaterial({ color: 0x111112, metalness: 0.2, roughness: 0.35, clearcoat: 0.8 });
  const glassBase = { metalness: 0, roughness: 0.04, transparent: true, depthWrite: false, envMapIntensity: 1.6 };
  mats.glassClear = new THREE.MeshPhysicalMaterial({ ...glassBase, color: 0x0b0d10, opacity: 0.28 });
  mats.glassSide = new THREE.MeshPhysicalMaterial({ ...glassBase, color: 0x07080a, opacity: 0.5 });
  mats.glassDark = new THREE.MeshPhysicalMaterial({ ...glassBase, color: 0x050607, opacity: 0.88 });
  mats.glassRed = new THREE.MeshPhysicalMaterial({ ...glassBase, color: 0x8a0303, opacity: 0.78 });
  mats.xray = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xbfd4ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor * (0.04 + f * 0.9), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      const n = m.name;
      if (n === 'car_paint_v3_03' || n === 'M_CarPaint') return mats.paint;
      if (n === 'M_WheelRim') return mats.rim;
      if (n === 'M_Caliper') return mats.caliper;
      if (n === 'M_GlassClear') return mats.glassClear;
      if (n === 'M_GlassSide') return mats.glassSide;
      if (n === 'M_GlassDark') return mats.glassDark;
      if (n === 'M_GlassRed') return mats.glassRed;
      if (!seen.has(m)) {
        seen.set(m, true);
        if (n === 'M_Leather') mats.leather = m;
        if (n === 'M_Alcantara') mats.suede = m;
        if (n === 'M_Stitch') mats.stitch = m;
        if (n === 'M_Screen') { mats.screen = m; m.emissive = new THREE.Color(0x0f1c2c); m.emissiveIntensity = 0; }
        if (n === 'M_Emitter' || n === 'HeadLights') { (mats.head ||= []).push(m); m.color.set(0x1d1f23); m.emissive = new THREE.Color(0xeef3ff); m.emissiveIntensity = 0; m.toneMapped = false; }
        if (n === 'Emission Red') { mats.tail = m; m.color.set(0x330303); m.emissive = new THREE.Color(0xff1a0d); m.emissiveIntensity = 0; }
        if (m.vertexColors) m.vertexColors = false;
      }
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.frustumCulled = true;
  });

  // --- moving panels: re-parent each group under a pivot at its hinge ---
  const pivot = (name, hinge) => {
    const obj = byName(name);
    if (!obj) return null;
    const p = new THREE.Group();
    p.position.copy(hinge);
    obj.parent.add(p);
    p.add(obj);
    obj.position.sub(hinge);
    return p;
  };
  parts.doorL = pivot('DOOR_L', V(0.9, 0.62, 1.0));
  parts.doorR = pivot('DOOR_R', V(-0.9, 0.62, 1.0));
  parts.hood = pivot('HOOD', V(0, 0.79, 1.41));
  parts.engine = pivot('ENGINE_COVER', V(0, 1.06, -0.53));

  // --- wheels: add a spin node between the steering control and the wheel ---
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const ctrl = byName('CTRL_Wheel_' + k);
    const wheel = byName('Wheel_' + k);
    if (!ctrl || !wheel) continue;
    const spin = new THREE.Group();
    ctrl.add(spin);
    spin.add(wheel);
    wheels.push({ ctrl, spin, front: k[0] === 'F' });
  }

  // --- x-ray shell: everything that is bodywork, glass and lights ---
  for (const g of ['BODY', 'DOOR_L', 'DOOR_R', 'HOOD', 'ENGINE_COVER', 'LIGHTS_F', 'LIGHTS_R']) {
    byName(g)?.traverse((o) => { if (o.isMesh) xrayMeshes.push(o); });
  }
  applySpec();
}

function applyPartsToScene(dt) {
  const k = reduceMotion ? 20 : 3.2;
  for (const s of Object.values(partState)) s.cur = damp(s.cur, s.target, k, dt);
  const d = ease(clamp(partState.doors.cur, 0, 1));
  if (parts.doorL) { parts.doorL.rotation.set(d * 1.12, 0, -d * 0.1); }
  if (parts.doorR) { parts.doorR.rotation.set(d * 1.12, 0, d * 0.1); }
  const h = ease(clamp(partState.hood.cur, 0, 1));
  if (parts.hood) parts.hood.rotation.x = -h * 0.82;
  const e = ease(clamp(partState.engine.cur, 0, 1));
  if (parts.engine) parts.engine.rotation.x = e * 0.95;
  const l = clamp(partState.lights.cur, 0, 1);
  for (const m of mats.head || []) m.emissiveIntensity = l * 3.2;
  if (mats.tail) mats.tail.emissiveIntensity = 0.25 + l * 3.0;
  if (mats.screen) mats.screen.emissiveIntensity = l * 1.6;
  const beamOn = mode === 'drive' ? l : 0;
  for (const b of beams) b.intensity = beamOn * 380;
}

let xrayOn = false;
function setXray(on) {
  xrayOn = on;
  for (const m of xrayMeshes) {
    if (on) { m.userData.orig ||= m.material; m.material = mats.xray; }
    else if (m.userData.orig) m.material = m.userData.orig;
  }
  shadow.visible = shadowCore.visible = !on;
  $('#xrayBtn').setAttribute('aria-pressed', String(on));
}

/* ------------------------------------------------------------------ spec / accent */
function applySpec() {
  const p = find('paint', spec.paint);
  const matte = spec.finish === 'matte';
  if (mats.paint) {
    mats.paint.color.set(p.hex);
    mats.paint.metalness = matte ? Math.min(0.35, p.metal) : p.metal;
    mats.paint.roughness = matte ? 0.62 : 0.3;
    mats.paint.clearcoat = matte ? 0 : 1;
    mats.paint.envMapIntensity = matte ? 0.9 : 1.25;
    const r = find('rims', spec.rims);
    mats.rim.color.set(r.hex);
    mats.rim.roughness = r.rough;
    mats.caliper.color.set(find('calipers', spec.calipers).hex);
    const it = find('interior', spec.interior);
    mats.leather?.color.set(it.leather);
    mats.suede?.color.set(it.suede);
    mats.stitch?.color.set(it.stitch);
  }
  // UI accent follows the paint, with a readable fallback for very dark or very light paints
  const c = new THREE.Color(p.hex);
  const hsl = {}; c.getHSL(hsl);
  const accent = hsl.s < 0.25 ? '#c9ced6' : p.hex;
  document.documentElement.style.setProperty('--accent', accent);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  document.documentElement.style.setProperty('--accent-ink', hsl.s < 0.25 || lum > 0.3 ? '#121417' : '#ffffff');
  renderSpecUI();
}

/* ------------------------------------------------------------------ configurator UI */
function buildRadioGroup(container, key, options, kind) {
  container.setAttribute('role', 'radiogroup');
  container.innerHTML = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.key = key;
    b.dataset.id = o.id;
    if (kind === 'swatch') {
      b.className = 'swatch';
      b.style.setProperty('--c', o.leather || o.hex);
      b.setAttribute('aria-label', o.name);
      b.title = o.name;
    } else {
      b.textContent = o.name;
    }
    b.addEventListener('click', () => { spec[key] = o.id; applySpec(); });
    container.appendChild(b);
  }
  // arrow-key navigation inside the group
  container.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === spec[key]);
    const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    spec[key] = options[n].id;
    applySpec();
    container.querySelector(`[data-id="${options[n].id}"]`).focus();
  });
}
buildRadioGroup($('#paintSwatches'), 'paint', PAINTS, 'swatch');
buildRadioGroup($('#finishSeg'), 'finish', FINISHES, 'text');
buildRadioGroup($('#rimSwatches'), 'rims', RIMS, 'swatch');
buildRadioGroup($('#caliperSwatches'), 'calipers', CALIPERS, 'swatch');
buildRadioGroup($('#interiorSwatches'), 'interior', INTERIORS, 'swatch');

const TOGGLES = [
  { key: 'doors', label: 'Doors' },
  { key: 'hood', label: 'Bonnet' },
  { key: 'engine', label: 'Engine cover' },
  { key: 'lights', label: 'Lights' },
];
for (const wrap of $$('[data-toggles]')) {
  for (const t of TOGGLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle';
    b.dataset.part = t.key;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span>${t.label}</span><i aria-hidden="true"></i>`;
    b.addEventListener('click', () => { userParts[t.key] = userParts[t.key] ? 0 : 1; syncPartsFromUser(); });
    wrap.appendChild(b);
  }
}
function syncPartsFromUser() {
  for (const k of Object.keys(userParts)) partState[k].target = userParts[k];
  for (const b of $$('.toggle')) b.setAttribute('aria-pressed', String(!!userParts[b.dataset.part]));
}

function renderSpecUI() {
  for (const b of $$('[role="radio"]')) {
    const on = spec[b.dataset.key] === b.dataset.id;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $('#paintName').textContent = find('paint', spec.paint).name;
  $('#rimName').textContent = find('rims', spec.rims).name;
  $('#caliperName').textContent = find('calipers', spec.calipers).name;
  $('#interiorName').textContent = find('interior', spec.interior).name;
  const rows = [
    ['Paint', `${find('paint', spec.paint).name}, ${find('finish', spec.finish).name.toLowerCase()}`],
    ['Wheels', find('rims', spec.rims).name],
    ['Calipers', find('calipers', spec.calipers).name],
    ['Interior', find('interior', spec.interior).name],
  ];
  $('#specList').innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
}
function specHash() {
  return '#spec=' + Object.keys(DEFAULT_SPEC).map((k) => `${k}:${spec[k]}`).join(',');
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.textContent = ''), 3200);
}
$('#copyLink').addEventListener('click', async () => {
  const url = location.origin + location.pathname + specHash();
  history.replaceState(null, '', specHash());
  try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone who opens it sees this spec.'); }
  catch { toast('Copy failed. The link is now in your address bar.'); }
});
$('#resetSpec').addEventListener('click', () => {
  Object.assign(spec, DEFAULT_SPEC);
  applySpec();
  history.replaceState(null, '', location.pathname);
  toast('Spec reset to the default.');
});

/* ------------------------------------------------------------------ framing helpers */
const view = { shiftX: 0, shiftY: 0, tShiftX: 0, tShiftY: 0 };
const isPortrait = () => innerWidth / innerHeight < 1;
const baseFov = () => 30;
// wide-angle lens for the cockpit and the chase cam, wider still on tall phone screens
const wideFov = () => (innerWidth / innerHeight < 1 ? 72 : 56);
const isNarrow = () => innerWidth <= 760;
function fitScale(strength = 1) {
  const a = innerWidth / innerHeight;
  return a < 1.25 ? Math.min(2.6, lerp(1, 1.25 / a, strength)) : 1;
}
function scaled(pos, target, s) {
  return target.clone().add(pos.clone().sub(target).multiplyScalar(s));
}
function applyViewOffset() {
  const w = innerWidth, h = innerHeight;
  camera.setViewOffset(w, h, -view.shiftX * w, view.shiftY * h, w, h);
}

/* ------------------------------------------------------------------ tour keyframes */
// Car faces +Z. Its left side is +X.
const TOUR = [
  { pos: V(5.4, 1.05, 7.6), target: V(0.1, 0.62, 0.3), shift: [0, -0.05], lights: 1 },                 // hero
  { pos: V(10.6, 0.95, 0.4), target: V(0, 0.56, 0.0), shift: [0.2, 0], lights: 0 },                   // silhouette
  { pos: V(-2.9, 0.78, 6.4), target: V(-0.25, 0.48, 1.9), shift: [-0.16, 0], lights: 1 },              // lights
  { pos: V(6.5, 3.3, 5.7), target: V(0.25, 0.85, 0.0), shift: [0.19, 0], doors: 1 },                  // doors
  { pos: V(3.7, 2.6, -1.3), target: V(0.2, 0.68, 0.4), shift: [-0.17, 0], doors: 1, lights: 1, close: true }, // cockpit
  { pos: V(-3.6, 3.7, -5.9), target: V(0, 0.82, -1.15), shift: [0.15, 0], engine: 1 },               // engine
  { pos: V(-7.4, 1.2, -8.3), target: V(0, 0.72, -0.2), shift: [0, 0.2], lights: 1 },                // numbers
  { pos: V(6.8, 5.4, 6.6), target: V(0, 0.35, 0.1), shift: [0.17, 0], lights: 1 },                    // end
];
let tourCurve = null;
let tourTargets = [];
function buildTourCurve() {
  // On narrow screens there is no room beside the car for text, so aim closer to the car's centre
  const narrow = isNarrow();
  const centre = V(0, 0.55, 0.1);
  tourTargets = TOUR.map((k) => (narrow ? k.target.clone().lerp(centre, 0.55) : k.target));
  const pts = TOUR.map((k, i) => {
    const s = k.close && !narrow ? Math.min(1.5, fitScale(0.7)) : fitScale(0.85);
    return scaled(k.pos.clone().add(tourTargets[i]).sub(k.target), tourTargets[i], s);
  });
  tourCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}
const tourTmp = { pos: V(0, 0, 0), target: V(0, 0, 0) };
function tourPose() {
  const max = TOUR.length - 1;
  const p = clamp(scrollY / innerHeight, 0, max);
  const i = Math.min(Math.floor(p), max - 1);
  const f = p - i;
  const t = ease(clamp((f - 0.12) / 0.76, 0, 1)); // rest at each keyframe while its text is read
  tourCurve.getPoint((i + t) / max, tourTmp.pos);
  tourTmp.target.lerpVectors(tourTargets[i], tourTargets[i + 1], t);
  const a = TOUR[i], b = TOUR[i + 1];
  for (const key of ['doors', 'hood', 'engine', 'lights']) partState[key].target = lerp(a[key] || 0, b[key] || 0, t);
  if (isNarrow()) { view.tShiftX = 0; view.tShiftY = lerp(i === 0 ? 0.02 : 0.14, 0.14, i === 0 ? t : 1); }
  else { view.tShiftX = lerp(a.shift[0], b.shift[0], t); view.tShiftY = lerp(a.shift[1], b.shift[1], t); }
  // hero title fades as the tour starts
  const ht = $('#heroTitle');
  const o = clamp(1 - p * 1.6, 0, 1);
  ht.style.opacity = loaded ? o : 0;
  ht.style.transform = `translate(-50%, calc(-50% - ${p * 60}px))`;
  return tourTmp;
}

/* ------------------------------------------------------------------ camera flights */
let flight = null;
function flyTo(pos, target, dur = 1.4, done, fov = baseFov()) {
  flight = { fromPos: camera.position.clone(), fromTarget: lookTarget.clone(), toPos: pos.clone(), toTarget: target.clone(), fromFov: camera.fov, toFov: fov, t: 0, dur: reduceMotion ? 0.01 : dur, done };
  controls.enabled = false;
}
function stepFlight(dt) {
  if (!flight) return false;
  flight.t = Math.min(1, flight.t + dt / flight.dur);
  const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
  camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
  // lift the path a little so the camera arcs over the car instead of cutting through it
  camera.position.y += Math.sin(e * Math.PI) * 0.6 * flight.fromPos.distanceTo(flight.toPos) / 8;
  lookTarget.lerpVectors(flight.fromTarget, flight.toTarget, e);
  camera.fov = lerp(flight.fromFov, flight.toFov, e);
  camera.lookAt(lookTarget);
  if (flight.t >= 1) { const d = flight.done; flight = null; d && d(); }
  return true;
}

function orbitMode({ target, minD = 3.4, maxD = 16, inside = false }) {
  controls.target.copy(target);
  controls.minDistance = inside ? 0.04 : minD;
  controls.maxDistance = inside ? 0.04 : maxD * fitScale(0.9);
  controls.maxPolarAngle = inside ? Math.PI * 0.85 : 1.5;
  controls.minPolarAngle = inside ? 0.25 : 0.15;
  controls.rotateSpeed = inside ? -0.35 : 0.7;
  controls.enableZoom = !inside;
  controls.enabled = true;
  controls.update();
}

/* ------------------------------------------------------------------ explore */
const SPOTS = [
  {
    id: 'engine', label: 'V12 engine', pos: V(0, 1.1, -1.25), normal: V(0, 1, -0.35),
    cam: V(-2.6, 3.2, -4.6), target: V(0, 0.82, -1.2), open: { engine: 1 },
    title: 'A 6.5-litre V12, no turbos',
    text: 'The naturally aspirated V12 sits behind the cabin under a carbon engine cover. Its eight-speed dual-clutch gearbox is mounted crosswise behind it, with an electric motor on top.',
    fact: '825 CV at 9,250 rpm, 1,015 CV with the motors',
  },
  {
    id: 'doors', label: 'Scissor doors', pos: V(1.02, 0.62, 0.35), normal: V(1, 0.1, 0),
    cam: V(5.0, 2.3, 3.6), target: V(0.4, 0.9, 0.2), open: { doors: 1 },
    title: 'Doors that lift, not swing',
    text: 'Each door hinges at its front edge and rotates straight up. The opening stays inside the car\'s width, which helps in tight spaces.',
    fact: 'A V12 Lamborghini signature since the Countach',
  },
  {
    id: 'brakes', label: 'Brakes', pos: V(1.0, 0.34, 1.39), normal: V(1, 0, 0.25),
    cam: V(3.1, 0.62, 2.9), target: V(0.85, 0.36, 1.39),
    title: 'Carbon-ceramic brakes',
    text: 'Drilled carbon-ceramic discs sit behind the forged wheels, gripped by large calipers. You can change the caliper colour in the configurator.',
    fact: 'Stops from 350+ km/h, lap after lap',
  },
  {
    id: 'cockpit', label: 'Cockpit', pos: V(0.3, 1.02, 0.25), normal: V(0, 1, 0.3), inside: true,
    title: 'Behind the wheel',
    text: 'A digital cluster, a central touchscreen and a passenger display. The drive-mode and hybrid-mode dials sit on the steering wheel. Drag to look around.',
    fact: 'Three screens, one for the passenger',
  },
  {
    id: 'lights', label: 'Light signature', pos: V(0.72, 0.52, 2.22), normal: V(0.35, 0, 1),
    cam: V(2.4, 0.85, 5.8), target: V(0.25, 0.45, 2.0), open: { lights: 1 },
    title: 'The Y signature',
    text: 'Slim LED units draw a Y across the front. The shape repeats at the rear and in the hexagon patterns across the body.',
    fact: 'Same Y shape front and rear',
  },
  {
    id: 'wing', label: 'Rear wing', pos: V(0, 0.92, -2.12), normal: V(0, 0.5, -1),
    cam: V(-3.0, 1.8, -6.2), target: V(0, 0.68, -1.9), open: { lights: 1 },
    title: 'An active rear wing',
    text: 'The rear wing sits flush at low speed and changes position with speed and driving mode, trading drag for downforce when it counts.',
    fact: 'Moves with speed and mode',
  },
  {
    id: 'front', label: 'Front axle', pos: V(0, 0.8, 1.95), normal: V(0, 1, 0.45),
    cam: V(3.4, 2.9, 5.2), target: V(0, 0.5, 1.8), open: { hood: 1 },
    title: 'Electric front axle',
    text: 'Two electric motors drive the front wheels. They give all-wheel drive and torque vectoring, and in the city mode the car runs on electricity alone.',
    fact: 'Up to 10 km on electricity (WLTP)',
  },
];
const hotspotWrap = $('#hotspots');
for (const s of SPOTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hotspot';
  b.innerHTML = `<span>${s.label}</span>`;
  b.setAttribute('aria-label', s.label);
  b.addEventListener('click', () => openSpot(SPOTS.indexOf(s)));
  hotspotWrap.appendChild(b);
  s.el = b;
}
let activeSpot = -1;
let inside = false;
const OVERVIEW = { pos: V(6.2, 2.3, 7.4), target: V(0, 0.55, 0.05) };
const INSIDE = { pos: V(0.36, 0.98, -0.08), target: V(0.35, 0.86, 0.6) };

function exploreOverview() {
  activeSpot = -1;
  setInside(false, false);
  for (const k of Object.keys(partState)) partState[k].target = 0;
  $('#infoCard').hidden = true;
  updateHotspotClasses();
  const s = fitScale(0.62);
  flyTo(scaled(OVERVIEW.pos, OVERVIEW.target, s), OVERVIEW.target, 1.3, () => orbitMode({ target: OVERVIEW.target }));
}
function openSpot(i) {
  activeSpot = (i + SPOTS.length) % SPOTS.length;
  const s = SPOTS[activeSpot];
  for (const k of Object.keys(partState)) partState[k].target = (s.open && s.open[k]) || 0;
  $('#infoTitle').textContent = s.title;
  $('#infoText').textContent = s.text;
  $('#infoFact').textContent = s.fact;
  $('#infoCard').hidden = false;
  updateHotspotClasses();
  if (s.inside) { setInside(true); return; }
  setInside(false, false);
  flyTo(scaled(s.cam, s.target, fitScale(0.6)), s.target, 1.3, () => orbitMode({ target: s.target, minD: 1.4 }));
}
function setInside(on, fly = true) {
  inside = on;
  $('#insideBtn').setAttribute('aria-pressed', String(on));
  camera.near = on ? 0.01 : 0.05;
  camera.updateProjectionMatrix();
  if (on) {
    const dir = INSIDE.target.clone().sub(INSIDE.pos).normalize();
    const t = INSIDE.pos.clone().add(dir.multiplyScalar(0.04));
    flyTo(INSIDE.pos, t, 1.5, () => orbitMode({ target: t, inside: true }), wideFov());
    partState.lights.target = 1;
  } else if (fly && mode === 'explore') {
    exploreOverview();
  }
}
function updateHotspotClasses() {
  SPOTS.forEach((s, i) => s.el.classList.toggle('is-active', i === activeSpot));
}
$('#prevSpot').addEventListener('click', () => openSpot(activeSpot - 1));
$('#nextSpot').addEventListener('click', () => openSpot(activeSpot + 1));
$('#overviewBtn').addEventListener('click', () => exploreOverview());
$('#xrayBtn').addEventListener('click', () => setXray(!xrayOn));
$('#insideBtn').addEventListener('click', () => {
  if (inside) { exploreOverview(); return; }
  openSpot(SPOTS.findIndex((s) => s.id === 'cockpit'));
});

const projV = V(0, 0, 0);
const toCam = V(0, 0, 0);
function updateHotspots() {
  if (mode !== 'explore') return;
  const w = innerWidth, h = innerHeight;
  for (const s of SPOTS) {
    projV.copy(s.pos);
    toCam.copy(camera.position).sub(s.pos).normalize();
    const facing = toCam.dot(s.normal.clone().normalize()) > 0.05;
    projV.project(camera);
    const hidden = inside || !facing || projV.z > 1;
    s.el.classList.toggle('is-hidden', hidden);
    s.el.tabIndex = hidden ? -1 : 0;
    s.el.style.transform = `translate(${(projV.x * 0.5 + 0.5) * w}px, ${(-projV.y * 0.5 + 0.5) * h}px)`;
  }
}

/* ------------------------------------------------------------------ drive */
const drive = { x: 0, z: 0, heading: 0, speed: 0, steer: 0, spin: 0, cam: 0, shownSpeed: 0 };
const keys = { up: false, down: false, left: false, right: false, brake: false };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake' };
addEventListener('keydown', (e) => {
  if (mode !== 'drive') return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyC' && !e.repeat) cycleDriveCam();
  if (e.code === 'KeyL' && !e.repeat) toggleDriveLights();
  if (e.code === 'KeyR' && !e.repeat) resetDrive();
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
addEventListener('blur', () => Object.keys(keys).forEach((k) => (keys[k] = false)));
for (const pad of $$('.pad')) {
  const k = pad.dataset.key;
  const on = (e) => { e.preventDefault(); keys[k] = true; pad.classList.add('is-down'); pad.setPointerCapture?.(e.pointerId); };
  const off = () => { keys[k] = false; pad.classList.remove('is-down'); };
  pad.addEventListener('pointerdown', on);
  pad.addEventListener('pointerup', off);
  pad.addEventListener('pointercancel', off);
  pad.addEventListener('lostpointercapture', off);
}
const CAMS = ['Chase', 'Far', 'Cockpit'];
function cycleDriveCam() { drive.cam = (drive.cam + 1) % CAMS.length; $('#camBtn').textContent = `Camera: ${CAMS[drive.cam]}`; }
function toggleDriveLights() {
  userParts.lights = userParts.lights ? 0 : 1;
  partState.lights.target = userParts.lights;
  $('#driveLightsBtn').setAttribute('aria-pressed', String(!!userParts.lights));
  syncPartsFromUser();
}
function resetDrive() { Object.assign(drive, { x: 0, z: 0, heading: 0, speed: 0, steer: 0 }); }
$('#camBtn').addEventListener('click', cycleDriveCam);
$('#driveLightsBtn').addEventListener('click', toggleDriveLights);
$('#resetCarBtn').addEventListener('click', resetDrive);

const WHEEL_R = 0.342;
const WHEELBASE = 2.78;
const chaseTmp = { pos: V(0, 0, 0), look: V(0, 0, 0) };
function stepDrive(dt) {
  const fwd = keys.up ? 1 : 0;
  const back = keys.down ? 1 : 0;
  const MAX = 95, ACC = 13, BRAKE = 28, REV = 9;
  if (fwd) drive.speed += (drive.speed < 0 ? BRAKE : ACC * (1 - drive.speed / (MAX * 1.05))) * dt;
  if (back) drive.speed -= (drive.speed > 0.5 ? BRAKE : 6) * dt;
  if (keys.brake) drive.speed = damp(drive.speed, 0, 3.5, dt);
  if (!fwd && !back) drive.speed = damp(drive.speed, 0, 0.35, dt);
  drive.speed = clamp(drive.speed, -REV, MAX);
  const maxSteer = 0.55 / (1 + Math.abs(drive.speed) / 22);
  const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  drive.steer = damp(drive.steer, steerIn * maxSteer, 7, dt);
  drive.heading += (drive.speed * Math.tan(drive.steer) / WHEELBASE) * dt;
  drive.x += Math.sin(drive.heading) * drive.speed * dt;
  drive.z += Math.cos(drive.heading) * drive.speed * dt;
  const LIM = 200;
  if (Math.abs(drive.x) > LIM || Math.abs(drive.z - 60) > LIM) {
    drive.x = clamp(drive.x, -LIM, LIM);
    drive.z = clamp(drive.z, 60 - LIM, 60 + LIM);
    drive.speed *= 0.3;
  }
  car.position.set(drive.x, 0, drive.z);
  car.rotation.y = drive.heading;
  drive.spin += (drive.speed / WHEEL_R) * dt;
  for (const w of wheels) {
    w.spin.rotation.x = drive.spin;
    w.ctrl.rotation.y = w.front ? drive.steer * 1.4 : 0;
  }
  // camera
  const f = V(Math.sin(drive.heading), 0, Math.cos(drive.heading));
  const sp = Math.abs(drive.speed);
  if (drive.cam === 2) {
    chaseTmp.pos.set(0.36, 0.98, -0.1).applyAxisAngle(V(0, 1, 0), drive.heading).add(car.position);
    camera.position.copy(chaseTmp.pos);
    chaseTmp.look.copy(chaseTmp.pos).addScaledVector(f, 10).setY(0.75);
    lookTarget.copy(chaseTmp.look);
    camera.near = 0.01;
  } else {
    camera.near = 0.05;
    const far = drive.cam === 1;
    const back = (far ? 10.5 : 7.2) * (isPortrait() ? 1.15 : 1) + sp * 0.025;
    const up = far ? 3.6 : 1.9;
    chaseTmp.pos.copy(car.position).addScaledVector(f, -back).setY(up);
    camera.position.x = damp(camera.position.x, chaseTmp.pos.x, 5, dt);
    camera.position.z = damp(camera.position.z, chaseTmp.pos.z, 5, dt);
    camera.position.y = damp(camera.position.y, chaseTmp.pos.y, 5, dt);
    chaseTmp.look.copy(car.position).addScaledVector(f, 3).setY(0.7);
    lookTarget.lerp(chaseTmp.look, 1 - Math.exp(-8 * dt));
  }
  const driveFov = (drive.cam === 2 ? wideFov() : isPortrait() ? 50 : 34) + Math.min(14, sp * 0.16);
  camera.fov = damp(camera.fov, driveFov, 2, dt);
  camera.updateProjectionMatrix();
  camera.lookAt(lookTarget);
  // HUD
  drive.shownSpeed = damp(drive.shownSpeed, Math.abs(drive.speed) * 3.6, 10, dt);
  $('#speed').textContent = Math.round(drive.shownSpeed);
  $('#speedBar').style.width = `${clamp(drive.shownSpeed / 350, 0, 1) * 100}%`;
}

/* ------------------------------------------------------------------ modes */
let mode = 'tour';
let tourScroll = 0;
function setMode(next, { instant = false } = {}) {
  if (next === mode && !instant) return;
  const prev = mode;
  if (prev === 'tour') tourScroll = scrollY;
  mode = next;
  document.body.dataset.mode = next;
  for (const b of $$('[data-mode-btn]')) b.setAttribute('aria-pressed', String(b.dataset.modeBtn === next));
  controls.enabled = false;
  flight = null;
  if (xrayOn) setXray(false);
  if (inside) { inside = false; $('#insideBtn').setAttribute('aria-pressed', 'false'); }
  camera.near = 0.05;
  camera.fov = 30;
  camera.updateProjectionMatrix();
  // leaving drive: park the car back in the studio
  if (prev === 'drive') {
    resetDrive();
    car.position.set(0, 0, 0);
    car.rotation.set(0, 0, 0);
    for (const w of wheels) { w.ctrl.rotation.y = 0; }
  }
  studioFloor.visible = next !== 'drive';
  driveWorld.visible = next === 'drive';
  scene.fog = next === 'drive' ? new THREE.Fog(FOG_COLOR, 25, 170) : null;

  if (next === 'tour') {
    view.tShiftX = view.tShiftY = 0;
    requestAnimationFrame(() => scrollTo({ top: tourScroll, behavior: 'instant' }));
  } else if (next === 'configure') {
    syncPartsFromUser();
    const t = V(0, 0.55, 0.05);
    const p = scaled(V(6.4, 2.0, 7.2), t, fitScale(0.68));
    flyTo(p, t, instant ? 0.01 : 1.4, () => orbitMode({ target: t }));
  } else if (next === 'explore') {
    exploreOverview();
  } else if (next === 'drive') {
    for (const k of ['doors', 'hood', 'engine']) partState[k].target = 0;
    partState.lights.target = userParts.lights;
    $('#driveLightsBtn').setAttribute('aria-pressed', String(!!userParts.lights));
    $('#camBtn').textContent = `Camera: ${CAMS[drive.cam]}`;
    resetDrive();
    camera.position.set(0, 1.9, -7.2);
    lookTarget.set(0, 0.7, 3);
  }
  updateFrameShift();
}
function updateFrameShift() {
  if (mode === 'configure') {
    view.tShiftX = isNarrow() ? 0 : -(372 + 32) / 2 / innerWidth;
    view.tShiftY = isNarrow() ? 0.25 : 0;
  } else if (mode === 'explore') {
    view.tShiftX = isNarrow() ? 0 : 0.1;
    view.tShiftY = isNarrow() ? 0.12 : 0;
  } else if (mode === 'drive') {
    view.tShiftX = 0; view.tShiftY = 0;
  }
}
for (const b of $$('[data-mode-btn]')) b.addEventListener('click', () => setMode(b.dataset.modeBtn));
for (const b of $$('[data-go]')) b.addEventListener('click', (e) => {
  e.preventDefault();
  const go = b.dataset.go;
  if (go === 'tour') { setMode('tour'); tourScroll = 0; scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' }); return; }
  setMode(go);
});

/* ------------------------------------------------------------------ resize */
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  applyViewOffset();
  camera.updateProjectionMatrix();
  buildTourCurve();
  updateFrameShift();
}
addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ loop */
let loaded = false;
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (loaded) {
    if (mode === 'tour') {
      const pose = tourPose();
      const k = reduceMotion ? 30 : 5;
      camera.position.x = damp(camera.position.x, pose.pos.x, k, dt);
      camera.position.y = damp(camera.position.y, pose.pos.y, k, dt);
      camera.position.z = damp(camera.position.z, pose.pos.z, k, dt);
      lookTarget.x = damp(lookTarget.x, pose.target.x, k, dt);
      lookTarget.y = damp(lookTarget.y, pose.target.y, k, dt);
      lookTarget.z = damp(lookTarget.z, pose.target.z, k, dt);
      camera.lookAt(lookTarget);
      // the wheels creep forward as you scroll, as if the car were rolling in
      const roll = (scrollY / innerHeight) * 2.2;
      for (const w of wheels) w.spin.rotation.x = roll;
    } else if (mode === 'drive') {
      stepDrive(dt);
    } else if (!stepFlight(dt)) {
      controls.update();
      lookTarget.copy(controls.target);
    }
    applyPartsToScene(dt);
    updateHotspots();
  }
  view.shiftX = damp(view.shiftX, view.tShiftX, 4, dt);
  view.shiftY = damp(view.shiftY, view.tShiftY, 4, dt);
  applyViewOffset();
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ load */
function checkWebGL() {
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
}
const loaderText = $('#loaderText');
const loaderBar = $('#loaderBar');
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
try {
  checkWebGL();
  gltfLoader.load(
    MODEL_URL,
    (gltf) => {
      setupCar(gltf.scene);
      // compile shaders before the first visible frame
      renderer.compile(scene, camera);
      loaded = true;
      loaderBar.style.width = '100%';
      loaderText.textContent = 'Ready';
      if (startInConfigurator) setMode('configure', { instant: true });
      else {
        const pose = tourPose();
        camera.position.copy(pose.pos).add(V(1.5, 0.6, 2.5));
        lookTarget.copy(pose.target);
      }
      setTimeout(() => document.body.classList.remove('is-loading'), 250);
    },
    (e) => {
      const total = e.lengthComputable && e.total ? e.total : MODEL_BYTES;
      const pct = clamp(e.loaded / total, 0, 1);
      loaderBar.style.width = `${(pct * 96).toFixed(1)}%`;
      loaderText.textContent = `Loading the car, ${(e.loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
    },
    (err) => {
      console.error(err);
      loaderText.textContent = 'The 3D model did not load. Check your connection and refresh the page.';
    }
  );
} catch (err) {
  loaderText.textContent = 'Your browser has WebGL turned off, so the 3D car cannot be shown. Try a recent Chrome, Edge, Safari or Firefox.';
}
applySpec();
requestAnimationFrame(frame);

// test hook, only with ?snap
if (SNAP) window.__revuelto = { mats, scene, setMode, partState, camera, lookTarget, spec, applySpec, openSpot, setXray, keys, drive };
