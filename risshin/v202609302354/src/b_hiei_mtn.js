// ======================================================================
// 山岳戦 M5　比叡山（延暦寺）攻め（docs/siege-plan.md M5・mountain-spec 33）
// 元亀二年（1571）九月十二日。明智光秀・佐久間信盛らの手が、坂本から山道を登った。
// 攻め：小さな部隊（主力・尾根の手・物見・予備・封鎖）。守り：僧兵と浅井・朝倉の残党（区域ごとに小さく）。
// 流れ：山麓で配置→物見→参道と無動寺坂に分かれる→無動寺谷の外堂を取る→伏兵か火→戦が散る→
//       尾根か中心の堂（根本中堂）を取る→守りが奥へ→退路（雲母坂）を断つか中心を攻める→決着。
// butai.js（S1）・siege_zones.js（F3・M3）・siege_ai.js（F4・M6）・siege_vis.js/siege_fire.js（M7）を使う。
// 今の b_hieizan.js（足軽の四段・非戦の者を討たない副任務）はそのまま残す。これは別の id の MVP。
// ======================================================================
import { hut, tawara, sakamogi } from './props.js';
import { hondo, kura, sobo, doja, monomidai, ishidan } from './temple_parts.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { enemyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { kido } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeMountainAttack } from './siege_ai.js';
import { attachFireSpread } from './siege_fire.js';
import { makeButai, butaiTick } from './butai.js';
import {
  HIEI_PLAN, SAKAMOTO_GATE, MUDOJI_TRAILHEAD, GATE_TODO, GATE_SAITO, KIRARA,
  FOREST_POLY, HONZAKA, MUDOJIZAKA, RIDGE, VALLEY, KIRARA_ROAD,
} from './castles/hiei.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const SOHEI = { armor: 0x2a2622, flag: null };
const ASAI = { armor: 0x3a3428, flag: null };
const ODA = { armor: 0x2b3140, flag: 'oda' };

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.045 + 0.3) * Math.cos(z * 0.04) + 0.35 * Math.sin(z * 0.05 - x * 0.03);
  h += Math.max(0, z + 192) * 0.42;      // 坂本から山へ（南→北）
  h += Math.max(0, -x - 10) * 0.30;      // 西の西塔・雲母坂へ、さらに高く
  const dv = distToPolyline(x, z, VALLEY);
  h -= Math.max(0, 16 - dv) * 0.4;       // 谷道の周りはいくらか窪む
  return h;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(HIEI_PLAN, baseTerrain, 3);
  return HEIGHT_FN(x, z);
}

// 部隊（Butai）の多点の道：着いたら次の点へ。最後まで着いたら attack（makeMountainAttack・siege_ai の
// order は一点きりなので、ここで待ち合わせの点を並べて次へ渡す＝ b_kinome.js の walkRoute の Butai 版）
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
// 本物の兵の合計は 235 まで（butai.js の枠）。14 の部隊を並べるので、初めの本物は小さく持たせ、
// 戦い・自分の近くに寄った部隊から butai.js の _autoSwitch が自分で増やす（手で増やさない）
function mkB(rt, o) { return makeButai(rt, { real: Math.min(14, o.nominal), ...o }); }

const hiei_mtn = {
  spawn: { x: SAKAMOTO_GATE.x, z: SAKAMOTO_GATE.z - 2, heading: 0 },
  world: {
    seed: 15920,
    time: 'day',
    mist: true,
    muddy: 0.15,
    terrainTags: true,   // M1：急斜面・石段・細道・森で速さ・向き変え・疲れ・当たりが変わる（terrain_tags.js）
    paths: [HONZAKA, MUDOJIZAKA, RIDGE, VALLEY],
    height,
    tint(x, z, h, c) { if (inPoly(FOREST_POLY, x, z)) c.setRGB(c.r * 0.74, c.g * 0.86, c.b * 0.74); },
    clear: (x, z) => distToPolyline(x, z, HONZAKA) < 12 || distToPolyline(x, z, MUDOJIZAKA) < 12 || distToPolyline(x, z, RIDGE) < 12,
    trees: 1400,
    tufts: 2600,
    treeDensity: (x, z) => (inPoly(FOREST_POLY, x, z) ? 1.5 : 0.7),
    groves: [{ x: 20, z: -120, r: 20, n: 24 }, { x: 55, z: -30, r: 18, n: 20 }],
    fleeOut: (x, z, team) => team === 1 && (x < -110 || z < -210),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.fow = true;           // M7：小地図・軍配は見張りの届かない敵を隠す（siege_vis.js）
    rt.__fireZones = {};    // M6：区域が燃えたら true にする（makeMountainDefense が見る）
    flReset();

    const C = F.C = buildCastlePlan(rt, HIEI_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['mudoji', 'todo', 'saito'] });
    const mudojiC = C.kuruwa.mudoji.centroid, todoC = C.kuruwa.todo.centroid, saitoC = C.kuruwa.saito.centroid;

    // ---- 寺の部品（temple_parts.js。M2）：無動寺谷の外堂・東塔（根本中堂）・西塔 ----
    rt.scene.add(sobo(W, mudojiC.x - 6, mudojiC.z + 8, 0.3));
    F.mudojiKura = kura(W, mudojiC.x + 8, mudojiC.z - 4, -0.2);
    rt.scene.add(F.mudojiKura);
    F.mudojiKuraStruct = rt.army.addStruct({ x: mudojiC.x + 8, z: mudojiC.z - 4, r: 3, solidR: 3, hp: 160, maxHp: 160, armor: 0, team: 1, name: '無動寺谷の倉', moraleOnBurn: 'small', flammable: true });

    F.hondo = hondo(W, todoC.x - 10, todoC.z - 8, 0.15);
    rt.scene.add(F.hondo, doja(W, todoC.x + 12, todoC.z + 6, -0.3));
    F.hondoStruct = rt.army.addStruct({ x: todoC.x - 10, z: todoC.z - 8, r: 5, solidR: 5, hp: 260, maxHp: 260, armor: 0, team: 1, name: '根本中堂', moraleOnBurn: 'big', flammable: true });
    rt.scene.add(ishidan(W, GATE_TODO.x, GATE_TODO.z, todoC.x, todoC.z - 4, 3.2));

    rt.scene.add(sobo(W, saitoC.x - 8, saitoC.z + 6, 0.2), doja(W, saitoC.x + 10, saitoC.z - 6, -0.15));
    rt.scene.add(hut(W, mudojiC.x - 2, mudojiC.z - 12, 5, 4, 0.1), tawara(W, mudojiC.x - 2, mudojiC.z - 8, 0, 2));
    rt.scene.add(monomidai(W, -20, 118, 0));
    for (const [x, z, r] of [[GATE_TODO.x - 8, GATE_TODO.z - 2, 0.2], [GATE_TODO.x + 8, GATE_TODO.z - 2, -0.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 木戸（山門代わり。castle_parts.js を使い回す） ----
    F.gateTodo = kido(rt, GATE_TODO.x, GATE_TODO.z, 3.4, 0, { team: 1, hp: 260, name: GATE_TODO.name, gate: 0 });
    F.gateSaito = kido(rt, GATE_SAITO.x, GATE_SAITO.z, 3.0, Math.PI / 2, { team: 1, hp: 220, name: GATE_SAITO.name, gate: 1 });

    // ---- 守り（僧兵・浅井朝倉の残党）。区域ごとに小さく（butai.js） ----
    // 前の流しで足軽の身の bot が重傷で負けたため、攻め手を厚く・守りをやや薄くして釣り合いを取った（M8）
    F.mudojiSpear = mkB(rt, { name: '無動寺谷の僧兵（薙刀）', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 48, armor: SOHEI.armor, flag: SOHEI.flag, at: { x: mudojiC.x, z: mudojiC.z - 6 }, facing: Math.PI });
    // 一番手前（無動寺谷）の弓は、足軽の身の bot が一人で先に出て的になり倒れやすかったため、薄くした（M9・原因を測って）
    F.mudojiBow = mkB(rt, { name: '無動寺谷の僧兵（弓）', team: 1, faction: 'saito', kind: 'bow', nominal: 6, armor: SOHEI.armor, flag: SOHEI.flag, at: { x: mudojiC.x + 6, z: mudojiC.z - 2 }, facing: Math.PI });
    F.todoMain = mkB(rt, { name: '正覚院豪盛の衆', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 64, armor: SOHEI.armor, flag: SOHEI.flag, at: { x: todoC.x, z: todoC.z - 10 }, facing: Math.PI });
    F.todoBow = mkB(rt, { name: '東塔の僧兵（弓）', team: 1, faction: 'saito', kind: 'bow', nominal: 16, armor: SOHEI.armor, flag: SOHEI.flag, at: { x: todoC.x - 10, z: todoC.z - 4 }, facing: Math.PI });
    F.saitoLast = mkB(rt, { name: '西塔の僧兵', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 48, armor: SOHEI.armor, flag: SOHEI.flag, at: { x: saitoC.x, z: saitoC.z - 6 }, facing: Math.PI });
    F.counter = mkB(rt, { name: '浅井・朝倉の残党（逆襲の手）', team: 1, faction: 'asai', kind: 'ashigaru', nominal: 24, armor: ASAI.armor, flag: ASAI.flag, at: { x: saitoC.x - 4, z: saitoC.z + 10 }, facing: Math.PI });
    // 伏兵は revealRange（20m）に近づくだけでも出る。一人で先に谷筋へ踏み込んだ bot が、30人の伏兵へ
    // そのまま囲まれて倒れやすかったため、人数を絞った（原因を測って・M9）
    F.ambush = mkB(rt, { name: '浅井・朝倉の残党（伏兵）', team: 1, faction: 'asai', kind: 'ashigaru', nominal: 18, armor: ASAI.armor, flag: ASAI.flag, at: { x: 26, z: -34 }, facing: -Math.PI / 2 });
    F.defenders = [F.mudojiSpear, F.mudojiBow, F.todoMain, F.todoBow, F.saitoLast, F.counter, F.ambush];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.commander = { alive: true };   // 豪盛は史実では討たれず甲斐へ逃れた（討たれない扱いにする）

    // ---- 攻め（明智光秀・佐久間信盛らの手）。小さな部隊（butai.js） ----
    F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 16, armor: ODA.armor, flag: ODA.flag, at: { x: SAKAMOTO_GATE.x, z: SAKAMOTO_GATE.z + 4 }, facing: 0 });
    F.mainSpear = mkB(rt, { name: '明智光秀の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 140, armor: ODA.armor, flag: ODA.flag, at: { x: SAKAMOTO_GATE.x, z: SAKAMOTO_GATE.z }, facing: 0 });
    F.mainGun = mkB(rt, { name: '明智光秀の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 55, armor: ODA.armor, flag: ODA.flag, at: { x: SAKAMOTO_GATE.x + 6, z: SAKAMOTO_GATE.z }, facing: 0 });
    F.flankSpear = mkB(rt, { name: '佐久間信盛の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 105, armor: ODA.armor, flag: ODA.flag, at: { x: MUDOJI_TRAILHEAD.x, z: MUDOJI_TRAILHEAD.z }, facing: 0 });
    F.flankBow = mkB(rt, { name: '佐久間信盛の手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 42, armor: ODA.armor, flag: ODA.flag, at: { x: MUDOJI_TRAILHEAD.x + 6, z: MUDOJI_TRAILHEAD.z }, facing: 0 });
    F.reserve = mkB(rt, { name: '予備', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 65, armor: ODA.armor, flag: ODA.flag, at: { x: SAKAMOTO_GATE.x - 8, z: SAKAMOTO_GATE.z - 10 }, facing: 0 });
    F.block = mkB(rt, { name: '封鎖の手', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: SAKAMOTO_GATE.x - 16, z: SAKAMOTO_GATE.z - 6 }, facing: 0 });
    F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve, F.block];
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of F.attackers) b.order({ id: 'hold' });
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ---- 区域の網と退路（siege_zones.js。M3） ----
    const kiraraTest = (x, z) => Math.hypot(x - KIRARA.x, z - KIRARA.z) < 22;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'mudoji', name: '無動寺谷の外堂', test: C.kuruwa.mudoji.test, pos: mudojiC, need: 5, hold: 12, next: 'todo' },
        { id: 'todo', name: '東塔（根本中堂）', test: C.kuruwa.todo.test, pos: todoC, need: 7, hold: 16, honmaru: true, gate: GATE_TODO.name, next: 'saito' },
        { id: 'saito', name: '西塔', test: C.kuruwa.saito.test, pos: saitoC, need: 5, hold: 14, gate: GATE_SAITO.name, next: 'kirara' },
        { id: 'kirara', name: '雲母坂（退路）', test: kiraraTest, pos: KIRARA, need: 4, hold: 8 },
      ],
      links: [['mudoji', 'todo'], ['todo', 'saito'], ['saito', 'kirara']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: F.defendTotal,
      commander: () => F.commander,
      noReinforce: () => true,
      escape: { zoneId: 'kirara', rally: { x: KIRARA.x - 40, z: KIRARA.z + 10 } },
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.win(rt),
      onSurrender: () => this.win(rt),
    });

    // ---- 山の頭（siege_ai.js・M6） ----
    F.AMB = makeMountainAmbush(rt, {
      zones: F.SZ,
      // concentrateShare は既定（0.55）へ戻した：先に一人で突っ込む bot が、攻め手のごく一部でも「集中」と見なされて
      // 早く伏兵に出られ、始まってすぐ囲まれていた（原因を測って・M9）
      posts: [{ id: 'valley', butai: F.ambush, at: { x: 24, z: -32 }, cover: '谷筋', revealRange: 20, routeZoneId: 'mudoji', side: 'flank' }],
    });
    F.MD = makeMountainDefense(rt, {
      zones: F.SZ,
      posts: [
        { id: 'mudoji_s', butai: F.mudojiSpear, at: mudojiC, next: 'todo_s', fireZoneId: 'mudoji' },
        { id: 'mudoji_b', butai: F.mudojiBow, at: mudojiC, next: 'todo_b', fireZoneId: 'mudoji' },
        { id: 'todo_s', butai: F.todoMain, at: todoC, next: 'saito_s', fireZoneId: 'todo' },
        { id: 'todo_b', butai: F.todoBow, at: todoC, next: 'saito_s', fireZoneId: 'todo' },
        { id: 'saito_s', butai: F.saitoLast, at: saitoC, fireZoneId: 'saito' },
      ],
      counter: { butai: F.counter, from: '西塔', watch: 'mudoji_s' },
    });
    F.FS = attachFireSpread(rt, { onGranary: () => { rt.__fireZones.mudoji = true; } });
    // 封鎖の手（M6・makeMountainAttack）：無動寺谷が落ちて退路が見えた時に、雲母坂へ塞ぎに走らせる（onZoneFall で呼ぶ）
    F.MA = makeMountainAttack(rt, { block: [F.block], routes: [], scouted: () => F.scouted, escapeZone: { x: KIRARA.x, z: KIRARA.z }, fog: () => !!rt.world.mist });

    // 前の流しは足軽（身分0・組0）が一人で山道へ出て、弓の的になって重傷で倒れた。ここは山の MVP（史実の狭い山道）
    // なので、身分に関わらず小さな組（盾になる仲間）を必ず付ける（M8：足軽の身でも遊べる釣り合い）
    const n = Math.max(RANKS[rt.G.rank].squad || 0, 7);
    rt.makeSquad({ x: SAKAMOTO_GATE.x - 4, z: SAKAMOTO_GATE.z - 4 }, 0, [{ kind: 'spear', n }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '明智光秀の先手の一隊を預かり、山道を登って延暦寺を攻めよ' : '明智光秀のもとで、下知を待て', 'main');
    rt.obj('civ', '刃向かわぬ者（僧・里の者）は討つな', 'side');
    rt.say('明智光秀', `${nm(rt)}、山門より奥に浅井・朝倉をかくまう僧坊がある。坂本から二手に分けて登る`, 5);
    rt.say('明智光秀', '刃向かう僧兵とは戦え。じゃが、逃げる者、手向かわぬ者は追うな', 4.5);
    rt.marker('main', unitPos(F.mainSpear.real.units[0]), '明智光秀', {});
    rt.after(14, () => this.assault(rt));
  },

  // ① 物見を先に出し、参道（明智）・無動寺坂（佐久間）に分かれて登る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('main');
    sfx('horagai', 0.85);
    rt.obj('main', '無動寺谷の外堂を落とし、東塔の根本中堂へ攻め上れ', 'main');
    setRoute(F.scout, [[MUDOJI_TRAILHEAD.x, MUDOJI_TRAILHEAD.z - 40]]);
    rt.after(6, () => { F.scouted = true; rt.bark('物見が戻った。谷筋に人影あり、との事'); });

    const strat = F.strategy = F.strategy || 'valley';
    if (strat === 'front') {
      // ① 正面の参道だけ：無動寺坂へは分けず、皆で参道を真っ直ぐ登る（外堂を素通りする分、早いが中堂で正面から全軍とぶつかる）
      rt.say('明智光秀', '無動寺坂へは分けぬ。皆、参道より真っ直ぐ中堂を目指せ', 4);
      for (const b of [F.mainSpear, F.mainGun, F.flankSpear, F.flankBow]) setRoute(b, [...HONZAKA.slice(1)]);
    } else if (strat === 'block') {
      // ④ 退路を封鎖してから中心へ：封鎖の手を先に雲母坂へ、他は無動寺坂から登る（守りを閉じ込める分、時はかかる）
      rt.say('明智光秀', '封鎖の手をまず雲母坂へ。無動寺谷はそれがしと佐久間殿の手で押さえる', 4);
      setRoute(F.block, [...KIRARA_ROAD]);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...HONZAKA.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...MUDOJIZAKA.slice(1)]);
    } else {
      // ② 尾根を先に取る（strat==='ridge'）・③ 谷から回る（既定。伏兵に遭う）：登りは同じで、外堂の後で分かれる
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, [...HONZAKA.slice(1)]);
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...MUDOJIZAKA.slice(1)]);
    }
    rt.marker('mudoji', centerOf(F.mudojiSpear.real), () => `無動寺谷の僧兵・${moraleWord(F.mudojiSpear.morale)}`, { red: true });
    rt.marker('todo', centerOf(F.todoMain.real), () => `根本中堂・${moraleWord(F.todoMain.morale)}`, { red: true });
  },

  // 区域が落ちた（siege_zones.js の onFall。M3）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'mudoji' && !F.mudojiFell) {
      F.mudojiFell = true;
      rt.banner('無動寺谷の外堂を落とした', '守りは奥（東塔）へ退く');
      rt.army.igniteStruct(F.mudojiKuraStruct, { x: F.mudojiKuraStruct.x, z: F.mudojiKuraStruct.z });
      rt.__fireZones.mudoji = true;
      rt.unmark('mudoji');
      if (F.strategy === 'ridge') {
        for (const b of [F.flankSpear, F.flankBow]) b.order({ id: 'hold' });
        rt.say('佐久間信盛', 'ここで構える。中堂が落ちたら、尾根から西塔を突く', 4);
      } else if (F.strategy !== 'front') {
        for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...VALLEY.slice(1)]);
        rt.say('佐久間信盛', 'このまま奥へ。中堂の裏へ回る', 3.5);
      }
      F.scouted = true;
      if (F.strategy !== 'block' && F.MA) F.MA.tick();   // 封鎖の手（siege_ai.js・makeMountainAttack）を雲母坂へ走らせる（④は先にふさいである）
      rt.obj('block', '雲母坂（退路）を封鎖の手でふさげ', 'side');
      this.civFlee(rt);
    } else if (id === 'todo' && F.strategy === 'ridge' && !F.ridgeGo) {
      F.ridgeGo = true;
      for (const b of [F.flankSpear, F.flankBow]) setRoute(b, [...RIDGE.slice(1)]);
      rt.say('佐久間信盛', '中堂は落ちた。尾根から西塔を突く', 3.5);
    }
  },

  // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
  civFlee(rt) {
    const F = rt.flags;
    if (F.civSpawned) return;
    F.civSpawned = true;
    F.civ = [];
    const civ = (x, z, n2, name) => {
      const c = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: -Math.PI / 2, width: 4, aggro: 0, morale: 0, fleeDir: { x: -1, z: 0.4 }, speed: 2.5 },
        [{ type: 'porter', n: n2, o: { flag: null, hat: 'none', armor: 0x24221f, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee';
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
      c.civ = true;
      F.civ.push(c);
    };
    civ(-30, 20, 4, '逃げる僧');
    civ(-45, 60, 3, '逃げる里の者');
    rt.bark('手向かわずに逃げる僧や里の者は追うな。討てば下知に背くぞ');
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('mudoji'); rt.unmark('todo');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '延暦寺の根本中堂を落とした', pts: 22 }; }, '任務達成・比叡山を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('東塔、落ちる', '根本中堂は破られ、僧兵の手は西へ、あるいは降った');
    rt.say('明智光秀', `${nm(rt)}、山は落ちた。……この山の煙は、京からも見えよう`, 4.5);
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
    if (F.FS) F.FS.tick(dt);
    if (F.step >= 1) tickRoutes(F.attackers);
    // 東塔の根本中堂が燃え出す（史実の焼き討ち。時が来たら一度だけ）
    if (F.mudojiFell && !F.hondoBurning && rt.t - F.stepT > 60) {
      F.hondoBurning = true;
      rt.army.igniteStruct(F.hondoStruct, { x: F.hondoStruct.x, z: F.hondoStruct.z });
      rt.__fireZones.todo = true;
      rt.banner('根本中堂から煙', '山の上から、黒い煙が上がる');
      rt.say('足軽', '……御堂が燃えておる', 3);
    }
    if (F.step >= 1) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.mudojiFell) rt.objProgress('main', `無動寺谷の外堂・${st.mudoji ? st.mudoji.state : ''}`);
      else if (!F.ending) rt.objProgress('main', `根本中堂・${st.todo ? st.todo.state : ''}`);
    }
    // 時をかけすぎたら、確かめを止めない保険で決着させる
    if (rt.t - (F.stepT || 0) > 480 && !F.ending) this.win(rt);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('逃げる非戦の者を討った', ['明智光秀', '追うなと申したはずじゃ。刃向かわぬ者を討って、何の手柄か']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が崩れた`, 2.5);
  },
};

hiei_mtn.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 };
};
hiei_mtn.sides = { a: { name: '織田軍（明智光秀・佐久間信盛）', mon: 'oda' }, b: { name: '延暦寺の僧兵・浅井朝倉の残党', mon: 'namu' } };
hiei_mtn.famous = [
  { name: '明智光秀', team: 0, line: '刃向かう僧兵とだけ戦え。逃げる者は追うな' },
  { name: '佐久間信盛', team: 0, line: '無動寺谷はこちらで受け持つ' },
  { name: '正覚院豪盛', team: 1, g: /東塔|根本中堂/, loose: 1, line: '正覚院豪盛なり！　叡山は王城鎮護の御山ぞ！' },
];
hiei_mtn.date = () => '元亀二年（1571）九月十二日　朝・霧';
hiei_mtn.history = '元亀二年（1571）九月十二日、信長は比叡山延暦寺を攻めた。延暦寺は志賀の陣で浅井・朝倉をかくまい、織田に従わなかった。坂本から明智光秀・佐久間信盛らの手が山道を登り、山上の堂塔は焼かれた。正覚院豪盛は討たれず、甲斐の武田信玄を頼ったと伝わる。ここでは区域の制圧・伏兵・退路封鎖という山岳戦の仕組みの見本として遊べるようにした一戦。死者の数には諸説ある。';

// 軍議（gungi.js・F6・M8）：山35の四つの作戦から一つを選ぶ。攻め方で勝ち負け・時・損が変わる（b_kinome.js の F9 と同じ仕組み）
//   ①front：無動寺坂へは分けず、参道だけで真っ直ぐ中堂へ（早いが、外堂で削れぬ分、中堂の守りが厚いまま）
//   ②ridge：外堂を落とした後、尾根から西塔を突く（見晴らしが良く伏兵に遭いにくいが、中堂を落とすまでは待つ）
//   ③valley（既定）：無動寺坂から谷を回って中堂の裏へ（伏兵に遭いやすいが、中堂を挟み撃ちできる）
//   ④block：封鎖の手を先に雲母坂へ送ってからふつうに攻め上る（守りの退路を断てるが、封鎖の手が単身で進む分、時がかかり損も出る）
hiei_mtn.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -60 }, dist: 110,
    units: [
      { id: 'plan', name: '攻め方（明智光秀・佐久間信盛の手）', group: () => F.mainSpear && F.mainSpear.real },
    ],
    routes: [
      { id: 'front', name: '正面の参道だけで真っ直ぐ攻め上る' },
      { id: 'valley', name: '無動寺坂から谷を回り、中堂の裏を突く' },
      { id: 'ridge', name: '外堂の後、尾根から先に西塔を取る' },
      { id: 'block', name: '雲母坂の退路を先にふさいでから攻める' },
    ],
    default: { plan: 'valley' },
    enemy: [
      { name: '無動寺谷の僧兵', known: true, count: () => (F.mudojiSpear ? F.mudojiSpear.aliveNominal() : 0) + (F.mudojiBow ? F.mudojiBow.aliveNominal() : 0) },
      { name: '東塔・正覚院豪盛の衆', known: false },
      { name: '浅井・朝倉の残党（伏兵の噂）', known: false },
    ],
    onStart: (assign) => hiei_mtn.onGungiStart(rt, assign),
  };
  // bot・sim で確かめる時（window.__hieiStrategy か ?bot）は、軍議の札を出さず自分で決める（b_kinome.js の F9 と同じ）
  const auto = window.__hieiStrategy || (/[?&]bot/.test(location.search) ? 'valley' : null);
  if (auto) { hiei_mtn.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
hiei_mtn.onGungiStart = (rt, assign) => {
  rt.flags.strategy = (assign && assign.plan) || 'valley';
};

// 素直な遊び手：敵へ向かって戦い、無ければ中堂へ。深手の時は味方の中へ下がる（前の流しで独り相撲になり
// 重傷で倒れたため。M8：足軽の身でも遊べる釣り合い。囲まれるほど構えを増やす）
hiei_mtn.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  const back = F.mainSpear ? F.mainSpear.pos : { x: u.pos.x, z: u.pos.z - 6 };
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

export { hiei_mtn };
