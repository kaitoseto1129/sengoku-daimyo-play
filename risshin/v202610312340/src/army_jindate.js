// 野戦の陣立て（army_formation.js を戦に入れる係。kaito 10/29「軍は備の集まり」・10/30「遠くの大軍も描く」）
// 開戦の画面で、先陣・二陣・本陣の備が縦に並ぶ大軍対大軍に見せる。本物の兵は足さない（中景・遠景は軽い作りだけ）。
//   先陣の左右の翼：軽い大軍どうしの乱戦（addClash）。中央は本物の兵の戦（台本のまま）
//   二陣・三陣・本陣・旗本：軽い備（addDistantArmy）。army_formation の考えで、先陣が崩れれば二陣が出る・押していれば続く
//   本陣が襲われると旗本が動く。使番の遅れ・層ごとの士気も army_formation のまま
// 置き場は「持ち場（spawn）と向き（heading）」から測る。戦ごとの差は PLAN の数だけ（戦のファイルは触らない）。
// 勝ち負け・任務・本物の兵の数には入れない（bot の勝ちを変えない）。重さ：0.5 秒に一度だけ考える。毎コマ new しない。
import { makeArmy, armyTick, armyLoss, routSonae } from './army_formation.js';
import { clash } from './b_sekigahara.js';
import { ARMOR } from './b_nagashinojo.js';

const side = (flag, faction, armor, form = '魚鱗') => ({ flag, faction, armor, form });
const ODA = side('oda', 'oda', ARMOR.oda);
// 戦ごと：A は味方（プレイヤーの側）、B は敵。ahead：持ち場から前の何 m に敵の先陣の前の列を置くか。
//   lat：左右の翼の乱戦を中央から何 m 横へ。wings：false なら翼の乱戦を置かない（すでに台本が置く戦）。
//   dir：味方の向き（無ければ持ち場の向き）。turn：その向きからのずれ（ラジアン）。back：味方の本陣を持ち場から後ろへ何 m。
export const PLAN = {
  inou: { A: ODA, B: side('oda', 'oda', 0x3a2c26), ahead: 40, lat: 52, men: 0.5 },
  okehazama: { A: ODA, B: side('imagawa', 'imagawa', ARMOR.imagawa, '鶴翼'), ahead: 45, lat: 66, wings: false },
  moribe: { A: ODA, B: side('saito', 'saito', ARMOR.saito), ahead: 50, lat: 58, wings: false },
  anegawa: { A: ODA, B: side('azai', 'azai', 0x2f2a26), dir: Math.PI, ahead: 22, lat: 70, wings: false },
  mikatagahara: { A: side('tokugawa', 'tokugawa', ARMOR.tokugawa, '鶴翼'), B: side('takeda', 'takeda', ARMOR.takeda), dir: Math.PI, ahead: 40, lat: 58 },
  shitaragahara: { A: ODA, B: side('takeda', 'takeda', ARMOR.takeda), ahead: 38, lat: 64, wings: false },
};

// 一つの側の備（左翼・中央・右翼 × 先陣・二陣、本陣・旗本・後詰）。中央の先陣は本物の兵の戦なので描かない。
const ROWS = [
  ['saki_l', 'senjin', 'left', 400], ['saki_c', 'senjin', 'center', 500], ['saki_r', 'senjin', 'right', 400],
  ['ni_l', 'nijin', 'left', 350], ['ni_r', 'nijin', 'right', 350], ['san_c', 'sanjin', 'center', 300],
  ['hon', 'honjin', 'center', 300], ['hata', 'hatamoto', 'center', 150], ['goto', 'gotsume', 'right', 400],
];
// 前の列（先陣の前）から後ろへ何 m（縦の並び）・横の何倍（army_formation の右の値を縮める）
const DEPTH = { senjin: 0, nijin: 28, sanjin: 48, honjin: 68, hatamoto: 76, gotsume: 45 };   // 霧の手前に二陣・本陣が見える深さ
const SHOW = { nijin: 140, sanjin: 100, honjin: 80, hatamoto: 40, gotsume: 120 };

function sideArmy(team, P, men) {
  return makeArmy({ team, facing: 0, hatamotoRange: 22, formation: P.form, terrain: 'plain', width: 70,
    sonae: ROWS.map(([id, line, wing, n]) => ({ id, line, wing, men: Math.round(n * men), arrive: 110 + team * 25 })) });
}

// 乾いた所まで後ろへずらす（川・池に備を立てない）。無ければ null
function dry(W, x, z, bx, bz) {
  for (let k = 0; k <= 30; k += 6) {
    const px = x + bx * k, pz = z + bz * k;
    if (!(W.waterDepthAt?.(px, pz) > 0.25)) return { x: px, z: pz };
  }
  return null;
}

export function jindateSetup(rt, P) {
  const W = rt.world, sp = rt.def.spawn || { x: 0, z: 0, heading: 0 };
  const h = (P.dir ?? sp.heading ?? 0) + (P.turn || 0), fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const men = P.men || 1;
  // 前線の真ん中（両軍の先陣が組み合う所）
  const F = { x: sp.x + fx * P.ahead, z: sp.z + fz * P.ahead };
  // 遠さの目安（outsideNearView）は持ち場から測る。設営の時はまだカメラの焦点が持ち場に無いことがある
  const lf = W.lastFocus; W.lastFocus = { x: sp.x, z: sp.z };
  try { return build(rt, W, P, sp, h, men, F); } finally { W.lastFocus = lf; }
}
function build(rt, W, P, sp, h, men, F) {
  const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const J = { P, F, fx, fz, rx, rz, A: sideArmy(0, P.A, men), B: sideArmy(1, P.B, men), vis: new Map(), clashes: [], t: 0 };
  for (const [key, team] of [['A', 0], ['B', 1]]) {
    const A = J[key], S = P[key], dir = team ? 1 : -1;   // 味方は前線の手前（後ろ）へ、敵は前線の向こうへ
    const face = team ? h + Math.PI : h;
    for (const s of A.sonae) {
      const lat = s.wing === 'left' ? -1 : s.wing === 'right' ? 1 : 0;
      // 敵から見た左右は逆。翼の名は各軍の向きで、置き場は画面の左右で揃える
      const side = team ? -lat : lat;
      // 敵は前線の向こうへ。味方は持ち場（自分の先陣）の後ろへ（60m の内に軽い兵を出さない決まりは world_army が守る）
      const back = (s.line === 'senjin' ? 6 : DEPTH[s.line]) + (team ? 0 : 34 + (P.back || 0));
      const O = team ? F : sp;
      const wide = s.line === 'senjin' ? P.lat : s.line === 'honjin' || s.line === 'hatamoto' ? 0 : P.lat * 0.55;
      let x = O.x + rx * side * wide + fx * dir * back, z = O.z + rz * side * wide + fz * dir * back;
      if (s.line === 'hatamoto') { x += rx * 18; z += rz * 18; }
      s.at = { x, z, face };
      // 味方の後ろの備は開戦の画面に入らない（見えない所は描かない）。考えだけ持つ
      if (s.line === 'senjin' || !SHOW[s.line] || !team) continue;
      const p = dry(W, x, z, fx * dir, fz * dir);
      if (!p) continue;
      s.at.x = p.x; s.at.z = p.z;
      const n = Math.round(SHOW[s.line] * men);
      const g = W.addDistantArmy({ x: p.x, z: p.z, w: s.line === 'honjin' ? 22 : s.line === 'hatamoto' ? 14 : 34, d: s.line === 'honjin' ? 14 : 12,
        count: n, facing: face, armor: S.armor, flag: S.flag, team, kind: s.line === 'honjin' ? 'honjin' : s.line === 'hatamoto' ? 'cavalry' : 'mixed',
        seed: 4100 + team * 50 + J.vis.size, host: false });
      if (g?.army) g.army.noWake = true;
      if (s.line === 'gotsume' && g) g.visible = false;
      J.vis.set(s, g);
    }
  }
  // 先陣の左右の翼：軽い大軍どうしの乱戦（はじめから組み合わせ、開戦の画面で前線が乱戦に見える）
  if (P.wings !== false) for (const wing of ['left', 'right']) {
    const lat = wing === 'left' ? -1 : 1;
    const x = F.x + rx * lat * P.lat, z = F.z + rz * lat * P.lat;
    if (W.waterDepthAt?.(x, z) > 0.25) continue;
    const C = clash(rt, { x, z, facing: h, w: 46, gap0: 0, seed: 4300 + J.clashes.length, noRout: false, noWake: true, host: false,
      A: { flag: P.A.flag, armor: P.A.armor, count: Math.round(220 * men), team: 0, faction: P.A.faction },
      B: { flag: P.B.flag, armor: P.B.armor, count: Math.round(240 * men), team: 1, faction: P.B.faction, bows: true } });
    const sa = J.A.sonae.find((s) => s.id === 'saki_' + wing[0]);
    // 敵の翼の名は敵の向きで逆
    const sb = J.B.sonae.find((s) => s.id === 'saki_' + (wing === 'left' ? 'r' : 'l'));
    J.clashes.push({ C, sa, sb, lostA: 0, lostB: 0 });
  }
  rt.flags.jindate = J;
  return J;
}

function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
function nearestFoe(J, A, s) {
  const E = A === J.A ? J.B : J.A;
  let d = Infinity;
  for (const o of E.sonae) if (o.here && o.alive && o.at) d = Math.min(d, dist2(s.at, o.at));
  return Math.sqrt(d);
}

// 毎コマ（定義の update の後）。0.5 秒に一度だけ考え、変わった所だけ軽い備を動かす
export function jindateTick(rt, dt) {
  const J = rt.flags.jindate;
  if (!J) return;
  J.t += dt;
  for (const k of J.clashes) {
    const st = k.C.stat?.();
    if (!st) continue;
    k.st = st;
    const la = (st.lostA || 0) - k.lostA, lb = (st.lostB || 0) - k.lostB;
    if (la > 0 && k.sa) { armyLoss(J.A, k.sa.id, la * 2); k.lostA = st.lostA; }
    if (lb > 0 && k.sb) { armyLoss(J.B, k.sb.id, lb * 2); k.lostB = st.lostB; }
    if (st.A === 0 && k.sa?.alive) routSonae(J.A, k.sa, '翼が崩れた');
    if (st.B === 0 && k.sb?.alive) routSonae(J.B, k.sb, '翼が崩れた');
  }
  const sense = (A) => (s) => {
    if (s.line === 'senjin') {
      const k = J.clashes.find((q) => q.sa === s || q.sb === s);
      if (!k?.st) return { enemyDist: 0, push: 0, contact: true };
      const m = (k.st.mA ?? 100) - (k.st.mB ?? 100);
      return { enemyDist: 0, push: (A === J.A ? m : -m) / 60, contact: true };
    }
    return { enemyDist: nearestFoe(J, A, s), push: 0 };
  };
  const ta = armyTick(J.A, J.t, dt, sense(J.A));
  const tb = armyTick(J.B, J.t, dt, sense(J.B));
  if (!ta && !tb) return;
  for (const [A, dir] of [[J.A, -1], [J.B, 1]]) for (const s of A.sonae) {
    const g = J.vis.get(s);
    if (!g || s._shown === s.state) continue;
    const was = s._shown; s._shown = s.state;
    if (was === undefined) continue;
    if (s.line === 'gotsume' && s.here && !g.visible) g.visible = true;
    if ((s.state === 'advance' || s.state === 'fight' || s.state === 'pursue') && !s._moved) {
      // 二陣・後詰が前へ出る：先陣のすぐ後ろまで寄る（前の列へは重ねない）
      const go = Math.max(0, (s.line === 'gotsume' ? DEPTH.gotsume : DEPTH[s.line] || 40) - 16);
      if (go > 0) { g.advance?.(go, go / 1.6, { charge: s.state !== 'advance' }); s._moved = true;
        s.at.x -= J.fx * dir * go; s.at.z -= J.fz * dir * go; }
    } else if (s.state === 'rout') g.rout?.({ hideAfter: 30 });
    else if (s.state === 'wait' && was === 'rout') g.reform?.();
  }
  for (const k of J.clashes) {
    if (k.sa && !k.sa.alive && !k._ra) { k._ra = 1; k.C.rout?.('A', { from: 0, minFight: 20 }); }
    if (k.sb && !k.sb.alive && !k._rb) { k._rb = 1; k.C.rout?.('B', { from: 0, minFight: 20 }); }
  }
}

// battles.js から：PLAN の戦の setup・update の後ろに陣立てを足す（戦のファイルは触らない）
export function installJindate(defs) {
  // 測りの比べ用：?jindate=0 で入れない
  if (globalThis.location?.search?.includes('jindate=0')) return;
  for (const [id, P] of Object.entries(PLAN)) {
    const d = defs[id];
    if (!d || d.__jindate) continue;
    d.__jindate = true;
    const setup = d.setup, update = d.update;
    d.setup = function (rt, ...a) {
      const r = setup?.call(this, rt, ...a);
      try { jindateSetup(rt, P); } catch (e) { console.warn('陣立て', e); }
      return r;
    };
    d.update = function (rt, dt, ...a) {
      const r = update?.call(this, rt, dt, ...a);
      try { jindateTick(rt, dt); } catch (e) { if (!rt.flags.jindateErr) { rt.flags.jindateErr = 1; console.warn('陣立て', e); } }
      return r;
    };
  }
}
