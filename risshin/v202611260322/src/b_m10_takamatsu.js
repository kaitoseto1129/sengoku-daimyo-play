// 毛利家編 十戦目「備中高松城の戦い（毛利の救援）」（天正十年〔1582〕五〜六月・備中国 高松）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：羽柴秀吉は清水宗治の籠る備中高松城を足守川の水で囲んだ（水攻め）。毛利輝元・吉川元春・小早川隆景は約五万（通説）で救援に着いたが、
//   水に囲まれた城へは近づけず、織田信長の来援（本能寺の前）の知らせもあって、安国寺恵瓊が和睦を結ぶ使いに立った。本能寺の急報は毛利に遅れて入り、
//   秀吉は和睦を急いで「大返し」へ向かう（『太閤記』B・『毛利家文書』A。数は通説）。織田家編の備中高松（大返しの前）を毛利の側から見る。
//   調略の最後：両陣の間に立つ羽柴方の使いの備（約百五十を二十人で）へ、和睦の密書を届け切ると、その備は旗の縁が赤→藍に変わる（寝返りでなく「停戦の使い」の形に縮めた・推）。
//   水に囲まれた低い湿地の見た目は、足守川の広い浅瀬（streams）。字・札・ボタンは足さない
import * as THREE from 'three';
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';
import { enemyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { honjin } from './battle_army_kit.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const HASHIBA = { flag: 'oda', armor: 0x34322e };   // 羽柴の旗は織田家の旗（秀吉は1582年には織田家臣）
const SPAWN = { x: 90, z: -80 };           // 毛利の本陣（岩崎山・日差山の高み）
const TUTSUMI = { x: 30, z: -26 };         // 水攻めの堤の外
const ENVOY = { x: -10, z: 24 };           // 両陣の間・羽柴方の使いの備
const HOLD = { x: -24, z: 40 };            // 堤の外の湿地
const SHIRO = { x: -50, z: 88 };           // 水に囲まれた高松城の前（堤の向こう）
const UKITA = { x: 70, z: -10 };           // 日差山の麓（宇喜多の手が出る所・K652②）
const FUNE = { x: 4, z: -2 };              // 堤の際（羽柴の舟手が寄る所・K652②）
const MIEOKURI = { x: -32, z: 60 };        // 堤の際（清水宗治の舟を見送る所・K652②）
const KAMO = { x: 64, z: 34 };             // 境目の加茂城（羽柴の手が攻める・K652②）

// 11/26 クラウドす K655・K657②：水攻めの水と、水に浮く高松城。前は野の両軍しか写らず高松と当てられなかった。
//   地面は world.hills で、城の周りを浅く窪ませ（沼の田）、城の島を高め、南に堤（低い土の筋）を盛る。その上に平らな水を一枚置く。
//   高松城は石垣も天守も無い沼の平城（土塁と塀と櫓・岡山市の史跡の解説 C・『太閤記』B）。水に沈んだ村の屋根と立ち枯れの木を少し。形は基本形だけ・毎コマ作らない
const LAKE = { x: -50, z: 108 }, ISLE = { x: -46, z: 98 }, WATER_Y = -0.3;
const DIKE = [[-98, 88], [-74, 72], [-44, 65], [-14, 68], [12, 82]];
// 11/26 クラウドか（窓口の目視「城が箱の積み木・堤も秀吉の軍も無い」）：堤は高さ約7m・底幅約20m・長さ約3km で、土俵（米俵に土を詰めた物）を積んで築いた
//   （岡山市の史跡 高松城水攻め築堤跡の解説 C・『太閤記』B）。堤の西の起こり口の蛙ヶ鼻に秀吉の本陣（石井山の陣を蛙ヶ鼻の側に寄せて置いた・推）
const KAWAZU = { x: -84, z: 52 };
function dikeHills() {
  const out = [];
  for (let i = 0; i < DIKE.length - 1; i++) {
    const [ax, az] = DIKE[i], [bx, bz] = DIKE[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, 4.5, 1.25]);   // 前の 0.7 は野の筋にしか見えなかった（約3m の土手に）
  }
  return out;
}
function floodAndCastle(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'takamatsuFlood';
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x5d6660, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false, envMapIntensity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(66, 56, 1); water.position.set(LAKE.x, WATER_Y, LAKE.z + 4); water.renderOrder = 1; g.add(water);
  const earth = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 }), plaster = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.9 });
  const board = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.85 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0x6e6248, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1), prism = new THREE.CylinderGeometry(1, 1, 1, 3), pyr = new THREE.ConeGeometry(1, 1, 4);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); return m; };
  const roof = (mat, x, y, z, len, w, ht, ry = 0) => { const m = new THREE.Mesh(prism, mat); m.rotation.set(0, ry, Math.PI / 2); m.scale.set(ht, len, w); m.position.set(x, y, z); g.add(m); };
  const top = h(ISLE.x, ISLE.z), side = THREE.DoubleSide;
  const black = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.8 }), pine = new THREE.MeshStandardMaterial({ color: 0x2f4630, roughness: 1 });
  earth.side = side; plaster.side = side; board.side = side;
  // 本丸の土塁：前は八つの箱を輪に並べ角が欠けて積み木に見えた→裾の広い台形の土手を一続きの輪に（南に門の口）
  const R = 12, GAP = 0.46, GA = Math.PI - 0.393, th0 = GA + GAP / 2, thL = Math.PI * 2 - GAP;
  let ry0 = 0; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ry0 += h(ISLE.x + Math.sin(a) * R, ISLE.z + Math.cos(a) * R) / 12; }
  const ring = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(ISLE.x, y, ISLE.z); g.add(m); return m; };
  ring(new THREE.LatheGeometry([new THREE.Vector2(R + 3.4, -1.2), new THREE.Vector2(R + 1.1, 1.7), new THREE.Vector2(R - 0.9, 1.8), new THREE.Vector2(R - 2.8, -0.6)], 20, th0, thL), earth, ry0);
  // 土塁の上の塀：下が黒い板（下見板）・上が白い漆喰・板葺の笠
  ring(new THREE.CylinderGeometry(R, R, 0.7, 20, 1, true, th0, thL), black, ry0 + 2.15);
  ring(new THREE.CylinderGeometry(R, R, 0.75, 20, 1, true, th0, thL), plaster, ry0 + 2.85);
  ring(new THREE.CylinderGeometry(R - 0.55, R + 0.55, 0.42, 20, 1, true, th0, thL), board, ry0 + 3.4);
  // 塀の狭間（黒い小窓）
  for (let i = 0; i < 26; i++) { const a = th0 + (i + 0.5) / 26 * thL; put(box, black, ISLE.x + Math.sin(a) * (R + 0.04), ry0 + 2.85, ISLE.z + Math.cos(a) * (R + 0.04), 0.34, 0.3, 0.06, a); }
  // 櫓（二重）：下の重は黒い板と白壁・軒を大きく張り出した板葺の寄棟。上の重は小さく、石落と窓
  const yagura = (x, z, w, d, ry, two) => {
    const y = h(x, z);
    put(box, black, x, y + 1.1, z, w, 2.2, d, ry); put(box, plaster, x, y + 3.0, z, w, 1.6, d, ry);
    put(pyr, board, x, y + 4.45, z, w * 0.96, 1.5, d * 0.96, ry + Math.PI / 4).scale.set(w * 0.98, 1.5, d * 0.98);
    for (const s2 of [-1, 1]) put(box, black, x + Math.cos(ry) * s2 * w * 0.25, y + 3.05, z - Math.sin(ry) * s2 * w * 0.25, w * 0.18, 0.45, d + 0.08, ry);
    if (!two) return;
    put(box, plaster, x, y + 5.6, z, w * 0.62, 1.8, d * 0.62, ry); put(box, black, x, y + 5.3, z, w * 0.63, 0.5, d * 0.63, ry);
    put(box, black, x, y + 5.95, z, w * 0.66, 0.38, d * 0.3, ry);
    put(pyr, board, x, y + 7.15, z, 1, 1.6, 1, ry + Math.PI / 4).scale.set(w * 0.72, 1.6, d * 0.72);
  };
  yagura(ISLE.x + 3, ISLE.z + 4, 7.4, 6.2, 0.2, true);         // 本丸の二重櫓（天守は無い）
  yagura(ISLE.x - 8.4, ISLE.z - 8.4, 4.2, 4.2, 0.785, false);  // 南西の隅櫓
  yagura(ISLE.x + 9.6, ISLE.z - 6.2, 4, 4, -0.6, false);       // 南東の隅櫓
  // 館と蔵（板葺の切妻・軒を出す）
  for (const [dx, dz, l, w] of [[-5, 1, 8, 5], [-3, 7, 6, 4], [5, -4, 5, 4]]) { const x = ISLE.x + dx, z = ISLE.z + dz, y = h(x, z); put(box, wood, x, y + 1.3, z, l, 2.6, w); roof(board, x, y + 3.3, z, l + 1.4, w * 0.78, 1.5); }
  // 南の門（櫓門）：門柱と扉の上に渡櫓
  { const x = ISLE.x + Math.sin(GA) * R, z = ISLE.z + Math.cos(GA) * R, y = ry0, ryG = GA;
    for (const s2 of [-1, 1]) put(box, black, x + Math.cos(ryG) * s2 * 2.3, y + 1.6, z - Math.sin(ryG) * s2 * 2.3, 0.6, 3.2, 0.6, ryG);
    put(box, black, x, y + 3.6, z, 6.2, 1.2, 2.8, ryG); put(box, plaster, x, y + 4.5, z, 6.2, 0.7, 2.8, ryG);
    put(pyr, board, x, y + 5.5, z, 1, 1.3, 1, ryG + Math.PI / 4).scale.set(4.8, 1.3, 2.6); }
  // 本丸の松（濡れた沼の城の目印）
  for (const [dx, dz, s2] of [[-7, -2, 1], [8, 4, 0.8], [-2, -8, 0.7]]) { const x = ISLE.x + dx, z = ISLE.z + dz, y = h(x, z);
    put(box, wood, x, y + 2.4 * s2, z, 0.4, 4.8 * s2, 0.4); for (let k = 0; k < 3; k++) put(pyr, pine, x, y + (3.6 + k * 1.2) * s2, z, (2.6 - k * 0.7) * s2, 1.2 * s2, (2.6 - k * 0.7) * s2, k); }
  // 堤：土俵（米俵に土を詰めた物）を天端と水の側に段に積み、水の側に杭を打つ（一つの InstancedMesh ずつ）
  { // 土の土手（裾14m・天端5m の台形を区切りごとに一本。地面の丘の上に被せて土の色で堤と分かるように）
    const tz = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.18, 1), new THREE.Vector2(-0.18, 1)]);
    const tg = new THREE.ExtrudeGeometry(tz, { depth: 1, bevelEnabled: false }); tg.translate(0, 0, -0.5);
    const dirt = new THREE.MeshStandardMaterial({ color: 0x7a6446, roughness: 1 });
    for (let i = 0; i < DIKE.length - 1; i++) { const [ax, az] = DIKE[i], [bx, bz] = DIKE[i + 1], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const crest = Math.min(h(mx, mz), h(ax, az) + 0.4, h(bx, bz) + 0.4), m = new THREE.Mesh(tg, dirt);
      m.position.set(mx, crest - 3.4, mz); m.scale.set(14, 3.5, L + 3); m.rotation.y = Math.atan2(bx - ax, bz - az); g.add(m); } }
  { const bag = new THREE.MeshStandardMaterial({ color: 0x8a7656, roughness: 1 }), pts = [];
    for (let i = 0; i < DIKE.length - 1; i++) { const [ax, az] = DIKE[i], [bx, bz] = DIKE[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 1.0), ang = Math.atan2(bx - ax, bz - az);
      const nx = (bz - az) / L, nz = -(bx - ax) / L;   // 水（北）の側への向き
      for (let k = 0; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (const [o, dy] of [[0.4, 0], [0.4, 0.36], [1.5, -0.25], [-0.7, -0.05]]) pts.push([x + nx * o, z + nz * o, dy, ang]); } }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.95, 6), bag, pts.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E2 = new THREE.Euler(), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
    pts.forEach(([x, z, dy, ang], i) => { E2.set(0, ang + Math.PI / 2, Math.PI / 2); Q.setFromEuler(E2); V.set(x, h(x, z) + 0.2 + dy, z); M.compose(V, Q, S1); im.setMatrixAt(i, M); });
    g.add(im);
    const st = [];
    for (let i = 0; i < DIKE.length - 1; i++) { const [ax, az] = DIKE[i], [bx, bz] = DIKE[i + 1], L = Math.hypot(bx - ax, bz - az), nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (let k = 0; k < L; k += 3.2) { const x = ax + (bx - ax) * k / L + nx * 3, z = az + (bz - az) * k / L + nz * 3; st.push([x, z]); } }
    const sk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.16, 2.4, 5), wood, st.length);
    st.forEach(([x, z], i) => { V.set(x, Math.max(WATER_Y, h(x, z)) + 0.5, z); M.compose(V, Q.identity(), S1); sk.setMatrixAt(i, M); });
    g.add(sk); }
  // 水に沈んだ村の屋根（茅葺の棟だけが出る）と立ち枯れの木
  for (const [x, z, r] of [[-86, 96, 0.4], [-78, 124, 1.2], [-20, 118, 0.2], [-62, 136, 0.9]]) roof(thatch, x, WATER_Y + 0.25, z, 6, 2.2, 1.1, r);   // 手前の二つは平らな板に見えたので外し、棟だけ出す
  for (const [x, z] of [[-72, 88], [-24, 104], [-66, 128], [-8, 110], [-36, 132]]) put(box, wood, x, WATER_Y + 1.6, z, 0.35, 3.8, 0.35, x);
  // 清水宗治の舟（城の南の水の上）
  put(box, wood, ISLE.x + 4, WATER_Y + 0.25, ISLE.z - 19, 1.6, 0.5, 6, 0.3);
  rt.scene.add(g);
}

function scene(rt) {
  const W = rt.world;
  try { floodAndCastle(rt); } catch (e) { /* 小道具が無くても戦は続ける */ }
  // 前は城の島の中に羽柴（織田）の幟が立っていた→城には清水の兵の毛利の幟・堤の上に羽柴の幟の列
  try { for (const a of [2.0, 0.9, 4.2, 5.4]) rt.scene.add(nobori(W, ISLE.x + Math.sin(a) * 9.5, ISLE.z + Math.cos(a) * 9.5, 'mori', 5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
  try { for (const [x, z] of [[-94, 82], [-84, 77], [-66, 68], [-56, 63], [-2, 71], [8, 76]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
  // 秀吉の本陣（陣幕・金の千成瓢箪の馬印・桐の幕。天正十年からの千成の扱いは山崎・b_mid.js と同じ）と、中と堤の番の本物の兵（動かず・討てない・数に入れない＝調略を待つ備と同じ扱い）
  try { honjin(rt, KAWAZU.x, KAWAZU.z, { mon: 'toyotomi', people: false, fire: false, uma: 'sennari', yoroi: false, w: 22, d: 15 });
    for (const [dx, dz] of [[-13, -9], [13, -9], [-13, 9], [13, 9], [0, 11], [-6, 12], [6, 12]]) rt.scene.add(nobori(W, KAWAZU.x + dx, KAWAZU.z + dz, 'toyotomi', 6)); } catch (e) { /* 小道具が無くても戦は続ける */ }
  for (const [name, at, face, list] of [['秀吉の旗本', { x: KAWAZU.x + 2, z: KAWAZU.z + 2 }, -2.2, [uS(4), uA(8)]], ['堤の番', { x: -84, z: 80 }, -1.95, [uS(2), uA(10), uB(4)]]]) {
    try { const g = enemyGroup(rt, { name, flag: HASHIBA.flag, anchor: at, facing: face, fixed: true, noAI: true, aggro: 0, noRout: true, order: 'hold', fullStrength: true }, dress(list, HASHIBA));
      for (const u of g.units) { u.invuln = true; u.noTarget = true; } } catch (e) { /* 兵が置けなくても戦は続ける */ }
  }
}

export const m10_takamatsu = lightBattle({
  id: 'm10_takamatsu',
  date: '天正十年（1582）六月　雨　備中国 高松',
  intro: '羽柴秀吉は高松城を水で囲んだ。毛利の五万は救援に着いたが、水に阻まれて動けない。和睦の使いに、密書を運べ。',
  history: '天正十年（1582）五月、羽柴秀吉は清水宗治の籠る備中高松城を、足守川の水を引いて囲んだ（水攻め）。毛利輝元・吉川元春・小早川隆景は五万ほどで救援に着いたが、水に囲まれた城に近づけない。信長の来援の知らせもあり、毛利は安国寺恵瓊を使いに立てて和睦を探った。六月、本能寺の急報が秀吉に入り、秀吉は和睦を急いだ。清水宗治の切腹と引き換えに城は開かれ、秀吉は大返しに向かった（『太閤記』・『毛利家文書』。数は通説）。',
  sides: { a: { name: '毛利輝元の軍', mon: 'mori', faction: 'mori' }, b: { name: '羽柴秀吉の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 50000, b: 30000 },
  allyLook: MORI, foeLook: HASHIBA,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 0.8 },
  world: {
    seed: 1582, time: 'day', fogFar: 320, rain: 0.4, overcast: true, wetStart: true,
    hills: [[90, -90, 56, 18], [-120, -20, 50, 8], [130, 40, 50, 9], [LAKE.x, LAKE.z, 42, -1.3], [ISLE.x, ISLE.z, 15, 3.2], [KAWAZU.x, KAWAZU.z, 14, 3], ...dikeHills()],   // 窪み（沼の田）・城の島・堤
    river: [[-150, 120], [-60, 118], [60, 124], [160, 120]], riverW: 36, riverDepth: 0.5,   // 水攻めの水（足守川の広い浅瀬・城の向こう）
    paths: [{ pts: [[90, -80], [30, -26], [-10, 24], [-24, 40], [-50, 88]], w: 2.8 }],
    groves: [{ x: 110, z: -20, r: 32, n: 30 }, { x: -90, z: 10, r: 30, n: 22 }],
    trees: 330, tufts: 1500,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '小早川隆景の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('小早川隆景'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  // 調略の糸：両陣の間に立つ羽柴方の使いの備（和睦の密書を受ける）
  turncoats: [{ key: 'envoy', name: '羽柴方の使いの備', at: ENVOY, face: Math.PI * 0.1, list: [uS(2), uA(12), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'oda', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['小早川隆景', '高松の城は、水の中に浮いておる。五万でも近づけぬ', 3.4],
      ['安国寺恵瓊', '殿、信長公の来援が近いと聞きます。和睦の道を、探らねばなりませぬ', 3.6],
      ['小早川隆景', 'お主、恵瓊の書状を、羽柴の使いの備へ届けよ。斬られる前に、渡せ', 3.4]] },
    { kind: 'move', at: TUTSUMI, label: '堤の外', obj: '水攻めの堤の外まで進む', r: 12, max: 120,
      say: [['組頭', '羽柴の物見が堤から見ておる。雨の陰を伝え', 3]] },
    // K652②（11/25 Sanae・10分）：羽柴方には宇喜多の兵（約一万）が付き、毛利の陣の前に出ていた（『太閤記』B・『陰徳太平記』B）
    { kind: 'fight', at: UKITA, obj: '日差山の麓へ出た宇喜多の手を払う', title: '宇喜多の手', sub: '羽柴に付いた宇喜多が、毛利の陣を探る',
      say: [['吉川元春', '宇喜多め、羽柴に付いて我らの陣の前に出おった。追い払え', 3.4]],
      foes: [{ name: '宇喜多の先手', from: { x: UKITA.x - 10, z: UKITA.z + 14 }, list: [uS(3), uA(14)] }, { name: '宇喜多の鉄砲', from: { x: UKITA.x + 12, z: UKITA.z + 18 }, list: [uS(1), uB(5)] }],
      reward: '日差山の麓の宇喜多の手を払った' },
    // K652②：高松の囲みの間、羽柴は毛利の境目の城（冠山・宮路山・加茂・日幡）も攻めた。加茂城では城の一部が破られた（『太閤記』B・岡山市の解説 C）
    { kind: 'fight', at: KAMO, obj: '境目の加茂城を攻める羽柴の手を、横から突く', title: '加茂城', sub: '境目の城が、羽柴に攻められている',
      say: [['吉川元春', '加茂の城が攻められておる。横から突いて、城の者を助けよ', 3.4]],
      foes: [{ name: '加茂城を攻める羽柴の手', from: { x: KAMO.x - 10, z: KAMO.z + 12 }, list: [uS(3), uA(14)] }, { name: '寄せ手の鉄砲', from: { x: KAMO.x + 12, z: KAMO.z + 16 }, list: [uS(1), uB(5)] }],
      reward: '加茂城を攻める羽柴の手を崩した' },
    { kind: 'fight', at: HOLD, obj: '堤の外へ出た羽柴の先手を払う', title: '堤の外', sub: '羽柴の先手が毛利の物見を討ちに出る',
      say: [['吉川元春', '羽柴の先手が出た！　使いの道を開け！', 3.2]],
      foes: [{ name: '羽柴の先手', from: { x: HOLD.x + 6, z: HOLD.z + 6 }, list: [uS(3), uA(15)] }, { name: '羽柴の鉄砲', from: { x: HOLD.x - 10, z: HOLD.z + 4 }, list: [uS(1), uB(6)] }],
      reward: '堤の外の羽柴の先手を払い、使いの道を開いた' },
    // K652②：水の上では羽柴の舟が城の周りを見張っていた（『太閤記』B）。堤の際へ寄る舟手を払う
    { kind: 'fight', at: FUNE, obj: '堤の際へ舟で寄る羽柴の舟手を払う', title: '舟手', sub: '水の上から、羽柴の舟が寄って来る',
      say: [['小早川隆景', '舟で回り込んで来るぞ。使いの道を、水の側から塞がせるな', 3.4]],
      foes: [{ name: '羽柴の舟手', from: { x: FUNE.x - 12, z: FUNE.z + 12 }, list: [uS(2), uA(12), uB(4)] }],
      reward: '堤の際の羽柴の舟手を払った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'chouryaku', target: 'envoy', at: ENVOY, label: '羽柴方の使い', obj: '羽柴方の使いの備へ、和睦の密書を届ける', r: 9, max: 100,
      say: [['安国寺恵瓊', '羽柴殿は、和睦を望んでおる。この書状を、使いの頭へ渡せ', 3.8]],
      turnSay: ['羽柴方の使いの頭', '恵瓊殿の書状、確かに受け取った。殿へお届けいたす', 3.6],
      failSay: ['組頭', '間に合わなんだか。羽柴の備は、まだ敵のままじゃ、構えよ！', 3.2],
      reward: '和睦の密書を届け、羽柴方の使いの備を停戦に就かせた' },
    { kind: 'hold', at: HOLD, label: '堤の外の湿地', obj: '和睦が結ばれるまで、血気にはやる羽柴の手を受け止める', r: 16, dur: 65,
      title: '和睦の前', sub: '和睦が結ばれるまで、湿地で持ちこたえる',
      say: [['吉川元春', '和睦の使いが進む間、持ちこたえよ！　ここで崩れれば和睦も崩れる！', 3.2]],
      waves: [{ t: 6, say: ['羽柴の将', '毛利を破るなら今ぞ！　押せ！'], foes: [{ name: '羽柴の将の手', from: { x: HOLD.x - 8, z: HOLD.z + 36 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', 'まだ来るぞ！　退くな！'], foes: [{ name: '羽柴の二の手', from: { x: HOLD.x + 14, z: HOLD.z + 36 }, list: [uS(2), uA(12)] }] }],
      reward: '和睦が結ばれるまで羽柴の手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HOLD.x - 16, z: HOLD.z + 20 }, obj: '水攻めの堤の上で、堤を崩そうとする備中の足軽を討つ', max: 100, limit: 90,
      say: [['小早川隆景', '堤を守れ', 3.2]],
      foes: [{ name: '堤を崩す足軽', from: { x: HOLD.x - 4, z: HOLD.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '水攻めの堤の上を守った' },
    { kind: 'hold', at: { x: HOLD.x + 20, z: HOLD.z - 10 }, label: '堤の外の道で', obj: '堤の外の道で、使いを守って寄せる羽柴の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '羽柴の兵が寄る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '羽柴の兵', from: { x: HOLD.x + 32, z: HOLD.z - 22 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '羽柴の兵', from: { x: HOLD.x + 6, z: HOLD.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '堤の外の道を守った' },
    // K652②：和睦の約束で、清水宗治は水の上の舟で舞い、腹を切った（『太閤記』B・『清水家文書』A に辞世）
    { kind: 'move', at: MIEOKURI, label: '堤の際', obj: '堤の際へ行き、舟の上の清水宗治を見送る', r: 12, max: 100,
      say: [['安国寺恵瓊', '清水殿が舟を出された。城の兵の命と引き換えじゃ', 3.4], ['小早川隆景', '見送れ。毛利のために腹を切る男じゃ', 3.2]] },
  ],
  win: {
    banner: '高松の和睦', sub: '毛利と羽柴は和睦した', award: '備中高松で和睦の使いを運んだ',
    say: [['安国寺恵瓊', '和睦が成った。清水殿の切腹で、城は開く', 3.4],
      ['小早川隆景', '羽柴殿は急いでおる。何か、京であったのかもしれぬ', 3.6],
      ['組頭 与三左', 'お主の運んだ書状が、五万の戦を止めた。よう走った', 3.2]],
  },
});
export default m10_takamatsu;
