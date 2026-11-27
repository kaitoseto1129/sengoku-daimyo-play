// K516（11/27 クラウド）：知行の画面（i18n_realm.js）の抜けの残り。英語の時だけ i18n.js が読む。
const S = (m, tr) => tr(m).replace(/[.。]\s*$/, '');
export default [
  ['岩出山', 'Iwadeyama'], ['仙台', 'Sendai'], ['鉢形', 'Hachigata'], ['姫路', 'Himeji'],
  [/^(\d{4}) · (正月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)$/, (m) => `${m[1]} · ${['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'].indexOf(m[2]) + 1}${'' }`.replace(/ · (\d+)$/, (x, n) => ' · ' + ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+n])],
  [/^足軽の長屋$/, () => 'Ashigaru quarters'],
  [/^土地$/, () => 'Land'], [/^内政$/, () => 'Domestic'],
  [/^年貢 ?(\d+)石を納めた$/, (m) => `Paid ${m[1]} koku in tax`],
  [/^知行が加増された$/, () => 'Your holdings were increased'],
  [/^(.+)の兵を(\d+)人討ち取った$/, (m, tr) => { const c = tr(m[1]); return /[぀-鿿]/.test(c) ? undefined : `Defeated ${m[2]} ${c} soldiers`; }],
  [/^まだ選んでいない：(.+)$/, (m, tr) => { const L = m[1].split('・').map((x) => tr(x)); return L.some((x) => /[぀-鿿]/.test(x)) ? undefined : `Not chosen yet: ${L.join(', ')}`; }],
  [/^(.+)：(.+)（ほか(\d+)件）$/, (m, tr) => { const a = tr(m[1]), b = tr(m[2]); return /[぀-鿿]/.test(a + b) ? undefined : `${a}: ${b} (+${m[3]} more)`; }],
  [/^([^。]+)。$/, (m, tr) => { const o = tr(m[1]); return /[぀-鿿]/.test(o) ? undefined : o.replace(/[.]$/, '') + '.'; }],
];
