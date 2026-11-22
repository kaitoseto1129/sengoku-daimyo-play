// ======================================================================
// 豊臣編　小牧の対陣（天正十二年三月十七日〜四月）。調べは docs/battle_refs/t03_komaki.md。
// 長久手（四月九日）は別の戦（b_t03b_nagakute.js）。AR の 2（kaito 11/3）：小牧と長久手を分ける。
// 11/4 jin（布陣の作り直し）：羽黒の戦いは、南（小牧山の方）から奥平信昌・榊原康政の先手が正面に、
//   酒井忠次の手が西から回り込んで退き道を断とうとし、森勢は北の犬山へ退いた（森 三千・徳川 五千＝およそ 3:5）。
// ①羽黒：森長可の陣の前で、南から寄せる奥平・榊原の先手を押し返す（二十秒後、西から酒井の手が横を突く）
// ②森長可の鶴丸の旗と共に、八幡林の北の犬山への道の口まで退く（追われる。森勢は主人公を待たずに退く）
//   退く時、母衣衆の野呂助左衛門・助三郎の父子が引き返して殿をし、討死する（家忠日記・長久手合戦記の言い伝え）
// ③四月の初めの夜・二重堀の砦（羽柴方の最前線。楽田の秀吉の本陣はその北の後ろ）：小牧山から夜討ちに来る徳川の手を、
//   二重の空堀の土橋と柵の切れ目で通さない。守将は日根野弘就、乱れを稲葉一鉄が鎮めた（武徳編年集成）。篝火の夜
// ④砦の兵と木戸を出て、堀の前の徳川の鉄砲組を追い払う。最後に楽田で池田恒興が三河への中入りを言い出す
// 羽黒の朝、家康はまだ清洲・秀吉はまだ大坂にいた（家康の小牧山入りは三月下旬、秀吉の楽田着陣は三月二十八日ごろ）。
//   二人の本陣は③の夜から置く（11/5 時代考証の見直し）
// 負け：本人が討たれる・夜討ちで木戸を破られる。連れた兵の損耗だけでは任務を失敗にしない。
// ③④では家康・信雄は南の小牧山の本陣、秀吉は北の楽田の本陣で、陣幕の中の床几に座り、旗本に守られ前に出ない（AR の 3・AV の 7）。
// 名のある将（森長可・奥平信昌・酒井忠次）は馬上で、旗本の組に囲まれる。行き先は金の▼一つで、段ごとに場所は固定。
// 旗は戦った家だけ：羽柴（秀吉の砦）・森（鶴丸）・徳川（奥平・榊原・酒井を含む）・信雄（本陣だけ）。
// 向き：北は −z。西（−x）が二重堀の砦、その北北東の後ろが楽田、南南西の奥が小牧山（実の地図どおり。11/5）。東（+x）が羽黒の八幡林、北（−z）が犬山。
//   羽黒は実は楽田の北だが、時の飛ぶ二つの場を一枚に並べるため東に置いた。間隔は縮めた復元。
// ======================================================================
import { fujinRealN } from './fujin_layout.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { horiboriHeight, dobeiLine, yaguraGate, monomi, jingoya } from './castle_parts.js';
import { kagaribiBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { flagTexture } from './textures.js';
import { reduceMotion } from './settings.js';
import { battleEventsStart } from './battle_events.js';
import { buildFieldworks } from './yasen_obstacles.js';
// 15分の段（kaito 11/8 夜）：段の中身は t03_komaki/ に
import * as Camp from './t03_komaki/camp.js';
import * as Council from './t03_komaki/council.js';
import * as Night from './t03_komaki/night.js';
import { T03_DEPTH } from './t03_komaki/depth.js';

// 11/21 K516：英語の時だけ字の表を読む（i18n_komaki.js・日本語は読まない）
import { isEn, addEn } from './i18n.js';
import { headGroupTick } from './head_group.js';   // 11/21：本人の前に討てる組頭の小組
import { MEM_BUDGET } from './device_tier.js';   // K564 記憶の予算
import { isTouch as TOUCH } from './touch.js';
if (isEn()) import('./i18n_komaki.js').then((m) => addEn(m.default)).catch(() => {});

// 時の飛ぶ所の短い暗転（11/8 二6・十二1：羽黒の松林から一瞬で夜の砦の中へ飛んだ）。動きを減らす設定ではすぐ替える
function blackCut(rt, mid, text) {
  if (typeof document === 'undefined') { mid(); return; }
  const still = reduceMotion();
  const d = document.createElement('div');
  // 任務や兵数の札も覆い、日が替わる前後の画面を重ねない。一時停止の幕（35）は操作できる位置に残す。
  d.style.cssText = `position:fixed;inset:0;background:#000;color:#ece4d2;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;font-size:24px;line-height:1.6;opacity:0;pointer-events:none;z-index:34;transition:opacity ${still ? 0 : 0.6}s`;
  d.textContent = text; d.setAttribute('role', 'status');
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '1'; });
  const drop = () => { d.remove(); rt.cleanupTasks?.delete(drop); };
  rt.cleanupTasks?.add(drop);
  // 一時停止中は戦の時刻も止まる。実時間だけで幕を消すと、再開時の日替わりが丸見えになる。
  rt.after(still ? 0.1 : 0.9, () => {
    try { mid(); } catch (e) { console.error(e); }
    d.style.opacity = '0'; rt.after(1.4, drop);
  });
}

const XW = 158, ZN = -120, ZS = 120;                   // 見えない壁
const ROAD = [[156, -8], [110, -10], [60, -22], [10, -26], [-40, -22], [-70, -18], [-156, -24]];
const HAGURO = { x: 110, z: -10 };                     // 羽黒・八幡林の森長可の陣
const NROAD = [[110, -10], [106, -48], [98, -92], [94, -150]];   // 八幡林から北の犬山への道
// 11/19 クラウド持ち主（425秒の 874×402 の写真：「夜明けの道を南東へ進む」のに道が無く、列が平らな野原に散って歩いていた）：
//   羽黒の道から五条川の渡しを越え、岩崎城へ南東に下る道（中入りの列が通った岩崎・岡崎への道。形は略）
const SROAD = [[128, -9], [131, 12], [132, 30], [136, 54], [141, 76], [146, 96], [151, 124], [156, 158]];
const INU = { x: 98, z: -96 };                         // 犬山への道の口（森勢の退く先）
const MORIJIN = { x: 124, z: -24 };                    // 森長可の陣幕（夜半に張った陣。犬山への道の東の脇）
const RAKUDA = { x: -40, z: -104 };                    // 楽田の秀吉の本陣（砦の北北東のずっと後ろ。史実は二重堀からおよそ二 km）
const FORT = { x: -70, z: -18 };                       // 二重堀の砦（羽柴方の砦でいちばん小牧山に近い最前線）
const GATE = { x: -70, z: -4 };                        // 砦の南の木戸
const FIELD = { x: -70, z: 40 };                       // 堀の前の野（徳川の鉄砲組が出る所）
const KOMAKI = { x: -104, z: 125 };                    // 小牧山（砦の南南西・壁の外。遠景が切れる百五十以内へ縮尺を合わせる）
const HONJIN = { x: -100, z: 95 };                     // 家康・信雄の本陣（小牧山の麓・壁の外）
const REAL_CAP = 236;
// 五条川：羽黒の陣の南を東西に流れる。奥平の先手はこれを渡って突いた
const GOJO = [[162, 46], [132, 36], [104, 33], [74, 37], [50, 54], [34, 90], [26, 126]];
// 11/19 クラウド19（川の間近の見回り：五条川の水面が七点の折れ線のまま曲がり目で角の立った板に見えた・cloud-06）：
//   川の筋だけ角を二度削って丸める（チャイキン。点の数 7→26）。渡しや道の点（GOJO）はそのまま。
const GOJO_RIVER = [0, 1].reduce((pts) => [pts[0], ...pts.slice(0, -1).flatMap((p, i) => { const q = pts[i + 1];
  return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; }), pts[pts.length - 1]], GOJO);
// 二重堀：柵の南に空堀を二筋。真ん中は土橋（木戸の前だけ渡れる）
const HORI = [[[FORT.x - 38, 3], [GATE.x - 5, 3]], [[GATE.x + 5, 3], [FORT.x + 38, 3]],
  [[FORT.x - 40, 10], [GATE.x - 5, 10]], [[GATE.x + 5, 10], [FORT.x + 40, 10]]].map((pts) => horiboriHeight(pts, { depth: 1.5, width: 4.2 }));
// 柵の内の篝火（夜討ちの夜に火を入れる）
// 楽田城（秀吉の本陣）：四方に堀と土塁の平城（楽田城跡・『尾張志』）。南の大手に櫓門、北西の隅に櫓。堀は大手の前だけ土橋
const RK = { x0: RAKUDA.x - 24, x1: RAKUDA.x + 24, z0: RAKUDA.z - 14, z1: RAKUDA.z + 24 };
const RHORI = [[[RK.x0 - 5, RK.z1 + 5], [RAKUDA.x - 4, RK.z1 + 5]], [[RAKUDA.x + 4, RK.z1 + 5], [RK.x1 + 5, RK.z1 + 5]],
  [[RK.x0 - 5, RK.z1 + 5], [RK.x0 - 5, RK.z0 - 6]], [[RK.x1 + 5, RK.z1 + 5], [RK.x1 + 5, RK.z0 - 6]],
  [[RK.x0 - 5, RK.z0 - 6], [RK.x1 + 5, RK.z0 - 6]]].map((pts) => horiboriHeight(pts, { depth: 1.6, width: 4.6 }));
// 遠くの軍勢（軽い作り・本物に替えない）：描く兵は百に足りなくても、三千対五千・楽田と小牧山の対陣の規模に見せる（十二の1）
function farArmy(rt, x, z, w, d, count, facing, flag, team, seed) {
  const A = rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: team ? TOKU.armor : 0x2b2723, flagTex: flagTexture(flag), mon: flag, flag, seed, team, farFill: true, host: false, kind: 'mixed', flagRate: 0.15 });   // 11/8 八1：白い大きな幟が厚い板に見え、夜空に黒い板の切れ端のように浮いた。遠くの幟は少なく
  if (A && A.army) { A.army.team = team; A.army.noWake = true; }
  return A;
}
// 徳川方の将の旗（奥平は奥平の紋、榊原は「無」の字、酒井は片喰。物見が旗で見分ける）
const HOUSE = { '奥平信昌': 'okudaira', '榊原康政': 'sakakibara', '酒井忠次': 'katabami' };
const kitOf = (name) => { const k = Object.keys(HOUSE).find((n) => name && name.startsWith(n)); return k ? { ...TOKU, flag: HOUSE[k] } : TOKU; };
const KAGARI = [[FORT.x - 26, -7], [FORT.x - 12, -7], [GATE.x - 6, -7], [GATE.x + 6, -7], [FORT.x + 12, -7], [FORT.x + 26, -7], [FORT.x, -30]];
export const ARMOR = KIT.ARMOR;
export const TOKU = { armor: ARMOR.tokugawa, cloth: 0x5a4632, lace: 0x7a5a3a, flag: 'tokugawa' };
// 一つの家の旗を、組の全員に付ける（allyGroup の既定は織田の旗。羽柴方は家の旗を明かす）
export const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(s.o || {}) } }));
export const dressT = (list, kit = TOKU) => list.map((s) => ({ ...s, o: { ...kit, ...(s.o || {}) } }));
export const foeKnot = (n = 9, kit = TOKU) => dressT([{ type: 'ashigaru', n: Math.ceil(n * 0.5), o: { flagScale: 1 } }, { type: 'ashigaru', n: Math.floor(n * 0.2) },
  { type: 'gun', n: Math.max(1, Math.floor(n * 0.15)) }, { type: 'samurai', n: Math.max(1, n - Math.ceil(n * 0.5) - Math.floor(n * 0.2) - Math.max(1, Math.floor(n * 0.15))) }], kit);
export const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
export const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0) : 0);
// 生存者と抵抗する兵を分ける。逃げた兵や深手で戦を離れた兵を追って、田や渡しで詰まらない。
export const resistingN = (g) => (!g || g.routed || g.order === 'retreat' || g.order === 'flee' ? 0 :
  g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && !u.woundOut ? 1 : 0), 0));
const drivenOffGroup = (g, total) => !g || g.routed || g.order === 'retreat' || g.order === 'flee' || resistingN(g) <= total * 0.35;
function retreatGunLine(g, total) {
  if (!live(g) || g.order === 'retreat' || !drivenOffGroup(g, total)) return;
  g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 };
}
// 砦内からは木戸を通って退く。横陣のまま南へ直進して柵に掛からせない。
function withdrawGateWave(g) {
  if (!live(g) || g.order === 'retreat' || g.order === 'flee') return;
  const c = g.center();
  g.order = 'retreat'; g.noAI = true; g.stay = false;
  g.focus = null; g.commanderPush = null; g.path = null;
  g.aggro = 0; g.seekRange = 0; g.onArrive = null;
  for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
  if (c.z < GATE.z && c.z > GATE.z - 34 && Math.abs(c.x - GATE.x) < 34) {
    g.formation = 'column'; g.colW = 2; g.facing = 0;
    g.dest = { x: GATE.x, z: GATE.z - 8 };
    g.onArrive = (q) => {
      q.dest = { x: GATE.x, z: 22 };
      q.onArrive = (r) => { r.dest = { x: GATE.x, z: ZS + 20 }; };
    };
  } else g.dest = { x: c.x, z: ZS + 20 };
}
// 本物の兵の数（壁の外の本陣は、描く数がほぼ要らないので数えない）
export const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && u.type !== 'porter' && !u.group?.honjin && !u.group?._fjR ? 1 : 0), 0);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 本陣（床几の大将は陣幕の中に座る）の前を囲む旗本。動かず、討てない
function campGuard(rt, team, at, facing, name, flag, n, faction) {
  const mk = team ? enemyGroup : allyGroup;
  const list = [{ type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } }, { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }];
  const g = mk(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99, ...(faction ? { faction } : { fullStrength: true }) },
    team ? dressT(fl(list, flag)) : fl(list, flag));
  // 11/18 21:10 クラウド 小牧の持ち主：全力（all_out.js）が開戦十六秒で家康・信雄の旗本（討てない本陣）と秀吉の旗本を「かかれ」で寄せ、
  //   九十秒に討てない旗本四十二人が二重堀の木戸の前に来ていた（描かずの通し）。campGuard の印で全力・前線寄せの下知から外す
  //   stay：本人が斬り合う時の「迎えに出る」（ally_charge.js）からも外す（段3 の二百秒に家康の旗本三十一人が「かかれ」になっていた）
  g.honjin = true; g.campGuard = true; g.stay = true;
  for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  return g;
}
// 名のある敵の将：馬上で、旗本（侍・足軽・鉄砲）の組に囲まれて、先手の後ろを進む。討てない
function foeGeneral(rt, name, at, n = 14) {
  const g = enemyGroup(rt, { faction: 'tokugawa', name: name + 'の旗本', anchor: { ...at }, facing: Math.PI, width: 5, formation: 'line', morale: 95, dmgMult: 0.4,
    order: 'hold', seekRange: 10, aggro: 6, speed: 3.4, noRout: true },
  dressT([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } },
    { type: 'ashigaru', n: Math.round(n * 0.4), o: { flagScale: 1 } }, { type: 'gun', n: Math.max(1, n - Math.round(n * 0.45) - Math.round(n * 0.4)) }], kitOf(name)));
  g.leader = g.units.find((u) => u.name === name);
  rt.flags.waves.push(g);
  return g;
}
// 時が飛ぶ所：本人と連れた兵を次の持ち場のそばへ移す（無駄に歩かせない・AT の 10）
function warpTo(rt, x, z, heading) {
  const P = rt.player.u, W = rt.world;
  const put = (u, dx, dz) => { u.pos.x = x + dx; u.pos.z = z + dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.target = null; u.moveTo = null; u.warpedOnce = true; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } };
  put(P, 0, 0);
  if (rt.player.vel) { rt.player.vel.x = 0; rt.player.vel.z = 0; }
  rt.player.lock = null;
  // heading は向く先の点 {x,z}（カメラと体をその点へ向ける）
  if (heading != null) { const h = Math.atan2(heading.x - x, heading.z - z); rt.player.yaw = P.heading = h; rt.player.camYawOff = 0; }
  // 11/19 07:20 クラウド 小牧の持ち主：組は世界の南（z-）へ並べていたので、北へ向く軍議の移しでは組が本人と床几の間に立ち、行き先を塞いだ。
  //   向く先の後ろ（本人の背）へ六人ずつの列で並べる
  const h = heading != null ? Math.atan2(heading.x - x, heading.z - z) : 0, fx = Math.sin(h), fz = Math.cos(h);
  const at = (side, back) => [side * fz - back * fx, -side * fx - back * fz];
  let i = 0;
  for (const g of [...(rt.squadGroups || []), rt.flags.men]) if (g && g.units) {
    for (const u of g.units) if (u.alive && !u.isPlayer) { const [dx, dz] = at(-4 + (i % 6) * 1.6, 3 + Math.floor(i / 6) * 1.5); put(u, dx, dz); i++; }
    const [ax, az] = at(0, 4); g.anchor = { x: x + ax, z: z + az };
  }
}

// 家康・信雄の本陣（AR の 3）：金扇の馬印のまわりに旗本・馬廻の侍と足軽・鉄砲。動かず、前に出ない。討てない
export function ieyasuHonjin(rt, at, facing) {
  const o = { faction: 'tokugawa', facing, width: 9, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99 };
  const ie = enemyGroup(rt, { ...o, name: '徳川家康の旗本', anchor: { x: at.x, z: at.z } },
    dressT([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 18, o: { keep: true } },
      { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 6 }]));
  const nb = enemyGroup(rt, { ...o, faction: 'nobukatsu', name: '織田信雄の旗本', anchor: { x: at.x + 16, z: at.z + 4 }, width: 6 },
    [{ type: 'busho', n: 1, o: { name: '織田信雄', invuln: true, horse: true, flag: 'nobukatsu' } }, { type: 'samurai', n: 8, o: { flag: 'nobukatsu', keep: true } }, { type: 'ashigaru', n: 6, o: { flag: 'nobukatsu', flagScale: 1 } }]);
  for (const g of [ie, nb]) { g.honjin = true; g.campGuard = true; g.stay = true; for (const u of g.units) { u.invuln = true; u.noTarget = true; } }
  return [ie, nb];
}
// 見えない壁：本陣（壁の外）の兵だけは外に置いたまま
export function walls(rt, xw, zn, zs, cull = false) {
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.group?.honjin) continue;
    // 11/18 クラウド act bot（256秒）：段の切り替わりの間に壁の外 z=127 へ流れた味方の新手が、ここで一息に 7m 戻された。
    //   三 m より外へ出た味方（本人と連れた兵は除く）は戻さずに去らせる
    if (cull && u.team === 0 && !u.isPlayer && u.group !== rt.flags.men && (u.pos.z > zs + 3 || u.pos.z < zn - 3 || Math.abs(u.pos.x) > xw + 3)) { try { rt.army.despawn(u); continue; } catch (e) { /* 消せなければ戻す */ } }
    if (u.pos.x > xw) u.pos.x = xw; else if (u.pos.x < -xw) u.pos.x = -xw;
    if (u.pos.z > zs) u.pos.z = zs; else if (u.pos.z < zn) u.pos.z = zn;
  }
}

// 二重堀の砦の土塁（芝手）：柵の下に芝付きの土手（秀吉の書状「芝手を築き柵を付けよ」）。木戸の土橋の口だけ切る
const DL = FORT.x - 34, DR = FORT.x + 34;
function dorui(x, z) {
  if (x < DL - 4.6 || x > DR + 4.6 || z < GATE.z - 34 || z > GATE.z + 3.6) return 0;
  // 11/8 八3：土塁の肩が板の縁のように切れて見えた。裾をなだらかに（芝手の土手）
  const bank = (d) => { const k = Math.max(0, 1 - Math.abs(d) / 3.6); return k * k * (3 - 2 * k); };
  const gap = Math.min(1, Math.max(0, (Math.abs(x - GATE.x) - 4) / 2));
  const front = bank(z - (GATE.z - 1)) * gap * Math.min(1, Math.max(0, (x - DL + 3.6) / 3.6), Math.max(0, (DR + 3.6 - x) / 3.6));
  const side = Math.max(bank(x - (DL - 1)), bank(x - (DR + 1))) * Math.min(1, Math.max(0, (GATE.z + 3.6 - z) / 3.6), Math.max(0, (z - GATE.z + 34) / 3.6));
  return 1.1 * Math.max(front, side);
}
function height(x, z) {
  // 尾張北部の平らな田と低い丘。羽黒は東の林の高み、小牧山は南の壁の外に独りで立つ山
  let h = 1.2 * Math.sin(x * 0.02 + 0.4) * Math.cos(z * 0.017 - 0.3) + 0.6 * Math.sin(x * 0.06 - z * 0.05);
  h += 4 * gauss(x, z, 130, -40, 2200);                    // 八幡林の高み
  h += 2 * gauss(x, z, RAKUDA.x, RAKUDA.z, 700);           // 楽田城の小高い所
  h += 3 * gauss(x, z, FORT.x - 8, FORT.z - 14, 900);      // 砦の小高い所
  h += 30 * gauss(x, z, KOMAKI.x, KOMAKI.z, 1500);         // 小牧山（高さ八十六 m の独立した山を縮めて）
  const r = Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, NROAD), distToPolyline(x, z, SROAD));
  if (r < 6) h *= 0.7 + r * 0.05;
  if (Math.abs(x - FORT.x) < 44 && z > -2 && z < 15) for (const d of HORI) h += d(x, z);
  h += dorui(x, z);
  if (x > RK.x0 - 12 && x < RK.x1 + 12 && z < RK.z1 + 12) for (const d of RHORI) h += d(x, z);
  return h;
}

// 15分の七段（kaito 11/8 夜 docs/toyo15_plan_1108.md）：①陣の厚み ②柵越しの小競り合い ③堀の前の鉄砲組 ④軍議 ⑤中入りの支度 ⑥夜の出陣と斥候戦 ⑦夜明けの知らせ
const STAGE_TEXT = ['',
  '楽田の本陣から二重堀の砦の物見櫓へ下る',
  '二重堀の砦の柵の切れ目を守る',
  '堀の前の田へ出て、徳川の鉄砲組を追い払う',
  '楽田の本陣の軍議へ戻る',
  '森長可の陣へ中入りの下知を届ける',
  '森勢の列と五条川の渡しへ出る',
  '五条川を越え、夜明けの道を南東へ進む'];
const COUNCIL = { x: RAKUDA.x + 6, z: RK.z1 + 9 };   // 楽田城の大手門の前の床几（軍議。城の中へ入らずに済む）
const PIN_NAMES = ['', '二重堀の物見櫓', '二重堀の木戸', '堀の前の田', '楽田の本陣', '森長可の陣', '五条川の渡し', '五条川の南東の道'];
// 到着後も報告や守備が続く。共通の頭上印の六 m 以内で消す判定にも、常時表示を伝える。
const PIN = { x: 0, z: 0, r: 8, hide: 6, hideDistance: 0, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

function followMen(rt) {
  const g = rt.flags.men, P = rt.player.u.pos;
  if (!live(g)) return;
  // 11/19 07:55 クラウド 小牧の持ち主：軍議の間は床几の手前で待つ（council.js holdAtCouncil が持ち場を決める）
  if (rt.flags.cnHold) return;
  if (g.komakiGatePath) {
    // 11/17 クラウドえ act bot：北の回り道の途中 (-40,-4) で十五人が一点に重なり止まった（431秒）→十秒ほぼ動かなければ追従へ戻す
    const q = g.center(), m = g._gpMark;
    if (!m || Math.hypot(q.x - m.x, q.z - m.z) > 2) g._gpMark = { x: q.x, z: q.z, t: 0 };
    else if ((m.t += 0.5) >= 10) { g.komakiGatePath = false; g.path = null; g._gpMark = null; g.formation = 'line'; g.order = 'move'; g.dest = { x: rt.player.u.pos.x + 2, z: rt.player.u.pos.z + 2 }; g.speed = 4.2; }
    if (g.komakiGatePath) return;
  }
  // 11/18 クラウド持ち主 act bot（402秒）：森長可の陣へ下知を届ける道で、加勢の足軽の一人が (-23,-25) に引っかかり二十秒動かなかった（組の真ん中は動くので組の見張りに掛からない）。
  //   追う号令（move）の間に本人から三十五 m より遠く、八秒ほぼ動かない一人は去らせる（遅れた者は道で抜けたとみなす）
  for (const u of [...g.units]) {
    if (!u.alive || u.gone || u.isPlayer) continue;
    const m = u._kmStill;
    if (!m || Math.hypot(u.pos.x - m.x, u.pos.z - m.z) > 1) { u._kmStill = { x: u.pos.x, z: u.pos.z, t: 0 }; continue; }
    if ((m.t += 0.5) >= 8 && g.order === 'move' && !rt.flags.holdPlayer && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 35) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
  }
  if (!live(g)) return;
  const c = g.center();
  const inFort = (p) => p.z < GATE.z && p.z > GATE.z - 34 && Math.abs(p.x - GATE.x) < 34;
  const out = P.z > GATE.z + 4 && inFort(c);
  const back = inFort(P) && c.z > GATE.z + 4;
  // 東西の柵の外へ寄り道した主人公も追う。横へ直進すると柵際で全員が止まる。
  const beside = (p) => p.z <= GATE.z + 4 && Math.abs(p.x - GATE.x) >= 34;
  const rear = inFort(c) && beside(P) || inFort(P) && beside(c);
  if (out || back || rear) {
    // 主人公の右脇への直線追従では柵に突き当たる。木戸と二重堀の土橋を二列で渡り切ってから追従へ戻す。
    const north = [GATE.x, GATE.z - 24], south = [GATE.x, GATE.z + 30];
    g.komakiGatePath = true;
    g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
    g.order = 'path'; g.dest = null;
    // 横からの出入りは北の開いた背面へ回り、柵の端より北で横へ曲がる。
    const rearZ = GATE.z - 40;
    g.path = rear ? [[c.x, rearZ], [P.x, rearZ], [P.x, P.z]] : out ? [north, south] : [south, north]; g.pathIdx = 0;
    g.onArrive = (q) => {
      q.komakiGatePath = false; q.path = null; q.formation = 'line'; q.order = 'attack'; q.seekRange = 14;
    };
    g.speed = 4.2;
    return;
  }
  if (rt.flags.stage === 2 && inFort(c) && Math.hypot(P.x - GATE.x, P.z - GATE.z) < 10) {
    // 木戸を守る間は柵の内側に並ぶ。右脇の追従先を柵の外に置いたまま移動命令を続けない。
    g.anchor.x = GATE.x; g.anchor.z = GATE.z - 8;
    g.order = 'attack'; g.dest = null; g.seekRange = 14;
    return;
  }
  if (Math.hypot(c.x - P.x, c.z - P.z) > 8) {
    // 11/18 クラウドつ act bot：五条川の南 (83,73) の手前十 m で加勢の足軽が二十秒動かなかった（573秒）→
    // 八秒ほぼ動かなければ主人公の反対の脇へ回し、さらに八秒動かなければその場で構えて追従の動きを止める
    const m = g._mvMark;
    if (!m || Math.hypot(c.x - m.x, c.z - m.z) > 1.5) g._mvMark = { x: c.x, z: c.z, t: 0 };
    else m.t += 0.5;
    const st = g._mvMark.t;
    if (st >= 16) { g.order = 'attack'; g.dest = null; g.seekRange = 14; if (st >= 24) g._mvMark = null; return; }
    const s = st >= 8 ? -2 : 2;
    g.order = 'move'; g.dest = { x: P.x + s, z: P.z + s }; g.speed = 4.2;
  } else { g.order = 'attack'; g.seekRange = 14; g._mvMark = null; }
}

const t03_komaki = {
  stackAllAttack: true,   // 11/18 レ三：長久手と同じ。狙い無しで重なる attack 組を渦に散らす（11/17 榊原康政の手10人が一点に重なった）
  quietArmyCalls: true,   // 11/17 K358 iMac n-k15：中央の「味方が総崩れ」「敵が横から回り込む」「味方が追撃に移った」を出さない（場面が変わって味方の数が落ちた時に崩れと出た・字の札は出さない決まり）
  flagEra: { sakakibara: '榊原の日輪無' }, // 東博の康政像の日輪と無（当日の使用は復元）
  spawn: { x: RAKUDA.x - 4, z: RK.z1 + 8, heading: 0 },   // 楽田城の大手門の前（秀吉の本陣の下知を受けて出る）
  minutes: 15,
  expectMin: 15,
  depth: T03_DEPTH,   // 軍勢の厚み・陣立て（t03_komaki/depth.js）
  lethal: { max: 3, firstAt: 150, gap: 70 },   // 命懸けの戦場（docs/lethal_howto.md）
  fearKind: { kind: 'standoff', note: '十万の陣でも、動かぬ家康を崩せない', w: { flank: 1.2, iso: 1.4 }, line: '柵の向こうから撃たれておる！' },
  compactIntro: true,
  introText: () => '楽田の秀吉の本陣と、小牧山の家康の陣。両軍は砦を並べて睨み合う。',
  stageGoalsOnly: true,
  goalsVisibleRows: 5,   // 七段の順を保ち、今の目標から五件を並べる（九1）。共通の既定は一件だけ。
  hideGuideSteps: true,
  hideMissionDots: true,
  goalSignNoLabel: true,   // ▼の上に「印へ進め」などの字を出さない（三の1・五の1）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,   // 作り物の乱戦を足さない（AR の 7）
  // 共通の待つ備は noReserve とは別に動く。夜討ちと田の戦だけに出し、
  // 軍議・下知の道・中入りへ新手を追わせない。横陣の端も境界の内へ収める。
  reserveCap: REAL_CAP,
  reserveBox: { xw: XW - 20, zn: ZN + 20, zs: ZS - 20 },
  // 11/18 クラウドシ五（act bot 136・241秒）：味方の新手が壁の外 z=127 に湧き、一息で壁（120）へ 7m 飛んだ→置き場を壁の六 m 内へ寄せる
  // 11/18 レ三（戦略家 act bot 211秒：隊の後ろの並びが壁の外 z=127・128 に出て壁へ七 m 飛んだ）：置き場の真ん中は壁の十五 m 内へ（組の奥行きの分）
  reserveBound: (p) => (p && (Math.abs(p.x) > XW - 15 || p.z > ZS - 15 || p.z < ZN + 15) ? { ...p, x: Math.max(-XW + 15, Math.min(XW - 15, p.x)), z: Math.max(ZN + 15, Math.min(ZS - 15, p.z)) } : p),
  reserveFold: (rt) => rt.flags.stage !== 2 && rt.flags.stage !== 3,
  reserveOk: (rt, p, foe) => (rt.flags.stage === 2 || rt.flags.stage === 3) &&
    Math.abs(p.x) <= XW - 20 && p.z >= ZN + 20 && p.z <= ZS - 20 &&
    (!foe || (p.z >= 24 && p.z <= 70)),
  // 11/18 17:55 クラウド 小牧の持ち主：受けた傷が鉄砲だけ（侍・足軽の刃0・act bot「簡単すぎ」）の元は、上田と同じ共通の家臣の受け
  //   （ally_cover・命に関わらず七歩内で本人を狙う敵を毎秒味方へ向け直す）。命が六割を切るまでは本人が自分で斬り結ぶ（数と強さは変えない）
  allyCover: { below: 0.6 },
  goalSignOnly: true,  // 行き先は頭上の金の▼一つだけ（地面の矢印・持ち場の輪を出さない。BH の 6）
  goalSignNoFootArrow: true, // 11/19 持ち主：330秒の写真で足元の白い上向きの矢が森長可の陣の▼の下向きの矢と一本に重なった（goal_sign.js の足元の矢印）→ 描かない
  kumiLead: false,     // 組頭の青い印も出さない（印は一つ。AV の 15）
  nearbyAllySignLimit: 0,   // 11/8 五2・八1：近くの味方の頭上の白い丸が、宙に浮く白い玉に見えた
  noLeaderFollow: true,
  noHatamotoMass: true,
  frontlineDensity: false,
  alwaysMelee: false,
  noPursuit: true,   // 対陣の砦・床几・旗本は追撃に出さない。終盤の徳川の出陣は夜明けの段で動かす。
  // 11/21 クラウド 小牧の持ち主（act bot 0752 351秒：羽柴の後備え 1 の十二人が楽田城の大手の堀の前 (-43,-75) で一点に重なり止まる）：
  //   布陣の表の塊は付けた武将（床几の秀吉）に付いて行く。秀吉が軍議へ大手門を出入りする歩きに付いて、塊が塀と堀に突き当たった→床几の大将に付けた塊は持ち場で待つ
  fujinFollowHold: (rt, g) => !!g?._fjR?._gu?.group?.honjin,
  //   同（0800・0805 の 101・226秒：同じ塊が砦の夜討ちへ寄せに出て、二重堀の砦の北の柵の外 (-63,-62) で重なり止まる）→楽田の前の羽柴の塊は対陣の持ち場で待つ（史実も楽田の大軍は動かず）
  fujinWakeHold: (rt, g) => g?._fjR?.side === 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  enemyTriangleAll: true,   // 遠い敵も密集だけを理由に▼を消さない（九3：敵は一人残らず）。
  foeMarkVisible: (rt, u) => !!u.group?.honjin,   // 討てない小牧山の旗本も、敵の所属印は残す。
  keepBattleSigns: true,   // 行き先の案内中も、武将名・両軍の人数と敵の赤い▼を残す。
  noAutoFoeCam: () => true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 11/15 K338（天王寺・岡山の出来へ）：右上の地図を戻し、遠くの楽田・小牧山の陣も点で見せる。遠目でも陣の頭の名札を出す
  mapBack: true, mapRange: 170,
  nameRange: 280, nameRangeSamurai: true,
  victoryTitle: '小牧の対陣、膠着',
  victoryCaption: '二重堀を守り、三河への中入りへ',
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 出陣直後の下知を待つ間も、最初の物見櫓を指す。
    const stage = F.stage || 1;
    // 行き先は段ごとに固定（人や組の動きで動かさない。AW の 3・BK の 4）
    let p = [null, Camp.towerAt(rt, this.ctx(rt)), GATE, FIELD, COUNCIL, MORIJIN, Night.FORD, Night.DAWN][stage];
    if (!p) return null;
    // 11/18 K358：田から楽田へ戻る時、行き先が砦の柵の向こうを指し、本人が柵に突き当たった（874×402 の写真）。柵の外にいる間は木戸の外を指す
    const pu = rt.player?.u?.pos;
    if (stage === 4 && pu && !F.km4Gate) {
      if (pu.z > GATE.z + 1 && Math.abs(pu.x - FORT.x) < 44) {
        if (Math.hypot(pu.x - GATE.x, pu.z - (GATE.z + 5)) < 5) F.km4Gate = true;
        else { PIN.x = GATE.x; PIN.z = GATE.z + 5; PIN.r = 5; PIN.label = PIN_NAMES[2]; return PIN; }
      }
    }
    // 11/18 クラウド持ち主（描かずの通し）：木戸の外に着くとすぐ楽田を指し、北東へ斜めに歩いて柵に当たり、柵の外を東の端まで五十秒滑った（264〜315秒）。
    //   木戸の外に着いた後は、木戸をくぐって柵の内へ入るまで木戸の内を指す
    if (stage === 4 && pu && F.km4Gate && !F.km4In) {
      if (pu.z < GATE.z - 3) F.km4In = true;
      else if (Math.abs(pu.x - FORT.x) < 40 && pu.z < GATE.z + 12) { PIN.x = GATE.x; PIN.z = GATE.z - 6; PIN.r = 4; PIN.label = PIN_NAMES[2]; return PIN; }
    }
    // 目標の文から名を抜くと、長い文は空欄になり、鉄砲組の段では敵の名が場所の代わりに出る。
    PIN.x = p.x; PIN.z = p.z; PIN.r = 8; PIN.label = PIN_NAMES[stage];
    return PIN;
  },
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    seed: 15843,
    // 11/15 K338（天王寺・岡山の厚み K292 と同じ）：徒の侍も幟を負い、二人に一人を幟に、備を厚い四角の塊に。携帯は描く解像度を下げて軽く
    noboriSam: true, noboriBand: 2, blockForm: true, drawLow: true,
    overheadViewFar: 900,   // 真上の布陣で地面の端が欠けない（天王寺 K287①と同じ）
    time: 'morning',
    mist: 0.35,
    // 濃尾平野の南は開ける。小牧山は地面の独立峰で表し、背景の高山で隠さない。
    mountainScale: 0.08,
    proceduralSky: true,
    pineOnly: true,
    noBamboo: true,
    raggedPineCrowns: true,
    treeTrunkScale: 1.35,
    groundHalf: 220,
    terrainTriangles: true,   // 土塁・空堀の描画面と杭の接地を同じ三角形で求め、柵を宙に浮かせない。
    height,
    paths: [{ pts: ROAD, w: 3.5 }, { pts: NROAD, w: 3 }, { pts: SROAD, w: 3 }],
    longHoro: 'round',   // 野呂助左衛門の母衣は竹籠に布の丸い母衣（背の薄い板やマントにしない）
    streams: [{ pts: GOJO_RIVER, w: 4.5, depth: 0.9 }],
    patchyGround: true,
    // 11/8 四6・八1：二重堀の夜の地面が真昼のように明るく、木の影がくっきり、具足が銀白・桃色に照った。月明かりは弱く、影は淡く
    nightLift: 1.5,
    nightMoonMin: 0.16,
    nightMoonFloor: 0.16,   // 共通の下限 0.5 で月明かりを戻さず、下の夜の指定を保つ。
    // 月と別に足される補助光も抑える。共通の下限 0.4 のままでは、月を弱めても夜の陰が灰白に浮く。
    nightFill: 0.36,
    nightFillMin: 0.2,
    // 11/10 関所1：半分の指定でも共通の下限で兵だけの白い補光が残る。補光を止め、月光と篝火で具足を照らす。
    unitNightScale: 0, lowNightExposure: 1.1,
    noShafts: true,      // 11/8 八1：空に縦の白い筋（光の筋）が走った
    hatDropRate: 0.25,   // 11/8 八1：転がる陣笠が倒れた兵より目立った。落とすのは四人に一人
    nightLight: { sunI: 0.16, hemiI: 0.2, sky: 0x182033, fog: 0x1c2333, top: 0x060a14 },
    tint(x, z, h, c) {
      const k = 0.5 + 0.5 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.04);
      c.setRGB(c.r * (0.86 + k * 0.28), c.g * (0.88 + k * 0.24), c.b * (0.8 + k * 0.24));
    },
    // 八幡林・小牧山の木々・楽田の方の林
    groves: [
      { x: 132, z: -42, r: 28, n: 110, kind: 'matsu' },
      { x: 150, z: 20, r: 14, n: 30 },
      { x: KOMAKI.x, z: KOMAKI.z, r: 22, n: 90 },
      { x: -120, z: -70, r: 24, n: 50, kind: 'sugi' },
      { x: 30, z: -70, r: 16, n: 30 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, HAGURO) < 16 || dist({ x, z }, MORIJIN) < 16 || dist({ x, z }, FORT) < 26 || dist({ x, z }, RAKUDA) < 34 || dist({ x, z }, Night.FORD) < 10 || dist({ x, z }, Night.DAWN) < 12 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, NROAD) < 6 || distToPolyline(x, z, SROAD) < 5,
    trees: 200,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 60 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? z > 170 || x > 170 : x < -170),
  },

  // 段の中身（t03_komaki/*.js）へ渡す道具
  ctx(rt) {
    return { RAKUDA, RK, HONJIN, FORT, GATE, FIELD, MORIJIN, COUNCIL, farArmy, campGuard, fl, dressT, live, aliveN, resistingN,
      pushWave: (g) => rt.flags.waves.push(g), warpTo: (x, z, look) => warpTo(rt, x, z, look), next: () => this.stage(rt, rt.flags.stage + 1), win: () => this.win(rt) };
  },

  // 戦の途中の保存（K363）：stages.js の段の番号（k）で記録し、続ける時は段の始まりを順に流し直す（stage(rt, n, true) は黒幕の場面替えを飛ばす）
  resumeSteps: [1, 2, 3, 4, 5, 6].map((k) => [k, function (rt) { rt.flags.holdPlayer = false; this.stage(rt, k + 1, true); }]),
  setup(rt) {
    const F = rt.flags;
    { const T = rt._tpl || (rt._tpl = {});   // 11/19 army-07：布陣の表の備（fujin_place）が使う装束の手本。組が小さく覚えられない戦なので先に置く
      T.E = T.E || { o: { team: 1, faction: 'tokugawa' }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }] };
      T.A = T.A || { o: { team: 0, faction: 'oda' }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }] }; }
    F.stage = 0; F.holdPlayer = true; F.waves = [];
    Camp.campSetup(rt, this.ctx(rt));
    // 二重堀の砦：南向きの柵と木戸（羽柴の砦の兵が中に）
    const L = FORT.x - 34, R = FORT.x + 34, Z = GATE.z;
    F.saku = [...wallLine(rt, [[L, Z], [GATE.x - 4, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[GATE.x + 4, Z], [R, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[L, Z - 30], [L, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[R, Z], [R, Z - 30]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' })];
    // 11/18 クラウド 小牧の持ち主（K297 本の見開き「山の砦に赤い柵と鹿垣」）：外の空堀の向こうに倒木の逆茂木を二筋。
    //   木戸の前の土橋（左右七 m）は空ける。歩兵を遅くする帯だけで兵は足さない（砦の作りは小牧山の土塁・逆茂木の復元を手本に推した）
    try {
      F.sakamogi = buildFieldworks(rt, { team: 0, abatis: [
        { pts: [[FORT.x - 38, 13.5], [GATE.x - 7, 13.5]], facing: 0 },
        { pts: [[GATE.x + 7, 13.5], [FORT.x + 38, 13.5]], facing: 0 }] });
    } catch (e) { /* 逆茂木が置けなくても戦は続ける */ }
    // 守将は日根野弘就。稲葉一鉄も砦に詰める（どちらも馬上の名のある将・討てない）
    F.fort = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の兵', anchor: { x: FORT.x, z: GATE.z - 6 }, facing: 0, width: 16, aggro: 6, order: 'hold', fixed: true, noRout: true, dmgMult: 0.45 },
      fl([{ type: 'busho', n: 1, o: { name: '日根野弘就', horse: true } }, { type: 'busho', n: 1, o: { name: '稲葉一鉄', horse: true } },
        { type: 'gun', n: 10 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }], 'toyotomi'));
    for (const u of F.fort.units) if (u.type === 'busho') u.invuln = true;
    rt.scene.add(kagaribiBatch(rt.world, KAGARI));
    // 11/19 クラウド 小牧の持ち主（K297 本の見開き「山の砦に赤い柵と鹿垣、物見櫓、小屋が並ぶ」）：砦の中が柵と篝と櫓だけで、
    //   詰める兵の寝起きの場が無かった→砦の奥（羽柴の後詰の備〈-94,-30〉・篝・物見櫓・普請の人夫の道から外れた所）に陣小屋を三つ。兵は足さない
    try {
      for (const [x, z, r] of [[FORT.x - 13, -34, 0], [FORT.x - 7, -35, 0.08], [FORT.x + 12, -32, -0.06]]) jingoya(rt, x, z, 5, 3.6, r, { team: 0 });
    } catch (e) { /* 小屋が置けなくても戦は続ける */ }
    // 連れた兵（主人公の組）
    F.men = this.squad(rt, { x: RAKUDA.x + 2, z: RK.z1 + 12 }, 'toyotomi', '砦の加勢の足軽');
    F.menN0 = aliveN(F.men);
    rt.obj('main', STAGE_TEXT[1], 'main');
    if (rt.events) battleEventsStart(rt);
    rt.after(1.2, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n, cutDone = false) {
    const F = rt.flags;
    // 軍議や下知の予約が残っていても、討死後に次の段を始めない。
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const cuts = { 2: '四月初め　夜　二重堀の砦', 4: '四月四日　夕　楽田の本陣', 5: '四月六日　夕　中入りの支度', 7: '四月九日　夜明け　五条川の南東' };
    if (!cutDone && cuts[n]) {
      if (F.transitioning) return;
      F.transitioning = true; F.holdPlayer = true;
      blackCut(rt, () => {
        F.transitioning = false; F.holdPlayer = false;
        if (!F.ending && !rt.over) this.stage(rt, n, true);
      }, cuts[n]);
      return;
    }
    F.stage = n; F.st0 = rt.t;
    rt.obj('main', STAGE_TEXT[n], 'main');
    const K = this.ctx(rt);
    if (n === 1) Camp.startCamp(rt, K);
    else if (n === 2) {
      // 夜討ちは朝の光のまま始めない。時の変わり目で夜の照明を確定し、砦にも火を入れる。
      rt.world.dayClock = null;
      rt.world.setTime('night', true);
      for (const [x, z] of KAGARI) rt.world.addFire(x, z, { h: 1.3, size: 0.6, lightRadius: 10, smoke: false });
      for (const [x, z] of F.campFires || []) rt.world.addFire(x, z, { h: 1.3, size: 0.6, lightRadius: 10, smoke: false });
      F.campFiresLit = true;
      countFallen(rt);
      F.nightDead0 = F.fallen[1]; F.nightAllyDead0 = F.fallen[0];
      // 討死・敗北や次の段への移行後に、予約した夜討ちと知らせを続けない。
      const afterGate = (sec, run) => rt.after(sec, () => {
        if (F.stage === 2 && !F.ending && !F.transitioning && !rt.over && rt.player.u.alive) run();
      });
      afterGate(1, () => rt.say('日根野弘就', '徳川の先手が田を渡って寄せる。土橋の口を固めよ', 3.2));
      // 11/18 K306（戦の作法・一統記14巻）：寄せる前の言葉戦い。悪口で砦から誘い出そうとする
      for (const s of rt.kmSmoke || []) rt.world.removeSmokeColumn?.(s);
      rt.kmSmoke = null;
      //   11/18 k41：2.2・5.4秒では着陣の知らせ七つの後ろに並び字幕が25秒遅れた（描かずの通し）→待ち列が掃けた14・19秒へ
      afterGate(14, () => rt.say('徳川の足軽', '猿の砦に籠る腰抜けども！　悔しければ田へ出て参れ！', 2.8));
      afterGate(19, () => rt.say('稲葉一鉄', '悪口に乗るな。柵の内で待て。来る者だけを突け', 2.8));
      F.gateWaves = [];
      // 小牧山の麓から田を渡って寄せる組（柵越しの打ち合い。大軍は動かない）
      const send = (i) => { if (F.stage !== 2) return; const g = this.wave(rt, { x: GATE.x - 22 + (i % 3) * 22, z: 78 + (i % 2) * 8 }, 12, { x: GATE.x, z: GATE.z + 2 }, i === 3 ? '榊原康政の手' : '徳川勢'); if (g) { g.anchor = { x: GATE.x - 8 + (i % 3) * 8, z: GATE.z + 12 }; F.gateWaves.push(g); } };
      // 11/18 クラウド持ち主 act bot（161秒・3回に1回）：榊原の手が生まれた所の南 (-93,96)（家康の本陣の前）で十人重なり止まった。止まった寄せ手は行き先を消すと持ち場（生まれた所）へ戻って固まる→持ち場を木戸の前の田に置く
      afterGate(4, () => { send(1); rt.army.play('toki', { x: GATE.x, z: 70 }, 1.2); rt.say('物見', '小牧山から徳川の手！　田を渡って来る！', 2.6); });
      afterGate(30, () => send(0));
      afterGate(60, () => { send(2); rt.army.play('volley', { x: GATE.x - 30, z: 60 }, 1.0); });
      afterGate(95, () => { send(3); rt.say('物見', '榊原の旗！　「無」の字の旗が寄せて来る！', 2.8); });
      F.inside = 0;
      // 11/18 21:20 クラウド 小牧の持ち主（K281・描かずの通し）：九十秒に本人から30〜60m の本物の敵が1人（寄せ手は木戸の二十m 内に寄り、帯は空）。
      //   二の手の鉄砲組を夜討ちの初めから堀の前の田（木戸の南四十四 m）に篝と並べて控えさせる（段3 で放つ）。控える間は寄せず撃たず、全力の下知からも外す
      if (!live(F.guns)) F.guns = gunLine(rt, F);
      //   鉄砲組の脇に夜討ちの後詰の槍（先鋒＝寄せ手・二線＝鉄砲・後詰＝槍の層）。控える間は寄せない。段3 の初めに小牧山へ退く
      if (!live(F.gateRear)) {
        F.gateRear = enemyGroup(rt, { faction: 'tokugawa', name: '夜討ちの後詰', anchor: { x: FIELD.x - 14, z: FIELD.z + 4 }, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 10, formation: 'yari', morale: 85, dmgMult: 0.35,
          order: 'hold', seekRange: 0, aggro: 0 }, dressT([{ type: 'ashigaru', n: 19, o: { flagScale: 1 } }, { type: 'samurai', n: 5 }]));
        //   11/18 22:25 クラウド 小牧の持ち主（K281）：九十秒の30〜60m の本物の敵が31人で四十に届かない→後詰の槍を十五→二十四人に（控えたまま寄せない）
        F.gateRear.campGuard = true; F.gateRear.stay = true;
      }
      //   11/18 23:05 クラウド 小牧の持ち主（K281・描かずの通し）：九十秒の30〜60m の本物の敵が32人（鉄砲組13・後詰19）で四十に届かない→
      //   段3 で出る鉄砲の二の列を夜討ちの初めから田の奥（木戸の南五十二 m）に控えさせる（数は増やさず、出る時を早めるだけ。段3 の二十五秒で放つ）
      //   23:30 同：本人が木戸の内（木戸の北二 m）に立つと後詰（六十 m）と二の列（七十 m）が帯の外で26人の回→段2 の控えは木戸から五十〜五十五 m に寄せる（段3 で元の場へ）
      if (!live(F.guns2) && !live(F.guns2pre)) { F.guns2pre = guns2Line(rt); F.guns2pre.anchor = { x: FIELD.x + 10, z: FIELD.z + 8 }; F.guns2pre.campGuard = true; F.guns2pre.stay = true; F.guns2pre.seekRange = 0; F.guns2pre.aggro = 0; }
    } else if (n === 3) {
      countFallen(rt);
      F.gunDead0 = F.fallen[1];
      rt.say('日根野弘就', '堀の前に鉄砲を並べおった。打って出て追い払え', 2.8);
      // 段2から田に控えていた鉄砲組（gunLine）をここで放つ。続きから始めた時など、まだ無ければ作る
      if (!live(F.guns)) F.guns = gunLine(rt, F);
      F.guns.campGuard = false; F.guns.stay = false; F.guns.seekRange = 30; F.guns.aggro = 10; F.guns.order = 'hold'; F.guns.anchor = { ...FIELD };
      F.gunsN = aliveN(F.guns);
      if (!F.waves.includes(F.guns)) F.waves.push(F.guns);
      //   11/18 22:30 クラウド 小牧の持ち主（K281）：段3 の初めに後詰が退くと、二百秒の30〜60m の本物の敵が4〜22人に落ちた→後詰は田の奥に控えたまま、両列が退く時に一緒に退く
      if (live(F.gateRear)) { const g = F.gateRear; if (!F.waves.includes(g)) F.waves.push(g);
        //   11/18 23:05 同（K281）：田の奥と言っても田の真ん中から二十 m で、本人が田へ出ると三十 m の内に入り二百秒の帯が36人だった→後詰を田の南三十八 m へ下げて控える（二の列の後ろの層）
        g.anchor = { x: FIELD.x - 14, z: FIELD.z + 36 }; g.dest = { ...g.anchor }; }
      // 木戸をまたぐ横隊で出すと、後列が柵へ回り込んで重なる。砦の内から二列で土橋を渡り、田で横隊に開く。
      F.sortie = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の打って出る組', fullStrength: true, anchor: { x: GATE.x, z: GATE.z - 10 }, facing: 0, width: 6, formation: 'column', colW: 2, roadColumn: true, aggro: 12, seekRange: 45, speed: 4.2, order: 'path', noRout: true, dmgMult: 0.5 },
        fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 3 }], 'toyotomi'));
      F.sortie.path = [[GATE.x, GATE.z - 10], [GATE.x, 20], [FIELD.x, FIELD.z - 4]];
      // 土橋を抜けるまでは隊列を保つ。柵越しの敵へ散って後列を塞がせない。
      F.sortie.march = true; F.sortie.keepMoveOrder = true;
      F.sortie.onArrive = (q) => { q.path = null; q.march = false; q.keepMoveOrder = false; q.formation = 'line'; q.order = 'attack'; };
      rt.army.play('toki', { x: GATE.x, z: GATE.z + 4 }, 1.2);
    } else if (n === 4) {
      for (const g of [F.guns, F.guns2]) if (live(g)) { g.order = 'retreat'; g.dest = { x: FIELD.x, z: ZS + 20 }; }
      // 待機を解いた新手は共通の reserveFold では帰らない。小競り合いの
      // 終了でこの組も下げる。軍議へ向かう味方を柵越しに追って固まらせない。
      for (const g of rt.army.groups) {
        if (g.team !== 1 || g.honjin || !(g.isReserve || g._rsv) || !live(g)) continue;
        g.noAI = true; g.stay = false; g.focus = null; g.commanderPush = null;
        g.aggro = 0; g.seekRange = 0;
        const c = g.center();
        if (c.z < GATE.z && c.z > GATE.z - 34 && Math.abs(c.x - GATE.x) < 34) {
          g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true;
          g.dest = null; g.path = [[GATE.x, GATE.z - 18], [GATE.x, 22]]; g.pathIdx = 0;
          g.onArrive = (q) => { q.path = null; q.order = 'retreat'; q.dest = { x: GATE.x, z: ZS + 20 }; };
        } else {
          g.order = 'retreat'; g.path = null; g.dest = { x: c.x, z: ZS + 20 };
        }
        for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
        if (!F.waves.includes(g)) F.waves.push(g);
      }
      // 退路を出した組を共通側で再び敗走に替えない。木戸を通る下知を保つ。
      if (F._dr) F._dr.E.length = 0;
      // 11/16 iMac act bot：味方の新手は共通の畳みに入らず、攻めの号令のまま退く敵を追って (-86,100) で九人が一点に重なり止まった（321秒）・
      //   11/17 クラウド act bot：見えない壁の外 (-38,128) で持ち場についた組が壁へ八 m 押し戻された（253秒・23回）→壁の際の組も消す
//   11/17 クラウド：北の壁の際 (151,-126) の蒲生の備も壁へ押し戻され一点に重なった（408秒）→北と東西の際も消す
//   持ち場へ六 m 飛んだ（289秒）。小競り合いの終わりで、本人から遠い組は消し、近い組はその場で横に並んで柵を守る
      const me = rt.player?.u;
      for (const g of rt.army.groups) {
        if (g.team !== 0 || !(g.isReserve || g._rsv) || !live(g)) continue;
        const c = g.center();
        if (!me || c.z > ZS - 14 || c.z < ZN + 14 || Math.abs(c.x) > XW - 14 || Math.hypot(c.x - me.pos.x, c.z - me.pos.z) > 35 || Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) < 24) { for (const u of [...g.units]) if (u.alive && !u.gone) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } } continue; }
        g.order = 'hold'; g.stay = true; g.noAI = true; g.focus = null; g.formation = 'line'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.path = null;
        g.aggro = 4; g.seekRange = 6;
        for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
      }
      if (live(F.sortie)) {
        // 田から横陣のまま斜めに戻すと、端の兵が堀と柵に掛かる。二列で土橋の正面から木戸へ戻す。
        F.sortie.order = 'path'; F.sortie.formation = 'column'; F.sortie.colW = 2;
        F.sortie.march = true; F.sortie.keepMoveOrder = true; F.sortie.commanderPush = null;
        for (const u of F.sortie.units) { u.target = null; u.watch = null; u.moveTo = null; }
        F.sortie.dest = null; F.sortie.path = [[GATE.x, 20], [GATE.x, GATE.z - 8]]; F.sortie.pathIdx = 0;
        F.sortie.onArrive = (q) => { q.path = null; q.march = false; q.keepMoveOrder = false; q.order = 'hold'; q.stay = true; q.facing = 0; };
      }
      rt.award((t) => t.side.push('堀の前の鉄砲組を追い払った'), '堀の前の鉄砲組を追い払った');
      Council.startCouncil(rt, K);
    } else if (n === 5) Council.startOrders(rt, K);
    else if (n === 6) {
      countFallen(rt);
      F.departAllyDead0 = F.fallen[0];
      Night.startNight(rt, K);
    }
    else if (n === 7) Night.startDawn(rt, K);
  },

  // 主人公の連れた組（砦では羽柴の旗の下に付く）
  squad(rt, at, flag, name = '加勢の足軽') {
    const g = allyGroup(rt, { name, fullStrength: true, anchor: { ...at }, facing: 0, width: 5, aggro: 10, speed: 3.9, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }], flag));
    // 追従の下知はこの戦が出す。自動判断が「移動」を「攻撃」に戻すと、敵のいない陣の間で足が止まる。
    g.noAI = true;
    g.defMult = 2;
    return g;
  },
  // 徳川勢の一組。to へ寄せ、focus があればその者を狙う
  wave(rt, at, n, to, name = '徳川勢', focus) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 6, formation: 'line', morale: 85, dmgMult: 0.36,
      order: 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n, kitOf(name)));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },

  update(rt, dt) {
    const F = rt.flags;
    countFallen(rt);
    // 11/22 クラウド 小牧の持ち主（K564 落ちない）：記憶4GB の携帯（?mem=4・MEM_BUDGET.real 205）の描かずの数えで本物の兵が 30〜330秒ずっと予算越え
    //   （最多280・90秒）。長久手（b_t03b_nagakute.js）・伊賀と同じ手で、三秒ごとに本人とカメラから離れて持ち場で待つ・斬り合っていない組の名の無い徒を
    //   味方（六十m 外）→敵（八十m 外）→百m 外へ逃げ去った組の順に外す。名のある将・旗・馬・本人の組・前線は残す。記憶の多い端末とパソコンは今まで通り
    if (TOUCH && MEM_BUDGET.real && rt.player?.u && (F._kmCapT = (F._kmCapT || 0) - dt) <= 0) {
      F._kmCapT = 3;
      let over = 0; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
      over -= MEM_BUDGET.real;
      if (over > 0) {
        const me = rt.player.u.pos, cam = rt.camera?.position, pt = rt.player.u.team;
        const plain = (u) => !u.name && !u.isPlayer && !u.isSub && !u.invuln && !u.mustLive && !u.mounted && !u.stdHeld && !u.isStandard && !u.keep && u.type !== 'busho';
        for (const [ally, R] of [[true, 60], [false, 80]]) {
          if (over <= 0) break;
          const far = (p) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
          const gs = [];
          for (const g of rt.army.groups) {
            if (g.isPlayerSquad || g.routed || g.order !== 'hold' || !g.units || (g.team === pt) !== ally) continue;
            const us = g.units.filter((u) => u.alive && !u.gone);
            const keep = ally ? 3 : 5;
            if (us.length <= keep || us.some((u) => u.atk || u.fleeing || u.isPlayer || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30) || !far(u.pos))) continue;
            let cx = 0, cz = 0; for (const u of us) { cx += u.pos.x; cz += u.pos.z; }
            gs.push({ us, keep, d: Math.hypot(cx / us.length - me.x, cz / us.length - me.z) });
          }
          gs.sort((a, b) => b.d - a.d);
          for (const { us, keep } of gs) {
            if (over <= 0) break;
            const cut = us.filter(plain).reverse();
            for (let k = 0; k < cut.length && over > 0 && us.length - k > keep; k++) { try { rt.army.despawn(cut[k]); over--; } catch (e) { /* そのまま */ } }
          }
        }
        for (const g of rt.army.groups) {
          if (over <= 0) break;
          if (g.isPlayerSquad || !g.units || !(g.routed || g.order === 'flee')) continue;
          for (const u of g.units) {
            if (over <= 0) break;
            if (!u.alive || u.gone || !plain(u) || Math.hypot(u.pos.x - me.x, u.pos.z - me.z) <= 100 || (cam && Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) <= 100)) continue;
            try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ }
          }
        }
      }
    }
    headGroupTick(rt, dt, { names: ['榊原の組頭', '井伊の組頭', '酒井の組頭'], faction: 'tokugawa', look: { flag: 'tokugawa' }, active: (r) => r.flags.stage >= 2 && r.flags.stage <= 3 });   // 11/21 cloud-06：本人の前に討てる組頭の小組（head_group.js）
    // 11/19 01:10 クラウド 小牧の持ち主 ⑥③（九十秒の写真：木戸の内で日根野・稲葉の馬二騎が木戸の口と土橋の上 (-70.6,-0.7) に立ち、
    //   寄せ手が馬の尻に隠れて一人も見えない）：守将は木戸の十一 m 後ろの左右で下知する。口の五 m 内へ出れば引き戻す（間近の敵は払える）
    if ((F.stage === 2 || F.stage === 3) && F.fort) for (const u of F.fort.units) {
      if (!u.alive || u.type !== 'busho' || u.pos.z < GATE.z - 5 || Math.abs(u.pos.x - GATE.x) > 14) continue;
      if (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 2.4) continue;
      u.target = null; u.atk = null;
      u.moveTo = { x: GATE.x + (u.name === '稲葉一鉄' ? 9 : -9), z: GATE.z - 11 };
    }
    // 小牧山へ退く組は南の境で去る。壁へ押し戻すと、退却先へ届かず田に残り続ける
    for (const g of F.waves) {
      // 11/17 クラウド act bot：本陣 (-100,94) へ退いた新手が着いて十二人で重なり止まった（306秒）→本陣に着いた退く兵も去る
      // 組頭を失って崩れた組は、共通処理が退却の下知を「敗走」に替える。敗走も南の境で去らせる。
      // 11/18 08時 クラウド持ち主 act bot（201秒）：退く榊原の手が本陣の手前 (-84,98) で七人重なり止まった（本陣の陣幕と旗本の前で詰まる）→本陣の十八 m 内で去らせる
      if (g.order !== 'retreat' && g.order !== 'flee') continue;
      for (const u of g.units) if (u.alive && !u.gone && (u.pos.z >= ZS - 2 || (u.pos.x < -XW + 4 && g.dest?.x < -60) || Math.hypot(u.pos.x - HONJIN.x, u.pos.z - HONJIN.z) < 18)) rt.army.despawn(u);
    }
    // 11/17 クラウド レ三 act bot：敵の鉄砲の新手が西の壁の外 (-165,45) に出て壁へ七 m 押し戻された（214秒）→壁の外の敵の兵は去らせる
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.honjin || !live(g)) continue;
      for (const u of g.units) if (u.alive && !u.gone && Math.abs(u.pos.x) > XW + 1) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    }
    // 11/17 クラウド レ三 act bot：敵の退く足軽が (6,59) で味方に挟まれ二十秒動かなかった（304秒）→退く敵が十五秒一歩も動かなければ去らせる
    F._rtStk = F._rtStk || new Map();
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.honjin || (g.order !== 'retreat' && g.order !== 'flee')) continue;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        const m = F._rtStk.get(u);
        if (!m || Math.hypot(u.pos.x - m.x, u.pos.z - m.z) > 1) { F._rtStk.set(u, { x: u.pos.x, z: u.pos.z, t: 0 }); continue; }
        m.t += dt;
        if (m.t > 15) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } F._rtStk.delete(u); }
      }
    }
    // 11/17 クラウド act bot：後から来る味方の備（蒲生の備）が北の壁の外 (151,-127) に置かれ、壁へ押し戻され一点に重なった（430秒）。壁の外の味方の新手は去らせる
    // 11/18 クラウド（act bot 232・375秒）：味方の新手が退く敵を追って持ち場（anchor）を壁の際 (-35,128) に取り、壁へ八 m 押し戻された。
    //   味方の持ち場と行き先は壁の六 m 内へ収める（兵が壁の外の持ち場へ並びに行かない）
    const cl = (p) => (!p || (p.z <= ZS - 6 && p.z >= ZN + 6 && Math.abs(p.x) <= XW - 6)) ? p : { ...p, x: Math.max(-XW + 6, Math.min(XW - 6, p.x)), z: Math.max(ZN + 6, Math.min(ZS - 6, p.z)) };
    for (const g of rt.army.groups) {
      if (g.team !== 0 || g.honjin || g.order === 'retreat' || g.order === 'flee' || g.units?.some((u) => u.isPlayer)) continue;
      g.anchor = cl(g.anchor); g.dest = cl(g.dest);
    }
    for (const g of rt.army.groups) {
      if (g.team !== 0 || g.honjin || g.units?.some((u) => u.isPlayer) || !live(g)) continue;   // 置き場の備（_far）も
      const c = g.center();
      if (c.z < ZN + 2 || Math.abs(c.x) > XW - 2) for (const u of [...g.units]) if (u.alive && !u.gone) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
      // 11/18 クラウド act bot（268秒）：退く敵を追った味方の新手が南の壁の外 (-90,127) に出て、壁へ八 m 押し戻された（9回）。南の壁を越えた味方は一人ずつ去らせる
      // 11/21 クラウド小牧（K564 掃除の跳ね）：despawn は g.units を縮めない（印を付けるだけ）ので、毎コマ全部の隊の写し [...g.units] を作らずそのまま回す
      else for (const u of g.units) if (u.alive && !u.gone && u.pos.z > ZS + 1) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    }
    // 同じく 361秒：攻めの号令の徳川の備（榊原康政の備）の兵が南の壁の外 (-95,135) から壁へ十五 m 押し戻された。壁の外で攻めに出た敵の兵も去らせる（本陣と持ち場の備は残す）
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.honjin || g.order !== 'attack' || !live(g)) continue;
      for (const u of g.units) if (u.alive && !u.gone && u.pos.z > ZS + 1) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    }
    // 11/18 クラウド act bot：軍議の段（341〜501秒）に、田の端 (-93,50) で味方の新手の残り一、二人が攻めの号令のまま百六十秒立ち尽くした。
    //   田の戦の後は、本人から四十 m より遠く十二秒動かない三人以下の味方の組を去らせる
    const me0 = rt.player?.u;
    if (F.stage >= 4 && me0) for (const g of rt.army.groups) {
      if (g.team !== 0 || g.honjin || g.order !== 'attack' || g === F.sortie || g.units?.some((u) => u.isPlayer) || !live(g) || aliveN(g) > 3) continue;
      const c = g.center(), L = g._still0;
      if (!L || Math.hypot(c.x - L.x, c.z - L.z) > 2) { g._still0 = { x: c.x, z: c.z, t: rt.t || 0 }; continue; }
      if ((rt.t || 0) - L.t < 12 || Math.hypot(c.x - me0.pos.x, c.z - me0.pos.z) < 40) continue;
      for (const u of [...g.units]) if (u.alive && !u.gone) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    }
    // 11/17 クラウド act bot：榊原の手が寄せ場 (-93,96) で攻めの号令のまま二十秒重なって立った（161秒）→十秒動かない寄せ手は主人公へ向ける
    for (const g of [...(F.waves || []), ...(F.gateWaves || [])]) {   // 木戸へ寄せる手（榊原の手 191秒の重なり）も
      if (g.team !== 1 || g.order !== 'attack' || !live(g) || !rt.player?.u?.alive) continue;
      const c = g.center(), L = g._still;
      if (!L || Math.hypot(c.x - L.x, c.z - L.z) > 2) { g._still = { x: c.x, z: c.z, t: rt.t || 0 }; continue; }
      // 11/18 クラウド持ち主 act bot（161秒・6回に2回）：榊原の手が家康の本陣の前 (-94,96) で十人重なり止まった（行き先は本陣の脇2m）。本陣の十四 m 内で止まった寄せ手は陣へ帰ったとみなし去らせる
      if ((rt.t || 0) - L.t > 6 && Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) < 14) { for (const u of [...g.units]) if (u.alive && !u.gone) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } } g._still = null; continue; }
      if ((rt.t || 0) - L.t > 6) { g.focus = rt.player.u; g.dest = null; g.seekRange = 80; g._still = null; }
    }
    // 11/18 クラウドシ五（act bot 241秒）：段の切り替わり中は壁が効かず、味方の新手が壁の外 z=127 へ流れ、戻った時に 7m 飛んだ→壁は早戻りの前に毎コマ効かせる
    walls(rt, XW, ZN, ZS, true);
    // 討死直後も戦場は動くが、本人の任務・知らせ・増援は先へ進めない。
    if (F.ending || rt.over || !rt.player.u.alive || !F.stage || F.transitioning) return;
    const P = rt.player.u;
    // 11/21 クラウド 小牧の持ち主（K564 重さ）：壁は上で毎コマ一度効かせてあるので、同じコマの二度目（全兵を二度なめる）は外した
    // 連れた兵は主人公の脇に付く
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      followMen(rt);
    }
    // 目標は木戸の守りと鉄砲組の排除。配下の討死は損害として残し、
    // 目標に無い「組の生存人数」で、戦える本人まで敗北にしない（十一1）。
    const el = rt.t - F.st0, K = this.ctx(rt);
    if (F.stage === 1) Camp.tickCamp(rt, K);
    else if (F.stage === 2) {
      // 田に控える鉄砲組へ本人か味方が十六 m 内に寄れば、控えを解いて応じさせる（棒立ちで討たれない）
      if (F.guns?.campGuard && live(F.guns)) {
        const c = F.guns.center();
        //   （砦の兵が寄せ手を追って田へ出ても、それでは解かない：解くと砦の兵と撃ち合って四十七秒で崩れ、九十秒の帯が空いた）
        //   組の兵が寄せ手を追って田へ出ただけでも解かない（九十秒に組が十六 m 内へ寄り、控えが解けて帯が空いた）。解くのは本人だけ
        const mine = (u) => u.isPlayer;
        const w = rt.army.units.find((u) => u.alive && !u.gone && u.team === 0 && !u.fleeing && mine(u) && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 16);
        if (w) { for (const g of [F.guns, F.gateRear]) if (g) { g.campGuard = false; g.stay = false; g.seekRange = 30; g.aggro = 10; } F.guns.seekRange = 30; F.guns.aggro = 10; F.guns.anchor = { ...FIELD }; }
      }
      // 抵抗を続ける敵八人が砦の中（木戸より北）に居座れば木戸を破られる。
      // 押し返して退く兵や、戦を離れた負傷兵では敗北にしない。
      let inside = 0;
      for (const g of F.gateWaves) {
        if (!resistingN(g)) continue;
        // 北の背面を抜けて追う兵は砦を占めていない。楽田への道まで侵入扱いにしない。
        for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && u.pos.z < GATE.z - 3 && u.pos.z > GATE.z - 30 && Math.abs(u.pos.x - GATE.x) < 34) inside++;
      }
      F.inT = inside >= 8 ? (F.inT || 0) + dt : 0;   // 八人が十秒、砦の中に居座れば破られた（主人公を追って一瞬入るだけでは負けにしない）
      if (F.inT > 10) return this.lose(rt, '木戸を破られた');
      if (!F.inabaSaid) for (const g of F.gateWaves) {
        if (!resistingN(g)) continue;
        for (const u of g.units) if (!F.inabaSaid && u.alive && !u.gone && !u.fleeing && !u.woundOut && dist(u.pos, GATE) < 12) {
          F.inabaSaid = true; rt.say('稲葉一鉄', 'うろたえるな！　土橋は狭い。渡る者から一人ずつ突け', 3);
        }
      }
      // 11/15 K338（天王寺・岡山の押し寄せ方）：本人の六十 m の内の敵が薄い間は、小牧山の麓から新手を土橋へ続けて寄せる（四組まで・百十秒まで）
      if (el > 12 && el < 90 && (F.gfT = (F.gfT || 0) - dt) <= 0) {
        F.gfT = 8;
        let eN = 0;
        for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && !u.fleeing && !u.group?.honjin && dist(u.pos, P.pos) < 60) eN++;
        if (eN < 18 && (F.gfN || 0) < 4) {
          const i = F.gfN = (F.gfN || 0) + 1;
          const g = this.wave(rt, { x: GATE.x - 30 + (i % 3) * 30, z: 84 }, 12, { x: GATE.x, z: GATE.z + 2 }, i === 2 ? '奥平信昌の手' : '徳川勢の新手');
          if (g) { F.gateWaves.push(g); rt.army.play('toki', { x: GATE.x, z: 70 }, 0.9); }
        }
      }
      const atGate = dist(P.pos, GATE) < 18;
      if (atGate) F.gateHeldT = (F.gateHeldT || 0) + dt;
      const left = F.gateWaves.reduce((s, g) => s + resistingN(g), 0);
      // 木戸を守った後に追手へ押し出されても、夜討ちの刻限は延びない。
      // 本人が守りに来なかった場合は、時刻だけで敵を退かせない。
      // 11/18 クラウド持ち主：一戦が615秒（7分を越える）→木戸の守りを百二十五→百秒・百六十→百三十秒で引かせる
      if (!F.gateWithdrawn && el > 100 &&
          ((atGate && F.gateWaves.length >= 4 && left <= 4) ||
           (el > 130 && (atGate || F.gateHeldT >= 40)) ||
           // 11/18 20:20 クラウド 小牧の持ち主：act bot が木戸の外（十八 m より先）で斬り合い続け、守った秒が四十に届かず段2が232秒・討ち取り45に延びた（3回に1回）。
           //   百六十秒を過ぎて本人が木戸の四十五 m 内で戦っていれば引かせる（守りに来なかった時は今までどおり引かせない）
           (el > 160 && dist(P.pos, GATE) < 45))) {
        F.gateWithdrawn = true; F.gateWdT = el;
        for (const g of F.gateWaves) withdrawGateWave(g);
        rt.say('物見', '徳川勢、小牧山へ引いていく', 2.4);
      }
      // 退く敵を追い切る必要はない。木戸へ戻って守備を終えてから出撃する。
      // 11/18 20:25 クラウド 小牧の持ち主：引いた徳川勢を本人が田の方まで追い討ち続け、木戸へ戻らず段2が222秒・討ち取り59に延びた（act bot 4回に1回）。
      //   引かせて十五秒たてば、木戸の六十 m 内にいる本人はそのまま田の段へ（田は木戸の南四十 m で、追った先がそのまま次の行き先）
      if (F.gateWithdrawn && (atGate || (el - (F.gateWdT || el) > 15 && dist(P.pos, GATE) < 60))) {
        rt.award((t) => t.side.push('二重堀の木戸を守った'), '二重堀の木戸を守った');
        this.stage(rt, 3);
      }
    } else if (F.stage === 3) {
      // 六秒ごとに射撃の機会をそろえる。発射・射線の確認・弾込めは共通の構えの処理へ渡す。
      if ((F.volT = (F.volT ?? 2) - dt) <= 0) {
        F.volT = 6;
        const tg = [P, ...(F.sortie?.units || [])].filter((u) => u.alive && !u.gone && !u.woundOut && !u.noTarget);
        let shot = 0;
        for (const g of [F.guns, F.guns2]) {
          if (!resistingN(g)) continue;
          for (const u of g.units) {
            if (u.type !== 'gun' || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget || u.sidearm || u.atk || u.swing || u.reload || u.cd > 0 || u.stagger > 0) continue;
            // 戦列を離れた者や槍の間合いの者に射撃を塞がれず、筒で狙える相手を選ぶ。
            let t = null, nearest = 55;
            for (const q of tg) {
              const d = dist(q.pos, u.pos);
              if (d >= 4 && d <= nearest) { t = q; nearest = d; }
            }
            if (!t) continue;
            u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
            u.atk = { t: 1.2, dur: 1.2, target: t, ranged: true };
            if (t.isPlayer) u.shotWarnUntil = Math.max(u.shotWarnUntil || 0, rt.army.time + 1.2);
            shot++;
          }
        }
        if (shot && !F.volSaid) { F.volSaid = true; rt.say('物見', '鉄砲が来るぞ！　田の畦に身を低く', 2.4); }
      }
      //   二十五秒で田の奥から鉄砲の二の列が出て、前の列の退きを助ける（撃ち合いの山）
      if (!F.guns2 && el > 25) {
        //   段2 から控えていた二の列があれば、それを放つ（無ければ今作る）
        const pre = live(F.guns2pre) ? F.guns2pre : null; F.guns2pre = null;
        F.guns2 = pre || guns2Line(rt);
        F.guns2.campGuard = false; F.guns2.stay = false; F.guns2.order = 'hold'; F.guns2.anchor = { x: FIELD.x + 14, z: FIELD.z + 22 }; F.guns2.seekRange = 28; F.guns2.aggro = 10;
        F.waves.push(F.guns2);
        F.guns2N = aliveN(F.guns2);
        rt.say('物見', '奥にもう一列！　鉄砲が並び直したぞ', 2.6);
      }
      // 11/19 k365-cloud-41（描かずの通し：二の列が出てから段の終わりまで三十六秒無言）：小牧山の構えを一言（睨み合いの戦）
      if (F.guns2 && !F.yamaSaid && el > 48) { F.yamaSaid = true; rt.say('足軽', '小牧山の上は土塁と堀が幾重にも……徳川は山から下りて来ぬ気じゃ', 3.4); }
      // 討ち減らされた列は実際に小牧山へ退く。達成まで残兵を田で戦わせ続けない。
      retreatGunLine(F.guns, F.gunsN);
      retreatGunLine(F.guns2, F.guns2N);
      // 田へ出て両列と交戦した後は、小競り合いを際限なく続けない。
      // 各列を四分の一崩せば三分で退く。損耗が片方に偏った場合も、両列全体の
      // 四分の一を崩して田で一分押せば三分半で退く。健在な両列を時間だけで退かせない。
      if (dist(P.pos, FIELD) < 36) F.fieldPress = (F.fieldPress || 0) + dt;
      // 追従や回り込みで田から離れた鉄砲兵を、地図の端まで探させない。
      // 二列が出揃って段が四分続いた後、本人が田の中心を三十秒確保した時だけ退かせる。
      // 田を守る兵が残る間や、主人公が田を離れた時は確保を数え直す。
      if (F.guns2 && el > 210) {
        let fieldHeld = dist(P.pos, FIELD) < 18;
        for (const g of [F.guns, F.guns2]) {
          if (!fieldHeld || !resistingN(g)) continue;
          for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && dist(u.pos, FIELD) < 36) { fieldHeld = false; break; }
        }
        F.fieldClearT = fieldHeld ? (F.fieldClearT || 0) + dt : 0;
      }
      // 11/18 22:10 クラウド 小牧の持ち主：前の列が退いた後、二の列（退きを助ける列）が田の南で八人中六〜七人のまま七十秒粘り、段3 が127秒に延びた（act bot）。
      //   前の列が退き、二の列も四分の一を討たれ、田で四十五秒押していれば、段の七十五秒から二の列も退く（前の列の退きを助け終えた）
      if (F.guns2 && F.fieldPress >= 45 && ((el > 180 &&
          ((resistingN(F.guns) <= F.gunsN * 0.75 && resistingN(F.guns2) <= F.guns2N * 0.75))) ||
           (el > 75 && drivenOffGroup(F.guns, F.gunsN) && resistingN(F.guns2) <= F.guns2N * 0.75) ||
           (el > 210 && F.fieldPress >= 60 &&
            resistingN(F.guns) + resistingN(F.guns2) <= (F.gunsN + F.guns2N) * 0.75) ||
           (el > 240 && F.fieldPress >= 90 && F.fieldClearT >= 30))) {
        for (const g of [F.guns, F.guns2]) if (live(g) && g.order !== 'retreat' && g.order !== 'flee') {
          g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 };
          g.aggro = 0; g.seekRange = 0;
        }
      }
      // 前の列だけ崩しても、健在な二の列を残して達成にはしない。
      const drivenOff = F.guns2 && drivenOffGroup(F.guns, F.gunsN) && drivenOffGroup(F.guns2, F.guns2N);
      // 木戸の内で待つだけでは「田へ出る」を果たさない。主人公も鉄砲組のいた田まで進む。
      // 11/18 22:00 クラウド 小牧の持ち主：両列が退いた後も、本人が田の南三十〜四十 m で新手と斬り合い続け、段3 が三十秒余り延びた（272→303秒）。
      //   両列が退いて八秒たてば、田の四十五 m 内にいる本人はそのまま軍議の段へ（追った先も田の続き）
      if (drivenOff) F.offT ??= el;
      if (drivenOff && live(F.gateRear) && F.gateRear.order !== 'retreat' && F.gateRear.order !== 'flee') {
        const g = F.gateRear; g.stay = false; g.campGuard = false; g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 }; g.aggro = 0; g.seekRange = 0;
      }
      if (el > 60 && drivenOff && (dist(P.pos, FIELD) < 18 || (el - F.offT > 8 && dist(P.pos, FIELD) < 45))) this.stage(rt, 4);
    } else if (F.stage === 4) Council.tickCouncil(rt, K);
    else if (F.stage === 5) Council.tickOrders(rt, K);
    else if (F.stage === 6) Night.tickNight(rt, K, dt);
    else if (F.stage === 7) Night.tickDawn(rt, K);
    huntPlayer(rt, F, dt);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.failWhy = why;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.ending = true; F.won = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.award((t) => { t.main = true; }, '中入りの列と五条川を越えた');
    rt.finish({ scriptedEnd: true }, 6);
  },

  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage || F.ending) return;
    const ok = (o) => !o.fleeing && !o.woundOut && !o.group?.routed && o.group?.order !== 'retreat' && o.group?.order !== 'flee' && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = [1, 4, 5, 7].includes(F.stage) ? null : b.army.nearestEnemy(u, 10, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = b.def.missionPin(b) || FIELD;
    if (F.stage === 2) t = { x: GATE.x, z: GATE.z - 2 };   // 木戸の内（柵の陰）に立つ
    else if (F.stage === 3) {
      // 前列が崩れたら二の列へ。退く前列を追い続けて田の中央で止まらない。
      const g = !drivenOffGroup(F.guns, F.gunsN) ? F.guns : !drivenOffGroup(F.guns2, F.guns2N) ? F.guns2 : null;
      if (g) t = g.center();
    } else if (F.stage === 6) {
      // 渡しで待ち続けず、健在な物見と伏せ鉄砲を実際に払いに行く。
      const g = [F.tScout, F.tAmb].find((q) => resistingN(q) > 1);
      if (g) t = g.center();
    }
    // 楽田城の中から外へは大手門を通る
    if (u.pos.z < RK.z1 + 2 && u.pos.x > RK.x0 - 2 && u.pos.x < RK.x1 + 2 && t.z > RK.z1 + 4) t = { x: RAKUDA.x, z: RK.z1 + 6 };
    if (t.z < RK.z1 - 2 && t.x > RK.x0 && t.x < RK.x1 && !(u.pos.z < RK.z1 && u.pos.x > RK.x0 && u.pos.x < RK.x1) && Math.abs(u.pos.x - RAKUDA.x) > 3) t = { x: RAKUDA.x, z: RK.z1 + 6 };
    goTo(p, inp, t.x, t.z, 2);
  },
};
t03_komaki.sides = { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '徳川・織田信雄勢', mon: 'tokugawa' } };
// 両軍の人数：羽黒は森 三千 対 徳川 五千（退く間に三百ほどを失う）。二重堀は守る日根野の二千ほど対 夜討ちの手
//   （夜討ちの数は伝わらない。千五百は小競り合いの規模からの見積もり。引いた後は千ほど）
function countFallen(rt) {
  const F = rt.flags;
  if (!F.countedFallen) { F.countedFallen = new WeakSet(); F.fallen = [0, 0]; }
  for (const u of rt.army.units) {
    if (u.alive || !(u.hp <= 0) || u.isStruct || u.isPlayer || (u.team !== 0 && u.team !== 1) || F.countedFallen.has(u)) continue;
    F.countedFallen.add(u); F.fallen[u.team]++;
  }
}
// 両軍の人数：布陣図に合わせ、楽田の羽柴方およそ七万・小牧山の徳川・信雄方およそ三万。本物の一人を二十人に見立てて討死を引く。
//   ⑥からは中入りの二万（池田・森・堀・秀次）とそれを追う徳川の数
t03_komaki.force = (rt) => {
  if (!rt?.flags || !rt.army) return { a: 70000, a0: 70000, b: 30000, b0: 30000, casualtiesCounted: true };
  const F = rt.flags;
  countFallen(rt);
  const [allyDead, dead] = F.fallen;
  // 砦を守った手の討死を、新たに出る中入りの二万から重ねて引かない。
  if ((F.stage || 0) >= 6) return { a: Math.max(0, 20000 - (allyDead - (F.departAllyDead0 || 0)) * 20), a0: 20000, b: Math.max(0, 30000 - dead * 20), b0: 30000, casualtiesCounted: true };
  return { a: Math.max(0, 70000 - allyDead * 20), a0: 70000, b: Math.max(0, 30000 - dead * 20), b0: 30000, casualtiesCounted: true };
};
t03_komaki.date = (rt) => {
  const s = rt?.flags?.stage || 0;
  return s >= 7 ? '天正十二年四月九日　夜明け' : s >= 6 ? '天正十二年四月六日　夜' : s >= 5 ? '天正十二年四月六日　夕' : s >= 4 ? '天正十二年四月四日　夕' : s >= 2 ? '天正十二年四月初め　夜' : '天正十二年四月初め';
};
// 11/18 クラウド持ち主（act bot 590・546秒 達成・討ち取り69と70・受けた傷 0・「ちょっと簡単すぎる。もっと強い奴と斬り合いたい」）：
//   田（段3）・五条川の渡し（段6）・夜明けの道（段7）で、本人から二十歩内に来た敵の組を一つだけ本人へ向ける（根白坂・木津川口の huntPlayer と同じ形）。
//   木戸の段（2）は向けない（柵の内へ寄せると「木戸を破られる」の数に入る）。敵の数・強さは変えない。本人の命が六割半を切ったら・組が崩れたら放す。
// 堀の前の田の徳川の鉄砲組（段2は控え・段3で放つ）。夜に溶けないよう列の後ろに篝を三つ
function gunLine(rt, F) {
  //   控えの間は田の奥（木戸の南五十四 m）。砦の兵が寄せ手を追って出る所（木戸の南二十五 m まで）から離す
  const g = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の鉄砲組', anchor: { x: FIELD.x, z: FIELD.z + 10 }, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 10, formation: 'line', morale: 90, dmgMult: 0.35,
    order: 'hold', seekRange: 0, aggro: 0, noRout: false },
  dressT([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'samurai', n: 2 }]));
  g.campGuard = true; g.stay = true;   // stay：本人が寄せ手と斬り合う時の「迎えに出る」（ally_charge.js）からも外す
  // 11/18 クラウド見回り：200秒の写真で田の鉄砲組が夜に溶けて見えない。火縄の火を移す篝を列の後ろに三つ置き、横隊の影を浮かせる
  if (!F.fieldFires) { F.fieldFires = true; for (const dx of [-9, 0, 9]) rt.world.addFire(FIELD.x + dx, FIELD.z + 7, { h: 1.3, size: 1.0, lightRadius: 18, smoke: false }); }
  //   11/18 23:15 クラウド 小牧の持ち主（⑥ 九十秒の写真）：木戸から南の田を見ても、五十 m 先の鉄砲組と篝が闇に溶けて一つも見えない→篝の火を大きく・照り返しを広く（数は同じ）
  return g;
}
// 鉄砲の二の列（段3 の二十五秒で前の列の退きを助ける。段2 からは田の奥に控える）
function guns2Line(rt) {
  return enemyGroup(rt, { faction: 'tokugawa', name: '徳川の鉄砲の二の列', anchor: { x: FIELD.x + 14, z: FIELD.z + 22 }, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 8, formation: 'line', morale: 85, dmgMult: 0.32, order: 'hold', seekRange: 28, aggro: 10 },
    dressT([{ type: 'gun', n: 7 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }]));
}
function huntPlayer(rt, F, dt) {
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player?.u, di = F.stage;
  const on = !!P?.alive && !F.ending && !F.transitioning && (di === 3 || di === 6 || di === 7) && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack' || g.honjin) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween?.(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; cur.dmgMultPlayer = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  // 11/18 06時 クラウド持ち主：向けても act bot 2戦（453・478秒・討ち取り47・58）で受けた傷0。向けた組の刃は本人へだけ素の強さ（1倍）にする（味方の兵へは0.35〜0.4のまま）
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; g.dmgMultPlayer = 1; F._hunter = g; return; }
}

t03_komaki.history = '天正十二年（1584）、織田信雄は徳川家康と組んで羽柴秀吉と手を切った。秀吉方に付いた池田恒興が犬山城を落とすと、家康は小牧山を押さえて堀と土塁で固めさせた。三月十七日の夜明け、小牧山を狙って羽黒に陣を張った森長可は、奥平信昌・榊原康政の先手に前から、回り込んだ酒井忠次の手に横から襲われ、三百ほどを失って犬山へ退いた（羽黒の戦い・徳川方およそ五千）。退く時、母衣衆の野呂助左衛門父子が引き返して討死した。三月の末、秀吉は楽田に本陣を置き、二重堀などの砦を並べて小牧山の家康・信雄とにらみ合った。どちらも砦から出ず、最前線の二重堀の砦（守将 日根野弘就）への夜討ちのような小競り合いが続いた。膠着を破ろうと、池田恒興は家康の留守の三河を突く中入りを言い出す。羽黒と二重堀の間隔は縮めた復元で、主人公の組の動きは遊びのための筋書き。';
t03_komaki.famous = [];
// bot：森長可と退く段は、打ち込みを受けても歩みを止めない
t03_komaki.botGuardFlee = (b) => false;
// 11/21 22:00 クラウド 小牧の持ち主（K582・K564）：章の通し（位3 足軽大将・--mobile）で段2 二重堀の木戸の守りに馬上で出て、徳川勢に囲まれ103・120秒で倒れた（2回とも）。
//   一戦だけの見なしでは達成＝持ち越しの身分の馬が元。木戸の守りは砦の中の戦なので、軍勢の馬はそのまま本人だけ徒歩で出る（長久手二・山中城と同じ。敵の数と強さは変えない）
t03_komaki.playerOnFoot = true;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03_komaki = STAGE_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
withGuard(t03_komaki);

export { t03_komaki };
export default t03_komaki;
