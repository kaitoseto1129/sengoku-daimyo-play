// ======================================================================
// 織田家編　刀根坂の戦い（天正元年八月十三日）
// 小谷城を囲む信長に、朝倉義景が後詰に出てきた。大嵐の夜、信長は朝倉方の砦を落とし、
// 朝倉が陣を払って越前へ退くと見るや、自ら先に立って追った。刀根坂で追いついた織田勢は朝倉勢を崩し、
// 名のある者が多く討たれた。美濃を追われて朝倉に身を寄せていた斎藤龍興も、ここで討ち死にしたと伝わる。
// 足軽は信長の馬廻の供。①嵐の夜、信長について峠道を追う ②殿（しんがり）の一の手を破る
// ③山崎吉家・斎藤龍興の殿を破る ④刀根坂の峠まで追い上げる
// 向き：北（-z）へ上る峠道。南（+z）が近江の余呉・木之本の方
// ======================================================================
import { nobori, hut, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { dress, gone, volleyWatch } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';
import { distToPolyline } from './world.js';

// 峠道（南から北へ上る）
const ROAD = [[4, 170], [0, 110], [-10, 60], [-4, 10], [10, -40], [6, -90], [-8, -140], [-4, -190]];
const PASS = { x: -6, z: -150 };           // 刀根坂の峠
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };
const SAITO = { flag: 'saito' };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 北へ上る谷。両側は山
  h += Math.max(0, 120 - z) * 0.11;
  const d = distToPolyline(x, z, ROAD);
  h += Math.min(34, Math.max(0, d - 14) * 0.5);
  h += 16 * gauss(x, z, 70, -60, 2600) + 18 * gauss(x, z, -70, -100, 2600);
  return h;
}

const tonezaka = {
  spawn: { x: 6, z: 132, heading: Math.PI },
  world: {
    seed: 15738,
    time: 'storm',
    lightning: true,
    muddy: 0.95,
    paths: [ROAD],
    height,
    tint(x, z, h, c) { if (distToPolyline(x, z, ROAD) > 16) c.setRGB(c.r * 0.82, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 13,
    trees: 700,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 18 ? 0.15 : 1),
    groves: [{ x: 30, z: 40, r: 12, n: 16 }, { x: -34, z: -60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -175,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 信長の馬廻（自分はこの供） ----
    F.uma = allyGroup(rt, { name: '信長の馬廻', anchor: { x: 2, z: 124 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'column', speed: 3 },
      dress([{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], ODA));
    F.nobuU = F.uma.units[0];
    // 遅れてくる諸将の手（あとから追いつく）
    F.late = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 6, z: 160 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'column', speed: 2.8 },
      dress([{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }], ODA));
    F.oda = [F.uma, F.late];
    for (const g of F.oda) { g.defMult = 1.3; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 138 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 峠道に捨てられた朝倉の荷 ----
    for (const [x, z, r] of [[-14, 30, 0.4], [16, -20, -0.3], [-10, -70, 0.2], [14, -118, 0.1]]) rt.scene.add(tawara(W, x, z, r, 4));
    rt.scene.add(hut(W, -30, 70, 6, 4, 0.3, { wall: 0x5a4a38 }));
    for (const [x, z] of [[-12, 18], [18, -30], [-14, -84], [16, -130]]) rt.scene.add(nobori(W, x, z, 'asakura', 5));
    // ---- 大軍（軽い作り）：峠を越えて退く朝倉の本隊、あとから来る織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.flee = [DA(-4, -200, 20, 30, 260, Math.PI, 0x33291f, 'asakura', 15731), DA(10, -240, 20, 26, 200, Math.PI, 0x33291f, 'asakura', 15732)];
    F.back = DA(4, 200, 20, 30, 260, Math.PI, 0x2b3140, 'oda', 15733);

    rt.setPhase('brief');
    rt.obj('main', '信長公の供をせよ', 'main');
    rt.say('足軽', '……殿（信長公）が、自ら馬を出されたぞ！　先手の方々はまだ誰も来ておらぬ！', 4.5);
    rt.say('織田信長', '朝倉は今夜退く。追え！　一人も越前へ帰すな。……遅れた者は後で叱る', 4.5);
    rt.marker('nobu', unitPos(F.nobuU), '織田信長', {});
    rt.after(14, () => this.chase(rt));
  },

  // ① 峠道を追う
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('chase');
    sfx('horagai', 1);
    rt.banner('追い討ち', '嵐の夜の峠道を、朝倉勢を追う');
    rt.obj('main', '信長公について峠道を追え：朝倉の殿を破れ', 'main');
    const U = F.uma;
    U.order = 'path'; U.path = ROAD.slice(2, 4); U.pathIdx = 0; U.speed = 3; U.aggro = 12;
    U.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: ROAD[3][0], z: ROAD[3][1] + 6 }; };
    F.late.order = 'path'; F.late.path = ROAD.slice(1, 4); F.late.pathIdx = 0;
    F.late.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: ROAD[3][0] + 8, z: ROAD[3][1] + 10 }; };
    // 殿の一の手
    F.r1 = enemyGroup(rt, { faction: 'saito', name: '朝倉の殿', anchor: { x: -6, z: 40 }, facing: 0, order: 'hold', aggro: 16, width: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 2 }], ASA));
    for (const u of F.r1.units) if (u.type === 'gun') u.dmg *= 0.45;
    rt.marker('r1', centerOf(F.r1), () => `朝倉の殿・${moraleWord(F.r1.morale)}`, { red: true, group: F.r1 });
    // 退いていく朝倉の兵（背を向けて逃げる）
    F.stragglers = enemyGroup(rt, { faction: 'saito', name: '退く朝倉の兵', anchor: { x: 4, z: 14 }, facing: Math.PI, width: 8, aggro: 3, morale: 10, fleeDir: { x: 0, z: -1 }, speed: 2.4 },
      dress([{ type: 'ashigaru', n: 10 }], ASA));
    F.stragglers.routed = true; F.stragglers.order = 'flee';
    for (const u of F.stragglers.units) u.fleeing = true;
    for (const h of F.flee) h.retreat(60, 60);
    rt.after(22, () => {
      if (F.step !== 1) return;
      F.r1b = enemyGroup(rt, { faction: 'saito', name: '朝倉の殿の二の手', anchor: { x: 10, z: 10 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], ASA));
      rt.army.play('eshout', { x: 10, z: 10 }, 1.5);
      rt.say('朝倉の侍', '返せ、返せ！　殿を見捨てるな！', 3);
      rt.marker('r1b', centerOf(F.r1b), () => `朝倉の殿の二の手・${moraleWord(F.r1b.morale)}`, { red: true, group: F.r1b });
    });
  },

  // ② 山崎吉家・斎藤龍興の殿
  second(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('second');
    rt.unmark('r1'); rt.unmark('r1b');
    for (const q of [F.r1, F.r1b]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('朝倉の殿の一の手を破った'), '殿の一の手を破った');
    rt.obj('main', '坂の上で待ち受ける殿を破れ', 'main');
    rt.say('織田信長', '止まるな！　坂の上の殿を崩せば、あとは総崩れじゃ', 3.5);
    // 馬廻の鉄砲衆：坂の途中に並び、殿が寄せた所を一斉に撃つ
    { const c = F.uma.center();
      F.gunU = allyGroup(rt, { name: '馬廻の鉄砲衆', anchor: { x: c.x + 4, z: c.z + 4 }, facing: Math.PI, width: 10, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 8 }], ODA));
      F.gunU.order = 'move'; F.gunU.dest = { x: 4, z: -52 }; F.gunU.speed = 2.8; F.gunU.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 4, z: -52 }; gg.aggro = 4; }; }
    rt.after(7, () => { if (F.step === 2) rt.say('柴田勝家', '殿の槍は正面を向いておる。鉄砲で前を崩したら、東の脇から横腹を突け', 4); });
    const U = F.uma;
    U.order = 'path'; U.path = ROAD.slice(4, 6); U.pathIdx = 0;
    U.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; };
    F.late.order = 'path'; F.late.path = ROAD.slice(3, 5); F.late.pathIdx = 0; F.late.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; };
    F.r2 = enemyGroup(rt, { faction: 'saito', name: '山崎吉家の手', anchor: { x: 8, z: -80 }, facing: 0, order: 'hold', aggro: 16, width: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '山崎吉家', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }], ASA));
    F.r3 = enemyGroup(rt, { faction: 'saito', name: '斎藤龍興の手', anchor: { x: -14, z: -96 }, facing: 0.3, order: 'hold', aggro: 16, width: 10, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'busho', n: 1, o: { name: '斎藤龍興', invuln: true, hat: 'kabuto_w', haori: 0x2e3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], SAITO));
    for (const g of [F.r2, F.r3]) { g.units[0].dmg *= 0.5; g.dmgMult = 0.5; g.defMult = 1.25; }
    rt.marker('r2', centerOf(F.r2), () => `山崎吉家の手・${moraleWord(F.r2.morale)}`, { red: true, group: F.r2 });
    rt.marker('r3', centerOf(F.r3), () => `斎藤龍興の手・${moraleWord(F.r3.morale)}`, { red: true, group: F.r3 });
    rt.after(8, () => {
      rt.say('斎藤龍興', '美濃を奪った織田に、ここで一太刀報いてくれる！', 3.5);
      rt.say('足軽', '斎藤……稲葉山の龍興か！', 2.5);
    });
  },

  // ③ 峠まで追い上げる
  toPass(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('pass');
    rt.unmark('r2'); rt.unmark('r3');
    for (const g of [F.r2, F.r3]) if (!gone(g)) { g.noRout = false; g.morale = 0; for (const u of g.units) u.invuln = false; }
    rt.award((t) => t.side.push('坂の上の殿を破った'), '殿を破った');
    sfx('taiko', 1);
    rt.banner('朝倉勢、総崩れ', '峠の方へ、我先にと逃げていく');
    rt.obj('main', '刀根坂の峠まで追い上げよ', 'main');
    rt.marker('pass', PASS, '刀根坂の峠', { h: 2 });
    rt.zone('pass', PASS.x, PASS.z, 7);
    for (const g of F.oda) { g.order = 'path'; g.path = ROAD.slice(5, 7); g.pathIdx = 0; g.onArrive = (q) => { q.order = 'hold'; }; }
    // 峠の手前に、最後まで踏みとどまる一団
    F.r4 = enemyGroup(rt, { faction: 'saito', name: '踏みとどまる朝倉の兵', anchor: { x: -2, z: -128 }, facing: 0, order: 'attack', seekRange: 30, aggro: 14, width: 10, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ASA));
    rt.marker('r4', centerOf(F.r4), () => `踏みとどまる朝倉の兵・${moraleWord(F.r4.morale)}`, { red: true, group: F.r4 });
    for (const h of F.flee) h.rout({ hideAfter: 30 });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('pass'); rt.unzone('pass'); rt.unmark('r4');
    if (F.r4 && !gone(F.r4)) { F.r4.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '刀根坂の峠まで追い上げた', pts: 20 }; }, '任務達成・刀根坂まで追い討った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('刀根坂', '朝倉勢三千余りが討たれた。義景は一乗谷へ逃れた');
    rt.say('織田信長', '……一乗谷まで追え。朝倉を、越前ごと片付ける', 4);
    rt.after(5, () => rt.say('', '――五日後、一乗谷は焼かれた。その二日後、義景は大野で自害し、朝倉家は滅んだ', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    depthTick(rt, dt);
    if (F.dpOn) return;
    if (F.step === 1) {
      const qs1 = [F.r1, F.r1b].filter(Boolean);
      rt.objProgress('main', `殿 ${qs1.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      if (!F.r1On && (p.z < 90 || rt.t - F.stepT > 10)) { F.r1On = true; F.r1.order = 'attack'; F.r1.seekRange = 40; rt.say('朝倉の侍', '追手じゃ！　しんがりの衆、踏みとどまれ！', 3); }
      for (const q of qs1) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.r1b && qs1.every(gone)) || rt.t - F.stepT > 150) {
        rt.unmark('r1'); rt.unmark('r1b');
        for (const q of qs1) if (!gone(q)) q.morale = Math.min(q.morale, 15);
        this.deep(rt, 'A', () => this.second(rt));
      }
    }
    if (F.step === 2) {
      const qs = [F.r2, F.r3];
      // 味方の馬廻が近づいたら、殿も打ちかかる
      if (!F.r2On) { const uc = F.uma.center(), rc = F.r2.center(); if (Math.hypot(uc.x - rc.x, uc.z - rc.z) < 30 || rt.t - F.stepT > 40) { F.r2On = true; for (const g of qs) { g.order = 'attack'; g.seekRange = 50; } } }
      rt.objProgress('main', `殿 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      if (F.r2On) volleyWatch(rt, 'r2', { guns: () => F.gunU, foes: () => qs, r: 22, who: '織田信長', line: '引きつけたな……鉄砲、放て！', sub: '坂の途中から、馬廻の鉄砲衆' });
      for (const q of qs) if (q.count < 5 && q.noRout) { q.noRout = false; q.morale = Math.min(q.morale, 25); q.units[0].invuln = false; }
      if (qs.every(gone) || rt.t - F.stepT > 160) {
        rt.unmark('r2'); rt.unmark('r3');
        for (const g of qs) if (!gone(g)) { g.noRout = false; g.morale = 0; for (const u of g.units) u.invuln = false; }
        this.deep(rt, 'B', () => this.toPass(rt));
      }
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - PASS.x, p.z - PASS.z);
      rt.objProgress('main', `峠まで ${Math.max(0, Math.round(d))}m`);
      if (F.r4 && F.r4.count < 4 && !gone(F.r4)) F.r4.morale = Math.min(F.r4.morale, 20);
      // 踏みとどまる兵を崩したのに峠へ上がらない時は、味方が呼び、それでも来なければ峠を押さえたことにする
      if (gone(F.r4) && d >= 8 && !F.passCall) { F.passCall = true; rt.say('足軽', `${nm(rt)}殿、峠はもうすぐそこじゃ！　旗の立つ所まで上がりましょうぞ`, 3.5); }
      if ((d < 8 && gone(F.r4)) || rt.t - F.stepT > 120 || (gone(F.r4) && rt.t - F.stepT > 75)) {
        rt.unmark('pass'); rt.unzone('pass'); rt.unmark('r4');
        if (F.r4 && !gone(F.r4)) F.r4.morale = 0;
        this.win(rt);   // 峠の後の段（C）は、戦が長くなるので省く
      }
    }
  },

  // 段を重ねる（b_depth.js）：A 朝倉の返し合わせ（殿の一の手の後）→ B 朝倉の後備え（山崎・龍興の後）→ C 峠の向こうから引き返す朝倉勢
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, tzCtx(rt), which === 'A' ? tzA() : which === 'B' ? tzB() : tzC(), () => { F.dpOn = false; then(); });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; }
  },
  onRout(rt, g) {
    if (g.team !== 1 || g === rt.flags.stragglers) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（信長の追手 三万ほど、朝倉 二万ほど。数には諸説ある）
tonezaka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 60 - (F.step >= 3 ? 3000 : 0)), b0: 20000 };
};
tonezaka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '朝倉軍', mon: 'asakura' } };
tonezaka.date = () => '天正元年八月十三日　秋・大嵐・夜';
tonezaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '追い討ちの下知まで待つ' : '');
tonezaka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tonezaka.history = '天正元年（1573）八月、織田信長は浅井長政の小谷城を囲んだ。後詰に出てきた朝倉義景は、大嵐の夜に大嶽などの砦を落とされると、陣を払って越前へ退き始めた。信長はこれを読んでいて、諸将に「油断するな」と命じていたが、先手の諸将は遅れ、信長は自ら先に立って追った（あとで諸将を叱ったと『信長公記』は伝える）。刀根坂で追いついた織田勢は朝倉勢を崩し、三千余りを討った。朝倉の重臣・山崎吉家や、美濃を追われて朝倉に身を寄せていた斎藤龍興も討ち死にしたと伝わる。義景は一乗谷へ逃れたが、一乗谷は焼かれ、八月二十日、大野で自害して朝倉家は滅んだ。兵の数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tonezaka.lordAt = { x: 2, z: 128, r: 12, why: '馬廻の先頭（信長は自ら馬を出し、朝倉勢を追った）' };

// 素直な遊び手：信長の馬廻について峠道を上り、殿と戦い、峠まで追い上げる
tonezaka.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.uma.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x + 2, c.z + 6, 2); return; }
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
  const tgt = F.step === 1 ? [F.r1, F.r1b].find((q) => q && !gone(q)) : F.step === 2 ? [F.r2, F.r3].find((q) => !gone(q)) : F.step === 3 ? (gone(F.r4) ? null : F.r4) : null;
  // 味方が寄せるのを待ってから（一人で敵の塊に入らない）
  if (tgt && !gone(tgt)) { const t = tgt.center(); if (F.step === 2 && Math.hypot(c.x - t.x, c.z - t.z) > 16) { goTo(p, inp, c.x, c.z + 3, 3); return; } goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 3) { goTo(p, inp, PASS.x, PASS.z, 3); return; }
  goTo(p, inp, c.x + 2, c.z + 4, 3);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 追い討ちの戦でも、朝倉は大勢で何度も返し合わせてくる。先に立った信長の馬廻は少なく、左右の尾根から包まれかける
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 80, kind: 'gun', ...o });
function tzCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'asakura', armor: 0x33291f, dmg: 0.64, mass: 260, look: (l) => dress(l, ASA),
    friends: () => [F.uma, F.late].filter((g) => g && g.count && !g.routed) };
}
// A 殿の一の手を破った後：返し合わせ → 信長公を守るか、荷駄を押さえるか
function tzA() {
  const at = { x: 4, z: -30 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['足軽', '殿（しんがり）を破った……じゃが、嵐で前が見えぬ'], ['織田信長', '止まるな。……いや、待て。前の闇が動いておる']] }),
    hold({ at, dur: 90, r: 14, title: '返し合わせ', sub: '退くと見せた朝倉勢が、大勢で向き直る', label: '信長の馬廻', obj: '峠道で、向き直った朝倉勢を受けよ（信長公のそばを離れるな）',
      say: [['織田信長', '返してきたか。面白い、受けよ！']],
      waves: [
        { t: 4, say: ['足軽', '嵐の中から、一面に槍が……！'], foes: () => [{ name: '返し合わせる朝倉勢', from: { x: 6, z: -76 }, list: [uS(3), uA(13)], mass: 380, noRout: 25 }] },
        { t: 28, say: ['足軽', '火縄の火が並んでおる！　鉄砲じゃ、伏せよ！'], foes: () => [gunLine('朝倉の鉄砲衆', { x: 24, z: -64 }, 8)] },
        { t: 52, say: ['足軽', '左の尾根から下りてくる！　馬廻の横を突く気じゃ！'], foes: () => [{ name: '左の尾根の朝倉勢', from: { x: -48, z: -40 }, off: { x: -8, z: 0 }, list: [uS(2), uA(10)], mass: 260 }] },
        { t: 78, say: ['柴田勝家', '右もじゃ！　殿（信長公）をお守りせよ！'], foes: () => [{ name: '右の尾根の朝倉勢', from: { x: 48, z: -20 }, off: { x: 8, z: 4 }, list: [uS(2), uA(10)], mass: 240 }] },
      ],
      reward: '返し合わせる朝倉勢を受け止めた', lost: ['柴田勝家', '押し返されたか……！　殿、お下がりを！'] }),
    rest({ dur: 7, bark: '立て直し：嵐の中で組を集める', say: [['足軽', '道の脇に、朝倉の荷駄が捨ててある……兵糧と鉄砲の玉薬じゃ'], ['柴田勝家', '拾うておる暇はない。……いや、あれを取られたまま退かれては']] }),
    pick({ title: '朝倉の荷駄（兵糧と玉薬）が道の脇に残っている。どうする？',
      options: [{ label: '西の沢の荷駄を押さえ、焼き払う', note: '朝倉の鉄砲の玉薬が尽き、後で鉄砲が少なくなる。守りの者と斬り合う' }, { label: '構わず、信長公について坂を追い上げる', note: '早く追いつける。朝倉は鉄砲を残したまま坂の上で待つ' }],
      on: (rt, m, i) => { m.tzCart = i === 0; rt.say('柴田勝家', i === 0 ? '焼け！　玉薬に火をつけるなよ、離れて焼け' : '坂じゃ！　殿に遅れるな', 3); } }),
    fight({ skip: (rt, m) => !m.tzCart, at: { x: -34, z: -56 }, title: '西の沢の荷駄', sub: '荷駄を守る朝倉の者が、槍を構える', obj: '西の沢の荷駄を守る朝倉勢を崩せ',
      foes: () => [{ name: '荷駄を守る朝倉勢', from: { x: -50, z: -80 }, list: [uS(2), uA(11)], mass: 200 }],
      later: [{ t: 36, title: '横槍', sub: '朝倉の騎馬が荷駄を取り返しに', say: ['足軽', '騎馬が引き返してきた！'], foes: () => [{ name: '引き返す朝倉の騎馬', from: { x: -20, z: -96 }, list: [uS(1), uC(5), uA(3)], mass: 100, kind: 'cavalry' }] }],
      max: 130, reward: (t) => { t.special = { label: '朝倉の荷駄を焼いた', pts: 15 }; }, rewardLabel: '朝倉の荷駄を焼いた',
      onEnd: (rt) => { const W = rt.world; W.addFire(-36, -58, { h: 1.5 }); W.addFire(-32, -60, { h: 2 }); } }),
  ];
}
// B 山崎・龍興を破った後：朝倉の後備えが坂を塞ぐ → 包み込まれる
function tzB() {
  const at = { x: 6, z: -104 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['足軽', '龍興の手が崩れた……！'], ['織田信長', 'まだじゃ。坂の上に、朝倉の後備えが揃うておる']] }),
    pick({ title: '坂の上の朝倉の後備えを、どう攻める？',
      options: [{ label: '馬廻と一緒に、坂を正面から押し上がる', note: '味方と一緒に押す。坂の上からの鉄砲と槍を正面で受ける' }, { label: '組を連れて東の尾根を回り、後備えの横を突く', note: '横から突けば後備えは崩れやすい。尾根の上で待ち伏せに遭うかもしれぬ' }],
      on: (rt, m, i) => { m.tzRidge = i === 1; rt.say('織田信長', i === 1 ? '行け。横から突け' : '押し上がれ！', 3); } }),
    fight({ skip: (rt, m) => !m.tzRidge, at: { x: 40, z: -100 }, title: '東の尾根', sub: '尾根の上に、朝倉の伏兵', obj: '東の尾根の伏兵を崩し、後備えの横へ出よ',
      foes: () => [{ name: '尾根の伏兵', from: { x: 56, z: -120 }, list: [uS(2), uA(10)], mass: 200 }],
      max: 100, reward: '東の尾根を取った' }),
    hold({ at, dur: 100, r: 14, title: '朝倉の後備え', sub: '坂の上から、朝倉の後備えが大勢で押し下る', label: '坂の途中', obj: '坂の途中で、朝倉の後備えの大波を受け止めよ',
      waves: [
        { t: 4, say: ['足軽', '上から、大勢で押し下ってくる！'], foes: (rt, m) => [{ name: '朝倉の後備え', from: { x: at.x, z: at.z - 56 }, list: [uS(4), uA(m.tzRidge ? 10 : 14)], mass: m.tzRidge ? 280 : 420, noRout: 25, morale: m.tzRidge ? 75 : 95 }] },
        { t: 26, if: (rt, m) => !m.tzCart, say: ['足軽', '坂の上に鉄砲衆じゃ！　木の陰へ寄れ！'], foes: () => [gunLine('坂の上の朝倉の鉄砲衆', { x: at.x + 18, z: at.z - 44 }, 10)] },
        { t: 26, if: (rt, m) => m.tzCart, say: ['柴田勝家', '玉薬を焼いたおかげで、鉄砲は少ないぞ！'], foes: () => [gunLine('朝倉の鉄砲', { x: at.x + 18, z: at.z - 44 }, 4)] },
        { t: 54, say: ['足軽', '左の谷から回り込んできた！'], foes: () => [{ name: '谷を回る朝倉勢', from: { x: at.x - 50, z: at.z - 10 }, off: { x: -8, z: 0 }, list: [uS(2), uA(10)], mass: 260 }] },
        { t: 80, say: ['柴田勝家', '後ろじゃ！　下の道に朝倉の一手が回った！'], foes: () => [{ name: '後ろへ回った朝倉勢', from: { x: at.x - 10, z: at.z + 56 }, list: [uS(2), uA(10)], mass: 240 }] },
      ],
      reward: '朝倉の後備えを受け止めた', lost: ['柴田勝家', '押し下げられた……！　じゃが、朝倉も息が切れておる'] }),
  ];
}
// C 峠に着いた後：越前の方から引き返してくる朝倉勢 → 峠を越えて追うか、峠を固めるか
function tzC() {
  const at = { x: PASS.x, z: PASS.z };
  return [
    rest({ dur: 7, heal: 0.3, say: [['足軽', '峠じゃ……！　向こうは越前の谷じゃ'], ['伝令', '峠の向こうから、朝倉の一手が引き返してまいります！　義景の本隊を逃がすための捨て石と！']] }),
    pick({ title: '峠の向こうから、朝倉の一手が引き返してくる。どうする？',
      options: [{ label: '峠を越え、下り坂で迎え撃つ', note: '越前の谷へ踏み込む。討てば大手柄。深入りすれば囲まれる' }, { label: '峠の上で槍を揃え、後から来る味方を待つ', note: '峠の上は守りやすい。手柄は手堅い' }],
      on: (rt, m, i) => { m.tzOver = i === 0; rt.say('織田信長', i === 0 ? '越えよ。一人も越前へ帰すな' : 'よし、峠を押さえよ。勝家、後の者を急がせよ', 3); } }),
    fight({ skip: (rt, m) => !m.tzOver, at: { x: -4, z: -176 }, title: '峠の向こう', sub: '越前の谷へ下る道で、朝倉の捨て石が向き直る', obj: '峠の向こうの下り坂で、引き返す朝倉勢を崩せ',
      foes: () => [{ name: '引き返す朝倉勢', from: { x: -4, z: -206 }, list: [uS(3), uA(13)], mass: 360, noRout: 20 }],
      later: [{ t: 30, title: '鉄砲', sub: '谷の下から鉄砲衆が撃ち上げる', say: ['足軽', '谷の下に鉄砲が並んだ！'], foes: () => [gunLine('谷の鉄砲衆', { x: 16, z: -200 }, 8)] },
        { t: 60, title: '囲まれる', sub: '左右の藪から朝倉勢が', say: ['足軽', '藪の左右から出てきた！　囲まれるぞ！'], foes: () => [{ name: '左の藪の朝倉勢', from: { x: -40, z: -180 }, list: [uS(1), uA(9)], mass: 180 }, { name: '右の藪の朝倉勢', from: { x: 32, z: -176 }, list: [uS(1), uA(9)], mass: 180 }] }],
      max: 160, reward: (t) => { t.special = { label: '峠を越えて朝倉の捨て石を崩した', pts: 25 }; }, rewardLabel: '峠を越えて朝倉の捨て石を崩した' }),
    hold({ skip: (rt, m) => m.tzOver, at, dur: 100, r: 12, title: '峠の上', sub: '峠へ押し上がってくる朝倉の捨て石', label: '刀根坂の峠', obj: '峠の上で、押し上がってくる朝倉勢を防げ',
      waves: [
        { t: 4, say: ['足軽', '来たぞ、峠の向こうから！'], foes: () => [{ name: '引き返す朝倉勢', from: { x: -4, z: -196 }, list: [uS(3), uA(12)], mass: 320 }] },
        { t: 40, say: ['足軽', '鉄砲を並べて撃ち上げてくる！'], foes: () => [gunLine('谷の鉄砲衆', { x: 14, z: -190 }, 8)] },
        { t: 66, say: ['柴田勝家', '最後の一押しじゃ！'], foes: () => [{ name: '朝倉の最後の一手', from: { x: -20, z: -196 }, list: [uS(2), uA(11)], mass: 260 }] },
      ],
      reward: '刀根坂の峠を守り抜いた' }),
  ];
}

export { tonezaka };
