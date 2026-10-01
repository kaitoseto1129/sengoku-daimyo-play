// ======================================================================
// 山岳戦　越前一向一揆の山の寺（大滝寺）攻め（docs/siege-plan.md 7-9・mountain-spec 32）
// 天正三年（1575）八月。信長は大軍で越前へ攻め入り、一向一揆は山々の寺に拠って抗った。
// ここは夜と霧の中、柴田勝家の手が山の寺（大滝寺）を攻める一戦。攻め方の作戦三つで結果が変わる
// （木ノ芽峠 b_kinome.js の F9 と同じ仕組み）。比叡山（b_hiei_mtn.js）を手本に、使い回しで作った。
//
// 守る側の山（援軍まで寺の区域を守る型）は、同じ縄張り・同じ部品で、同じファイルの中の切り替えで
// 作る（window.__echizenMode==='defend'。siege_zones.js の reinforceAt／onReinforce を使う。
// b_sunomata.js の「守る砦」と同じ組み合わせ）。lord.js・battles.js には攻め手の一戦だけを登録する。
// ======================================================================
import { hut, tawara, sakamogi } from './props.js';
import { hondo, doja, sobo, kura, monomidai, ishidan } from './temple_parts.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { enemyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeDefenseAI } from './siege_ai.js';
import { attachFireSpread } from './siege_fire.js';
import { nightAccuracyMult } from './siege_vis.js';
import { makeButai, butaiTick } from './butai.js';
import {
  ECHIZEN_IKKO_PLAN, VILLAGE, GATE_SOMON, GATE_SANMON, OKUYAMA,
  FOREST_POLY, SANDO, VALLEY_ROAD, OKU_ROAD,
} from './castles/echizen_ikko.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const IKKO = { armor: 0x2a2622, flag: 'namu' };
const ODA = { armor: 0x2b3140, flag: 'oda' };

// 守る側（defend）に切り替える時だけ使う（sim・bot の確かめ用。既定は攻め手）
function mode() { return window.__echizenMode === 'defend' ? 'defend' : 'attack'; }

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.05 - 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.045 + x * 0.03);
  h += Math.max(0, z + 205) * 0.38;      // 村から山の寺へ（南→北）、奥へ行くほど高く
  const dv = distToPolyline(x, z, VALLEY_ROAD);
  h -= Math.max(0, 14 - dv) * 0.35;      // 谷の道の周りはいくらか窪む（伏兵に向く）
  return h;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(ECHIZEN_IKKO_PLAN, baseTerrain, 3);
  return HEIGHT_FN(x, z);
}

// 部隊（Butai）の多点の道：着いたら次の点へ。最後まで着いたら attack（b_hiei_mtn.js と同じやり方）
function setRoute(b, pts) { b._route = pts; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: 'attack' }); b._route = null; return; }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z } });
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 10) advance(b);
  }
}
// 本物の兵の合計は 235 まで（butai.js の枠）。初めの本物は小さく持たせ、butai.js の _autoSwitch が増やす
function mkB(rt, o) { return makeButai(rt, { real: Math.min(14, o.nominal), ...o }); }

const echizen_ikko = {
  // 守る側（defend）は本堂の内（castles/echizen_ikko.js の hondo の中ほど）から始める。攻め手は山麓の村から
  get spawn() { return mode() === 'defend' ? { x: 0, z: 10, heading: Math.PI } : { x: VILLAGE.x, z: VILLAGE.z - 2, heading: 0 }; },
  world: {
    seed: 15750,
    time: 'night',
    mist: true,
    muddy: 0.1,
    terrainTags: true,   // 急斜面・石段・細道・森で速さ・向き変え・疲れ・当たりが変わる（terrain_tags.js）
    paths: [SANDO, VALLEY_ROAD, OKU_ROAD],
    height,
    tint(x, z, h, c) { if (inPoly(FOREST_POLY, x, z)) c.setRGB(c.r * 0.68, c.g * 0.8, c.b * 0.68); },
    clear: (x, z) => distToPolyline(x, z, SANDO) < 12 || distToPolyline(x, z, VALLEY_ROAD) < 12,
    trees: 1500,
    tufts: 2400,
    treeDensity: (x, z) => (inPoly(FOREST_POLY, x, z) ? 1.6 : 0.65),
    groves: [{ x: 32, z: -110, r: 20, n: 24 }, { x: 20, z: -10, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && (x < -70 || z < -215),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.fow = true;
    F.mode = mode();
    rt.__fireZones = {};
    flReset();

    const C = F.C = buildCastlePlan(rt, ECHIZEN_IKKO_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['gezan', 'hondo', 'oku'] });
    const gezanC = C.kuruwa.gezan.centroid, hondoC = C.kuruwa.hondo.centroid, okuC = C.kuruwa.oku.centroid;

    // ---- 寺の部品（temple_parts.js）：外堂（講堂・僧坊）・本堂（中心伽藍）・奥の院 ----
    rt.scene.add(sobo(W, gezanC.x - 6, gezanC.z + 6, 0.25), doja(W, gezanC.x + 9, gezanC.z - 4, -0.2));
    F.gezanKura = kura(W, gezanC.x + 7, gezanC.z + 8, 0.1);
    rt.scene.add(F.gezanKura);
    F.gezanKuraStruct = rt.army.addStruct({ x: gezanC.x + 7, z: gezanC.z + 8, r: 3, solidR: 3, hp: 150, maxHp: 150, armor: 0, team: 1, name: '外堂の倉', moraleOnBurn: 'small', flammable: true });

    F.hondoBldg = hondo(W, hondoC.x - 10, hondoC.z - 8, 0.1);
    rt.scene.add(F.hondoBldg, doja(W, hondoC.x + 11, hondoC.z + 6, -0.25));
    F.hondoStruct = rt.army.addStruct({ x: hondoC.x - 10, z: hondoC.z - 8, r: 5, solidR: 5, hp: 260, maxHp: 260, armor: 0, team: 1, name: '本堂', moraleOnBurn: 'big', flammable: true });
    rt.scene.add(ishidan(W, GATE_SANMON.x, GATE_SANMON.z, hondoC.x, hondoC.z - 4, 3.2));

    rt.scene.add(sobo(W, okuC.x - 7, okuC.z + 5, 0.2), hut(W, okuC.x + 7, okuC.z - 6, 5, 4, -0.15));
    rt.scene.add(hut(W, gezanC.x - 2, gezanC.z - 10, 5, 4, 0.1), tawara(W, gezanC.x - 2, gezanC.z - 6, 0, 2));
    rt.scene.add(monomidai(W, 30, -34, 0));
    for (const [x, z, r] of [[GATE_SANMON.x - 8, GATE_SANMON.z - 2, 0.2], [GATE_SANMON.x + 8, GATE_SANMON.z - 2, -0.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 木戸（惣門・山門） ----
    F.gateSomon = kido(rt, GATE_SOMON.x, GATE_SOMON.z, 3.2, 0, { team: 1, hp: 220, name: GATE_SOMON.name, gate: 0 });
    F.gateSanmon = kido(rt, GATE_SANMON.x, GATE_SANMON.z, 3.4, 0, { team: 1, hp: 260, name: GATE_SANMON.name, gate: 1 });

    // ---- 区域の網と退路（siege_zones.js） ----
    const okuyamaTest = (x, z) => Math.hypot(x - OKUYAMA.x, z - OKUYAMA.z) < 22;

    if (F.mode === 'attack') {
      // ===== 攻め手（player＝柴田勝家の手）：越前一向一揆の山の寺を攻め落とす =====
      F.ikkoGezanSpear = mkB(rt, { name: '外堂の一揆勢（薙刀）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 46, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x, z: gezanC.z - 6 }, facing: Math.PI });
      F.ikkoGezanBow = mkB(rt, { name: '外堂の一揆勢（弓）', team: 1, faction: 'ikko', kind: 'bow', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x + 6, z: gezanC.z - 2 }, facing: Math.PI });
      F.ikkoHondoMain = mkB(rt, { name: '大滝寺の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 60, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 10 }, facing: Math.PI });
      F.ikkoHondoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 1, faction: 'ikko', kind: 'gun', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z - 4 }, facing: Math.PI });
      F.ikkoOkuLast = mkB(rt, { name: '奥の院の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 42, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x, z: okuC.z - 6 }, facing: Math.PI });
      F.ikkoCounter = mkB(rt, { name: '一揆の逆襲の手', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 22, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x - 4, z: okuC.z + 8 }, facing: Math.PI });
      F.ikkoAmbush = mkB(rt, { name: '一揆の伏兵（谷筋）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 26, armor: IKKO.armor, flag: IKKO.flag, at: { x: 30, z: -70 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoGezanSpear, F.ikkoGezanBow, F.ikkoHondoMain, F.ikkoHondoBow, F.ikkoOkuLast, F.ikkoCounter, F.ikkoAmbush];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      F.commander = { alive: true };   // 一揆の指導者は討たれず加賀へ逃れた扱い

      F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 14, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 4 }, facing: 0 });
      F.mainSpear = mkB(rt, { name: '柴田勝家の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.mainGun = mkB(rt, { name: '柴田勝家の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.flankSpear = mkB(rt, { name: '前田利家の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.flankBow = mkB(rt, { name: '佐々成政の手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 26, z: VILLAGE.z + 6 }, facing: 0 });
      F.reserve = mkB(rt, { name: '予備', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 60, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 8, z: VILLAGE.z - 10 }, facing: 0 });
      F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        zones: [
          { id: 'gezan', name: '外堂（講堂・僧坊）', test: C.kuruwa.gezan.test, pos: gezanC, need: 5, hold: 12, next: 'hondo' },
          { id: 'hondo', name: '本堂（中心伽藍）', test: C.kuruwa.hondo.test, pos: hondoC, need: 7, hold: 16, honmaru: true, gate: GATE_SANMON.name, next: 'oku' },
          { id: 'oku', name: '奥の院', test: C.kuruwa.oku.test, pos: okuC, need: 4, hold: 12, next: 'okuyama' },
          { id: 'okuyama', name: OKUYAMA.name, test: okuyamaTest, pos: OKUYAMA, need: 3, hold: 8 },
        ],
        links: [['gezan', 'hondo'], ['hondo', 'oku'], ['oku', 'okuyama']],
        friendTeam: 0, enemyTeam: 1,
        totalDefenders: F.defendTotal,
        commander: () => F.commander,
        noReinforce: () => true,
        escape: { zoneId: 'okuyama', rally: { x: OKUYAMA.x - 24, z: OKUYAMA.z + 14 } },
        onFall: (id) => this.onZoneFall(rt, id),
        onHonmaru: () => this.win(rt),
        onSurrender: () => this.win(rt),
      });

      // 山の頭（siege_ai.js）：夜と霧は伏兵に近付くまで気付きにくい（revealRange を nightAccuracyMult ぶん縮める）
      const nmul = nightAccuracyMult(W);
      F.AMB = makeMountainAmbush(rt, {
        zones: F.SZ,
        posts: [{ id: 'valley', butai: F.ikkoAmbush, at: { x: 28, z: -66 }, cover: '谷筋・霧の中', revealRange: 20 * nmul, routeZoneId: 'gezan', concentrateShare: 0.35, side: 'flank' }],
      });
      F.MD = makeMountainDefense(rt, {
        zones: F.SZ,
        posts: [
          { id: 'gezan_s', butai: F.ikkoGezanSpear, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'gezan_b', butai: F.ikkoGezanBow, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'hondo_s', butai: F.ikkoHondoMain, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'hondo_b', butai: F.ikkoHondoBow, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'oku_s', butai: F.ikkoOkuLast, at: okuC, fireZoneId: 'oku' },
        ],
        counter: { butai: F.ikkoCounter, from: '奥の院', watch: 'gezan_s' },
      });
      F.FS = attachFireSpread(rt, { onGranary: () => { rt.__fireZones.gezan = true; } });

      const n = Math.max(RANKS[rt.G.rank].squad || 0, 7);
      rt.makeSquad({ x: VILLAGE.x - 4, z: VILLAGE.z - 4 }, 0, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', hi(rt) ? '柴田勝家の先手の一隊を預かり、夜討ちで大滝寺を攻め落とせ' : '柴田勝家のもとで、下知を待て', 'main');
      rt.say('柴田勝家', `${nm(rt)}、霧が出ておる。夜の内に外堂を落とし、本堂まで一息に攻め上る`, 5);
      rt.say('柴田勝家', '谷筋には一揆の伏兵がおるとの噂じゃ。油断すな', 4);
      rt.marker('main', unitPos(F.mainSpear.real.units[0]), '柴田勝家', {});
      rt.after(14, () => this.assault(rt));
    } else {
      // ===== 守る側（defend）：越前一向一揆として、援軍（加賀門徒）が来るまで本堂を守りきる =====
      // siege_zones.js の reinforceAt／onReinforce（b_sunomata.js の「守る砦」と同じ組み合わせ）を使う。
      F.ikkoMain = mkB(rt, { name: '大滝寺の衆徒', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 70, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 8 }, facing: Math.PI });
      F.ikkoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 0, faction: 'ikko', kind: 'gun', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z - 4 }, facing: Math.PI });
      F.ikkoAmbushD = mkB(rt, { name: '衆徒の伏兵（谷筋）', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: { x: 28, z: -66 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoMain, F.ikkoBow, F.ikkoAmbushD];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.odaMain = mkB(rt, { name: '柴田勝家の手（槍）', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 130, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z }, facing: 0 });
      F.odaGun = mkB(rt, { name: '柴田勝家の手（鉄砲）', team: 1, faction: 'oda', kind: 'gun', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 6, z: VILLAGE.z }, facing: 0 });
      F.odaFlank = mkB(rt, { name: '前田利家の手', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 90, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 20, z: VILLAGE.z + 6 }, facing: 0 });
      F.attackers = [F.odaMain, F.odaGun, F.odaFlank];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        zones: [{ id: 'hondo', name: '本堂', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 8, start: ZONE_STATE.FRIEND }],
        friendTeam: 0, enemyTeam: 1,
        noReinforce: () => true,
        reinforceAt: { zoneId: 'hondo', sec: 150 },
        onReinforce: () => this.reinforceArrive(rt),
      });
      F.DA = makeDefenseAI(rt, {
        posts: [{ id: 'hondo', butai: F.ikkoMain, at: hondoC, ambush: false }, { id: 'valley', butai: F.ikkoAmbushD, at: { x: 28, z: -66 }, ambush: true, revealRange: 20 * nightAccuracyMult(W) }],
        reserves: [F.ikkoBow],
        fallback: { x: okuC.x, z: okuC.z },
      });
      // 攻め手（村で勢揃いしてから、参道・谷の道を本堂まで歩く＝攻め手の assault() と同じ setRoute／tickRoutes を使う。
      // makeMountainAttack の「入口まで move して hold」だけでは本堂まで進まず、援軍の方が先に来てしまうので使わない
      rt.after(10, () => {
        if (F.ending) return;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, [...SANDO.slice(1)]);
        setRoute(F.odaFlank, [...VALLEY_ROAD]);
      });

      const n = Math.max(RANKS[rt.G.rank].squad || 0, 6);
      rt.makeSquad({ x: hondoC.x + 4, z: hondoC.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', '援軍（加賀門徒）が来るまで、本堂を守りきれ', 'main');
      rt.say('大滝寺の衆徒', `${nm(rt)}、織田の手が麓に押し寄せておる。本堂を枕に、加賀の門徒衆が来るまで持ちこたえよ`, 5);
      rt.marker('main', hondoC, '本堂', { red: false });
    }
  },

  // ① 物見を先に出し、作戦に応じて参道（表）・谷の道に分かれる（木ノ芽峠 b_kinome.js F9 と同じ三択）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('main');
    sfx('horagai', 0.85);
    rt.obj('main', '外堂を落とし、本堂へ夜討ちをかけよ', 'main');
    setRoute(F.scout, [[20, -150]]);
    rt.after(6, () => { F.scouted = true; rt.bark('物見が戻った。谷筋に人影あり、との事'); });

    const strat = F.strategy = F.strategy || 'valley';
    if (strat === 'front') {
      // ①正面：参道一本で真っ直ぐ本堂を目指す（早いが、外堂で削れぬ分、本堂の守りが厚いまま）
      rt.say('柴田勝家', '谷へは分けぬ。皆、参道より真っ直ぐ本堂を目指せ', 4);
      for (const b of [F.mainSpear, F.mainGun, F.flankSpear, F.flankBow]) setRoute(b, [...SANDO.slice(1)]);
    } else if (strat === 'fire') {
      // ③火攻め：まず外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気は削れるが、攻め手も見通しが悪くなる）
      rt.say('柴田勝家', 'まず外堂に火を放て。煙と霧に紛れて進む', 4);
      rt.after(8, () => {
        if (F.ending) return;
        rt.army.igniteStruct(F.gezanKuraStruct, { x: F.gezanKuraStruct.x, z: F.gezanKuraStruct.z });
        rt.__fireZones.gezan = true;
        rt.banner('外堂に火の手が上がる', '煙が夜霧に混じり、あたりが見えにくくなる');
      });
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...SANDO.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...VALLEY_ROAD]);
    } else {
      // ②谷から回る（既定・strat==='valley'）：主力は参道、前田・佐々の手は谷の道から回り込み、本堂を挟み撃つ
      rt.say('前田利家', '谷の道から回り込み、本堂の裏を突き申す', 3.5);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...SANDO.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...VALLEY_ROAD]);
    }
    rt.marker('gezan', centerOf(F.ikkoGezanSpear.real), () => `外堂の一揆勢・${moraleWord(F.ikkoGezanSpear.morale)}`, { red: true });
    rt.marker('hondo', centerOf(F.ikkoHondoMain.real), () => `本堂・${moraleWord(F.ikkoHondoMain.morale)}`, { red: true });
  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'gezan' && !F.gezanFell) {
      F.gezanFell = true;
      rt.banner('外堂を落とした', '守りは本堂へ退く');
      if (!rt.__fireZones.gezan) { rt.army.igniteStruct(F.gezanKuraStruct, { x: F.gezanKuraStruct.x, z: F.gezanKuraStruct.z }); rt.__fireZones.gezan = true; }
      rt.unmark('gezan');
      F.scouted = true;
      rt.obj('block', '奥山道（加賀側）をふさげば、なお崩れやすい', 'side');
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gezan'); rt.unmark('hondo');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '越前一向一揆の山の寺を攻め落とした', pts: 22 }; }, '任務達成・大滝寺を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('本堂、落ちる', '一揆の衆徒は討たれ、あるいは加賀へ落ちのびた');
    rt.say('柴田勝家', `${nm(rt)}、山の寺は落ちた。……越前は、これで静まろう`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 守る側：加賀門徒の援軍が来た（siege_zones の onReinforce）
  reinforceArrive(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    const reinforce = enemyGroup(rt, { faction: 'ikko', name: '加賀門徒の援軍', anchor: { x: OKUYAMA.x, z: OKUYAMA.z }, facing: Math.PI }, [{ type: 'ashigaru', n: 40 }]);
    reinforce.team = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '加賀門徒の援軍が来るまで本堂を守りきった', pts: 20 }; }, '任務達成・本堂を守りきった');
    sfx('kane', 0.5);
    rt.banner('加賀門徒、来援', '援軍の旗が、山の下に見える');
    rt.say('大滝寺の衆徒', `${nm(rt)}、加賀の門徒衆が参ったぞ！　よう持ちこたえた`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    butaiTick(rt, dt);
    if (F.ending) return;
    if (F.SZ) F.SZ.tick(dt);
    if (F.AMB) F.AMB.tick(dt);
    if (F.MD) F.MD.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.FS) F.FS.tick(dt);
    if ((F.mode === 'attack' && F.step >= 1) || F.mode === 'defend') tickRoutes(F.attackers);
    if (F.mode === 'attack') {
      if (F.gezanFell && !F.hondoBurning && rt.t - F.stepT > 60) {
        F.hondoBurning = true;
        rt.army.igniteStruct(F.hondoStruct, { x: F.hondoStruct.x, z: F.hondoStruct.z });
        rt.__fireZones.hondo = true;
        rt.banner('本堂から煙', '山の上から、黒い煙が夜霧に混じって上がる');
      }
      if (F.step >= 1) {
        const st = F.SZ ? F.SZ.stat() : {};
        if (!F.gezanFell) rt.objProgress('main', `外堂・${st.gezan ? st.gezan.state : ''}`);
        else if (!F.ending) rt.objProgress('main', `本堂・${st.hondo ? st.hondo.state : ''}`);
      }
      if (rt.t - (F.stepT || 0) > 480 && !F.ending) this.win(rt);
    } else {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.ending) rt.objProgress('main', `本堂・${st.hondo ? st.hondo.state : ''}`);
      if (rt.t > 420 && !F.ending) this.win(rt);   // 確かめを止めない保険（援軍が間に合わなかった扱い）
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    void k;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

echizen_ikko.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return F.mode === 'attack' ? { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 } : { a: b, a0: F.defendTotal || 1, b: a, b0: F.attackTotal || 1 };
};
echizen_ikko.sides = { a: { name: '織田軍（柴田勝家・前田利家）', mon: 'oda' }, b: { name: '越前一向一揆・大滝寺の衆徒', mon: 'namu' } };
echizen_ikko.famous = [
  { name: '柴田勝家', team: 0, line: '夜のうちに外堂を落とせ。本堂まで一息じゃ' },
  { name: '前田利家', team: 0, line: '谷の道から回り込み申す' },
  { name: '大滝寺の衆徒', team: 1, g: /本堂/, loose: 1, line: '阿弥陀仏の御山ぞ！　退くな！' },
];
echizen_ikko.date = () => '天正三年（1575）八月　夜・霧';
echizen_ikko.history = '天正三年（1575）八月、信長は大軍で越前へ攻め入り、一向一揆の立て籠もる山々の寺や砦を次々に攻め落とした。柴田勝家・前田利家・佐々成政らの手が各地の山の寺を囲み、多くの衆徒が討たれ、あるいは加賀へ落ちのびた。ここでは夜討ちと霧の中、山の寺（大滝寺）を攻める一戦として、作戦によって結果の変わる仕組みの見本にした。死者の数には諸説ある。';

// 軍議（gungi.js と同じ考え方。b_kinome.js F9・b_hiei_mtn.js と同じ作り）：三つの作戦から一つを選ぶ
//   ①front：参道一本で真っ直ぐ本堂へ（早いが、本堂の守りが厚いまま）
//   ②valley（既定）：前田・佐々の手が谷の道から回り込み、本堂を挟み撃つ（伏兵に遭いやすいが崩しやすい）
//   ③fire：先に外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気を削るが、攻め手も見通しが悪くなる）
echizen_ikko.gungi = (rt) => {
  const F = rt.flags;
  if (F.mode !== 'attack') return null;   // 守る側は作戦を選ばない（AI 任せ。setRoute で参道・谷の道を歩かせる）
  const G = {
    center: { x: 0, z: -60 }, dist: 110,
    units: [{ id: 'plan', name: '攻め方（柴田勝家・前田利家の手）', group: () => F.mainSpear && F.mainSpear.real }],
    routes: [
      { id: 'front', name: '参道一本で真っ直ぐ本堂へ攻め上る' },
      { id: 'valley', name: '谷の道から回り込み、本堂を挟み撃つ' },
      { id: 'fire', name: '先に外堂へ火を放ち、煙に紛れて進む' },
    ],
    default: { plan: 'valley' },
    enemy: [
      { name: '外堂の一揆勢', known: true, count: () => (F.ikkoGezanSpear ? F.ikkoGezanSpear.aliveNominal() : 0) + (F.ikkoGezanBow ? F.ikkoGezanBow.aliveNominal() : 0) },
      { name: '大滝寺の衆徒（本堂）', known: false },
      { name: '一揆の伏兵（谷筋の噂）', known: false },
    ],
    onStart: (assign) => echizen_ikko.onGungiStart(rt, assign),
  };
  const auto = window.__echizenStrategy || (/[?&]bot/.test(location.search) ? 'valley' : null);
  if (auto) { echizen_ikko.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
echizen_ikko.onGungiStart = (rt, assign) => {
  rt.flags.strategy = (assign && assign.plan) || 'valley';
};

// 素直な遊び手：敵へ向かって戦い、無ければ本堂（攻め手）か持ち場（守り手）へ。深手の時は味方の中へ下がる
echizen_ikko.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const back = F.mode === 'attack' ? (F.mainSpear ? F.mainSpear.pos : { x: u.pos.x, z: u.pos.z - 6 }) : (F.ikkoMain ? F.ikkoMain.pos : { x: u.pos.x, z: u.pos.z });
  if (u.hp < u.maxHp * 0.45) {
    inp.guardHold = (b.army.threats || []).length > 0;
    goTo(p, inp, back.x, back.z, 4);
    return;
  }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    const press = (b.army.threats || []).length;
    inp.guardHold = press > 0 && Math.random() < Math.min(0.95, 0.6 + press * 0.15);
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, back.x, back.z + 4, 3);
};

export { echizen_ikko };
