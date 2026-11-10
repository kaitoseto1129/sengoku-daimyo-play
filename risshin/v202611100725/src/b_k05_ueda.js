// ======================================================================
// 徳川編 5　第二次上田合戦（慶長五年九月六日・1600　秋・晴）　筋書きの正：docs/chapter3_tokugawa.md の「5.」
// 手本と出所：docs/battle_refs/k05_ueda.md
// 中山道を西へ向かう徳川秀忠の三万八千が、上田城の真田昌幸・信繁（およそ二千五百）に行く手を阻まれた。
// 長男の信之は徳川方で、戸石城を受け取りに行っている（父・弟と分かれた。この戦の場には出ない）。
// 秀忠は染屋台に本陣を置き、牧野康成に城下の稲を刈らせて真田を誘った。城から真田の兵が打って出て刈田の衆を襲い、
// 本多忠政・大久保忠隣の手が押し返して大手門まで追った。門の上の鉄砲と、門から打って出た槍、虚空蔵山の方から横を突く信繁の手に、
// 追い込んだ先手は討たれ、秀忠の命で引き揚げた。城は落ちず、家康の急使を受けた秀忠は西へ急ぎ、関ヶ原（九月十五日）に間に合わなかった。
// 主人公は本多忠政の先手の侍大将（秀忠の本隊と前衛の間）。11/10 docs/ueda2_spec_1109.md で作り直した。目標は七つ（STAGES）：
//   ①城から出た真田勢を退ける ②退く真田を追う（誘い） ③伏兵の囲みを抜ける ④大手門へ寄せる（落ちない）
//   ⑤後方の荷駄を救う（二度目は追わない学び） ⑥関ヶ原からの急使で攻めを止め、神川の岸に兵をまとめる（信繁の一撃） ⑦中山道を西へ急ぐ（振り返ると無傷の上田城）
// 刻限の札は出さない（critic60：話を聞く間も減る・主人公のせいでない負け）。時が経てば味方の働きで話は進む（二の5）。負けは本人が討たれた時だけ（十二の3）。
// 11/3 kaito AP〜AT：見せかけの軍勢（farHost・clash・backOf）は置かず、見える兵は全部本物。旗は徳川・本多・大久保・榊原・真田だけ。
//   総大将の秀忠は神川の東の本陣で旗本に囲まれ、昌幸は城の内から出ない（AT3）。名のある将は全員馬上。
//   兵の比：両軍の総勢は三万八千対二千五百。城下で組む所だけは寄せ手が多いが、門の前と信繁の横撃で押し返される（史実の難しさ）。
// 向き：北が -z。上田城は原点の北、東が +x（神川と染屋台）。地形：国土地理院の標高（dem_ueda.js）。ゲームの 1 が実の 4m。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_ueda.js';
import { demSample } from './dem.js';
import { nobori, yagura, hut, tawara, dobei, sumiyagura, jinmaku, yaguramon, tobira, kuruwaBldg, solidRect } from './props.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { farSight } from './far_sight.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';
import { S as SETTINGS } from './settings.js';
import { start as endScene } from './k05/end.js';
import { DEPTH } from './k05/depth_plan.js';   // 陣立て表：染屋台の諸将（仙石・森・奥平ほか）と戸石の信幸（共通の army_depth.js が描く）   // 締め：急使・陣払い・「関ヶ原に間に合わず」

const ID = 'k05_ueda';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('徳川秀忠', { armor: 0x1c1a18, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'tokugawa', tack: 0x2a2018, lord: true,
  face: face({ age: 22, jaw: 1, brow: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });
give('榊原康政', { armor: 0x1e1c1a, lace: 0x2a3a58, hat: 'kabuto_m', haori: 0x2a2a30, mon: 'none',
  face: face({ age: 53, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.4, side: 0.3, stub: 0.7 } }) });
give('牧野康成', { armor: 0x201e1c, lace: 0x4a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'kashiwa',   // 牧野家の丸に三つ柏。弘治元年（1555）生まれで慶長五年は数え四十六
  face: face({ age: 46, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.3, side: 0.2, stub: 0.6 } }) });
// 大久保忠隣の陣羽織は自家の上り藤に大の字（隊の旗と同じ。譜代は自家の紋＝U5。葵は秀忠の本陣だけ）
give('大久保忠隣', { armor: 0x1c1c1e, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x28282a, mon: 'okubo',
  face: face({ age: 48, brow: 1.3, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('真田昌幸', { armor: 0x1c1816, lace: 0x7a2a20, hat: 'kabuto_m', haori: 0x2a1c18, mon: 'sanada', lord: true,
  face: face({ age: 54, gaunt: 0.5, brow: 1.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.5, side: 0.3, stub: 0.8 } }) });
// 慶長五年の信繁（永禄十年の生まれで数え三十四・従五位下左衛門佐）。赤備えと鹿角の兜は大坂の陣（1614〜15）の姿なので、この戦では黒の二枚胴（上田市立博物館の伝信繁所用・鉄二枚胴具足）に並の兜。
// 共通の「真田信繁」（大坂の姿）を替えないよう、官途名で別に持つ（十の4：名乗りは年に合わせる）
const NOBU = '真田左衛門佐信繁';
give(NOBU, { armor: 0x1a1816, lace: 0x5a2a22, hat: 'kabuto_m', haori: 0x241a16, mon: 'sanada', tack: 0x2a1e18,
  face: { ...(GENERALS['真田信繁']?.face || face({})), age: 34 } });

// ---- 場所 ----
const C = { x: -10, z: -30 };                  // 上田城の本丸
const GATE = { x: 22, z: -30 };                // 大手門（東向き）
const FRONT = { x: 40, z: -30 };               // 大手門の前の町屋の外れ
const TOWN = { x: 62, z: -20 };                // 城下の町屋
const KARI = { x: 70, z: -66 };                // 城下の北の田（牧野康成の手が稲を刈る）
const KOKUZO = { x: 46, z: -118 };             // 北の林（虚空蔵山の方。信繁の手が出て来る）
const FORD = { x: 112, z: 0 };                 // 神川の浅瀬
const HONJIN = { x: 168, z: 6 };               // 秀忠の本陣（神川の東の染屋台。旗本に囲まれて動かない）
const RET = { x: 146, z: 4 };                  // 退く先（本陣の前）
const START = { x: 92, z: -52 };
const RIVER = [[108, -260], [112, -80], [106, 60], [110, 260]];
const AMA = [[-200, 22], [-60, 23], [10, 25], [56, 36], [107, 48]];   // 尼ヶ淵（崖の下の千曲川の分流。神川へ寄せて合わせる）
// 東の堀（矢出沢川の水を回した。神川は東へおよそ三キロで、城の堀には引いていない。大手門の前だけ土橋で切れる。寄せ手は水に足を取られ、塀の内の鉄砲に撃たれる。BA7・AV9）
// 堀は幅およそ五間（9m）・人の背より深い所もある水堀。大手門の前だけ土橋（幅 12m ほど）で切れる（critic60：幅 3m の帯で道に見えた）
const MOAT_N = [[GATE.x + 7, -37.5], [GATE.x + 7, -64], [-24, -64]];
const MOAT_S = [[GATE.x + 7, -22.5], [GATE.x + 7, 4], [-24, 4]];
// 城下の町屋の小路（北の田から大手門の前へ斜めに抜ける一本の道。両側に軒を連ねた町屋。critic60：草の原に家が二三軒だけ）
const LANE_A = { x: 68, z: -60 }, LANE_B = { x: 46, z: -34 };
const FORD_W = { x: FORD.x - 7, z: 0 };       // 神川の西の岸（追い討ちを食い止める所）
// 11/10 作り直し（docs/ueda2_spec_1109.md・kaito 11/9 夜「秀忠の大軍が真田に足止めされる」）
//   面白さは「大軍なのに少数の真田に時間だけを奪われ続ける」。真田は正面から付き合わず、出る・逃げる・誘う・伏せる・退く。
//   真田の小隊の動き：HARASS（撃って足を止める）→RETREAT（寄られたら次の所へ）→LURE（追えば追える間合い）→AMBUSH（狭い道の左右から）→DISENGAGE（林・城へ去る）
//   詰まり対策：真田の全滅を進む条件にしない／着いた所＋時間で次へ／追わなくても話は進む／門は時間＋寄せで進む（落ちない）。
const NIDA = { x: 88, z: -8 };                 // 城下の東の道に止めた荷駄（本隊の兵糧と玉薬）
const LURE = [{ x: 72, z: -70 }, { x: 63, z: -80 }, { x: 55, z: -92 }, { x: 47, z: -103 }, { x: 46, z: -117 }];   // 誘いの退き道（田の畦→林の間の細い道）
const TRAP = { x: 47, z: -103 };               // 林と林の間で道が狭まる所（左右に伏兵）
const OUT = { x: 66, z: -72 };                 // 囲みを抜けて戻る田
const RAID = { x: 74, z: 30 };                 // 荷駄を襲う真田の出る所（尼ヶ淵の岸の藪）
const MARCH = { x: 150, z: 92 };               // 中山道（木曽路）へ向かう道の先
const STEP_TEXT = ['',
  '城から出た真田勢を退けろ',
  '退く真田勢を追撃せよ',
  '伏兵の囲みを抜け、田まで戻れ',
  '上田城の大手門へ寄せよ',
  '後方の荷駄を救え',
  '上田攻めを止め、神川の岸に兵をまとめよ',
  '神川を渡り、中山道を西へ急げ'];
const LAST = STEP_TEXT.length - 1;
// 段ごとの刻限（秒）：これを過ぎたら、遊び手が何をしていても出来事で次へ進む（bot・人の詰まり止め。札には出さない）
const STEP_MAX = [0, 150, 130, 140, 260, 220, 200, 1e9];

const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.4;
  h += 0.18 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  // 城の南は尼ヶ淵の崖（千曲川の分流が段丘を削った。「尼ヶ淵城」の名の元。八の3：地形が守り）
  const cz = Math.min(1, Math.max(0, (z - 9) / 7)), cx = Math.min(1, Math.max(0, (40 - x) / 16));
  h -= 3.4 * cz * cz * (3 - 2 * cz) * cx;
  // 東の土塀の内の土塁（武者走り）：塀の内に高さ 2m ほどの土の段。鉄砲衆がその上から塀越しに撃つ（critic60：塀の内の鉄砲衆が撃たない）。
  //   大手門の口（|z| < 5）は切る（打って出る道）
  const rx = x < GATE.x - 1.8 ? (x > GATE.x - 8 ? 1 : Math.max(0, 1 - (GATE.x - 8 - x) / 3)) : Math.max(0, 1 - (x - (GATE.x - 1.8)) / 1.2);
  const rz = Math.min(1, Math.max(0, (Math.abs(z - GATE.z) - 5) / 2)) * Math.min(1, Math.max(0, (29 - Math.abs(z - GATE.z)) / 2));
  if (rx > 0 && rz > 0) { const k = rx * rz; h += 2.1 * k * k * (3 - 2 * k); }
  return h;
}
// 田（畦で区切った一枚ずつ）。北の田は刈りかけ：北の半分は稲が立ち、南の半分は刈った後の株と稲架
function paddy(x, z) {
  if (x < 48 || x > 100 || z < -92 || z > -46) return 0;
  if (dist({ x, z }, LANE_A) < 8 || dist({ x, z }, START) < 6) return 0;
  const a = Math.abs(((x - 48) % 13) - 6.5), b = Math.abs(((z + 92) % 11.5) - 5.75);
  return a > 5.9 || b > 5.15 ? 0 : 1;
}
const riceAt = (x, z) => z < -73 && paddy(x, z) > 0.6;

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 誘いの退き道（田→林の間の細い道）からの距離。道の上には木を立てない
function lureRoad(x, z) {
  let m = 1e9, a = KARI;
  for (const b of LURE) {
    const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2));
    m = Math.min(m, Math.hypot(x - a.x - vx * t, z - a.z - vz * t)); a = b;
  }
  return m;
}
// 真田の兵も黒い具足（赤備えは大坂の陣の時。AV1）。徳川の諸隊はそれぞれの家の旗
//   旗の鍵 'sanada' は赤備えの家（armor_uniform の RED_HOUSE）として胴と陣笠を朱にするので、この戦は別の鍵で持ち、
//   描く時だけ六文銭へ替える（def.flagEra。critic60：門の前の真田の足軽が真っ赤な胴と陣笠）
const SA = { flag: 'sanada1600', armor: 0x221e1b };

// ---- 刈りかけの田の稲と稲架（ここだけの形。絵の板でなく、細い葉と穂の束の形） ----
let RICE_MAT = null, STRAW_MATS = null;
// 一株：根元で束ねた細い葉が狭い V に立ち、上で重い穂が外へ弓なりに垂れる（葉は黄土、穂は明るい藁色）
function riceClump() {
  const parts = [], col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), k = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.3, lean = 0.05 + (i % 4) * 0.045, h = 0.8 + (i % 3) * 0.1;
    const g = new THREE.ConeGeometry(0.013, h, 3, 1, true); g.translate(0, h / 2, 0); g.rotateZ(lean); g.rotateY(a); parts.push(col(g.toNonIndexed(), i % 2 ? 0x9a8650 : 0x8f7f4c));
  }
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(0.022, 0.008, 0.3, 3, 1, true); g.translate(0, -0.15, 0); g.rotateZ(-2.35 - (i % 2) * 0.25); g.translate(0.03, 0.9 + (i % 2) * 0.06, 0); g.rotateY(i * 1.6 + 0.5);
    parts.push(col(g.toNonIndexed(), 0xd2b874));
  }
  const m = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return m;
}
function riceField(rt) {
  const W = rt.world, pts = [], low = SETTINGS.quality === 'low';
  const sx = low ? 0.62 : 0.44, sz = low ? 0.6 : 0.42;
  for (let z = -91.5; z < -73; z += sz) for (let x = 48.5; x < 100; x += sx) if (riceAt(x, z)) pts.push([x + (Math.sin(x * 7.1 + z) * 0.06), z + Math.cos(z * 5.3 + x) * 0.06]);
  if (!pts.length) return;
  RICE_MAT ||= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const geo = riceClump(), im = new THREE.InstancedMesh(geo, RICE_MAT, pts.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z], i) => {
    d.position.set(x, W.heightAt(x, z) - 0.03, z); d.rotation.set(0, (i * 2.399) % 6.28, 0);
    const s = 0.85 + ((i * 7919) % 100) / 330; d.scale.set(s, s * (0.95 + ((i * 31) % 10) / 60), s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, c.setScalar(0.88 + ((i * 17) % 10) / 45));
  });
  im.userData.noFreeze = true;
  rt.scene.add(im);
}
// 稲架（はさ）：杭を組み、横木に刈った稲束を掛けて干す。束は横木の両側へ厚く垂れて、遠くからは藁の壁に見える（critic60：尖った束が馬防柵に見えた）
function hasaK(rt, x, z, rot = 0, len = 9, solid = true) {
  const W = rt.world, wood = [], straw = [[], [], []];
  if (solid) solidRect(x, z, len + 0.4, 0.8, rot);
  const n = Math.max(2, Math.round(len / 2.3));
  for (let i = 0; i <= n; i++) {
    const lx = (i / n - 0.5) * len;
    for (const s of [-1, 1]) { const p = new THREE.CylinderGeometry(0.05, 0.06, 2.5, 5); p.rotateX(s * 0.16); p.translate(lx, 1.2, s * 0.2); wood.push(p); }
  }
  const tiers = [0.75, 1.25, 1.75];
  for (const y of tiers) {
    const bar = new THREE.CylinderGeometry(0.035, 0.035, len + 0.4, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, y + 0.05, 0); wood.push(bar);
    for (let k = 0, lx = -len / 2 + 0.1; lx < len / 2 - 0.05; k++, lx += 0.15) {
      for (const s of [-1, 1]) {
        const b = new THREE.BoxGeometry(0.17, 0.62 + ((k * 7) % 5) * 0.03, 0.09);
        b.translate(0, -0.3, 0); b.rotateX(s * (0.16 + ((k * 3) % 4) * 0.03)); b.rotateZ(((k * 11) % 7 - 3) * 0.025); b.translate(lx, y + 0.06, s * 0.05);
        straw[(k + (s > 0 ? 1 : 0)) % 3].push(b);
      }
    }
  }
  STRAW_MATS ||= [0xb39a58, 0xa88f4e, 0xbfa766].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(mergeGeometries(wood.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x5c4a34, roughness: 0.9 })));
  straw.forEach((L, i) => grp.add(new THREE.Mesh(mergeGeometries(L.map((g) => g.toNonIndexed())), STRAW_MATS[i])));
  grp.position.set(x, W.heightAt(x, z), z); grp.rotation.y = rot;
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rt.scene.add(grp);
}
const camBlock = (o) => { o.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); return o; };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const saD = dress(SA), tkD = dress({ flag: 'tokugawa' }), hoD = dress({ flag: 'honda' }), okD = dress({ flag: 'okubo' }), skD = dress({ flag: 'sakakibara' }), maD = dress({ flag: 'kashiwa' });
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const bu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, invuln: true, horse: true, ...o } });
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const k05_ueda = {
  resumeSteps: 7,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜7) を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。上田：九月初め（今の十月）の刈田。乾いた土、稲を刈った後の黄土の草、神川の岸の葦
  timeslip: {
    wet: 0.15, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, reeds: 0.4,
    grass: 0xb3a17c, grassTints: [0xffffff, 0xeee1c7, 0xd9c9a8], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI * 0.75 },
  minutes: 17,
  flagEra: { sanada1600: 'sanada', sakakibara: '榊原の日輪無' },   // 真田の兵の旗の鍵（SA）を六文銭で描く
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '小さな上田城の前に、徳川秀忠の三万八千。城から出る真田を退け、関ヶ原へ急げ。',
  stageGoalsOnly: true,    // 右上は五つの段だけ（「敵を何人討つ」で埋めない。三の1）
  hideGuideSteps: true,
  noYaguraTask: true,
  // 右上は今の段を番号付きで（始まりの話の間も①。「味方の旗へ」に替えない。三の3・十の1）
  missionHeading: (rt) => '①②③④⑤⑥⑦'[Math.min(LAST, Math.max(1, rt.flags.step || 1)) - 1] + STEP_TEXT[Math.min(LAST, Math.max(1, rt.flags.step || 1))],      // 隅櫓・物見櫓を目標にしない（城は落とさない戦。右上は六つの段だけ・十の1）
  depth: DEPTH,
  lethal: { max: 4, firstAt: 80, gap: 50 },   // 命懸けの戦場（docs/lethal_howto.md）：門の前の流れ弾・組頭の突然の討死
  fearKind: { kind: '城下の罠', note: '小路と門の前で四方から撃たれる', w: { flank: 1.6, losses: 1.3 }, line: '門の上から撃たれておるぞ！' },
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  horseHurtMul: 0,         // 馬の命を戻す前に一撃で落馬し、馬が消える事も防ぐ（critic60 X17）
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    let p = KARI;
    if (F.step === 1) p = KARI;
    else if (F.step === 2) { const c = live(F.sortie) && F.sortie.center(); p = c ? { x: c.x, z: c.z } : LURE[Math.min(LURE.length - 1, F.lureI || 0)]; }
    else if (F.step === 3) p = OUT;
    else if (F.step === 4) p = F.atFront ? FRONT : F.throughTown ? FRONT : LANE_B;
    else if (F.step === 5) p = NIDA;
    else if (F.step === 6) p = FORD_W;
    else if (F.step === 7) p = MARCH;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 ? 10 : 9;
    return PIN;
  },
  talk: {
    // 0:00〜：画面いっぱいの徳川の先に、小さな上田城（油断）
    before: [['本多忠政', 'あれが上田の城か。……思うたより小さいな'],
      ['徳川の足軽', 'これだけおれば、一日で落ちるだろ'],
      ['大久保忠隣', '牧野殿に刈田をさせて誘う。出て来た所を叩いて、すぐ西へ上る'],
      ['真田信之', '……あの城に、父と弟がいる'],
      ['本多忠政', '伊豆守殿。……いや、何も申すまい']],
    after: [['真田昌幸', '……行ったか。三万八千、ここで足を止めてやったわ'], ['徳川秀忠', '……美濃の戦に、間に合うか。木曽路を急げ']],
  },
  world: {
    seed: 1600906, time: 'day',
    groundHalf: 260, moveLim: 250,
    height,
    waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 1.15 }, { pts: AMA, w: 9, depth: 1.4 }, { pts: MOAT_N, w: 4.5, depth: 1.9 }, { pts: MOAT_S, w: 4.5, depth: 1.9 }],
    // 九月初め（今の十月）の田：刈った後の株（stubble）。立っている稲と稲架はこの戦の形で置く（riceField・hasaK）
    fieldStage: 'stubble',
    paddy,
    // 信濃の里山：杉と楢・栗の広葉樹が多く、松は少なめ。竹藪は置かない（critic60：遠くにシュロのような木）
    treeMix: { sugi: 0.5, matsu: 0.56 },
    noBamboo: true,
    sugiAt: () => 0.05,   // 林の中に竹を混ぜない（groves の竹は杉林の印があると置かれない）
    paths: [[[HONJIN.x + 30, 8], [HONJIN.x, 6], [FORD.x + 6, 2], [TOWN.x + 10, TOWN.z + 6], [FRONT.x, FRONT.z], [GATE.x + 2, GATE.z]], [[KARI.x, KARI.z + 2], [LANE_A.x, LANE_A.z], [LANE_B.x, LANE_B.z], [FRONT.x, FRONT.z]], [[KARI.x, KARI.z], ...LURE.map((q) => [q.x, q.z])], [[FORD.x + 6, 2], [MARCH.x - 20, MARCH.z - 40], [MARCH.x, MARCH.z], [MARCH.x + 10, MARCH.z + 40]]],
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.52 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);   // 秋の刈田
      if (Math.hypot(x - C.x, z - C.z) < 40) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.65 + 0.08, c.b * 0.55 + 0.05);
    },
    clear: (x, z) => (x > -30 && x < 200 && Math.abs(z) < 90) || dist({ x, z }, KOKUZO) < 14 || lureRoad(x, z) < 5,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (x < -30 || z < -96 || z > 90 ? 1 : 0.1),
    groves: [{ x: 84, z: 46, r: 10, n: 12 }, { x: 30, z: -104, r: 18, n: 30 }, { x: 64, z: -108, r: 14, n: 20 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -40 : x > 240),
  },
  sides: { a: { name: '徳川秀忠軍', mon: 'tokugawa' }, b: { name: '真田昌幸・信繁　上田城', mon: 'sanada' } },
  date: () => '慶長五年（1600）九月六日　信濃国 上田・晴',

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world, S = rt.scene;
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0; F.delay = 0;   // delay：真田に奪われた時（0〜100。高いほど締めの秀忠の焦りが強い）
    // ---- 上田城：土塀・大手門（櫓門）・櫓。城は落とせない ----
    const castle0 = S.children.length;
    wallLine(rt, [[GATE.x, GATE.z - 30], [GATE.x, GATE.z - 4]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z + 4], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z - 30], [C.x - 30, GATE.z - 30], [C.x - 30, GATE.z + 30], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    try { S.add(yaguramon(W, GATE.x, GATE.z, 7, Math.PI / 2, { doors: false, inside: true })); } catch (e) { console.warn(e); }
    // 大手門の扉：ふだんは閉じ、真田が打って出る時と城へ引く時だけ内へ開く（寄せ手は門をくぐって本丸へ入れない。十一の2・十一の3）
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 4, GATE.x, GATE.z + 4], nx: 1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '大手門の扉' });
    F.gate.noTarget = true;
    F.door = tobira(W, GATE.x, GATE.z, 7, Math.PI / 2, { h: 3.2 });
    F.door.userData.noFreeze = true;
    F.door.traverse((o) => { if (o.isMesh) o.userData.noBatch = true; });
    F.doorA = 0;
    for (const [x, z] of [[GATE.x - 3, GATE.z - 28], [GATE.x - 3, GATE.z + 28], [C.x - 28, GATE.z - 28]]) S.add(yagura(W, x, z, { mon: 'sanada', team: 1 }));
    // 大手門の左右の二重櫓は置かない（真田の上田城は小さな城。門の脇に大櫓が並ぶと江戸の大城に見えた。critic60）。門の脇は土塁の上の塀と鉄砲衆だけ
    // 六文銭の幟：土塀の内に並べ、寄せ手から城の守りが見えるように（Q・動かない城にだけ）
    for (const [x, z] of [[GATE.x - 10, GATE.z - 14], [GATE.x - 10, GATE.z + 14], [C.x, C.z], [GATE.x - 4, GATE.z - 22], [GATE.x - 4, GATE.z - 16], [GATE.x - 4, GATE.z + 16], [GATE.x - 4, GATE.z + 22],
      [GATE.x - 6, GATE.z - 5], [GATE.x - 6, GATE.z + 5], [C.x + 4, C.z - 8], [C.x + 4, C.z + 8], [C.x - 22, C.z - 22], [C.x - 22, C.z + 22]]) S.add(nobori(W, x, z, 'sanada', 7));
    // 本丸の二重櫓（今の西櫓と同じ下見板と白壁の二重。町屋の屋根越しに城の姿が見える）
    S.add(sumiyagura(W, C.x + 6, C.z - 14, { w: 9, d: 7, base: 4.2 }), sumiyagura(W, C.x + 6, C.z + 16, { w: 8, d: 6, base: 3.6 }));
    // 本丸の御殿（昌幸の居館）と米蔵・番所（四の5：城らしい本丸。天守は置かない＝真田の上田城に天守の確かな記録が無い）
    S.add(hut(W, C.x - 10, C.z + 2, 14, 9, Math.PI / 2), hut(W, C.x - 18, C.z - 8, 8, 6, Math.PI / 2));
    try { S.add(kuruwaBldg(W, 'kura', C.x - 16, C.z + 16, 0, {}), kuruwaBldg(W, 'bansho', C.x + 10, C.z + 20, 0, {})); } catch (e) { console.warn(e); }
    // 城の櫓門・塀・櫓はカメラを通さない（critic60：カメラが櫓門と家の中に入り、画面いっぱいに黒い壁）
    for (const o of S.children.slice(castle0)) camBlock(o);
    farSight(S.children.slice(castle0), { W, ground: { x: C.x + 10, z: C.z, r: 50 } });
    S.add(camBlock(F.door));
    const inner0 = S.children.length;
    // 門内は交互に口を空けた土塀で折れ、同じ道を戻れば必ず脱出できる。
    wallLine(rt, [[10, -60], [10, -27]], { team: 1, hp: 1e9, name: '門内の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[-2, -41], [-2, 0]], { team: 1, hp: 1e9, name: '門内の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    for (const o of S.children.slice(inner0)) camBlock(o);
    // ---- 城下の町屋：北の田から大手門の前へ抜ける小路の両側に、軒を連ねた町屋（critic60：小路が無い） ----
    {
      const L = dist(LANE_A, LANE_B), ux = (LANE_B.x - LANE_A.x) / L, uz = (LANE_B.z - LANE_A.z) / L, px = -uz, pz = ux;
      const rot = Math.atan2(-uz, ux);   // 家の長い辺（w）を小路に沿わせる
      // 小路の幅は家の前で 9m ほど（狭いとカメラが軒に入る）。門の前の広場の手前で家並みを切る
      for (let s = 4.5; s < L - 6; s += 10.5) for (const sd of [-1, 1]) {
        const x = LANE_A.x + ux * s + px * (sd * 8 + (s > 12 ? 2 : -2)), z = LANE_A.z + uz * s + pz * (sd * 8 + (s > 12 ? 2 : -2));
        S.add(camBlock(hut(W, x, z, 7, 5, rot, { minka: false })));
      }
    }
    for (const [x, z, w, d, r] of [[TOWN.x - 4, TOWN.z + 14, 9, 6, 0.2], [TOWN.x + 10, TOWN.z + 12, 8, 5, 0], [FRONT.x + 6, FRONT.z + 12, 8, 5, -0.05]]) S.add(camBlock(hut(W, x, z, w, d, r, { minka: false })));
    S.add(tawara(W, TOWN.x + 20, TOWN.z, 0.3, 4));
    // ---- 北の田：北の半分は稲が立ち、南の半分は刈った後で稲架に稲束を掛ける ----
    // 小路の入口の脇の稲架（81,-55）は当たりを付けない（11/9 二巡：稲架と町屋の間の袋で十五分抜けられなかった）
    try { riceField(rt); for (const [x, z, r, sd] of [[57, -69, 0.05, true], [84, -64, -0.04, true], [81, -55, 0.02, false]]) hasaK(rt, x, z, r, 9, sd); } catch (e) { console.warn(e); }
    // ---- 秀忠の本陣（神川の東・染屋台）：幕と葵の旗・篝火 ----
    S.add(jinmaku(W, HONJIN.x + 6, HONJIN.z, 18, 12, 6, { mon: 'tokugawa' }));
    for (const dz of [-10, -5, 0, 5, 10]) S.add(nobori(W, HONJIN.x - 6, HONJIN.z + dz, 'tokugawa', 6));
    for (const dz of [-8, 8]) S.add(nobori(W, HONJIN.x + 18, HONJIN.z + dz, 'tokugawa', 6));
    for (const dx of [-6, 0, 6]) S.add(nobori(W, HONJIN.x - 10 + dx, HONJIN.z - 30, 'sakakibara', 6));   // 榊原の陣の後ろ
    // 篝火は置かない（晴れた昼の陣で火は焚かない）
    // 染屋台の奥に三万八千の諸隊の陣（本多正信・酒井家次）。振り返っても本陣と諸隊の陣が見える（十三の4）。譜代は自家の紋（U5）
    for (const [x, z, mon] of [[214, -34, 'honda'], [222, 30, 'katabami'], [238, -2, 'honda']]) {
      S.add(jinmaku(W, x, z, 14, 10, 5, { mon }));
      for (const dz of [-6, 0, 6]) S.add(nobori(W, x - 9, z + dz, mon, 6));
    }
    // 染屋台の尾根に並ぶ三万八千の諸隊（本陣から百歩より奥。戦わずに控える。十二の1：遠くの軍勢も史実の規模で）。
    //   近くには出さない（九の5）。本陣の前（退く先）から 80m より遠い所だけ
    try {
      F.sometai = [];
      for (const [x, z, flag, n, sd] of [[244, -40, 'honda', 220, 51], [250, 34, 'katabami', 200, 52], [256, -4, 'tokugawa', 240, 53], [236, -74, 'okubo', 160, 54], [240, 70, 'sakakibara', 160, 55]])
        F.sometai.push(W.addDistantArmy({ x, z, w: 24, d: 12, count: n, facing: -Math.PI / 2, flag, team: 0, seed: sd, farFill: true, host: false }));   // farFill：持ち場から百四十歩より奥の隊も描く
    } catch (e) { console.warn(e); }
    for (const [x, z, mon] of [[226, -70, 'okubo'], [230, 66, 'sakakibara']]) { S.add(jinmaku(W, x, z, 12, 9, 5, { mon })); for (const dz of [-5, 0, 5]) S.add(nobori(W, x - 8, z + dz, mon, 6)); }
    KIT.farVillage(rt, 190, 100, { rot: -Math.PI / 2, n: 5, fields: 6, seed: 45 });

    // ---- 徳川方（本物の兵だけ） ----
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 3 }, facing: -Math.PI * 0.75, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      hoD([uS(4), uA(9), uG(3)]));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の先手', fullStrength: true, fixed: true, anchor: { x: START.x + 6, z: START.z - 6 }, facing: -Math.PI * 0.75, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      hoD([bu('本多忠政'), uS(5), uA(16), uG(5)]));
    F.makino = allyGroup(rt, { faction: 'tokugawa', name: '牧野康成の刈田の手', fullStrength: true, fixed: true, anchor: { x: KARI.x + 2, z: KARI.z }, facing: -Math.PI / 2, width: 7, aggro: 10, speed: 3.4, order: 'hold', noRout: true },
      maD([bu('牧野康成', { mon: 'kashiwa' }), uS(3), uA(14)]));   // 牧野の手は自家の三つ柏（葵は徳川の本陣だけ）
    F.okubo = allyGroup(rt, { faction: 'tokugawa', name: '大久保忠隣の手', fullStrength: true, fixed: true, anchor: { x: TOWN.x + 30, z: TOWN.z + 8 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      okD([bu('大久保忠隣'), uS(5), uA(14), uG(3)]));
    // 秀忠の本陣：神川の東で旗本に囲まれ、前に出ない（AR3・AT3）
    F.hide = allyGroup(rt, { faction: 'tokugawa', name: '徳川秀忠の本陣', fullStrength: true, fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z }, facing: -Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      tkD([bu('徳川秀忠', { horse: false }), uS(22), uG(6)]));
    F.hideU = F.hide.units.find((u) => u.name === '徳川秀忠');
    if (F.hideU) F.hideU._crouch = true;   // 床几に腰を下ろす
    F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康政の隊', fullStrength: true, fixed: true, anchor: { x: HONJIN.x - 10, z: HONJIN.z - 22 }, facing: -Math.PI / 2, width: 7, aggro: 6, seekRange: 14, order: 'hold', noRout: true, formation: 'yari' },
      skD([bu('榊原康政'), uS(4), uA(10), uG(3)]));
    // 真田信之（徳川方。父と弟の城を前に、何もできない。大げさに泣かせない）
    F.nobu = allyGroup(rt, { faction: 'tokugawa', name: '真田信之の手', fullStrength: true, fixed: true, anchor: { x: START.x + 4, z: START.z + 9 }, facing: -Math.PI * 0.6, width: 4, aggro: 4, seekRange: 8, order: 'hold', noRout: true },
      dress(SA)([bu('真田信之'), uS(3), uA(4)]));
    // 城下の東の道に止めた荷駄（米俵・玉薬の箱と人足）。⑤で真田に襲われる
    for (const [dx, dz] of [[-4, -2], [0, 1], [4, -1], [8, 2]]) S.add(tawara(W, NIDA.x + dx, NIDA.z + dz, 0.3 + dx * 0.05, 3));
    F.nida = allyGroup(rt, { faction: 'tokugawa', name: '荷駄の人足', fullStrength: true, fixed: true, anchor: { ...NIDA }, facing: -Math.PI / 2, width: 5, aggro: 3, seekRange: 6, order: 'hold', noRout: true, dmgMult: 0.4 },
      tkD([uA(6)]));
    // 画面いっぱいの徳川：神川を越えた後詰めの軽い大軍（本物の兵の枠を使わない。締めで木曽路へ動く）
    try { for (const [x, z, flag, n, sd] of [[124, -64, 'okubo', 150, 56], [126, -22, 'honda', 170, 57], [128, 22, 'kashiwa', 130, 58]]) F.sometai.push(W.addDistantArmy({ x, z, w: 20, d: 10, count: n, facing: -Math.PI / 2, flag, team: 0, seed: sd, farFill: true, host: false })); } catch (e) { console.warn(e); }
    for (const g of [F.honda, F.okubo, F.makino]) g.ai = true;
    // 牧野の足軽は田にかがんで稲を刈る（突っ立たせない。一の3）。真田が来れば立って戦う（army_anim が動きと相手で _crouch を解く）
    for (const u of F.makino.units) if (!u.mounted && u.type !== 'busho') u._crouch = true;
    // 真田昌幸は城の内（本丸）にいて出て来ない
    F.masa = this.foe(rt, '真田昌幸の旗本', { x: C.x + 2, z: C.z }, [bu('真田昌幸', { horse: false }), uS(6), uG(2)], { hold: true, width: 5 });
    F.masaU = F.masa.units.find((u) => u.name === '真田昌幸');
    F.masa.seekRange = 3; F.masa.aggro = 3; F.masa.noAI = true; F.masa.stay = true;   // 旗本は本丸の床几の周りを離れない（塀へ寄って立ち尽くさない）
    if (F.masaU) F.masaU._crouch = true;   // 本丸で床几に座り、出て来ない
    // 門の上の鉄砲衆（土塀の内に並ぶ。門へ寄る者を撃つ）。塀から五、六歩下げ、塀の外から槍が届かない（十一の2：塀越しに討てない）
    // 弓も並べる（nippon.com：寄せ手は「矢と鉄炮」で大きな損害）
    //   塀の内の土塁（height の武者走り）に立たせ、塀越しに撃てる高さにする（critic60：塀の陰で一度も撃たなかった）
    F.wallG = this.foe(rt, '大手門の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z - 9 }, [uS(1), uG(7), uB(2)], { hold: true, width: 6, dmg: 0.9 });
    F.wallG2 = this.foe(rt, '大手門の弓衆', { x: GATE.x - 4.5, z: GATE.z + 9 }, [uG(4), uB(3)], { hold: true, width: 6, dmg: 0.9 });
    // 隅櫓の脇の鉄砲衆（北と南の塀の内から、門へ寄る者を横から撃つ。BK3・BJ3）
    F.wallN = this.foe(rt, '北の隅櫓の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z - 18 }, [uG(6)], { hold: true, width: 6, dmg: 0.9 });
    F.wallS = this.foe(rt, '南の隅櫓の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z + 18 }, [uG(6)], { hold: true, width: 6, dmg: 0.9 });
    for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) { g.facing = Math.PI / 2; g.seekRange = 48; g.aggro = 0; g.noAI = true; g.stay = true; g.wallShot = true; }
    // 信繁の手は初めから北の林に潜む（伏兵。四の段で林から出る。急に湧かせない AT17・AV10）
    F.nobushige = this.foe(rt, '真田信繁の手', { x: C.x + 14, z: C.z + 12 }, [bu(NOBU), { type: 'cavalry', n: 4 }, uS(3), uA(8)], { hold: true, width: 6, morale: 100, dmg: 0.5 });
    F.nobushige.seekRange = 3; F.nobushige.aggro = 3; F.nobushige.noAI = true; F.nobushige.stay = true;   // ⑥まで城の内に控え、一度だけ後衛を突きに出る
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.8, () => rt.say(who, s, 3.4)));
    // 油断の間：秀忠の本陣は整然と余裕。少し間を置いてから城の門が開く
    rt.after(0.6 + T.length * 3.8 + 2, () => rt.say('秀忠の使番', '中納言様の仰せ。「今日のうちに片付けて西へ上る」', 3.2));
    rt.after(0.6 + T.length * 3.8 + 14, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 真田の隊を出す（見える所に湧かせない。城の門の内か、北の林から）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: o.facing ?? Math.PI / 2, width: o.width || 6, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: o.dmg || 0.55, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 16 : 90, aggro: o.hold ? 12 : 16, speed: 3.8, fire: true }, saD(list));
    if (o.aim) {
      const go = (q) => { q.anchor = { x: o.aim.x, z: o.aim.z }; q.order = 'move'; q.dest = { x: o.aim.x, z: o.aim.z }; q.onArrive = (r) => { if (r.order === 'move') r.order = 'attack'; }; };
      // 城の内から出る隊は、まず大手門をくぐって門の前へ（土塀に沿って滑らせない）
      if (at.x < GATE.x) { g.order = 'move'; g.dest = { x: GATE.x + 7, z: GATE.z }; g.anchor = { ...g.dest }; g.onArrive = (q) => { if (q.order === 'move') go(q); }; } else go(g);
    }
    // 追い討ちは岸の本人と接敵するまで退かない。隊の中心だけが岸へ着いて散ると、殿の相手が来なくなる。
    if (!o.hold) rt.after(40, () => { if (!g._keep) g.noRout = false; });   // 誘い・荷駄の襲いの小隊は崩れず、自分で退く（_keep）
    g._bornT = rt.t;
    F.foes.push(g);
    return g;
  },
  // 城の内へ退かせる（門をくぐったら去らせる）
  back(g) {
    if (!live(g)) return;
    // 往路の到着処理を残すと、城へ着いた後に町屋や川岸へ再出撃してしまう。
    g.onArrive = null;
    g.order = 'retreat'; g.dest = { x: GATE.x - 12, z: GATE.z }; g.speed = 4.3; g.aggro = 0; g.noRout = false;
    // 北の林や田から本丸へ直進すると北の土塀に当たる。城外の隊は、出撃時と同じ門の口を通って戻る。
    if (g.center().x >= GATE.x) {
      g.dest = { x: GATE.x + 7, z: GATE.z };
      g.onArrive = (q) => {
        if (q.order !== 'retreat') return;
        q.dest = { x: GATE.x - 12, z: GATE.z };
        q.onArrive = null;
      };
    }
  },

  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    const go = (g, p, then = 'hold', sp = 3.8) => {
      if (!live(g)) return;
      g.order = 'move'; g.dest = { ...p }; g.anchor = { ...p }; g.speed = sp;
      g.onArrive = (q) => { q.order = then; q.anchor = { ...p }; q.onArrive = null; };
    };
    if (n === 1) {
      // 2:00 真田が出てくる：信繁の手の若い者の小隊が大手門から打って出て、北の田の刈田の衆を襲う
      sfx('horagai', 0.8);
      F.sortie = this.foe(rt, '打って出た真田の小隊', { x: GATE.x - 6, z: GATE.z - 2 }, [uS(4), uA(14), uG(5)], { aim: { x: KARI.x - 4, z: KARI.z + 2 }, width: 7, morale: 100 });
      F.sortie.noRout = true; F.sortie._keep = true;
      F.w1N = aliveN(F.sortie);
      F.honda.order = 'attack'; F.honda.seekRange = 50; F.honda.anchor = { x: KARI.x, z: KARI.z + 4 };
      F.okubo.order = 'attack'; F.okubo.seekRange = 50; F.okubo.anchor = { x: KARI.x + 6, z: KARI.z + 12 };
      rt.after(3, () => rt.say('牧野康成', '城の門が開いた！　真田が刈田を襲うて来るぞ！', 3));
      rt.after(7, () => rt.say('本多忠政', '出て来たわ。田へ走れ、真田勢を退けよ！', 3));
    } else if (n === 2) {
      // RETREAT→LURE：真田は城と逆の北へ、畦・田・林の間の細い道を、追えば追える間合いでちょこちょこ逃げる
      F.lureI = 0; F.lureT = rt.t;
      const g = F.sortie;
      if (live(g)) { g.noRout = true; g.morale = 100; this.lureNext(rt); }
      rt.say('徳川の足軽', '逃げるぞ！　逃すな！', 2.6);
      rt.after(3.5, () => rt.say('大久保忠隣', '追え、追え！　小勢じゃ、揉み潰せ！', 3));
      rt.after(10, () => rt.say('徳川の足軽', 'ははっ、真田も口ほどにもない！', 2.8));
      // 本多・大久保の手も追う。追ううちに隊列が田の畦に細く伸びる
      for (const [g2, dx] of [[F.honda, 4], [F.okubo, 10]]) if (live(g2)) { g2.order = 'attack'; g2.seekRange = 18; g2.anchor = { x: LURE[1].x + dx, z: LURE[1].z + 6 }; }
    } else if (n === 3) {
      // AMBUSH：細い道の左右の林から鉄砲、前の真田は向き直る（「追わされた」）
      F.ambT = rt.t;
      const inTrap = dist(rt.player.u.pos, TRAP) < 26;
      F.delay += inTrap ? 18 : 10;
      sfx('volley', 1);
      rt.after(0.6, () => sfx('volley', 0.8));
      F.ambL = this.foe(rt, '林の伏兵', { x: TRAP.x - 13, z: TRAP.z + 2 }, [uS(2), uG(6)], { hold: true, width: 6, dmg: 0.5, facing: Math.PI / 2 });
      F.ambR = this.foe(rt, '林の伏兵', { x: TRAP.x + 13, z: TRAP.z + 2 }, [uS(2), uG(6)], { hold: true, width: 6, dmg: 0.5, facing: -Math.PI / 2 });
      for (const g of [F.ambL, F.ambR]) { g.seekRange = 26; g.aggro = 10; }
      if (live(F.sortie)) { const s = F.sortie; s.onArrive = null; s.order = 'attack'; s.seekRange = 22; s.aggro = 14; s.speed = 3.8; }
      for (let i = 0; i < 5; i++) rt.army.smoke(TRAP.x - 12, rt.world.heightAt(TRAP.x - 12, TRAP.z) + 1.4, TRAP.z - 6 + i * 3, 1, 0);
      for (let i = 0; i < 5; i++) rt.army.smoke(TRAP.x + 12, rt.world.heightAt(TRAP.x + 12, TRAP.z) + 1.4, TRAP.z - 6 + i * 3, 1, 0);
      rt.after(0.8, () => rt.say('徳川の足軽', '左右の林から撃って来た！', 2.6));
      rt.after(4, () => rt.say('本多忠政', '追わされたか……！　田まで退け、囲みを抜けよ！', 3.2));
      rt.after(9, () => rt.say(NOBU, '深追いは無用。少し削れば、それでよい', 3));
      // 55秒で伏兵は林へ去る（殺し尽くさない。時を奪えばよい）
      rt.after(55, () => { for (const g of [F.ambL, F.ambR, F.sortie]) this.away(rt, g, { x: 46, z: -136 }); });
      for (const [g2, p] of [[F.honda, { x: OUT.x - 4, z: OUT.z - 2 }], [F.okubo, { x: OUT.x + 8, z: OUT.z + 4 }]]) rt.after(8, () => go(g2, p, 'attack'));
    } else if (n === 4) {
      // 7:00 城を直接攻める：門と土塀へ短く圧力。一時はかなり近づける
      for (const g of [F.ambL, F.ambR, F.sortie]) this.away(rt, g, { x: 46, z: -136 });
      sfx('taiko', 1);
      if (F.hideU) F.hideU._crouch = false;   // 本陣の秀忠が床几から立つ
      rt.say('秀忠の使番', '美濃の方より急使！　「先を急がれよ」との事！', 3.4);
      rt.after(3.8, () => rt.say('徳川秀忠', '外へ出て来るなら、もう城を落とす。大手門へかかれ！', 3.4));
      for (const [g, p] of [[F.honda, { x: FRONT.x + 8, z: FRONT.z - 6 }], [F.okubo, { x: FRONT.x + 8, z: FRONT.z + 6 }], [F.saka, { x: FRONT.x + 12, z: FRONT.z + 12 }], [F.makino, { x: TOWN.x + 6, z: TOWN.z - 14 }]]) { go(g, p, g === F.makino ? 'hold' : 'attack'); if (live(g)) g.seekRange = 14; }   // 塀の内の鉄砲衆へ寄って塀に貼り付かない
      F.reAt = 0;
    } else if (n === 5) {
      // 9:00 また後ろから真田：荷駄が襲われ、城攻めを止められる（「あと少しだったのに」）
      sfx('horagai', 0.7);
      for (const g of [F.yari, F.re]) this.back(g);
      F.delay += 15;
      F.raid = this.foe(rt, '荷駄を襲う真田の小隊', RAID, [uS(3), uA(10), uG(3)], { aim: { x: NIDA.x - 2, z: NIDA.z + 4 }, width: 6, morale: 100, dmg: 0.5 });
      F.raid.noRout = true; F.raid._keep = true;
      F.w5N = aliveN(F.raid); F.nidaAt = 0;
      rt.say('秀忠の使番', '後方に真田勢！　荷駄が襲われております！', 3.2);
      rt.after(3.6, () => rt.say('徳川の足軽', 'あと少しだったのに！　……またかよ', 2.8));
      rt.after(7.5, () => rt.say('本多忠政', '荷駄を失えば西へは上れぬ。戻れ！　深追いはするな', 3.2));
      rt.after(14, () => rt.say('徳川秀忠', 'またか……！　城一つに、何刻かけておる', 3));
      go(F.okubo, { x: FRONT.x + 16, z: FRONT.z + 4 });
      go(F.saka, { x: FRONT.x + 18, z: FRONT.z + 14 });
      go(F.honda, { x: NIDA.x - 8, z: NIDA.z - 4 }, 'attack');
    } else if (n === 6) {
      // 11:00 関ヶ原から急使。攻めを止め、神川の岸に兵をまとめる。真田は無理に追わない
      sfx('horagai', 0.9);
      if (live(F.raid)) this.away(rt, F.raid, { x: 86, z: 56 });
      rt.say('秀忠の使番', '内府様より急使！　「上田にかかずらわず、急ぎ美濃へ上られよ」！', 4);
      rt.after(4.4, () => rt.say('徳川秀忠', '……ここまで来て、退くのか。……いや。攻めを止めよ。西へ急ぐ', 3.6));
      rt.after(9, () => rt.say('本多忠政', '負うた者を担げ。鉄砲と荷駄を先に、神川の岸へまとまれ！', 3.4));
      rt.after(15, () => rt.say('真田昌幸', '追うな。時は奪うた。それでよい', 3));
      for (const [g, p] of [[F.okubo, { x: FORD_W.x + 14, z: -14 }], [F.saka, { x: FORD_W.x + 18, z: 14 }], [F.makino, { x: FORD_W.x + 10, z: 22 }], [F.honda, { x: FORD_W.x - 2, z: FORD_W.z - 6 }], [F.nobu, { x: FORD_W.x + 4, z: FORD_W.z + 8 }]]) go(g, p, g === F.honda ? 'attack' : 'hold', 3.7);
      if (live(F.nida)) go(F.nida, { x: FORD_W.x + 20, z: 4 }, 'hold', 3.2);
      F.rallyAt = 0;
      // 信繁の手が一度だけ後衛へ出て、一撃してすぐ退く（一騎打ちにしない）
      rt.after(22, () => {
        const nb = F.nobushige;
        if (!live(nb) || F.step !== 6) return;
        F.nbOut = rt.t;
        nb.stay = false; nb.noAI = false;
        // 本丸から岸へ直進すると東の土塀に当たる。門の内側・門の外・岸の順に通る。
        const route = [{ x: GATE.x - 8, z: GATE.z }, { x: GATE.x + 7, z: GATE.z }, { x: FORD_W.x - 10, z: FORD_W.z - 2 }];
        let leg = 0;
        nb.order = 'move'; nb.dest = { ...route[0] }; nb.anchor = { ...nb.dest }; nb.speed = 4.4; nb.seekRange = 0; nb.aggro = 0;
        nb.onArrive = (q) => {
          if (F.step !== 6 || F.nbBack || q.order !== 'move') { q.onArrive = null; return; }
          if (++leg < route.length) { q.dest = { ...route[leg] }; q.anchor = { ...q.dest }; return; }
          F.nbAt = rt.t;
          q.order = 'attack'; q.seekRange = 20; q.aggro = 14; q.onArrive = null;
        };
        rt.say('徳川の足軽', '城から騎馬が来る！　六文銭じゃ！', 2.8);
      });
    } else if (n === 7) {
      // 13:00 関ヶ原へ急ぐ：撤退でなく行軍
      sfx('horagai', 0.7);
      if (live(F.nobushige) && !F.nbBack) { F.nbBack = true; this.back(F.nobushige); }
      rt.say('本多忠政', '川を渡れ。中山道を西へ、夜通し駆けるぞ', 3);
      rt.after(5, () => rt.say('徳川の足軽', '……もう遅れておるのではないか', 2.6));
      const k = [[F.okubo, -10, -6], [F.saka, 6, -14], [F.makino, -14, 8], [F.honda, 0, 4], [F.nobu, 8, 8], [F.mine, 3, 3], [F.nida, -6, 14], [F.hide, 12, 22]];
      for (const [g, dx, dz] of k) if (live(g)) { g.stay = false; go(g, { x: MARCH.x + dx, z: MARCH.z + dz + 10 }, 'hold', 3.6); }
    }
  },

  // 真田の小隊の LURE：寄られたら次の所へ退き、着いたら向き直って撃つ（HARASS）。追えば追える間合いを保つ
  lureNext(rt) {
    const F = rt.flags, g = F.sortie;
    if (!live(g) || F.lureI >= LURE.length) return;
    const p = LURE[F.lureI];
    g.order = 'move'; g.dest = { ...p }; g.anchor = { ...p }; g.speed = 3.9; g.aggro = 0; g.seekRange = 0;
    g.onArrive = (q) => { q.order = 'hold'; q.aggro = 6; q.seekRange = 12; q.onArrive = null; F.lureAt = rt.t; F.lureI++; };
    F.lureMoveT = rt.t;
  },
  lureTick(rt) {
    const F = rt.flags, g = F.sortie;
    if (F.step !== 2 || !live(g)) return;
    const c = g.center();
    if (g.order === 'move') {
      // 引っかかったら（二十秒進まない）次の所へ自動で退く（詰まり止め③）
      if (rt.t - F.lureMoveT > 20) {
        F.lureMoveT = rt.t;
        // 見えない所なら先へ送る。見える所では、田の真ん中を通る別の道で行き直す（飛んで見えない）
        if (dist(c, rt.player.u.pos) > 45) { for (const u of g.units) if (u.alive && !u.gone) { u.pos.x = g.dest.x + (u.pos.x - c.x) * 0.5; u.pos.z = g.dest.z + (u.pos.z - c.z) * 0.5; } }
        else { const d = g.dest; g.dest = { x: KARI.x + 2, z: KARI.z - 4 }; g.onArrive0 = g.onArrive; g.onArrive = (q) => { q.dest = d; q.onArrive = q.onArrive0; }; }
      }
      return;
    }
    if (F.lureI >= LURE.length) return;
    let dmin = 1e9;
    for (const u of rt.army.units) if (u.team === 0 && u.alive && !u.gone && !u.fleeing) { const d = dist(u.pos, c); if (d < dmin) dmin = d; }
    // 寄られたら退く。誰も来ない時も、十八秒で次の所へ（追わなくても話は進む⑥）
    if (dmin < 12 || rt.t - (F.lureAt || 0) > 18) {
      if (F.lureI === 1) rt.say('真田の足軽', '徳川の大軍も、この小勢を追い切れぬか！', 2.8);
      this.lureNext(rt);
    }
  },
  // DISENGAGE：林・城へ去り、着いたら消える（本物の兵の枠を空ける）
  away(rt, g, to) {
    if (!live(g)) return;
    g.onArrive = null; g.order = 'retreat'; g.dest = { ...to }; g.anchor = { ...to }; g.speed = 4.4; g.aggro = 0; g.seekRange = 0; g.noRout = true; g._away = true;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    const P = rt.player;
    P.u.invuln = true;
    for (const g of F.foes) if (g !== F.masa && !g.wallShot && g !== F.gateRear) this.back(g);
    // 最後の絵：振り返ると、遠くに無傷の上田城と六文銭の旗、その前に小さく真田の兵
    F.gateRear = this.foe(rt, '大手門の前の真田の兵', { x: GATE.x + 8, z: GATE.z }, [uS(2), uA(6)], { hold: true, width: 5 });
    F.gateRear.noAI = true; F.gateRear.stay = true; F.gateRear.aggro = 0; F.gateRear.seekRange = 0;
    sfx('horagai', 0.5);
    const late = (F.delay || 0) >= 45;
    rt.after(1, () => rt.say('真田信之', '……父上……。', 2.6));
    const talk = [this.talk.after[0], late ? ['徳川秀忠', '……遅れた。美濃の戦に、間に合うか。木曽路を急げ'] : ['徳川秀忠', '……まだ間に合うやもしれぬ。木曽路を急げ']];
    // 締め：急使・陣払い・「関ヶ原に間に合わず」（k05/end.js が finish を呼ぶ）。段の済み・手柄は締めの直前に
    rt.after(4, () => endScene(rt, { armies: F.sometai, talk, done: () => {
      F.won = true;
      F.victoryShown = true;   // 共通の勝鬨と祝勝の動きを重ねない（静かに去る戦）
      rt.objDone('s' + LAST);
      rt.tracker.main = true;
      const good = (F.delay || 0) < 45;
      rt.award((t) => { t.main = true; t.special = { label: good ? '真田に釣られず兵をまとめた' : '上田から兵をまとめて退いた', pts: good ? 25 : 15 }; }, good ? '真田に釣られず兵をまとめた' : '上田から兵をまとめて退いた');
    } }));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick?.(rt);
    // 右上の目標に刻限の時計を付けない（タイマーは出さない。時は使番・本陣・急使で見せる）
    if (!F.noClock && rt._g5) { for (const g of rt._g5.goals) g.sec = 0; F.noClock = true; }
    this.gateTick(rt, dt);
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    if (F.step === 1 && dist(P.pos, KARI) < 20) F.kariJoined = (F.kariJoined || 0) + dt;
    if (F.step === 4 && F.atFront && (dist(P.pos, FRONT) < 32 || dist(P.pos, GATE) < 34)) F.reAt += dt;
    if (F.step === 5 && dist(P.pos, NIDA) < 18) F.nidaAt += dt;
    if (F.step === 6 && dist(P.pos, FORD_W) < 16) F.rallyAt += dt;
    // 手勢は本人の脇に付いて一緒に走る
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c && F.step < LAST) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 2.5 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const el = rt.t - F.stepT, over = el > STEP_MAX[F.step];
    // 城の内へ退いた真田・林へ去った真田は消す（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) {
        if (g.order === 'retreat' && !g._away) for (const u of g.units) if (u.alive && !u.gone && u.pos.x < GATE.x - 4) rt.army.despawn(u);
        if (g._away) for (const u of g.units) if (u.alive && !u.gone && (dist(u.pos, g.dest) < 8 || dist(u.pos, P.pos) > 70)) rt.army.despawn(u);
      }
    }
    if (live(F.masa) && F.masa.order !== 'hold') { F.masa.order = 'hold'; F.masa.anchor = { x: C.x + 2, z: C.z }; }
    this.wallFire(rt);
    this.lureTick(rt);
    // 本陣の焦り：時が経つほど使番が増え、秀忠の言葉が短くなる（タイマーの代わり）
    if (!F.mood1 && F.step >= 2 && rt.t > 300) { F.mood1 = true; rt.say('秀忠の使番', '中納言様より。「まだ片付かぬか」との仰せ', 3); }
    if (!F.mood2 && F.step >= 4 && rt.t > 560) { F.mood2 = true; rt.say('徳川秀忠', '日が傾く……。今日のうちに、ここを抜けねばならぬ', 3.2); }
    if (F.step === 1) {
      const k = F.w1N - aliveN(F.sortie);
      // 最初は簡単に押せる：三割ほど討つか、田で三十秒ぶつかれば、真田は退く（全滅を条件にしない①）
      if ((F.kariJoined > 6 && (k >= Math.round(F.w1N * 0.3) || F.kariJoined > 30)) || over) this.toStep(rt, 2);
    } else if (F.step === 2) {
      // 追った先の細い道で伏兵。追わなかった時も、本多の手が追って伏兵に掛かる（話は止まらない⑥）
      const nearTrap = dist(P.pos, TRAP) < 22;
      if ((F.lureI >= LURE.length && (nearTrap || el > 75)) || (nearTrap && (F.lureI >= LURE.length - 1 || !live(F.sortie))) || over) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 囲みを抜けて田へ戻る（伏兵の全滅を待たない）
      if ((dist(P.pos, OUT) < 12 && el > 25) || over) {
        rt.say('本多忠政', '……追うては戻るばかり。また時を失うたわ', 3);
        this.toStep(rt, 4);
      }
    } else if (F.step === 4) {
      // 小路の出口から門の前へ。着いたら門から真田の槍が出る。門は落ちない（時間＋寄せで進む⑤）
      if (!F.atFront) {
        if (dist(P.pos, LANE_B) < 5) F.throughTown = true;
        if ((F.throughTown && (dist(P.pos, FRONT) < 10 || (P.pos.x > GATE.x - 12 && P.pos.x < FRONT.x + 6 && Math.abs(P.pos.z - GATE.z) < 14))) || el > 150) {
          F.atFront = true; F.reAt = 0;
          sfx('taiko', 1); sfx('volley', 0.9);
          for (let i = 0; i < 6; i++) rt.army.smoke(GATE.x - 2, rt.world.heightAt(GATE.x, GATE.z) + 2.6, GATE.z - 8 + i * 3.2, 1, 0);
          F.yari = this.foe(rt, '門から打って出た真田の槍', { x: GATE.x - 8, z: GATE.z }, [uS(4), uA(14), uG(2)], { aim: { x: FRONT.x + 2, z: FRONT.z }, width: 8, morale: 98 });
          F.w4N = aliveN(F.yari);
          rt.after(2, () => rt.say('徳川の足軽', '門の上から撃ってくる！', 2.6));
          rt.after(8, () => rt.say('榊原康政', '数はこちらが十倍じゃ。塀に取り付け！', 3));
          rt.after(18, () => rt.say('真田昌幸', '引き付けて放て。門の前に寄せた者から撃て', 3));
        }
      } else {
        const k = F.w4N - aliveN(F.yari);
        if (!F.ikeru && F.reAt > 30 && k >= Math.round(F.w4N * 0.3)) { F.ikeru = true; rt.say('徳川の足軽', '門の槍が引いた！　いけるぞ！', 2.6); this.back(F.yari); }
        if (F.reAt > 55 && (F.ikeru || F.reAt > 80)) this.toStep(rt, 5);
      }
      if (over) this.toStep(rt, 5);
    } else if (F.step === 5) {
      // 荷駄を守る：敵0人を待たない④。守り切ったら真田はまた逃げる
      const k = F.w5N - aliveN(F.raid);
      if (!F.raidGone && ((F.nidaAt > 20 && (k >= Math.round(F.w5N * 0.4) || F.nidaAt > 45)) || el > 170)) {
        F.raidGone = rt.t;
        this.away(rt, F.raid, { x: 86, z: 58 });
        rt.say('徳川の足軽', '真田がまた逃げるぞ！', 2.4);
        rt.after(2.6, () => rt.say('本多忠政', '追うな！　荷駄を守れ。二度は釣られぬ', 3));
      }
      // 二度目の学び：追えば林の鉄砲に撃たれて、また時を失う。追わなければ損は少ない
      if (F.raidGone && !F.trap2 && P.pos.z > 24 && rt.t - F.raidGone < 30) {
        F.trap2 = true; F.delay += 10;
        sfx('volley', 0.9);
        F.grove = this.foe(rt, '藪の鉄砲', { x: 84, z: 44 }, [uG(5)], { hold: true, width: 5, dmg: 0.4, facing: Math.PI });
        F.grove.seekRange = 26;
        rt.after(1, () => rt.say('本多忠政', 'また誘いじゃ！　戻れ！', 2.6));
        rt.after(20, () => this.away(rt, F.grove, { x: 86, z: 70 }));
      }
      if ((F.raidGone && rt.t - F.raidGone > (F.trap2 ? 22 : 12)) || over) this.toStep(rt, 6);
    } else if (F.step === 6) {
      // 兵をまとめる：岸に三十秒いて、信繁の一撃が済む（来なければ刻限で）
      if (F.nbOut && !F.nbBack && rt.t - F.nbOut > 20 && live(F.nobushige)) {
        const c = F.nobushige.center();
        if (F.nbAt != null && rt.t - F.nbAt > 10 && dist(c, FORD_W) < 18) { F.nbBack = true; rt.say(NOBU, '……ここまで。引くぞ', 2.6); this.back(F.nobushige); }
      }
      if ((F.rallyAt > 30 && (F.nbBack || el > 120)) || over) this.toStep(rt, 7);
    } else if (F.step === 7) {
      if (dist(P.pos, MARCH) < 14) this.win(rt);
    }
  },

  // 塀の内の土塁の鉄砲と弓：門へ寄る徳川の兵を、塀越しに次々に撃つ（二の7・十の3。critic60：門の前で味方がほとんど倒れない）
  wallFire(rt) {
    const F = rt.flags, A = rt.army;
    if (F.step !== 4 || !F.atFront) return;   // 門へ寄せる段だけ撃つ（⑤の荷駄へ戻る背・⑥の退く間は撃たない）
    const foes = [];
    for (const u of A.units) if (u.team === 0 && u.alive && !u.gone && !u.invuln && u.pos.x > GATE.x + 2 && u.pos.x < GATE.x + 46 && Math.abs(u.pos.z - GATE.z) < 34) foes.push(u);
    const P = rt.player.u;
    // 誘われて門内へ入った本人も射程内なら狙う。門から十二歩より奥が安全地帯にならないようにする。
    if (P.alive && !P.invuln && P.pos.x > C.x - 30 && P.pos.x < GATE.x + 46 && Math.abs(P.pos.z - GATE.z) < 34 && !foes.includes(P)) foes.push(P);
    if (!foes.length) return;
    // 本人を狙う射手は、門の正面の組（無ければ次の組）の一人だけ。鉄砲が倒れても弓が引き継ぐ。
    // 四つの組から一人ずつ狙わせない（11/9 見回り 徳川D：⑤の門の前で三十秒で倒れた）。
    let aimU = null;
    if (foes.includes(P)) for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) {
      aimU = g?.units.find((v) => v.alive && !v.gone && (v.type === 'gun' || v.type === 'bow') && dist(v.pos, P.pos) < 50);
      if (aimU) break;
    }
    for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) {
      if (!g) continue;
      for (const u of g.units) {
        if (!u.alive || u.gone || (u.type !== 'gun' && u.type !== 'bow')) continue;
        if (u.gunAmmo !== undefined && u.gunAmmo < 5) u.gunAmmo = 20;
        const last = u.type === 'gun' ? u.gunShotAt ?? -99 : u._wallShotAt ?? -99, every = u.type === 'gun' ? 7 : 4.5;
        if (A.time - last < every + ((u.id || 0) % 7) * 0.4) continue;
        // 的は門の前に寄せた兵から散らして選ぶ（一人に弾が集まらない。主人公だけを狙い撃ちにしない）
        // 主人公を狙う一人以外は味方の兵を狙う。無作為の選択で全員が主人公へ撃つ抜け道も防ぐ。
        let t = u === aimU ? P : null;
        for (let k = 0; k < 4 && !t; k++) { const o = foes[Math.floor(Math.random() * foes.length)]; if (o !== P && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 50) t = o; }
        if (!t) continue;
        u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
        if (u.type === 'gun') A.fireGun(u, t); else { u._wallShotAt = A.time; A.shoot(u, t); }
      }
    }
  },

  // 大手門の扉：門の近くに出入りする真田がいる時だけ開け、いなければ閉める。本人が門の口に立つ間は閉めない
  gateTick(rt, dt) {
    const F = rt.flags, P = rt.player?.u;
    if (!F.gate) return;
    if ((F.gateT = (F.gateT || 0) - dt) <= 0) {
      F.gateT = 0.3;
      // 段の間ずっと開けず、真田の出入りの時だけ開ける。
      let need = false;
      for (const g of F.foes) {
        if (g.order === 'hold' && !g.dest) continue;
        if (g.order !== 'retreat' && g.order !== 'move' && rt.t - (g._bornT ?? rt.t) > 12) continue;
        for (const u of g.units) if (u.alive && !u.gone && Math.abs(u.pos.x - GATE.x) < 14 && Math.abs(u.pos.z - GATE.z) < 12) { need = true; break; }
        if (need) break;
      }
      const inMouth = P && Math.abs(P.pos.x - GATE.x) < 2.5 && Math.abs(P.pos.z - GATE.z) < 4.5;
      const inside = P && P.pos.x < GATE.x - 1 && Math.abs(P.pos.z - GATE.z) < 30;
      F.gate.alive = !(need || inMouth || inside);
    }
    const want = F.gate.alive ? 0 : 1.25;
    if (F.doorA !== want) {
      F.doorA += Math.sign(want - F.doorA) * Math.min(Math.abs(want - F.doorA), dt * 1.4);
      F.door.userData.leaves.forEach((pv, i) => { pv.rotation.y = (i ? -1 : 1) * F.doorA; });
      for (const c of F.door.children) if (!F.door.userData.leaves.includes(c)) c.visible = F.doorA < 0.05;   // 閂は閉じた時だけ
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が城へ引いていく！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    // 寄れない敵（稲架・町屋・味方の列の向こう）を八秒追って近づけない時は、その敵を二十秒は相手にしない
    const IG = F._ign || (F._ign = new Map());
    // 段ごとに相手にする所を絞る：③は囲みの中で斬り合わず田へ戻る、⑤は荷駄の周りだけ（追わない）、⑥は岸だけ、⑦は相手にしない
    const zone = (o) => (F.step === 3 ? dist(o.pos, u.pos) < 3.5 : F.step === 5 ? dist(o.pos, NIDA) < 20 : F.step === 6 ? dist(o.pos, FORD_W) < 20 : F.step === 4 ? o.pos.x > GATE.x + 5 : true);
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && zone(o) && !((IG.get(o) || 0) > b.t);
    const lane = F.step === 4 && !F.atFront;
    const e = lane || F.step === LAST ? null : b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const C = F._chase;
      if (!C || C.e !== e) F._chase = { e, t: b.t, d };
      else if (d < C.d - 0.8) { C.d = d; C.t = b.t; }
      else if (d > 2.6 && b.t - C.t > 8) { IG.set(e, b.t + 20); F._chase = null; }
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = this.missionPin(b) || MARCH;
    // ②の追撃は畦の道筋に沿う（田の稲架に当たらない）
    if (F.step === 2) { const i = Math.min(LURE.length - 1, Math.max(0, (F.lureI || 0) - 1)); if (dist(u.pos, LURE[i]) > 6 && u.pos.z > LURE[i].z + 4) t = LURE[i]; }
    // ③は来た道を田へ戻る
    if (F.step === 3 && u.pos.z < LURE[1].z - 4) { const i = u.pos.z < LURE[2].z - 3 ? 2 : 1; t = LURE[i]; }
    // ④：北の田から町屋の小路へは入口から入る（稲架と入口の町屋の間の袋へ入らない）
    if (lane && !F.throughTown) {
      const x = u.pos.x, z = u.pos.z, ux = -0.647, uz = 0.765;
      const s = (x - LANE_A.x) * ux + (z - LANE_A.z) * uz, side = Math.abs((x - LANE_A.x) * uz - (z - LANE_A.z) * ux);
      if (x > 76 && x < 92 && z > -55 && z < -44) t = x < 87.5 ? { x: 90, z: -53 } : { x: 90, z: -59.5 };
      else if (x > 76 && z > -63.6 && z <= -55) t = { x: 71, z: -59.5 };
      else if (x > 78 && z <= -64.4) t = { x: 74, z: -66.5 };
      else if ((s < -1 || side > 4.5) && dist(u.pos, LANE_A) > 2) t = LANE_A;
    }
    // 小路の出口までは筋に沿って歩く（中ほどから門へ直進して町屋に当たらない）
    if (lane && F.throughTown) {
      const x = u.pos.x, z = u.pos.z, ux = -0.647, uz = 0.765;
      const s = (x - LANE_A.x) * ux + (z - LANE_A.z) * uz, side = (x - LANE_A.x) * uz - (z - LANE_A.z) * ux;
      if (s < dist(LANE_A, LANE_B) - 2) t = Math.abs(side) > 3 ? { x: LANE_A.x + ux * (Math.max(0, s) + 4), z: LANE_A.z + uz * (Math.max(0, s) + 4) } : LANE_B;
    }
    // ⑤：門の前から荷駄へは、小路を通らず町屋の間の道（72,-14）を通って東へ
    if (F.step === 5 && u.pos.x < 68 && dist(u.pos, NIDA) > 20) t = { x: 72, z: -14 };
    // 何かに当たって四秒動けない時は、行き先と直角に三秒よける
    const B = F._bs || (F._bs = { x: u.pos.x, z: u.pos.z, t: b.t, until: 0, sgn: 1 });
    if (b.t > B.until) {
      if (Math.hypot(u.pos.x - B.x, u.pos.z - B.z) > 1.2) { B.x = u.pos.x; B.z = u.pos.z; B.t = b.t; }
      else if (b.t - B.t > 4 && dist(u.pos, t) > 4) { B.until = b.t + 3; B.sgn = -B.sgn; B.t = b.t + 3; }
    }
    if (b.t < B.until) {
      const L = Math.max(1, dist(u.pos, t)), ax = (t.x - u.pos.x) / L, az = (t.z - u.pos.z) / L;
      t = { x: u.pos.x + (-az * B.sgn - ax * 0.4) * 6, z: u.pos.z + (ax * B.sgn - az * 0.4) * 6 };
    }
    if (dist(u.pos, t) > 2.5) goTo(p, inp, t.x, t.z, 2); else inp.k.delete('KeyW');
  },
};

// 両軍の総勢：秀忠軍およそ三万八千、上田城の真田勢は二千五百ほど（諸説）
k05_ueda.force = (rt) => {
  const F = rt.flags;
  // 押し返されたのは徳川の先手（critic60：小競り合いで真田が八百も減った）。徳川の討たれは重く、真田の減りは軽く数える
  return { a: Math.max(0, Math.round(38000 - (F.ak || 0) * 40)), a0: 38000, b: Math.max(0, 2500 - (F.ek || 0) * 2), b0: 2500 };
};
k05_ueda.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k05_ueda.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k05_ueda.history = '慶長五年（1600）、会津征伐から引き返した徳川秀忠は、三万八千の軍を率いて中山道を西へ進んだ。信濃の上田城には、豊臣方（西軍）に付いた真田昌幸と次男・信繁がおよそ二千五百で籠った。長男の信之は徳川方で、真田家は父・弟と長男に分かれた。\n秀忠は降伏を勧めたが昌幸は返事を引き延ばして時を稼いだ。九月五日、信之が戸石城に向かうと、信繁は兄と戦うのを避けて上田城へ退いた。翌六日ごろ、秀忠は牧野康成らに城下の稲を刈らせ、城から出た真田の兵と小競り合いになった。本多忠政・大久保忠隣の手が追って大手門に迫ったが、城の鉄砲と伏兵に押し返され、秀忠は兵を引かせた。\n上田城は落ちず、家康から急ぎ美濃へ上れとの使者を受けた秀忠は西へ急いだが、九月十五日の関ヶ原の決戦に間に合わなかった。戦いの細部（伏兵・神川の堰を切った話など）は軍記物の伝えで、小競り合いだったとする見方もある。\nこの遊びでは、家康の急使が城攻めの最中に着いた事にしている（実際に秀忠のもとへ着いたのは九月八日ごろ）。';
k05_ueda.bushou = [{ name: '真田信繁', g: /信繁/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = STEP_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
// 右上の七つ（goals5.js の def.goals5）：刻限の時計を付けない
k05_ueda.goals5 = () => STEP_TEXT.slice(1).map((text, i) => {
  const kill = [1, 0, 0, 1, 1, 0, 0][i];
  return { kind: 'stage', k: i, text, sec: 1e6, check: (rt) => (rt.flags.step ?? 0) > i + 1 || !!rt.flags.won, ...(kill ? { count: (rt) => (rt.flags.step === i + 1 ? KILLS[ID](rt) : null) } : {}) };
});
// 倒す数：段が進む判定と同じ数え方
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, aliveN(F.sortie), F.w1N - Math.round(F.w1N * 0.3));
  if (F.step === 4) return F.yari ? cut(F.w4N, aliveN(F.yari), F.w4N - Math.round(F.w4N * 0.3)) : null;
  if (F.step === 5) return F.raid ? cut(F.w5N, aliveN(F.raid), F.w5N - Math.round(F.w5N * 0.4)) : null;
  return null;
};

export { k05_ueda };
export default k05_ueda;
