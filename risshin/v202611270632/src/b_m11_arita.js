// 毛利家編 十一戦目「有田中井手の戦い」（永正十四年〔1517〕十月・安芸国 有田）。軽い型（light_battle.js）・K647（docs/house_mori.md ⑥）
//   史実：安芸武田の武田元繁は大内の留守を突いて吉川氏の有田城（小倉山城）を囲み、救いに来た毛利元就（二十歳・幸松丸の後見）と有田の中井手で戦った。
//   元繁は川を渡る途中で討たれ（今田経高の矢とされる）、武田方の熊谷元直も討たれて、数で勝る武田勢は崩れた（『陰徳太平記』B・『毛利元就卿伝』・安芸高田市の解説C。兵数は推）。
//   仕組み：調略は無し（元就の初陣に近い戦）。川を渡る敵を岸で受ける「迎え撃ち」。小勢で大軍を討つ。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';
import { plant, march } from './mori_show.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const TAKEDA = { flag: 'takeda', armor: 0x3a3a34 };
const SPAWN = { x: 60, z: -70 };           // 毛利の陣（有田の北の高み）
const KISHI = { x: 0, z: -20 };            // 川の北岸（迎え撃つ所）
const KUMAGAI = { x: -50, z: 10 };         // 熊谷元直の先手
const MOTOSHIGE = { x: -60, z: 70 };       // 武田元繁の旗本
const NAKAIDE = { x: -30, z: 40 };         // 中井手（又打川の渡り・元繁の本隊が押し返す所・K652②）
const ARITA = { x: -20, z: 112 };          // 有田城を囲む武田の陣の残り（K652②）

let TAKEDA_LINE = [];   // K716 見せ場：川向こうまで続く武田の旗の列（大将が倒れると次々に後ろへ下がる）
function scene(rt) {
  const W = rt.world;
  TAKEDA_LINE = plant(rt, [[-10, 58], [10, 66], [30, 60], [50, 70], [-45, 64], [-85, 76], [70, 82], [-110, 92]], 'takeda', 5.5);
  try { for (const [dx, dz] of [[-4, 4], [8, 6]]) rt.scene.add(nobori(W, MOTOSHIGE.x + dx, MOTOSHIGE.z + dz, 'takeda', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m11_arita = lightBattle({
  id: 'm11_arita',
  date: '永正十四年（1517）十月　昼　安芸国 有田',
  intro: '安芸武田の五千が、吉川の有田城を囲んだ。毛利は千に満たない。若い元就は、敵が川を渡る所を狙う。',
  history: '永正十四年（1517）、安芸武田の武田元繁は大内氏の留守を突いて吉川氏の有田城を囲んだ。毛利元就は幼い当主幸松丸の後見として、わずかな兵で救いに向かい、有田の中井手で武田勢と戦った。元繁は川を渡る途中で討たれ（今田経高の矢とされる）、武田方の熊谷元直も討たれて、数で勝る武田勢は崩れた。元就の名が安芸に知られた戦である（『陰徳太平記』・安芸高田市の解説。兵数は推）。',
  sides: { a: { name: '毛利の軍', mon: 'mori', faction: 'mori' }, b: { name: '安芸武田の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 1000, b: 5000 },
  allyLook: MORI, foeLook: TAKEDA,
  allyDmg: 0.3,
  foeDmg: 0.55,   // K716 二回目：信長で出陣の通しが熊谷・元繁の段で倒れた（296秒）。傷を軽く
  minutes: 6,
  stepLimit: 70,   // K716 二回目：十段が十八分まで延び最後の段で打ち切られた（未達）。上限の無い段を70秒で次へ
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 0.8 },
  world: {
    seed: 1517, time: 'day', fogFar: 340,
    river: [[-200, 0], [-80, -6], [40, 0], [200, -4]], riverW: 14, riverDepth: 0.4,
    hills: [[60, -90, 46, 16], [-100, 60, 50, 8], [140, 20, 44, 10], [-170, -40, 44, 8]],
    paths: [{ pts: [[60, -70], [20, -40], [0, -20], [-30, 40], [-60, 70]], w: 2.6 }],
    groves: [{ x: -120, z: -20, r: 30, n: 26 }, { x: 110, z: -50, r: 30, n: 26 }, { x: 0, z: 90, r: 30, n: 22 }],
    trees: 380, tufts: 1600,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('毛利元就'), uS(4), uA(8)] },
    { name: '福原広俊の手', at: { x: SPAWN.x - 14, z: SPAWN.z + 8 }, list: [busho('福原広俊'), uS(2), uA(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '武田は五千。我らは千にも足らぬ。じゃが、敵は川を渡らねば有田へ着けぬ', 3.8],
      ['福原広俊', '渡る途中は、陣が伸びて乱れる。そこを叩く', 3.4],
      ['組頭', '木の陰に伏せよ。合図まで矢を放つな', 3.2]] },
    { kind: 'move', at: KISHI, label: '川の北岸', obj: '川の北岸まで進み、木の陰に伏せる', r: 12, max: 120,
      say: [['組頭', '岸の向こうに武田の旗じゃ。まだ動くな', 3]] },
    { kind: 'hold', at: KISHI, label: '川の北岸', obj: '川を渡る武田の先手を、岸で受け止める', r: 18, dur: 65,
      title: '川を渡る敵', sub: '渡り切る前の武田勢を、岸で叩く',
      say: [['毛利元就', '今じゃ。足の止まった先頭を射よ！', 3.2]],
      waves: [
        { t: 6, say: ['武田の侍', '小勢じゃ！　渡って踏み潰せ！', 3], foes: [{ name: '武田の先手', from: { x: KISHI.x - 4, z: KISHI.z + 34 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', '二の手が渡る！　岸を空けるな！'], foes: [{ name: '武田の二の手', from: { x: KISHI.x + 14, z: KISHI.z + 38 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '川を渡る武田の先手を岸で受け止めた' },
    { kind: 'fight', at: KUMAGAI, obj: '熊谷元直の手を討つ', title: '熊谷元直', sub: '武田の先鋒・熊谷元直の備を崩す',
      say: [['毛利元就', '熊谷の旗じゃ。ここで先鋒を落とせば、武田の足が止まる', 3.2]],
      foes: [{ name: '熊谷元直の手', from: { x: KUMAGAI.x + 6, z: KUMAGAI.z + 6 }, list: [uS(3), uA(14)] }, { name: '武田の弓', from: { x: KUMAGAI.x - 10, z: KUMAGAI.z + 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '後ろから新手が出るぞ！'], foes: [{ name: '武田の新手', from: { x: KUMAGAI.x - 20, z: KUMAGAI.z + 22 }, list: [uS(2), uA(12)] }] }],
      reward: '熊谷元直の先手を崩した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②（11/25 Sanae・10分）：熊谷元直が討たれると、武田元繁は自ら又打川を渡って押し返した（『陰徳太平記』B）
    { kind: 'hold', at: NAKAIDE, label: '中井手', obj: '自ら川を渡る武田元繁の本隊の押しを、中井手で受け止める', r: 16, dur: 60, limit: 110,
      title: '元繁の押し', sub: '熊谷の討死に怒った元繁が、川を渡る',
      say: [['福原広俊', '元繁が自ら川を渡るぞ！　ここが踏ん張りどころじゃ', 3.2]],
      waves: [{ t: 6, say: ['武田元繁', '熊谷の仇じゃ！　毛利の小僧を討て！'], foes: [{ name: '武田元繁の本隊', from: { x: NAKAIDE.x - 10, z: NAKAIDE.z + 36 }, list: [uS(3), uA(12)] }] },
        { t: 32, say: ['組頭', '横からも渡って来るぞ！'], foes: [{ name: '武田の横の手', from: { x: NAKAIDE.x + 22, z: NAKAIDE.z + 34 }, list: [uS(2), uA(11), uB(3)] }] }],
      reward: '中井手で武田元繁の本隊の押しを受け止めた' },
    { kind: 'fight', at: MOTOSHIGE, obj: '武田元繁の旗本を討つ', title: '武田元繁', sub: '大将の旗本へ、一気に押し上げる',
      say: [['福原広俊', '先鋒が崩れた。元繁の旗本へ、今じゃ！', 3.2]],
      foes: [{ name: '武田元繁の旗本', from: { x: MOTOSHIGE.x + 6, z: MOTOSHIGE.z - 6 }, list: [uS(3), uA(10)] }],
      reward: '武田元繁の旗本を崩した' },
    // K716 見せ場：大将が倒れた瞬間、川向こうまで続いていた武田の旗が次々に後ろへ動き始める
    { kind: 'rest', dur: 9, heal: 0, fn: (rt) => march(rt, TAKEDA_LINE, 6, 70, 8.5), say: [['福原広俊', '元繁、討ち取ったり！', 2.8], ['組頭', '見よ。川向こうの武田の旗が、次々に後ろへ下がって行くぞ', 3.6]] },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KISHI.x - 20, z: KISHI.z + 20 }, obj: '又打川の岸の草むらで、渡る武田の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '渡り切る前に叩け', 3.2]],
      foes: [{ name: '渡る武田の足軽', from: { x: KISHI.x - 8, z: KISHI.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '川岸の足軽を討った' },
    { kind: 'hold', at: { x: KISHI.x + 30, z: KISHI.z - 10 }, label: '川の北岸の柵', obj: '川の北岸の柵で、押し寄せる武田の弓を受け止める', r: 16, dur: 45,
      say: [['見張り', '矢が来る！　柵の陰へ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '武田の弓', from: { x: KISHI.x + 42, z: KISHI.z - 22 }, list: [uS(2), uA(7), uB(2)] }] },
        { t: 22, foes: [{ name: '武田の弓', from: { x: KISHI.x + 16, z: KISHI.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '北岸の柵を守った' },
    { kind: 'fight', at: { x: KISHI.x - 20, z: KISHI.z + 40 }, obj: '中井手の渡りで、熊谷の討たれた後に乱れた武田の備を崩す', max: 100, limit: 90,
      say: [['組頭', '先手が崩れた。今じゃ、押せ', 3.2]],
      foes: [{ name: '乱れた武田の備', from: { x: KISHI.x - 8, z: KISHI.z + 28 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '中井手の備を崩した' },
    { kind: 'hold', at: { x: KISHI.x - 20, z: KISHI.z + 60 }, label: '武田元繁の旗', obj: '武田元繁の旗本の前で、助けに来る武田の残りを受け止める', r: 16, dur: 45,
      say: [['見張り', '武田の後続が来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '武田の後続', from: { x: KISHI.x - 8, z: KISHI.z + 48 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '武田の後続', from: { x: KISHI.x - 34, z: KISHI.z + 74 }, list: [uS(2), uA(7)] }] }],
      reward: '旗本の前を守った' },
    // K652②：元繁が討たれると、有田城を囲んでいた武田勢も崩れ、吉川の有田城は救われた（『陰徳太平記』B）
    { kind: 'fight', at: ARITA, obj: '有田城を囲む武田の陣の残りを払い、城を救う', title: '有田城', sub: '大将を失った囲みの陣を払う',
      say: [['毛利元就', '有田の城はまだ囲まれておる。囲みの陣を払って、吉川殿を助けよ', 3.4]],
      foes: [{ name: '有田城を囲む武田の手', from: { x: ARITA.x + 8, z: ARITA.z - 4 }, list: [uS(3), uA(13)] }, { name: '囲みの弓', from: { x: ARITA.x - 12, z: ARITA.z + 4 }, list: [uS(1), uB(5)] }],
      reward: '有田城の囲みを払った' },
  ],
  win: {
    banner: '有田中井手の勝ち', sub: '武田元繁は討たれ、武田勢は崩れた', award: '有田中井手で安芸武田の軍を破った',
    say: [['福原広俊', '元繁殿が討たれた。五千の武田が総崩れじゃ', 3.2],
      ['毛利元就', '数ではない。場所と間じゃ。覚えておけ', 3.4],
      ['組頭 与三左', 'お主も、よう伏せて待った。若殿の初陣は大した勝ちじゃ', 3.2]],
  },
});
export default m11_arita;
