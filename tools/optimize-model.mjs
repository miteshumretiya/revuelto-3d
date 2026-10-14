// Optimises the source Revuelto .glb for the web.
//   cd tools && npm install
//   node optimize-model.mjs "../Lamborghini Revuelto.glb" ../models/revuelto.glb [simplifyRatio]
// simplifyRatio defaults to 1 (no simplification). Try 0.6 for a lighter mobile build.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, quantize, meshopt, textureCompress, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [,, input, output, simplifyRatio = '1'] = process.argv;
if (!input || !output) { console.error('Usage: node optimize-model.mjs <input.glb> <output.glb> [simplifyRatio]'); process.exit(1); }
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. Strip unused vertex attributes
const slots = ['getBaseColorTextureInfo','getNormalTextureInfo','getMetallicRoughnessTextureInfo','getOcclusionTextureInfo','getEmissiveTextureInfo'];
let nonWhite = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const mat = prim.getMaterial(); const used = new Set([0]);
  if (mat) for (const s of slots) { const ti = mat[s](); if (ti && mat[s.replace('Info','')]()) used.add(ti.getTexCoord()); }
  for (const sem of prim.listSemantics()) {
    const m = sem.match(/^TEXCOORD_(\d)$/);
    if (m && !used.has(+m[1])) prim.setAttribute(sem, null);
    if (sem === 'COLOR_1') prim.setAttribute(sem, null);
    if (sem === 'COLOR_0') {
      const a = prim.getAttribute(sem); const mn = a.getMin([]);
      if (mn.every(v => v >= 254 || v >= 0.99)) prim.setAttribute(sem, null); else nonWhite++;
    }
  }
}
console.log('non-white COLOR_0 prims kept:', nonWhite);

// 2. Re-group movable parts under named pivots-to-be
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
const carRoot = byName.get('Revuelto_Root');
const groups = {
  DOOR_L: /^(DoorLF_|DoorCardLF|GlassLF_|GlassLM_|WingMirrorL_|MirrorBaseL_)/,
  DOOR_R: /^(DoorRF_|DoorCardRF|GlassRF_|GlassRM_|WingMirrorR_|MirrorBaseR_)/,
  HOOD: /^(Hood|HoodBadge|HoodLiner)/,
  ENGINE_COVER: /^(Trunk_|TrunkLiner)/,
  LIGHTS_F: /^(HeadlightL_Emitter|HeadlightR_Emitter|LensLHL_HeadLights|LensRHL_HeadLights)$/,
  LIGHTS_R: /^(LensLTL_EmissionRed|LensRTL_EmissionRed)$/,
  INTERIOR: null, ENGINE: null, BODY: null,
};
const gnodes = {};
for (const g of Object.keys(groups)) { gnodes[g] = doc.createNode(g); carRoot.addChild(gnodes[g]); }
const parentOf = (n) => n.getParentNode();
for (const n of root.listNodes()) {
  const name = n.getName(); if (!n.getMesh() || /^Wheel_/.test(name)) continue;
  let target = null;
  for (const [g, re] of Object.entries(groups)) if (re && re.test(name)) { target = g; break; }
  if (!target) {
    const p = parentOf(n)?.getName() || '';
    target = p === 'GRP_Interior' ? 'INTERIOR' : p === 'GRP_Engine' ? 'ENGINE' : 'BODY';
  }
  // all transforms are identity on these + parents only translate GRP_Body by y .088
  const w = n.getWorldMatrix();
  gnodes[target].addChild(n); // addChild re-parents
  n.setMatrix(w);
}
// remove now-empty GRP_ nodes (their translation got baked via world matrix above)
for (const n of root.listNodes()) if (/^GRP_/.test(n.getName()) && n.listChildren().length === 0) n.dispose();

// 3. Clean & join
await doc.transform(dedup(), prune(), weld());
if (+simplifyRatio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: +simplifyRatio, error: 0.0004, lockBorder: true }));
await doc.transform(join({ keepNamed: false }), prune());

// 4. Textures -> webp
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }));

// 5. Quantize + meshopt
await doc.transform(quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);
let tris=0, draws=0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { draws++; tris += (p.getIndices()?.getCount()||0)/3; }
console.log('meshes', root.listMeshes().length, 'draws', draws, 'tris', tris, 'nodes', root.listNodes().map(n=>n.getName()).filter(x=>/^(DOOR|HOOD|ENG|LIGHT|INTER|BODY|CTRL|Wheel)/.test(x)).join(' '));
