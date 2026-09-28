// ======================================================================
// 織田家編　雑賀攻め・小雑賀川（天正五年二月）
// 石山本願寺を鉄砲で支える紀伊の雑賀衆を討つため、信長は大軍で紀伊へ攻め入った。
// 小雑賀川を渡ろうとした堀秀政らの手は、川底に沈めた桶や乱杭に足を取られ、対岸の柵の内から鉄砲を浴びて苦しんだ。
// 戦は長引いたが、三月、鈴木孫一ら雑賀の者は誓紙を出して降った（のちにまた本願寺に味方する）。
// 足軽は堀秀政の手。①川の中の乱杭を抜いて、渡る道を開ける（対岸の鉄砲の下で） ②川を渡り、柵の前の雑賀衆を崩す
// ③雑賀の鉄砲衆の打って出を受け止める
// 向き：北（-z）の小雑賀川の向こうに雑賀の柵。南（+z）に織田の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, tawara, stumps } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more, customFlag } from './b_inabayama.js';

const RIVER = [[-240, -22], [-100, -18], [0, -20], [100, -24], [240, -18]];
const FENCE_Z = -44;                       // 対岸の柵
const STAKES = [{ x: -8, z: -18 }, { x: 10, z: -21 }, { x: 28, z: -22 }];      // 川の中の乱杭
const ODA = { flag: 'oda' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'yatagarasu' };

// 雑賀の鈴木氏の旗印：八咫烏（三本足の烏）を墨で
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();          // 胴
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();                       // 頭
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();   // 嘴
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }   // 翼
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();   // 尾
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }   // 三本の足
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();   // 目
  });
}

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 対岸は少し高い台（雑賀の砦）
  h += 2.2 / (1 + Math.exp((z - (FENCE_Z + 8)) / 3));
  // 北の和歌山の山と、南の山
  h += 40 * gauss(x, z, -60, -220, 9000) + 30 * gauss(x, z, 120, 200, 9000);
  return h;
}

const saika = {
  spawn: { x: 6, z: 40, heading: Math.PI },
  world: {
    seed: 15772,
    time: 'day',
    muddy: 0.6,
    streams: [{ pts: RIVER, w: 12, depth: 1.1 }],
    paths: [[[0, 150], [0, 30], [0, FENCE_Z + 4]]],
    height,
    tint(x, z, h, c) { if (z < 0 && z > -34) c.lerp({ r: 0.42, g: 0.42, b: 0.34 }, 0.4); },
    clear: (x, z) => Math.abs(x) < 90 && z > -90 && z < 80,
    trees: 320,
    tufts: 4000,
    treeDensity: (x, z) => (Math.abs(x) < 100 && z > -100 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -70, z: 30, r: 12, n: 16 }, { x: 70, z: -70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -110 || Math.abs(x) > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.pulled = 0;
    crowTex();
    // ---- 川の中の乱杭（抜くまで通れない。両脇も杭で塞がれている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.stakes = STAKES.map((a, i) => ({ ...a, i, segs: noT(wallLine(rt, [[a.x - 4, a.z], [a.x + 4, a.z]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } })) }));
    noT(wallLine(rt, [[-60, -19], [-12, -18]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[-4, -19], [6, -21]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[14, -21], [24, -22]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[32, -22], [60, -23]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    // ---- 対岸の柵（口が二つ）と小屋・櫓 ----
    noT(wallLine(rt, [[-60, FENCE_Z], [-14, FENCE_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[-6, FENCE_Z], [10, FENCE_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[18, FENCE_Z], [60, FENCE_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z, r] of [[-20, -60, 0.1], [14, -64, -0.2], [36, -56, 0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x5a4a38 }));
    rt.scene.add(yagura(W, -30, FENCE_Z - 4), yagura(W, 30, FENCE_Z - 4));
    for (const [x, z] of [[-40, FENCE_Z - 3], [-2, FENCE_Z - 3], [26, FENCE_Z - 3], [44, FENCE_Z - 3]]) rt.scene.add(nobori(W, x, z, 'yatagarasu', 6));
    // ---- 堀秀政の手（自分の持ち場）と、鉄砲衆 ----
    F.hori = allyGroup(rt, { name: '堀秀政の手', anchor: { x: 0, z: 26 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_m', haori: 0x2e3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.horiU = F.hori.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 22, z: 10 }, facing: Math.PI, width: 12, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.hori, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 34 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 柵の内の雑賀の鉄砲 ----
    F.fenceGun = enemyGroup(rt, { faction: 'saito', name: '柵の内の雑賀衆', anchor: { x: 0, z: FENCE_Z - 2.4 }, facing: 0, width: 50, aggro: 44, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], SAIKA));
    for (const u of F.fenceGun.units) if (u.type === 'gun') u.dmg *= 0.35;
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(jinmaku(W, 0, 70, 18, 10, 5, { mon: 'oda' }), tawara(W, -16, 60, 0.3, 6));
    for (const [x, z, k] of [[-8, 60, 'oda'], [8, 60, 'eiraku'], [-30, 30, 'oda'], [30, 34, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(-70, 50, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('oda'), 15721);
    DA(70, 50, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('eiraku'), 15722);
    DA(0, -110, 50, 12, 220, 0, 0x2a2622, flagTexture('yatagarasu'), 15723);
    for (const [x, z] of [[-24, 56], [24, 58]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.shotT = 2;

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '堀秀政のもとで、下知を待て', 'main');
    rt.say('堀秀政', `${nm(rt)}、川の向こうが雑賀の柵じゃ。雑賀の鉄砲は日の本一と聞く。……先に渡った者が、川の中で足を取られて撃たれた`, 5.5);
    rt.say('堀秀政', '川底に乱杭が打ってある。まずはそれを抜いて、渡る道を開ける', 4);
    rt.marker('hori', unitPos(F.horiU), '堀秀政', {});
    rt.after(15, () => this.stakes(rt));
  },

  // ① 乱杭を抜く
  stakes(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('stakes');
    rt.unmark('hori');
    sfx('taiko', 0.8);
    rt.obj('main', `川の中の乱杭を抜いて、渡る道を開けよ（${STAKES.length}か所）`, 'main');
    for (const a of F.stakes) {
      rt.marker('s' + a.i, a, '乱杭', { h: 2 });
      rt.addInteract('s' + a.i, { x: a.x, z: a.z + 2.2 }, '乱杭を抜く', () => this.pull(rt, a), { r: 2.6, hold: 3 });
    }
    F.teppo.order = 'move'; F.teppo.dest = { x: 10, z: -4 }; F.teppo.onArrive = (g) => { g.order = 'hold'; };
    // 川を渡って出てくる雑賀の者
    rt.after(16, () => {
      if (F.step !== 1) return;
      F.w0 = enemyGroup(rt, { faction: 'saito', name: '川へ下りた雑賀衆', anchor: { x: -44, z: -8 }, facing: Math.PI / 2, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], SAIKA));
      rt.marker('w0', centerOf(F.w0), () => `川へ下りた雑賀衆・${moraleWord(F.w0.morale)}`, { red: true, group: F.w0 });
      rt.say('足軽', '西の川べりから、雑賀の者が回り込んできた！', 2.5);
    });
  },
  pull(rt, a) {
    const F = rt.flags;
    rt.uninteract('s' + a.i); rt.unmark('s' + a.i);
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); rt.scene.add(stumps(rt.world, s.seg)); }
    sfx('wood', 0.9);
    F.pulled++;
    rt.award((t) => t.side.push('乱杭を抜いた'), '乱杭を抜いた');
    if (F.pulled >= STAKES.length) this.cross(rt);
    else rt.objProgress('main', `${F.pulled}／${STAKES.length}`);
  },

  // ② 渡って柵の前の雑賀衆を崩す
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('cross');
    for (const a of F.stakes) { rt.uninteract('s' + a.i); rt.unmark('s' + a.i); }
    sfx('horagai', 1);
    rt.banner('道が開いた', '川を渡り、柵の前の雑賀衆へ');
    rt.obj('main', '川を渡り、柵の前の雑賀衆を崩せ', 'main');
    rt.say('堀秀政', '渡れ！　止まれば撃たれる、走れ！', 3);
    F.hori.order = 'attack'; F.hori.seekRange = 70;
    F.front = enemyGroup(rt, { faction: 'saito', name: '柵の前の雑賀衆', anchor: { x: 2, z: FENCE_Z + 8 }, facing: 0, order: 'hold', aggro: 18, width: 18, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 + more(rt) }, { type: 'gun', n: 3 }], SAIKA));
    for (const u of F.front.units) if (u.type === 'gun') u.dmg *= 0.4;
    rt.marker('front', centerOf(F.front), () => `柵の前の雑賀衆・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(24, () => {
      if (F.step !== 2) return;
      F.front2 = enemyGroup(rt, { faction: 'saito', name: '柵の口から出た雑賀衆', anchor: { x: 14, z: FENCE_Z - 4 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 10, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], SAIKA));
      rt.army.play('eshout', { x: 14, z: FENCE_Z }, 1.5);
      rt.marker('front2', centerOf(F.front2), () => `柵の口から出た雑賀衆・${moraleWord(F.front2.morale)}`, { red: true, group: F.front2 });
    });
  },

  // ③ 雑賀の鉄砲衆の打って出
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('counter');
    rt.unmark('front'); rt.unmark('front2');
    for (const q of [F.front, F.front2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('柵の前の雑賀衆を崩した'), '柵の前を崩した');
    rt.banner('雑賀の打って出', '鈴木孫一の鉄砲衆が、柵の口から押し出してくる');
    rt.obj('main', '打って出た雑賀の鉄砲衆を受け止めよ', 'main');
    rt.say('足軽', '三本足の烏の旗……雑賀の孫一じゃ！', 3);
    F.last = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: FENCE_Z - 8 }, facing: 0, order: 'attack', seekRange: 70, aggro: 18, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 }, dress(list, SAIKA));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4;
      F.last.push(g);
      rt.marker('l' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: FENCE_Z - 6 }, 1.5);
    };
    mk(-10, '鈴木孫一の鉄砲衆', [{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 10 + more(rt) }]);
    rt.after(35, () => { if (!F.ending) mk(14, '雑賀の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }]); });
    rt.after(70, () => { if (!F.ending) { mk(-30, '根来から来た鉄砲衆', [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 10 + more(rt) }]); rt.say('足軽', '西の柵の口からも！', 2.5); } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    for (const q of [...(F.last || []), F.fenceGun]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '小雑賀川を渡り、雑賀衆を退けた', pts: 20 }; }, '任務達成・雑賀衆を退けた');
    sfx('horagai', 0.6);
    rt.banner('雑賀衆、退く', '柵を捨てて、奥の山へ退いた');
    rt.say('堀秀政', `……勝ったとは言えぬな、${nm(rt)}。あの鉄砲衆は、まだ山の奥におる`, 4.5);
    rt.after(5, () => rt.say('', '――三月、鈴木孫一らは誓紙を出して降った。だが雑賀衆は、やがてまた本願寺に味方する', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    // 柵の内の鉄砲の音（遠くで絶えず）
    if (F.step <= 2 && (F.shotT -= dt) <= 0) {
      F.shotT = 1 + Math.random() * 2;
      const x = -50 + Math.random() * 100;
      rt.army.play('gun', { x, z: FENCE_Z - 2 }, 0.5);
      rt.army.smoke(x, rt.world.heightAt(x, FENCE_Z) + 1.4, FENCE_Z - 1, 0, 1, 0.6);
    }
    if (F.step === 1) {
      if (F.w0 && F.w0.count < 3 && !gone(F.w0)) F.w0.morale = Math.min(F.w0.morale, 20);
      // 抜きに来ない時：堀がやり方を言い、それでも来なければ足軽が残りを抜く（待たせきりにしない）
      const w = rt.t - F.stepT;
      rt.objProgress('main', `${F.pulled}／${STAKES.length}${F.w0 && !gone(F.w0) ? `・雑賀衆 ${F.w0.count}人` : ''}`);
      if (w > 45 && !F.nudge) { F.nudge = true; rt.say('堀秀政', `${nm(rt)}、乱杭はまだか！　印の杭の前で「乱杭を抜く」を長く押せ`, 4); }
      if (w > 85 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、杭抜きは我らも手を貸しまする', 3); }
      if (w > 105) for (const a of F.stakes) if (rt.interacts.some((q) => q.id === 's' + a.i)) this.pull(rt, a);
    }
    if (F.step === 2) {
      const qs = [F.front, F.front2].filter(Boolean);
      rt.objProgress('main', `雑賀衆 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      if (!F.frontOn && Math.hypot(rt.player.u.pos.x - F.front.center().x, rt.player.u.pos.z - F.front.center().z) < 30) { F.frontOn = true; F.front.order = 'attack'; F.front.seekRange = 40; }
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.front2 && qs.every(gone)) || rt.t - F.stepT > 160) this.counter(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `雑賀衆 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 190) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 十万とも言われる大軍、雑賀衆 数千。数には諸説ある）
saika.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(60000 - (F.ak || 0) * 30), a0: 60000, b: Math.max(0, 6000 - (F.ek || 0) * 30), b0: 6000 };
};
saika.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '雑賀衆', mon: 'yatagarasu' } };
saika.date = () => '天正五年二月　春・晴';
saika.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
saika.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
saika.history = '紀伊の雑賀衆は、多くの鉄砲を持つ地侍の集まりで、石山本願寺に味方して織田勢を苦しめていた。天正五年（1577）二月、信長は雑賀の中の三つの郷と根来の者を味方につけ、大軍で紀伊へ攻め入った（十万とも言われるが、数には諸説ある）。小雑賀川を渡ろうとした堀秀政らの手は、川底に沈められた桶や乱杭に足を取られ、対岸の柵の内から鉄砲を浴びて苦しんだと伝わる。戦は長引いたが、三月、鈴木孫一（重秀）ら雑賀の主な者は誓紙を出して降った。しかし雑賀衆はその後も本願寺に味方し、信長の死まで紀伊は治まらなかった。雑賀の鈴木氏の旗印とされる八咫烏を、ここでは墨の烏で描いている。';

// 素直な遊び手：乱杭を抜き、川を渡り、柵の前の雑賀衆と戦い、打って出を受け止める
saika.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 24, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 1 ? 7 : 12, (o) => !o.fleeing && o.pos.z > FENCE_Z + 0.8);
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
    for (const x of b.interacts) if (x.id.startsWith('s')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.2) goTo(p, inp, it.pos.x, it.pos.z, 0.9); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { if (u.pos.z > -14 && STAKES.every((a) => Math.abs(u.pos.x - a.x) > 3)) { goTo(p, inp, STAKES[0].x, -14, 1); return; } const q = [F.front, F.front2].find((x) => x && !gone(x)); const c = q ? q.center() : { x: 0, z: FENCE_Z + 6 }; goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, FENCE_Z + 3), 2); return; } goTo(p, inp, 0, FENCE_Z + 8, 2); }
};

export { saika };
