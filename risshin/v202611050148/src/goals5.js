// 全戦の「目標5つ」（kaito 11/2 Q「目標がどんどん変わりすぎ。5つ全部を最初から出し、済んだ物にチェック。達成した数で星1〜5。
//   大将を自分で討たずに終わったら星が下がる」・O「倒す数を出す」）。
//   目標は戦の始めに一度だけ決め、戦の間は並びを変えない。済んだ物は戻さない。果たせなくなった物（大将を味方が討った・時が過ぎた）は fail。
//   並べ方（どの戦も同じ）：戦の段（stages.js）の一行 → 敵の大将を自分で討つ → 時のうちに勝つ → 敵を何人討つ → 深手を負わずに勝つ、で5つまで埋める。
//   段が多い戦は後ろの段（勝ちにつながる段）を残す。稲生だけは段の中の目標から5つを選ぶ（B 節の作り）。
//   目当て（target）：今の目標の相手と場所。右上の地図のひし形・地面の矢印・頭上の名前（goal_sign.js）が同じ物を指す。
import { STAGES, stageNow } from './stages.js';
import { missionTarget } from './mission_pin_target.js';

const KILL_N = 8;          // 「敵を何人討つ」の数
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
const won = (rt) => rt.tracker?.main === true;
const aliveIn = (gs) => (gs || []).reduce((n, g) => n + (g?.units || []).reduce((m, u) => m + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0), 0);
const allIn = (gs) => (gs || []).reduce((n, g) => n + (g?.units?.length || 0), 0);

// 目標の字から、相手の呼び名を取る（「後ろの弓組を討つ」→「後ろの弓組」・「雨に紛れ、今川の本陣へ迫る」→「今川の本陣」）
export function goalNoun(text) {
  const last = String(text || '').split('、').pop();
  const m = /^(.+?)(?:を|へ|まで|に)/.exec(last);
  const n = m ? m[1] : '';
  return n.length >= 2 && n.length <= 9 && !/^(敵|雨|時|組)$/.test(n) ? n : '';
}

function stageGoal(k, text) {
  return { kind: 'stage', k, text, check: (rt) => won(rt) || (stageNow(rt)?.i ?? 0) > k };
}
function bossGoal(name) {
  return {
    kind: 'boss', name, text: `${name}を自分で討つ`,
    check: (rt) => !!rt._g5?.own.has(name) || !!rt._g5?.dead.has(name),   // ほかの者が討っても進む（kaito 11/3 AV14）
    fail: (rt) => { const u = bossUnit(rt, name); return !rt._g5?.own.has(name) && !rt._g5?.dead.has(name) && rt.over && !!u; },
  };
}
function killGoal(n) {
  return { kind: 'kills', n, text: `敵を${NUM[n] || n}人討つ`, count: (rt) => [Math.min(n, rt.stats?.kills || 0), n], check: (rt) => (rt.stats?.kills || 0) >= n };
}
function hurtGoal() {
  return { kind: 'hurt', text: '深手を負わずに勝つ', check: (rt) => won(rt) && !rt._g5?.deep, fail: (rt) => !!rt._g5?.deep };
}
// 時の制限は目標一つ一つにかける（kaito 11/3 AP8）。今の目標になった時から数え、過ぎたら ✕（星は戻らない）。目当てと進みは続く
const SEC = { stage: 200, main: 420, boss: 300 };
const withSec = (g) => (SEC[g.kind] && !g.sec ? { ...g, sec: SEC[g.kind] } : g);
const flag = (k) => (rt) => !!rt.flags?.[k];

// 稲生（B 節）：先手 → 弓組 → 二の備 → 美作守 → 時のうち。崩す備は倒した数を出す
const OWN = {
  inou: () => [
    // 11/3 p100_inou（kaito AQ1・AR1）：どの目標も「誰を・どこで・どうする」が字と地図と頭上の▼で分かる言い方に。敵を何人討つは練習の一つだけ
    { kind: 'stage', k: 0, text: '前の遅れ兵を倒せ', check: (rt) => (rt.flags.stage || 0) >= 1 || (rt.flags.pk || 0) >= 3, groups: (rt) => (rt.flags.practice ? [rt.flags.practice] : []) },
    { kind: 'stage', k: 1, text: '柴田勢の列を田の道で崩す', check: flag('line1Broken'), groups: (rt) => rt.flags.l1, total: (rt) => rt.flags.l1N },
    { kind: 'stage', k: 2, text: '林勢の先手を土手の前で崩す', check: flag('line2Broken'), groups: (rt) => [...(rt.flags.l2 || []), ...(rt.flags.bows || [])], total: (rt) => (rt.flags.l2N || 0) + (rt.flags.bowN || 0) },
    { kind: 'stage', k: 3, text: '美作守の旗本を土手の上で崩す', check: flag('guardDown'), groups: (rt) => [...(rt.flags.bankG || []), ...(rt.flags.guardG ? [rt.flags.guardG] : [])] },
    { ...bossGoal('林美作守'), k: 4 },
  ],
  // 森部（11/3 p100_moribe・docs/battle_refs/moribe.md）：楡俣川を渡る → 北岸で先手 → 森部の野で両将の槍列 → 両将の一人を自分で討つ → 墨俣への道で殿。
  //   どれも場所と行い。敵を何人討つ・「崩す」は使わない（標準 三-1・11/4 moribe）
  moribe: () => {
    const F = (rt) => rt.flags;
    const bosses = ['長井甲斐守', '日比野下野守'];
    return [
      { kind: 'stage', k: 0, text: '楡俣川の浅瀬を渡り、北岸の畦へ上がる', noun: '北岸の畦', check: (rt) => !!F(rt).pointReached || !!F(rt).signal },
      { kind: 'stage', k: 1, text: '北岸の畦で斎藤の先手を押し返す', noun: '斎藤の先手', check: (rt) => !!F(rt).vBroken || F(rt).stage === 'hold' || F(rt).stage === 'press', groups: (rt) => [F(rt).V] },
      { kind: 'stage', k: 1, text: '森部の野で両将の槍列を受け止める', noun: '槍列', check: (rt) => F(rt).stage === 'press' || !!F(rt).ending,
        groups: (rt) => [F(rt).M, F(rt).N, ...(F(rt).reserves || [])] },
      { kind: 'stage', k: 2, text: '長井甲斐守か日比野下野守を自分で討つ', check: (rt) => bosses.some((n) => rt._g5?.own.has(n)),
        fail: (rt) => (F(rt).bossDown || 0) >= 2 && !bosses.some((n) => rt._g5?.own.has(n)) },
      { kind: 'stage', k: 2, text: '墨俣への道で両将の殿を討ち破る', noun: '殿', check: (rt) => won(rt), groups: (rt) => F(rt).shingari || [] },
    ];
  },
  // 八王子城（11/4 p100）：大手 → 曳橋で打って出た敵を迎え撃つ → 付け入り → 尾根の三つの曲輪 → 本丸の中山勘解由。人数を討つ目標は置かない
  t11_hachioji: () => {
    const dpi = (rt) => (rt.flags.dp ? (rt.flags.dp.on ? rt.flags.dp.i : 99) : -1);
    const cur = (k) => (rt) => (dpi(rt) === k ? rt.flags.dp.cur?.groups || [] : []);
    return [
      { kind: 'stage', k: 0, text: '大手の曲輪で近藤出羽守の組を討つ', check: (rt) => won(rt) || dpi(rt) >= 1, groups: cur(0) },
      { kind: 'stage', k: 1, text: '曳橋で打って出た北条勢を迎え撃つ', noun: '打って出た敵', check: (rt) => won(rt) || !!rt.flags.sallyBack, groups: (rt) => (rt.flags.sallyG && !rt.flags.sallyBack ? [rt.flags.sallyG] : []) },
      { kind: 'stage', k: 2, text: '退く敵に続き、冠木門から御主殿へ攻め入る', noun: '冠木門', check: (rt) => won(rt) || dpi(rt) >= 4 },
      { kind: 'stage', k: 3, text: '金子丸・高丸・松木曲輪を落とす', check: (rt) => won(rt) || dpi(rt) >= 7, groups: (rt) => (dpi(rt) >= 4 && dpi(rt) <= 6 ? rt.flags.dp.cur?.groups || [] : []) },
      { ...bossGoal('中山勘解由'), k: 4 },
    ];
  },
  // 桶狭間（11/4 jin）：史実の順（中島砦を出て谷の出口へ → 雨の後に坂道の守り → 幕の前の旗本 → 幕の入口 → 退く義元を毛利が討つ）。
  //   首を取ったのは毛利新介なので「自分で討つ」は置かない。敵を何人討つは使わない（AW3）
  // 墨俣（11/4 jin・docs/battle_refs/sunomata.md）：伝承の順（北の口の先手 → 西の柵の二の手 → 三の手の北の旗印 →
  //   伏兵が西の外へ出て挟む → 寄せ大将を討つ）。行き先は戦の印（持ち場の柵・寄せた敵）と同じ。敵を何人討つは置かない
  sunomata: () => {
    const F = (rt) => rt.flags, out = (g) => !g || !g.count || g.routed;
    return [
      { kind: 'stage', k: 0, text: '北の柵の口で斎藤の先手を止める', noun: '北の柵の口', check: (rt) => won(rt) || (F(rt).wave || 0) >= 2 },
      { kind: 'stage', k: 1, text: '西の柵で斎藤の二の手を止める', noun: '西の柵', check: (rt) => won(rt) || (F(rt).wave || 0) >= 3 },
      { kind: 'stage', k: 2, text: '北の柵で三の手の旗印を止める', noun: '三の手の旗印', check: (rt) => won(rt) || F(rt).wave === 3 && out(F(rt).W3a) },
      { kind: 'stage', k: 3, text: '伏兵と西の柵の外の寄せ手を挟む', noun: '西の柵の外', check: (rt) => won(rt) || F(rt).wave === 3 && !!F(rt).reinforceCalled && !!F(rt).W3b && (F(rt).W3b.units || []).filter((u) => u.alive && !u.fleeing && u !== F(rt).yoseBoss).length <= 4 },
      { kind: 'stage', k: 3, text: '斎藤方の寄せ大将を討ち取る', noun: '寄せ大将', check: (rt) => won(rt) || F(rt).wave === 3 && !!F(rt).yoseBoss && (!F(rt).yoseBoss.alive || F(rt).yoseBoss.fleeing) },
    ].map((g) => ({ ...g, sec: 400 }));   // 寄せ一つが三分を超える（柵の修理と次の寄せの間を含む）。段の長さに合わせる
  },
  okehazama: () => [
    { kind: 'stage', k: 0, text: '谷の出口で組の旗に集まる', noun: '組の旗', check: (rt) => won(rt) || rt.phase === 'wait' || rt.phase === 'assault' },
    { kind: 'stage', k: 1, text: '坂道で松井宗信の先手を破る', noun: '松井宗信の先手', check: (rt) => won(rt) || !!rt.flags.entered || (rt.flags.roadStep ?? -1) >= (rt.flags.road?.length ?? 3), groups: (rt) => rt.flags.road },
    { kind: 'stage', k: 2, text: '幕の前で義元の旗本を破る', noun: '義元の旗本', check: (rt) => won(rt) || !!rt.flags.guardOpened },
    { kind: 'stage', k: 2, text: '幕の入口から義元へ迫る', noun: '幕の入口', check: (rt) => won(rt) || !!rt.flags.mouthReached || !!rt.flags.koshiLeft || !!rt.flags.yoshiDown },
    { kind: 'stage', k: 2, text: '退く旗本を追い、義元を討ち取る', noun: '義元', check: won },
  ],
  // 志賀の陣・宇佐山城（11/4 jin_shiga_r・docs/battle_refs/shiga.md）：『信長公記』の順（十六日 町口の足軽合戦で小勝ち → 十九日 浅井・朝倉が両手から寄せ、
  //   可成・信治・青地が討死 → 坂道を宇佐山城へ退く → 端城を焼かれ、木戸を一つずつ守る → 二十四日 信長の後詰）。敵を何人討つ・自分で討つは置かない（AW3）
  shiga: () => {
    const F = (rt) => rt.flags, st = (rt) => F(rt).step || 0;
    return [
      { kind: 'stage', k: 0, text: '坂本の町口で浅井・朝倉の先手を押し返す', noun: '町口', action: '町口で先手を防げ', check: (rt) => won(rt) || st(rt) >= 1.25 },
      { kind: 'stage', k: 0, text: '両手から寄せる大軍を、町口で森可成と支える', noun: '町口', action: '森隊の列で支えよ', check: (rt) => won(rt) || st(rt) >= 2 },
      { kind: 'stage', k: 1, text: '坂道を上り、宇佐山城の大手木戸へ退く', noun: '大手木戸', action: '木戸へ退け', check: (rt) => won(rt) || st(rt) >= 3 },
      { kind: 'stage', k: 2, text: '二の丸・本丸の木戸で寄せ手を防ぐ', noun: '本丸の木戸', action: '木戸で防げ', check: (rt) => won(rt) || (!!F(rt).backed && st(rt) >= 3.5) },
      { kind: 'stage', k: 2, text: '本丸を守り抜き、信長の後詰を迎える', noun: '本丸', action: '本丸を守れ', check: won },
    ];
  },
  // 三方ヶ原（11/4 jin・docs/battle_refs/mikatagahara.md）：史実の順（平手の持ち場で北へ構える → 小山田の先手の投石と寄せ → 山県の赤備えが右から →
  //   鶴翼が崩れ南の坂で殿 → 犀ヶ崖の東を下って浜松城へ）。勝てぬ戦で、生きて城へ退くのが勝ち。敵を何人討つ・自分で討つは置かない（AW3）
  mikatagahara: () => {
    const F = (rt) => rt.flags;
    return [
      { kind: 'stage', k: 0, text: '平手の槍の持ち場で北へ構える', noun: '平手の持ち場', action: '持ち場で構えよ',
        check: (rt) => won(rt) || (F(rt).step || 0) >= 2 || !!F(rt).dpA || ((F(rt).step || 0) >= 1 && Math.hypot(rt.player.u.pos.x - 19.25, rt.player.u.pos.z + 12.25) < 8) },
      { kind: 'stage', k: 0, text: '持ち場の前で小山田の先手を押し返す', noun: '小山田の先手', action: '先手を押し返せ', check: (rt) => won(rt) || !!F(rt).dpA || (F(rt).step || 0) >= 2 },
      { kind: 'stage', k: 1, text: '右の森の際で山県の赤備えを槍で受ける', noun: '山県の赤備え', action: '槍で馬を受けよ', check: (rt) => won(rt) || !!F(rt).dpB || (F(rt).step || 0) >= 3 },
      { kind: 'stage', k: 2, text: '南の坂で追手を支え、味方を先に下らせる', noun: '南の坂', action: '坂で追手を防げ', check: (rt) => won(rt) || (F(rt).step || 0) >= 3 },
      { kind: 'stage', k: 2, text: '崖の東を下り、浜松城の口へ退く', noun: '浜松城の口', action: '城の口へ走れ', check: won },
    ];
  },
  // 高遠（11/4 p100）：山中城の付け入りの型。大手で打って出た城兵を受け、退く城兵に続いて門を抜け、曲輪を一つずつ奥へ。
  //   盛信は主殿で果てる（自分で討つ目標にしない）。敵を何人討つは一つだけ
  takato: () => [
    { kind: 'stage', k: 0, text: '大手門から打って出た城兵を押し返す', noun: '大手門', check: (rt) => won(rt) || !!rt.flags.sallyReturning || !!rt.flags.sanFell || !!rt.flags.gates?.oteInner?.opened && !rt.flags.sallyOut && !rt.flags.sallyUntil },
    { kind: 'stage', k: 0, text: '退く城兵に続き、大手門から三の丸へ入る', noun: '大手門', check: (rt) => won(rt) || !!rt.flags.sanFell },
    { kind: 'stage', k: 1, text: '二の丸の土橋を渡り、二の丸の門を破る', noun: '二の丸の土橋', check: (rt) => won(rt) || !!rt.flags.niFell },
    { kind: 'stage', k: 2, text: '本丸門を破り、本丸の旗を守る', noun: '本丸門', check: won },
    killGoal(KILL_N),
  ],
  // 三木・大村（11/3 p100_miki・11/4 jin）：夜の荷駄 → 平田の木戸で打って出た城兵 → 大村坂（史実の順）。
  //   どれも場所と行い（「崩す」「何人討つ」は使わない）。長治は城の本丸で囲まれたまま（翌年に自害）なので目標にしない。
  //   行き先は固定（rt.def.mikiAt：大村道の西・平田の木戸・大村坂）
  miki: () => {
    const F = (rt) => rt.flags, at = (k) => (rt) => rt.def.mikiAt?.[k] || null;
    return [
      { kind: 'stage', k: 0, text: '大村道で、毛利の荷駄の護衛を討つ', noun: '荷駄の護衛', place: at('escort'), check: (rt) => won(rt) || !!F(rt).dropped || (F(rt).step || 0) >= 2 || (F(rt).step === 1 && !aliveIn([F(rt).escort].filter(Boolean))),
        groups: (rt) => [F(rt).escort, F(rt).escortFront, F(rt).egun].filter(Boolean) },
      { kind: 'stage', k: 1, text: '平田の木戸で、城兵を止める', noun: '平田砦の木戸', place: at('gate'), check: (rt) => won(rt) || (F(rt).step || 0) >= 2 || (!!F(rt).sallies?.length && !aliveIn(F(rt).sallies)),
        groups: (rt) => F(rt).sallies || [] },
      { ...bossGoal('別所甚太夫'), k: 1 },
      { kind: 'stage', k: 2, text: '大村坂で、三太夫の勢を討つ', noun: '大村坂', place: at('omura'), check: (rt) => won(rt) || (F(rt).step === 2 && !aliveIn(F(rt).foes || [])),
        groups: (rt) => [F(rt).reserve].filter(Boolean) },
      { kind: 'stage', k: 2, text: '大村坂の持ち場で、列を固める', noun: '大村坂の持ち場', place: at('omura'), check: won },
    ];
  },
  // 設楽原（11/3 b100）：どこで・何をするかの5つ。勝頼は後方の才ノ神から退き、史実どおり討てない（総大将を目標にしない）。
  //   守る段は場所（持ち場の旗）を指し、寄せる隊の崩れた数を出す。敵を何人討つは使わない（11/4）
  shitaragahara: () => {
    const wave = (k) => (rt) => rt.flags.waveGroups?.[k];
    const broken = (k) => (rt) => { const g = wave(k)(rt); if (!g) return null; const all = g.units.length; return [all - aliveIn([g]), all]; };
    return [
      { kind: 'stage', k: 0, text: '大宮前の柵で真田隊を止める', noun: '大宮前の柵', check: (rt) => !!wave(0)(rt)?.doneWave || !!rt.flags.chaseOrdered, count: broken(0) },
      { kind: 'stage', k: 0, text: '柳田前の柵で内藤隊を止める', noun: '柳田前の柵', check: (rt) => !!wave(1)(rt)?.doneWave || !!rt.flags.chaseOrdered, count: broken(1) },
      { kind: 'stage', k: 1, text: '連吾川を渡り、馬場隊を追う', noun: '馬場隊', check: (rt) => (rt.flags.tsuigeki?.stage ?? 0) >= 2 || !!rt.flags.ending },
      { kind: 'stage', k: 1, text: '馬場隊を崩す', noun: '馬場隊', check: (rt) => !!rt.flags.dpB && !rt.flags.tsuigeki?.timedOut,
        fail: (rt) => !!rt.flags.dpB && !!rt.flags.tsuigeki?.timedOut, groups: (rt) => [rt.flags.rear] },
    ];
  },
  // 山中城（11/3 p100_t09_yamanaka）：出丸→障子堀→馬出しの迎え撃ち→付け入り→本丸。人数を数えるのは出丸の一つだけ
  t09_yamanaka: () => [
    { kind: 'stage', k: 0, text: '出丸の柵を破り、間宮康俊の隊を討ち取る', noun: '間宮康俊の隊', check: (rt) => won(rt) || (rt.flags.step || 0) >= 2, groups: (rt) => (rt.flags.dai ? [rt.flags.dai] : []) },
    { kind: 'stage', k: 1, text: '障子堀を畝の上で渡る', noun: '障子堀', check: (rt) => won(rt) || (rt.flags.step || 0) >= 3 },
    { kind: 'stage', k: 2, text: '馬出しから出た北条の隊を迎え撃つ', noun: '馬出しの北条の隊', count: () => null, groups: (rt) => (rt.flags.uma && rt.flags.sub === 'sally' ? [rt.flags.uma] : []), check: (rt) => won(rt) || rt.flags.sub === 'back' || (rt.flags.step || 0) >= 4 },
    { kind: 'stage', k: 3, text: '退く兵に続いて大手門から入る', noun: '大手門', check: (rt) => won(rt) || (rt.flags.step || 0) >= 4 },
    { kind: 'stage', k: 4, text: '本丸へ上り、松田康長の旗本を討ち取る', noun: '松田康長の旗本', count: () => null, groups: (rt) => (rt.flags.hon ? [rt.flags.hon] : []), check: won },
  ],
  // 越前・木ノ芽峠（11/4 p100_echizen）：山中城の付け入りの型。木戸前へ打って出た一揆勢を迎え撃ち → 退く敵について木戸を抜ける
  //   （追いすがれなければ掛矢で破る）→ 観音丸の郭の守兵を討つ → 府中へ逃げる一揆勢を北口まで追う。敵を何人討つは入れない
  echizen: () => {
    const F = (rt) => rt.flags;
    const gateUp = (rt) => !!F(rt).gateKannon?.struct?.alive;
    const gateAt = (rt) => { const s = F(rt).gateKannon?.struct?.seg; return s ? { x: (s[0] + s[2]) / 2, z: (s[1] + s[3]) / 2 } : null; };
    return [
      { kind: 'stage', k: 0, text: '木戸前に打って出た一揆勢を討つ', noun: '打って出た一揆勢', check: (rt) => won(rt) || !!F(rt).sallyBroke || !gateUp(rt),
        groups: (rt) => [F(rt).gateSally?.real].filter(Boolean) },
      { kind: 'stage', k: 0, text: '退く敵を追い、観音丸の木戸を抜ける', noun: '観音丸の木戸', check: (rt) => won(rt) || !gateUp(rt), place: gateAt },
      { kind: 'stage', k: 1, text: '観音丸の郭の守兵を討つ', noun: '観音丸の守兵', check: (rt) => won(rt) || !!F(rt).kannonFell,
        groups: (rt) => [F(rt).d?.kannon?.real].filter(Boolean) },
      { kind: 'stage', k: 1, text: '逃げる一揆勢を観音丸の北口まで追う', noun: '観音丸の北口', check: won, place: (rt) => F(rt).echExitAt || null },
      // 11/4 jin_echizen（AW3）：「敵を何人討つ」は入れない
    ];
  },
};

// 小田原征伐（11/3 p100_t12_odawara）：篠曲輪の夜討ち（付け入り）→ 旗を守る → 官兵衛を本丸の門へ。段は b_depth の段の番（F.dp.i）で進む
OWN.t12_odawara = () => {
  const at = (n) => (rt) => won(rt) || (rt.flags.dp?.i ?? -1) >= n || (rt.flags.dp && !rt.flags.dp.on);
  const foes = (n) => (rt) => (rt.flags.dp?.i === n ? rt.flags.dp.cur?.groups || [] : []);
  return [
    { kind: 'stage', k: 0, text: '山王川を渡り、篠曲輪の木戸へ寄せる', noun: '篠曲輪の木戸', check: at(1) },
    { kind: 'stage', k: 1, text: '木戸から打って出た北条勢を返す', check: at(2), groups: foes(1) },
    { kind: 'stage', k: 2, text: '退く敵に続いて篠曲輪へ入る', noun: '篠曲輪', check: at(3) },
    { kind: 'stage', k: 3, text: '篠曲輪の井伊の旗を守る', noun: '井伊の旗', check: at(4), groups: foes(3) },
    { kind: 'stage', k: 4, text: '山王川の東の井伊の陣へ退く', noun: '井伊の陣', check: at(5) },
    { kind: 'stage', k: 5, text: '官兵衛を本丸の門まで守る', noun: '本丸の門', check: won },
  ];
};

// 忍城攻め（11/3 p100_t10_oshi）：堤の夜討ち → 堰 → 丸墓山へ逃げる → 佐間口の打って出 → 付け入り。敵を何人討つは使わない（11/4）
OWN.t10_oshi = () => {
  const st = (n) => (rt) => won(rt) || (rt.flags.step ?? 0) > n;
  return [
    { kind: 'stage', k: 0, text: '浅瀬の口で、夜討ちの城兵を防ぐ', noun: '浅瀬の口', check: st(1) },
    { kind: 'stage', k: 1, text: '堤の西の堰へ行き、堰を切る', noun: '堰', check: st(2) },
    { kind: 'stage', k: 2, text: '人夫と兵を連れ、丸墓山へ走る', noun: '丸墓山', check: st(3) },
    { kind: 'stage', k: 3, text: '門前で、打って出た城兵を押し返す', noun: '佐間口', check: st(5) },
    { kind: 'stage', k: 5, text: '佐間口の枡形へ入り、二の丸の口を払う', noun: '二の丸の口', check: won },
  ];
};

function build(rt) {
  const key = rt.def.key;
  if (OWN[key]) return OWN[key](rt).map(withSec);
  // 戦の定義が自分の5つを持つ時（def.goals5。山崎など）
  if (typeof rt.def.goals5 === 'function') return rt.def.goals5(rt).slice(0, 5).map(withSec);
  const list = STAGES[key];
  // def.stageGoalsOnly：段だけを目標にする（「敵を何人討つ」「深手を負わずに勝つ」で埋めない。kaito AW の3）
  if (rt.def.stageGoalsOnly && list) return list.map((s, k) => stageGoal(k, s[0])).slice(-5).map(withSec);
  const T = rt.taisho?.b;
  // 敵の大将：総大将の表（taisho.js）。無い戦は、討つ段の一行の頭の名（「長井甲斐守・日比野下野守を討つ」→ 長井甲斐守）
  let boss = T && T.name && !T.survives ? T.name : null;
  if (!boss && !(T && T.survives) && list) {
    const last = [...list].reverse().find((s) => /^[^、]{2,}を討/.test(s[0]) && !/^(敵|兵)/.test(s[0]));
    const nm = last && last[0].split('を討')[0].split('・')[0];
    if (nm && nm.length >= 3 && nm.length <= 6 && !/[のと]/.test(nm)) boss = nm;
  }
  let stages = list ? list.map((s, k) => ({ k, text: s[0] })).filter((s) => s.text !== '練習') : [];
  let bossIn = false;
  stages = stages.map((s) => (boss && s.text.includes(boss.slice(0, 2)) && /討/.test(s.text) ? (bossIn = true, { ...s, boss: true }) : s));
  const extras = (boss && !bossIn ? 1 : 0) + 1;
  const nS = Math.max(1, Math.min(stages.length, 5 - extras));
  stages = stages.slice(stages.length - nS);
  const goals = [];
  for (const s of stages) goals.push(s.boss ? { ...bossGoal(boss), k: s.k } : stageGoal(s.k, s.text));
  if (!list) goals.push({ kind: 'main', text: '', check: won, textOf: (rt) => mainText(rt) });
  if (boss && !bossIn) goals.push(bossGoal(boss));
  if (goals.length < 5) goals.push(killGoal(KILL_N));
  if (goals.length < 5) goals.push(hurtGoal());
  if (goals.length < 5) goals.push(killGoal(KILL_N * 2));
  return goals.slice(0, 5).map(withSec);
}

// 段の無い戦（豊臣編・徳川編など）の一つ目：その戦の主の任務の一行
function mainText(rt) {
  const o = (rt.objectives || []).find((x) => x && x.kind === 'main' && x.text);
  let t = String(o?.text || rt.def.goal || '').split(/[。（(]/)[0].trim();
  if (t.length > 18) t = t.split('、').pop();
  return t && t.length <= 18 ? t : '戦に勝つ';
}

function bossUnit(rt, name) {
  const G = rt._g5;
  if (G && G.bossU && G.bossU.name === name && G.bossU.alive && !G.bossU.gone) return G.bossU;
  const me = rt.player?.u?.team ?? 0;
  const u = (rt.army?.units || []).find((o) => o.alive && !o.gone && o.team !== me && o.name === name) || null;
  if (G) G.bossU = u;
  return u;
}

function ensure(rt) {
  if (!rt || rt.def?.town || rt.def?.dojo || !rt.player?.u) return null;
  if (rt._g5) return rt._g5;
  rt._g5 = { goals: [], done: [], fail: [], late: [], pass: [], nowI: -1, nowT0: 0, own: new Set(), dead: new Set(), deep: false, t0: rt.t || 0, endT: null, bossU: null, tgAt: -1, tg: null };
  rt._g5.goals = build(rt);
  return rt._g5;
}

// 毎コマ（hud から）。済んだ・果たせなくなったを確かめ、5つの今の様子を返す
export function fiveGoals(rt) {
  const G = ensure(rt);
  if (!G) return null;
  const u = rt.player.u;
  if (!rt.over && u.alive && u.maxHp && u.hp / u.maxHp < 0.3) G.deep = true;
  if ((rt.over || won(rt)) && G.endT == null) G.endT = rt.t;
  const nowOf = () => G.goals.findIndex((g, i) => (g.kind === 'stage' || g.kind === 'main' || g.kind === 'boss') && !G.pass[i] && !G.done[i] && !(G.fail[i] && !G.late[i]));
  const rows = G.goals.map((g, i) => {
    if (!G.done[i] && !G.fail[i]) {
      let ok = false;
      try { ok = !!g.check(rt); } catch (e) { ok = false; }
      if (ok) G.done[i] = true;
      else { let ng = false; try { ng = !!g.fail?.(rt); } catch (e) { ng = false; } if (ng) G.fail[i] = true; }
    } else if (G.late[i] && !G.pass[i]) {
      try { if (g.check(rt)) G.pass[i] = true; } catch (e) { /* 続ける */ }
    }
    let count = null;
    try {
      if (g.count) count = g.count(rt);
      else if (g.groups && !G.done[i]) { const gs = g.groups(rt); const all = g.total?.(rt) || allIn(gs); if (all > 0) count = [all - aliveIn(gs), all]; }
    } catch (e) { count = null; }
    return { text: g.textOf ? g.textOf(rt) : g.text, kind: g.kind, done: !!G.done[i], fail: !!G.fail[i], count, left: null };
  });
  // 今の目標：済んでいない最初の段の目標（無ければ大将）。残りの時は、今の目標になった時から数える
  const now = nowOf();
  if (now !== G.nowI) { G.nowI = now; G.nowT0 = G.endT ?? rt.t; }
  if (now >= 0 && G.goals[now].sec && !G.done[now] && !G.fail[now]) {
    const left = G.goals[now].sec - ((G.endT ?? rt.t) - G.nowT0);
    if (left <= 0 && !rt.over) { G.fail[now] = true; G.late[now] = true; rows[now].fail = true; }
    else rows[now].left = Math.max(0, left);
  }
  return { rows, now, stars: starsOf(rt, rows) };
}

const starsOf = (rt, rows) => Math.max(won(rt) ? 1 : 0, rows.filter((r) => r.done).length);

// 今の目標の相手と場所 { x, z, unit, label }（四分の一秒ごとに選び直す）
export function goalTarget(rt) {
  // 戦固有の道案内を地図と頭上の印で共有する。
  if (rt && !rt.over && rt.def.goalTargetOverride) return rt.def.goalTargetOverride(rt);
  const G = rt?._g5;
  if (!G || rt.over) return null;
  if (rt.t < G.tgAt && rt.t > G.tgAt - 0.3) return G.tg;
  G.tgAt = rt.t + 0.25; G.tg = null;
  const f = fiveGoals(rt);
  if (!f || f.now < 0) return null;
  const g = G.goals[f.now], text = f.rows[f.now].text;
  const me = rt.player.u.team;
  let unit = null, x = NaN, z = NaN;
  if (g.kind === 'boss') unit = bossUnit(rt, g.name);
  if (!unit && /討/.test(text)) unit = (rt.army?.units || []).find((o) => o.alive && !o.gone && o.team !== me && o.name && o.name.length >= 2 && text.includes(o.name)) || null;
  if (unit) { x = unit.pos.x; z = unit.pos.z; }
  // 目標の場所が決まっている時（門・口など）：その場所（g.place）
  if (!unit && g.place) { const p = g.place(rt); if (p) { x = p.x; z = p.z; } }
  if (!unit && !Number.isFinite(x) && g.groups) {
    let sx = 0, sz = 0, n = 0;
    for (const gr of g.groups(rt) || []) for (const o of gr?.units || []) if (o.alive && !o.gone) { sx += o.pos.x; sz += o.pos.z; n++; }
    if (n) { x = sx / n; z = sz / n; }
  }
  if (!Number.isFinite(x)) {
    let p = null;
    try { p = missionTarget(rt); } catch (e) { p = null; }
    // 金の▼一つで示す戦（def.goalSignOnly）は、持ち場に着いたら自分の頭上に▼を残さない（守る間の敵は赤い▼）
    if (p?.arrived && rt.def.goalSignOnly) return null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) { x = p.x; z = p.z; if (p.unit?.alive && p.unit.team !== me) unit = p.unit; }
  }
  let around = false;
  if (!Number.isFinite(x) && /本陣|旗本|馬廻|大将/.test(text)) {
    // 行き先の定めの無い時：本陣・旗本は敵の大将の周り
    const bg = G.goals.find((q) => q.kind === 'boss');
    const bu = bg ? bossUnit(rt, bg.name) : (rt.taisho?.b?.u?.alive ? rt.taisho.b.u : null);
    if (bu) { x = bu.pos.x; z = bu.pos.z; around = true; }
  }
  if (!Number.isFinite(x) && /先手|備|勢|組|兵|敵|勝/.test(text)) {
    // 敵の隊：自分にいちばん近い敵の固まり（近い八人の真ん中）
    const P = rt.player.u.pos, near = [];
    for (const o of rt.army?.units || []) {
      if (!o.alive || o.gone || o.team === me || o.civ || o.isStruct || o.noTarget || o.fleeing || o.team > 1) continue;
      const d = (o.pos.x - P.x) ** 2 + (o.pos.z - P.z) ** 2;
      if (near.length < 8) { near.push([d, o]); near.sort((a, c) => a[0] - c[0]); } else if (d < near[7][0]) { near[7] = [d, o]; near.sort((a, c) => a[0] - c[0]); }
    }
    if (near.length >= 3) { x = near.reduce((n, q) => n + q[1].pos.x, 0) / near.length; z = near.reduce((n, q) => n + q[1].pos.z, 0) / near.length; }
  }
  if (!Number.isFinite(x)) return null;
  const action = g.action || (/火|焼/.test(text) ? '印へ進め' : /門|木戸/.test(text) ? '門へ進め' :
    /討|退け|崩|押し返|たお|倒/.test(text) ? '敵をたおせ' : /守/.test(text) ? 'ここを守れ' :
    /集ま|待/.test(text) ? '味方の旗へ進め' : '印へ進め');
  G.tg = { x, z, action, unit: around ? null : unit, label: unit?.name && !around ? '' : g.noun ?? goalNoun(text), boss: g.kind === 'boss' };
  return G.tg;
}

// battle.js の onKill から：自分で討った名のある者・討たれた大将を覚える
export function goalsKill(rt, v, k) {
  const G = rt?._g5;
  if (!G || !v?.name) return;
  if (k?.isPlayer) G.own.add(v.name);
  G.dead.add(v.name);
}

// 戦の後の結果の札（screens.js）へ：5つの目標と星の数
export function goalsResult(rt) {
  const f = fiveGoals(rt);
  if (!f) return null;
  return { rows: f.rows.map((r) => ({ t: r.text, on: r.done })), stars: f.stars };
}
