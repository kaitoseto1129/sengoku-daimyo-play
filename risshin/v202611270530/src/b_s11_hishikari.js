// 島津家編 11戦目「菱刈合戦」（永禄九年（1566）頃　薩摩国 北薩の川）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：北薩の菱刈氏が相良氏の助けを受けて島津と争った（『島津国史』B・『相良家文書』A）。年・兵数・川の名は推（一六〇年代、とだけ分かる）。旗が近すぎて入り乱れる戦。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

// 11/26 クラウドナ三 K656 s11：平らな野に兵だけで当てられなかった。川の浅瀬の杭と、向こう岸の乱杭の柵・物見櫓・菱の紋の幕（菱刈の本陣）・大口城の門を足す（基本形だけ・毎コマ作らない）
function hishikariScene(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'hishikariScene';
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }), board = new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.9, side: THREE.DoubleSide }), diam = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(1, 1, 1), pyr = new THREE.ConeGeometry(1, 1, 4), cyl = new THREE.CylinderGeometry(0.12, 0.16, 1, 5), plane = new THREE.PlaneGeometry(1, 1);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; m.rotation.z = rz; g.add(m); return m; };
  // 川の浅瀬の杭の列（渡りの目印・川の中）
  for (const x of [-8, 8]) for (let z = -6; z <= 10; z += 3) { const y = h(x, z); put(cyl, wood, x, y + 0.7, z, 1.4, 2.4, 1.4); }
  // 向こう岸の乱杭の柵（斜めの杭を並べる）。真ん中の道（x≈0）は開ける
  for (const z0 of [-22, -58]) for (let x = -70; x <= 70; x += 3.2) { if (Math.abs(x) < 9) continue; const y = h(x, z0); put(cyl, wood, x, y + 0.8, z0 + Math.sin(x) * 0.6, 1.2, 2.2, 1.2, 0, (x % 6.4 < 3.2 ? 0.35 : -0.35)); }
  // 物見櫓（岸の左右）
  for (const [x, z] of [[-46, -36], [46, -36], [-24, -118]]) { const y = h(x, z);
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) put(cyl, wood, x + dx, y + 2.3, z + dz, 1.6, 4.8, 1.6);
    put(box, wood, x, y + 4.9, z, 3.6, 0.3, 3.6); put(box, board, x, y + 5.7, z, 3.0, 1.4, 3.0); put(pyr, board, x, y + 7.1, z, 4.6, 1.5, 4.6, Math.PI / 4); }
  // 菱刈の本陣の幕（菱の紋の白い菱）
  for (let i = -3; i <= 3; i++) { const x = i * 6, z = -90, y = h(x, z); put(plane, cloth, x, y + 1.8, z, 5.8, 3.4, 1); put(plane, diam, x, y + 1.8, z + 0.05, 2.0, 2.0, 1, 0, Math.PI / 4); put(cyl, wood, x - 3, y + 1.8, z, 1.2, 3.8, 1.2); }
  // 大口城の門（戸神尾の奥）
  { const x = 0, z = -152, y = h(x, z); put(cyl, wood, x - 4, y + 3, z, 2.4, 6, 2.4); put(cyl, wood, x + 4, y + 3, z, 2.4, 6, 2.4); put(box, wood, x, y + 6.4, z, 11, 0.7, 1.2); put(pyr, board, x, y + 7.8, z, 10, 2, 3.4, Math.PI / 4); }
  rt.scene.add(g);
}
function scene(rt) { try { hishikariScene(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'hishikari', armor: 0x2a3036 };
const SPAWN = { x: 0, z: 70 };

export const s11_hishikari = lightBattle({
  id: "s11_hishikari",
  date: "永禄九年（1566）頃　薩摩国 北薩の川",
  intro: "北薩の川の岸。菱刈と相良の旗が近すぎて、敵味方の見分けも付かぬ。島津の手が、川を渡って押し合う。",
  history: "永禄の頃（1560年代）、北薩の菱刈氏は、肥後の相良氏の助けを受け、島津と戦った。川と山に挟まれた狭い土地で、両軍の旗が近く、敵味方が入り乱れる戦になった。ここでの勝ちが、島津の北薩支配の足がかりになった。年・兵数は諸説あり、確かでない（『島津国史』B・『相良家文書』A）。",
  sides: { a: { name: "島津の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "菱刈・相良の軍", mon: "hishikari", faction: "hishikari" } },
  force: { a: 5000, b: 5000 },
  thick: true, playerTaken: 0.38,   // K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  setup: scene,
  world: {
    seed: 1566, time: "day", fogFar: 320,
    river: [[-200, 0], [-80, -2], [0, 4], [80, 2], [200, 6]], riverW: 14,
    hills: [[-90, -50, 45, 8], [90, -50, 45, 8], [0, 150, 70, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -30], [0, -80]], w: 3 }],
    groves: [{ x: -80, z: 50, r: 24, n: 22 }, { x: 80, z: 50, r: 24, n: 22 }],
    trees: 240, tufts: 1300,
  },
  allies: [
    { name: "島津義久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [["組頭", "対岸に菱刈の旗が並んでおる。川は浅く見えて、足が取られる", 3.4], ["島津義久", "菱刈に、相良が加勢しておる。旗が近い。味方の旗をよう見よ", 3.6], ["組頭", "水を渡った直後が一番危ない。向こう岸で崩されるな", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "川の手前に出た菱刈の先手を押し返す", title: "菱刈", sub: "川の岸の戦", max: 110,
      say: [["菱刈の侍", "川を渡らせるな！", 3]],
      foes: [{ name: "菱刈の先手", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }],
      reward: "川の手前を押し返した" },
    { kind: 'move', at: { x: 0, z: -30 }, label: "川の向こう", obj: "浅瀬を探し、鉄砲と弓を受けながら川を渡る", r: 12, max: 100,
      say: [["島津義久", "浅瀬はあそこじゃ。渡れ！", 3], ["菱刈の侍", "渡る所を撃て！　水の中で討ち取れ！", 3]] },
    { kind: 'hold', at: { x: 0, z: -30 }, label: "川の向こう", obj: "向こう岸で隊列を組み直し、入り乱れる敵を受け止める", r: 18, dur: 60, title: "入り乱れる", sub: "旗が近すぎる",
      say: [["組頭", "槍を揃えよ！　濡れたまま崩されるな", 3], ["組頭", "旗をよく見よ！　赤い縁が味方じゃ", 3]],
      waves: [{ t: 5, say: ["相良の侍", "相良勢、前へ！"], foes: [{ name: "相良の加勢", from: { x: -14, z: -44 }, list: [uS(3), uA(12)] }] }, { t: 28, say: ["菱刈の侍", "菱刈の本隊、押せ！"], foes: [{ name: "菱刈の本隊", from: { x: 14, z: -48 }, list: [uS(3), uA(12), uG(2)] }] }],
      reward: "入り乱れる中を持ちこたえた" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    // K717 ⑥：敵の騎馬が土手沿いに回る
    fightS({ x: -40, z: -20 }, '土手沿いに回る菱刈の騎馬を、槍を揃えて止める', '土手の騎馬', '菱刈の騎馬が土手沿いに回り込む', [['島津義久', '土手沿いに騎馬が回る！　槍を揃えよ！', 3]],
      [foe('土手沿いの菱刈の騎馬', -56, -36, [{ type: 'cavalry', n: 4 }, uS(1), uA(6)])], { later: [wave(26, '相良の侍', '騎馬に続け！', [foe('土手の相良の槍', -30, -40, [uS(2), uA(8)])])], reward: '土手沿いの騎馬を止めた' }),
    holdS({ x: 30, z: -50 }, '川の向こうの丘', '別働隊が渡る間、川向こうの丘を守り、相良の新手を受ける', '相良の新手', '相良の加勢が丘へ寄せる', [['島津義久', '別働隊が上流を渡っておる。それまで丘を持たせよ', 3.2], ['組頭', '相良の新手じゃ！　旗を見分けよ！', 3]],
      [wave(0, '相良の侍', '島津を川へ落とせ！', [foe('相良の新手', 40, -90, [uS(2), uA(12)])]), wave(30, '相良の侍', '横から回れ！', [foe('相良の新手の二', 70, -60, [uS(2), uA(10)])])], { reward: '相良の新手を受けきった' }),
    fightS({ x: -20, z: -54 }, '菱刈の横の備を破る', '菱刈の横の備', '菱の旗の横の備', [['島津義久', '横を崩せば、大将の備が裸になる', 3]],
      [foe('菱刈の横の備', -30, -68, [uS(2), uA(12)])], { later: [wave(28, '菱刈の侍', '横を守れ！', [foe('菱刈の横の弓', -44, -56, [uS(1), uB(6)])])], reward: '菱刈の横の備を破った' }),
    { kind: 'fight', at: { x: 0, z: -70 }, obj: "川を下りてくる菱刈の本隊を受け、大将の備を崩す", title: "菱刈の旗本", sub: "大将の備", max: 140,
      say: [["島津義久", "あの菱の旗じゃ！　討て！", 3], ["菱刈隆秋", "この菱刈、先祖代々の地じゃ。一歩も退かぬ！", 3]],
      foes: [{ name: "菱刈の旗本", from: { x: 0, z: -82 }, list: [busho('菱刈隆秋', { horse: true }), uS(3), uA(10)] }],
      reward: "菱刈の旗本を崩した" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '菱刈は大口の城へ退いた。追うぞ', 3]]),
    fightS({ x: 30, z: -96 }, '川を背に押し合い、大口城へ逃げ込む菱刈の兵を追う', '大口への道', '菱刈の兵が大口城へ逃げる', [['島津義久', '城へ入れるな。道で討て', 3]],
      [foe('大口へ逃げる兵', 40, -110, [uS(2), uA(12)])], { later: [wave(28, '菱刈の侍', '城の門を開けよ！', [foe('大口の門の兵', 20, -124, [uS(2), uA(8)])])], reward: '大口への道で菱刈を討った', limit: 90 }),
    holdS({ x: 0, z: -100 }, '戸神尾', '戸神尾で、大口城から打って出た相良・菱刈の兵を受ける', '戸神尾', '城兵が打って出る', [['組頭', '城から打って出てきた！　ここで受けて返すぞ', 3]],
      [wave(0, '相良の侍', '島津を追い払え！', [foe('大口の城兵', 0, -140, [uS(2), uA(12)])]), wave(30, '菱刈の侍', '押せ、押せ！', [foe('大口の城兵の二', -36, -130, [uS(2), uA(10)])]),
        wave(52, '相良の侍', '弓、放て！', [foe('大口の弓', 36, -130, [uS(1), uA(6), uB(4)])])], { reward: '戸神尾で城兵を受けきった', dur: 60, limit: 80 }),
    fightS({ x: 0, z: -130 }, '大口城の門で、相良の旗本を崩す', '大口城', '相良の旗本が門を守る', [['島津義久', '大口を取れば、北薩は島津のものじゃ', 3]],
      [foe('大口の相良の旗本', 0, -144, [boss('相良の侍大将'), uS(3), uA(10)])], { later: [wave(30, '相良の侍', '門を守れ！', [foe('大口の門の守り', -16, -150, [uS(2), uA(8)])])], reward: '大口城の門を破った', limit: 110 }),
  ],
  win: {
    banner: "菱刈勢 崩れる", sub: "入り乱れる川の戦を勝った", award: "菱刈・相良の軍を川の戦で破った",
    say: [["島津義久", "旗の見分けを誤らなんだ。よう戦うた", 3.2]],
  },
});
export default s11_hishikari;
