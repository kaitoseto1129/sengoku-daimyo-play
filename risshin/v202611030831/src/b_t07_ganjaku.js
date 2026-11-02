// ======================================================================
// 豊臣編 7 戦目：岩石城攻め（天正十五年・1587）。戦の型は「高速攻城」（docs/chapter2_toyotomi.md 7章）。
// 秀吉の本隊が九州へ入り、秋月方の岩石城（豊前・岩石山 454m）を蒲生氏郷・前田利長らが一日で落とす。
// 主人公は部将として蒲生勢と並び、大手の坂を一番に登る。日が沈むと負け（6分半ほど）。
// 段：1 大手の坂を駆け上がる（上から石と矢）→ 2 二の丸の門を破る → 3 岩の上の矢倉を落とす → 4 日が傾く前に本丸へ旗。
// 地形：国土地理院の標高（asset_dem_ganjaku.js・岩石山の頂を原点に ±400m・5m 間隔）。ゲームの 1 は実の 1.4m。
// 部品：門と塀と狭間の射撃は siege_kit（def.siegeKit）、落石は siege_rocks、兵は bhelp の enemyGroup・allyGroup。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { siegePlan, siegeHeight } from './siege_kit.js';
import { makeRockTraps } from './siege_rocks.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import { hashigo, nobori, jinmaku, yagura } from './props.js';
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
const ROAD = [[SPAWN.x, SPAWN.z], [-122, 124], [-96, 98], [-76, 76], [-60, 64]];
const ROAD_IN = [[-60, 50], [-46, 40], [-30, 30], [-14, 14], [0, 0]];
const SP = siegePlan({ x: GATE.x, z: GATE.z, rot: ROT, W: 16, koguchi: 'kuichigai', yokoya: false, moat: false, umadashi: false, sakamogi: false, shiyori: false, kirigishi: 1.0 });
const SIEGE_H = siegeHeight(SP);
// 門の外の口・門の前・門の内（喰違：外から右へ回り込み、横の筋の門を抜けて城の内へ）
const pt = (a, b) => { const [x, z] = SP.L(a, b); return { x, z }; };
const MOUTH = pt(5.5, 7), FRONT = pt(5.5, -3), INSIDE = pt(-6, -3), INNER = pt(-6, -14);
// 梯子を掛ける岩肌（門の両脇の塀の外。足は外、上は塀の上）
const LAD = [[-12, 3.2, -12, 0.3], [-16, 3.4, -16, 0.3], [14, 3.2, 14, 0.3]].map(([a, b, c, d]) => ({ foot: pt(a, b), top: pt(c, d) }));

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
  },
  // 二の丸の門・塀・狭間の射撃（siege_kit）。守り手の矢と鉄砲は門へ近づくほど激しい
  siegeKit: { plan: SP, build: { team: 1, wall: 'dobei', gateHp: 260, fire: { hurt: 0.06, peak: 4, near: 60 } }, when: (rt) => (rt.flags.stage || 0) <= 2 },

  setup(rt) {
    const F = rt.flags;
    CALM = true;
    F.stage = 0; F.ending = false; F.ek = 0; F.ak = 0; F.t0 = rt.t; F.stageT = rt.t; F.honT = 0;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const W = rt.world, faceUp = Math.atan2(GATE.x - SPAWN.x, GATE.z - SPAWN.z);

    // ---- 攻め手：蒲生勢・前田勢（桐の旗の列が坂を駆け上がる）----
    F.gamo = allyGroup(rt, { name: '蒲生勢', faction: 'oda', flag: 'toyotomi', anchor: { x: SPAWN.x + 6, z: SPAWN.z - 4 }, facing: faceUp, width: 5, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '蒲生氏郷', horse: false, armor: KIRI } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }]);
    F.maeda = allyGroup(rt, { name: '前田勢', faction: 'oda', flag: 'maeda', anchor: { x: SPAWN.x - 6, z: SPAWN.z + 6 }, facing: faceUp, width: 5, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '前田利長', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]);
    // 斜面から寄せる黒田勢（大手の坂とは別の筋。梯子を担いで岩肌を登る）
    F.kuroda = allyGroup(rt, { name: '黒田勢', faction: 'oda', flag: 'kuroda', anchor: { x: SPAWN.x + 22, z: SPAWN.z - 2 }, facing: faceUp, width: 5, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '黒田長政', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
    F.allies = [F.gamo, F.maeda, F.kuroda];
    // 麓の本陣：豊臣秀吉と黒田官兵衛が坂の下から見ている（動かない）
    F.honjin = allyGroup(rt, { name: '秀吉の本陣', faction: 'oda', flag: 'toyotomi', anchor: { x: -168, z: 168 }, facing: faceUp, width: 4, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '豊臣秀吉', invuln: true, horse: false, armor: KIRI } }, { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: false } }, { type: 'samurai', n: 4 }]);
    F.honjin.noFrontline = true;
    try {
      rt.scene.add(jinmaku(W, -174, 174, 14, 9, 3, { mon: 'toyotomi' }));
      for (const [x, z] of [[-160, 176], [-176, 160], [-182, 184], [-150, 186]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7));
    } catch (e) { console.warn(e); }
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z + 3 }, faceUp, [{ kind: 'spear', n }]);
    // 二の丸の門・塀・矢倉（siege_kit は作りの後に組む）は、麓の坂からでも霧に沈めない
    // 二の丸の門の左右の櫓・岩の上の矢倉（段3で落とす所）・大手の坂の上の西の尾根の物見櫓。坂の下から尾根の上に城の櫓が並んで見える
    { const n0 = rt.scene.children.length;
      try { for (const [x, z] of [[-45.4, 59.6], [-59.6, 45.4], [YAGURA.x, YAGURA.z], [-98, 64], [-84, 54]]) rt.scene.add(yagura(W, x, z, { mon: 'maru', team: 1 })); } catch (e) { console.warn(e); }
      farSight(rt.scene.children.slice(n0), { W, ground: { x: -40, z: 40, r: 60 } });
      // 門・塀（siege_kit は作りの後に組む）も霧に沈めない
      const n1 = rt.scene.children.length; rt.after(0.05, () => farSight(rt.scene.children.slice(n1), { W, near: { x: GATE.x, z: GATE.z, r: 40 } })); }

    // ---- 城方：秋月方の守り ----
    const foe = (name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'oda', flag: 'maru', armor: AKI, anchor: at, facing: faceUp + Math.PI, order: 'hold', aggro: 9, width: 4, ...o }, list);
    F.slope = [
      foe('坂の守り', { x: -100, z: 102 }, [{ type: 'ashigaru', n: 6 }]),
      foe('坂の上の弓', { x: -80, z: 80 }, [{ type: 'bow', n: 3 }, { type: 'ashigaru', n: 3 }]),
    ];
    F.gateGuard = foe('門の守り', INNER, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { aggro: 7 });
    F.yagura = foe('矢倉の射手', YAGURA, [{ type: 'bow', n: 4 }, { type: 'gun', n: 1 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], { aggro: 8 });
    F.hon = foe('本丸の守り', { x: HON.x - 4, z: HON.z + 4 }, [{ type: 'busho', n: 1, o: { name: '岩石城の守将', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], { aggro: 8 });
    F.foes = [...F.slope, F.gateGuard, F.yagura, F.hon];
    for (const g of [F.gateGuard, F.yagura, F.hon]) g.noFrontline = true;

    // 上から転がる石（坂の二か所）
    F.rocks = makeRockTraps(rt, { posts: [
      { id: 'r1', at: { x: -66, z: 66 }, lane: [[-66, 66], [-84, 86], [-104, 106], [-124, 126]], active: () => F.stage <= 1, stock: 2, interval: [22, 32] },
      { id: 'r2', at: { x: -72, z: 60 }, lane: [[-72, 60], [-92, 80], [-112, 98]], active: () => F.stage <= 1, stock: 1, interval: [30, 40] },
    ] });
    // 麓の豊臣の大軍（軽い作り）。戸次川の先遣とは違い、山の裾を埋める物量で寄せる
    try {
      W.addDistantArmy({ x: -200, z: 205, w: 60, d: 30, count: 500, facing: faceUp, flag: 'toyotomi', team: 0, seed: 1587 });
      W.addDistantArmy({ x: -225, z: 160, w: 40, d: 26, count: 300, facing: faceUp, flag: 'toyotomi', team: 0, seed: 1588 });
      W.addDistantArmy({ x: -150, z: 225, w: 70, d: 24, count: 420, facing: faceUp, flag: 'toyotomi', team: 0, seed: 1589 });
      W.addDistantArmy({ x: -60, z: 220, w: 60, d: 22, count: 360, facing: Math.PI, flag: 'toyotomi', team: 0, seed: 1590 });
      W.addDistantArmy({ x: -225, z: 70, w: 26, d: 50, count: 300, facing: Math.PI / 2, flag: 'toyotomi', team: 0, seed: 1591 });
    } catch (e) { console.warn(e); }

    rt.setPhase('brief');
    rt.say('豊臣秀吉', '島津に付いた秋月の城じゃ。今日のうちに落とせ', 3.5);
    rt.after(3.8, () => rt.say('黒田官兵衛', 'この城が一日で落ちれば、九州は戦う前に震えましょう', 3.5));
    rt.after(7.6, () => rt.say(rt.G.name || '主人公', '一日で？　この岩山を', 2.5));
    rt.after(10.4, () => rt.say('蒲生氏郷', '坂と岩肌の両方から寄せる。日が沈む前に旗を立てる。続け！', 3.4));
    rt.after(11, () => this.go(rt, 1));
  },

  // 段を進める
  go(rt, s) {
    const F = rt.flags;
    if (F.ending || F.stage >= s) return;
    F.stage = s; F.stageT = rt.t; CALM = s < 3;
    // 段の変わり目で息を整える（一つの段の傷を次の段へ持ち越しすぎない）
    const pu = rt.player.u; if (pu.alive && s > 1) pu.hp = Math.max(pu.hp, pu.maxHp * 0.7);
    rt.unmark('t07');
    // 味方の隊は持ち場を前へ移すだけ（兵は歩いて付いてくる。出し直さない）
    const A = (x, z) => { for (const g of F.allies) if (!g.routed) { g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; } };
    if (s === 1) {
      F.t0 = rt.t;   // 日が沈むまでの時は、坂へ懸かってから数える
      rt.setPhase('assault');
      rt.obj('main', '大手の坂を駆け上がれ', 'main');
      rt.marker('t07', MOUTH, '二の丸の門', { h: 3 });
      A(-100, 102);
      this.slope(rt, { x: -84, z: 112 });
      rt.after(25, () => { if (F.stage === 1) A(MOUTH.x - 4, MOUTH.z + 6); });
    } else if (s === 2) {
      rt.award((t) => t.side.push('大手の坂を一番に登った'), '大手の坂を一番に登った');
      rt.obj('main', '二の丸の門を破れ', 'main');
      rt.marker('t07', FRONT, '二の丸の門', { h: 3 });
      A(MOUTH.x, MOUTH.z + 2);
      this.ladders(rt);
      this.slope(rt, { x: LAD[0].foot.x + 2, z: LAD[0].foot.z + 3 });
      rt.say('蒲生氏郷', '門を破れ！　掛矢を持て', 3);
      rt.after(3.5, () => { if (F.stage === 2) rt.say('黒田長政', '梯子を掛けよ！　岩肌から塀へ取り付け！', 3); });
    } else if (s === 3) {
      rt.award((t) => t.side.push('二の丸の門を破った'), '二の丸の門を破った');
      rt.obj('main', '岩の上の矢倉を落とせ', 'main');
      rt.marker('t07', YAGURA, '矢倉', { h: 3, red: true });
      A(INNER.x, INNER.z);
      this.slope(rt, { x: YAGURA.x - 14, z: YAGURA.z + 4 });
      rt.after(10, () => { if (F.stage === 3) A(YAGURA.x - 6, YAGURA.z + 6); });
      rt.say('前田利長', '岩の上の矢倉が邪魔じゃ。落とせ', 3);
    } else if (s === 4) {
      rt.award((t) => t.side.push('岩の上の矢倉を落とした'), '岩の上の矢倉を落とした');
      rt.obj('main', '日が傾く前に、本丸へ旗を立てよ', 'main');
      rt.marker('t07', HON, '本丸', { h: 3 });
      A(HON.x - 3, HON.z + 3);
      this.slope(rt, { x: HON.x + 6, z: HON.z + 10 });
      rt.say('蒲生氏郷', '本丸じゃ！　日が傾くぞ', 3);
    }
  },
  // 黒田勢は坂の脇の斜面を登る（大手の味方とは別の筋で寄せる）
  slope(rt, at) {
    const g = rt.flags.kuroda;
    if (!g || g.routed) return;
    g.anchor.x = at.x; g.anchor.z = at.z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null;
  },
  // 門の脇の岩肌へ梯子を掛ける（見た目の梯子。塀の上の守り手を引き付ける）
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
      if (w.alive && Math.hypot(mx - GATE.x, mz - GATE.z) < 10) { w.hp = 0; w.alive = false; if (w.mesh) w.mesh.visible = false; }
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
    if (F.rocks) F.rocks.tick(dt);
    if (F.ending || !F.stage) return;
    const p = rt.player.u.pos, el = rt.t - F.t0;
    // 日が傾く：残りの時を空の色で知らせる（字は出さない）
    if (!F.dusk && el > T_LIMIT * 0.62) { F.dusk = true; try { rt.world.setTime('dusk'); } catch (e) { /* 空の切り替えが無い時はそのまま */ } }
    if (el > T_LIMIT) { this.lose(rt); return; }
    if (F.stage === 1) {
      if (Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 20) this.go(rt, 2);
    } else if (F.stage === 2) {
      const st = this.gateStruct(rt);
      if (!st || !st.alive || st.opened) { this.breach(rt); this.go(rt, 3); return; }
      // 寄せた味方が掛矢で門を打つ（味方が門の前にいるほど早い）
      let near = 0;
      for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 28) near++;
      if (near) { st.hp -= dt * 1.6 * Math.min(near, 14); if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.bark('門が破れた'); } }
    } else if (F.stage === 3) {
      // 射手が二人ほどに減るか、矢倉の上に一息立てば落ちたと見る
      const atY = Math.hypot(p.x - YAGURA.x, p.z - YAGURA.z) < 12;
      F.yagT = atY ? (F.yagT || 0) + dt : 0;
      // 矢倉の岩に残る射手だけを数える（下へ打って出た者は矢倉を捨てたと見る）
      const yl = this.fighting(F.yagura, YAGURA, 22);
      if (yl <= 3 || (F.yagT > 6 && yl <= 6)) this.go(rt, 4);
    } else if (F.stage === 4) {
      const inHon = Math.hypot(p.x - HON.x, p.z - HON.z) < 12;
      // 本丸に残って戦う敵の数（坂へ打って出た者は数えない）
      const left = this.fighting(F.hon, HON, 24);
      F.honT = inHon && left <= 5 ? F.honT + dt : Math.max(0, F.honT - dt * 0.5);
      // 本丸に長く踏みとどまれば、残る敵が多くても旗を立てられる（味方が周りを押さえる）
      if (inHon) F.honStay = (F.honStay || 0) + dt;
      if (F.honT >= 3 || (F.honStay >= 25 && left <= 9)) this.win(rt);
    }
  },
  onKill(rt, v) { const F = rt.flags; if (v.team === 1) F.ek++; else F.ak++; },

  win(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.unmark('t07');
    rt.award((t) => { t.main = true; t.special = { label: '岩石城を一日で落とした', pts: 20 }; }, '本丸に旗を立てた');
    rt.objDone('main'); rt.setPhase('end');
    rt.banner('岩石城、落城', '一日で落ちた');
    rt.player.u.invuln = true;
    rt.say('豊臣秀吉', '岩石が一日か。秋月も肝が冷えたであろう', 4);
    rt.after(4.5, () => rt.say('蒲生氏郷', 'おぬしの足、速いのう', 3));
    rt.after(8, () => rt.say('黒田官兵衛', '秋月は降りましょう。九州の道が開けました。島津の地へ急ぎまする', 4));
    rt.finish({ scriptedEnd: true }, 13);
  },
  lose(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    rt.unmark('t07');
    rt.objFail('main'); rt.tracker.main = false; rt.setPhase('end');
    rt.banner('日が沈んだ', '岩石城は落ちなかった');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: '日が沈むまでに本丸へ届かなかった' }, 6);
  },
};

t07_ganjaku.sides = { a: { name: '豊臣勢', mon: 'toyotomi' }, b: { name: '秋月方（島津方）', mon: 'maru' } };
// 上に出す総勢（史料に異同あり。攻め手の蒲生・前田らと城の守りの数は遊びのための推定）
t07_ganjaku.force = (rt) => ({ a: Math.max(0, 5000 - (rt.flags.ak || 0)), a0: 5000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 30), b0: 3000 });
t07_ganjaku.date = () => '天正十五年四月一日　初夏';
t07_ganjaku.history = '天正十五年（1587）四月一日。九州へ入った豊臣秀吉の本隊は、秋月種実の持ち城である豊前の岩石城を攻めた。岩の多い険しい山城だったが、蒲生氏郷・前田利長らが攻め寄せ、一日で落とした。\n秋月は島津に付いた豊前・筑前の大名で、岩石城はその支城だった。秀吉の本隊は黒田官兵衛らを従え、戸次川で敗れた先遣の軍とは比べものにならない大軍で九州へ入った。\n堅い城がたちまち落ちたことで、秋月種実は戦わずに降り、豊臣軍の九州の進撃は一気に速まった。\n両軍の人数・守将の名・門と矢倉の置き場は、遊びのための推定と復元である。';

// bot の頭：近い敵を突き、段の行き先へ。門の段は門を打つ
t07_ganjaku.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.gamo.center(), nearHon = Math.hypot(u.pos.x - HON.x, u.pos.z - HON.z) < 14;
  // 深手の時は味方の陰へ下がって息を整える
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  // 坂で届かない敵（斜面の上下）と睨み合って止まらない：行き先へ十五秒近づけなければ、六秒は敵を構わず登る
  const goal = F.stage <= 1 ? MOUTH : F.stage === 2 ? FRONT : F.stage === 3 ? YAGURA : HON;
  const gd = Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z), pr = F.botProg || (F.botProg = { s: 0, d: Infinity, t: 0, skip: 0 });
  if (pr.s !== F.stage || gd < pr.d - 3) { pr.s = F.stage; pr.d = gd; pr.t = b.t; }
  else if (b.t - pr.t > 15 && gd > 8) { pr.skip = b.t + 6; pr.t = b.t; pr.d = gd; }
  const e = pr.skip > b.t ? null : b.army.nearestEnemy(u, F.stage === 4 && nearHon ? 12 : 9, (o) => !o.noTarget && !o.isStruct && !o.fleeing && o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 6 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  const nearTo = (q, r) => Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < r;
  // 坂は味方の先頭と並んで登る（一人で敵の固まりへ飛び込まない）
  if (F.stage <= 1) { const lag = Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 10 && !nearTo(MOUTH, 30) && b.t - F.stageT < 25;
    at(lag ? { x: gc.x + 4, z: gc.z - 4 } : MOUTH); return; }
  if (F.stage === 2) {
    const st = t07_ganjaku.gateStruct(b);
    if (!st || !st.alive) return;
    const mx = (st.seg[0] + st.seg[2]) / 2, mz = (st.seg[1] + st.seg[3]) / 2;
    if (!F.botAtFront && nearTo(MOUTH, 3)) F.botAtFront = true;
    if (!F.botAtFront) { at(MOUTH, 2); return; }
    if (Math.hypot(mx - u.pos.x, mz - u.pos.z) > 2.2) { at({ x: mx, z: mz }, 1.6); return; }
    p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z);
    inp.leftPressed = Math.random() < 0.6;
    return;
  }
  if (F.stage === 3) {
    if (!F.botIn && nearTo(INNER, 4)) F.botIn = true;
    if (!F.botIn) { at(nearTo(INSIDE, 3) || F.botPastGate ? INNER : INSIDE, 2); if (nearTo(INSIDE, 3)) F.botPastGate = true; return; }
    at(YAGURA, 3); return;
  }
  at(HON, 4);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t07_ganjaku);

export { t07_ganjaku };
export default t07_ganjaku;
