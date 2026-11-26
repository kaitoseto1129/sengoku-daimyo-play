// 勝った後の 3D の見返し（Q7・O5 11/24 Sanae）：戦の山場（名のある将を討った・斉射・騎馬の突き当たり・門破り）の数秒を、
//   勝った後の振り返りの地図（replay_map.js）の続きに、HUD を消した 3D のスローで見せる。字も釦も足さない（触れば飛ばす）。
//   記録：戦の間、自分の周り 45m の兵の姿（各部品の位置・向き・見える／見えない）を一秒に八度、決まった大きさの輪に書く。
//     近い 48 人は体の部品まで、その外は体の位置と向きだけ。輪は二本だけで、山場を残す時は輪を入れ替える（毎コマ new しない）。
//   山場の点：名のある将を討った 6・大将の討死 5・斉射／騎馬／門 4・勝った時 4・崩れ 2〜3。同じか高い点の新しい物で置き換える。
//   見返し：残した輪の姿を兵に当て直し、山場の前後だけ四分の一の速さ。カメラは山場の周りをゆっくり回る。戦はこの後に片付けるので戻さない。
import { reduceMotion } from './settings.js';

const HZ = 8, PRE = 2.2, POST = 1.4, CLIP = Math.ceil((PRE + POST) * HZ) + 1;
const MAXU = 32, MAXALL = 200, MAXN = 1300, NEAR = 22, FAR = 45, F = 8;
const MARK_R = 30;   // 自分からこれより遠い山場は残さない（記録は自分の周りだけ）

function slot() {
  return { t: -1, n: 0, nu: 0, nodes: new Array(MAXN).fill(null), par: new Array(MAXN).fill(null), f: new Float32Array(MAXN * F),
    units: new Array(MAXALL).fill(null), uoff: new Int32Array(MAXALL + 1) };
}
function ring() { const r = new Array(CLIP); for (let i = 0; i < CLIP; i++) r[i] = slot(); return { s: r, head: 0, count: 0 }; }

// 置いてよい戦か（振り返りの地図と同じ）
function skip(rt) { return rt.def.town || rt.def.dojo || rt.def.duel || rt.def.mapCastle || rt.def.onlineMatch; }

// K675 Sanae：前は一秒八度 seen（Set）を clear して入れ直し、近い順の並べも map と閉包を作っていた（JSC は clear した Set へ入れ直すたびに入れ物を作る）。
//   拾った印は兵に押す番号（_r3dSeen）で、並べは使い回しの配列と作り置きの比べで（拾う兵と順は同じ）
const cand = [], candD = [], order = [];
let seenN = 1;
const byNear = (a, b) => (a === 0 ? -1 : b === 0 ? 1 : candD[a] - candD[b]);
function put(o, S) {
  if (S.n >= MAXN) return;
  const i = S.n++, k = i * F, p = o.position, q = o.quaternion;
  S.nodes[i] = o; S.par[i] = o.parent;
  const f = S.f; f[k] = p.x; f[k + 1] = p.y; f[k + 2] = p.z; f[k + 3] = q.x; f[k + 4] = q.y; f[k + 5] = q.z; f[k + 6] = q.w; f[k + 7] = o.visible ? 1 : 0;
}
function walk(o, S) { put(o, S); const ch = o.children; for (let i = 0; i < ch.length; i++) walk(ch[i], S); }
function near(u) { if (u && u.mesh && u._r3dSeen !== seenN) { u._r3dSeen = seenN; cand.push(u); } }

// 戦の毎コマ（battle.js）。一秒に八度だけ拾う
export function replay3dTick(rt) {
  if (skip(rt)) return;
  const me = rt.player?.u, A = rt.army; if (!me || !A || !me.mesh) return;
  let R = rt.replay3d;
  if (!R) R = rt.replay3d = { live: ring(), spare: ring(), best: null, pending: null, at: -9, vicT: null, kit: new WeakMap() };
  if (rt.over && R.vicT == null) R.vicT = rt.t;
  if (R.pending && rt.t >= R.pending.saveAt) keep(R);
  if (rt.t - R.at < 1 / HZ) return;
  R.at = rt.t;
  const L = R.live, S = L.s[L.head];
  L.head = (L.head + 1) % CLIP; L.count = Math.min(CLIP, L.count + 1);
  S.t = rt.t; S.n = 0; S.nu = 0;
  // 候補：自分・前の姿にいた兵（討たれて升から抜けても追う）・升の中の近い兵
  cand.length = 0; seenN++;
  near(me);
  const P = L.s[(L.head - 2 + CLIP) % CLIP];
  if (L.count > 1) for (let i = 0; i < P.nu; i++) { const u = P.units[i]; if (u && u.mesh?.parent) near(u); }
  A.forNear?.(me.pos.x, me.pos.z, FAR, near);
  const x = me.pos.x, z = me.pos.z;
  candD.length = cand.length;
  for (let i = 0; i < cand.length; i++) { const p = cand[i].pos; candD[i] = p ? (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) : 1e9; }
  // 近い順（自分は先頭のまま）
  order.length = cand.length; for (let i = 0; i < cand.length; i++) order[i] = i;
  order.sort(byNear);
  let full = 0;
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (S.nu >= MAXALL || S.n >= MAXN - 40) break;
    const u = cand[i], d2 = candD[i];
    if (d2 > FAR * FAR || !u.mesh.parent) continue;
    S.units[S.nu] = u; S.uoff[S.nu] = S.n; S.nu++;
    if (full < MAXU && d2 < NEAR * NEAR) {
      full++; walk(u.mesh, S);
      // 立った体の形を覚える（討たれた後に倒れた体の形へ替わるので、見返しの間だけ戻す）
      if (u.body && !u.groundKit && !R.kit.has(u)) R.kit.set(u, { g: u.body.geometry, lod: u.body.userData.lod, obr: u.body.onBeforeRender });
    } else put(u.mesh, S);
  }
  S.uoff[S.nu] = S.n;
  for (let i = S.nu; i < MAXALL && S.units[i]; i++) S.units[i] = null;
  for (let i = S.n; i < MAXN && S.nodes[i]; i++) { S.nodes[i] = null; S.par[i] = null; }
  cand.length = 0; order.length = 0; seenN++;
}

// 山場の印（battle_events.js・victory_flow.js）。score が高い物を残す
export function replayMark(rt, score, pos) {
  const R = rt?.replay3d, me = rt?.player?.u;
  if (!R || !me || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
  if (Math.hypot(pos.x - me.pos.x, pos.z - me.pos.z) > MARK_R) return;
  if (R.best && score < R.best.score) return;
  if (R.pending && score < R.pending.score) return;
  R.pending = { score, t: rt.t, x: pos.x, z: pos.z, saveAt: rt.t + POST };
}
function keep(R) {
  const P = R.pending; R.pending = null;
  const old = R.best ? R.best.ring : R.spare;
  R.best = { ring: R.live, score: P.score, t: P.t, x: P.x, z: P.z };
  R.live = old; R.live.count = 0; R.live.head = 0; R.spare = null;
}

// 勝った後（振り返りの地図の後）に呼ぶ。見せる物が無ければ null
export function replay3d(rt, game, done) {
  const R = rt.replay3d, cam = rt.camera, me = rt.player?.u;
  if (!R || !cam || !me || reduceMotion() || skip(rt)) return null;
  // 勝った時の輪（最後の数秒）と残した山場の、点の高い方。勝った時は 4 点
  let src = null;
  if (R.pending && R.pending.score >= (R.best?.score ?? 0) && R.live.count >= 6) src = { ring: R.live, t: R.pending.t, x: R.pending.x, z: R.pending.z, score: R.pending.score };
  else if (R.best && R.best.score > 4 && R.best.ring.count >= 6) src = R.best;
  else if (R.live.count >= 6) { const v = R.vicT ?? rt.t; src = { ring: R.live, t: v - 0.6, x: me.pos.x, z: me.pos.z, score: 4 }; }
  else if (R.best && R.best.ring.count >= 6) src = R.best;
  if (!src) return null;
  const Lr = src.ring, SM = [];
  for (let k = 0; k < Lr.count; k++) SM.push(Lr.s[(Lr.head - Lr.count + k + CLIP * 2) % CLIP]);
  const N = SM.length, T0 = SM[0].t, T1 = SM[N - 1].t;
  if (!(T1 - T0 > 0.5)) return null;
  const te = Math.max(T0 + 0.4, Math.min(T1 - 0.3, src.t));
  // 隣の姿で同じ兵がどこにいるか（部品の数が同じ時だけ滑らかに繋ぐ）
  const nextU = [];
  for (let k = 0; k < N - 1; k++) {
    const a = SM[k], b = SM[k + 1], m = new Map(), ix = new Int16Array(a.nu).fill(-1);
    for (let j = 0; j < b.nu; j++) m.set(b.units[j], j);
    for (let i = 0; i < a.nu; i++) { const j = m.get(a.units[i]); if (j !== undefined && b.uoff[j + 1] - b.uoff[j] === a.uoff[i + 1] - a.uoff[i]) ix[i] = j; }
    nextU.push(ix);
  }
  // 見返しに出る兵：立った体の形へ戻す。出ない近くの兵は隠す（終わりの姿のまま立っていると止まって見える）
  const inClip = new Set();
  for (const S of SM) for (let i = 0; i < S.nu; i++) if (S.units[i]?.mesh?.parent) inClip.add(S.units[i]);   // 片付けで場面から外れた兵は戻さない
  for (const u of inClip) {
    const kit = R.kit.get(u);
    if (u.groundKit && kit && u.body) { u.body.geometry = kit.g; u.body.userData.lod = kit.lod; u.body.onBeforeRender = kit.obr; }
  }
  for (const u of rt.army?.units || []) {
    if (!u.mesh || inClip.has(u)) continue;
    const p = u.pos; if (p && Math.hypot(p.x - src.x, p.z - src.z) < 80) u.mesh.visible = false;
  }
  // 幕の上下の黒い帯（絵だけ）
  const bars = document.createElement('div');
  bars.className = 'r3d-bars'; bars.setAttribute('aria-hidden', 'true');
  // 戦の札・名札・隊の札など、3D の絵の上に重なる物を見返しの間だけ全部隠す（消さずに見えなくするだけ）
  if (!document.getElementById('r3d-css')) { const st = document.createElement('style'); st.id = 'r3d-css'; st.textContent = 'body.r3d>:not(#view):not(.r3d-bars):not(script):not(style):not(link){visibility:hidden!important}'; document.head.appendChild(st); }
  document.body.classList.add('r3d');
  bars.style.cssText = 'position:fixed;inset:0;z-index:58;pointer-events:none;box-shadow:inset 0 9vh 0 #000,inset 0 -9vh 0 #000;background:#000;opacity:1;transition:none';
  document.body.appendChild(bars);
  const fov0 = cam.fov;
  const W = rt.world, hAt = (x, z) => (W?.heightAt ? W.heightAt(x, z) : 0);
  const kill = src.score >= 5, dist = kill ? 6.5 : 10, lift = kill ? 2 : 3;
  const a0 = Math.atan2(cam.position.x - src.x, cam.position.z - src.z);
  const fy = hAt(src.x, src.z) + (kill ? 1.1 : 0.9);
  const qa = [0, 0, 0, 1];
  const apply = (s) => {
    const k = Math.min(N - 2, Math.max(0, Math.floor(s))), f = Math.min(1, Math.max(0, s - k));
    const A = SM[k], B = SM[k + 1], ix = nextU[k];
    for (const u of inClip) u.mesh.visible = false;
    for (let i = 0; i < A.nu; i++) {
      const u = A.units[i]; if (!inClip.has(u)) continue;
      const j = ix[i], a0n = A.uoff[i], a1n = A.uoff[i + 1], b0n = j >= 0 ? B.uoff[j] : 0;
      for (let n = a0n; n < a1n; n++) {
        const o = A.nodes[n], par = A.par[n]; if (!o) continue;
        if (par && o.parent !== par) { let q = par; while (q && q !== o) q = q.parent; if (!q) par.add(o); }   // 輪にならない時だけ元の親へ戻す
        const ka = n * F, fa = A.f;
        if (j >= 0) {
          const kb = (b0n + n - a0n) * F, fb = B.f;
          o.position.set(fa[ka] + (fb[kb] - fa[ka]) * f, fa[ka + 1] + (fb[kb + 1] - fa[ka + 1]) * f, fa[ka + 2] + (fb[kb + 2] - fa[ka + 2]) * f);
          // 遠く離れた所へ飛んだ部品（乗り換え・手から落ちた）は繋がず、近い方の姿を使う
          const g = (fb[kb] - fa[ka]) ** 2 + (fb[kb + 2] - fa[ka + 2]) ** 2 > 25 ? (f < 0.5 ? 0 : 1) : f;
          if (g !== f) { const kk = g ? kb : ka, ff = g ? fb : fa; o.position.set(ff[kk], ff[kk + 1], ff[kk + 2]); }
          qa[0] = fa[ka + 3]; qa[1] = fa[ka + 4]; qa[2] = fa[ka + 5]; qa[3] = fa[ka + 6];
          slerpFlat(qa, fa, ka + 3, fb, kb + 3, g);
          o.quaternion.set(qa[0], qa[1], qa[2], qa[3]);
          o.visible = (f < 0.5 ? fa[ka + 7] : fb[kb + 7]) > 0;
        } else {
          o.position.set(fa[ka], fa[ka + 1], fa[ka + 2]);
          o.quaternion.set(fa[ka + 3], fa[ka + 4], fa[ka + 5], fa[ka + 6]);
          o.visible = fa[ka + 7] > 0;
        }
        if (!o.matrixAutoUpdate) o.updateMatrix();
      }
    }
  };
  // 時の進み：山場の前は並の速さ、山場の前後は四分の一、その後は半分
  const speed = (gt) => (gt < te - 0.7 ? 1 : gt < te + 0.8 ? 0.25 : 0.5);
  let gt = T0, real = 0, closed = false, endAt = 0;
  const shot = (u) => {
    const ang = a0 + (u - 0.5) * 0.9, d = dist - u * 1.2;
    const cx = src.x + Math.sin(ang) * d, cz = src.z + Math.cos(ang) * d;
    cam.position.set(cx, Math.max(hAt(cx, cz) + 1.2, fy + lift - u * 0.5), cz);
    cam.lookAt(src.x, fy, src.z);
  };
  function frame() {
    let k = 0; while (k < N - 2 && SM[k + 1].t <= gt) k++;
    const f = Math.min(1, Math.max(0, (gt - SM[k].t) / Math.max(1e-3, SM[k + 1].t - SM[k].t)));
    apply(k + f);
    shot(Math.min(1, (gt - T0) / (T1 - T0)));
    // カメラの目の前に立つ兵は隠す（笠や槍で画面が塞がる）
    const cp = cam.position;
    for (const u of inClip) { const m = u.mesh; if (m.visible && (m.position.x - cp.x) ** 2 + (m.position.z - cp.z) ** 2 < 6.25) m.visible = false; }
  }
  cam.fov = kill ? 38 : 45; cam.updateProjectionMatrix();
  frame();
  function dispose() {
    if (closed) return;
    closed = true;
    cam.fov = fov0; cam.updateProjectionMatrix();
    bars.remove(); document.body.classList.remove('r3d');
    window.removeEventListener('pointerdown', tap, true); window.removeEventListener('keydown', tap, true);
    clearTimeout(guard);
    rt.replay3d = null;   // 記録を手放す（戦はこの後に片付ける）
  }
  function finish() { if (closed) return; dispose(); done(); }
  function jump() { finish(); }
  function tap(e) { e.preventDefault?.(); e.stopPropagation?.(); jump(); }
  window.addEventListener('pointerdown', tap, true);
  window.addEventListener('keydown', tap, true);
  const total = (te - 0.7 - T0) + 1.5 / 0.25 + Math.max(0, T1 - te - 0.8) / 0.5 + 1;
  // 毎コマが止まっても実時間で必ず閉じて結果へ（重い端末は一コマ 0.1 秒までしか進まないので、長めに待つ）
  const guard = window.__replay3dStep ? 0 : setTimeout(finish, (total * 2 + 5) * 1000);
  function update(dt) {
    if (closed) return;
    dt = Math.min(dt, 0.1); real += dt;
    if (gt < T1) { gt = Math.min(T1, gt + dt * speed(gt)); try { frame(); } catch (e) { console.warn('3D の見返しを止めた', e); finish(); return; } }
    else if (!endAt) endAt = real;
    // 入りは黒から開き、終わりは黒へ閉じる
    const out = endAt ? Math.min(1, (real - endAt) / 0.5) : 0;
    bars.style.background = `rgba(0,0,0,${Math.max(1 - real / 0.4, out).toFixed(3)})`;
    if (endAt && real - endAt > 0.55) finish();
  }
  window.__replay3dShown = { samples: N, score: src.score, span: +(T1 - T0).toFixed(2), units: inClip.size, nodes: SM[0].n };
  return { update, jump, dispose };
}

// THREE.Quaternion.slerpFlat と同じ（three を読み込まずに済ませる）
function slerpFlat(dst, s0, o0, s1, o1, t) {
  let x0 = s0[o0], y0 = s0[o0 + 1], z0 = s0[o0 + 2], w0 = s0[o0 + 3];
  const x1 = s1[o1], y1 = s1[o1 + 1], z1 = s1[o1 + 2], w1 = s1[o1 + 3];
  if (t === 0) { dst[0] = x0; dst[1] = y0; dst[2] = z0; dst[3] = w0; return; }
  if (t === 1) { dst[0] = x1; dst[1] = y1; dst[2] = z1; dst[3] = w1; return; }
  let s = 1 - t;
  const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1, dir = cos >= 0 ? 1 : -1, sqrSin = 1 - cos * cos;
  if (sqrSin > Number.EPSILON) { const sin = Math.sqrt(sqrSin), len = Math.atan2(sin, cos * dir); s = Math.sin(s * len) / sin; t = Math.sin(t * len) / sin; }
  const td = t * dir;
  x0 = x0 * s + x1 * td; y0 = y0 * s + y1 * td; z0 = z0 * s + z1 * td; w0 = w0 * s + w1 * td;
  if (s === 1 - t) { const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0); x0 *= f; y0 *= f; z0 *= f; w0 *= f; }
  dst[0] = x0; dst[1] = y0; dst[2] = z0; dst[3] = w0;
}
