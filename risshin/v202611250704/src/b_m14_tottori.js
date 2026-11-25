// 毛利家編 十四戦目「鳥取城救援の戦い」（天正九年〔1581〕七〜十月・因幡国 鳥取城）。軽い型（light_battle.js）・K647（docs/house_mori.md ⑥）
//   史実：吉川経家が入った鳥取城を、羽柴秀吉は米を買い占め（因幡の米を高く買う）、周りを柵で囲んで飢えさせた。毛利は救援の兵を出したが、
//   羽柴方の水軍と柵に阻まれて城へ兵糧を入れられず、城は飢えて開き、経家は自害した（『信長公記』A・『陰徳太平記』B・鳥取市の解説C。兵数は毛利約八千・羽柴約二万で推）。
//   仕組み：毛利が「負ける側」の戦（第二次木津川口・第一次月山と同じ）。海から着いて城へ荷駄を通そうとする→羽柴の囲みに阻まれ→荷駄を守り→退く。勝ちは「生きて退く」。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const HASHIBA = { flag: 'oda', armor: 0x3a3630 };
const SPAWN = { x: 90, z: -50 };           // 毛利の救援隊の上陸した浜辺
const KAKOMI = { x: 20, z: -10 };          // 羽柴の柵の囲み
const NIDAI = { x: 10, z: 24 };            // 荷駄を守る所
const EXIT = { x: 150, z: -60 };           // 退き口（浜へ）

function scene(rt) {
  const W = rt.world;
  try {
    rt.scene.add(palisade(W, [KAKOMI.x - 40, KAKOMI.z - 10, KAKOMI.x + 40, KAKOMI.z - 10], { solid: true, h: 2.4 }));
    for (const [dx, dz] of [[-4, -22], [8, -24]]) rt.scene.add(nobori(W, KAKOMI.x + dx, KAKOMI.z + dz, 'oda', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m14_tottori = lightBattle({
  id: 'm14_tottori',
  date: '天正九年（1581）十月　昼　因幡国 鳥取城',
  intro: '吉川経家が入った鳥取城は、羽柴秀吉の囲みで飢えている。毛利は荷駄を運んで城を救おうとする。しくじれば城が飢え死ぬ。',
  history: '天正九年（1581）、羽柴秀吉は因幡の米を買い占め、鳥取城の周りを柵で囲んで飢えさせた。城には吉川経家が入っていた。毛利は救援の兵を出して兵糧を運ぼうとしたが、羽柴方の囲みと水軍に阻まれて城へ入れなかった。城は飢えて開き、経家は自害した。補給の道を断たれた城の悲しい戦である（『信長公記』・鳥取市の解説。兵数は推）。',
  sides: { a: { name: '毛利の救援の軍', mon: 'mori', faction: 'mori' }, b: { name: '羽柴の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 8000, b: 20000 },
  allyLook: MORI, foeLook: HASHIBA,
  thick: true,
  allyDmg: 0.3,
  foeDmg: 0.8,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.1 },
  world: {
    seed: 1581, time: 'day', fogFar: 320, overcast: true,
    river: [[-200, 96], [-60, 90], [60, 94], [200, 88]], riverW: 16, riverDepth: 0.4,
    hills: [[-100, -60, 56, 24], [-30, -70, 40, 14], [140, 30, 44, 8], [-150, 40, 46, 8]],
    paths: [{ pts: [[90, -50], [20, -10], [10, 24], [-40, -50]], w: 2.8 }, { pts: [[20, -10], [90, -40], [150, -60]], w: 2.6 }],
    groves: [{ x: 110, z: 20, r: 30, n: 24 }, { x: -120, z: 20, r: 32, n: 26 }, { x: 0, z: 90, r: 28, n: 20 }],
    trees: 360, tufts: 1500,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '荷駄隊', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [uS(2), uA(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['吉川元春', '経家殿の城は、米が尽きかけておる。荷駄を一つでも多く通さねばならぬ', 3.6],
      ['小早川隆景', '羽柴は戦わぬ。柵と海で、城を飢えさせる。力で破れる囲みではない', 3.6],
      ['組頭', '柵の切れ目を探す。荷駄を離すな', 3.2]] },
    { kind: 'fight', at: KAKOMI, obj: '羽柴の柵の囲みを攻め、荷駄の道を開く', title: '柵の囲み', sub: '羽柴は柵の中から、弓と鉄砲で待つ',
      say: [['吉川元春', '柵の守りを崩せ。道が開けば荷駄が通る', 3.2]],
      foes: [{ name: '羽柴の柵の備', from: { x: KAKOMI.x + 4, z: KAKOMI.z - 12 }, list: [uS(3), uA(14)] }, { name: '羽柴の弓・鉄砲', from: { x: KAKOMI.x - 10, z: KAKOMI.z - 18 }, list: [uS(1), uB(10)] }],
      later: [{ t: 40, say: ['組頭', '柵の奥から新手が出るぞ！'], foes: [{ name: '羽柴の新手', from: { x: KAKOMI.x - 18, z: KAKOMI.z - 32 }, list: [uS(2), uA(12)] }] }],
      reward: '羽柴の柵の囲みを一か所破った' },
    { kind: 'hold', at: NIDAI, label: '荷駄の道', obj: '荷駄を通す間、羽柴の押し返しを受け止める', r: 18, dur: 65,
      title: '荷駄', sub: '羽柴は囲みを締め直しに来る',
      say: [['吉川元春', '荷駄が通る！　道を空けるな！', 3.2]],
      waves: [
        { t: 6, say: ['羽柴の侍', '兵糧を城へ入れさせるな！　押し返せ！'], foes: [{ name: '羽柴の押し返し', from: { x: NIDAI.x - 6, z: NIDAI.z + 40 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', '横から新手じゃ！　荷駄を守れ！'], foes: [{ name: '羽柴の横手の備', from: { x: NIDAI.x + 24, z: NIDAI.z + 34 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '荷駄の道を守り、押し返しを受け止めた' },
    { kind: 'move', at: EXIT, label: '退き口', obj: '羽柴の新手が来る前に、浜へ退く', r: 14, max: 140,
      say: [['小早川隆景', '城へ届いた米は、いくらもあるまい。これ以上は無理じゃ。退くぞ', 3.4], ['組頭', '羽柴の大軍が後ろから来る！　走れ！', 3]] },
    { kind: 'fight', at: EXIT, obj: '追ってくる羽柴の手を払い、舟へ退く', title: '殿', sub: '城を救えなかった軍の殿',
      say: [['吉川元春', '経家殿に申し訳が立たぬ。だが兵を無駄に失ってはならぬ', 3.4]],
      foes: [{ name: '羽柴の追手', from: { x: EXIT.x - 40, z: EXIT.z + 20 }, list: [uS(3), uA(14)] }],
      reward: '追手を払って浜へ退いた' },
  ],
  win: {
    banner: '鳥取城救援の負け', sub: '兵糧は届かず、毛利は浜へ退いた', award: '鳥取城救援の負け戦を生き延びて退いた',
    say: [['吉川元春', '囲まれた城は、戦わずに落ちる。補給の道を断たれる怖さを知った', 3.4],
      ['小早川隆景', '経家殿は城兵の命と引き換えに腹を召された。忘れてはならぬ', 3.4],
      ['組頭 与三左', 'よう生きて戻った。この悔しさが、次の戦で効くのじゃ', 3.2]],
  },
});
export default m14_tottori;
