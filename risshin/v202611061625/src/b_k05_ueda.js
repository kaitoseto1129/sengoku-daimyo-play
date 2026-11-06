// ======================================================================
// 徳川編 5　第二次上田合戦（慶長五年九月六日・1600　秋・晴）　筋書きの正：docs/chapter3_tokugawa.md の「5.」
// 手本と出所：docs/battle_refs/k05_ueda.md
// 中山道を西へ向かう徳川秀忠の三万八千が、上田城の真田昌幸・信繁（およそ二千五百）に行く手を阻まれた。
// 長男の信之は徳川方で、戸石城を受け取りに行っている（父・弟と分かれた。この戦の場には出ない）。
// 秀忠は染屋台に本陣を置き、牧野康成に城下の稲を刈らせて真田を誘った。城から真田の兵が打って出て刈田の衆を襲い、
// 本多忠政・大久保忠隣の手が押し返して大手門まで追った。門の上の鉄砲と、門から打って出た槍、虚空蔵山の方から横を突く信繁の手に、
// 追い込んだ先手は討たれ、秀忠の命で引き揚げた。城は落ちず、家康の急使を受けた秀忠は西へ急ぎ、関ヶ原（九月十五日）に間に合わなかった。
// 主人公は本多忠政の先手の侍大将。目標は六つ（STAGES）：
//   ①北の田で刈田を襲う真田の兵を討つ ②町屋の小路を抜け大手門の前へ ③門から打って出た槍を討つ ④横から来る信繁の手を押し返す
//   ⑤神川の岸で追い討ちの真田を食い止める ⑥神川を渡り秀忠の本陣の前へ退く
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
give('大久保忠隣', { armor: 0x1c1c1e, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x28282a, mon: 'none',
  face: face({ age: 48, brow: 1.3, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('真田昌幸', { armor: 0x1c1816, lace: 0x7a2a20, hat: 'kabuto_m', haori: 0x2a1c18, mon: 'sanada', lord: true,
  face: face({ age: 54, gaunt: 0.5, brow: 1.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.5, side: 0.3, stub: 0.8 } }) });
// 慶長五年の信繁（三十三歳・従五位下左衛門佐）。赤備えと鹿角の兜は大坂の陣（1614〜15）の姿なので、この戦では黒の二枚胴（上田市立博物館の伝信繁所用・鉄二枚胴具足）に並の兜。
// 共通の「真田信繁」（大坂の姿）を替えないよう、官途名で別に持つ（十の4：名乗りは年に合わせる）
const NOBU = '真田左衛門佐信繁';
give(NOBU, { armor: 0x1a1816, lace: 0x5a2a22, hat: 'kabuto_m', haori: 0x241a16, mon: 'sanada', tack: 0x2a1e18,
  face: { ...(GENERALS['真田信繁']?.face || face({})), age: 33 } });

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
// 段ごとの長さの目安（秒）。過ぎても負けにせず、味方の働きで次へ進む（二の5・十二の3）
const STEP_T = [0, 170, 120, 170, 170, 130, 1e9];
// 目標の言葉は右上の六つ（STAGES）と同じ字。途中で言い替えない（十の1）
const STEP_TEXT = ['',
  '北の田で刈田を襲う真田の兵を討つ',
  '町屋の小路を抜け、大手門の前まで追う',
  '大手門の前で、門から出た真田の槍を討つ',
  '北の林から来た真田信繁の手を押し返す',
  '神川の岸で、追い討ちの真田を食い止める',
  '神川を渡り、秀忠の本陣の前まで退く'];
const LAST = STEP_TEXT.length - 1;

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
function hasaK(rt, x, z, rot = 0, len = 9) {
  const W = rt.world, wood = [], straw = [[], [], []];
  solidRect(x, z, len + 0.4, 0.8, rot);
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
  // 身の回りの合戦の跡（timeslip_field.js）。上田：九月初め（今の十月）の刈田。乾いた土、稲を刈った後の黄土の草、神川の岸の葦
  timeslip: {
    wet: 0.15, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, reeds: 0.4,
    grass: 0xb3a17c, grassTints: [0xffffff, 0xeee1c7, 0xd9c9a8], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI * 0.75 },
  minutes: 16,
  flagEra: { sanada1600: 'sanada' },   // 真田の兵の旗の鍵（SA）を六文銭で描く
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '上田城下の田で、牧野康成の手が稲を刈る。城から打って出る真田を討ち、大手門まで追え。',
  stageGoalsOnly: true,    // 右上は五つの段だけ（「敵を何人討つ」で埋めない。三の1）
  hideGuideSteps: true,
  noYaguraTask: true,
  // 右上は今の段を番号付きで（始まりの話の間も①。「味方の旗へ」に替えない。三の3・十の1）
  missionHeading: (rt) => '①②③④⑤⑥'[Math.min(LAST, Math.max(1, rt.flags.step || 1)) - 1] + STEP_TEXT[Math.min(LAST, Math.max(1, rt.flags.step || 1))],      // 隅櫓・物見櫓を目標にしない（城は落とさない戦。右上は六つの段だけ・十の1）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    const c = (...gs) => { for (const g of gs) if (live(g)) return g.center(); return null; };
    // ①は北の田そのもの（真田が田へ来て戦いになる。critic60：田へ一度も行かずに済んだ）
    let p = KARI;
    if (F.step === 1) p = KARI;
    else if (F.step === 2) p = FRONT;
    else if (F.step === 3) p = c(F.yari) || FRONT;
    else if (F.step === 4) p = c(F.nobushige) || { x: FRONT.x + 10, z: FRONT.z - 20 };
    else if (F.step === 5) p = FORD_W;
    else if (F.step === 6) p = RET;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 || F.step >= 5 ? 9 : 8;
    return PIN;
  },
  talk: {
    before: [['本多忠政', '上田の城は小さいが、真田安房守は戦上手じゃ。中納言様は牧野殿に城下の稲を刈らせ、真田を誘い出す'],
      ['牧野康成', '刈れ、刈れ。真田の米を一粒も城へ入れるな'],
      ['本多忠政', '城から兵が出れば、我らが叩く。門へは深追いするな']],
    after: [['真田昌幸', '徳川の大軍を、この小城で足止めしてやったわ'], ['徳川秀忠', '……美濃の戦に、間に合うか。木曽路を急げ']],
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
    paths: [[[HONJIN.x + 30, 8], [HONJIN.x, 6], [FORD.x + 6, 2], [TOWN.x + 10, TOWN.z + 6], [FRONT.x, FRONT.z], [GATE.x + 2, GATE.z]], [[KARI.x, KARI.z + 2], [LANE_A.x, LANE_A.z], [LANE_B.x, LANE_B.z], [FRONT.x, FRONT.z]]],
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.52 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);   // 秋の刈田
      if (Math.hypot(x - C.x, z - C.z) < 40) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.65 + 0.08, c.b * 0.55 + 0.05);
    },
    clear: (x, z) => (x > -30 && x < 200 && Math.abs(z) < 90) || dist({ x, z }, KOKUZO) < 14,
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
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // ---- 上田城：土塀・大手門（櫓門）・櫓。城は落とせない ----
    const castle0 = S.children.length;
    wallLine(rt, [[GATE.x, GATE.z - 30], [GATE.x, GATE.z - 4]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z + 4], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z - 30], [C.x - 30, GATE.z - 30], [C.x - 30, GATE.z + 30], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    try { S.add(yaguramon(W, GATE.x, GATE.z, 7, Math.PI / 2, { doors: false, inside: false })); } catch (e) { console.warn(e); }
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
    S.add(F.door);
    // ---- 城下の町屋：北の田から大手門の前へ抜ける小路の両側に、軒を連ねた町屋（critic60：小路が無い） ----
    {
      const L = dist(LANE_A, LANE_B), ux = (LANE_B.x - LANE_A.x) / L, uz = (LANE_B.z - LANE_A.z) / L, px = -uz, pz = ux;
      const rot = Math.atan2(-uz, ux);   // 家の長い辺（w）を小路に沿わせる
      // 小路の幅は家の前で 9m ほど（狭いとカメラが軒に入る）。門の前の広場の手前で家並みを切る
      for (let s = 4.5; s < L - 6; s += 8.6) for (const sd of [-1, 1]) {
        const x = LANE_A.x + ux * s + px * sd * 7, z = LANE_A.z + uz * s + pz * sd * 7;
        S.add(camBlock(hut(W, x, z, 8 - (s % 3) * 0.3, 5, rot)));
      }
    }
    for (const [x, z, w, d, r] of [[TOWN.x + 6, TOWN.z - 8, 8, 6, -0.1], [TOWN.x - 4, TOWN.z + 14, 9, 6, 0.2], [TOWN.x + 10, TOWN.z + 12, 8, 5, 0], [FRONT.x + 6, FRONT.z + 12, 8, 5, -0.05]]) S.add(camBlock(hut(W, x, z, w, d, r)));
    S.add(tawara(W, TOWN.x + 20, TOWN.z, 0.3, 4));
    // ---- 北の田：北の半分は稲が立ち、南の半分は刈った後で稲架に稲束を掛ける ----
    try { riceField(rt); for (const [x, z, r] of [[57, -69, 0.05], [84, -64, -0.04], [81, -55, 0.02]]) hasaK(rt, x, z, r); } catch (e) { console.warn(e); }
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
      for (const [x, z, flag, n, sd] of [[244, -40, 'honda', 220, 51], [250, 34, 'katabami', 200, 52], [256, -4, 'tokugawa', 240, 53], [236, -74, 'okubo', 160, 54], [240, 70, 'sakakibara', 160, 55]])
        W.addDistantArmy({ x, z, w: 24, d: 12, count: n, facing: -Math.PI / 2, flag, team: 0, seed: sd });
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
    // 諸隊の陣の番の兵（本物の兵だけ。幕の口に立って動かない）
    for (const [x, z, d] of [[205, -34, hoD], [213, 30, dress({ flag: 'katabami' })], [229, -2, hoD]])
      allyGroup(rt, { faction: 'tokugawa', name: '陣の番', fullStrength: true, fixed: true, anchor: { x, z }, facing: -Math.PI / 2, width: 3, aggro: 3, seekRange: 6, order: 'hold', noRout: true }, d([uS(2), uA(2), uG(1)]));
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
    F.nobushige = this.foe(rt, '真田信繁の手', { x: KOKUZO.x, z: KOKUZO.z }, [bu(NOBU), uS(6), uA(20), uG(4)], { hold: true, width: 8, morale: 100, dmg: 0.6 });
    F.nobushige.seekRange = 8; F.nobushige.aggro = 6;
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.6, () => rt.say(who, s, 3.4)));
    rt.after(0.6 + T.length * 3.6, () => { F.holdPlayer = false; this.toStep(rt, 1); });
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
    if (!o.hold) rt.after(40, () => { g.noRout = false; });
    g._bornT = rt.t;
    F.foes.push(g);
    return g;
  },
  // 城の内へ退かせる（門をくぐったら去らせる）
  back(g) {
    if (!live(g)) return;
    g.order = 'retreat'; g.dest = { x: GATE.x - 12, z: GATE.z }; g.speed = 4.3; g.aggro = 0; g.noRout = false;
  },

  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      // 大手門から真田の兵が打って出て、北の田の刈田の手を襲う
      F.sortie = this.foe(rt, '打って出た真田の兵', { x: GATE.x - 6, z: GATE.z - 2 }, [uS(4), uA(20), uG(5)], { aim: { x: KARI.x - 4, z: KARI.z + 2 }, width: 7 });
      F.w1N = aliveN(F.sortie);
      F.honda.order = 'attack'; F.honda.seekRange = 50; F.honda.anchor = { x: KARI.x, z: KARI.z + 4 };
      // 大久保の手も町屋から北の田へ寄せ、刈田の手を襲う真田を挟む（BK1・AP5：自分だけが走らない）
      F.okubo.order = 'attack'; F.okubo.seekRange = 50; F.okubo.anchor = { x: KARI.x + 6, z: KARI.z + 12 };
      rt.after(3, () => rt.say('牧野康成', '城の門が開いた！　真田が刈田を襲うて来るぞ！', 3));
      rt.after(7, () => rt.say('本多忠政', '待っておったわ。田へ走れ、刈田の衆を助けよ！', 3));
    } else if (n === 2) {
      this.back(F.sortie);
      rt.say('大久保忠隣', '逃がすな！　門まで追い詰めよ！', 3);
      rt.after(3.5, () => rt.say('本多忠政', '深追いはならぬと言うたが……もう止まらぬ。続け！', 3));
      for (const [g, p] of [[F.honda, { x: FRONT.x + 8, z: FRONT.z - 6 }], [F.okubo, { x: FRONT.x + 8, z: FRONT.z + 6 }], [F.makino, { x: TOWN.x + 6, z: TOWN.z - 14 }]]) {
        g.order = 'move'; g.dest = p; g.speed = 3.8; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
    } else if (n === 3) {
      sfx('taiko', 1);
      sfx('volley', 0.9);
      for (let i = 0; i < 6; i++) rt.army.smoke(GATE.x - 2, rt.world.heightAt(GATE.x, GATE.z) + 2.6, GATE.z - 8 + i * 3.2, 1, 0);
      F.yari = this.foe(rt, '門から打って出た真田の槍', { x: GATE.x - 8, z: GATE.z }, [uS(5), uA(20), uG(3)], { aim: { x: FRONT.x + 2, z: FRONT.z }, width: 8, morale: 98 });
      F.w3N = aliveN(F.yari);
      for (const g of [F.honda, F.okubo]) { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: FRONT.x + 4, z: g === F.honda ? FRONT.z - 4 : FRONT.z + 4 }; }
      rt.after(2, () => rt.say('足軽', '門の上から撃ってくる！　前の者がばたばた倒れる！', 3));
      rt.after(6, () => rt.say('真田昌幸', '引き付けて放て。門の前に寄せた者は、一人も帰すな', 3.2));
    } else if (n === 4) {
      // 信繁の手が北の林から出て、門の前の徳川の先手の横を突く
      sfx('taiko', 1);
      const nb = F.nobushige, aim = { x: FRONT.x + 6, z: FRONT.z - 6 };
      nb.anchor = { ...aim }; nb.order = 'move'; nb.dest = { ...aim }; nb.seekRange = 90; nb.aggro = 16;
      nb.onArrive = (q) => { if (q.order === 'move') q.order = 'attack'; };
      rt.after(40, () => { nb.noRout = false; });
      F.w4N = aliveN(nb);
      for (const g of [F.honda, F.okubo, F.makino]) if (live(g)) { g.morale -= 15; g.order = 'attack'; g.seekRange = 40; }
      rt.after(3, () => rt.say('大久保忠隣', '横から来たぞ！　槍を北へ向けよ！', 3));
      rt.after(8, () => rt.say(NOBU, '徳川の先手、門の前で足が止まったわ。揉み潰せ！', 3.2));
    } else if (n === 5) {
      // 秀忠の引き揚げの下知。大久保と牧野の手は先に川を越え、本多の先手（主人公）が神川の西の岸でしんがりを務める
      sfx('horagai', 0.9);
      rt.say('秀忠の使番', '中納言様のお下知！　先手は引け。神川を越えて本陣へ戻れ！', 3.6);
      rt.after(4.2, () => rt.say('本多忠政', '我らがしんがりじゃ。神川の岸で真田を止めよ！', 3.4));
      for (const [g, p] of [[F.okubo, { x: RET.x + 6, z: -14 }], [F.makino, { x: RET.x + 10, z: 20 }]]) {
        if (!live(g)) continue;
        g.order = 'move'; g.dest = p; g.speed = 3.7; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
      if (live(F.honda)) { const p = { x: FORD_W.x - 2, z: FORD_W.z - 5 }; F.honda.order = 'move'; F.honda.dest = p; F.honda.speed = 3.8; F.honda.onArrive = (q) => { q.order = 'attack'; q.anchor = { ...p }; q.seekRange = 26; }; }
      // 追い討ちの真田は、主人公が神川の岸に着いてから城を打って出る（町屋で行き違わず、岸で当たる。spawnOi）
      F.w5N = 0;
      this.back(F.nobushige);   // 信繁の手は「一度引け」で城へ引く（追い討ちは城の新手が受け持つ）
    } else if (n === 6) {
      // 追い討ちを止めた。しんがりも神川を渡って本陣の前へ
      sfx('horagai', 0.7);
      this.back(F.oi);
      if (live(F.nobushige)) this.back(F.nobushige);
      rt.say('本多忠政', '真田が引いた。今のうちに川を渡れ！', 3);
      if (live(F.honda)) { const p = { x: RET.x + 2, z: 4 }; F.honda.order = 'move'; F.honda.dest = p; F.honda.speed = 3.7; F.honda.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...p }; }; }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.won = true;
    rt.objDone('s' + LAST);
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (g !== F.masa && !g.wallShot) this.back(g);
    sfx('horagai', 0.8);
    // 勝ち戦ではない（徳川の先手が押し返されて退いた小競り合い）。終わりの札は「務めを果たした」（victory_card.js の DUTY。critic60）
    rt.award((t) => { t.main = true; t.special = { label: '上田城下でしんがりを務めた', pts: 20 }; }, '上田城下でしんがりを務めた');
    rt.banner('先手、本陣へ退く', '上田城は落ちなかった');
    // 締め：一つずつ読める間を空ける（critic60：急使の言葉を読む間が無い）。家康（慶長五年は内大臣＝内府）の急使が小諸に着いたのは二日後の九月八日（秀忠の書状）
    rt.after(1.2, () => rt.say(this.talk.after[0][0], this.talk.after[0][1], 3.6));
    rt.after(5.2, () => { rt.banner('九月八日', ''); rt.say('家康の使者', '内府様より急ぎのお下知。上田にかかずらわず、美濃へ上られよ', 4.2); });
    rt.after(10, () => rt.say(this.talk.after[1][0], this.talk.after[1][1], 3.8));
    rt.finish({ scriptedEnd: true }, 14.5);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick?.(rt);
    // 右上の目標に刻限の時計を付けない（goals5.js は sec の無い段に二百秒を足すので、出来上がった後に外す。critic60）
    if (!F.noClock && rt._g5) { for (const g of rt._g5.goals) g.sec = 0; F.noClock = true; }
    this.gateTick(rt, dt);
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 神川・堀・尼ヶ淵の水の中では、人も馬も足を取られて遅くなる（一の8。critic60：馬が川の上を全く遅くならずに走った）
    if (F.prevP && rt.world.inWaterAt?.(P.pos.x, P.pos.z, P.pos.y)) { P.pos.x = F.prevP.x + (P.pos.x - F.prevP.x) * 0.5; P.pos.z = F.prevP.z + (P.pos.z - F.prevP.z) * 0.5; }
    F.prevP = { x: P.pos.x, z: P.pos.z };
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 2.5 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    // 城の内へ退いた真田は去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) if (g.order === 'retreat') for (const u of g.units) if (u.alive && !u.gone && u.pos.x < GATE.x - 4) rt.army.despawn(u);
    }
    if (live(F.masa) && F.masa.order !== 'hold') { F.masa.order = 'hold'; F.masa.anchor = { x: C.x + 2, z: C.z }; }
    // 主人公の馬はこの戦では倒れない（critic60：いつ下りたか分からないまま馬が消えた）
    const pl = rt.player;
    if (pl.mounted && pl.horseMax && pl.horseHp < pl.horseMax * 0.45) pl.horseHp = pl.horseMax * 0.45;
    this.wallFire(rt);
    // 刻限の札は出さない。段の長さの目安（STEP_T）を過ぎたら、味方の働きで次へ進む（二の5。負けにしない＝十二の3）
    const late = left <= 0;
    if (F.step === 1) {
      if (F.w1N - aliveN(F.sortie) >= Math.round(F.w1N * 0.6) || late) this.toStep(rt, 2);
    } else if (F.step === 2) {
      // 小路の出口から門の口の前までを「大手門の前」とする（退く真田を門の際まで追い詰めても果たす）
      if (dist(P.pos, FRONT) < 10 || (P.pos.x > GATE.x && P.pos.x < FRONT.x + 6 && Math.abs(P.pos.z - GATE.z) < 14)) this.toStep(rt, 3);
      else if (late && !F.late2) { F.late2 = true; rt.say('本多忠政', '何をしておる、町屋の小路を抜けて門の前へ急げ！', 3.2); }
    } else if (F.step === 3) {
      if (F.w3N - aliveN(F.yari) >= Math.round(F.w3N * 0.6) || late) { this.back(F.yari); rt.say('足軽', '門の槍が引いた！　……北の林が騒がしいぞ', 3); this.toStep(rt, 4); }
    } else if (F.step === 4) {
      if (F.w4N - aliveN(F.nobushige) >= Math.round(F.w4N * 0.5) || late) {
        rt.say(NOBU, '徳川も粘るわ……一度引け', 2.8);
        this.toStep(rt, 5);
      }
    } else if (F.step === 5) {
      if (!F.oi && (dist(P.pos, FORD_W) < 24 || rt.t - F.stepT > 45)) this.spawnOi(rt);
      const oc = live(F.oi) && F.oi.center();
      if (oc && !F.oiHot && (dist(oc, FORD_W) < 16 || dist(oc, P.pos) < 12)) { F.oiHot = true; F.oi.aggro = 16; F.oi.seekRange = 40; F.oi.order = 'attack'; F.oi.anchor = { ...FORD_W }; }
      // 追い討ちの半ばを討つか、岸で長く支えたら止めた事にする（自分が岸に着いていなくても、本多の手が支える）
      if (F.oi && (F.w5N - aliveN(F.oi) >= Math.round(F.w5N * 0.5) || (rt.t - F.oiT > 110 && dist(P.pos, FORD_W) < 30))) this.toStep(rt, 6);
    } else if (F.step === 6) {
      if (P.pos.x > RET.x - 6 && dist(P.pos, RET) < 16) this.win(rt);
    }
  },

  // 追い討ちの真田：城から打って出て、町屋の道を神川の岸まで走って来る。岸に着くまでは途中の兵に構わない（着いてから戦う）
  spawnOi(rt) {
    const F = rt.flags;
    F.oi = this.foe(rt, '追い討ちの真田の兵', { x: GATE.x - 6, z: GATE.z + 2 }, [uS(6), uA(16), uG(3)], { aim: { x: FORD_W.x - 4, z: FORD_W.z }, width: 7, morale: 100, dmg: 0.6 });
    F.oi.speed = 4.4; F.oi.aggro = 0; F.oi.seekRange = 3;
    F.w5N = aliveN(F.oi); F.oiT = rt.t;
    rt.after(2, () => rt.say('足軽', '城から新手が出た！　真田が追って来るぞ！', 3));
    rt.after(9, () => rt.say('本多忠政', '川を背に槍を揃えよ。ここで止めねば皆討たれる！', 3.2));
  },

  // 塀の内の土塁の鉄砲と弓：門へ寄る徳川の兵を、塀越しに次々に撃つ（二の7・十の3。critic60：門の前で味方がほとんど倒れない）
  wallFire(rt) {
    const F = rt.flags, A = rt.army;
    if (!F.step || F.step < 2 || F.step > 5) return;
    const foes = [];
    for (const u of A.units) if (u.team === 0 && u.alive && !u.gone && !u.invuln && u.pos.x > GATE.x + 2 && u.pos.x < GATE.x + 46 && Math.abs(u.pos.z - GATE.z) < 34) foes.push(u);
    if (!foes.length) return;
    for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) {
      if (!g) continue;
      for (const u of g.units) {
        if (!u.alive || u.gone || (u.type !== 'gun' && u.type !== 'bow')) continue;
        if (u.gunAmmo !== undefined && u.gunAmmo < 5) u.gunAmmo = 20;
        const last = u.type === 'gun' ? u.gunShotAt ?? -99 : u._wallShotAt ?? -99, every = u.type === 'gun' ? 7 : 4.5;
        if (A.time - last < every + ((u.id || 0) % 7) * 0.4) continue;
        // 的は門の前に寄せた兵から散らして選ぶ（一人に弾が集まらない。主人公だけを狙い撃ちにしない）
        let t = null;
        for (let k = 0; k < 4 && !t; k++) { const o = foes[Math.floor(Math.random() * foes.length)]; if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 50) t = o; }
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
      // 開いた門を味方の兵もくぐらない（城の内は真田の本丸。十三の4）
      for (const u of rt.army.units) if (u.team === 0 && u !== P && u.alive && u.pos.x < GATE.x + 4.5 && u.pos.x > GATE.x - 8 && Math.abs(u.pos.z - GATE.z) < 5) u.pos.x = GATE.x + 4.5;
    }
    // 門が開いても寄せ手は門の口から先へ入れない（真田の槍が口を塞ぐ。敵の本丸へ歩いて入れない。十三の4）。
    //   櫓門の軒の下へも入れない（critic60：カメラが櫓門の中に入って画面が真っ黒になった）
    if (P && P.pos.x < GATE.x + 5.5 && P.pos.x > GATE.x - 8 && Math.abs(P.pos.z - GATE.z) < 5.5) P.pos.x = GATE.x + 5.5;
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
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && o.pos.x > GATE.x + 5;
    const e = F.step === 2 || F.step === LAST ? null : b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || RET;
    goTo(p, inp, F.step === LAST ? t.x + 4 : t.x, t.z, 2);
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
k05_ueda.history = '慶長五年（1600）、会津征伐から引き返した徳川秀忠は、三万八千の軍を率いて中山道を西へ進んだ。信濃の上田城には、豊臣方（西軍）に付いた真田昌幸と次男・信繁がおよそ二千五百で籠った。長男の信之は徳川方で、真田家は父・弟と長男に分かれた。\n秀忠は降伏を勧めたが昌幸は返事を引き延ばして時を稼いだ。九月五日、信之が戸石城に向かうと、信繁は兄と戦うのを避けて上田城へ退いた。翌六日ごろ、秀忠は牧野康成らに城下の稲を刈らせ、城から出た真田の兵と小競り合いになった。本多忠政・大久保忠隣の手が追って大手門に迫ったが、城の鉄砲と伏兵に押し返され、秀忠は兵を引かせた。\n上田城は落ちず、家康から急ぎ美濃へ上れとの使者を受けた秀忠は西へ急いだが、九月十五日の関ヶ原の決戦に間に合わなかった。戦いの細部（伏兵・神川の堰を切った話など）は軍記物の伝えで、小競り合いだったとする見方もある。';
k05_ueda.bushou = [{ name: '真田信繁', g: /信繁/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = STEP_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
// 右上の六つ（goals5.js の def.goals5）：刻限の時計を付けない（sec を大きく。critic60：話を聞く間も ① の刻限が減った）
k05_ueda.goals5 = () => STEP_TEXT.slice(1).map((text, i) => {
  const kill = [1, 0, 1, 1, 1, 0][i];
  return { kind: 'stage', k: i, text, sec: 1e6, check: (rt) => (rt.flags.step ?? 0) > i + 1 || !!rt.flags.won, ...(kill ? { count: (rt) => (rt.flags.step === i + 1 ? KILLS[ID](rt) : null) } : {}) };
});
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, aliveN(F.sortie), F.w1N - Math.round(F.w1N * 0.6));
  if (F.step === 3) return cut(F.w3N, aliveN(F.yari), F.w3N - Math.round(F.w3N * 0.6));
  if (F.step === 4) return cut(F.w4N, aliveN(F.nobushige), F.w4N - Math.round(F.w4N * 0.5));
  if (F.step === 5) return F.oi ? cut(F.w5N, aliveN(F.oi), F.w5N - Math.round(F.w5N * 0.5)) : null;
  return null;
};

export { k05_ueda };
export default k05_ueda;
