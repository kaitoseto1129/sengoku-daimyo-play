import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// 雑賀攻め・小雑賀川。史料の芯は信長公記巻十「雑賀御陣之事」。
// 渡河 → 高岸と鉄砲に阻まれる → 東岸へ引く → 川を限って対陣。
// 桶・杭、局地の回り込み、秒数と人数は遊びの補完。川岸の寸法は旧配置を回転。
import * as THREE from 'three';
import { nobori, hut, yagura, stumps, village } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightUnit } from './battle_sight.js';
import { addTaba, tickTabas, patchGunCover } from './taketaba.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress, customFlag } from './b_inabayama.js';
import { camp } from './b_mid.js';
import { battleEvent, EVENT_RETREAT, EVENT_MESSENGER } from './battle_events.js';
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const WEST = -Math.PI / 2, EAST = Math.PI / 2;
const RIVER = [[-22, 240], [-18, 100], [-20, 0], [-24, -100], [-18, -240]];
const BANK = -44;
const STAKES = [{ x: -19, z: 18 }, { x: -20, z: 0 }, { x: -21, z: -18 }];
const ODA = { flag: 'oda' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'yatagarasu' };
const SHORE = { x: -34, z: 0 }, BACK = { x: 12, z: 0 };
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
  let h = 0.35 * Math.sin(-z * 0.03 + 0.2) * Math.cos(x * 0.028) + 0.25 * Math.sin(x * 0.07 - z * 0.02);
  h += 3.2 / (1 + Math.exp((x - (BANK + 8)) / 2.4));
  return h + 30 * gauss(x, z, 90, 250, 6000);
}
function moveGroup(g, to, facing) {
  if (g.routed || !g.count) return;
  g.order = 'move'; g.dest = to; g.aggro = 6; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'hold'; q.facing = facing; q.aggro = 10; q.formation = q.units.every((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari'; };
}
function phase(rt, step, name, text, at, label) {
  const F = rt.flags;
  F.step = step; F.stepT = rt.t; F.inT = 0;
  rt.setPhase(name); rt.obj('main', text, 'main'); rt.objProgress('main', '');
  rt.unmark('goal');
  if (at) rt.marker('goal', at, label, { h: 3 });
}
// 表すのは目の前の持ち場だけ。人数と各将の座標は復元で、紀州全軍の総数ではない。
// 稲葉父子・氏家・飯沼の紀ノ川の守り、浜手の信長・信忠・孫一は画面外。
const JIN = [
  rosterPlan('川岸の対陣', 0, { x: 72, z: 0 }, WEST, [
    ['sakuma', '山手の後ろの陣', '佐久間信盛', 16, 72, 0, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['hori', '渡河の先手', '堀秀政', 25, 26, 0, 'oda', 'oda', 0, { bind: 'hori' }],
    ['guns', '東岸の鉄砲', '堀秀政の配下（名は不明）', 12, 4, -20, 'oda', 'oda', 0, { bind: 'teppo' }],
    ['north', '川上の控え', '山手の将（名は不明）', 120, 50, -70, 'oda', 'oda', 120, { w: 36, d: 24 }],
    ['south', '川下の控え', '山手の将（名は不明）', 120, 50, 70, 'oda', 'oda', 120, { w: 36, d: 24 }],
    ['rear', '陣の後ろの控え', '佐久間の配下（名は不明）', 60, 110, 0, 'oda', 'oda', 60, { w: 24, d: 18 }],
  ], '信長公記巻十。佐久間の参加は史料、局地の本陣・持ち場と人数は復元'),
  rosterPlan('高岸の守り', 1, { x: -110, z: 0 }, EAST, [
    ...[-24, -12, 0, 12, 24].map((z, i) => ['gun' + i, '柵の鉄砲の小組', '雑賀の将（名は不明）', 5, -47, z, 'yatagarasu', 'yatagarasu', 0, { bind: 'gunPosts.' + i }]),
    ['spear', '柵の控え', '雑賀の将（名は不明）', 20, -57, 0, 'yatagarasu', 'yatagarasu', 0, { bind: 'reserve' }],
    ['upstream', '川上の柵と林', '雑賀の将（名は不明）', 72, -57, -64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18 }],
    ['downstream', '川下の柵と家', '雑賀の将（名は不明）', 72, -57, 64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18 }],
    ['rear', '西岸の後備え', '雑賀の将（名は不明）', 100, -110, 0, 'yatagarasu', 'yatagarasu', 100, { w: 30, d: 24 }],
    ['scout', '川下を回った小組', '雑賀の将（名は不明）', 8, 0, 90, 'yatagarasu', 'yatagarasu', 0, { bind: 'skirmish' }],
    ['northRaid', '川上を回った小組', '雑賀の将（名は不明）', 14, 4, -140, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.1' }],
    ['southRaid', '川下を回った小組', '雑賀の将（名は不明）', 14, 4, 140, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.0' }],
  ], '信長公記巻十。川岸の将名は不明。川上・川下の渡りと小組の動きは復元'),
];
const saika = {
  jinkei: JIN,
  noTaisho: true, // 信長・孫一をこの局地へ自動配置し、討取り・本陣襲撃で決着させない。
  noDistantBattle: true, // 備え表にない軍勢と川を越える自動の押し合いを足さない。
  botOrders: true, // 杭抜き・渡河・引き退きの道順を、遊び手の突進で上書きしない。
  noWake: true, // 本物の兵は配下を含めても約170人。大軍を近接兵へ替えない。
  spawn: { x: 40, z: -6, heading: WEST },
  world: {
    seed: 15772, time: 'day', fieldStage: 'fallow', muddy: 0.6, waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 0.65 }],
    paths: [[[150, 0], [30, 0], [-34, 0]]], height,
    tint(x, z, h, c) { if (x < 0 && x > -34) c.lerp({ r: 0.42, g: 0.42, b: 0.34 }, 0.4); },
    clear: (x, z) => Math.abs(z) < 90 && x > -90 && x < 80,
    trees: 320, tufts: 4000,
    treeDensity: (x, z) => Math.abs(z) < 100 && x > -100 && x < 90 ? 0.1 : 0.8,
    groves: [{ x: 30, z: 70, r: 12, n: 16 }, { x: -70, z: -70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 ? x < -110 || Math.abs(z) > 110 : x > 120,
  },
  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.pulled = 0; F.ak = 0; F.ek = 0; F.pressure = 0;
    F.rescued = true; // 倒れた直後の担ぎ起こし・全快で戦列へ戻さない。
    W.noClimb = [(x, z) => x < -35 && x > -43 && Math.abs(z) < 110];
    F.hist = { bank: '史料', withdrawal: '史料', stakes: '補完', flank: '補完', numbers: '仮置き' };
    crowTex();
    const wall = (pts, name, h = 2.5) => {
      const segs = wallLine(rt, pts, { team: 1, hp: 1e9, name, segLen: 6, meshOpt: { h } });
      for (const s of segs) { s.noTarget = true; s.wall = true; }
      return segs;
    };
    F.stakes = STAKES.map((a, i) => ({ ...a, i, pulled: false, segs: wall([[a.x, a.z - 4], [a.x, a.z + 4]], '川底の杭', 1.2) }));
    wall([[-19, 70], [-18, 22]], '川底の杭', 1.2);
    wall([[-19, 14], [-21, 4]], '川底の杭', 1.2);
    wall([[-21, -4], [-22, -14]], '川底の杭', 1.2);
    wall([[-22, -22], [-23, -60]], '川底の杭', 1.2);
    // 高い西岸は柵で連続して塞ぐ。口を抜いて城攻めへ転じる戦にはしない。
    wall([[BANK, -110], [BANK, 110]], '西岸の柵');
    const geo = new THREE.CylinderGeometry(0.6, 0.5, 0.8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x675039 });
    for (const a of F.stakes) {
      a.bucket = new THREE.Mesh(geo, mat);
      a.bucket.position.set(a.x + 0.8, W.heightAt(a.x, a.z) - 0.15, a.z + 1);
      a.bucket.rotation.z = 0.5; rt.scene.add(a.bucket);
    }
    rt.scene.add(hut(W, -60, 20, 7, 5, WEST), hut(W, -64, -14, 7, 5, WEST));
    rt.scene.add(yagura(W, -48, 30), yagura(W, -48, -30));
    for (const z of [-44, -26, 2, 40]) rt.scene.add(nobori(W, -47, z, 'yatagarasu', 6));
    rt.scene.add(village(W, -56, 150, { n: 6, r: 18, rot: WEST, seed: 15741, smoke: 0 }));
    rt.scene.add(village(W, -70, -150, { n: 5, r: 16, rot: WEST, seed: 15742, smoke: 0 }));
    F.hori = allyGroup(rt, { name: '堀秀政の先手', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 20, guardLeash: 6, anchor: { x: 26, z: 0 }, facing: WEST, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'ashigaru', n: 22 }, { type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_m', haori: 0x2e3a4a } }], ODA));
    F.teppo = allyGroup(rt, { name: '東岸の織田鉄砲衆', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 65, guardLeash: 3, anchor: { x: 4, z: -20 }, facing: WEST, width: 6, ranks: 1, aggro: 65 }, dress([{ type: 'gun', n: 12 }], ODA));
    // 五つの小組が各々撃って込める。六人以上の共通一斉射と二段交代を使わない。
    F.gunPosts = [-24, -12, 0, 12, 24].map((z, i) => {
      const g = enemyGroup(rt, { faction: 'saito', fixed: true, name: '西岸の鉄砲の小組', anchor: { x: -47, z }, facing: EAST, width: 5, ranks: 1,
        order: 'hold', guard: true, guardSight: 68, guardLeash: 3, aggro: 68, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'gun', n: 4 }, { type: 'bow', n: 1 }], SAIKA));
      for (const u of g.units) u.cd = 2 + i * 4 + u.slot;
      return g;
    });
    F.reserve = enemyGroup(rt, { faction: 'saito', fixed: true, name: '柵を守る雑賀衆', anchor: { x: -57, z: 0 }, facing: EAST, formation: 'yari', width: 10,
      order: 'hold', guard: true, guardSight: 20, guardLeash: 5, aggro: 10, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], SAIKA));
    // 地元の小組は、川上・川下を渡った東岸の道に初めからいる。開始後に兵を足さない。
    F.skirmish = enemyGroup(rt, { faction: 'saito', fixed: true, name: '川べりの雑賀衆', anchor: { x: 0, z: 90 }, facing: Math.PI,
      formation: 'yari', order: 'hold', aggro: 10, fleeDir: { x: 0, z: 1 } }, dress([{ type: 'ashigaru', n: 8 }], SAIKA));
    F.flanks = [140, -140].map((z) => enemyGroup(rt, { faction: 'saito', fixed: true, name: z > 0 ? '川下の雑賀衆' : '川上の雑賀衆',
      anchor: { x: 4, z }, facing: z > 0 ? Math.PI : 0, formation: 'yari', order: 'hold', aggro: 10,
      fleeDir: { x: 0, z: z > 0 ? 1 : -1 } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 2 }], SAIKA)));
    F.raiders = [F.skirmish, ...F.flanks];
    F.defenders = [F.hori, F.teppo];
    // 援護の鉄砲の前に用意済みの竹束。後で四束を無から作らない。
    F.bankDir = { x: -1, z: 0 };
    F.bankTabas = [-9, -3, 3, 9].map((z) => addTaba(rt, 7, z, 0, { rot: WEST, fixed: true }));
    patchGunCover(rt);
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 34, z: -10 }, WEST, [{ kind: 'spear', n }]);
    F.honjin = camp(rt, { x: 72, z: 0, facing: WEST, team: 0, faction: 'oda', mon: 'oda', general: { name: '佐久間信盛' }, guard: 15, reserve: 0, runTo: BACK });
    moveGroup(F.honjin.guard, { x: 58, z: 0 }, WEST);
    F.honjin.guard.guard = true; F.honjin.guard.guardSight = 24; F.honjin.guard.guardLeash = 6;
    for (const z of [-30, 30]) rt.scene.add(nobori(W, 30, z, 'oda', 6));
    rosterBuild(rt, JIN);
    // 中野城と紀ノ川はこの狭い川岸の外。陸上の舟や小屋を城と呼ぶ復元はしない。
    phase(rt, 0, 'brief', HI(rt) ? '堀秀政の先手で、一手を率いて川へ進め' : '堀秀政の先手で、川へ進め');
    rt.say('堀秀政', '西の岸が雑賀の柵じゃ。まず川底の杭を外し、渡る道を通せ', 5);
    rt.after(7, () => rt.say('伝令', '我らは根来より来た山手の軍にござる。浜手は明智様らが中野城へ', 5));
    rt.after(15, () => { if (F.step === 0 && !F.ending) this.stakes(rt); });
  },
  stakes(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 0) return;
    phase(rt, 1, 'stakes', '三つの印で「杭を外す」を三秒ずつ押せ');
    for (const a of F.stakes) {
      rt.marker('s' + a.i, { x: a.x + 2.2, z: a.z }, '杭を外す所', { h: 2.4 });
      rt.addInteract('s' + a.i, { x: a.x + 2.2, z: a.z }, '杭を外す', () => this.pull(rt, a), { r: 2.6, hold: 3 });
    }
    rt.say('堀秀政', '桶も沈んでおる。鉄砲は「構え」では防げぬ。「！」が出たら横へ「回避」し、撃ちやんだら杭を外せ', 5);
    rt.after(16, () => {
      if (F.step !== 1) return;
      moveGroup(F.skirmish, { x: 0, z: 26 }, Math.PI);
    });
  },
  pull(rt, a) {
    if (rt.flags.ending || rt.over || !rt.player.u.alive || rt.flags.step !== 1 || a.pulled) return;
    a.pulled = true; rt.flags.pulled++;
    rt.uninteract('s' + a.i); rt.unmark('s' + a.i); a.bucket.position.set(0, rt.world.heightAt(0, a.z), a.z); // 引き上げた桶は東岸に残す。
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); rt.scene.add(stumps(rt.world, s.seg)); }
    sfx('wood', 0.8);
    rt.award((t) => { if (!t.side.includes('川底の杭を外した')) t.side.push('川底の杭を外した'); }, `川底の杭を外した（${rt.flags.pulled}／3）`);
  },
  cross(rt) {
    const F = rt.flags;
    phase(rt, 2, 'cross', '杭を外した道を渡り、西岸の柵の手前へ進め', SHORE, '西岸の足場');
    rt.banner('小雑賀川を渡れ', '撃ちやむ所を見て、杭を外した道へ');
    rt.say('堀秀政', '撃ちやむ所を見て渡れ！　岸の手前に寄れ。鉄砲は小組ごとに撃つぞ', 5);
    moveGroup(F.hori, SHORE, WEST);
    rt.after(25, () => { if (F.step === 2) rt.say('堀秀政', '岸が高い！　上がれぬまま撃たれる。引く下知を待て', 5); });
  },
  retreat(rt) {
    const F = rt.flags;
    phase(rt, 3, 'retreat', '中央の杭を外した道へ戻り、東岸の旗まで引け', BACK, '東岸の集合');
    rt.banner('渡河を断念', F.reached ? '高い岸と鉄砲に阻まれた。東岸へ引き返せ' : '西岸に届かなかった。東岸へ戻り、列を守れ');
    if (!F.reached) rt.say('伝令', '西岸へ届かず、渡河の役目は果たせませぬ。東岸へ戻れ！', 5);
    rt.say('堀秀政', '引け！　川の中央の通り道へ戻れ。東岸の鉄砲が引き際を支える', 5);
    moveGroup(F.hori, BACK, WEST);
    battleEvent(rt, EVENT_RETREAT, SHORE, F.hori, 0, true, '先手が引く。川の道を戻れ');
    F.teppo.holdFire = false;
  },
  regroup(rt) {
    const F = rt.flags;
    phase(rt, 4, 'regroup', '東岸の旗で「竹束を確かめる」を六秒押せ', BACK, '東岸の守り');
    moveGroup(F.teppo, { x: 14, z: -12 }, WEST);
    rt.say('堀秀政', '柵は落ちぬ。川を挟んで押さえる。旗の前の竹束を確かめ、鉄砲を守れ', 5);
    rt.addInteract('cover', BACK, '竹束を確かめる', () => {
      if (F.ending || rt.over || !rt.player.u.alive || F.step !== 4 || F.cover) return;
      let carriers = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 20 && carriers < F.bankTabas.length) {
        const tb = F.bankTabas[carriers++]; tb.fixed = false; tb.van = F.hori; tb.dir = F.bankDir; tb.off = (carriers - 2.5) * 1.9;
      }
      if (carriers < 2) { rt.bark('竹束を据える先手が足りぬ。旗へ組を集めよ'); return; }
      moveGroup(F.teppo, { x: 11.5, z: 0 }, WEST); F.teppo.holdFire = false; F.teppo.facing = WEST;
      F.cover = true; rt.uninteract('cover');
      rt.award((t) => t.side.push('東岸の守りを固めた'), '東岸の守りを固めた');
      rt.say('堀秀政', 'よし。竹束の後ろへ寄れ。川上と川下の道にも槍を向けよ', 5);
    }, { r: 5, hold: 6 });
  },
  hold(rt) {
    const F = rt.flags;
    rt.uninteract('cover');
    phase(rt, 5, 'hold', '東岸の守りを保て。川上・川下の雑賀衆を払え', BACK, '東岸の守り');
    rt.banner('川を限って対陣', '東岸の旗で味方六人を保て。西岸へ追うな');

    const wave = (z) => {
      if (F.step !== 5 || F.ending) return;
      const g = F.flanks[z > 0 ? 0 : 1];
      moveGroup(g, { x: 12, z: z > 0 ? 12 : -12 }, z > 0 ? Math.PI : 0);
    };
    rt.after(12, () => wave(54)); rt.after(48, () => wave(-54));
    rt.after(76, () => {
      if (F.step !== 5) return;
      rt.say('伝令', '稲葉様らが紀ノ川の渡り口を固め申した。退き道は通っておりまする', 5);
      battleEvent(rt, EVENT_MESSENGER, BACK, F.hori, 0, false, '紀ノ川の渡り口に味方が陣を置いた');
    });
  },
  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    tickTabas(rt, dt);
    const el = rt.t - F.stepT, p = rt.player.u.pos;
    const notice = rt.t >= (F.progressAt || 0);
    if (notice) F.progressAt = rt.t + 0.5;
    if (F.step === 1) {
      let ready = 0, available = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (u.pos.x > -8 && Math.abs(u.pos.z) < 24) ready++; }
      const need = Math.min(6, available);
      if (notice) rt.objProgress('main', F.pulled === 3 ? `道が通った。東岸で渡る列をそろえる（${ready}／${need}人）` : `杭 ${F.pulled}／3。引く下知まで あと${Math.max(0, Math.ceil(120 - el))}秒`);
      if (el > 55 && !F.help) { F.help = true; rt.say('堀秀政', '印の前で「杭を外す」を三秒押せ。矢玉が来たら横へ避けよ', 5); }
      if (el >= 120 && F.pulled !== 3) return this.win(rt, false);
      if (F.pulled === 3 && need > 0 && ready >= need) this.cross(rt);
    } else if (F.step === 2) {
      if (p.x < -28 && p.x > BANK && Math.abs(p.z) < 35) F.reached = true;
      if (notice) rt.objProgress('main', `${F.reached ? '西岸に着いた。岸へは上がれぬ' : '中央の道を渡り、西岸の印へ'}。引く下知まで あと${Math.max(0, Math.ceil(60 - el))}秒`);
      if (el >= 60) this.retreat(rt);
    } else if (F.step === 3) {
      if (Math.hypot(p.x - BACK.x, p.z - BACK.z) < 16) F.inT += dt;
      else F.inT = 0;
      const distance = Math.hypot(p.x - BACK.x, p.z - BACK.z);
      let back = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut && u.pos.x > -8 && Math.abs(u.pos.z) < 24) back++;
      if (notice) rt.objProgress('main', distance >= 16 ? `東岸の旗へ あと${Math.round(distance)}歩` : back < 6 ? `先手の集合を待て ${back}／6人。あと${Math.max(0, Math.ceil(70 - el))}秒` : F.inT <= 5 ? `旗のそばで待て あと${Math.max(0, Math.ceil(5 - F.inT))}秒` : `列がそろった。次の下知まで あと${Math.max(0, Math.ceil(35 - el))}秒`);
      if (el >= 35 && F.inT > 5 && back >= 6) this.regroup(rt);
      else if (el >= 70) this.win(rt, false);
    } else if (F.step === 4) {
      if (notice) rt.objProgress('main', F.cover ? `竹束は確かめた。次の下知まで あと${Math.max(0, Math.ceil(40 - el))}秒` : `旗で「竹束を確かめる」を六秒押せ。退く下知まで あと${Math.max(0, Math.ceil(90 - el))}秒`);
      if (el >= 40 && F.cover) this.hold(rt);
      else if (el >= 90) this.win(rt, false);
    } else if (F.step === 5) {
      let threat = 0, allies = 0;
      for (const g of F.raiders) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24) threat++;
      }
      for (const g of F.defenders) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 28) allies++;
      }
      F.pressure = threat >= 4 ? F.pressure + dt : 0;
      const holding = Math.hypot(p.x - BACK.x, p.z - BACK.z) < 35 && allies >= 6 && !F.hori.routed;
      if (F.inT > 0 && threat > 0 && rt.t >= (F.resetNoticeAt || 0) && F.raiders.some((g) => g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24 && sightUnit(rt, u)))) {
        F.resetNoticeAt = rt.t + 8; rt.bark('敵が東岸へ入った。払って味方六人で二十秒守り直せ');
      }
      for (const g of F.flanks) if (!g.bankSeen && g.units.some((u) => u.alive && !u.fleeing && sightUnit(rt, u)) && rt.t >= (F.watchAt || 0)) {
        g.bankSeen = true; F.watchAt = rt.t + 8; rt.say('見張り', `${g.anchor.z > 0 ? '川上' : '川下'}から小組の旗が近づく！　岸の槍を向けよ`, 4);
      }
      F.inT = el >= 100 && holding && threat === 0 ? F.inT + dt : 0;
      if (notice) rt.objProgress('main', F.pressure > 0 ? `！東岸へ敵が入った。あと${Math.max(0, Math.ceil(8 - F.pressure))}秒で列が崩れる` : !holding ? '東岸の旗へ戻り、味方と列を保て' : threat > 0 ? '東岸の近くに敵が残る。追わずに払え' : el < 100 ? '旗のそばで次の寄せに備えよ' : `東岸を守る あと${Math.max(0, Math.ceil(20 - F.inT))}秒`);
      if (el >= 110 && !F.holdWarn) { F.holdWarn = true; rt.say('堀秀政', '寄せを払え！　あと三十秒で引く下知じゃ。東岸で列を保て', 5); }
      if (allies >= 10) F.lineWarn = false;
      if (allies >= 6 && allies < 10 && !F.lineWarn && rt.t >= (F.lineWarnAt || 0)) { F.lineWarn = true; F.lineWarnAt = rt.t + 8; rt.bark('守りの列が薄い。東岸へ戻り、六人の列を守れ'); }
      if (notice && el >= 100 && !F.pressure) rt.objProgress('main', `${!holding ? '旗へ戻り、味方六人で守れ' : threat ? '東岸の敵を払え' : `守りを保つ あと${Math.max(0, Math.ceil(20 - F.inT))}秒`}。引く下知まで あと${Math.max(0, Math.ceil(140 - el))}秒`);
      if (F.pressure >= 8 || allies < 6 || F.hori.routed) this.win(rt, false);
      else if (el >= 100 && F.inT >= 20) this.win(rt, true);
      else if (el >= 140) this.win(rt, false);
    }
  },
  win(rt, held) {
    const F = rt.flags;
    if (F.ending) return;
    held = held && !!F.reached && !!F.cover && rt.player.u.alive;
    rt.tracker.main = !!held;
    F.ending = true; rt.setPhase('end'); rt.objProgress('main', ''); rt.unmark('goal'); rt.uninteract('cover');
    for (const a of F.stakes) { rt.uninteract('s' + a.i); rt.unmark('s' + a.i); }
    if (!held) for (const g of F.defenders) moveGroup(g, { x: 58, z: 0 }, WEST);
    // 引き上げ中も両岸の射手は持ち場を守る。射撃の可否は射線と弾込めで決める。
    // 西岸の鉄砲衆は崩さない。局地の守りの成否と、後日の和議を分ける。
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '小雑賀川の東岸を保った', pts: 20 }; }, '任務達成・東岸を保った');
    } else rt.objFail('main');
    rt.banner(held ? '東岸の列を保った' : '先手は後ろの陣へ引く', held ? '西岸の柵は落ちず、川を挟む対陣が続く' : F.step === 1 ? '杭を外しきれず、渡る道を通せなかった' : !F.reached ? '西岸の足場へ届かなかった' : F.step === 3 ? '東岸に先手の六人の列を集められなかった' : !F.cover ? '東岸の竹束を確かめられなかった' : '東岸で六人の列を保ち、寄せを払えなかった');
    rt.say('堀秀政', held ? '岸は越えられぬ。ここで川を押さえる。柵の内へ追うな' : 'これ以上は押せぬ。後ろの陣へ引き、立て直すぞ', 5);
    // 共通の退き際へ渡し、追手の矢玉と傷をそのまま扱う。
    rt.finish({}, 12);
  },
  onKill(rt, v) { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; },
};
// 局地の描く人数に合わせた目安。一人の討死を架空の六人の損害へ増やさない。
saika.force = (rt) => {
  const F = rt.flags;
  let a = 300, b = 244; // 初めに置く軽い控え。後から重ねて増やさない。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) {
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  F.a0 ??= a; F.b0 ??= b;
  return { a, a0: F.a0, b, b0: F.b0 };
};
saika.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '雑賀衆', mon: 'yatagarasu' } };
saika.date = () => '天正五年二月　春';
saika.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
saika.skip = (rt) => { if (rt.flags.step === 0 && !rt.flags.ending) saika.stakes(rt); };
saika.history = '信長公記巻十「雑賀御陣之事」では、山手の堀秀政が小雑賀川を渡り、対岸の高い岸に上がれないところを鉄砲で防がれ、武者数人を失って引いた。その後は川を境に対陣し、稲葉父子・氏家左京亮・飯沼勘平が紀ノ川の渡り口を守った。浜手の中野城は二月二十八日に開城し、信忠が入った。孫一の居城へ竹束で攻め寄せたのは浜手の別の場面である。長い在陣の末、鈴木孫一・土橋平次ら七人が誓紙を出して赦され、三月二十一日に信長は帰途についた。川底に桶・壺・逆茂木を沈め、約七百人を失ったとも伝わるが、ここでは公記の高岸・鉄砲・引き退きを芯にした。東西の向きは地理からの復元。川の全幅二十四歩、渡り場の水深六十五センチ、岸の高さ三歩ほどは復元の寸法。人数、杭抜き、東岸の竹束、川上と川下の小隊は局地戦の補完である。織田の全軍は十万ともいうが数には諸説あり、上の人数は描く局地の兵の目安で、史料の兵数ではない。紀ノ川の守将と両軍の総大将は画面外。佐久間の陣所、小組が東岸を回る道も復元。昼の明るさと烏の旗も見た目の復元である。後日の中野城の開城や和議を、この川岸の数分の中で起きた出来事にしない。';
saika.lordAt = { x: 102, z: 0, r: 12, why: '総大将で遊ぶ場合の後方の陣。川岸に信長がいたという史料上の保証ではない' };
saika.lordSpawn = { x: 102, z: 0, heading: WEST };
saika.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 杭抜き中も目の前の打ち手を受け、隙には反撃する。
  // 味方への振りを受け続けたり、移動先へ向き直って構えを背けたりしない。
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  let attacker = null, attackDist = 4.5;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const attacking = o.atk?.target === u ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (attacking && d < attackDist) { attacker = o; attackDist = d; }
  }
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const e = attacker || strikeTarget(b, F.step === 5 ? 20 : reach);
  const d = e ? Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) : Infinity;
  // 渡河・引き退き・杭抜きでは近い敵だけ払う。西岸の射手を追わない。
  const pursue = F.step === 5 && e && e.pos.x > -14;
  if (e && (attacker || d < reach || pursue)) {
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (pursue && d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    patientStrike(p, inp, e, d);
    return;
  }
  // 鉄砲・弓の避け足は共通の頭に任せ、打ち手を払ったら作業と下知へ戻る。
  if (F.step === 1 || F.step === 4 && !F.cover) {
    let nearest = null, distance = Infinity;
    for (const it of b.interacts) if (it.id === 'cover' || /^s[0-2]$/.test(it.id)) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < distance) { nearest = it; distance = d; }
    }
    // 杭の印へ近づきすぎず、長押しが届いたら作業する。回避で少し離れても戻りすぎない。
    if (nearest) { if (distance >= nearest.r) goTo(p, inp, nearest.pos.x, nearest.pos.z, nearest.r - 0.3); else inp.k.add('KeyE'); }
    return;
  }
  // 脇の杭から西岸を直線で狙うと、残る杭列に当たる。東側で中央の口へ合わせてから渡る。
  if (F.step === 2) {
    goTo(p, inp, u.pos.x > -19 && Math.abs(u.pos.z) > 2 ? -16 : SHORE.x, 0, 1.5);
    return;
  }
  // 引き際も西側で中央の口へ合わせる。柵の射手を追わず、東岸まで戻る。
  if (F.step === 3) {
    goTo(p, inp, u.pos.x < -21 && Math.abs(u.pos.z) > 2 ? -24 : BACK.x, 0, 2);
    return;
  }
  goTo(p, inp, BACK.x, BACK.z, 3);
};
export { saika };
