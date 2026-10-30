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

// 戦の定義の battleVoices で声を替える。敵の宗派を家紋から決めない。
// { enemy: 'tendai', lines: { enemy: { ambient: ['…'], push: ['…'] }, ally: { order: ['…'] } }。
// 場面の空配列は、その声を止める指定。
const TENDAI = {
  ambient: ['山を守れ。列を離れるな！'], nanori: ['山門の衆ぞ、ここは通さぬ！'],
  pushing: ['山門を守れ！　押し返せ！'], push: ['山門を守れ！　押し返せ！'],
  breaking: ['堂の陰へ退け！　列を戻せ！'], waver: ['堂の陰へ退け！　列を戻せ！'],
};
export function battleVoiceLines(rt, scene, side = 'enemy') {
  const voices = rt?.def?.battleVoices;
  const custom = voices?.lines?.[side]?.[scene];
  if (Array.isArray(custom)) return custom;
  const profile = voices?.enemy ?? (rt?.def?.key === 'hieizan' ? 'tendai' : null);
  if (side === 'enemy' && profile === 'tendai') return TENDAI[scene] || [];
  return null;
}
const MITSUHIDE = new Map([
  ['敵の列が乱れました。足並みをそろえて進みましょう', '敵の列が乱れた。足並みをそろえ、進め'],
  ['こちらが押しています。隣の隊と並んでください', '押しておる。隣の隊と並べ'],
  ['よく支えてくださいました。旗を前へ進めましょう', 'よく支えた。旗を前へ進めよ'],
  ['どうか落ち着いて。旗の下へお戻りください', '乱れるな。旗の下へ戻れ'],
  ['押されています。退く道を空けてください', '押されておる。退き口を空けよ'],
  ['列を整えましょう。一人で前へ出ないでください', '列を整えよ。一人で前へ出るな'],
  ['お味方が討たれましたか……。残る方を守りましょう', '味方が討たれたか……。残る者を守れ'],
  ['その働きは忘れません。どうか列を離れずに', 'その働きは忘れぬ。列を離れるな'],
  ['無念です……。空いた持ち場を支えてください', '無念……空いた持ち場を頼む'],
  ['敵が逃げています。深追いはお控えください', '敵が逃げておる。深追いはするな'],
  ['敵が退きました。こちらの列を整えましょう', '敵が退いた。こちらの列を整えよ'],
  ['追う前に周りをお確かめください。伏兵に備えましょう', '追う前に周りを見よ。伏兵に備えよ'],
]);
export function cleanBattleSpeech(rt, text) {
  let t = String(text ?? '').trim();
  if (!t || /^[0０]+$/.test(t)) return '';
  if (rt.def.missionStyle === 'raid' && rt.def.speechAllowed?.(rt, '', t) === false) return '';
  if (rt.def.missionStyle === 'raid') t = t
    .replace('囲まれるぞ。味方の方へ退け', '囲まれるぞ。目印の仲間へ戻れ')
    .replace('囲まれるぞ。来た道へ退け', '囲まれるぞ。来た道へ戻れ')
    .replace(/穂先をそろえよ！/g, 'やりの先を敵へ向けよ！')
    .replace(/生き残った者は次の戦で古参となり、強くなる/g, '生き残った仲間は、次の戦では経験を積んで強くなる')
    .replace(/今川の陣/g, '今川（いまがわ）の軍が集まる場所')
    .replace(/伝令の兵/g, '知らせを運ぶ兵');
  if (rt.def.missionStyle === 'ford') t = t
    .replace('囲まれるぞ。味方の方へ退け', '囲まれるぞ。矢印の方へ下がれ')
    .replace('槍衾だ。正面は避け、横へ回れ', '槍の正面は危険だ。列の端より外へ回れ');
  for (const [from, to] of MITSUHIDE) if (t.includes(from)) t = t.replace(from, to);
  t = t.replace(/崩れました/g, '崩れたぞ').replace(/押されています/g, '押されておる');
  if (/敵(?:は|が|勢は).*総崩れ/.test(t) && rt.army.groups.some((g) => g.team !== rt.player.u.team && g.count > 0 && !g.routed && g.order !== 'retreat' && g.order !== 'flee'))
    t = t.replace(/敵(?:は|が|勢は)[^。！!]*総崩れ[^。！!]*/g, '敵の一隊が崩れた');
  if ((rt.def.battleVoices?.enemy ?? (rt.def.key === 'hieizan' ? 'tendai' : null)) === 'tendai' && /南無阿弥陀仏|進めば極楽|退けば地獄|一向宗の門徒|御坊|仏敵/.test(t)) {
    const lines = battleVoiceLines(rt, /退|崩れ|もう/.test(t) ? 'waver' : 'push');
    t = lines?.[0] || '';
  }
  return t;
}

// 待ち列には本人を覚える。表示中は兵の名簿を毎コマ探し直さない。
export function battleSpeaker(rt, speaker, text = '') {
  if (!rt?.army) return null;
  if (speaker === '使番') speaker = text.match(/^(.{1,30})殿の使いじゃ。/)?.[1] || speaker;
  if (speaker && speaker === rt.G?.name) return rt.player?.u || null;
  const name = String(speaker || '').replace(/殿$/, '').replace(/\s/g, '');
  if (!name) return null;
  const same = (n) => { n = String(n || '').replace(/\s/g, ''); return n === name || name.length >= 2 && n.endsWith(name); };
  for (const [dead, u] of rt._deadSpeakers || []) if (same(dead)) return u;
  for (const u of rt.army.units) if (u.name && same(u.name)) return u;
  return null;
}
const MOURNING = [
  '討たれたか。列を埋めよ。', '忘れぬ。今は生き残れ。', '残る者を守れ。',
  'ああ……仲間が討たれたか。残る皆を守ろうぞ', '無念じゃ……。皆、離れるなよ', 'その働き、忘れぬぞ。皆で生きて帰ろう',
  '無念……。残る者はわしの後ろへ来い！', '仲間を失ったか。これ以上は討たせぬ！', '嘆くのは後じゃ。今は隣を守れ！',
  '味方が討たれたか……。残る者を守れ', 'その働きは忘れぬ。列を離れるな', '無念……空いた持ち場を頼む',
  '惜しい者を失った……。残る者を守るぞ', '無念じゃ。だが列を空けてはならぬ', 'その働きは覚えておく。今は退く道を守れ',
  '仲間が……。残る者は離れるな！', '忘れぬぞ。今は皆を守る！', '無念じゃ……。その持ち場はわしが支える！',
];
// 通常の戦は声だけ。任務の台詞を指定した戦では、既存の字幕枠を使う。
export function battleDialogueMuted(rt) {
  return !!rt?.def && !rt.def.town && !rt.def.missionDialogue;
}
export function battleSpeechAllowed(rt, speaker, text, unit = undefined) {
  if (battleDialogueMuted(rt)) return false;
  if (rt?.def?.speechAllowed?.(rt, speaker, text) === false) return false;
  if (!rt?.army) return true;
  if (rt.def?.speechAllowed && !rt.def.speechAllowed(rt, speaker, text)) return false;
  if (unit === undefined) unit = battleSpeaker(rt, speaker, text);
  if (unit && (!unit.alive || unit.fled || unit.gone)) return false;
  // 武将が仲間を悼む声は、味方が実際に討たれた直後の八秒だけ。
  for (const line of MOURNING) if (text.includes(line)) return rt.t - (rt._allyDeathAt ?? -Infinity) <= 8;
  return true;
}

const BARK_VARIANTS = [
  [/^囲まれた！\s*味方のいる所まで下がれ$/, ['囲まれた！　味方のいる所まで下がれ', '敵に囲まれた！　味方の列へ戻れ', '囲みの薄い所へ下がれ！　味方と合流せよ']],
  [/^組が動揺している！$/, ['組が動揺している！', '組が怯えておる！　旗の下に集まれ', '組の心が乱れておる！　隣の者と離れるな']],
  [/^正面から打たれた$/, ['正面から打たれた', '前から一撃を受けた', '正面の敵に打ち込まれた']],
  [/^(.+?)が退いたで！$/, ['$1が退いたで！', '$1が下がったぞ！', '$1が退き始めたぞ！']],
  [/^使番が(.+?)へ走った$/, ['使いが 味方へ向かった']],
];
export function varyBattleBark(rt, text) {
  for (let i = 0; i < BARK_VARIANTS.length; i++) {
    const [pattern, lines] = BARK_VARIANTS[i];
    if (!pattern.test(text)) continue;
    const recent = rt._barkVariants || (rt._barkVariants = {});
    const n = recent[i] || 0; recent[i] = (n + 1) % lines.length;
    return text.replace(pattern, rt.def.missionStyle === 'raid' && i === 4 ? '知らせを運ぶ兵が 味方へ向かった' : lines[n]);
  }
  return text;
}

// 桶狭間から後の戦（教えの戦でない戦）：任務・知らせ・台詞から「〜を長押し」「右クリックで」のような操作のやり方を外し、
// 「何をするか」だけを残す（kaito 10/20。操作は尾張統一戦で覚え、一時停止の「操作の一覧」でいつでも見られる）
const NUM_S = '(?:[〇一二三四五六七八九十百0-9０-９]+秒(?:余り|ほど|以上)?)';
const IM = { 手当て: '手当てせよ', 構え: '構えよ', ふせぐ: 'ふせげ', 打つ: '打て', 突く: '突け' };
const SUF = '(?:しよう|せよ|しろ|じゃ|続けよう|続けよ|続けて|よう|よ|せ|す|し)?';
export function noOps(text) {
  if (text == null) return text;
  let t = String(text);
  if (!/押|クリック|ボタン|キー|おそう/.test(t)) return t;
  // 戦の中の行動の札（hud）の決まり文句
  t = t.replace(/ここを\s*長くおそう/g, 'ここで ふせごう').replace(/[右左]クリックを\s*長くおそう/g, 'ふせごう')
    .replace(/[「『]([^」』]{1,6})[」』]を押して\s*はなす/g, '$1').replace(/押したまま\s*/g, '').replace(/^押して/, '');
  const im = (s) => { s = s.replace(/[「」『』]/g, ''); return IM[s] || imperative(s); };
  // （右クリックで構える）など、括弧の中の操作は丸ごと外す
  t = t.replace(/[（(][^）)]*(?:押し|クリック|ボタン|キー)[^）)]*[）)]/g, '');
  // 右クリックを押し続けて構えよ・左クリックで突け → 構えよ・突け
  t = t.replace(/[右左](?:クリック|ボタン|押し)(?:を押し続けよう|を押し続けよ|を押し続けて|を押して|を長押しして|を長押しで|を長押し|を押したまま|を放して|で|を)?/g, '');
  t = t.replace(/「?[ァ-ヶー]{1,8}」?のキー(?:を長押し|を押し|で)?/g, '').replace(/マウスの/g, '').replace(/一度押して/g, '').replace(/(^|[、。])を?押し続け[、て]?/g, '$1');
  // 「打つ」を長押しして木戸を破れ → 打つ、木戸を破れ
  t = t.replace(new RegExp(`[「『]([^」』]{1,16})[」』](?:の?(?:札|丸|釦|ボタン))?を${NUM_S}?(?:長押し|押し続け|押したまま|押)(?:して|で)`, 'g'), (m, l) => `${l}、`);
  // 「火をつける」を長押し・を押し続けよ・を押せ → 火をつけよ
  t = t.replace(new RegExp(`[「『]([^」』]{1,16})[」』](?:の?(?:札|丸|釦|ボタン))?を${NUM_S}?(?:長押し|押し続け|押したまま|押)${SUF}`, 'g'), (m, l) => im(l));
  // 水を掛ける札を八秒長押しせよ → 水を掛けよ
  t = t.replace(new RegExp(`([^\\s　、。！「」]{1,10}?)(?:札|丸|釦)を${NUM_S}?(?:長押し|押し続け|押)${SUF}`, 'g'), (m, l) => im(l));
  // 手当てを押し続けよ → 手当てを続けよ
  t = t.replace(/([^\s　、。！「」]{1,6})を押し続け(?:よう|よ|る|て)/g, '$1を続けよ');
  // 残った「長押しで」「三秒長押し」
  t = t.replace(new RegExp(`${NUM_S}?長押し(?:しよう|せよ|して|で|すると)?`, 'g'), '');
  t = t.replace(/^[、。\s　]+/, '').replace(/[\s　]+([。！、？])/g, '$1').replace(/、{2,}/g, '、').replace(/。{2,}/g, '。').replace(/、([。！])/g, '$1').replace(/[、\s　]+$/, '').trim();
  return t || String(text);
}
