// ======================================================================
// 織田家編　第二次木津川口の戦い（天正六年十一月六日）
// 石山本願寺へ海から兵糧を運ぶ毛利の水軍に、二年前、織田の水軍は焙烙火矢で焼かれて大敗した。
// 信長は九鬼嘉隆に、鉄の板で覆った大きな安宅船（鉄甲船）を造らせた。天正六年十一月、六艘の大船は木津川口で毛利の船団を迎え、
// 大鉄砲（大筒）で打ち払って退けた。
// 足軽は九鬼嘉隆の大船に乗る。①大筒を撃って、寄せる小早（小舟）を沈める ②焙烙火矢で甲板に上がった火を消す
// ③乗り移ってきた毛利勢を追い落とす ④毛利の船団が退くまで持ちこたえる
// 向き：自分の船団は真ん中。西（-x）と北（-z）の海から毛利の船が来る。東の遠くに大坂の浜
// ======================================================================
import * as THREE from 'three';
import { nobori, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';

// 甲板（三艘の大船を横に並べて板で繋いだ所）。水面は 0
const DECK = { x0: -20, x1: 20, z0: -32, z1: 32, y: 2.2 };
const CANNONS = [{ x: -18, z: -16 }, { x: -18, z: 4 }, { x: -18, z: 22 }];   // 西の舷の大筒
const ODA = { flag: 'oda' };
const MORI = { flag: 'mori' };

function height(x, z) {
  // 海の底
  let h = -3 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  // 甲板（縁は少しだけ丸める）
  const dx = Math.max(DECK.x0 - x, x - DECK.x1, 0), dz = Math.max(DECK.z0 - z, z - DECK.z1, 0);
  const d = Math.hypot(dx, dz);
  if (d < 1.2) h = DECK.y - d * 0.4;
  // 東の遠くに大坂の浜と、上町台地
  h += Math.max(0, (x - 180)) * 0.12 + 20 * gauss(x, z, 300, 60, 16000);
  return h;
}

// 鉄甲船の船体（黒い鉄の板で覆った舷と、上の矢倉）
function hull(W, cx, z0, z1, w) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.6, metalness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const len = z1 - z0;
  for (const sd of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, len), iron);
    side.position.set(cx + sd * w / 2, 0.2, (z0 + z1) / 2); g.add(side);
  }
  for (const zz of [z0, z1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 4.4, 0.5), iron); e.position.set(cx, 0.2, zz); g.add(e); }
  const bow = new THREE.Mesh(new THREE.ConeGeometry(w / 2, 6, 4), iron); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(cx, 0.4, z0 - 3); g.add(bow);
  // 舷の上の板垣（胸の高さ）
  for (const sd of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, len), wood); r.position.set(cx + sd * (w / 2 - 0.1), DECK.y + 0.55, (z0 + z1) / 2); g.add(r); }
  // 矢倉（船の真ん中の二階）
  const yag = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 3, 7), wood); yag.position.set(cx, DECK.y + 1.5, z1 - 5); g.add(yag);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.3, 8), iron); roof.position.set(cx, DECK.y + 3.1, z1 - 5); g.add(roof);
  // 甲板の板（船の床）
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.3, len - 0.4), new THREE.MeshStandardMaterial({ color: 0x6a5642, roughness: 0.9 }));
  deck.position.set(cx, DECK.y - 0.05, (z0 + z1) / 2); g.add(deck);
  for (let i = 1; i < 10; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, len - 0.6), wood); seam.position.set(cx - w / 2 + (w / 10) * i, DECK.y + 0.11, (z0 + z1) / 2); g.add(seam); }
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  return g;
}
// 小早（毛利の小舟）
// 小早の形と材質は一つを使い回す（出すたびに作ると、戦の途中で作り直しが起きて重い）
let KOB = null;
function kobaya() {
  if (!KOB) KOB = { wood: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }), hull: new THREE.BoxGeometry(2.6, 0.9, 10), bow: new THREE.BoxGeometry(1.8, 0.7, 2), shield: new THREE.BoxGeometry(2.4, 1.2, 0.2) };
  const g = new THREE.Group();
  const wood = KOB.wood;
  const hullM = new THREE.Mesh(KOB.hull, wood); hullM.position.y = 0.2; g.add(hullM);
  const bow = new THREE.Mesh(KOB.bow, wood); bow.position.set(0, 0.5, 5.6); bow.rotation.x = -0.5; g.add(bow);
  const shield = new THREE.Mesh(KOB.shield, wood); shield.position.set(0, 1.1, 3.8); g.add(shield);
  for (const m of g.children) m.castShadow = true;
  return g;
}

const kizugawa = {
  spawn: { x: -8, z: 0, heading: -Math.PI / 2 },
  world: {
    seed: 15786,
    time: 'day',
    muddy: 0,
    height,
    clear: () => true,
    trees: 0,
    tufts: 0,
    fleeOut: (x, z, team) => team === 1 && (x < DECK.x0 - 3 || z < DECK.z0 - 3 || z > DECK.z1 + 3),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.sunk = 0; F.doused = 0;
    // 船の上では馬に乗らない
    const P = rt.player;
    if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; }
    P.canRide = false;
    // ---- 海（world の川面は岸の線で歩ける所を切るので使わず、ここで海の面だけを張る） ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a4e55, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.receiveShadow = true;
    rt.scene.add(sea);
    F.sea = sea;
    // 船の上に草は生えない（足もとの草の群れを隠す）
    if (W.nearGrass) W.nearGrass.visible = false;
    // ---- 三艘の鉄甲船 ----
    for (const cx of [-13.4, 0, 13.4]) rt.scene.add(hull(W, cx, DECK.z0, DECK.z1, 13.2));
    for (const [x, z] of [[-13, 8], [0, 10], [13, 8], [-6, -24], [6, -24]]) { const n = nobori(W, x, z, 'oda', 7); rt.scene.add(n); }
    rt.scene.add(tawara(W, 8, 14, 0.2, 5), tawara(W, -4, -12, -0.3, 4));
    // 大筒（西の舷）
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.5 });
    F.guns = CANNONS.map((c) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 10), iron);
      m.rotation.z = Math.PI / 2; m.position.set(c.x - 0.8, DECK.y + 1.1, c.z); m.castShadow = true;
      rt.scene.add(m);
      return { ...c, m, cd: 0 };
    });
    // ---- 九鬼嘉隆の手（自分の持ち場）と、鉄砲衆 ----
    F.kuki = allyGroup(rt, { name: '九鬼嘉隆の手', anchor: { x: -6, z: 0 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '九鬼嘉隆', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
    F.kukiU = F.kuki.units[0];
    F.teppo = allyGroup(rt, { name: '船の鉄砲衆', anchor: { x: -12, z: -18 }, facing: -Math.PI / 2, width: 10, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    F.oda = [F.kuki, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 6, z: 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 20) }]);
    // ---- 遠くの毛利の船団（小早を並べた影） ----
    F.boats = [];
    F.far = [];
    for (let i = 0; i < 10; i++) {
      const b = kobaya();
      b.position.set(-120 - (i % 5) * 18, 0, -60 + Math.floor(i / 5) * 60 + (i % 3) * 8);
      b.rotation.y = Math.PI / 2;
      rt.scene.add(b);
      F.far.push(b);
    }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '九鬼嘉隆のもとで、下知を待て', 'main');
    rt.say('九鬼嘉隆', `${nm(rt)}、二年前、わしらはここで毛利の焙烙に焼かれた。……じゃが、この船は鉄で覆ってある。焼けはせぬ`, 5);
    rt.say('九鬼嘉隆', '西の舷の大筒につけ。寄せてくる小早を、近寄る前に沈めるのじゃ', 4);
    rt.marker('kuki', unitPos(F.kukiU), '九鬼嘉隆', {});
    rt.after(14, () => this.cannons(rt));
  },

  // 小早を一艘出す（西か北から、甲板の縁へ向かう）
  launch(rt, from) {
    const F = rt.flags;
    const m = kobaya();
    const s = from === 'n' ? { x: -6 + Math.random() * 12, z: -170 } : { x: -190, z: -20 + Math.random() * 40 };
    const t = from === 'n' ? { x: s.x, z: DECK.z0 - 4 } : { x: DECK.x0 - 4, z: Math.max(DECK.z0 + 4, Math.min(DECK.z1 - 4, s.z)) };
    m.position.set(s.x, 0, s.z);
    m.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from };
    F.boats.push(b);
    return b;
  },

  // ① 大筒を撃つ
  cannons(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('cannon');
    rt.unmark('kuki');
    sfx('horagai', 0.9);
    rt.banner('毛利の船団', '小早が波を切って寄せてくる');
    rt.obj('main', '大筒で小早を沈めよ（6艘）', 'main');
    for (let i = 0; i < 3; i++) {
      const c = F.guns[i];
      rt.marker('g' + i, { x: c.x, z: c.z }, '大筒', { h: 2 });
      rt.addInteract('g' + i, { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, i), { r: 2.6, hold: 1.2 });
    }
    this.launch(rt, 'w'); rt.after(6, () => this.launch(rt, 'w')); rt.after(14, () => this.launch(rt, 'w'));
    F.nextBoat = rt.t + 22;
  },
  fire(rt, i) {
    const F = rt.flags;
    const c = F.guns[i];
    if (rt.t < c.cd) { rt.bark('まだ弾込めが済んでおらぬ'); return; }
    c.cd = rt.t + 6;
    rt.army.play('volley', { x: c.x, z: c.z }, 1.6);
    rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    // 一番近い小早に当たる
    let best = null, bd = 140;
    for (const b of F.boats) if (b.alive && !b.landed) { const d = Math.hypot(b.x - c.x, b.z - c.z); if (d < bd) { bd = d; best = b; } }
    if (!best) { rt.bark('大筒は空を撃った'); return; }
    rt.after(0.6, () => {
      best.alive = false;
      rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
      rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
      best.sinkT = 0;
      F.sunk++;
      rt.award((t) => { t.special = { label: '大筒で小早を沈めた', pts: 3 * Math.min(6, F.sunk) }; }, '小早を沈めた');
      if (F.step === 1) { rt.objProgress('main', `${Math.min(6, F.sunk)}／6艘`); if (F.sunk >= 6) this.fires(rt); }
    });
  },

  // ② 焙烙火矢の火を消す
  fires(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fire');
    rt.objDone('main');
    sfx('volley', 0.8);
    rt.banner('焙烙火矢', '甲板に火の壺が投げ込まれた');
    rt.obj('main', '甲板に上がった火を消せ（3か所）', 'main');
    rt.say('九鬼嘉隆', '鉄の舷は焼けぬが、甲板の板は燃える！　水を掛けよ！', 3.5);
    F.fl = [{ x: -4, z: -20 }, { x: 8, z: -4 }, { x: -2, z: 20 }].map((q, i) => {
      const f = rt.world.addFire(q.x, q.z, { h: 0.4 });
      rt.marker('f' + i, q, '火を消す', { h: 2 });
      rt.addInteract('f' + i, q, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
      return { ...q, f };
    });
  },
  douse(rt, i) {
    const F = rt.flags;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fl[i].f);
    F.doused++;
    rt.award((t) => t.side.push('焙烙の火を消した'), '火を消した');
    if (F.doused >= 3) this.board(rt);
    else rt.objProgress('main', `${F.doused}／3`);
  },

  // ③ 乗り移ってきた毛利勢
  board(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('board');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); }
    rt.banner('乗り移ってくる', '小早から、毛利の兵が甲板へ乗り込んできた');
    rt.obj('main', '甲板に乗り移った毛利勢を追い落とせ（船団が退くまで）', 'main');
    rt.say('九鬼嘉隆', '槍を取れ！　一人も甲板に居させるな！', 3);
    F.boarders = [];
    const mk = (x, z, name, face) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: face, order: 'attack', seekRange: 50, aggro: 16, width: 8, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], MORI));
      F.boarders.push(g);
      rt.marker('b' + F.boarders.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z }, 1.5);
    };
    mk(DECK.x0 + 2, -10, '乗り込んだ毛利勢', Math.PI / 2);
    rt.after(30, () => { if (!F.ending) mk(-6, DECK.z0 + 2, '舳先から乗り込んだ毛利勢', 0); });
    rt.after(62, () => { if (!F.ending) { mk(DECK.x0 + 2, 18, '村上の者', Math.PI / 2); rt.say('足軽', '村上の水軍じゃ！', 2.5); } });
    rt.after(98, () => { if (!F.ending) { mk(8, DECK.z0 + 2, '舳先の新手', 0); rt.say('足軽', 'まだ乗り込んでくる……！', 2.5); } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
    for (const q of F.boarders || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '鉄甲船で毛利の船団を退けた', pts: 20 }; }, '任務達成・木津川口を守った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('毛利の船団、退く', '石山本願寺への海の道は、断たれた');
    rt.say('九鬼嘉隆', `見たか、${nm(rt)}！　二年前の恨み、晴らしたぞ`, 4);
    rt.after(5, () => rt.say('', '――海からの兵糧を断たれた本願寺は、二年後、信長と和を結んで石山を退いた', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    // 小早を動かす・沈める
    for (const b of F.boats) {
      if (!b.alive) { if (b.sinkT !== undefined && b.sinkT < 6) { b.sinkT += dt; b.m.position.y = -b.sinkT * 0.5; b.m.rotation.z = b.sinkT * 0.12; } else if (b.m.parent) rt.scene.remove(b.m); continue; }
      if (b.landed) continue;
      const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
      const sp = 5;
      if (d > 0.5) { b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; b.m.position.set(b.x, 0.1 * Math.sin(rt.t * 1.3 + b.x), b.z); }
      else {
        b.landed = true;
        // 甲板の縁に着いた小早から、数人が乗り込む
        if (F.step < 3) {
          const g = enemyGroup(rt, { faction: 'saito', name: '小早から上がった毛利勢', anchor: { x: b.from === 'n' ? b.x : DECK.x0 + 2, z: b.from === 'n' ? DECK.z0 + 2 : b.z }, facing: b.from === 'n' ? 0 : Math.PI / 2, order: 'attack', seekRange: 40, aggro: 14, width: 5, morale: 80, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
            dress([{ type: 'ashigaru', n: 4 }], MORI));
          F.small = [...(F.small || []), g];
          rt.bark('小早が舷に着いた！　乗り込んでくる！', true);
        }
      }
    }
    // 毛利の船は途切れず寄せてくる（大筒のうち）
    if (F.step >= 1 && F.step <= 3 && rt.t > (F.nextBoat || 1e9)) { F.nextBoat = rt.t + (F.step === 1 ? 9 : 16); this.launch(rt, Math.random() < 0.7 ? 'w' : 'n'); }
    // 遠くの船団がゆれる
    for (const b of F.far) b.position.y = 0.15 * Math.sin(rt.t * 1.1 + b.position.z);
    F.sea.position.y = 0.06 * Math.sin(rt.t * 0.7);
    if (F.step === 1 && rt.t - F.stepT > 130) { rt.objFail('main'); F.sunk = 6; this.fires(rt); }
    if (F.step === 2 && rt.t - F.stepT > 90) { for (let i = 0; i < 3; i++) if (rt.interacts.some((q) => q.id === 'f' + i)) this.douse(rt, i); }
    if (F.step === 3) {
      const L = F.boarders || [];
      const left = Math.max(0, 130 - (rt.t - F.stepT));
      rt.objProgress('main', `毛利勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人・船団が退くまで ${Math.ceil(left)}秒`);
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (left <= 0 || (left < 20 && L.length >= 4 && L.every(gone))) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が海へ飛び込んで逃げた！`, 2.5);
  },
};

// 両軍の総勢（九鬼の大船六艘と供の船の兵 数千、毛利の船団 六百艘とも。数には諸説ある）
kizugawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(3000 - (F.ak || 0) * 10), a0: 3000, b: Math.max(0, 8000 - (F.ek || 0) * 20 - F.sunk * 60), b0: 8000 };
};
kizugawa.sides = { a: { name: '織田水軍（九鬼）', mon: 'oda' }, b: { name: '毛利水軍', mon: 'mori' } };
kizugawa.date = () => '天正六年十一月六日　冬・晴';
kizugawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
kizugawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
kizugawa.history = '石山本願寺は、海から毛利の兵糧を受けて籠城を続けていた。天正四年（1576）七月の第一次木津川口の戦いでは、織田方の水軍が毛利・村上の水軍の焙烙火矢に焼かれて大敗した。信長は伊勢の九鬼嘉隆に、焼けにくい大きな安宅船を六艘造らせた。これが鉄の板で覆われていたという話は『多聞院日記』などに見えるが、どこまで鉄で覆われていたかには諸説がある。天正六年十一月六日、九鬼の大船は木津川口で毛利の船団を迎え、大鉄砲（大筒）で大将の船などを打ち払って退けた。海からの兵糧を断たれた本願寺は、天正八年に信長と和を結んで石山を退いた。船の数や兵の数には諸説ある。';

// 素直な遊び手：大筒を撃ち、火を消し、乗り込んだ毛利勢と戦う
kizugawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 12, 20, 2); return; }
  const e = b.army.nearestEnemy(u, 10, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const pre = F.step === 1 ? 'g' : F.step === 2 ? 'f' : null;
  if (pre) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith(pre)) {
      if (pre === 'g') { const gi = +x.id.slice(1); if (b.t < F.guns[gi].cd) continue; }
      const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; }
    }
    if (it) { if (bd > 1.2) goTo(p, inp, it.pos.x, it.pos.z, 0.8); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 3) { const q = (F.boarders || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, -8, 0, 2); }
};

export { kizugawa };
