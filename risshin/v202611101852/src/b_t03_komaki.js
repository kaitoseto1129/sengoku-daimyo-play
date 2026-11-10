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
// 負け：森長可が討たれる・木戸を破られる・連れた兵がほとんど討たれる。
// ③④では家康・信雄は南の小牧山の本陣、秀吉は北の楽田の本陣で、陣幕の中の床几に座り、旗本に守られ前に出ない（AR の 3・AV の 7）。
// 名のある将（森長可・奥平信昌・酒井忠次）は馬上で、旗本の組に囲まれる。行き先は金の▼一つで、段ごとに場所は固定。
// 旗は戦った家だけ：羽柴（秀吉の砦）・森（鶴丸）・徳川（奥平・榊原・酒井を含む）・信雄（本陣だけ）。
// 向き：北は −z。西（−x）が二重堀の砦、その北北東の後ろが楽田、南南西の奥が小牧山（実の地図どおり。11/5）。東（+x）が羽黒の八幡林、北（−z）が犬山。
//   羽黒は実は楽田の北だが、時の飛ぶ二つの場を一枚に並べるため東に置いた。間隔は縮めた復元。
// ======================================================================
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { horiboriHeight, dobeiLine, yaguraGate, monomi } from './castle_parts.js';
import { kagaribiBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { flagTexture } from './textures.js';
import { reduceMotion } from './settings.js';
import { battleEventsStart } from './battle_events.js';
// 15分の段（kaito 11/8 夜）：段の中身は t03_komaki/ に
import * as Camp from './t03_komaki/camp.js';
import * as Council from './t03_komaki/council.js';
import * as Night from './t03_komaki/night.js';
import { T03_DEPTH } from './t03_komaki/depth.js';

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
// 本物の兵の数（壁の外の本陣は、描く数がほぼ要らないので数えない）
export const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && u.type !== 'porter' && !u.group?.honjin ? 1 : 0), 0);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 本陣（床几の大将は陣幕の中に座る）の前を囲む旗本。動かず、討てない
function campGuard(rt, team, at, facing, name, flag, n, faction) {
  const mk = team ? enemyGroup : allyGroup;
  const list = [{ type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } }, { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }];
  const g = mk(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99, ...(faction ? { faction } : { fullStrength: true }) },
    team ? dressT(fl(list, flag)) : fl(list, flag));
  g.honjin = true;
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
  const put = (u, dx, dz) => { u.pos.x = x + dx; u.pos.z = z + dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.target = null; u.moveTo = null; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } };
  put(P, 0, 0);
  if (rt.player.vel) { rt.player.vel.x = 0; rt.player.vel.z = 0; }
  rt.player.lock = null;
  if (heading != null) rt.player.heading = heading;
  let i = 0;
  for (const g of [...(rt.squadGroups || []), rt.flags.men]) if (g && g.units) {
    for (const u of g.units) if (u.alive && !u.isPlayer) { put(u, -5 + (i % 6) * 1.6, -3 - Math.floor(i / 6) * 1.5); i++; }
    g.anchor = { x, z: z - 4 };
  }
}

// 家康・信雄の本陣（AR の 3）：金扇の馬印のまわりに旗本・馬廻の侍と足軽・鉄砲。動かず、前に出ない。討てない
export function ieyasuHonjin(rt, at, facing) {
  const o = { faction: 'tokugawa', facing, width: 9, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99 };
  const ie = enemyGroup(rt, { ...o, name: '徳川家康の旗本', anchor: { x: at.x, z: at.z } },
    dressT([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 18, o: { keep: true } },
      { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 6 }]));
  const nb = enemyGroup(rt, { ...o, faction: 'nobukatsu', name: '織田信雄の旗本', anchor: { x: at.x + 16, z: at.z + 4 }, width: 6 },
    [{ type: 'busho', n: 1, o: { name: '織田信雄', invuln: true, horse: true, flag: 'oda' } }, { type: 'samurai', n: 8, o: { flag: 'oda', keep: true } }, { type: 'ashigaru', n: 6, o: { flag: 'oda', flagScale: 1 } }]);
  for (const g of [ie, nb]) { g.honjin = true; for (const u of g.units) { u.invuln = true; u.noTarget = true; } }
  return [ie, nb];
}
// 見えない壁：本陣（壁の外）の兵だけは外に置いたまま
export function walls(rt, xw, zn, zs) {
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.group?.honjin) continue;
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
  const r = Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, NROAD));
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
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03_komaki = {
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
  goalSignOnly: true,  // 行き先は頭上の金の▼一つだけ（地面の矢印・持ち場の輪を出さない。BH の 6）
  kumiLead: false,     // 組頭の青い印も出さない（印は一つ。AV の 15）
  nearbyAllySignLimit: 0,   // 11/8 五2・八1：近くの味方の頭上の白い丸が、宙に浮く白い玉に見えた
  noLeaderFollow: true,
  noHatamotoMass: true,
  frontlineDensity: false,
  alwaysMelee: false,
  foeMarks: true,
  enemyTriangleSigns: true,
  keepBattleSigns: true,   // 行き先の案内中も、武将名・両軍の人数と敵の赤い▼を残す。
  noAutoFoeCam: () => true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  victoryTitle: '小牧の対陣、膠着',
  victoryCaption: '二重堀を守り、三河への中入りへ',
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 出陣直後の下知を待つ間も、最初の物見櫓を指す。
    const stage = F.stage || 1;
    // 行き先は段ごとに固定（人や組の動きで動かさない。AW の 3・BK の 4）
    const p = [null, Camp.towerAt(rt, this.ctx(rt)), GATE, FIELD, COUNCIL, MORIJIN, Night.FORD, Night.DAWN][stage];
    if (!p) return null;
    // 目標の文から名を抜くと、長い文は空欄になり、鉄砲組の段では敵の名が場所の代わりに出る。
    PIN.x = p.x; PIN.z = p.z; PIN.r = 8; PIN.label = PIN_NAMES[stage];
    return PIN;
  },
  world: {
    seed: 15843,
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
    height,
    paths: [{ pts: ROAD, w: 3.5 }, { pts: NROAD, w: 3 }],
    longHoro: 'round',   // 野呂助左衛門の母衣は竹籠に布の丸い母衣（背の薄い板やマントにしない）
    streams: [{ pts: GOJO, w: 4.5, depth: 0.9 }],
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
    clear: (x, z) => dist({ x, z }, HAGURO) < 16 || dist({ x, z }, MORIJIN) < 16 || dist({ x, z }, FORT) < 26 || dist({ x, z }, RAKUDA) < 34 || dist({ x, z }, Night.FORD) < 10 || dist({ x, z }, Night.DAWN) < 12 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, NROAD) < 6,
    trees: 200,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 60 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? z > 170 || x > 170 : x < -170),
  },

  // 段の中身（t03_komaki/*.js）へ渡す道具
  ctx(rt) {
    return { RAKUDA, RK, HONJIN, FORT, GATE, FIELD, MORIJIN, COUNCIL, farArmy, campGuard, fl, dressT, live, aliveN, resistingN,
      pushWave: (g) => rt.flags.waves.push(g), next: () => this.stage(rt, rt.flags.stage + 1), win: () => this.win(rt) };
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = [];
    Camp.campSetup(rt, this.ctx(rt));
    // 二重堀の砦：南向きの柵と木戸（羽柴の砦の兵が中に）
    const L = FORT.x - 34, R = FORT.x + 34, Z = GATE.z;
    F.saku = [...wallLine(rt, [[L, Z], [GATE.x - 4, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[GATE.x + 4, Z], [R, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[L, Z - 30], [L, Z]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' }),
      ...wallLine(rt, [[R, Z], [R, Z - 30]], { team: 0, hp: 1e9, name: '二重堀の砦の柵' })];
    // 守将は日根野弘就。稲葉一鉄も砦に詰める（どちらも馬上の名のある将・討てない）
    F.fort = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の兵', anchor: { x: FORT.x, z: GATE.z - 6 }, facing: 0, width: 16, aggro: 6, order: 'hold', fixed: true, noRout: true, dmgMult: 0.45 },
      fl([{ type: 'busho', n: 1, o: { name: '日根野弘就', horse: true } }, { type: 'busho', n: 1, o: { name: '稲葉一鉄', horse: true } },
        { type: 'gun', n: 10 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }], 'toyotomi'));
    for (const u of F.fort.units) if (u.type === 'busho') u.invuln = true;
    rt.scene.add(kagaribiBatch(rt.world, KAGARI));
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
      F.gateWaves = [];
      // 小牧山の麓から田を渡って寄せる組（柵越しの打ち合い。大軍は動かない）
      const send = (i) => { if (F.stage !== 2) return; const g = this.wave(rt, { x: GATE.x - 22 + (i % 3) * 22, z: 78 + (i % 2) * 8 }, 12, { x: GATE.x, z: GATE.z + 2 }, i === 3 ? '榊原康政の手' : '徳川勢'); if (g) F.gateWaves.push(g); };
      afterGate(4, () => { send(1); rt.army.play('toki', { x: GATE.x, z: 70 }, 1.2); rt.say('物見', '小牧山から徳川の手！　田を渡って来る！', 2.6); });
      afterGate(30, () => send(0));
      afterGate(60, () => { send(2); rt.army.play('volley', { x: GATE.x - 30, z: 60 }, 1.0); });
      afterGate(95, () => { send(3); rt.say('物見', '榊原の旗！　「無」の字の旗が寄せて来る！', 2.8); });
      F.inside = 0;
    } else if (n === 3) {
      countFallen(rt);
      F.gunDead0 = F.fallen[1];
      rt.say('日根野弘就', '堀の前に鉄砲を並べおった。打って出て追い払え', 2.8);
      F.guns = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の鉄砲組', anchor: { ...FIELD }, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 10, formation: 'line', morale: 90, dmgMult: 0.35,
        order: 'hold', seekRange: 30, aggro: 10, noRout: false },
      dressT([{ type: 'gun', n: 10 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'samurai', n: 2 }]));
      F.gunsN = aliveN(F.guns);
      F.waves.push(F.guns);
      F.sortie = allyGroup(rt, { faction: 'oda', name: '二重堀の砦の打って出る組', fullStrength: true, anchor: { x: GATE.x, z: GATE.z + 4 }, facing: 0, width: 6, formation: 'line', aggro: 12, seekRange: 30, speed: 4.2, order: 'attack', noRout: true, dmgMult: 0.5 },
        fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 3 }], 'toyotomi'));
      F.sortie.dest = { x: FIELD.x, z: FIELD.z - 4 };
      rt.army.play('toki', { x: GATE.x, z: GATE.z + 4 }, 1.2);
    } else if (n === 4) {
      for (const g of [F.guns, F.guns2]) if (live(g)) { g.order = 'retreat'; g.dest = { x: FIELD.x, z: ZS + 20 }; }
      if (live(F.sortie)) { F.sortie.order = 'move'; F.sortie.dest = { x: GATE.x, z: GATE.z - 8 }; F.sortie.onArrive = (q) => { q.order = 'hold'; }; }
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
    g.ai = true;
    g.defMult = 2;
    return g;
  },
  // 徳川勢の一組。to へ寄せ、focus があればその者を狙う
  wave(rt, at, n, to, name = '徳川勢', focus) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 4, formation: 'line', morale: 85, dmgMult: 0.36,
      order: 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n, kitOf(name)));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },

  update(rt, dt) {
    const F = rt.flags;
    countFallen(rt);
    // 小牧山へ退く組は南の境で去る。壁へ押し戻すと、退却先へ届かず田に残り続ける
    for (const g of F.waves) {
      // 組頭を失って崩れた組は、共通処理が退却の下知を「敗走」に替える。敗走も南の境で去らせる。
      if (g.order !== 'retreat' && g.order !== 'flee') continue;
      for (const u of g.units) if (u.alive && !u.gone && (u.pos.z >= ZS - 2 || (u.pos.x < -XW + 4 && g.dest?.x < -60))) rt.army.despawn(u);
    }
    // 討死直後も戦場は動くが、本人の任務・知らせ・増援は先へ進めない。
    if (F.ending || rt.over || !rt.player.u.alive || !F.stage || F.transitioning) return;
    const P = rt.player.u;
    walls(rt, XW, ZN, ZS);
    // 連れた兵は主人公の脇に付く
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.men) && F.men.center();
      if (c) {
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 8) { F.men.order = 'move'; F.men.dest = { x: P.pos.x + 2, z: P.pos.z + 2 }; F.men.speed = 4.2; }
        else { F.men.order = 'attack'; F.men.seekRange = 14; }
      }
    }
    if ((F.stage === 2 || F.stage === 3) && F.menN0 >= 3 && aliveN(F.men) < Math.ceil(F.menN0 / 6)) return this.lose(rt, '連れた兵がほとんど討たれた');
    const el = rt.t - F.st0, K = this.ctx(rt);
    if (F.stage === 1) Camp.tickCamp(rt, K);
    else if (F.stage === 2) {
      // 抵抗を続ける敵八人が砦の中（木戸より北）に居座れば木戸を破られる。
      // 押し返して退く兵や、戦を離れた負傷兵では敗北にしない。
      let inside = 0;
      for (const g of F.gateWaves) {
        if (!resistingN(g)) continue;
        for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && u.pos.z < GATE.z - 3 && Math.abs(u.pos.x - GATE.x) < 34) inside++;
      }
      F.inT = inside >= 8 ? (F.inT || 0) + dt : 0;   // 八人が十秒、砦の中に居座れば破られた（主人公を追って一瞬入るだけでは負けにしない）
      if (F.inT > 10) return this.lose(rt, '木戸を破られた');
      if (!F.inabaSaid) for (const g of F.gateWaves) for (const u of g.units) if (!F.inabaSaid && u.alive && dist(u.pos, GATE) < 12) {
        F.inabaSaid = true; rt.say('稲葉一鉄', 'うろたえるな！　土橋は狭い。渡る者から一人ずつ突け', 3);
      }
      const left = F.gateWaves.reduce((s, g) => s + resistingN(g), 0);
      if (dist(P.pos, GATE) < 18 && el > 125 && ((F.gateWaves.length >= 4 && left <= 4) || el > 160)) {
        for (const g of F.gateWaves) if (live(g)) { g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 }; }
        rt.say('物見', '徳川勢、小牧山へ引いていく', 2.4);
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
        F.guns2 = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の鉄砲の二の列', anchor: { x: FIELD.x + 14, z: FIELD.z + 22 }, facing: Math.PI, fleeDir: { x: 0, z: 1 }, width: 8, formation: 'line', morale: 85, dmgMult: 0.32, order: 'hold', seekRange: 28, aggro: 10 },
          dressT([{ type: 'gun', n: 7 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }]));
        F.waves.push(F.guns2);
        F.guns2N = aliveN(F.guns2);
        rt.say('物見', '奥にもう一列！　鉄砲が並び直したぞ', 2.6);
      }
      // 討ち減らされた列は実際に小牧山へ退く。達成まで残兵を田で戦わせ続けない。
      retreatGunLine(F.guns, F.gunsN);
      retreatGunLine(F.guns2, F.guns2N);
      // 田へ出て両列と交戦した後は、小競り合いを際限なく続けない。
      // それぞれの列を四分の一崩し、田の周りで四十五秒押した時だけ、残る列も援護しつつ退く。
      // 木戸の内で待つだけ、または健在な両列を放置しただけでは進まない。
      if (dist(P.pos, FIELD) < 36) F.fieldPress = (F.fieldPress || 0) + dt;
      if (F.guns2 && el > 180 && F.fieldPress >= 45 &&
          resistingN(F.guns) <= F.gunsN * 0.75 && resistingN(F.guns2) <= F.guns2N * 0.75) {
        for (const g of [F.guns, F.guns2]) if (live(g) && g.order !== 'retreat' && g.order !== 'flee') {
          g.order = 'retreat'; g.dest = { x: g.center().x, z: ZS + 20 };
          g.aggro = 0; g.seekRange = 0;
        }
      }
      // 前の列だけ崩しても、健在な二の列を残して達成にはしない。
      const drivenOff = F.guns2 && drivenOffGroup(F.guns, F.gunsN) && drivenOffGroup(F.guns2, F.guns2N);
      // 木戸の内で待つだけでは「田へ出る」を果たさない。主人公も鉄砲組のいた田まで進む。
      if (dist(P.pos, FIELD) < 18 && el > 60 && drivenOff) this.stage(rt, 4);
    } else if (F.stage === 4) Council.tickCouncil(rt, K);
    else if (F.stage === 5) Council.tickOrders(rt, K);
    else if (F.stage === 6) Night.tickNight(rt, K, dt);
    else if (F.stage === 7) Night.tickDawn(rt, K);
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
t03_komaki.history = '天正十二年（1584）、織田信雄は徳川家康と組んで羽柴秀吉と手を切った。秀吉方に付いた池田恒興が犬山城を落とすと、家康は小牧山を押さえて堀と土塁で固めさせた。三月十七日の夜明け、小牧山を狙って羽黒に陣を張った森長可は、奥平信昌・榊原康政の先手に前から、回り込んだ酒井忠次の手に横から襲われ、三百ほどを失って犬山へ退いた（羽黒の戦い・徳川方およそ五千）。退く時、母衣衆の野呂助左衛門父子が引き返して討死した。三月の末、秀吉は楽田に本陣を置き、二重堀などの砦を並べて小牧山の家康・信雄とにらみ合った。どちらも砦から出ず、最前線の二重堀の砦（守将 日根野弘就）への夜討ちのような小競り合いが続いた。膠着を破ろうと、池田恒興は家康の留守の三河を突く中入りを言い出す。羽黒と二重堀の間隔は縮めた復元で、主人公の組の動きは遊びのための筋書き。';
t03_komaki.famous = [];
// bot：森長可と退く段は、打ち込みを受けても歩みを止めない
t03_komaki.botGuardFlee = (b) => false;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03_komaki = STAGE_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
withGuard(t03_komaki);

export { t03_komaki };
export default t03_komaki;
