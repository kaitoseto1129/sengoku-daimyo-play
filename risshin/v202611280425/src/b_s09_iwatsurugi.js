// 島津家編 9戦目「岩剣城の戦い」（天文二十三年（1554）八月　大隅国 岩剣城）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津貴久が、祁答院・蒲生・菱刈の拠る岩剣城を攻めた。義弘の初陣と伝わる（『島津国史』B・霧島市の解説 C）。兵数・城将の名は推。山城を曲輪ごとに登る攻め手の戦。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'kamou', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 70 };

// 11/26 クラウド K655：岩剣城が場に無く当てられなかった。登る道の先（z=-48〜-92）に、段になった曲輪の柵・石垣・櫓・城門・本丸の櫓を足す（基本形だけ・形は使い回し）
function iwatsurugiCastle(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'iwatsurugiCastle';
  const wall = new THREE.MeshStandardMaterial({ color: 0xcfc8b6, roughness: 0.9 }), stone = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.8 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const box = new THREE.BoxGeometry(1, 1, 1), pyr = new THREE.ConeGeometry(1, 1, 4);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); };
  // 曲輪の石垣と柵（手前から 下の曲輪・二の曲輪・本丸）
  for (const [z, hw] of [[-4, 44], [-36, 36], [-66, 28]]) {
    for (const x of [-hw, hw]) { const y = h(x, z); put(box, stone, x, y + 1.6, z, 3.4, 3.2, 3.4); }
    for (let x = -hw; x <= hw; x += 3.2) { if (Math.abs(x) < 5) continue; const y = h(x, z); put(box, wood, x, y + 1.4, z, 0.5, 2.8, 0.5); }
    for (const sg of [-1, 1]) { const x0 = sg * (hw + 5) / 2 + 0, cx = sg * (5 + hw) / 2, y = h(cx, z); put(box, wood, cx, y + 2.6, z, hw - 5, 0.4, 0.5); }
  }
  // 城門と脇の櫓（本丸の手前）
  { const z = -66, y = h(0, z); put(box, stone, -6, y + 2.5, z, 4, 5, 5); put(box, stone, 6, y + 2.5, z, 4, 5, 5); put(box, wood, 0, y + 5.6, z, 16, 1.2, 4.6); put(box, wall, 0, y + 7, z, 12, 2.2, 3.8); put(pyr, roof, 0, y + 9.6, z, 15, 3.2, 6.4, Math.PI / 4); }
  for (const sx of [-1, 1]) { const x = sx * 30, z = -66, y = h(x, z); put(box, stone, x, y + 2, z, 7, 4, 7); put(box, wall, x, y + 6, z, 5.6, 4, 5.6); put(pyr, roof, x, y + 9.6, z, 8.4, 3.2, 8.4, Math.PI / 4); }
  // 本丸の櫓
  { const x = 0, z = -86, y = h(x, z); put(box, stone, x, y + 2.5, z, 20, 5, 14); put(box, wall, x, y + 8, z, 14, 6, 9); put(box, wall, x, y + 13, z, 9, 4, 6); put(pyr, roof, x, y + 16.6, z, 12, 3.4, 8, Math.PI / 4); }
  rt.scene.add(g);
}
function scene(rt) { try { iwatsurugiCastle(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

export const s09_iwatsurugi = lightBattle({
  id: "s09_iwatsurugi",
  date: "天文二十三年（1554）八月　大隅国 岩剣城",
  intro: "険しい山の城、岩剣城。敵は蒲生・菱刈・祁答院の寄り合い。島津貴久の手が、曲輪を一つずつ登って攻める。",
  history: "天文二十三年（1554）八月、島津貴久は、祁答院・蒲生・菱刈らが拠る大隅の岩剣城を攻めた。城は険しい山にあり、攻めは長引いたが、落城した。島津義弘はこの戦が初陣と伝わる。島津はまだ九州最強ではなく、薩摩・大隅の小さな勢力どうしの争いだった。兵数は諸説ある（『島津国史』B・霧島市の解説 C）。",
  sides: { a: { name: "島津貴久の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "岩剣城の蒲生・菱刈・祁答院", mon: "kamou", faction: "kamou" } },
  force: { a: 3000, b: 2000 },
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  setup: scene,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1554, time: "day", fogFar: 320,
    hills: [[0, -20, 70, 10], [-90, 20, 40, 7], [90, 20, 40, 7]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -16], [0, -56], [6, -110]], w: 3 }],
    groves: [{ x: -80, z: 40, r: 26, n: 24 }, { x: 80, z: 40, r: 26, n: 24 }],
    trees: 280, tufts: 1300,
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z - 18 }, list: [busho("島津 義弘"), uS(4), uA(10)] },   // K717：初陣の若い義弘（名の間の空白で若い顔）が、足軽（本人）より前に立つ
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["組頭", "あれが岩剣城じゃ。山の上に曲輪が段になって見える", 3.4], ["島津義弘", "わしの初陣じゃ。曲輪を一つずつ登る。わしの後ろに続け", 3.6]] },
    // K717 ②：山の下で城兵の鉄砲を受ける（要件書 岩剣城 ②）
    holdS({ x: 0, z: 40 }, '山の下', '山の下で、城の鉄砲の弾を受けて耐える', '城の鉄砲', '城の上から鉄砲が撃ち下ろす', [['組頭', '城に鉄砲が居る！　竹束の陰へ伏せよ', 3.2]],
      [wave(2, '城兵', '撃て！　近寄らせるな！', [foe('城の鉄砲', 0, 8, [uS(1), uG(6)])]), wave(18, '城兵', 'もう一度撃て！', [foe('城の鉄砲の二', 14, 10, [uS(1), uG(5)])])], { dur: 30, limit: 55, reward: '城の鉄砲を耐えた' }),
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "竹束を押して急な坂を登り、山の下の曲輪の城兵を押し返す", title: "岩剣城", sub: "険しい山の城", max: 110,
      say: [["城兵", "登らせるな！　石を落とせ！", 3], ["島津義弘", "わしが先に行く！　竹束を押し上げよ！", 3]],
      foes: [{ name: "下の曲輪の城兵", from: { x: 0, z: 12 }, list: [uS(3), uA(14)] }, { name: "城の弓", from: { x: 10, z: 2 }, list: [uB(5)] }],
      reward: "山の下の曲輪を登った" },
    // K674 足した段（11/26 Sanae・一戦10任務）。11/26 クラウドわ：石垣の後に山の下へ戻っていた（足軽の act bot が1080秒で時間切れ）→山の下の曲輪の後へ移し、上限を付けた
    { kind: 'fight', at: { x: -6, z: 0 }, obj: '下の曲輪の木戸を破って、曲輪の中へ入る', max: 100, limit: 70,
      say: [['組頭', '石に気をつけよ。盾を前に', 3.2]],
      foes: [{ name: '木戸の城の足軽', from: { x: -4, z: -8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '下の曲輪へ入った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [["組頭", "傷を縛れ。次は二の曲輪じゃ", 3]] },
    holdS({ x: 0, z: -24 }, '二の曲輪の上', '二の曲輪の下で、蒲生・祁答院の逆寄せを受ける', '祁答院の後詰', '城を助けに後詰が山を登る', [['島津義弘', '後詰じゃ。ここで破れば、城は孤立する', 3.2]],
      [wave(0, '蒲生の侍', '城を助けよ！　島津を挟め！', [foe('祁答院の後詰', -40, -10, [uS(2), uA(12)])])], { reward: '祁答院の後詰を破った', limit: 90 }),
    { kind: 'fight', at: { x: 0, z: -16 }, obj: "二の曲輪を奪い、蒲生・菱刈の兵を破る", title: "二の曲輪", sub: "三家の寄り合いの兵", max: 110,
      say: [["蒲生の侍", "島津を落とせ！　城を守れ！", 3]],
      foes: [{ name: "蒲生の兵", from: { x: -6, z: -28 }, list: [uS(3), uA(12)] }, { name: "菱刈の兵", from: { x: 8, z: -34 }, list: [uS(2), uA(10), uG(3)] }],
      reward: "二の曲輪を破った" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    fightS({ x: 30, z: -40 }, '東の尾根の鉄砲の砦を破る', '東の尾根', '鉄砲が本丸への道を撃つ', [['島津義弘', '鉄砲を黙らせよ。本丸へ登る', 3]],
      [foe('東の尾根の鉄砲', 36, -54, [uS(1), uG(5)]), foe('東の尾根の槍', 24, -60, [uS(2), uA(8)])], { reward: '東の尾根の砦を破った', limit: 80 }),
    // K652⑥（逸話の段・11/25 ネ三）：義弘の初陣＝本人が先に石垣を登り、城の侍大将に一番に斬り込む（『島津国史』B・義弘初陣の伝）。出所は journey s09
    fightS({ x: 0, z: -44 }, '若い義弘に続いて本丸の下の石垣を登り、城の侍大将に斬り込む', '初陣の一番乗り', '義弘の初陣。石垣の上に侍大将が立つ', [['島津義弘', 'わしの初陣じゃ。誰より先に石垣を登る。続け！', 3.2]],
      [foe('石垣の侍大将の手', 0, -50, [busho('菱刈の侍大将', { horse: false }), uS(2), uA(8)])], { reward: '一番乗りで石垣の侍大将を討った', limit: 90 }),
    { kind: 'fight', at: { x: -10, z: -46 }, obj: '本丸の下の木戸で、閉ざそうとする城の兵を退ける', max: 100, limit: 90,
      say: [['組頭', '木戸を閉じさせるな', 3.2]],
      foes: [{ name: '木戸の城の兵', from: { x: 2, z: -58 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '本丸の下の木戸を破った' },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "本丸で、城将の祁答院勢を討つ", title: "本丸", sub: "城将の旗本", max: 150, limit: 100,
      say: [["島津義弘", "あの旗じゃ！　本丸へ押せ！", 3]],
      foes: [{ name: "祁答院の旗本", from: { x: 0, z: -68 }, list: [busho('祁答院良重', { horse: false }), uS(3), uA(10)] }],
      later: [{ t: 18, say: ["城兵", "後詰が来るまで持たせよ！"], foes: [{ name: "本丸の城兵", from: { x: -10, z: -76 }, list: [uS(2), uA(8)] }] }],
      reward: "岩剣城の本丸を落とした" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    holdS({ x: 0, z: -56 }, '本丸', '取った本丸を守り、取り返しに来た蒲生の兵を受ける', '取り返し', '蒲生の兵が本丸を取り返しに来る', [['組頭', '本丸は取った。取り返しに来るぞ', 3]],
      [wave(0, '蒲生の侍', '本丸を取り返せ！', [foe('蒲生の取り返しの手', 0, -96, [uS(2), uA(8)])])], { dur: 40, limit: 70, reward: '岩剣城を守り通した' }),
  ],
  win: {
    banner: "岩剣城 落ちる", sub: "険しい山城を、曲輪ごとに登りきった", award: "岩剣城を攻め落とし、島津の初陣を勝たせた",
    say: [["組頭", "城が落ちた。義弘様の初陣は勝ちじゃ", 3.2], ["島津貴久", "薩摩・大隅はまだ小さな国どうしの争いじゃ。気を抜くな", 3.4]],
  },
});
export default s09_iwatsurugi;
