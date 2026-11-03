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
    ['練習', null, [['林の兵を一人討つ', (rt) => (rt.flags.pk || 0) >= 1], ['続けてもう一人討つ', (rt) => (rt.flags.pk || 0) >= 2]]],
    ['柴田勢を退ける', (rt) => (rt.flags.stage || 0) >= 1, [['味方の列と並んで進む', f('lineMet')], ['敵を三人討つ', (rt) => (rt.flags.kills || 0) >= 3], ['柴田の先手を崩す', f('line1Broken')]]],
    ['林の二の備を退ける', (rt) => (rt.flags.stage || 0) >= 2, [['後ろの弓組を討つ', f('bowsDown')], ['林の二の備を退ける', f('line2Broken')]]],
    ['林美作守を討つ', (rt) => (rt.flags.stage || 0) >= 3, [['土手の林勢を崩す', f('bankDown')], ['林美作守を討つ', f('ending')]]],
  ],
  // kaito 11/2 T：義元を探せ → 本陣に迫れ → 義元を討て の三段（幕と大きな旗印は本陣の一か所だけ）
  okehazama: [['義元を探せ'], ['本陣に迫れ', ph('assault')], ['義元を討て', f('entered')]],
  moribe: [['雨の川を渡る'], ['斎藤の先手を破る', ph('contact', 'hold')], ['長井甲斐守・日比野下野守を討つ', ph('press')]],
  sunomata: [['敵の前で砦を築く'], ['一の寄せを退ける', ph('w1')], ['二の寄せを退ける', ph('w2')], ['三の寄せから柵を守り抜く', ph('w3')]],
  inabayama: [['井口の町に火を放つ'], ['打って出た斎藤勢を退ける', s(2)], ['搦手の山道を登り、木戸を破る', s(3)], ['本丸の脇に火を放つ', s(4)]],
  mitsukuri: [['矢の降る坂を、三の郭へ攻め上る'], ['松明を灯し、二の丸の木戸を破る', s(2.5)], ['夜戦で本丸を攻め落とす', s(4)]],
  okawachi: [['夜、搦手の木戸へ攻め寄せる'], ['打って出た城兵を受け止める', s(2)], ['雨の坂で退き口を保つ', s(2.5)], ['城を囲み、通い路を断つ', s(4)]],
  kanegasaki: [['挟み撃ち。朝倉の先手を止める'], ['笙の川で騎馬の追手を受ける', s(3)], ['狭い道で、退く本隊を守り抜く', s(5)]],
  anegawa: [['磯野の猛攻を受け止める'], ['磯野員昌を退ける', (rt) => rt.def.missionOf?.(rt) === 2], ['川を渡り、浅井を追い討つ', s(2)]],
  nodafukushima: [['竹束を据え、鉄砲で支える'], ['浅瀬を渡り、砦へ攻める', s(2)], ['一揆に囲まれ、堤で耐える', s(3)], ['囲みを解き、詰め陣へ退く', s(3.5)]],
  shiga: [['坂本の町口で大軍を迎え撃つ'], ['森可成が討死。宇佐山城へ退く', s(2)], ['囲まれた城で、後詰まで生き残る', s(3)]],
  hieizan: [['燃える坂本から、本坂を登る'], ['文殊楼を抜ける', s(3)], ['根本中堂の手向かいを退ける', f('deep')]],
  mikatagahara: [['武田の大軍を受け止める'], ['赤備えの騎馬に耐える', s(2)], ['平手が討死。浜松城へ逃げ延びる', s(3)]],
  tonezaka: [['嵐の夜、退く朝倉を追う'], ['山崎・龍興の殿を破る', s(2)], ['刀根坂の峠を越える', s(3)], ['一乗谷の城下へ攻め入る', s(5)]],
  odani: [['清水谷を登る'], ['京極丸を奪い、父子を分ける', s(2)], ['小丸の久政を攻める', f('komaAttack')], ['本丸の最後の抵抗を破る', f('honAttack')]],
  nagashima: [['輪中を囲む柵を結う'], ['降って退く舟を見張る', s(2)], ['死に物狂いの門徒を止める', s(3)], ['中江・屋長島の囲みを守り抜く', s(3.5)]],
  shitaragahara: [['馬防柵を守り、武田の騎馬を退ける'], ['崩れた武田を追い討つ', ph('pursuit')]],
  echizen: [['観音丸城の木戸を破る'], ['観音丸の守兵を崩す', (rt) => rt.def.missionOf?.(rt) >= 3]],
  echizen_ikko: [['惣門を破り、外堂を取る'], ['山門を破る', ph('sanmon')], ['本堂を押さえる', (rt) => rt.phase === 'sanmon' && rt.flags.gateSanmon?.struct?.alive === false]],
  iwamura: [['篝火を焚き、陣の柵を守る'], ['夜討ちを退ける', s(2)], ['退く武田勢を城の麓まで追う', s(3)]],
  tennoji: [['囲まれた砦で、本願寺の大軍に耐える'], ['大軍の囲みを斬り破る', ph('break')], ['砦で光秀らと合流する', ph('fort', 'regroup')], ['再び打って出る', ph('sortie')], ['本願寺勢を城戸口まで追う', ph('chase')]],
  saika: [['杭を抜く組を守る'], ['川を渡り、高岸へ迫る', s(2)], ['鉄砲に阻まれ、東岸へ引く', s(3)], ['東岸を守り抜く', s(5)]],
  tedorigawa: [['謙信が迫る。渡り口まで退く'], ['殿で追手を食い止める', s(2)], ['増えた川を渡る', s(3)], ['南岸で遅れた列を待つ', s(4)]],
  shigisan: [['伏兵の尾根道を登る'], ['矢の中で打ち手を守る', s(2)], ['木戸を破る', s(3)], ['天主の館へ迫る', s(4)]],
  kizugawa: [['大筒で毛利の船を撃つ'], ['焙烙火矢の火を消す', s(2)], ['乗り移った毛利勢を払う', s(3)], ['大将の船を撃ち、追い払う', s(4)]],
  miki: [['兵糧の荷を止める'], ['打って出た城兵から平田を守る', (rt) => rt.def.missionOf?.(rt) >= 2], ['大村の敵を崩す', s(2)]],
  arioka: [['内から開く木戸を待つ'], ['城下の辻を取る', s(1)], ['奪った木戸を守り抜く', (rt) => rt.def.missionOf?.(rt) >= 4]],
  iga: [['夜討ちを退ける'], ['陣の口を固め、夜討ちに備える', s(1.5)], ['南の土橋へ攻める', s(2)], ['攻めあぐね、陣で夜討ちに耐える', s(2.5)], ['空いた曲輪を調べる', s(3.5)]],
  tottori: [['毛利の兵糧舟に火をかける'], ['打って出た城兵を止める', s(2)], ['開城の使いを木戸まで守る', s(3)]],
  takato: [['大手を破り、三の丸を取る'], ['二の丸を取る', f('sanFell')], ['本丸の仁科盛信を攻める', f('niFell')]],
  tano: [['谷道の先手へ合流する'], ['谷道で武田勢を押す', dp('valley')], ['崖道の殿を破る', dp('narrow')], ['屋敷の柵の口を破る', dp('fence')], ['勝頼の陣へ迫る', dp('tano')]],
  honnoji: [['明智の大軍を門で押し返す'], ['本堂で上様を守る', ph('hondo', 'kyoto', 'move')], ['御殿で最後まで防ぐ', ph('goten')], ['二条御所の門を守る', (rt) => !rt.G.lord && ph('nijo', 'defend')(rt)], ['京の町を抜け、外れまで逃げる', ph('escape')], ['使者の家で知らせを渡す', (rt) => !rt.G.lord && (rt.flags.step || 0) >= 6]],
};

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
  const goals = (list[i][2] || [[list[i][0], (q) => q.over && q.tracker?.main === true]]).map(([text, at], j) => {
    const k = i + ':' + j;
    if (!seen.has(k)) { let ok = false; try { ok = !!at?.(rt); } catch (e) { ok = false; } if (ok) seen.add(k); }
    return { text, done: seen.has(k) };
  });
  return { i, n: list.length, line: list[i][0], goals };
}
