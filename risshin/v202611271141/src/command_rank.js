// 出世と号令（docs/rank_interlude_retry_spec_1108.md「1. 出世と操作」）
// 画面にボタンを増やさず、同じ号令の入口のまま、身分（指揮の段）で命令できる対象と規模が広がる。
//   0 足軽（織田1〜3）：号令なし
//   1 組頭（森部の後）：ついて来い・待て・かかれ。入口を短く押すと、敵を指していれば「かかれ」、組が付いて来ていれば「待て」、ほかは「ついて来い」
//   2 侍大将（姉川の後）：＋前進・退け・目標を攻めろ
//   3 備大将（設楽原の後）：同じ号令が自分の備（sonae.js）まで届く。鉄砲がいる時だけ射撃、槍が多い時だけ槍衾
//   4 大将（山崎の後・豊臣編〜）：軍配の図（gunbai.js）で 自分の備・左翼・右翼・予備 を選んで命令
//   5 天下人（IF 最終章に勝った後）：物語上の身分。操作は大将と同じ
// 保存（G.rank・save・load）には触らない。いま遊ぶ戦の並びの位置から決める（筋書きの外の戦は G.rank から）。
import { ODA_LINE, BATTLES } from './state.js';
import { clearedIds } from './cleared.js';
import { playerSonae } from './senkyo.js';

const ODA_AT = (id) => ODA_LINE.findIndex((b) => b.id === id);
// 段が上がる戦（この戦の「後」から上の段）
const PROMOTE = [['moribe', 1], ['anegawa', 2], ['shitaragahara', 3]];

export function cmdTier(rt) {
  const G = rt?.G;
  if (!G) return 0;
  if (G.lord) return 4;                         // 信長で遊ぶ時は全軍の大将
  const id = rt.def?.cmdTierId || BATTLES[rt.index]?.id || rt.def?.id;
  if (id) {
    if (/^t\d/.test(id)) return id === 't01_yamazaki' ? 3 : 4;   // 豊臣編：山崎までは備大将、賤ヶ岳から大将
    if (/^k\d/.test(id)) return 4;                                // 徳川編・IF 最終章
    const i = ODA_AT(id);
    if (i >= 0) {
      let t = 0;
      for (const [p, n] of PROMOTE) if (i > ODA_AT(p)) t = n;
      return t;
    }
  }
  // 筋書きの外の戦（試し・前の筋書き）は前の身分から。足軽の操作だけの戦（missionStyle）は号令なし
  if (rt.def?.missionStyle) return 0;
  const r = G.rank || 0;
  return r >= 4 ? 3 : r >= 2 ? 2 : r >= 1 ? 1 : 0;
}

// 物語上の身分の段（天下人は IF 最終章に勝った後だけ。操作は増やさない）
export function storyTier(rt) {
  return clearedIds().includes('k16_secret') ? 5 : cmdTier(rt);
}

// 段ごとの号令（号令の輪・指揮の札・キー）。射撃と槍衾は備大将から、その時の組の中身で出す
const BASE = [
  ['follow', 'hold', 'attack', 'gate', 'gather'],
  ['move', 'retreat', 'focus', 'face'],
];
function squadMix(rt) {
  let gun = 0, spear = 0, all = 0;
  for (const g of rt.squadGroups || []) {
    const n = g.count || 0;
    all += n;
    if (g.kind === 'gun' || g.kind === 'bow') gun += n;
    if (g.kind === 'spear' || !g.kind) spear += n;
  }
  return { gun, spear, all };
}
export function cmdAllowed(rt, id) {
  const t = cmdTier(rt);
  if (t < 1) return false;
  if (BASE[0].includes(id)) return true;
  if (t < 2) return false;
  if (BASE[1].includes(id)) return true;
  if (t < 3) return false;
  const m = squadMix(rt);
  if (id === 'fire' || id === 'roll' || id === 'ceasefire') return m.gun > 0;
  if (id === 'yari') return m.spear >= 6 && m.spear >= m.all * 0.4;
  if (/^form/.test(id)) return true;
  return false;
}

// 組頭の短押し：状況で一つを選ぶ（入口一つのまま）
export function contextOrder(p) {
  const rt = p.rt;
  const foe = p.lock && p.lock.alive && p.lock.team !== p.u.team && !p.lock.invuln ? p.lock : p.aimEnemy(28, true);
  if (foe && Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) < 28) return 'attack';
  const g = (rt.squadGroups || []).find((x) => x.count > 0);
  return g && g.order === 'follow' ? 'hold' : 'follow';
}

// 備大将から：組への号令を、自分の備（sonae.js の状態と下知の遅れ）へも渡す。同じ「前進」でも規模が変わる
const SONAE_CMD = { follow: 'move', hold: 'hold', attack: 'charge', focus: 'charge', move: 'move', retreat: 'retreat', yari: 'hold' };
export function relayToSonae(rt, id, o = {}) {
  if (cmdTier(rt) < 3) return false;
  const S = playerSonae(rt);
  if (!S || S.team !== 0 || S.b.aliveNominal() <= 0) return false;
  const c = sonaeCmd(rt, S, SONAE_CMD[id], o);
  if (!c) return false;
  S.order(c);
  rt.onSonaeOrder?.(S, c);      // 軍勢の厚み（army_depth.js）が受ける時の口
  return true;
}
function sonaeCmd(rt, S, id, o) {
  if (!id) return null;
  const P = rt.player.u.pos, pos = S.b.pos, f = rt.player.yaw ?? S.b.facing;
  if (id === 'hold') return { id: 'hold', form: o.yari ? 'yari' : undefined };
  if (id === 'move') { const to = o.point || { x: P.x, z: P.z }; return { id: 'move', to: { x: to.x, z: to.z } }; }
  if (id === 'retreat') return { id: 'retreat', to: { x: pos.x - Math.sin(f) * 30, z: pos.z - Math.cos(f) * 30 } };
  const foe = o.target?.pos || rt.army.nearestEnemy({ pos, team: 0 }, 260, (u) => !u.fleeing)?.pos;
  return { id: 'charge', to: foe ? { x: foe.x, z: foe.z } : { x: pos.x + Math.sin(f) * 40, z: pos.z + Math.cos(f) * 40 } };
}

// 「全軍、進め。」（IF 最終章だけのイベントの手。常設のボタンにしない）：通常の下知の仕組みで、味方の全部の備へ前進（ADVANCE）
export function allAdvance(rt, to) {
  let n = 0;
  for (const S of rt.sonae || []) {
    if (S.team !== 0 || S.b.aliveNominal() <= 0) continue;
    const c = { id: 'charge', to: to ? { x: to.x, z: to.z } : null };
    if (!c.to) { const f = S.b.facing; c.to = { x: S.b.pos.x + Math.sin(f) * 40, z: S.b.pos.z + Math.cos(f) * 40 }; }
    if (S.order(c)) { n++; rt.onSonaeOrder?.(S, c); }
  }
  if ((rt.squadGroups || []).some((g) => g.count > 0)) { rt.player.command('attack'); n++; }
  return n;
}
