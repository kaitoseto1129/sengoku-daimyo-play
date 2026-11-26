// GPU に送った形（BufferGeometry）の片付け：three は geometry.dispose() を呼ばない限り GL の buffer を返さない
//   （WebGLGeometries は id → true しか持たないので、JS 側の参照が切れても GPU の buffer と info.memory.geometries は残る）。
//   兵の着せ替え（傷・落ちた笠・束の形）で形が入れ替わるたびに古い形が GPU に残り、桶狭間で 2 分半に 490 → 1766 個に増えて
//   iPhone の WebContent（WebGL の buffer も乗る）を 2GB まで押していた（10/19 実機）。
//   12 秒ごとに候補を調べ、読み戻しと返却は数コマへ分ける。
//   CPU の配列を手放した形（gpuOnly）は dispose の前に GPU から読み戻す（後でまた要る時に送り直せるように）
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';
const MAP_GET = Map.prototype.get;   // K675：Map を keys で回す時の読み（上書きした get を通らない）

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

// K675 Sanae：残す形の印。前は見回り（iPhone は6秒ごと）のたびに Set を clear して場面の形を全部入れ直していた。
//   JSC（iPhone の WebKit）は clear した Set・Map へ入れ直すたびに入れ物を作り直す（一つ約150〜200バイト）ので、見回りだけで
//   一秒に約2.5万回の作り捨てになっていた。形と属性に「何回目の見回りで残すと決めたか」の印（_kGen）を押し、並びは使い回しの配列に置く（答えは同じ）
let GEN = 1;
const _keep = [];   // この見回りで残すと決めた形（重なりなし）
const kept = (g) => g._kGen === GEN;
function keepGeo(g) { if (g && g.isBufferGeometry && g._kGen !== GEN) { g._kGen = GEN; _keep.push(g); } }
function keepReset() { GEN++; _keep.length = 0; }
// 残す形が使う属性（交互に詰めた属性は元の詰め物）と index の数。返す形がこれを他と共有していたら返さない：
//   three の dispose は共有の GL buffer ごと消し、生きている形の描き方（VAO）は消えた buffer を指したまま描けなくなる
//   （11/14 金ヶ崎：本人の胴の法線を共有した写しを返し、本人の体が毎コマ INVALID_OPERATION で消えていた）
const refKey = (a) => a && (a.isInterleavedBufferAttribute ? a.data : a);
// 属性ごとの「残す形からの数」も印（_kRefGen）と数（_kRefN）で持つ（前は Map を clear して入れ直していた）
const refN = (r) => (r._kRefGen === GEN ? r._kRefN : 0);
const refAdd = (r) => { if (r._kRefGen === GEN) r._kRefN++; else { r._kRefGen = GEN; r._kRefN = 1; } };
function countKeepRefs() {
  for (let i = 0; i < _keep.length; i++) {
    const g = _keep[i];
    for (const k in g.attributes) { const r = refKey(g.attributes[k]); if (r) refAdd(r); }
    if (g.index) refAdd(g.index);
  }
}
function sharedWithLive(g, isKept) {
  const own = isKept ? 1 : 0;
  for (const k in g.attributes) { const r = refKey(g.attributes[k]); if (r && refN(r) > own) return true; }
  return !!g.index && refN(g.index) > own;
}
function keepObject(o) {
  if (!o || !o.isObject3D) return;
  o.traverse(keepOne);
}
// traverse に渡す手は作り置き（前は keepObject のたびに閉包を作っていた・K675）
function keepOne(c) {
  {
    keepGeo(c.geometry);
    const L = c.userData && c.userData.lod;
    // 11/18 クラウド 山崎の持ち主：lodSwapLazy の [0] は読むと細かい形を作る。for…of で読むと、巡回の初め（戦の12秒）に遠くの将の細かい甲冑まで
    //   全部作って一コマ0.9〜1秒止まっていた（山崎の大返しの本陣）。作った物だけを peekHi で覗いて守る
    if (L) { if (Array.isArray(L)) { if (L.peekHi) { keepGeo(L.peekHi()); for (let i = 1; i < L.length; i++) keepGeo(L[i]); } else for (const g of L) keepGeo(g); } else keepFrom(L, 2); }
    if (c.isBatchedMesh && c.geometry) keepGeo(c.geometry);
    // 影を焼く時だけ描く元の形（props_batch の小谷・設楽原の柵）。描かれない間に返すと CPU へ読み戻して 17MB ずつ残っていた（10/30 夜 設楽原 82MB）
    if (c.userData && c.userData.staticShadowGeometry) keepGeo(c.userData.staticShadowGeometry);
  }
}
// 表（Map・Set・配列・物）の中の形を 3 段まで拾う
function keepFrom(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 3) return;
  if (v.isBufferGeometry) { keepGeo(v); return; }
  if (v.isObject3D) { keepObject(v); return; }
  if (v.isMaterial || v.isTexture || v.isBufferAttribute || v.isInterleavedBuffer || v.isInterleavedBufferAttribute || ArrayBuffer.isView(v)) return;   // 属性の array を触ると手放した写しを読み戻す
  // Map は [k, v] の対で回すと JSC が一つごとに入れ物を作るので、keys と get で読む（K675）
  if (v instanceof Map) { for (const k of v.keys()) { keepFrom(k, depth + 1); keepFrom(MAP_GET.call(v, k), depth + 1); } return; }
  if (v instanceof Set) { for (const e of v) { if (Array.isArray(e)) { keepFrom(e[0], depth + 1); keepFrom(e[1], depth + 1); } else keepFrom(e, depth + 1); } return; }
  if (Array.isArray(v)) { for (const e of v) keepFrom(e, depth + 1); return; }
  for (const k in v) { const e = v[k]; if (e && typeof e === 'object') keepFrom(e, depth + 1); }
}

// clock：戦の中の時計（秒。描く時に形へ gpuUse の印を押す：main.js の renderBufferDirect）。idle：iPhone でこの秒数描かれない送り済みの形は GPU から返す（次に描く時に送り直す）
export const GPU_GC = { at: 0, every: MEM_TIGHT ? 6 : 12, last: { kept: 0, freed: 0, readback: 0, ms: 0 }, total: 0, clock: 0, idle: MEM_TIGHT ? 5 : 10, idleAgain: MEM_TIGHT ? 12 : Infinity, idleFreed: 0, idleMB: 0 };
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
      if (w.pendingIdle) g.userData.idleFreed = 1;
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
    const g = next.value, idle = kept(g);
    if (g.userData.humanPooled || g.userData.gpuUse >= w.clock) continue;
    // 一度返して、また描かれて送り直した形は、もう返さない（idleAgain。10/31 iPhone 三木が開戦150秒に落ちた。
    //   向きを変えるたびに景色や兵の形を返しては送り直し、形の数が 450〜816 と揺れ続けていた）
    if (idle && (!MEM_TIGHT || g.userData.gpuUse === undefined || g.userData.gpuUse > w.clock - (g.userData.idleFreed ? GPU_GC.idleAgain : GPU_GC.idle))) continue;
    if (sharedWithLive(g, idle)) continue;
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
    // 描かれていない形を返す時、CPU の写しを手放した形は読み戻さない（読み戻すと WebContent の記憶が増える。10/30 実機の落ち）
    if (big || idle && (need || w.idleReadback + need > 32 || w.idleBytes + bytes > 6291456)) continue;
    w.pending = g; w.pendingIdle = idle; w.pendingBytes = bytes;
  }
  const ms = performance.now() - t0;
  w.ms += ms; w.peakMs = Math.max(w.peakMs, ms);
  if (w.left > 0 || w.pending) return;
  const last = GPU_GC.last;
  last.kept = _keep.length; last.freed = w.freed; last.readback = w.readback;
  last.idle = w.idle; last.idleMB = +(w.idleBytes / 1048576).toFixed(1);
  last.ms = +w.ms.toFixed(1); last.peakMs = +w.peakMs.toFixed(1); last.frames = w.frames;
  GPU_GC.total += w.freed; GPU_GC.idleFreed += w.idle; GPU_GC.idleMB += w.idleBytes / 1048576;
  keepReset(); gcWork = null;
}
// 戦を出た時に、終えた戦（rt）と途中の仕事を手放す（11/8 docs/crash_1108.md：GPU_GC.rt が戦をまるごと残していた）
export function gpuGcRelease() { GPU_GC.rt = null; gcWork = null; keepReset(); }
// rt：戦（scene・army）。caches：手放してはいけない表の並び（units_model の sharedUnitResources・humans の humanCaches）
export function gpuGcTick(rt, dt, caches) {
  if (!hooked || !rt || !rt.scene) return;
  // 新しい戦の最初の 12 秒は走らない（前の戦から持ち越した時計で、支度の途中の形を返さない）
  if (GPU_GC.rt !== rt) { GPU_GC.rt = rt; GPU_GC.at = 0; gcWork = null; keepReset(); return; }
  GPU_GC.at += dt; GPU_GC.clock += dt;
  if (gcWork) { gcStep(); return; }
  if (GPU_GC.at < GPU_GC.every) return;
  GPU_GC.at = 0;
  const t0 = performance.now();
  keepReset();
  keepObject(rt.scene);
  const A = rt.army;
  if (A) {
    for (const u of A.units) { keepObject(u.mesh); keepObject(u.hatOff); keepObject(u.dropped); keepObject(u.flag); keepObject(u.wpn); if (u.human) keepObject(u.human.root); }
    for (const k of ['arrowPool', 'smokePool', 'flashBatchPool', 'litter', 'looseHorses', 'fallenHorses', 'extraBodies', 'arrows', 'smokes', 'impostors', 'imp']) keepFrom(A[k]);
    if (A.batch) for (const bm of A.batch.maps || []) for (const e of bm.values()) keepGeo(e.im && e.im.geometry);
    if (A.solo) for (const p of A.solo.pools.values()) { keepGeo(p.bm && p.bm.geometry); for (const g of p.geos) keepGeo(g); }
  }
  if (rt.world) { keepFrom(rt.world.armyBatch); keepFrom(rt.world.cullList); keepFrom(rt.world.buildingDetails); }
  for (const c of (typeof caches === 'function' ? caches() : caches) || []) keepFrom(c);
  countKeepRefs();
  const ms = performance.now() - t0;
  gcWork = { iterator: UPLOADED.values(), left: UPLOADED.size, clock: GPU_GC.clock, pending: null,
    freed: 0, readback: 0, idle: 0, idleReadback: 0, idleBytes: 0, frames: 1, ms, peakMs: ms };
  // 場面の走査と同期の読み戻しを同じコマへ重ねない。
}
export function uploadedGeometries() { return [...UPLOADED]; }
