import { useTerrain } from './asset_manifest.js';
import { pressureTick } from './battle_pressure.js';
import { siegeStages } from './siege_stages.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　信貴山城の戦い（天正五年十月）
// 石山本願寺攻めの陣を勝手に払い、信長に背いた松永久秀は、大和の信貴山城に籠もった。
// 片岡城の落城後、織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶らが城を囲み、十月十日に夜攻め。
// 森好久の内通は後世の伝え。信長公記では久秀自身が天主に火をかけて焼死した。
// 足軽は信忠の軍の筒井順慶の手に付く。①筒井の者の案内で、尾根道を登る（横から伏兵）
// ②矢を受けながら打ち手を守る ③木戸を破り、北尾根の曲輪を押さえる ④寝返りと火の手、久秀自害の知らせ
// 向き：北（-z）の山の上に城。南（+z）の麓に織田の陣
// ======================================================================
import { yamaLift } from './yamalift.js';
import { install as installFumoto } from './shigisan/fumoto.js';   // 0〜2分半：城の麓・火矢と松永の物見
import { install as installOtoshi } from './shigisan/otoshi.js';   // 3〜5分：尾根道の石落とし
import { install as installKaeshi } from './shigisan/kaeshi.js';   // 6〜9分：城内の火・松永の逆寄せ・筒井の後続
import { install as installKousan } from './shigisan/kousan.js';
import { install as installEnjou } from './shigisan/enjou.js';   // 11〜13分：本丸に火が回る   // 9〜12分：降伏の勧めと久秀の拒み・本丸の打って出
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior, facePanels, nakaGuide } from './naka.js';
import { stoneTex, barkTex, woodTex, dirtTex, mudTex, groundDetailTex } from './nature.js';
import { nobori, hut, village, yagura, campfire, kagaribiBatch, kabukimon, gateRoofFrame, tawara, tobira, palisade, solidRect, makeSimpleBatch, finalizeSimpleBatch, castleStoneMat, castleMat, ishigaki, makeKitBatch, finalizeKitBatch } from './props.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { localClear } from './army_local_way.js';
import { groundAt } from './floors.js';
import { drawGroundAt } from './render_camera.js';
import { cloneRoomNearMaterial } from './player.js';
import { buildCastlePlan, makeLordKeep, heightOf, inPoly } from './castle_plan.js';
import { makeSiegeZones, ZONE_STATE, siegeFighter } from './siege_zones.js';

import { timeslipField } from './timeslip_field.js';
import { SHIGISAN_PLAN, TOP, GATE, TOWER, RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI, MEDAKE, TEMPLE, ROAD as SITE_ROAD, TEMPLE_ZONE, ROUTES } from './castles/shigisan.js';
import { demRelief, demDetail } from './dem.js';
import { dressStage } from './stage_dress.js';
import { rainVolley } from './arrow_rain.js';
import { castlePart } from './cgt_castle.js';
import { addTaba, patchGunCover, placeTaba } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';

// 11/6 fix61（十3・二3）：筒井の鉄砲組は竹束を前に立てて尾根道を登る。束は列の頭の二歩半先・道の片側の半分に付き
//   （後から登る門を打つ組の列は道の中ほどを通る。束は当たりを持たないので、列の筋に置かない）、
//   組が止まった所でそのまま据える。前からの矢玉は束の陰で防ぐ（共通の taketaba）。
function tabaTick(rt, dt) {
  const F = rt.flags;
  for (const tb of F.sgTabas || []) {
    const g = tb.sgVan;
    if (F.step >= 3.2 || gone(g) || g.order !== 'path' || !g.path?.[g.pathIdx]) continue;
    let lead = null, best = Infinity;
    const aim = g.path[g.pathIdx];
    for (const u of g.units) if (u.alive) { const d = Math.hypot(u.pos.x - aim[0], u.pos.z - aim[1]); if (d < best) { best = d; lead = u; } }
    if (!lead || best < 3.5) continue;
    const dx = aim[0] - lead.pos.x, dz = aim[1] - lead.pos.z, d = best;
    const ux = dx / d, uz = dz / d, ahead = 2.5;
    const tx = lead.pos.x + ux * ahead - uz * tb.sgOff, tz = lead.pos.z + uz * ahead + ux * tb.sgOff;
    const k = Math.min(1, dt * 2.5);
    tb.x += (tx - tb.x) * k; tb.z += (tz - tb.z) * k;
    if (d > 1) tb.rot = Math.atan2(ux, uz);
    placeTaba(rt, tb);
  }
}

// kaito 10/31：寄せる敵は、ほかの者より本人を多く狙う。本人から三十歩内で打ちかかる組を本人へ向ける
//   （三歩半内の別の敵には先に応じる）。本人が深手の時と、定義が門・櫓へ向けた組は外す。共通の兵の考えは触らない。
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  if (!P?.alive) return;
  const weak = P.hp < P.maxHp * 0.4;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !g.count || g.noHunt) continue;
    const mine = g.focus === P;
    if (g.focus && !mine) continue;
    if (g.routed || weak || g.order !== 'attack' || g.isPlayerSquad) { if (mine) g.focus = null; continue; }
    const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (!mine && d < 30) g.focus = P;
    else if (mine && d > 45) g.focus = null;
  }
}
// 11/6 fixc1429（critic60「門の前で命が一度も減らない・守り手も矢弾も見えない」・十3・二3）：門の内の弓は塀越しに射上げる。
//   木戸に寄る間（本人が門から三十二歩内・木戸が立つ間）は、四〜六秒ごとに寄せ手の固まり（本人の周り）へ一斉射ちを落とす（共通の矢の雨。
//   一人一本・当たりも共通のまま）。塀の内の鉄砲も本人を狙い直す。
function gateVolley(rt, dt) {
  const F = rt.flags, P = rt.player.u;
  if ((F._volleyT = (F._volleyT || 0) - dt) > 0) return;
  F._volleyT = 4 + Math.random() * 2;
  if (!P?.alive || F.ending || rt.over || !(F.step >= 1 && F.step < 3.5) || !F.gate?.alive || !F.arch || gone(F.arch)) return;
  const d = Math.hypot(P.pos.x - GATE.x, P.pos.z - GATE.z);
  if (d > 32 || P.hp < P.maxHp * 0.3) return;
  if (F.arch.fire === false) return;
  // 倒れた守兵・退く備から矢を出さない。共通の斉射へも戦える射手だけを渡す。
  const volley = F.sgVolleyGroup || (F.sgVolleyGroup = { units: [] });
  const live = volley.units;
  live.length = 0;
  for (const u of F.arch.units) if (siegeFighter(u)) live.push(u);
  const bow = live.find((u) => u.type === 'bow');
  if (bow) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    rainVolley(rt.army, volley, bow, { x, y: rt.world.heightAt(x, z), z }, Math.hypot(x - bow.pos.x, z - bow.pos.z));
    // 被害は実際に飛ぶ矢の当たりだけ。固定の時刻で別に命を減らすと、到着前や斉射できない時にも傷を負う。
  }
  for (const u of live) if (u.type === 'gun' && Math.random() < .3) { u.target = P; u.aiT = 2.5; }
}
let sgDem = null;
// 標高が届いたら、寺から里へ下る民の道も同じ地形で整え直す。
useTerrain('dem_shigisan', (data) => { sgDem = data; ROAD_SEGMENTS = null; ROOM_LEVELS = null; GATE_LEVELS = null; PEOPLE_LEVELS = null; });
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 本の足軽写真：黒漆の貸し胴・赤茶の陣笠・藍の着物。既存の形と材質を共用する。
const LOAN_LOOK = { armor: 0x302824, hatColor: 0x63372e, cloth: 0x253740, doStyle: 'okegawa', kasaDrape: true };
const ODA = { ...LOAN_LOOK, flag: 'oda' };
const TSUTSUI = { ...LOAN_LOOK, flag: 'umebachi', hachi: 0xd6cfbe };   // 筒井の手：梅鉢の旗（筒井家の紋。11/5 共通の係）・夜攻めの合印の白い鉢巻（11/5：緑をやめた。四3）。背旗は通常の寸法。
const MATSU = { ...LOAN_LOOK, flag: 'todo' };            // 松永の蔦（藤堂蔦の紋で代える）
// 陣幕は南にしか口がない。登城道・遊び手・組の出発地点を囲わぬよう、道の東へ置く。
const TSUTSUI_CAMP = { x: 26, z: 104 };
// 門内で西の櫓の足元を斜めに横切らず、奥まで抜けてから西へ折れる。
const ROAD = SITE_ROAD.flatMap((p) => p[0] === GATE.x && p[1] === GATE.z ? [p, [GATE.x, GATE.z - 12]] : [p[0] === -36 && p[1] >= -132 ? [-48, p[1]] : p]);
// 門脇の守りは柵の外から。空堀を横切らず、土橋から持ち場へ寄る。
// 櫓の脚元へ潜らず、門と櫓の間の土橋から打ち手を守る。
const TOWER_POST = { x: GATE.x + 8, z: GATE.z + 6 };
const SG_TS = { world: null };   // 身の回りの置き物で切岸を外すための今の世界
const TOWER_APPROACH = [[GATE.x, GATE.z + 6], [TOWER_POST.x, TOWER_POST.z]];
const CLIMB_END = ROAD.findIndex((q) => q[1] === GATE.z) - 1;
// 長い登りは出陣前に済ませ、門前へ続く最後の折り返しから始める。
// 尾根の戦いの後も、敵のいない九十九折りを何分も歩かせない。
const OPEN_I = CLIMB_END - 1;
const OPEN_PT = ROAD[OPEN_I];
// 最初の敵は同じ折り返しの十八歩先。谷の斜面から先手を待たせない（10/30：十二歩では斬り合いが画面の下に切れた）。
const OPEN_NEXT = ROAD[OPEN_I + 1];
const AMBUSH_T = 18 / Math.hypot(OPEN_NEXT[0] - OPEN_PT[0], OPEN_NEXT[1] - OPEN_PT[1]);
const AMBUSH_PT = [OPEN_PT[0] + (OPEN_NEXT[0] - OPEN_PT[0]) * AMBUSH_T, OPEN_PT[1] + (OPEN_NEXT[1] - OPEN_PT[1]) * AMBUSH_T];
const AMBUSH_APPROACH = [OPEN_NEXT, AMBUSH_PT];
const INNER_HALF = 3.2; // 城内は細い土道。切岸から離れた西の帯道を通る。
const ROAD_HALF = 6; // 馬が向きを変え、二列の兵とすれ違える平らな幅。

// 山上の城下町を作らず、既存の麓の里と朝護孫子寺に民を置く。
// 城と寺の関係は奈良県の城跡解説を参照。里・民・避難路の細かな位置は推定。
// https://www.pref.nara.lg.jp/ikasu-nara/naranoshiro/shigisanjo/index.html
// 山門から南へ下り、羽柴の囲みの南を回って細川の後備えの東へ出る。
// 麓では家並み・田を横切らず、東端の畦から南の里外れへ退く。
const PEOPLE_ROADS = [
  // 山門の外から整地し、寺の平場と下り道の間に急な山肌を残さない。
  [[46, 14], [46, 30], [46, 46], [70, 60], [104, 54], [132, 100], [136, 150], [136, 186], [136, 200], [136, 210], [136, 220], [136, 230], [136, 240], [136, 250], [136, 260], [136, 270]],
  [[104, 154], [120, 154], [136, 150]],
  // 待つ場所は東の道脇へ。枝道の末尾を既存の道に合わせ、高さも合流点から整える。
  // 再避難の畦も同じ十歩ごとの高さを受け取り、並ぶ道の境に段差を作らない。
  ...[200, 210, 220, 230, 240, 250, 260, 270].map((z) => [[144, z], [136, z]]),
  // 待ち場所を南へつなぎ、再避難で兵のいる本道へ戻らず里外れへ下れるようにする。
  // 田の東側の推定の畦道。終わりは既存の道へ合流させる。
  [[144, 200], [144, 210], [144, 220], [144, 230], [144, 240], [144, 250], [144, 260], [144, 270], [136, 270]],
  // 再避難の組も南への畦を塞がず、その東の道脇で待つ。合流点から高さを合わせる。
  ...[240, 250, 260, 270].map((z) => [[152, z], [144, z]]),
  // 再避難先にも南への抜け道を残す。西から兵や火が来ても、元の畦へ戻らず離れられる。
  // 既存の待ち場所を順に結び、最後の組からも六十歩先まで里外れの道を延ばす。
  // 各線の末尾は整地済みの合流点。家並みと田の東を通る推定の道で、史実の道筋とはしない。
  [[152, 240], [152, 250], [152, 260], [152, 270]],
  [[152, 330], [152, 310], [152, 290], [152, 270]],
  // 南への抜け道を待ち場所で塞がない。再避難の家族は、さらに東の枝道へ収める。
  // 合流点を末尾に置き、抜け道と同じ高さから整える。細かな位置は推定。
  ...[240, 250, 260, 270].map((z) => [[160, z], [152, z]]),
];
// 再避難も境内・参道・畦道の内側を使い、田や道の外の山腹へ逃がさない。
// 里外れの待ち場所より南にも道を残す。道の幅は描画と同じ半幅五歩。
function peopleGroundAllowed(x, z) {
  if (Math.abs(x - TEMPLE.x) < TEMPLE.r && Math.abs(z - TEMPLE.z) < TEMPLE.r) return true;
  for (const pts of PEOPLE_ROADS) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) <= 5) return true;
  }
  return false;
}
// 道脇の避難先にも、元の山肌へ戻す幅を残す。東端を途中で切ると民のすぐ脇に段差ができる。
const PEOPLE_GROUND_MARGIN = 9;
const PEOPLE_GROUND_BOUNDS = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
for (const pts of PEOPLE_ROADS) for (const [x, z] of pts) {
  PEOPLE_GROUND_BOUNDS.minX = Math.min(PEOPLE_GROUND_BOUNDS.minX, x - PEOPLE_GROUND_MARGIN);
  PEOPLE_GROUND_BOUNDS.maxX = Math.max(PEOPLE_GROUND_BOUNDS.maxX, x + PEOPLE_GROUND_MARGIN);
  PEOPLE_GROUND_BOUNDS.minZ = Math.min(PEOPLE_GROUND_BOUNDS.minZ, z - PEOPLE_GROUND_MARGIN);
  PEOPLE_GROUND_BOUNDS.maxZ = Math.max(PEOPLE_GROUND_BOUNDS.maxZ, z + PEOPLE_GROUND_MARGIN);
}
const peopleRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
// 後続が通る畦の中央で立ち止まらず、十歩ずつ離れた道脇へ退く。
// 組の最後尾も中央から二歩以上離れる長さを取り、親子の待つ間隔を保つ。
const peopleEscape = (pts, endZ) => peopleRoute([...pts.filter((p) => p[1] < endZ), [136, endZ], [144, endZ]]);
// 避難先に兵や火が迫ったら東の畦を南へ進み、さらに東の枝道で待つ。
// 南への抜け道（東百五十二歩）を渡り切り、その先に八歩の待ち場所を取る。
// 五人組の最後尾も抜け道の中央から二歩以上離し、後続の避難を塞がない。
// 畦の細かな位置は推定。危険・柵・勾配の確認は共通の逃走処理に任せる。
const peopleOnward = (z) => peopleRoute([[144, z], [144, z + 40], [152, z + 40], [160, z + 40]]);
const PEOPLE_BANDS = [
  // 堂の西側から山門の開口へ。北・南・東の木柵を横切らない。
  // 狭い山門では曲がり角まで進む。四歩手前で次の角を目指すと南の柵へ向かってしまう。
  // 境内で堂の外にいる組も見物として扱い、里と同じく兵四十歩・火二十二歩の外で待つ。
  // 堂内扱いでは初めの安全確認が省かれ、近い兵や火の脇に出たり、逃げ始めが遅れたりする。
  { x: TEMPLE.x - 6, z: TEMPLE.z, mode: 'watch', routeEnd: 'wait', routeReach: 0.7, kinds: ['monk', 'monk', 'woman', 'child'],
    route: peopleEscape([[49, 14], ...PEOPLE_ROADS[0]], 230), onwardRoute: peopleOnward(230) },
  // 寺の参道と里の外れで遠巻きに見る人。軍の本陣や城の番所には足さない。
  // 見物場所も最初の道の点に含める。次の遠い角までの直線を出発条件にせず、
  // 参道の端にいる親子もまず道の中央へ寄ってから下る。安全な待ち場所の探索もここから始める。
  { x: 104, z: 54, routeEnd: 'wait', routeReach: 0.7, kinds: ['monk', 'merchant', 'farmer', 'woman', 'child'],
    route: peopleEscape(PEOPLE_ROADS[0].slice(4), 220), onwardRoute: peopleOnward(220) },
  // 里でも角の直前まで進んでから曲がる。四歩手前で次へ移ると畦道の合流点を飛ばす。
  // 里の枝道も出発点から渡す。本道は合流点の次からつなぎ、同じ角を二度渡さない。
  { x: 104, z: 154, routeEnd: 'wait', routeReach: 0.7, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    route: peopleEscape([...PEOPLE_ROADS[1], ...PEOPLE_ROADS[0].slice(7)], 210), onwardRoute: peopleOnward(210) },
  // 里外れの組も出発点と終点を渡す。一点だけでは共通の間隔計算が働かず、親子や商人が重なる。
  { x: 136, z: 186, routeEnd: 'wait', routeReach: 0.7, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: peopleEscape(PEOPLE_ROADS[0].slice(7), 200), onwardRoute: peopleOnward(200) },
];
// 終点は地形の端ではなく里外れ。姿を消さず待ち、兵や火が迫れば共通の仕組みで再び逃げる。

// 実際の先手から合成の合図を出す。任務の文から推測する共通合図との二重打ちを防ぐ。
function siegeSignal(rt, kind) {
  if (kind === 'kakari' || kind === 'nobiki') (rt.cueAt || (rt.cueAt = {}))[kind] = rt.t;
  rt.army.playFar('sig_' + kind, rt.flags.tsuU.pos, 0.9);
}

// 門脇の守りは同じ地面で、歩いて届く時だけ。櫓の床や切岸の下は持ち場にしない。
// 印の到着と二秒の守りに同じ判定を使い、範囲の食い違いを防ぐ。
function towerPostReached(rt) {
  const p = rt.player.u.pos;
  return !rt.player.u.naka && Math.hypot(p.x - TOWER_POST.x, p.z - TOWER_POST.z) < 4.6
    && Math.abs(p.y - rt.world.heightAt(TOWER_POST.x, TOWER_POST.z)) < 1
    && guideClear(rt, p, TOWER_POST);
}

// 本人の道案内は、実際の一歩と同じ段差・下り・床を調べる。
// 道の印だけで急な段を通せると判断せず、横が急でも縦に歩ける坂は通す。
function guideClear(rt, from, to) {
  const W = rt.world, lim = W.def.moveLim || 176;
  if (Math.abs(to.x) > lim || Math.abs(to.z) > lim || rt.army.wallBetween(from, -1, to)) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
  let x = from.x, z = from.z, y = groundAt(W, x, z, from.y ?? rt.player.u.pos.y);
  for (let i = 1; i <= n; i++) {
    const nx = from.x + dx * i / n, nz = from.z + dz * i / n;
    const h = groundAt(W, nx, nz, y);
    if (h - y > 0.91 || y - h > W.def.maxWalkDrop || !rt.player.canStep(x, z, nx, nz, y)) return false;
    x = nx; z = nz; y = h;
  }
  return true;
}

// 櫓の脚や柵の端を挟んだ印へ直進させず、両側から歩いて届く近い曲がり角を示す。
// 道の順番は変えない。近い障害だけを調べ、入れ物と見つけた角を使い回す。
function guideAround(rt, p, goal) {
  const q = rt.flags.castleGuideBend, W = rt.world;
  q.goal.x = goal.x; q.goal.z = goal.z; q.goal.y = W.heightAt(goal.x, goal.z);
  if (guideClear(rt, p, q.goal)) { q.active = false; return false; }
  // 二つの角で壁を回る時は、最初の角に着いたら再探索を待たず、歩ける保存済みの次の角へ渡す。
  // 探索の二秒待ちで案内を消したり、着いた角を選び直して足元を指し続けない。
  if (q.active && q.twoTurns && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1
      && Math.hypot(p.x - q.point.x, p.z - q.point.z) <= 0.8
      && guideClear(rt, p, q.turn) && guideClear(rt, q.turn, q.goal)) {
    q.point.x = q.turn.x; q.point.y = q.turn.y; q.point.z = q.turn.z;
    q.twoTurns = false;
  }
  // 曲がり角の一歩手前でも、壁の向こうへ直進できるまでは同じ角を保つ。
  if (q.active && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1
      && guideClear(rt, p, q.point)
      && (q.twoTurns ? guideClear(rt, q.point, q.turn) && guideClear(rt, q.turn, q.goal) : guideClear(rt, q.point, q.goal))) {
    goal.x = q.point.x; goal.z = q.point.z; return true;
  }
  q.active = false;
  if (rt.t < q.next || Math.hypot(p.x - goal.x, p.z - goal.z) > 40) return false;
  q.next = rt.t + 2;
  q.twoTurns = false;
  const heading = Math.atan2(goal.x - p.x, goal.z - p.z), probe = q.probe;
  let best = Infinity;
  // 八歩幅の番所の壁際でも角へ回れるよう、十歩まで。二秒ごとの探索に限る。
  for (let r = 2; r <= 10; r += 2) for (let i = 0; i < 8; i++) {
    const a = heading + i * Math.PI / 4;
    probe.x = p.x + Math.sin(a) * r; probe.z = p.z + Math.cos(a) * r;
    const cost = r + Math.hypot(probe.x - goal.x, probe.z - goal.z);
    if (cost >= best) continue;
    probe.y = W.heightAt(probe.x, probe.z);
    if (!guideClear(rt, p, probe) || !guideClear(rt, probe, q.goal)) continue;
    best = cost; q.point.x = probe.x; q.point.y = probe.y; q.point.z = probe.z; q.active = true;
  }
  // 壁の反対側へは二つの角が要る。一つの角から印が見えなくても、壁際で案内を失わない。
  // 建物ごとの四隅だけを使い、隣り合う角の二通りを調べる。探索も二秒に一度だけ。
  if (!q.active) for (const corners of q.corners) {
    for (const c of corners) {
      c.near = Math.hypot(p.x - c.x, p.z - c.z) <= 12;
      c.from = c.near && guideClear(rt, p, c);
      c.to = Math.hypot(goal.x - c.x, goal.z - c.z) <= 16 && guideClear(rt, c, q.goal);
    }
    for (let i = 0; i < 4; i++) for (const offset of [1, 3]) {
      const a = corners[i], b = corners[(i + offset) % 4];
      if (!a.from || !b.to) continue;
      const cost = Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(a.x - b.x, a.z - b.z)
        + Math.hypot(b.x - goal.x, b.z - goal.z);
      if (cost >= best || !guideClear(rt, a, b)) continue;
      best = cost; q.point.x = a.x; q.point.y = a.y; q.point.z = a.z;
      q.turn.x = b.x; q.turn.y = b.y; q.turn.z = b.z;
      q.active = q.twoTurns = true;
    }
  }
  if (!q.active) return false;
  q.gx = goal.x; q.gz = goal.z;
  goal.x = q.point.x; goal.z = q.point.z;
  return true;
}

// 番所へ押し込まれた時は、外壁越しの道でなく戸口を順に通る。
// 戸口の内側にそろえてから踏み段の外へ。建物を出切るまで同じ出口を保つ。
function castleExitGuide(rt, goal) {
  const F = rt.flags, u = rt.player.u, p = u.pos, exit = F.castleExit;
  // 外の印へ戻した時、室内の階の高さを持ち越さない。
  goal.y = undefined;
  if (!exit.room && u.naka != null) {
    if (F.C.seat.naka.id + 1 === u.naka) exit.room = F.C.seat.naka;
    else for (const room of F.rooms) if (room.naka.id + 1 === u.naka) {
      exit.room = room.naka; break;
    }
    if (exit.room) {
      exit.through = false;
      // 入った時だけ用意し、上階からも実際の階段と間取りを通って戸口へ戻す。
      exit.guide = nakaGuide(exit.room, exit.room.doorIn);
    }
  }
  const I = exit.room;
  if (!I) return false;
  const dx = p.x - I.x, dz = p.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = (dx * I.s + dz * I.c) * I.door.side;
  // 出口の点を踏み越しても、戸口から地面へ出ていれば道案内へ戻す。
  // 壁の横や上階から外へ出た場合は、出口を通過した扱いにしない。
  const outsideDoor = exit.through && u.naka == null && lz > I.levels[0].d / 2
    && Math.abs(lx - I.door.lx) < I.door.w / 2 + 0.6
    && Math.abs(p.y - rt.world.heightAt(p.x, p.z)) < 0.8;
  if (outsideDoor || Math.hypot(p.x - I.doorOut.x, p.z - I.doorOut.z) < 0.65 && Math.abs(p.y - I.doorOut.y) < 0.8) {
    exit.room = null; return false;
  }
  if (!exit.through && Math.hypot(p.x - I.doorIn.x, p.z - I.doorIn.z) < 0.55 && Math.abs(p.y - I.doorIn.y) < 0.8) exit.through = true;
  if (exit.through) {
    goal.x = I.doorOut.x; goal.z = I.doorOut.z; goal.y = I.doorOut.y;
  } else {
    const q = exit.guide();
    if (!q) { exit.room = null; return false; }
    goal.x = q.x; goal.z = q.z; goal.y = q.y;
  }
  F.castleGuideArrived = false;
  return true;
}

// 退く先の支配と、そこまでの道を読む。調べる点は準備時の入れ物を使い回す。
function withdrawalOpen(rt, w) {
  if (rt.flags.SZ?.byId[w.to]?.owner === ZONE_STATE.FRIEND || !w.path.length) return false;
  const c = w.g.center(), a = w.probeA, b = w.probeB;
  let start = 0, best = Infinity;
  for (let i = 0; i < w.path.length; i++) {
    const p = w.path[i], d = Math.hypot(c.x - p[0], c.z - p[1]);
    if (d < best) { best = d; start = i; }
  }
  a.x = c.x; a.z = c.z; a.y = rt.world.heightAt(a.x, a.z);
  for (let i = start; i < w.path.length; i++) {
    const p = w.path[i], dx = p[0] - a.x, dz = p[1] - a.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 3));
    const ax = a.x, az = a.z;
    for (let k = 1; k <= n; k++) {
      b.x = ax + dx * k / n; b.z = az + dz * k / n; b.y = rt.world.heightAt(b.x, b.z);
      if (!rt.world.walkable(b.x, b.z) || rt.army.wallBetween(a, -1, b)) return false;
      for (const u of rt.army.units) if (u.alive && !u.isStruct && u.team !== w.g.team && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - b.x, u.pos.z - b.z) < 3 && Math.abs(u.pos.y - b.y) < 3) return false;
      a.x = b.x; a.y = b.y; a.z = b.z;
    }
  }
  w.start = start;
  return true;
}

// 麓から雄嶽まで約300m。道は分岐を含め最大勾配0.58の切り通しでつなぐ。
const LIFT = { x: 0, z: -242, tx: 0, tz: -60, w: 40, R: 150, rise: 250 };
function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 信貴山（北が高い）。kaito 10/3：比高約300m に近づける持ち上げ
  h += yamaLift(x, z, LIFT);
  h += 46 * gauss(x, z, 0, -110, 4200) + 10 * gauss(x, z, -60, -80, 2000) + 12 * gauss(x, z, 70, -120, 2400);
  // 南の雌嶽は雄嶽より低い山腹を持つ。峰を足しても道の勾配上限は共通の整地で保つ。
  h = Math.max(h, (LIFT.rise + 46 + 3 - 37) * gauss(x, z, MEDAKE.x, MEDAKE.z, 3600));
  // 生駒の山並み
  h += 30 * gauss(x, z, -200, -140, 10000);
  return h;
}
// 曲輪の段・土塁・切岸を、柵と同じ縄張りから読む。
// この攻め口だけ、門の先の柵の口も二列で抜けられる幅にする。
const ATTACK_PLAN = { ...SHIGISAN_PLAN,
  exactGapEdges: true, // 道と柵の実際の交点を使い、重なる口の間へ逆向きの板塀を残さない。
  continuousEdges: true, // 土の段は内外を同じ高さでつなぎ、縁に七歩の裂け目を作らない。
  terrainBanks: true, // 土塁は歩く地面に含める。別格子の薄い土の帯を重ね、切岸から浮かせない。
  sakamogiMaxRise: 1.1, // 逆茂木は緩い足場だけ。切岸をまたぐ長い伐り木にしない。
  lordSeat: { ...SHIGISAN_PLAN.lordSeat, floors: 2, b: 8, name: '山頂の天主' },
  paths: SHIGISAN_PLAN.paths.map((p) => p.id === 'ote' ? { ...p, pts: ROAD } : p),
  kuruwa: SHIGISAN_PLAN.kuruwa.map((k) => ({ ...k, ...(k.gapW ? { gapW: 9 } : {}) })),
  koguchi: SHIGISAN_PLAN.koguchi.map((g) => ({ ...g, w: g.id === 'gate' ? 11.4 : 7.4 })),
};
const TERRAIN_EDGE = 20; // 曲輪の床は保ち、外の山肌へ二十歩でつなぐ。切岸の長い壁状の面を和らげる。
let TERRAIN = heightOf(ATTACK_PLAN, base, TERRAIN_EDGE);
let SUMMIT_CUT = 0;
// 道と曲輪を下げた分は周りの尾根にも反映する。元の山頂だけ残すと城が深い穴になる。
function groundCut(x, z) { return SUMMIT_CUT * yamaLift(x, z, LIFT) / LIFT.rise; }
// 堀の形は読み込み時に一度だけ作り、地形と城の区域で同じ寸法を使う。
const HORI_HEIGHTS = SHIGISAN_PLAN.hori.map((h) => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
const FLAT_PADS = [[GATE.x, GATE.z - 12, 15], [TEMPLE.x, TEMPLE.z, 14]];
// 標高読みの郭群の外に、左右の枝尾根へ小さな段を128連ねる。
// 調査の「120を超える曲輪」を示す推定の遠景。実兵・建物・当たりは増やさない。
// 一点につき段を一つだけ読む。全曲輪の多角形を毎回調べない。
const SIDE_TERRACES = Array.from({ length: 8 }, (_, row) => {
  const z = YASHIKI.z + row * 24, shift = Math.sin(row * 0.8) * 5;
  return { z, shift, levels: [-1, 1].map((side) => Array.from({ length: 8 }, (_, col) => base(side * (164 + col * 20 + shift), z) + 1)) };
});
function sideTerraceHeight(x, z, h) {
  const row = Math.round((z - YASHIKI.z) / 24);
  if (row < 0 || row >= SIDE_TERRACES.length) return h;
  const q = SIDE_TERRACES[row], col = Math.round((Math.abs(x) - 164 - q.shift) / 20);
  if (col < 0 || col >= 8) return h;
  const dx = Math.abs(Math.abs(x) - (164 + col * 20 + q.shift)), dz = Math.abs(z - q.z);
  const blend = Math.max(0, Math.min(1, (10 - dx) / 3, (12 - dz) / 3));
  const cx = (x < 0 ? -1 : 1) * (164 + col * 20 + q.shift);
  return h + (q.levels[x < 0 ? 0 : 1][col] - groundCut(cx, q.z) - h) * blend;
}
const DEM_RELIEF = { xy: 1, cx: 0, cz: 0, inner: 420, fade: 40, scale: 0.16, az: 0.8 };
const DEM_DETAIL = { xy: 1, ox: TOP.x + 15, oz: TOP.z, cz: -10, win: 30, scale: 0.5 };
let DEM_KEEP = null;
function demMask(x, z) {
  if (!DEM_KEEP) {
    const boxes = SHIGISAN_PLAN.kuruwa.filter((k) => k.poly).map((k) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [px, pz] of k.poly) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
      return [x0, x1, z0, z1];
    });
    const segs = [];
    for (const line of [SITE_ROAD, ROAD, ...ROUTES.map((r) => r.pts), ...PEOPLE_ROADS]) for (let i = 1; i < line.length; i++) segs.push([line[i - 1], line[i]]);
    DEM_KEEP = { boxes, segs, spots: [[TSUTSUI_CAMP.x, TSUTSUI_CAMP.z, 45], [TEMPLE.x, TEMPLE.z, 30], [GATE.x, GATE.z, 40], [MEDAKE.x, MEDAKE.z, 45], ...CAMP_CLEARINGS.map((c) => [c.x, c.z, Math.max(c.hw, c.hd)])] };
  }
  // 尾根の上の攻め口（主郭から屋敷まで、東西60歩）は手で作った段と道のまま。兵が回り込む足場を変えない。
  let d = z < 10 && z > -420 ? Math.max(0, Math.abs(x) - 60) : Infinity;
  for (const [x0, x1, z0, z1] of DEM_KEEP.boxes) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  for (const [cx, cz, r] of DEM_KEEP.spots) d = Math.min(d, Math.max(0, Math.hypot(x - cx, z - cz) - r));
  if (d < 10) return 0;
  for (const [[ax, az], [bx, bz]] of DEM_KEEP.segs) {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t) - 8);
    if (d < 10) return 0;
  }
  return Math.min(1, (d - 10) / 14);
}
function heightRaw(x, z) {
  let h = base(x, z) - groundCut(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  h = TERRAIN(x, z, h);
  // 門内の平場と、戦いの外の寺の境内も水平にする。
  for (const [cx, cz, r] of FLAT_PADS) {
    const t = Math.max(0, Math.min(1, (r + 3 - Math.hypot(x - cx, z - cz)) / 3));
    h += (roadProfile(cx, cz) - h) * t;
  }
  // 国土地理院の標高：城の外の遠い山肌にだけ、実際の起伏を足す（座標1は約1m。山肌も横を縮めない）
  if (sgDem) h += demRelief(sgDem, x, z, DEM_RELIEF);
  // 実測の尾根と谷の凹凸（5m 格子）を、曲輪・道・陣の外の山肌に足す。雄嶽の頂（実測の格子で西15m・北10m）を主郭に合わせる。
  // 曲輪の床・道・建物・陣の高さは変えない（当たりと持ち場はそのまま）。
  if (sgDem) { const k = demMask(x, z); if (k > 0) h += k * demDetail(sgDem, x, z, DEM_DETAIL); }
  return sideTerraceHeight(x, z, h);
}

// 建物と戸口を共通室内に渡す。板壁と板葺きの簡素な建物で推定復元する。
const BUILDINGS = [
  { x: TOP.x + 10, z: TOP.z + 2, w: 7, d: 5, name: '本丸の番所', kind: 'bansho' },
  { x: -21, z: GATE.z - 5, w: 8, d: 4, name: '門の長屋', kind: 'nagaya' },
  { x: 16, z: GATE.z - 20, w: 6, d: 4, name: '門の兵糧蔵', kind: 'kura' },
  { x: RIDGE1.x + 9, z: RIDGE1.z, w: 4, d: 3, name: '北尾根の番所', kind: 'bansho' },
  { x: RIDGE2.x + 9, z: RIDGE2.z - 2, w: 4, d: 3, name: '上の曲輪の詰所', kind: 'bansho' },
  { x: YASHIKI.x, z: YASHIKI.z - 3, w: 11, d: 7, name: '松永屋敷の主殿', kind: 'goten' },
  { x: YASHIKI.x + 10, z: YASHIKI.z - 7, w: 5, d: 3.5, name: '屋敷の長屋', kind: 'nagaya' },
  { x: YASHIKI.x + 11, z: YASHIKI.z + 5, w: 4, d: 3, name: '屋敷の蔵', kind: 'kura' },
  { x: TEMPLE.x, z: TEMPLE.z, w: 9, d: 7, name: '朝護孫子寺の堂', kind: 'hondo' },
];
const ROOM_PATHS = [
  [[0, -98], [10, -98], [10, -104]], [[0, -66], [0, -68], [-21, -68], [-21, -67.5]],
  [[0, -66], [0, -72], [24, -72], [24, -80], [16, -80], [16, -82.5]],
  [[RIDGE1.x, RIDGE1.z + 4], [RIDGE1.x + 9, RIDGE1.z + 4], [RIDGE1.x + 9, RIDGE1.z + 3]],
  [[RIDGE2.x, RIDGE2.z + 2], [RIDGE2.x + 9, RIDGE2.z + 2], [RIDGE2.x + 9, RIDGE2.z + 1]],
  [[YASHIKI.x, YASHIKI.z + 7], [YASHIKI.x, YASHIKI.z + 2]],
  [[YASHIKI.x + 15, YASHIKI.z], [YASHIKI.x + 15, YASHIKI.z - 3], [YASHIKI.x + 10, YASHIKI.z - 3]],
  [[YASHIKI.x + 15, YASHIKI.z], [YASHIKI.x + 15, YASHIKI.z + 9], [YASHIKI.x + 11, YASHIKI.z + 9]],
  [[TEMPLE.x - TEMPLE.r, TEMPLE.z], [TEMPLE.x - 6, TEMPLE.z + 6], [TEMPLE.x, TEMPLE.z + 6]],
];
const WALK_LINES = [ROAD, TOWER_APPROACH, AMBUSH_APPROACH, ...ROUTES.slice(1).map((r) => r.pts), ...ROOM_PATHS];
// 民の道は城の道の整地計算から分ける。城の曲輪・戦う兵の足場を下げない。
let PEOPLE_LEVELS = null;
function peopleHeight(x, z, h) {
  const bounds = PEOPLE_GROUND_BOUNDS;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return h;
  if (!PEOPLE_LEVELS) {
    const nodes = new Map();
    PEOPLE_LEVELS = PEOPLE_ROADS.map((pts, line) => {
    const levels = pts.map(([px, pz]) => heightWithoutPeople(px, pz));
    // 既存の道との合流点は保ち、里へ下る道だけ勾配を抑える。
    for (let i = 1; !line && i < pts.length; i++) {
      const rise = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 0.5;
      levels[i] = Math.max(levels[i - 1] - rise, Math.min(levels[i - 1], levels[i]));
    }
    // 里の枝道は、先に作った下り道の合流点から逆向きに整える。
    if (line) {
      levels[pts.length - 1] = nodes.get(pts[pts.length - 1].join(','));
      // 八歩の待ち場所は合流点と同じ高さ。別々の山肌に合わせると、
      // 半幅五歩の並行する畦が重なる境に段差ができ、親子が渡れなくなる。
      const refugeBranch = pts.length === 2 && pts[0][1] === pts[1][1];
      for (let i = pts.length - 2; i >= 0; i--) {
        const rise = Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]) * 0.5;
        // 待ち場所をつなぐ道も、先に整えた枝道の高さへ合わせて段差を作らない。
        levels[i] = nodes.get(pts[i].join(',')) ?? (refugeBranch ? levels[i + 1]
          : Math.max(levels[i + 1] - rise, Math.min(levels[i + 1] + rise, levels[i])));
      }
    }
    for (let i = 0; i < pts.length; i++) nodes.set(pts[i].join(','), levels[i]);
    return pts.slice(1).map((b, i) => ({ ax: pts[i][0], az: pts[i][1], dx: b[0] - pts[i][0], dz: b[1] - pts[i][1], h0: levels[i], h1: levels[i + 1] }));
    });
  }
  let best = Infinity, floor = h;
  for (const line of PEOPLE_LEVELS) for (const q of line) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / (q.dx * q.dx + q.dz * q.dz)));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; floor = q.h0 + (q.h1 - q.h0) * t; }
  }
  const t = Math.max(0, Math.min(1, (PEOPLE_GROUND_MARGIN - best) / 4));
  // 山門と南への曲がり角は同じ平場へ。北端だけなだらかに元の地面へ戻す。
  const entry = Math.max(0, Math.min(1, (z - 5) / 4));
  return h + (floor - h) * t * t * (3 - 2 * t) * entry * entry * (3 - 2 * entry);
}
// 道の縦の高さは準備時だけ計算。曲輪間は坂でつなぎ、段の縁の急変を避ける。
const ROAD_LEVELS = SHIGISAN_PLAN.kuruwa.filter((k) => k.id !== 'medake').map((k) => {
  const x = k.poly.reduce((n, p) => n + p[0], 0) / k.poly.length, z = k.poly.reduce((n, p) => n + p[1], 0) / k.poly.length;
  return { id: k.id, poly: k.poly, offset: k.level(base) - SHIGISAN_PLAN.kuruwa.find((q) => q.id === 'shu').level(base), x, z, r: Math.max(...k.poly.map((p) => Math.hypot(p[0] - x, p[1] - z))), h: SHIGISAN_PLAN.kuruwa.find((q) => q.id === k.id).level(base) };
});
function roadLevel(x, z) {
  let best = Infinity, h = base(x, z);
  for (const q of ROAD_LEVELS) if (inPoly(q.poly, x, z)) return q.h;
  for (const q of ROAD_LEVELS) {
    const d = Math.hypot(x - q.x, z - q.z), score = d / q.r;
    if (d < Math.min(q.r, 20) + 3 && score < best) { best = score; h = q.h; }
  }
  if (best === Infinity && Math.hypot(x - GATE.x, z - GATE.z + 12) < 22) h = base(GATE.x, GATE.z - 12);
  if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 17) h = base(TEMPLE.x, TEMPLE.z);
  return h;
}
function makeRoadSegments() {
  const lines = WALK_LINES.flatMap((pts) => pts.slice(1).map((b, i) => {
    const a = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    return { ax: a[0], az: a[1], dx, dz, cuts: [0, 1] };
  }));
  // 分岐・交差点にも同じ高さを与え、別の道へ移る所に段差を作らない。
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j], den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-8) continue;
    const x = b.ax - a.ax, z = b.az - a.az;
    const t = (x * b.dz - z * b.dx) / den, u = (x * a.dz - z * a.dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
  }
  // 山腹で道の幅が重なる所にも高さの節を置く。交差しない近い道も谷底と尾根に分けない。
  for (const a of lines) for (const b of lines) {
    if (a === b) continue;
    for (const end of [0, 1]) {
      const x = a.ax + a.dx * end, z = a.az + a.dz * end;
      const t = Math.max(0, Math.min(1, ((x - b.ax) * b.dx + (z - b.az) * b.dz) / (b.dx * b.dx + b.dz * b.dz || 1)));
      if (Math.hypot(x - b.ax - b.dx * t, z - b.az - b.dz * t) < ROAD_HALF * 2) b.cuts.push(t);
    }
  }
  const segments = lines.flatMap((q) => {
    const cuts = [...new Set(q.cuts)].sort((a, b) => a - b);
    return cuts.slice(1).flatMap((t, i) => {
      const t0 = cuts[i], ax = q.ax + q.dx * t0, az = q.az + q.dz * t0;
      const dx = q.dx * (t - t0), dz = q.dz * (t - t0), l2 = dx * dx + dz * dz;
      return l2 < 1e-8 ? [] : [{ ax, az, dx, dz, l2, half: az + dz / 2 < GATE.z - 10 ? INNER_HALF : ROAD_HALF, h0: roadLevel(ax, az), h1: roadLevel(ax + dx, az + dz) }];
    });
  });
  const nodes = new Map();
  const node = (x, z, h) => {
    const key = x.toFixed(5) + ',' + z.toFixed(5);
    if (!nodes.has(key)) nodes.set(key, { x, z, h });
    return nodes.get(key);
  };
  for (const q of segments) { q.a = node(q.ax, q.az, q.h0); q.b = node(q.ax + q.dx, q.az + q.dz, q.h1); }
  const nearby = [], points = [...nodes.values()];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i], b = points[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < ROAD_HALF * 2) nearby.push({ a, b, rise: d * (a.z < GATE.z - 10 && b.z < GATE.z - 10 ? 0.14 : 0.2) });
  }
  const relax = () => {
    // 道の切り通しを造り、どの分岐も同じ床・勾配上限にそろえる。毎コマは行わない。
    for (let pass = 0; pass < nodes.size; pass++) {
      let changed = false;
      for (const q of segments) {
        // 城内の折り返しは描画格子の補間でも歩行上限を越えない余裕を残す。
        const rise = Math.sqrt(q.l2) * (q.half === INNER_HALF ? 0.38 : 0.58);
        if (q.a.h > q.b.h + rise + 1e-6) { q.a.h = q.b.h + rise; changed = true; }
        if (q.b.h > q.a.h + rise + 1e-6) { q.b.h = q.a.h + rise; changed = true; }
      }
      for (const q of nearby) {
        if (q.a.h > q.b.h + q.rise + 1e-6) { q.a.h = q.b.h + q.rise; changed = true; }
        if (q.b.h > q.a.h + q.rise + 1e-6) { q.b.h = q.a.h + q.rise; changed = true; }
      }
      if (!changed) break;
    }
  };
  relax();
  // 登城道の勾配から共通の基準高だけを下げ、測った平場同士の高低差は保つ。
  let summit = Infinity;
  for (const p of points) {
    p.pad = ROAD_LEVELS.find((q) => inPoly(q.poly, p.x, p.z));
    if (p.pad) summit = Math.min(summit, p.h - p.pad.offset);
  }
  for (const q of ROAD_LEVELS) q.h = summit + q.offset;
  for (const p of points) if (p.pad) p.h = p.pad.h;
  relax();
  for (const q of segments) { q.h0 = q.a.h; q.h1 = q.b.h; delete q.a; delete q.b; }
  return segments;
}
let ROAD_SEGMENTS = null;
// 切り通しで下がった道と曲輪の床をそろえる。元の床のままだと五十歩以上の崖が道の脇に残る。
function prepareRoadGround() {
  PEOPLE_LEVELS = null;
  // 標高素材が届いて再計算する時も、前回下げた床を出発点にしない。
  for (const q of ROAD_LEVELS) q.h = SHIGISAN_PLAN.kuruwa.find((k) => k.id === q.id).level(base);
  ROAD_SEGMENTS = makeRoadSegments();
  const summit = ROAD_LEVELS.find((q) => q.id === 'shu').h;
  SUMMIT_CUT = Math.max(0, base(TOP.x, TOP.z) + 3 - summit);
  for (const k of ATTACK_PLAN.kuruwa) {
    // 雌嶽も同じ基準高へ。雄嶽より三十七歩低い関係を保つ。
    if (k.id === 'medake') { k.level = summit - 37; continue; }
    const pad = ROAD_LEVELS.find((q) => q.id === k.id);
    if (!pad) continue;
    k.level = pad.h;
  }
  TERRAIN = heightOf(ATTACK_PLAN, base, TERRAIN_EDGE);
}
function roadProfile(x, z) {
  let best = Infinity, h = 0, total = 0, weight = 0;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t), floor = q.h0 + (q.h1 - q.h0) * t;
    if (d < best) { best = d; h = floor; }
    // 並走する別の高さの道で、中心線まで波打たせない。交点は同じ高さでなじむ。
    // 山肌へ戻す十五歩の範囲まで同じ重みを残す。四歩で打ち切ると、
    // まだ道の高さを混ぜる場所で最寄りの別の道へ切り替わり、壁や尖った峰になる。
    if (d < q.half + 15) { const w = Math.pow(1 - d / (q.half + 15), 2) / (d * d + 0.04); total += floor * w; weight += w; }
  }
  return weight > 0 ? total / weight : h;
}
function roadHeight(x, z) {
  if (!ROAD_SEGMENTS) prepareRoadGround();
  let blend = 0, shoulder = Infinity, foot = -Infinity;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    // 幅の違う道の境で、最寄りの一本が切り替わっても山肌の高さを跳ねさせない。
    blend = Math.max(blend, Math.max(0, Math.min(1, (q.half + 15 - d) / 12)));
    // 切り通しの脇も道から続く土の斜面にする。点ごとの最小値なので途中で崖へ跳ねない。
    const floor = q.h0 + (q.h1 - q.h0) * t;
    shoulder = Math.min(shoulder, floor + Math.max(0, d - q.half) * 0.85);
    // 盛った道の下にも山腹をつなぐ。削る側だけを制限すると、
    // 元の谷底へ十二歩で百歩落ちる薄い尾根や、尖った土の壁が残る。
    foot = Math.max(foot, floor - Math.max(0, d - q.half) * 0.85);
  }
  // 合流する道は同じ高さへなじませ、脇だけ土の斜面へ戻す。
  const f = blend * blend * (3 - 2 * blend);
  return Math.max(foot, Math.min(heightRaw(x, z), shoulder)) * (1 - f) + roadProfile(x, z) * f;
}
let ROOM_LEVELS = null;
let GATE_LEVELS = null;
function gateGround(h, x, z) {
  // 門の両側と物見櫓の足元を、登城道と同じ坂の平場にする。
  // 道だけを深く切ると、二歩先の守兵や柵の根元と十数メートル離れてしまう。
  // 西の帰り道（x=-30）まで門の高さで上書きすると、本丸へ戻る坂を塞ぐ。
  let gateBlend = Math.max(0, Math.min(1, (26 - Math.abs(x - GATE.x)) / 6,
    // 最後の折り返しへ広げると、道を横切る急斜面になる。門脇の土橋までに限る。
    (z - (GATE.z - 12)) / 6, ((GATE.z + 10) - z) / 6));
  if (gateBlend > 0) {
    // 門脇の整地で最後の折り返しを再び削らない。道幅の内側は計算済みの
    // 坂を保ち、外へ二歩で門脇の平場になじませる。足場は準備時だけ計算する。
    for (const q of ROAD_SEGMENTS) {
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
      gateBlend = Math.min(gateBlend, Math.max(0, Math.min(1, (d - q.half) / 2)));
    }
    if (gateBlend === 0) return h;
    if (!GATE_LEVELS) GATE_LEVELS = [roadHeight(GATE.x, GATE.z - 6), roadHeight(GATE.x, GATE.z + 6)];
    const t = (z - (GATE.z - 6)) / 12;
    const floor = GATE_LEVELS[0] + (GATE_LEVELS[1] - GATE_LEVELS[0]) * t;
    const k = gateBlend * gateBlend * (3 - 2 * gateBlend);
    h += (floor - h) * k;
  }
  return h;
}
function heightWithoutPeople(x, z) {
  let h = gateGround(roadHeight(x, z), x, z);
  if (!ROOM_LEVELS) ROOM_LEVELS = BUILDINGS.map((q) => {
    const z = q.z + q.d / 2 + 1.5;
    return gateGround(roadHeight(q.x, z), q.x, z);
  });
  for (let i = 0; i < BUILDINGS.length; i++) {
    const q = BUILDINGS[i];
    // 床下だけをならす。戸口の外は道の高さを保ち、共通室内の踏み段で床へつなぐ。
    if (z > q.z + q.d / 2 + 0.2) continue;
    const dx = Math.abs(x - q.x) - q.w / 2 - 0.2;
    const dz = z < q.z ? q.z - z - q.d / 2 - 0.2 : z - q.z - q.d / 2 - 1.5;
    // 戸口の前で整地を突然打ち切らず、最後の一歩で元の道へつなぐ。
    const front = Math.max(0, Math.min(1, (q.z + q.d / 2 + 0.2 - z) / 1.2));
    const t = Math.max(0, Math.min(1, 1 - Math.max(dx, dz) / 1.2)) * front;
    if (t > 0) h += (ROOM_LEVELS[i] - h) * t;
  }
  return h;
}
// 11/2 史料（docs/battle_refs/shigisan.md）：城の頂は雄岳（主郭・437m）で、南西の雌岳はそれより低い（約400m）。
// 西の道の高さに支えられ、雌岳の辺りが主郭より五十歩ほど高く残っていた。門の窪地と北の尾根は触らず、
// 南西の山肌だけを、主郭から下る坂と、主郭より三十余歩低い雌岳の頂から下る坂の高い方まで下げる（二つの峰と鞍部）。
const SHU_LEVEL = ROAD_LEVELS.find((q) => q.id === 'shu');
function sstep01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function medakeCap(x, z, h) {
  const d = Math.hypot(x - TOP.x, z - TOP.z);
  // 雌岳へ下げる境を五十歩でつなぐ。二十五歩では登城道の西に土の壁が戻る。
  const w = sstep01((-25 - x) / 50) * sstep01((z + 100) / 25) * (1 - sstep01((d - 200) / 60));
  if (w <= 0) return h;
  const dm = Math.hypot(x - MEDAKE.x, z - MEDAKE.z);
  const cap = Math.max(SHU_LEVEL.h + 12 - 0.6 * Math.max(0, d - 60), SHU_LEVEL.h - 34 - 0.6 * Math.max(0, dm - 45));
  return h > cap ? h + (cap - h) * w : h;
}
function height(x, z) { return medakeCap(x, z, peopleHeight(x, z, heightWithoutPeople(x, z))); }

// 材質・基本形は全棟で共有。外壁の戸口と共通室内の当たりを同じ幅にする。
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOM_MAT = new THREE.MeshLambertMaterial({ color: 0x594735, map: woodTex() });
// この城の板壁と板葺きは褪せた灰褐色。木目を重ねても夜に黒くつぶれない色にする。
// 雨に褪せた屋根・乾いた壁・地際の黒ずみを頂点色で分ける。
const ROOM_WORN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() });
// 信貴山の木戸だけ、反り・箱棟・懸魚を付けない直線の板葺きにする。
// 柱と通り幅は共通部品を使い、館の表門は控柱まで屋根を掛ける推定復元。
function boardGate(W, x, z, w, rot = 0, house = false) {
  const high = true;
  const gate = kabukimon(W, x, z, w, rot, high ? { doors: false, roof: false, yakui: house } : { doors: false });
  // 木戸には室内番号がない。梁の下や柱際の視点も、この門だけの透かしに含める。
  gate.userData.sgView = { gate: true, x, z, c: Math.cos(rot), s: Math.sin(rot),
    levels: [{ w: w + 1.6, d: house ? 6 : 3.5, y: W.heightAt(x, z), h: 5 }] };
  gate.userData.noMerge = true;
  if (!high) return gate;
  const parts = [], details = [], half = house ? 2.1 : 1.35, pitch = house ? .38 : .32, offset = house ? -.8 : 0, eave = 3.65;
  let detail = false;
  const box = (px, py, pz, bw, bh, bd, tilt = 0, tone = 0x887b67) => {
    const g = ROOM_BOX.clone().scale(bw, bh, bd), color = new THREE.Color(tone);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateX(tilt); g.translate(px, py, pz); (detail ? details : parts).push(g);
  };
  for (const side of [-1, 1]) {
    const cy = eave + half * Math.tan(pitch) / 2;
    box(0, cy, offset + side * half / 2, w + 1.4, .1, half / Math.cos(pitch), side * pitch, 0x969183);
    // 棟から軒へ流れる古板と差し替え板。細部は近くの木戸だけに残す。
    detail = true;
    const count = Math.ceil((w + 1.4) / .55), step = (w + 1.4) / count;
    for (let i = 0; i < count; i++) box(-(w + 1.4) / 2 + (i + .5) * step,
      cy + .065 + i % 3 * .008, offset + side * half / 2,
      step - .012, .035, half / Math.cos(pitch), side * pitch,
      (i + (side > 0 ? 2 : 0)) % 7 === 0 ? 0x8a7358 : i % 3 === 0 ? 0x62665a : 0x7c7768);
    detail = false;
    // 葺き段と横の押さえ木は少数の長い板で表す。
    for (const t of [.28, .66, 1]) box(0, eave + half * (1 - t) * Math.tan(pitch) + .08,
      offset + side * half * t, w + 1.5, .07, .1);
  }
  box(0, eave + half * Math.tan(pitch) + .09, offset, w + 1.6, .12, .24);
  const roof = new THREE.Mesh(mergeGeometries(parts), ROOM_WORN_MAT);
  for (const g of parts) g.dispose();
  roof.castShadow = roof.receiveShadow = true; roof.userData.camBlock = true; gate.add(roof);
  gate.add(gateRoofFrame(w, { eave, half, rise: half * Math.tan(pitch), offset }));
  const lod = new THREE.LOD(), boards = new THREE.Mesh(mergeGeometries(details), ROOM_WORN_MAT);
  boards.receiveShadow = true; boards.userData.camNear = true;
  lod.addLevel(boards, 0); lod.addLevel(new THREE.Group(), 65); gate.add(lod);
  for (const g of details) g.dispose();
  return gate;
}
// 家臣の小屋を曲輪ごとの屋敷に見せる細い木柵。正面中央の六歩は開ける。
// 遠景は小屋と幟を残し、細い格子は省く。当たりや守兵は足さない。
const FENCE_POLE = new THREE.CylinderGeometry(.5, .6, 1, 5);
function branchFence(rt, x, z) {
  const parts = [], W = rt.world, y = W.heightAt(x, z);
  const box = (px, py, pz, w, h, d, rot = 0, pole = false, tone = 0x625d4e) => {
    const g = (pole ? FENCE_POLE : ROOM_BOX).clone().scale(w, h, d);
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), color = new THREE.Color(tone);
    const ground = W.heightAt(x + px, z + pz) - y;
    // 地際は湿った暗色、上は日に褪せた灰褐色。共通の木材は染め直さない。
    for (let i = 0; i < p.count; i++) {
      const f = 1 - Math.max(0, 1 - (py + p.getY(i) - ground) / .55) * .28;
      colors[i * 3] = color.r * f; colors[i * 3 + 1] = color.g * f; colors[i * 3 + 2] = color.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateY(rot); g.translate(px, py, pz); parts.push(g);
  };
  for (const [ax, az, bx, bz] of [[-11, -5.5, 11, -5.5], [-11, -5.5, -11, 5], [11, -5.5, 11, 5], [-11, 5, -3, 5], [3, 5, 11, 5]]) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len / .55);
    for (let i = 0; i <= n; i++) {
      const px = ax + dx * i / n, pz = az + dz * i / n, ground = W.heightAt(x + px, z + pz) - y;
      const width = .09 + i % 3 * .012;
      box(px, ground + .68, pz, width, 1.46 + (i % 5) * .035, width, i * .7, true,
        i % 7 === 0 ? 0x82735b : i % 3 === 0 ? 0x555b4c : 0x696657);
      // 要所の支柱に二段の縄掛け。輪を細分せず、角を回す短い帯で示す。
      if (i % 4 === 0) for (const h of [.4, 1.15]) box(px, ground + h, pz, .16, .065, .17, 0, false, 0x8c7d61);
    }
    // 短い横木を地面に沿わせ、段の縁で宙に浮く一本の材にしない。
    for (let i = 0; i < Math.ceil(len / 2); i++) {
      const count = Math.ceil(len / 2), t = (i + .5) / count, px = ax + dx * t, pz = az + dz * t;
      const ground = W.heightAt(x + px, z + pz) - y;
      for (const h of [.4, 1.15]) box(px, ground + h, pz, len / count + .08, .08, .1, Math.atan2(-dz, dx));
    }
  }
  const near = new THREE.Mesh(mergeGeometries(parts), ROOM_WORN_MAT), lod = new THREE.LOD();
  for (const g of parts) g.dispose();
  near.receiveShadow = true; lod.position.set(x, y, z);
  lod.addLevel(near, 0); lod.addLevel(new THREE.Group(), 110); rt.scene.add(lod);
}
// 道脇の自然石は灰色の石肌を使う。
const STEP_MAT = new THREE.MeshLambertMaterial({ color: 0x7a7266, map: stoneTex() });
const ROOF_STONE = new THREE.IcosahedronGeometry(1, 0);
// 石段の踏面と石積みの側面は、他の城の石垣の目地・濃淡を使い回す。
// 共通材質の色は変えず、この夜の石だけ土に近い暗い灰茶にする。
let STAIR_MAT = null;
function stairMaterial() {
  if (STAIR_MAT) return STAIR_MAT;
  STAIR_MAT = castleStoneMat('warishi').clone();
  STAIR_MAT.vertexColors = false;
  STAIR_MAT.color.setHex(0x625d51);
  // 各段の実寸で目地を貼る。高い側面も絵を引き伸ばさず、段ごとに貼る位置をずらす。
  STAIR_MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 sgSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 sgFace = abs(normal.x) > 0.5 ? sgSize.zy : (abs(normal.y) > 0.5 ? sgSize.xz : sgSize.xy);
        vec2 sgUV = uv * sgFace / 2.2 + instanceMatrix[3].xz / 2.2;
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(sgUV, 1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(sgUV, 1.0)).xy;
        #endif
      #endif`);
  };
  STAIR_MAT.customProgramCacheKey = () => '信貴山の石段';
  return STAIR_MAT;
}
// 基本形は一つ。目地の大きさは段の実寸から材質側でそろえる。
const STAIR_BOX = ROOM_BOX.clone();
// 岩は崩れた石垣ではなく山肌の自然石。道の合流・戸口・曲輪の戦う平場には置かない。
function stoneSpace(x, z, flat = false) {
  // 急な切岸へ小石を刺すと、底の黒い面だけが土から突き出す。
  // 道の整地は変えず、露頭を置く足場だけ準備時に選ぶ。
  if (flat) {
    const h = height(x, z);
    if (Math.max(Math.abs(height(x + 1, z) - h), Math.abs(height(x - 1, z) - h),
      Math.abs(height(x, z + 1) - h), Math.abs(height(x, z - 1) - h)) > 0.7) return false;
  }
  if (ROAD_LEVELS.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 3)) return false;
  if (BUILDINGS.some((q) => Math.abs(x - q.x) < q.w / 2 + 3 && Math.abs(z - q.z) < q.d / 2 + 3)) return false;
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 6) return false;
  for (const line of WALK_LINES) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < ROAD_HALF + 2) return false;
  }
  return true;
}
// 平蜘蛛の釜と天守が爆ぜる（のちの伝えを絵にする）：望楼の上の階に火の玉・閃き・黒煙・飛び散る板と瓦。
// 形と材質は一度だけ作り、破片は一つの InstancedMesh で動かす（毎コマ new しない）。
const KEEP_AT = { x: TOP.x - 2, z: TOP.z - 8, up: 5.3 };
let BLAST_KIT = null;
function blastKit() {
  if (BLAST_KIT) return BLAST_KIT;
  // 縁のぼけた丸をキャンバスに一度だけ描き、火の玉と煙の板に使い回す
  const soft = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const glow = soft([[0, 'rgba(255,255,225,1)'], [0.15, 'rgba(255,235,145,0.9)'], [0.38, 'rgba(255,165,55,0.5)'], [0.65, 'rgba(255,130,35,0.12)'], [0.88, 'rgba(255,130,35,0)'], [1, 'rgba(255,130,35,0)']]);
  const puff = soft([[0, 'rgba(40,34,30,0.95)'], [0.55, 'rgba(32,28,25,0.6)'], [1, 'rgba(25,22,20,0)']]);
  const add = { map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
  BLAST_KIT = {
    fireMat: new THREE.SpriteMaterial({ color: 0xffffff, opacity: 0.7, ...add }),
    coreMat: new THREE.SpriteMaterial({ color: 0xffffff, opacity: 1, ...add }),
    smokeMat: new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    chip: new THREE.BoxGeometry(1, 1, 1),
    chipMat: new THREE.MeshLambertMaterial({ color: 0x3a2a1c }),
    emberMat: new THREE.MeshBasicMaterial({ color: 0xff9a40, fog: false }),
  };
  return BLAST_KIT;
}
function keepBlast(rt) {
  const F = rt.flags, W = rt.world, K = blastKit();
  if (F.blast) return;
  const x = KEEP_AT.x, z = KEEP_AT.z, y = W.heightAt(x, z) + KEEP_AT.up;
  const root = new THREE.Group();
  // 上の階の幅（3.8）ほどの炎を、小さな玉五つで作る。ずれと膨らみで丸い板の輪郭を残さない。
  const flames = [], core = new THREE.Sprite(K.coreMat.clone());
  const lobes = [[0, 0.2, 0, 3], [-0.65, 0.55, 0.2, 2.5], [0.7, 0.35, -0.25, 2.6], [-0.15, 1, -0.6, 2.3], [0.3, -0.4, 0.6, 2.4]];
  for (const [dx, dy, dz, size] of lobes) {
    const m = new THREE.Sprite(K.fireMat.clone());
    m.position.set(x + dx, y + dy, z + dz); m.scale.setScalar(size);
    flames.push({ m, dx, dy, dz, size }); root.add(m);
  }
  core.position.set(x, y + 0.2, z);
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Sprite(K.smokeMat.clone());
    p.position.set(x + (Math.random() - 0.5) * 2, y + 0.5, z + (Math.random() - 0.5) * 2); p.scale.setScalar(0.1);
    puffs.push({ m: p, vx: (Math.random() - 0.5) * 1.6, vy: 2.2 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.6, s: 2.2 + Math.random() * 1.6 });
    root.add(p);
  }
  // 板・瓦の破片（暗い木）と火の粉（光る）
  const N = 36, E = 18;
  const chips = new THREE.InstancedMesh(K.chip, K.chipMat, N), embers = new THREE.InstancedMesh(K.chip, K.emberMat, E);
  chips.frustumCulled = embers.frustumCulled = false;
  const bits = [];
  for (let i = 0; i < N + E; i++) {
    const a = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.9, sp = (i < N ? 7 : 10) + Math.random() * 9;
    bits.push({ x, y: y + (Math.random() - 0.3), z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * up + 3, vz: Math.sin(a) * sp * (1 - up * 0.5),
      rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14,
      sx: i < N ? 0.25 + Math.random() * 0.6 : 0.12, sy: i < N ? 0.05 + Math.random() * 0.08 : 0.12, sz: i < N ? 0.2 + Math.random() * 0.35 : 0.12, rest: false });
  }
  root.add(core, chips, embers);
  rt.scene.add(root);
  const B = F.blast = { t: 0, root, flames, core, puffs, chips, embers, bits, N, E, x, y, z };
  const o3 = new THREE.Object3D();
  const step = () => {
    const dt = 0.033;
    B.t += dt;
    const t = B.t;
    // 小さな炎が広がりながら薄れ、一秒以内に黒煙へ移る。白黄の芯は短い閃きだけ。
    const spread = 1 - Math.exp(-t * 5), fadeFire = Math.max(0, 1 - t / 0.95);
    for (const f of flames) {
      f.m.scale.setScalar(f.size * (1 + spread * 0.45));
      f.m.position.set(x + f.dx * (1 + spread), y + f.dy * (1 + spread * 0.7) + t * 0.9, z + f.dz * (1 + spread));
      f.m.material.opacity = 0.7 * fadeFire * fadeFire;
      f.m.visible = f.m.material.opacity > 0.01;
    }
    core.scale.setScalar(1.8 + spread * 0.7); core.material.opacity = Math.max(0, 1 - t / 0.35);
    core.visible = core.material.opacity > 0.01;
    for (const p of puffs) {
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.vy *= 0.985;
      p.m.scale.setScalar(Math.min(p.s * 3, 0.5 + t * p.s * 1.4));
      p.m.material.opacity = Math.max(0, 0.85 * Math.min(1, t / 0.65) * (1 - t / 9));
    }
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      if (!b.rest) {
        b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.wx * dt; b.ry += b.wy * dt;
        const g = W.heightAt(b.x, b.z) + 0.04;
        if (b.y < g) { b.y = g; b.rest = true; }
      }
      o3.position.set(b.x, b.y, b.z); o3.rotation.set(b.rest ? 0 : b.rx, b.ry, 0);
      const fade = i >= N ? Math.max(0.001, 1 - t / 2.6) : 1;
      o3.scale.set(b.sx * fade, b.sy * fade, b.sz * fade); o3.updateMatrix();
      (i < N ? chips : embers).setMatrixAt(i < N ? i : i - N, o3.matrix);
    }
    chips.instanceMatrix.needsUpdate = true; embers.instanceMatrix.needsUpdate = true;
    if (t < 10) rt.after(dt, step);
    else { for (const p of puffs) root.remove(p.m); for (const f of flames) root.remove(f.m); root.remove(core, embers); }
  };
  step();
  // 上の階が燃え続ける。黒煙の柱を二本
  F.keepFire = W.addFire(x, z, { size: 2.2, h: KEEP_AT.up - 0.6, blackSmoke: true });
  W.addSmokeColumn(x, y + 2, z, { size: 2.6, black: true });
  W.addSmokeColumn(x + 1.5, y + 1, z - 1, { size: 2, black: true });
  if (rt.army) rt.army.playFar('tenshuBlast', { x, y, z }, 1); else sfx('tenshuBlast', 1);
  rt.player?.addShake?.(0.4);
}

function boardRoom(rt, q) {
  const y = rt.world.heightAt(q.x, q.z), parts = [], details = [], stones = [], H = 2.6, high = true;
  const lattice = high && ['goten', 'nagaya', 'bansho'].includes(q.kind), windowW = Math.min(1.4, q.d - 1);
  let detail = false;
  const tint = (g, hex, yy, wall = false) => {
    if (!high) return;
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color(hex);
    const seed = Math.sin(q.x * 3.1 + q.z * 1.7) * .035;
    for (let i = 0; i < p.count; i++) {
      const damp = wall ? Math.max(0, 1 - (yy + p.getY(i)) / .85) * .3 : 0;
      const f = 1 + seed - damp;
      colors[i * 3] = c.r * f; colors[i * 3 + 1] = c.g * f; colors[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const box = (x, yy, z, w, h, d, rot = 0, tone = null) => {
    const g = ROOM_BOX.clone().scale(w, h, d), uv = g.attributes.uv, normal = g.attributes.normal;
    // 床も壁も木目を同じ大きさで貼り、広い板を引き伸ばした平面にしない。
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(normal.getX(i)) > 0.5, top = Math.abs(normal.getY(i)) > 0.5;
      const u = uv.getX(i), v = uv.getY(i);
      // 板葺きの木目は棟から軒へ。壁の縦板とは向きを変える。
      if (high && tone && top) uv.setXY(i, v * d / 3, u * w / 3);
      else uv.setXY(i, u * (side ? d : w) / 3, v * (top ? d : h) / 3);
    }
    tint(g, tone ?? 0x9a8b76, yy, tone === null);
    g.rotateX(rot); g.translate(q.x + x, y + yy, q.z + z); (detail ? details : parts).push(g);
  };
  // 板屋根は軒から棟まで壁の上へ載せ、妻をふさぐ。細い押縁だけ遠景で省く。
  const roof = (w, d, eave, pitch) => {
    const half = (d + 1.2) / 2, cy = eave + half * Math.tan(pitch) / 2 + .08;
    for (const side of [-1, 1]) box(0, cy, side * half / 2, w + 1.2, .1, half / Math.cos(pitch), side * pitch, 0x8b897c);
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, d / 2 * Math.tan(pitch)); shape.closePath();
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false, steps: 1, curveSegments: 1 });
      // 箱と同じ索引付きの形へそろえてから結合する。
      g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
      tint(g, 0x9a8b76, eave);
      g.rotateY(Math.PI / 2); g.translate(q.x + side * w / 2 - .07, y + eave + .08 + .6 * Math.tan(pitch), q.z); parts.push(g);
    }
    box(0, eave + half * Math.tan(pitch) + .16, 0, w + 1.4, .14, .18, 0, 0x514c40);
    detail = true;
    for (const side of [-1, 1]) {
      // 薄板を軒から棟へ重ねた葺き段。遠くは下の一枚屋根だけに戻す。
      const rows = Math.ceil(half / .5), step = half / rows;
      for (let i = 0; i < rows; i++) {
        const t = (i + .5) / rows;
        box(0, eave + half * (1 - t) * Math.tan(pitch) + .14,
          side * half * t, w + 1.2, .045, (step + .07) / Math.cos(pitch), side * pitch,
          i === rows - 1 ? 0x555a4b : i % 3 === 1 ? 0x827565 : 0x969183);
      }
      for (let x = -w / 2; x <= w / 2; x += .65) box(x, cy + .105, side * half / 2, .035, .035, half / Math.cos(pitch), side * pitch);
      for (const t of [.35, .78]) {
        const yy = eave + half * (1 - t) * Math.tan(pitch) + .23;
        box(0, yy, side * half * t, w + 1.3, .09, .1);
        // 押さえ木に沿う少数の平たい自然石。屋根の左右で間隔と大きさをずらす。
        for (const sx of [-1, 1]) stones.push([sx * w * .28 + side * .12, yy + .12,
          side * half * t, .18 + t * .08, .1, .15 + (sx === side ? .05 : 0)]);
      }
    }
    detail = false;
  };
  box(0, high ? .24 : .15, 0, q.w, high ? .12 : .3, q.d);
  // 描画格子の斜面は建物の途中も横切る。四辺とも二歩以内の間隔で束を下ろし、
  // 長屋の端や側面を空中へ張り出させない。既存の木材へ結合し、描画回数は増やさない。
  const support = (x, z) => {
    const bottom = rt.world.heightAt(q.x + x, q.z + z) - y - .12, top = .18;
    if (bottom < top) box(x, (bottom + top) / 2, z, .32, top - bottom, .32, 0, high ? 0x4c493d : null);
  };
  const halfW = q.w / 2 - .25, halfD = q.d / 2 - .25;
  const across = Math.max(1, Math.ceil(halfW * 2 / 1.5)), along = Math.max(1, Math.ceil(halfD * 2 / 1.5));
  for (const side of [-1, 1]) {
    for (let i = 0; i <= across; i++) support(-halfW + halfW * 2 * i / across, side * halfD);
    for (let i = 1; i < along; i++) support(side * halfW, -halfD + halfD * 2 * i / along);
  }
  box(0, H / 2 + 0.2, -q.d / 2, q.w, H, 0.14);
  for (const side of [-1, 1]) {
    if (lattice) {
      // 写真の屋敷の格子窓。板壁自体を割り、暗い窓の絵を貼るだけにしない。
      for (const [a, b, low, top] of facePanels(q.d, H, [{ t0: -windowW / 2, t1: windowW / 2, y0: .9, y1: 1.9 }])) {
        box(side * q.w / 2, .2 + (low + top) / 2, (a + b) / 2, .14, top - low, b - a);
      }
      for (const yy of [1.08, 2.12]) box(side * (q.w / 2 + .08), yy, 0, .12, .1, windowW + .2);
      for (let i = 0; i <= 6; i++) box(side * (q.w / 2 + .08), 1.6, -windowW / 2 + windowW * i / 6, .08, 1, .045);
      // 上へ跳ね上げた板戸と支え。軒下に収まり、歩く当たりは増やさない。
      box(side * (q.w / 2 + .32), 2.22, 0, .65, .07, windowW + .15, 0, 0x8b897c);
    } else box(side * q.w / 2, H / 2 + 0.2, 0, 0.14, H, q.d);
    box(side * (q.w + 1.6) / 4, H / 2 + 0.2, q.d / 2, (q.w - 1.6) / 2, H, 0.14);
    if (q.keep && !high) {
      for (const sx of [-1, 1]) box(sx * (q.w + 5.4) / 4, H + 0.45, side * (q.d + 1.2) / 4, (q.w - 3) / 2, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3, high ? 0x8b897c : null);
      box(0, H + 0.15, side * (q.d + 4.6) / 4, 4.2, 0.1, (q.d - 2.2) / (2 * Math.cos(0.3)), side * 0.3, high ? 0x8b897c : null);
    } else if (!high) box(0, H + 0.45, side * (q.d + 1.2) / 4, q.w + 1.2, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  if (high && !q.keep) roof(q.w, q.d, H + .2, q.kind === 'hondo' ? .45 : .32);
  if (high && q.keep) {
    // 望楼の下屋は上階の四面へ取り付く寄棟。分かれた長方形の屋根の間に隙間を残さない。
    // 形が確定していない天守の推定。外周・床・戸口は動かさず、屋根だけをつなぐ。
    const outer = [[-q.w / 2 - .6, -q.d / 2 - .6], [q.w / 2 + .6, -q.d / 2 - .6],
      [q.w / 2 + .6, q.d / 2 + .6], [-q.w / 2 - .6, q.d / 2 + .6]];
    const inner = [[-1.9, -1.6], [1.9, -1.6], [1.9, 1.6], [-1.9, 1.6]];
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4, a = outer[side], b = outer[next], c = inner[next], d = inner[side];
      const p = [a[0], 2.9, a[1], b[0], 2.9, b[1], c[0], 4.14, c[1], d[0], 4.14, d[1]];
      const g = new THREE.BufferGeometry();
      // 厚みのある四枚の台形を同じ隅棟で合わせ、上階の板壁へ差し込む。
      g.setAttribute('position', new THREE.Float32BufferAttribute([...p, ...p.map((v, i) => i % 3 === 1 ? v - .1 : v)], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: 8 }, (_, i) => {
        const k = i % 4; return [p[k * 3] / 3, p[k * 3 + 2] / 3];
      }).flat(), 2));
      g.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
      g.computeVertexNormals(); tint(g, side % 2 ? 0x969183 : 0x8b897c, 0);
      g.translate(q.x, y, q.z); parts.push(g);
      // 葺き段と押さえ木は台形の幅へ縮め、隅棟から隣の屋根へ突き抜けない。
      detail = true;
      const cross = side % 2 === 1;
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const topSpan = Math.hypot(c[0] - d[0], c[1] - d[1]);
      const run = Math.hypot((a[0] + b[0] - c[0] - d[0]) / 2, (a[1] + b[1] - c[1] - d[1]) / 2);
      const pitch = Math.atan2(1.24, run) * (side === 0 || side === 3 ? -1 : 1);
      for (const t of [.2, .4, .6, .8]) {
        const xx = (a[0] + b[0]) / 2 * (1 - t) + (c[0] + d[0]) / 2 * t;
        const zz = (a[1] + b[1]) / 2 * (1 - t) + (c[1] + d[1]) / 2 * t;
        const length = span * (1 - t) + topSpan * t;
        const rail = ROOM_BOX.clone().scale(length, .055, .09);
        rail.rotateX(pitch); if (cross) rail.rotateY(Math.PI / 2);
        tint(rail, t === .4 || t === .8 ? 0x514c40 : 0x827565, 0);
        rail.translate(q.x + xx, y + 2.97 + 1.24 * t, q.z + zz); details.push(rail);
        if (t === .4 || t === .8) for (const sx of [-1, 1]) stones.push([
          xx + (cross ? 0 : sx * length * .27), 3.1 + 1.24 * t,
          zz + (cross ? sx * length * .27 : 0), .24, .11, .19]);
      }
      detail = false;
    }
  }
  box(0, 2.6, q.d / 2, 1.6, 0.4, 0.14);
  // 隅柱・戸口の柱・貫と屋根の押さえ木（大和の板葺き小屋として推定）。
  for (const x of [-q.w / 2, q.w / 2, -0.8, 0.8]) box(x, H / 2 + 0.2, q.d / 2, 0.16, H, 0.2);
  for (const side of [-1, 1]) {
    if (lattice) {
      for (const end of [-1, 1]) box(side * q.w / 2, 1.45, end * (q.d + windowW) / 4, .2, .12, (q.d - windowW) / 2);
    } else box(side * q.w / 2, 1.45, 0, 0.2, 0.12, q.d);
    if (!high) for (const x of [-q.w / 3, 0, q.w / 3]) box(x, H + 0.52, side * (q.d + 1.2) / 4, 0.1, 0.1, (q.d + 1.2) / (2 * Math.cos(0.3)), side * 0.3);
  }
  if (high) {
    detail = true;
    for (let x = -q.w / 2 + .4; x < q.w / 2; x += .55) {
      box(x, 1.5, -q.d / 2 - .08, .045, H - .1, .045);
      if (Math.abs(x) > .95) box(x, 1.5, q.d / 2 + .08, .045, H - .1, .045);
    }
    for (const side of [-1, 1]) for (let z = -q.d / 2 + .4; z < q.d / 2; z += .55) {
      if (lattice && Math.abs(z) < windowW / 2 + .08) continue;
      box(side * (q.w / 2 + .08), 1.5, z, .045, H - .1, .045);
    }
    // 細い板の押縁と、屋敷を支える太い柱・足固め・桁を分ける。
    // 春日山の長屋のような軸組。格子窓と中央の戸口には材を渡さない。
    const wallBays = Math.ceil(q.w / 1.8);
    for (let i = 0; i <= wallBays; i++) {
      const px = -q.w / 2 + q.w * i / wallBays;
      box(px, 1.5, -q.d / 2 - .1, .14, H, .16, 0, 0x514b3e);
      if (Math.abs(px) > 1) box(px, 1.5, q.d / 2 + .1, .14, H, .16, 0, 0x514b3e);
    }
    for (const yy of [.4, 2.7]) {
      box(0, yy, -q.d / 2 - .1, q.w + .2, .15, .16, 0, 0x514b3e);
      for (const side of [-1, 1]) {
        box(side * (q.w + 1.6) / 4, yy, q.d / 2 + .1, (q.w - 1.6) / 2, .15, .16, 0, 0x514b3e);
        box(side * (q.w / 2 + .1), yy, 0, .16, .15, q.d, 0, 0x514b3e);
      }
    }
    const sideBays = Math.ceil(q.d / 1.8);
    for (const side of [-1, 1]) for (let i = 0; i <= sideBays; i++) {
      const pz = -q.d / 2 + q.d * i / sideBays;
      if (lattice && Math.abs(pz) < windowW / 2 + .12) continue;
      box(side * (q.w / 2 + .1), 1.5, pz, .16, H, .14, 0, 0x514b3e);
    }
    detail = false;
    // 主殿と番所に柱で支える庇。戸口と通り道の中央は空ける。
    if (['goten', 'bansho', 'nagaya'].includes(q.kind)) {
      box(0, 2.25, q.d / 2 + .65, q.w + .5, .09, 1.5, .18, 0x8b897c);
      // 長い庇を両端だけで飛ばさず、写真の長屋のように二間弱ごとに受ける。
      // 正面中央の二歩は戸口と参入路に残す。柱は既存の縁板の端に収める。
      const bays = Math.max(1, Math.ceil((q.w - .5) / 2));
      for (let i = 0; i <= bays; i++) {
        const px = -(q.w / 2 - .25) + (q.w - .5) * i / bays;
        if (Math.abs(px) < 1) continue;
        box(px, 1.1, q.d / 2 + 1.25, .12, 2.2, .12);
        detail = true;
        box(px, 1.88, q.d / 2 + .94, .09, .1, .85, .65, 0x625643);
        detail = false;
      }
      box(0, 2.08, q.d / 2 + 1.25, q.w - .25, .14, .16, 0, 0x514b3e);
      // 庇の下の縁板と束。戸口中央と室内への踏み込みは空ける。
      detail = true;
      // 一枚の灰色の庇を、棟側から軒へ流す薄い板と褪せの違いで割る。
      // 下地は遠景に残し、近くの葺き板だけ既存の細部と一緒に結合する。
      const canopyBoards = Math.ceil((q.w + .5) / .4), canopyStep = (q.w + .5) / canopyBoards;
      for (let i = 0; i < canopyBoards; i++) {
        box(-(q.w + .5) / 2 + (i + .5) * canopyStep, 2.31 + i % 3 * .006,
          q.d / 2 + .65, canopyStep - .012, .035, 1.5, .18,
          i % 7 === 2 ? 0x8a7358 : i % 3 === 0 ? 0x62665a : 0x7c7768);
      }
      for (const side of [-1, 1]) box(side * (q.w / 2 + .25), 2.26,
        q.d / 2 + .65, .09, .13, 1.56, .18, 0x514b3e);
      // 写真の庇は細い垂木を並べ、端の柱を斜めの控えで桁へつなぐ。
      for (let x = -q.w / 2; x <= q.w / 2 + .01; x += .6) {
        box(x, 2.16, q.d / 2 + .65, .065, .1, 1.55, .18, 0x514b3e);
      }
      for (const side of [-1, 1]) {
        box(side * (q.w + 1.8) / 4, .23, q.d / 2 + .55, (q.w - 1.8) / 2, .12, .9);
        box(side * (q.w / 2 - .25), .08, q.d / 2 + .85, .18, .24, .18);
      }
      detail = false;
    }
  }
  const levels = [{ y: y + 0.3, w: q.w - 0.14, d: q.d - 0.14, h: H }];
  if (q.keep) {
    // 広い下屋の上に小さな望楼。白壁・石垣の台・鯱・層塔は付けない。
    const w = 3.8, d = 3.2, floor = 4.1, h = 2.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * w / 2, floor / 2, sz * d / 2, 0.16, floor, 0.16);
    for (const side of [-1, 1]) {
      if (high) {
        // 望楼の四面に実際の窓を空け、板の箱の姿を崩す。
        for (const [bottom, tall] of [[0, .9], [1.9, .5]]) {
          box(0, floor + bottom + tall / 2, side * d / 2, w, tall, .14);
          box(side * w / 2, floor + bottom + tall / 2, 0, .14, tall, d);
        }
        for (const end of [-1, 1]) {
          box(end * (w / 2 - .35), floor + 1.4, side * d / 2, .7, 1, .14);
          box(side * w / 2, floor + 1.4, end * (d / 2 - .35), .14, 1, .7);
        }
      } else {
        box(0, floor + h / 2, side * d / 2, w, h, .14);
        box(side * w / 2, floor + h / 2, 0, .14, h, d);
        box(0, floor + h + .45, side * (d + 1.2) / 4, w + 1.2, .12, (d + 1.2) / (2 * Math.cos(.38)), side * .38);
      }
      box(0, floor + 0.8, side * (d + 0.8) / 2, w + 1, 0.1, 0.1);
      box(side * (w + 0.8) / 2, floor + 0.8, 0, 0.1, 0.1, d + 1);
    }
    if (high) roof(w, d, floor + h, .38);
    levels.push({ y: y + floor + 0.08, w: w - 0.14, d: d - 0.14, h });
  }
  const naka = addInterior(rt.world, { ...q, team: 1,
    wins: () => lattice ? [-1, 1].map((s) => ({ face: 'x', s, t: 0, w: windowW, y0: .8, y1: 1.8 })) : [],
    levels, door: { side: 1, lx: 0, w: 1.4 }, approach: { pad: 0.35, len: 1.2 }, oku: 0 });
  if (q.keep) for (const [x0, x1, z0, z1] of naka.levels[1].pieces) box((x0 + x1) / 2, levels[1].y - y - 0.08, (z0 + z1) / 2, x1 - x0, 0.16, z1 - z0);
  const roomMat = high ? ROOM_WORN_MAT : ROOM_MAT;
  const mesh = new THREE.Mesh(mergeGeometries(parts), roomMat); mesh.castShadow = true; mesh.receiveShadow = true;
  // 自作の板壁・屋根も視点を止める。外を歩く本人の背後へ壁が入り込むのを防ぐ。
  mesh.userData.camBlock = true; mesh.userData.naka = naka; rt.scene.add(mesh);
  if (details.length) {
    const geo = mergeGeometries(details); geo.translate(-q.x, -y, -q.z);
    const lod = new THREE.LOD(), near = new THREE.Mesh(geo, roomMat);
    near.receiveShadow = true; lod.position.set(q.x, y, q.z);
    const close = new THREE.Group(); close.add(near);
    if (stones.length) {
      const ballast = new THREE.InstancedMesh(ROOF_STONE, STEP_MAT, stones.length), dummy = new THREE.Object3D();
      for (let i = 0; i < stones.length; i++) {
        const [sx, sy, sz, w, h, d] = stones[i];
        dummy.position.set(sx, sy, sz); dummy.scale.set(w, h, d); dummy.rotation.y = i * 1.7;
        dummy.updateMatrix(); ballast.setMatrixAt(i, dummy.matrix);
      }
      ballast.castShadow = ballast.receiveShadow = true; close.add(ballast);
    }
    lod.addLevel(close, 0); lod.addLevel(new THREE.Group(), 85); mesh.add(lod);
    for (const g of details) g.dispose();
  }
  for (const g of parts) g.dispose();
  return { mesh, naka };
}

// 兵糧小屋の裏の槍架けと積み材。配置は推定。道と戦う平場の当たりは増やさない。
function ridgeEquipment(rt) {
  const W = rt.world, frames = [], shafts = [], heads = [];
  for (const [x, z] of [[RIDGE3.x + 5, RIDGE3.z - 2.7], [RIDGE4.x + 5, RIDGE4.z - 2.7], [YASHIKI.x + 11, YASHIKI.z + 2.7]]) {
    const y = W.heightAt(x, z);
    if (Math.abs(W.heightAt(x - 1.2, z) - y) > .5 || Math.abs(W.heightAt(x + 1.2, z) - y) > .5) continue;
    for (const side of [-1, 1]) frames.push([x + side * 1.1, y + .8, z, .12, 1.9, .12]);
    frames.push([x, y + 1.5, z, 2.5, .12, .12]);
    for (let i = 0; i < 5; i++) {
      const px = x - .85 + i * .42;
      shafts.push([px, y + 1.8, z + .18, .035, 3.6, .035, -.09]);
      heads.push([px, y + 3.7, z + .35, .07, .3, .07, -.09]);
    }
    for (let i = 0; i < 4; i++) shafts.push([x, y + .12 + Math.floor(i / 2) * .2, z - .5 - i % 2 * .22, .1, 2.8, .1, Math.PI / 2]);
  }
  const dummy = new THREE.Object3D();
  const put = (geo, mat, items) => {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const [x, y, z, sx, sy, sz, rot = 0] = items[i];
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rot === Math.PI / 2 ? 0 : rot, 0, rot === Math.PI / 2 ? rot : 0);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh); W.viewCull([mesh], 0);
  };
  put(ROOM_BOX, ROOM_MAT, frames);
  put(new THREE.CylinderGeometry(1, 1, 1, 5), ROOM_MAT, shafts);
  put(new THREE.ConeGeometry(1, 1, 4), STEP_MAT, heads);
}

// 夜攻めの備え。物の種類は本の野戦兵器・清洲の裏方小屋を参考にした推定配置。
// 道・戸口・戦う中央を空け、小屋の裏と郭の端だけに置く。当たりも実兵も増やさない。
function siegeStores(rt) {
  const W = rt.world;
  const box = ROOM_BOX, pole = new THREE.CylinderGeometry(1, 1, 1, 5);
  const ring = new THREE.TorusGeometry(1, .035, 3, 8);
  const pot = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() });
  const pose = new THREE.Object3D(), color = new THREE.Color();
  let bambooKit = null;
  // 一地点一束で描き、遠くは竹束の輪郭と屋根だけ。細い縄・節・薪は近くでだけ送る。
  const site = (x, z, kind) => {
    const y = W.heightAt(x, z), coarse = [], detail = [];
    if (kind === 'bamboo' && bambooKit) {
      const copy = bambooKit.clone(); copy.position.set(x, y, z); rt.scene.add(copy); return;
    }
    const footAt = (dx, dz) => W.heightAt(x + dx, z + dz) - y;
    const add = (parts, geo, tint, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const g = geo.clone();
      pose.position.set(px, py, pz); pose.scale.set(sx, sy, sz); pose.rotation.set(rx, ry, rz);
      pose.updateMatrix(); g.applyMatrix4(pose.matrix);
      const a = new Float32Array(g.attributes.position.count * 3); color.setHex(tint);
      for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    };
    if (kind === 'bamboo') {
      // 二束だけの控え。黄色一色の壁でなく、切口・節・二か所の縄で束ねた青竹にする。
      for (let b = 0; b < 2; b++) {
        const bx = b * .86 - .43, h = 1.65 + b * .16;
        add(coarse, pole, 0x696747, bx, h / 2, 0, .38, h, .38);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, px = bx + Math.cos(a) * .34, pz = Math.sin(a) * .34;
          const ph = h + (i % 3 - 1) * .045;
          add(detail, pole, i % 2 ? 0x8a8854 : 0x657044, px, ph / 2, pz, .075, ph, .075);
          add(detail, pole, 0xb5a477, px, ph + .008, pz, .067, .018, .067);
          for (const yy of [.36, .86, 1.35]) add(detail, pole, 0x9a9764, px, yy, pz, .083, .028, .083);
        }
        for (const yy of [.5, 1.18]) add(detail, ring, 0x51432f, bx, yy, 0, .44, .44, .44, Math.PI / 2);
      }
    } else if (kind === 'shelter') {
      // 幕囲いの脇の板葺き陣小屋。南は開け、兵糧と運搬具を雨露から守る。
      const rise = Math.max(0, ...[-1.7, 1.7].flatMap(dx => [-1.1, 1.1].map(dz => footAt(dx, dz))));
      for (const dx of [-1.7, 1.7]) for (const dz of [-1.1, 1.1]) {
        const foot = footAt(dx, dz);
        add(coarse, pole, 0x60503b, dx, (foot + rise + 2.35) / 2, dz, .085, rise + 2.35 - foot, .085);
      }
      for (const dz of [-1.1, 1.1]) add(coarse, box, 0x69563c, 0, rise + 2.28, dz, 3.9, .13, .13);
      for (const side of [-1, 1]) {
        add(coarse, box, 0x726451, 0, rise + 2.57, side * .66, 4.1, .10, 1.48, side * .3);
        for (let i = 0; i < 10; i++) add(detail, box, i % 2 ? 0x83755f : 0x625844,
          -1.85 + i * .41, rise + 2.63, side * .66, .032, .035, 1.48, side * .3);
        add(detail, pole, 0x574a37, 0, rise + 2.74, side * .68, .055, 4.25, .055, 0, 0, Math.PI / 2);
      }
      for (let i = 0; i < 7; i++) {
        const px = -1.53 + i * .51, foot = footAt(px, -1.1), top = rise + 2.15;
        add(detail, box, i % 2 ? 0x6e604a : 0x81745b, px, (foot + top) / 2, -1.1, .49, top - foot, .055);
      }
      // 縄を掛けた木箱と担ぎ棒。戦国の山道なので車輪付き攻城具は置かない。
      for (let i = 0; i < 3; i++) {
        const px = -.9 + i * .75, foot = footAt(px, -.45);
        add(coarse, box, 0x79684c, px, foot + .3, -.45, .67, .6, .75);
        for (const dx of [-.22, .22]) add(detail, box, 0x4e4231, px + dx, foot + .31, -.45, .035, .63, .79);
      }
      for (const dx of [-1.3, 1.3]) {
        const foot = footAt(dx, .5), top = rise + .12;
        add(detail, box, 0x514430, dx, (foot + top) / 2, .5, .12, top - foot, .65);
      }
      for (let i = 0; i < 3; i++) add(detail, pole, 0x887149, .2, rise + .17 + i * .1, .5, .045, 3.6, .045, 0, 0, Math.PI / 2);
    } else {
      // 既存の焚火の上に鍋。灯り・炎・煙の仕組みは共用し、照明は増やさない。
      for (const dx of [-.75, .75]) {
        const foot = footAt(dx, 0);
        add(coarse, pole, 0x60503c, dx, (foot + 1.64) / 2, 0, .055, 1.64 - foot, .055);
      }
      add(coarse, pole, 0x60503c, 0, 1.62, 0, .06, 1.8, .06, 0, 0, Math.PI / 2);
      add(detail, pole, 0x39362e, 0, 1.27, 0, .023, .65, .023);
      add(coarse, pot, 0x302e28, 0, .94, 0, .43, .43, .43);
      add(detail, ring, 0x4b4638, 0, .94, 0, .43, .43, .43, Math.PI / 2);
      for (let i = 0; i < 5; i++) add(detail, pole, 0x67533c, 1.25, footAt(1.25, -.3) + .08 + Math.floor(i / 3) * .14,
        -.5 + (i % 3) * .17, .07, .9, .07, 0, 0, Math.PI / 2);
    }
    const root = new THREE.Group(); root.position.set(x, y, z);
    const put = (parts) => {
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.receiveShadow = true;
      for (const g of parts) g.dispose();
      return mesh;
    };
    const silhouette = put(coarse), fine = put(detail);
    const near = new THREE.Mesh(mergeGeometries([silhouette.geometry, fine.geometry]), mat);
    near.receiveShadow = true; fine.geometry.dispose();
    const lod = new THREE.LOD(); lod.userData.noMerge = true; lod.addLevel(near, 0);
    lod.addLevel(new THREE.Mesh(silhouette.geometry, mat), 48);
    lod.addLevel(new THREE.Group(), 125); root.add(lod); rt.scene.add(root);
    if (kind === 'bamboo') bambooKit = root;
  };
  for (const [x, z] of [[14, GATE.z - 10], [16, GATE.z - 2], [RIDGE1.x - 10, RIDGE1.z - 3], [RIDGE3.x - 8, RIDGE3.z]]) site(x, z, 'bamboo');
  site(-26, 140, 'shelter');
  site(-20, 124, 'cook');
  W.addSmokeColumn(-20, W.heightAt(-20, 124) + 1, 124, { size: .4 });
  pole.dispose(); ring.dispose(); pot.dispose();
}

// この山だけ地面の格子を細分する。歩行も描く三角形の面へ合わせる。
// 草・土・岩の共通材質と属性は再利用し、準備時に一度だけ組み直す。
function ridgeTerrain(W) {
  const old = W.terrain.geometry, nx = old.parameters.widthSegments, nz = old.parameters.heightSegments;
  // 低画質の描画格子は歩行格子より粗い。元の面の幅から読み、山の端まで覆う。
  const stepX = old.parameters.width / nx, stepZ = old.parameters.height / nz;
  const xs = [], zs = [];
  for (let i = 0; i <= nx; i++) {
    const x = -W.half + i * stepX; xs.push(x);
    if (i < nx && Math.abs(x) < 140) xs.push(x + stepX / 2);
  }
  for (let j = 0; j <= nz; j++) {
    const z = -W.half + j * stepZ; zs.push(z);
    if (j < nz && z > YASHIKI.z - 26 && z < 30) zs.push(z + stepZ / 2);
  }
  const oldHeight = W.heightAt.bind(W), heights = new Float32Array(xs.length * zs.length);
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
    const x = xs[i], z = zs[j];
    heights[j * xs.length + i] = height(x, z);
  }
  // 切岸の中の孤立した高い頂点は細い三角になる。道と建物を避け、周囲へ丸くなじませる。
  const sourceHeights = heights.slice(), stride = xs.length;
  for (let j = 1; j < zs.length - 1; j++) for (let i = 1; i < xs.length - 1; i++) {
    if (Math.abs(xs[i]) > 140 || zs[j] < YASHIKI.z - 26 || zs[j] > 30) continue;
    const k = j * stride + i, h = sourceHeights[k];
    const rim = Math.max(sourceHeights[k - 1], sourceHeights[k + 1], sourceHeights[k - stride], sourceHeights[k + stride]);
    if (h > rim + 3 && stoneSpace(xs[i], zs[j])) heights[k] = rim + 1;
  }
  // 描く格子と歩く格子を共有する。細い道へ粗い格子の崖が被さらないようにする。
  const findCell = (list, v) => {
    let lo = 0, hi = list.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m] <= v) lo = m; else hi = m; }
    return lo;
  };
  W.heightAt = (x, z) => {
    if (x < xs[0] || x > xs[xs.length - 1] || z < zs[0] || z > zs[zs.length - 1]) return oldHeight(x, z);
    const i = findCell(xs, x), j = findCell(zs, z), a = j * xs.length + i;
    const tx = (x - xs[i]) / (xs[i + 1] - xs[i]), tz = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const h00 = heights[a], h10 = heights[a + 1], h01 = heights[a + xs.length], h11 = heights[a + xs.length + 1];
    return tx + tz <= 1
      ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
      : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
  const g = new THREE.BufferGeometry(), count = xs.length * zs.length;
  for (const [name, attr] of Object.entries(old.attributes)) {
    if (name === 'normal') continue;
    const values = new Float32Array(count * attr.itemSize);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      const x = xs[i], z = zs[j], fx = (x + W.half) / stepX, fz = (z + W.half) / stepZ;
      const ix = Math.min(nx - 1, Math.floor(fx)), iz = Math.min(nz - 1, Math.floor(fz));
      const tx = fx - ix, tz = fz - iz, a = iz * (nx + 1) + ix;
      const k = (j * xs.length + i) * attr.itemSize;
      for (let n = 0; n < attr.itemSize; n++) {
        const read = (v) => attr.array[v * attr.itemSize + n];
        values[k + n] = (read(a) * (1 - tx) + read(a + 1) * tx) * (1 - tz)
          + (read(a + nx + 1) * (1 - tx) + read(a + nx + 2) * tx) * tz;
      }
      if (name === 'position') { values[k] = x; values[k + 1] = W.heightAt(x, z); values[k + 2] = z; }
      if (name === 'splat' && z < GATE.z - 10) {
        for (const q of ROAD_SEGMENTS) {
          const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
          if (Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t) < q.half) {
            values[k] = 0.04; values[k + 1] = 0.94; values[k + 2] = 0.02; break;
          }
        }
      }
    }
    g.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
  }
  const indices = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + xs.length;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setIndex(indices); g.computeVertexNormals();
  W.terrain.geometry = g; old.dispose();
}

// 土道は地面自身の草・土・岩の材質で描く。別の帯を重ねて三角の破片を作らない。
function ridgeSoil(rt) {
  const stones = [], roots = [], W = rt.world;
  // 平場の外の切岸にも露頭と根を置く。道・建物の当たりには加えない。
  for (let z = -216; z <= -76; z += 14) for (const side of [-1, 1]) {
    const x = side * (42 + 7 * Math.sin(z * 0.19));
    if (!stoneSpace(x, z, true) || Math.hypot(x - GATE.x, z - GATE.z) < 40) continue;
    stones.push([x, z]); roots.push([x + side * 0.8, z + 0.7, z * 0.13]);
  }
  for (const q of ROAD_SEGMENTS) {
    if (q.az < -218 || q.az > OPEN_PT[1] + 30) continue;
    const len = Math.sqrt(q.l2), nx = q.dz / len, nz = -q.dx / len;
    const n = Math.max(1, Math.ceil(len / 1.2));
    // 木と岩は道の外へ。土に半ば埋めた岩と根は当たりを増やさない。
    for (let i = 0; i < n; i += 12) {
      const t = (i + 0.5) / n, side = i % 24 ? -1 : 1;
      const x = q.ax + q.dx * t + nx * side * (ROAD_HALF + 3);
      const z = q.az + q.dz * t + nz * side * (ROAD_HALF + 3);
      if (!stoneSpace(x, z, true) || Math.hypot(x - GATE.x, z - GATE.z) < 40) continue;   // 門前の持ち場の足元に、夜に黒い箱に見える露頭を置かない（10/29 採点）
      stones.push([x, z]); roots.push([x + nx * side * 0.5, z + nz * side * 0.5, Math.atan2(q.dx, q.dz)]);
    }
  }
  const dummy = new THREE.Object3D();
  const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), STEP_MAT, stones.length);
  const rootGeo = new THREE.CylinderGeometry(0.07, 0.13, 1, 5); rootGeo.rotateZ(Math.PI / 2);
  const treeN = Math.ceil(stones.length / 3);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 4.8, 5), new THREE.MeshLambertMaterial({ color: 0x796047, map: barkTex() }), treeN);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5.6, 6), new THREE.MeshLambertMaterial({ color: 0x384a30 }), treeN);
  const root = new THREE.InstancedMesh(rootGeo, new THREE.MeshLambertMaterial({ color: 0x806344, map: barkTex() }), roots.length);
  let planted = 0;
  const rockPoint = new THREE.Vector3(), rockVertices = rock.geometry.attributes.position;
  for (let i = 0; i < stones.length; i++) {
    const [x, z] = stones[i]; dummy.position.set(x, W.heightAt(x, z) - 0.12, z);
    dummy.rotation.set(0.08, i * 1.7, 0.06); dummy.scale.set(0.7 + i % 3 * 0.35, 0.5 + i % 4 * 0.18, 0.9); dummy.updateMatrix();
    // 中心だけで接地させると、下り側の縁が宙へ出る。準備時に下半分を土へ埋める。
    let sink = 0;
    for (let j = 0; j < rockVertices.count; j++) {
      if (rockVertices.getY(j) > -0.25) continue;
      rockPoint.fromBufferAttribute(rockVertices, j).applyMatrix4(dummy.matrix);
      sink = Math.max(sink, rockPoint.y - W.heightAt(rockPoint.x, rockPoint.z) + 0.12);
    }
    dummy.position.y -= sink; dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) {
      const [rx, rz] = roots[i], tx = x + (rx - x) * 30, tz = z + (rz - z) * 30, y = W.heightAt(tx, tz);
      let near = !!W.def.clear?.(tx, tz);
      for (const q of ROAD_SEGMENTS) {
        const t = Math.max(0, Math.min(1, ((tx - q.ax) * q.dx + (tz - q.az) * q.dz) / q.l2));
        if (Math.hypot(tx - q.ax - q.dx * t, tz - q.az - q.dz * t) < 16) { near = true; break; }
      }
      if (!near) {
        dummy.rotation.set(0, i * 1.7, 0); dummy.scale.set(1, 1, 1);
        dummy.position.set(tx, y + 2.25, tz); dummy.updateMatrix(); trunk.setMatrixAt(planted, dummy.matrix);
        dummy.position.y = y + 5; dummy.updateMatrix(); crown.setMatrixAt(planted++, dummy.matrix);
      }
    }
    const [rx, rz, rot] = roots[i], dx = Math.cos(rot) * 0.7, dz = -Math.sin(rot) * 0.7;
    const ha = W.heightAt(rx - dx, rz - dz), hb = W.heightAt(rx + dx, rz + dz);
    dummy.position.set(rx, (ha + hb) / 2 + 0.04, rz);
    dummy.rotation.set(0, rot, Math.atan2(hb - ha, 1.4)); dummy.scale.set(1.4, 1, 1); dummy.updateMatrix(); root.setMatrixAt(i, dummy.matrix);
  }
  trunk.count = crown.count = planted;
  // 露頭の脇に寝かせた根の丸太は、岩と並ぶと斜面に浮いた金槌の形に見えた（10/28 資料との差の調べ）。根は描かない。
  root.count = 0;
  rock.receiveShadow = root.receiveShadow = true; rt.scene.add(rock, root, trunk, crown);
  // 固有の露頭・根・木も、共通の草木と同じく画面外の個体を束から外す。
  // 幹と葉は同じ並びで詰め、木の数や道・斜面の当たりは変えない。
  W.viewCull([rock], 0);
  W.viewCull([root], 0);
  W.viewCull([trunk, crown], 16);
}

// 持ち場から25秒の画面の大半を占める、門から山頂へ上がる尾根の斜面（x -14〜34・z -60〜-6）を、
// 月に白く光る灰緑の一枚の板でなく、写真の土と枯れ草の肌・下草の株・露頭の石にする（10/30 採点「左上の斜面が灰緑の一枚の板に縦の筋」）。
// 描く地面（drawGroundAt）に同じ形の皮を重ね、凹凸は急な所の外へだけ出す。縁と道（緩い所）は地面の下へ潜らせ、浮かせない。準備の時だけ。
function sgHash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function sgNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = sgHash(ix, iz), b = sgHash(ix + 1, iz), c = sgHash(ix, iz + 1), d = sgHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
// 野面の石垣・狭間の板塀の絵：白く光る置物でなく、月夜に沈む古い漆喰の灰・黒い下見板・燻し瓦・野面の石で組む（10/30 採点 点検4）。
// 絵はキャンバスで一度だけ描き（石垣・壁・瓦）、形は箱と寄棟の屋根だけ。見た目だけで当たりは持たない。
let SG_KEEP = null;
function sgKeepKit() {
  if (SG_KEEP) return SG_KEEP;
  let seed = 91; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  // 野面積み：大小の自然石を崩れた横目地の段に積み、石ごとに濃淡、目地は深い黒（継ぎ目が写る）。
  const stone = canvas(512, 512, (g, W, H) => {
    g.fillStyle = '#141311'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H;) {
      const rowH = 34 + R() * 30;
      for (let x = -R() * 40; x < W;) {
        const w = 40 + R() * 70, v = 70 + R() * 70, wm = R() * 14;
        const pts = [[x + 3 + R() * 6, y + 3 + R() * 5], [x + w - 3 - R() * 6, y + 2 + R() * 6], [x + w - 2 - R() * 5, y + rowH - 3 - R() * 6], [x + 2 + R() * 6, y + rowH - 2 - R() * 5]];
        for (const dx of [0, -W, W]) {
          g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py) : g.moveTo(px + dx, py))); g.closePath();
          const gr = g.createLinearGradient(x + dx, y, x + dx + w * .4, y + rowH);
          gr.addColorStop(0, `rgb(${v + 18 | 0},${v + 16 - wm | 0},${v + 8 - wm | 0})`); gr.addColorStop(1, `rgb(${v - 22 | 0},${v - 24 | 0},${v - 28 | 0})`);
          g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.stroke();
        }
        if (R() < .35) { g.fillStyle = `rgba(52,64,38,${.25 + R() * .3})`; g.beginPath(); g.ellipse(x + w * R(), y + rowH * .7, w * .3, rowH * .2, 0, 0, 7); g.fill(); }
        x += w;
      }
      y += rowH;
    }
  });
  // 壁：上は煤けて灰になった古い漆喰（雨だれの筋）、下は黒い下見板（板の重なりの影）、その中に狭間（四角＝鉄砲・三角＝弓）と格子窓。
  const wall = canvas(512, 256, (g, W, H) => {
    const cut = H * .42;
    g.fillStyle = '#6a6761'; g.fillRect(0, 0, W, cut);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,38,34,${R() * .25})`; g.fillRect(R() * W, R() * cut * .4, 1 + R() * 3, cut * (.3 + R() * .7)); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,146,138,${R() * .12})`; g.beginPath(); g.ellipse(R() * W, R() * cut, 10 + R() * 30, 4 + R() * 10, 0, 0, 7); g.fill(); }
    for (let y = cut; y < H; y += 14) {
      g.fillStyle = `rgb(${24 + R() * 8 | 0},${22 + R() * 7 | 0},${20 + R() * 6 | 0})`; g.fillRect(0, y, W, 14);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, y + 12, W, 2);
      g.fillStyle = 'rgba(90,84,74,0.18)'; g.fillRect(0, y, W, 1);
    }
    for (let x = 0; x < W; x += 64) { g.fillStyle = '#17140f'; g.fillRect(x, cut, 6, H - cut); }
    g.fillStyle = '#2a2621'; g.fillRect(0, cut - 4, W, 6);
    for (let x = 32; x < W; x += 64) {
      g.fillStyle = '#050505';
      if ((x / 64 | 0) % 2) g.fillRect(x - 7, cut + 40, 14, 14);
      else { g.beginPath(); g.moveTo(x - 8, cut + 56); g.lineTo(x + 8, cut + 56); g.lineTo(x, cut + 42); g.closePath(); g.fill(); }
    }
    for (const x of [96, 352]) {
      g.fillStyle = '#0c0b0a'; g.fillRect(x - 30, cut * .3, 60, cut * .5);
      g.fillStyle = '#3b352d'; for (let k = 0; k <= 6; k++) g.fillRect(x - 30 + k * 10, cut * .3, 3, cut * .5);
    }
  });
  // 瓦：燻し瓦の丸瓦の縦の列と段ごとの陰、苔の斑。
  const tile = canvas(256, 256, (g, W, H) => {
    g.fillStyle = '#1d1e20'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0), v = 58 + R() * 14 | 0;
      gr.addColorStop(0, '#141516'); gr.addColorStop(.45, `rgb(${v},${v + 2},${v + 6})`); gr.addColorStop(1, '#101112');
      g.fillStyle = gr; g.fillRect(x + 2, 0, 12, H);
    }
    for (let y = 0; y < H; y += 21) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, W, 3); g.fillStyle = 'rgba(120,118,112,0.12)'; g.fillRect(0, y + 3, W, 2); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,96,72,${R() * .2})`; g.beginPath(); g.ellipse(R() * W, R() * H, 6 + R() * 16, 3 + R() * 6, 0, 0, 7); g.fill(); }
  });
  const mat = (map, rough) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
  SG_KEEP = { stone: mat(stone, .95), wall: mat(wall, .9), tile: mat(tile, .7), wood: new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: .9 }) };
  return SG_KEEP;
}
// 寄棟の屋根：軒の四辺から棟へ（w が棟の向き）。uv は寸法に合わせ、瓦の列が屋根の大きさで伸びない。
function hipRoof(w, d, h) {
  const r = Math.max(0, (w - d) / 2), pos = [], uv = [];
  const E = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], T = [[-r, 0], [r, 0], [r, 0], [-r, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = E[i], b = E[j], ta = T[i], tb = T[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3, sl = Math.hypot(h, d / 2) / 3;
    const q = [[a[0], .2, a[1], 0, 0], [b[0], .2, b[1], len, 0], [tb[0], h, tb[1], len, sl], [ta[0], h, ta[1], 0, sl]];
    for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], q[k][1], q[k][2]); uv.push(q[k][3], q[k][4]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// 板塀の絵：古びた黒い縦板・押縁・腰の横桟と、狭間（四角＝鉄砲・三角＝弓）の黒い口。
let SG_HEI = null;
function sgHeiMat() {
  if (SG_HEI) return SG_HEI;
  let seed = 37; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  for (let x = 0; x < 512; x += 16) {
    const v = 30 + R() * 16 | 0; g.fillStyle = `rgb(${v + 6},${v + 2},${v - 3})`; g.fillRect(x, 0, 16, 256);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 15, 0, 1, 256);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(110,100,84,${R() * .12})`; g.fillRect(x + R() * 14, 0, 1, 256); }
  }
  for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(70,74,52,${R() * .25})`; g.beginPath(); g.ellipse(R() * 512, 230 + R() * 26, 20 + R() * 30, 6 + R() * 8, 0, 0, 7); g.fill(); }
  g.fillStyle = '#1a1612'; g.fillRect(0, 70, 512, 9); g.fillRect(0, 196, 512, 9);
  for (let x = 64; x < 512; x += 128) {
    g.fillStyle = '#030303';
    if ((x / 128 | 0) % 2) g.fillRect(x - 10, 110, 20, 20);
    else { g.beginPath(); g.moveTo(x - 11, 134); g.lineTo(x + 11, 134); g.lineTo(x, 112); g.closePath(); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  SG_HEI = new THREE.MeshStandardMaterial({ map: t, roughness: .92, side: THREE.DoubleSide });
  return SG_HEI;
}
// 線 pts に沿う帯の形（左右の高さを関数で）。uv は横の長さ・縦の高さを寸法で（絵が伸びない）。
function sgBand(pts, step, at, uScale, vScale) {
  const pos = [], uv = [], idx = []; let u = 0, n = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(len / step));
    for (let j = (i === 1 ? 0 : 1); j <= k; j++) {
      const x = ax + (bx - ax) * j / k, z = az + (bz - az) * j / k;
      if (n) u += Math.hypot(x - pos[pos.length - 6], z - pos[pos.length - 4]);
      const [lo, hi] = at(x, z);
      pos.push(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
      uv.push(u / uScale, lo[1] / vScale, u / uScale, hi[1] / vScale);
      if (n) idx.push(2 * n - 2, 2 * n, 2 * n - 1, 2 * n - 1, 2 * n, 2 * n + 1);
      n++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 石垣の上の狭間の板塀（板と押縁・腰の横桟・狭間の口）。柱は地面から立てる。
function sgHei(rt, pts, base, h = 2.2) {
  const mat = sgHeiMat();
  const g = sgBand(pts, 1, (x, z) => { const b = base(x, z); return [[x, b - .3, z], [x, b + h, z]]; }, 4, h + .3);
  const parts = [g];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(len / 1.8));
    for (let j = 0; j <= k; j++) {
      const x = ax + (bx - ax) * j / k, z = az + (bz - az) * j / k, b = base(x, z);
      const p = new THREE.BoxGeometry(.14, h + .7, .14); p.translate(x - .1, b + (h + .7) / 2 - .5, z); parts.push(p);
    }
  }
  const capG = sgBand(pts, 1, (x, z) => { const b = base(x, z) + h; return [[x + .28, b - .1, z], [x - .28, b + .06, z]]; }, 4, 1);
  const wood = sgKeepKit().wood;
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; rt.scene.add(m);
  const posts = new THREE.Mesh(mergeGeometries(parts.slice(1)), wood); posts.castShadow = true; rt.scene.add(posts);
  const cm = new THREE.Mesh(capG, sgKeepKit().tile); cm.castShadow = true; rt.scene.add(cm);
  cm.material.side = THREE.DoubleSide;
}
// 篝火は十二基。一基ごとに二回描かず、並びの束（鉄籠と薪の二回）へ一つずつ置く（iPhone の描く回数を減らす）。炎は今までどおり addFire。
function kagaPlace(rt, W, x, z) {
  let G = rt._sgKaga;
  if (!G) {
    G = rt._sgKaga = { grp: kagaribiBatch(W, Array.from({ length: 16 }, () => [0, 0])), n: 0, m: new THREE.Matrix4() };
    rt.scene.add(G.grp);
  }
  // 11/5 専門家の目：篝火は平らな所に据える。切岸の斜面の中ほどに立てない（四十五度の斜面に立つ鉄籠が浮いて見えた）。
  //   近く二歩の内で一番平らな所へ寄せ（道の真ん中へは出さない）、どこも急なら置かない。
  const slope = (px, pz) => Math.max(Math.abs(W.heightAt(px + .6, pz) - W.heightAt(px - .6, pz)), Math.abs(W.heightAt(px, pz + .6) - W.heightAt(px, pz - .6))) / 1.2;
  let best = slope(x, z), bx = x, bz = z;
  for (let r = .75; r <= 2.25 && best > .3; r += .75) for (let k = 0; k < 12; k++) {
    const px = x + Math.cos(k * Math.PI / 6) * r, pz = z + Math.sin(k * Math.PI / 6) * r, s = slope(px, pz);
    if (s < best) { best = s; bx = px; bz = pz; }
  }
  if (best > .45) return;
  x = bx; z = bz;
  G.m.makeTranslation(x, W.heightAt(x, z), z);
  for (const im of G.grp.children) { im.setMatrixAt(G.n, G.m); }
  G.n++;
  for (const im of G.grp.children) { im.count = G.n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  W.addFire(x, z, { torch: true, h: 1.35 });
}
function slopeSkin(rt) {
  const W = rt.world, H = (x, z) => drawGroundAt(W, x, z);
  const skin = new THREE.MeshStandardMaterial({ map: groundDetailTex('dirt'), vertexColors: true, roughness: .97, metalness: 0 });
  // 写真の土の絵は明るさだけを使い、色は頂点の色（湿った山の土・枯れ草・苔）で決める。
  skin.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec3 sgPh = texture2D(map, vMapUv).rgb; float sgPl = dot(sgPh, vec3(0.3, 0.59, 0.11));
      diffuseColor.rgb *= vec3(sgPl * 1.7);
      // 10/31 手本（docs/layout-ref/shigisan/）：離れた斜面は常緑の緑が主で、紅葉の赤・橙・黄が斑に混じる。近い土と草は元のまま。
      // 11/5 専門家の目：門前の切岸（裸の土）に紅葉の赤い縞が帯で出て、塗った絵に見えた。森の色は遠い斜面だけ・紅葉は淡い斑に。
      float sgFar = smoothstep(30.0, 70.0, length(vViewPosition));
      float sgCr = 0.5 + 0.5 * sin(vMapUv.x * 1.7 + sin(vMapUv.y * 1.3) * 2.6) * sin(vMapUv.y * 1.9 + vMapUv.x * 0.6);
      float sgL2 = max(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 0.1) * 1.3;
      vec3 sgCan = sgL2 * mix(vec3(0.50, 1.10, 0.42), vec3(0.34, 0.86, 0.40), sgPl);
      sgCan = mix(sgCan, sgL2 * vec3(1.75, 0.58, 0.24), smoothstep(0.66, 0.84, sgCr) * 0.3);
      sgCan = mix(sgCan, sgL2 * vec3(1.30, 1.05, 0.38), smoothstep(0.10, 0.0, sgCr) * 0.3);
      diffuseColor.rgb = mix(diffuseColor.rgb, sgCan, sgFar * 0.9);
      #endif`);
  };
  skin.customProgramCacheKey = () => '信貴山の斜面の皮';
  const blades = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39, lean = .3 + (i % 3) * .16, h = .5 + (i % 4) * .17, w = .04;
    const g = new THREE.BufferGeometry(), pos = [], idx = [];
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, r = lean * t * t, ww = w * (1 - t * .9), cx = Math.cos(a) * r, cz = Math.sin(a) * r, y = h * t;
      pos.push(cx - Math.sin(a) * ww, y, cz + Math.cos(a) * ww, cx + Math.sin(a) * ww, y, cz - Math.cos(a) * ww);
      if (s) idx.push(2 * s - 2, 2 * s - 1, 2 * s, 2 * s - 1, 2 * s + 1, 2 * s);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); blades.push(g.toNonIndexed());
  }
  const tuft = mergeGeometries(blades); tuft.computeVertexNormals();
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6d6046, roughness: 1, side: THREE.DoubleSide });
  const rock = new THREE.IcosahedronGeometry(1, 1), rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = .78 + sgHash(x * 3.1 + z, y * 2.7) * .4; rp.setXYZ(i, x * k * 1.1, y * k * .75, z * k); }
  rock.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ map: stoneTex(), color: 0x75716a, roughness: .93 });
  const X0 = -40, X1 = 34, Z0 = -78, Z1 = -6, D = .6;   // 門の西の縁の上（25秒の目のすぐ脇の土手）まで（10/30）
  const nx = Math.round((X1 - X0) / D), nz = Math.round((Z1 - Z0) / D), pos = [], col = [], uv = [], idx = [], tufts = [], rocks = [];
  const c = new THREE.Color(), soilC = new THREE.Color(.045, .036, .026), dryC = new THREE.Color(.1, .082, .05), mossC = new THREE.Color(.04, .047, .027);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = X0 + i * D, z = Z0 + j * D, y = H(x, z);
    const gx = (H(x + .5, z) - H(x - .5, z)), gz = (H(x, z + .5) - H(x, z - .5)), sl = Math.hypot(gx, gz);
    const nl = Math.hypot(gx, 1, gz), nX = -gx / nl, nY = 1 / nl, nZ = -gz / nl;
    const edge = Math.max(0, Math.min(1, Math.min(i, nx - i, j, nz - j) / 3));
    const steep = Math.max(0, Math.min(1, (sl - .25) / .35)) * edge;   // 道と平場（緩い所）は凹凸を出さない
    const lump = sgNoise(x * .4, z * .4) * .22 + sgNoise(x * 1.5 + 7, z * 1.5) * .1;
    const off = edge * (.05 + steep * lump) - (1 - edge) * .1;
    pos.push(x + nX * off, y + nY * off, z + nZ * off);
    uv.push(x * .4 + z * .12, z * .4 - y * .25);
    const patch = sgNoise(x * .3 + 3, z * .3), wet = sgNoise(x * .9, z * .9 + 5);
    c.copy(soilC).lerp(dryC, Math.max(0, Math.min(1, (patch - .35) / .35)) * (.4 + steep * .6)).lerp(mossC, Math.max(0, (wet - .6) / .4) * .7);
    c.multiplyScalar(.8 + sgHash(x * 9, z * 9) * .4);
    col.push(c.r, c.g, c.b);
    if (i && j) { const a = (j - 1) * (nx + 1) + i - 1, b = a + 1, cc = a + nx + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    if (steep > .5 && edge >= 1) {
      const h = sgHash(x * 3.7 + 1, z * 5.3);
      if (h < .3) tufts.push([x + (sgHash(x, z * 2) - .5) * D, z + (sgHash(z, x) - .5) * D, .7 + sgHash(z * 3, x) * .9]);
      else if (h > .975) rocks.push([x, z, .3 + sgHash(z, x * 3) * .6]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, skin); m.receiveShadow = true; m.matrixAutoUpdate = false; rt.scene.add(m);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), tint = new THREE.Color();
  const tm = new THREE.InstancedMesh(tuft, tuftMat, tufts.length);
  tufts.forEach(([x, z, k], i) => {
    e.set((sgHash(x, z) - .5) * .3, sgHash(z, x) * 6.28, (sgHash(x * 2, z) - .5) * .3); q.setFromEuler(e);
    tm.setMatrixAt(i, mtx.compose(p.set(x, H(x, z) - .04, z), q, s.set(k, k * (.8 + sgHash(x, z * 3) * .5), k)));
    const v = .75 + sgHash(x * 5, z) * .5; tm.setColorAt(i, tint.setRGB(v, v * (.95 + sgHash(z * 5, x) * .15), v * .9));
  });
  tm.castShadow = tm.receiveShadow = true; rt.scene.add(tm);
  const rm = new THREE.InstancedMesh(rock, rockMat, rocks.length);
  rocks.forEach(([x, z, r], i) => {
    e.set(sgHash(x, z) * 3, sgHash(z, x) * 6.28, 0); q.setFromEuler(e);
    rm.setMatrixAt(i, mtx.compose(p.set(x, H(x, z) - r * .6, z), q, s.set(r, r, r)));
  });
  rm.castShadow = rm.receiveShadow = true; rt.scene.add(rm);
  // 画面に入る株だけ・遠すぎる草は描かない（iPhone：草の三角が毎コマ十万を超えていた）
  W.viewCull([tm], 0, 48); W.viewCull([rm], 0, 70);
}

// 持ち場の正面にある南斜面の推定復元。三段の土の縁を地面へ差し込み、
// 道から離れた所だけに透ける二段貫を置く。準備時に三材質へまとめる。
function openingTerraces(rt) {
  const W = rt.world, soil = [], turf = [], wood = [];
  const box = (parts, x, y, z, w, h, d) => {
    const g = ROOM_BOX.clone().scale(w, h, d).translate(x, y, z); parts.push(g);
  };
  const clear = (x, z) => {
    for (const q of ROAD_SEGMENTS) {
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      if (Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t) < q.half + 3) return false;
    }
    return true;
  };
  for (const z of [GATE.z - 7, GATE.z - 20, TOP.z + 14]) {
    for (let x = -25; x < 25; x += 2) {
      if (![x, x + 1, x + 2].every((xx) => clear(xx, z) && clear(xx, z + 2))) continue;
      const a = W.heightAt(x, z), b = W.heightAt(x + 2, z);
      if (Math.abs(a - b) > 1.2) continue;
      const lower = Math.min(W.heightAt(x, z + 2), W.heightAt(x + 2, z + 2));
      const top = Math.min(a, b) + .12;
      if (top - lower < .6 || top - lower > 3.5) continue;
      // 上面は山へ食い込み、外面の裾も地中へ。白い独立した壁にはしない。
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        x, a + .08, z - .4, x + 2, b + .08, z - .4, x + 2, top, z + 1.7, x, top, z + 1.7,
        x, lower - .25, z + 2, x + 2, lower - .25, z + 2,
      ], 3));
      g.setIndex([0, 3, 2, 0, 2, 1, 3, 4, 5, 3, 5, 2]); g.computeVertexNormals();
      soil.push(g);
      box(turf, x + 1, top + .035, z + 1.55, 2.04, .09, .4);
      box(wood, x, top + .9, z + 1.25, .13, 1.9, .13);
      for (const h of [.55, 1.25]) box(wood, x + 1, top + h, z + 1.25, 2.1, .1, .12);
    }
  }
  for (const [parts, color] of [[soil, 0x433b2b], [turf, 0x414832], [wood, 0x77796e]]) {
    if (!parts.length) continue;
    const g = mergeGeometries(parts); for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true; rt.scene.add(mesh);
  }
  // 山頂と柵の稜線だけに斜めの冷たい月光。影の描画や毎コマの更新は増やさない。
  const moon = new THREE.DirectionalLight(0xb8cbea, .65);
  const y = W.heightAt(TOP.x, TOP.z);
  moon.position.set(TOP.x + 65, y + 85, TOP.z + 25);
  moon.target.position.set(TOP.x, y + 3, TOP.z);
  rt.scene.add(moon, moon.target);
}

// 曲輪へ降りる西の帯道だけ、崖へ出る所を低い木柵で区切る。分岐の口は塞がない。
// 組み立て時だけ柵の両側を読む。素手で越える二歩ほどの間に切岸があれば口へ回る。
function unsafeFenceClimb(W, seg) {
  const [ax, az, bx, bz] = seg, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 0.01) return true;
  const nx = -dz / len, nz = dx / len, n = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= n; i++) {
    const x = ax + dx * i / n, z = az + dz * i / n;
    const a = W.heightAt(x + nx * 1.6, z + nz * 1.6), b = W.heightAt(x - nx * 1.6, z - nz * 1.6);
    const y = W.heightAt(x, z);
    if (Math.max(a, b, y) - Math.min(a, b, y) > 1.5) return true;
  }
  return false;
}
function innerRails(rt, batch) {
  const first = ROAD.findIndex((p) => p[1] === GATE.z - 12);
  const end = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
  for (let i = first + 1; i <= end; i++) {
    const a = ROAD[i - 1], b = ROAD[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 5), nx = dz / len, nz = -dx / len;
    for (const side of [-1, 1]) for (let j = 1; j < n - 1; j++) {
      const t = (j + 0.5) / n, x = a[0] + dx * t, z = a[1] + dz * t;
      const fx = x + nx * side * (INNER_HALF + 1), fz = z + nz * side * (INNER_HALF + 1);
      if (Math.abs(rt.world.heightAt(fx + nx * side * 3, fz + nz * side * 3) - rt.world.heightAt(x, z)) < 2.1) continue;
      let mouth = false;
      for (const q of ROAD_SEGMENTS) {
        const u = Math.max(0, Math.min(1, ((fx - q.ax) * q.dx + (fz - q.az) * q.dz) / q.l2));
        if (Math.hypot(fx - q.ax - q.dx * u, fz - q.az - q.dz * u) < q.half + 0.5) { mouth = true; break; }
      }
      if (mouth) continue;
      const half = len / n * 0.5;
      const pts = [[fx - dx / len * half, fz - dz / len * half], [fx + dx / len * half, fz + dz / len * half]];
      for (const w of wallLine(rt, pts, { team: 1, hp: 1e9, name: '道脇の柵', h: 1.2, meshOpt: { h: 1.2, batch }, segLen: 6 })) { w.noTarget = true; w.wall = true; w.noClimb = true; }
    }
  }
}

// 本人へ寄る兵は段ごとに二人、門内では三人まで。後続は味方と戦い、道の外へ押し出さない。
function shigisanCombatSpace(army, u) {
  const p = army.playerUnit, F = army.shigisanFlags;
  if (!p?.alive || !F || u.team === p.team || u.noTarget || u.isStruct || u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || ((u.type === 'gun' || u.type === 'bow') && !u.sidearm)) return null;
  const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  if (d >= 12 || Math.abs(u.pos.y - p.pos.y) > 3) return null;
  if (u.target?.alive && u.target !== p && u.target.team === p.team) return null;
  const rest = F.sgRest;
  if (!rest && F.sgFront.includes(u)) return null;
  if (d >= 7 && u.target !== p && u.atk?.target !== p) return null;
  const q = u.sgWait;
  if (!q) return null;
  // 退き足は一歩ずつ。坂と柵で退けなければその場で構える。
  q.x = u.pos.x; q.z = u.pos.z; q.y = u.pos.y;
  if (d < 7 && d > 0.1) {
    const x = q.x + dx / d * 1.2, z = q.z + dz / d * 1.2, y = army.world.heightAt(x, z);
    q.x = x; q.z = z; q.y = y;
    if (!army.world.walkable(x, z) || Math.abs(y - u.pos.y) > 0.6 || army.wallBetween(u.pos, -1, q)
        || army.world.onRoad(u.pos.x, u.pos.z) && !army.world.onRoad(x, z)) {
      q.x = u.pos.x; q.z = u.pos.z; q.y = u.pos.y;
    }
  }
  return q;
}
function well(rt, x, z) {
  const y = rt.world.heightAt(x, z), parts = [];
  for (const side of [-1, 1]) {
    const a = ROOM_BOX.clone().scale(1.8, 0.65, 0.14).translate(x, y + 0.325, z + side * 0.83);
    const b = ROOM_BOX.clone().scale(0.14, 0.65, 1.8).translate(x + side * 0.83, y + 0.325, z); parts.push(a, b);
  }
  rt.scene.add(new THREE.Mesh(mergeGeometries(parts), ROOM_MAT));
  for (const g of parts) g.dispose();
  solidRect(x, z, 1.8, 1.8, 0); // 木枠の井戸の見た目と当たりを合わせる（場所・形は推定）。
}

// 信長公記巻十は信忠の下知で佐久間・羽柴・明智・丹羽が諸口から夜攻めしたと記す。
// https://ja.wikisource.org/wiki/信長公記
// 筒井・細川は片岡城攻めの記事に見える。城の参照表と既存の尾根道に合わせ、人数・攻め口の位置は補完。
// 松永の蔦は既存の近い蔦の紋で代える。
const JIN = [
  rosterPlan('山麓の包囲', 0, { x: 0, z: 142 }, Math.PI, [
    ['nobutada', '本陣', '織田信忠', 8000, 0, 142, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['tsutsui', '大手の仕寄り', '筒井順慶', 3000, TSUTSUI_CAMP.x, TSUTSUI_CAMP.z, 'umebachi', 'umebachi', 0, { bind: 'tsuCamp' }],
    // 11/6 fixc1845 布陣：筒井・明智・細川は法隆寺（城の東）に陣を取って先陣となった（battle_learn）。明智と細川は東の寺側へ、羽柴は西尾根の囲みへ。
    ['akechi', '東の寺側の仕寄り', '明智光秀', 5000, 70, 10, 'akechi', 'akechi', 200, { w: 24, d: 25, generalRear: true }],
    ['hashiba', '西尾根の囲み', '羽柴秀吉', 5000, -70, 20, 'oda', 'oda', 200, { w: 24, d: 25, generalRear: true }],
    ['hosokawa', '東の仕寄り', '細川藤孝', 3000, 60, 120, 'oda', 'oda', 220, { w: 26, d: 25, generalRear: true }],
    ['sakuma', '西の攻め口', '佐久間信盛', 5000, -106, -12, 'sakuma', 'sakuma', 160, { w: 22, d: 24, generalRear: true }],
    ['niwa', '東の攻め口', '丹羽長秀', 5000, 106, -12, 'sujikai', 'sujikai', 160, { w: 22, d: 24, generalRear: true }],
    ['reserve', '西の後備え', '織田信忠の配下（名は不明）', 6000, -60, 120, 'eiraku', 'oda', 220, { w: 26, d: 25, generalRear: true }],
  ], '信長公記巻十の夜攻め。両軍の総数・各備の人数・攻め口の位置は遊びの推定'),
  rosterPlan('尾根と曲輪の守り', 1, TOP, 0, [
    ['hisahide', '本陣', '松永久秀', 2200, TOP.x, TOP.z, 'todo', 'todo', 0, { bind: 'ehon.lord' }],
    ['mori', '城内の鉄砲組', '森好久', 200, TOP.x - 10, TOP.z + 4, 'todo', 'todo', 0, { bind: 'mori' }],
    ['gate', '大手の木戸', '松永久秀の配下（名は不明）', 1600, GATE.x + 8, GATE.z - 5, 'todo', 'todo', 0, { bind: 'arch' }],
    ['lower', '北尾根の下の曲輪', '松永久秀の配下（名は不明）', 1600, RIDGE1.x, RIDGE1.z, 'todo', 'todo', 0, { bind: 'rg1' }],
    ['upper', '北尾根の上の曲輪', '松永久秀の配下（名は不明）', 800, RIDGE2.x, RIDGE2.z, 'todo', 'todo', 0, { bind: 'rg2' }],
    ['yashiki', '松永屋敷', '松永久秀の配下（名は不明）', 1600, YASHIKI.x, YASHIKI.z, 'todo', 'todo', 0, { bind: 'ryk' }],
  ], '信貴山城の曲輪資料。守兵の人数・持ち場と森好久の内通は推定・伝承。朝護孫子寺に守備隊は置かない'),
];
// 包囲の備えと陣幕の周りだけを空ける。山腹全体を伐採した平場にはしない。
// 位置は備え表から一度だけ作り、兵の持ち場へ木を生やさない。
const CAMP_CLEARINGS = JIN[0].sonae.map((s) => ({
  x: JIN[0].honjin.x - s.at.right, z: JIN[0].honjin.z - s.at.front,
  hw: (s.w || 32) / 2 + 8, hd: (s.d || 32) / 2 + 8,
}));
// 今の攻め口の残敵だけを選ぶ。道案内と共用し、別の曲輪や屋内の久秀へ突進させない。
function shigisanFoe(rt) {
  const F = rt.flags, me = rt.player.u, p = me.pos;
  if (F.ending || rt.over || !me.alive) return null;
  // 同じコマでも寝返りや退却の下知が入る。前に選んだ兵にも敵の条件を確かめ直す。
  if (F.foePickT === rt.t && F.foePickStep === F.step && (!F.foePick ||
      F.foePick.alive && F.foePick.hp > 0 && F.foePick.team !== me.team &&
      !F.foePick.isStruct && !F.foePick.civ && !F.foePick.group?.civ &&
      !F.foePick.dying && !F.foePick.downed && !F.foePick.gone && !F.foePick.fleeing &&
      !F.foePick.woundOut && !F.foePick.noTarget && !F.foePick.invuln &&
      !F.foePick.group?.noAI && !F.foePick.group?.ambush &&
      !F.foePick.group?.retreatOnly && !F.foePick.group?.routed)) return F.foePick;
  F.foePickStep = F.step;
  F.foePickT = rt.t;
  const zone = F.step >= 3.5 ? F.SZ?.byId[F.step === 4 ? 'shu' : 'ridge1'] : null;
  let best = null, distance = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.hp <= 0 || u.team === me.team || u.isStruct || u.civ || u.group?.civ ||
        u.gone || u.dying || u.downed || u.woundOut || u.fleeing || u.noTarget || u.invuln ||
        u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || u.group?.routed) continue;
    if (F.step === 1 ? u.group !== F.amb : F.step === 3.2 ? u.group !== F.sally : !zone || !zone.test(u.pos.x, u.pos.z)) continue;
    if (zone && (!zone.test(p.x, p.z) || !F.castleGuideArrived)) continue;
    if (Math.abs(u.pos.y - p.y) > 3) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance && guideClear(rt, p, u.pos)) { best = u; distance = d; }
  }
  return (F.foePick = best);
}

// 10/31：時計だけで段を進めない。本人が歩いたか敵を討った後に限る（立っているだけで段が進まないように）
// 右上の①〜⑤（stages.js の shigisan と同じ字）
const SG_GOALS = ['尾根道の伏兵を討ち、大手の木戸へ登る', '大手の木戸を掛矢で打つ', '土橋で、打って出た松永勢を討つ', '北尾根の下の曲輪を取り、松永屋敷との道を断つ', '本丸の南口へ攻め入り、館の前を固める'];
const SG_START_GUIDES = ['fumotoT', 'fumotoS', 'tsu'];
// 持ち場で構える間（門脇の守り・木戸の前でそろう・曲輪と南口で構える）。行き先の印を持ち場のピンにする
function sgHolding(rt) {
  const F = rt.flags;
  if (F.ending || rt.over) return false;
  if (F.step === 2) return true;
  if (F.step === 3 || F.step === 3.2 || shigisanFoe(rt)) return false;
  if (F.step >= 3.5) return !!(F.castleGuideArrived && !F.castleGuideLeaving);
  return F.gateWaitT != null;
}
const shiPlayed = (rt) => rt.stats.kills > 0 || rt.stats.dist >= 20;
// 曲輪の制圧と同じく、地上で戦える守兵だけを数える。
// 倒れた兵や櫓の上の兵が残っても、確保済みの南口で終幕を止めない。
function honmaruDefendersGone(rt) {
  return rt.flags.last.every((g) => gone(g) || !g.units.some((u) => siegeFighter(u) &&
    Math.abs(u.pos.y - rt.world.heightAt(u.pos.x, u.pos.z)) < 3 &&
    Math.hypot(u.pos.x - TOP.x, u.pos.z - TOP.z) < TOP.r + 12));
}
// 南口を離れた後に、以前の滞在時間だけで城取りを認めない。
function honmaruPostReached(rt) {
  const F = rt.flags, P = rt.player.u.pos, z = F.SZ?.byId.shu;
  // 上階や切岸の下は、平面の座標が重なっても南口の持ち場ではない。
  if (rt.player.u.naka || Math.abs(P.y - rt.world.heightAt(P.x, P.z)) > 2.5) return false;
  // 南口に居る時間だけで、まだ敵の本丸を取ったことにしない。
  return F.step === 4 && F.lowerTaken && z?.owner === ZONE_STATE.FRIEND &&
    honmaruDefendersGone(rt) &&
    (z?.test(P.x, P.z) || Math.hypot(P.x - TOP.x, P.z - (TOP.z + TOP.r + 4)) < 10);
}
// 同じ道の同じ角で待つ期限は、兵が近づいたり離れたりしても延ばさない。
function waitForCastleAllies(rt, route, corner, near) {
  if (!(near > 16 && near < 90)) return false;
  const waits = rt.flags.guideWaits || (rt.flags.guideWaits = new WeakMap());
  let ends = waits.get(route);
  if (!ends) { ends = []; waits.set(route, ends); }
  if (ends[corner] == null) ends[corner] = rt.t + 25;
  return rt.t < ends[corner];
}
const shigisan = {
  resumeSteps: [[1, 'climb'], [2, 'tower'], [3, 'gateFight']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  terrainCameraLift: false, // 切岸の上へ持ち上げず、斜面の手前へ寄せて道を見る。
  selfFrameMinDistance: 2.5, // 柵際で寄った時は、本人の胴へ振り向かず前を見る。
  maxFramedFov: 65, // 狭い所で全身を収めようとして、陣笠を大きく歪めない。
  terrainLookWeight: 0.25, // 切岸を避けた直後も、本人の頭より進む道を優先する。
  // 門前で縁の上を見上げる間は、足を画面に入れるために見下ろし直さない（10/29 採点）。
  // 窪地の底を真上から見下ろさず、目の高さへ下げて縁の上の柵と櫓を画面の上に入れる（10/28 採点）。
  camLift: -.6,
  // 視点の地形回避は共通処理へ任せ、門前でも本人が向けた方角を保つ。
  hideMissionDots: true,
  // 顔を覚えていない時も黒い影を固定せず、撮れた本人の顔を一度だけ出す。
  waitForPortrait: true,
  // 行き先はいつも黄色の印一つ。青い「ついていく相手」を同時に出さない（AL・AS）。
  noLeaderFollow: true,
  // 共通の「味方の小勢・敵の小勢」（六人ずつ湧く見せかけ）は足さない（AQ・AT・AW6）。城兵は曲輪の持ち場の本物だけ。
  frontlineDensity: false,
  pinOnlyDestination: true,
  goalSignOnly: true, // 11/4：行き先は頭上の金の▼一つだけ（持ち場のピンの上向きの矢印を重ねない。AV15・BH6）
  singleDestinationArrow: true, // 行き先の印一つに、足元からの道の矢印を重ねない（⑧・AJ）。
  enemyTriangleSigns: true,
  forceBarAlways: true, // 両軍の人数の棒を、行き先の案内中も表示する。
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  quietMiss: true,
  noPlayerFoot: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  // 使番の知らせ・諸将の声・降伏拒否は、火の手や打って出の理由として戦の途中にも伝える。
  speechAllowed: (rt, who) => rt.over || !!rt.flags.ending ||
    /^(使番|信忠の使番|織田信忠|筒井順慶|筒井の侍|明智光秀|松永久秀|松永久通|松永の侍|組頭|足軽)$/.test(who),
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討死|討ち取|崩れ|三の丸から火の手/.test(text),
  // 11/6 fixc1429：右上の目標は①〜⑤を始めから全部並べ（stages.js の段・goals5）、段の中で言い替えない（九1・十1）。
  //   「敵を何人討つ」で埋めない（三1）。一行の札も今の段の字をそのまま出す。
  stageGoalsOnly: true,
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（11/9 徳川A：弱めて入れる。突然の討死は二つまで・三分過ぎから）
  missions: SG_GOALS,
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return 4;
    return F.step >= 4 ? 4 : F.step >= 3.5 ? 3 : F.step >= 3.2 ? 2 : F.step >= 2 ? 1 : 0;
  },
  missionHeading(rt) { return SG_GOALS[this.missionOf(rt)]; },
  missionSignTarget: shigisanFoe,
  foeMarkVisible(rt, u) { return u === this.commanderSignTarget(rt); },
  // 久秀は屋内で自害する大将。討取りの対象にせず、地図と戦場の大将印だけを出す。
  commanderSignTarget(rt) {
    const u = rt.flags.ehon?.lord;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying ? u : null;
  },
  missionPin(rt) {
    const F = rt.flags, p = rt.player;
    if (rt.over || !p.u.alive) return null;
    const q = F.missionPin || (F.missionPin = { always: true, silent: true, arrow: false });
    const enemy = shigisanFoe(rt);
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false;
    q.defend = false; q.route = false; q.gate = false; q.marker = null;
    q.r = q.hide = .5; q.y = undefined;
    // 落城の語りの間も、燃える天主を見上げる案内を残す。
    // 通常の行き先は終幕で止めるため、天主の印をここで直接返す。
    if (F.ending) {
      const keep = rt.markers.find((m) => m.id === 'keep');
      if (!keep) return null;
      q.key = 'keep'; q.marker = keep; q.route = true;
      q.x = KEEP_AT.x; q.z = KEEP_AT.z;
      q.y = rt.world.heightAt(q.x, q.z) + KEEP_AT.up + 2;
      return q;
    }
    if (enemy) {
      if (p.inRange && p.rangeCueTarget === enemy) return null;
      q.key = 'foe'; q.unit = enemy; q.enemy = true;
      q.x = enemy.pos.x; q.z = enemy.pos.z;
      return q;
    }
    const id = this.guideMarker(rt);
    const marker = rt.markers.find((m) => m.id === id);
    let pos = marker && (typeof marker.pos === 'function' ? marker.pos() : marker.pos);
    const defending = sgHolding(rt);
    const postArrived = defending && F.step === 2 && towerPostReached(rt);
    // 着いた後も持ち場のピンを残す。敵が消えた同じコマで守りへ替える。
    if (defending && id !== 'enjou') pos = F.step === 2 ? F.approachByRoad && !postArrived ? F.approachGuide : TOWER_POST
      : F.step === 1 ? F.gateGather : F.castleGuidePoint;
    if (!pos) return null;
    q.key = id; q.marker = marker; q.x = pos.x; q.z = pos.z; q.y = pos.y;
    // 守る範囲を白い破線の輪と小旗で囲まない（10/28 採点）。ピン一つで示し、判定の半径は変えない。
    q.waiting = defending; q.defend = false; q.route = !defending;
    q.gate = F.step === 3; q.r = q.hide = defending ? 1.1 : .5; // 輪だけ小さくし、持ち場の判定は保つ。
    q.arrived = defending && (F.step === 2 ? postArrived
      : Math.hypot(p.u.pos.x - q.x, p.u.pos.z - q.z) < 3.2);
    return q;
  },
  introText: '筒井の先手と尾根道を登り、大手の木戸を掛矢で打つ。打って出た松永勢を退け、本丸の南口へ攻め入る。',   // 11/5：断りの一文をやめた（五4）
  compactIntro: true,
  introTaskFirst: true, // 城の紹介より先に、最初の下知と勝つ条件を読む。
  noticeOnce: true, // 同じ下知・使番の知らせは一戦に一度だけ。
  sideTaskAfter: Infinity, // 櫓の中を取る別任務で、打ち手の守りと曲輪取りを邪魔しない。
  battleVoices: { lines: { ally: {
    ambient: ['信貴山の城を囲んでおる。先手と進め', '尾根道では前の仲間に続け', '松永勢は曲輪におる。槍をそろえよ'],
    order: ['信忠「諸口の味方と寄せよ。尾根の口を押さえよ！」'],
  }, enemy: {
    ambient: ['松永の城を守れ。木戸を渡すな！', '久秀様と久通様は本丸の館におられる。持ち場を守れ！'],
    push: ['尾根の口で押し返せ！'],
    waver: ['次の曲輪へ下がれ。列を立て直せ！'],
  } } },
  noHorse: true, // 山城の細い石段を登る。徒歩で出る
  // 坂や櫓を避けた後も、本人の胴が下端から消えるほど空を見上げない（328巡目）。
  // 見回し・狙い・屋内・終幕は元の視点を使う。方向用のベクトルは門前と共用する。
  frameRoadCamera(rt, camera) {
    const P = rt.player, u = P.u;
    if (!SETTINGS.autoCam || !u.alive || u.naka || rt.over || rt.flags.ending || rt.game?.photo ||
        P.aiming || P.lock || P.cine || P.camShot || P.camFixed || P.overHold || P.fpK > .01 || (P.lookIdle || 0) < .7) return;
    const look = rt.flags.entranceLook;
    camera.getWorldDirection(look);
    const span = Math.max(.001, Math.hypot(look.x, look.z));
    if (Math.hypot(look.x, look.z) < .001) {
      const yaw = P.yaw + (P.camYawOff || 0);
      look.x = Math.sin(yaw) * span; look.z = Math.cos(yaw) * span;
    }
    const distance = Math.hypot(camera.position.x - u.pos.x, camera.position.z - u.pos.z);
    const halfFov = Math.atan(Math.tan(camera.fov * Math.PI / 360) / camera.zoom);
    const bodyPitch = Math.atan2(u.pos.y + 1.2 - camera.position.y, Math.max(.5, distance));
    const maxPitch = Math.min(.2, bodyPitch + halfFov * .7);
    if (Math.atan2(look.y, span) <= maxPitch + .000001) return;
    look.y = span * Math.tan(maxPitch);
    look.add(camera.position);
    camera.lookAt(look);
  },
  // 門前では地形回避の押し上げを短い肩越しへ戻し、山頂まで空を残す。
  // 描く地面も調べ、背後が斜面なら高く逃げず本人へ寄る。
  frameCastleEntrance(rt, camera) {
    const P = rt.player, u = P.u, W = rt.world, p = u.pos;
    if (!u.alive || u.naka || rt.over || rt.game?.photo || P.aiming || P.fpK > .01 ||
        P.lookIdle < .7 || p.z < GATE.z - 3 || Math.hypot(p.x - OPEN_PT[0], p.z - OPEN_PT[1]) > 70) return;
    const yaw = P.yaw + (P.camYawOff || 0), sx = Math.sin(yaw), sz = Math.cos(yaw);
    const eye = rt.flags.entranceEye, look = rt.flags.entranceLook;
    // 尾根の伏兵と斬り合う間（10/30）：筒井の手の頭越しに見下ろし、目の前の乱戦を画面に入れる（上を向いて城だけを写さない）
    const F = rt.flags, ambFight = F.amb && (F.step | 0) <= 1 && ambLive(F.amb);
    // 10/31：3.4m では本人に重なる筒井の手の頭と背旗に伏兵が隠れた。もう一段高く、少し見下ろして頭越しに斬り合いを入れる。
    eye.set(p.x, p.y + (ambFight ? 4.6 : 2.35), p.z);
    camera.position.copy(eye);
    for (let d = .5; d <= 4.5; d += .5) {
      const x = p.x - sx * d, z = p.z - sz * d;
      const floor = Math.max(W.heightAt(x, z), drawGroundAt(W, x, z));
      if (floor + .8 > eye.y) break;
      look.set(x, eye.y, z);
      camera.position.copy(look);
    }
    const hit = P.camBlockHit(eye, camera.position);
    if (hit !== null) camera.position.lerpVectors(eye, camera.position, Math.max(0, hit - .12));
    // 足元の印へ視線を落とさず、門の上に主郭と望楼を重ねる。
    const distance = Math.hypot(TOP.x - p.x, TOP.z - p.z);
    const rise = ambFight ? -.2 : Math.max(.08, Math.min(.32, (W.heightAt(TOP.x, TOP.z) + 3.5 - eye.y) / Math.max(1, distance)));
    look.set(p.x + sx * 18, eye.y + rise * 18, p.z + sz * 18);
    camera.up.set(0, 1, 0); camera.lookAt(look);
    P.camPos.copy(camera.position);
  },
  jinkei: JIN,
  // 共通の民の描画・兵と火の接近判定を使う。兵数・当たり・戦功には入れない。
  // 山の高低差と個別の再避難路を使い、小谷の里道専用の逃走へ切り替えない。
  // 地面の焚火（大きさ1.3）も避け、篝火（大きさ0.7）は見物を妨げない。
  // 見物は兵四十歩・地面の火二十二歩の外から。歩く兵が近づいても四十歩で逃げる。
  // 山門・畦の曲がり角では道沿いの距離で子・年寄りを待つ。再避難でも安全な大人が付き添う。
  // 親子・年寄りの組は初めに遅い人の走る速さへそろえ、大人だけが先行して待つ動きを抑える。
  // 近景も七人分を使い回し、里の町人・商人を百姓へ替えない。
  // 門・櫓や退場済みの兵を見物せず、軽い包囲兵も含めて尾根・柵・民家の壁に隠れない兵へ顔を向ける。
  // 山門・民家の角では、組から隠れても本人に見える兵を探し直す。
  // 待ち場所では二分歩以内まで進む。前後の到着のずれを含めても、一・四歩の間隔を九分歩より広く保つ。
  // 初めの場所が危険なら下り道を八歩以内ごとに探し、近い安全な所で親子そろって待つ。
  // 迂回して角を越えた民は、六歩以内の通れる次の角へ合流し、危険な角へ逆戻りしない。
  // 家並み・井戸・斜めの柵の外接四角で、実際には通れる参道や畦を塞がない。
  // 歩き先は五分の一秒ごとに再確認し、移動した兵や新しい火へ走り込み続けない。
  // 落城後も寺と里の火を見張り、まだ下り道にいる家族の避難を続ける。
  civilianCrowd: { evacuateAfterBattle: true, groundAllowed: peopleGroundAllowed, preciseSolids: true, presentSoldiersOnly: true, watchLightSoldiers: true, bands: PEOPLE_BANDS, watchRouteFallback: true, watchRouteStep: 8, modelKinds: ['farmer', 'woman', 'child', 'monk', 'elder', 'merchant', 'townsman'], watchDistance: 40, approachDistance: 40, watchFires: true, fireSize: 1, individualDanger: true, escapeDanger: true, heightAware: true, preciseRoute: true, reachableRoute: true, rejoinRoute: true, recheckEscapeStep: true, refugeSpacing: 1.4, refugeReach: 0.2, continueFromRefuge: true, personalSpace: 0.9, watchSoldiers: true, watchSight: true, individualWatch: true, watchBuildings: true, keepTogether: true, keepFamiliesTogether: true, familyGap: 8, familyAlongRoute: true, familyAfterRefuge: true,
    // 寺と里の者が同じ畦へ合流しても、待つ家族や前の人をすり抜けない。
    // 道選びと実際の歩みに同じ間隔を取り、空いた道脇へ回る。
    keepCivilianSpacing: true, moveSpacing: 0.85,
    // 近い組の逃げ始めにも気付く。尾根・堂・家並みの陰では十二歩以内の声だけ届く。
    // 合図は三秒で切り、山の反対側や遠い里まで一斉に逃げ出させない。
    neighborAlarmDistance: 24, neighborAlarmDuration: 3, noticeHearingDistance: 12, watchTerrainSight: true,
  },
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noAvHost: true, // 11/5 専門家の目：隊の後ろの軽い段を付けない（筒井の陣の旗本・本丸の北に描いた兵の段が重なった。小谷・三木と同じ）。
  noTaisho: true, // 自害の戦を、共通の城主討取り勝利にしない。両将はこの戦で置く。
  noWake: false, // 包囲の同じ兵を近い所から本物へ替える。城の守備は増やさない。
  noReserve: true, // 麓の兵を主人公の補充兵へ変えない。
  wakeRoom: 247, // 包囲の交代兵を含め、実兵は二百五十人ほどまで。
  openingSafe: 12, // 下知と敵の姿を確かめる間は、手傷と落馬を防ぐ。
  // 11/6 fixc0814：attackWarningDelay（向きの合図から一秒は当てない）をやめた。八秒より間を空けて射る弓・鉄砲は一発ごとに合図からやり直しになり、
  //   門前の矢玉も曲輪の槍も本人に一度も当たらず、始めから勝ちまで命が百のままだった（描いて遊んだ写真と流しで当たり0回。十3・二3）。
  meleeThreatRange: 4.5, // 別の段や離れた控えを、目前の打ち手として囲まない。
  meleeThreatHeight: 3,
  releaseGuardForAttack: true,
  waitGuardButtonText: '押し続けて ふせぐ',
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (enemy.playerOpeningBlocked || enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        !localClear(rt.army, enemy.pos, u.pos, true)) return false;
    // 別の兵が打ち込む時は守りを保つ。打ち終わりだけ、構えの長押しを解いて反撃へ。
    for (const e of rt.army.units) {
      if (e.team === u.team || !e.alive || e.fleeing || e.woundOut || e.gone || e.noTarget || e.playerOpeningBlocked) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.abs(e.pos.y - u.pos.y) < 3 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          localClear(rt.army, e.pos, u.pos, true)) return false;
    }
    return true;
  },
  armySignals: false, // 合図は siegeSignal で鳴らす。「敵を退け」を味方の退却と誤読させない。
  compactThreats: true, // 「前・敵の槍」だけでなく、向きと防ぎ方を短く伝える。
  avoidWaymarkThreats: true, // 危険札は尾根道の印と距離を覆わない。
  strictHits: true, // 続けて打たれた時も、手傷を自動で軽くしない。
  enemyTactics: { advance: false, withdraw: false, flank: false, reinforce: false },
  botOrders: true, // 柵の口への回り道・門の外の持ち場を、遊び手の突進で上書きしない。
  taskDetails: true, // 門の操作と曲輪の守りの進み具合を、携帯でも読めるようにする。
  keepCombatTask: true, // 避ける操作中も、打ち手の守りや曲輪取りの下知を残す。
  keepCombatTaskHeading: true, // 接敵の押し方へ替えず、門や曲輪で果たす下知を残す。
  keepCombatTaskDetail: true, // 斬り合いの案内中も、任務の進み具合と補足を残す。
  keepTaskPanel: true, keepApproachTaskPanel: true, // 敵の位置へ札を移さず、同じ知らせ欄で読む。
  keepTaskWithGuard: true, keepGuardTaskLabel: true, // 構えている間も、門の打ち手や曲輪を守る下知を残す。
  keepTaskWithDodge: true, // 回避の札だけにせず、今の持ち場も残す。
  keepOpeningTaskLabel: true, // 指の動かし方で、最初の行き先を消さない。
  keepTaskLabel: true,
  keepDestinationTask: true,
  keepFlagTravelTask: true, keepFlagArrivalTask: true,
  // 先手を待つ印へ向かう時も、指の操作だけで曲輪取りの下知を消さない。
  waitTravelLabel(rt) { return this.taskLabel(rt, '先手の旗に続け'); },
  hideGuideSteps: true, // 尾根の敵と戦う札へ、遠い旗の直線距離を差し込まない。行き先は道の印で示す。
  immediateTaskChanges: true,
  distanceUnit: 'steps',
  distanceText: () => '',
  taskDetail: () => '',
  keepRetreatReason: true, // 「わを見て」へ縮めず、仲間の後ろへ下がる指図を保つ。
  // 止血した浅い傷は任務へ戻す。傷そのものと歩み・槍への影響は残す。
  // 表示と道案内が別の退避判定を持つと、命が十分でも終戦まで下がれと出続ける。
  woundRetreatNeeded(rt) {
    const u = rt.player.u;
    return u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.3 || u.woundSlow > 0.25 || u.armWound > 0.25;
  },
  treatmentGuideNeeded(rt) {
    const p = rt.player, u = p.u;
    return p.treatmentLeft > 0 && !(p.treatmentNext > rt.t) &&
      (u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.6);
  },
  // 口へ着いたら道順より守兵との戦いを示す。別の段の敵を追わせない。
  castleFightNeeded(rt) {
    const F = rt.flags;
    if (F.castleGuideLeaving) return false;
    if (F.ending || !F.castleGuideArrived || F.step !== 3.5 && F.step !== 4) return false;
    const zone = F.SZ?.byId[F.step === 4 ? 'shu' : 'ridge1'];
    const player = rt.player.u, p = player.pos;
    if (!zone || !zone.enemies || !zone.test(p.x, p.z)) return false;
    // 郭の奥や柵の向こうに残る人数だけで、空き地に反撃を命じない。
    // 同じ持ち場で、目前に見え、槍を交わせる高さと通り道の敵だけを見る。
    for (const u of rt.army.units) {
      if (u.team === player.team || !u.alive || u.isStruct || u.fleeing || u.woundOut || u.downed || u.gone || u.noTarget ||
          u.group?.noAI || u.group?.ambush || u.group?.retreatOnly || u.group?.routed || u.group?.order === 'flee') continue;
      if (Math.abs(u.pos.y - p.y) > 3 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 12 || !zone.test(u.pos.x, u.pos.z)) continue;
      if (localClear(rt.army, p, u.pos, true) && sightUnit(rt, u)) return true;
    }
    return false;
  },
  // 道案内を空き地への退避で消さない。深手・疲れ・近い敵・射撃予告は守りを優先。
  routeGuidePriority(rt) {
    const F = rt.flags, p = rt.player, u = p.u;
    // 打ち合いの余韻だけで退かせない。手当て済みの浅手は、傷が残っても任務へ戻す。
    if (F.ending || F.step < 1 || this.castleFightNeeded(rt) || this.woundRetreatNeeded(rt) || this.treatmentGuideNeeded(rt) ||
        u.mobbed || p.sta < 20 || rt.t < (rt.retreatUntil || 0)) return false;
    for (const enemy of rt.army.units) {
      if (enemy.team === u.team || !enemy.alive || enemy.fleeing || enemy.woundOut || enemy.gone || enemy.noTarget || enemy.isStruct ||
          enemy.downed || enemy.dying || enemy.playerOpeningBlocked || enemy.group?.noAI || enemy.group?.ambush ||
          enemy.group?.retreatOnly || enemy.group?.routed || enemy.group?.order === 'flee') continue;
      const dx = enemy.pos.x - u.pos.x, dz = enemy.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 4.5 * 4.5 && Math.abs(enemy.pos.y - u.pos.y) < 3 && localClear(rt.army, enemy.pos, u.pos, true)) return false;
      if (d2 < 8100 && enemy.shotWarnUntil > rt.army.time && sightUnit(rt, enemy)) return false;
    }
    return true;
  },
  // 退く印も実際に歩ける道へ限る。仲間の後ろでも切岸へ下ろさない。
  retreatPointAllowed(rt, point) {
    return rt.world.onRoad(point.x, point.z) && guideClear(rt, rt.player.u.pos, point);
  },
  retreatGuideLabel(rt, reached) {
    // 退く間は今の一手だけ。次の行き先は任務の説明に残し、携帯で二行に割らない。
    if (this.woundRetreatNeeded(rt)) return reached ? '手傷が深い。構えよ' : '手傷が深い。味方へ';
    if (rt.player.u.mobbed) return reached ? '味方と囲みを防げ' : '囲まれた。味方へ退け';
    if (rt.player.sta < 20) return reached ? '止まり、息を整えよ' : '息切れ。味方へ下がれ';
    return reached ? '味方の後ろで構えよ' : '味方の後ろへ下がれ';
  },
  dodgeGuideLabel: (_rt, arrived, rain) => rain
    ? arrived ? 'ここで構え、矢をやり過ごせ' : '矢印の方へよけよ'
    : arrived ? 'ここで槍を構えよ' : '敵から少し離れよ',
  // 矢の雨は別の表示口を使う。実物の旗へ逃げる下知と取り違えない。
  rainDodgeGuideLabel: (_rt, arrived) => arrived ? 'ここで矢をやり過ごせ' : '矢印の方へよけよ',
  dodgeActionText: '押し続ける', // 横画面の札で末尾の「る」だけを次の行へ落とさない。
  dodgePointAllowed(rt, point) {
    return this.retreatPointAllowed(rt, point);
  },
  dodgeTurnLabel: (rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞり、退く先を見る`
    : `手元の操作器を${right ? '右' : '左'}へ動かし、退く先を見る`,
  dodgeTurnDuration: 3.5,
  pauseTurnPractice: false, // 振り向く手ほどきでも合戦を止めず、案内は短時間だけ添える。
  dodgeAvoidNotices: true, // 携帯の退避札と指の絵も、任務の札を避ける。
  taskLabel(rt, text) {
    const F = rt.flags;
    if (F.ending || F.step < 1) return text;
    if (F.paceEnjou && !F.enjouDone) return '火の回った本丸の南口の外で、味方と口を固めよ';
    if (F.step === 1 && F.gateWaitT != null) return '門前で先手を待て';
    if (F.castleGuideBlocked) return '崖を避け、来た道へ戻れ';
    if (F.castleGuideLeaving) return rt.player.u.nakaLevel > 0 ? '階段を下り、戸口から尾根道へ戻れ' : '建物の戸口から尾根道へ戻れ';
    if (F.castleGuideDetouring) return '建物や柵を回り、道の印へ';
    if (F.castleGuideReturning) return '道の印へ。そこから尾根道を進め';
    if (F.step < 3.5 && F.climbReturning && (F.step === 1 || F.approachByRoad)) return '尾根道の印へ戻れ';
    // 接敵後も「進め」だけでは、目前の敵を素通りしてよいように見える。
    if (F.step === 1) return F.ambSeen && ambLive(F.amb)
      ? '先手と尾根の敵を退けよ' : '先手と尾根道を進め';
    if (F.step === 2) return '門の右脇で打ち手を守れ';
    if (F.step === 3) return '門の印で、掛矢を使い続けよ';
    if (this.castleFightNeeded(rt)) return F.step === 4 ? '先手と本丸の敵を討て' : '先手と曲輪の敵を討て';
    if (F.castleGuideArrived) return F.step === 4 ? '先手と本丸の南口を守れ' : '先手と曲輪を取れ';
    return F.step === 4 ? '西の尾根道から、本丸の南口へ' : '門を抜け、西の道から曲輪へ';
  },
  waitOrderLabel(rt) { return this.missionHeading(rt); },
  compactFieldGuides: true, // 兵や退き道を太い輪で覆わず、小さな印で示す。
  compactCombatGuides: true, // 敵へ向く矢印を短くし、近い兵の胴や槍を隠さない。
  compactDodgeGuide: true, // 回避先の旗・輪・矢印を小さくそろえ、足元を空ける。
  compactFloorGuides: true, groundCombatMarkers: true, // 退く先の輪は小さく地面に沿わせる。切岸越しには描かない。
  singleRetreatArrow: true, // 回避も退避も短い矢印一本。兵の列を横切る点線を重ねない。
  retreatArrowLength: 90, // 退く向きは足元の短い線で示し、兵や尾根を横断しない。
  escapePlaceLabel: (_rt, rain, side) => rain ? `${side}へよけ、矢を避けよ` : '退く先の印へ',
  compactRetreatArea: true,
  smallTaskAreas: true, smallRetreatAreas: true, // 門前の持ち場も退く範囲も、小さな地面の印で示す。
  compactDestinationArea: true,
  subtleTargetFrames: true, // 狙う相手は細い隅の印で示し、太い四角で具足を囲まない。
  hidePlayerSign: true, // 肩越しに見える本人の白輪を消し、足の接地と尾根道を見せる。
  noUnitContrast: true, // 胴に重なる白い人形の線を消し、具足と姿勢で本人を見せる。
  nearSceneryScreenCut: false, // 画面中央の四角で門の柱・屋根を切らない。目の直前の面だけ避ける。
  nearAllyFadeRadius: 2.2,
  nearAllySolidBody: true, // 視点を味方の体から避け、顔・胴・具足を別々に透かさない。
  nearAllyWholeOcclusion: true, // 本人を隠す味方も全身で避け、首や得物だけを宙に残さない。
  groundLockRing: true, // 狙う相手の輪も尾根の傾斜へ沿わせ、坂から浮かせない。
  coverGuidePlace: true, // 射線を遮る柱や壁を、存在しない旗と呼ばない。
  // 遠い柵や山肌で止まった射線を、足元の物かげと取り違えない。
  // 道から歩いて届き、胸と頭を守る実物が二歩ほど以内にある所だけ案内する。
  coverHitAllowed(rt, hit, point, shooter) {
    return !!hit.object && (1 - hit.q) * Math.hypot(point.x - shooter.pos.x, point.z - shooter.pos.z) <= 2.25
      && guideClear(rt, rt.player.u.pos, point);
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.castleGuideLeaving) return rt.player.u.nakaLevel > 0 ? '下り階段へ' : '戸口から外へ';
    if (F.castleGuideDetouring) return '回り道の印へ';
    if (F.castleGuideReturning) return '道へ戻る';
    if (F.step < 3.5 && F.climbReturning && (F.step === 1 || F.approachByRoad)) return '尾根道へ';
    return F.step === 1 ? '尾根道へ' : F.step === 2 ? '門の右脇へ'
      : F.step === 3 ? '門の正面へ' : F.step === 3.5 ? '曲輪の入口へ' : '本丸の南口へ';
  },
  immediatePhaseTasks: true,
  largeWaymarks: true, // 夜の尾根でも、戻る向きと曲がり角の名を読み取れるようにする。
  singleDestinationArrow: true, // 足元を指す下矢印と、進む向きの上矢印を重ねない。
  compactDestinationSign: true, // 携帯の近い兵や槍を、大きな行き先の矢印で覆わない。
  groundFlagGuides: true, footFlagGuides: true, // 先手の幟を白い大輪で囲まず、根元の小旗で示す。
  avoidDestinationNotices: true, // 行き先が任務札と重なる時は、空いている側で向きを示す。
  avoidAllDestinationNotices: true, // 道の印が旗の形でも、任務札や退く操作の札を避ける。
  // 文と印の名が違っても、今の段の行き先を必ず選ぶ。敵の印へ直進させない。
  guideMarker(rt) {
    const F = rt.flags;
    if (rt.over) return null;
    if (F.ending) return rt.markers.some((m) => m.id === 'keep') ? 'keep' : null;
    // 麓の段にも行き先を出す。倒れた物見の印は飛ばし、下知後は先手の旗を優先する。
    if (F.step < 1) {
      for (const id of SG_START_GUIDES) {
        const marker = rt.markers.find((m) => m.id === id);
        const pos = marker && (typeof marker.pos === 'function' ? marker.pos() : marker.pos);
        if (pos) return id;
      }
      return null;
    }
    // 炎上中は館の前から南口の外へ退く。古い道の終点で待たせない。
    if (F.paceEnjou && !F.enjouDone) return 'enjou';
    if (F.castleGuideBlocked) return null;
    // 尾根で戦う間は敵の奥へ進ませない。道へ戻る時と門前待機は印を残す。
    if (this.taskLabel(rt, '') === '先手と尾根の敵を退けよ' || this.castleFightNeeded(rt)) return null;
    return F.step === 1 ? 'climb' : F.step === 2 ? 'tower' : F.step === 3 ? 'gate'
      : F.step === 3.5 ? 'rg1' : F.step === 4 ? 'honmaru' : null;
  },
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（稲生の標準。kaito 10/24「動かない味方と敵は一切排除」）
  noControlsHelp: true, // 操作の字（なぞって動く・つく）は出さない（操作は尾張の戦で覚える。kaito 10/20）
  // 持ち場では、門の櫓と山頂の天守の間を向く。最初の画面に櫓・東の切岸の柵・天守が入る（10/28 資料との差：天守と段が画面に無い）。
  spawn: { x: OPEN_PT[0], z: OPEN_PT[1], heading: Math.atan2(TOP.x + 4 - OPEN_PT[0], TOP.z + 10 - OPEN_PT[1]) },
  // 身の回りの当時の場（timeslip_field.js）。天正五年十月十日は今の十一月半ば・晩秋の山城の夜。
  // 尾根道と曲輪は乾いた土に落ち葉と折れ枝、枯れた尾花。門前と曲輪の口ほど倒れた槍・矢・松永方の旗が散る。切岸と石垣の面には置かない。
  timeslip: {
    // 折れ枝は坂で長い枝が宙に浮き、葉の塊と合わせて緑の金槌に見えた。置かない。
    wet: 0, dust: 0.35, trample: 0.3, debris: 1, arrows: 0.8, branches: 0,
    grass: 0x8c7e52, grassTints: [0xffffff, 0xe4d0a0, 0xc8b48a], grassH: 1.15, tallGrass: 1.3, // 平場の縁に枯れ尾花の株を密に（一面の黄土にしない）
    flagColors: [0xe4ded0, 0x22201c, 0x4a5a3a],
    fights: [[GATE.x, GATE.z + 8, 30], [TOWER_POST.x, TOWER_POST.z, 22], [RIDGE1.x, RIDGE1.z, 26], [TOP.x, TOP.z, 30]],
    skip: (x, z) => { const W = SG_TS.world; if (!W) return false; const h = W.heightAt(x, z); return Math.abs(W.heightAt(x + 1.5, z) - h) > 1 || Math.abs(W.heightAt(x, z + 1.5) - h) > 1; },
  },
  // 11/1：共通の既定（本人へ四人が同時に打つ・構えずに受けた一太刀は命の五割）で bot が倒れて負けた。寄せる数・敵の強さ・大軍の見た目は変えず、
  //   一太刀を三割五分（侍は四割強）に、刃を受けた後の2.2秒は次の刃を通さない（同じ一瞬に二太刀・三太刀を浴びない）。
  cutFloor: 0.7,
  meleeGrace: { rate: 1, burst: 1, interval: 2.2 },
  world: {
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定は四人・player_pressure.js）
    seed: 15770,
    groundHalf: 420, // 北端の屋敷の切岸まで。草木・実兵の数は増やさない。
    maxWalkDrop: 1.2, // 列を避ける一歩で切岸へ下りず、尾根道と木戸を通る。
    terrainTriangles: true, // 兵と門の足元を、見えている地面の三角形へそろえる。
    keepTerrainGrid: true, // 携帯でも足場と同じ格子。粗い地面の切岸に人物と道を埋めない。
    armyHeightLOD: true, // 麓と山上の控えは、高低差も含めて遠い兵の細部を省く。
    nearAllyFadeRadius: 2.2, // 共通の部分隠しを止め、この戦の全身での視点よけにそろえる。
    noHorse: true, // 軍勢も徒歩。武将や後から現れる兵を細い尾根へ騎馬で送らない。
    distantFootOnly: true, // 軽い包囲兵の大将も徒立ちにし、尾根へ馬を混ぜない。
    naturalArrowRain: true, // 遠矢を太い黒い棒へ拡大せず、実寸と夜の霧で見せる。
    arrowRainPerBow: 1, // 少数の守弓から数十本を増やさず、射手の人数に合わせる。
    enemyArrowWarnings: true, // 味方の斉射で持ち場を離れさせない。矢と当たりは残す。
    arrowRainGroundCue: false, // 門前を白黒の太い帯で囲まない。矢の影・警告・退き先の案内は残す。
    noGroundArrows: true, // 一本ずつの矢も一斉射ちも、外れ矢を門前へ積み重ねない。
    moveLim: 410, // 北端の屋敷へ実際に歩いて入れる範囲。城や兵の大きさは変えない。
    fieldStage: 'stubble',
    paddy: (x, z) => x > 84 && x < 130 && z > 164 && z < 204 ? 1 : 0,
    time: 'night',
    // 11/6 fixc1429（critic60「ずっと曇りの昼」・四6）：上げ過ぎた月明かりを夜へ戻す。十日の月（半月過ぎ）に照らされた尾根と、
    //   篝火・三の丸の火・天主の火が浮く暗さ。空と霧は鉛色でなく夜の紺鼠。兵と城の輪郭は月の縁で読む。
    // 11/6 fixc0814（描いて遊んだ④⑤の林の帯道）：月の直射が強く、木の影がくっきり落ちる明るい地面が曇りの昼に見えた（八1・四6）。月を半月過ぎの淡さへ。
    nightLift: 1.7,
    nightFill: 0.75,
    nightMoonMin: 0.9,
    nightLight: { hemiSky: 0x5f6878, hemiGround: 0x2e3326, sky: 0x1b2230, fog: 0x1c232d, top: 0x090d15 },
    lowNightExposure: 1.6,
    unitNightScale: 0, // 兵だけの白い縁取りを止め、道と同じ月光・篝火で漆と布を照らす。
    fogFar: 310, // 月明かりの尾根越しに、城の櫓の輪郭を見せる。
    treePadMul: 1.2, // 幹は道の半幅六歩より外。折り返しの外の林縁を近づける。
    cedarBoughs: true, raggedPineCrowns: true, // 共通の枝房を使い、杉の大きな葉幕と松の水平な板の縁を崩す。
    nearTreeFadeRadius: 8, // 肩越しの視点から尾根までをふさぐ近い幹・葉房を透かす。木の数や当たりは保つ。
    autumn: true, // 枯草と葉の残る雑木。山全体を冬枯れの裸地にしない。
    autumnLeafMix: 0.4, // 10/31 点付け：手本（docs/layout-ref/shigisan/）は緑の山に紅葉が混じる。山を赤茶一色にせず緑を主に。
    treeMix: { sugi: 0.24, matsu: 0.62 }, // 杉ばかりの尖った列にせず、松と雑木の樹冠を交ぜる。
    slopeForest: 0.65, cliffRock: 0.18, // 道の土を保ち、切岸には林床・苔・露岩の斑を残す。
    slopeForestTint: true, // 既存の山肌の色で沢の陰と緑褐色の斑を残し、一面の裸土を抑える。
    muddy: 0.3,
    softEarthCrust: true, // 土塊の陰を塊の縁に限り、山道を四角い板の継ぎ目にしない。
    stableSlopeGrain: true, // 坂の細かな起伏で土の模様を細い縞へ引き延ばさない。
    stableCliffGrain: true, // 切岸の苔も連続した座標で読み、面の曲がり目で細い筋にしない。
    // 兵数・間隔・移動速度・技の時計は保ち、山道の歩調と槍衾の息だけをずらす。
    variedMarch: true, livingSpearHedge: true,
    noHaori: true, // 足軽を主にし、武将にも陣羽織と母衣を足さない。
    variedInfantry: true, // 貸し具足の仕立て・使い込みに既存の差を付ける。
    ordinaryFlagStride: 3, // 無名の長柄足軽の指物は三人に一本。先手の幟と本人の組は残す。
    strideLimit: 1.25, // 敗走でも腿を頭まで振り上げず、足の踏み替えで駆ける。
    fallPaceSpread: 0.35, // 同時に討たれた兵も、膝が折れる間は一人ずつ変える。
    groundedFalls: true, settleSideFalls: true, // 横倒しの胴を支え、肩を山道の斜面へ寝かせる。
    contactFalls: true, // 体が地を打った所で一度だけ、具足と土の音を鳴らす。
    groundStains: true, // 血の跡を地面へ沿わせ、坂から浮く四角い面を残さない。
    wetEarthBursts: true, // 湿った足元には、既存の粒で低く短い土跳ねを添える。
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    combatSpace: shigisanCombatSpace,
    paths: [ { pts: ROAD.slice(0, CLIMB_END + 3), w: ROAD_HALF }, { pts: ROAD.slice(CLIMB_END + 2), w: INNER_HALF }, ...WALK_LINES.slice(1).map((pts) => ({ pts, w: pts[0][1] < GATE.z - 10 ? INNER_HALF : ROAD_HALF })), ...PEOPLE_ROADS.map((pts) => ({ pts, w: 5 })) ],   // 登城道と、寺・里から下る民の道
    pathWidth: ROAD_HALF, // 整地した道の半幅と合わせ、列の端を切岸と誤って止めない。
    height,
    blockedEscape: true, // 柵際で五秒詰まった時だけ、歩ける向きへ退く。
    blockedHint: (rt) => rt.flags.step < 2 ? '尾根道の曲がり角の印へ戻れ。急な山肌は登れない' : rt.flags.step < 3.5 ? '門前の道を進め。門が開くまで先手を守れ' : '曲輪へは柵の口と尾根道を進め。本丸へは西を回り南の口へ',
    // 草土の割合を読む色は共通のまま。暗くするために緑を減らすと、山腹まで裸土になる。
    // 曲輪の形だけ空け、段と段の間の山腹を一括で裸地にしない。道の空きは paths で保つ。
    clear: (x, z) => CAMP_CLEARINGS.some((p) => Math.abs(x - p.x) < p.hw && Math.abs(z - p.z) < p.hd)
      || (Math.abs(z - GATE.z) < 10 && Math.abs(x) < 48)
      || Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 17
      || ATTACK_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z)),
    trees: 276,
    rocks: 0, // 共通の散布岩は使わず、道と平場を避けた少量の自然石だけにする。
    tufts: 1800,
    // 本数は据え置き。見えない遠い外周より、尾根を囲む近い斜面へ配分する。
    treeDensity: (x, z) => (Math.abs(x) < 144 && z > YASHIKI.z - 24 && z < 130 ? 1 : 0.06),
    // 同じ百四十四本を、最初の折り返しと西の帯道の林縁へ配る。
    // 東西六十八歩では道から遠すぎる。西の帯道は中心が六十歩なので、その外へ置く。
    // 追加の林にも道・曲輪・本陣の空きを適用し、当たりと案内を塞がない。
    clearGroves: true,
    groves: [
      { x: -48, z: -30, r: 7, line: [0, 32], n: 24 },
      { x: 48, z: -30, r: 7, line: [0, 32], n: 24 },
      { x: -76, z: -112, r: 7, line: [0, 48], n: 24 },
      { x: 48, z: -112, r: 7, line: [0, 48], n: 24 },
      { x: -76, z: -180, r: 7, line: [0, 48], n: 24 },
      { x: 32, z: -202, r: 7, line: [0, 48], n: 24 },
    ],
    fleeOut: (x, z, team) => team === 1 && (z < YASHIKI.z - 28 || Math.abs(x) > 160),
  },

  waitForPlayer: false, // 組頭の下知の後、法螺の合図で寄せる。
  setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world;
    const F = rt.flags;
    F.entranceEye = new THREE.Vector3(); F.entranceLook = new THREE.Vector3();
    const entranceCamera = rt.player.updateCamera, entranceClamp = W.clampDrawCamera;
    rt.player.updateCamera = function (dt, camera) {
      entranceCamera.call(this, dt, camera);
      rt.def.frameCastleEntrance(rt, camera);
      rt.def.frameRoadCamera(rt, camera);
    };
    W.clampDrawCamera = function (camera) {
      entranceClamp?.call(this, camera);
      if (camera.isPerspectiveCamera) {
        rt.def.frameCastleEntrance(rt, camera);
        rt.def.frameRoadCamera(rt, camera);
      }
    };
    SG_TS.world = W; timeslipField(rt);   // 身の回りの落ち葉・倒れた槍と旗・枯れ草（def.timeslip。切岸は外す）
    // 待機専用の描画は小さな任務印の指定を通らない。崖をまたぐ白い大輪を足元の印へ替える。
    // 到着半径と先手を待つ時間は保ち、終戦時に共通の描画へ戻す。
    const waitFrame = rt.hud.drawWaitFrame;
    rt.hud.drawWaitFrame = function (g, battle, pos, radius) {
      return battle === rt ? this.drawTargetFootRing(g, battle, pos, 0.65)
        : waitFrame.call(this, g, battle, pos, radius);
    };
    // 谷側の空き地へ誘わず、尾根道から歩いて届く場所だけを矢の退き先にする。
    rt.army.hooks.rainEscapePointAllowed = (point) => this.dodgePointAllowed(rt, point);
    const dispose = rt.dispose;
    rt.dispose = function () {
      this.hud.drawWaitFrame = waitFrame;
      return dispose.call(this);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', mainKeep: 'HIST_B', ridgeKuruwa: 'HIST_B', templeArea: 'HIST_B', matsunagaEnd: 'HIST_A', tsutsuiRidge: 'HIST_B', routes: 'GAME_C', sally: 'GAME_C' };
    F.sgFront = []; F.sgFrontAt = 0; rt.army.shigisanFlags = F;
    F.step = 0; F.ek = 0; F.ak = 0; F.firstFoe = null; F.firstFightT = null;
    // 縄張り（castle_plan.js）：曲輪の囲いと段を共通化。大手の閉じた門だけは戦の側で作る
    ridgeTerrain(W);
    W.noClimb = W.noClimb || [];
    W.noClimb.push((x, z) => z < GATE.z - 10 && z > -270 && Math.abs(x) < 110 && !W.onRoad(x, z) && W.slopeTan(x, z) > 0.70);
    // 星は遠い空の点にする。携帯の小さな画面で白い粒が降っているように見せない。
    if (W.stars) { W.stars.material.size = 0.35; W.stars.material.opacity = 0.22; }
    if (W.stars) W.stars.geometry.setDrawRange(0, 100);
    // 旧暦十日は上弦を過ぎ、満月より前。満ちていく月を約七割の明るい面で推定する。
    // https://www.nao.ac.jp/faq/a0201.html （月相と旧暦の日付）。正確な当夜の傾き・天気は未確定。
    // 元の月の絵・材質を準備時にだけ使い直し、夜攻めの足元の明るさは保つ。
    if (W.moon) {
      const tex = W.moon.material.map, c = tex.image;
      c.width = c.height = 256;
      const ctx = c.getContext('2d'), r = 48;
      const glow = ctx.createRadialGradient(140, 115, 0, 128, 128, r);
      glow.addColorStop(0, '#f0f4ff'); glow.addColorStop(1, '#b4c4e6');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(128, 128, r, -Math.PI / 2, Math.PI / 2);
      ctx.ellipse(128, 128, r * 0.36, r, 0, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath(); ctx.fill();
      tex.needsUpdate = true;
      W.moon.scale.setScalar(10);
    }
    // 山道に土塊と足形を升目のように繰り返さない。粒と連続した濃淡の絵を準備時に共有する。
    // 切岸にも同じ土を使い、生成した土壁の四角い区画を山肌へ貼らない。
    W.groundU.tDirt.value = W.groundU.tBank.value = dirtTex(true);
    W.groundU.tMud.value = mudTex(true);
    // この城の崖だけ、細かな岩を面の向きごとに貼る。縦筋や座標を混ぜて潰さない。
    const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey.bind(mat);
    // 月明かりの強さは保ち、この戦の地面だけを湿った褐色に寄せる。
    // 土・草・岩の絵は共用し、別の面や材質を足さない。
    mat.color.setRGB(0.66, 0.65, 0.53);
    mat.customProgramCacheKey = () => cacheKey() + '|信貴山の岩肌';
    mat.onBeforeCompile = (sh, renderer) => {
      compile.call(mat, sh, renderer);
      sh.uniforms.sgStoneFace = { value: stoneTex() };
      sh.fragmentShader = 'uniform sampler2D sgStoneFace;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('col = mix(col, cliff, steep);', `
        vec3 rw = pow(abs(gN), vec3(4.0)); rw /= max(0.001, rw.x + rw.y + rw.z);
        vec3 stoneFace = texture2D(sgStoneFace, vWP.zy / 2.2).rgb * rw.x
          + texture2D(sgStoneFace, vWP.xy / 2.2).rgb * rw.z
          + texture2D(sgStoneFace, vWP.xz / 2.2).rgb * rw.y;
        // 山肌は土と自然石。石垣の目地を山全体へ貼らない。
        // 計算済みの雨溝・土塊・苔を残す。元の土の絵だけへ戻すと巨大な灰色の壁になる。
        vec3 bankSoil = mix(earth, cliff, 0.25) * vec3(0.92, 0.96, 0.84);
        float exposure = smoothstep(0.56, 0.78, macro2) * 0.45;
        float stoneShade = dot(stoneFace, vec3(0.3, 0.55, 0.15));
        vec3 dampStone = mix(stoneFace * vec3(0.62, 0.67, 0.61), vec3(stoneShade) * vec3(0.42, 0.51, 0.36), smoothstep(0.52, 0.76, macro2) * 0.65);
        cliff = mix(bankSoil, dampStone, exposure);
        // 切岸の大きな面にも湿った土色を通し、月光で白い壁に見えるのを抑える。
        cliff *= vec3(0.78, 0.80, 0.72);
        col = mix(col, cliff, steep);`);
      // 近い急斜面でも林床・苔の斑を残す。道の踏み跡による抑制は保ち、
      // 足場・曲輪の高さ・木の数を変えず、一面の白い土壁を和らげる。
      sh.fragmentShader = sh.fragmentShader.replace(
        'mix(1.0 - 0.85 * steep, 1.0, farK)', 'mix(1.0 - 0.35 * steep, 1.0, farK)');
      // 赤橙の斑だけを抑え、土の褐色を残す。夜の山肌を一面の灰色にしない。
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
        float warmPatch = smoothstep(0.02, 0.16, col.r - col.g);
        vec3 nightSoil = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.84, 0.78, 0.66);
        col = mix(col, nightSoil, warmPatch * 0.45);
        // 尾根の斜面は百を超える曲輪の段。一枚の黄土にせず、等高の段ごとに
        // 縁の暗い切岸と、上の枯れ草の平場を描く（形と当たりは変えない）。踏み跡の道には描かない。
        float sgSlope = smoothstep(0.995, 0.95, gN.y) * (1.0 - smoothstep(0.5, 0.42, gN.y));
        float sgStep = fract(vWP.y / 2.4 + (macro2 - 0.5) * 0.35);
        float sgLip = smoothstep(0.80, 0.93, sgStep) * (1.0 - smoothstep(0.96, 1.0, sgStep));
        float sgShelf = 1.0 - smoothstep(0.0, 0.32, sgStep);
        float sgOn = sgSlope * (1.0 - clamp(wear * 1.2, 0.0, 1.0));
        vec3 sgGrass = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.80, 0.84, 0.66);
        col = mix(col, sgGrass, sgOn * (0.55 + sgShelf * 0.35));
        col *= 1.0 - sgOn * 0.18; // 月夜の斜面を明るい黄土の壁にしない
        col *= 1.0 - sgOn * sgLip * 0.6;
        // 門前の平場も一面の黄土にしない。月夜の湿った土に、枯れ芝と落ち葉の斑を大きく散らす（形と当たりは変えない。10/28 資料との差）。
        float sgFlat = smoothstep(0.90, 0.985, gN.y);
        float sgM = 0.5 + 0.28 * sin(vWP.x * 0.31 + sin(vWP.z * 0.19) * 2.3) + 0.22 * sin(vWP.z * 0.43 + vWP.x * 0.13 + macro2 * 3.0);
        float sgL = dot(col, vec3(0.3, 0.55, 0.15));
        col = mix(col, vec3(sgL) * vec3(0.66, 0.70, 0.50), sgFlat * smoothstep(0.38, 0.72, sgM) * (1.0 - clamp(wear * 0.9, 0.0, 0.8)) * 0.75);
        col = mix(col, vec3(sgL) * vec3(0.58, 0.46, 0.34), sgFlat * smoothstep(0.30, 0.12, sgM) * 0.5);
        col *= mix(1.0, 0.6, sgFlat); // 門前の平場を砂浜の明るさにしない
        // 10/31 手本（docs/layout-ref/shigisan/）：奥の山は常緑の緑が主で、紅葉の赤・橙・黄が斑に混じる。
        // 十六歩より先の斜面だけを樹冠の色にする（近い道・曲輪の土は元のまま）。踏み跡の道には塗らない。
        float sgFar = smoothstep(16.0, 45.0, soilViewDistance) * (1.0 - smoothstep(0.985, 0.999, gN.y) * 0.5) * (1.0 - clamp(wear * 1.5, 0.0, 1.0));
        float sgCanL = max(sgL, 0.12) * 1.25;
        float sgCrown = 0.5 + 0.5 * sin(vWP.x * 0.21 + sin(vWP.z * 0.17) * 2.6) * sin(vWP.z * 0.23 + vWP.x * 0.07 + macro2 * 4.0);
        vec3 sgCanopy = sgCanL * mix(vec3(0.50, 1.10, 0.42), vec3(0.34, 0.86, 0.40), smoothstep(0.3, 0.7, macro2));
        sgCanopy = mix(sgCanopy, sgCanL * vec3(1.75, 0.58, 0.24), smoothstep(0.66, 0.84, sgCrown) * 0.9);
        sgCanopy = mix(sgCanopy, sgCanL * vec3(1.30, 1.05, 0.38), smoothstep(0.08, 0.0, sgCrown) * 0.6);
        col = mix(col, sgCanopy * (0.8 + 0.4 * sgCrown), sgFar * 0.92);
        diffuseColor.rgb *= col;`);
    };
    // 地面は透かさず、空・星と草木を深さで遮る。近い切岸は共通のカメラ退避で避ける。
    // 大きな一枚の地形を半透明の列へ入れると、草木や建物との描く順が不安定になる。
    mat.userData.camNearSolid = true;
    mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.alphaHash = false;
    mat.needsUpdate = true;
    // 館の板塀と、奥の段の透ける木柵を分け、切岸とひな壇を見せる。
    // 画質は戦の開始時に読む。ほかの画質の縄張りと当たりは保つ。
    const visualPlan = { ...ATTACK_PLAN,
      kuruwa: ATTACK_PLAN.kuruwa.map((k) => ['shu', 'ridge2', 'ridge3', 'ridge4'].includes(k.id)
        ? { ...k, wallOpt: { ...k.wallOpt, openFence: true, h: 1.8 } } : k) };
    F.C = buildCastlePlan(rt, { ...visualPlan, lifeDense: 1.6, lifeNoFlags: true, lifeFires: 8 }, { life: true, ladders: true, buildSeat: false, baseHeight: base, edgeW: TERRAIN_EDGE });
    // 共通の天守は白壁と層を重ねる形なので、この城だけ板壁の小さな望楼にする。
    const seat = boardRoom(rt, { x: TOP.x - 2, z: TOP.z - 8, w: 8, d: 6, name: '山頂の天主', kind: 'tenshu', keep: true });
    // 月夜の遠景で天守と松永屋敷を影として読ませる：板壁の小窓に灯りを少しだけ点す（一つの形・一回の描画）。
    {
      const lit = [], at = (cx, cz, w, d, hy, xs) => {
        const y = W.heightAt(cx, cz) + hy;
        for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (const o of xs) {
          if (nz > 0 && Math.abs(o) < 1.2) continue;   // 戸口の上は空ける
          const g = new THREE.PlaneGeometry(0.95, 0.5);
          g.rotateY(Math.atan2(nx, nz));
          const half = nz ? d / 2 : w / 2, along = nz ? o : o * d / w;
          g.translate(cx + nx * (half + 0.1) + (nz ? along : 0), y, cz + nz * (half + 0.1) + (nx ? along : 0));
          lit.push(g);
        }
      };
      at(TOP.x - 2, TOP.z - 8, 8, 6, 1.7, [-2.4, 2.4]);
      at(YASHIKI.x, YASHIKI.z - 3, 11, 7, 1.5, [-3.6, 0.0, 3.6]);
      at(TOP.x - 2, TOP.z - 8, 3.6, 3.0, 7.7, [-.8, .8]);
      // 松永の「四階の櫓」の伝えに寄せ、望楼の棟の上へ小さな最上階と寄棟を一つ重ねる（見た目だけ。入れる床は変えない）。
      // 窪地の向こうの尾根上で、持ち場から月夜の空に三重の影として読ませる。
      {
        const sx = TOP.x - 2, sz = TOP.z - 8, sy = W.heightAt(sx, sz), wood = [], roofs = [];
        const b = (w, h, d, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(sx, sy + y, sz); wood.push(g); };
        // 11/6 fixc1429（critic60「遠くの細い塔・五重塔のよう」・四5）：上の二つの階が細い棒に見えた。望楼型の四階櫓らしく、
        //   三階は二階の床いっぱい・四階はその七割の幅にし、軒を深く出す（雄岳の頂から城を見下ろす重さ）。
        b(3.6, 1.9, 3.0, 7.65); b(4.2, .14, 3.6, 6.75);
        const hip = new THREE.ConeGeometry(3.7, 1.35, 4, 1); hip.rotateY(Math.PI / 4); hip.scale(1.2, 1, 1.02);
        hip.translate(sx, sy + 9.2, sz); roofs.push(hip);
        // 11/2 史料（docs/battle_refs/shigisan.md）：天主は四階櫓。三重の上へ細い四階目と寄棟を重ね、雄岳の頂に一つだけ立てる。
        b(2.7, 1.7, 2.3, 10.1); b(3.1, .12, 2.7, 9.3);
        const hip2 = new THREE.ConeGeometry(2.9, 1.25, 4, 1); hip2.rotateY(Math.PI / 4); hip2.scale(1.2, 1, 1.02);
        hip2.translate(sx, sy + 11.55, sz); roofs.push(hip2);
        const ridge = new THREE.BoxGeometry(1.1, .16, .16); ridge.translate(sx, sy + 12.15, sz); roofs.push(ridge);
        const top = new THREE.Group();
        // 11/2：一色の板は月に白く浮いた。上の二つの階も下見板の壁・燻し瓦の絵（城の石垣と同じ使い回しの絵）で。
        const K = sgKeepKit();
        top.add(new THREE.Mesh(mergeGeometries(wood), K.wall), new THREE.Mesh(mergeGeometries(roofs), K.tile));
        for (const g of [...wood, ...roofs]) g.dispose();
        top.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
        rt.scene.add(top);
      }
      const glow = new THREE.Mesh(mergeGeometries(lit), new THREE.MeshBasicMaterial({ color: 0xe0a050, side: THREE.DoubleSide }));
      for (const g of lit) g.dispose();
      rt.scene.add(glow);
    }
    F.C.seat = { naka: seat.naka, spot: seat.naka.lordSpot, where: seat.naka.where, team: 1 };
    rt.castleSeat = F.C.seat;
    // 下の曲輪・屋敷の木柵は破れる。切岸・空堀と本丸の囲いは保つ。
    for (const s of F.C.walls) if (s && s.seg) {
      s.hp = s.maxHp = 650; s.noTarget = false; s.wall = true;
      // 切岸をまたぐ柵は素手で越えない。数十歩上の地面へ空中を登る動きを防ぐ。
      s.noClimb = unsafeFenceClimb(W, s.seg);
    }
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; s.noClimb = true; } return segs; };
    // この戦で足す木柵は材質・近い区画ごとにまとめる。
    // 区画の当たりと壊れる窓口は既存の一括描画の仕組みで保つ。
    const fences = makeSimpleBatch();
    fences.mergeFence = true;
    // ---- 門の曲輪：柵と門、脇の物見櫓 ----
    // 写真の山城の門脇は細い杭と二段の横木。館の板塀とは透け方を分ける。
    // 高さ・柵の当たり・開口は保ち、共通部品の高画質用の疎な柵を使う。
    const gateFenceOpt = { batch: fences, lightFence: true };
    noT(wallLine(rt, [[-28, GATE.z + 4], [-5.5, GATE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5, meshOpt: gateFenceOpt }));
    noT(wallLine(rt, [[5.5, GATE.z], [28, GATE.z + 4]], { team: 1, hp: 1e9, name: '柵', segLen: 5, meshOpt: gateFenceOpt }));
    // 門の東は窪地へ落ちる切岸の縁。持ち場の正面右に、縁に沿う柵と篝火を続けて段の形を見せる（道と門前の平場は空ける）。
    noT(wallLine(rt, [[28, GATE.z + 4], [38, GATE.z + 3.5], [48, GATE.z + 2.5]], { team: 1, hp: 1e9, name: '柵', segLen: 5, meshOpt: gateFenceOpt }));
    kagaPlace(rt, W, 41, GATE.z + 6.5);
    F.gate = rt.army.addStruct({ seg: [-5.5, GATE.z, 5.5, GATE.z], nx: 0, nz: 1, hp: 1800, maxHp: 1800, armor: 0.22, team: 1, name: '門' });
    const dm = tobira(W, GATE.x, GATE.z, 11, 0);   // 閉じた扉（破られると根元から倒れる）
    F.gate.mesh = dm;
    // 11/6 fixc1429（critic60「屋根も櫓も無い板の壁一枚」）：大手の木戸は本柱と控柱に切妻の屋根を架けた薬医門の形に（house）。
    //   扉の外の面の八双金物・肘金の帯は、城門の扉の外に打つ物で正しい（姫路城・彦根城の門扉と同じ）。
    rt.scene.add(dm, boardGate(W, GATE.x, GATE.z, 11.4, 0, true));
    // 11/6 fixc1429（critic60「麓に丸太を組んだ井楼」）：丸太を井の字に組んだ吹き放しの井楼は寄せ手の攻め櫓に見える。
    //   城方の物見櫓は板で囲った櫓にする（床の高さ・当たりは保つ）。
    const towerOpt = { logFrame: false, boarded: true, mon: MATSU.flag };
    F.tower = yagura(W, TOWER.x, TOWER.z, towerOpt);
    rt.scene.add(F.tower, yagura(W, -12, GATE.z - 6, towerOpt));
    // ---- 本丸（雄嶽の主郭）：柵の囲い（南に口）と、板葺きの館 ----
    noT(F.C.walls.filter((w) => w.name === '主郭（館）'));
    rt.scene.add(boardGate(W, 0, TOP.z + TOP.r, 7.4, 0, true));
    // 松永の小さな天守は板壁の望楼。切岸は土を主にし、縁の一部だけ低い石積みを添える。
    // 門前の篝火は尾根道の幅六歩と、門の右脇の守りから離す。炎は鉄籠の高さに合わせる。
    // 主郭の南の木戸の両脇にも篝火。持ち場から見上げた天守と柵の影を火で縁取る（10/28 資料との差：天守が見えない）。
    for (const [x, z] of [[-9, GATE.z + 12], [10, GATE.z + 12], [TOP.x - 5.6, TOP.z - 1.5], [TOP.x + 1.6, TOP.z - 1.5], [TOP.x - 6, TOP.z + TOP.r - 3], [TOP.x + 6, TOP.z + TOP.r - 3]]) {
      kagaPlace(rt, W, x, z);
    }
    // 夜の高い尾根では近い遠景の板が空へせり出す。山の板を消して同じ空へつなぐ。
    W.mountains.visible = false;
    ridgeSoil(rt);
    // 11/6 fixc1429：曲輪の縁の石積みと算木積みの隅（terraceStone）はやめた。天正五年の大和の山城は土の切岸（critic60「煉瓦の石垣」・八1）
    openingTerraces(rt);
    slopeSkin(rt);
    // 道は整地済みの土の坂。全尾根へ連続する推定の石段を重ねない。
    innerRails(rt, fences);
    well(rt, TOP.x - 11, TOP.z + 2);
    well(rt, YASHIKI.x - 11, YASHIKI.z - 5);
    F.rooms = BUILDINGS.map((q) => boardRoom(rt, q));
    for (const room of F.rooms) room.naka.guards = []; // 入れる建物に兵を増やさない。寺は戦の外。
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [TOP.x - 16, TOP.z + 6], [TOP.x + 14, TOP.z + 10]]) rt.scene.add(nobori(W, x, z, 'todo', z < TOP.z + 12 ? 8 : 6));
    // 五段の土塁と柵は共通の縄張りからまとめて描く。口だけ開いた木戸。
    F.monomi = SHIGISAN_PLAN.yagura.filter((y) => y.id !== 'monomi_gate').map((y) => monomi(rt, y.at[0], y.at[1], { ...towerOpt, height: 8.8, team: 1, name: '物見櫓' }));
    for (const c of [RIDGE1, RIDGE2, RIDGE3, RIDGE4, YASHIKI]) rt.scene.add(boardGate(W, c.x, c.z + c.r, 7, 0, c === YASHIKI));
    // 主尾根の正面は東。閉門を増やさず、既存の道の開口と同じ位置に木戸を置く。
    for (const c of [RIDGE1, YASHIKI]) rt.scene.add(boardGate(W, c.x + c.w, c.z, 7.4, Math.PI / 2, c === YASHIKI));
    // 持ち場の門前：一色の平場を踏み跡の土と窪みの泥に崩し、半ば埋まった岩と根の草、寄せ手の俵・材木を手前の左右へ（共通の stage_dress）。
    // 小屋・塀・幟・井楼は城の物があるので足さない。道・建物・急な切岸は部品の側で避ける。
    {
      const view = dressStage(rt, { huts: 0, fence: false, flag: false, yagura: false, clutter: 0, fire: false, rocks: 0, wet: 0.7, trodden: 0.9 });
      // 月明かりで白く浮く平場の土を、夜露に濡れた暗い土の斑へ沈める（準備の時に一度だけ。頂点の配分だけ）。
      const geo = W.terrain?.geometry, P = geo?.attributes.position, sp = geo?.attributes.splat;
      if (P && sp) {
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x - view.x, z - view.z);
          if (d > 60) continue;
          const n = 0.5 + 0.5 * Math.sin(x * 0.43 + Math.sin(z * 0.19) * 2) * Math.cos(z * 0.37 - x * 0.12);
          const k = (1 - d / 60) * (0.35 + 0.4 * n);
          const g = sp.getX(i), dd = sp.getY(i), m = sp.getZ(i), t = dd * k;
          sp.setXYZ(i, g, dd - t, m + t);
        }
        // 窪地を囲む斜面は一色の土でなく、写真の下草と山の土の斑に（10/29 採点：斜面が写真の素材でない）。道の帯は崩さない。
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x - view.x, z - view.z);
          if (d > 110) continue;
          const sl = Math.hypot(W.heightAt(x + 1, z) - W.heightAt(x - 1, z), W.heightAt(x, z + 1) - W.heightAt(x, z - 1)) / 2;
          if (sl < .25) continue;
          const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2.4) * Math.sin(z * 0.29 + x * 0.17);
          const k = Math.min(1, (sl - .25) * 2.5) * (1 - Math.max(0, d - 80) / 30) * (0.5 + 0.5 * n);
          const g = sp.getX(i), dd = sp.getY(i), m = sp.getZ(i);
          sp.setXYZ(i, g + (1 - g) * k, dd * (1 - k), m * (1 - k));
        }
        sp.needsUpdate = true;
      }
    }
    // 門脇の持ち場から西を向くと、窪地の縁の上（画面の上三分の一）に西の曲輪が立つ：
    // 切岸の肩に柵と篝火・幟、平場の奥に板張りの高い櫓を月夜の空へ影として（飾り。当たりなし・準備の時に一度）。
    {
      const y0 = W.heightAt(TOWER_POST.x, TOWER_POST.z);
      const crest = (z) => { for (let x = TOWER_POST.x - 12; x > TOWER_POST.x - 60; x -= 1) if (W.heightAt(x, z) > y0 + 2.5) return x; return null; };
      const pts = [-44, -52, -60, -68, -76].map((z) => [crest(z), z]).filter((p) => p[0] !== null);
      // 10/30 採点 点検4：丸太の柵でなく、石垣の天端に狭間の板塀（月夜に黒い板と狭間の口）。
      if (pts.length >= 2) sgHei(rt, pts.map(([x, z]) => [x - .6, z]), (x, z) => W.heightAt(x - .9, z) + .4);
      for (const [k, p] of pts.entries()) {
        if (k === 1 || k === 3) { kagaPlace(rt, W, p[0] - 1.2, p[1]); }
        if (k === 0 || k === 2 || k === 4) rt.scene.add(nobori(W, p[0] - 2, p[1] + 1.5, 'todo', 7));
      }
      const mid = pts[Math.floor(pts.length / 2)];
      if (mid) rt.scene.add(yagura(W, mid[0] - 9, mid[1] - 3, { height: 11, boarded: true, rot: Math.PI / 2 }));
      // 縁の上の段（10/29 採点：天守・切岸が見えない、石の壁がのっぺり、背に敵が居ない）：
      // 切岸の肩を野面の石垣で締め、奥の高みに狭間の板塀と二重の望楼（天守の影）、柵の内に松永方の兵の群れ（軽い遠景の兵。当たりなし）。
      if (mid && pts.length >= 2) {
        // 11/6 fixc1429（critic60「茶色の煉瓦を階段に積んだ石垣」・八1）：天正五年の大和の山城は土塁と切岸が主で、石は破城で崩れた僅かな石積みだけ。
        //   切岸の肩と裾の野面の石垣（段に刻んだ帯）はやめ、土の切岸と板塀で見せる。
        // 切岸の上の肩：狭間を切った板塀を月夜の空へ（柵の上の段）。
        const crest2 = (z) => { for (let x = TOWER_POST.x - 12; x > TOWER_POST.x - 70; x -= 1) if (W.heightAt(x, z) > y0 + 8) return x - 1; return null; };
        const top2 = [-46, -56, -66, -76].map((z) => [crest2(z), z]).filter((p) => p[0] !== null);
        if (top2.length >= 2) castlePart(W, 'hei', { pts: top2, kind: 'ita', h: 2.4, sama: 1.4 }, { era: 'early' });
        // 11/2 史料：天主は雄岳の山頂（主郭）に一つだけ。縁の上の段に置いていた飾りの櫓はやめ、目線は主郭の天主へ向ける。
        const kx = mid[0] - 21, kz = mid[1] + 5; SG_TS.view = { x: kx, z: kz }; SG_TS.keep = { x: KEEP_AT.x, z: KEEP_AT.z };
        castlePart(W, 'hei', { pts: [[kx + 7, kz - 9], [kx + 7, kz + 9]], kind: 'ita', h: 2.4, sama: 1.5 }, { era: 'early' });
        // 11/4 p100（AA・AT9）：板塀の内に描いただけの松永勢を詰めない。門を抜けて歩いて行ける曲輪で、近づくと消える見せかけになる。
        // 11/6 fixc1429（critic60「石垣の上の空に白い板が十枚ほど浮く」「煉瓦の石垣」・八1）：左の斜面の裾の野面の石垣と、
        //   斜めに刻んで上る白漆喰の土塀をやめた（段の白い箱が宙に浮いて見えた）。土の切岸の上に黒い板塀（top2）だけを残す。足もとに篝火と幟。
        const tx = TOWER_POST.x, tz = TOWER_POST.z;
        let fx = kx - tx, fz = kz - tz; { const d = Math.hypot(fx, fz) || 1; fx /= d; fz /= d; }
        const lx = fz, lz = -fx;   // 天主を向いて左
        for (const [a, o, k] of [[3.5, 2.6, 'fire'], [5, -2.8, 'flag'], [8, 3.2, 'flag']]) {
          const x = tx + fx * a + lx * o, z = tz + fz * a + lz * o;
          if (k === 'fire') { kagaPlace(rt, W, x, z); } else rt.scene.add(nobori(W, x, z, ODA.flag, 5));
        }
      }
    }
    // 遠い二段の兵糧小屋は板葺きで材質ごとにまとめる（室内なし）。
    const huts = makeSimpleBatch();
    // 高画質では共通部品の板葺きを指定。各屋根三十個の石を並べる姿を避ける。
    const hutRoof = { boardRoof: true, weatheredBoards: true, boardRoofColors: [0x777062, 0x69685b, 0x82745f, 0x726a58] };
    for (const c of [RIDGE3, RIDGE4]) hut(W, c.x + 5, c.z, 3.5, 3, 0, { ita: true, minka: false, batch: huts, ...hutRoof });
    if (true) {
      // 枝尾根の既存の平場にだけ家臣の小屋を対で置く。中央と道の口は空ける。
      // 写真の並びを参考にした推定。城下の民家や新しい守兵にはしない。
      for (const [id, buildings, flag] of [
        ['branch1', [[-6, -1.5, 7, 4, 0], [6.5, -1, 3.5, 3, Math.PI / 2]], [2, -3.7]],
        ['branch4', [[-6.5, -1, 4, 3, Math.PI / 2], [5.5, -2, 7, 4, 0]], [-2, -3.7]],
        ['branch10', [[-5.5, -2, 8, 4, 0], [6.5, -.5, 4, 3, Math.PI / 2]], [2, -3.7]],
      ]) {
        const k = ATTACK_PLAN.kuruwa.find((p) => p.id === id);
        const x = k.poly.reduce((sum, p) => sum + p[0], 0) / k.poly.length;
        const z = k.poly.reduce((sum, p) => sum + p[1], 0) / k.poly.length;
        // 同寸の二棟を反復せず、主屋と妻を向けた付属屋で庭を囲む。入口中央は空ける。
        for (const [dx, dz, w, d, rot] of buildings) hut(W, x + dx, z + dz, w, d, rot, { ita: true, minka: false, solid: false, batch: huts, ...hutRoof });
        branchFence(rt, x, z);
        rt.scene.add(nobori(W, x + flag[0], z + flag[1], MATSU.flag, 5));
      }
      for (const c of [RIDGE3, RIDGE4]) rt.scene.add(nobori(W, c.x - 7, c.z - 3, MATSU.flag, 5));
    }
    finalizeSimpleBatch(rt, huts);
    ridgeEquipment(rt);
    for (const [x, z] of [[RIDGE1.x + 7, RIDGE1.z - 1], [RIDGE2.x - 6, RIDGE2.z + 1]]) rt.scene.add(nobori(W, x, z, 'todo', z < TOP.z + 12 ? 8 : 6));
    // ---- 松永屋敷（北尾根のさらに奥の郭。主殿・家臣の詰所・倉。暮らしと政治の区域。通り抜けを塞がぬよう、壁は装飾の低い塀だけ） ----
    rt.scene.add(tawara(W, YASHIKI.x + 8, YASHIKI.z + 1, 0.2, 5));
    rt.scene.add(nobori(W, YASHIKI.x - YASHIKI.r + 1, YASHIKI.z, 'todo', 6));
    // ---- 朝護孫子寺の区域（今の建物は写さない。民のいる寺を攻撃目標にしない） ----
    palisade(W, [TEMPLE.x - TEMPLE.r, TEMPLE.z - TEMPLE.r, TEMPLE.x + TEMPLE.r, TEMPLE.z - TEMPLE.r], { h: 2.2, batch: fences });
    // 民の暮らす里は斜面の四隅まで接地させ、畦道脇の家が浮いたり土へ埋まったりしないようにする。
    // 門前から遠くても、民の出発地と避難路に接する里は省かない。
    // 既存のまとめ描画で五軒と田を一度だけ作る。東の畦道は空けたままにする。
    rt.scene.add(village(W, 104, 180, { n: 5, fields: 5, seed: 1577, groundedHomes: true }));
    // 寺の区域は城の区域と分ける：四方を木柵で囲み、山門を西（城の登城道の側）へ向け、境内の灯と僧の姿を置く。戦いの的にしない
    {
      const P = TEMPLE_ZONE.poly, R = TEMPLE.r;
      for (const seg of [[TEMPLE.x - R, TEMPLE.z + R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x + R, TEMPLE.z - R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x - R, TEMPLE.z - R, TEMPLE.x - R, TEMPLE.z - 2], [TEMPLE.x - R, TEMPLE.z + 2, TEMPLE.x - R, TEMPLE.z + R]]) palisade(W, seg, { h: 2.2, batch: fences });
      rt.scene.add(kabukimon(W, TEMPLE_ZONE.sanmon.x, TEMPLE_ZONE.sanmon.z, 4.4, Math.PI / 2, { doors: false }));
      rt.marker('tera', { x: TEMPLE.x, z: TEMPLE.z }, '朝護孫子寺（民の避難路）', { h: 5, noGuide: true });
      F.templeZone = TEMPLE_ZONE;
    }
    finalizeSimpleBatch(rt, fences);
    // ---- 筒井の先手・鉄砲組・門を破る組 ----
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: 2, z: 92 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], TSUTSUI));
    F.tsuU = F.tsutsui.units[0]; // 尾根道の先導。順慶本人は麓の陣に置く。
    F.ake = allyGroup(rt, { name: '筒井の鉄砲組', anchor: { x: -20, z: 100 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 6 }], TSUTSUI));
    F.ram = allyGroup(rt, { name: '門を破る組', anchor: { x: 14, z: 108 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.tsutsui, F.ake, F.ram];
    for (const g of F.oda) { g.noRout = true; g.formation = 'column'; g.width = 5; g.defMult = 2.6; g.dmgMult = 1; }   // 10/30：本丸の南口の前で先手が尽きて負けが続いた（bot）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 3, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    F.oda.forEach((g, i) => {
      const start = Math.max(1, OPEN_I - i), at = ROAD[start];
      placeGroup(rt, g, at[0], at[1]);
      // 出発時の後列も折れた道へ置く。直線の並びでは切岸に立ってしまう。
      g.order = 'path'; g.path = ROAD; g.pathIdx = start + 1; g.roadColumn = true; g.colW = 2;
      for (const u of g.units) {
        const p = g.slotPos(u.slot, g.initial);
        u.pos.set(p.x, W.heightAt(p.x, p.z), p.z); u.mesh.position.copy(u.pos);
      }
      // 配置後に道沿いの持ち場を設定し、麓の迎撃でも後列を切岸へ向けない。
      march(rt, g, []); g.onArrive = null;
      g.path = ROAD.slice(0, start + 1); g.pathIdx = start; g.speed = 0;
      for (const u of g.units) u.moveTo = null;
    });
    // 竹束：筒井の鉄砲組に二つ（玉込めの間を束の陰で凌ぐ）。門を打つ組は掛矢を抱えるので持たない。
    patchGunCover(rt);
    F.sgTabas = [[F.ake, 2], [F.ake, 4]].map(([g, off]) => {
      // 始めは列の頭の先・登る向きの道の片側に立てておく。
      const at = ROAD[g.pathIdx], to = ROAD[g.pathIdx + 1], d = Math.hypot(to[0] - at[0], to[1] - at[1]);
      const ux = (to[0] - at[0]) / d, uz = (to[1] - at[1]) / d;
      const tb = addTaba(rt, at[0] + ux * 4 - uz * off, at[1] + uz * 4 + ux * off, 0, { fixed: true, rot: Math.atan2(ux, uz) });
      tb.sgVan = g; tb.sgOff = off;
      // 11/6 fix4：動く束が三十一秒目に静止物の結合へ吸われ、本物は隠れて写しが登り口に残っていた（写真）。有岡と同じく外す。
      tb.m.userData.noFreeze = true;
      return tb;
    });
    // 落石：木戸の脇の塀の内から、九十九折りの最後の二つの折れへ石を落とす（木戸が開くまで）。
    //   筋は道を斜めに横切る一本だけにし、列の一人二人が巻き込まれる（列ごと倒さない。b_k03_gifu と同じ考え）。
    F.rocks = makeRockTraps(rt, { posts: [
      { id: 'east', team: 1, stock: 3, interval: [14, 20], lane: [[20, -61], [22, -50], [24, -38]], active: () => F.step >= 1 && F.step < 3.2 },
      { id: 'west', team: 1, stock: 3, interval: [16, 22], lane: [[-6, -61], [-3, -52], [3, -43], [8, -34]], active: () => F.step >= 1 && F.step < 3.2 }] });
    // ---- 木戸の内の弓と鉄砲 ----
    F.arch = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '木戸の弓', anchor: { x: 8, z: GATE.z - 3 }, facing: 0, width: 14, aggro: 40, noRout: false, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'bow', n: 10 }, { type: 'gun', n: 7 }], MATSU));
    // ---- 麓の織田の陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, -16, 132, 0.3, 6));
    // 麓の総大将 織田信忠の本陣と、本丸の松永久秀の陣所（旗本は本丸の内に控える）
    F.honjin = camp(rt, { x: 0, z: 142, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 2, z: 92 } });
    F.honjin.guard.anchor.z = 127; F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 12;
    // 総大将は陣幕の内の床几に座る（十三4・鳥取と同じ）。順慶は先手の陣で同じく床几に。
    if (F.honjin.general) { F.honjin.general._crouch = true; F.honjin.general._nest = true; }
    // 11/5：信長の床几はやめた。信長は安土にいて信貴山へは来ていない（信長公記・多聞院日記）。麓の本陣は総大将の信忠だけ（七1・battle_learn）。
    // 明智光秀は東の寺側の仕寄りの備えの後ろ（麓の側）に馬上で控える（11/6 fixc1845：法隆寺に陣した先陣で、城の東）（片岡城を落とした手）。備えの塊に重ねない。名のある将は旗本に囲ませる（AW6・AV7）。
    F.akechiG = allyGroup(rt, { name: '明智光秀の手', fixed: true, noHunt: true, anchor: { x: 70, z: 29 }, facing: Math.PI, width: 6, order: 'hold', aggro: 4, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, keep: true, horse: true, flag: 'akechi' } }, { type: 'samurai', n: 10, o: { flag: 'akechi' } }], ODA));
    F.tsuCamp = camp(rt, { ...TSUTSUI_CAMP, facing: Math.PI, team: 0, mon: 'umebachi', general: { name: '筒井順慶' }, guard: 15, reserve: 0, runTo: { x: 2, z: 80 } });
    // 旗本は南の口を守る。閉じた北の幕を横切る持ち場へ動かさない。
    F.tsuCamp.guard.guard = true; F.tsuCamp.guard.guardLeash = 12;
    if (F.tsuCamp.general) F.tsuCamp.general._crouch = true;
    F.ehon = makeLordKeep(rt, { name: '松永久秀', naka: F.C.seat.naka, faction: 'matsunaga', flag: 'todo', guardN: 4 });
    rt.army.spawn(F.ehon.lord.group, [{ type: 'busho', n: 1, o: { name: '松永久通', x: F.ehon.spot.x + 1.5, z: F.ehon.spot.z, invuln: true } }]);
    F.hisamichi = F.ehon.lord.group.units[1];
    F.hisamichi.keep = true; F.hisamichi.noTarget = true; F.hisamichi.pos.y = F.ehon.spot.y;
    F.ehon.lord.invuln = true; F.ehon.lord.noTarget = true; F.ehon.lord.group.noAI = true;
    for (const u of [F.ehon.lord, F.hisamichi]) { u.aiT = Infinity; u.perch = { x: u.pos.x, z: u.pos.z }; }
    // 史料の最期は自害。室内の共通の一騎打ち案内は使わない。
    F.C.seat.naka.onEnter = null; F.C.seat.naka.onLevel = null;
    F.amb = enemyGroup(rt, { fixed: true, ambush: true, faction: 'matsunaga', name: '尾根の松永勢', anchor: { x: AMBUSH_PT[0], z: AMBUSH_PT[1] }, facing: Math.atan2(OPEN_PT[0] - AMBUSH_PT[0], OPEN_PT[1] - AMBUSH_PT[1]), formation: 'column', order: 'hold', aggro: 16, width: 5, morale: 100, fleeDir: { x: -1, z: -0.5 } },
      // 10/30 採点：25秒の画面で味方が密で敵が遠い。尾根道の先に厚い松永勢を置き、先手と押し合い斬り合わせる。
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 25 }], MATSU));
    // 伏兵の両脇の道端に篝火。夜の斬り合いを火で照らす（道の幅六歩の外。当たりなし）。
    {
      const dx = OPEN_NEXT[0] - OPEN_PT[0], dz = OPEN_NEXT[1] - OPEN_PT[1], L = Math.hypot(dx, dz), sx = -dz / L, sz = dx / L;
      // 持ち場の脇に置くと鉄籠が画面の左を塞いだ。伏兵の六歩先、道の両端に置く。
      const ax = AMBUSH_PT[0] + dx / L * 6, az = AMBUSH_PT[1] + dz / L * 6;
      for (const k of [-1, 1]) { const x = ax + sx * k * (ROAD_HALF + 1.5), z = az + sz * k * (ROAD_HALF + 1.5); kagaPlace(rt, W, x, z); }
    }
    // 後列も登城道に沿わせ、藪の急斜面へ並べない。下知までは動かさない。
    march(rt, F.amb, [OPEN_PT]);
    F.amb.path = [OPEN_NEXT, AMBUSH_PT, OPEN_PT]; F.amb.pathIdx = 2; F.amb.speed = 0;
    for (const u of F.amb.units) {
      const q = F.amb.slotPos(u.slot, F.amb.initial);
      u.pos.set(q.x, W.heightAt(q.x, q.z), q.z); u.mesh.position.copy(u.pos);
    }
    F.sally = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '木戸脇の控え', anchor: { x: 22, z: GATE.z - 10 }, facing: 0, formation: 'yari', order: 'hold', aggro: 8, width: 6, morale: 90, fleeDir: { x: 0.5, z: -1 } },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 30 }], MATSU));
    F.rg1 =enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '下の曲輪の松永勢', anchor: { x: RIDGE1.x - 3, z: RIDGE1.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    F.rg2 = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '上の曲輪の松永勢', anchor: { x: RIDGE2.x, z: RIDGE2.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 9, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], MATSU));
    F.ryk = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '松永屋敷の守り', anchor: { x: YASHIKI.x + 11, z: YASHIKI.z - 1 }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 1, z: 0 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], MATSU));
    const mk = (x, z, name, list) => enemyGroup(rt, { fixed: true, faction: 'matsunaga', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 20, aggro: 16, width: 7, formation: 'yari', morale: 100, noRout: false, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(list, MATSU));
    // 森好久の鉄砲二百は備え表で示す。近くの四人だけを実兵にする。
    // 内通の知らせまで控え、討取りで伝承に沿う寝返りの段を消さない。
    F.mori = enemyGroup(rt, { fixed: true, faction: 'matsunaga', name: '森好久の鉄砲組', anchor: { x: TOP.x - 10, z: TOP.z + 4 }, facing: 0, order: 'hold', formation: 'gun', width: 5, noRout: true, morale: 100, aggro: 0 }, dress([{ type: 'gun', n: 4 }], MATSU));
    F.mori.noAI = true;
    for (const u of F.mori.units) { u.noTarget = true; u.invuln = true; }
    // 実際に戦う守兵だけを絞る。包囲の総勢と、父子が城内で自害する筋は保つ。
    F.last = [mk(TOP.x, TOP.z + TOP.r - 4, '本丸の南口の守り', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 1 }])];   // 実際に戦う本丸の守りは絞る（城の総勢は備え表で示す。bot 10/30）
    F.last.push(mk(TOP.x + 11, TOP.z + 10, '本丸の控え', [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]));
    for (const g of F.last) g.dmgMult = 0.8;
    F.arch.dmgMult = 0.5;   // 門の内の弓は先手を削り過ぎない（bot 10/30。10/31 打ち手の組が崩れたので更に浅く）
    for (const [x, z, k] of [[-8, 130, 'oda'], [8, 130, 'eiraku'], [-30, 110, 'akechi'], [30, 110, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const g of [F.arch, F.amb, F.sally, F.rg1, F.rg2, F.ryk, ...F.last, F.ehon.guard, ...F.ehon.kin]) { g.noAI = true; g.noRout = false; }
    F.amb.noAI = true; // 登りの下知で、同じ道の敵を必ず前へ出す。
    F.amb.noRout = true;   // 10/30：最初の四十秒は崩れて逃げず、尾根道で先手と組み合う（update で解く）
    for (const u of rt.army.units) if (u.team === 1) {
      u.playerOpeningBlocked = true; u.sgWait = { x: u.pos.x, y: u.pos.y, z: u.pos.z };
      u.cdBase = Math.max(u.cdBase || 0, u.type === 'gun' || u.type === 'bow' ? 4.5 : 2.4);
    }
    for (const g of F.oda) g.noAI = true;
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：尾根道の伏兵 → 木戸 → 曲輪（下・上・屋敷）→ 本丸。
    //   今の段の守りだけが打って出て、奥の曲輪は持ち場で構えて待つ。段が長引けば使番が知らせる（11章）
    F.stages = siegeStages(rt, [
      { groups: [F.amb], at: { x: GATE.x, z: GATE.z - 6 }, done: () => F.step >= 3, report: '尾根道の伏兵、まだ退きませぬ！', reportAfter: 70 },
      { groups: [F.arch, F.sally], at: { x: RIDGE1.x, z: RIDGE1.z }, done: () => F.step >= 3.5, report: '木戸、まだ破れず！　櫓から射られております！', reportAfter: 60 },
      { groups: [F.rg1, F.rg2, F.ryk], at: { x: TOP.x, z: TOP.z + TOP.r - 4 }, done: () => F.step >= 4, report: '曲輪の松永勢、しぶとく持ちこたえております！', reportAfter: 80 },
      { groups: F.last, at: { x: TOP.x, z: TOP.z }, done: () => false },
    ], { runner: '使番' });
    // 傷ついた守りは同じ兵のまま次の曲輪へ歩いて下がる。
    F.withdraw = [
      { g: F.sally, path: ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1) },
      { g: F.rg1, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z), ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z) + 1) },
      { g: F.rg2, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z)) },
      { g: F.ryk, path: ROUTES.find((r) => r.id === 'yashiki').pts.slice(6).concat([[TOP.x, TOP.z + 8]]) },
    ];
    for (let i = 0; i < F.withdraw.length; i++) {
      const w = F.withdraw[i]; w.to = ['ridge1', 'ridge2', 'shu', 'shu'][i];
      w.probeA = { x: 0, y: 0, z: 0 }; w.probeB = { x: 0, y: 0, z: 0 };
    }
    rosterBuild(rt, JIN);
    // 包囲の備えだけを交代させる。城へ勝手に登らず、元の兵種と損害を引き継ぐ。
    for (const m of Object.values(F.jinRoster[0])) m.army.noWake = false;
    for (const a of W.armies || []) if (a.team === undefined) { a.team = 0; a.noWake = false; a.jinkeiGuard = true; }
    // 城方の軽い備は本物へ替えない（10/31 bot：門前で城方の軽い備が「備の兵」として起き、門の打ち手と先手を二十人余り討って退かせた）。
    for (const a of W.armies || []) if (a.team === 1) a.noWake = true;
    for (const [x, z] of [[-20, 124], [20, 126]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    siegeStores(rt);

    // 物見の床だけでなく地上の脚組も、近い視点の見通しに含める。
    // 当たり・床・梯子は保ち、この戦の櫓にだけ範囲を持たせる。
    rt.scene.traverse(o => {
      const I = o.userData.naka;
      if (I?.kind !== 'yagura' || !I.open) return;
      const y = W.heightAt(I.x, I.z), top = I.levels[I.levels.length - 1];
      o.userData.sgView = { id: I.id, x: I.x, z: I.z, c: I.c, s: I.s,
        levels: [{ w: 4, d: 4, y, h: top.y + top.h - y }] };
      o.userData.noMerge = true;
    });
    // 棟・木戸・櫓ごとに近い梁・板壁だけを透かす。離れた門や柵は深さを保つ。
    const smoothCopies = new Map();
    const smoothMat = (mat, owner) => {
      let copies = smoothCopies.get(owner);
      if (!copies) { copies = new Map(); smoothCopies.set(owner, copies); }
      if (!copies.has(mat)) {
        // 共有材質へ前の見通し処理が付いていても、同じ処理を二重に足さない。
        const m = cloneRoomNearMaterial(mat, { value: 0 }); m.userData.sgSmoothNear = true;
        // ほぼ透明な手前の板を何層も重ねると、門の中が白い箱に見える。
        // この戦の近い壁だけ抜き、残る板は奥の板を深さで遮る。
        const compile = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = (sh, renderer) => {
          compile.call(m, sh, renderer);
          sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.a *= camKeep;',
            'if (camKeep < 0.65) discard;');
        };
        m.customProgramCacheKey = () => key() + '|信貴山の近い板';
        m.transparent = false; m.depthWrite = true; m.alphaHash = false;
        m.forceSinglePass = true;
        copies.set(mat, m);
      }
      return copies.get(mat);
    };
    const prepareNearMesh = (o, room = null) => {
      if (!o.isMesh) return;
      let owner = room;
      for (let at = o; !owner && at && at !== rt.scene; at = at.parent) {
        if (at.userData.sgView) { owner = at.userData.sgView; break; }
        if (at.userData.naka?.sgOverhead) { owner = at.userData.naka; break; }
      }
      if (!owner) return;
      o.userData.camNear = true;
      o.material = Array.isArray(o.material) ? o.material.map(m => smoothMat(m, owner)) : smoothMat(o.material, owner);
      // 本人も視点も外にいる間は壁を残す。棟へ入り込んだ時だけ近い面を透かす。
      const materials = Array.isArray(o.material) ? o.material : [o.material], before = o.onBeforeRender;
      o.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        before.call(this, renderer, scene, camera, geometry, material, group);
        // 本人が外でも、肩越しの視点だけ棟へ入る場合は近い梁を透かす。
        // この棟の範囲だけを調べ、離れた門・柵の深さは保つ。
        const dx = camera.position.x - owner.x, dz = camera.position.z - owner.z;
        const lx = dx * owner.c - dz * owner.s, lz = dx * owner.s + dz * owner.c;
        let inside = !owner.gate && rt.player.u.naka === owner.id + 1;
        for (const lv of owner.levels) {
          // 壁のすぐ外でも肩越しの視点をふさぐ。足場と遠い壁は共通処理で残す。
          if (Math.abs(lx) < lv.w / 2 + 2 && Math.abs(lz) < lv.d / 2 + 2
              && camera.position.y > lv.y - .3 && camera.position.y < lv.y + lv.h + 2) { inside = true; break; }
        }
        for (const m of materials) m.userData.sgRoomInside.value = inside ? 1 : 0;
      };
    };
    rt.scene.traverse(o => prepareNearMesh(o));
    // 室内は接近してから作られる。開始時の走査にない壁にも同じ見通しを付ける。
    W.def.prepareInteriorMesh = (mesh, room) => mesh.traverse(o => prepareNearMesh(o, room));

    rt.world.setTime('night');
    // 寺公式の沿革は天正五年の堂塔焼失を記す。毘沙門堂は十月四日に焼けた（battle_learn）。夜攻めの夜は焼け跡が燻る。
    // https://www.sigisan.or.jp/about/
    // 堂の東寄りの火。西の山門と南への下り道は空ける。
    F.templeFire = rt.world.addFire(TEMPLE.x + 3, TEMPLE.z - 2, { size: 1.1, h: 0.8, blackSmoke: true });
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.banner('松永久秀、信長に背く', '本願寺攻めの陣を払い、信貴山城に籠もった');
    rt.obj('main', '筒井の先手と尾根道を登り、大手の木戸へ向かう', 'main');
    rt.say('組頭', '筒井の旗に続け。尾根道を進むぞ！', 5);
    // 筒井順慶との因縁：大和を十年争った宿敵。順慶の手が先導する。
    rt.after(6, () => { if (!F.ending) rt.say('筒井順慶', '大和を奪い合うて十八年。久秀との因縁、今宵こそ断つ！', 5); });
    rt.after(12, () => { if (!F.ending) rt.banner('片岡城、落ちる', '光秀らが支城を落とした。次は信貴山城'); });
    rt.after(20, () => { if (!F.ending) rt.say('明智光秀', '片岡は落ちた。信貴山の尾根へ諸口から寄せよ', 4); });
    rt.marker('tsu', unitPos(F.tsuU), '先手の持ち場', {});
    rt.after(5, () => this.climb(rt));
    F.climbTimer = rt.timers[rt.timers.length - 1];
  },

  // ① 尾根道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    // 城の麓の段（shigisan/fumoto.js）が済むまで待つ
    if (!rt.G.lord && !F.fumotoDone) { if (!F.paceFumoto) F.paceFumoto = installFumoto(rt, { dress, MATSU, ROAD, OPEN_I, march, next: () => this.climb(rt) }); return; }
    F.step = 1; F.assaultT = rt.t; F.stepT = rt.t;
    if (!rt.G.lord) F.paceOtoshi = installOtoshi(rt, { dress, MATSU, ROAD, CLIMB_END });   // 尾根道の石落とし（tower はこの段が済むまで待つ）
    rt.setPhase('climb'); rt.objProgress('main', '');
    rt.unmark('tsu');
    siegeSignal(rt, 'susume');
    rt.banner('進みの合図', '法螺貝と進み太鼓。筒井の衆に続け');
    rt.obj('main', '尾根道の伏兵を討ち、大手の木戸の前へ登る', 'main');
    rt.say('組頭', '法螺と進み太鼓じゃ！　列を離れず、先手に続け！', 4);
    F.guidePoint = { x: OPEN_PT[0], z: OPEN_PT[1] };
    rt.marker('climb', () => this.taskLabel(rt, '') === '先手と尾根の敵を退けよ' ? null : F.guidePoint, () => F.gateWaitT != null ? '先手を待つ所' : F.climbReturning ? '尾根道へ戻る' : '尾根道の角', { guideAlways: true, guideNear: 2 });
    F.climbMarker = rt.markers.find((m) => m.id === 'climb');
    const road = ROAD.slice(0, ROAD.findIndex((p) => p[1] === GATE.z));
    F.gateGather = { x: GATE.x, z: GATE.z + 6 };
    F.oda.forEach((g, i) => march(rt, g, road.slice(Math.max(1, OPEN_I - i) + 1)));
    F.ambCommitted = true; F.amb.ambush = false; F.amb.noAI = false; F.amb.speed = 2.3;
    F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'column'; g.colW = 2; g.seekRange = 24; };
    for (const u of F.amb.units) { u._crouch = false; u.aiT = 0; }
  },

  // ② 物見からの矢を受けながら打ち手を守る
  tower(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    if (!rt.G.lord && F.paceOtoshi && !F.otoshiDone) return;   // 尾根道の石落とし（shigisan/otoshi.js）が済むまで待つ
    F.step = 2; F.stepT = rt.t;
    F.climbReturning = false; F.approachByRoad = false;
    rt.setPhase('tower'); rt.objProgress('main', '');
    rt.unmark('amb'); rt.unmark('climb');
    rt.award((t) => t.side.push('尾根の伏兵を退けた'), '伏兵を退けた');
    rt.banner('門の前', '木戸の内から矢が降ってくる');
    rt.obj('main', '木戸の右脇の印に立ち、門を打つ組を矢から守る', 'main');
    rt.say('組頭', '門の右脇へ寄れ。矢を避け、打ち手を守れ！', 3.5);
    const P = TOWER_POST;
    F.tp = P;
    F.approachGuide = { x: P.x, z: P.z };
    rt.marker('tower', () => F.approachGuide, () => F.approachByRoad ? F.climbReturning ? '尾根道へ戻る' : '尾根道の角' : '打ち手を守る所', { h: 3, guideAlways: true, guideNear: 2 });
    // 「門脇で打ち手を守る　長押し」の札は出さない（10/28 採点）。持ち場に二秒立てば守りに就く。
    F.towerHoldT = 0;
    // 立つ所はピン一つで示す（白い破線の大きな輪は画面を横切った。10/28 採点）。長押しの判定の広さは同じ。
    // 打ち手は登城道の最後まで進める。門脇へ下げると、空堀と壊せない柵へ向かってしまう。
    F.ram.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    const cover = F.oda[0];
    if (!gone(cover)) {
      const approach = cover.order === 'path' && cover.path ? cover.path.slice(cover.pathIdx) : [];
      march(rt, cover, approach.concat(TOWER_APPROACH));
      cover.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    }
    // 遅れた先手も折り返しを通る。鉄砲組は道の後ろに止め、斜面への近道をさせない。
    for (let i = 0; i < 2; i++) {
      const g = F.oda[i];
      if (gone(g) || g === cover) continue;
      if (g.order === 'path' && g.path) {
        let stop = 0, best = Infinity;
        for (let j = 0; j < g.path.length; j++) {
          const p = g.path[j], d = Math.hypot(p[0] - GATE.x, p[1] - (GATE.z + 20 + i * 8));
          if (d < best) { best = d; stop = j; }
        }
        if (stop >= g.pathIdx) g.path = g.path.slice(0, stop + 1);
        else g.order = 'hold';
      }
      g.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    }
  },
  coverTower(rt, byPlayer = true) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || F.towerCovered) return;
    F.towerCovered = true;
    rt.uninteract('tower'); rt.unmark('tower'); rt.unzone('tower');
    // 攻め手は櫓に火を放たず、門前の打ち手を守る。
    if (byPlayer) rt.award((t) => t.side.push('矢を防ぎ、門前の打ち手を守った'), '門前の打ち手を守った');
    this.gateFight(rt);
  },

  // ③ 門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.climbReturning = false; F.approachByRoad = false;
    rt.setPhase('gate'); rt.objProgress('main', '');
    rt.obj('main', '大手の木戸の正面で、掛矢で門を打つ', 'main');
    rt.say('組頭', '門の正面へ！　打ち手と力を合わせ、門を打ち破れ！', 3.5);
    // 持ち場の下知は任務の案内から読む。古い門脇の台詞を次の段へ持ち越さない。
    const R = F.ram;
    // 遅れた打ち手も九十九折りを登り切り、土橋の正面から門へ取り付く。
    const approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    // 土橋で北へ向き直ってから到着を判定する。斜めの縦隊のままだと後列が空堀へ出る。
    approach.push([GATE.x, GATE.z + 6], [GATE.x, GATE.z + 4]);
    march(rt, R, approach);
    // 門前の一人が持ち場へ着けば打ち始める。後列五人を待って止めない。
    R.arriveCount = 1; R.arriveRadius = 2;
    R.aggro = 2;
    R.onArrive = (q) => {
      q.order = 'assault'; q.formation = 'column'; q.facing = Math.PI;
      q.assault = () => (F.gate.alive ? F.gate : null);
    };
    for (const g of [F.tsutsui, F.ake]) {
      if (g.order === 'path') g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; q.seekRange = 20; };
      else { g.order = 'hold'; g.formation = 'yari'; g.facing = Math.PI; g.seekRange = 20; }
    }
    const hitPoint = { x: GATE.x, z: GATE.z + 1.4 };
    F.gateHitPoint = hitPoint;
    F.approachGuide = { x: hitPoint.x, z: hitPoint.z };
    rt.marker('gate', () => F.approachGuide, () => F.approachByRoad ? F.climbReturning ? '尾根道へ戻る' : '尾根道の角' : '門を打つ所', { h: 4, guideAlways: true, guideNear: 2 });
    rt.addInteract('ramgate', hitPoint, '掛矢で門を打つ', () => {
      if (F.step !== 3 || F.ending || rt.over || !rt.player.u.alive || !F.gate.alive) return;
      rt.army.damage(F.gate, 55, rt.player.u);
      rt.army.play('wood', GATE, 1.1);
      rt.game.hitstop = 0.05;
    }, { r: 4.6, hold: 0.6 });
    F.sally.aggro = 16; // 木戸の内で構え、攻め手を受ける。
    // 門を打つ間、木戸の脇の守りの刃は浅く（10/31 bot：先手が門前で削られ尽きて退いた）。門が破れた後の駆け下りで元へ戻す。
    F.sally.dmgMult = 0.45; F.arch.dmgMult = 0.4;
    if (!F.gate.alive) this.interior(rt);

  },

  // ③.2 付け入り（山中城の型・docs/kaito_refs_1103 ref04〜07）：門が割れかけると、城兵が木戸を内から開き、
  //   打ち手を討ちに打って出る。土橋の前で迎え撃ち、崩れて門内へ退く兵に続いて城内へ入る。
  sallyOut(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.ending || rt.over || !rt.player.u.alive) return;
    // 控えが既に退いた時も、掛矢と一分後の開門を止めない。門の破壊処理から城内へ進む。
    if (gone(F.sally)) {
      if (F.gate.hp > 0) rt.army.damage(F.gate, F.gate.hp / (1 - F.gate.armor) + 1, null);
      return;
    }
    F.step = 3.2; F.stepT = rt.t; F.sallyOpen = true;
    rt.setPhase('sally'); rt.objProgress('main', '');
    rt.uninteract('ramgate'); rt.unmark('gate');
    // 扉は内へ開く。割れ板は撒かず、門の口を空ける（通れる）。
    if (F.gate.mesh) F.gate.mesh.visible = false;
    rt.army.damage(F.gate, F.gate.hp / (1 - F.gate.armor) + 1, null);
    rt.army.playFar('wood', { x: GATE.x, y: rt.world.heightAt(GATE.x, GATE.z), z: GATE.z }, 1);   // 門は塀の当たり（pos が無い）。門の場所から鳴らす
    rt.banner('木戸が開く', '松永勢が打ち手を討ちに打って出た');
    rt.obj('main', '門から打って出た松永勢を、土橋の前で迎え撃つ', 'main');
    rt.say('組頭', '木戸が開いたぞ！　打って出た敵を土橋で止めよ！　打ち手を討たせるな！', 4);
    const S = F.sally;
    F.sallyN = S.units.filter((u) => u.alive).length;
    S.fixed = false; S.noAI = false; S.ambush = false; S.dmgMult = 1; S.speed = 3.4; S.morale = 70;
    // 11/5 bot：控えの持ち場（門の東）から列を組むと、列の後ろが東の高みへ伸び、十数人が門と逆へ歩いて詰まった。
    //   列の頭を門の内の道に置き、後ろは城内の道（北）へ伸ばす。
    S.anchor = { x: GATE.x, z: GATE.z - 8 };
    march(rt, S, [[GATE.x, GATE.z - 6], [GATE.x, GATE.z + 2], [GATE.x, GATE.z + 8]]);
    S.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.width = 7; g.seekRange = 24; g.aggro = 18; };
    for (const u of S.units) { u.aiT = 0; u.target = null; }
    // 打ち手は掛矢を置き、槍で受ける。先手も門の前で迎える。
    const R = F.ram; R.assault = null; R.order = 'hold'; R.aggro = 10; R.seekRange = 14;
    for (const g of [F.tsutsui, F.ake]) if (!gone(g)) { g.aggro = 16; g.seekRange = 22; }
    F.arch.dmgMult = 1;
    // 門の内の弓は門の口を空けて東の脇へ寄る（打って出る兵が弓の列に詰まって門を出られなかった。11/5 bot）。
    if (!gone(F.arch)) { F.arch.fixed = false; F.arch.anchor = { x: GATE.x + 14, z: GATE.z - 5 }; F.arch.order = 'hold'; }
    const at = centerOf(S);
    rt.marker('sally', () => (gone(S) || F.step !== 3.2 ? null : at()),'打って出た松永勢', { red: true, group: S });
  },
  // 迎え撃った兵が崩れて門内へ退く。その背に続いて門を抜ける（付け入り）。
  tsukeiri(rt) {
    const F = rt.flags;
    if (F.step !== 3.2) return;
    rt.unmark('sally');
    const S = F.sally;
    if (!gone(S)) {
      const g0 = ROAD.findIndex((p) => p[1] === GATE.z), a1 = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
      S.retreatOnly = true; S.noRout = true;
      // 11/6 fixc1845：退く兵の周りは寄せ手だらけなので、傷ついた守りの「退く道が空いているか」の見張りが道を塞がれたと見て、
      //   付け入りの退きを門前の持ち場（hold）へ戻していた（打って出た二十余人が門前に三分残り、本人も門前で止まった）。付け入りの後は見張りから外す。
      if (F.withdraw) F.withdraw = F.withdraw.filter((w) => w.g !== S);
      march(rt, S,[[GATE.x, GATE.z + 2]].concat(ROAD.slice(g0, a1 + 1)));
      S.onArrive = (g) => { g.order = 'hold'; g.retreatOnly = false; g.formation = 'yari'; g.facing = Math.PI; };
    }
    rt.award((t) => t.side.push('打って出た松永勢を土橋で退けた'), '打って出た敵を退けた');
    rt.banner('付け入り', '退く松永勢に紛れて、門の内へ');
    rt.say('組頭', '敵が退くぞ！　木戸を閉めさせるな！　背について門の内へ入れ！', 4);
    this.interior(rt);
  },

  // ③.5 下の曲輪を足場に取り、西の尾根道から本丸の南の口へ寄せる。
  // 屋敷は独立した守りとして残し、遠い曲輪の全掃討を勝利条件にしない。
  interior(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t;
    // 寺の火は始まりからの燻り（11/5：毘沙門堂は十月四日に焼けた。十日の夜攻めの最中に燃え出すのは史実と合わない）。
    rt.setPhase('interior'); rt.objProgress('main', '');
    rt.uninteract('ramgate'); rt.uninteract('tower'); rt.unzone('tower');
    for (const id of ['tower', 'gate', 'sally', 'gather']) rt.unmark(id);
    for (const o of rt.objectives.slice()) if (o.id.startsWith('yagura_take_')) { rt.objRemove(o.id); rt.unmark(o.id); }
    for (const id of Array.from(rt.orderObjectives?.keys() || [])) if (id.startsWith('yagura_take_')) rt.objRemove(id);
    rt.award((t) => t.side.push('門を破った'), '門を破った');
    siegeSignal(rt, 'kakari');
    rt.after(1.8, () => {
      if (!F.ending && !rt.over && rt.player.u.alive && F.step === 3.5) rt.army.play('toki', F.tsuU.pos, 0.7);
    });
    rt.banner('門、破れる', '先手に続き、北尾根の下の曲輪へ進む');
    rt.obj('main', F.sallyOpen ? '退く松永勢に続いて門を抜け、北尾根の下の曲輪を取る' : '門を抜け、北尾根の下の曲輪を取る', 'main');
    rt.say('組頭', '早打ちは懸かれの合図じゃ！　門を抜け、北の曲輪へ寄せよ！', 4);
    // 門を破る組は掛矢を置いて門の内の口を固める（三組が同じ尾根道に重なって止まっていた。二巡 豊臣A 11/9）
    for (const q of F.oda) if (q !== F.ram) march(rt, q, ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1));
    F.ram.assault = null;
    if (!gone(F.ram)) { F.ram.order = 'move'; F.ram.dest = { x: GATE.x - 8, z: GATE.z - 6 }; F.ram.onArrive = (q) => { q.order = 'hold'; q.aggro = 12; q.seekRange = 16; }; }
    // kaito 10/31：曲輪ごとに一組ずつ待たせない。上と下の曲輪の兵が木戸脇の控えと一つの群れになり、
    //   門を抜けた寄せ手へ尾根道を一斉に駆け下りて打ちかかる（屋敷と本丸の守りは残す）。
    // 付け入りの時は、打って出た兵がもう退いている。曲輪の兵は持ち場で槍をそろえて受ける。
    if (!F.sallyOpen) {
      const g0 = ROAD.findIndex((p) => p[1] === GATE.z);
      const a1 = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z), a2 = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
      const charge = (q) => { q.order = 'attack'; q.formation = 'yari'; q.width = 9; q.seekRange = 30; q.aggro = 16; };
      for (const [g, from] of [[F.rg2, a2], [F.rg1, a1]]) {
        if (gone(g) || from < 0 || g0 < 0) continue;
        march(rt, g, ROAD.slice(g0, from).reverse());
        g.aggro = 16; g.speed = 3.4; g.onArrive = charge;
        const w = F.withdraw.find((x) => x.g === g);
        if (w) w.sent = true;
      }
      if (!gone(F.sally)) { F.sally.fixed = false; F.sally.dmgMult = 1; charge(F.sally); }
    }
    // 柵の口から八歩も曲輪に含める。後列五人の到着を待たず、敵を退ければ確保できる。
    const entry = (id, c) => (x, z) => F.C.kuruwa[id].test(x, z)
      || Math.hypot(x - c.x, z - c.z - c.r) <= 8;
    const entryShu = (x, z) => (F.C.kuruwa.shu.test(x, z) && z > TOP.z - 1)
      || Math.hypot(x - TOP.x, z - TOP.z - TOP.r) <= 8;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'ridge1', name: '北尾根の曲輪（下）', test: entry('ridge1', RIDGE1), pos: F.C.kuruwa.ridge1.centroid, need: 1, hold: 5 },
        { id: 'ridge2', name: '北尾根の曲輪（上）', test: F.C.kuruwa.ridge2.test, pos: F.C.kuruwa.ridge2.centroid, need: 5, hold: 10 },
        { id: 'yashiki', name: '松永屋敷', test: F.C.kuruwa.yashiki.test, pos: F.C.kuruwa.yashiki.centroid, need: 5, hold: 10 },
        { id: 'shu', name: '本丸', test: entryShu, pos: { x: TOP.x, z: TOP.z + 8 }, need: 2, hold: 8 },
      ],
      links: [['ridge1', 'ridge2'], ['ridge1', 'yashiki'], ['ridge2', 'shu'], ['yashiki', 'shu']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      // 退く兵・負傷兵・本丸の館内の父子で曲輪の確保を止めない。
      // 11/6 fixc2137：物見櫓の上（床の高さ九歩）の侍二人で下の曲輪が敵のままになり、曲輪の兵を討っても取れずに「別の先手」で済んでいた。地面に立つ兵だけ数える。
      unitFilter: (u) => !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.abs(u.pos.y - rt.world.heightAt(u.pos.x, u.pos.z)) < 3,
      onFall: (id) => this.onZoneFall(rt, id),
    });
    this.castleGuide(rt, ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1), 'rg1', '敵のいる下の曲輪');
    F.lowerBest = Infinity; F.lowerStallAt = rt.t;
    if (!rt.G.lord) F.paceKaeshi = installKaeshi(rt, { dress, MATSU, TSUTSUI, RIDGE1, RIDGE2, GATE, ROAD, march, next: () => { if (F.honmaruWanted) this.honmaru(rt); } });   // 城内の火・逆寄せ・筒井の後続

  },
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.SZ.byId[id].owner !== ZONE_STATE.FRIEND) return;
    if (id === 'ridge1') {
      if (F.lowerTaken) return;
      // 別の先手だけで制圧しても、本人が曲輪の口へ着くまで④を済ませない。
      const p = rt.player.u.pos;
      if (rt.player.u.naka || !F.SZ.byId.ridge1.test(p.x, p.z) ||
          Math.abs(p.y - rt.world.heightAt(p.x, p.z)) > 2.5) return;
      F.lowerTaken = true; F.stepT = rt.t;
      rt.award((t) => t.side.push('北尾根の下の曲輪を取った'), '下の曲輪を取った');
      rt.unmark('rg1'); F.innerDone = true; F.innerRoute = 'ridge2';
      rt.say('組頭', 'よし、味方の足場ができた！　西の尾根道を回り、本丸の南の口へ寄せよ！', 4.5);
      this.honmaru(rt);
    } else if ((id === 'ridge2' || id === 'yashiki') && F.lowerTaken) {
      rt.award((t) => t.side.push(id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ'), id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ');
    }
  },

  // ④ 本丸の館の前
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    if (!rt.G.lord && F.paceKaeshi && !F.kaeshiDone) { F.honmaruWanted = true; return; }   // 逆寄せの段（shigisan/kaeshi.js）が済むまで待つ
    F.step = 4; F.stepT = rt.t;
    if (!rt.G.lord) F.paceKousan = installKousan(rt, { dress, MATSU, TOP });
    // 炎上後の持ち場への下知は、本人が南口を制圧して守ってから出す。
    // 道中で切り替えると、門前から切岸越しに南口の外へ直進して止まる。
    rt.setPhase('honmaru'); rt.objProgress('main', '');
    rt.unmark('gate'); rt.unmark('sally');
    siegeSignal(rt, 'susume');
    rt.banner('本丸へ', '木戸の内で、松永の衆が槍をそろえる');
    rt.obj('main', '西の尾根道から本丸の南口へ攻め入る', 'main');
    // 11/5：筒井の先手が押し返された後、三の丸あたりから火の手が上がって城の守りが乱れた（多聞院日記の猛火・和州諸将軍伝の内通）。字でなく火で見せる。
    rt.after(25, () => { if (!F.ending && !F.endPending && !rt.over) this.betrayal(rt); });
    rt.say('組頭', '進み太鼓じゃ！　西の尾根道から本丸の南口へ！　敵を退け、先手と口を守れ！', 4);
    rt.marker('l1', centerOf(F.last[0]), '本丸の守り', { red: true, group: F.last[0] });
    rt.unmark('rg2'); rt.unmark('yashiki'); rt.unmark('branch'); rt.uninteract('yashikiRoute');
    const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
    // 本丸への下知で上の曲輪の中心へ往復させない。屋敷からの帰路にもある西の帯道を使う。
    // 別の先手へ任せた下の曲輪にも入り直さず、南の口から同じ帯道へ進む。
    const west = ROAD.findIndex((p) => p[0] === -60 && p[1] === -166);
    const route = F.innerRoute === 'yashiki' ? ROUTES.find((q) => q.id === 'yashiki').pts.slice(6).concat([[0, TOP.z + 8]])
      : ROAD.slice(F.lowerBypass ? a + 1 : a, a + 2).concat(ROAD.slice(west));
    const approachEnd = F.lowerBypass ? ROAD[a] : route[0];
    for (const q of F.oda) {
      // 遅れた隊は通りかけの道から合流。未通過の柵や切岸を直線で横切らせない。
      const end = q.path?.[q.path.length - 1];
      const approach = q.order === 'path' && end && end[0] === approachEnd[0] && end[1] === approachEnd[1]
        ? q.path.slice(q.pathIdx, -1) : [];
      march(rt, q, approach.concat(route));
    }
    // 後詰め：筒井の新手が門を抜けて続く（先手が尽きて負け続けた。bot 10/30）。
    {
      const rg = allyGroup(rt, { name: '筒井の後詰め', anchor: { x: GATE.x, z: GATE.z + 10 }, facing: Math.PI, width: 5, aggro: 10, noRout: true, formation: 'column' },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }], TSUTSUI));
      rg.noRout = true; rg.formation = 'column'; rg.width = 5; rg.defMult = 2.6; rg.dmgMult = 1;
      for (const u of rg.units) { const q = rg.slotPos(u.slot, rg.initial); u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z); u.mesh.position.copy(u.pos); }
      F.oda.push(rg);
      // 門外の後詰めにも、木戸から下の曲輪までの折り返しを渡す。
      // 先手用の道だけでは、最初の曲輪へ切岸を直進して詰まる。
      const gate = ROAD.findIndex((p) => p[0] === GATE.x && p[1] === GATE.z);
      march(rt, rg, ROAD.slice(gate, F.lowerBypass ? a - 1 : a).concat(route));
      rt.say('組頭', '筒井の後詰めが門を抜けたぞ！　続け！', 4);
    }
    // 本人も通過前の角を保つが、任せた曲輪の中心へ向かう最後の区間だけは外す。
    let previous = F.castleRoute || [];
    const from = F.castleGuideI || 1;
    if (F.lowerBypass) {
      const mouth = previous.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z + RIDGE1.r);
      if (mouth >= 0) previous = previous.slice(0, mouth + 1);
    }
    this.castleGuide(rt, previous.concat(route), 'honmaru', '本丸の南口');
    // 六歩に分け直すと丸め誤差で古い区間が再分割される。同じ番号でなく、同じ角を引き継ぐ。
    const oldPoint = previous[Math.min(from, previous.length - 1)];
    if (oldPoint) {
      const index = F.castleRoute.findIndex((p) => Math.hypot(p[0] - oldPoint[0], p[1] - oldPoint[1]) < 0.01);
      F.castleGuideI = index > 0 ? index : Math.min(from, F.castleRoute.length - 1);
    }
    F.castleGuidePoint.x = F.castleRoute[F.castleGuideI][0];
    F.castleGuidePoint.z = F.castleRoute[F.castleGuideI][1];
    rt.after(6, () => { if (!F.ending && !rt.over && rt.player.u.alive) this.betrayal(rt); });
  },

  // 遠い目的地へ直進させず、味方と同じ道の次の角を示す。入れ物は段の始めに一度だけ作る。
  castleGuide(rt, route, id, label) {
    const F = rt.flags;
    // 登城道への帰り指示を、門を抜けた後の下知へ持ち越さない。
    F.climbReturning = false;
    // 長い直線も六歩ずつ示す。遠い角だけを指して、途中の坂や柵を横切らせない。
    const points = [route[0]];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (distance < 0.01) continue; // 前の道の終点と、次の道の始点の重複を除く。
      const n = Math.max(1, Math.ceil(distance / 6));
      for (let k = 1; k <= n; k++) points.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    route = points;
    F.castleRoute = route; F.castleGuideI = 1; F.castleGuideReturning = false; F.castleGuideArrived = false;
    F.castleGuidePoint = { x: route[1][0], z: route[1][1] };
    F.castleGuideProbe = { x: 0, z: 0 };
    F.castleExit = { room: null, through: false, guide: null };
    F.castleGuideLeaving = false; F.castleGuideBlocked = false;
    // 外壁と櫓の脚組みを回る角は、この段の始めに一度だけ用意する。
    const obstacles = [...BUILDINGS, { ...TOWER, w: 5, d: 5 },
      { x: RIDGE1.x - 7, z: RIDGE1.z - 4, w: 5, d: 5 },
      { x: RIDGE4.x - 5, z: RIDGE4.z + 1.5, w: 5, d: 5 },
      { x: YASHIKI.x - 6, z: YASHIKI.z + 7, w: 5, d: 5 }];
    const corners = obstacles.map((o) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const x = o.x + sx * (o.w / 2 + 1.2), z = o.z + sz * (o.d / 2 + 1.2);
      return { x, y: rt.world.heightAt(x, z), z, near: false, from: false, to: false };
    }));
    // 押されて柵の外へ出た時も、実際の端から口へ戻す。建物の角だけでは
    // 長い板塀の脇に戻り口が見つからない。道に近い区画の角を支度時だけ足す。
    for (const s of rt.army.units) {
      if (!s.alive || !s.isStruct || !s.seg) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.1 || !route.some(([x, z]) => Math.min(Math.hypot(x - ax, z - az), Math.hypot(x - bx, z - bz)) < 12)) continue;
      const tx = dx / len * 1.2, tz = dz / len * 1.2, nx = -tz, nz = tx;
      corners.push([[ax - tx + nx, az - tz + nz], [bx + tx + nx, bz + tz + nz],
        [bx + tx - nx, bz + tz - nz], [ax - tx - nx, az - tz - nz]].map(([x, z]) =>
        ({ x, y: rt.world.heightAt(x, z), z, near: false, from: false, to: false })));
    }
    F.castleGuideBend = { goal: { x: 0, y: 0, z: 0 }, probe: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 },
      turn: { x: 0, y: 0, z: 0 }, corners, twoTurns: false, active: false, next: 0 };
    F.castleGuideDetouring = false;
    rt.marker(id, () => F.castleGuideBlocked || this.castleFightNeeded(rt) ? null : F.castleGuidePoint, () => F.castleGuideLeaving ? rt.player.u.nakaLevel > 0 ? '下り階段へ' : '戸口から外へ' : F.castleGuideDetouring ? '建物や柵の回り道' : F.castleGuideReturning ? '道へ戻る' : F.castleGuideI === route.length - 1 ? label : id === 'honmaru' ? '本丸へ続く尾根道' : '曲輪へ続く尾根道', { guideAlways: true, guideNear: 2 });
  },

  // 内通の伝承を遊びの段として残す。久秀による天主の放火とは分ける。
  betrayal(rt) {
    const F = rt.flags;
    if (F.betrayed) return;
    F.betrayed = true; F.betrayalAt = rt.t;
    const g = F.mori;
    g.team = 0; g.noAI = false; g.aggro = 18; g.seekRange = 24; g.order = 'hold'; g.facing = Math.PI;
    for (const u of g.units) { u.team = 0; u.noTarget = false; u.invuln = false; u.target = null; u.aiT = 0; u.playerOpeningBlocked = false; }
    // 古い敵の狙いを消す。味方になった鉄砲組へ味方が撃ち続けない。
    for (const u of rt.army.units) if (u.target?.team === u.team) { u.target = null; u.aiT = 0; }
    // 三の丸あたりの火の手（鉄砲組の脇。持ち場の兵には重ねない）
    F.sannomaruFire = rt.world.addFire(TOP.x - 15, TOP.z + 7, { size: 2.4, h: 2.6, blackSmoke: true });
    rt.banner('三の丸から火の手', '城内の鉄砲組が寝返った');
    rt.say('使番', '城内の鉄砲組が織田方へ寝返ったとの知らせじゃ！', 5);
  },

  win(rt, otherFront = false) {
    const F = rt.flags;
    if (F.ending || F.endPending) return;
    // 降伏の勧めと本丸の打って出（shigisan/kousan.js）が済むまで落城にしない（まだ本丸の段に入っていなければ入れる）
    if (!rt.G.lord && (F.paceKaeshi || F.paceKousan) && !(F.kousanDone && F.enjouDone)) { if (F.kaeshiDone && F.step < 4) this.honmaru(rt); return; }
    // 本丸の制圧から直接呼ばれる時も、南口を二十秒守る条件を省略しない。
    if (!honmaruPostReached(rt) || !F.reachedShu) return;
    // 諸口の決着が先でも、内通の段を父子の最期の知らせより前に見せる。
    if (!F.betrayed || rt.t - F.betrayalAt < 8) {
      this.betrayal(rt); F.endPending = true;
      rt.after(Math.max(0.5, 8 - (rt.t - F.betrayalAt)), () => {
        F.endPending = false;
        // 待つ間に本丸を押し返された時は、本人の城取りをまだ認めない。
        const zone = F.SZ?.byId.shu;
        const held = honmaruPostReached(rt) && (otherFront || zone.test(rt.player.u.pos.x, rt.player.u.pos.z));
        if (held && !F.ending && !rt.over && rt.player.u.alive) this.win(rt, otherFront);
      });
      return;
    }
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (const id of ['tsu', 'amb', 'branch', 'climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
    rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower');
    // 落城を見聞きできる本丸の兵だけに伝える。離れた曲輪の守りは残す。
    for (const q of F.last || []) if (!gone(q) && Math.hypot(q.center().x - TOP.x, q.center().z - TOP.z) < TOP.r + 12) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    // 目標の済は締める時に付ける（済を付けると共通の締めが二秒半で先に走り、天主の火を見せる前に勝ちの札が出た）
    if (otherFront && F.reachedShu) {
      F.settleWin = true;
      rt.say('組頭', '諸口の味方と本丸へ攻め入ったぞ！　口を固めよ！', 5);
      rt.award((t) => { t.main = true; t.special = { label: '信貴山城の本丸の南口まで攻め上った', pts: 15 }; }, '信貴山城を攻め落とした');
    } else if (otherFront) {
      rt.objFail('main'); rt.tracker.main = false;
      rt.say('組頭', '諸口の味方が本丸へ入った！　こちらは持ち場を守れ！', 5);
    } else {
      F.settleWin = true;
      rt.award((t) => { t.main = true; t.special = { label: '信貴山城の本丸の館の前まで攻め入った', pts: 20 }; }, '信貴山城を攻め落とした');
    }
    sfx('horagai', 0.8);
    rt.banner('久秀、天主に火をかける', '');   // 11/5：出典の断りは画面に出さない（五1）。history に書く
    const W = rt.world;
    // 館の南壁から火を出す。軒の外の空中へ置かず、根元は壁の足元に残す。
    F.castleFire = W.addFire(KEEP_AT.x, KEEP_AT.z + ATTACK_PLAN.lordSeat.d / 2 - 0.2,
      { size: 2, h: 0.45, blackSmoke: true });
    F.castleFireAt = rt.t;
    // 城内の自害は戦後の語りで知らせ、足軽による討取りにしない。
    // 天主の火（信長公記：久秀が自ら火をかけて焼死）。平蜘蛛・爆死の伝えは絵にしない。
    rt.marker('keep', { x: KEEP_AT.x, z: KEEP_AT.z }, '天主の上の階', { h: KEEP_AT.up + 2 });
    // kaito 11/1 の紙：平蜘蛛と爆死は後の脚色が強い。史実の演出にせず、天主の火と自害だけを見せる。
    rt.after(1.2, () => rt.say('松永久秀', '信長に頭は下げぬ。この城と共に果てるまでよ', 4));
    rt.after(3.4, () => {
      // 最期の言葉の後、姿を消さず室内で倒す。田野と同じ自害の処理で、
      // 通常の討取りの知らせや手柄を発生させず、室内の床を保つ。
      for (const u of [F.ehon.lord, F.hisamichi]) {
        u.alive = false; u.hp = 0; u.noTarget = true; u.deadT = 0;
        u.atk = null; u.swing = null; u.target = null;
        u.death = { kind: 'side', side: 1, t: 0, pace: 1, floor: true, fwd: false };
        if (u.human) u.human.still = false;
      }
      // 11/6 fixc2137：火が館の内（床から一歩余り）にあり、壁と屋根に隠れて本丸の南口から一度も見えなかった（描いて遊んだ写真）。屋根を抜けて炎と黒煙が立つ高さに。
      W.addFire(KEEP_AT.x, KEEP_AT.z, { size: 4.5, h: KEEP_AT.up + 0.5, blackSmoke: true });
      rt.banner('久秀の最期', '天主は燃え落ち、久秀は城内で自害した');
    });
    rt.after(5.2, () => rt.say('筒井順慶', '久秀め、自ら火をかけたか……。大和は筒井が預かる', 5));
    rt.after(6.4, () => rt.say('', '――大和の山城は落ちた。だが、大坂では本願寺との戦が続く', 4.5));
    // 固有の終幕を保つ。共通の追撃へ移ると、父子の最期を伝える台詞が消える。
    rt.after(0.5, function growFire() {
      shigisan.withdrawTick(rt);
      if (!rt.ended && rt.t - F.castleFireAt < 28) rt.after(0.5, growFire);
    });
    // 11/6 fixc2137：締めると戦の時計が止まり（勝ちの札は四秒半で閉じる）、上の天主の火・久秀の最期・順慶の言葉が一つも出ずに終わっていた（描いて遊んだ写真・九7・四6）。
    //   天主に火が回り、順慶の言葉と語りが出てから締める。
    // 11/6 fixc0814（描いて遊んだ終わり・二度）：カメラは勝手に回らない（kaito 11/2 V）ので、西から口へ来た本人は
    //   東を向いたまま、北の天主の火を一度も見ずに勝ちの札になっていた（四6・二4）。▼「天主の上の階」を残し、本人が天主の方を向いて
    //   二秒見るまで締めを待つ（二十秒で締める）。
    F.keepSeen = 0;
    // 左右が合っていても、空や足元を見ている間は火を見たことにしない。
    const keepView = new THREE.Vector3();
    const settle = () => {
      if (rt.over) return;
      const pl = rt.player, P = pl?.u?.pos;
      // 終幕の待ち時間中に倒れた本人へ、南口を守り切った印を付けない。
      if (!P || !pl.u.alive || pl.u.hp <= 0) return;
      if (rt.t - F.castleFireAt < 27) {
        rt.camera.updateMatrixWorld();
        keepView.set(KEEP_AT.x, W.heightAt(KEEP_AT.x, KEEP_AT.z) + KEEP_AT.up + 2, KEEP_AT.z).project(rt.camera);
        const visible = Math.abs(keepView.x) < 0.9 && Math.abs(keepView.y) < 0.9 && keepView.z > -1 && keepView.z < 1;
        F.keepSeen = visible ? F.keepSeen + 0.5 : 0;
        if (F.keepSeen < 2) { rt.after(0.5, settle); return; }
      }
      rt.unmark('keep');
      if (F.settleWin) { rt.objDone('main'); rt.tracker.main = true; }
      rt.finish({ scriptedEnd: true, failureReason: otherFront && !F.reachedShu
        ? '本丸の持ち場を取る前に、別の攻め口の味方が城を落とした。' : undefined }, 15);
    };
    // 六・四秒後に始まる四・五秒の語りを、勝利の札で遮らない。
    rt.after(11.4, settle);
  },

  update(rt, dt) {
    { const F = rt.flags; F.paceFumoto?.update(dt); F.paceOtoshi?.update(dt); F.paceKaeshi?.update(dt); F.paceKousan?.update(dt); F.paceEnjou?.update(dt); }   // 15分の段（prototype/src/shigisan/*.js）
    // 門を打つ間は打ち手を守る段。本人狙いは門が破れてからの群れの寄せで使う。
    if (rt.flags.step >= 3.5) huntPlayer(rt, dt);
    allyPace(rt);
    gateVolley(rt, dt);
    tabaTick(rt, dt);
    if (rt.flags.rocks && !rt.over) rt.flags.rocks.tick(dt);
    // 11/6 fixc1429（critic60「灰紫の色の無い人形」「空に兵が浮く」・九5・十5）：持ち場の三十五歩先から置いていた描いただけの乱戦（addClash）をやめた。
    //   軽い兵は近くでは人形に見え、山の斜面の上で空に浮いた。合戦の広さは麓の包囲の備え（遠く）と、本物の兵で見せる。
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    // 最初の一人を見失っても、他の守兵がいつまでも本人を見逃さない。
    if (F.step >= 1 && rt.t - F.assaultT >= 25) F.firstFightDone = true;
    // 最初は見える徒歩の敵一人だけが本人へ打ちかかる。味方との戦いは続く。
    if (F.step >= 1 && rt.t >= 12 && !F.firstFoe && !F.firstFightDone) {
      let nearest = 12;
      for (const u of F.amb.units) if (u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u) && !rt.army.wallBetween(u.pos, -1, rt.player.u.pos)) {
        const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
        if (d < nearest) { nearest = d; F.firstFoe = u; }
      }
      if (F.firstFoe) { rt.say('組頭', '敵が来るぞ！　槍をそろえ、ここで食い止めよ！', 4); }
      else if (F.step >= 2 && gone(F.amb)) F.firstFightDone = true;
    }
    if (F.firstFoe && !F.firstFightDone) {
      const u = F.firstFoe, p = rt.player.u;
      if (!u.alive || u.fleeing || u.woundOut) F.firstFightDone = true;
      else {
        u.target = p; u.aiT = 0.5;
        if (F.firstFightT == null && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 3 && !rt.army.wallBetween(u.pos, -1, p.pos)) F.firstFightT = rt.t;
        if (F.firstFightT != null && rt.t - F.firstFightT >= 12) F.firstFightDone = true;
      }
    }
    if (rt.t >= F.sgFrontAt) {
      F.sgFrontAt = rt.t + 0.5; F.sgFront.length = 0;
      const p = rt.player.u, limit = F.firstFightDone ? (F.step < 3.5 ? 2 : 3) : 1;
      for (const u of rt.army.units) {
        if (u.team === p.team || !u.alive || u.fleeing || u.woundOut || u.gone || u.noTarget || u.isStruct || u.group?.noAI || u.group?.ambush) continue;
        if ((u.type === 'gun' || u.type === 'bow') && !u.sidearm || !F.firstFightDone && u !== F.firstFoe) continue;
        const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
        if (d > 12 || Math.abs(u.pos.y - p.pos.y) > 3 || !localClear(rt.army, u.pos, p.pos, true)) continue;
        u.sgDistance = d;
        let i = 0;
        while (i < F.sgFront.length && F.sgFront[i].sgDistance <= d) i++;
        if (i < limit) {
          for (let j = Math.min(limit - 1, F.sgFront.length); j > i; j--) F.sgFront[j] = F.sgFront[j - 1];
          F.sgFront[i] = u;
        }
      }
    }
    F.sgRest = F.firstFightDone && (rt.t - F.assaultT) % 8 >= 6;
    for (const u of rt.army.units) if (u.team === 1) {
      const ranged = (u.type === 'gun' || u.type === 'bow') && !u.sidearm;
      u.playerOpeningBlocked = rt.t < 12 || (!F.firstFightDone ? u !== F.firstFoe : !ranged && (F.sgRest || !F.sgFront.includes(u)));
    }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    // 曲輪を取り、南口を二十秒守ってから、諸口の味方と落城の締めへ。
    // 待つ間も口を守る。時間だけで未達の目標を失敗や勝利にしない。
    if (honmaruPostReached(rt)) {
      if (!F.reachedShu) {
        F.shuT = (F.shuT || 0) + dt;
        if (F.shuT >= 20) { F.reachedShu = true; F.reachedWinAt = rt.t + 15; }
      }
    } else {
      F.shuT = 0; F.reachedShu = false; F.reachedWinAt = 0;
    }
    if (!rt.G.lord && F.kousanDone && F.reachedShu && !F.paceEnjou) {
      F.paceEnjou = installEnjou(rt, { dress, MATSU, TOP, betrayal: () => this.betrayal(rt) });
    }
    if (F.reachedWinAt && rt.t >= F.reachedWinAt) {
      this.win(rt, true);
      // 降伏拒否・炎上の段を待つ間も、道案内と止まった先手の復帰を続ける。
      if (F.ending || F.endPending) return;
    }
    // 別口による落城を、戦後に初めて知らされないよう一度だけ伝える。
    if (rt.t >= 390 && !F.otherFrontSaid) {
      F.otherFrontSaid = true;
      rt.say('使番', F.step >= 3.5
        ? '別の攻め口の味方が本丸へ迫る！　こちらも先手と本丸の南口へ！'
        : '別の攻め口の味方が本丸へ迫る！　こちらは先手と今の持ち場を守れ！', 6);
    }
    // 門の内の控えを門外へ呼び出さない。段を越えた守兵だけを寄せる。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, F.step < 3.5 ? [F.amb] : F.step < 4 ? [F.rg1, F.rg2, F.ryk] : F.last, F.oda, this.taskLabel(rt, '先手の旗に続け'));
    F.watchT = (F.watchT || 0) - dt;
    if (F.watchT <= 0) {
      F.watchT = 0.5;
      // 交代した兵は元の備えの並びへ戻る。将を一番前の枠へ寄せない。
      for (const a of rt.world.armies || []) if (a.jinkeiGuard) for (const g of a.wk?.groups || []) {
        if (g.sgSlots) continue;
        g.noAI = true; g.guard = true; g.guardLeash = 12;
        g.sgSlots = g.units.map((u) => ({ dx: u.pos.x - g.anchor.x, dz: u.pos.z - g.anchor.z, x: u.pos.x, z: u.pos.z }));
        const slotPos = g.slotPos;
        g.slotPos = function (i, n) {
          const p = this.sgSlots[i];
          if (!p || this.order !== 'hold' || this.routed) return slotPos.call(this, i, n);
          p.x = this.anchor.x + p.dx; p.z = this.anchor.z + p.dz; return p;
        };
      }
      // 本丸の控えだけを、つながる上の曲輪へ送る。大将の護衛は動かさない。
      if (F.SZ && !F.defenseSent && !gone(F.last[1]) &&
          F.SZ.byId.ridge2.owner !== ZONE_STATE.FRIEND &&
          (F.rg2.count <= F.rg2.initial * 0.6 || F.SZ.byId.ridge2.friends > 0)) {
        F.defenseSent = true;
        const i = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
        march(rt, F.last[1], ROAD.slice(i).reverse());
        F.last[1].onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; q.seekRange = 18; };
      }
      if (F.defenseSent && !F.counterSent && !gone(F.last[1]) && F.last[1].order === 'hold' &&
          F.SZ.byId.ridge2.owner !== ZONE_STATE.FRIEND && F.SZ.byId.ridge1.owner === ZONE_STATE.FRIEND) {
        F.counterSent = true;
        const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z);
        const b = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
        march(rt, F.last[1], ROAD.slice(a, b + 1).reverse());
        F.last[1].onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.seekRange = 18; };
      }
      for (const w of F.withdraw) if (!gone(w.g) && (!w.sent || w.g.order === 'path') && (w.g.count <= w.g.initial * 0.55 || w.g.morale < 55)) {
        if (!withdrawalOpen(rt, w)) { w.sent = false; w.g.order = 'hold'; w.g.formation = 'yari'; w.g.aggro = 14; w.g.onArrive = null; continue; }
        if (w.sent) continue;
        w.sent = true; march(rt, w.g, w.path);
        // march が先頭に残した通過済みの道を飛ばし、退却路の現在地から進む。
        // 退却路だけの番号で上書きすると、古い道へ戻って曲輪の手前で止まる。
        w.g.pathIdx += w.start;
        w.g.facing = 0; w.g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.facing = 0; q.aggro = 14; };
      }
    }
    if (F.amb.noRout && rt.t > 40) F.amb.noRout = false;
    if (F.step === 1) {
      const p = rt.player.u.pos, end = CLIMB_END;
      climbWayPoint(rt.player, ROAD[end][0], ROAD[end][1], F.guidePoint);
      if (!F.ambSeen && F.amb.units.some((u) => u.alive && (u.target || !u._crouch))) {
        F.ambSeen = true;
        rt.say('足軽', '尾根に松永勢がおるがや！', 3);
        rt.obj('main', '尾根道の伏兵を討ち、大手の木戸の前へ登る', 'main');
        rt.marker('amb', centerOf(F.amb), '尾根の松永勢', { red: true, group: F.amb });
      }
      let available = 0, arrived = 0;
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - F.gateGather.x, u.pos.z - F.gateGather.z) < 18) arrived++; }
      const need = Math.min(5, Math.ceil(available / 2));
      let roadThreat = false;
      for (const u of F.amb.units) if (u.alive && !u.fleeing && !u.woundOut) {
        for (let i = 1; i <= CLIMB_END; i++) if (Math.hypot(u.pos.x - ROAD[i][0], u.pos.z - ROAD[i][1]) < 18) { roadThreat = true; break; }
        if (roadThreat) break;
      }
      const atGate = Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 20;
      const wait = F.climbWait || (F.climbWait = { arrived: 0, need: 0 });
      wait.arrived = arrived; wait.need = need;
      if ((gone(F.amb) || F.ambCommitted && !roadThreat) && need > 0 && arrived >= need && atGate && shiPlayed(rt)) this.tower(rt);
      // 先手が切岸の上の物見へ槍を向けて坂の途中で止まると、門前に揃わず次の段へ進めなかった（bot が 480 秒で失敗）。
      // 敵が道から退いたら、遅れた隊をすぐ道へ戻す。十二秒で着いた者から門脇へ移る。
      // 尾根の伏兵が道の脇に残って退かないと、門前で三分待たせていた（bot 10/26）。門前に着いて一分たてば、残りは先手に任せて進める。
      else if (F.step === 1 && atGate && shiPlayed(rt) && (!roadThreat || rt.t - F.stepT > 60)) {
        F.gateWaitT = F.gateWaitT ?? rt.t;
        if (F.reMarchT == null || rt.t - F.reMarchT >= 8) {
          F.reMarchT = rt.t;
          const road = ROAD.slice(0, ROAD.findIndex((q) => q[1] === GATE.z));
          for (const g of F.oda) {
            if (gone(g)) continue;
            const c = g.center();
            if (Math.hypot(c.x - F.gateGather.x, c.z - F.gateGather.z) < 18) continue;
            let near = 0, nd = Infinity;
            for (let i = 0; i < road.length; i++) { const d = Math.hypot(road[i][0] - c.x, road[i][1] - c.z); if (d < nd) { nd = d; near = i; } }
            g.focus = null; g.aggro = 6; g.seekRange = 8;
            for (const u of g.units) { u.target = null; u.aiT = 0; }
            march(rt, g, road.slice(near + 1));
          }
          if (!F.waitSaid) { F.waitSaid = true; rt.say('組頭', '後ろの者を呼び寄せる。門前で備えよ。すぐ打ち手を守るぞ！', 3.5); }
        }
        if (rt.t - F.gateWaitT >= 12) this.tower(rt);
      } else if (F.step === 1) {
        F.gateWaitT = null;
        F.reMarchT = null; F.waitSaid = false;
        // 伏兵が崩れて二分たてば、先手が門前を押さえた事にして次の段（門脇の守り）へ。印が門へ導く。
        // 10/31：本人が門前の近く（四十歩）まで登っていなければ進めない（立っているだけで段が進まないように）
        if (!ambLive(F.amb) && !roadThreat && rt.t - F.stepT > 120 && shiPlayed(rt) && Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 40) this.tower(rt);
      }
      // 待つ下知の間は歩数と進む矢印を出さない。離れたら元の尾根道の案内へ戻す。
      // 門前の判定・十二秒の待ち時間はそのまま、既存の印を待機用に切り替える。
      if (F.step === 1) {
        const waiting = F.gateWaitT != null, marker = F.climbMarker;
        marker.waitGuide = waiting; marker.guideRadius = waiting ? 20 : 2;
        if (waiting) {
          F.guidePoint.x = F.gateGather.x; F.guidePoint.z = F.gateGather.z;
        }
      }
      // 走り抜けても伏兵を退けたことにしない。門前に寄せ、同じ兵と戦わせる。
      if (F.step === 1 && roadThreat && !F.gateChallenge && Math.hypot(p.x - F.gateGather.x, p.z - F.gateGather.z) < 20) {
        F.gateChallenge = true; F.amb.ambush = false; F.ambCommitted = true;
        if (!gone(F.amb)) {
          march(rt, F.amb, ROAD.slice(OPEN_I + 1, CLIMB_END + 1));
          F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.seekRange = 24; };
        }
        rt.say('組頭', gone(F.amb) ? '門前に敵が残るぞ！　槍をそろえて押し返せ！' : '尾根の敵が追って来るぞ！　先手と踏みとどまれ！', 4);
      }
    }
    if (F.step === 2 && !F.towerCovered && rt.player.u.alive) {
      F.towerHoldT = towerPostReached(rt) ? (F.towerHoldT || 0) + dt : 0;
      if (F.towerHoldT >= 2) this.coverTower(rt);
    }
    F.guideT = (F.guideT || 0) - dt;
    if (F.guideT <= 0) {
      F.guideT = F.step >= 3.5 ? 0.5 : 1;
      if (F.step === 1) {
        // 伏兵が逃げ散ったら、崖の上下を指す赤い印を消し、道の印だけを残す。
        if (F.ambSeen && !ambLive(F.amb)) rt.unmark('amb');
        rt.objProgress('main', F.gateWaitT != null && F.climbWait ? `門前で備えよ。あと${Math.max(0, Math.ceil(12 - (rt.t - F.gateWaitT)))}秒で門脇へ` : !ambLive(F.amb) ? '敵は退いた。先手と門前へ' : sightPoint(rt, F.amb.anchor) ? '先手と尾根の松永勢を退けよ' : '尾根道を進め。先手を離れるな');
      }
      if (F.step === 2 || F.step === 3) {
        const p = rt.player.u.pos, target = F.step === 2 ? TOWER_POST : F.gateHitPoint;
        // 南北の位置が門に近くても、櫓横の切岸から持ち場へは直進できない。
        F.approachByRoad = p.z > GATE.z + 9 || !guideClear(rt, p, target);
        if (F.approachByRoad) climbWayPoint(rt.player, GATE.x, GATE.z + 6, F.approachGuide);
        else {
          // 道から持ち場へ着いたら、前の折り返しで出した「道へ戻れ」を解除する。
          F.climbReturning = false;
          F.approachGuide.x = target.x; F.approachGuide.z = target.z;
        }
      }
      if (F.step === 2) rt.objProgress('main', '門の右脇の印へ。そこで打ち手を守れ');
      if (F.step === 3.5 || F.step === 4) {
        const route = F.castleRoute, p = rt.player.u.pos, guideFrom = F.castleGuideI;
        const id = F.step === 4 ? 'shu' : !F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
        const zone = F.SZ.byId[id];
        const inside = zone.test(p.x, p.z);
        // 口を離れたら、同じ平場でも到着扱いを解く。
        // 歩いて戻れる事と、今ここで守れる事は別。道案内を再開して先手へ戻す。
        if (F.castleGuideArrived && !inside) F.castleGuideArrived = false;
        // 戦いながら目的の口へ着いた者を、未通過の古い曲がり角へ戻さない。
        // 同じ平場から最後の印まで歩ける時だけ。柵越し・切岸の上下は到着にしない。
        if (!F.castleGuideArrived && inside) {
          const goal = route[route.length - 1], probe = F.castleGuideProbe;
          probe.x = goal[0]; probe.z = goal[1];
          if (guideClear(rt, p, probe)) {
            F.castleGuideI = route.length - 1; F.castleGuideArrived = true;
          }
        }
        // 打ち合いで数歩先へ押されても、通過済みの角まで引き返させない。
        // 近い先の道に実際に歩いて届く時だけ進める。柵越しや別の段は飛ばさない。
        if (!F.castleGuideArrived) {
          const probe = F.castleGuideProbe;
          let nearest = Infinity, next = F.castleGuideI;
          for (let i = F.castleGuideI; i < Math.min(route.length, F.castleGuideI + 13); i++) {
            const a = route[i - 1], b = route[i], dx = b[0] - a[0], dz = b[1] - a[1];
            // 行き帰りが重なる曲輪の口でも、折り返す先を先読みしない。
            // まず今の道の端へ着いてから、下の到着判定で次へ進める。
            if (i > F.castleGuideI) {
              const prev = route[i - 2];
              if ((a[0] - prev[0]) * dx + (a[1] - prev[1]) * dz < 0) break;
            }
            const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
            probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
            const d = Math.hypot(p.x - probe.x, p.z - probe.z);
            if (d >= INNER_HALF || d >= nearest - 0.25 || !guideClear(rt, p, probe)) continue;
            // 道の横へ届いても、その先が板壁なら次の角へ飛ばさない。
            const end = F.castleGuideBend.goal;
            end.x = b[0]; end.z = b[1];
            if (!guideClear(rt, p, end)) continue;
            nearest = d; next = i;
          }
          F.castleGuideI = next;
        }
        while (F.castleGuideI < route.length - 1) {
          const a = route[F.castleGuideI - 1], b = route[F.castleGuideI];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1);
          // 打ち合いで角の先へ押された者にも、今立つ道の続きを示す。
          // 曲輪へ入り、同じ道を戻る折り返しは実際に角まで進ませる。
          const c = route[F.castleGuideI + 1], nx = c[0] - b[0], nz = c[1] - b[1];
          const nextT = ((p.x - b[0]) * nx + (p.z - b[1]) * nz) / (nx * nx + nz * nz || 1);
          const pastCorner = dx * nx + dz * nz >= 0 && nextT > 0 && nextT <= 1
            && Math.hypot(p.x - b[0] - nx * nextT, p.z - b[1] - nz * nextT) < INNER_HALF;
          // 城内の細道の幅で到着を読む。柵や切岸を挟む角は、近くても通ったことにしない。
          const probe = F.castleGuideProbe;
          probe.x = b[0]; probe.z = b[1];
          if (Math.hypot(p.x - b[0], p.z - b[1]) >= 3 && !pastCorner && !(t >= 1 && t < 1.2 && Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < INNER_HALF)) break;
          if (!guideClear(rt, p, probe)) break;
          // 角の三歩手前で曲がると柵の内側へ食い込む。次の印へ通れる所まで角を保つ。
          probe.x = c[0]; probe.z = c[1];
          // 角に着いても次が番所で隠れる時は、次の区間へ進めて回り道を探す。
          // 古い角を足元に残したままでは、回り道の探索まで届かない。
          if (!guideClear(rt, p, probe) && Math.hypot(p.x - b[0], p.z - b[1]) > 0.8) break;
          F.castleGuideI++;
        }
        // 11/6 fixc2137：門の内から曲輪、曲輪から本丸の南口まで、本人だけが先へ駆けて一人で一分歩いていた（描いて遊んだ 128〜182・209〜269 秒。一5・九4）。
        //   味方の兵が十六歩の内にいない間は▼を次の角へ進めず、先手の列が追い付くのを待つ（十二秒まで。先手が尽きた時は待たない）。
        if (F.castleGuideI > guideFrom && !inside) {
          let near = Infinity;
          for (const q of F.oda) if (!gone(q)) for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) near = Math.min(near, Math.hypot(u.pos.x - p.x, u.pos.z - p.z));
          // 11/6 fixc0814：十二秒では門前で組み合う先手を待ち切れず、本人だけ曲輪へ出た → 二十五秒まで待つ。
          //   同じ角で待つのは一度だけ（味方が寄っては離れるたびに待ち直し、曲輪の口で三百秒止まった回があった）。
          if (waitForCastleAllies(rt, route, guideFrom, near)) F.castleGuideI = guideFrom;
        }
        F.castleGuidePoint.x = route[F.castleGuideI][0]; F.castleGuidePoint.z = route[F.castleGuideI][1];
        if (inside && F.castleGuideI === route.length - 1 && Math.hypot(p.x - F.castleGuidePoint.x, p.z - F.castleGuidePoint.z) < 3
            && guideClear(rt, p, F.castleGuidePoint)) F.castleGuideArrived = true;
        // 道を外れた時は、いま通る区間へ戻る場所を示す。遠い角への斜めの近道を避ける。
        const a = route[F.castleGuideI - 1], b = route[F.castleGuideI];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const probe = F.castleGuideProbe;
        probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
        // 押し合いで通過済みの道へ落ちた時は、そこから戻れる口を探す。
        // 今の角だけを指すと、間の切岸を登ろうとして何分も止まる。
        let returnDistance = Math.hypot(p.x - probe.x, p.z - probe.z);
        // 道端から三歩以内でも、切岸や柵を挟めば直進できない。
        const blockedCorner = !F.castleGuideArrived && !guideClear(rt, p, F.castleGuidePoint);
        const detouring = blockedCorner && guideAround(rt, p, F.castleGuidePoint);
        let rejoined = false;
        // 道の上で次の角が塞がれただけなら、末尾の回り道で避ける。
        // 足元に近い通過済みの道へ戻すと、番所の脇で案内が前後し続ける。
        // 戻り口を探すのは、道幅の外か、今の道との間に柵・切岸がある時だけ。
        if (!F.castleGuideArrived && !detouring && blockedCorner && (returnDistance > INNER_HALF || !guideClear(rt, p, probe))) {
          let best = Infinity, rejoin = F.castleGuideI, rx = probe.x, rz = probe.z;
          // 打ち合いで先の道へ出た者も、歩いて届く区間へ戻す。
          // 通過済みの道だけを探すと、背後の切岸を登れず足元の印から動けなくなる。
          // 押し合いで先の曲輪へ出た時は、十三区間先より遠い道にも戻れる。
          // 直進できる点とその先の角だけを選ぶ。遠い区間は一度の距離計算で外す。
          const current = F.castleGuideI, last = route.length - 1;
          for (let i = 1; i <= last; i++) {
            const ra = route[i - 1], rb = route[i], vx = rb[0] - ra[0], vz = rb[1] - ra[1];
            const s = Math.max(0, Math.min(1, ((p.x - ra[0]) * vx + (p.z - ra[1]) * vz) / (vx * vx + vz * vz || 1)));
            if (Math.hypot(p.x - ra[0] - vx * s, p.z - ra[1] - vz * s) > Math.min(60, best)) continue;
            // 真横の一点が柵で塞がれていても、同じ道の口から戻れる。
            // 六歩以下の区間を一歩半ずつ調べ、入れ物は使い回す。
            const n = Math.max(1, Math.ceil(Math.hypot(vx, vz) / 1.5));
            for (let k = -1; k <= n; k++) {
              const t = k < 0 ? s : k / n;
              probe.x = ra[0] + vx * t; probe.z = ra[1] + vz * t;
              const d = Math.hypot(p.x - probe.x, p.z - probe.z);
              const score = d + Math.abs(i - current) * .1;
              if (d > 60 || score >= best || !guideClear(rt, p, probe)) continue;
              // 戻った点から道の次の角まで歩ける事も確かめる。
              // 足元だけ通れる行き止まりを選ぶと、同じ切岸を登り続ける。
              const end = F.castleGuideBend.goal;
              end.x = rb[0]; end.z = rb[1]; end.y = rt.world.heightAt(end.x, end.z);
              if (!guideClear(rt, probe, end)) continue;
              best = score; rejoin = i; rx = probe.x; rz = probe.z;
            }
          }
          if (best < Infinity) {
            probe.x = rx; probe.z = rz;
            F.castleGuideI = rejoin;
            F.castleGuidePoint.x = route[rejoin][0]; F.castleGuidePoint.z = route[rejoin][1];
            returnDistance = Math.hypot(p.x - rx, p.z - rz);
            rejoined = true;
          } else {
            // 戻れる口がなければ、元の角を残して近場の回り道を探す。
            probe.x = a[0] + dx * t; probe.z = a[1] + dz * t;
          }
        }
        // 道端で札が行き来しないよう、一度戻し始めたら中央近くまで案内を保つ。
        // 戻り口に着いたら次の角へ。塞がれた古い角の判定で足元を指し続けない。
        F.castleGuideReturning = !F.castleGuideArrived && !detouring && (blockedCorner || rejoined) && (rejoined || guideClear(rt, p, probe))
          && returnDistance > (F.castleGuideReturning || rejoined ? 1.2 : INNER_HALF);
        if (F.castleGuideReturning) { F.castleGuidePoint.x = probe.x; F.castleGuidePoint.z = probe.z; }
        F.castleGuideDetouring = detouring || !F.castleGuideArrived && guideAround(rt, p, F.castleGuidePoint);
        F.castleGuideLeaving = castleExitGuide(rt, F.castleGuidePoint);
        // 回り道も戻り口も見つからない時は、崖の向こうの角を進む印にしない。
        // 次の探索で歩ける道が見つかれば、自動で印を戻す。道順と終戦の時計は保つ。
        // 室内の階段は地面の道と別の床。外の崖判定で出口の案内を消さない。
        F.castleGuideBlocked = !F.castleGuideLeaving && !F.castleGuideArrived && !guideClear(rt, p, F.castleGuidePoint);
        // 11/6 fixc1845：本丸の西の帯道（-30,-127 の辺り）で▼が消えたまま一分余り立ち尽くし、七分半の諸口の決着で⑤が失敗になった（描いて遊んだ二回とも）。
        //   印が六秒消えたままなら、本人から真っ直ぐ歩いて届く一番近い道の角を▼にする（次の角の確かめは問わない）。
        if (F.castleGuideBlocked) {
          if (F.guideBlockedAt == null) F.guideBlockedAt = rt.t;
          if (rt.t - F.guideBlockedAt > 6) {
            let best = Infinity, bi = -1;
            for (let i = 1; i < route.length; i++) {
              probe.x = route[i][0]; probe.z = route[i][1];
              const d = Math.hypot(p.x - probe.x, p.z - probe.z) - (i >= F.castleGuideI ? 4 : 0);
              if (d < best && d < 50 && guideClear(rt, p, probe)) { best = d; bi = i; }
            }
            if (bi > 0) {
              F.castleGuideI = Math.max(bi, Math.min(F.castleGuideI, bi + 1));
              if (!guideClear(rt, p, { x: route[F.castleGuideI][0], z: route[F.castleGuideI][1] })) F.castleGuideI = bi;
              F.castleGuidePoint.x = route[F.castleGuideI][0]; F.castleGuidePoint.z = route[F.castleGuideI][1];
              F.castleGuideBlocked = false; F.castleGuideReturning = false;
            }
            F.guideBlockedAt = null;
          }
        } else F.guideBlockedAt = null;
        rt.objProgress('main', F.castleGuideLeaving ? rt.player.u.nakaLevel > 0 ? '下り階段の印へ。下の階から戸口へ戻れ' : F.castleExit.through ? '戸口を抜け、踏み段から道へ戻れ' : '戸口の内側の印へ。壁を回って外へ戻れ'
          : F.castleGuideDetouring ? '建物や柵を回り、印から尾根道へ進め'
          : (F.castleGuideReturning || !rt.world.onRoad(p.x, p.z)) && !inside ? '崖を登らず、道の印へ戻れ。そこから尾根道を進め'
          : zone.owner === ZONE_STATE.FRIEND ? F.step === 4 ? !inside ? '本丸を取った。南口の印で先手と守れ' : '先手と南口を守り、残る敵を退けよ' : '味方が曲輪を取った。道の印から本丸の南口へ'
          : zone.enemies > 0 ? !inside ? F.step === 4 ? '西の道から本丸の南口へ。敵を退けよ' : '道の印から曲輪の入口へ。敵を退けよ' : F.step === 4 ? '先手と本丸の敵を討て' : '先手と曲輪の敵を討て'
          : !inside ? F.step === 4 ? '敵は退いた。道の印から本丸の南口へ' : '敵は退いた。道の印から曲輪の入口へ'
          : zone.friends < zone.need ? `先手と入口へ集まれ（味方 ${zone.friends}／${zone.need}人）`
          : rt.t < zone.quietUntil ? `先手と入口を守れ。あと${Math.ceil(zone.quietUntil - rt.t)}秒で確保を始める`
          : `敵は退いた。あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒、${F.step === 4 ? '本丸の南口' : '北尾根の下の曲輪'}を守れ`);
      }
      if (F.step === 3) {
        rt.objProgress('main', sightPoint(rt, GATE) ? gateWord(F.gate) : '門の正面へ回れ。柵の脇からは打てない');
      }
    }
    // 11/5 専門家の目（二5）：自分が掛矢を振らずに見ていると、打ち手だけでは門が割れず、先手が尽きて退き太鼓で負けた。
    //   十月五日の飯田基次の打って出のように、門前に寄せが長く張り付けば城兵の方から木戸を開いて打ち手を討ちに出る。
    if (F.step === 3 && !F.ending && rt.t - F.stepT > 60 && F.gate.alive) this.sallyOut(rt);
    if (F.step === 3.2 && !F.ending) {
      // 11/5 bot：門の内の弓の後ろで詰まった数人が出て来ないまま、土橋の段が四分余り続いた。
      //   四十秒を過ぎたら、門の外へ打って出た兵だけを数える（門の内に残る兵は付け入りで曲輪へ退く）。
      let n = 0;
      const late = rt.t - F.stepT > 40;
      for (const u of F.sally.units) if (u.alive && !u.fleeing && !u.woundOut && (!late || u.pos.z > GATE.z - 2)) n++;
      rt.objProgress('main', `打って出た松永勢　残り${n}人`);
      if (n <= Math.max(3, Math.round(F.sallyN * 0.3))) this.tsukeiri(rt);
    }
    // 先手の消耗だけで本人の任務を失敗にしない。時間で城取りも済ませず、各持ち場の条件を保つ。
    let ready = 0;
    for (const q of F.oda) for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) ready++;
    const exhausted = F.step >= 1 && ready < (F.step >= 3.5 ? 1 : 5);
    if (!F.ending && exhausted && !F.assaultLossSaid) {
      F.assaultLossSaid = true;
      rt.say('使番', '筒井の先手が減っております！　尾根道の敵を警戒せよ！', 5);
    }
    if (F.step >= 3.5 && F.SZ) {
      F.SZ.tick(dt);
      const s = F.SZ.byId;
      // 味方が先に取った曲輪にも、本人の到着後に達成を付ける。
      if (F.step === 3.5 && !F.lowerTaken && s.ridge1.owner === ZONE_STATE.FRIEND) this.onZoneFall(rt, 'ridge1');
      if (F.step === 3.5) {
        const z = s.ridge1;
        // 11/6 fixc1429：本人が曲輪の口へ歩いて行く間は数えない（着いた途端に「別の先手が道を開いた」で④が済み、曲輪で一度も戦わずに本丸へ戻されていた）
        const pp = rt.player.u.pos, far = Math.hypot(pp.x - RIDGE1.x, pp.z - RIDGE1.z - RIDGE1.r) > 30;
        // 11/6 fixc2137：曲輪の守りが持ち場で槍を立てたまま動かず、着いた本人と先手が一度も当たらずに「別の先手が道を開いた」で済んでいた（描いて遊んだ 182〜209 秒）。
        //   寄せ手が口へ四十歩まで来たら、下の曲輪の兵と退いて来た打って出の兵が槍をそろえて口へ出て来る（九2・一3）。
        if (!F.rg1Out && Math.hypot(pp.x - RIDGE1.x, pp.z - RIDGE1.z - RIDGE1.r) < 40) {
          F.rg1Out = true;
          for (const g of [F.rg1, F.sally]) if (!gone(g)) {
            g.noAI = false; g.fixed = false; g.retreatOnly = false; g.ambush = false;
            g.anchor = { x: RIDGE1.x, z: RIDGE1.z + RIDGE1.r }; g.order = 'attack'; g.formation = 'yari'; g.seekRange = 30; g.aggro = 24;
            for (const u of g.units) { u.aiT = 0; u.target = null; }
          }
        }
        if (far || z.enemies < F.lowerBest || z.holdT > (F.lowerHold || 0)) F.lowerStallAt = rt.t;
        F.lowerBest = Math.min(F.lowerBest, z.enemies); F.lowerHold = z.holdT;
        // 一分間進まなければ先手を道へ戻す。曲輪取り自体は省略しない。
        if (rt.t - F.lowerStallAt >= 60) {
          F.lowerStallAt = rt.t;
          F.advanceT = rt.t - 30;
          this.assistAdvance(rt);
        }
      }
      if (honmaruPostReached(rt)) this.win(rt);
    }
    if (F.ending || rt.over) return;
    // 十五秒ごとに距離と戦果を比べる。三十秒の停滞には先手の援護を出す。
    if (!F.ending && F.step >= 1 && rt.t >= (F.stallCheckT || 0)) {
      F.stallCheckT = rt.t + 15;
      this.assistAdvance(rt);
      for (const q of F.oda) {
        if (gone(q)) continue;
        const c = q.center();
        const stopped = q.sgStep === F.step && Math.hypot(c.x - q.sgX, c.z - q.sgZ) < 2;
        q.sgStall = stopped ? (q.sgStall || 0) + 15 : 0;
        q.sgStep = F.step; q.sgX = c.x; q.sgZ = c.z;
        if (q.sgStall >= 45 && F.stallSaidStep !== F.step && rt.t >= (F.stallSayT || 0) && sightPoint(rt, c)) {
          F.stallSayT = rt.t + 45; F.stallSaidStep = F.step;
          const waypoint = q.order === 'path' ? q.path?.[q.pathIdx] : null;
          const blocked = waypoint && rt.army.wallBetween(c, -1, { x: waypoint[0], z: waypoint[1] });
          rt.say('組頭', q.order === 'assault' || blocked ? '門か柵に阻まれたか。先手へ戻り、打ち手を守れ！' : q.order === 'path' ? '列が止まっておるぞ。尾根道へ戻り、先手に続け！' : '先手が待っておるぞ。兵をそろえ、敵を崩せ！', 5);
          const stalledStep = F.step;
          rt.marker('gather', () => gone(q) || F.ending || F.step !== stalledStep || q.sgStall < 45 ? null : q.center(), '先手へ集まれ', { group: q });
          break;
        }
      }
    }

  },

  // 三十秒間、距離も戦果も変わらなければ、同じ兵を道に沿って押し出す。
  // 兵の追加・瞬間移動・時間だけの勝利は行わない。
  assistAdvance(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const id = F.step === 4 ? 'shu' : F.step === 3.5 ? (!F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2') : String(F.step);
    const goal = F.SZ?.byId[id]?.pos || (F.step === 2 ? TOWER_POST : GATE);
    let distance = Math.hypot(p.x - goal.x, p.z - goal.z);
    for (const g of F.oda) if (!gone(g)) {
      const c = g.center(); distance = Math.min(distance, Math.hypot(c.x - goal.x, c.z - goal.z));
    }
    const hp = F.gate.alive ? F.gate.hp : 0;
    if (F.advanceId !== id || distance < F.advanceDistance - 3 || F.advanceKills !== F.ek || F.advanceGateHp !== hp) {
      F.advanceId = id; F.advanceDistance = distance; F.advanceKills = F.ek; F.advanceGateHp = hp; F.advanceT = rt.t;
    }
    if (rt.t - F.advanceT < 30) return;
    F.advanceT = rt.t; rt.unmark('gather');
    if (F.step === 2) {
      // 近くの先手が打ち手の守りを引き継ぐ。
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 18) { this.coverTower(rt, false); return; }
    }
    if (F.step === 3) {
      for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 10) {
        // 停滞時も内から開門して打って出る。門を直接壊すと、
        // 破壊の通知で城内へ進み、③の土橋の戦いを飛ばしてしまう。
        this.sallyOut(rt);
        return;
      }
      this.gateFightApproach(rt);
      return;
    }
    // 停滞時の先手も、本人と同じ本丸への道へ。古い曲輪往復へ戻さない。
    const path = F.step === 4 && F.castleRoute ? F.castleRoute
      : id === 'yashiki' ? ROUTES.find((r) => r.id === 'yashiki').pts : ROAD;
    let end = F.step < 3.5 ? CLIMB_END : 0, best = Infinity;
    if (F.step >= 3.5) for (let i = 0; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - goal.x, path[i][1] - goal.z);
      if (d < best) { best = d; end = i; }
    }
    // 11/6 fixc0814：本丸への道は曲輪への行きと帰りが西の帯道で並ぶ。道の始めから一番近い点を探すと、帰りの道を進む先手が
    //   行きの点に取られて曲輪へ引き返していた（流しの 187〜217 秒・描いた写真で本人だけ南口へ）。本人の今の角より十区間前から探す。
    const start = F.step < 3.5 ? OPEN_I : path === ROAD ? CLIMB_END + 1 : path === F.castleRoute ? Math.max(0, Math.min(end, (F.castleGuideI || 0) - 10)) : 0;
    for (const g of F.oda) if (!gone(g)) {
      let from = start, near = Infinity;
      const c = g.center();
      for (let i = start; i <= end; i++) {
        const d = Math.hypot(c.x - path[i][0], c.z - path[i][1]);
        if (d < near) { near = d; from = i; }
      }
      // 通った道へ引き返さず、線分の先へ向かう。後列も同じ列に戻す。
      if (from < end && Math.hypot(c.x - path[from + 1][0], c.z - path[from + 1][1]) < Math.hypot(path[from][0] - path[from + 1][0], path[from][1] - path[from + 1][1])) from++;
      march(rt, g, path.slice(from, end + 1));
      for (const u of g.units) if (u.alive) { u.target = null; u.moveTo = null; u.aiT = 0; }
    }
    const enemy = F.step < 3.5 ? F.amb : id === 'ridge1' ? F.rg1 : id === 'ridge2' ? F.rg2 : id === 'yashiki' ? F.ryk : F.last[0];
    if (enemy && !gone(enemy) && !enemy.retreatOnly) {
      enemy.ambush = false;
      // 門を抜けた味方へ、守りの同じ兵が曲輪の口まで出る。
      march(rt, enemy, path.slice(Math.max(start, end - 1), end + 1).reverse());
      enemy.onArrive = (g) => { g.order = 'attack'; g.seekRange = 24; g.aggro = 18; };
    }
    rt.say('組頭', F.step < 3.5 ? '先手よ、尾根道を押し上がれ！' : F.step === 4 ? '味方は本丸へ寄せよ！　残る守りを崩せ！' : F.lowerTaken ? '下の曲輪は味方が取った。先手よ、上へ進め！' : '門は開いた。先手よ、西の道から曲輪へ進め！', 4);
  },
  gateFightApproach(rt) {
    const F = rt.flags;
    const R = F.ram;
    let approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    if (!approach.length && R.anchor.z > GATE.z + 9) {
      let from = OPEN_I, best = Infinity;
      for (let i = 0; i <= CLIMB_END; i++) {
        const d = Math.hypot(R.anchor.x - ROAD[i][0], R.anchor.z - ROAD[i][1]);
        if (d < best) { best = d; from = i; }
      }
      approach = ROAD.slice(from, CLIMB_END + 1);
    }
    approach.push([GATE.x, GATE.z + 6], [GATE.x, GATE.z + 4]);
    march(rt, R, approach);
    R.arriveCount = 1; R.arriveRadius = 2;
    F.ram.onArrive = (g) => { g.order = 'assault'; g.facing = Math.PI; g.assault = () => F.gate.alive ? F.gate : null; };
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !sightPoint(rt, g.anchor) || rt.t < (F.routSayT || 0)) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が逃げてくがや！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    if (!F.gateCreek && s.hp < s.maxHp * 0.5) { F.gateCreek = true; rt.bark('門の板が割れてきた'); }
    if (F.step === 3 && s.hp < s.maxHp * 0.6) this.sallyOut(rt);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate || F.sallyOpen) return;
    if (s.mesh) brokenGate(rt, s.mesh);
    sfx('wood', 1.2);
    rt.unmark('gate'); rt.unmark('sally');
    if (!F.ending && !rt.over && rt.player.u.alive && F.step === 3) this.interior(rt);
  },

};

// 総勢は諸説ある。実際の討死だけを引き、全軍の被害へ水増ししない。
shigisan.force = (rt) => {
  const F = rt.flags;
  const f = F.force || (F.force = { a: 40000, a0: 40000, b: 8000, b0: 8000, casualtiesCounted: true });
  f.a = Math.max(0, f.a0 - (F.ak || 0));
  f.b = Math.max(0, f.b0 - (F.ek || 0));
  return f;
};
// 命懸けの強さは定義内の回数・開始時刻・間隔を保つ。真偽値で上書きすると既定の強さへ戻ってしまう。
shigisan.fearKind = { kind: '炎上', note: '燃える山城の狭い曲輪で、上から撃たれる', w: { iso: 1.3 }, line: '火が回るぞ！' };
shigisan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '松永軍', mon: 'todo' } };
// 父子は高櫓の内。架空の名乗り・討取りの段は設けない。
shigisan.famous = []; // 海老名は片岡城の討死記事。久通を木戸外の討取り役にしない。
shigisan.date = () => '天正五年十月十日　冬・夜攻め';
shigisan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '城攻めの下知まで待つ' : '');
shigisan.skip = (rt) => {
  const F = rt.flags;
  if (F.step === 0 && !F.ending && F.climbTimer) F.climbTimer.t = Math.min(F.climbTimer.t, 0.2);
};
shigisan.history = '天正五年（1577）八月、石山本願寺を囲む陣にいた松永久秀は、勝手に陣を払って大和の信貴山城に籠もり、再び信長に背いた。信長は嫡男の織田信忠を大将に、佐久間信盛・羽柴秀吉・明智光秀・丹羽長秀らを諸口へ向かわせ、筒井順慶・細川藤孝らも攻めに加わり、支城の片岡城を落としてから信貴山城を囲んだ。『信長公記』は十月十日の晩に諸口から夜攻めが行われ、守兵が防戦する中、久秀が自ら天主に火をかけて焼死したと記す。森好久が鉄砲二百を率いて寝返った話は後世の伝えで、同書には記されていない。遊びでは筒井の先手が押し返された後、三の丸あたりから火の手が上がる場面として残し、天主の火は久秀による放火として描く。この日は、十年前に東大寺の大仏殿が焼けた日と同じで、人々は因果と噂したと『信長公記』は伝える。久秀が名物の茶釜「平蜘蛛」を打ち砕いて死んだという話は、のちの伝えである。火薬で釜とともに爆ぜたという話は昭和に広まった伝えで、遊びでは描かず、天主の火と自害だけを見せる。総大将の信忠は鹿の角の脇立の兜で自ら険しい山を攻め上ったと『信長公記』は記す。信長は安土にいて、この城攻めには来ていない。大和はその後、筒井順慶が治めた（大和一国を正式に任されたのは天正八年）。松永の紋は蔦で、ここでは近い形の蔦の紋で旗を描いている。兵の数には諸説ある。織田四万・松永八千はこの戦の仮の目安で、『信長公記』に当夜の両軍の総数は記されていない。城には百二十を超える曲輪があり、北尾根には松永屋敷がある。山頂の天主は安土の先がけともいわれるが、形は確定していない。各将の攻め口・北尾根の細かな攻め順・伏兵・枝尾根の小曲輪の配置・板壁の望楼の形は推定で、当夜の天気は確定していない。月の形は旧暦十日から満月前と推定したもので、当夜の正確な月齢・傾きや見え方を再現したものではない。';

// 11/6 fixc0814（描いて遊んだ 110〜250 秒）：門を抜けた後、味方の列は歩き（2.8）のままで、駆ける本人だけが曲輪と本丸の南口へ先に出て、
//   写真には本人一人しか写らなかった（一5・九4）。懸かれの後の寄せ手は駆け足で、本人が列から離れると列の頭も足を速めて並ぶ。
function allyPace(rt) {
  const F = rt.flags;
  if (!(F.step >= 3.5) || F.ending || !F.oda) return;
  const p = rt.player.u.pos;
  //   列の頭は本人の十歩ほど先を保つ（後ろに付く列が本人の周りと前に見える）。本人より二十歩余り先へ出たら歩みを落として待つ。
  for (const q of F.oda) {
    if (gone(q) || q.order !== 'path') continue;
    const w = q.path[q.pathIdx];
    if (!w) continue;
    const dx = w[0] - q.anchor.x, dz = w[1] - q.anchor.z, l = Math.hypot(dx, dz) || 1;
    const ahead = ((q.anchor.x - p.x) * dx + (q.anchor.z - p.z) * dz) / l;
    q.speed = ahead < 8 ? 4.8 : ahead > 22 ? 2.4 : 3.9;
  }
}
function march(rt, g, pts) {
  if (gone(g)) return;
  // 止まっても後列は通った道に沿う。門前で北へ向き直ると、直線の後列は切岸へ出る。
  if (!g.sgRoadSlots) {
    g.sgRoadSlots = true;
    const slotPos = g.slotPos;
    g.slotPos = function (i, n) {
      if (this.routed || !this.roadColumn || !this.path?.length) return slotPos.apply(this, arguments);
      // 11/6 fixc0814（描いて遊んだ 100〜170 秒）：門の下で遅れた味方は、要の後ろの持ち場へ切岸越しに真っ直ぐ向かって止まり、
      //   隊の要だけが本人と曲輪へ進んでいた（本人の三十歩内の味方は二〜四人）。十四歩より遅れた者は、通って来た道の次の角を追って登る。
      if (this.team === 0 && (this.order === 'path' || this.order === 'hold' || this.order === 'assault' || this.order === 'attack')) {
        // 先頭が到着して止まった後も、遅れた後列は折り返しを通る。
        const order = this.order, formation = this.formation;
        this.order = 'path'; this.formation = 'column';
        let r;
        try { r = slotPos.apply(this, arguments); }
        finally { this.order = order; this.formation = formation; }
        const u = this.units.find((x) => x.slot === i && x.alive);
        if (!u) return r;
        const distance = Math.hypot(u.pos.x - r.x, u.pos.z - r.z);
        // 近い後列も、折り返しを横切れば切岸で止まる。半秒ごとに直進を調べる。
        // 門を抜けた先手が欠け、本人だけで曲輪の敵を受ける原因にもなる。
        const check = u.sgSlotClear || (u.sgSlotClear = { at: -1, x: 0, z: 0, clear: false });
        if (distance < 14) {
          if (rt.t >= check.at || Math.hypot(r.x - check.x, r.z - check.z) > 2) {
            check.at = rt.t + 0.5; check.x = r.x; check.z = r.z;
            check.clear = localClear(rt.army, u.pos, r, true);
          }
          if (check.clear) return r;
        }
        const P = this.path, last = Math.min(this.pathIdx, P.length - 1);
        let best = Infinity, k = -1;
        for (let j = 1; j <= last; j++) {
          const a = P[j - 1], b = P[j], dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(u.pos.x - a[0] - dx * t, u.pos.z - a[1] - dz * t);
          if (d < best) { best = d; k = j; }
        }
        if (k < 0) return r;
        if (k < last && Math.hypot(u.pos.x - P[k][0], u.pos.z - P[k][1]) < 2.5) k++;
        r.x = P[k][0]; r.z = P[k][1];
        return r;
      }
      if (this.order !== 'hold' && this.order !== 'assault') return slotPos.call(this, i, n);
      const order = this.order, formation = this.formation;
      this.order = 'path'; this.formation = 'column';
      try { return slotPos.call(this, i, n); }
      finally { this.order = order; this.formation = formation; }
    };
  }
  // 後列の持ち場に使う、通って来た道を残す。
  let history = g.roadColumn && g.path ? g.path.slice(0, Math.min(g.pathIdx, g.path.length)) : [];
  if (!history.length) {
    const i = ROAD.findIndex((p) => Math.hypot(p[0] - g.anchor.x, p[1] - g.anchor.z) < 1);
    if (i > 0) history = ROAD.slice(0, i);
  }
  g.order = 'path'; g.path = [...history, [g.anchor.x, g.anchor.z], ...pts]; g.pathIdx = history.length + 1; g.roadColumn = true; g.formation = 'column'; g.colW = 2; g.width = 5; g.speed = 2.8; g.guard = false;
  // 五人が自分の持ち場へ着けば展開する。後列待ちで曲輪の確保を何分も止めない。
  if (g.team === 0) { g.arriveCount = 5; g.arriveRadius = 4; }
  g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.aggro = 14; };
}
function gateWord(g) {
  return g.hp > g.maxHp * 0.65 ? '門はまだ堅い' : g.hp > g.maxHp * 0.3 ? '門の板が割れてきた' : '門が大きくきしむ';
}

// 壊れた木戸は短い割れ板へ。一枚の扉全体を最高点まで持ち上げ、黒い床板にしない。
// 破壊時に一度だけ作り、共通の箱と木肌を二十四本で使い回す。当たりや道の高さは変えない。
function brokenGate(rt, gate) {
  if (gate.userData.sgBroken) return;
  gate.userData.sgBroken = true; gate.visible = false;
  const W = rt.world, mesh = new THREE.InstancedMesh(ROOM_BOX, ROOM_MAT, 24);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3(), along = new THREE.Vector3(), across = new THREE.Vector3();
  const basis = new THREE.Matrix4(), contact = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    const col = i % 12, row = Math.floor(i / 12);
    // 開口の両脇へ短い板を散らす。通り口を二列の床板で敷き詰めない。
    const side = col < 6 ? -1 : 1, n = col % 6;
    const x = GATE.x + side * (2.8 + n * .42) + Math.sin(i * 2.4) * .16;
    const z = GATE.z - .4 - row * 1.3 + Math.sin(i * 1.7) * .55;
    const length = .45 + (i * 7 % 11) * .05, angle = Math.sin(i * 2.1) * .95;
    const dx = Math.sin(angle), dz = Math.cos(angle), halfWidth = .07 + (i % 4) * .015;
    // 長手の坂だけでなく横の傾きも読む。回転後の実際の底を地面へ接地させる。
    const h = W.heightAt(x, z), span = .25;
    const sx = (W.heightAt(x + span, z) - W.heightAt(x - span, z)) / (span * 2);
    const sz = (W.heightAt(x, z + span) - W.heightAt(x, z - span)) / (span * 2);
    normal.set(-sx, 1, -sz).normalize();
    along.set(dx, sx * dx + sz * dz, dz).normalize();
    across.crossVectors(normal, along).normalize();
    normal.crossVectors(along, across).normalize();
    basis.makeBasis(across, normal, along); dummy.quaternion.setFromRotationMatrix(basis);
    dummy.position.set(x, h, z); dummy.scale.set(halfWidth * 2, .07, length); dummy.updateMatrix();
    let y = -Infinity;
    for (const side of [-.5, 0, .5]) for (const end of [-.5, 0, .5]) {
      contact.set(side, -.5, end).applyMatrix4(dummy.matrix);
      y = Math.max(y, W.heightAt(contact.x, contact.z) - contact.y);
    }
    dummy.position.y += y - .015; dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.receiveShadow = true; mesh.castShadow = true; rt.scene.add(mesh);
}

// 素直な遊び手：筒井について登り、伏兵と戦い、門脇で矢を防ぎ、門を破る組を守り、天守の前で戦う
// 本丸は東西に長い柵。円を仮定した回り道で、道の印へ進む向きを上書きしない。
shigisan.botBrain = (b, inp, o) => { sgBot(b, inp, o); gateSteer(b, inp); };
function sgBot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然に戻らず、手当ても五％まで。処置を済ませたら任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.5 && canTreat) b.botRest = true;
  if (!canTreat || u.hp >= u.maxHp * 0.5) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 麓の定点で待つと味方から離れ、傷を縛れない。近い味方へ戻って止まる。
    let mate = null, md = Infinity;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.type === 'dummy' || o.noTarget ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < md) { mate = o; md = d; }
    }
    if (mate) { goTo(p, inp, mate.pos.x, mate.pos.z, 4); return; }
    b.botRest = false;
  }
  // 柵越しに届く打ち手を先に受け、構えを解く間は反撃の相手を保つ。
  // 毎回いちばん近い兵へ替えると、半秒の待ちをやり直して突けなくなる。
  // 門を破る段では、柵越しに槍が届く木戸の弓を突き続けて門へ行かないことがあった。柵の向こうの相手は門の後に回す。
  let e = strikeTarget(b, F.step === 2 || F.step >= 3.5 ? 6 : 12);
  if (e && F.step === 3 && b.army.wallBetween(u.pos, -1, e.pos)) e = null;
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    const attacking = e.atk?.target === u || e.swing?.target === u || e.charging && e.target === u;
    // 門内では谷へ逃げた兵を追わない。届く打ち込みを受けたら、道の順に戻る。
    // 曲輪の外の一人へ寄り続けると、案内から五十歩離れて夜攻めが終わっていた。
    if (F.step >= 1 && d > reach * 0.85 &&
        (!b.world.onRoad(e.pos.x, e.pos.z) || !guideClear(b, u.pos, e.pos))) e = null;
    if (e && F.step >= 3.5 && d > reach * 0.85 && F.castleRoute && !F.castleGuideArrived) {
      // 同じ道にいても、通り過ぎた敵を追って任務から逆戻りしない。
      const a = F.castleRoute[F.castleGuideI - 1], c = F.castleRoute[F.castleGuideI];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len > 0.01 && ((e.pos.x - u.pos.x) * dx + (e.pos.z - u.pos.z) * dz) / len < -2) e = null;
      // 別の道に立つ敵も「道の上」になる。今の尾根から横へ追って谷へ下らない。
      if (e) {
        const t = Math.max(0, Math.min(1, ((e.pos.x - a[0]) * dx + (e.pos.z - a[1]) * dz) / (len * len || 1)));
        if (F.castleGuideReturning || Math.hypot(e.pos.x - a[0] - dx * t, e.pos.z - a[1] - dz * t) > INNER_HALF + 1) e = null;
      }
    }
    // 届く打ち込みには応じる。離れた控えや別の段の兵を追って、道の案内を止めない。
    if (e && d > reach && !attacking && (e.playerOpeningBlocked || !guideClear(b, u.pos, e.pos))) e = null;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 狙いの固定が別の兵へ向け直し、打ち手に背を向けるのを防ぐ。
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    // 山の別の段の敵を追わず、通れる相手へ寄る。詰まった時は共通の回り道を使う。
    if (d > reach * 0.85 && !e.charging && !b.army.wallBetween(u.pos, -1, e.pos)) {
      if (F.step === 1) climbBotWay(p, inp, e.pos.x, e.pos.z, reach * 0.85, goTo);
      else goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    }
    // 構えたままの連打は槍の払いになり、気力を失う。受けた後に構えを解いて突く。
    patientStrike(p, inp, e, d);
    // 道や回り道を向いたまま受けたり突いたりしない。打ち合う時は相手へ向き直って止まる。
    if (inp.guardHold || inp.leftPressed) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyW');
    }
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    // 先手も伏兵も、別の折り返しから直線で追うと切岸へ出てしまう。
    // 人が見ている道の印をたどり、伏兵へ戻る時も同じ道で戻る。
    // 近くで戦える相手は上で選ぶ。逃げた者も含む隊の平均位置を追うと、道を外れて谷へ下る。
    climbBotWay(p, inp, ROAD[CLIMB_END][0], ROAD[CLIMB_END][1], 2, goTo);
    return;
  }
  if (F.step === 2) {
    if (!F.towerCovered) {
      const d = Math.hypot(TOWER_POST.x - u.pos.x, TOWER_POST.z - u.pos.z);
      // 伏兵から櫓へ斜めに近道せず、登城道を登り切って土橋から門脇の道へ進む。持ち場に立てば守りに就く。
      if (F.approachByRoad) goTo(p, inp, F.approachGuide.x, F.approachGuide.z, 1);
      else if (d > 1.4) goTo(p, inp, TOWER_POST.x, TOWER_POST.z, 1);
    }
    return;
  }
  if (F.step === 3) {
    if (F.approachByRoad) { goTo(p, inp, F.approachGuide.x, F.approachGuide.z, 1); return; }
    const it = b.interacts.find((q) => q.id === 'ramgate');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 櫓から斜めに門へ向かわず、造成した道を戻って土橋の正面へ出る。
      // 馬や打ち手に押されても、実際に操作が届く範囲なら門を打つ。
      if (d < it.r && b.nearestInteract() === it) {
        inp.k.delete('KeyW'); inp.runHeld = false; inp.chargeHold = false;
        p.yaw = Math.PI; inp.k.add('KeyE');
      } else if (Math.abs(u.pos.x - GATE.x) > 2.5) {
        goTo(p, inp, GATE.x, GATE.z + 6, 1);
      } else goTo(p, inp, it.pos.x, it.pos.z, it.r - 0.4);
    }
    return;
  }
  if (F.step === 3.2) { goTo(p, inp, GATE.x, GATE.z + 6, 1.5); return; }
  if (F.step === 3.5 || F.step === 4) {
    // 人に示す炎上時の持ち場と同じ所へ退き、館の前で待ち続けない。
    if (F.paceEnjou && !F.enjouDone) {
      const post = b.markers.find((m) => m.id === 'enjou');
      if (post) { goTo(p, inp, post.pos.x, post.pos.z, 1.5); return; }
    }
    if (u.pos.z > GATE.z + 9) { climbBotWay(p, inp, GATE.x, GATE.z + 6, 1, goTo); return; }
    if (u.pos.z > GATE.z - 4) {
      if (u.pos.z > GATE.z && Math.abs(u.pos.x - GATE.x) > 3.5) goTo(p, inp, GATE.x, GATE.z + 6, 1);
      else goTo(p, inp, GATE.x, GATE.z - 6, 1);
      return;
    }
    const id = F.step === 4 ? 'shu' : !F.lowerTaken ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
    // 行きと帰りが重なる尾根道を毎回「近い線」で選ぶと、同じ角へ戻り続ける。
    // 人に示す順番と同じ角を通り、最後は曲輪の持ち場へ入る。
    // 人に出す帰り先と同じ印を使う。独自の狭い幅で戻すと、札が前を指しても横へ歩き続ける。
    // 最後の角も実際に通ってから曲輪へ入る。柵の口を斜めに飛ばさない。
    const goal = F.castleGuideArrived ? id === 'shu' ? HONMARU_POST : F.SZ.byId[id].pos : F.castleGuidePoint;
    goTo(p, inp, goal.x, goal.z, F.castleGuideLeaving ? 0.35 : F.castleGuideArrived ? 1.5 : 0.8);
    return;
  }
  // 開戦前は尾根の先手と待つ。筒井の陣所は麓にあり、直線で追うと道を外れて下ってしまう。
  inp.guardHold = false;
  inp.runHeld = false; inp.chargeHold = false;
}

// 門内の尾根道も曲がり角をたどる。直線の近道で柵や切岸へ進ませない。
function castleBotWay(p, inp, path, goal, goTo) {
  const pos = p.u.pos;
  let from = 0, to = 0, bestFrom = Infinity, bestTo = Infinity;
  for (let i = 0; i < path.length; i++) {
    const q = path[i], d = Math.hypot(q[0] - goal.x, q[1] - goal.z);
    if (d < bestTo) { bestTo = d; to = i; }
  }
  // 点の近さだけで選ぶと、門の六歩内から門へ戻って永遠に往復する。
  // 目的地までの道の線分へ位置を写し、その先の曲がり角へ進む。
  for (let i = 1; i <= to; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pos.x - a[0]) * dx + (pos.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(pos.x - a[0] - dx * t, pos.z - a[1] - dz * t);
    if (d < bestFrom - 0.01 || Math.abs(d - bestFrom) < 0.01 && i > from) { bestFrom = d; from = i; }
  }
  if (from === to || !to) { goTo(p, inp, goal.x, goal.z, 2); return; }
  if (Math.hypot(path[from][0] - pos.x, path[from][1] - pos.z) < 3) from++;
  const q = path[Math.min(from, to)];
  goTo(p, inp, q[0], q[1], 1.5);
}
// 登城道上の位置を、折り返しの番号と割合で表す。結果の入れ物は使い回す。
function climbRoadPoint(x, z, out) {
  out.d = Infinity;
  for (let i = 0; i < CLIMB_END; i++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d >= out.d) continue;
    out.x = qx; out.z = qz; out.s = i + t; out.d = d;
  }
}
// 伏兵に、まだ刃を向けて来る者が残るか（逃げる者・深手の者は数えない）
function ambLive(g) { return !gone(g) && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut); }
function climbWayPoint(p, x, z, out) {
  const from = p._sgRoadFrom || (p._sgRoadFrom = {}), to = p._sgRoadTo || (p._sgRoadTo = {});
  const goal = p._sgRoadGoal || (p._sgRoadGoal = {});
  goal.x = x; goal.z = z; goal.y = p.u.pos.y;
  climbRoadPoint(p.u.pos.x, p.u.pos.z, from);
  climbRoadPoint(x, z, to);
  // 道の幅内でも、切岸の下や柵の外へ押される事がある。距離だけで復帰を済ませない。
  p.rt.flags.climbReturning = from.d > ROAD_HALF - 1 || !guideClear(p.rt, p.u.pos, from);
  // 真横の道が切岸の上なら、歩いて戻れる道の口を探す。再探索は半秒に一度だけ。
  if (p.rt.flags.climbReturning) {
    const q = p._sgRejoin || (p._sgRejoin = { x: 0, z: 0, at: -1, found: false, probe: {} });
    if (p.rt.t >= q.at) {
      q.at = p.rt.t + 0.5; q.found = false;
      let best = Infinity;
      for (let i = 0; i < CLIMB_END; i++) {
        const a = ROAD[i], b = ROAD[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
        for (let k = 0; k <= n; k++) {
          const probe = q.probe;
          probe.x = a[0] + (b[0] - a[0]) * k / n; probe.z = a[1] + (b[1] - a[1]) * k / n;
          const d = Math.hypot(probe.x - p.u.pos.x, probe.z - p.u.pos.z);
          if (d > 60 || d >= best || !guideClear(p.rt, p.u.pos, probe)) continue;
          // 戻り口から次の角まで進める所だけ選ぶ。足元の行き止まりへ戻し続けない。
          const end = to.s < i ? a : b;
          goal.x = end[0]; goal.z = end[1]; goal.y = p.rt.world.heightAt(goal.x, goal.z);
          if (!guideClear(p.rt, probe, goal)) continue;
          best = d; q.x = probe.x; q.z = probe.z; q.found = true;
        }
      }
    }
    out.x = q.found ? q.x : from.x; out.z = q.found ? q.z : from.z; return;
  }
  // 最後は同じ道の上の伏兵へ寄る。
  if (Math.abs(from.s - to.s) < 0.08 && Math.hypot(x - p.u.pos.x, z - p.u.pos.z) < 12 && guideClear(p.rt, p.u.pos, goal)) {
    out.x = x; out.z = z; return;
  }
  const forward = to.s > from.s;
  let i = forward ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
  // 曲がり角は 2.5m 内で済みとする。1.2m だと、角に味方が立つと「角へ戻る／次へ進む」を一歩ごとに繰り返し、
  // 指の操作の bot が 33,-46 の角で 480 秒止まった（角に寄れる距離より判定が狭かった）。
  if (i >= 0 && i <= CLIMB_END && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 2.5) { if (forward) p._sgCornerDone = i; i += forward ? 1 : -1; }
  // 一度済ませた角へは、近くにいる間は戻らない（済みの判定の縁で行き来しない）。
  else if (forward && p._sgCornerDone === i && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 8) i++;
  if (i >= 0 && i <= CLIMB_END && (forward ? i <= to.s : i >= to.s)) {
    out.x = ROAD[i][0]; out.z = ROAD[i][1];
  } else if (Math.hypot(to.x - p.u.pos.x, to.z - p.u.pos.z) > 1.2) {
    out.x = to.x; out.z = to.z;
  } else if (guideClear(p.rt, p.u.pos, goal)) { out.x = x; out.z = z; }
  else { out.x = p.u.pos.x; out.z = p.u.pos.z; }
}

// 人に示す角と同じ順で進む。任務が変わっても、谷から門へ直進しない。
function climbBotWay(p, inp, x, z, r, goTo) {
  const out = p._sgWayPoint || (p._sgWayPoint = {});
  climbWayPoint(p, x, z, out);
  goTo(p, inp, out.x, out.z, out.x === x && out.z === z ? r : 1);
}

const HONMARU_POST = { x: TOP.x, z: TOP.z + 8 };
function gateSteer(b, inp) {
  if (!inp.k.has('KeyW') || (b.flags.gate && b.flags.gate.alive)) return;
  const p = b.player, u = p.u, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const az = u.pos.z + fz * 3, ax = u.pos.x + fx * 3;
  if (Math.abs(u.pos.x) < 4.5 || Math.abs(u.pos.x) > 30 || Math.abs(ax) < 4.5) return;
  const wz = GATE.z + (Math.min(28, Math.abs(u.pos.x)) - 5.5) / 22.5 * 4;   // その x での柵の z
  if (u.pos.z > wz + 0.3 && az < wz + 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z + 4 - u.pos.z);
  else if (u.pos.z < wz - 0.3 && az > wz - 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z - 3 - u.pos.z);
}

shigisan.withdrawTick = (rt) => {
  const F = rt.flags, f = F.castleFire;
  if (!f) return;
  const t = Math.min(1, (rt.t - F.castleFireAt) / 12);
  f.size = 2 + t * 2;
  const ground = rt.world.heightAt(f.x, f.z);
  // 火勢は増しても根元を上空へ運ばない。増えた高さは炎自身の大きさで表す。
  f.base = ground + 0.45 + f.size * 0.35;
  // 内の炎・照り返し・煙も、壁に接した炎と同じ高さへそろえる。
  f.big = f.size >= 2; f.inner.position.y = f.base - f.size * 0.08;
  f.ly = f.base - ground + f.size * 0.3;
  f.glow?.scale.setScalar(7 * Math.max(1, f.size / 1.3));
  if (rt.t >= (F.castleSmokeAt || 0) && f.smoke != null && rt.world.smokeCol) {
    F.castleSmokeAt = rt.t + 0.5;
    const smoke = rt.world.smokeCol;
    for (let k = 0; k < smoke.PER; k++) { const i = f.smoke * smoke.PER + k; smoke.pos[i * 3 + 1] = f.base + f.size * 0.5; smoke.seed[i * 2 + 1] = Math.min(4, f.size * 0.9); }
    smoke.pts.geometry.attributes.position.needsUpdate = smoke.pts.geometry.attributes.seed.needsUpdate = true;
  }
};
// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（11/01 bushou_17_32）。
shigisan.bushou = ['佐久間信盛', '羽柴秀吉', '明智光秀', '細川藤孝'];
// 城攻めの部品（siege_kit.js。battle.js が組み、毎コマ動かす）：大手の門の左右の柵と折れ（横矢の面）を狭間に借り、
// 櫓を越えて門へ寄る間だけ、柵の上の陣笠と銃口・閃光と白煙・矢を見せる。兵・塀・門は足さない。当てない（傷は筋書きのまま）。
shigisan.siegeKit = {
  plan: { x: 0, z: GATE.z, rot: 0, W: 48, yokoya: false, moat: false, kirigishi: 0, umadashi: false, sakamogi: false, shiyori: false },
  build: { team: 1, gate: false, walls: false, bridge: false, heads: true, fire: { hurt: 0, near: 90, close: 16, base: .9, peak: 4, arrows: .35 } },
  borrow: { r: 52, name: '柵', flank: true },
  when: (rt) => { const F = rt.flags; return F.step >= 2 && F.step < 3.5 && F.gate?.alive && !F.ending && !rt.over; },
};
export { shigisan };

// bot の記録の跡に、攻め口の兵の数（生き・逃げ・深手）を残す（10/30）
shigisan.botDbg = (b) => (b.flags.step >= 3.5 && b.flags.castleGuidePoint ? `g${b.flags.castleGuidePoint.x.toFixed(0)},${b.flags.castleGuidePoint.z.toFixed(0)}${b.flags.castleGuideBlocked ? 'B' : ''}${b.flags.castleGuideArrived ? 'A' : ''} ` : '') + (b.flags.oda || []).map((q) => `${q.units.filter((u) => u.alive && !u.fleeing && !u.woundOut).length}/${q.units.filter((u) => u.alive).length}/${q.units.length}`).join(',');
