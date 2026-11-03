// ======================================================================
// 徳川編 9　今福の戦い（慶長十九年十一月二十六日・1614）　大坂冬の陣　堤・湿地・狭い道の激戦
// 筋書きの正：docs/chapter3_tokugawa.md の「9. 今福」
// 大坂城の北東、大和川の旧流路ぞいの今福に、豊臣方の砦（矢野正倫・飯田家貞）があった。堤の上の細い道が唯一の通り道で、
// 両側は湿地と水。佐竹義宣の隊が堤を進んで砦を奪うが、木村重成の隊が鉄砲を揃えて反撃し、佐竹勢は堤の上で押し戻される。
// 後藤又兵衛の隊も加わる。そこへ上杉景勝の軍と徳川の増援（堀直寄・丹羽氏信ら）が着き、豊臣方は砦を捨てて退く。
// 主人公は佐竹義宣の隊の侍大将。勝ち方＝砦を奪い、重成の反撃に堤の上で耐え、増援とともに豊臣方を退かせる。
// 段：①堤を進む（葦の伏兵）②今福の砦を奪う ③木村重成の反撃を堤の上で受け止める（後藤又兵衛が加わる）④増援とともに押し返す
// 負け方：討たれる・刻限（七分）。
// 向き：北が -z（大坂城の方）。堤は南北に通り、両側は湿地と水（streams）。
// 地形：国土地理院の標高（dem_imafuku.js・tools/dem.mjs の imafuku）は平らな低地。堤は手で復元（位置は推定）。
// ======================================================================
import * as THREE from 'three';
import DEM from './dem_imafuku.js';
import { demSample } from './dem.js';
import { nobori, yagura, palisade, kagaribi, tawara } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick } from './b_depth.js';
import { clamp01, gone, uS, uA, uG, uB, dress, gunLine, busho, makeLose, makeBot, setStages } from './b_k_help.js';
import { timeslipField } from './timeslip_field.js';

const FORT = { x: 0, z: -78 };                 // 今福の砦（堤の北の端）
const BANK = 7;                                // 堤の半幅
const SPAWN = { x: 0, z: 150 };
const START = { x: 0, z: 120 };
const KEEP = { x: 0, z: -44 };                 // 砦を奪ったあとの持ち場（砦の前の堤）
const LIMIT = 420;
const WEST = [[-26, -280], [-24, -90], [-27, 60], [-25, 280]];
const EAST = [[26, -280], [28, -90], [25, 60], [27, 280]];

const KIMURA = { flag: 'toyotomi', armor: 0x2c2a26 };
const SATAKE = { flag: 'satake' };
const D0 = demSample(DEM, 0, 0);
// 堤：中央の細い高まり。両側は低い湿地
function height(x, z) {
  let h = (demSample(DEM, x * 4, z * 4) - D0) * 0.5;
  h += 0.12 * Math.sin(x * 0.07 + z * 0.03);
  const d = Math.abs(x);
  h += 1.3 * clamp01((BANK + 5 - d) / 7);
  h -= 0.7 * clamp01((d - 14) / 14);
  return h;
}

const k09_imafuku = {
  // 身の回りの合戦の跡（timeslip_field.js）。今福：冬の堤と湿地。枯れ葦・ぬかるみ・水たまり、堤の上の倒れた槍
  timeslip: {
    wet: 0.55, dust: 0.1, trample: 0.3, debris: 1.2, arrows: 1, reeds: 0.5, maxSlope: 0.22,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.2, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が堤の上で続けての太刀で倒れた）
  noWake: true,
  minutes: 7,
  foeHit: 1.05,
  world: {
    seed: 1614126,
    time: 'day',
    mist: true,
    groundHalf: 260,
    height,
    muddy: 0.5,
    waterSlow: true,
    streams: [{ pts: WEST, w: 22, depth: 1.8 }, { pts: EAST, w: 22, depth: 1.8 }],
    paths: [[[0, 240], [0, 150], [0, 60], [0, -40], [0, -70]]],
    tint(x, z, h, c) {
      // 冬の枯れ葦の湿地。堤の上は土の色
      const d = Math.abs(x);
      if (d < BANK + 2) c.setRGB(c.r * 0.55 + 0.2, c.g * 0.5 + 0.16, c.b * 0.4 + 0.08);
      else c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.2, c.b * 0.4 + 0.07);
    },
    clear: (x, z) => Math.abs(x) < 14 && z > -110 && z < 200,
    trees: 70,
    tufts: 3200,
    treeDensity: (x, z) => (Math.abs(x) > 60 ? 0.9 : 0.1),
    fleeOut: (x, z, team) => (team === 1 ? z < -170 : z > 230),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // ---- 今福の砦：堤をふさぐ柵・櫓・篝火 ----
    wallLine(rt, [[-BANK - 8, FORT.z + 12], [-3.4, FORT.z + 12]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 5 });
    wallLine(rt, [[3.4, FORT.z + 12], [BANK + 8, FORT.z + 12]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 5 });
    F.gate = rt.army.addStruct({ seg: [-3.4, FORT.z + 12, 3.4, FORT.z + 12], nx: 0, nz: 1, hp: 200, maxHp: 200, team: 1, name: '砦の木戸' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.2, 0.35), new THREE.MeshLambertMaterial({ color: 0x4a3626 }));
    F.gateMesh.position.set(0, W.heightAt(0, FORT.z + 12) + 1.6, FORT.z + 12.2);
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    for (const [x, z] of [[-9, FORT.z + 8], [9, FORT.z + 8], [0, FORT.z - 8]]) rt.scene.add(yagura(W, x, z, { mon: 'toyotomi', team: 1 }));
    for (const [x, z] of [[-6, FORT.z + 16], [6, FORT.z + 16], [0, FORT.z]]) { try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { console.warn(e); } }
    for (const [x, z] of [[-8, FORT.z + 2], [8, FORT.z + 2], [0, FORT.z - 16]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7));
    rt.scene.add(palisade(W, [-BANK - 8, FORT.z - 14, BANK + 8, FORT.z - 14], { h: 2.6 }));
    // ---- 徳川方の陣（南）：佐竹の本陣の旗、遠くに大軍 ----
    camp(rt, { x: 14, z: 190, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'satake', armor: 0x24221f,
      general: { name: '佐竹義宣', hat: 'kabuto_m', haori: 0x3a3228 }, guard: 10, reserve: 120, runTo: { x: 0, z: 160 } });
    for (const [x, z] of [[-8, 158], [8, 158], [0, 172]]) rt.scene.add(nobori(W, x, z, 'satake', 7));
    rt.scene.add(tawara(W, 10, 140, 0.2, 4));
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    F.southDA = [DA(70, 160, 40, 30, 300, Math.PI, 0x24221f, 'uesugi', 91, 'gun'), DA(-80, 170, 40, 30, 300, Math.PI, 0x24221f, 'tokugawa', 92, 'spear')];
    // 豊臣方：砦の向こう（北）と、堤の東の鴫野・野田の方に大軍
    F.northDA = [DA(10, -190, 60, 30, 380, 0, KIMURA.armor, 'toyotomi', 93, 'mixed'), DA(-90, -140, 40, 30, 260, 0, KIMURA.armor, 'toyotomi', 94, 'gun')];
    DA(110, -60, 40, 30, 260, -Math.PI / 2, KIMURA.armor, 'toyotomi', 95, 'spear');

    // 堤の上の乱戦（軽い作り）。noWake を付けず、砦の手前の堤の道（幅七メートル・遊び始めて二十五秒ほどで着く持ち場の先）に先に出た佐竹勢と豊臣の鉄砲衆が押し合う
    { const C = W.addClash({ x: 0, z: -32, facing: 0, w: 12, bw: 4.2, gap: 2.2, seed: 16091, rt,
        play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, ax, az) => rt.army.smoke(x, y, z, ax, az),
        noRout: true, killRate: 0.004, maxDrift: 1.2, host: false, corpses: 6, realNear: 12, nearHide: 0,
        A: { flag: 'satake', armor: 0x24221f, count: 60, flagRate: 0.22 },
        B: { flag: 'toyotomi', armor: KIMURA.armor, count: 60, flagRate: 0.22 } });
      if (C?.go) C.go(); }
    // ---- 味方：佐竹義宣の隊（主人公）・渋江政光の組 ----
    F.satake = allyGroup(rt, { faction: 'tokugawa', name: '佐竹義宣の隊', anchor: { x: 0, z: SPAWN.z - 86 }, facing: Math.PI, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('佐竹義宣', { invuln: true }), uS(3), uA(16), uG(6)], SATAKE));
    F.shibue = allyGroup(rt, { faction: 'tokugawa', name: '渋江政光の組', anchor: { x: 0, z: SPAWN.z - 64 }, facing: Math.PI, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('渋江政光', { invuln: true }), uS(2), uA(14), uB(4)], SATAKE));
    for (const g of [F.satake, F.shibue]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    // 細い堤の先頭で囲まれやすい。刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ。高遠・木津川と同じ作り）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }
    KIT.backOf(rt, F.satake, { flag: 'satake', armor: 0x24221f, kind: 'spear', w: 8, depth: 14, count: 130, gap: 4, seed: 86 });
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 0, z: SPAWN.z + 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '佐竹隊を率いて、堤の上の今福の砦を奪え', 'main');
    rt.banner('今福', '慶長十九年十一月二十六日　大坂城の北東');
    rt.say('佐竹義宣', '見よ、この細い堤を。両側は水と湿地、通れる道はこの上だけじゃ', 4);
    rt.after(4.4, () => rt.say('渋江政光', '堤の北の砦には矢野・飯田が籠っておる。まず、あれを奪うぞ', 3.8));
    rt.after(8.6, () => {
      rt.say('佐竹義宣', '大坂城は目と鼻の先。先陣は佐竹の名誉じゃ。進め！', 3.4);
      // 先に堤へ出ていた佐竹・渋江の列が「進め」で北へ歩き出す（本人が追いつくと、堤の上に味方の列が続いて見える）
      [F.satake, F.shibue].forEach((g, i) => { if (g && g.count) { g.calm = false; g.anchor = { x: 0, z: FORT.z + 60 + i * 14 }; } });
    });
    rt.after(11.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    const ctx = { faction: 'toyotomi', flag: 'toyotomi', armor: KIMURA.armor, dmg: 0.21, mass: 170, scale: 1.4, look: (l) => dress(l, KIMURA),
      friends: () => [F.satake, F.shibue, ...(F.reinf || [])].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 堤を進む。葦の中から鉄砲
      DP.move({ to: { x: 0, z: FORT.z + 50 }, label: '堤', r: 8, max: 80, obj: '堤の上を北へ、砦の前まで進め',
        say: [['渋江政光', '堤から外れるな！　足を取られて動けなくなるぞ！']],
        ambush: { d: 70, say: ['足軽', '葦の中から鉄砲じゃ！　堤の両側に伏せておる！'], foes: () => [gunLine('堤の西の葦の鉄砲', { x: -18, z: FORT.z + 70 }, 3, { dmg: 0.21, mass: 0 }), gunLine('堤の東の葦の鉄砲', { x: 18, z: FORT.z + 70 }, 3, { dmg: 0.21, mass: 0 })] },
        onEnd: (rt2) => { rt2.flags.step = 2; } }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 砦を奪う
      DP.fight({ at: { x: 0, z: FORT.z + 18 }, title: '今福の砦', sub: '堤をふさぐ柵と櫓', obj: '砦の守兵を破り、砦を奪え', max: 100,
        say: [['佐竹義宣', '柵を破れ！　一気に奪え！']],
        foes: () => [{ name: '矢野正倫の守兵', from: { x: 0, z: FORT.z - 4 }, list: [busho('矢野正倫', { horse: false }), uS(2), uA(10), uG(5)], mass: 100, dmg: 0.28 },
          { name: '飯田家貞の守兵', from: { x: 6, z: FORT.z - 12 }, list: [busho('飯田家貞', { horse: false }), uS(1), uA(8), uG(3)], mass: 60 }],
        reward: '今福の砦を奪った', onEnd: (rt2) => this.taken(rt2) }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ③ 木村重成の反撃：堤の上で受け止める。後藤又兵衛が加わる
      DP.hold({ at: KEEP, dur: 65, r: 14, label: '堤の上', title: '木村重成の反撃', sub: '細い堤の上に鉄砲が並ぶ',
        obj: '奪った砦の前で堤を守り、木村重成の反撃に耐えよ',
        waves: [
          { t: 6, say: ['足軽', '旗は木村長門守！　若い大将が自ら出てきた！'], foes: () => [{ name: '木村重成の隊', from: { x: 0, z: FORT.z - 40 }, list: [busho('木村重成', { hat: 'kabuto_f' }), uS(3), uA(10), uG(4)], mass: 150, noRout: 30, dmg: 0.25 }] },
          { t: 28, say: ['足軽', '堤の両側から鉄砲が並んだ！　横から撃たれる！'], foes: () => [gunLine('重成の鉄砲衆（西）', { x: -16, z: FORT.z - 20 }, 5), gunLine('重成の鉄砲衆（東）', { x: 16, z: FORT.z - 20 }, 5)] },
          { t: 50, say: ['足軽', '後藤又兵衛じゃ！　鬼の又兵衛が加わった！'], foes: () => [{ name: '後藤又兵衛の隊', from: { x: -6, z: FORT.z - 44 }, list: [busho('後藤又兵衛', {}), uS(3), uA(10)], mass: 140, noRout: 24, dmg: 0.25 }] },
        ],
        reward: '堤の上で踏みとどまった', onEnd: (rt2) => this.reinforce(rt2) }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 増援とともに押し返す
      DP.fight({ at: { x: 0, z: FORT.z + 4 }, title: '押し返す', sub: '上杉・徳川の増援が着いた', obj: '増援とともに豊臣方を押し返せ', max: 90,
        say: [['上杉景勝', '佐竹を孤立させるな！　堤を押し渡れ！']],
        foes: () => [{ name: '重成の殿の隊', from: { x: 0, z: FORT.z - 30 }, list: [uS(1), uA(6), uG(2)], mass: 60, dmg: 0.25 }],
        reward: '増援とともに豊臣方を退けた' }),
    ], (rt2) => this.win(rt2));
  },

  taken(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.banner('砦を奪った', '矢野・飯田の守兵は北へ逃れた');
    rt.say('佐竹義宣', 'よし、今福を取ったぞ！　……北に鉄砲の列が見える。気を許すな', 3.6);
    if (F.gate && F.gate.alive) F.gate.hp = 0;
  },

  // 木村重成の反撃を耐え抜いた → 上杉・徳川の増援（必ず）
  reinforce(rt) {
    const F = rt.flags;
    F.step = 4;
    rt.player.treatWounds(0.6);
    sfx('taiko', 1); sfx('horagai', 0.8);
    rt.banner('増援', '上杉景勝の軍と徳川の増援が着いた');
    rt.say('足軽', '南から旗が！　上杉の軍じゃ！　徳川の増援も続いてくる！', 3.6);
    F.reinf = [];
    for (const [nmx, gen, flag, x] of [['上杉景勝の先手', '上杉景勝', 'uesugi', -5], ['堀直寄の隊', '堀直寄', 'tokugawa', 5]]) {
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: { x, z: KEEP.z + 70 }, facing: Math.PI, width: 7, aggro: 8, speed: 3.4, morale: 90, formation: 'column' },
        dress([busho(gen, { invuln: true }), uS(2), uA(14), uG(4)], { flag }));
      g.order = 'move'; g.dest = { x, z: KEEP.z + 14 };
      F.reinf.push(g);
    }
    for (const m of F.southDA) m.advance(40, 14, { charge: true });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '今福堤で踏みとどまった', pts: 40 }; }, '今福を保ち、豊臣方を退けた');
    rt.player.u.invuln = true;
    rt.banner('豊臣方、退く', '今福は徳川方のものとなった');
    rt.say('木村重成', '兵を退く……だが、この負けは長くは続かせぬ。次は大坂の南で', 4);
    rt.after(5, () => rt.say('佐竹義宣', '多くの者を失うた……堤の上に、これだけ倒れるとは', 4));
    rt.finish({}, 14);
  },

  lose: makeLose('堤の上で潰えた', '佐竹勢は今福から押し戻された', '堤が……！　皆、南へ退け！', '足軽'),

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに今福を保てなかった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　豊臣の者が担いで引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢：今福へ向かった佐竹・上杉らは一万ほど、木村重成・後藤又兵衛の隊は六千ほど
k09_imafuku.force = (rt) => {
  const F = rt.flags;
  const k = (F.step || 0) >= 4 ? 2000 : 0;
  return { a: Math.max(0, Math.round(10000 + k - (F.ak || 0) * 25)), a0: 12000, b: Math.max(0, 6000 - (F.ek || 0) * 12), b0: 6000 };
};
k09_imafuku.sides = { a: { name: '徳川方', mon: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi' } };
k09_imafuku.date = () => '慶長十九年（1614）十一月二十六日　朝・薄霧';
k09_imafuku.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
k09_imafuku.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k09_imafuku.history = '慶長十九年（1614）十一月二十六日、大坂城の北東、今福と鴫野で戦いがあった。今福では、堤の上の細い道が唯一の通り道で、両側は湿地と水だった。佐竹義宣の隊が豊臣方の砦（矢野正倫・飯田家貞）を攻めて奪ったが、木村重成の隊が鉄砲を揃えて反撃し、佐竹勢は押し戻されて多くの将兵を失った（重臣の渋江政光も討死したと伝わる）。後藤又兵衛の隊も加わったが、上杉景勝の軍や徳川方の増援（堀直寄ら）が着くと、豊臣方は退いた。\n堤の位置と幅は推定で復元した。戦いの経過の細部には諸説がある。';
k09_imafuku.bushou = [{ name: '木村重成', g: /木村重成/ }, { name: '後藤又兵衛', g: /後藤又兵衛/ }];
k09_imafuku.botBrain = makeBot({ x: 0, z: START.z });

setStages('k09_imafuku', [['堤を北へ進み、砦の前へ', 0], ['今福の砦を奪う', 2], ['堤の上で木村重成の反撃に耐える', 3], ['増援とともに豊臣方を押し返す', 4]]);

export { k09_imafuku };
export default k09_imafuku;
