// 長宗我部家編 七「引田の戦い」（天正十一年〔1583〕四月・讃岐国 引田）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：羽柴秀吉は仙石秀久を讃岐へ送り、十河存保を助けさせた。元親は引田の浜で仙石勢を迎え、伏せた兵で横を突いて破った（『元親記』B・東かがわ市の解説 C・兵の数は推）。
// 仕組み：一領具足の呼び集め（浜の松原の外の畑に伏せた影を、法螺で起こす）
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

const SENGOKU = { flag: 'eiraku', armor: 0x2a2420 };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: -24, z: -60 };    // 法螺の台
const BEACH = { x: 4, z: 26 };      // 引田の浜
const PINE = { x: -10, z: 50 };     // 松原の口
const HIDE = { x: 6, z: 102 };      // 仙石秀久の備

export const c13_hiketa = chosoBattle({
  id: 'c13_hiketa',
  date: '天正十一年（1583）四月　朝　讃岐国 引田',
  intro: '羽柴秀吉が、仙石秀久を讃岐へ送ってきた。引田の浜に、永楽銭の旗。畑の畦には、一領具足が伏せている。',
  history: '天正十一年（1583）四月、羽柴秀吉は仙石秀久を讃岐へ送り、十河存保を助けさせた。長宗我部元親は引田の浜で仙石勢を迎え、伏せた兵で横を突いて破った。仙石は淡路へ退いた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '仙石の軍', mon: 'eiraku', faction: 'toyotomi' } },
  force: { a: 10000, b: 2000 },
  thick: true, playerTaken: 0.38,   // K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: SENGOKU,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1583, time: 'morning', fogFar: 440,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 60, 80, 22], [-160, -130, 80, 20], [160, -130, 80, 18], [HIDE.x - 40, HIDE.z + 40, 50, 14]],
    paths: [{ pts: [[0, -140], [0, -40], [4, 26], [-10, 50], [6, 102], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 110 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: 50, z: 50, r: 26, n: 30 }, { x: -60, z: 70, r: 24, n: 26 }, { x: -170, z: 60, r: 30, n: 24 }],
    trees: 380, tufts: 1700,
  },
  fields: [{ at: { x: -58, z: -40 }, far: 0 }, { at: { x: 40, z: -50 }, far: 1 }, { at: { x: -66, z: -96 }, far: 2 }, { at: { x: 56, z: -100 }, far: 3 }],
  callSay: ['長宗我部元親', '起きたな。仙石の横を突け！', '……遅い。集まった者だけで行く'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '香川親和の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('香川親和'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '羽柴の手先が讃岐へ来た。浜で迎えて追い返す', 3.2],
      ['組頭', '畑の者は伏せておる。法螺が鳴れば、仙石の横へ出る', 3.2],
      ['香川親和', '父上、仙石は戦上手と聞きまする', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: BEACH, obj: '引田の浜で、仙石の先手を破る', title: '引田', sub: '浜に仙石の先手',
      say: [['長宗我部元親', '浜へ出よ！', 2.6], ['仙石の侍', '土佐の兵など、羽柴の槍の前では田の案山子じゃ！', 3.2]],
      foes: [{ name: '仙石の先手', from: { x: BEACH.x + 6, z: BEACH.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['仙石の侍', '鉄砲、前へ！'], foes: [{ name: '仙石の鉄砲', from: { x: BEACH.x + 20, z: BEACH.z + 18 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '引田の浜で仙石の先手を破った' },
    { kind: 'hold', at: PINE, label: '松原の口', obj: '松原の口を守り、仙石の寄せを受ける', r: 16, dur: 60, title: '松原の口', sub: '仙石の寄せ',
      say: [['香川親和', '松原の口を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['仙石の侍', '押し返せ！'], foes: [{ name: '仙石の二の手', from: { x: PINE.x + 12, z: PINE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['仙石の侍', '三の手、かかれ！'], foes: [{ name: '仙石の三の手', from: { x: PINE.x - 18, z: PINE.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '松原の口を守った' },
    { kind: 'fight', at: HIDE, obj: '仙石秀久の備を崩す', title: '仙石秀久', sub: '永楽銭の旗が踏みとどまる', max: 140,
      say: [['長宗我部元親', '秀久の旗じゃ！　押せ！', 3]],
      foes: [{ name: '仙石秀久の備', from: { x: HIDE.x, z: HIDE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '仙石秀久', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['仙石の侍', '殿を舟へ！　ここで止めよ！'], foes: [{ name: '仙石の旗本', from: { x: HIDE.x - 14, z: HIDE.z + 18 }, list: [uS(3), uA(8)] }] }],
      reward: '仙石秀久の備を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '仙石が退く。浜の舟へ逃げる気じゃ', 3]]),
    fightS({ x: 40, z: 120 }, '浜の舟着きで、仙石の舟を守る兵を払う', '舟着き', '仙石の舟を守る兵', [['長宗我部元親', '舟を出させるな！', 3]],
      [foe('舟を守る仙石の兵', 50, 134, [uS(2), uA(12)])], { later: [wave(28, '仙石の侍', '鉄砲、浜を撃て！', [foe('舟の鉄砲', 60, 110, [uS(1), uG(5)])])], reward: '舟着きを払った' }),
    holdS({ x: 20, z: 80 }, '引田の町の辻', '町の辻を守り、返してきた仙石の後詰を受ける', '仙石の後詰', '仙石の後詰が町へ返す', [['組頭', '後詰が返してきた！　辻を守れ！', 3]],
      [wave(0, '仙石の侍', '退く者を助けよ！', [foe('仙石の後詰', 30, 110, [uS(2), uA(12)])]), wave(30, '仙石の侍', '横から回れ！', [foe('仙石の後詰の二', 50, 80, [uS(2), uA(10)])]),
        wave(52, '仙石の侍', '撃ちかけよ！', [foe('仙石の後詰の鉄砲', 0, 110, [uS(1), uA(8), uG(2)])])], { reward: '仙石の後詰を止めた' }),
    fightS({ x: -20, z: 112 }, '引田の坂の下の柵を破る', '坂の下の柵', '仙石の兵が柵に籠る', [['組頭', '柵に籠った者がおる。破れ', 3]],
      [foe('坂の柵の兵', -24, 124, [uS(2), uA(12)]), foe('坂の柵の弓', -8, 130, [uB(5)])], { later: [wave(26, '仙石の侍', '柵を守れ！', [foe('坂の柵の守り', -40, 110, [uS(2), uA(8)])])], reward: '坂の下の柵を破った' }),
    fightS({ x: -6, z: 134 }, '坂の上で、仙石の殿の旗本を討つ', '仙石の殿', '秀久を舟へ逃がす旗本', [['長宗我部元親', '讃岐は土佐のものじゃ。押し出せ！', 3]],
      [foe('仙石の殿の旗本', -6, 148, [boss('仙石の侍大将'), uS(3), uA(10)])], { later: [wave(30, '仙石の侍', '殿を舟へ！', [foe('仙石の最後の兵', -20, 154, [uS(2), uA(8)])])], reward: '仙石勢を讃岐から追った' }),
  ],
  win: {
    banner: '引田の勝ち', sub: '仙石の兵が舟へ逃げる', award: '引田で仙石秀久を破った',
    say: [['組頭', '仙石が舟へ逃げていく。讃岐はもう少しじゃ', 3.2],
      ['長宗我部元親', '羽柴の手先も、一領具足には敵わぬ', 3],
      ['香川親和', 'されど父上、羽柴は次に、もっと大きな兵を寄越しましょう', 3.2]],
  },
});
export default c13_hiketa;
