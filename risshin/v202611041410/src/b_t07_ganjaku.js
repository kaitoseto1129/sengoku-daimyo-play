// ======================================================================
// 豊臣編 7 戦目：岩石城攻め（天正十五年・1587）。戦の型は「高速攻城」（docs/chapter2_toyotomi.md 7章）。
// 秀吉の本隊が九州へ入り、秋月方の岩石城（豊前・岩石山 454m）を蒲生氏郷・前田利長らが一日で落とす。
// 主人公は蒲生の先手と並び、大手の坂を登る（前田勢は搦手から）。日が沈むと負け（6分半ほど）。
// 段（山中城の型・docs/kaito_refs_1103）：1 大手の坂を登る（塀の狭間と矢倉から矢と鉄砲）→ 2 門から打って出た秋月勢（芥田悪六兵衛）を迎え撃つ →
//   3 退く秋月勢を追い、門が閉まる前に城内へ（付け入り。閉まれば味方が掛矢で破る）→ 4 本丸へ攻め入り、城将の熊井越中守を討つ。
// 地形：国土地理院の標高（asset_dem_ganjaku.js・岩石山の頂を原点に ±400m・5m 間隔）。ゲームの 1 は実の 1.4m。
// 部品：門と塀と狭間の射撃は siege_kit（def.siegeKit）、兵は bhelp の enemyGroup・allyGroup。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { siegePlan, siegeHeight } from './siege_kit.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { closeGate } from './siege_gate.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import * as THREE from 'three';
import { hashigo, nobori, jinmaku, yagura, castleBoardFence, hut, solidCircle, solidSeg, solidRect } from './props.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';

// この戦の標高を支度で読ませる（共通の表は触らず、ここで一行足す）
BATTLE_ASSETS.t07_ganjaku = Object.freeze([...assetsForBattle(''), 'dem_ganjaku']);
let dem = null;
useTerrain('dem_ganjaku', (d) => { dem = d; });

const XY = 1.4;      // ゲームの 1 が実の何 m か
const SC = 0.4;      // 実の高さを縮める率（実の比高 270m → 約 100m。坂を登れる傾きに）
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 置き場（x=東+、z=南+。頂が原点。大手は南西の尾根）
const SPAWN = { x: -134, z: 134 };   // 坂の下から二の丸の門と塀・矢倉が見える所（-150,150 では門が霧の奥で写らなかった）
const GATE = { x: -56, z: 56 };                  // 二の丸の門（喰違の虎口）
const ROT = -Math.PI / 4;                         // 門の外向き＝南西
const YAGURA = { x: -24, z: 30 };                 // 岩の上の矢倉
const HON = { x: 0, z: 0 };                       // 本丸（頂）
const HONF = { x: HON.x - 9, z: HON.z + 9 };       // 本丸の大手の口の前（退いた守りが寄る所）
const KARA_OUT = { x: 70, z: -70 }, KARA_IN = { x: 26, z: -26 };   // 搦手（北東の尾根）の寄せ手の持ち場と、本丸の下の搦手の口
const ROAD = [[SPAWN.x, SPAWN.z], [-122, 124], [-96, 98], [-76, 76], [-60, 64]];
const ROAD_IN = [[-60, 50], [-46, 40], [-30, 30], [-14, 14], [0, 0]];
const SP = siegePlan({ x: GATE.x, z: GATE.z, rot: ROT, W: 16, koguchi: 'kuichigai', yokoya: false, moat: false, umadashi: false, sakamogi: false, shiyori: false, kirigishi: 0 });   // 切岸の段は山の斜面そのもの（1m の段を足すと門の前で寄せ手が詰まる）
const SIEGE_H = siegeHeight(SP);
// 門の外の口・門の前・門の内（喰違：外から右へ回り込み、横の筋の門を抜けて城の内へ）
const pt = (a, b) => { const [x, z] = SP.L(a, b); return { x, z }; };
const MOUTH = pt(5.5, 7), FRONT = pt(5.5, -3), INSIDE = pt(-6, -3), INNER = pt(-6, -14);
// 門の周りの居場所：'out' 塀の外・'rec' 門の前の窪み・'lane' 門の横の筋・'in' 塀の内（門から 26m の外は null）
const gl = (x, z) => { const dx = x - GATE.x, dz = z - GATE.z; return [dx * SP.px + dz * SP.pz, dx * SP.ux + dz * SP.uz]; };
function gateZone(x, z) {
  const [a, b] = gl(x, z);
  if (Math.abs(a) > 20 || b > 26 || b < -22) return null;
  if (a > 3.6 && a < 16 && b > -6.2 && b <= 0.5) return 'rec';
  if (a >= -3.2 && a <= 3.6 && b > -6.2 && b < -0.3) return 'lane';
  return b > 0 ? 'out' : 'in';
}
const wantInside = (q) => gl(q.x, q.z)[1] < 0;
// 梯子を掛ける岩肌（門の両脇の塀の外。足は外、上は塀の上）
const LAD = [[-12, 3.2, -12, 0.3], [-16, 3.4, -16, 0.3], [14, 3.2, 14, 0.3]].map(([a, b, c, d]) => ({ foot: pt(a, b), top: pt(c, d) }));

// 竪堀の筋（大手の南西から左右へ二十八度ずつ開いた二筋）
const TATE = [-1, 1].map((k) => { const a = 3 * Math.PI / 4 + k * 0.49; return { x: Math.cos(a), z: Math.sin(a) }; });
// 手書きの山（標高が読めない時）：頂を原点に、南西の尾根を緩く
function base(x, z) {
  const r = Math.hypot(x, z), ridge = Math.max(0, (-x + z) / Math.SQRT2) / Math.max(1, r);
  return 100 * Math.exp(-((r / 170) ** 2)) * (1 - 0.25 * ridge) + 6;
}
function raw(x, z) {
  if (!dem) return base(x, z);
  return demSample(dem, x * XY, z * XY) * SC;
}
// 道は両脇の高さをならし、曲輪は平らに削る
function shaped(x, z) {
  let h = raw(x, z);
  const dr = Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, ROAD_IN));
  if (dr < 9) {
    const s = (raw(x + 4, z) + raw(x - 4, z) + raw(x, z + 4) + raw(x, z - 4)) / 4;
    h += (s - h) * (1 - sstep(4, 9, dr)) * 0.8;
  }
  const flat = (c, r, k = 1) => { const d = Math.hypot(x - c.x, z - c.z); if (d < r + 8) h += (raw(c.x, c.z) - h) * (1 - sstep(r, r + 8, d)) * k; };
  flat(HON, 14);
  flat({ x: -40, z: 40 }, 12, 0.85);
  // 縄張り（docs/battle_refs/t07_ganjaku.md）：本丸の下の北・東・南の尾根を横堀・堀切で断つ（大手の南西だけ残す）
  const r = Math.hypot(x, z), sw = r > 1 ? (z - x) / (Math.SQRT2 * r) : 1;
  h -= 4 * Math.exp(-(((r - 37) / 2.6) ** 2)) * (1 - sstep(0.3, 0.62, sw));
  // 大手の坂の両脇に竪堀を落とし、寄せ手を坂の一筋へ絞る
  if (r > 40 && r < 160) for (const a of TATE) {
    const d = Math.abs(x * a.z - z * a.x);
    if (d < 5) h -= 2.6 * Math.exp(-((d / 1.7) ** 2)) * sstep(40, 52, r) * (1 - sstep(130, 158, r));
  }
  return h;
}
const height = (x, z) => shaped(x, z) + SIEGE_H(x, z);

// 坂と門の段（時との勝負）は寄せの小勢を出さない。城の内へ入ってから乱戦（frontline_density の alwaysMelee を段で切り替える）
let CALM = true;
const T_LIMIT = 400;   // 日が沈むまで（6分半ほど。矢倉と本丸で斬り合う時を残す）
const KIRI = 0x2a2420, AKI = 0x2e2a26;

const t07_ganjaku = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.atan2(GATE.x - SPAWN.x, GATE.z - SPAWN.z) },
  camLookAt: (rt, u) => ((rt.flags.stage || 0) <= 1 ? { x: GATE.x, z: GATE.z, up: 3 } : null),   // 坂の下では目線を上げ、上の門と塀を見せる
  noReserve: true, noWake: true, noTaishoRaid: true, noDespair: true,
  // 行き先は黄色の印一つだけ（ついていく相手の青い印は出さない）。敵は頭上の▼で分かる（kaito AG・AT・AV15）
  noLeaderFollow: true, enemyTriangleSigns: true,
  // 行き先は頭上の金の▼一つ（ピン・旗の輪・矢印を重ねない）。目標は段の四つだけ（「敵を何人討つ」で埋めない。kaito AR1・AW3・BH6）
  goalSignOnly: true, stageGoalsOnly: true,
  goalSignAction: (rt) => ['', '門の前へ進め', '坂で迎え撃て', '門の内へ入れ', '本丸へ攻め入れ'][rt.flags.stage || 0] || '',
  // 奥の軽い作りの乱戦（見せかけの軍勢）は置かない。戦うのは場にいる本物の兵だけ（kaito AP9・AQ6・⑥）
  noFrontFill: true,
  camPull: 4.5,   // 11/2 カメラが兵に寄りすぎ：後ろへ引いて、坂の上の城と味方の列を一緒に写す
  // 部将として先頭を駆ける戦。受ける傷を六割に、戦っていない間は少しずつ息が戻る
  playerTaken: 0.6, playerRegen: 0.02,
  // 乱戦の濃さは控えめに（段の的の隊は寄せに引き抜かない）
  // 坂と門の段は時との勝負なので寄せの小勢を出さない（城の内へ入ってから乱戦）
  get alwaysMelee() { return CALM ? false : undefined; },
  frontlineDensity: { strength: 0.8, active: (rt) => (rt.flags.stage || 0) >= 3, canSend: (rt, g) => !g.noFrontline },
  world: {
    seed: 158704, time: 'day', muddy: 0.05, terrainTags: true,
    groundHalf: 260, moveLim: 250,
    paths: [ROAD, ROAD_IN],
    height,
    // 岩の多い山：高い所と急な所ほど岩肌の灰に寄せる
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.09 - x * 0.05) + 0.5 * Math.sin(x * 0.37 + z * 0.29);
      const k = clamp((h - 60) / 50, 0, 1) * 0.5 + clamp((n - 0.3) / 0.7, 0, 1) * 0.35;
      c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.40 * k, c.b * (1 - k) + 0.36 * k);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 7 || distToPolyline(x, z, ROAD_IN) < 7 || Math.hypot(x - HON.x, z - HON.z) < 22 || Math.hypot(x - GATE.x, z - GATE.z) < 24,
    trees: 380, tufts: 1200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 16 ? 0.3 : Math.hypot(x, z) > 60 ? 1.2 : 0.5),   // 大手の坂の脇はまばらに（麓から二の丸の門と塀が見える）
    fleeOut: (x, z, team) => team === 1 && Math.hypot(x, z) > 200,
    // 兵の歩みを喰違の筋に沿わせる（門の外 → 門の前の窪み → 横の筋の門 → 門の内）。塀に向かってまっすぐ押し続けない
    moveWay: (army, u, want) => {
      const k = gateZone(u.pos.x, u.pos.z);
      if (!k) return want;
      const w = gateZone(want.x, want.z) || (Math.hypot(want.x - GATE.x, want.z - GATE.z) > 30 ? (wantInside(want) ? 'in' : 'out') : null);
      if (!w || w === k) return want;
      const inward = w === 'in' || (w === 'lane' && k !== 'in') || (w === 'rec' && k === 'out');
      if (inward) {
        if (k === 'out') { const a = gl(u.pos.x, u.pos.z)[0]; return w === 'rec' ? want : a > 3.8 && a < 15 ? FRONT : MOUTH; }
        return k === 'rec' ? INSIDE : INNER;
      }
      return k === 'in' ? INSIDE : k === 'lane' ? FRONT : k === 'rec' ? MOUTH : want;
    },
  },
  // 二の丸の門・塀・狭間の射撃（siege_kit）。守り手の矢と鉄砲は門へ近づくほど激しい
  siegeKit: { plan: SP, build: { team: 1, wall: 'dobei', gateHp: 260, fire: { hurt: 0.022, rain: 0.35, peak: 4, near: 60 } }, when: (rt) => (rt.flags.stage || 0) <= 1 },   // 門が開いて打って出た後は、狭間から味方越しに撃たない

  setup(rt) {
    const F = rt.flags;
    CALM = true;
    F.stage = 0; F.ending = false; F.ek = 0; F.ak = 0; F.t0 = rt.t; F.stageT = rt.t; F.honT = 0;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const W = rt.world, faceUp = Math.atan2(GATE.x - SPAWN.x, GATE.z - SPAWN.z);

    // ---- 攻め手（docs/battle_refs/t07_ganjaku.md）：大手は蒲生、搦手は前田。秀吉は馬ヶ岳の本陣にいて、この山には来ない ----
    // 蒲生の先手（主人公はこの列と坂を登る）。対い鶴の蒲生の旗は鶴の紋で代える
    F.gamo = allyGroup(rt, { name: '蒲生の先手', faction: 'oda', flag: 'tsuru', anchor: { x: SPAWN.x + 6, z: SPAWN.z - 4 }, facing: faceUp, width: 8, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 1, o: { name: '蒲生の侍大将' } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 40 }, { type: 'bow', n: 5 }, { type: 'gun', n: 6 }]);
    F.gamo2 = allyGroup(rt, { name: '蒲生の二番手', faction: 'oda', flag: 'tsuru', anchor: { x: SPAWN.x - 8, z: SPAWN.z + 8 }, facing: faceUp, width: 8, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 30 }, { type: 'gun', n: 4 }]);
    F.allies = [F.gamo, F.gamo2];
    // 搦手（北東の尾根）から寄せる前田勢。本丸の段で搦手の守りを破って本丸へ入る
    F.maeda = allyGroup(rt, { name: '前田勢', faction: 'oda', flag: 'maeda', anchor: { ...KARA_OUT }, facing: Math.atan2(-KARA_OUT.x, -KARA_OUT.z), width: 8, aggro: 12, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '前田利長', horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 30 }, { type: 'gun', n: 4 }]);   // 利長は馬上で旗本の侍に囲まれる
    // 麓の蒲生の本陣：大手の大将の蒲生氏郷は旗本の侍に囲まれ、坂の下の幕の前で床几に座り、前に出ない
    F.honjin = allyGroup(rt, { name: '蒲生の本陣', faction: 'oda', flag: 'tsuru', anchor: { x: -168, z: 168 }, facing: faceUp, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '蒲生氏郷', invuln: true, horse: false, armor: KIRI } }, { type: 'samurai', n: 18 }, { type: 'gun', n: 4 }]);
    F.honjin.noFrontline = true;
    for (const u of F.honjin.units) if (u.name === '蒲生氏郷') u.jinchu = {};   // 座ったまま下知する
    try {
      rt.scene.add(jinmaku(W, -174, 174, 14, 9, 3, { mon: 'tsuru' }));
      for (const [x, z] of [[-160, 176], [-176, 160], [-182, 184], [-150, 186]]) rt.scene.add(nobori(W, x, z, 'tsuru', 7));
    } catch (e) { console.warn(e); }
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z + 3 }, faceUp, [{ kind: 'spear', n }]);
    // 二の丸の門の左右の櫓・岩の上の矢倉・大手の坂の上の西の尾根の物見櫓。坂の下から尾根の上に城の櫓が並んで見える
    { const n0 = rt.scene.children.length;
      try {
        for (const [x, z] of [[-45.4, 59.6], [-59.6, 45.4], [YAGURA.x, YAGURA.z]]) rt.scene.add(yagura(W, x, z, { mon: 'maru', team: 1 }));
        for (const [x, z] of [[-98, 64], [-84, 54]]) rt.scene.add(yagura(W, x, z, { mon: 'maru' }));   // 西の尾根の物見櫓は空（寄せ手が登れない櫓の上の一人に足止めされない）
      } catch (e) { console.warn(e); }
      farSight(rt.scene.children.slice(n0), { W, ground: { x: -40, z: 40, r: 60 } });
      // 門・塀（siege_kit は作りの後に組む）も霧に沈めない
      const n1 = rt.scene.children.length; rt.after(0.05, () => farSight(rt.scene.children.slice(n1), { W, near: { x: GATE.x, z: GATE.z, r: 40 } })); }

    this.nawabari(rt);

    // ---- 城方：秋月方の三千（大手は芥田悪六兵衛、搦手と本丸は城将の熊井越中守）----
    const foe = (name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'oda', flag: 'maru', armor: AKI, anchor: { x: at.x, z: at.z }, facing: faceUp + Math.PI, order: 'hold', aggro: 9, width: 4, ...o }, list);
    F.slope = [
      foe('坂の守り', { x: -100, z: 102 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }]),
      foe('坂の上の弓', { x: -80, z: 80 }, [{ type: 'bow', n: 4 }, { type: 'ashigaru', n: 3 }]),
    ];
    // 門の内で打って出る機を待つ芥田の手（段2で門を開けて坂へ突いて出る）
    F.sally = foe('芥田の手', INNER, [{ type: 'busho', n: 1, o: { name: '芥田悪六兵衛', horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 18 }], { aggro: 6, width: 6 });
    F.gateGuard = foe('門の守り', { x: INNER.x + 6, z: INNER.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { aggro: 7 });
    F.yagura = foe('矢倉の射手', YAGURA, [{ type: 'bow', n: 4 }, { type: 'gun', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], { aggro: 8 });
    F.kara = foe('搦手の守り', KARA_IN, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], { facing: Math.atan2(KARA_OUT.x, KARA_OUT.z), aggro: 9 });
    // 本丸：城将の熊井越中守は旗本に囲まれて本丸の奥にいる（陣を割らないと届かない）
    F.hon = foe('本丸の守り', { x: HON.x - 3, z: HON.z - 9 }, [{ type: 'busho', n: 1, o: { name: '熊井越中守', horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], { aggro: 8, width: 6 });
    F.foes = [...F.slope, F.sally, F.gateGuard, F.yagura, F.kara, F.hon];
    for (const g of [F.sally, F.gateGuard, F.yagura, F.kara, F.hon]) g.noFrontline = true;
    F.hon.noRout = true;   // 本丸の守りは崩れて逃げない（熊井越中守は本丸で討死した）

    rt.setPhase('brief');
    rt.say('蒲生氏郷', '殿下の命じゃ。島津に付いた秋月の岩石城を、今日のうちに落とす', 3.6);
    rt.after(3.9, () => rt.say(rt.G.name || '主人公', '一日で？　この岩山を', 2.4));
    rt.after(6.6, () => rt.say('蒲生氏郷', '大手は我ら、搦手は前田殿。先手は坂を登り、門の前へ出よ', 3.6));
    rt.after(10.4, () => this.go(rt, 1));
  },

  // 岩石山の巨岩と本丸の囲い（docs/battle_refs/t07_ganjaku.md。天守は無い中世の山城）
  nawabari(rt) {
    const W = rt.world;
    try {
      // 本丸：頂を板塀で囲む（南西の大手と北東の搦手の筋に口）。塀の内に掘立の小屋と秋月方の旗
      const R = 15, N = 12;
      for (let i = 0; i < N; i++) {
        const a0 = 3 * Math.PI / 4 + (i - 0.5) * 2 * Math.PI / N, a1 = a0 + 2 * Math.PI / N;
        if (i === 0 || i === 6) continue;   // 南西の大手と北東の搦手に口
        const seg = [Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R];
        rt.scene.add(castleBoardFence(W, seg, { h: 2.4 }));
        Object.assign(solidSeg(...seg, 0.15), { missileH: 2.4, missileType: 'wood' });
      }
      rt.scene.add(hut(W, 6, -6, 7, 4.5, Math.PI / 4, { solid: false }));
      solidRect(6, -6, 7, 4.5, Math.PI / 4);
      for (const [x, z] of [[-9, -6], [9, 7], [2, -12]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    } catch (e) { console.warn(e); }
    // 巨岩：本丸の縁・国見岩・大手の坂の両脇・上の斜面。坂と門と段の行き先は空ける
    const keep = [[SPAWN, 16], [GATE, 30], [YAGURA, 12], [{ x: -168, z: 168 }, 34], [{ x: -98, z: 64 }, 8], [{ x: -84, z: 54 }, 8], [INNER, 10], [{ x: -84, z: 112 }, 10], [{ x: -112, z: 132 }, 10], [KARA_IN, 10], [{ x: 16, z: -16 }, 9], [{ x: 46, z: -46 }, 9], [KARA_OUT, 12], ...LAD.map((l) => [l.foot, 6])];
    const free = (x, z, s) => distToPolyline(x, z, ROAD) > 8 + s && distToPolyline(x, z, ROAD_IN) > 9 + s && keep.every(([c, r]) => Math.hypot(x - c.x, z - c.z) > r + s);
    const list = [[15, -19, 8]];   // 国見岩（頂の東）
    let seed = 1587;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {   // 本丸の縁（南西の口を残す）
      const a = 3 * Math.PI / 4 + 0.7 + i * (2 * Math.PI - 1.4) / 17, r = 20 + rnd() * 5;
      list.push([Math.cos(a) * r, Math.sin(a) * r, 3 + rnd() * 3]);
    }
    // 大手の坂の両脇の岩の壁（「切り立った岩の間の坂」。坂の筋は空ける）
    for (let k = 1; k < ROAD.length; k++) {
      const [ax, az] = ROAD[k - 1], [bx, bz] = ROAD[k], len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      for (let u = 0; u < len; u += 8) for (const side of [-1, 1]) {
        const s = 2.4 + rnd() * 2.6, off = 8.6 + s + rnd() * 3;
        list.push([ax + tx * u - tz * off * side, az + tz * u + tx * off * side, s]);
      }
    }
    for (let i = 0; i < 400 && list.length < 120; i++) {   // 大手の坂の両脇と上の斜面
      const a = 3 * Math.PI / 4 + (rnd() - 0.5) * (i % 3 ? 0.8 : 3.6), r = 30 + rnd() * 120;
      list.push([Math.cos(a) * r, Math.sin(a) * r, 1.6 + rnd() * rnd() * 5]);
    }
    const rocks = list.filter(([x, z, s], i) => i === 0 || (Math.hypot(x, z) > 17 + s && free(x, z, s)));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, color: 0xffffff, emissive: 0x4f4a42, emissiveIntensity: 0.3 });   // 岩石山の白っぽい花崗岩
    const mesh = new THREE.InstancedMesh(rockShape(1, false, 2), mat, rocks.length);
    const pose = new THREE.Object3D();
    rocks.forEach(([x, z, s], i) => {
      pose.position.set(x, W.heightAt(x, z) - s * 0.15, z);
      pose.rotation.set(0.25 * Math.sin(i * 1.7), i * 2.3, 0.2 * Math.cos(i * 0.9));
      pose.scale.set(s * (i % 3 === 0 ? 1.3 : 1.0), s * (i % 2 ? 1.7 : 1.3), s * 0.85);   // 角ばって立つ花崗岩
      pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      if (s > 2) Object.assign(solidCircle(x, z, s * 0.9), { missileH: s, missileType: 'dust' });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    try { groundRocks(W, mesh); } catch (e) { console.warn(e); }
    rt.scene.add(mesh);
  },

  // 段を進める
  go(rt, s) {
    const F = rt.flags;
    if (F.ending || F.stage >= s) return;
    F.stage = s; F.stageT = rt.t; CALM = s < 2;
    // 段の変わり目で息を整える（一つの段の傷を次の段へ持ち越しすぎない）
    const pu = rt.player.u; if (pu.alive && s > 1) pu.hp = Math.max(pu.hp, pu.maxHp * 0.7);
    rt.unmark('t07');
    // 味方の隊は持ち場を前へ移すだけ（兵は走って付いてくる。出し直さない）
    const A = (x, z) => { for (const g of F.allies) if (!g.routed) this.to(g, { x, z }); };
    if (s === 1) {
      F.t0 = rt.t;   // 日が沈むまでの時は、坂へ懸かってから数える
      rt.setPhase('assault');
      rt.obj('main', '大手の坂を登り、二の丸の門の前へ出る', 'main');
      rt.marker('t07', MOUTH, '二の丸の門', { h: 3 });
      F.lead = 0;   // 蒲生の先手は自分と並んで坂を駆け上がる（update で坂の上へ持ち場を送る）
    } else if (s === 2) {
      rt.award((t) => t.side.push('大手の坂を一番に登った'), '大手の坂を一番に登った');
      rt.obj('main', '門から打って出た秋月勢を坂で迎え撃つ', 'main');
      A(MOUTH.x - 7, MOUTH.z + 13);   // 寄せ手は櫓の真下に留まらず、門から坂へ出て来る秋月勢を少し下で受ける
      this.to(F.maeda, { x: 44, z: -44 });   // 搦手でも前田勢が寄せる
      // 門が開き、芥田の手が喰違の筋を抜けて坂へ突いて出る（山中城の馬出しの出撃の型）
      this.gateOpen(rt);
      const g = F.sally;
      g.aggro = 2; g.noRout = true; g.speed = (g.speed || 2.2) * 1.4;
      F.sw = { route: [INSIDE, FRONT, MOUTH, { x: MOUTH.x - 8, z: MOUTH.z + 12 }], i: 0, aggro: 14 };
      this.walk(g, F.sw, rt.t);
      rt.marker('t07', MOUTH, '芥田の手', { h: 3, red: true });
      rt.say('蒲生の侍大将', '門が開いた！　打って出て来るぞ。坂で受け止めよ', 3.2);
      sfx('wood', 0.8);
    } else if (s === 3) {
      rt.award((t) => t.side.push('打って出た秋月勢を退けた'), '打って出た秋月勢を退けた');
      rt.obj('main', '退く秋月勢を追い、開いた門から城内へ入る', 'main');
      rt.marker('t07', INSIDE, '二の丸の門', { h: 3 });
      // 芥田の手は門の内へ駆け戻る。追いすがれば門は閉まらない（付け入り）
      const g = F.sally;
      // 支えきれず背を向けて城の奥（本丸の方）へ崩れ退く。振り返って斬り合わない（追い討ちされる側）
      const fx = HON.x - GATE.x, fz = HON.z - GATE.z, fl = Math.hypot(fx, fz);
      F.sw = null;
      // 坂に残った守りも、門の前が崩れたのを見て城の奥へ逃げ込む
      for (const q of [g, ...F.slope]) if (!q.routed) { q.noRout = false; q.fleeSet = true; q.fleeDir = { x: fx / fl, z: fz / fl }; q.morale = 0; }
      for (const ga of F.allies) this.march(rt, ga, [MOUTH, FRONT, INSIDE], 14);
      rt.say('蒲生の侍大将', '引くぞ！　門が閉まる前に、追って城内へ紛れ込め！', 3.2);
    } else if (s === 4) {
      rt.award((t) => t.side.push(F.tsukeiri ? '退く敵に付け入って門を抜けた' : '二の丸の門を抜けた'), F.tsukeiri ? '退く敵に付け入って門を抜けた' : '二の丸の門を抜けた');
      rt.obj('main', '本丸へ攻め入り、熊井越中守を討つ', 'main');
      rt.marker('t07', HON, '本丸', { h: 3 });
      // 門の脇の塀は押し倒され、大手の寄せ手は本丸の口へなだれ込む（喰違の細い筋に詰まらない）
      this.breach(rt); F.walks = [];
      for (const ga of F.allies) { ga.noFrontline = true; this.march(rt, ga, [MOUTH, FRONT, INSIDE, INNER, { x: HON.x - 5, z: HON.z + 7 }], 14); }
      F.maeda.noFrontline = true;
      this.to(F.maeda, { x: HON.x + 6, z: HON.z - 6 });   // 搦手を破った前田勢も本丸へ
      rt.say('蒲生の侍大将', '城内じゃ！　岩の上の矢倉に構うな、本丸の熊井を討て', 3.2);
      rt.after(4, () => { if (F.stage === 4) rt.say('前田利長', '搦手は破った！　本丸で落ち合おうぞ', 3); });
    }
  },
  // 隊の持ち場を移す（歩かず走って寄せる）
  to(g, at) {
    if (!g || g.routed) return;
    g.anchor.x = at.x; g.anchor.z = at.z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null;
  },
  // 道筋に沿って列で進ませる（隊の道筋 order 'path'。狭い喰違の筋では列の幅を詰め、遅れを待つ。塀を突き抜けない）
  walk(g, w, t) {
    if (!g || g.routed) return;
    g.order = 'path'; g.path = w.route.slice(w.i).map((q) => [q.x, q.z]); g.pathIdx = 0; g.dest = null; g.focus = null;
    g.formation = 'column'; w.t0 = t; g.aggro = Math.min(g.aggro ?? 5, 5);   // 道筋の間は脇の櫓の上の射手に構わず進む
    g.onArrive = () => { w.done = true; g.formation = 'yari'; g.aggro = w.aggro; };   // 出た先では斬りかかる
  },
  stepWalk(g, w, t) {
    if (!w || w.done || t - w.t0 < 45) return;
    // 四十五秒で着かなければ、そこで構える（道筋に詰まって止まり続けない）
    w.done = true; g.onArrive = null; g.formation = 'yari'; g.aggro = w.aggro;
  },
  // 味方の隊を喰違の筋に沿って進める（いちばん近い所から先へ。塀を突き抜けない）
  march(rt, g, route, aggro) {
    const F = rt.flags, c = this.centerOf(g);
    if (!g || g.routed || !c) return;
    let i = 0, best = Infinity;
    route.forEach((q, k) => { const d = Math.hypot(c.x - q.x, c.z - q.z); if (d < best) { best = d; i = k; } });
    const w = { route, i, aggro };
    F.walks = (F.walks || []).filter((m) => m.g !== g);
    F.walks.push({ g, w });
    this.walk(g, w, rt.t);
  },
  gateOpen(rt) {
    const G = rt.siegeKit?.kits?.[0]?.gate;
    if (G && G.struct && G.struct.alive && !G.struct.opened) { G.struct.opened = true; G.open && G.open(); }
  },
  // 門の脇の岩肌へ梯子を掛ける（門が閉まった時。見た目の梯子。塀の上の守り手を引き付ける）
  ladders(rt) {
    const F = rt.flags, W = rt.world;
    if (F.laddersUp) return;
    F.laddersUp = true;
    for (const L of LAD) {
      try {
        const fy = W.heightAt(L.foot.x, L.foot.z), ty = Math.max(fy + 3.2, W.heightAt(L.top.x, L.top.z) + 2.4);
        const m = hashigo({ x: L.foot.x, y: fy, z: L.foot.z }, { x: L.top.x, y: ty, z: L.top.z });
        if (m) rt.scene.add(m);
      } catch (e) { console.warn(e); }
    }
    sfx('wood', 0.7);
  },
  // 門が破れたら、門の脇の塀も押し倒して寄せ手をなだれ込ませる（喰違の細い筋に味方が詰まらない）
  breach(rt) {
    const K = rt.siegeKit?.kits?.[0];
    for (const w of K?.walls || []) {
      const mx = (w.seg[0] + w.seg[2]) / 2, mz = (w.seg[1] + w.seg[3]) / 2;
      if (w.alive && Math.hypot(mx - GATE.x, mz - GATE.z) < 13) { w.hp = 0; w.alive = false; if (w.mesh) w.mesh.visible = false; }
    }
  },
  centerOf(g) {
    let x = 0, z = 0, n = 0;
    for (const u of g.units) if (u.alive && !u.fleeing) { x += u.pos.x; z += u.pos.z; n++; }
    return n ? { x: x / n, z: z / n } : null;
  },
  fighting(g, at, r) { return g.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && (!at || Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < r)).length; },
  gateStruct(rt) { return rt.siegeKit?.kits?.[0]?.gate?.struct || null; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const p = rt.player.u.pos, el = rt.t - F.t0;
    // 日が傾く：残りの時を空の色で知らせる（字は出さない）
    if (!F.dusk && el > T_LIMIT * 0.62) { F.dusk = true; try { rt.world.setTime('dusk'); } catch (e) { /* 空の切り替えが無い時はそのまま */ } }
    if (el > T_LIMIT) { this.lose(rt); return; }
    if (F.sw) this.stepWalk(F.sally, F.sw, rt.t);
    if (F.gw) this.stepWalk(F.gateGuard, F.gw, rt.t);
    for (const m of F.walks || []) this.stepWalk(m.g, m.w, rt.t);
    const sallyN = this.fighting(F.sally), sally0 = F.sally.units.length;
    if (F.stage === 1) {
      // 味方の先手と二番手は、自分の少し先と後ろを坂に沿って走る（一人で登らせない。止まれば味方も坂の途中で待つ）
      if ((F.leadT = (F.leadT || 0) - dt) <= 0) {
        F.leadT = 1;
        const k = Math.max(F.lead, this.along(p.x, p.z), (rt.t - F.stageT) * 1.2);
        F.lead = k;
        this.to(F.gamo, this.roadAt(k + 8)); this.to(F.gamo2, this.roadAt(k - 6));
      }
      if (Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 20) this.go(rt, 2);
    } else if (F.stage === 2) {
      // 四割を討たれるか、芥田が討たれるか、斬り合って二十五秒（出てから六十五秒）で崩れて引く
      const boss = F.sally.units.find((u) => u.name === '芥田悪六兵衛');
      if (F.sw.done && !F.fightT) F.fightT = rt.t;
      if (sallyN <= sally0 * 0.6 || (boss && !boss.alive) || (F.fightT && rt.t - F.fightT > 25) || rt.t - F.stageT > 65) this.go(rt, 3);
    } else if (F.stage === 3) {
      const st = this.gateStruct(rt);
      const gateUp = st && st.alive;
      // 付け入り：門が開いている間に、自分か味方が門の近くまで追いすがっていれば門は閉まらない
      if (!F.tsukeiri && gateUp && st.opened) {
        let chase = Math.hypot(p.x - FRONT.x, p.z - FRONT.z) < 9 || Math.hypot(p.x - INSIDE.x, p.z - INSIDE.z) < 9;
        if (!chase) for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - FRONT.x, u.pos.z - FRONT.z) < 6) { chase = true; break; }
        if (chase) {
          F.tsukeiri = true; this.breach(rt); rt.bark('門が閉まらぬ。付け入った');
          for (const g of [F.sally, F.gateGuard]) g.morale = Math.max(0, (g.morale ?? 100) - 30);
          // 門の守りも支えきれず本丸へ退く
          F.gw = { route: [INNER, HONF], i: 0, aggro: 8 }; F.gateGuard.aggro = 1; this.walk(F.gateGuard, F.gw, rt.t);
        }
        else {
          // 芥田の手がみな門の内へ入り、誰も追って来なければ門を閉める
          const out = F.sally.units.some((u) => u.alive && Math.hypot(u.pos.x - MOUTH.x, u.pos.z - MOUTH.z) < Math.hypot(u.pos.x - INNER.x, u.pos.z - INNER.z));
          if (!out || rt.t - F.stageT > 30) { closeGate(this.gateRef(rt)); F.shut = true; this.ladders(rt); rt.say('蒲生の侍大将', '門を閉められた！　掛矢で門を破れ', 3); F.walks = []; for (const g of F.allies) this.to(g, { x: MOUTH.x, z: MOUTH.z + 2 }); }
        }
      }
      // 閉まった門は寄せた味方が掛矢で打つ（味方が門の前にいるほど早い）
      if (gateUp && !st.opened) {
        let near = 0;
        for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 28) near++;
        if (near) { st.hp -= dt * 2.2 * Math.min(near, 16); if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.bark('門が破れた'); } }
      }
      if (st && !st.alive && !F.breached) { F.breached = true; this.breach(rt); for (const g of F.allies) this.march(rt, g, [MOUTH, FRONT, INSIDE], 14); }
      if (Math.hypot(p.x - INNER.x, p.z - INNER.z) < 10 || Math.hypot(p.x - INSIDE.x, p.z - INSIDE.z) < 4) this.go(rt, 4);
    } else if (F.stage === 4) {
      // 熊井越中守が討たれれば落城（誰が討っても）。本丸に踏みとどまり守りが崩れても落ちる
      const boss = F.hon.units.find((u) => u.name === '熊井越中守');
      const inHon = Math.hypot(p.x - HON.x, p.z - HON.z) < 13;
      const left = this.fighting(F.hon, HON, 24);
      F.honT = inHon && left <= 4 ? F.honT + dt : Math.max(0, F.honT - dt * 0.5);
      if (!boss || !boss.alive || F.honT >= 4) this.win(rt);
    }
  },
  // 大手の坂の筋（麓 → 門の外の口）で、何 m 登ったか・その所
  along(x, z) {
    const R = [...ROAD, [MOUTH.x, MOUTH.z]];
    let best = Infinity, at = 0, acc = 0;
    for (let k = 1; k < R.length; k++) {
      const [ax, az] = R[k - 1], [bx, bz] = R[k], L = Math.hypot(bx - ax, bz - az);
      const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L), 0, 1);
      const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
      if (d < best) { best = d; at = acc + t * L; }
      acc += L;
    }
    return at;
  },
  roadAt(m) {
    const R = [...ROAD, [MOUTH.x, MOUTH.z + 6]];
    let left = Math.max(0, m);
    for (let k = 1; k < R.length; k++) {
      const [ax, az] = R[k - 1], [bx, bz] = R[k], L = Math.hypot(bx - ax, bz - az);
      if (left <= L) return { x: ax + (bx - ax) * left / L, z: az + (bz - az) * left / L };
      left -= L;
    }
    const e = R[R.length - 1]; return { x: e[0], z: e[1] };
  },
  gateRef(rt) { return rt.siegeKit?.kits?.[0]?.gate || null; },
  onKill(rt, v) { const F = rt.flags; if (v.team === 1) F.ek++; else F.ak++; },

  win(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.unmark('t07');
    rt.award((t) => { t.main = true; t.special = { label: '岩石城を一日で落とした', pts: 20 }; }, '熊井越中守を討ち、本丸を取った');
    rt.objDone('main'); rt.setPhase('end');
    rt.banner('岩石城、落城', '一日で落ちた');
    rt.player.u.invuln = true;
    rt.say('蒲生の侍大将', '熊井越中守、討ち取ったり！　本丸に旗を立てよ', 3.5);
    rt.after(4, () => rt.say('前田利長', 'この岩山が一日か。秋月も肝が冷えたであろう', 3.5));
    rt.after(8, () => rt.say('蒲生氏郷', '殿下に申せ。秋月は降りましょう。九州の道が開けた', 4));
    rt.finish({ scriptedEnd: true }, 13);
  },
  lose(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.unmark('t07');
    rt.objFail('main'); rt.tracker.main = false; rt.setPhase('end');
    rt.banner('日が沈んだ', '岩石城は落ちなかった');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: '日が沈むまでに本丸の熊井越中守を討てなかった' }, 6);
  },
};

t07_ganjaku.sides = { a: { name: '豊臣勢', mon: 'toyotomi' }, b: { name: '秋月方（島津方）', mon: 'maru' } };
// 上に出す総勢（史料に異同あり。攻め手の蒲生・前田らと城の守りの数は遊びのための推定）
t07_ganjaku.force = (rt) => ({ a: Math.max(0, 10000 - (rt.flags.ak || 0) * 20), a0: 10000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 30), b0: 3000 });
t07_ganjaku.date = () => '天正十五年四月一日　初夏';
t07_ganjaku.history = '天正十五年（1587）四月一日。九州へ入った豊臣秀吉の本隊は、秋月種実の持ち城である豊前の岩石城を攻めた。秀吉は馬ヶ岳に陣を置き、蒲生氏郷が大手から、前田利長が搦手から攻めた。\n城は岩石山（454m）の頂にあり、大きな岩が天然の守りになる険しい山城だった。秋月方の城兵はおよそ三千、大手を芥田悪六兵衛、搦手を城将の熊井越中守が守ったと伝わる。城は一日で落ち、城兵の四百ほどが討たれ、熊井越中守も討死した。\n堅い城がたちまち落ちたことで、秋月種実は益富城を捨てて古処山へ退き、やがて戦わずに降った。豊臣軍の九州の進撃は一気に速まった。';

// bot の頭：近い敵を突き、段の行き先へ。門が閉まった時は門を打つ
t07_ganjaku.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.gamo.center();
  // 深手の時は味方の陰へ下がって息を整える
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  const boss = F.hon.units.find((o) => o.name === '熊井越中守' && o.alive);
  const goal = F.stage <= 2 ? MOUTH : F.stage === 3 ? INNER : boss ? boss.pos : HON;
  // 坂で届かない敵（斜面の上下）と睨み合って止まらない：行き先へ十五秒近づけなければ、六秒は敵を構わず進む
  const gd = Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z), pr = F.botProg || (F.botProg = { s: 0, d: Infinity, t: 0, skip: 0 });
  if (pr.s !== F.stage || gd < pr.d - 3) { pr.s = F.stage; pr.d = gd; pr.t = b.t; }
  else if (b.t - pr.t > 15 && gd > 8 && F.stage !== 2) { pr.skip = b.t + 6; pr.t = b.t; pr.d = gd; }
  const e = pr.skip > b.t || F.stage === 3 ? null : b.army.nearestEnemy(u, F.stage === 2 ? 16 : 9, (o) => !o.noTarget && !o.isStruct && !o.fleeing && o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 6 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  const nearTo = (q, r) => Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < r;
  if (F.stage <= 2) { at(MOUTH, 3); return; }
  if (F.stage === 3) {
    // 退く敵の後ろから喰違の筋（門の前 → 門の内）を追う。閉まった門は打つ
    const st = t07_ganjaku.gateStruct(b);
    if (st && st.alive && !st.opened) {
      const mx = (st.seg[0] + st.seg[2]) / 2, mz = (st.seg[1] + st.seg[3]) / 2;
      if (Math.hypot(mx - u.pos.x, mz - u.pos.z) > 2.2) { at({ x: mx, z: mz }, 1.6); return; }
      p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z); inp.leftPressed = Math.random() < 0.6; return;
    }
    if (!F.botFront && nearTo(FRONT, 3)) F.botFront = true;
    if (F.botFront && nearTo(INSIDE, 3)) F.botIn = true;
    at(F.botIn ? INNER : F.botFront ? INSIDE : FRONT, 1.5); return;
  }
  // 本丸へは門の内（喰違の奥）を抜けてから向かう（門の脇の塀に詰まらない）
  if (!F.botPast) { if (nearTo(INNER, 4)) F.botPast = true; else { at(INNER, 2); return; } }
  if (gd > 3) { at(goal, 2.4); return; }
  p.yaw = Math.atan2(goal.x - u.pos.x, goal.z - u.pos.z); inp.leftPressed = Math.random() < 0.6;
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t07_ganjaku);

export { t07_ganjaku };
export default t07_ganjaku;
