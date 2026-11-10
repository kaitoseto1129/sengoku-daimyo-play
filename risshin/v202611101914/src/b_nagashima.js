import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { timeslipField } from './timeslip_field.js';
// 長島一向一揆：包囲の柵 → 長島の降伏と退城 → 射撃後の反撃 → 中江・屋長島の包囲と火。
// 信長公記巻七・九月二十九日条を芯にする。舟と三川の寸法・局地の持ち場は遊び用の復元。
// 奥（-z）が南の輪中、手前（+z）が北の織田の岸（賀鳥・早尾・市江の三口は島の北）。+x が西（揖斐川の口）、-x が東（市江口）。小地図の北は mapNorth で下。
// 史実の二か月余を終日の持ち場に縮める。
import * as THREE from 'three';
import { tsuiji, nobori, hut, campfire, tawara, lumber, dou, romon, village, kobune, kabukimon, yaguramon, solidRect, solidSeg, ishigaki, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch, SOLIDS } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCastlePlan, inPoly } from './castle_plan.js';
import { goten, monomi } from './castle_parts.js';
import { addInterior, facePanels } from './naka.js';
import { benchRoads } from './yamalift.js';
import { whenCgt, cgtScene, cgtSpend, KitBatch, kitStoneSeg } from './cgt.js';
import { kitReplace, castleStyle, kitGateObj4 } from './cgt_castle.js';
import { interiorBase } from './yagura_inside.js';
import { woodTex } from './nature.js';
import { Garan } from './temple1571.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { poseArms, buildModel, GENERALS } from './units.js';
import { NAMED_GEAR } from './named_gear.js';
import { extScatter } from './props_ext.js';
import { NAGASHIMA_KACCHU } from './kacchu_data.js';
import { umaGeometry, lodSwap } from './units_flags.js';
import { makeWeapon, arrowGeometry, MAT, P, MK, merge as mergeUnitParts } from './units_model.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine, brokenWall } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
// 15分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md 16）：段の中身は nagashima/ に一段一ファイル
import { depthStart, depthTick, depthBot, rest as dpRest, hold as dpHold } from './b_depth.js';
import { install as ngMonomi } from './nagashima/monomi.js';   // 0〜3分：堤から見る輪中と砦
import { steps as fusaSteps, lastSteps } from './nagashima/fusa.js';      // 6〜11分：川の封鎖・砦から逃げ出す門徒
import { STAGES } from './stages.js';
import { advanceSteps, ADV_MISSIONS, ADV_CP, ADV_POINTS, fortWay } from './nagashima/advance.js';   // 11/10 作り直し：堤→砦→水路→在所→囲み→突破
import { depthPlan as nagashimaDepth } from './nagashima/fujin.js';   // 布陣図の陣立て（docs/fujin/nagashima.md）
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { attachFireSpread } from './siege_fire.js';
import { YANAGASHIMA, NAGASHIMA, TSUTSUMI, NAKASU, NAGASHIMA_ALL_PLAN, FORT_BUILDINGS, FORT_ROADS } from './castles/nagashima.js';
import { makeKakoi, advanceDay, campWear } from './kakoi.js';
import { battleEvent, EVENT_MESSENGER, EVENT_VOLLEY, EVENT_FIRE_START } from './battle_events.js';
import { sightUnit, sightPoint } from './battle_sight.js';
import { drawGroundAt } from './render_camera.js';
import { sendOrder } from './denrei.js';
import { reduceMotion, S as SETTINGS } from './settings.js';

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -14;                        // こちらの岸（柵を結う所）
const MONOMI_SPOT = { x: -12, z: BANK_Z + 12 }; // 最初の下知から物見の到着まで、同じ堤へ案内する。
const RETREAT_SPOT = { x: 24, z: BANK_Z + 16 }; // 槍組が来る退き場所。傷の案内もここへそろえる。
// 輪中の地の斑（10/30）：a＝湿った泥の低み（高い所に水たまり）、b＝葦の根の株。0〜1。周期の違う波を重ね、升目に揃えない。
const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const NG_SOIL = { a: 0, b: 0 };
function ngSoilNoise(x, z) {
  NG_SOIL.a = .5 + .32 * Math.sin(x * .19 + Math.sin(z * .13) * 2.1) * Math.cos(z * .17 - x * .05) + .18 * Math.sin(x * .47 - z * .39 + 2.3);
  NG_SOIL.b = .5 + .34 * Math.sin(x * .29 - z * .11 + 1.3) * Math.cos(z * .26 + Math.sin(x * .09) * 1.6) + .16 * Math.cos(x * .61 + z * .53);
  return NG_SOIL;
}
const FORT = { x: 0, z: -74 };             // 長島城（11/7：手前の砦。降って舟で退く。中江は西の x=152、屋長島は x=48）
const GANSHO = { x: -44, z: -82 };         // 願証寺・寺内町（中江の砦とは別の、宗教の中心。軍事拠点と分ける）
// 三川の輪中と願証寺の門徒の暮らしを踏まえる。個々の在所・人数・道筋は推定復元。
// 三重県の県史あれこれ：https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail8.html
// 西の村と寺は分流の別岸。渡河・封鎖突破で助かった描写にせず、同じ岸の村裏・堂裏へ退く。
const PEOPLE_PATHS = [
  [[-94, -59], [-112, -59], [-112, -97], [-106, -112]],
  [[-47, -107], [-48, -116], [-47, -119]],
  [[-50, -66], [-53, -70], [-53, -89], [-49, -104], [-48, -116]],
  [[-48, -99], [-49, -107], [-48, -116]],
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: i === 2 ? 'inside' : 'watch',
  kinds: i === 0 ? ['farmer', 'farmer', 'woman', 'child', 'elder']
    : i === 1 ? ['monk', 'monk', 'townsman', 'woman', 'child']
      : ['townsman', 'merchant', 'woman', 'child', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })), routeEnd: 'wait',
}));
// 門前の市は中江の曲輪・包囲柵より西。門と本堂へ通じる中央を空ける。
const MARKET_HUTS = [[-51, -60, .05], [-39, -60, -.1], [-40, -65, .1]];
const SPOTS = [{ x: 0, z: BANK_Z - 1 }, { x: -26, z: BANK_Z }, { x: 26, z: BANK_Z }];   // 中央から順に、味方と横木を結う
// 手を添える場所は横木の二歩手前。印・到着の案内を、長押しできる場所にそろえる。
const WORK_SPOTS = SPOTS.map(s => ({ x: s.x, z: s.z + 2 }));
const BUILD_HOLD = 8;                      // 人足と並行して補修する
const WATCH_HOLD = 8;                      // 近い岸で水路を見張る
const HELP_HOLD = 4;                       // 人足と手分けし、本人は横木の縄を締める
const SALLY_HOLD = 45;                     // 三つの守備とは別の斬り込み。全舟を受け、残敵と岸の静まりも確かめる。
const SHORE_DELAY = 25;
const END_SEC = 32;                        // 11/6 fixc1721：火を見届ける間。十八秒では対岸の火が燃え広がる前に勝ちの札になった                    // 最初の十人に続き、同じ舟の残る門徒も上陸する
const SHORE_WATCH_HOLD = 8;                // 全ての舟を受けた後、静まった岸を見張る
const BOAT_LAND_Z = BANK_Z - 6;            // 舳先を浅い岸へ寄せる。川の中で足場を外さない。
const LANDING_DZ = 4.25;                   // 舳先から一歩で、水面の南端を越えた岸へ降りる
const PUSH_HOLD = 20;                      // 四人以上が背後へ押し込み続けた時間
const FINAL_HOLD = 8;                      // 縄を確かめ、敵が散った後の見張り。静かな岸で長く待たせない
const AFTERMATH_ORDER = '岸の柵を三か所巡り、中江・屋長島の火の間も囲みを保て';
// 西の持ち場から中央、東へ巡る。戦った岸の内側だけを使う。
const AFTERMATH_SPOTS = [WORK_SPOTS[2], WORK_SPOTS[0], WORK_SPOTS[1]];
const CHECK_HOLD = 4;                      // 縄と横木の確認。戦いの合間に一か所ずつ確かめる
const CHECK_SPOTS = [20, 26, 32].map(x => ({ x, z: BANK_Z + 2 }));
// 11/5 専門家の目：本陣の脇に立つのは、公記巻七で早尾口の先陣・篠橋攻めと、同じ賀鳥口の将だけ。
// 一江口・押付郷・加路戸島口・船の衆は自分の持ち場にいる（本陣に四十余人が並んでいた）。
const AT_HQ = new Set(['inaba_ukyonosuke', 'inaba_kiroku', 'hachiya', 'ujiie', 'ando', 'fuwa', 'sassa', 'maeda', 'hidenaga', 'asai_shinpachi',
  'kawajiri', 'mizuno_nobumoto', 'iinuma_kanpei', 'marumo_hyogo', 'marumo_saburobei', 'chujo_shogen', 'iio_okinokami', 'yokoi_utanosuke']);
// 11/6 専門家の目：公記の「津田大隅守」は織田信広その人。信広の姿と二人にしない（tsuda_osumi は本陣に出さない）。
const CHECK_NAMES =['西の柵の縄（一つ目）', '西の柵の縄（二つ目）', '西の柵の縄（三つ目）'];
// 本の足軽：黒漆の陣笠と胴（AV1：笠の赤茶をやめ黒に揃える）、紺の小袖。既存の具足の色だけを替える。
// 11/7（critic60「門徒が肥えて元気に見える」）：三か月の兵糧攻めで飢えた顔（頬のこけ・細い顎）と、色の褪せたぼろの小袖（鳥取の飢えた城兵と同じ作り）。
const HUNGRY_FACE = { w: 0.9, jaw: 0.65, chin: 1.05, cheek: 1.4, gaunt: 1.0, brow: 1.2, nose: 1.1, nw: 0.95, eye: 1.15 };
const ODA = { flag: 'oda', armor: 0x28231f, hatColor: 0x1c1916, lace: 0x645545, cloth: 0x293b45, haori: 0 };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', hatColor: 0x2a2622, flag: 'namu', haori: 0 };

// 陣所と船の馬印で、結合済みの形と頂点色の材質を共有する。
let campMarkMaterial;
function campMark(name) {
  const mark = new THREE.Mesh(umaGeometry(NAMED_GEAR[name].campUma),
    campMarkMaterial || (campMarkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })));
  return mark;
}

// 立ち寄り将の幟は形と材質ごと、二十四歩四方ごとに束ねる。
// 行列は設置時だけ写す。持ち場へ戻る時は束全体を隠す。
function visitorBanners(rt, banners) {
  const root = new THREE.Group(), bags = new Map(), materials = new Map();
  root.userData.noFreeze = true;
  for (const banner of banners) {
    banner.updateMatrixWorld(true);
    const tile = Math.floor(banner.position.x / 24) + ':' + Math.floor(banner.position.z / 24);
    banner.traverse(c => {
      if (!c.isMesh) return;
      const key = tile + ':' + c.geometry.uuid + ':' + c.material.uuid;
      let bag = bags.get(key);
      if (!bag) { bag = { geometry: c.geometry, material: c.material, matrices: [] }; bags.set(key, bag); }
      bag.matrices.push(c.matrixWorld.clone());
    });
    banner.removeFromParent();
  }
  for (const bag of bags.values()) {
    let material = materials.get(bag.material);
    if (!material) {
      material = bag.material.clone();
      const compile = bag.material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        // はためきの位相と手前の透かしは、一枚ずつの幟の位置を読む。
        shader.vertexShader = shader.vertexShader.replaceAll('modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)',
          '(modelMatrix * instanceMatrix) * vec4(0.0, 0.0, 0.0, 1.0)');
      };
      const programKey = bag.material.customProgramCacheKey();
      material.customProgramCacheKey = () => programKey + '_nagashima_instances';
      materials.set(bag.material, material);
    }
    const mesh = new THREE.InstancedMesh(bag.geometry, material, bag.matrices.length);
    for (let i = 0; i < bag.matrices.length; i++) mesh.setMatrixAt(i, bag.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  rt.scene.add(root);
  return root;
}

// 致命傷を負った兵を、次の舟や岸の見張りを待つ理由に数えない。
// 一時的に倒れた兵は起き上がるため、反撃できる人数に残す。
function bankFighterReady(u) {
  return !!u?.alive && u.hp > 0 && !u.gone && !u.dying &&
    !u.fleeing && !u.woundOut && !u.rearWound && !u.group?.routed;
}
// 本人が転倒中や致命傷の間は、縄の作業・守備の時間を進めない。
function bankPlayerReady(rt) {
  return bankFighterReady(rt.player.u) && !rt.player.u.downed;
}
// 三つの守備は九十・九十・七十五秒。寄せの間隔も各段で決めたままにする。
function bankHold(o) {
  // 共通の四分・七分の打ち切りでも、未完の守備を済んだことにしない。
  return { ...dpHold(o), noHardCap: true };
}
// 柵や地形に残兵が掛かっても無限の守備にしない。
// 本人が必要な時間守り、最後の寄せも出尽くした後だけ、残る隊に退却を起こす。
function bankDepthWithdraw(C, el, max) {
  if (C.waves.length || C.inT < max - 35 || el < max + 55) return;
  for (const g of C.groups) if (!g.routed) {
    // 頭が生きている隊は士気を下げるだけでは崩れない。退く下知も渡す。
    g.order = 'retreat'; g.focus = null; g.noRout = false; g.morale = 0;
    // 下知だけでは隊の要が持ち場に残る。寄せて来た方の岸へ退却先を決める。
    if (!g.bankWithdrawn) {
      g.bankWithdrawn = true;
      const f = g.fleeDir || { x: 1, z: 0 };
      g.dest = { x: C.at.x + f.x * 48, z: Math.max(BANK_Z + 2, C.at.z + f.z * 48) };
      g.path = null; g.onArrive = null;
    }
  }
}
// 退く下知で持ち場を離れた隊を、頭が生きているために全滅まで追わせない。
// 退却中でも岸の守備範囲に残る者は、押し返す相手に数える。
function bankDepthRemaining(C) {
  return C.groups.some(g => !g.routed && g.units.some(u => bankFighterReady(u) &&
    (!g.bankWithdrawn || g.order !== 'retreat' ||
      Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < C.botRadius + 8)));
}
// 西・東の防衛はその口の手、最後の防衛は中央の手と受ける。
// 段ごとに一度選び、退避先を探す時も同じ味方を使う。
function bankDepthFriends(rt) {
  const F = rt.flags, C = F.dp?.cur;
  if (!C?.at) return F.bankNoFriends ||= [];
  return C.bankFriends ||= (F.dpLast ? F.oda : F.mouths || []).filter(g =>
    g && !g.routed && (F.dpLast || Math.sign(g.mouthX) === Math.sign(C.at.x)));
}
// 上陸した同じ門徒だけを追う。舟・対岸の守兵へ持ち場を離れさせない。
function bankFoeReady(u) {
  return bankFighterReady(u) && !u.downed && !u.noTarget && !u.boatSeat?.aboard && u.pos.z >= BANK_Z - 3;
}
// 船首から降りた直後はまだ川側。攻撃の印は岸へ上がり、柵を隔てない相手に限る。
// 上陸・反撃そのものの判定は変えず、持ち場から川へ誘い出す案内だけを除く。
function bankGuideFoe(rt, u) {
  const p = rt.player.u.pos;
  return bankFoeReady(u) && u.pos.z >= BANK_Z && Math.abs(u.pos.y - p.y) < 2 &&
    !rt.army.wallBetween(p, -1, u.pos);
}
function bankNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.step !== 3 && F.step !== 3.5 || F.ending) return null;
  // 背後を止める下知の間は、正面の近い敵へ印を戻さない。
  if (F.step === 3 && F.sallyTask === 'breach' && bankGuideFoe(rt, F.rearThreat)) return F.rearThreat;
  // 東の持ち場の外縁でも、本人へ迫る敵を止める下知と印をそろえる。
  if (F.step === 3.5 && F.finalTask === 'fight' && bankGuideFoe(rt, F.finalThreat)) return F.finalThreat;
  if (F.bankFoeStep === F.step && rt.t < F.bankFoeAt && bankGuideFoe(rt, F.bankFoe)) return F.bankFoe;
  F.bankFoeStep = F.step;
  F.bankFoeAt = rt.t + .25;
  let foe = null, best = Infinity;
  for (const g of F.last || []) for (const u of g.units) {
    if (!bankGuideFoe(rt, u)) continue;
    if (F.step === 3.5 && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) >= 14) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < best) { best = d; foe = u; }
  }
  F.bankFoe = foe;
  return foe;
}
function bankCheckThreat(rt) {
  const p = rt.player.u;
  for (const g of rt.flags.last || []) for (const u of g.units) {
    if (!bankFoeReady(u)) continue;
    const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
    if ((d < 2.8 || d < 6 && (u.target === p || u.atk?.target === p ||
        u.swing && !u.swing.done && u.swing.target === p)) && !rt.army.wallBetween(p.pos, -1, u.pos)) return true;
  }
  return false;
}
function bankWorkSpot(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.workSpot != null && !F.raised?.[F.workSpot]) return WORK_SPOTS[F.workSpot];
  let spot = null, best = Infinity;
  for (let i = 0; i < WORK_SPOTS.length; i++) {
    if (F.raised?.[i]) continue;
    const q = WORK_SPOTS[i], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) { best = d; spot = q; }
  }
  return spot;
}

// 見張りは体ではなく視線で判定する。肩越しを回した時も、下知と達成をそろえる。
// 11/6 fixc1439：岸の持ち場に立てば見張りに数える。「向き直れ」は操作の説明で、向きで務めを止めない（五1・十一1）。
function watchingRiver(rt) {
  return true;
}

function riverTurnText(rt) {
  // 向きの字（左へ・右へ）は出さない（kaito 10/23）。向き直す先は川の上の印で示す。
  return '岸で川の舟を見張れ';
}

function nearestBankSpot(p) {
  let at = 0;
  for (let i = 1; i < SPOTS.length; i++) if (Math.abs(p.x - SPOTS[i].x) < Math.abs(p.x - SPOTS[at].x)) at = i;
  return at;
}

// 岸の端で一歩揺れても帰陣の下知を繰り返さない。川へ出た時はすぐ戻す。
function onBank(p, wasNear) {
  return Math.abs(p.x) < (wasNear ? 50 : 48) && p.z >= BANK_Z && p.z < BANK_Z + (wasNear ? 30 : 28);
}

// 生きていても深手で戦えない者は、次の舟を待たせる理由にしない。
// 舟に控える戦える兵は数え、上陸前に反撃を終えない。
function canCounterattack(g) {
  if (!g || g.routed) return false;
  for (const u of g.units) {
    if (bankFighterReady(u) && !u.boatSeat?.escape) return true;
  }
  return false;
}

function baseHeight(x, z) {
  return .25 * Math.sin(x * .03 + .4) * Math.cos(z * .025) + .15 * Math.sin(z * .07 + x * .02)
    + .75 * Math.exp(-((z - (BANK_Z + 5)) ** 2) / 30) + 30 * gauss(x, z, -360, -360, 5000)
    // 対岸の輪中の堤（10/29）：水際の葦の奥に、膝より高い土の堤を東西に通す。分流の口（x=±60 の先）で切る。
    + .85 * Math.exp(-((z - (CH_Z - 18)) ** 2) / 10) * Math.max(0, Math.min(1, (58 - Math.abs(x)) / 8));
}
// 円い盛り土ではなく、柵と同じ多角形の縁を土塁にする。虎口では堤を低くして歩ける坂にする。
function rimDistance(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
// 11/10 長島の作り直し（docs/nagashima_spec_1109.md）：岸から堤の砦へ渡る細い堤。左右は水、一列でしか進めない。
// 川筋の掘り下げを見込んで盛り、水面より膝ほど高い天端を残す。寸法は遊びの復元。
const DIKE = { x: -46, z0: -6, z1: -48, half: 1.4, slope: 2.2, top: .3 };
const DIKE_FLANKS = [{ pts: [[-50.8, -4], [-51, -47]], w: 2, depth: .9 }, { pts: [[-41.2, -4], [-41, -47]], w: 2, depth: .9 }];
const CH_STREAM = { pts: [[-240, -28], [-100, -32], [0, -32], [100, -34], [240, -26]], w: 16, depth: 1.1 };
const WEST_STREAM = { pts: [[-58, -32], [-66, -74], [-60, -132]], w: 9, depth: 1.8 };
function dikeCarve(x, z) {
  let c = 0;
  for (const st of [CH_STREAM, WEST_STREAM, ...DIKE_FLANKS]) {
    const d = Math.sqrt(segDist2(x, z, st.pts));
    if (d < st.w * 2) c += st.depth * Math.pow(1 - d / (st.w * 2), 1.5);
  }
  return c;
}
function dikeProfile(x, z) {
  const dx = Math.abs(x - DIKE.x);
  if (dx >= DIKE.half + DIKE.slope || z > DIKE.z0 + 3 || z < DIKE.z1 - 3) return 0;
  const across = dx <= DIKE.half ? 1 : 1 - (dx - DIKE.half) / DIKE.slope;
  const along = Math.min(1, (DIKE.z0 + 3 - z) / 3, (z - DIKE.z1 + 3) / 3);
  return Math.max(0, across * along);
}
function fortHeight(x, z) {
  let h = baseHeight(x, z);
  { const k = dikeProfile(x, z); if (k > 0) h += Math.max(0, DIKE.top + dikeCarve(x, z) - h) * k; }
  for (const k of NAGASHIMA_ALL_PLAN.kuruwa) {
    const inside = inPoly(k.poly, x, z), d = rimDistance(k.poly, x, z);
    if (!inside && d >= 3) continue;
    // 中洲は南北に木戸がある。二つの座標を一つの数として引くと、地形の高さが壊れる。
    let mouthDistance = Infinity;
    if (Array.isArray(k.gapAt[0])) {
      for (const [gx, gz] of k.gapAt) mouthDistance = Math.min(mouthDistance, Math.hypot(x - gx, z - gz));
    } else mouthDistance = Math.hypot(x - k.gapAt[0], z - k.gapAt[1]);
    const mouth = Math.max(0, Math.min(1, (mouthDistance - 3) / 3));
    const bank = k.dorui * mouth * Math.max(0, 1 - d / (inside ? 2.6 : 3));
    h = inside ? k.level + bank : h + (k.level + bank - h) * (1 - d / 3);
  }
  return h;
}
const height = benchRoads(fortHeight, FORT_ROADS, 1.2, .8);

// 持ち場の正面の水際を背丈ほどの葦の帯で縁取り、柵と水際の間の堤に低い草の株を散らす（資料との差 10/28：岸が茶の一枚）。
// 葉は細い三角を株ごとに束ねた一つの形を、葦と草で使い回す。描くのは二回だけ。着岸口（中央）は空ける。
function shoreReedBelt(rt) {
  const W = rt.world, pos = [], col = [];
  // 葉は根元から反って垂れる二節の細い葉（10/29：同じ扇の板が並んで見えた）。根は暗く、先は枯れ色へ。
  const blade = (ang, lean, h, w, tone, dry) => {
    const c = Math.cos(ang), s = Math.sin(ang), bx = c * .04, bz = s * .04, px = -s * w, pz = c * w;
    const mx = bx + c * lean * h * .35, mz = bz + s * lean * h * .35, my = h * .58;
    const tx = bx + c * lean * h * 1.1, tz = bz + s * lean * h * 1.1, ty = h * (1 - lean * .35);
    const lo = [tone * .52, tone * .55, tone * .42], mid = [tone * .86, tone * .86, tone * .64], hi = [tone * (1 + dry * .25), tone * (.98 + dry * .12), tone * (.72 + dry * .05)];
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, mx + px * .6, my, mz + pz * .6,
      bx - px, 0, bz - pz, mx + px * .6, my, mz + pz * .6, mx - px * .6, my, mz - pz * .6,
      mx - px * .6, my, mz - pz * .6, mx + px * .6, my, mz + pz * .6, tx, ty, tz);
    for (const q of [lo, lo, mid, lo, mid, mid, mid, mid, hi]) col.push(...q);
  };
  for (let i = 0; i < 7; i++) blade(i * 2.39 + Math.sin(i) * .4, .06 + .22 * (.5 + .5 * Math.sin(i * 1.7)), .62 + .38 * (.5 + .5 * Math.sin(i * 3.3)), .022 + .01 * Math.cos(i * 2.1), .85 + .15 * Math.cos(i), i % 3 === 0 ? 1 : 0);
  blade(.5, .04, 1.1, .016, 1.1, 1);   // 穂の茎（三角は前の扇の倍に増やさない）
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // 細い葉は表裏とも空から照らす（逆光で黒い切り絵にならないよう、法線を上へそろえる）。
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, k) => k % 3 === 1 ? 1 : 0), 3));
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  const edgeZ = (x) => { for (let z = BANK_Z - 1; z > CH_Z; z -= .5) if (W.waterDepthAt(x, z) > .05) return z; return null; };
  const rnd = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const tones = [0x7c7452, 0x66694a, 0x8a7d5c, 0x5d6446, 0x938563, 0x707050].map(h => new THREE.Color(h));
  const at = new THREE.Object3D(), color = new THREE.Color();
  const reeds = new THREE.InstancedMesh(geo, mat, 190), grass = new THREE.InstancedMesh(geo, mat, 200);
  let n = 0, g = 0, k = 0;
  // 株の間を不揃いに空け、時々ぽっかり切れ目を残す。列は一から三。背丈・傾き・張りを株ごとに変える。
  for (let x = -46; x <= 46 && n < 190; x += .22 + rnd(++k) * .5) {
    if (Math.abs(x) < 4.5 || rnd(k * 3.1) < .09) continue;
    const ez = edgeZ(x); if (ez === null) continue;
    const rows = 1 + Math.floor(rnd(k * 5.3) * 2.6);
    for (let row = 0; row < rows && n < 190; row++) {
      const jx = x + (rnd(k * 7.7 + row) - .5) * .5, jz = ez + .8 - row * (.7 + rnd(k + row * 9) * .7) + (rnd(k * 2.9 + row) - .5) * .8;
      at.position.set(jx, Math.max(drawGroundAt(W, jx, jz), waterHeight(W, jx, jz) - .3) - .05, jz);
      at.rotation.set((rnd(k * 4.1 + row) - .5) * .22, rnd(k * 6.3 + row) * 6.28, (rnd(k * 8.9 + row) - .5) * .22);
      const h = 1.05 + 1.35 * Math.pow(rnd(k * 1.9 + row * 4.1), .8), wd = .8 + rnd(k * 3.7 + row) * .9;
      at.scale.set(wd, h, wd * (.8 + rnd(k * 2.2) * .4)); at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
      color.copy(tones[Math.floor(rnd(k * 1.3 + row * 2.7) * tones.length)]).multiplyScalar(.85 + rnd(k * 4.4 + row) * .3); reeds.setColorAt(n++, color);
    }
  }
  for (let i = 0; g < 200 && i < 900; i++) {
    const x = (((i * 37.17) % 92) + 92) % 92 - 46, ez = edgeZ(x); if (ez === null) continue;
    const z = ez + 1.5 + (((i * 13.71) % 1) + Math.sin(i * 2.3) * .5 + .5) * (BANK_Z + 9 - ez - 1.5) * .5;
    if (Math.abs(x) < 5.5 || z > BANK_Z + 9 || (Math.abs(x) < 9 && z > BANK_Z - 1)) continue;
    at.position.set(x, drawGroundAt(W, x, z) - .03, z);
    at.rotation.set((rnd(i * 1.7) - .5) * .3, i * 2.4, (rnd(i * 2.9) - .5) * .3);
    const h = .26 + .3 * rnd(i * 1.3), wd = .7 + rnd(i * 5.1) * .7;
    at.scale.set(wd, h, wd); at.updateMatrix(); grass.setMatrixAt(g, at.matrix);
    color.copy(tones[i % tones.length]).multiplyScalar(.8 + rnd(i * 3.3) * .3); grass.setColorAt(g++, color);
  }
  reeds.count = n; grass.count = g;
  for (const m of [reeds, grass]) { m.receiveShadow = true; m.frustumCulled = false; rt.scene.add(m); }
  return { geo, mat };
}

// 輪中の内の入り江（遊ぶ人のカメラは陸を向くことが多い。持ち場の先二十〜三十歩に、水路・葦原・繋いだ舟・対岸の柵を置く）。
// 水面は TOWN_STREAMS の INLET。葦は岸の帯と同じ形と材質、柵は丸太一つの形の束（描くのは三回）。持ち場・通り道（x=0・x=24）は空ける。
const UP_Y = new THREE.Vector3(0, 1, 0);
const INLET = { pts: [[-3.5, 1.5], [-6, 4.5], [-9.5, 6.5], [-13.5, 7]], w: 3.2, depth: .6 };   // 西の脇の水路（x=-13）へ通じる溜まり。奥（北）が対岸。10/29 夜：岸から陸を振り向いた目の右手、十五〜二十五歩に寄せる
function inletDressing(rt, reed) {
  const W = rt.world, at = new THREE.Object3D(), color = new THREE.Color(), P = INLET.pts, MOORED = [[.05, -.5, 1.05], [.15, -.25, .98], [.25, 0, 1.04], [.35, .25, .96], [.72, .8, -.18]];
  const rnd = (k) => { const v = Math.sin(k * 91.7 + 47.3) * 43758.5453; return v - Math.floor(v); };
  // 線に沿う点と、その左（奥＝対岸）への向き
  const along = (t) => {
    const f = Math.max(0, Math.min(.9999, t)) * (P.length - 1), i = Math.floor(f), u = f - i, a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    return { x: a[0] + dx * u, z: a[1] + dz * u, nx: dz / L, nz: -dx / L, rot: Math.atan2(dx, dz) };   // n は奥（北）の岸へ
  };
  // 葦原：両岸の水際から陸へ。手前の岸は低く疎らに、対岸と入り江の奥は背丈ほどに茂らせる。
  const reeds = new THREE.InstancedMesh(reed.geo, reed.mat, 150);
  const tones = [0x7c7452, 0x66694a, 0x8a7d5c, 0x5d6446, 0x938563].map(h => new THREE.Color(h));
  let n = 0;
  for (let i = 0; i < 400 && n < 150; i++) {
    const q = along(rnd(i) * 1.08 - .02), side = rnd(i * 3.3) < .62 ? 1 : -1;
    if (side < 0 && rnd(i * 5.9) < .75) continue;   // 手前の岸は疎らにして水面を見せる
    const off = side * (INLET.w * (.85 + rnd(i * 2.1) * .5));
    const x = q.x + q.nx * off + (rnd(i * 7.1) - .5) * .6, z = q.z + q.nz * off + (rnd(i * 8.3) - .5) * .6;
    if (x > -2 || z < -1.5 || MOORED.some(([bt]) => { const b = along(bt); return Math.hypot(x - b.x, z - b.z) < 3.6; })) continue;   // 中央の道（x=0）・持ち場の側・舟の脇は空ける
    at.position.set(x, Math.max(drawGroundAt(W, x, z), waterHeight(W, x, z) - .25) - .05, z);
    at.rotation.set((rnd(i * 4.1) - .5) * .2, rnd(i * 6.3) * 6.28, (rnd(i * 9.7) - .5) * .2);
    const h = (side > 0 ? 1.3 : .8) + 1.1 * Math.pow(rnd(i * 1.9), .8), wd = .8 + rnd(i * 3.7) * .9;
    at.scale.set(wd, h, wd); at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
    color.copy(tones[Math.floor(rnd(i * 1.3) * tones.length)]).multiplyScalar(.82 + rnd(i * 4.4) * .3); reeds.setColorAt(n++, color);
  }
  reeds.count = n; reeds.receiveShadow = true; reeds.frustumCulled = false; rt.scene.add(reeds);
  // 繋いだ舟：入り江の口に四艘を横に連ねて舳先を岸へ寄せ（10/30：持ち場から陸を向いた目の右手に舟の列）、一艘は葦の際に。共通の小舟の束で描く。
  for (const [t, off, turn] of MOORED) {
    const q = along(t), x = q.x + q.nx * off, z = q.z + q.nz * off;
    rt.scene.add(riverBoat(x, waterHeight(W, x, z), z, q.rot + turn));
  }
  // 対岸の柵：入り江の奥の岸に、皮付きの丸太を詰めて打ち、二段の横木を縄で結う（地に三十糎埋める）。
  const post = new THREE.CylinderGeometry(.75, 1.15, 1, 8); post.translate(0, .5, 0);
  const posts = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95 }), 70);
  let m = 0;
  for (let t = .04; t <= .96 && m < 60; t += .0155) {
    const q = along(t), off = INLET.w + 2.2 + Math.sin(t * 17) * .15, x = q.x + q.nx * off, z = q.z + q.nz * off;
    const y = W.heightAt(x, z), h = 1.9 + .35 * rnd(t * 113), r = .07 + .025 * rnd(t * 71);
    at.position.set(x, y - .3, z); at.rotation.set((rnd(t * 37) - .5) * .08, rnd(t * 53) * 6, (rnd(t * 29) - .5) * .08);
    at.scale.set(r, h + .3, r); at.updateMatrix(); posts.setMatrixAt(m, at.matrix);
    color.setHex(rnd(t * 17) < .35 ? 0x463c31 : 0x5b4f40).multiplyScalar(.75 + rnd(t * 9) * .4); posts.setColorAt(m++, color);   // 雨に晒した黒ずむ丸太
  }
  for (const [ta, tb] of [[.04, .3], [.3, .62], [.62, .96]]) for (const hy of [.55, 1.35]) {
    const a = along(ta), b = along(tb), off = INLET.w + 2.05;
    const ax = a.x + a.nx * off, az = a.z + a.nz * off, bx = b.x + b.nx * off, bz = b.z + b.nz * off;
    const L = Math.hypot(bx - ax, bz - az), y = (W.heightAt(ax, az) + W.heightAt(bx, bz)) / 2 + hy;
    at.position.set(ax, y, az); at.rotation.set(0, 0, 0);
    at.quaternion.setFromUnitVectors(UP_Y, new THREE.Vector3(bx - ax, 0, bz - az).normalize());
    at.scale.set(.045, L, .045); at.updateMatrix();
    if (hy < 1) Object.assign(solidSeg(ax, az, bx, bz, .15), { missileH: 2, missileType: 'wood' });   // 見た目だけの柵を通り抜けない
    posts.setMatrixAt(m, at.matrix); color.setHex(0x4d4236); posts.setColorAt(m++, color);
  }
  posts.count = m; posts.castShadow = posts.receiveShadow = true; rt.scene.add(posts);
}

// 輪中の引き込み水路（10/29 夜）：持ち場から陸を振り向いた目（南東）の四十歩先を横切る。
// 中央の道（x=0）と岸の助けの槍組の通り道（x=24）を空け、東の脇の水路（x=14）とつなぐ。浅いので歩いて渡れる。
const CANAL = { pts: [[5.5, 24], [9.5, 21.6], [13.5, 18.6], [18.5, 15.2]], w: 3, depth: .6 };
// 舟溜まり：小舟六艘を斜めに並べて繋ぐ。葦は入り江と同じ形と材質（描くのは一回足すだけ）。
function canalDressing(rt, reed) {
  const W = rt.world, at = new THREE.Object3D(), color = new THREE.Color(), P = CANAL.pts;
  const rnd = (k) => { const v = Math.sin(k * 63.1 + 21.7) * 43758.5453; return v - Math.floor(v); };
  const along = (t) => {
    const f = Math.max(0, Math.min(.9999, t)) * (P.length - 1), i = Math.floor(f), u = f - i, a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    return { x: a[0] + dx * u, z: a[1] + dz * u, nx: dz / L, nz: -dx / L, rot: Math.atan2(dx, dz) };
  };
  for (let k = 0; k < 6; k++) {
    const t = .1 + k * .14, q = along(t), off = .35 * (k % 2 ? 1 : -1), x = q.x + q.nx * off, z = q.z + q.nz * off;
    rt.scene.add(riverBoat(x, waterHeight(W, x, z), z, q.rot + .95 + (rnd(k) - .5) * .18));
  }
  const reeds = new THREE.InstancedMesh(reed.geo, reed.mat, 120);
  const tones = [0x7c7452, 0x66694a, 0x8a7d5c, 0x5d6446, 0x938563].map(h => new THREE.Color(h));
  let n = 0;
  for (let i = 0; i < 300 && n < 120; i++) {
    const q = along(rnd(i) * 1.1 - .05), side = rnd(i * 3.3) < .55 ? 1 : -1;
    const off = side * (CANAL.w * (.9 + rnd(i * 2.1) * .55));
    const x = q.x + q.nx * off + (rnd(i * 7.1) - .5) * .7, z = q.z + q.nz * off + (rnd(i * 8.3) - .5) * .7;
    if (x < 2.5 || x > 21) continue;   // 中央の道と東の通り道は空ける
    at.position.set(x, Math.max(drawGroundAt(W, x, z), waterHeight(W, x, z) - .25) - .05, z);
    at.rotation.set((rnd(i * 4.1) - .5) * .2, rnd(i * 6.3) * 6.28, (rnd(i * 9.7) - .5) * .2);
    const h = 1 + 1.2 * Math.pow(rnd(i * 1.9), .8), wd = .8 + rnd(i * 3.7) * .9;
    at.scale.set(wd, h, wd); at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
    color.copy(tones[Math.floor(rnd(i * 1.3) * tones.length)]).multiplyScalar(.82 + rnd(i * 4.4) * .3); reeds.setColorAt(n++, color);
  }
  reeds.count = n; reeds.receiveShadow = true; reeds.frustumCulled = false; rt.scene.add(reeds);
}
// 輪中の堀（10/29 深夜）：持ち場から陸の陣を向いた目にも、陣の手前に水路・葦・繋いだ舟が入るように。
// 西は中央の道（x=0）の手前で切り、東は岸の助けの通り道（x=24）を空けて引き込み水路の先へ続ける。浅いので歩いて渡れる。
const MOAT_W = { pts: [[-50, 27], [-36, 24.5], [-22, 23.5], [-10, 21.5]], w: 3.2, depth: .6 };
const MOAT_E = { pts: [[29, 15.5], [39, 19.5], [54, 24.5]], w: 3, depth: .6 };
function moatDressing(rt, reed) {
  const W = rt.world, at = new THREE.Object3D(), color = new THREE.Color();
  const rnd = (k) => { const v = Math.sin(k * 71.9 + 13.3) * 43758.5453; return v - Math.floor(v); };
  const tones = [0x7c7452, 0x66694a, 0x8a7d5c, 0x5d6446, 0x938563, 0x707050].map(h => new THREE.Color(h));
  const alongOf = (P) => (t) => {
    const f = Math.max(0, Math.min(.9999, t)) * (P.length - 1), i = Math.floor(f), u = f - i, a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    return { x: a[0] + dx * u, z: a[1] + dz * u, nx: dz / L, nz: -dx / L, rot: Math.atan2(dx, dz) };
  };
  // 繋いだ舟：西の堀に三艘、東に二艘。舟の脇の葦は空ける。
  const boats = [[MOAT_W, .18, .4, .9], [MOAT_W, .5, -.4, 1.05], [MOAT_W, .78, .3, .85], [MOAT_E, .3, .35, 1], [MOAT_E, .7, -.3, .9]];
  const spots = boats.map(([st, t, off, turn]) => { const q = alongOf(st.pts)(t), x = q.x + q.nx * off, z = q.z + q.nz * off;
    rt.scene.add(riverBoat(x, waterHeight(W, x, z), z, q.rot + turn)); return [x, z]; });
  const reeds = new THREE.InstancedMesh(reed.geo, reed.mat, 300);
  let n = 0, k = 0;
  for (const st of [MOAT_W, MOAT_E]) {
    const along = alongOf(st.pts);
    for (let i = 0; i < 260 && n < (st === MOAT_W ? 180 : 300); i++, k++) {
      const q = along(rnd(k) * 1.06 - .03), side = rnd(k * 3.3) < .5 ? 1 : -1;
      const off = side * (st.w * (.85 + rnd(k * 2.1) * .6));
      const x = q.x + q.nx * off + (rnd(k * 7.1) - .5) * .7, z = q.z + q.nz * off + (rnd(k * 8.3) - .5) * .7;
      if (rnd(k * 5.9) < .18 || (x > -7 && x < 27) || spots.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 3)) continue;   // 道と通り道・舟の脇を空け、所々で水面を見せる
      at.position.set(x, Math.max(drawGroundAt(W, x, z), waterHeight(W, x, z) - .25) - .05, z);
      at.rotation.set((rnd(k * 4.1) - .5) * .2, rnd(k * 6.3) * 6.28, (rnd(k * 9.7) - .5) * .2);
      const h = 1.4 + 1.4 * Math.pow(rnd(k * 1.9), .8), wd = .8 + rnd(k * 3.7) * .9;
      at.scale.set(wd, h, wd); at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
      color.copy(tones[Math.floor(rnd(k * 1.3) * tones.length)]).multiplyScalar(.8 + rnd(k * 4.4) * .3); reeds.setColorAt(n++, color);
    }
  }
  reeds.count = n; reeds.receiveShadow = true; reeds.frustumCulled = false; rt.scene.add(reeds);
}
// 点から折れ線までの平らな距離
function segDist2(x, z, pts) { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) {
  const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; }
// 舟の列（10/30）：持ち場の岸から八方のどこを向いても、水路か川に連ねた舟が入るように。
//   本流のこちらの岸に、上陸の口（|x|<20）を外して東西六艘ずつ舳先を岸へ向けて並べる。東の脇の水路には舳と艫をつないで三艘。
//   見た目だけ（当たり・兵の道は変えない）。舟は共通の小舟の束（boatInstancer）で描くので描く回数は増えない。
function boatRows(rt) {
  const W = rt.world, rnd = (k) => { const v = Math.sin(k * 57.3 + 9.1) * 43758.5453; return v - Math.floor(v); };
  const edgeZ = (x) => { for (let z = BANK_Z; z > CH_Z; z -= .25) if (W.waterDepthAt(x, z) > .45) return z; return null; };
  const spots = [];
  for (const [x0, dir] of [[-24, -1], [24, 1]]) for (let i = 0; i < 6; i++) {
    const x = x0 + dir * (i * 2.35 + rnd(i + x0) * .3), ez = edgeZ(x); if (ez === null) continue;
    const z = ez - 3.5 - rnd(i * 3.1 + x0) * .8;
    rt.scene.add(riverBoat(x, waterHeight(W, x, z) + .04, z, (rnd(i * 7.7 + x0) - .5) * .22));
    spots.push([x, z]);
  }
  // 東の脇の水路（x≒13）：浅い溝に細長く三艘。棹を立てた舟と筵を掛けた舟が交じる。
  const P = [[14, -2], [12, 8], [14, 24]];
  for (let i = 0; i < 3; i++) {
    const t = .12 + i * .28, f = t * (P.length - 1), j = Math.floor(f), u = f - j, a = P[j], b = P[j + 1];
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    rt.scene.add(riverBoat(x, waterHeight(W, x, z) + .04, z, Math.atan2(b[0] - a[0], b[1] - a[1]) + (rnd(i * 4.3) - .5) * .08));
    spots.push([x, z]);
  }
  return spots;
}
// 輪中の地面（10/30）：岸から陣までの土を一色にしない。窪みと水際は湿った黒い泥、所々に枯れ色と黄緑の葦の根の株、
//   道と柵の持ち場は踏み固めた土。準備の時だけ頂点の配分（草・土・泥）を直し、葦の株は岸の葦と同じ形と材質で一回描く。
function wajuuFloor(rt, reed, boats = []) {
  const W = rt.world, geo = W.terrain?.geometry, P = geo?.attributes.position, splat = geo?.attributes.splat;
  const paths = W.def.paths || [];
  const segD = segDist2;
  const pathD = (x, z) => { let d = Infinity; for (const p of paths) d = Math.min(d, segD(x, z, p)); return d; };
  const wetNear = (x, z, r) => { for (let a = 0; a < 8; a++) if (W.waterDepthAt(x + Math.cos(a * .785) * r, z + Math.sin(a * .785) * r) > .03) return true; return false; };
  // 斑：大きな湿りのむら（二十歩ほど）と、中くらいの草の株（七、八歩）
  const n1 = (x, z) => Math.sin(x * .13 + Math.sin(z * .07) * 1.7) * Math.cos(z * .11 - x * .05);
  const n2 = (x, z) => Math.sin(x * .41 + z * .23 + Math.cos(x * .09) * 2) * Math.cos(z * .37 - x * .19);
  if (P && splat) {
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      if (Math.abs(x) > 130 || z < BANK_Z - 6 || z > 75) continue;
      if (W.waterDepthAt(x, z) > .05) continue;
      const fade = Math.min(1, (130 - Math.abs(x)) / 25, (75 - z) / 15);
      const a = n1(x, z), b = n2(x, z), pd = pathD(x, z);
      // 持ち場の近く（三十歩内）は四、五歩の細かな斑を重ね、足もとから草の株と泥と踏み跡が交じって見えるように
      const near = Math.max(0, 1 - Math.hypot(x - 1, z + 6) / 32), c3 = Math.sin(x * .9 + Math.sin(z * .6) * 1.3) * Math.cos(z * .8 - x * .3);
      const wet = Math.max(Math.max(0, Math.min(1, (a * .7 + b * .3 - .12 - c3 * .4 * near) / .4)), wetNear(x, z, 2.5) ? .85 : wetNear(x, z, 5) ? .45 : 0);
      const reedy = Math.max(0, Math.min(1, (b * .7 - a * .25 + .18 + c3 * .45 * near) / .35));
      const trod = Math.max(0, 1 - pd / 2.4);
      let g = splat.getX(i), d = splat.getY(i), m = splat.getZ(i);
      const G = reedy * (1 - trod), M = wet * (1 - trod * .5) * .8, D = trod * .9;
      g = g * (1 - fade) + fade * Math.max(G, .08); m = m * (1 - fade) + fade * Math.max(M, trod * .35); d = d * (1 - fade) + fade * (D + (1 - Math.max(G, M)) * .5);
      const t = g + d + m || 1;
      splat.setXYZ(i, g / t, d / t, m / t);
    }
    splat.needsUpdate = true;
  }
  // 葦の根の株：持ち場の周り六〜五十歩に、草の斑と水際へ寄せて低い株と背の高い株を混ぜる（道・柵の持ち場・舟の脇は空ける）。
  const rnd = (k) => { const v = Math.sin(k * 77.7 + 5.3) * 43758.5453; return v - Math.floor(v); };
  const tones = [0x7c7452, 0x6f7044, 0x8a7d5c, 0x76783f, 0x938563, 0x5d6446].map(h => new THREE.Color(h));
  const at = new THREE.Object3D(), color = new THREE.Color(), N = 340;
  const clumps = new THREE.InstancedMesh(reed.geo, reed.mat, N);
  let n = 0;
  for (let i = 0; i < 2400 && n < N; i++) {
    const ang = rnd(i) * 6.283, r = 3 + Math.pow(rnd(i * 1.7), .9) * 48, x = 1 + Math.sin(ang) * r, z = -9 + Math.cos(ang) * r;
    if (z < BANK_Z - 4 || W.waterDepthAt(x, z) > .05) continue;
    if (Math.abs(x) < 18 && z < BANK_Z + 2.5) continue;   // 柵を結う岸の持ち場と着岸口
    const low = Math.abs(x) < 18 && z < BANK_Z + 12;   // 陣の足もとは踝ほどの低い株だけ
    if (pathD(x, z) < 2.4 || boats.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 4)) continue;
    let solid = false; for (const s of SOLIDS) if (x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1) { solid = true; break; }
    if (solid) continue;
    const near = wetNear(x, z, 3), want = near ? .85 : Math.max(0, n2(x, z) * .7 - n1(x, z) * .25 + .05) * 1.4;
    if (rnd(i * 3.3) > want) continue;
    at.position.set(x, drawGroundAt(W, x, z) - .06, z);
    at.rotation.set((rnd(i * 4.1) - .5) * .25, rnd(i * 6.3) * 6.28, (rnd(i * 9.7) - .5) * .25);
    const h = low ? .22 + .25 * rnd(i * 1.9) : near ? .9 + 1.1 * rnd(i * 1.9) : .35 + .6 * rnd(i * 1.9), wd = .7 + rnd(i * 3.7) * .8;
    at.scale.set(wd, h, wd); at.updateMatrix(); clumps.setMatrixAt(n, at.matrix);
    color.copy(tones[Math.floor(rnd(i * 1.3) * tones.length)]).multiplyScalar(.8 + rnd(i * 4.4) * .3); clumps.setColorAt(n++, color);
  }
  clumps.count = n; clumps.receiveShadow = true; clumps.frustumCulled = false; rt.scene.add(clumps);
}
// 対岸の輪中（10/29）：川の向こうの水際を葦原で埋め、堤の上に草の株と一揆勢の群れ。退城の舟の口（|x|<20）と東の分流の口は空ける。
// 葦は岸の帯と同じ形と材質（描くのは二回足すだけ）。群れは軽い遠景の軍勢で、本物の兵は増やさない。
function farBankDressing(rt, reed) {
  const W = rt.world, at = new THREE.Object3D(), color = new THREE.Color();
  const rnd = (k) => { const v = Math.sin(k * 57.3 + 19.1) * 43758.5453; return v - Math.floor(v); };
  const tones = [0x7c7452, 0x66694a, 0x8a7d5c, 0x5d6446, 0x938563, 0x707050].map(h => new THREE.Color(h));
  const edgeZ = (x) => { for (let z = CH_Z - 2; z > CH_Z - 20; z -= .5) if (W.waterDepthAt(x, z) < .05) return z; return null; };
  const skip = (x) => Math.abs(x) < 20 || Math.abs(x - 32) < 5;
  const reeds = new THREE.InstancedMesh(reed.geo, reed.mat, 260), grass = new THREE.InstancedMesh(reed.geo, reed.mat, 170);
  let n = 0, g = 0, k = 0;
  for (let x = -80; x <= 80 && n < 260; x += .35 + rnd(++k) * .6) {
    if (skip(x) || rnd(k * 3.1) < .08) continue;
    const ez = edgeZ(x); if (ez === null) continue;
    const rows = 1 + Math.floor(rnd(k * 5.3) * 3);
    for (let row = 0; row < rows && n < 260; row++) {
      const jx = x + (rnd(k * 7.7 + row) - .5) * .6, jz = ez + 1.4 - row * (.8 + rnd(k + row * 9) * .8);
      at.position.set(jx, Math.max(drawGroundAt(W, jx, jz), waterHeight(W, jx, jz) - .3) - .05, jz);
      at.rotation.set((rnd(k * 4.1 + row) - .5) * .22, rnd(k * 6.3 + row) * 6.28, (rnd(k * 8.9 + row) - .5) * .22);
      const h = 1.5 + 1.3 * Math.pow(rnd(k * 1.9 + row * 4.1), .8), wd = 1 + rnd(k * 3.7 + row) * .9;
      at.scale.set(wd, h, wd); at.updateMatrix(); reeds.setMatrixAt(n, at.matrix);
      color.copy(tones[Math.floor(rnd(k * 1.3 + row * 2.7) * tones.length)]).multiplyScalar(.82 + rnd(k * 4.4 + row) * .3); reeds.setColorAt(n++, color);
    }
  }
  for (let i = 0; g < 170 && i < 700; i++) {
    const x = -70 + rnd(i * 2.3) * 140, z = CH_Z - 13 - rnd(i * 3.9) * 9;
    if (Math.abs(x - 32) < 4 || W.waterDepthAt(x, z) > .02) continue;
    at.position.set(x, drawGroundAt(W, x, z) - .03, z);
    at.rotation.set((rnd(i * 1.7) - .5) * .3, i * 2.4, (rnd(i * 2.9) - .5) * .3);
    const h = .3 + .35 * rnd(i * 1.3), wd = .8 + rnd(i * 5.1) * .8;
    at.scale.set(wd, h, wd); at.updateMatrix(); grass.setMatrixAt(g, at.matrix);
    color.copy(tones[i % tones.length]).multiplyScalar(.8 + rnd(i * 3.3) * .3); grass.setColorAt(g++, color);
  }
  reeds.count = n; grass.count = g;
  for (const m of [reeds, grass]) { m.receiveShadow = true; m.frustumCulled = false; rt.scene.add(m); }
  // 堤の上と裏に群れる門徒（念仏の旗）。退城の組（z=-44）と対岸の弓衆（z=-51）の後ろ・脇に寄せる。
  // 11/4 jin（AF・AP9）：近づくと消える絵の軍勢（addDistantArmy）はやめた。対岸の門徒は本物の退城の組と弓衆だけ。
}
// 11/8 critic60（八1・四5）：三か月の籠城の末の門徒の寺と砦の茅は、雨と煤で黒ずむ。霞の中で白い瓦屋根に見えないよう、
//   茅の頂点の色だけを焦げ茶へ落とす（形・材質は使い回し。この戦の Garan の束だけを一度塗る）。
function darkThatch(G) {
  for (const b of G.buckets.values()) {
    const c = b.mk === 'thatch' && b.mesh?.geometry.attributes.color;
    if (!c) continue;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * .3, c.getY(i) * .26, c.getZ(i) * .22);
    c.needsUpdate = true;
  }
}
// 輪中の奥の寺々（10/29）：中江の砦の裏と屋長島の裏に、願証寺と同じ茅の大屋根を二つ。霞の向こうに棟と念仏の旗が覗く。
function farTemples(rt) {
  const W = rt.world, G = new Garan(rt);
  // 深夜：陸の側にも、輪中の東西の端に門徒の道場を一つずつ（岸から東・西・南西を向いた画面の奥に茅の大屋根が入る）。
  // 11/6 fixc1439：陸の側（織田の囲みの内）の東西の道場は外した。市江口・賀鳥口の手のすぐ脇に門徒の寺と南無の旗が立ち、
  //   遠目の作り（dist: 'far'）が四十歩で窓も戸も無い箱に見えた。門徒の寺は島の側だけ。
  const T = [{ id: 'oku_hondo', x: -18, z: -118, w: 16, d: 12, h: 8 }, { id: 'yana_dojo', x: 62, z: -108, w: 14, d: 11, h: 7.5 }];
  // 島奥の二堂も、高画質では願証寺と同じ真宗の推定内装を使う。
  // 畳の外陣・板敷きの内陣と須弥壇を備え、本尊背後の窓を閉じ、表口は開閉する格子戸にする。
  // 建物の大きさと遠景の屋根の束は保ち、室内は既存の近づいた時だけ作る仕組みに任せる。
  for (const t of T) G.build({ id: t.id, name: '門徒の寺', kind: 'hondo',
    profile: SETTINGS.quality === 'high' ? 'nagashima' : undefined,
    x: t.x, z: t.z, w: t.w, d: t.d, h: t.h, rot: t.rot || 0, roof: 'thatch', enterable: true, dist: 'far' });
  G.finish(); darkThatch(G);
  for (const t of T) { const L = Math.hypot(t.x, t.z), ux = -t.x / L, uz = -t.z / L, r = Math.max(t.w, t.d) / 2 + 3;   // 旗は岸の側の前に
    for (const s of [-5, 5]) rt.scene.add(nobori(W, t.x + ux * r - uz * s, t.z + uz * r + ux * s, 'namu', 7)); }
}

// 輪中の門徒の支坊（10/29 夜）：願証寺と同じ茅の本堂・楼門・築地。陣の向こう（南東の百歩余り）に屋根と念仏の旗が覗く。
const SHIBO = { x: 14, z: 80 };   // 10/29：南を向いた画面でも霞に消えないよう寄せる。深夜：陣の向こうの真ん中寄りへ（陸を向いたどの画面にも棟が入る）
function shiboTemple(rt) {
  const W = rt.world, S = SHIBO, G = new Garan(rt);
  // 支坊も島奥の堂と同じ推定内装。畳の外陣・須弥壇の内陣を使い、
  // 本尊裏の窓を閉じ、表口を操作できる格子の引き戸にする。室内は接近時だけ作る。
  G.build({ id: 'shibo_hondo', name: '門徒の支坊', kind: 'hondo',
    profile: SETTINGS.quality === 'high' ? 'nagashima' : undefined,
    x: S.x, z: S.z, w: 18, d: 13, h: 9.4, rot: Math.PI, roof: 'thatch', enterable: true, dist: 'far' });   // 深夜：陣の幕と旗の上に大屋根が抜ける高さ
  G.finish(); darkThatch(G);
  rt.scene.add(romon(W, S.x, S.z - 10, 5.2, Math.PI));
  const batch = makeKitBatch();
  for (const seg of [[S.x - 12, S.z - 10, S.x - 2.8, S.z - 10], [S.x + 2.8, S.z - 10, S.x + 12, S.z - 10],
    [S.x - 12, S.z - 10, S.x - 12, S.z + 9], [S.x + 12, S.z - 10, S.x + 12, S.z + 9], [S.x - 12, S.z + 9, S.x + 12, S.z + 9]]) {
    const m = tsuiji(W, seg, { batch }); if (m && !m.parent && m.children?.length) rt.scene.add(m);
  }
  finalizeKitBatch(rt, batch);
  for (const [dx, dz] of [[-4, -12], [4, -12], [-9, -4], [9, -4]]) rt.scene.add(nobori(W, S.x + dx, S.z + dz, 'namu', 6.5));
}

// 川筋だけの戦には共通の葦が生えないため、岸と浅い水路にまとめて置く。
function bankReeds(rt) {
  // 槍の穂先に見えた三角を細い穂へ替え、葉も付ける。乾いた持ち場を葦で埋めない。
  const stem = new THREE.CylinderGeometry(.01, .015, .65, 3), head = new THREE.SphereGeometry(.035, 4, 3);
  stem.translate(0, .325, 0); head.scale(1, 2.6, .7); head.translate(0, .7, 0);
  const leaves = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.BoxGeometry(.025, .32, .008);
    leaf.rotateZ(side * .55); leaf.translate(-side * .07, .38, 0); leaves.push(leaf);
  }
  const geo = mergeGeometries([stem, head, ...leaves], false);
  stem.dispose(); head.dispose(); for (const leaf of leaves) leaf.dispose();
  // 手前の岸の水際にも葦を連ねる（資料との差：岸が橙の一枚）。中央の着岸口と左右の作業場は空ける。
  const reeds = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 160);
  const at = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < 160; i++) {
    const side = i % 2 ? 1 : -1, band = Math.floor((i % 48) / 2);
    let z = -1 + (band % 12) * 1.9 + Math.sin(i * 2.3) * .3;
    const bank = z < 8 ? 12 + (8 - z) * .2 : 12 + (z - 8) * .125;
    let x = side * (bank + .85 + Math.sin(i * 7.1) * .3);
    // 半数を本流の岸へ移す。中央の着岸口と柵の作業場は空け、本数と描画の束は保つ。
    if (i >= 48) {
      x = side * (50 + band * 1.45 + Math.sin(i * 2.3) * .45);
      const middle = CH_Z + (x > 0 ? -x * .02 : 0);
      z = middle + RIVER_STREAMS[0].w + .8 + Math.sin(i * 3.7) * .3;
    }
    if (i >= 96) {
      const k = i - 96, n = Math.floor(k / 2) * 1.05 + Math.sin(k * 1.7) * .35;
      x = side * (n < 15 ? 6 + n : 16 + n);
      z = BANK_Z + 1.2 + Math.abs(Math.sin(k * 2.9)) * 2.2;
    }
    at.position.set(x, drawGroundAt(rt.world, x, z) - .04, z);
    at.rotation.set(.06 * Math.sin(i), i * 2.4, .12 * Math.cos(i));
    at.scale.set(1, .75 + .2 * (1 + Math.sin(i * 3.1)), 1);
    if (i >= 96) at.scale.set(1.5, 1.7 + .5 * Math.sin(i * 1.3), 1.5);   // 柵の内の堤の草むらは膝から腰の高さ
    at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
    // 秋の枯れ穂と灰緑を株ごとに混ぜる。新しい材質は作らない。
    color.setHex(i % 3 ? 0x847c58 : 0x6d7955); reeds.setColorAt(i, color);
  }
  rt.scene.add(reeds);
}

// 所持している弓だけを縦に背負う。弦付きの共通の和弓を使い、矢羽も一つにまとめる。
function bankBow(rt) {
  if (!rt.player.hasBow) return;
  const bow = makeWeapon('bow');
  // 毎回の構えで縮尺が戻る弦は、形の方を少し太くして携帯でも見せる。
  for (const w of [bow, rt.player.bowMesh]) if (w?.userData.bow) {
    for (const s of [w.userData.bow.s1, w.userData.bow.s2]) { s.geometry = s.geometry.clone(); s.geometry.scale(1.5, 1, 1.5); }
  }
  bow.position.set(-.25, .85, -.25); bow.rotation.z = .08;
  const quiver = new THREE.Group(), box = new THREE.Mesh(ROOM_BOX, DARK), parts = [];
  box.scale.set(.13, .38, .11); box.position.y = .18; quiver.add(box);
  for (let i = 0; i < 6; i++) {
    const g = arrowGeometry().clone();
    g.rotateX(Math.PI / 2); g.translate((i % 3 - 1) * .035, .06 + (i % 2) * .025, Math.floor(i / 3) * .03);
    parts.push(g);
  }
  quiver.add(new THREE.Mesh(mergeGeometries(parts, false), MAT));
  for (const g of parts) g.dispose();
  quiver.position.set(.25, .7, -.22); quiver.rotation.x = -.2;
  // 近い人では軽い胴が隠れる。背負う物は独立した入れ物で胴の動きに合わせる。
  const gear = new THREE.Group(); gear.add(bow, quiver);
  rt.player.u.mesh.add(gear); rt.flags.backGear = gear; rt.flags.backBow = bow;
}

// 小屋の外観は材質ごとに全砦でまとめる。室内は共通処理が近づいた時だけ作る。
const ROOM_WOOD = new THREE.MeshLambertMaterial({ color: 0x75634d });
const ROOM_ROOF = new THREE.MeshLambertMaterial({ color: 0x4f4234 });
const ROOM_FRAME = new THREE.MeshLambertMaterial({ color: 0x514a3d });
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
// 四巡目：板の幅・継ぎ目・雨筋は小さな自作の絵で描く。面や描画の束は増やさない。
const FORT_BOARD_TEXTURES = [];
function fortBoardTexture(roof) {
  const key = roof ? 1 : 0;
  if (FORT_BOARD_TEXTURES[key]) return FORT_BOARD_TEXTURES[key];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  for (let board = 0; board < 4; board++) {
    const v = 202 + Math.round(15 * Math.sin(board * 7.3 + key));
    ctx.fillStyle = `rgb(${v + 8},${v + 4},${v - 3})`; ctx.fillRect(board * 64, 0, 64, 256);
    // 屋根は軒へ、壁は地面へ流れる細い木目。板ごとに乾き方を変える。
    for (let n = 0; n < 22; n++) {
      const x = board * 64 + 4 + n * 2.6;
      ctx.strokeStyle = n % 3 ? 'rgba(67,59,45,.12)' : 'rgba(255,250,231,.2)';
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 2, 80, x - 2, 176, x, 256); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(49,43,34,.45)'; ctx.fillRect(board * 64, 0, 2, 256);
    // 八巡目：写真の古板の節・割れ・釘跡。既存の小さな絵に焼き、面を足さない。
    const knotX = board * 64 + 22 + 12 * Math.sin(board * 3.7 + key);
    const knotY = 42 + (board * 67 + key * 39) % 170;
    ctx.strokeStyle = 'rgba(69,57,41,.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(knotX, knotY, 3, 9, .08, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(58,47,34,.32)';
    ctx.beginPath(); ctx.ellipse(knotX, knotY, 1.3, 4, .08, 0, Math.PI * 2); ctx.fill();
    for (const end of [0, 256]) {
      const crackX = board * 64 + 42 - board * 3, inward = end ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(crackX, end);
      ctx.lineTo(crackX + 1, end + inward * 12); ctx.lineTo(crackX - 1, end + inward * (22 + board * 3)); ctx.stroke();
    }
    if (roof) {
      // 板の端をずらす。瓦のような一様な横段にはしない。
      const joint = 48 + (board * 53) % 160;
      ctx.fillStyle = 'rgba(55,49,39,.36)'; ctx.fillRect(board * 64 + 2, joint, 61, 2);
      ctx.fillStyle = 'rgba(49,43,34,.55)';
      for (const dx of [9, 54]) ctx.fillRect(board * 64 + dx, joint + 5, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  FORT_BOARD_TEXTURES[key] = texture;
  return texture;
}
function fortRooms(rt) {
  const detailed = true, bag = [[], [], []], buildings = {};
  const materials = [ROOM_WOOD, ROOM_ROOF, ROOM_FRAME];
  ROOM_ROOF.color.setHex(detailed ? 0x77705f : 0x4f4234);
  for (const m of materials) { m.map = woodTex(); m.needsUpdate = true; }
  if (detailed) { ROOM_WOOD.map = fortBoardTexture(false); ROOM_ROOF.map = fortBoardTexture(true); }
  const box = (b, material, lx, ly, lz, w, h, d, rx = 0) => {
    const g = ROOM_BOX.clone();
    const uv = g.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let n = 0; n < 4; n++) { const i = f * 4 + n; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]); }
    g.scale(w, h, d); if (rx) g.rotateX(rx);
    g.translate(b.x + lx, rt.world.heightAt(b.x, b.z) + ly, b.z + lz); bag[material].push(g);
  };
  for (const b of FORT_BUILDINGS) {
    if (b.kind === 'goten') {
      buildings[b.id] = goten(rt, b.x, b.z, { w: b.w, d: b.d, name: b.name, tile: false, naka: true, profile: 'nagashima', doorX: 0, team: 1, noTarget: true });
      continue;
    }
    if (!b.enter) {
      // 火がかかる蔵は個別の見た目を保ち、円の当たりを重ねず、板壁の四角の当たりを使う。
      const firstSolid = SOLIDS.length;
      // 五巡目：写真の番小屋のような薄い板葺きへ。共通の石置き屋根はここだけ省く。
      const mesh = hut(rt.world, b.x, b.z, b.w, b.d, 0, { ita: true, minka: false,
        ...(detailed ? { boardRoof: true, weatheredBoards: true, wall: 0x756650,
          boardRoofColors: [0x82735e, 0x756754, 0x8b7960, 0x6c6253] } : {}),
      }); rt.scene.add(mesh);
      const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2, w: b.w, d: b.d, mesh, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name, flammable: true, moraleOnBurn: 'big' });
      for (let n = firstSolid; n < SOLIDS.length; n++) SOLIDS[n].struct = struct;
      struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { mesh, struct };
      continue;
    }
    const w = b.w, d = b.d, y = rt.world.heightAt(b.x, b.z), H = 2.6, door = 1.4;
    // 五巡目：戸の左右に小さな格子窓。外壁・室内・当たりを同じ開口にする。
    const windows = detailed ? [-1, 1].map(side => ({ face: 'z', s: 1, t: side * (w + door) / 4,
      w: Math.min(1.1, (w - door) / 2 - .5), y0: 1.25 - .18, y1: 2.05 - .18 })) : [];
    const naka = addInterior(rt.world, { name: b.name, kind: b.kind || 'nagaya', profile: 'nagashima', x: b.x, z: b.z, team: 1,
      levels: [{ y: y + .18, w, d, h: H - .18 }], door: { side: 1, lx: 0, w: door, h: 2.05, sliding: 'itado' }, approach: { pad: .2, len: .9 }, wins: () => windows });
    // 共通の室内と同じ寸法の壁。入口を飾りの戸や大きな当たりで塞がない。
    box(b, 0, 0, .1, 0, w, .16, d);
    box(b, 0, 0, H / 2, -d / 2, w, H, .12);
    for (const side of [-1, 1]) {
      box(b, 0, side * w / 2, H / 2, 0, .12, H, d);
    }
    const openings = windows.map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .18, y1: v.y1 + .18 }));
    openings.push({ t0: -door / 2, t1: door / 2, y0: 0, y1: 2.23 });
    for (const [x0, x1, y0, y1] of facePanels(w, H, openings))
      box(b, 0, (x0 + x1) / 2, (y0 + y1) / 2, d / 2, x1 - x0, y1 - y0, .12);
    for (const v of windows) {
      const bottom = v.y0 + .18, top = v.y1 + .18, mid = (bottom + top) / 2;
      for (const side of [-1, 1]) {
        box(b, 2, v.t + side * (v.w / 2 + .035), mid, d / 2 + .025, .07, top - bottom + .14, .16);
        box(b, 2, v.t, side < 0 ? bottom : top, d / 2 + .025, v.w + .14, .07, .16);
      }
      for (let q = -1; q <= 1; q++) box(b, 2, v.t + q * v.w * .3, mid, d / 2, .045, top - bottom, .08);
      // 七巡目：格子窓の上に板の跳ね上げ戸。窓穴は開けたまま、軒下で雨をよける。
      // 二枚の板と裏桟・突き上げ棒を既存の束へ入れ、別の描画や当たりを増やさない。
      const flap = .64, tilt = .4, fy = top + .04 - flap * Math.sin(tilt) / 2;
      const fz = d / 2 + .08 + flap * Math.cos(tilt) / 2;
      for (const side of [-1, 1]) {
        box(b, 0, v.t + side * (v.w + .12) / 4, fy, fz, (v.w + .12) / 2 - .008, .045, flap, tilt);
        box(b, 2, v.t + side * v.w * .35, fy - .035, fz, .045, .045, flap - .06, tilt);
        const reach = flap * Math.cos(tilt) - .05, lift = top - .28 - (bottom + .2);
        box(b, 2, v.t + side * v.w * .4, (top - .28 + bottom + .2) / 2,
          d / 2 + .08 + reach / 2, .035, .035, Math.hypot(reach, lift), -Math.atan2(lift, reach));
      }
    }
    const half = d / 2 + .6, rise = half * .4, slope = Math.hypot(half, rise), angle = Math.atan2(rise, half);
    if (detailed) {
      // 妻を三角の板壁で閉じる。軒より外へ張り出さず、裏面にも厚みを持たせる。
      for (const side of [-1, 1]) {
        const g = new THREE.BufferGeometry(), x0 = side * w / 2 - .06, x1 = x0 + .12;
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          x0,H+.18,-d/2, x0,H+.18,d/2, x0,H+rise-.06,0,
          x1,H+.18,-d/2, x1,H+.18,d/2, x1,H+rise-.06,0,
        ], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, d,0, d/2,d*.2, 0,0, d,0, d/2,d*.2], 2));
        g.setIndex([0,2,1, 3,4,5, 0,1,4, 0,4,3, 1,2,5, 1,5,4, 2,0,3, 2,3,5]);
        g.computeVertexNormals(); g.translate(b.x, y, b.z); bag[0].push(g);
        box(b, 0, side * w / 2, H + .09, 0, .12, .18, d);
        // 隅柱と桁。正面の横桟は左右へ分け、入口の高さと幅を守る。
        for (const end of [-1, 1]) box(b, 2, side * w / 2, H / 2, end * d / 2, .16, H, .17);
        box(b, 2, 0, H - .08, side * d / 2, w + .2, .16, .18);
        box(b, 2, side * w / 2, H - .08, 0, .18, .16, d);
        box(b, 2, side * (w + door) / 4, .55, d / 2 + .07, (w - door) / 2, .1, .08);
        box(b, 2, side * (door / 2 + .06), 1.12, d / 2 + .07, .12, 2.23, .1);
      }
      // 押縁は粗めの間隔で束にまとめる。板壁の一枚ごとに面を増やさない。
      const count = Math.ceil(w / 1.5);
      for (let i = 1; i < count; i++) {
        const lx = -w / 2 + w * i / count;
        box(b, 2, lx, H / 2, -d / 2 - .07, .045, H, .04);
        if (Math.abs(lx) > door / 2 + .15) {
          const win = windows.find(v => Math.abs(lx - v.t) < v.w / 2 + .08);
          if (win) {
            const bottom = win.y0 + .18, top = win.y1 + .18;
            box(b, 2, lx, bottom / 2, d / 2 + .07, .045, bottom, .04);
            box(b, 2, lx, (top + H) / 2, d / 2 + .07, .045, H - top, .04);
          } else box(b, 2, lx, H / 2, d / 2 + .07, .045, H, .04);
        }
      }
      // 湿った輪中の地際だけ暗くする。戸口と踏段は泥色の板で塞がない。
      box(b, 2, 0, .16, -d / 2 - .065, w, .28, .025);
      for (const side of [-1, 1]) {
        box(b, 2, side * (w / 2 + .065), .16, 0, .025, .28, d);
        box(b, 2, side * (w + door) / 4, .16, d / 2 + .065, (w - door) / 2, .28, .025);
      }
    }
    // 梁を見せる蔵・長屋だけ、小屋組を同じ屋根勾配へ納める推定復元。
    // 梁割りは naka.js の nagashimaOpenRoof と合わせ、束を梁のない所へ立てない。
    const openRoof = SETTINGS.quality === 'high' && ['kura', 'nagaya'].includes(b.kind);
    if (openRoof) {
      const bays = Math.max(2, Math.round(w / 1.9));
      for (const lz of [-half / 2, 0, half / 2]) {
        const top = H + rise * (1 - Math.abs(lz) / half) - .14;
        box(b, 2, 0, top - .07, lz, w, .14, .14);
        const bottom = H - .05, height = top - .14 - bottom;
        if (height > 0) for (let j = 1; j < bays; j++)
          box(b, 2, -w / 2 + j * w / bays, bottom + height / 2, lz, .12, height, .12);
      }
    }
    for (const side of [-1, 1]) {
      box(b, 1, 0, H + rise / 2, side * half / 2, w + 1.2, .12, slope, side * angle);
      if (detailed) {
        // 六巡目：写真の薄い板屋根を支える垂木と破風板。軒下を一枚板のままにしない。
        // 梁を見せる室内では棟まで通し、母屋の上に載せる。既存の木材の束へ結合する。
        const rafters = Math.ceil(w / 1.4), tail = openRoof ? half : .58, tailRise = tail * rise / half;
        for (let n = 0; n <= rafters; n++)
          box(b, 2, -w / 2 + w * n / rafters, H + tailRise / 2 - .11,
            side * (half - tail / 2), .075, .1, Math.hypot(tail, tailRise), side * angle);
        for (const end of [-1, 1])
          box(b, 2, end * (w / 2 + .55), H + rise / 2 - .035,
            side * half / 2, .09, .18, slope + .08, side * angle);
      }
      // 板葺きの押さえ木と段の筋。
      for (let n = 1; n <= 3; n++) box(b, 1, 0, H + rise * (1 - n / 4) + .1, side * half * n / 4, w + 1.3, .08, .1);
    }
    box(b, 1, 0, H + rise + .08, 0, w + 1.4, .15, .24);
    for (let n = 0; n < 3; n++) box(b, 0, 0, .03 + n * .03, d / 2 + .2 + (2 - n) * .3, 1.7, .06 + n * .06, .3);
    const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(w, d) / 2, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name });
    // 入れるようにした蔵・小屋も、元の着火と焼失時の士気を保つ。
    if (b.kind === 'kura' || b.id === 'naka_hut') { struct.flammable = true; struct.moraleOnBurn = 'big'; }
    struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { naka, struct };
  }
  for (let n = 0; n < bag.length; n++) {
    if (!bag[n].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(bag[n], false), materials[n]);
    mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    for (const g of bag[n]) g.dispose();
  }
  return buildings;
}

// 三巡目：既存の塀・櫓を重ねず、土塁の裾と町の境、作事の道具を補う。
// 全部開戦時に三種類の形へ束ねる。兵・旗・登り口・室内は増減しない。
function fortYardDetails(rt) {
  const W = rt.world, bags = [[], [], []], at = new THREE.Object3D();
  const put = (kind, x, y, z, w, h, d, color, rx = 0, rz = 0) => {
    at.position.set(x, y, z); at.rotation.set(rx, 0, rz); at.scale.set(w, h, d); at.updateMatrix();
    bags[kind].push({ matrix: at.matrix.clone(), color });
  };
  // 斧で削いだ低い杭を板塀の外、土塁の裾へ。木戸正面と川岸の射手の持ち場は空ける。
  const stakeRows = [[-32, -65, -32, -99], [32, -64, 32, -98], [38, -96, 64, -96], [174, -74, 174, -113]];
  for (const [ax, az, bx, bz] of stakeRows) {
    const len = Math.hypot(bx - ax, bz - az), count = Math.floor(len / .85);
    for (let i = 0; i <= count; i++) {
      // 六巡目：写真の乱杭は等間隔の細い棒ではない。同じ本数で間隔・太さ・傾きを崩す。
      // 両端は元の位置に残し、木戸や通路へ列を広げない。
      const t = (i + (i > 0 && i < count ? .24 * Math.sin(i * 4.7 + ax) : 0)) / count;
      const offset = .1 * Math.sin(i * 5.1), nx = -(bz - az) / len, nz = (bx - ax) / len;
      const x = ax + (bx - ax) * t + nx * offset, z = az + (bz - az) * t + nz * offset;
      const h = 1.05 + .25 * Math.sin(i * 2.3 + ax), y = W.heightAt(x, z);
      const girth = .85 + .55 * (.5 + .5 * Math.sin(i * 3.7 + az));
      put(2, x, y - .2, z, girth, h, girth, i % 3 ? 0x82755e : 0x655e50, .13 * Math.sin(i), .14 * Math.cos(i));
    }
    // 見た目だけの杭を通り抜けない。既存の塀の外側だけ、低い木の当たりを付ける。
    Object.assign(solidSeg(ax, az, bx, bz, .18), { missileH: 1.1, missileType: 'wood' });
  }
  // 僧坊・門徒屋敷の裏境。南北の路地と住民の道（x=-48前後）には口を残す。
  const fences = [[-54, -105, -50.5, -105], [-45, -105, -36, -105], [-42, -98, -36, -98]];
  for (const [ax, az, bx, bz] of fences) {
    const len = bx - ax, n = Math.ceil(len / .32);
    for (let i = 0; i < n; i++) {
      const x = ax + (i + .5) * len / n, y = W.heightAt(x, az), h = 1.25 + .07 * Math.sin(i * 3.4);
      put(0, x, y + h / 2, az, len / n - .015, h, .065, i % 4 ? 0x7d735e : 0x696253);
      // 地際だけを泥色にし、板の上端は乾いた灰茶に残す。
      put(0, x, y + .12, az + .005, len / n - .015, .24, .075, 0x514c3f);
    }
    for (let x = ax; x <= bx + .01; x += len / Math.ceil(len / 1.8)) {
      const y = W.heightAt(x, az);
      put(0, x, y + .7, az + .08, .13, 1.5, .13, 0x5e5545);
    }
    for (const h of [.35, .95]) {
      const y = (W.heightAt(ax, az) + W.heightAt(bx, bz)) / 2;
      put(0, (ax + bx) / 2, y + h, az + .09, len, .09, .09, 0x635946);
    }
    Object.assign(solidSeg(ax, az, bx, bz, .12), { missileH: 1.4, missileType: 'wood' });
  }
  // 本の作事小屋のように、低い片流れの掛屋と、その脇の丸太・板束を組む。
  // 俵ばかりの広場にせず、二砦の奥と織田本陣の脇へ分ける（位置・個数は推定）。
  for (const [x, z] of [[-24, -96], [60, -90], [-15, 60]]) {
    const y = Math.max(W.heightAt(x - 1.4, z), W.heightAt(x + 1.4, z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * 1.4, pz = z + sz * .9, bottom = W.heightAt(px, pz) - .15, top = y + 1.65 + sz * .18;
      put(1, px, (bottom + top) / 2, pz, .11, top - bottom, .11, 0x716452);
    }
    for (const sz of [-1, 1]) put(0, x, y + 1.65 + sz * .18, z + sz * .9, 3.1, .12, .14, 0x5d5141);
    // 八巡目：片流れ屋根の下に垂木、柱と桁の間に方杖。板束の出し口は塞がない。
    // 既存の箱の束を使い、屋根板を垂木の上へ載せる。
    for (const dx of [-1.4, 0, 1.4])
      put(0, x + dx, y + 1.72, z, .09, .12, 2.25, 0x655942, -Math.atan(.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      put(0, x + sx * 1.15, y + 1.35 + sz * .18, z + sz * .9,
        .09, Math.hypot(.5, .5), .09, 0x71634e, 0, sx * Math.PI / 4);
    for (let i = 0; i < 9; i++) {
      put(0, x - 1.6 + (i + .5) * 3.2 / 9, y + 1.82, z, .35, .07, 2.3, i % 3 ? 0x8a7c62 : 0x716852, -Math.atan(.2));
    }
    for (const dz of [-.7, .7]) put(0, x, y + 1.9 + dz * .2, z + dz, 3.3, .08, .09, 0x615744);
    // 枕木の上に製材した板を置き、切り出した丸太は横へ積む。
    for (const dx of [-.9, .9]) put(0, x + dx, y + .1, z, .18, .2, 1.5, 0x514b3e);
    for (let layer = 0; layer < 4; layer++) for (let k = 0; k < 3; k++)
      put(0, x, y + .25 + layer * .13, z + (k - 1) * .36, 2.4 - layer * .05, .1, .32, layer % 2 ? 0x8d7d60 : 0x75684f);
    const lx = x + 2.4, ly = W.heightAt(lx, z);
    // 七巡目：丸太を地面に直置きせず、写真の作事場のような二脚の木馬へ載せる。
    // 板束の天端には木槌と手斧。すべて既存の三種類の形・材質を使う。
    for (const dz of [-.85, .85]) {
      for (const side of [-1, 1]) put(1, lx + side * .25, ly + .23, z + dz,
        .055, .55, .055, 0x71634e, 0, side * .4);
      put(0, lx, ly + .45, z + dz, .85, .12, .14, 0x8d7d60);
    }
    for (let k = 0; k < 5; k++) put(1, lx + (k % 3 - 1) * .25, ly + .63 + Math.floor(k / 3) * .23, z,
      .12, 2.6 + .12 * Math.sin(k), .12, k % 2 ? 0x645b49 : 0x827056, Math.PI / 2);
    put(0, x - .45, y + .71, z + .1, .055, .055, .65, 0x695b44);
    put(0, x - .45, y + .76, z - .18, .32, .16, .14, 0x928062);
    put(0, x + .5, y + .71, z + .05, .055, .055, .72, 0x8c7857);
    put(0, x + .56, y + .75, z - .24, .18, .11, .2, 0x4e4b43);
  }
  // 本の野戦兵器の竹の盾を、輪中の岸では車輪なしの据え竹束にする。
  // 柵の作業点・着岸口・東の乱戦（x=24前後）から外し、左右の端にだけ置く。
  // 寸法と配置は復元。近い束だけ節と縄を作り、遠い付城は太い竹の輪郭に留める。
  for (const [x, z, close] of [[-55, -10, true], [57, -10, true], [-72, 14, false], [88, 20, false]]) {
    const y = drawGroundAt(W, x, z), count = close ? 17 : 9, pitch = close ? .13 : .245;
    for (let i = 0; i < count; i++) {
      const px = x + (i - (count - 1) / 2) * pitch;
      const h = 1.75 + .12 * Math.sin(i * 2.7 + x), r = close ? .073 : .13;
      const bottom = drawGroundAt(W, px, z) - .08;
      put(1, px, bottom + h / 2, z, r, h, r, i % 3 ? 0x8b8957 : 0x686e48);
      if (close) {
        // 節は細い輪。裏にも竹をずらして重ね、平たい板の盾にしない。
        for (const dy of [.32, .79, 1.26])
          put(1, px, bottom + dy, z, r * 1.12, .035, r * 1.12, 0xaaa071);
        if (i % 2 === 0) put(1, px, bottom + h * .48, z + .13, r, h * .96, r, 0x797b51);
      }
    }
    for (const dy of [.48, 1.25]) {
      // 束の表裏を回る締め縄と、横木。箱の束をそのまま共用する。
      for (const dz of [-.09, .23]) put(0, x, y + dy, z + dz, 2.3, .045, .045, 0xb2a17a);
      for (const dx of [-1.12, 1.12]) put(0, x + dx, y + dy, z + .07, .045, .045, .36, 0xa18d64);
    }
    for (const dx of [-.8, .8]) {
      put(1, x + dx, y + .65, z + .38, .07, 1.5, .07, 0x665b44, -.38);
      put(1, x + dx, y + .24, z + .78, .075, .7, .075, 0x5c513c);
    }
    Object.assign(solidRect(x, z + .08, 2.3, .5), { missileH: 1.8, missileType: 'wood' });
  }
  // 本の作事場と同じ、使う場所の横に置かれた資材。街道と援兵の道は空ける。
  for (const [x, z] of [[-18, 26], [19, 37]]) {
    const y = drawGroundAt(W, x, z);
    for (const dz of [-.7, .7]) put(0, x, y + .08, z + dz, 1.5, .16, .17, 0x675942);
    for (let i = 0; i < 9; i++) {
      const px = x + (i % 5 - 2) * .16, py = y + .24 + Math.floor(i / 5) * .15;
      put(1, px, py, z, .065, 2.6 - .1 * (i % 3), .065, i % 2 ? 0x98905e : 0x77784c, Math.PI / 2);
    }
    for (const dz of [-.65, .65]) put(0, x - .08, y + .48, z + dz, .8, .035, .045, 0xb2a17a);
  }
  // 秋の刈田の端に残された小さな稲積み。兵糧攻めの島内には新たな食糧を置かない。
  // 遠景なので四本の束と締め縄だけにし、一本ずつの稲は作らない。
  for (const [x, z] of [[-48, 80], [-62, 107], [48, 82], [62, 108]]) {
    const y = drawGroundAt(W, x, z);
    for (const dx of [-1, 1]) for (const dz of [-1, 1])
      put(1, x + dx * .2, y + .5, z + dz * .15, .16, 1.1, .16, 0x9c8858, -dz * .27, dx * .32);
    put(0, x, y + .76, z, .45, .055, .39, 0x6c5e40);
  }
  const shaft = new THREE.CylinderGeometry(.045, .07, 1, 5); shaft.translate(0, .5, 0);
  const tip = new THREE.ConeGeometry(.045, .22, 5); tip.translate(.015, 1.11, 0);
  const stake = mergeGeometries([shaft, tip], false); shaft.dispose(); tip.dispose();
  const log = new THREE.CylinderGeometry(1, 1, 1, 5);
  const material = new THREE.MeshLambertMaterial({ map: woodTex() });
  const shapes = [ROOM_BOX, log, stake], color = new THREE.Color();
  for (let k = 0; k < bags.length; k++) {
    const mesh = new THREE.InstancedMesh(shapes[k], material, bags[k].length);
    bags[k].forEach((item, i) => { mesh.setMatrixAt(i, item.matrix); mesh.setColorAt(i, color.setHex(item.color)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true; mesh.castShadow = true; rt.scene.add(mesh);
  }
}

// 船の形・材質は共用。開戦時だけ作り、毎コマは位置だけ動かす。
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95, side: THREE.DoubleSide });
WOOD.side = THREE.DoubleSide;
// 小舟は一つの形と材質を複製して使う。
// 動く舟の棹は船体に焼き込まず、同じ寸法の形を組み合わせる。
const BOAT_SHADOW_GEO = new THREE.CircleGeometry(1, 12);
BOAT_SHADOW_GEO.rotateX(-Math.PI / 2);
const BOAT_SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x172720, transparent: true, opacity: .22, depthWrite: false });
const POLE_GEO = new THREE.CylinderGeometry(.03, .03, 4.5, 5);
const ROPE = new THREE.MeshLambertMaterial({ color: 0xa4946b });
const IRON = new THREE.MeshLambertMaterial({ color: 0x4c4940 });
const MUSHIRO = new THREE.MeshLambertMaterial({ color: 0x9b8a61 });
const FOAM = new THREE.MeshBasicMaterial({ color: 0xb4c5bb, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide });
// 板は閉じた厚板。丸い船底から舷へ幅を広げ、継ぎ目を残す。
function hullPlank(bag, points, dx, dy) {
  const pos = points.concat(points.map((v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : 0)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 0,1, 1,0, 1,1, 0,0, 0,1, 1,0, 1,1], 2));
  g.setIndex([0,1,2, 2,1,3, 6,5,4, 7,5,6, 0,4,1, 1,4,5, 2,3,6, 6,3,7, 0,2,4, 4,2,6, 1,5,3, 3,5,7]);
  g.computeVertexNormals(); bag.push(g);
}
function boatBox(bag, x, y, z, w, h, d, rz = 0) {
  const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateZ(rz); g.translate(x,y,z); bag.push(g);
}
// lo：遠く（40m より先）に描く軽い形。舷の割りを半分にし、釘・巻き縄・筵の織り目を省く（遠目の輪郭と色は同じ）
function buildBoatHull(bags, length, width, deck, rise, lo = false) {
  const half = length / 2, widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / half) ** 2), N = lo ? 8 : 16;
  for (let i = 0; i < N; i++) {
    const a = length * (i / N - .5), b = length * ((i + 1) / N - .5) - .015;
    const wa = widthAt(a), wb = widthAt(b), ya = rise * (Math.abs(a) / half) ** 3, yb = rise * (Math.abs(b) / half) ** 3;
    hullPlank(bags[0], [-wa*.32,ya-.3,a, -wb*.32,yb-.3,b, wa*.32,ya-.3,a, wb*.32,yb-.3,b], 0, .1);
    for (const side of [-1,1]) {
      const xs = [.32,.67,.92,1], ys = [-.3,-.18,.12,deck+.5];
      for (let r = 0; r < 3; r++) hullPlank(bags[r % 2],
        [side*wa*xs[r],ya+ys[r],a, side*wb*xs[r],yb+ys[r],b,
         side*wa*xs[r+1],ya+ys[r+1]-.012,a, side*wb*xs[r+1],yb+ys[r+1]-.012,b], -side*.085, 0);
      hullPlank(bags[1], [side*wa,ya+deck+.5,a, side*wb,yb+deck+.5,b,
        side*(wa-.13),ya+deck+.5,a, side*(wb-.13),yb+deck+.5,b], 0, .12);
      if (i % 2 === 0 && !lo) {
        const z = (a+b)/2, w = (wa+wb)/2, y = (ya+yb)/2;
        boatBox(bags[1], side*(w-.12), y+deck+.2, z, .09, .6, .12, side*.14);
        const nail = new THREE.CylinderGeometry(.024, .024, .035, 5); nail.rotateZ(Math.PI/2);
        nail.translate(side*(w+.025), y+deck+.28, z); bags[4].push(nail);
      }
    }
    // 舷の内側に収めた床板。黒い突出板を作らない。
    boatBox(bags[0], 0, deck, (a+b)/2, (wa+wb)*.85, .1, b-a-.025);
  }
  // 点々の白い板ではなく、舷から船首・船尾まで閉じた波の輪。
  // 大舟は水面から .45 下げて置くので、その分だけ輪の高さを合わせる。
  const foamPos = [], foamIdx = [], foamY = deck > .5 ? .49 : .04, count = 48;
  for (let i = 0; i <= count; i++) {
    const a = i / count * Math.PI * 2, z = Math.cos(a) * half;
    const x = Math.sign(Math.sin(a)) * widthAt(z) * Math.min(1, Math.abs(Math.sin(a)) * 4);
    for (const rim of [0, .05]) foamPos.push(x + Math.sin(a) * (.07 + rim), foamY, z + Math.cos(a) * (.07 + rim));
    if (i < count) { const k = i * 2; foamIdx.push(k, k+1, k+2, k+1, k+3, k+2); }
  }
  const foamGeo = new THREE.BufferGeometry();
  foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(foamPos, 3));
  foamGeo.setIndex(foamIdx); bags[5].push(foamGeo);
  if (!lo) {
    const wrap = new THREE.TorusGeometry(.16, .025, 4, 10); wrap.rotateX(Math.PI/2);
    for (const side of [-1,1]) for (const z of [-length*.25,length*.25]) {
      const g = wrap.clone(); g.translate(side*widthAt(z), deck+.55+rise*.125, z); bags[3].push(g);
    }
    wrap.dispose();
  }
  // 11/2 舳先の水押（みよし）：船首の反りの先に立つ一本の太い木（和船の輪郭）。
  boatBox(bags[1], 0, rise + deck + .55, half - .05, .12, .9, .16);
  boatBox(bags[2], 0, deck+.065, -.7, width*.52, .04, length*.25);
  // 筵の織り目と縄を掛けた荷。
  if (!lo) for (let i=0;i<12;i++) boatBox(bags[3], 0, deck+.09, -length*.12+i*length*.02, width*.52,.012,.015);
  boatBox(bags[0], 0, deck+.22, length*.29, width*.3,.35,length*.12);
  for (const z of [length*.26,length*.32]) boatBox(bags[3],0,deck+.405,z,width*.31,.025,.04);
}
// 舟の部品は色だけ違う材質なので、頂点の色で二つ（木と黒木／筵・縄・鉄）にまとめる（一艘五回 → 二回。泡は別）
const BOAT_WOOD_V = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const BOAT_LAM_V = new THREE.MeshLambertMaterial({ vertexColors: true });
function finishBoat(model, bags) {
  const mats = [WOOD,DARK,MUSHIRO,ROPE,IRON,FOAM];
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
  for (const [ids, mat] of [[[0, 1], BOAT_WOOD_V], [[2, 3, 4], BOAT_LAM_V]]) {
    const geos = [];
    for (const i of ids) for (const g of bags[i]) geos.push(tint(g, mats[i].color));
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = true; m.receiveShadow = true; model.add(m);
  }
  if (bags[5].length) {
    const m = new THREE.Mesh(mergeGeometries(bags[5],false), FOAM);
    m.castShadow = false; m.receiveShadow = false; model.add(m);
  }
  for (const b of bags) for (const g of b) g.dispose();
}
const BOAT_MODEL = new THREE.Group(), boatParts = Array.from({length:6},()=>[]);
buildBoatHull(boatParts,6.5,1.8,.05,.22);
finishBoat(BOAT_MODEL,boatParts);
// 遠くの舟・船は軽い形で描く（boatInstancer の遠い束）。元の形 → 軽い形
const BOAT_LO = new Map();
function pairLo(model, lo) { model.children.forEach((c, i) => { const l = lo.children[i]; if (c.isMesh && l?.isMesh && c.material === l.material) BOAT_LO.set(c.geometry, l.geometry); }); }
{ const lo = new THREE.Group(), bags = Array.from({length:6},()=>[]); buildBoatHull(bags,6.5,1.8,.05,.22,true); finishBoat(lo,bags); pairLo(BOAT_MODEL, lo); }
// 岸の飾り舟は元の棹付きの形を保つ。
const MOORED_BOAT = BOAT_MODEL.clone();
// 岸に繋いだ舟は進まないので、舳先の泡を付けない（描く回数も一つ減る）
for (const m of [...MOORED_BOAT.children]) if (m.material === FOAM) MOORED_BOAT.remove(m);
const mooredPole = new THREE.Mesh(POLE_GEO, WOOD);
mooredPole.position.set(.55, 1.3, -2); mooredPole.rotation.x = .6; MOORED_BOAT.add(mooredPole);
function riverBoat(x, y, z, rot, moving = false) {
  const m = (moving ? BOAT_MODEL : MOORED_BOAT).clone(); m.position.set(x, y, z); m.rotation.y = rot; return m;
}
// 舟と船の形は、同じ形・同じ材質ごとに一つの束（InstancedMesh）で描く（一艘ずつ二、三回描いていた。長島で四十回ほど）。
//   舟の Group と部品はそのまま動かし（沈む・傾く・櫂も今までどおり）、描く直前に部品の場所を束へ写す。元の部品は描かない
function boatInstancer(rt) {
  const geos = new Set();
  for (const model of [BOAT_MODEL, MOORED_BOAT, ...SHIP_MODELS]) for (const c of model.children) if (c.isMesh) geos.add(c.geometry);
  geos.add(POLE_GEO);
  const B = { map: new Map(), roots: [], n: 0 };
  const scan = () => {
    for (const root of rt.scene.children) {
      if (root.userData.boatSeen || !root.isGroup) continue;
      let hit = false;
      for (const c of root.children) if (c.isMesh && !c.isInstancedMesh && geos.has(c.geometry) && !Array.isArray(c.material)) hit = true;
      if (!hit) continue;
      root.userData.boatSeen = true;
      // 舟の部品の行列は乗員の足場と同じコマの値を読む。景物の固定・結合には渡さない。
      root.userData.noFreeze = true; root.userData.noMerge = true;
      B.roots.push(root);
      for (const c of root.children) {
        if (!c.isMesh || c.isInstancedMesh || !geos.has(c.geometry) || Array.isArray(c.material)) continue;
        const key = c.geometry.uuid + c.material.uuid + (c.castShadow ? 1 : 0);
        let e = B.map.get(key);
        if (!e) { e = { geo: c.geometry, mat: c.material, cast: c.castShadow, recv: c.receiveShadow, list: [], im: null }; B.map.set(key, e); }
        e.list.push(c); c.layers.mask = 0; c.userData.boatInst = true;
      }
    }
    // 影を落とすのはカメラの近くの舟だけ（遠い舟は影の束に入れない）。近い束と遠い束（軽い形）の二つ
    for (const e of B.map.values()) {
      if (e.im && e.im.instanceMatrix.count >= e.list.length) continue;
      for (const im of [e.im, e.imF]) if (im) { rt.scene.remove(im); im.dispose(); }
      const mk = (cast, geo) => { const im = new THREE.InstancedMesh(geo || e.geo, e.mat, Math.max(4, e.list.length + 4)); im.castShadow = cast; im.receiveShadow = e.recv; im.frustumCulled = false; im.userData.noFreeze = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; rt.scene.add(im); return im; };
      e.im = mk(e.cast); e.imF = mk(false, BOAT_LO.get(e.geo));
    }
  };
  const visibleIn = (c) => { if (!c.visible) return false; for (let p = c.parent; p; p = p.parent) { if (!p.visible) return false; if (p === rt.scene) return true; } return false; };
  const before = rt.scene.onBeforeRender;
  rt.scene.onBeforeRender = function (r, sc, cam, t) {
    before.call(this, r, sc, cam, t);
    if ((B.n++ % 60) === 0) scan();
    for (const root of B.roots) if (root.parent === rt.scene) root.updateMatrixWorld(true);
    const cx = cam.position.x, cz = cam.position.z;
    for (const e of B.map.values()) {
      let kn = 0, kf = 0;
      for (const c of e.list) {
        if (!visibleIn(c)) continue;
        const m = c.matrixWorld.elements;
        if ((m[12] - cx) ** 2 + (m[14] - cz) ** 2 < 1600) e.im.setMatrixAt(kn++, c.matrixWorld); else e.imF.setMatrixAt(kf++, c.matrixWorld);
      }
      e.im.count = kn; e.imF.count = kf; e.im.visible = kn > 0; e.imF.visible = kf > 0;
      e.im.instanceMatrix.needsUpdate = true; e.imF.instanceMatrix.needsUpdate = true;
    }
  };
}
// 西の川筋を塞ぐ織田方の小舟の列。川霧の中に並べ、舟ごとに波紋の輪が広がる。
// 舟は共通の小舟（boatInstancer が束にまとめる）、輪と霧は InstancedMesh 一つずつ。毎コマは行列と色だけ書き換える。
const FLEET_N = 9, RIP_K = 2, MIST_N = 8;
let MIST_TEX = null;
function fleetMist(rt) {
  const W = rt.world, F = rt.flags, boats = [];
  const midZ = (x) => CH_Z + (x < -100 ? (-100 - x) * 4 / 140 : 0);
  for (let i = 0; i < FLEET_N; i++) {
    const x = -74 - i * 12.5, z = midZ(x) + Math.sin(i * 2.1) * 1.6;
    const y = waterHeight(W, x, z);
    const m = riverBoat(x, y, z, Math.PI / 2 + Math.sin(i * 1.3) * .12);
    rt.scene.add(m);
    boats.push({ m, x, y, z, ph: i * 1.7 });
  }
  const ringGeo = new THREE.RingGeometry(.9, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), FLEET_N * RIP_K);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rings.frustumCulled = false;
  { const c0 = new THREE.Color(0); for (let i = 0; i < FLEET_N * RIP_K; i++) rings.setColorAt(i, c0); }
  if (!MIST_TEX) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    // 10/29 夜：絵の下端で円が切れ、霧が水平な灰の板に見えた。楕円の縁まで消し、四辺に色を残さない。
    g.translate(64, 34); g.scale(1, .44);
    const gr2 = g.createRadialGradient(0, 0, 2, 0, 0, 62);
    gr2.addColorStop(0, 'rgba(255,255,255,.7)'); gr2.addColorStop(.45, 'rgba(255,255,255,.25)'); gr2.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr2; g.fillRect(-64, -78, 128, 156);
    MIST_TEX = new THREE.CanvasTexture(c);
  }
  const mistGeo = new THREE.PlaneGeometry(1, 1); mistGeo.translate(0, .5, 0);
  const mist = new THREE.InstancedMesh(mistGeo, new THREE.MeshBasicMaterial({ map: MIST_TEX, color: 0xdfe3df, transparent: true, opacity: .42, depthWrite: false }), MIST_N);
  mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mist.frustumCulled = false; mist.renderOrder = 3;
  const puffs = [];
  for (let i = 0; i < MIST_N; i++) {
    const x = -70 - i * 15 + Math.sin(i * 3.3) * 4, z = midZ(x) + Math.sin(i * 1.9) * 3;
    puffs.push({ x, z, y: waterHeight(W, x, z) - .3, w: 30 + 8 * Math.abs(Math.sin(i * 2.7)), h: 5 + 2 * Math.abs(Math.sin(i * 4.1)), ph: i * .9 });
  }
  rt.scene.add(rings, mist);
  F.fleet = { boats, rings, mist, puffs, o: new THREE.Object3D(), c: new THREE.Color() };
}
function fleetTick(rt, dt) {
  const L = rt.flags.fleet; if (!L) return;
  const t = rt.t, o = L.o, c = L.c, cam = rt.camera;
  let k = 0;
  for (const b of L.boats) {
    // 繋いだ舟がわずかに揺れ、舷から輪が広がって消える
    b.m.position.y = b.y + Math.sin(t * 1.3 + b.ph) * .05;
    b.m.rotation.z = Math.sin(t * .9 + b.ph) * .025;
    for (let j = 0; j < RIP_K; j++, k++) {
      const a = ((t * .32 + b.ph * .37 + j / RIP_K) % 1);
      const r = 2.2 + a * 6.5;
      o.position.set(b.x, b.y + .04, b.z); o.rotation.set(0, 0, 0); o.scale.set(r, 1, r * .55); o.updateMatrix();
      L.rings.setMatrixAt(k, o.matrix);
      c.setScalar(.22 * (1 - a) * Math.min(1, a * 6)); L.rings.setColorAt(k, c);
    }
  }
  L.rings.instanceMatrix.needsUpdate = true; if (L.rings.instanceColor) L.rings.instanceColor.needsUpdate = true;
  // 霧は川面を這うように流れ、いつもカメラの方を向く
  for (let i = 0; i < L.puffs.length; i++) {
    const p = L.puffs[i], x = p.x + Math.sin(t * .05 + p.ph) * 4;
    o.position.set(x, p.y, p.z);
    o.rotation.set(0, cam ? Math.atan2(cam.position.x - x, cam.position.z - p.z) : 0, 0);
    o.scale.set(p.w, p.h, 1); o.updateMatrix(); L.mist.setMatrixAt(i, o.matrix);
  }
  L.mist.instanceMatrix.needsUpdate = true;
}
// 11/6 fixc1721：結末の火。岸（z=-14）から見える中江・屋長島の表（物見・番所・長屋・川向きの柵）を三度に分けて燃やす。
//   n=0 は表の物見と番所、1 は長屋と柵の東西、2 は残る物見と柵の中ほど。炎・煙は共通の addBlaze／addFire を使い回す。
const BANK_BLAZES = [
  // 11/7：手前の長島城は降った城なので燃やさない。西の屋長島（x≒48）と、その向こうの中江城（x≒152）の表を燃やす。
  [{ x: 60, z: -60, w: 3, d: 3, h: 7.6, n: 1, size: 4.6 }, { x: 42, z: -73, w: 6, d: 5, h: 3.4, size: 5.5 }, { x: 144, z: -72, w: 3, d: 3, h: 9, n: 1, size: 5.5 }],
  [{ x: 144, z: -84, w: 6, d: 5, h: 3.4, size: 6 }, { fence: [[38, -54], [64, -54]] }, { fence: [[140, -66], [170, -66]] }],
  [{ x: 40, z: -86, w: 3, d: 3, h: 7.6, n: 1, size: 4.6 }, { x: 152, z: -102, w: 12, d: 8, h: 4.5, size: 7 }, { x: 166, z: -110, w: 3, d: 3, h: 9, n: 1, size: 5.5 }],
];
function bankBlazes(rt, n) {
  const W = rt.world, F = rt.flags;
  F.bankBlazes = F.bankBlazes || [];
  for (const b of BANK_BLAZES[n] || []) {
    if (b.fence) {
      const [[ax, az], [bx, bz]] = b.fence;
      for (let k = 0; k < 5; k++) {   // 11/8 柵も燃えて見えるよう五つ・大きく（critic60 長島 四6）
        const t = (k + .5) / 5, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        F.bankBlazes.push({ stop: ((f) => () => W.removeFire(f))(W.addFire(x, z, { size: 3.2 + (k % 2) * .7, h: .3, smoke: k % 2 === 0, blackSmoke: true })) });
        W.addScorch(x, z, 4, 2);
      }
    } else {
      F.bankBlazes.push(W.addBlaze(b.x, b.z, { w: b.w, d: b.d, h: b.h, n: b.n, size: b.size }));
      W.addScorch(b.x, b.z, b.w, b.d);
    }
  }
}
// 11/6 fixc1721：描いて遊ぶと、味方の槍組（本人の組・柴田の手）が岸の先の川へ腰まで入って並び、舟を追って水の中で立っていた（「川は渡らない」・一8）。
//   味方の徒の兵（舟の上の者と本人は除く）は、行き先か足元が岸の柵より川側なら柵の内へ戻す（公記の「柵の内で受け止める」）。
//   間近（共通の cover で 2.6m）の敵だけは払う。横木を結う人足など、ほかの持ち場（cover）にいる者は触らない。
const BANK_EDGE = new Map();
function bankEdgeZ(W, x) {
  const k = Math.round(x / 2);
  let z = BANK_EDGE.get(k);
  if (z === undefined) { z = -8; while (z > -40 && W.waterDepthAt(k * 2, z - .5) <= .05) z -= .5; BANK_EDGE.set(k, z); }
  return z;
}
function allyBankGuard(rt, dt) {
  const F = rt.flags, A = rt.army, W = rt.world;
  // 輪中へ攻め入る段では、堤を進む味方を旧持ち場へ引き戻さない。
  if (F.adv) return;
  F.bankGuardT = (F.bankGuardT || 0) - dt;
  if (F.bankGuardT > 0) return;
  F.bankGuardT = .4;
  for (const u of A.units) {
    if (u.team !== 0 || !u.alive || u.isPlayer || u.perch || u.mounted || u.fleeing || u.gone) continue;
    if (Math.abs(u.pos.x) > 70 || u.pos.z > -10 || u.pos.z < -45) continue;
    if (u.cover && u.cover !== u._bankCover && u.cover.t > A.time) continue;
    const to = u.moveTo;
    // 11/7（critic60「柵の内で守れなのに味方が柵の外の水際に並ぶ」）：岸の柵（z≒BANK_Z）より陸側に一歩余り下げる。
    const lim = (x) => Math.max(bankEdgeZ(W, x) + 1.2, BANK_Z + 1.2);
    const wet = u.pos.z < lim(u.pos.x) - .3 || to && to !== u._bankCover && to.z < lim(to.x) - .3;
    if (!wet) continue;
    const c = u._bankCover || (u._bankCover = { x: 0, z: 0, t: 0 });
    const x = to && to !== c ? to.x : u.pos.x;
    c.x = Math.max(-68, Math.min(68, x)); c.z = lim(c.x) + .4; c.t = A.time + 1.2;
    u.cover = c;
  }
}
// 待機中の鉄砲衆を、川へ出さず同じ岸の持ち場で動かす。
function bankTeppoPatrol(rt) {
  const F = rt.flags, g = F.teppo;
  if (!g || F.step >= 2 && !F.adv || F.ending || F.advEnding || rt.t < (F.teppoPatrolAt || 0)) return;
  F.teppoPatrolAt = rt.t + 1;
  // 射撃禁止中に覚えている対岸の敵だけでは、見回りを止めない。
  // 実際の射撃・装填と、射程内で戦える相手への構えは妨げない。
  // 降伏して狙いから外れた者や射程外の敵を覚えているだけなら、見回りへ戻す。
  if (g.units.some(u => {
    if (!bankFighterReady(u)) return false;
    if (u.atk || u.reload) return true;
    const target = u.target;
    return g.fire && target?.team !== u.team && bankFighterReady(target) &&
      !target.noTarget && !target.civ && !target.downed &&
      (target.pos.x - u.pos.x) ** 2 + (target.pos.z - u.pos.z) ** 2 <= u.range ** 2;
  })) return;
  F.teppoPatrolSide = -(F.teppoPatrolSide || -1);
  g.anchor.x = 34 + F.teppoPatrolSide * 4;
  F.teppoPatrolAt = rt.t + 4;
}
// 描画済みの川面と同じ水深に舟を浮かべる。毎コマの計算で物を作らない。
function waterHeight(W, x, z) {
  return W.heightAt(x, z) + W.waterDepthAt(x, z);
}

// 歩いた距離で左右の足を交互に出す。止まった時・橋や舟の上では出さない。
// 粒と波紋は共通の固定枠を使い、毎コマ形や材質を増やさない。
function shoreFootTick(rt) {
  const F = rt.flags, u = rt.player.u, W = rt.world;
  const moved = Math.hypot(u.pos.x - F.wadeX, u.pos.z - F.wadeZ);
  F.wadeX = u.pos.x; F.wadeZ = u.pos.z;
  if (!u.alive || u.mounted || u.perch || u.climb || moved < .001 || moved > 2 || W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) <= .02) {
    F.wadeDist = 0; return;
  }
  F.wadeDist += moved;
  if (F.wadeDist < .65) return;
  F.wadeDist %= .65; F.wadeSide = -F.wadeSide;
  const x = u.pos.x + Math.cos(u.heading) * F.wadeSide * .22;
  const z = u.pos.z - Math.sin(u.heading) * F.wadeSide * .22;
  if (W.waterFootDepthAt(x, z, u.pos.y) > .02) W.spray(x, z, 7);
}

// 岸の足運び。八秒ごとの一斉再生ではなく、押し合い・走り・敗走の実際の歩幅を拾う。
// 近い兵だけを八分の一秒ごとに調べ、粒は一回二人まで、共通の固定枠へ戻す。
function bankFootTick(rt) {
  const F = rt.flags, W = rt.world, units = rt.army.units;
  if (F.step < 3 || F.step > 3.5 || F.ending || rt.t < (F.bankFootAt || 0)) return;
  F.bankFootAt = rt.t + .125;
  let emitted = 0;
  const start = F.bankFootCursor || 0;
  F.bankFootCursor = (start + 1) % Math.max(1, units.length);
  for (let i = 0; i < units.length; i++) {
    const u = units[(start + i) % units.length];
    if (u.isPlayer || !u.alive || u.noTarget || u.mounted || u.perch || u.climb || u.shoreWaiting ||
        u.boatSeat?.aboard || u.woundOut || u.rearWound || u.downed || u.camD > 38) {
      u.bankFootX = undefined; continue;
    }
    if (u.bankFootX === undefined) {
      u.bankFootX = u.pos.x; u.bankFootZ = u.pos.z;
      u.bankFootDist = (u.id * .618 % 1) * .4; u.bankFootSide = 1;
      continue;
    }
    const dx = u.pos.x - u.bankFootX, dz = u.pos.z - u.bankFootZ, moved = Math.hypot(dx, dz);
    u.bankFootX = u.pos.x; u.bankFootZ = u.pos.z;
    if (moved > 2 || u.moving < .12) { u.bankFootDist = 0; continue; }
    if (moved < .001) continue;
    const stride = .48 + (u.id % 5) * .045 + (u.fleeing ? .12 : 0);
    u.bankFootDist += moved;
    if (u.bankFootDist < stride) continue;
    u.bankFootDist %= stride; u.bankFootSide = -u.bankFootSide;
    if (emitted >= 2) continue;
    emitted++;
    const x = u.pos.x + Math.cos(u.heading) * u.bankFootSide * .18;
    const z = u.pos.z - Math.sin(u.heading) * u.bankFootSide * .18;
    const wet = W.waterFootDepthAt(x, z, u.pos.y) > .02;
    if (!reduceMotion()) {
      if (wet) W.spray(x, z, 2);
      else if (W.def.muddy || W.wetness > .5 || W.rainLevel > .4) W.kick(x, z, dx / moved, dz / moved, 2, 3);
      else {
        const p = W.dustCloud(x, z, false, true);
        if (p) { p.s0 *= .5; p.s1 *= .45; p.a *= .65; p.life *= .5; p.rise *= .35; }
      }
    }
    if (rt.t >= (F.bankStepAt || 0)) {
      F.bankStepAt = rt.t + .24;
      rt.army.play(wet ? 'stepWet' : 'step', u.pos, u.fleeing ? .45 : .3);
    }
    const g = u.group;
    if (g?.sallyReleased && rt.t >= (F.bankVoiceAt || 0)) {
      if (u.fleeing && !g.nagaFlee) {
        g.nagaFlee = true; F.bankVoiceAt = rt.t + 4;
        rt.army.play('soldier_flee', u.pos, .55);
      } else if (!u.fleeing && !g.routed && !g.nagaToki) {
        g.nagaToki = true; F.bankVoiceAt = rt.t + 4;
        rt.army.play('toki', u.pos, .65);
      }
    }
  }
}

let HOOD_UNIT = null;
const HOOD_MAT = new THREE.MeshLambertMaterial({ color: 0xd8d2bc, side: THREE.DoubleSide });
const BAMBOO_MAT = new THREE.MeshLambertMaterial({ color: 0x787249 });
const BLADE_MAT = new THREE.MeshLambertMaterial({ color: 0x858b89, side: THREE.DoubleSide });
// 顔は開け、頭から肩へ落ちる一枚の布にする。形は全員で共有する。
const hoodCap = new THREE.SphereGeometry(.17, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2);
hoodCap.scale(1, .55, .95); hoodCap.translate(0, 1.65, -.025);
const hoodDrape = new THREE.CylinderGeometry(.17, .21, .34, 10, 3, true, Math.PI / 2, Math.PI);
const hoodVerts = hoodDrape.attributes.position;
for (let i = 0; i < hoodVerts.count; i++) {
  const x = hoodVerts.getX(i), z = hoodVerts.getZ(i), down = (.17 - hoodVerts.getY(i)) / .34;
  const fold = 1 + .06 * down * Math.cos(Math.atan2(x, z) * 6);
  hoodVerts.setXYZ(i, x * fold, hoodVerts.getY(i) + 1.48, z * fold - .025);
}
hoodDrape.computeVertexNormals();
const HOOD_PARTS = [hoodCap, hoodDrape];
const HOOD_GEO = mergeGeometries(HOOD_PARTS, false);
for (const g of HOOD_PARTS) g.dispose();
// 門徒の得物と裹頭は兵の材質（頂点の色）の形にして、兵の束（Army.batchDraw）で描く（一人一、二回ずつ描いていた）
function monToWeapon(kind) {
  const root = new THREE.Group(), length = kind === 2 ? .65 : 2.4;
  const shaft = new THREE.CylinderGeometry(.018, .026, length, 6);
  shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, length / 2 - .2);
  const parts = [];
  if (kind === 0) {
    const joint = new THREE.TorusGeometry(.027, .006, 3, 6); joint.rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(.025, .25, 4); tip.rotateX(Math.PI / 2); tip.translate(0, 0, length - .1);
    parts.push(P(shaft.toNonIndexed(), 0x787249, { mk: MK.wood }));
    for (let i = 0; i < 6; i++) parts.push(P(joint.clone().translate(0, 0, i * .36).toNonIndexed(), 0x787249, { mk: MK.wood }));
    parts.push(P(tip.toNonIndexed(), 0x787249, { mk: MK.wood }));
  } else {
    const shape = new THREE.Shape();
    if (kind === 2) { shape.moveTo(0, 0); shape.lineTo(.36, -.04); shape.quadraticCurveTo(.27, .08, 0, .08); }
    else { shape.moveTo(0, 0); shape.lineTo(.045, .35); shape.quadraticCurveTo(.16, .62, .11, .68); shape.quadraticCurveTo(.025, .49, -.035, .1); }
    const blade = new THREE.ShapeGeometry(shape, 5); blade.rotateX(Math.PI / 2); blade.translate(0, 0, length - .2);
    // 刃は薄い板なので、裏の面も足す（兵の材質は片面）
    const back = blade.clone(); back.scale(1, -1, 1); const bi = back.index.array; for (let i = 0; i < bi.length; i += 3) { const t = bi[i]; bi[i] = bi[i + 1]; bi[i + 1] = t; }
    back.computeVertexNormals();
    parts.push(P(shaft.toNonIndexed(), 0x5a4632, { mk: MK.wood }), P(blade.toNonIndexed(), 0x858b89, { mk: MK.iron }), P(back.toNonIndexed(), 0x858b89, { mk: MK.iron }));
  }
  root.add(new THREE.Mesh(mergeGeometries(parts, false), MAT));
  return root;
}
const MONTO_WEAPONS = [monToWeapon(0), monToWeapon(1), monToWeapon(2)];
// bare：退城の斬り込みは公記巻七の「裸にて抜刀」。頭巾と竹槍・薙刀に替えず、抜き身の刀のまま。
function dressMonTo(g, bare = false) {
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i], kind = i % 5;
    // 11/8 critic60 長島（史実）：三か月の兵糧攻めで飢えた門徒。肩と胴を細くする（高さはそのまま）。
    u.mesh?.scale.set(.86 + (i % 3) * .02, 1, .86 + (i % 3) * .02);
    if (bare) continue;
    if (kind === 0 || kind === 1) u.head.add(new THREE.Mesh(HOOD_UNIT || (HOOD_UNIT = P(HOOD_GEO.clone().toNonIndexed(), 0xd8d2bc, { mk: MK.cloth })), MAT));
    if (u.wpn && kind < 3) {
      // 共通の構えと当たりは槍・刀のまま、描く武器だけをこの戦で替える。
      u.wpn.geometry = EMPTY_WEAPON; u.wpn.material = WOOD; u.wpn.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; u.wpn.userData.lod = null; u.wpn.userData.flex = null;
      for (const child of u.wpn.children) child.visible = false;
      u.wpn.material = NO_DRAW;   // 空の形を一人一回ずつ描かない（子の竹槍・薙刀は描く）
      u.wpn.add(MONTO_WEAPONS[kind].clone());
    }
  }
}
const EMPTY_WEAPON = new THREE.BufferGeometry();
const NO_DRAW = new THREE.MeshBasicMaterial({ visible: false });
EMPTY_WEAPON.setAttribute('position', new THREE.Float32BufferAttribute([], 3));

// 九艘・各五人を開戦時から置く。乗船中だけ舟に固定し、岸へ着いた同じ兵が反撃する。
function retreatBoats(rt) {
  const F = rt.flags;
  F.boats = []; F.last = [];
  // 11/7（critic60「三分で終わる」）：四手目（東の四艘・二十人）を足す。後の舟を受けた後にもう一度寄せ、斬り込みを三度のぶつかりにする（公記「七、八百」）。
  for (let k = 0; k < 4; k++) {
    // 11/6 fixc2220（critic60「八百のはずが二十人ほど」）：前の二手は四艘・二十人、後の舟は五艘・三十人（六人乗り）で、十三艘・七十人に増やす（本物の兵は二十五人増える）。着岸口は柵前へ寄せる。西の先陣も味方の槍が届く所で受ける。
    const frontX = k === 3 ? -26 : k === 2 ? 14 : (k - 1) * 12, nBoat = k === 2 ? 5 : 4, per = k === 2 ? 6 : 5;
    const g = enemyGroup(rt, { fixed: true, faction: 'ikko', name: '退城した門徒',
      anchor: { x: frontX, z: -44 }, facing: 0, formation: 'column', colW: 3,
      order: 'hold', aggro: 0, seekRange: 0, morale: 60, noRout: true, fire: false, historicalOrders: true,
      fleeDir: { x: k === 0 || k === 3 ? -1 : 1, z: 0.4 } },
      // 刀で斬り込む強さは保つ。11/6 fixc2220：死に物狂いの斬り込み（公記「数多討死」）が一太刀二太刀で崩れ、斬り合いが一分で終わっていた。体力を五割増しに。
      dress(Array.from({ length: nBoat * per }, (_, i) => ({ type: 'samurai', n: 1, o: { hp: 50, maxHp: 50, ...(k === 2 && i === 0 ? { name: '門徒の旗頭', flagScale: 1.8 } : {}), kosode: 1, kosodeCol: [0x9a7456, 0x8c6a4f, 0xa27b5b][i % 3], cloth: [0x8c6a4f, 0x9a7456, 0x93704f][i % 3], obi: 1, face: { ...HUNGRY_FACE, t: i % 7 }, skin: 0x9a7456, hat: i % 5 === 3 ? 'none' : 'hachimaki', flag: k === 2 && i === 0 || i % 5 === 4 ? 'namu' : null, weapon: i % 5 === 4 ? 'spear' : 'sword', spear: 'su', horse: false, sode: false, kote: 0, menpo: 0 } })), IKKO));
    F.last.push(g);
    if (k === 2) { F.sallyBoss = g.units[0]; g.leader = F.sallyBoss; }
    dressMonTo(g, true);
    for (let j = 0; j < nBoat; j++) {
      const x = frontX + (j - (nBoat - 1) / 2) * (k === 2 ? 3 : 3.2), z = k === 3 ? -36 : -42; // 四手目は東の深い筋に浮かべる（z=-42 の東は干上がった洲）
      const m = riverBoat(x, waterHeight(rt.world, x, z), z, 0, true);
      const pole = new THREE.Mesh(POLE_GEO, WOOD); pole.position.set(.55, 1.3, -2); m.add(pole);
      // 11/10 重さ：舟の影は一枚ずつ描かず、全部の舟で一つの束（F.boatShadows）に写す。ここは位置と見える見えないの入れ物
      const shadow = new THREE.Object3D(); shadow.scale.set(1.1, 1, 3.4);
      const bt = { m, pole, shadow, x, z, group: g, second: k >= 2, third: k === 3, landed: false, passengers: [], hull: [], holes: 0, flood: 0, breath: 0 };
      // 舷の線だけ矢玉を止める。船内を箱でふさいで乗員を守らない。
      for (const side of [-1, 1]) {
        const h = solidSeg(x + side * .72, z - 2.8, x + side * .72, z + 2.8, .05);
        h.naka = -1; h.missileType = 'wood'; h.boat = bt; bt.hull.push(h);
      }
      for (let i = 0; i < per; i++) {
        const u = g.units[j * per + i];
        const at = { x: x + (i % 2 ? 0.3 : -0.3), y: m.position.y + .1, z: z - 2.2 + i * (per > 5 ? .85 : .9) };
        u.perch = at; u.pinT = Infinity; u.noTarget = true; u._crouch = true;
        const q = { u, at, dx: at.x - x, dz: at.z - z, seatZ: at.z - z, aboard: true, escape: false, shore: { x, z: BANK_Z - 3 }, returnDir: { x: 0, z: 1 } };
        u.retreatBoat = bt; u.boatSeat = q; bt.passengers.push(q);
      }
      rt.scene.add(m); bt.si = F.boats.length; F.boats.push(bt);
    }
  }
  const sh = F.boatShadows = new THREE.InstancedMesh(BOAT_SHADOW_GEO, BOAT_SHADOW_MAT, F.boats.length);
  sh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sh.frustumCulled = false; sh.userData.noFreeze = sh.userData.noMerge = true;
  for (const bt of F.boats) { bt.shadow.position.set(bt.x, -999, bt.z); bt.shadow.updateMatrix(); sh.setMatrixAt(bt.si, bt.shadow.matrix); }
  rt.scene.add(sh);
}
// critic60「同じ文を五〜七秒おきに三回」：同じ下知は十五秒に一度まで（ui-guidelines は八秒）。
function sayGap(rt, who, text, dur, gap = 15) {
  const F = rt.flags; F.saidAt ||= {};
  if (rt.t - (F.saidAt[text] ?? -1e9) < gap) return;
  F.saidAt[text] = rt.t; rt.say(who, text, dur);
}
function nearTroops(rt, g) {
  const p = rt.player.u.pos;
  for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 35 && sightUnit(rt, u)) return true;
  return false;
}
// 舟に残る負傷者も同じ舟で運ぶが、自力の操船・乗り降りはさせない。
// 敗走した元気な者は漕いで退けるため、隊の士気とは分ける。
function boatPassengerReady(u) {
  return !!u?.alive && u.hp > 0 && !u.dying && !u.gone &&
    !u.woundOut && !u.rearWound && !u.downed;
}
function boatTick(rt, dt) {
  const F = rt.flags;
  for (const bt of F.boats) {
    const prevX = bt.x, prevZ = bt.z;
    let pilot = null, aboard = 0, escaping = false;
    for (const q of bt.passengers) {
      const u = q.u;
      // 敗走の共通処理は近い敵から離れるため、川へ走り出すことがある。
      // 岸で舟の前へ回ってから乗り直す。舟を失った者は岸沿いに退く。
      // 向きの入れ物は乗船時に用意し、位置や足運びは共通処理に任せる。
      if (!q.aboard && boatPassengerReady(u) && u.fleeing) {
        const dir = q.returnDir;
        if (bt.landed && bt.z >= -21 && bt.flood < .2) {
          dir.x = bt.x - u.pos.x;
          dir.z = (Math.abs(dir.x) > 2 ? Math.max(BANK_Z + 2, u.pos.z) : BANK_Z - 3) - u.pos.z;
        } else {
          dir.x = bt.x < 0 ? -1 : 1;
          dir.z = Math.max(.6, BANK_Z + 3 - u.pos.z);
        }
        const length = Math.hypot(dir.x, dir.z) || 1;
        dir.x /= length; dir.z /= length;
        u.moraleFleeDir = dir;
      }
      // 岸で退いた同じ兵が、空いた元の舟へ戻る。泳いで分流を越えさせない。
      if (!q.aboard && boatPassengerReady(u) && u.fleeing && bt.landed && bt.z >= -21 && bt.flood < .2 &&
          Math.hypot(u.pos.x - bt.x, u.pos.z - (BANK_Z - 3)) < 3) {
        q.aboard = q.escape = true; q.dz = 2.7; u.perch = q.at; u.pinT = Infinity; u.fleeing = false;
        if (u.moraleFleeDir === q.returnDir) u.moraleFleeDir = null;
      }
      if (!q.aboard) continue;
      // 舟上で隊が崩れた者も退く。下の乗船姿勢で fleeing を戻しても、退城へ戻った覚えは残す。
      if (u.alive && (u.fleeing || bt.group.routed)) q.escape = true;
      if (boatPassengerReady(u)) { aboard++; if (!pilot) pilot = q; }
      if (q.escape && u.alive) escaping = true;
    }
    // 同じ舟に残る者も一緒に退く。退く舟の同乗者を、岸へ寄せる敵に数え続けない。
    if (escaping) for (const q of bt.passengers) if (q.aboard) q.escape = true;
    if (F.step >= 2 && (!bt.second || F.rearBoatAt != null) && (!bt.third || F.thirdBoatAt != null) && !bt.landed && pilot && !escaping && bt.flood < .4) bt.z = Math.min(BOAT_LAND_Z, bt.z + dt * 1.5);
    // 漕ぎ手を失った舟・退く舟は川筋へ戻り、流れに沿う。流向と速さは復元の目安。
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z > CH_Z) bt.z = Math.max(CH_Z, bt.z - dt * .65);
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z <= CH_Z) bt.x += dt * .45;
    bt.flood = Math.min(1.6, bt.flood + bt.holes * .0015 * dt);
    const water = waterHeight(rt.world, bt.x, bt.z), bed = rt.world.heightAt(bt.x, bt.z);
    // 11/8 critic60 長島（一8・八1）：着いた舟を岸の斜面の上へ持ち上げず、水際の高さで止める（舟が地面から斜めに立ち上がって見えた）
    bt.m.position.set(bt.x, bt.landed ? Math.max(water - .15, Math.min(bed, water + .2)) : Math.max(bed, water - bt.flood - .15), bt.z); // 船底を水に沈め、揺れても浮いて見せない
    if (F.step < 2) bt.m.position.x += Math.sin(rt.t * .22 + bt.x) * .7;
    bt.shadow.position.set(bt.m.position.x, water + .025, bt.z); bt.shadow.visible = !bt.landed && bt.flood < .8;
    if (F.boatShadows) { bt.shadow.position.y = bt.shadow.visible ? water + .025 : -999; bt.shadow.updateMatrix(); F.boatShadows.setMatrixAt(bt.si, bt.shadow.matrix); F.boatShadows.instanceMatrix.needsUpdate = true; }
    bt.m.rotation.z = bt.landed ? 0 : Math.min(.3, bt.flood * .2) + Math.sin(rt.t * 1.7 + bt.x) * .025;
    bt.pole.visible = !!pilot && bt.flood < .4 && !bt.landed;
    bt.pole.rotation.x = .35 + Math.sin(rt.t * 2.4) * .4;
    // 実際に棹で進む舟からだけ鳴らす。全舟で間隔を共有し、音を重ねすぎない。
    if (!F.ending && bt.pole.visible && (bt.x !== prevX || bt.z !== prevZ) && rt.t >= (F.poleSoundAt ?? 0)) {
      F.poleSoundAt = rt.t + 3;
      rt.army.play('boatPole', bt.m.position, .65);
    }
    for (let i = 0; i < bt.hull.length; i++) {
      const h = bt.hull[i], x = bt.m.position.x + (i ? .72 : -.72);
      h.ax = h.bx = x; h.az = bt.z - 2.8; h.bz = bt.z + 2.8;
      h.x0 = x - .05; h.x1 = x + .05; h.z0 = h.az - .05; h.z1 = h.bz + .05;
      h.yBot = bt.m.position.y; h.yTop = h.yBot + .5;
    }
    for (const q of bt.passengers) {
      const u = q.u;
      if (!q.aboard || u.gone) continue;
      const ready = boatPassengerReady(u);
      const previousZ = q.dz;
      // 退く者は船首から元の席へ進む。五人を同じ船首の一点に留めない。
      if (q.escape && ready) q.dz = Math.max(q.seatZ, q.dz - dt * 1.2);
      if (ready && !q.escape && bt.z >= BOAT_LAND_Z && bt.group.sallyReleased && !u.shoreWaiting) q.dz = Math.min(LANDING_DZ, q.dz + dt * 1.2);
      // 細くなる船首では中央へ寄る。舟の傾きに足を合わせ、岸へは高さを続けて移す。
      const landing = !q.escape && bt.landed ? Math.max(0, Math.min(1, (q.dz - 2.5) / (LANDING_DZ - 2.5))) : 0;
      // 船首では中央へ寄り、岸へ降りる時は元の左右へ足場を開く。一点で兵の胴を重ねない。
      const dx = q.dx * Math.max(landing, 1 - (Math.max(0, q.dz) / 3.25) ** 2, 0), roll = bt.m.rotation.z;
      q.at.x = bt.m.position.x + dx * Math.cos(roll) - .1 * Math.sin(roll); q.at.z = bt.z + q.dz;
      const deckY = bt.m.position.y + dx * Math.sin(roll) + .1 * Math.cos(roll);
      const groundY = landing > 0 ? rt.world.heightAt(q.at.x, q.at.z) : deckY;
      q.at.y = Math.max(groundY, deckY + (groundY - deckY) * landing);
      if (u.alive) {
        // 射撃後の反撃では、着岸した舟の上でも刀・槍を使える。
        const fighting = ready && bt.group.sallyReleased && bt.landed && !q.escape && !u.shoreWaiting;
        u.perch = q.at; u.pinT = fighting ? 0 : Infinity; u.fleeing = false;
        if (ready) u._crouch = !fighting && q !== pilot;
        if (fighting && u.wpn) u.wpn.visible = true;
      }
      u.pos.set(q.at.x, q.at.y, q.at.z);
      if (u.alive) {
        u.moving = dt > 0 ? Math.abs(q.dz - previousZ) / dt : 0; u.vel.x = u.vel.z = 0;
        // 舟に固定した位置は保ち、上陸中だけ足を交互に運ぶ。操船中は足踏みしない。
        if (u.moving > 0 && !u.hit && !u.downed && u.legL && u.legR) {
          const step = Math.sin(rt.t * 7 + u.id) * .38;
          u.legL.rotation.x = step; u.legR.rotation.x = -step;
          if (u.shinL && u.shinR) { u.shinL.rotation.x = Math.max(0, -step); u.shinR.rotation.x = Math.max(0, step); }
        }
      }
      // 遺体も甲板と一緒に運ぶ。共通の倒れる姿勢は保つ。
      u.mesh.position.x = u.pos.x; u.mesh.position.z = u.pos.z; u.mesh.position.y = u.pos.y - (u.alive ? 0 : .1);
      if (ready && q.dz >= LANDING_DZ && bt.landed && !q.escape &&
          rt.world.waterDepthAt(u.pos.x, u.pos.z) <= (rt.world.def.wadeDepth ?? .85)) {
        q.aboard = false; u.perch = null; u.pinT = 0; u._crouch = false;
        if (u.wpn) u.wpn.visible = true;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        u.mesh.position.y = u.pos.y;
        // 乗船前の対岸へ戻されないよう、深みを避ける時の足場も上陸地点へ渡す。
        u._riverX = u.pos.x; u._riverZ = u.pos.z;
      }
      // 舷が沈み、足も届かない場合だけ息が続かなくなる。浅い水では溺死させない。
      if (u.alive && bt.flood > .8 && water - bed > 1.6) {
        q.breath = (q.breath || 0) + dt;
        if (q.breath > 20) rt.army.kill(u, null);
      } else q.breath = 0;
      if (q.escape && Math.abs(bt.x) > 170 && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 100 && !sightPoint(rt, u.pos)) {
        rt.army.despawn(u); q.aboard = false;
      }
    }
    if (bt.z >= BOAT_LAND_Z) bt.landed = true;
    // 操船中だけ両手を棹へ向ける。上陸後の刀の構えを上書きしない。
    if (pilot && bt.pole.visible) {
      const u = pilot.u;
      bt.pole.position.set(pilot.dx + .4, 1.3, pilot.dz + .35);
      if (u.hand) { u.hand.position.set(.4, 1.1, .35); u.hand.rotation.set(-bt.pole.rotation.x, 0, 0); poseArms(u, rt.t); }
      if (u.wpn) u.wpn.visible = false;
    }
  }
}

// 杭・横木・縄は準備時に作る。三つの短い区間を順に結い、完成形を一度に出さない。
const WORK_POST = new THREE.CylinderGeometry(.12, .14, 1.8, 9);
const WORK_RAIL = new THREE.CylinderGeometry(.09, .1, 1, 7);
WORK_RAIL.rotateZ(Math.PI / 2);
// 木肌の絵へ暗い茶色を二重に掛けず、乾いた横木と削り口の明るさを残す。
WORK_RAIL.setAttribute('color', new THREE.BufferAttribute(new Float32Array(WORK_RAIL.attributes.position.count * 3).fill(.65), 3));
const postVerts = WORK_POST.attributes.position;
for (let i=0;i<postVerts.count;i++) if (postVerts.getY(i) > .7) postVerts.setY(i, postVerts.getY(i) + postVerts.getX(i)*1.3);
WORK_POST.computeVertexNormals();
const BARK = new THREE.MeshLambertMaterial({ color: 0x9b907b });
const WORK_WOOD_V = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const BARK_LINE = new THREE.CylinderGeometry(.009,.015,1,4);
const BARK_KNOT = new THREE.TorusGeometry(.04,.012,4,7);
const WORK_ROPE = new THREE.CylinderGeometry(.16, .16, .1, 6, 1, true);
function workFence(W, seg) {
  const m = new THREE.Group(), rails = [], posts = [], bark = [], len = seg[2] - seg[0];
  // 地面の横木を後で持ち上げる。静止物へ結合すると、古い位置の材が残ることがある。
  m.userData.noFreeze = true; m.userData.noMerge = true;
  // 岸の仮柵は目より低くし、杭の間から舟を見張れるようにする。守りの当たりと強さは保つ。
  const spacing = .9, count = Math.floor((len + .01) / spacing) + 1;
  const knots = new THREE.InstancedMesh(WORK_ROPE, ROPE, count * 6), at = new THREE.Object3D();
  let n = 0;
  for (let x = seg[0]; x <= seg[2] + .01; x += spacing) {
    const y = W.heightAt(x, seg[1]), tilt = Math.sin(x * 3.7) * .07;
    const post = WORK_POST.clone(); const thick = .8 + .25 * (1 + Math.sin(x * 4.3));
    const postHeight = .92 + .08 * Math.sin(x * 2.1), postY = y + .9 * postHeight - .18;
    // 背の低い杭も根元を土へ打ち込む。縮めた後に同じ高さへ置くと宙に浮く。
    post.scale(thick, postHeight, thick);
    post.rotateY(x*2.3);
    for (let j=0;j<5;j++) {
      const angle = j*Math.PI*2/5+x, g = BARK_LINE.clone();
      g.scale(1,.9+.35*Math.sin(x+j),1); g.translate(Math.cos(angle)*.13*thick,.15*Math.sin(x+j),Math.sin(angle)*.13*thick);
      g.rotateZ(tilt); g.translate(x,postY,seg[1]); bark.push(g);
    }
    const knot = BARK_KNOT.clone(); knot.scale(1,1.5,1); knot.translate(0,.3*Math.sin(x),.14*thick);
    knot.rotateZ(tilt); knot.translate(x,postY,seg[1]); bark.push(knot);
    const split = ROOM_BOX.clone(); split.scale(.012,.24,.12); split.rotateZ(.25*Math.sin(x));
    split.translate(0,.73,0); split.rotateZ(tilt); split.translate(x,postY,seg[1]); bark.push(split);
    post.rotateZ(tilt); post.translate(x, postY, seg[1]); posts.push(post);
    for (const h of [.6, 1.25]) for (let turn = 0; turn < 3; turn++) {
      at.position.set(x - Math.sin(tilt) * h, y + h + turn * .06, seg[1]);
      at.rotation.set(0, 0, tilt + .1 * Math.sin(x)); at.scale.set(thick, .5, thick);
      at.updateMatrix(); knots.setMatrixAt(n++, at.matrix);
    }
  }
  BARK.map = woodTex();
  m.add(new THREE.Mesh(mergeGeometries(bark,false),BARK));
  for (const g of bark) g.dispose();
  const mudParts = [];
  for (let x = seg[0]; x <= seg[2]; x += .8) {
    const g = WORK_POST.clone(); g.scale(1.06, .1 + .06 * Math.abs(Math.sin(x * 4)), 1.06);
    g.rotateZ(Math.sin(x * 3.7) * .07); g.translate(x, W.heightAt(x, seg[1]) + .12, seg[1]); mudParts.push(g);
  }
  // 杭と根元の泥は同じ木の絵の材質なので、頂点の色で塗り分けて一つの形にする（描く回数を一つ減らす）
  const tintAll = (list, hex, cutHex = hex) => {
    const c = new THREE.Color(hex), cut = new THREE.Color(cutHex);
    for (const g of list) {
      const n = g.attributes.position.count, a = new Float32Array(n * 3), normal = g.attributes.normal;
      for (let i = 0; i < n; i++) (normal.getY(i) > .7 ? cut : c).toArray(a, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
  };
  tintAll(posts, 0xc3b69d, 0xe3d3ad); tintAll(mudParts, 0x82705a);
  { const mp = WOOD.map || woodTex(); if (WORK_WOOD_V.map !== mp) { WORK_WOOD_V.map = mp; WORK_WOOD_V.needsUpdate = true; } }
  m.add(new THREE.Mesh(mergeGeometries([...posts, ...mudParts], false), WORK_WOOD_V));
  for (const g of mudParts) g.dispose();
  for (const g of posts) g.dispose();
  knots.count = 0; knots.instanceMatrix.needsUpdate = true; m.add(knots);
  // 二本の横木は一つの束で描く（動かすのは今までどおり rail の位置・向き・長さ。fenceProgress が束へ写す）
  const railIM = new THREE.InstancedMesh(WORK_RAIL, WORK_WOOD_V, 2); m.add(railIM);
  for (const h of [.6, 1.25]) {
    const rail = new THREE.Object3D();
    const x = (seg[0] + seg[2]) / 2, looseZ = seg[1] + (h < 1 ? 1.3 : 1.8);
    // 横木の両端も地面に合わせる。長い材が盛り土へ埋もれないようにする。
    const leftY = W.heightAt(seg[0], looseZ), rightY = W.heightAt(seg[2], looseZ);
    const looseAngle = Math.atan2(rightY - leftY, len);
    const tiedDy = W.heightAt(seg[2], seg[1]) - W.heightAt(seg[0], seg[1]);
    rail.scale.x = Math.hypot(len, rightY - leftY); rail.rotation.z = looseAngle;
    rail.position.set(x, Math.max(W.heightAt(x, looseZ), (leftY + rightY) / 2) + .16, looseZ);
    rails.push({ mesh: rail, base: (W.heightAt(seg[0], seg[1]) + W.heightAt(seg[2], seg[1])) / 2,
      looseY: rail.position.y, looseZ, looseAngle, looseLen: rail.scale.x,
      tiedAngle: Math.atan2(tiedDy, len), tiedLen: Math.hypot(len, tiedDy), z: seg[1] + .2, h }); m.add(rail);
  }
  rails.forEach((r, i) => { r.mesh.updateMatrix(); railIM.setMatrixAt(i, r.mesh.matrix); });
  railIM.instanceMatrix.needsUpdate = true; railIM.computeBoundingSphere();
  m.userData.work = { rails, knots, count: n, railIM }; return m;
}
function canWorkBank(u) {
  // 対岸の射手を見ているだけで、横木の補修を止め続けない。打ち合う時と近い敵は優先する。
  if (!u?.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget || u.atk || u.stagger) return false;
  const target = u.target;
  return !target?.alive || Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) > 8;
}
function workHands(u, t) {
  if (!u?.hand || !canWorkBank(u)) return;
  if (u.workRope) u.workRope.visible = true;
  u.hand.position.set(.2, .85, .65); u.hand.rotation.set(-.25 + Math.sin(t * 3) * .12, 0, 0);
  poseArms(u, t); if (u.wpn) u.wpn.visible = false;
}
function fenceProgress(segs, t, duration) {
  const span = duration / segs.length;
  for (let i = 0; i < segs.length; i++) {
    const q = segs[i], k = Math.max(0, Math.min(1, (t - i * span) / span)), work = q.mesh.userData.work;
    // 結び終えた横木は動かない。完成後も毎コマ束と外周を計算し直さない。
    if (work.progress === k) continue;
    work.progress = k;
    for (const r of work.rails) {
      const lift = Math.min(1, k * 2);
      r.mesh.position.y = r.looseY + (r.base + r.h - r.looseY) * lift;
      r.mesh.position.z = r.looseZ + (r.z - r.looseZ) * lift;
      r.mesh.rotation.z = r.looseAngle + (r.tiedAngle - r.looseAngle) * lift;
      r.mesh.scale.x = r.looseLen + (r.tiedLen - r.looseLen) * lift;
    }
    if (work.railIM) { work.rails.forEach((r, j) => { r.mesh.updateMatrix(); work.railIM.setMatrixAt(j, r.mesh.matrix); }); work.railIM.instanceMatrix.needsUpdate = true; work.railIM.computeBoundingSphere(); }
    work.knots.count = Math.floor(work.count * Math.max(0, (k - .5) * 2));
    if (k >= 1) { q.wall = true; q.segR = .7; }
  }
}
// 報せは本陣から既存の使番の仕組みで運ぶ。届かなくても戦の段は止めない。
function bankNews(rt, text, detail, expiresAt = Infinity) {
  if (!rt.player.u.alive || rt.flags.ending) return;
  sendOrder(rt, rt.flags.odaCamp.pos, rt.player.u, { id: '長島の報せ', apply: () => {
    // 次の下知が出た後には、古い命令を届けない。
    if (rt.flags.ending || rt.t >= expiresAt) return;
    const delivered = rt._deliveredNotice; rt._deliveredNotice = true;
    try { rt.say('伝令', text, 4); } finally { rt._deliveredNotice = delivered; }
    battleEvent(rt, EVENT_MESSENGER, rt.player.u.pos, null, 0, true, detail);
  } }, { team: 0, faction: 'oda', name: '岸への伝令' });
}

// 11/2 濁り水の上書きの後でも、共通の水（water_body.js）の波の向き sfN で明暗を付け、岸の泡を戻す（水面が平らな一枚に見えた）。
//   共通の波が無い作り（描かずの流しなど）では何もしない。
const NW_WAVES = `#ifdef SF_WAVES
  {
    vec3 wv = cameraPosition - vWPw; float wd = length(wv);
    float wNear = 1.0 - smoothstep(30.0, 150.0, wd);
    float wTilt = clamp(dot(sfN.xz, normalize(wv.xz + vec2(0.0001))) * 7.0, -1.0, 1.0);
    gl_FragColor.rgb *= 1.0 - wTilt * 0.22 * wNear;
    gl_FragColor.rgb += uWaterSky * max(-wTilt, 0.0) * 0.07 * wNear;
    float wFoamN = texture2D(tMacro, vWPw.xz * 0.5 - normalize(vWaterFlow + vec2(0.00001)) * uTime * 0.2).r;
    float wFoam = smoothstep(0.86, 0.98, abs(vWaterEdge)) * smoothstep(0.45, 0.7, wFoamN);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.51, 0.46), wFoam * 0.55 * wNear);
  }
  #endif`;
// 関船と小早。開いた舷・反った船首・櫓・帆柱・筵屋根を共用する。
const SHIP_MODELS = [new THREE.Group(), new THREE.Group()], SHIP_LO = [new THREE.Group(), new THREE.Group()];
for (let n = 0; n < 4; n++) {
  const lo = n > 1, kind = n % 2;
  const model = (lo ? SHIP_LO : SHIP_MODELS)[kind], bags = Array.from({length:6},()=>[]), length = kind ? 10 : 17, width = kind ? 2.8 : 4.8;
  const part = (bag, x, y, z, w, h, d, rx = 0, rz = 0) => {
    const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); bags[bag].push(g);
  };
  const widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / (length / 2)) ** 2);
  buildBoatHull(bags, length, width, .65, .85, lo);
  for (const side of [-1, 1]) for (let n = 0; n < (kind ? 4 : 7); n++) {
    const z = -length * .32 + n * 1.4;
    part(1, side * (widthAt(z) + .65), 1.1, z, 2.6, .075, .09, 0, side * -.18);
    part(1, side * (widthAt(z) + 1.8), .8, z, .7, .08, .26, 0, side * -.35);
  }
  part(1, 0, 3, .8, .13, 5.1, .13);
  for (const side of [-1, 1]) for (const z of [-2, .3]) part(1, side * width * .33, 2.2, z, .1, 2.5, .1);
  for (const side of [-1, 1]) {
    part(2, side * width * .18, 3.5, -.85, width * .43, .16, 3.2, 0, side * -.22);
    if (!lo) for (let n = 0; n < 9; n++) part(1, side * width * .18, 3.57, -2.25 + n * .35, width * .44, .035, .035, 0, side * -.22);
  }
  // 11/2 楯板（たていた）：舷に立て並べた厚板の垣。板の継ぎ目の隙が狭間になる（『肥前名護屋城図屏風』の安宅船・関船、村上水軍博物館の小早の復元船）。
  // 水押は船体（buildBoatHull）に付く。帆柱には筵の帆を半ば巻き上げて掛ける。形は開戦前に一度だけ作り、艘ごとに使い回す。
  const half = length / 2, step = lo ? .9 : .46;
  for (const side of [-1, 1]) for (let z = -length * .36; z <= length * .36; z += step) {
    const ya = .85 * (Math.abs(z) / half) ** 3;
    part(0, side * (widthAt(z) - .04), 1.68 + ya, z, .07, 1.05, step - .04, 0, side * -.06);
    if (!lo) part(1, side * (widthAt(z) - .04), 2.24 + ya, z, .1, .07, step + .01);
  }
  if (!kind) {
    part(2, 0, 4.15, .95, width * .9, 2.3, .03);
    for (const y of [3.1, 3.85, 4.6, 5.25]) part(1, 0, y, .97, width * .92, .05, .05);
  }
  finishBoat(model, bags);
  if (lo) pairLo(SHIP_MODELS[kind], model);
}
function ataka(small = false) { return SHIP_MODELS[small ? 1 : 0].clone(); }

// 数百艘の水軍の一部を遠景で示す。形と材質は既存の小型船を共用し、行列は開戦時だけ作る。
// 三重県史「信長の伊勢攻略と長島一向一揆」。艘数と間隔は局地の復元で、総艘数ではない。
function blockadeFleet(rt) {
  // 東西五艘ずつの列ごとに束を分け、画面（描く遠さ）に入らない列は描かない。遠景なので軽い形で描く
  const at = new THREE.Object3D();
  for (let row = 0; row < 4; row++) for (const part of SHIP_MODELS[1].children) {
    if (!part.isMesh || part.material === FOAM) continue;
    const mesh = new THREE.InstancedMesh(BOAT_LO.get(part.geometry) || part.geometry, part.material, 5);
    mesh.receiveShadow = true;
    for (let k = 0; k < 5; k++) {
      const i = (row >> 1) * 10 + (row & 1) * 5 + k, east = i < 10, n = i % 10;
      const x = east ? 100 + (n % 5) * 13 : -100 - (n % 5) * 13;   // 東西とも岸から見える川筋へ寄せ、左右から河口を塞ぐ。
      const centerZ = east ? CH_Z - 2 + (x - 100) * 8 / 140 : CH_Z + (-x - 100) * 4 / 140;
      const z = centerZ + (Math.floor(n / 5) - .5) * 8;
      at.position.set(x, waterHeight(rt.world, x, z) - .45, z);
      at.rotation.set(0, east ? -Math.PI / 2 : Math.PI / 2, 0);
      at.updateMatrix(); mesh.setMatrixAt(k, at.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    rt.scene.add(mesh);
  }
}

// 濃尾平野の河口を山の輪で囲まず、西の養老・鈴鹿側に遠い稜線を残す。
// 国土交通省の木曽川水系の地形を参考にした方角の復元。頂点数・材質・画質は変えない。
function deltaSkyline(W) {
  for (const mountain of W.mountains.children) {
    const p = mountain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // この戦では +x が西。中江・賀鳥口と同じ側へ養老・鈴鹿の稜線を残す。
      const west = p.getX(i) / (Math.hypot(p.getX(i), p.getZ(i)) || 1);
      // 10/30 vis_f：東と北（25秒の画面の向き）にも、遠い尾張・美濃の低い丘を霞の中に薄く残す（頂点の高さだけ）。
      const ridge = Math.max(.35, Math.min(1, (west - .15) / .55));
      p.setY(i, -12 + (p.getY(i) + 12) * ridge);
    }
    p.needsUpdate = true;
    mountain.geometry.computeVertexNormals();
    mountain.geometry.computeBoundingSphere();
  }
}

function dangerWarning(rt) {
  const F = rt.flags;
  if (F.dangerAt != null || F.ending || !rt.player.u.alive) return;
  F.dangerAt = rt.t;
  rt.obj('main', '危ない！　槍組の後ろへ下がれ', 'main');
  rt.say('柴田勝家', '槍組を回す！　敵を向き、柵の内へ下がれ', 4);
  rt.marker('retreat', RETREAT_SPOT, '槍組の後ろへ下がる', { guideArea: 'retreat', guideRadius: 3 });
  const g = F.relief;
  if (g) {
    g.noAI = false; g.order = 'path'; g.pathIdx = 0; g.aggro = 10;
    g.path = [[RETREAT_SPOT.x, RETREAT_SPOT.z], [24, BANK_Z + 6]];
    g.onArrive = q => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; };
    for (const u of g.units) u.noTarget = false;
  }
}
function dangerProgress(rt) {
  const F = rt.flags;
  return F.dangerAt != null && !F.dangerReached && rt.t - F.dangerAt < 15;
}

// 二砦の外を一周囲む。南岸の持ち場と川筋の動線は空ける。
function surroundForts(rt, close = true) {
  const F = rt.flags, batch = makeKitBatch();
  const add = pts => {
    const segs = wallLine(rt, pts, { team: 0, hp: 1e9, name: '包囲の柵', segLen: 10, meshOpt: { batch, mound: false } });
    for (const s of segs) { s.noTarget = true; s.wall = true; s.fireProof = true; }
    F.enclosure.push(...segs);
  };
  if (!F.enclosure) {
    F.enclosure = [];
    // 水路を横切らず陸上に囲む。木戸への通り口は、最後の包囲の下知までは残す。
    // 降った長島城は囲まず、揖斐川筋の西岸にある中江城を囲む。
    add([[149, -62], [137.5, -62], [137.5, -120], [178, -120], [178, -62], [155, -62]]);
    add([[45, -52], [35, -52], [35, -103], [70, -103], [70, -52], [51, -52]]);
    // 公記巻七「幾重も柵を付けさせ」：外にもう一重。空いた北と東だけ（西は願証寺と市、南は退城の舟の口、二砦の間は水路）。
    add([[137.5, -120], [137.5, -123.5], [181, -123.5], [181, -60], [164, -60]]);
    add([[35, -103], [35, -106.5], [73, -106.5], [73, -49.5], [60, -49.5]]);
  }
  if (close) F.closeOrdered = true;
  finalizeKitBatch(rt, batch);
}

// 川筋は使い回し、画質を切り替えても前の戦の水路を持ち越さない。
const RIVER_STREAMS = [
  CH_STREAM,
  // 中央の泥道と柵の持ち場は空け、脇だけ浅い水路と水たまりにする。
  { pts: [[-14, 24], [-12, 8], [-14, -2]], w: 1.4, depth: .3 },
  { pts: [[14, 24], [12, 8], [14, -2]], w: 1.4, depth: .3 },
  { pts: [[-20, 3], [-24, 4]], w: 2, depth: .3 },
  { pts: [[19, 12], [24, 14]], w: 2, depth: .3 },
  { pts: [[-240, -136], [-60, -132], [60, -134], [240, -130]], w: 10, depth: 1.8 },
  WEST_STREAM,
  // 屋長島と中江の間は揖斐川筋。中江の城・道・包囲柵を西へ四十八歩移し、水面を三十二歩幅に広げる。
  // 掘り際は x=73〜137。屋長島の外柵（x=73）と中江の外柵（x=137.5）の間に収める。実測復元ではない。
  { pts: [[105, CH_Z - 2], [105, -74], [105, -134]], w: 16, depth: 1.8 },
  // こちらは長島城と屋長島の間の支流。中江との境の川筋とは別。
  { pts: [[33, -40], [33, -76], [34, -114]], w: 2.5, depth: 0.9 },
  // 中江城は川を堀にする。揖斐川筋と北の川筋をつなぎ、西岸の別の囲みに置く。
  { pts: [[132, -58], [158, -57], [184, -58], [186, -96], [184, -132]], w: 5, depth: 1.4 },
];
// 寺の北裏の町堀。住民は地形の高さを歩くため、路地には七メートル幅の土橋を残す。
// 掘り下げは水面幅の二倍まで届く。左右の掘り際からも退路を離す。
const TOWN_STREAMS = [...RIVER_STREAMS,
  INLET,
  CANAL,
  MOAT_W,
  MOAT_E,
  { pts: [[-62, -112], [-52, -112]], w: 1.2, depth: .8 },
  { pts: [[-45, -112], [-37, -112]], w: 1.2, depth: .8 },
  ...DIKE_FLANKS,
];

const nagashima = {
  lethal: { max: 4, firstAt: 90, gap: 60 },   // 命懸けの戦場（docs/lethal_howto.md。先取りの列 豊臣A 11/9）
  // 11/10 作り直し：CP1 堤／CP2 第一砦／CP3 水路／CP4 在所／CP5 包囲／CP6 最後の突破の前（advance.js の ADV_CP）
  resumeSteps: [11, 12, 13, 14, 15, 16].map((k) => [k, function (rt) { this.advance(rt, ADV_CP[k - 10]); }]),
  checkpointStep: (rt) => (rt.flags.adv && rt.flags.advCP && !rt.flags.advEnding ? 10 + rt.flags.advCP : null),   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  // 稲生と同じ共通表示へ。段の丸・補足・空振り音・自分の足元の輪を省く。
  missionSingleLine: true,
  // 11/5：織田の三口（賀鳥・早尾・市江）は島の北。野の奥（-z）は南なので、小地図の北は下（右が西・左が東）。
  mapNorth: Math.PI,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || !!rt.flags.adv || /討ち取|討死|勝|崩れ|降伏|火/.test(text),
  // 公記巻七・九月二十九日条の順：柵を結う → 舟を見張る → 退城の舟 → 裸の斬り込み → 中江・屋長島の柵 → 火。
  stageGoalsOnly: true,   // 11/6 fixc1721：勝ちの札に「敵を八人討つ」が出ていた（三1）。目標は段だけ
  // 11/6 fixc1844：勝ちの札は五つまでで、六つ目（火）が落ちていた。見張りの二段（見張り場・退く舟）を一つにまとめ五つに（critic60 三2・見張りばかり）。
  missions: ADV_MISSIONS,
  goalsAllRows: true, // 一行表示の旧設定より、目標一覧を優先する。
  goalsVisibleRows: 5, // 今の目標を含む五つを、初めから時の順に並べる。
  dpNoMark: true, // 行き先の印と敵全員の頭上の▼だけを使い、敵の隊の別札を重ねない。
  oldMissions: ['堤の上へ上がり、輪中と門徒の砦を見よ', '岸の横木に縄をかけよ', '西の舟入りで、兵糧を取り返しに来た門徒を止めよ', '東の岸の柵で、砦から逃げ出した門徒を止めよ', '岸の柵に槍を並べ、鉄砲衆を守れ', '岸の柵で斬り込む門徒を受け止めよ', '西の柵の縄を三か所締め直せ', '岸の真ん中の柵で、最後に寄せる門徒を止めよ', AFTERMATH_ORDER],
  taskLines: ['岸の横木に縄をかけよ', '岸の柵で槍を構え、寄る舟に備えよ', '岸の柵に槍を並べ、鉄砲衆を守れ', '岸の柵で斬り込む門徒を受け止めよ', '西の柵の縄を三か所締め直せ', AFTERMATH_ORDER],
  // 味方が減った時の共通の声は「任務の札」と遊びの言葉を使う。岸の組頭の言葉に替える。
  missionDangerSpeech: (rt) => rt.flags.adv ? '先手の槍が減った！　味方の列へ寄り、備えを固めよ' : rt.flags.step >= 3.5 ? '西の柵の槍が減った！　柵の内へ寄り、列を詰めよ' : '岸の槍が減った！　柵の内へ寄り、列を詰めよ',
  missionDangerText: (rt) => rt.flags.adv ? '先手の列が薄い。味方の備へ寄れ' : '岸の列が薄い。柵の内へ寄れ',
  goalSignNoLabel: true,     // 11/4 jin：▼の上に字を出さない（kaito 10/23）
  goalSignUnitNoLabel: true, // 敵の印にも大きな攻撃の札を重ねず、顔と打ち込みを見せる。
  // 右上の番号は時の順に進むだけで戻らない（kaito 三2・三3）。中の下知の選び分けは taskOf。
  missionOf(rt) {
    const F = rt.flags;
    if (F.adv) return F.advK || 1;
    if (!F.adv) return 0;
    const base = F.ending ? 8 : F.dpLast ? 7 : F.step >= 3.5 ? 6 : F.step >= 3 ? 5 : F.step >= 2 ? 4 : F.dp?.i >= 2 && F.step === 1.5 || F.dpDone ? 3 : F.step === 1.5 ? 2 : F.step >= 1 ? 1 : 0;
    F.missionMax = Math.max(F.missionMax || 0, base);
    return F.missionMax;
  },
  taskOf(rt) {
    const F = rt.flags;
    if (F.adv) return 1;
    if (F.ending) return 5;
    if (F.step <= 1) return !rt.G.lord && !F.participated && bankWorkSpot(rt) ? 0 : 1;
    if (F.step < 3) return F.step === 2 ? 2 : 1;
    const foe = bankNearestFoe(rt);
    if (dangerProgress(rt) || F.broken && F.step === 3) return 2;
    // 岸を離れた時は、敵を追う案内より帰陣を先にする。
    if (F.step === 3 && F.sallyTask === 'return') return 2;
    if (F.step === 3 && F.sallyTask === 'boats' && F.sallyEast) return 2;
    if (F.step === 3.5) {
      // 遠い敵は味方が受ける。本人を攻める敵がなければ次の縄を先に案内する。
      if ((F.finalChecked || 0) < 3 && !bankCheckThreat(rt)) return 4;
      return foe ? 3 : 1;
    }
    return foe ? 3 : 2;
  },
  // 一行の頭に、時の順の番号（①〜⑥）を付ける（kaito 三3「目標に番号」）。
  // 11/6 kaito 十1：一つの目標の間は言い替えない。右上は番号と決まった一行だけ（その場の下知は台詞と印で）。
  missionHeading(rt) {
    const k = this.missionOf(rt);
    return '①②③④⑤⑥⑦⑧⑨'[k] +'　' + (rt.flags.ending && rt.flags.failureReason ? '持ち場を守れなかった' : this.missions[k]);
  },
  // 場面ごとの下知の言い方（11/6 から右上には出さない。taskText などの控え）
  taskHeading(rt) {
    const F = rt.flags, stage = this.taskOf(rt), p = rt.player.u.pos;
    if (F.ending) return F.failureReason ? '持ち場を守れなかった' : AFTERMATH_ORDER;
    if (dangerProgress(rt)) return '味方の後ろへ下がれ';
    if (F.step === 2) return !onBank(p, F.boatsNear) ? '岸の柵へ戻れ。舟を追うな'
      : rt.t - F.stepT < 8 ? '柵に槍を並べよ。舟は討つな' : '柵の内で、味方と反撃に備えよ';
    if (F.step === 3) {
      if (F.broken) return '西の柵へ下がれ';
      if (F.sallyTask === 'return') return F.sallyEast ? '西の岸の柵へ戻れ' : '岸の柵へ戻れ。舟を追うな';
      if (F.sallyTask === 'breach') return '振り向き、柵の後ろの門徒を受け止めよ';
      if (F.sallyTask === 'boats' && F.sallyEast) return F.sallyEastAway ? '西の岸の柵へ進め' : '西の柵で舟に備えよ';
      if (F.sallyTask === 'turn') return riverTurnText(rt);
      if (F.sallyTask === 'watch') return '岸の柵で槍を構え、舟に備えよ';
    }
    if (F.step === 3.5 && F.finalTask === 'fight') return '西の柵で、斬り込む門徒を味方と受け止めよ';
    if (stage === 0) {
      const q = bankWorkSpot(rt);
      if (q && (p.z < BANK_Z - 1 || Math.hypot(p.x - q.x, p.z - q.z) >= 5.5)) return '岸の横木へ';
      if (F.buildTask !== 'work') return watchingRiver(rt) ? '人足を待ち、川を見張れ' : '人足を待ち、川を向け';
      return '横木に縄を締めよ';
    }
    if (stage === 4) {
      const q = CHECK_SPOTS[F.finalChecks.indexOf(false)];
      return q && (p.z < BANK_Z || Math.hypot(p.x - q.x, p.z - q.z) >= 3)
        ? `西の柵の縄へ（${F.finalChecked + 1}／三か所）`
        : '西の柵の縄を確かめよ';
    }
    if (stage === 1) {
      if (F.step === 1.25 && !F.watchNear) return '岸の見張り場へ';
      if (F.step === 3.5 && !F.atEast) return '西の岸の柵へ戻れ';
      const facing = F.step === 1.25 ? F.watchFacing : F.step === 3.5 ? F.finalFacing : watchingRiver(rt);
      if (!facing) return riverTurnText(rt);
      const left = F.step === 1.25 ? WATCH_HOLD - F.watchTime
        : F.step === 3.5 ? FINAL_HOLD - F.finalSafe : null;
      return '岸の柵で槍を構え、舟に備えよ';
    }
    if (stage === 1) {
      const q = this.missionPin(rt);
      if (q && Math.hypot(p.x - q.x, p.z - q.z) >= q.r) return '見張り場へ';
      return watchingRiver(rt) ? '槍を構え、舟に備えよ' : '川を向き、槍を構えよ';
    }
    if (stage === 3 && this.commanderTarget(rt)) return '岸の柵で、門徒の旗頭を討ち取れ';
    if (stage === 2 && F.step >= 3) return '岸の柵の内で、斬り込む門徒に備えよ';
    return this.taskLines[stage];
  },
  missionSignTarget(rt) { return this.taskOf(rt) === 3 ? bankNearestFoe(rt) : null; },
  waitFacingPoint(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 縄の確認と目前の戦いを終えてから、既存の向き直す印で川を示す。
    if (F.ending || rt.over || !rt.player.u.alive || dangerProgress(rt) ||
        this.taskOf(rt) !== 1 ||
        F.step !== 1.25 && !(F.step === 3.5 && F.finalChecked >= 3)) return null;
    const x = F.step === 1.25 ? SPOTS[nearestBankSpot(p)].x : 24;
    const radius = F.step === 1.25 ? 5 : 18;
    const z = BANK_Z + (F.step === 1.25 ? 5 : 6);
    if (Math.hypot(p.x - x, p.z - z) >= radius) return null;
    const point = F.bankFacingPoint || (F.bankFacingPoint = { x: 0, z: CH_Z });
    point.x = p.x; // 見張りの判定と同じ、岸からまっすぐ川を見る向き。
    return point;
  },
  // 指揮官の実名は不明。後続の既存の一人を指揮役とする遊び上の復元。
  commanderSignTarget(rt) {
    const u = rt.flags.sallyBoss;
    return !rt.flags.ending && bankGuideFoe(rt, u) ? u : null;
  },
  commanderTarget(rt) {
    const u = this.commanderSignTarget(rt);
    return u && this.taskOf(rt) === 3 && bankNearestFoe(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  // 共通の目標名への置換を通さず、今の持ち場の名と位置を同じ印へ渡す。
  goalSignTarget(rt) { return this.missionPin(rt); },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.over || !rt.player.u.alive) return null;
    const q = F.bankPin || (F.bankPin = { x: 0, z: 0, r: 5, hide: 5 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.label = '';
    q.always = true; q.silent = true; q.defend = false;
    // 火の間も巡回の務めが残る。次に確かめる柵だけを案内する。
    if (F.ending) {
      const at = F.aftermathHeld && !F.aftermathDone && AFTERMATH_SPOTS[F.aftermathChecked];
      if (!at) return null;
      q.x = at.x; q.z = at.z; q.r = q.hide = 3;
      q.label = this.travelGuideLabel(rt);
      q.arrived = p.z >= BANK_Z && Math.hypot(p.x - at.x, p.z - at.z) < 3;
      return q;
    }
    if (F.advEnding) { const at = !F.advSaid && F.advWalk; if (!at) return null; q.x = at.x; q.z = at.z; q.r = q.hide = 3.5; q.label = '南の堤'; q.arrived = Math.hypot(p.x - at.x, p.z - at.z) < 3.5; return q; }
    { const at = F.ngMonomi || (!F.adv && F.step === 0 ? MONOMI_SPOT : null) || (F.dpOn && (F.dp?.cur?.at || F.dp?.cur?.s?.pin)) || (F.adv && F.advLastAt); if (F.adv && at && at !== F.ngMonomi) F.advLastAt = at; if (at) { const next = F.adv ? fortWay(rt.player.u, at) : at; q.x = next.x; q.z = next.z; q.r = q.hide = next.botRadius ?? 4; q.label = next !== at ? '堤の砦の木戸' : this.travelGuideLabel(rt); q.arrived = Math.hypot(p.x - next.x, p.z - next.z) < q.r; return q; } }
    const stage = this.taskOf(rt);
    let spot = null;
    if (dangerProgress(rt)) { q.x = 24; q.z = BANK_Z + 16; q.r = q.hide = 3; return q; }
    if (stage === 3) {
      const u = bankNearestFoe(rt);
      if (!u || rt.player.inRange && rt.player.rangeCueTarget === u) return null;
      q.x = u.pos.x; q.z = u.pos.z; q.unit = u; q.enemy = true; q.r = q.hide = 2;
      return q;
    }
    if (stage === 0) spot = bankWorkSpot(rt);
    else if (stage === 4) spot = CHECK_SPOTS[F.finalChecks.indexOf(false)];
    // 縄を締め始める場所と案内の中心・範囲をそろえる。
    if (spot) { q.x = spot.x; q.z = spot.z; q.r = q.hide = stage === 0 ? 5.5 : 3; return q; }
    const east = F.step === 3.5 || F.broken || F.step === 3 &&
      (F.sallyTask === 'boats' || F.sallyTask === 'return') && F.sallyEast;
    // 見張れる岸にいる時は中央へ歩き直させない。東への集結は下知のある間だけ。
    if (F.step === 2 && onBank(p, F.boatsNear) ||
        F.step === 3 && !east && onBank(p, F.sallyNear) ||
        F.step === 3.5 && F.atEast) return null;
    q.x = east ? 24 : F.step === 1.25 ? SPOTS[F.watchSpot].x : F.step === 2 ? SPOTS[F.boatsSpot].x : 0;
    q.z = BANK_Z + (east ? 6 : 5); q.r = q.hide = F.step === 1.25 && F.watchNear ? 6 : 5;
    q.waiting = true; q.arrived = Math.hypot(p.x - q.x, p.z - q.z) < q.r;
    return q;
  },
  introTaskFirst: true, // 低い横画面でも、人物紹介より先に最初の仕事を見せる。
  introKeepControls: true, // 四秒長押しの説明を、開戦前の言い換えで落とさない。
  // 11/8 critic60（五4）：始まりの札は戦の名・年・両軍の数・二行と「出陣する」だけ。「人物と戦場の説明を読む」を出さない
  introPeople: [],
  introText: () => '細い堤を進み、砦と舟着場を取る。長島の囲みを閉じる。',
  // 描画専用の民。兵の名簿・当たり・戦功には入れない。退避後も輪中内に残る。
  civilianCrowd: { bounds: { minX: -124, maxX: -34, minZ: -124, maxZ: -48 }, bands: PEOPLE_BANDS },
  noticeOnce: false, // 再び持ち場を離れた時も案内する。同文の間引きは共通の仕組みに任せる。
  noAllyReports: true, // 遠い勝家の声は運ばず、必要な報せは bankNews で届ける。
  noCouriers: true, // 下知は実際の使番が運ぶ。持ち場を往復する飾りの騎馬は重ねない。
  botOrders: true, // 柵作りと岸の守りを、砦への突進で上書きしない。
  // 退城舟の射撃を受けてから反撃する。待つ間に共通の小勢を岸へ足さない。
  frontlineDensity: false,
  // 敵が集まっても共通の退避で持ち場を離れず、岸の後ろへの退避と東への下知は専用の頭に任せる。
  botDefendsFort: true,
  // 横木の作業・見張り・目前の戦いを優先し、敵が離れてから証を納める。
  headBlocked(rt) {
    if (rt.flags.step !== 3 || rt.flags.ending) return true;
    const p = rt.player.u;
    for (const u of rt.army.units) {
      if (u.alive && u.team !== p.team && !u.civ && !u.isStruct && !u.fleeing &&
          Math.abs(u.pos.y - p.pos.y) < 2 && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6) return true;
    }
    return false;
  },
  taskDetails: false, // 任務の補足は畳み、右上を一行に保つ。
  noTravelArrow: true, // 行き先は場所の印で示し、足元と画面端の矢印を出さない。
  goalSignTriangle: true, // 共通の行き先表示も、画面端で回す矢印に替えず▼を保つ。
  keepCombatTask: true, // 構えの案内中も、持ち場と残り時間を隠さない。
  keepCombatTaskHeading: true,
  keepCombatTaskDetail: false,
  // 構える足元の輪を、守る柵の範囲と取り違えさせない。操作は釦で伝える。
  combatTaskLabel(rt) {
    const F = rt.flags;
    if (F.ending || F.broken || dangerProgress(rt) ||
        !rt.hud.defendEnemy?.alive || (F.step !== 3 && F.step !== 3.5)) return '';
    return F.step === 3.5 ? '西の柵で味方と守れ' : '柵の手前で味方と守れ';
  },
  guardLabel: (rt) => rt.flags.adv ? `${nagashima.travelGuideLabel(rt)}で味方と守れ` :
    rt.flags.step === 3.5 ? '西の柵で味方と守れ' : '柵の手前で味方と守れ',
  guardStartText: '敵を向き、押して防ぐ',
  guardWaitText: '敵を向いて構えを保て',
  waitGuardButtonText: '押し続けて防ぐ',
  // 水郷を進む間は堤・砦・在所の敵も対象にする。舟上・壁越し・結末は案内しない。
  meleeGuide(rt, enemy) {
    return !!enemy && !enemy.boatSeat?.aboard && (rt.flags.adv ? !rt.flags.advEnding : enemy.pos.z >= BANK_Z) &&
      !rt.army.wallBetween(rt.player.u.pos, -1, enemy.pos);
  },
  // 縄の務めや目前の戦いを、共通の柵の補修札で隠さない。
  // 反撃の合間と、東の縄を三つ確かめた後は、倒れた柵を直せる。
  fenceUseOK(rt) {
    const F = rt.flags, p = rt.player.u;
    if (F.ending || dangerProgress(rt) ||
        (F.step !== 3 && !(F.step === 3.5 && F.finalChecked >= 3 && F.finalFoes === 0))) return false;
    for (const u of rt.army.units) {
      if (u.team === p.team || !u.alive || u.isStruct || u.civ || u.fleeing || u.woundOut ||
          u.rearWound || u.gone || u.noTarget || u.boatSeat?.aboard || u.pos.z < BANK_Z) continue;
      if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6 &&
          !rt.army.wallBetween(p.pos, -1, u.pos)) return false;
    }
    return true;
  },
  keepTaskWithGuard: true, // 守る釦を押す間も、舟の見張りと柵の進みを残す。
  keepRescueTaskLabel: true, // 近い味方の盾で、岸の務めを「この人を守れ」に置き換えない。
  compactWaitGuard: true, // 携帯横の防御は端の決まった位置で押し、兵を覆わない。
  contextualCoach: true, // 敵のいない見張り中は突きの手ほどきを休め、舟を見る下知を残す。
  keepTaskLabel: true,
  persistentTaskNotice: true, // 操作の語や同文の再表示制限で、常設の任務を隠さない。
  keepTaskPanel: true, // 目前の敵の枠へ任務を移さず、岸を守る下知を残す。
  keepApproachTaskPanel: true,
  keepOpeningTaskLabel: true, // 指の動かし方だけで、最初の横木の行き先を消さない。
  keepDestinationTask: true,
  keepFlagTravelTask: true, // 行き先の距離で「岸を守れ」「横木を直せ」を上書きしない。
  hideGuideSteps: true, // 短い岸の持ち場は印で示し、任務の下へ別の「旗まで」を重ねない。
  avoidAllDestinationNotices: true, // 守る場所と旗の矢印も、任務札や知らせを避ける。
  avoidMarkerNotices: true,
  treatmentTaskGuidance: true,
  woundEffectMin: .05, // ごく浅い傷は部位だけを示し、退避の下知と混ぜず、止血・深手の知らせを残す。
  woundEffectText: (rt, slow) => slow ? '歩みが遅い' : '腕のけが',
  treatmentApproachLabel: '柵の内へ下がり、傷を縛れ',
  keepTaskWithDodge: true, // 回避の印が出ても、岸を守る下知と残り時間を残す。
  keepRetreatReason: true, // 退く行き先を「ここへ」に縮めず、味方の後ろへ下がる目的を残す。
  keepWoundRetreatReason: true, // 出血中も共通の「旗まで」に戻さず、手当てと退避先の案内を使う。
  distanceUnit: 'metres', // 行き先は場所の名と距離だけ。「あと」「すぐ近く」を添えない。
  namedGuideMarkers: true, // 横木・見張り場・東の柵を、行き先の印でも区別する。
  // 作業場と見張り場を、同じ「ここへ」の札にしない。
  travelGuideLabel(rt) {
    const F = rt.flags, stage = this.taskOf(rt);
    if (F.adv) return ['', '堤の先', '堤の砦', '舟着場', '在所の入口', '南の舟入り', '南の舟入り', '堤の上'][F.advK || 1];
    if (F.ending) return ['西の岸の柵', '中央の岸の柵', '東の岸の柵'][F.aftermathChecked] || '岸の柵';
    if (F.ngMonomi || !F.adv && F.step === 0) return '岸の堤の上';
    if (F.dpOn && F.dp?.cur?.at) return F.dpLast ? '岸の真ん中の柵' : F.dp.i >= 2 ? '東の岸の柵' : '西の舟入り';
    if (dangerProgress(rt)) return '岸の助けの槍組';
    if (stage === 0) return '岸の横木';
    if (stage === 3) return '岸の門徒';
    if (stage === 4) return CHECK_NAMES[F.finalChecks.indexOf(false)];
    if (stage === 1) return '岸の見張り場';
    return '岸の柵';
  },
  taskText(rt, text) {
    // 舟待ちと結末は、岸から動かず見る仕事。内陸を向いた時は向き直る下知を先に出す。
    const p = rt.player.u.pos;
    // 下知を更新する一秒の間も、目前の門徒から目を離す案内を出さない。
    if (!rt.flags.ending && (rt.flags.step === 3 || rt.flags.step === 3.5) && text.includes('見張れ')) {
      for (const u of rt.army.units) {
        if (u.team === rt.player.u.team || !u.alive || u.noTarget || u.gone || u.isStruct || u.civ ||
            u.fleeing || u.woundOut || u.rearWound || u.group?.routed) continue;
        if (Math.abs(u.pos.y - p.y) < 2 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 6 &&
            this.meleeGuide(rt, u)) return '柵の手前で、門徒を味方と受け止めよ';
      }
    }
    // 見張りの三つの段で、体ではなく今の視線から向き直る方を伝える。
    if (text === 'この場で川の向こうの砦へ向き直れ' || text === 'この場で川の向こうへ向き直れ') return riverTurnText(rt);
    // 守備後は体の向きより、実際に見ている方へ案内する。肩越しを回したまま煙を見落とさせない。
    if (text === '岸に残り、川の方を向け' || text === '岸に残り、川の向こうの煙を見よ') {
      if (!watchingRiver(rt)) return riverTurnText(rt);
      return text === '岸に残り、川の方を向け' ? '岸で対岸の下知を待て' : '岸から対岸の煙を見よ';
    }
    if ((text === '川岸の見張り場で、川を向いて門徒の舟を見張る' ||
        text === '川岸で川を向き、味方と門徒の舟を見張る' || text === '西の柵の前で川を向き、門徒の舟を見張る' ||
        text === '次の門徒の舟に備え、川岸で川を向いて見張る') &&
        Math.abs(p.x) < 48 && p.z >= BANK_Z && p.z < BANK_Z + 28 &&
        !watchingRiver(rt)) return riverTurnText(rt);
    if (text === '岸の横木へ進み、味方と直せ') return '岸の横木へ進め';
    if (text === '足元の横木で「縄を締める」を長押しし、川岸の柵を結う') return '横木に縄を締めよ';
    if (text === '川岸の見張り場で、川を向いて門徒の舟を見張る' || text === '川岸で川を向き、味方と門徒の舟を見張る') return '川を向いて見張れ';
    if (text === '西の柵の前で川を向き、門徒の舟を見張る') return '西の柵で舟を見張れ';
    if (text === '西の柵へ移り、縄三か所を確かめる') return '西の柵で縄を確かめよ';
    if (text === '次の門徒の舟に備え、川岸で川を向いて見張る') return '川を向き、次の舟を待て';
    if (text === '柵の手前で、味方と門徒を止めよ') return '柵の手前で敵を止めよ';
    return text;
  },
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    // 安全な所で手当てを始められるなら、別の印へ歩かせない。
    if (p.treatmentReady) return p.treating ? '傷を縛れ' : '座って傷を縛れ';
    if (cue?.valid && Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return rt.flags.adv ? '味方の後ろへ下がり、傷を縛れ' : '柵の内へ下がり、傷を縛れ';
    if (p.treatmentNext > rt.t) return '息を整え、傷を押さえよ';
    return cue?.valid ? '止まり、手当ての支度を待て' : '味方の後ろへ下がれ';
  },
  retreatGuideLabel(rt, reached) {
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) return this.treatmentGuideLabel(rt, cue);
    const place = this.travelGuideLabel(rt);
    return reached ? rt.player.sta < 20 ? `${place}の味方の後ろで休め` : `${place}で味方と構えよ` : '味方の後ろへ';
  },
  taskDetail(rt, title, detail) {
    const cue = rt.hud.retreatGuide;
    if (!rt.flags.ending && cue?.active && cue.valid && cue.treatment) {
      const reason = rt.player.u.wounds?.bleed > .0001 ? '血が出ている。味方の後ろで傷を縛れ' : '傷が重い。味方の後ろで手当てせよ';
      return detail ? `${reason}\n${detail}` : reason;
    }
    // 退く理由と岸の務めを一緒に残す。軽い被弾だけで深手とは呼ばない。
    const resting = title === `${this.travelGuideLabel(rt)}の味方の後ろで休め`;
    const guarding = title === `${this.travelGuideLabel(rt)}で味方と構えよ`;
    if (title !== '味方の後ろへ' && !resting && !guarding) return detail;
    const reason = rt.player.sta < 20 ? '息切れ。列の後ろで休め'
      : rt.player.u.hp < rt.player.u.maxHp * .3 ? '深手。敵を向いて下がれ'
        : rt.player.u.mobbed ? '囲まれる。列へ下がれ'
          : guarding ? '敵を向き、味方と受けよ' : '敵を向き、構えて下がれ';
    // 退く理由と残り時間を別の行に置く。短い横画面で秒数だけを折り返さない。
    return detail ? `${reason}\n${detail}` : reason;
  },
  spacedCombatCues: true, // 間合いと気力を兵の顔・行き先の印から離す。
  nearSpearBatchRadius: 18, // 肩越しで隠した近い槍を、遠景用の別の束へ残さない。
  hidePlayerSign: true, // 肩越しで本人から離れて見える白輪を、行き先と取り違えさせない。
  noUnitContrast: true, // 柵越しの兵から浮いて見える白い人型を消す。敵味方の頭上の印は残す。
  compactDestinationSign: true, // 東の柵への矢印を小さくし、近い兵の顔と胴を隠さない。
  groundFlagGuides: true, // 守備中も大きな交差した刀を縮め、持ち場の印は地面の小旗へそろえる。
  compactHoldGuide: true, // 遠い待機場所の輪を広げず、小旗で岸の位置を示す。
  compactRetreatSign: true, // 退避の旗は別の指定。携帯で大きな旗と二本の矢印を兵に重ねない。
  singleRetreatArrow: true, // 足元の短い矢印一本で退く向きを示し、兵を横切る列を描かない。
  retreatLinkLength: 148, // 一本にする指定だけでは長さは変わらない。退き先が画面端でも足元へ収める。
  retreatArrowLength: 72,
  compactRetreatArea: true, // 近い退き先も小さい足元の輪で示す。
  // 強調される守備の輪は compactFloorGuides を通らない。既存の足元の印へそろえる。
  smallTaskAreas: true,
  smallRetreatAreas: true,
  taskAreaFootRing: true,
  compactGuardGuide: true, // 守る味方の盾も小さくし、岸の兵と舟を見せる。
  singleDestinationArrow: true, // 行き先を指す一本にまとめ、逆向きの道案内を重ねない。
  enemyCornerSign: true, // 敵の囲みを描く処理が読む指定。四隅だけで顔と打ち込みを空ける。
  enemyFootRingRadius: .4, // 岸の敵の足元だけを示し、横木や隣の兵まで白輪で囲まない。
  positionPersonGuide: true, // 描画前の古い頭の骨と現在の足元を混ぜず、動く敵の今いる所へ印を付ける。
  personFrameAtPosition: true, // 囲みの測定にも現在地を使い、頭上の名札と別の兵を指さない。
  bodyHeightGuides: true, // 門徒と甲冑の兵それぞれの背丈で測り、頭の上に空の枠を伸ばさない。
  compactCombatGuides: true, // 狙っていない周囲の兵まで枠で囲まない。
  releaseGuardForAttack: true, // 敵の打ち終わりには、防ぐ長押しから反撃へ渡す。
  compactFloorGuides: true, // 近い退き先の輪は細い点線とし、画面を埋める大きさでは描かない。
  goalFlagScale: .6, // 岸の案内旗を兵より大きく描かず、舟と槍の見通しを残す。
  // 視点へ入り込む味方は全身を描く間だけ避け、笠・顔・胴の透けが重なるのを防ぐ。
  nearAllyFadeRadius: 2.2, // 肩越しに入る味方の胴・母衣も、近い一人の全身と一緒に避ける。
  nearAllySolidBody: true,
  nearAllyWholeOcclusion: true, // 本人との間に入った味方にも全身の扱いを通し、胴の中を見せない。
  nearHatFadeRadius: 0, // 笠だけ透かして首布や隣の顔を浮かせず、体と一緒に扱う。
  nearSpearFade: false, // 周囲の槍をまとめて縮めず、共通の遮蔽判定で視線を空ける。
  nearSpearBatchRadius: 18, // 持ち主と一緒に避けた近い槍を、更新中の別の束へ残さない。
  // 肩越しへ差し込む長柄と隊旗の竿は、描く間だけ既存の処理で避ける。
  nearLongWeaponRadius: 10, // 持ち主が離れていても、岸へ横たわる長柄が肩越しへ届く範囲を拾う。
  nearGroundSpearRadius: 12,
  nearGroundSpearClearance: 3, // 低い横画面で肩越しの視線より下を横切る落ち槍も、描く間だけ避ける。
  nearFlagFadeRadius: 6, // 横から画面へ入る隊旗も、既存の描画時の判定で避ける。
  standardClothScale: .75, // 狭い岸の隊旗は布を控えめにし、隣の兵と舟を見渡せるようにする。
  nearThreatWarning: true,
  nearThreatRange: 6, // 味方が離れて受ける敵には、手元の作業をやめる警告を出さない。
  actionableThreats: true,
  compactThreats: true, // 携帯では方向と防ぎ方を短い一枚で示す。
  avoidWaymarkThreats: true,
  edgeBehindWaymarks: true, // 背後の退避先は画面端へ寄せ、目の前の兵を隠さない。
  // 旧防衛だけ岸の柵の内に保つ。輪中へ進んだ後は堤・砦・在所でも
  // 退避と回避を探せるようにし、地形・壁・途中の安全は共通の判定に任せる。
  retreatPointAllowed: (rt, p) => !!rt.flags.adv || p.z >= BANK_Z + 1,
  dodgePointAllowed: (rt, p) => !!rt.flags.adv || p.z >= BANK_Z + 1,
  compactDodgeGuide: true, // よける先の輪を足元に収め、近い兵の体を囲まない。
  dodgeMoveGesture: false, // 進む向きは既存の矢印で示し、札にはよける理由を残す。
  escapePlaceLabel: (_rt, rain, side) => rain ? `${side}へ下がり、矢をよけよ` : `${side}へよけ、敵から離れよ`,
  immediateTaskChanges: true, // 敵を受ける間に、押せない確認の下知を残さない。
  noticeLimit: 2, // 任務と声のほかに、敵の向きの一枠を空ける。
  attackWarningDelay: 1.8, // 印と背後の敵を見る間を、最初の打ち込みより先に残す。
  rearThreatFrame: true,
  rearAdviceView: true, // 打ち込みの声も、敵の向きの札と同じカメラの向きで伝える。
  // 横木・岸・東の柵は任務の文と名札の文が違う。言葉の一致に頼らず、現在の持ち場を示す。
  guideMarker(rt) {
    if (rt.flags.ending) return null;
    const F = rt.flags, p = rt.player.u.pos;
    // 向き直る印は川へ歩く目標ではなく、その場で見る先として案内する。
    if (!dangerProgress(rt)) {
      const facingId = F.step === 1.25 && F.watchTask === 'turn' ? 'watchFacing'
        : F.step === 3 && F.sallyTask === 'turn' ? 'shoreFacing'
        : F.step === 3.5 && F.finalTask === 'turn' ? 'finalFacing' : null;
      if (facingId && rt.markers.some(m => m.id === facingId)) return facingId;
    }
    // 持ち場に着いた後は、足元へ歩く印より川を向く下知を優先する。
    if (F.step === 1.25) {
      const s = SPOTS[F.watchSpot];
      // 見張りの進みと同じ持ち場・岸の内側・境目の余裕を使う。
      if (p.z >= BANK_Z && Math.hypot(p.x - s.x, p.z - (BANK_Z + 5)) < (F.watchNear ? 6 : 5)) return null;
    }
    // 退城舟は今いる岸で見届ける。中央への歩き直しで舟から目を離させない。
    if (F.step === 2 && onBank(p, F.boatsNear)) return null;
    if (!dangerProgress(rt)) {
      if (F.step === 3 && F.sallyTask === 'breach' && rt.markers.some(m => m.id === 'breach')) return 'breach';
      // 岸の守りは一点への到着ではなく、この範囲で果たせる。敵から目を離させない。
      // 後の舟を待つ間だけ東へ集まる。岸が静まった後の見張りは、今の持ち場で続ける。
      const movingEast = F.sallyEast && F.sallyTask === 'boats' &&
        Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) >= 5;
      if (F.step === 3 && !F.broken && !movingEast && onBank(p, F.sallyNear)) return null;
      // 東の縄を確かめる前も、手元の敵を受ける下知が先。
      if (F.step === 3.5 && F.finalTask === 'fight') {
        return rt.markers.some(m => m.id === 'finalThreat') ? 'finalThreat' : null;
      }
      // 縄を確かめた後は、東の持ち場の中なら見張れる。一点へ歩き直させない。
      if (F.step === 3.5 && F.finalChecked >= 3 && F.atEast) return null;
    }
    // 退避を終えたら、傷が残っていても東の見回りの印へ戻す。
    if (rt.flags.step === 3.5 && !dangerProgress(rt)) {
      const next = rt.flags.finalChecks.indexOf(false);
      const id = next < 0 ? 'east' : 'check' + next;
      if (rt.markers.some(m => m.id === id)) return id;
    }
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const id = rt.markers[i].id;
      if (/^(?:s[0-2]|workWatch|watch|bank|retreat|check[0-2]|east)$/.test(id)) return id;
    }
    return null;
  },
  spawn: { x: 3, z: BANK_Z + 7, heading: Math.PI },
  // 中江の砦の表（こちらの岸へ向く塀）：城攻めの共通部品（siege_kit.js。battle.js が組み、毎コマ動かす）。
  // 砦の今の塀を狭間に借り、柵を結う岸へ鉄砲と矢を射かける（兵も塀も足さない）。塀の前の水際に逆茂木（乱杭）。
  // 木戸は開いたまま・出撃は無し（退城の舟は筋書きが受け持つ）。撃つのは決戦の前まで。
  siegeKit: {
    plan: { x: 0, z: -52, rot: 0, W: 26, yokoya: false, moat: false, kirigishi: 0, umadashi: false, sakamogi: { at: 1 }, shiyori: false },
    build: { team: 1, gate: false, walls: false, bridge: false, heads: true, fire: { hurt: .15, near: 80, close: 30, base: .8, peak: 3, arrows: .45, needMen: false } },
    borrow: { r: 34, name: '長島城' },
    when: (rt) => rt.flags.step < 3.5 && !rt.flags.ending,
  },
  // 身の回りの当時の場（timeslip_field.js）。天正二年九月二十九日は今の十一月の初め（晩秋）。輪中の岸はぬかるみ、葦が茂る。
  // 岸の柵の前に一揆の矢と捨てた笠、竹槍。水の上と堤の法には置かない。
  timeslip: {
    wet: 0.85, dust: 0.05, trample: 0.2, debris: 1.6, arrows: 1, reeds: 1,
    grass: 0x98a05e, grassTints: [0xffffff, 0xe6e6bc, 0xccd0a0], grassH: 1.2, tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x713d30],
    maxSlope: 0.22,
    fights: [[0, BANK_Z, 16], [24, BANK_Z, 12], [-24, BANK_Z, 12]],   // 踏み荒らしは柵の作業場だけ。堤の草を残す
    // 10/30：溜まり・水路の水面の上に濡れた泥と水たまりの板が載り、空を映した青白の板に見えた。水路の水面とその縁には置かない。
    skip: (x, z) => TOWN_STREAMS.some((st) => st.w < 10 && segDist2(x, z, st.pts) < st.w + .6),
  },
  // 入力の傷だけを縮めても、共通処理の侍の最低被害で二太刀ほどで倒れる。
  // 最低被害にも効く戦ごとの倍率を使い、退く間を四秒確保する。
  cutFloor: 0.7,
  playerTaken: 0.32,
  meleeGrace: { rate: 1, burst: 1, interval: 4 },
  world: {
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定は四人・player_pressure.js）
    seed: 1574,
    noHaori: true, // 本の足軽姿を保ち、武将も陣羽織・マントを着せない。
    time: 'day',
    // 11/8 critic60 長島（十三3・四1）：川を向くと日が正面で、背を見せる味方が真っ黒な影になった。空と岸の照り返しで日陰を持ち上げる
    dayBounce: 1.4, bounceGround: 0x6a6048,
    drawTimeUnitParts: true, // 骨と具足の逆行列を描く時にそろえ、移動後の手・笠・槍を取り残さない。
    keepPinnedArrowSize: true, // 胴や骨の倍率で刺さった矢を長槍ほどに伸ばさず、飛来時の実寸を保つ。
    pinnedArrowAxisScale: true, // 斜めに刺さった矢も、親の変換を含めた各軸の長さを保つ。
    pinnedArrowRenderScale: true, // 通常の親子の行列更新に合わせ、描く時の体格で一度だけ矢を補正する。
    naturalArrowRain: true, // 遠い矢を黒い染みの太さに広げず、細い矢と薄い影にする。
    arrowRainPerBow: 1, // 少数の射手から最低三十六本の補助矢を増やさない。本来の射矢は残す。
    bankCloth: true, // 門徒の小袖は戦うため袖と裾を絞る。僧の直綴の広い袂と分ける。
    settleSideFalls: true, // 横へ斬られた兵も、倒れ切った後は地面へ寝かせる。
    groundedFalls: true,
    drawTimeUnitParts: true, // 日送り・旋回後の骨と具足を描く時にそろえ、手から離れた槍や浮く部品を抑える。
    contactDust: true, // 近い兵が踏ん張る時も、共通の固定枠で岸の泥と低い飛沫を出す。
    wetEarthBursts: true,
    variedMarch: true, // 泥の岸では列を保っても、一人ずつ足を踏み替える間をずらす。
    meleeGroundedFeet: true, // 近い兵の足合わせの枠を使い、岸の乱戦でも踏ん張る足を地へ据える。
    livingSpearHedge: true, // 後列も前の味方の押し合いへ反応する。隊と兵の人数は増やさない。
    fallPaceSpread: .35, // 傷による崩れ方を残し、倒れる速さだけ人ごとにばらす。
    longHoro: 'round', // 使番の母衣は既存の丸い竹籠を使う。細い板のような尾にしない。
    fogFar: 320,
    // 10/30 vis_f：岸の地面が暗く沈んでいた（地面の画素の明るさ 24/255）。空と地の照り返しだけを強める（光の値だけ）。
    dayBounce: 1.35, bounceGround: 0x5e5240,
    // 10/29 夜：川面から空へ立つ灰の板（視点に追従する光の筋）が宙に浮いて見えた。長島では出さない。
    noShafts: true,
    battleViewDistance: 110, // 八十歩の霞で対岸の願証寺の大屋根が白く消えた（10/29）。兵数と地形の細かさは増やさない。
    mountainScale: .28, // 河口の輪中から見える遠い山並み。四方を高山で囲まない。
    noticeRepeatGap: 8, // 持ち場へ戻る案内を再び出せるようにする。同文の間隔は共通処理で守る。
    muddy: 0.7,
    autumn: true,
    softPathSoil: true, // 作業道と湿った岸をなじませ、格子ごとに泥の境が切り替わらないようにする。
    wetFieldRuts: 'wear', // 既存の沖積土の色と照りの抑制を使う。踏み跡だけを残し、雨の轍は足さない。
    // 輪中の地を茶の一枚にしない（10/30）：乾いた沖積の灰茶・葦の根の灰緑と枯れ色・湿った黒い泥の差を広げる。色の定数だけ。
    soilTones: { grass: [[.075, .1, .045], [.2, .205, .1]], dirt: [[.14, .125, .1], [.26, .235, .185]], mud: [[.04, .038, .032], [.085, .076, .06]] },
    patchyGround: true, // 岸の土にも湿乾のむらと草の切れ目を残す。
    // 10/30 ground_photo：25秒の画面の地面の57%は土の絵（作り置きの無地の土）で、茶の一枚に見えた。土と泥を、湿った泥の塊の写真
    //   （Poly Haven brown_mud_03・CC0。葦の根元は既存の葦の株）に替え、上の soilTones へ寄せる量を下げて写真の色を残す。絵の数は前と同じ。
    groundPhoto: { dirt: 'nagashima', mudFromSoil: true, scale: 0.16, contrast: 1.5 }, photoSoilMix: 0.3,
    plainGrassGround: true, // 草地の絵にも円い窪みがある。土と泥だけ替えても岸の縁に輪が残る。
    stableSlopeGrain: true, // 柵際の低い堤でも、法線の向きで地肌を回して縞へ引き伸ばさない。
    softEarthCrust: true, // 土塊の升の境を陰で囲まず、敷石状の継ぎ目を弱める。
    sparseEarthCrust: true, // 乾いた岸にも同じ土塊を敷き詰めず、既存の斑で間引く。
    subtleMudRelief: true, // 泥の窪みは踏まれた所へ限り、岸一面の同じ刻みを避ける。
    // 七巡目：写真の井桁組みのように柱を垂直にし、横木の重ね順を交互にする。
    // 共通の近景・遠景の形を利用する。長島の指定した物見だけに適用。
    lookoutLogFrame: true,
    gateRoofBacking: true, // 木戸の葺き板の下を既存の野地板で閉じ、屋根の隙間から空を見せない。
    curvedRockTufts: true, // 岩の根草は黒い三角一枚でなく、既存の細く曲がる葉を使う。
    litRockTufts: true, // 葉の裏にも空の光を残し、岸の根草を黒い刃にしない。
    groundedSlopeRocks: true,
    rockSlopeContact: true, // 岸の傾きに向く腹と縁まで接地し、回転した石の下へ隙間を残さない。
    rockBuriedRim: true, // 石の下端だけでなく縁も泥へ埋め、薄い台座が浮く見え方を抑える。
    rockDrawGround: true, // 岩と根草は、描く地面の面へ据える。
    rocks: 0, // 輪中の持ち場に散布岩とその根草を並べない。川石・泥・岸にまとめた葦は残す。
    riverCross: true,
    waterFireReflections: true,   // 11/10 終わりの火を川面に映す（長島だけの絵。共通の三枠の反射）
    // 堤を渡る川筋の水面は、盛った堤の高さで持ち上げない。堤の両脇の水面を真っ直ぐつなぐ。
    prepareTerrain(W) {
      const lv = (x, z) => Math.min(W.heightAt(x, z) + CH_STREAM.depth - .15, W.heightAt(x, z + CH_STREAM.w) - .15, W.heightAt(x, z - CH_STREAM.w) - .15);
      CH_STREAM.levelAt = (x, z) => {
        if (Math.abs(x - DIKE.x) >= 10) return lv(x, z);
        const a = lv(DIKE.x - 10, z), b = lv(DIKE.x + 10, z);
        return a + (b - a) * (x - DIKE.x + 10) / 20;
      };
    },
    waterSlow: true,   // 川・水路が本当に足を遅くする（terrain_tags.js の 'water' タグ。「敵の強さは水」）
    paths: [[[0, 150], [0, 40], [0, BANK_Z + 2]], ...FORT_ROADS, ...PEOPLE_PATHS, [[-44, -71], [-44, -76]], [[-44, -88], [-38, -88]], [[-44, -71], [-38, -71]]],
    height,
    tint(x, z, h, c) {
      // 葦の生えた川べりと、島の泥
      if (z < 35 && z > -48 && Math.abs(x) < 145) {
        c.lerp({ r: 0.43, g: 0.38, b: 0.27 }, 0.7);
        // 手前の輪中の堤（岸から二十歩ほど）は枯れかけの草の斑。人の通る中央の泥道は土のまま。
        if (z > BANK_Z - 2 && z < BANK_Z + 22) {
          const patch = .5 + .5 * Math.sin(x * .41 + Math.sin(z * .23) * 2.2) * Math.cos(z * .37 - x * .11);
          const road = Math.max(0, Math.min(1, (Math.abs(x) - 3) / 4));
          const fade = Math.min(1, (z - BANK_Z + 2) / 3, (BANK_Z + 22 - z) / 6);
          c.lerp({ r: 0.36, g: 0.38, b: 0.24 }, (.25 + .45 * patch) * road * fade);
        }
        // 10/30 vis_f：岸を茶の一枚にしない。十五〜三十歩の斑で、葦の根の灰緑・乾いた灰茶・湿った黒い泥を分ける（頂点の色だけ）。
        // 前の soilTones は塗りの後段で沈み、点付けの画面の地面の画素は平均 2.8/765 しか変わらなかった。草・土・泥の割合そのものを斑にする。
        const big = Math.sin(x * .2 + Math.sin(z * .14) * 1.8) * Math.cos(z * .17 - x * .07);
        const road2 = Math.max(0, Math.min(1, (Math.abs(x) - 4) / 5));
        c.lerp({ r: 0.3, g: 0.37, b: 0.2 }, Math.max(0, Math.min(1, (big - .2) / .4)) * .65 * road2);
        c.lerp({ r: 0.25, g: 0.22, b: 0.18 }, Math.max(0, Math.min(1, (-big - .3) / .4)) * .6 * road2);
      }
    },
    // 踏み荒らした窪みの水たまり（見た目だけ。足の遅れや兵の道には入れない）。中央の作業道は避ける。
    puddles(x, z) {
      if (!(z < 32 && z > BANK_Z && Math.abs(x) < 140) || Math.abs(x) < 5) return 0;
      const n = ngSoilNoise(x, z);
      // 10/30 vis_f：地面の頂点は 2.5m 置き。細い窪みは頂点に乗らず、点付けの画面の地面の 0.7% しか水にならなかった（晴れで uWet=0 のため雨溜まりの塗りも出ない）。
      // 窪みの斑を頂点に乗る広さへ広げる。見た目だけで、足の遅れ・兵の道には入れない。
      return .95 * smoothstep(.56, .7, n.a) * (1 - smoothstep(.5, .7, n.b));
    },
    clear: (x, z) => (Math.abs(x) < 145 && z > -140 && z < 50),
    get streams() { return TOWN_STREAMS; },
    // 輪中の外の田
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 34) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
    },
    trees: 200,
    // 輪中の川辺は雑木を主にし、岸一面を細長い杉の列にしない。木の総数は保つ。
    treeMix: { sugi: .08, matsu: .3 },
    branchFoliage: true, // 杉・松・雑木を、透ける葉房と枝の重なりで描く。
    foldedNeedleCards: true,
    layeredNeedles: true, // 既存の枝先の起伏を使い、杉を積んだ円錐の形にしない。
    raggedNeedles: true,
    unevenCrowns: true, // 松と雑木の丸い房も崩す。既存の頂点を動かし、木や描画の数は増やさない。
    softFarNeedles: true, // 遠い杉も既存の枝先の形を使う。木の本数は増やさない。
    // 遠景だけ灰白色に浮かないよう、既存の葉色へ緑の濃淡を掛ける。
    farTreeTint: new THREE.Color(0.8, 0.95, 0.7),
    tufts: 6000,
    treeDensity: (x, z) => (z > -110 && z < 60 ? 0.08 : 0.5),
    groves: [{ x: -90, z: 30, r: 12, n: 14 }, { x: 96, z: 40, r: 12, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z > 150 || Math.abs(x) > 180),
    fleeWay(army, u, goal) {
      const bt = u.retreatBoat, q = u.boatSeat;
      if (!bt || !q || q.aboard || !bt.landed || bt.z < -24 || bt.flood >= .2) return goal;
      q.shore.x = bt.x; return q.shore;
    },
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  depth: nagashimaDepth,   // 布陣図（docs/fujin/nagashima.md）：織田七万の三方の陣を川の手前に（nagashima/fujin.js）
  setup(rt) {
    {
      const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor;
      P.takeDamage = function (a, s) {
        const missile = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
        // 命を減らす前に刃の被害を調整する。戻り値だけ縮めても実際の傷は軽くならない。
        return td.call(this, s && !s.isStruct && !missile ? a * k : a, s);
      };
    }
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの岸のぬかるみ・葦・矢（def.timeslip）
    // 岸一面の同じ足形・窪みは、凹凸の処理だけでなく土と泥の絵にも焼かれている。
    // 高画質でも写真への切替を通さず、足形を省いた地肌を共用する。実際の踏み跡・湿りのむらは残す。
    // 10/30 ground_photo：土と泥は def.groundPhoto の写真（作り置きの無地の土・共用の泥の写真には戻さない）。
    // 秋の河口の岸を白い雪原にしない。土の濃淡を残し、空の反射を抑える。
    W.terrain.material.color.setHex(0xaaa286);   // 橙の一枚に見えないよう、赤みを抜いた湿った土
    W.terrain.material.envMapIntensity = .15;
    deltaSkyline(W);
    F.wadeX = rt.player.u.pos.x; F.wadeZ = rt.player.u.pos.z; F.wadeDist = 0; F.wadeSide = 1;
    fleetMist(rt);
    boatInstancer(rt);
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { wajuu: 'HIST_A', kuki: 'HIST_A', surrender: 'HIST_A', counterattack: 'HIST_A', fire: 'HIST_A', forts: 'HIST_B', fortPositions: 'GAME_C', temple: 'HIST_B', localHold: 'GAME_C' };
    F.step = 0; F.built = 0;
    F.hurtEdge = document.createElement('div'); F.hurtEdge.setAttribute('aria-hidden', 'true');
    F.hurtEdge.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;box-shadow:inset 0 0 36px 10px rgba(120,42,28,.25);display:none';
    document.body.appendChild(F.hurtEdge);
    F.localStyle = document.createElement('style');
    // 通し確認で兵数が上端で欠け、任務と重なっていた。長島の間だけ上の釦・任務の下へ置く。
    F.localStyle.textContent = '#vignette.hurt,#vignette.dying,body.rm #vignette.dying{animation:none!important;box-shadow:inset 0 0 48px rgba(110,34,24,.25)!important;background-color:transparent!important}#brinkfx{opacity:.25!important}html:root body #hud#hud.nagashima-bank #armybar#armybar{top:calc(52px + env(safe-area-inset-top,0px))!important;max-height:none!important;overflow:visible!important}';
    // 携帯の通し確認：在所の任務と人数が二行に折れていた。場所と行い・人数を残して収める。
    F.localStyle.textContent += '@media(max-height:500px){html:root body #hud#hud.nagashima-bank #h-prog.goal-mode{width:min(360px,44vw)}html:root body #hud#hud.nagashima-bank #h-prog.goal-mode .pg-goals li.now{font-size:max(15px,calc(15px * var(--text-scale,1)));line-height:1.3;gap:6px}html:root body #hud#hud.nagashima-bank #h-prog.goal-mode .pg-goals li.now em{font-size:max(12px,calc(12px * var(--text-scale,1)))}}';
    rt.hud.root.classList.add('nagashima-bank');
    document.head.appendChild(F.localStyle);
    // 槍の手ほどきの字は出さない（kaito 五1：説明・案内の字を出さない）。手応えは音と動きで分かる。
    const flash = rt.hud.flash;
    rt.hud.flash = function (text, ...args) {
      if (text.startsWith('槍衾の正面は突きが通りにくい') || text === '防がれた') return;
      return flash.call(this, text, ...args);
    };
    const notices = rt.hud.notices, pushNotice = notices.push;
    notices.push = function (text, ...args) {
      if (text.includes('刃が光った') || text.includes('大きく振りかぶった')) return;
      if (text === '血が止まらない。味方の後ろで座って布で止めよ。「血を止める」を三秒長押し') text = '血が止まらない。味方の後ろで座り、傷を縛れ';
      else if (text === '血が止まらない。布は使い切った。味方の後ろへ退き、戦の後は宿へ') text = '血が止まらない。布がない。味方の後ろへ退け';
      return pushNotice.call(this, text, ...args);
    };
    const say = rt.say, speechTimes = new Map();
    rt.say = function (name, text, ...args) {
      // 嘆きを別の文へ言い換える前に止め、降伏前と火の場へ討死の決まり文句を漏らさない。
      if ((F.step < 3 || F.ending || F.advEnding) && name !== '伝令' && name !== '語り' && /無念|朋輩/.test(text)) return;
      if (/^(?:柴田)?勝家$/.test(name) && text.includes('無念') && F.shibaU?.alive && !F.shibaU.woundOut && !F.shibaU.rearWound) text = '仲間が倒れた。残る者はわしの後ろへ来い！';
      // 11/6 fixc2220（critic60 一2）：手の大将は足軽一人に直に下知しない。足軽への細かな下知は組頭の口から。大将は法螺・槍組の号令だけ。
      if (name === '柴田勝家' && !rt.G.lord && !/法螺|槍組を回す|わしの後ろ/.test(text)) name = '組頭';
      // 11/6 fixc2220（critic60）：降る前の小競り合いや火の場で、共通の「敵が崩れた・逃げ腰・横槍・朋輩が」を言わせない。
      if ((F.step < 3 || F.ending || F.advEnding) && name !== '伝令' && name !== '語り' && /逃げ腰|崩れた|崩した|逃げるぞ|背を見せ|横槍|朋輩|無念|追い散らす|持ち場を離れるな|死に場所|かかれ|突け、突け|ひるむな|槍を揃えよ|押せ|備えを固め/.test(text)) return;
      // 字幕を省いて声だけになる経路にも、同じ文の間隔を通す。言い回しだけ違う同じ下知（縄・杭・横木）も一つに数える。
      const key = /杭|縄を確か/.test(text) ? '杭'
        : /横木/.test(text) && name !== '柴田勝家' ? '横木'
          : /追うな/.test(text) ? '追撃を止める下知'
            : /川を向/.test(text) ? '川を向く下知'
              : String(text).replace(/[\s、。！!？?「」]/g, '');
      if ((speechTimes.get(key) ?? -Infinity) + 15 > this.t) return;
      speechTimes.set(key, this.t);
      return say.call(this, name, text, ...args);
    };
    // 合戦中の行き先は一枚。任務と台詞に名札を重ねない。
    const marker = rt.marker;
    rt.marker = function (id, at, text, ...args) {
      // 十五秒の退避中は、舟や縄の案内で槍組への印を消さない。
      if (F.step >= 2 && dangerProgress(this) && id !== 'retreat') return;
      if (F.step >= 2) for (let i = this.markers.length - 1; i >= 0; i--) this.unmark(this.markers[i].id);
      return marker.call(this, id, at, text, ...args);
    };
    // 一度退避した後も、次の寄せで深手なら槍組を呼べる。
    const playerDamage = rt.army.hooks.playerDamage;
    rt.army.hooks.playerDamage = function (amount, src) {
      const u = rt.player.u;
      if (F.dangerDone && rt.t - F.dangerAt >= 30) {
        F.dangerAt = null; F.dangerDone = false; F.dangerReached = false;
      }
      if ((F.step === 3 || F.step === 3.5) && src?.team !== u.team && (u.hp <= u.maxHp * .55 || amount >= u.hp * .5)) dangerWarning(rt);
      return playerDamage.call(this, amount, src);
    };
    const dispose = rt.dispose;
    rt.dispose = function (...args) { rt.hud.flash = flash; notices.push = pushNotice; rt.hud.root.classList.remove('nagashima-bank'); F.hurtEdge.remove(); F.localStyle.remove(); return dispose.apply(this, args); };
    // 骨の体格切り替えを矢へ伝えない。命中時だけ調べ、兵の移動と向きには追従させる。
    const pinArrow = rt.army.pinArrow;
    rt.army.pinArrow = function (a, life, parent, support) {
      const ground = !parent && !support;
      if (parent && !support) for (const u of this.units) {
        if (u.armorWear?.root === parent) { parent = u.mesh; break; }
      }
      const result = pinArrow.call(this, a, ground ? Math.min(life, 7) : life, parent, support);
      if (ground && a.stuck) {
        a.pos.y -= .04 + Math.random() * .14;
        a.mesh.rotateX((Math.random() - .5) * .45); a.mesh.rotateZ((Math.random() - .5) * .4);
      }
      return result;
    };
    // 流れと空の映りは残し、濁った河口を鏡のような白い板にしない。
    for (const st of W.def.streams || []) if (st.mesh) {
      st.mesh.material.color.setHex(0x344d43); st.mesh.material.roughness = .55;
      st.mesh.material.envMapIntensity = .45;
      // 足は川床に置いたまま、濁り水の下の脚を隠す。膝の深さも実際の水面に合わせる。
      st.mesh.material.transparent = false; st.mesh.material.opacity = 1; st.mesh.material.depthWrite = true;
      // 本流だけ：流れに沿って動く濃淡の筋と、浅い角度で空を映す照り（資料との差 10/29：平らな灰青で流れなし）。描く回数・形は増やさない。
      // 入り江と引き込み水路：浅い角度ほど空を映し、岸の葦と土の暗い映りを縁に揺らがせる（10/29 夜：鈍い灰の一枚だった）。
      // 縁の目安は水面の左右の頂点に付けた ±1 の値。形・描く回数は増やさない。
      // 11/3：五拠点を分ける分流・中江と屋長島の間の水路・長島城の川堀も同じ濁り水に（白い石の溝に見えた。輪中の川は泥の色）。
      if (st === INLET || st === CANAL || st === MOAT_W || st === MOAT_E || RIVER_STREAMS.indexOf(st) >= 1) {
        const g = st.mesh.geometry, cnt = g.attributes.position.count, cross = g.userData.waterCross || [1, -1];
        const edge = new Float32Array(cnt); for (let i = 0; i < cnt; i++) edge[i] = cross[i % cross.length];
        g.setAttribute('waterEdge', new THREE.BufferAttribute(edge, 1));
        st.mesh.material.roughness = .4; st.mesh.material.envMapIntensity = .4;
        const m = st.mesh.material, base = m.onBeforeCompile, key = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => {
          base.call(m, sh, r);
          sh.vertexShader = 'attribute float waterEdge; varying float vWaterEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterEdge = waterEdge;');
          // 10/30：浅い溜まりと水路が淡い青白の板に見えた（照りを足した後で暗くしても、空の照りと環境の映りが残った）。
          //   色を一から決める：濁った緑茶の水の地に、流れに沿って動く明暗の筋、さざ波で砕いた曇り空の映り、岸の暗い映り、筋の頂の細かな照り。
          //   共通の水（water_body.js）の波・照りは後から重なり、空の照りが明るすぎて白く飛ぶ。照らしの後（色の変換の前）で共通の明るさを曇り空ほどに抑えて混ぜ、近くの霞を戻す。
          sh.fragmentShader = 'varying float vWaterEdge;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `vec3 npCol = vec3(0.0);
          {
            vec3 rv = normalize(cameraPosition - vWPw);
            float fres = 0.05 + 0.95 * pow(1.0 - clamp(rv.y, 0.0, 1.0), 5.0);
            vec2 fd = normalize(vWaterFlow + vec2(0.00001));
            float al = dot(vWPw.xz, fd), ac = dot(vWPw.xz, vec2(-fd.y, fd.x));
            float s1 = texture2D(tMacro, vec2(ac * 0.11, al * 0.025 - uTime * 0.05)).r;
            float s2 = texture2D(tMacro, vec2(ac * 0.33 + 0.37, al * 0.07 - uTime * 0.12)).r;
            float streak = smoothstep(0.52, 0.8, s1 * 0.55 + s2 * 0.6), band = smoothstep(0.3, 0.65, s1);
            float wob = texture2D(tMacro, vWPw.xz * 0.35 - fd * uTime * 0.04).r - 0.5;
            vec3 body = vec3(0.035, 0.045, 0.032) * (0.75 + band * 0.55);
            float cl = texture2D(tMacro, vWPw.xz * 0.03 + rv.xz * 0.5 + vec2(wob * 0.06)).r;
            vec3 sky = min(uWaterSky, vec3(0.9)) * (0.15 + cl * 0.12);
            vec3 col = mix(body, sky, clamp(fres * (0.4 + streak * 0.55 + wob * 0.3), 0.0, 0.42));
            float bankR = smoothstep(0.4, 0.95, abs(vWaterEdge) + wob * 0.3);
            col = mix(col, vec3(0.06, 0.06, 0.045), bankR * 0.65);
            col += sky * streak * (0.12 + fres * 0.18) * (1.0 - bankR);
            float g1 = texture2D(tMacro, vWPw.xz * 0.21 - fd * uTime * 0.06).r;
            float g2 = texture2D(tMacro, vWPw.xz * 0.47 + vec2(0.31) - fd * uTime * 0.1).r;
            col += vec3(0.9, 0.87, 0.78) * pow(clamp(g1 * g2 * 2.6 - 1.22, 0.0, 1.0), 1.5) * (0.25 + fres * 0.6) * (1.0 - bankR);
            npCol = col; outgoingLight = col;
          }
          #include <opaque_fragment>`).replace('#include <tonemapping_fragment>', `{ vec3 npC = gl_FragColor.rgb;
            npC = clamp(npC, vec3(0.0), vec3(4.0));
            npC *= min(1.0, 0.1 / max(dot(npC, vec3(0.2126, 0.7152, 0.0722)), 0.001)); gl_FragColor.rgb = mix(npC, npCol, 0.75); }
          #include <tonemapping_fragment>`).replace('#include <fog_fragment>', `vec3 npPre = gl_FragColor.rgb;
          #include <fog_fragment>
          gl_FragColor.rgb = mix(gl_FragColor.rgb, npPre, 0.5 * (1.0 - smoothstep(40.0, 140.0, length(vWPw - cameraPosition))));
          ${NW_WAVES}`).replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = 1.0;');
        };
        m.customProgramCacheKey = () => key() + '|nagashimaPool9';
        m.needsUpdate = true;
      }
      if (st === RIVER_STREAMS[0]) {
        { const g = st.mesh.geometry, cnt = g.attributes.position.count, cross = g.userData.waterCross || [1, -1];
          const edge = new Float32Array(cnt); for (let i = 0; i < cnt; i++) edge[i] = cross[i % cross.length];
          g.setAttribute('waterEdge', new THREE.BufferAttribute(edge, 1)); }
        const m = st.mesh.material, base = m.onBeforeCompile, key = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => {
          base.call(m, sh, r);
          sh.vertexShader = 'attribute float waterEdge; varying float vWaterEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterEdge = waterEdge;');
          sh.fragmentShader = 'varying float vWaterEdge;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `{
            vec2 fd = normalize(vWaterFlow + vec2(0.00001));
            float al = dot(vWPw.xz, fd), ac = dot(vWPw.xz, vec2(-fd.y, fd.x));
            float n1 = texture2D(tMacro, vec2(ac * 0.045, al * 0.008 - uTime * 0.035)).r;
            float n2 = texture2D(tMacro, vec2(ac * 0.16 + 0.37, al * 0.022 - uTime * 0.08)).r;
            float streak = smoothstep(0.55, 0.78, n1 * 0.5 + n2 * 0.6), band = smoothstep(0.35, 0.6, n1);
            vec3 vd = normalize(cameraPosition - vWPw);
            float graze = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);
            // 10/29 夜：空を映した灰の一枚に見えた。手前ほど濁った河口の緑茶へ沈め、筋の明暗を強める。
            float nearW = 1.0 - smoothstep(25.0, 150.0, length(vWPw - cameraPosition));
            outgoingLight = mix(outgoingLight, vec3(0.13, 0.16, 0.11) * (0.75 + band * 0.6), nearW * 0.6);
            outgoingLight = mix(outgoingLight, uWaterSky * 0.75, graze * 0.1);
            outgoingLight += uWaterSky * streak * (0.22 + graze * 0.12);
            outgoingLight *= 0.66 + band * 0.46;
          }
          #include <opaque_fragment>`).replace('#include <fog_fragment>', `vec3 nwPre = gl_FragColor.rgb;
          #include <fog_fragment>
          {
            // 霞は遠い岸に残し、手前三十〜百歩の川面は霞で白い一枚に塗りつぶさない。
            float nwD = length(vWPw - cameraPosition);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, nwPre, 0.55 * (1.0 - smoothstep(50.0, 150.0, nwD)));
            // 後から重なる空の映りで銀の一枚に戻らないよう、霞の後で濁り水の緑茶と流れの筋を重ねる。
            vec2 md = normalize(vWaterFlow + vec2(0.00001));
            float mal = dot(vWPw.xz, md), mac = dot(vWPw.xz, vec2(-md.y, md.x));
            float m1 = texture2D(tMacro, vec2(mac * 0.045, mal * 0.008 - uTime * 0.035)).r;
            float m2 = texture2D(tMacro, vec2(mac * 0.16 + 0.37, mal * 0.022 - uTime * 0.08)).r;
            float mStreak = smoothstep(0.55, 0.78, m1 * 0.5 + m2 * 0.6), mBand = smoothstep(0.35, 0.6, m1);
            vec3 murk = vec3(0.15, 0.18, 0.13) * (0.7 + mBand * 0.7) + uWaterSky * mStreak * 0.22;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, murk, 0.55 * (1.0 - smoothstep(35.0, 140.0, nwD)));
            ${NW_WAVES}
            // 日の照り：流れに乗って動く細かな光の粒。二つの粗い模様が重なった所だけ光る。
            vec2 gd = normalize(vWaterFlow + vec2(0.00001));
            float g1 = texture2D(tMacro, vWPw.xz * 0.11 - gd * uTime * 0.05).r;
            float g2 = texture2D(tMacro, vWPw.xz * 0.23 + vec2(0.5) - gd * uTime * 0.09).r;
            float glint = pow(clamp(g1 * g2 * 2.6 - 1.25, 0.0, 1.0), 1.5);
            vec3 gv = normalize(cameraPosition - vWPw);
            gl_FragColor.rgb += vec3(1.0, 0.94, 0.8) * glint * (0.45 + pow(1.0 - clamp(gv.y, 0.0, 1.0), 3.0) * 1.1) * (1.0 - smoothstep(40.0, 180.0, nwD));
            // 岸の映り（10/29 夜）：両岸の葦と土手が水際に暗く落ち、さざ波で縦に揺らぐ。空の照りは筋と粒のまま増やさない。
            float rWob = texture2D(tMacro, vec2(mac * 0.9, mal * 0.05 - uTime * 0.04)).r - 0.5;
            float rBank = smoothstep(0.62, 0.97, abs(vWaterEdge) + rWob * 0.18);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.11, 0.11, 0.075), rBank * 0.55 * (1.0 - smoothstep(60.0, 220.0, nwD)));
          }`);
        };
        m.customProgramCacheKey = () => key() + '|nagashimaFlow';
        m.needsUpdate = true;
      }
    }
    if (W.footWaves) W.footWaves.mesh.material.opacity = .65;
    bankReeds(rt);
    { const reed = shoreReedBelt(rt); inletDressing(rt, reed); canalDressing(rt, reed); moatDressing(rt, reed); farBankDressing(rt, reed); wajuuFloor(rt, reed, boatRows(rt)); }
    bankBow(rt);
    // 戦功は戦後に数える。戦の最中に正確な点数や上限を知る札は出さない。
    rt.award = function (fn) { const before = this.tracker.raw(); fn(this.tracker); return this.tracker.raw() - before; };
    F.sallyHeld = 0; F.finalHeld = 0; F.broken = false;
    retreatBoats(rt);
    boatTick(rt, 0);
    // 実際に舷へ当たった矢玉だけ穴を開ける。乗員の傷を船の被害へ二重に数えない。
    const impact = rt.army.projectileImpact;
    rt.army.projectileImpact = function (x, y, z, type, nx, nz) {
      const hull = this._missileHit?.object;
      if (F.step >= 2 && hull?.boat && type === 'wood') hull.boat.holes++;
      return impact.call(this, x, y, z, type, nx, nz);
    };
    surroundForts(rt, false);
    F.closures = [];
    for (const [x, z] of [[0, -49], [48, -52]]) {
      const segs = wallLine(rt, [[x - 3, z], [x + 3, z]], { team: 0, hp: 700, name: '包囲の口の横木', segLen: 3, mesh: workFence });
      for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = .02; q.fireProof = true; q.noClimb = true; }
      const g = allyGroup(rt, { fixed: true, name: '囲みの人足', noAI: true, anchor: { x, z: z + 2 }, formation: 'line', width: 2, facing: Math.PI, aggro: 0, seekRange: 0 }, [{ type: 'ashigaru', n: 2 }]);
      F.closures.push({ segs, g, x, z: z + 2, t: 0 });
    }
    // 二か月余の兵糧攻め。舟の退城と補給を取り違えない。
    F.kakoi = makeKakoi({ day: 60, foodDays: 5, morale: 60 });
    for (const g of F.last) campWear(g, 30, F.kakoi.morale);
    flagTexture('namu');
    // 五拠点の縄張りと地形を同じデータから作る。新しい守兵は置かない。
    F.C = buildCastlePlan(rt, NAGASHIMA_ALL_PLAN, { baseHeight, perch: false, life: false });
    for (const s of F.C.walls) { s.noTarget = true; s.wall = true; s.fireProof = true; s.hp = s.maxHp = 1e9; }
    F.fwall = F.C.walls.filter(s => s.name === '長島城');
    F.ywall = F.C.walls.filter(s => s.name === '屋長島の砦');
    for (const gate of NAGASHIMA_ALL_PLAN.koguchi) {
      if (gate.id === 'nagashima_gate') {
        // 長島の表口だけ板壁・板葺きの渡櫓。入口四メートルと開いた戸を保つ。
        // 共通部品自身が渡櫓の床・窓・上がり口と、脇の台の当たりを作る。
        const gm = yaguramon(W, gate.at[0], gate.at[1], gate.w, Math.PI, { earth: true });
        rt.scene.add(gm);
        // 見た目だけ買った城の部品の櫓門（板壁の仕上げ）に替える。当たり・入口・床は手作りのまま
        kitReplace(gm, castleStyle(W), (p) => kitGateObj4(p, { x: gate.at[0], z: gate.at[1], rot: Math.PI, y: interiorBase(W, gate.at[0], gate.at[1], gate.w + 5.6, 4.2, Math.PI) - 0.05, Lw: gate.w + 5.6, D: 4.4, Ht: 7.7 }), { gate: true });
        continue;
      }
      // 土塁の坂に扉の下端を合わせる。中央の高さだけで戸を置き、端を浮かせない。
      rt.scene.add(kabukimon(W, gate.at[0], gate.at[1], gate.w, 0, { groundedGate: true, slopeDoorBottom: true }));
      // 開いた木戸の柱と控柱だけに当たり。扉の通り道は空ける。
      for (const side of [-1, 1]) for (const dz of [0, -1.6]) solidRect(gate.at[0] + side * (gate.w / 2 + .17), gate.at[1] + dz, .4, .4);
    }
    F.fortTowers = NAGASHIMA_ALL_PLAN.yagura.map(t => {
      const tower = monomi(rt, t.at[0], t.at[1], {
        name: t.name, team: 1, mon: 'namu',
        ...({ ...t.lookout, crossLashings: true }),
      });
      // 井楼の床・梯子口は外の形にある。室内側の戸枠を空中へ重ねない。
      tower.naka.hasExterior = true;
      return tower;
    });
    // 長島城の木戸脇だけ低い留め石。総石垣にはしない（北伊勢の一般形からの推定）。購入した城部品を利用。
    const stoneBatch = makeKitBatch(), entryStones = [];
    for (const x of [148.5, 155.5]) {
      const top = W.heightAt(x, -66.5) + .2;
      const stone = ishigaki(W, [[x, -68], [x, -65]], { minH: 1, maxH: 1.2, topY: top, out: x < 152 ? -1 : 1, batch: stoneBatch, noKit: true });
      if (!stone.isBatchedPart) rt.scene.add(stone);
      solidRect(x, -66.5, .8, 3, 0, top);
      entryStones.push({ stone, ax: x, az: -68, bx: x, bz: -65, topAt: () => top, botAt: () => top - 1.2, side: x < 152 ? -1 : 1, extA: 0, extB: 0, seed: Math.round(x), zs: .3 });
    }
    finalizeKitBatch(rt, stoneBatch);
    whenCgt(() => {
      if (cgtScene() !== rt.scene || !cgtSpend(9000)) return;
      const kb = new KitBatch(); for (const seg of entryStones) kitStoneSeg(kb, seg);
      if (!kb.n) return;
      rt.scene.add(kb.build({ shadow: false }));
      for (const seg of entryStones) seg.stone.visible = false;
    });
    const buildings = F.fortBuildings = fortRooms(rt);
    F.kuraStruct = buildings.castle_kura.struct; F.kuraStruct2 = buildings.castle_nagaya.struct; // 11/7：火は中江城（西の端）と屋長島
    F.yanaStruct = buildings.yana_kura.struct;
    F.karatoStruct = buildings.castle_hall.struct; F.tsutsumiStruct = buildings.bank_watch.struct; F.nakasuStruct = buildings.island_watch.struct;
    // 五巡目：写真の塀沿いの旗列。十本のまま、木戸・井楼の梯子・番所の戸口から離す。
    // 門徒の拠点なので念仏旗を保ち、本の清洲・岡崎の家紋は移さない。
    const fortFlags = true
      ? [[-24, -56.5], [-16, -54.5], [16, -54.5], [24, -56.5], [40, -55.8], [56, -55.8], [140, -68], [160, -68], [-53, -55], [56, -45]]
      : [[-26, -60], [-4, -58], [14, -58], [28, -62], [44, -60], [62, -66], [148, -72], [168, -76], [-53, -55], [56, -45]];
    for (const [x, z] of fortFlags) rt.scene.add(nobori(W, x, z, 'namu', 6));
    // 井戸と俵。川の水をそのまま飲む描写にせず、長島と二砦に井戸を推定する。
    const wellBag = [], wellRoofs = [], detailedWells = true;
    // 館の北軒と上屋を重ねず、井戸囲いは奥の土塁の内へ収める。
    for (const [x, z] of [[-20, -91], [61, -76], [146, detailedWells ? -109.2 : -108]]) {
      for (const [dx, dz, w, d] of [[-1, 0, .2, 2.2], [1, 0, .2, 2.2], [0, -1, 2.2, .2], [0, 1, 2.2, .2]]) {
        const g = ROOM_BOX.clone(); g.scale(w, .75, d); g.translate(x + dx, W.heightAt(x, z) + .38, z + dz); wellBag.push(g);
      }
      if (detailedWells) {
        const y = W.heightAt(x, z);
        const part = (dx, dy, dz, w, h, d, roof = false, rx = 0) => {
          const g = ROOM_BOX.clone(), uv = g.attributes.uv;
          const sizes = [[d,h], [d,h], [w,d], [w,d], [w,h], [w,h]];
          for (let f = 0; f < 6; f++) for (let n = 0; n < 4; n++) {
            const i = f * 4 + n; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]);
          }
          g.scale(w, h, d); g.rotateX(rx); g.translate(x + dx, y + dy, z + dz);
          (roof ? wellRoofs : wellBag).push(g);
        };
        // 本の屋敷内の小さな井戸を参考に、柱・横木・板葺きの雨覆いを自作する。
        // 支柱は既存の井戸囲いの内側。当たりと通行幅は増やさない。
        for (const side of [-1, 1]) part(side * .87, 1.35, 0, .14, 2.7, .14);
        part(0, 2.68, 0, 2.7, .16, .18);
        part(0, 1.72, 0, 2, .12, .12);
        // 釣瓶の縄と中空の桶。黒い円を貼るだけの井戸にしない。
        part(.15, 1.15, 0, .025, 1.1, .025);
        for (const side of [-1, 1]) {
          part(.15 + side * .17, .66, 0, .035, .3, .37);
          part(.15, .66, side * .17, .37, .3, .035);
          part(0, 2.47, side * .68, 2.9, .09, 1.48, true, side * .3);
          part(0, 2.52, side * .7, 3, .07, .09);
        }
        part(.15, .5, 0, .37, .04, .37);
        part(0, 2.72, 0, 3, .12, .18, true);
      }
      solidRect(x, z, 2.2, 2.2); rt.scene.add(tawara(W, x + 2, z + 2, 0, 3));
    }
    const wells = new THREE.Mesh(mergeGeometries(wellBag, false), ROOM_WOOD); wells.userData.camBlock = true; rt.scene.add(wells);
    for (const g of wellBag) g.dispose();
    if (wellRoofs.length) {
      const mesh = new THREE.Mesh(mergeGeometries(wellRoofs, false), ROOM_ROOF);
      mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
      for (const g of wellRoofs) g.dispose();
    }
    // ---- 願証寺の寺内町（中江の砦とは別の、宗教の中心。本堂・門・門徒屋敷・倉・船着場。大天守は無い） ----
    // 願証寺の室内図は不明。輪中の寺として、外陣と内陣・僧坊の座敷を推定する。
    F.teranaka = new Garan(rt);
    F.teranaka.build({ id: 'gansho_hondo', name: '願証寺の本堂', kind: 'hondo', profile: 'nagashima', x: GANSHO.x, z: GANSHO.z, w: 15, d: 12, h: 7, roof: 'thatch', enterable: true });   // 10/29 夜：対岸の柵と井楼の上に棟が抜けるよう一回り大きく（西の里道 x=-53 と包囲柵 x=-34 の間に収める）   // 輪中の門徒寺の茅の大屋根。瓦の灰は霞に溶けて薄く見えた（10/29）   // 柱を高くし、対岸から大屋根が柵の上に見えるように
    rt.scene.add(romon(W, GANSHO.x, GANSHO.z + 11, 5.2, 0));
    // 11/6 fixc1439：陣の後ろ（早尾口の本陣の奥）の門徒の支坊も外す。織田の囲みの内に南無の旗を立てない（一6）。
    farTemples(rt);
    // 炊煙の遠景の板は霞の中で四角い灰の板に見えた（10/29 夜）。煙は砦と寺の柱だけにする。
    rt.scene.add(village(W, GANSHO.x - 48, GANSHO.z + 2, { n: 6, r: 10, rot: 0.2, seed: 15748, smoke: 0 }));
    // 輪中の門徒の家並み（資料との差 10/28）：寺の西の輪中に在所を二つ。人の歩く道（PEOPLE_PATHS）からは外す。
    rt.scene.add(village(W, -134, -92, { n: 7, r: 16, rot: 0.05, seed: 15749, smoke: 0 }));
    rt.scene.add(village(W, -90, -112, { n: 4, r: 10, rot: -0.15, seed: 15750, smoke: 0 }));
    // 寺は中江の西の包囲柵（x=-34）より外。棟も石段も柵や本堂と重ねない。
    F.teranaka.build({ id: 'gansho_sobo', name: '願証寺の僧坊', kind: 'sobo', profile: SETTINGS.quality === 'high' ? 'nagashima' : undefined, x: GANSHO.x + 6, z: GANSHO.z - 10, w: 5, d: 4, rot: .15, enterable: true });
    F.teranaka.build({ id: 'gansho_kuri', name: '願証寺の庫裏', kind: 'kuri', profile: 'nagashima', x: GANSHO.x + 6, z: GANSHO.z + 10, w: 5, d: 4, rot: -.1, enterable: true });
    F.teranaka.finish(); darkThatch(F.teranaka);
    for (const [dx, dz] of [[-4, 13], [4, 13]]) rt.scene.add(nobori(W, GANSHO.x + dx, GANSHO.z + dz, 'namu', 6));
    // 門前の市（床の低い小屋と俵の店。寺内町は門徒の暮らしの町で、長島城や屋長島の砦の軍事の曲輪とは分ける）
    {
      // 六巡目：市だけ残っていた厚い草屋根を、写真の町小屋の灰茶の板葺きへ。
      // 念仏旗・門前の道幅・小屋の数はそのまま、城の瓦や他家の紋は持ち込まない。
      const mb = makeSimpleBatch();
      for (const [x, z, r] of MARKET_HUTS) hut(W, x, z, 3.4, 2.6, r, {
        wall: 0x8a7a58, h: 2.0, batch: mb,
        ...({ ita: true, minka: false, boardRoof: true,
          weatheredBoards: true, boardRoofColors: [0x827560, 0x756b59, 0x91816a, 0x6d6556] }),
      });
      finalizeSimpleBatch(rt, mb);
    }
    for (const [x, z] of [[-49, -63], [-39, -68]]) rt.scene.add(tawara(W, x, z, 0.4, 3));
    fortYardDetails(rt);
    // 船着場（島の北の水路ぎわ）と舟
    const dockZ = -132;
    rt.scene.add(tawara(W, GANSHO.x + 6, GANSHO.z - 18, 0.2, 4));
    for (const [dx, rot] of [[-6, 0.1], [4, -0.15]]) { const kb = riverBoat(GANSHO.x + dx, waterHeight(W, GANSHO.x + dx, dockZ), dockZ, rot); rt.scene.add(kb); }
    // 退城舟が渡る水路には飾り舟を置かない。横向きの無人舟が着岸する舟と交差していた。
    // 繋いだ舟は寺の船着場に残し、川口の封鎖は東の水軍と遠景の船団で示す。
    F.ganshoStruct = rt.army.addStruct({ x: GANSHO.x, z: GANSHO.z, r: 5, solidR: 0, hp: 220, maxHp: 220, armor: 0, team: 1, name: '願証寺の本堂', moraleOnBurn: 'big', flammable: true });
    // 既存の遠景の人数だけを保つ。砦の家や物見と重ならない広場へ寄せる。
    // 11/4 jin（AF）：砦の広場の絵の門徒（addDistantArmy）はやめた。籠もる者は本物の守兵と、煙と旗で示す。
    // 史実の放火は最後の下知でのみ行う。町・降伏する城を任務外の的にしない。
    for (const q of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.ganshoStruct, F.karatoStruct, F.tsutsumiStruct, F.nakasuStruct]) { q.noTarget = true; q.fireProof = true; }
    F.fireTargets = [];
    const fireBounds = new THREE.Box3();
    for (const b of FORT_BUILDINGS) if (b.id.startsWith('castle_') || b.id.startsWith('yana_')) {
      const q = buildings[b.id].struct; q.flammable = true;
      // 長屋は上で束ねた屋根の寸法、小屋は実際の屋根の上端を設営時に一度だけ調べる。
      q.bankFireRoof = b.enter ? 2.6 + (b.d / 2 + .6) * .4
        : fireBounds.setFromObject(buildings[b.id].mesh).max.y - W.heightAt(b.x, b.z);
      F.fireTargets.push(q);
    }
    // 結末の建物火を屋根から見せる。地面からの小火では板屋根と対岸の柵に隠れる。
    // 既存の炎・煙を同じ四枠で使い、炊ぎ火や降伏した長島城には適用しない。
    const addBankFire = W.addFire;
    W.addFire = function (x, z, o = {}) {
      const target = (F.ending || F.advEnding) && F.fireTargets.find(s => s.x === x && s.z === z);
      if (target && !o.torch) {
        // 小さな焚き火の煙では対岸の火災が伝わらない。同じ四枠の炎と煙を広げる。
        const size = Math.max(o.size || 1.3, 3.6);
        o = { ...o, size, h: target.bankFireRoof - size * .35, blackSmoke: true };
      }
      return addBankFire.call(this, x, z, o);
    };
    F.FS = attachFireSpread(rt, { C: F.C });
    // 中江の守り。下間頼旦がこの砦で指揮したとは確定できない。
    // 守将も個人の馬印も未確認。共通の金扇を置かず、念仏の旗で所属を示す。
    F.ikkoCamp = camp(rt, { x: 0, z: -80, facing: 0, team: 1, faction: 'ikko', mon: 'namu', noUma: true, armor: IKKO.armor, guard: 15, reserve: 0, runTo: { x: 0, z: -58 } });
    F.ikkoCamp.guard.name = '長島城の守り';
    F.ikkoCamp.guard.formation = 'yari';
    F.ikkoCamp.guard.noAI = true; // 籠城の守兵は、退城する舟を追って砦から出ない。
    F.ikkoCamp.guard.historicalOrders = true; // 共通の寄せ直しでも砦を離れない。
    // 包囲中の岸の応酬は復元。六人だけを対岸に置き、川を渡る架空の寄せにはしない。
    F.bankBows = [];
    for (const s of SPOTS) {
      const g = enemyGroup(rt, { fixed: true, faction: 'ikko', name: '対岸の弓と鉄砲衆',
        anchor: { x: s.x, z: CH_Z - 19 }, facing: 0, formation: 'line', width: 2,
        order: 'hold', aggro: 0, fire: false, noAI: true, noPursue: true, historicalOrders: true,
        fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'bow', n: 1, o: { range: 40, dmg: 5 } }, { type: 'gun', n: 1, o: { range: 48, dmg: 5 } }], IKKO));
      for (const u of g.units) {
        u.perch = { x: u.pos.x, y: u.pos.y, z: u.pos.z };
        u.bankPost = { x: u.pos.x, z: u.pos.z };
        u.noTarget = true;
      }
      F.bankBows.push(g);
    }
    // ---- こちらの岸：織田の陣（信長と旗本。後ろの大軍が控え） ----
    // 動かない控えは岸から後ろへ離す。目の前の反撃には、本当に戦う組だけを並べる。
    // 動かない控えは本陣の左右へ。岸の戦う兵のすぐ後ろに、棒状の近景を並べない。
    // 人数と短い槍は保ち、列の間隔も広げる。二月の籠城の炊ぎの煙は川向こうへ置く。
    // 11/4 jin（AF）：本陣の左右の絵の控え（addDistantArmy）はやめた。本陣は信長と本物の旗本だけ。
    for (const [x, z, sz] of [[FORT.x + 6, FORT.z - 6, 1.8], [GANSHO.x, GANSHO.z, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: sz });
    F.odaCamp = camp(rt, { x: 0, z: 60, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: 0, z: BANK_Z + 8 } });
    // 北向きの本陣では、護衛も前（北）へ。共通の南向き配置をそのまま使わない。
    F.odaCamp.guard.anchor.z = 46;
    F.odaCamp.guard.formation = 'yari';
    // 旗本は本陣を守る。指定がないと共通の頭が岸へ攻め出し、結った柵に取り付いてしまう。
    F.odaCamp.guard.guard = true;
    if (F.odaCamp.general) F.odaCamp.general.group.noAI = true;
    // 11/4 jin（AV7・AT3）：総大将の信長は後ろの本陣の床几に座り、前へ出ない
    if (F.odaCamp.general) F.odaCamp.general._crouch = true;
    for (const u of F.odaCamp.guard.units) {
      const at = F.odaCamp.guard.slotPos(u.slot, F.odaCamp.guard.initial);
      u.pos.set(at.x, W.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos);
    }
    rt.scene.add(tawara(W, -14, 52, 0.3, 6));
    for (const [x, z, k] of [[-8, 34, 'oda'], [8, 34, 'eiraku'], [-40, BANK_Z + 10, 'kari'], [40, BANK_Z + 10, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const s of SPOTS) rt.scene.add(tawara(W, s.x + 4, s.z + 8, 0.2, 2));
    // 包囲の普請場（資料との差 10/28：岸が泥の一枚だった）：結う前の丸太の山と縄・桶を作業点の間に。作業点と着岸口は空ける。
    for (const [x, z, r] of [[-9.6, BANK_Z + 3.2, 1.4], [10.2, BANK_Z + 3.6, 1.75], [-40, BANK_Z + 6, .1]]) rt.scene.add(lumber(W, x, z, r));
    extScatter(rt.scene, 'bucket', [{ x: -11.8, z: BANK_Z + 5.4 }, { x: 12.6, z: BANK_Z + 5.9, rot: 1 }], W);
    extScatter(rt.scene, 'sack', [{ x: -12.4, z: BANK_Z + 6.6, rot: .7 }, { x: 8.4, z: BANK_Z + 6.2, rot: 2.1 }], W);
    WOOD.map = DARK.map = woodTex(); WOOD.needsUpdate = DARK.needsUpdate = true;
    F.fenceWork = SPOTS.map((s) => wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '結いかけの柵', segLen: 5, mesh: workFence }));
    for (const segs of F.fenceWork) for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = 0.02; q.noClimb = true; }
    // 柴田の雁の幟は横木の両端より外へ。作業場と川への見通しを空け、持ち場の所属を示す。
    for (const x of [-10, 10]) {
      const banner = nobori(W, x, BANK_Z + 1, NAMED_GEAR['柴田勝家'].flag, 5);
      banner.traverse(c => { c.castShadow = false; });
      rt.scene.add(banner);
    }
    if (SETTINGS.quality === 'high') {
      // 長島での使用と据え場所は復元。馬印持ちへ兵を替えず、柵の後ろに据える。
      const mark = campMark('柴田勝家');
      mark.position.set(-3, W.heightAt(-3, BANK_Z + 15) - .9, BANK_Z + 15);
      rt.scene.add(mark);
    }
    if (rt.G.lord) rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '岸で舟に備える');
    else rt.marker('s0', { x: SPOTS[0].x, z: SPOTS[0].z + 2 }, '柵の横木に縄を締める', { h: .6 });
    // 九鬼の船団（東の川筋・海の封鎖）：川口をふさぎ、ゆっくり動きながら遠くの射撃を見せる
    F.ship = ataka();
    F.ship.position.set(62, waterHeight(W, 62, CH_Z - 2) - 0.45, CH_Z - 2);   // 11/8 岸から見える所へ
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    // 九鬼嘉隆の参戦は三重県の県史あれこれ・鳥羽市観光協会の紹介による。
    // 船上の立ち位置と具足は復元。二将は飾りの指揮像で、戦う兵は増減させない。
    // https://toba.gr.jp/kuki-project/about/
    const commandFigure = (name) => {
      const u = { type: 'busho', name };
      buildModel(u, { ...GENERALS[name], face: 'g:' + name, tier: 3,
        kacchu: NAGASHIMA_KACCHU[name],
        weapon: 'none', flag: null, pole: false, sode: true, kote: 3,
        saya: true, cloth: 0x263244, left: 'saihai' });
      // 指揮する姿の復元。刀は腰の拵えに納め、左拳を采配の柄へ合わせる。
      // 共通の初期姿勢では両手が抜き身へ寄る。既存の両腕の向け先を一度だけ整える。
      u.hand.position.set(.3, .86, .12);
      u.lh = [-.3, .98, .26];
      poseArms(u);
      // 戦わない指揮像は関節を毎コマ辿らず、采配姿を一度だけ焼き込む。
      // 共有の細かい形・遠くの形から作り、装備と顔は保つ。追加の影は落とさない。
      u.mesh.updateMatrixWorld(true);
      const bags = new Map(), figure = new THREE.Group();
      figure.userData.noFreeze = figure.userData.noMerge = true;
      u.mesh.traverseVisible(c => {
        if (!c.isMesh) return;
        let bag = bags.get(c.material);
        if (!bag) { bag = [[], []]; bags.set(c.material, bag); }
        const lod = c.userData.lod;
        for (let i = 0; i < 2; i++) bag[i].push((lod ? lod[i] : c.geometry).clone().applyMatrix4(c.matrixWorld));
      });
      for (const [material, parts] of bags) {
        const hi = mergeUnitParts(parts[0]), lo = mergeUnitParts(parts[1]);
        for (const list of parts) for (const geometry of list) geometry.dispose();
        const mesh = new THREE.Mesh(hi, material);
        lodSwap(mesh, hi, lo);
        mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
        figure.add(mesh);
      }
      return figure;
    };
    const shipGeneral = (ship, name) => {
      const figure = commandFigure(name);
      figure.position.set(-.7, .7, 3.2); figure.rotation.y = -.35;
      ship.add(figure);
    };
    if (SETTINGS.quality === 'high') {
      // 信広は一門の討死の報せだけで姿がなかったため、包囲中の控えを補う。
      // 参戦・討死は既存の年表による。本陣脇の居場所と采配姿は復元で、討死の場所ではない。
      // https://www.hi.u-tokyo.ac.jp/publication/syoho/38/pub_shiryo-10-24/
      // 船上の将と同じ形・材質を使う指揮像。戦う兵を置き換えず、毎コマの処理も足さない。
      F.nobuhiroFigure = commandFigure('織田信広');
      F.nobuhiroFigure.position.set(-18, W.heightAt(-18, 48), 48);
      F.nobuhiroFigure.rotation.y = Math.PI;
      // 個人の旗印は未詳。ほかの立ち寄り将と同じく、傍らの木瓜で織田方の所属を示す。
      // 旗の形・材質を共用し、移動して姿を消す時には旗も一緒に隠す。
      F.nobuhiroBanner = nobori(W, -16, 49, NAMED_GEAR['織田信広'].flag, 5);
      rt.scene.add(F.nobuhiroFigure, F.nobuhiroBanner);
      rt.addInteract('nobuhiro', () => F.step < 2 ? F.nobuhiroFigure.position : null,
        '織田信広に声をかける', () => rt.say('織田信広', '包囲は長い。岸の備えを怠るな', 3), { r: 3 });
      // 11/5 専門家の目：織田信次（津田孫十郎）は一江口の信忠の手。早尾口の本陣には置かない（同じ人が二人になっていた）。
      // 公記巻七：信忠は東の一江口、信盛は西の賀鳥口と坂手の郷の押さえ。
      // 信包（上野守）は一江口の御伴衆、のち加路戸島口攻め衆に見える。
      // https://kininaruart.com/artist/shincho/n7.html （巻七・河内長島）
      // 本陣への立ち寄りは復元。既存の筋兜・立物なしの具足と采配姿を共用する。
      // 当日の陣羽織の色・刀の銘は未詳。固有の立物・名刀・馬印は作らない。
      // 戦闘兵を指揮像へ替えず、東西の担当は本人の言葉で示す。
      F.visitingGenerals = [
        // 11/8 critic60 長島（一6・二1）：前田又左衛門は早尾口の先陣。賀鳥口の柴田の岸には置かない（名札が主人公の横に立っていた）。
        // 公記巻七の北畠茶筅（信雄）。船での参陣・南大島口の担当に基づく。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿は復元。既存の指揮像・形・材質を共用し、戦闘兵は替えない。
        { id: 'nobukatsu', name: '織田信雄', x: 42, z: 60, flag: NAMED_GEAR['織田信雄'].flag,
          words: '北畠茶筅じゃ。船で参り、神戸三七らと南大島口を囲んでおる。岸の備えも頼むぞ' },
        // 公記巻七の船勢から抜けていた捶水。史料の呼称を使い、諱や読みは補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像で形と材質を共用する。
        // 戦闘兵・毎コマの処理は増減させず、固有の立物・馬印・豪傑の型は作らない。
        { id: 'suizui', name: '捶水', x: 84, z: 72, flag: NAMED_GEAR['捶水'].flag,
          words: '茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七の鳥屋野尾は北畠茶筅に従い大船で参陣。史料の呼称を使い、諱は断定しない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質だけで既存の形と材質を共用する。
        // 戦う兵と毎コマの処理は増減させず、固有の立物・馬印・豪傑の型は補わない。
        { id: 'toriyanoo', name: '鳥屋野尾', x: 54, z: 72, flag: NAMED_GEAR['鳥屋野尾'].flag,
          words: '鳥屋野尾じゃ。茶筅様に従い、大船で参った。岸の備えも頼むぞ' },
        // 公記巻七の田丸も北畠茶筅に従い大船で参陣。諱は補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像を使い、戦闘兵は替えない。
        { id: 'tamaru', name: '田丸', x: 60, z: 72, flag: NAMED_GEAR['田丸'].flag,
          words: '田丸じゃ。茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七で北畠茶筅に従う大東・小作・坂奈井。諱は補わず記録の呼称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・装いは復元。高画質だけで指揮像と所属旗の形・材質を共用する。
        // 戦闘兵や毎コマの処理は増減させず、個人の立物・名刀・馬印・豪傑の型は作らない。
        { id: 'daito', name: '大東', x: 66, z: 72, flag: NAMED_GEAR['大東'].flag,
          words: '大東じゃ。茶筅様に従い、大船で参った。岸の囲みも頼むぞ' },
        { id: 'kosaku', name: '小作', x: 72, z: 72, flag: NAMED_GEAR['小作'].flag,
          words: '小作じゃ。わしらも茶筅様の船勢に加わった。岸の備えを緩めるな' },
        { id: 'sakanai', name: '坂奈井', x: 78, z: 72, flag: NAMED_GEAR['坂奈井'].flag,
          words: '坂奈井じゃ。茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七の南大島口攻め衆・神部三七（信孝）。本陣への立ち寄りと采配姿は復元。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質の指揮像だけを補い、具足・旗の形と材質を共用する。戦闘兵と毎コマの処理は増減させない。
        { id: 'nobutaka', name: '織田信孝', x: 48, z: 66, flag: NAMED_GEAR['織田信孝'].flag,
          words: '神戸三七じゃ。茶筅殿や桑名の衆と南大島口を囲んでおる。岸の備えも頼むぞ' },
        // 信忠と稲葉一鉄は市江口・賀鳥口の手（F.mouths）で馬上に出る。本陣に同じ人を二人置かない。
        // 佐久間父子は七月に坂手の郷を押さえたが、九月九日ごろ上洛して河内へ移り、
        // 九月二十九日の長島にはいない（docs/battle_learn/nagashima.md）。本陣にも置かない。
        { id: 'nobukane', name: '織田信包', x: 30, z: 60, flag: NAMED_GEAR['織田信包'].flag,
          words: '加路戸島口はわしらの持ち場じゃ。ここは岸の備えを頼むぞ' },
        // 公記巻七「河内長島」：丹羽五郎左衛門は長島東の押付郷に陣取る。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄りは復元。既存の指揮像・筋兜・刀の拵えを共用し、戦闘兵は替えない。
        { id: 'niwa', name: '丹羽長秀', x: 36, z: 54, flag: NAMED_GEAR['丹羽長秀'].flag,
          words: '長島の東、押付郷はわしらが囲む。岸の柵も隙を作るでないぞ' },
        // 公記巻七の賀鳥口の稲葉右京助。諱は断定せず、史料の通称で補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に共通の形と材質を使う。
        // 戦う兵と毎コマの処理は増減させず、所属だけを織田の旗で示す。
        { id: 'inaba_ukyonosuke', name: '稲葉右京助', x: -36, z: 66, flag: NAMED_GEAR['稲葉右京助'].flag,
          words: '稲葉右京助じゃ。伊予守らと西の賀鳥口から攻め入った。岸の囲みも緩めるな' },
        // 公記巻七の大鳥居攻め衆・稲葉喜六。諱は補わず記録の通称で示す。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。既存の形・材質を共用する高画質の指揮像。
        // 大鳥居は既に落ちた砦として語り、戦闘兵・毎コマの処理・個人の馬印は増やさない。
        { id: 'inaba_kiroku', name: '稲葉喜六', x: -42, z: 72, flag: NAMED_GEAR['稲葉喜六'].flag,
          words: '稲葉喜六じゃ。伊予守らと今島に陣を置き、大鳥居を攻めた。残る囲みも緩めるな' },
        // 公記巻七：蜂屋兵庫頭は西の賀鳥口、のち大鳥居攻め衆として今島に陣取る。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りは復元。既存の指揮像・具足・刀の拵えを共用し、戦闘兵は替えない。
        { id: 'hachiya', name: '蜂屋頼隆', x: -36, z: 54, flag: NAMED_GEAR['蜂屋頼隆'].flag,
          words: '西の囲みはわしらも受け持つ。そなたらは岸の柵を固めよ' },
        // 公記巻七：氏家左京亮（直昌）は早尾口の先陣、のち篠橋攻め衆。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄りは復元。既に落ちた篠橋に今も籠城兵がいるとはしない。
        // 既存の指揮像・具足・刀を共用し、戦闘兵や毎コマの処理は増減させない。
        { id: 'ujiie', name: '氏家直昌', x: -30, z: 42, flag: NAMED_GEAR['氏家直昌'].flag,
          words: '篠橋の攻めは済んだ。残る囲みも緩めるでないぞ' },
        // 公記巻七の伊賀伊賀守（安藤守就）は早尾口の先陣、のち篠橋攻め衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。既存の形と材質を共用する。
        // 篠橋は既に開城済み。戦闘兵は替えず、個人の馬印や毎コマの処理は足さない。
        { id: 'ando', name: '安藤守就', x: -42, z: 42, flag: NAMED_GEAR['安藤守就'].flag,
          words: '早尾口の先陣と篠橋の攻めを務めた。残る囲みも緩めるでないぞ' },
        // 公記巻七「河内長島」：不破河内守は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。共通の具足を使い、戦闘兵や毎コマの処理は増減させない。
        { id: 'fuwa', name: '不破光治', x: -24, z: 36, flag: NAMED_GEAR['不破光治'].flag,
          words: '早尾口の先陣はわしらも務めた。岸の囲みを緩めるでないぞ' },
        // 公記巻七：不破彦三は早尾口の先陣、のち丹羽らと長島東の押付郷に陣取る。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りと采配姿は復元。既存の形・材質を共用し、戦闘兵は替えない。
        { id: 'fuwa_hikozo', name: '不破彦三', x: 36, z: 66, flag: NAMED_GEAR['不破彦三'].flag,
          words: '早尾口の先陣を務めた。今は丹羽殿らと東の押付郷を囲んでおる' },
        // 公記巻七「河内長島」：佐々蔵介は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。既存の指揮像と所属旗を共用する。
        // 戦闘兵は替えず、固有の名刀・馬印・豪傑の型は補わない。
        { id: 'sassa', name: '佐々成政', x: -36, z: 36, flag: NAMED_GEAR['佐々成政'].flag,
          words: 'わしらも早尾口の先陣を務めた。岸の備えを怠るでないぞ' },
        // 公記巻七「河内長島」：池田勝三郎は信忠の一江口御伴衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。具足と旗は既存の共用部品を使う。
        // 個人の馬印・名刀・豪傑の型は補わず、戦闘兵や毎コマの処理は増減させない。
        { id: 'ikeda', name: '池田恒興', x: 30, z: 42, flag: NAMED_GEAR['池田恒興'].flag,
          words: 'わしは信忠様と東の一江口を受け持つ。岸の備えも緩めるでないぞ' },
        // 公記巻七「河内長島」：木下小一郎は早尾口の先陣。篠橋から出た一揆へ浅井新八と向かう。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と既存の指揮像を共用する。
        // 戦う兵は替えず、当日の固有の立物・名刀・馬印や毎コマの処理は足さない。
        // 11/6 専門家の目：天正二年は「秀長」の名乗りの前。公記は木下小一郎、この年は羽柴小一郎（長秀）と呼ぶ。
        { id: 'hidenaga', name: '羽柴秀長', label: '羽柴小一郎', x: -42, z: 54, flag: NAMED_GEAR['羽柴秀長'].flag,
          words: '早尾口の先陣を務め、篠橋から出た敵に向かった。残る囲みも緩めるな' },
        // 公記巻七：浅井新八は早尾口の先陣。木下小一郎と篠橋から出た一揆へ向かう。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りと装いは復元。諱・固有の立物・名刀・馬印は断定しない。
        // 高画質の指揮像だけを補い、戦闘兵と毎コマの処理は増減させない。
        { id: 'asai_shinpachi', name: '浅井新八', x: -48, z: 48, flag: NAMED_GEAR['浅井新八'].flag,
          words: '小一郎殿と篠橋から出た敵に向かった。囲みの備えを緩めるな' },
        // 公記巻七「河内長島」：河尻與兵衛は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。木瓜は織田方の所属旗で、個人の旗印ではない。
        // 長島専用の具足と既存の指揮像を共用し、戦闘兵・毎コマの処理は増減させない。
        { id: 'kawajiri', name: '河尻秀隆', x: -48, z: 60, flag: 'oda',
          words: 'わしらも早尾口の先陣を務めた。岸の柵を固め、囲みを緩めるな' },
        // 公記巻七「河内長島」：水野下野守は篠橋攻め衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 結城市「水野家物語」でも信元の長島参陣を確認できる。
        // https://www.city.yuki.lg.jp/kosodate-kyouiku/shougaigakushuu/column/page008595.html
        // 本陣への立ち寄り・采配・腰の刀は復元。既に降った篠橋の守将にはしない。
        // 長島専用の具足と既存の形・材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'mizuno_nobumoto', name: '水野信元', x: -42, z: 66, flag: NAMED_GEAR['水野信元'].flag,
          words: 'わしらも篠橋の攻めを務めた。残る囲みの備えを怠るな' },
        // 公記巻七「河内長島」：飯沼勘平は早尾口の先陣、のち篠橋攻め衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 諱は断定せず史料の通称を使う。本陣への立ち寄り・采配・腰の刀は復元。
        // 浅井新八と具足の形・材質を共用する指揮像。戦闘兵と毎コマの処理は増減させない。
        { id: 'iinuma_kanpei', name: '飯沼勘平', x: -54, z: 54, flag: NAMED_GEAR['飯沼勘平'].flag,
          words: '早尾口の先陣と篠橋の攻めを務めた。残る囲みも隙を作るな' },
        // 公記巻七の早尾口先陣「丸毛兵庫、同三郎兵衛」。諱・両者の続柄は断定しない。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像だけを補う。
        // 共通の形・材質を使い、戦闘兵や毎コマの処理は増減させない。
        { id: 'marumo_hyogo', name: '丸毛兵庫', x: -54, z: 42, flag: NAMED_GEAR['丸毛兵庫'].flag,
          words: '丸毛兵庫じゃ。早尾口の先陣を務めた。岸の囲みも緩めるな' },
        { id: 'marumo_saburobei', name: '丸毛三郎兵衛', x: -60, z: 48, flag: NAMED_GEAR['丸毛三郎兵衛'].flag,
          words: '丸毛三郎兵衛じゃ。わしも早尾口の先陣に加わった。岸の備えを頼むぞ' },
        // 公記巻七「河内長島」：森勝蔵は信忠の一江口御伴衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と既存の指揮像を共用する。
        // 当日の名槍・立物・個人の馬印を断定せず、木瓜は織田方の所属旗とする。
        // 戦闘兵は替えず、後年の鬼武蔵の武勇を語る台詞や毎コマの処理は足さない。
        { id: 'mori_nagayoshi', name: '森長可', x: 42, z: 48, flag: 'oda',
          words: '信忠様と東の一江口を受け持つ。そなたらは岸の備えを守れ' },
        // 公記巻七「河内長島」：斎藤新五は信忠の一江口御伴衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と共通の形・材質を使う。
        // 高画質の指揮像のみ補い、戦闘兵と毎コマの処理は増減させない。
        { id: 'saito_toshiharu', name: '斎藤利治', x: 48, z: 54, flag: NAMED_GEAR['斎藤利治'].flag,
          words: '斎藤新五じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七「河内長島」の一江口御伴衆・簗田左衛門太郎。諱は断定しない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に既存の形と材質を共用する。
        // 戦闘兵や毎コマの処理は増減させず、旗は織田方の所属だけを示す。
        { id: 'yanada_saemontaro', name: '簗田左衛門太郎', x: 54, z: 66, flag: NAMED_GEAR['簗田左衛門太郎'].flag,
          words: '簗田左衛門太郎じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        // 公記巻七の一江口御伴衆・長谷川與次。諱は補わず史料の通称を使う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質だけの指揮像に共通の形・材質を使う。
        // 戦闘兵と毎コマの処理は増減させず、個人の馬印や豪傑の型は補わない。
        { id: 'hasegawa_yoji', name: '長谷川與次', x: 60, z: 48, flag: NAMED_GEAR['長谷川與次'].flag,
          words: '長谷川與次じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七「河内長島」の一江口御伴衆・梶原平次。諱は補わない。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像だけを補う。
        // 既存の形と材質を共用し、戦う兵と毎コマの処理は増減させない。
        { id: 'kajiwara_heiji', name: '梶原平次', x: 66, z: 60, flag: NAMED_GEAR['梶原平次'].flag,
          words: '梶原平次じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七の一江口御伴衆・坂井越中守。諱は補わず、史料の通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に共通の形と材質を使う。
        // 戦う兵と毎コマの処理は増減させず、本人固有の馬印・豪傑の型は作らない。
        { id: 'sakai_etchunokami', name: '坂井越中守', x: 66, z: 66, flag: NAMED_GEAR['坂井越中守'].flag,
          words: '坂井越中守じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        // 公記巻七の一江口御伴衆・山田三左衛門と和田新介。記録の通称で補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像で既存の形・材質を共用する。
        // 戦闘兵は替えず、個人の馬印・豪傑の型・毎コマの処理は足さない。
        { id: 'yamada_sanzaemon', name: '山田三左衛門', x: 60, z: 54, flag: NAMED_GEAR['山田三左衛門'].flag,
          words: '山田三左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        { id: 'wada_shinsuke', name: '和田新介', x: 66, z: 48, flag: NAMED_GEAR['和田新介'].flag,
          words: '和田新介じゃ。わしも信忠様と一江口に加わっておる。岸の囲みを緩めるな' },
        // 公記巻七「河内長島」の一江口御伴衆・中島豊後守。諱は補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質の指揮像のみ。本陣への立ち寄り・采配・腰の刀は共通部品による復元。
        // 戦闘兵と毎コマの処理は増減させず、個人の馬印・豪傑の型は作らない。
        { id: 'nakajima_bungonokami', name: '中島豊後守', x: 72, z: 54, flag: NAMED_GEAR['中島豊後守'].flag,
          words: '中島豊後守じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七の一江口御伴衆・関小十郎衛門。諱は断定せず通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像と所属旗の形・材質を共用する。
        // 戦う兵や毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'seki_kojuroemon', name: '関小十郎衛門', x: 72, z: 60, flag: NAMED_GEAR['関小十郎衛門'].flag,
          words: '関小十郎衛門じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七：市橋九郎左衛門は早尾口先陣、のち丹羽・不破彦三と押付郷の陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像だけを補う。
        // 共通の形・材質を使い、戦闘兵と毎コマの処理は増減させない。
        { id: 'ichihashi_kurozaemon', name: '市橋九郎左衛門', x: 54, z: 60, flag: NAMED_GEAR['市橋九郎左衛門'].flag,
          words: '市橋九郎左衛門じゃ。早尾口の先陣を務め、今は丹羽殿や不破彦三殿と長島の東を囲んでおる' },
        // 公記巻七「河内長島」の早尾口先陣・中条将監、飯尾隠岐守。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。諱・固有の立物・馬印は断定しない。
        // 高画質の指揮像に共通の形・材質を使い、戦う兵と毎コマの処理は増減させない。
        { id: 'chujo_shogen', name: '中条将監', x: -60, z: 60, flag: NAMED_GEAR['中条将監'].flag,
          words: '中条将監じゃ。早尾口の先陣に加わった。岸の囲みも緩めるな' },
        { id: 'iio_okinokami', name: '飯尾隠岐守', x: -66, z: 54, flag: NAMED_GEAR['飯尾隠岐守'].flag,
          words: '飯尾隠岐守じゃ。わしらも早尾口の先陣を務めた。岸の備えを頼むぞ' },
        // 公記巻七の篠橋攻め衆。既に降った篠橋の守将にはせず、包囲側の将として補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質だけの指揮像で共通の形・材質を使う。
        // 戦闘兵は替えず、毎コマの処理・個人の馬印・豪傑の型は増やさない。
        { id: 'tsuda_osumi', name: '津田大隅守', x: -60, z: 66, flag: NAMED_GEAR['津田大隅守'].flag,
          words: '津田大隅守じゃ。早尾口の先陣と篠橋の攻めを務めた。残る囲みも緩めるな' },
        { id: 'yokoi_utanosuke', name: '横井雅楽助', x: -66, z: 42, flag: NAMED_GEAR['横井雅楽助'].flag,
          words: '横井雅楽助じゃ。わしらも篠橋の攻めを務めた。岸の備えを怠るな' },
        // 公記巻七の一江口御伴衆。諱は補わず、装備と本陣への立ち寄りは復元。
        // https://ja.wikisource.org/wiki/信長公記
        // 共通の指揮像・具足・腰の刀を使い、戦闘兵と毎コマの処理は増減させない。
        { id: 'sato_rokuzaemon', name: '佐藤六左衛門', x: 78, z: 66, flag: NAMED_GEAR['佐藤六左衛門'].flag,
          words: '佐藤六左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七の一江口御伴衆。通称で補い、本陣への立ち寄り・采配姿は復元とする。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質だけの指揮像。既存の具足・刀・材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'ichihashi_denzaemon', name: '市橋伝左衛門', x: 78, z: 54, flag: NAMED_GEAR['市橋伝左衛門'].flag,
          words: '市橋伝左衛門じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        { id: 'tsukamoto_kodaizen', name: '塚本小大膳', x: 84, z: 60, flag: NAMED_GEAR['塚本小大膳'].flag,
          words: '塚本小大膳じゃ。わしらも一江口の御供を務めた。岸の備えを頼むぞ' },
        // 公記巻七の一江口御伴衆。諱は断定せず、記録の通称を使う。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿は復元。高画質の指揮像と所属旗に既存部品を共用する。
        // 戦闘兵・毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'tsuda_hanzaemon', name: '津田半左衛門', x: 84, z: 54, flag: NAMED_GEAR['津田半左衛門'].flag,
          words: '津田半左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        { id: 'tsuda_matajuro', name: '津田又十郎', x: 90, z: 60, flag: NAMED_GEAR['津田又十郎'].flag,
          words: '津田又十郎じゃ。わしも一江口の御供を務めた。岸の囲みを頼むぞ' },
        { id: 'tsuda_ichinosuke', name: '津田市介', x: 84, z: 66, flag: NAMED_GEAR['津田市介'].flag,
          words: '津田市介じゃ。一江口の御供と篠橋の攻めを務めた。残る囲みも緩めるな' },
        // 公記巻七の一江口御伴衆、のち篠橋攻め衆から抜けていた津田孫十郎。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像と所属旗だけを補う。
        // 形と材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'tsuda_magojuro', name: '津田孫十郎', x: 96, z: 60, flag: NAMED_GEAR['津田孫十郎'].flag,
          words: '津田孫十郎じゃ。一江口の御供と篠橋の攻めを務めた。岸の囲みも緩めるな' },
        // 公記巻七では伊藤三丞も安宅船で参陣。諱は補わず史料の通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿は復元。既存の指揮像と具足を共用し、戦う兵は替えない。
        { id: 'ito_sanjo', name: '伊藤三丞', x: 90, z: 54, flag: NAMED_GEAR['伊藤三丞'].flag,
          words: '伊藤三丞じゃ。安宅船で参った。川の囲みは船の衆が守る。岸の備えも頼むぞ' },
        // 公記巻七の安宅船の将・水野監物。篠橋攻め衆の水野下野守とは分ける。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄り・采配姿は復元。高画質だけで共通の形・材質を使う。
        // 戦闘兵・毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'mizuno_kenmotsu', name: '水野監物', x: 90, z: 66, flag: NAMED_GEAR['水野監物'].flag,
          words: '水野監物じゃ。わしらも安宅船で囲みに加わった。岸の備えも怠るな' },
      ].filter(visitor => AT_HQ.has(visitor.id));
      for (const visitor of F.visitingGenerals) {
        visitor.figure = commandFigure(visitor.name);
        visitor.figure.position.set(visitor.x, W.heightAt(visitor.x, visitor.z), visitor.z);
        visitor.figure.rotation.y = Math.PI;
        // 木瓜・三引両・違い筋・折敷に三文字・棕櫚・揚羽蝶は所属を示す。個人の馬印ではない。
        visitor.banner = nobori(W, visitor.x + 2, visitor.z + 1, visitor.flag, 5);
        rt.scene.add(visitor.figure, visitor.banner);
        rt.addInteract(visitor.id, () => F.step < 2 ? visitor : null,
          (visitor.label || visitor.name) + 'に声をかける', () => rt.say(visitor.label || visitor.name, visitor.words, 3), { r: 3 });
      }
      F.visitorBanners = visitorBanners(rt,
        [F.nobuhiroBanner, ...F.visitingGenerals.map(visitor => visitor.banner)]);
    }
    const kukiGear = NAMED_GEAR['九鬼嘉隆'];
    shipGeneral(F.ship, '九鬼嘉隆');
    rt.scene.add(F.ship);
    const sn = nobori(W, 62, CH_Z - 2, kukiGear.flag, 5); sn.position.y = F.ship.position.y + .8; rt.scene.add(sn);
    F.ships = [{ m: F.ship, flag: sn, x0: 40, x1: 84, z: CH_Z - 2, x: 62, dir: 1, speed: 0.6, soundPos: { x: 84, z: CH_Z - 2 }, t: 4 }];
    // 中央は退城舟の通り道。高画質の林・島田の囲船は西の離れた航路へ置く復元。
    // 二将の姿と所属旗を保ち、既存の小型船・形・材質を共用する。
    const shipRoutes = [[-84, -40, CH_Z + 4, .5, '滝川一益']];   // 11/8 西の川筋へ寄せ、岸から九鬼と二艘の安宅船が見えるように
    if (SETTINGS.quality === 'high') shipRoutes.push(
      [-116, -88, CH_Z - 5, .45, '林秀貞'], [-154, -128, CH_Z - 5, .45, '島田所之助']);
    for (const [x0, x1, z, sp, name] of shipRoutes) {
      const m2 = ataka(name !== '滝川一益');
      if (name !== '滝川一益') m2.traverse(c => { c.castShadow = false; });
      const x = (x0 + x1) / 2;
      m2.position.set(x, waterHeight(W, x, z) - 0.45, z);
      m2.rotation.y = Math.PI / 2 + 0.1;
      rt.scene.add(m2);
      const shipFlag = NAMED_GEAR[name].flag;
      const sn2 = nobori(W, x, z, shipFlag, 5); sn2.position.y = m2.position.y + .8; rt.scene.add(sn2);
      if (name !== '滝川一益') sn2.traverse(c => { c.castShadow = false; });
      F.ships.push({ m: m2, flag: sn2, x0, x1, z, x, dir: 1, speed: sp, soundPos: { x, z }, t: 3 + Math.random() * 3 });
    }
    blockadeFleet(rt);
    // 信長公記巻七では滝川一益も安宅船で河口を塞ぐ。岸の組頭と兼ねさせない。
    // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
    F.takigawaShip = F.ships[1].m;
    shipGeneral(F.takigawaShip, '滝川一益');
    if (SETTINGS.quality === 'high') {
      // 公記巻七「河内長島」：島田所助・林佐渡守は囲船を拵えて参陣。
      // https://ja.wikisource.org/wiki/信長公記
      // 西の小型船を用い、林の居船の位置・形と采配姿は復元。名刀・個人の馬印は補わない。
      // 指揮像は船の子として一度だけ作る。形と材質は既存品を共用し、戦闘兵は替えない。
      F.hayashiShip = F.ships[2].m;
      shipGeneral(F.hayashiShip, '林秀貞');
      // 島田所之助も囲船の将として補う。諱の同定を避け、公記の通称で示す。
      // https://kininaruart.com/artist/shincho/n7.html
      // 西寄りの位置・航路・采配姿は復元。小型船・具足・材質を共用し、戦闘兵は増減させない。
      F.shimadaShip = F.ships[3].m;
      shipGeneral(F.shimadaShip, '島田所之助');
      // 三つ団子の馬印を船尾へ。長島当日の使用は復元。船の子にして旋回にも追従させる。
      const mark = campMark('滝川一益');
      mark.position.set(0, -.1, -3.5); F.takigawaShip.add(mark);
    }
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', fixed: true, anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 8, aggro: 10, formation: 'yari', yariRanks: 3 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true } }, { type: 'ashigaru', n: 13 }, { type: 'bow', n: 4 }], { ...ODA, flag: NAMED_GEAR['柴田勝家'].flag }));
    F.shibaU = F.shiba.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', fixed: true, anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 6, formation: 'line', ranks: 2, aggro: 36, fire: false },
      dress([{ type: 'busho', n: 1, o: { name: '鉄砲組頭', invuln: true, horse: false } }, { type: 'gun', n: 12 }], ODA));
    // 11/6：鉄砲衆は川を渡れない岸の持ち場。共通の「敵が来たら出て戦う」で攻めの号令のまま立たせない。
    F.teppo.stay = true;
    rt.after(12, () => {
      if (F.step !== 1) return;
      // 人足待ちや移動中に、まだ押せない縄を締めさせない。
      const order = rt.G.lord ? '殿は岸の柵で舟の見張りを'
        : F.buildTask === 'work' ? 'その縄を頼む。残りは味方が結う'
          : F.buildTask === 'wait' ? '人足が来るまで、ここで川を見てくれ'
            : '岸の横木へ。手伝いは一か所でよい';
      rt.say('鉄砲組頭', order, 3);
    });
    // 賀鳥口の後詰は無名の槍組。早尾口の前田利家は本陣側に置く。
    F.relief = allyGroup(rt, { name: '岸の助けの槍組', fixed: true, noAI: true, anchor: { x: 24, z: BANK_Z + 30 }, facing: Math.PI, formation: 'yari', yariRanks: 2, aggro: 0, fire: false }, dress([{ type: 'ashigaru', n: 8 }], ODA));
    for (const u of F.relief.units) u.noTarget = true;
    F.oda = [F.shiba, F.teppo]; F.defenders = [F.shiba, F.teppo, F.relief];
    // 11/5 check60：陸の三手（公記巻七）。東（-x）の市江口に信忠、西（+x）の賀鳥口に稲葉一鉄の手。後ろの早尾口に信長の本陣。
    // 始めは後ろの道から岸へ寄せ、最後の囲みで中江・屋長島の向かいの水際へ詰める（三方から囲む流れ）。
    F.mouths = [['織田信忠', -62, '市江口の信忠の手'], ['稲葉一鉄', 62, '賀鳥口の稲葉の手']].map(([name, x, label]) => {
      const flag = NAMED_GEAR[name]?.flag || 'oda';
      rt.scene.add(nobori(W, x + Math.sign(x) * 7, BANK_Z + 4, flag, 6));
      const g = allyGroup(rt, { name: label, fixed: true, anchor: { x, z: 34 }, facing: Math.PI, width: 6, formation: 'yari', yariRanks: 2, aggro: 6, fire: false },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true, flag } }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 3 }], { ...ODA, flag }));
      g.mouthX = x; g.noRout = true; // 持ち場の口を捨てて後ろへ逃げない
      g.stay = true; // 11/6：川向こうの敵を見て攻めの号令のまま岸に立たない（動きは段ごとの anchor で付ける）
      return g;
    });
    // 開戦25秒の小競り合い（10/30）：島の物見の小舟が、まだ横木の無い柵の切れ目（中央と東の間）の浅瀬へ寄せ、岸の助けの槍組が始めから押し返す。
    // 兵は足さない（本陣の旗本18→15・柴田の足軽16→13・鉄砲12→10 の八人を、物見の八人に回す）。小競り合いなので双方の打ちは弱い。
    // 10/31 kaito「小隊対小隊はチープ」：物見は岸に一列で並べず、川の中ほど（持ち場の前十歩）に一つの塊で置き、開戦八秒で本人を目がけて押し渡る（update）。
    //   門徒の足軽八人を足して二十二人の群れにする（本物の兵は八人だけ増える）。
    F.scouts = enemyGroup(rt, { fixed: true, faction: 'ikko', name: '島の物見', anchor: { x: 12, z: BANK_Z - 10 }, facing: 0, formation: 'yari', yariRanks: 3, width: 8,
      order: 'hold', aggro: 5, seekRange: 6, morale: 80, noRout: true, dmgMult: .15, fire: false, historicalOrders: true, fleeDir: { x: 0, z: -1 } },
      dress(Array.from({ length: 16 }, (_, i) => ({ type: 'samurai', n: 1, o: { hp: 110, maxHp: 110, kosode: 1, kosodeCol: [0x34332e, 0x484339, 0x292c2b][i % 3], cloth: 0x34332e, hat: i % 4 === 3 ? 'jingasa' : 'hachimaki', weapon: i % 3 === 2 ? 'sword' : 'spear', spear: 'su', horse: false, sode: false, kote: 0, menpo: 0 } })), IKKO));
    dressMonTo(F.scouts);
    // 開戦25秒（10/30 夜）：中江の守兵の足軽六人も物見の舟に乗せて寄せる（砦の守りは九人に。兵の数は同じ）
    { const src = F.ikkoCamp.guard, sc = F.scouts;
      const mv = src.units.filter((u) => u.alive && u.type === 'ashigaru' && u !== src.leader).slice(-6);
      for (const u of mv) {
        src.units.splice(src.units.indexOf(u), 1);
        u.group = sc; u.slot = sc.units.length; u.target = null; u.moveTo = null; u.aiT = 0; u.hp = u.maxHp = 110; sc.units.push(u);
      }
      src.units.forEach((u, j) => { u.slot = j; }); src.initial = src.units.length; sc.initial = sc.units.length;
      for (const u of mv) { const at = sc.slotPos(u.slot, sc.units.length); u.pos.set(at.x, W.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos); } }
    { const g = F.relief; g.noAI = false; g.anchor = { x: 10, z: BANK_Z + 1 }; g.aggro = 8; g.dmgMult = .1; g.formation = 'line'; g.width = 12;
      for (const u of g.units) { u.noTarget = false; const at = g.slotPos(u.slot, g.units.length); u.pos.set(at.x, W.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos); } }
    // 地形に固定した出現場所を守った上で、大将は槍の列の後ろへ置く。
    for (const g of F.oda) {
      const u = g.units[0];
      g.historicalOrders = true; g.noPursue = true;
      // 初めだけ後ろへ置いても、共通の並び直しで先頭へ戻る。持ち場も後列にする。
      const oldSlot = g.slotPos, rear = { x: 0, z: 0 };
      g.slotPos = function (i, n) {
        if (i !== u.slot || this.order === 'path') return oldSlot.call(this, i, n);
        rear.x = this.anchor.x; rear.z = this.anchor.z + 7;
        return rear;
      };
      u.pos.x = g.anchor.x; u.pos.z = g.anchor.z + 7;
      u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -10, z: BANK_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：輪中を囲む織田勢 ----
    // 背後へ自動で足す控えは長い槍の形が固定。岸から見える四隊は本体だけにし、
    // 控えと同じ短めの槍を使う。戦う兵・備えの位置・陣形への結び付けは保つ。
    // 11/4 jin（AF・AP9）：輪中を囲む絵の織田勢（addDistantArmy）はやめた。囲みは柵・幟・安宅船と、本物の岸の手で示す。
    for (const [x, z] of [[-24, 50], [24, 52]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', this.missions[0], 'main');
    rt.banner('川が砦を守る長島', 'まず岸の堤へ。輪中を見渡し、前方の堤から砦へ進む');
    rt.say(rt.G.lord ? '柴田勝家' : '組頭', rt.G.lord ? '殿、まず岸の堤へ。対岸の輪中と砦を御覧くだされ' : `${nm(rt)}、まず岸の堤へ上がり、輪中と門徒の砦を見よ`, 4);
    rt.after(18, () => { if (F.step < 2) rt.say('物見', '囲まれて二月、島では食う物が尽き始めておる', 3); });
    rt.after(5, () => {
      // 下知を早送りして見張りへ移った後は、古い作業へ呼び戻さない。
      if (F.ending || F.step > 1 || !rt.player.u.alive) return;
      // 堤から輪中と砦を見る段（nagashima/monomi.js）の後に横木の仕事
      ngMonomi(rt, { at: MONOMI_SPOT, bell: { x: 0, z: -80 }, ready: bankPlayerReady, next: () => {
        if (F.ending || F.step >= 1 || F.adv || !rt.player.u.alive) return;
        this.advance(rt, 0); sfx('eshout', .6);
      } });
    });
  },

  // ===== 11/10 作り直しの流れ（nagashima/advance.js）=====
  // from：始める段の番号（チェックポイントから続ける時）。続きの流し直しで何度呼ばれても、最後の一回だけ始める
  advance(rt, from = 0) {
    const F = rt.flags;
    F.advFrom = from;
    if (F.advPending) return;
    F.advPending = true;
    rt.after(0, () => { F.advPending = false; this.advStart(rt, F.advFrom); });
  },
  advStart(rt, from) {
    const F = rt.flags, W = rt.world;
    if (F.adv && F.dp?.on) for (const g of F.dp.cur?.groups || []) { g.noRout = false; g.morale = 0; }
    F.adv = true; F.step = 10; F.dpOn = true; F.advK = Math.max(F.advK || 0, 1);
    F.ngMonomi = null; rt.unmark('ngMonomi');
    // 岸の守りの仕組み（柵・見張り・退城の舟）は使わない。対岸の不死身の射手は撃たせない
    for (const g of F.bankBows || []) {
      g.fire = false; g.aggro = 0;
      // 禁止前に始めた構え・装填も外し、見回りを止める古い攻撃を残さない。
      for (const u of g.units) { u.target = null; u.atk = null; u.reload = null; }
    }
    if (F.relief) { F.relief.noAI = false; for (const u of F.relief.units) u.noTarget = false; }
    // 先手（長蛇の列）：槍足軽 → 侍 → 主人公の組 → 鉄砲 → 後続
    if (!F.advFront) {
      const ODA_LOOK = { flag: 'oda', armor: 0x28231f, hatColor: 0x1c1916, lace: 0x645545, cloth: 0x293b45, haori: 0 };
      F.advFront = allyGroup(rt, { name: '先手の槍組', fixed: true, anchor: { x: -46, z: 4 }, facing: Math.PI, formation: 'column', colW: 2, width: 3, aggro: 10, morale: 85, noRout: true },
        dress([{ type: 'ashigaru', n: 10 }, { type: 'samurai', n: 3 }], ODA_LOOK));
      F.advGuns = allyGroup(rt, { name: '先手の鉄砲', fixed: true, anchor: { x: -46, z: 14 }, facing: Math.PI, formation: 'column', colW: 2, width: 3, aggro: 30, morale: 80, noRout: true },
        dress([{ type: 'busho', n: 1, o: { name: '先手の組頭', invuln: true, horse: false } }, { type: 'gun', n: 6 }], ODA_LOOK));
      rt.after(60, () => { if (F.advFront) F.advFront.noRout = false; if (F.advGuns) F.advGuns.noRout = false; });
    }
    if (F.shiba) { F.shiba.historicalOrders = false; }
    const monto = (n, s2, lead) => [
      ...(lead ? [{ type: 'samurai', n: 1, o: { name: lead, kosode: 1, hat: 'hachimaki', flag: 'namu', flagScale: 1.6, horse: false, sode: false, kote: 0, menpo: 0 } }] : []),
      { type: 'samurai', n: s2, o: { kosode: 1, hat: 'hachimaki', flag: 'namu', horse: false, sode: false, kote: 0, menpo: 0 } },
      { type: 'ashigaru', n, o: { kosode: 1, hat: 'hachimaki', weapon: n % 2 ? 'spear' : 'sword' } }];
    const K = {
      monto,
      desperate: (n, s2) => [{ type: 'samurai', n: s2, o: { kosode: 1, hat: 'none', flag: 'namu', horse: false, sode: false, kote: 0, menpo: 0, face: { ...HUNGRY_FACE, t: 2 } } },
        { type: 'ashigaru', n, o: { kosode: 1, hat: 'hachimaki', weapon: 'spear' } }],
      guns: (n) => [{ type: 'gun', n, o: { kosode: 1, hat: 'hachimaki' } }],
      bows: (n) => [{ type: 'bow', n, o: { kosode: 1, hat: 'hachimaki' } }],
      events: this.advEvents(rt),
    };
    const steps = advanceSteps(K);
    const k0 = Math.max(0, Math.min(steps.length - 1, from | 0));
    if (k0 > 0) {
      // 途中から：その段の前の場面の絵（旗・舟・火の手前）だけを整え、本人を段の手前へ
      const E = K.events;
      if (k0 >= 1) E.column(rt, true);
      if (k0 >= 4) E.fortTaken(rt, true);
      if (k0 >= 6) E.fleetIn(rt, true);
      if (k0 >= 8) E.flagLanding(rt, true);
    }
    depthStart(rt, { routeFight: true, faction: 'ikko', flag: 'namu', armor: IKKO.armor, fixedSpawn: true, backing: false, scale: 1.15, dmg: 0.7, calmRest: false,
      look: (l) => dress(l, IKKO), friends: (r) => [F.advFront, F.advGuns, ...(r.squadGroups || [])].filter((g) => g && g.count && !g.routed) }, steps.slice(k0), () => this.advEnd(rt));
    // 段の番号は始めた段から数える（ADV_CP は全体の番号）
    F.advBase = k0;
  },
  // 場面の絵と声（段の始まりから呼ぶ）
  advEvents(rt) {
    const F = rt.flags, W = rt.world, self = this;
    const boatAt = (x, z, rot, big) => {
      const m = big ? ataka(true) : kobune(x, waterHeight(W, x, z) - .2, z, rot, 7);
      if (big) { m.position.set(x, waterHeight(W, x, z) - .45, z); m.rotation.y = rot; }
      rt.scene.add(m);
      return m;
    };
    const slide = (m, to, dur) => { (F.advSlides ||= []).push({ m, x0: m.position.x, z0: m.position.z, x1: to.x, z1: to.z, t: 0, dur }); };
    const flagAt = (x, z, flag) => { const n = nobori(W, x, z, flag, 5); rt.scene.add(n); return n; };
    return {
      column(r, quiet) {
        if (F.advColumnSet) return; F.advColumnSet = true;
        // 先手の列を堤へ乗せる。前の組から順に、堤の上を一列で進む（追い越しの道は堤の脇の浅い水）
        for (const g of [F.advFront, F.advGuns]) if (g) { g.order = 'path'; g.pathIdx = 0; g.path = [[-46, -6], [-46, -30]]; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
        if (!quiet) sfx('horagai', .6);
      },
      fortWarn(r) { r.army.play('bell', ADV_POINTS.fort, .6); },
      fortTaken(r, quiet) {
        if (F.advFortFlag) return;
        F.advFortFlag = flagAt(-47, -53, 'oda');
        if (!quiet) { r.banner('堤の砦、制圧', '残る門徒は奥の寺と在所へ退く'); r.say('足軽', '退いた……奥へ逃げていく', 3); }
      },
      fleetIn(r, quiet) {
        if (F.advKuki) return;
        // 九鬼の船が分流へ入り、門徒の小舟は奥へ下がる（舟一隻の到着に段を頼らない。絵だけ）
        F.advKuki = boatAt(-62, -40, Math.PI * .02, true);
        F.advKukiFlag = flagAt(-62, -40, 'kuki');
        F.advKukiFlag.position.y = F.advKuki.position.y + .8;
        F.advKukiFlag.rotation.y = F.advKuki.rotation.y;
        slide(F.advKuki, { x: -65, z: -62 }, quiet ? .1 : 40);
        F.advIkkoBoats = [[-66, -80, .1], [-64, -90, -.1], [-67, -98, .05]].map(([x, z, rot]) => boatAt(x, z, rot));
        if (!quiet) { sfx('horagai', .7); r.army.play('gun', { x: -62, z: -44 }, .6); r.army.smoke(-60, waterHeight(W, -62, -44) + 3, -44, -1, 0, 1.2); }
      },
      flagLanding(r, quiet) {
        if (F.advLandFlag) return;
        F.advLandFlag = flagAt(ADV_POINTS.landing.x + 1.5, ADV_POINTS.landing.z, 'oda');
        if (F.advKuki) slide(F.advKuki, { x: -65.5, z: -84 }, quiet ? .1 : 30);
        (F.advIkkoBoats || []).forEach((m, i) => slide(m, { x: m.position.x + (i % 2 ? 1 : -1), z: -112 - i * 3 }, quiet ? .1 : 25));
        if (!quiet) { r.banner('舟着場に織田の旗', '九鬼の船が進み、門徒の舟は奥へ下がる'); r.award((t) => { t.side.push('水路 確保'); }, '水路を確保した'); }
      },
      village(r) {
        // 在所の民は戦の近くから自分で逃げる（war_people）。寺の鐘で奥へ走らせる
        r.army.play('bell', { x: -44, z: -82 }, .8);
        r.banner('寺内の在所', '家・寺・畑。戦場なのに、人が暮らしている');
      },
      closing(r) {
        const said = [['使番', '北側、封鎖！'], ['使番', '舟着場も押さえました！'], ['使番', '西の堤、滝川勢が確保！']];
        said.forEach(([w, t], i) => r.after(i * 3.6, () => { if (!F.ending) { r.say(w, t, 3.2); sfx('horagai', .35); } }));
        r.after(11, () => r.banner('逃げ道が、一つずつ消えていく', '残るは南の舟入りだけ'));
      },
      lastClosed(r) {
        if (!F.advSouthShip) {
          F.advSouthShip = boatAt(-60, -134, Math.PI / 2, true);
          F.advSouthFlag = flagAt(-60, -134, 'kuki');
          F.advSouthFlag.position.y = F.advSouthShip.position.y + .8;
          F.advSouthFlag.rotation.y = F.advSouthShip.rotation.y;
          slide(F.advSouthShip, { x: -36, z: -134 }, 6);
        }
        r.say('使番', '最後の水路、塞がりました！', 3.4);
        r.after(3.6, () => { r.banner('逃げ道を閉じた', '向こうには、武器を持つ者だけでなく、家族と負傷者'); r.army.play('himei', { x: -48, z: -114 }, .5); });
        r.after(6.4, () => r.say('足軽', '……女子供が、荷を抱えて立っとる', 3));
        r.award((t) => { t.side.push('包囲 完成'); }, '包囲を完成させた');
      },
      desperate(r) { r.army.play('eshout', { x: -48, z: -110 }, 1.4); r.army.play('bellRapid', { x: -44, z: -82 }, .5); },
      breakFailed(r) { r.say('組頭', '……止まった。', 3); },
    };
  },
  advUpdate(rt, dt) {
    const F = rt.flags;
    for (const s of F.advSlides || []) {
      if (s.t >= s.dur) continue;
      s.t = Math.min(s.dur, s.t + dt);
      const k = s.t / s.dur, e = k * k * (3 - 2 * k);
      s.m.position.x = s.x0 + (s.x1 - s.x0) * e; s.m.position.z = s.z0 + (s.z1 - s.z0) * e;
      s.m.position.y = waterHeight(rt.world, s.m.position.x, s.m.position.z) - (s.m === F.advKuki || s.m === F.advSouthShip ? .45 : .2);
      // 通常の封鎖船と同じく、竿の根元を甲板へ据える。川底の高さに置き去りにしない。
      const flag = s.m === F.advKuki ? F.advKukiFlag : s.m === F.advSouthShip ? F.advSouthFlag : null;
      if (flag) { flag.position.set(s.m.position.x, s.m.position.y + .8, s.m.position.z); flag.rotation.y = s.m.rotation.y; }
    }
    // 堤の上で詰まった味方は、脇の浅い水へ一歩外して追い越させる（立ち止まった列で本人が塞がれない）
    if (rt.t >= (F.advJamT || 0)) {
      F.advJamT = rt.t + 1;
      const p = rt.player.u.pos, W = rt.world, at = F.dp?.on && F.dp.cur?.at;
      // 堤の段（①②）は、味方の組の持ち場を堤の上に縦に並べる（横へずらすと分流の深みへ入る）
      if (at && (F.advK || 1) <= 1) [F.advFront, F.advGuns].forEach((g, i) => { if (g && g.order !== 'path') g.anchor = { x: -46, z: at.z + 3 + i * 8 }; });
      // 深い水に入って足の止まった味方は、近い堤・岸へ上げる（特定の兵が水に落ちても段は止めない）
      for (const g of [F.advFront, F.advGuns, ...(rt.squadGroups || [])]) if (g) for (const u of g.units) {
        if (!u.alive || u.fleeing || u.atk || W.waterFootDepthAt(u.pos.x, u.pos.z) < .6) continue;
        u._wetT = (u._wetT || 0) + 1;
        if (u._wetT >= 4) { u._wetT = 0; const x = Math.abs(u.pos.z) < 48 && u.pos.z < -6 ? -46 : u.pos.x > -60 ? u.pos.x + 4 : u.pos.x - 4; u.cover = { x, z: u.pos.z, t: rt.army.time + 4 }; }
      }
      if (Math.abs(p.x - (-46)) < 4 && p.z < -4 && p.z > -50) for (const g of [F.advFront, F.advGuns]) if (g) for (const u of g.units) {
        if (!u.alive || u.target || u.atk) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < 2.2 && !u.moving) u.cover = { x: u.pos.x + (u.pos.x >= -46 ? 2.4 : -2.4), z: u.pos.z, t: rt.army.time + 2 };
      }
    }
    if (F.advEnding) this.advEndTick(rt, dt);
  },
  // 14:00〜15:00 戦の終わり：火・水面の火・遠くの鐘・堤を歩く・「……終わりましたな。」
  advEnd(rt) {
    const F = rt.flags, W = rt.world;
    if (F.advEnding || F.ending) return;
    F.advEnding = true; F.advK = 7; F.dpOn = false; F.step = 17; F.advEndAt = rt.t;
    rt.setPhase('end');
    rt.world.setTime('dusk');
    rt.obj('main', ADV_MISSIONS[7], 'main');
    for (const g of [F.advFront, F.advGuns]) if (g) { g.order = 'hold'; g.aggro = 0; }
    // 突破に失敗した残りの門徒は、武器を捨てて奥へ散る（戦の終わりに攻めの号令で立ち尽くさない）
    for (const g of rt.army.groups || []) if (g.team === 1 && !g.routed && g.units?.length && !g.units[0]?.isStruct) {
      // 崩す（追撃の知らせが出る）のでなく、手を止めて家族の集まる所へ下がる
      g.noRout = true; g.order = 'hold'; g.aggro = 0; g.seekRange = 0; g.fire = false; g.anchor = { x: -48, z: -113 };
      // 振り下ろしは target・atk と別に進むので、手を止めた後の一撃も取り消す。
      for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.swing = null; u.reload = null; u.charging = false; u.noTarget = true; }
    }
    // 水郷を進む段でも、結末の中江・屋長島への着火を落とさない。降った長島城は対象外。
    rt.after(3, () => {
      for (const s of F.fireTargets || []) s.fireProof = false;
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.fireTargets?.find(q => q !== F.yanaStruct && q.x > 35 && q.x < 70)]) if (s?.alive) {
        s.fireProof = false; s.burn = 3; rt.army.igniteStruct(s, s);
      }
      bankBlazes(rt, 0);
      rt.say('使番', '中江・屋長島に火がかけられました', 3.4);
    });
    rt.after(9, () => bankBlazes(rt, 1));
    rt.after(15, () => bankBlazes(rt, 2));
    // 火は軍の下知で広がる（本人が一軒ずつ燃やさない）。近くは本物の火、川面に映す
    const fires = [[-44, -84, 3.2], [-52, -104, 2.6], [-40, -108, 2.4], [-56, -92, 2.2], [-50, -60, 2.6], [-34, -114, 2]];
    fires.forEach(([x, z, size], i) => rt.after(1 + i * 1.6, () => {
      W.addFire(x, z, { size, smoke: true, blackSmoke: true, lightRadius: 26, lightColor: 0xff7a2a, lightStrength: 2.6, lightDecay: 0, waterReflection: true, h: .4 });
      W.addScorch(x, z, 4, 3);
      if (i % 2 === 0) W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: 2.2 });
    }));
    // 南の舟入りに残った門徒の舟も燃える。川面に炎が映る（長島だけの絵）
    rt.after(4, () => {
      for (const [x, z, rot] of [[-42, -131, .3], [-30, -132, -.2]]) {
        const y = waterHeight(W, x, z);
        rt.scene.add(kobune(x, y - .2, z, rot, 7));
        W.addFire(x, z, { size: 2.4, smoke: true, blackSmoke: true, lightRadius: 24, lightColor: 0xff7a2a, lightStrength: 2.4, lightDecay: 0, waterReflection: true, h: y - W.heightAt(x, z) + .5 });
      }
    });
    if (F.ganshoStruct?.alive) { F.ganshoStruct.fireProof = false; F.ganshoStruct.burn = 3; rt.army.igniteStruct(F.ganshoStruct, F.ganshoStruct); }
    rt.after(2, () => rt.say('使番', '上様の御下知。在所と砦に火をかけよ', 3.4));
    rt.after(8, () => rt.army.play('bell', { x: -44, z: -82 }, .45));
    F.advWalk = { x: ADV_POINTS.walk.x, z: ADV_POINTS.walk.z };
    rt.marker('advWalk', F.advWalk, '南の堤', { h: 1.2, guideAlways: true });
    // 堤の上に、小さな暮らしの品（椀と草鞋）
    { const x = (ADV_POINTS.exit.x + F.advWalk.x) / 2, z = (ADV_POINTS.exit.z + F.advWalk.z) / 2;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.09, .06, .06, 10), new THREE.MeshLambertMaterial({ color: 0x5a3020 }));
      bowl.position.set(x, W.heightAt(x, z) + .03, z); bowl.rotation.z = .5; rt.scene.add(bowl);
      const zori = new THREE.Mesh(new THREE.BoxGeometry(.11, .02, .26), new THREE.MeshLambertMaterial({ color: 0x9a8a60 }));
      zori.position.set(x + .4, W.heightAt(x + .4, z) + .01, z + .2); zori.rotation.y = .7; rt.scene.add(zori);
      F.advItem = { x, z }; }
  },
  advEndTick(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos, el = rt.t - F.advEndAt;
    if (rt.over || !bankPlayerReady(rt)) return;
    if (F.advItem && !F.advItemSeen && Math.hypot(p.x - F.advItem.x, p.z - F.advItem.z) < 3) F.advItemSeen = true;
    const arrived = F.advWalk && Math.hypot(p.x - F.advWalk.x, p.z - F.advWalk.z) < 3.5;
    if (arrived && !F.advSaid) {
      F.advSaid = true; rt.unmark('advWalk');
      rt.after(1.5, () => rt.say('配下', '……終わりましたな。', 3.6));
      rt.after(5.6, () => rt.say('若い足軽', '……これも戦なんですか。', 3.2));
      rt.after(9.2, () => rt.say('古参の足軽', '命令だ。', 2.6));
      F.advDoneAt = rt.t + 14;
    }
    if (F.advDoneAt && rt.t >= F.advDoneAt && el >= END_SEC && !F.advFinished) {
      F.advFinished = true;
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.side.push('一揆勢 壊滅', '主要拠点 制圧', '水路 封鎖完了'); t.special = { label: '長島 制圧', pts: 20 }; }, '長島 制圧');
      rt.finish({ scriptedEnd: true }, 0.2);
    }
  },

  // ① 柵を結う（11/10 から使わない。岸の守りの古い流れ）
  build(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    if (F.ngMonomi) { F.ngMonomi = null; rt.unmark('ngMonomi'); }
    // 終日の持ち場へ移る間に日を進める。包囲の長さを待ち時間へは換えない。
    advanceDay(F.kakoi, 3);
    for (const g of F.last) campWear(g, 40, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 40, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 40, F.kakoi.morale);
    rt.setPhase('build');
    // 三手が東西の口から岸へ寄せる。
    for (const g of F.mouths || []) g.anchor = { x: g.mouthX, z: BANK_Z + 8 };
    rt.unmark('shiba');
    rt.obj('main', rt.G.lord ? '岸の柵で舟に備え、柵は味方に任せよ' : '岸の横木へ進め。手伝いは一か所', 'main');
    if (rt.G.lord) rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場');
    rt.say(rt.G.lord ? '柴田勝家' : '組頭', rt.G.lord ? '殿、柵は足軽が結びます。岸の柵で舟に備えてくだされ' : '杭に横木を渡せ！　縄を締め、川岸を固めよ', 3);
    F.teppo.fire = true;
    for (const g of F.bankBows) { g.fire = true; for (const u of g.units) u.noTarget = false; }
    // 信長で遊ぶ時：柵は足軽が結う（手柄にはしない）。当主は岸で門徒に備える
    F.builders = []; F.personalWork = [0, 0, 0];
    const workers = F.shiba.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.stdHeld && !u.banner && u.type === 'ashigaru');
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i], u = workers[i], mate = workers[i + 3];
      if (u) { for (const worker of [u, mate]) if (worker?.hand) {
        const rope = new THREE.Mesh(WORK_ROPE, DARK); rope.rotation.x = Math.PI / 2; rope.scale.set(1.5, 1, 1.5);
        rope.position.set(0, 0, .1); worker.hand.add(rope); worker.workRope = rope;
      } }
      if (u) F.builders.push({ u, mate, mateAt: { x: s.x - 1, z: s.z + 1 }, i, x: s.x + 1, z: s.z + 1, t: 0 });
    }
    const oldSlot = F.shiba.slotPos;
    F.shiba.slotPos = function (i, n) {
      for (const job of F.builders) if (F.step >= 1 && F.step < 3 && !F.raised?.[job.i]) {
        if (job.u.slot === i) return job;
        if (job.mate?.slot === i) return job.mateAt;
      }
      return oldSlot.call(this, i, n);
    };
    F.helped = true; // 両脇は人足が結う。中央の一か所は本人の縄締めまで残す。
    F.workSpot = 0;
    if (!rt.G.lord) {
      for (let i = 0; i < SPOTS.length; i++) {
        const s = SPOTS[i], workSpot = { x: s.x, z: s.z + 2 };
        if (i === 0) rt.marker('s' + i, { x: s.x, z: s.z + 2 }, '柵の横木に縄を締める', { h: .6 });
        // 盛り土の上で輪の端が空へ浮くため、作業場所は案内札だけで示す。
        rt.addInteract('s' + i, () => F.step === 1 && F.workSpot === i && rt.player.u.pos.z >= BANK_Z && !F.raised?.[i] ? workSpot : null, '縄を締める', () => {
          if (F.step !== 1 || !bankPlayerReady(rt) || rt.player.u.pos.z < BANK_Z || F.raised?.[i]) return;
          F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1; F.personalWork[i] = BUILD_HOLD; this.raise(rt, i);
        }, { r: 3, hold: HELP_HOLD });
      }
    }
    // 対岸と矢・鉄砲を交わす。退城の兵は降伏の報せまで舟を寄せない。
  },

  raise(rt, i) {
    const F = rt.flags;
    const s = SPOTS[i];
    if (F.raised?.[i]) return;
    (F.raised || (F.raised = []))[i] = true;
    rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i);
    const segs = F.fenceWork[i];
    fenceProgress(segs, BUILD_HOLD, BUILD_HOLD);
    for (const q of segs) {
      q.noTarget = false; q.wall = true; q.segR = 0.7; q.name = '柵';
      // 本人が手を貸した横木は補強され、実際の反撃にも長く持つ。
      if (F.personalWork[i] > 0) q.hp = q.maxHp = 900;
    }
    F.fence = [...(F.fence || []), ...segs];
    sfx('wood', 0.8);
    F.built++;
    const job = F.builders?.find(j => j.i === i);
    for (const u of [job?.u, job?.mate]) if (u?.alive) {
      if (u.cover === job.workAt || u.cover === job.mateAt) u.cover = null;
      if (u.wpn) u.wpn.visible = true;
      if (u.workRope) u.workRope.visible = false;
    }
    // 見張りへ移った後の補修完了では、現在の下知と印を差し替えない。
    if (F.step !== 1) return;
    // 残る作業の印は、更新時に人足の準備と本人の位置から選び直す。
    if (F.helped && !F.personalBuilt) {
      if (F.built >= SPOTS.length) { rt.obj('main', '川岸の見張り場で、川を向いて門徒の舟を見張る', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
      return;
    }   // 足軽が代わりに結った分は手柄にしない
    if (F.personalBuilt && !F.workAwarded) {
      F.workAwarded = true;
      rt.award((t) => { t.special = { label: '味方と岸に柵を結った', pts: 12 }; }, '味方と横木を結った');
      rt.say('足軽', '縄が締まった！　残りは任せて、川を見てくれ', 3);
    }
    // 一か所を手伝えば見張りへ移る。残る人足の補修はそのまま続ける。
    if (F.participated) { this.watch(rt); return; }
    if (F.built >= SPOTS.length) { rt.obj('main', '川岸の見張り場で、川を向いて門徒の舟を見張る', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
    else rt.objProgress('main', `残りは味方に任せよ　柵 ${F.built}／${SPOTS.length}か所`);
  },

  watch(rt) {
    const F = rt.flags;
    if (!rt.G.lord && !F.participated) return;
    // 11/6 fixc1721：人足を待つ間に見張りが済んでいると②が一度も出ず、右上が①から③へ飛んだ（十1）。済んだ分は残し、②を三秒は見せる。
    F.step = 1.25; F.stepT = rt.t; F.watchAt = 0; F.watchTime = Math.min(F.workWatchTime || 0, WATCH_HOLD - 3); F.watchStarted = null;
    F.watchSpot = nearestBankSpot(rt.player.u.pos);
    F.watchNear = false; F.watchFacing = false;
    // 未完成の横木の古い印と操作を、舟の見張りへ持ち越さない。
    for (let i = 0; i < SPOTS.length; i++) { rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i); }
    for (const job of F.builders || []) if (F.raised?.[job.i]) for (const u of [job.u, job.mate]) if (u?.alive && u.wpn) { u.wpn.visible = true; if (u.workRope) u.workRope.visible = false; }
    rt.unmark('workWatch');
    // 人足を待つ間も、岸で実際に川を見ていた分は見張りに数える。
    if (F.watchTime >= WATCH_HOLD) { F.watchDone = true; this.preBoats(rt); return; }
    rt.obj('main', this.taskLines[1], 'main');
    sayGap(rt, '組頭', '岸の柵で槍を構え、寄る舟に備えよ', 4);
    rt.marker('watch', { x: SPOTS[F.watchSpot].x, z: BANK_Z + 5 }, '水路を見張る持ち場');
  },

  // 見張りの後、長島城が降る前に：川の封鎖と砦から逃げ出す門徒（nagashima/fusa.js）
  preBoats(rt) {
    const F = rt.flags;
    if (F.step >= 1.5 || F.ending) return;
    F.step = 1.5; F.stepT = rt.t; F.dpOn = true;
    // 段の間、柴田の手と鉄砲衆は中央の岸に残す（長島城が降った後の斬り込みを元の柵で受ける）。西と東の段は、その口の信忠・稲葉の手と並んで受ける。念のため元の持ち場・構えを覚えて戻す
    const saved = [...(F.oda || []), ...(F.mouths || [])].filter(Boolean).map((g) => ({ g, anchor: { ...g.anchor }, order: g.order, formation: g.formation, facing: g.facing, aggro: g.aggro, stay: g.stay, fire: g.fire }));
    for (const id of ['workWatch', 'watch', 'watchFacing']) rt.unmark(id);
    const A = (n) => ({ type: 'ashigaru', n }), B = (n) => ({ type: 'bow', n });
    // 門徒：鉢巻・小袖の徒（侍は旗頭だけ）
    const monto = (n, s2) => [{ type: 'samurai', n: s2, o: { kosode: 1, hat: 'hachimaki', flag: 'namu', horse: false, sode: false, kote: 0, menpo: 0 } }, { type: 'ashigaru', n, o: { kosode: 1, hat: 'hachimaki', weapon: n % 2 ? 'spear' : 'sword' } }];
    const steps = fusaSteps({ rest: dpRest, hold: bankHold, BANK_Z, A, B, monto });
    for (const st of steps) {
      const start = st.start;
      st.start = (rt2, C, m, ctx) => { start(rt2, C, m, ctx); if (st.kind === 'hold') for (const g of bankDepthFriends(rt2)) g.fire = true; const o = rt.objectives.find((q) => q.id === 'dp'); if (o?.text) rt.obj('main', o.text, 'main'); };
      // 守る段は、敵を退け本人が持ち場を守るまで終えない。
      if (st.kind === 'hold') {
        st.idleAdvance = false; st.limit = Infinity;
        const tick = st.tick;
        st.tick = (rt2, C, m, ctx, el, dt) => {
          const held = C.inT;
          tick(rt2, C, m, ctx, el, dt);
          // 共通の守備時間は範囲の外三十メートルまで数える。長島は柵の持ち場の内だけ。
          const u = rt2.player.u;
          const atPost = bankFighterReady(u) && !u.downed && u.pos.z >= BANK_Z &&   // 馬の上でも持ち場（11/9 二巡）
            Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < C.botRadius;
          C.inT = held + (atPost ? dt : 0);
          bankDepthWithdraw(C, el, st.max);
          // 九十秒すべて、本人が持ち場を守る。
          // 共通処理は二人以下の組を崩れた扱いにする。戦える残兵がいれば守備を続ける。
          const remaining = bankDepthRemaining(C);
          // 共通の経過時計で守備済みに見せない。持ち場と残る寄せだけを伝える。
          rt2.objProgress('dp', !atPost ? '岸の柵の持ち場へ戻れ' : remaining ? '残る門徒を味方と押し返せ' : C.waves.length ? '岸の柵で後の寄せに備えよ' : '岸の柵で備えを保て');
          // 致命傷で戦えない者を共通の生存人数に残して、守備を止めない。
          return !C.waves.length && !remaining && atPost && C.inT >= st.max - 35;
        };
      }
    }
    depthStart(rt, { faction: 'ikko', flag: 'namu', armor: IKKO.armor, fixedSpawn: true, backing: false, scale: 1.3, dmg: 0.75, calmRest: false,
      look: (l) => dress(l, IKKO), friends: bankDepthFriends, keepZ: BANK_Z,
      botBackAllowed: (rt2, x, z) => z >= BANK_Z }, steps, () => {
      F.dpOn = false; F.dpDone = true; rt.objRemove('dp');
      for (const o of saved) if (o.g.count && !o.g.routed) { Object.assign(o.g, { anchor: o.anchor, order: o.order, formation: o.formation, facing: o.facing, aggro: o.aggro, stay: o.stay, fire: o.fire }); o.g.path = null; }
      // 長島城が降るまでの数日、岸の陣で傷を手当てし息を整えた（日が進む）
      try { rt.player.treatWounds(0.8); rt.player.sta = rt.player.maxSta; } catch (e) { /* 手当てが無くても進む */ }
      this.boats(rt);
    });
  },

  // 包囲を締めた後、火の前に最後の抵抗（nagashima/fusa.js lastSteps）
  preWin(rt) {
    const F = rt.flags;
    if (F.dpLast || F.ending) return;
    F.dpLast = true; F.dpOn = true; F.preWinSafe = F.finalSafe >= FINAL_HOLD;
    const monto = (n, s2) => [{ type: 'samurai', n: s2, o: { kosode: 1, hat: 'hachimaki', flag: 'namu', horse: false, sode: false, kote: 0, menpo: 0 } }, { type: 'ashigaru', n, o: { kosode: 1, hat: 'hachimaki', weapon: n % 2 ? 'spear' : 'sword' } }];
    const steps = lastSteps({ rest: dpRest, hold: bankHold, BANK_Z, monto });
    for (const st of steps) {
      const start = st.start;
      st.start = (rt2, C, m, ctx) => { start(rt2, C, m, ctx); if (st.kind === 'hold') for (const g of bankDepthFriends(rt2)) g.fire = true; const o = rt.objectives.find((q) => q.id === 'dp'); if (o?.text) rt.obj('main', o.text, 'main'); };
      if (st.kind === 'hold') {
        st.idleAdvance = false; st.limit = Infinity;
        const tick = st.tick;
        st.tick = (rt2, C, m, ctx, el, dt) => {
          const held = C.inT;
          tick(rt2, C, m, ctx, el, dt);
          // 共通の守備時間は範囲の外三十メートルまで数える。長島は柵の持ち場の内だけ。
          const u = rt2.player.u;
          const atPost = bankFighterReady(u) && !u.downed && u.pos.z >= BANK_Z &&
            Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < C.botRadius;
          C.inT = held + (atPost ? dt : 0);
          bankDepthWithdraw(C, el, st.max);
          // 最後の寄せも七十五秒、本人が岸の持ち場を守る。
          // 最後の寄せも、人数だけで残兵を退けた事にしない。
          const remaining = bankDepthRemaining(C);
          // 共通の経過時計で守備済みに見せない。持ち場と残る寄せだけを伝える。
          rt2.objProgress('dp', !atPost ? '岸の柵の持ち場へ戻れ' : remaining ? '残る門徒を味方と押し返せ' : C.waves.length ? '岸の柵で後の寄せに備えよ' : '岸の柵で備えを保て');
          // 致命傷で戦えない者を共通の生存人数に残して、守備を止めない。
          return !C.waves.length && !remaining && atPost && C.inT >= st.max - 35;
        };
      }
    }
    depthStart(rt, { faction: 'ikko', flag: 'namu', armor: IKKO.armor, fixedSpawn: true, backing: false, scale: 1.3, dmg: 0.75, calmRest: false,
      look: (l) => dress(l, IKKO), friends: bankDepthFriends, keepZ: BANK_Z,
      botBackAllowed: (rt2, x, z) => z >= BANK_Z }, steps, () => { F.dpOn = false; rt.objRemove('dp'); this.win(rt); });
  },

  // ② 降伏して退城する舟。射撃の下知後は実際の弾と傷が通る。舟を討つ任務にはしない。
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    // 退城と反撃の前に持ち場へ移った扱い。近くで架空の討死を演じず、後の史実の報せへつなぐ。
    if (F.nobuhiroFigure) F.nobuhiroFigure.visible = false;
    if (F.nobuhiroBanner) F.nobuhiroBanner.visible = false;
    rt.uninteract('nobuhiro');
    // 早尾口と賀鳥口の将は本陣の脇に残る（目の前で一度に消さない）。声をかけるのは包囲の間だけ。
    if (F.visitingGenerals) for (const visitor of F.visitingGenerals) rt.uninteract(visitor.id);
    advanceDay(F.kakoi, 6);
    for (const g of F.last) campWear(g, 55, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 55, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 55, F.kakoi.morale);
    // 11/7（critic60 一3「対岸の柵の前の門徒が始めから終わりまで何もしない」）：長島城が降ったので、表の柵の守りは退く支度で奥の舟入へ下がる。
    { const gd = F.ikkoCamp.guard; gd.noAI = false; gd.fire = false; gd.aggro = 0; gd.seekRange = 0; gd.noRout = true; gd.order = 'hold'; gd.formation = 'column';
      gd.anchor = { x: FORT.x, z: FORT.z - 22 }; gd.facing = 0;
      for (const u of gd.units) if (u.alive) { u.noTarget = true; u.target = null; u.atk = null; } }
    // 降伏の報せで岸の応酬を止める。退城舟への射撃と、その後の反撃を混ぜない。
    for (const g of F.bankBows) {
      g.fire = false;
      // 行動を止めると装填の時計も止まる。装填を残すと、後の見回りが永久に待つ。
      for (const u of g.units) { u.target = null; u.atk = null; u.reload = null; u.noTarget = true; u.pinT = Infinity; }
    }
    rt.setPhase('boats'); rt.unmark('workWatch'); rt.unmark('watch'); rt.unmark('watchFacing');
    F.shiba.fire = false; F.teppo.fire = false;
    F.boatsNear = onBank(rt.player.u.pos, false);
    rt.say('伝令', F.boatsNear ? '長島が降った。柵に槍を並べよ。退く舟は討つな' : '長島が降った。岸の柵へ戻れ。退く舟は討つな', 4);
    rt.obj('main', F.boatsNear ? '岸の柵に槍を並べ、鉄砲衆を守れ' : '岸の柵へ戻り、槍を並べよ', 'main');
    F.boatsSpot = nearestBankSpot(rt.player.u.pos);
    rt.marker('bank', { x: SPOTS[F.boatsSpot].x, z: BANK_Z + 5 }, '岸の持ち場');
    for (const g of F.last) { g.anchor.z = BANK_Z + 2; g.aggro = 0; }
    rt.after(6, () => {
      if (F.ending || F.step !== 2) return;
      rt.say('伝令', '上様の御下知じゃ！　長島の者は許さぬ。鉄砲衆、退く舟へ撃ちかけよ', 4);
      // 11/8 critic60 長島（十一4）：なぜ撃つのか・主人公は何をするのかを、組頭の二言で示す（公記：小木江で信興を討たれた恨み）
      rt.after(2.5, () => { if (!F.ending && F.step === 2) rt.say('組頭', '小木江で御舎弟を討たれた恨みじゃ。降った者も許されぬ', 3); });
      rt.after(5.5, () => { if (!F.ending && F.step === 2) rt.say('組頭', '撃たれた舟の者は刀を抜いて来るぞ。お前は槍を構え、鉄砲衆の前を守れ', 3); });
    });
    rt.after(8, () => {
      if (F.ending || F.step !== 2 || !rt.player.u.alive) return;
      // 11/6：退く舟は岸から四十歩余り。鉄砲衆の届く間合いを舟まで延ばし、構えたまま撃たずに立たせない（公記「鉄炮を以て打ちかけ」）。
      F.teppo.fire = true; F.teppo.aggro = 52;
      for (const u of F.last[0].units) if (u.alive && !u.woundOut && !u.rearWound) u.noTarget = false;
      battleEvent(rt, EVENT_VOLLEY, { x: 0, z: CH_Z }, F.teppo, 0, true, '退く舟へ、織田方の鉄砲が放たれた');
      // 11/8 critic60 長島（九4）：岸の柵に並ぶ鉄砲衆の一斉射撃を、筒先の火花と白い煙の帯で見せる（共通の火花と煙を使い回す）
      { let k = 0; for (const u of F.teppo.units) if (u.alive && !u.woundOut && k < 14) {
        const x = u.pos.x, y = u.pos.y + 1.45, z = u.pos.z - .9, d = .25 * k++;
        rt.after(d, () => {
          if (F.ending || F.step !== 2 || !u.alive || u.woundOut || u.rearWound || u.gone) return;
          rt.army.flash(x, y, z, 1.2); rt.army.smoke(x, y, z, 0, -1, 1.6);
        });
      }
      rt.army.play('gun', { x: 0, z: BANK_Z }, 1); }
      // 射撃の時刻だけで帰陣の札を上書きしない。場所に合う札と印は更新側でそろえる。
      rt.say('鉄砲組頭', onBank(rt.player.u.pos, F.boatsNear) ? '舟を追うな！　柵の内で反撃に備えよ' : '岸の柵へ戻れ！　舟を追うな', 3);
    });
    // 射撃を続けて反撃の前に舟の者を全滅させない。矢玉と傷はそのまま残す。
    rt.after(14, () => { F.teppo.aggro = 36; if (F.step === 2 && !F.ending) F.teppo.fire = false; });
    // 降伏の舟を見届けてから射撃。約十四秒かけて岸へ寄り、同じ門徒が反撃する。
    rt.after(12, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('舟が岸へ寄る！　味方の後ろに退く道を空けよ', true);
      // 一つだけの行き先の印は、反撃に備える柵に残す。
      sfx('eshout', .6);
    });
    rt.after(15, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('岸に足音！　刀を抜いて来るぞ', true); sfx('stepWet', .9);
    });
    rt.after(16, () => this.lastSally(rt));
  },

  // ④ 反撃ののち、中江・屋長島の外へ柵をつなぎ直す。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t; F.finalHeld = 0; F.finalSafe = 0;
    rt.setPhase('enclose'); rt.unmark('bank'); rt.unmark('retreat'); rt.unmark('breach'); rt.unmark('shoreFacing');
    F.hurtShown = false;
    surroundForts(rt);
    // 東の市江口と西の賀鳥口の手も水際へ詰め、中江・屋長島を三方から囲む。鉄砲は川越しに撃つ。
    for (const g of F.mouths || []) { g.anchor = { x: g.mouthX * .85, z: BANK_Z + 2 }; g.fire = true; g.stay = false; } // 斬り込みの門徒がこちらの岸に上がったら、口の手も出て戦う
    rt.army.play('sig_nobiki', F.shiba.anchor, .85);
    rt.obj('main', '西の柵の縄を三か所締め直せ', 'main');
    F.finalChecks = [false, false, false]; F.finalChecked = 0; F.finalCheckDone = []; F.finalCheckT = 0;
    for (let i = 0; i < 3; i++) {
      const spot = CHECK_SPOTS[i], id = 'check' + i;
      if (i === 0) rt.marker(id, spot, CHECK_NAMES[i]);
      // 順に印で立ち止まれば確認する。操作の札は増やさない。
      F.finalCheckDone[i] = () => {
        if (F.step !== 3.5 || !F.finalReady || dangerProgress(rt) || F.finalChecks[i]) return;
        F.finalChecks[i] = true; F.finalChecked++;
        // 同じ秒のうちに次の縄へ移っても、済んだ数を古いまま残さない。
        F.finalClock = null;
        if (F.finalChecked === 3) { F.finalHeld = 0; F.finalSafe = 0; }
        rt.uninteract(id); rt.unmark(id);
        // 完了時点の古い敵数で、次の作業や見張りを先に命じない。
        // 次の更新で敵・立ち位置・向きを調べ、札と声と印を一緒に選ぶ。
        F.finalReady = false; F.finalTask = null;
      };
    }
    rt.say('柴田勝家', '西の柵へ。近くの敵を止め、縄を三か所確かめよ', 4);
    // 一門の討死は斬り込みの最中に報せる（lastSally）。届かなかった時だけ、ここで繰り返す。
    rt.after(8, () => {
      if (F.ending || F.step !== 3.5 || F.ichimonNews) return;
      F.ichimonNews = true;
      rt.say('伝令', '大隅守殿・孫十郎殿・半左衛門殿ら、上様の御一門が討たれた！', 4);
    });
    for (const g of F.oda) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = [[g.anchor.x, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 6]];
      g.pathIdx = 0; g.aggro = 4;
      g.onArrive = (q) => { q.order = 'hold'; q.formation = q === F.shiba ? 'yari' : 'line'; q.facing = Math.PI; q.aggro = 14; };
    }
  },

  // ③ 舟への射撃を受けた門徒の反撃。鎧のない歩兵が、岸を南へ突き抜ける。
  lastSally(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    // 15分の構成：囲まれて二月飢えた門徒。刀の一撃は並の七割（数と勢いはそのまま。敵の命は増やさない）
    for (const g of F.last || []) if (g) g.dmgMult = Math.min(g.dmgMult ?? 1, 0.7);
    // 11/8 critic60 長島：門徒の斬り込みは、島の寺の早鐘と、念仏を唱えて寄せる鬨の声で始まる（共通の早鐘・鬨の音を使い回す）
    rt.army.play('bellRapid', { x: 0, z: -80 }, .8);
    rt.army.play('sig_enemyToki', { x: 0, z: -44 }, 1);
    rt.after(2.5, () => { if (!F.ending) rt.army.play('toki', { x: 0, z: BANK_Z - 6 }, .9); });
    // 反撃が始まったら未完成の人足も槍を持ち、岸の守りへ戻る。
    for (const job of F.builders || []) for (const u of [job.u, job.mate]) if (u?.alive) {
      if (u.cover === job.workAt || u.cover === job.mateAt) u.cover = null;
      if (u.wpn) u.wpn.visible = true;
      if (u.workRope) u.workRope.visible = false;
    }
    F.shiba.fire = true; F.teppo.fire = true;
    rt.setPhase('sally');
    rt.unmark('bank');
    F.sallyHeld = 0; F.bankAway = 0; F.pushTime = 0; F.sallyStart = rt.t;

    rt.army.play('sig_atsumare', F.shiba.anchor, .85);
    rt.obj('main', '岸の柵へ集まり、柵の内で門徒を止めよ', 'main');
    rt.say('柴田勝家', '法螺貝じゃ、集まれ！　柵の内で門徒を止めよ', 4);
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    // 最初の舟は二隊に分けて寄せ、残りの舟は後から着岸する。同じ四十五人を使う。
    // 大軍対大軍（kaito 10/31）：最初の舟の二隊は分けずに一つの塊で同時に寄せる。後の舟は後詰め（下の update）。
    this.sallyWave(rt, 0);
    // 11/6 fixc2220（critic60「三分で終わる」）：二手目は一手目と刃を合わせた後に寄せる（一つの塊が二度ぶつかる。斬り合いが一度で終わらない）。
    rt.after(15, () => this.sallyWave(rt, 1));
    // 後続舟は川上から時差で寄せる。先の隊の敗走だけで全ての舟を繰り上げない。
    F.rearBoatAt = null; F.shoreQuiet = 0; F.shoreFacing = false;
    // 公記巻七：裸の七、八百が手薄な所へ斬り込み、信広・信次・秀成ら一門が討死した。岸の兵は声で知る。
    rt.after(14, () => {
      if (F.ending || F.ichimonNews || !rt.player.u.alive) return;
      F.ichimonNews = true;
      rt.say('伝令', '東の手が破られた！　大隅守殿・孫十郎殿・半左衛門殿ら、上様の御一門が討たれた', 4);
      sfx('eshout', .5);
    });

    // 槍組は西の先陣、鉄砲衆は東を受け、中央でも互いの列が途切れないようにする。
    for (const [g, x] of [[F.shiba, -8], [F.teppo, 12]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  sallyWave(rt, i) {
    const F = rt.flags, g = F.last[i];
    if (F.step !== 3 || F.ending || g.sallyReleased) return;
    g.sallyReleased = true; g.releasedAt = rt.t; g.noRout = false;
    // 深手や敗走で反撃できない隊には、上陸の声や立て直しを重ねない。
    if (!canCounterattack(g)) return;
    // 射撃への怒りで気力は戻るが、空腹の疲れや受けた傷は戻さない。
    g.morale = Math.max(g.morale, 82);
    for (const u of g.units) if (u.alive && !u.woundOut && !u.rearWound) {
      // 舟が寄せた順に同じ兵が上陸する。開戦からの秒数では舟に留めない。
      u.shoreWaiting = false;
      u.noTarget = false; u.fat = Math.max(u.fat || 0, 0.55);
    }
    // 横木を攻める下知を渡す。通常の突撃だけでは柵越しの敵を選べず、岸で立ち尽くす。
    g.assault = (u) => {
      const wall = rt.army.wallAt(u.pos, u.team, g.anchor);
      return wall && F.fence?.includes(wall) && wall.alive && !wall.opened && !wall.noTarget ? wall : null;
    };
    g.order = 'assault'; g.aggro = 22; g.seekRange = 90;
    g.formation = 'column'; g.colW = 3; g.anchor.z = BANK_Z + 18;
    // 11/6 fixc1439（九2）：斬り込みは本人の立つ岸の柵へ寄せる。味方の列の脇を素通りさせず、目標に書いた門徒と本人が必ず刃を合わせる。
    g.anchor.x = Math.max(-16, Math.min(16, rt.player.u.pos.x + (i - 1) * 5));
    if (i === 0 && nearTroops(rt, g)) rt.say('門徒', '退けると言うたではないか！　岸へ、道を開け！', 3);
    if (i > 0) rt.bark(i === 3 ? '東の舟が岸に着く！　柵の内で受けよ' : i === 2 ? '後の舟も来る！　西の岸も守れ' : '次の一団が来る！　柵の内で受け止めよ', true);
  },

  win(rt) {
    const F = rt.flags;
    // 縄締め・見張り・反撃の防衛・三か所の確認を全部果たしてから勝ちにする。
    const held = (rt.G.lord || F.participated) && F.watchDone && F.sallyDefended &&
      F.held && F.finalChecked >= 3 && (F.finalSafe >= FINAL_HOLD || F.preWinSafe) &&
      !F.sallyFailed && !F.broken && rt.player.u.alive;
    // 放火の下知で最後の巡回へ進む。前段の防衛を欠けば失敗の結末にする。
    if (F.ending) return;
    F.ending = true; F.endingAt = rt.t; F.endingClock = END_SEC;
    rt.setPhase('end');
    for (const id of ['shiba', 'workWatch', 'watch', 'watchFacing', 'bank', 'east', 'retreat', 'breach', 'finalThreat', 'finalFacing']) rt.unmark(id);
    for (let i = 0; i < 3; i++) { rt.unmark('check' + i); rt.uninteract('check' + i); }
    for (let i = 0; i < SPOTS.length; i++) { rt.unmark('s' + i); rt.unzone('s' + i); rt.uninteract('s' + i); }
    rt.obj('main', held ? '岸と包囲の柵を守り切った' : '持ち場を守り切れなかった', 'main');
    if (held) {
      // 11/6 fixc1439：主の任務を果たした印は火を見届けた後に付ける。すぐ付けると共通の締め（goalsDoneTick）が二秒半で勝ちにして、⑥の火が見えなかった。
      // 火の時間だけでは成功にしない。本人が岸を巡った後に確定する。
      F.aftermathHeld = true;
      F.aftermathChecked = 0; F.aftermathWork = 0;
    } else {
      rt.objFail('main');
      const why = F.broken ? '岸の背後へ四人以上の敵が二十秒押し込み、持ち場を失った' : F.sallyFailed ? '岸の反撃を受け止めきれなかった' : !F.watchDone ? '岸で舟を見張る務めを果たせなかった' : !F.sallyDefended ? '岸に踏みとどまれなかった' : F.finalChecked < 3 ? '西の柵を三か所確かめ切れなかった' : '西の柵の見張りを果たせなかった';
      F.failureReason = why;
      rt.objProgress('main', why); rt.say('伝令', why, 4);
    }
    // 火の間も本人の巡回を残す。成功の確定は三か所を回った後。
    rt.obj('aftermath', AFTERMATH_ORDER, 'order');
    if (held) {
      rt.marker('aftermath', AFTERMATH_SPOTS[0], '西の岸の柵');
      rt.say('組頭', '火の間も岸を空けるな。西、中央、東の柵を巡り、囲みを保て', 4);
    }
    rt.objProgress('aftermath', '川は渡るな。岸に残れ');
    rt.tracker.main = false; // 岸の巡回を終えるまでは戦功も勝ちも確定しない。
    // 11/6 fix61：斬り込みを退けた後、口の手が攻めの号令のまま岸に二十秒立っていた（bot の目・一3）。囲みの水際へ戻して構えさせる。
    for (const g of F.mouths || []) { g.anchor = { x: g.mouthX * .85, z: BANK_Z + 4 }; g.stay = true; g.fire = false; g.order = 'hold'; g.facing = Math.PI; }
    // 最後に火がかかるのは残る中江・屋長島。願証寺や既に降った長島を混ぜない。
    rt.after(3, () => {
      // 各砦の二か所から着火。ほかの建物へも燃え移るが、火は同時に四つまで。
      for (const s of F.fireTargets) s.fireProof = false;
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.fireTargets.find(q => q !== F.yanaStruct && q.x > 35 && q.x < 70)]) if (s && s.alive) {
        s.fireProof = false; s.burn = 3; rt.army.igniteStruct(s, s);
      }
      battleEvent(rt, EVENT_FIRE_START, YANAGASHIMA, null, 1, true, '中江・屋長島に火がかけられた');
      // 11/6 fixc2220（critic60 一3）：対岸の柵の前の守りが火の中でも立ち尽くしていた。火に追われ、柵の内を逃げ場を探して走る。
      { const gd = F.ikkoCamp?.guard; if (gd) { gd.noAI = false; gd.fire = false; gd.aggro = 0; gd.seekRange = 0; gd.noRout = true; gd.order = 'hold'; gd.formation = 'ring'; gd.anchor = { x: FORT.x, z: FORT.z - 22 }; gd.facing = 0;
        for (const u of gd.units) if (u.alive) { u.noTarget = true; u.target = null; u.atk = null; } } }
      rt.obj('aftermath', AFTERMATH_ORDER, 'order');
      rt.objProgress('aftermath', '川は渡るな。岸に残れ');
      bankBlazes(rt, 0);
      rt.banner('中江・屋長島に火', '柵で囲まれた二つの砦から、煙が上がる');
      rt.say('伝令', '二つの砦に火！　女も子も、柵で逃げられぬ', 4);
      // 11/8 critic60 長島：火の中の叫びと、砦の寺の鐘（共通の悲鳴・鐘を使い回す）
      rt.army.play('bell', YANAGASHIMA, .7);
      for (const [i, d] of [1.5, 4, 7.5, 11, 15].entries()) rt.after(d, () => rt.army.play('himei', i % 2 ? NAGASHIMA : YANAGASHIMA, .8));
    });
    // 11/6 fixc1721：描いて遊ぶと、奥の蔵の小さな火と黒い煙の粒しか見えず、二つの砦が燃えるように見えなかった（四6）。
    //   岸から見える表の物見・番所・長屋・柵へ、時をずらして火を広げる（共通の燃える建物 addBlaze）。
    rt.after(9, () => bankBlazes(rt, 1));
    rt.after(15, () => bankBlazes(rt, 2));
    rt.after(10, () => rt.say('足軽', '柵の内から叫ぶ声が聞こえる……', 4));
    rt.after(17, () => rt.say('語り', '『信長公記』は、男女およそ二万人が焼かれたと伝える', 4));
    rt.after(24, () => rt.say('語り', '織田方も、信広・信次・秀成ら一門を失った', 4));
    if (!held) rt.after(END_SEC, () => rt.finish({ scriptedEnd: true, failureReason: F.failureReason }, 0.2));
  },

  aftermathTick(rt, dt) {
    const F = rt.flags;
    if (!F.aftermathHeld || F.aftermathDone || !bankFighterReady(rt.player.u) || rt.player.u.downed) return;
    const i = F.aftermathChecked, spot = AFTERMATH_SPOTS[i];
    if (spot) {
      const p = rt.player.u.pos;
      // 一つの場所で放置しても次の柵の確認にはならない。川側からも数えない。
      const near = p.z >= BANK_Z && Math.hypot(p.x - spot.x, p.z - spot.z) < 3;
      let safe = near;   // 馬の上からでも確かめられる（11/9 二巡：騎乗の bot が持ち場で止まり続けた）
      if (safe) for (const u of rt.army.units) {
        if (u.team !== rt.player.u.team && bankFighterReady(u) && !u.downed &&
            !u.noTarget && !u.isStruct && !u.civ &&
            !u.boatSeat?.aboard && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 6 &&
            !rt.army.wallBetween(p, -1, u.pos)) { safe = false; break; }
      }
      if (safe) F.aftermathWork += dt;
      if (F.aftermathWork >= CHECK_HOLD) {
        F.aftermathChecked++; F.aftermathWork = 0;
        rt.unmark('aftermath');
        const next = AFTERMATH_SPOTS[F.aftermathChecked];
        if (next) rt.marker('aftermath', next, F.aftermathChecked === 1 ? '中央の岸の柵' : '東の岸の柵');
      }
      rt.objProgress('aftermath', `岸の柵 ${F.aftermathChecked}／三か所`);
    }
    if (F.aftermathChecked < AFTERMATH_SPOTS.length || rt.t - F.endingAt < END_SEC) return;
    F.aftermathDone = true;
    rt.objDone('aftermath'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '岸と包囲の柵を守った', pts: 20 }; }, '岸と包囲の柵を守った');
    rt.finish({ scriptedEnd: true }, 0.2);
  },

  repairBank(rt, dt) {
    const F = rt.flags;
    if (F.step < 1 || F.step >= 3 || F.built >= SPOTS.length) return;
    for (const job of F.builders) if (!F.raised?.[job.i]) {
      // 槍列の組み直しや遠い射手の見張りより、横木へ歩く仕事を先にする。
      // 既存の持ち場へ向かう処理を使い、近い敵への応戦・負傷・敗走はそのまま通す。
      // 位置の入れ物は一度だけ作り、任務を離れれば短い期限で元の槍列へ戻す。
      const workAt = job.workAt || (job.workAt = { x: job.x, z: job.z, t: 0 });
      workAt.t = job.mateAt.t = rt.army.time + .5;
      for (let n = 0; n < 2; n++) {
        const u = n === 0 ? job.u : job.mate;
        if (!u?.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.stdHeld || u.banner || u.escort) continue;
        if (!u.cover || u.cover === workAt || u.cover === job.mateAt || u.cover.t <= rt.army.time) u.cover = u === job.u ? workAt : job.mateAt;
      }
      if (!job.u.alive || job.u.fleeing || job.u.woundOut || job.u.gone || job.u.noTarget) { job.t = 0; continue; }
      const at = canWorkBank(job.u) && Math.hypot(job.u.pos.x - job.x, job.u.pos.z - job.z) < 2.5 &&
        (!rt.G.lord && !F.helped || canWorkBank(job.mate) && Math.hypot(job.mate.pos.x - (job.x - 2), job.mate.pos.z - job.z) < 2.5);
      if (at) { workHands(job.u, rt.t); if (job.mate) workHands(job.mate, rt.t); }
      // 本人の長押しも人足と一緒に行う。離したら済んだ結び目までを残す。
      if (!rt.G.lord && !F.helped) {
        if (at && bankPlayerReady(rt) && rt.holdId === 's' + job.i) F.personalWork[job.i] = Math.max(F.personalWork[job.i], rt.holdT || 0);
        fenceProgress(F.fenceWork[job.i], F.personalWork[job.i], BUILD_HOLD);
      } else {
        const helping = at && bankPlayerReady(rt) && !rt.G.lord && rt.holdId === 's' + job.i;
        if (helping) F.personalWork[job.i] = Math.max(F.personalWork[job.i], (rt.holdT || 0) * BUILD_HOLD / HELP_HOLD);
        // 主人公の横木を人足だけで仕上げない。両脇の補修は並行して続ける。
        const limit = !rt.G.lord && !F.participated && job.i === F.workSpot ? BUILD_HOLD * .75 : BUILD_HOLD;
        job.t = at ? Math.min(limit, Math.max(job.t + dt, F.personalWork[job.i])) : job.t;
        fenceProgress(F.fenceWork[job.i], job.t, BUILD_HOLD);
        if (job.t >= BUILD_HOLD) {
          if (!rt.G.lord && bankPlayerReady(rt) && rt.holdId === 's' + job.i && (rt.holdT || 0) >= 2) {
            F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1;
          }
          this.raise(rt, job.i);
        }
      }
    }
  },

  shipsTick(rt, dt) {
    const F = rt.flags;
    // 九鬼の船団：川口を行き来し（海の封鎖）、ときどき遠くの射撃を見せる（F.ending の間も動かす）
    for (const sh of F.ships || []) {
      const r = (sh.x1 - sh.x0) / 2, mid = (sh.x0 + sh.x1) / 2;
      if (sh.phase == null) { sh.phase = Math.asin((sh.x - mid) / r); sh.baseZ = sh.z; }
      sh.phase += sh.speed * dt / r;
      sh.x = mid + r * Math.sin(sh.phase); sh.z = sh.baseZ + 1.5 * (1 - Math.cos(sh.phase));
      const yaw = Math.atan2(r * Math.cos(sh.phase), 1.5 * Math.sin(sh.phase));
      const turn = Math.atan2(Math.sin(yaw - sh.m.rotation.y), Math.cos(yaw - sh.m.rotation.y));
      sh.m.rotation.y += Math.max(-0.45 * dt, Math.min(0.45 * dt, turn));
      sh.m.position.set(sh.x, waterHeight(rt.world, sh.x, sh.z) - 0.45, sh.z);
      // 幟には五メートルの竿が含まれる。竿の根元を甲板へ据える。
      sh.flag.position.set(sh.x, sh.m.position.y + .8, sh.z);
      sh.flag.rotation.y = sh.m.rotation.y;
      if ((F.step < 2 || F.step >= 3) && !F.ending && !F.advEnding && (sh.t -= dt) <= 0) {
        sh.t = 12 + Math.random() * 6;
        sh.soundPos.x = sh.x; sh.soundPos.z = sh.z;
        rt.army.play('gun', sh.soundPos, 0.6);
        rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.2);
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.dpOn) depthTick(rt, dt);
    // 縄と最後の巡回は本人の作業だけで進める。経過時間で未完の務めを補わない。
    KIT.backTick(rt);
    bankTeppoPatrol(rt);
    // 対岸の射手も、射撃の合間は柵沿いを見回る。降伏後は射撃を止めて奥へ下がる。
    // perch を残したまま隊の行き先だけ変えても兵は動かないため、足場そのものを進める。
    for (const g of F.bankBows || []) for (const u of g.units) {
      if (!boatPassengerReady(u) || u.fleeing || !u.bankPost || !u.perch) continue;
      // 歩いた直後の射撃・装填では止まる。歩行量が残ると装填の時計が進まない。
      if (u.atk || u.reload) { u.moving = 0; continue; }
      const post = u.bankPost, at = u.perch;
      // 降伏後も奥の舟入で退城を待つ。移った先で立ち尽くさず、岸沿いを見回る。
      const x = post.x + Math.sin(rt.t * .65 + u.id) * 1.5;
      const z = post.z - (F.step >= 2 ? 6 : 0);
      const dx = x - at.x, dz = z - at.z, d = Math.hypot(dx, dz);
      const move = Math.min(d, Math.max(0, dt) * 1.2);
      if (d > .01 && move > 0) {
        at.x += dx / d * move; at.z += dz / d * move;
        at.y = rt.world.heightAt(at.x, at.z);
        u.pos.set(at.x, at.y, at.z); u.moving = move / dt;
      } else u.moving = 0;
    }
    // 対岸の守りは降伏後も舟入の内を見回る。川へ出ず、五秒以上立ち尽くさない。
    { const gd = F.ikkoCamp?.guard;
      // 撤退・敗走の下知を、定期の見回りで待機へ戻さない。
      if (gd && !gd.routed && gd.order !== 'retreat' && !F.advEnding && rt.t >= (F.gdPatrolT ?? 2)) {
        F.gdBase ||= { x: gd.anchor?.x ?? 0, z: gd.anchor?.z ?? -60 };
        F.gdSide = -(F.gdSide || 1); F.gdPatrolT = rt.t + 4;
        gd.noAI = false; gd.aggro = 0; gd.seekRange = 0; gd.order = 'hold';
        gd.anchor = { x: F.gdBase.x + F.gdSide * 6, z: F.step >= 2 ? FORT.z - 22 : F.gdBase.z };
      } }
    // 開戦の小競り合いの片付け：物見が尽きるか、開戦45秒か、降伏の報せで、残る物見は舟へ逃げ、助けの槍組は元の控えへ戻る
    // 開戦八秒：川の中ほどの物見が一つの塊で岸へ押し渡り、本人を目がけて寄せる（本人が深手の時は近くの味方へ）
    // 11/6 fixc1844：降伏の報せの前に岸で斬り合い、討死の嘆きが出るのは時の順に合わない（critic60 二2）。
    //   描いて遊ぶと、物見に斬りかかられて横木の縄に四十五秒手が届かなかった。物見は川の中ほどで見張るだけにする。
    if (F.scouts && !F.scoutsDone && rt.t > 8 && F.scoutsLand) {
      const P = rt.player.u, g = F.scouts;
      if (!F.scoutsGo) { F.scoutsGo = true; g.order = 'attack'; g.seekRange = 50; g.aggro = 30; }
      g.focus = P.alive && P.hp > P.maxHp * 0.35 ? P : null;
    }
    // 物見は斬りかからないので、助けの槍組は十秒で控えへ戻す（横木の前を四十五秒ふさいでいた）。
    if (F.scouts && !F.scoutsDone && (F.step >= 2 || rt.t > (F.scoutsLand ? 45 : 10) ||!F.scouts.units.some((u) => u.alive && !u.fleeing))) {
      F.scoutsDone = true; F.scouts.noRout = false; F.scouts.morale = 0; F.scouts.focus = null;
      const g = F.relief;
      if (g && F.dangerAt == null) {
        g.dmgMult = 1; g.order = 'path'; g.pathIdx = 0; g.aggro = 0; g.formation = 'column'; g.colW = 2;
        g.path = [[10, BANK_Z + 16], [24, BANK_Z + 30]];
        g.onArrive = (q) => { if (F.dangerAt != null) return; q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; q.noAI = true; for (const u of q.units) u.noTarget = true; };
      }
    }
    if (F.backBow) F.backBow.visible = rt.player.weapon !== 'bow';
    if (F.backGear) {
      const u = rt.player.u, holder = u.human?.root.visible && u.human.flagHolder;
      const parent = holder || u.mesh;
      if (F.backGear.parent !== parent) parent.add(F.backGear);
      if (holder) { F.backGear.position.set(0, 0, 0); F.backGear.rotation.set(0, 0, 0); }
      else { F.backGear.position.copy(u.body.position); F.backGear.quaternion.copy(u.body.quaternion); }
    }
    if (F.adv) {
      fleetTick(rt, dt);
      this.shipsTick(rt, dt);
      if (F.FS) F.FS.tick(dt);
      for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
      this.advUpdate(rt, dt);
      return;
    }
    bankFootTick(rt);
    boatTick(rt, dt);
    fleetTick(rt, dt);
    shoreFootTick(rt);
    allyBankGuard(rt, dt);
    this.repairBank(rt, dt);
    if (F.FS) F.FS.tick(dt);
    if (F.closeOrdered) {
      let closed = true;
      for (const job of F.closures) {
        let workers = 0;
        for (const u of job.g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.atk && !u.target?.alive && Math.hypot(u.pos.x - job.x, u.pos.z - job.z) < 3) workers++;
        if (workers >= 2 && job.t < BUILD_HOLD) { job.t = Math.min(BUILD_HOLD, job.t + dt); for (const u of job.g.units) workHands(u, rt.t); }
        fenceProgress(job.segs, job.t, BUILD_HOLD);
        if (job.t >= BUILD_HOLD) for (const u of job.g.units) if (u.alive && u.wpn) u.wpn.visible = true;
        if (job.t < BUILD_HOLD) closed = false;
      }
      F.enclosureClosed = closed;
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    this.shipsTick(rt, dt);
    if (F.ending) {
      F.hurtEdge.style.display = 'none';
      this.aftermathTick(rt, dt);
      return;
    }
    if (!rt.player.u.alive) { F.hurtEdge.style.display = 'none'; return; }
    if (!F.breathWarned && rt.player.sta <= rt.player.maxSta * .4) {
      F.breathWarned = true;
      rt.bark('息が上がっている。味方の後ろで休め', true);
    }
    // 槍組の後ろへ着き、迫る敵もいなければ、十五秒を待たず次の務めへ戻す。
    // 敵の数や打ち込みは変えず、味方が実際に来ている時だけ退避を終える。
    if (dangerProgress(rt) && rt.distTo(RETREAT_SPOT) < 3) {
      let supported = false, threatened = false;
      if (F.relief && !F.relief.routed) for (const u of F.relief.units) {
        if (canWorkBank(u) && Math.hypot(u.pos.x - RETREAT_SPOT.x, u.pos.z - RETREAT_SPOT.z) < 6) { supported = true; break; }
      }
      if (supported) for (const g of F.last) {
        if (g.routed) continue;
        for (const u of g.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget || u.boatSeat?.aboard) continue;
          if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 6 && !rt.army.wallBetween(rt.player.u.pos, -1, u.pos)) { threatened = true; break; }
        }
        if (threatened) break;
      }
      if (supported && !threatened) F.dangerReached = true;
    }
    if (F.dangerAt != null && !dangerProgress(rt) && !F.dangerDone) {
      F.dangerDone = true;
      F.sallyTask = null; F.finalTask = null;
      // 退避の印を消し、この更新で次の務めを選び直す。
      // 敵がいない時に「残る敵を止めよ」と告げず、縄・見張りの下知へ直接戻す。
      F.lastClock = null; F.finalClock = null;
      rt.unmark('retreat');
    }
    const hurt = rt.player.u.hp < rt.player.u.maxHp * .5;
    if (hurt !== F.hurtVisible) { F.hurtVisible = hurt; F.hurtEdge.style.display = hurt ? 'block' : 'none'; }
    if (hurt && !F.hurtShown && (F.step === 3 || F.step === 3.5)) {
      F.hurtShown = true;
      if (!dangerProgress(rt) && !F.dangerDone) rt.marker('retreat', RETREAT_SPOT, '傷が深い！　味方の後ろへ', { guideArea: 'retreat', guideRadius: 3 });
      if (!dangerProgress(rt) && !F.dangerDone) rt.say('足軽', '傷が深い！　敵に向き直り、柵の内へ下がれ', 3);
    } else if (!hurt && F.hurtShown) {
      F.hurtShown = false;
      // 傷の知らせが消えても、槍組へ退く下知と行き先は十五秒の間そろえる。
      if (!dangerProgress(rt)) rt.unmark('retreat');
    }
    if (F.step === 1) {
      // 中央の横木を最初から最後まで同じ場所で案内する。
      // 人足が遅れたり倒れたりしても、本人は岸側から縄を締められる。
      if (!rt.G.lord && !F.participated) {
        const s = WORK_SPOTS[F.workSpot], p = rt.player.u.pos;
        // 横木の前は人足と槍組で混む。印の輪（五歩）に入れば縄に手が届くとする（描いて遊ぶと四〜八歩手前で押し返された）。
        const near = p.z >= BANK_Z - 1 && Math.hypot(p.x - s.x, p.z - s.z) < 5.5;
        const task = near ? 'work' : 'move';
        if (!rt.markers.some(m => m.id === 's' + F.workSpot))
          rt.marker('s' + F.workSpot, s, '岸の横木', { h: .6 });
        if (F.buildTask !== task) {
          F.buildTask = task;
          rt.obj('main', '岸の横木に縄をかけよ', 'main');
          sayGap(rt, '足軽', near ? 'この縄を頼む。しっかり締めてくれ' : '岸の中央の横木へ。縄を締めてくれ', 3);
        }
        rt.objProgress('main', '縄 ' + (F.personalBuilt || 0) + '／一か所');
        // 11/6 fixc1844：携帯では長押しの札が出ず、横木の前に立っても縄が締まらず 900 秒で負けた（描いて遊んで見た）。
        //   横木の前に立てば、本人も人足と縄を締める（長押しの時は早く済む）。
        if (near && bankPlayerReady(rt) && !F.raised?.[F.workSpot]) {
          F.selfTie = (F.selfTie || 0) + dt * (rt.holdId === 's' + F.workSpot ? 2 : 1);
          F.personalWork[F.workSpot] = Math.max(F.personalWork[F.workSpot] || 0, F.selfTie * BUILD_HOLD / (HELP_HOLD + 2));
          if (F.selfTie >= HELP_HOLD + 2) { F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1; this.raise(rt, F.workSpot); }
        }
      }
      const lordAtBank = rt.G.lord && bankPlayerReady(rt) && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z - (BANK_Z + 5)) < 5;
      if (lordAtBank || F.participated) this.watch(rt);
    }
    if (F.step === 1.25) {
      const p = rt.player.u.pos;
      let spot = nearestBankSpot(p);
      // 境目を少しまたぐたびに印を遠い岸へ飛ばさない。
      // 別の持ち場へ十分近づいた時だけ、案内を引き継ぐ。
      if (spot !== F.watchSpot && Math.abs(p.x - SPOTS[spot].x) + 4 >= Math.abs(p.x - SPOTS[F.watchSpot].x)) spot = F.watchSpot;
      const s = SPOTS[spot];
      const spotChanged = spot !== F.watchSpot;
      F.watchSpot = spot;
      // 入った後は一歩のずれを許し、場所と向きの境目で下知を往復させない。
      // 柵の川側に出ていても、岸の上なら見張りに数える（柵の外へ出て戻れずに務めを落とさない）。
      const near = p.z >= BANK_Z - 6 && Math.hypot(p.x - s.x, p.z - (BANK_Z + 2)) < (F.watchNear ? 10 : 9);
      // 体を残して肩越しに川を見ても、見張りを続けられる。
      const facing = watchingRiver(rt);
      F.watchNear = near; F.watchFacing = facing;
      const task = !near ? 'move' : !facing ? 'turn' : 'watch';
      // 持ち場に着いたら、足元でなく川の向こうを示す。移動の印とは同時に出さない。
      const watchMarker = task === 'turn' ? 'watchFacing' : 'watch';
      if (spotChanged || !rt.markers.some(m => m.id === watchMarker)) {
        rt.unmark('watch'); rt.unmark('watchFacing');
        rt.marker(watchMarker, { x: s.x, z: task === 'turn' ? CH_Z : BANK_Z + 5 }, task === 'turn' ? '歩かず、この向きへ' : '水路を見張る持ち場');
      }
      if (task !== F.watchTask) {
        F.watchTask = task;
        rt.obj('main', this.taskLines[1], 'main');
        if (task === 'move') sayGap(rt, '足軽', '岸の柵へ。槍を構え、寄る舟に備えよう', 3);
        else if (task === 'turn') sayGap(rt, '足軽', 'そこに立ったまま、川の向こうを向け', 3);
        F.watchClock = null;
      }
      if (near && facing && bankPlayerReady(rt)) F.watchTime += dt;
      if (F.watchTime >= WATCH_HOLD) {
        F.watchAt++; F.watchTime = 0;
        if (F.watchAt >= 1) { F.watchDone = true; this.preBoats(rt); }
      }
      if (F.step === 1.25) {
        if (Math.floor(rt.t) !== F.watchClock) {
          F.watchClock = Math.floor(rt.t);
          const detail = !near ? '岸の柵へ進め' : !facing ? riverTurnText(rt) : '岸の柵で槍を構え、舟に備えよ';
          // 本人が岸で舟に備えるまで進めない。移動や向き直りに期限を設けない。
          rt.objProgress('main', detail);
        }
      }
    }
    if (F.step === 2) {
      const w = rt.t - F.stepT;
      const p = rt.player.u.pos;
      const nearBank = onBank(p, F.boatsNear);
      F.boatsNear = nearBank;
      const task = !nearBank ? 'return' : w < 8 ? 'watch' : 'prepare';
      if (task !== F.boatsTask) {
        F.boatsTask = task; F.boatsClock = null;
        rt.obj('main', task === 'return' ? '岸の柵へ戻れ。舟を追うな' : task === 'watch' ? '岸の柵に槍を並べ、鉄砲衆を守れ' : '柵の内で、味方と反撃に備えよ', 'main');
        // 帰陣中も射撃後も、現在の下知と同じ行き先を示す。
        F.boatsSpot = nearestBankSpot(p);
        rt.marker('bank', { x: SPOTS[F.boatsSpot].x, z: BANK_Z + 5 }, task === 'return' ? '岸の柵へ戻る' : task === 'watch' ? '岸の持ち場' : '柵の内で反撃に備える');
      }
      // 舟を見届ける間も、岸の場所と今の務めを伝える。
      if (Math.floor(w) !== F.boatsClock) {
        F.boatsClock = Math.floor(w);
        rt.objProgress('main', !nearBank ? '岸へ戻り、味方と合流せよ' : w < 6 ? '退く舟は討つな。次の下知を待て' : w < 8 ? '鉄砲組に任せ、柵の内で待て' : '岸の柵に槍を並べ、鉄砲衆を守れ');
      }
    }
    if (F.step === 3) {
      const w = rt.t - F.stepT;
      // 同じ後続舟を川上から寄せる。戦える後詰めまで第一陣の敗走で繰り上げると、三分以内で終わってしまう。
      // 戦える者が残らない舟は、待たずに受け終えた扱いにする。
      if (F.rearBoatAt == null && (w >= 110 || !canCounterattack(F.last[2]))) {
        F.rearBoatAt = rt.t;
        // 戦える者がいない舟のために、東へ移動させない。
        F.rearBoatThreat = canCounterattack(F.last[2]);
        rt.say('物見', F.rearBoatThreat ? '後の舟が動いた！　西の岸で構えよ' : '後の舟に戦える敵はおらぬ。岸を見張れ', 3);
      }
      // 戦える者のいない舟を、反撃の待ち時間に数えない。
      // 11/6 fixc1439：一陣を退けてから後の舟まで息をつかせ過ぎず、早すぎもしない（一戦が二分半で終わっていた）。
      if (F.rearBoatAt != null && (rt.t - F.rearBoatAt >= 20 || !canCounterattack(F.last[2]))) this.sallyWave(rt, 2);
      // 東の舟も別の川筋から寄せる。後の舟が崩れても、戦える最後の舟は到着を繰り上げない。
      if (F.thirdBoatAt == null && F.last[2].sallyReleased && (w >= 195 || !canCounterattack(F.last[3]))) {
        F.thirdBoatAt = rt.t;
        if (canCounterattack(F.last[3])) rt.say('物見', '東の葦の陰から、まだ舟が出る！', 3);
      }
      if (F.thirdBoatAt != null && (rt.t - F.thirdBoatAt >= 16 || !canCounterattack(F.last[3]))) this.sallyWave(rt, 3);
      const p = rt.player.u.pos;
      const atBank = bankPlayerReady(rt) && onBank(p, F.sallyNear);
      F.sallyNear = atBank;
      if (atBank && !F.broken) { F.sallyHeld += dt; F.bankAway = 0; }
      else if (!F.broken) F.bankAway += dt;
      if (F.bankAway >= 5 && !F.awayWarned) { F.awayWarned = true; rt.bark('岸へ戻れ！　持ち場を空ければ敵が抜けるぞ', true); }
      if (atBank) F.awayWarned = false;
      if (F.bankAway >= 15) dangerWarning(rt);
      let through = 0, pressing = false, shoreFoes = false, landingFoes = false, rearThreat = null, rearDistance = Infinity;
      for (const g of F.last) for (const u of g.units) {
        if (g.routed || !bankFighterReady(u) || u.noTarget) continue;
        if (u.boatSeat?.aboard) {
          if (g.sallyReleased && !u.boatSeat.escape) {
            pressing = true;
            // 着岸済みの舟で戦う門徒を「次の舟」に数えない。
            if (u.retreatBoat?.landed) landingFoes = true;
          }
          continue;
        }
        if (Math.abs(u.pos.x) < 48 && u.pos.z > BANK_Z + 24 && u.pos.z < BANK_Z + 60) {
          through++;
          const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
          if (d < rearDistance) { rearThreat = u; rearDistance = d; }
        }
        if (u.pos.z >= BANK_Z - 12 && u.pos.z < BANK_Z + 36 && Math.abs(u.pos.x) < 60) pressing = shoreFoes = true;
      }
      // 全ての舟を受けてから川を見た八秒を数える。敵への応戦中も済んだ分は残す。
      const shoreClear = !pressing && through === 0 && F.last[3].sallyReleased;
      const facingRiver = watchingRiver(rt);
      F.shoreFacing = facingRiver;
      if (shoreClear && atBank && !dangerProgress(rt) && facingRiver) F.shoreQuiet += dt;
      F.breakThrough = through;
      // 味方の人数では落とさない。背後の敵を減らせば押し込みの時間も戻る。
      F.pushTime = through >= 4 ? Math.min(PUSH_HOLD, F.pushTime + dt) : Math.max(0, F.pushTime - dt * 2);
      if (through > 0 && !F.breakWarned) { F.breakWarned = true; rt.bark('背後へ敵が抜けた！　振り向き、味方と止めよ', true); }
      if (through === 0) F.breakWarned = false;
      if (through >= 4) dangerWarning(rt);
      if (!F.broken && w >= SALLY_HOLD && F.pushTime >= PUSH_HOLD && !dangerProgress(rt)) {
        F.broken = true;
        rt.say('柴田勝家', '背後への押し込みを止められぬ。西の柵へ下がれ', 4);
      }
      if (Math.floor(w) !== F.lastClock) {
        F.lastClock = Math.floor(w);
        // 退避の秒数だけで、持ち場を失う押し込みの知らせを隠さない。
        const breach = through >= 4 && !F.broken;
        const behind = through > 0 && !F.broken;
        const waiting = !shoreFoes && !landingFoes && (!F.last[3].sallyReleased || pressing);
        const checkingShore = F.last[3].sallyReleased && !pressing && through === 0;
        const eastBank = F.broken || F.rearBoatAt != null && F.rearBoatThreat;
        const eastAway = eastBank && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) >= 5;
        const task = dangerProgress(rt) ? 'retreat' : F.broken ? 'lost' : behind ? 'breach' : !atBank ? 'return' : shoreFoes || landingFoes ? 'hold' : waiting ? 'boats' : !facingRiver ? 'turn' : 'watch';
        if (task !== F.sallyTask || eastBank !== F.sallyEast || eastAway !== F.sallyEastAway) {
          // 持ち場の境目を行き来しても、同じ下知を続けて積まない。
          const taskChanged = task !== F.sallyTask;
          F.sallyTask = task;
          F.sallyEast = eastBank;
          F.sallyEastAway = eastAway;
          // 最後の舟が接岸する間も、さらに別の舟を待つ下知にはしない。
          rt.obj('main', task === 'lost' ? '岸を破られた。西の柵へ下がれ' : task === 'retreat' ? '危ない！　槍組の後ろへ下がれ' : task === 'breach' ? '振り向き、背後の敵を味方と止めよ' : task === 'return' ? eastBank ? '西の岸の柵へ戻れ' : '岸の柵へ戻り、柵の内で守れ' : task === 'boats' ? eastAway ? '西の柵へ進み、寄せる舟に備えよ' : eastBank ? '西の柵で、寄せる舟に備えよ' : '岸で川を見張り、寄せる舟に備えよ' : task === 'turn' ? 'この場で川の向こうへ向き直れ' : task === 'watch' ? '川を向き、舟を見張れ' : '柵の内で、味方と門徒を止めよ', 'main');
          if (taskChanged && task === 'watch') sayGap(rt, '組頭', '追うな。岸に立ち、川を見張れ', 3);
          if (taskChanged && task === 'turn') sayGap(rt, '足軽', 'その場で川を向け。舟から目を離すな', 3);
          if (task === 'return') {
            rt.marker('bank', { x: eastBank ? 24 : 0, z: BANK_Z + (eastBank ? 6 : 5) }, eastBank ? '西の岸の持ち場' : '岸の持ち場');
            sayGap(rt, '組頭', eastBank ? '西の岸の柵へ戻れ。川へ敵を追うな' : '岸の柵へ戻れ。川へ敵を追うな', 3);
          }
          // 岸が静まったら今いる持ち場で見張る。東への移動は縄の確認から。
          if (task === 'watch') rt.unmark('bank');
          // 東の岸への声と行き先をそろえる。退避の印は優先して残す。
          if (eastBank && (task === 'lost' || task === 'boats' || task === 'hold')) rt.marker('bank', { x: 24, z: BANK_Z + 6 }, F.broken ? '西の柵へ下がる' : '西の岸で舟に備える');
        }
        if (task === 'turn') {
          if (!rt.markers.some(m => m.id === 'shoreFacing')) rt.marker('shoreFacing', { x: p.x, z: CH_Z }, '歩かず、この向きへ');
        } else rt.unmark('shoreFacing');
        // 振り向く下知には、岸の持ち場でなく背後へ抜けた敵を一つ示す。
        if (task === 'breach' && rearThreat) {
          if (F.rearThreat !== rearThreat || !rt.markers.some(m => m.id === 'breach')) rt.marker('breach', rearThreat.pos, '背後の敵を味方と止める', { red: true });
          F.rearThreat = rearThreat;
        } else { F.rearThreat = null; rt.unmark('breach'); }
        // 深手の印から戻った後も、任務と同じ持ち場を示す。
        if (task !== 'retreat' && task !== 'breach' && task !== 'watch' && task !== 'turn' && !rt.markers.some(m => m.id === 'bank') &&
            (!rt.markers.some(m => m.id === 'retreat') || Math.hypot(p.x - RETREAT_SPOT.x, p.z - RETREAT_SPOT.z) < 4)) {
          rt.marker('bank', { x: eastBank ? 24 : 0, z: BANK_Z + (eastBank ? 6 : 5) }, F.broken ? '西の柵へ下がる' : eastBank ? '西の岸で舟に備える' : '岸の持ち場');
        }
        // 反撃を始める時刻と実際の着岸は別。舟の移動を秒読みで言い切らない。
        const boatNews = eastAway ? '西の柵へ進め。後の舟に備えよ'
          : !F.last[1].sallyReleased ? '次の一団に備え、柵の内で構えよ'
          : F.rearBoatAt == null ? '後の舟が川上に残る。岸で見張れ'
          : !F.last[2].sallyReleased ? '後の舟が動いた。西の柵で構えよ'
          : F.thirdBoatAt == null ? '東の葦の陰に舟が残る。岸で構えよ'
          : !F.last[3].sallyReleased ? '東の舟が寄る。柵の内で構えよ'
          : '最後の舟を受けた。岸で構えよ';
        // 全ての舟を受けた後の八秒だけを数える。着岸や二分の経過を待つ札にはしない。
        rt.objProgress('main', task === 'retreat' ? behind ? '槍組の後ろへ下がれ。背後へ敵が抜けた' : '槍組の後ろへ下がり、息を整えよ' : F.broken ? '岸の守りを破られた。西の柵へ下がれ' : breach ? '背後へ門徒が押し込む。味方と押し返せ' : behind ? '背後へ敵が抜けた。振り向き、味方と止めよ' : !atBank ? eastBank ? '西の岸の柵へ戻れ' : '岸の柵へ戻り、味方と川を見張れ' : checkingShore ? !facingRiver ? riverTurnText(rt) : '岸の柵で槍を構え、後の舟に備えよ' : eastAway && task === 'boats' ? '西の柵へ進め。味方と舟に備えよ' : landingFoes && !shoreFoes ? '着いた舟に敵がいる。柵の内で味方と止めよ' : waiting ? boatNews : pressing ? '岸に敵が残る。柵の内で味方と止めよ' : '岸で川を見張れ。静まったら西の縄を確かめる');
      }
      // 負傷して戦えない者が隊に残っていても、静まった岸で二分まで待たせない。
      // 後の舟まで受け、背後の敵も止めてから八秒見張る。戦える兵は減らさない。
      const repelled = shoreClear && atBank && facingRiver && F.sallyHeld >= SALLY_HOLD && F.shoreQuiet >= SHORE_WATCH_HOLD;
      if (!dangerProgress(rt) && (repelled || F.broken)) {
        F.sallyDefended = !F.broken && (F.sallyHeld >= 8 || atBank);
        F.sallyFailed = !!F.broken;
        if (F.sallyDefended) {
          rt.award((t) => t.side.push('退城した門徒の反撃を岸で受け止めた'), '退城した門徒の反撃を岸で受け止めた');
          rt.say('柴田勝家', `${nm(rt)}、岸をよく支えた。味方を西の守りへ移すぞ`, 3);
        }
        this.midB(rt);
      }
    }

    if (F.step === 3.5 && !F.dpLast) {
      const p = rt.player.u.pos;
      let foes = 0, closeFoes = 0, threat = null, threatDistance = Infinity;
      for (const g of F.last) for (const u of g.units) {
        if (g.routed || !bankFighterReady(u) || u.noTarget || u.boatSeat?.aboard || u.pos.z < BANK_Z - 3) continue;
        const inEast = Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) < 14;
        if (inEast) foes++;
        // 味方と戦う門徒が六歩内にいるだけでは縄を確かめる札を消さない。
        // 密着する敵と、本人へ向かう突撃・打ち込みは先に受ける。
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        const attacksPlayer = u.target === rt.player.u || u.atk?.target === rt.player.u ||
          u.swing && !u.swing.done && u.swing.target === rt.player.u;
        const close = (d < 2.8 || d < 6 && attacksPlayer) && !rt.army.wallBetween(p, -1, u.pos);
        if (close) closeFoes++;
        // 目の前の敵を先に示す。同じ敵が残る間は印を動かし直さない。
        if (close || F.finalChecked >= 3 && inEast) {
          const score = (close ? 0 : 1000) + (u === F.finalThreat ? -100 : d);
          if (score < threatDistance) { threat = u; threatDistance = score; }
        }
      }
      F.finalFoes = foes;
      // 持ち場の縁を一歩またぐだけでは、見張りを最初からやり直させない。
      // 入る時は十八歩以内、離れる時は二十歩で区切り、札の切り替わりも落ち着かせる。
      // 川へ出た者を、柵の内で見張る人数に数えない。
      const atEast = p.z >= BANK_Z && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < (F.atEast ? 20 : 18);
      F.atEast = atEast;
      // 川を見る向きにも余裕を持たせ、少しの視点操作で下知を往復させない。
      const facing = watchingRiver(rt);
      F.finalFacing = facing;
      // 持ち場の端でも、本人へ迫る敵がいる間は見張りを進めない。
      const safe = bankPlayerReady(rt) && atEast && foes === 0 && closeFoes === 0 && facing && !dangerProgress(rt);
      // 味方が別の場所で受けている敵は、手元の確認を妨げない。見張りの達成は岸全体が静まってから。
      F.finalReady = bankPlayerReady(rt) && atEast && closeFoes === 0 && !dangerProgress(rt);
      const fighting = closeFoes > 0 || F.finalChecked >= 3 && atEast && foes > 0;
      const nextCheck = F.finalChecks.indexOf(false);
      const nextSpot = CHECK_SPOTS[nextCheck];
      // 川側から縄に近づいても作業はできない。確認の条件と下知をそろえる。
      const moving = nextSpot && (!atEast || Math.hypot(p.x - nextSpot.x, p.z - nextSpot.z) >= 3);
      const task = dangerProgress(rt) ? 'retreat' : fighting ? 'fight' : F.finalChecked >= 3 ? !atEast ? 'return' : !facing ? 'turn' : 'watch' : moving ? 'move' : 'check';
      if (task !== F.finalTask || nextCheck !== F.finalNextCheck) {
        F.finalTask = task; F.finalNextCheck = nextCheck;
        // 戦い・縄・見張りを切り替える時に、前の行き先を残さない。
        // この後で、今の下知に合う印だけを一つ戻す。退避の印は別に保つ。
        for (const id of ['check0', 'check1', 'check2', 'east', 'finalFacing', 'finalThreat']) rt.unmark(id);
        rt.obj('main', task === 'retreat' ? '危ない！　槍組の後ろへ下がれ' : task === 'fight' ? F.finalChecked < 3 ? '西の柵の手前で、門徒を味方と受け止めよ' : '西の柵で、味方と残る門徒を受け止めよ' : task === 'return' ? '西の柵へ戻り、味方と見張れ' : task === 'turn' ? 'この場で川の向こうへ向き直れ' : task === 'watch' ? '川を向き、舟を見張れ' : task === 'move' ? `柵の内から、西の${nextCheck + 1}つ目の杭へ進め` : '杭の前で縄を確かめよ', 'main');
        F.finalClock = null;
        if (task === 'move') sayGap(rt, '足軽', '川へ出るな。柵の内から縄の杭へ', 3);
        else if (task === 'return') sayGap(rt, '足軽', '西の柵へ戻れ。そこで舟を見張ろう', 3);
        else if (task === 'turn') sayGap(rt, '足軽', 'その場で川を向け。舟から目を離すな', 3);
        else if (task === 'fight') sayGap(rt, '足軽', F.finalChecked >= 3 ? '敵を味方と止めよう。見張りはその後じゃ' : '縄は後じゃ。まず敵を味方と止めよう', 3);
        else if (task === 'check') sayGap(rt, '足軽', F.finalCheckT > 0 ? '縄の続きじゃ。その杭で確かめよう' : 'その杭で止まれ。縄を確かめよう', 3);
        else if (task === 'watch') sayGap(rt, '足軽', '岸に立って、舟を見張ろう', 4);
      }
      // 戦う間は止める敵の印一つ。静まれば縄や見張り場へ案内を戻す。
      if (task === 'fight') {
        if (threat && (F.finalThreat !== threat || !rt.markers.some(m => m.id === 'finalThreat'))) {
          rt.marker('finalThreat', threat.pos, '斬り込む門徒', { red: true });
        }
        F.finalThreat = threat;
      } else if (task === 'watch') {
        // 見張りが進む場所では、別の足元へ歩かせる印を出さない。
        F.finalThreat = null;
        rt.unmark('east');
      } else if (task !== 'retreat') {
        F.finalThreat = null;
        const next = F.finalChecks.indexOf(false), id = task === 'turn' ? 'finalFacing' : next < 0 ? 'east' : 'check' + next;
        if (!rt.markers.some(m => m.id === id)) rt.marker(id, task === 'turn' ? { x: p.x, z: CH_Z } : next < 0 ? { x: 24, z: BANK_Z + 6 } : CHECK_SPOTS[next], task === 'turn' ? '歩かず、この向きへ' : next < 0 ? '柵を見張る持ち場' : CHECK_NAMES[next]);
      }
      if (safe && !dangerProgress(rt)) rt.unmark('retreat');
      // 中断の案内は上の任務切り替えで一度だけ伝える。済んだ見張りは残す。
      const watching = safe && F.finalChecked >= 3 && !dangerProgress(rt);
      if (watching) { F.finalHeld += dt; F.finalSafe += dt; }
      // 印で手元が静かな四秒を数える。応戦や退避の間は止め、同じ縄の続きから再開する。
      { const i = F.finalChecks.indexOf(false), spot = CHECK_SPOTS[i];
        if (spot && F.finalReady && !dangerProgress(rt) && Math.hypot(p.x - spot.x, p.z - spot.z) < 3) {
          F.finalCheckT += dt;
          if (F.finalCheckT >= CHECK_HOLD) { F.finalCheckT = 0; F.finalCheckDone[i]?.(); return; }
        } }
      if (foes >= 4) dangerWarning(rt);
      if (Math.floor(rt.t - F.stepT) !== F.finalClock) {
        F.finalClock = Math.floor(rt.t - F.stepT);
        // 縄の確認と見張りの進み具合を伝える。移動や応戦で期限切れにしない。
        const detail = task === 'retreat' ? '槍組の後ろへ下がり、息を整えよ' : task === 'turn' ? riverTurnText(rt) : F.finalChecked < 3 ? `縄 ${F.finalChecked}／三か所　${task === 'fight' ? 'まず敵を止めよ' : task === 'check' ? '西の柵の縄を締め直せ' : `${nextCheck + 1}つ目へ`}` : watching ? '西の柵で槍を構え、舟に備えよ' : '西の柵へ戻り、舟に備えよ';
        // 再開の行動は任務本文にある。小さな札に同じ下知を重ねない。
        rt.objProgress('main', detail);
      }
      // 三か所を見回って見張る。岸で失敗していても、見回りの務めは最後まで残す。
      if (!dangerProgress(rt) && watching && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD) { F.held = F.finalChecked >= 3; rt.unmark('east'); this.preWin(rt); }
    }
  },

  onFinish(rt) { rt.flags.hurtEdge.remove(); rt.unmark('retreat'); },

  onKill(rt, v, k) {
    if (k?.isPlayer && v.team !== 0 && rt.flags.step === 3) rt.flags.sallyKills = (rt.flags.sallyKills || 0) + 1;
    // 共通の鉄砲組の報告も、煙越しの正確な討ち取り人数にはしない。
    rt.volleyKillN = 0;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.flags.routSaid || rt.flags.adv || !nearTroops(rt, g)) return;
    rt.flags.routSaid = true; // 三隊が順に散っても、同じ声は戦を通して一度だけ。
    rt.say('足軽', '門徒が散るぞ。追うな、岸に残れ！', 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) { brokenWall(rt, s);
      const x = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.pos?.x || 0;
      const bit = x < -10 ? 1 : x > 10 ? 2 : 4;
      if ((rt.flags.fenceWarned || 0) & bit) return;
      rt.flags.fenceWarned = (rt.flags.fenceWarned || 0) | bit;
      rt.bark(x < -10 ? '東の柵が破られた！' : x > 10 ? '西の柵が破られた！' : '中央の柵が破られた！', true); }
  },
};

// 表示の兵力は遊びの目安。戦う者と、二砦に残る非戦闘の人々の数を分ける。
// 11/8 critic60 長島（九3・十二1）：描いた兵の減り方を全体の数へ写し、斬り込みと火で両軍の数と棒が動くようにする。入れ物は使い回す。
nagashima.force = (rt) => {
  const S = rt.flags._force || (rt.flags._force = { a0: 0, b0: 0, lost: new WeakSet(), aLost: 0, bLost: 0, out: { a: 70000, a0: 70000, b: 10000, b0: 10000 } });
  let a0 = 0, b0 = 0;
  for (const u of rt.army?.units || []) {
    if (!u || u.isPlayer || u.civ || u.isStruct || (u.team !== 0 && u.team !== 1)) continue;
    // 舟の待機・降伏・持ち場への帰還で攻撃対象から外れても、兵数は減らさない。
    if (u.team === 0) a0++; else b0++;
    // 舟で逃れた者は despawn で alive=false・gone=true になるが、討死ではない。
    // 実際の死傷を一度だけ覚え、兵が列から片付けられても損害を戻さない。
    const casualty = u.hp <= 0 || u.dying || u.woundOut || u.rearWound || !u.alive && !u.gone;
    if (casualty && !S.lost.has(u)) {
      S.lost.add(u);
      if (u.team === 0) S.aLost++; else S.bLost++;
    }
  }
  S.a0 = Math.max(S.a0, a0); S.b0 = Math.max(S.b0, b0);
  // 着火は結末の三秒後。火が広がる間に減らし、着火前に半減させない。
  const fireAt = rt.flags.advEnding ? rt.flags.advEndAt : rt.flags.ending ? rt.flags.endingAt : null;
  const fireProgress = fireAt != null ? Math.max(0, Math.min(1, (rt.t - fireAt - 3) / (END_SEC - 3))) : 0;
  const burnt = 1 - .55 * fireProgress;
  // 後続の組が加わって分母が増えても、既に減った兵数を戻さない。
  S.out.a = Math.min(S.out.a, 70000 - (S.a0 ? Math.min(1, S.aLost / S.a0) * 2500 : 0));
  S.out.b = Math.min(S.out.b, (S.b0 ? 10000 * Math.max(0, 1 - S.bLost / S.b0) : 10000) * burnt);
  return S.out;
};
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.rts = true;
nagashima.namedKacchu = NAGASHIMA_KACCHU;
// 開戦時の局地兵と囲みの人足四人。舟の四十五人を含め約百人＋自分の組と供。追加の波は作らない。
nagashima.noWake = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nagashima.famous = [];
nagashima.noTaisho = true;
nagashima.noDistantBattle = true;
nagashima.date = () => '天正二年九月二十九日　秋';
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.ngMonomiDone && !rt.flags.adv && !rt.flags.advPending ? '堤の下知まで待つ' : '');
nagashima.skip = (rt) => { if (nagashima.canSkip(rt)) nagashima.advance(rt, 0); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。八月に大鳥居・篠橋の砦が落ち、九月二十九日、長島の城は降った。ところが、城を出る門徒に織田方が鉄砲を撃ちかけたため、怒った門徒が斬り込み、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説あり、総勢七万・一揆の戦う者一万は遊びの目安。信長公記巻七と大日本史料の九月二十九日条をもとにした。岸の柵作り、退城舟の着岸場所と人数、砦の距離、昼の景色は復元。五拠点の多角形の平場、長島の奥の段、土塁、木戸、井楼、番所、長屋、蔵、館、井戸、板葺きと檜皮葺き、低い留め石、道と分流の配置は、戦国末期の北伊勢の土の城からの推定で、実測縄張りを写したものではない。堤と中洲の小拠点は遊びの補いで、既に落ちた篠橋・大鳥居とはしない。守将の個別の居場所は不明で、織田信広らの討死は自分の手柄で変わらない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nagashima.lordAt = { x: 0, z: 60, r: 12, why: '岸の後ろの織田の陣（信長は陸と海から長島を囲んだ）' };
nagashima.lordSpawn = { x: 0, z: 56, heading: Math.PI };

// 素直な遊び手：柵を結い、舟を見張り、反撃を岸で受け止め、東の包囲の柵へ移る
// 退く時も敵を向く。行き先を向いて歩くと、背に受けて構えが効かない。
function bankMove(p, inp, foe, x, z, goTo) {
  inp.runHeld = false;
  // 近くの打ち込みだけ受ける。敵がいるだけで構え続けると、退き足も気力の回復も遅れる。
  inp.guardHold = !!foe && Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) < 6 &&
    !!((foe.charging && foe.target === p.u) || (foe.atk && foe.atk.target === p.u) ||
      (foe.swing && !foe.swing.done && foe.swing.target === p.u));
  if (!foe) { goTo(p, inp, x, z, 2); return; }
  if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
  p.yaw = Math.atan2(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z);
  const dx = x - p.u.pos.x, dz = z - p.u.pos.z;
  if (Math.hypot(dx, dz) <= 2) return;
  const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
  const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
  if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
}

nagashima.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive) return;
  // 足した段：堤の物見・段の中は共通の段の頭
  if (F.ngMonomi) { goTo(p, inp, F.ngMonomi.x, F.ngMonomi.z, 2); return; }
  if (F.advEnding) { inp.guardHold = false; if (F.advWalk && !F.advSaid) goTo(p, inp, F.advWalk.x, F.advWalk.z, 2); return; }
  if (F.adv && !(F.dp && F.dp.on)) return;
  if (F.dpOn && F.dp?.on) {
    if (!F.adv) { depthBot(b, inp, goTo); return; }
    // 木戸まで残り四歩で止めず、中央を抜けてから元の行き先へ進む。
    const goal = F.advBotGoal || (F.advBotGoal = { x: 0, z: 0 });
    const routedGoTo = F.advGoTo || (F.advGoTo = (player, input, x, z, radius) => {
      goal.x = x; goal.z = z;
      const next = fortWay(player.u, goal);
      goTo(player, input, next.x, next.z, next === goal ? radius : next.botRadius);
    });
    depthBot(b, inp, routedGoTo);
    return;
  }
  if (F.ending) {
    inp.guardHold = false; inp.runHeld = false;
    const spot = AFTERMATH_SPOTS[F.aftermathChecked];
    if (F.aftermathHeld && spot && Math.hypot(spot.x - u.pos.x, spot.z - u.pos.z) >= 2) {
      bankMove(p, inp, null, spot.x, spot.z, goTo);
    } else p.yaw = Math.atan2(YANAGASHIMA.x - u.pos.x, YANAGASHIMA.z - u.pos.z);
    return;
  }
  // 近いだけの相手より、いま打ち込む相手を先に受ける。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    if (!bankFoeReady(o) || o.team === u.team || o.invuln ||
        o.type === 'gun' || o.type === 'bow' || o.boatSeat?.aboard || o.pos.z < BANK_Z - 3 || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // いま自分へ打ち込む相手だけを優先する。味方が受けている敵は見回りを妨げない。
    if (!(o.charging && o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u)) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  const picked = attacker || strikeTarget(b, F.step === 1 ? 8 : 13);
  // 共通の選び方に深手の兵が残っていても、守備と同じ判定で戦える門徒へ移る。
  const candidate = bankFoeReady(picked) ? picked : bankNearestFoe(b);
  // 岸を守る者は、退く舟や川の中の門徒を追わない。上陸した相手を受ける。
  // 東へ移る時は、十三歩先で味方が受けている敵を向いて寄り道しない。
  const e = bankFoeReady(candidate) &&
    (F.step !== 1.25 || attacker) &&
    (F.step !== 3.5 || attacker || Math.hypot(candidate.pos.x - u.pos.x, candidate.pos.z - u.pos.z) < 6) ? candidate : null;
  // 11/2：見張りの段（1.25）で、届かない岸の際の敵へ向いたまま印の九歩手前で止まり、480秒まで段が進まなかった（bot だけ）。
  // 六歩内でも、本人を攻めない敵は味方へ任せる。印へ戻り、川を向いて見張りを続ける。
  // 東への移動中も、深手や気力切れなら同じ持ち場の後ろへ退く。
  // 傷の自然回復は待たず、敵が離れて気力が戻ったら守りに加わる。
  const defending = F.step === 3 || F.step === 3.5;
  if (defending && dangerProgress(b)) {
    bankMove(p, inp, e, 24, BANK_Z + 16, goTo); return;
  }
  if (defending && u.pos.z < BANK_Z - 2) {
    bankMove(p, inp, e, F.step === 3.5 ? 24 : u.pos.x, BANK_Z + 6, goTo);
    return;
  }
  const backX = F.step === 3.5 ? 24 : 4;
  const closeFoe = e && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 6;
  // 傷は自然には戻らない。味方の列へ戻っても、半分以下というだけで退き続けない。
  // 実際に並べる味方と近い敵を数え、一人を受けられる時は反撃へ戻る。
  let friends = 0, foes = 0;
  if (defending && e) for (const o of b.army.units) {
    if (o === u || !o.alive || o.fleeing || o.noTarget || o.isStruct || o.woundOut || o.rearWound ||
        o.type === 'porter' || o.type === 'dummy' || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) >= 6 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    if (o.team === u.team) friends++; else foes++;
  }
  const supported = friends >= 2 && foes <= 1 && !u.mobbed;
  if (defending && closeFoe && ((u.hp < u.maxHp * 0.5 && !supported && u.pos.z < BANK_Z + 12) || p.sta < p.maxSta * 0.25)) b.botRest = true;
  if (b.botRest && (!closeFoe || supported || Math.hypot(u.pos.x - backX, u.pos.z - (BANK_Z + 16)) <= 2) &&
      p.sta >= p.maxSta * 0.45) b.botRest = false;
  if (b.botRest) { bankMove(p, inp, e, backX, BANK_Z + 16, goTo); return; }
  // 東の見回りでは、離れた敵は味方に任せ、手元が静かな間に縄を確かめる。
  // 十三歩以内に敵がいるだけで作業を捨てると、三か所とも未確認のまま時間切れになる。
  if (F.step === 3.5 && F.finalChecked < 3 && !attacker) {
    const spot = CHECK_SPOTS[F.finalChecks.indexOf(false)];
    if (spot) {
      // 退き歩きは二歩で止まる。作業半径三歩の内側なら、その場で縄へ手を伸ばす。
      if (Math.hypot(spot.x - u.pos.x, spot.z - u.pos.z) > 2.5) { bankMove(p, inp, e, spot.x, spot.z, goTo); return; }
      if (F.finalReady) { inp.guardHold = false; return; }
    }
  }
  // 守りは印から十八歩以内。印の二歩以内へ入り続けて、目の前の反撃を捨てない。
  if (F.step === 3.5 && e && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) > 10) {
    bankMove(p, inp, e, 24, BANK_Z + 6, goTo); return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    // 刀と槍の間合いに入り、受ける間と構えを解いて突く間を分ける。
    // 毎コマ構えを選び直すと、突きが払いに変わり、気力だけを失う。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    const atPost = F.step !== 3.5 || Math.hypot(e.pos.x - 24, e.pos.z - (BANK_Z + 6)) < 14;
    if (atPost && (u.hp >= u.maxHp * 0.5 || supported) && !attacker && e.pos.z >= BANK_Z && d > reach * 0.9) inp.k.add('KeyW');
    // 刀の敵に密着すると槍の穂先が使えず、突きの傷が小さくなる。
    // 岸の内で半歩退き、穂先が届く間を取り直す。
    if (p.weapon === 'spear' && d < 1.4 && u.pos.z < BANK_Z + 20 && atPost) inp.k.add('KeyS');
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1.25) {
    const s = SPOTS[F.watchSpot];
    if (Math.hypot(u.pos.x - s.x, u.pos.z - (BANK_Z + 5)) > 2) goTo(p, inp, s.x, BANK_Z + 5, 1.5);
    else p.yaw = Math.PI;
    return;
  }
  if (F.step === 1) {
    let it = null, bd = Infinity;
    // 横木の受け付けの場所は関数（人足の支度が済んだ所だけ返す）。済む前は次の横木の前で待つ
    for (const x of b.interacts) if (/^s\d$/.test(x.id)) { const q = typeof x.pos === 'function' ? x.pos() : x.pos; if (!q) continue; const d = Math.hypot(q.x - u.pos.x, q.z - u.pos.z); if (d < bd) { bd = d; it = q; } }
    if (it) { if (bd > 1.6) goTo(p, inp, it.x, it.z, 1.2); else inp.k.add('KeyE'); return; }
    const w = !F.participated && bankWorkSpot(b);
    if (w) { if (Math.hypot(w.x - u.pos.x, w.z - u.pos.z) > 1.6) goTo(p, inp, w.x, w.z, 1.2); else p.yaw = Math.PI; return; }
  }
  if (F.step === 3.5) {
    const next = F.finalChecks.indexOf(false), spot = CHECK_SPOTS[next];
    if (spot) {
      if (Math.hypot(spot.x - u.pos.x, spot.z - u.pos.z) > 1.6) goTo(p, inp, spot.x, spot.z, 1.2);
      else if (F.finalReady) inp.guardHold = false;
    } else if (Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) > 2) goTo(p, inp, 24, BANK_Z + 6, 2);
    else p.yaw = Math.PI;
    return;
  }
  if (F.step === 1 && (b.G.lord || F.participated)) { goTo(p, inp, 0, BANK_Z + 5, 2); return; }   // 11/2：横木の印が消えた後は舟の見張り場の印へ
  if (F.step === 2) { goTo(p, inp, 0, BANK_Z + 4, 2); return; }
  if (F.step === 3 && u.hp < u.maxHp * 0.5) { goTo(p, inp, 4, BANK_Z + 16, 2); return; }
  if (F.step === 3) {
    const q = (F.last || []).find((x) => !gone(x)), tx = q ? q.center().x : 4;
    // 着いたら川を向いて見張る（遊び手と同じ下知どおり）。
    if (Math.hypot(u.pos.x - tx, u.pos.z - (BANK_Z + 3)) > 2) goTo(p, inp, tx, BANK_Z + 3, 2); else p.yaw = Math.PI;
    return;
  }
  goTo(p, inp, 6, BANK_Z + 8, 3);
};


// 信長公記巻七：陸三方と九鬼水軍の囲み、長島の退城、中江・屋長島。
// 願証寺は宗教の中心であり、中江の本陣と同じ拠点にしない。
installBattleJinkei(nagashima, [
  battleJin('陸三方と川口の囲み', 0, { x: 0, z: 60 }, Math.PI, [
    ['nagashima_hq', '早尾口の本陣・旗本の守り', '織田信長', null, { x: 0, z: 60 }, 'eiraku', 'oda', (r) => r.flags.odaCamp?.guard, { named: false }],
    ['nagashima_shibata', '賀鳥口・岸の柵と仕寄り', '柴田勝家', null, { x: 0, z: BANK_Z + 3 }, 'kari', 'kari', (r) => r.flags.shiba],
    ['nagashima_teppo', '岸の鉄砲の備え', '鉄砲組頭（名は不明）', null, { x: 34, z: BANK_Z + 6 }, 'oda', 'oda', (r) => r.flags.teppo, { named: false }],
    // 公記巻七：賀鳥口は柴田・稲葉父子・蜂屋、市江口は信忠の手。佐久間は九月に河内へ移り、この日いない。
    // 北が +z（mapNorth）：+x が西の賀鳥口・今島、-x が東の市江口。名の無い「北西の囲み」は史料に無いので置かない。
    ['nagashima_west', '賀鳥口の西・今島の陣', '稲葉良通・蜂屋頼隆の手', null, { x: 62, z: 34 }, 'oda', 'oda', (r) => r.flags.mouths?.[1], { named: false }],
    ['nagashima_east', '市江口の囲み', '織田信忠の手', null, { x: -62, z: 34 }, 'oda', 'oda', (r) => r.flags.mouths?.[0], { named: false }],
    ['nagashima_kuki', '西の川口・舟の封鎖', '九鬼嘉隆', null, { x: 62, z: CH_Z - 2 }, 'kuki', 'kuki', (r) => r.flags.ship],
    ['nagashima_takigawa', '川口の安宅船', '滝川一益', null, { x: 144, z: CH_Z + 4 }, 'takigawa', 'takigawa', (r) => r.flags.takigawaShip],
    ['nagashima_hayashi', '川筋の囲船', '林秀貞', null, { x: -102, z: CH_Z - 5 }, 'oda', 'oda', (r) => r.flags.hayashiShip],
    ['nagashima_shimada', '東寄りの囲船', '島田所之助', null, { x: -141, z: CH_Z - 5 }, 'oda', 'oda', (r) => r.flags.shimadaShip],
  ], '七万は遊びの目安で諸説あり。陸三方向と水軍は史料の筋、陣の寸法と岸の将の担当は復元。各手の人数は不明。'),
  battleJin('輪中の砦ごとの守り', 1, FORT, 0, [
    ['nagashima_nakae', '長島城の守り（九月二十九日に降る）', '下間頼旦・願証寺の顕忍', null, { x: 18, z: -82 }, 'namu', 'honganji', (r) => r.flags.ikkoCamp?.guard, { named: false }],
    ['nagashima_yanagashima', '屋長島の砦', '門徒衆（将の名は不明）', null, { x: YANAGASHIMA.x, z: YANAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_castle', '中江城（揖斐川の西）', '門徒衆（将の名は不明）', null, { x: NAGASHIMA.x, z: NAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_tsutsumi', '堤の砦', '門徒衆（将の名は不明）', null, { x: TSUTSUMI.x, z: TSUTSUMI.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_nakasu', '中洲の砦', '門徒衆（将の名は不明）', null, { x: NAKASU.x, z: NAKASU.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_bank', '退城した門徒の反撃', '門徒衆（将の名は不明）', null, { x: -10, z: BANK_Z - 4 }, 'namu', 'honganji', (r) => r.flags.last?.[0], { named: false }],
  ], '戦う者一万は目安。砦別の将・兵数は不明で、籠もる非戦の人々を備の兵数に数えない。'),
]);

// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（10/31 bushou_1_16）。敵の大将は討たれない（名簿で討死の人だけ討たれる）。
// 織田秀成は市江口の信忠の手で討死（公記巻七）。賀鳥口の岸には置かず、討死は伝令の声で伝える。
// 11/5 専門家の目：下間頼旦は長島城に籠もり、九月二十九日の退城で討たれた（公記巻七）。中江の守りに討たれぬ将として立たせない。
nagashima.bushou = [];
// 右上の目標（15分の構成の八つ。史実の順。一度入った段からは戻らない）
STAGES.nagashima = nagashima.missions.map((t, k) => (k ? [t, (rt) => (rt.def.missionOf?.(rt) ?? 0) >= k] : [t]));
export { nagashima };
