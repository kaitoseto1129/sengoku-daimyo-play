// ======================================================================
// 織田家編　天王寺の戦い（天正四年五月七日）
// 石山本願寺を囲む織田方の天王寺砦（明智光秀らが守る）を、本願寺勢一万五千ほどが囲んだ。
// 京にいた信長は、集まっていたわずか三千ほどを率いて駆けつけ、自ら先頭に立って囲みを破った。
// 信長は足に鉄砲の傷を負ったが、砦に入った後、再び打って出て本願寺勢を崩した。
// 足軽は信長の手。①本願寺勢の囲みを突き破る（雑賀の鉄砲の下で） ②天王寺砦の門へ入る
// ③砦から再び打って出て、本願寺勢を崩す
// 向き：北（-z）に天王寺砦、その先の遠くに石山本願寺。南（+z）から信長が来る
// ======================================================================
import { nobori, hut, yagura, tawara, kabukimon, jinmaku, dou, dorui, village, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';
import { namuTex, sagarifujiTex } from './b_nodafukushima.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, pick, fight, hold, move, depthBot } from './b_depth.js';
import { camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FORT = { x: 0, z: -62, r: 18 };      // 天王寺砦（口は南）
const HONGAN = { x: 30, z: -230 };          // 石山本願寺（上町台地の北の端の方）
const SHITEN = { x: 52, z: 6 };             // 四天王寺（戦国期の伽藍。東大門は石山合戦で焼けた、の設定で門は置かない）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'sagarifuji' };
const MOAT_R = FORT.r + 3;   // 砦の堀（南の木戸の所だけ開けておく）

function moatDip(x, z) {
  const dx = x - FORT.x, dz = z - FORT.z, d = Math.hypot(dx, dz);
  const gateD = Math.abs(((Math.atan2(dx, dz) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (gateD < 0.3) return 0;
  const ring = Math.abs(d - MOAT_R), width = 3.2, depth = 1.1;
  if (ring >= width / 2) return 0;
  const u = ring / (width / 2);
  return -depth * (1 - u * u);
}

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 上町台地：崖線は x=-26 の辺り（西・北西は低地、天王寺側は高台）
  const cliff = 1 / (1 + Math.exp(-(x + 26) * 0.35));
  h += 7 * cliff;
  const nw = Math.max(0, Math.min(1, (-88 - z) / 60)) * Math.max(0, Math.min(1, (6 - x) / 60));
  h -= 3 * nw;   // 北西はさらに低く・湿地がち
  h += 18 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  // 砦は少し高く、平らに
  const d = Math.hypot(x - FORT.x, z - FORT.z);
  h += 1.5 * Math.max(0, Math.min(1, (FORT.r + 4 - d) / 5));
  h += moatDip(x, z);
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
    // ---- 天王寺砦：原田直政が築いた付城。土塁付きの柵の囲い（南に口）・堀・門・櫓・兵舎・本陣 ----
    const fortSegs = ringWall(rt, FORT.x, FORT.z, FORT.r, { gapAt: 0, gapW: 0.4, team: 0, hp: 1e9, name: '柵', segLen: 5 });
    const db = makeSimpleBatch();
    for (const s of fortSegs) {
      s.noTarget = true; s.wall = true;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const nl = Math.hypot(mx - FORT.x, mz - FORT.z) || 1;
      const d = dorui(W, s.seg, (mx - FORT.x) / nl, (mz - FORT.z) / nl, { batch: db, w: 2.6, h: 0.8 });
      if (!d.isBatchedPart) rt.scene.add(d);
    }
    finalizeSimpleBatch(rt, db);
    rt.scene.add(kabukimon(W, FORT.x, FORT.z + FORT.r, 7, 0));
    rt.scene.add(hut(W, FORT.x - 4, FORT.z - 4, 10, 6, 0.1, { wall: 0x6a5238 }), yagura(W, FORT.x + 8, FORT.z - 8), yagura(W, FORT.x - 10, FORT.z + 6));
    rt.scene.add(jinmaku(W, FORT.x + 3, FORT.z - 1, 6, 4, 0));   // 砦の中の明智の本陣（陣幕）
    for (const [x, z, k] of [[FORT.x - 6, FORT.z + 10, 'oda'], [FORT.x + 6, FORT.z + 10, 'akechi'], [FORT.x, FORT.z - 12, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 四天王寺（戦国期の伽藍。周りを含む広い区域の目印。東大門は石山合戦で焼けた設定で門は置かない） ----
    rt.scene.add(dou(W, SHITEN.x, SHITEN.z, 9, 6.5, Math.PI, { h: 3.6 }), hut(W, SHITEN.x + 16, SHITEN.z - 4, 7, 5, Math.PI, { wall: 0x7a5a3c }));
    rt.scene.add(nobori(W, SHITEN.x - 10, SHITEN.z + 8, 'oda', 5));
    // ---- 西の低地の集落 ----
    rt.scene.add(village(W, -72, 48, { n: 6, r: 16, seed: 1576 }));
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
    // 苦しい戦：三千で一万五千に当たる。味方の備は少しだけ固く（苦しいが勝てる）
    for (const g of F.oda) { g.defMult = 1.1; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 8, z: 124 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦を囲む本願寺勢 ----
    F.ringA = enemyGroup(rt, { faction: 'saito', name: '囲みの門徒', anchor: { x: -8, z: 10 }, facing: 0, order: 'hold', aggro: 16, width: 18, morale: 90, fleeDir: { x: -0.3, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 3, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 26 + more(rt) }], IKKO));
    F.gunA = enemyGroup(rt, { faction: 'saito', name: '雑賀の鉄砲', anchor: { x: 20, z: -6 }, facing: 0, order: 'hold', aggro: 40, width: 14, morale: 90, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1, o: { name: '土橋守重' } }, { type: 'gun', n: 10 }], SAIKA));
    for (const u of F.gunA.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 大軍（軽い作り）：砦を囲む本願寺勢、遠くの石山本願寺 ----
    const nt = flagTexture('namu'), st = flagTexture('sagarifuji');
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    F.hostE = [DA(-60, -70, 20, 40, 260, Math.PI / 2, 0x3a342c, nt, 15761), DA(60, -70, 20, 40, 260, -Math.PI / 2, 0x3a342c, st, 15762), DA(0, -120, 50, 16, 320, Math.PI, 0x3a342c, nt, 15763), DA(-84, -22, 26, 12, 200, 0.9, 0x3a342c, st, 15764)];
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 16, 10, 0.3, { h: 4.2 }), hut(W, HONGAN.x - 26, HONGAN.z + 12, 10, 7, 0.3, { h: 3.8, wall: 0x7a5a3c, roof: 0x3a3430 }));   // 本願寺の御影堂（瓦の大屋根）と庫裏
    for (const [x, z] of [[HONGAN.x - 10, HONGAN.z + 22], [HONGAN.x + 12, HONGAN.z + 20]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    rt.scene.add(tawara(W, 16, 140, 0.3, 5));
    // 信長の本陣（信長は自ら先に立つので、陣には旗本が残る）と、石山本願寺の顕如の陣所
    F.honjin = camp(rt, { x: 0, z: 150, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 200, runTo: { x: 0, z: 112 } });
    F.honjin.guard.name = '信長の旗本';
    F.ehon = camp(rt, { x: HONGAN.x + 32, z: HONGAN.z + 2, facing: 0, team: 1, faction: 'saito', mon: 'sagarifuji', armor: 0x3a342c, general: { name: '本願寺顕如', hat: 'hachimaki', haori: 0x4a4236 }, guard: 15, reserve: 400, runTo: { x: 0, z: -120 } });

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を率い、信長公の下知を待て' : '信長公の下知を待て', 'main');
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
    rt.obj('main', HI(rt) ? '先手の一手を率い、砦を囲む本願寺勢を突き破れ（雑賀の鉄砲に気をつけよ）' : '砦を囲む本願寺勢を突き破れ（雑賀の鉄砲に気をつけよ）', 'main');
    for (const [g, x] of [[F.nobu, 0], [F.saku, -22], [F.taki, 22]]) { g.order = 'attack'; g.seekRange = 60; g.anchor = { x, z: 30 }; }
    F.ringA.order = 'attack'; F.ringA.seekRange = 130;   // 囲みの門徒も押し出してくる（長く歩かせない）
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

  // 段を重ねる（b_depth.js）：A 囲みの二重（砦へ入る前）→ B 二度目の総攻め（砦の中）→ C 木戸への追い討ち
  // 信長で遊ぶ時は、もとの流れのまま（段は足軽の目の戦）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = which;
    for (const id of ['ra', 'ga', 'rb', 's0', 's1', 's2']) rt.unmark(id);
    depthStart(rt, tnCtx(rt, which), which === 'A' ? tnA() : which === 'B' ? tnB() : tnC(), () => { F.dpOn = false; then(); });
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
    rt.after(5, () => rt.say('明智光秀', '鉄砲はまだ撃たせませぬ。柵まで引きつけて、一度に放ちまする。崩れた所を槍で突かれよ', 4.5));
    F.fgun = allyGroup(rt, { name: '砦の鉄砲組', anchor: { x: FORT.x, z: FORT.z - 2 }, facing: 0, width: 14, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    volleyAt(rt, { guns: () => [F.fgun, F.ake], foes: () => F.siegeW, who: '明智光秀', near: 28, drop: 30, max: 40, say: '柵まで来たぞ……放てぇっ！', line: '砦の鉄砲がそろって火を吹いた。門徒の前の列が崩れる' });
    rt.obj('main', HI(rt) ? '砦の柵の一手を預かり、守り抜け（柵の内の味方を切らすな）' : '砦を守り抜け（柵の内の味方を切らすな）', 'main');
    for (const q of [F.nobu, F.ake]) { q.order = 'hold'; q.anchor = { x: FORT.x + (q === F.nobu ? 0 : -4), z: FORT.z + (q === F.nobu ? 4 : -4) }; q.aggro = 12; }
    for (const h of F.hostE) h.advance(24, 30);
    const W3 = [[-FORT.r - 18, 0, '西の門徒', Math.PI / 2], [FORT.r + 18, 0, '東の雑賀衆', -Math.PI / 2], [0, -FORT.r - 22, '北の門徒', 0]];
    W3.forEach(([dx, dz, name, fa], i) => rt.after(4 + i * 2, () => {   // 三方の寄せは一度に来る
      if (F.step !== 2.5) return;
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x: FORT.x + dx, z: FORT.z + dz }, facing: fa, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 95, fleeDir: { x: dx ? Math.sign(dx) : 0, z: -1 }, dmgMult: 0.68 },
        dress(i === 1 ? [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 10 + more(rt) }] : [{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 18 + more(rt) }], i === 1 ? SAIKA : IKKO));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.6;
      F.siegeW.push(g);
      rt.army.play('eshout', { x: FORT.x + dx, z: FORT.z + dz }, 1.6);
      rt.marker('s' + i, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      if (i !== 1) KIT.backOf(rt, g, { flag: i ? 'namu' : 'sagarifuji', armor: 0x3a342c, kind: 'spear', w: 16, depth: 10, count: 110, seed: 15781 + i, stop: () => Math.hypot(g.center().x - FORT.x, g.center().z - FORT.z) < FORT.r + 12 });
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
    rt.after(4, () => rt.say('織田信長', '本隊は右の雑賀の鉄砲を頼みにしておる。西の畑から回れば、本隊の横腹じゃ', 4));
    rt.obj('main', '砦から打って出て、本願寺勢を崩せ', 'main');
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 90; q.formation = 'line'; }
    F.last = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 16, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, list);
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.last.push(g);
      rt.marker('l' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    // 本隊と雑賀の鉄砲衆は一度に構える。本隊の後ろには門徒の大軍（軽い作り）
    const hb = mk(-20, -100, '本願寺勢の本隊', dress([{ type: 'samurai', n: 3, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 20 + more(rt) }, { type: 'gun', n: 3, o: { flag: 'sagarifuji' } }], IKKO));
    KIT.backOf(rt, hb, { flag: 'namu', armor: 0x3a342c, kind: 'spear', w: 22, depth: 12, count: 180, seed: 15785 });
    mk(24, -104, '雑賀の鉄砲衆', dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 8 + more(rt) }], SAIKA));
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
    rt.say('織田信長', '……ようやった。皆、砦へ戻れ。石山は、急いては落ちぬ', 4);
    rt.after(5, () => rt.say('', '――信長は石山のまわりに十の砦を築いて囲んだ。本願寺との戦いは、なお四年続く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    depthTick(rt, dt);
    if (F.dpOn) {
      // 砦の中の段：柵の内の味方が尽きれば落城
      if (F.dpOn === 'B') {
        const inF = rt.army.units.filter((u) => u.alive && u.team === 0 && Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r + 2).length;
        if (inF < 5) this.loseFort(rt);
      }
      return;
    }
    if (F.step === 1) {
      const qs = [F.ringA, F.gunA, F.ringB].filter(Boolean);
      rt.objProgress('main', `囲みの兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.ringB && gone(F.ringA) && gone(F.ringB)) || rt.t - F.stepT > 150) this.deep(rt, 'A', () => this.inFort(rt));
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
      const left = Math.max(0, 80 - (rt.t - F.stepT));
      rt.objProgress('main', `柵の内の味方 ${inFort}人・敵の息が切れるまで ${Math.ceil(left)}秒`);
      for (const q of F.siegeW) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (inFort < 6 && rt.t - F.stepT > 10) this.loseFort(rt);
      else if ((F.siegeW.length >= 3 && F.siegeW.every(gone)) || left <= 0) {
        for (let i = 0; i < 3; i++) rt.unmark('s' + i);
        for (const q of F.siegeW) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 10); }
        survival(rt, '囲まれた砦を守り抜いた');
        this.deep(rt, 'B', () => this.sortie(rt));
      }
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `本願寺勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 150) {
        for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
        for (const q of L) if (!gone(q)) { q.noRout = false; q.morale = 0; }
        this.win(rt);   // 木戸への追い討ちの段は省く（一つの戦を長くしすぎない）
      }
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
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
tennoji.famous = [
  { name: '下間頼廉', g: /囲み/, loose: 1, line: '本願寺の下間頼廉なり！　信長を砦ごと押しつぶせ！' },
];
tennoji.date = () => '天正四年五月七日　夏・晴';
tennoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tennoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tennoji.history = '天正四年（1576）四月、織田信長は石山本願寺を攻めさせたが、五月三日、三津寺を攻めた原田直政が雑賀の鉄砲衆などに討たれ、勢いに乗った本願寺勢一万五千ほどが天王寺砦（明智光秀・佐久間信栄らが守る）を囲んだ。京にいた信長は、急いで集まった三千ほどを率いて駆けつけ、五月七日、自ら先頭に立って囲みを破った。このとき信長は足に鉄砲の傷を負ったと『信長公記』は伝える。砦に入った信長は、そのまま再び打って出て本願寺勢を崩し、二千七百余りを討ったという。こののち信長は本願寺のまわりに砦を築いて囲み、戦いは天正八年まで続いた。兵の数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tennoji.lordAt = { x: 2, z: 116, r: 12, why: '信長の手（信長は自ら先頭に立ち、天王寺砦へ打ち入った）' };

// 素直な遊び手：囲みの兵と戦い、砦の門に入り、打って出て本願寺勢と戦う
tennoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.nobu.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  // 砦の柵越しに近い敵へ向いたまま突き続け、一度も当たらない不具合の直し（kaito 9/30）
  const e = b.army.nearestEnemy(u, F.step === 2 ? 5 : 12, (o) => !o.fleeing && !b.army.wallBetween(u.pos, u.team, o.pos, false));
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

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 苦しい戦：三千で一万五千の中へ。雑賀の鉄砲組が並んで撃ち、門徒の大波が前後左右から押し包む
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const saika = (list) => ({ flag: 'sagarifuji', armor: SAIKA.armor, list: dress(list, SAIKA) });
// 雑賀の鉄砲組：鉄砲だけの組は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, ...saika([uS(1), uG(n)]), formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
function tnCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'namu', armor: IKKO.armor, dmg: 0.64, mass: 260, look: (l) => dress(l, IKKO),
    friends: () => [F.nobu, F.saku, F.taki, F.ake].filter((g) => g && g.count && !g.routed) };
}
// A 囲みを破った後：囲みの二重 → 信長公を守るか、雑賀の鉄砲を潰すか → 後ろも閉じられる
function tnA() {
  const at = { x: 0, z: -14 };
  return [
    rest({ dur: 8, heal: 0.3, say: [['足軽', '破った……！　いや、見よ、砦の前にもう一重の囲みじゃ'], ['佐久間信盛', '殿、お足の傷が……'], ['織田信長', '構うな。砦はすぐそこじゃ']] }),
    hold({ at, dur: 84, r: 15, title: '囲みの二重', sub: '砦の前の門徒が、向き直って押し寄せる', label: '信長の手', obj: '信長の手のそばで、押し寄せる門徒の大波を受けよ',
      say: [['織田信長', '止まるな、押し返せ！　ここで止まれば、砦も我らも終わりじゃ']],
      waves: [
        { t: 4, say: ['足軽', '南無阿弥陀仏の声が……一面から来る！'], foes: () => [{ name: '砦の前の門徒', from: { x: at.x, z: at.z - 44 }, list: [uS(3), uA(15)], mass: 420, noRout: 30 }] },
        { t: 26, say: ['明智光秀', '（砦の中から）雑賀の鉄砲衆が並んだ！　伏せられよ！'], foes: () => [gunLine('雑賀の鉄砲衆', { x: 30, z: at.z - 26 }, 9)] },
        { t: 52, say: ['足軽', '西から回り込んでくる！'], foes: () => [{ name: '西の門徒', from: { x: -56, z: at.z }, off: { x: -8, z: 0 }, list: [uS(2), uA(12)], mass: 300 }] },
      ],
      reward: '囲みの二重を受け止めた', lost: ['佐久間信盛', '押し込まれた……！　殿をお守りせよ！'] }),
    rest({ dur: 7, bark: '息を継ぎ、組を寄せ直す', say: [['足軽', '東の畑の向こうに、また鉄砲衆が並んでおる……！'], ['佐久間信盛', '殿が狙われておる。……どうする']] }),
    pick({ title: '雑賀の鉄砲衆が、東の畑で信長公を狙っている。どうする？',
      options: [{ label: '組を連れて、雑賀の鉄砲衆へ斬り込む', note: '鉄砲の正面を走る。潰せば砦の中が楽になる。大手柄' }, { label: '信長公のそばを固め、砦の門へ押し通る', note: '鉄砲は残る。砦の中で、また撃たれる' }],
      on: (rt, m, i) => { m.tnGuns = i === 0; rt.say('織田信長', i === 0 ? '行け。撃たれる前に寄れ。込め直しの間じゃ' : 'よし、門へ押せ。わしから離れるな', 3); } }),
    fight({ skip: (rt, m) => !m.tnGuns, at: { x: 38, z: -20 }, title: '雑賀の鉄砲衆', sub: '畑の畦に並んだ鉄砲の列', obj: '東の畑に並んだ雑賀の鉄砲衆を崩せ（構えを見たら伏せ、込め直しの間に寄れ）',
      foes: () => [gunLine('畦に並ぶ雑賀の鉄砲衆', { x: 56, z: -30 }, 11), { name: '鉄砲を守る門徒', from: { x: 60, z: -12 }, list: [uS(1), uA(9)], mass: 220 }],
      later: [{ t: 40, title: '二の列', sub: '後ろの畦にも、鉄砲の列', say: ['足軽', 'もう一列おる！'], foes: () => [gunLine('二の列の雑賀衆', { x: 64, z: -44 }, 8)] }],
      max: 140, reward: (t) => { t.special = { label: '雑賀の鉄砲衆を潰した', pts: 25 }; }, rewardLabel: '雑賀の鉄砲衆を潰した' }),
    move({ skip: (rt, m) => m.tnGuns, to: { x: FORT.x, z: FORT.z + FORT.r + 8 }, r: 9, label: '砦の門の前', obj: '信長公のそばを固め、砦の門の前まで押し通れ',
      say: [['織田信長', '押せ！']],
      ambush: { d: 30, t: 20, title: '横槍', sub: '門の脇から門徒が', say: ['足軽', '門の脇から来た！'], foes: () => [{ name: '門の脇の門徒', from: { x: -40, z: FORT.z + 10 }, list: [uS(2), uA(11)], mass: 280 }] } }),
  ];
}
// B 砦の中：二度目の総攻め（四方から）→ いつ打って出るか
function tnB() {
  const c = { x: FORT.x, z: FORT.z };
  return [
    rest({ dur: 9, heal: 0.35, bark: '柵の内で、手傷を縛った', say: [['明智光秀', '一つ目の総攻めは退けました。……じゃが、あれを'], ['足軽', '石山の方から、また旗が……前より多い'], ['織田信長', '次が本当の総攻めじゃ。柵を背に、槍を揃えよ']] }),
    hold({ at: c, dur: 86, r: FORT.r, title: '二度目の総攻め', sub: '本願寺勢が四方から砦へ押し寄せる', label: '天王寺砦', obj: '柵の内で、四方から押し寄せる本願寺勢を防げ',
      waves: [
        { t: 4, say: ['足軽', '北からじゃ！　柵に取り付いてくる！'], foes: () => [{ name: '北の門徒の大波', from: { x: c.x, z: c.z - 60 }, off: { x: 0, z: -FORT.r - 4 }, list: [uS(3), uA(15)], mass: 420, noRout: 30 }] },
        { t: 22, say: ['明智光秀', '雑賀の鉄砲が柵の外に並んだ！　柵の陰へ！'], foes: (rt, m) => [gunLine('柵の外の雑賀衆', { x: c.x + 50, z: c.z - 20 }, m.tnGuns ? 6 : 10, { off: { x: FORT.r + 10, z: -6 } })] },
        { t: 46, say: ['足軽', '西の柵も！'], foes: () => [{ name: '西の門徒', from: { x: c.x - 60, z: c.z }, off: { x: -FORT.r - 4, z: 0 }, list: [uS(2), uA(12)], mass: 320 }] },
        { t: 70, say: ['足軽', '門じゃ！　南の門に回られた！'], foes: () => [{ name: '門へ回る門徒', from: { x: c.x - 20, z: c.z + 64 }, off: { x: 0, z: FORT.r + 2 }, list: [uS(2), uA(13)], mass: 340 }] },
      ],
      reward: '二度目の総攻めから砦を守り抜いた', lost: ['明智光秀', '柵が……！　いや、まだ持ちまする！'] }),
    rest({ dur: 8, bark: '柵の内で、組の者を数え直す', say: [['明智光秀', '殿、敵の息が切れてまいりました。このまま籠もって、後の者を待たれては'], ['織田信長', '……']] }),
    pick({ title: '本願寺勢の寄せが緩んだ。いつ打って出る？',
      options: [{ label: '今すぐ門を開け、息の切れた所を突く', note: '敵は崩れやすい。ただし寄せの残りの中へ出る' }, { label: '柵の内で、もう一度寄せを受けてから出る', note: 'もう一度守る。出た時、敵はさらに弱っている' }],
      on: (rt, m, i) => { m.tnNow = i === 0; rt.say('織田信長', i === 0 ? '今じゃ。門を開けよ！' : 'まだじゃ。もう一度だけ受けよ', 3); } }),
    fight({ skip: (rt, m) => !m.tnNow, at: { x: c.x, z: c.z + FORT.r + 12 }, title: '門を開けて突く', sub: '門の前の門徒の残りへ', obj: '門の前に残った門徒を崩せ',
      foes: () => [{ name: '門の前の門徒', from: { x: c.x + 20, z: c.z + 50 }, list: [uS(2), uA(12)], mass: 300, morale: 70 }],
      later: [{ t: 30, say: ['足軽', '横から雑賀の鉄砲！'], foes: () => [gunLine('横の雑賀衆', { x: c.x + 50, z: c.z + 30 }, 7)] }],
      max: 120, reward: '門を開けて寄せの残りを突いた' }),
    hold({ skip: (rt, m) => m.tnNow, at: c, dur: 70, r: FORT.r, title: '最後の寄せ', sub: '本願寺勢が、もう一度だけ柵へ寄せる', label: '天王寺砦', obj: '柵の内で、最後の寄せを受けよ',
      waves: [{ t: 4, foes: () => [{ name: '最後の門徒の寄せ', from: { x: c.x + 20, z: c.z - 60 }, off: { x: 0, z: -FORT.r - 4 }, list: [uS(2), uA(12)], mass: 320, morale: 75 }] }],
      reward: '最後の寄せを受けきった',
      onEnd: (rt) => { for (const h of rt.flags.hostE) h.retreat(10, 10); } }),
  ];
}
// C 本願寺勢を崩した後：木戸まで追うか、止まるか → 石山からの新手
function tnC() {
  return [
    rest({ dur: 8, heal: 0.25, say: [['足軽', '崩れた！　門徒が石山へ逃げていく！'], ['佐久間信盛', '殿、追いまするか']] }),
    pick({ title: '本願寺勢が石山へ崩れていく。どうする？',
      options: [{ label: '木戸の手前まで追い討つ', note: '首を多く挙げられる。石山の鉄砲の届く所まで出る' }, { label: '砦の前で止まり、陣を立て直す', note: '追わない。石山から出る新手を、備を固めて受ける' }],
      on: (rt, m, i) => { m.tnChase = i === 0; rt.say('織田信長', i === 0 ? '木戸まで追え。それより先は深追いするな' : 'よし、止まれ。備を直せ', 3); } }),
    fight({ skip: (rt, m) => !m.tnChase, at: { x: 10, z: -124 }, title: '追い討ち', sub: '石山の木戸の手前まで', obj: '石山へ退く本願寺勢に追い討ちをかけよ',
      foes: () => [{ name: '退く門徒の殿', from: { x: 16, z: -160 }, list: [uS(3), uA(12)], mass: 300, morale: 60 }],
      later: [{ t: 30, title: '木戸の鉄砲', sub: '石山の木戸から、鉄砲が並んで撃ちかける', say: ['足軽', '木戸の上に鉄砲が並んだ！'], foes: () => [gunLine('木戸の雑賀衆', { x: 26, z: -170 }, 10)] },
        { t: 64, title: '新手', sub: '石山から門徒の新手が押し出す', say: ['佐久間信盛', '新手じゃ！　深入りしすぎた、退きながら受けよ！'], foes: () => [{ name: '石山の新手', from: { x: -20, z: -176 }, list: [uS(3), uA(14)], mass: 400 }, { name: '東から回る門徒', from: { x: 60, z: -130 }, list: [uS(1), uA(9)], mass: 220 }] }],
      max: 160, reward: (t) => { t.special = { label: '石山の木戸まで追い討った', pts: 20 }; }, rewardLabel: '石山の木戸まで追い討った' }),
    hold({ skip: (rt, m) => m.tnChase, at: { x: 0, z: -96 }, dur: 90, r: 14, title: '石山の新手', sub: '石山から新手が押し出してくる', label: '砦の前', obj: '砦の前で備を固め、石山から来る新手を受けよ',
      waves: [
        { t: 6, say: ['足軽', '石山から新手じゃ！'], foes: () => [{ name: '石山の新手', from: { x: 10, z: -150 }, list: [uS(3), uA(13)], mass: 360 }] },
        { t: 40, say: ['足軽', '鉄砲も並べてくる！'], foes: () => [gunLine('雑賀の鉄砲衆', { x: 36, z: -140 }, 8)] },
      ],
      reward: '石山の新手を受け止めた' }),
  ];
}

export { tennoji };
