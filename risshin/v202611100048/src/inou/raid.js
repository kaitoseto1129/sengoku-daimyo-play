// ======================================================================
// 稲生 10〜12分：狙われる信長の旗本（林勢の別手の回り込み）
//   柴田勢が崩れて列を整える間に、葦原の脇道を回った林勢の別手が、列の後ろの信長の旗本へ真っ直ぐ寄せる（主の首を狙う）。
//   一の手は足軽、二の手は馬の侍。組は列を離れて殿の旗本の後ろへ駆け戻り、別手を止める。
//   その間、正面の林勢の槍の列は田の向こうで構えて待つ（列が整うまで組み合わない）。止めたら本体の「林勢へかかれ」へ続く。
//   主人公が別手を一人以上討ってから、旗本の侍も押し返す（時間だけで済ませない）。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { pinAt } from './index.js';
import { inouEnemyAlive } from '../b_inou_goals.js';

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const LOOK = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'nobukatsu', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...LOOK, ...(s.o || {}) } }));

export function start(rt, def, C) {
  const F = rt.flags, v = F.v15;
  if (v.raidT) return;
  v.raidT = rt.t; v.ph = 'raid'; v.raidGs = [];
  // 正面の林勢は田の向こう（列の四十m 先）で構えて待つ。弓も射ない
  let fz = Infinity;
  for (const g of F.line || []) if (live(g)) fz = Math.min(fz, g.center().z);
  if (!isFinite(fz)) fz = rt.player.u.pos.z;
  for (const g of [...(F.l2 || []), ...(F.bows || [])]) if (g && !g.routing) {
    g.order = 'move'; g.speed = 2.4; g.aggro = 0; g.focus = null; g.fire = false;
    g.dest = { x: g.dest?.x ?? g.anchor.x, z: Math.min(g.center().z, fz - 40) }; g.onArrive = (q) => { q.order = 'hold'; };
  }
  const N = F.nobuG?.center?.() || rt.player.u.pos;
  const aim = () => F.nobuU?.alive ? F.nobuU : F.nobuG?.units.find((u) => u.alive) || rt.player.u;
  const mk = (x, z, list, sp) => {
    const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の別手', anchor: { x, z }, facing: Math.PI * 0.75, fleeDir: { x: -0.4, z: -1 }, width: 4, noRout: true,
      formation: 'line', morale: 90, dmgMult: 0.42, order: 'attack', focus: aim(), aggro: 14, seekRange: 40, speed: sp }, dress(list));
    (F.groups || []).push(g); v.raidGs.push(g);
    return g;
  };
  sfx('taiko', 0.8);
  rt.after(1, () => rt.say('足軽', '後ろじゃ！　葦原を回って林の兵が殿の旗本へ！', 3));
  rt.after(4.4, () => rt.say('組頭', '殿の首を狙うておる！　列を離れて旗本の後ろへ戻れ！', 3.2));
  rt.after(2, () => { mk(-62, Math.min(140, N.z + 34), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7, o: { flagScale: 1 } }], 3.4); rt.army.play('eshout', { x: -56, z: N.z + 28 }, 1.2); });
  rt.after(40, () => {
    if (v.raidDone || F.ending) return;
    mk(-66, Math.min(142, N.z + 40), [{ type: 'samurai', n: 1, o: { name: '林勢の騎馬頭', horse: true } }, { type: 'cavalry', n: 3 }, { type: 'samurai', n: 2 }], 4.6);
    sfx('gallop', 0.9);
    rt.say('組頭', '馬じゃ！　騎馬が殿へ駆けるぞ。槍を揃えて馬の脚を止めよ！', 3.2);
    rt.after(3.4, () => { if (!v.raidDone) rt.say(rt.G.lord ? '自分' : '織田信長', '来るなら来い。この信長が相手じゃ！', 2.8); });
  });
  // 組は殿の旗本の後ろへ駆け戻る
  if (F.allies) {
    const g = F.allies; g.focus = null; g.order = 'move'; g.speed = 3.8; g.aggro = 12;
    g.dest = { x: N.x - 6, z: Math.min(140, N.z + 10) }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 18; q.seekRange = 30; };
  }
}

export function target(rt) {
  const v = rt.flags.v15, P = rt.player.u.pos;
  let best = null, bd = Infinity;
  for (const g of v.raidGs || []) for (const u of g.units) {
    if (!inouEnemyAlive(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  if (u) return pinAt(rt, u.pos, '信長の旗本の後ろ', u, 3);
  const N = rt.flags.nobuG?.center?.();
  return N ? pinAt(rt, N, '信長の旗本の後ろ', null, 8) : pinAt(rt, null);
}

function done(rt, why) {
  const F = rt.flags, v = F.v15;
  if (v.raidDone) return;
  v.raidDone = true; v.ph = null;
  for (const g of v.raidGs) if (live(g)) { g.noRout = false; g.morale = 0; g.leader = null; g.speed = 4.6; }
  sfx('taiko', 1);
  rt.say('組頭', why === 'time' ? '旗本衆が別手を押し返したぞ！　列へ戻れ！' : '別手を止めたぞ！　殿は御無事じゃ。列へ戻れ！', 3);
  if (why !== 'time') rt.award((t) => t.side.push('信長の旗本を狙う林勢の別手を止めた'), '信長の旗本を狙う林勢の別手を止めた');
  // 正面の林勢は、列が整えばかかって来る
  for (const g of [...(F.l2 || []), ...(F.bows || [])]) if (g && !g.routing) { g.aggro = g.secKind === 'bow' ? 0 : 11; g.onArrive = g.secKind === 'bow' ? (q) => { q.order = 'hold'; } : (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 26; }; if (g.secKind !== 'bow' && g.order === 'hold') { g.order = 'attack'; g.seekRange = 26; } }
  rt.after(12, () => { for (const g of v.raidGs) for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 40) rt.army.despawn(u); });
}

export function tick(rt) {
  const F = rt.flags, v = F.v15;
  if (v.raidDone || F.ending) return;
  const t = rt.t - v.raidT;
  if (!v.raidPlayer) return;
  if (t > 45 && !v.raidGs.some(live)) done(rt, 'stop');
  else if (t > 170) done(rt, 'time');
}
