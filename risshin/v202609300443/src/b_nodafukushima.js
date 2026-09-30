// ======================================================================
// 織田家編　野田・福島の戦い（元亀元年八月〜九月）
// 三好三人衆が摂津の野田・福島に砦を構え、信長はこれを囲んだ。織田方には紀伊の根来・雑賀の鉄砲衆も加わり、
// 昼も夜も鉄砲の撃ち合いが続いた。九月十二日の夜、石山本願寺が早鐘を撞いて蜂起し、織田の陣を襲った。
// 足軽は前田利家の手。①堤の上へ竹束を運んで据える（砦の鉄砲の下で） ②浅瀬を渡って打って出た三好勢を退ける
// ③夜、本願寺の早鐘。背後から寄せる一揆勢から堤を守り、夜明けまで持ちこたえる
// ②と③の間・③の後に段（b_depth.js）：中洲の三好の鉄砲衆（斬り込むか撃ち合うか）→福島砦の別手が堤の西の端を回る
// →夜明け、退く一揆勢を追うか三好の打って出に備えるか。堤の左右・南東では大軍が押し合う（軽い作り）
// 向き：北（-z）の川の向こうに野田砦。南（+z）に織田の陣。南東の遠くに石山本願寺
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, hut, yagura, tawara, campfire, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, DAWN, customFlag, flagColumn, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { volleyScene } from './b_shiga.js';
import { uS, uA, uG, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-220, -24], [-110, -32], [0, -30], [110, -24], [220, -30]];
const FORT_Z = -46;                         // 野田砦の柵
const LEVEE_Z = -8;                         // 堤の背
const PILE = { x: 2, z: 10 };               // 竹束の置き場
const SPOTS = [{ x: -14, z: -13 }, { x: 0, z: -14 }, { x: 14, z: -13 }];   // 竹束を据える所（堤の川側の肩）
const HONGAN = { x: 170, z: 170 };          // 石山本願寺（遠く）
const ODA = { flag: 'oda' };
const MIYOSHI = { flag: 'miyoshi' };
// 一揆の門徒：具足は軽く、鉢巻に、南無阿弥陀仏の旗
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };

// 本願寺の紋：下がり藤（丸に、左右から垂れる藤の花房）
function sagarifujiTex() {
  return customFlag('sagarifuji', (g) => {
    g.translate(64, 82); g.scale(43, 43);
    g.lineWidth = 0.1; g.beginPath(); g.arc(0, 0, 0.95, 0, Math.PI * 2); g.stroke();
    for (const sd of [-1, 1]) {
      // 蔓の弧と、垂れる花房（小さな楕円を重ねて）
      g.lineWidth = 0.07; g.beginPath(); g.arc(0, -0.2, 0.62, sd > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, sd > 0 ? -Math.PI * 0.55 : -Math.PI * 0.45, sd < 0); g.stroke();
      for (let k = 0; k < 6; k++) {
        const y = -0.5 + k * 0.2, x = sd * (0.55 - k * 0.07), w = 0.17 - k * 0.018;
        g.beginPath(); g.ellipse(x, y, w, 0.09, 0, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.ellipse(sd * 0.3, -0.45, 0.14, 0.08, sd * 0.5, 0, Math.PI * 2); g.fill();
    }
  });
}
// 一揆の字の旗：「南無阿弥陀仏」
function namuTex() {
  return customFlag('namu', (g) => flagColumn(g, '南無阿弥陀仏', 64, 14, 242, 34));
}

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 堤（川の南岸を東西に）。真ん中の持ち場は少し高く、背を平らに
  const lv = Math.exp(-((z - LEVEE_Z) ** 2) / 26) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 120) / 30);
  h += 2.6 * lv;
  // 砦の島は少し高い
  h += 1.2 * Math.max(0, Math.min(1, (-(z + 36)) / 8)) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 70) / 20);
  // 遠くの上町台地（本願寺）
  h += 12 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  return h;
}

// 竹束：青竹を束ねて縄でくくった盾。鉄砲の弾をよける
const TAKE = { cane: new THREE.MeshStandardMaterial({ color: 0x6f7a44, roughness: 0.8 }), rope: new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 1 }) };
function takeTaba(W, x, z, rot = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.2, 6), TAKE.cane);
    c.position.set(-0.8 + i * 0.16, 1.1, (i % 2) * 0.1);
    c.castShadow = true;
    g.add(c);
  }
  for (const y of [0.5, 1.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.26), TAKE.rope); r.position.y = y; g.add(r); }
  // 後ろの支え
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), TAKE.rope);
  s.position.set(0, 0.8, 0.55); s.rotation.x = -0.6; g.add(s);
  g.rotation.set(-0.12, rot, 0);
  g.position.set(x, W.heightAt(x, z), z);
  return g;
}

const nodafukushima = {
  spawn: { x: 6, z: 16, heading: Math.PI },
  world: {
    seed: 1570,
    wind: [-0.9, -0.3],   // 海からの風（西へ）
    time: 'after',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.55,
    paths: [[[0, 160], [0, 40], [0, 12], [0, LEVEE_Z]]],
    height,
    tint(x, z, h, c) {
      // 川べりの葦と泥
      if (z < -16 && z > -42) c.lerp({ r: 0.42, g: 0.44, b: 0.32 }, 0.4);
    },
    clear: (x, z) => (z > -60 && z < 60 && Math.abs(x) < 90) || Math.hypot(x, z - 56) < 22 || Math.hypot(x - 40, z + 78) < 22,
    streams: [{ pts: RIVER, w: 12, depth: 0.9 }],
    // 摂津の低い田（淀川の河口の島々）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 36) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260,
    tufts: 5200,
    treeDensity: (x, z) => (z > -70 && z < 70 ? 0.1 : 0.6),
    groves: [{ x: 90, z: 40, r: 14, n: 18 }, { x: -90, z: 50, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z < -90 || x > 150 || z > 150),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.placed = 0; F.carry = false;
    sagarifujiTex(); namuTex();
    // ---- 野田砦：川の北岸の柵と櫓・小屋 ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fortWall = noT(wallLine(rt, [[-64, FORT_Z + 2], [-30, FORT_Z], [-6, FORT_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.fortWall.push(...noT(wallLine(rt, [[6, FORT_Z], [30, FORT_Z], [64, FORT_Z + 2]], { team: 1, hp: 1e9, name: '柵', segLen: 5 })));
    rt.scene.add(yagura(W, -20, FORT_Z - 6), yagura(W, 22, FORT_Z - 6));
    for (const [x, z, r] of [[-30, -60, 0.1], [8, -64, -0.2], [36, -58, 0.3], [-8, -76, 0]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x6a5238 }));
    for (const [x, z] of [[-40, FORT_Z - 3], [-12, FORT_Z - 3], [12, FORT_Z - 3], [40, FORT_Z - 3], [0, -70]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 福島の砦（西の島。遠く）
    for (const [x, z, r] of [[-130, -70, 0.2], [-112, -80, -0.1]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x6a5238 }));
    for (const [x, z] of [[-120, -58], [-104, -62]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // ---- 石山本願寺（遠く、南東の台地の上） ----
    for (const [x, z, w, d] of [[HONGAN.x, HONGAN.z, 16, 10], [HONGAN.x - 22, HONGAN.z + 10, 10, 7], [HONGAN.x + 14, HONGAN.z - 16, 10, 7]]) rt.scene.add(hut(W, x, z, w, d, 0.6, { h: 3.6, wall: 0x7a5a3c, roof: 0x3a3430 }));
    for (const [x, z] of [[HONGAN.x - 20, HONGAN.z - 12], [HONGAN.x - 6, HONGAN.z - 20], [HONGAN.x + 8, HONGAN.z - 26]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    // ---- 織田勢：前田利家の手（自分の持ち場）、佐々成政の手、鉄砲衆 ----
    F.maeda = allyGroup(rt, { name: '前田利家の手', anchor: { x: 0, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], ODA));
    F.maedaU = F.maeda.units[0];
    F.sassa = allyGroup(rt, { name: '佐々成政の手', anchor: { x: -30, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }], ODA));
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 26, z: LEVEE_Z + 2 }, facing: Math.PI, width: 12, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.maeda, F.sassa, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 8, z: LEVEE_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦の鉄砲 ----
    F.fortGun = enemyGroup(rt, { faction: 'saito', name: '砦の鉄砲', anchor: { x: 0, z: FORT_Z - 2.5 }, facing: 0, width: 30, aggro: 50, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }, { type: 'bow', n: 3 }], MIYOSHI));
    for (const u of F.fortGun.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 陣と旗・竹束の置き場 ----
    // 堤の後ろの織田の本陣：信長と旗本（信長で遊ぶ時は旗本だけ）。控えは軽い兵で後ろに
    F.campA = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 300, runTo: { x: 0, z: LEVEE_Z + 10 } });
    rt.scene.add(tawara(W, -14, 30, 0.4, 6));
    for (const [x, z, k] of [[-6, 34, 'oda'], [6, 34, 'eiraku'], [-40, 0, 'oda'], [40, 0, 'oda'], [-4, LEVEE_Z + 4, 'oda'], [30, LEVEE_Z + 5, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (let i = 0; i < 4; i++) rt.scene.add(takeTaba(W, PILE.x - 2 + (i % 2) * 2.2, PILE.z + Math.floor(i / 2) * 1.6, 0.1));
    // 堤の上に、はじめから据えてある竹束（鉄砲衆の前）
    for (const x of [22, 28, 34, -34, -26]) { rt.scene.add(takeTaba(W, x, LEVEE_Z - 4, Math.PI)); this.cover(rt, x, LEVEE_Z - 4); }
    // ---- 大軍（軽い作り）：天満の信長の本陣と、囲む織田勢。北の砦の三好勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(-80, 10, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('oda'), 15701);
    DA(84, 6, 40, 12, 260, Math.PI, 0x2b3140, flagTexture('eiraku'), 15702);
    DA(40, 90, 36, 14, 240, Math.PI, 0x2b3140, flagTexture('oda'), 15703);
    DA(0, -92, 50, 14, 260, 0, 0x35382c, flagTexture('miyoshi'), 15704);
    DA(-120, -90, 30, 12, 180, 0.3, 0x35382c, flagTexture('miyoshi'), 15705);
    for (const [x, z] of [[-20, 60], [24, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 野田砦の奥の三好の本陣：三好長逸と旗本（控えは軽い兵）
    F.campB = camp(rt, { x: 40, z: -78, facing: 0, team: 1, faction: 'saito', mon: 'miyoshi', armor: 0x35382c, general: { name: '三好長逸', hat: 'kabuto_m', haori: 0x3a3a2a }, guard: 15, reserve: 240, runTo: { x: 10, z: FORT_Z - 6 } });

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '前田利家と並んで堤の一手を預かる。下知を待て' : '前田利家のもとで、下知を待て', 'main');
    rt.say('前田利家', `${nm(rt)}、川の向こうが三好の野田砦じゃ。砦からも鉄砲を撃ってくる。頭を上げるなよ`, 5);
    rt.say('前田利家', '堤の上に竹束を並べ、鉄砲衆の盾にする。竹束を運べ。弾はよけられぬが、竹はよける', 4.5);
    // 印の前田に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('maeda', unitPos(F.maedaU), '前田利家（話を聞く）', {});
    rt.addInteract('talk', { x: 0, z: LEVEE_Z + 6 }, '前田利家の話を聞く', () => { rt.uninteract('talk'); rt.say('前田利家', 'よし、置き場の竹束を担げ', 2); rt.after(2, () => this.carryStart(rt)); }, { r: 5 });
    rt.after(15, () => this.carryStart(rt));
    // 砦との撃ち合いの音（遠くで絶えず）
    F.shotT = 3;
  },

  // 竹束（弾よけ）の当たり
  cover(rt, x, z) {
    const s = rt.army.addStruct({ seg: [x - 0.9, z, x + 0.9, z], nx: 0, nz: -1, hp: 1e9, maxHp: 1e9, team: 0, name: '竹束' });
    s.noTarget = true;
    return s;
  },

  // ① 竹束を運ぶ
  carryStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('carry');
    rt.unmark('maeda'); rt.uninteract('talk');
    F.spots = SPOTS.map((q) => ({ ...q }));
    rt.obj('main', HI(rt) ? `預かった手の先に立ち、竹束を堤の上へ据えさせよ（${SPOTS.length}つ）` : `竹束を堤の上へ運んで据えよ（${SPOTS.length}つ）`, 'main');
    this.nextPick(rt);
    // 竹束をどこに据えるか（選ばなければ鉄砲衆の前）
    rt.after(2, () => rt.choose('前田「竹束をどこに並べる？」', [
      { label: '堤の真ん中（鉄砲衆の前）', note: '鉄砲衆が撃ち返しやすい' },
      { label: '西寄り（佐々の手の前）', note: '浅瀬の渡り口に近い。打って出る敵を受けやすい' },
    ], (i) => {
      if (i === 1) {
        for (const q of F.spots) q.x -= 16;
        rt.say('前田利家', 'よかろう、浅瀬の口を塞ぐのじゃな。西寄りに並べよ', 3);
        if (F.carry) { const q = F.spots[F.placed]; rt.uninteract('spot'); rt.unzone('spot'); rt.marker('spot', q, '竹束を据える', { h: 2 }); rt.zone('spot', q.x, q.z, 2); rt.addInteract('spot', q, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2 }); }
      } else rt.say('前田利家', 'よし、鉄砲衆の前じゃ', 2.5);
    }, 15));
  },
  // 担いだ竹束を背に見せる
  backTaba(rt, on) {
    const F = rt.flags;
    if (on && !F.backMesh) {
      const m = takeTaba(rt.world, 0, 0, 0);
      m.position.set(0, 0.2, -0.35); m.rotation.set(0.25, 0, 0); m.scale.setScalar(0.62);
      rt.player.u.mesh.add(m);
      F.backMesh = m;
    } else if (!on && F.backMesh) { rt.player.u.mesh.remove(F.backMesh); F.backMesh = null; }
  },
  nextPick(rt) {
    const F = rt.flags;
    rt.marker('pile', PILE, '竹束の置き場', { h: 2 });
    rt.addInteract('pile', PILE, '竹束を担ぐ', () => {
      F.carry = true;
      this.backTaba(rt, true);
      F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
      rt.uninteract('pile'); rt.unmark('pile');
      const s = F.spots[F.placed];
      rt.marker('spot', s, '竹束を据える', { h: 2 });
      rt.zone('spot', s.x, s.z, 2);
      rt.addInteract('spot', s, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2 });
      rt.bark('竹束を担いだ（重くて速くは歩けない）。堤の上の印まで運べ');
    }, { r: 3, hold: 0.8 });
  },
  place(rt) {
    const F = rt.flags;
    const s = F.spots[F.placed];
    rt.uninteract('spot'); rt.unmark('spot'); rt.unzone('spot');
    rt.scene.add(takeTaba(rt.world, s.x, s.z, Math.PI));
    this.cover(rt, s.x, s.z);
    F.carry = false;
    this.backTaba(rt, false);
    F.placed++;
    rt.award((t) => { t.special = { label: '竹束を据えた', pts: 4 * F.placed }; }, '竹束を据えた');
    if (F.placed >= SPOTS.length) this.sallyStart(rt);
    else if (F.placed === 1 && rt.squad.filter((u) => u.alive).length >= 2) {
      // 組のある身分なら、残りは組の者が一束ずつ担いで運ぶ（自分は一往復で済む）
      rt.say('前田利家', '手本は見せた。残りは組の者に担がせよ', 3);
      const sg = rt.squadGroups.find((g) => g.count);
      if (sg) { sg.order = 'move'; sg.dest = { x: F.spots[1].x, z: F.spots[1].z + 3 }; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; }; }
      rt.objProgress('main', `${F.placed}／${SPOTS.length}・組の者が運んでいる`);
      for (let k = F.placed; k < SPOTS.length; k++) rt.after(7 + (k - 1) * 5, () => {
        if (F.step !== 1) return;
        const q = F.spots[k];
        rt.scene.add(takeTaba(rt.world, q.x, q.z, Math.PI));
        this.cover(rt, q.x, q.z);
        F.placed = Math.max(F.placed, k + 1);
        rt.army.play('knock', q, 0.8);
        if (F.placed >= SPOTS.length) { rt.award((t) => t.side.push('組で竹束を並べた'), '組で竹束を並べた'); if (sg) sg.order = 'follow'; this.sallyStart(rt); }
      });
    } else if (F.placed === SPOTS.length - 1) {
      // 最後の一束は前田の手の者が担いで来る（同じ往復を三度させない）
      rt.say('前田利家', 'ようやった。最後の一束はわしの手の者に運ばせる。堤の上で待て', 3);
      rt.objProgress('main', `${F.placed}／${SPOTS.length}・前田の手の者が運んでいる`);
      rt.after(6, () => {
        if (F.step !== 1) return;
        const q = F.spots[SPOTS.length - 1];
        rt.scene.add(takeTaba(rt.world, q.x, q.z, Math.PI));
        this.cover(rt, q.x, q.z);
        F.placed = SPOTS.length;
        rt.army.play('knock', q, 0.8);
        this.sallyStart(rt);
      });
    } else { rt.objProgress('main', `${F.placed}／${SPOTS.length}`); this.nextPick(rt); }
  },

  // ② 浅瀬を渡って三好勢が打って出る
  sallyStart(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('sally');
    F.carry = false; this.backTaba(rt, false);
    for (const id of ['pile', 'spot']) { rt.uninteract(id); rt.unmark(id); }
    rt.unzone('spot');
    rt.objDone('main');
    rt.say('前田利家', 'ようし、竹束が並んだ。鉄砲衆、前へ！　撃ち返せ', 3.5);
    F.teppo.order = 'move'; F.teppo.dest = { x: 0, z: LEVEE_Z - 1 }; F.teppo.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: LEVEE_Z - 1 }; };
    rt.after(7, () => {
      if (F.step !== 2) return;
      F.sally = enemyGroup(rt, { faction: 'saito', name: '打って出た三好勢', anchor: { x: -6, z: -52 }, facing: 0, order: 'attack', seekRange: 70, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7, formation: 'yari' },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], MIYOSHI));
      KIT.backOf(rt, F.sally, { flag: 'miyoshi', armor: 0x33302a, kind: 'spear', w: 22, depth: 12, count: 240, seed: 15707 });
      // 堤の左右でも、浅瀬を渡った三好の大軍と織田の手が堤で押し合う（軽い作り）
      F.lines = lines(rt, [
        { x: -58, z: LEVEE_Z - 8, facing: Math.PI, w: 40, seed: 15708, A: ['oda', 0x2b3140, 420, 'oda'], B: ['miyoshi', 0x33302a, 520, 'saito'], gunsA: true, gunsB: true, surge: { every: 50, count: 140, flank: 0.3 } },
        { x: 60, z: LEVEE_Z - 8, facing: Math.PI, w: 40, seed: 15709, A: ['oda', 0x2b3140, 420, 'oda'], B: ['miyoshi', 0x33302a, 500, 'saito'], gunsB: true, surge: { every: 55, count: 130, flank: 0.3 } },
      ]);
      F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
      sfx('horagai', 0.6);
      rt.army.play('eshout', { x: 0, z: -40 }, 1.6);
      rt.banner('三好勢、打って出る', '浅瀬を渡って、堤の竹束へ寄せてくる');
      rt.obj('main', '浅瀬を渡って打って出た三好勢を、堤の上で退けよ', 'main');
      rt.say('前田利家', '来たな！　堤を下りるな、上で槍を揃えて待て！', 3.5);
      rt.after(5, () => rt.say('前田利家', '堤は高い。浅瀬を上ってくる者は足が止まる。そこを上から突け', 3.5));
      // 一斉射：鉄砲衆は竹束の陰で込めたまま待ち、三好勢が浅瀬を上りきる所で揃えて放つ
      volleyScene(rt, { guns: () => [F.teppo], at: { x: 0, z: LEVEE_Z - 6 }, r: 30, who: '前田利家', shots: 3, wait: 'まだ撃つな……浅瀬を上りきるまで待て',
        banner: ['一斉射', '竹束の陰から、鉄砲衆が揃えて放つ'], clash: () => F.lines });
      rt.zone('levee', 0, LEVEE_Z - 2, 22);
      rt.marker('sally', centerOf(F.sally), () => `打って出た三好勢・${moraleWord(F.sally.morale)}`, { red: true, group: F.sally });
      F.maeda.order = 'hold'; F.maeda.anchor = { x: 0, z: LEVEE_Z - 3 }; F.maeda.aggro = 14;
      F.sassa.order = 'hold'; F.sassa.anchor = { x: -20, z: LEVEE_Z - 3 }; F.sassa.aggro = 14;
    });
  },

  // ②の後の段（昼）：中洲の鉄砲衆・福島砦の別手 → ③へ
  midA(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('sally'); rt.unzone('levee');
    if (F.sally && !gone(F.sally)) { F.sally.noRout = false; F.sally.morale = Math.min(F.sally.morale, 15); }
    if (!late) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    F.sallyDone = true;
    depthStart(rt, ndCtx(rt), ndA(), () => this.night(rt, true));
  },
  // ③の後の段（夜明け）：退く一揆勢を追うか、三好の打って出に備えるか → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2');
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    if (!F.dawn) { F.dawn = true; applyLook(rt, DAWN); }
    rt.award((t) => t.side.push('早鐘の夜、堤を守った'), '早鐘の夜を守った');
    depthStart(rt, ndCtx(rt), ndB(), () => this.win(rt));
  },

  // ③ 夜、本願寺の早鐘
  night(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('night');
    rt.unmark('sally');
    rt.unzone('levee');
    if (!late && !F.sallyDone) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    // 本願寺の側（南東）から寄せる一揆の大群と、堤の東の端の味方が押し合う（軽い作り）
    rt.after(14, () => {
      if (F.ending) return;
      F.lines2 = lines(rt, [{ x: 62, z: 30, facing: Math.PI * 0.25, w: 44, seed: 15710, A: ['oda', 0x2b3140, 380, 'oda'], B: ['namu', IKKO.armor, 640, 'saito'], gunsB: true, surge: { every: 45, count: 160, flank: 0.35 } }]);
      F.lines2.forEach((c) => c.go());
      leanAll(F.lines2, 'B', 0.3);
    });
    // 墨の帯で「その夜」。空を暗くしてから、早鐘
    rt.banner('その夜', '堤の上で、夜番に立つ');
    applyLook(rt, MID);
    rt.after(3, () => { applyLook(rt, NIGHT); rt.banner('本願寺の早鐘', '夜更け、石山から鐘が鳴り、一揆勢が打って出た'); });
    for (let k = 0; k < 8; k++) rt.after(3 + k * 0.9, () => sfx('kane', 0.9 - k * 0.07));
    // 本願寺の台地から、松明を持った門徒の列が下りてくる（遠景）
    F.monto = rt.world.addDistantArmy({ x: HONGAN.x - 26, z: HONGAN.z - 30, w: 30, d: 10, count: 160, facing: -Math.PI * 0.75, armor: IKKO.armor, flagTex: namuTex(), seed: 15706 });
    rt.after(6, () => { if (F.monto.advance) F.monto.advance(50, 70); });
    for (let k = 0; k < 7; k++) rt.after(5 + k * 2, () => { const t = k / 6; rt.world.addFire(HONGAN.x - 40 - t * 50, HONGAN.z - 44 - t * 50, { torch: true, h: 1.5 }); });
    rt.after(4, () => {
      rt.say('足軽', '……あの鐘は、本願寺か？　後ろの方から火が来る！', 3.5);
      rt.say('前田利家', '本願寺が起ったか！　向きを変えよ、堤を背にして、一揆を受け止める！', 4);
      rt.obj('main', HI(rt) ? '春日井の堤の一手を預かり、寄せる一揆勢を退けよ（夜明けまで）' : '春日井の堤を守り、寄せる一揆勢を退けよ（夜明けまで）', 'main');
    });
    // 本願寺の方に篝火
    for (const [x, z] of [[120, 120], [100, 96], [134, 90]]) rt.world.addFire(x, z, { torch: true, h: 1.4 });
    // 夜番の何人かが松明を持つ（組の者と前田の手の足軽）
    rt.after(4, () => { F.torches = carryTorches(rt.world, [...rt.squad.filter((u) => u.alive).slice(0, 2), ...F.maeda.units.filter((u) => u.type === 'ashigaru').slice(0, 3)]); });
    // 味方は堤の上で南東を向く
    for (const [g, x] of [[F.maeda, 6], [F.sassa, -16], [F.teppo, 22]]) { g.order = 'hold'; g.anchor = { x, z: LEVEE_Z + 3 }; g.facing = Math.PI * 0.2; g.aggro = 14; }
    F.waves = [];
    // 一の波が崩れて 10 秒後に二の波（遅くとも 58 秒）。三の波も同じ
    rt.after(12, () => this.wave(rt, 0));
    rt.after(50, () => this.wave(rt, 1));
    rt.after(90, () => this.wave(rt, 2));
  },
  wave(rt, i) {
    const F = rt.flags;
    if (F.ending || F.waves[i]) return;
    // 本願寺の側（南東）の遠くから寄せる
    const [x, z] = [[104, 104], [74, 124], [124, 74]][i];
    const g = enemyGroup(rt, { faction: 'saito', name: ['一揆勢', '一揆勢の新手', '鉄砲を持った門徒'][i], anchor: { x, z }, facing: -Math.PI * 0.8, order: 'attack', seekRange: 120, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0.6, z: 0.8 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', flag: 'sagarifuji' } }, { type: 'ashigaru', n: [16, 14, 10][i] }, { type: 'gun', n: i === 2 ? 5 : 3, o: { flag: 'sagarifuji' } }], IKKO));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
    KIT.backOf(rt, g, { flag: 'namu', armor: IKKO.armor, kind: i === 2 ? 'gun' : 'spear', w: 22, depth: 12, count: 260, seed: 15711 + i });
    F.waves.push(g);
    rt.army.play('eshout', { x, z }, 1.8);
    rt.say('一揆の門徒', ['南無阿弥陀仏、南無阿弥陀仏！', '南無阿弥陀仏！　仏敵の信長を討て！', '夜が明ける前に、堤を取れ！'][i], 3.5);
    g.ikko = true;
    rt.marker('w' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    // 一揆の松明
    for (let k = 0; k < 3; k++) rt.world.addFire(x - 6 + k * 6, z + 6, { torch: true, h: 1.5 });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2');
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines2 || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.world.setTime('morning');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '夜通し堤を守り切った', pts: 20 }; }, '任務達成・堤を守り切った');
    sfx('horagai', 0.6);
    rt.banner('夜が明ける', '堤は守り切った。一揆勢は石山へ退いた');
    rt.say('前田利家', `${nm(rt)}、よう退かなんだ。……じゃが、この戦、まだ終わらぬぞ`, 4.5);
    rt.after(6, () => rt.say('', '――やがて浅井・朝倉が近江の坂本へ出てきた。信長は野田・福島の囲みを解き、兵を返した', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.torches) F.torches.update();
    if (F.ending) return;
    // 砦との撃ち合い（遠くの鉄砲の音と煙）
    // 夜も遠くの撃ち合いは弱く続く（昼も夜も絶えなかったと伝わる）
    if ((F.shotT -= dt) <= 0) {
      const night = F.step >= 3;
      F.shotT = night ? 4 + Math.random() * 6 : 1.2 + Math.random() * 2.5;
      const x = -60 + Math.random() * 120;
      rt.army.play('gun', { x, z: FORT_Z - 1 }, night ? 0.3 : 0.5);
      rt.army.smoke(x, rt.world.heightAt(x, FORT_Z) + 1.4, FORT_Z - 1, 0, 1, 0.6);
    }
    // 竹束を担いでいる間は重くて速く歩けない（前の足どりの六割に）
    if (F.carry && F.carryPrev) {
      const u = rt.player.u;
      u.pos.x = F.carryPrev.x + (u.pos.x - F.carryPrev.x) * 0.6;
      u.pos.z = F.carryPrev.z + (u.pos.z - F.carryPrev.z) * 0.6;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    }
    if (F.carryPrev) { F.carryPrev.x = rt.player.u.pos.x; F.carryPrev.z = rt.player.u.pos.z; }
    // 堤を下りて川の側へ出たら咎める（一度だけ）
    if (F.step === 2 && F.sally && !F.leftLevee && rt.player.u.pos.z < LEVEE_Z - 14) {
      F.levT = (F.levT || 0) + dt;
      if (F.levT > 3) { F.leftLevee = true; rt.violation('堤を下りた', ['前田利家', '堤を下りるなと申したはずじゃ！　上がれ！']); }
    } else F.levT = 0;
    if (F.step === 1) {
      rt.objProgress('main', `${F.placed}／${SPOTS.length}${F.carry ? '・担いでいる' : ''}`);
      // 運びに来ない時は、前田がやり方を言う（担いでいない時だけ。一度）
      if (rt.t - F.stepT > 40 && !F.carry && !F.placed && !F.carryCall) { F.carryCall = true; rt.say('前田利家', `${nm(rt)}、竹束の置き場で「竹束を担ぐ」を長く押し、堤の上の印まで運べ`, 4); }
      if (rt.t - F.stepT > 140 || (rt.t - F.stepT > 90 && !F.placed && !F.carry)) { if (!F.placed) rt.objFail('main'); rt.say('前田利家', 'よい、残りはほかの者が据えた。堤へ上がれ！', 3); F.carry = false; this.backTaba(rt, false); for (let i = F.placed; i < SPOTS.length; i++) { const s = F.spots[i]; rt.scene.add(takeTaba(rt.world, s.x, s.z, Math.PI)); this.cover(rt, s.x, s.z); } F.placed = SPOTS.length; this.sallyStart(rt); }
    }
    if (F.step === 2 && F.sally) {
      rt.objProgress('main', `三好勢 ${F.sally.count}人`);
      if (F.sally.count < 5 && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 20);
      if (gone(F.sally) && !F.nightAt) { F.nightAt = rt.t + 8; rt.say('前田利家', '追うな！　川を渡れば砦の鉄砲の餌食じゃ。堤へ戻れ', 3.5); }
      if (F.nightAt && rt.t > F.nightAt) this.midA(rt);
      else if (rt.t - F.stepT > 130) this.midA(rt, true);
    }
    if (F.step === 3) {
      const left = Math.max(0, 140 - (rt.t - F.stepT));
      const alive = (F.waves || []).reduce((s, g) => s + (gone(g) ? 0 : g.count), 0);
      // 時は刻で見せ、夜明けが近づくと東の空が白む
      const koku = left > 110 ? '丑の刻' : left > 50 ? '寅の刻' : '夜明け前';
      rt.objProgress('main', `一揆勢 ${alive}人・${koku}`);
      if (left <= 50 && !F.dawn) { F.dawn = true; applyLook(rt, DAWN); rt.bark('東の空が白んできた。もう少しじゃ'); }
      if (F.waves[0] && gone(F.waves[0]) && !F.waves[1] && !F.w1Q) { F.w1Q = true; rt.after(10, () => this.wave(rt, 1)); }
      if (F.waves[1] && gone(F.waves[1]) && !F.waves[2] && !F.w2Q) { F.w2Q = true; rt.after(10, () => this.wave(rt, 2)); }
      for (const g of F.waves || []) if (g.count < 5 && !gone(g)) g.morale = Math.min(g.morale, 20);
      if ((F.waves.length >= 3 && F.waves.every(gone)) || left <= 0) this.midB(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 一揆勢は三好の数に入れず、別に数える
    if (v.team === 1 && v.group && v.group.ikko) F.ikkoK = (F.ikkoK || 0) + 1;
    else if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、野田・福島の三好勢 八千ほど。本願寺の一揆勢は数に入れない。数には諸説ある）
nodafukushima.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 8000 - (F.ek || 0) * 30), b0: 8000 };
};
nodafukushima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '三好三人衆', mon: 'miyoshi' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nodafukushima.famous = [
  { name: '下間頼廉', g: /一揆|打って出た/, loose: 1, line: '本願寺の下間頼廉なり！　仏敵信長を討て！' },
];
nodafukushima.date = (rt) => `元亀元年九月十二日　秋・晴・${rt.flags.ending ? '夜明け' : rt.flags.step >= 3 ? '夜' : '昼下がり'}`;
nodafukushima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '竹束の下知まで待つ' : '');
nodafukushima.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// 夕方から夜へ移る途中の色
const MID = { sky: 0x4c4a5c, fog: 0x403e50, sun: 0xd08a64, sunI: 0.85, hs: 0x8c88a4, hg: 0x2a2624, hI: 1.15, top: 0x283048, glow: 0.14, dir: [-0.9, 0.1, 0.3], mount: 0x1c1e26 };
nodafukushima.history = '元亀元年（1570）七月、阿波から渡ってきた三好三人衆（三好長逸・三好宗渭・岩成友通）が、摂津の野田・福島に砦を構えた。八月、織田信長は将軍足利義昭とともに出陣し、天満のあたりに陣を取って砦を囲んだ。織田方には紀伊の根来・雑賀などの鉄砲衆も加わり、敵味方の鉄砲の音が昼も夜も絶えなかったと伝わる。九月十二日の夜、それまで信長と和していた石山本願寺の顕如が門徒に呼びかけて蜂起し、早鐘を撞いて織田の陣を襲った。春日井の堤などで激しい戦いとなり、前田利家が堤の上で踏みとどまって戦ったことが知られる。やがて浅井・朝倉が近江の坂本へ出てきたため、信長は囲みを解いて兵を返した（志賀の陣）。ここから十年にわたる本願寺との戦いが始まる。一揆の旗の「進まば往生極楽、退かば無間地獄」の言葉は、のちの一揆で使われたと伝わるもの。兵の数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nodafukushima.lordAt = { x: 0, z: 40, r: 12, why: '堤の後ろの織田の陣（信長は天満に本陣を置き、野田・福島を囲んだ）' };
nodafukushima.lordSpawn = { x: 0, z: 36, heading: Math.PI };

// 素直な遊び手：竹束を担いで据え、堤の上で三好勢と、夜は一揆勢と戦う
const nearIt = (b, id) => b.interacts.find((x) => x.id === id);
nodafukushima.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 14, 2); return; }
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 12 : 5, (o) => !o.fleeing && o.pos.z > FORT_Z + 2);
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
    const it = nearIt(b, F.carry ? 'spot' : 'pile');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2) { if (F.sally && !gone(F.sally) && F.sally.center().z > -30) { const t = F.sally.center(); goTo(p, inp, t.x, t.z, 2); return; } goTo(p, inp, 2, LEVEE_Z - 2, 2); return; }
  if (F.step === 3) { const t = (F.waves || []).find((g) => !gone(g)); if (t) { const c = t.center(); if (Math.hypot(c.x - 6, c.z - LEVEE_Z) < 50) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, 8, LEVEE_Z + 4, 2); return; }
  const a = F.maedaU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
};

// ---------------- 昼の撃ち合いと、夜明けの段 ----------------
const LV = { x: 0, z: LEVEE_Z - 2 };         // 堤の上の竹束の陰
const BAR = { x: 12, z: -24 };               // 川の中の中洲
const LW = { x: -56, z: LEVEE_Z - 2 };       // 堤の西の端
function ndCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'miyoshi', armor: 0x33302a, dmg: 0.64, look: (l) => dress(l, MIYOSHI), friends: () => [F.maeda].filter((g) => g && g.count), aid: { name: '前田の手の一組', list: [uS(1), uA(8)] }, aidSaid: '前田の手から一組が加わった' };
}
const mon = (list) => dress(list, IKKO);
function ndA() {
  const R = round(LV, Math.PI, 44);
  return [
    rest({ dur: 8, say: [['前田利家', '三好は砦へ逃げ込んだ。……じゃが見よ、中洲に何か動いておる'], ['足軽', '鉄砲衆が中洲に渡った……！']] }),
    pick({ title: '三好の鉄砲衆が川の中洲に出て、堤の竹束を撃ちすくめる。どうする？',
      options: [{ label: '堤を下り、中洲へ斬り込む', note: '鉄砲衆を崩せば、この後の撃ち合いが軽くなる。川の中で砦の鉄砲も浴びる' }, { label: '竹束の陰で、根来・雑賀の鉄砲衆に撃ち返させる', note: '堤の上から動かずに済む。中洲の鉄砲は残り、浅瀬から寄せが来る' }],
      on: (rt, m, i) => { m.ndBar = i === 0; rt.say('前田利家', i === 0 ? 'よし、行け！　込め直しの間に水を渡れ！' : 'よし、竹束の陰じゃ。鉄砲衆、中洲を狙え！', 3); } }),
    fight({ skip: (rt, m) => !m.ndBar, at: BAR, max: 150, title: '中洲', sub: '腰まで水に浸かり、中洲の鉄砲衆へ', obj: '中洲の三好の鉄砲衆を崩せ',
      foes: () => [gunLine('中洲の三好の鉄砲衆', { x: 20, z: -38 }, BAR, 10, { off: { x: 4, z: -6 } }), { name: '中洲を守る三好勢', from: { x: 30, z: -44 }, list: [uS(2), uA(10)], mass: 180 }],
      later: [
        { t: 35, title: '砦の鉄砲', sub: '野田砦の柵から、鉄砲衆が揃って撃つ', say: ['足軽', '砦の柵の鉄砲が、揃えてこちらを向いた……！'], foes: () => [gunLine('砦の柵の鉄砲衆', { x: -10, z: FORT_Z - 4 }, BAR, 10, { off: { x: -14, z: -20 } })] },
        { t: 65, title: '挟まれる', sub: '浅瀬の上と下から、三好勢が中洲へ', say: ['足軽', '上と下の浅瀬から……！　中洲で囲まれる！'], foes: () => [{ name: '上の浅瀬の三好勢', from: { x: -30, z: -40 }, list: [uS(1), uA(10)], mass: 140 }, { name: '下の浅瀬の三好勢', from: { x: 56, z: -36 }, list: [uS(1), uA(10)], mass: 140 }] },
      ],
      reward: (t) => { t.special = { label: '中洲の三好の鉄砲衆を崩した', pts: 20 }; }, rewardLabel: '中洲の鉄砲衆を崩した' }),
    hold({ skip: (rt, m) => m.ndBar, at: LV, dur: 80, r: 14, title: '竹束の撃ち合い', sub: '川を挟んで、昼も夜も鉄砲の音が絶えない', label: '竹束の陰', obj: '竹束の陰を守り、浅瀬を渡ってくる三好勢を叩け',
      waves: [
        { t: 5, say: ['足軽', '中洲の鉄砲が揃えて構えた……伏せろ！'], foes: () => [gunLine('中洲の三好の鉄砲衆', { x: 10, z: -40 }, LV, 11, { off: { x: 10, z: -20 } })] },
        { t: 35, say: ['足軽', '浅瀬を渡ってくる！'], foes: () => [{ name: '浅瀬を渡る三好勢', from: R.front, list: [uS(2), uA(14)], mass: 240 }] },
        { t: 70, say: ['前田利家', '右からも回られる！　竹束を横へも向けよ！'], foes: () => [{ name: '右へ回る三好勢', from: R.fr, list: [uS(1), uA(10)], mass: 160 }] },
      ],
      reward: '竹束の陰を守りぬいた' }),
  ];
}
function ndB() {
  const E = { x: 40, z: 20 };                  // 堤の南東の畦（一揆勢が退く道）
  const R = round(E, Math.PI * 0.25, 44);
  const CUT = { x: 30, z: LEVEE_Z - 1 };        // 一揆の者が切りにかかる堤の東寄り
  const HIGH = { x: 0, z: 14 };                // 陣の後ろの高み
  return [
    // 夜明け前：一揆の者が堤を切り、淀川の水を陣へ入れにかかる（のちに織田の陣は水に浸かったと伝わる）
    rest({ dur: 5, heal: 0.25, say: [['足軽', '……堤の東で、鍬の音がする'], ['前田利家', '堤を切る気か！　水を入れて、陣ごと沈めるつもりじゃ']] }),
    pick({ title: '夜明け前。一揆の者が堤の東を鍬で切り、淀川の水を陣へ入れようとしている。どうする？',
      options: [{ label: '堤の切り口へ走り、切る者を追い払う', note: '水を止められれば大手柄。暗い畦で門徒に囲まれる' }, { label: '陣の者を高みへ上げ、火薬を守る', note: '鉄砲の火薬は濡れない。泥の中で寄せを受ける' }],
      on: (rt, m, i) => { m.ndCut = i === 0; rt.say('前田利家', i === 0 ? '走れ！　鍬を持つ者から突け。切り口を土俵で塞がせる' : 'よし、火薬を担いで上がれ！　濡らした者は鉄砲衆の役に立たぬぞ', 3.5); } }),
    fight({ skip: (rt, m) => !m.ndCut, at: CUT, max: 150, title: '堤の切り口', sub: '鍬を振るう門徒と、それを守る一揆勢',
      obj: (rt) => (HI(rt) ? '預かった手で切り口を押さえ、堤を切る一揆勢を追い払え' : '堤の切り口で、堤を切る一揆勢を追い払え'),
      say: [['前田利家', '鍬を持つ者は槍を持たぬ。守りの門徒を崩せば、あとは逃げる', 4]],
      foes: () => [{ name: '堤を切る一揆勢', from: { x: 52, z: 12 }, flag: 'namu', armor: IKKO.armor, list: mon([uS(2, { hat: 'hachimaki' }), uA(16)]), mass: 240, noRout: 20 }],
      later: [{ t: 40, title: '門徒の新手', sub: '畦の向こうから、南無阿弥陀仏の声', say: ['足軽', 'また来た……切り口を取り返しに来るぞ！'], foes: () => [{ name: '切り口へ寄せる門徒', from: { x: 60, z: 30 }, flag: 'namu', armor: IKKO.armor, list: mon([uS(1, { hat: 'hachimaki' }), uA(12), uG(3)]), mass: 200 }] }],
      reward: (t) => { t.special = { label: '堤を切られずに守った', pts: 20 }; }, rewardLabel: '堤の切り口を守った',
      onEnd: (rt, m, won) => { if (won) rt.say('前田利家', '土俵を積め！　……よし、水は入らぬ', 3); } }),
    hold({ skip: (rt, m) => m.ndCut, at: HIGH, dur: 75, r: 12, title: '水が入る', sub: '堤の切り口から、淀川の水が陣へ流れ込む', label: '陣の高み',
      obj: (rt) => (HI(rt) ? '預かった手を高みに集め、火薬を守って寄せを受けよ' : '陣の高みで火薬を守り、泥を渡ってくる寄せを受けよ'),
      waves: [
        { t: 6, say: ['足軽', '水が来た……！　足が取られる！'], foes: () => [{ name: '泥を渡る一揆勢', from: { x: 40, z: 30 }, flag: 'namu', armor: IKKO.armor, list: mon([uS(2, { hat: 'hachimaki' }), uA(14)]), mass: 220 }] },
        { t: 38, say: ['前田利家', '泥の中の者は足が遅い。上から突き下ろせ！'], foes: () => [{ name: '泥の門徒の新手', from: { x: 30, z: 40 }, flag: 'namu', armor: IKKO.armor, list: mon([uS(1, { hat: 'hachimaki' }), uA(12)]), mass: 180 }] },
      ],
      reward: '水の中で火薬を守りぬいた' }),
    rest({ dur: 8, say: [['足軽', '……夜が明けた。一揆勢が石山の方へ退いていく'], ['前田利家', '退く者の背を追うか。……砦の三好も、こちらを見ておる']] }),
    pick({ title: '夜明け。一揆勢が石山へ退き、野田砦の三好勢が打って出る構えを見せる。どうする？',
      options: [{ label: '退く一揆勢を追い討つ', note: '追い討てば手柄。石山の近くは鉄砲の門徒が多い' }, { label: '堤へ戻り、打って出る三好勢に備える', note: '堤は守れる。三好は最後の力で打って出る' }],
      on: (rt, m, i) => { m.ndChase = i === 0; rt.say('前田利家', i === 0 ? 'よし、追え！　ただし深入りはするな' : 'よし、堤へ戻れ。三好が来るぞ', 3); } }),
    fight({ skip: (rt, m) => !m.ndChase, at: E, max: 150, title: '追い討ち', sub: '石山へ退く一揆勢のしんがりが向き直る', obj: '退く一揆勢のしんがりを崩せ',
      foes: () => [{ name: '一揆勢のしんがり', from: R.front, flag: 'namu', armor: IKKO.armor, list: mon([uS(2, { hat: 'hachimaki' }), uA(14)]), mass: 240 }],
      later: [
        { t: 30, title: '鉄砲の門徒', sub: '石山の側から、鉄砲を持った門徒が並ぶ', say: ['足軽', '門徒の鉄砲が並んだ……！　雑賀の者も混じっておるぞ！'], foes: () => [gunLine('鉄砲を持った門徒', R.fr, E, 10, { flag: 'namu', armor: IKKO.armor, list: mon([uS(1, { hat: 'hachimaki' }), uG(10)]) })] },
        { t: 60, title: '囲まれる', sub: '畦の左右から、門徒が回り込む', say: ['前田利家', '深入りしすぎた……！　左右から来るぞ、退きながら突け！'], foes: () => [{ name: '左の門徒', from: R.left, flag: 'namu', armor: IKKO.armor, list: mon([uS(1, { hat: 'hachimaki' }), uA(10)]), mass: 160 }, { name: '右の門徒', from: R.right, flag: 'namu', armor: IKKO.armor, list: mon([uS(1, { hat: 'hachimaki' }), uA(10)]), mass: 160 }] },
      ],
      reward: (t) => { t.special = { label: '退く一揆勢を追い討った', pts: 20 }; }, rewardLabel: '一揆勢を追い討った' }),
    hold({ skip: (rt, m) => m.ndChase, at: LV, dur: 70, r: 14, title: '三好、打って出る', sub: '野田砦の門が開き、三好勢が浅瀬を渡る', label: '堤の上', obj: '堤の上で、打って出た三好勢を受け止めよ',
      waves: [
        { t: 5, say: ['足軽', '砦の門が開いた……！　一面の三好勢じゃ'], foes: () => [{ name: '砦から出た三好勢', from: { x: 0, z: -56 }, list: [uS(3), uA(16)], mass: 300, noRout: 20 }] },
        { t: 35, say: ['足軽', '砦の柵に火縄の火が並んだ！　竹束の陰へ！'], foes: () => [gunLine('砦の柵の鉄砲衆', { x: 16, z: FORT_Z - 4 }, LV, 11, { off: { x: 10, z: -34 } })] },
      ],
      reward: '砦から打って出た三好勢を受け止めた' }),
  ];
}

export { nodafukushima };
export { namuTex, sagarifujiTex };
