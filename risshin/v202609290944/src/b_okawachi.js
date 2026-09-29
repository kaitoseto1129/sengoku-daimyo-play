// ======================================================================
// 織田家編　大河内城の戦い（永禄十二年九月八日の夜攻め）
// 伊勢を平らげようとする信長は、北畠具教・具房の籠もる大河内城を大軍で囲んだ。
// 九月八日の夜、丹羽長秀・池田恒興・稲葉良通らが西の搦手から攻めかかったが、雨で鉄砲が使えず、城兵に押し返されて多くの者を失った。
// 信長は囲んで兵糧を断つことにし、十月、次男の茶筅丸（のちの信雄）を北畠の養子とすることで和を結んだ。
// 足軽は丹羽長秀の手。①雨の夜、西の搦手の木戸へ寄せ、木戸を破る組を守る ②雨で鉄砲の撃てぬ中、打って出た城兵を受け止める
// ③退きの下知。追ってくる城兵を防ぎながら、陣まで退く
// 向き：北（-z）の丘の上に大河内城。南（+z）に織田の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { volleyTick } from './b_sekigahara.js';

const WALL_Z = -60;                         // 城の西の塀（搦手）
const GATE = { x: 0, z: WALL_Z };
const CAMP = { x: 4, z: 70 };
const ODA = { flag: 'oda' };
const KITABATAKE = { flag: 'maru' };        // 北畠の紋（無いので丸で代える）

function height(x, z) {
  let h = 0.4 * Math.sin(x * 0.035 + 0.2) * Math.cos(z * 0.03) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 城の丘
  h += 7 / (1 + Math.exp((z - (WALL_Z + 10)) / 3));
  h += 20 * gauss(x, z, 0, -130, 3000);
  return h;
}

const okawachi = {
  spawn: { x: 6, z: 50, heading: Math.PI },
  world: {
    seed: 15699,
    time: 'storm',
    muddy: 1,
    paths: [[[0, 150], [CAMP.x, CAMP.z], [0, 0], [GATE.x, GATE.z + 4]]],
    height,
    clear: (x, z) => Math.abs(x) < 80 && z > -110 && z < 100,
    trees: 480,
    tufts: 3200,
    treeDensity: (x, z) => (Math.abs(x) < 80 && z > -110 && z < 100 ? 0.12 : 1),
    groves: [{ x: -50, z: 0, r: 12, n: 16 }, { x: 50, z: 20, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -120,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 城の西の塀と搦手の木戸 ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-70, WALL_Z + 2], [-3.5, WALL_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[3.5, WALL_Z], [70, WALL_Z + 2]], { team: 1, hp: 1e9, name: '柵', segLen: 6 }));
    F.gate = rt.army.addStruct({ seg: [-3.5, WALL_Z, 3.5, WALL_Z], nx: 0, nz: 1, hp: 2400, maxHp: 2400, armor: 0.25, team: 1, name: '搦手の木戸' });
    const dm = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 0.95 }));
    dm.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.45, GATE.z); dm.castShadow = true;
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, GATE.x, GATE.z, 7.4, 0), yagura(W, -14, WALL_Z - 5), yagura(W, 14, WALL_Z - 5));
    for (const [x, z, r] of [[-10, -84, 0.1], [14, -90, -0.2], [0, -120, 0]]) rt.scene.add(hut(W, x, z, 9, 6, r, { h: 3.2, wall: 0x6a5a44, roof: 0x3a3430 }));
    for (const [x, z] of [[-6, WALL_Z - 4], [6, WALL_Z - 4]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // ---- 丹羽長秀の手（自分の持ち場）、池田・稲葉の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 0, z: 40 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.ikeda = allyGroup(rt, { name: '池田恒興の手', anchor: { x: -26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '池田恒興', invuln: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.inaba = allyGroup(rt, { name: '稲葉良通の手', anchor: { x: 26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉良通', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { flag: 'inaba' }));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 12, z: 54 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.niwa, F.ikeda, F.inaba, F.ram];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.75; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 50 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 塀の内の北畠の弓（雨でも弓は射てる） ----
    F.wallBow = enemyGroup(rt, { faction: 'saito', name: '塀の内の北畠勢', anchor: { x: 0, z: WALL_Z - 2.4 }, facing: 0, width: 30, aggro: 36, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'bow', n: 8 }, { type: 'gun', n: 2 }], KITABATAKE));
    // ---- 陣と大軍（軽い作り） ----
    // 織田の本陣（信長と旗本）と、城の内の北畠の本陣（具教と旗本）。見に行けば大将がいる
    camp(rt, { x: CAMP.x, z: CAMP.z + 14, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', armor: 0x2b3140,
      general: { name: '織田信長', hat: 'kabuto_w', haori: 0x8a1a14 }, guard: 15, reserve: 200, runTo: { x: 0, z: 44 } });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 5));
    camp(rt, { x: -24, z: -104, facing: 0, team: 1, faction: 'saito', mon: 'maru',
      general: { name: '北畠具教', hat: 'kabuto_m', haori: 0x3a2a44 }, guard: 15, reserve: 120, runTo: { x: 0, z: WALL_Z - 6 } });
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 6, 'oda'], [CAMP.x + 8, CAMP.z + 6, 'eiraku'], [-30, 36, 'oda'], [30, 36, 'inaba']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-70, 60, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15691);
    DA(70, 60, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15692);
    DA(-100, -80, 30, 12, 200, Math.PI / 2, 0x2b3140, 'oda', 15693);
    for (const [x, z] of [[-16, 62], [20, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.setPhase('brief');
    rt.obj('main', '丹羽長秀のもとで、夜攻めの下知を待て', 'main');
    rt.say('丹羽長秀', `${nm(rt)}、今夜、池田殿・稲葉殿と西の搦手から攻めかかる。……じゃが、この雨じゃ`, 5);
    rt.say('丹羽長秀', '火縄が湿って、鉄砲はまず撃てぬ。槍で押すしかない。覚悟せよ', 4);
    rt.marker('niwa', unitPos(F.niwaU), '丹羽長秀', {});
    rt.after(15, () => this.assault(rt));
  },

  // ① 搦手の木戸へ
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('niwa');
    sfx('horagai', 0.8);
    rt.banner('夜攻め', '雨の闇の中を、西の搦手の木戸へ');
    rt.obj('main', '木戸を破る組を守り、搦手の木戸を破れ', 'main');
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    for (const [g, x] of [[F.niwa, 0], [F.ikeda, -20], [F.inaba, 20]]) { g.order = 'move'; g.dest = { x, z: WALL_Z + 16 }; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
    rt.marker('gate', GATE, () => `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    rt.after(8, () => rt.say('足軽', '……鉄砲が、撃てぬ！　火が消える！', 3));
    rt.after(16, () => {
      if (F.step !== 1) return;
      F.s1 = enemyGroup(rt, { faction: 'saito', name: '塀の脇から出た北畠勢', anchor: { x: -40, z: WALL_Z + 8 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 95, fleeDir: { x: -1, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt, 0.3) }], KITABATAKE));
      F.s1.focus = R.units.find((u) => u.alive) || null;
      rt.army.play('eshout', { x: -40, z: WALL_Z + 8 }, 1.5);
      rt.say('足軽', '塀の脇から打って出た！　木戸の組を狙っておる！', 3);
      rt.marker('s1', centerOf(F.s1), () => `塀の脇から出た北畠勢・${moraleWord(F.s1.morale)}`, { red: true, group: F.s1 });
    });
  },

  // ② 城兵の打って出
  pushback(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('push');
    rt.unmark('gate'); rt.unmark('s1');
    F.ram.assault = null; F.ram.order = 'hold';
    sfx('taiko', 1);
    rt.banner('木戸が開いた', '……中から、城兵が一斉に打って出てきた');
    rt.obj('main', '打って出た北畠の城兵を受け止めよ', 'main');
    rt.say('丹羽長秀', '破れたのではない、城兵が自ら開けて出てきたのじゃ！　槍を揃えよ！', 3.5);
    F.gate.alive = false; if (F.gate.mesh) { F.gate.mesh.rotation.y = 1.3; F.gate.mesh.position.x -= 3; }
    F.push = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: WALL_Z - 8 }, facing: 0, order: 'attack', seekRange: 80, aggro: 16, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, dress(list, KITABATAKE));
      F.push.push(g);
      rt.marker('p' + F.push.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: WALL_Z }, 1.6);
    };
    // 木戸から一度にどっと出る：二つの組と、その後ろに続く城兵の控え（軽い作り）
    mk(-6, '打って出た北畠勢', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }]);
    mk(8, '北畠の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.4) }]);
    KIT.backOf(rt, F.push[0], { flag: 'maru', armor: KIT.ARMOR.saito, kind: 'spear', w: 18, depth: 10, count: 90, seed: 71 });
  },

  // ③ 退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    sfx('horagai', 0.6);
    rt.banner('退きの下知', '夜攻めは破れた。陣まで退く');
    rt.say('丹羽長秀', '退け！　……今夜はここまでじゃ。雨に負けた。組をまとめて退け！', 4);
    rt.obj('main', '追ってくる城兵を防ぎながら、陣まで退け', 'main');
    rt.marker('camp', CAMP, '陣', { h: 2 });
    rt.zone('camp', CAMP.x, CAMP.z - 6, 8);
    for (const g of [F.niwa, F.ikeda, F.inaba, F.ram]) { g.order = 'move'; g.dest = { x: g.anchor.x * 0.5, z: CAMP.z - 16 }; g.speed = 2.6; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.chaser = enemyGroup(rt, { faction: 'saito', name: '追ってくる城兵', anchor: { x: -6, z: WALL_Z + 20 }, facing: 0, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 + more(rt, 0.3) }], KITABATAKE));
    rt.marker('ch', centerOf(F.chaser), () => `追ってくる城兵・${moraleWord(F.chaser.morale)}`, { red: true, group: F.chaser });
    // 勝ち筋：陣幕の下で火縄を濡らさずに守っておいた鉄砲組が、陣の前に並ぶ。追っ手を陣の前まで引きつけて一度に放つ
    // （永禄十二年の戦なので鉄砲は少なめ）
    F.campGun = allyGroup(rt, { name: '陣の鉄砲組', anchor: { x: CAMP.x, z: CAMP.z - 12 }, facing: Math.PI, width: 8, aggro: 30, noRout: true, formation: 'line', order: 'hold' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }], ODA));
    rt.after(3, () => rt.say('丹羽長秀', '陣まで引け！　陣幕の下で火縄を守っておいた鉄砲組がおる。追っ手をそこまで連れてこい', 4.5));
    F.vol = { guns: () => [F.campGun], foe: () => F.chaser, r: 24, max: 80, hit: 40, who: '丹羽長秀',
      wait: '陣の鉄砲組、火蓋を切るな。追っ手が陣の前まで来るのを待て', line: '今じゃ、放てぇっ！', sub: '追ってくる城兵の足が止まる',
      then: (rt) => rt.say('足軽', '撃てた！　雨の中でも撃てたぞ！　追っ手が怯んだ！', 3) };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('camp'); rt.unzone('camp'); rt.unmark('ch');
    for (const q of [...(F.push || []), F.chaser, F.s1]) if (q && !gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '雨の夜攻めから組をまとめて退いた', pts: 18 }; }, '任務達成・陣まで退いた');
    sfx('horagai', 0.4);
    rt.banner('陣に戻った', '夜攻めは破れたが、囲みは続く');
    rt.say('丹羽長秀', `……ようまとめて退いた、${nm(rt)}。力で落ちぬなら、殿は別の手を打たれよう`, 4.5);
    rt.after(5, () => rt.say('', '――十月、信長は次男の茶筅丸（のちの信雄）を北畠の養子とすることで和を結び、伊勢を手に入れた', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    // 控えは前の隊が崩れたら一緒に崩れる（KIT.backTick は遠くの軍勢まで本物に替えるので、崩れだけを見る）
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
    if (F.ending) return;
    volleyTick(rt, dt, F.vol);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.s1 && F.s1.count < 4 && !gone(F.s1)) F.s1.morale = Math.min(F.s1.morale, 20);
      // 木戸が半ばまで傷んだところで、城兵が自ら開けて打って出る
      if (F.gate.hp < F.gate.maxHp * 0.5 || rt.t - F.stepT > 110) this.pushback(rt);
    }
    if (F.step === 2) {
      const L = F.push || [];
      rt.objProgress('main', `北畠勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 25);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 130) this.retreat(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - CAMP.x, p.z - (CAMP.z - 6));
      rt.objProgress('main', `陣まで ${Math.max(0, Math.round(d))}m`);
      if (F.chaser.count < 4 && !gone(F.chaser)) F.chaser.morale = Math.min(F.chaser.morale, 20);
      if (d < 8 || rt.t - F.stepT > 120) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が城へ退いた`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`木戸がきしむ（残り ${pct}%）`); }
  },
};

// 両軍の総勢（織田 七万余り、大河内城の北畠勢 八千ほど。数には諸説ある）
okawachi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 40), a0: 70000, b: Math.max(0, 8000 - (F.ek || 0) * 20), b0: 8000 };
};
okawachi.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '北畠軍', mon: 'maru' } };
okawachi.date = () => '永禄十二年九月八日　秋・雨・夜';
okawachi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : '');
okawachi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
okawachi.history = '永禄十二年（1569）八月、京を押さえた織田信長は、南伊勢の北畠具教・具房の父子を攻め、大河内城を大軍で囲んだ。九月八日の夜、丹羽長秀・池田恒興・稲葉良通らが西の搦手から攻めかかったが、雨で鉄砲が使えず、城兵に押し返されて多くの者を失ったと『信長公記』は伝える。信長は力攻めをやめて囲みを固め、兵糧を断った。十月、次男の茶筅丸（のちの織田信雄）を具房の養子とすることで和が結ばれ、北畠家は織田に従った。北畠家の紋（笹竜胆）の絵はまだ無いので、ここでは丸の旗で代えている。兵の数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
okawachi.lordAt = { x: 4, z: 80, r: 12, why: '大河内城を囲む織田の陣（信長は城を大軍で囲んだ）' };
okawachi.lordSpawn = { x: 4, z: 76, heading: Math.PI };

// 素直な遊び手：木戸の組を守り、打って出た城兵と戦い、陣まで退く
okawachi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 5, (o) => !o.fleeing);
    if (e3 && u.hp > u.maxHp * 0.4) { p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z); if (Math.random() < 0.5) inp.leftPressed = true; return; }
    goTo(p, inp, CAMP.x, CAMP.z - 6, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, WALL_Z + 40, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step >= 2 || o.pos.z > WALL_Z + 0.8));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { if (F.s1 && !gone(F.s1)) { const c = F.s1.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, 3, WALL_Z + 7, 2); return; }
  if (F.step === 2) { const q = (F.push || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(c.z, WALL_Z + 3), 2); return; } goTo(p, inp, 0, WALL_Z + 8, 2); }
};

export { okawachi };
