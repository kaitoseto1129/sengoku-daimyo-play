// 島津家編 10戦目「蒲生合戦」（弘治三年（1557）四月　大隅国 蒲生）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津貴久が、大隅の蒲生範清の蒲生城を攻め、落とした（『島津国史』B・姶良市の解説 C）。兵数は推。山の道と林の泥臭い戦。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'kamou', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 70 };

// 11/26 クラウド K655：蒲生城が場に無く当てられなかった。山の道の奥（z=-60〜-100）に、土塁と柵・門・隅の櫓・本丸の櫓の山城を足す（基本形だけ）
function kamouCastle(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'kamouCastle';
  const earth = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 }), wood = new THREE.MeshStandardMaterial({ color: 0x5a432b, roughness: 0.95 });
  const wall = new THREE.MeshStandardMaterial({ color: 0xc9c0ac, roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1), pyr = new THREE.ConeGeometry(1, 1, 4), post = new THREE.CylinderGeometry(0.18, 0.22, 1, 5);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); };
  const Z = -74;
  // 土塁と柵（門の左右）
  for (const sg of [-1, 1]) { const cx = sg * 24, y = h(cx, Z);
    put(box, earth, cx, y + 1.6, Z, 36, 3.2, 5);
    for (let i = 0; i < 18; i++) { const x = sg * (7 + i * 1.9); put(post, wood, x, h(x, Z + 2.2) + 4.6, Z + 2.2, 1, 3.4, 1); } }
  // 門
  { const y = h(0, Z); put(box, earth, -5.5, y + 2.4, Z, 4, 4.8, 6); put(box, earth, 5.5, y + 2.4, Z, 4, 4.8, 6); put(box, wood, 0, y + 5.4, Z, 15, 1.2, 5.4); put(box, wall, 0, y + 6.8, Z, 11, 1.8, 3.6); put(pyr, roof, 0, y + 9, Z, 13, 2.6, 6.4, Math.PI / 4); }
  // 隅の櫓
  for (const sx of [-1, 1]) { const x = sx * 44, y = h(x, Z); put(box, earth, x, y + 2, Z, 7, 4, 7); put(box, wall, x, y + 5.6, Z, 5, 3.2, 5); put(pyr, roof, x, y + 8.8, Z, 7.6, 3, 7.6, Math.PI / 4); }
  // 奥の本丸：土壇と櫓
  { const z = Z - 26, y = h(0, z); put(box, earth, 0, y + 2.4, z, 26, 4.8, 18); put(box, wall, 0, y + 7.2, z, 12, 4.8, 8); put(box, wall, 0, y + 11.4, z, 8, 3.6, 5.6); put(pyr, roof, 0, y + 14.8, z, 10.4, 3.2, 8, Math.PI / 4);
    for (let i = 0; i < 12; i++) { const x = -12 + i * 2.2; put(post, wood, x, y + 5.8, z + 9.6, 1, 2.4, 1); } }
  rt.scene.add(g);
}
function scene(rt) { try { kamouCastle(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

export const s10_kamou = lightBattle({
  id: "s10_kamou",
  date: "弘治三年（1557）四月　大隅国 蒲生",
  intro: "大隅の山の中。蒲生範清の兵が山道と林に潜む。島津貴久の手が、泥の道を押して蒲生城へ迫る。",
  history: "弘治三年（1557）、島津貴久は大隅の蒲生範清を攻め、蒲生城を落とした。山道と林が多く、小さな競り合いを重ねる泥臭い戦だった。この戦で島津は大隅の北の守りを固め、薩摩・大隅の統一へ進んだ。兵数は諸説ある（『島津国史』B・姶良市の解説 C）。",
  sides: { a: { name: "島津貴久の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "蒲生範清の軍", mon: "kamou", faction: "kamou" } },
  force: { a: 4000, b: 5000 },
  thick: true, playerTaken: 0.36,   // K717：林の伏兵の段で act bot が二度倒れた＝0.45→0.36。K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  setup: scene,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1557, time: "day", fogFar: 300, overcast: true,
    hills: [[-30, -10, 60, 11], [70, 30, 45, 8], [-110, 40, 40, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [-8, 24], [4, -16], [-6, -56], [0, -110]], w: 3 }],
    groves: [{ x: -60, z: 10, r: 30, n: 34 }, { x: 60, z: -10, r: 30, n: 34 }, { x: -40, z: -86, r: 18, n: 16 }],   // 11/26 クラウドせ：城の上に林があり門と本丸が隠れた→林を城の西の脇へ
    trees: 400, tufts: 1400, clearAt: [[0, -88, 50]],   // 蒲生城の土塁から本丸までは木を生やさない
  },
  allies: [
    { name: "島津貴久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津貴久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津貴久", "蒲生は山と林を知り尽くしておる。道を外れるな", 3.4], ["組頭", "泥で足が重い。槍を揃えて、一歩ずつ押せ", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "山道の入口に出る蒲生の先手を押し返す", title: "蒲生", sub: "山道の泥の戦", max: 110,
      say: [["蒲生の侍", "島津を山から出すな！", 3]],
      foes: [{ name: "蒲生の先手", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }, { name: "蒲生の弓", from: { x: 12, z: 4 }, list: [uB(4)] }],
      reward: "山道の入口を押し返した" },
    // K674 足した段（11/26 Sanae・一戦10任務）。11/26 クラウドわ：堀の際の後に山の下へ戻っていた（act bot 1080秒で時間切れ）→山道の入口の後へ移し、上限を付けた
    { kind: 'fight', at: { x: -16, z: 18 }, obj: '林の道で、伏せて待つ蒲生の足軽を討つ', max: 100, limit: 70,
      say: [['組頭', '林に伏せがいる。槍を構えよ', 3.2]],
      foes: [{ name: '蒲生の伏せ', from: { x: -4, z: 6 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '林の伏せを討った' },
    { kind: 'hold', at: { x: 12, z: -2 }, label: '山道の途中で', obj: '山道の途中で、城から出る蒲生の兵を受け止める', r: 16, dur: 45, limit: 70,
      say: [['見張り', '城から打って出て来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '蒲生の兵', from: { x: 24, z: -14 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '蒲生の兵', from: { x: -2, z: 12 }, list: [uS(2), uA(7)] }] }],
      reward: '山道の途中を守った' },
    { kind: 'hold', at: { x: 0, z: -16 }, label: "林の道", obj: "林の中で、左右から出る蒲生の伏兵を受け止める", r: 16, dur: 60, title: "林の戦", sub: "入り乱れる",
      say: [["島津貴久", "林の戦じゃ。旗を見失うな", 3]],
      waves: [{ t: 5, say: ["蒲生の侍", "林から出たぞ！"], foes: [{ name: "蒲生の伏せ（西）", from: { x: -30, z: -22 }, list: [uS(2), uA(10)] }] }, { t: 25, say: ["蒲生の侍", "東からも回れ！"], foes: [{ name: "蒲生の伏せ（東）", from: { x: 30, z: -22 }, list: [uS(2), uA(10), uG(2)] }] }],
      reward: "林の中の伏せを受け止めた" },
    // K717 見せ場（要件書 蒲生）：林を抜けた瞬間、蒲生城とその前に展開する敵軍が一度に見える（伏兵を受けた後に林を抜ける）
    { kind: 'move', at: { x: 0, z: -32 }, label: "林の外", obj: "林の道を抜けて、蒲生城の下へ進む", r: 12, max: 100,
      say: [["組頭", "林を抜けるぞ！　走れ！", 2.6], ["島津貴久", "見よ！　蒲生城じゃ。その前に、敵の備がずらりと並んでおる", 3.6], ["組頭", "あれが蒲生の全軍か……。ここからが本当の戦じゃ", 3.2]] },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    fightS({ x: 40, z: -30 }, '北村の砦の蒲生の兵を破る', '北村の砦', '蒲生の支えの砦', [['島津貴久', '蒲生の城の支えを一つずつ折る', 3]],
      [foe('北村の砦の兵', 46, -44, [uS(2), uA(12)])], { later: [wave(28, '蒲生の侍', '砦を守れ！', [foe('北村の砦の弓', 60, -30, [uS(1), uB(6)])])], reward: '北村の砦を破った', limit: 80 }),
    holdS({ x: -30, z: -40 }, '城の下の田', '城の下の田で、菱刈の後詰を受ける', '菱刈の後詰', '菱刈が蒲生を助けに来る', [['組頭', '菱刈の旗じゃ！　後詰が来たぞ！', 3]],
      [wave(0, '菱刈の侍', '蒲生を助けよ！', [foe('菱刈の後詰', -70, -40, [uS(2), uA(12)])]), wave(30, '菱刈の侍', '横から回れ！', [foe('菱刈の後詰の二', -50, -10, [uS(2), uA(10)])])], { reward: '菱刈の後詰を退けた', limit: 100 }),
    fightS({ x: 20, z: -44 }, '城の外の堀の際で、蒲生の鉄砲衆を払う', '堀の際', '堀の内から鉄砲が撃つ', [['島津貴久', '門へ寄る前に、堀の鉄砲を黙らせよ', 3]],
      [foe('堀の際の鉄砲衆', 26, -58, [uS(1), uG(6)]), foe('堀の際の槍', 10, -62, [uS(2), uA(10)])], { later: [wave(28, '蒲生の侍', '堀を越えさせるな！', [foe('堀の際の守り', 40, -50, [uS(2), uA(8)])])], reward: '堀の際の鉄砲衆を払った', limit: 80 }),
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "蒲生城の門で、蒲生範清の旗本を討つ", title: "蒲生城", sub: "範清の旗本", max: 140, limit: 120,
      say: [["島津貴久", "城が見えた。門を破れ！", 3]],
      foes: [{ name: "蒲生範清の旗本", from: { x: 0, z: -68 }, list: [busho('蒲生範清', { horse: true }), uS(3), uA(12)] }],
      reward: "蒲生城の門を破った" },
    // K652⑥（逸話の段・11/25 ネ三）：蒲生攻めで義弘が先に門の脇へ駆け、櫓の鉄砲頭を討つ（『島津国史』B・兄弟の働きを推す）。出所は journey s10
    fightS({ x: 12, z: -60 }, '門の脇の櫓に駆け上がり、鉄砲頭を討つ', '義弘の先駆け', '櫓から門を撃つ鉄砲頭がいる', [['島津義弘', '兄上、先にゆく。櫓の鉄砲を黙らせる', 3]],
      [foe('櫓の鉄砲頭の手', 14, -66, [busho('蒲生の鉄砲頭', { horse: false }), uS(1), uG(5)])], { reward: '櫓の鉄砲頭を討った', limit: 90 }),
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '範清は城を捨てて逃げた。じゃが本丸にまだ兵がおる', 3]]),
    fightS({ x: 0, z: -84 }, '本丸に籠る蒲生の兵を討つ', '本丸', '逃げ遅れた蒲生の兵', [['島津貴久', '本丸を取れば、蒲生は島津のものじゃ', 3]],
      [foe('本丸の蒲生の兵', 0, -98, [uS(3), uA(12)])], { later: [wave(28, '蒲生の侍', '殿の城を守れ！', [foe('本丸の鉄砲', -16, -104, [uS(1), uG(5)])])], reward: '蒲生城を取った', limit: 110 }),
  ],
  win: {
    banner: "蒲生城 落ちる", sub: "泥の山道を押し通した", award: "蒲生城を攻め落とした",
    say: [["組頭", "蒲生城が落ちた。大隅の北が島津の物になる", 3.2]],
  },
});
export default s10_kamou;
