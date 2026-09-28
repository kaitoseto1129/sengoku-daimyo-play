// ======================================================================
// 織田家編　手取川の戦い（天正五年九月二十三日）
// 能登の七尾城を助けに、柴田勝家を大将とする織田勢が加賀へ入り、手取川を越えた。
// だが七尾城はすでに上杉謙信の手に落ちていた。それを知った織田勢は退き始め、夜、手取川を渡るところを上杉勢に追われた。
// 足軽は柴田勝家の手。①七尾城の落ちた知らせ。川の浅瀬まで退く ②追ってくる上杉の騎馬と先手を、岸で食い止める（殿）
// ③味方が渡り終えたら、増えた川を渡って南の岸へ
// 戦の大きさには諸説あり、ここでは退き口として描く
// 向き：南（+z）の岸が味方の退く先。川は東西に流れる。北（-z）から上杉勢が来る
// ======================================================================
import { nobori, hut, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';

const RIVER = [[-240, 4], [-120, -2], [0, 2], [120, -4], [240, 2]];
const FORD = { x: 0, z: -14 };              // 北の岸の浅瀬の口
const SOUTH = { x: 4, z: 34 };              // 南の岸（退く先）
const ODA = { flag: 'oda' };
const UESUGI = { flag: 'uesugi' };

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 川原は低く、両岸に土手
  h += 1.4 * Math.exp(-((z + 16) ** 2) / 20) + 1.4 * Math.exp(-((z - 22) ** 2) / 20);
  // 北の加賀の山並みと、南の白山のすそ
  h += Math.max(0, -z - 140) * 0.25 + 40 * gauss(x, z, 160, 220, 12000);
  return h;
}

const tedorigawa = {
  spawn: { x: 6, z: -60, heading: 0 },
  world: {
    seed: 15777,
    time: 'storm',
    muddy: 1,
    streams: [{ pts: RIVER, w: 24, depth: 1.3 }],
    paths: [[[0, -200], [2, -60], [FORD.x, FORD.z], [SOUTH.x, SOUTH.z], [6, 160]]],
    height,
    tint(x, z, h, c) { if (z > -14 && z < 20) c.lerp({ r: 0.42, g: 0.42, b: 0.36 }, 0.4); },
    clear: (x, z) => Math.abs(x) < 110 && z > -120 && z < 80,
    trees: 320,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -60, z: -60, r: 12, n: 16 }, { x: 70, z: -40, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -150,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 北の岸の陣（払いかけ） ----
    for (const [x, z, r] of [[-30, -70, 0.2], [34, -74, -0.1]]) rt.scene.add(hut(W, x, z, 6, 4, r, { wall: 0x5a4a38 }));
    rt.scene.add(tawara(W, -14, -64, 0.3, 5), tawara(W, 20, -60, -0.2, 4));
    for (const [x, z] of [[-8, -52], [10, -54], [-40, -58], [44, -60]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 柴田勝家の手（自分の持ち場）、佐久間盛政の手、丹羽の手 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: -66 }, facing: 0, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.others = [
      allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: -30, z: -60 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }], ODA)),
      allyGroup(rt, { name: '前田利家の手', anchor: { x: 32, z: -62 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], ODA)),
    ];
    for (const g of [F.shiba, ...F.others]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: -58 }, 0, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：南の岸へ渡っていく織田の本隊、北から来る上杉の大軍 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.main = [DA(-50, -40, 30, 14, 260, 0, 0x2b3140, 'oda', 15771), DA(50, -44, 30, 14, 240, 0, 0x2b3140, 'oda', 15772)];
    F.host = [DA(0, -190, 60, 16, 340, 0, 0x2a2a2a, 'uesugi', 15773), DA(-70, -180, 30, 14, 220, 0.3, 0x2a2a2a, 'uesugi', 15774)];
    for (const [x, z] of [[-20, -80], [24, -84]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.setPhase('brief');
    rt.obj('main', '柴田勝家のもとで、下知を待て', 'main');
    rt.say('足軽', '……使いの者が。七尾の城は、もう上杉の手に落ちたそうな！', 3.5);
    rt.say('柴田勝家', 'なんと……。助ける城が無ければ、ここにおる理由はない。雨で川が増えぬうちに、南へ渡る', 4.5);
    rt.say('柴田勝家', `${nm(rt)}、わしの手は殿（しんがり）じゃ。皆が渡りきるまで、北の岸を支えよ`, 4.5);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(18, () => this.retreat(rt));
  },

  // ① 浅瀬まで退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('shiba');
    sfx('taiko', 0.6);
    rt.obj('main', '北の岸の浅瀬の口まで退け', 'main');
    rt.marker('ford', FORD, '浅瀬の口', { h: 2 });
    rt.zone('ford', FORD.x, FORD.z - 10, 7);
    F.shiba.order = 'move'; F.shiba.dest = { x: FORD.x, z: FORD.z - 12 }; F.shiba.speed = 2.6; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; g.aggro = 14; };
    // ほかの手は先に渡る
    F.others.forEach((g, i) => { g.order = 'path'; g.path = [[FORD.x + (i ? 10 : -10), FORD.z], [SOUTH.x + (i ? 16 : -16), SOUTH.z + 20], [SOUTH.x + (i ? 20 : -20), 90]]; g.pathIdx = 0; g.speed = 2.4; g.onArrive = (q) => { q.order = 'hold'; }; });
    for (const m of F.main) m.advance(90, 70);
    for (const h of F.host) h.advance(60, 60);
  },

  // ② 殿：追手を食い止める
  rearguard(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('rear');
    rt.unmark('ford'); rt.unzone('ford');
    sfx('horagai', 0.8);
    rt.banner('上杉の追手', '雨の闇の中から、竹に雀の旗が迫る');
    rt.obj('main', '北の岸で、上杉の追手を食い止めよ（味方が渡りきるまで）', 'main');
    rt.say('柴田勝家', '来たぞ！　槍衾を作れ！　ここで崩れれば、川で皆死ぬぞ', 4);
    F.waves = [];
    const mk = (i) => {
      const spec = [
        { name: '上杉の騎馬', x: -10, list: [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }] },
        { name: '上杉の先手', x: 20, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'gun', n: 2 }] },
        { name: '上杉の新手', x: -24, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }, { type: 'cavalry', n: 4 }] },
      ][i];
      const g = enemyGroup(rt, { faction: 'saito', name: spec.name, anchor: { x: spec.x, z: -110 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 }, dress(spec.list, UESUGI));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.waves.push(g);
      rt.army.play(i === 0 ? 'gallop' : 'eshout', { x: spec.x, z: -100 }, 1.6);
      rt.marker('w' + i, centerOf(g), () => `${spec.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    rt.after(4, () => { mk(0); rt.say('足軽', '騎馬じゃ！　槍を下ろせ、馬を止めよ！', 3); });
    rt.after(38, () => { if (F.step === 2) mk(1); });
    rt.after(80, () => { if (F.step === 2) { mk(2); rt.say('足軽', 'まだ来る……！　きりがない', 2.5); } });
  },

  // ③ 川を渡る
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cross');
    for (let i = 0; i < 3; i++) rt.unmark('w' + i);
    for (const q of F.waves || []) if (!gone(q)) q.morale = Math.min(q.morale, 25);
    rt.award((t) => t.side.push('殿を務め、追手を食い止めた'), '殿を務めた');
    rt.banner('皆、渡った', '殿も川へ。水はもう腰の上まで来ている');
    rt.obj('main', '増えた手取川を渡り、南の岸へ', 'main');
    rt.say('柴田勝家', 'よう支えた！　殿、退けっ！　流されるな、隣の者の腕をつかめ！', 4);
    rt.marker('south', SOUTH, '南の岸', { h: 2 });
    rt.zone('south', SOUTH.x, SOUTH.z, 8);
    F.shiba.order = 'path'; F.shiba.path = [[FORD.x, FORD.z], [SOUTH.x, SOUTH.z + 6]]; F.shiba.pathIdx = 0; F.shiba.speed = 2; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    for (const h of F.host) h.advance(40, 30);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('south'); rt.unzone('south');
    for (const q of F.waves || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '手取川の殿を務め、生きて渡った', pts: 20 }; }, '任務達成・手取川を渡った');
    sfx('horagai', 0.5);
    rt.banner('手取川を渡った', '上杉勢は北の岸で止まった');
    rt.say('柴田勝家', `……生きて渡ったか、${nm(rt)}。負け戦じゃ。じゃが、負け戦で生きて帰る者が、次の戦に勝つ`, 5.5);
    rt.after(6, () => rt.say('', '――謙信は翌年三月、春日山城で急死した。上杉の南への動きは、それで止まった', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - FORD.x, p.z - (FORD.z - 10));
      rt.objProgress('main', `浅瀬の口まで ${Math.max(0, Math.round(d))}m`);
      if (d < 7 || rt.t - F.stepT > 60) this.rearguard(rt);
    }
    if (F.step === 2) {
      const L = F.waves || [];
      const left = Math.max(0, 140 - (rt.t - F.stepT));
      rt.objProgress('main', `追手 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人・味方が渡りきるまで ${Math.ceil(left)}秒`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || left <= 0) this.cross(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - SOUTH.x, p.z - SOUTH.z);
      rt.objProgress('main', `南の岸まで ${Math.max(0, Math.round(d))}m`);
      // 渡り出さない時は、柴田が呼ぶ（上杉が迫るので長くは待たない）
      if (d >= 8 && rt.t - F.stepT > 20 && !F.crossCall) { F.crossCall = true; rt.say('柴田勝家', `${nm(rt)}、何を立ち止まる！　印の南の岸へ渡れ。上杉が来るぞ`, 3.5); }
      if (d >= 8 && rt.t - F.stepT > 40 && !F.crossCall2) { F.crossCall2 = true; rt.say('足軽', 'お頭、わしの腕につかまりなされ！　流れは今のうちじゃ', 3); }
      if (d < 8 || rt.t - F.stepT > 70) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// 両軍の総勢（柴田勝家の軍 三万ほど、上杉勢 二万ほど。数と戦の大きさには諸説ある）
tedorigawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 30), b0: 20000 };
};
tedorigawa.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '上杉軍', mon: 'uesugi' } };
tedorigawa.date = () => '天正五年九月二十三日　秋・雨・夜';
tedorigawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '退きの下知まで待つ' : '');
tedorigawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tedorigawa.history = '天正五年（1577）、上杉謙信は能登の七尾城を囲んだ。城を助けるため、信長は柴田勝家を大将に、丹羽長秀・前田利家・羽柴秀吉らを加賀へ向かわせた（秀吉は勝家と争って途中で陣を引き払ったという）。織田勢は手取川を越えたが、七尾城は九月十五日にすでに落ちていた。それを知った織田勢は退き始め、九月二十三日の夜、手取川のあたりで上杉勢に追われ、雨で増えた川に多くの者が流されたと伝わる。ただし、この戦の大きさについては確かな記録が少なく、小さな戦いだったとする説もある。謙信は翌年三月に急死し、上杉の南への動きは止まった。兵の数には諸説ある。';

// 素直な遊び手：浅瀬の口まで退き、岸で追手と戦い、川を渡る
tedorigawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (F.step === 3) { goTo(p, inp, SOUTH.x, SOUTH.z, 2); return; }
  const c = F.shiba.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { goTo(p, inp, FORD.x, FORD.z - 10, 2); return; }
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const t = q.center(); if (t.z > -60) { goTo(p, inp, t.x, t.z, 2); return; } } goTo(p, inp, FORD.x + 2, FORD.z - 16, 2); return; }
  goTo(p, inp, c.x + 2, c.z - 4, 3);
};

export { tedorigawa };
