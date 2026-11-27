// 島津家編 13戦目「日向の追撃（三州統一）」（天正五年（1577）十二月　日向国 縣への道）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：高原城の後、伊東義祐は日向を捨てて豊後の大友を頼った。島津は日向を取り、薩摩・大隅・日向の三州をまとめた（『上井覚兼日記』A）。追撃の戦の詳しい場所・兵数は推（出所と「推した」訳：伊東の退去の道を一つの追撃戦にまとめた）。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'ito', armor: 0x2a2a30 };
const SPAWN = { x: 0, z: 70 };

// K717 日向の追撃 最後：丘のあちこちに島津の旗が立つ（要件書「敵を全滅させない。丘から島津の旗が広い範囲に立っているのを見せる」）。終わりの二段と勝ちの時だけ現れる（形は基本形だけ・使い回し）
function hillFlags(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'shimazuHillFlags'; g.visible = false;
  const pole = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }), cloth = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide }), mark = new THREE.MeshStandardMaterial({ color: 0x1c1a1a, roughness: 0.8, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(1, 1, 1), ring = new THREE.CircleGeometry(0.62, 12);
  const at = [[-96, -70], [-64, -104], [-30, -128], [10, -118], [48, -132], [84, -98], [112, -64], [-122, -112], [128, -118], [-10, -160], [60, -170], [-70, -150]];
  for (const [x, z] of at) {
    const y = h(x, z), a = new THREE.Mesh(box, pole); a.position.set(x, y + 4.5, z); a.scale.set(0.18, 9, 0.18); g.add(a);
    const c = new THREE.Mesh(box, cloth); c.position.set(x + 1.3, y + 7.4, z); c.scale.set(2.6, 3.2, 0.05); g.add(c);
    const m = new THREE.Mesh(ring, mark); m.position.set(x + 1.3, y + 7.4, z + 0.04); g.add(m);
  }
  rt.scene.add(g); rt.flags.hillFlags = g;
}
function scene(rt) { try { hillFlags(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

export const s13_hyuga = lightBattle({
  id: "s13_hyuga",
  date: "天正五年（1577）十二月　日向国 縣への道",
  intro: "伊東義祐が日向を捨てて、豊後へ逃げる。島津の兵は、殿の伊東勢を追い散らして道を進む。",
  history: "天正五年（1577）十二月、高原城を失った伊東義祐は、日向を捨てて豊後の大友宗麟を頼った。島津は日向の城を次々に取り、薩摩・大隅・日向の三つの国をまとめた（三州統一）。この追撃戦の場所と兵数は、伊東の退去の道を一つにまとめたもので、確かでない（『上井覚兼日記』A）。",
  sides: { a: { name: "島津の追撃軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "退く伊東勢", mon: "ito", faction: "ito" } },
  force: { a: 10000, b: 5000 },
  thick: true, playerTaken: 0.36,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  setup: scene,
  update(rt) { const g = rt.flags.hillFlags; if (g && !g.visible && ((rt.flags.step || 0) >= 11 || rt.flags.ending)) g.visible = true; },   // 終わりの二段から丘に島津の旗
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1577, time: "day", fogFar: 320, overcast: true,
    hills: [[0, -20, 70, 10], [-90, 20, 40, 7], [90, 20, 40, 7]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -16], [0, -56], [6, -110]], w: 3 }],
    groves: [{ x: -80, z: 40, r: 26, n: 24 }, { x: 80, z: 40, r: 26, n: 24 }],
    trees: 280, tufts: 1300,
  },
  allies: [
    { name: "島津義久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
    { name: "島津の騎馬", at: { x: SPAWN.x - 14, z: SPAWN.z - 8 }, list: [{ type: 'cavalry', n: 5 }] },   // K717 ⑦：騎馬が逃げる兵を追う
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [["組頭", "見よ。伊東の軍が敗れて、荷を捨てて逃げてゆく", 3.2], ["島津義久", "伊東は豊後へ逃げる。道に殿を残し、足を遅らせる気じゃ。追撃にかかれ", 3.6], ["組頭", "追え。じゃが、先走るな。殿は手強い", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "坂で向き直った伊東の殿を崩す", title: "伊東の殿", sub: "逃げる軍の後ろ", max: 110,
      say: [["伊東の侍", "殿の務めじゃ！　坂で向き直れ！　ここで止めよ！", 3]],
      foes: [{ name: "伊東の殿", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }],
      reward: "伊東の殿を破った" },
    { kind: 'move', at: { x: 0, z: -16 }, label: "峠の道", obj: "逃げる伊東勢を追って、村道から峠の道へ進む", r: 12, max: 100,
      say: [["島津義久", "荷駄が落ちておる。急げ、追いつくぞ", 3]] },
    { kind: 'fight', at: { x: 0, z: -16 }, obj: "再び防衛線を作った峠の伊東の備を破る", title: "峠の戦", sub: "最後の抵抗", max: 110,
      say: [["伊東の侍", "殿を豊後へお送りせよ！", 3]],
      foes: [{ name: "峠の伊東勢", from: { x: 0, z: -28 }, list: [uS(3), uA(12), uG(3)] }],
      later: [{ t: 30, say: ["伊東の侍", "もう持たぬ……"], foes: [{ name: "伊東の後詰", from: { x: -10, z: -36 }, list: [uS(2), uA(8)] }] }],
      reward: "峠の伊東勢を破った" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    holdS({ x: 0, z: -30 }, '峠の道', '峠の道を守り、返してきた伊東の手を受ける', '伊東の返し', '逃げる伊東が峠で返す', [['組頭', '返してきた！　峠を渡すな！', 3]],
      [wave(0, '伊東の侍', '殿を逃がせ！　返せ！', [foe('伊東の返しの手', 0, -70, [uS(2), uA(12)])]), wave(30, '伊東の侍', '横から回れ！', [foe('伊東の返しの二', -40, -60, [uS(2), uA(10)])]),
        wave(52, '伊東の侍', '弓、射かけよ！', [foe('伊東の弓', 40, -60, [uS(1), uA(6), uB(4)])])], { reward: '伊東の返しを受けきった' }),
    fightS({ x: -40, z: -40 }, '山道に伏せた伊東の兵を払う', '山道の伏せ', '山道に伊東の兵が伏せる', [['島津義久', '伏せがおる。用心して払え', 3]],
      [foe('山道の伏せ', -50, -54, [uS(2), uA(12)])], { later: [wave(28, '伊東の侍', '今じゃ、突け！', [foe('山道の伏せの二', -30, -66, [uS(2), uA(8)])])], reward: '山道の伏せを払った' }),
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: -16, z: 18 }, obj: '街道を逃げる伊東の兵を、味方の騎馬と共に追って討つ', max: 100, limit: 90,
      say: [['組頭', '騎馬が逃げる兵を追うぞ！　わしらも続け', 3.2]],
      foes: [{ name: '逃げる伊東の足軽', from: { x: -4, z: 6 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '逃げる伊東の兵を追い討った' },
    { kind: 'hold', at: { x: 18, z: -6 }, label: '峠の下の道で', obj: '「追いすぎるな」の下知を聞き、峠の下の道で、追われて返す伊東の兵を受け止める', r: 16, dur: 45,
      say: [['島津義久', '追いすぎるな！　陣を整えよ。窮鼠は猫を噛むぞ', 3.4], ['見張り', '追われた伊東が返して来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '返す伊東の兵', from: { x: 30, z: -18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '返す伊東の兵', from: { x: 4, z: 8 }, list: [uS(2), uA(7)] }] }],
      reward: '峠の下の道を守った' },
    // K656 見せ場（11/26 え）：義祐の子・伊東祐兵は父と共に豊後へ落ちた（史実）。その護りの手を討つ
    { kind: 'fight', at: { x: 10, z: -44 }, obj: '豊後へ落ちる伊東祐兵の護りの手を討つ', max: 100, limit: 90,
      say: [['組頭', '義祐の御子・祐兵も、父と豊後へ落ちるぞ。護りの手を崩せ', 3.4], ['伊東の侍', '若殿を豊後へ！　ここは通さぬ！', 3]],
      foes: [{ name: '伊東祐兵の護り', from: { x: 14, z: -56 }, list: [busho('伊東祐兵', { horse: true }), uS(2), uA(10)] }],
      reward: '伊東祐兵の護りを破った' },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "縣の入口で、伊東の旗本を追い散らす", title: "日向の城", sub: "伊東の最後の旗本", max: 130,
      say: [["島津義久", "日向はもう島津の物じゃ。追い切れ", 3]],
      foes: [{ name: "伊東の旗本", from: { x: 0, z: -68 }, list: [busho('伊東の殿', { horse: true }), uS(3), uA(10)] }], limit: 100,
      reward: "伊東の旗本を追い散らした" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '伊東義祐は豊後へ落ちた。縣の城に、まだ兵が残る', 3.2]]),
    fightS({ x: 30, z: -86 }, '縣の城の門で、伊東の残りの兵を討つ', '縣の城', '城に残った伊東の兵', [['島津義久', '日向はこれで島津のものじゃ', 3]],
      [foe('縣の城の兵', 40, -100, [uS(2), uA(12)])], { later: [wave(28, '伊東の侍', '門を守れ！', [foe('縣の門の鉄砲', 20, -110, [uS(1), uG(5)])])], reward: '縣の城を取った', limit: 90 }),
    holdS({ x: 0, z: -90 }, '縣の城の前', '城の前で、豊後へ落ちる伊東の殿の返しを受ける', '伊東の殿', '伊東の殿が最後に返す', [['組頭', '殿が返してきた。これが最後じゃ', 3]],
      [wave(0, '伊東の侍', '殿様が豊後へ入るまで！', [foe('伊東の殿の返し', 0, -130, [uS(2), uA(12)])]), wave(30, '伊東の侍', '一太刀でも！', [foe('伊東の殿の返しの二', -36, -120, [uS(2), uA(10)])])], { reward: '伊東の殿を受けきった', dur: 60, limit: 80 }),
  ],
  win: {
    banner: "三州統一", sub: "日向を取り、薩摩・大隅・日向がまとまった", award: "伊東勢を追い、日向を取って三州をまとめた",
    say: [["組頭", "丘へ上がって見渡せ。日向の国の広くに、島津の旗が立っておる", 3.4], ["島津義久", "薩摩・大隅・日向。三つの国が島津の物になった", 3.4], ["組頭", "じゃが、豊後の大友が黙ってはおらぬぞ", 3.2]],
  },
});
export default s13_hyuga;
