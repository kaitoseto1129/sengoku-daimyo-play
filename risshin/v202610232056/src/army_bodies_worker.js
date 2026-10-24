// 兵どうしの押し合い（army_move.js の bodies の近傍の合計）を別の芯（Web Worker）で求める。
//   主の糸は毎コマ、生きている兵の位置と印を Float32Array に詰めて渡し（transferable。SharedArrayBuffer は WKWebView で
//   crossOriginIsolated が要るので使わない）、前のコマの答え（兵ごとの押しの向きと量の合計）を bodies が使う。
//   一コマ遅れの位置で求めるが、押しは柔らかい（1-exp(-60dt) で少しずつ）ので歩みは変わらない。
//   城内（naka）の兵と遊び手は主の糸で今までどおり求める（室内の壁と、入力で動いた直後の位置が要る）。
//   x_bodyw=0（window.__apx.bodyw）で切れる（実機の A/B 用）。Worker が作れない・答えが来ない時は主の糸に戻る。
export const BODYW = { on: true, n: 0, sent: 0, got: 0, miss: 0, ms: 0, err: '' };
// ?bodyw=0（bot の --q=bodyw=0）で切って前後を比べる
try { BODYW.off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bodyw') === '0'; } catch (e) { BODYW.off = false; }

const F = 8;   // 一人分：x, y, z, heading, mounted, isPlayer, team, kind(0 兵・1 人足・-1 飛ばす)

function workerMain() {
  const grid = new Map();
  // 同じ区画の配列は残し、空いた区画の配列も次の移動先に回す。
  // 兵250人が全員別の区画へ移っても、前と次の区画を同時に持てる数。
  const free = Array.from({ length: 512 }, () => []);
  let active = [], next = [];
  self.onmessage = (e) => {
    const { buf, outBuf, n, cell, space } = e.data;
    const A = new Float32Array(buf);
    const out = outBuf && outBuf.byteLength >= n * 2 * 4 ? new Float32Array(outBuf) : new Float32Array(Math.max(n, 64) * 2);
    // 再利用した答えには前の兵が残る。今回飛ばす兵の分も先に消す。
    out.fill(0, 0, n * 2);
    const F = 8;
    for (let i = 0; i < active.length; i++) active[i].length = 0;
    next.length = 0;
    for (let i = 0; i < n; i++) {
      const k = (Math.floor(A[i * F] / cell) + 20000) * 40000 + Math.floor(A[i * F + 2] / cell) + 20000;
      let a = grid.get(k);
      if (!a) { a = free.pop() || []; a.gridKey = k; grid.set(k, a); }
      if (!a.length) next.push(a);
      a.push(i);
    }
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (!a.length) { grid.delete(a.gridKey); free.push(a); }
    }
    const previous = active; active = next; next = previous;
    for (let i = 0; i < n; i++) {
      const b = i * F;
      if (A[b + 7] < 0 || A[b + 5]) continue;   // 飛ばす印・遊び手は主の糸
      const x = A[b], y = A[b + 1], z = A[b + 2], mounted = A[b + 4] > 0, team = A[b + 6], id = i;
      const ra = mounted ? .55 : .4, r = mounted ? 2.4 : 1.8;
      const fx = mounted ? Math.sin(A[b + 3]) : 0, fz = mounted ? Math.cos(A[b + 3]) : 0;
      let tx = 0, tz = 0;
      const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell), z0 = Math.floor((z - r) / cell), z1 = Math.floor((z + r) / cell);
      for (let gi = x0; gi <= x1; gi++) for (let gj = z0; gj <= z1; gj++) {
        const a = grid.get((gi + 20000) * 40000 + gj + 20000);
        if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const j = a[q]; if (j === i) continue;
          const c = j * F;
          if (A[c + 7] < 0 || Math.abs(y - A[c + 1]) > 1.8) continue;
          const om = A[c + 4] > 0, oPlayer = A[c + 5] > 0, oTeam = A[c + 6], porter = A[c + 7] === 1;
          const min = !mounted && !om && !oPlayer ? Math.max(oTeam === team ? 1.15 : ra + .4, space) : ra + (om ? .55 : .4);   // 味方の徒歩どうしは 1.15m（army_move.js の ALLY_SPACE_HARD）
          const ofx = om ? Math.sin(A[c + 3]) : 0, ofz = om ? Math.cos(A[c + 3]) : 0;
          let bx = 0, bz = 0, best2 = min * min, found = false;
          for (let ii = 0; ii < (mounted ? 2 : 1); ii++) {
            const aa = mounted ? (ii ? -.5 : .6) : 0;
            for (let jj = 0; jj < (om ? 2 : 1); jj++) {
              const bb = om ? (jj ? -.5 : .6) : 0;
              const dx = (x + fx * aa) - (A[c] + ofx * bb), dz = (z + fz * aa) - (A[c + 2] + ofz * bb), d2 = dx * dx + dz * dz;
              if (d2 < best2) { bx = dx; bz = dz; best2 = d2; found = true; }
            }
          }
          if (!found) continue;
          let d = Math.sqrt(best2), nx, nz;
          if (d > 1e-4) { nx = bx / d; nz = bz / d; } else { const ang = Math.min(id, j) * 2.39996, sign = id < j ? 1 : -1; nx = Math.sin(ang) * sign; nz = Math.cos(ang) * sign; d = 0; }
          let share;
          if (oPlayer) share = mounted && !om ? 0.3 : 1;
          else if (mounted !== om) share = mounted ? 0.15 : 1;
          else share = 0.5;
          const k = (min - d) * share;
          tx += nx * k; tz += nz * k;
        }
      }
      out[i * 2] = tx; out[i * 2 + 1] = tz;
    }
    self.postMessage({ out, buf: A.buffer, serial: e.data.serial }, [out.buffer, A.buffer]);
  };
}

let _worker = null, _url = null;
function getWorker() {
  if (_worker !== null) return _worker || null;
  try {
    _url = URL.createObjectURL(new Blob([`(${workerMain.toString()})();`], { type: 'text/javascript' }));
    _worker = new Worker(_url);
    _worker.onerror = _worker.onmessageerror = (e) => { BODYW.err = String(e && e.message || 'err'); stop(); };
  } catch (e) { BODYW.err = String(e && e.message || e); _worker = false; }
  return _worker || null;
}
function stop() {
  if (_worker) { try { _worker.terminate(); } catch (e) { /* 既に無い */ } }
  _worker = false; BODYW.on = false;
  if (_url) { URL.revokeObjectURL(_url); _url = null; }
}

// 戦ごとに返事の行き先を捨て、次の戦では新しく作る。
export function disposeBodiesWorker(army) {
  if (_worker?.onmessage?._army !== army) { army._bw = null; return; }
  if (_worker) _worker.onmessage = _worker.onerror = _worker.onmessageerror = null;
  stop(); _worker = null; BODYW.on = true;
  army._bw = null;
}

// 主の糸：毎コマ update の初め（升を作った後）に呼ぶ。前の答えを受け取り、今の位置を送る。
export function bodiesWorkerTick(army) {
  const apx = typeof window !== 'undefined' && window.__apx;
  const want = BODYW.on && !(apx && apx.bodyw === 0) && !BODYW.off;
  const st = army._bw || (army._bw = { pending: false, serial: 0, out: null, outIds: null, idOf: new Map(), buf: null, spareOut: null, slots: [], lastAt: 0 });
  if (!want) { st.out = null; st.idOf.clear(); return; }
  const w = getWorker();
  if (!w) { st.out = null; return; }
  if (!w.onmessage) w.onmessage = (e) => {
    st.pending = false; BODYW.got++;
    BODYW.ms += performance.now() - st.lastAt;
    // 今使う答えを保ち、一つ前の答えだけ次の計算に返す（二枚を交互に使う）。
    st.spareOut = st.out ? st.out.buffer : null;
    st.out = e.data.out; st.buf = e.data.buf;
    // 送った時の並びで答えを引く
    st.outIds = st.sentIds;
    st.idOf.clear();
    for (let i = 0; i < st.outIds.length; i++) st.idOf.set(st.outIds[i], i);
  };
  w.onmessage._army = army;
  if (st.pending) return;
  // 詰める：生きている兵（物・案山子・倒れている人は飛ばす）
  const units = army.units, n = units.length;
  let buf = st.buf && st.buf.byteLength >= n * F * 4 ? st.buf : new ArrayBuffer(Math.max(n, 64) * F * 4);
  st.buf = null;
  const A = new Float32Array(buf);
  const ids = st.sentIds || (st.sentIds = []);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const u = units[i];
    if (u.qualityAbstract || !u.alive || u.downed || u.woundOut || u.isStruct || u.type === 'dummy' || u.fall) continue;
    const b = m * F;
    A[b] = u.pos.x; A[b + 1] = u.pos.y; A[b + 2] = u.pos.z; A[b + 3] = u.heading || 0;
    A[b + 4] = u.mounted ? 1 : 0; A[b + 5] = u.isPlayer ? 1 : 0; A[b + 6] = u.team;
    A[b + 7] = u.naka ? -1 : u.type === 'porter' ? 1 : 0;
    ids[m++] = u.id;
  }
  ids.length = m;
  st.pending = true; st.lastAt = performance.now(); BODYW.sent++; BODYW.n = m;
  const outBuf = st.spareOut && st.spareOut.byteLength ? st.spareOut : null;   // 手放し済みの物は送らない
  st.spareOut = null;
  w.postMessage({ buf, outBuf, n: m, cell: army.cell, space: army.world.def.meleeBodySpace || 0, serial: ++st.serial }, outBuf ? [buf, outBuf] : [buf]);
}

// bodies から：この兵の押しの合計（dt を掛ける前）。無ければ null（主の糸で求める）。
export function bodiesWorkerPush(army, u, out) {
  const st = army._bw;
  if (!st || !st.out || !st.out.length || u.isPlayer || u.naka) return false;
  const i = st.idOf.get(u.id);
  if (i === undefined) { BODYW.miss++; return false; }
  out.x = st.out[i * 2]; out.z = st.out[i * 2 + 1];
  return true;
}
