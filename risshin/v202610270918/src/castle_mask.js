// 城の曲輪の地面の印（world.js の地面の絵が読む）：赤＝曲輪の平場、緑＝曲輪のまわりの切岸・土塁の法。
// 本の CG（岡崎・躑躅ヶ崎・小田原・春日山）の「平場は踏み固めた土と白っぽい砂利、法は草の土手」を、
// 戦ごとに地面の絵を書き換えずに全部の城へ出すため。縄張り（castle_plan.js の kuruwa の poly）から一枚描くだけ。
import * as THREE from 'three';

let BLANK = null;
export function castleMaskBlank() {
  if (!BLANK) { BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1); BLANK.needsUpdate = true; }
  return BLANK;
}

// world：その戦の World。polys：[[x,z],...] の並び。plan.floorLook === false の城は呼ばない
export function setCastleMask(world, polys) {
  if (!world || !world.groundU || !world.groundU.uCastle || typeof document === 'undefined') return;
  const all = (world._castlePolys || (world._castlePolys = []));
  for (const p of polys) if (p && p.length >= 3) all.push(p);
  if (!all.length) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of all) for (const [x, z] of p) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const M = 24; x0 -= M; z0 -= M;
  const size = Math.max(x1 + M - x0, z1 + M - z0), N = size > 600 ? 512 : 256, k = N / size;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const cr = mk(), cg = mk(), gr = cr.getContext('2d'), gg = cg.getContext('2d');
  const path = (g, p) => { g.beginPath(); p.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, (x - x0) * k, (z - z0) * k)); g.closePath(); };
  gr.fillStyle = '#000'; gr.fillRect(0, 0, N, N); gg.fillStyle = '#000'; gg.fillRect(0, 0, N, N);
  // 法：縁の外へ 14m ほど、外ほど薄く
  gg.globalCompositeOperation = 'lighter'; gg.lineJoin = 'round';
  for (const w of [28, 18, 9]) { gg.strokeStyle = 'rgb(85,85,85)'; gg.lineWidth = w * k; for (const p of all) { path(gg, p); gg.stroke(); } }
  gg.fillStyle = '#fff'; for (const p of all) { path(gg, p); gg.fill(); }
  // 平場：中は満ちて、縁の 1.5m ほどは草の残る帯（シェーダーの rim）
  gr.fillStyle = '#fff'; for (const p of all) { path(gr, p); gr.fill(); }
  gr.strokeStyle = 'rgb(120,120,120)'; gr.lineWidth = Math.max(1, 3 * k); gr.lineJoin = 'round'; for (const p of all) { path(gr, p); gr.stroke(); }
  const R = gr.getImageData(0, 0, N, N).data, G = gg.getImageData(0, 0, N, N).data, out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { out[i * 4] = R[i * 4]; out[i * 4 + 1] = G[i * 4]; out[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(out, N, N);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const old = world.groundU.tCastle.value;
  world.groundU.tCastle.value = tex;
  if (old && old !== BLANK) old.dispose();
  world.groundU.uCastle.value.set(x0, z0, 1 / size, 1);
}
