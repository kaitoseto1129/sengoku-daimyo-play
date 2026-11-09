// toyo15/kit.js … 豊臣編の「約15分の戦」の共通の道具（docs/toyo15_plan_1108.md・docs/oda15_plan_1108.md 全ステージ共通方針）
// 段（一段一ファイル：src/<戦のid>/<段>.js）を順に運ぶ。段は { goal, pin, enter, tick, foes, max } を持つ。
//   goal：右上の一行（段の間は言い替えない）。pin(rt)：行き先の印。enter(rt, F)：段に入る時（兵・台詞・時の約束）。
//   tick(rt, dt, t)：毎コマ。t はその段に入ってからの秒。true を返すと次の段へ。max 秒を過ぎると味方の働きで次へ（保険）。
//   foes(rt)：bot が討つ相手の隊。敵の体力で時間を伸ばさない：段の長さは出来事（新手・門・火・知らせ）で決める。
// ほかに：遠くの大軍（host）・使番の別戦線の知らせ（reports）・煙で見通しが落ちる（smoke）・兵の組（troops）。
import { flagTexture } from '../textures.js';
import { allyGroup, enemyGroup } from '../bhelp.js';
import { STAGES } from '../stages.js';
import { withGuard } from '../toyo_bot.js';
import { depthRout } from '../army_depth.js';

export const near = (rt, p, r = 10) => Math.hypot(rt.player.u.pos.x - p.x, rt.player.u.pos.z - p.z) < r;
export const living = (g) => g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0;
export const broken = (g, k = 0.3) => !g || living(g) <= Math.floor(g.units.length * k);
export function move(g, p, free = false) {
  if (!g) return;
  g.stay = false; g.noAI = !free; g.order = 'move'; g.dest = { x: p.x, z: p.z }; g.anchor = { x: p.x, z: p.z };
}
// 兵の組：list は [{ type, n }]。look は { armor, flag }。ally なら味方
export function troops(rt, ally, name, p, list, look, o = {}) {
  const g = (ally ? allyGroup : enemyGroup)(rt, {
    faction: ally ? 'oda' : (o.faction || 'saika'), flag: look.flag, name, anchor: { x: p.x, z: p.z },
    facing: o.facing ?? (ally ? 0 : Math.PI), width: o.width || 8, aggro: o.aggro ?? 10, seekRange: o.seek ?? 16,
    noRout: o.noRout ?? true, fixed: true, fullStrength: true, noGuard: o.noGuard ?? true,   // 筋で決めた所に出す（見える所を避けてずらさない）
    dmgMult: o.dmg ?? (ally ? 0.7 : 0.24),
  }, list.map((e) => ({ type: e.type, n: e.n, o: { ...look, ...(e.o || {}) } })));
  g.noAI = !o.free;
  return g;
}
// 遠くの軽い大軍（本物の兵に数えない）
export function host(rt, o) {
  const flag = o.flag || 'toyotomi';
  return rt.world.addDistantArmy({ x: o.x, z: o.z, w: o.w || 40, d: o.d || 16, count: o.count || 300, facing: o.facing || 0,
    armor: o.armor ?? 0x2b2723, flagTex: flagTexture(flag), mon: flag, flag, seed: o.seed || 1585, team: o.team ?? 0,
    farFill: true, host: false, kind: o.kind || 'mixed', flagRate: o.flagRate ?? 0.15 });
}
// 使番の知らせを時の順に（[秒, 話し手, 文, 関数?]）。段に入った時から数える
export function reports(rt, list) {
  for (const [s, who, text, fn] of list) rt.after(s, () => { if (rt.flags.ending) return; if (text) rt.say(who || '使番', text, 4); if (fn) fn(rt); });
}
// 煙で見通しが落ちる（k：0 晴れ〜1 濃い）。毎コマ呼ぶ
export function smoke(rt, k) {
  const f = rt.scene.fog, F = rt.flags;
  if (!f || !('far' in f)) return;
  if (F._fog0 === undefined) { F._fog0 = f.far; F._fogN0 = f.near; }
  const far = F._fog0 + (70 - F._fog0) * k, nr = F._fogN0 + (6 - F._fogN0) * k;
  f.far = far; f.near = Math.min(nr, far - 1);
}
// 味方が撃たれて倒れる（門前の大損害）。zone の中の味方の足軽から一人
export function fallOne(rt, groups, zone) {
  for (const g of groups) if (g) for (const u of g.units) {
    if (!u.alive || u.isPlayer || u.name || u.invuln || u.type === 'busho') continue;
    if (zone && Math.hypot(u.pos.x - zone.x, u.pos.z - zone.z) > zone.r) continue;
    u.hp = 0; rt.army.kill(u, null); rt.flags.ak = (rt.flags.ak || 0) + 1; return u;
  }
  return null;
}

// 落城・開城：城に残った軽い備（本物の隊に結んでいない敵の備）を崩して退かせる（布陣図の城兵が立ったまま残らない）
export function fallB(rt) {
  const D = rt.flags.depth && rt.flags.depth.B;
  if (D) for (const s of D.sonae) if (!(s.o && s.o.bind)) { try { depthRout(D, s); } catch (e) { /* 無くても進む */ } }
}
// 段の替わり目に息を整える：十五分の戦は傷が積もるので、段が替わる時に命を少し戻す（手当ての数は使わない）
export function breath(rt, k = 0.3) {
  const u = rt.player && rt.player.u;
  if (!u || !u.alive) return;
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * k);
}
// 段を運ぶ。def に右上の一行・行き先・途中の保存・bot を付ける。setup の最後に K.start(rt)、update で K.tick(rt, dt)
export function stageRun(def, id, stages, o = {}) {
  STAGES[id] = stages.map((s, i) => (i ? [s.goal, (rt) => (rt.flags.step || 0) >= i + 1] : [s.goal]));
  def.minutes = o.minutes || 15; def.expectMin = o.minutes || 15;
  const cur = (rt) => stages[Math.max(0, Math.min(stages.length - 1, (rt.flags.step || 1) - 1))];
  const pinOf = (rt, s) => (typeof s.pin === 'function' ? s.pin(rt) : s.pin);
  const K = {
    enter(rt, i) {
      const F = rt.flags, s = stages[i];
      F.step = i + 1; F.stepT = rt.t; F.st = 0;
      rt.obj('main', s.goal, 'main');
      const p = pinOf(rt, s);
      F.target = p ? { x: p.x, z: p.z, label: p.label || '', action: s.goal } : null;
      if (s.enter) s.enter(rt, F);
    },
    start(rt) { rt.flags.step = 0; rt.flags.ending = false; K.enter(rt, 0); },
    tick(rt, dt) {
      const F = rt.flags;
      if (!F.step || F.ending) { if (F.ending && o.endTick) o.endTick(rt, dt); return; }
      const i = F.step - 1, s = stages[i];
      F.st += dt;
      const p = pinOf(rt, s);
      if (p && F.target) { F.target.x = p.x; F.target.z = p.z; }
      const done = (s.tick ? s.tick(rt, dt, F.st) : false) || F.st > (s.max || 260);
      if (!done || F.ending) return;
      if (s.leave) s.leave(rt, F);
      if (i + 1 < stages.length) K.enter(rt, i + 1); else def.win(rt);
    },
  };
  def.missionHeading = (rt) => cur(rt).goal;
  def.goalTargetOverride = (rt) => (!rt.flags.step || rt.flags.ending ? null : rt.flags.target);
  def.resumeSteps = stages.map((s, i) => [i + 1, function (rt) { K.enter(rt, i); }]);
  def.resumeAt = (rt, n) => { const s = stages[n - 1], p = s && (s.resume || pinOf(rt, s)); return p ? { x: p.x, z: p.z - 10, heading: 0 } : null; };
  def.botBrain = function (b, inp, { goTo, patientStrike }) {
    const F = b.flags;
    if (!F.step || F.ending) { inp.k.delete('KeyW'); return true; }
    const s = cur(b), u = b.player.u, p = u.pos;
    const at = (s.botAt ? s.botAt(b) : null) || pinOf(b, s) || p;
    const way = o.way ? o.way(u, at) : at;
    let enemy = null, dist = s.botR || 18;
    for (const g of (s.foes ? s.foes(b) : [])) if (g) for (const e of g.units) {
      if (!e.alive || e.gone || e.fleeing || e.noTarget) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < dist && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < (s.botLeash || 30)) { dist = d; enemy = e; }
    }
    if (enemy && way === at) { goTo(b.player, inp, enemy.pos.x, enemy.pos.z, 1.8); if (dist < 3) patientStrike(b.player, inp, enemy, dist, true); }
    else goTo(b.player, inp, way.x, way.z, way === at ? 4 : 2);
    return true;
  };
  withGuard(def);
  return K;
}
