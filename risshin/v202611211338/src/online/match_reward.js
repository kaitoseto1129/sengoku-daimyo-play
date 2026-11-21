// 試合の後の褒美（銭・武将の経験・戦績・毎日の務めの数え）を、一つの試合に一度だけ付ける（K587・11/21 クラウド k365-cloud-40）
//   33 の busho_bank.js と同じ形：描かない純粋な計算と、呼ぶ側が保存する帳（JSON にそのまま入る）。
//   一度だけの守り：試合ごとの印（id）を帳に覚え、同じ印の二度目は何も足さない（決着の二度呼び・読み込み直し・二度押し）。
//   数は仮（要件書に数が無い。online_final 105「負けても少しもらえる」・gacha_price「勝ちを買わせない」に沿って小さく）。売り物の金（toyo_rules の kin）は付けない。
export const REWARD = Object.freeze({
  win: { zeni: 150, exp: 100 },
  loss: { zeni: 60, exp: 60 },     // 負け・降伏（降伏の罰は小さく：段位の点は pvp_rules の rankLoss）
  draw: { zeni: 100, exp: 80 },
  leave: { zeni: 0, exp: 0 },      // わざと抜けた負け（回線の切断は AI が継いだ試合の結果どおりに付ける）
  keepIds: 200,                    // 覚えておく試合の印の数（古い物から忘れる）
});

export function newMatchBook() {
  return { zeni: 0, exp: {}, record: { win: 0, loss: 0, draw: 0, leave: 0, practice: 0 }, daily: { day: '', played: 0, won: 0 }, paid: [] };
}

// 試合の結果 r（pvp_rules.judge か降伏の結果）と、自分が team 0 として：'win'|'loss'|'draw'|'leave'
export function outcomeOf(r, leftOnPurpose = false) {
  if (leftOnPurpose) return 'leave';
  if (!r || r.winner == null) return r?.why === 'draw' || r?.winner === null ? 'draw' : 'loss';
  return r.winner === 0 ? 'win' : 'loss';
}

// 一度だけ付ける。返す：{ applied, outcome, zeni, exp }（applied が false なら何も足していない）
//   m：{ id（試合の印・必須）, outcome, generals（自分の武将の名）, practice（模擬合戦の練習なら褒美なし・数えだけ）, day（'2026-11-21' など。毎日の務めの日）}
export function settleMatch(book, m) {
  if (!book || !m?.id) return { applied: false, why: 'noid' };
  book.paid ||= [];
  if (book.paid.includes(m.id)) return { applied: false, why: 'dup' };
  book.paid.push(m.id);
  if (book.paid.length > REWARD.keepIds) book.paid.splice(0, book.paid.length - REWARD.keepIds);
  if (m.practice) { book.record.practice = (book.record.practice || 0) + 1; return { applied: true, outcome: m.outcome, zeni: 0, exp: 0, practice: true }; }
  const R = REWARD[m.outcome] || REWARD.loss;
  book.zeni = (book.zeni || 0) + R.zeni;
  for (const g of m.generals || []) book.exp[g] = (book.exp[g] || 0) + R.exp;
  book.record[m.outcome] = (book.record[m.outcome] || 0) + 1;
  if (m.outcome === 'leave') book.record.loss = (book.record.loss || 0) + 1;   // わざと抜けたのは負けにも数える
  const day = m.day || '';
  if (book.daily.day !== day) book.daily = { day, played: 0, won: 0 };
  if (m.outcome === 'leave') return { applied: true, outcome: 'leave', zeni: 0, exp: 0 };   // わざと抜けた試合は日ごとの数えに入れない
  book.daily.played++; if (m.outcome === 'win') book.daily.won++;
  // 毎日の務めの札と無料の登用は 33 の online/tsutome.js（ここの daily は戦績の日ごとの数えだけ）
  return { applied: true, outcome: m.outcome, zeni: R.zeni, exp: R.exp };
}
