// K723 上杉編 十二戦目 手取川の見せ場（kaito 11/26 要件書「暗闇の向こう、無数の松明が川へ集中していく」）。
//   退く織田勢の松明を一つの光る点の束（THREE.Points 一つ＝描く回数は一回）で描く。
//   ①近い織田の兵（本物の兵）の手元に一つずつ付ける ②その奥の大軍の分は、川の北の野に散った火の粒として置き、
//   渡りの段（織田の手が浅瀬を南へ渡り始めた時）から渡り口へ寄せて浅瀬を越え、南の岸に溜まる。
//   本物の兵の付かない火の粒は、カメラから二十四メートル内では出さない（体の無い火を近くで見せない）。
//   形・材質・絵は一度だけ作り、毎コマは位置の書き換えだけ。
import * as THREE from 'three';

const UNIT_N = 40, FAR_N = 120;

export function u12TorchInit(rt, FORD, SOUTH) {
  const W = rt.world, N = UNIT_N + FAR_N;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < UNIT_N; i++) pos[i * 3 + 1] = -999;
  const far = [];
  let seed = 1577;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < FAR_N; i++) {
    const x0 = -72 + rnd() * 144, z0 = -58 + rnd() * 24;
    const lane = FORD.x - 10 + rnd() * 20;          // 浅瀬の幅に寄る
    const x1 = SOUTH.x - 50 + rnd() * 100, z1 = SOUTH.z + 4 + rnd() * 26;   // 渡った先の南の岸に散る
    far.push({ x0, z0, lane, x1, z1, t: 0, v: 0.010 + rnd() * 0.012, d: rnd() * 18, ph: rnd() * 6.28 });
  }
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,232,170,1)'); gr.addColorStop(0.18, 'rgba(255,160,64,0.9)');
  gr.addColorStop(0.5, 'rgba(230,96,26,0.28)'); gr.addColorStop(1, 'rgba(255,110,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // 透ける加算の束は戦の描き順で消えた（11/26 クラウドの写真で見えず）→ 透けない点を絵の縁で切る（alphaTest）。火の芯は明るく、縁は橙。
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), color: 0xffc070, size: 2.2, sizeAttenuation: true,
    alphaTest: 0.32, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2;
  rt.scene.add(pts);
  rt.flags.u12Torch = { pts, pos, far, list: [], listT: 0, go: false, time: 0, W, FORD, SOUTH };
}

// go：渡りの段に入ったら true（大軍の火が渡り口へ寄り始める）
export function u12TorchTick(rt, dt, go) {
  const T = rt.flags.u12Torch; if (!T) return;
  const { pos, far, W, FORD } = T;
  T.time += dt; if (go) T.go = true;
  // ① 近い織田の兵の手元（一秒半ごとに付ける兵を選び直す。崩れて逃げる兵も松明を持ったまま）
  if ((T.listT -= dt) <= 0) {
    T.listT = 1.5; T.list.length = 0;
    const cam = rt.camera?.position, P = rt.player?.u;
    if (cam && P && rt.army) {
      const cand = [];
      for (const gr of rt.army.groups) if (gr.team !== P.team) for (const u of gr.units) {
        if (!u.alive || u.gone || u.isStruct) continue;
        const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        if (d < 90) cand.push([d, u]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const step = Math.max(1, Math.floor(cand.length / UNIT_N));   // 近い兵から間を空けて選ぶ（全員が持つのではなく組の所々）
      for (let i = step >> 1; i < cand.length && T.list.length < UNIT_N; i += step) T.list.push(cand[i][1]);
    }
  }
  for (let i = 0; i < UNIT_N; i++) {
    const u = T.list[i], o = i * 3;
    if (!u || !u.alive || u.gone) { pos[o + 1] = -999; continue; }
    const h = u.heading || 0, x = u.pos.x + Math.cos(h) * 0.38, z = u.pos.z - Math.sin(h) * 0.38;
    pos[o] = x; pos[o + 1] = W.heightAt(x, z) + 2.15; pos[o + 2] = z;
  }
  const cam = rt.camera?.position;
  // ② 大軍の火：渡りの段までは野で揺れ、渡りが始まると渡り口へ寄り、浅瀬を越えて南の岸に溜まる
  for (let i = 0; i < far.length; i++) {
    const f = far[i], o = (UNIT_N + i) * 3;
    if (T.go) { if (f.d > 0) f.d -= dt; else f.t = Math.min(2, f.t + f.v * dt * 1.6); }
    let x, z;
    if (f.t < 1) { const k = f.t * f.t * (3 - 2 * f.t); x = f.x0 + (f.lane - f.x0) * k; z = f.z0 + (FORD.z - 4 - f.z0) * k; }
    else { const k = Math.min(1, f.t - 1); x = f.lane + (f.x1 - f.lane) * k; z = FORD.z - 4 + (f.z1 - FORD.z + 4) * k; }
    const bob = Math.sin(T.time * 2.3 + f.ph) * 0.06;
    if (cam && (x - cam.x) * (x - cam.x) + (z - cam.z) * (z - cam.z) < 576) { pos[o + 1] = -999; continue; }   // 体の無い火はカメラから二十四メートル内では出さない
    pos[o] = x; pos[o + 1] = W.heightAt(x, z) + 2.1 + bob; pos[o + 2] = z;
  }
  T.pts.geometry.attributes.position.needsUpdate = true;
}
