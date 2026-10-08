// 武将・組頭の台詞から、操作の名・キーの名を外す。外した言い添えは、操作の手ほどきの小さな札へ回す。
const NUM = '[〇一二三四五六七八九十百0-9０-９]+';
function imperative(label) {
  const c = label.slice(-1), p = label.slice(-2, -1);
  if (/[えけせてねへめれげぜでべぺ]/.test(c)) return label + 'よ';
  const godan = { う: 'え', く: 'け', ぐ: 'げ', す: 'せ', つ: 'て', ぬ: 'ね', ぶ: 'べ', む: 'め' };
  if (godan[c]) return label.slice(0, -1) + godan[c];
  if (c === 'る') return label.slice(0, -1) + (/[えけせてねへめれげぜでべぺいきしちにひみりぎじぢびぴ]/.test(p) ? 'ろ' : 'れ');
  return label;
}
// 戻り値：{ text, how }。操作の言い添えが無ければ text はそのまま・how は ''。
export function stripOps(text) {
  let t = String(text), how = '';
  const take = (s) => { s = s.replace(/^[（(\s　]+|[）)\s　]+$/g, ''); if (s && !how) how = s; return ''; };
  if (!/キー|押|長押|『/.test(t)) return { text: t, how };
  // （エフのキー…）など、括弧の中の操作
  t = t.replace(/[（(][^）)]*キー[^）)]*[）)]/g, take);
  // 「エフのキー で鼓舞」「イーのキー 長押し」
  t = t.replace(/[\s　]*[ァ-ヶー]{1,6}(?:と[ァ-ヶー]{1,6})*のキー[\s　]*(?:で[^。！、？\s　「」]{0,8}|を?(?:長)?押し続けよ|を?押[しせ]|長押し)?/g, take);
  // 『味方と横木を結う』を長く押せ → 横木を結え
  t = t.replace(new RegExp(`[「『]([^」』]{1,14})[」』]を(?:${NUM}秒(?:余り|ほど|以上)?)?(?:長く|長押しで|押し続けて|押したまま)?押(?:し続けよ|し続けろ|せ|して)`, 'g'), (m, label) => { take(m); return imperative(label); });
  // 十二秒押せ → 手を貸せ、一秒余り押して撃て → 撃て
  t = t.replace(new RegExp(`${NUM}秒(?:余り|ほど|以上)?押(?:し続けよ|せ)`, 'g'), (m) => { take(m); return '手を貸せ'; });
  t = t.replace(new RegExp(`${NUM}秒(?:余り|ほど)?押して`, 'g'), (m) => { take(m); return ''; });
  t = t.replace(/長押し(?:で|して)?/g, take);
  t = t.replace(/(?:を)?(?:長く)?押し続けよ/g, take);
  t = t.replace(/[\s　]+([。！、？])/g, '$1').replace(/、{2,}/g, '、').replace(/^[、。\s　]+/, '').trim();
  return { text: t || String(text), how: t ? how : '' };
}
