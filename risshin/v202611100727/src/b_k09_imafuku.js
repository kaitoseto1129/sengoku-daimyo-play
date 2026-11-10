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
// 佐竹義宣は東の本陣（後方）に旗本と置き、前の堤は家老の渋江政光・梅津憲忠が率いる（AT3）。渋江政光は反撃の中で鉄砲に撃たれて討死する（史実）。
// 旗は佐竹・上杉・豊臣だけ（AQ4）。見せかけの軍勢（遠くの軽い大軍・隊の後ろの控え）は一つも置かず、出る兵は全部本物（AA・AF・AQ6）。大坂城は西南西の遠く（今福の南西＝寄せる向きの先）。
// 向き：小地図の北（-z）を史実の北に合わせる。-x が西（大坂城の方）、-z が北（鯰江川と今福村）、+z が南（大和川・その向こうに鴫野の上杉勢）。佐竹勢は東から堤を西へ寄せる（プレジデント・乃至政彦の絵図「つつみ一筋」）。
// 朝日は東の背から、夕日は西の城の方へ沈む（world_weather の日の向きも -z が北）。
// 地形：国土地理院の標高（dem_imafuku.js・tools/dem.mjs の imafuku）は平らな低地。堤は手で復元（位置は推定）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_imafuku.js';
import { demSample } from './dem.js';
import { nobori, yagura, palisade, kagaribi, tawara, lookoutDeckHeight, kobune, bridgeBoard, bridgeWoodMaterial } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { osakaFar } from './osaka_far.js';
import { ending as katame } from './k09/katame.js';   // 締め：今福に旗を立てて固め、鴫野の鉄砲の音へ
import * as DP from './b_depth.js';
import { depthStart, depthTick } from './b_depth.js';
import { clamp01, gone, uS, uA, uG, uB, dress, gunLine, busho, makeLose, makeBot, setStages } from './b_k_help.js';
import { timeslipField } from './timeslip_field.js';
import { stageNow } from './stages.js';
import { revealName } from './battle_intel.js';

const FORT = { x: -78, z: 0 };                 // 今福の砦（堤の西の端）
const BANK = 7;                                // 堤の半幅
const SPAWN = { x: 150, z: 0 };
const START = { x: 120, z: 0 };
// 砦を奪ったあとの持ち場（砦の東の木戸の内）。前は砦の東 34m（-44）で、木村の隊は砦の西で佐竹の組と押し合い、
//   本人は八十秒ほど誰とも当たらず立っていた（描いて遊んで ③ の 146〜229 秒。九2）。砦の西の柵の口（押し合いの所）の手前に置く
const KEEP = { x: FORT.x - 10, z: 0 };
const LIMIT = 900;
const CUTS = [FORT.x + 26, FORT.x + 36, FORT.x + 46];   // 堀切（外の柵の手前）
const KARIBASHI = FORT.x - 72;                 // 仮橋（史料：堤と片原町の間。矢野は仮橋ぎわで討たれ、守兵は橋を外す間もなく片原町へ逃げた）
const WESTWARD = -Math.PI / 2;                // 西を向く（堤を寄せる向き）
const SOUTH = [[-280, 26], [-90, 24], [60, 27], [280, 25]];     // 大和川（堤の南）
const NORTH = [[-280, -26], [-90, -28], [60, -25], [280, -27]]; // 鯰江川（堤の北・今福村の側）

const KIMURA = { flag: 'toyotomi', armor: 0x2c2a26 };
const SATAKE = { flag: 'satake', armor: 0x24221f };   // 黒漆の当世具足（色を渡さないと白銀の胴・白い腿の兵になっていた。四3・十5）
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
// 梅津憲忠の現存の具足（秋田市立佐竹史料館「鉄地革包錆色漆塗三枚仏胴具足」・桃山）：頭形兜・頬当・三枚仏胴、錆色（黒に近い茶）の漆。
// 前は名の無い型の毛引の胴と鍬形の兜で、ほかの侍大将と見分けがつかなかった（四3・七1）。world.namedKacchu で渡す
const KACCHU_K09 = {
  梅津憲忠: { hat: 'kabuto', bowl: 'zunari', crest: 'none', doStyle: 'hotoke', armor: 0x33281f, helm: 0x30261d, lace: 0x2e2620, odo: 0x2e2620,
    menpo: 0x2f251c, menpoStyle: 'hanbo', haori: 0, horo: 0, lac: 'tame', fuki: 'tame', ref: '' },
};
const UMEZU = { invuln: true, hat: 'kabuto' };
// 佐竹の足軽・鉄砲足軽は黒漆の陣笠（藁の籠のような明るい笠が混じっていた。四3・九6）
const kasa = (s) => (s.type === 'ashigaru' || s.type === 'gun' ? { ...s, o: { hat: 'jingasa_n', ...(s.o || {}) } } : s);
const WADE = 13.5;                             // 堤の両脇の湿地の縁（これより外は脛より深い川。柵の端もここまで）
const D0 = demSample(DEM, 0, 0);
// 段の時切れで未達のまま次へ送らない。刻限は戦全体の LIMIT で判定する。
function requiredStage(s) {
  s.idleAdvance = false;
  s.limit = Infinity;
  s.noHardCap = true;   // 共通の四分・七分の打ち切りでも、未達の木戸・守備・殿を飛ばさない。
  if (s.kind === 'fight') {
    const start = s.start;
    s.start = function (rt, C, m, ctx) {
      start.call(this, rt, C, m, ctx);
      // 敵の組の中心は湿地へ動く。行き先は通れる砦と西の堤に据える。
      rt.marker('dp', C.at, rt.flags.step === 2 ? '今福の砦' : '砦の西の堤', { h: 3 });
    };
  }
  const tick = s.tick;
  s.tick = function (rt, C, m, ctx, el, dt) {
    const player = rt.player.u;
    const fighting = player.alive && !player.dying && !player.woundOut && !player.downed;
    if (s.kind === 'fight' && rt.flags.step === 4 && !C.engaged) {
      const p = rt.player.u.pos;
      C.engaged = fighting && Math.abs(p.z) < BANK && p.x < FORT.x + 20 &&
        // 倒れた敵や柵越しの敵へ寄っただけでは、殿と戦った事にしない。
        C.groups.some((g) => !gone(g) && g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed &&
          Math.abs(u.pos.y - p.y) < 3 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12 &&
          !rt.army.wallBetween(p, player.team, u.pos, false)));
    }
    const inT = C.inT || 0;
    const done = tick.call(this, rt, C, m, ctx, el, dt);
    // 共通の守備は持ち場から四十四メートルまで数えるが、今福は砦の西口で反撃を受ける。
    // 離れて立っている時間や、倒れている時間を「守った時間」に含めない。
    if (s.kind === 'hold' && (!fighting || Math.hypot(player.pos.x - C.at.x, player.pos.z - C.at.z) >= C.botRadius)) C.inT = inT;
    // 味方が先に殿を討ち尽くした場合も、西の堤へ本人が進めば締められる。後方に立ったままでは済みにしない。
    // 共通の済み判定は残り二人も含む。まだ踏みとどまる殿がいる時は、到着だけを交戦の代わりにしない。
    if (done && s.kind === 'fight' && rt.flags.step === 4 && !C.engaged && C.at &&
      !C.groups.some((g) => !gone(g) && g.units.some((u) => u.alive && !u.fleeing && !u.dying && !u.woundOut))) {
      const u = rt.player.u;
      C.engaged = fighting && Math.abs(u.pos.z) < BANK && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 12;
    }
    // 共通の段は守兵が崩れると済むが、四つの木戸を破る目標は省かない。
    if (s.kind === 'fight' && rt.flags.step === 2) {
      let leaderAlive = false;
      for (const g of C.groups) if (g.units.some((u) => u.alive && /^(矢野正倫|飯田家貞)$/.test(u.name || ''))) {
        leaderAlive = true;
        // 守将を討つ前に退かせると、川の向こうまで追えず目標が行き詰まる。
        g.noRout = true;
      }
      if ([rt.flags.gate, ...(rt.flags.outer || [])].some((st) => st && st.alive)) return false;
      // 11/9 徳川C：木戸が全部倒れても、味方の組が守兵を前に止まり、本人も守将に届かないと②が十四分止まった（bot）。
      //   七十五秒後は、実際に守将へ斬り込んだ佐竹の兵だけが討ち取れる。本陣の旗本による遠隔の討死にはしない。
      const F2 = rt.flags; F2.gatesDownT ??= rt.t;
      if (leaderAlive && rt.t - F2.gatesDownT > 75) {
        for (const g of C.groups) for (const u of g.units) if (u.alive && /^(矢野正倫|飯田家貞)$/.test(u.name || '')) {
          const by = rt.army.units.find((a) => a.alive && !a.gone && a.team === 0 && !a.isPlayer && !a.isStruct &&
            !a.fleeing && !a.dying && !a.woundOut && !a.rearWound && !a.downed && !a.perch && !a.group?.routed &&
            Math.abs(a.pos.y - u.pos.y) < 3 && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 4 &&
            !rt.army.wallBetween(a.pos, a.team, u.pos, false));
          if (!by) continue;
          const quiet = F2.quietKill;
          F2.quietKill = true;   // 本人の手柄にはしない
          try { rt.army.kill(u, by); } finally { F2.quietKill = quiet; }
          if (!u.alive) rt.say('足軽', `佐竹の組が${u.name}を討ったぞ！`, 3);
        }
        leaderAlive = C.groups.some((g) => g.units.some((u) => u.alive && /^(矢野正倫|飯田家貞)$/.test(u.name || '')));
      }
      // 共通の判定は残り二人以下でも組を済みとする。守将が残っている間は、討つ目標を済みにしない。
      if (leaderAlive) return false;
      // 守将を失った守兵は城へ逃げる（前は noRout のまま堤の西の外れまで出て、段が済まなかった）
      for (const g of C.groups) if (!gone(g) && /^(矢野正倫|飯田家貞)の守兵$/.test(g.name || '')) { g.noRout = false; g.routed = true; g.order = 'flee'; }
    }
    // 少人数になった時に共通処理が noRout を外すため、横撃前の本隊と未交戦・出た直後の殿は保護を戻す。
    const protect = (s.kind === 'hold' && el < 100) || (s.kind === 'fight' && rt.flags.step === 4 && (el < 30 || !C.engaged));
    if (protect) for (const g of C.groups) if (!gone(g) && /^(木村重成|後藤又兵衛)の(隊|二の手|殿)$/.test(g.name || '')) g.noRout = true;
    // ③の寄せが尽きて百秒過ぎても、堤の脇の湿地に取り残された弓・鉄砲が一人二人立ち尽くし、段が終わらず刻限まで詰んだ（二巡の bot）。
    //   刻を大きく過ぎたら、残る寄せ手は城へ退かせる（重成・又兵衛の隊も退く。討たれはしない）
    if (s.kind === 'hold' && el >= 200 && !C.waves?.length) for (const g of C.groups) if (!gone(g) && !g.routed) { g.noRout = false; g.routed = true; g.order = 'flee'; }
    // 持ち場に戻らず反撃だけが終わった場合も、守った時間を満たしてから済みにする。
    return done && (s.kind !== 'hold' || (C.inT >= 45 && fighting &&
      Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < C.botRadius)) &&
      // 一度交戦していても、本人が倒れた後に味方だけで殿を崩して勝ちにはしない。
      (s.kind !== 'fight' || rt.flags.step !== 4 || (el >= 30 && C.engaged && fighting));
  };
  return s;
}
// 竹の矢来の木戸（史料：堤の先々に竹の矢来の柵が四つ）。冬の枯れた竹を斜めに交え、上下の貫で留め、両端は丸太の柱。
// 形は世界の座標のまま一つに束ね、組の位置は原点のまま（引き倒す時に army_fx の structTilt が傾けられる）
let YARAI = null;
function yaraiGate(W, x, z0, z1, h) {
  if (!YARAI) YARAI = { pole: new THREE.CylinderGeometry(0.045, 0.055, 1, 6), post: new THREE.CylinderGeometry(0.11, 0.14, 1, 7),
    bam: new THREE.MeshLambertMaterial({ color: 0x8a7a54 }), wood: new THREE.MeshLambertMaterial({ color: 0x4e4134 }) };
  const y0 = W.heightAt(x, (z0 + z1) / 2) - 0.25, bam = [], wood = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3();
  const stick = (out, geo, ax, ay, az, bx, by, bz) => {
    V.set(bx - ax, by - ay, bz - az); const L = V.length(); V.divideScalar(L);
    Q.setFromUnitVectors(UP, V); P.set((ax + bx) / 2, (ay + by) / 2 + y0, (az + bz) / 2); S.set(1, L, 1);
    out.push(geo.clone().applyMatrix4(M.compose(P, Q, S)));
  };
  const n = Math.round((z1 - z0) / 0.55);
  for (let i = 0; i <= n; i++) {
    const z = z0 + 0.1 + i * ((z1 - z0 - 0.2) / n), j = Math.sin(i * 12.9898 + x) * 0.06;
    if (z + 0.8 <= z1) stick(bam, YARAI.pole, x - 0.05, 0, z, x - 0.05 + j, h + j, z + 0.8);
    if (z - 0.8 >= z0) stick(bam, YARAI.pole, x + 0.05, 0, z, x + 0.05 - j, h - j * 0.5, z - 0.8);
  }
  for (const y of [0.55, h - 0.35]) stick(bam, YARAI.pole, x + 0.13, y, z0 - 0.1, x + 0.13, y + 0.04, z1 + 0.1);
  for (const z of [z0, z1]) stick(wood, YARAI.post, x, -0.2, z, x, h + 0.35, z);
  const g = new THREE.Group();
  for (const [parts, mat] of [[bam, YARAI.bam], [wood, YARAI.wood]]) {
    const m = new THREE.Mesh(mergeGeometries(parts), mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    for (const q of parts) q.dispose();
  }
  return g;
}
// 堤：中央の細い高まり。両側は低い湿地
function height(x, z) {
  let h = (demSample(DEM, x * 4, z * 4) - D0) * 0.5;
  h += 0.12 * Math.sin(x * 0.03 - z * 0.07);
  const d = Math.abs(z);
  const bank = clamp01((BANK + 5 - d) / 7);
  h += 1.3 * bank;
  h -= 0.7 * clamp01((d - 14) / 14);
  // 堀切三か所（史料：四重の矢来と堀切三つ）。外の三つの柵の手前（東）で堤を湿地の高さまで断ち切る。幅六ほど、法は緩く（歩いて降りて登る。足は遅くなる）
  for (const c of CUTS) { const dx = Math.abs(x - c); if (dx < 3.2) h -= (0.8 * bank + 0.15) * (0.5 + 0.5 * Math.cos(Math.PI * dx / 3.2)); }
  // 仮橋の下の掘り割り（幅九ほど）。橋の板の下の細い筋だけは堤の高さのまま残し、その上を歩いて渡る
  { const dx = Math.abs(x - KARIBASHI); if (dx < 4.5) h -= (1.3 * bank + 0.35) * (0.5 + 0.5 * Math.cos(Math.PI * dx / 4.5)) * (1 - clamp01((2 - d) / 0.6)); }
  return h;
}

import DEPTH_K09 from './k09/depth.js';   // 軍勢の厚み・陣立ての表（army_depth）
const k09_imafuku = {
  depth: DEPTH_K09,
  lethal: true,   // 命懸けの戦場（lethal.js）：流れ弾・突然の負傷と討死・制圧・恐怖・孤立
  // 身の回りの合戦の跡（timeslip_field.js）。今福：冬の堤と湿地。枯れ葦・ぬかるみ・水たまり、堤の上の倒れた槍
  timeslip: {
    wet: 0.55, dust: 0.1, trample: 0.3, debris: 1.2, arrows: 1, reeds: 0.5, maxSlope: 0.22,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.2, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: WESTWARD },
  // 始まりの札の二三行（五の4）。無いと共通の「組の旗と一緒に進もう。」が出ていた
  // 始まりの札の味方対敵は数で（五4。史実：佐竹勢千五百ほど・砦の守兵六百ほど）
  introSides: { a: '佐竹　千五百', b: '豊臣　六百' },   // 「豊臣方　六百」だと札の幅で「六／百」と折り返していた
  introText: () => '夜明け前の今福。鯰江川と大和川にはさまれた一筋の堤を、梅津憲忠の隊と西へ寄せる。豊臣方の四重の柵を破り、砦を奪え。',
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が堤の上で続けての太刀で倒れた）
  wakeOK: (rt) => (rt.flags.step || 0) >= 2,   // 近づいた軽い兵は本物に替える（AA）。堤を進む間は静かに
  minutes: 14,
  // 堤の上の徒の寄せ（史料「通れるのは堤だけ」）。本人だけ馬で駆け抜け、組を二十も後ろに置いて砦へ一人で入っていた（一5）。名のある将は馬上のまま（busho の horse）
  noHorse: true,
  // 段の共通操作より先に、下の木戸の口へ寄せる操作を通す。省くと袖の柵で止まり続ける。
  botBrainDepth: true,
  noCouriers: true,   // 乗り手の無い伝令の馬が堤と川べりを走っていた（BL7）
  noYaguraTask: true,      // 砦の櫓を脇の目標「物見櫓の中へ入り、守りを追い出せ」にしない（右上は①〜④だけ。三3・十1）
  dpNoMark: true,         // 行き先を敵部隊の中心へ替えず、堤の上の一か所に保つ。
  goalSignNoLabel: true,   // ▼の上に「印へ進め」などの字を出さない（三の1・五の1）
  stageGoalsOnly: true,    // 右上は四つの段だけ（「敵を何人討つ」で埋めない。三の1・AW3）
  goalsAllRows: true,      // 共通の既定は今の一件だけ。①〜④を最初から並べ、済みに印を付ける。
  goalVisibleRows: 4,      // 一覧を有効にするだけでは一件に絞られる。四段とも初めから描く。
  forceBarAlways: true,   // 人数を渡すだけでは共通の棒が隠れる。佐竹・豊臣の残りを戦の間ずっと示す。
  nameTagLimit: 12,        // 既存の名札の枠内で、見える将の名を二、三人だけに絞らない。
  nameRange: 120,          // 共通の四十メートル制限で、堤の先の木村・後藤や後方の家老の名が消えないようにする。
  gateGuide: false,        // 竹の矢来の木戸は、前に立てば組の者と縄で引き倒す（update）。「木戸を打て（長押し）」の操作の字と「門が開いた」は出さない（五の1）
  noSiegeFeel: true,      // 木戸も共通の城門判定に含まれる。低湿地の矢来へ落石・破城槌を出さず、専用の縄と本物の射手だけを使う。
  hidePlayerSign: true,    // 足元の白い輪（写真に無い作り物の印）を出さない（八の1）
  goalSignBare: true,      // 真上の▼に「この人について行く」の字を添えない（五の1）
  // 右上は戦の間ずっと今の段の一行（三の3）。梅津の後ろに付いた時に「梅津憲忠について行く」へ替えない
  missionHeading: (rt) => { const s = stageNow(rt); return s ? '①②③④'[s.i] + s.line : ''; },
  foeHit: 0.9,   // 物かげの無い一本の堤で、見えない矢玉に三度に二度討たれていた（十二3）
  // 11/6 十五回目（専門家の目・三1・五1）：段の合間の共通の「次の下知を待て」（合図を待つ言い方）、一本の堤に無い「横槍」の声（五秒おきに二度）、
  // 渋江の討死の札に重なる共通の「味方の大将が討たれた」と、目の前の討死を六秒後に言い直す使番の声を出さない
  speechAllowed: (rt, who, text) => !/次の下知を待て|横槍が入った|^横槍じゃ|^味方の大将が討たれた$|^渋江政光が討たれた$/.test(String(text || '')) &&
    !(who === '使番' && /渋江政光、討死/.test(String(text || ''))),
  // 砦の中の乱戦に「一騎打ち」の見出しだけが名も無く出ていた（今福に一騎打ちの話は無い）。名の無い「敵の隊が崩れた」も出さない（五1）
  // 渋江の討死の後の名の無い「味方の隊が崩れた」も出さない（渋江の札が「佐竹の先手が崩れる」と告げている）
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵の隊が崩れた' && t !== '味方の隊が崩れた' && t !== '味方の大将が討たれた',
  // 一本の堤の上で、戸村の組（本人の二十歩ほど後ろ）の様子を使番が走って「後方にて攻めかかっておる」と告げていた（目で見える。五1）
  allyReports: false,
  noFlankCry: true,   // 一本の堤で共通の「横槍じゃ！」が④に出ていた（上杉は槍でなく中州の鉄砲）
  world: {
    seed: 1614126,
    namedKacchu: KACCHU_K09,   // 梅津憲忠の現存の具足（佐竹史料館）
    // 史実：佐竹の寄せは卯の刻（夜明け前）。東の空だけ白む暗さで始め、堤に着く頃に夜が明ける（setTime('morning')）
    time: 'night',
    // 夜明け前の暗さ（旗と兵が昼のように照らされていた。二3）：空も霧も沈め、東の地平の白みだけ残す
    // 空からの返りの光を青白くしない（黒漆の具足が夜明け前に白銀と水色に光り、腿が白く浮いていた。九6・十5）
    nightLight: { sky: 0x2a3140, fog: 0x30384a, top: 0x0e1422, sun: 0x8a7e80, sunPos: [60, 6, 95], glow: 0xb08068, glowK: 0.3, hemiSky: 0x4a4640 },
    nightLift: 1.5,
    // 11/6 fixc0806：月と空の散る光も下限近くに（篝火と東の白みで形を読ませる）
    nightFill: 0.3, nightMoonMin: 0.35,
    // 兵の面の夜の補光（月明かりの青白い足し）を掛けない：黒漆の具足が白銀と水色に光り、腿が白く見えていた（写真で確かめた。四3・十5）
    unitNightScale: 0,
    mist: true,
    groundHalf: 260, moveLim: 240,   // 佐竹の本陣（x 194）を動ける所の内に（176 の外で本陣の兵が 176 へ飛んだ。二巡）
    farReliefScale: 0.15,   // 大坂の北東は河内の低湿地。地図の外も丘にせず、低く平らにつなぐ
    // 遠くの山並みも低く霞ませる（四方に高い山がそびえていた。生駒は東の遠くに低く見えるだけ。四5）
    // 西（大坂の町・海の方）にも山の背が見えていた。河内の低地は地平まで平ら（八1）
    mountainScale: 0.1, mountainHaze: 0.9,
    height,
    // 河内の沖積の低地。堤の法と川べりに人より大きな白い半球の岩が出ていた（始まりの札の後ろ。八1）→ 泥に埋まる小さな礫だけ
    alluvialRocks: true,
    muddy: 0.5,
    waterSlow: true,
    // 大和川（幅二百m）と鯰江川は徒では渡れない。深みには入れず、柵を川へ回り込んで抜けられない（一8・史料「通れるのは堤だけ」）
    riverCross: true,
    // 脛より深い水には入れない（前は胸まで入れ、砦の後は本人も組の足軽も川に浸かって立っていた。一8・十一2）
    // 11/6 描いて遊んで：脛まで（0.3）でも、砦の北の縁で本人と組が川面の上に立って見えた（砦の段 125 秒。一8）→ 足の甲まで
    wadeDepth: 0.12,
    streams: [{ pts: SOUTH, w: 22, depth: 3.4 }, { pts: NORTH, w: 22, depth: 3.4 }],
    paths: [[[240, 0], [150, 0], [60, 0], [-40, 0], [-70, 0]]],
    tint(x, z, h, c) {
      // 冬の枯れ葦の湿地。堤の上は土の色
      const d = Math.abs(z);
      if (d < BANK + 2) c.setRGB(c.r * 0.55 + 0.2, c.g * 0.5 + 0.16, c.b * 0.4 + 0.08);
      else c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.2, c.b * 0.4 + 0.07);
    },
    clear: (x, z) => Math.abs(z) < 14 && x > -110 && x < 200,
    trees: 70,
    rocks: 0,   // 河内の低湿地の泥に岩は無い（水際に白い半球の岩が並んでいた。八1）
    tufts: 3200,
    treeDensity: (x, z) => (Math.abs(z) > 60 ? 0.9 : 0.1),
    fleeOut: (x, z, team) => (team === 1 ? x < -170 : x > 230),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    // 共通の川石（径二 m 近い丸石）が堤のすぐ脇の水に白い半球で浮いて見えた（始まりの札の後ろ・砦の北の縁。八1）。河内の泥の川に大石は無い
    for (const st of W.def.streams || []) if (st.rockMesh) st.rockMesh.visible = false;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // ---- 今福の砦：堤をふさぐ四重の柵（史実）・櫓・篝火。外の三重は木戸の弱い柵で、一つずつ破って進む ----
    F.outer = [];
    // 名は史料どおり「矢来」。共通の城攻めは「木戸」も拾うため、noSiegeFeel で落石・破城槌を除外する（八1・十3）。
    //   矢玉は櫓と柵の内の本物の鉄砲・弓が撃つ
    // 柵の線は外（東＝寄せ手の側）が表になる向きに引く。両端は川の深みまで杭を打ち込み、湿地を回り込めない
    for (const dx of [22, 32, 42]) {
      const x = FORT.x + dx;
      // 木戸の両脇（堤の上の幅いっぱい）は木戸と一緒に引き倒す袖の柵。外は川の縁まで
      const wing = [...wallLine(rt, [[x, -3], [x, -BANK - 1]], { team: 1, hp: 70, name: '外の矢来', segLen: 5 }), ...wallLine(rt, [[x, BANK + 1], [x, 3]], { team: 1, hp: 70, name: '外の矢来', segLen: 5 })];
      wallLine(rt, [[x, -BANK - 1], [x, -WADE - 2]], { team: 1, hp: 70, name: '外の矢来', segLen: 5 });
      wallLine(rt, [[x, WADE + 2], [x, BANK + 1]], { team: 1, hp: 70, name: '外の矢来', segLen: 5 });
      const st = rt.army.addStruct({ seg: [x, 3, x, -3], nx: 1, nz: 0, hp: 90, maxHp: 90, team: 1, name: '外の矢来の木戸' });
      st.mesh = yaraiGate(W, x, -3, 3, 2.5); rt.scene.add(st.mesh); st.wing = wing; st._shattered = true;
      F.outer.push(st);
    }
    const fortWing = [...wallLine(rt, [[FORT.x + 12, -3.4], [FORT.x + 12, -BANK - 1]], { team: 1, hp: 1e9, name: '砦の矢来', segLen: 5 }), ...wallLine(rt, [[FORT.x + 12, BANK + 1], [FORT.x + 12, 3.4]], { team: 1, hp: 1e9, name: '砦の矢来', segLen: 5 })];
    wallLine(rt, [[FORT.x + 12, -BANK - 1], [FORT.x + 12, -WADE - 2]], { team: 1, hp: 1e9, name: '砦の矢来', segLen: 5 });
    wallLine(rt, [[FORT.x + 12, WADE + 2], [FORT.x + 12, BANK + 1]], { team: 1, hp: 1e9, name: '砦の矢来', segLen: 5 });
    F.gate = rt.army.addStruct({ seg: [FORT.x + 12, 3.4, FORT.x + 12, -3.4], nx: 1, nz: 0, hp: 200, maxHp: 200, team: 1, name: '砦の木戸' });
    F.gateMesh = yaraiGate(W, FORT.x + 12, -3.4, 3.4, 3.1); rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh; F.gate.wing = fortWing; F.gate._shattered = true;
    // 櫓は木戸の両脇の二つだけ（奥の櫓は堤の真ん中だと裏の柵の口の正面をふさいで木村・後藤の隊が砦の裏で詰まり（九2）、
    //   堤の縁へ寄せると砦の中で戦う本人のカメラを壁でふさいだ（十一2））
    const TOWERS = [[FORT.x + 8, 9], [FORT.x + 8, -9]];
    for (const [x, z] of TOWERS) rt.scene.add(yagura(W, x, z, { mon: 'toyotomi', rot: Math.PI / 2 }));   // team を渡さない：共通の櫓の守り（素の重さの二人）と脇の目標「物見櫓の中へ入り…」が重なって出ていた（三2・五1）。守りは下の三人
    // 櫓の上の鉄砲と弓（二の3・二の7：砦へ近づくほど上から撃たれる）。櫓の床に立たせ、砦が落ちたら討たれる
    F.towerU = [];
    for (const [x, z] of TOWERS) {
      const g = rt.army.addGroup({ team: 1, faction: 'toyotomi', name: '櫓の守り', order: 'hold', anchor: { x, z }, facing: Math.PI / 2, morale: 100, noRout: true, aggro: 2 });
      g.dmgMult = 0.3;   // 櫓の矢玉も段の敵と同じ重さに（前は素の重さで、堤の上の本人が見えない所からの矢で倒れた。十二3）
      const y = W.heightAt(x, z) + lookoutDeckHeight() + 0.08;
      rt.army.spawn(g, ['gun', 'gun', 'bow'].map((type, i) => ({ type, n: 1, o: { ...KIMURA, x: x + 0.4, z: z + 0.6 - i * 0.6 } }))).forEach((u, i) => {
        u.pos.set(x + 0.4, y, z + 0.6 - i * 0.6); u.perch = { x: u.pos.x, y, z: u.pos.z }; u.mesh.position.copy(u.pos); F.towerU.push(u);
      });
    }
    for (const [x, z] of [[FORT.x + 16, 6], [FORT.x + 16, -6], [FORT.x, 0]]) { try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { console.warn(e); } }
    F.fortFlags = [[FORT.x + 2, 8], [FORT.x + 2, -8], [FORT.x - 12, 5]]   // 奥の幟は③の持ち場（砦の西の口）の真ん中を外す
    .map(([x, z]) => { const m = nobori(W, x, z, 'toyotomi', 7); m.userData.noMerge = true; rt.scene.add(m); return m; });
    // 砦の裏（城の側）の柵。堤の上の道だけ口を開け、木村・後藤の隊も守兵もそこを通る（柵を抜けて来ない。一8）
    // 口は堤の上の道の幅いっぱい（狭いと重成の寄せが柵の裏で詰まり、堤の押し合いにならなかった。九2）
    rt.scene.add(palisade(W, [FORT.x - 14, WADE + 2, FORT.x - 14, 5.5], { h: 2.6, solid: true }));
    rt.scene.add(palisade(W, [FORT.x - 14, -5.5, FORT.x - 14, -WADE - 2], { h: 2.6, solid: true }));
    // 仮橋（砦の西、片原町へ渡る板の橋）：横板・両の桁・掘り割りに立つ橋脚。手すりの無い急ごしらえ
    { const bx = KARIBASHI, parts = [], put = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); parts.push(g); };
      const y = Math.max(W.heightAt(bx - 4.6, 0), W.heightAt(bx, 0), W.heightAt(bx + 4.6, 0)) + 0.05;
      for (let x = bx - 4.8; x <= bx + 4.8; x += 0.36) put(bridgeBoard(3.3, 0.1, 0.32, true), x, y + 0.02 * Math.sin(x * 7), 0, Math.PI / 2);
      for (const z of [-1.5, 1.5]) put(bridgeBoard(10, 0.22, 0.18, true), bx, y - 0.16, z);
      for (const x of [bx - 2.2, bx + 2.2]) for (const z of [-1.5, 1.5]) put(bridgeBoard(0.2, 2.6, 0.2, true), x, y - 1.4, z);
      const m = new THREE.Mesh(mergeGeometries(parts), bridgeWoodMaterial()); for (const g of parts) g.dispose();
      m.castShadow = m.receiveShadow = true; rt.scene.add(m); }
    // ---- 佐竹の本陣（東の後方）：床几の義宣と旗本だけ ----
    // 本陣は堤の上（前は z -14 の湿地の縁で、床几の義宣と旗本が脛まで水に浸かっていた。一8）。陣幕は堤の幅に収まるよう小さく
    const hq = camp(rt, { x: 192, z: -4, w: 14, d: 10, facing: WESTWARD, team: 0, faction: 'tokugawa', mon: 'satake', armor: 0x24221f,
      guard: 25, guardFlag: 'satake', reserve: 0, runTo: { x: 160, z: 0 } });
    // 総大将は本陣の床几に座り、旗本に囲まれて前に出ない。camp の大将は名のある将として馬に乗り、馬の上で床几に座る形になって
    //   堤の東の宙に浮いて見えた（描いて遊んで、③の間に振り返るたび。一2・九6）→ 徒の義宣を陣幕の内に据える
    const hqG = rt.army.addGroup({ team: 0, faction: 'tokugawa', name: '佐竹義宣の本陣', order: 'hold', anchor: { x: 194, z: -4 }, facing: WESTWARD, aggro: 4, width: 1, morale: 100, noRout: true });
    rt.army.spawn(hqG, dress([busho('佐竹義宣', { horse: false, invuln: true, hat: 'kabuto', haori: 0, flag: 'sashi:satake:#202638:#c9a653' })], SATAKE));
    if (hqG.units[0]) { hqG.leader = hqG.units[0]; hqG.units[0]._crouch = true; }
    if (hq) hq.general = hqG.units[0] || null;
    for (const g of rt.army.groups) if (g.team === 0 && !g.mon) g.mon = 'satake';   // 本陣の旗本の隊旗も佐竹の扇に月（徳川の葵にしない）
    for (const [x, z] of [[158, 8], [158, -8], [172, 0]]) rt.scene.add(nobori(W, x, z, 'satake', 7));
    rt.scene.add(tawara(W, 196, -8, 0.2, 4));   // 兵糧の俵は本陣の内に（始まりの札の後ろの川べりに積んであった。八1）
    // 大坂城（西南西の三 km ほど先＝堤を寄せる向きの先。前は大和川のすぐ向こうに近すぎた）：北の石垣の二の丸と京橋口の馬出、手前の惣構えの北（大川）と東（猫間川）。osaka_far.js
    // 城の形は北が -z の作りなので、北の惣構えは城の北（-z）、東の惣構えは城の東（+x）に引き、外の堀は今福の側に向く
    try { osakaFar(rt, { x: -950, z: 520, s: 1.05, big: 1.45,   // 描ける奥の限りに置き、形を小さめにして三 km 先の見かけに（④の写真で城がおもちゃのように近く大きかった。八1）
 land: [[-1420, -10, -881, 890], [-881, 451, -520, 990]], sogamae: [{ pts: [[-1180, 360], [-790, 360]], side: -1, water: true, s: 1.6 }, { pts: [[-790, 360], [-790, 710]], side: -1, water: true, s: 1.6 }] }); } catch (e) { console.warn(e); }

    // ---- 味方：梅津憲忠の隊（主人公）・渋江政光の組。佐竹義宣は東の本陣に残る ----
    F.satake = allyGroup(rt, { faction: 'tokugawa', name: '梅津憲忠の隊', anchor: { x: SPAWN.x - 86, z: 0 }, facing: WESTWARD, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('梅津憲忠', UMEZU), uS(3), uA(24), uG(8)], SATAKE).map(kasa));
    F.shibue = allyGroup(rt, { faction: 'tokugawa', name: '渋江政光の組', anchor: { x: SPAWN.x - 64, z: 0 }, facing: WESTWARD, width: 7, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('渋江政光', { invuln: true }), uS(3), uA(18), uG(6)], SATAKE).map(kasa));
    // 史実：戸村十太夫義国は渋江とともに第四の柵まで取り、秀忠から感状と刀を受けた（文春・秋田県公文書館）。
    // 渋江の組の後ろの堤に一人だけ置く（前は北の鯰江川の向こう岸に取り残され、梅津の隊にも同じ名の将がいた）
    F.tomura = allyGroup(rt, { faction: 'tokugawa', name: '戸村義国の組', anchor: { x: SPAWN.x - 42, z: 0 }, facing: WESTWARD, width: 6, aggro: 8, noRout: true, formation: 'column' },
      dress([busho('戸村義国', { invuln: true }), uS(2), uA(10), uG(3)], SATAKE).map(kasa));
    // 味方の隊旗は各家の紋で（隊の家紋 g.mon を渡さないと徳川の家の葵の幟になり、佐竹の列の中に葵の大幟が立っていた。一6・十4）
    for (const g of [F.satake, F.shibue, F.tomura]) { g.mon = 'satake'; g.defMult = 1.5; g.dmgMult = 1.3; g.aggro = 24; }
    // 細い堤の先頭で囲まれやすい。刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ。高遠・木津川と同じ作り）
    // 重成と又兵衛は今福では死なない（深手で担がれて退く。onKill）。共通の「木村重成が討たれた」の知らせは史実に反するので出さない
    { const ok = rt.onKill.bind(rt); rt.onKill = (v, k) => { const q = F.quiet; if (v.type === 'busho' && v.team === 1 && /木村重成|後藤又兵衛/.test(v.name || '')) F.quiet = true; try { return ok(v, k); } finally { F.quiet = q; } }; }
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }
    const n = RANKS[rt.G.rank].squad;
    // 本人の組も佐竹の黒漆の具足と陣笠で（共通の組は色を渡さず、夜明け前の堤で白銀の胴・藁の笠の兵になっていた。四3・十5）
    if (n) { const sp = rt.army.spawn; rt.army.spawn = (g, list) => sp.call(rt.army, g, dress(list, SATAKE).map(kasa));
      try { rt.makeSquad({ x: SPAWN.x + 2, z: 0 }, WESTWARD, [{ kind: 'spear', n: Math.min(n, 16) }]); } finally { rt.army.spawn = sp; } }

    rt.setPhase('brief');
    rt.obj('main', '堤を西へ進み、四重の柵を破って今福の砦を奪う', 'main');
    rt.banner('今福', '慶長十九年十一月二十六日　大坂城の北東');
    // 史実：卯の刻、まず川向うの鴫野で上杉が始め、佐竹は遅れて軍監に「油断」と咎められた（梅津憲忠が受けた）
    sfx('volleyFar', 0.45); rt.after(1.6, () => sfx('volleyFar', 0.35));
    rt.say('梅津憲忠', '鴫野で鉄砲が鳴った。上杉はもう寄せておる。軍監殿に「佐竹は油断」と咎められたぞ', 4);
    rt.after(4.4, () => rt.say('渋江政光', '通れるのはこの堤だけじゃ。夜の明けぬうちに、堤の陰に身を低うして寄る。声を立てるな', 3.8));
    rt.after(8.6, () => {
      // 夜明け前の忍び寄り（渋江「声を立てるな」）に、総大将の大声の「進め！」と寄せの法螺貝は合わない。貝は見つかって柵へかかる時に吹く
      // 主君は家臣を通称・官途名で呼ぶ（梅津半右衛門憲忠・渋江内膳政光）
      rt.say('佐竹義宣', '大坂城は目と鼻の先。半右衛門、内膳、先陣は任せた。音を立てずに寄せよ', 3.4);
    });
    // 下知を待って八秒以上止まらず、始まりから堤の陰を寄せる。
    // 北の今福村から見えにくい南の肩へ渋江の列を通す。
    [F.satake, F.shibue, F.tomura].forEach((g, i) => {
      if (!g || !g.count) return;
      g.calm = false; g.order = 'move';
      g.dest = g.anchor = { x: FORT.x + 60 + i * 14, z: g === F.shibue ? 4.5 : 0 };
    });
    rt.after(11.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    // 砦の守将と反撃の将の名は佐竹の陣で知れていた（目標の名が「見えぬ敵の陣を物見する」に伏せられ、組頭が物見の話をしていた。二2）
    for (const n of ['矢野正倫', '飯田家貞', '木村重成', '後藤又兵衛']) revealName(rt, n);
    // 主の札は段の目標（①〜④）に任せる。残すと段の合間に組頭が済んだ①②の言葉を言い直していた（十1）
    rt.objRemove('main');
    const ctx = { faction: 'toyotomi', flag: 'toyotomi', armor: KIMURA.armor, dmg: 0.21, backing: false, scale: 1.4, look: (l) => dress(l, KIMURA),
      friends: () => [F.satake, F.shibue, F.tomura, ...(F.reinf || [])].filter((g) => g && g.count && !g.routed), botSeek: 40,
      // 舟・櫓の射手は堤から斬れない。深みに向かって歩き続けず、堤の上の相手を追う。
      botFoeAllowed: (u) => !u.perch && !u.isStruct && Math.abs(u.pos.z) < BANK,
      // 中州の加勢を手当ての相手に選ぶと、渡れない川の手前で止まる。
      // 砦で踏みとどまる段（③）は、手当てに退く所も砦の東の口（KEEP から三十歩）まで。堤の東へ八十歩退いて持ち場を離れ、刻限で負けた（11/9 見回り 徳川D）
      botBackAllowed: (rt2, x, z) => Math.abs(z) < BANK && (rt2.flags?.dp?.cur?.s.kind !== 'hold' || Math.hypot(x - KEEP.x, z - KEEP.z) < 30),
      routeFight: true };
    // 木村・後藤の隊は片原町から堤の上を寄せる（隠れた所から湧かせると堤の外の深みに置かれ、後ろの兵が動けずに砦の裏で詰まった。九2）。川べりの鉄砲衆も指定した湿地の縁から出す。
    // 共通の隠れた出現位置へ移すと、川の深みに置かれて動けなくなる。
    const onBank = (l) => { ctx.fixedSpawn = true; return l; };
    depthStart(rt, ctx, [
      // ① 堤を進む。葦の中から鉄砲（鉄砲は川の中に立たせず、堤の下の湿地の縁に伏せる）
      Object.assign(DP.move({ to: { x: FORT.x + 50, z: 0 }, label: '堤', r: 8, max: 240, obj: '堤の上を西へ、砦の前まで進め',
        say: [['渋江政光', '堤から外れるな！　足を取られて動けなくなるぞ！']],
        ambush: { d: 70, say: ['足軽', '気づかれた！　今福村と葦の中から鉄砲じゃ！　堤の両側に伏せておる！'], foes: () => onBank([gunLine('堤の南の葦の鉄砲', { x: FORT.x + 70, z: 11 }, 4, { dmg: 0.21, mass: 0 }), gunLine('今福村の鉄砲', { x: FORT.x + 70, z: -11 }, 7, { dmg: 0.21, mass: 0 })]) },
        onEnd: (rt2) => {
          rt2.flags.step = 2;
          sfx('horagai', 0.8);   // 見つかったからには忍ばず、貝を吹いて柵へかかる
          rt2.world.setTime('morning');   // 砦の前に着く頃に夜が明ける（二十秒ほどで移ろう）
          // 葦の鉄砲は撃ち掛けたあと砦へ逃げ込む（砦の段で横から撃ち続けない）
          for (const g of rt2.army.groups) if (g.team === 1 && /葦の鉄砲|今福村の鉄砲/.test(g.name || '') && g.count && !g.routed) { g.noRout = false; g.morale = 0; }
        } }), { idleAdvance: false }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 砦を奪う
      // 立ち止まっても時切れで〔失〕のまま次へ進めない（三2）。木戸は味方の組も引き倒し、守兵は味方とともに討つ
      Object.assign(DP.fight({ at: { x: FORT.x + 2, z: 0 }, title: '今福の砦', sub: '堤をふさぐ四重の柵', obj: '四つの柵の木戸を破り、矢野正倫と飯田家貞を討て', max: 360, noRefill: true,   // 守兵は史実の六百（各三百）だけ。新手は湧かせない
        say: [['梅津憲忠', '木戸を破れ！　柵を一つずつ越えて砦へ迫れ！']],
        // 守兵は砦の中に籠る（見えない所から湧かせず、柵の内で待つ）。この段だけ出す所を決めたままにする
        foes: () => { ctx.fixedSpawn = true; return [{ name: '矢野正倫の守兵', from: { x: FORT.x - 4, z: 0 }, list: [busho('矢野正倫', { horse: false }), uS(2), uA(6), uG(4)], dmg: 0.19, noRout: 9999 },
          { name: '飯田家貞の守兵', from: { x: FORT.x - 12, z: -6 }, list: [busho('飯田家貞', { horse: false }), uS(2), uA(6), uG(4)], dmg: 0.19, noRout: 9999 }]; },   // 矢野・飯田は各三百で同じ数。守将が討たれた組から西の仮橋へ退く。
        reward: '今福の砦を奪った', onEnd: (rt2) => { ctx.fixedSpawn = false; this.taken(rt2); } }), { idleAdvance: false }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ③ 木村重成の反撃：堤の上で受け止める。後藤又兵衛が加わる
      // 寄せは史実の五つの波（重成・鉄砲衆・又兵衛と舟・渋江の討死・二の手）で数百人。継ぎ足しの新手（AB）は足さない
      // （足すと決めの数が二百を超え、どの遊び方でも七分の上限まで延びて、戦が十分を超えた）
      // 立ち止まっても段を早めに打ち切らない（前は四十五秒の立ち止まりで重成の二の手が出る前に③が済んでいた）
      Object.assign(DP.hold({ at: KEEP, dur: 100, r: 14, noRefill: true, label: '今福の砦', title: '木村重成の反撃', sub: '細い堤の上に鉄砲が並ぶ',
        obj: '奪った今福の砦に踏みとどまり、木村重成の反撃を押しとどめよ',
        waves: [
          // 重成（討死は翌年の若江）と又兵衛（道明寺）は今福では死なない。深手も又兵衛の脇腹の傷だけ（学び 六）
          // 共通の戦闘は invuln だけの敵将を本人の一撃で討つ。史実で生き延びる二人には mustLive も渡す。
          // 二人の隊は上杉の横撃まで崩れない（前は又兵衛の隊が加わって四十秒で、重成の隊も上杉の前に退いていた。史実は上杉の横撃で初めて支えきれず退く。二2）。
          //   上杉の鉄砲は段の終わりの六秒前に中州へ並び（t 94）、段の終わりに共通の hold が本隊の気を挫く。堤に残る殿は④で追い払う
          { t: 6, say: ['足軽', '旗は木村長門守！　若い大将が自ら出てきた！'], foes: () => onBank([{ name: '木村重成の隊', from: { x: FORT.x - 62, z: 0 }, list: [busho('木村重成', { invuln: true, mustLive: true }), uS(6), uA(20), uG(8)], width: 6, mass: 150, noRout: 9999, dmg: 0.25 }]) },
          { t: 28, say: ['足軽', '堤の両側から鉄砲が並んだ！　横から撃たれる！'], foes: () => onBank([gunLine('大和川べりの鉄砲衆', { x: FORT.x - 20, z: 11 }, 5), gunLine('鯰江川べりの鉄砲衆', { x: FORT.x - 20, z: -11 }, 5)]) },
          { t: 48, say: ['足軽', '後藤又兵衛じゃ！　川からも舟で鉄砲が寄せてくる！'], foes: () => { this.gotoBoats(rt); rt.world.setTime('afternoon'); return onBank([{ name: '後藤又兵衛の隊', from: { x: FORT.x - 66, z: 2 }, list: [busho('後藤又兵衛', { invuln: true, mustLive: true }), uS(6), uA(22), uG(6)], width: 6, mass: 200, noRout: 9999, dmg: 0.25 }]); } },
          // 史実：渋江の討死は重成の指図した狙い撃ち。撃たれる六秒前に下知の声
          { t: 64, say: ['木村重成', 'あの馬上の指物が佐竹の侍大将じゃ。鉄砲、狙え！'], foes: () => [] },
          { t: 70, say: ['足軽', '渋江様が撃たれた！　渋江内膳様、お討死！'], foes: () => { this.shibueFalls(rt); return []; } },
          { t: 88, say: ['足軽', '木村の新手が堤を押してくる！　下がるな！'], foes: () => onBank([{ name: '木村重成の二の手', from: { x: FORT.x - 62, z: -2 }, list: [uS(2), uA(20), uG(6)], width: 6, mass: 160, noRout: 9999, dmg: 0.24 }]) },
          { t: 94, foes: () => { this.uesugi(rt); return []; } },
        ],
        reward: '堤の上で踏みとどまった', onEnd: (rt2) => this.reinforce(rt2) }), { idleAdvance: false }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 増援とともに押し返す
      Object.assign(DP.fight({ at: { x: FORT.x - 20, z: 0 }, title: '押し返す', sub: '上杉の鉄砲が中州から撃ちかける', obj: '上杉の加勢とともに、砦の西の堤から木村・後藤の殿を追い払え', max: 150, noRefill: true,   // 史実は上杉の横撃で豊臣方が城へ引く。殿を崩せば締める（戦を四〜七分に）
        say: [['水原親憲', '佐竹を見捨てるな！　中州から堤の敵を横から撃て！']],
        foes: () => onBank([{ name: '木村重成の殿', from: { x: FORT.x - 60, z: 0 }, list: [uS(2), uA(16), uG(5)], width: 6, mass: 140, dmg: 0.25, noRout: 9999 },
          // 殿は退きながらも堤の上で踏みとどまって撃つ（前は出て十一秒で崩れ、④を本人が戦う間が無かった。描いて遊んで）。三十秒は崩れない
          { name: '後藤又兵衛の殿', from: { x: FORT.x - 68, z: 2 }, list: [uS(2), uA(14), uG(4)], width: 6, mass: 120, dmg: 0.25, noRout: 9999 }]),
        reward: '増援とともに豊臣方を退けた' }), { idleAdvance: false }),
    ].map(requiredStage), (rt2) => this.win(rt2));
  },

  // 刀・槍や火矢で壊した時も、縄で倒す時と同じく袖まで開く。
  // 共通処理は木戸だけを倒すため、そのままでは袖が残り、味方の列が詰まる。
  onStructDestroyed(rt, st) {
    if (st.wing) this.pull(rt, st);
  },

  // 木戸を縄で引き倒す。両脇の袖の柵も一緒に倒れ、堤の上の幅いっぱいが開く（六尺の口だけだと、組が柵の前で詰まって立ち尽くした。一5）
  // 縄で引いた矢来は割れずに倒れる。共通の「割れる演出」の木片が二十ほど宙へ飛び、黒い板が空に浮いて見えた（描いて遊んで 73 秒。八1）→ 割れの演出を止め、土埃と倒れる音だけ
  pull(rt, st) {
    const c = { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 };
    for (const s of [st, ...(st.wing || [])]) if (s.alive) { s._shattered = true; s.alive = false; s.hp = 0; rt.army.structFall(s); }
    if (rt.world.dustCloud) { rt.world.dustCloud(c.x, c.z, true); rt.world.dustCloud(c.x - 1.5, c.z, true); }
    sfx('crash', 0.9);
  },

  taken(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.banner('砦を奪った', '矢野正倫と飯田家貞の首を挙げた');   // 史料：矢野は仮橋ぎわで討たれ首実検。「討死」の字だと、砦の中にいる本人へ使番が走って運び直していた（五1）
    // 史実：義宣は奪った今福村・蒲生村に三段構えの付城を普請させかけた
    rt.say('佐竹義宣', 'よし、今福を取ったぞ！　今福村に付城を急げ。……西に鉄砲の列が見える、気を許すな', 4);
    // 残った木戸も引き倒す（hp だけ 0 にすると、反撃の段で本人が近づいた時に「木戸が倒れた」がもう一度出ていた）
    for (const st of [F.gate, ...(F.outer || [])]) if (st && st.alive) this.pull(rt, st);
    for (const u of F.towerU || []) if (u.alive) rt.army.kill(u, null);   // 砦が落ち、櫓の上の者も討たれた
    // 奪った砦に豊臣の桐の幟が立ったままだった（佐竹が引き抜く。七1）
    for (const m of F.fortFlags || []) m.visible = false;
    // 史実：矢野・飯田は逃げずに討死（矢野は仮橋ぎわ）。段の終わりにまだ生きていれば、ほかの佐竹の者が討った事にする（本人の手柄にはしない）
    // 知らせ（「〇〇が討たれた」）も札と重ねない（F.quiet）。深手で担がれている（dying）将は一度目の kill で手当てが終わるだけなので二度
    F.quietKill = true; F.quiet = true;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && u.type === 'busho' && /矢野正倫|飯田家貞/.test(u.name || '')) { rt.army.kill(u, null); if (u.alive) rt.army.kill(u, null); }
    F.quietKill = false; F.quiet = false;
    // 先に討たれていた時の「矢野正倫が討たれた」が、砦を奪った札のあとも待ちに残り、札を何百回も出し直していた（流しの刻 176〜178）。取り下げる
    for (const e of (rt.events && rt.events.slots) || []) if (e && e.pending && /矢野正倫|飯田家貞/.test(e.text || '')) e.pending = false;
    // 史実：佐竹は奪った後に兵を入れ替えようと堤に集まった（その隙を重成・又兵衛に突かれた）。二の備が東から砦の前の堤へ上がる
    //   （先手は砦の段で討ち減らされ、反撃の段は本人がほとんど一人で受けていた。九4）
    const ni = allyGroup(rt, { faction: 'tokugawa', name: '佐竹の二の備', anchor: { x: KEEP.x + 60, z: 0 }, facing: WESTWARD, width: 7, aggro: 10, speed: 3.4, morale: 90, noRout: true, formation: 'column' },
      dress([uS(4), uA(24), uG(6)], SATAKE).map(kasa));
    ni.mon = 'satake'; ni.defMult = 1.8; ni.order = 'move'; ni.dest = { x: KEEP.x + 6, z: 0 }; ni.anchor = { x: KEEP.x + 6, z: 0 };
    F.reinf = [ni];
  },

  // 後藤又兵衛の舟（史実：堤から撃つだけでなく、舟で水の上からも寄せた）。南の大和川の堤寄りに三艘、一艘に鉄砲三
  gotoBoats(rt) {
    const F = rt.flags, W = rt.world;
    if (F.boats) return;
    F.boats = [];
    const g = rt.army.addGroup({ team: 1, faction: 'toyotomi', name: '後藤又兵衛の舟の鉄砲', order: 'hold', anchor: { x: FORT.x, z: 23 }, facing: Math.PI, morale: 100, noRout: true, aggro: 30, seekRange: 60 });
    g.dmgMult = 0.3;
    for (const x of [FORT.x + 6, FORT.x + 18, FORT.x + 30]) {
      const z = 23, y = W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.05;
      const mesh = kobune(x, y, z, Math.PI / 2, 7); rt.scene.add(mesh);   // 舳先を堤に沿って東西へ
      const us = rt.army.spawn(g, [0, 1, 2].map((i) => ({ type: 'gun', n: 1, o: { ...KIMURA, x: x - 1.6 + i * 1.6, z } })));
      us.forEach((u, i) => { u.pos.set(x - 1.6 + i * 1.6, y + 0.1, z); u.perch = { x: u.pos.x, y: u.pos.y, z: u.pos.z }; u.mesh.position.copy(u.pos); });
      F.boats.push({ mesh, us });
    }
  },

  // 渋江政光の討死（史実：重成の反撃の中で鉄砲に当たる）
  shibueFalls(rt) {
    const F = rt.flags;
    const u = F.shibue && F.shibue.units.find((q) => q.alive && q.type === 'busho');
    // 共通の「味方の大将が討たれた」は札と重なり、八秒おきに四度出ていた（流しの刻 224〜248）。知らせを止め、組の頭を失った印も消す
    if (u) { sfx('gun', 0.9); F.quiet = true; u.invuln = false; u.hp = 0; rt.army.kill(u, null); if (u.alive) rt.army.kill(u, null); F.quiet = false; F.shibue.commanderLostAt = undefined;
      // 見出しは本人の目の前の出来事として直に出す（共通の見出しは見届けの判じで使番の運びに替わり、その声も言い直しとして止めているので、何も出ずに渋江が消えていた。二2）
      rt._bannerT = rt.t; rt.hud.banner('渋江政光、討死', '佐竹の先手が崩れる'); }
    // 史実：渋江の討死で佐竹の先手が崩れる。渋江の組は東へ下がり、梅津の隊と自分の組だけで堤に残る
    //   （崩れの印にすると、共通の「味方の隊が崩れた」が札の後に八秒おきに四度出た。組は崩さず、東の堤へ引かせる）
    if (F.shibue) { F.shibue.order = 'hold'; F.shibue.aggro = 2; F.shibue.anchor = { x: KEEP.x + 90, z: 0 }; F.shibue.facing = WESTWARD; }
    rt.after(3.2, () => rt.say('梅津憲忠', '内膳殿の分まで踏みとどまれ！　ここを抜かれれば佐竹は終わりじゃ', 3.6));
  },

  // 木村重成の反撃を耐え抜いた → 上杉の加勢（必ず。鴫野から川を越えて来る）
  // 上杉の横撃（史実：鴫野の上杉・堀尾・榊原が大和川の中州から撃ちかけ、豊臣方は支えきれず退く）。③の終わりの六秒前に並ぶ（④の始まりでも呼ぶ。一度だけ）
  uesugi(rt) {
    const F = rt.flags;
    if (F.uesugi) return;
    F.uesugi = true;
    sfx('taiko', 1); sfx('horagai', 0.8);
    rt.banner('上杉の加勢', '鴫野の上杉勢が大和川の中州から撃ちかける');
    // 史実：上杉の横撃で豊臣方が退くのは午後四時過ぎ（冬の日の傾く頃）。一分ほどかけて西の城の方へ日が傾く
    rt.world.setTime('dusk');
    rt.say('足軽', '大和川の中州に上杉の鉄砲じゃ！　竹に雀の旗が並んだ！', 3.6);
    // 川べりに伏せた豊臣の鉄砲衆は、中州からの横撃をまともに受けて先に退く（残ると、持ち場から離れた湿地の縁で
    //   いつまでも崩れず、③が三分近く延びて本人は立ち尽くした。描いて遊んで 236〜419 秒。二5）
    // 本隊も横撃を受けて退く。士気を三十まで下げるだけでは踏みとどまり、③が長引く場合がある。
    // ④で堤に残る殿は含めず、本人が持ち場を守った条件も requiredStage で残す。
    rt.after(6, () => {
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed &&
        /川べりの鉄砲衆|^(木村重成|後藤又兵衛)の(隊|二の手)$/.test(g.name || '')) {
        // 組頭が健在なら士気が零でも共通処理では崩れない。横撃を受けた退却の下知を明示する。
        g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee';
      }
    });
    // 加勢から九秒で又兵衛が負傷し、舟も退く。③が長引いても④への移行を待たない。
    // 史実：又兵衛は上杉の鉄砲の弾で脇腹に傷（左腕とも）。討たれはしない。舟は西へ漕ぎ戻る
    rt.after(9, () => {
      const g = rt.army.groups.find((q) => q.team === 1 && q.name === '後藤又兵衛の隊');
      const u = g && g.units.find((q) => q.alive && q.type === 'busho');
      if (u) { u.hp = Math.max(1, Math.round(u.hp * 0.6)); g.morale -= 30; rt.say('後藤又兵衛', '上杉の弾か……脇腹をやられた。構わぬ、退きながら撃て！', 3.6); }
      F.boatBack = true;
    });
    F.reinf = F.reinf || [];
    // 上杉は川を渡らず、水原親憲の鉄砲衆が南の大和川の中州（鴫野の側）に並んで川越しに横から撃つ（史実の横撃）。
    const mz = allyGroup(rt, { faction: 'tokugawa', name: '水原親憲の鉄砲衆', anchor: { x: KEEP.x - 6, z: 46 }, facing: Math.PI, width: 10, aggro: 4, seekRange: 70, order: 'hold', fixed: true, noRout: true, morale: 100, formation: 'line' },
      dress([busho('水原親憲', { invuln: true }), uS(3), uG(14)], UESUGI));
    // 史実：景勝の下の堀尾忠晴・榊原康勝も大和川の中州から横撃した。水原の東に並ぶ
    const sk = allyGroup(rt, { faction: 'tokugawa', name: '榊原康勝の鉄砲衆', anchor: { x: KEEP.x + 18, z: 46 }, facing: Math.PI, width: 8, aggro: 4, seekRange: 70, order: 'hold', fixed: true, noRout: true, morale: 100, formation: 'line' },
      dress([busho('榊原康勝', { invuln: true }), uS(2), uG(10)], { flag: 'sakakibara', armor: 0x24221f }));
    const ho = allyGroup(rt, { faction: 'tokugawa', name: '堀尾忠晴の鉄砲衆', anchor: { x: KEEP.x + 40, z: 46 }, facing: Math.PI, width: 8, aggro: 4, seekRange: 70, order: 'hold', fixed: true, noRout: true, morale: 100, formation: 'line' },
      dress([busho('堀尾忠晴', { invuln: true }), uS(2), uG(10)], { flag: 'horio', armor: 0x24221f }));   // 堀尾の分銅の旗（textures の horio）
    mz.mon = 'uesugi'; sk.mon = 'sakakibara'; ho.mon = 'horio';
    // 中州の鉄砲衆は川を渡らない。fixed は隊の要を据えるだけで、兵の移動と押し合いは止まらず一点へ寄っていた（全戦の通し）。
    // 櫓の射手と同じ持ち場を各人に渡し、隊の列を保って川越しに撃たせる。
    for (const g of [mz, sk, ho]) for (const u of g.units) {
      const q = g.slotPos(u.slot, g.initial), y = rt.world.heightAt(q.x, q.z);
      u.pos.set(q.x, y, q.z); u.mesh.position.copy(u.pos);
      u.perch = { x: q.x, y, z: q.z };
    }
    F.reinf.push(mz, sk, ho);
  },

  reinforce(rt) {
    const F = rt.flags;
    F.step = 4; F.reinfT = rt.t;
    rt.player.treatWounds(0.6);
    this.uesugi(rt);
    // 須田長義は同じ時に鴫野の先手で大野治長の反撃を受けており、今福の堤には来ていない。堤を西へ上がるのは佐竹の後備
    const su = allyGroup(rt, { faction: 'tokugawa', name: '佐竹の後備', anchor: { x: KEEP.x + 70, z: 0 }, facing: WESTWARD, width: 7, aggro: 8, speed: 3.4, morale: 90, formation: 'column' },
      dress([uS(4), uA(18), uG(6)], SATAKE).map(kasa));
    su.mon = 'satake'; su.order = 'move'; su.dest = { x: KEEP.x + 14, z: 0 };
    F.reinf.push(su);

  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '今福堤で踏みとどまった', pts: 40 }; }, '今福を保ち、豊臣方を退けた');
    rt.player.u.invuln = true;
    rt.banner('豊臣方、退く', '佐竹勢は今福の堤を保った');   // 史料は「決着つかず・付城は築けず」。今福を取りきった言い方にしない
    // 伝：初陣の重成に、又兵衛が「勝ち戦の引き際こそ大事」と城へ引かせ、自らは堤に残った
    rt.say('後藤又兵衛', '長門殿、引き際こそ大事でござる。城へ引かれよ。殿はこの又兵衛が持つ', 4);
    // 締めは四秒半ほどで勝ちの札になるので、その前に（real_common の大河内の書き込み）
    rt.after(2.2, () => rt.say('梅津憲忠', '内膳殿を失うた……堤の上に、これだけ倒れるとは', 4));
    rt.finish({}, katame(rt, { at: KEEP }));   // 旗を立てて持ち場を固め、鴫野の鉄砲の音を聞かせてから勝ちの札（k09/katame.js）
  },

  lose: makeLose('堤の上で潰えた', '佐竹勢は今福から押し戻された', '堤が……！　皆、東へ退け！', '足軽'),

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 又兵衛の舟は上杉の横撃で西へ漕ぎ戻る（乗った鉄砲衆ごと。城の方の遠くで止まる）
    if (F.boatBack && F.boats && F.boats.length && F.boats[0].mesh.position.x > FORT.x - 110) {
      for (const b of F.boats) {
        b.mesh.position.x -= dt * 2.6;
        for (const u of b.us) if (u.alive && u.perch) { u.perch.x -= dt * 2.6; u.pos.x = u.perch.x; u.mesh.position.x = u.pos.x; }
      }
    }
    // 舟の上の鉄砲は共通の頭では的を選ばず、一発も撃たなかった（一3）。舟から堤の佐竹勢を一人ずつ狙って撃つ（七〜十一秒に一発）
    // 又兵衛の「退きながら撃て」の下知どおり、西へ漕ぎ戻る間も射程内では撃つ。
    if (F.boats && !F.ending) for (const bt of F.boats) for (const u of bt.us) {
      // 舟の専用射撃も、倒れた兵・重傷で離脱した兵・敗走中の兵には行わせない。
      // fireGun は生死だけを確かめるため、ここで戦える状態を確かめる。
      if (!u.alive || u.gone || u.dying || u.woundOut || u.downed || u.rearWound || u.fleeing ||
        (u.k09Shot = (u.k09Shot ?? 2 + Math.random() * 6) - dt) > 0) continue;
      u.k09Shot = 7 + Math.random() * 4;
      const t = rt.army.nearestEnemy(u, 55, (o) => !o.isStruct && !o.gone && !o.fleeing &&
        !o.dying && !o.woundOut && !o.downed && !o.rearWound && Math.abs(o.pos.z) < WADE);
      if (t) { u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); rt.army.fireGun(u, t); }
    }
    if (F.ending) return;
    // 共通の「右の目標を全部果たしたら締める」は、③が済んで④の札が出るまでの合間に、済んだ③だけを見て勝ちにしていた
    // （④の殿を追い払わないうちに「合戦に勝利」。三3）。この戦は④が済んだ所で win が締める
    rt.goalsDoneT = 0;
    depthTick(rt, dt);
    // 史実：同じ日、大和川の向こうの鴫野では上杉と豊臣方（井上頼次・大野治長）が昼まで撃ち合っていた。川向うの遠い鉄砲の音を絶やさない
    if (F.begun && (F.step || 0) < 4) { F.farT = (F.farT ?? 6) - dt; if (F.farT <= 0) { F.farT = 9 + 8 * Math.random(); sfx('volleyFar', 0.18 + 0.12 * Math.random()); } }
    // 史実：上杉・堀尾・榊原の川越しの横撃に豊臣方は支えきれず城へ引いた（二の5：何もしなくても物語は進む）。
    // 加勢から四十秒を過ぎると、堤の上の豊臣方の気が少しずつ挫ける。本人が砦の西の堤で殿に当たる間は速く（一分ほどで崩れる）、
    // 殿と当たる前に全隊を退かせると、相手が消えて④を果たせなくなる。本人が戦いに入ってから退かせる（三3・④）
    const p = rt.player && rt.player.u && rt.player.u.pos;
    const rear = F.dp && F.dp.cur;
    if (F.step === 4 && rear && rear.engaged && rt.t - rear.t0 >= 30 && F.reinfT != null && rt.t - F.reinfT > 40) {
      const front = p && Math.abs(p.z) < 14 && p.x < FORT.x + 20 && p.x > FORT.x - 70;
      F.press = (F.press || 0) + dt * (front ? 2 : 0.6);
      const cap = 100 - F.press;
      for (const g of rt.army.groups) if (g.team === 1 && !g.routed && g.count && !/舟/.test(g.name || '')) {
        g.noRout = false; g.morale = Math.min(g.morale, cap);
        // 生きた組頭がいる殿にも、押し返された時は城へ退く下知を出す。
        if (cap < 22) { g.routed = true; g.order = 'flee'; }
      }
    }
    // 主を失った馬は川の深みへ駆け込まない（川の中で横倒しにもがいていた。一8）。湿地の縁で堤の方へ向き直る
    if ((F.horseT = (F.horseT || 0) - dt) <= 0) {
      F.horseT = 0.4;
      // 討たれた主の馬は堤を駆け回らず、倒れた主のそばに留まる（乗り手の無い鞍付きの馬が堤を走っていた。BL7）
      for (const o of rt.army.looseHorses || []) { const hp = o.h && o.h.position; if (o.t > 1.2 && !o.tame) { o.tame = o.calm = true; o.spd = Math.min(o.spd || 1, 0.8); } if (hp && Math.abs(hp.z) > WADE) { hp.z = Math.sign(hp.z) * WADE; o.heading = hp.z > 0 ? Math.PI : 0; } }
    }
    // 史料「通れるのは堤だけ」：堤の両脇の湿地の縁（WADE）より外へは誰も出ない。退く豊臣方は西の仮橋（片原町の方）へ。
    //   描いて遊んで：④で本人と組が砦の西の鯰江川べりに脛まで入って八十秒立ち、豊臣方の殿は鯰江川の向こう岸の野を退いていた（一8・二1）
    if ((F.bankT = (F.bankT || 0) - dt) <= 0) {
      F.bankT = 0.2;
      for (const u of rt.army.units) {
        if (!u.alive || u.isStruct || u.perch) continue;
        // 中州（z 46）の上杉・堀尾・榊原の鉄砲衆は外す。川を渡りかけた者（z 32 まで）は堤の縁へ戻す
        const az = Math.abs(u.pos.z);
        if (az > WADE && az < 32 && u.pos.x < 230) { u.pos.z = Math.sign(u.pos.z) * WADE; if (u.mesh) u.mesh.position.z = u.pos.z; }
      }
      if (p && Math.abs(p.z) > WADE) { p.z = Math.sign(p.z) * WADE; }
      for (const g of rt.army.groups) if (g.team === 1 && !/舟/.test(g.name || '')) g.fleeDir = { x: -1, z: 0 };
    }
    // 柵の木戸：本人が木戸の前に二秒いると、組の者と縄を掛けて引き倒す（柵の前で止まって撃たれ続けない）。砦の木戸は砦の段から。
    // 砦の段では味方の組も木戸に取り付き、八秒で引き倒す（本人が遅れても寄せが止まらない。二5）
    if ((F.gateScanT = (F.gateScanT || 0) - dt) <= 0) {
      F.gateScanT = 0.5;
      // 砦の段の味方の組は、次に残る木戸の前まで堤を歩いて寄せ、着いたら斬りかかる（「かかれ」の組は柵の向こうの敵を見ず、
      // 柵の東で立ち止まったまま砦へ寄せなかった。一5・九4）
      // 史実：矢野・飯田が討たれると、守兵は仮橋を外す間もなく片原町へ逃げた。将を失った守兵の組は崩れて西へ退く
      if (F.step === 2) for (const g of rt.army.groups) if (g.team === 1 && /の守兵$/.test(g.name || '') && g.count && !g.routed && !g.units.some((u) => u.alive && u.type === 'busho')) { g.noRout = false; g.morale = 0; }
      // 柵の内に入れば、そこからは「かかれ」で守兵と斬り合う（歩かせたままにすると敵の中を素通りして討たれた）
      if (F.step === 2) [F.satake, F.shibue, F.tomura].forEach((g, i) => {
        if (!g || !g.count || g.routed || g.k09In === 2) return;
        const c = g.center();
        // 外の柵の前まで歩く → 外の柵を越えたら斬りかかる → 砦の木戸が倒れたら砦の中へ踏み込む（柵越しの守兵は「かかれ」の組から見えず、柵の前で立ち尽くした）
        if (!g.k09In && c.x > FORT.x + 58) { g.order = 'move'; g.dest = { x: FORT.x + 44 + i * 2, z: (i - 1) * 2 }; }
        else if (F.gate && !F.gate.alive && c.x > FORT.x + 16) { g.k09In = 1; g.order = 'move'; g.dest = { x: FORT.x + 4 - i * 3, z: (i - 1) * 2 }; }
        else if (F.gate && !F.gate.alive) { g.k09In = 2; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: FORT.x - 6, z: 0 }; }
        else if (!g.k09In || g.order !== 'attack') { g.k09In = 1; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: FORT.x + 2, z: 0 }; }
      });
      // 豊臣方の退きは堤を西へ、仮橋を渡って片原町（城の方）へ（崩れた木村・後藤の隊が佐竹の陣の東へ逃げ抜けていた。二1・二2）
      for (const g of rt.army.groups) if (g.team === 1 && !g.fleePath && !/舟|櫓/.test(g.name || '')) g.fleePath = [[KARIBASHI, 0], [KARIBASHI - 70, 0]];
      // ③④：木村・後藤の隊は砦の西に留まらず、堤を寄せて佐竹の列と押し合う（砦の中で九十秒に三十五歩しか寄せず、
      //   ③の間ずっと四十歩を隔てて睨み合っていた。九2）。列の手前まで歩かせ、着いたら斬りかかる
      if (F.step === 3 || F.step === 4) for (const g of rt.army.groups) {
        if (g.team !== 1 || g.routed || !g.count || !/^(木村重成|後藤又兵衛)の(隊|二の手|殿)$/.test(g.name || '')) continue;
        const c = g.center(), front = (F.allyAt ?? KEEP.x) - 2;
        if (c.x < front - 7) { g.order = 'move'; g.keepMoveOrder = true; g.dest = { x: front, z: Math.max(-3, Math.min(3, c.z)) }; }
        else if (g.keepMoveOrder) { g.keepMoveOrder = false; g.order = 'attack'; g.seekRange = 30; g.anchor = { x: front, z: 0 }; }
      }
      F.allyAt = null;
      if ((F.step || 0) >= 2) for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 0 && !u.isPlayer && !u.isStruct &&
        !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.group?.routed && Math.abs(u.pos.z) < 4 &&
        (F.allyAt == null || u.pos.x < F.allyAt)) F.allyAt = u.pos.x;
      // 西へ抜けた一人の位置だけでは、遠く離れた木戸まで縄を引いた事にしない。
      // 木戸ごとに、実際に取り付ける足場にいる戦闘中の味方を数える。後送中・離脱済みの兵は縄を引けない。
      for (let i = -1; i < (F.outer?.length || 0); i++) {
        const st = i < 0 ? F.gate : F.outer[i];
        if (!st || !st.alive) continue;
        st.allyPull = false;
        if ((F.step || 0) < 2) continue;
        for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 0 && !u.isPlayer && !u.isStruct && !u.perch &&
          !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.group?.routed && Math.abs(u.pos.z) < 4 &&
          u.pos.x - st.seg[0] > -6 && u.pos.x - st.seg[0] < 5) { st.allyPull = true; break; }
      }
    }
    // 一番東に残る木戸だけを引く（一つずつ。二つ同時に倒れて同じ下知が重ならない）
    // 毎コマ配列を作らず、東の外柵から砦の木戸まで順に見る。
    const outerN = F.outer ? F.outer.length : 0;
    for (let i = outerN - 1; i >= ((F.step || 0) >= 2 ? -1 : 0); i--) {
      const st = i >= 0 ? F.outer[i] : F.gate;
      if (!st || !st.alive || !p) continue;
      // 袖の柵や次の木戸の前からは引けない。木戸の幅の内側で縄が届く所に取り付く。
      const near = rt.player.u.alive && !rt.player.u.dying && !rt.player.u.woundOut && !rt.player.u.downed &&
        p.z > Math.min(st.seg[1], st.seg[3]) && p.z < Math.max(st.seg[1], st.seg[3]) &&
        p.x - st.seg[0] > -6 && p.x - st.seg[0] < 6;
      const ally = st.allyPull;
      // 縄を掛けて引くのに三秒半（前は二秒で、四重の柵が十三秒で全部倒れた。史料は斬り込みを受けつつ一つずつ破った）。味方の組だけなら八秒ほど
      st.pullT = near ? (st.pullT || 0) + dt : ally ? (st.pullT || 0) + dt * 0.44 : 0;
      if (st.pullT > 3.5) {
        this.pull(rt, st);
        sfx('gateBreakWood', 0.8);
        rt.say('梅津憲忠', st === F.gate ? '砦の木戸が倒れた！　中へ斬り込め！' : '木戸が倒れた！　次の柵じゃ、続け！', 2.5);
      }
      break;
    }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに今福を保てなかった');
  },

  onKill(rt, v, by) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    // 屍に寄る烏（KIT.carrion）は置かない：遠目に黒い多面体の岩が空に浮いて見えた（八1）
    if (F.quietKill) return;
    if (v.type === 'busho' && v.team === 1 && /矢野正倫|飯田家貞/.test(v.name)) {
      rt.say('足軽', `${v.name}、討ち取ったり！`, 3);
      // 味方が討った守将を、本人の手柄にはしない。討死の知らせと両軍の減りは残す。
      if (by && by.isPlayer) rt.award((t) => { t.special = { label: `${v.name}を討った`, pts: 30 }; }, `${v.name}を討った`);
    } else if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　豊臣の者が担いで引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      if (by && by.isPlayer) rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（史実）：佐竹勢は千五百ほど、砦の守兵は六百ほど。重成・又兵衛の反撃で豊臣方は三千六百ほど（推定）、上杉の加勢で味方は三千ほどに
k09_imafuku.force = (rt) => {
  const F = rt.flags, st = F.step || 0;
  const a0 = 1500 + (F.uesugi ? 1500 : 0), b0 = st >= 3 ? 3600 : 600;
  return { a: Math.max(0, Math.round(a0 - (F.ak || 0) * 8)), a0, b: Math.max(0, b0 - (F.ek || 0) * 6), b0 };
};
k09_imafuku.sides = { a: { name: '佐竹勢', mon: 'satake' }, b: { name: '豊臣方', mon: 'toyotomi' } };
k09_imafuku.date = () => '慶長十九年（1614）十一月二十六日　夜明け前・薄霧';
k09_imafuku.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '堤へ寄せる' : '');
k09_imafuku.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k09_imafuku.history = '慶長十九年（1614）十一月二十六日、大坂城の北東、今福と鴫野で戦いがあった。今福では、堤の上の細い道が唯一の通り道で、両側は湿地と水だった。夜明け前、佐竹義宣の隊が堤の陰を寄せて豊臣方の砦の四重の柵を破って奪い、守将の矢野正倫・飯田家貞は討死した。木村重成の隊が反撃し、秀頼の命で後藤又兵衛の隊も堤と舟で加わると、佐竹勢は押し戻され、家老の渋江政光が撃たれて討死し先手は崩れた。佐竹義宣が助けを求めると、鴫野にいた上杉景勝の軍と堀尾忠晴・榊原康勝の隊が大和川の中州から撃ちかけ、又兵衛も上杉の弾に傷を負い、豊臣方は退いた。\n堤の位置と幅は推定で復元した。戦いの経過の細部には諸説がある。';
k09_imafuku.bushou = [{ name: '木村重成', g: /木村重成/ }, { name: '後藤又兵衛', g: /後藤又兵衛/ }];
// 素直な遊び手：柵の線の東で木戸（堤の真ん中）から外れていれば、まず木戸の前へ寄る（柵は川の深みまで延び、端を回れない）
const baseBot = makeBot({ x: START.x, z: START.z });
k09_imafuku.botBrain = (b, inp, tools) => {
  const u = b.player && b.player.u, p = u && u.pos;
  if (p && u.alive && (b.flags.step || 0) >= 2 && !b.flags.ending) {
    // 倒した木戸の跡で中央へ戻し続けると、守将を追えず刻限切れになる。
    // まだ立つ木戸だけを迂回の対象にする。毎コマ配列は作らない。
    const F = b.flags, n = F.outer ? F.outer.length : 0;
    for (let i = n - 1; i >= -1; i--) {
      const st = i >= 0 ? F.outer[i] : F.gate;
      if (!st || !st.alive) continue;
      const fx = st.seg[0];
      // ②で柵の奥の守兵を追うと、袖に当たり続けて木戸へ戻れない（全戦の通し）。
      // 東から残る木戸へ順に寄り、縄で倒すまで前に留まる。倒した木戸へは戻らない。
      if (F.step === 2 && p.x > fx - 0.5) {
        inp.quickCmd = null;
        inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
        inp.axis = null;
        tools.goTo(b.player, inp, fx + 4, 0, 1.2);
        return;
      }
      if (p.x > fx - 0.5 && p.x < fx + 10 && Math.abs(p.z) > 2.6) { inp.quickCmd = null; tools.goTo(b.player, inp, Math.abs(p.z) > 5 ? fx + 4 : fx - 3, 0, 1.2); return; }
    }
  }
  return baseBot(b, inp, tools);
};

setStages('k09_imafuku', [['堤を西へ進み、砦の前へ', 0], ['四重の柵を破り今福の砦を奪う', 2], ['奪った砦で木村重成の反撃を止める', 3], ['砦の西の堤で木村・後藤の殿を追い払う', 4]]);

export { k09_imafuku };
export default k09_imafuku;
