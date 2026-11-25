// 島津家編 三戦目「沖田畷の戦い」（天正十二年〔1584〕三月・肥前国 島原 沖田畷）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④）
//   史実：龍造寺隆信の約二万五千が、有馬晴信を助ける島津家久・有馬の勢（約五千〜）を海と沼に挟まれた細い畷道で攻め、
//   島津の先手の偽りの退きに引かれて道に長く伸びたところを、沼の際の伏兵と鉄砲で挟まれた。隆信は討ち取られた（『北肥戦誌』B・島原市の解説 C。有馬勢の数は推）。
//   三拍の手は tsuri_nobuse.js（木崎原と同じ）。違いは地形：両側が沼で、敵は一本の道に長く伸びる（深追いが絵で分かる）。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const RYUZOJI = { flag: 'ryuzoji', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: -24 };
const STRIKE = { x: 0, z: 34 };
const LURE = { x: 0, z: -76 };
const KILL = { x: 0, z: -58 };
const TAISHO = { x: 4, z: 22 };
const GROVE_L = { x: -46, z: -50 }, GROVE_R = { x: 46, z: -50 };   // 沼の向こうの際（鉄砲の伏兵）

const CHASE = [
  { name: '龍造寺の先陣', from: { x: -2, z: 22 }, list: [uS(2), uA(12)] },
  { name: '龍造寺の二陣', from: { x: 2, z: 40 }, list: [uS(2), uA(12)] },
  { name: '龍造寺の三陣', from: { x: -2, z: 58 }, list: [uS(2), uA(12)] },
  { name: '龍造寺の四陣', from: { x: 2, z: 76 }, list: [uS(2), uA(10)] }];

export const s03_okitanawate = lightBattle({
  id: 's03_okitanawate',
  date: '天正十二年（1584）三月　朝　肥前国 島原 沖田畷',
  intro: '龍造寺隆信の大軍が、海と沼の間の細い畷道を押してくる。島津家久の手は、わざと退いて、敵を道の奥へ誘う。',
  history: '天正十二年（1584）三月、龍造寺隆信は約二万五千で島原へ攻め入り、有馬晴信を助けた島津家久らの勢と沖田畷で戦った。畷は海と沼の間の細い一本道で、大軍は長く伸びた。島津の先手は退いて誘い、沼の際に伏せた鉄砲と兵で挟んだ。龍造寺隆信は討ち取られ、龍造寺の勢は崩れた。有馬勢の数は諸説ある。',
  sides: { a: { name: '島津家久の手', mon: 'shimazu', faction: 'shimazu' }, b: { name: '龍造寺隆信の大軍', mon: 'ryuzoji', faction: 'ryuzoji' } },
  force: { a: 5000, b: 25000 },
  allyLook: SHIMAZU, foeLook: RYUZOJI,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1584, time: 'day', fogFar: 440, overcast: true,
    sea: [{ pts: [[-27, -220], [-27, 0], [-27, 220]], w: 22, depth: 0.5, still: true, levelAt: () => -0.4 }, { pts: [[27, -220], [27, 0], [27, 220]], w: 22, depth: 0.5, still: true, levelAt: () => -0.4 }],
    hills: [[-120, -60, 46, 8], [120, -60, 46, 8], [0, -190, 90, 20]],
    paths: [{ pts: [[0, -130], [0, -76], [0, -24], [0, 34], [0, 90], [0, 140]], w: 3 }],
    groves: [{ x: GROVE_L.x - 10, z: GROVE_L.z, r: 18, n: 26 }, { x: GROVE_R.x + 10, z: GROVE_R.z, r: 18, n: 26 }, { x: -140, z: 30, r: 30, n: 20 }, { x: 140, z: 30, r: 30, n: 20 }],
    trees: 240, tufts: 2200,
  },
  allies: [
    { name: '島津家久の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('島津家久'), uS(4), uA(8)] },
    { name: '囮の足軽（先手）', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [uS(1), uA(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津家久', '龍造寺は二万五千。わしらは五千。海と沼の間の畷道で迎える', 3.6],
      ['島津家久', '先手が当たって退く。敵が畷道に長く伸びたら、沼の際の鉄砲が火を吹く', 3.8],
      ['組頭', '足を取られるな。道の真ん中を走れ。沼に落ちたら終いじゃ', 3.2]] },
    { kind: 'fight', at: STRIKE, obj: '畷道を押してくる龍造寺の先手に当たる', title: '沖田畷', sub: '海と沼の間の細い道',
      say: [['龍造寺の侍', '島津は小勢ぞ！　押し潰せ！', 3]],
      foes: [{ name: '龍造寺の先手', from: { x: STRIKE.x, z: STRIKE.z + 12 }, list: [uS(2), uA(12)] }],
      max: 90, reward: '龍造寺の先手に当たった' },
    { kind: 'move', at: LURE, label: '畷の南', obj: '退いて、龍造寺勢を畷道の奥まで引く', r: 10, max: 100,
      say: [['島津家久', '引け！　畷の南まで引け！', 3], ['龍造寺の侍', '島津が崩れたぞ！　追え、道は一本じゃ！', 3.2]] },
    { kind: 'hold', at: KILL, label: '畷の南', obj: '向き直って待ち、道に伸びた龍造寺勢を挟む', r: 16, dur: 70, title: '伏せ', sub: '畷の南で向き直る',
      say: [['島津家久', '向き直れ！　ここで待て。まだじゃ', 3]],
      waves: [{ t: 0, foes: CHASE.map((c, i) => ({ ...c, adopt: (rt) => rt.flags.kzChase?.[i] })) },
        { t: 45, say: ['龍造寺の侍', '後ろの備も詰めよ！　隆信様の御旗が見えぬ！'], foes: [{ name: '龍造寺の後陣', from: { x: 0, z: KILL.z + 60 }, list: [uS(2), uA(14)] }] }],
      reward: '畷の南で龍造寺勢を挟んだ' },
    { kind: 'fight', at: TAISHO, obj: '龍造寺隆信の備を崩す', title: '龍造寺隆信', sub: '隆信の本陣が乱れる', max: 140,
      say: [['島津家久', '隆信の旗はそこじゃ！　押せ！', 3]],
      foes: [{ name: '龍造寺隆信の備', from: { x: TAISHO.x, z: TAISHO.z + 12 }, list: [{ type: 'samurai', n: 1, o: { name: '龍造寺隆信', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['龍造寺の侍', '御屋形を守れ！　旗本、前へ！'], foes: [{ name: '隆信の旗本', from: { x: TAISHO.x - 12, z: TAISHO.z + 22 }, list: [uS(3), uA(10)] }] }],
      reward: '龍造寺隆信の備を崩した' },
  ],
  update: tsuriNobuse({
    look: SHIMAZU, kill: KILL, chase: CHASE,
    groves: [{ p: GROVE_L, name: '沼の際の伏兵（西）', list: [uS(2), uA(8), uG(8)] }, { p: GROVE_R, name: '沼の際の伏兵（東）', list: [uS(2), uA(8), uG(8)] }],
    cry: [['島津家久', '今じゃ！　鉄砲、道へ放て！', 2.6], ['龍造寺の侍', '沼から鉄砲！　道が狭い、退けぬ！', 3]],
  }),
  win: {
    banner: '沖田畷の勝ち', sub: '細い畷道に誘い、龍造寺隆信を破った', award: '沖田畷で龍造寺隆信の大軍を畷道に誘って破った',
    say: [['組頭', '龍造寺の御屋形が討たれた。大軍が沼へ崩れていく', 3.2],
      ['島津家久', '道が狭ければ、数は力にならぬ。皆、ようやった', 3.4]],
  },
});
export default s03_okitanawate;
