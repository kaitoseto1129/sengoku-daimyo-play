// 島津家編 五戦目「戸次川の戦い」（天正十四年〔1586〕十二月・豊後国 戸次川）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④⑤）
//   史実：豊臣方の先遣隊（仙石秀久・長宗我部信親・十河存保ら約六千）が戸次川を渡って鶴賀城を救おうとし、島津家久の約一万二千が、
//   先手の偽りの退きと左右の林の伏兵（釣り野伏せ）で挟んで破った。信親・存保は討ち死に（『元親記』B・『上井覚兼日記』A。兵数は諸説）。
//   豊臣編 t06（b_t06_hetsugi.js・docs/fujin/t06_hetsugi.md）の側を入れ替えた作り。三拍の手は tsuri_nobuse.js（木崎原と同じ）。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';
import { hetsugiField, HETSUGI_WORLD, HETSUGI_TIMESLIP, HETSUGI_AT } from './b_t06_hetsugi.js';   // K651：豊臣編の戸次川の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「長宗我部の戸次川…既存のやつの立場を入れ替えるだけでできるやつはそうしよう」）：
//   前の別の戦場（手書きの丘と北の細い川）をやめ、豊臣編 t06 の戸次川（大野川・鶴賀城・中津留の河原・左右の林・家久の本陣）を hetsugiField で建てる。
//   遊ぶ側は伊集院久宣の先手（囮）の足軽。豊臣勢は +z（渡る前の岸）から浅瀬を渡って来る。行き先は戸次川の戦場の物差し（HETSUGI_AT）で置く。
// K652⑥（その戦の逸話を本人がやる段）：本人が囮になって当たり、背を向けて林の間まで退き、向き直って挟む＝釣り野伏せ（tsuri_nobuse.js の三拍）
const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const TOYOTOMI = { flag: 'toyotomi', armor: 0x3a4a5a };
const AT = HETSUGI_AT, FX = AT.ford.x, RZ = AT.riverZ(FX);
const SPAWN = { x: FX + 10, z: RZ - 46 };                 // 鶴賀城の下の囲みの陣の前（伊集院の先手）
const STRIKE = { x: FX + 2, z: RZ - 24 };                 // 浅瀬を渡って来る仙石の先手に当たる河原
const KILL = { x: AT.ring.x, z: AT.ring.z };              // 中津留の河原の林の間（包みが閉じる所）
const LURE = { x: AT.ring.x, z: AT.ring.z - 22 };         // 退いて引く所（林の間の奥）
const TAISHO = { x: AT.ring.x - 10, z: AT.ring.z + 30 };  // 長宗我部信親が踏みとどまる所
const GROVE_L = { x: AT.woods[0].x + 24, z: AT.woods[0].z - 2 }, GROVE_R = { x: AT.woods[1].x - 24, z: AT.woods[1].z + 2 };   // 西の林（新納）・東の林（豊久）の縁

const CHASE = [
  { name: '仙石秀久の先陣', from: { x: FX - 4, z: RZ - 30 }, list: [uS(2), uA(14)] },
  { name: '長宗我部信親の二陣', from: { x: FX + 6, z: RZ - 14 }, list: [uS(2), uA(12)] },
  { name: '十河存保の三陣', from: { x: FX - 2, z: RZ + 4 }, list: [uS(2), uA(12)] }];

export const s05_hetsugi = lightBattle({
  id: 's05_hetsugi',
  date: '天正十四年（1586）十二月　夕　豊後国 戸次川',   // K651：豊臣編と同じ夕の戸次川
  intro: '豊臣の先遣の兵六千が、戸次川を渡って鶴賀城を救おうとしている。島津家久の手は、わざと退いて誘う。',
  history: '天正十四年（1586）十二月、豊臣方の仙石秀久・長宗我部信親・十河存保らの先遣隊約六千が戸次川を渡って鶴賀城を救おうとした。島津家久は先手の伊集院久宣に偽りの退きをさせて川を渡らせ、左右の林に伏せた新納大膳亮と島津豊久の手で挟んで破った。信親・存保は討ち死にし、仙石秀久は逃げ延びた。釣り野伏せの代表の例（兵の数は諸説ある）。',
  sides: { a: { name: '島津家久の手', mon: 'shimazu', faction: 'shimazu' }, b: { name: '豊臣の先遣隊', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 12000, b: 6000, la: 0.06, lb: 0.5 },   // K652①：討ち取りに合わせて少しずつ。島津の損は少なく、豊臣の先遣は半ばが崩れる
  allyLook: SHIMAZU, foeLook: TOYOTOMI,
  allyDmg: 0.2,   // 11/25 K651：act bot 202秒・討ち取り2（味方が先に斬り尽くした）→味方の刃を弱め、受けの段に新手（thick）
  thick: true,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: { seed: 1586, time: 'dusk', winter: true },   // 下で豊臣編の戸次川の world に置き換える（K651）
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
        { t: 45, say: ['長宗我部の侍', '後ろの備も渡れ！　島津は小勢じゃ！'], foes: [{ name: '豊臣の後陣', from: { x: KILL.x + 8, z: KILL.z + 50 }, list: [uS(2), uA(14)] }] }],
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
// K651：豊臣編の戸次川の地面・大野川・浅瀬・林・道をそのまま使う（getter も写すため descriptor ごと）
s05_hetsugi.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(HETSUGI_WORLD));
s05_hetsugi.timeslip = HETSUGI_TIMESLIP;
s05_hetsugi.mapNorth = Math.PI * 1.5;   // 実の北はゲームの −x（豊臣編と同じ）
// 戦場を建てる（豊臣編の戸次川と同じ所）→ 軽い型の setup（島津の組・段）
{ const s0 = s05_hetsugi.setup; s05_hetsugi.setup = function* (rt) { yield* hetsugiField(rt); s0.call(this, rt); }; }
export default s05_hetsugi;
