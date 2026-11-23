// 上杉編 十二戦目「手取川の戦い」（天正五年〔1577〕九月二十三日・加賀 手取川）。軽い型（light_battle.js）
//   史実：七尾城の救いに北へ上った柴田勝家らの織田勢は、手取川を渡った後に七尾が落ちたと知り、退き始めた。
//   上杉謙信は松任城に入ってこれを追い、雨で水かさの増した手取川で退く織田勢を夜に討ち、多くが川に呑まれた（織田編の手取川の裏側）。
//   出所：Wikipedia「手取川の戦い」・白山市の史跡の案内。戦の大きさは記録が少なく軍記の脚色を含む。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const ODA = { flag: 'oda', armor: 0x2c2c30 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, 60], [-100, 54], [0, 62], [110, 56], [220, 64]];   // 手取川（退く織田勢が北の岸から南へ渡ろうとする川）
const MATTO = { x: 10, z: -90 };        // 松任城の前（織田の物見を払う所）
const FIELD = { x: -10, z: -10 };       // 手取川の北の野（退く織田の後ろ）
const BANK = { x: 20, z: 40 };          // 手取川の岸（渡りかけた織田勢）

export const u12_tedorigawa = lightBattle({
  id: 'u12_tedorigawa',
  date: '天正五年（1577）九月二十三日　秋・雨の夜　加賀国 手取川',
  intro: '七尾城が落ちたと知り、柴田勝家の織田勢は手取川へ退き始めた。上杉謙信は松任城から、雨の夜にこれを追う。',
  history: '天正五年（1577）九月、七尾城を救いに来た柴田勝家らの織田勢は、七尾が落ちたと知って退いた。上杉謙信は松任城から追い、雨で水かさの増した手取川で退く織田勢を夜に討った。多くの兵が川に呑まれた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '柴田勝家の織田勢', mon: 'oda', faction: 'oda' } },
  force: { a: 20000, b: 30000 },
  allyLook: UESUGI, foeLook: ODA,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1577, rain: 0.6, wetStart: 0.9, overcast: true, time: 'night', autumn: true, fogFar: 300,
    sky: { nightLift: 2.6 },   // 11/21 K365 クラウド34：雨で月の光が六割に落ち、844×390 で敵味方が暗い影だった。夜の持ち上げを上限の2.6へ（画質は同じ）
    river: RIVER, riverW: 26, riverDepth: 1.1,
    hills: [[-160, -60, 60, 8], [160, -100, 70, 10], [0, 180, 80, 12]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：松任城の前・手取川の北の野・手取川の岸 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -150], [10, -90], [-10, -10], [20, 40]], w: 3 }],
    groves: [{ x: 0, z: 180, r: 30, n: 30 }, { x: 160, z: -100, r: 30, n: 30 }],
    trees: 360, tufts: 1800,
  },
  allies: [
    { name: '上杉謙信の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉謙信'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉謙信', '織田は七尾が落ちたと知り、手取川へ退いておる', 3.2],
      ['上杉謙信', '雨で川は溢れておる。渡り切る前に追いつけ', 3.2]] },
    { kind: 'fight', at: MATTO, obj: '松任城の前で、織田の物見を払う', title: '松任', sub: '織田の物見が城の前に残っている',
      say: [['組頭', '物見を逃がすな！　本隊に知らせを走らせるな！', 3]],
      foes: [{ name: '織田の物見', from: { x: MATTO.x - 6, z: MATTO.z + 10 }, list: [uS(2), uA(21)] },
        { name: '織田の鉄砲', from: { x: MATTO.x + 16, z: MATTO.z + 14 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: MATTO.x + 30, z: MATTO.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '松任城の前で織田の物見を払った' },
    { kind: 'fight', at: FIELD, obj: '手取川の北の野で、退く織田の殿を崩す', title: '北の野', sub: '雨の中、織田の殿が退きながら構える',
      say: [['上杉謙信の使番', '殿より。殿を割れば、あとは川じゃ', 3.2]],
      foes: [{ name: '織田の殿', from: { x: FIELD.x, z: FIELD.z + 12 }, list: [uS(3), uA(30)] },
        { name: '柴田の鉄砲', from: { x: FIELD.x + 18, z: FIELD.z + 18 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '織田の新手が引き返して来る！'], foes: [{ name: '引き返した織田の手', from: { x: FIELD.x - 30, z: FIELD.z + 30 }, list: [uS(2), uA(18)] }] }],
      reward: '退く織田の殿を崩した' },
    { kind: 'hold', at: FIELD, label: '北の野の陣', obj: '雨の北の野で、引き返す織田勢の反撃を受け止める', r: 18, dur: 90,
      title: '反撃', sub: '退き道を開こうと、織田勢が死に物狂いで引き返す',
      say: [['上杉謙信', '追い詰められた兵は強い。一度受け止めてから押し返せ', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '雨の向こうから織田勢が引き返して来る！'], foes: [{ name: '織田の反撃の手', from: { x: FIELD.x - 8, z: FIELD.z + 40 }, list: [uS(3), uA(27)] }] },
        { t: 40, say: ['組頭', '脇からも来る！　鉄砲を揃えよ！'], foes: [{ name: '佐久間の手', from: { x: FIELD.x + 30, z: FIELD.z + 34 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: FIELD.x - 30, z: FIELD.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '雨の野で織田の反撃を受け止めた' },
    { kind: 'fight', at: BANK, obj: '手取川の岸で、渡りかけた織田勢を討つ', title: '手取川', sub: '溢れた川の前で織田勢が足を止めた',
      say: [['上杉謙信', '川を背にした者は逃げ場が無い。押せ', 3.0]],
      foes: [{ name: '渡りかけた織田勢', from: { x: BANK.x - 6, z: BANK.z + 6 }, list: [uS(3), uA(33)] },
        { name: '柴田勝家の手', from: { x: BANK.x + 16, z: BANK.z + 8 }, list: [uS(4), uA(12)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: BANK.x + 30, z: BANK.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '手取川の岸で織田勢を討った' },
  ],
  // 11/21 cloud-07（司令塔・act bot 324秒「崩れた部隊が、また戦っている」織田の殿・織田の反撃の手 号令 flee）：崩れた織田の組は戦わずに退く。
  //   背を向けるまでの遅れの間に狙いを拾って打ち返していた（山崎と同じ）。崩れた組の逃げていない兵の狙いを毎コマ放す（崩れた組の兵だけ見る。軽い）
  update(rt) {
    const P = rt.player?.u; if (!P || !rt.army) return;
    for (const g of rt.army.groups) if (g.routed && g.team !== P.team) for (const u of g.units) {
      if (u.alive && !u.fleeing) { if (u.target || u.atk) { u.target = null; u.atk = null; u.aiT = 0; } u.cornerUntil = 0; u._fsT = rt.army.time; }
    }
  },
  win: {
    banner: '勝利', sub: '織田勢は溢れた手取川に追い落とされ、多くが川に呑まれた', award: '手取川で織田勢を破った',
    say: [['上杉謙信の使番', '織田勢、川を渡りきれず崩れました', 3.0],
      ['上杉謙信', '信長と聞いていたが、思ったよりも手弱いの', 3.4]],
  },
});
export default u12_tedorigawa;
