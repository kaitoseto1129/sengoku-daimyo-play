// 雑賀攻め・小雑賀川。史料の芯は信長公記巻十「雑賀御陣之事」。
// 渡河 → 高岸と鉄砲に阻まれる → 東岸へ引く → 川を限って対陣。
// 桶・杭、局地の回り込み、秒数と人数は遊びの補完。川岸の寸法は旧配置を回転。
import * as THREE from 'three';
import { nobori, hut, yagura, takataba, stumps, village, kobune } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress, customFlag } from './b_inabayama.js';
import { volleyAt } from './b_tano.js';
import { lines, leanAll, volleyAll, camp } from './b_mid.js';
import { battleEvent, EVENT_VOLLEY, EVENT_RETREAT, EVENT_MESSENGER } from './battle_events.js';
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
  return h + 40 * gauss(x, z, -220, 60, 9000) + 30 * gauss(x, z, 200, -120, 9000);
}
function moveGroup(g, to, facing) {
  g.order = 'move'; g.dest = to; g.aggro = 8; g.formation = 'column';
  g.onArrive = (q) => { q.order = 'hold'; q.facing = facing; q.aggro = 32; q.formation = 'line'; };
}
function phase(rt, step, name, text, at, label) {
  const F = rt.flags;
  F.step = step; F.stepT = rt.t; F.inT = 0;
  rt.setPhase(name); rt.obj('main', text, 'main'); rt.objProgress('main', '');
  rt.unmark('goal');
  if (at) rt.marker('goal', at, label, { h: 3 });
}
const saika = {
  noWake: true, // 本物の兵は配下を含めても約170人。大軍を近接兵へ替えない。
  spawn: { x: 40, z: -6, heading: WEST },
  world: {
    seed: 15772, time: 'day', muddy: 0.6, waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 1.1 }],
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
    F.step = 0; F.pulled = 0; F.ak = 0; F.ek = 0; F.shotT = 8;
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
    rt.scene.add(village(W, -56, 150, { n: 6, r: 18, rot: WEST, seed: 15741, smoke: 1 }));
    rt.scene.add(village(W, -70, -150, { n: 5, r: 16, rot: WEST, seed: 15742, smoke: 1 }));
    F.hori = allyGroup(rt, { name: '堀秀政の先手', anchor: { x: 26, z: 0 }, facing: WEST, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_m', haori: 0x2e3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }], ODA));
    F.teppo = allyGroup(rt, { name: '東岸の織田鉄砲衆', anchor: { x: 4, z: -20 }, facing: WEST, width: 16, aggro: 65, noRout: true }, dress([{ type: 'gun', n: 12 }], ODA));
    F.teppo.dmgMult = 0.55;
    F.fenceGun = enemyGroup(rt, { faction: 'saito', name: '西岸の雑賀鉄砲衆', anchor: { x: -47, z: 0 }, facing: EAST, width: 50, aggro: 68, order: 'hold', noRout: true, morale: 100, dmgMult: 0.22 }, dress([{ type: 'gun', n: 20 }, { type: 'bow', n: 6 }], SAIKA));
    F.fenceGun.holdFire = true;
    F.reserve = enemyGroup(rt, { faction: 'saito', name: '柵を守る雑賀衆', anchor: { x: -57, z: 0 }, facing: EAST, width: 36, order: 'hold', aggro: 10, noRout: true }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], SAIKA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 34, z: -10 }, WEST, [{ kind: 'spear', n }]);
    camp(rt, { x: 72, z: 0, facing: WEST, team: 0, faction: 'oda', mon: 'oda', general: { name: '佐久間信盛' }, guard: 15, reserve: 400, runTo: BACK });
    for (const z of [-30, 30]) rt.scene.add(nobori(W, 30, z, 'oda', 6));
    for (const [x, z, team, count, seed] of [[50, 70, 0, 450, 15721], [50, -70, 0, 450, 15722], [-110, 0, 1, 500, 15723]]) {
      W.addDistantArmy({ x, z, w: 40, d: 12, count, facing: team ? EAST : WEST, team, armor: team ? SAIKA.armor : 0x2b3140, flagTex: flagTexture(team ? 'yatagarasu' : 'oda'), seed }).army.noWake = true;
    }
    // 北の遠景は紀ノ川の渡し。中野城は北西の浜手、知らせだけで扱う。
    rt.scene.add(kobune(30, W.heightAt(30, -210) - 0.2, -210, EAST, 6));
    F.nakano = { x: -110, z: -190 };
    rt.scene.add(hut(W, -110, -190, 10, 7, 0), yagura(W, -118, -194));
    F.nakanoFlag = nobori(W, -107, -184, 'yatagarasu', 6); rt.scene.add(F.nakanoFlag);
    phase(rt, 0, 'brief', HI(rt) ? '堀秀政の先手で、一手を率いて川へ進め' : '堀秀政の先手で、川へ進め');
    rt.say('堀秀政', '西の岸が雑賀の柵じゃ。まず川底の杭を外し、渡る道を通せ', 5);
    rt.after(7, () => rt.say('伝令', '我らは根来より来た山手の軍にござる。浜手は明智様らが中野城へ', 5));
    rt.after(15, () => this.stakes(rt));
  },
  stakes(rt) {
    const F = rt.flags;
    phase(rt, 1, 'stakes', '川底の杭を外せ。印の前で「杭を外す」を長く押せ');
    for (const a of F.stakes) {
      rt.marker('s' + a.i, a, '川底の杭', { h: 2.4, red: true });
      rt.addInteract('s' + a.i, { x: a.x + 2.2, z: a.z }, '杭を外す', () => this.pull(rt, a), { r: 2.6, hold: 3 });
    }
    rt.say('堀秀政', '桶も沈んでおる。鉄砲が鳴ったら身を低くせよ。道が通るまで、味方が撃ち返す', 5);
    rt.after(16, () => {
      if (F.step !== 1) return;
      F.skirmish = enemyGroup(rt, { faction: 'saito', name: '川べりの雑賀衆', anchor: { x: -8, z: 52 }, facing: Math.PI, width: 8, order: 'attack', seekRange: 65, aggro: 16, morale: 80, dmgMult: 0.6, fleeDir: { x: 0, z: 1 } }, dress([{ type: 'ashigaru', n: 8 }], SAIKA));
      rt.say('堀秀政', '川べりから敵が寄る！　槍で払い、杭抜きを続けよ', 5);
    });
  },
  pull(rt, a) {
    if (a.pulled) return;
    a.pulled = true; rt.flags.pulled++;
    rt.uninteract('s' + a.i); rt.unmark('s' + a.i); rt.scene.remove(a.bucket);
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); rt.scene.add(stumps(rt.world, s.seg)); }
    sfx('wood', 0.8);
    rt.award((t) => t.side.push('川底の杭を外した'), `川底の杭を外した（${rt.flags.pulled}／3）`);
  },
  cross(rt) {
    const F = rt.flags;
    phase(rt, 2, 'cross', '杭を外した道を渡り、西岸の柵の手前へ進め', SHORE, '西岸の足場');
    rt.banner('小雑賀川を渡れ', '鉄砲の込め直しの間に、杭を外した道へ');
    rt.say('堀秀政', '一斉に撃った直後に渡れ！　西岸の柵の手前で槍をそろえよ', 5);
    moveGroup(F.hori, SHORE, WEST);
    F.lines = lines(rt, [
      { x: -32, z: 70, facing: WEST, w: 34, seed: 15731, A: ['oda', 0x2b3140, 380, 'oda'], B: ['yatagarasu', SAIKA.armor, 360, 'saito'], gunsB: true, surge: false },
      { x: -34, z: -70, facing: WEST, w: 34, seed: 15732, A: ['oda', 0x2b3140, 380, 'oda'], B: ['yatagarasu', SAIKA.armor, 360, 'saito'], gunsB: true, surge: false },
    ]);
    for (const c of F.lines) c.go();
    leanAll(F.lines, 'B', 0.25);
    rt.after(25, () => { if (F.step === 2) { this.volley(rt); rt.say('堀秀政', '岸が高い！　上がれぬまま撃たれる。柵の前に留まるな、引く下知を待て', 5); } });
  },
  retreat(rt) {
    const F = rt.flags;
    phase(rt, 3, 'retreat', '中央の杭を外した道へ戻り、東岸の旗まで引け', BACK, '東岸の集合');
    rt.banner('渡河を断念', '高い岸と鉄砲に阻まれた。東岸へ引き返せ');
    rt.say('堀秀政', '引け！　川の中央の通り道へ戻れ。東岸の鉄砲が引き際を支える', 5);
    F.hori.noRout = false; F.hori.morale = Math.min(F.hori.morale, 48);
    moveGroup(F.hori, BACK, WEST);
    battleEvent(rt, EVENT_RETREAT, SHORE, F.hori, 0, true, '先手が引く。川の道を戻れ');
    leanAll(F.lines, 'B', 0.4);
    volleyAt(rt, { guns: () => [F.teppo], foes: () => [F.fenceGun], near: 70, drop: 8, max: 8, who: '堀秀政', line: '東岸の鉄砲が引き際を支える。今のうちに川を戻れ' });
  },
  regroup(rt) {
    const F = rt.flags;
    phase(rt, 4, 'regroup', '東岸の旗のそばで「竹束を並べる」を長く押せ', BACK, '東岸の守り');
    F.hori.noRout = true; F.hori.morale = Math.max(F.hori.morale, 65);
    moveGroup(F.teppo, { x: 14, z: -12 }, WEST);
    rt.say('堀秀政', '柵は落ちぬ。川を挟んで押さえる。旗の前に竹束を並べ、鉄砲を守れ', 5);
    rt.addInteract('cover', BACK, '竹束を並べる', () => {
      if (F.cover) return;
      F.cover = true; rt.uninteract('cover');
      for (const z of [-9, -3, 3, 9]) rt.scene.add(takataba(rt.world, 7, z, WEST));
      F.teppo.defMult = 1.6;
      rt.award((t) => t.side.push('東岸の守りを固めた'), '東岸の守りを固めた');
      rt.say('堀秀政', 'よし。竹束の後ろへ寄れ。川上と川下から回る敵を払うぞ', 5);
    }, { r: 5, hold: 4 });
  },
  hold(rt) {
    const F = rt.flags;
    rt.uninteract('cover');
    phase(rt, 5, 'hold', '東岸の守りを保て。川上・川下の雑賀衆を払え', BACK, '東岸の守り');
    rt.banner('川を限って対陣', '西岸の柵は健在。東岸の味方の列を保て');
    F.flanks = F.skirmish ? [F.skirmish] : [];
    const wave = (z) => {
      if (F.step !== 5 || F.ending) return;
      const g = enemyGroup(rt, { faction: 'saito', name: z > 0 ? '川下の雑賀衆' : '川上の雑賀衆', anchor: { x: 4, z }, facing: z > 0 ? Math.PI : 0, width: 10, order: 'attack', seekRange: 65, aggro: 16, morale: 85, dmgMult: 0.65, fleeDir: { x: 0, z: z > 0 ? 1 : -1 } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 2 }], SAIKA));
      F.flanks.push(g);
      rt.say('堀秀政', z > 0 ? '川下から来た！　竹束の後ろに鉄砲を残し、槍で払え' : '今度は川上じゃ！　柵を追わず、東岸の旗を守れ', 5);
    };
    rt.after(12, () => wave(54)); rt.after(48, () => wave(-54));
    rt.after(76, () => {
      if (F.step !== 5) return;
      rt.say('伝令', '稲葉様らが紀ノ川の渡り口を固め申した。退き道は通っておりまする', 5);
      battleEvent(rt, EVENT_MESSENGER, BACK, F.hori, 0, false, '紀ノ川の渡り口に味方が陣を置いた');
    });
  },
  volley(rt) {
    const F = rt.flags;
    F.fenceGun.holdFire = false;
    rt.after(3, () => { F.fenceGun.holdFire = true; });
    sfx('volley', 0.8);
    for (let i = 0; i < 6; i++) rt.army.smoke(-46, rt.world.heightAt(-46, -25 + i * 10) + 1.4, -25 + i * 10, 1, 0, 0.7);
    volleyAll(F.lines, 'B');
    battleEvent(rt, EVENT_VOLLEY, SHORE, F.fenceGun, 1, false, '西岸の鉄砲がそろって火を吹いた');
  },
  nakanoFalls(rt) {
    const F = rt.flags;
    F.nakanoFall = true; rt.scene.remove(F.nakanoFlag);
    rt.scene.add(nobori(rt.world, -107, -184, 'oda', 6));
    rt.say('伝令', '中野城、開城！　信忠様が入られた。こちらは川岸を保てとの下知！', 5);
  },
  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    const el = rt.t - F.stepT, p = rt.player.u.pos;
    if (F.step >= 1 && (F.shotT -= dt) <= 0) { F.shotT = F.step === 2 ? 12 : 20; this.volley(rt); }
    if (!F.nakanoFall && rt.t > 180) this.nakanoFalls(rt);
    if (F.step === 1) {
      rt.objProgress('main', `杭 ${F.pulled}／3`);
      if (F.pulled === 3) rt.objProgress('main', `道が通った。下知まで あと${Math.max(0, Math.ceil(40 - el))}秒`);
      if (el > 55 && !F.help) { F.help = true; rt.say('堀秀政', 'まだ残っておるか。印の前で長く押せ。足軽も杭抜きを手伝え', 5); }
      if (el >= 80) for (const a of F.stakes) if (!a.pulled) this.pull(rt, a);
      if (el >= 40 && F.pulled === 3) this.cross(rt);
    } else if (F.step === 2) {
      if (p.x < -28 && p.x > BANK && Math.abs(p.z) < 35) F.reached = true;
      rt.objProgress('main', F.reached ? `西岸に着いた。岸を見定めよ・あと${Math.max(0, Math.ceil(60 - el))}秒` : '中央の通り道を渡り、西岸の印へ');
      if (el >= 60) this.retreat(rt);
    } else if (F.step === 3) {
      if (Math.hypot(p.x - BACK.x, p.z - BACK.z) < 16) F.inT += dt;
      rt.objProgress('main', `東岸の旗まで あと${Math.round(Math.hypot(p.x - BACK.x, p.z - BACK.z))}歩`);
      if (el >= 35 && F.inT > 5) this.regroup(rt);
      else if (el >= 70) this.win(rt, false);
    } else if (F.step === 4) {
      rt.objProgress('main', F.cover ? `守りを整える あと${Math.max(0, Math.ceil(40 - el))}秒` : '旗のそばで竹束を並べよ');
      if (el >= 40) this.hold(rt);
    } else if (F.step === 5) {
      if (Math.hypot(p.x - BACK.x, p.z - BACK.z) < 35) F.inT += dt;
      let remaining = 0;
      for (const g of F.flanks) {
        if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing) remaining++;
        if (g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 18); }
        if (el >= 100) g.morale = Math.min(g.morale, 28);
      }
      rt.objProgress('main', `守る時間 あと${Math.max(0, Math.ceil(100 - el))}秒・回った敵 ${remaining}人`);
      if (el >= 100 && remaining === 0 && F.inT >= 45) this.win(rt, true);
      else if (el >= 140) this.win(rt, F.inT >= 45 && remaining <= 4);
    }
  },
  win(rt, held) {
    const F = rt.flags;
    if (F.ending) return;
    held = held && !!F.reached;
    rt.tracker.main = !!held;
    F.ending = true; rt.setPhase('end'); rt.unmark('goal'); rt.uninteract('cover');
    F.fenceGun.holdFire = true; F.teppo.holdFire = true;
    // 西岸の鉄砲衆は崩さない。局地の守りの成否と、後日の和議を分ける。
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '小雑賀川の東岸を保った', pts: 20 }; }, '任務達成・東岸を保った');
    } else rt.objFail('main');
    rt.banner(held ? '東岸の列を保った' : '先手は後ろの陣へ引く', '西岸の柵は落ちず、川を挟む対陣が続く');
    rt.say('堀秀政', held ? '岸は越えられぬ。ここで川を押さえる。柵の内へ追うな' : 'これ以上は押せぬ。後ろの陣へ引き、立て直すぞ', 5);
    rt.after(6, () => rt.say('', '――対陣は続いた。のちに鈴木孫一ら七人が誓紙を出し、三月、信長は軍を引いた', 5));
    rt.player.u.invuln = true; rt.finish({}, 12);
  },
  onKill(rt, v) { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; },
};
// 局地の表示人数は仮置き。紀州全軍の人数や700人の損害を確定値にしない。
saika.force = (rt) => ({ a: Math.max(0, 12000 - rt.flags.ak * 6), a0: 12000, b: Math.max(0, 6000 - rt.flags.ek * 6), b0: 6000 });
saika.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '雑賀衆', mon: 'yatagarasu' } };
saika.date = () => '天正五年二月　春';
saika.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
saika.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
saika.history = '信長公記巻十「雑賀御陣之事」では、山手の堀秀政が小雑賀川を渡り、対岸の高い岸に上がれないところを鉄砲で防がれ、武者数人を失って引いた。その後は川を境に対陣し、稲葉父子・氏家左京亮・飯沼勘平が紀ノ川の渡り口を守った。浜手の中野城は二月二十八日に開城し、信忠が入った。孫一の居城へ竹束で攻め寄せたのは浜手の別の場面である。長い在陣の末、鈴木孫一・土橋平次ら七人が誓紙を出して赦され、三月二十一日に信長は帰途についた。川底に桶・壺・逆茂木を沈め、約七百人を失ったとも伝わるが、ここでは公記の高岸・鉄砲・引き退きを芯にした。東西の向きは地理からの復元、川幅十二歩・岸の高さ三歩ほどは遊びの寸法。人数、杭抜き、東岸の竹束、川上と川下の小隊は局地戦の補完である。織田の全軍は十万ともいうが数には諸説あり、上の人数は持ち場の仮置き。昼の明るさと烏の旗も見た目の復元である。';
saika.lordAt = { x: 64, z: 0, r: 12, why: '山手の東岸の陣。信長の現地での指揮は遊びの補完' };
saika.lordSpawn = { x: 60, z: 0, heading: WEST };
saika.botBrain = (b, inp, { goTo }) => {
  const F = b.flags, p = b.player, u = p.u;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.guardHold = (b.army.threats || []).length > 0;
  if (F.step === 1 || F.step === 4 && !F.cover) {
    let nearest = null, distance = Infinity;
    for (const it of b.interacts) if (it.id === 'cover' || /^s[0-2]$/.test(it.id)) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < distance) { nearest = it; distance = d; }
    }
    if (nearest) { if (distance > 1.2) goTo(p, inp, nearest.pos.x, nearest.pos.z, 0.9); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { goTo(p, inp, u.pos.x > -24 ? -24 : SHORE.x, 0, 1.5); return; }
  if (F.step === 3) { goTo(p, inp, u.pos.x < -16 ? -14 : BACK.x, 0, 2); return; }
  if (F.step === 5) {
    const e = b.army.nearestEnemy(u, 20, (o) => !o.fleeing && o.pos.x > -14 && !b.army.wallBetween(u.pos, u.team, o.pos));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.6) inp.k.add('KeyW');
      if (d < 3.2) inp.leftPressed = true;
      return;
    }
  }
  goTo(p, inp, BACK.x, BACK.z, 3);
};
export { saika };
