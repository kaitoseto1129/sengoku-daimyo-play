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
export function battleSpeechAllowed(rt, speaker, text, unit = undefined) {
  if (!rt?.army) return true;
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
  [/^使番が(.+?)へ走った$/, ['使番が$1へ走った', '$1へ使番を送った', '使番が$1へ下知を運ぶ']],
];
export function varyBattleBark(rt, text) {
  for (let i = 0; i < BARK_VARIANTS.length; i++) {
    const [pattern, lines] = BARK_VARIANTS[i];
    if (!pattern.test(text)) continue;
    const recent = rt._barkVariants || (rt._barkVariants = {});
    const n = recent[i] || 0; recent[i] = (n + 1) % lines.length;
    return text.replace(pattern, lines[n]);
  }
  return text;
}
