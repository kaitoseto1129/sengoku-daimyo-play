// 北条家編 九戦目「神流川の戦い」（天正十年〔1582〕六月十八日〜十九日・上野国 神流川）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：本能寺の変の後、北条氏直は上野へ攻め入った。一日目は北条氏邦の先手が滝川一益に破られたが、
//   二日目に氏直の本隊が加わり、滝川を大いに破った。一益は伊勢へ退いた（『北条五代記』B・『関八州古戦録』B）。
//   狼煙の網（hojo_noroshi.js）：一日目の先手の主人公が丘の台に火を上げると、南から氏直の本隊が出る（火の合図は推）
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { noroshi } from './hojo_noroshi.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TAKIGAWA = { flag: 'takigawa', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 120 };
const KANAKUBO = { x: 0, z: 80 };     // 金窪の陣
const BEACON = { x: 70, z: 110 };     // 東の丘の狼煙台
const KAWA = { x: 0, z: 10 };         // 神流川の渡り
const HONJIN = { x: -10, z: -60 };    // 滝川一益の本陣
const RIVER = [[-220, 0], [-100, 6], [0, -2], [100, 4], [220, -2]];

// 11/26 せ K657②：神流川の広い河原と流れ。地面の川（world.river）は細く暗く、霧の中で上から見ても分からなかったので、
//   川の筋に沿って、白っぽい石の河原（幅およそ46m）と、その中の青い流れ（幅およそ16m）を一つの形で置く（一つの材質・一つの描き・千頂点ほど。毎コマ作らない）。
//   神流川は関東山地から出る石の多い川で、河原が広い（『関八州古戦録』の「神流川の河原」・今の河原の様子から推した）
function kannaRiver(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), pos = [], col = [], idx = [];
  const bands = [[-23, 0], [-16, 0], [-8, 1], [-6, 2], [6, 2], [8, 1], [16, 0], [23, 0]];   // 横の位置・0 河原の縁（透かす）1 河原 2 流れ
  const pts = []; for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; for (let k = 0; k < 16; k++) pts.push([ax + (bx - ax) * k / 16, az + (bz - az) * k / 16]); }
  pts.push(RIVER[RIVER.length - 1]);
  const B = bands.length;
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = nx - px, dz = nz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let j = 0; j < B; j++) {
      const [o, k] = bands[j], vx = x - dz * o, vz = z + dx * o, n = Math.abs(Math.sin(vx * 0.53 + vz * 0.31) * Math.cos(vz * 0.47 - vx * 0.19));
      pos.push(vx, h(vx, vz) + (k === 2 ? 0.14 : 0.07), vz);
      if (k === 2) col.push(0.34 + 0.08 * n, 0.46 + 0.08 * n, 0.52 + 0.06 * n, 0.9);   // 浅い流れ（空を映す青灰）
      else { const t = 0.78 + 0.22 * n; col.push(0.66 * t, 0.63 * t, 0.56 * t, k === 0 ? 0 : 0.92); }   // 石の河原（白っぽい灰）
    }
    if (i) for (let j = 0; j < B - 1; j++) { const a = (i - 1) * B + j, b = i * B + j; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0, envMapIntensity: 0.4, side: THREE.DoubleSide }));
  m.name = 'kannaRiver'; m.renderOrder = 1; rt.scene.add(m);
}

const N = noroshi({
  beacon: BEACON, beaconStep: 1,
  far: [{ x: 150, z: 220 }, { x: 40, z: 320 }],
  reliefFrom: { x: -60, z: 170 }, reliefTo: { x: 0, z: 70 }, reliefFace: Math.PI,
  relief: { name: '北条氏直の本隊', list: [busho('北条氏直'), uS(4), uA(16), uG(4)], say: ['北条氏直', '氏直の本隊じゃ！　滝川を押し返せ！'], foeSay: ['滝川の侍', '北条の大軍じゃ！　本隊が来たぞ！'] },
});

export const h06_kanna = lightBattle({
  id: 'h06_kanna',
  date: '天正十年（1582）六月十八日　夏・晴れ　上野国 神流川',
  intro: '本能寺で信長が討たれた。上野の滝川一益を討つ。先手は押されている。狼煙で氏直様の本隊を呼べ。',
  history: '天正十年（1582）六月、本能寺の変の後、北条氏直は上野へ攻め入った。一日目は北条氏邦の先手が滝川一益に破られたが、二日目に氏直の本隊が加わって滝川を大いに破り、一益は伊勢へ退いた。',
  sides: { a: { name: '北条氏直・氏邦の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '滝川一益の軍', mon: 'takigawa', faction: 'oda' } },
  force: { a: 40000, b: 18000 },
  allyLook: HOJO, foeLook: TAKIGAWA,
  friendsSend: 1,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1582, time: 'day', fogFar: 420, sky: { clearAir: true },   // 11/26 せ：夏の晴れ。霧の端が八十mで北の河原が乳白に消えていた（K292 と同じ晴れた空気・兵を描く遠さは同じ）
    river: RIVER, riverW: 18, riverDepth: 0.5,
    hills: [[70, 116, 30, 8], [-90, -80, 60, 10]],
    paths: [{ pts: [[0, 190], [0, 120], [0, 80], [0, 10], [-10, -60]], w: 3 }, { pts: [[0, 90], [70, 110]], w: 2 }],
    groves: [{ x: -80, z: 60, r: 28, n: 28 }, { x: 90, z: -40, r: 30, n: 28 }],
    trees: 420, tufts: 2000,
  },
  allies: [
    { name: '北条氏邦の手', at: { x: KANAKUBO.x, z: KANAKUBO.z + 12 }, list: [busho('北条氏邦'), uS(3), uA(12)] },
    { name: '金窪の足軽', at: { x: KANAKUBO.x - 12, z: KANAKUBO.z + 2 }, list: [uS(2), uA(12)] },
    { name: '狼煙番', at: { x: BEACON.x - 4, z: BEACON.z + 4 }, list: [uS(1), uA(5)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏邦', '滝川は織田の宿老じゃ。侮るな', 3],
      ['組頭', '押されたら東の丘の狼煙台へ。火が上がれば、殿の本隊が来る', 3.2]] },
    { kind: 'hold', at: KANAKUBO, label: '金窪の陣', obj: '金窪の陣で、滝川の先手を受け止める', r: 16, dur: 60, title: '金窪', sub: '滝川の先手が川を越えて来る',
      say: [['滝川の侍', '北条の先手は小勢じゃ！　崩せ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '滝川の先手', from: { x: KANAKUBO.x - 4, z: KANAKUBO.z - 42 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 津田' } }, uS(3), uA(18)] }] },
        { t: 32, say: ['見張り', '鉄砲が来る！'], foes: [{ name: '滝川の鉄砲', from: { x: KANAKUBO.x + 24, z: KANAKUBO.z - 36 }, list: [uS(1), uG(8)] }] }],
      reward: '金窪で滝川の先手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KANAKUBO.x + 16, z: KANAKUBO.z + -10 }, obj: '陣の柵で、鉄砲を放つ滝川の兵を討て', limit: 90,
      say: [['組頭', '鉄砲を放つ滝川の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '鉄砲を放つ滝川の兵', from: { x: KANAKUBO.x + 24, z: KANAKUBO.z + -20 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '鉄砲を放つ滝川の兵を破った' },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '東の丘の狼煙台のそばに立ち、守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '滝川の兵が台を狙う',
      say: [['北条氏邦', '押される！　狼煙を上げよ！', 3]],
      waves: [
        { t: 6, say: ['滝川の侍', '狼煙を上げさせるな！'], foes: [{ name: '滝川の物見', from: { x: BEACON.x + 6, z: BEACON.z - 34 }, list: [uS(1), uA(8)] }] },
        { t: 36, foes: [{ name: '滝川の回り込み', from: { x: BEACON.x + 34, z: BEACON.z - 10 }, list: [uS(1), uA(7)] }] }],
      reward: '狼煙台を守り、火を上げた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BEACON.x + -14, z: BEACON.z + 14 }, obj: '狼煙台の下で、火を消しに来る滝川の足軽を払え', limit: 90,
      say: [['組頭', '火を消しに来る滝川の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '火を消しに来る滝川の足軽', from: { x: BEACON.x + -22, z: BEACON.z + 4 }, list: [uS(2), uA(10)] }],
      reward: '火を消しに来る滝川の足軽を破った' },
    { kind: 'hold', at: KANAKUBO, label: '金窪の陣', obj: '陣へ戻り、本隊が着くまで滝川を受け止める', r: 16, dur: 55, title: '本隊を待つ', sub: '滝川の本隊が押して来る',
      say: [['北条氏邦', '踏みとどまれ！　殿の本隊はすぐそこじゃ', 3]],
      waves: [
        { t: 4, foes: [{ name: '滝川の二の手', from: { x: KANAKUBO.x - 10, z: KANAKUBO.z - 44 }, list: [uS(3), uA(14)] }] },
        { t: 30, foes: [{ name: '滝川の三の手', from: { x: KANAKUBO.x + 16, z: KANAKUBO.z - 46 }, list: [uS(2), uA(12)] }] }],
      reward: '本隊が着くまで陣を守った' },
    { kind: 'fight', at: KAWA, limit: 140, obj: '神流川の渡りで、滝川の兵を押し返す', title: '神流川', sub: '本隊と共に押し出す',
      say: [['北条氏直', '川を越えよ！　滝川を上野から追い出す！', 3.2]],
      foes: [{ name: '滝川の川の守り', from: { x: KAWA.x, z: KAWA.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 篠岡' } }, uS(3), uA(20)] }],
      reward: '神流川の渡りを押し破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KAWA.x + -16, z: KAWA.z + -8 }, obj: '渡りの中州で、足を止めた滝川の兵を討て', limit: 90,
      say: [['組頭', '中州の滝川の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '中州の滝川の兵', from: { x: KAWA.x + -24, z: KAWA.z + -18 }, list: [uS(2), uA(10)] }],
      reward: '中州の滝川の兵を破った' },
    { kind: 'fight', at: HONJIN, limit: 140, obj: '滝川一益の本陣を崩す', title: '滝川の本陣', sub: '一益の旗が揺らぐ',
      say: [['組頭', '本陣の旗じゃ！　押せ！', 3]],
      foes: [{ name: '滝川一益の本陣', from: { x: HONJIN.x, z: HONJIN.z - 10 }, list: [busho('滝川の侍大将', { mustLive: false, invuln: false }), uS(4), uA(18), uG(3)] }],
      // K656 見せ場：一益の旗本が津田秀政・滝川儀太夫らと殿で踏みとどまる（『北条記』B）
      later: [{ t: 22, say: ['滝川の侍', '津田殿、儀太夫殿が討死じゃ！　一益様を落とせ！'], foes: [{ name: '滝川の旗本', from: { x: HONJIN.x + 14, z: HONJIN.z - 16 }, list: [uS(2), uA(10)] }] }],
      reward: '滝川の本陣を崩した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HONJIN.x + 16, z: HONJIN.z + -10 }, obj: '本陣の脇で、一益の旗を守る鉄砲の組を討て', limit: 90,
      say: [['組頭', '一益の旗を守る鉄砲の組じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '一益の旗を守る鉄砲の組', from: { x: HONJIN.x + 24, z: HONJIN.z + -20 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '一益の旗を守る鉄砲の組を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '一益、本陣を捨てて退く！　殿が川の北に残っておりまする', 3.2],
      ['北条氏直', '追え。上野から滝川を追い出す', 3]] },
    { kind: 'fight', at: { x: -70, z: -110 }, limit: 140, obj: '北の丘の麓で、退く滝川の殿を崩す', title: '滝川の殿', sub: '一益を逃がす殿が丘の下に構える',
      say: [['組頭', '殿を崩せば、一益は箕輪へ逃げるしかない', 3]],
      foes: [{ name: '滝川の殿', from: { x: -76, z: -122 }, list: [busho('滝川の殿の侍大将', { mustLive: false, invuln: false }), uS(4), uA(18), uG(3)] }],
      later: [{ t: 30, say: ['滝川の侍', '殿を見捨てるな！'], foes: [{ name: '引き返す滝川の兵', from: { x: -30, z: -130 }, list: [uS(2), uA(10)] }] }],
      reward: '滝川の殿を崩した' },
  ],
  setup: (rt) => { N.setup(rt); kannaRiver(rt); }, update: N.update,
  win: {
    banner: '神流川の勝ち', sub: '滝川一益は崩れ、伊勢へ退いた', award: '神流川で滝川を破った',
    say: [['北条氏直', '上野は北条の物じゃ。次は甲斐と信濃へ', 3.2],
      ['組頭', '狼煙が届いた。だから本隊が間に合うた', 3]],
  },
});
export default h06_kanna;
