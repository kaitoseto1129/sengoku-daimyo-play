// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、夕方から攻めかかって、夜のうちに落とした。
// 足軽は木下藤吉郎の手。①夕暮れ、夜攻めの松明を灯す ②松明の列について箕作山を登り、坂の守りを退ける
// ③木戸を破る組を守る ④木戸の内で、城将の衆を退ける（観音寺城は戦わずに開かれる）
// ②と③の間・④の後に段（b_depth.js）：左右の尾根の伏兵（火を消して忍ぶか、松明の道で挟まれるか）→和田山の後詰（止めるか、木戸攻めの背を突かれるか）
// →観音寺からの後詰（坂で迎え撃つか、城に火をかけて怯ませるか）。道の左右の山腹では大軍が押し合う（軽い作り）
// 向き：北（-z）が箕作山の城。北東の奥（+x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, hut, kabukimon, yagura, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { applyLook, NIGHT, customFlag, dress, gone, volleyWatch } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';
import { uS, uA, uG, uB, round, gunLine, lines, leanAll, camp } from './b_mid.js';

const C = { x: 0, z: -98 };               // 箕作城の主郭
const R = 18;                              // 主郭の柵の半径
const KAN = { x: 130, z: -196 };           // 観音寺城のある繖山
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], [CAMP.x, CAMP.z], [2, 10], [0, -40], [0, -80], [C.x, C.z]];
const TORCH = [{ x: -10, z: 34 }, { x: 6, z: 28 }, { x: 20, z: 36 }];   // 松明の束
const ODA = { flag: 'oda' };
const RK = { flag: 'rokkaku' };
// 夕暮れから夜へ移る途中の色（松明を灯す間に少しずつ暗くする）
const MID = { sky: 0x4c4a5c, fog: 0x403e50, sun: 0xd08a64, sunI: 0.85, hs: 0x8c88a4, hg: 0x2a2624, hI: 1.15, top: 0x283048, glow: 0.14, dir: [-0.9, 0.1, 0.3], mount: 0x1c1e26 };
// 任務札の段が済んだ事を二秒見せてから、次の札に替える
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：藤吉郎の先手の一隊を預かり、松明の列の先に立って登る
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { rt.objDone('main'); rt.after(2, () => { if (!rt.flags.ending) rt.obj('main', text, 'main'); }); };

// 六角の紋：隅立て四つ目結（四つの目結を菱に並べる）
function rokkakuTex() {
  return customFlag('rokkaku', (g) => {
    g.translate(64, 82); g.scale(43, 43);
    const P = new Path2D();
    const sq = (cx, cy, s) => { P.moveTo(cx, cy - s); P.lineTo(cx + s, cy); P.lineTo(cx, cy + s); P.lineTo(cx - s, cy); P.closePath(); };
    for (const [cx, cy] of [[0, -0.48], [0.48, 0], [0, 0.48], [-0.48, 0]]) { sq(cx, cy, 0.44); sq(cx, cy, 0.19); }
    g.fill(P, 'evenodd');
  });
}

function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.034 + 0.2) * Math.cos(z * 0.029) + 0.3 * Math.sin(z * 0.06 + x * 0.03);
  // 箕作山と、その西の尾根
  h += 34 * gauss(x, z, C.x, C.z - 6, 2400) + 16 * gauss(x, z, -44, -124, 2000) + 12 * gauss(x, z, 40, -130, 1800);
  // 繖山（観音寺城）と、西の和田山
  h += 70 * gauss(x, z, KAN.x, KAN.z, 6000) + 18 * gauss(x, z, -130, -60, 1800);
  return h;
}
const HTOP = base(C.x, C.z);
// 繖山の山腹の六角の本陣（平らに削った段）
const KC = { x: 96, z: -140 };
const KTOP = base(KC.x, KC.z);
function height(x, z) {
  let h = base(x, z);
  const d = Math.hypot(x - C.x, z - C.z);
  const k = Math.max(0, Math.min(1, (R + 6 - d) / 6));
  h = h * (1 - k) + HTOP * k;
  const dk = Math.hypot(x - KC.x, z - KC.z);
  const q = Math.max(0, Math.min(1, (20 - dk) / 8));
  return h * (1 - q) + KTOP * q;
}

// 木戸の扉（二枚。破られると内へ倒れる）
function doors(W, seg) {
  const [ax, az, bx, bz] = seg;
  const w = Math.hypot(bx - ax, bz - az);
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sd * w / 4, 0, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.06, 2.8, 0.16), mat);
    m.position.y = 1.4; m.castShadow = true;
    pv.add(m);
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  const x = (ax + bx) / 2, z = (az + bz) / 2;
  grp.position.set(x, W.heightAt(x, z), z);
  grp.rotation.y = Math.atan2(bz - az, bx - ax) * -1;
  return grp;
}

const mitsukuri = {
  spawn: { x: CAMP.x + 6, z: CAMP.z - 2, heading: Math.PI },
  world: {
    seed: 1568,
    wind: [0.7, 0.7],   // 湖からの夕風
    time: 'dusk',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.15,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      if (h > 10) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.82);
    },
    clear: (x, z) => (Math.abs(x - CAMP.x) < 40 && Math.abs(z - CAMP.z) < 36) || Math.hypot(x - C.x, z - C.z) < R + 8 || (Math.abs(x) < 20 && z < 30 && z > -90),
    // 近江の稲田（刈り入れ前）
    paddy(x, z) {
      if (z < 0 || z > 150 || Math.abs(x - CAMP.x) < 42 || Math.abs(x) > 150) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.6;
    },
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (z > 0 ? 0.2 : 1),
    groves: [{ x: -50, z: 20, r: 12, n: 16 }, { x: 60, z: 30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -110 && Math.abs(x) > 30)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0;
    const rkTex = rokkakuTex();
    // ---- 箕作城の主郭：柵の囲い。口は南の木戸だけ ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.wall = noT(ringWall(rt, C.x, C.z, R, { gapAt: 0, gapW: 0.3, team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    const n0 = Math.max(6, Math.round((2 * Math.PI * R) / 5)), a1 = (2 * Math.PI) / n0;
    // 山城の木戸は狭い（三メートルほど）。口の残りは柵で塞ぐ
    const gzR = C.z + R * Math.cos(a1), side = R * Math.sin(a1);
    const seg = [C.x - 1.5, gzR, C.x + 1.5, gzR];
    noT(wallLine(rt, [[C.x - side, gzR], [C.x - 1.5, gzR]], { team: 1, hp: 1e9, name: '柵', segLen: 4 }));
    noT(wallLine(rt, [[C.x + 1.5, gzR], [C.x + side, gzR]], { team: 1, hp: 1e9, name: '柵', segLen: 4 }));
    F.gate = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 1400, maxHp: 1400, armor: 0.2, team: 1, name: '木戸' });
    F.gate.mesh = doors(W, seg);
    rt.scene.add(F.gate.mesh);
    F.gz = seg[1];
    rt.scene.add(kabukimon(W, C.x, F.gz, 3.8, 0));
    rt.scene.add(hut(W, C.x - 6, C.z - 6, 9, 6, 0.2, { h: 3, wall: 0x6a5238 }), hut(W, C.x + 8, C.z - 2, 6, 4, -0.3));
    rt.scene.add(yagura(W, C.x - 9, C.z + 10), yagura(W, C.x + 10, C.z + 10));
    for (const [x, z] of [[C.x - 4, C.z + 12], [C.x + 5, C.z + 12], [C.x, C.z - 10]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 6));
    // ---- 繖山の観音寺城（遠く）：山腹の屋敷と旗 ----
    for (const [x, z, r] of [[92, -150, 0.3], [104, -160, 0.1], [84, -166, -0.2], [112, -176, 0.4]]) rt.scene.add(hut(W, x, z, 10, 6, r, { h: 3.4, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[82, -146], [108, -156]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 7));
    // 観音寺城の篝火（勝つと、一つ、また一つと消えていく）
    F.kanFires = [[90, -146], [100, -152], [110, -160], [84, -162], [96, -170], [116, -172], [106, -182]].map(([x, z]) => W.addFire(x, z, { h: 0.3 }));
    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、丹羽長秀の手、佐久間信盛の手、木戸を破る組 ----
    F.kino = allyGroup(rt, { name: '木下藤吉郎の手', anchor: { x: CAMP.x, z: CAMP.z - 6 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: CAMP.x - 22, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: CAMP.x + 24, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: CAMP.x + 10, z: CAMP.z + 10 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.kino, F.niwa, F.saku, F.ram];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: CAMP.x + 8, z: CAMP.z + 4 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 陣と旗 ----
    // 織田の本陣：信長と旗本（後ろの大軍が控え。信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: CAMP.x, z: CAMP.z + 22, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: CAMP.x, z: CAMP.z - 6 } });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 16, 0.3, 6));
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 14, 'oda'], [CAMP.x + 8, CAMP.z + 14, 'eiraku'], [CAMP.x - 26, CAMP.z + 4, 'oda'], [CAMP.x + 28, CAMP.z + 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[CAMP.x - 16, CAMP.z + 2], [CAMP.x + 18, CAMP.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const t of TORCH) rt.scene.add(tawara(W, t.x, t.z, 0.5, 2));
    // ---- 大軍（軽い作り）：上洛の織田勢と、繖山の六角勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    const OT = flagTexture('oda'), ET = flagTexture('eiraku');
    DA(-40, 96, 36, 14, 260, Math.PI, 0x2b3140, OT, 15681);
    DA(46, 100, 36, 14, 260, Math.PI, 0x2b3140, ET, 15682);
    DA(0, 140, 50, 14, 300, Math.PI, 0x2b3140, OT, 15683);
    DA(-110, -20, 30, 12, 200, -Math.PI * 0.8, 0x2b3140, OT, 15684);     // 和田山城を抑える手
    // 繖山の山腹の六角の本陣：六角義賢と旗本、後ろに控え（軽い兵）
    F.rkCamp = camp(rt, { x: KC.x, z: KC.z, facing: Math.atan2(C.x - KC.x, C.z - KC.z), team: 1, faction: 'imagawa', mon: 'rokkaku', armor: 0x33291f, general: { name: '六角義賢', hat: 'kabuto_m', haori: 0x33291f }, guard: 15, reserve: 180, runTo: { x: 60, z: -120 } });
    // ---- 坂の守り（六角勢） ----
    F.slope = enemyGroup(rt, { faction: 'imagawa', name: '坂の守り', anchor: { x: 0, z: -56 }, facing: 0, width: 12, aggro: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7, formation: 'yari' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }], RK));
    // 柵の内の弓
    F.archers = enemyGroup(rt, { faction: 'imagawa', name: '柵の内の弓', anchor: { x: C.x, z: F.gz - 4 }, facing: 0, width: 10, aggro: 30, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'bow', n: 6 }], RK));

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の先手の一隊を預かり、夜攻めの下知を待て' : '木下藤吉郎のもとで、夜攻めの下知を待て', 'main');
    rt.say('木下藤吉郎', `${nm(rt)}、見よ。あれが六角の箕作城、奥の山が観音寺城じゃ。申の刻から攻めておるが、まだ落ちぬ`, 5);
    // 台詞の間だけ、二つの城に名の印を出し、目を向ける
    rt.marker('mk1', { x: C.x, z: C.z }, '箕作城', { h: 6 });
    rt.marker('mk2', { x: 98, z: -156 }, '観音寺城（繖山）', { h: 8 });
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: C.x, z: C.z, t: 1.6 }; });
    rt.after(8, () => { rt.unmark('mk1'); rt.unmark('mk2'); });
    // 申の刻から続く攻め：山腹で鉄砲の音と煙、鬨の声が遠く聞こえる
    for (let k = 0; k < 6; k++) rt.after(1.5 + k * 2.2, () => {
      const x = (k % 3 - 1) * 16, z = -60 - (k % 2) * 16;
      rt.army.smoke(x, rt.world.heightAt(x, z) + 1.4, z, 0, 1);
      rt.army.play('gun', { x, z }, 0.8);
      if (k % 2) rt.army.play('eshout', { x, z: z - 10 }, 0.9);
    });
    rt.say('木下藤吉郎', '日が暮れても退かぬ。松明を灯して、夜のうちに攻め上るぞ', 4);
    // 印の藤吉郎に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎（話を聞く）', {});
    rt.addInteract('talk', { x: CAMP.x, z: CAMP.z - 6 }, '藤吉郎の話を聞く', () => { rt.uninteract('talk'); rt.say('木下藤吉郎', 'よし、松明の支度じゃ', 2); rt.after(2, () => this.torches(rt)); }, { r: 5 });
    rt.after(14, () => this.torches(rt));
  },

  // ① 松明を灯す
  torches(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('torch');
    rt.unmark('kino'); rt.uninteract('talk');
    rt.obj('main', rt.G.lord ? `松明に火を移させ、夜攻めの支度を整えよ（${TORCH.length}つ）` : `松明の束に火を移せ（${TORCH.length}つ）`, 'main');
    rt.say('木下藤吉郎', '松明の束に火を移せ！　一人一本ずつ持たせるのじゃ', 3.5);
    // 松明を灯す間に、日が落ちていく
    rt.after(10, () => { if (F.step === 1) applyLook(rt, MID); });
    // 信長で遊ぶ時：松明は足軽が灯す（当主が束に火を移して回る筋にしない）
    if (rt.G.lord) { TORCH.forEach((t, i) => rt.after(4 + i * 3, () => { if (rt.flags.step === 1) this.light(rt, i); })); return; }
    TORCH.forEach((t, i) => {
      rt.marker('t' + i, t, '松明', { h: 2 });
      rt.addInteract('t' + i, t, '松明の束に火を移す', () => this.light(rt, i), { r: 3.4, hold: 1.2 });
    });
  },
  light(rt, i) {
    const F = rt.flags;
    const t = TORCH[i];
    rt.uninteract('t' + i); rt.unmark('t' + i);
    rt.world.addFire(t.x, t.z, { torch: true, h: 0.9 });
    F.lit++;
    // 山すその道に、松明の列が一つずつ伸びていく
    for (let k = 0; k < 2; k++) rt.after(1 + k * 0.8, () => { const x = t.x * 0.6 + (k % 2 ? 3 : -3), z = t.z - 18 - k * 8; rt.world.addFire(x, z, { torch: true, h: 1.6 }); });
    if (F.lit >= TORCH.length) this.climb(rt);
    else rt.objProgress('main', `${F.lit}／${TORCH.length}`);
  },

  // ② 夜の山を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('climb');
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    applyLook(rt, NIGHT);
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('夜攻め', '松明の列が、箕作山を登っていく');
    nextObj(rt, hi(rt) ? '一隊を率いて松明の列の先に立ち、坂の守りを退けよ' : '松明の列について山を登り、坂の守りを退けよ');
    // 組と味方の手の者が松明を掲げて登る（火は手もとに付いて動く）
    this.carryTorches(rt);
    rt.say('木下藤吉郎', 'かかれ！　松明を高く掲げよ。城の者に、山じゅうが織田じゃと思わせるのじゃ', 4);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; gg.anchor = { x, z }; gg.aggro = 14; }; };
    go(F.kino, 0, -40); go(F.niwa, -16, -36); go(F.saku, 16, -36);
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    F.gunK = allyGroup(rt, { name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 4 }], ODA));
    F.gunK.order = 'move'; F.gunK.dest = { x: 6, z: -34 }; F.gunK.speed = 2.3; F.gunK.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 6, z: -34 }; gg.aggro = 4; };
    rt.after(8, () => { if (F.step === 2) rt.say('木下藤吉郎', '坂の守りは槍を揃えて固い。鉄砲で前を崩してから、東の脇へ回って突け', 4.5); });
    F.ram.order = 'move'; F.ram.dest = { x: 8, z: -24 }; F.ram.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 8, z: -24 }; };
    rt.marker('slope', centerOf(F.slope), () => `坂の守り・${moraleWord(F.slope.morale)}`, { red: true, group: F.slope });
    KIT.backOf(rt, F.slope, { flag: 'rokkaku', armor: 0x33291f, kind: 'spear', w: 20, depth: 10, count: 180, seed: 15686 });
    // 道の左右の山腹でも、松明を掲げた織田の大軍と六角勢が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -38, z: -46, facing: Math.PI, w: 30, seed: 15687, A: ['oda', 0x2b3140, 360, 'oda'], B: ['rokkaku', 0x33291f, 320, 'imagawa'], bowsB: true, surge: { every: 55, count: 110, flank: 0.3 } },
      { x: 40, z: -48, facing: Math.PI, w: 30, seed: 15688, A: ['eiraku', 0x2b3140, 360, 'oda'], B: ['rokkaku', 0x33291f, 320, 'imagawa'], surge: { every: 60, count: 110, flank: 0.3 } },
    ]);
    F.lines.forEach((c, i) => rt.after(5 + i * 2, () => c.go()));
    F.slope2Go = () => {
      if (F.step !== 2 || F.slope2) return;
      F.slope2 = enemyGroup(rt, { faction: 'imagawa', name: '尾根から下りた兵', anchor: { x: -30, z: -70 }, facing: Math.PI / 4, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: -0.5, z: -1 }, dmgMult: 0.65 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], RK));
      rt.army.play('eshout', { x: -30, z: -66 }, 1.4);
      rt.say('足軽', '西の尾根から、闇にまぎれて下りてくる！', 3);
      rt.marker('slope2', centerOf(F.slope2), () => `尾根から下りた兵・${moraleWord(F.slope2.morale)}`, { red: true, group: F.slope2 });
    };
    rt.after(26, F.slope2Go);
    // 味方の手の松明（持って登る者の代わりに、道の脇に次々と灯る）
    for (let k = 0; k < 3; k++) rt.after(4 + k * 5, () => { const z = 10 - k * 20; rt.world.addFire(k % 2 ? 10 : -10, z, { torch: true, h: 1.6 }); });
  },

  // 松明を持つ者：組の者と藤吉郎の手の足軽の何人かの手もとに火を付けて、一緒に動かす
  carryTorches(rt) {
    const F = rt.flags, W = rt.world;
    const who = [...rt.squad.filter((u) => u.alive).slice(0, 3), ...F.kino.units.filter((u) => u.alive && u.type === 'ashigaru').slice(0, 4), ...F.niwa.units.filter((u) => u.alive && u.type === 'ashigaru').slice(0, 2)];
    F.carried = who.map((u) => {
      const f = W.addFire(u.pos.x, u.pos.z, { torch: true, h: 2.1 });
      if (f.smoke != null && W.removeSmokeColumn) { W.removeSmokeColumn(f.smoke); f.smoke = null; }
      return { f, u };
    });
  },
  moveTorches(rt) {
    const F = rt.flags, W = rt.world;
    for (const c of F.carried || []) {
      const u = c.u, f = c.f;
      if (!u.alive) { if (!c.gone) { c.gone = true; W.removeFire(f); } continue; }
      const h = u.heading || 0;
      const x = u.pos.x + Math.cos(h) * 0.35, z = u.pos.z - Math.sin(h) * 0.35, y = W.heightAt(x, z) + 2.1;
      f.x = x; f.z = z; f.base = y + f.size * 0.3;
      f.flame.position.set(x, f.base, z); f.inner.position.set(x, f.base - f.size * 0.08, z);
      f.glow.position.set(x, W.heightAt(x, z) + 0.06, z);
      if (f.light) f.light.position.set(x, y + 0.8, z);
    }
  },

  // ②の後の段：夜の山腹（尾根の伏兵・和田山の後詰）→ ③へ
  midA(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('slope'); rt.unmark('slope2');
    for (const q of [F.slope, F.slope2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    if (!late) rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた');
    F.slopeDone = true;
    leanAll(F.lines, 'A', 0.3);
    depthStart(rt, mkCtx(rt), mkA(), () => this.gateFight(rt, true));
  },
  // ④の後の段：観音寺からの後詰 → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 4.5) return;
    F.step = 4.5;
    rt.unmark('boss'); rt.unmark('boss2');
    rt.award((t) => t.side.push('城将の衆を退けた'), '城将の衆を退けた');
    depthStart(rt, mkCtx(rt), mkB(), () => this.win(rt));
  },

  // ③ 木戸を破る
  gateFight(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('slope'); rt.unmark('slope2');
    for (const q of [F.slope, F.slope2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    // 時間切れで先へ進んだ時は手柄に入れない（段を経た時は、段の側で手柄を付けてある）
    if (!late && !F.slopeDone) rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた');
    // 和田山の後詰を止めなかった時は、木戸攻めの背へ後詰が回る
    if ((F.dpMem || {}).mkLetBack) rt.after(40, () => {
      if (F.step !== 3) return;
      const g = enemyGroup(rt, { faction: 'imagawa', name: '和田山からの後詰', anchor: { x: -30, z: -30 }, facing: Math.PI * 0.75, order: 'attack', seekRange: 70, aggro: 14, width: 12, morale: 95, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], RK));
      KIT.backOf(rt, g, { flag: 'rokkaku', armor: 0x33291f, kind: 'spear', w: 20, depth: 10, count: 200, seed: 15689 });
      rt.army.play('eshout', { x: -30, z: -30 }, 1.6);
      rt.say('足軽', '後ろじゃ！　和田山の後詰が、木戸攻めの背へ回った！', 3.5);
      rt.marker('wada', centerOf(g), () => `和田山からの後詰・${moraleWord(g.morale)}`, { red: true, group: g });
    });
    rt.banner('木戸へかかれ', '木戸を破る組が丸太を担いで進む');
    nextObj(rt, '木戸を破る組を守り、木戸を破れ');
    const Rm = F.ram;
    Rm.order = 'assault'; Rm.formation = 'line'; Rm.aggro = 2; Rm.assault = () => (F.gate.alive ? F.gate : null);
    for (const g of [F.kino, F.niwa, F.saku]) { g.order = 'attack'; g.seekRange = 34; }
    rt.marker('gate', { x: C.x, z: F.gz }, () => `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    rt.say('木下藤吉郎', '丸太を持て！　柵の上の弓を狙え、丸太の組を射させるな', 3.5);
    rt.after(18, () => {
      if (F.step !== 3) return;
      const g = enemyGroup(rt, { faction: 'imagawa', name: '打って出た六角勢', anchor: { x: 24, z: -84 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 85, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.65 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], RK));
      g.focus = Rm.units.find((u) => u.alive) || null;
      F.sally = g;
      rt.army.play('eshout', { x: 24, z: -84 }, 1.5);
      rt.say('足軽', '柵の脇の抜け道から、六角の兵が出てきた！　丸太の組を狙っておる！', 3.5);
      rt.marker('sally', centerOf(g), () => `打って出た六角勢・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // ④ 木戸の内
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate'); rt.unmark('sally');
    if (!F.gateForced) rt.award((t) => t.side.push('木戸を破った'), '木戸を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('木戸、破れる', '城将の衆が打ちかかってくる');
    F.archers.noRout = false; F.archers.morale = 30;
    const g = enemyGroup(rt, { faction: 'imagawa', name: '城将 吉田出雲守の衆', anchor: { x: C.x, z: C.z - 2 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, defMult: 1.15 },
      dress([{ type: 'busho', n: 1, o: { name: '吉田出雲守', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }], RK));
    g.units[0].dmg *= 0.6;
    F.boss = g;
    rt.say('吉田出雲守', '箕作は六角の要ぞ！　ここを抜かれては観音寺が持たぬ、押し返せ！', 4);
    rt.say('木下藤吉郎', '内へ押し込め！　夜が明ける前に、この山を落とすのじゃ', 3.5);
    nextObj(rt, '木戸の内で、城将の衆を退けよ');
    rt.marker('boss', centerOf(g), () => `城将の衆・${moraleWord(g.morale)}`, { red: true, group: g });
    for (const q of [F.kino, F.niwa, F.saku, F.ram]) { q.order = 'attack'; q.seekRange = 60; q.formation = 'line'; }
    F.ram.assault = null;
    // 奥の曲輪から新手
    rt.after(22, () => {
      if (F.ending) return;
      F.boss2 = enemyGroup(rt, { faction: 'imagawa', name: '奥の曲輪の兵', anchor: { x: C.x + 6, z: C.z - 12 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], RK));
      rt.army.play('eshout', { x: C.x, z: C.z - 12 }, 1.4);
      rt.say('足軽', '奥からまだ来るぞ！', 2.5);
      rt.marker('boss2', centerOf(F.boss2), () => `奥の曲輪の兵・${moraleWord(F.boss2.morale)}`, { red: true, group: F.boss2 });
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('boss'); rt.unmark('boss2'); rt.unmark('wada');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '夜のうちに箕作城を落とした', pts: 20 }; }, '任務達成・箕作城を落とした');
    for (const q of [F.boss, F.boss2, F.archers, F.sally, F.slope]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    // 城の小屋に火が回る
    rt.world.addFire(C.x - 6, C.z - 4, { h: 1.8 }); rt.world.addSmokeColumn(C.x - 6, HTOP + 6, C.z - 6, { size: 2.6 });
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('箕作城、落ちる', '夜のうちに、六角父子は観音寺城を捨てて甲賀へ落ちた');
    rt.say('木下藤吉郎', `やったぞ、${nm(rt)}！　……見よ、観音寺の山の篝火が、一つ、また一つと消えていく`, 5);
    (F.kanFires || []).forEach((f, i) => rt.after(1.5 + i * 1.1, () => rt.world.removeFire(f)));
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: 98, z: -160, t: 3 }; });
    rt.after(6, () => rt.say('', '――観音寺城は戦わずに開かれ、信長は京への道を開いた', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    this.moveTorches(rt);
    if (F.ending) return;
    if (F.step === 1 && rt.t - F.stepT > 45) {
      // 遅いときは、ほかの者が松明に火を移す
      for (let i = 0; i < TORCH.length; i++) if (rt.interacts.some((q) => q.id === 't' + i)) { rt.uninteract('t' + i); rt.unmark('t' + i); rt.world.addFire(TORCH[i].x, TORCH[i].z, { torch: true, h: 0.9 }); }
      this.climb(rt);
    }
    if (F.step === 2) {
      const qs = [F.slope, F.slope2].filter(Boolean);
      volleyWatch(rt, 'slope', { guns: () => F.gunK, foes: () => qs, r: 28, who: '木下藤吉郎', line: '松明の下に槍が並んだ……鉄砲、放て！', sub: '坂の守りへ、藤吉郎の鉄砲組' });
      if (!F.slope2 && gone(F.slope)) F.slope2Go();   // 坂の守りを早く崩した時は、尾根の兵をすぐ下ろす
      rt.objProgress('main', `坂の守り ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (F.slope2 && qs.every(gone)) this.midA(rt);
      else if (rt.t - F.stepT > 130) this.midA(rt, true);
    }
    if (F.step === 3) {
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        // 次の組は坂の下から駆け上がって来る
        const g = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 6, z: 6 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault', speed: 3.2 },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
        rt.say('木下藤吉郎', '次の者、丸太を拾え！', 2);
      }
      if (rt.t - F.stepT > 140 && F.gate.alive) { F.gateForced = true; rt.army.damage(F.gate, 99999, null); }
    }
    if (F.step === 4) {
      const g = F.boss;
      const b2 = F.boss2;
      rt.objProgress('main', `城将の衆 ${gone(g) ? 0 : g.count}人${b2 ? `・奥の兵 ${gone(b2) ? 0 : b2.count}人` : ''}`);
      if (g.count < 8 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 30); g.units[0].invuln = false; }
      if (b2 && b2.count < 4 && !gone(b2)) b2.morale = Math.min(b2.morale, 20);
      if (gone(g) && b2 && gone(b2)) this.midB(rt);
      else if (rt.t - F.stepT > 140) {
        for (const q of [g, b2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
        // 保険：奥の兵が遅れて出ていない・散り残りが居座る時も、時が経てば城は落ちたものとする
        if (rt.t - F.stepT > 200) this.midB(rt);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; if (k && k.isPlayer) rt.say('足軽', '城将を討ち取ったぞ！', 3); }
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が闇の中へ退いていく！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`木戸がきしむ（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    for (const lv of s.mesh.userData.leaves) { lv.rotation.x = -1.4; lv.position.y = 0.1; }
    sfx('wood', 1.2);
    this.inside(rt);
  },
};

// 両軍の総勢（上洛の織田勢 五万ほど、箕作城の六角勢 三千ほど。数には諸説ある）
mitsukuri.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 40), a0: 50000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
mitsukuri.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '六角軍', mon: 'rokkaku' } };
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・晴・${rt.flags.step >= 2 ? '夜' : '夕暮れ'}`;
mitsukuri.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : '');
mitsukuri.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
mitsukuri.history = '永禄十一年（1568）九月、織田信長は足利義昭を奉じて京へ上る兵を起こした。道をふさぐ南近江の六角義賢（承禎）・義治の父子は従わず、観音寺城と、その支えの和田山城・箕作城に兵を入れた。九月十二日、信長は佐久間信盛・木下藤吉郎・丹羽長秀らに箕作城を攻めさせた。織田勢は夕方から攻めかかり、夜のうちに城を落とした。藤吉郎が数百の松明を灯して夜に攻め上ったという話は、のちの伝えである。箕作城が一日で落ちたのを見て、六角父子はその夜のうちに観音寺城を捨てて甲賀へ落ち、観音寺城は戦わずに開かれた。信長はこのあと京へ入り、義昭は十五代将軍となった。城将の名は伝えによって違い、兵の数にも諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
mitsukuri.lordAt = { x: 4, z: 74, r: 12, why: '箕作の麓の織田の陣（信長は諸将に夜攻めを命じた）' };
mitsukuri.lordSpawn = { x: 4, z: 70, heading: Math.PI };

// 素直な遊び手：松明に火を移し、坂の守りと戦い、木戸では丸太の組を守り、内では城将の衆へ
// ---------------- 夜の山腹と、観音寺からの後詰の段 ----------------
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'imagawa', flag: 'rokkaku', armor: 0x33291f, dmg: 0.64, look: (l) => dress(l, RK), friends: () => [F.kino].filter((g) => g && g.count), aid: { name: '藤吉郎の手の一組', list: [uS(1), uA(8)] }, aidSaid: '藤吉郎の手から一組が加わった' };
}
function mkA() {
  const RD = { x: 0, z: -50 };
  const RR = round(RD, Math.PI, 40);
  return [
    rest({ dur: 8, say: [['木下藤吉郎', '坂の守りは崩れた。……じゃが、左右の尾根が妙に暗い'], ['足軽', '松明を消して潜んでおるのか……']] }),
    pick({ title: '左右の尾根に、六角の兵が松明を消して潜んでいるらしい。どうする？',
      options: [{ label: '松明を消し、西の尾根を忍び登って先に叩く', note: '伏兵を先に崩せば手柄。闇の中で数が読めない' }, { label: '松明を掲げたまま、道を押し登る', note: '山じゅうが織田に見え、城の者が怯える。左右から挟まれる' }],
      on: (rt, m, i) => { m.mkDark = i === 0; rt.say('木下藤吉郎', i === 0 ? '火を消せ。声を立てるな' : 'よし、火を高く掲げよ！　挟まれても槍を揃えよ', 3); } }),
    fight({ skip: (rt, m) => !m.mkDark, at: { x: -16, z: -58 }, max: 150, title: '西の尾根', sub: '闇の尾根で、潜んでいた六角勢とぶつかる', obj: '西の尾根に潜む六角勢を崩せ',
      foes: () => [{ name: '尾根に潜む六角勢', from: { x: -40, z: -76 }, list: [uS(2), uA(12), uB(3)], mass: 180 }],
      later: [{ t: 35, title: '東の尾根', sub: '東の尾根の伏兵が、道の味方へ下りる', say: ['足軽', '東の尾根からも下りた……藤吉郎様の手が挟まれる！'], foes: () => [{ name: '東の尾根の六角勢', from: { x: 34, z: -60 }, list: [uS(1), uA(10)], mass: 150 }] }],
      reward: (t) => { t.special = { label: '闇の尾根で伏兵を崩した', pts: 20 }; }, rewardLabel: '尾根の伏兵を崩した' }),
    hold({ skip: (rt, m) => m.mkDark, at: RD, dur: 80, r: 13, title: '松明の道', sub: '左右の尾根から、闇の中の六角勢が下りる', label: '松明の道', obj: '松明の道で踏みとどまり、左右から寄せる六角勢を退けよ',
      waves: [
        { t: 5, say: ['足軽', '右の尾根から来た！'], foes: () => [{ name: '右の尾根の六角勢', from: RR.right, list: [uS(2), uA(12)], mass: 180 }] },
        { t: 30, say: ['足軽', '左からも……挟まれた！'], foes: () => [{ name: '左の尾根の六角勢', from: RR.left, list: [uS(2), uA(12)], mass: 180 }] },
        { t: 55, say: ['足軽', '柵の前に鉄砲が並んだ……！　松明を狙っておる！'], foes: () => [gunLine('柵の前の六角の鉄砲組', RR.front, RD, 8)] },
      ],
      reward: '松明の道を守りぬいた' }),
  ];
}
function mkB() {
  const OG = { x: C.x, z: C.z + R + 10 };      // 木戸の外の坂の上
  return [
    rest({ dur: 8, say: [['木下藤吉郎', '城は取った！　……じゃが見よ、観音寺の山から松明の列が下りてくる'], ['足軽', '後詰か……！　夜が明けるまでに取り返しに来る気じゃ']] }),
    pick({ title: '観音寺城から六角の後詰が、箕作を取り返しに来る。どうする？',
      options: [{ label: '木戸の外へ打って出て、坂で迎え撃つ', note: '坂の上から叩けば手柄。坂の左右から回り込まれる' }, { label: '城に火をかけ、観音寺の衆に見せつける', note: '箕作が落ちたと見せれば、後詰の足が鈍る。燃える城の前を守る' }],
      on: (rt, m, i) => { m.mkOut = i === 0; rt.say('木下藤吉郎', i === 0 ? '打って出る。坂の上で待ち構えよ！' : '火をかけよ！　観音寺から見えるように、高く燃やせ', 3); if (i === 1) { rt.world.addFire(C.x + 8, C.z - 2, { h: 1.6 }); rt.world.addSmokeColumn(C.x + 8, rt.world.heightAt(C.x, C.z) + 6, C.z - 2, { size: 2.4 }); } } }),
    fight({ skip: (rt, m) => !m.mkOut, at: { x: C.x + 4, z: C.z + R + 24 }, max: 160, title: '坂の迎え撃ち', sub: '観音寺からの後詰が、夜の坂を上る', obj: '坂で、観音寺からの後詰を崩せ',
      foes: () => [{ name: '観音寺からの後詰', from: { x: 40, z: -40 }, list: [uS(3), uA(14)], mass: 260, noRout: 20 }, gunLine('後詰の鉄砲衆', { x: 36, z: -60 }, { x: C.x + 4, z: C.z + R + 24 }, 9)],
      later: [{ t: 45, title: '回り込む', sub: '後詰の別手が、坂の下へ回る', say: ['足軽', '下からも来た……！　城へ戻る道を断たれるぞ！'], foes: () => [{ name: '坂の下へ回った後詰', from: { x: -14, z: -40 }, list: [uS(2), uA(10)], mass: 160 }] }],
      reward: (t) => { t.special = { label: '観音寺からの後詰を坂で崩した', pts: 25 }; }, rewardLabel: '観音寺の後詰を崩した' }),
    hold({ skip: (rt, m) => m.mkOut, at: OG, dur: 90, r: 12, title: '燃える箕作', sub: '燃える城を見て、後詰の足が鈍る', label: '木戸の前', obj: '燃える城の木戸の前を守れ',
      waves: [
        { t: 8, say: ['足軽', '後詰の先が来た……じゃが、数は少ない'], foes: () => [{ name: '観音寺からの後詰の先', from: { x: 40, z: -44 }, list: [uS(2), uA(10)], mass: 160 }] },
        { t: 45, say: ['足軽', '鉄砲を撃ちかけてくる！'], foes: () => [gunLine('後詰の鉄砲組', { x: 30, z: -56 }, OG, 7)] },
      ],
      reward: '城に火をかけ、観音寺の後詰を怯ませた', onEnd: (rt, m, won) => { if (won) rt.say('木下藤吉郎', '見よ、観音寺の松明が退いていく……燃える箕作を見て、気が萎えたか', 4); } }),
  ];
}

const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
mitsukuri.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, F.step >= 3 ? -46 : -10, 2); return; }
  const inside = F.step >= 4;
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (inside || o.pos.z > F.gz + 0.8 || Math.abs(o.pos.x - C.x) > R + 1));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { const q = nearIt(b, 't'); if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); } return; }
  if (F.step === 2) { const q = [F.slope, F.slope2].find((x) => x && !gone(x)); const t = q ? q.center() : { x: 0, z: -60 }; goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 3) { if (F.sally && !gone(F.sally)) { const t = F.sally.center(); goTo(p, inp, t.x, t.z, 2); return; } goTo(p, inp, 3, F.gz + 7, 2); return; }
  if (F.step === 4) { if (u.pos.z > F.gz + 1) { goTo(p, inp, 0, F.gz - 3, 1); return; } const q = [F.boss, F.boss2].find((x) => x && !gone(x)); const t = q ? q.center() : C; goTo(p, inp, t.x, t.z, 2); return; }
  const a = F.kinoU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
};

export { mitsukuri };
