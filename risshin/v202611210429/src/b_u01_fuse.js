// 上杉編 一戦目「布施の戦い」（第一次川中島・天文二十二年〔1553〕八月）。軽い型（light_battle.js）で書いた最初の戦（K563）
//   史実：村上義清らの求めで長尾景虎（のちの上杉謙信）が北信濃へ出陣。善光寺の南から犀川を越え、布施（今の長野市篠ノ井布施）で
//   武田晴信の先手を破り、八幡のあたりでも勝ったが、晴信は塩田城に籠もって決戦を避け、景虎は九月に越後へ戻った。
//   出所：『高白斎記』（武田方の記録）・長野市の史跡の案内（布施・八幡原）。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 0, z: -130 };
const RIVER = [[-200, -86], [-80, -80], [0, -84], [90, -78], [200, -82]];   // 犀川（南の善光寺の側から北の布施へ渡る浅瀬）
const FORD = { x: 4, z: -60 };          // 犀川の向こう岸
const FUSE = { x: -6, z: -6 };          // 布施の野
const HOLD = { x: 10, z: 26 };          // 布施の北の畑の畦
const HACHIMAN = { x: 34, z: 86 };      // 八幡の社の前

export const u01_fuse = lightBattle({
  id: 'u01_fuse',
  date: '天文二十二年（1553）八月　晴れ　信濃国 布施',
  intro: '村上義清に頼まれ、長尾景虎は越後から北信濃へ出た。武田晴信の先手が犀川の向こうの布施に陣を張っている。',
  history: '天文二十二年（1553）、武田晴信に追われた村上義清は越後の長尾景虎を頼った。八月、景虎は北信濃へ出陣し、布施で武田の先手を破り、八幡のあたりでも勝った。晴信は塩田城に籠もって戦を避け、景虎は九月に越後へ戻った。これが十二年に及ぶ川中島の戦いの始まりである。',
  sides: { a: { name: '長尾景虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田晴信の先手', mon: 'takeda', faction: 'takeda' } },
  force: { a: 8000, b: 6000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  thick: true,   // 型の受けの段の厚み（三の手・新手）を使う
  allyDmg: 0.3,   // 味方の刃（11/21 型の既定 0.4 では味方が先に討ち切り、本人の討ち取りが少なかった）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1553, time: 'day', autumn: false, fogFar: 460,
    river: RIVER, riverW: 14, riverDepth: 0.6,
    hills: [[-150, 60, 60, 14], [160, 110, 70, 18], [60, 150, 50, 10], [-60, 170, 60, 12]],
    trees: 520, tufts: 2000,
  },
  allies: [
    { name: '長尾景虎の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z - 10 }, fixed: true, list: [busho('長尾景虎'), uS(6), uA(10)] },
    { name: '村上義清の手', at: { x: SPAWN.x - 22, z: SPAWN.z + 8 }, list: [busho('村上義清'), uS(3), uA(16)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 24, z: SPAWN.z - 2 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長尾景虎', '義清殿の領を、甲斐の者に渡したままにはせぬ', 3.4],
      ['村上義清', '布施に晴信の先手が陣を張っております。犀川を越えれば目の前', 3.4],
      ['長尾景虎', '先手は犀川を渡れ。渡り切ったら一気に布施へ寄せよ', 3.4]] },
    { kind: 'move', at: FORD, label: '犀川の向こう岸', obj: '犀川を渡り、向こう岸へ', r: 12,
      say: [['組頭', '浅瀬は膝まで。槍を濡らすな、遅れるな！', 3]] },
    { kind: 'fight', at: FUSE, obj: '布施の野で、武田の先手を崩す', title: '布施', sub: '武田の先手が布施の野に陣を張る',
      say: [['武田の侍', '越後の者が川を越えてきたぞ！　迎え討て！', 3]],
      foes: [
        { name: '武田の先手', from: { x: FUSE.x - 6, z: FUSE.z + 10 }, list: [uS(3), uA(18)] },
        { name: '武田の鉄砲', from: { x: FUSE.x + 14, z: FUSE.z + 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '脇から武田の槍が来るぞ！'], foes: [{ name: '武田の脇の槍', from: { x: FUSE.x + 30, z: FUSE.z + 6 }, list: [uS(2), uA(12)] }] }],
      reward: '布施で武田の先手を崩した' },
    { kind: 'hold', at: HOLD, label: '布施の北の畦', obj: '武田の新手を、畦で受け止める', r: 16, dur: 70,
      title: '武田の新手', sub: '崩れた先手の後ろから新手が押し寄せる',
      say: [['長尾景虎の使番', '殿より。畦で槍を揃え、新手を受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['武田の侍', '先手の仇じゃ、押し返せ！'], foes: [{ name: '武田の新手', from: { x: HOLD.x - 10, z: HOLD.z + 40 }, list: [uS(3), uA(16)] }] },
        { t: 36, say: ['組頭', 'まだ来るぞ！　退くな！'], foes: [{ name: '武田の二の手', from: { x: HOLD.x + 18, z: HOLD.z + 42 }, list: [uS(2), uA(14)] }] }],
      reward: '畦で武田の新手を受け止めた' },
    { kind: 'fight', at: HACHIMAN, obj: '八幡の社の前で、武田の殿を追い崩す', title: '八幡', sub: '武田の殿が社の前で踏みとどまる',
      say: [['長尾景虎', '敵は退く。八幡まで追え。深追いはせぬ', 3.2]],
      foes: [{ name: '武田の殿', from: { x: HACHIMAN.x, z: HACHIMAN.z + 6 }, list: [uS(4), uA(14)] }],
      reward: '八幡で武田の殿を崩した' },
  ],
  win: {
    banner: '布施・八幡の勝ち', sub: '武田晴信は塩田城に籠もり、戦を避けた', award: '布施で武田の先手を破った',
    say: [['村上義清', '晴信は塩田の城へ籠もりました。出ては来ませぬ', 3.2],
      ['長尾景虎', '籠もる相手に、深く入れば足を取られる。今日はここまでじゃ', 3.4],
      ['長尾景虎', '晴信とは、いずれまた川中島で会う', 3.2]],
  },
});
export default u01_fuse;
