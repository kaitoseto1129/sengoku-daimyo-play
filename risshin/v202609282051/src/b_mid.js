// ======================================================================
// 織田家編の中ほどの戦（箕作・長島・野田福島・志賀・伊賀・三木・鳥取・高遠・手取川・雑賀）を濃くする共通の道具
//   b_depth.js の段（rest・pick・fight・hold・move）に、次の三つを足す：
//   ・包囲：round(at, a, r) で、敵の正面（a の向き）・左・右・後ろの寄せ口を出す。敵は左右と後ろへ回り込んで来る
//   ・鉄砲の列：gunLine(...) は鉄砲だけの組（6 挺より多いので units.js で「構え」から揃えて一斉に放つ）を、少し離れた所に並べる
//   ・大軍の激突：lines(rt, [...]) で、本物の兵が受け持つ真ん中の左右に、軽い大軍どうしの押し合い（world.addClash）を並べる
// ======================================================================
import { clash } from './b_sekigahara.js';

export const uS = (n, o) => ({ type: 'samurai', n, ...(o ? { o } : {}) });
export const uA = (n) => ({ type: 'ashigaru', n });
export const uG = (n) => ({ type: 'gun', n });
export const uB = (n) => ({ type: 'bow', n });
export const uC = (n) => ({ type: 'cavalry', n });
export const uBu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, ...o } });

// 寄せ口：at から a の向き（0 = +z、PI/2 = +x）に r 離れた所が正面。左右と後ろも返す
export function round(at, a, r = 50) {
  const p = (d, k = 1) => ({ x: Math.round(at.x + Math.sin(a + d) * r * k), z: Math.round(at.z + Math.cos(a + d) * r * k) });
  return { front: p(0), left: p(Math.PI / 2), right: p(-Math.PI / 2), back: p(Math.PI, 0.9), fl: p(Math.PI / 4), fr: p(-Math.PI / 4), bl: p(Math.PI * 0.75, 0.9), br: p(-Math.PI * 0.75, 0.9) };
}

// 鉄砲の列：鉄砲だけの組。段の場所 at と寄せ口 from の間（at から 45% の所）に横一列で並び、揃えて撃つ
export function gunLine(name, from, at, n = 8, x = {}) {
  const off = { x: Math.round((from.x - at.x) * 0.45), z: Math.round((from.z - at.z) * 0.45) };
  return { name, from, off, list: [uS(1), uG(n)], formation: 'line', width: 20, seek: 75, mass: 110, kind: 'gun', dmg: 0.45, ...x };   // 数が多いので一発は軽め（恐さは音と数で）
}

// 大軍どうしの押し合い（軽い作り）。o：{ x, z, facing, w, seed, A:[flag, armor, count, faction], B:[…], surge, guns, bows }
//   facing は A（味方）の向き。返すのは clash の並び。go() で寄せ合う
export function lines(rt, list) {
  return list.map((o) => {
    const [fa, aa, na, fca] = o.A, [fb, ab, nb, fcb] = o.B;
    return clash(rt, {
      x: o.x, z: o.z, facing: o.facing, w: o.w || 60, gap0: o.gap0 ?? 34, closeSpeed: 3.6, seed: o.seed, noRout: true, killRate: 0.12,
      surge: o.surge === false ? undefined : { k: 'B', every: 50, count: 150, flank: 0.3, ...(o.surge || {}) },
      A: { flag: fa, armor: aa, count: na, team: 0, faction: fca, ...(o.gunsA ? { guns: true } : {}) },
      B: { flag: fb, armor: ab, count: nb, team: 1, faction: fcb, flagRate: o.flagRateB ?? 0.5, ...(o.gunsB ? { guns: true } : {}), ...(o.bowsB ? { bows: true } : {}) },
    });
  });
}
// 押し合いの流れを変える：side の側へ押す（k 0〜1）
export const leanAll = (L, side, k) => { for (const c of L || []) c.push(side, k); };
// 鉄砲の一斉射撃（煙と音）を押し合いの上で
export const volleyAll = (L, side) => { for (const c of L || []) c.volley(side); };
