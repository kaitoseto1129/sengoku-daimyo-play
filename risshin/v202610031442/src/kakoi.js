// ======================================================================
// 包囲戦の共通の部品（包囲日数・兵糧・守り手の士気・援軍の見込み）
// 大河内・三木・鳥取・岩村・長島で使う。戦略の段で日を進め、3D の出来事（夜襲・搬入を止める・
// 脱走・陣地の襲撃・交渉）の結果で値が動く。画面には小さく細いテキストのゲージと数だけ出す
// （英語は出さない。戦場の3分の2は空ける＝DOM やキャンバスを新しく広く使わず、objProgress の
// 一行に収める）。
// ======================================================================

// 包囲の状態を作る（foodDays=兵糧が保つ日数の目安。morale=守り手の士気 0〜100。relief=援軍の見込み 0〜1）
export function makeKakoi({ day = 1, foodDays = 30, morale = 100, relief = 0.5 } = {}) {
  return { day, foodDays, foodMax: Math.max(1, foodDays), morale, moraleMax: Math.max(1, morale), relief };
}

// 戦略の段で日を進める（1回の呼び出しで daysPassed 日分。兵糧が尽きると士気も落ちる）
export function advanceDay(K, daysPassed = 1) {
  K.day += daysPassed;
  K.foodDays = Math.max(0, K.foodDays - daysPassed);
  if (K.foodDays <= 0) K.morale = Math.max(0, K.morale - 4 * daysPassed);
  return K;
}

// 3D の出来事の結果を、籠城の値に反映する
export const kakoiEvent = {
  nightRaidWon: (K, n = 6) => { K.morale = Math.max(0, K.morale - n); },          // 夜襲を退けた→打って出た守り手が減り、城はやや弱る
  nightRaidLost: (K, n = 10) => { K.morale = Math.max(0, K.morale - n); },        // 夜襲を防ぎきれなかった→なお弱る
  supplyBlocked: (K, days = 4) => { K.foodDays = Math.max(0, K.foodDays - days); }, // 搬入を止めた
  supplyThrough: (K, days = 5) => { K.foodDays = Math.min(K.foodMax, K.foodDays + days); }, // 搬入を通した
  desertion: (K, n = 8) => { K.morale = Math.max(0, K.morale - n); },             // 脱走
  campRaided: (K, n = 5) => { K.relief = Math.max(0, K.relief - 0.2); K.morale = Math.max(0, K.morale - n); }, // 陣地の襲撃を受けた（寄せ手側）
  parley: (K, n = 12) => { K.morale = Math.min(K.moraleMax, K.morale + n); },     // 交渉（開城の下話など）
};

// 鳥取向けの六段階：通常→配給減→士気低下→脱走→戦う力の低下→開城の圧力
export const KAKOI_STAGE_WORDS = ['通常', '配給減', '士気低下', '脱走', '戦う力の低下', '開城の圧力'];
export function kakoiStage(K, stages = KAKOI_STAGE_WORDS.length) {
  const foodPct = K.foodMax ? K.foodDays / K.foodMax : 1;
  const moralePct = K.moraleMax ? K.morale / K.moraleMax : 1;
  const worst = Math.max(0, Math.min(1, Math.min(foodPct, moralePct)));
  return Math.max(0, Math.min(stages - 1, Math.floor((1 - worst) * stages)));
}
export function kakoiStageWord(K) { return KAKOI_STAGE_WORDS[kakoiStage(K)]; }

// 小さく細いテキストのゲージ（■□の十段。英語は出さない）
export function kakoiGaugeText(K, label = '兵糧') {
  const pct = K.foodMax ? Math.max(0, Math.min(1, K.foodDays / K.foodMax)) : 0;
  const n = 10, fill = Math.round(pct * n);
  return `${label}${'■'.repeat(fill)}${'□'.repeat(n - fill)}`;
}

// 援軍の見込みを文で（0〜1）
export function reliefWord(K) {
  if (K.relief <= 0) return '見込みなし';
  if (K.relief < 0.34) return '薄い';
  if (K.relief < 0.67) return 'あるかもしれぬ';
  return '見込みあり';
}
