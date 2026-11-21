// K590②（オンライン PvP・docs/online_final_1120.md 14〜20）4武将×1,000（4,000 vs 4,000）を携帯で軽く動かす土台・クラウド k365-cloud-32（11/21）
//   工程：docs/online_plan_1121.md（cloud-18）。32＝見た目の段（近・中・遠・奥）、37＝重さと記憶（遠景の塊 pvp_army.js）。割り方の紙 docs/online_lod_1121.md
//   一武将＝一つの備（sonae.js）＝一つの部隊（butai.js）。部隊は名目の兵数（UNIT_STRENGTH=1000）を持ち、
//   近い・戦っている時だけ本物の兵（nearReal）、遠い時は少しの本物（farReal）＋軽い大軍（world.addDistantArmy）で数だけ押し合う。
//   本物の合計は butai.js の BUTAI_REAL_CAP（235・記憶の予算の内）。名目の数はいつも 本物＋軽い の合計（兵が消えたり増えたりしない）。
//   勝ち負けの数は名目で数える（本物が斬られれば名目が減り、軽い同士は lightClash で数が減る）。
import { makeSonae } from '../sonae.js';
import { butaiTick, lightClash } from '../butai.js';
import { sonaeTick } from '../sonae.js';

export const UNIT_STRENGTH = 1000;

// 兵の型（online_final 70〜72：槍20〜70%・鉄砲0〜40%・弓0〜30%・騎馬0〜40%・旗本5〜15%）。旗本は侍（samurai）で持つ
export const MIX4K = {
  標準: { ashigaru: 0.45, samurai: 0.1, gun: 0.2, bow: 0.1, cavalry: 0.15 },
  槍重視: { ashigaru: 0.65, samurai: 0.1, gun: 0.1, bow: 0.05, cavalry: 0.1 },
  鉄砲重視: { ashigaru: 0.35, samurai: 0.1, gun: 0.4, bow: 0.1, cavalry: 0.05 },
  騎馬重視: { ashigaru: 0.35, samurai: 0.1, gun: 0.1, bow: 0.05, cavalry: 0.4 },
  守備重視: { ashigaru: 0.55, samurai: 0.15, gun: 0.2, bow: 0.1, cavalry: 0 },
};

// 本物の人形の数（見た目の段）：霧の手前（約92m）は見せかけの兵を描かない決まり（flat_rule.js・kaito 10/28）なので、近くの大軍は本物の人形で見せる。
//   一隊 遠くても 140・近く 170（本人の武将 200）。八隊で 1,150〜1,450（今の戦の 2,100〜2,550 体より少ない）。一人ずつ考えるのは units.js の REALCAP（250）まで、
//   あふれた者は farSim（GPU 任せ）。部隊の本物の合計の上限は rt.butaiRealCap（REAL4K.cap）。名目の残り（1,000 − 本物）は軽い大軍（霧の先だけ描く）で数を持つ
//   11/21 iPhone 高の真似（tight=1・CPU 4倍遅く）で 1,450 は関ヶ原より重かった（実働 中央89ms 対 55ms・描く 299 対 191・記憶 473MB 対 460MB）。
//   司令塔の決め：一コマ20ms・描く300・記憶が関ヶ原以下に収まらなければ本物を 600 ほどに減らし、遠い隊は霧の手前でも見える軽い塊（37・flat_rule のオンラインだけの例外）で見せる
export const REAL4K = { mine: 120, near: 90, far: 50, cap: 600 };

// roster：[{ name: '柴田勝家', side: 0|1, flag, faction, armor, x, z, facing, type: '標準', nominal: 1000, mine: true, line, slot }]
export function army4kLayout(roster) {
  return roster.map((g, i) => ({
    id: g.id || `${g.side}_${g.name}`, name: g.label || `${g.name}の備`, team: g.side ? 1 : 0,
    faction: g.faction, flag: g.flag, armor: g.armor, taisho: g.name, fuku: g.fuku || null,
    line: g.line ?? (g.major ? 'honjin' : 1), slot: g.slot || ['left', 'center', 'right'][i % 3], major: !!g.major,
    nominal: g.nominal || UNIT_STRENGTH, mix: MIX4K[g.type] || MIX4K.標準,
    at: { x: g.x, z: g.z }, facing: g.facing || 0,
    nearReal: g.mine ? REAL4K.mine : REAL4K.near, farReal: REAL4K.far, real: REAL4K.far,
  }));
}

export function army4kSpawn(rt, roster) {
  rt.butaiRealCap = REAL4K.cap;
  return army4kLayout(roster).map((o) => makeSonae(rt, o));
}

// 毎コマ：部隊（本物と軽いの入れ替え）・備の状態・遠い（軽い）備どうしの数の押し合い（三十m 内）
export function army4kTick(rt, dt, o = {}) {
  butaiTick(rt, dt);
  sonaeTick(rt, dt);
  const L = rt.sonae || [], R = o.clashR ?? 30;
  for (const a of L) {
    if (a.team !== 0 || a.state === '敗走') continue;
    for (const e of L) {
      if (e.team !== 1 || e.state === '敗走') continue;
      if (Math.hypot(a.b.pos.x - e.b.pos.x, a.b.pos.z - e.b.pos.z) < R) lightClash(a.b, e.b, dt, 1);
    }
  }
}

// 両軍の名目の人数（HUD の両軍の人数の札）
export function army4kNominal(rt) {
  const n = [0, 0];
  for (const S of rt.sonae || []) n[S.team ? 1 : 0] += S.b.aliveNominal();
  return n;
}
