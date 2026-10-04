import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日・昼から夜の強襲・縄張り版。docs/first6-1560-1569-spec.md 34〜41）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、申の刻から攻めかかって、夜のうちに落とした。
// 八段の流れ：1 山麓へ寄る → 2 外側の柵（三の郭）→ 3 三の郭を取る → 4 日が傾き松明を灯す → 5 二の丸の木戸
//   → 6 夜戦 → 7 本丸の守りが崩れる → 8 翌日の観音寺入城を後日談で伝える
// 攻め手は佐久間・丹羽・木下・浅井新八の四手が同時に寄せる。自分は木下藤吉郎の手（南の大手の一方向）。ほかの方向は遠景と AI
// （castles/mitsukuri.js の縄張り・castle_plan.js・siege_zones.js・siege_ai.js・butai.js を使う。
//  三の郭〔坂の上〕→二の丸〔木戸構え〕→本丸、の区域の取り合い＋城の頭）
// 落城後の架空の後詰・放火・一騎打ちは挟まない。守りを退け、三曲輪を押さえる。
// 向き：北（-z）が箕作山の城。北西の奥（-x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// ======================================================================
import { nobori, hut, yagura, tawara, campfire, ishigaki, kabukimon, dorui, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, nm, allyGroup, enemyGroup } from './bhelp.js';
import { customFlag, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { buildHorse } from './units_model.js';
import { yamaLift, benchRoads } from './yamalift.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { sakamogiRow, horiboriHeight } from './castle_parts.js';
import { makeSiegeZones } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI, chooseRoute } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { demDetail } from './dem.js';
import {
  MITSUKURI_PLAN, SAN_C, NI_C, HON_C, KIDO, NISHI_TANI_X, ROAD_OTE, ROAD_TANI, ROAD_URA,
} from './castles/mitsukuri.js';

// 束0 の asset_dem_mitsukuri.js がまだ無い時も止まらないように（無ければ base のまま）
let dem = null;
import('./asset_dem_mitsukuri.js').then((m) => { dem = m.default; }).catch(() => {});

const KAN = { x: -130, z: -196 };           // 観音寺城のある繖山
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], ...ROAD_OTE];
// 麓からの登りを終え、谷道との分かれ目の手前から始める。
const OPEN_PT = ROAD_OTE[4];
const TANI_ATTACK_ROAD = [...ROAD_TANI, [0, -41], [SAN_C.x, SAN_C.z]];
// 松明の束：日が傾いた時、三の郭の柵の口の外（坂の上）で火を移す
const TORCH = [{ x: -10, z: -36 }, { x: 4, z: -32 }, { x: 16, z: -37 }];
const torchReady = (u) => u.type === 'ashigaru' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.downed && !u.rearWound && !u.climb;
const ODA = { flag: 'oda' };
const RK = { armor: 0x33291f, flag: 'rokkaku' };
// 下知は近くでは将本人、離れていれば組頭が伝える。
const sayKino = (rt, text, secs) => { const u = rt.flags.kinoU; rt.say(u?.alive && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) <= 16 ? '木下藤吉郎' : '組頭', text, secs); };
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { const step = rt.flags.step; rt.objDone('main'); rt.after(2, () => { if (!rt.flags.ending && rt.flags.step === step) rt.obj('main', text, 'main'); }); };

// 六角の紋：隅立て四つ目結（四つの目結を菱に並べる）
function rokkakuTex() {
  return customFlag('rokkaku', (g) => {
    g.translate(64, 82); g.scale(43, 43);
    const P = new Path2D();
    const sq = (cx, cy, s) => { P.moveTo(cx, cy - s); P.lineTo(cx + s, cy); P.lineTo(cx, cy + s); P.lineTo(cx - s, cy); P.closePath(); };
    for (const [cx, cy] of [[0, -0.48], [0.48, 0], [0, 0.48], [-0.48, 0]]) { sq(cx, cy, 0.44); sq(cx, cy, 0.19); }
    g.fill(P, 'evenodd');
  });
}

// 手書きの地形（箕作山・繖山・和田山）。曲輪・道・切岸は heightOf（castle_plan.js）が上書きする
function baseRaw(x, z) {
  let h = 0.5 * Math.sin(x * 0.034 + 0.2) * Math.cos(z * 0.029) + 0.3 * Math.sin(z * 0.06 + x * 0.03);
  h += 34 * gauss(x, z, HON_C.x, HON_C.z + 6, 2400) + 16 * gauss(x, z, -44, -124, 2000) + 12 * gauss(x, z, 40, -130, 1800);
  h += 70 * gauss(x, z, KAN.x, KAN.z, 6000) + 18 * gauss(x, z, -130, -60, 1800);
  return h;
}
// 繖山の山腹の六角の本陣（平らに削った段。castle_plan の縄張りの外なので、ここは手で均す）
const KC = { x: -96, z: -140 };
const KTOP = baseRaw(KC.x, KC.z);
function baseWithKan(x, z) {
  const h = baseRaw(x, z);
  const dk = Math.hypot(x - KC.x, z - KC.z);
  const q = Math.max(0, Math.min(1, (20 - dk) / 8));
  return h * (1 - q) + KTOP * q;
}
// 国土地理院の標高（箕作山。asset_dem_mitsukuri.js は本丸が格子の原点）の尾根と谷の凹凸を、手書きの山に足す。
// 山の高さの形は手書きのまま。実測の 3m をゲームの 1 座標に縮め、本丸（HON_C）を原点に合わせる。
const MITSUKURI_DEM_OPTIONS = { xy: 3, ox: HON_C.x, oz: HON_C.z, win: 60, scale: 0.35 };
function baseWithDem(x, z) {
  const b = baseWithKan(x, z);
  return dem ? b + demDetail(dem, x, z, MITSUKURI_DEM_OPTIONS) : b;
}
// 堀の形は一度だけ用意し、城の部品と同じ窪みを実際の地面にも付ける。
const HORI_HEIGHTS = MITSUKURI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
function baseWithHori(x, z) {
  let h = baseWithDem(x, z);
  for (const f of HORI_HEIGHTS) h += f(x, z);
  return h;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(MITSUKURI_PLAN, baseWithHori, 2.6);
  if (!BENCHED) BENCHED = benchRoads((px, pz) => HEIGHT_FN(px, pz) + yamaLift(px, pz, LIFT), [ROAD, TANI_ATTACK_ROAD, ROAD_URA]);
  return BENCHED(x, z);
}
let BENCHED = null;

// 山道では縦隊を保ち、三の郭へ入る時は二段の槍衾へ詰める。
function routeOld(g, pts, speed = 2.3, done = null) {
  if (!g) return;
  for (const u of g.units) u._sanRoad = pts;
  let i = 0;
  const step = () => {
    if (!g.count || g.routed) return;
    if (i >= pts.length) { g.onArrive = null; if (done) done(); else { g.order = 'attack'; g.seekRange = 50; } return; }
    const [x, z] = pts[i++];
    // 長い縦隊のままだと後列の持ち場が柵の外へ残り、郭の人数も到着待ちも満たせない。
    // 口の手前では共通の fitGroupSlots が幅を絞り、郭の中で二段に広がる。
    g.formation = x === SAN_C.x && z === SAN_C.z ? 'yari' : 'column'; g.colW = 2;
    g.order = 'move'; g.dest = { x, z }; g.speed = speed; g.onArrive = step;
  };
  step();
}

// 大手も谷の手も、外柵の口を通る。横へ開いた兵が柵へ直進して止まらないようにする。
function sanDirect(army, u, goal) {
  const distance = Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z);
  if (distance > 12 || army.wallBetween(u.pos, -1, goal)) return false;
  const n = Math.max(1, Math.ceil(distance));
  for (let i = 1; i <= n; i++) if (!army.world.walkable(
    u.pos.x + (goal.x - u.pos.x) * i / n, u.pos.z + (goal.z - u.pos.z) * i / n)) return false;
  return true;
}

function sanKuchiWay(army, u, goal) {
  if (u.team !== 0) return goal;
  // 近くの歩いて届く相手には直接寄る。斬り合いを次の曲がり角へすり替えない。
  if (sanDirect(army, u, goal)) return goal;
  if (u.pos.z > -44 && u.pos.z < -30 && goal.z < -36 && Math.abs(goal.x) < 20 && Math.abs(u.pos.x) > 2.4) {
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    if (u.pos.z < -36 && Math.abs(u.pos.x) > 8) { q.x = Math.sign(u.pos.x) * 26; q.z = -35; }
    else { q.x = 0; q.z = -35; }
    return q;
  }
  if (u.pos.z > -30 || goal.z > -30) {
    // 攻め上りも下山も、現在地と行き先が道のどこにあるかで向きを決める。
    // 登りだけの添字を残すと、手当てや退却の際にも山の上へ戻してしまう。
    const road = u._sanRoad || ROAD_OTE;
    const from = u._sanFrom || (u._sanFrom = { x: 0, z: 0, s: 0, d: 0 });
    const to = u._sanTo || (u._sanTo = { x: 0, z: 0, s: 0, d: 0 });
    sanRoadPoint(road, u.pos, from); sanRoadPoint(road, goal, to);
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
  if (from.d > 9) { q.x = from.x; q.z = from.z; }
    else {
      const up = to.s > from.s;
      let index = up ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
      index = Math.max(0, Math.min(road.length - 1, index));
      if (Math.hypot(u.pos.x - road[index][0], u.pos.z - road[index][1]) < 1.5) index += up ? 1 : -1;
      if (index < 0 || index >= road.length || (up ? index >= to.s : index <= to.s)) return goal;
      q.x = road[index][0]; q.z = road[index][1];
    }
    return q;
  }
  if (u.pos.z < -44 || u.pos.z > -30 || goal.z >= -44 || Math.abs(goal.x) >= 20) return goal;
  const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
  // 横から中央へ直進すると z=-39 の逆茂木に当たる。端の外を回って南の帯へ出る。
  const side = Math.abs(u.pos.x);
  if (side > 8 && u.pos.z < -36) { q.x = Math.sign(u.pos.x) * 26; q.z = -35; }
  else if (side > 2.4) { q.x = 0; q.z = -35; }
  else { q.x = 0; q.z = -49; }
  return q;
}

function sanRoadPoint(road, p, out) {
  out.d = Infinity;
  for (let i = 0; i + 1 < road.length; i++) {
    const a = road[i], b = road[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < out.d) { out.x = x; out.z = z; out.s = i + t; out.d = d; }
  }
}

// 信長公記巻一の四手の攻め。短い強襲なので、史料にない付城を新設しない。
const MITSUKURI_JIN = [
  battleJin('四手の寄せ', 0, { x: CAMP.x, z: CAMP.z + 22 }, Math.PI, [
    ['mkNobu', '本陣', '織田信長', 3000, CAMP.x, CAMP.z + 22, 'odaCamp', 'eiraku', 'oda'],
    ['mkKino', '大手の仕寄り', '木下藤吉郎', 1500, CAMP.x, CAMP.z - 6, 'kino', 'oda'],
    ['mkNiwa', '西の仕寄り', '丹羽長秀', 2000, CAMP.x - 22, CAMP.z - 4, 'niwa', 'oda', 'sujikai'],
    ['mkSaku', '大手の控え', '佐久間信盛', 2000, CAMP.x + 24, CAMP.z - 4, 'saku', 'oda'],
    ['mkAsai', '東の仕寄り', '浅井新八', 1500, 58, -70, 'asai', 'oda'],
  ], '各手の人数は復元。上洛軍全体を箕作の麓へ集めない。'),
  battleJin('曲輪の守り', 1, HON_C, 0, [
    ['mkSan', '外の小曲輪', '名は伝わらない', 220, SAN_C.x, SAN_C.z, 'sanDef', 'rokkaku'],
    ['mkNi', '二の丸', '名は伝わらない', 260, NI_C.x, NI_C.z, 'niDef', 'rokkaku'],
    ['mkEast', '東の曲輪', '名は伝わらない', 140, 22, -98, 'asaiFoe', 'rokkaku'],
    ['mkYoshida', '本陣', '吉田出雲守', 180, HON_C.x, HON_C.z, 'honDef', 'rokkaku'],
  ], '城兵の総数は不明。この持ち場の八百人は仮の数。吉田の名も伝承による。家の旗は既存の六角旗で代える。'),
];

const mitsukuri = {
  jinkei: MITSUKURI_JIN,
  noTaisho: true, // 城将一人の討死で即勝ち・討ち取りの副任務を出さない。
  noWake: true,   // 城の部隊だけを本物へ替え、遠景の兵は重ねない。
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: OPEN_PT[0] + 3, z: OPEN_PT[1], heading: Math.PI },
  world: {
    blockedHint: () => '味方の列の横を通れ。大手は中央の山道、谷は西の道へ回れ',
    seed: 1568,
    wind: [0.7, 0.7],   // 風向き・強さは景色の復元で、史料の断定ではない
    time: 'day',   // 昼過ぎから攻めかかり、夕暮れ・夜へ移る
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.15,
    terrainTags: true,
    paths: [ROAD, TANI_ATTACK_ROAD, ROAD_URA],
    moveWay: sanKuchiWay,
    castleRoute: (from, to) => from === 'san' && to === 'ni' ? [[0, -60], [KIDO.x, KIDO.z], [NI_C.x, NI_C.z]]
      : from === 'ni' && to === 'hon' ? [[0, -90], [0, -92], [HON_C.x, HON_C.z]] : null,
    height,
    tint(x, z, h, c) {
      if (h > 10) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.82);
    },
    clear: (x, z) => (Math.abs(x - CAMP.x) < 40 && Math.abs(z - CAMP.z) < 36) || (Math.abs(x) < 24 && z < 30 && z > -112),
    // 近江の稲田（刈り入れ前）
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 0 || z > 150 || Math.abs(x - CAMP.x) < 42 || Math.abs(x) > 150) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.6;
    },
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (z > 0 ? 0.2 : 1),
    groves: [{ x: -50, z: 20, r: 12, n: 16 }, { x: 60, z: 30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -118 && Math.abs(x) > 40)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.litMask = 0; F.fow = true;
    rokkakuTex();
    resetGates();

    // ---- 縄張り（castles/mitsukuri.js）：三の郭・二の丸・本丸。木戸は castle_plan.js に建てさせる ----
    const C = F.C = buildCastlePlan(rt, MITSUKURI_PLAN, { ladders: true, baseHeight: baseWithDem, edgeW: 2.6, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;
    F.gates = { kido: makeGate(rt, C.gateObjs.kido, { name: KIDO.name, guardTeam: 1 }) };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { honmaru: 'HIST_A', ninomaru: 'HIST_A', sekirui: 'HIST_A', saku: 'HIST_B', kido: 'HIST_B', kirigishi: 'HIST_B', sanKuruwa: 'GAME_C',
      kannonjiNet: 'HIST_A', dayToNight: 'HIST_A', fourCommanders: 'HIST_A', torchLegend: 'HIST_B', honjinOda: 'GAME_C', honjinRokkaku: 'HIST_B', yoshidaIzumo: 'HIST_B' };
    // 三の郭（外側の防御線）：柵で囲い、南の柵の口に冠木の枠（戸は無い）。口の外に逆茂木を並べて寄せを鈍らせる
    rt.scene.add(kabukimon(W, 0, -44, 4.4, 0, { doors: false }));
    sakamogiRow(rt, [[-20, -39], [-9, -39]], { n: 3 }); sakamogiRow(rt, [[9, -39], [20, -39]], { n: 3 });
    rt.scene.add(yagura(W, sanC.x - 9, sanC.z - 8), yagura(W, sanC.x + 10, sanC.z - 8));
    for (const [x, z] of [[-4, sanC.z - 10], [5, sanC.z - 10], [0, niC.z - 8]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 6));
    // 山城の土塁・切岸：山道をはさむ段々の土の壁（道の口は空ける。A057）
    for (const z of [-12, -26]) for (const [xa, xb] of [[-44, -8], [8, 44]]) rt.scene.add(dorui(W, [xa, z, xb, z], 0, 1, { w: 3, h: 1.3 }));
    // 本丸：参照にある西側面だけに石塁の一部。南の登り口は土の切岸のまま空ける。
    rt.scene.add(ishigaki(W, [[-10.6, -93], [-10.6, -100]], { top: 1.2, minH: 1.8, maxH: 2.4, lean: 0.14 }));
    // 本丸の館は縄張りから建てる。城将は館前の旗本と守る。
    rt.scene.add(hut(W, honC.x + 7, honC.z + 4, 5, 4, -0.3));
    // ---- 繖山の観音寺城（遠く）：山腹の屋敷と旗 ----
    for (const [x, z, r] of [[-92, -150, 0.3], [-104, -160, 0.1], [-84, -166, -0.2], [-112, -176, 0.4]]) rt.scene.add(hut(W, x, z, 10, 6, r, { h: 3.4, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[-82, -146], [-108, -156]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 7));
    // 観音寺城の火。遠い火の消失だけで父子の行き先を知る扱いにはしない。
    F.kanFires = [[-90, -146], [-100, -152], [-110, -160], [-84, -162], [-96, -170], [-116, -172], [-106, -182]].map(([x, z]) => W.addFire(x, z, { h: 0.3 }));

    // ---- 守り（箕作城・六角の衆。曲輪ごとに butai.js の部隊。siege_ai.js の城の頭で動かす） ----
    // 南の攻め手に正対し、曲輪の幅と奥行きの中に備えを置く。
    F.sanDef = makeButai(rt, { name: '坂の守り', team: 1, faction: 'imagawa', kind: 'ashigaru', nominal: 220, nearReal: 14, maxReal: 14, armor: 0x33291f, flag: RK.flag, at: sanC, facing: 0, lightWidth: 36, lightDepth: 18, real: 12 });
    F.niDef = makeButai(rt, { name: '二の丸の槍と弓', team: 1, faction: 'imagawa', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 260, armor: 0x33291f, flag: RK.flag, at: niC, facing: 0, lightWidth: 28, lightDepth: 22, real: 0 });
    // 遠景は徒歩の槍の形に保つ。共通の混成遠景が城内へ騎馬を足すのを避ける。
    F.niDef.mix = { ashigaru: 0.75, bow: 0.25, samurai: 0, gun: 0, cavalry: 0 };
    F.niDef.growReal(14);
    F.honDef = makeButai(rt, { name: '城将 吉田出雲守の衆', team: 1, faction: 'imagawa', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 180, armor: 0x33291f, flag: RK.flag, at: honC, facing: 0, lightWidth: 16, lightDepth: 14, real: 14 });
    F.defenders = [F.sanDef, F.niDef, F.honDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    // 城将は本丸の館前で近習と守る。足軽に奥の間の一騎打ちを命じない。
    F.commandGuard = enemyGroup(rt, { fixed: true, name: '吉田出雲守の旗本', faction: 'imagawa',
      anchor: { x: honC.x, z: honC.z - 1 }, facing: 0, width: 5, formation: 'yari', aggro: 5 },
      dress([{ type: 'busho', n: 1, o: { name: '吉田出雲守' } }, { type: 'samurai', n: 5 }], RK));
    F.commander = F.commandGuard.units[0];
    if (rt.castleSeat) rt.castleSeat.used = true;
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、丹羽長秀の手、佐久間信盛の手、木戸を破る組 ----
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: CAMP.x, z: CAMP.z - 6 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: CAMP.x - 22, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: CAMP.x + 24, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { fixed: true, name: '木戸を破る組', anchor: { x: CAMP.x + 10, z: CAMP.z + 10 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.kino, F.niwa, F.saku, F.ram];
    F.gunK = allyGroup(rt, { fixed: true, name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: false }, dress([{ type: 'gun', n: 4 }], ODA));
    F.attackers = F.oda;
    F.attackTotal = F.oda.reduce((n, g) => n + g.count, 0);
    // 浅井新八の手：北東の尾根から本丸の東の切岸へ寄せる（遠景・AI。軽い作りの部隊で、数だけで押し合う）
    F.asai = makeButai(rt, { name: '浅井新八の手', general: '浅井新八', team: 0, faction: 'oda', kind: 'busho', nominal: 1500, armor: 0x2b3140, flag: 'oda', at: { x: 58, z: -70 }, facing: -Math.PI * 0.62, lightWidth: 40, lightDepth: 50, real: 1, nearReal: 1, farReal: 1, maxReal: 1 });
    F.asaiFoe = makeButai(rt, { name: '本丸の東の守り', team: 1, faction: 'imagawa', kind: 'ashigaru', nominal: 140, armor: 0x33291f, flag: RK.flag, at: { x: 22, z: -98 }, facing: Math.PI / 2, lightWidth: 20, lightDepth: 14, real: 0, maxReal: 0 });
    for (const b of [F.asai, F.asaiFoe]) b.order({ id: 'hold' });
    for (const [x, z] of [[62, -64], [54, -62]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 3, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 陣と旗 ----
    F.odaCamp = camp(rt, { x: CAMP.x, z: CAMP.z + 22, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 260, runTo: { x: CAMP.x, z: CAMP.z - 6 } });
    // 北向きの本陣は、馬廻も信長の前（北側）を守る。
    F.odaCamp.guard.anchor.z = CAMP.z + 10;
    // 控え馬は山麓に置く。城内の守りを騎馬へ替えず、手綱を取れる機会を作る。
    const horse = buildHorse();
    horse.position.set(CAMP.x + 18, W.heightAt(CAMP.x + 18, CAMP.z), CAMP.z);
    horse.rotation.y = Math.PI;
    rt.scene.add(horse);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h: horse, heading: Math.PI, spd: 0, t: 20, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } });
    rt.after(6, () => rt.bark('麓の陣に控え馬がいる。そばで「乗る」を押すと手綱を取れる'));
    F.ramNext = allyGroup(rt, { fixed: true, name: '木戸破りの控え', anchor: { x: 14, z: 96 },
      facing: Math.PI, width: 5, formation: 'column', aggro: 2 }, dress([{ type: 'ashigaru', n: 10 }], ODA));
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 16, 0.3, 6));
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 14, 'oda'], [CAMP.x + 8, CAMP.z + 14, 'eiraku'], [CAMP.x - 26, CAMP.z + 4, 'oda'], [CAMP.x + 28, CAMP.z + 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[CAMP.x - 16, CAMP.z + 2], [CAMP.x + 18, CAMP.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const t of TORCH) rt.scene.add(tawara(W, t.x, t.z, 0.5, 2));
    // ---- 大軍（軽い作り）：上洛の織田勢と、繖山の六角勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed, kind: 'spear', host: false });
    const OT = flagTexture('oda'), ET = flagTexture('eiraku');
    DA(-40, 96, 36, 14, 260, Math.PI, 0x2b3140, OT, 15681);
    DA(46, 100, 36, 14, 260, Math.PI, 0x2b3140, ET, 15682);
    DA(0, 140, 50, 14, 300, Math.PI, 0x2b3140, OT, 15683);
    // 繖山の山腹の六角の本陣：六角義賢と旗本、後ろに控え（軽い兵）
    F.rkCamp = camp(rt, { x: KC.x, z: KC.z, facing: Math.atan2(HON_C.x - KC.x, HON_C.z - KC.z), team: 1, faction: 'imagawa', mon: 'rokkaku', armor: 0x33291f, general: { name: '六角義賢', hat: 'kabuto_m', haori: 0x33291f }, depth: true, guard: 15, reserve: 180, runTo: { x: -70, z: -130 } });

    // ---- 区域の網（siege_zones.js）：三の郭→二の丸（木戸）→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の郭（坂の上）', test: C.kuruwa.san.test, pos: sanC, need: 6, hold: 13, next: 'ni' },
        { id: 'ni', name: '二の丸（木戸構え）', test: (x, z) => F.step >= 3 && C.kuruwa.ni.test(x, z), pos: niC, need: 8, hold: 15, gate: KIDO.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: honC, need: 10, hold: 16, honmaru: true },
      ],
      links: [['san', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 1, // 遠景を数えない実兵数から城全体の八割損失を推定しない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [16, 30],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => { if (F.step >= 4) this.midB(rt); },
    });
    // ---- 城の頭（siege_ai.js）：守りは持ち場・門・退き ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanDef, at: sanC, next: 'ni' },
        { id: 'ni', butai: F.niDef, at: niC, gate: KIDO.name, next: 'hon' },
        { id: 'hon', butai: F.honDef, at: honC },
      ],
      reserves: [],
      fallback: { x: 8, z: -114 },
    });
    // 攻めの頭（軍議で作戦を選ばなければ、夜目の利かなさに揺らぎを掛けて自分で選ぶ）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 2.6, pathLen: 70, chokeWidth: 3.6 },
      { id: 'tani', defThickness: 1.2, pathLen: 90, chokeWidth: 5 },
    ];

    rt.banner('箕作攻め', '夕方。織田の四手が、箕作山へ寄せる');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の先手の一隊を預かり、攻めの下知を待て' : '藤吉郎の旗へ進み、そばで「藤吉郎の話を聞く」を押せ', 'main');
    sayKino(rt, `${nm(rt)}、あれが箕作、奥が観音寺じゃ。諸将と四方から攻めるぞ`, 5);
    rt.marker('mk1', { x: HON_C.x, z: HON_C.z }, '箕作城', { h: 6 });
    rt.marker('mk2', { x: -98, z: -156 }, '観音寺城（繖山）', { h: 8 });
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 1.6 }; });
    rt.after(8, () => { rt.unmark('mk1'); rt.unmark('mk2'); });
    for (let k = 0; k < 6; k++) rt.after(1.5 + k * 2.2, () => {
      const x = (k % 3 - 1) * 16, z = -60 - (k % 2) * 16;
      rt.army.smoke(x, rt.world.heightAt(x, z) + 1.4, z, 0, 1);
      rt.army.play('gun', { x, z }, 0.8);
      if (k % 2) rt.army.play('eshout', { x, z: z - 10 }, 0.9);
    });
    sayKino(rt, '山道を登ってきた。すぐ先の柵を破り、城への道を開くぞ', 4);
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '木下藤吉郎（話を聞く）', { person: true });
    rt.addInteract('talk', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の話を聞く', () => { rt.uninteract('talk'); sayKino(rt, 'よし、かかるぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 5 });
    rt.after(14, () => this.climb(rt));
    buildBattleJin(rt);
    [F.kino, F.niwa, F.saku, F.ram, F.gunK].forEach((g, i) => {
      const at = ROAD_OTE[i === 0 ? 4 : i === 2 ? 2 : 3];
      g.formation = 'column'; g.colW = 2;
      placeGroup(rt, g, at[0], at[1]);
    });
  },

  // ④ 日が傾く：三の郭を取ったら、松明を灯して攻め続ける
  dusk(rt) {
    const F = rt.flags;
    if (F.step >= 2.5 || F.ending || rt.over) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.setPhase('torch');
    rt.world.setTime('dusk');
    rt.banner('日が傾く', '退かぬ。松明を灯して、夜も攻め続ける');
    nextObj(rt, rt.G.lord ? `松明に火を移させ、夜攻めの支度を整えよ（${TORCH.length}つ）` : `松明の印へ進み、「松明の束に火を移す」を長く押せ（${TORCH.length}つ）`);
    rt.obj('keepSan', '三の郭へ仲間六人以上を集め、守りを残せ', 'side');
    sayKino(rt, '日が暮れるぞ！　松明の束に火を移せ。一人一本ずつ持たせるのじゃ', 3.5);
    F.torchHelp = { group: null, index: -1, hold: 0, tick: 0 };
    if (rt.G.lord) return;
    TORCH.forEach((t, i) => {
      rt.marker('t' + i, t, '松明', { h: 2 });
      rt.addInteract('t' + i, t, '松明の束に火を移す', () => this.light(rt, i), { r: 3.4, hold: 1.2 });
    });
  },
  light(rt, i, own = true) {
    const F = rt.flags;
    if (F.step !== 2.5 || F.ending || rt.over || !TORCH[i]) return;
    const t = TORCH[i];
    rt.uninteract('t' + i); rt.unmark('t' + i);
    if (F.litMask & (1 << i)) return;
    rt.world.addFire(t.x, t.z, { torch: true, h: 0.9 });
    F.litMask = (F.litMask || 0) | (1 << i);
    F.lit++;
    if (own) { F.ownLit = (F.ownLit || 0) + 1; rt.tracker.c.torch = F.ownLit; }
    if (F.lit >= TORCH.length) this.night(rt);
    else rt.objProgress('main', `灯した束 ${F.lit}／${TORCH.length}・残る松明の印へ`);
  },
  torchHelpTick(rt, dt) {
    const F = rt.flags, help = F.torchHelp;
    if (!help) return;
    help.tick += dt;
    if (help.tick < 0.5) return;
    const elapsed = help.tick; help.tick = 0;
    let i = 0;
    while (i < TORCH.length && (F.litMask & (1 << i))) i++;
    if (i >= TORCH.length) return;
    const t = TORCH[i];
    if (i !== help.index || gone(help.group) || !help.group.units.some(torchReady)) {
      let group = null, nearest = Infinity;
      for (const g of [F.niwa, F.saku, F.kino]) {
        if (gone(g)) continue;
        for (const u of g.units) {
          if (!torchReady(u)) continue;
          const d = Math.hypot(u.pos.x - t.x, u.pos.z - t.z);
          if (d < nearest) { group = g; nearest = d; }
        }
      }
      if (!group) return;
      help.group = group; help.index = i; help.hold = 0;
      group.order = 'move'; group.dest = { x: t.x, z: t.z }; group.formation = 'column'; group.colW = 2;
      group.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
    }
    const worker = help.group.units.find((u) => torchReady(u) && !(u.pinT > rt.army.time) && !u.atk && !u.swing && Math.hypot(u.pos.x - t.x, u.pos.z - t.z) < 3 && !rt.army.wallBetween(u.pos, -1, t));
    if (!worker || rt.army.nearestEnemy(worker, 6, (u) => !u.fleeing && !u.woundOut && !u.noTarget)) { help.hold = 0; return; }
    help.hold += elapsed;
    if (help.hold >= 1.2) this.light(rt, i, false);
  },
  // ⑥ 夜戦：松明を持って二の丸の木戸へ。
  night(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2.8) return;
    F.step = 2.8; F.stepT = rt.t; F.nightStarted = rt.t;
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    rt.world.setTime('night');
    const W = rt.world;
    F.torches = carryTorches(W, F.kino.units.filter((u) => u.alive && u.type === 'ashigaru').slice(0, 6));
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('夜戦', '月と松明の明かりで、二の丸へ寄せる');
    sayKino(rt, '松明を高く掲げよ。城の者に、山じゅうが織田じゃと思わせるのじゃ', 4);
    this.gateFight(rt);
  },

  // ②③ 昼過ぎ：軍議で選んだ道（無ければ攻めの頭が自分で選ぶ）で、外側の柵（三の郭）へ攻め上る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('kino'); rt.uninteract('talk');
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('外側の柵', '夕方の山道を、三の郭の柵の口へ攻め上る');
    nextObj(rt, hi(rt) ? '一隊を率い、藤吉郎の手と三の郭の守りを退け、仲間六人以上で郭を保て' : '藤吉郎の手について、三の郭の守りを退け、仲間六人以上で郭を保て');
    // 浅井新八の手が北東の尾根から寄せ、本丸の東の守りと押し合う（遠景）
    F.asai.order({ id: 'move', to: { x: 38, z: -88 } });
    rt.after(6, () => rt.bark('浅井新八の手が、北東の尾根から本丸の東へ寄せる'));
    F.strategy = window.__mitsukuriStrategy || F.strategy || null;
    if (F.strategy !== 'ote' && F.strategy !== 'tani') F.strategy = null;
    if (!F.strategy) {
      F.aiPicked = true;
      const picked = chooseRoute(F.AI_ROUTES, Math.random);
      F.strategy = (picked && picked.id) || 'ote';
      rt.bark(`攻めの頭：${F.strategy === 'tani' ? '西の谷' : '大手'}を主に攻める`);
    }
    this.runStrategy(rt, F.strategy);
    rt.player.u._sanRoad = F.strategy === 'tani' ? TANI_ATTACK_ROAD : ROAD_OTE;
    rt.marker('san', F.strategy === 'tani' ? { x: -26, z: -35 } : { x: 0, z: -44 }, F.strategy === 'tani' ? '西の谷から柵の口へ' : '三の郭の柵の口', { red: true });

  },

  // 軍議の作戦：①大手の夜攻め（正面から三の郭へ） ②谷から松明で回る（三の郭の守りを避け、二の丸の脇へ）
  runStrategy(rt, strat) {
    const F = rt.flags;
    if (strat === 'tani') {
      sayKino(rt, '西の谷は細い。南を向く守りの脇へ回れ。旗を伏せよ', 4);
      routeOld(F.kino, TANI_ATTACK_ROAD.slice(4), 2.3);
      routeOld(F.niwa, TANI_ATTACK_ROAD.slice(3), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(2, 8));   // 大手は小さく構えて引きつけるだけ
      routeOld(F.ram, TANI_ATTACK_ROAD.slice(3));
    } else {
      sayKino(rt, '大手の口は狭く、敵の槍が正面を向く。列をそろえ、三の郭へ押せ', 4);
      routeOld(F.kino, ROAD_OTE.slice(4, 9), 2.3);
      routeOld(F.niwa, ROAD_OTE.slice(3, 9), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(2, 9), 2.2);
      routeOld(F.ram, ROAD_OTE.slice(3, 9));
    }
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    routeOld(F.gunK, [...ROAD_OTE.slice(3, 8), [6, -34]]);

  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (rt.over || F.ending) return;
    if (F.SZ?.byId[id]?.owner === 'enemy') {
      F[id + 'Fell'] = false;
      rt.obj('main', '取り返された曲輪へ、仲間と戻れ', 'main');
      rt.marker(id, F.SZ.byId[id].pos, '取り返された曲輪', { red: true });
      return;
    }
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      if (!F.sanAwarded) { F.sanAwarded = true; rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた'); }
      if (F.step < 2.5) this.dusk(rt);
      else if (F.step === 2.5) rt.obj('main', `三の郭を取り返した。残る松明に火を移せ（${F.lit}／${TORCH.length}）`, 'main');
      else if (F.step < 4) {
        rt.obj('main', F.gates.kido.opened ? '三の郭を保ち、開いた木戸から二の丸へ進め' : '三の郭を保ち、木戸を破る組を守れ', 'main');
        rt.marker('gate', KIDO, F.gates.kido.opened ? '開いた木戸' : '木戸を破れ', { h: 4 });
      } else { rt.obj('main', '三の郭を保ち、仲間と本丸の守りを退けよ', 'main');
        if (!F.honFell) rt.marker('hon', F.C.kuruwa.hon.centroid, '本丸の城将の衆', { red: true });
      }
    } else if (id === 'ni' && !F.niFell) {
      F.niFell = true;
      rt.unmark('ni');
      this.inside(rt);
    } else if (id === 'hon' && !F.honFell) {
      F.honFell = true; rt.unmark('hon');
    }
  },
  // 坂を越えた後：木戸へ
  gateFight(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.banner('木戸へかかれ', '木戸を破る組が丸太を担いで進む');
    nextObj(rt, '木戸を破る組を守り、木戸を破れ');
    rt.marker('gate', KIDO, '木戸を破れ', { h: 4 });
    F.ram.assault = () => (F.gates.kido.struct.alive ? F.gates.kido.struct : null);
    F.ram.order = 'assault'; F.ram.formation = 'column'; F.ram.aggro = 2;
    for (const g of [F.kino, F.niwa, F.saku]) if (!g.routed) { g.order = 'attack'; g.seekRange = 40; }

  },
  // 木戸の内（二の丸が落ちた直後の演出）
  inside(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (F.insideSaid) { rt.obj('main', '二の丸を取り返した。仲間と本丸の守りを退けよ', 'main');
      if (!F.honFell) rt.marker('hon', F.C.kuruwa.hon.centroid, '本丸の城将の衆', { red: true }); return; }
    F.insideSaid = true; F.step = 4; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate');
    if (F.gates.kido.breached) rt.award((t) => t.side.push('木戸を破った'), '木戸を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner(F.gates.kido.breached ? '木戸、破れる' : '木戸、開く', '城将の衆が打ちかかってくる');
    sayKino(rt, '内へ押し込め！　夜が明ける前に、この山を落とすのじゃ', 3.5);
    nextObj(rt, '仲間と本丸へ進め。三の郭に六人、二の丸に八人、本丸に十人以上を集めて保て');
    for (const g of [F.kino, F.niwa, F.saku, F.ram]) if (!g.routed) { g.order = 'attack'; g.seekRange = 60; g.formation = 'line'; }
    F.ram.assault = null;
    for (const g of F.oda) if (g.count) routeOld(g, [[NI_C.x, NI_C.z], [HON_C.x, HON_C.z + 8]], 2.8);
    if (F.ram2 && F.ramNext && F.ramNext.count) { F.ramNext.assault = null; routeOld(F.ramNext, [[NI_C.x, NI_C.z], [HON_C.x, HON_C.z + 8]], 2.8); }
    rt.marker('hon', F.C.kuruwa.hon.centroid, '本丸の城将の衆', { red: true });
  },

  // 三曲輪を押さえた時だけ落城。城将一人を討っても即勝ちにはしない。
  midB(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || !F.sanFell || !F.niFell || !F.honFell) return;
    if (F.SZ) for (const z of F.SZ.zones) if (z.owner !== 'friend') return;
    F.step = 4.5; F.stepT = rt.t;
    this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('ni'); rt.unmark('hon'); rt.unmark('gate');
    rt.objDone('main'); rt.objDone('keepSan');
    if (F.ownLit) rt.award((t) => t.side.push(`松明を${F.ownLit}束灯した`), `松明を${F.ownLit}束灯し、夜攻めを支えた`);
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; if (F.nightStarted !== undefined && rt.t > F.nightStarted && rt.world.timeKey === 'night') t.special = { label: '夜のうちに箕作城を落とした', pts: 20 }; }, '任務達成・箕作城を落とした');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('六角勢、退く', '箕作城の守りが崩れた。仲間と本丸を固めよ');
    sayKino(rt, `やったぞ、${nm(rt)}！　仲間と旗のまわりを固めよ。まだ山道に敵が残っておる`, 5);
    rt.after(6, () => rt.say('', '――その夜、信長は箕作山に陣を置いた。翌十三日、六角父子の退いた観音寺城へ入った', 5));
    rt.after(11, () => rt.say('', '兵の数と細かな攻め口は、仮の復元です', 4));
    rt.player.u.invuln = true;
    rt.finish({}, 16);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.torches) F.torches.update();
    butaiTick(rt, dt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (rt.over || F.ending || !rt.player.u.alive) return;
    const pu = rt.player.u;
    if (pu.alive && pu.hp < pu.maxHp * 0.5 && (F.heavyWarnT ?? -30) + 18 < rt.t &&
      (rt.army.threats?.length || rt.army.nearestEnemy(pu, 8, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - pu.pos.y) < 3 && !rt.army.wallBetween(pu.pos, -1, o.pos)))) {
      F.heavyWarnT = rt.t;
      sayKino(rt, '傷が深い。「構え」で前からの打ち込みを受け、味方の後ろへ下がれ', 4);
    }
    updateGates();
    if (F.SZ) F.SZ.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 2 && F.asai && Math.hypot(F.asai.pos.x - F.asaiFoe.pos.x, F.asai.pos.z - F.asaiFoe.pos.z) <= 20) lightClash(F.asai, F.asaiFoe, dt, 0.06);
    if (F.step === 2.5 && (rt.G.lord || rt.t - F.stepT > 25)) this.torchHelpTick(rt, dt);
    if (F.step === 3 && F.gates.kido.opened && !F.gatePass) {
      F.gatePass = true; F.ram.assault = null;
      rt.obj('main', F.gates.kido.breached ? '破った木戸を通り、仲間と二の丸を押さえよ' : '開いた木戸を通り、仲間と二の丸を押さえよ', 'main');
      rt.marker('gate', KIDO, '木戸から二の丸へ', { h: 4 });
      for (const g of [F.kino, F.niwa, F.saku, F.ram]) if (!gone(g)) { g.order = 'attack'; g.seekRange = 50; }
    }
    if (F.honFell && F.niFell && F.sanFell) this.midB(rt);
    if (F.ending) return;
    if (F.step >= 2 && rt.t >= (F.zoneGuideAt || 0)) {
      F.zoneGuideAt = rt.t + 1;
      const id = F.step >= 4 ? 'hon' : F.step >= 3 ? 'ni' : 'san';
      const z = F.SZ?.byId[id];
      if (z && z.owner !== 'friend') {
        rt.objProgress('main', z.quietUntil > rt.t ? '城兵が奥で列を立て直している。郭へ仲間を集め、向きをそろえよ' : `${z.name}の味方 ${z.friends || 0}／${z.need}人以上・敵を退け、仲間を郭に集めて保て`);
        if (!z.enemies && (z.friends || 0) < z.need) {
          for (const g of F.oda) {
            if (gone(g) || g.order === 'path' || g.order === 'move' || g.order === 'assault') continue;
            g.order = 'move'; g.dest = { x: z.pos.x, z: z.pos.z }; g.formation = 'column'; g.colW = 2;
            g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.formation = 'yari'; };
          }
        }
      }
    }
    if (F.step === 3 && !F.gatePass) {
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = F.ramNext;
        if (g && g.count) {
          routeOld(g, [...ROAD_OTE.slice(0, 9), [KIDO.x, KIDO.z + 3]], 2.2, () => { g.order = 'assault'; g.assault = F.ram.assault; });
        }
        rt.objProgress('main', g && g.count ? '控えが丸太を拾いに向かう。木戸前で仲間と守れ' : '丸太の組が残っていない。仲間と木戸の守りを押せ');
        sayKino(rt, g && g.count ? '控えが丸太を拾いに向かう。木戸の前で守れ！' : '丸太を担ぐ者が残っておらぬ。仲間と木戸の守りを押せ！', 3);
      }
    }
    if (!F.longWarn && rt.t >= 540) { F.longWarn = true; sayKino(rt, '攻めが長引いた。三つの曲輪を保てねば、麓へ下げるぞ', 4); }
    if (rt.canFailMission() && (rt.t >= 600 || (F.step >= 2 && (gone(F.kino) || F.kinoU.woundOut))) && F.step < 4.5 && !F.ending) {
      F.ending = true; rt.tracker.main = false; rt.objFail('main');
      for (const id of ['kino', 'san', 'ni', 'hon', 'gate']) rt.unmark(id);
      rt.uninteract('talk');
      for (let i = 0; i < TORCH.length; i++) { rt.unmark('t' + i); rt.uninteract('t' + i); }
      rt.obj('retreat', '組を連れ、麓の陣へ退け', 'main');
      rt.banner('攻めを止め、麓へ退く');
      sayKino(rt, '城の守りはまだ残る。麓へ退け、組を散らすな！', 4);
      rt.finish({ scriptedEnd: true }, 8);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v === F.commander && v.group) { v.group.noRout = false; v.group.morale -= 40; if (k && k.isPlayer) rt.say('足軽', '城将を討ち取ったぞ！', 3); }
  },
  onRout(rt, g) {
    // 同じ隊が崩れ・立て直しを繰り返すと、同じ一言が十秒おきに出ていた（10/2）。隊ごとに一度・間は 9 秒あける
    const F = rt.flags;
    if (g.team !== 1 || !g.name || g._routSaid || rt.t < (F.routSayT || 0) || Math.hypot(g.center().x - rt.player.u.pos.x, g.center().z - rt.player.u.pos.z) > 35) return;
    g._routSaid = true; F.routSayT = rt.t + 9;
    rt.say('足軽', `${g.name}が${rt.flags.step >= 2.8 ? '闇の中へ' : '城の奥へ'}退いていく！`, 2.5);
  },
};

// この局地の仮の人数。討死一人を数十人に水増ししない。全軍の残数とはしない。
mitsukuri.force = () => ({ a: 10000, a0: 10000, b: 800, b0: 800 });
mitsukuri.sides = { a: { name: '織田軍（出陣時の目安）', mon: 'oda' }, b: { name: '六角軍（出陣時の目安）', mon: 'rokkaku' } };
mitsukuri.noTaishoRaid = true;   // 短い強襲では殿の守りの襲来を出さない（A059）
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・${rt.world.timeKey === 'night' ? '夜' : rt.world.timeKey === 'dusk' ? '夕暮れ' : '昼過ぎ'}`;
mitsukuri.canSkip = () => ''; // 遠くの射撃・下知・時刻を一度に飛ばさない。
mitsukuri.history = '永禄十一年（1568）九月、織田信長は足利義昭を奉じて京へ上る兵を起こした。道をふさぐ南近江の六角義賢（承禎）・義治の父子は従わず、観音寺城と、その支えの和田山城・箕作城に兵を入れた。九月十二日、信長は佐久間信盛・木下藤吉郎・丹羽長秀・浅井新八に箕作城を攻めさせた。織田勢は申の刻から攻めかかり、夜のうちに城を落とした。藤吉郎が数百の松明を灯して夜に攻め上ったという話は、のちの伝えである。その夜、信長は箕作山に陣を置き、六角父子三人が退いた観音寺城へ翌十三日に入った。信長はこのあと京へ入り、義昭は十五代将軍となった。城将の名は伝えによって違い、兵の数にも諸説ある。四手の細かな攻め口、曲輪の配置、木戸破りは推定。表示する織田一万・城兵八百は局地の仮の人数で、上洛軍全体や史料で確定した総数ではない。';
mitsukuri.lordAt = { x: 4, z: 74, r: 12, why: '箕作の麓の織田の陣（信長は諸将に夜攻めを命じた）' };
mitsukuri.lordSpawn = { x: 4, z: 70, heading: Math.PI };
mitsukuri.rts = true;

// 軍議（gungi.js）：城を回して見て、道を一つ選ぶ
mitsukuri.gungi = (rt) => {
  if (!rt.G.lord) return null; // 足軽・組頭は全軍の軍議を開かない。
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -70 }, dist: 150,
    landmarks: [
      { name: '三の郭', x: SAN_C.x, z: SAN_C.z }, { name: '木戸', x: KIDO.x, z: KIDO.z },
      { name: '二の丸', x: NI_C.x, z: NI_C.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
      { name: '西の谷', x: NISHI_TANI_X, z: -36 },
    ],
    lines: [
      { name: '三の郭', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '木下藤吉郎の攻め口', group: () => F.kino }],
    routes: [
      { id: 'ote', name: '大手の坂を正面から攻め上る' },
      { id: 'tani', name: '西の谷を忍び、柵の口の脇へ回る' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '坂の守り', known: false },
      { name: '木戸構えの弓', known: false },
      { name: '城将の衆', known: false },
    ],
    cinema: { attackers: { x: 0, z: -20 }, gate: { x: KIDO.x, z: KIDO.z }, defenders: { x: HON_C.x, z: HON_C.z } },
    onStart: (assign) => mitsukuri.onGungiStart(rt, assign),
  };
  if (window.__mitsukuriStrategy) { mitsukuri.onGungiStart(rt, { main: window.__mitsukuriStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
mitsukuri.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'ote'; };

const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
// 性格の突進で、山道・松明・木戸前の下知を上書きしない。
mitsukuri.botOrders = true;
// 負けて退く時も、任務で登った道を逆にたどる。殿から直線で斜面へ逃げない。
mitsukuri.botWithdraw = (b, inp, { goTo }) => {
  goTo(b.player, inp, CAMP.x, CAMP.z, 3);
  inp.quickCmd = 'follow';
};
mitsukuri.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然には戻らない。退避と手当ては共通の試し役の判断に任せ、任務へ戻る。
  b.botRest = false;
  if (F.step < 2) {
    const q = nearIt(b, 'talk');
    if (q) { if (q.d > 3) goTo(p, inp, q.it.pos.x, q.it.pos.z, 3); else inp.k.add('KeyE'); }
    return;
  }
  const e = strikeTarget(b, 12);
  // 斜面の向こうの兵を追い続けると、道案内と敵追いが競合して山道から進めない。
  // 届く相手へ寄り、届かない所からの打ち込みは受け、それ以外は下知の道を進む。
  if (e && (sanDirect(b.army, u, e.pos) || e.atk?.target === u ||
      e.swing?.target === u || (e.charging && e.target === u))) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 共通の頭と同じ反撃の間を保つ。性格の判断で構え直して突きを消さない。
    patientStrike(p, inp, e, d);
    // 道案内は曲がり角へ向きを替える。受ける時と反撃を待つ時は打ち手を向く。
    // 隙を待ちながら道へ向くと、構えを横から抜かれ、突きも敵へ届かない。
    if (inp.guardHold || p.botStrikeUntil > p.time || p.pending) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      inp.k.delete('KeyW');
    } else if (d > reach * 0.9) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.9);
    return;
  }
  inp.guardHold = false;
  if (F.step === 2.5) { const q = nearIt(b, 't'); if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); } return; }
  if (F.step === 3) { goTo(p, inp, 0, KIDO.z + 3, 1.5); return; }
  const tgt = !F.sanFell ? F.C.kuruwa.san.centroid : !F.niFell ? F.C.kuruwa.ni.centroid : F.C.kuruwa.hon.centroid;
  goTo(p, inp, tgt.x, tgt.z, 2);
};

export { mitsukuri };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -100, tx: 0, tz: -40, w: 30, R: 95, rise: 90 };
