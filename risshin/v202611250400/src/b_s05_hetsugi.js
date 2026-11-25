// 島津家編 五戦目「戸次川の戦い」（天正十四年〔1586〕十二月・豊後国 戸次川）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④⑤）
//   史実：豊臣方の先遣隊（仙石秀久・長宗我部信親・十河存保ら約六千）が戸次川を渡って鶴賀城を救おうとし、島津家久の約一万二千が、
//   先手の偽りの退きと左右の林の伏兵（釣り野伏せ）で挟んで破った。信親・存保は討ち死に（『元親記』B・『上井覚兼日記』A。兵数は諸説）。
//   豊臣編 t06（b_t06_hetsugi.js・docs/fujin/t06_hetsugi.md）の側を入れ替えた作り。三拍の手は tsuri_nobuse.js（木崎原と同じ）。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const TOYOTOMI = { flag: 'toyotomi', armor: 0x3a4a5a };
const SPAWN = { x: 0, z: -24 };
const STRIKE = { x: 0, z: 34 };
const LURE = { x: 0, z: -76 };
const KILL = { x: 0, z: -58 };
const TAISHO = { x: 6, z: 18 };
const GROVE_L = { x: -38, z: -46 }, GROVE_R = { x: 38, z: -46 };   // 西の林（新納）・東の林（豊久）
const RIVER = [[-200, 96], [-90, 90], [0, 94], [90, 88], [200, 94]];   // 北の戸次川（豊臣方が渡った）

const CHASE = [
  { name: '仙石秀久の先陣', from: { x: -4, z: 22 }, list: [uS(2), uA(14)] },
  { name: '長宗我部信親の二陣', from: { x: 6, z: 42 }, list: [uS(2), uA(12)] },
  { name: '十河存保の三陣', from: { x: -2, z: 62 }, list: [uS(2), uA(12)] }];

export const s05_hetsugi = lightBattle({
  id: 's05_hetsugi',
  date: '天正十四年（1586）十二月　朝　豊後国 戸次川',
  intro: '豊臣の先遣の兵六千が、戸次川を渡って鶴賀城を救おうとしている。島津家久の手は、わざと退いて誘う。',
  history: '天正十四年（1586）十二月、豊臣方の仙石秀久・長宗我部信親・十河存保らの先遣隊約六千が戸次川を渡って鶴賀城を救おうとした。島津家久は先手の伊集院久宣に偽りの退きをさせて川を渡らせ、左右の林に伏せた新納大膳亮と島津豊久の手で挟んで破った。信親・存保は討ち死にし、仙石秀久は逃げ延びた。釣り野伏せの代表の例（兵の数は諸説ある）。',
  sides: { a: { name: '島津家久の手', mon: 'shimazu', faction: 'shimazu' }, b: { name: '豊臣の先遣隊', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 12000, b: 6000 },
  allyLook: SHIMAZU, foeLook: TOYOTOMI,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1586, time: 'day', fogFar: 440,
    river: RIVER, riverW: 16, riverDepth: 0.4,
    hills: [[-62, -48, 30, 6], [62, -48, 30, 6], [0, -190, 90, 26], [-170, 70, 60, 14], [170, 50, 60, 12]],
    paths: [{ pts: [[0, -130], [0, -76], [0, -24], [0, 34], [4, 90], [0, 140]], w: 3 }],
    groves: [{ x: GROVE_L.x - 8, z: GROVE_L.z, r: 22, n: 34 }, { x: GROVE_R.x + 8, z: GROVE_R.z, r: 22, n: 34 }, { x: -150, z: 20, r: 30, n: 24 }, { x: 150, z: 10, r: 30, n: 24 }],
    trees: 360, tufts: 2000,
  },
  allies: [
    { name: '島津家久の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('島津家久'), uS(4), uA(8)] },
    { name: '囮の足軽（伊集院の手）', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [uS(1), uA(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津家久', '豊臣の先遣は六千。鶴賀城を囲むわしらを、川の向こうから見ておる', 3.6],
      ['島津家久', '左右の林に新納と豊久を伏せた。伊集院の手が当たって退き、敵に川を渡らせよ', 3.8],
      ['組頭', '退く時は振り向くな。林の間まで走れ。そこで向き直る', 3.2]] },
    { kind: 'fight', at: STRIKE, obj: '川を渡った仙石の先手に当たる', title: '戸次川', sub: '川を渡る豊臣の先手',
      say: [['仙石の侍', '島津の囲みが薄いぞ！　押せ、鶴賀城を救え！', 3]],
      foes: [{ name: '豊臣の先手', from: { x: STRIKE.x - 4, z: STRIKE.z + 12 }, list: [uS(2), uA(12)] }],
      max: 90, reward: '豊臣の先手に当たった' },
    { kind: 'move', at: LURE, label: '林の間', obj: '退いて、豊臣勢を林の間まで引く', r: 10, max: 100,
      say: [['島津家久', '引け！　林の間まで引け！', 3], ['仙石の侍', '島津が崩れたぞ！　追え、手柄は今じゃ！', 3.2]] },
    { kind: 'hold', at: KILL, label: '林の間', obj: '向き直って待ち、追ってきた豊臣勢を挟む', r: 16, dur: 70, title: '伏せ', sub: '林の間で向き直る',
      say: [['島津家久', '向き直れ！　ここで待て。まだじゃ', 3]],
      waves: [{ t: 0, foes: CHASE.map((c, i) => ({ ...c, adopt: (rt) => rt.flags.kzChase?.[i] })) },
        { t: 45, say: ['長宗我部の侍', '後ろの備も渡れ！　島津は小勢じゃ！'], foes: [{ name: '豊臣の後陣', from: { x: 8, z: KILL.z + 50 }, list: [uS(2), uA(14)] }] }],
      reward: '林の間で豊臣勢を挟んだ' },
    { kind: 'fight', at: TAISHO, obj: '長宗我部信親の備を崩す', title: '長宗我部信親', sub: '信親が踏みとどまる', max: 140,
      say: [['島津家久', '大将格はそこじゃ！　押せ！', 3]],
      foes: [{ name: '長宗我部信親の備', from: { x: TAISHO.x, z: TAISHO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '長宗我部信親', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['長宗我部の侍', '若殿を守れ！　旗本、前へ！'], foes: [{ name: '信親の旗本', from: { x: TAISHO.x - 14, z: TAISHO.z + 20 }, list: [uS(3), uA(10)] }] }],
      reward: '長宗我部信親の備を崩した' },
  ],
  update: tsuriNobuse({
    look: SHIMAZU, kill: KILL, chase: CHASE,
    groves: [{ p: GROVE_L, name: '新納の伏兵（西の林）', list: [uS(3), uA(12), uG(3)] }, { p: GROVE_R, name: '豊久の伏兵（東の林）', list: [uS(3), uA(12), uG(3)] }],
    cry: [['島津家久', '今じゃ！　川を背に挟め！', 2.6], ['長宗我部の侍', '林に伏兵！　渡るのではなかった！', 3]],
  }),
  win: {
    banner: '戸次川の勝ち', sub: '誘って挟み、先遣隊を破った', award: '戸次川で豊臣の先遣隊を挟んで破った',
    say: [['組頭', '豊臣の若い大将が討たれた。敵が川へ崩れていく', 3.2],
      ['島津家久', '退いて、待って、挟む。島津の戦は変わらぬ', 3.4],
      ['島津家久', '皆、ようやった。鶴賀城の囲みへ戻るぞ', 3]],
  },
});
export default s05_hetsugi;
