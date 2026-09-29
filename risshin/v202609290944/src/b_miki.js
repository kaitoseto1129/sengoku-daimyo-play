// ======================================================================
// 織田家編　三木城の戦い・平田と大村の合戦（天正七年九月十日）
// 播磨の別所長治は織田に背き、三木城に籠もった。羽柴秀吉は城のまわりに付城を並べ、兵糧の道を断った（三木の干殺し）。
// 天正七年九月、毛利方は兵糧を城へ運び込もうとし、城からも別所勢が打って出て、秀吉方の平田の付城を襲った。
// 付城を守る谷大膳（衛好）は討ち死にしたが、秀吉は大村坂で別所・毛利勢を破り、兵糧は城へ入らなかった。
// 足軽は羽柴秀吉の手。①夜明け、付城の間を抜けようとする兵糧の荷駄を止める（護衛を退け、荷を奪う）
// ②平田の付城が城兵に襲われる。駆けつけて付城の柵を守る ③大村坂で別所・毛利勢を崩す
// ②と③の間・③の後に段（b_depth.js）：付城を三方から囲まれる（守るか打って出るか）→西の谷道の荷駄（焼けば坂の毛利の鉄砲衆が来ない）
// →大村坂（左右で大軍が押し合う）→城の手前まで追うか→飢えた城兵の最後の打って出
// 向き：北（-z）に三木城。南（+z）に秀吉の本陣（平井山）。東西に付城が並ぶ
// ======================================================================
import { nobori, hut, yagura, campfire, tawara, jinmaku } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { more, dress, gone, DAWN, applyLook } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';
import { uS, uA, uG, uB, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';

const MIKI = { x: 10, z: -170 };            // 三木城（遠く）
const HIRATA = { x: -46, z: -40, r: 14 };   // 平田の付城
const OMURA = { x: 50, z: -70 };            // 大村坂
const LANE = [[110, 30], [60, 0], [20, -30], [-10, -70], [MIKI.x, MIKI.z + 40]];   // 荷駄が抜けようとする道
const ODA = { flag: 'oda' };
const BESSHO = { flag: 'maru' };            // 別所の紋（無いので丸で代える）
const MORI = { flag: 'mori' };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 三木城の台地（北）、平井山（南の本陣）、大村坂の丘
  h += 16 * gauss(x, z, MIKI.x, MIKI.z, 5000) + 18 * gauss(x, z, 0, 150, 3000) + 10 * gauss(x, z, OMURA.x + 20, OMURA.z - 20, 1600);
  // 付城の小高い所
  h += 3 * Math.max(0, Math.min(1, (HIRATA.r + 4 - Math.hypot(x - HIRATA.x, z - HIRATA.z)) / 5));
  return h;
}

const miki = {
  spawn: { x: 30, z: 40, heading: Math.PI * 0.8 },
  world: {
    seed: 15799,
    time: 'dusk',
    autumn: true,
    muddy: 0.3,
    paths: [LANE, [[0, 150], [10, 60], [HIRATA.x + 10, HIRATA.z + 12]]],
    height,
    clear: (x, z) => Math.abs(x) < 120 && z > -110 && z < 80,
    paddy(x, z) {
      if (z < -100 || z > 90 || Math.abs(x) > 130) return 0;
      if (Math.hypot(x - HIRATA.x, z - HIRATA.z) < 24) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.5;
    },
    trees: 360,
    tufts: 3600,
    treeDensity: (x, z) => (Math.abs(x) < 130 && z > -120 && z < 90 ? 0.12 : 1),
    groves: [{ x: 80, z: -30, r: 12, n: 16 }, { x: -90, z: 20, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -140 || x > 150),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.taken = 0;
    // ---- 平田の付城（柵の囲い。口は南） ----
    for (const s of ringWall(rt, HIRATA.x, HIRATA.z, HIRATA.r, { gapAt: 0, gapW: 0.5, team: 0, hp: 1e9, name: '柵', segLen: 5 })) { s.noTarget = true; s.wall = true; }
    rt.scene.add(hut(W, HIRATA.x - 3, HIRATA.z - 3, 8, 5, 0.2, { wall: 0x6a5238 }), yagura(W, HIRATA.x + 6, HIRATA.z - 6));
    for (const [x, z] of [[HIRATA.x - 6, HIRATA.z + 8], [HIRATA.x + 6, HIRATA.z + 8]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ほかの付城（見えるだけ）
    for (const [x, z] of [[90, -50], [-100, -80], [40, -110], [-60, 30]]) { rt.scene.add(yagura(W, x, z), hut(W, x + 5, z + 4, 6, 4, 0.2)); rt.scene.add(nobori(W, x - 4, z + 4, 'oda', 6)); }
    // ---- 三木城（遠く） ----
    for (const [x, z, w, d] of [[MIKI.x, MIKI.z, 16, 10], [MIKI.x - 20, MIKI.z + 10, 10, 6], [MIKI.x + 18, MIKI.z + 8, 9, 6]]) rt.scene.add(hut(W, x, z, w, d, 0.1, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[MIKI.x - 8, MIKI.z + 20], [MIKI.x + 8, MIKI.z + 20]]) rt.scene.add(nobori(W, x, z, 'maru', 7));
    // ---- 羽柴秀吉の手（自分の持ち場） ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: 24, z: 48 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true, hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.hideU = F.hide.units[0];
    F.hirata = allyGroup(rt, { name: '平田の付城の守り', anchor: { x: HIRATA.x, z: HIRATA.z }, facing: 0, width: 8, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '谷大膳', hat: 'kabuto_m' } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], ODA));
    F.taniU = F.hirata.units[0];
    F.oda = [F.hide, F.hirata];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.75; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 36, z: 52 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 平井山の本陣と大軍（軽い作り） ----
    // 平井山の本陣（秀吉は前へ出ているので、弟の秀長が留守を預かる）と、三木城の別所長治の陣所
    F.honjin = camp(rt, { x: 0, z: 122, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀長', hat: 'kabuto_m', haori: 0x5a4a2a }, guard: 15, reserve: 200, runTo: { x: 24, z: 56 } });
    F.ehon = camp(rt, { x: MIKI.x + 42, z: MIKI.z - 6, facing: 0, team: 1, faction: 'saito', mon: 'maru', general: { name: '別所長治', hat: 'kabuto_m', haori: 0x3a2e2a }, guard: 15, reserve: 150, runTo: { x: MIKI.x, z: MIKI.z + 30 } });
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-20, 110, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15795);
    F.castleHost = DA(MIKI.x, MIKI.z + 34, 50, 10, 240, 0, 0x33302a, 'maru', 15796);
    for (const [x, z] of [[20, 70], [-10, 76]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', '羽柴秀吉のもとで、下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、三木の城の中は、もう食う物がない。……じゃから毛利は、どうにかして兵糧を入れようとする`, 5);
    rt.say('羽柴秀吉', '東の道を、荷駄が付城の間を抜けようとしておるそうな。一俵も城へ入れるな', 4);
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉', {});
    rt.after(15, () => this.convoy(rt));
  },

  // ① 兵糧の荷駄を止める
  convoy(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('convoy');
    rt.unmark('hide');
    rt.world.setTime('morning');
    sfx('horagai', 0.8);
    rt.banner('兵糧の荷駄', '毛利の兵糧を担いだ者たちが、付城の間を抜けようとしている');
    rt.obj('main', '荷駄の護衛を退け、荷を奪え', 'main');
    F.escort = enemyGroup(rt, { faction: 'saito', name: '荷駄の護衛（毛利勢）', anchor: { x: 70, z: 4 }, facing: -Math.PI * 0.7, order: 'attack', seekRange: 40, aggro: 14, width: 12, morale: 90, fleeDir: { x: 1, z: 0.3 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }, { type: 'gun', n: 2 }], MORI));
    for (const u of F.escort.units) if (u.type === 'gun') u.dmg *= 0.45;
    F.carts = enemyGroup(rt, { faction: 'saito', name: '兵糧を担ぐ者', anchor: { x: 84, z: 16 }, facing: -Math.PI * 0.7, width: 5, aggro: 0, morale: 60, formation: 'column', speed: 1.6, fleeDir: { x: 1, z: 0.4 } },
      [{ type: 'porter', n: 6, o: { flag: null } }]);
    for (const u of F.carts.units) { u.noTarget = true; u.dmg = 0; }
    F.carts.order = 'path'; F.carts.path = LANE.slice(1); F.carts.pathIdx = 0;
    rt.marker('esc', centerOf(F.escort), () => `荷駄の護衛・${moraleWord(F.escort.morale)}`, { red: true, group: F.escort });
    rt.marker('carts', centerOf(F.carts), '兵糧を担ぐ者', {});
    F.hide.order = 'attack'; F.hide.seekRange = 60;
  },
  // 護衛が崩れたら、担ぐ者は荷を捨てて逃げる
  dropLoads(rt) {
    const F = rt.flags;
    if (F.dropped) return;
    F.dropped = true; F.dropT = rt.t;
    rt.unmark('carts'); rt.unmark('esc');
    const c = F.carts.center();
    F.carts.routed = true; F.carts.order = 'flee';
    for (const u of F.carts.units) u.fleeing = true;
    rt.say('足軽', '担いでいた者が、俵を捨てて逃げていく！', 3);
    rt.obj('main', '捨てられた兵糧の俵を奪え（2か所）', 'main');
    F.loads = [{ x: c.x - 3, z: c.z + 2 }, { x: c.x + 4, z: c.z - 3 }];
    F.loads.forEach((q, i) => {
      rt.scene.add(tawara(rt.world, q.x, q.z, 0.3 * i, 4));
      rt.marker('ld' + i, q, '兵糧の俵', { h: 2 });
      rt.addInteract('ld' + i, q, '兵糧の俵を奪う', () => this.take(rt, i), { r: 3, hold: 1.4 });
    });
  },
  take(rt, i) {
    const F = rt.flags;
    rt.uninteract('ld' + i); rt.unmark('ld' + i);
    F.taken++;
    rt.award((t) => { t.special = { label: '兵糧を奪った', pts: 5 * F.taken }; }, '兵糧を奪った');
    if (F.taken >= 2) { rt.objDone('main'); rt.after(4, () => this.hirataAttack(rt)); }
  },

  // ② 平田の付城が襲われる
  hirataAttack(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('hirata');
    for (let i = 0; i < 2; i++) { rt.uninteract('ld' + i); rt.unmark('ld' + i); }
    rt.award((t) => t.side.push('兵糧を城へ入れなかった'), '兵糧を止めた');
    sfx('taiko', 1);
    rt.banner('平田の付城が襲われた', '三木城から別所勢が打って出た');
    rt.obj('main', '平田の付城へ駆けつけ、柵に取り付く別所勢を退けよ', 'main');
    rt.say('羽柴秀吉', '城から打って出おった！　平田の付城には谷大膳がおる。急げ！', 3.5);
    F.hide.order = 'move'; F.hide.dest = { x: HIRATA.x + 18, z: HIRATA.z + 20 }; F.hide.speed = 3; F.hide.onArrive = (g) => { g.order = 'attack'; g.seekRange = 50; };
    F.sallies = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0.3, order: 'attack', seekRange: 60, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.64 }, dress(list, BESSHO));
      g.focus = F.taniU;
      KIT.backOf(rt, g, { flag: 'maru', armor: 0x33302a, kind: 'spear', w: 20, depth: 12, count: 200, seed: 15797 + F.sallies.length });
      F.sallies.push(g);
      rt.marker('s' + F.sallies.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    mk(HIRATA.x - 10, HIRATA.z - 40, '打って出た別所勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt) }]);
    rt.after(4, () => { if (F.step === 2) mk(HIRATA.x + 20, HIRATA.z - 40, '別所の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }, { type: 'bow', n: 3 }]); });
    // 付城の守りの大将（史実：谷大膳は討ち死に）
    rt.after(34, () => {
      if (F.step !== 2) return;
      if (F.taniU.alive) { F.taniU.invuln = false; rt.army.kill(F.taniU, null); }
      rt.say('足軽', '谷大膳様が……討たれた！', 3);
      rt.say('羽柴秀吉', '……大膳！　おのれ、付城を渡すな！', 3);
    });
  },

  // ②の後の段：付城の攻防と、西の谷道の荷駄 → ③へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    for (let i = 1; i <= 2; i++) rt.unmark('s' + i);
    for (const q of F.sallies || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.obj('main', '平田の付城を守り、別所・毛利勢を城へ入れるな', 'main');
    depthStart(rt, mikiCtx(rt), mikiA(), () => this.omura(rt));
  },
  // ③の後の段：城へ逃げ込む別所・毛利勢と、城からの最後の打って出 → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    rt.unmark('o0'); rt.unmark('o1'); rt.unmark('o2');
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    leanAll(F.lines, 'A', 0.4);
    rt.award((t) => t.side.push('大村坂で別所・毛利勢を崩した'), '大村坂を崩した');
    this.win(rt);   // 城の手前・最後の打って出の段は省く（一つの戦を長くしすぎない）
  },

  // ③ 大村坂
  omura(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('omura');
    for (let i = 1; i <= 2; i++) rt.unmark('s' + i);
    for (const q of F.sallies || []) if (!gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('平田の付城を守った'), '付城を守った');
    sfx('horagai', 1);
    rt.banner('大村坂', '別所・毛利勢が坂に集まって、なお城へ入ろうとする');
    rt.obj('main', '大村坂で、別所・毛利勢を崩せ', 'main');
    rt.say('羽柴秀吉', '坂の上に固まったか。……一気に崩す。わしの馬印について来い！', 4);
    F.hide.order = 'attack'; F.hide.seekRange = 90; F.hide.anchor = { x: OMURA.x - 10, z: OMURA.z + 20 };
    // 組が前の段でひどく討たれていれば（半分より少ない）、坂の上の敵も少なめに（組を失った組頭がひとりで囲まれないように）
    const weak = rt.squad.length && rt.squad.filter((q) => q.alive).length < rt.squad.length / 2 ? 6 : 0;
    F.last = [
      enemyGroup(rt, { faction: 'saito', name: '大村坂の別所勢', anchor: { x: OMURA.x, z: OMURA.z }, facing: Math.PI * 0.9, order: 'hold', aggro: 18, width: 16, morale: 95, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.62, formation: 'yari' },
        dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt) - weak }], BESSHO)),
      enemyGroup(rt, { faction: 'saito', name: '大村坂の毛利勢', anchor: { x: OMURA.x + 22, z: OMURA.z - 6 }, facing: Math.PI * 0.9, order: 'hold', aggro: 18, width: 12, morale: 95, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) - weak }, { type: 'gun', n: 4 }], MORI)),
    ];
    for (const u of F.last[1].units) if (u.type === 'gun') u.dmg *= 0.45;
    // 西の谷道の荷駄を焼かなければ、兵糧を担いできた毛利の鉄砲衆も坂に加わる
    const M = F.dpMem || {};
    if (!M.mkBurn) {
      const g = enemyGroup(rt, { faction: 'saito', name: '毛利の鉄砲衆', anchor: { x: OMURA.x - 20, z: OMURA.z - 12 }, facing: Math.PI * 0.9, order: 'hold', aggro: 40, width: 20, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, formation: 'line' }, dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], MORI));
      F.last.push(g);
      rt.say('足軽', '坂の上に、毛利の鉄砲がずらりと……！　荷駄を逃がした者どもじゃ', 3.5);
    }
    // 坂の上の敵の後ろには、それぞれ数百の軍勢
    F.last.forEach((g, i) => KIT.backOf(rt, g, { flag: i === 0 ? 'maru' : 'mori', armor: 0x33302a, kind: g.formation === 'line' ? 'gun' : 'spear', w: 22, depth: 12, count: 240, seed: 15790 + i }));
    // 坂の左右では、羽柴の大軍と別所・毛利の大軍がぶつかる（軽い作り）
    F.lines = lines(rt, [
      { x: -6, z: -80, facing: Math.PI, w: 44, seed: 15781, A: ['oda', 0x2b3140, 520, 'oda'], B: ['maru', 0x33302a, 560, 'saito'], surge: { every: 50, flank: 0.35 } },
      { x: 102, z: -64, facing: Math.PI, w: 32, seed: 15782, A: ['oda', 0x2b3140, 380, 'oda'], B: ['mori', 0x33302a, 420, 'saito'], gunsB: true, surge: { every: 55, flank: 0.3 } },
    ]);
    F.lines.forEach((c, i) => rt.after(2 + i * 1.5, () => c.go()));
    F.last.forEach((g, i) => rt.marker('o' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g }));
    // 坂の上の敵は、羽柴の手が坂に取り付くまで（30秒）固まって待ち、それから打って出る
    rt.after(30, () => { for (const g of F.last) { g.order = 'attack'; g.seekRange = 60; } });
    // 勝ち筋：坂を下りてくる所を、羽柴の鉄砲組がそろって撃ち、崩れた所へ馬印を進める
    F.hgun = allyGroup(rt, { name: '羽柴の鉄砲組', anchor: { x: OMURA.x - 4, z: OMURA.z + 34 }, facing: Math.PI, width: 18, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    rt.after(6, () => rt.say('羽柴秀吉', '坂の上の者は、下りてくる時が一番弱い。鉄砲組、引きつけて一度に放て。崩れたら、わしの馬印に続け', 5));
    volleyAt(rt, { guns: () => [F.hgun], foes: () => F.last, who: '羽柴秀吉', near: 30, drop: 30, max: 55, line: '羽柴の鉄砲組がそろって火を吹いた。坂の別所・毛利勢が崩れかかる' });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('o0'); rt.unmark('o1'); rt.unmark('o2');
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    F.castleHost.retreat(20, 20);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '大村坂で別所・毛利勢を崩した', pts: 20 }; }, '任務達成・兵糧の道を断った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('大村坂の勝ち', '兵糧は、ついに三木城へ入らなかった');
    rt.say('羽柴秀吉', `……これで城の者は、もう冬を越せぬ。${nm(rt)}、降るのを待つのも、戦のうちじゃ`, 5);
    rt.after(6, () => rt.say('', '――翌年正月、別所長治は城兵の命と引き換えに、一族とともに自害した', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      if (!F.dropped) {
        rt.objProgress('main', `護衛 ${F.escort.count}人`);
        if (F.escort.count < 5 && !gone(F.escort)) F.escort.morale = Math.min(F.escort.morale, 20);
        if (gone(F.escort) || rt.t - F.stepT > 120) { if (!gone(F.escort)) F.escort.morale = 0; this.dropLoads(rt); }
      } else rt.objProgress('main', `${F.taken}／2`);
      // 俵を取りに来ない時：場所とやり方を言い、それでも来なければ足軽が運んで先へ進む（待たせきりにしない）
      const w = F.dropped ? rt.t - F.dropT : 0;
      if (F.dropped && F.taken < 2 && w > 35 && !F.nudge) { F.nudge = true; rt.say('足軽頭', `${nm(rt)}、俵はそこじゃ！　印の俵の前で「兵糧の俵を奪う」を長く押せ`, 4); }
      if (F.dropped && F.taken < 2 && (w > 75 || rt.t - F.stepT > 180)) { rt.say('足軽', '残りの俵は、我らが担いで陣へ運びまする', 3); F.taken = 2; this.hirataAttack(rt); }
    }
    if (F.step === 2) {
      const L = F.sallies || [];
      rt.objProgress('main', `別所勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 150) this.midA(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `別所・毛利勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 6 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (L.every(gone) || rt.t - F.stepT > 140) this.midB(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g === rt.flags.carts) return;
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// ---------------- 付城の攻防・西の谷道・城の手前の段 ----------------
const GATE = { x: HIRATA.x, z: HIRATA.z + HIRATA.r + 6 };     // 平田の付城の口（南）の前
const VALLEY = { x: -88, z: -66 };                           // 西の谷道
function mikiCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'maru', armor: 0x33302a, dmg: 0.62, look: (l) => dress(l, BESSHO), friends: () => [F.hide, F.hirata].filter((g) => g && g.count), aid: { name: '羽柴の手の一組', list: [uS(1), uA(8)] }, aidSaid: '羽柴の手から一組が加わった' };
}
function mikiA() {
  const R = round(GATE, Math.PI, 52);
  return [
    rest({ dur: 10, say: [['羽柴秀吉', '大膳の仇じゃ……じゃが、まだ終わらぬ。城の方で太鼓が鳴っておる'], ['足軽', '三木の城から、また旗が出てくる……']] }),
    pick({ title: '別所の新手が、付城を三方から囲みにかかる。どうする？',
      pre: (rt) => rt.say('伝令', '別所の新手、北と東西から付城へ寄せまする！　鉄砲も連れておると！', 3.5),
      options: [{ label: '付城の口を固めて守る', note: '柵を背に守れる。三方から囲まれ、鉄砲を浴びる' }, { label: '付城の外へ打って出て、寄せ手の横を突く', note: '寄せ手を先に崩せば手柄。付城の守りが薄くなる' }],
      on: (rt, m, i) => { m.mkOut = i === 1; rt.say('羽柴秀吉', i === 0 ? 'よし、口を固めよ！　一人も入れるな' : 'よし、打って出よ！　寄せ手の横腹を突け！', 3); } }),
    hold({ skip: (rt, m) => m.mkOut, at: GATE, dur: 84, r: 13, title: '付城の口', sub: '三方から、別所の旗が付城を囲む', label: '付城の口', obj: '付城の口を守り、囲みに来る別所勢を退けよ',
      waves: [
        { t: 5, say: ['足軽', '東から来る！'], foes: () => [{ name: '東から寄せる別所勢', from: R.right, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 30, say: ['足軽', '西からもじゃ……囲まれるぞ！'], foes: () => [{ name: '西から寄せる別所勢', from: R.left, list: [uS(2), uA(12), uB(3)], mass: 200 }] },
        { t: 55, say: ['足軽', '北に鉄砲が並んだ……！　柵の陰へ！'], foes: () => [gunLine('別所の鉄砲衆', { x: HIRATA.x + 24, z: HIRATA.z - 30 }, GATE, 10)] },
      ],
      reward: '付城の口を守りぬいた' }),
    fight({ skip: (rt, m) => !m.mkOut, at: { x: HIRATA.x + 22, z: HIRATA.z - 18 }, max: 120, title: '打って出る', sub: '付城を囲む別所勢の横腹へ', obj: '付城を囲む別所勢の横を突いて崩せ',
      foes: () => [{ name: '付城を囲む別所勢', from: { x: HIRATA.x + 10, z: HIRATA.z - 60 }, list: [uS(3), uA(14)], mass: 260, noRout: 20 }],
      later: [
        { t: 30, title: '鉄砲', sub: '別所の鉄砲衆が並んで構える', say: ['足軽', '鉄砲が揃えて構えた……！　伏せろ！'], foes: () => [gunLine('別所の鉄砲衆', { x: HIRATA.x + 50, z: HIRATA.z - 40 }, { x: HIRATA.x + 22, z: HIRATA.z - 18 }, 9)] },
        { t: 60, title: '付城が危ない', sub: '手薄になった付城へ、西から別所勢', say: ['足軽', '付城の西に別所勢が！　留守が危ない！'], foes: () => [{ name: '留守を突く別所勢', from: { x: HIRATA.x - 50, z: HIRATA.z - 10 }, list: [uS(2), uA(12)], mass: 180 }] },
      ],
      reward: (t) => { t.special = { label: '打って出て、付城を囲む別所勢を崩した', pts: 20 }; }, rewardLabel: '付城を囲む別所勢を崩した' }),
    rest({ dur: 10, say: [['伝令', '毛利の荷駄の残りが、西の谷道から城へ入ろうとしておりまする！'], ['羽柴秀吉', '……しぶとい。大村坂にも敵が集まっておるというに']] }),
    pick({ title: '毛利の荷駄の残りが、西の谷道を抜けようとしている。どうする？',
      options: [{ label: '西の谷道へ走り、荷駄を焼く', note: '荷駄を焼けば、大村坂の毛利の鉄砲衆が加わらない。谷道は狭く、待ち伏せがあるかもしれぬ' }, { label: '秀吉の手に付いて、大村坂へ急ぐ', note: 'すぐ大村坂へ。荷駄を守ってきた毛利の鉄砲衆が坂に加わる' }],
      on: (rt, m, i) => { m.mkBurn = i === 0; rt.say('羽柴秀吉', i === 0 ? 'よし、行け！　一俵も入れるな、焼き捨てよ！' : 'よし、坂へ急ぐぞ。荷駄は付城の者に任せる', 3); } }),
    fight({ skip: (rt, m) => !m.mkBurn, at: VALLEY, max: 110, title: '西の谷道', sub: '荷駄を守る毛利勢が、谷の口で向き直る', obj: '西の谷道で、荷駄を守る毛利勢を崩せ',
      foes: () => [{ name: '荷駄を守る毛利勢', from: { x: -100, z: -104 }, flag: 'mori', list: dress([uS(2), uA(12)], MORI), mass: 200 }, gunLine('谷の上の毛利の鉄砲組', { x: -60, z: -100 }, VALLEY, 8, { flag: 'mori', list: dress([uS(1), uG(8)], MORI) })],
      later: [{ t: 40, title: '待ち伏せ', sub: '谷の両側から、毛利勢が下りてくる', say: ['足軽', '谷の上から……！　挟まれた！'], foes: () => [{ name: '谷の上の毛利勢', from: { x: -114, z: -40 }, flag: 'mori', list: dress([uS(1), uA(10)], MORI), mass: 150 }, { name: '後ろへ回った毛利勢', from: { x: -60, z: -30 }, flag: 'mori', list: dress([uS(1), uA(8)], MORI), mass: 120 }] }],
      reward: (t) => { t.special = { label: '西の谷道で毛利の荷駄を焼いた', pts: 15 }; }, rewardLabel: '毛利の荷駄を焼いた' }),
  ];
}
function mikiB() {
  const NC = { x: 26, z: -96 };             // 城の手前の畦
  const R = round(NC, Math.PI, 50);
  return [
    rest({ dur: 10, say: [['羽柴秀吉', '崩れた！　……じゃが城へ逃げ込む者を追えば、城の鉄砲の下じゃぞ'], ['足軽', '城の塀の上に、火縄の火が並んでおる……']] }),
    pick({ title: '崩れた別所・毛利勢が城へ逃げ込む。どうする？',
      options: [{ label: '城の手前まで追い討つ', note: '逃げる者を討てば大手柄。城から新手と鉄砲が出る' }, { label: '坂の上で踏みとどまり、城からの打って出に備える', note: '坂の上は固い。城の者はまた打って出る' }],
      on: (rt, m, i) => { m.mkChase = i === 0; rt.say('羽柴秀吉', i === 0 ? '追え！　ただし城の堀へは寄るな！' : 'よし、坂の上に槍を揃えよ', 3); } }),
    fight({ skip: (rt, m) => !m.mkChase, at: NC, max: 160, title: '城の手前', sub: '逃げ込む別所勢を追う。城の門が開いた', obj: '城の手前で、逃げ込む別所勢と城からの新手を崩せ',
      foes: () => [{ name: '逃げ込む別所勢', from: R.front, list: [uS(2), uA(12)], mass: 200 }],
      later: [
        { t: 20, title: '城の鉄砲', sub: '城から鉄砲衆が出て、並んで撃つ', say: ['足軽', '城から鉄砲衆が出てきた……並んで構えたぞ！'], foes: () => [gunLine('城から出た鉄砲衆', R.fl, NC, 10)] },
        { t: 55, title: '囲まれる', sub: '城の新手が左右へ回る', say: ['羽柴秀吉', '深入りしすぎじゃ……！　左右から来るぞ、退きながら突け！'], foes: () => [{ name: '左へ回る城の新手', from: R.left, list: [uS(2), uA(10)], mass: 160 }, { name: '右へ回る城の新手', from: R.right, list: [uS(2), uA(10)], mass: 160 }] },
      ],
      reward: (t) => { t.special = { label: '城の手前まで追い討った', pts: 25 }; }, rewardLabel: '城の手前まで追い討った' }),
    hold({ at: OMURA, dur: 90, r: 14, title: '最後の打って出', sub: '飢えた城兵が、死にもの狂いで坂へ打って出る', label: '大村坂の上', obj: '大村坂の上で、城からの最後の打って出を受け止めよ',
      say: [['羽柴秀吉', 'これが最後じゃ。……飢えた者は死にもの狂いで来る。気を抜くな']],
      waves: [
        { t: 5, say: ['足軽', '来た……痩せこけておるのに、目だけが光っておる'], foes: (rt, m) => [{ name: '死にもの狂いの城兵', from: { x: OMURA.x - 10, z: OMURA.z - 50 }, list: [uS(2), uA(m.mkChase ? 10 : 14)], mass: 220, morale: 100 }] },
        { t: 40, say: ['足軽', '鉄砲も並べてきた……！　身を低くせよ！'], foes: () => [gunLine('城兵の鉄砲組', { x: OMURA.x + 30, z: OMURA.z - 44 }, OMURA, 8)] },
      ],
      reward: '城からの最後の打って出を受け止めた' }),
  ];
}

// 両軍の総勢（羽柴勢 二万ほど、別所・毛利勢 八千ほど。数には諸説ある）
miki.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(20000 - (F.ak || 0) * 20), a0: 20000, b: Math.max(0, 8000 - (F.ek || 0) * 30), b0: 8000 };
};
miki.sides = { a: { name: '羽柴軍（織田方）', mon: 'oda' }, b: { name: '別所・毛利軍', mon: 'mori' } };
miki.date = (rt) => `天正七年九月十日　秋・${rt.flags.step >= 1 ? '朝' : '夜明け前'}`;
miki.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
miki.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
miki.history = '天正六年（1578）、播磨の別所長治は織田に背いて三木城に籠もった。羽柴秀吉は城のまわりに付城を並べ、土塁と柵で囲んで兵糧の道を断った（三木の干殺し）。天正七年九月十日、毛利方は兵糧を城へ運び込もうとし、城からも別所勢が打って出て秀吉方の平田の付城を襲い、守っていた谷大膳（衛好）は討ち死にした。しかし秀吉はすぐに駆けつけ、大村坂で別所・毛利勢を破り、兵糧は城へ入らなかった。城の中の飢えはひどくなり、翌天正八年正月、別所長治は城兵の命を助けることと引き換えに、一族とともに自害した。別所の紋は無いので、ここでは丸の旗で代えている。兵の数には諸説ある。';

// 素直な遊び手：護衛と戦い、俵を奪い、平田の付城へ駆けつけ、大村坂で戦う
miki.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.hide.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
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
  if (F.step === 1) {
    if (!F.dropped) { const t = F.escort.center(); goTo(p, inp, t.x, t.z, 2); return; }
    const it = b.interacts.find((q) => q.id.startsWith('ld'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { const q = (F.sallies || []).find((x) => !gone(x)); if (q) { const t = q.center(); goTo(p, inp, t.x, t.z, 2); return; } goTo(p, inp, HIRATA.x + 4, HIRATA.z + 20, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const t = q.center(); goTo(p, inp, t.x, t.z, 2); return; } }
  goTo(p, inp, c.x + 2, c.z + 4, 3);
};

export { miki };
