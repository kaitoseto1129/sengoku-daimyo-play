// 戦ごとの段階（kaito 10/30）：ミッション1→2→…→最後。右上の札には「今の段階の目的の一行」と「何段階目か」だけを出す（hud_cards.js）。
// 段階は戦の今の流れ（F.step・rt.phase・b_depth の段）から読む。戦の中身（行き先のピン・敵の寄せ）は各戦がそのまま持つので、
// 段階が変わればピンも旗もその段の場所へ移る。点（手柄）は右上に出さない（戦の後の画面だけ。merit.js）。
// at：その段に入った印。数＝F.step がそれ以上 ／ 'ph:名'＝rt.phase ／ 'dp:名'＝b_depth の今の段の phase ／ 関数。一度入った段からは戻らない。
// 最後の段を果たす（tracker.main が true）とミッション達成（手柄 20 点）。
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
const ph = (...names) => (rt) => names.includes(rt.phase);
const dp = (...names) => (rt) => names.includes(rt.flags.dp?.cur?.s?.phase);
const f = (k) => (rt) => !!rt.flags[k];

export const STAGES = {
  // 稲生（kaito 11/1 B 節）：練習 → 先手を崩す → 二の備を退ける → 林美作守を討つ。三つ目の欄は右上の「目標」の札に並べる目標（[字, 済んだか]）
  inou: [
    // 11/3 kaito の稲生の流れ（docs/battle_refs/inou_story.md）：柴田勢との乱戦を耐える → 信長の大音声で柴田勢が崩れる → 列を整えて林勢へ → 旗本を崩す → 美作守を討つ
    // 11/6 時代考証：「崩す」「土手」は使わない（kaito 三-1・史料に土手は無い）。右上の一行（missionHeading）と同じ言い方に
    ['練習', null, [['前の柴田の物見を倒せ', (rt) => (rt.flags.pk || 0) >= 3]]],
    ['列に並んで耐えろ', (rt) => (rt.flags.stage || 0) >= 1, [['列に並んで耐えろ', f('line1Broken'), (rt) => downTo(rt.flags.l1, rt.flags.l1N * 0.5, rt.flags.l1N)]]],
    ['田の道の前の林の兵を倒せ', (rt) => (rt.flags.stage || 0) >= 2, [['田の道の前の林の兵を倒せ', f('line2Broken'), (rt) => downTo(rt.flags.l2, rt.flags.l2N * 0.35, rt.flags.l2N)]]],
    ['田の道の林の旗本を倒せ', (rt) => (rt.flags.stage || 0) >= 3, [['田の道の林の旗本を倒せ', f('guardDown')]]],
    ['田の道の林美作守を倒せ', (rt) => (rt.flags.stage || 0) >= 4, [['田の道の林美作守を倒せ', f('ending')]], false],
  ],
  // kaito 11/2 T：義元を探せ → 本陣に迫れ → 義元を討て の三段（幕と大きな旗印は本陣の一か所だけ）
  // 11/3：段の名は場所と行いで言う（AQ1・AR1）。中島砦の先の谷 → 桶狭間山の坂道 → 今川本陣の幕
  okehazama: [['谷の出口で組の旗に集まる'], ['坂道で松井宗信の先手を破る', ph('assault')], ['今川義元を討つ', f('entered')]],
  moribe: [['楡俣川の浅瀬を渡り、北岸へ'], ['北岸の畦で斎藤の先手を押し返す', ph('contact', 'hold')], ['長井甲斐守・日比野下野守を討つ', ph('press')]],
  // 11/3 AR：場所と行いで書く（一の手は北の口・二の手は西の林の口・三の手は北と西と川の舟。docs/battle_refs/sunomata.md）
  sunomata: [['北の柵の口へ行き、人足を守る'], ['北の柵の口で斎藤の先手を止める', ph('w1')], ['西の柵で斎藤の二の手を止める', ph('w2')], ['北と西の柵を守り、寄せ大将を討つ', ph('w3')]],
  // 11/4 BG：場所と行いで書く。③は付け入り（逃げる城兵に続いて七曲りを登る。docs/battle_refs/inabayama.md）
  inabayama: [['井口の町で、印の家に火を放つ'], ['ふもとの鹿垣で、打って出た斎藤勢を退ける', s(2)], ['逃げる城兵に続き、七曲りを登って大手の木戸へ', s(3)], ['本丸の守りを退け、小屋に合図の火を放つ', s(4)]],
  // 11/4 夜：信長公記の順（申の刻に攻めかかる→日暮れに松明→木戸→打って出た兵に付け入る→夜半に本丸）。docs/battle_refs/mitsukuri.md
  mitsukuri: [['申の刻、矢の降る坂を登り、三の郭を取る'], ['日暮れ。三の郭の松明に火を移す', s(2.5)], ['松明を掲げ、二の丸の木戸へ詰める', s(2.8)],
    ['打って出た二の丸の兵を、坂の上で討つ', f('sally')], ['退く敵に続き、木戸から二の丸へ入る', f('sallyBack')], ['夜半、本丸の城兵を退け、旗を立てる', s(4)]],
  okawachi: [['夜、搦手の木戸へ攻め寄せる'], ['打って出た城兵を受け止める', s(2)], ['雨の坂で退き口を保つ', s(2.5)], ['城を囲み、通い路を断つ', s(4)]],
  kanegasaki: [['金ヶ崎の麓の一の備で朝倉の先手を止める'], ['笙の川の橋で騎馬の追手を受ける', s(3)], ['南の狭路で後続を止め、若狭への道へ退く', s(5)]],
  // 11/4：場所と行いを書く（AR1）。「浅井を…討つ」は goal_count が後ろの浅井長政へ端の矢印を出すので、しんがりの組を崩す形に
  // 11/5（check60 X1）：本人がその場所でその隊と槍を合わせた時だけ進む（b_anegawa.js の aneAdvance・ANE_MISSIONS と同じ字）
  anegawa: [['森可成の川前で、渡る浅井勢と槍を合わせよ'], ['岸へ上がる磯野員昌の隊と斬り結べ', (rt) => (rt.flags.aneStage || 0) >= 1], ['稲葉の横槍に合わせ、浅井の三の手を押せ', (rt) => (rt.flags.aneStage || 0) >= 2],
    ['浅い瀬から姉川を北へ渡れ', (rt) => (rt.flags.aneStage || 0) >= 3], ['北岸で浅井のしんがりと斬り結べ', (rt) => (rt.flags.aneStage || 0) >= 4]],
  nodafukushima: [['竹束を据え、鉄砲で支える'], ['浅瀬を渡り、砦へ攻める', s(2)], ['一揆に囲まれ、堤で耐える', s(3)], ['囲みを解き、詰め陣へ退く', s(3.5)]],
  shiga: [['坂本の町口で大軍を迎え撃つ'], ['森可成が討死。宇佐山城へ退く', s(2)], ['囲む大軍を、塀と門から押し返す', s(3)]],
  hieizan: [['燃える坂本から、本坂を登る'], ['文殊楼の門を抜ける', s(3)], ['根本中堂の前の僧兵を退ける', f('deep')]],
  mikatagahara: [['平手の槍の持ち場で武田を受け止める'], ['右の森の際で山県の赤備えを受ける', s(2)], ['平手が討死。浜松城の口へ退く', s(3)]],
  tonezaka: [['坂の下で河合吉統の殿を崩す'], ['坂の中ほどで山崎吉家・斎藤龍興の手を崩す', s(2)], ['峠口で詫美越後守の殿を崩す', s(3)], ['一乗谷の城下で朝倉の兵を崩す', s(5)]],
  odani: [['清水谷を登る'], ['京極丸を奪い、父子を分ける', s(2)], ['小丸の久政を攻める', f('komaAttack')], ['本丸の最後の抵抗を破る', f('honAttack')]],
  // 11/5 check60：史実の日付の順（七月の三手と船団の封鎖 → 九月二十九日の降伏・斬り込み・二砦の囲み）。docs/battle_learn/nagashima.md
  nagashima: [['七月、三手で寄せ、岸に囲みの柵を結う'], ['九月二十九日、降って退く舟を岸で見張る', s(2)], ['斬り込む門徒を、柵の手前で止める', s(3)], ['三方から中江・屋長島を囲み、西の柵を守る', s(3.5)]],
  shitaragahara: [['馬防柵を守り、武田の騎馬を退ける'], ['崩れた武田を追い討つ', ph('pursuit')]],
  echizen: [['観音丸城の木戸を破る'], ['観音丸の守兵を崩す', (rt) => rt.def.missionOf?.(rt) >= 3]],
  // 11/5 check60：信長公記巻八の順（十五日の風雨の昼 → 同夜の府中の夜襲 → 十六日からの山狩り）。大滝寺は言い伝えによる補い。
  //   b_echizen_ikko.js の IKKO_GOALS と同じ字の四段（惣門 → 外堂 → 山門 → 本堂）
  echizen_ikko: [['十五日の昼、竹束に続き惣門を木づちで破る'], ['風雨の中、惣門の内の外堂を味方と押さえる', (rt) => rt.def.missionOf?.(rt) >= 1], ['その夜、石段の上の山門を木づちで破る', (rt) => rt.def.missionOf?.(rt) >= 2], ['十六日の朝、本堂を味方と押さえる', (rt) => rt.def.missionOf?.(rt) >= 3]],
  iwamura: [['篝火を焚き、陣の柵を守る'], ['夜討ちを退ける', s(2)], ['退く武田勢を城の麓まで追う', s(3)]],
  // 11/4 p100：場所と行いで書く（AR1・docs/battle_refs/tennoji.md）。籠城 → 後詰の突入 → 合流 → 打って出る → 追撃
  tennoji: [['天王寺砦の南の門で、本願寺勢を防ぐ'], ['南の門の前で、信長の後詰と囲みを破る', ph('break')], ['南の門の内で、明智光秀の兵と合流する', ph('fort', 'regroup')], ['南の門を出て、砦の東から北の囲みを討つ', ph('sortie')], ['退く門徒を、大坂の城戸口まで追う', ph('chase')]],
  saika: [['川べりの小旗で杭を外す組を守る'], ['中央の渡り口から西岸の坂の下へ渡る', s(2)], ['退き太鼓で東岸の旗へ戻る', s(3)], ['竹束の陰で東岸の旗の前を守る', s(5)]],
  // 11/4：場所と行いで書く（AR1。「待つ」だけの段にしない）
  tedorigawa: [['水島の柴田勝家の旗から、渡り口の北の篝火へ退く'], ['北岸の篝火で、上杉の追手を止める', s(2)], ['二本の旗の間の浅瀬で、手取川を渡る', s(3)], ['南岸の篝火で、遅れて渡る味方を守る', s(4)]],
  // 11/3 p100：場所と行いで書く。大手の木戸を打つ → 打って出た兵を土橋で迎え撃つ → 退く兵に続いて門内へ（付け入り・山中城の型）
  //   右上の札（goals5.js）は段を四つまでしか並べないので四段にまとめる。
  shigisan: [['尾根道の伏兵を討ち、大手の木戸へ登る'], ['大手の木戸を掛矢で打つ', s(2)], ['打って出た松永勢を土橋で迎え撃つ', s(3.2)], ['退く敵に続いて門を抜け、北尾根の下の曲輪を取る', s(3.5)], ['西の尾根道から本丸の南口へ攻め入る', s(4)]],
  // 11/4 p100：場所と行いで書く（docs/battle_refs/kizugawa.md）。西の大筒 → 甲板の火 → 南と西の乗り口 → 寄せた大将船 → 木津浦へ退かせる（信長公記）
  kizugawa: [['西の船べりの大筒で寄る小早を撃つ'], ['水桶を取り、甲板の焙烙の火を消す', s(2)], ['南と西の乗り口で、乗り移る毛利勢を討つ', s(3)], ['引き付けた毛利の大将船を、西の大筒で撃つ', s(4)], ['甲板に残る毛利勢を討ち、船団を木津浦へ退かせる', s(5)]],
  miki: [['兵糧の荷を止める'], ['打って出た城兵から平田を守る', (rt) => rt.def.missionOf?.(rt) >= 2], ['大村の敵を崩す', s(2)]],
  arioka: [['内から開く木戸を待つ'], ['城下の辻を取る', s(1)], ['奪った木戸を守り抜く', (rt) => rt.def.missionOf?.(rt) >= 4]],
  iga: [['麓の陣の火を消し、夜討ちを防げ'], ['陣の口で、林から出る伊賀衆を防げ', s(1.5)], ['南の土橋へ登り、伊賀衆を止めよ', s(2)], ['麓の陣へ退き、夜討ちを防げ', s(2.5)], ['空の主郭から北の曲輪を調べよ', s(3.5)]],
  tottori: [['千代川の岸で兵糧舟二艘を焼く'], ['柵の口で、打って出た城兵を止める', s(2)], ['開城の使いを城の木戸まで守る', s(3)]],
  takato: [['退く城兵に続き、大手門から三の丸へ入る'], ['二の丸の土橋を渡り、二の丸の門を破る', f('sanFell')], ['本丸門を破り、本丸の旗を守る', f('niFell')]],
  tano: [['谷道の先手へ合流する'], ['谷道で武田勢を押す', dp('valley')], ['崖道の殿を破る', dp('narrow')], ['屋敷の柵の口を破る', dp('fence')], ['勝頼の陣へ迫る', dp('tano')]],
  // 右上の目標は段四つ＋討つ数一つ（goals5.js は五つまで。六段だと始めの表門・本堂が落ちて、門で戦う時に「御殿」が今の目標に出ていた）
  // 岩石城（山中城の型）：大手の坂 → 門から打って出た城兵を迎え撃つ → 退く城兵を追って門の内へ（付け入り）→ 本丸の熊井越中守
  t07_ganjaku: [['大手の坂を登り、二の丸の門の前へ出る'], ['門から打って出た秋月勢を坂で迎え撃つ', (rt) => (rt.flags.stage || 0) >= 2], ['退く秋月勢を追い、開いた門から城内へ入る', (rt) => (rt.flags.stage || 0) >= 3], ['本丸へ攻め入り、熊井越中守を討つ', (rt) => (rt.flags.stage || 0) >= 4]],
  honnoji: [['表門で明智勢を押し返す'], ['本堂から御殿の奥へ上様を守る', ph('hondo', 'kyoto', 'move', 'goten')], ['二条御所の西の門を守る', (rt) => !rt.G.lord && ph('nijo', 'defend')(rt)], ['北の木戸を抜け、使者の家へ走る', (rt) => !rt.G.lord && ph('escape', 'shisha')(rt)]],
};

// 倒す数（kaito 11/2 O）：段（四つ目の欄）や目標（三つ目の欄）に (rt) => [倒した数, 倒す数] を持たせると、札の今の目標に「（12／30）」と出す。
//   数は段が進む判定と同じ物から数える（判定の数に届けば段が進む）。数でない段（行き着く・守る）は持たせない。
//   各戦の数は KILLS[戦][段の番号]（下か戦のファイルで足す）。無い段で b_depth の激突（fight）が進んでいれば、その寄せの数を出す。
export const KILLS = {};
export const liveIn = (list) => (list || []).reduce((n, g) => n + (g ? g.units.reduce((m, u) => m + (u.alive && !u.gone ? 1 : 0), 0) : 0), 0);
// 組 list が「残り keep 人以下」で崩れる時の [倒した数, 倒す数]。total は始めの人数（無ければ今の units の数）
export function downTo(list, keep, total) {
  const gs = (list || []).filter(Boolean);
  if (!gs.length) return null;
  const n0 = total ?? gs.reduce((n, g) => n + g.units.length, 0);
  const need = Math.max(1, n0 - Math.floor(keep));
  return [Math.max(0, Math.min(need, n0 - liveIn(gs))), need];
}
// 始め n0 人のうち、残り left 人が keep 人以下になれば進む段の [倒した数, 倒す数]（left は戦の判定と同じ数え方で渡す）
export function cut(n0, left, keep = 0) {
  if (!(n0 > 0)) return null;
  const need = Math.max(1, Math.round(n0) - Math.floor(keep));
  return [Math.max(0, Math.min(need, Math.round(n0) - left)), need];
}
// 組 list の全部が崩れる時の [倒した数, 倒す数]。戦の判定と同じ物差しで数える：
//   live＝まだ戦う兵（戦の判定の「立っている者」と同じにする）／ off＝その組を崩れたとみなす（退いた・二人以下など。崩れた組は全員を倒した数に入れる）
export const standing = (u) => u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.evacuatedWound && !u.noTarget;
export function broke(list, live = standing, off = null) {
  const gs = (list || []).filter(Boolean);
  if (!gs.length) return null;
  let down = 0, n = 0;
  for (const g of gs) {
    const out = g.routed || g.count === 0 || !g.units.some(live) || !!off?.(g);
    for (const u of g.units) { n++; if (out || !live(u)) down++; }
  }
  return [down, n];
}
// b_depth の激突：二人以下・逃げた組は崩れたとみなす（b_depth.js の spent と同じ）
const dpGone = (g) => !g || g.count <= 2 || g.routed || g.units.every((u) => !u.alive || u.fleeing);
function dpCount(rt) {
  const C = rt.flags.dp?.on && rt.flags.dp.cur;
  // まだ来る寄せ（later）が残る間は出さない（来る数は寄せを出す時まで決まらない。数が揃っても段が進まない札にしない）
  if (!C || !C.s?.killAll || !C.groups?.length || C.later?.length) return null;
  let down = 0, left = 0;
  for (const g of C.groups) {
    if (dpGone(g)) { down += g.units.length; continue; }
    for (const u of g.units) if (u.alive && !u.dying && !u.evacuatedWound) left++; else down++;
  }
  return [down, down + left];
}
function countOf(fn, rt) {
  let c = null;
  try { c = fn?.(rt); } catch (e) { c = null; }
  return c && c[1] > 0 && Number.isFinite(c[0]) ? [Math.max(0, Math.min(c[1], Math.round(c[0]))), Math.round(c[1])] : null;
}

// 段の無い戦（右上が任務の一行だけ）の倒す数：KILLS[戦] が関数ならそれ、無ければ b_depth の激突
export function killNow(rt) {
  const k = rt && !rt.over && !rt.def?.town && !rt.def?.dojo ? KILLS[rt.def?.key] : false;
  if (k === false) return null;
  return (typeof k === 'function' ? countOf(k, rt) : null) || dpCount(rt);
}

// 織田家編の倒す数（段の番号 → 数）。戦ごとの「崩れた」の物差し（各戦の gone・spent）に合わせた兵の数え方で数える
const cnt = (u) => u.alive && !u.dying && !u.evacuatedWound;                         // 組の count と同じ（皆倒れるか退けば崩れた）
const fit = (u) => u.alive && !u.fleeing && !u.woundOut;                              // 逃げた・深手の者は数えない
const fitT = (u) => fit(u) && !u.gone && !u.noTarget;
Object.assign(KILLS, {
  sunomata: {
    1: (rt) => broke([rt.flags.W1, rt.flags.W1b], (u) => fitT(u) && !u.dying),
    2: (rt) => broke([rt.flags.W2], (u) => fitT(u) && !u.dying),
    3: false,
  },
  inabayama: { 1: (rt) => (rt.flags.step === 2 ? broke([rt.flags.ote, rt.flags.ote2], cnt) : null) },
  anegawa: { 0: false, 1: false, 2: false, 3: false, 4: false },   // 11/5：段は倒した数で進めない（X1）。数は出さない
  nodafukushima: { 1: (rt) => (rt.flags.step === 2 && rt.flags.sally ? broke([rt.flags.sally], cnt) : null) },
  hieizan: { 1: (rt) => { const F = rt.flags; return F.step === 3 && !F.deep ? broke([F.gosei, F.gosei2], (u) => fitT(u) && !u.invuln) : null; } },
  tonezaka: {
    0: (rt) => (rt.flags.step === 1 ? broke([rt.flags.r1, rt.flags.r1b], (u) => fitT(u) && !u.dying && !u.evacuatedWound) : null),
    1: (rt) => (rt.flags.step === 2 ? broke([rt.flags.r2, rt.flags.r3], (u) => fitT(u) && !u.dying && !u.evacuatedWound) : null),
  },
  tennoji: { 3: (rt) => (rt.flags.step === 3 ? broke(rt.flags.last, fit) : null) },
  miki: { 2: (rt) => (rt.flags.step === 2 ? broke(rt.flags.foes, (u) => fit(u) && !u.noTarget) : null) },
  // 田野は b_tano.js の段（谷道・崖道・柵の口は今の段の守兵、屋敷の奥は守兵の全部）が皆崩れて進む
  tano: (rt) => {
    const F = rt.flags, C = F.dp?.on && F.dp.cur, ph = C?.s?.phase, live = (u) => fit(u) && !u.noTarget;
    return ph === 'valley' || ph === 'narrow' || ph === 'fence' ? broke(C.groups, live) : ph === 'tano' ? broke(F.defenders, live) : null;
  },
});

const memo = new WeakMap(), doneMemo = new WeakMap();
// 今の段階 { i, n, line }。段階の無い戦は null
export function stageNow(rt) {
  const list = rt && !rt.def?.town && !rt.def?.dojo && STAGES[rt.def?.key];
  if (!list) return null;
  let i = memo.get(rt) ?? 0;
  if (rt.over && rt.tracker?.main === true) i = list.length - 1;
  else for (let k = list.length - 1; k > i; k--) { const at = list[k][1]; let ok = false; try { ok = !!at?.(rt); } catch (e) { ok = false; } if (ok) { i = k; break; } }
  memo.set(rt, i);
  // 目標の札（hud_goals.js）：段の三つ目の欄。無い段は段の一行を一つの目標にする。一度済んだ目標は戻さない
  let seen = doneMemo.get(rt);
  if (!seen) doneMemo.set(rt, (seen = new Set()));
  const goals = (list[i][2] || [[list[i][0], (q) => q.over && q.tracker?.main === true]]).map(([text, at, cnt], j) => {
    const k = i + ':' + j;
    if (!seen.has(k)) { let ok = false; try { ok = !!at?.(rt); } catch (e) { ok = false; } if (ok) seen.add(k); }
    return { text, done: seen.has(k), count: cnt && !seen.has(k) && !rt.over ? countOf(cnt, rt) : null };
  });
  // 段の倒す数は、まだ済んでいない最後の目標（段の締め）に付ける
  const K = KILLS[rt.def.key];
  const own = list[i][3] ?? (typeof K === 'function' ? K : K?.[i]);   // false＝数を出さない段。関数の KILLS は段を問わず呼ぶ（null なら b_depth の激突を見る）
  const count = rt.over || own === false ? null : (own ? countOf(own, rt) : null) || dpCount(rt);
  if (count) { const g = [...goals].reverse().find((q) => !q.done && !q.count); if (g) g.count = count; }
  // 数が満ちた目標は ✓ にする（行き着く・合図を待つ間も「崩した」と分かる）。寄せが増えて数が戻れば外す
  for (const g of goals) if (g.count && g.count[0] >= g.count[1]) { g.done = true; g.count = null; }
  return { i, n: list.length, line: list[i][0], goals, count };
}
