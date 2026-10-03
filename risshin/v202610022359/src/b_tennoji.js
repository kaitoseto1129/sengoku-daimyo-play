// ======================================================================
// 織田家編　天王寺の戦い（天正四年五月七日）
// 石山本願寺を囲む織田方の天王寺砦（明智光秀らが守る）を、本願寺勢一万五千ほどが囲んだ。
// 京にいた信長は、集まっていたわずか三千ほどを率いて駆けつけ、自ら先頭に立って囲みを破った。
// 信長は足に鉄砲の傷を負ったが、砦に入った後、再び打って出て本願寺勢を崩した。
// 足軽は信長の手。①本願寺勢の囲みを突き破る（雑賀の鉄砲の下で） ②天王寺砦の門へ入る
// ③砦から再び打って出て、本願寺勢を崩す
// 向き：北（-z）に天王寺砦、その先の遠くに石山本願寺。南（+z）から信長が来る
// ======================================================================
import { nobori, hut, tawara, kabukimon, jinmaku, dou, dorui, village, sakamogi, palisade, campfire, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';
import { namuTex, sagarifujiTex } from './b_nodafukushima.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeNawabari } from './nawabari.js';
import { TENNOJI_PLAN, T_GATE, T_HONGATE, SOTO_POLY, HON_POLY } from './castles/tennoji.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FORT = { x: 0, z: -62, r: 18 };      // 天王寺砦（口は南）
const HONGAN = { x: 30, z: -230 };          // 石山本願寺（上町台地の北の端の方）
const SHITEN = { x: 52, z: 6 };             // 四天王寺（戦国期の伽藍。東大門は石山合戦で焼けた、の設定で門は置かない）
const MITSU = { x: -56, z: -170 };          // 三津寺（原田直政隊が攻め、雑賀の鉄砲に押し返された辺り。遠景のみ）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'sagarifuji' };
const KIDO = { x: 12, z: -168 };            // 大坂の城戸口（石山の外の木戸。この戦で本願寺の中へは入らない）
const SHIMO = { x: 34, z: -186 };           // 下間頼廉の本陣（総大将は城戸口の後ろ。前の斬り合いには出ない）

// 下地：上町台地（天王寺側は高台、西・北西は低地）。砦の段・空堀は castles/tennoji.js の縄張りが重ねる
function baseTerrain(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  const cliff = 1 / (1 + Math.exp(-(x + 26) * 0.35));   // 崖線は x=-26 の辺り
  h += 7 * cliff;
  const nw = Math.max(0, Math.min(1, (-88 - z) / 60)) * Math.max(0, Math.min(1, (6 - x) / 60));
  h -= 3 * nw;   // 北西はさらに低く・湿地がち
  h += 18 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  return h;
}
const HORI_FNS = TENNOJI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(TENNOJI_PLAN, baseWithHori, 3);
  return HEIGHT_FN(x, z);
}

function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
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
  spawn: { x: 6, z: -52, heading: Math.PI },   // 要件：原田の敗北のあと、砦の中で籠城する側から始める（信長は外から来る）
  world: {
    seed: 15764,
    moveLim: 230,   // 置いた兵が 176 の端に貼り付いていた（見回り 10/2）
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
    const nt = flagTexture('namu'), st = flagTexture('sagarifuji');
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    // ---- 天王寺砦：原田直政が築いた付城（castles/tennoji.js の縄張り）。外曲輪と主郭の二段、土塁の上の木柵、空堀、物見櫓 ----
    flReset();
    const C = F.C = buildCastlePlan(rt, TENNOJI_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildTowers: true, towerTeam: 0, team: 0 });
    // 柵は味方の物（castle_plan は城方＝敵の塀として建てる）。壊れない・的にしない
    for (const s of C.walls) if (s && s.seg) { s.team = 0; s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; }
    // 柵の下の土塁（外へ盛る。一つの形にまとめて描く）
    const db = makeSimpleBatch();
    for (const poly of [SOTO_POLY, HON_POLY]) {
      const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, nl = Math.hypot(mx - cx, mz - cz) || 1;
        const d = dorui(W, [ax, az, bx, bz], (mx - cx) / nl, (mz - cz) / nl, { batch: db, w: 2.6, h: 0.9 });
        if (!d.isBatchedPart) rt.scene.add(d);
      }
    }
    finalizeSimpleBatch(rt, db);
    // 門（冠木門）：外曲輪の南の口と、主郭の口
    rt.scene.add(kabukimon(W, T_GATE.x, T_GATE.z, 6.4, 0), kabukimon(W, T_HONGATE.x, T_HONGATE.z, 4.8, 0));
    // 外曲輪：兵舎（長屋）・兵糧の俵・焚き火。主郭：明智の本陣（陣幕）と陣屋
    rt.scene.add(hut(W, -15, -60, 9, 5, Math.PI / 2, { wall: 0x6a5238 }), hut(W, 15, -66, 9, 5, -Math.PI / 2, { wall: 0x6a5238 }), hut(W, -15, -71, 6, 4.5, Math.PI / 2, { wall: 0x5e4a34 }));
    rt.scene.add(tawara(W, -9, -50, 0.4, 6), tawara(W, 10, -73, -0.3, 5), campfire(W, -7, -58), campfire(W, 8, -56));
    rt.scene.add(hut(W, -4, -81, 10, 6, 0, { wall: 0x6a5238 }), jinmaku(W, 5, -74, 6, 4, 0));
    // 旗：門の左右・主郭・櫓の脇（織田と明智の幟）
    for (const [x, z, k, h] of [[-5, -40, 'oda', 6], [5, -40, 'akechi', 6], [-10, -71, 'akechi', 6], [8, -71, 'oda', 6], [-19, -51, 'oda', 5], [19, -80, 'akechi', 5], [0, -88, 'oda', 6]]) rt.scene.add(nobori(W, x, z, k, h));
    // 空堀の外の逆茂木（門の前は空ける）
    for (const [x, z, r, l] of [[-33, -58, Math.PI / 2, 8], [-33, -74, Math.PI / 2, 8], [33, -60, Math.PI / 2, 8], [33, -76, Math.PI / 2, 8], [-14, -101, 0, 9], [14, -101, 0, 9], [-22, -33, 0.5, 7], [22, -33, -0.5, 7]]) rt.scene.add(sakamogi(W, x, z, r, l));
    // 縄張りの今の様子（nawabari.js）：曲輪の表を小地図・軍議に渡す。守りは織田（team 0）
    F.K = makeNawabari(rt, C, { team: 0, friendTeam: 0, enemyTeam: 1 });
    rt.nawabari = F.K;
    // 大坂の城戸口（石山の外の木戸）：柵の線と冠木門だけ（この戦で本願寺の中へは入らない）
    for (const sg of [[KIDO.x - 40, KIDO.z - 4, KIDO.x - 4, KIDO.z], [KIDO.x + 4, KIDO.z, KIDO.x + 36, KIDO.z - 6]]) rt.scene.add(palisade(W, sg));
    rt.scene.add(kabukimon(W, KIDO.x, KIDO.z, 6.4, 0));
    // ---- 四天王寺（戦国期の伽藍。周りを含む広い区域の目印。東大門は石山合戦で焼けた設定で門は置かない） ----
    rt.scene.add(dou(W, SHITEN.x, SHITEN.z, 9, 6.5, Math.PI, { h: 3.6 }), hut(W, SHITEN.x + 16, SHITEN.z - 4, 7, 5, Math.PI, { wall: 0x7a5a3c }));
    rt.scene.add(nobori(W, SHITEN.x - 10, SHITEN.z + 8, 'oda', 5));
    // 勝鬘院（愛染堂）：四天王寺の北西の小さな堂（周りの伽藍の目印）
    rt.scene.add(dou(W, SHITEN.x - 26, SHITEN.z - 14, 6, 5, Math.PI, { h: 3 }));
    // ---- 西の低地の集落 ----
    rt.scene.add(village(W, -72, 48, { n: 6, r: 16, seed: 1576 }));
    // 砦に籠もる明智・佐久間信栄の手
    F.ake = allyGroup(rt, { name: '明智光秀の手', anchor: { x: FORT.x, z: FORT.z }, facing: 0, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '佐久間信栄', hat: 'hachimaki', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 6 }], ODA));
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
    if (n) rt.makeSquad({ x: 9, z: -50 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦を囲む本願寺勢 ----
    F.ringA = enemyGroup(rt, { faction: 'saito', name: '囲みの門徒', anchor: { x: -8, z: 10 }, facing: 0, order: 'hold', aggro: 16, width: 18, morale: 90, fleeDir: { x: -0.3, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '門徒の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 26 + more(rt) }], IKKO));
    F.gunA = enemyGroup(rt, { faction: 'saito', name: '雑賀の鉄砲', anchor: { x: 20, z: -6 }, facing: 0, order: 'hold', aggro: 40, width: 14, morale: 90, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1, o: { name: '土橋守重' } }, { type: 'gun', n: 10 }], SAIKA));
    for (const u of F.gunA.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 大軍（軽い作り）：砦を囲む本願寺勢、遠くの石山本願寺 ----
    F.hostE = [DA(-60, -70, 20, 40, 260, Math.PI / 2, 0x3a342c, nt, 15761), DA(60, -70, 20, 40, 260, -Math.PI / 2, 0x3a342c, st, 15762), DA(0, -120, 50, 16, 320, Math.PI, 0x3a342c, nt, 15763), DA(-84, -22, 26, 12, 200, 0.9, 0x3a342c, st, 15764)];
    // 囲みの後ろに控える本願寺の大軍（一万五千とも。見回り 10/2：砦の前の野に一列しか見えず、囲まれた圧が無かった）
    F.hostE.push(DA(-6, -158, 96, 22, 460, Math.PI, 0x3a342c, nt, 15767), DA(84, -40, 24, 30, 220, -1.1, 0x3a342c, nt, 15768));
    // 砦へ駆けつける信長の手（見た目だけ。起こさない）：開けた野の左右に味方の大軍。囲まれた砦の上には煙が上がる（行く先が遠くから分かる）
    for (const [x, z, s, k] of [[-30, 96, 15765, 'oda'], [40, 98, 15766, 'eiraku']]) W.addDistantArmy({ x, z, w: 22, d: 10, count: 110, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const [x, z, sz] of [[FORT.x - 8, FORT.z - 6, 3], [FORT.x + 12, FORT.z + 4, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 2, z, { size: sz });
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 16, 10, 0.3, { h: 4.2 }), hut(W, HONGAN.x - 26, HONGAN.z + 12, 10, 7, 0.3, { h: 3.8, wall: 0x7a5a3c, roof: 0x3a3430 }));   // 本願寺の御影堂（瓦の大屋根）と庫裏
    for (const [x, z] of [[HONGAN.x - 10, HONGAN.z + 22], [HONGAN.x + 12, HONGAN.z + 20]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    rt.scene.add(tawara(W, 16, 140, 0.3, 5));
    // 信長の本陣（信長は自ら先に立つので、陣には旗本が残る）と、石山本願寺の顕如の陣所
    F.honjin = camp(rt, { x: 0, z: 150, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 200, runTo: { x: 0, z: 112 } });
    F.honjin.guard.name = '信長の旗本';
    // 本願寺勢の総大将・下間頼廉の本陣：城戸口の後ろ（前の斬り合いには出ない。顕如は石山の内にいて戦場へは出ない）
    F.ehon = camp(rt, { x: SHIMO.x, z: SHIMO.z, facing: 0, team: 1, faction: 'saito', mon: 'sagarifuji', armor: 0x3a342c, general: { name: '下間頼廉', hat: 'kabuto_m', haori: 0x4a4236 }, guard: 15, reserve: 400, runTo: { x: KIDO.x, z: KIDO.z + 30 } });
    F.ehon.guard.name = '下間頼廉の旗本';

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を率い、明智勢と砦に籠もれ' : '明智勢と砦に籠もり、信長公を待て', 'main');
    this.prologue(rt, nt);
    rt.marker('nobu', unitPos(F.nobuU), '織田信長（京から駆けつける）', {});
  },

  // ①前段（短く）：原田直政隊が三津寺で本願寺勢に反撃され、討死。前線が崩れ、明智らは天王寺砦へ退く
  // プレイヤーは離れた信長の手にいるので、遠景の大軍（軽い作り）と使番の言伝だけで見せる
  prologue(rt, nt) {
    const F = rt.flags;
    F.harada = rt.world.addDistantArmy({ x: MITSU.x, z: MITSU.z, w: 20, d: 10, count: 120, facing: 0, armor: 0x3a342c, flagTex: nt, seed: 15760 });
    rt.banner('前線崩壊', '原田直政隊、三津寺にて本願寺勢と戦う');
    sfx('taiko', 0.7);
    rt.after(0.8, () => { F.harada.advance(16, 10); rt.army.play('eshout', MITSU, 1.3); });
    rt.after(3, () => rt.say('織田の使番', '原田様、三津寺で雑賀の鉄砲に押し返されておりまする！', 3.2));
    rt.after(5.5, () => { sfx('volley', 0.9); rt.army.play('volley', MITSU, 1.3); });
    rt.after(7.5, () => rt.say('織田の使番', '原田直政様、討死にござる……！', 3.5));
    rt.after(8.5, () => F.harada.rout({ hideAfter: 16 }));
    rt.after(10, () => rt.say('足軽', '前線が崩れた！　明智様たちは天王寺砦へ退かれたとの由……', 4));
    rt.after(12.5, () => {
      rt.say('明智光秀', '砦に籠もる。京へ急使を出した。殿が来られるまで、柵を頼りに持ちこたえよ', 3.6);
    });
    rt.after(18, () => this.siege(rt));
  },

  // ① 囲みを突き破る
  breakIn(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.breakDone) return;
    F.breakDone = true;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('break');
    rt.unmark('nobu');
    for (let i = 0; i < 3; i++) rt.unmark('s' + i);
    for (const q of F.siegeW || []) if (!gone(q)) q.morale = Math.min(q.morale, 35);
    sfx('horagai', 1); rt.after(0.6, () => sfx('taiko', 1));
    rt.banner('信長公の旗', '外から信長の三千が囲みを突く。砦からも打って出て、挟み撃ちにせよ');
    rt.obj('main', HI(rt) ? '砦の一手を率い、信長公と挟み撃ちに囲みを破れ' : '信長公と呼応し、砦から囲みを挟み撃て', 'main');
    F.nobu.speed = (F.nobu.speed || 3) * 0.9;   // 信長は足に銃創（すぐ負けにはならない。足が少し鈍る）
    for (const [g, x] of [[F.nobu, 0], [F.saku, -22], [F.taki, 22]]) { g.order = 'attack'; g.seekRange = 60; g.anchor = { x, z: 30 }; }
    F.ringA.order = 'attack'; F.ringA.seekRange = 130;   // 囲みの門徒も押し出してくる（長く歩かせない）
    // 挟み撃ち：外から信長勢が来たのを見て、砦の内の明智勢も柵の内から打って出る（台詞だけでなく実際に両側から当たる）
    F.ake.order = 'attack'; F.ake.seekRange = 50; F.ake.aggro = 16;
    // 挟み撃ち：札（かかれ）が消えてから、砦の内の明智が打って出る声
    rt.after(4.5, () => { if (F.step === 1) rt.say('明智光秀', '殿の旗じゃ！　門を開けよ、中からも突いて出る！', 3); });
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
    for (const [g, x] of [[F.nobu, 0], [F.saku, -14], [F.taki, 14]]) { g.order = 'move'; g.dest = { x, z: FORT.z + FORT.r + 13 }; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.gz = G;
  },

  // ②' 籠城：砦に入った所を本願寺勢が三方から押し包む。佐久間・滝川の後詰が門の外で戦ううちに、砦を守り抜け
  siege(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5; F.stepT = rt.t; F.siegeW = [];
    rt.setPhase('siege');
    rt.unmark('gate'); rt.unzone('gate'); rt.unmark('nobu');
    sfx('kane', 0.8);
    rt.banner('囲まれた', '本願寺勢が三方から砦へ押し寄せる');
    rt.say('明智光秀', '門を閉めよ！　……四方から来ますぞ！', 3.5);
    rt.say('佐久間信栄', '父の手勢が外におりまする。殿が来られるまで、ここは我らが支えまする', 4);
    rt.say('明智光秀', '柵を背に槍を揃えよ。殿の旗が見えるまで、持ちこたえるのじゃ', 4);
    rt.after(5, () => rt.say('明智光秀', '鉄砲はまだ撃たせませぬ。柵まで引きつけて、一度に放ちまする。崩れた所を槍で突かれよ', 4.5));
    F.fgun = allyGroup(rt, { name: '砦の鉄砲組', anchor: { x: FORT.x, z: FORT.z - 2 }, facing: 0, width: 14, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    volleyAt(rt, { guns: () => [F.fgun, F.ake], foes: () => F.siegeW, who: '明智光秀', near: 28, drop: 30, max: 40, say: '柵まで来たぞ……放てぇっ！', line: '砦の鉄砲がそろって火を吹いた。門徒の前の列が崩れる' });
    rt.obj('main', '砦を守り、信長公の救援を待て', 'main');
    for (const q of [F.ake]) { q.order = 'hold'; q.anchor = { x: FORT.x - 4, z: FORT.z - 4 }; q.aggro = 12; }
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
    if (rt.player.u.group) rt.player.u.group.defMult = 1;
    for (const x of rt.squad || []) if (x.group) x.group.defMult = 1;
    // 挟み撃ち（史実の肝）：信長と明智は砦の門から正面へ、門の外にいた佐久間・滝川の後詰は東西から本隊の横腹へ回る
    for (const [q, x] of [[F.saku, -52], [F.taki, 48]]) { q.order = 'move'; q.dest = { x, z: -96 }; q.onArrive = (g) => { g.order = 'attack'; g.seekRange = 90; }; }
    rt.after(7, () => {
      if (F.step !== 3) return;
      rt.banner('挟み撃ち', '佐久間・滝川の後詰が、本願寺勢の横腹へ回った');
      rt.say('佐久間信盛', '殿！　横から突きまする。正面は頼みましたぞ', 3);
    });
    F.last = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 16, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, list);
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.last.push(g);
      rt.marker('l' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    // 本隊と雑賀の鉄砲衆は一度に構える。本隊の後ろには門徒の大軍（軽い作り）
    const hb = mk(-20, -100, '本願寺勢の本隊', dress([{ type: 'samurai', n: 1, o: { name: '本隊の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 20 + more(rt) }, { type: 'gun', n: 3, o: { flag: 'sagarifuji' } }], IKKO));
    KIT.backOf(rt, hb, { flag: 'namu', armor: 0x3a342c, kind: 'spear', w: 22, depth: 12, count: 180, seed: 15785 });
    mk(24, -104, '雑賀の鉄砲衆', dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 8 + more(rt) }], SAIKA));
    for (const h of F.hostE) h.retreat(20, 20);
    rt.after(45, () => { if (!F.ending && F.step === 3) { mk(-44, -80, '本願寺の新手', dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 16 + more(rt) }], IKKO)); rt.say('足軽', '西からまた門徒が！　きりがない！', 3); } });
  },

  // ④ 押し戻す：崩れた本願寺勢を大坂の城戸口まで追う。城戸口の後ろには下間頼廉の本陣、木戸の脇には雑賀の鉄砲が残る
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('chase');
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 12); q.fleeDir = { x: 0, z: -1 }; }
    for (const h of F.hostE) h.retreat(30, 24);
    rt.award((t) => t.side.push('本願寺勢の本隊を崩した'), '本願寺勢の本隊を崩した');
    sfx('horagai', 0.9);
    rt.banner('本願寺勢、崩れる', '石山の城戸口へ退いていく');
    rt.say('足軽', '崩れた！　門徒が石山の方へ逃げていく！', 3);
    rt.after(3.5, () => rt.say('織田信長', '城戸口まで押し戻せ。それより先は深追いするな', 3.5));
    rt.obj('main', HI(rt) ? '一手を率い、退く本願寺勢を城戸口まで押し戻せ' : '退く本願寺勢を、大坂の城戸口まで押し戻せ', 'main');
    for (const [q, x] of [[F.nobu, 0], [F.saku, -18], [F.taki, 18], [F.ake, 8]]) { q.order = 'attack'; q.seekRange = 70; q.anchor = { x: KIDO.x + x, z: KIDO.z + 26 }; }
    // 残りの手：城戸口を守る殿の門徒と、木戸の脇の雑賀の鉄砲。後ろに総大将の本陣（旗本が厚い）
    F.kidoG = [];
    const add = (x, z, name, list, gunK) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'hold', aggro: 20, seekRange: 30, width: 14, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, list);
      for (const u of g.units) if (u.type === 'gun') u.dmg *= gunK;
      F.kidoG.push(g);
      rt.marker('k' + F.kidoG.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    add(KIDO.x - 6, KIDO.z + 14, '城戸口の殿の門徒', dress([{ type: 'samurai', n: 1, o: { name: '殿の侍大将', hat: 'kabuto_m' } }, { type: 'ashigaru', n: 12 + more(rt) }], IKKO), 1);
    add(KIDO.x + 22, KIDO.z + 6, '木戸の雑賀の鉄砲', dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 7 }], SAIKA), 0.4);
    F.kz = { x: KIDO.x, z: KIDO.z + 16 };
    rt.marker('kido', F.kz, '大坂の城戸口', { h: 3 });
    rt.zone('kido', F.kz.x, F.kz.z, 10);
    rt.after(8, () => { if (F.step === 4 && !F.shimoDead) rt.say('足軽', '城戸口の奥に、大きな陣幕……あれが本願寺の大将の陣か', 3.5); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (let i = 1; i <= 3; i++) { rt.unmark('l' + i); rt.unmark('k' + i); }
    rt.unmark('kido'); rt.unzone('kido');
    for (const q of [...(F.last || []), ...(F.kidoG || [])]) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const h of F.hostE) h.rout({ hideAfter: 40 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '天王寺砦の囲みを破り、本願寺勢を城戸口まで押し戻した', pts: 20 }; }, '任務達成・本願寺勢を押し戻した');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('本願寺勢、城戸の内へ', F.shimoDead ? '大将を失った本願寺勢は、石山の内へ逃げ込んだ' : '下間頼廉は旗本に守られ、城戸の内へ退いた');
    rt.say('織田信長', '止まれ！　ここまでじゃ。……ようやった。石山は、急いては落ちぬ', 4);
    rt.after(5, () => rt.say('', '――本願寺勢は二千七百余りを討たれた。信長は石山のまわりに十の砦を築いて囲んだ。戦いは、なお四年続く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.K) F.K.tick(dt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const qs = [F.ringA, F.gunA, F.ringB].filter(Boolean);
      rt.objProgress('main', `囲みの兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.ringB && gone(F.ringA) && gone(F.ringB)) || rt.t - F.stepT > 100) this.sortie(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.gz.x, p.z - F.gz.z);
      rt.objProgress('main', `門まで ${Math.max(0, Math.round(d))}m`);
      // 門へ来ない時は、砦の者が呼び、それでも来なければ信長が待たずに打って出る
      if (d >= 5 && rt.t - F.stepT > 22 && !F.gateCall) { F.gateCall = true; rt.say('砦の足軽', `${nm(rt)}殿、こちらじゃ！　南の門を開けてござる、早う中へ！`, 3.5); }
      if (d < 5 || rt.t - F.stepT > 50) this.siege(rt);
    }
    if (F.step >= 1 && F.step < 3) this.cover(rt, dt);
    if (F.step === 2.5) {
      // 柵の内の味方（自分・組・信長の手・明智の手）が尽きかけたら落城。三つの寄せを崩すか、95 秒持てば打って出る
      const inFort = rt.army.units.filter((u) => u.alive && u.team === 0 && Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r + 8).length;
      const left = Math.max(0, 80 - (rt.t - F.stepT));
      rt.objProgress('main', `柵の内の味方 ${inFort}人・敵の息が切れるまで ${Math.ceil(left)}秒`);
      for (const q of F.siegeW) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (inFort < 5 && rt.t - F.stepT > 22) this.loseFort(rt);
      else if ((F.siegeW.length >= 3 && F.siegeW.every(gone)) || left <= 0) {
        for (let i = 0; i < 3; i++) rt.unmark('s' + i);
        for (const q of F.siegeW) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 10); }
        survival(rt, '囲まれた砦を守り抜いた');
        this.breakIn(rt);
      }
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `本願寺勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 110) this.chase(rt);
    }
    if (F.step === 4) {
      // 城戸口の手前まで押せば、信長が追い討ちを止める（大将を討っても、残りの手が崩れるまで戦は続く）
      const K = F.kidoG || [];
      for (const q of K) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      const d = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      rt.objProgress('main', `城戸口まで ${Math.max(0, Math.round(d))}m・残りの手 ${K.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      if ((d < 10 && rt.t - F.stepT > 12) || (K.length && K.every(gone)) || rt.t - F.stepT > 70) this.win(rt);
    }
  },

  // 柵の内（籠城の間）：外曲輪の内は柵の陰で傷が浅くなる。主郭の内で敵が 9m 内にいなければ、少しずつ息を継ぐ
  cover(rt, dt) {
    const F = rt.flags, u = rt.player.u;
    if (!u.alive) return;
    const inSoto = inPoly(SOTO_POLY, u.pos.x, u.pos.z), inHon = inPoly(HON_POLY, u.pos.x, u.pos.z);
    const g = u.group, sq = (rt.squad || []).find((x) => x.alive);
    const k = inHon ? 2.6 : inSoto ? 1.9 : 1;
    if (g) g.defMult = k;
    if (sq && sq.group && sq.group !== g) sq.group.defMult = Math.max(1, k * 0.8);
    if (inHon && u.hp < u.maxHp && !rt.army.nearestEnemy(u, 6)) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);
    if (F.step === 2.5 && u.hp < u.maxHp * 0.5 && !inHon && !F.honHint) {
      F.honHint = true;
      rt.say('明智光秀', `${nm(rt)}殿、傷が深い！　主郭の柵の内へ退いて、息を継がれよ`, 3.2);
      rt.marker('hon', { x: -2, z: -76 }, '主郭（息を継ぐ）', { h: 2 });
      rt.after(25, () => rt.unmark('hon'));
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    // 総大将を討っても一瞬では終わらない（taisho の use：手柄と気落ちだけ）。本願寺勢は崩れて退き、残りの手が城戸口を支える
    if (v.name === '下間頼廉' && !F.shimoDead && !F.ending) {
      F.shimoDead = true;
      for (const q of rt.army.groups) if (q.team === 1 && !q.routed && q.count > 0 && !(F.kidoG || []).includes(q)) { q.noRout = false; q.morale = Math.min(q.morale ?? 100, 15); }
      for (const h of F.hostE) h.retreat(30, 24);
      rt.after(2, () => rt.say('織田信長', '大将は討った。じゃが木戸の鉄砲はまだ生きておる。城戸口まで押せ', 3.5));
    }
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
// 下間頼廉は総大将：前の組（囲み）には出さない。城戸口の後ろの本陣（camp）に置き、taisho は use で本人を使う
// （use：討っても戦は終わらず、手柄と敵の気落ちだけ。戦は城戸口まで押し戻して終わる）。任務の文に名を入れない（defOwned になる）
tennoji.taisho = { b: { name: '下間頼廉', use: true } };
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
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.nobu.center();
  if (b.botRest) {
    inp.guardHold = false;
    // 籠城の間は主郭へ退いて息を継ぐ（主郭の門は南の辺の x=-4。外曲輪から門の前を通って入る）
    if (F.step === 2.5) { if (inPoly(HON_POLY, u.pos.x, u.pos.z)) goTo(p, inp, -2, -78, 1.5); else if (u.pos.z > -65) goTo(p, inp, T_HONGATE.x, -64, 1.2); else goTo(p, inp, T_HONGATE.x, -74, 1); return; }
    // 打って出た後は、敵の来ない南の門の内（外曲輪の南）へ戻って息を継ぐ
    if (F.step >= 3) { goTo(p, inp, 2, -50, 2); return; }
    goTo(p, inp, c.x, c.z + 6, 2); return;
  }
  // 砦の柵越しに近い敵へ向いたまま突き続け、一度も当たらない不具合の直し（kaito 9/30）
  // 籠城の間は柵の外へ追って出ない（柵の内へ入った敵と、すぐそばの敵だけ）
  const siege = F.step === 2.5;
  const e = b.army.nearestEnemy(u, F.step === 2 ? 5 : siege ? 9 : 12, (o) => !o.fleeing && !b.army.wallBetween(u.pos, u.team, o.pos, false) && (!siege || inPoly(SOTO_POLY, o.pos.x, o.pos.z) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3.5));
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
  if (siege) { goTo(p, inp, FORT.x + 2, FORT.z + 2, 3); return; }
  if (F.step === 3) {
    const q = (F.last || []).find((x) => !gone(x));
    if (q) { const t = q.center(); if (u.pos.z < FORT.z + FORT.r && Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r) { goTo(p, inp, FORT.x, FORT.z + FORT.r + 4, 1); return; } goTo(p, inp, t.x, t.z, 2); return; }
  }
  if (F.step === 4 && F.kz) {
    if (Math.hypot(u.pos.x - FORT.x, u.pos.z - FORT.z) < FORT.r) { goTo(p, inp, FORT.x, FORT.z + FORT.r + 4, 1); return; }
    goTo(p, inp, F.kz.x, F.kz.z, 2); return;
  }
  goTo(p, inp, c.x + 2, c.z + 4, 3);
};

export { tennoji };
