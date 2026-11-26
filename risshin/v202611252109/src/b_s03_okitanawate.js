// 島津家編 三戦目「沖田畷の戦い」（天正十二年〔1584〕三月・肥前国 島原 沖田畷）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④）
//   史実：龍造寺隆信の約二万五千が、有馬晴信を助ける島津家久・有馬の勢（約五千〜）を海と沼に挟まれた細い畷道で攻め、
//   島津の先手の偽りの退きに引かれて道に長く伸びたところを、沼の際の伏兵と鉄砲で挟まれた。隆信は討ち取られた（『北肥戦誌』B・島原市の解説 C。有馬勢の数は推）。
//   三拍の手は tsuri_nobuse.js（木崎原と同じ）。違いは地形：両側が沼で、敵は一本の道に長く伸びる（深追いが絵で分かる）。字・札・ボタンは足さない。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const RYUZOJI = { flag: 'ryuzoji', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: -24 };
const STRIKE = { x: 0, z: 34 };
const LURE = { x: 0, z: -76 };
const KILL = { x: 0, z: -58 };
const TAISHO = { x: 4, z: 22 };
const GROVE_L = { x: -46, z: -50 }, GROVE_R = { x: 46, z: -50 };   // 沼の向こうの際（鉄砲の伏兵）

// 沼の底（K657②）：畷の両側に二列ずつ、浅い窪みを並べる（hills の負の高さ）。z=-160〜44。縁は x=±9 あたりで水面に入る
const MARSH = [];
for (let z = -160; z <= 44; z += 12) for (const x of [-28, -16, 16, 28]) MARSH.push([x, z, 8, -0.75]);
// 沼の葦（K657②）：一つの InstancedMesh（形一つ・材質一つ・一度だけ）。水際から沼の中へ株を散らす
function reeds(rt) {
  const W = rt.world; if (!W?.heightAt) return;
  // 一株＝細い葉の三角を十一枚（外へ少し傾く）。根は暗く、穂先は枯れ色
  const pos = [], col = [], B = 11;
  for (let i = 0; i < B; i++) {
    const a = (i / B) * 6.28 + Math.sin(i * 7.1) * 0.6, r0 = 0.05 + (i % 4) * 0.07, hh = 1.1 + ((i * 37) % 10) / 10 * 1.1, lean = 0.12 + (i % 3) * 0.14;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * 0.035, pz = cx * 0.035, bx = cx * r0, bz = cz * r0;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + cx * lean * hh, hh, bz + cz * lean * hh);
    col.push(0.30, 0.31, 0.20, 0.30, 0.31, 0.20, 0.62, 0.58, 0.38);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const N = 2600, m = new THREE.InstancedMesh(geo, mat, N), o = new THREE.Object3D();
  let k = 0, s = 1584;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < N * 6 && k < N; t++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 32), z = -165 + rnd() * 214, h = W.heightAt(x, z);
    if (h > -0.3 || h < -1.3 || (h < -0.6 && rnd() < 0.75)) continue;   // 水際に厚く、深い所は疎ら
    const sc = 0.6 + rnd() * 0.7;
    o.position.set(x, Math.max(h, -0.45), z); o.rotation.set((rnd() - 0.5) * 0.25, rnd() * 6.28, (rnd() - 0.5) * 0.25); o.scale.set(sc, sc * (0.8 + rnd() * 0.6), sc);
    o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
  }
  m.count = k; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.receiveShadow = true;
  rt.scene.add(m);
}

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
  playerTaken: 0.38,   // K652②（11/25）：10分の戦に延ばした（段を足した。厚み thick は畷の伏せの段で act bot が囲まれて倒れたので使わない）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: RYUZOJI,
  setup(rt) { try { reeds(rt); } catch (e) { /* 葦が無くても戦は続ける */ } },
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1584, time: 'day', fogFar: 440, overcast: true,
    // K657②（11/25 す）：沼の水面（-0.4）が地面（0）の下に潜って見えなかった。畷の両側の地面を沼の底まで下げ（MARSH）、水と葦を見せる。道は中の約十八歩
    sea: [{ pts: [[-22, -170], [-22, -40], [-22, 52]], w: 30, depth: 0.5, still: true, levelAt: () => -0.4 }, { pts: [[22, -170], [22, -40], [22, 52]], w: 30, depth: 0.5, still: true, levelAt: () => -0.4 }],
    hills: [[-120, -60, 46, 8], [120, -60, 46, 8], [0, -190, 90, 20], ...MARSH],
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
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'hold', at: { x: STRIKE.x - 14, z: STRIKE.z + 12 }, label: '畷道の脇の沼', obj: '畷道の脇の沼で、泥に足を取られた龍造寺の兵を押し留める', r: 16, dur: 45,
      say: [['見張り', '龍造寺が泥に嵌まった！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '泥の龍造寺の兵', from: { x: STRIKE.x - 2, z: STRIKE.z + 0 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '泥の龍造寺の兵', from: { x: STRIKE.x - 28, z: STRIKE.z + 26 }, list: [uS(2), uA(7)] }] }],
      reward: '畷道の脇の沼を守った' },
    { kind: 'fight', at: TAISHO, obj: '龍造寺隆信の備を崩す', title: '龍造寺隆信', sub: '隆信の本陣が乱れる', max: 140,
      say: [['島津家久', '隆信の旗はそこじゃ！　押せ！', 3]],
      foes: [{ name: '龍造寺隆信の備', from: { x: TAISHO.x, z: TAISHO.z + 12 }, list: [{ type: 'samurai', n: 1, o: { name: '龍造寺隆信', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['龍造寺の侍', '御屋形を守れ！　旗本、前へ！'], foes: [{ name: '隆信の旗本', from: { x: TAISHO.x - 12, z: TAISHO.z + 22 }, list: [uS(3), uA(10)] }] }],
      reward: '龍造寺隆信の備を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['島津家久', '隆信の首を取った！　龍造寺が崩れる。追え', 3.2]]),
    fightS({ x: -30, z: 56 }, '沼の際で、崩れた龍造寺の鉄砲衆を払う', '沼の際', '崩れた鉄砲衆が沼の際に溜まる', [['組頭', '沼に足を取られた者から討て', 3]],
      [foe('沼の際の鉄砲衆', -40, 70, [uS(1), uG(6)]), foe('沼の際の槍', -20, 74, [uS(2), uA(8)])], { reward: '沼の際の鉄砲衆を払った' }),
    holdS({ x: 0, z: 60 }, '畷道の北', '畷道を守り、返してきた鍋島の手を受ける', '鍋島の返し', '鍋島直茂の手が返す', [['組頭', '鍋島が返してきた！　畷を渡すな！', 3]],
      [wave(0, '龍造寺の侍', '御屋形の仇じゃ！　返せ！', [foe('鍋島の返しの手', 0, 100, [uS(2), uA(12)])]), wave(30, '龍造寺の侍', '畷の脇から回れ！', [foe('鍋島の横の手', 30, 96, [uS(2), uA(10)])]),
        wave(52, '龍造寺の侍', '鉄砲、撃ちかけよ！', [foe('鍋島の鉄砲', -30, 100, [uS(1), uA(6), uG(3)])])], { reward: '鍋島の返しを受けきった' }),
    fightS({ x: -34, z: 96 }, '森の際で、隆信の首を取り返しに来た龍造寺の旗本を払う', '首の取り返し', '龍造寺の旗本が首を取り返しに来る', [['川上忠堅', '御屋形の首はわしが取った。渡しはせぬ', 3]],
      [foe('取り返しの旗本', -44, 110, [uS(3), uA(10)])], { later: [wave(28, '龍造寺の侍', '御首を取り返せ！', [foe('取り返しの旗本の二', -20, 116, [uS(2), uA(8)])])], reward: '隆信の首を守った' }),
    fightS({ x: 30, z: 90 }, '鍋島の殿の手を崩す', '鍋島の殿', '鍋島直茂を逃がす兵', [['島津家久', '直茂は逃がしてもよい。殿を崩せ', 3]],
      [foe('鍋島の殿', 40, 104, [boss('鍋島の侍大将'), uS(2), uA(12)])], { later: [wave(28, '龍造寺の侍', '殿を佐賀へ！', [foe('鍋島の殿の二', 56, 90, [uS(2), uA(8)])])], reward: '鍋島の殿を崩した' }),
    fightS({ x: 0, z: 124 }, '島原の浜で、舟へ逃げる龍造寺の兵を追う', '島原の浜', '龍造寺の兵が舟へ逃げる', [['組頭', '浜の舟へ逃げる！　追い散らせ！', 3]],
      [foe('浜の龍造寺の兵', 0, 138, [uS(2), uA(12)])], { later: [wave(26, '龍造寺の侍', '舟を出せ！', [foe('浜の龍造寺の弓', -20, 144, [uS(1), uB(6)])])], reward: '島原から龍造寺を追った' }),
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
// K657②（11/25）：両側の沼を絵で分かるように。葦・ぬかるみ・湿った灰の靄（timeslip_field.js・数は増やさず葦と泥の色だけ・K643）
s03_okitanawate.timeslip = {
  wet: 0.7, dust: 0.05, trample: 0.25, debris: 0.6, arrows: 0.5, reeds: 0.85, mudColor: 0x4e4a3c, hazeColor: 0x6a6e68, poolDim: 0.5, grassLift: 0.12, grassShape: 'blade',
  grass: 0x7e8452, grassTints: [0xffffff, 0xd8d8a8, 0xb4b88a], grassH: 1.3, tallGrass: 1, grassCap: 420,
  flagColors: [0x1c1a1a, 0xe6dfcc, 0x2e3a2a],
};
export default s03_okitanawate;
