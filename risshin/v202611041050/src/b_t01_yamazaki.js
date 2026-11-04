// ======================================================================
// 豊臣編 1. 山崎の戦い（docs/chapter2_toyotomi.md の「1. 山崎の戦い」・布陣は docs/battle_refs/t01_yamazaki.md の「布陣（ゲームの寸法）」を正とする）
// 天正十年（1582）六月十三日の午後四時ごろ。天王山の麓と円明寺川。主人公は池田恒興の手の侍大将。
// 陣（kaito AW6・AW7）：両軍とも初めから先陣・二陣・本陣が並ぶ。小勢は湧かない。敵の本陣（御坊塚）は前の二つの陣を破らないと届かない。
//   羽柴：先陣＝中川清秀（天王山の裾）・高山右近（山崎の村の前・中央）・池田恒興と加藤光泰（右・淀川沿い）／天王山＝秀長・官兵衛／二陣＝堀秀政／本陣＝秀吉（宝積寺）
//   明智：先陣＝松田政近・並河易家（天王山側）・斎藤利三（中央）・津田信春（左・淀川沿い）／二陣＝伊勢貞興／本陣＝光秀（御坊塚）／その奥に勝竜寺城
// 段（史実の流れ）：①斎藤利三の先手が円明寺川を渡り高山の陣を押す。高山の前で止める
//     ②右手の淀川沿いが空いている。池田勢と浅瀬で円明寺川を渡る ③淀川沿いの津田信春の隊を破る
//     ④斎藤利三の本隊の横腹を突いて崩す ⑤御坊塚の前の伊勢貞興の隊を破る ⑥御坊塚の光秀の本陣を崩す（勝ち）
// 負け：前の味方（中川・高山の隊）が二つとも崩れる・日が暮れる（9分）。
// 地形：国土地理院の標高（asset_dem_yamazaki.js・dem.mjs の yamazaki）。ゲームの 1 を実の 6m に縮め、
//   西の天王山の裾だけ高さを残す。円明寺川と淀川は遊び用の復元（川筋・浅瀬の位置は推定）。
// 座標：南が +z（羽柴勢）、北が −z（明智勢）、西が −x（天王山）、東が +x（淀川）。
// 重さ：本物の兵は同時に二百ほどまで（奥の陣は前の陣が崩れてから本物にする）。大軍は軽い作り（addDistantArmy・addClash・旗本の備）。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { flagTexture } from './textures.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, palisade, yagura, kabukimon } from './props.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, cut } from './stages.js';
import { toyoClash } from './toyo_mob.js';

let dem = null;
useTerrain('dem_yamazaki', (data) => { dem = data; });
const DEM_XY = 6, OX = -110, OZ = 300;   // ゲームの (x, z) → 実の (x·6−110, z·6+300) m（中心は円明寺川の下流の南）
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.037);
  if (dem) h += Math.max(0, demSample(dem, x * DEM_XY + OX, z * DEM_XY + OZ) - 8) * 0.32;
  return h;
}

const AKECHI = { flag: 'akechi', armor: 0x34302a };
const HASHIBA = { flag: 'oda', armor: 0x2a2622 };
const IKEDA = { flag: 'ageha', armor: 0x2c2620 };
// 円明寺川（西の天王山の裾から東の淀川へ）。浅瀬は西の中川の前・中央の高山の前・東の淀川沿い（池田勢の渡り）
const ENMYOJI = [[-125, -34], [-90, -26], [-50, -16], [0, -8], [50, -2], [100, 6], [158, 14]];
const YODO = [[176, -220], [166, -60], [160, 60], [152, 220]];
const TAKA = { x: -34, z: 20 };           // 高山右近の陣（山崎の村の前・中央）
const FORD_S = { x: 84, z: 22 };          // 淀川沿いの渡りの南の岸（池田の陣の前）
const FORD_N = { x: 88, z: -20 };         // 渡った北の岸
const TSUDA = { x: 102, z: -46 };         // 津田信春の隊（明智の左・淀川沿い）
const SAITO = { x: 2, z: -34 };           // 斎藤利三の本隊（中央・川の北）
const ISE = { x: 4, z: -84 };             // 伊勢貞興の隊（二陣・御坊塚の前）
const GOBO = { x: -6, z: -124 };          // 御坊塚（光秀の本陣）
const SHORYUJI = { x: 44, z: -186 };      // 勝竜寺城（本陣の奥・北東）
const TIME_LIMIT = 540;

const alive = (g) => g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const lead = (g) => (g?.leader?.alive ? g.leader.pos : alive(g) ? g.center() : null);
// 円明寺川の筋の z（x で引く）。川を越えたか、川の中かを見る
function riverZ(x) {
  const L = ENMYOJI;
  if (x <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) if (x <= L[i][0]) { const [x0, z0] = L[i - 1], [x1, z1] = L[i]; return z0 + (z1 - z0) * (x - x0) / (x1 - x0); }
  return L[L.length - 1][1];
}

function farHost(rt, x, z, w, d, count, facing, side, seed, kind = 'mixed') {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, team: side === AKECHI ? 1 : 0, armor: side.armor,
    flagTex: flagTexture(side.flag), mon: side.flag, kind, flagRate: 0.35, seed, host: false, farFill: true });
}
const foe = (name, at, face, list, o = {}) => enemyGroup(rt0, { name, faction: 'akechi', anchor: { ...at }, facing: face, width: 10, ...o },
  list.map(([type, n, x]) => ({ type, n, o: { flag: AKECHI.flag, armor: AKECHI.armor, ...(x || {}) } })));
let rt0 = null;

// 勝竜寺城の前（奥の目当て）：柵・冠木門・櫓・幟。当たりは柵だけ
function shoryujiFront(rt) {
  const W = rt.world, x = SHORYUJI.x, z = SHORYUJI.z + 10;
  rt.scene.add(kabukimon(W, x, z, 6, 0));
  rt.scene.add(palisade(W, [x - 34, z, x - 4, z], { solid: true }));
  rt.scene.add(palisade(W, [x + 4, z, x + 34, z], { solid: true }));
  rt.scene.add(yagura(W, x - 20, z - 7, { mon: 'akechi', team: 1 }));
  rt.scene.add(yagura(W, x + 20, z - 7, { mon: 'akechi', team: 1 }));
  for (const dx of [-28, -12, 12, 28]) rt.scene.add(nobori(W, x + dx, z - 3, 'akechi'));
}

const t01_yamazaki = {
  spawn: { x: -46, z: 64, heading: Math.PI },
  prelude: 12,
  sides: { a: { name: '羽柴勢', mon: 'ageha', faction: 'oda' }, b: { name: '明智勢', mon: 'akechi', faction: 'akechi' } },
  taisho: { a: { name: '羽柴秀吉', def: true }, b: { name: '明智光秀', def: true } },
  date: () => '天正十年（1582）六月十三日　午後四時ごろ　山城国 山崎',
  history: '本能寺の変の十一日後、備中高松から大返しの羽柴勢およそ四万が、明智勢およそ一万六千と天王山と淀川の間の狭い野でぶつかった。両軍は円明寺川を挟んで向き合い、明智の斎藤利三が川を渡って中央の高山右近を押したが、淀川沿いの池田恒興・加藤光泰が気づかれずに川を渡り、明智の左の津田信春を破って横を突いた。明智勢は崩れ、光秀は御坊塚の本陣から勝竜寺城へ退き、夜に城を出て小栗栖で討たれた。明智秀満は安土にいて山崎には間に合わなかった。川筋・浅瀬・陣の位置は遊びのための復元。',
  force(rt) {
    const F = rt.flags;
    const k = [0, 0.05, 0.12, 0.25, 0.45, 0.65, 0.85][F.step || 0] || 0;
    return { a: 40000 - (F.ak || 0) * 40, a0: 40000, b: Math.round(16000 * (1 - k)) - (F.ek || 0) * 40, b0: 16000 };
  },
  world: {
    seed: 1582,
    time: 'dusk',
    height,
    waterSlow: true,
    riverCross: true,
    streams: [
      { pts: ENMYOJI, w: 5, depth: 1.1, fords: [{ x: -62, w: 16 }, { x: -22, w: 14 }, { x: 86, w: 20 }] },
      { pts: YODO, w: 22, depth: 2.6 },
    ],
    paths: [[[-46, 120], [-40, 60], [-34, 20]], [[-20, 50], [40, 40], [84, 22]], [[88, -20], [96, -44]], [[60, -40], [10, -84], [-6, -124], [44, -186]]],
    tint(x, z, h, c) {
      // 川の両岸は田と葦の湿地（暗い緑と泥）。天王山の裾は濃い草
      const d = Math.abs(z - (-8 + x * 0.09));
      if (d < 20) { const k = 1 - d / 20; c.setRGB(c.r * (1 - 0.3 * k) + 0.06 * k, c.g * (1 - 0.2 * k) + 0.05 * k, c.b * (1 - 0.3 * k) + 0.02 * k); }
      const p = 0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05);
      c.multiplyScalar(0.84 + p * 0.22);
    },
    clear: (x, z) => x > -110 && x < 150 && z > -200 && z < 150,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (x < -100 ? 1 : x > 150 || z < -205 || z > 160 ? 0.6 : 0),
    fleeOut: (x, z, team) => (team === 1 ? z < -205 : z > 170),
  },

  setup(rt) {
    const F = rt.flags;
    rt0 = rt;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 本陣：秀吉は宝積寺（南・天王山の裾）、光秀は御坊塚。陣幕の中に将が座る（中に誰もいない陣幕にしない・AV18）
    KIT.honjin(rt, -26, 128, { mon: 'oda', people: false, fire: false });
    KIT.honjin(rt, GOBO.x, GOBO.z - 6, { mon: 'akechi', people: false, fire: false });
    shoryujiFront(rt);
    for (const [x, z] of [[-90, 34], [-40, 30], [-26, 30], [76, 34], [92, 34]]) rt.scene.add(nobori(rt.world, x, z, x > 0 ? 'ageha' : 'oda'));
    for (const [x, z] of [[-6, -42], [12, -42], [96, -56], [110, -56], [-2, -92], [14, -92]]) rt.scene.add(nobori(rt.world, x, z, 'akechi'));
    // 陣の厚み（軽い作り）：各陣の後ろに控えの備。奥ほど広く、本陣の周りは旗本で固める。戦う兵の通り道（浅瀬・川筋）からは外す
    F.hostA = [farHost(rt, -20, 150, 70, 18, 260, Math.PI, HASHIBA, 1582),          // 秀吉の本隊・信孝・丹羽の後詰
      farHost(rt, 2, 84, 40, 12, 160, Math.PI, HASHIBA, 1583),                     // 二陣（堀秀政の控え）
      farHost(rt, 92, 60, 30, 12, 140, Math.PI, IKEDA, 1584)];                     // 池田・加藤の控え（淀川沿い）
    F.hostB = [farHost(rt, GOBO.x, GOBO.z - 24, 50, 16, 240, 0, AKECHI, 1613),       // 御坊塚の旗本
      farHost(rt, ISE.x, ISE.z - 14, 40, 12, 160, 0, AKECHI, 1614),                 // 二陣の控え
      farHost(rt, 4, -52, 44, 10, 140, 0, AKECHI, 1615)];                           // 斎藤利三の控え
    // 中央の川の押し合い（高山と斎藤の後ろの者どうし）。軽い作りだけ
    F.clash = rt.world.addClash({ x: 14, z: -6, facing: Math.PI, w: 52, bw: 3, gap: 1.6, seed: 613, rt,
      play: (k, q, v) => rt.army.play(k, q, v), smoke: (x1, y1, z1, ax, az) => rt.army.smoke(x1, y1, z1, ax, az),
      noRout: true, noWake: true, killRate: 0.003, maxDrift: 0.8, host: false, corpses: 8, realNear: 0, nearHide: 0,
      A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: 70, flagRate: 0.2 },
      B: { flagTex: flagTexture(AKECHI.flag), armor: AKECHI.armor, count: 80, flagRate: 0.3 } });
    F.clash?.go?.();
    // 天王山の裾（中川と松田・並河の取り合い）。軽い作りの押し合い
    F.near = toyoClash(rt, { x: -86, z: -6, facing: Math.PI - 0.4, w: 34, seed: 1585,
      A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: 120 }, B: { flagTex: flagTexture(AKECHI.flag), armor: AKECHI.armor, count: 120, guns: true } });
    // ---- 羽柴の先陣（中川・高山は史実で生き残るので討たれない。二つとも崩れれば負けなので退かない） ----
    const ally = (name, at, o, list) => allyGroup(rt, { name, anchor: { ...at }, facing: Math.PI, width: 9, aggro: 14, morale: 90, noRout: true, fullStrength: true, ...o },
      list.map(([type, n, x]) => ({ type, n, o: { flag: HASHIBA.flag, ...(x || {}) } })));
    F.naka = ally('中川清秀の隊', { x: -80, z: 24 }, { order: 'hold' }, [['busho', 1, { name: '中川清秀', invuln: true, horse: true }], ['samurai', 2], ['ashigaru', 10]]);
    F.taka = ally('高山右近の隊', TAKA, { order: 'hold' }, [['busho', 1, { name: '高山右近', invuln: true, horse: true }], ['samurai', 2], ['gun', 3], ['ashigaru', 9]]);
    F.tenno = ally('羽柴秀長の隊', { x: -104, z: 34 }, { seekRange: 40, order: 'hold' }, [['busho', 1, { name: '羽柴秀長', invuln: true, horse: true }], ['busho', 1, { name: '黒田官兵衛', invuln: true, horse: true }], ['gun', 5], ['ashigaru', 4]]);
    F.hide = ally('羽柴秀吉の本陣', { x: -26, z: 120 }, { aggro: 6, seekRange: 10, order: 'hold' }, [['busho', 1, { name: '羽柴秀吉', invuln: true, horse: false }], ['samurai', 3], ['ashigaru', 2]]);
    // 主人公の付く池田勢（右・淀川沿い）。始めは高山の陣の加勢に出た主人公を、浅瀬の前で待つ
    F.ikeda = allyGroup(rt, { name: '池田恒興の隊', anchor: { x: 80, z: 34 }, facing: Math.PI, width: 9, aggro: 12, morale: 95, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true, flag: IKEDA.flag } }, { type: 'busho', n: 1, o: { name: '加藤光泰', invuln: true, horse: true, flag: IKEDA.flag } },
        { type: 'samurai', n: 3, o: { flag: IKEDA.flag } }, { type: 'ashigaru', n: 13, o: { flag: IKEDA.flag } }]);
    // ---- 明智の先陣（川の北に並ぶ） ----
    F.matsu = foe('松田政近の隊', { x: -92, z: -40 }, 0, [['busho', 1, { name: '松田政近', horse: true }], ['samurai', 2], ['ashigaru', 8]], { order: 'attack', aggro: 30, seekRange: 50 });
    F.nami = foe('並河易家の隊', { x: -70, z: -36 }, 0, [['busho', 1, { name: '並河易家', horse: true }], ['samurai', 2], ['ashigaru', 8]], { order: 'hold', aggro: 18, seekRange: 26 });
    F.saki = foe('斎藤利三の先手', { x: -22, z: -30 }, 0, [['samurai', 3], ['gun', 3], ['ashigaru', 12]], { order: 'hold', aggro: 16, seekRange: 24, morale: 85 });
    F.saito = foe('斎藤利三の本隊', SAITO, 0, [['busho', 1, { name: '斎藤利三', horse: true }], ['samurai', 4], ['ashigaru', 14]], { order: 'hold', aggro: 16, seekRange: 22, morale: 85, noFrontline: true });
    F.tsuda = foe('津田信春の隊', TSUDA, 0, [['busho', 1, { name: '津田信春', horse: true }], ['samurai', 2], ['gun', 3], ['ashigaru', 9]], { order: 'hold', aggro: 18, seekRange: 26, noFrontline: true });
    for (const g of [F.saito, F.tsuda]) g.noFrontline = true;
    // 天王山の裾：松田の手が中川・秀長へ取り付く（主人公の持ち場ではない）
    F.matsu.order = 'move'; F.matsu.dest = { x: -88, z: 14 }; F.matsu.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; };
    // 戦の前の会話（筋書きの一枚の「前」）。本能寺の直後・毛利との講和・中国大返しを先に言う
    rt.after(0.5, () => rt.say('羽柴秀吉', '毛利と和を結び、備中から駆け通して来たぞ。上様の仇、日向を討つは今ぞ', 4.5));
    rt.after(5.5, () => rt.say('池田恒興', 'わしらは右、淀川沿いじゃ。まずは高山の陣へ加勢に行け', 4));
    rt.after(10, () => rt.say(nm(rt), 'この槍、そのために残しました', 3.5));
    rt.after(13.5, () => this.stage1(rt));
  },

  // ① 斎藤利三の先手が川を渡り、中央の高山の陣を押す。高山の前で止める
  stage1(rt) {
    const F = rt.flags;
    F.step = 1;
    rt.obj('main', '高山右近の陣の前で、川を渡って来た斎藤利三の先手を止める', 'main');
    rt.marker('foe', () => (alive(F.saki) ? F.saki.center() : TAKA), '斎藤利三の先手', { red: true, group: F.saki });
    F.sakiN = F.saki.count;
    F.saki.order = 'move'; F.saki.dest = { x: TAKA.x - 2, z: TAKA.z - 10 };
    F.saki.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; q.seekRange = 40; };
    rt.after(3, () => rt.say('斎藤利三', '川を越えよ！　高山の陣を押し破れ', 3.5));
    rt.after(8, () => rt.say('高山右近', '斎藤の手が渡って来たぞ。ここを抜かれれば天王山の裾まで崩れる！', 4));
    rt.after(15, () => rt.say('黒田官兵衛', '天王山はこちらが押さえた。山の上から撃ち下ろせ', 3.5));
    rt.after(22, () => rt.say('明智光秀', '天王山を取られたか……。左馬助（秀満）は安土から間に合わぬ。ここで支えよ', 4));
  },
  // ② 右手の淀川沿いが空いている。池田勢と浅瀬で円明寺川を渡る
  stage2(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.objDone('main');
    rt.award((t) => t.side.push('高山の陣の前で斎藤の先手を止めた'), '高山の陣の前で斎藤の先手を止めた');
    rt.unmark('foe');
    if (alive(F.saki)) { F.saki.routed = true; F.saki.order = 'flee'; }
    rt.obj('main', '東の淀川沿いの浅瀬で、池田勢と円明寺川を渡る', 'main');
    rt.marker('ford', FORD_N, '淀川沿いの浅瀬');
    rt.say('池田恒興', '斎藤が中へ出た分、淀川沿いの津田の備えは薄い。気づかれぬうちに川を渡るぞ', 4.5);
    F.ikeda.order = 'move'; F.ikeda.dest = { ...FORD_S };
    F.ikeda.onArrive = (g) => { g.order = 'move'; g.dest = { ...FORD_N }; g.onArrive = null; };
    for (const g of [F.naka, F.taka]) if (alive(g)) g.order = 'hold';
  },
  // ③ 淀川沿いの津田信春の隊を破る
  stage3(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.objDone('main');
    rt.award((t) => t.side.push('円明寺川を渡った'), '円明寺川を渡った');
    rt.unmark('ford');
    rt.obj('main', '淀川沿いの津田信春の隊を破る', 'main');
    F.tsudaN = F.tsuda.count;
    F.tsuda.order = 'attack'; F.tsuda.aggro = 30; F.tsuda.seekRange = 40;
    rt.marker('foe', () => lead(F.tsuda) || TSUDA, '津田信春', { red: true, group: F.tsuda });
    F.ikeda.order = 'attack'; F.ikeda.aggro = 40; F.ikeda.seekRange = 60; F.ikeda.focus = F.tsuda.leader || null;
    rt.say('使番', '池田勢、川を渡りきった！　津田の備えは気づいておらぬ', 3.5);
    rt.after(4, () => rt.say('津田信春', '横から敵じゃと……！　槍を揃えよ', 3));
  },
  // ④ 斎藤利三の本隊の横腹を突いて崩す
  stage4(rt) {
    const F = rt.flags;
    F.step = 4;
    rt.objDone('main');
    rt.award((t) => t.side.push('津田信春の隊を破った'), '津田信春の隊を破った');
    rt.unmark('foe');
    if (alive(F.tsuda)) { F.tsuda.routed = true; F.tsuda.order = 'flee'; }
    rt.obj('main', '西の斎藤利三の本隊へ回り、横腹を突いて崩す', 'main');
    F.saiN = F.saito.count;
    // 斎藤の本隊は南（高山の陣）を向いたまま。東の横から当たる
    F.saito.facing = Math.PI; F.saito.order = 'attack'; F.saito.aggro = 22; F.saito.seekRange = 30;
    rt.marker('foe', () => lead(F.saito) || SAITO, '斎藤利三', { red: true, group: F.saito });
    F.ikeda.order = 'attack'; F.ikeda.focus = F.saito.leader || null;
    // 中ほどから堀秀政の二陣が押し出し、川の押し合いも羽柴勢へ傾く
    F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: 2, z: 70 }, facing: Math.PI, width: 10, aggro: 30, seekRange: 50, morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true, flag: HASHIBA.flag } }, { type: 'samurai', n: 2, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 12, o: { flag: HASHIBA.flag } }]);
    F.hori.order = 'move'; F.hori.dest = { x: -10, z: -24 }; F.hori.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; };
    if (alive(F.taka)) { F.taka.order = 'attack'; F.taka.aggro = 30; }
    F.clash?.push?.('A', 0.6);
    F.hostA[1]?.moveTo?.(2, 30, 18);
    rt.say('池田恒興', '津田は崩れた。斎藤の横腹は空いておる。突け！', 3.5);
    rt.after(5, () => rt.say('斎藤利三', '横じゃと……！　槍を返せ、返せ！', 3));
    rt.after(9, () => rt.say('堀秀政', '二陣も川を越えるぞ。四万で押し包め！', 3.5));
  },
  // ⑤ 御坊塚の前の伊勢貞興の隊（二陣）を破る。本陣はその奥
  stage5(rt) {
    const F = rt.flags;
    F.step = 5;
    rt.objDone('main');
    rt.award((t) => t.side.push('斎藤利三の本隊を崩した'), '斎藤利三の本隊を崩した');
    rt.unmark('foe');
    rt.banner('斎藤利三の隊が崩れた', '御坊塚の光秀の本陣へ');
    for (const g of [F.saito, F.saki, F.matsu, F.nami]) if (alive(g)) { g.routed = true; g.order = 'flee'; }
    F.clash?.push?.('A', 1); F.clash?.shake?.('B', 30);
    F.hostB[2]?.rout?.({ hideAfter: 30 });
    rt.obj('main', '御坊塚の前の伊勢貞興の隊を破る', 'main');
    F.ise = foe('伊勢貞興の隊', ISE, 0, [['busho', 1, { name: '伊勢貞興', horse: true }], ['samurai', 3], ['gun', 3], ['ashigaru', 12]], { order: 'hold', aggro: 26, seekRange: 34, morale: 85 });
    F.iseN = F.ise.count;
    rt.marker('foe', () => lead(F.ise) || ISE, '伊勢貞興', { red: true, group: F.ise });
    F.ikeda.order = 'move'; F.ikeda.dest = { x: ISE.x + 8, z: ISE.z + 14 }; F.ikeda.focus = null;
    F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; };
    if (alive(F.hori)) { F.hori.order = 'move'; F.hori.dest = { x: ISE.x - 12, z: ISE.z + 12 }; F.hori.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; }; }
    rt.after(3, () => rt.say('伊勢貞興', '御坊塚へは一歩も通さぬ。ここが明智の二陣ぞ', 3.5));
  },
  // ⑥ 御坊塚の光秀の本陣を崩す（勝ち＝この目標）
  stage6(rt) {
    const F = rt.flags;
    F.step = 6;
    rt.objDone('main');
    rt.award((t) => t.side.push('伊勢貞興の隊を破った'), '伊勢貞興の隊を破った');
    rt.unmark('foe');
    if (alive(F.ise)) { F.ise.routed = true; F.ise.order = 'flee'; }
    F.hostB[1]?.rout?.({ hideAfter: 30 });
    rt.obj('main', '御坊塚の明智光秀の本陣を崩す', 'main');
    // 光秀はここでは討たれず、崩れて勝竜寺城へ退く（最期は小栗栖）
    F.mitsu = foe('明智光秀の本陣', { x: GOBO.x, z: GOBO.z + 6 }, 0, [['busho', 1, { name: '明智光秀', invuln: true, horse: true }], ['samurai', 5], ['gun', 4], ['ashigaru', 10]], { aggro: 24, seekRange: 34, width: 12, morale: 85 });
    F.mitN = F.mitsu.count;
    rt.marker('foe', () => lead(F.mitsu) || GOBO, '明智光秀', { red: true, group: F.mitsu });
    rt.after(3, () => rt.say('明智光秀', 'ここで踏みとどまれ。御坊塚を明け渡すな', 3.5));
    F.ikeda.order = 'move'; F.ikeda.dest = { x: GOBO.x + 6, z: GOBO.z + 16 };
    F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => { t.main = true; t.special = { label: '円明寺川を渡り、明智の横を崩した', pts: 20 }; }, '光秀の本陣を崩した');
    rt.banner('山崎の戦い　勝ち', '光秀の本陣が崩れ、光秀は勝竜寺城へ退いた');
    rt.player.u.invuln = true;
    if (alive(F.mitsu)) { F.mitsu.routed = true; F.mitsu.order = 'flee'; F.mitsu.dest = { ...SHORYUJI }; }
    F.hostB[0]?.rout?.({ hideAfter: 30 });
    rt.say('明智光秀', '……退け。勝竜寺へ退け', 3);
    // 戦の後の会話（筋書きの一枚の「後」）と、小栗栖での光秀の最期の知らせ
    rt.after(3.5, () => rt.say('羽柴秀吉', '日向は逃げたが、もう終いよ。ようやった', 4));
    rt.after(8, () => rt.say('使番', '明智日向守、夜に勝竜寺を抜け、小栗栖にて落武者狩りに討たれた由！', 4.5));
    rt.after(13, () => rt.say('黒田官兵衛', '次は、織田家の中の戦にございます', 4));
    rt.finish({ scriptedEnd: true }, 18);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    if (rt.t > TIME_LIMIT) { this.lose(rt, '日が暮れ、明智勢を崩しきれなかった'); return; }
    if (F.step <= 4 && broken(F.naka) && broken(F.taka)) { this.lose(rt, '前で支える中川・高山の隊が崩れた'); return; }
    // 川を渡った後、池田勢は主人公と離れず進む（一人で敵の陣に囲まれない）。行き先は離れた時だけ据え直す
    if (F.step >= 3 && alive(F.ikeda) && (F.escT = (F.escT || 0) - dt) <= 0) {
      F.escT = 0.5;
      const c = F.ikeda.center(), far = c && Math.hypot(c.x - P.x, c.z - P.z) > 14;
      if (far && (!F.ikeda.dest || Math.hypot(F.ikeda.dest.x - P.x, F.ikeda.dest.z - P.z) > 7)) {
        F.ikeda.order = 'move'; F.ikeda.dest = { x: P.x, z: P.z + 3 }; F.ikeda.focus = null;
        F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; g.seekRange = 40; };
      }
    }
    const left = (g) => (alive(g) ? g.count : 0);
    if (F.step === 1) {
      F.ek = F.sakiN - left(F.saki);
      if (left(F.saki) <= F.sakiN * 0.3 || broken(F.saki)) this.stage2(rt);
    } else if (F.step === 2) {
      // 浅瀬のほかで川を越えても、渡ったと見る（川の中で迷って日を暮らさない）
      if (near(P, FORD_N, 14) || (P.x > 55 && P.z < riverZ(P.x) - 8)) this.stage3(rt);
    } else if (F.step === 3) {
      if (left(F.tsuda) <= F.tsudaN * 0.3 || !F.tsuda.leader?.alive) this.stage4(rt);
    } else if (F.step === 4) {
      if (left(F.saito) <= F.saiN * 0.3 || !F.saito.leader?.alive) this.stage5(rt);
    } else if (F.step === 5) {
      if (left(F.ise) <= F.iseN * 0.3 || !F.ise.leader?.alive) this.stage6(rt);
    } else if (F.step === 6) {
      if (left(F.mitsu) <= F.mitN * 0.3 || broken(F.mitsu)) this.win(rt);
    }
  },
};

// bot：近い敵（逃げる者は追わない）を突き、いなければ段の行き先へ。浅瀬を渡る間は寄り道しない
t01_yamazaki.botBrain = (b, inp, { goTo, patientStrike }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending || !F.step) return;
  const ok = (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.group?.routed && Math.abs(o.pos.y - u.pos.y) < 3;
  const e = b.army.nearestEnemy(u, F.step === 2 ? 5 : 9, ok);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(p, inp, e, d, true);
    return;
  }
  inp.guardHold = false;
  let t = TAKA;
  if (F.step === 1) t = lead(F.saki) || TAKA;
  // 川へ下りたら引き返さず向こう岸へ。中ほどで川の北に出ていたら、斎藤の本隊の前を横切らず南の岸へ戻ってから浅瀬へ
  else if (F.step === 2) t = u.pos.x < 60 ? (u.pos.z < riverZ(u.pos.x) + 6 ? { x: Math.max(-22, Math.min(40, u.pos.x)), z: 30 } : { x: 70, z: 30 })
    : u.pos.z < FORD_S.z + 4 || near(u.pos, FORD_S, 8) ? FORD_N : FORD_S;
  else if (F.step === 3) t = lead(F.tsuda) || TSUDA;
  else if (F.step === 4) t = lead(F.saito) || SAITO;
  else if (F.step === 5) t = lead(F.ise) || ISE;
  else if (F.step === 6) t = lead(F.mitsu) || GOBO;
  goTo(p, inp, t.x, t.z, 2.5);
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.t01_yamazaki = (rt) => {
  const F = rt.flags, n = (g) => (alive(g) ? g.count : 0);
  if (F.ending) return null;
  const S = { 1: [F.sakiN, F.saki], 3: [F.tsudaN, F.tsuda], 4: [F.saiN, F.saito], 5: [F.iseN, F.ise], 6: [F.mitN, F.mitsu] }[F.step];
  return S && S[0] ? cut(S[0], n(S[1]), S[0] * 0.3) : null;
};
withGuard(t01_yamazaki);

export { t01_yamazaki };
