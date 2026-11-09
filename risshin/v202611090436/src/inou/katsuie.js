// ======================================================================
// 稲生 8〜10分：柴田勝家との短い一騎打ち（一番有名な場面の続き）
//   信長の大音声「主に刃を向けるのか」（本体の shout）の直後、勝家は退かずに馬を進め、殿の馬前の主人公へ打ち掛かる。
//   主人公が槍を合わせ、勝家の命を半分まで削ると「わしも手を負うた」と退き、柴田勢が崩れる（本体の breakLine1）。
//   『信長公記』：勝家は手を負うて退いた。勝家は討てない（命は半分より下へ減らない）。一分で決まらなければ旗本が押し返す。
// ======================================================================
import { sfx } from '../audio.js';
import { pinAt } from './index.js';
import { inouEnemyAlive } from '../b_inou_goals.js';

const HP = 150;

export function start(rt, def, C) {
  const F = rt.flags, v = F.v15;
  if (v.duelT) return !v.duelDone;
  const K = F.shibaG?.units.find((u) => u.name === '柴田勝家');
  if (!K?.alive || F.stage !== 1) return false;
  v.duelT = rt.t; v.ph = 'duel'; v.K = K;
  K.invuln = false; K.maxHp = K.hp = HP; K.keep = true;
  const g = F.shibaG; g.noAI = false; g.fixed = false; g.order = 'attack'; g.focus = rt.player.u; g.aggro = 18; g.seekRange = 40; g.speed = 4;
  // 勝家の命は半分より下へ減らない（討てない）。主人公の槍が当たった数を数える
  const A = rt.army, dmg = A.damage, kill = A.kill;
  v.unwrap = () => { A.damage = dmg; A.kill = kill; };
  A.damage = function (t, a, ...r) {
    if (t === K) { a = Math.min(a, Math.max(0, t.hp - t.maxHp * 0.5)); if (r[0]?.isPlayer && a > 0) v.kHits = (v.kHits || 0) + 1; }
    return dmg.call(this, t, a, ...r);
  };
  A.kill = function (t, ...r) { if (t === K) { t.hp = Math.max(t.hp, t.maxHp * 0.5); return; } return kill.call(this, t, ...r); };
  sfx('gallop', 0.9); sfx('taiko', 1);
  rt.army.play('eshout', K.pos, 1.5);
  rt.say('柴田勝家', '上総介殿の御前とて、この権六は退かぬ！　参る！', 3.2);
  rt.after(3.6, () => { if (v.ph === 'duel') rt.say('組頭', '勝家じゃ！　殿の馬前を守れ、槍を合わせよ！', 3); });
  return true;
}

export function target(rt) { const K = rt.flags.v15?.K; return inouEnemyAlive(K) ? K : null; }
export function pin(rt) { const K = target(rt); return K ? pinAt(rt, K.pos, '信長の馬前', K, 3) : pinAt(rt, null); }

function end(rt, by) {
  const F = rt.flags, v = F.v15, K = v.K;
  if (v.duelDone) return;
  v.duelDone = true; v.ph = null;
  if (K) { K.invuln = true; K.noTarget = true; K.target = null; K.atk = null; }   // 手負うて退く勝家は討てない（斬りかからせない）
  const g = F.shibaG; if (g) { g.focus = null; g.aggro = 0; }
  sfx('taiko', 1);
  if (by === 'player') {
    rt.award((t) => t.side.push('柴田勝家と槍を合わせ、手を負わせた'), '柴田勝家と槍を合わせ、手を負わせた');
    rt.say('柴田勝家', 'ぐっ……若い足軽の槍か。やるな。', 2.6);
  } else rt.say('森可成', '勝家殿、手負いと見た！　旗本、押し返せ！', 2.8);
  rt.after(2.8, () => { v.unwrap?.(); v.def.breakLine1(rt); });
}

export function tick(rt) {
  const F = rt.flags, v = F.v15, K = v.K;
  if (v.duelDone || F.ending) return;
  if (!K?.alive) { end(rt, 'other'); return; }
  if ((v.kHits || 0) >= 2 && K.hp <= K.maxHp * 0.56) end(rt, 'player');
  else if (rt.t - v.duelT > 60) { K.hp = Math.min(K.hp, K.maxHp * 0.6); end(rt, 'other'); }
}
