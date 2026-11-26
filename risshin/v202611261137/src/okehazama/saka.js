// ======================================================================
// 桶狭間 10〜11分：幕の下の坂の弓組
//   井伊の備えを破ると、桶狭間山の幕の下の坂に、義元の旗本の弓組が並んで坂下へ矢を射かける（雨は上がり、弓は射てる）。
//   矢の降る坂を組と駆け上がり、弓組を討つ（近づくほど矢が来る）。崩れたら本体の「幕の前で旗本を破れ」へ。
//   一分十五秒で決まらなければ、矢を射尽くした弓組は幕の内へ退く（物語は進む）。
// ======================================================================
import { sfx } from '../audio.js';
import { takataba } from '../props.js';
import { SH, shPos } from './side.js';   // K661：i10（今川の側）は元の本人の代わりの所で見る

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const live = (g) => g && !g.routed && g.units.some(ready);

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.sakaT) return;
  v.sakaT = rt.t; v.ph = 'saka';
  v.sakaGs = [[-4, -100, 0.2], [36, -98, -0.3]].map(([x, z, f]) => {
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '義元の旗本の弓組', anchor: C.fieldPoint(x, z), facing: f + C.FIELD_TURN,
      formation: 'line', width: 5, morale: 75, aggro: 6, seekRange: 8, dmgMult: 0.42, fleeDir: C.fieldVector(0, -1) }, [{ type: 'samurai', n: 1 }, { type: 'bow', n: 5 }]);
    // stay：全軍の采配（ai.js・all_out.js）に呼ばれず竹束の陰に留まる（11/18 描かずの通しで、百歩先の本人へ坂を下りて来ていた）。
    g.fire = true; g.order = 'hold'; g.stay = true;
    F.enemies?.push(g);
    // センゴク外伝 5巻（docs/books/okehazama_manga.md 34話）：今川の二陣は竹束の陰から矢を降らす固い陣。
    //   弓組の三歩前に竹束を四つ立て、真ん中だけ空ける（綻び）。ここを破ると両方の弓組が一度に崩れる（tick）。
    const fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    for (const lat of [-5.4, -3.2, 3.2, 5.4]) {
      const q = C.fieldPoint(x + rx * lat + fx * 3.4, z + rz * lat + fz * 3.4);
      const m = takataba(rt.world, q.x, q.z, f + C.FIELD_TURN);
      m.traverse((part) => { if (part.isMesh) part.userData.camBlock = true; });
      rt.scene.add(m);
    }
    return g;
  });
  sfx('taiko', 0.9);
  rt.after(0.8, () => rt.say('組頭 源八', '幕の下の坂に弓組じゃ！　矢をくぐって駆け上がれ。止まれば射すくめられるぞ！', 3.8));
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 34; H.aggro = 16; H.focus = null; H.anchor = C.fieldPoint(10, -96); }
  // 11/18 描かずの通し：本陣の前の織田の備は麓の陣の跡（本陣から四十〜五十歩）に留まり、弓組と誰も組み合わずに時切れで済んでいた。
  //   本陣の百三十歩内にいる織田の備（攻め手・新手）を近い弓組へ向けて竹束へ寄せる（兵は足さず、いる兵を歩かせる。tick）。
  v.sakaPush = true; v.sakaPushT = 0;
}

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.sakaDone || rt.over || F.ending) return;
  const t = rt.t - v.sakaT;
  // 攻め手の備と新手（depth_reserve）の狙いは、二秒ごとに近い弓兵へ付け直す（崩れた後は放す）。
  if (v.sakaPush && rt.t >= v.sakaPushT) {
    v.sakaPushT = rt.t + 2;
    const pin = C.fieldPoint(10, -96), team = SH.flip ? SH.oda : rt.player.u.team;
    for (const g of rt.army.groups) {
      if (g.team !== team || g.isPlayerSquad || g === F.nob || g.routed || g.hidden || g.civ || g.people) continue;
      const u0 = g.units.find(ready);
      if (!u0 || Math.hypot(u0.pos.x - pin.x, u0.pos.z - pin.z) > 130) continue;
      if (v.sakaBreach) { if (g.sakaAimed) { g.focus = null; g.sakaAimed = false; } continue; }
      if (ready(g.focus) && g.sakaAimed) continue;
      const t = target({ flags: F, player: { u: u0 } });
      if (!t) continue;
      g.sakaAimed = true; g.order = 'attack'; g.stay = false; g.seekRange = Math.max(g.seekRange || 0, 60); g.aggro = Math.max(g.aggro || 0, 16);
      g.focus = t; if (g.anchor) { g.anchor.x = t.pos.x; g.anchor.z = t.pos.z; }
    }
  }
  // 綻び一か所で方陣が崩れる（5巻 34話）：どちらかの弓組が半ば討たれたら、もう一方も弓を捨てて崩れる。
  if (!v.sakaBreach && v.sakaGs.some((g) => g.units.filter(ready).length <= 3)) {
    v.sakaBreach = true;
    for (const g of v.sakaGs) if (live(g)) { g.order = 'retreat'; g.fire = false; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0, -1); }
    sfx('taiko', 0.8);
    rt.say('組頭 源八', '竹束が破れた！　弓組が崩れるぞ、押せ！', 3);
  }
  if (!v.sakaGs.some(live) && t > 20 || t > 60) {   // 11/18 夜50-46：act bot 3回ともこの段は上限まで延びた（一戦が十〜十三分）。上限を詰める（75→60秒）
    v.sakaDone = true; v.ph = null;
    for (const g of rt.army.groups) if (g.sakaAimed) { g.sakaAimed = false; g.focus = null; }
    // 士気だけでは組頭の生きた隊は退かない。射撃停止と退却をそろえる。
    for (const g of v.sakaGs) if (live(g)) { g.order = 'retreat'; g.fire = false; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0, -1); }
    sfx('taiko', 1);
    if (!v.sakaBreach || t > 60) rt.say('組頭 源八', t > 60 ? '弓組は幕の内へ退いた。幕の前へ詰めよ！' : '弓組を討ったぞ！　幕の前へ詰めよ。義元はあの内じゃ！', 3.4);
    if (t <= 60) rt.award((tr) => tr.side.push('幕の下の坂で旗本の弓組を討った'), '幕の下の坂で旗本の弓組を討った');
  }
}

export function target(rt) {
  const v = rt.flags.o15, P = shPos(rt);
  let best = null, bd = Infinity;
  for (const g of v.sakaGs || []) for (const u of g.units) {
    if (!ready(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  if (!u) return null;
  // 近い戦いでも、次に進む場所のピンを残す。
  return { x: u.pos.x, z: u.pos.z, r: 6, hide: 6, key: 'o15-saka', always: true, area: true };
}
