// 上杉編 十戦目「尻垂坂の戦い」（元亀三年〔1572〕九月・越中 富山）。軽い型（light_battle.js）
//   史実：武田信玄の誘いで加賀・越中の一向一揆が立ち、上杉方の日宮城を落として富山城に入った。上杉謙信は越中へ出て新庄城に陣を取り、
//   一揆勢が新庄城へ寄せたのを迎え撃ち、富山城の南の尻垂坂で大いに破った。一揆勢は富山城へ退き、のちに和を結んだ。
//   出所：Wikipedia「尻垂坂の戦い」・富山市の史跡の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const IKKO = { flag: 'ikko', armor: 0x5a5448 };
const SPAWN = { x: 0, z: -140 };
const RIVER = [[-60, 220], [-50, 100], [-70, 0], [-56, -100], [-66, -220]];   // 神通川（西の富山城の側）
const SHINJO = { x: 20, z: -100 };      // 新庄城の前（一揆を受ける所）
const SAKA = { x: 0, z: -10 };          // 尻垂坂
const TOYAMA = { x: -30, z: 80 };       // 富山城の東の口
// K652②（11/25 Sanae・家の編を10分前後に）：史実の流れ。一揆勢は神通川の舟で富山城と行き来した。尻垂坂は雨の泥の坂で、崩れた一揆勢が尻を滑らせて
//   落ちたのが名のもとと伝わる（地名の言い伝え）。逸話の段（K652⑥）＝泥の坂の下の田で、滑り落ちた一揆勢を討つ。富山城へ逃げ込んだ後は、坊官の打って出を受ける
const FUNE = { x: -38, z: -62 };        // 神通川の東の岸の舟寄せ
const DORO = { x: 30, z: 30 };          // 尻垂坂の下の泥の田
const JINTO = { x: -8, z: 46 };         // 富山城の東の囲みの陣

export const u10_shiritarezaka = lightBattle({
  id: 'u10_shiritarezaka',
  date: '元亀三年（1572）九月　秋・曇り　越中国 尻垂坂',
  intro: '武田信玄の誘いで、越中の一向一揆が富山城に入った。上杉謙信は新庄城に陣を取り、一揆勢を迎え撃つ。',
  history: '元亀三年（1572）、武田信玄の誘いで加賀・越中の一向一揆が立ち、富山城に入った。上杉謙信は越中へ出て新庄城に陣を取り、寄せて来た一揆勢を富山城の南の尻垂坂で大いに破った。一揆勢は富山城へ退いた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '越中の一向一揆', mon: 'ikko', faction: 'ikko' } },
  force: { a: 12000, b: 15000 },
  allyLook: UESUGI, foeLook: IKKO,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  allyDmg: 0.2,   // 11/21 cloud-07 の見つけ「斬り合う相手が少ない」：味方が先に討ち切らないよう味方の刃を 0.4→0.2（0.3 でも本人の討ち取り2だった）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1572, overcast: true, time: 'day', autumn: true, fogFar: 420,
    river: RIVER, riverW: 20, riverDepth: 0.8,
    hills: [[60, -20, 40, 10], [90, 60, 60, 14], [140, -140, 70, 18], [-140, 140, 60, 8]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：新庄城の前・尻垂坂・富山城の東の口 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -140], [20, -100], [0, -10], [-30, 80]], w: 3 }, { pts: [[20, -100], [-38, -62]], w: 3 }, { pts: [[0, -10], [30, 30], [-8, 46]], w: 3 }],
    groves: [{ x: 140, z: -140, r: 30, n: 30 }, { x: 90, z: 60, r: 30, n: 30 }],
    trees: 420, tufts: 2000,
  },
  allies: [
    { name: '上杉謙信の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉謙信'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉謙信', '一揆どもが富山の城を出て、この新庄へ寄せて来る', 3.4],
      ['上杉謙信', '城の前で受け止め、坂の上へ押し返せ', 3.2]] },
    { kind: 'hold', at: SHINJO, label: '新庄城の前', obj: '新庄城の前で、一揆勢の寄せを受け止める', r: 18, dur: 100,
      title: '新庄城', sub: '念仏を唱えながら一揆勢が寄せて来る',
      say: [['組頭', '数は多いが具足は薄い！　槍を揃えて受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '一揆勢じゃ！　北から押し寄せるぞ！'], foes: [{ name: '一揆の先手', from: { x: SHINJO.x - 6, z: SHINJO.z + 40 }, list: [uS(2), uA(36)] }] },
        { t: 34, say: ['組頭', '脇からも来る！　弓を射させるな！'], foes: [{ name: '一揆の弓と鉄砲', from: { x: SHINJO.x + 30, z: SHINJO.z + 34 }, list: [uS(1), { type: 'bow', n: 6 }, uG(4)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: SHINJO.x - 30, z: SHINJO.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '新庄城の前で一揆勢を受け止めた' },
    { kind: 'fight', at: FUNE, obj: '神通川の舟寄せで、一揆の舟と守りの兵を払う', title: '神通川の舟', sub: '一揆勢は舟で富山の城と行き来する',
      say: [['上杉謙信の使番', '殿より。川の舟を焼け。富山へ兵と米を運ばせるな', 3.4]],
      foes: [{ name: '舟寄せの一揆', from: { x: FUNE.x + 4, z: FUNE.z + 12 }, list: [uS(2), uA(24)] },
        { name: '舟の上の弓', from: { x: FUNE.x - 10, z: FUNE.z + 18 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      later: [{ t: 40, say: ['見張り', '川上から舟で新手が来る！'], foes: [{ name: '舟の新手', from: { x: FUNE.x - 6, z: FUNE.z + 40 }, list: [uS(2), uA(16)] }] }],
      reward: '神通川の舟を焼いた' },
    { kind: 'fight', at: SAKA, obj: '尻垂坂で、一揆勢の本隊を崩す', title: '尻垂坂', sub: '一揆勢の本隊が坂に構える',
      say: [['上杉謙信', '今じゃ。坂を駆け上がり、一揆の本隊を割れ', 3.2]],
      foes: [{ name: '一揆の本隊', from: { x: SAKA.x, z: SAKA.z + 12 }, list: [uS(3), uA(36)] },
        { name: '一揆の坊官の手', from: { x: SAKA.x + 18, z: SAKA.z + 20 }, list: [uS(3), uA(12)] }],
      later: [{ t: 35, say: ['組頭', '富山の城から新手が出たぞ！'], foes: [{ name: '富山城の新手', from: { x: SAKA.x - 30, z: SAKA.z + 40 }, list: [uS(2), uA(21)] }] }],
      reward: '尻垂坂で一揆の本隊を崩した' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'fight', at: DORO, obj: '泥の坂の下の田で、滑り落ちた一揆勢を討つ', title: '泥の坂', sub: '雨の泥で、崩れた一揆勢が坂を尻から滑り落ちる',
      say: [['組頭', '見よ、一揆どもが尻を垂れて坂を滑り落ちていく！', 3.2], ['上杉謙信', '下の田で受けよ。立ち直らせるな', 3]],
      foes: [{ name: '坂を落ちた一揆', from: { x: DORO.x - 6, z: DORO.z - 14 }, list: [uS(2), uA(26)] },
        { name: '坂の上の一揆の弓', from: { x: DORO.x + 18, z: DORO.z - 22 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 35, say: ['組頭', '坊官が立て直しに来る！'], foes: [{ name: '一揆の坊官の立て直し', from: { x: DORO.x + 30, z: DORO.z + 10 }, list: [uS(3), uA(12)] }] }],
      reward: '泥の坂の下で一揆勢を討った' },
    { kind: 'fight', at: TOYAMA, obj: '富山城の東の口まで、退く一揆勢を追う', title: '富山城', sub: '一揆勢が富山城へ逃げ込む',
      say: [['上杉謙信の使番', '殿より。城の口まで追い、二度と出て来られぬよう叩け', 3.2]],
      foes: [{ name: '一揆の殿', from: { x: TOYAMA.x + 6, z: TOYAMA.z - 6 }, list: [uS(3), uA(27)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: TOYAMA.x + 30, z: TOYAMA.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '退く一揆勢を富山城へ追い込んだ' },
    { kind: 'hold', at: JINTO, label: '富山城の東の陣', obj: '富山城の東の陣で、城から打って出る坊官の手を受ける', r: 16, dur: 75,
      title: '坊官の打って出', sub: '富山城に逃げ込んだ一揆勢が、念仏を唱えて打って出る',
      say: [['上杉謙信', '城を囲む。打って出れば叩け。一揆の心を折る', 3.2]],
      waves: [
        { t: 6, say: ['一揆の坊官', '進めば極楽、退けば地獄じゃ！　打って出よ！'], foes: [{ name: '富山城の坊官の手', from: { x: JINTO.x - 16, z: JINTO.z + 34 }, list: [uS(3), uA(24)] }] },
        { t: 36, say: ['見張り', '城の北の口からも出てきた！'], foes: [{ name: '富山城の北の口の一揆', from: { x: JINTO.x + 24, z: JINTO.z + 38 }, list: [uS(2), uA(16), { type: 'bow', n: 4 }] }] }],
      reward: '富山城の打って出を受け止めた' },
  ],
  win: {
    banner: '勝利', sub: '一揆勢は富山城へ退いた。越中の一揆の勢いは尻垂坂で折れた', award: '尻垂坂で一揆勢を破った',
    say: [['上杉謙信の使番', '一揆勢は富山の城へ逃げ込みました', 3.0],
      ['上杉謙信', '信玄の仕掛けた火は消した。越中はこれで静まろう', 3.4]],
  },
});
export default u10_shiritarezaka;
