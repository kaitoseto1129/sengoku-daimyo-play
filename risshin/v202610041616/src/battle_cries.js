// 名乗りと勝ち名乗り。兵を増やさず、肉声は焼いた一人分を使い回す。
import { GENERALS } from './units_data.js';
import { hearName } from './battle_merit.js';

const HOUSES = { oda: '織田', tokugawa: '徳川', takeda: '武田', akazonae: '武田', imagawa: '今川', saito: '斎藤', azai: '浅井', asakura: '朝倉', mori: '毛利', uesugi: '上杉', okudaira: '奥平', hojo: '北条', shimazu: '島津' };
// 名のない侍だけの仮の呼び名。実在の武将の名や所属を書き換えない。
const NAMES = ['弥五郎', '源六', '平八', '彦七', '新八', '又六', '弥三郎', '喜助'];
function enabled(rt) { return !rt.over && !rt.def.town && !rt.def.dojo && !rt.flags.quiet; }
function samurai(u) { return u && !u.civ && !u.isStruct && !u.fleeing && !u.group?.routed && (u.type === 'samurai' || u.type === 'busho' || u.type === 'cavalry'); }
export function nameLine(rt, u) {
  const name = u.isPlayer ? rt.G.name : u.name || NAMES[u.id % NAMES.length];
  // 大名本人を自家の家来と呼ばない。連合軍の大将を別家の主とも決めつけない。
  if (u.isTaisho || GENERALS[name]?.lord) return `${name}なり！`;
  const house = HOUSES[u.group?.faction];
  return house ? `${house}が家来、${name}なり！` : `${name}なり！`;
}
export function cryCaption(rt, pos, text) {
  if (!enabled(rt) || !rt.player.u.alive || rt.distTo(pos) > 40 || (rt.soldierCallT ?? -99) + 8 > rt.t) return;
  // 兵の短い声と同じ時計。溜めず、その場で一行だけ出す。
  rt.soldierCallT = rt.t;
  rt.bark(text);
}
export function nameCry(rt, u) {
  if (!enabled(rt) || !samurai(u) || u.battleNamed) return;
  u.battleNamed = true;
  u.nameUntil = rt.army.time + 1.8;
  u.announced = true;
  u.annT = rt.t;
  // 遠くで名乗った声は、近づいてから聞いたことにしない。
  if (u.team !== rt.player.u.team && rt.distTo(u.pos) <= 24 && !rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, u.pos)) hearName(rt, u);
  rt.warVoices.call('nanori', u.pos);
  const text = u.nanori ? u.nanori.split(/[！!。]/, 1)[0].slice(0, 44) + '！' : nameLine(rt, u);
  cryCaption(rt, u.pos, text);
}
export function beforeMelee(rt, u, target) {
  if (!enabled(rt) || !samurai(u) || target.isStruct || target.civ) return true;
  nameCry(rt, u);
  // 名乗る本人だけが構える。隊の命令・陣形や相手の攻撃は止めない。
  if (u.nameUntil > rt.army.time) { u.guarding = Math.max(u.guarding || 0, 0.2); return false; }
  return true;
}
export function killCry(rt, victim, killer) {
  if (!enabled(rt) || !killer?.alive || killer.isStruct || killer.civ || victim.civ || victim.isStruct || victim.team === killer.team || (killer.killCryT ?? -99) + 8 > rt.t) return;
  killer.killCryT = rt.t;
  rt.warVoices.call('utchi', killer.pos);
  cryCaption(rt, killer.pos, `${killer.isPlayer ? rt.G.name : killer.name || (killer.team === rt.player.u.team ? '味方の兵' : '敵の兵')}「討ち取ったり！」`);
}
