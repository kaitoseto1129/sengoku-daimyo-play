// GPU に送った形（BufferGeometry）の片付け：three は geometry.dispose() を呼ばない限り GL の buffer を返さない
//   （WebGLGeometries は id → true しか持たないので、JS 側の参照が切れても GPU の buffer と info.memory.geometries は残る）。
//   兵の着せ替え（傷・落ちた笠・束の形）で形が入れ替わるたびに古い形が GPU に残り、桶狭間で 2 分半に 490 → 1766 個に増えて
//   iPhone の WebContent（WebGL の buffer も乗る）を 2GB まで押していた（10/19 実機）。
//   12 秒ごとに候補を調べ、読み戻しと返却は数コマへ分ける。
//   CPU の配列を手放した形（gpuOnly）は dispose の前に GPU から読み戻す（後でまた要る時に送り直せるように）
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

const UPLOADED = new Set();   // GPU へ送った形（three が dispose の聞き手を付けた物）
let hooked = false;
export function hookGpuGeometries() {
  if (hooked) return; hooked = true;
  const P = THREE.BufferGeometry.prototype;
  const ael = P.addEventListener, disp = P.dispose;
  P.addEventListener = function (type, fn) { if (type === 'dispose') UPLOADED.add(this); return ael.call(this, type, fn); };
  P.dispose = function () { UPLOADED.delete(this); return disp.call(this); };
}
export function uploadedGeometryCount() { return UPLOADED.size; }

const _keep = new Set();
function keepGeo(g) { if (g && g.isBufferGeometry) _keep.add(g); }
function keepObject(o) {
  if (!o || !o.isObject3D) return;
  o.traverse((c) => {
    keepGeo(c.geometry);
    const L = c.userData && c.userData.lod;
    if (L) { if (Array.isArray(L)) for (const g of L) keepGeo(g); else keepFrom(L, 2); }
    if (c.isBatchedMesh && c.geometry) keepGeo(c.geometry);
  });
}
// 表（Map・Set・配列・物）の中の形を 3 段まで拾う
function keepFrom(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 3) return;
  if (v.isBufferGeometry) { keepGeo(v); return; }
  if (v.isObject3D) { keepObject(v); return; }
  if (v.isMaterial || v.isTexture || ArrayBuffer.isView(v)) return;
  if (v instanceof Map || v instanceof Set) { for (const e of v) { if (Array.isArray(e)) { keepFrom(e[0], depth + 1); keepFrom(e[1], depth + 1); } else keepFrom(e, depth + 1); } return; }
  if (Array.isArray(v)) { for (const e of v) keepFrom(e, depth + 1); return; }
  for (const k in v) { const e = v[k]; if (e && typeof e === 'object') keepFrom(e, depth + 1); }
}

// clock：戦の中の時計（秒。描く時に形へ gpuUse の印を押す：main.js の renderBufferDirect）。idle：iPhone でこの秒数描かれない送り済みの形は GPU から返す（次に描く時に送り直す）
export const GPU_GC = { at: 0, every: MEM_TIGHT ? 6 : 12, last: { kept: 0, freed: 0, readback: 0, ms: 0 }, total: 0, clock: 0, idle: MEM_TIGHT ? 5 : 10, idleFreed: 0, idleMB: 0 };
let gcWork = null;
// 同期の読み戻しは一コマ一配列、返却は四つまで。候補の走査も六十四個・約半ミリ秒で区切る。
function readOneGeometryArray(g) {
  for (const k in g.attributes) if (g.attributes[k]?._gpuRef) { void g.attributes[k].array; return true; }
  if (g.index?._gpuRef) { void g.index.array; return true; }
  return false;
}
function needsRead(g) {
  for (const k in g.attributes) if (g.attributes[k]?._gpuRef) return true;
  return !!g.index?._gpuRef;
}
function gcStep() {
  const w = gcWork, t0 = performance.now();
  let scanned = 0, freed = 0, reads = 0;
  w.frames++;
  // 読み戻しは GPU の仕事が済むまで待つ。一つ目で待てば、同じコマの二つ目からはほとんど待たない。
  //   一コマ一つずつ分けると、読み戻しのたびに別のコマが固まる（10/27 tarapon「乱戦でカクつく」）。読み戻したコマは 3ms・八つまで続ける
  while (scanned < 64 && freed < (reads ? 12 : 4)) {
    // 返却や属性の調べが遅い端末では、個数の上限まで詰めず次のコマへ渡す。
    // 単発の処理は中断できないので、毎回少なくとも一つは進める。
    if ((scanned || freed) && performance.now() - t0 >= (reads ? 3 : 0.5)) break;
    if (w.pending) {
      const g = w.pending;
      // 巡回を始めてから再び描いた物は保つ。別の片付けで返した物も触らない。
      if (!UPLOADED.has(g) || g.userData.humanPooled || g.userData.gpuUse >= w.clock) { w.pending = null; continue; }
      // 読み戻しは許されたコマ（既に読み戻したコマか、十五コマに一度）だけ。ほかのコマは次へ回す
      if (needsRead(g) && !(globalThis.__gpuOnly?.may?.() ?? true)) break;
      if (readOneGeometryArray(g)) {
        w.readback++; if (w.pendingIdle) w.idleReadback++;
        if (++reads >= 8) break;
        continue;
      }
      g.userData.gpuUse = undefined;
      g.dispose(); freed++;
      if (w.pendingIdle) { w.idle++; w.idleBytes += w.pendingBytes; }
      else w.freed++;
      w.pending = null;
      continue;
    }
    if (w.left-- <= 0) break;
    const next = w.iterator.next();
    if (next.done) { w.left = 0; break; }
    scanned++;
    const g = next.value, idle = _keep.has(g);
    if (g.userData.humanPooled || g.userData.gpuUse >= w.clock) continue;
    if (idle && (!MEM_TIGHT || g.userData.gpuUse === undefined || g.userData.gpuUse > w.clock - GPU_GC.idle)) continue;
    let bytes = 0, need = 0, big = false;
    for (const k in g.attributes) {
      const a = g.attributes[k]; if (!a) continue;
      if (a._gpuRef) { need++; const n = a._gpuRef.len * a._gpuRef.ctor.BYTES_PER_ELEMENT; bytes += n; if (n > 8388608) big = true; }
      else if (idle && a.array) bytes += a.array.byteLength;
    }
    if (g.index) {
      const a = g.index;
      if (a._gpuRef) { need++; const n = a._gpuRef.len * a._gpuRef.ctor.BYTES_PER_ELEMENT; bytes += n; if (n > 8388608) big = true; }
      else if (idle && a.array) bytes += a.array.byteLength;
    }
    if (big || idle && (w.idleReadback + need > 32 || need && w.idleBytes + bytes > 6291456)) continue;
    w.pending = g; w.pendingIdle = idle; w.pendingBytes = bytes;
  }
  const ms = performance.now() - t0;
  w.ms += ms; w.peakMs = Math.max(w.peakMs, ms);
  if (w.left > 0 || w.pending) return;
  const last = GPU_GC.last;
  last.kept = _keep.size; last.freed = w.freed; last.readback = w.readback;
  last.idle = w.idle; last.idleMB = +(w.idleBytes / 1048576).toFixed(1);
  last.ms = +w.ms.toFixed(1); last.peakMs = +w.peakMs.toFixed(1); last.frames = w.frames;
  GPU_GC.total += w.freed; GPU_GC.idleFreed += w.idle; GPU_GC.idleMB += w.idleBytes / 1048576;
  _keep.clear(); gcWork = null;
}
// rt：戦（scene・army）。caches：手放してはいけない表の並び（units_model の sharedUnitResources・humans の humanCaches）
export function gpuGcTick(rt, dt, caches) {
  if (!hooked || !rt || !rt.scene) return;
  // 新しい戦の最初の 12 秒は走らない（前の戦から持ち越した時計で、支度の途中の形を返さない）
  if (GPU_GC.rt !== rt) { GPU_GC.rt = rt; GPU_GC.at = 0; gcWork = null; _keep.clear(); return; }
  GPU_GC.at += dt; GPU_GC.clock += dt;
  if (gcWork) { gcStep(); return; }
  if (GPU_GC.at < GPU_GC.every) return;
  GPU_GC.at = 0;
  const t0 = performance.now();
  _keep.clear();
  keepObject(rt.scene);
  const A = rt.army;
  if (A) {
    for (const u of A.units) { keepObject(u.mesh); keepObject(u.hatOff); keepObject(u.dropped); keepObject(u.flag); keepObject(u.wpn); if (u.human) keepObject(u.human.root); }
    for (const k of ['arrowPool', 'smokePool', 'flashBatchPool', 'litter', 'looseHorses', 'fallenHorses', 'extraBodies', 'arrows', 'smokes', 'impostors', 'imp']) keepFrom(A[k]);
    if (A.batch) for (const bm of A.batch.maps || []) for (const e of bm.values()) keepGeo(e.im && e.im.geometry);
    if (A.solo) for (const p of A.solo.pools.values()) { keepGeo(p.bm && p.bm.geometry); for (const g of p.geos) keepGeo(g); }
  }
  if (rt.world) { keepFrom(rt.world.armyBatch); keepFrom(rt.world.cullList); }
  for (const c of (typeof caches === 'function' ? caches() : caches) || []) keepFrom(c);
  const ms = performance.now() - t0;
  gcWork = { iterator: UPLOADED.values(), left: UPLOADED.size, clock: GPU_GC.clock, pending: null,
    freed: 0, readback: 0, idle: 0, idleReadback: 0, idleBytes: 0, frames: 1, ms, peakMs: ms };
  // 場面の走査と同期の読み戻しを同じコマへ重ねない。
}
export function uploadedGeometries() { return [...UPLOADED]; }
