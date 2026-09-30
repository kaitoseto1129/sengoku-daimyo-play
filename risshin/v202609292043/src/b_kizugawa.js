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
import { depthStart, depthTick, rest, pick, hold } from './b_depth.js';
import { volleyAt } from './b_tano.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

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
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 14 }], ODA));
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
    rt.obj('main', HI(rt) ? '九鬼嘉隆の船で鉄砲衆の一手を預かり、下知を待て' : '九鬼嘉隆のもとで、下知を待て', 'main');
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
    rt.obj('main', HI(rt) ? '鉄砲衆を指図し、大筒で小早を沈めよ（6艘）' : '大筒で小早を沈めよ（6艘）', 'main');
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
      // 毛利の大将船は一発では沈まない
      if (best.hp > 1) {
        best.hp--;
        rt.army.smoke(best.x, 2, best.z, 0, 0, 3);
        rt.army.play('wood', { x: best.x, z: best.z }, 1.4);
        rt.bark(`大将船に当たった！　あと${best.hp}発`, true);
        return;
      }
      best.alive = false;
      if (best.big) {
        F.bigSunk = true;
        rt.banner('大将船、打ち払った', '毛利の大将の船が傾いていく');
        rt.award((t) => t.side.push('大筒で毛利の大将船を打ち払った'), '毛利の大将船を打ち払った');
        rt.say('九鬼嘉隆', 'でかした！　大将の船が傾いたぞ！', 3);
      }
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
    if (F.doused >= 3) this.deep(rt, 'A', () => this.board(rt));
    else rt.objProgress('main', `${F.doused}／3`);
  },

  // 段を重ねる（b_depth.js）：A 火を消した後の船団の総掛かり → C 乗り移りを退けた後、毛利の大将船
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, kzCtx(rt), which === 'A' ? kzA() : kzC(), () => { F.dpOn = false; then(); });
  },
  // 毛利の大将船（大きな安宅船）：大筒を三発当てれば沈む
  launchBig(rt) {
    const F = rt.flags;
    const m = kobaya();
    m.scale.set(2.4, 2.6, 2.4);
    const s = { x: -210, z: 4 }, t = { x: DECK.x0 - 22, z: 4 };
    m.position.set(s.x, 0, s.z);
    m.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from: 'w', hp: 3, big: true };
    F.boats.push(b);
    F.big = b;
    return b;
  },

  // ③ 乗り移ってきた毛利勢
  board(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('board');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); }
    rt.banner('乗り移ってくる', '小早から、毛利の兵が甲板へ乗り込んできた');
    rt.obj('main', HI(rt) ? '舳先の口に槍を揃え、乗り移った毛利勢を追い落とせ（船団が退くまで）' : '甲板に乗り移った毛利勢を追い落とせ（船団が退くまで）', 'main');
    rt.say('九鬼嘉隆', '槍を取れ！　一人も甲板に居させるな！', 3);
    rt.after(5, () => rt.say('九鬼嘉隆', '舳先の口は狭い。そこで槍を揃えれば、一人ずつしか上がれぬ。鉄砲衆は次の大波まで撃つな', 4.5));
    // 村上の水軍が寄せる時、船の鉄砲衆をそろえて放つ
    rt.after(50, () => { if (!F.ending) volleyAt(rt, { guns: () => [F.teppo], foes: () => F.boarders, who: '九鬼嘉隆', near: 1, drop: 30, max: 8, say: '村上の小早が舷に寄せる……鉄砲衆、放てぇっ！', line: '船の鉄砲衆が舷からそろって撃った。乗り込む毛利勢がひるむ' }); });
    F.boarders = [];
    const mk = (x, z, name, face) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: face, order: 'attack', seekRange: 50, aggro: 16, width: 8, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], MORI));
      F.boarders.push(g);
      rt.marker('b' + F.boarders.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z }, 1.5);
    };
    // 寄せは二度の大波：舷と舳先から一度に乗り込み、しばらくして村上の水軍がまとめて来る
    mk(DECK.x0 + 2, -10, '乗り込んだ毛利勢', Math.PI / 2);
    mk(-6, DECK.z0 + 2, '舳先から乗り込んだ毛利勢', 0);
    rt.after(58, () => {
      if (F.ending) return;
      mk(DECK.x0 + 2, 18, '村上の者', Math.PI / 2); mk(8, DECK.z0 + 2, '舳先の新手', 0);
      flotilla(rt, 3, 'w');
      rt.say('足軽', '村上の水軍じゃ！　舷からも舳先からも、まだ乗り込んでくる……！', 3);
    });
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
    depthTick(rt, dt);
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
    if (F.step === 1 && rt.t - F.stepT > 100) { rt.say('九鬼嘉隆', 'ほかの大筒も撃ちだした！　小早は崩れたぞ。……火じゃ、甲板を見よ！', 3.5); F.sunk = 6; this.fires(rt); }
    if (F.step === 2 && rt.t - F.stepT > 90) { for (let i = 0; i < 3; i++) if (rt.interacts.some((q) => q.id === 'f' + i)) this.douse(rt, i); }
    if (F.step === 3 && !F.dpOn) {
      const L = F.boarders || [];
      const left = Math.max(0, 100 - (rt.t - F.stepT));
      rt.objProgress('main', `毛利勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人・船団が退くまで ${Math.ceil(left)}秒`);
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (left <= 0 || (left < 20 && L.length >= 4 && L.every(gone))) {
        for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
        for (const q of L) if (!gone(q)) { q.noRout = false; q.morale = 0; }
        this.deep(rt, 'C', () => this.win(rt));
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || rt.t < (F.routSayT || 0)) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${g.name}が海へ飛び込んで逃げた！`, 2.5);
  },
};

// 両軍の総勢（九鬼の大船六艘と供の船の兵 数千、毛利の船団 六百艘とも。数には諸説ある）
kizugawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(3000 - (F.ak || 0) * 10), a0: 3000, b: Math.max(0, 8000 - (F.ek || 0) * 20 - F.sunk * 60), b0: 8000 };
};
kizugawa.sides = { a: { name: '織田水軍（九鬼）', mon: 'oda' }, b: { name: '毛利水軍', mon: 'mori' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
kizugawa.famous = [
  { name: '九鬼嘉隆', team: 0, line: '九鬼嘉隆じゃ。焙烙なぞ、この大船には効かぬ！' },
  { name: '村上元吉', g: /毛利/, loose: 1, near: 1, line: '能島の村上元吉なり！　大船に取り付け、火をかけよ！' },
  { name: '乃美宗勝', g: /毛利/, loose: 1, near: 1, line: '小早川の乃美宗勝なり！　この船、乗っ取ってくれる！' },
  { name: '児玉就英', g: /毛利/, loose: 1, near: 1, line: '毛利の児玉就英なり！　九鬼の首を取れ！' },
];
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

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 船の上なので、後ろの控え（軽い大軍）は付けない。代わりに小早の群れが海を埋め、舷の三方から一度にどっと乗り込む
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const W_EDGE = DECK.x0 + 1.5, BOW = DECK.z0 + 1.5, STERN = DECK.z1 - 1.5;
// 小早を何艘か一度に出す（見た目の群れ）
const flotilla = (rt, n, from) => { for (let i = 0; i < n; i++) rt.after(i * 1.2, () => kizugawa.launch(rt, from || (Math.random() < 0.7 ? 'w' : 'n'))); };
// 乗り移ってきた鉄砲組：鉄砲だけの組は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 40, ...o });
function kzCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'mori', dmg: 0.66, mass: 0, scale: 1.6, look: (l) => dress(l, MORI),
    friends: () => [F.kuki, F.teppo].filter((g) => g && g.count && !g.routed) };
}
// A 火を消した後：船団の総掛かり（大筒に残るか、舳先を固めるか）
function kzA() {
  return [
    rest({ dur: 7, heal: 0.3, say: [['九鬼嘉隆', '火は消えた。……見よ、西の海一面が小早じゃ'], ['足軽', 'あれ全部が、この船に取り付くのか……'], ['九鬼嘉隆', '二年前は、あれに焼かれた。今度は違う']] }),
    pick({ title: '毛利の船団が総掛かりで寄せてくる。どこを受け持つ？',
      pre: (rt) => flotilla(rt, 5, 'w'),
      options: [{ label: '西の舷の大筒につき、寄せる小早を沈める', note: '大筒で小早を減らせば、乗り込む者が少なくなる。舷で乗り込みを受ける' }, { label: '舳先で槍を揃え、乗り込みを防ぐ', note: '舳先は固くなる。大筒は船の鉄砲衆に任せ、西の舷から多く乗り込まれる' }],
      on: (rt, m, i) => { m.kzGun = i === 0; rt.say('九鬼嘉隆', i === 0 ? 'よし、大筒じゃ！　込め直しの間は槍で舷を守れ' : 'よし、舳先を頼む！', 3); } }),
    hold({ at: (rt, m) => (m.kzGun ? { x: -14, z: 4 } : { x: -2, z: BOW + 6 }), dur: 90, r: 10, title: '船団の総掛かり', sub: '小早が西からも北からも取り付いてくる', label: '持ち場', obj: (rt, m) => (m.kzGun ? '西の舷で、大筒を撃ちながら乗り込みを防げ' : '舳先で、乗り込んでくる毛利勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '西の舷に取り付いた！　乗り込んでくる！'], foes: (rt, m) => { flotilla(rt, 4, 'w'); return [{ name: '西の舷から乗り込む毛利勢', from: { x: W_EDGE, z: -8 }, list: [uS(2), uA(m.kzGun ? 7 : 10)] }]; } },
        { t: 26, say: ['足軽', '舳先からもじゃ！'], foes: (rt, m) => { flotilla(rt, 3, 'n'); return [{ name: '舳先から乗り込む毛利勢', from: { x: -4, z: BOW }, list: [uS(2), uA(m.kzGun ? 9 : 6)] }]; } },
        { t: 50, say: ['九鬼嘉隆', '鉄砲を持って乗り込んできた！　並ぶ前に突け！'], foes: () => [gunLine('乗り込んだ毛利の鉄砲衆', { x: W_EDGE, z: 16 }, 7)] },
        { t: 74, say: ['足軽', '艫（とも）の方からも！　囲まれた！'], foes: () => [{ name: '艫から回った村上の者', from: { x: 6, z: STERN }, list: [uS(2), uA(8)] }] },
      ],
      reward: '船団の総掛かりから船を守った', lost: ['九鬼嘉隆', '押し込まれたか……！　まだ船は沈まぬ！'] }),
    rest({ dur: 6, bark: '甲板で、組を寄せ直す', say: [['足軽', '南の味方の小舟が、焙烙を投げ込まれて燃えておる！'], ['九鬼嘉隆', '……二年前と同じじゃ']] }),
    pick({ title: '供の小舟が焙烙で焼かれている。船の鉄砲衆をどう使う？',
      options: [{ label: '鉄砲衆を南の舷へ回し、小舟を焼く毛利の船を撃たせる', note: '供の小舟が助かる（手柄）。西の舷が薄くなり、次の乗り込みが厚くなる' }, { label: '鉄砲衆は西の舷に残し、乗り込みに備える', note: '次の乗り込みは薄くなる。供の小舟は見捨てる' }],
      on: (rt, m, i) => {
        m.kzHelp = i === 0;
        const F = rt.flags;
        if (i === 0) {
          if (F.teppo && F.teppo.count) { F.teppo.anchor = { x: 6, z: DECK.z1 - 6 }; F.teppo.facing = 0; }
          rt.after(8, () => { sfx('volley', 0.7); rt.army.smoke(10, 1.5, DECK.z1 + 14, 0, 1, 2); rt.award((t) => t.side.push('焼かれる供の小舟を救った'), '供の小舟を救った'); rt.say('九鬼嘉隆', 'よし、毛利の船が離れた！　小舟の者を引き上げよ', 3); });
        }
        rt.say('九鬼嘉隆', i === 0 ? '鉄砲衆、南の舷へ！　焙烙を投げる者を撃て！' : '……西の舷を離れるな', 3);
      } }),
  ];
}
// C 乗り移りを退けた後：毛利の大将船 → どう迎えるか → 船団が退くまで
function kzC() {
  return [
    rest({ dur: 8, heal: 0.3, say: [['足軽', '西から……でかい船が来る！'], ['九鬼嘉隆', '毛利の大将船じゃ。あれを沈めれば、船団は崩れる']],
      fn: (rt) => kizugawa.launchBig(rt) }),
    pick({ title: '毛利の大将船が寄せてくる。どう迎える？',
      options: [{ label: '大筒で大将船を狙う（三発当てる）', note: '沈めれば大手柄。その間、舷の守りは薄い' }, { label: '甲板で槍を揃え、大将船からの乗り込みを受ける', note: '大将船は船の鉄砲衆が撃つ。乗り込む者は多い' }],
      on: (rt, m, i) => {
        m.kzBig = i === 0;
        const F = rt.flags;
        if (i === 0) for (let k = 0; k < 3; k++) rt.marker('g' + k, { x: F.guns[k].x, z: F.guns[k].z }, '大筒', { h: 2 });
        rt.say('九鬼嘉隆', i === 0 ? '大筒につけ！　三発当てれば、あの船は沈む！' : 'よし、槍衾じゃ。鉄砲衆、大将船を撃て！', 3);
      } }),
    hold({ at: (rt, m) => (m.kzBig ? { x: -14, z: 4 } : { x: -8, z: 0 }), dur: 100, r: 11, title: '大将船', sub: '大将船の周りの小早から、毛利勢が一斉に乗り込む', label: '持ち場', obj: (rt, m) => (m.kzBig ? '大筒で毛利の大将船を打ち払え（乗り込みも防げ）' : '甲板で、大将船から乗り込む毛利勢を防げ'),
      waves: [
        { t: 6, say: ['足軽', '大将船の周りの小早が、一度に取り付いた！'], foes: (rt, m) => { flotilla(rt, 5, 'w'); return [{ name: '毛利の乗り込み衆', from: { x: W_EDGE, z: -14 }, list: [uS(2), uA((m.kzBig ? 7 : 11) + (m.kzHelp ? 3 : 0))] }, { name: '舳先の毛利勢', from: { x: 4, z: BOW }, list: [uS(1), uA(m.kzBig ? 5 : 8)] }]; } },
        { t: 36, say: ['九鬼嘉隆', '大将船の鉄砲衆が、舷に並んだ！　板垣の陰へ！'], foes: () => [gunLine('大将船の鉄砲衆', { x: W_EDGE, z: 10 }, 8)] },
        { t: 66, say: ['足軽', '艫にも回った！　前も後ろも毛利じゃ！'], foes: () => [{ name: '艫の村上の者', from: { x: -2, z: STERN }, list: [uS(2), uA(9)] }, { name: '西の舷の新手', from: { x: W_EDGE, z: -24 }, list: [uS(1), uA(8)] }] },
        { t: 96, if: (rt) => !rt.flags.bigSunk, say: ['九鬼嘉隆', '大将船が、まだ沈まぬ……！　乗り込みが続くぞ！'], foes: () => [{ name: '大将船の旗本', from: { x: W_EDGE, z: 0 }, list: [uS(3), uA(9)] }] },
      ],
      reward: '毛利の大将船の寄せを退けた',
      onEnd: (rt) => {
        const F = rt.flags;
        for (let k = 0; k < 3; k++) rt.unmark('g' + k);
        if (!F.bigSunk && F.big && F.big.alive) { F.big.alive = false; F.big.sinkT = 0; F.bigSunk = true; rt.banner('大将船、傾く', '船の鉄砲衆と大筒が、大将船を打ち払った'); }
      } }),
  ];
}

export { kizugawa };
