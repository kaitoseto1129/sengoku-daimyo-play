// ======================================================================
// 織田家編　三木城の戦い・平田と大村の合戦（天正七年九月十日）
// 播磨の別所長治は織田に背き、三木城に籠もった。羽柴秀吉は城のまわりに付城を並べ、兵糧の道を断った（三木の干殺し）。
// 天正七年九月、毛利方は兵糧を城へ運び込もうとし、城からも別所勢が打って出て、秀吉方の平田の付城を襲った。
// 付城を守る谷大膳（衛好）は討ち死にしたが、秀吉は大村坂で別所・毛利勢を破り、兵糧は城へ入らなかった。
// 足軽は羽柴秀吉の手。①夜明け、付城の間を抜けようとする兵糧の荷駄を止める（護衛を退け、荷を奪う）
// ②平田の付城が城兵に襲われる。駆けつけて付城の柵を守る ③大村坂で別所・毛利勢を崩す
// 向き：北（-z）に三木城。南（+z）に秀吉の本陣（平井山）。東西に付城が並ぶ
// ======================================================================
import { nobori, hut, yagura, campfire, tawara, jinmaku } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { more, dress, gone, DAWN, applyLook } from './b_inabayama.js';

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
    rt.scene.add(jinmaku(W, 0, 120, 18, 10, 5, { mon: 'oda' }));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-20, 110, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15795);
    F.castleHost = DA(MIKI.x, MIKI.z + 34, 50, 10, 240, 0, 0x33302a, 'maru', 15796);
    for (const [x, z] of [[20, 70], [-10, 76]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', '羽柴秀吉のもとで、下知を待て', 'main');
    rt.say('', '天正七年九月十日　夜明け前　播磨国 三木城の南', 3.5);
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
    F.dropped = true;
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
      F.sallies.push(g);
      rt.marker('s' + F.sallies.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    mk(HIRATA.x - 10, HIRATA.z - 40, '打って出た別所勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt) }]);
    rt.after(26, () => { if (F.step === 2) mk(HIRATA.x + 20, HIRATA.z - 40, '別所の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }, { type: 'bow', n: 3 }]); });
    // 付城の守りの大将（史実：谷大膳は討ち死に）
    rt.after(34, () => {
      if (F.step !== 2) return;
      if (F.taniU.alive) { F.taniU.invuln = false; rt.army.kill(F.taniU, null); }
      rt.say('足軽', '谷大膳様が……討たれた！', 3);
      rt.say('羽柴秀吉', '……大膳！　おのれ、付城を渡すな！', 3);
    });
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
    F.last = [
      enemyGroup(rt, { faction: 'saito', name: '大村坂の別所勢', anchor: { x: OMURA.x, z: OMURA.z }, facing: Math.PI * 0.9, order: 'hold', aggro: 18, width: 16, morale: 95, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.62, formation: 'yari' },
        dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt) }], BESSHO)),
      enemyGroup(rt, { faction: 'saito', name: '大村坂の毛利勢', anchor: { x: OMURA.x + 22, z: OMURA.z - 6 }, facing: Math.PI * 0.9, order: 'hold', aggro: 18, width: 12, morale: 95, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }, { type: 'gun', n: 4 }], MORI)),
    ];
    for (const u of F.last[1].units) if (u.type === 'gun') u.dmg *= 0.45;
    F.last.forEach((g, i) => rt.marker('o' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g }));
    rt.after(20, () => { for (const g of F.last) { g.order = 'attack'; g.seekRange = 60; } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('o0'); rt.unmark('o1');
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
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
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      if (!F.dropped) {
        rt.objProgress('main', `護衛 ${F.escort.count}人`);
        if (F.escort.count < 5 && !gone(F.escort)) F.escort.morale = Math.min(F.escort.morale, 20);
        if (gone(F.escort) || rt.t - F.stepT > 120) { if (!gone(F.escort)) F.escort.morale = 0; this.dropLoads(rt); }
      } else rt.objProgress('main', `${F.taken}／2`);
      if (F.dropped && rt.t - F.stepT > 180 && F.taken < 2) { F.taken = 2; this.hirataAttack(rt); }
    }
    if (F.step === 2) {
      const L = F.sallies || [];
      rt.objProgress('main', `別所勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 150) this.omura(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `別所・毛利勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 6 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (L.every(gone) || rt.t - F.stepT > 170) this.win(rt);
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
