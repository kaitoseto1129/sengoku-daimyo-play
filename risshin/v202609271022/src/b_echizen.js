// ======================================================================
// 織田家編　越前一向一揆・木ノ芽峠（天正三年八月十五日）
// 朝倉が滅んだ後の越前は、一向一揆が国を治める「一揆持ち」の国になっていた。
// 長篠の戦いの三か月後、信長は大軍で越前へ攻め入った。一揆勢は木ノ芽峠などに砦を構えて待ち受けたが、
// 明智光秀・羽柴秀吉らは船で海から回って背後の浦に上がり、砦に火を放った。
// 足軽は明智光秀の手。①峠道をふさぐ逆茂木を取り除く ②一の砦の一揆勢を退ける
// ③浦から回った味方の火を合図に、峠の上の砦へ攻め上る
// 向き：北（-z）へ峠を上る。南（+z）が敦賀。東（+x）に海（敦賀湾）
// ======================================================================
import { nobori, hut, yagura, campfire, tawara, jinmaku, stumps } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { namuTex } from './b_nodafukushima.js';
import { distToPolyline } from './world.js';

const ROAD = [[0, 170], [4, 110], [-6, 60], [4, 10], [0, -40], [-8, -90], [0, -140], [4, -190]];
const ABATIS = [{ x: -7, z: 40 }, { x: 1, z: 39 }, { x: 8, z: 38 }];   // 逆茂木
const FORT1 = { x: 2, z: -10 };                                // 一の砦
const TOP = { x: -4, z: -120 };                                // 峠の上の砦
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
// 自分の組が大きいほど、一揆勢も厚くする（組の人数の半分ほどを足す）
const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += Math.max(0, 120 - z) * 0.12;
  const d = distToPolyline(x, z, ROAD);
  h += Math.min(30, Math.max(0, d - 16) * 0.45);
  // 東は海へ下がる
  if (x > 90) h -= Math.min(20, (x - 90) * 0.4);
  return h;
}

const echizen = {
  spawn: { x: 4, z: 96, heading: Math.PI },
  world: {
    seed: 15758,
    time: 'day',
    muddy: 0.3,
    water: { x: 140, level: -2 },
    paths: [ROAD],
    height,
    tint(x, z, h, c) { if (distToPolyline(x, z, ROAD) > 18) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.8); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 15,
    trees: 700,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 20 ? 0.12 : 1),
    groves: [{ x: 34, z: 60, r: 12, n: 16 }, { x: -34, z: -40, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -170,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.cleared = 0;
    namuTex();
    // ---- 逆茂木（道をふさぐ枝の垣。取り除くまで通れない） ----
    F.abatis = ABATIS.map((a, i) => {
      const segs = wallLine(rt, [[a.x - 3.6, a.z], [a.x + 3.6, a.z]], { team: 1, hp: 1e9, name: '逆茂木', segLen: 10, meshOpt: { h: 1.4 } });
      for (const s of segs) { s.noTarget = true; s.wall = true; }
      return { ...a, segs, i };
    });
    // 逆茂木の両脇は崖（通れない）
    for (const sd of [-1, 1]) for (const s of wallLine(rt, [[sd * 11.6, 39], [sd * 26, 36]], { team: 1, hp: 1e9, name: '逆茂木', segLen: 7, meshOpt: { h: 1.4 } })) { s.noTarget = true; s.wall = true; }
    // ---- 一の砦と、峠の上の砦 ----
    for (const [x, z] of [[FORT1.x - 12, FORT1.z - 4], [FORT1.x + 12, FORT1.z - 6]]) rt.scene.add(yagura(W, x, z));
    rt.scene.add(hut(W, FORT1.x - 6, FORT1.z - 14, 7, 5, 0.2, { wall: 0x5a4a38 }));
    for (const [x, z] of [[FORT1.x - 8, FORT1.z + 2], [FORT1.x + 8, FORT1.z + 2], [TOP.x - 8, TOP.z + 8], [TOP.x + 8, TOP.z + 8]]) rt.scene.add(nobori(W, x, z, 'namu', 6));
    F.topHuts = [[TOP.x - 6, TOP.z - 6], [TOP.x + 8, TOP.z - 2]].map(([x, z]) => { rt.scene.add(hut(W, x, z, 8, 5, 0.1, { wall: 0x5a4a38 })); return { x, z }; });
    rt.scene.add(yagura(W, TOP.x + 12, TOP.z + 4));
    // ---- 明智光秀の手（自分の持ち場）、羽柴の手 ----
    F.ake = allyGroup(rt, { name: '明智光秀の手', anchor: { x: 0, z: 88 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], ODA));
    F.akeU = F.ake.units[0];
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: 6, z: 110 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.ake, F.saku];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.78; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 98 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 逆茂木の向こうの一揆勢（弓で射かける） ----
    F.abBow = enemyGroup(rt, { faction: 'saito', name: '逆茂木の向こうの一揆勢', anchor: { x: 0, z: 24 }, facing: 0, width: 14, aggro: 30, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'bow', n: 6 }, { type: 'ashigaru', n: 6 }], IKKO));
    // ---- 大軍（軽い作り）：後ろに続く織田の本隊、海の船団 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(4, 150, 20, 36, 280, Math.PI, 0x2b3140, 'oda', 15751);
    DA(-4, 200, 20, 30, 240, Math.PI, 0x2b3140, 'eiraku', 15752);
    rt.scene.add(jinmaku(W, 0, 136, 16, 10, 5, { mon: 'oda' }), tawara(W, 12, 126, 0.3, 5));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '明智光秀のもとで、下知を待て', 'main');
    rt.say('', '天正三年八月十五日　越前国 木ノ芽峠の南', 3.5);
    rt.say('明智光秀', `${nm(rt)}、この峠の上に一揆の砦が並んでおる。わしの手の半分と羽柴殿の手は、昨夜、船で海から回った`, 5);
    rt.say('明智光秀', 'まずは道をふさぐ逆茂木を取り除く。上から矢が来る。身を低くせよ', 4);
    rt.marker('ake', unitPos(F.akeU), '明智光秀', {});
    rt.after(15, () => this.clear(rt));
  },

  // ① 逆茂木を取り除く
  clear(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('abatis');
    rt.unmark('ake');
    sfx('taiko', 0.8);
    rt.obj('main', `道をふさぐ逆茂木を取り除け（${ABATIS.length}か所）`, 'main');
    for (const a of F.abatis) {
      rt.marker('a' + a.i, a, '逆茂木', { h: 2 });
      rt.addInteract('a' + a.i, { x: a.x, z: a.z + 2 }, '逆茂木を引き倒す', () => this.pull(rt, a), { r: 2.6, hold: 3 });
    }
    F.ake.order = 'move'; F.ake.dest = { x: 0, z: 52 }; F.ake.onArrive = (g) => { g.order = 'hold'; g.aggro = 12; };
    rt.after(18, () => {
      if (F.step !== 1) return;
      F.side = enemyGroup(rt, { faction: 'saito', name: '崖を回ってきた門徒', anchor: { x: -38, z: 30 }, facing: Math.PI * 0.8, order: 'attack', seekRange: 60, aggro: 16, width: 10, morale: 90, fleeDir: { x: -1, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 10 + more(rt, 0.3) }], IKKO));
      rt.army.play('eshout', { x: -38, z: 34 }, 1.5);
      rt.say('足軽', '崖を回って、横から来たぞ！', 2.5);
      rt.marker('side', centerOf(F.side), () => `崖を回ってきた門徒・${moraleWord(F.side.morale)}`, { red: true, group: F.side });
    });
  },
  pull(rt, a) {
    const F = rt.flags;
    rt.uninteract('a' + a.i); rt.unmark('a' + a.i);
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); rt.scene.add(stumps(rt.world, s.seg)); }
    sfx('wood', 0.9);
    F.cleared++;
    rt.award((t) => t.side.push('逆茂木を取り除いた'), '逆茂木を取り除いた');
    if (F.cleared >= ABATIS.length) this.fort1(rt);
    else rt.objProgress('main', `${F.cleared}／${ABATIS.length}`);
  },

  // ② 一の砦
  fort1(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fort1');
    for (const a of F.abatis) { rt.uninteract('a' + a.i); rt.unmark('a' + a.i); }
    sfx('horagai', 0.9);
    rt.banner('道が開いた', '一の砦の一揆勢へ');
    rt.obj('main', '一の砦の一揆勢を退けよ', 'main');
    rt.say('明智光秀', 'かかれ！', 2);
    for (const g of F.oda) { g.order = 'attack'; g.seekRange = 60; }
    F.abBow.order = 'attack'; F.abBow.seekRange = 40;
    F.f1 = enemyGroup(rt, { faction: 'saito', name: '一の砦の一揆勢', anchor: { x: FORT1.x, z: FORT1.z }, facing: 0, order: 'attack', seekRange: 50, aggro: 16, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 18 + more(rt) }, { type: 'gun', n: 2 }], IKKO));
    for (const u of F.f1.units) if (u.type === 'gun') u.dmg *= 0.45;
    rt.marker('f1', centerOf(F.f1), () => `一の砦の一揆勢・${moraleWord(F.f1.morale)}`, { red: true, group: F.f1 });
    rt.say('一揆の門徒', '仏法の敵を、この峠から一歩も通すな！', 3);
    rt.unmark('side');
    rt.after(26, () => {
      if (F.step !== 2) return;
      F.f1b = enemyGroup(rt, { faction: 'saito', name: '一の砦の新手', anchor: { x: FORT1.x + 10, z: FORT1.z - 20 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 12 + more(rt) }, { type: 'bow', n: 3 }], IKKO));
      rt.army.play('eshout', { x: FORT1.x, z: FORT1.z - 20 }, 1.5);
      rt.marker('f1b', centerOf(F.f1b), () => `一の砦の新手・${moraleWord(F.f1b.morale)}`, { red: true, group: F.f1b });
    });
  },

  // ③ 峠の上の砦
  top(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('top');
    rt.unmark('f1'); rt.unmark('f1b');
    for (const q of [F.f1, F.f1b, F.abBow, F.side]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('一の砦を落とした'), '一の砦を落とした');
    // 浦から回った味方が、峠の上の砦の裏に火を放つ
    const W = rt.world;
    for (const h of F.topHuts) { W.addFire(h.x, h.z, { h: 1.6 }); W.addSmokeColumn(h.x, W.heightAt(h.x, h.z) + 6, h.z, { size: 2.8 }); }
    rt.banner('峠の上に煙', '海から回った明智・羽柴の手が、砦の裏に火を放った');
    rt.obj('main', '峠の上の砦へ攻め上れ', 'main');
    rt.say('明智光秀', '合図の煙じゃ！　挟み撃ちにする。一気に上れ！', 3.5);
    for (const g of F.oda) { g.order = 'path'; g.path = ROAD.slice(4, 6); g.pathIdx = 0; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 60; }; }
    F.back = allyGroup(rt, { name: '浦から回った羽柴の手', anchor: { x: TOP.x + 30, z: TOP.z - 20 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, width: 12, aggro: 12, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '羽柴秀吉', invuln: true, hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a } }, { type: 'ashigaru', n: 12 }], ODA));
    F.last = [
      enemyGroup(rt, { faction: 'saito', name: '峠の砦の一揆勢', anchor: { x: TOP.x, z: TOP.z + 14 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 16, morale: 95, fleeDir: { x: -1, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'bow', n: 3 }], IKKO)),
    ];
    rt.after(22, () => { if (!F.ending) { const g = enemyGroup(rt, { faction: 'saito', name: '峠の門徒の新手', anchor: { x: TOP.x - 20, z: TOP.z }, facing: 0.5, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 90, fleeDir: { x: -1, z: -1 }, dmgMult: 0.62 }, dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 12 + more(rt) }], IKKO)); F.last.push(g); rt.marker('t1', centerOf(g), () => `峠の門徒の新手・${moraleWord(g.morale)}`, { red: true, group: g }); } });
    rt.after(48, () => { if (!F.ending) { const g = enemyGroup(rt, { faction: 'saito', name: '砦の奥の門徒', anchor: { x: TOP.x + 4, z: TOP.z - 16 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 100, fleeDir: { x: 1, z: -1 }, dmgMult: 0.6 }, dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 12 + more(rt) }], IKKO)); F.last.push(g); rt.marker('t2', centerOf(g), () => `砦の奥の門徒・${moraleWord(g.morale)}`, { red: true, group: g }); rt.say('一揆の門徒', '退くな！　退けば地獄ぞ！', 3); } });
    rt.marker('t0', centerOf(F.last[0]), () => `峠の砦の一揆勢・${moraleWord(F.last[0].morale)}`, { red: true, group: F.last[0] });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('t0'); rt.unmark('t1'); rt.unmark('t2');
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '木ノ芽峠の砦を落とした', pts: 20 }; }, '任務達成・峠を越えた');
    sfx('horagai', 0.6);
    rt.banner('木ノ芽峠を越えた', '越前の一揆は総崩れとなった');
    rt.say('明智光秀', `……${nm(rt)}、ここから先は、戦ではなくなる。殿（信長公）の下知は、一人も残すな、じゃ`, 5);
    rt.after(6, () => rt.say('', '――越前の一揆は数日のうちに崩れ、多くの門徒が討たれた。この後、越前は柴田勝家に任される', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      if (rt.t - F.stepT > 120) for (const a of F.abatis) if (rt.interacts.some((q) => q.id === 'a' + a.i)) this.pull(rt, a);
    }
    if (F.step === 2) {
      const qs = [F.f1, F.abBow, F.side, F.f1b].filter(Boolean);
      rt.objProgress('main', `一揆勢 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.f1b && gone(F.f1) && gone(F.f1b)) || rt.t - F.stepT > 150) this.top(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `一揆勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 180) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

// 両軍の総勢（織田 三万余り、越前の一揆勢 数万とも。数には諸説ある）
echizen.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 40), b0: 20000 };
};
echizen.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '越前の一揆勢', mon: 'namu' } };
echizen.date = () => '天正三年八月十五日　秋・晴';
echizen.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
echizen.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
echizen.history = '天正元年に朝倉家が滅んだ後、越前では一向一揆が守護代らを倒し、本願寺の坊官が国を治める「一揆持ち」の国となった。天正三年（1575）八月、長篠の戦いから三か月後、信長は三万余りで越前へ攻め入った。一揆勢は木ノ芽峠などに砦を構えて待ち受けたが、明智光秀・羽柴秀吉らは船で海から回って浦に上がり、砦に火を放って挟み撃ちにした。一揆勢は数日のうちに崩れ、信長は逃げる者も容赦なく討たせた。信長が京の者に送った手紙には、府中の町は死骸ばかりで空いた所もない、と書かれている。この後、越前は柴田勝家に任された。兵の数には諸説ある。';

// 素直な遊び手：逆茂木を引き倒し、一の砦の一揆勢と戦い、峠の上へ攻め上る
echizen.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.ake.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 1 ? 5 : 12, (o) => !o.fleeing && (F.step >= 2 || o.pos.z > 40));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('a')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  const tgt = F.step === 2 ? [F.f1, F.f1b, F.side, F.abBow].find((q) => q && !gone(q)) : F.step === 3 ? (F.last || []).find((q) => !gone(q)) : null;
  if (tgt) { const t = tgt.center(); goTo(p, inp, t.x, t.z, 2); return; }
  goTo(p, inp, c.x + 2, c.z + 4, 3);
};

export { echizen };
