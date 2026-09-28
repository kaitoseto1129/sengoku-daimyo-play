// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。①夜、内応で開いた砦の木戸から攻め入る ②城下を抜けて、本丸の脇の牢の前へ
// ③牢から黒田官兵衛を救い出す ④足の不自由な官兵衛の一行を、織田の陣まで供する
// 向き：北（-z）が城の奥（本丸）。南（+z）に織田の陣。東西に惣構えの土塁
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, dress, gone, burnHouse, more } from './b_inabayama.js';

const WALL_Z = 20;                         // 砦の土塁と柵（東西に）
const GATE = { x: 0, z: WALL_Z };          // 内応で開く木戸
const ROU = { x: -30, z: -96 };            // 牢（本丸の脇）
const CAMP = { x: 4, z: 96 };              // 織田の陣
const ODA = { flag: 'oda' };
const ARAKI = { flag: 'maru' };            // 荒木の紋（無いので丸で代える）

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 惣構えの土塁（砦の柵の下）
  h += 2.2 * Math.exp(-((z - WALL_Z) ** 2) / 10) * (Math.abs(x) > 5 ? 1 : 0.2);
  // 本丸の台地（北）
  h += 5 / (1 + Math.exp((z + 80) / 4));
  // 六甲の山並み（遠く）
  h += 40 * gauss(x, z, -200, -240, 16000);
  return h;
}

const arioka = {
  spawn: { x: 6, z: 70, heading: Math.PI },
  world: {
    seed: 15791,
    time: 'dusk',
    muddy: 0.35,
    paths: [[[0, 150], [0, WALL_Z], [0, -30], [-20, -70], [ROU.x, ROU.z + 6]]],
    height,
    clear: (x, z) => Math.abs(x) < 90 && z > -130 && z < 130,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) < 100 && Math.abs(z) < 140 ? 0.05 : 0.6),
    groves: [{ x: 50, z: -20, r: 10, n: 10 }, { x: -60, z: 40, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && (z < -125 || Math.abs(x) > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 惣構えの柵（真ん中に木戸。内応で開く） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-90, WALL_Z], [-3.5, WALL_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[3.5, WALL_Z], [90, WALL_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    F.gate = rt.army.addStruct({ seg: [-3.5, WALL_Z, 3.5, WALL_Z], nx: 0, nz: 1, hp: 1e9, maxHp: 1e9, team: 1, name: '砦の木戸' });
    F.gate.noTarget = true;
    const dm = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 0.95 }));
    dm.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.45, GATE.z); dm.castShadow = true;
    F.door = dm;
    rt.scene.add(dm, kabukimon(W, GATE.x, GATE.z, 7.4, 0), yagura(W, -12, WALL_Z - 4), yagura(W, 14, WALL_Z - 4));
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    F.houses = [[-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2]].map(([x, z, r], i) => {
      const m = hut(W, x, z, 7, 5, r, { wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      rt.scene.add(m);
      return { x, z, m };
    });
    rt.scene.add(hut(W, 10, -110, 16, 10, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }), yagura(W, 24, -96));
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { h: 1.8, wall: 0x3a3228 });
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [0, -100], [18, -100]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // ---- 滝川一益の手（自分の持ち場）、黒田の者 ----
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: 0, z: 62 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { name: '黒田の家臣', anchor: { x: -16, z: 66 }, facing: Math.PI, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '栗山善助', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { flag: 'kuroda' }));
    F.kuriU = F.kuri.units[0];
    F.oda = [F.taki, F.kuri];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 72 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    for (const [x, z, k] of [[-8, CAMP.z, 'oda'], [8, CAMP.z, 'eiraku'], [-30, 80, 'kuroda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-60, 70, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15792);
    DA(60, 72, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15793);
    for (const [x, z] of [[-30, 60], [30, 64], [0, 86]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    applyLook(rt, NIGHT);
    rt.setPhase('brief');
    rt.obj('main', '滝川一益のもとで、合図を待て', 'main');
    rt.say('滝川一益', `${nm(rt)}、城の中に、こちらへつくと申す者がおる。今夜、砦の木戸を内から開けさせる`, 5);
    rt.say('栗山善助', '……城の牢に、わが主（黒田官兵衛）が囚われておりまする。どうか、お力をお貸しくだされ', 4.5);
    rt.marker('taki', unitPos(F.takiU), '滝川一益', {});
    rt.after(15, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.position.x -= 3.2; F.door.rotation.y = 1.2;
    sfx('wood', 0.9); rt.after(1, () => sfx('horagai', 1));
    rt.banner('木戸が開いた', '内応の者が、砦の木戸を内から開けた');
    rt.obj('main', '開いた木戸から攻め入り、砦の兵を退けよ', 'main');
    rt.say('滝川一益', 'かかれ！　声を上げよ、城じゅうに内応が出たと思わせよ！', 3.5);
    F.taki.order = 'attack'; F.taki.seekRange = 60;
    F.kuri.order = 'move'; F.kuri.dest = { x: -6, z: WALL_Z - 10 }; F.kuri.onArrive = (g) => { g.order = 'hold'; };
    F.g1 = enemyGroup(rt, { faction: 'saito', name: '砦の荒木勢', anchor: { x: 6, z: WALL_Z - 16 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 14, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'gun', n: 2 }], ARAKI));
    for (const u of F.g1.units) if (u.type === 'gun') u.dmg *= 0.45;
    rt.marker('g1', centerOf(F.g1), () => `砦の荒木勢・${moraleWord(F.g1.morale)}`, { red: true, group: F.g1 });
    // 城下に火の手（味方が火を放つ）
    F.houses.forEach((h, i) => rt.after(20 + i * 12, () => { if (!F.ending) burnHouse(rt, h); }));
  },

  // ② 城下を抜けて牢へ
  toRou(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('town');
    rt.unmark('g1');
    if (!gone(F.g1)) F.g1.morale = Math.min(F.g1.morale, 15);
    rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
    rt.obj('main', '栗山善助とともに、本丸の脇の牢へ急げ', 'main');
    rt.say('栗山善助', '牢は本丸の西の脇じゃ。……殿（官兵衛）、今参りまする！', 3.5);
    rt.marker('rou', ROU, '牢', { h: 3 });
    F.kuri.order = 'path'; F.kuri.path = [[-10, -20], [-20, -60], [ROU.x + 4, ROU.z + 10]]; F.kuri.pathIdx = 0; F.kuri.speed = 2.8;
    F.kuri.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: ROU.x + 4, z: ROU.z + 10 }; };
    F.taki.order = 'move'; F.taki.dest = { x: -8, z: -60 }; F.taki.onArrive = (g) => { g.order = 'hold'; g.aggro = 14; };
    F.g2 = enemyGroup(rt, { faction: 'saito', name: '本丸から出た荒木勢', anchor: { x: -8, z: -84 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 95, fleeDir: { x: 0.4, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 + more(rt) }], ARAKI));
    rt.marker('g2', centerOf(F.g2), () => `本丸から出た荒木勢・${moraleWord(F.g2.morale)}`, { red: true, group: F.g2 });
  },

  // ③ 牢を開ける
  rouOpen(rt) {
    const F = rt.flags;
    if (F.rouOpened) return;
    F.rouOpened = true;
    rt.uninteract('rou'); rt.unmark('rou');
    sfx('wood', 1);
    rt.award((t) => t.side.push('牢を開けた'), '牢を開けた');
    rt.say('栗山善助', '殿……！　よくぞご無事で', 3);
    rt.say('黒田官兵衛', '……善助か。足が、言うことをきかぬ。すまぬが、肩を貸してくれ', 4);
    this.escape(rt);
  },

  // ④ 官兵衛を陣まで
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('escape');
    rt.banner('黒田官兵衛を救い出した', '肩を貸して、織田の陣まで');
    rt.obj('main', '官兵衛の一行を守り、織田の陣まで供せよ', 'main');
    // 官兵衛（肩を借りて歩く。戦わない）と、支える者
    const g = allyGroup(rt, { name: '官兵衛の一行', anchor: { x: ROU.x + 2, z: ROU.z + 6 }, facing: 0, width: 3, aggro: 0, noRout: true, formation: 'column', speed: 1.8 },
      [{ type: 'samurai', n: 1, o: { name: '黒田官兵衛', flag: null, hat: 'none', armor: 0x4a4238, weapon: 'none' } }, { type: 'porter', n: 2, o: { flag: null, hat: 'jingasa' } }]);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    g.order = 'path'; g.path = [[-20, -60], [-10, -20], [0, WALL_Z - 4], [0, WALL_Z + 10], [CAMP.x, CAMP.z - 14]]; g.pathIdx = 0;
    g.onArrive = () => this.win(rt);
    F.esc = g;
    F.kuri.order = 'path'; F.kuri.path = g.path.slice(); F.kuri.pathIdx = 0; F.kuri.speed = 1.8; F.kuri.onArrive = (q) => { q.order = 'hold'; };
    rt.marker('esc', centerOf(g), '官兵衛の一行', {});
    rt.zone('camp', CAMP.x, CAMP.z - 14, 6);
    // 追手
    rt.after(18, () => {
      if (F.ending) return;
      F.g3 = enemyGroup(rt, { faction: 'saito', name: '追ってくる荒木勢', anchor: { x: 30, z: -70 }, facing: -Math.PI * 0.8, order: 'attack', seekRange: 90, aggro: 16, width: 10, morale: 90, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], ARAKI));
      rt.army.play('eshout', { x: 30, z: -70 }, 1.6);
      rt.say('足軽', '追手じゃ！　一行を守れ！', 2.5);
      rt.marker('g3', centerOf(F.g3), () => `追ってくる荒木勢・${moraleWord(F.g3.morale)}`, { red: true, group: F.g3 });
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['esc', 'g2', 'g3']) rt.unmark(id);
    rt.unzone('camp');
    for (const q of [F.g2, F.g3]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '黒田官兵衛を牢から救い出した', pts: 20 }; }, '任務達成・官兵衛を救い出した');
    sfx('horagai', 0.6);
    rt.banner('有岡城、落ちる', '官兵衛は一年ぶりに牢を出た');
    rt.say('栗山善助', `${nm(rt)}殿、この恩は、黒田の家は忘れませぬ`, 4);
    rt.after(5, () => rt.say('', '――村重の妻子や家臣の家族の多くは、のちに信長の命で殺された。惨い話として今に伝わる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `荒木勢 ${F.g1.count}人`);
      if (F.g1.count < 5 && !gone(F.g1)) F.g1.morale = Math.min(F.g1.morale, 20);
      if (gone(F.g1) || rt.t - F.stepT > 120) this.toRou(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - ROU.x, p.z - ROU.z);
      rt.objProgress('main', F.g2 && !gone(F.g2) ? `荒木勢 ${F.g2.count}人・牢まで ${Math.round(d)}m` : `牢まで ${Math.round(d)}m`);
      if (F.g2 && F.g2.count < 5 && !gone(F.g2)) F.g2.morale = Math.min(F.g2.morale, 20);
      if (!F.rouOn && gone(F.g2)) {
        F.rouOn = true;
        rt.obj('main', '牢の錠を打ち壊して、官兵衛を救い出せ', 'main');
        rt.addInteract('rou', { x: ROU.x + 2, z: ROU.z + 3 }, '牢の錠を打ち壊す', () => this.rouOpen(rt), { r: 3.4, hold: 2.4 });
      }
      if (rt.t - F.stepT > 160) this.rouOpen(rt);
    }
    if (F.step === 3 && F.esc) {
      const c = F.esc.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 18 && F.esc.order === 'path') { F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z }; rt.bark('一行が待っている。そばを離れるな'); }
      else if (d < 10 && F.esc.order === 'hold') F.esc.order = 'path';
      if (F.g3 && F.g3.count < 5 && !gone(F.g3)) F.g3.morale = Math.min(F.g3.morale, 20);
      rt.objProgress('main', `陣まで ${Math.round(Math.hypot(c.x - CAMP.x, c.z - CAMP.z + 14))}m`);
      if (rt.t - F.stepT > 220) this.win(rt);
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

// 両軍の総勢（有岡城を囲む織田勢 五万ほど、城に残った荒木勢 数千。数には諸説ある）
arioka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 30), a0: 50000, b: Math.max(0, 5000 - (F.ek || 0) * 40), b0: 5000 };
};
arioka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '荒木軍', mon: 'maru' } };
arioka.date = () => '天正七年十月十五日　秋・夜';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った羽柴秀吉の家臣・黒田官兵衛（孝高）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重はわずかな供と城を抜けて尼崎城へ移った。十月、城の中から織田方に内応する者が出て、滝川一益らが城の中へ攻め入り、城は落ちた。官兵衛は救い出されたが、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木の紋は無いので、ここでは丸の旗で代えている。日付や人数には諸説ある。';

// 素直な遊び手：木戸から入り、砦の兵と戦い、牢へ行って錠を壊し、一行のそばを歩く
arioka.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest && F.step < 3) { inp.guardHold = false; const c = F.taki.center(); goTo(p, inp, c.x, c.z + 4, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step >= 1 ? true : o.pos.z > WALL_Z));
  if (e && (F.step !== 3 || Math.hypot(e.pos.x - F.esc.center().x, e.pos.z - F.esc.center().z) < 16)) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { if (u.pos.z > WALL_Z + 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, WALL_Z + 4, 1); return; } const c = gone(F.g1) ? { x: 0, z: 0 } : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 2) {
    if (u.pos.z > WALL_Z - 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, WALL_Z + 4, 1); return; }
    if (u.pos.z > WALL_Z - 1) { goTo(p, inp, 0, WALL_Z - 5, 1); return; }
    if (F.g2 && !gone(F.g2)) { const c = F.g2.center(); goTo(p, inp, c.x, c.z, 2); return; }
    const it = b.interacts.find((q) => q.id === 'rou');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); return; }
    goTo(p, inp, ROU.x + 3, ROU.z + 6, 2);
    return;
  }
  if (F.step === 3 && F.esc) { const c = F.esc.center(); goTo(p, inp, c.x + 2, c.z - 2, 3); }
};

export { arioka };
