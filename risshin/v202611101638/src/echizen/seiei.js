// ======================================================================
// 越前一向一揆・木ノ芽峠　主防御線（9〜12分）「一揆の精鋭の逆襲」（docs/oda15_plan_1108.md 18）
//   木ノ芽峠城の副郭を押さえた直後、主郭から一揆の精鋭（長刀の坊官と侍・鉄砲衆・槍）が念仏を唱えて打って出る。
//   副郭で押し返すまで主郭へは入れない（主郭の押さえを待たせる）。本人も戦い、将を討つか、隊が三分の一まで減るか、初撃から百二十秒で崩れる。
// 兵は十三人。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { toCourt } from './goryu.js';

export function active(rt) { const E = rt.flags.echElite; return !!E && !E.done; }

// 副郭が落ちた時に本体の onZoneFall から呼ぶ。ctx：{ look }（門徒の小袖の見た目）
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.echElite || !F.SZ?.byId?.kinome_hon) return;
  const hon = F.SZ.byId.kinome_hon, fuku = F.SZ.byId.kinome_fuku;
  const E = F.echElite = { at: rt.t, done: false };
  const dx = fuku.pos.x - hon.pos.x, dz = fuku.pos.z - hon.pos.z, d = Math.hypot(dx, dz) || 1;
  const at = { x: hon.pos.x + dx / d * 6, z: hon.pos.z + dz / d * 6 };
  E.g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '一揆の精鋭', fixed: true, noGuard: true, anchor: at, facing: Math.atan2(dx, dz),
    fleeDir: { x: -dx / d, z: -dz / d }, aggro: 30, seekRange: 45, width: 10, formation: 'line', morale: 100, noRout: true, speed: 3.4 },
  [{ type: 'busho', n: 1, o: { ...ctx.look, name: '一揆の坊官', weapon: 'naginata' } }, { type: 'samurai', n: 4, o: { ...ctx.look, weapon: 'naginata' } },
    { type: 'gun', n: 3, o: { ...ctx.look } }, { type: 'ashigaru', n: 5, o: { ...ctx.look } }]);
  E.g.order = 'attack';
  E.n0 = E.g.units.filter((u) => u.alive).length;
  // 主郭は精鋭を押し返すまで押さえられない
  const en = hon.enabled;
  hon.enabled = () => (!en || en()) && !active(rt);
  rt.after(1, () => { try { sfx('toki', 0.9); } catch (e) { /* なし */ } });
  rt.say('一揆の坊官', '南無阿弥陀仏！　進めば極楽、退けば地獄ぞ！', 3.6);
  rt.after(4, () => { if (!F.ending) rt.say('組頭', '主郭から精鋭が打って出たぞ！　副郭で踏みとどまれ！', 3.2); });
  rt.obj('elite', '副郭へ打って出た一揆の精鋭を、味方と押し返す', 'main', true);
}

export function tick(rt) {
  const F = rt.flags, E = F.echElite;
  if (!E || E.done || rt.over || F.ending || !rt.player.u.alive) return;
  const p = rt.player.u.pos, g = E.g;
  // 郭の外で待つだけでは、精鋭を討った事にも命の回復にもならない。
  if (!['kinome_fuku', 'kinome_hon'].some(id => F.SZ.byId[id]?.test(p.x, p.z))) return;
  const lord = g.units.find((u) => u.type === 'busho');
  const left = g.units.filter((u) => u.alive && !u.fleeing).length;
  // 11/10 クラウドの流し：本人の一撃が精鋭に当たった時だけ時計を始めていたので、斬り合いの間合いにいても当たりが出ないと
  //   五百秒止まった（残り七人のまま刻限切れ）。精鋭が八歩の内へ来た時から数え、打って出て百八十秒でも崩れる
  if (E.foughtAt == null && g.units.some((u) => u.alive && !u.fleeing && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 8)) E.foughtAt = rt.t;
  if (left && E.foughtAt == null && rt.t - E.at < 180) return;
  E.foughtAt ??= E.at;
  if (lord?.alive && left > Math.ceil(E.n0 / 3) && rt.t - E.foughtAt < 120) return;
  E.done = true;
  // 崩れた精鋭を主郭へ逃がすと、逃げる兵が主郭の口をふさいで本人が入れなかった（11/9 の流し）。
  //   残りは横から寄せた味方の鉄砲衆の一斉射に倒れる
  try { sfx('volley', 1); } catch (e) { /* なし */ }
  rt.say('前田利家', '鉄砲衆、横から放て！', 2.4);
  for (const u of g.units) if (u.alive) { u.invuln = false; rt.army.kill(u, null); }
  try { const c = F.SZ.byId.kinome_fuku.pos; rt.army.smoke(c.x - 12, rt.world.heightAt(c.x - 12, c.z) + 1.5, c.z, 1, 0); } catch (e) { /* なし */ }
  // 主郭へは味方の手と一緒に入る（本人一人で主郭の三十余人に入って討たれた・11/9 の流し）。
  //   前田・佐々・不破の手は、位置を飛ばさず副郭の北口から主郭へ懸かる。本人は息を整える
  for (const q of F.echGoryu?.groups || []) {
    toCourt(rt, q, F.SZ.byId.kinome_hon);
  }
  const me = rt.player.u;
  if (me.maxHp) me.hp = Math.max(me.hp, me.maxHp * 0.6);
  rt.objDone('elite');
  rt.say('組頭', '精鋭が崩れた！　主郭へ付け入れ！', 3);
  rt.award((t) => { t.side.push('木ノ芽峠城の副郭で一揆の精鋭を押し返した'); }, '一揆の精鋭を押し返した', F.SZ.byId.kinome_fuku.pos);
}
