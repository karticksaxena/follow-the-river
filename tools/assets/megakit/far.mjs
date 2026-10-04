// Far LOD: bark -> meshopt simplify (Prune+Permissive); leaf cards -> keep every Nth loose card, scaled up to keep the canopy volume.
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
const [, , inp, outp, ratioArg = '0.25', leafKeepArg = '0.25'] = process.argv;
const RATIO = +ratioArg,
  LEAF_KEEP = +leafKeepArg;
await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(inp);

function components(idx, n) {
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = find(idx[i]);
    for (const k of [1, 2]) {
      const b = find(idx[i + k]);
      if (a !== b) parent[b] = a;
    }
  }
  return find;
}

function compact(prim, idx) {
  const used = new Map();
  const order = [];
  const nidx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let m = used.get(idx[i]);
    if (m === undefined) {
      m = order.length;
      used.set(idx[i], m);
      order.push(idx[i]);
    }
    nidx[i] = m;
  }
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const sz = acc.getElementSize();
    const src = acc.getArray();
    const dst = new src.constructor(order.length * sz);
    for (let i = 0; i < order.length; i++)
      for (let k = 0; k < sz; k++) dst[i * sz + k] = src[order[i] * sz + k];
    acc.setArray(dst);
  }
  prim.getIndices().setArray(order.length > 65535 ? nidx : new Uint16Array(nidx));
}

function cullLeaves(prim) {
  const idx = prim.getIndices().getArray();
  const pos = prim.getAttribute('POSITION');
  const p = pos.getArray();
  const find = components(idx, pos.getCount());
  const comps = new Map(); // root -> {tris:[], verts:Set}
  for (let i = 0; i < idx.length; i += 3) {
    const r = find(idx[i]);
    let c = comps.get(r);
    if (!c) comps.set(r, (c = { tris: [], verts: new Set() }));
    c.tris.push(idx[i], idx[i + 1], idx[i + 2]);
    c.verts.add(idx[i]);
    c.verts.add(idx[i + 1]);
    c.verts.add(idx[i + 2]);
  }
  const all = [...comps.values()];
  const keepEvery = Math.max(1, Math.round(1 / LEAF_KEEP));
  const grow = (1 / Math.sqrt(LEAF_KEEP)) * 0.9; // area compensation, slightly under so cards do not balloon
  const out = [];
  all.forEach((c, i) => {
    if (i % keepEvery) return;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const v of c.verts) {
      cx += p[v * 3];
      cy += p[v * 3 + 1];
      cz += p[v * 3 + 2];
    }
    const n = c.verts.size;
    cx /= n;
    cy /= n;
    cz /= n;
    for (const v of c.verts) {
      p[v * 3] = cx + (p[v * 3] - cx) * grow;
      p[v * 3 + 1] = cy + (p[v * 3 + 1] - cy) * grow;
      p[v * 3 + 2] = cz + (p[v * 3 + 2] - cz) * grow;
    }
    out.push(...c.tris);
  });
  pos.setArray(p);
  compact(prim, Uint32Array.from(out));
}

function simplifyBark(prim) {
  const idx = Uint32Array.from(prim.getIndices().getArray());
  const p = prim.getAttribute('POSITION').getArray();
  const target = Math.floor((idx.length * RATIO) / 3) * 3;
  const [res] = MeshoptSimplifier.simplify(idx, p, 3, target, 0.15, ['Prune', 'Permissive']);
  compact(prim, res);
}

for (const node of doc.getRoot().listNodes()) {
  for (const prim of node.getMesh().listPrimitives()) {
    const mat = prim.getMaterial();
    if (mat.getName().startsWith('Bark')) simplifyBark(prim);
    else cullLeaves(prim);
  }
}
await io.write(outp, doc);
