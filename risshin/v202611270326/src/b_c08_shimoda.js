// 長宗我部家編 十二「下田城の戦い」（天正十八年〔1590〕四月・伊豆国 下田城）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：小田原の役で、豊臣の水軍（長宗我部元親・九鬼嘉隆・脇坂安治ら）は伊豆の下田城を海から囲んだ。城将の清水康英は五十日ほど守って城を開いた
//   （『北条五代記』B・下田市の解説 C。元親の水軍の参加は C・兵の数は推）。
// 仕組み：一領具足の呼び集め（浜に上げた舟の陰の舟子を、法螺で呼び集める形）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import * as THREE from 'three';
import { kobune } from './props.js';
import { funeJirushi } from './house_gear.js';

const HOJO = { flag: 'hojo', armor: 0x2e2a26 };
const coast = (x) => -86 + Math.sin(x * 0.02) * 4;   // 南の海の岸（z がこれより小さい所は海）
const SPAWN = { x: 0, z: -58 };
const HORA = { x: 30, z: -66 };     // 法螺の台（浜の岩）
const SAKU = { x: -4, z: 4 };       // 浜の柵
const KUCHI = { x: 6, z: 30 };      // 城の下の口
const OTE = { x: 0, z: 80 };        // 下田城の大手
const DAIKOKU = { x: 52, z: -97 };  // K652⑥ 大黒丸（元親の大船）を寄せた沖
const LAND = { x: 46, z: -76 };     // K652⑥ 大黒丸の着き場（浜）

// K652⑥（11/26 クラウドか）：元親の大船「大黒丸」（『土佐物語』B・大きさは諸説）と、浜に上げた土佐の舟。見た目だけ・形と材質は使い回し
let _deck = null, _mast = null, _sail = null;
function scene(rt) {
  const W = rt.world;
  const at = (x, z) => Math.max(-0.5, W.heightAt(x, z)) + 0.05;
  try {
    if (!_deck) {
      _deck = [new THREE.BoxGeometry(3.4, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a2a })];
      _mast = [new THREE.CylinderGeometry(0.16, 0.22, 15, 6), new THREE.MeshLambertMaterial({ color: 0x5a4a34 })];
      _sail = [new THREE.PlaneGeometry(8, 9), new THREE.MeshLambertMaterial({ color: 0xd8ceb4, side: THREE.DoubleSide })];
    }
    const g = new THREE.Group();
    const hull = kobune(0, 0, 0, 0, 13); hull.scale.set(2.5, 1.9, 1.7); g.add(hull);   // 長さ二十二m ほどの大船
    const deck = new THREE.Mesh(_deck[0], _deck[1]); deck.position.set(0, 1.4, -6.5); g.add(deck);   // 艫の矢倉
    const mast = new THREE.Mesh(_mast[0], _mast[1]); mast.position.set(0, 7.5, 1); g.add(mast);
    const sail = new THREE.Mesh(_sail[0], _sail[1]); sail.position.set(0, 9.5, 1.3); g.add(sail);   // 莚の帆（舳先の向きへ張る）
    funeJirushi(g, 22, 'chosokabe', 5);
    g.position.set(DAIKOKU.x, at(DAIKOKU.x, DAIKOKU.z), DAIKOKU.z); g.rotation.y = -Math.PI / 2 + 0.25;
    rt.scene.add(g);
  } catch (e) { /* 船の形が無くても戦は続ける */ }
  for (let i = 0; i < 6; i++) {   // 浜に上げた舟（舟子の舟）
    const x = -70 + i * 30 + ((i * 7) % 5), z = coast(x) + 3 + (i % 2) * 2;
    try { const b = kobune(x, at(x, z), z, Math.PI * (0.5 + ((i * 5) % 7 - 3) * 0.06), 7 + (i % 2)); if (b) rt.scene.add(i % 2 ? b : funeJirushi(b, 7, 'chosokabe', 3)); } catch (e) { /* 同上 */ }
  }
}

export const c08_shimoda = chosoBattle({
  id: 'c08_shimoda',
  date: '天正十八年（1590）四月　朝　伊豆国 下田',
  intro: '小田原の北条を攻める戦。長宗我部の舟は、伊豆の下田の浜に着いた。舟の陰に土佐の舟子たち。山の上に北条の下田城。',
  history: '天正十八年（1590）、豊臣秀吉の小田原攻めで、長宗我部元親は豊臣の水軍に加わった。水軍は伊豆の下田城を海から囲み、城将の清水康英は五十日ほど守った末に城を開いた（元親の持ち場と兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '北条の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 2500, b: 600 },
  playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: HOJO,
  noMarch: true,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  setup: scene,
  world: {
    seed: 1590, time: 'morning', fogFar: 420,
    coast,
    sea: [{ pts: [[-320, -160], [0, -162], [320, -160]], w: 120, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[OTE.x, OTE.z + 30, 50, 22], [-120, 40, 60, 20], [130, 50, 60, 22], [0, 180, 90, 26]],
    paths: [{ pts: [[0, -70], [-4, 4], [6, 30], [0, 80], [0, 130]], w: 2.8 }],
    groves: [{ x: -120, z: 40, r: 30, n: 30 }, { x: 130, z: 50, r: 30, n: 30 }, { x: OTE.x + 40, z: OTE.z + 20, r: 24, n: 22 }],
    trees: 400, tufts: 1400,
    tint(x, z, h, c) {
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.14 * k, c.g * (1 - k) + 0.18 * k, c.b * (1 - k) + 0.2 * k); return; }
      if (z < cz + 12) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.6 * k, c.g * (1 - k) + 0.55 * k, c.b * (1 - k) + 0.45 * k); }
    },
  },
  fields: [{ at: { x: -50, z: -70 }, far: 0 }, { at: { x: 60, z: -72 }, far: 1 }, { at: { x: -90, z: -72 }, far: 2 }, { at: { x: 96, z: -74 }, far: 3 }],
  callSay: ['長宗我部元親', '舟子も槍を取れ！　土佐の者は皆、一領具足じゃ', '……遅い。集まった者で上がる'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 4 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '長宗我部盛親の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 2 }, list: [busho('長宗我部盛親'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  // K720 二回目（流れ⑥）：海側から別働隊＝浜の舟の陰から舟子が立ち、海に向いた曲輪の横へ回る（chosokabe_kit.js flanks・第8段）
  flanks: [{ during: 8, at: { x: -40, z: coast(-40) + 5 }, to: { x: -44, z: 68 }, n: 9, name: '海側へ回る舟子', delay: 3, say: ['長宗我部盛親', '舟の陰から舟子が出た！　海側の曲輪の横じゃ！'] }],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '海から城を囲む。浜の柵を破って、城の下まで寄せよ', 3.2],
      ['組頭', '舟子らは舟の陰じゃ。浜の岩で法螺を吹け', 3],
      ['長宗我部盛親', '父上、北条の兵は少ない。されど城は固うござる', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '浜の岩へ走り、舟子を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの岩じゃ！　上がって吹け！', 3]] },
    // K652⑥（その戦の逸話を本人がやる段・11/26 クラウドか）：元親は大船「大黒丸」を率いて小田原の役の水軍に加わった（『土佐物語』B・『元親記』B・大きさと着いた浜は推）。
    //   本人が大黒丸の着き場に立ち、大船から土佐の兵が浜へ上がり切るまで、寄せてくる北条の物見と弓を払う
    holdS(LAND, '大黒丸の着き場', '大黒丸から土佐の兵が上がる間、着き場を守る', '大黒丸', '殿の大船から兵が上がる',
      [['長宗我部元親', '大黒丸を浜へ寄せよ。土佐の兵を上げる', 3.2], ['組頭', 'あれが殿の大黒丸じゃ。上がり切るまで、ここを守れ', 3.2]],
      [wave(0, '北条の侍', 'なんと大きな船じゃ……上がらせるな！', [foe('北条の物見', LAND.x + 6, LAND.z + 34, [uS(1), uA(8)])]),
        wave(24, '北条の侍', '弓、船の口を射よ！', [foe('北条の浜の弓', LAND.x - 20, LAND.z + 30, [uS(1), uA(5), uB(3)])])],
      { dur: 40, reward: '大黒丸の兵が浜へ上がった' }),
    { kind: 'fight', at: SAKU, obj: '浜の柵の北条の兵を破る', title: '下田', sub: '浜の柵に北条の兵',
      say: [['長宗我部元親', '上がれ！　柵を破れ！', 2.6], ['北条の侍', '海から来たぞ！　浜で止めよ！', 3]],
      foes: [{ name: '北条の浜の兵', from: { x: SAKU.x + 4, z: SAKU.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['北条の侍', '鉄砲、浜を撃て！'], foes: [{ name: '北条の鉄砲', from: { x: SAKU.x + 20, z: SAKU.z + 18 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '浜の柵を破った' },
    holdS({ x: 30, z: 40 }, '浜の舟着き', '港の舟着きを確保し、舟を焼きに来た城兵を受ける', '舟着き', '北条の城兵が舟を焼きに来る', [['組頭', '舟を焼かれれば土佐へ帰れぬ！　守れ！', 3]],
      [wave(0, '北条の侍', '舟を焼け！', [foe('舟焼きの兵', 40, 70, [uS(2), uA(12)])]), wave(30, '北条の侍', '松明を投げよ！', [foe('舟焼きの兵の二', 60, 30, [uS(2), uA(10)])]),
        wave(52, '北条の侍', '弓、舟を射よ！', [foe('北条の弓', 10, 64, [uS(1), uA(8), uB(3)])])], { r: 24, limit: 130, reward: '舟着きを守った' }   /* 11/26 か：act bot が舟着きの輪(16m)に入れず七分止まった→輪を24m・上限130秒 */),
    { kind: 'hold', at: KUCHI, label: '城の下の口', obj: '城の下の口で、城方の反撃を受ける', r: 16, dur: 60, title: '城の下', sub: '北条の城兵が打って出る',
      say: [['長宗我部盛親', '城の下を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['北条の侍', '打って出よ！'], foes: [{ name: '北条の城兵', from: { x: KUCHI.x - 8, z: KUCHI.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['北条の侍', '二の手、続け！'], foes: [{ name: '北条の城兵の二', from: { x: KUCHI.x + 18, z: KUCHI.z + 30 }, list: [uS(2), uA(8), uB(3)] }] }],
      reward: '城の下の口を守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x - 24, z: SAKU.z + 20 }, obj: '浜の岩場で、舟を狙う北条の鉄砲を討つ', max: 100, limit: 90,
      say: [['長宗我部元親', '岩場の鉄砲を討て', 3.2]],
      foes: [{ name: '北条の鉄砲', from: { x: SAKU.x - 12, z: SAKU.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '岩場の鉄砲を討った' },
    { kind: 'fight', at: OTE, obj: '下田城の大手の兵を崩す', title: '大手', sub: '清水康英の兵が踏みとどまる', max: 140,
      say: [['長宗我部元親', '大手じゃ！　押せ！', 3]],
      foes: [{ name: '清水康英の備', from: { x: OTE.x, z: OTE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '清水康英', horse: false } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['北条の侍', '大手を守れ！'], foes: [{ name: '北条の大手の兵', from: { x: OTE.x - 14, z: OTE.z + 16 }, list: [uS(2), uA(8)] }] }],
      reward: '下田城の大手を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '大手を押さえた。城兵は山の曲輪へ退いた', 3]]),
    fightS({ x: -34, z: 60 }, '海側から回った舟子の別働隊と、海に向いた曲輪の鉄砲を黙らせる', '海の曲輪', '舟を撃つ北条の鉄砲', [['長宗我部元親', '舟子を海側から回せ！　曲輪の鉄砲を黙らせよ', 3]],
      [foe('海の曲輪の鉄砲', -44, 72, [uS(1), uG(6)]), foe('海の曲輪の守り', -26, 78, [uS(2), uA(8)])], { later: [wave(28, '北条の侍', '舟を寄せさせるな！', [foe('海の曲輪の槍', -56, 56, [uS(2), uA(8)])])], reward: '海の曲輪の鉄砲を黙らせた' }),
    fightS({ x: 24, z: 96 }, '東の曲輪の柵を破る', '東の曲輪', '柵の内に北条の兵', [['組頭', '東から登れ。本丸はすぐ上じゃ', 3]],
      [foe('東の曲輪の兵', 30, 110, [uS(2), uA(12)])], { limit: 150, later: [wave(26, '北条の侍', '曲輪を守れ！', [foe('東の曲輪の鉄砲', 10, 116, [uS(2), uA(8), uG(2)])])], reward: '東の曲輪を破った' }),
    fightS({ x: 0, z: 110 }, '本丸の前で、本丸へ退いた北条の旗本を崩す', '本丸', '清水康英の旗本が守る', [['長宗我部元親', '旗本を崩せ。あとは囲むだけじゃ', 3]],
      [foe('本丸の旗本', 0, 124, [boss('北条の侍大将', false), uS(3), uA(12)])], { later: [wave(30, '北条の侍', '小田原の後詰が来るまで持たせよ！', [foe('本丸の城兵', -14, 130, [uS(2), uA(8)])])], reward: '北条の旗本を城へ押し込めた' }),
    // K720 二回目：流れ⑨降伏勧告（使いを送り、清水康英の返事を聞く）
    moveS({ x: 0, z: 100 }, '本丸の門', '本丸の門で、降伏を勧める使いを送る', [['長宗我部元親', '康英殿に伝えよ。城を開けば、兵の命は助ける', 3.2], ['清水康英', '……もはや小田原の後詰は来ぬか。城を開けよう', 3.2]], { r: 10, max: 90 }),
  ],
  win: {
    banner: '下田の勝ち', sub: '清水康英が城を開く', award: '下田城を開城させた',
    say: [['組頭', '下田の城が開いた。海から来て、浜を取り、城を開かせたぞ', 3.2],
      ['長宗我部元親', '土佐の舟子も、よう働いた', 3],
      ['長宗我部盛親', '小田原も、もう長くはございますまい', 3]],
  },
});
export default c08_shimoda;
