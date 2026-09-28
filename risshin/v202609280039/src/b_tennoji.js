// ======================================================================
// 織田家編　天王寺の戦い（天正四年五月七日）
// 石山本願寺を囲む織田方の天王寺砦（明智光秀らが守る）を、本願寺勢一万五千ほどが囲んだ。
// 京にいた信長は、集まっていたわずか三千ほどを率いて駆けつけ、自ら先頭に立って囲みを破った。
// 信長は足に鉄砲の傷を負ったが、砦に入った後、再び打って出て本願寺勢を崩した。
// 足軽は信長の手。①本願寺勢の囲みを突き破る（雑賀の鉄砲の下で） ②天王寺砦の門へ入る
// ③砦から再び打って出て、本願寺勢を崩す
// 向き：北（-z）に天王寺砦、その先の遠くに石山本願寺。南（+z）から信長が来る
// ======================================================================
import { nobori, hut, yagura, tawara, kabukimon, jinmaku } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';
import { namuTex, sagarifujiTex } from './b_nodafukushima.js';

const FORT = { x: 0, z: -62, r: 18 };      // 天王寺砦（口は南）
const HONGAN = { x: 30, z: -230 };          // 石山本願寺（遠く）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'sagarifuji' };

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 上町台地（南北に長い高み）
  h += 6 * Math.exp(-(x * x) / 9000);
  h += 18 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  // 砦は少し高く、平らに
  const d = Math.hypot(x - FORT.x, z - FORT.z);
  h += 1.5 * Math.max(0, Math.min(1, (FORT.r + 4 - d) / 5));
  return h;
}


// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

const tennoji = {
  spawn: { x: 6, z: 120, heading: Math.PI },
  world: {
    seed: 15764,
    time: 'day',
    muddy: 0.3,
    paths: [[[0, 170], [2, 60], [0, FORT.z + FORT.r]]],
    height,
    clear: (x, z) => Math.abs(x) < 70 && z > -100 && z < 150,
    paddy(x, z) {
      if (Math.abs(x) < 50 || z < -80 || z > 170) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    trees: 260,
    tufts: 4200,
    treeDensity: (x, z) => (Math.abs(x) < 80 ? 0.1 : 0.6),
    groves: [{ x: -40, z: 20, r: 10, n: 12 }, { x: 44, z: -10, r: 10, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z < -130 || Math.abs(x) > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    namuTex(); sagarifujiTex();
    // ---- 天王寺砦：柵の囲い（南に口） ----
    for (const s of ringWall(rt, FORT.x, FORT.z, FORT.r, { gapAt: 0, gapW: 0.4, team: 0, hp: 1e9, name: '柵', segLen: 5 })) { s.noTarget = true; s.wall = true; }
    rt.scene.add(kabukimon(W, FORT.x, FORT.z + FORT.r, 7, 0));
    rt.scene.add(hut(W, FORT.x - 4, FORT.z - 4, 10, 6, 0.1, { wall: 0x6a5238 }), yagura(W, FORT.x + 8, FORT.z - 8), yagura(W, FORT.x - 10, FORT.z + 6));
    for (const [x, z, k] of [[FORT.x - 6, FORT.z + 10, 'oda'], [FORT.x + 6, FORT.z + 10, 'akechi'], [FORT.x, FORT.z - 12, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 砦に籠もる明智の手
    F.ake = allyGroup(rt, { name: '明智光秀の手', anchor: { x: FORT.x, z: FORT.z }, facing: 0, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 6 }], ODA));
    // ---- 信長の手（自分はここ） ----
    F.nobu = allyGroup(rt, { name: '信長の手', anchor: { x: 0, z: 112 }, facing: Math.PI, width: 14, aggro: 12, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }], ODA));
    F.nobuU = F.nobu.units[0];
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: -24, z: 118 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: 24, z: 118 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川一益', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.nobu, F.saku, F.taki, F.ake];
    // 苦しい戦：三千で一万五千に当たる。味方の備は並の強さ（手当てしない）
    for (const g of F.oda) { g.defMult = 1.0; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 8, z: 124 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦を囲む本願寺勢 ----
    F.ringA = enemyGroup(rt, { faction: 'saito', name: '囲みの門徒', anchor: { x: -8, z: 10 }, facing: 0, order: 'hold', aggro: 16, width: 18, morale: 90, fleeDir: { x: -0.3, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 3, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 26 + more(rt) }], IKKO));
    F.gunA = enemyGroup(rt, { faction: 'saito', name: '雑賀の鉄砲', anchor: { x: 20, z: -6 }, facing: 0, order: 'hold', aggro: 40, width: 14, morale: 90, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], SAIKA));
    for (const u of F.gunA.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 大軍（軽い作り）：砦を囲む本願寺勢、遠くの石山本願寺 ----
    const nt = flagTexture('namu'), st = flagTexture('sagarifuji');
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    F.hostE = [DA(-60, -70, 20, 40, 260, Math.PI / 2, 0x3a342c, nt, 15761), DA(60, -70, 20, 40, 260, -Math.PI / 2, 0x3a342c, st, 15762), DA(0, -120, 50, 16, 320, Math.PI, 0x3a342c, nt, 15763), DA(-50, -10, 26, 12, 200, 0.4, 0x3a342c, st, 15764)];
    for (const [x, z, w, d] of [[HONGAN.x, HONGAN.z, 18, 11], [HONGAN.x - 26, HONGAN.z + 12, 10, 7]]) rt.scene.add(hut(W, x, z, w, d, 0.3, { h: 3.8, wall: 0x7a5a3c, roof: 0x3a3430 }));
    for (const [x, z] of [[HONGAN.x - 10, HONGAN.z + 22], [HONGAN.x + 12, HONGAN.z + 20]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    rt.scene.add(jinmaku(W, 0, 150, 16, 10, 5, { mon: 'oda' }), tawara(W, 16, 140, 0.3, 5));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '信長公の下知を待て', 'main');
    rt.say('佐久間信盛', '殿、揃うたのは三千ほど。敵は一万五千と聞きまする。……せめて後の者を待たれては', 4.5);
    rt.say('織田信長', '待てば光秀が死ぬ。わしが先に立つ。続け', 3.5);
    rt.marker('nobu', unitPos(F.nobuU), '織田信長', {});
    rt.after(14, () => this.breakIn(rt));
  },

  // ① 囲みを突き破る
  breakIn(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('break');
    rt.unmark('nobu');
    sfx('horagai', 1); rt.after(0.6, () => sfx('taiko', 1));
    rt.banner('かかれ', '砦を囲む本願寺勢を突き破る');
    rt.obj('main', '砦を囲む本願寺勢を突き破れ（雑賀の鉄砲に気をつけよ）', 'main');
    for (const [g, x] of [[F.nobu, 0], [F.saku, -22], [F.taki, 22]]) { g.order = 'attack'; g.seekRange = 60; g.anchor = { x, z: 30 }; }
    F.ringA.order = 'attack'; F.ringA.seekRange = 60;
    rt.marker('ra', centerOf(F.ringA), () => `囲みの門徒・${moraleWord(F.ringA.morale)}`, { red: true, group: F.ringA });
    rt.marker('ga', centerOf(F.gunA), () => `雑賀の鉄砲・${moraleWord(F.gunA.morale)}`, { red: true, group: F.gunA });
    rt.after(20, () => {
      if (F.step !== 1) return;
      rt.army.play('volley', { x: 20, z: -6 }, 1.2);
      rt.say('足軽', '殿が撃たれた！　……足じゃ、足に当たった！', 3.5);
      rt.say('織田信長', '騒ぐな！　かすり傷じゃ。止まるな、砦まで押し通れ！', 3.5);
    });
    rt.after(30, () => {
      if (F.step !== 1) return;
      F.ringB = enemyGroup(rt, { faction: 'saito', name: '囲みの新手', anchor: { x: -40, z: -6 }, facing: Math.PI / 2, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 90, fleeDir: { x: -1, z: -0.5 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 14 + more(rt) }], IKKO));
      rt.army.play('eshout', { x: -40, z: -6 }, 1.5);
      rt.marker('rb', centerOf(F.ringB), () => `囲みの新手・${moraleWord(F.ringB.morale)}`, { red: true, group: F.ringB });
    });
  },

  // ② 砦へ入る
  inFort(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fort');
    for (const id of ['ra', 'ga', 'rb']) rt.unmark(id);
    for (const q of [F.ringA, F.gunA, F.ringB]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('囲みを突き破った'), '囲みを突き破った');
    rt.banner('囲みを破った', '天王寺砦の門へ');
    rt.obj('main', '天王寺砦の門へ入れ', 'main');
    const G = { x: FORT.x, z: FORT.z + FORT.r + 3 };
    rt.marker('gate', G, '天王寺砦', { h: 3 });
    rt.zone('gate', G.x, G.z, 5);
    for (const [g, x] of [[F.nobu, 0], [F.saku, -14], [F.taki, 14]]) { g.order = 'move'; g.dest = { x, z: FORT.z + FORT.r + 8 }; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.gz = G;
  },

  // ②' 籠城：砦に入った所を本願寺勢が三方から押し包む。佐久間・滝川の後詰が門の外で戦ううちに、砦を守り抜け
  siege(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5; F.stepT = rt.t; F.siegeW = [];
    rt.setPhase('siege');
    rt.unmark('gate'); rt.unzone('gate');
    sfx('kane', 0.8);
    rt.banner('囲まれた', '本願寺勢が三方から砦へ押し寄せる');
    rt.say('明智光秀', '殿、門を閉めまする！　……四方から来ますぞ！', 3.5);
    rt.say('織田信長', '柵を背に槍を揃えよ。一刻持てば、敵の息が切れる', 4);
    rt.obj('main', '砦を守り抜け（柵の内の味方を切らすな）', 'main');
    for (const q of [F.nobu, F.ake]) { q.order = 'hold'; q.anchor = { x: FORT.x + (q === F.nobu ? 0 : -4), z: FORT.z + (q === F.nobu ? 4 : -4) }; q.aggro = 12; }
    for (const h of F.hostE) h.advance(24, 30);
    const W3 = [[-FORT.r - 18, 0, '西の門徒', Math.PI / 2], [FORT.r + 18, 0, '東の雑賀衆', -Math.PI / 2], [0, -FORT.r - 22, '北の門徒', 0]];
    W3.forEach(([dx, dz, name, fa], i) => rt.after(4 + i * 22, () => {
      if (F.step !== 2.5) return;
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x: FORT.x + dx, z: FORT.z + dz }, facing: fa, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 95, fleeDir: { x: dx ? Math.sign(dx) : 0, z: -1 }, dmgMult: 0.78 },
        dress(i === 1 ? [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 10 + more(rt) }] : [{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 18 + more(rt) }], i === 1 ? SAIKA : IKKO));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.6;
      F.siegeW.push(g);
      rt.army.play('eshout', { x: FORT.x + dx, z: FORT.z + dz }, 1.6);
      rt.marker('s' + i, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    }));
  },
  loseFort(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('天王寺砦、落ちる', '柵の内の兵が尽き、本願寺勢がなだれ込んだ');
    rt.say('明智光秀', '殿、ここはもう持ちませぬ！　お退きを……！', 4);
    rt.finish({}, 9);
  },

  // ③ 再び打って出る
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('sortie');
    rt.unmark('gate'); rt.unzone('gate');
    rt.say('明智光秀', '殿……！　持ちこたえましたな。このまま籠もって、後の者を待たれては', 4);
    rt.say('織田信長', 'いや、今こそ打って出る。敵は、わしが入ったことで気がゆるんでおる', 4);
    sfx('horagai', 1);
    rt.banner('打って出る', '砦の中の兵とともに、本願寺勢へ');
    rt.obj('main', '砦から打って出て、本願寺勢を崩せ', 'main');
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 90; q.formation = 'line'; }
    F.last = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 16, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, list);
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.last.push(g);
      rt.marker('l' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    mk(-20, -100, '本願寺勢の本隊', dress([{ type: 'samurai', n: 3, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 20 + more(rt) }, { type: 'gun', n: 3, o: { flag: 'sagarifuji' } }], IKKO));
    rt.after(25, () => { if (!F.ending) mk(24, -104, '雑賀の鉄砲衆', dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 8 + more(rt) }], SAIKA)); });
    for (const h of F.hostE) h.retreat(20, 20);
    rt.after(55, () => { if (!F.ending) { mk(-44, -80, '本願寺の新手', dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 16 + more(rt) }], IKKO)); rt.say('足軽', '西からまた門徒が！　きりがない！', 3); } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const h of F.hostE) h.rout({ hideAfter: 40 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '天王寺砦の囲みを破り、打って出た', pts: 20 }; }, '任務達成・本願寺勢を崩した');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('本願寺勢、崩れる', '二千七百余りが討たれ、本願寺勢は石山へ退いた');
    rt.say('織田信長', '……本願寺の木戸まで追え。それより先は深追いするな', 4);
    rt.after(5, () => rt.say('', '――信長は石山のまわりに十の砦を築いて囲んだ。本願寺との戦いは、なお四年続く', 5.5));
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
      const qs = [F.ringA, F.gunA, F.ringB].filter(Boolean);
      rt.objProgress('main', `囲みの兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.ringB && gone(F.ringA) && gone(F.ringB)) || rt.t - F.stepT > 150) this.inFort(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.gz.x, p.z - F.gz.z);
      rt.objProgress('main', `門まで ${Math.max(0, Math.round(d))}m`);
      // 門へ来ない時は、砦の者が呼び、それでも来なければ信長が待たずに打って出る
      if (d >= 5 && rt.t - F.stepT > 22 && !F.gateCall) { F.gateCall = true; rt.say('砦の足軽', `${nm(rt)}殿、こちらじゃ！　南の門を開けてござる、早う中へ！`, 3.5); }
      if (d < 5 || rt.t - F.stepT > 50) this.siege(rt);
    }
    if (F.step === 2.5) {
      // 柵の内の味方（自分・組・信長の手・明智の手）が尽きかけたら落城。三つの寄せを崩すか、95 秒持てば打って出る
      const inFort = rt.army.units.filter((u) => u.alive && u.team === 0 && Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r + 2).length;
      const left = Math.max(0, 95 - (rt.t - F.stepT));
      rt.objProgress('main', `柵の内の味方 ${inFort}人・敵の息が切れるまで ${Math.ceil(left)}秒`);
      for (const q of F.siegeW) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (inFort < 6 && rt.t - F.stepT > 10) this.loseFort(rt);
      else if ((F.siegeW.length >= 3 && F.siegeW.every(gone)) || left <= 0) {
        for (let i = 0; i < 3; i++) rt.unmark('s' + i);
        for (const q of F.siegeW) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 10); }
        survival(rt, '囲まれた砦を守り抜いた');
        this.sortie(rt);
      }
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `本願寺勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 190) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（信長が率いた三千ほどと天王寺砦の兵。本願寺勢 一万五千ほど。数には諸説ある）
tennoji.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(4000 - (F.ak || 0) * 10), a0: 4000, b: Math.max(0, 15000 - (F.ek || 0) * 30 - (F.ending ? 2700 : 0)), b0: 15000 };
};
tennoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '本願寺勢', mon: 'sagarifuji' } };
tennoji.date = () => '天正四年五月七日　夏・晴';
tennoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tennoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tennoji.history = '天正四年（1576）四月、織田信長は石山本願寺を攻めさせたが、五月三日、三津寺を攻めた原田直政が雑賀の鉄砲衆などに討たれ、勢いに乗った本願寺勢一万五千ほどが天王寺砦（明智光秀・佐久間信栄らが守る）を囲んだ。京にいた信長は、急いで集まった三千ほどを率いて駆けつけ、五月七日、自ら先頭に立って囲みを破った。このとき信長は足に鉄砲の傷を負ったと『信長公記』は伝える。砦に入った信長は、そのまま再び打って出て本願寺勢を崩し、二千七百余りを討ったという。こののち信長は本願寺のまわりに砦を築いて囲み、戦いは天正八年まで続いた。兵の数には諸説ある。';

// 素直な遊び手：囲みの兵と戦い、砦の門に入り、打って出て本願寺勢と戦う
tennoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.nobu.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 2 ? 5 : 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { const q = [F.ringA, F.ringB, F.gunA].find((x) => x && !gone(x)); if (q) { const t = q.center(); goTo(p, inp, t.x, t.z, 2); return; } }
  if (F.step === 2) { goTo(p, inp, F.gz.x, F.gz.z, 1.5); return; }
  if (F.step === 3) {
    const q = (F.last || []).find((x) => !gone(x));
    if (q) { const t = q.center(); if (u.pos.z < FORT.z + FORT.r && Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r) { goTo(p, inp, FORT.x, FORT.z + FORT.r + 4, 1); return; } goTo(p, inp, t.x, t.z, 2); return; }
  }
  goTo(p, inp, c.x + 2, c.z + 4, 3);
};

export { tennoji };
