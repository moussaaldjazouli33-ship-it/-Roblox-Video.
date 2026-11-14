// Fusionne les maillages statiques d'un groupe par matériau → beaucoup moins d'appels de dessin
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv', 'color'];
export function mergeStatic(group, { exclude = [] } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  const skip = new Set();
  for (const e of exclude) e.traverse(o => skip.add(o));
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !o.visible) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const parts = Array.isArray(o.material) && o.geometry.groups.length
      ? o.geometry.groups.map(gr => [mats[gr.materialIndex], sliceGeo(g, gr.start, gr.count)])
      : [[mats[0], g]];
    for (const [mat, geo] of parts) {
      const key = mat.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      buckets.get(key).geos.push(geo);
    }
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const { mat, cast, recv, geos } of buckets.values()) {
    const names = ATTRS.filter(a => geos.every(g => g.attributes[a]));
    for (const g of geos) { for (const a of Object.keys(g.attributes)) if (!names.includes(a)) g.deleteAttribute(a); g.clearGroups(); g.morphAttributes = {}; }
    const merged = mergeGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast; mesh.receiveShadow = recv;
    group.add(mesh);
  }
  return group;
}
function sliceGeo(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}
