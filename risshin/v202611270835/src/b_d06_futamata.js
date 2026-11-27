// 武田編 六戦目「二俣城攻め」（元亀三年〔1572〕十月〜十二月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：西上作戦の信玄は、徳川方の中根正照が守る遠江の二俣城を勝頼・信豊らに攻めさせた。城は天竜川と二俣川に囲まれた崖の上で、
//   大手からは落ちなかった。城兵は天竜川の崖に井楼（つるべの櫓）を組んで水を汲んでいたので、武田は上流から筏を流して井楼を壊し、
//   水の手を断って開城させた（『三河物語』『甲陽軍鑑』・浜松市の史跡の案内）。主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import { withCastle } from './light_castle.js';
import { FUTAMATA_PLAN } from './castles/futamata.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 140 };
const RIVER = [[-220, -120], [-100, -112], [0, -118], [100, -110], [220, -116]];   // 天竜川（城の北の崖の下）
const OTE = { x: 8, z: 60 };          // 大手の前
const KAMI = { x: -60, z: -96 };      // 天竜川の上流の岸（筏を流す所）
const IROU = { x: 10, z: -96 };       // 井楼（水の手）の崖の下
const OTE2 = { x: 4, z: 20 };         // 開城を迫る大手の口
const HITOKOTO = { x: 70, z: 110 };    // 二俣の南の一言坂（家康の物見と当たった所・K652②）
const KAWARA = { x: 40, z: -80 };     // 井楼の下の河原（筏を引き上げる所・K652②）

// K722②（11/27 クラウドし）：要件書の見せ場「水の手（水桶の奪い合い）」が台詞だけで、井楼も筏も桶も戦場に一つも無かった。
//   ①天竜川の岸から崖の上の北曲輪へ届く井楼（四本柱の櫓・貫と筋交い・上の床と滑車の梁・釣瓶の縄と桶・崖へ渡す桟橋）を水の手の崖の下に。
//   ②上流の岸に着くと（段5の後）組んだ筏が流れに乗って井楼の脚へ下り、当たって脚に溜まる。筏の段（段8）が済むと、もう一組流れて来て井楼が川へ傾き倒れる。
//   ③開城を迫る段（段10）では、大手の口の内に空の水桶と割れた水甕が転がる（城の水が尽きた）。字は足さない。当たりは付けない（遊びは前と同じ）。
//   形は柱・板・桶を使い回し、井楼は一つの形に束ねる（描く回数は井楼2・桟橋1・筏一組1・桶1）。出所：『三河物語』『甲陽軍鑑』・浜松市の二俣城跡の案内（井楼跡）
const IROU_AT = { x: 14, z: -109 };   // 井楼の脚（天竜川の南の岸の水際）
const WOOD = 0x5a4632, WOOD2 = 0x3f3226, ROPE = 0x8c7a58;
function boxAt(sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); return g;
}
function beamBetween(a, b, w) {   // a から b へ渡す角材
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const g = new THREE.BoxGeometry(w, w, L);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
function okeGeo() {   // 桶：胴と二本のたが（底を y=0）
  const body = new THREE.CylinderGeometry(0.3, 0.26, 0.5, 10, 1, true); body.translate(0, 0.25, 0);
  const bottom = new THREE.CircleGeometry(0.26, 10); bottom.rotateX(-Math.PI / 2); bottom.translate(0, 0.03, 0);
  const t1 = new THREE.TorusGeometry(0.29, 0.025, 4, 12); t1.rotateX(Math.PI / 2); t1.translate(0, 0.12, 0);
  const t2 = t1.clone(); t2.translate(0, 0.25, 0);
  return mergeGeometries([body.toNonIndexed(), bottom.toNonIndexed(), t1.toNonIndexed(), t2.toNonIndexed()]);
}
function irouDress(rt) {
  const W = rt.world, sc = rt.scene, h = (x, z) => (W.heightAt(x, z) || 0);
  const st = W.def?.streams?.[0];
  const wy = (x, z) => { try { const v = st && W.streamLevelAt ? W.streamLevelAt(st, x, z, 0, 1) : NaN; return Number.isFinite(v) ? v : -0.4; } catch (e) { return -0.4; } };
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.92 });
  const wood2 = new THREE.MeshStandardMaterial({ color: WOOD2, roughness: 0.95 });
  const rope = new THREE.MeshStandardMaterial({ color: ROPE, roughness: 1 });
  const F = rt.flags, x0 = IROU_AT.x, z0 = IROU_AT.z, y0 = Math.min(h(x0, z0), wy(x0, z0)) - 0.6;
  // 崖の上の高さ（井楼の床）と桟橋の行き先：南へ登る崖で、床より五十cm 低い所
  const zEnd = z0 + 22, TOP = Math.max(10, Math.min(16, h(x0, zEnd) - y0 + 0.4));   // 桟橋は二十m余り・床は崖の上の高さに合わせる
  // ①井楼（脚の元を回りの軸にして倒す）
  const P = [], B = [], R = [];
  const s = 1.7;
  for (const [px, pz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) { const c = new THREE.CylinderGeometry(0.15, 0.19, TOP + 1.6, 7); c.translate(px, (TOP + 1.6) / 2, pz); P.push(c); }
  for (let y = 2.2; y < TOP; y += 2.6) {   // 貫（四方）
    P.push(boxAt(2 * s + 0.4, 0.16, 0.14, 0, y, -s), boxAt(2 * s + 0.4, 0.16, 0.14, 0, y, s), boxAt(0.14, 0.16, 2 * s + 0.4, -s, y, 0), boxAt(0.14, 0.16, 2 * s + 0.4, s, y, 0));
  }
  for (let y = 2.2; y + 2.6 < TOP; y += 2.6) {   // 筋交い（東西の二面・段ごとに向きを替える）
    const f = ((y / 2.6) | 0) % 2 ? 1 : -1;
    for (const px of [-s, s]) B.push(beamBetween([px, y, -s * f], [px, y + 2.6, s * f], 0.12));
    B.push(beamBetween([-s * f, y, -s], [s * f, y + 2.6, -s], 0.12));
  }
  P.push(boxAt(2 * s + 1.0, 0.18, 2 * s + 1.0, 0, TOP, 0));   // 上の床
  for (const [px, pz, sx, sz] of [[0, -s - 0.4, 2 * s + 1, 0.08], [-s - 0.4, 0, 0.08, 2 * s + 1], [s + 0.4, 0, 0.08, 2 * s + 1]]) P.push(boxAt(sx, 0.08, sz, px, TOP + 0.95, pz));   // 手すり
  for (const [px, pz] of [[-s - 0.4, -s - 0.4], [s + 0.4, -s - 0.4]]) P.push(boxAt(0.1, 1.0, 0.1, px, TOP + 0.5, pz));
  // 滑車の梁：川の上へ突き出す二本の腕と横木。釣瓶の縄と桶は川面へ
  for (const px of [-0.6, 0.6]) B.push(beamBetween([px, TOP + 0.1, -s + 0.2], [px, TOP + 2.6, -s - 2.4], 0.16));
  B.push(boxAt(1.6, 0.18, 0.18, 0, TOP + 2.6, -s - 2.4));
  const ropeLen = TOP + 2.6 - 1.2 - (wy(x0, z0 - 4.1) - y0);
  const cord = new THREE.CylinderGeometry(0.025, 0.025, ropeLen, 4); cord.translate(0, TOP + 2.6 - ropeLen / 2, -s - 2.4); R.push(cord);
  const oke = okeGeo(), o1 = oke.clone(); o1.translate(0, TOP + 2.6 - ropeLen - 0.5, -s - 2.4);
  const o2 = oke.clone(); o2.translate(-0.8, TOP + 0.09, 0.6); const o3 = oke.clone(); o3.translate(-0.2, TOP + 0.09, 1.1);
  const irou = new THREE.Group(); irou.name = 'futamataIrou';
  const mk = (geos, m) => { const me = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g)), m); me.castShadow = true; me.receiveShadow = true; irou.add(me); return me; };
  mk(P, wood); mk(B, wood2); mk([...R, o1, o2, o3], rope);
  irou.position.set(x0, y0, z0); irou.userData.noFreeze = true; sc.add(irou);
  // 桟橋：井楼の床から崖の上へ（倒れても崖の側に残る。崖の側の端だけが残るよう、二つに割る）
  const yB = y0 + TOP, yE = h(x0, zEnd) + 0.1, zA = z0 + s + 0.5, zM = zA + (zEnd - zA) * 0.35;
  const yM = yB + (yE - yB) * 0.35;
  const bridge = (a, b, ya, yb) => { const L = [beamBetween([-0.7, ya, a], [-0.7, yb, b], 0.14), beamBetween([0.7, ya, a], [0.7, yb, b], 0.14)];
    for (let t = 0; t <= 1.001; t += 0.5 / Math.max(1, b - a)) { const z = a + (b - a) * t, y = ya + (yb - ya) * t; L.push(boxAt(1.8, 0.07, 0.42, 0, y + 0.08, z)); }
    for (const px of [-0.85, 0.85]) { L.push(beamBetween([px, ya + 1.0, a], [px, yb + 1.0, b], 0.07)); for (let t = 0; t <= 1.001; t += 2 / Math.max(2, b - a)) L.push(boxAt(0.08, 1.0, 0.08, px, ya + (yb - ya) * t + 0.55, a + (b - a) * t)); }   // 手すり
    return L; };
  const near = new THREE.Mesh(mergeGeometries(bridge(zA, zM, yB, yM).map((g) => g.toNonIndexed())), wood2); near.castShadow = true; irou.add(near);
  near.position.set(0, -y0, -z0);   // 井楼の組の中に入れる（倒れる時に一緒に落ちる）
  const far = new THREE.Mesh(mergeGeometries(bridge(zM, zEnd, yM, yE).map((g) => g.toNonIndexed())), wood2); far.position.x = x0; far.castShadow = true; sc.add(far);
  for (const t of [0.55, 0.8]) { const z = zM + (zEnd - zM) * t, y = yM + (yE - yM) * t, g = h(x0, z); if (y - g > 0.8) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, y - g + 0.3, 6), wood); p.position.set(x0, (y + g) / 2, z); sc.add(p); } }
  // ②筏：丸太七本を二本の横木で結ぶ（流れは西から東）
  const logs = [];
  for (let i = 0; i < 7; i++) { const c = new THREE.CylinderGeometry(0.22, 0.24, 7.5, 7); c.rotateZ(Math.PI / 2); c.translate(0, 0, (i - 3) * 0.48); logs.push(c.toNonIndexed()); }
  for (const lx of [-2.6, 2.6]) logs.push(boxAt(0.18, 0.16, 3.6, lx, 0.26, 0).toNonIndexed());
  const ikadaGeo = mergeGeometries(logs);
  const rafts = [];
  const raft = (zOff, stopX, yaw) => { const m = new THREE.Mesh(ikadaGeo, wood); m.castShadow = true; m.visible = false; m.userData.noFreeze = true; sc.add(m);
    rafts.push({ m, x: KAMI.x - 6, z: z0 - 3.6 + zOff, stopX, yaw, go: false, t: 0 }); return rafts[rafts.length - 1]; };
  F.d06 = { irou, rafts, wy, raft, okeG: oke, wood, rope, y0, fall: 0, fell: false, oke: false, tick: (dt) => irouTick(rt, dt) };   // tick：撮る道具が段を飛ばして見る時だけ使う
  raft(0.4, x0 - 5.2, 0.15); raft(-1.4, x0 - 4.4, -0.35); raft(1.6, x0 - 6.8, 0.5);
  raft(-0.4, x0 - 3.6, -0.7);   // 筏の段の後のもう一組（これで井楼が倒れる）
}
function irouTick(rt, dt) {
  const F = rt.flags, D = F.d06; if (!D) return;
  const st = F.step || 0;
  // 上流の岸に着いたら（段5）筏を三組、間を置いて流す。筏の段が済んだら（段8）最後の一組
  if (st >= 5) for (let i = 0; i < 3; i++) { const r = D.rafts[i]; if (!r.go) { r.go = true; r.t = -i * 6; } }
  if (st >= 8 && !D.rafts[3].go) { D.rafts[3].go = true; D.rafts[3].t = 0; }
  for (const r of D.rafts) {
    if (!r.go) continue;
    r.t += dt; if (r.t < 0) continue;
    r.m.visible = true;
    const v = 2.4;   // 一秒に二m半ほど（天竜川の早瀬）
    if (r.x < r.stopX) { r.x = Math.min(r.stopX, r.x + v * dt); r.hit = r.x >= r.stopX; }
    const bob = Math.sin(rt.t * 1.3 + r.z) * 0.06, turn = r.hit ? r.yaw : r.yaw * 0.2 + Math.sin(rt.t * 0.4 + r.z) * 0.05;
    r.m.position.set(r.x, D.wy(r.x, r.z) + 0.12 + bob, r.z); r.m.rotation.set(Math.sin(rt.t * 1.1 + r.x) * 0.03, turn, Math.sin(rt.t * 0.9) * 0.03);
  }
  // 井楼：筏が脚に溜まると揺れ、最後の一組が当たると川（北）へ傾いて倒れる
  const hits = D.rafts.slice(0, 3).filter((r) => r.hit).length;
  if (D.rafts[3].hit && D.fall < 1) D.fall = Math.min(1, D.fall + dt / 3.2);
  const lean = hits * 0.012 + Math.sin(rt.t * 2.1) * 0.006 * hits * (D.fall > 0 ? 0 : 1);
  D.irou.rotation.x = -(lean + 1.25 * D.fall * D.fall);
  D.irou.position.y = D.y0 - 0.9 * D.fall;
  // ③開城を迫る段（段9の後）：大手の口の内に空の水桶と割れた水甕
  if (st >= 9 && !D.oke) {
    D.oke = true;
    const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), sc = rt.scene, L = [];
    const put = [[-2.2, -7, 1.4, 0], [-1.1, -7.8, 0, 0.8], [1.8, -6.6, 1.5, 2.1], [2.6, -8.4, 0, 0], [0.4, -9.2, 1.45, 4], [-3.1, -9.6, 0, 0], [3.4, -6.2, 1.5, 5.3]];
    for (const [dx, dz, tip, yaw] of put) { const g = D.okeG.clone(); g.rotateZ(tip); g.rotateY(yaw); g.translate(OTE2.x + dx, h(OTE2.x + dx, OTE2.z + dz) + (tip ? 0.28 : 0), OTE2.z + dz); L.push(g); }
    const m = new THREE.Mesh(mergeGeometries(L), D.rope); m.castShadow = true; sc.add(m);
    const kame = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.7 });
    for (const [dx, dz, tip] of [[-0.8, -10.6, 0], [1.6, -10.2, 1.5]]) {   // 水甕（一つは倒れて割れ口を見せる）
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, tip ? Math.PI * 0.72 : Math.PI * 0.86), kame);
      k.scale.set(1, 1.25, 1); k.rotation.z = tip; k.position.set(OTE2.x + dx, h(OTE2.x + dx, OTE2.z + dz) + (tip ? 0.5 : 0.62), OTE2.z + dz); k.castShadow = true; sc.add(k);
    }
  }
}

// 11/25 クラウドさ（K656 K655 の弱いサムネ「川と城が戦場に無い」）：城山の頂に二俣城（北曲輪・本丸・二の丸・南曲輪と堀切）を置く（castles/futamata.js・出所 docs/battle_refs/futamata.md）。遠景の軽い形
export const d06_futamata = withCastle(lightBattle({
  id: 'd06_futamata',
  date: '元亀三年（1572）十二月　晴れ　遠江国 二俣城',
  intro: '天竜川の崖の上の二俣城は、大手から攻めても落ちぬ。城の水は、崖に組んだ井楼から天竜川で汲んでいる。',
  history: '元亀三年（1572）、西上作戦の武田信玄は、徳川方の中根正照が守る二俣城を勝頼らに攻めさせた。城は大手から落ちず、武田は天竜川の上流から筏を流して城の水の手の井楼を壊し、水を断って開城させた。この後、信玄は三方ヶ原で家康と戦う。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '中根正照の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 1200 },
  allyLook: TAKEDA, foeLook: TOKU,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1572, time: 'day', winter: true, fogFar: 420,
    river: RIVER, riverW: 26, riverDepth: 1.2,
    hills: [[0, -40, 44, 24], [-130, -20, 70, 26], [130, -10, 70, 24], [70, 110, 40, 8]],
    // 11/21 cloud-19（K563 地形・手書き）：大手道は南から城へ、もう一本は城の西を回って天竜川の上流の岸へ下る。城山と崖の上は松と雑木
    paths: [{ pts: [[0, 190], [0, 140], [8, 60], [6, 0]], w: 3 }, { pts: [[8, 60], [-50, 20], [-60, -96]], w: 2.4 }],
    groves: [{ x: 40, z: -60, r: 24, n: 26 }, { x: -110, z: -60, r: 26, n: 28 }],
    trees: 510, tufts: 1600,
  },
  allies: [
    { name: '武田勝頼の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, list: [busho('武田勝頼'), uS(4), uA(16)] },
    { name: '武田信豊の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [busho('武田信豊'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, list: [uS(1), uG(10)] },
  ],
  setup: (rt) => { irouDress(rt); },
  update: (rt, dt) => { irouTick(rt, dt); },
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '大手を攻めても、崖の上の城は落ちぬ', 3],
      ['武田信豊', '城の水は天竜川の井楼から汲んでおる。あれを壊せば城は渇く', 3.4]] },
    // K652②（11/25 Sanae・10分に）：二俣へ向かう道で、家康の物見の手と一言坂で当たり、本多忠勝の殿に押し返された（一言坂の戦い・『三河物語』）
    { kind: 'fight', at: HITOKOTO, limit: 120, obj: '一言坂で、退く徳川の物見の手を追う', title: '一言坂', sub: '本多忠勝が殿に立つ',
      say: [['武田信豊', '徳川の物見じゃ。坂で追い崩せ！', 3], ['本多忠勝', '一人も討たせぬ。わしが殿じゃ', 3]],
      foes: [
        { name: '本多忠勝の殿', from: { x: HITOKOTO.x + 6, z: HITOKOTO.z - 16 }, list: [busho('本多忠勝'), uS(4), uA(16)] },
        { name: '徳川の物見の鉄砲', from: { x: HITOKOTO.x - 12, z: HITOKOTO.z - 20 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '坂の上から徳川の槍！　鹿の角の兜じゃ！'], foes: [{ name: '徳川の物見の槍', from: { x: HITOKOTO.x + 16, z: HITOKOTO.z - 10 }, list: [uS(3), uA(12)] }] }],
      reward: '一言坂で徳川の物見を退けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HITOKOTO.x - 20, z: HITOKOTO.z - 24 }, obj: '一言坂の上で、坂を塞ぐ徳川の足軽を討つ', limit: 90,
      say: [['組頭', '坂の上に殿の足軽が残っておる。押し上れ', 3.2]],
      foes: [{ name: '坂を塞ぐ徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: HITOKOTO.x - 20, z: HITOKOTO.z - 24 }), list: [uS(2), uA(12)] }],
      reward: '坂を塞ぐ足軽を討った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['小杉左近', '家康に過ぎたる物が二つあり　唐の頭に本多平八', 3.4], ['武田信豊', '……敵ながら見事な殿じゃった。二俣へ急げ', 3]] },
    { kind: 'hold', at: OTE, label: '大手の前', obj: '大手の前で城兵の打って出を受け、城の目を引きつける', r: 16, dur: 50,
      title: '大手', sub: '城兵が門を開けて打って出る',
      say: [['組頭', '大手で騒げ。城の目をこちらへ引きつけよ！', 3]],
      waves: [
        { t: 6, say: ['徳川の侍', '甲斐の者を追い払え！'], foes: [{ name: '大手の打って出', from: { x: OTE.x, z: OTE.z - 26 }, list: [uS(4), uA(22)] }] },
        { t: 28, say: ['組頭', '門の上から鉄砲！'], foes: [{ name: '大手の鉄砲', from: { x: OTE.x + 12, z: OTE.z - 30 }, list: [uG(6)] }] }],
      reward: '大手で城の目を引きつけた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTE.x + 14, z: OTE.z - 14 }, obj: '大手の脇の堀端で、城から出た徳川の弓を討つ', limit: 90,
      say: [['組頭', '堀端に弓が出た。射られる前に寄れ', 3.2]],
      foes: [{ name: '堀端の徳川の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: OTE.x + 14, z: OTE.z - 14 }), list: [uS(1), uA(6), uB(5)] }],
      reward: '堀端の弓を討った' },
    { kind: 'move', at: KAMI, label: '天竜川の上流の岸', obj: '天竜川の上流へ回り、筏を流す', r: 14,
      say: [['武田信豊', '筏を組め。流れに乗せて井楼へぶつけるぞ', 3.2]] },
    // K722（11/27 クラウドわ）：act bot 足軽がこの段で514秒に倒れた（大手からの連戦の傷のまま、三十二人が一度に掛かる）。
    //   筏を組む間の一息で傷を縛り、守りを二つの波に分けた（数の合わせは同じ二十六人＋弓六）
    { kind: 'rest', dur: 8, heal: 0.45, say: [['組頭', '筏を組む間に傷を縛れ。崖の下には城兵が下りて来るぞ', 3]] },
    { kind: 'fight', at: IROU, limit: 150, obj: '井楼の崖の下で、水の手を守る城兵を払う', title: '水の手', sub: '筏が井楼に当たる。崖の下に城兵が下りて来る',
      say: [['物見', '筏が井楼に当たった！　柱が折れるぞ！', 3.2], ['徳川の侍', '水の手を守れ！', 2.6]],
      foes: [
        { name: '水の手の守り', from: { x: IROU.x + 8, z: IROU.z + 10 }, list: [uS(2), uA(12)] },
        { name: '崖の上の弓', from: { x: IROU.x - 10, z: IROU.z + 20 }, list: [uB(6)] }],
      later: [{ t: 35, say: ['徳川の侍', '崖から下りよ！　井楼を守れ！'], foes: [{ name: '崖から下りる城兵', from: { x: IROU.x + 14, z: IROU.z + 16 }, list: [uS(2), uA(10)] }] }],
      reward: '水の手を断った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IROU.x - 14, z: IROU.z - 14 }, obj: '井楼の下の崖で、柱を守る徳川の兵を斬り払う', limit: 90,
      say: [['組頭', '柱を守る兵がおる。斬り払え', 3.2]],
      foes: [{ name: '柱を守る徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: IROU.x - 14, z: IROU.z - 14 }), list: [uS(2), uA(10)] }],
      reward: '柱を守る兵を斬り払った' },
    // K652②：筏を流し続けるため、河原で筏を引き上げる者を、崖から下りる城兵から守る（井楼の柱は一度では折れなかった）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['武田信豊', '柱はまだ一本残っておる。筏をもっと流せ！', 3]] },
    { kind: 'hold', at: KAWARA, label: '河原', obj: '河原で筏を流す者を、崖から下りる城兵から守る', r: 14, dur: 65,
      title: '筏', sub: '城兵が筏を流させまいと河原へ下りる',
      say: [['組頭', '筏を守れ！　流し切れば城の水は止まる！', 3]],
      waves: [
        { t: 5, say: ['徳川の侍', '筏の者を斬れ！'], foes: [{ name: '河原へ下りた城兵', from: { x: KAWARA.x + 10, z: KAWARA.z + 16 }, list: [{ type: 'samurai', n: 1, o: { name: '二俣の組頭 青木' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['物見', '崖の上から鉄砲！'], foes: [{ name: '崖の鉄砲', from: { x: KAWARA.x - 14, z: KAWARA.z + 20 }, list: [uG(5), uS(2), uA(8)] }] }],
      reward: '筏を流し切り、井楼を折った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '筏は流し切った。傷を縛れ。崖から逃げる兵が来る', 2.8]] },   // K674：続きの段で倒れた回（act bot 963秒）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KAWARA.x - 10, z: KAWARA.z - 20 }, obj: '折れた井楼の下で、崖から逃げる徳川の兵を追い崩す', limit: 90,
      say: [['組頭', '井楼が折れた。逃げる兵を崩せ', 3.2]],
      foes: [{ name: '崖から逃げる徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KAWARA.x - 10, z: KAWARA.z - 20 }), list: [uS(1), uA(7)] }],
      reward: '逃げる兵を追い崩した' },
    { kind: 'fight', at: OTE2, limit: 150,   // 中根正照は倒れない（開城して退いた）
      obj: '大手の口へ寄せ、渇いた城に開城を迫る', title: '開城を迫る', sub: '水を断たれた城兵が最後に打って出る',
      say: [['武田勝頼', '水の無い城は持たぬ。最後の一押しじゃ', 3], ['物見', '城の壁の上で、兵が水桶を奪い合うておる！　戦うより先に水じゃ！', 3.4]],
      foes: [{ name: '中根正照の手', from: { x: OTE2.x, z: OTE2.z - 12 }, list: [busho('中根正照'), uS(5), uA(19)] }],
      reward: '二俣城を開城させた' },
  ],
  win: {
    banner: '二俣城 開城', sub: '中根正照は城を明け渡し浜松へ退いた。道は三方ヶ原へ', award: '二俣城を開城させた',
    say: [['使番', '中根殿、城を明け渡し、浜松へ退くと', 3],
      ['武田勝頼', '次は家康じゃ。浜松の前を通って、出て来るか見てやろう', 3.4]],
  },
}), { plan: FUTAMATA_PLAN, at: { x: 0, z: -40 }, lift: 0, team: 1, life: false });
export default d06_futamata;
