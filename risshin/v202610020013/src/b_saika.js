// ======================================================================
// 織田家編　雑賀攻め・小雑賀川（天正五年二月）
// 石山本願寺を鉄砲で支える紀伊の雑賀衆を討つため、信長は大軍で紀伊へ攻め入った。
// 小雑賀川を渡ろうとした堀秀政らの手は、川底に沈めた桶や乱杭に足を取られ、対岸の柵の内から鉄砲を浴びて苦しんだ。
// 戦は長引いたが、三月、鈴木孫一ら雑賀の者は誓紙を出して降った（のちにまた本願寺に味方する）。
// 足軽は堀秀政の手。①川の中の乱杭を抜いて、渡る道を開ける（対岸の鉄砲の下で） ②川を渡り、柵の前の雑賀衆を崩す
// ③雑賀の鉄砲衆の打って出を受け止める
// ②と③の間・③の後に段（b_depth.js）：柵の口の攻め方→渡り口を断たれる→孫一の打って出→山の口へ追うか柵を焼くか→最後の撃ち合い
// 川の左右では織田の大軍と雑賀衆が押し合い（軽い作り）、雑賀の鉄砲組は並んで一斉に撃つ。左右と後ろ（川下・川上）から回り込まれる
// 向き：北（-z）の小雑賀川の向こうに雑賀の柵。南（+z）に織田の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, tawara, stumps, village, kobune } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more, customFlag } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
import { uS, uA, uG, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-240, -22], [-100, -18], [0, -20], [100, -24], [240, -18]];
const FENCE_Z = -44;                       // 対岸の柵
// 真ん中の渡り口を x=0 に（道 paths も x=0 を通る。ずれていると、道なりに歩くとそのまま恒久の杭にぶつかって詰まる。kaito 10/1）
const STAKES = [{ x: -18, z: -19 }, { x: 0, z: -20 }, { x: 18, z: -21 }];      // 川の中の乱杭
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
  // 対岸は高い切岸（川から上がっても容易に登れない台。乱杭の渡り口付近は変えない）
  h += 3.2 / (1 + Math.exp((z - (FENCE_Z + 8)) / 2.4));
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
    noT(wallLine(rt, [[-70, -19], [-22, -18]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[-14, -19], [-4, -21]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[4, -21], [14, -22]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
    noT(wallLine(rt, [[22, -22], [50, -23]], { team: 1, hp: 1e9, name: '乱杭', segLen: 8, meshOpt: { h: 1.2 } }));
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
    // ---- 雑賀の集落（寺・道場・鍛冶・倉の体。地侍・農民・門徒の暮らす地。荒野＋兵にしない） ----
    rt.scene.add(village(W, -150, -56, { n: 6, r: 18, rot: 0.3, seed: 15741, smoke: 1 }));
    rt.scene.add(village(W, 150, -70, { n: 5, r: 16, rot: -0.2, seed: 15742, smoke: 1 }));   // 平井（鈴木孫一ゆかりの集落。大石垣にせず中世の集落の体。遠景・知らせのみ）
    // ---- 浜手の中野城（地域の城館・砦。山手の戦の間、知らせと遠くの動きで開城が分かる） ----
    { const nx = 190, nz = 30; rt.scene.add(hut(W, nx, nz, 10, 7, 0.1, { wall: 0x5a4a38 })); rt.scene.add(yagura(W, nx + 8, nz - 4)); F.nakanoFlag = nobori(W, nx - 3, nz + 6, 'yatagarasu', 6); rt.scene.add(F.nakanoFlag); F.nakano = { x: nx, z: nz }; }
    // ---- 東の遠景：紀ノ川の渡し場（大河。今の橋でなく舟・浅瀬） ----
    { const kx = 210, kz = -4, ky = W.heightAt(kx, kz) - 0.2; for (const [dx, rot] of [[-5, 0.1], [4, -0.15]]) rt.scene.add(kobune(kx + dx, ky, kz, rot, 6)); }
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, -16, 60, 0.3, 6));
    // 織田信長の本陣と、雑賀の鈴木孫一の陣所（山の口の奥）
    F.honjin = camp(rt, { x: 0, z: 72, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 200, runTo: { x: 0, z: 30 } });
    F.ehon = camp(rt, { x: -46, z: -96, facing: 0.3, team: 1, faction: 'saito', mon: 'yatagarasu', armor: 0x2a2622, general: { name: '鈴木孫一', hat: 'jingasa', haori: 0x2a2622 }, guard: 15, reserve: 250, runTo: { x: -6, z: FENCE_Z - 6 } });
    for (const [x, z, k] of [[-8, 60, 'oda'], [8, 60, 'eiraku'], [-30, 30, 'oda'], [30, 34, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(-70, 50, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('oda'), 15721);
    DA(70, 50, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('eiraku'), 15722);
    DA(0, -110, 50, 12, 220, 0, 0x2a2622, flagTexture('yatagarasu'), 15723);
    for (const [x, z] of [[-24, 56], [24, 58]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.shotT = 2;

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、堀秀政の下知を待て' : '堀秀政のもとで、下知を待て', 'main');
    rt.say('伝令', '申し上げます！　山手は佐久間様・羽柴様の手が雄山峠を越え、浜手は滝川様・明智様の手が淡輪・孝子から中野城を囲んでおりまする', 5.5);
    rt.say('堀秀政', `よし。我らはこの小雑賀川じゃ。${nm(rt)}、川の向こうが雑賀の柵じゃ。雑賀の鉄砲は日の本一と聞く。……先に渡った者が、川の中で足を取られて撃たれた`, 5.5);
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
    F.teppo.order = 'move'; F.teppo.dest = { x: 0, z: -4 }; F.teppo.onArrive = (g) => { g.order = 'hold'; };
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
    // 抜いた所をはっきり見せる（渡れる場所が分からず、詰まった杭にぶつかって足踏みしないように。kaito 10/1）
    rt.marker('g' + a.i, a, '渡り口', {});
    if (F.pulled >= STAKES.length) this.cross(rt);
    else rt.objProgress('main', `${F.pulled}／${STAKES.length}`);
  },

  // ② 渡って柵の前の雑賀衆を崩す
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('cross');
    for (const a of F.stakes) { rt.uninteract('s' + a.i); rt.unmark('s' + a.i); rt.unmark('g' + a.i); }
    sfx('horagai', 1);
    rt.banner('道が開いた', '川を渡り、柵の前の雑賀衆へ');
    rt.obj('main', '川を渡り、柵の前の雑賀衆を崩せ', 'main');
    rt.say('堀秀政', '渡れ！　止まれば撃たれる、走れ！', 3);
    // 勝ち筋：雑賀の鉄砲も込め直しに間がある。一斉に鳴った直後に渡る
    rt.after(3.5, () => { if (F.step === 2) rt.say('堀秀政', '雑賀の鉄砲も、撃てば込め直しに間がある。一斉に鳴った後に駆けよ', 4); });
    F.hori.order = 'attack'; F.hori.seekRange = 70;
    // 川の左右では、織田の大軍と雑賀衆が川べりで押し合う（軽い作り）。雑賀の側は二列目が鉄砲
    F.lines = lines(rt, [
      { x: -70, z: -32, facing: Math.PI, w: 34, seed: 15731, A: ['oda', 0x2b3140, 380, 'oda'], B: ['yatagarasu', 0x2a2622, 360, 'saito'], gunsB: true, surge: { every: 55, count: 120, flank: 0.3 } },
      { x: 70, z: -34, facing: Math.PI, w: 34, seed: 15732, A: ['eiraku', 0x2b3140, 380, 'oda'], B: ['yatagarasu', 0x2a2622, 360, 'saito'], gunsB: true, surge: { every: 60, count: 120, flank: 0.3 } },
    ]);
    F.lines.forEach((c, i) => rt.after(1 + i * 2, () => c.go()));
    leanAll(F.lines, 'B', 0.25);   // 雑賀の鉄砲に押される
    F.front = enemyGroup(rt, { faction: 'saito', name: '柵の前の雑賀衆', anchor: { x: 2, z: FENCE_Z + 8 }, facing: 0, order: 'hold', aggro: 18, width: 18, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 + more(rt) }, { type: 'gun', n: 3 }], SAIKA));
    for (const u of F.front.units) if (u.type === 'gun') u.dmg *= 0.4;
    KIT.backOf(rt, F.front, { flag: 'yatagarasu', armor: SAIKA.armor, kind: 'spear', w: 22, depth: 10, count: 200, seed: 15733 });
    rt.marker('front', centerOf(F.front), () => `柵の前の雑賀衆・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(24, () => {
      if (F.step !== 2) return;
      F.front2 = enemyGroup(rt, { faction: 'saito', name: '柵の口から出た雑賀衆', anchor: { x: 14, z: FENCE_Z - 4 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 10, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], SAIKA));
      KIT.backOf(rt, F.front2, { flag: 'yatagarasu', armor: SAIKA.armor, kind: 'spear', w: 18, depth: 10, count: 160, seed: 15734 });
      rt.army.play('eshout', { x: 14, z: FENCE_Z }, 1.5);
      rt.marker('front2', centerOf(F.front2), () => `柵の口から出た雑賀衆・${moraleWord(F.front2.morale)}`, { red: true, group: F.front2 });
    });
  },

  // 柵の前を取った後の段（柵の口の攻め方・渡り口を断たれる）→ ③へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('front'); rt.unmark('front2');
    for (const q of [F.front, F.front2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('柵の前の雑賀衆を崩した'), '柵の前を崩した');
    rt.obj('main', '柵を破り、雑賀衆を退けよ', 'main');
    depthStart(rt, saikaCtx(rt), saikaA(), () => this.counter(rt));
  },
  // ③の後の段（奥の山の口へ追うか、柵を焼くか）→ 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('孫一の打って出を受け止めた'), '孫一の打って出を受け止めた');
    rt.obj('main', HI(rt) ? '預かった一手で雑賀衆を追い、日暮れまで柵の前を守れ' : '退く雑賀衆を見定め、日暮れまで柵の前を守れ', 'main');
    // 山の口へ追うか、柵を焼いて固めるか → 日暮れの最後の撃ち合い → 勝ち
    depthStart(rt, saikaCtx(rt), saikaB(), () => this.win(rt));
  },

  // ③ 雑賀の鉄砲衆の打って出
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('counter');
    rt.banner('雑賀の打って出', '鈴木孫一の鉄砲衆が、柵の口から押し出してくる');
    rt.obj('main', HI(rt) ? '手の者の槍を揃え、打って出た雑賀の鉄砲衆を受け止めよ' : '打って出た雑賀の鉄砲衆を受け止めよ', 'main');
    rt.say('足軽', '三本足の烏の旗……雑賀の孫一じゃ！', 3);
    // 見せ場：孫一の名乗り
    rt.say('鈴木孫一', '我こそは雑賀の鈴木孫一！　織田の者ども、この烏の旗の鉄砲、受けてみよ！', 4.5);
    rt.say('堀秀政', '名高い孫一か。……臆するな！　撃ち終わりを狙って、一気に詰めよ', 3.5);
    rt.after(6, () => rt.say('堀秀政', '織田の鉄砲衆、まだ撃つな！　孫一の衆が川原へ出た所を、一度に撃ち返せ', 4));
    volleyAt(rt, { guns: () => [F.teppo], foes: () => F.last, who: '堀秀政', near: 36, drop: 26, max: 45, line: '織田の鉄砲衆が撃ち返した。烏の旗の列が乱れる。今じゃ、詰めよ' });
    F.last = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: FENCE_Z - 8 }, facing: 0, order: 'attack', seekRange: 70, aggro: 18, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 }, dress(list, SAIKA));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4;
      KIT.backOf(rt, g, { flag: 'yatagarasu', armor: SAIKA.armor, kind: list.some((q) => q.type === 'gun' && q.n >= 6) ? 'gun' : 'spear', w: 20, depth: 10, count: 180, seed: 15735 + F.last.length });
      F.last.push(g);
      rt.marker('l' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: FENCE_Z - 6 }, 1.5);
    };
    volleyAll(F.lines, 'B');
    leanAll(F.lines, 'B', 0.35);
    mk(-10, '鈴木孫一の鉄砲衆', [{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 10 + more(rt) }]);
    mk(14, '雑賀の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }]);   // 孫一の鉄砲衆と一度に打って出る
    rt.after(50, () => { if (!F.ending) { mk(-30, '土橋の鉄砲衆', [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 10 + more(rt) }]); rt.say('足軽', '西の柵の口からも！', 2.5); } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    if (!F.nakanoFall) this.nakanoFalls(rt);
    rt.setPhase('end');
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    for (const q of [...(F.last || []), F.fenceGun]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '小雑賀川を渡り、雑賀衆を退けた', pts: 20 }; }, '任務達成・雑賀衆を退けた');
    sfx('horagai', 0.6);
    rt.banner('雑賀衆、退く', '柵を捨てて、奥の山へ退いた');
    rt.say('堀秀政', `……勝ったとは言えぬな、${nm(rt)}。あの鉄砲衆は、まだ山の奥におる`, 4.5);
    if (F.nakanoFall) rt.after(5, () => rt.say('伝令', '浜手の手は、平井の間近まで寄せましてございまする', 4));
    rt.after(9, () => rt.say('', '――三月、鈴木孫一らは誓紙を出して降った。だが雑賀衆は、やがてまた本願寺に味方する', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  // 浜手：中野城の開城と、平井へ向かう動き（知らせと遠景のみ。プレイヤーの持ち場は山手のまま）
  nakanoFalls(rt) {
    const F = rt.flags, W = rt.world;
    if (F.nakanoFall || !F.nakano) return;
    F.nakanoFall = true;
    if (F.nakanoFlag) rt.scene.remove(F.nakanoFlag);
    rt.scene.add(nobori(W, F.nakano.x - 3, F.nakano.z + 6, 'oda', 6));
    W.addFire(F.nakano.x + 9, F.nakano.z - 7);
    sfx('horagai', 0.5);
    rt.say('伝令', '申し上げます、中野城、開城にございまする！　浜手の手は、平井の方へ向かいましてございまする', 4.5);
    const dx = -40, dz = -100, dist = Math.hypot(dx, dz);
    F.hamate = W.addDistantArmy({ x: F.nakano.x + 4, z: F.nakano.z - 10, w: 20, d: 8, count: 70, facing: Math.atan2(dx, dz), armor: 0x2b3140, flagTex: flagTexture('oda'), seed: 15724 });
    F.hamate.advance(dist * 0.8, 160);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (!F.nakanoFall && F.step >= 1 && rt.t > 75) this.nakanoFalls(rt);
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
      if ((F.front2 && qs.every(gone)) || rt.t - F.stepT > 140) this.midA(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `雑賀衆 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 150) this.midB(rt);
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

// ---------------- 柵の前・柵の内の段 ----------------
const FA = { x: 2, z: FENCE_Z + 10 };            // 柵の前（取った所）
const WG = { x: -10, z: FENCE_Z - 8 };           // 西の柵の口の内
const FD = { x: 10, z: -26 };                    // 渡り口（抜いた乱杭の所）
function saikaCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'yatagarasu', armor: SAIKA.armor, dmg: 0.6, look: (l) => dress(l, SAIKA), friends: () => [F.hori].filter((g) => g && g.count), aid: { name: '堀の手の一組', list: [uS(1), uA(8)] }, aidSaid: '堀の手から一組が加わった' };
}
function saikaA() {
  return [
    rest({ dur: 10, say: [['堀秀政', '柵の前は取った。……じゃが、柵の内からまだ撃ってくる'], ['足軽', '烏の旗が、柵の内にずらりと並んでおる……']] }),
    pick({ title: '柵の口は西と東に二つ。どう攻める？',
      pre: (rt) => rt.say('堀秀政', '西の口の櫓に鉄砲が固まっておる。……その方ならどうする', 3.5),
      options: [{ label: '西の口へ押し入り、櫓の鉄砲衆を黙らせる', note: '櫓を黙らせれば、後の撃ち合いが軽くなる。柵の内は狭く、左右から撃たれる' }, { label: '柵の前に竹束を並べ、味方の鉄砲衆と撃ち合う', note: '味方の鉄砲衆が付く。柵の内の鉄砲は残り、左右から回り込まれる' }],
      on: (rt, m, i) => {
        m.skWest = i === 0; rt.say('堀秀政', i === 0 ? 'よし、西の口じゃ！　込め直しの間に駆け込め！' : 'よし、竹束を前へ！　鉄砲衆、撃ち返せ！', 3);
        const T = rt.flags.teppo;
        if (T && T.count && !m.skWest) { T.order = 'move'; T.dest = { x: FA.x + 12, z: FA.z + 4 }; T.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; }; }
      } }),
    fight({ skip: (rt, m) => !m.skWest, at: WG, max: 130, title: '西の柵の口', sub: '櫓の下に、雑賀の鉄砲衆が並ぶ', obj: '西の柵の口へ押し入り、櫓の下の鉄砲衆を崩せ',
      say: [['足軽', '柵の内じゃ……四方から火縄の匂いがする']],
      foes: () => [gunLine('櫓の下の雑賀の鉄砲衆', { x: -34, z: FENCE_Z - 26 }, WG, 9), { name: '柵の内の雑賀衆', from: { x: -20, z: FENCE_Z - 30 }, list: [uS(2), uA(12)], mass: 200 }],
      later: [
        { t: 35, title: '横から', sub: '東の口から回った雑賀衆が、柵の内を駆けてくる', say: ['足軽', '右から来る！　柵の内で挟まれるぞ！'], foes: () => [{ name: '東から回った雑賀衆', from: { x: 30, z: FENCE_Z - 14 }, list: [uS(1), uA(10), uG(2)], mass: 160 }] },
        { t: 70, say: ['足軽', '奥の小屋の陰からも鉄砲じゃ……！'], foes: () => [gunLine('小屋の陰の鉄砲組', { x: 10, z: FENCE_Z - 30 }, WG, 7, { mass: 60 })] },
      ],
      reward: (t) => { t.special = { label: '西の柵の口を破った', pts: 20 }; }, rewardLabel: '西の柵の口を破った' }),
    hold({ skip: (rt, m) => m.skWest, at: FA, dur: 80, r: 14, title: '竹束の撃ち合い', sub: '柵を挟んで、鉄砲の煙が川原を覆う', label: '竹束の陰', obj: '柵の前で竹束の陰を守り、回り込む雑賀衆を払え',
      waves: [
        { t: 5, say: ['足軽', '柵の内の鉄砲が、揃えて構えた……！'], foes: () => [gunLine('柵の内の雑賀の鉄砲衆', { x: -4, z: FENCE_Z - 20 }, FA, 10, { off: { x: -6, z: -15 }, mass: 80 })] },
        { t: 32, say: ['足軽', '左の川べりから回り込んでくる！'], foes: () => [{ name: '左へ回る雑賀衆', from: { x: -76, z: -32 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 62, say: ['堀秀政', '右じゃ！　右からも……囲まれるな、竹束の陰に寄れ！'], foes: () => [{ name: '右へ回る雑賀衆', from: { x: 76, z: -34 }, list: [uS(1), uA(10), uG(3)], mass: 180 }] },
      ],
      reward: '竹束の陰を守りぬいた' }),
    rest({ dur: 10, say: [['伝令', '川下から雑賀衆が川を渡り、乱杭を抜いた渡り口へ回っておりまする！'], ['足軽', '後ろを断たれたら……川で皆撃たれるぞ']] }),
    pick({ title: '雑賀衆が川下から回り、渡り口を断とうとしている。どうする？',
      options: [{ label: '渡り口へ戻って守る', note: '退く道が残る。柵の内の雑賀は立て直す' }, { label: '構わず柵の内へ攻め入る', note: '雑賀の陣の奥を突けば大手柄。後ろから挟まれる' }],
      on: (rt, m, i) => { m.skBack = i === 0; rt.say('堀秀政', i === 0 ? '戻れ！　渡り口を渡すな！' : '……よし、前だけ見よ。奥を突く！', 3); } }),
    hold({ skip: (rt, m) => !m.skBack, at: FD, dur: 80, r: 13, title: '渡り口', sub: '川下と川上から、雑賀衆が渡り口へ寄せる', label: '渡り口', obj: '乱杭を抜いた渡り口を守れ',
      waves: [
        { t: 5, say: ['足軽', '川下から来たぞ！'], foes: () => [{ name: '川下から回った雑賀衆', from: { x: 78, z: -6 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 35, say: ['足軽', '柵の内から、背を撃ってくる……！'], foes: () => [gunLine('柵の口の鉄砲組', { x: 14, z: FENCE_Z - 8 }, FD, 8, { off: { x: 2, z: -12 } })] },
        { t: 60, say: ['堀秀政', '川上からもか……！　持ちこたえよ！'], foes: () => [{ name: '川上から回った雑賀衆', from: { x: -78, z: -8 }, list: [uS(1), uA(10)], mass: 160 }] },
      ],
      reward: '渡り口を守りぬいた' }),
    fight({ skip: (rt, m) => m.skBack, at: { x: 2, z: FENCE_Z - 16 }, max: 130, title: '雑賀の陣の奥', sub: '小屋の間を、雑賀衆が必死に守る', obj: '柵の内の奥へ攻め入り、雑賀の陣を崩せ',
      foes: () => [{ name: '陣を守る雑賀衆', from: { x: 0, z: -84 }, list: [uS(3), uA(14), uG(3)], mass: 260, noRout: 25 }, gunLine('小屋の前の鉄砲衆', { x: 30, z: -76 }, { x: 2, z: FENCE_Z - 16 }, 8)],
      later: [
        { t: 40, title: '後ろを断たれた', sub: '渡り口を断った雑賀衆が、背から寄せる', say: ['足軽', '後ろじゃ！　柵の口から入ってくる……囲まれた！'], foes: () => [{ name: '背へ回った雑賀衆', from: { x: 14, z: FENCE_Z + 12 }, list: [uS(2), uA(12)], mass: 180 }, { name: '西の口から入る雑賀衆', from: { x: -40, z: FENCE_Z - 10 }, list: [uS(1), uA(8)], mass: 120 }] },
      ],
      reward: (t) => { t.special = { label: '雑賀の陣の奥を突いた', pts: 25 }; }, rewardLabel: '雑賀の陣の奥を突いた' }),
  ];
}
function saikaB() {
  const MT = { x: 0, z: -78 };
  const RM = round(MT, Math.PI, 46);
  const FP = { x: 2, z: FENCE_Z + 8 };
  return [
    rest({ dur: 12, say: [['堀秀政', '雑賀衆が柵を捨てて、奥の山の口へ退いていく'], ['足軽', '烏の旗が、山の方へ……孫一もあの中か']] }),
    pick({ title: '雑賀衆が奥の山の口へ退く。どうする？',
      pre: (rt) => rt.say('堀秀政', '追えば孫一の首が取れるかもしれぬ。……じゃが、山の口は狭い', 3.5),
      options: [{ label: '柵に火をかけ、ここを固める', note: '雑賀の足場を焼く。取り返しに来る' }, { label: '山の口まで追う', note: '孫一の後備えを崩せば大手柄。山の上から撃たれるかもしれぬ' }],
      on: (rt, m, i) => { m.skChase = i === 1; if (i === 0) for (const x of [-22, -4, 16]) rt.world.addFire(x, FENCE_Z - 3); rt.say('堀秀政', i === 1 ? 'よし、追え！　ただし山へは深入りするな' : 'よし、柵に火をかけよ！　小屋も焼け', 3); } }),
    fight({ skip: (rt, m) => !m.skChase, at: MT, max: 170, title: '山の口', sub: '退く雑賀衆の後ろに、孫一の後備えが向き直る', obj: '山の口で、孫一の後備えを崩せ',
      foes: () => [{ name: '孫一の後備え', from: RM.front, list: [uS(3), uA(12), uG(3)], mass: 240, noRout: 25 }],
      later: [
        { t: 25, title: '伏せ鉄砲', sub: '左右の山の上に、火縄の火が並ぶ', say: ['足軽', '左右の山の上じゃ……！　鉄砲が並んでおる、木の陰へ！'], foes: () => [gunLine('左の山の鉄砲衆', RM.left, MT, 8), gunLine('右の山の鉄砲衆', RM.right, MT, 8)] },
        { t: 65, title: '囲まれる', sub: '退いたはずの雑賀衆が、後ろへ回る', say: ['堀秀政', '誘い込まれたか……！　後ろを破って退け！'], foes: () => [{ name: '後ろへ回った雑賀衆', from: RM.back, list: [uS(2), uA(12)], mass: 200 }] },
      ],
      reward: (t) => { t.special = { label: '孫一の後備えを崩した', pts: 25 }; }, rewardLabel: '孫一の後備えを崩した' }),
    hold({ skip: (rt, m) => m.skChase, at: FP, dur: 100, r: 14, title: '焼ける柵', sub: '柵と小屋が燃え、雑賀衆が取り返しに来る', label: '焼けた柵の前', obj: '焼けた柵の前で、取り返しに来る雑賀衆を受けよ',
      waves: [
        { t: 6, say: ['足軽', '山から雑賀衆が下りてくる！'], foes: () => [{ name: '取り返しに来た雑賀衆', from: { x: -10, z: -96 }, list: [uS(2), uA(14)], mass: 240 }] },
        { t: 36, say: ['足軽', '煙の向こうで、鉄砲が揃えて構えた……！'], foes: () => [gunLine('雑賀の鉄砲衆', { x: 20, z: -90 }, FP, 10, { off: { x: 10, z: -26 } })] },
        { t: 62, say: ['足軽', '右の川べりからも来る……！'], foes: () => [{ name: '右へ回る雑賀衆', from: { x: 72, z: -40 }, list: [uS(2), uA(10), uG(3)], mass: 180 }] },
      ],
      reward: '焼けた柵を守りぬいた' }),
    hold({ at: FP, dur: 70, r: 14, title: '最後の撃ち合い', sub: '日暮れ。雑賀の鉄砲が、最後に一斉に火を噴く', label: '柵の前', obj: '日暮れまで、柵の前を守れ',
      say: [['堀秀政', 'これで最後じゃ。日が沈めば、雑賀も退く']],
      waves: [
        { t: 4, say: ['足軽', '烏の旗が、また並んだ……！'], foes: (rt, m) => [gunLine('孫一の鉄砲衆', { x: -6, z: -92 }, FP, m.skChase ? 7 : 10, { off: { x: -4, z: -26 } }), { name: '雑賀の最後の寄せ', from: { x: 40, z: -80 }, list: [uS(2), uA(10)], mass: 180 }] },
      ],
      reward: '日暮れまで柵の前を守った' }),
  ];
}

// 両軍の総勢（織田 十万とも言われる大軍、雑賀衆 数千。数には諸説ある）
saika.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(60000 - (F.ak || 0) * 30), a0: 60000, b: Math.max(0, 6000 - (F.ek || 0) * 30), b0: 6000 };
};
saika.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '雑賀衆', mon: 'yatagarasu' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
saika.famous = [
  { name: '佐久間信盛', team: 0, g: /鉄砲/, loose: 1, line: '佐久間信盛じゃ。川を渡る者の後ろから撃ち込め！' },
  { name: '土橋守重', g: /柵の内|柵の前|柵の口/, loose: 1, line: '雑賀の土橋守重なり！　この川、一人も渡らせぬ！' },
];
saika.date = () => '天正五年二月　春・晴';
saika.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
saika.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
saika.history = '紀伊の雑賀衆は、多くの鉄砲を持つ地侍の集まりで、石山本願寺に味方して織田勢を苦しめていた。天正五年（1577）二月、信長は雑賀の中の三つの郷と根来の者を味方につけ、大軍で紀伊へ攻め入った（十万とも言われるが、数には諸説ある）。小雑賀川を渡ろうとした堀秀政らの手は、川底に沈められた桶や乱杭に足を取られ、対岸の柵の内から鉄砲を浴びて苦しんだと伝わる。戦は長引いたが、三月、鈴木孫一（重秀）ら雑賀の主な者は誓紙を出して降った。しかし雑賀衆はその後も本願寺に味方し、信長の死まで紀伊は治まらなかった。雑賀の鈴木氏の旗印とされる八咫烏を、ここでは墨の烏で描いている。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
saika.lordAt = { x: 0, z: 64, r: 12, why: '小雑賀川の手前の織田の陣（信長は自ら大軍を率いて紀州へ入った）' };
saika.lordSpawn = { x: 0, z: 60, heading: Math.PI };

// 素直な遊び手：乱杭を抜き、川を渡り、柵の前の雑賀衆と戦い、打って出を受け止める
saika.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 24, 2); return; }
  // 乱杭・柵越しに見えるだけで届かない敵を追わない（さもないと壁際で永遠に空振りして止まる。kaito 10/1）
  const e = b.army.nearestEnemy(u, F.step === 1 ? 7 : 12, (o) => !o.fleeing && o.pos.z > FENCE_Z + 0.8 && !b.army.wallBetween(u.pos, u.team, o.pos));
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
  // 乱杭の跡（抜いた所以外は今も塞がる）を越えるまでは、いちばん近い抜き跡へ向かわせる（さもないと壁に突っかかる）
  if (F.step === 2) { if (u.pos.z > -24 && STAKES.every((a) => Math.abs(u.pos.x - a.x) > 3)) { const near = STAKES.reduce((a, b) => (Math.abs(b.x - u.pos.x) < Math.abs(a.x - u.pos.x) ? b : a)); goTo(p, inp, near.x, -24, 1); return; } const q = [F.front, F.front2].find((x) => x && !gone(x)); const c = q ? q.center() : { x: 0, z: FENCE_Z + 6 }; goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, FENCE_Z + 3), 2); return; } goTo(p, inp, 0, FENCE_Z + 8, 2); }
};

export { saika };
