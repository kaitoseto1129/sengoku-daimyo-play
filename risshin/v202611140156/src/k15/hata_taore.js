// ======================================================================
// 天王寺・岡山：真田の突撃で徳川の旗が次々に倒れる（kaito 11/14 K293「徳川の旗と厭離穢土の大幟が次々に倒れ」）
//   ① 本陣の前（真田の寄せ道を正面で受ける所）に、白地に葵の幟を横一列に立てる（徳川の旗の列）。
//   ② 家康の本陣に「厭離穢土欣求浄土」の大幟を二本（名のある旗。named_gear.js の家康の旗と同じ字の旗）。
//   ③ 豊臣方の兵（騎馬は広く）が幟の根元に寄ると、その幟が根元を軸にゆっくり傾き、地に打って少し跳ね返って横たわる（土煙を一つ）。
//   本陣の葵の幟（F.honNobori・jindate.js）が倒れる時も、ここの動きで倒す（前は一コマで寝ていた）。
// 入れ方：scenery の後で install(rt, P)。update で tick(rt, dt)。本物の兵は増やさない（幟だけ）。
// ======================================================================
import { nobori } from '../props.js';

const FALL_T = 1.1;
// 確かめの数（戦が終わると rt.flags は空になるので、ここに残す。botStat が読む）
export const STAT = { fell: 0, minD: null };   // 倒れきるまでの秒
// 一本を倒し始める（もう倒れている物はそのまま）。dir：倒れる向き（+1 / -1）
export function topple(rt, nb, dir) {
  const st = rt.flags._hata;
  if (!st || !nb || nb.userData.fall) return;
  STAT.fell++;
  nb.userData.fall = { t: 0, d: dir || (Math.random() < 0.5 ? -1 : 1), z0: nb.rotation.z, x0: nb.rotation.x, tilt: (Math.random() - 0.5) * 0.5 };
  st.falling.push(nb);
}

export function install(rt, P) {
  const W = rt.world, F = rt.flags;
  const st = { line: [], big: [], falling: [], scanT: 0 };
  F._hata = st; STAT.fell = 0; STAT.minD = null;
  // ① 本陣の前の葵の幟の列（x -66〜-34・本陣の前の持ち場の少し南。旗本の二の備えの前に並ぶ）
  const n = 12;
  for (let i = 0; i < n; i++) {
    const x = P.HONF.x - 16 + (i / (n - 1)) * 32, z = P.HONF.z - 7 + ((i % 2) ? 1.2 : 0) + Math.sin(i * 1.7) * 0.6;
    const nb = nobori(W, x, z, 'tokugawa', 6.5);
    nb.userData.foot = { x, z };
    st.line.push(nb); rt.scene.add(nb);
  }
  // ② 家康の本陣の厭離穢土欣求浄土の大幟（陣幕の口の両脇に高く）
  for (const [dx, dz] of [[-6, -8], [8, -8]]) {
    const x = P.HON.x + dx, z = P.HON.z + dz;
    const nb = nobori(W, x, z, 'onri', 9.5);
    nb.userData.foot = { x, z };
    st.big.push(nb); rt.scene.add(nb);
  }
  return st;
}

export function tick(rt, dt) {
  const F = rt.flags, st = F._hata;
  if (!st) return;
  // 倒れる動き：初めはゆっくり、だんだん速く（重さで落ちる）。地に打って小さく跳ね返る
  for (let i = st.falling.length - 1; i >= 0; i--) {
    const nb = st.falling[i], f = nb.userData.fall;
    f.t += dt;
    const k = Math.min(1, f.t / FALL_T);
    let a = k * k * 1.5;
    if (k >= 1) {
      const b = f.t - FALL_T;   // 跳ね返り（0.35 秒）
      a = 1.5 - Math.max(0, Math.sin(Math.min(1, b / 0.35) * Math.PI)) * 0.12;
      if (!f.hit) { f.hit = true; const p = nb.userData.foot; if (p && rt.world.dustCloud) rt.world.dustCloud(p.x, p.z, false); }
      if (b > 0.35) { a = 1.5; st.falling.splice(i, 1); }
    }
    nb.rotation.z = f.z0 + f.d * a;
    nb.rotation.x = f.x0 + f.tilt * k;
  }
  if (F.ending) return;
  // 豊臣方の兵が幟の根元に寄ったら倒す（0.2 秒に一度だけ見る）
  if ((st.scanT -= dt) > 0) return;
  st.scanT = 0.2;
  const left = st.line.filter((nb) => !nb.userData.fall);
  const bigLeft = st.big.filter((nb) => !nb.userData.fall);
  if (!left.length && !bigLeft.length) return;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== 1 || u.fleeing || !u.pos) continue;
    const r = u.type === 'cavalry' || u.horse ? 3.6 : 2.4;
    { const dz = Math.abs(u.pos.z - st.line[0].userData.foot.z); if (u.pos.x > -70 && u.pos.x < -30 && dz < (STAT.minD ?? 1e9)) STAT.minD = Math.round(dz); }   // 確かめ：敵が旗の列に一番近づいた前後の遠さ（botStat）
    for (const nb of left) {
      const p = nb.userData.foot;
      if (Math.abs(u.pos.x - p.x) < r && Math.abs(u.pos.z - p.z) < r) topple(rt, nb, u.pos.x < p.x ? -1 : 1);
    }
    for (const nb of bigLeft) {
      const p = nb.userData.foot;
      if (Math.abs(u.pos.x - p.x) < 5 && Math.abs(u.pos.z - p.z) < 5) topple(rt, nb, u.pos.x < p.x ? -1 : 1);
    }
  }
}
