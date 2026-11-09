// ======================================================================
// 徳川編 1　伏見城の戦い（慶長五年 1600・七月十九日〜八月一日）　関ヶ原の戦いの最初の戦、死守の戦
// 筋書きの正：docs/chapter3_tokugawa.md の「1. 伏見城」、docs/battle_events_1101.md
// 徳川家康は会津征伐へ発つ前、伏見城を鳥居元忠に預け「死守せよ」と別れた。石田三成らが挙兵すると、
// 宇喜多秀家・小早川秀秋・島津義弘・長束正家ら西軍四万ほどが、千八百ほどの城を囲む。城は十日あまり持ちこたえたが、
// 甲賀衆の内応で松の丸から火を放たれ、本丸へ攻め入られる。元忠は最後まで戦って討死し、城は炎上して落ちた（落ちた刻を昼ごろとも夕とも伝える）。
// 勝利条件＝時間を稼ぎ、最後まで城を守って死ぬ（城は史実どおり落ちる。主人公は元忠の手勢として持ち場を守る）。
// 段：⓪七月十九日・打って出て長束と玄以の屋敷を焼く ①七月二十二日・三の丸の虎口で宇喜多勢 ②七月二十三日・大手の曲輪の島津勢 ③七月二十九日・二の丸の口へ回る
//     ④八月一日・松の丸の甲賀衆の内応と長束・小早川勢 ⑤本丸の口で元忠と最後まで ⑥雑賀孫一の鉄砲衆
// 11/4 AP〜AT：見せかけの軍勢と目の前の乱戦（addDistantArmy・addClash）を外し、城を囲む宇喜多・小早川・島津の陣も本物の兵に。
//   総大将の宇喜多秀家は南の外の本陣から出ない。旗は徳川・宇喜多・小早川・島津と、紋の確かでない家の丸だけ。兵の比 1800：40000。
//   手本と出所：docs/battle_refs/k01_fushimi.md
// 負け方：主人公が討たれる。段ごとの刻限とは別の、二十分の保険。
// 向き：北が -z（本丸）、南が +z（大手）。西軍は南から攻め上る。
// 地形：国土地理院の標高（dem_fushimi.js・tools/dem.mjs の fushimi）。水平は実の 1/4、高さは 0.2 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_fushimi.js';
import { nobori, kagaribi, hut, dorui, tawara, takataba, jinmaku } from './props.js';
import { RANKS } from './state.js';
import { STAGES, stageNow } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { timeslipField } from './timeslip_field.js';
import { customFlag } from './b_inabayama.js';
import { revealName } from './battle_intel.js';
import { install as installYose, depthPlan as fushimiDepth } from './k01_fushimi/yose.js';   // 寄せ手の備の層・梯子・櫓の火・落城の締め（toku15 の 1）

// ---- 場所（ゲームの座標） ----
const SAN = { x: 0, z: 32 };          // 三の丸（家忠・近正の持ち場。名護屋丸は別の曲輪で、遊びでは置いていない）。主人公の持ち場の始まり
const OTE = { x: 0, z: 70 };          // 大手の曲輪
const NI = { x: 0, z: -8 };           // 二の丸
const MATSU = { x: 34, z: -20 };      // 松の丸（内応の火の手が上がる）。本丸の北東（battle_learn。前は西に置いていた）
const HON = { x: 0, z: -46 };         // 本丸
const SOUTH = { x: 0, z: 150 };       // 西軍の寄せ口
const LIMIT = 1200;   // 段ごとの刻限とは別の保険（二十分。出撃の段を足して段が十になった）
// 城を囲む西軍の陣（宇喜多＝南の外・小早川＝西・島津＝南東・石田＝南西。石田は七月二十九日に着く）
// 毛利秀元（と吉川広家）＝東。寄せ手に加わった事は確か（ja.wikipedia・日本史ウィキコーパス）だが、取り付いた方角を示す史料は無く推定（11/6 布陣の照らし合わせで、毛利の陣が無かった）
const CAMPS = [{ x: 0, z: 178 }, { x: -96, z: 30 }, { x: 92, z: 104 }, { x: -70, z: 150 }, { x: 104, z: 22 }];
// 七月十九日に城方が打って出て焼いた、長束正家・前田玄以の屋敷（大手の外の南西の町）
const YASHIKI = { x: -30, z: 104 };
const HOUSES = [[-36, 108, 0.2], [-24, 112, -0.1], [-34, 96, 0.1]];
// 寄せ手が築いた築山（大筒を据えて城を撃つ）。大手の外の南
const TSUKIYAMA = { x: 22, z: 126 };
// 太鼓の丸（上林竹庵の持ち場）：二の丸の東
const TAIKO = { x: -32, z: -6 };   // 位置を示す確かな図は無い。松の丸を北東へ移したので、二の丸の西に置く

const ROUTE = [[0, 160], [0, 130], [0, 100], [0, 84], [OTE.x, OTE.z], [0, 60], [0, 46], [SAN.x, SAN.z], [0, 20], [0, 4], [NI.x, NI.z], [0, -20], [0, -34], [HON.x, HON.z]];

const TORII = { flag: 'tokugawa' };
const WEST = { armor: 0x2c2a26, lace: 0x6a5a3a, flag: 'ukita' };
// 雑賀の鈴木家の八咫烏の旗（b_saika.js の雑賀衆と同じ絵。どちらが先に描いても同じ布になる）
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();
  });
}
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// 放置や段の保険時間では達成させない。持ち場へ本人が着き、
// 守る段は必要な在陣時間も満たしてから次へ移る。
function requirePresence(s) {
  if (s.kind === 'rest') return s;
  s.idleAdvance = false;
  s.limit = Infinity;
  const tick = s.tick;
  s.tick = (rt, C, m, ctx, el, dt) => {
    const p = rt.player.u;
    const d = C.at ? Math.hypot(p.pos.x - C.at.x, p.pos.z - C.at.z) : Infinity;
    // 味方が遠くで寄せ手を倒しただけでは、本人が敵と当たった事にしない。
    // 共通の段が残兵を崩す前に、持ち場の本人まで寄せが届いたか覚える。
    if (s.kind === 'hold' && !C.k01Engaged && p.alive && d < (C.botRadius || 14) + 8) {
      contact: for (const g of C.groups) {
        if (g.routed) continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut &&
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 30 &&
          Math.abs((u.pos.y ?? 0) - (p.pos.y ?? 0)) < 3 &&
          !rt.army.wallBetween(p.pos, p.team, u.pos, false)) {
          C.k01Engaged = true;
          break contact;
        }
      }
    }
    // 本人に寄せが届く前は、刻だけで敵の士気を削らない。
    // 波は全て出すが、接敵を待たずに残兵が崩れると達成条件を満たせなくなる。
    const holdEl = s.kind === 'hold' && !C.k01Engaged ? Math.min(el, s.max - 35 - 0.001) : el;
    const finished = tick(rt, C, m, ctx, holdEl, dt);
    if (p.alive && d < (C.botRadius || 14)) C.present = true;
    // 共通の在陣時間は持ち場の三十歩外でも増える。一瞬だけ着いて
    // 離れた後、味方だけが敵を倒しても守り抜いた扱いにはしない。
    if (s.kind === 'hold' && p.alive && d < (C.botRadius || 14) + 8) C.k01InT = (C.k01InT || 0) + dt;
    // 到着した記憶だけでは足りない。屋敷を離れた後に味方が番兵を
    // 倒しても、遠くから火を掛けたり、次の持ち場へ進めたりしない。
    return p.alive && finished && !!C.present && d < (C.botRadius || 14) + 8 && (s.kind !== 'hold' ||
      !!C.k01Engaged && d < (C.botRadius || 14) + 8 && (C.k01InT || 0) >= (s.max - 35) * 0.45);
  };
  return s;
}

// ---- 地形：木幡山の丘。南は低く、北の本丸ほど高い ----
const XY = 4, SC = 0.2, C0 = demSample(DEM, 0, 0);
function base(x, z) {
  const n = (demSample(DEM, x * XY, z * XY) - C0) * SC;
  return 3 + Math.max(-3, n) + 0.2 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
}
const lv = (cx, cz, up) => (b) => b(cx, cz) + up;
// 三の丸・二の丸・松の丸は踏み固めた土の平場にする（白い砂利の平場が真夏の日に照って、雪の曲輪に見えていた）
const PLAN = {
  mon: 'tokugawa', name: '伏見城', type: 'hirayama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  kuruwa: [
    // 大手の曲輪も石垣（柵と逆茂木の囲いでは豊臣の伏見城の大手に見えず、三の丸の虎口の前に逆茂木が並んで見えた。critic60）
    { id: 'ote', name: '大手の曲輪', level: lv(0, 70, 0.4), wall: 'ishigaki', kind: 'san', poly: rectPoly(-22, 22, 60, 84), gapAt: [[0, 84], [0, 60]], gapW: 6, floor: false },
    { id: 'san', name: '三の丸', level: lv(0, 32, 2.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-28, 28, 20, 46), gapAt: [[0, 46], [0, 20]], gapW: 5, floor: false },
    // 二の丸の東の口は松の丸と向かい合う（八月一日、寝返った甲賀衆がここを開けて二の丸へ入る。前は口が無く、甲賀衆が石垣の外に溜まって二の丸の西へ来なかった）
    { id: 'ni', name: '二の丸', level: lv(0, -8, 4.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-24, 24, -20, 4), gapAt: [[0, 4], [0, -20], [24, -12], [-24, -12]], gapW: 5, floor: false },
    { id: 'matsu', name: '松の丸', level: lv(34, -20, 4.5), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(26, 48, -32, -10), gapAt: [[26, -13]], gapW: 5, floor: false },
    { id: 'hon', name: '本丸', level: lv(0, -46, 6.5), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-20, 20, -62, -34), gapAt: [[0, -34]], gapW: 5 },
    // 西の丸（内藤家長の持ち場）：本丸の西の一段低い曲輪
    { id: 'nishi', name: '西の丸', level: lv(-40, -52, 5.2), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(-56, -26, -64, -40), gapAt: [[-26, -52]], gapW: 5 },
  ],
  // 曲輪の間を切る空堀（丘の城の伏見城。通る所だけ土橋を残す）。docs/battle_refs/k01_fushimi.md
  hori: [
    { kind: 'karabori', pts: [[-30, 53], [-7, 53]], w: 6, deep: 2.4 }, { kind: 'karabori', pts: [[7, 53], [30, 53]], w: 6, deep: 2.4 },
    { kind: 'karabori', pts: [[-30, 12], [-7, 12]], w: 6, deep: 2.6 }, { kind: 'karabori', pts: [[7, 12], [30, 12]], w: 6, deep: 2.6 },
    { kind: 'karabori', pts: [[-22, -27], [-7, -27]], w: 5, deep: 2.6 }, { kind: 'karabori', pts: [[7, -27], [24, -27]], w: 5, deep: 2.6 },
  ],
  koguchi: [
    // 大手門：御香宮の表門（伝・伏見城の大手門）の薬医門の形
    { id: 'ote_s', name: '大手門', from: 'out', to: 'ote', kind: 'hira', at: [0, 84], rot: 0, w: 5, gate: 'yakui' },
    { id: 'ote_n', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [0, 60], rot: 0, w: 5 },
    { id: 'san_s', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [0, 46], rot: 0, w: 5, gate: 'yagura' },
    { id: 'san_n', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [0, 20], rot: 0, w: 4.4 },
    { id: 'ni_s', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [0, 4], rot: 0, w: 4.4, gate: 'yagura' },
    { id: 'ni_n', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [0, -20], rot: 0, w: 4.4 },
    { id: 'hon_s', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [0, -34], rot: 0, w: 4.4, gate: 'yagura' },
  ],
  // 門へ寄る敵を横から撃つ二重の隅櫓（三の丸の表・本丸の表の角）
  yagura: [
    { id: 'san_w', kind: 'sumi', at: [-24, 42] }, { id: 'san_e', kind: 'sumi', at: [24, 42] },
    { id: 'hon_w', kind: 'sumi', at: [-16, -38] }, { id: 'hon_e', kind: 'sumi', at: [16, -38] },
  ],
  // 本丸の北西に五重の天守（慶長二年の木幡山の天守。落城で焼けた）
  lordSeat: { kind: 'tenshu', at: [-9, -53], b: 9, floors: 5, base: 4, name: '天守', where: '本丸の天守' },
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(2) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

const { way: routeWay } = routeTools(ROUTE, 'k01');
// 道の曲がり角は 1.5 歩まで寄らないと次へ移らないのに、着いたと見なす輪が 2 歩だった。
// 曲がり角の 2 歩手前（三の丸の虎口・大手の曲輪の口）で、遊ぶ頭が「着いた」と立ち止まり続けた（11/5 描いて遊んで見つけた）
// 曲輪の内か（塀・柵の線から一歩内）
const inKuruwa = (x, z) => PLAN.kuruwa.some((k) => x > k.poly[0][0] + 1 && x < k.poly[1][0] - 1 && z > k.poly[0][1] + 1 && z < k.poly[2][1] - 1);
// 城の外（曲輪の脇）から曲輪の内へ向かう者は、塀を回って大手門の前（z=96）から入る。
//   島津勢を追って大手の曲輪の東の柵の外へ出た主人公が、柵の角に突っかかったまま二の丸へ戻れず、八月一日を一人で外で過ごした
function fushimiWay(army, u, want) {
  const x = u.pos.x, z = u.pos.z;
  // 松の丸から二の丸へは、向かい合う東西の口を通る。
  // 中央の道から三十歩以上離れた甲賀・長束勢は道案内の対象外になり、
  // 口を開けただけでは二の丸の石垣へ真っすぐ進んで詰まっていた。
  if (x > 22 && x < 49 && z > -32 && z < -7 && want.x < 22 && want.z > -34 && want.z < 4) {
    const q = u._k01East || (u._k01East = { x: 0, z: -12, botRadius: 1 });
    q.x = x > 26 && Math.abs(z + 12) > 1 ? Math.max(29, x) : 20;
    q.z = -12;
    return q;
  }
  // 回り道は三の丸より南（大手の脇）の外だけ。前は二の丸と本丸の間の空堀の脇に立つ者まで大手門の前へ回され、
  //   本丸へ寄せる寄せ手が二の丸の北の石垣に溜まって、本丸の口へ一人も来なかった（11/7 描いて遊んで見つけた）
  // 空堀の土橋は左右七歩まで通れる。中央から三歩外れただけで
  // 城外扱いにすると、橋を渡る味方まで大手門の外へ引き返してしまう。
  if (z < 92 && z > 16 && Math.abs(x) > 7 && !inKuruwa(x, z) && inKuruwa(want.x, want.z)) {
    const q = u._k01Out || (u._k01Out = { x: 0, z: 0, botRadius: 1.2 });
    if (z < 90) { q.x = x; q.z = 97; } else { q.x = 0; q.z = 97; }
    return q;
  }
  const q = routeWay(army, u, want);
  if (q !== want) q.botRadius = 1;
  return q;
}
// 寄せ手の組：from から寄せる。旗はその家の紋（紋の確かでない長束・甲賀は丸。雑賀の鈴木孫一は八咫烏）
const keep = (name, from, flag, list, o = {}) => ({ name, from: { x: from.x, z: from.z }, faction: flag, width: o.width || 10, list: dress(list, { ...WEST, flag: flag === 'kobayakawa' ? 'sashi:kobayakawa:#ece6d6:#16140f' : flag }), seek: o.seek || 60, morale: o.morale || 94, ...(o.dmg ? { dmg: o.dmg } : {}) });
// 城の外の陣（本物の兵。動かずに城を囲む。総大将とその下の大将は前に出ない）
// 総大将（宇喜多秀家）は床几に座り、下の大将（小早川・島津）は馬上で旗本に囲まれる（AR3・AV7・Q）
const camp = (rt, name, at, flag, lead, list, facing, seat = false) => {
  const banner = lead === '小早川秀秋' ? 'sashi:kobayakawa:#ece6d6:#16140f' : flag;
  const g = enemyGroup(rt, { fixed: true, faction: flag, name, anchor: at, facing, order: 'hold', aggro: 3, width: 10, morale: 100, noRout: true },
    dress([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse: !seat } }, ...list], { ...WEST, flag: banner }));
  // 日付の札と使番で着陣を知った将は、遠い本陣でも既知の相手にする。
  // 頭上の名とは別に、案内の相手選びに残っていた未発見の判定をそろえる。
  revealName(rt, lead);
  if (seat) { const u = g.units.find((x) => x.name === lead); if (u) u._crouch = true; }
  // 陣は大将の頭（ai.js）に任せない。任せると「攻めよ」に替わり、床几の宇喜多秀家が本陣ごと大手の前まで出て来た（11/5 描いて遊んで見つけた）
  g.noAI = true; g.stay = true; g._home = { x: at.x, z: at.z };
  // 床几に座る本陣は、家紋を染めた陣幕で囲む（総大将の座る所が野に晒されていた）
  if (seat) rt.scene.add(jinmaku(rt.world, at.x, at.z + 1, 22, 13, 5, { mon: flag }));
  rt.scene.add(nobori(rt.world, at.x - 6, at.z + 3, banner, 6)); rt.scene.add(nobori(rt.world, at.x + 6, at.z + 3, banner, 6));
  // 11/8 critic60 伏見（十二1・二3・BR）：四万の囲みが二十〜百の兵にしか見えなかった。見せかけの兵は足さず、陣の後ろに幟の林と篝火を並べ、
  //   四方の陣の奥に大軍が控える厚みを見せる（幟と篝火は既存の形を使い回す。兵の数は変えない）
  const back = Math.atan2(at.x, at.z);   // 城（原点）から陣の外へ向かう向き
  for (let i = 0; i < 8; i++) {
    const side = (i - 3.5) * 5.5, depth = 9 + (i % 3) * 4;
    const x = at.x + Math.cos(back) * side + Math.sin(back) * depth, z = at.z - Math.sin(back) * side + Math.cos(back) * depth;
    rt.scene.add(nobori(rt.world, x, z, banner, 5 + (i % 2)));
  }
  for (const s of [-1, 1]) rt.scene.add(kagaribi(rt.world, at.x + Math.cos(back) * s * 12 + Math.sin(back) * 6, at.z - Math.sin(back) * s * 12 + Math.cos(back) * 6));
  return g;
};

const k01_fushimi = {
  // 自刃・血天井はこの戦で順に描く。共通の落城を重ねると、
  // 孫一が切腹を待つ前に「鳥居殿、討死」の知らせが割り込む。
  ownEnding: true,
  // 落城の締めと結果の札をそろえ、城方が寄せ手を退けた勝利とは呼ばない。
  winWord: '伏見城、落城',
  victoryTitle: '伏見城、落城',
  victoryCaption: '四万の寄せ手を食い止め、内府様のための時を稼いだ',
  // 身の回りの合戦の跡（timeslip_field.js）。伏見城：慶長五年七月（旧暦の初秋・新暦の八月末の残暑）。白い砂利の曲輪も寄せ手の泥と倒れた槍・矢・旗で踏み荒らす
  timeslip: {
    wet: 0.1, dust: 0.75, trample: 0.45, debris: 1.4, arrows: 1.2, workGround: true,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x9a2a20],
  },
  // 打って出る手勢と一緒に、大手の曲輪の内で大手門（南）を向いて始める。
  //   前は三の丸の奥から始め、馬の主人公だけが先に屋敷へ着き、番兵に一人で囲まれて倒れた（critic60「味方は後ろに離れていた」）
  spawn: { x: 2, z: 72, heading: 0 },
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  goalSignOnly: true,      // 地面の矢印・持ち場の輪を出さない（BH6）
  noMiniMap: true,         // 11/8 critic60（N・五2）：右上の小さな地図が出たり消えたりした。地図は出さない
  // 11/8 critic60（三2）：持ち場に立っているのに▼が遠くの「100m」を指したまま。▼は今の段の持ち場（dp の印）だけを指し、着いたら消す
  goalSignTarget(rt) {
    const D = rt.flags.dp, C = D?.on ? D.cur : null;
    const fighting = C?.s.kind === 'fight';
    // 討つ段の印は敵の組を追う赤い印。これを除くと屋敷・大手門・
    // 本丸への行き先まで消えるため、段に決めた場所を案内する。
    const m = rt.markers.find((q) => q.id === 'dp');
    const at = fighting ? C.at : m && !m.red ? m.pos?.() : null;
    if (!at) return null;
    const p = rt.player.u.pos;
    if (Math.hypot(p.x - at.x, p.z - at.z) < 12) return null;
    const T = rt.flags._gsT || (rt.flags._gsT = { x: 0, z: 0, label: '' });
    T.x = at.x; T.z = at.z;
    T.label = fighting ? (D.i === 0 ? '長束と玄以の屋敷' : D.i === 3 ? '大手門' : '本丸') : typeof m.label === 'function' ? m.label() : m.label;
    return T;
  },
  kumiLead: false,         // 組頭の印も出さない（AV15）
  noHatamotoMass: true,    // 将の後ろの軽い作りの備を置かない（AF）
  noYaguraTask: true,
  noReinforcements: true,
  // 命懸けの戦場（docs/lethal_howto.md）。籠城の怖さは本丸へ迫る寄せ手と、討ち減らされる城方
  // lethal は入れない（11/8 bot：入れると三の丸の虎口の段で止まり、十八分で任務失敗になった。入れずに流すと九分半で達成）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 二巡（徳川D）：弱めて入れる（突然の討死は二つまで・三分過ぎから）
  fearKind: { kind: '籠城', note: '曲輪を一つずつ失い、本丸へ追い詰められる', w: { honjin: 1.8, losses: 1.3 }, line: '本丸まで来るぞ！' },  // 籠城で新手の味方は来ない（減った城方の所へ「新手が追いついた」と足軽八人が湧いていた）
  // 始まりの札：軍の名に兵の数を添え、二三行の筋（「味方 徳川勢 対 敵 西軍」だけで千八百対四万が分からなかった。critic60・五4）
  depth: fushimiDepth,   // 布陣図（docs/fujin/k01_fushimi.md）：寄せ手四万の備を城の三方に（k01_fushimi/yose.js）
  introSides: { a: '徳川勢　千八百', b: '寄せ手　四万' },
  introText: '家康が会津へ発ち、鳥居元忠が伏見城を預かった。七月、石田三成らが兵を挙げ、宇喜多秀家らの寄せ手が城を囲む。城を出て長束の屋敷を焼き、三の丸・二の丸・本丸の口を順に守って時を稼ぐ。',      // 隅櫓の「中へ入り、守りを追い出せ」の脇の目標を出さない（櫓は城方の持ち場。番号の目標と二つ目の▼になっていた）
  minutes: 9,
  world: {
    seed: 1600719,
    time: 'day',
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE.slice(0, 8), ROUTE.slice(7)],
    height,
    moveWay: fushimiWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (z > 100) { c.setRGB(c.r * 0.6 + 0.22, c.g * 0.6 + 0.2, c.b * 0.5 + 0.06); return; }
      if (h > 10) c.setRGB(c.r * 0.76, c.g * 0.86, c.b * 0.72);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2) || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 16) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 18 || Math.hypot(x - TSUKIYAMA.x, z - TSUKIYAMA.z) < 12 || Math.hypot(x - TAIKO.x, z - TAIKO.z) < 9,
    trees: 380,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 9 || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 18) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 20 ? 0 : z > 100 ? 0.1 : 1.0),
    groves: [{ x: -70, z: 40, r: 16, n: 18, kind: 'sugi' }, { x: 70, z: -10, r: 16, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z > 210 : z < -150),
  },

  setup(rt) {
    crowTex();
    installYose(rt, rt.flags.k01s = {});
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 0, perchLook: TORII, interiorGuards: false, buildGates: true, buildTowers: true });
    // 門は開けた形（味方が退き、寄せ手が攻め入る道を塞がない）
    for (const g of Object.values(F.C.gateObjs || {})) { g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    for (const [x, z] of [[-8, 70], [8, 34], [-8, -6], [8, -44]]) rt.scene.add(kagaribi(W, x, z));
    // 大手の外の長束・前田玄以の屋敷（七月十九日に城方が打って出て焼く）
    for (const [x, z, r] of HOUSES) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false }));
    // 寄せ手の築山（大筒を据える盛り土）と、三の丸の前の空堀を埋める土俵（史実の昼夜の大筒・堀の埋め立て）
    rt.scene.add(dorui(W, [TSUKIYAMA.x - 7, TSUKIYAMA.z, TSUKIYAMA.x + 7, TSUKIYAMA.z], 0, -1, { w: 6, h: 2.4, bareSoil: true }));
    for (const [x, z, r] of [[12, 53, 0.1], [17, 53.6, -0.2], [-13, 52.6, 0.2]]) rt.scene.add(tawara(W, x, z, r, 6));
    // 寄せ手が押し立てた竹束（城の鉄砲を防ぐ。前＝+z を城の北へ向ける）。大手の外と大手の曲輪の脇
    for (const [x, z] of [[-14, 92], [-11.6, 92.4], [-9.2, 92.6], [9.2, 92.6], [11.6, 92.4], [14, 92], [-18, 58], [-15.6, 58.2], [15.6, 58.2], [18, 58]]) rt.scene.add(takataba(W, x, z, Math.PI));
    // 見せかけの軍勢は置かない（AA・AF・AQ6・AP9）。城を囲む西軍の陣も本物の兵。総大将の宇喜多秀家は南の外の本陣から出ない（AR3・AT3）
    // 寄せ手は段々に増える（七月二十二日 宇喜多・二十三日 小早川と島津）。陣は update で日付の段に着く
    // ---- 城方：千八百。鳥居元忠は本丸の天守の前の本陣で旗本に囲まれる。主人公は元忠の手勢として三の丸の虎口を受け持つ ----
    F.motochika = allyGroup(rt, { faction: 'tokugawa', name: '鳥居元忠の本陣', anchor: { x: -2, z: -48 }, facing: 0, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, horse: false } }, { type: 'samurai', n: 14 }], TORII));
    F.toriiU = F.motochika.units.find((u) => u.name === '鳥居元忠');
    F.motochika.stay = true;   // 本陣は本丸から出ない（共通の頭が八月一日に二の丸の敵へ出して、床几の元忠ごと本丸を空けた）
    if (F.toriiU) F.toriiU._crouch = true;   // 本丸の床几に腰を下ろす（最後の段で立って前に出る）
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: -4, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], TORII));
    F.ie = allyGroup(rt, { faction: 'tokugawa', name: '松平家忠の手', anchor: { x: 9, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], TORII));
    // 家長の持ち場は始めから西の丸（籠城の持ち場の伝え）。前は三の丸の虎口に並び、夕の段で西の丸へ戻っていた（11/6 布陣の照らし合わせ）
    F.nai = allyGroup(rt, { faction: 'tokugawa', name: '内藤家長の手', anchor: { x: -40, z: -50 }, facing: Math.PI / 2, width: 10, aggro: 6, order: 'hold', fixed: true, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '内藤元長', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 4 }], TORII));
    F.naiWest = true;
    F.nai.stay = true; F.nai.noAI = true;
    // 西の丸は家長と子の元長の父子が守った（『落穂集』・城史の伝え）。父子とも西の丸で果てる（naitoFall）
    // 三の丸は家忠と松平近正の二人の持ち場。太鼓の丸には宇治の茶師の家の上林竹庵（政重。家康に仕えた徳川方。甲賀衆ではない）
    F.chika = allyGroup(rt, { faction: 'tokugawa', name: '松平近正の手', anchor: { x: SAN.x + 22, z: SAN.z + 4 }, facing: 0, width: 8, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平近正', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }], TORII));
    F.chikuan = allyGroup(rt, { faction: 'tokugawa', name: '上林竹庵の手', anchor: TAIKO, facing: -Math.PI * 0.5, width: 6, aggro: 6, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '上林竹庵', invuln: true, horse: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }], TORII));
    // 松の丸の甲賀衆（城方として持ち場に就く。八月一日、人質を取られて寝返る）。甲賀の侍を下知したのは深尾清十郎（『落穂集』）
    F.koka = allyGroup(rt, { faction: 'tokugawa', name: '甲賀衆', anchor: { x: MATSU.x, z: MATSU.z + 2 }, facing: Math.PI / 2, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '深尾清十郎', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], TORII));
    for (const g of [F.mine, F.ie, F.nai, F.chika]) { g.defMult = 1.25; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 2, z: 69 }, 0, [{ kind: 'spear', n: Math.min(n, 12) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '伏見城の三の丸・二の丸・本丸の口を順に守り、四万の寄せ手を一日でも長く食い止めよ', 'main');
    // 全戦の通しで、始まりの二十五秒に行き先が無かった。
    // 別れの話の間から屋敷への行き先を示し、出撃の段へ引き継ぐ。
    rt.marker('dp', { x: YASHIKI.x + 2, z: YASHIKI.z - 2 }, '長束と玄以の屋敷', { h: 3 });
    // 戦の前：家康と元忠の別れ → 西軍が集まる前に、城の外の屋敷を焼きに打って出る
    // 主君は家臣を通称で呼び、三成も官名の「治部」で言う（諱の呼び捨てと今の言い回しを外した）
    rt.say('徳川家康', '彦右衛門、会津へ発つ。城を預ける。治部が兵を挙げれば、伏見は真っ先に襲われよう', 4.6);
    rt.after(5.2, () => rt.say('鳥居元忠', '城は千八百で足りまする。兵は一人でも多く、会津へ連れて行かれませ', 4.2));
    rt.after(9.8, () => rt.say('徳川家康', '……すまぬ、彦右衛門。伏見を頼むぞ', 4.2));
    // 家康との別れ（六月十八日）から開戦まで一月飛ぶ。日付を真ん中に出す（AT7）
    // 挙兵（内府ちかひの条々）は七月十七日。十九日の札で「挙兵し」と言うと日がずれる
    rt.after(14, () => rt.banner('七月十九日', '石田三成らの挙兵から二日。西の軍勢が伏見へ寄せる'));
    rt.after(14.4, () => rt.say('鳥居元忠', '城を明け渡せとの使いは追い返した。寄せ手が揃う前に打って出て、長束と玄以の屋敷を焼け', 4.2));
    rt.after(18.8, () => rt.say('松平家忠', '大手の門を出て、南西の屋敷へ！　火を掛けたら城へ戻るぞ', 4));
    // 出撃の下知を受けたら動き出す。家忠の道案内は進軍中に聞く（始まりの待ちは十五秒まで）。
    rt.after(14.8, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.sortie = true; F.a0n = Math.max(1, allyN(rt));
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // 寄せ手の出所は、屋敷から城へ戻る味方の道（大手の外 z=100 前後）より南。戻る途中で組み合い、虎口へ一人も来なかった
    // 出所は道（x=0）から三十歩の内に置く。外だと道の曲がり角を辿らずに真っすぐ歩き、大手の曲輪の柵に突っかかって外に溜まった
    const SW = { x: -22, z: 116 }, S = { x: 0, z: 116 };
    // 打って出るのは家忠の手と主人公の手勢だけ。家長・近正まで出ると、戻る前に宇喜多勢と大手の外で組み合い、虎口が空になった
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => (F.sortie ? [F.mine, F.ie] : [F.mine, ...(F.sanGuard ? [] : [F.ie, F.chika]), ...(F.naiWest ? [] : [F.nai])]), scale: 2.2, backing: false, fixedSpawn: true, dmg: 0.38, botSeek: 40,
      // 持ち場で寄せ手を待つ間は「動かない」と見なさない（四十五秒で段が飛び、虎口へ来る宇喜多勢と一度も当たらずに次へ進んでいた）
      idleWait: (r, C) => !!C.at && C.s.kind === 'hold' && Math.hypot(r.player.u.pos.x - C.at.x, r.player.u.pos.z - C.at.z) < (C.botRadius || 14) + 8 }, [
      // ⓪ 七月十九日：城方が打って出て、大手の外の長束・前田玄以の屋敷を焼く
      // 屋敷の番兵を手勢と家忠の手と一緒に追い払い、追い払ったら火を掛ける。前は着いただけで済み、番兵とは一度も当たらなかった。
      //   さらに前は近づいた時に番兵を出し、馬の主人公一人が二十四人に囲まれて十秒で倒れた（critic60）。番兵は屋敷の前に構えて待つ
      DP.fight({ at: { x: YASHIKI.x + 2, z: YASHIKI.z - 2 }, obj: '大手の門を出て、長束と玄以の屋敷の番兵を追い払え', max: 120, startSound: false,
        say: [['松平家忠', '打って出るぞ！　屋敷を敵の陣にさせるな'], ['長束の侍', '城兵が出てきたぞ！　屋敷を守れ']],
        foes: () => [keep('長束の屋敷の番兵', { x: YASHIKI.x - 4, z: YASHIKI.z + 6 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 2 }], { seek: 30, dmg: 0.26 })],
        noRefill: true,
        onEnd: (rt2) => { rt2.flags.sortie = false; this.burnYashiki(rt2); rt2.say('松平家忠', '火を掛けたぞ！　皆、城へ戻れ', 3.5); } }),
      // 時が飛ぶ：宇喜多が着き、寄せ手が段々に増える
      DP.rest({ dur: 6, heal: 0.5, banner: ['七月二十二日', '宇喜多秀家が着き、城を囲み始めた。三の丸の虎口へ'],
        say: [['松平家忠', '南の丘に宇喜多の旗！　寄せ手が日ごとに増えてゆく'], ['鳥居元忠', '三の丸の虎口で受けよ']],
        fn: (rt2) => this.camps(rt2, 1) }),
      // ① 七月二十二日：大手から寄せる宇喜多勢を、三の丸の虎口で押し返す
      // 持ち場は虎口の前（土橋と大手の奥の木戸の間）。虎口そのものだと櫓門の下に立ち、後ろの目が門の中で暗い壁しか映らなかった
      DP.hold({ at: { x: 0, z: 64 }, r: 14, dur: 50, title: '七月二十二日　大手', sub: '宇喜多勢が大手から寄せる', label: '三の丸の虎口の前', obj: '三の丸の虎口の前で、大手から寄せる宇喜多勢を押し返せ',
        say: [['鳥居元忠', '一歩も通すな。一日でも長く持ちこたえる事が、殿への土産ぞ']],
        waves: () => [
          { t: 8, say: ['宇喜多の侍', '城は小勢ぞ。一気に揉み潰せ！'], foes: () => [keep('宇喜多勢の先手', S, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }], { seek: 90 })] },
          { t: 22, say: ['宇喜多の侍', '二の手、続け！　竹束を押し立てよ'], foes: () => [keep('宇喜多勢の二の手', SW, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], { seek: 90 })] },
          { t: 34, foes: () => [keep('宇喜多勢の三の手', S, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], { seek: 90 })] },
        ],
        // 新手（AB）は足さない。三つの寄せで十分に長く、足すと刻の後に湧いた新手がすぐ崩れて「崩れた」が二百秒続いた
        noRefill: true, reward: '三の丸の虎口を守り抜いた' }),
      // ② 七月二十三日：小早川と島津が着く。島津が南東から大手の曲輪へ入る
      //   島津が入城を断られたという話は江戸時代の書物の伝えで確証が無い。台詞では事実と言い切らない
      // 島津勢は大手門の前へ寄せ、門の内外で組み合う。前は南東の島津の出所（大手の外 30 歩）から寄せ、主人公がそこまで
      //   追って行って三十人に囲まれ倒れた。城の外の野戦に見え、城を守る戦に見えなかった（critic60）。出所を門の前に寄せ、味方は門の内で構える
      DP.fight({ at: { x: 0, z: 74 }, title: '七月二十三日　島津勢', sub: '小早川と島津も着き、寄せ手は四万になった', obj: '大手門に取り付いた島津勢を討て', max: 110,
        say: [['島津の侍', '薩摩の鉄砲、撃ちかけよ！　築山の大筒に続け'], ['松平近正', '島津が大手門に取り付いたぞ。門の前で討て！']],
        foes: () => [keep('島津勢の先手', { x: 6, z: 100 }, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }], { morale: 97, dmg: 0.3 })],
        later: [{ t: 30, say: ['島津の侍', '新手じゃ！　退くな、押せ！'], foes: () => [keep('島津勢の二の手', { x: -4, z: 102 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], { dmg: 0.3 })] }],
        // 一人ずつの斬りは弱める（三十人あまりに囲まれ、命九十から槍の叩きで一度に倒れた。11/7 描いて遊んで）
        // 新手（AB）は足さない。足すと島津勢が三度湧き（三十→百十四人）、この段だけで二分近くかかった（11/6 描いて遊んで）
        noRefill: true, reward: '島津勢を大手門から追い落とした' }),
      // 時が飛ぶ：画面の真ん中に日付と次の目標を出す（AT7）
      DP.rest({ dur: 6, heal: 0.6, banner: ['七月二十九日', '石田三成が着き、総攻めが迫る。二の丸の口へ回れ'],
        say: [['松平家忠', '石田治部が伏見に着いた。明日から総攻めじゃ'], ['鳥居元忠', '三の丸は家忠と近正に任せる。そなたらは二の丸の口を固めよ']],
        fn: (rt2) => { this.camps(rt2, 3); this.guardSan(rt2); } }),
      // ③ 三の丸は家忠・近正が八月一日まで守る（史実）。主人公の手勢は二の丸の口へ回る（後ろから宇喜多勢が付け入る）
      DP.move({ to: { x: NI.x, z: NI.z + 2 }, obj: '三の丸を家忠に任せ、二の丸の口へ回れ', label: '二の丸の口', r: 9, max: 60,
        ambush: { d: 26, say: ['宇喜多の侍', '城兵が奥へ下がるぞ！　追え、付け入れ！'], foes: () => [keep('宇喜多勢の追い手', { x: 0, z: 66 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])] } }),
      // ④ 八月一日 昼：松の丸の甲賀衆が寝返って火を放ち、四方から一斉に乗り込む（西＝甲賀・長束、南＝小早川、東＝島津が太鼓の丸へ）
      // 持ち場は二の丸の道の脇（番所・蔵の建たない所）。前は建物の壁に張り付いて、寄せる甲賀衆が見えなかった
      DP.hold({ at: { x: 5, z: -12 }, r: 14, dur: 45, title: '八月一日　昼', sub: '松の丸に内応の火。寄せ手が四方から乗り込む', label: '二の丸の東', obj: '松の丸から二の丸へ入る、寝返った甲賀衆と長束勢を食い止めよ',
        // 四方から百人あまりが乗り込むので、一人ずつの斬りは弱め、鉄砲は減らす（四十人の鉄砲に囲まれ、主人公が十秒で倒れた。11/7 描いて遊んで二度）
        say: [['松平家忠', '松の丸が燃えておる！　甲賀衆が寝返ったぞ'], ['鳥居元忠', '四方から来るぞ。火に怯むな、まだ本丸がある']],
        waves: () => [
          { t: 2, say: ['長束の侍', '甲賀衆が門を開けたぞ！　二の丸へ雪崩れ込め'], foes: () => [keep('寝返った甲賀衆', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 1 }], { dmg: 0.24 }), keep('長束勢', { x: MATSU.x + 6, z: MATSU.z + 4 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], { dmg: 0.24 })] },
          { t: 12, say: ['上林竹庵', '西の太鼓の丸にも小早川が取り付いたぞ！'], foes: () => [keep('太鼓の丸へ寄せる小早川勢', { x: TAIKO.x - 22, z: TAIKO.z + 6 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 1 }], { dmg: 0.24 })] },
          { t: 20, say: ['島津の侍', '島津勢、二の丸の口を破れ！'], foes: () => [keep('二の丸の口へ寄せる島津勢', { x: 0, z: 40 }, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 1 }], { dmg: 0.24 })] },
          { t: 30, foes: () => [keep('長束勢の二の手', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 1 }], { dmg: 0.24 })] },
        ],
        noRefill: true, reward: '二の丸の東を守り抜いた' }),
      // 台詞が次の段へこぼれないよう、間を十秒とる
      DP.rest({ dur: 10, heal: 0.6, banner: ['八月一日　夕', '本丸だけが残った。本丸の口へ'],
        say: [['内藤家長', '家忠殿と近正殿、三の丸で討死！　竹庵殿も太鼓の丸で果てた。わしはこの西の丸で死ぬ'], ['鳥居元忠', '皆、本丸へ。徳川の鳥居、ここで最後を見せようぞ']],
        // 討死は家長の台詞で知らせた。使番の「討たれた」を遅れて重ねない（civ で大将討死の知らせを飛ばす）
        fn: (rt2) => { for (const n of ['松平家忠', '松平近正', '上林竹庵']) this.fall(rt2, n); this.fallAll(rt2, [rt2.flags.ie, rt2.flags.chika, rt2.flags.chikuan]); this.naitoWest(rt2); } }),
      // ⑤ 本丸の口：寄せ手が四方から本丸へ。元忠は足が利かず、刀を杖に旗本の後ろで立つ（伝え）
      // 持ち場は本丸の口の内（櫓門の下に立つと後ろの目が門の中に入り、門の前に置いた火が画面を覆っていた）
      DP.hold({ at: { x: HON.x, z: HON.z - 1 }, r: 12, dur: 32, title: '本丸', sub: '鳥居元忠、最後の抵抗', label: '本丸の口の内', obj: '本丸の口の内で元忠殿の旗本と並び、攻め入る寄せ手を食い止めよ',
        say: [['鳥居元忠', '足は利かぬが、刀を杖にまだ立てる。徳川の鳥居ここにあり！']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '本丸ぞ！　火の回らぬうちに乗っ取れ'], foes: () => [keep('本丸へ寄せる宇喜多勢', { x: 0, z: -16 }, 'ukita', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], { dmg: 0.3 })] },
          { t: 12, say: ['鳥居の侍', '西の丸が破られ、内藤殿が討死！　東の塀からも来るぞ'], foes: () => { this.naitoFall(rt); return [keep('西の丸から寄せる長束勢', { x: -14, z: -27 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }]), keep('東から寄せる島津勢', { x: 16, z: -27 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }])]; } },
          { t: 22, foes: () => [keep('本丸へ寄せる小早川勢', { x: 8, z: -18 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], { dmg: 0.3 })] },
        ],
        // 孫一の斬り込みの前に一息（手当て）。息をつく間なく四十人の鉄砲に当たり、主人公が十秒で倒れた（11/7）
        noRefill: true, reward: '本丸の口を守った', onEnd: (rt2) => rt2.player.treatWounds(0.8) }),
      // ⑥ 雑賀孫一の鉄砲衆が本丸に斬り込む
      DP.fight({ at: HON, title: '雑賀孫一', sub: '鉄砲衆を連れて本丸へ斬り込む', obj: '本丸に斬り込んだ雑賀孫一の鉄砲衆を討て', max: 70,
        say: [['雑賀孫一', '鳥居殿はいずこ！　雑賀の鈴木孫三郎、見参！'], ['鳥居元忠', '旗本ども、雑賀の鉄砲を防げ！　わしはここで受ける']],
        // 鉄砲衆は二十人ほど（三十人でも傷が重なって主人公が倒れた。11/6 描いて遊んで）。さらに前の四十人は、崩れて退く本丸の寄せ手と重なって七十人に囲まれ、主人公が十秒で倒れた。11/7）
        // 出所は本丸の口のすぐ外（前は二の丸の中で、鉄砲衆が間合いを取って二の丸へ下がり、追った主人公が傷で倒れた。11/6 夜 描いて遊んで二度）
        // 孫一（鈴木重朝）は落城の後も生きた（1623 年没）。討てない将なので、倒す数を数える鉄砲衆とは別の組で本丸の口に立つ
        foes: () => { this.magoichi(rt); return [keep('雑賀孫一の鉄砲衆', { x: 0, z: -31 }, 'yatagarasu', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 1 }], { morale: 100, seek: 40, dmg: 0.16 })]; },
        // 新手は足さない（足すと主人公の手柄の数を待って新手の鉄砲衆が湧き続け、落城の札まで四分かかった）
        noRefill: true, reward: '雑賀孫一の鉄砲衆と戦い抜いた' }),
      // ⑦ 最後の防戦（toku15 の 1・12〜15分）：旗本は討ち減らされ、元忠の周りは数人。天守の前で最後の寄せを受ける
      DP.hold({ at: { x: -4, z: -49 }, r: 10, dur: 34, title: '八月一日　夕', sub: '元忠の周りに残るのは数人', label: '天守の前', obj: '天守の前で、元忠殿の最後の盾になれ',
        say: [['鳥居元忠', 'よう戦うた。あと少し、殿のために時を稼げ']],
        waves: (rt2) => {
          const g = rt2.flags.motochika;
          if (g) { let keepN = 3; for (const u of g.units.slice()) if (u.alive && u.name !== '鳥居元忠') { if (keepN > 0) keepN--; else { u.civ = true; rt2.army.kill(u, null); } } g.anchor = { x: -5, z: -51 }; }
          return [
            { t: 3, say: ['宇喜多の侍', '天守の前に鳥居の旗！　大将はそこぞ'], foes: () => [keep('天守へ寄せる宇喜多勢', { x: 2, z: -36 }, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
            { t: 16, foes: () => [keep('天守へ寄せる小早川勢', { x: 12, z: -38 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
          ];
        },
        noRefill: true, reward: '最後まで元忠殿の盾となった' }),
    ].map(requirePresence), (rt2) => this.win(rt2));
  },

  // 段の間で果てる城方の将（使番の「討たれた」は重ねない）
  // 三の丸・太鼓の丸の手の者も持ち場で果てる（大将だけ倒すと、残った兵を追って本丸の寄せ手が三の丸へ引き返した）
  fallAll(rt, gs) {
    for (const g of gs) { if (g) g.civ = true; for (const u of (g?.units || []).slice()) if (u.alive) { u.invuln = false; u.civ = true; rt.army.kill(u, null); } }
  },
  fall(rt, n) {
    const u = rt.army.units.find((x) => x.name === n && x.alive);
    if (u) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
  },
  // 三の丸を任された家忠・近正は、主人公の二の丸への移動に付いて行かない。
  guardSan(rt) {
    const F = rt.flags;
    if (F.sanGuard) return;
    F.sanGuard = true;
    for (const [g, x] of [[F.ie, -8], [F.chika, 8]]) if (g) {
      Object.assign(g, { anchor: { x: SAN.x + x, z: SAN.z + 4 }, order: 'hold', fixed: true,
        noAI: true, stay: true, aggro: 10, facing: 0, focus: null });
    }
  },
  // 内藤家長は「西の丸で死ぬ」と言って西の丸の持ち場へ戻る（主人公と本丸へは来ない。⑤で西の丸が破られて討死）
  naitoWest(rt) {
    const F = rt.flags, g = F.nai;
    if (F.naiWest || !g) return;
    F.naiWest = true;
    Object.assign(g, { anchor: { x: -40, z: -50 }, order: 'hold', fixed: true, aggro: 6, facing: Math.PI / 2 });
  },
  // ⑤：西の丸が破られ、家長と手の者は西の丸で果てる（寄せ手が西の丸に留まって組み合わず、本丸へ向かう）
  naitoFall(rt) {
    const F = rt.flags;
    this.naitoWest(rt);
    // 隊にも civ を付ける（付けないと、果てる家長の手が「味方の兵が退き始めた」を八秒おきに四度出した）
    if (F.nai) F.nai.civ = true;
    for (const u of (F.nai?.units || []).slice()) if (u.alive) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
  },

  // 雑賀孫一と旗本：二の丸の北の脇から本丸を向いて鉄砲衆を下知する（馬上・討てない）。土橋の道は塞がない
  magoichi(rt) {
    const F = rt.flags;
    if (F.magoG) return;
    F.magoG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '雑賀孫一の旗本', anchor: { x: 13, z: -16 }, facing: Math.PI, order: 'hold', aggro: 2, width: 6, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 2 }], { ...WEST, flag: 'yatagarasu' }));
    F.magoG.noAI = true; F.magoG.stay = true;
  },

  // 長束・前田玄以の屋敷に火（七月十九日の出撃）
  burnYashiki(rt) {
    const F = rt.flags;
    if (F.yashikiBurned) return;
    F.yashikiBurned = true;
    if (rt.world.addFire) for (const [x, z] of HOUSES) rt.world.addFire(x, z, { size: 2.2, h: 2 });
  },

  // 寄せ手の陣は日付の段で着く（k=1：宇喜多。k=2：小早川・島津）
  camps(rt, k) {
    const F = rt.flags;
    if (k >= 1 && !F.ukitaCamp) F.ukitaCamp = camp(rt, '宇喜多秀家の本陣', CAMPS[0], 'ukita', '宇喜多秀家', [{ type: 'samurai', n: 16 }, { type: 'gun', n: 4 }], Math.PI, true);
    if (k >= 2 && !F.kobaCamp) {
      F.kobaCamp = camp(rt, '小早川秀秋の陣', CAMPS[1], 'kobayakawa', '小早川秀秋', [{ type: 'samurai', n: 10 }, { type: 'ashigaru', n: 6 }], Math.PI * 0.6);
      F.shimaCamp = camp(rt, '島津義弘の陣', CAMPS[2], 'shimazu', '島津義弘', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 6 }], -Math.PI * 0.8);
      F.moriCamp = camp(rt, '毛利秀元の陣', CAMPS[4], 'mori', '毛利秀元', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 4 }], -Math.PI * 0.5);
    }
    // 七月二十九日：石田三成が伏見に着き、総攻めを下知する（床几に座る。旗は大一大万大吉）
    // 長束正家（generals_toyo_toku 1：必須）：屋敷を焼かれた長束の陣は大手の南西。松の丸の甲賀衆の内応を仕掛けた（『落穂集』）
    if (k >= 2 && !F.natsukaCamp) F.natsukaCamp = camp(rt, '長束正家の陣', { x: -46, z: 186 }, 'maru', '長束正家', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 4 }], Math.atan2(46, -186));
    if (k >= 3 && !F.ishidaCamp) F.ishidaCamp = camp(rt, '石田三成の陣', CAMPS[3], 'ishida', '石田三成', [{ type: 'samurai', n: 10 }, { type: 'gun', n: 4 }], Math.atan2(-CAMPS[3].x, -CAMPS[3].z), true);
  },

  // 松の丸の甲賀衆が寝返る：城方の持ち場から消え、同じ所から「寝返った甲賀衆」として寄せる（④の波）
  turnKoka(rt) {
    const F = rt.flags;
    if (F.kokaTurned) return;
    F.kokaTurned = true;
    // 下知の深尾清十郎は寝返らず、内応の火の中で果てる（寝返りの組へは入れない）
    this.fall(rt, '深尾清十郎');
    for (const u of (F.koka?.units || []).slice()) if (u.alive) rt.army.despawn(u);
  },

  // 八月一日の昼（午の刻）：火はまず松の丸から。まだ昼の光で、本丸と天守は燃えていない
  burnMatsu(rt) {
    const F = rt.flags;
    if (F.matsuBurned) return;
    F.matsuBurned = true;
    // 火は石垣の上の建物の高さで燃やし、黒い煙の柱を高く上げる（地の高さの小さな火は石垣に隠れ、二の丸から火も煙も見えなかった。critic60）
    if (rt.world.addFire) for (const [x, z, s] of [[MATSU.x, MATSU.z, 3.2], [MATSU.x + 8, MATSU.z + 4, 2.6], [MATSU.x - 7, MATSU.z - 5, 2.4]]) rt.world.addFire(x, z, { size: s, h: 4, blackSmoke: true });
    if (rt.world.addSmokeColumn) rt.world.addSmokeColumn(MATSU.x, rt.world.heightAt(MATSU.x, MATSU.z) + 8, MATSU.z, { size: 3.4, black: true });
  },
  burn(rt) {
    const F = rt.flags;
    this.burnMatsu(rt);
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk', true);   // 八月一日の夕へ時が飛ぶ段。移ろわせずに夕の光へ
    // 天守は石垣の台（4）の上に五重。火を各重の高さに置き、天守と本丸の櫓が燃え上がって見えるように（地の高さの火だけで、天守が燃えていなかった。critic60）
    for (const [x, z, s, h] of [[NI.x - 12, NI.z - 6, 1.8, 2], [HON.x + 13, HON.z - 6, 2.2, 2], [-9, -53, 3.4, 6], [-7, -51, 3, 10], [-10, -55, 2.6, 14], [-16, -38, 2.4, 6], [16, -38, 2.4, 6]]) {
      if (rt.world.addFire) rt.world.addFire(x, z, { size: s, h, blackSmoke: h > 2 });
    }
    if (rt.world.addSmokeColumn) rt.world.addSmokeColumn(-9, rt.world.heightAt(-9, -53) + 20, -53, { size: 4, black: true });
  },

  // 本丸に火が回り、元忠が討死する。城は落ちるが、東軍が美濃へ動くための時は稼げた
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '伏見城を最後まで守った', pts: 40 }; }, '伏見城を最後まで守った');
    sfx('horagai', 0.9);
    rt.banner('伏見城、炎上', '慶長五年八月一日　本丸に火が回る');
    rt.player.u.invuln = true;
    // 元忠は足が利かず、刀を杖に腰を下ろす。孫一は敬って腹を召すのを待ったと伝わる（言行録）
    if (F.toriiU) F.toriiU._crouch = true;
    rt.after(2, () => rt.say('鳥居元忠', '殿……ご武運を。この元忠、約束どおり伏見で果てまする', 4.2));
    rt.after(6.8, () => rt.say(nm(rt), '十日あまり、四万を縫い止めましたな。内府様が西へ上られる時は稼げました', 4.2));
    rt.after(11.4, () => rt.say('雑賀孫一','鳥居殿、腹を召されるまで、ここでお待ち申す', 4.2));
    // 札の「自刃」の時に元忠も倒れる（前は札が出た後も床几に座ったままだった）
    rt.after(15.6, () => this.fall(rt, '鳥居元忠'));
    // 孫一が腹を召すのを待つ伝えと合わせ、札は「自刃」（前は「討死」で台詞と食い違っていた）
    rt.after(16, () => rt.banner('鳥居元忠、自刃', '孫一が首を取り、城方の多くが本丸で果てた'));
    F.k01s?.ending?.();   // 「伏見城　落城」→「任務達成　徳川軍の時間を稼いだ」（k01_fushimi/yose.js）
    // 戦固有の締め：落城で城方が勝鬨を上げず、共通の締めの四秒半の上限で「自刃」「血天井」の札が切れないように
    rt.finish({ scriptedEnd: true }, 35);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('時を稼げなかった', '城は早々に落ちた');
    rt.say('鳥居元忠', '持ちこたえられなんだ……殿、申し訳ございませぬ', 4);
    rt.finish({ failureReason: '刻限までに持ち場を守り切れなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    F.k01s?.tick?.(dt);
    const D = F.dp;
    // 寄せ手が日付の段で着く（巻き戻しで段が飛んでも陣は揃える）
    // 本丸の段と孫一の段の寄せ手は元忠を目当てに本丸へ寄せる（「鳥居殿はいずこ」）。共通の頭に任せると、近くの味方の組を追って三の丸の方へ百歩も下った
    if (D && D.on && D.cur && D.i >= 8 && F.toriiU) for (const g of D.cur.groups) if (!g._k01) { g._k01 = true; g.focus = F.toriiU; }
    // 守る段の刻を四十秒過ぎても、塀の外で詰まった寄せ手の残りが段を止めていた（二の丸の西で二百秒）。残りは崩れて退く
    if (D && D.on && D.cur && D.cur.s.kind === 'hold' && D.cur.k01Engaged && rt.t - D.cur.t0 > D.cur.s.max - 35 + 40) for (const g of D.cur.groups) if (g.count && !g.routed) { g.noRout = false; g.morale = 0; }
    if (D && D.i >= 1) this.camps(rt, D.i >= 5 ? 3 : D.i >= 3 ? 2 : 1);
    for (const g of [F.ukitaCamp, F.kobaCamp, F.shimaCamp, F.ishidaCamp, F.moriCamp, F.natsukaCamp]) if (g && g.count && g.order !== 'hold') { g.order = 'hold'; g.anchor = { ...g._home }; }
    // 守る段の味方は持ち場（虎口・二の丸の西・本丸の口）に踏み止まる。共通の頭は七十歩の内の敵へ持ち場から出て行かせ、
    //   宇喜多勢と大手の外で組み合って、主人公の立つ虎口へ寄せ手が一人も来なかった（九2）
    const holding = D && D.on && D.cur && D.cur.s.kind === 'hold';
    for (const g of [F.mine, ...(F.sanGuard ? [] : [F.ie, F.chika])]) if (g) g.stay = !!holding;
    // 島津の段：味方は大手門の内で構えて迎える（打って出て門の外の野で組み合い、城を守る戦に見えなかった。11/7 描いて遊んで見つけた）
    if (D && D.on && D.i === 3) for (const g of [F.mine, F.ie, F.chika]) if (g && g.count && !g._k01Ote) { g._k01Ote = true; g.order = 'hold'; g.aggro = 14; g.anchor = { x: g === F.ie ? 8 : g === F.chika ? -8 : 0, z: g === F.mine ? 80 : 77 }; }
    // 八月一日の城方は全員討死の覚悟で退かない。士気が尽きかけると共通の頭が本丸の中で「味方の方へ下がって立て直す」に替え、
    //   「味方の兵が退き始めた」が八秒おきに四度出ていた（11/6 専門家の目の六回め）
    //   手勢と元忠の本陣だけ止めても、本丸の隅櫓の上の鉄砲衆が下がって同じ知らせを出したので、城方の隊は全部
    if (D && D.on && D.i >= 6) for (const g of rt.army.groups) if (g.team === 0 && !g.civ && g.count) g.morale = Math.max(g.morale ?? 100, 70);
    // 築山の大筒：宇喜多の着陣から落城まで、昼夜に城を撃つ
    if (D && D.on && D.i >= 2 && rt.t > (F.cannonT || 0)) {
      F.cannonT = rt.t + 7 + Math.random() * 5;
      const y = rt.world.heightAt(TSUKIYAMA.x, TSUKIYAMA.z) + 3;
      sfx('thunder', 0.55);
      rt.army.smoke(TSUKIYAMA.x + (Math.random() - 0.5) * 8, y, TSUKIYAMA.z - 2, 0, -1, 1);
    }
    // 城方の鉄砲：守る段の間、虎口の脇の隅櫓と塀の上から寄せ手へ撃ち下ろす煙（塀・櫓から鉄砲の煙が一度も出なかった。critic60）
    if (holding && rt.t > (F.wallGunT || 0)) {
      F.wallGunT = rt.t + 2.5 + Math.random() * 3;
      const spots = D.i <= 3 ? [[-24, 42], [24, 42], [-12, 46], [12, 46], [-20, 60], [20, 60]] : D.i <= 7 ? [[-20, 4], [20, 4], [24, -12]] : [[-16, -38], [16, -38], [-10, -34], [10, -34]];
      for (let k = 0; k < 2; k++) {
        const [x, z] = spots[Math.floor(Math.random() * spots.length)];
        rt.army.smoke(x, rt.world.heightAt(x, z) + 4.5, z, 0, 1, 1);
      }
      sfx('volley', 0.35);
    }
    // 孫一は「雑賀の孫一、見参」と名乗って斬り込む。右上の目標で名を伏せない（伏せると「敵のいる方へ進め」に替わっていた）
    if (D && D.i >= 9 && !F.magoNamed) { F.magoNamed = true; revealName(rt, '雑賀孫一'); }
    // 八月一日 昼：松の丸の内応の火（④の段）。夕の段で本丸・天守へ火が回り、家長は西の丸へ戻る
    if (D && D.on && D.i >= 6) { this.turnKoka(rt); this.burnMatsu(rt); }
    if (D && D.on && D.i >= 7) { this.burn(rt); this.naitoWest(rt); }
    // 本丸の段：旗本が本丸の口へ出て戦う。元忠は足が利かず、刀を杖に旗本の後ろで立つ
    if (D && D.on && D.i >= 8 && !F.toriiOut && F.motochika) { F.toriiOut = true; if (F.toriiU) F.toriiU._crouch = false; F.motochika.anchor = { x: HON.x, z: HON.z }; F.motochika.aggro = 8; }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    // 落城の締めで寄せ手の本陣まで「崩れた」と叫んでいた（勝ったのは寄せ手）。締めでは言わない
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 城方の数は、始めにいた本物の城方の兵の残りの割合で千八百を割る（前は一人倒れるごとに二十五減らし、
//   八月一日夕の段でもう「0」と出て、元忠の本陣と手勢が本丸で戦っている間ずっと 0 のままだった）。寝返った甲賀衆の分も減る
const allyN = (rt) => { let n = 0; for (const u of rt.army?.units || []) if (u.alive && u.team === 0 && !u.civ && !u.isStruct && u.type !== 'dummy') n++; return n; };
k01_fushimi.force = (rt) => {
  const F = rt.flags;
  // 籠城で援軍は来ないので、出した数より増やさない（新手の足軽が追いつくと 1,562 → 1,608 と増えていた。critic60）
  const a = F.a0n ? Math.min(F.aShown ?? 1800, Math.max(10, Math.round(1800 * Math.min(1, allyN(rt) / F.a0n)))) : 1800;
  F.aShown = a;
  return { a, a0: 1800, b: Math.max(0, 40000 - (F.ek || 0) * 40), b0: 40000 };
};
// 八月一日の城方は退かない。内藤家長が西の丸で果てた時、共通の知らせが「味方の兵が退き始めた」と出していた（鳥居の侍の台詞が既に知らせている）
// 「敵の隊が崩れた」「味方の隊が崩れた」の札も出さない（八秒おきに出て、持ち場で果てる城方まで「崩れた」と出していた。森部の kaito 11/6 を全戦に）
k01_fushimi.bannerAllowed = (rt, t) => !(((rt.flags.dp?.i ?? 0) >= 6 && /味方の兵が退き始めた/.test(t)) || /隊が崩れた/.test(t));
// 本丸で城方が討ち減らされても「味方の旗へ寄れ」とは言わない（死守の城で退く先は無い）
k01_fushimi.missionDangerSpeech = (rt) => ((rt.flags.dp?.i ?? 0) >= 6 ? '味方は討ち減らされた。ここが死に場所ぞ、元忠殿の旗の下で戦え' : '味方が討ち減らされておる。持ち場の旗の下へ寄れ');
k01_fushimi.sides = { a: { name: '徳川勢', mon: 'tokugawa' }, b: { name: '寄せ手', mon: 'ukita' } };
k01_fushimi.date = (rt) => (rt.flags.burned ? '慶長五年（1600）八月一日　夕・本丸に火' : rt.flags.matsuBurned ? '慶長五年（1600）八月一日　昼・松の丸に火' : '慶長五年（1600）七月　初秋・昼');
k01_fushimi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k01_fushimi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k01_fushimi.history = '慶長五年（1600）、徳川家康は会津の上杉景勝を討つため東へ発つ前に、京の入り口の伏見城を家臣の鳥居元忠に預けた。伝えでは、家康は「城を死守してくれ」と告げ、二人は別れの盃を交わしたという。七月、石田三成らが挙兵して西軍が成った。城方は七月十九日に打って出て、城の外の長束正家・前田玄以の屋敷を焼いた。寄せ手は日ごとに増え、二十二日に宇喜多秀家、二十三日に小早川秀秋らが加わり、毛利秀元・吉川広家・小西行長・鍋島勝茂・長束正家らも寄せて四万ほどになり（攻め始めを十九日とも二十五日とも伝える）、築山に据えた大筒や鉄砲で昼夜城を撃ち、堀を埋めて迫った。城には鳥居元忠（本丸）・松平家忠と松平近正（三の丸）・内藤家長と元長の父子（西の丸）・深尾清十郎と甲賀衆（松の丸）・宇治の茶師の家の上林竹庵（太鼓の丸）・佐野綱正ら千八百ほどしかいなかったが、十日あまり持ちこたえた。八月一日の昼、甲賀衆の内応で松の丸から火の手が上がり、寄せ手は四方から一斉に乗り込んだ。元忠は足が不自由で刀を杖に戦ったと伝わり、雑賀孫一（鈴木重朝）が敬って腹を切るのを待ち、首を取ったともいう。城は炎上して落ちた（落ちた刻を昼ごろとも夕とも伝える）。城方の死者は三百数十とも八百とも全員とも伝わる。討死した者の血に染まった床板は、のちに京の寺々の天井に上げられ、血天井として今に残る。この足止めが、家康が東から戻って美濃へ進む時を稼いだ。\n島津義弘が初め城に入ろうとして断られたという話は江戸時代の書物の伝えで、確かではない。曲輪の並びと寸法は遊びのために縮めて復元したもので、内応や元忠の最期の細部は伝えにより異なる。';
k01_fushimi.bushou = [{ name: '鳥居元忠', g: /元忠/ }, { name: '雑賀孫一', g: /孫一/ }];

k01_fushimi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, 2, 72, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k01_fushimi = [['打って出て長束と玄以の屋敷を焼く'], ['三の丸の虎口の前で宇喜多勢を押し返す', dpAt(2)], ['大手門に取り付いた島津勢を討つ', dpAt(3)], ['二の丸の口へ回る', dpAt(5)], ['二の丸の東で寝返った甲賀衆と長束勢を食い止める', dpAt(6)], ['本丸の口の内で最後まで戦う', dpAt(8)], ['本丸で雑賀孫一の鉄砲衆を討つ', dpAt(9)], ['天守の前で元忠殿の最後の盾になる', dpAt(10)]];

// 目標の札に別の刻限を重ねず、実際の段の達成だけで判定する。
// 守る段と日付の切り替えでは人数を出さない。字から相手を探す
// 共通の補完に任せると、寄せの途中の人数や次の段の兵を数えてしまう。
k01_fushimi.goals5 = () => STAGES.k01_fushimi.map((s, k) => ({ kind: 'stage', k, text: s[0],
  count: (rt) => { const now = stageNow(rt); return !rt.over && now?.i === k && rt.flags.dp?.on && rt.flags.dp.cur?.s.kind === 'fight' ? now.count : null; },
  check: (rt) => (rt.over && rt.tracker?.main === true) || (stageNow(rt)?.i ?? 0) > k }));

export { k01_fushimi };
export default k01_fushimi;
