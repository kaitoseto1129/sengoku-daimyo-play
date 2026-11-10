// 全戦の「目標5つ」（kaito 11/2 Q「目標がどんどん変わりすぎ。5つ全部を最初から出し、済んだ物にチェック。達成した数で星1〜5。
//   大将を自分で討たずに終わったら星が下がる」・O「倒す数を出す」）。
//   目標は戦の始めに一度だけ決め、戦の間は並びを変えない。済んだ物は戻さない。果たせなくなった物（大将を味方が討った・時が過ぎた）は fail。
//   並べ方（どの戦も同じ）：戦の段（stages.js）の一行 → 敵の大将を自分で討つ → 時のうちに勝つ → 敵を何人討つ → 深手を負わずに勝つ、で5つまで埋める。
//   段が多い戦は後ろの段（勝ちにつながる段）を残す。稲生だけは段の中の目標から5つを選ぶ（B 節の作り）。
//   目当て（target）：今の目標の相手と場所。右上の地図のひし形・地面の矢印・頭上の名前（goal_sign.js）が同じ物を指す。
import { STAGES, stageNow, KILLS } from './stages.js';
import { missionTarget } from './mission_pin_target.js';
import { goalCountText } from './goal_count.js';
import { HIST_OUTCOME } from './battle_outcome.js';
import * as IG from './b_inou_goals.js';
import { GOALS15 as OG15 } from './okehazama/goals.js';
import { GOALS15 as MG15 } from './moribe/goals.js';
import { GOALS15 as SG15 } from './sunomata/goals.js';
import { sunomataNorthStopped, sunomataPincerDone, sunomataBossStopped } from './sunomata_goals.js';

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

// 段の目標は段の進みで済ませる。勝ちの印（tracker.main）は戦が締まってから見る（途中で立った勝ちの印で全部に ✓ を付けない。11/5 小谷）
//   数は段の進みと同じ数え方（stages.js の KILLS・寄せ）を先に使う。目標の字に合う組の数で数えると、前の段で減った同じ名の組の「28／29」が出て、
//   百五十秒動かずに止まって見えた（11/8 夜 天王寺・岡山の通し）。段の数が無い時だけ、字に合う組で数える（下の foeCount）
function stageGoal(k, text) {
  return { kind: 'stage', k, text, stageCount: true, count: (rt) => { const s = stageNow(rt); return s && s.i === k ? s.count || null : null; }, check: (rt) => (rt.over && won(rt)) || (stageNow(rt)?.i ?? 0) > k };
}
// まだ済んでいない段の数（最後の段を除く）。0 なら勝ちに締めてよい（kaito 十1「全部果たすまで勝ちにしない」・どの戦も）。
//   段の定義（stages.js）のある戦は、最後の段に入っている事。無い戦は def.goals5 の段の目標（最後を除く）が済んでいる事。
//   勝ちの印（tracker.main）は見ず、段の進みだけで決める。
export function stagesLeft(rt) {
  if (!rt || rt.def?.town || rt.def?.dojo) return 0;
  const list = STAGES[rt.def?.key];
  if (list) { const s = stageNow(rt); return s ? Math.max(0, list.length - 1 - s.i) : 0; }
  const G = rt.def?.goals5 && ensure(rt);
  if (!G) return 0;
  const idx = G.goals.map((g, i) => (g.kind === 'stage' ? i : -1)).filter((i) => i >= 0);
  idx.pop();
  let n = 0;
  for (const i of idx) {
    if (G.done[i] || G.pass[i]) continue;
    let ok = false;
    try { ok = !!G.goals[i].check(rt); } catch (e) { ok = false; }
    if (!ok) n++;
  }
  return n;
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
//   11/6 共通の係：kaito の物差し（五1 画面の字は名前・人数・目標・命と疲れだけ／十一1 分からない目標を勝手に失敗にしない／十二3 何もしないうちに負けにしない）で、
//   全戦に掛けていた既定の時（段200秒・主420秒・大将300秒）はやめた。戦が自分で sec を書いた目標だけ時を持つ（右上に時計は出さない）
const SEC = {};
const withSec = (g) => (SEC[g.kind] && !g.sec ? { ...g, sec: SEC[g.kind] } : g);
const flag = (k) => (rt) => !!rt.flags?.[k];

// 稲生（B 節）：先手 → 弓組 → 二の備 → 美作守 → 時のうち。崩す備は倒した数を出す
const OWN = {
  // 姉川の全段（stages.js と同じ字）。物見や押し合いを続けても、
  // 見えない時間制限だけで目標に失敗の印を付けない。
  anegawa: () => (STAGES.anegawa || []).map((s, k) => stageGoal(k, s[0])),
  inou: () => [
    // 11/10 docs/ino_spec_1109.md：右上は今の段の一行だけ。済みは段が進んだ時
    ...IG.INO_STEPS.map((k, i) => ({ kind: 'stage', k: i, text: IG.INO_GOALS[k], check: (rt) => !!rt.flags.result || IG.inouStep(rt) > i })),
  ].map((g) => ({ ...g, sec: 1e6 })),
  // 森部（11/3 p100_moribe・docs/battle_refs/moribe.md）：楡俣川を渡る → 北岸で先手 → 森部の野で両将の槍列 → 両将の一人を自分で討つ → 墨俣への道で殿。
  //   どれも場所と行い。敵を何人討つ・「崩す」は使わない（標準 三-1・11/4 moribe）
  moribe: () => {
    const F = (rt) => rt.flags;
    return [
      { kind: 'stage', k: 0, text: MG15.kishi, noun: '南岸の柳の陰', check: (rt) => !!F(rt).m15?.kishiDone || !!F(rt).signal },   // 11/8 十五分の構成（prototype/src/moribe/）
      { kind: 'stage', k: 0, text: '楡俣川を渡り、向こう岸へ上がる', noun: '向こう岸', check: (rt) => !!F(rt).pointReached || !!F(rt).signal },
      { kind: 'stage', k: 1, text: '楡俣川の北岸の畦で斎藤の先手を押し返す', noun: '川岸の敵', check: (rt) => !!F(rt).vBroken || F(rt).stage === 'hold' || F(rt).stage === 'press', groups: (rt) => [F(rt).V] },
      { kind: 'stage', k: 1, text: MG15.aze, noun: '斎藤の物頭', check: (rt) => !!F(rt).m15?.azeDone || F(rt).stage === 'hold' || F(rt).stage === 'press' },
      { kind: 'stage', k: 1, text: MG15.yumi, noun: '弓・鉄砲衆', check: (rt) => !!F(rt).m15?.yumiDone || F(rt).stage === 'press' },
      { kind: 'stage', k: 1, text: '森部の野で敵の槍の列を止める', noun: '敵の槍の列', check: (rt) => F(rt).stage === 'press',
        groups: (rt) => [F(rt).M, F(rt).N, ...(F(rt).reserves || [])] },
      // 11/6 fixc：公記の討ち手は長井＝服部平左衛門・日比野＝恒河久蔵。名の無い足軽の自分が両将を討つのは史料に合わない。
      //   自分の手柄は両将の旗本の侍を討つ事にし、果たすまで勝ちにしない（b_moribe.js）。
      { kind: 'stage', k: 2, text: '長井・日比野の旗本へ進み、旗本の侍を自分で討つ', noun: '旗を守る侍', check: (rt) => !!F(rt).ownHatamoto,
        groups: (rt) => [F(rt).HM, F(rt).HN] },
      { kind: 'stage', k: 2, text: '墨俣への道で両将の殿を討ち破る', noun: '退く敵', check: (rt) => won(rt), groups: (rt) => F(rt).shingari || [] },
    // 数や時計は添えず、告げていない期限で目標を失敗にしない。退却は戦側の下知で決める。
    ].map((g) => ({ ...g, count: () => null }));
  },
  // 八王子城（11/4 p100）：大手 → 曳橋で打って出た敵を迎え撃つ → 付け入り → 尾根の三つの曲輪 → 本丸の中山勘解由。人数を討つ目標は置かない
  t11_hachioji: (rt) => {
    // 11/8 15分の構成：段の番は戦の側の名の表（b_t11_hachioji.js の dpIx）から引く
    const X = rt.def.dpIx || {};
    const dpi = (r) => (r.flags.dp ? (r.flags.dp.on ? r.flags.dp.i : 99) : -1);
    const cur = (k) => (r) => (dpi(r) === k ? r.flags.dp.cur?.groups || [] : []);
    return [
      { kind: 'stage', k: 0, text: '霧の谷を進み、山下曲輪の木戸の前へ', noun: '大手の木戸', check: (r) => won(r) || dpi(r) >= X.ote, groups: cur(X.sanroku) },
      { kind: 'stage', k: 1, text: '山下曲輪で近藤出羽守の組を討つ', check: (r) => won(r) || dpi(r) >= X.bridge, count: (r) => STAGES.t11_hachioji[1][3](r) },
      { kind: 'stage', k: 2, text: '曳橋で打って出た北条勢を迎え撃つ', noun: '打って出た敵', check: (r) => won(r) || !!r.flags.sallyBack, groups: (r) => (r.flags.sallyG && !r.flags.sallyBack ? [r.flags.sallyG] : []) },
      { kind: 'stage', k: 3, text: '退く敵に続き、冠木門から御主殿へ攻め入る', noun: '冠木門', check: (r) => won(r) || dpi(r) >= X.sakamichi },
      { kind: 'stage', k: 4, text: '尾根の急な坂を、金子丸の下まで登る', noun: '尾根の坂', check: (r) => won(r) || dpi(r) >= X.kaneko, groups: cur(X.sakamichi) },
      { kind: 'stage', k: 5, text: '金子丸・高丸・小宮曲輪を落とす', check: (r) => won(r) || dpi(r) >= X.hon, count: () => null },
      // この戦は本人の止めが条件。共通の「他の者が討っても達成」を引き継がない。
      { ...bossGoal('中山勘解由'), k: 6, text: '本丸で中山勘解由を自分で討つ', check: (r) => !!r._g5?.own.has('中山勘解由'), fail: (r) => !!r.over && !r._g5?.own.has('中山勘解由') },
      { kind: 'stage', k: 7, text: '本丸の奥で、最後まで残る城兵を討つ', noun: '本丸の奥', check: won, groups: cur(X.rakujo) },
    ];
  },
  // 桶狭間（11/4 jin）：史実の順（中島砦を出て谷の出口へ → 雨の後に坂道の守り → 幕の前の旗本 → 幕の入口 → 退く義元を毛利が討つ）。
  //   首を取ったのは毛利新介なので「自分で討つ」は置かない。敵を何人討つは使わない（AW3）
  // 墨俣（11/4 jin・docs/battle_refs/sunomata.md）：伝承の順（北の口の先手 → 西の柵の二の手 → 三の手の北の旗印 →
  //   伏兵が西の外へ出て最後の寄せを挟み、退ける）。運搬の護衛を含め五つ。敵を何人討つは置かない
  sunomata: () => {
    const F = (rt) => rt.flags;
    return [
      { kind: 'stage', k: 0, text: SG15.hakobi, noun: '岸の舟着き', check: (rt) => !!F(rt).s15?.hakobiDone },   // 材木護衛の実際の完了で判定する。
      { kind: 'stage', k: 0, text: '北の柵の口で斎藤の先手を止める', noun: '北の柵の口', check: (rt) => won(rt) || (F(rt).wave || 0) >= 2 },
      { kind: 'stage', k: 1, text: '西の柵で斎藤の二の手を止める', noun: '西の柵', check: (rt) => won(rt) || (F(rt).wave || 0) >= 3 },
      { kind: 'stage', k: 2, text: '北の柵で三の手の旗印を止める', noun: '三の手の旗印', check: (rt) => sunomataNorthStopped(F(rt)) },
      { kind: 'stage', k: 3, text: '伏兵と西の柵の外で寄せ大将の最後の攻撃を退ける', noun: '西の柵の外', check: (rt) => sunomataPincerDone(F(rt)) && sunomataBossStopped(F(rt)) },
    ];   // 目標に期限はない。寄せ手を実際に止めるまで進行を待つ。
  },
  // 11/6 kaito 十1：右上の①〜⑤（b_okehazama.js の missions）と同じ言葉・同じ順にそろえた。
  okehazama: () => [
    { kind: 'stage', k: 0, text: '中島砦の下で組に合流し、雨の谷を下り谷の出口へ', noun: '組の旗', check: (rt) => won(rt) || rt.phase === 'wait' || rt.phase === 'assault' },
    { kind: 'stage', k: 0, text: OG15.zenei, noun: '今川の鉄砲衆', check: (rt) => !!rt.flags.o15?.zeneiDone },   // 11/8 十五分の構成
    { kind: 'stage', k: 0, text: '谷の出口の豪雨の中で、かかれの下知を待つ', noun: '組の旗', check: (rt) => won(rt) || rt.phase === 'assault' },
    { kind: 'stage', k: 1, text: '坂道で松井宗信の備えを破る', noun: '松井宗信の備え', check: (rt) => won(rt) || !!rt.flags.entered || (rt.flags.roadStep ?? -1) >= (rt.flags.road?.length ?? 3), groups: (rt) => rt.flags.road },
    { kind: 'stage', k: 1, text: OG15.nida, noun: '今川の前の備え', check: (rt) => !!rt.flags.o15?.nidaDone },
    { kind: 'stage', k: 1, text: OG15.ii, noun: '井伊直盛の備え', check: (rt) => !!rt.flags.o15?.iiDone },
    { kind: 'stage', k: 1, text: OG15.saka, noun: '旗本の弓組', check: (rt) => !!rt.flags.o15?.sakaDone },
    { kind: 'stage', k: 2, text: '桶狭間山の幕の前で旗本を破る', noun: '義元の旗本', check: (rt) => won(rt) || !!rt.flags.guardOpened },
    { kind: 'stage', k: 2, text: '幕の口から今川義元を討つ', noun: '今川義元', check: (rt) => won(rt) || !!rt.flags.victory },
    // 11/6 critic60：討った後に来た道を帰る流れが無かった（公記「来た道を帰った」・二4）
    { kind: 'stage', k: 2, text: '首を持ち、谷の出口の組の旗へ引き揚げる', noun: '組の旗', check: (rt) => !!rt.flags.returnDone },
  ],
  // 志賀の陣・宇佐山城（11/4 jin_shiga_r・docs/battle_refs/shiga.md）：『信長公記』の順（十六日 町口の足軽合戦で小勝ち → 十九日 浅井・朝倉が両手から寄せ、
  //   可成・信治・青地が討死 → 坂道を宇佐山城へ退く → 端城を焼かれ、木戸を一つずつ守る → 二十四日 信長の後詰）。敵を何人討つ・自分で討つは置かない（AW3）
  shiga: () => {
    const F = (rt) => rt.flags, st = (rt) => F(rt).step || 0;
    return [
      // 11/8 夜：15分の構成の始まりの段（shiga/monomi.js）
      { kind: 'stage', k: 0, text: '北の湖の道の辻で、下って来る浅井・朝倉の旗を見る', noun: '湖の道の辻', action: '辻で敵の旗を見よ', check: (rt) => won(rt) || st(rt) >= 1 || (F(rt).shigaMonomi?.k || 0) >= 1 },
      { kind: 'stage', k: 0, text: '坂本の町口で浅井・朝倉の先手を押し返す', noun: '町口', action: '町口で先手を防げ', check: (rt) => won(rt) || st(rt) >= 1.25 },
      { kind: 'stage', k: 0, text: '両手から寄せる大軍を、町口で森可成と支える', noun: '町口', action: '森隊の列で支えよ', check: (rt) => won(rt) || st(rt) >= 2 },
      { kind: 'stage', k: 1, text: '坂道を上り、宇佐山城の大手木戸へ退く', noun: '大手木戸', action: '木戸へ退け', check: (rt) => won(rt) || st(rt) >= 3 },
      { kind: 'stage', k: 2, text: '二の丸・本丸の木戸で寄せ手を防ぐ', noun: '本丸の木戸', action: '木戸で防げ', check: (rt) => (F(rt).innerHeld || 0) >= 10 && (won(rt) || st(rt) >= 3.5) }, // 11/8：木戸で守らずに印を付けない
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
  //   盛信は主殿で果てる（自分で討つ目標にしない）
  takato: () => [
    // 11/6 fix61（九1・十1）：右上に①〜⑥を最初から全部並べる。字は b_takato.js の TK_STAGE_TEXT と同じ（途中で言い替えない）。
    //   段は takatoStageText が戻さずに進める F.tkStage で数える。「敵を何人討つ」は使わない（三1）
    { kind: 'stage', k: 0, text: '東の大手道を進み、大手門へ寄せよ', noun: '大手門', check: (rt) => won(rt) || (rt.flags.tkStage || 0) >= 1 },
    { kind: 'stage', k: 0, text: '大手門の前で、打って出た城兵を受けよ', noun: '大手門', check: (rt) => won(rt) || (rt.flags.tkStage || 0) >= 2 || !!rt.flags.sanFell },
    { kind: 'stage', k: 0, text: '退く城兵に続き、大手門から三の丸へ入れ', noun: '大手門', check: (rt) => won(rt) || !!rt.flags.sanFell },
    { kind: 'stage', k: 1, text: '二の丸の土橋を渡り、二の丸の門から入れ', noun: '二の丸の土橋', check: (rt) => won(rt) || !!rt.flags.niFell },
    { kind: 'stage', k: 2, text: '本丸門を破り、主殿の奥の間へ進め', noun: '本丸門', check: (rt) => won(rt) || (rt.flags.tkStage || 0) >= 5 },
    { kind: 'stage', k: 2, text: '本丸の旗の下に集まり、味方と旗を守れ', noun: '本丸の旗', check: won },
  ],
  // 三木・大村（11/3 p100_miki・11/4 jin）：夜の荷駄 → 平田の木戸で打って出た城兵 → 大村坂（史実の順）。
  //   どれも場所と行い（「崩す」「何人討つ」は使わない）。長治は城の本丸で囲まれたまま（翌年に自害）なので目標にしない。
  //   行き先は固定（rt.def.mikiAt：大村道の西・平田の木戸・大村坂）
  miki: () => {
    // 11/6 fixc1901_miki：①荷駄の護衛 → ②木戸の城兵（谷大膳の討死）→ ③大村坂の下で秀吉の手と並ぶ → ④三太夫の勢 → ⑤甚太夫（大村で討たれた）。
    //   右上の一行（b_miki の GOAL_LINES）と同じ字。全部果たすまで勝ちにしない
    const F = (rt) => rt.flags, at = (k) => (rt) => rt.def.mikiAt?.[k] || null, L = rt0 => rt0.def.missions;
    const foeOf = (rt) => (F(rt).reserve?.units || []).filter((u) => u.name !== '別所甚太夫' && (!rt.def.omuraFoe || rt.def.omuraFoe(u)));
    const defeated = (rt, u) => rt.def.omuraDefeated(u);
    return [
      { kind: 'stage', k: 0, text: '大村道で、毛利の荷駄の護衛を討つ', textOf: (rt) => L(rt)[0], noun: '荷駄の護衛', place: at('escort'), check: (rt) => won(rt) || !!F(rt).dropped || (F(rt).step || 0) >= 2,
        groups: (rt) => [F(rt).escort].filter(Boolean) },
      { kind: 'stage', k: 1, text: '平田の木戸で、城から出た別所勢を止める', textOf: (rt) => L(rt)[1], noun: '平田の木戸', place: at('gate'), check: (rt) => won(rt) || (F(rt).step || 0) >= 2,
        groups: (rt) => F(rt).sallies || [] },
      { kind: 'stage', k: 2, text: '大村坂の下で、駆けつけた秀吉の手と並ぶ', textOf: (rt) => L(rt)[2], noun: '大村坂の下', place: at('foot'), check: (rt) => won(rt) || !!F(rt).omuraGo },
      { kind: 'stage', k: 2, text: '大村坂で、別所三太夫の勢を討つ', textOf: (rt) => L(rt)[3], noun: '別所三太夫の勢', place: at('omura'), check: (rt) => won(rt) || (!!F(rt).omuraGo && foeOf(rt).every((u) => defeated(rt, u))),
        count: (rt) => { const us = foeOf(rt); return us.length ? [us.filter((u) => defeated(rt, u)).length, us.length] : null; } },
      { ...bossGoal('別所甚太夫'), k: 2, textOf: (rt) => L(rt)[4], place: at('omura'), check: (rt) => !!F(rt).jintTaken },
    ];
  },
  // 設楽原（11/6 fixc1721）：右上の四つ（b_shitaragahara.js の NF_TEXT と同じ字）。史実の順（夜明けの真田 → 内藤 → 未の刻の崩れ → 馬場の殿）。
  //   勝頼は後方の才ノ神から退き、史実どおり討てない（総大将を目標にしない）。敵を何人討つは使わない。時が切れても果たした事にしない
  shitaragahara: () => {
    const N = (rt) => rt.flags.nf || { step: 0, done: [] };
    const broken = (k) => (rt) => { const g = rt.flags.waveGroups?.[k]; if (!g) return null; const all = g.units.length + g.cavalry.units.length; return [all - aliveIn([g, g.cavalry]), all]; };
    return [
      // 11/8 15分の構成（shitaragahara/*.js）：導入の誘い出し・土屋の柵破り・原の寄せを足す
      { kind: 'stage', k: 0, text: '大宮前の柵の外で武田の物見を誘い、柵へ引く', noun: '武田の物見', check: (rt) => !!rt.flags.nf?.t0 },
      { kind: 'stage', k: 0, text: '大宮前の柵で真田隊を止める', noun: '大宮前の柵', check: (rt) => !!N(rt).done[0], count: broken(0) },
      { kind: 'stage', k: 0, text: '大宮前と柳田前の間の破れ目で山県昌景の赤備えを討つ', noun: '柵の破れ目', check: (rt) => !!N(rt).breachDone },
      { kind: 'stage', k: 0, text: '柳田前の柵へ移り、原・内藤隊を止め、破れ目の土屋隊を討つ', noun: '柳田前の柵', check: (rt) => !!N(rt).done[1], count: broken(1) },
      { kind: 'stage', k: 1, text: '柳田前の虎口を出て、連吾川を渡る', noun: '連吾川', check: (rt) => !!N(rt).done[2] },
      { kind: 'stage', k: 1, text: '退き口で馬場信春の殿を討ち破る', noun: '馬場信春の殿', check: (rt) => !!N(rt).done[3], groups: (rt) => [rt.flags.rear] },
    ].map((g) => ({ ...g, sec: 99999 }));   // 目標ごとの時切れの ✕ は付けない（時計の字は b_shitaragahara の札で隠す）
  },
  // 山中城（11/3 p100_t09_yamanaka）：出丸→障子堀→馬出しの迎え撃ち→付け入り→本丸。人数を数えるのは出丸の一つだけ
  t09_yamanaka: () => [
    { kind: 'stage', k: 0, text: '出丸の柵を破り、間宮康俊を討って手勢二百の隊を崩す', noun: '間宮康俊の隊', check: (rt) => won(rt) || (rt.flags.step || 0) >= 2,
      // 本物の兵を二百体増やさず、出丸の手勢二百を代表する隊の損耗を示す。
      count: (rt) => KILLS.t09_yamanaka?.(rt) || null,
      groups: (rt) => (rt.flags.dai ? [rt.flags.dai] : []) },
    { kind: 'stage', k: 1, text: '障子堀を畝の上で渡る', noun: '障子堀', check: (rt) => won(rt) || (rt.flags.step || 0) >= 3 },
    { kind: 'stage', k: 2, text: '馬出しから出た北条の隊を迎え撃つ', noun: '馬出しの北条の隊', count: () => null, groups: (rt) => (rt.flags.uma && rt.flags.sub === 'sally' ? [rt.flags.uma] : []), check: (rt) => won(rt) || rt.flags.sub === 'back' || (rt.flags.step || 0) >= 4 },
    { kind: 'stage', k: 3, text: '退く兵に続いて大手門から入る', noun: '大手門', check: (rt) => won(rt) || (rt.flags.step || 0) >= 4 },
    { kind: 'stage', k: 4, text: '本丸へ上り、松田康長の旗本を討ち取る', noun: '松田康長の旗本', count: () => null, groups: (rt) => (rt.flags.hon ? [rt.flags.hon] : []), check: won },
  ],
  // 峠口を一城で終わらせず、本道と東西の別手が四城を押さえる。
  echizen: () => {
    // 勝ちの条件と同じく、前郭・副郭に残敵がいれば城全体の達成にしない。
    const held = (...ids) => (rt) => ids.every(id => {
      const zone = rt.flags.SZ?.byId[id];
      return !!zone && zone.owner === 'friend' && zone.enemies === 0;
    });
    // 奥の本郭へ飛ばさず、手前から未制圧の郭と残る守兵を案内する。
    const court = (...ids) => (rt) => {
      const zones = rt.flags.SZ?.byId;
      const id = ids.find(id => zones?.[id]?.owner !== 'friend' || zones[id].enemies > 0) || ids[ids.length - 1];
      return zones?.[id]?.pos;
    };
    return [
      { kind: 'stage', k: 0, text: '観音丸の木戸を抜け、郭の守兵を討つ', noun: '観音丸', check: held('kannon'), place: court('kannon') },
      { kind: 'stage', k: 1, text: '本道を登り、木ノ芽峠城の主郭を押さえる', noun: '木ノ芽峠城', check: held('kinome_sou', 'kinome_fuku', 'kinome_hon'), place: court('kinome_sou', 'kinome_fuku', 'kinome_hon') },
      { kind: 'stage', k: 2, text: '東の別手と西光寺丸城を押さえる', noun: '西光寺丸城', check: held('saikoji_mae', 'saikoji_hon'), place: court('saikoji_mae', 'saikoji_hon') },
      { kind: 'stage', k: 3, text: '西の別手と鉢伏城を押さえる', noun: '鉢伏城', check: held('hachibuse_mae', 'hachibuse_hon'), place: court('hachibuse_mae', 'hachibuse_hon') },
      { kind: 'stage', k: 4, text: '峠道の西光寺真敬を討ち、残る一揆勢を追って崩す', noun: '峠道の一揆勢', check: won, place: (rt) => rt.flags.echFuchu?.pos || rt.flags.echTail?.center() },
    ];
  },
};

// 小田原征伐：現在の段構成に合わせ、実行しない夜討ちの目標を並べない。
OWN.t12_odawara = () => {
  const ix = (k, rt) => typeof k === 'number' ? k : rt.flags.dpIx?.[k] ?? Infinity;
  const at = (k) => (rt) => won(rt) || (rt.flags.dp?.i ?? -1) > ix(k, rt);
  const foes = (k) => (rt) => rt.flags.dp?.i === ix(k, rt) ? rt.flags.dp.cur?.groups || [] : [];
  return [
    { kind: 'stage', k: 0, text: '井伊の陣から、家康の本陣へ下知を受けに行く', noun: '家康の本陣', check: at('jinmawari') },
    { kind: 'stage', k: 1, text: '山王川を渡り、総構えの堀の前で北条方の防御線を確かめる', noun: '総構えの堀', check: at(1) },
    { kind: 'stage', k: 2, text: '木戸から打って出た北条勢を、堀の前で押し返す', noun: '篠曲輪の木戸', check: at(2), groups: foes(2) },
    { kind: 'stage', k: 3, text: '前衛を退かせ、山王川の東の岸まで退く', noun: '山王川の岸', check: at(3) },
    { kind: 'stage', k: 4, text: '関東の絵図で支城陥落の報を確かめる', check: at('shijo') },
    { kind: 'stage', k: 5, text: '前田の陣・北条氏規・上杉の陣・浜の船陣を訪ね、直政の言葉を伝える', noun: '前田の陣', check: at('junkai') },
    { kind: 'stage', k: 6, text: '石垣山の普請場で、北条の物見を退けて普請を守る', noun: '石垣山の普請場', check: at('ishigaki'), groups: foes('ishigaki') },
    { kind: 'stage', k: 7, text: '井伊の陣から南西の石垣山に現れた城を見る', noun: '石垣山', check: at('ichiya') },
    { kind: 'stage', k: 8, text: '北条の評定で和睦へ向かう成り行きを聞く', check: at('hyojo') },
    { kind: 'stage', k: 9, text: '官兵衛に付き添い、本丸の門まで送り届ける', noun: '本丸の門', check: at(11) },
    { kind: 'stage', k: 10, text: '本丸の門の前で、槍を置いて城を出る北条の兵を見届ける', noun: '本丸の門の前', check: won },
  ];
};

// 忍城攻め（11/10 docs/oshi_spec_1109.md）：力攻め → 退く → 堤の普請 → 堰 → 舟から堤を守る → 決壊して丸墓山へ → 切れ口の普請 → 開城。敵を何人討つは使わない
OWN.t10_oshi = (rt) => {
  // 11/8 15分の構成：段の字は b_t10_oshi.js の MISSIONS（step − 1 が並びの番）。最後の段は勝ちで済む
  const M = rt.def.missions || [];
  const N = ['城の外の柵', '丸墓山', '浅瀬の口', '堰', '堤の岸', '丸墓山', '堤の切れ口', '佐間口'];
  return M.map((text, k) => ({ kind: 'stage', k, text, noun: N[k] || '',
    // 避難は、段を進める時と同じ人数を出す。
    count: k === 5 ? (r) => r.flags.step === k + 1 ? KILLS.t10_oshi(r) : null : undefined,
    check: k === M.length - 1 ? won : (r) => won(r) || (r.flags.step ?? 0) > k + 1 }));
};

// 小谷城（11/5 fix1_odani）：長政は本丸から赤尾屋敷へ退いて自害した（信長公記）。討てない大将を「自分で討つ」に、
//   数を討つ目標にもしない。清水谷 → 大野木屋敷 → 京極丸 → 小丸 → 本丸の順に、史実の流れだけで5つ。
OWN.odani = () => {
  // 11/6 fix61（kaito 十1）：地図で分かる場所の名と行い。字は b_odani.js の ODANI_GOALS と同じ。目標ごとの時切れの ✕ は付けない
  //   （夜の谷登りは三分を越える事があり、果たしたのに ✕ が付いた）。
  const T = ['清水谷を登り、登り口の番兵を退ける', '大野木屋敷の南木戸から庭を奪う', '西木戸を破り、京極丸を奪って守る', '尾根を北へ、小丸の久政を攻める', '尾根を南へ、本丸の長政の旗本を破る'];
  const at = [(rt) => (rt.flags.step || 0) >= 2, (rt) => !!rt.flags.onoDone, (rt) => !!rt.flags.komaAttack, (rt) => !!rt.flags.komaDown, (rt) => !!rt.flags.fallen];
  const N = ['登り口', '大野木屋敷', '京極丸', '小丸', '本丸'];
  return T.map((text, k) => ({ kind: 'stage', k, text, noun: N[k], check: (rt) => won(rt) || at[k](rt), sec: 1e6 }));
};

// 野田・福島（11/6 作り直し・kaito BS）：城の中へ突撃せず、井楼から撃ち込む大鉄砲の戦。三好長逸は砦に籠もったまま討たれない（信長公記）。
//   右上の六つは b_nodafukushima.js の NODA_STAGE_TEXT・stages.js と同じ字。始めから全部並べる。
OWN.nodafukushima = (rt0) => {
  // 11/8 夜：15分の構成（葦の水路・竹束の鉄砲戦・江口の渡しを挟んだ十）。字と番号は b_nodafukushima.js の missions
  const list = rt0.def.missions || [];
  const nouns = ['葦の水路', '三好の鉄砲', '前田利家', '西の井楼', '福島砦の塀の内', '浅瀬の岸', '竹束の列', '春日井堤', '信長の本陣', '江口の渡し'];
  const at = (rt) => rt.def.missionOf?.(rt) ?? 0;
  // 梯子や三発の射撃は本人の操作を待つ。四百秒で未達の目標を失敗扱いにしない。
  return list.map((text, k) => ({ kind: 'stage', k, text, textOf: (rt) => rt.def.missionText?.(rt, k) || text, noun: nouns[k] || '', check: k === list.length - 1 ? won : (rt) => won(rt) || at(rt) > k, sec: 1e6 }));
};

function build(rt) {
  const key = rt.def.key;
  if (OWN[key]) return OWN[key](rt).map(withSec);
  // 戦の定義が自分の5つを持つ時（def.goals5。山崎など）
  // 目標はいくつでもよい。画面には今の5つだけ出す（hud_goals.js。kaito 十三1）
  if (typeof rt.def.goals5 === 'function') return rt.def.goals5(rt).map(withSec);
  const list = STAGES[key];
  // def.stageGoalsOnly：段だけを目標にする（「敵を何人討つ」「深手を負わずに勝つ」で埋めない。kaito AW の3）
  if (rt.def.stageGoalsOnly && list) return list.map((s, k) => stageGoal(k, s[0])).map(withSec);
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
  // 段は全部並べる（史実の順。kaito 十三1「目標はいくつでもよい」）。足りない時だけ討つ数などで5つまで埋める
  const goals = [];
  for (const s of stages) goals.push(s.boss ? { ...bossGoal(boss), k: s.k, text: s.text } : stageGoal(s.k, s.text));
  if (!list) goals.push({ kind: 'main', text: '', check: won, textOf: (rt) => mainText(rt) });
  // 歴史で負ける戦は、星を討ち取りの数でなく任務（守る・救う・退く）だけで数える（battle_outcome.js・kaito 11/8）
  if (HIST_OUTCOME[key]) return (goals.length ? goals : [{ kind: 'main', text: '', check: won, textOf: (rt) => mainText(rt) }]).map(withSec);
  if (boss && !bossIn) goals.push(bossGoal(boss));
  if (goals.length < 5) goals.push(killGoal(KILL_N));
  if (goals.length < 5) goals.push(hurtGoal());
  if (goals.length < 5) goals.push(killGoal(KILL_N * 2));
  return goals.map(withSec);
}

// 段の無い戦（豊臣編・徳川編など）の一つ目：その戦の主の任務の一行
function mainText(rt) {
  const o = (rt.objectives || []).find((x) => x && x.kind === 'main' && x.text);
  // 全戦で、長さだけを理由に場所や行いを消さない。
  const t = String(o?.text || rt.def.goal || '').split(/[。（(]/)[0].trim();
  return t || '戦に勝つ';
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
// 出陣の札の「この戦の目的」に、右上の①と同じ言い方を出す（critic60 小田原 10「札の目的と右上の①〜⑥が全く違う」）。表の無い戦は空
export function firstGoalText(id) {
  try { const L = OWN[id]?.(null); const g = L && L.find((x) => x && typeof x.text === 'string'); return g ? g.text : ''; } catch (e) { return ''; }
}

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
    return { text: g.textOf ? g.textOf(rt) : g.text, kind: g.kind, done: !!G.done[i], fail: !!G.fail[i], count, countUnit: g.countUnit, left: null };
  });
  // 今の目標：済んでいない最初の段の目標（無ければ大将）。残りの時は、今の目標になった時から数える
  const now = nowOf();
  // 「〇〇を破れ」「〇〇を止めよ」のように敵を相手にする今の目標は、何人中何人を倒したかを出す（十八の2・BZ。全戦）。
  //   戦が数を決めていない（count も groups も無い）時だけ：段の流れ（b_depth.js）の寄せた敵、無ければ目標の字に合う敵の組の数
  if (now >= 0 && rows[now].count == null && !rows[now].done) {
    const g = G.goals[now];
    if ((!g.count || g.stageCount) && !g.groups && g.kind === 'stage' && FOE_VERB.test(rows[now].text)) rows[now].count = foeCount(rt, rows[now].text);
  }
  // 11/9 kaito（遊んだ声 7）：「何人中」の分母は決めたら増やさない。最初に出た数を覚え、増えても分子を分母までに収める
  {
    const L = G.lockDen || (G.lockDen = {});
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i].count;
      if (!Array.isArray(c) || !(c[1] > 0)) continue;
      if (L[i] == null) L[i] = c[1];
      // 分子は分母の割合で縮める（そのまま収めると、新手で分母が増えた段が「あと0人」のまま止まって見えた・11/9 天王寺岡山の①）
      else if (c[1] > L[i]) rows[i].count = [Math.min(L[i] - 1, Math.floor(c[0] * L[i] / c[1])), L[i]];
    }
  }
  if (now !== G.nowI) { G.nowI = now; G.nowT0 = G.endT ?? rt.t; }
  if (now >= 0 && G.goals[now].sec && !G.done[now] && !G.fail[now]) {
    const left = G.goals[now].sec - ((G.endT ?? rt.t) - G.nowT0);
    if (left <= 0 && !rt.over) { G.fail[now] = true; G.late[now] = true; rows[now].fail = true; }
    else rows[now].left = Math.max(0, left);
  }
  return { rows, now, stars: starsOf(rt, rows) };
}

const FOE_VERB = /破れ|破る|討て|討つ|倒せ|崩せ|止めよ|止める|退けよ|押し返|迎え撃|受け止め|蹴散ら|防げ/;
function foeCount(rt, text) {
  const C = rt.flags?.dp?.on && rt.flags.dp.cur;
  if (C && C.nTot > 0) { const left = aliveIn(C.groups); return [Math.max(0, C.nTot - left), C.nTot]; }
  const m = /(\d+)／(\d+)$/.exec(goalCountText(rt, text, true) || '');
  return m ? [+m[1], +m[2]] : null;
}

// 星は5つまで。目標が5つより多い戦は、果たした割合で5つに割る
const starsOf = (rt, rows) => Math.max(won(rt) ? 1 : 0, Math.min(5, Math.round(rows.filter((r) => r.done).length * 5 / Math.max(5, rows.length))));

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
