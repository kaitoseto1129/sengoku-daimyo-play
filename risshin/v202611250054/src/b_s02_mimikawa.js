// 島津家編 二戦目「耳川の戦い」（天正六年〔1578〕十一月・日向国 高城・耳川）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④）
//   史実：大友宗麟の大軍（約四万・通説）が、島津の高城（山田有信ら約三千が籠る）を囲んだ。救いに来た島津義久・義弘・家久の本軍（約三万）は
//   高城の囲みの兵を囮に使い、左右の丘の伏兵で大友勢を挟んで、耳川の方へ追い落とした（『上井覚兼日記』A・『大友興廃記』B。兵数は諸説）。
//   三拍の手は tsuri_nobuse.js（木崎原と同じ）。字・札・ボタンは足さない。大軍は塊で見せ、本物の兵は二百人ほどまで
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const OTOMO = { flag: 'otomo', armor: 0x2f3a4a };
const SPAWN = { x: 0, z: -20 };
const STRIKE = { x: 0, z: 30 };
const LURE = { x: 0, z: -80 };
const KILL = { x: 0, z: -62 };
const TAISHO = { x: 0, z: 16 };
const GROVE_L = { x: -46, z: -50 }, GROVE_R = { x: 46, z: -50 };   // 左右の丘（義久・義弘の伏せ）
const RIVER = [[-220, 140], [-100, 130], [0, 136], [100, 128], [220, 134]];   // 北の耳川（大友勢が渡った）

const CHASE = [
  { name: '大友の先陣（田北鎮周）', from: { x: -6, z: 20 }, list: [uS(2), uA(14)] },
  { name: '大友の二陣', from: { x: 6, z: 38 }, list: [uS(2), uA(13)] },
  { name: '大友の三陣', from: { x: -4, z: 56 }, list: [uS(2), uA(13)] },
  { name: '大友の四陣', from: { x: 4, z: 74 }, list: [uS(2), uA(12)] }];

export const s02_mimikawa = lightBattle({
  id: 's02_mimikawa',
  date: '天正六年（1578）十一月　朝　日向国 高城',
  intro: '大友宗麟の大軍四万が、高城を囲んで耳川を渡ってくる。島津は高城の囮で敵を引き、左右の丘で挟む。',
  history: '天正六年（1578）十一月、大友宗麟の大軍（約四万・通説）が日向に攻め入り、島津の高城を囲んだ。救いに来た島津義久・義弘・家久は、高城の兵を囮に使い、左右の丘に伏せた軍勢で大友勢を挟んで耳川の方へ追い落とした。大友方は田北鎮周らの将を多く失い、九州の勢いが島津へ傾いた（兵の数は諸説ある）。',
  sides: { a: { name: '島津の軍', mon: 'shimazu', faction: 'shimazu' }, b: { name: '大友の軍', mon: 'otomo', faction: 'otomo' } },
  force: { a: 30000, b: 40000 },
  allyLook: SHIMAZU, foeLook: OTOMO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1578, time: 'day', fogFar: 460,
    river: RIVER, riverW: 18, riverDepth: 0.5,
    hills: [[-70, -52, 34, 9], [70, -52, 34, 9], [0, -30, 30, 7], [-170, 70, 60, 14], [170, 60, 60, 16], [0, 230, 90, 22]],
    paths: [{ pts: [[0, -130], [0, -80], [0, -20], [0, 30], [4, 100], [0, 160]], w: 3 }],
    groves: [{ x: GROVE_L.x - 10, z: GROVE_L.z, r: 24, n: 38 }, { x: GROVE_R.x + 10, z: GROVE_R.z, r: 24, n: 38 }, { x: -160, z: 60, r: 30, n: 24 }, { x: 160, z: 50, r: 30, n: 24 }],
    trees: 420, tufts: 2200,
  },
  allies: [
    { name: '島津家久の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('島津家久'), uS(4), uA(8)] },
    { name: '高城の囮の足軽', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [uS(1), uA(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津家久', '大友は四万、こちらは三万。まともに当たれば互角じゃが、敵は川を背にして伸びておる', 3.8],
      ['島津家久', '高城の兵が囮じゃ。義久様と義弘様が、左右の丘に伏せておられる', 3.6],
      ['組頭', '当たって、退いて、丘の間まで走れ。そこで向き直る', 3.2]] },
    { kind: 'fight', at: STRIKE, obj: '高城の外で、川を渡った大友の先手に当たる', title: '耳川', sub: '川を渡る大友の先手',
      say: [['大友の侍', '高城の囲みは目の前じゃ！　押せ！', 3]],
      foes: [{ name: '大友の先手', from: { x: STRIKE.x - 4, z: STRIKE.z + 12 }, list: [uS(2), uA(12)] }],
      max: 90, reward: '大友の先手に当たった' },
    { kind: 'move', at: LURE, label: '丘の間', obj: '退いて、大友勢を丘の間まで引く', r: 10, max: 100,
      say: [['島津家久', '引け！　丘の間まで引け！', 3], ['大友の侍', '島津が退くぞ！　追え、高城を落とせ！', 3.2]] },
    { kind: 'hold', at: KILL, label: '丘の間', obj: '向き直って待ち、追ってきた大友勢を挟む', r: 16, dur: 70, title: '伏せ', sub: '丘の間で向き直る',
      say: [['島津家久', '向き直れ！　ここで待て。まだじゃ', 3]],
      waves: [{ t: 0, foes: CHASE.map((c, i) => ({ ...c, adopt: (rt) => rt.flags.kzChase?.[i] })) },
        { t: 45, say: ['大友の侍', '後備えも渡れ！　勝ちは目の前じゃ！'], foes: [{ name: '大友の後陣', from: { x: 8, z: KILL.z + 56 }, list: [uS(2), uA(14)] }] }],
      reward: '丘の間で大友勢を挟んだ' },
    { kind: 'fight', at: TAISHO, obj: '大友の大将の備を崩す', title: '田原親賢', sub: '大友の本陣が踏みとどまる', max: 140,
      say: [['島津家久', '本陣はそこじゃ！　押せ！', 3]],
      foes: [{ name: '田原親賢の備', from: { x: TAISHO.x, z: TAISHO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '田原親賢', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['大友の侍', '本陣を守れ！　旗本、前へ！'], foes: [{ name: '大友の旗本', from: { x: TAISHO.x - 14, z: TAISHO.z + 20 }, list: [uS(3), uA(10)] }] }],
      reward: '大友の本陣を崩した' },
  ],
  update: tsuriNobuse({
    look: SHIMAZU, kill: KILL, chase: CHASE, chaseSpeed: 3.4, trigZ: 36,
    groves: [{ p: GROVE_L, name: '島津義久の伏兵（左の丘）', list: [uS(3), uA(14), uG(3)] }, { p: GROVE_R, name: '島津義弘の伏兵（右の丘）', list: [uS(3), uA(14), uG(3)] }],
    cry: [['島津家久', '今じゃ！　丘から出て挟め！', 2.6], ['大友の侍', '丘に伏兵！　囲まれる！', 3]],
  }),
  win: {
    banner: '耳川の勝ち', sub: '四万の大友勢を丘で挟んだ', award: '耳川で大友勢を挟んで破った',
    say: [['組頭', '大友の本陣が崩れた。敵が耳川へ逃げていく', 3.2],
      ['島津家久', '囮で引いて、丘で挟む。これで九州の勢いは島津じゃ', 3.4],
      ['島津家久', '皆、よう持ちこたえた。高城へ戻るぞ', 3]],
  },
});
export default s02_mimikawa;
