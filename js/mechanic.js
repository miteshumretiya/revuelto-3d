import * as THREE from 'three';

/*
 * A stylised mechanic built from primitives, animated procedurally.
 * The figure faces +Z; its left side is +X. Units are metres.
 * Routine (looped): kneel at the left-rear wheel with an impact wrench,
 * stand, walk to the tool cabinet, open a drawer and look for a tool, walk back.
 */

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Poses: joint -> [x, y, z] rotation in radians. Missing joints are 0.
const STAND = {
  pelvisY: 0.95,
  elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0],
  shoulderL: [0.04, 0, -0.06], shoulderR: [0.04, 0, 0.06],
};
const KNEEL = {
  pelvisY: 0.585, pelvisZ: -0.05,
  hipL: [-1.42, 0, 0.06], kneeL: [1.42, 0, 0], ankleL: [0.02, 0, 0],
  hipR: [0.12, 0, -0.04], kneeR: [1.55, 0, 0], ankleR: [-0.75, 0, 0],
  spine: [0.42, 0, 0], neck: [0.28, 0, 0],
  shoulderR: [-1.12, 0.1, 0.12], elbowR: [-0.62, 0, 0],
  shoulderL: [-0.62, 0, -0.22], elbowL: [-1.05, 0, 0],
};
const REACH = {
  pelvisY: 0.92,
  hipL: [-0.12, 0, 0], kneeL: [0.22, 0, 0], hipR: [-0.12, 0, 0], kneeR: [0.22, 0, 0],
  spine: [0.32, 0, 0], neck: [0.32, 0, 0],
  shoulderL: [-0.95, 0, -0.12], elbowL: [-0.65, 0, 0],
  shoulderR: [-1.05, 0, 0.12], elbowR: [-0.55, 0, 0],
};
const JOINTS = ['spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

function blend(a, b, w, out) {
  out.pelvisY = (a.pelvisY ?? 0.95) + ((b.pelvisY ?? 0.95) - (a.pelvisY ?? 0.95)) * w;
  out.pelvisZ = (a.pelvisZ ?? 0) + ((b.pelvisZ ?? 0) - (a.pelvisZ ?? 0)) * w;
  for (const j of JOINTS) {
    const p = a[j] || [0, 0, 0], q = b[j] || [0, 0, 0];
    out[j] = [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w];
  }
  return out;
}

export function createMechanic({ work, cabinet, via, onDrawer = () => {} }) {
  const root = new THREE.Group();
  root.name = 'MECHANIC';
  const mat = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const M = {
    overall: mat(0x22406b, 0.85),
    overallDark: mat(0x18304f, 0.85),
    stripe: mat(0xd9dde2, 0.4),
    shirt: mat(0x8b949e, 0.9),
    skin: mat(0xc28a62, 0.7),
    glove: mat(0x26282c, 0.75),
    boot: mat(0x1a1b1e, 0.6),
    cap: mat(0x22406b, 0.75),
    toolBody: mat(0xe0a400, 0.45),
    toolDark: mat(0x1d1f23, 0.4, 0.4),
  };
  const J = {};
  const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const joint = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    J[name] = g;
    return g;
  };

  const pelvis = joint('pelvis', root, 0, 0.95, 0);
  mesh(new THREE.SphereGeometry(1, 20, 14), M.overall, pelvis, 0, 0, 0).scale.set(0.19, 0.12, 0.135);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 22), M.overallDark, pelvis, 0, 0.07, 0).scale.set(1.08, 1, 0.8);

  const spine = joint('spine', pelvis, 0, 0.08, 0);
  mesh(new THREE.CapsuleGeometry(0.16, 0.28, 6, 18), M.overall, spine, 0, 0.27, 0).scale.set(1.12, 1, 0.8);
  mesh(new THREE.BoxGeometry(0.15, 0.1, 0.02), M.overallDark, spine, 0.045, 0.4, 0.125);        // bib pocket
  mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), M.stripe, spine, 0, 0.19, -0.13);              // reflective band (back)
  mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), M.stripe, spine, 0, 0.19, 0.13);               // reflective band (front)
  mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.07, 16), M.shirt, spine, 0, 0.575, 0);       // collar

  const neck = joint('neck', spine, 0, 0.6, 0);
  mesh(new THREE.SphereGeometry(0.104, 22, 16), M.skin, neck, 0, 0.11, 0.005).scale.set(0.94, 1.08, 1);
  mesh(new THREE.SphereGeometry(0.113, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.cap, neck, 0, 0.145, -0.004);
  mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), M.cap, neck, 0, 0.15, 0.045).scale.set(1, 1, 1.25);

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = joint('shoulder' + side, spine, sx * 0.2, 0.5, 0);
    mesh(new THREE.SphereGeometry(0.068, 16, 12), M.overall, sh);
    mesh(new THREE.CapsuleGeometry(0.052, 0.19, 4, 12), M.shirt, sh, 0, -0.14, 0);
    const el = joint('elbow' + side, sh, 0, -0.29, 0);
    mesh(new THREE.CapsuleGeometry(0.046, 0.17, 4, 12), M.skin, el, 0, -0.12, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.255, 0);
    el.add(hand);
    J['hand' + side] = hand;
    mesh(new THREE.SphereGeometry(0.052, 14, 10), M.glove, hand).scale.set(0.9, 1.2, 0.8);

    const hip = joint('hip' + side, pelvis, sx * 0.095, -0.03, 0);
    mesh(new THREE.CapsuleGeometry(0.077, 0.27, 4, 14), M.overall, hip, 0, -0.21, 0);
    const knee = joint('knee' + side, hip, 0, -0.43, 0);
    mesh(new THREE.CapsuleGeometry(0.066, 0.29, 4, 14), M.overall, knee, 0, -0.2, 0);
    mesh(new THREE.BoxGeometry(0.15, 0.025, 0.02), M.stripe, knee, 0, -0.27, 0.06);           // reflective cuff
    const ankle = joint('ankle' + side, knee, 0, -0.42, 0);
    const boot = mesh(new THREE.CapsuleGeometry(0.052, 0.16, 4, 12), M.boot, ankle, 0, -0.04, 0.045);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.1, 1, 0.82);
  }

  // impact wrench in the right hand
  const tool = new THREE.Group();
  J.handR.add(tool);
  tool.position.set(0, -0.04, 0.03);
  const barrel = mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.17, 16), M.toolBody, tool, 0, 0, 0.06);
  barrel.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 12), M.toolDark, tool, 0, 0, 0.17);
  nose.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.035, 0.11, 0.045), M.toolDark, tool, 0, -0.05, 0.01);

  // soft contact shadow
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sg = sc.getContext('2d');
  const grd = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.004;
  root.add(blob);

  /* ---------------- routine ---------------- */
  const SPEED = 1.15;
  const pathLen = (pts) => pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
  const toCab = [work, via, cabinet];
  const toWork = [cabinet, via, work];
  const FACE_WHEEL = -Math.PI / 2; // facing -X, toward the car's left-rear wheel
  const FACE_CAB = Math.PI;        // facing -Z, toward the back wall
  const SEQ = [
    { kind: 'work', dur: 7.5, face: FACE_WHEEL, at: work },
    { kind: 'rise', dur: 0.9, face: FACE_WHEEL, at: work },
    { kind: 'walk', path: toCab, dur: pathLen(toCab) / SPEED + 0.6 },
    { kind: 'turn', dur: 0.45, face: FACE_CAB, at: cabinet },
    { kind: 'reach', dur: 4.4, face: FACE_CAB, at: cabinet },
    { kind: 'walk', path: toWork, dur: pathLen(toWork) / SPEED + 0.6 },
    { kind: 'turn', dur: 0.5, face: FACE_WHEEL, at: work },
    { kind: 'crouch', dur: 0.95, face: FACE_WHEEL, at: work },
  ];
  const TOTAL = SEQ.reduce((s, x) => s + x.dur, 0);
  let t = 0;
  let heading = FACE_WHEEL;
  let stride = 0;
  const pose = {};
  const pos = new THREE.Vector3().copy(work);
  const tmp = new THREE.Vector3();

  function pointOnPath(pts, s) {
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      if (s <= seg || i === pts.length - 1) {
        const f = clamp01(s / seg);
        tmp.lerpVectors(pts[i - 1], pts[i], f);
        return { p: tmp, dir: Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) };
      }
      s -= seg;
    }
    return { p: tmp.copy(pts[pts.length - 1]), dir: 0 };
  }

  function applyPose(p) {
    J.pelvis.position.y = p.pelvisY;
    J.pelvis.position.z = p.pelvisZ || 0;
    for (const j of JOINTS) J[j].rotation.set(p[j][0], p[j][1], p[j][2]);
  }

  function update(dt) {
    t = (t + dt) % TOTAL;
    let s = t;
    let i = 0;
    while (s > SEQ[i].dur) { s -= SEQ[i].dur; i++; }
    const step = SEQ[i];
    const f = s / step.dur;
    let face = step.face;
    let drawer = 0;

    if (step.kind === 'work') {
      blend(KNEEL, KNEEL, 0, pose);
      // short bursts with the impact wrench, then a pause to check the nut
      const cycle = s % 2.5;
      const burst = cycle < 0.9;
      if (burst) {
        pose.shoulderR[0] += Math.sin(s * 70) * 0.012;
        pose.elbowR[2] = Math.sin(s * 55) * 0.02;
      } else {
        const k = Math.sin(((cycle - 0.9) / 1.6) * Math.PI);
        pose.shoulderR[0] += k * 0.18;
        pose.neck[1] = k * 0.18;
      }
      pose.spine[0] += Math.sin(s * 1.3) * 0.02;
    } else if (step.kind === 'rise') {
      blend(KNEEL, STAND, ease(f), pose);
    } else if (step.kind === 'crouch') {
      blend(STAND, KNEEL, ease(f), pose);
    } else if (step.kind === 'turn') {
      blend(STAND, STAND, 0, pose);
    } else if (step.kind === 'reach') {
      const w = ease(clamp01(f / 0.12)) * ease(clamp01((1 - f) / 0.12));
      blend(STAND, REACH, w, pose);
      // rummaging in the drawer
      pose.shoulderL[0] += Math.sin(s * 4.2) * 0.08 * w;
      pose.shoulderR[0] += Math.cos(s * 3.6) * 0.08 * w;
      pose.neck[1] = Math.sin(s * 1.1) * 0.15 * w;
      drawer = ease(clamp01((s - 0.35) / 0.55)) * ease(clamp01((step.dur - 0.4 - s) / 0.55));
    } else if (step.kind === 'walk') {
      const L = pathLen(step.path);
      // ease in and out over the whole walk so the legs slow down at each end
      const d = L * (0.5 - 0.5 * Math.cos(Math.PI * clamp01(f)));
      const { p, dir } = pointOnPath(step.path, d);
      const prev = pos.clone();
      pos.copy(p);
      const moved = prev.distanceTo(pos);
      stride += moved * (Math.PI * 2 / 1.3);
      face = dir;
      const amp = clamp01(moved / Math.max(dt, 1e-4) / SPEED);
      blend(STAND, STAND, 0, pose);
      const ph = stride;
      pose.hipL[0] = -Math.sin(ph) * 0.5 * amp;
      pose.hipR[0] = Math.sin(ph) * 0.5 * amp;
      pose.kneeL[0] = (0.1 + 0.7 * Math.max(0, Math.cos(ph))) * amp;
      pose.kneeR[0] = (0.1 + 0.7 * Math.max(0, -Math.cos(ph))) * amp;
      pose.ankleL[0] = -0.15 * Math.sin(ph) * amp;
      pose.ankleR[0] = 0.15 * Math.sin(ph) * amp;
      pose.shoulderL[0] = Math.sin(ph) * 0.42 * amp;
      pose.shoulderR[0] = -Math.sin(ph) * 0.42 * amp;
      pose.elbowL[0] = -0.25 - 0.1 * amp;
      pose.elbowR[0] = -0.25 - 0.1 * amp;
      pose.spine[1] = Math.sin(ph) * 0.07 * amp;
      pose.spine[0] = 0.05 * amp;
      pose.pelvisY = 0.95 - 0.025 * amp + Math.abs(Math.cos(ph)) * 0.03 * amp;
    }
    if (step.at) pos.copy(step.at);

    heading += wrapAngle(face - heading) * (1 - Math.exp(-9 * dt));
    root.position.copy(pos);
    root.rotation.y = heading;
    applyPose(pose);
    onDrawer(drawer);
  }

  // start mid-job, already kneeling at the wheel
  update(0.001);
  return { group: root, update, reset: () => { t = 0; heading = FACE_WHEEL; } };
}
