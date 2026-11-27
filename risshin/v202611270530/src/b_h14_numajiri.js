// 北条家編 十一戦目「沼尻の合戦」（天正十二年〔1584〕五月〜七月・下野国 沼尻）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：北条氏直は下野の沼尻で、佐竹義重・宇都宮国綱らの北関東の諸将と百日ほど睨み合った。佐竹方は鉄砲を多く揃えていた。
//   北条は岩船山を取って佐竹方の背をおびやかし、やがて両方が和睦して兵を引いた（『佐竹家譜』B・栃木市の解説 C。合戦の細部は推）。
//   主人公は氏直の使番の組。①沼の柵で佐竹の鉄砲の寄せを受ける ②岩船山へ回る ③岩船山の守りを崩す ④取り返しに来る佐竹方を受ける
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const SATAKE = { flag: 'satake', armor: 0x24221f };
const SPAWN = { x: 0, z: 140 };
const SAKU = { x: 0, z: 90 };         // 沼の縁の柵
const IWAFUNE = { x: 90, z: -30 };    // 岩船山の上
const TERA = { x: 106, z: -42 };      // 山の上の高勝寺の堂（尾根の東・戦う所から十八歩ほど外）

// 11/26 せ K657②：岩船山と分かる物。前は丸い低い丘一つで、どこの山とも分からなかった。
//   岩船山は関東平野の北の端に一つだけ立つ、舟を伏せたような細長い岩山で、山の上に高勝寺がある（栃木市の解説 C・寺は奈良の頃の開きと伝わる）。
//   山の形は world.hills の三つの山を北西〜南東に並べて舟の背に、岩肌は灰の岩（一つの InstancedMesh）、堂は箱と寄棟の屋根（材質は使い回し）。
//   今の山の南の切り立った崖は後の石切り場なので置かない。
function iwafuneDress(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0);
  // 岩肌：尾根の北と東の肩に、平たい灰の岩を三十。遊ぶ道（南西の麓から山の上）には置かない
  const N = 30, geo = new THREE.IcosahedronGeometry(1, 0), mat = new THREE.MeshStandardMaterial({ color: 0x7c7a72, roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, mat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), cx = 66 + t * 52, cz = -18 - t * 28, side = (i % 3) - 0.2, o = 8 + ((i * 7) % 11);   // 尾根に沿い、北東の側へずらす
    const x = cx + o * 0.55 * side + 6, z = cz - o * 0.85 * Math.abs(side) - 4, s = 1.4 + ((i * 13) % 7) * 0.45;
    e.set((i * 0.7) % 3, (i * 1.3) % 6, (i * 0.4) % 2); q.setFromEuler(e); sc.set(s * 1.4, s * 0.7, s);
    v.set(x, h(x, z) + s * 0.25, z); M.compose(v, q, sc); rocks.setMatrixAt(i, M);
  }
  rocks.name = 'iwafuneRocks'; rt.scene.add(rocks);
  // 高勝寺の堂：石の基壇・板の壁・朱の柱・寄棟の屋根（四角の錐台）
  const g = new THREE.Group(), y0 = h(TERA.x, TERA.z) - 0.2;
  const box = (w, hh, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })); m.position.set(x, y, z); g.add(m); return m; };
  box(12, 1, 9, 0, 0.5, 0, 0x8a8478);
  box(9.4, 3.6, 6.6, 0, 2.8, 0, 0x6a5440);
  for (const sx of [-4.6, -1.6, 1.6, 4.6]) for (const sz of [-3.2, 3.2]) box(0.34, 3.6, 0.34, sx, 2.8, sz, 0x8a3424);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 9.4, 3.4, 4), new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.8 }));
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.74); roof.position.set(0, 6.3, 0); g.add(roof);
  box(3.6, 0.5, 0.5, 0, 8.1, 0, 0x2e2e32);
  g.position.set(TERA.x, y0, TERA.z); g.rotation.y = -0.5; g.name = 'iwafuneTera'; rt.scene.add(g);
}

export const h14_numajiri = lightBattle({
  id: 'h14_numajiri',
  date: '天正十二年（1584）七月　夏・曇り　下野国 沼尻',
  intro: '沼をはさんで、佐竹・宇都宮と睨み合って百日。氏直様は、岩船山を取って敵の背をおびやかす。',
  history: '天正十二年（1584）、北条氏直は下野の沼尻で、佐竹義重・宇都宮国綱らの北関東の諸将と百日ほど睨み合った。佐竹方は鉄砲を多く揃えていた。北条は岩船山を取って佐竹方の背をおびやかし、やがて両方が和睦して兵を引いた。',
  sides: { a: { name: '北条氏直の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '佐竹義重・宇都宮国綱の軍', mon: 'satake', faction: 'satake' } },
  force: { a: 30000, b: 20000 },
  allyLook: HOJO, foeLook: SATAKE,
  friendsSend: 1,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1584, time: 'day', overcast: true, fogFar: 380, sky: { clearAir: true },   // 11/26 せ：曇りのまま霧の白を薄く（岩船山が百歩先で白に消えていた）
    river: [[-220, 50], [-100, 56], [-20, 50], [40, 60], [220, 54]], riverW: 26, riverDepth: 0.4,
    hills: [[68, -18, 26, 16], [92, -32, 34, 30], [116, -46, 26, 16], [-80, -60, 60, 10]],   // 11/26 せ：岩船山を舟の背の細長い岩山に（前は [90,-30,40,20] の丸い丘）
    paths: [{ pts: [[0, 190], [0, 140], [0, 90], [60, 70], [90, -30]], w: 3 }],
    groves: [{ x: 66, z: -78, r: 16, n: 14, kind: 'sugi' },   // 11/26 せ：杉の森を北の麓へ（山の上の岩と堂を隠していた）
      { x: -90, z: 100, r: 28, n: 26 }],
    trees: 460, tufts: 2000,
  },
  allies: [
    { name: '北条氏直の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z + 10 }, fixed: true, list: [busho('北条氏直'), uS(4), uA(8)] },
    { name: '柵の足軽', at: { x: SAKU.x - 12, z: SAKU.z + 6 }, list: [uS(2), uA(14)] },
    { name: '北条の鉄砲衆', at: { x: SAKU.x + 12, z: SAKU.z + 6 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    // K721（11/26）要件書の流れ（決着しない大軍の対陣）：①佐竹・宇都宮方と対峙 ②湿地を避けて布陣 ③物見 ④敵の先手と交戦 ⑤鉄砲戦 ⑥敵が沼へ追い込まれる ⑦押し返す ⑧敵の援軍 ⑨決着せず ⑩双方撤収
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏直', '沼の向こうに佐竹・宇都宮の大軍が陣を張っておる。数は互角じゃ', 3.4],
      ['組頭', '佐竹の鉄砲は多い。沼の泥に足を取られるな。柵から出るな', 3.2]] },
    { kind: 'move', at: { x: -12, z: 106 }, label: '沼の縁', obj: '湿地を避け、乾いた縁に柵を立てて布陣する', r: 12, max: 110,
      say: [['組頭', '泥の所は避けよ。柵は乾いた縁に立てる', 3]] },
    { kind: 'fight', at: { x: 0, z: 98 }, limit: 80, obj: '沼の向こうへ物見を出し、渡って来た佐竹の物見を討つ', title: '物見', sub: '沼の霧の中の影',
      say: [['見張り', '沼の浅瀬に影じゃ。物見が渡って来た', 3]],
      foes: [{ name: '佐竹の物見', from: { x: 4, z: 84 }, list: [uS(1), uA(6)] }],
      reward: '佐竹の物見を討った' },
    { kind: 'hold', at: SAKU, label: '沼の柵', obj: '沼の縁の柵で、寄せる佐竹の先手と鉄砲を撃ち合って受け止める', r: 16, dur: 80, title: '沼の柵', sub: '佐竹の鉄砲の音が沼に響く',
      say: [['佐竹の侍', '北条の柵を破れ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '佐竹の先手', from: { x: SAKU.x - 6, z: SAKU.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の組頭 真壁' } }, uS(3), uA(18)] }] },
        { t: 30, say: ['見張り', '鉄砲衆が沼の縁に並んだ！'], foes: [{ name: '佐竹の鉄砲衆', from: { x: SAKU.x + 30, z: SAKU.z - 36 }, list: [uS(1), uG(10)] }] },
        // K656 見せ場（推）：長い対陣の間、沼の浅瀬を探りに渡る佐竹の物見を柵の前で斬って返さない
        { t: 44, say: ['見張り', '沼の浅瀬を佐竹の物見が渡って来る！'], foes: [{ name: '佐竹の物見', from: { x: SAKU.x + 4, z: SAKU.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の物見頭' } }, uS(1), uA(6)] }] },
        { t: 56, foes: [{ name: '宇都宮の手', from: { x: SAKU.x - 30, z: SAKU.z - 40 }, list: [uS(1), uA(10)] }] }],
      reward: '沼の柵で佐竹の寄せを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x + -16, z: SAKU.z + -12 }, obj: '沼の縁で、柵へ寄せて沼へ追い込まれる佐竹の兵を討て', limit: 90,
      say: [['組頭', '舟で寄せる佐竹の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '舟で寄せる佐竹の兵', from: { x: SAKU.x + -24, z: SAKU.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '舟で寄せる佐竹の兵を破った' },
    { kind: 'move', at: { x: 60, z: 70 }, label: '岩船山の麓', obj: '北条が押し返す。沼の東を回り、岩船山の麓へ出る', r: 12, max: 110,
      say: [['北条氏直', '岩船山を取れ。佐竹の背が丸見えになる', 3.2]] },
    { kind: 'fight', at: IWAFUNE, limit: 150, obj: '岩船山の上の佐竹方の守りを崩す', title: '岩船山', sub: '山の上に佐竹方の小屋',
      say: [['組頭', '上へ押し上がれ！', 3]],
      foes: [{ name: '岩船山の守り', from: { x: IWAFUNE.x, z: IWAFUNE.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹方の組頭 皆川' } }, uS(2), uA(16), uG(2)] }],
      reward: '岩船山を取った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IWAFUNE.x + 14, z: IWAFUNE.z + -12 }, obj: '山の堂の前で、守りを固める佐竹の旗本を討て', limit: 90,
      say: [['組頭', '堂を守る佐竹の旗本じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '堂を守る佐竹の旗本', from: { x: IWAFUNE.x + 22, z: IWAFUNE.z + -22 }, list: [uS(2), uA(10)] }],
      reward: '堂を守る佐竹の旗本を破った' },
    { kind: 'hold', at: IWAFUNE, label: '岩船山', obj: '宇都宮の援軍が来た。取り返しに来る佐竹方から、岩船山を守る', r: 16, dur: 70, title: '取り返し', sub: '佐竹方が山を取り返しに来る',
      say: [['見張り', '佐竹が山を取り返しに来る！', 3]],
      waves: [
        { t: 4, foes: [{ name: '佐竹の取り返し', from: { x: IWAFUNE.x - 40, z: IWAFUNE.z - 20 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の侍大将' } }, uS(2), uA(12)] }] },
        { t: 40, foes: [{ name: '佐竹の二の手', from: { x: IWAFUNE.x + 10, z: IWAFUNE.z - 44 }, list: [uS(1), uA(8)] }] }],
      reward: '岩船山を守り抜いた' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IWAFUNE.x + -14, z: IWAFUNE.z + 12 }, obj: '山の道で、登って来る宇都宮の兵を払え', limit: 90,
      say: [['組頭', '登って来る宇都宮の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '登って来る宇都宮の兵', from: { x: IWAFUNE.x + -22, z: IWAFUNE.z + 2 }, list: [uS(2), uA(10)] }],
      reward: '登って来る宇都宮の兵を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '佐竹方は沼の北に柵を立て直し、鉄砲を並べておりまする', 3.2],
      ['北条氏直', '岩船山から下りて、柵の横を突け', 3]] },
    { kind: 'fight', at: { x: 40, z: 20 }, limit: 140, obj: '岩船山を下り、沼の北の佐竹の柵を横から崩す', title: '沼の北の柵', sub: '佐竹の鉄砲が柵の内に並ぶ',
      say: [['組頭', '柵の横は手薄じゃ。回り込め！', 3]],
      // 11/26 し：岩船山で傷んだ後に二十余りに一度に囲まれ669秒で倒れた（act bot）→柵の内の足軽を減らし宇都宮の後詰を遅らせた（鉄砲の数は残す）
      foes: [{ name: '佐竹の柵の兵', from: { x: 30, z: 10 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の組頭' } }, uS(2), uA(8), uG(5)] }],
      later: [{ t: 45, say: ['佐竹の侍', '柵を捨てるな！'], foes: [{ name: '宇都宮の兵', from: { x: -10, z: -10 }, list: [uS(2), uA(8)] }] }],
      reward: '沼の北の佐竹の柵を崩した' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: 56, z: 8 }, obj: '沼の北の柵で、鉄砲を構える佐竹の組を討て', limit: 90,
      say: [['組頭', '鉄砲を構える佐竹の組じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '鉄砲を構える佐竹の組', from: { x: 64, z: -2 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '鉄砲を構える佐竹の組を破った' },
    { kind: 'hold', at: { x: 40, z: 20 }, label: '沼の北の柵', obj: '取った柵で、取り返しに来る佐竹と宇都宮の兵を受け止める', r: 16, dur: 70, title: '柵の取り合い', sub: '百日の対陣は、柵の取り合いが続いた',
      say: [['北条氏直', '柵一つでも、取れば次の手が楽になる。渡すな', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '取り返しの佐竹', from: { x: 0, z: -20 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の組頭' } }, uS(3), uA(12), uG(3)] }] },
        { t: 32, say: ['見張り', '宇都宮の騎馬じゃ！'], foes: [{ name: '宇都宮の騎馬', from: { x: 80, z: -10 }, list: [{ type: 'cavalry', n: 4 }, uS(2), uA(8)] }] }],
      reward: '取った柵を守り切った' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [
      ['使番', '佐竹も宇都宮も、これ以上は出て来ませぬ。決着はつきませぬ', 3.4],
      ['北条氏直', '百日睨み合って、勝ちも負けもない。領国を守るとは、こういう事か', 3.4]] },
    { kind: 'move', at: { x: 0, z: 150 }, label: '陣払い', obj: '決着はつかぬまま、双方が兵を引く。陣を払って南へ下がる', r: 14, max: 120,
      say: [['組頭', '佐竹の陣も旗を巻いておる。双方、引き揚げじゃ', 3.2]] },
  ],
  setup: (rt) => { iwafuneDress(rt); },
  win: {
    banner: '沼尻の和睦', sub: '決着はつかず、両軍は兵を引いた', award: '百日の対陣を耐え、柵と岩船山を守り切った',
    say: [['北条氏直', '百日の睨み合いも、これで終わりじゃ', 3],
      ['組頭', '血を流さずに済む和睦なら、それが一番じゃ', 3]],
  },
});
export default h14_numajiri;
