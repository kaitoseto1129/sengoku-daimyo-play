// ======================================================================
// 徳川編 6　関ヶ原の戦い（慶長五年九月十五日 1600）。筋書きの正：docs/chapter3_tokugawa.md の「6. 関ヶ原」
// 主人公は東軍（徳川方）の侍大将。井伊直政・松平忠吉の手に付き、抜け駆けで開戦の口火を切る。
// 段：①霧の朝、福島隊の脇を抜けて宇喜多の陣の前へ（井伊・松平の抜け駆け） ②福島と宇喜多の激突。明石全登の先手を崩す
//     ③北の笹尾山の前へ。黒田・細川と島左近の隊を崩す ④家康が本陣を前へ。小早川の寝返り（必ず）で大谷隊が崩れ、
//     脇坂らも東軍へ。西軍が崩れる中、笹尾山の石田の本陣を崩す（三成は敗走） ⑤島津の退き口を家康の本陣の前で食い止める
// 勝ち：⑤を持ちこたえる（全滅では勝ちにしない）。負け：①②で井伊と福島の隊が二つとも崩れる。全体の刻限は無い（時は目標ごと：goals5.js・AP8）。
// kaito_play AP〜AT：総大将（三成・秀家・家康）は後ろの本陣で旗本の侍に囲む・開戦の前に乱戦を始めない・乱戦は近づけば本物の兵・旗はその家の物・段は時間で進めない
// 地形：国土地理院の標高（asset_dem_sekigahara.js・dem.mjs の sekigahara）。ゲームの 1 を実の 10m に縮め、高さは 0.11 倍。
//   中心は北緯35.3655・東経136.4720（関ヶ原の盆地の真ん中）。陣の位置は陣跡の緯度経度をそのまま写した（11/4・docs/battle_refs/k06_sekigahara.md の布陣表）。
//   藤古川の川筋・街道は標高の谷筋に合わせた復元。
// 座標：西が −x（笹尾山・天満山）、北が −z、南の +z に松尾山。東の +x に家康の本陣（桃配山）。
// 兵：見せかけの軍勢（遠景の板・軽い作りの乱戦・陣立て）は出さない。出す兵は全部本物で、各家の陣跡に置く（同時に二百四十まで）。
//   名のある将は馬上で旗本の侍に囲む。総大将（家康・三成・秀家）は本陣で床几に座る。旗はその家の物だけ。
// 史実と一説：問鉄砲（家康が松尾山へ鉄砲を撃たせた）は一説。「勝って兜の緒を締めよ」は伝承。history に分けて書く。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, gauss, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import * as THREE from 'three';
import { nobori, jinmaku, umaFollow } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { KILLS, cut } from './stages.js';
import { timeslipField } from './timeslip_field.js';
import { setStages } from './b_k_help.js';

let dem = null;
useTerrain('dem_sekigahara', (data) => { dem = data; });
const DEM_XY = 10;
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.043 + 0.6) * Math.cos(z * 0.039);
  if (dem) return h + Math.max(-2, (demSample(dem, x * DEM_XY, z * DEM_XY) - 60) * 0.11);
  // 標高が読めない時の手書き（松尾山・天満山・笹尾山・南宮山の裾・北の伊吹の裾）
  h += 17 * gauss(x, z, -160, 206, 2200) + 7 * gauss(x, z, -160, 20, 700) + 6 * gauss(x, z, -166, -79, 600);
  h += 16 * gauss(x, z, 230, 90, 3000) + Math.max(0, -z - 95) * 0.3 + Math.max(0, -x - 190) * 0.25;
  return h;
}

// ---- 場所（ゲームの座標。陣跡の緯度経度から x＝(経度−136.472)×9080・z＝−(緯度−35.3655)×11100） ----
const START = { x: -58, z: -8 };         // 井伊直政・松平忠吉の陣（決戦地の東）
const NUKE = { x: -112, z: 12 };         // 抜け駆けで出る宇喜多の陣の前（福島隊の北の脇）
const FUKU = { x: -96, z: 30 };          // 福島正則の陣（春日神社の前）
const UKITA_F = { x: -128, z: 22 };      // 宇喜多の先手（明石全登）
const UKITA_H = { x: -160, z: 18 };      // 宇喜多秀家の本陣（南天満山）
const KONISHI = { x: -158, z: -8 };      // 小西行長（北天満山）
const SHIMAZU = { x: -138, z: -44 };     // 島津義弘（小池村）
const SAKON = { x: -148, z: -64 };       // 島左近の隊（笹尾山の麓の柵）
const SASAO = { x: -166, z: -79 };       // 石田三成の本陣（笹尾山）
const KURODA = { x: -84, z: -88 };       // 黒田長政（岡山の烽火場の麓）
const HOSOKAWA = { x: -100, z: -76 };    // 細川忠興
const KATO_P = { x: -96, z: -54 };       // 加藤嘉明・田中吉政の手
const IEYASU0 = { x: 130, z: 60 };       // 家康の本陣（はじめ・桃配山）
const IEYASU1 = { x: -34, z: -39 };      // 前へ出た本陣（陣場野）
const HONDA = { x: -9, z: -17 };         // 本多忠勝
const TODO_P = { x: -82, z: 62 };        // 藤堂高虎・京極高知
const MATSUO = { x: -160, z: 206 };      // 松尾山（小早川）
const WAKI_P = { x: -150, z: 150 };      // 脇坂・朽木・小川・赤座（松尾山の北の麓）
const OTANI = { x: -200, z: 72 };        // 大谷吉継（山中の藤川台）
const HIRA = { x: -176, z: 70 };         // 平塚為広・戸田勝成（大谷の前）
const HOLD5 = { x: -56, z: 8 };          // 島津の退き口を受ける所（陣場野の本陣の南の前）
const FUJI = [[-215, -230], [-200, -100], [-190, 0], [-170, 30], [-160, 52], [-165, 100], [-180, 160], [-200, 240]];   // 藤古川
const NAKASENDO = [[240, 70], [130, 54], [40, 16], [0, 6], [-80, 8], [-150, 30], [-200, 56], [-240, 70]];
const HOKKOKU = [[-60, 6], [-110, -30], [-150, -70], [-180, -150], [-200, -230]];
const ISE = [[-6, 8], [2, 60], [12, 130], [30, 240]];
const SHIMA_PATH = [{ x: -100, z: -14 }, { x: -56, z: 8 }, { x: -26, z: 40 }, { x: -2, z: 90 }, { x: 8, z: 160 }, { x: 24, z: 225 }];
const FOG_T0 = 12, FOG_T1 = 70;
const HOLD_S = 60;   // ⑤ 島津の退き口を本陣の前で受け続ける秒（11/5：90 → 60）
// 右上の目標（goals5・obj・setStages で同じ文）
//   討てる将（明石全登・島津豊久）の名は目標の文に入れない（victory_flow の namedKill が名を含む札を済みにし、段の途中で勝ちに締まる）
const G2 = '藤下で宇喜多の先手と槍を合わせ、天満山へ押し返す';
const G3 = '笹尾山の麓の柵を越え、島左近の隊を陣の内へ退かせる';
const G4 = '笹尾山を登り、石田三成の旗本を山から追い落とす';
const G5 = '陣場野の家康の本陣の前に立ち、島津の退き口を受ける';

// ---- 兵の装い ----
const TK = 0x24221f, WS = 0x2c2a2a;
const II = { flag: 'ii', armor: 0x8e1f16 };          // 井伊の赤備え
const FUKUSHIMA = { flag: 'maru', armor: TK };
const KUR = { flag: 'kuroda', armor: TK };
const TOKU = { flag: 'tokugawa', armor: TK };
const HOSO = { flag: 'kuyo', armor: TK };            // 細川の九曜
const KATO = { flag: 'sagarifuji', armor: TK };      // 加藤嘉明の下り藤
const TODO = { flag: 'todo', armor: TK };
const UKITA = { flag: 'ukita', armor: WS };
const ISHIDA = { flag: 'ishida', armor: WS };
const SHIMA = { flag: 'shimazu', armor: 0x1c1a1a };
const OTANI_LK = { flag: 'otani', armor: WS };
const KOBA = { flag: 'kobayakawa', armor: 0x2a2622 };
const WAKI = { flag: 'wakisaka', armor: WS };
const KONI = { flag: 'konishi', armor: WS };     // 小西の中結び祇園守
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const alive = (g) => !!g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rout = (g) => { if (alive(g)) { g.routed = true; g.order = 'flee'; } KIT.markRecyclable(g); };
// 本物の兵は同時に REAL_CAP まで。新手を出す前に、逃げた隊・遠い隊から遠くの姿へ戻す（近づけばまた本物）
const REAL_CAP = 240;
const realCount = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.type !== 'porter' ? 1 : 0), 0);
//   逃げて遠ざかった名の無い兵は、先に戦場の外へ出た事にする（崩れた隊が枠をふさがない）
const room = (rt, n) => {
  let over = realCount(rt) + n - REAL_CAP;
  if (over <= 0) return;
  const P = rt.player.u.pos;
  const run = rt.army.units.filter((u) => u.alive && !u.gone && u.fleeing && !u.name && !u.isPlayer && !u.isSub && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 50);
  run.sort((a, b) => Math.hypot(b.pos.x - P.x, b.pos.z - P.z) - Math.hypot(a.pos.x - P.x, a.pos.z - P.z));
  for (const u of run) { if (over <= 0) break; rt.army.despawn(u); over--; }
  if (over > 0) KIT.freeRoom(rt, over);
};
const goAttack = (g, dest, aggro = 40, seek = 60) => {
  if (!g) return;
  g.order = 'move'; g.dest = { ...dest };
  g.onArrive = (q) => { q.order = 'attack'; q.aggro = aggro; q.seekRange = seek; q.onArrive = null; };
};
const foe = (rt, name, at, list, lk, o = {}) => enemyGroup(rt, { name, faction: 'toyotomi', anchor: { ...at }, facing: Math.PI / 2, order: 'attack', aggro: 36, seekRange: 60, width: 10, ...o }, dress(list, lk));
const ally = (rt, name, at, list, lk, o = {}) => allyGroup(rt, { name, faction: 'tokugawa', anchor: { ...at }, facing: -Math.PI / 2, width: 10, aggro: 14, morale: 92, noRout: true, ...o }, dress(list, lk));
// 総大将は本陣で床几に座る（動けば立ち、止まればまた座る・update が戻す）
const SEAT = (g, name) => { const u = g?.units.find((o) => o.name === name); if (u) u._crouch = true; return u; };
// 寝返った隊：同じ場所・同じ人数で東軍の隊に入れ替える（旗も具足もその家のまま）
const turnover = (rt, g) => { const n = g ? g.units.filter((u) => u.alive && !u.gone).length : 0; for (const u of g?.units || []) rt.army.despawn(u); if (g) g.routed = true; return n; };
// 四方輿（しほうごし）：大谷吉継が乗った、四方に柱を立てて簾を巻き上げた屋形の輿。二本の長柄で担ぐ。地に下ろして置く（前は +z）
let KOSHI_MAT = null;
function shihoKoshi(world, x, z, rot) {
  const M = KOSHI_MAT || (KOSHI_MAT = { wood: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }), lac: new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.45 }), su: new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95 }) });
  const g = new THREE.Group();
  const box = (w, h, d, px, py, pz, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); g.add(o); return o; };
  box(1.1, 0.12, 1.3, 0, 0.62, 0, M.lac);                                         // 床
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.6, 0.6]) box(0.07, 0.95, 0.07, sx, 1.1, sz, M.lac);   // 四方の柱
  box(1.35, 0.1, 1.6, 0, 1.6, 0, M.lac); box(1.0, 0.1, 1.25, 0, 1.7, 0, M.lac);   // 屋形の屋根
  for (const sz of [-0.6, 0.6]) box(1.0, 0.12, 0.12, 0, 1.48, sz, M.su);          // 巻き上げた簾
  box(1.0, 0.18, 0.05, 0, 0.78, -0.62, M.wood); box(0.05, 0.18, 1.2, -0.52, 0.78, 0, M.wood); box(0.05, 0.18, 1.2, 0.52, 0.78, 0, M.wood);   // 低い手すり
  for (const sx of [-0.62, 0.62]) { const p = box(0.08, 0.08, 4.4, sx, 0.62, 0, M.wood); p.castShadow = true; }   // 長柄
  g.position.set(x, world.heightAt(x, z) - 0.25, z); g.rotation.y = rot;
  return g;
}

const k06_sekigahara = {
  // 身の回りの合戦の跡（timeslip_field.js）。関ヶ原：前の夜の雨で濡れた野と霧。ぬかるみ・水たまり・倒れた槍と旗
  timeslip: {
    wet: 0.65, dust: 0.1, trample: 0.4, debris: 1.3, arrows: 1, pools: 0.8, poolDim: 0.7,
    grass: 0x8a9456, grassTints: [0xffffff, 0xe0dcb0, 0xc4c494], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,
  hideArmyPeek: true,
  missionSingleLine: true,
  foeMarks: true,
  foeMarkRange: 30,
  missionPinCaption: '',
  // 11/4 n2（AP12・AV15・BH6・AL）：行き先は頭上の金の▼一つだけ。字は添えない（10/23）
  goalSignOnly: true,
  goalSignBare: true,
  // 11/5（三1）：目標の言葉に「崩す」「止める」を使わない。場所と行いだけ（島津は史実で東軍の前を抜けたので「止める」とは言わない）
  // 11/4 n2（AW3）：目標は史実の順の場所と行いの五つ。「敵を何人討つ」「自分で討つ」は置かない（明石・三成・義弘は史実で落ちのびた）
  goals5(rt) {
    const st = (n) => (q) => !!q.flags.won || (q.flags.step || 0) > n;
    const at = (q) => k06_sekigahara.missionPin(q);
    return [
      { kind: 'stage', k: 0, text: '霧の中、井伊の赤備えに続いて宇喜多の陣の前へ出る', noun: '宇喜多の陣の前', action: '井伊に続け', check: st(1), place: at, sec: 200 },
      { kind: 'stage', k: 1, text: G2, noun: '明石全登の先手', action: '天満山へ押し返せ', check: st(2), place: at, sec: 420 },
      { kind: 'stage', k: 2, text: G3, noun: '島左近の隊', action: '柵を越えよ', check: st(3), place: at, sec: 420 },
      { kind: 'stage', k: 3, text: G4, noun: '石田の旗本', action: '山から追い落とせ', check: st(4), place: at, sec: 360 },
      { kind: 'stage', k: 4, text: G5, noun: '陣場野', action: '本陣の前に立て', check: (q) => !!q.flags.won, place: at, sec: 240 },
    ];
  },
  closeCombatAssist: true,
  compactIntro: true,
  prelude: false,      // 霧の中の会話が開戦の溜め。共通の溜め（十五秒）を重ねると、三十秒近く立ち尽くす（newbie60）
  introText: () => '慶長五年九月十五日の朝。霧の関ヶ原で、東西およそ十五万が向き合う。井伊直政の手に付き、天下分け目の口火を切る。',
  minutes: 14,
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  sides: { a: { name: '東軍', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '西軍', mon: 'ishida', faction: 'toyotomi' } },
  date: () => '慶長五年（1600）九月十五日　朝・霧　美濃国 関ヶ原',
  force(rt) {
    const F = rt.flags;
    const turned = F.step >= 4 && F.flipT ? 15000 : 0;
    const k = [0, 0, 0.08, 0.22, 0.55, 0.85][F.step || 0] || 0;
    return { a: 74000 + turned - (F.ak || 0) * 30, a0: 74000, b: Math.max(0, Math.round((82000 - turned) * (1 - k)) - (F.ek || 0) * 30), b0: 82000 };
  },
  world: {
    seed: 1600,
    time: 'day',
    mood: 'morning',     // 朝霧の中で始まった戦
    muddy: 0.4,          // 前の夜の雨で足もとがぬかるむ
    groundHalf: 260,
    moveLim: 230,
    height,
    streams: [{ pts: FUJI, w: 2.6, depth: 1.0 }],
    paths: [NAKASENDO, HOKKOKU, ISE],
    tint(x, z, h, c) {
      // 盆地の田は刈り入れ前の湿った土、山すそは濃い草、高い所は林の暗い緑
      if (h < 2.5) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.9 + 0.025, c.b * 0.82);
      else if (h > 9) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.8);
      const p = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06);
      c.multiplyScalar(0.86 + p * 0.2);
    },
    fieldStage: 'ripe',
    paddy(x, z) {
      if (x < -130 || x > 120 || z < -60 || z > 110) return 0;
      if (Math.abs(z - 10) < 6) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => x > -150 && x < 150 && z > -95 && z < 120,
    trees: 520,
    tufts: 3600,
    treeDensity: (x, z) => (x > -150 && x < 150 && z > -95 && z < 120 ? 0 : height(x, z) > 7 ? 1.2 : 0.35),
    groves: [{ x: MATSUO.x, z: MATSUO.z + 8, r: 26, n: 46, kind: 'sugi' }, { x: SASAO.x - 12, z: SASAO.z - 8, r: 12, n: 16 }, { x: UKITA_H.x - 12, z: UKITA_H.z, r: 14, n: 18 }, { x: OTANI.x - 12, z: OTANI.z, r: 12, n: 14 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -222 || z < -222 : x > 225),
  },

  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending || !F.step) return null;
    const lead = (g, at) => (g?.leader?.alive ? g.leader.pos : alive(g) ? g.center() : at);
    const P = F.step === 1 ? NUKE : F.step === 2 ? lead(F.akashi, UKITA_F) : F.step === 3 ? lead(F.sakon, SAKON)
      : F.step === 4 ? lead(F.mitsu, SASAO) : HOLD5;
    q.x = P.x; q.z = P.z;
    return q;
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 本陣の幕と旗。幕の中には必ず大将と旗本が座る（AV18）。家康の陣場野の幕は本陣が移ってから張る
    // 11/5：金扇の大馬印は家康だけ（三成・秀家の陣に同じ金扇を立てない）。家康の馬印は本陣が陣場野へ進む時に共に動く（umaFollow）
    KIT.honjin(rt, IEYASU0.x + 4, IEYASU0.z, { mon: 'tokugawa', people: false, fire: false, noUma: true });
    KIT.honjin(rt, SASAO.x - 6, SASAO.z - 4, { mon: 'ishida', people: false, fire: false, noUma: true });
    KIT.honjin(rt, UKITA_H.x - 6, UKITA_H.z, { mon: 'ukita', people: false, fire: false, noUma: true });
    for (const [x, z, f] of [[-140, -60, 'ishida'], [-154, -70, 'ishida'], [-150, -6, 'konishi'], [-132, -40, 'shimazu'], [-136, 28, 'ukita'], [-150, 14, 'ukita'], [-92, 36, 'maru'], [-60, -2, 'ii'], [-82, -84, 'kuroda'],
      [-100, -70, 'kuyo'], [-80, 66, 'todo'], [-194, 70, 'otani'], [-156, 196, 'kobayakawa'], [-148, 146, 'wakisaka'], [124, 56, 'onri'], [136, 64, 'tokugawa'], [-6, -14, 'honda']]) rt.scene.add(nobori(W, x, z, f));
    // ---- 兵：全部本物。各家の陣跡に、その家の旗と具足で置く（見せかけの遠景・乱戦は出さない） ----
    // 東軍：井伊・松平（主人公が付く）・福島・家康の本陣（桃配山）・本多・藤堂と京極・加藤と田中
    F.ii = ally(rt, '井伊直政の手', { x: START.x - 4, z: START.z - 4 }, [
      { type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '松平忠吉', invuln: true, horse: true, flag: 'tokugawa', armor: TK } },
      { type: 'samurai', n: 5 }, { type: 'cavalry', n: 2 }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 10 }], II, { fullStrength: true, formation: 'yari' });
    F.fuku = ally(rt, '福島正則の隊', FUKU, [
      { type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 15 }], FUKUSHIMA, { fullStrength: true, order: 'hold', formation: 'yari', width: 12 });
    F.ieyasu = ally(rt, '徳川家康の本陣', IEYASU0, [
      { type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'samurai', n: 18 }, { type: 'gun', n: 4 }], TOKU, { order: 'hold', aggro: 6, seekRange: 10, facing: -Math.PI / 2 - 0.4, width: 8 });   // 旗本の侍に囲まれ床几に座る（O・AR3）
    F.ieyasuU = SEAT(F.ieyasu, '徳川家康');
    if (F.ieyasuU) F.uma = umaFollow(W, rt.scene, F.ieyasuU, 'ogi');
    // 本陣が陣場野へ進んだ後も、桃配山の幕には留守の旗本が残る（人のいない幕を作らない）
    F.rusu = ally(rt, '桃配山の留守', { x: IEYASU0.x + 4, z: IEYASU0.z + 2 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 2 }], TOKU, { order: 'hold', aggro: 4, seekRange: 6, width: 6 });
    F.honda = ally(rt, '本多忠勝の隊', HONDA, [{ type: 'busho', n: 1, o: { name: '本多忠勝', invuln: true, horse: true, flag: 'honda' } }, { type: 'cavalry', n: 3 }], { flag: 'honda', armor: TK }, { order: 'hold', aggro: 8 });
    F.todo = ally(rt, '藤堂高虎・京極高知の隊', TODO_P, [{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '京極高知', invuln: true, horse: true, flag: 'kyogoku' } },
      { type: 'gun', n: 2 }, { type: 'ashigaru', n: 5 }], TODO, { facing: Math.PI * 0.7, aggro: 20, seekRange: 30 });
    F.kato = ally(rt, '加藤嘉明の隊', KATO_P, [{ type: 'busho', n: 1, o: { name: '加藤嘉明', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 4 }], KATO, { order: 'hold' });
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(10, n) }]);
    // 西軍：天満山の宇喜多（本陣と明石の先手）・北天満山の小西・小池村の島津・笹尾山の石田・山中の大谷と平塚・戸田・松尾山の小早川と麓の四家
    F.hide = foe(rt, '宇喜多秀家の本陣', UKITA_H, [{ type: 'busho', n: 1, o: { name: '宇喜多秀家', invuln: true, horse: false } }, { type: 'samurai', n: 9 }], UKITA, { order: 'hold', aggro: 8, seekRange: 12, width: 8 });   // 総大将は天満山の本陣から出ない（AT3）
    SEAT(F.hide, '宇喜多秀家');
    // 宇喜多の先手（明石全登）。霧の中、はじめから福島の前に構える。明石は討てる（命が尽きれば倒れる・AV6）
    F.akashi = foe(rt, '明石全登の隊', UKITA_F, [{ type: 'busho', n: 1, o: { name: '明石全登', horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 5 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 13 }], UKITA, { morale: 90, width: 12, noRout: true, order: 'hold', aggro: 10, seekRange: 14, formation: 'yari' });
    F.akashiU = F.akashi.leader;
    F.konishi = foe(rt, '小西行長の隊', KONISHI, [{ type: 'busho', n: 1, o: { name: '小西行長', invuln: true, horse: true } }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 4 }], KONI, { order: 'hold', aggro: 10, seekRange: 14 });
    // 島津は一日じゅう陣から動かなかった（史実）。⑤で前へ突き抜ける本物の隊はこの隊そのもの
    F.shima = foe(rt, '島津義弘の隊', SHIMAZU, [{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '島津豊久', horse: true } }, { type: 'samurai', n: 2 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 6 }], SHIMA, { order: 'hold', aggro: 8, seekRange: 10, morale: 100, noRout: true, width: 8 });
    F.mitsu = foe(rt, '石田三成の本陣', SASAO, [{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, horse: false } }, { type: 'samurai', n: 8 }, { type: 'gun', n: 4 }], ISHIDA, { order: 'hold', aggro: 10, seekRange: 14, morale: 90, noRout: true, width: 8 });
    SEAT(F.mitsu, '石田三成');
    // 大谷吉継の隊：病の吉継は輿に乗り馬に乗らない。前に平塚為広・戸田勝成が馬上で構え、朝から藤堂・京極と押し合う
    // 11/5：吉継は藤川台の陣で輿のそばに座り（病で馬に乗れず、輿で指図した）、前で平塚・戸田が押し合う。吉継は前に出ない
    rt.scene.add(shihoKoshi(W, OTANI.x - 3, OTANI.z + 1, -Math.PI * 0.3));
    F.otaniH = foe(rt, '大谷吉継の本陣', OTANI, [{ type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, horse: false } }, { type: 'samurai', n: 4 }], OTANI_LK, { order: 'hold', aggro: 6, seekRange: 8, noRout: true, width: 6, facing: -Math.PI * 0.3 });
    F.otaniU = SEAT(F.otaniH, '大谷吉継');
    F.otani = foe(rt, '平塚為広・戸田勝成の隊', HIRA, [{ type: 'busho', n: 1, o: { name: '平塚為広', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '戸田勝成', invuln: true, horse: true } },
      { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], OTANI_LK, { aggro: 20, seekRange: 30, noRout: true, facing: -Math.PI * 0.3 });
    F.hira = F.otani;
    for (const g of [F.todo, F.otani]) { g.dmgMult = 0.35; g.defMult = 1.4; }   // 藤堂・京極と平塚・戸田は朝から押し合う（寝返りまで決着しない）
    F.kobaE = foe(rt, '小早川秀秋の隊', MATSUO, [{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '平岡頼勝', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 6 }], KOBA, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.8, noRout: true });
    F.wakiE = foe(rt, '脇坂安治らの隊', WAKI_P, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], WAKI, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.7, noRout: true });
    for (const g of [F.kobaE, F.wakiE]) g.noFrontline = true;
    // 戦の前の会話（霧の中の対陣）
    rt.after(0.5, () => rt.say('井伊直政', '霧が深い。先陣は福島殿と決まっておるが……徳川の手で口火を切らねば、この戦は豊臣の家の戦で終わる', 5));
    rt.after(6, () => rt.say('松平忠吉', '物見と申して、福島の脇を抜けましょう', 3.5));
    rt.after(10, () => rt.say(nm(rt), '豊臣の世を見届けた槍、今日は徳川の先で振るいます', 3.5));
    rt.after(13.5, () => this.stage1(rt));
  },

  // ① 霧の中、福島隊の脇を抜けて宇喜多の陣の前へ（抜け駆け）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.s1t = rt.t;
    rt.obj('main', '霧の中、井伊の赤備えに続いて宇喜多の陣の前へ出る', 'main');
    F.ii.order = 'move'; F.ii.dest = { x: NUKE.x + 2, z: NUKE.z - 4 };
    rt.after(4, () => rt.say('可児才蔵', 'そこを行くは何者じゃ！　今日の先陣は福島の手ぞ！', 3.5));   // 咎めたのは福島の先手の可児才蔵（通説）
    rt.after(8, () => rt.say('井伊直政', '物見じゃ。下野守（忠吉）殿の初陣の物見にござる', 3.5));
  },
  // ② 開戦。福島と宇喜多の激突。明石全登の先手を崩す
  stage2(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.s2t = rt.t;
    rt.objDone('main');
    rt.award((t) => t.side.push('井伊・松平の抜け駆けに加わった'), '抜け駆けに加わった');
    rt.army.play('volley', { x: NUKE.x - 6, z: NUKE.z }, 1.6);
    sfx('horagai', 1);
    rt.banner('関ヶ原の戦い　開戦');
    rt.say('井伊直政', '放てっ！　徳川の戦の始まりじゃ！', 3);
    rt.after(3.5, () => rt.say('福島正則', '抜け駆けされたか！　ええい、福島の者ども、宇喜多へかかれぇっ！', 3.5));
    rt.obj('main', G2, 'main');
    room(rt, 18);
    // 宇喜多の先手（明石全登）が打って出る。先手は明石が倒れるまで退かない（ピンの先に必ず宇喜多勢がいる）
    F.akashi.order = 'attack'; F.akashi.aggro = 36; F.akashi.seekRange = 60;
    F.ukita2 = foe(rt, '宇喜多の二番手', { x: UKITA_F.x - 6, z: UKITA_F.z + 20 }, [{ type: 'samurai', n: 3 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 12 }], UKITA);
    goAttack(F.ukita2, { x: FUKU.x - 6, z: FUKU.z });
    F.akaN = F.akashi.count + F.ukita2.count;
    F.ii.order = 'attack'; F.ii.aggro = 40; F.ii.seekRange = 50;
    goAttack(F.fuku, { x: UKITA_F.x + 14, z: UKITA_F.z + 14 });
    // 開戦の一発の後に押し合いが始まる（前から戦っていると矛盾する）。福島と宇喜多→藤堂・京極と平塚・戸田の順
    rt.after(30, () => goAttack(F.todo, HIRA, 30, 40));
    rt.marker('foe', () => (F.akashi.leader?.alive ? F.akashi.leader.pos : F.akashi.center()), '明石全登', { red: true, group: F.akashi });
    rt.after(10, () => rt.say('明石全登', '宇喜多の槍は一万七千。押し返せ、福島を川まで追え！', 3.5));
  },
  // ③ 北の笹尾山の前へ。黒田・細川と島左近の隊を崩す
  stage3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.s3t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('宇喜多の先手を押し返した'), '宇喜多の先手を押し返した');
    for (const g of [F.akashi, F.ukita2, F.ukita3, F.ukita4]) rout(g);
    // 道中にも隊（AV4）：北へ向かう道の途中、金森長近の隊が小西の先手と押し合っている
    room(rt, 30);
    F.kanamori = ally(rt, '金森長近の隊', { x: -116, z: -14 }, [{ type: 'busho', n: 1, o: { name: '金森長近', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 6 }], { flag: 'kanamori', armor: TK }, { facing: -Math.PI / 2, aggro: 30, seekRange: 30 });
    F.konishiF = foe(rt, '小西行長の先手', { x: -132, z: -18 }, [{ type: 'samurai', n: 2 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 7 }], KONI, { aggro: 30, seekRange: 30 });
    goAttack(F.fuku, { x: UKITA_H.x + 22, z: UKITA_H.z + 4 }, 30, 40);   // 福島はそのまま宇喜多の陣を押す
    rt.obj('main', G3, 'main');
    rt.say('井伊直政', '南は福島殿に任せた。我らは北へ、治部（三成）の陣を突く', 3.5);
    room(rt, 60);
    F.sakon = foe(rt, '島左近の隊', SAKON, [{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '蒲生郷舎', horse: true } }, { type: 'samurai', n: 6 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 10 }], ISHIDA, { morale: 95, aggro: 30, seekRange: 50 });
    F.gamo = null;   // 蒲生郷舎は左近の隊の中（下の busho）
    F.sakN = F.sakon.count;
    F.kuroda = ally(rt, '黒田長政の隊', KURODA, [{ type: 'busho', n: 1, o: { name: '黒田長政', invuln: true, horse: true } }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 7 }], KUR);
    F.hoso = ally(rt, '細川忠興の隊', HOSOKAWA, [{ type: 'busho', n: 1, o: { name: '細川忠興', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], HOSO);
    goAttack(F.kuroda, { x: SAKON.x + 10, z: SAKON.z - 8 });
    goAttack(F.hoso, { x: SAKON.x + 12, z: SAKON.z + 4 });
    goAttack(F.ii, { x: SAKON.x + 8, z: SAKON.z + 10 });
    goAttack(F.kato, { x: -128, z: -22 }, 40, 60);   // 加藤も小西の先手へ（行き先で止まらず敵を探す）
    rt.marker('foe', () => (F.sakon.leader?.alive ? F.sakon.leader.pos : F.sakon.center()), '島左近', { red: true, group: F.sakon });
    rt.after(5, () => rt.say('島左近', 'かかれ、かかれぇっ！　ここは一歩も通さぬ', 3.5));
    rt.after(11, () => rt.say('黒田長政', '左近の鬼の顔……兵が怯んでおる。鉄砲で横から撃ちすくめよ', 4));
  },
  // ④ 家康が本陣を前へ。小早川の寝返りで大谷隊が崩れ、西軍が崩れる。笹尾山の石田の本陣を崩す
  stage4(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.s4t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('島左近の隊を崩した'), '島左近の隊を崩した');
    rt.say('使番', '島左近、黒田の鉄砲に撃たれ、陣の内へ退いた由！', 3.5);
    for (const g of [F.sakon, F.gamo, F.shima3, F.ishida3, F.konishiF]) rout(g);
    for (const g of [F.akashi, F.ukita2, F.ukita3, F.ukita4]) KIT.markRecyclable(g);
    KIT.markRecyclable(F.kanamori);
    rt.obj('main', G4, 'main');
    F.mitsu.aggro = 22; F.mitsu.seekRange = 30;
    F.mitN = F.mitsu.count;
    F.mitsuGate = true;   // 寝返りの前は崩れない
    goAttack(F.ii, { x: SASAO.x + 12, z: SASAO.z + 4 }, 30, 40);
    goAttack(F.kuroda, { x: SASAO.x + 10, z: SASAO.z - 8 }, 30, 40);
    rt.marker('foe', () => (F.mitsu.leader?.alive ? F.mitsu.leader.pos : F.mitsu.center()), '石田三成', { red: true, group: F.mitsu });
    // 家康が本陣を前へ（桃配山から陣場野へ）
    rt.after(9, () => rt.say('使番', '殿が本陣を桃配山から陣場野へ進められる！', 3));
    F.ieyasu.order = 'move'; F.ieyasu.dest = { ...IEYASU1 };
    F.ieyasu.onArrive = () => { if (!F.jinba) { F.jinba = true; rt.scene.add(jinmaku(rt.world, IEYASU1.x + 6, IEYASU1.z - 4, 14, 10, 6, { mon: 'tokugawa' })); rt.scene.add(nobori(rt.world, IEYASU1.x - 2, IEYASU1.z - 8, 'onri', 7)); } };
    rt.after(3, () => rt.say('徳川家康', '金吾（秀秋）はまだ動かぬか……', 3));
    rt.after(17, () => rt.say('使番', '松尾山の旗、いまだ動きませぬ！', 3));
    // 問鉄砲（一説）：家康が松尾山へ鉄砲を撃ちかけさせた
    rt.after(24, () => {
      rt.say('徳川家康', '松尾山へ鉄砲を撃ちかけよ。どちらに付くか、はっきりさせてやれ', 4);
      rt.army.play('volley', { x: MATSUO.x + 30, z: MATSUO.z - 50 }, 1.2);
    });
    // 石田の本陣は寝返りまで固い（史実は昼まで持ちこたえた）。笹尾山で長く押し合ってから寝返る
    rt.after(34, () => this.flip(rt));   // 11/5：一つの戦を遊んで七分ほどに（寝返りまでの待ちを詰めた）
  },
  // 小早川の寝返り（必ず）。大谷隊が崩れ、脇坂らも東軍へ
  flip(rt) {
    const F = rt.flags;
    if (F.flipT || F.ending) return;
    F.flipT = rt.t;
    sfx('horagai', 1);
    rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 30 }, 2.5);
    rt.say('使番', '松尾山の旗が動いた！　小早川が大谷の陣へかかる！', 3.5);
    rt.after(4, () => rt.say('小早川秀秋', '……狙うは大谷刑部の陣じゃ。山を下れ！', 3.5));
    // 松尾山の小早川の隊が、同じ所・同じ人数のまま東軍の隊に替わり、山を下って大谷の陣の横を突く（本物の兵だけ）
    turnover(rt, F.kobaE);
    for (const g of [F.mitsu, F.akashi, F.konishi, F.otani, F.otaniH]) if (alive(g)) g.morale -= 12;
    room(rt, 18);
    F.kobaG = ally(rt, '小早川秀秋の兵', MATSUO, [{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '平岡頼勝', horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 6 }], KOBA, { facing: -Math.PI * 0.8, aggro: 40, seekRange: 60 });
    goAttack(F.kobaG, HIRA);
    rt.after(9, () => rt.say('大谷吉継', '金吾め、やはり裏切ったか……。備えはしてある。押し返せ！', 4));
    rt.after(14, () => {
      rt.say('使番', '脇坂・朽木・小川・赤座も寝返った！', 3);
      turnover(rt, F.wakiE);
      room(rt, 10);
      F.wakiG = ally(rt, '脇坂安治らの兵', WAKI_P, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], WAKI, { facing: -Math.PI * 0.7, aggro: 40, seekRange: 60 });
      goAttack(F.wakiG, OTANI);
      if (alive(F.otani)) F.otani.morale -= 30;
    });
    rt.after(26, () => {
      rt.say('使番', '大谷刑部殿、陣中にて自害！　平塚・戸田も討ち死に！', 4);
      for (const u of F.otani?.units || []) if (u.alive && u.type === 'busho') u.invuln = false;
      rout(F.otani); rout(F.otaniH);
      if (F.otaniU?.alive && !F.otaniU.gone) rt.army.despawn(F.otaniU);   // 自害した吉継は逃げ走らない（遠くの陣の内で消える）
      rt.after(5, () => {
        for (const g of [F.akashi, F.ukita2, F.ukita3, F.ukita4]) rout(g);
        rout(F.hide); rout(F.konishi);
        rt.say('宇喜多秀家', '金吾めっ……！　刺し違えてくれる！', 3);
        rt.after(3, () => rt.say(F.akashiU?.alive ? '明石全登' : '宇喜多の近習','殿、なりませぬ！　ここは落ちのびられませ！', 3));
      });
      F.mitsuGate = false; if (F.mitsu) { F.mitsu.noRout = false; F.mitsu.morale -= 25; }
      rt.after(4, () => rt.say('井伊直政', '今ぞ！　笹尾山を攻め上れ！', 3));
    });
  },
  // ⑤ 島津の退き口。家康の本陣の前で食い止める
  stage5(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.s5t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('石田の本陣を崩した'), '笹尾山の石田の本陣を崩した');
    rt.say('使番', '治部少輔（三成）、伊吹山の方へ落ちた！', 3.5);
    rt.obj('main', G5, 'main');   // 目標はすぐ出す（空く間があると全部済んだ扱いで閉じる）
    rout(F.mitsu); rout(F.mitsu2);
    rt.after(4, () => {
      sfx('horagai', 1);
      rt.say('島津義弘', '退くは前じゃ。家康の本陣の前を突き抜けよ！', 4);
      // 道中にも隊（AV4）：本陣へ戻る道の途中、黒田の追い手が石田の落ち武者を追い討つ
      room(rt, 26);
      F.chase = ally(rt, '黒田の追い手', { x: -104, z: -40 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 7 }], KUR, { aggro: 30, seekRange: 30 });
      F.ochi = foe(rt, '石田の落ち武者', { x: -114, z: -50 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }], ISHIDA, { aggro: 26, seekRange: 26, morale: 60 });
      for (const g of [F.kanamori, F.konishiF, F.otani, F.otaniH, F.kobaG, F.wakiG, F.akashi, F.ukita2, F.sakon, F.gamo, F.mitsu, F.mitsu2, F.todo, F.hide, F.konishi]) KIT.markRecyclable(g);
      // 朝から小池村に構えていた島津の隊そのものが前へ（駆け抜けるのは本物の隊だけ）
      F.shima.aggro = 40; F.shima.seekRange = 26;
      F.shiN = F.shima.count; F.shiK = 0;
      this.shimaStep(rt);
      goAttack(F.ii, HOLD5, 36, 40);
      goAttack(F.honda, HOLD5, 36, 40);
      goAttack(F.fuku, { x: HOLD5.x - 14, z: HOLD5.z + 10 }, 30, 36);
      rt.marker('foe', () => (F.shima.leader?.alive ? F.shima.leader.pos : F.shima.center()), '島津義弘', { red: true, group: F.shima });
      rt.after(14, () => rt.say('本多忠勝', '島津の捨て奸じゃ。殿の陣へは一歩も入れるな！', 3.5));
      rt.after(26, () => rt.say('使番', '井伊殿、島津の鉄砲に撃たれた！　なれど命は無事！', 3.5));
    });
  },
  shimaStep(rt) {
    const F = rt.flags, g = F.shima;
    if (!alive(g)) return;
    F.shiI = (F.shiI ?? -1) + 1;
    const p = SHIMA_PATH[Math.min(F.shiI, SHIMA_PATH.length - 1)];
    g.order = 'move'; g.dest = { ...p };
    g.onArrive = () => { rt.after(F.shiI === 2 ? 8 : 1, () => this.shimaStep(rt)); };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.won = true;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => { t.main = true; t.special = { label: '関ヶ原で井伊の先に立ち、島津の退き口を受けた', pts: 60 }; }, '島津の退き口を受けた');
    rt.banner('関ヶ原の戦い　勝ち');
    rt.player.u.invuln = true;
    if (alive(F.shima)) { F.shima.order = 'move'; F.shima.dest = { x: 160, z: 180 }; F.shima.onArrive = null; F.shima.aggro = 0; }
    for (const g of rt.army.groups) if (g.team === 1 && g !== F.shima) rout(g);
    // 戦の後：首実検
    // 11/5（三3）：果たしたらその場で締め、数秒で勝利の札へ
    rt.after(1.5, () => rt.say('徳川家康', '皆の者、大儀。勝って兜の緒を締めよ。まだ佐和山が残っておる', 3.5));
    rt.after(5.5, () => rt.say('井伊直政', `${nm(rt)}、ようやった。徳川の先陣の槍、見事であった`, 3));
    rt.finish({ scriptedEnd: true }, 9);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.banner('果たせず', why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 総大将は止まれば床几に座り直す（動いた・敵が来た時だけ立つ）
    for (const u of [F.ieyasuU, F.hide?.leader, F.mitsu?.leader, F.otaniU]) if (u?.alive && !u.target && !(u.moving > 0.1) && !u.fleeing) u._crouch = true;
    F.uma?.update(dt);
    this.fog(rt);
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    if (F.step <= 2 && broken(F.ii) && broken(F.fuku)) { this.lose(rt, '井伊と福島の隊が崩れた'); return; }
    if (F.step === 1) {
      // 自分が着くか、井伊の手が着いて自分も近くまで来たら一発
      if (near(P, NUKE, 14) || (alive(F.ii) && near(F.ii.center(), NUKE, 8) && near(P, NUKE, 40))) this.stage2(rt);
    } else if (F.step === 2) {
      const left = (alive(F.akashi) ? F.akashi.count : 0) + (alive(F.ukita2) ? F.ukita2.count : 0);
      F.ek = F.akaN - left;
      // 先手が半ば減ると、宇喜多の本隊から新手が出る（数で押してくる）。段は敵の数と手柄で進め、時間では進めない。
      if (!F.wave2 && left <= Math.round(F.akaN * 0.5)) {
        F.wave2 = true; room(rt, 34);
        F.ukita3 = foe(rt, '宇喜多の本隊', { x: UKITA_H.x + 14, z: UKITA_H.z + 6 }, [{ type: 'samurai', n: 5 }, { type: 'gun', n: 6 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 14 }], UKITA, { morale: 90 });
        F.akaN += F.ukita3.count;
        rt.say('使番', '天満山から宇喜多の新手！', 3);
        rt.say('明石全登', '殿の旗本の手が来たぞ！　東軍を押し返せ！', 3.5);
      }
      const left2 = left + (alive(F.ukita3) ? F.ukita3.count : 0);
      if (F.wave2 && !F.wave2b && left2 <= Math.round(F.akaN * 0.4)) {
        F.wave2b = true; room(rt, 24);
        F.ukita4 = foe(rt, '宇喜多の二の備', { x: UKITA_F.x - 10, z: UKITA_F.z - 14 }, [{ type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 14 }], UKITA, { morale: 90 });
        F.akaN += F.ukita4.count;
        rt.say('井伊直政', '宇喜多はまだ厚い。退くな、押し込め！', 3);
      }
      const left2b = left2 + (alive(F.ukita4) ? F.ukita4.count : 0);
      const need = Math.round(F.akaN * 0.15);
      rt.objProgress('main', `${Math.min(F.akaN - left2b, F.akaN - need)}／${F.akaN - need}`);
      // 明石全登が倒れた：先手が揺らぐ（討った者が誰でも進む・AV14）
      if (F.akashiU && (!F.akashiU.alive || F.akashiU.gone) && !F.akashiDown) {
        F.akashiDown = true; F.akashi.noRout = false;
        for (const g of [F.akashi, F.ukita2, F.ukita3, F.ukita4]) if (alive(g)) g.morale -= 20;
        rt.say('井伊直政', '明石掃部、倒れたり！　宇喜多の先手が揺らいだぞ、押せ！', 3.5);
      }
      // 11/4 n2（AW3・AW4）：段は先手が崩れた所で進む。明石が立っていれば、史実どおり崩れた先手と共に退く（討つのは目標にしない）
      if (F.wave2b && left2b <= need) {
        if (!F.akashiDown && F.akashiU?.alive) rt.say('井伊直政', '明石掃部が退いていく。宇喜多の先手は崩れたぞ！', 3);
        this.stage3(rt);
      }
    } else if (F.step === 3) {
      const left = (alive(F.sakon) ? F.sakon.count : 0) + (alive(F.gamo) ? F.gamo.count : 0);
      if (!F.wave3 && left <= Math.round(F.sakN * 0.5)) {
        F.wave3 = true; room(rt, 30);
        F.shima3 = foe(rt, '小西行長の援兵', { x: KONISHI.x + 8, z: KONISHI.z - 22 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 14 }], KONI, { morale: 92, aggro: 30, seekRange: 50 });
        F.sakN += F.shima3.count;
        rt.say('使番', '北天満山から小西の手が、左近の救いに来る！', 3);
        rt.after(4, () => rt.say('使番', '島津は陣から動きませぬ！　治部殿の使いを追い返した由', 3.5));
      }
      const left3 = left + (alive(F.shima3) ? F.shima3.count : 0);
      if (F.wave3 && !F.wave3b && left3 <= Math.round(F.sakN * 0.4)) {
        F.wave3b = true; room(rt, 22);
        F.ishida3 = foe(rt, '石田の鉄砲衆', { x: SAKON.x - 14, z: SAKON.z - 10 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 10 }], ISHIDA, { morale: 90, aggro: 30, seekRange: 50 });
        F.sakN += F.ishida3.count;
        rt.say('島左近', '大筒と鉄砲を前へ！黒田を寄せつけるな！', 3);
      }
      const left3b = left3 + (alive(F.ishida3) ? F.ishida3.count : 0);
      const need = Math.round(F.sakN * 0.15);
      rt.objProgress('main', `${Math.min(F.sakN - left3b, F.sakN - need)}／${F.sakN - need}`);
      // 段は敵の数だけで進める（時間では進めない・AB）。黒田の鉄砲が左近を撃つ（史実）
      if (F.wave3b && left3b <= need) this.stage4(rt);
    } else if (F.step === 4) {
      const n = (alive(F.mitsu) ? F.mitsu.count : 0) + (alive(F.mitsu2) ? F.mitsu2.count : 0);
      if (F.mitsu2 && !F.mitN2) { F.mitN2 = true; F.mitN += F.mitsu2.count; }
      const need = Math.round(F.mitN * 0.2);
      // 寝返りの前は本陣が固い（兵が減っても崩れず、次の兵が陣の内から出る）
      if (F.mitsuGate && n <= Math.round(F.mitN * 0.5) && alive(F.mitsu) && !F.refill) {
        F.refill = true;
        room(rt, 8);
        F.mitsu2 = foe(rt, '石田の旗本', { x: SASAO.x - 6, z: SASAO.z - 6 }, [{ type: 'samurai', n: 10 }, { type: 'gun', n: 6 }], ISHIDA, { aggro: 24, seekRange: 30 });
      }
      rt.objProgress('main', `${Math.min(F.mitN - n, F.mitN - need)}／${F.mitN - need}`);
      if (!F.mitsuGate && n <= need) this.stage5(rt);
    } else if (F.step === 5 && F.shima) {
      const n = alive(F.shima) ? F.shima.count : 0;
      F.shiK = F.shiN - n;
      const held = rt.t - F.s5t;
      rt.objProgress('main', `あと${Math.max(0, Math.ceil(HOLD_S - held))}秒`);
      // 島津の兵が一割半を切るか、本陣の前で一分持ちこたえる（島津は勝ち負けに関わらず伊勢路へ抜けていく＝史実）
      if (held > 4 && (n <= F.shiN * 0.15 || (held > HOLD_S && dist(P, HOLD5) < 40))) this.win(rt);
    }
  },

  // 朝霧：はじめは一町先も見えず、しだいに晴れる（霧が晴れて戦が見えてくる）
  fog(rt) {
    const F = rt.flags, f = rt.scene.fog;
    if (!f || !('far' in f)) return;
    const k = rt.t < FOG_T0 ? 1 : Math.max(0, 1 - (rt.t - FOG_T0) / (FOG_T1 - FOG_T0));
    if (k <= 0) { if (F.fogDone) return; F.fogDone = true; }
    if (F.fogFar === undefined) { F.fogNear = f.near; F.fogFar = f.far; }
    f.near = F.fogNear + (6 - F.fogNear) * k;
    f.far = F.fogFar + (120 - F.fogFar) * k;
  },
};

k06_sekigahara.history = '慶長三年（1598）に豊臣秀吉が没すると、五大老の徳川家康と五奉行の石田三成の争いが深まった。慶長五年、家康が会津の上杉景勝を討ちに出た間に三成らが挙兵し、九月十五日の朝、美濃の関ヶ原で東軍およそ七万四千と西軍およそ八万（実際に戦ったのはその半ばほど）がぶつかった。\n'
  + '西軍は笹尾山に石田三成、その南に島津義弘・小西行長、天満山に宇喜多秀家、山中に大谷吉継、松尾山に小早川秀秋が陣を敷き、東軍を包む形をとった。東軍の先陣は福島正則と決まっていたが、霧の中、井伊直政と松平忠吉が福島隊の脇を抜けて宇喜多隊へ鉄砲を放ち、戦が始まった。\n'
  + '福島隊と宇喜多隊は押し合い、黒田長政・細川忠興らは石田隊を攻め、島左近が激しく抗ったが、黒田の鉄砲に撃たれて退いた。家康は本陣を桃配山から前へ進めた。昼ごろ、動かなかった小早川秀秋が東軍に寝返って大谷隊を攻め、脇坂安治・朽木元綱・小川祐忠・赤座直保も続いた。大谷吉継は自害し、西軍は総崩れとなって三成は伊吹山の方へ落ちた。\n'
  + '取り残された島津義弘は、東軍の中を突っ切って伊勢路へ退いた（島津の退き口）。甥の島津豊久らが捨て奸で討ち死にし、追った井伊直政は鉄砲で傷を負った。戦の後、家康は首実検を行った。\n'
  + '明石全登（掃部）は宇喜多の先手を率いて福島隊を押し返したが、崩れた後は落ちのび、のち大坂の陣でも戦った（ゲームでは先手の大将として倒せる）。\n'
  + '一説：家康が松尾山の小早川の陣へ鉄砲を撃ちかけさせて寝返りを迫ったという話（問鉄砲）は、のちの記録に見える一説で、確かではない。伝承：家康が勝った後に「勝って兜の緒を締めよ」と言ったという話は言い伝えである。\n'
  + '陣の位置は陣跡の緯度経度を縮めて写し、地形は国土地理院の標高によるが、藤古川の川筋・街道・隊の人数と動き・会話は遊びのための復元である。';
k06_sekigahara.bushou = [{ name: '井伊直政', g: /井伊/ }, { name: '徳川家康', g: /家康/ }, { name: '島左近', g: /左近/ }, { name: '小早川秀秋', g: /小早川|金吾/ }];

// 素直な遊び手：近い敵を突き、いなければ段の行き先へ
k06_sekigahara.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 4;
  const prev = p.botStrikeFoe;
  const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && dist(prev.pos, u.pos) < 2.8 ? prev : b.army.nearestEnemy(u, F.step === 1 ? 4 : 9, ok);
  if (e) {
    const d = dist(e.pos, u.pos);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(p, inp, e, d, true);
    return;
  }
  inp.guardHold = false;
  const q = b.def.missionPin(b);
  if (q) goTo(p, inp, q.x, q.z, 3); else inp.k.delete('KeyW');
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k06_sekigahara = (rt) => {
  const F = rt.flags, n = (g) => (alive(g) ? g.count : 0);
  if (F.ending) return null;
  if (F.step === 2) return cut(F.akaN, n(F.akashi) + n(F.ukita2) + n(F.ukita3) + n(F.ukita4), Math.round(F.akaN * 0.15));
  if (F.step === 3) return cut(F.sakN, n(F.sakon) + n(F.gamo) + n(F.shima3) + n(F.ishida3), Math.round(F.sakN * 0.15));
  if (F.step === 4) return F.mitsuGate ? null : cut(F.mitN, n(F.mitsu) + n(F.mitsu2), Math.round(F.mitN * 0.2));
  return F.step === 5 && F.shima ? cut(F.shiN, n(F.shima), F.shiN * 0.15) : null;
};
// 戦の進行の札（段）：F.step の 1〜5
setStages('k06_sekigahara', [['井伊の赤備えに続き、宇喜多の陣の前へ'], [G2, 2], [G3, 3], [G4, 4], [G5, 5]]);

export { k06_sekigahara };
export default k06_sekigahara;
