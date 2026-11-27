// 長宗我部家編 四「渡川の戦い」（天正三年〔1575〕・土佐国 渡川＝四万十川）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：豊後から戻った一条兼定が渡川の西に陣し、川に杭を打って待った。元親は福留親政らに上の瀬を渡らせて横を突き、一条勢を破って土佐を一つにした
//   （『土佐物語』B・四万十市の解説 C。長宗我部約七千・一条約三千五百の説・推）。
// 仕組み：一領具足の呼び集め（川の東の田の影を法螺で呼び、横の備を太らせる）
import * as THREE from 'three';
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const ICHIJO = { flag: 'sagarifuji', armor: 0x2e2a2a };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: 26, z: -58 };     // 法螺の台
const FORD = { x: -30, z: 36 };     // 上の瀬の向こう岸
const BANK = { x: -10, z: 54 };     // 西の岸
const KANE = { x: 8, z: 108 };      // 一条兼定の本陣
const RIVER = [[-220, 20], [-100, 18], [0, 24], [100, 20], [220, 26]];

// K657②：その戦と分かる物＝正面の瀬に打った杭の列（一条が打った）と、上の瀬の浅い石の並び（渡る所の目印）。見た目だけ・一つの InstancedMesh ×2
function riverZ(x) { for (let i = 0; i < RIVER.length - 1; i++) { const a = RIVER[i], b = RIVER[i + 1]; if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return RIVER[RIVER.length - 1][1]; }
function riverDress(rt) {
  const W = rt.world, d = new THREE.Object3D();
  const stakes = [];
  for (let x = -6; x <= 120; x += 3.4) for (const off of [-4.2, 0.3, 4.6]) stakes.push([x + off * 0.4, riverZ(x) + off + Math.sin(x * 1.7 + off) * 0.6]);
  const sm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 2.4, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), stakes.length);
  stakes.forEach(([x, z], i) => { d.position.set(x, (W.heightAt(x, z) || 0) + 0.6, z); d.rotation.set(Math.sin(i * 2.3) * 0.12, 0, Math.cos(i * 1.9) * 0.12); d.updateMatrix(); sm.setMatrixAt(i, d.matrix); });
  sm.instanceMatrix.needsUpdate = true; rt.scene.add(sm);
  const stones = [];
  for (let k = 0; k < 14; k++) stones.push([FORD.x + 18 - k * 2.6 + Math.sin(k * 2.1), riverZ(FORD.x) + 2 + Math.cos(k * 1.3) * 3.2 + (k % 2 ? 1 : -1)]);
  const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.35, 1.1), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1 }), stones.length);
  stones.forEach(([x, z], i) => { d.position.set(x, (W.heightAt(x, z) || 0) + 0.2, z); d.rotation.set(0, i * 0.9, 0); d.updateMatrix(); tm.setMatrixAt(i, d.matrix); });
  tm.instanceMatrix.needsUpdate = true; rt.scene.add(tm);
}

export const c03_shimanto = chosoBattle({
  setup: riverDress,
  id: 'c03_shimanto',
  date: '天正三年（1575）秋　朝　土佐国 渡川',
  intro: '豊後から戻った一条兼定が、渡川の西に陣を張った。川には杭。元親様は、上の瀬を渡って横を突くと決めた。',
  history: '天正三年（1575）、豊後から土佐へ戻った一条兼定は、渡川（四万十川）の西に陣を張り、川に杭を打って長宗我部を待った。元親は兵の一手に上の瀬を渡らせて横から突き、一条勢を破った。兼定は再び豊後へ逃れ、土佐は長宗我部の手で一つになった（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '一条の軍', mon: 'sagarifuji', faction: 'miyoshi' } },
  force: { a: 7000, b: 3500 },
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: ICHIJO,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1575, time: 'morning', fogFar: 440, autumn: true, mist: 0.25,
    river: RIVER, riverW: 16, riverDepth: 0.6,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 110, 80, 24], [160, 130, 80, 22], [0, 240, 110, 26], [-150, -150, 80, 20], [150, -150, 80, 22]],
    paths: [{ pts: [[0, -140], [0, -40], [-30, 36], [-10, 54], [8, 108], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 120 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: -170, z: 110, r: 30, n: 26 }, { x: 160, z: 130, r: 30, n: 26 }, { x: 150, z: -150, r: 30, n: 22 }],
    trees: 360, tufts: 1800,
  },
  fields: [{ at: { x: 60, z: -42 }, far: 0 }, { at: { x: -44, z: -52 }, far: 1 }, { at: { x: 70, z: -98 }, far: 2 }, { at: { x: -56, z: -98 }, far: 3 }],
  callSay: ['福留親政', '集まったぞ！　上の瀬へ回る！', '……遅い。集まった者だけで渡る'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '福留親政の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('福留親政'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '正面の瀬には杭がある。上の瀬を渡って横を突け', 3.4],
      ['組頭', 'まず法螺の台じゃ。畦の者を呼んで、手を太らせる', 3.2],
      ['福留親政', '霧の晴れぬうちに渡りまするぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: FORD, obj: '上の瀬を渡り、一条の横の備を破る', title: '渡川', sub: '上の瀬の向こうに一条の備',
      say: [['福留親政', '渡れ！　一条の横を突け！', 2.8], ['一条の侍', '瀬を渡ってきたぞ！　防げ！', 3]],
      foes: [{ name: '一条の横の備', from: { x: FORD.x + 4, z: FORD.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['一条の侍', '弓、瀬を射よ！'], foes: [{ name: '一条の弓', from: { x: FORD.x + 22, z: FORD.z + 16 }, list: [uS(1), uB(6)] }] }],
      max: 120, reward: '渡川の上の瀬を渡った' },
    { kind: 'hold', at: BANK, label: '西の岸', obj: '西の岸を守り、一条の寄せを受ける', r: 16, dur: 60, title: '西の岸', sub: '一条の寄せ',
      say: [['長宗我部元親', '岸を取った！　本隊も渡るぞ、そこを守れ！', 3.2]],
      waves: [{ t: 0, say: ['一条の侍', '川へ押し戻せ！'], foes: [{ name: '一条の先陣', from: { x: BANK.x + 10, z: BANK.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['一条の侍', '二陣、かかれ！'], foes: [{ name: '一条の二陣', from: { x: BANK.x + 26, z: BANK.z + 28 }, list: [uS(2), uA(10)] }] }],
      reward: '西の岸を守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FORD.x - 20, z: FORD.z + 20 }, obj: '川の杭の陰で、渡る者を狙う一条の弓を討つ', max: 100, limit: 90,
      say: [['長宗我部元親', '杭の陰の弓を黙らせよ', 3.2]],
      foes: [{ name: '一条の弓', from: { x: FORD.x - 8, z: FORD.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '杭の陰の弓を討った' },
    { kind: 'hold', at: { x: FORD.x + 20, z: FORD.z + 28 }, label: '向こう岸の陣', obj: '向こう岸の陣で、川を渡り返す一条の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '川を渡り返して来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '渡り返す一条の兵', from: { x: FORD.x + 32, z: FORD.z + 16 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '渡り返す一条の兵', from: { x: FORD.x + 6, z: FORD.z + 42 }, list: [uS(2), uA(7)] }] }],
      reward: '向こう岸の陣を守った' },
    { kind: 'fight', at: KANE, obj: '一条兼定の本陣を崩す', title: '一条兼定', sub: '本陣の幕の前で踏みとどまる', max: 140,
      say: [['長宗我部元親', '兼定の本陣じゃ！　押せ！', 3]],
      foes: [{ name: '一条兼定の本陣', from: { x: KANE.x, z: KANE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '一条兼定', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['一条の侍', '御所様を守れ！'], foes: [{ name: '一条の旗本', from: { x: KANE.x - 14, z: KANE.z + 18 }, list: [uS(3), uA(8)] }] }],
      reward: '一条兼定の本陣を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '御所様の本陣が崩れた。中村へ退くぞ、追え', 3]]),
    fightS({ x: 40, z: 90 }, '中村への道で、一条の殿を追い崩す', '一条の殿', '御所の退きを守る兵', [['長宗我部元親', '兼定を土佐から追い出す。追え！', 3]],
      [foe('一条の殿', 50, 104, [uS(2), uA(12)])], { later: [wave(28, '一条の侍', '御所様を逃がせ！', [foe('一条の殿の弓', 60, 84, [uS(1), uB(6)])])], reward: '一条の殿を崩した' }),
    holdS({ x: 30, z: 60 }, '川の辻', '川の辻を守り、返してきた伊予の加勢を受ける', '伊予の加勢', '一条の後詰が返す', [['組頭', '伊予の加勢じゃ！　辻を守れ！', 3]],
      [wave(0, '伊予の侍', '一条の御家を助けよ！', [foe('伊予の加勢', 40, 96, [uS(2), uA(12)])]), wave(30, '伊予の侍', '横から回れ！', [foe('伊予の加勢の二', 64, 70, [uS(2), uA(10)])]),
        wave(54, '一条の侍', 'まだじゃ！　押し返せ！', [foe('一条の残りの手', 10, 94, [uS(1), uA(8), uG(2)])])], { reward: '伊予の加勢を止めた' }),
    fightS({ x: -40, z: 96 }, '栗本城に籠る一条の兵を破る', '栗本城', '一条の砦に兵が残る', [['長宗我部元親', '栗本の砦を取れば、渡川は土佐のものじゃ', 3.2]],
      [foe('栗本城の兵', -50, 112, [uS(2), uA(12)]), foe('栗本城の弓', -30, 118, [uB(5)])], { later: [wave(26, '一条の侍', '門を守れ！', [foe('栗本城の門の兵', -56, 124, [uS(2), uA(8)])])], reward: '栗本城を取った' }),
    fightS({ x: 4, z: 128 }, '中村の御所の前で、一条の旗本の残りを討つ', '中村', '御所を守る最後の旗本', [['組頭', '御所はもぬけの殻じゃ。残った旗本を討て', 3]],
      [foe('一条の旗本の残り', 4, 142, [boss('一条の侍大将'), uS(3), uA(10)])], { later: [wave(30, '一条の侍', '御所を焼かせるな！', [foe('御所の守り', -16, 148, [uS(2), uA(8)])])], reward: '中村の御所を押さえた' }),
  ],
  win: {
    banner: '渡川の勝ち', sub: '一条兼定が豊後へ逃れる', award: '渡川で一条兼定を破った',
    say: [['組頭', '一条の兵が散っていく。土佐はこれで一つじゃ', 3.2],
      ['城下の者', '土佐が、一つになった……十五年じゃ。長かった', 3],
      ['長宗我部元親', '一領具足の槍、見事であった', 3],
      ['福留親政', '次は、四国でございますな', 3]],
  },
});
export default c03_shimanto;
