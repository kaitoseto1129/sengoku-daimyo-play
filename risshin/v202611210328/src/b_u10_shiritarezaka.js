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

export const u10_shiritarezaka = lightBattle({
  id: 'u10_shiritarezaka',
  date: '元亀三年（1572）九月　秋・曇り　越中国 尻垂坂',
  intro: '武田信玄の誘いで、越中の一向一揆が富山城に入った。上杉謙信は新庄城に陣を取り、一揆勢を迎え撃つ。',
  history: '元亀三年（1572）、武田信玄の誘いで加賀・越中の一向一揆が立ち、富山城に入った。上杉謙信は越中へ出て新庄城に陣を取り、寄せて来た一揆勢を富山城の南の尻垂坂で大いに破った。一揆勢は富山城へ退いた。',
  sides: { a: { name: '上杉謙信の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '越中の一向一揆', mon: 'ikko', faction: 'ikko' } },
  force: { a: 12000, b: 15000 },
  allyLook: UESUGI, foeLook: IKKO,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1572, time: 'day', autumn: true, fogFar: 420,
    river: RIVER, riverW: 20, riverDepth: 0.8,
    hills: [[60, -20, 40, 10], [90, 60, 60, 14], [140, -140, 70, 18], [-140, 140, 60, 8]],
    trees: 480, tufts: 2000,
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
    { kind: 'fight', at: SAKA, obj: '尻垂坂で、一揆勢の本隊を崩す', title: '尻垂坂', sub: '一揆勢の本隊が坂に構える',
      say: [['上杉謙信', '今じゃ。坂を駆け上がり、一揆の本隊を割れ', 3.2]],
      foes: [{ name: '一揆の本隊', from: { x: SAKA.x, z: SAKA.z + 12 }, list: [uS(3), uA(36)] },
        { name: '一揆の坊官の手', from: { x: SAKA.x + 18, z: SAKA.z + 20 }, list: [uS(3), uA(12)] }],
      later: [{ t: 35, say: ['組頭', '富山の城から新手が出たぞ！'], foes: [{ name: '富山城の新手', from: { x: SAKA.x - 30, z: SAKA.z + 40 }, list: [uS(2), uA(21)] }] }],
      reward: '尻垂坂で一揆の本隊を崩した' },
    { kind: 'fight', at: TOYAMA, obj: '富山城の東の口まで、退く一揆勢を追う', title: '富山城', sub: '一揆勢が富山城へ逃げ込む',
      say: [['上杉謙信の使番', '殿より。城の口まで追い、二度と出て来られぬよう叩け', 3.2]],
      foes: [{ name: '一揆の殿', from: { x: TOYAMA.x + 6, z: TOYAMA.z - 6 }, list: [uS(3), uA(27)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: TOYAMA.x + 30, z: TOYAMA.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '退く一揆勢を富山城へ追い込んだ' },
  ],
  win: {
    banner: '勝利', sub: '一揆勢は富山城へ退いた。越中の一揆の勢いは尻垂坂で折れた', award: '尻垂坂で一揆勢を破った',
    say: [['上杉謙信の使番', '一揆勢は富山の城へ逃げ込みました', 3.0],
      ['上杉謙信', '信玄の仕掛けた火は消した。越中はこれで静まろう', 3.4]],
  },
});
export default u10_shiritarezaka;
