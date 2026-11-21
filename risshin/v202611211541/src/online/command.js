// オンライン対戦：命令の遅れを武将の COMMAND と総大将の生死で決める（docs/online_cmd_cam_1121.md ③・K585 の能力 COMMAND）
// 命令は今の使番（denrei.js の sendOrder）が運ぶ。ここでは使番の足の速さの倍率だけを決める（遅れ＝道のり÷速さ）。
//   COMMAND 50 で今と同じ（1倍）・100 で1.5倍の速さ（遅れ三分の二）・0 で0.5倍（遅れ倍）。総大将が討たれたら全隊の命令がさらに1.5倍遅れる。
import { setRunnerSpeed, sendOrder } from '../denrei.js';
import { orderReal } from '../gunbai.js';
import { TACTICS, BUSHO_TACTIC, tacticReady, useTactic } from './tactics.js';
import { jinFromMatch } from './jinkei6.js';
import { settlePlayer } from '../battle_retry.js';
import { jinAttack } from './jinkei6.js';

export function commandRunnerMul(command, generalAlive = true) {
  const c = Math.max(0, Math.min(100, Number.isFinite(command) ? command : 50));
  const mul = 0.5 + c / 100;
  return generalAlive ? mul : mul / 1.5;
}

// 試合の始まりと総大将の生死が変わった時に呼ぶ（rt＝戦・team＝0 東／1 西・command＝総大将の COMMAND）
export function applyCommandDelay(rt, team, command, generalAlive = true) {
  setRunnerSpeed(rt, team, commandRunnerMul(command, generalAlive));
}

// 討死の引き継ぎ（docs/online_cmd_cam_1121.md ②・K585「自分の武将が討死したら、残りの武将から1人を選んで引き継ぐ。元の隊は副将の AI へ」）：
//   本人の体（player.u）はそのまま使い、選んだ武将の所・向き・体力へ移して立たせ、その武将の体を隠す（武将の隊は副将＝AI のまま動く）。
//   カメラは前の所から新しい体の後ろへ 0.5〜1 秒で滑らせる（camGlide）。結果の札（rt.result）の扱いは試合の流れの係が先に止める
export function takeOverGeneral(rt, g) {
  const p = rt.player, u = p?.u;
  if (!u || !g || !g.alive || g.gone || g === u || g.team !== u.team) return false;
  // カメラは前の所から新しい体の後ろへ滑らせる（player_camera.js の camGlide。遠いほど少し長く・高く）
  const cam = rt.camera, jd = Math.hypot(g.pos.x - u.pos.x, g.pos.z - u.pos.z);
  if (cam) p.camGlide = { from: cam.position.clone(), k: 0, dur: Math.min(1, 0.45 + jd / 150), lift: Math.min(12, jd * 0.15) };
  u.pos.copy(g.pos); u.heading = g.heading || 0; p.yaw = u.heading;
  if (u.mesh) { u.mesh.position.copy(u.pos); u.mesh.rotation.y = u.heading; }
  settlePlayer(rt);
  u.hp = Math.min(u.maxHp, Math.max(1, g.hp || u.maxHp));
  p.retryGraceUntil = rt.t + 3;   // 引き継いだ直後の三秒は倒されない（選ぶ間に囲まれていても立て直せる）
  g.alive = false; g.gone = true; if (g.mesh) g.mesh.visible = false;
  p.camInit = false; p.camR = p.camH = null; p.camTY = null; p.bodyHeld = null; p.occK = null;
  return true;
}

// ---------------- ④⑤ 八つの命令と、相手へ送る小さな札（docs/online_cmd_cam_1121.md 4・5） ----------------
// 隊（units）は呼ぶ側が渡す：[{ id: 0〜3（自分の総大将が 0・武将が 1〜3）, name, mon, o: 本物の隊（army.groups の一つ） }]。
//   命令は使番（sendOrder）が運ぶので、遠い隊ほど遅れる（③の COMMAND の倍率もそのまま効く）。時は止めない。

// 八つ（並びは輪の時計回り）。at＝地面の点が要る・tgt＝敵の隊を拾う
export const CMD8 = [
  { id: 'advance', ch: '進' }, { id: 'attack', ch: '攻', tgt: true }, { id: 'here', ch: '此', at: true }, { id: 'pursue', ch: '追', tgt: true },
  { id: 'hold', ch: '止' }, { id: 'defend', ch: '守' }, { id: 'rally', ch: '集' }, { id: 'retreat', ch: '退' },
];
const CODE = Object.fromEntries(CMD8.map((c, i) => [c.id, i]));
// 九つ目：固有戦術（31 の tactics.js）。使える時だけ輪に出る。札では番 8
const TAC = 8;
CODE.tactic = TAC;
// その武将の固有戦術（武将の名で TACTICS を引く）と、今使えるか。own＝その武将の本物の兵の組
// 11/21 cloud-31：武将の名→戦術は BUSHO_TACTIC で引く（TACTICS の busho は一人の名で、同じ戦術の二人目＝柿崎景家の先駆けが輪に出なかった）
const tacOf = (unit) => { const nm = unit && unit.name; return nm ? (BUSHO_TACTIC[nm] || Object.keys(TACTICS).find((k) => TACTICS[k].busho === nm) || null) : null; };
const ownGroups = (o) => isSonae(o) ? [o.b.real].filter((g) => g && g.count > 0) : [o].filter((g) => g && g.count > 0);
export function unitTactic(rt, unit, team = 0) {
  const id = tacOf(unit);
  if (!id || !unit.o) return null;
  let r = { ok: false };
  try { r = tacticReady(rt, team, id, ownGroups(unit.o)); } catch (e) { /* 戦術の部品の誤りで輪を止めない */ }
  return { id, ok: !!r.ok, name: TACTICS[id].name };
}

// 隊は二つの形がある：本物の隊（army.groups の一つ）と、模擬合戦の備（sonae.js の一つ＝4武将×1,000。下知は S.order へ）
const isSonae = (o) => !!(o && o.b && typeof o.order === 'function');
export function unitCount(o) { return !o ? 0 : isSonae(o) ? (o.state === '敗走' ? 0 : Math.round(o.b.aliveNominal())) : (o.count || 0); }
const alive = (g) => g && !g.gone && unitCount(g) > 0;
const posOfU = (o) => isSonae(o) ? o.b.pos : o.center();
function foeNear(rt, team, c, pred) {
  let best = null, bd = Infinity;
  for (const g of rt.army.groups) {
    if (g.team === team || !alive(g) || g.isRunner || (pred && !pred(g))) continue;
    const q = g.center(), d = Math.hypot(q.x - c.x, q.z - c.z);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// 一つの命令を隊へ当てる（使番が着いた時に呼ばれる）。lord＝その隊の総大将の体（再集合の行き先）
export function applyCmd(rt, g, id, arg = {}, lord = null) {
  if (!alive(g) || rt.over) return false;
  if (id === 'tactic') { try { return useTactic(rt, g.team, arg.tac, ownGroups(g)); } catch (e) { return false; } }
  if (isSonae(g)) return applySonae(rt, g, id, arg, lord);
  const c = g.center(), team = g.team;
  const tgtOf = (pred) => { const f = (arg.tg != null && rt.army.groups[arg.tg]) || foeNear(rt, team, arg.at || c, pred); return alive(f) ? { real: true, o: f } : null; };
  if (id === 'advance') {
    const f = foeNear(rt, team, c);
    let fx = Math.sin(g.facing || 0), fz = Math.cos(g.facing || 0);
    if (f) { const q = f.center(), L = Math.hypot(q.x - c.x, q.z - c.z) || 1; fx = (q.x - c.x) / L; fz = (q.z - c.z) / L; }
    orderReal(rt, g, 'move', { pt: { x: c.x + fx * 30, z: c.z + fz * 30 } });
  } else if (id === 'here') {
    if (!arg.at) return false;
    orderReal(rt, g, 'move', { pt: { x: arg.at.x, z: arg.at.z } });
  } else if (id === 'attack' || id === 'pursue') {
    const t = tgtOf(id === 'pursue' ? (o) => o.routed || (o.morale ?? 100) < 40 : null) || tgtOf(null);
    if (!t) return false;
    orderReal(rt, g, 'attack', { tgt: t });
    jinAttack(rt, g, t.o);   // 11/21 cloud-26：陣形ごとの攻め（魚鱗は将へ一点・鶴翼は包む・方円は受ける）
    if (id === 'pursue') { g.seekRange = Math.max(g.seekRange || 0, 120); g.speed = Math.max(g.speed || 3, 3.6); }
  } else if (id === 'hold') orderReal(rt, g, 'hold', {});
  else if (id === 'defend') orderReal(rt, g, 'yari', {});
  else if (id === 'retreat') orderReal(rt, g, 'retreat', {});
  else if (id === 'rally') {
    const p = lord && lord.pos;
    if (!p) return false;
    orderReal(rt, g, 'move', { pt: { x: p.x, z: p.z } });
  } else return false;
  g._plOrder = { id: id === 'advance' || id === 'here' || id === 'rally' ? 'move' : id === 'defend' ? 'hold' : id, to: arg.at || null, t: rt.t || 0 };   // 47 general_ai.js：命令の新しい間は性格の AI が手を出さない
  return true;
}

// 備（模擬合戦）へ：butai.js の分かる下知（move・charge・hold・retreat と構え）に変える。届いた後に侍大将の遅れ（sonae.order）がさらに乗る
function foeSonae(rt, team, c, pred) {
  let best = null, bd = Infinity;
  for (const e of rt.sonae || []) {
    if (e.team === team || !alive(e) || (pred && !pred(e))) continue;
    const d = Math.hypot(e.b.pos.x - c.x, e.b.pos.z - c.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function applySonae(rt, S, id, arg, lord) {
  const c = S.b.pos, team = S.team, P = (q) => ({ x: q.x, z: q.z });
  const tgt = (pred) => { const t = arg.tg != null && (rt.sonae || [])[arg.tg]; return (alive(t) && t.team !== team) ? t : foeSonae(rt, team, arg.at || c, pred); };
  let cmd = null;
  if (id === 'advance') {
    const f = foeSonae(rt, team, c);
    let fx = Math.sin(S.b.facing || 0), fz = Math.cos(S.b.facing || 0);
    if (f) { const L = Math.hypot(f.b.pos.x - c.x, f.b.pos.z - c.z) || 1; fx = (f.b.pos.x - c.x) / L; fz = (f.b.pos.z - c.z) / L; }
    cmd = { id: 'move', to: { x: c.x + fx * 30, z: c.z + fz * 30 } };
  } else if (id === 'here') { if (!arg.at) return false; cmd = { id: 'move', to: P(arg.at) }; }
  else if (id === 'attack' || id === 'pursue') {
    const t = (id === 'pursue' && tgt((e) => e.state === '後退中' || e.b.morale < 40)) || tgt(null);
    if (!t) return false;
    cmd = { id: 'charge', to: P(t.b.pos), target: t.b };
  } else if (id === 'hold') cmd = { id: 'hold' };
  else if (id === 'defend') cmd = { id: 'hold', form: 'yari' };
  else if (id === 'rally') { const p = lord && (lord.pos || (lord.b && lord.b.pos)); if (!p) return false; cmd = { id: 'move', to: P(p) }; }
  else if (id === 'retreat') {
    const f = foeSonae(rt, team, c);
    let dx = f ? c.x - f.b.pos.x : -Math.sin(S.b.facing || 0), dz = f ? c.z - f.b.pos.z : -Math.cos(S.b.facing || 0);
    const L = Math.hypot(dx, dz) || 1;
    cmd = { id: 'retreat', to: { x: c.x + dx / L * 30, z: c.z + dz / L * 30 } };
  } else return false;
  return S.order(cmd) !== false;
}

// 自分の命令を出す：使番を走らせ、相手へは札だけ送る（兵の位置は送らない）。
//   from＝出す人の体（総大将か今の自分）・send＝net_transport の send（無ければ一人遊び）
export function issueCmd(rt, unit, id, arg = {}, { from, team = 0, send = null, lord = null, faction } = {}) {
  if (!unit || !alive(unit.o) || CODE[id] == null) return null;
  if (id === 'tactic') { const T = unitTactic(rt, unit, team); if (!T || !T.ok) return null; arg = { ...arg, tac: T.id }; }
  const msg = encodeCmd(unit.id, id, arg, rt);
  if (send) { try { send(msg); } catch (e) { /* 切れた時は手元だけ進める */ } }
  return runCmd(rt, unit, id, arg, { from, team, lord, faction });
}
function runCmd(rt, unit, id, arg, { from, team, lord, faction }) {
  // 本人の命令を出した備は、次の命令か 30 秒まで AI（47 general_ai の matchAiTick）が触らない。使番が走る間と下知の遅れの間に AI の下知で上書きされ、行き先へ寄らなかった（11/21 cloud-26・online_pvp）
  if (unit.o) unit.o._plHold = { t: rt.t || 0, id };
  const P = (from && from.pos) || posOfU(unit.o);
  // 自分が率いる隊（id 0）は声で届く。ほかは使番
  if (unit.id === 0) { applyCmd(rt, unit.o, id, arg, lord); return { now: true }; }
  return sendOrder(rt, { x: P.x, z: P.z }, unit.o, { id, apply: () => applyCmd(rt, unit.o, id, arg, lord) }, { team, faction: faction || 'oda', name: unit.name, lord: team === 0 });
}

// 相手へ送る札：{ k:'cmd', u:隊の番, c:命令の番, x,z:行き先（四捨五入で 0.1m）, tg:狙う隊の番（army.groups の並び）, t:出した時 }
export function encodeCmd(uid, id, arg = {}, rt = null) {
  const m = { k: 'cmd', u: uid | 0, c: CODE[id] };
  if (id === 'tactic' && arg.tac) m.tc = String(arg.tac).slice(0, 24);
  if (arg.at) { m.x = Math.round(arg.at.x * 10) / 10; m.z = Math.round(arg.at.z * 10) / 10; }
  if (arg.tg != null) m.tg = arg.tg | 0;
  if (rt) m.t = Math.round((rt.t || 0) * 100) / 100;
  return m;
}
export function decodeCmd(m) {
  if (!m || m.k !== 'cmd' || !Number.isInteger(m.u) || m.u < 0 || m.u > 3) return null;
  if (m.c === TAC) return TACTICS[m.tc] ? { uid: m.u, id: 'tactic', arg: { tac: m.tc }, t: m.t } : null;
  const c = CMD8[m.c];
  if (!c) return null;
  const arg = {};
  if (Number.isFinite(m.x) && Number.isFinite(m.z)) arg.at = { x: m.x, z: m.z };
  if (Number.isInteger(m.tg) && m.tg >= 0) arg.tg = m.tg;
  if (c.at && !arg.at) return null;
  return { uid: m.u, id: c.id, arg, t: m.t };
}

// 相手の札を受ける：相手の隊（foeUnits：同じ形の4つ）へ同じ命令を、相手の使番で運ぶ（相手の総大将の所から走る）
export function receiveCmd(rt, m, foeUnits, { team = 1, from = null, lord = null, faction } = {}) {
  const d = decodeCmd(m);
  if (!d) return null;
  const unit = foeUnits.find((u) => u.id === d.uid);
  if (!unit || !alive(unit.o)) return null;
  return runCmd(rt, unit, d.id, d.arg, { from: from || (foeUnits[0] && foeUnits[0].o && { pos: posOfU(foeUnits[0].o) }), team, lord, faction });
}

// 送る口をつなぐ（T＝openTransport の返り値）。受けた命令は相手の隊へ。返り値の send を issueCmd に渡す
export function attachCmdNet(rt, T, getFoeUnits, o = {}) {
  T.onMessage((m) => { if (m && m.k === 'cmd') receiveCmd(rt, m, getFoeUnits(), o); });
  return (msg) => T.send(msg);
}

// ---------------- 模擬合戦（online/match.js）へのつなぎ ----------------
// その側の4武将（備）を輪の札の形に。id 0＝総大将（布陣の一番目）
export function matchUnits(rt, team) {
  return (rt.sonae || []).filter((S) => S.team === team).slice(0, 6).map((S, id) => ({ id, name: S.taisho || S.name, mon: S.flag || S.faction || 'oda', o: S }));
}
// 試合の始まりに一度（match.js の setup から）：ui＝command_ui.js・net＝onlineMatch の口 { send, recv }（無ければ一人で）
//   輪の命令は自分の総大将（本人の体）の所から使番が走る。相手の札は相手の総大将の備の所から走る
export function matchCmdSetup(rt, { ui = null, net = null, pickGround = null } = {}) {
  const me = () => matchUnits(rt, 0), foe = () => matchUnits(rt, 1);
  const send = net && net.send ? (m) => net.send(m) : null;
  // 相手の画面では相手が南・自分が北（match.js rosterOf）。行き先は真ん中を軸に裏返し（x,z → −x,−z）、隊の番（tg）は両方の画面で並びが違うので捨てて行き先の近くの敵を拾う（11/21 cloud-26・online_pvp）
  const mirror = (m) => { const q = { ...m }; if (Number.isFinite(q.x)) q.x = -q.x; if (Number.isFinite(q.z)) q.z = -q.z; delete q.tg; return q; };
  if (net && net.recv) net.recv((m) => { if (m && m.k === 'cmd') receiveCmd(rt, mirror(m), foe(), { team: 1, lord: foe()[0] && foe()[0].o }); });
  const fire = (unit, id, arg) => issueCmd(rt, unit, id, arg, { from: rt.player && rt.player.u, send, lord: rt.player && rt.player.u });
  placeLord(rt);
  const ring = ui && ui.mountCmdRing && typeof document !== 'undefined'
    ? ui.mountCmdRing({ getUnits: me, pickGround: pickGround || ((x, y) => groundAt(rt, x, y)), onCmd: fire, tacticReady: (u) => { const T = unitTactic(rt, u, 0); return !!(T && T.ok); } }) : null;
  return { ring, fire, me, foe, dispose() { ring && ring.dispose(); } };
}
// 画面の点 → 地面（y=0 の面。起伏は小さい模擬合戦の地図なので足りる）
function groundAt(rt, x, y) {
  const cam = rt.camera, el = (rt.game && rt.game.renderer && rt.game.renderer.domElement) || (typeof document !== 'undefined' && document.querySelector('canvas'));
  if (!cam || !el) return null;
  const r = el.getBoundingClientRect(), nx = ((x - r.left) / r.width) * 2 - 1, ny = -((y - r.top) / r.height) * 2 + 1;
  const o = cam.position.clone(), d = cam.position.clone().set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
  if (d.y > -1e-3) return null;
  const k = -o.y / d.y;
  return { x: o.x + d.x * k, z: o.z + d.z * k };
}

// 試合の始め：本人（自分で動かす武将）を自分の武将の備の中の将の持ち場へ置き、相手の本陣へ向ける（11/21 クラウド36・online_pvp_cam・司令塔の二度目）。
//   模擬合戦は稽古場の形を借りるので、何もしないと本人は稽古場の立ち位置（真ん中・南向き）に残り、両方の画面でカメラが相手の反対（180°）を向いていた。
//   備には本人と同じ武将の体（隊の leader）も立つので、それを隠して狙われないようにし（討たない＝備の大将の討死にはしない）、本人がその持ち場に立つ。
//   持ち場は陣形が決める（jinkei6.js の applyJin：魚鱗は先・鶴翼は要・方円は輪の真ん中・ほかは深さの六割）。本物の隊がまだ無い時は備の右 14m・4m 後ろ。
//   カメラは決まりどおり一つの形のまま、本人の後ろへ一コマで付け直す（始めの一回だけ。入力の無い時に動かすのではない）
export function placeLord(rt) {
  const p = rt.player, u = p && p.u, L = matchUnits(rt, 0), F = matchUnits(rt, 1);
  if (!u || !L.length || !F.length) return false;
  const nm = rt.G && rt.G.name, mine = L.find((x) => x.name === nm) || L[0];
  const S = mine.o, at = S.b.pos, fh = (F.find((x) => x.o.line === 'honjin') || F[0]).o.b.pos;
  const dx = fh.x - at.x, dz = fh.z - at.z, d = Math.hypot(dx, dz) || 1;
  let x, z;
  try { jinFromMatch(rt); } catch (e) { /* 陣形の部品が無くても置く */ }   // 将の持ち場は陣形が決めるので、陣形を先に付ける
  const g = S.b.real, lead = g && (g.leader && g.leader.alive ? g.leader : g.units.find((q) => q.alive && q.type === 'busho'));
  if (g && lead && Number.isInteger(lead.slot) && g.slotPos) {
    const n = Math.max(1, g.initial || g.units.length);
    // 横陣・縦陣・長蛇（魚鱗・鶴翼・方円でない時）は、本人は隊の真ん中の筋の一番後ろに立つ（深さの六割だと後ろの列が本人とカメラの間に入り、カメラが 6.0→3.1m へ寄った）
    if (g.formation !== 'gyorin' && g.formation !== 'kakuyoku' && g.formation !== 'ring') {
      const h = g.facing || 0, fx = Math.sin(h), fz = Math.cos(h), P = [];
      let f0 = Infinity; for (let i = 0; i < n; i++) { const q = g.slotPos(i, n, {}), ex = q.x - g.anchor.x, ez = q.z - g.anchor.z, f = ex * fx + ez * fz; P.push([ex * fz - ez * fx, f]); f0 = Math.min(f0, f); }
      let best = lead.slot, bd = Infinity; for (let i = 0; i < n; i++) { const dd = Math.hypot(P[i][0] * 3, P[i][1] - f0); if (dd < bd) { bd = dd; best = i; } }
      const other = g.units.find((q) => q !== lead && q.slot === best); if (other) other.slot = lead.slot; lead.slot = best;
    }
    const sp = g.slotPos(lead.slot, n, {});
    x = sp.x; z = sp.z;
    // 同じ武将の体は隠して狙わせない（本人がその持ち場に立つ）。備の大将の討死にはしない
    lead.noTarget = true; lead.lordDouble = true; if (lead.mesh) lead.mesh.visible = false;
    S.lordBody = u;
  } else {
    const rx = dz / d, rz = -dx / d;
    x = at.x + rx * 14 - dx / d * 4; z = at.z + rz * 14 - dz / d * 4;
  }
  const y = rt.world && rt.world.heightAt ? rt.world.heightAt(x, z) : u.pos.y;
  u.pos.set(x, y, z); u.heading = Math.atan2(dx, dz); p.yaw = u.heading;
  if (u.mesh) { u.mesh.position.copy(u.pos); u.mesh.rotation.y = u.heading; }
  if (u.mount && u.mount.pos) { u.mount.pos.copy(u.pos); if (u.mount.mesh) u.mount.mesh.position.copy(u.pos); }
  p.camInit = false; p.camR = p.camH = null; p.camTY = null; p.bodyHeld = null; p.occK = null;
  return true;
}
