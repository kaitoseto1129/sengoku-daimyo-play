// 毛利家編 四戦目「須々万城の戦い」（弘治三年〔1557〕・周防国 須々万城）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：大内義長を滅ぼした毛利元就は、防長経略の残りで山口の北東の須々万城（山崎興盛ら・大内方の残党）を囲んだ。
//   城は山の上で堅く、毛利は城の水の手（谷の水源）を断って落とした（『陰徳太平記』B・周南市の解説C。城方約二千・毛利約一万は推）。
//   仕組み：水の手の谷の番兵を討ち → 守りの備の一つへ調略の糸（降る） → 曲輪の大手 → 山崎興盛。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const SUE = { flag: 'sue', armor: 0x3a2a26 };   // 大内方の残党＝大内菱（sue）
const SPAWN = { x: 90, z: 60 };            // 毛利の東の陣
const MIZU = { x: -70, z: 34 };            // 西の谷の水の手
const SIDE = { x: -6, z: -22 };            // 守りの備（降らせる）
const GATE = { x: -20, z: -70 };           // 山の曲輪の大手
const HONMARU = { x: -30, z: -110 };       // 山崎興盛の本丸
const NUMA = { x: 40, z: 22 };             // 城の前の沼（竹と草を敷いて道を作る所・K652②）
const DEMARU = { x: 40, z: -40 };          // 沼の向こうの出丸（K652②）

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-12, -60], [8, -70], [-34, -100]]) rt.scene.add(yagura(W, dx, dz, { rot: 0 }));
    rt.scene.add(palisade(W, [-40, -72, 6, -72], { solid: true, h: 2.4 }));
    for (const [dx, dz] of [[-4, 4], [6, 8]]) rt.scene.add(nobori(W, SIDE.x + dx, SIDE.z + dz, 'sue', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m04_susuma = lightBattle({
  id: 'm04_susuma',
  date: '弘治三年（1557）　昼　周防国 須々万城',
  intro: '大内の残党が須々万の山城に籠もった。元就は城の水の手を断ち、守りの備の一つへ密書を送って城を弱らせる。',
  history: '弘治三年（1557）、大内義長を滅ぼした毛利元就は、防長の残りを平らげにかかった。山崎興盛ら大内方の残党は、山の上の須々万城に籠もった。山城は堅く、力攻めでは落ちない。毛利勢は城の西の谷から水の手を断ち、同時に守りの備へ調略を掛けた。水に困った城は、ついに力尽きた（『陰徳太平記』B・周南市の解説C。城方約二千・毛利約一万は推・要確認）。',
  sides: { a: { name: '毛利元就の軍', mon: 'mori', faction: 'mori' }, b: { name: '山崎興盛の城方', mon: 'sue', faction: 'ouchi' } },
  force: { a: 10000, b: 2000 },
  allyLook: MORI, foeLook: SUE,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.25 },
  world: {
    seed: 1557, time: 'day', fogFar: 400,
    hills: [[-20, -100, 62, 26], [-60, -40, 40, 14], [-90, 30, 46, 10], [120, 40, 56, 12], [60, -90, 44, 12]],
    paths: [{ pts: [[90, 60], [40, 40], [-70, 34]], w: 2.6 }, { pts: [[40, 40], [-6, -22], [-20, -70], [-30, -110]], w: 3 }],
    groves: [{ x: -110, z: 10, r: 34, n: 30 }, { x: 100, z: -20, r: 32, n: 28 }, { x: 40, z: 100, r: 30, n: 26 }],
    trees: 420, tufts: 1800,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '毛利隆元の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 10 }, list: [busho('毛利隆元'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  turncoats: [{ key: 'susuma_bi', name: '須々万の守りの備', at: SIDE, face: Math.PI * 1.5, list: [uS(2), uA(12), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'sue', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '須々万は山の城じゃ。登れば登るほど、こちらが削られる', 3.6],
      ['毛利隆元', '父上、水の手は西の谷にございます。あそこを断てば、城は渇きます', 3.4],
      ['毛利元就', 'うむ。お主、谷へ走れ。水の手の番兵を追え', 3.4]] },
    // K652②（11/25 Sanae・10分）：須々万の沼城は深い沼に囲まれ、一度目の攻めは沼に足を取られて退いた。二度目は竹や草を沼に敷いて道を作った（『陰徳太平記』B）
    { kind: 'hold', at: NUMA, label: '沼の縁', obj: '沼に竹と草を敷く間、城から打って出る手を受け止める', r: 16, dur: 60, limit: 110,
      title: '沼の道', sub: '一度は沼に阻まれた。今度は道を作って攻める',
      say: [['毛利隆元', '竹と草を沼へ投げ込め！　道ができるまで、ここを守れ', 3.4]],
      waves: [{ t: 6, say: ['城方の侍', '沼に落とせ！　毛利の道を壊せ！'], foes: [{ name: '沼へ打って出る城方', from: { x: NUMA.x - 6, z: NUMA.z - 40 }, list: [uS(3), uA(13)] }] },
        { t: 34, say: ['組頭', '城の弓が来るぞ！　竹束の陰へ！'], foes: [{ name: '城方の弓の手', from: { x: NUMA.x + 14, z: NUMA.z - 38 }, list: [uS(1), uA(6), uB(6)] }] }],
      reward: '沼に道を作る間、城方の手を受け止めた' },
    { kind: 'fight', at: MIZU, obj: '西の谷へ回り、水の手の番兵を討つ', title: '水の手', sub: '城の水を断つ',
      say: [['毛利元就', '谷の水は城の命じゃ。番兵を追い払い、水を押さえよ', 3.2]],
      foes: [{ name: '水の手の番兵', from: { x: MIZU.x - 6, z: MIZU.z - 6 }, list: [uS(3), uA(12), uB(4)] }],
      reward: '西の谷の水の手を断った' },
    { kind: 'fight', at: DEMARU, obj: '沼を渡り、城の前の出丸を落とす', title: '出丸', sub: '沼の道を渡って、城の前の出丸へ',
      say: [['毛利元就', '道はできた。出丸を落とせば、城の中腹まで手が届く', 3.4]],
      foes: [{ name: '出丸の城方', from: { x: DEMARU.x - 4, z: DEMARU.z - 8 }, list: [uS(3), uA(14)] }, { name: '出丸の弓', from: { x: DEMARU.x + 10, z: DEMARU.z - 12 }, list: [uS(1), uB(5)] }],
      reward: '沼の向こうの出丸を落とした' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'chouryaku', target: 'susuma_bi', at: SIDE, label: '守りの備', obj: '山の中腹の守りの備へ、密書を届ける', r: 9, max: 90,
      say: [['毛利元就', '水が絶えれば、城の者の心は揺れる。あの備の頭へ、この書状を渡せ', 3.8]],
      turnSay: ['守りの備の頭', '水も無く、主家も無い。毛利殿に付こう', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、須々万の守りの備を毛利に付けた' },
    { kind: 'fight', at: GATE, obj: '山の曲輪の大手を破る', title: '大手', sub: '曲輪の大手を攻め上る',
      say: [['毛利隆元', '備が寝返った！　今のうちに大手を破れ！', 3.2]],
      foes: [{ name: '大手の城方', from: { x: GATE.x + 4, z: GATE.z - 8 }, list: [uS(3), uA(16)] }, { name: '城の弓', from: { x: GATE.x - 12, z: GATE.z - 14 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '曲輪から新手が出て来るぞ！'], foes: [{ name: '城方の新手', from: { x: GATE.x + 16, z: GATE.z - 22 }, list: [uS(2), uA(12)] }] }],
      reward: '須々万城の大手を破った' },
    { kind: 'hold', at: GATE, label: '大手の内', obj: '本丸から出る城方の決死の反撃を受け止める', r: 16, dur: 60,
      title: '決死の反撃', sub: '山崎興盛が打って出る',
      say: [['毛利隆元', '興盛が出て来た！　槍を揃えよ！', 3.2]],
      waves: [{ t: 6, say: ['山崎興盛', '水は無くとも、意地は枯れぬ！　出よ！'], foes: [{ name: '山崎興盛の旗本', from: { x: GATE.x - 10, z: GATE.z - 34 }, list: [uS(3), uA(14)] }] }],
      reward: '山崎興盛の反撃を大手の内で受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GATE.x - 20, z: GATE.z + 30 }, obj: '谷の道で、荷を運ぶ城方の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '荷駄を止めよ', 3.2]],
      foes: [{ name: '荷を運ぶ足軽', from: { x: GATE.x - 8, z: GATE.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '谷の道の荷駄を止めた' },
    { kind: 'hold', at: { x: GATE.x + 30, z: GATE.z + 20 }, label: '沼の際で、竹', obj: '沼の際で、竹と草を敷く間、城から出る兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '城から打って出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '城から出る兵', from: { x: GATE.x + 42, z: GATE.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '城から出る兵', from: { x: GATE.x + 16, z: GATE.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '沼の際を守った' },
    { kind: 'fight', at: { x: GATE.x + 10, z: GATE.z - 30 }, obj: '本丸の下の曲輪で、最後の城兵を押し破る', max: 100, limit: 90,
      say: [['組頭', '本丸はそこじゃ。押せ', 3.2]],
      foes: [{ name: '最後の城兵', from: { x: GATE.x + 22, z: GATE.z - 42 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '本丸の下の曲輪を取った' },
    { kind: 'fight', at: HONMARU, obj: '本丸へ攻め入り、山崎興盛の手を崩す', title: '本丸', sub: '山の城の最後の曲輪',
      say: [['毛利元就', '本丸じゃ。水の無い城は、もう長くは持たぬ', 3.2]],
      foes: [{ name: '本丸の城方', from: { x: HONMARU.x + 6, z: HONMARU.z - 6 }, list: [uS(4), uA(12)] }],
      reward: '須々万城の本丸を崩した' },
  ],
  win: {
    banner: '須々万城の勝ち', sub: '水の手を断たれた城は落ちた', award: '須々万城を落として防長を平らげた',
    say: [['毛利隆元', '須々万、落ちましたぞ。これで防長は静まります', 3.2],
      ['毛利元就', '山の城は、水と人の心を押さえれば落ちる。よい手伝いをした', 3.6],
      ['組頭 与三左', 'お主の届けた書状と、谷を押さえた働きが効いた', 3.2]],
  },
});
export default m04_susuma;
