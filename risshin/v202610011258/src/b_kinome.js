// ======================================================================
// 攻城 F2　木ノ芽峠の砦（docs/siege-plan.md F2・fort-spec 42・45）
// 越前一向一揆が峠道をふさいだ砦。柵二重・空堀・土塁・木戸・物見櫓2・本陣。左は崖、右は森。
// 足軽は明智光秀の手（攻め手）。①正面の柵を破る ②森から回った味方が本陣の脇を突く ③本陣を落とす
// castle_plan.js（F1）・castle_parts.js（S2）・siege_zones.js（F3）を使う、砦の作りの見本。
// echizen（b_echizen.js）とは別の、独立した MVP の戦（lord.js の「信長で遊ぶ」一覧から入る。ODA_LINE には入れない）。
// ======================================================================
import { hut, yagura, tawara, sakamogi } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { namuTex } from './b_nodafukushima.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { fence, kido, doruiLine, doruiHeight, monomi } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, zoneWord } from './siege_zones.js';
import { tickTabas, tabaInteractTick } from './taketaba.js';
import { KINOME_PLAN, ROAD, FOREST_ROAD, GATE_OUT, GATE_IN, HONJIN, TOWER_L, TOWER_R, CLIFF_X, FOREST_X } from './castles/kinome.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);

// 軍議（gungi.js）でルートを選んだ隊を、点の並びどおりに一つずつ歩かせる（F6：始めた後に部隊がその道を進む）
function walkRoute(rt, g, pts, onDone) {
  let i = 0;
  const next = () => {
    if (i >= pts.length) { if (onDone) onDone(g); return; }
    const p = pts[i++];
    g.order = 'move'; g.dest = { x: p.x, z: p.z }; g.speed = 2.3;
    g.onArrive = next;
  };
  next();
}

// 左の土塁（崖寄り）・右の土塁（森寄り）：正面の柵のすぐ内側
const DORUI_L = [[-15, -12], [-15, 16]];
const DORUI_R = [[15, -12], [15, 16]];

// 森から回る手が、先に右の物見櫓（右の土塁・弓）へ寄る道（柵の外・FOREST_X の外を通るので木戸は要らない）
const TOWER_ROUTE = [{ x: 20, z: -18 }, { x: 19, z: 4 }];

function baseTerrain(x, z) {
  let h = 0.4 * Math.sin(x * 0.05 + 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.06 - x * 0.03);
  h += Math.max(0, z + 170) * 0.06;   // 南から峠へ緩く上る
  const d = distToPolyline(x, z, ROAD);
  h += Math.min(26, Math.max(0, d - 14) * 0.5);
  // 左（西）は崖：CLIFF_X を越えると急に立ち上がる
  if (x < CLIFF_X) h += (CLIFF_X - x) * 2.4;
  return h;
}
let CASTLE_HEIGHT = null, DORUI_L_H = null, DORUI_R_H = null;
function height(x, z) {
  if (!CASTLE_HEIGHT) {
    CASTLE_HEIGHT = heightOf(KINOME_PLAN, baseTerrain, 3);
    DORUI_L_H = doruiHeight(DORUI_L, { w: 3.6, h: 1.1 });
    DORUI_R_H = doruiHeight(DORUI_R, { w: 3.6, h: 1.1 });
  }
  return CASTLE_HEIGHT(x, z) + DORUI_L_H(x, z) + DORUI_R_H(x, z);
}

const kinome = {
  spawn: { x: 0, z: -186, heading: 0 },
  world: {
    seed: 15901,
    time: 'day',
    mist: true,
    muddy: 0.3,
    paths: [ROAD, FOREST_ROAD],
    height,
    tint(x, z, h, c) { if (x > FOREST_X) c.setRGB(c.r * 0.78, c.g * 0.88, c.b * 0.78); else if (distToPolyline(x, z, ROAD) > 16) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.82); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 14 || (x > -18 && x < 18 && z > -18 && z < 78),
    trees: 820,
    tufts: 2800,
    treeDensity: (x, z) => (x > FOREST_X ? 1.4 : x < CLIFF_X + 6 ? 0.6 : distToPolyline(x, z, ROAD) < 16 ? 0.08 : 0.9),
    groves: [{ x: 30, z: 0, r: 16, n: 22 }, { x: 34, z: 40, r: 14, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z > 150,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    namuTex();
    flReset();

    // ---- 砦の場（castle_plan.js。塀は手で置くので、ここでは当たりと中心だけを取る） ----
    F.C = buildCastlePlan(rt, KINOME_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['front', 'naka', 'honjin'] });

    // ---- 左は崖（通れない） ----
    for (const s of wallLine(rt, [[CLIFF_X, -186], [CLIFF_X, 130]], { team: 1, hp: 1e9, name: '崖', segLen: 14 })) { s.noTarget = true; s.wall = true; }

    // ---- 柵二重（外の木戸・内の木戸）と、左右の土塁 ----
    F.fenceOut = fence(rt, [[-16, GATE_OUT.z], [16, GATE_OUT.z]], { team: 1, hp: 380, gaps: [2] });
    F.gateOut = kido(rt, GATE_OUT.x, GATE_OUT.z, 3, 0, { team: 1, hp: 260, name: GATE_OUT.name, gate: 0 });
    F.fenceIn = fence(rt, [[-16, GATE_IN.z], [16, GATE_IN.z]], { team: 1, hp: 340, gaps: [2] });
    F.gateIn = kido(rt, GATE_IN.x, GATE_IN.z, 3, 0, { team: 1, hp: 240, name: GATE_IN.name, gate: 1 });
    F.doruiL = doruiLine(rt, DORUI_L, { w: 3.6, h: 1.1, name: '左の土塁' });
    F.doruiR = doruiLine(rt, DORUI_R, { w: 3.6, h: 1.1, name: '右の土塁' });
    for (const [x, z, r] of [[-17, -14, 0.3], [17, -14, -0.3]]) rt.scene.add(sakamogi(W, x, z, r, 6));

    // ---- 物見櫓 2（左右） ----
    F.towerL = monomi(rt, TOWER_L.x, TOWER_L.z, { name: '左の物見櫓' });
    F.towerR = monomi(rt, TOWER_R.x, TOWER_R.z, { name: '右の物見櫓' });

    // ---- 砦の中の小屋（見た目） ----
    rt.scene.add(hut(W, -8, 34, 7, 5, 0.2, { wall: 0x5a4a38 }), hut(W, 8, 30, 6, 4.5, -0.15, { wall: 0x5a4a38 }));
    rt.scene.add(tawara(W, 4, 38, 0.2, 3));
    for (const [x, z] of [[-9, HONJIN.z + 8], [9, HONJIN.z + 8], [-9, GATE_OUT.z - 2], [9, GATE_OUT.z - 2]]) rt.scene.add(yagura(W, x, z));

    // ---- 守り（一揆勢）300：正面の柵 槍100・左の土塁 鉄砲50・右の土塁 弓50・中の予備70・本陣 守将と30 ----
    F.front = enemyGroup(rt, { faction: 'saito', name: '正面の柵の一揆勢', anchor: { x: 0, z: GATE_IN.z + 5 }, facing: 0, order: 'hold', aggro: 14, width: 10, morale: 92, noRout: true, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55, formation: 'yari' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 12 }], IKKO));
    KIT.backOf(rt, F.front, { flag: 'namu', armor: IKKO.armor, kind: 'spear', w: 14, depth: 10, count: 86, seed: 15902, stop: () => F.frontFell });

    F.gunL = enemyGroup(rt, { faction: 'saito', name: '左の土塁の鉄砲', anchor: { x: DORUI_L[0][0], z: 2 }, facing: Math.PI, order: 'hold', aggro: 10, width: 4, morale: 85, fleeDir: { x: -1, z: 1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 8 }], IKKO));
    KIT.backOf(rt, F.gunL, { flag: 'namu', armor: IKKO.armor, kind: 'gun', w: 4, depth: 8, count: 42, seed: 15903, stop: () => F.frontFell });

    F.bowR = enemyGroup(rt, { faction: 'saito', name: '右の土塁の弓', anchor: { x: DORUI_R[0][0], z: 2 }, facing: Math.PI, order: 'hold', aggro: 10, width: 4, morale: 85, fleeDir: { x: 1, z: 1 }, dmgMult: 0.55 },
      dress([{ type: 'bow', n: 8 }], IKKO));
    KIT.backOf(rt, F.bowR, { flag: 'namu', armor: IKKO.armor, kind: 'bow', w: 4, depth: 8, count: 42, seed: 15904, stop: () => F.frontFell });

    F.naka = enemyGroup(rt, { faction: 'saito', name: '内郭の予備', anchor: { x: 0, z: 32 }, facing: 0, order: 'hold', aggro: 12, width: 8, morale: 90, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 9 }], IKKO));
    KIT.backOf(rt, F.naka, { flag: 'namu', armor: IKKO.armor, kind: 'spear', w: 10, depth: 8, count: 60, seed: 15905 });

    F.ikkoCamp = camp(rt, { x: HONJIN.x, z: HONJIN.z + 6, facing: 0, team: 1, faction: 'saito', mon: 'namu', armor: IKKO.armor, general: { name: '杉浦玄任', hat: 'hachimaki', haori: 0x4a4236 }, guard: 20, reserve: 0 });
    KIT.markRecyclable(F.naka);

    // ---- 場の制圧（siege_zones.js。F3） ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'front', name: '正面の柵', test: F.C.kuruwa.front.test, pos: F.C.kuruwa.front.centroid, need: 6, hold: 12, gate: GATE_IN.name, next: 'honjin' },
        { id: 'honjin', name: '本陣', test: F.C.kuruwa.honjin.test, pos: F.C.kuruwa.honjin.centroid, need: 6, hold: 15, honmaru: true },
      ],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 300,
      commander: () => F.ikkoCamp && F.ikkoCamp.general,
      noReinforce: () => true,
      onFall: (id) => { if (id === 'front' && !F.frontFell) this.frontFall(rt); },
      onHonmaru: () => this.win(rt),
      onSurrender: () => this.win(rt),
    });

    // ---- 明智光秀の手（攻め手800）。正面・森から回る手・後衛の三つ（＋控えの大軍） ----
    F.ake = allyGroup(rt, { name: '明智光秀の手', anchor: { x: 0, z: -176 }, facing: 0, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 6 }], ODA));
    F.akeU = F.ake.units[0];
    KIT.backOf(rt, F.ake, { flag: 'oda', armor: 0x2b3140, kind: 'spear', w: 16, depth: 10, count: 120, seed: 15906 });

    F.forest = allyGroup(rt, { name: '森から回る手（羽柴）', anchor: { x: 30, z: -24 }, facing: -Math.PI / 2, width: 10, aggro: 0, order: 'hold', noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11 }], ODA));
    KIT.backOf(rt, F.forest, { flag: 'oda', armor: 0x2b3140, kind: 'spear', w: 12, depth: 8, count: 120, seed: 15907, stop: () => !F.forestGo });

    F.rear = allyGroup(rt, { name: '佐久間信盛の手（後衛）', anchor: { x: 6, z: -196 }, facing: 0, width: 12, aggro: 0, order: 'hold', noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 11 }], ODA));
    KIT.backOf(rt, F.rear, { flag: 'oda', armor: 0x2b3140, kind: 'spear', w: 16, depth: 12, count: 200, seed: 15908, stop: () => !F.rearGo });
    KIT.markRecyclable(F.rear);
    for (const g of [F.ake, F.forest, F.rear]) { g.defMult = 1.15; g.dmgMult = 0.8; }

    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-4, -210, 22, 20, 180, 0, 0x2b3140, 'oda', 15909);
    DA(10, -216, 20, 18, 138, 0, 0x2b3140, 'eiraku', 15910);

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -10, z: -180 }, 0, [{ kind: 'spear', n }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '明智光秀の先手の一隊を預かり、峠道の砦へ攻め上れ' : '明智光秀のもとで、下知を待て', 'main');
    rt.say('明智光秀', `${nm(rt)}、峠に一揆の砦が柵を二重に構えておる。羽柴殿の手は、すでに森から回っておる`, 5);
    rt.say('明智光秀', 'まずは正面の柵を破る。囲まれた頃合いで、羽柴殿の手が横から来る', 4);
    rt.marker('ake', unitPos(F.akeU), '明智光秀', {});
    rt.after(14, () => this.assault(rt));
  },

  // ① 正面の柵へ（軍議で「森から回り込む」を選んでいれば、明智の手は森の道から本陣の脇へ）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('front');
    rt.unmark('ake');
    sfx('horagai', 0.85);
    if (F.routeAke === 'forest') {
      rt.obj('main', '森の道から回り込め', 'main');
      rt.say('明智光秀', 'よし、森から回る。正面ではなく、本陣の脇を突く', 3.5);
      walkRoute(rt, F.ake, [...FOREST_ROAD.map(([x, z]) => ({ x, z })), { x: 10, z: HONJIN.z - 6 }], (g) => { g.order = 'attack'; g.seekRange = 42; });
    } else {
      rt.obj('main', '正面の柵を破れ', 'main');
      rt.obj('side', '木戸を破るか、柵を越えて中へ入れ', 'side');
      const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 42; }; };
      go(F.ake, 0, GATE_OUT.z - 14);
    }
    rt.marker('front', centerOf(F.front), () => `正面の柵の一揆勢・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.marker('gunL', centerOf(F.gunL), () => `左の土塁・鉄砲・${moraleWord(F.gunL.morale)}`, { red: true, group: F.gunL });
    rt.marker('bowR', centerOf(F.bowR), () => `右の土塁・弓・${moraleWord(F.bowR.morale)}`, { red: true, group: F.bowR });
    if (F.routeForest === 'towers') this.towerFirst(rt);
  },

  // 正面の柵が落ちた：羽柴の手を森から進ませ、一揆の予備を引き出す
  frontFall(rt) {
    const F = rt.flags;
    if (F.frontFell) return;
    F.frontFell = true;
    rt.banner('正面の柵を破った', '羽柴殿の手が、森から本陣の脇へ向かう');
    rt.say('明智光秀', 'よし、柵は破った。羽柴殿の手が来るまで、内郭の押さえを抜かるな', 4);
    if (F.routeForest !== 'towers') {
      F.forestGo = true;
      F.forest.order = 'move'; F.forest.dest = { x: 10, z: HONJIN.z - 4 }; F.forest.speed = 2.4;
      F.forest.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; };
    }
    if (F.naka && !gone(F.naka)) { F.naka.order = 'attack'; F.naka.seekRange = 40; }
    rt.after(16, () => { F.rearGo = true; F.rear.order = 'move'; F.rear.dest = { x: -4, z: 18 }; F.rear.speed = 2.3; F.rear.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; }; });
    rt.obj('main', '本陣へ攻め入れ', 'main');
  },

  // ③ 物見櫓を先に取る：羽柴の手は正面の柵を待たず、先に右の物見櫓（右の土塁・弓）を崩す
  towerFirst(rt) {
    const F = rt.flags;
    if (F.towerGo) return;
    F.towerGo = true; F.forestGo = true;
    rt.banner('先に物見櫓を', '羽柴殿の手が、右の物見櫓の守りへ向かう');
    rt.say('明智光秀', '羽柴殿の手は、先に右の物見櫓を崩す。柵はこちらで引きつける', 4);
    walkRoute(rt, F.forest, TOWER_ROUTE, (g) => { g.order = 'attack'; g.seekRange = 30; });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['front', 'gunL', 'bowR']) rt.unmark(id);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '木ノ芽峠の砦を落とした', pts: 20 }; }, '任務達成・木ノ芽峠の砦を落とした');
    sfx('kane', 0.5);
    rt.banner('木ノ芽峠の砦、落城', '柵は破られ、一揆勢の旗は倒れた');
    rt.say('明智光秀', `${nm(rt)}、峠は越えた。この先も、まだ砦が並んでおる`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    if (F.SZ) F.SZ.tick(dt);
    // 物見櫓（右の土塁・弓）を崩し終えたら、羽柴の手は残りの森の道から本陣の脇へ
    if (F.towerGo && !F.towersTaken && F.bowR && gone(F.bowR)) {
      F.towersTaken = true;
      rt.banner('物見櫓の守りを崩した', '羽柴殿の手が、本陣の脇へ向かう');
      walkRoute(rt, F.forest, [...FOREST_ROAD.slice(1).map(([x, z]) => ({ x, z })), { x: 10, z: HONJIN.z - 6 }], (g) => { g.order = 'attack'; g.seekRange = 42; });
    }
    if (F.step >= 1) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.frontFell) rt.objProgress('main', `柵の内・${zoneWord(st.front)}`);
      else if (!F.ending) rt.objProgress('main', `本陣・${zoneWord(st.honjin)}`);
    }
    // 時をかけすぎたら、確かめを止めない保険で決着させる
    if (rt.t - (F.stepT || 0) > 420 && !F.ending) this.win(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

kinome.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(800 - (F.ak || 0) * 4), a0: 800, b: Math.max(0, 300 - (F.ek || 0) * 4), b0: 300 };
};
kinome.sides = { a: { name: '織田軍（明智光秀）', mon: 'oda' }, b: { name: '越前一向一揆', mon: 'namu' } };
kinome.famous = [
  { name: '杉浦玄任', g: /本陣|旗本/, loose: 1, line: '杉浦玄任なり！　この峠は、一揆の命の砦ぞ！' },
];
kinome.date = () => '天正三年八月　秋・霧';
kinome.history = '天正三年（1575）八月、信長は大軍で越前へ攻め入った。一向一揆は木ノ芽峠などに砦を構えて待ち受けたが、明智光秀・羽柴秀吉らの手が回り込んで背後を突き、砦は次々に落ちた。ここでは「正面で引きつけ、回った手で崩す」という史実の形を、砦の仕組み（柵・土塁・木戸・物見櫓・本陣の制圧）の見本として遊べるようにした一戦。兵の数には諸説ある。';

// 軍議の画面（gungi.js・F6）：明智の先手と羽柴の手、二つにルートを割り当てる。「正面」は今までどおり、
// 「森から回り込む」を選ぶと、選んだ隊が森の道（FOREST_ROAD）を歩いて本陣の脇から攻める（assault で分岐）。
// 羽柴の手に「正面」を選ぶと、柵が破れるのを待たず、正面へ先に合流する。
kinome.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -20 }, dist: 95,
    units: [
      { id: 'ake', name: '明智光秀の手（先手）', group: () => F.ake },
      { id: 'forest', name: '羽柴秀吉の手', group: () => F.forest },
    ],
    routes: [
      { id: 'front', name: '峠道を正面から' },
      { id: 'forest', name: '森から回り込む' },
      { id: 'towers', name: '先に物見櫓を崩す' },
    ],
    default: { ake: 'front', forest: 'forest' },
    enemy: [
      { name: '正面の柵の一揆勢', known: true, count: () => (F.front ? F.front.count : 100) },
      { name: '左右の土塁の鉄砲・弓', known: true, count: () => (F.gunL ? F.gunL.count : 0) + (F.bowR ? F.bowR.count : 0) },
      { name: '本陣の守り', known: false },
    ],
    onStart: (assign) => kinome.onGungiStart(rt, assign),
  };
  // F9：bot の頭で確かめる時（sim の window.__kinomeStrategy か、bot・botrun の画面）は、軍議の札を出さず自分で決める
  // window.__kinomeStrategy は 'front'|'forest'|'towers' のどれか（sim.js から立てる。三つの作戦の勝ち負け・時・損を比べる）
  const auto = window.__kinomeStrategy || (/[?&]bot/.test(location.search) ? 'forest' : null);
  if (auto) { kinome.onGungiStart(rt, { ake: 'front', forest: auto }); return null; }
  return G;
};
kinome.onGungiStart = (rt, assign) => {
  const F = rt.flags;
  F.routeAke = assign.ake || 'front';
  F.routeForest = assign.forest || 'forest';
  if (F.routeForest === 'front' && F.forest) {
    rt.after(14, () => {
      if (F.forestGo || F.ending) return;
      F.forestGo = true;
      F.forest.order = 'move'; F.forest.dest = { x: 0, z: GATE_OUT.z - 10 }; F.forest.speed = 2.3;
      F.forest.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; };
      rt.say('羽柴秀吉', '光秀殿、正面からともに参る', 3);
    });
  }
};

// 素直な遊び手：柵へ進んで戦い、本陣へ
kinome.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const c = F.ake ? F.ake.center() : { x: u.pos.x, z: u.pos.z };
  const tgt = !F.frontFell ? F.front : F.ikkoCamp && F.ikkoCamp.guard;
  if (tgt && tgt.count) { const t = tgt.center ? tgt.center() : tgt; goTo(p, inp, t.x, t.z, 2); return; }
  goTo(p, inp, c.x, c.z + 4, 3);
};

export { kinome };
