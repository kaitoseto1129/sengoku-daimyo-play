// ======================================================================
// 小田原征伐　終幕「開城・天下統一」（15〜18分）　docs/toyo15_plan_1108.md の 15
// 史実：七月五日、北条氏直は滝川雄利の陣へ出て降り、城は開いた。十一日に氏政・氏照が切腹、十三日に秀吉が入城し、
//   北条の関東は徳川家康に与えられた（関八州）。続く奥州仕置で、日本中が秀吉の下に一つになった。
// 遊び：戦では終わらない。北条の旗が下がり、門の兵は槍を伏せて座る。「小田原城　開城」→「天下統一」。
//   日本地図の国々が近畿から順に豊臣の色に染まり、列島に桐の旗が立つ（字は出さない）。
//   最後は暗転して、徳川の陣の外れに立つ家康の背。小田原城を見て「次は、関八州か。」（徳川編への伏線）。
// 入れ方：b_t12_odawara.js の win から ending(rt, H) を呼ぶ。済むと rt.finish。
// ======================================================================
import { GRID, PROVINCES } from '../japan_data.js';
import { flagTexture } from '../textures.js';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';
import { k15Fade } from '../oda15_kit.js';

// 国の番 → 地方（近畿から順に豊臣の色へ。関東は今、東北は奥州仕置で）
const REGIONS = [
  [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],          // 近畿
  [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57],      // 中国
  [58, 59, 60, 61, 62],                                          // 四国
  [63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73],                  // 九州
  [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],      // 中部
  [8, 9, 10, 11, 12, 13, 14, 15, 16],                            // 関東
  [0, 1, 2, 3, 4, 5, 6, 7],                                      // 東北
];
const FILL_AT = [0.6, 1.4, 2.2, 3.0, 4.0, 6.0, 8.6];   // 地方ごとに染まり始める秒（関東・東北はゆっくり）
const GOLD = [196, 158, 52];

// 升目の国の番（japan.js の shape と同じ読み方）
let CELLS = null;
export function cells() {
  if (CELLS) return CELLS;
  const { gc, gr, alpha } = GRID, idx = new Map([...alpha].map((ch, i) => [ch, i]));
  const c = new Int16Array(gc * gr).fill(-1);
  let k = 0;
  for (let i = 0; i < GRID.prov.length; i += 2) { const v = idx.get(GRID.prov[i]) - 1, n = idx.get(GRID.prov[i + 1]); c.fill(v, k, k + n); k += n; }
  // 陸の外枠（升目）：地図は陸の所だけを切り出して大きく描く
  let x0 = gc, x1 = 0, y0 = gr, y1 = 0;
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) if (c[r * gc + q] >= 0) { if (q < x0) x0 = q; if (q > x1) x1 = q; if (r < y0) y0 = r; if (r > y1) y1 = r; }
  c.box = { x0: x0 - 4, y0: y0 - 4, w: x1 - x0 + 9, h: y1 - y0 + 9 };
  // 縁を滑らかに（japan.js の地図と同じく、陸をぼかして半ばで切る）。海の升でも、ぼかして陸になる所は近くの国の色を借りる
  const N = gc * gr, a = new Float32Array(N), b = new Float32Array(N), R = 2;
  for (let i = 0; i < N; i++) a[i] = c[i] >= 0 ? 1 : 0;
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) { let s0 = 0, n = 0; for (let d = -R; d <= R; d++) { const x = q + d; if (x >= 0 && x < gc) { s0 += a[r * gc + x]; n++; } } b[r * gc + q] = s0 / n; }
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) { let s0 = 0, n = 0; for (let d = -R; d <= R; d++) { const y = r + d; if (y >= 0 && y < gr) { s0 += b[y * gc + q]; n++; } } a[r * gc + q] = s0 / n; }
  c.alpha = new Float32Array(N); c.near = new Int16Array(N).fill(-1);
  for (let r = 0; r < gr; r++) for (let q = 0; q < gc; q++) {
    const i = r * gc + q, k = Math.max(0, Math.min(1, (a[i] - 0.38) / 0.24));
    c.alpha[i] = k * k * (3 - 2 * k);
    if (c[i] >= 0) { c.near[i] = c[i]; continue; }
    if (c.alpha[i] <= 0) continue;
    for (let d = 1; d <= 3 && c.near[i] < 0; d++) for (let dy = -d; dy <= d && c.near[i] < 0; dy++) for (let dx = -d; dx <= d; dx++) { const y = r + dy, x = q + dx; if (x >= 0 && x < gc && y >= 0 && y < gr && c[y * gc + x] >= 0) { c.near[i] = c[y * gc + x]; break; } }
  }
  return (CELLS = c);
}
const regionOf = (() => { const m = new Map(); REGIONS.forEach((L, r) => L.forEach((p) => m.set(p, r))); return (p) => m.get(p) ?? -1; })();

// 日本地図の場面（16秒ほど）。画面いっぱいの絵。字は出さない。「動きを減らす」でも染まりは見せる（点滅はしない）
function japanMap(rt, dur = 16) {
  const { gc, gr } = GRID, cell = cells();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:60;background:#0d1720;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 1.2s;pointer-events:none';
  const cv = document.createElement('canvas');
  const B = cell.box, H = Math.min(innerHeight * 0.96, innerWidth * 0.96 * B.h / B.w), W = H * B.w / B.h;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  wrap.appendChild(cv); document.body.appendChild(wrap);
  requestAnimationFrame(() => { wrap.style.opacity = '1'; });
  const g = cv.getContext('2d');
  const small = document.createElement('canvas'); small.width = gc; small.height = gr;
  const sg = small.getContext('2d'), img = sg.createImageData(gc, gr);
  // 初めの国の色：くすんだ土・緑・藍を国ごとに少しずつ変える（家ごとの色の代わり。字は出さない）
  const base = (p) => { const h = (p * 47) % 360, s = 0.22, l = 0.36 + ((p * 13) % 7) * 0.012; const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; };
  const flag = flagTexture('toyotomi').image;
  const t0 = performance.now();
  let raf = 0, closed = false;
  const draw = () => {
    if (closed) return;
    const t = (performance.now() - t0) / 1000;
    const d = img.data;
    for (let i = 0; i < cell.length; i++) {
      const p = cell.near[i], o = i * 4, al = cell.alpha[i];
      if (p < 0 || al <= 0) { d[o] = 13; d[o + 1] = 23; d[o + 2] = 32; d[o + 3] = 255; continue; }
      const r = regionOf(p), k = r < 0 ? 0 : Math.max(0, Math.min(1, (t - FILL_AT[r] - (p % 5) * 0.08) / (r >= 5 ? 1.6 : 0.7)));
      const b = base(p);
      const R0 = b[0] + (GOLD[0] - b[0]) * k, G0 = b[1] + (GOLD[1] - b[1]) * k, B0 = b[2] + (GOLD[2] - b[2]) * k;
      d[o] = 13 + (R0 - 13) * al; d[o + 1] = 23 + (G0 - 23) * al; d[o + 2] = 32 + (B0 - 32) * al; d[o + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(small, B.x0, B.y0, B.w, B.h, 0, 0, cv.width, cv.height);
    // 染まった地方に桐の旗（幟）を一本ずつ立てる（地方の国々の真ん中）
    if (flag) for (let r = 0; r < REGIONS.length; r++) {
      const k = (t - FILL_AT[r] - 0.9) / 0.6; if (k <= 0) continue;
      const L = REGIONS[r].map((id) => PROVINCES[id]).filter(Boolean);
      const cx = L.reduce((a, P) => a + P.c, 0) / L.length / GRID.step, cy = L.reduce((a, P) => a + P.r, 0) / L.length / GRID.step;
      const x = (cx - B.x0) / B.w * cv.width, y = (cy - B.y0) / B.h * cv.height, s = cv.height * 0.07;
      g.globalAlpha = Math.min(1, k);
      g.fillStyle = '#3a2c1a'; g.fillRect(x - s * 0.05, y - s * 1.9, s * 0.1, s * 1.9);
      g.drawImage(flag, x, y - s * 1.9, s * 0.62, s * 1.2);
      g.globalAlpha = 1;
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  sfx('horagai', 0.7);
  rt.after(dur, () => { wrap.style.opacity = '0'; rt.after(1.3, () => { closed = true; cancelAnimationFrame(raf); wrap.remove(); }, true); }, true);
  return () => { closed = true; cancelAnimationFrame(raf); wrap.remove(); };
}

export function ending(rt, H) {
  const F = rt.flags, me = nm(rt);
  // 北条の旗が下がり、門の兵は槍を伏せて座る
  if (F.lowerT == null) F.lowerT = rt.t;
  for (const g of rt.army.groups || []) if (g.team === 1) { g.peaceful = true; g.fire = false; for (const u of g.units) if (u.alive && !u.name) u._crouch = true; }
  rt.say('北条氏直', '城を開く。わしの腹ひとつで、城の者の命を助けてくだされ', 4.4);
  rt.after(4.8, () => rt.say('黒田官兵衛', 'そのお覚悟、しかと殿下に申し上げまする', 4));
  rt.after(9, () => rt.say('使番', '小田原、開城！　氏直殿、滝川殿の陣へ出て降られた', 4));
  // 石垣山の高所の秀吉は、斬らずに天下を取った。一言だけ（docs/odawara_spec_1109.md）
  rt.after(13.2, () => rt.say('豊臣秀吉', '……終わったか。', 3.2));
  rt.after(16.6, () => rt.say(me, '稲生で槍を握った日から……桶狭間、稲葉山、姉川、長篠、山崎。ここまで来た', 4.4));
  rt.after(21.4, () => rt.banner('天下統一', '天正十八年七月　日本中が、ひとつの号令の下に'));
  // 日本地図：近畿から順に豊臣の色に
  rt.after(23, () => { F.mapClose = japanMap(rt, 17); });
  rt.after(25, () => rt.say('使番', '十一日、氏政殿と氏照殿が腹を召された。氏直殿は高野山へ', 4.2));
  rt.after(30, () => rt.say('使番', '十三日、殿下が城に入られた。北条の関東は、徳川殿に任せるとの仰せじゃ', 4.4));
  rt.after(35.5, () => rt.say('使番', '奥州の伊達・南部も殿下に従うた。もう、殿下に逆らう国は無い', 4.2));
  // 暗転して、徳川の陣の外れの家康の背：小田原城を見ている
  rt.after(41.5, () => {
    k15Fade(rt, () => {
      const ie = F.ieyasu?.units.find((u) => u.name === '徳川家康');
      const at = H.IE_VIEW, cx = H.CASTLE.x, cz = H.CASTLE.z, hd = Math.atan2(cx - at.x, cz - at.z);
      if (ie) {
        ie._crouch = false; F.ieyasu.anchor = { ...at };
        ie.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z); ie.heading = hd; if (ie.mesh) { ie.mesh.position.copy(ie.pos); ie.mesh.rotation.y = hd; }
        for (const u of F.ieyasu.units) if (u !== ie && u.alive) { u.target = null; }
      }
      rt.world.setTime('dusk');
      H.warp(rt, at.x - Math.sin(hd) * 7 + 2, at.z - Math.cos(hd) * 7, hd);
    });
    rt.after(3, () => rt.say(me, '……家康殿が、ひとり城を見ておられる', 3));
    rt.after(7, () => rt.say('徳川家康', '……次は、関八州か。', 4.4));
  });
  rt.after(1.5, () => { if (F.hojoFlags) F.lowering = true; });
}

// 北条の旗を下げる（win の後も update から毎コマ呼ぶ）
export function tick(rt) {
  const F = rt.flags;
  if (!F.lowering || !F.hojoFlags) return;
  const k = Math.min(1, (rt.t - F.lowerT - 1.5) / 7);
  for (const f of F.hojoFlags) { if (f.userData.y0 == null) f.userData.y0 = f.position.y; f.position.y = f.userData.y0 - k * 6; if (k >= 1) f.visible = false; }
}
