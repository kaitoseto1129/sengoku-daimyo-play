// 1万人のテストプレイヤーの表（種で決める。何度作っても同じ表）
// kaito「テストプレイヤーを100人に」→「1000人」→「1万人が git でプレイするように」（2026-09-27）
// 一人 ＝ 五つの性格（playbot.js の PERSONAS）× 変わり目：
//   habit 操作の癖   ren 連打／kamae 構え多め／hashiri 走りっぱなし／mayoi 迷子になりやすい／yomu 台詞を全部読む
//   size  画面       844x390・874x402・932x430（iPhone 横）／1280x720（パソコン。指ではなく鍵盤とマウス）
//   mode  遊ぶ所     tooshi 新しく始める通し／one 織田家編（ODA_LINE）の戦を一つ／lord 信長で出陣
//   spd   速さ       1 ゆっくり（手が遅い・札を読む）／2 ふつう／3 速い（すぐ押す）
//   prog  身分の進み 0 足軽から〜3 終わりの方（通しの始める所・一つの戦の選び方に効く）
//   buy   問屋で買う物 uma 馬／teppo 鉄砲／tomo 供／buki 刀・槍・具足／nashi 買わない
//   view  見え方     tp 三人称／fp 一人称
//   n     戦の数     1〜3（通しの時）
//   sens  見回しの感度 0.6 鈍い／1 ふつう／1.6 敏感
//   pausy 途中で止める 0 止めない／1 途中で一時停止の札を開く
//   pick  戦を選ぶ種（ページの中で 戦の数で割った余りを使う）
// 使い方：
//   node players-table.mjs --row=17          → その人の botrun の引数（一行・JSON）
//   node players-table.mjs --table           → 表を Markdown で
//   import { ROWS, argsOf } from './players-table.mjs'
export const ORDER = ['chu', 'reki', 'act', 'sen', 'sek'];
const AX = {
  habit: ['ren', 'kamae', 'hashiri', 'mayoi', 'yomu'],
  size: ['844x390', '874x402', '932x430', '1280x720'],
  mode: ['tooshi', 'one', 'lord'],
  spd: [1, 2, 3],
  prog: [0, 1, 2, 3],
  buy: ['uma', 'teppo', 'tomo', 'buki', 'nashi'],
  view: ['tp', 'fp'],
  n: [1, 2, 3],
  sens: [0.6, 1, 1.6],
  pausy: [0, 1],
};
export const NAMES = {
  habit: { ren: '連打', kamae: '構え多め', hashiri: '走りっぱなし', mayoi: '迷子になりやすい', yomu: '台詞を全部読む' },
  size: { '844x390': 'iPhone 横 844×390', '874x402': 'iPhone 横 874×402', '932x430': 'iPhone 横 932×430', '1280x720': 'パソコン 1280×720' },
  mode: { tooshi: '新しく始める通し', one: '織田家編の戦を一つ', lord: '信長で出陣' },
  spd: { 1: 'ゆっくり', 2: 'ふつう', 3: '速い' },
  prog: { 0: '足軽から', 1: '身分 少し上', 2: '身分 中ほど', 3: '身分 上' },
  buy: { uma: '馬', teppo: '鉄砲', tomo: '供', buki: '刀・槍・具足', nashi: '買わない' },
  view: { tp: '三人称', fp: '一人称' },
  sens: { 0.6: '感度 鈍い', 1: '感度 ふつう', 1.6: '感度 敏感' },
  pausy: { 0: '止めない', 1: '途中で止める' },
};
export const TOTAL = 10000;
const SEED = 20260927;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 均した並び（どの値も同じくらい出る）を種で混ぜる
function balanced(vals, n, r) { const a = Array.from({ length: n }, (_, i) => vals[i % vals.length]); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const ROWS = (() => {
  const r = rng(SEED);
  const col = Object.fromEntries(Object.entries(AX).map(([k, v]) => [k, balanced(v, TOTAL, r)]));
  const rows = [];
  for (let i = 0; i < TOTAL; i++) {
    const row = { id: i, persona: ORDER[i % 5] };
    for (const k of Object.keys(AX)) row[k] = col[k][i];
    row.pick = Math.floor(r() * 1e6);
    // せっかちは戦を多くても二つ
    if (row.persona === 'sek' && row.n > 2) row.n = 2;
    rows.push(row);
  }
  return rows;
})();

// ページへ渡す問い（playbot.js が読む）
export function queryOf(row) { return `row=${row.id}&habit=${row.habit}&mode=${row.mode}&spd=${row.spd}&prog=${row.prog}&buy=${row.buy}&view=${row.view}&pick=${row.pick}&sens=${row.sens}${row.pausy ? '&pausy=1' : ''}${row.size === '1280x720' ? '&pc=1' : ''}`; }
export function argsOf(row) { return [`--persona=${row.persona}`, `--n=${row.n}`, `--size=${row.size}`, `--id=${String(row.id).padStart(4, '0')}`, `--q=${queryOf(row)}`]; }
export function labelOf(row) { return `${NAMES.habit[row.habit]}・${NAMES.size[row.size]}・${NAMES.mode[row.mode]}・${NAMES.spd[row.spd]}・${NAMES.prog[row.prog]}・問屋:${NAMES.buy[row.buy]}・${NAMES.view[row.view]}・${NAMES.sens[row.sens]}・${NAMES.pausy[row.pausy]}`; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const rowArg = a.find((x) => x.startsWith('--row='));
  if (rowArg) { const row = ROWS[+rowArg.slice(6) % TOTAL]; console.log(JSON.stringify({ row, args: argsOf(row), label: labelOf(row) })); }
  else if (a.includes('--table')) {
    console.log('| 番 | 性格 | 癖 | 画面 | 遊ぶ所 | 速さ | 身分 | 問屋 | 見え方 | 戦の数 | 感度 | 止める |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of ROWS) console.log(`| ${r.id} | ${r.persona} | ${NAMES.habit[r.habit]} | ${NAMES.size[r.size]} | ${NAMES.mode[r.mode]} | ${NAMES.spd[r.spd]} | ${NAMES.prog[r.prog]} | ${NAMES.buy[r.buy]} | ${NAMES.view[r.view]} | ${r.n} | ${NAMES.sens[r.sens]} | ${NAMES.pausy[r.pausy]} |`);
  } else {
    // 内訳
    const cnt = (k) => Object.entries(ROWS.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {})).map(([v, n]) => `${(NAMES[k] || {})[v] || v} ${n}`).join('・');
    for (const k of ['persona', ...Object.keys(AX)]) console.log(`${k}: ${cnt(k)}`);
  }
}
