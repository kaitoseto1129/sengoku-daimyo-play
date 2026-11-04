// ======================================================================
// 徳川編 9　今福の戦い（慶長十九年十一月二十六日・1614）　大坂冬の陣　堤・湿地・狭い道の激戦
// 筋書きの正：docs/chapter3_tokugawa.md の「9. 今福」
// 大坂城の北東、大和川の旧流路ぞいの今福に、豊臣方の砦（矢野正倫・飯田家貞）があった。堤の上の細い道が唯一の通り道で、
// 両側は湿地と水。佐竹義宣の隊が堤を進んで砦を奪うが、木村重成の隊が鉄砲を揃えて反撃し、佐竹勢は堤の上で押し戻される。
// 佐竹勢は四重の柵を破り、矢野・飯田は討死。木村重成の反撃で押され、後藤又兵衛が加わって押し戻され、渋江政光が撃たれて先手が崩れる。
// そこへ鴫野の上杉勢が大和川を越えて横から撃ち、豊臣方は退く（docs/battle_refs/k09_imafuku.md）。
// 主人公は佐竹義宣の隊の侍大将。勝ち方＝砦を奪い、重成の反撃に堤の上で耐え、増援とともに豊臣方を退かせる。
// 段：①堤を進む（葦の伏兵）②四重の柵を破り今福の砦を奪う ③木村重成の反撃を堤の上で受け止める（後藤又兵衛が加わる）④増援とともに押し返す
// 負け方：討たれる。時の決めは段ごと（DP の max・kaito AP8）。全体の刻限は十五分の保険だけ。
// 兵の比（史実）：佐竹勢は千五百〜二千、砦の守兵は六百ほど、反撃した木村・後藤の隊は数千（推定）。重成の反撃の間は二倍を超える敵に押される（AQ10）。
// 佐竹義宣は南の本陣（後方）に一人だけ置き、前の堤は家老の渋江政光・梅津憲忠が率いる（AT3）。渋江政光は反撃の中で鉄砲に撃たれて討死する（史実）。
// 旗は佐竹・上杉・豊臣だけ（AQ4）。見せかけの軍勢（遠くの軽い大軍・隊の後ろの控え）は一つも置かず、出る兵は全部本物（AA・AF・AQ6）。大坂城は北西の遠く（今福の南西＝寄せる向きの先）。
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
import { osakaFar } from './osaka_far.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick } from './b_depth.js';
import { clamp01, gone, uS, uA, uG, uB, dress, gunLine, busho, makeLose, makeBot, setStages } from './b_k_help.js';
import { timeslipField } from './timeslip_field.js';

const FORT = { x: 0, z: -78 };                 // 今福の砦（堤の北の端）
const BANK = 7;                                // 堤の半幅
const SPAWN = { x: 0, z: 150 };
const START = { x: 0, z: 120 };
const KEEP = { x: 0, z: -44 };                 // 砦を奪ったあとの持ち場（砦の前の堤）
const LIMIT = 900;
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
  wakeOK: (rt) => (rt.flags.step || 0) >= 2,   // 近づいた軽い兵は本物に替える（AA）。堤を進む間は静かに
  minutes: 14,
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
    // ---- 今福の砦：堤をふさぐ四重の柵（史実）・櫓・篝火。外の三重は木戸の弱い柵で、一つずつ破って進む ----
    F.outer = [];
    for (const dz of [22, 32, 42]) {
      const z = FORT.z + dz;
      wallLine(rt, [[-BANK - 8, z], [-3, z]], { team: 1, hp: 70, name: '外の柵', segLen: 5 });
      wallLine(rt, [[3, z], [BANK + 8, z]], { team: 1, hp: 70, name: '外の柵', segLen: 5 });
      const st = rt.army.addStruct({ seg: [-3, z, 3, z], nx: 0, nz: 1, hp: 90, maxHp: 90, team: 1, name: '外の柵の木戸' });
      st.mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.3), F.gateMat || (F.gateMat = new THREE.MeshLambertMaterial({ color: 0x4a3626 })));
      st.mesh.position.set(0, W.heightAt(0, z) + 1.3, z + 0.2); st.mesh.castShadow = true; rt.scene.add(st.mesh);
      F.outer.push(st);
    }
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
      general: { name: '佐竹義宣', hat: 'kabuto_m', haori: 0x3a3228 }, guard: 25, reserve: 0, runTo: { x: 0, z: 160 } });
    for (const [x, z] of [[-8, 158], [8, 158], [0, 172]]) rt.scene.add(nobori(W, x, z, 'satake', 7));
    rt.scene.add(tawara(W, 10, 140, 0.2, 4));
    // 大坂城（北西の遠く。今福から見て南西＝堤の寄せる向きの先）：北の石垣の二の丸と京橋口の馬出、手前の惣構えの北（大川）と東（猫間川）。osaka_far.js
    try { osakaFar(rt, { x: -330, z: -330, s: 1.6, big: 2.2, land: [[-700, -800, 200, -261], [-800, -261, -261, 100]], sogamae: [{ pts: [[-200, -170], [-560, -170]], side: -1, water: true, s: 1.6 }, { pts: [[-200, -520], [-200, -170]], side: -1, water: true, s: 1.6 }] }); } catch (e) { console.warn(e); }

    // ---- 味方：梅津憲忠の隊（主人公）・渋江政光の組。佐竹義宣は南の本陣に残る ----
    F.satake = allyGroup(rt, { faction: 'tokugawa', name: '梅津憲忠の隊', anchor: { x: 0, z: SPAWN.z - 86 }, facing: Math.PI, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('梅津憲忠', { invuln: true }), uS(4), uA(24), uG(8)], SATAKE));
    F.shibue = allyGroup(rt, { faction: 'tokugawa', name: '渋江政光の組', anchor: { x: 0, z: SPAWN.z - 64 }, facing: Math.PI, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('渋江政光', { invuln: true }), uS(3), uA(18), uG(6)], SATAKE));
    for (const g of [F.satake, F.shibue]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    // 細い堤の先頭で囲まれやすい。刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ。高遠・木津川と同じ作り）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 0, z: SPAWN.z + 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '堤を北へ進み、四重の柵を破って今福の砦を奪う', 'main');
    rt.banner('今福', '慶長十九年十一月二十六日　大坂城の北東');
    rt.say('佐竹義宣', '見よ、この細い堤を。両側は水と湿地、通れる道はこの上だけじゃ', 4);
    rt.after(4.4, () => rt.say('渋江政光', '堤の北の砦には矢野・飯田が籠っておる。柵は四重。一つずつ破るぞ', 3.8));
    rt.after(8.6, () => {
      rt.say('佐竹義宣', '大坂城は目と鼻の先。梅津、渋江、先陣は任せた。進め！', 3.4);
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
    const ctx = { faction: 'toyotomi', flag: 'toyotomi', armor: KIMURA.armor, dmg: 0.21, backing: false, scale: 1.4, look: (l) => dress(l, KIMURA),
      friends: () => [F.satake, F.shibue, ...(F.reinf || [])].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 堤を進む。葦の中から鉄砲
      DP.move({ to: { x: 0, z: FORT.z + 50 }, label: '堤', r: 8, max: 80, obj: '堤の上を北へ、砦の前まで進め',
        say: [['渋江政光', '堤から外れるな！　足を取られて動けなくなるぞ！']],
        ambush: { d: 70, say: ['足軽', '葦の中から鉄砲じゃ！　堤の両側に伏せておる！'], foes: () => [gunLine('堤の西の葦の鉄砲', { x: -18, z: FORT.z + 70 }, 3, { dmg: 0.21, mass: 0 }), gunLine('堤の東の葦の鉄砲', { x: 18, z: FORT.z + 70 }, 3, { dmg: 0.21, mass: 0 })] },
        onEnd: (rt2) => {
          rt2.flags.step = 2;
          // 葦の鉄砲は撃ち掛けたあと砦へ逃げ込む（砦の段で横から撃ち続けない）
          for (const g of rt2.army.groups) if (g.team === 1 && /葦の鉄砲/.test(g.name || '') && g.count && !g.routed) { g.noRout = false; g.morale = 0; }
        } }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 砦を奪う
      DP.fight({ at: { x: 0, z: FORT.z + 2 }, title: '今福の砦', sub: '堤をふさぐ四重の柵', obj: '四つの柵の木戸を破り、矢野正倫と飯田家貞を討て', max: 210,
        say: [['梅津憲忠', '木戸を破れ！　柵を一つずつ越えて砦へ迫れ！']],
        // 守兵は砦の中に籠る（見えない所から湧かせず、柵の内で待つ）。この段だけ出す所を決めたままにする
        foes: () => { ctx.fixedSpawn = true; return [{ name: '矢野正倫の守兵', from: { x: 0, z: FORT.z - 4 }, list: [busho('矢野正倫', { horse: false }), uS(2), uA(10), uG(5)], dmg: 0.19 },
          { name: '飯田家貞の守兵', from: { x: 6, z: FORT.z - 12 }, list: [busho('飯田家貞', { horse: false }), uS(1), uA(8), uG(3)], dmg: 0.18 }]; },
        reward: '今福の砦を奪った', onEnd: (rt2) => { ctx.fixedSpawn = false; this.taken(rt2); } }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ③ 木村重成の反撃：堤の上で受け止める。後藤又兵衛が加わる
      DP.hold({ at: KEEP, dur: 120, r: 14, label: '堤の上', title: '木村重成の反撃', sub: '細い堤の上に鉄砲が並ぶ',
        obj: '奪った砦の前の堤に立ち、木村重成の反撃を押しとどめよ',
        waves: [
          { t: 6, say: ['足軽', '旗は木村長門守！　若い大将が自ら出てきた！'], foes: () => [{ name: '木村重成の隊', from: { x: 0, z: FORT.z - 40 }, list: [busho('木村重成', { hat: 'kabuto_f' }), uS(4), uA(20), uG(8)], mass: 150, noRout: 30, dmg: 0.25 }] },
          { t: 28, say: ['足軽', '堤の両側から鉄砲が並んだ！　横から撃たれる！'], foes: () => [gunLine('重成の鉄砲衆（西）', { x: -16, z: FORT.z - 20 }, 5), gunLine('重成の鉄砲衆（東）', { x: 16, z: FORT.z - 20 }, 5)] },
          { t: 48, say: ['足軽', '後藤又兵衛じゃ！　秀頼様の命で鬼の又兵衛が加わった！'], foes: () => [{ name: '後藤又兵衛の隊', from: { x: -6, z: FORT.z - 44 }, list: [busho('後藤又兵衛', {}), uS(5), uA(22), uG(6)], mass: 200, noRout: 24, dmg: 0.25 }] },
          { t: 70, say: ['足軽', '渋江様が撃たれた！　渋江内膳様、お討死！'], foes: () => { this.shibueFalls(rt); return []; } },
          { t: 88, say: ['足軽', '木村の新手が堤を押してくる！　下がるな！'], foes: () => [{ name: '木村重成の二の手', from: { x: 4, z: FORT.z - 46 }, list: [uS(2), uA(20), uG(6)], mass: 160, dmg: 0.24 }] },
        ],
        reward: '堤の上で踏みとどまった', onEnd: (rt2) => this.reinforce(rt2) }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 増援とともに押し返す
      DP.fight({ at: { x: 0, z: FORT.z - 20 }, title: '押し返す', sub: '上杉の加勢が着いた', obj: '上杉の加勢とともに、砦の北の堤から木村・後藤の殿を追い払え', max: 150,
        say: [['須田長義', '佐竹を見捨てるな！　上杉の鉄砲で横から撃て！']],
        foes: () => [{ name: '木村重成の殿', from: { x: 0, z: FORT.z - 40 }, list: [uS(2), uA(16), uG(5)], mass: 140, dmg: 0.25 },
          { name: '後藤又兵衛の殿', from: { x: -6, z: FORT.z - 52 }, list: [uS(2), uA(14), uG(4)], mass: 120, dmg: 0.25 }],
        reward: '増援とともに豊臣方を退けた' }),
    ], (rt2) => this.win(rt2));
  },

  taken(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.banner('砦を奪った', '矢野正倫と飯田家貞は討死');
    rt.say('佐竹義宣', 'よし、今福を取ったぞ！　……北に鉄砲の列が見える。気を許すな', 3.6);
    for (const st of [F.gate, ...(F.outer || [])]) if (st && st.alive) st.hp = 0;
  },

  // 渋江政光の討死（史実：重成の反撃の中で鉄砲に当たる）
  shibueFalls(rt) {
    const F = rt.flags;
    const u = F.shibue && F.shibue.units.find((q) => q.alive && q.type === 'busho');
    if (u) { u.invuln = false; u.hp = 0; rt.army.kill(u, null); }
    // 史実：渋江の討死で佐竹の先手が崩れる。渋江の組は南へ下がり、梅津の隊と自分の組だけで堤に残る
    if (F.shibue) { F.shibue.noRout = false; F.shibue.morale = 5; }
    rt.after(3.2, () => rt.say('梅津憲忠', '渋江殿の分まで踏みとどまれ！　ここを抜かれれば佐竹は終わりじゃ', 3.6));
  },

  // 木村重成の反撃を耐え抜いた → 上杉の加勢（必ず。鴫野から川を越えて来る）
  reinforce(rt) {
    const F = rt.flags;
    F.step = 4;
    rt.player.treatWounds(0.6);
    sfx('taiko', 1); sfx('horagai', 0.8);
    rt.banner('上杉の加勢', '鴫野の上杉勢が川を越えて来た');
    rt.say('足軽', '大和川の向こうから上杉の鉄砲じゃ！　竹に雀の旗が渡ってくる！', 3.6);
    F.reinf = [];
    for (const [nmx, gen, flag, x] of [['須田長義の隊', '須田長義', 'uesugi', -5], ['水原親憲の鉄砲衆', '水原親憲', 'uesugi', 5]]) {
      const g = allyGroup(rt, { faction: 'tokugawa', name: nmx, anchor: { x, z: KEEP.z + 70 }, facing: Math.PI, width: 7, aggro: 8, speed: 3.4, morale: 90, formation: 'column' },
        dress([busho(gen, { invuln: true }), uS(3), uA(18), uG(10)], { flag }));
      g.order = 'move'; g.dest = { x, z: KEEP.z + 14 };
      F.reinf.push(g);
    }
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
    rt.after(5, () => rt.say('梅津憲忠', '渋江殿を失うた……堤の上に、これだけ倒れるとは', 4));
    rt.finish({}, 14);
  },

  lose: makeLose('堤の上で潰えた', '佐竹勢は今福から押し戻された', '堤が……！　皆、南へ退け！', '足軽'),

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    // 柵の木戸：本人が木戸の前に二秒いると、組の者と縄を掛けて引き倒す（柵の前で止まって撃たれ続けない）。砦の木戸は砦の段から
    const p = rt.player && rt.player.u && rt.player.u.pos;
    for (const st of [...(F.outer || []), ...((F.step || 0) >= 2 ? [F.gate] : [])]) {
      if (!st || !st.alive || !p) continue;
      const near = Math.abs(p.x) < 12 && p.z - st.seg[1] > -6 && p.z - st.seg[1] < 14;
      st.pullT = near ? (st.pullT || 0) + dt : 0;
      if (st.pullT > 2) {
        st.alive = false; st.hp = 0; rt.army.structFall(st);
        sfx('gateBreakWood', 0.8);
        rt.say('梅津憲忠', '木戸が倒れた！　次の柵じゃ、続け！', 2.5);
      }
    }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに今福を保てなかった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1 && /矢野正倫|飯田家貞/.test(v.name)) {
      rt.say('足軽', `${v.name}、討ち取ったり！`, 3);
      rt.award((t) => { t.special = { label: `${v.name}を討った`, pts: 30 }; }, `${v.name}を討った`);
    } else if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　豊臣の者が担いで引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（史実）：佐竹勢は千五百ほど、砦の守兵は六百ほど。重成・又兵衛の反撃で豊臣方は三千六百ほど（推定）、上杉の加勢で味方は三千ほどに
k09_imafuku.force = (rt) => {
  const F = rt.flags, st = F.step || 0;
  const a0 = 1500 + (st >= 4 ? 1500 : 0), b0 = st >= 3 ? 3600 : 600;
  return { a: Math.max(0, Math.round(a0 - (F.ak || 0) * 8)), a0, b: Math.max(0, b0 - (F.ek || 0) * 6), b0 };
};
k09_imafuku.sides = { a: { name: '佐竹勢', mon: 'satake' }, b: { name: '豊臣方', mon: 'toyotomi' } };
k09_imafuku.date = () => '慶長十九年（1614）十一月二十六日　朝・薄霧';
k09_imafuku.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
k09_imafuku.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k09_imafuku.history = '慶長十九年（1614）十一月二十六日、大坂城の北東、今福と鴫野で戦いがあった。今福では、堤の上の細い道が唯一の通り道で、両側は湿地と水だった。佐竹義宣の隊が豊臣方の砦の四重の柵を破って奪い、守将の矢野正倫・飯田家貞は討死した。木村重成の隊が反撃し、秀頼の命で後藤又兵衛の隊も加わると、佐竹勢は押し戻され、家老の渋江政光が撃たれて討死し先手は崩れた。佐竹義宣が助けを求めると、鴫野にいた上杉景勝の軍が大和川を越えて撃ちかけ、豊臣方は退いた。\n堤の位置と幅は推定で復元した。戦いの経過の細部には諸説がある。';
k09_imafuku.bushou = [{ name: '木村重成', g: /木村重成/ }, { name: '後藤又兵衛', g: /後藤又兵衛/ }];
k09_imafuku.botBrain = makeBot({ x: 0, z: START.z });

setStages('k09_imafuku', [['堤を北へ進み、砦の前へ', 0], ['四重の柵を破り今福の砦を奪う', 2], ['砦の前の堤で木村重成の反撃を止める', 3], ['上杉の加勢と殿を追い払う', 4]]);

export { k09_imafuku };
export default k09_imafuku;
