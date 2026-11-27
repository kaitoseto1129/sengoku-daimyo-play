// 島津家編 七戦目「泗川の戦い」（慶長三年〔1598〕十月・朝鮮 泗川）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④ s07）
//   史実：島津義弘・忠恒の約七千が、海に近い新築の泗川新城に籠った。董一元の明・朝鮮軍（数万と記録され、誇張もある）が城へ迫ると、島津は囮を出して
//   敵を城の近くへ引き込み、鉄砲の斉射で迎えた。明軍の火薬が爆ぜて崩れたところへ、城外の伏兵と城内の兵が出て挟み、大きく破った（『島津家文書』A・『征韓録』B。数は諸説）。
//   三拍の手は tsuri_nobuse.js（木崎原・耳川と同じ）：囮が当たる・退いて城の前へ敵を引く・左右の伏兵が出る。字・札・ボタンは足さない。本物の兵は二百人ほどまで
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { tsuriNobuse } from './tsuri_nobuse.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';
import { sfx } from './audio.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const MING = { flag: 'ming', armor: 0x5a3a2a };
const SPAWN = { x: 0, z: -24 };
const STRIKE = { x: 0, z: 34 };
const LURE = { x: 0, z: -84 };      // 新城の前の堀の際
const KILL = { x: 0, z: -66 };
const TAISHO = { x: 0, z: 18 };
const GROVE_L = { x: -48, z: -56 }, GROVE_R = { x: 48, z: -56 };   // 城外の左右の伏せ
const SEA = [[-240, -210], [-100, -200], [0, -204], [100, -198], [240, -206]];   // 南の海（城の後ろ）

const CHASE = [
  { name: '明軍の先陣', from: { x: -6, z: 22 }, list: [uS(2), uA(14)] },
  { name: '明軍の二陣', from: { x: 6, z: 40 }, list: [uS(2), uA(13)] },
  { name: '明軍の三陣', from: { x: -4, z: 58 }, list: [uS(2), uA(13)] },
  { name: '朝鮮軍の陣', from: { x: 4, z: 76 }, list: [uS(2), uA(12)] }];

// 11/26 クラウド K655：泗川の新城が場に無く当てられなかった。堀の際（z=-84）の後ろに、白壁の塀・隅の櫓・城門・本丸の櫓を足す（基本形だけ）
function sacheonCastle(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'sacheonCastle';
  const wall = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }), stone = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.8 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const box = new THREE.BoxGeometry(1, 1, 1), pyr = new THREE.ConeGeometry(1, 1, 4);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); };
  const Z = -112, X = 62;
  for (const sg of [-1, 1]) for (const [x0, x1] of [[6, X]]) { const cx = sg * (x0 + x1) / 2, y = h(cx, Z); put(box, stone, cx, y + 1.6, Z, x1 - x0, 3.2, 3.4); put(box, wall, cx, y + 4.2, Z, x1 - x0, 2.2, 1.6); }
  for (const sx of [-1, 1]) { const x = sx * X, y = h(x, Z);
    put(box, stone, x, y + 2, Z, 7, 4, 7); put(box, wall, x, y + 6, Z, 5.6, 4, 5.6); put(pyr, roof, x, y + 9.6, Z, 8.4, 3.2, 8.4, Math.PI / 4);
    const zz = Z - 26, y2 = h(x, zz); put(box, stone, x, y2 + 1.6, zz, 3.4, 3.2, 52); put(box, wall, x, y2 + 4.2, zz, 1.6, 2.2, 52); }
  { const y = h(0, Z); put(box, stone, -7, y + 2.5, Z, 4, 5, 6); put(box, stone, 7, y + 2.5, Z, 4, 5, 6); put(box, wood, 0, y + 5.6, Z, 18, 1.4, 5); put(box, wall, 0, y + 7.2, Z, 14, 2.4, 4); put(pyr, roof, 0, y + 9.8, Z, 16, 2.8, 7, Math.PI / 4); }
  { const x = 0, z = Z - 34, y = h(x, z); put(box, stone, x, y + 3, z, 22, 6, 18); put(box, wall, x, y + 9, z, 16, 6, 12); put(box, wall, x, y + 14, z, 11, 4, 8); put(pyr, roof, x, y + 18, z, 14, 3.4, 10.5, Math.PI / 4); }
  rt.scene.add(g);
}
function scene(rt) { try { sacheonCastle(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

// K717 見せ場（要件書 泗川）：敵陣の火薬・火器のあたりで大きな爆発が起き、煙の中から島津勢が突入する。「戦場で起きた大爆発」として見せ、原因は言い切らない（史料の解釈に幅がある）
function boom(rt) {
  const F = rt.flags;
  if (F._s7Boom || (F.step || 0) < 6) return;
  F._s7Boom = true;
  try { sfx('volley', 1); rt.after(0.5, () => sfx('volley', 1)); rt.after(1.1, () => sfx('taiko', 0.9)); } catch (e) { /* なし */ }
  for (const [x, z] of [[-30, 66], [-44, 78], [-20, 84]]) { try { rt.world.addFire(x, z, { h: 1.6, size: 1.6 }); } catch (e) { /* なし */ } }
}
const TSURI = tsuriNobuse({
    look: SHIMAZU, kill: KILL, chase: CHASE, chaseSpeed: 3.4, trigZ: 36,
    groves: [{ p: GROVE_L, name: '島津義弘の伏兵（左）', list: [uS(3), uA(14), uG(4)] }, { p: GROVE_R, name: '島津忠恒の伏兵（右）', list: [uS(3), uA(14), uG(4)] }],
    cry: [['島津忠恒', '今じゃ！　伏せを解け、挟め！', 2.6], ['明の兵', '伏兵じゃ！　囲まれる！', 3]],
  });
export const s07_sacheon = lightBattle({
  id: 's07_sacheon',
  date: '慶長三年（1598）十月　朝　朝鮮 泗川',
  intro: '海に近い新しい城に、島津の七千。数万の明・朝鮮軍が迫る。島津は囮で敵を城の近くへ引き込み、鉄砲と伏兵で迎える。',
  history: '慶長三年（1598）十月、島津義弘・忠恒の約七千は、朝鮮の泗川に築いた新城に籠った。董一元の明・朝鮮軍（数万と記録される・誇張もある）が迫ると、島津は囮を出して敵を城の近くへ引き込み、鉄砲の斉射で迎え、城外と城内の兵で挟んで大きく破った。日本側では「泗川の大勝」と伝えられ、秀吉の死後、島津は無事に引き揚げていく。',
  sides: { a: { name: '島津の軍', mon: 'shimazu', faction: 'shimazu' }, b: { name: '明・朝鮮の軍', mon: 'ming', faction: 'ming' } },
  force: { a: 7000, b: 30000 },
  thick: true, playerTaken: 0.38, stepLimit: 75,   // K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: MING,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  setup: scene,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1598, time: 'morning', fogFar: 440,
    river: SEA, riverW: 40, riverDepth: 0.8,
    hills: [[-70, -58, 32, 8], [70, -58, 32, 8], [0, 140, 90, 18], [-180, 60, 60, 12]],
    paths: [{ pts: [[0, -140], [0, -84], [0, -24], [0, 34], [4, 100], [0, 170]], w: 3 }],
    groves: [{ x: GROVE_L.x - 10, z: GROVE_L.z, r: 22, n: 30 }, { x: GROVE_R.x + 10, z: GROVE_R.z, r: 22, n: 30 }],
    trees: 300, tufts: 1800,
  },
  allies: [
    { name: '島津忠恒の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('島津忠恒'), uS(4), uA(8)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [uS(1), uA(10), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津義弘', '明の軍は数万。城は新しく、堀も土塁もまだ浅い。まともに籠れば危ない', 3.8],
      ['島津忠恒', '敵を城の近くまで引く。そこで鉄砲を撃ちかけ、外の伏兵と挟む', 3.6],
      ['組頭', '当たって、退いて、堀の際まで走れ。そこで向き直る', 3.2]] },
    { kind: 'fight', at: STRIKE, obj: '城の外で、迫る明軍の先手に当たる', title: '泗川', sub: '数万の明軍が迫る',
      say: [['明の兵', '島津は少ない！　城を踏み潰せ！', 3]],
      foes: [{ name: '明軍の先手', from: { x: STRIKE.x - 4, z: STRIKE.z + 12 }, list: [uS(2), uA(12)] }],
      max: 90, reward: '明軍の先手に当たった' },
    { kind: 'move', at: LURE, label: '堀の際', obj: '退いて、明軍を新城の堀の際まで引く', r: 10, max: 100,
      say: [['島津忠恒', '引け！　堀の際まで引け！', 3], ['明の兵', '島津が退くぞ！　追え、城へ詰めよ！', 3.2]] },
    { kind: 'hold', at: KILL, label: '堀の際', obj: '向き直って待ち、追ってきた明軍を挟む', r: 16, dur: 70, title: '伏せ', sub: '堀の際で向き直る',
      say: [['島津忠恒', '向き直れ！　ここで待て。まだじゃ', 3]],
      waves: [{ t: 0, foes: CHASE.map((c, i) => ({ ...c, adopt: (rt) => rt.flags.kzChase?.[i] })) },
        { t: 45, say: ['明の兵', '後陣も詰めよ！　城は目の前じゃ！'], foes: [{ name: '明軍の後陣', from: { x: 8, z: KILL.z + 58 }, list: [uS(2), uA(14)] }] }],
      reward: '堀の際で明軍を挟んだ' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: STRIKE.x - 16, z: STRIKE.z + 10 }, obj: '堀の外で、新城の門を狙う明の足軽を討つ', max: 100, limit: 90,
      say: [['島津義弘', '門へ寄らせるな', 3.2]],
      foes: [{ name: '明の足軽', from: { x: STRIKE.x - 4, z: STRIKE.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '堀の外の明の足軽を討った' },
    { kind: 'hold', at: { x: STRIKE.x + 20, z: STRIKE.z - 10 }, label: '堀の際で、は', obj: '堀の際で、はしごを掛ける明の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', 'はしごが掛かる！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: 'はしごの明の兵', from: { x: STRIKE.x + 32, z: STRIKE.z - 22 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: 'はしごの明の兵', from: { x: STRIKE.x + 6, z: STRIKE.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '堀の際を守った' },
    { kind: 'fight', at: TAISHO, obj: '明軍の大将の備を崩す', title: '董一元', sub: '明の本陣が踏みとどまる', max: 140,
      say: [['島津忠恒', '本陣はそこじゃ！　押せ！', 3]],
      foes: [{ name: '董一元の備', from: { x: TAISHO.x, z: TAISHO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '董一元', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['明の兵', '本陣を守れ！　旗本、前へ！'], foes: [{ name: '董一元の旗本', from: { x: TAISHO.x - 14, z: TAISHO.z + 20 }, list: [uS(3), uA(10)] }] }],
      reward: '明軍の本陣を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['島津義弘', '明軍の陣で大きな爆発が起きた！　煙の中で敵が乱れておる。今じゃ、城の外へ打って出よ', 3.2]]),
    fightS({ x: -30, z: 60 }, '煙の中から燃える明軍の陣へ突入し、混乱した兵を討つ', '燃える陣', '陣で起きた大爆発に明軍が乱れる', [['島津忠恒', '煙の中を突け！　立て直させるな！', 3]],
      [foe('陣に残った明の兵', -40, 74, [uS(2), uA(12)])], { later: [wave(28, '明の兵', '火を消せ！　陣を守れ！', [foe('明の陣の弓', -20, 90, [uS(1), uB(6)])])], reward: '燃える陣を払った' }),
    // K652⑥（逸話の段・11/25 ネ三）：泗川の義弘は旗本を率いて明の先手の将に自ら当たった（『島津国史』B・鬼石曼子の伝）。細部は推。出所は journey s07
    fightS({ x: 10, z: 76 }, '明の先手の将に、旗本で斬り込む', '義弘の旗本', '明の先手の将が陣を立て直す', [['島津義弘', '鬼石曼子の名を、今ここで見せよ', 3]],
      [foe('明の先手の将の手', 14, 84, [busho('明の先手の将', { horse: false }), uS(1), uA(6)])], { reward: '明の先手の将を討った' }),
    holdS({ x: 0, z: 60 }, '古城の前', '古城の前を守り、返してきた朝鮮軍を受ける', '朝鮮軍の返し', '朝鮮軍が横から返す', [['組頭', '朝鮮の兵が返してきた！　崩れるな！', 3]],
      [wave(0, '明の兵', '倭を城へ押し戻せ！', [foe('朝鮮軍の返しの手', 0, 100, [uS(2), uA(12)])]), wave(30, '明の兵', '横から突け！', [foe('朝鮮軍の横の手', 40, 96, [uS(2), uA(10)])]),
        wave(52, '明の兵', '火矢を放て！', [foe('朝鮮軍の弓', -40, 100, [uS(1), uA(6), uB(4)])])], { reward: '朝鮮軍の返しを受けきった' }),
    fightS({ x: 30, z: 90 }, '退く明軍の殿を追い崩す', '明軍の殿', '明の将が退きを守る', [['島津義弘', '追え。じゃが深追いはするな。南江までじゃ', 3]],
      [foe('明軍の殿', 40, 104, [boss('明の将'), uS(2), uA(12)])], { later: [wave(28, '明の兵', '将軍を逃がせ！', [foe('明軍の殿の二', 56, 90, [uS(2), uA(8)])])], reward: '明軍の殿を崩した' }),
    fightS({ x: 0, z: 124 }, '南江の渡しで、逃げる明軍を追い散らす', '南江の渡し', '明軍が渡しへ逃げる', [['組頭', '渡しへ逃げる！　追い散らせ！', 3]],
      [foe('渡しの明の兵', 0, 138, [uS(2), uA(12)])], { later: [wave(26, '明の兵', '舟を出せ！', [foe('渡しの明の鉄砲', -20, 144, [uS(1), uG(5)])])], reward: '泗川で明軍を破りきった' }),
  ],
  update: (rt, dt) => { TSURI(rt, dt); boom(rt); },
  win: {
    banner: '泗川の勝ち', sub: '数万の明軍を堀の際で挟んだ', award: '泗川で明軍を引き込んで破った',
    say: [['組頭', '明の本陣が崩れた。敵が逃げていく', 3.2],
      ['島津義弘', '囮で引いて、鉄砲と伏兵で挟む。島津のやり方が、海の向こうでも通じた', 3.6],
      ['島津忠恒', '皆、よう守った。城へ戻るぞ', 3]],
  },
});
export default s07_sacheon;
