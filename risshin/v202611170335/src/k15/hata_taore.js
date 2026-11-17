// ======================================================================
// 天王寺・岡山：真田の突撃で徳川の旗が次々に倒れる（kaito 11/14 K293「徳川の旗と厭離穢土の大幟が次々に倒れ」）
//   ① 本陣の前（真田の寄せ道を正面で受ける所）に、白地に葵の幟を横一列に立てる（徳川の旗の列）。
//   ② 家康の本陣に「厭離穢土欣求浄土」の大幟を二本（名のある旗。named_gear.js の家康の旗と同じ字の旗）。
//   ③ 豊臣方の兵（騎馬は広く）が幟の根元に寄ると、その幟が根元を軸にゆっくり傾き、地に打って少し跳ね返って横たわる（土煙を一つ）。
//   本陣の葵の幟（F.honNobori・jindate.js）が倒れる時も、ここの動きで倒す（前は一コマで寝ていた）。
// 入れ方：scenery の後で install(rt, P)。update で tick(rt, dt)。本物の兵は増やさない（幟だけ）。
// ======================================================================
import * as THREE from 'three';
import { nobori } from '../props.js';
import { reduceMotion } from '../settings.js';

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
    // 11/14 クラウドし K293：列を真田の寄せ道（茶臼山→家康の本陣）に直角に、実際に赤備えが当たる所（z≈70・二陣の西の脇）へ出した。
    // 前は本陣の前（z≈105）で、騎馬は z 55〜80 の二陣の手前で斬り合って討たれ、旗の列まで届かなかった（k293_charge_shot の数：先頭の z は最大82）
    const k = i / (n - 1) - 0.5, C = P.CHAUSU ? lineAt(P) : { x: P.HONF.x, z: P.HONF.z - 7, px: 1, pz: 0 };
    const x = C.x + C.px * k * 34 + Math.sin(i * 1.7) * 0.6, z = C.z + C.pz * k * 34 + ((i % 2) ? 1.2 : 0);
    const nb = nobori(W, x, z, 'tokugawa', 6.5);
    nb.userData.foot = { x, z };
    whiten(nb);
    nb.rotation.y = Math.atan2(C.dx ?? 0, C.dz ?? -1) + Math.PI + Math.sin(i * 2.3) * 0.12;   // 11/14 クラウドす K293：布を南（真田の寄せ道）へ向ける。風向きのままだと寄せ手からは布が横向きで竿しか見えなかった
    st.line.push(nb); rt.scene.add(nb);
  }
  // ② 家康の本陣の厭離穢土欣求浄土の大幟（陣幕の口の両脇に高く）
  for (const [dx, dz] of [[-6, -8], [8, -8]]) {
    const x = P.HON.x + dx, z = P.HON.z + dz;
    const nb = nobori(W, x, z, 'onri', 9.5);
    nb.userData.foot = { x, z };
    whiten(nb);
    nb.rotation.y = dx * 0.01;   // 大幟も布を南へ
    st.big.push(nb); rt.scene.add(nb);
  }
  return st;
}

// 11/14 K293：葵の幟が黒い板に見える（司令塔②）
const _basic = new Map();
function whiten(nb) {
  const f = nb.children[0], m = f?.material;
  if (!m || !m.map || f.userData.k293White) return;
  // 11/14 クラウドお：光らせる直しが効かず黒い板のままだった（実機の写真）。光に左右されない材質（布の絵・裏表・抜きは同じ）へ替える
  let b = _basic.get(m.map);
  if (!b) { b = new THREE.MeshBasicMaterial({ map: m.map, side: THREE.DoubleSide, alphaTest: 0.5, color: 0xffffff }); _basic.set(m.map, b); }
  f.material = b; f.userData.k293White = 1;
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
  // 11/15 K314：前は 0.2 秒ごとに全兵（約二千）×幟12本の hypot と配列二つを作り、パソコンで毎秒50MB の使い捨てになっていた。
  //   幟の列を囲む箱（60m 広げ）の外の兵は飛ばし、遠さは二乗で比べる
  let any = false;
  if (!st.box) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const nb of st.line.concat(st.big)) { const f = nb.userData.foot; x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x); z0 = Math.min(z0, f.z); z1 = Math.max(z1, f.z); }
    st.box = { x0: x0 - 60, x1: x1 + 60, z0: z0 - 60, z1: z1 + 60 };
  }
  for (const nb of st.line) if (!nb.userData.fall) { any = true; break; }
  if (!any) for (const nb of st.big) if (!nb.userData.fall) { any = true; break; }
  if (!any) return;
  const B = st.box, units = rt.army.units;
  for (let k = 0; k < units.length; k++) {
    const u = units[k];
    if (!u.alive || u.team !== 1 || u.fleeing || !u.pos) continue;
    const ux = u.pos.x, uz = u.pos.z;
    if (ux < B.x0 || ux > B.x1 || uz < B.z0 || uz > B.z1) continue;
    const r = u.type === 'cavalry' || u.horse ? 3.6 : 2.4;
    let d2 = 1e18;
    for (let i = 0; i < st.line.length; i++) { const f = st.line[i].userData.foot, dx = ux - f.x, dz = uz - f.z; const q = dx * dx + dz * dz; if (q < d2) d2 = q; }
    { const dz = Math.round(Math.sqrt(d2)); if (dz < (STAT.minD ?? 1e9)) STAT.minD = dz; }   // 確かめ：敵が旗の列に一番近づいた前後の遠さ（botStat）
    for (let i = 0; i < st.line.length; i++) {
      const nb = st.line[i]; if (nb.userData.fall) continue;
      const p = nb.userData.foot;
      if (Math.abs(ux - p.x) < r && Math.abs(uz - p.z) < r) { topple(rt, nb, ux < p.x ? -1 : 1); if (!st.cined) look(rt, st, p); }
    }
    for (let i = 0; i < st.big.length; i++) {
      const nb = st.big[i]; if (nb.userData.fall) continue;
      const p = nb.userData.foot;
      if (Math.abs(ux - p.x) < 5 && Math.abs(uz - p.z) < 5) topple(rt, nb, ux < p.x ? -1 : 1);
    }
  }
}

// 11/14 クラウドし K293：赤備えが初めて葵の幟の列を倒した瞬間に、近くにいる本人の目を当たりへ二秒あまり向ける（一度だけ）。
// 本人が首を振れば（lookIdle）すぐ解ける既存の cine。動きを減らす設定・遠い時・構え中は向けない
function look(rt, st, p) {
  st.cined = true;
  const P = rt.player, u = P?.u;
  if (!u?.alive || reduceMotion() || P.aiming || P.lock || P.cine || P.camShot) return;
  if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 75) return;
  P.cine = { x: p.x, z: p.z, t: 2.4, encounter: true };
}

// 列の真ん中と向き：茶臼山から家康の本陣への寄せ道が z≈58 を横切る所。px,pz は寄せ道に直角の向き、dx,dz は寄せ手から来る向き
function lineAt(P) {
  const a = P.CHAUSU, b = P.HON, dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
  // 11/14 iMac一：大谷が一騎で先を駆けなくなると、赤備えの騎馬は z 55〜60 で徳川の前の備に当たって止まり、z≈70 の列まで届かなかった（幟は毛利の足軽が倒していた）。
  //   列を当たりの所（z≈58・徳川の前の備の並び）へ下げ、騎馬の横一列が幟の列ごと当たるようにする
  const t = Math.max(0, Math.min(1, (58 - a.z) / (dz || 1)));
  return { x: a.x + dx * t, z: a.z + dz * t, px: dz / L, pz: -dx / L, dx: -dx / L, dz: -dz / L };
}
