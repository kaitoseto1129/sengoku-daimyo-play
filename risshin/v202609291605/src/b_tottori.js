// ======================================================================
// 織田家編　鳥取城の戦い（天正九年十月）
// 羽柴秀吉は因幡の鳥取城を囲み、まわりの米を先に買い集めてから、付城と柵で城を囲んで兵糧を断った（鳥取の渇え殺し）。
// 城を守る吉川経家は四か月耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命と引き換えに自害して城を開いた。
// 足軽は羽柴秀吉の手。①夜、千代川の岸に着いた毛利の兵糧舟に火をかける ②兵糧を取りに打って出た城兵を止める
// ③開城の使いを城の木戸まで供する（戦は、ここで終わる）
// ①と②の間・②と③の間に段（b_depth.js）：丸山城（奈佐日本之介）の舟の衆が岸へ上がる（岸で受けるか柵へ退くか）→舟の衆の本手
// →城兵の総出と丸山城の衆が内と外から挟む（柵の口か柵の外か）→逃げ帰る飢えた城兵を見逃すか追うか
// 向き：北（-z）に鳥取城の山（久松山）。西（-x）を千代川が海へ流れる。南（+z）に秀吉の本陣（太閤ヶ平）
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, tawara, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, pick, fight, hold, move } from './b_depth.js';
import { uS, uA, uG, uB, round, gunLine, lines, leanAll, camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-70, 200], [-72, 80], [-66, 0], [-74, -90], [-90, -200]];
const CASTLE = { x: 10, z: -120 };          // 鳥取城（久松山のふもとの木戸）
const GATE = { x: 10, z: -84 };
const BOATS = [{ x: -58, z: -30 }, { x: -60, z: -8 }];   // 岸に着いた兵糧舟
const FENCE_Z = -60;                        // 秀吉方の柵（城を囲む）
const ODA = { flag: 'oda' };
const KIKKAWA = { flag: 'mori' };           // 吉川は毛利の一門（毛利の紋で）

function height(x, z) {
  let h = 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  h += 40 * gauss(x, z, CASTLE.x + 10, CASTLE.z - 50, 5000);           // 久松山
  h += 16 * gauss(x, z, 60, 110, 4000);                                // 太閤ヶ平
  return h;
}
function boatMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const hullM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 9), wood); hullM.position.y = 0.2; g.add(hullM);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x9a8656, roughness: 1 })); t.rotation.z = Math.PI / 2; t.position.set(0, 0.7, -3 + i * 1.8); g.add(t); }
  for (const m of g.children) m.castShadow = true;
  return g;
}

const tottori = {
  spawn: { x: -30, z: 10, heading: -Math.PI / 2 },
  world: {
    seed: 15810,
    time: 'dusk',
    autumn: true,
    muddy: 0.35,
    streams: [{ pts: RIVER, w: 12, depth: 1.2 }],
    paths: [[[60, 110], [20, 40], [-30, 10], [-50, -18]], [[10, 20], [GATE.x, GATE.z + 4]]],
    height,
    clear: (x, z) => Math.abs(x) < 100 && z > -100 && z < 90,
    trees: 480,
    tufts: 3400,
    treeDensity: (x, z) => (Math.abs(x) < 100 && z > -100 && z < 90 ? 0.1 : 1),
    groves: [{ x: 60, z: -20, r: 12, n: 16 }, { x: -30, z: 60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -110 || x < -100),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.burnt = 0;
    // ---- 城を囲む柵（木戸の前は開けてある） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-50, FENCE_Z + 4], [0, FENCE_Z]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[20, FENCE_Z], [70, FENCE_Z + 6]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z] of [[-30, FENCE_Z + 8], [40, FENCE_Z + 8]]) rt.scene.add(yagura(W, x, z));
    // ---- 鳥取城の木戸と山の上の屋敷 ----
    rt.scene.add(kabukimon(W, GATE.x, GATE.z, 7, 0));
    for (const sd of [-1, 1]) noT(wallLine(rt, [[GATE.x + sd * 3.6, GATE.z], [GATE.x + sd * 30, GATE.z - 6]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z, r] of [[CASTLE.x - 6, CASTLE.z, 0.1], [CASTLE.x + 14, CASTLE.z - 10, -0.2], [CASTLE.x + 26, CASTLE.z - 30, 0.2]]) rt.scene.add(hut(W, x, z, 9, 6, r, { h: 3.2, wall: 0x6a5a44, roof: 0x3a3430 }));
    for (const [x, z] of [[GATE.x - 6, GATE.z - 4], [GATE.x + 6, GATE.z - 4]]) rt.scene.add(nobori(W, x, z, 'mori', 6));
    // ---- 岸の兵糧舟 ----
    F.boats = BOATS.map((b, i) => { const m = boatMesh(); m.position.set(b.x - 6, -0.6, b.z); m.rotation.y = 0.2 * (i ? 1 : -1); rt.scene.add(m); return { ...b, m, i }; });
    // ---- 羽柴秀吉の手（自分の持ち場）、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: -20, z: 16 }, facing: -Math.PI / 2, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '蜂須賀正勝の手', anchor: { x: 10, z: FENCE_Z + 12 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.hide, F.hachi];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -26, z: 22 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 太閤ヶ平の本陣と大軍（軽い作り） ----
    // 太閤ヶ平の本陣（秀吉は前へ出ているので、弟の秀長が留守を預かる）と、鳥取城の吉川経家の陣所
    F.honjin = camp(rt, { x: 60, z: 112, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀長', hat: 'kabuto_m', haori: 0x5a4a2a }, guard: 15, reserve: 200, runTo: { x: -20, z: 20 } });
    F.ehon = camp(rt, { x: CASTLE.x - 32, z: CASTLE.z + 8, facing: 0, team: 1, faction: 'saito', mon: 'mori', general: { name: '吉川経家', hat: 'kabuto_m', haori: 0x3a2a2a }, guard: 15, reserve: 150, runTo: { x: GATE.x, z: GATE.z - 8 } });
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(40, 80, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15812);
    DA(-30, 70, 30, 12, 200, Math.PI, 0x2b3140, 'eiraku', 15813);
    for (const [x, z] of [[-40, FENCE_Z + 14], [0, FENCE_Z + 14], [40, FENCE_Z + 14], [60, 100]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[-10, 30], [20, 34]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 舟の番（毛利の者） ----
    F.guard = enemyGroup(rt, { faction: 'saito', name: '舟の番（毛利勢）', anchor: { x: -52, z: -20 }, facing: Math.PI / 2, width: 10, aggro: 14, morale: 85, fleeDir: { x: -1, z: -0.3 }, dmgMult: 0.62 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 + more(rt, 0.3) }, { type: 'gun', n: 2 }], KIKKAWA));
    for (const u of F.guard.units) if (u.type === 'gun') u.dmg *= 0.45;

    applyLook(rt, NIGHT);
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、羽柴秀吉の下知を待て' : '羽柴秀吉のもとで、下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、城の中では、もう草の根も尽きたと聞く。……毛利は今夜も、川から兵糧を入れようとしておる`, 5);
    rt.say('羽柴秀吉', '千代川の岸に舟が着いた。番の者を退けて、舟に火をかけよ。……一粒も城へ入れてはならぬ', 4.5);
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉', {});
    rt.after(15, () => this.boats(rt));
  },

  // ① 兵糧舟に火をかける
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('boats');
    rt.unmark('hide');
    sfx('taiko', 0.6);
    rt.obj('main', '舟の番を退け、岸の兵糧舟に火をかけよ（2艘）', 'main');
    F.guard.order = 'attack'; F.guard.seekRange = 40;
    F.hide.order = 'attack'; F.hide.seekRange = 50;
    rt.marker('guard', centerOf(F.guard), () => `舟の番・${moraleWord(F.guard.morale)}`, { red: true, group: F.guard });
    rt.after(22, () => {
      if (F.step !== 1) return;
      F.guard2 = enemyGroup(rt, { faction: 'saito', name: '川を上ってきた毛利勢', anchor: { x: -56, z: 20 }, facing: Math.PI, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt, 0.3) }], KIKKAWA));
      rt.army.play('eshout', { x: -56, z: 20 }, 1.4);
      rt.say('足軽', '川下から、別の舟の者が上がってきた！', 3);
      rt.marker('guard2', centerOf(F.guard2), () => `川を上ってきた毛利勢・${moraleWord(F.guard2.morale)}`, { red: true, group: F.guard2 });
    });
    for (const b of F.boats) {
      rt.marker('b' + b.i, b, '兵糧舟', { h: 2 });
      rt.addInteract('b' + b.i, { x: b.x, z: b.z }, '舟に火をかける', () => this.burn(rt, b), { r: 3, hold: 2 });
    }
  },
  burn(rt, b) {
    const F = rt.flags;
    rt.uninteract('b' + b.i); rt.unmark('b' + b.i);
    rt.world.addFire(b.x - 6, b.z, { h: 0.4 }); rt.world.addSmokeColumn(b.x - 6, 3, b.z, { size: 2.4 });
    F.burnt++;
    rt.award((t) => t.side.push('兵糧舟に火をかけた'), '兵糧舟を焼いた');
    if (F.burnt >= 2) this.midA(rt);
    else rt.objProgress('main', `${F.burnt}／2艘`);
  },

  // ①の後の段：燃える舟を取り返しに来る丸山城の舟の衆 → ②へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.5) return;
    F.step = 1.5;
    rt.unmark('guard'); rt.unmark('guard2');
    for (const q of [F.guard, F.guard2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.obj('main', HI(rt) ? '付城の一手を預かり、兵糧を一粒も城へ入れるな' : '兵糧を一粒も城へ入れるな', 'main');
    // 千代川の東の川原では、羽柴の外の囲みと、丸山城から出た毛利勢が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -34, z: 62, facing: -Math.PI / 2, w: 40, seed: 15814, A: ['oda', 0x2b3140, 380, 'oda'], B: ['mori', 0x33302a, 420, 'saito'], bowsB: true, surge: { every: 55, count: 120, flank: 0.3 } },
    ]);
    F.lines.forEach((c) => rt.after(2, () => c.go()));
    depthStart(rt, ttCtx(rt), ttA(), () => this.sortie(rt));
  },
  // ②の後の段：内と外から同時に寄せる → 逃げ帰る城兵をどうするか → ③へ
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    for (const q of F.sallies || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('打って出た城兵を柵の前で止めた'), '城兵を止めた');
    depthStart(rt, ttCtx(rt), ttB(), () => this.envoy(rt));
  },

  // ② 打って出た城兵を止める
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('sortie');
    rt.unmark('guard'); rt.unmark('guard2');
    for (const q of [F.guard, F.guard2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    sfx('horagai', 0.6);
    rt.banner('城兵が打って出た', '燃える舟の兵糧を取ろうと、痩せた兵が木戸から走り出る');
    rt.obj('main', HI(rt) ? '預かった柵の一手で、打って出た城兵を止めよ' : '柵の前で、打って出た城兵を止めよ', 'main');
    rt.say('羽柴秀吉', '……止めよ。柵の内へ入れるな。だが、逃げ帰る者は追うな', 4);
    F.sallies = [];
    const mk = (x, name, n2) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: GATE.z + 6 }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 1.9 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: n2 }], KIKKAWA));
      // 飢えた兵は弱い
      for (const u of g.units) { u.hp = u.maxHp = u.maxHp * 0.8; }
      KIT.backOf(rt, g, { flag: 'mori', armor: 0x33302a, kind: 'spear', w: 18, depth: 10, count: 150, seed: 15815 + F.sallies.length });
      F.sallies.push(g);
      rt.marker('s' + F.sallies.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    mk(4, '打って出た城兵', 16 + more(rt, 0.3));
    mk(20, '城兵の新手', 12 + more(rt, 0.3));   // 初めの打って出は二手が一度に来る
    rt.after(50, () => { if (F.step === 2) { mk(-6, '最後に打って出た城兵', 12 + more(rt, 0.3)); rt.say('足軽', '……あれほど痩せても、まだ来るのか', 3); } });
    F.hide.order = 'move'; F.hide.dest = { x: -10, z: FENCE_Z + 10 }; F.hide.onArrive = (g) => { g.order = 'hold'; g.aggro = 16; };
    // 勝ち筋：柵の前は開けている。城兵が柵へ寄った所を、柵の内の鉄砲組がそろって撃つ
    F.tgun = allyGroup(rt, { name: '柵の内の鉄砲組', anchor: { x: 8, z: FENCE_Z + 10 }, facing: Math.PI, width: 18, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    rt.after(5, () => rt.say('蜂須賀正勝', '柵の前は開けておる。柵へ寄った所を鉄砲で撃てば、飢えた兵はそれで崩れる。槍はその後じゃ', 4.5));
    volleyAt(rt, { guns: () => [F.tgun], foes: () => F.sallies, who: '蜂須賀正勝', near: 20, drop: 32, max: 50, line: '柵の内の鉄砲がそろって火を吹いた。痩せた城兵の足が止まる' });
  },

  // ③ 開城の使いを供する
  envoy(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('envoy');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    for (const q of F.sallies || []) if (!gone(q)) { q.order = 'flee'; q.routed = true; for (const u of q.units) u.fleeing = true; }
    applyLook(rt, DAWN);
    rt.after(1, () => rt.world.setTime('morning'));
    rt.banner('夜が明ける', '城から、和を請う使いが来た');
    rt.say('羽柴秀吉', `吉川経家殿が、城兵の命と引き換えに腹を切ると申されておる。……${nm(rt)}、返事の使いの供をせよ。木戸までじゃ`, 5.5);
    rt.obj('main', '開城の返事を持つ使いを、城の木戸まで供せよ', 'main');
    const g = allyGroup(rt, { name: '秀吉の使い', anchor: { x: 0, z: FENCE_Z + 8 }, facing: Math.PI, width: 3, aggro: 0, noRout: true, formation: 'column', speed: 1.6 },
      [{ type: 'samurai', n: 1, o: { name: '使いの侍', flag: null } }, { type: 'porter', n: 2, o: { flag: null } }]);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    g.order = 'path'; g.path = [[8, FENCE_Z - 2], [GATE.x, GATE.z + 6]]; g.pathIdx = 0;
    g.onArrive = () => this.win(rt);
    F.env = g;
    rt.marker('env', centerOf(g), '使い', {});
    rt.zone('gate', GATE.x, GATE.z + 6, 5);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('env'); rt.unzone('gate');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '鳥取城の囲みを守り、開城の使いを供した', pts: 20 }; }, '任務達成・鳥取城、開く');
    sfx('kane', 0.5);
    rt.banner('鳥取城、開く', '吉川経家は城兵の命と引き換えに自害した');
    rt.say('羽柴秀吉', `……惜しい武将じゃった。${nm(rt)}、城から出てくる者に粥を与えよ。急に食わせるな、少しずつじゃ`, 5.5);
    rt.after(6, () => rt.say('', '――飢えた城兵の多くは、与えられた食べ物を急に食べて命を落としたとも伝わる', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `${F.burnt}／2艘${gone(F.guard) ? '' : `・番 ${F.guard.count}人`}`);
      if (F.guard.count < 4 && !gone(F.guard)) F.guard.morale = Math.min(F.guard.morale, 20);
      if (rt.t - F.stepT > 140) for (const b of F.boats) if (rt.interacts.some((q) => q.id === 'b' + b.i)) this.burn(rt, b);
    }
    if (F.step === 2) {
      const L = F.sallies || [];
      rt.objProgress('main', `城兵 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 15);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 140) this.midB(rt);
    }
    if (F.step === 3 && F.env) {
      const c = F.env.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 14 && F.env.order === 'path') { F.env.order = 'hold'; F.env.anchor = { x: c.x, z: c.z }; }
      else if (d < 8 && F.env.order === 'hold') F.env.order = 'path';
      rt.objProgress('main', `木戸まで ${Math.round(Math.hypot(c.x - GATE.x, c.z - GATE.z - 6))}m`);
      if (rt.t - F.stepT > 120) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いた`, 2.5);
  },
};

// ---------------- 川岸と柵の段 ----------------
const BANK = { x: -50, z: -6 };                       // 舟を焼いた川岸
const FG = { x: 10, z: FENCE_Z + 7 };                  // 木戸の前の柵の口
function ttCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'mori', armor: 0x33302a, dmg: 0.6, look: (l) => dress(l, KIKKAWA), friends: () => [F.hide].filter((g) => g && g.count), aid: { name: '羽柴の手の一組', list: [uS(1), uA(8)] }, aidSaid: '羽柴の手から一組が加わった' };
}
function ttA() {
  const R = round(BANK, -Math.PI / 2, 46);   // 川（西）の向こうが正面
  return [
    rest({ dur: 8, say: [['足軽', '舟が燃える……米の焦げる匂いじゃ'], ['羽柴秀吉', '……まだ来るぞ。川下の暗がりに、舟の影がいくつもある']] }),
    pick({ title: '丸山城の奈佐日本之介の舟の衆が、燃える舟を取り返しに岸へ上がってくる。どうする？',
      pre: (rt) => rt.say('伝令', '丸山城の舟の衆が、川の上と下から岸へ上がりまする！　数は数百！', 3.5),
      options: [{ label: '岸に踏みとどまり、迎え撃つ', note: '岸で叩けば、舟の衆は二度と寄せない。上と下と向こう岸から囲まれる' }, { label: '柵まで退き、蜂須賀殿の手と一つになる', note: '柵を背に戦える。退く途中を追われる' }],
      on: (rt, m, i) => { m.ttBank = i === 0; rt.say('羽柴秀吉', i === 0 ? 'よし、岸を渡すな！　槍を川へ向けよ' : 'よし、柵まで下がれ。蜂須賀と組むぞ', 3); } }),
    hold({ skip: (rt, m) => !m.ttBank, at: BANK, dur: 80, r: 13, title: '川岸', sub: '闇の川から、舟の衆が次々に岸へ上がる', label: '川岸', obj: '川岸に踏みとどまり、舟の衆を岸へ上げるな',
      waves: [
        { t: 5, say: ['足軽', '川上から来る！'], foes: () => [{ name: '川上から上がる舟の衆', from: { x: -58, z: -70 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 30, say: ['足軽', '向こう岸に火縄の火が並んだ……伏せろ！'], foes: () => [gunLine('向こう岸の鉄砲組', { x: -92, z: -8 }, BANK, 9, { off: { x: -32, z: -2 } })] },
        { t: 55, say: ['足軽', '川下からもじゃ……囲まれる！'], foes: () => [{ name: '川下から上がる舟の衆', from: { x: -56, z: 50 }, list: [uS(2), uA(12)], mass: 200 }] },
      ],
      reward: '川岸を守りぬいた' }),
    move({ skip: (rt, m) => m.ttBank, to: { x: -20, z: FENCE_Z + 14 }, r: 8, label: '蜂須賀の手の後ろ', obj: '組を連れて柵まで退け',
      ambush: { t: 12, title: '追手', sub: '舟の衆が、退く背を追う', say: ['足軽', '追ってくる！　振り向いて槍を揃えよ！'], foes: () => [{ name: '追ってきた舟の衆', from: { x: -60, z: 10 }, list: [uS(2), uA(12)], mass: 180 }] } }),
    fight({ at: (rt, m) => (m.ttBank ? BANK : { x: -30, z: FENCE_Z + 16 }), max: 120, title: '奈佐日本之介の手', sub: '丸山城の舟の衆の本手が、岸に上がった', obj: '舟の衆の本手を崩せ',
      say: [['羽柴秀吉', '本手じゃ！　あれを崩せば、今夜の舟はもう来ぬ！']],
      foes: (rt, m) => [{ name: '舟の衆の本手（奈佐日本之介の手）', from: { x: -60, z: m.ttBank ? -60 : -30 }, list: [uS(3), uA(14), uG(2)], mass: 260, noRout: 25 }],
      later: [
        { t: 35, title: '鉄砲', sub: '舟の上から鉄砲衆が並んで撃つ', say: ['足軽', '舟の上に鉄砲が並んでおる……！'], foes: (rt, m) => [gunLine('舟の上の鉄砲衆', { x: -86, z: m.ttBank ? -30 : -20 }, m.ttBank ? BANK : { x: -30, z: FENCE_Z + 16 }, 10, { off: { x: -26, z: -10 } })] },
        { t: 70, if: (rt, m) => !m.ttBank, title: '横槍', sub: '柵の外を回った舟の衆が、横から寄せる', say: ['足軽', '横から来た……！'], foes: () => [{ name: '柵の外を回った舟の衆', from: { x: -60, z: 30 }, list: [uS(1), uA(10)], mass: 150 }] },
      ],
      reward: (t) => { t.special = { label: '舟の衆の本手を崩した', pts: 20 }; }, rewardLabel: '舟の衆の本手を崩した' }),
    rest({ dur: 8, bark: '立て直し：組を柵の前へ寄せる', say: [['羽柴秀吉', '……舟は退いたか。ようやった'], ['足軽', '城の木戸で、何か動いておる……']] }),
  ];
}
function ttB() {
  const R = round(FG, Math.PI, 40);
  return [
    rest({ dur: 10, say: [['羽柴秀吉', '城の中で太鼓が鳴っておる……最後の総出か'], ['伝令', '川原の丸山城の衆も、柵の外へ寄せてまいります！　内と外から挟む気でございます！']] }),
    pick({ title: '城兵の総出と、丸山城の衆が、内と外から同時に柵へ寄せる。どこを守る？',
      options: [{ label: '木戸の前の柵の口を守る', note: '城兵を柵の内へ入れない。外からの寄せは背に受ける' }, { label: '柵の外へ回り、丸山城の衆を先に叩く', note: '外の敵を先に崩せば手柄。その間に柵の口が破られかける' }],
      on: (rt, m, i) => { m.ttOut = i === 1; rt.say('羽柴秀吉', i === 0 ? '心得た、口を固めよ！　背の敵には蜂須賀を当てる' : 'ならば外を叩け！　柵の口は蜂須賀が持たせる', 3); } }),
    hold({ skip: (rt, m) => m.ttOut, at: FG, dur: 80, r: 12, title: '内と外から', sub: '木戸から城兵、背の川原から丸山城の衆', label: '柵の口', obj: '柵の口を守り、内と外から寄せる敵を退けよ',
      waves: [
        { t: 5, say: ['足軽', '木戸が開いた……城兵が総出で来る！'], foes: () => [{ name: '総出の城兵', from: { x: GATE.x, z: GATE.z + 4 }, list: [uS(2), uA(14)], mass: 200 }] },
        { t: 30, say: ['足軽', '城の塀の上で、火縄の火がちらつく！'], foes: () => [gunLine('塀の上の鉄砲衆', { x: GATE.x + 16, z: GATE.z + 2 }, FG, 9, { off: { x: 10, z: -16 } })] },
        { t: 55, say: ['足軽', '後ろじゃ！　川原から丸山城の衆が！'], foes: () => [{ name: '背の丸山城の衆', from: R.back, list: [uS(2), uA(12)], mass: 200 }] },
      ],
      reward: '内と外からの寄せに、柵の口を守りぬいた' }),
    fight({ skip: (rt, m) => !m.ttOut, at: { x: -30, z: -20 }, max: 120, title: '柵の外', sub: '川原を、丸山城の衆が柵へ寄せる', obj: '柵の外で、丸山城の衆を崩せ',
      foes: () => [{ name: '丸山城の衆', from: { x: -60, z: 30 }, list: [uS(3), uA(14)], mass: 240, noRout: 20 }, gunLine('川原の鉄砲組', { x: -70, z: -40 }, { x: -30, z: -20 }, 8)],
      later: [{ t: 50, title: '柵の口が危ない', sub: '城兵が柵の口に取り付いた', say: ['足軽', '柵の口に城兵が取り付いた！　蜂須賀殿の手が押されておる……後ろから来るぞ！'], foes: () => [{ name: '柵を越えた城兵', from: { x: 0, z: FENCE_Z + 4 }, list: [uS(1), uA(12)], mass: 150 }] }],
      reward: (t) => { t.special = { label: '柵の外で丸山城の衆を崩した', pts: 20 }; }, rewardLabel: '丸山城の衆を崩した' }),
    rest({ dur: 8, say: [['足軽', '……城兵が、焼けた舟の米に群がっておる。骨と皮じゃ'], ['羽柴秀吉', '……']] }),
    pick({ title: '痩せた城兵が、焼け残りの米を拾って木戸へ逃げ帰る。どうする？',
      options: [{ label: '見逃し、粥の鍋を柵の外に置いてやる', note: '城兵の心が折れる。手柄にはならない' }, { label: '追い散らし、木戸まで押す', note: '木戸の前で討てば手柄。城の塀の上から撃たれ、左右から囲まれる' }],
      on: (rt, m, i) => {
        m.ttChase = i === 1;
        if (i === 0) { rt.say('羽柴秀吉', '……よう申した。腹が減っては、人は人でなくなる。鍋を置いてやれ', 4); rt.award((t) => t.side.push('飢えた城兵を見逃した'), '飢えた城兵を見逃した'); }
        else rt.say('羽柴秀吉', '……ならば押せ。じゃが木戸の中へは入るなよ', 3);
      } }),
    fight({ skip: (rt, m) => !m.ttChase, at: { x: GATE.x, z: GATE.z + 16 }, max: 100, title: '木戸の前', sub: '木戸の前で、城兵が最後の力で向き直る', obj: '木戸の前で、向き直った城兵を崩せ',
      foes: () => [{ name: '木戸の前の城兵', from: { x: GATE.x, z: GATE.z - 6 }, list: [uS(2), uA(12)], mass: 160, morale: 100 }, gunLine('木戸の上の鉄砲組', { x: GATE.x - 18, z: GATE.z - 2 }, { x: GATE.x, z: GATE.z + 16 }, 8, { off: { x: -12, z: -12 } })],
      later: [{ t: 30, title: '囲まれる', sub: '柵の脇から、城兵が左右へ回る', say: ['足軽', '左右から……！　木戸の前で囲まれるぞ！'], foes: () => [{ name: '左の城兵', from: { x: GATE.x - 34, z: GATE.z + 10 }, list: [uS(1), uA(8)], mass: 100 }, { name: '右の城兵', from: { x: GATE.x + 34, z: GATE.z + 10 }, list: [uS(1), uA(8)], mass: 100 }] }],
      reward: (t) => { t.special = { label: '木戸の前まで押した', pts: 15 }; }, rewardLabel: '木戸の前まで押した' }),
    // 夜明け前：毛利の後詰（丸山城の衆と、海から来た吉川元春の先手）が、囲みを破りに最後の寄せ
    rest({ dur: 8, heal: 0.3, say: [['伝令', '丸山城に、海から毛利の後詰が入りました！　夜明け前に、囲みを破りに来まする'], ['羽柴秀吉', '……これを退ければ、城はもう持たぬ。経家殿も、それを待っておるのじゃ']] }),
    pick({ title: '夜明け前、毛利の後詰が川原から柵へ寄せてくる。どう迎える？',
      options: [{ label: '柵の内に鉄砲をそろえ、寄せきった所を撃つ', note: '崩れにくい。長く寄せを受け続ける' }, { label: '篝火を消し、川原の葦に伏せて横から突く', note: '当たれば一息に崩せて大手柄。遅れれば囲まれる' }],
      on: (rt, m, i) => { m.ttAmb = i === 1; rt.say('羽柴秀吉', i === 0 ? 'よし、柵に鉄砲を並べよ。寄せきるまで撃つな' : '篝火を消せ。葦に伏せ、声を立てるな……', 3.5); } }),
    hold({ skip: (rt, m) => m.ttAmb, at: { x: -18, z: FENCE_Z + 12 }, dur: 85, r: 13, title: '毛利の後詰', sub: '夜明け前の川原から、毛利の旗が柵へ押し寄せる', label: '柵', obj: '柵を守り、毛利の後詰を退けよ',
      waves: [
        { t: 4, say: ['足軽', '来た……川原が旗で埋まっておる！'], foes: () => [{ name: '毛利の後詰', from: { x: -58, z: 24 }, list: [uS(3), uA(14)], mass: 260, noRout: 25 }] },
        { t: 32, say: ['足軽', '向こう岸から鉄砲じゃ、伏せろ！'], foes: () => [gunLine('向こう岸の毛利の鉄砲', { x: -92, z: 0 }, { x: -18, z: FENCE_Z + 12 }, 9, { off: { x: -40, z: 10 } })] },
        { t: 58, say: ['羽柴秀吉', '最後の寄せじゃ。ここを凌げば、夜が明ける！'], foes: () => [{ name: '丸山城の衆', from: { x: -56, z: -30 }, list: [uS(2), uA(12)], mass: 200 }] },
      ],
      reward: '柵を守り、毛利の後詰を退けた', lost: ['羽柴秀吉', '押し込まれたか……じゃが、囲みは破れておらぬ'] }),
    fight({ skip: (rt, m) => !m.ttAmb, at: { x: -40, z: 10 }, max: 130, title: '横槍', sub: '葦の中から、毛利の後詰の横腹へ', obj: '葦から躍り出て、毛利の後詰を崩せ',
      say: [['羽柴秀吉', '今じゃ、かかれっ！']],
      foes: () => [{ name: '毛利の後詰', from: { x: -60, z: 30 }, list: [uS(3), uA(14)], mass: 260, morale: 70 }],
      later: [{ t: 40, title: '新手', sub: '丸山城の衆が、横槍の背へ回る', say: ['足軽', '後ろじゃ！　丸山城の衆が回ってきた！'], foes: () => [{ name: '丸山城の衆', from: { x: -56, z: -30 }, list: [uS(2), uA(12)], mass: 200 }] }],
      reward: (t) => { t.special = { label: '葦に伏せ、毛利の後詰の横腹を突いた', pts: 20 }; }, rewardLabel: '毛利の後詰の横腹を突いた' }),
    rest({ dur: 6, say: [['足軽', '……毛利の旗が、川下へ引いていく'], ['羽柴秀吉', 'これで城は、ひとりきりじゃ']] }),
  ];
}

// 両軍の総勢（羽柴勢 二万余り、鳥取城の兵 千五百ほどと城に逃げ込んだ人々。数には諸説ある）
tottori.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(20000 - (F.ak || 0) * 20), a0: 20000, b: Math.max(0, 1500 - (F.ek || 0) * 10), b0: 1500 };
};
tottori.sides = { a: { name: '羽柴軍（織田方）', mon: 'oda' }, b: { name: '吉川軍（毛利方）', mon: 'mori' } };
tottori.date = (rt) => `天正九年十月　秋・${rt.flags.step >= 3 ? '夜明け' : '夜'}`;
tottori.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tottori.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tottori.history = '天正九年（1581）、中国攻めを進める羽柴秀吉は、因幡の鳥取城を囲んだ。秀吉は前もって因幡の米を高値で買い集め、城のまわりに付城と柵を築いて兵糧の道を断った（鳥取の渇え殺し）。毛利方は船で兵糧を運び込もうとしたが、秀吉方に阻まれた。城を守る吉川経家は四か月ほど耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命を助けることと引き換えに自害して城を開いた。城から出た者の多くが、与えられた食べ物を急に食べて命を落としたとも伝わる。兵の数や人数には諸説ある。';

// 素直な遊び手：舟の番と戦い、舟に火をかけ、打って出た城兵を止め、使いのそばを歩く
tottori.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest && F.step < 3) { inp.guardHold = false; goTo(p, inp, -20, 24, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && o.pos.z > FENCE_Z - 30);
  if (e && F.step < 3) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    const gq = [F.guard, F.guard2].find((x) => x && !gone(x)); if (gq) { const c = gq.center(); goTo(p, inp, c.x, c.z, 2); return; }
    const it = b.interacts.find((q) => q.id.startsWith('b'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { const q = (F.sallies || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, FENCE_Z + 2), 2); return; } goTo(p, inp, 8, FENCE_Z + 6, 2); return; }
  if (F.step === 3 && F.env) { const c = F.env.center(); goTo(p, inp, c.x + 2, c.z + 3, 2.5); }
};

export { tottori };
