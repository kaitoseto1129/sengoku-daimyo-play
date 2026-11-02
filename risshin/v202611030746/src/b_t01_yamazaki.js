// ======================================================================
// 豊臣編 1. 山崎の戦い（docs/chapter2_toyotomi.md の「1. 山崎の戦い」を正とする）
// 天正十年（1582）六月十三日の夕刻。天王山の麓と円明寺川。主人公は池田恒興の手の侍大将。
// 段：①天王山の麓の陣で明智の先手を止める ②池田勢と淀川沿いへ回り円明寺川を渡る
//     ③明智勢の横へ斬り込み斎藤利三の隊を崩す ④逃げる明智勢を追い勝竜寺城の前まで押す
// 負け：前の味方（中川・高山の隊）が二つとも崩れる・日が暮れる（6分ほど）。
// 地形：国土地理院の標高（asset_dem_yamazaki.js・dem.mjs の yamazaki）。ゲームの 1 を実の 6m に縮め、
//   西の天王山の裾だけ高さを残す。円明寺川と淀川は遊び用の復元（川筋・浅瀬の位置は推定）。
// 座標：南が +z（羽柴勢）、北が −z（明智勢）、西が −x（天王山）、東が +x（淀川）。
// 重さ：本物の兵は段ごとに出し、同時に百ほどまで。大軍は軽い作り（addDistantArmy・addClash）。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, centerOf, nm } from './bhelp.js';
import { flagTexture } from './textures.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, palisade, yagura, kabukimon } from './props.js';
import { withGuard } from './toyo_bot.js';
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
// 円明寺川（西の天王山の裾から東の淀川へ）。浅瀬は西の中川・高山の前と、東の淀川沿い（池田勢の渡り）
const ENMYOJI = [[-125, -34], [-90, -26], [-50, -16], [0, -8], [50, -2], [100, 6], [158, 14]];
const YODO = [[176, -220], [166, -60], [160, 60], [152, 220]];
const JIN = { x: -70, z: 30 };            // 中川・高山の陣（天王山の麓）
const FORD_S = { x: 84, z: 22 };          // 淀川沿いの渡りの南の岸
const FORD_N = { x: 88, z: -20 };         // 渡った北の岸
const SAITO = { x: 48, z: -50 };          // 斎藤利三の隊
const SHORYUJI = { x: 26, z: -150 };      // 勝竜寺城の前
const TIME_LIMIT = 480;

const alive = (g) => g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// 円明寺川の筋の z（x で引く）。川を越えたか、川の中かを見る
function riverZ(x) {
  const L = ENMYOJI;
  if (x <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) if (x <= L[i][0]) { const [x0, z0] = L[i - 1], [x1, z1] = L[i]; return z0 + (z1 - z0) * (x - x0) / (x1 - x0); }
  return L[L.length - 1][1];
}

function farHost(rt, x, z, w, d, count, facing, side, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, team: side === AKECHI ? 1 : 0, armor: side.armor,
    flagTex: flagTexture(side.flag), mon: side.flag, kind: 'mixed', flagRate: 0.35, seed, host: false });
}

// 勝竜寺城の前（遠くの目当て）：柵・冠木門・櫓・幟。当たりは柵だけ
function shoryujiFront(rt) {
  const W = rt.world, x = SHORYUJI.x, z = SHORYUJI.z - 18;
  rt.scene.add(kabukimon(W, x, z, 6, 0));
  rt.scene.add(palisade(W, [x - 34, z, x - 4, z], { solid: true }));
  rt.scene.add(palisade(W, [x + 4, z, x + 34, z], { solid: true }));
  rt.scene.add(yagura(W, x - 20, z - 7, { mon: 'akechi', team: 1 }));
  rt.scene.add(yagura(W, x + 20, z - 7, { mon: 'akechi', team: 1 }));
  for (const dx of [-28, -12, 12, 28]) rt.scene.add(nobori(W, x + dx, z - 3, 'akechi'));
}

const t01_yamazaki = {
  spawn: { x: -62, z: 92, heading: Math.PI },
  prelude: 12,
  sides: { a: { name: '羽柴勢', mon: 'ageha', faction: 'oda' }, b: { name: '明智勢', mon: 'akechi', faction: 'akechi' } },
  taisho: { a: { name: '羽柴秀吉', def: true }, b: { name: '明智光秀', def: true } },
  date: () => '天正十年（1582）六月十三日　夕刻　山城国 山崎',
  history: '本能寺の変の十一日後、備中高松から大返しの羽柴勢およそ四万が、明智勢およそ一万六千と天王山と淀川の間の狭い野でぶつかった。羽柴秀長・黒田官兵衛が天王山を押さえ、中川清秀・高山右近が前で支え、池田恒興が淀川沿いに円明寺川を渡って明智の横を突き、明智勢は崩れた。光秀は勝竜寺城から逃れる途中、小栗栖で討たれた。明智秀満は安土にいて山崎には間に合わなかった。川筋・浅瀬・陣の位置は遊びのための復元。',
  force(rt) {
    const F = rt.flags;
    const k = [0, 0.12, 0.3, 0.6, 0.85][F.step || 0] || 0;
    return { a: 40000 - (F.ak || 0) * 40, a0: 40000, b: Math.round(16000 * (1 - k)) - (F.ek || 0) * 40, b0: 16000 };
  },
  world: {
    seed: 1582,
    time: 'dusk',
    height,
    waterSlow: true,
    riverCross: true,
    streams: [
      { pts: ENMYOJI, w: 5, depth: 1.1, fords: [{ x: -62, w: 16 }, { x: 86, w: 20 }] },
      { pts: YODO, w: 22, depth: 2.6 },
    ],
    paths: [[[-62, 120], [-66, 60], [-70, 30]], [[-40, 60], [30, 44], [84, 22]], [[88, -20], [60, -60], [30, -120], [26, -150]]],
    tint(x, z, h, c) {
      // 川の両岸は田と葦の湿地（暗い緑と泥）。天王山の裾は濃い草
      const d = Math.abs(z - (-8 + x * 0.09));
      if (d < 20) { const k = 1 - d / 20; c.setRGB(c.r * (1 - 0.3 * k) + 0.06 * k, c.g * (1 - 0.2 * k) + 0.05 * k, c.b * (1 - 0.3 * k) + 0.02 * k); }
      const p = 0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05);
      c.multiplyScalar(0.84 + p * 0.22);
    },
    clear: (x, z) => x > -110 && x < 150 && z > -175 && z < 150,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (x < -100 ? 1 : x > 150 || z < -180 || z > 160 ? 0.6 : 0),
    fleeOut: (x, z, team) => (team === 1 ? z < -190 : z > 170),
  },

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 本陣（南）と明智の本陣（北・御坊塚あたり）。見た目だけ
    KIT.honjin(rt, -20, 140, { mon: 'oda', people: false, fire: false });
    KIT.honjin(rt, 0, -200, { mon: 'akechi', people: false, fire: false });
    shoryujiFront(rt);
    for (const [x, z] of [[-78, 38], [-60, 36], [-46, 32]]) rt.scene.add(nobori(rt.world, x, z, 'oda'));
    // 大軍は軽い作り：南に羽柴の本隊、北に明智の本隊、中ほどの川で押し合う
    // 戦う兵の通り道（陣・浅瀬・勝竜寺城の前）から離して置く
    F.hostA = farHost(rt, 30, 156, 80, 20, 200, Math.PI, HASHIBA, 1582);
    F.hostB = farHost(rt, -64, -178, 60, 20, 150, 0, AKECHI, 1613);
    F.clash = rt.world.addClash({ x: -10, z: -10, facing: Math.PI, w: 60, bw: 3, gap: 1.6, seed: 613, rt,
      play: (k, q, v) => rt.army.play(k, q, v), smoke: (x1, y1, z1, ax, az) => rt.army.smoke(x1, y1, z1, ax, az),
      noRout: true, noWake: true, killRate: 0.003, maxDrift: 0.8, host: false, corpses: 8, realNear: 0, nearHide: 0,
      A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: 60, flagRate: 0.2 },
      B: { flagTex: flagTexture(AKECHI.flag), armor: AKECHI.armor, count: 60, flagRate: 0.3 } });
    F.clash?.go?.();
    // 持ち場の先（中川・高山の前、円明寺川の手前）で、先に出た両軍の先手がもう斬り合う。始めの25秒のカメラの左前 40m に、前線を斜めに見せる（軽い作りだけ）
    F.near = toyoClash(rt, { x: -82, z: -4, facing: Math.PI - 0.55, w: 40, seed: 1585,
      A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: 140 }, B: { flagTex: flagTexture(AKECHI.flag), armor: AKECHI.armor, count: 140, guns: true } });
    // 前で支える中川・高山の隊（二人は史実で生き残るので討たれない）
    // 二つとも崩れれば負けなので、数で潰れるまで退かない（noRout）。負けは「名のある将のほかが三人を切る」で見る
    F.naka = allyGroup(rt, { name: '中川清秀の隊', anchor: { x: -82, z: 24 }, facing: Math.PI, width: 8, aggro: 14, morale: 90, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: false, flag: HASHIBA.flag } }, { type: 'samurai', n: 2, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 14, o: { flag: HASHIBA.flag } }]);
    F.taka = allyGroup(rt, { name: '高山右近の隊', anchor: { x: -54, z: 20 }, facing: Math.PI, width: 8, aggro: 14, morale: 90, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '高山右近', invuln: true, horse: false, flag: HASHIBA.flag } }, { type: 'samurai', n: 2, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 14, o: { flag: HASHIBA.flag } }]);
    // 主人公の付く池田勢
    F.ikeda = allyGroup(rt, { name: '池田恒興の隊', anchor: { x: -50, z: 84 }, facing: Math.PI, width: 8, aggro: 12, morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true, flag: IKEDA.flag } }, { type: 'samurai', n: 3, o: { flag: IKEDA.flag } }, { type: 'ashigaru', n: 14, o: { flag: IKEDA.flag } }]);
    // 秀吉の本陣（後ろ）と、天王山の裾を押さえる秀長・官兵衛の手（battle_events_1101：天王山をめぐる戦い）
    F.hide = allyGroup(rt, { name: '羽柴秀吉の本陣', anchor: { x: -28, z: 118 }, facing: Math.PI, width: 8, aggro: 6, seekRange: 10, morale: 99, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true, flag: HASHIBA.flag } }, { type: 'samurai', n: 3, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 6, o: { flag: HASHIBA.flag } }]);
    F.tenno = allyGroup(rt, { name: '羽柴秀長の隊', anchor: { x: -102, z: 34 }, facing: Math.PI, width: 8, aggro: 14, seekRange: 40, morale: 95, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true, flag: HASHIBA.flag } }, { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: false, flag: HASHIBA.flag } },
        { type: 'gun', n: 5, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 8, o: { flag: HASHIBA.flag } }]);
    // 戦の前の会話（筋書きの一枚の「前」）。本能寺の直後・毛利との講和・中国大返しを先に言う
    rt.after(0.5, () => rt.say('羽柴秀吉', '毛利と和を結び、備中から駆け通して来たぞ。上様の仇、日向を討つは今ぞ', 4.5));
    rt.after(5.5, () => rt.say('池田恒興', '上様の仇じゃ。川を渡れば、日向の横は空いておる', 4));
    rt.after(10, () => rt.say(nm(rt), 'この槍、そのために残しました', 3.5));
    rt.after(13.5, () => rt.say('池田恒興', 'まずは天王山の麓じゃ。中川・高山の前へ、明智の先手が来るぞ', 4));
    rt.after(14, () => this.stage1(rt));
  },

  // ① 天王山の麓の陣に入り、押してくる明智の先手を止める
  stage1(rt) {
    const F = rt.flags;
    F.step = 1;
    rt.obj('main', '天王山の麓の陣へ。明智の先手を止めよ', 'main');
    rt.marker('jin', JIN, '中川・高山の陣');
    F.ikeda.order = 'move'; F.ikeda.dest = { x: -64, z: 46 };
    F.wave1 = [
      enemyGroup(rt, { name: '松田政近の隊', faction: 'akechi', anchor: { x: -86, z: -52 }, facing: Math.PI, order: 'attack', aggro: 40, seekRange: 70, width: 10 },
        [{ type: 'busho', n: 1, o: { name: '松田政近', flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'samurai', n: 2, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 11, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]),
      enemyGroup(rt, { name: '並河易家の隊', faction: 'akechi', anchor: { x: -52, z: -46 }, facing: Math.PI, order: 'attack', aggro: 40, seekRange: 70, width: 10 },
        [{ type: 'busho', n: 1, o: { name: '並河易家', flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'samurai', n: 2, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 12, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]),
    ];
    for (const g of F.wave1) { g.order = 'move'; g.dest = { x: g.anchor.x + 10, z: 22 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; q.seekRange = 60; }; }
    F.w1n = F.wave1.reduce((s, g) => s + g.count, 0);
    rt.after(6, () => rt.say('中川清秀', '明智の先手が川を越えたぞ。ここで止めよ！', 3.5));
    // 天王山の取り合い：明智の一手が山へ取り付き、秀長・官兵衛の手が上から撃ち下ろす
    F.tennoFoe = enemyGroup(rt, { name: '明智の山の手', faction: 'akechi', anchor: { x: -108, z: -40 }, facing: Math.PI, order: 'attack', aggro: 30, seekRange: 60, width: 8 },
      [{ type: 'samurai', n: 1, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 7, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
    F.tennoFoe.order = 'move'; F.tennoFoe.dest = { x: -104, z: 20 }; F.tennoFoe.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; };
    rt.after(12, () => rt.say('黒田官兵衛', '天王山はこちらが押さえた。山の上から撃ち下ろせ', 3.5));
    rt.after(16, () => rt.say('明智光秀', '天王山を取られたか……。左馬助（秀満）は安土から間に合わぬ。ここで支えよ', 4));
  },
  // ② 池田勢と淀川沿いへ回り、円明寺川を渡る
  stage2(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.objDone('main');
    rt.award((t) => t.side.push('天王山の麓で明智の先手を止めた'), '天王山の麓で明智の先手を止めた');
    rt.unmark('jin'); rt.unmark('foe');
    rt.obj('main', '池田勢と淀川沿いへ。円明寺川を渡れ', 'main');
    rt.marker('ford', () => (F.fordSouth ? FORD_N : FORD_S), '淀川沿いの浅瀬');
    rt.say('池田恒興', '今じゃ。淀川沿いを回り、川を渡って日向の横を突く', 4);
    F.ikeda.order = 'move'; F.ikeda.dest = { ...FORD_S };
    F.ikeda.onArrive = (g) => { g.order = 'move'; g.dest = { ...FORD_N }; g.onArrive = null; };
    for (const g of [F.naka, F.taka]) { if (alive(g)) { g.order = 'hold'; } }
    // 北の岸の見張り（少し）
    F.bankGuard = enemyGroup(rt, { name: '明智の見張り', faction: 'akechi', anchor: { x: 94, z: -32 }, facing: 0, aggro: 14, seekRange: 24, width: 6 },
      [{ type: 'samurai', n: 1, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 4, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
  },
  // ③ 明智勢の横へ斬り込み、斎藤利三の隊を崩す
  stage3(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.objDone('main');
    rt.award((t) => t.side.push('円明寺川を渡った'), '円明寺川を渡った');
    rt.unmark('ford');
    rt.obj('main', '明智の横へ斬り込め。斎藤利三の隊を崩せ', 'main');
    F.saito = enemyGroup(rt, { name: '斎藤利三の隊', faction: 'akechi', anchor: { ...SAITO }, facing: -Math.PI / 2 + 0.4, aggro: 30, seekRange: 50, width: 12, morale: 80 },
      [{ type: 'busho', n: 1, o: { name: '斎藤利三', flag: AKECHI.flag, armor: AKECHI.armor, horse: true } }, { type: 'samurai', n: 4, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 18, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
    F.ise = enemyGroup(rt, { name: '伊勢貞興の隊', faction: 'akechi', anchor: { x: 28, z: -34 }, facing: Math.PI, aggro: 16, seekRange: 26, width: 10 },
      [{ type: 'busho', n: 1, o: { name: '伊勢貞興', flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 10, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
    F.saiN = F.saito.count;
    F.ikeda.order = 'attack'; F.ikeda.aggro = 40; F.ikeda.seekRange = 60; F.ikeda.focus = F.saito.leader || null;
    // 大軍で圧す：中ほどから堀秀政の隊が押し出し、川の押し合いも羽柴勢へ傾く
    F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: 6, z: 30 }, facing: Math.PI, width: 10, aggro: 30, seekRange: 50, morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true, flag: HASHIBA.flag } }, { type: 'samurai', n: 2, o: { flag: HASHIBA.flag } }, { type: 'ashigaru', n: 12, o: { flag: HASHIBA.flag } }]);
    F.hori.order = 'move'; F.hori.dest = { x: 26, z: -30 }; F.hori.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; };
    F.clash?.push?.('A', 0.6);
    rt.after(6, () => rt.say('堀秀政', '本隊も川を越えるぞ。四万で押し包め！', 3.5));
    rt.marker('foe', () => (F.saito.leader?.alive ? F.saito.leader.pos : F.saito.center()), '斎藤利三', { red: true, group: F.saito });
    rt.say('使番', '池田勢、川を渡りきった！　明智の横が空いておるぞ', 3.5);
    rt.after(4, () => rt.say('斎藤利三', '横じゃと……！　槍を返せ、返せ！', 3));
  },
  // ④ 逃げる明智勢を追い、勝竜寺城の前の光秀の本隊を崩す（勝ち＝光秀軍を崩す）
  stage4(rt) {
    const F = rt.flags;
    F.step = 4;
    rt.objDone('main');
    rt.award((t) => t.side.push('斎藤利三の隊を崩した'), '斎藤利三の隊を崩した');
    rt.unmark('foe');
    rt.obj('main', '明智勢を追え。勝竜寺城の前の光秀の本隊を崩せ', 'main');
    rt.banner('明智勢が崩れた', '光秀の本隊へ');
    for (const g of rt.army.groups) if (g.team === 1 && alive(g) && g !== F.rear) { g.routed = true; g.order = 'flee'; }
    F.clash?.push?.('A', 1); F.clash?.shake?.('B', 30);
    F.hostB?.moveTo?.(0, -215, 6, { back: true });
    // 光秀の本隊（勝竜寺城の前）。光秀はここでは討たれず、崩れて城へ退く（最期は小栗栖）
    F.mitsu = enemyGroup(rt, { name: '明智光秀の本隊', faction: 'akechi', anchor: { x: SHORYUJI.x - 6, z: SHORYUJI.z + 8 }, facing: 0, aggro: 26, seekRange: 36, width: 12, morale: 85 },
      [{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: true, flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'samurai', n: 3, o: { flag: AKECHI.flag, armor: AKECHI.armor } },
        { type: 'gun', n: 4, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 10, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
    F.mitN = F.mitsu.count;
    rt.marker('castle', () => (F.mitsu.leader?.alive ? F.mitsu.leader.pos : SHORYUJI), '明智光秀', { red: true, group: F.mitsu });
    rt.after(3, () => rt.say('明智光秀', 'ここで踏みとどまれ。城へは入れさせぬ', 3.5));
    F.rear = enemyGroup(rt, { name: '明智の殿', faction: 'akechi', anchor: { x: 30, z: -122 }, facing: Math.PI, aggro: 22, seekRange: 34, width: 10 },
      [{ type: 'samurai', n: 2, o: { flag: AKECHI.flag, armor: AKECHI.armor } }, { type: 'ashigaru', n: 8, o: { flag: AKECHI.flag, armor: AKECHI.armor } }]);
    F.ikeda.order = 'move'; F.ikeda.dest = { x: SHORYUJI.x, z: SHORYUJI.z + 14 }; F.ikeda.focus = null;
    F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('castle');
    rt.award((t) => { t.main = true; t.special = { label: '円明寺川を渡り、明智の横を崩した', pts: 20 }; }, '光秀の本隊を崩した');
    rt.banner('山崎の戦い　勝ち', '光秀の本隊が崩れ、光秀は勝竜寺城へ退いた');
    rt.player.u.invuln = true;
    if (alive(F.mitsu)) { F.mitsu.routed = true; F.mitsu.order = 'flee'; }
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
    if (F.step <= 3 && broken(F.naka) && broken(F.taka)) { this.lose(rt, '前で支える中川・高山の隊が崩れた'); return; }
    // 池田勢は主人公と離れず渡る（一人で浅瀬の見張りに囲まれない）。行き先は離れた時だけ据え直す
    if (F.step >= 2 && alive(F.ikeda) && (F.escT = (F.escT || 0) - dt) <= 0) {
      F.escT = 0.5;
      const c = F.ikeda.center(), far = c && Math.hypot(c.x - P.x, c.z - P.z) > 12;
      if (far && (!F.ikeda.dest || Math.hypot(F.ikeda.dest.x - P.x, F.ikeda.dest.z - P.z) > 7)) {
        F.ikeda.order = 'move'; F.ikeda.dest = { x: P.x, z: P.z + 3 }; F.ikeda.focus = null;
        F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; g.seekRange = 40; };
      }
    }
    if (F.step === 1) {
      const left = F.wave1.reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
      F.ek = F.w1n - left;
      const foe = F.wave1.find(alive);
      if (foe && !F.foeMarked && near(P, JIN, 30)) { F.foeMarked = true; rt.marker('foe', centerOf(foe), '明智の先手', { red: true, group: foe }); }
      if (F.foeMarked && foe && !alive(F.markedFoe)) { F.markedFoe = foe; rt.marker('foe', centerOf(foe), '明智の先手', { red: true, group: foe }); }
      rt.objProgress('main', `${Math.max(0, left - Math.round(F.w1n * 0.3))}`);
      if (left <= F.w1n * 0.3) { for (const g of F.wave1) if (alive(g)) { g.routed = true; g.order = 'flee'; } this.stage2(rt); }
    } else if (F.step === 2) {
      // 浅瀬に着いて池田勢が渡り始めたら、横を突く段へ（斎藤の隊は向こう岸。渡るのは追う途中）
      if (!F.fordSouth && near(P, FORD_S, 16)) { F.fordSouth = true; F.fordT = rt.t; }
      //   浅瀬のほかで川を越えても、渡ったと見る（川の中で迷って日を暮らさない）
      if ((P.z < -14 && P.x > 55) || (F.fordSouth && rt.t - F.fordT > 6) || (P.x > 0 && P.z < riverZ(P.x) - 6)) this.stage3(rt);
    } else if (F.step === 3) {
      const n = alive(F.saito) ? F.saito.count : 0;
      rt.objProgress('main', `${Math.max(0, n - Math.round(F.saiN * 0.25))}`);
      if (n <= F.saiN * 0.25 || !F.saito.leader?.alive) this.stage4(rt);
    } else if (F.step === 4) {
      // 光秀の本隊を崩せば勝ち（四分の一を切るか、崩れる）
      const n = alive(F.mitsu) ? F.mitsu.count : 0;
      rt.objProgress('main', `${Math.max(0, n - Math.round(F.mitN * 0.3))}`);
      if (n <= F.mitN * 0.3 || broken(F.mitsu)) this.win(rt);
    }
  },
};

// bot：近い敵（逃げる者は追わない）を突き、いなければ段の行き先へ。四十歩先の敵や逃げる明智勢を追って浅瀬から外れない
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
  const lead = (g) => (g?.leader?.alive ? g.leader.pos : alive(g) ? g.center() : null);
  let t = JIN;
  if (F.step === 1) t = (F.foeMarked && lead(F.wave1.find(alive))) || JIN;
  else if (F.step === 2) t = F.fordSouth || u.pos.z < riverZ(u.pos.x) + 4 ? FORD_N : FORD_S;   // 川へ下りたら引き返さず向こう岸へ
  else if (F.step === 3) t = lead(F.saito) || SAITO;
  else if (F.step === 4) t = lead(F.mitsu) || SHORYUJI;
  goTo(p, inp, t.x, t.z, 2.5);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t01_yamazaki);

export { t01_yamazaki };
