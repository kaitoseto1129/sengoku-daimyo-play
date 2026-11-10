// ======================================================================
// 桶狭間 10〜11分：幕の下の坂の弓組
//   井伊の備えを破ると、桶狭間山の幕の下の坂に、義元の旗本の弓組が並んで坂下へ矢を射かける（雨は上がり、弓は射てる）。
//   矢の降る坂を組と駆け上がり、弓組を討つ（近づくほど矢が来る）。崩れたら本体の「幕の前で旗本を破れ」へ。
//   一分十五秒で決まらなければ、矢を射尽くした弓組は幕の内へ退く（物語は進む）。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const live = (g) => g && !g.routed && g.units.some(ready);

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.sakaT) return;
  v.sakaT = rt.t; v.ph = 'saka';
  v.sakaGs = [[-4, -100, 0.2], [36, -98, -0.3]].map(([x, z, f]) => {
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '義元の旗本の弓組', anchor: C.fieldPoint(x, z), facing: f + C.FIELD_TURN,
      formation: 'line', width: 5, morale: 75, aggro: 6, seekRange: 8, dmgMult: 0.42, fleeDir: C.fieldVector(0, -1) }, [{ type: 'samurai', n: 1 }, { type: 'bow', n: 5 }]);
    g.fire = true; g.order = 'hold';
    F.enemies?.push(g);
    return g;
  });
  sfx('taiko', 0.9);
  rt.after(0.8, () => rt.say('組頭 源八', '幕の下の坂に弓組じゃ！　矢をくぐって駆け上がれ。止まれば射すくめられるぞ！', 3.8));
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 34; H.aggro = 16; H.focus = null; H.anchor = C.fieldPoint(10, -96); }
}

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.sakaDone || rt.over || F.ending) return;
  const t = rt.t - v.sakaT;
  if (!v.sakaGs.some(live) && t > 20 || t > 75) {
    v.sakaDone = true; v.ph = null;
    // 士気だけでは組頭の生きた隊は退かない。射撃停止と退却をそろえる。
    for (const g of v.sakaGs) if (live(g)) { g.order = 'retreat'; g.fire = false; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0, -1); }
    sfx('taiko', 1);
    rt.say('組頭 源八', t > 75 ? '弓組は幕の内へ退いた。幕の前へ詰めよ！' : '弓組を討ったぞ！　幕の前へ詰めよ。義元はあの内じゃ！', 3.4);
    if (t <= 75) rt.award((tr) => tr.side.push('幕の下の坂で旗本の弓組を討った'), '幕の下の坂で旗本の弓組を討った');
  }
}

export function target(rt) {
  const v = rt.flags.o15, P = rt.player.u.pos;
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
