// 上杉編 十五戦目「長谷堂城の戦い」（慶長五年〔1600〕九月〜十月・出羽 長谷堂城）。軽い型（light_battle.js）
//   史実：関ヶ原の戦いと同じ時、上杉景勝の家老 直江兼続は最上義光の出羽へ攻め入り、山形城の前の長谷堂城を囲んだ。
//   城将 志村光安はよく守り、伊達政宗の援けの留守政景も着いた。九月二十九日、関ヶ原で西軍が敗れた報が届き、兼続は十月一日に退いた。
//   最上・伊達の追い討ちを、兼続は自ら殿を務めて鉄砲で防ぎ、米沢へ退き遂げた。
//   出所：Wikipedia「慶長出羽合戦」「長谷堂城の戦い」・山形市の長谷堂城跡の案内。くわしくは docs/chapter_uesugi.md
//   最上家の紋（丸に二つ引両）は手元の紋に無いので、旗は一文字（ichimonji）を当てた（家の紋の替わり）
import * as THREE from 'three';
import { withCastle } from './light_castle.js';
import { HASEDO_PLAN } from './castles/hasedo.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { distToPolyline } from './world_common.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const MOGAMI = { flag: 'ichimonji', armor: 0x3a3632 };
const SPAWN = { x: 0, z: -140 };
const SUGESAWA = { x: 10, z: -100 };    // 菅沢山の陣の前（城方の打って出るのを受ける所）
const FOOT = { x: -10, z: -30 };        // 長谷堂城の麓の田（深田）
const PASS = { x: 20, z: 40 };          // 退く道の口（最上・伊達の追い手を止める所）
const REAR = { x: -10, z: 110 };        // 殿の最後の構え
// K652②（11/25 Sanae・家の編を10分前後に）：史実の流れ。長谷堂の前に、兼続は最上の畑谷城を攻め落とした（城将 江口光清は討ち死に）。
//   九月二十九日、長谷堂の麓の総攻めで上杉の上泉泰綱が深田の中で討たれた。退く時の殿には前田慶次が加わったと伝わる（『最上義光物語』・『北越太平記』）。
//   逸話の段（K652⑥）＝深田で囲まれた上泉泰綱の手へ駆け込み、残った者を引き出す
const HATAYA = { x: 40, z: -128 };      // 畑谷城の大手（長谷堂の前に落とした城の口）
const KAMIIZUMI = { x: 30, z: -8 };     // 麓の深田の東（上泉泰綱の手が囲まれた所）

// 11/25 K657②（クラウドか）：その戦と分かる物＝城山の麓を囲む深田。長谷堂城は周りが深い泥田で、寄せ手は足を取られ、
//   城へは細い道しか通じなかった（『最上義光物語』・山形市の長谷堂城跡の案内）。城山の南・西の低い所を畦で区切った田にし（world.js def.paddy：
//   一段低い面・ぬかるみで足が遅くなる）、季節は刈り入れ前でも水の抜けない深田として水と泥の田（fieldStage 'bare'）にする。
//   道（城への一本道）の両脇4.5m は田にしない。物は足さない（田は地面の高さと色だけ・稲株も作らない＝記憶は増えない K643）
const ROAD = [[0, -140], [10, -100], [-10, -30], [20, 40], [-10, 110]];
const FUKADA_LAND = (x, z) => {
  if (z > 10 || z < -80 || x < -100 || x > 2) return 0;                  // 城山の南と西の低い所（東の伊達の来る野は田にしない）
  if (Math.hypot(x + 30, z - 20) < 54) return 0;                         // 城山の裾（傾きのある所）は田にしない
  if (distToPolyline(x, z, ROAD) < 4.5) return 0;                        // 城への一本道
  if ((x + 400) % 19 < 1.5 || (z + 400) % 15 < 1.5) return 0;            // 畦
  return 1;
};

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：長谷堂の地面（菅沢山・城山・道と杉の森）。伊達編 e15 も同じ戦場を使う（城も同じ所）
export const HASEDO_LAND = {
  seed: 1600, marchMist: 90, marchMistFar: 75, time: 'day', autumn: true, fogFar: 260,
  hills: [[0, -200, 60, 22], [-30, 20, 40, 16], [120, 80, 60, 14], [-130, 120, 60, 18]],
  // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：菅沢山の陣の前・長谷堂城の麓の田・退く道の口・殿の最後の構え を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
  paths: [{ pts: ROAD, w: 3 }],
  paddy: FUKADA_LAND, sky: { fieldStage: 'bare' },   // K657② 城の前の深田（水の抜けない泥田）
  groves: [{ x: -130, z: 120, r: 30, n: 30, kind: 'sugi' }, { x: -30, z: 20, r: 20, n: 30, kind: 'sugi' }],
  trees: 460, tufts: 2000,
};

// 11/25 せ K657②：田の水面。地面の水（world.paddy の waterW・FUKADA_LAND）は今の描き方では上から見ても見えなかったので、畦で区切った田一枚ごとに、
//   地面に沿う濁った水の面を置く（一つの形・一つの材質・一つの描き。数十枚・千頂点ほど。毎コマ作らない）。畦は面の間に残る地面
export function hasedoPaddy(rt) {
  const W = rt.world, P = HASEDO_LAND.paddy, pos = [], col = [], idx = [];
  const N = 5, h = (x, z) => (W.heightAt(x, z) || 0);
  // 畦の間合いは FUKADA_LAND と同じ（x は19m・z は15m ごと、畦の幅1.5m）
  for (let x0 = -400 + 19 * 16; x0 < 10; x0 += 19) for (let z0 = -400 + 15 * 21; z0 < 15; z0 += 15) {
    const ax = x0 + 1.9, bx = x0 + 18.7, az = z0 + 1.9, bz = z0 + 14.7;
    if (![[ax, az], [bx, az], [ax, bz], [bx, bz], [(ax + bx) / 2, (az + bz) / 2]].every(([x, z]) => P(x, z) > 0)) continue;
    const base = pos.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = ax + (bx - ax) * i / N, z = az + (bz - az) * j / N, edge = i === 0 || j === 0 || i === N || j === N;
      const t = 0.85 + 0.3 * Math.abs(Math.sin(x * 0.37 + z * 0.23) * Math.cos(z * 0.41 - x * 0.11));   // 濁りのむら
      pos.push(x, h(x, z) + 0.06, z); col.push(0.23 * t, 0.2 * t, 0.15 * t, edge ? 0 : 0.78);   // 縁は透かして泥の岸に溶かす
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0, envMapIntensity: 0.35 }));
  m.name = 'hasedoPaddy'; m.renderOrder = 1; rt.scene.add(m);
}

export const HASEDO_CASTLE_AT = { x: -34, z: 20 };   // 長谷堂城の置き場（e15 も同じ所）
// 11/21 クラウド35（K563 ③の質）：長谷堂城（長谷堂城山の山城）を置く（castles/hasedo.js・出所 docs/battle_refs/hasedo.md）。遠景の軽い形
export const u15_hasedo = withCastle(lightBattle({
  id: 'u15_hasedo',
  date: '慶長五年（1600）九月　秋・霧　出羽国 長谷堂城',
  intro: '関ヶ原と同じ時、直江兼続は出羽へ攻め入り、長谷堂城を囲んだ。城は固く、最上と伊達の援けも近い。',
  history: '慶長五年（1600）、直江兼続は最上義光の出羽へ攻め入り、長谷堂城を囲んだ。城将 志村光安はよく守った。九月二十九日、関ヶ原で西軍が敗れた報が届き、兼続は十月一日に退いた。最上と伊達の追い討ちを、兼続は自ら殿を務めて防ぎ、米沢へ退き遂げた。',
  sides: { a: { name: '直江兼続の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '最上義光の軍', mon: 'ichimonji', faction: 'mogami' } },
  force: { a: 18000, b: 7000 },
  allyLook: UESUGI, foeLook: MOGAMI,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: HASEDO_LAND,
  setup: hasedoPaddy,
  allies: [
    { name: '直江兼続の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('直江兼続'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['直江兼続', '長谷堂の城は小さいが、志村光安はしぶとい', 3.2],
      ['直江兼続', 'まず畑谷を落とす。長谷堂の前の小さな城じゃ', 3.2]] },
    { kind: 'fight', at: HATAYA, obj: '畑谷城の大手を破り、江口光清の兵を崩す', title: '畑谷城', sub: '長谷堂の手前の小さな城。江口光清は降らずに守る',
      say: [['直江兼続の使番', '殿より。降れと言うたが、江口は聞かぬ。大手を破れ', 3.2]],
      foes: [{ name: '江口光清の手', from: { x: HATAYA.x + 4, z: HATAYA.z + 12 }, list: [uS(3), uA(20)] },
        { name: '大手の上の鉄砲', from: { x: HATAYA.x - 14, z: HATAYA.z + 14 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '城の奥から、死に物狂いの兵が出てくる！'], foes: [{ name: '畑谷の城兵', from: { x: HATAYA.x + 26, z: HATAYA.z + 20 }, list: [uS(2), uA(14)] }] }],
      reward: '畑谷城を落とした（江口光清は討ち死に）' },
    { kind: 'hold', at: SUGESAWA, label: '菅沢山の陣の前', obj: '菅沢山の陣の前で、城から打って出た兵を受け止める', r: 18, dur: 100,
      title: '菅沢山', sub: '霧の中、長谷堂の城兵が打って出る',
      say: [['組頭', '霧で敵が見えぬ！　声のする方へ槍を向けよ！', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '霧の向こうから城兵じゃ！'], foes: [{ name: '志村光安の手', from: { x: SUGESAWA.x - 6, z: SUGESAWA.z + 36 }, list: [uS(3), uA(27)] }] },
        { t: 34, say: ['組頭', '脇から鉄砲を撃ちかけてくる！'], foes: [{ name: '城方の鉄砲', from: { x: SUGESAWA.x + 28, z: SUGESAWA.z + 30 }, list: [uS(1), uG(6)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: SUGESAWA.x - 30, z: SUGESAWA.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '城から打って出た兵を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SUGESAWA.x + 14, z: SUGESAWA.z + 12 }, obj: '菅沢山の陣の外で、忍び寄る最上の足軽を討て', limit: 90,
      say: [['組頭', '忍び寄る最上の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '忍び寄る最上の足軽', from: { x: SUGESAWA.x + 22, z: SUGESAWA.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '忍び寄る最上の足軽を破った' },
    { kind: 'fight', at: FOOT, obj: '長谷堂城の麓の田で、城方の守りを崩す', title: '麓の田', sub: '深い田の向こうに城方が構える',
      say: [['直江兼続の使番', '殿より。田に足を取られるな。畦を伝って寄せよ', 3.2]],
      foes: [{ name: '麓の守り', from: { x: FOOT.x, z: FOOT.z + 12 }, list: [uS(3), uA(27)] },
        { name: '伊達の援け 留守政景の手', from: { x: FOOT.x + 24, z: FOOT.z + 22 }, list: [uS(3), uA(15)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: FOOT.x + 30, z: FOOT.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '長谷堂城の麓の守りを崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FOOT.x + -14, z: FOOT.z + 10 }, obj: '麓の田の畦で、鉄砲を構える最上の兵を討て', limit: 90,
      say: [['組頭', '畦の最上の鉄砲が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '畦の最上の鉄砲', from: { x: FOOT.x + -6, z: FOOT.z + 22 }, list: [uS(1), uA(6), uG(4)] }],
      reward: '畦の最上の鉄砲を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'fight', at: KAMIIZUMI, obj: '深田の東へ駆け込み、囲まれた上泉泰綱の手を引き出す', title: '深田', sub: '上泉泰綱の手が、深田の中で城方に囲まれた',
      say: [['見張り', '上泉殿の手が深田で囲まれておる！', 3.2], ['直江兼続', '泰綱を見捨てるな！　畦から槍を入れよ！', 3.2]],
      foes: [{ name: '深田を囲む城方', from: { x: KAMIIZUMI.x + 6, z: KAMIIZUMI.z + 10 }, list: [uS(3), uA(22)] },
        { name: '畦の上の鉄砲', from: { x: KAMIIZUMI.x - 16, z: KAMIIZUMI.z + 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 35, say: ['上泉の侍', '……殿が、上泉さまが討たれた！　せめて首は渡さぬ！'], foes: [{ name: '城方の首取りの手', from: { x: KAMIIZUMI.x + 26, z: KAMIIZUMI.z + 24 }, list: [uS(2), uA(12)] }] }],
      reward: '深田から上泉の手の者を引き出した（泰綱は討ち死に）' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KAMIIZUMI.x + 14, z: KAMIIZUMI.z + -12 }, obj: '深田の東で、上泉の手を囲む最上の足軽を討て', limit: 90,
      say: [['組頭', '上泉の手を囲む最上の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '上泉の手を囲む最上の足軽', from: { x: KAMIIZUMI.x + 22, z: KAMIIZUMI.z + 0 }, list: [uS(2), uA(10)] }],
      reward: '上泉の手を囲む最上の足軽を破った' },
    { kind: 'fight', at: PASS, obj: '退く道の口で、最上の追い手を食い止める', title: '退き口', sub: '関ヶ原で西軍が敗れた。兼続は退くと決めた',
      say: [['直江兼続', '関ヶ原は負けた。ここに留まる理由は無い。退くぞ。殿はわしが務める', 3.6]],
      foes: [{ name: '最上の追い手', from: { x: PASS.x - 6, z: PASS.z - 10 }, list: [uS(3), uA(30)] },
        { name: '最上の鉄砲', from: { x: PASS.x + 18, z: PASS.z - 14 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: PASS.x + 30, z: PASS.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '退く道の口で追い手を食い止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: PASS.x + 14, z: PASS.z + 14 }, obj: '退く道の辻で、伊達の追い手を受け止めよ', limit: 90,
      say: [['組頭', '伊達の追い手が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伊達の追い手', from: { x: PASS.x + 22, z: PASS.z + 26 }, list: [uS(2), uA(10)] }],
      reward: '伊達の追い手を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: PASS.x + -14, z: PASS.z + 12 }, obj: '退く道の脇の林で、伏せた最上の弓を討て', limit: 90,
      say: [['組頭', '伏せた最上の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた最上の弓', from: { x: PASS.x + -6, z: PASS.z + 24 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた最上の弓を破った' },
    { kind: 'hold', at: REAR, label: '殿の構え', obj: '殿の構えで、最上義光の追い討ちを防ぎ切る', r: 18, dur: 100,
      title: '殿', sub: '最上義光が自ら追ってくる',
      say: [['直江兼続', '鉄砲を揃えよ。引きつけて一度に放て', 3.0], ['前田慶次', '殿の後ろはこの慶次が預かった。朱槍の届く所へは一人も通さぬ', 3.6]],
      waves: [
        { t: 6, say: ['見張り', '最上の本隊じゃ！　義光が自ら来るぞ！'], foes: [{ name: '最上義光の旗本', from: { x: REAR.x - 10, z: REAR.z - 36 }, list: [uS(5), uA(21)] }] },
        { t: 30, say: ['組頭', '伊達の兵も追ってくる！'], foes: [{ name: '伊達の追い手', from: { x: REAR.x + 28, z: REAR.z - 30 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: REAR.x - 30, z: REAR.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '殿を務め、追い討ちを防ぎ切った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: REAR.x + -12, z: REAR.z + -14 }, obj: '殿の構えの手前で、駆け寄る最上の騎馬を払え', limit: 90,
      say: [['組頭', '駆け寄る最上の騎馬が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '駆け寄る最上の騎馬', from: { x: REAR.x + -4, z: REAR.z + -2 }, list: [uS(2), uA(10)] }],
      reward: '駆け寄る最上の騎馬を破った' },
  ],
  win: {
    banner: '退き遂げる', sub: '直江兼続は殿を務めて追い討ちを防ぎ、米沢へ退き遂げた', award: '長谷堂の殿を務め上げた',
    say: [['直江兼続の使番', '追い手は引きました。全軍、米沢への道に入ります', 3.2],
      ['直江兼続', '負け戦でも、退き方で家の名は残る。よく戦うた', 3.4]],
  },
}), { plan: HASEDO_PLAN, at: HASEDO_CASTLE_AT, lift: 0, team: 1, life: false });
// K657②（11/25 れ）：長谷堂城の前の深田を絵で分かるように。刈り前の黄金の稲・葦・ぬかるみ・湿った靄（timeslip_field.js・数は増やさず色と葦だけ・K643）。伊達編 e15 も同じ
export const HASEDO_TIMESLIP = {
  wet: 0.65, dust: 0.05, trample: 0.25, debris: 0.6, arrows: 0.5, reeds: 0.7, mudColor: 0x4e4a3c, hazeColor: 0x7a7c74, poolDim: 0.5, grassLift: 0.1, grassShape: 'blade',
  grass: 0x9a8f4a, grassTints: [0xffffff, 0xe0d08a, 0xb8a860], grassH: 1.2, tallGrass: 1, grassCap: 420,
  flagColors: [0x1c1a1a, 0xe6dfcc, 0x2e3a2a],
};
u15_hasedo.timeslip = HASEDO_TIMESLIP;
export default u15_hasedo;
