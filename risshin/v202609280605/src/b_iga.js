// ======================================================================
// 織田家編　天正伊賀の乱・比自山城（天正九年九月）
// 二年前、北畠（織田）信雄の伊賀攻めは伊賀衆に退けられた。天正九年九月、信長は四万余りを六つの口から伊賀へ入れた。
// 伊賀衆は比自山城・柏原城などに籠もり、夜討ちで織田の陣を悩ませたが、比自山の衆は夜のうちに城を捨てて柏原へ移り、
// 十月、柏原城も開かれて伊賀は平らげられた。
// 足軽は丹羽長秀の手。①夜、陣に忍び込んだ伊賀衆の夜討ち。火をつけられた小屋の火を消し、忍び込んだ者を討つ
// ②夜明け、比自山城の木戸を破る組を守る ③城の内の最後の衆を退ける（城はほとんど空になっていた）
// 向き：北（-z）の山に比自山城。南（+z）に丹羽の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone, more } from './b_inabayama.js';

const CAMP = { x: 0, z: 40 };               // 丹羽の陣
const FORT = { x: 0, z: -90, r: 18 };       // 比自山城（口は南）
const ODA = { flag: 'oda' };
// 伊賀衆：黒っぽい小袖に軽い具足、指物は無し
const IGA = { armor: 0x26241f, lace: 0x3a3a34, cloth: 0x2a2a28, hat: 'hachimaki', flag: null };

function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += 26 * gauss(x, z, FORT.x, FORT.z - 6, 3000) + 30 * gauss(x, z, -150, -60, 8000) + 30 * gauss(x, z, 160, -40, 8000);
  return h;
}
const HF = base(FORT.x, FORT.z);
function height(x, z) {
  const h = base(x, z);
  const k = Math.max(0, Math.min(1, (FORT.r + 5 - Math.hypot(x - FORT.x, z - FORT.z)) / 6));
  return h * (1 - k) + HF * k;
}

const iga = {
  spawn: { x: 6, z: 50, heading: Math.PI },
  world: {
    seed: 15819,
    time: 'dusk',
    autumn: true,
    muddy: 0.25,
    paths: [[[0, 150], [CAMP.x, CAMP.z], [0, -40], [FORT.x, FORT.z + FORT.r]]],
    height,
    clear: (x, z) => (Math.abs(x) < 50 && z > -10 && z < 90) || Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 8 || (Math.abs(x) < 14 && z < 0 && z > -80),
    trees: 640,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 50 && z > -10 && z < 90 ? 0.1 : 1),
    groves: [{ x: -60, z: 30, r: 14, n: 22 }, { x: 60, z: 10, r: 14, n: 22 }],
    fleeOut: (x, z, team) => team === 1 && (z < -125 || Math.abs(x) > 90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.doused = 0;
    // ---- 丹羽の陣：陣幕と小屋 ----
    rt.scene.add(jinmaku(W, CAMP.x, CAMP.z + 16, 18, 10, 5, { mon: 'oda' }));
    F.huts = [[-20, 30, 0.1], [18, 26, -0.2], [-8, 60, 0.2], [26, 56, 0]].map(([x, z, r]) => { const m = hut(W, x, z, 7, 5, r, { wall: 0x6e5a40 }); rt.scene.add(m); return { x, z, m }; });
    rt.scene.add(tawara(W, 4, 34, 0.3, 6), tawara(W, -30, 46, -0.2, 5));
    for (const [x, z, k] of [[-10, 20, 'oda'], [10, 20, 'eiraku'], [-34, 30, 'oda'], [34, 34, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[-4, 44], [14, 40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 比自山城：柵の囲いと木戸 ----
    for (const s of ringWall(rt, FORT.x, FORT.z, FORT.r, { gapAt: 0, gapW: 0.3, team: 1, hp: 1e9, name: '柵', segLen: 5 })) { s.noTarget = true; s.wall = true; }
    const n0 = Math.max(6, Math.round((2 * Math.PI * FORT.r) / 5)), a1 = (2 * Math.PI) / n0;
    const seg = [FORT.x - FORT.r * Math.sin(a1), FORT.z + FORT.r * Math.cos(a1), FORT.x + FORT.r * Math.sin(a1), FORT.z + FORT.r * Math.cos(a1)];
    F.gate = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 1500, maxHp: 1500, armor: 0.2, team: 1, name: '木戸' });
    const dm = new THREE.Mesh(new THREE.BoxGeometry(seg[2] - seg[0] - 0.2, 2.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 0.95 }));
    F.gz = seg[1];
    dm.position.set(FORT.x, W.heightAt(FORT.x, F.gz) + 1.4, F.gz); dm.castShadow = true;
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, FORT.x, F.gz, seg[2] - seg[0] + 0.8, 0), hut(W, FORT.x - 4, FORT.z - 4, 9, 6, 0.1, { wall: 0x5a4a38 }), yagura(W, FORT.x + 8, FORT.z + 6));
    // ---- 丹羽長秀の手（自分の持ち場）、筒井の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 0, z: 36 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: -26, z: 40 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井順慶', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 20, z: 44 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.niwa, F.tsutsui, F.ram];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.78; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 48 }, Math.PI, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-70, 70, 36, 12, 240, Math.PI, 0x2b3140, 'oda', 15811);
    DA(70, 70, 36, 12, 240, Math.PI, 0x2b3140, 'eiraku', 15812);
    DA(-90, -40, 30, 12, 200, Math.PI / 2, 0x2b3140, 'oda', 15813);

    applyLook(rt, NIGHT);
    rt.setPhase('brief');
    rt.obj('main', '陣の見張りにつけ', 'main');
    rt.say('丹羽長秀', `${nm(rt)}、伊賀の者は夜に来る。二年前、信雄様の兵はこれにやられた。火の用心を怠るな`, 5);
    rt.marker('niwa', unitPos(F.niwaU), '丹羽長秀', {});
    rt.after(16, () => this.raid(rt));
  },

  // ① 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('raid');
    rt.unmark('niwa');
    sfx('kane', 0.6);
    rt.banner('夜討ち', '陣の中に伊賀の者が忍び込み、小屋に火をつけた');
    rt.obj('main', '小屋の火を消し、忍び込んだ伊賀衆を討て', 'main');
    rt.say('足軽', '火じゃ！　小屋が燃えておる！', 2.5);
    rt.say('丹羽長秀', '慌てるな！　火を消せ。火の明かりに浮かぶ者を討て！', 3.5);
    const W = rt.world;
    F.fires = [];
    F.huts.slice(0, 3).forEach((h, i) => {
      const f = W.addFire(h.x, h.z, { h: 1.4 });
      F.fires.push(f);
      rt.marker('f' + i, { x: h.x, z: h.z }, '火を消す', { h: 3 });
      rt.addInteract('f' + i, { x: h.x, z: h.z + 3 }, '水を掛けて火を消す', () => this.douse(rt, i), { r: 3.4, hold: 1.8 });
    });
    const mk = (x, z, n2, name) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 6, morale: 80, fleeDir: { x: Math.sign(x) || 1, z: -1 }, dmgMult: 0.66, speed: 2.8 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', flag: null } }, { type: 'ashigaru', n: n2 }], IGA));
      return g;
    };
    F.raiders = [mk(-30, 20, 7, '忍び込んだ伊賀衆'), mk(30, 50, 6, '忍び込んだ伊賀衆')];
    F.raiders.forEach((g, i) => rt.marker('r' + i, centerOf(g), () => `伊賀衆・${moraleWord(g.morale)}`, { red: true, group: g }));
    rt.after(40, () => { if (F.step === 1) { const g = mk(-10, 70, 6, '裏から来た伊賀衆'); F.raiders.push(g); rt.marker('r2', centerOf(g), () => `伊賀衆・${moraleWord(g.morale)}`, { red: true, group: g }); rt.say('足軽', '陣の裏からも！', 2); } });
  },
  douse(rt, i) {
    const F = rt.flags;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fires[i]);
    sfx('wood', 0.4);
    F.doused++;
    rt.award((t) => t.side.push('夜討ちの火を消した'), '火を消した');
  },

  // ② 夜明け、比自山城の木戸
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('gate');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.unmark('r' + i); }
    for (const q of F.raiders || []) if (!gone(q)) q.morale = 0;
    applyLook(rt, DAWN);
    rt.after(1, () => rt.world.setTime('morning'));
    sfx('horagai', 1);
    rt.banner('夜明け', '比自山城へ攻めかかる');
    rt.obj('main', '木戸を破る組を守り、比自山城の木戸を破れ', 'main');
    rt.say('丹羽長秀', '夜討ちの返礼じゃ。城へかかれ！', 3);
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    for (const [g, x] of [[F.niwa, 6], [F.tsutsui, -14]]) { g.order = 'move'; g.dest = { x, z: F.gz + 16 }; g.speed = 2.3; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
    rt.marker('gate', { x: FORT.x, z: F.gz }, () => `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    F.wallBow = enemyGroup(rt, { faction: 'saito', name: '柵の内の伊賀衆', anchor: { x: FORT.x, z: F.gz - 4 }, facing: 0, width: 14, aggro: 34, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'bow', n: 6 }, { type: 'gun', n: 2 }], IGA));
    for (const u of F.wallBow.units) if (u.type === 'gun') u.dmg *= 0.4;
    rt.after(20, () => {
      if (F.step !== 2) return;
      F.sally = enemyGroup(rt, { faction: 'saito', name: '山から下りた伊賀衆', anchor: { x: 30, z: F.gz + 4 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 1, z: -1 }, dmgMult: 0.64, speed: 2.8 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', flag: null } }, { type: 'ashigaru', n: 10 + more(rt) }], IGA));
      F.sally.focus = R.units.find((u) => u.alive) || null;
      rt.army.play('eshout', { x: 30, z: F.gz + 4 }, 1.4);
      rt.say('足軽', '林の中から！　木戸の組が狙われておる！', 3);
      rt.marker('sally', centerOf(F.sally), () => `山から下りた伊賀衆・${moraleWord(F.sally.morale)}`, { red: true, group: F.sally });
    });
  },

  // ③ 城の内
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate'); rt.unmark('sally');
    rt.award((t) => t.side.push('木戸を破った'), '木戸を破った');
    F.wallBow.noRout = false; F.wallBow.morale = 20;
    rt.banner('木戸、破れる', '……城の中は、思いのほか静かだ');
    rt.obj('main', '城の内に残った伊賀衆を退けよ', 'main');
    F.last = enemyGroup(rt, { faction: 'saito', name: '城に残った伊賀衆', anchor: { x: FORT.x, z: FORT.z - 4 }, facing: 0, order: 'attack', seekRange: 50, aggro: 16, width: 10, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
      dress([{ type: 'samurai', n: 3, o: { hat: 'hachimaki', flag: null } }, { type: 'ashigaru', n: 12 + more(rt) }], IGA));
    rt.say('伊賀の侍', '皆は柏原へ移った。……わしらはここで時を稼ぐ', 3.5);
    rt.marker('last', centerOf(F.last), () => `城に残った伊賀衆・${moraleWord(F.last.morale)}`, { red: true, group: F.last });
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 60; }
    F.ram.assault = null;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('last');
    if (F.last && !gone(F.last)) { F.last.noRout = false; F.last.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '比自山城に攻め入った', pts: 20 }; }, '任務達成・比自山城を取った');
    sfx('horagai', 0.6);
    rt.banner('比自山城を取った', '伊賀衆の多くは、夜のうちに柏原城へ移っていた');
    rt.say('丹羽長秀', `……もぬけの殻か。夜討ちも、城を捨てるのも、見事なものよ。${nm(rt)}、侮るなよ、伊賀の者を`, 5);
    rt.after(6, () => rt.say('', '――十月、柏原城も開かれ、伊賀は平らげられた。多くの寺社と村が焼かれたと伝わる', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      const L = F.raiders || [];
      rt.objProgress('main', `火 ${3 - F.doused}か所・伊賀衆 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 火が残ったまま待たせきりにしない：丹羽が場所とやり方を言い、それでも来なければ足軽が消す
      const w = rt.t - F.stepT, foes = L.length >= 3 && L.every(gone);
      if (F.doused < 3 && w > 55 && !F.nudge) { F.nudge = true; rt.say('丹羽長秀', `${nm(rt)}、火がまだ残っておる！　燃える小屋の前で「水を掛けて火を消す」を長く押せ`, 4); }
      if (F.doused < 3 && foes && w > 100 && !F.helped) { F.helped = true; rt.say('足軽', '残りの火は、我らが桶で消しまする！', 3); for (let i = 0; i < 3; i++) if (rt.interacts.some((q) => q.id === 'f' + i)) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.world.removeFire(F.fires[i]); F.doused++; } }
      if ((F.doused >= 3 && foes) || w > 160) this.assault(rt);
    }
    if (F.step === 2) {
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 8, z: F.gz + 30 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
      }
      if (F.sally && F.sally.count < 4 && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 20);
      if (rt.t - F.stepT > 140 && F.gate.alive) rt.army.damage(F.gate, 99999, null);
    }
    if (F.step === 3) {
      rt.objProgress('main', `伊賀衆 ${F.last.count}人`);
      if (F.last.count < 6 && F.last.noRout) { F.last.noRout = false; F.last.morale = Math.min(F.last.morale, 25); }
      if (gone(F.last) || rt.t - F.stepT > 140) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', rt.flags.step >= 2 ? `${g.name}が山へ退いた` : `${g.name}が闇に消えた`, 2.5);
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
    s.mesh.rotation.x = -1.4; s.mesh.position.y -= 1.2; s.mesh.position.z -= 1.4;
    sfx('wood', 1.2);
    this.inside(rt);
  },
};

// 両軍の総勢（織田 四万余り、伊賀衆 一万ほど。数には諸説ある）
iga.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(42000 - (F.ak || 0) * 30), a0: 42000, b: Math.max(0, 10000 - (F.ek || 0) * 40), b0: 10000 };
};
iga.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '伊賀衆', mon: 'maru' } };
iga.date = (rt) => `天正九年九月　秋・${rt.flags.step >= 2 ? '朝' : '夜'}`;
iga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '見張りを始める' : '');
iga.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
iga.history = '伊賀は、一つの大名ではなく、多くの地侍（伊賀衆）が寄り合って治める国だった。天正七年（1579）、信長の子・北畠（織田）信雄は信長に断りなく伊賀へ攻め入り、伊賀衆に退けられて、信長にきつく叱られた。天正九年九月、信長は信雄を大将に、丹羽長秀・滝川一益・筒井順慶・蒲生氏郷らの四万余りを六つの口から伊賀へ入れた（天正伊賀の乱）。伊賀衆は比自山城や柏原城に籠もって夜討ちなどで抵抗したが、比自山の衆は夜のうちに城を捨てて柏原へ移り、十月、柏原城も開かれた。多くの寺社や村が焼かれ、多くの人が殺されたと伝わる。伊賀衆には家の紋の旗が無いので、ここでは指物を立てない姿で描いている。兵の数には諸説ある。';

// 素直な遊び手：火を消し、忍び込んだ者と戦い、木戸の組を守り、城の内で戦う
iga.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, CAMP.x, CAMP.z + 8, 2); return; }
  const inside = F.step >= 3;
  const e = b.army.nearestEnemy(u, F.step === 1 ? 9 : 12, (o) => !o.fleeing && (inside || o.pos.z > F.gz + 0.8 || Math.abs(o.pos.x - FORT.x) > FORT.r + 1));
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
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('f')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); return; }
    const q = (F.raiders || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; }
    return;
  }
  if (F.step === 2) { if (F.sally && !gone(F.sally)) { const c = F.sally.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, 3, F.gz + 7, 2); return; }
  if (F.step === 3) { if (u.pos.z > F.gz + 0.5) { if (Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, F.gz + 3, 1); return; } goTo(p, inp, 0, F.gz - 4, 1); return; } const c = F.last.center(); goTo(p, inp, c.x, c.z, 2); return; }
  goTo(p, inp, CAMP.x + 4, CAMP.z, 3);
};

export { iga };
