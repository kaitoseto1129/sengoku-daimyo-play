// 上杉編 七戦目「塩崎の対陣」（第五次川中島・永禄七年〔1564〕八月〜十月・信濃国 塩崎）。軽い型（light_battle.js）
//   史実：上杉輝虎は川中島へ出て、武田信玄は塩崎城（いま長野市篠ノ井塩崎）に陣を構えた。両軍は六十日ほど向き合ったが、
//   大きな戦いは起きず、どちらも兵を退いた。これが川中島での最後の対陣になった。
//   ※ 対陣の間の小競り合いの細かな記録は少ない。ここでは「物見の追い払い→夜討ちを受ける→退く時の殿」の形に推した（決戦は無い）。
//   出所：Wikipedia「川中島の戦い」（第五次合戦）・長野市の塩崎城跡の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 0, z: -150 };
const RIVER = [[-220, 10], [-110, 4], [0, 12], [110, 2], [220, 8]];   // 犀川と千曲川の間の流れ（両陣の間）
const MONOMI = { x: -30, z: -60 };      // 川の手前の物見の場
const ASASE = { x: 30, z: -14 };        // 川の浅瀬の南の岸（武田の先手が渡ってくる所）
const JIN = { x: 10, z: -120 };         // 上杉の陣（夜討ちを受ける所）
const SHINGARI = { x: -20, z: -175 };   // 退く道の殿の場

export const u07_shiozaki = lightBattle({
  id: 'u07_shiozaki',
  date: '永禄七年（1564）八月　夏の終わり・晴れ　信濃国 塩崎',
  intro: '上杉輝虎は五たび川中島へ出た。武田信玄は塩崎の城に陣を構え、川を挟んで動かない。',
  history: '永禄七年（1564）、上杉輝虎は川中島へ出て、武田信玄は塩崎城に陣を構えた。両軍は六十日ほど向き合ったが大きな戦いは起きず、どちらも兵を退いた。これが川中島での最後の対陣となった。',
  sides: { a: { name: '上杉輝虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 10000, b: 15000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1564, time: 'day', fogFar: 460,
    river: RIVER, riverW: 16, riverDepth: 0.7,
    hills: [[60, 120, 70, 20], [-120, 140, 60, 14], [-160, -120, 50, 8], [140, -60, 40, 6]],
    trees: 520, tufts: 2000,
  },
  allies: [
    { name: '上杉輝虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉輝虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉輝虎', '信玄は塩崎の城に籠もって出てこぬ。こちらから川を越えれば、また八幡原の二の舞じゃ', 3.6],
      ['上杉輝虎', '川の手前に出た武田の物見を追い払え。陣を覗かせるな', 3.4]] },
    { kind: 'fight', at: MONOMI, obj: '川の手前で、武田の物見を追い払う', title: '川の手前', sub: '武田の物見が川を渡ってきた',
      say: [['組頭', '物見じゃ！　川へ追い返せ！', 3]],
      foes: [
        { name: '武田の物見', from: { x: MONOMI.x + 6, z: MONOMI.z + 10 }, list: [uS(2), uA(16)] },
        { name: '武田の物見の弓', from: { x: MONOMI.x + 22, z: MONOMI.z + 16 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      reward: '川の手前で武田の物見を追い払った' },
    { kind: 'fight', at: ASASE, obj: '浅瀬の岸で、渡ってきた武田の先手を押し返す', title: '浅瀬', sub: '武田の先手が浅瀬を渡り、こちらの岸に取り付く',
      say: [['上杉輝虎の使番', '殿より。岸に上がらせるな。渡り切る前に押し返せ', 3.2]],
      foes: [
        { name: '武田の先手', from: { x: ASASE.x - 4, z: ASASE.z + 22 }, list: [uS(3), uA(20)] },
        { name: '武田の鉄砲', from: { x: ASASE.x + 20, z: ASASE.z + 30 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['組頭', '上手からも渡ってくるぞ！'], foes: [{ name: '武田の上手の槍', from: { x: ASASE.x - 40, z: ASASE.z + 24 }, list: [uS(2), uA(14)] }] }],
      reward: '浅瀬の岸で武田の先手を押し返した' },
    { kind: 'hold', at: JIN, label: '上杉の陣', obj: '陣へ戻り、武田の夜討ちを受け止める', r: 18, dur: 85,
      title: '対陣', sub: '向き合ったまま日が過ぎる。武田が夜討ちを仕掛ける',
      say: [['上杉輝虎', '深追いはせぬ。陣を固めよ。信玄は根比べのつもりじゃ', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '夜討ちじゃ！　川の方から武田が来るぞ！'], foes: [{ name: '武田の夜討ち', from: { x: JIN.x - 12, z: JIN.z + 46 }, list: [uS(3), uA(20)] }] },
        { t: 40, say: ['組頭', '二の手が来る！　陣を崩すな！'], foes: [{ name: '武田の夜討ち 二の手', from: { x: JIN.x + 26, z: JIN.z + 42 }, list: [uS(2), uA(12), uG(4)] }] }],
      reward: '陣で武田の夜討ちを受け止めた' },
    { kind: 'fight', at: SHINGARI, obj: '退く道の殿で、追ってくる武田を止める', title: '退く道', sub: '六十日の対陣の末、上杉は兵を退く',
      say: [['上杉輝虎の使番', '殿より。越後へ退く。殿の組は追手を止めよ', 3.2]],
      foes: [{ name: '武田の追手', from: { x: SHINGARI.x + 8, z: SHINGARI.z + 30 }, list: [uS(3), uA(22)] }],
      later: [{ t: 30, say: ['組頭', '騎馬が来るぞ！　槍を揃えよ！'], foes: [{ name: '武田の追手の騎馬', from: { x: SHINGARI.x - 20, z: SHINGARI.z + 34 }, list: [uS(1), { type: 'cavalry', n: 5 }] }] }],
      reward: '退く道で武田の追手を止めた' },
  ],
  win: {
    banner: '双方、兵を退く', sub: '六十日の対陣は、決戦の無いまま終わった', award: '塩崎の対陣を守り抜いた',
    say: [['上杉輝虎の使番', '武田も塩崎の城から兵を退きまする', 3.2],
      ['上杉輝虎', '川中島はこれで終いじゃ。次は関東を固める', 3.4]],
  },
});
export default u07_shiozaki;
