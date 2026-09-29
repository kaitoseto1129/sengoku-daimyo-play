// ======================================================================
// 織田家編　岩村城の戦い・水晶山の夜討ち（天正三年十一月十日）
// 長篠の戦いの後、織田信忠は東美濃の岩村城（武田の秋山虎繁が守る）を囲んだ。
// 十一月十日の夜、城から武田勢が打って出て、織田方の水晶山の陣を襲ったが、河尻秀隆・毛利長秀らがこれを退け、
// 多くの武田の者が討たれた。後詰の来ない城はまもなく開かれた。
// 足軽は河尻秀隆の手（信忠の軍）。①夕暮れ、水晶山の陣の柵の守りにつく ②夜、城から打って出た武田勢の夜討ちを柵で受け止める
// ③退く武田勢を、城の麓まで追う
// 向き：北（-z）の山の上に岩村城。南（+z）の水晶山に信忠の陣
// ======================================================================
import { nobori, hut, yagura, campfire, jinmaku, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, move } from './b_depth.js';

const FENCE_Z = -6;                         // 陣の柵
const CASTLE = { x: 0, z: -170 };           // 岩村城（遠く、山の上）
const FOOT = { x: 0, z: -90 };              // 城の麓（追う先）
const POSTS = [{ x: -16, z: FENCE_Z + 5 }, { x: 18, z: FENCE_Z + 5 }];   // 柵の持ち場（篝火を焚く所）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 水晶山（南の陣）と、岩村城の山（北）
  h += 10 * gauss(x, z, 0, 50, 3000) + 56 * gauss(x, z, CASTLE.x, CASTLE.z - 20, 7000);
  return h;
}

const iwamura = {
  spawn: { x: 6, z: 14, heading: Math.PI },
  world: {
    seed: 15755,
    time: 'dusk',
    autumn: true,
    muddy: 0.3,
    paths: [[[0, 120], [0, FENCE_Z], [0, FOOT.z], [CASTLE.x, CASTLE.z + 30]]],
    height,
    clear: (x, z) => Math.abs(x) < 80 && z > -110 && z < 80,
    trees: 520,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 80 && z > -110 && z < 80 ? 0.12 : 1),
    groves: [{ x: -50, z: -40, r: 12, n: 16 }, { x: 50, z: -60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0;
    // ---- 水晶山の陣：柵（口が二つ）、陣幕、小屋 ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fence = [
      ...wallLine(rt, [[-60, FENCE_Z + 4], [-8, FENCE_Z]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
      ...wallLine(rt, [[8, FENCE_Z], [60, FENCE_Z + 4]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
    ];
    rt.scene.add(jinmaku(W, 0, 44, 20, 12, 5, { mon: 'oda' }), tawara(W, -18, 30, 0.3, 6), hut(W, 22, 28, 7, 5, -0.2));
    rt.scene.add(yagura(W, -30, FENCE_Z + 8), yagura(W, 30, FENCE_Z + 8));
    for (const [x, z, k] of [[-8, 36, 'oda'], [8, 36, 'eiraku'], [-40, FENCE_Z + 8, 'oda'], [40, FENCE_Z + 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 岩村城（遠く、山の上） ----
    for (const [x, z, w, d] of [[CASTLE.x, CASTLE.z, 14, 9], [CASTLE.x - 18, CASTLE.z + 12, 9, 6], [CASTLE.x + 16, CASTLE.z + 10, 9, 6]]) rt.scene.add(hut(W, x, z, w, d, 0.1, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[CASTLE.x - 8, CASTLE.z + 20], [CASTLE.x + 8, CASTLE.z + 20]]) rt.scene.add(nobori(W, x, z, 'takeda', 7));
    // ---- 河尻秀隆の手（自分の持ち場）、毛利長秀の手 ----
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -14, z: FENCE_Z + 8 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '河尻秀隆', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.kawaU = F.kawa.units[0];
    F.mouri = allyGroup(rt, { name: '毛利長秀の手', anchor: { x: 20, z: FENCE_Z + 8 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '毛利長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.kawa, F.mouri];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 4, z: FENCE_Z + 14 }, Math.PI, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-60, 50, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15751);
    DA(60, 50, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15752);
    F.castleDA = DA(CASTLE.x, CASTLE.z + 34, 40, 10, 200, 0, 0x3a2622, 'takeda', 15753);
    for (const [x, z] of [[-10, 40], [14, 42]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', '河尻秀隆のもとで、陣の柵の守りにつけ', 'main');
    rt.say('河尻秀隆', `${nm(rt)}、城の秋山は、武田の後詰を待っておる。……じゃが勝頼は長篠で多くを失うた。後詰は間に合うまい`, 5);
    rt.say('河尻秀隆', '追いつめられた者は夜に来る。柵の持ち場に篝火を焚いておけ。闇にまぎれさせるな', 4.5);
    rt.marker('kawa', unitPos(F.kawaU), '河尻秀隆', {});
    rt.after(14, () => this.prepare(rt));
  },

  // ① 篝火を焚く
  prepare(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('prepare');
    rt.unmark('kawa');
    rt.obj('main', `柵の持ち場に篝火を焚け（${POSTS.length}か所）`, 'main');
    POSTS.forEach((q, i) => {
      rt.marker('p' + i, q, '篝火', { h: 2 });
      rt.addInteract('p' + i, q, '篝火を焚く', () => this.light(rt, i), { r: 3, hold: 1.4 });
    });
  },
  light(rt, i) {
    const F = rt.flags;
    const q = POSTS[i];
    rt.uninteract('p' + i); rt.unmark('p' + i);
    rt.scene.add(campfire(rt.world, q.x, q.z)); rt.world.addFire(q.x, q.z);
    F.lit++;
    rt.award((t) => t.side.push('篝火を焚いた'), '篝火を焚いた');
    if (F.lit >= POSTS.length) { rt.objDone('main'); rt.after(8, () => this.raid(rt)); }
    else rt.objProgress('main', `${F.lit}／${POSTS.length}`);
  },

  // ② 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('raid');
    for (let i = 0; i < POSTS.length; i++) { rt.uninteract('p' + i); rt.unmark('p' + i); }
    applyLook(rt, NIGHT);
    sfx('horagai', 0.8);
    rt.banner('夜討ち', '城から武田勢が打って出た。水晶山の陣へ押し寄せる');
    rt.obj('main', '柵で武田勢の夜討ちを受け止めよ', 'main');
    rt.say('足軽', '篝火の向こうに人影……武田じゃ！', 3);
    rt.say('河尻秀隆', '来たか！　柵を背に、槍を揃えよ。一人も柵を越えさせるな！', 3.5);
    for (const [g, x] of [[F.kawa, -14], [F.mouri, 18]]) { g.order = 'hold'; g.anchor = { x, z: FENCE_Z + 4 }; g.aggro = 14; }
    F.waves = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'takeda', name, anchor: { x, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, dress(list, TAKEDA));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.waves.push(g);
      rt.marker('w' + F.waves.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: -60 }, 1.6);
      for (let k = 0; k < 3; k++) rt.world.addFire(x - 6 + k * 6, -64, { torch: true, h: 1.5 });
    };
    rt.after(6, () => mk(-10, '打って出た武田勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }, { type: 'gun', n: 2 }]));
    rt.after(42, () => { if (F.step === 2) mk(24, '武田の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.4) }]); });
    rt.after(80, () => { if (F.step === 2) { mk(-30, '武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 6 }, { type: 'ashigaru', n: 8 }]); rt.say('足軽', '騎馬も来るぞ！', 2); } });
  },

  // ③ 城の麓まで追う
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('chase');
    for (let i = 1; i <= 3; i++) rt.unmark('w' + i);
    rt.award((t) => t.side.push('夜討ちを受け止めた'), '夜討ちを受け止めた');
    sfx('taiko', 1);
    rt.banner('追い討ち', '崩れた武田勢を、城の麓まで追う');
    rt.say('河尻秀隆', '追え！　城の麓までじゃ。城の上から撃たれる所までは入るな', 3.5);
    rt.obj('main', '退く武田勢を、城の麓まで追え', 'main');
    rt.marker('foot', FOOT, '城の麓', { h: 2 });
    rt.zone('foot', FOOT.x, FOOT.z, 8);
    for (const g of F.oda) { g.order = 'move'; g.dest = { x: g === F.kawa ? -8 : 8, z: FOOT.z + 10 }; g.speed = 2.8; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.rear = enemyGroup(rt, { faction: 'takeda', name: '武田の殿', anchor: { x: 0, z: -60 }, facing: 0, order: 'attack', seekRange: 40, aggro: 14, width: 10, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], TAKEDA));
    rt.marker('rear', centerOf(F.rear), () => `武田の殿・${moraleWord(F.rear.morale)}`, { red: true, group: F.rear });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('rear');
    if (F.rear && !gone(F.rear)) F.rear.morale = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水晶山の夜討ちを退け、城の麓まで追った', pts: 20 }; }, '任務達成・夜討ちを退けた');
    sfx('horagai', 0.6);
    applyLook(rt, DAWN);
    rt.banner('夜が明ける', '岩村城の上の旗が、一本、また一本と下ろされていく');
    rt.say('河尻秀隆', `……城は、もう持つまい。${nm(rt)}、よう支えた`, 4.5);
    rt.after(5, () => rt.say('', '――後詰の来ない岩村城は開かれた。城将の秋山虎繁と、城主だった信長の叔母おつやの方は、岐阜で処刑されたと伝わる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    depthTick(rt, dt);
    if (F.dpOn) return;
    if (F.step === 1 && rt.t - F.stepT > 90) { for (let i = 0; i < POSTS.length; i++) if (rt.interacts.some((q) => q.id === 'p' + i)) this.light(rt, i); }
    if (F.step === 2) {
      const L = F.waves || [];
      rt.objProgress('main', `武田勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 190) {
        for (let i = 1; i <= 3; i++) rt.unmark('w' + i);
        for (const q of L) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
        this.deep(rt, 'A', () => this.chase(rt));
      }
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - FOOT.x, p.z - FOOT.z);
      rt.objProgress('main', gone(F.rear) ? `麓まで ${Math.round(d)}m` : `武田の殿 ${F.rear.count}人`);
      if (F.rear.count < 4 && !gone(F.rear)) F.rear.morale = Math.min(F.rear.morale, 20);
      if ((d < 8 && gone(F.rear)) || rt.t - F.stepT > 120) {
        rt.unmark('foot'); rt.unzone('foot'); rt.unmark('rear');
        if (F.rear && !gone(F.rear)) F.rear.morale = 0;
        this.deep(rt, 'B', () => this.win(rt));
      }
    }
  },

  // 段を重ねる（b_depth.js）：A 夜討ちの本波（初めの寄せの後）→ B 城の麓（追い討ちの後）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, iwCtx(rt), which === 'A' ? iwA() : iwB(), () => { F.dpOn = false; then(); });
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が城へ逃げていく！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) rt.bark('陣の柵が破られた！', true);
  },
};

// 両軍の総勢（織田信忠の軍 三万ほど、岩村城の武田勢 三千ほど。数には諸説ある）
iwamura.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 20), a0: 30000, b: Math.max(0, 3000 - (F.ek || 0) * 30), b0: 3000 };
};
iwamura.sides = { a: { name: '織田軍（信忠）', mon: 'oda' }, b: { name: '武田軍（岩村城）', mon: 'takeda' } };
iwamura.date = (rt) => `天正三年十一月十日　冬・${rt.flags.step >= 2 ? '夜' : '夕暮れ'}`;
iwamura.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
iwamura.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
iwamura.history = '東美濃の岩村城は、城主の遠山景任が亡くなった後、その妻で信長の叔母にあたるおつやの方が治めていたが、元亀三年（1572）、武田の秋山虎繁（信友）に攻められ、おつやの方は虎繁の妻となって城は武田のものとなった。天正三年（1575）、長篠の戦いの後、織田信忠は岩村城を囲んだ。十一月十日の夜、城から武田勢が打って出て水晶山の織田の陣を襲ったが、河尻秀隆・毛利長秀らがこれを退け、多くの武田の者を討ったと『信長公記』は伝える。後詰の来ない城はまもなく開かれ、秋山虎繁とおつやの方は岐阜へ送られて処刑された。兵の数には諸説ある。';

// 素直な遊び手：篝火を焚き、柵の前で夜討ちを受け、城の麓まで追う
iwamura.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 26, 2); return; }
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
    const it = b.interacts.find((q) => q.id.startsWith('p'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  // 柵の外へ出るときは、真ん中の口を通る
  const via = (x, z) => { if (u.pos.z > FENCE_Z - 1 && z < FENCE_Z - 1 && Math.abs(u.pos.x) > 5) { goTo(p, inp, 0, FENCE_Z + 3, 1); return; } goTo(p, inp, x, z, 2); };
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const c = q.center(); if (c.z > -40) { via(c.x, c.z); return; } } goTo(p, inp, 0, FENCE_Z + 4, 2); return; }
  if (F.step === 3) { if (!gone(F.rear)) { const c = F.rear.center(); via(c.x, c.z); return; } via(FOOT.x, FOOT.z); }
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 追いつめられた城兵の夜討ち：柵の前だけでなく、柵の両端を回り、陣の裏からも松明が湧く。城の鉄砲組が並んで撃ちかける
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 80, kind: 'gun', ...o });
function iwCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: KIT.ARMOR.takeda, dmg: 0.64, mass: 260, look: (l) => dress(l, TAKEDA),
    friends: () => [F.kawa, F.mouri, F.hosp].filter((g) => g && g.count && !g.routed) };
}
// A 初めの寄せの後：夜討ちの本波（柵の両端と陣の裏から）→ 打って出るか、柵で待つか
function iwA() {
  const at = { x: 0, z: FENCE_Z + 6 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['河尻秀隆', '初めの寄せは退けた。……じゃが、城の者はまだ半ばも出ておらぬ'], ['足軽', '城の坂に、松明が次々と……']] }),
    hold({ at, dur: 120, r: 16, title: '夜討ちの本波', sub: '松明が、柵の前にも両端にも、陣の裏にも', label: '陣の柵', obj: '陣の柵を背に、四方から来る武田の夜討ちを防げ',
      say: [['河尻秀隆', '本波じゃ！　柵を背に、前だけを見るな！']],
      waves: [
        { t: 4, say: ['足軽', '真ん中の口へ押し寄せてくる！'], foes: () => [{ name: '口へ押し寄せる武田勢', from: { x: 0, z: -60 }, list: [uS(3), uA(14)], mass: 360, noRout: 25 }] },
        { t: 26, say: ['河尻秀隆', '城の坂に鉄砲衆が並んだ！　篝火から離れよ、狙われるぞ！'], foes: () => [gunLine('城の鉄砲衆', { x: 20, z: -50 }, 8)] },
        { t: 50, say: ['足軽', '柵の西の端を回り込んだ！'], foes: () => [{ name: '西の端を回る武田勢', from: { x: -80, z: -10 }, off: { x: -14, z: 10 }, list: [uS(2), uA(11)], mass: 260 }] },
        { t: 74, say: ['毛利長秀', '東の端もじゃ！　囲まれるぞ！'], foes: () => [{ name: '東の端を回る武田の騎馬', from: { x: 80, z: -6 }, off: { x: 14, z: 10 }, list: [uS(1), uC(5), uA(5)], mass: 140, kind: 'cavalry' }] },
        { t: 96, say: ['足軽', '陣の裏じゃ！　陣幕の方から松明が！'], foes: () => [{ name: '陣の裏へ忍んだ武田勢', from: { x: -20, z: 70 }, off: { x: 0, z: 20 }, list: [uS(2), uA(10)], mass: 200 }] },
      ],
      reward: '夜討ちの本波を防ぎきった', lost: ['河尻秀隆', '柵の内へ入られた……！　押し出せ！'] }),
    rest({ dur: 7, bark: '立て直し：組を寄せ直す', say: [['毛利長秀', '河尻殿、武田の足が止まった。今、打って出れば崩せる'], ['河尻秀隆', '……闇の中へ出るのは危うい。どうする']] }),
    pick({ title: '夜討ちの武田勢の足が止まった。どうする？',
      options: [{ label: '柵の口を開けて打って出る', note: '崩れかけた武田勢を突けば大手柄。闇の中で左右から挟まれるかもしれぬ' }, { label: '柵の内で、夜明けまで受け続ける', note: '柵は固い。武田はもう一度だけ寄せてくる' }],
      on: (rt, m, i) => { m.iwOut = i === 0; rt.say('河尻秀隆', i === 0 ? 'よし、口を開けよ！　松明を持つ者は前へ出すな' : 'よし、柵を固めよ。夜明けまでじゃ', 3); } }),
    fight({ skip: (rt, m) => !m.iwOut, at: { x: 0, z: -34 }, title: '打って出る', sub: '柵の口から、闇の中の武田勢へ', obj: '柵の前の闇の中で、足の止まった武田勢を崩せ',
      foes: () => [{ name: '足の止まった武田勢', from: { x: -6, z: -60 }, list: [uS(3), uA(12)], mass: 300, morale: 70 }],
      later: [{ t: 36, title: '挟まれる', sub: '闇の左右から武田勢', say: ['足軽', '左右の闇から出てきた！'], foes: () => [{ name: '左の闇の武田勢', from: { x: -46, z: -40 }, list: [uS(1), uA(9)], mass: 180 }, { name: '右の闇の武田勢', from: { x: 46, z: -36 }, list: [uS(1), uA(9)], mass: 180 }] }],
      max: 140, reward: (t) => { t.special = { label: '夜の柵から打って出て武田勢を崩した', pts: 20 }; }, rewardLabel: '夜の柵から打って出た' }),
    hold({ skip: (rt, m) => m.iwOut, at, dur: 80, r: 16, title: '最後の寄せ', sub: '武田が、もう一度だけ柵に取り付く', label: '陣の柵', obj: '柵の内で、武田の最後の寄せを受けよ',
      waves: [
        { t: 4, foes: () => [{ name: '最後の武田勢', from: { x: 10, z: -62 }, list: [uS(3), uA(13)], mass: 340 }] },
        { t: 36, say: ['足軽', 'また鉄砲が並んだ！'], foes: () => [gunLine('城の鉄砲衆', { x: -24, z: -52 }, 8)] },
      ],
      reward: '柵で夜討ちを受けきった' }),
  ];
}
// B 城の麓：城の口の鉄砲 → 降る使い → 夜明け
function iwB() {
  const at = { x: FOOT.x, z: FOOT.z + 6 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['河尻秀隆', 'ここまでじゃ。これより上は、城の鉄砲が届く'], ['足軽', '城の口に……まだ兵が集まっておる']] }),
    pick({ title: '城の口に、逃げ込めなかった武田勢が集まっている。どうする？',
      options: [{ label: '城の口まで攻め寄せ、逃げ遅れた者を討つ', note: '首を挙げられる。城の上から鉄砲組が並んで撃ち下ろす' }, { label: '麓に陣を張り、城から出る者を受ける', note: '鉄砲の届かぬ所で待つ。城兵は打って出るほかなくなる' }],
      on: (rt, m, i) => { m.iwGate = i === 0; rt.say('河尻秀隆', i === 0 ? '行け。鉄砲の構えを見たら伏せよ' : '陣を張れ。夜明けまで待つぞ', 3); } }),
    fight({ skip: (rt, m) => !m.iwGate, at: { x: 0, z: FOOT.z - 22 }, title: '城の口', sub: '城の上から鉄砲衆が撃ち下ろす', obj: '城の口の前の武田勢を崩せ（城の鉄砲に気をつけよ）',
      foes: () => [{ name: '城の口の武田勢', from: { x: 0, z: FOOT.z - 50 }, list: [uS(3), uA(12)], mass: 260, noRout: 20 }, gunLine('城の上の鉄砲衆', { x: 16, z: FOOT.z - 56 }, 10, { mass: 0 })],
      later: [{ t: 40, title: '城兵の突き出し', sub: '城の門から新手', say: ['足軽', '城の門が開いた！　新手じゃ！'], foes: () => [{ name: '城の門から出た新手', from: { x: -14, z: FOOT.z - 60 }, list: [uS(2), uA(11)], mass: 200 }] }],
      max: 150, reward: (t) => { t.special = { label: '岩村城の口まで攻め寄せた', pts: 20 }; }, rewardLabel: '岩村城の口まで攻め寄せた' }),
    hold({ skip: (rt, m) => m.iwGate, at, dur: 90, r: 14, title: '麓の陣', sub: '追いつめられた城兵が、麓の陣へ打って出る', label: '城の麓', obj: '城の麓の陣で、打って出る城兵を受けよ',
      waves: [
        { t: 6, say: ['足軽', '城から打って出てきた！'], foes: () => [{ name: '打って出る城兵', from: { x: -4, z: FOOT.z - 56 }, list: [uS(3), uA(12)], mass: 300 }] },
        { t: 40, say: ['足軽', '坂の上に鉄砲衆が構えた！　身を低くせよ！'], foes: () => [gunLine('城の坂の鉄砲衆', { x: 18, z: FOOT.z - 40 }, 8)] },
        { t: 62, say: ['河尻秀隆', '騎馬が横から！'], foes: () => [{ name: '城の騎馬', from: { x: 50, z: FOOT.z - 20 }, list: [uS(1), uC(5), uA(3)], mass: 100, kind: 'cavalry' }] },
      ],
      reward: '麓の陣で城兵を受けきった' }),
    rest({ dur: 7, bark: '立て直し：組の息を整える', say: [['足軽', '城から……白い布を掲げた者が下りてくる'], ['河尻秀隆', '降る使いか。……若殿（信忠）の陣まで、無事に届けねばならぬ']] }),
    pick({ title: '城から降る使いが下りてきた。城の中の者は、降るのを嫌う者が討とうとしている。どうする？',
      options: [{ label: '組を連れて、使いを信忠の陣まで守って届ける', note: '城が早く開く。途中で使いを狙う者に襲われる' }, { label: '使いは毛利長秀の手に任せ、城の口を見張る', note: '城の口から出る者を防ぐ。使いが無事に着くかはわからぬ' }],
      on: (rt, m, i) => { m.iwEnvoy = i === 0; rt.say('河尻秀隆', i === 0 ? '頼んだぞ。使いを死なせるな' : '城の口から目を離すな', 3); } }),
    move({ skip: (rt, m) => !m.iwEnvoy, to: { x: 0, z: 30 }, r: 10, label: '信忠の陣', obj: '降る使いを、水晶山の陣まで守って届けよ',
      say: [['降る使い', '……かたじけのうござる。城の中には、降るのを恥と思う者もおりまして'], ['足軽', '（後ろの闇で、何かが動いた）']],
      ambush: { d: 50, t: 16, title: '使いを狙う者', sub: '降るのを嫌う武田の者が、使いを討ちに来た', say: ['足軽', '後ろから来る！　使いを狙っておる！'], foes: () => [{ name: '使いを狙う武田の者', from: { x: -30, z: -40 }, list: [uS(3), uA(8)], mass: 120 }] },
      onEnd: (rt, m, ok) => { if (ok) rt.award((t) => t.side.push('降る使いを信忠の陣へ届けた'), '降る使いを届けた'); } }),
    hold({ skip: (rt, m) => m.iwEnvoy, at, dur: 60, r: 14, title: '城の口を見張る', sub: '降るのを嫌う者が、最後に打って出る', label: '城の麓', obj: '城の麓で、最後に打って出る者を防げ',
      waves: [{ t: 6, say: ['足軽', '城から、また出てきた！'], foes: () => [{ name: '降るのを嫌う武田の者', from: { x: 6, z: FOOT.z - 56 }, list: [uS(3), uA(9)], mass: 180 }] }],
      reward: '城の口を最後まで見張った' }),
  ];
}

export { iwamura };
