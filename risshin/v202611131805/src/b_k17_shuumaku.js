// 終幕「静かな城下」（docs/finale_spec_1109.md「一生の終幕」・kaito 11/9 夜）。淀の野の数年後、戦の無い日本。
// 主人公は武装していない老人。城下を歩く（操作は残す・戦うボタンは使えない）。周りは商人・子ども・百姓と、老いた家臣たち。
//   ① 屋敷の縁の、古い具足と足軽の頃の槍に触れる → 短い回想（音と一瞬の絵）
//   ② 寺の墓に手を合わせる。生き残った者は名を出し、戦に散った者は墓に名を刻む（遊んだ人の本編の名簿から）
//   ③ 丘に登り、城下を見下ろす。法螺も鉄砲も無く、人の声・風・鐘。一瞬だけ昔の声が蘇り、「天下静謐」→ 暗転 →「戦国立身」
// 字は少なく。右上は今の一行だけ、行き先はピン。重さ：兵は出さない。町の人は十人ほど（本物の人の形）。
import * as THREE from 'three';
import { nobori, hut, solidRect } from './props.js';
import { hondo, shoro, sanmon, ishidan } from './temple_parts.js';
import { STAGES } from './stages.js';
import { allyGroup, nm } from './bhelp.js';
import { buildModel } from './units.js';
import { sfx, stopMusic, playMusic, setScene } from './audio.js';
import { GENERALS } from './units_data.js';
import { rosterNames, flashCuts } from './finale.js';
import { readProgress } from './save_guard.js';
import { S } from './settings.js';

const ID = 'k17_shuumaku';
const HOME = { x: 0, z: 46 };        // 主人公の屋敷（具足と槍は縁側）
const ARMOR = { x: 3.2, z: 41.2 };
const TERA = { x: 0, z: -58 };       // 寺（本堂の前の墓所）
const GRAVE = { x: -12, z: -48 };
const HILL = { x: 30, z: -112 };     // 城下を見下ろす丘の上
const HILL_H = 13;
const STEP_TEXT = ['', '屋敷の縁で、古い具足と槍に触れる', '寺の墓所で、手を合わせる', '丘に登り、城下を見下ろす'];
const STEP_AT = [null, ARMOR, GRAVE, HILL];
const PIN = { x: 0, z: 0, r: 6, hide: 3, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false, label: '' };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sm = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
// 地面：ゆるい起伏と、南西の丘（城下を見下ろす）。通りは平ら
function height(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  const hill = HILL_H * (1 - sm(0, 34, d));
  const roll = 0.6 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 4 * sm(80, 140, Math.abs(x)) + 3 * sm(120, 170, Math.abs(z));
  const street = 1 - sm(5, 14, Math.abs(x));
  return hill + roll * (1 - street * 0.8);
}
// 町の人の姿：具足を着ない小袖（town3d.js の町の人と同じ借り方）
const CLOTH = [0x3b4a5c, 0x5a4a36, 0x4a4238, 0x6a5a44, 0x2e3a4a, 0x5c3e2e, 0x4c5040, 0x7a6a50];
function dress(rt, u, kind, i, face) {
  const col = kind === 'elder' ? [0x4a463e, 0x3e3a34, 0x52483a][i % 3] : CLOTH[(i * 5 + 1) % CLOTH.length];
  const look = {
    ...u.look, sohei: 1, soheiV: 3, monk: 1, tier: 0, hat: kind === 'farmer' && i % 2 ? 'jingasa' : 'none',
    kato: 0xd8d0bc, kesa: col, cloth: col, armor: col, lace: col, kote: 0, sode: false, haori: kind === 'me' ? 0x3a3026 : 0, horo: 0, menpo: 0, tenugui: false,
    saya: kind === 'me' || kind === 'elder', trim: 0, left: null, haramaki: false, pole: false, flag: null, weapon: 'none', uma: null,
    ...(face ? { face } : {}),
  };
  const wasIn = !!u.mesh?.parent;
  if (wasIn) rt.scene.remove(u.mesh);
  buildModel(u, look);
  u.mesh.position.copy(u.pos);
  u.mesh.rotation.y = u.heading || 0;
  u.mesh.scale.setScalar(kind === 'kid' ? 0.62 : kind === 'elder' || kind === 'me' ? 0.92 : 0.95);
  rt.scene.add(u.mesh);
}
// 老いた顔（白髪）。主人公と家臣で使い回す
const OLD = (n) => ({ w: 1, jaw: 1, chin: 1, cheek: 0.9, gaunt: 0.55, brow: 1.1, nose: 1.05, nw: 1, eye: 1, t: 4 + n, hair: 0xd6d1c6, age: 72, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.5, side: 0.2, stub: 0.3, col: 0xd6d1c6 } });
for (let n = 0; n < 4; n++) GENERALS['__rojin' + n] ||= { horo: 0, skin: 0x9a7556, face: OLD(n) };

// キャンバスに名を縦に書いた墓石の面（一つずつ。多くて八つ）
function graveTex(text) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d7a72'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${40 + (i * 37) % 60},${40 + (i * 53) % 50},${36 + (i * 29) % 40},.18)`; g.fillRect((i * 97) % 64, (i * 61) % 256, 2, 2); }
  g.fillStyle = '#2a2722'; g.font = '600 34px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const s = [...text].slice(0, 6);
  s.forEach((ch, i) => g.fillText(ch, 32, 30 + i * 38));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const STONE = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 0.95 });
function grave(rt, x, z, name, rot = 0) {
  const W = rt.world, y = W.heightAt(x, z), grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), STONE); base.position.y = 0.15; grp.add(base);
  const mats = [STONE, STONE, STONE, STONE, typeof document !== 'undefined' && name ? new THREE.MeshStandardMaterial({ map: graveTex(name), roughness: 0.95 }) : STONE, STONE];
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.42), mats); post.position.y = 0.92; grp.add(post);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 4), STONE); cap.position.y = 1.65; cap.rotation.y = Math.PI / 4; grp.add(cap);
  grp.position.set(x, y, z); grp.rotation.y = rot;
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rt.scene.add(grp);
  solidRect(x, z, 0.9, 0.9, rot);
  return grp;
}
// 足軽の頃の槍を掛けた槍掛けと、縁側（床・柱・屋根）
function engawa(rt) {
  const W = rt.world, y = W.heightAt(HOME.x, HOME.z), grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x2e241b, roughness: 0.9 });
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
  add(new THREE.BoxGeometry(9, 0.25, 4), wood, 0, 0.5, -3.4);                // 縁の板
  for (const px of [-4.3, 4.3]) add(new THREE.BoxGeometry(0.2, 3, 0.2), dark, px, 1.8, -1.6);
  add(new THREE.BoxGeometry(10, 0.25, 5.2), dark, 0, 3.35, -3.1).rotation.x = -0.18;   // 庇
  // 槍掛け：二本の柱と横木。足軽の頃の素槍（朱の剥げた柄）
  for (const px of [-3.2, -1.2]) add(new THREE.BoxGeometry(0.12, 2.2, 0.12), dark, px, 1.7, -4.9);
  for (const py of [1.4, 2.3]) add(new THREE.BoxGeometry(2.3, 0.08, 0.1), dark, -2.2, py, -4.8);
  const shaft = add(new THREE.CylinderGeometry(0.025, 0.03, 4.4, 6), new THREE.MeshStandardMaterial({ color: 0x5e2a1c, roughness: 0.85 }), -2.2, 1.9, -4.7);
  shaft.rotation.z = Math.PI / 2;
  const blade = add(new THREE.ConeGeometry(0.035, 0.36, 4), new THREE.MeshStandardMaterial({ color: 0x8a8a86, metalness: 0.6, roughness: 0.4 }), 0.1, 1.9, -4.7);
  blade.rotation.z = -Math.PI / 2;
  grp.position.set(HOME.x, y, HOME.z);
  rt.scene.add(grp);
  solidRect(HOME.x, HOME.z - 4.6, 9, 1.2);
}

const k17_shuumaku = {
  id: ID,
  noKubi: true, noReplay: true, lifeEnd: true,
  missionSingleLine: true, stageGoalsOnly: true, hideGuideSteps: true, noGoalCount: true,
  noFrontFill: true, noCouriers: true, noTaisho: true, noReserve: true, noTaishoRaid: true, noTaishoGuard: true, noHatamotoMass: true,
  frontlineDensity: false, enemyTactics: false, armySignals: false, noWarDrum: true, noWake: true, noPlayerFoot: true,
  nearbyAllySignLimit: 0, compactIntro: true, keepMix: false, noAutoFoeCam: true,
  playerTaken: 0, playerRegen: 1,
  // 戦うボタンは使えない（押しても何も振らない）
  attackAction: () => true,
  missions: STEP_TEXT.slice(1),
  missionOf(rt) { return STEP_TEXT[Math.max(1, rt.flags.step || 1)]; },
  introText: () => '淀の野から数年。もう誰も、戦の支度をしていない。城下を歩く。',
  date: () => '元和の終わり　春・晴・昼　戦の無い城下',
  sides: { a: { name: '城下', mon: 'maru' }, b: { name: '', mon: 'maru' } },
  spawn: { x: 0, z: 34, heading: Math.PI },
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1623, time: 'day', clearAir: true, mood: 'morning', groundHalf: 200, moveLim: 180,
    height, young: true, muddy: 0, patchyGround: false, hatDropRate: 0,
    paths: [{ pts: [[0, 60], [0, -40], [0, -54]], w: 4 }, { pts: [[0, -20], [14, -60], [24, -96], [30, -110]], w: 2.4 }, { pts: [[-30, 10], [30, 10]], w: 3 }],
    clear: (x, z) => Math.abs(x) < 46 && z > -70 && z < 66,
    trees: 160, tufts: 2400, rocks: 40,
    groves: [{ x: -70, z: -30, r: 26, n: 26 }, { x: 70, z: 20, r: 24, n: 22 }, { x: -10, z: -100, r: 18, n: 14 }, { x: 60, z: -130, r: 20, n: 14 }],
    tint(x, z, h, c) { if (Math.abs(x) < 5 && z > -56 && z < 62) c.lerp(new THREE.Color(0.42, 0.37, 0.29), 0.7); },
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ending = false; F.quiet = true;
    stopMusic(1);
    try { setScene({ wind: 0.4, birds: true }); } catch (e) { /* 音が無くても歩ける */ }
    if (typeof document !== 'undefined') {
      document.getElementById('hud')?.classList.add('k17');
      if (!document.getElementById('k17-css')) {
        const st = document.createElement('style'); st.id = 'k17-css';
        st.textContent = '#hud.k17 .bl, #hud.k17 #h-bottom, #hud.k17 #crosshair, #hud.k17 #h-squad, #hud.k17 #armybar, #hud.k17 #h-units, #hud.k17 #situation, #hud.k17 .tl .plaque, #hud.k17 .tl .next, #hud.k17 #h-sides, #hud.k17 .sides { display: none !important; }';
        document.head.appendChild(st);
      }
    }
    // 主人公：具足を脱いだ老人（白髪・小袖に羽織・腰に刀だけ）。動きは少しゆっくり
    const P = rt.player, me = P.u;
    try { dress(rt, me, 'me', 0, 'g:__rojin0'); } catch (e) { /* 着替えられなければ具足のまま歩く */ }
    me.invuln = true;
    // 町：通りの両側の家並み・主人公の屋敷・寺と鐘楼・丘への石段
    const add = (o) => { if (o && o.isObject3D && !o.parent) rt.scene.add(o); return o; };
    for (let z = -36; z <= 28; z += 9) {
      if (Math.abs(z - 10) < 5) continue;
      for (const s of [-1, 1]) add(hut(W, s * 10.5, z, 7, 5.5, s > 0 ? -Math.PI / 2 : Math.PI / 2, { ita: (z / 9 + s) % 2 === 0, thatchTies: true }));
    }
    add(hut(W, HOME.x, HOME.z + 2.2, 12, 6, 0, { ita: true, h: 3.2, wall: 0x6a5c48 }));   // 屋敷の奥
    engawa(rt);
    add(hondo(W, TERA.x, TERA.z - 6, 0));
    add(shoro(W, 14, -54, 0));
    add(sanmon(W, 0, -42, 0));
    add(ishidan(W, 22, -88, 29, -106, 2.6));
    // 昔の家臣の家の幟は立てない。屋敷の門に、主人公の合印の小旗だけ一本
    rt.scene.add(nobori(W, 4.5, 36.5, rt.G.aijirushi || 'maru', 4));
    // 飾りの具足（本物の3Dスキャン・描かない時は置かない）
    if (typeof window !== 'undefined' && !(window.__norender === true || /[?&]norender/.test(location.search))) {
      import('./humans.js').then((H) => H.displayYoroi()).then((g) => {
        if (!g || rt.ended) return;
        g.position.set(ARMOR.x, W.heightAt(ARMOR.x, ARMOR.z) + 0.62, ARMOR.z - 0.8); g.rotation.y = Math.PI; g.scale.setScalar(0.95);
        rt.scene.add(g);
      }).catch(() => {});
    }
    solidRect(ARMOR.x, ARMOR.z - 0.8, 1.2, 1.2);
    // 墓：戦に散った者の名（遊んだ人の本編の名簿から。無ければ手本の名）
    let save = null; try { save = readProgress(S.slot)?.game || null; } catch (e) { save = null; }
    const R = rosterNames(save);
    F.dead = R.dead.length ? R.dead.map((d) => d.name) : ['源太', '弥七', '与平', '孫六'];
    F.alive = R.alive.length ? R.alive.map((a) => a.name) : ['新六', '権兵衛', '藤吉'];
    F.dead.slice(0, 8).forEach((n, i) => grave(rt, GRAVE.x - 4 + (i % 4) * 2.2, GRAVE.z - 3 - Math.floor(i / 4) * 2.4, n, Math.PI));
    // 町の人（武器を持たない）：商人・百姓・子ども。通りを行き来する
    F.walkers = [];
    const civ = (kind, i, at, to) => {
      const g = allyGroup(rt, { name: '町の人', anchor: at, facing: 0, order: 'hold', noRout: true, width: 1, speed: kind === 'kid' ? 1.6 : 1.1, march: false, aggro: 0, seekRange: 0, fixed: true, peaceful: true },
        [{ type: 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
      const u = g.units[0]; if (!u) return null;
      u.name = { merchant: '商人', farmer: '百姓', kid: '子ども', elder: '家臣' }[kind]; u.civ = true; u.noTarget = true;
      try { dress(rt, u, kind, i); } catch (e) { /* 姿が替えられなくても歩く */ }
      F.walkers.push({ g, a: at, b: to, k: 0 });
      return g;
    };
    const kinds = ['merchant', 'farmer', 'kid', 'merchant', 'farmer', 'kid', 'merchant', 'farmer', 'kid', 'farmer'];
    kinds.forEach((k, i) => { const z = 26 - i * 7, x = (i % 2 ? 2.2 : -2.2); civ(k, i, { x, z }, { x: -x, z: z - 30 + (i % 3) * 16 }); });
    // 生き残った老いた家臣（名あり）。屋敷の前で待ち、主人公のあとを少し離れて付いてくる
    F.olds = F.alive.slice(0, 3).map((n, i) => {
      const g = allyGroup(rt, { name: n, anchor: { x: -3 + i * 3, z: 38 }, facing: Math.PI, order: 'hold', noRout: true, width: 1, speed: 1.2, aggro: 0, seekRange: 0, fixed: true, peaceful: true },
        [{ type: 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
      const u = g.units[0];
      if (u) { u.name = n; u.noTarget = true; try { dress(rt, u, 'elder', i, 'g:__rojin' + (1 + i)); } catch (e) { /* なし */ } }
      return g;
    });
    rt.setPhase && rt.setPhase('brief');
    rt.after(1.5, () => this.toStep(rt, 1));
    rt.after(3, () => rt.say(F.alive[0], `${nm(rt)}様、今日はよい日和にござる`, 3.2));
    rt.after(7, () => rt.say('子ども', 'お爺さま、その刀、触ってもええか', 2.8));
    rt.after(10.4, () => rt.say(nm(rt), '……もう、抜くことはあるまい', 2.6));
  },

  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t; F.nearT = 0;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    rt.uninteract && rt.uninteract('touch');
    if (n === 1) rt.addInteract('touch', () => ARMOR, '触れる', () => this.touch(rt), { r: 3, prio: 9 });
    if (n === 2) rt.addInteract('touch', () => GRAVE, '手を合わせる', () => this.pray(rt), { r: 4, prio: 9 });
  },

  // ① 古い具足と槍：触れると短い回想（音と一瞬の絵。字は出さない）
  touch(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.touched) return;
    F.touched = true;
    rt.uninteract && rt.uninteract('touch');
    rt.say(nm(rt), '稲生で握った槍だ。……重かったな', 2.8);
    rt.after(2.6, () => { try { flashCuts([0, 1, 4, 6, 7], 0.75); } catch (e) { /* 描けない時は音だけ */ } });
    rt.after(7.6, () => rt.say(F.alive[0] || '家臣', '桶狭間の雨の日から、ずいぶん歩きましたな', 3));
    rt.after(11, () => this.toStep(rt, 2));
  },
  // ② 墓所：戦に散った者の名を一人ずつ。生き残った家臣が名を告げる
  pray(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.prayed) return;
    F.prayed = true;
    rt.uninteract && rt.uninteract('touch');
    sfx('bell', 0.5);
    const dead = F.dead.slice(0, 3), live = F.alive.slice(0, 2);
    rt.say(nm(rt), `${dead.join('、')}……。ようやく、戦が終わったぞ`, 3.4);
    rt.after(3.8, () => rt.say(live[0] || '家臣', live.length > 1 ? `${live.join('と')}は、まだ生きておりまする` : 'わしは、まだ生きておりまする', 3));
    rt.after(7.4, () => rt.say(nm(rt), '……あの者らの分まで、静かな世を見てやろう', 3));
    rt.after(10.8, () => this.toStep(rt, 3));
  },
  // ③ 丘の上：城下を見下ろす。戦の音は無く、人の声・風・鐘。昔の声が一瞬蘇り、天下静謐 → 暗転 → 戦国立身
  top(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s3');
    F.holdPlayer = true;
    rt.say(nm(rt), '……静かだ', 2.4);
    rt.after(2.8, () => sfx('bell', 0.6));
    rt.after(5, () => { sfx('thunder', 0.18); rt.say('昔の声', '人間五十年、下天のうちをくらぶれば……', 2.6); });
    rt.after(8.2, () => sfx('kyushi', 0.2));
    rt.after(9.5, () => this.curtain(rt));
  },
  // 字幕「天下静謐」→ 暗転 →「戦国立身」
  curtain(rt) {
    if (typeof document === 'undefined') { rt.finish({ scriptedEnd: true }, 1); return; }
    const el = document.createElement('div');
    el.id = 'k17-end';
    el.innerHTML = `<style>#k17-end{position:fixed;inset:0;z-index:50;pointer-events:none;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0);transition:background 4s}
      #k17-end b{font:700 clamp(28px,7vh,48px)/1.3 serif;letter-spacing:.35em;color:#ece4d2;opacity:0;transition:opacity 2s;text-shadow:0 2px 6px #000}</style><b>天下静謐</b>`;
    document.body.appendChild(el);
    rt.flags.endEl = el;
    const b = el.querySelector('b');
    setTimeout(() => { b.style.opacity = '1'; }, 50);
    rt.after(4.5, () => { el.style.background = 'rgba(0,0,0,1)'; b.style.opacity = '0'; });
    rt.after(9, () => { b.textContent = '戦国立身'; b.style.opacity = '1'; try { playMusic('title', { fade: 4 }); } catch (e) { /* なし */ } });
    rt.after(15, () => {
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, '静かな城下を見届けた');
      rt.finish({ scriptedEnd: true }, 0.5);
    });
  },

  onFinish(rt) {
    const el = rt.flags.endEl; if (el) { el.remove(); rt.flags.endEl = null; }
    if (typeof document !== 'undefined') document.getElementById('hud')?.classList.remove('k17');
  },

  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || !F.step) return null;
    const p = STEP_AT[F.step];
    PIN.x = p.x; PIN.z = p.z; PIN.label = ['', '屋敷の縁', '寺の墓所', '丘の上'][F.step];
    return PIN;
  },

  update(rt, dt) {
    const F = rt.flags, me = rt.player.u;
    // 侍大将の試しの出陣で付く組・供（具足の兵）は、戦の無い城下には連れてこない
    if (!F.noSquad) {
      F.noSquad = true;
      const keep = new Set([...(F.walkers || []).map((w) => w.g), ...(F.olds || [])]);
      for (const g of rt.army.groups || []) if (g.team === 0 && !keep.has(g)) for (const u of g.units) if (u !== me && u.alive) rt.army.despawn(u);
      if (rt.squad) rt.squad.length = 0;
    }
    if (!F.step) return;
    // 町の人：二点の間を行き来（走らない）。家臣は主人公のあとを少し離れて付く
    if ((F.wT = (F.wT || 0) - dt) <= 0) {
      F.wT = 1;
      for (const w of F.walkers) { const g = w.g, u = g.units[0]; if (!u || !u.alive) continue; const to = w.k ? w.a : w.b; if (dist(u.pos, to) < 2) w.k ^= 1; g.order = 'attack'; g.anchor = { x: (w.k ? w.a : w.b).x, z: (w.k ? w.a : w.b).z }; g.seekRange = 0; g.aggro = 0; }
      F.olds.forEach((g, i) => { if (!g || !g.units[0]) return; const back = 4 + i * 1.6, side = (i - 1) * 1.8; g.order = 'attack'; g.anchor = { x: me.pos.x + side, z: me.pos.z + back * (F.step >= 2 ? 1 : 1) }; g.seekRange = 0; g.aggro = 0; });
    }
    const at = STEP_AT[F.step];
    if (F.ending || !at) return;
    const d = dist(me.pos, at);
    // 触れずに立っていても、近くで五秒待てば同じ事が起きる（止まらない）
    F.nearT = d < (F.step === 3 ? 7 : 3.5) ? (F.nearT || 0) + dt : 0;
    if (F.step === 1 && F.nearT > 5) this.touch(rt);
    if (F.step === 2 && F.nearT > 5) this.pray(rt);
    if (F.step === 3 && F.nearT > 1.5) this.top(rt);
  },

  // bot：行き先のピンへ歩くだけ
  botBrain(b, inp, { goTo }) {
    const F = b.flags, u = b.player.u;
    if (!F.step || F.ending || !u.alive) return;
    const p = STEP_AT[F.step];
    // 丘へは石段の道を通る（寺の境内から南東へ）
    if (F.step === 3 && u.pos.z > -60 && u.pos.x < 14) { goTo(b.player, inp, 14, -62, 1); return; }
    if (dist(u.pos, p) > 1.6) goTo(b.player, inp, p.x, p.z, 1);
  },
};
k17_shuumaku.history = 'この場面は史実ではない、もしもの戦「元和天下返し」の後の物語である。史実では、元和元年（1615）の大坂夏の陣の後、元号が元和に改まり、戦国の世の大きな合戦は終わった（元和偃武）。';

STAGES[ID] = [[STEP_TEXT[1]], [STEP_TEXT[2], (rt) => (rt.flags.step || 0) >= 2], [STEP_TEXT[3], (rt) => (rt.flags.step || 0) >= 3]];
export { k17_shuumaku };
export default k17_shuumaku;
