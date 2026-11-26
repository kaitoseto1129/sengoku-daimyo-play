// ======================================================================
// 小田原征伐　「支城が落ちる」の段（5〜7分）　docs/odawara_spec_1109.md の 5:00〜7:00
// 史実：山中城（三月二十九日・半日）・韮山（六月二十四日開城）・松井田（四月）・鉢形（六月十四日）・八王子（六月二十三日）・岩槻・玉縄・江戸は開城。
//   忍城だけは石田三成の水攻めに耐え、小田原の開城の後まで落ちなかった。
// 遊び：岸から退いた後、陣で使番が各方面の報を次々に伝える。画面いっぱいの関東の図で、北条の支城の旗が一つずつ外れて豊臣の旗に替わり、
//   小田原（と、なお抵抗する忍）だけに北条の旗が残る。字は出さない（旗と色だけ）。前に遊んだ山中・八王子・忍が小田原へつながる。
// 入れ方：b_t12_odawara.js の段の並び（前衛を退かせた後・陣を回る段の前）に step(H) を置く。
// ======================================================================
import { GRID } from '../japan_data.js';
import { flagTexture } from '../textures.js';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';
import { cells } from './tenka.js';

// 関東の北条の城（c・r は日本地図の升目の目安）。t は落ちる秒（-1 は落ちない）
const CASTLES = [
  { c: 637, r: 744, t: -1, big: true },        // 小田原
  { c: 626, r: 750, t: 3 },                    // 山中（半日で落城）
  { c: 607, r: 664, t: 6.5 },                  // 松井田
  { c: 612, r: 757, t: 10 },                   // 韮山
  { c: 628, r: 687, t: 13.5 },                 // 鉢形
  { c: 636, r: 716, t: 17 },                   // 八王子
  { c: 652, r: 700, t: 20 }, { c: 659, r: 713, t: 21 }, { c: 648, r: 738, t: 22 },   // 岩槻・江戸・玉縄
  { c: 641, r: 682, t: -1 },                   // 忍（なお抵抗）
];
const HOJO_PROV = [10, 11, 12, 14, 15, 16];   // 上野・下総・上総・武蔵・相模・伊豆

export function kantoMap(rt, dur) {
  const { gc, gr } = GRID, cell = cells();
  const B = { x0: 196, y0: 211, w: 46, h: 58 };   // 関東の升目の窓
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(10,14,18,0.9);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 1s;pointer-events:none';
  const cv = document.createElement('canvas');
  const H = Math.min(innerHeight * 0.94, innerWidth * 0.94 * B.h / B.w), W = H * B.w / B.h;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  wrap.appendChild(cv); document.body.appendChild(wrap);
  requestAnimationFrame(() => { wrap.style.opacity = '1'; });
  const g = cv.getContext('2d');
  // 11/18 クラウド小田原の持ち主（物差し⑥）：46×58 の升をそのままぼかして引き伸ばし、岸がにじんだ団子に見えた。
  //   升の陸の濃さを八倍の細かさで滑らかに補い、半ばで切って岸をくっきり・岸に墨の線・和紙の斑（一度だけ描く）
  const U = 8, SW = B.w * U, SH = B.h * U;
  const small = document.createElement('canvas'); small.width = SW; small.height = SH;
  const sg = small.getContext('2d'), img = sg.createImageData(SW, SH), d = img.data;
  const A = (q, r) => (q >= 0 && q < gc && r >= 0 && r < gr && cell.near[r * gc + q] >= 0 ? cell.alpha[r * gc + q] : 0);
  const sea = [40, 60, 72], ink = [52, 40, 28];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const fx = B.x0 + (x + 0.5) / U - 0.5, fy = B.y0 + (y + 0.5) / U - 0.5, q = Math.floor(fx), r = Math.floor(fy), tx = fx - q, ty = fy - r;
    const a = (A(q, r) * (1 - tx) + A(q + 1, r) * tx) * (1 - ty) + (A(q, r + 1) * (1 - tx) + A(q + 1, r + 1) * tx) * ty;
    const s = Math.max(0, Math.min(1, (a - 0.44) / 0.12)), al = s * s * (3 - 2 * s);
    const h = (q2, r2) => (q2 >= 0 && q2 < gc && r2 >= 0 && r2 < gr && HOJO_PROV.includes(cell.near[r2 * gc + q2]) ? 1 : 0);   // 北条の国の濃さも滑らかに（升の段々を消す）
    const hw = (h(q, r) * (1 - tx) + h(q + 1, r) * tx) * (1 - ty) + (h(q, r + 1) * (1 - tx) + h(q + 1, r + 1) * tx) * ty;
    const land = [200 - 22 * hw, 188 - 30 * hw, 152 - 38 * hw];
    const n = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 7 - 3;   // 和紙の斑
    const line = Math.max(0, 1 - Math.abs(a - 0.5) / 0.05) * 0.85;   // 岸の墨の線
    const o = (y * SW + x) * 4;
    for (let k = 0; k < 3; k++) { const c = sea[k] + (land[k] - sea[k]) * al + n; d[o + k] = c + (ink[k] - c) * line; }
    d[o + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  const hojo = flagTexture('hojo').image, toyo = flagTexture('toyotomi').image;
  const t0 = performance.now();
  let raf = 0, closed = false;
  const draw = () => {
    if (closed) return;
    const t = (performance.now() - t0) / 1000;
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, cv.width, cv.height);
    for (const C of CASTLES) {
      const x = (C.c / GRID.step - B.x0) / B.w * cv.width, y = (C.r / GRID.step - B.y0) / B.h * cv.height;
      const s = cv.height * (C.big ? 0.075 : 0.05);
      const k = C.t < 0 ? 0 : Math.max(0, Math.min(1, (t - C.t) / 0.8));   // 0＝北条の旗 1＝豊臣の旗
      // 城の印（丸）。小田原は二重の丸
      g.fillStyle = '#2a2018'; g.beginPath(); g.arc(x, y, s * 0.16, 0, Math.PI * 2); g.fill();
      if (C.big) { g.strokeStyle = '#2a2018'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#3a2c1a'; g.fillRect(x - s * 0.04, y - s * 1.6, s * 0.08, s * 1.6);
      // 北条の旗が引き抜かれ（上へ消え）、豊臣の旗が立つ
      if (hojo && k < 1) { g.globalAlpha = 1 - k; g.drawImage(hojo, x, y - s * 1.6 - k * s * 0.8, s * 0.6, s * 1.0); }
      if (toyo && k > 0) { g.globalAlpha = k; g.drawImage(toyo, x, y - s * 1.6, s * 0.6, s * 1.0); }
      g.globalAlpha = 1;
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  rt.after(dur, () => { wrap.style.opacity = '0'; rt.after(1.1, () => { closed = true; cancelAnimationFrame(raf); wrap.remove(); }, true); }, true);
  return () => { closed = true; cancelAnimationFrame(raf); wrap.remove(); };
}

export function step(H) {
  return {
    kind: 'rest', key: 'shijo', max: 40,
    // 11/18 クラウド小田原の持ち主：報を聞く間に本人が二十秒立つと、放置の寄せ（b_depth）が味方を「篠曲輪の鉄砲（堀の向こう）へかかれ」にして、
    //   松平の侍が山王川の東 (138,-68) で二十秒止まった（act bot 256秒・5回）。報を聞く段は三十五秒で自ら終わるので、放置の寄せを使わない
    idleAdvance: false,
    start(rt, C) {
      const F = rt.flags;
      // 八王子・韮山の開城後の報。次の巡回と同じ六月二十四日の昼。
      F.day = -0.5;
      C.groups = []; C.at = rt.player.u.pos.clone ? { x: rt.player.u.pos.x, z: rt.player.u.pos.z } : H.BANK; C.goal = null; C.say = 0;
      rt.unmark('dp');
      // 絵図の報を聞く間も、退いた前衛の持ち場と目標を残す。
      rt.obj('dp', '山王川の東の岸で、支城が落ちた報を確かめよ', 'main');
      rt.marker('dp', H.BANK, '山王川の岸', { h: 3 });
      rt.say('使番', '各方面より知らせ！　殿下の陣の絵図をご覧あれ', 3.2);
      sfx('horagai', 0.6);
      rt.after(1.2, () => { F.kantoClose = kantoMap(rt, 25); });
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags;
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(4, () => rt.say('使番', '山中城、落城！　半日で落ちました', 3));
      line(7.5, () => rt.say('使番', '松井田城、開城！', 2.6));
      line(11, () => rt.say('使番', '韮山城、開城！', 2.6));
      line(14.5, () => rt.say('使番', '鉢形方面、攻略進展！　鉢形も開きました', 3));
      line(18, () => rt.say('使番', '八王子城、陥落！', 2.8));
      line(21.5, () => rt.say('使番', '岩槻・江戸・玉縄も開城。……忍城、なお抵抗！', 3.4));
      line(26.5, () => rt.say(nm(rt), '小田原と忍には、まだ北条の旗が残っておるか', 3.4));
      line(30.5, () => rt.say('井伊直政', '城の外は、もう全部が敵よ。氏直殿も、城の上から見ておろう', 3.8));
      if (C.say >= 18 && !C.dn) { C.dn = true; F.keisen = Math.max(0, (F.keisen ?? 100) - 30); }
      return el > 35;
    },
    end(rt) {
      const F = rt.flags;
      if (F.kantoClose) { F.kantoClose(); F.kantoClose = null; }
      rt.objDone('dp');
      rt.unmark('dp');
    },
  };
}
