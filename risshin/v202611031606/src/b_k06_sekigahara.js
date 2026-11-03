// ======================================================================
// 徳川編 6　関ヶ原の戦い（慶長五年九月十五日 1600）。筋書きの正：docs/chapter3_tokugawa.md の「6. 関ヶ原」
// 主人公は東軍（徳川方）の侍大将。井伊直政・松平忠吉の手に付き、抜け駆けで開戦の口火を切る。
// 段：①霧の朝、福島隊の脇を抜けて宇喜多の陣の前へ（井伊・松平の抜け駆け） ②福島と宇喜多の激突。明石全登の先手を崩す
//     ③北の笹尾山の前へ。黒田・細川と島左近の隊を崩す ④家康が本陣を前へ。小早川の寝返り（必ず）で大谷隊が崩れ、
//     脇坂らも東軍へ。西軍が崩れる中、笹尾山の石田の本陣を崩す（三成は敗走） ⑤島津の退き口を家康の本陣の前で食い止める
// 勝ち：⑤を持ちこたえる（全滅では勝ちにしない）。負け：①②で井伊と福島の隊が二つとも崩れる・時が尽きる（7分半）。
// 地形：国土地理院の標高（asset_dem_sekigahara.js・dem.mjs の sekigahara）。ゲームの 1 を実の 10m に縮め、高さは 0.11 倍。
//   中心は北緯35.3655・東経136.4720（関ヶ原の盆地の真ん中）。藤古川の川筋・街道は遊び用の復元。
// 座標：西が −x（笹尾山・天満山）、北が −z、南の +z に松尾山。東の +x に家康の本陣（桃配山の方）。
// 重さ：本物の兵は段ごとに出し、同時に百五十ほどまで。大軍は軽い作り（addDistantArmy・addClash・陣立て）。
// 史実と一説：問鉄砲（家康が松尾山へ鉄砲を撃たせた）は一説。「勝って兜の緒を締めよ」は伝承。history に分けて書く。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, gauss, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, jinmaku } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { clash } from './b_sekigahara.js';
import { KILLS, cut } from './stages.js';
import { timeslipField } from './timeslip_field.js';
import { jindateSetup, jindateTick } from './army_jindate.js';
import { setStages } from './b_k_help.js';

let dem = null;
useTerrain('dem_sekigahara', (data) => { dem = data; });
const DEM_XY = 10;
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.043 + 0.6) * Math.cos(z * 0.039);
  if (dem) return h + Math.max(-2, (demSample(dem, x * DEM_XY, z * DEM_XY) - 60) * 0.11);
  // 標高が読めない時の手書き（松尾山・天満山・笹尾山・南宮山・北の伊吹の裾）
  h += 16 * gauss(x, z, -104, 185, 2400) + 6 * gauss(x, z, -118, 17, 900) + 5 * gauss(x, z, -98, -65, 700);
  h += 18 * gauss(x, z, 170, 160, 3000) + Math.max(0, -z - 130) * 0.3 + Math.max(0, -x - 190) * 0.25;
  return h;
}

// ---- 場所（ゲームの座標） ----
const START = { x: -6, z: 12 };          // 井伊・松平の手の後ろ
const NUKE = { x: -54, z: 14 };          // 抜け駆けで出る宇喜多の陣の前
const FUKU = { x: -34, z: 34 };          // 福島正則の隊
const UKITA_F = { x: -72, z: 16 };       // 宇喜多の先手（明石全登）
const UKITA_H = { x: -116, z: 18 };      // 宇喜多秀家の本陣（天満山）
const KONISHI = { x: -102, z: -16 };     // 小西行長（北天満山）
const SHIMAZU = { x: -76, z: -38 };      // 島津義弘（小池村）
const SAKON = { x: -72, z: -58 };        // 島左近の隊（笹尾山の前の柵）
const SASAO = { x: -96, z: -68 };        // 石田三成の本陣（笹尾山）
const KURODA = { x: -40, z: -92 };       // 黒田長政（丸山）
const IEYASU0 = { x: 74, z: -6 };        // 家康の本陣（はじめ）
const IEYASU1 = { x: 24, z: -18 };       // 前へ出た本陣（陣場野）
const MATSUO = { x: -104, z: 184 };      // 松尾山（小早川）
const OTANI = { x: -140, z: 100 };       // 大谷吉継（山中）
const HOLD5 = { x: 4, z: 6 };            // 島津の退き口を受ける所（本陣の前）
const FUJI = [[-186, -230], [-172, -100], [-176, 0], [-186, 120], [-196, 240]];   // 藤古川
const NAKASENDO = [[240, 10], [100, 12], [20, 8], [-60, 12], [-150, 30], [-240, 60]];
const HOKKOKU = [[-20, 8], [-70, -40], [-110, -110], [-150, -210]];
const ISE = [[20, 8], [60, 60], [110, 120], [200, 210]];
const SHIMA_PATH = [{ x: -40, z: -14 }, { x: -6, z: 2 }, { x: 30, z: 30 }, { x: 80, z: 90 }, { x: 150, z: 170 }];
const TIME_LIMIT = 450;
const FOG_T0 = 12, FOG_T1 = 70;

// ---- 兵の装い ----
const TK = 0x24221f, WS = 0x2c2a2a;
const II = { flag: 'ii', armor: 0x8e1f16 };          // 井伊の赤備え
const FUKUSHIMA = { flag: 'maru', armor: TK };
const KUR = { flag: 'kuroda', armor: TK };
const TOKU = { flag: 'tokugawa', armor: TK };
const UKITA = { flag: 'ukita', armor: WS };
const ISHIDA = { flag: 'ishida', armor: WS };
const SHIMA = { flag: 'shimazu', armor: 0x1c1a1a };
const OTANI_LK = { flag: 'otani', armor: WS };
const KOBA = { flag: 'kobayakawa', armor: 0x2a2622 };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const alive = (g) => !!g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rout = (g) => { if (alive(g)) { g.routed = true; g.order = 'flee'; } KIT.markRecyclable(g); };
// 本物の兵は同時に REAL_CAP まで。新手を出す前に、逃げた隊・遠い隊から軽い兵へ戻す
const REAL_CAP = 200;
const realCount = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.type !== 'porter' ? 1 : 0), 0);
const room = (rt, n) => { const over = realCount(rt) + n - REAL_CAP; if (over > 0) KIT.freeRoom(rt, over); };
const host = (rt, x, z, w, d, count, facing, lk, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, lk.armor, lk.flag, seed, kind);
const goAttack = (g, dest, aggro = 40, seek = 60) => {
  if (!g) return;
  g.order = 'move'; g.dest = { ...dest };
  g.onArrive = (q) => { q.order = 'attack'; q.aggro = aggro; q.seekRange = seek; q.onArrive = null; };
};
const foe = (rt, name, at, list, lk, o = {}) => enemyGroup(rt, { name, faction: 'toyotomi', anchor: { ...at }, facing: Math.PI / 2, order: 'attack', aggro: 36, seekRange: 60, width: 10, ...o }, dress(list, lk));
const ally = (rt, name, at, list, lk, o = {}) => allyGroup(rt, { name, faction: 'tokugawa', anchor: { ...at }, facing: -Math.PI / 2, width: 10, aggro: 14, morale: 92, noRout: true, ...o }, dress(list, lk));

// 陣立て：東軍は魚鱗、西軍は鶴翼（山すそに翼を広げて東軍を包む形）。前の乱戦は台本が置く
const JINDATE = {
  A: { flag: 'tokugawa', faction: 'tokugawa', armor: TK, form: '魚鱗' },
  B: { flag: 'ishida', faction: 'toyotomi', armor: WS, form: '鶴翼' },
  ahead: 62, lat: 44, men: 0.55, wings: false,
};

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
  closeCombatAssist: true,
  compactIntro: true,
  introText: () => '慶長五年九月十五日の朝。霧の関ヶ原で、東西およそ十五万が向き合う。井伊直政の手に付き、天下分け目の口火を切る。',
  minutes: 7,
  wakeRoom: 170,       // 乱戦の軽い兵を本物に替えるのは、本物が百七十までの間だけ（同時に二百五十を超えない）
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
      if (x < -60 || x > 110 || z < -50 || z > 80) return 0;
      if (Math.abs(z - 10) < 6) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => x > -130 && x < 110 && z > -110 && z < 80,
    trees: 520,
    tufts: 3600,
    treeDensity: (x, z) => (x > -130 && x < 110 && z > -110 && z < 80 ? 0 : height(x, z) > 7 ? 1.2 : 0.35),
    groves: [{ x: MATSUO.x, z: MATSUO.z, r: 26, n: 46, kind: 'sugi' }, { x: SASAO.x - 8, z: SASAO.z - 6, r: 12, n: 16 }, { x: UKITA_H.x - 8, z: UKITA_H.z, r: 14, n: 18 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -200 || z < -200 : x > 220),
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
    // 本陣の幕と旗（見た目だけ）。家康の本陣・笹尾山の石田・天満山の宇喜多
    KIT.honjin(rt, IEYASU0.x + 6, IEYASU0.z, { mon: 'tokugawa', people: false, fire: false });
    KIT.honjin(rt, SASAO.x - 8, SASAO.z - 4, { mon: 'ishida', people: false, fire: false });
    KIT.honjin(rt, UKITA_H.x - 6, UKITA_H.z, { mon: 'ukita', people: false, fire: false });
    rt.scene.add(jinmaku(W, IEYASU1.x + 8, IEYASU1.z - 4, 14, 10, 6, { mon: 'tokugawa' }));
    for (const [x, z, f] of [[-60, -64, 'ishida'], [-64, -50, 'ishida'], [-84, 30, 'ukita'], [-88, 12, 'ukita'], [-36, 40, 'maru'], [-2, 2, 'ii'], [-30, -96, 'kuroda'], [62, -12, 'tokugawa'], [80, 4, 'tokugawa']]) rt.scene.add(nobori(W, x, z, f));
    // ---- 大軍（軽い作り） ----
    // 西軍：笹尾山の石田・小西・島津・天満山の宇喜多・山中の大谷・松尾山の小早川（山の上と中腹）・南宮山の毛利（動かない）
    F.westHosts = [
      host(rt, SASAO.x - 10, SASAO.z - 8, 30, 18, 300, Math.PI / 2, ISHIDA, 1601, 'honjin'),
      host(rt, KONISHI.x - 8, KONISHI.z, 28, 12, 260, Math.PI / 2, ISHIDA, 1602, 'gun'),
      host(rt, SHIMAZU.x - 10, SHIMAZU.z, 18, 12, 160, Math.PI / 2, SHIMA, 1603, 'mixed'),
      host(rt, UKITA_H.x - 6, UKITA_H.z + 6, 40, 18, 420, Math.PI / 2, UKITA, 1604, 'spear'),
      host(rt, OTANI.x - 8, OTANI.z, 30, 14, 260, Math.PI / 2 - 0.4, OTANI_LK, 1605, 'spear'),
    ];
    F.koba = [
      host(rt, MATSUO.x, MATSUO.z, 34, 18, 360, -Math.PI * 0.85, KOBA, 1606, 'mixed'),
      host(rt, MATSUO.x + 14, MATSUO.z - 26, 26, 12, 220, -Math.PI * 0.8, KOBA, 1607, 'spear'),
    ];
    F.waki = host(rt, -126, 146, 30, 12, 200, -Math.PI * 0.8, OTANI_LK, 1608, 'spear');
    host(rt, 170, 150, 40, 16, 240, -Math.PI * 0.75, { flag: 'mori', armor: WS }, 1609, 'spear');
    // 東軍：家康の本陣と旗本・本多忠勝・藤堂と京極・池田と山内（南宮山の押さえ）・加藤嘉明
    F.ieyasuHost = host(rt, IEYASU0.x + 16, IEYASU0.z, 34, 16, 320, -Math.PI / 2, TOKU, 1610, 'honjin');
    F.hatamoto = host(rt, IEYASU0.x + 16, IEYASU0.z + 26, 30, 12, 180, -Math.PI / 2, TOKU, 1611, 'cavalry');
    host(rt, 110, 80, 34, 14, 220, Math.PI * 0.75, { flag: 'ageha', armor: TK }, 1612, 'spear');
    host(rt, -20, 76, 30, 14, 220, -Math.PI / 2 - 0.4, { flag: 'todo', armor: TK }, 1613, 'spear');
    // ---- 大軍どうしの乱戦：福島と宇喜多（南）・黒田と石田（北）・藤堂と大谷（南の奥） ----
    const east = (lk, count, x = {}) => ({ flag: lk.flag, armor: lk.armor, count, team: 0, faction: 'tokugawa', ...x });
    const west = (lk, count, x = {}) => ({ flag: lk.flag, armor: lk.armor, count, team: 1, faction: 'toyotomi', ...x });
    F.clash = [
      clash(rt, { x: -30, z: 12, facing: -Math.PI / 2, w: 30, gap0: 10, seed: 1624, noRout: true, noWake: true, A: east(II, 150, { guns: true }), B: west(SHIMA, 170) }),
      clash(rt, { x: -72, z: 40, facing: -Math.PI / 2, w: 56, gap0: 10, seed: 1621, noRout: true, noWake: true, A: east(FUKUSHIMA, 320, { guns: true }), B: west(UKITA, 400, { bows: true }) }),
      clash(rt, { x: -62, z: -80, facing: -Math.PI / 2, w: 46, gap0: 22, seed: 1622, noRout: true, noWake: true, A: east(KUR, 260, { guns: true }), B: west(ISHIDA, 300, { guns: true }) }),
      clash(rt, { x: -104, z: 84, facing: -Math.PI / 2 - 0.5, w: 40, gap0: 16, seed: 1623, noRout: true, noWake: true, A: east({ flag: 'todo', armor: TK }, 220), B: west(OTANI_LK, 240) }),
    ];
    try { jindateSetup(rt, JINDATE); } catch (e) { console.warn('陣立て', e); }
    // ---- 本物の兵 ----
    // 主人公が付く井伊直政・松平忠吉の手（赤備え）
    F.ii = ally(rt, '井伊直政の手', { x: START.x - 8, z: START.z - 4 }, [
      { type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '松平忠吉', invuln: true, horse: true, flag: 'tokugawa', armor: TK } },
      { type: 'samurai', n: 3 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 8 }], II, { fullStrength: true, formation: 'yari' });
    F.fuku = ally(rt, '福島正則の隊', FUKU, [
      { type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 10 }], FUKUSHIMA, { fullStrength: true, order: 'hold', formation: 'yari' });
    F.ieyasu = ally(rt, '徳川家康の本陣', IEYASU0, [
      { type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }], TOKU, { order: 'hold', aggro: 6, seekRange: 10 });
    F.honda = ally(rt, '本多忠勝の隊', { x: 40, z: 22 }, [{ type: 'busho', n: 1, o: { name: '本多忠勝', invuln: true, horse: true, flag: 'honda' } }, { type: 'cavalry', n: 3 }], TOKU, { order: 'hold', aggro: 8 });
    F.todo = ally(rt, '藤堂高虎の隊', { x: -36, z: 66 }, [{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], { flag: 'todo', armor: TK }, { order: 'hold', facing: -Math.PI / 2 - 0.5 });
    F.ikeda = ally(rt, '池田輝政・山内一豊の隊', { x: 96, z: 70 }, [{ type: 'busho', n: 1, o: { name: '池田輝政', invuln: true, horse: true, flag: 'ageha' } }, { type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, horse: true } }, { type: 'ashigaru', n: 4 }], TOKU, { order: 'hold', facing: Math.PI * 0.75 });
    F.kato = ally(rt, '加藤嘉明の隊', { x: -22, z: -34 }, [{ type: 'busho', n: 1, o: { name: '加藤嘉明', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 5 }], TOKU, { order: 'hold' });
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // 西軍の大将たち（はじめは陣に構えて動かない）
    F.hide = foe(rt, '宇喜多秀家の本陣', UKITA_H, [{ type: 'busho', n: 1, o: { name: '宇喜多秀家', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }], UKITA, { order: 'hold', aggro: 8, seekRange: 12 });
    F.konishi = foe(rt, '小西行長の隊', KONISHI, [{ type: 'busho', n: 1, o: { name: '小西行長', invuln: true, horse: true } }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 4 }], ISHIDA, { order: 'hold', aggro: 10, seekRange: 14 });
    // 戦の前の会話（霧の中の対陣）
    rt.after(0.5, () => rt.say('井伊直政', '霧が深い。先陣は福島殿と決まっておるが……徳川の手で口火を切らねば、この戦は豊臣の家の戦で終わる', 5));
    rt.after(6, () => rt.say('松平忠吉', '物見と申して、福島の脇を抜けましょう', 3.5));
    rt.after(10, () => rt.say(nm(rt), '豊臣の世を見届けた槍、今日は徳川の先で振るいます', 3.5));
    rt.after(13.5, () => this.stage1(rt));
    rt.after(8, () => { for (const c of F.clash) c.go?.(); });
  },

  // ① 霧の中、福島隊の脇を抜けて宇喜多の陣の前へ（抜け駆け）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.s1t = rt.t;
    rt.obj('main', '井伊・松平に続き、南西の天満山の宇喜多の陣の前へ出る', 'main');
    F.ii.order = 'move'; F.ii.dest = { x: NUKE.x + 2, z: NUKE.z - 4 };
    rt.after(4, () => rt.say('福島正則', 'そこを行くは何者じゃ！　今日の先陣は福島ぞ！', 3.5));
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
    rt.banner('関ヶ原の戦い　開戦', '井伊の鉄砲が宇喜多の陣へ放たれた');
    rt.say('井伊直政', '放てっ！　徳川の戦の始まりじゃ！', 3);
    rt.after(3.5, () => rt.say('福島正則', '抜け駆けされたか！　ええい、福島の者ども、宇喜多へかかれぇっ！', 3.5));
    rt.obj('main', '宇喜多の陣の前の明石全登の先手を崩す', 'main');
    room(rt, 40);
    F.akashi = foe(rt, '明石全登の隊', UKITA_F, [{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 11 }], UKITA, { morale: 85 });
    F.ukita2 = foe(rt, '宇喜多の二番手', { x: UKITA_F.x - 6, z: UKITA_F.z + 20 }, [{ type: 'samurai', n: 2 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 9 }], UKITA);
    goAttack(F.ukita2, { x: FUKU.x - 6, z: FUKU.z });
    F.akaN = F.akashi.count + F.ukita2.count;
    F.ii.order = 'attack'; F.ii.aggro = 40; F.ii.seekRange = 50;
    goAttack(F.fuku, { x: UKITA_F.x + 14, z: UKITA_F.z + 14 });
    F.clash[0].push?.('B', 0.4);
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
    for (const g of [F.akashi, F.ukita2, F.ukita3]) rout(g);
    F.clash[0].push?.('A', 0.3);
    rt.obj('main', '北の笹尾山の前へ出て、黒田・細川と並び、島左近の隊を崩す', 'main');
    rt.say('井伊直政', '南は福島殿に任せた。我らは北へ、治部（三成）の陣を突く', 3.5);
    room(rt, 60);
    F.sakon = foe(rt, '島左近の隊', SAKON, [{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 10 }], ISHIDA, { morale: 95, aggro: 30, seekRange: 50 });
    F.gamo = foe(rt, '蒲生郷舎の隊', { x: SAKON.x - 8, z: SAKON.z + 14 }, [{ type: 'busho', n: 1, o: { name: '蒲生郷舎', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], ISHIDA, { aggro: 24 });
    F.sakN = F.sakon.count + F.gamo.count;
    F.kuroda = ally(rt, '黒田長政の隊', KURODA, [{ type: 'busho', n: 1, o: { name: '黒田長政', invuln: true, horse: true } }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 8 }], KUR);
    F.hoso = ally(rt, '細川忠興の隊', { x: -30, z: -70 }, [{ type: 'busho', n: 1, o: { name: '細川忠興', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], TOKU);
    goAttack(F.kuroda, { x: SAKON.x + 10, z: SAKON.z - 8 });
    goAttack(F.hoso, { x: SAKON.x + 12, z: SAKON.z + 4 });
    goAttack(F.ii, { x: SAKON.x + 8, z: SAKON.z + 10 });
    goAttack(F.kato, { x: KONISHI.x + 30, z: KONISHI.z - 6 }, 30, 40);
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
    for (const g of [F.sakon, F.gamo, F.shima3]) rout(g);
    rt.obj('main', '笹尾山の頂の石田三成の本陣へ攻め上り、旗本を崩す', 'main');
    room(rt, 25);
    F.mitsu = foe(rt, '石田三成の本陣', SASAO, [{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 8 }], ISHIDA, { order: 'hold', aggro: 22, seekRange: 30, morale: 90 });
    F.mitN = F.mitsu.count;
    F.mitsuGate = true;   // 寝返りの前は崩れない
    F.mitsu.noRout = true;
    goAttack(F.ii, { x: SASAO.x + 12, z: SASAO.z + 4 }, 30, 40);
    goAttack(F.kuroda, { x: SASAO.x + 10, z: SASAO.z - 8 }, 30, 40);
    rt.marker('foe', () => (F.mitsu.leader?.alive ? F.mitsu.leader.pos : F.mitsu.center()), '石田三成', { red: true, group: F.mitsu });
    // 家康が本陣を前へ（桃配山から陣場野へ）
    rt.banner('家康、本陣を前へ', '桃配山から陣場野へ');
    F.ieyasu.order = 'move'; F.ieyasu.dest = { ...IEYASU1 };
    F.ieyasuHost?.moveTo?.(IEYASU1.x + 16, IEYASU1.z, 30);
    F.hatamoto?.moveTo?.(IEYASU1.x + 16, IEYASU1.z + 22, 30);
    rt.after(3, () => rt.say('徳川家康', '金吾（秀秋）はまだ動かぬか……', 3));
    rt.after(7, () => rt.say('使番', '松尾山の旗、いまだ動きませぬ！', 3));
    // 問鉄砲（一説）：家康が松尾山へ鉄砲を撃ちかけさせた
    rt.after(11, () => {
      rt.say('徳川家康', '松尾山へ鉄砲を撃ちかけよ。どちらに付くか、はっきりさせてやれ', 4);
      rt.army.play('volley', { x: MATSUO.x + 40, z: MATSUO.z - 60 }, 1.2);
    });
    rt.after(17, () => this.flip(rt));
  },
  // 小早川の寝返り（必ず）。大谷隊が崩れ、脇坂らも東軍へ
  flip(rt) {
    const F = rt.flags;
    if (F.flipT || F.ending) return;
    F.flipT = rt.t;
    sfx('horagai', 1);
    rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 30 }, 2.5);
    rt.banner('小早川秀秋、寝返る', '松尾山を下り、大谷隊の横へ');
    rt.say('小早川秀秋', '……狙うは大谷刑部の陣じゃ。山を下れ！', 3.5);
    F.koba[0]?.moveTo?.(OTANI.x + 20, OTANI.z + 40, 22, { charge: true });
    F.koba[1]?.moveTo?.(OTANI.x + 26, OTANI.z + 16, 18, { charge: true });
    F.clash[2].shake?.('B', 30); F.clash[2].push?.('A', 0.7);
    for (const c of F.clash) c.shake?.('B', 12);
    room(rt, 40);
    F.otani = foe(rt, '大谷吉継の隊', OTANI, [{ type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '平塚為広' } }, { type: 'busho', n: 1, o: { name: '戸田勝成' } }, { type: 'ashigaru', n: 9 }], OTANI_LK, { order: 'hold', aggro: 20, seekRange: 30, facing: Math.PI });
    F.kobaG = ally(rt, '小早川秀秋の兵', { x: OTANI.x + 26, z: OTANI.z + 34 }, [{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '平岡頼勝', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], KOBA, { facing: Math.PI, aggro: 40, seekRange: 60 });
    goAttack(F.kobaG, OTANI);
    rt.after(5, () => rt.say('大谷吉継', '金吾め、やはり裏切ったか……。備えはしてある。押し返せ！', 4));
    rt.after(14, () => {
      rt.banner('脇坂・朽木・小川・赤座も東軍へ', '松尾山の麓の四家が続いて寝返る');
      F.waki?.moveTo?.(OTANI.x + 8, OTANI.z + 12, 16, { charge: true });
      room(rt, 10);
      F.wakiG = ally(rt, '脇坂安治の兵', { x: OTANI.x + 14, z: OTANI.z + 24 }, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 8 }], OTANI_LK, { facing: Math.PI, aggro: 40, seekRange: 60 });
      goAttack(F.wakiG, OTANI);
      if (alive(F.otani)) F.otani.morale -= 30;
    });
    rt.after(26, () => {
      rt.banner('大谷隊、崩れる', '西軍が南から崩れていく');
      rt.say('使番', '大谷刑部殿、陣中にて自害！　平塚・戸田も討ち死に！', 4);
      for (const u of F.otani?.units || []) if (u.alive && u.type === 'busho') u.invuln = false;
      rout(F.otani);
      F.clash[2].rout?.('B', { from: 1 });
      F.westHosts[4]?.rout?.({ hideAfter: 40 });
      rt.after(5, () => {
        F.clash[0].rout?.('B', { from: 1 });
        F.westHosts[3]?.retreat?.(30, 20);
        rout(F.hide); rout(F.konishi);
        rt.say('宇喜多秀家', '金吾めっ……！　刺し違えてくれる！', 3);
        rt.after(3, () => rt.say('明石全登', '殿、なりませぬ！　ここは落ちのびられませ！', 3));
      });
      F.mitsuGate = false; if (F.mitsu) { F.mitsu.noRout = false; F.mitsu.morale -= 25; }
      F.clash[1].push?.('A', 0.8);
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
    rout(F.mitsu);
    F.clash[1].rout?.('B', { from: -1 });
    F.westHosts[0]?.rout?.({ hideAfter: 40 }); F.westHosts[1]?.rout?.({ hideAfter: 40 });
    rt.after(4, () => {
      sfx('horagai', 1);
      rt.banner('島津が前へ', '敵の中を突っ切って退くつもりだ');
      rt.say('島津義弘', '退くは前じゃ。家康の本陣の前を突き抜けよ！', 4);
      rt.obj('main', '家康の本陣の前へ戻り、南の伊勢路へ退く島津の隊を食い止める', 'main');
      for (const g of [F.otani, F.kobaG, F.wakiG, F.akashi, F.ukita2, F.sakon, F.gamo, F.mitsu, F.mitsu2, F.todo, F.ikeda]) KIT.markRecyclable(g);
      room(rt, 30);
      F.shima = foe(rt, '島津義弘の隊', SHIMAZU, [{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '島津豊久', horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 10 }], SHIMA, { order: 'move', aggro: 40, seekRange: 26, morale: 100, noRout: true, width: 8 });
      F.shiN = F.shima.count; F.shiK = 0;
      F.westHosts[2]?.moveTo?.(SHIMA_PATH[1].x, SHIMA_PATH[1].z, 40, { charge: true });
      this.shimaStep(rt);
      goAttack(F.ii, HOLD5, 36, 40);
      goAttack(F.honda, HOLD5, 36, 40);
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
    F.ending = true;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => { t.main = true; t.special = { label: '関ヶ原で井伊の先に立ち、島津の退き口を受けた', pts: 60 }; }, '島津の退き口を食い止めた');
    rt.banner('関ヶ原の戦い　勝ち', '西軍は崩れ、島津は伊勢路へ落ちていった');
    rt.player.u.invuln = true;
    if (alive(F.shima)) { F.shima.order = 'move'; F.shima.dest = { x: 160, z: 180 }; F.shima.onArrive = null; F.shima.aggro = 0; }
    for (const g of rt.army.groups) if (g.team === 1 && g !== F.shima) rout(g);
    // 戦の後：首実検
    rt.after(3.5, () => rt.say('徳川家康', '皆の者、大儀。首実検をいたす', 3.5));
    rt.after(7.5, () => rt.say('福島正則', '宇喜多の陣、福島が崩してござる', 3));
    rt.after(11, () => rt.say('小早川秀秋', '……大谷の陣を、崩してまいりました', 3));
    rt.after(14.5, () => rt.say('徳川家康', '勝って兜の緒を締めよ。まだ佐和山が残っておる', 4));
    rt.after(19, () => rt.say('井伊直政', `${nm(rt)}、ようやった。徳川の先陣の槍、見事であった`, 3.5));
    rt.finish({ scriptedEnd: true }, 24);
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
    try { jindateTick(rt, dt); } catch (e) { if (!F.jindateErr) { F.jindateErr = 1; console.warn('陣立て', e); } }
    this.fog(rt);
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    if (rt.t > TIME_LIMIT) { this.lose(rt, '日が傾き、西軍を崩しきれなかった'); return; }
    if (F.step <= 2 && broken(F.ii) && broken(F.fuku)) { this.lose(rt, '井伊と福島の隊が崩れた'); return; }
    if (F.step === 1) {
      if (near(P, NUKE, 12) || rt.t - F.s1t > 40) this.stage2(rt);
    } else if (F.step === 2) {
      const left = (alive(F.akashi) ? F.akashi.count : 0) + (alive(F.ukita2) ? F.ukita2.count : 0);
      F.ek = F.akaN - left;
      // 先手が半ば減ると、宇喜多の本隊から新手が出る（数で押してくる）。段は敵の数と手柄で進め、時間では進めない。
      if (!F.wave2 && left <= Math.round(F.akaN * 0.5)) {
        F.wave2 = true; room(rt, 34);
        F.ukita3 = foe(rt, '宇喜多の本隊', { x: UKITA_H.x + 14, z: UKITA_H.z + 6 }, [{ type: 'busho', n: 1, o: { name: '宇喜多秀家', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 6 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 18 }], UKITA, { morale: 90 });
        F.akaN += F.ukita3.count;
        rt.banner('宇喜多の本隊が出る', '天満山から新手が押し寄せる');
        rt.say('宇喜多秀家', '東軍を押し返せ！　一人も陣へ入れるな！', 3.5);
      }
      const left2 = left + (alive(F.ukita3) ? F.ukita3.count : 0);
      const need = Math.round(F.akaN * 0.3);
      rt.objProgress('main', `${Math.min(F.akaN - left2, F.akaN - need)}／${F.akaN - need}`);
      if (F.wave2 && left2 <= need || rt.t - F.s2t > 420) this.stage3(rt);
    } else if (F.step === 3) {
      const left = (alive(F.sakon) ? F.sakon.count : 0) + (alive(F.gamo) ? F.gamo.count : 0);
      if (!F.wave3 && left <= Math.round(F.sakN * 0.5)) {
        F.wave3 = true; room(rt, 30);
        F.shima3 = foe(rt, '島津・小西の援兵', { x: SAKON.x + 6, z: SAKON.z + 30 }, [{ type: 'busho', n: 1, o: { name: '島津豊久', horse: true } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 16 }], ISHIDA, { morale: 92, aggro: 30, seekRange: 50 });
        F.sakN += F.shima3.count;
        rt.banner('西軍の援兵', '南から島津・小西の手が左近を救いに来る');
      }
      const left3 = left + (alive(F.shima3) ? F.shima3.count : 0);
      const need = Math.round(F.sakN * 0.3);
      rt.objProgress('main', `${Math.min(F.sakN - left3, F.sakN - need)}／${F.sakN - need}`);
      // 段は敵の数で進める（時間は長い保険だけ）。黒田の鉄砲が左近を撃つ（史実）
      if (F.wave3 && left3 <= need || rt.t - F.s3t > 420) this.stage4(rt);
    } else if (F.step === 4) {
      const n = alive(F.mitsu) ? F.mitsu.count : 0;
      const need = Math.round(F.mitN * 0.25);
      // 寝返りの前は本陣が固い（兵が減っても崩れず、次の兵が陣の内から出る）
      if (F.mitsuGate && n <= need + 2 && alive(F.mitsu) && !F.refill) {
        F.refill = true;
        room(rt, 8);
        F.mitsu2 = foe(rt, '石田の旗本', { x: SASAO.x - 6, z: SASAO.z - 6 }, [{ type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 14 }], ISHIDA, { aggro: 24, seekRange: 30 });
      }
      rt.objProgress('main', `${Math.min(F.mitN - n, F.mitN - need)}／${F.mitN - need}`);
      if (!F.mitsuGate && (n <= need || broken(F.mitsu))) this.stage5(rt);
      // 寝返りから時が経っても笹尾山へ届かない時の保険（史実で三成はこの頃に落ちた）
      if (!F.mitsuGate && F.flipT && rt.t - F.flipT > 240) this.stage5(rt);
    } else if (F.step === 5 && F.shima) {
      const n = alive(F.shima) ? F.shima.count : 0;
      F.shiK = F.shiN - n;
      const held = rt.t - F.s5t;
      rt.objProgress('main', `あと${Math.max(0, Math.ceil(60 - held))}秒`);
      // 島津の兵が四割を切るか、本陣の前で一分持ちこたえる（島津は勝ち負けに関わらず伊勢路へ抜けていく＝史実）
      if (held > 4 && (n <= F.shiN * 0.4 || (held > 60 && dist(P, HOLD5) < 40))) this.win(rt);
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
  + '一説：家康が松尾山の小早川の陣へ鉄砲を撃ちかけさせて寝返りを迫ったという話（問鉄砲）は、のちの記録に見える一説で、確かではない。伝承：家康が勝った後に「勝って兜の緒を締めよ」と言ったという話は言い伝えである。\n'
  + '陣の位置は史跡の目安に、地形は国土地理院の標高によるが、藤古川の川筋・街道・隊の人数と動き・会話は遊びのための復元である。';
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
  if (F.step === 2) return cut(F.akaN, n(F.akashi) + n(F.ukita2), Math.round(F.akaN * 0.45));
  if (F.step === 3) return cut(F.sakN, n(F.sakon) + n(F.gamo), Math.round(F.sakN * 0.4));
  if (F.step === 4) return F.mitsuGate ? null : cut(F.mitN, n(F.mitsu), Math.round(F.mitN * 0.35));
  return F.step === 5 && F.shima ? cut(F.shiN, n(F.shima), F.shiN * 0.4) : null;
};
// 戦の進行の札（段）：F.step の 1〜5
setStages('k06_sekigahara', [['井伊・松平に続き、宇喜多の陣の前へ'], ['宇喜多の先手を崩す', 2], ['笹尾山の前で島左近の隊を崩す', 3], ['石田の本陣へ攻め上る', 4], ['島津の退き口を食い止める', 5]]);

export { k06_sekigahara };
export default k06_sekigahara;
