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
// 負け方：主人公が討たれる。持ち場が未達でも、経過時間だけでは落城させない。
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
import { interiorBase } from './yagura_inside.js';
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
// 脱出の行き先：本丸の裏（北）の崩れた石垣から城の外へ（正門からは出ない）
const ESC = { x: 0, z: -86 };
const STAGE_DATES = { 0: ['七月二十二日', '宇喜多勢が大手へ寄せる'], 1: ['七月二十三日', '島津勢が三の丸へ乗り込む'], 3: ['七月二十九日', '総攻めが迫る。二の丸へ'], 6: ['八月一日　昼', '松の丸に内応の火'], 8: ['八月一日　夕', '本丸に火が回る'] };
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

// 裏口の外まで道を通す。中央で終えると脱出先が道から四十歩離れ、
// 案内の対象外になって天守や北の石垣へ直進し続けていた。
const ROUTE = [[0, 160], [0, 130], [0, 100], [0, 84], [OTE.x, OTE.z], [0, 60], [0, 46], [SAN.x, SAN.z], [0, 20], [0, 4], [NI.x, NI.z], [0, -20], [0, -34], [HON.x, HON.z], [0, -62], [ESC.x, ESC.z]];

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
function requirePresence(s, contactNames = null) {
  if (s.kind === 'rest') return s;
  s.idleAdvance = false;
  s.limit = Infinity;
  // 共通の四分・七分の打ち切りでも未達の段を飛ばさない。
  // 在陣・接敵を待つ伏見では、刻だけで屋敷の放火や落城へ進めない。
  s.noHardCap = true;
  const tick = s.tick;
  s.tick = (rt, C, m, ctx, el, dt) => {
    const p = rt.player.u;
    const d = C.at ? Math.hypot(p.pos.x - C.at.x, p.pos.z - C.at.z) : Infinity;
    // 味方が遠くで寄せ手を倒しただけでは、本人が敵と当たった事にしない。
    // 共通の段が残兵を崩す前に、本人まで寄せが届いたか覚える。
    // 口へ向かう途中で迎え撃った寄せも接敵として覚える。持ち場の
    // 輪の外で甲賀衆・長束勢を退けると、戻っても相手が残らず
    // 永久に段が終わらなかった。在陣時間と達成時の場所は別に確かめる。
    if (s.kind === 'hold' && !C.k01Engaged && p.alive) {
      for (const g of C.groups) {
        if (g.routed || (contactNames && !contactNames.includes(g.name))) continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut &&
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 30 &&
          Math.abs((u.pos.y ?? 0) - (p.pos.y ?? 0)) < 3 &&
          !rt.army.wallBetween(p.pos, p.team, u.pos, false)) {
          if (contactNames) {
            // 二の丸は島津勢との接敵だけでは足りない。目標に書いた
            // 甲賀衆と長束勢を、それぞれ本人が受けた事を覚える。
            const seen = C.k01Contacts || (C.k01Contacts = {});
            seen[g.name] = true;
            C.k01Engaged = contactNames.every((name) => seen[name]);
          } else C.k01Engaged = true;
          break;
        }
      }
    }
    // 本人に寄せが届く前は、刻だけで敵の士気を削らない。
    // 波は全て出すが、接敵を待たずに残兵が崩れると達成条件を満たせなくなる。
    const holdEl = s.kind === 'hold' && !C.k01Engaged ? Math.min(el, s.max - 35 - 0.001) : el;
    // 隅櫓・破城隊の主力を退けても、壁際の残兵だけで止めない。
    // 本人が持ち場におり、後続が尽き、六割以上を崩した時だけ
    // 長く残った敵を退かせる。刻だけでは達成させない。
    if (s.kind === 'fight' && p.alive && d < (C.botRadius || 14) + 8 &&
      el > s.max + 40 && !C.later?.length && C.nTot > 0) {
      let left = 0;
      for (const g of C.groups) if (!g.routed) left += g.count;
      if (left <= C.nTot * 0.4) for (const g of C.groups) if (!g.routed && g.count) {
        g.noRout = false; g.morale = 0;
      }
    }
    const finished = tick(rt, C, m, ctx, holdEl, dt);
    if (p.alive && d < (C.botRadius || 14)) C.present = true;
    // 共通の在陣時間は持ち場の三十歩外でも増える。一瞬だけ着いて
    // 離れた後、味方だけが敵を倒しても守り抜いた扱いにはしない。
    // 寄せ手が届く前の待ち時間は含めない。遅れて接敵した直後に
    // 敵が崩れても、それまで立っていた時間だけで守備達成にしない。
    if (s.kind === 'hold' && C.k01Engaged && p.alive && d < (C.botRadius || 14) + 8) C.k01InT = (C.k01InT || 0) + dt;
    // 関所 2（11/10）：寄せが全部出て全部崩れた後も、本人が持ち場に立ち続けたら守り抜いた事にする。
    //   二の丸の西の小早川勢が石垣の外（太鼓の丸）で上林の手と斬り合ったまま崩れ、本人に届かず、段が十分以上終わらなかった
    // 甲賀衆・長束勢は両方との接敵が必須。この救済で接敵済みに替えない。
    // 持ち場を離れたら待ち直し、必要な在陣時間も水増ししない。
    if (s.kind === 'hold' && !contactNames && !C.k01Engaged && p.alive && d < (C.botRadius || 14) + 8 && C.waves && !C.waves.length &&
      C.groups.length && C.groups.every((g) => g.routed || !g.count)) {
      C.k01ClearT = (C.k01ClearT || 0) + dt;
      if (C.k01ClearT >= 12) C.k01Engaged = true;
    } else C.k01ClearT = 0;
    // 到着した記憶だけでは足りない。屋敷を離れた後に味方が番兵を
    // 倒しても、遠くから火を掛けたり、次の持ち場へ進めたりしない。
    // 敵を追い払った後は持ち場へ戻す。無関係な敵を追って塀の上で
    // 止まる対策を、時間だけの自動達成にしてはならない。
    if (finished && C.at) C.goal = C.at;
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
  stoneAllGaps: true, stoneSolid: 'player',   // 関所 2（11/10）：二つ目からの口でも石垣と塀を切り、塀の線に本人だけの当たりを置く（塀を抜けて歩けた・口の上に塀が続いていた。寄せ手まで止めると石垣の外に溜まって段が終わらなかった）
  kuruwa: [
    // 大手の曲輪も石垣（柵と逆茂木の囲いでは豊臣の伏見城の大手に見えず、三の丸の虎口の前に逆茂木が並んで見えた。critic60）
    { id: 'ote', name: '大手の曲輪', level: lv(0, 70, 0.4), wall: 'ishigaki', kind: 'san', poly: rectPoly(-22, 22, 60, 84), gapAt: [[0, 84], [0, 60]], gapW: 6, floor: false },
    { id: 'san', name: '三の丸', level: lv(0, 32, 2.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-28, 28, 20, 46), gapAt: [[0, 46], [0, 20]], gapW: 5, floor: false },
    // 二の丸の東の口は松の丸と向かい合う（八月一日、寝返った甲賀衆がここを開けて二の丸へ入る。前は口が無く、甲賀衆が石垣の外に溜まって二の丸の西へ来なかった）
    { id: 'ni', name: '二の丸', level: lv(0, -8, 4.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-24, 24, -20, 4), gapAt: [[0, 4], [0, -20], [24, -12], [-24, -12]], gapW: 5, floor: false },
    { id: 'matsu', name: '松の丸', level: lv(34, -20, 4.5), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(26, 48, -32, -10), gapAt: [[26, -13]], gapW: 5, floor: false },
    { id: 'hon', name: '本丸', level: lv(0, -46, 6.5), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-20, 20, -62, -34), gapAt: [[0, -34], [0, -62]], gapW: 5 },   // 北の口＝落城の時に主人公が抜ける、裏の崩れた石垣
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
    // 櫓門は室内・通路と同じ形を保つ。固定の扉を含む別の門を重ねない。
    // 大手門：御香宮の表門（伝・伏見城の大手門）の薬医門の形
    { id: 'ote_s', name: '大手門', from: 'out', to: 'ote', kind: 'hira', at: [0, 84], rot: 0, w: 5, gate: 'yakui' },
    { id: 'ote_n', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [0, 60], rot: 0, w: 5 },
    { id: 'san_s', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [0, 46], rot: 0, w: 5, gate: 'yagura', noKit: true },
    { id: 'san_n', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [0, 20], rot: 0, w: 4.4 },
    { id: 'ni_s', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [0, 4], rot: 0, w: 4.4, gate: 'yagura', noKit: true },
    { id: 'ni_n', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [0, -20], rot: 0, w: 4.4 },
    // 塀の隙間だけでは切岸が残る。東西からの寄せにも坂を通す。
    { id: 'ni_e', name: '二の丸の東の口', from: 'out', to: 'ni', kind: 'hira', at: [24, -12], rot: Math.PI / 2, w: 5 },
    { id: 'ni_w', name: '二の丸の西の口', from: 'out', to: 'ni', kind: 'hira', at: [-24, -12], rot: Math.PI / 2, w: 5 },
    { id: 'matsu_w', name: '松の丸の西の口', from: 'matsu', to: 'out', kind: 'hira', at: [26, -13], rot: Math.PI / 2, w: 5 },
    { id: 'hon_s', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [0, -34], rot: 0, w: 4.4, gate: 'yagura', noKit: true },
    // 隙間だけでは切岸が急なまま残る。門を建てず、崩れた石垣の
    // 通り道にも他の口と同じ坂を作って城外へつなぐ。
    { id: 'hon_n', name: '本丸の裏口', from: 'hon', to: 'out', kind: 'hira', at: [0, -62], rot: 0, w: 5 },
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

// 門下は通し、梁・渡櫓・屋根へ視点だけが入り込むのを防ぐ。
// 部品の隙間や描画の間引きに依存せず、伏見の三つの櫓門を囲う。
function fushimiGateCamera(W) {
  const previous = W.cameraBlockFraction;
  const boxes = PLAN.koguchi.filter(g => g.gate === 'yagura').flatMap(g => {
    const [x, z] = g.at, rot = g.rot || 0, w = g.w || 5;
    const y = interiorBase(W, x, z, w + 5.6, 4.2, rot);
    const gate = { x, z, y, c: Math.cos(rot), s: Math.sin(rot) };
    return [{ ...gate, hw: (w + 5.6) / 2, hz: 2.1, low: 3.325, high: 6 },
      { ...gate, hw: (w + 7.2) / 2, hz: 2.8, low: 6, high: 7.9 }];
  });
  W.cameraBlockFraction = function (from, to) {
    let hit = previous?.call(this, from, to) ?? null;
    for (const g of boxes) {
      let enter = 0, exit = 1;
      const ax = from.x - g.x, az = from.z - g.z;
      const dx = to.x - from.x, dz = to.z - from.z;
      for (let axis = 0; axis < 3; axis++) {
        const a = axis === 0 ? ax * g.c - az * g.s : axis === 1 ? from.y - g.y : ax * g.s + az * g.c;
        const d = axis === 0 ? dx * g.c - dz * g.s : axis === 1 ? to.y - from.y : dx * g.s + dz * g.c;
        const low = axis === 0 ? -g.hw : axis === 1 ? g.low : -g.hz;
        const high = axis === 0 ? g.hw : axis === 1 ? g.high : g.hz;
        if (Math.abs(d) < 1e-8) { if (a < low || a > high) { exit = -1; break; } }
        else {
          const t0 = (low - a) / d, t1 = (high - a) / d;
          enter = Math.max(enter, Math.min(t0, t1));
          exit = Math.min(exit, Math.max(t0, t1));
        }
        if (enter > exit) break;
      }
      if (enter <= exit && (hit === null || enter < hit)) hit = enter;
    }
    return hit;
  };
}

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
    // 曲輪の間（x=24〜26）へ押し出された兵も、まず口の正面へ
    // 揃える。斜めに x=20 へ向かうと、二の丸の口の脇の石垣に詰まる。
    q.x = Math.abs(z + 12) > 1 ? (x > 26 ? Math.max(29, x) : x) : 20;
    q.z = -12;
    return q;
  }
  // 太鼓の丸へ寄せた小早川勢も、西の口へ回して二の丸へ入れる。
  // 中央の道へ直進すると西の石垣（x=-24）に突き当たり、
  // 口を開けてあっても四方からの乗り込みに加われなかった。
  // 西の石垣は x=-24。すでに内側の兵まで外へ戻すと、
  // 口から外れた石垣へ向かってしまう。口の直前では横へ押し戻さず、
  // まず同じ x のまま口の正面へそろえる（東の口と同じ）。
  if (x < -24 && x > -80 && z > -32 && z < 4 && want.x > -22 && want.x < 22 && want.z > -20 && want.z < 4) {
    const q = u._k01West || (u._k01West = { x: 0, z: -12, botRadius: 1 });
    q.x = Math.abs(z + 12) > 1 ? (x < -26 ? Math.min(-29, x) : x) : -20;
    q.z = -12;
    return q;
  }
  // 関所 2（11/10）：石垣の上の塀に当たりを置いたので、曲輪の内から外の行き先へは、行き先に近い口を通って出す。
  //   大手の曲輪の北東の隅から三の丸の東の隅櫓へ真っすぐ向かい、塀の角に二十秒以上突っかかった
  for (const k of PLAN.kuruwa) {
    const [x0, z0] = k.poly[0], [x1, z1] = k.poly[2];
    const inside = (px, pz, m) => px > Math.min(x0, x1) - m && px < Math.max(x0, x1) + m && pz > Math.min(z0, z1) - m && pz < Math.max(z0, z1) + m;
    if (!inside(x, z, 2.2) || inside(want.x, want.z, 2.2)) continue;
    let best = null, bd = Infinity;
    for (const g of k.gapAt || []) { const d = Math.hypot(g[0] - want.x, g[1] - want.z) + Math.hypot(g[0] - x, g[1] - z) * 0.5; if (d < bd) { bd = d; best = g; } }
    if (!best || Math.hypot(best[0] - x, best[1] - z) < 3) break;
    const q = u._k01Gate || (u._k01Gate = { x: 0, z: 0, botRadius: 1 });
    q.x = best[0]; q.z = best[1];
    return q;
  }
  // 回り道は三の丸より南（大手の脇）の外だけ。前は二の丸と本丸の間の空堀の脇に立つ者まで大手門の前へ回され、
  //   本丸へ寄せる寄せ手が二の丸の北の石垣に溜まって、本丸の口へ一人も来なかった（11/7 描いて遊んで見つけた）
  // 大手の石垣の幅の内なら、道案内で土橋の中央へ戻す。
  // 土橋の脇（例 x=8,z=53）から南へ戻すと、大手の北の石垣に突き当たる。
  // 城外を回る者も、三の丸の幅（左右28歩）より外へ出てから南下する。
  // 関所 2（11/10）：曲輪の間の道（三の丸の門の前の土橋など）へ戻る時も同じ。塀に当たりを置いたので、大手の東の塀の外の角で突っかかった
  const onRoad = Math.abs(want.x) < 9 && want.z > 16 && want.z < 92;
  if (z < 92 && z > 16 && Math.abs(x) > 22 && !inKuruwa(x, z) && (inKuruwa(want.x, want.z) || onRoad)) {
    const q = u._k01Out || (u._k01Out = { x: 0, z: 0, botRadius: 1.2 });
    if (z >= 90) { q.x = 0; q.z = 97; }
    else if (Math.abs(x) < 31) { q.x = Math.sign(x) * 32; q.z = z; }
    else { q.x = x; q.z = 97; }
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
    dress([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse: !seat } }, ...list.map((e) => e.type === 'samurai' ? { ...e, o: { ...e.o, keep: true } } : e)], { ...WEST, flag: banner }));
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
  goalSignTriangle: true,  // 画面の端でも行き先は下向きの▼を保つ（五3）
  keepBattleSigns: true,   // 行き先の印を出している間も、武将名と両軍の数を残す（九3）
  noMiniMap: true,         // 11/8 critic60（N・五2）：右上の小さな地図が出たり消えたりした。地図は出さない
  goalsVisibleRows: 5,     // 今の目標を含む五件を順に並べる。共通の既定の一件表示では後の持ち場が分からない。
  // 11/8 critic60（三2）：持ち場に立っているのに▼が遠くの「100m」を指したまま。▼は今の段の持ち場（dp の印）だけを指し、着いたら消す
  goalSignTarget(rt) {
    const D = rt.flags.dp, C = D?.on ? D.cur : null;
    const fighting = C?.s.kind === 'fight';
    const moving = C?.s.kind === 'move';
    const holding = C?.s.kind === 'hold';
    // 討つ段の印は敵の組を追う赤い印。これを除くと屋敷・大手門・
    // 本丸への行き先まで消えるため、段に決めた場所を案内する。
    const m = rt.markers.find((q) => q.id === 'dp');
    // 二の丸へ一度着くと共通の移動段が印を外す。その後に追い手と
    // 戦って離れても、達成には持ち場へ戻る必要があるので案内を残す。
    const rest = C?.s.kind === 'rest' ? rt.flags.restNext : null;
    // 守備地点も共通の印に依存させない。印が隠れたり外れたりしても、
    // 未到着の持ち場への案内と地名を失わない。
    const at = moving ? fushimiWay(rt.army, rt.player.u, C.at) : fighting || holding ? C.at : rest || (m && !m.red ? m.pos?.() : null);
    if (!at) return null;
    const p = rt.player.u.pos;
    // 別れの間は段がまだ無い。初期位置が持ち場の十二歩内でも、
    // 開戦前の案内まで到着扱いで消さない（全戦通しの開始時の指摘）。
    // 後退・脱出の到着判定は八〜九歩。十二歩で消すと未到着の
    // 十歩手前で行き先を失うため、移動中は八歩内まで残す。
    // 最後の守備も十歩内への到着が必要。守備の輪が狭い時は、
    // その内へ入るまで案内を消さない。
    const arrivedRadius = moving ? 8 : holding ? Math.min(12, C.botRadius || 14) : 12;
    if (C && (!moving || at === C.at) && Math.hypot(p.x - at.x, p.z - at.z) < arrivedRadius) return null;
    const T = rt.flags._gsT || (rt.flags._gsT = { x: 0, z: 0, label: '' });
    T.x = at.x; T.z = at.z;
    T.label = moving && D.i === 11 && at !== C.at ? '本丸の裏口' : (fighting || moving || holding) ? (C.s.lbl || (m && typeof m.label === 'string' ? m.label : '') || '持ち場') : rest ? rest.label : typeof m.label === 'function' ? m.label() : m.label;
    return T;
  },
  kumiLead: false,         // 組頭の印も出さない（AV15）
  noHatamotoMass: true,    // 将の後ろの軽い作りの備を置かない（AF）
  noYaguraTask: true,
  noReinforcements: true,
  // 落城は任務失敗ではない。共通の十八分の打ち切りで、脱出の
  // 途中を失敗にせず、本人の生還まで城固有の段で判定する。
  pacingWait: () => true,
  // 命懸けの戦場（docs/lethal_howto.md）。籠城の怖さは本丸へ迫る寄せ手と、討ち減らされる城方
  // lethal は入れない（11/8 bot：入れると三の丸の虎口の段で止まり、十八分で任務失敗になった。入れずに流すと九分半で達成）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 二巡（徳川D）：弱めて入れる（突然の討死は二つまで・三分過ぎから）
  fearKind: { kind: '籠城', note: '曲輪を一つずつ失い、本丸へ追い詰められる', w: { honjin: 1.8, losses: 1.3 }, line: '本丸まで来るぞ！' },  // 籠城で新手の味方は来ない（減った城方の所へ「新手が追いついた」と足軽八人が湧いていた）
  // 始まりの札：軍の名に兵の数を添え、二三行の筋（「味方 徳川勢 対 敵 西軍」だけで千八百対四万が分からなかった。critic60・五4）
  depth: fushimiDepth,   // 布陣図（docs/fujin/k01_fushimi.md）：寄せ手四万の備を城の三方に（k01_fushimi/yose.js）
  introSides: { a: '徳川勢　千八百', b: '寄せ手　四万' },
  introText: '家康が会津へ発ち、鳥居元忠が伏見城を預かった。七月、石田三成らが兵を挙げ、宇喜多秀家らの寄せ手が城を囲む。援軍は来ない。外郭・二の丸・本丸と一つずつ失いながら、開城の求めを断った元忠とともに時を稼ぐ。',      // 隅櫓の「中へ入り、守りを追い出せ」の脇の目標を出さない（櫓は城方の持ち場。番号の目標と二つ目の▼になっていた）
  minutes: 13,
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
    fushimiGateCamera(W);
    // 門は開けた形（味方が退き、寄せ手が攻め入る道を塞がない）
    for (const g of Object.values(F.C.gateObjs || {})) { g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    F.tkFlags = [];
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) { const f = nobori(W, x, z, 'tokugawa', 6); rt.scene.add(f); F.tkFlags.push(f); }
    // 内藤家長の大旗（西の丸）。家長が果てた後は、旗だけが倒れている
    F.naiFlag = nobori(W, -36, -46, 'tokugawa', 8); rt.scene.add(F.naiFlag);
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
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, horse: false } }, { type: 'samurai', n: 14, o: { keep: true } }], TORII));
    F.toriiU = F.motochika.units.find((u) => u.name === '鳥居元忠');
    F.motochika.stay = true;   // 本陣は本丸から出ない（共通の頭が八月一日に二の丸の敵へ出して、床几の元忠ごと本丸を空けた）
    if (F.toriiU) F.toriiU._crouch = true;   // 本丸の床几に腰を下ろす（最後の段で立って前に出る）
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: -4, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], TORII));
    F.ie = allyGroup(rt, { faction: 'tokugawa', name: '松平家忠の手', anchor: { x: 9, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, horse: true } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], TORII));
    // 家長の持ち場は始めから西の丸（籠城の持ち場の伝え）。前は三の丸の虎口に並び、夕の段で西の丸へ戻っていた（11/6 布陣の照らし合わせ）
    F.nai = allyGroup(rt, { faction: 'tokugawa', name: '内藤家長の手', anchor: { x: -40, z: -50 }, facing: Math.PI / 2, width: 10, aggro: 6, order: 'hold', fixed: true, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '内藤元長', invuln: true, horse: true } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 6 }], TORII));   // 家長は鉄砲隊を指揮して射撃の線を保つ（指示書）
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
    rt.flags.k01Date = '六月十八日';
    rt.setPhase('brief');
    // 11/10 docs/fushimi_spec_1109.md：守り切る戦でなく「城を失うまでの時間を売る」戦。目標は「伏見城を守れ」とだけ言う（守り切れとは言わない）
    rt.obj('main', '伏見城を守れ', 'main');
    // 行き先のピンは始めから切らさない（関所 3）。別れの間も、最初の持ち場（大手の曲輪）を指す
    rt.marker('dp', { x: 0, z: 64 }, '大手の曲輪', { h: 3 });
    // ---- 戦の前：家康の出立。長い説明はしない（「頼む」「は。」）。家康は旗本と大手門から出て、門が閉まる（k01_fushimi/yose.js が家康を動かす）
    rt.say('徳川家康', '彦右衛門。……頼む', 3.2);
    rt.after(3.6, () => rt.say('鳥居元忠', 'は。', 2.2));
    rt.after(6.4, () => rt.say(nm(rt), '（この城は、捨て石になる）', 3.4));
    rt.after(21, () => { this.shut(rt, 'ote_s'); sfx('knock', 0.7); });
    rt.after(22.4, () => rt.say('鳥居の侍', '行かれましたな。', 2.6));
    rt.after(25.4, () => rt.say('鳥居元忠', 'ああ。', 2.2));
    // ---- 包囲されていく（南→西→東と、遠くの旗が増える）
    rt.after(28, () => { rt.flags.k01Date = '七月十九日'; rt.banner('七月十九日', '西の軍勢が伏見へ寄せる'); });
    // 小早川・島津・毛利の本陣は二十三日の段で着く。包囲の
    // 声だけで先に全陣を出すと、日付に合わせた着陣を壊してしまう。
    rt.after(31.5, () => rt.say('鳥居の侍', '……多いな。', 2.6));
    rt.after(35, () => rt.say('使番', '全周、敵勢！', 2.8));
    rt.after(38, () => { rt.say('鳥居元忠', '城を明け渡せとの使いは追い返した。', 3.2); });
    rt.after(41.5, () => this.begin(rt));
  },

  // 門を閉めた絵にする（通り道は塞がない。寄せ手が破って入る時に開ける）
  shut(rt, id) {
    const g = rt.flags.C?.gateObjs?.[id], d = g && (g.door || g.mesh);
    if (d?.userData?.close) d.userData.close();
  },
  unshut(rt, id) { const g = rt.flags.C?.gateObjs?.[id]; if (g?.open) g.open(); },
  // 時間稼ぎの内部の値（DELAY_PROGRESS 0→100）。画面には出さず、使番の知らせと戦後の評価で見せる
  delay(rt, v) {
    const F = rt.flags;
    F.delay = Math.min(100, (F.delay || 0) + v);
    const lines = [[25, '徳川本隊、さらに東へ。'], [50, '敵軍、ここで足止めされております。'], [75, 'もう少しです。']];
    for (const [k, t] of lines) if (F.delay >= k && !(F.delaySaid || (F.delaySaid = {}))[k]) { F.delaySaid[k] = true; rt.after(1.5, () => rt.say('使番', t, 3)); break; }
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.a0n = Math.max(1, allyN(rt)); F.delay = 0;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    rt.say('鳥居元忠', '持ち場につけ！', 2.6);
    const SW = { x: -22, z: 116 }, S = { x: 0, z: 116 };
    const stages = [
      // ⓪ 外郭（2〜5分）：大手の曲輪で宇喜多勢を受ける。まだ「守れている」
      DP.hold({ at: { x: 0, z: 64 }, r: 14, dur: 46, label: '大手の曲輪', obj: '大手の曲輪を守れ',
        say: [['鳥居の侍', '来たぞ！']],
        waves: () => [
          { t: 6, say: ['宇喜多の侍', '大手門を破れ！　一気に揉み潰せ'], foes: () => { this.unshut(rt, 'ote_s'); sfx('knock', 0.9); return [keep('宇喜多勢の先手', S, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }], { seek: 90 })]; } },
          { t: 20, foes: () => [keep('宇喜多勢の二の手', SW, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], { seek: 90 })] },
          { t: 32, foes: () => [keep('宇喜多勢の三の手', S, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], { seek: 90 })] },
        ],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 15) }),
      // ① 東の隅櫓：梯子で石垣を越えた島津勢が三の丸の東へ入る（敵は一方向でない）
      DP.fight({ at: { x: 16, z: 38 }, obj: '三の丸の東の隅櫓を救え', max: 90,
        say: [['使番', '東の隅櫓に梯子！　島津が乗り込みます！']],
        foes: () => [keep('梯子を越えた島津勢', { x: 20, z: 40 }, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }], { morale: 97, dmg: 0.26, seek: 30 })],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 8) }),
      // ② 破城隊：掛矢と丸太で三の丸の門を叩く寄せ手
      DP.fight({ at: { x: 0, z: 52 }, obj: '三の丸の門で破城隊を止めろ', max: 90,
        say: [['鳥居の侍', '門を叩いておるぞ！　破城隊じゃ']],
        foes: () => { sfx('crash', 0.8); return [keep('三の丸の門を破る破城隊', { x: 0, z: 62 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dmg: 0.26, seek: 30 })]; },
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 8); rt2.say('使番', '大手、破られました！', 2.8); rt2.after(3, () => rt2.say('使番', '西側も敵が入りました！', 2.8)); } }),
      // ③ 最初の後退：二の丸へ。追って来る寄せ手を後ろで止める殿
      DP.move({ to: { x: NI.x, z: NI.z + 2 }, obj: '二の丸へ退け', label: '二の丸の口', r: 9, max: 70,
        say: [['鳥居元忠', '二の丸へ！']],
        ambush: { d: 26, say: ['宇喜多の侍', '城兵が退くぞ！　付け入れ！'], foes: () => [keep('宇喜多勢の追い手', { x: 0, z: 58 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }])] } }),
      // ④ 門を閉め、数秒の静けさ → 外から門を叩く音「また来る。」
      DP.rest({ dur: 10, heal: 0.5, next: { x: -14, z: -7, label: '二の丸の西' },
        fn: (rt2) => {
          this.shut(rt2, 'ni_s'); this.delay(rt2, 10);
          for (const k of [4, 5.4, 6.8, 8.2]) rt2.after(k, () => sfx('knock', 0.8));
          rt2.after(5, () => rt2.say(nm(rt2), 'また来る。', 2.4));
        } }),
      // ⑤ 二の丸の西：松平家忠の持ち場へ救援。一緒に押し返す（持ち場は z=-7 の空いた帯。z=-12〜-16 には厩と蔵が建つ）
      DP.hold({ at: { x: -14, z: -7 }, r: 12, dur: 40, label: '二の丸の西', obj: '二の丸の西で家忠殿と押し返せ',
        say: [['松平家忠', '来てくれたか！　西の口が持たぬ']],
        waves: () => [
          { t: 3, foes: () => { this.unshut(rt, 'ni_s'); return [keep('二の丸の西へ寄せる小早川勢', { x: TAIKO.x - 20, z: TAIKO.z - 4 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 1 }], { dmg: 0.24 })]; } },
          { t: 18, foes: () => [keep('二の丸の口を破った宇喜多勢', { x: 0, z: 14 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dmg: 0.24 })] },
        ],
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 12); rt2.say('松平家忠', 'ここは任せろ。', 2.6); } }),
      // ⑥ 別の方向から突破：松の丸の甲賀衆が寝返り、二の丸の東へ。少し後に家忠の討死を使番が知らせる（戻らない）
      DP.hold({ at: { x: 8, z: -7 }, r: 14, dur: 42, label: '二の丸の東', obj: '二の丸の東を食い止めよ',
        say: [['鳥居の侍', '松の丸が燃えておる！　甲賀衆が寝返ったぞ']],
        waves: () => [
          { t: 2, foes: () => [keep('寝返った甲賀衆', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 1 }], { dmg: 0.24 }), keep('長束勢', { x: MATSU.x + 6, z: MATSU.z + 4 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], { dmg: 0.24 })] },
          { t: 22, say: ['使番', '松平殿、討死！'], foes: () => { this.ieFall(rt); return [keep('二の丸の西を破った小早川勢', { x: -18, z: -8 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { dmg: 0.24 })]; } },
        ],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 12) }),
      // ⑦ 本丸へ退く
      DP.move({ to: { x: HON.x, z: HON.z + 4 }, obj: '本丸へ退け', label: '本丸の口', r: 8, max: 70,
        say: [['鳥居元忠', '本丸へ。門を閉めよ']],
        ambush: { d: 20, say: ['島津の侍', '残るは本丸ぞ！'], foes: () => [keep('二の丸を乗っ取った島津勢', { x: 0, z: -14 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }])] } }),
      // ⑧ 本丸だけが残る。援軍は来ない。内藤の大旗が西の丸に倒れている
      DP.rest({ dur: 14, heal: 0.6, next: { x: HON.x, z: HON.z - 1, label: '本丸' },
        fn: (rt2) => {
          this.shut(rt2, 'hon_s'); this.burn(rt2); this.naitoFall(rt2);
          for (const nn of ['松平近正', '上林竹庵']) this.fall(rt2, nn);
          this.fallAll(rt2, [rt2.flags.chika, rt2.flags.chikuan]);
          rt2.after(1, () => rt2.say('若い兵', '援軍は来ますか？', 2.6));
          rt2.after(5.5, () => rt2.say('使番', '援軍は……ございませぬ。', 2.8));
          rt2.after(8.8, () => rt2.say('鳥居元忠', 'そうか。', 2.2));
          for (const k of [10, 11.5, 13]) rt2.after(k, () => sfx('knock', 0.9));
        } }),
      // ⑨ 本丸：敵が中へ入る。元忠も前に出る。「殿、奥へ！」に退かない
      DP.hold({ at: { x: HON.x, z: HON.z - 1 }, r: 12, dur: 36, label: '本丸', obj: '本丸で最後まで持ちこたえろ',
        say: [['鳥居の侍', '殿、奥へ！'], ['鳥居元忠', '退かぬ。']],
        waves: () => [
          { t: 2, foes: () => { this.unshut(rt, 'hon_s'); sfx('crash', 0.8); return [keep('本丸へ寄せる宇喜多勢', { x: 0, z: -16 }, 'ukita', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], { dmg: 0.28 })]; } },
          { t: 14, foes: () => [keep('西の丸から寄せる長束勢', { x: -14, z: -27 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }]), keep('東から寄せる島津勢', { x: 16, z: -27 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }])] },
          { t: 24, foes: () => [keep('本丸へ寄せる小早川勢', { x: 8, z: -18 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }], { dmg: 0.28 })] },
        ],
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 13); rt2.player.treatWounds(0.8); } }),
      // ⑩ 最後の防衛：元忠と並んで戦う。周りの味方が一人ずつ倒れる
      DP.hold({ at: { x: -4, z: -49 }, r: 10, dur: 30, label: '元忠殿の旗', obj: '本丸で最後まで持ちこたえろ',
        say: [['鳥居の侍', 'ここまでですか。'], ['古参の侍', 'まだだ。殿がおられる。']],
        waves: (rt2) => {
          this.thin(rt2);
          return [
            { t: 3, foes: () => [keep('天守へ寄せる宇喜多勢', { x: 2, z: -36 }, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
            { t: 15, foes: () => [keep('天守へ寄せる小早川勢', { x: 12, z: -38 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
          ];
        },
        noRefill: true, onEnd: (rt2) => {
          this.delay(rt2, 12);
          rt2.say('鳥居元忠', 'ここでよい。', 2.6);
          rt2.after(3, () => rt2.say('鳥居元忠', '行け。', 2.2));
        } }),
      // ⑪ 脱出：正門でなく本丸の裏の崩れた石垣から、数人で城の外へ。振り返ると元忠の旗の周りに敵が集まる
      DP.move({ to: ESC, obj: '本丸の裏口から城を抜けよ', label: '城の外', r: 8, max: 90,
        say: [['鳥居の侍', 'こちらへ！　裏の石垣が崩れております']],
        ambush: { t: 4, foes: () => { this.lastStand(rt); return []; } } }),
    ];
    const LBL = { 0: '大手の曲輪', 1: '東の隅櫓', 2: '三の丸の門', 3: '二の丸の口', 5: '二の丸の西', 6: '二の丸の東', 7: '本丸の口', 9: '本丸', 10: '元忠殿の旗', 11: '城の外' };
    stages.forEach((s, i) => { s.lbl = LBL[i] || ''; });
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => [F.mine, ...(F.ieAway ? [] : [F.ie]), ...(F.sanGuard ? [] : [F.chika])], scale: 2.2, backing: false, fixedSpawn: true, dmg: 0.38, botSeek: 40,
      routeFight: true, withdrawWay: fushimiWay,
      botFoeAllowed: (u) => !!F.dp?.cur?.groups.includes(u.group),
      idleWait: (r, C) => !!C.at && C.s.kind === 'hold' && Math.hypot(r.player.u.pos.x - C.at.x, r.player.u.pos.z - C.at.z) < (C.botRadius || 14) + 8 },
    stages.map((s, i) => {
      if (s.kind === 'rest' && s.next) { const st = s.start; s.start = (r, C, m, ctx) => { st(r, C, m, ctx); r.flags.restNext = s.next; }; }
      return requirePresence(s, i === 6 ? ['寝返った甲賀衆', '長束勢'] : null);
    }), (rt2) => this.win(rt2));
  },

  // 家忠は二の丸の西で果てる（使番が知らせる。主人公は見ていない）
  ieFall(rt) {
    const F = rt.flags;
    this.fall(rt, '松平家忠');
    this.fallAll(rt, [F.ie]);
  },
  // 最後の防衛：元忠の本陣も手勢も、数人を残して倒れていく（一人ずつ）
  thin(rt) {
    const F = rt.flags;
    const list = [];
    for (const g of [F.motochika, F.mine]) if (g) { let keepN = g === F.motochika ? 3 : 2; for (const u of g.units) if (u.alive && u.name !== '鳥居元忠') { if (keepN > 0) keepN--; else list.push(u); } }
    list.forEach((u, k) => rt.after(1 + k * 1.6, () => { if (u.alive && !F.ending) { u.civ = true; rt.army.kill(u, null); } }));
    if (F.motochika) F.motochika.anchor = { x: -5, z: -51 };
  },
  // 脱出の間：元忠の旗の周りに寄せ手が集まる（雑賀の鈴木孫三郎＝重朝が対峙する）
  lastStand(rt) {
    const F = rt.flags;
    if (F.lastG) return;
    this.magoichi(rt);
    revealName(rt, '雑賀孫一');
    rt.say('雑賀孫一', '雑賀の鈴木孫三郎、見参！', 2.6);
    if (F.magoG) Object.assign(F.magoG, { anchor: { x: 4, z: -44 }, facing: Math.PI });
    F.lastG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '元忠の旗に群がる寄せ手', anchor: { x: -3, z: -44 }, facing: Math.PI, order: 'hold', aggro: 2, width: 8, morale: 100, noRout: true },
      dress([{ type: 'samurai', n: 6 }, { type: 'gun', n: 4 }], { ...WEST, flag: 'yatagarasu' }));
    F.lastG.noAI = true; F.lastG.stay = true; F.lastG.civ = true;
    for (const u of F.lastG.units) u.civ = true;
    let keepN = 2;
    for (const u of (F.mine?.units || []).slice()) if (u.alive) { if (keepN > 0) { keepN--; continue; } u.civ = true; rt.army.kill(u, null); }
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
    if (F.naiFlag) { F.naiFlag.rotation.z = 1.4; F.naiFlag.position.y += 0.4; }
  },

  // 雑賀孫一と旗本：二の丸の北の脇から本丸を向いて鉄砲衆を下知する（馬上・討てない）。土橋の道は塞がない
  magoichi(rt) {
    const F = rt.flags;
    if (F.magoG) return;
    F.magoG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '雑賀孫一の旗本', anchor: { x: 13, z: -16 }, facing: Math.PI, order: 'hold', aggro: 2, width: 6, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'gun', n: 2 }], { ...WEST, flag: 'yatagarasu' }));
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

  // 城の外から落ちた伏見城を見る：元忠の旗の周りに敵、元忠討死、徳川の旗が下がり寄せ手の旗が上がる。使番「徳川本隊は無事、東へ。」
  // 落城の瞬間に負けの札は出さない（任務達成）
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    this.lastStand(rt);
    rt.setPhase('end');
    rt.objDone('main');
    const dl = Math.round(Math.max(F.delay || 0, 60));
    rt.award((t) => { t.main = true; t.special = { label: `時を稼いだ（${dl}／100）`, pts: 20 + Math.round(dl / 5) }; }, '伏見城で時を稼いだ');
    rt.player.u.invuln = true;
    rt.after(0.5, () => rt.say('雑賀孫一', '腹を召されるまで、お待ち申す。', 2));
    rt.after(2.5, () => {
      this.fall(rt, '鳥居元忠');
      sfx('fall', 0.8);
      for (const f of F.tkFlags || []) f.visible = false;
      for (const [x, z] of [[-8, -46], [8, -46], [0, -8], [-12, 28], [12, 28]]) rt.scene.add(nobori(rt.world, x, z, 'ukita', 6));
    });
    rt.after(3.5, () => rt.banner('鳥居元忠、自刃', '孫一が首を取り、城方の多くが本丸で果てた'));
    rt.after(6.5, () => rt.banner('血天井', '城兵の血に染まった床板は、のちに京の寺々へ伝わる'));
    rt.after(8.5, () => { sfx('messenger', 0.7); rt.say('使番', '徳川本隊は無事、東へ。', 3.4); });
    F.k01s?.ending?.();   // 「伏見城　落城」→「任務達成」（k01_fushimi/yose.js）
    rt.finish({ scriptedEnd: true }, 24);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    F.k01s?.tick?.(dt);
    const D = F.dp;
    const i = D && D.on ? D.i : -1;
    // 段の替わり目：外郭を退く時、近正は三の丸に残り、家忠は二の丸の西の持ち場へ先に回る
    if (i !== F.lastI) {
      F.lastI = i;
      // 別れから包囲、内応、落城へ時が飛ぶ所は日付を知らせる。
      if (STAGE_DATES[i]) { F.k01Date = STAGE_DATES[i][0]; rt.banner(...STAGE_DATES[i]); }
      if (i === 3) this.guardSan(rt);
      if (i === 3 && F.ie && !F.ieAway) { F.ieAway = true; Object.assign(F.ie, { anchor: { x: -17, z: -7 }, order: 'hold', fixed: true, stay: true, noAI: true, aggro: 10, facing: Math.PI / 2, focus: null }); }
      if (D?.cur?.s.kind !== 'rest') F.restNext = null;
    }
    // 守る段の間、持ち場で戦っていれば時が稼げる（内部の値。画面には出さない）
    if (D?.cur?.s.kind === 'hold' && D.cur.k01Engaged && rt.player.u.alive &&
      Math.hypot(rt.player.u.pos.x - D.cur.at.x, rt.player.u.pos.z - D.cur.at.z) < (D.cur.botRadius || 14) + 8) this.delay(rt, dt * 0.12);
    // 本丸の段からの寄せ手は元忠を目当てに本丸へ寄せる
    if (i >= 9 && D.cur && F.toriiU) for (const g of D.cur.groups) if (!g._k01) { g._k01 = true; g.focus = F.toriiU; }
    // 守る段の刻を四十秒過ぎても、塀の外で詰まった寄せ手の残りが段を止めていた。残りは崩れて退く
    if (i >= 0 && D.cur && D.cur.s.kind === 'hold' && D.cur.k01Engaged && rt.t - D.cur.t0 > D.cur.s.max - 35 + 40) for (const g of D.cur.groups) if (g.count && !g.routed) { g.noRout = false; g.morale = 0; }
    // 石田の着陣は七月二十九日の知らせとそろえる。開戦直後に
    // 全陣を出すと、二十二日の段から石田三成が城を囲んでしまう。
    if (F.begun) this.camps(rt, i >= 3 ? 3 : i >= 1 ? 2 : 1);
    for (const g of [F.ukitaCamp, F.kobaCamp, F.shimaCamp, F.ishidaCamp, F.moriCamp, F.natsukaCamp]) if (g && g.count && g.order !== 'hold') { g.order = 'hold'; g.anchor = { ...g._home }; }
    const holding = i >= 0 && D.cur && D.cur.s.kind === 'hold';
    for (const g of [F.mine, ...(F.ieAway ? [] : [F.ie]), ...(F.sanGuard ? [] : [F.chika])]) if (g) g.stay = !!holding;
    // 城方は退かない（「味方の兵が退き始めた」を出さない）
    if (i >= 5) for (const g of rt.army.groups) if (g.team === 0 && !g.civ && g.count) g.morale = Math.max(g.morale ?? 100, 70);
    // 築山の大筒：包囲から落城まで、昼夜に城を撃つ
    if (F.begun && rt.t > (F.cannonT || 0)) {
      F.cannonT = rt.t + 7 + Math.random() * 5;
      const y = rt.world.heightAt(TSUKIYAMA.x, TSUKIYAMA.z) + 3;
      sfx('thunder', 0.55);
      rt.army.smoke(TSUKIYAMA.x + (Math.random() - 0.5) * 8, y, TSUKIYAMA.z - 2, 0, -1, 1);
    }
    // 城方の鉄砲：守る段の間、塀と櫓から寄せ手へ撃ち下ろす煙。内藤家長の鉄砲隊は西の丸で最後まで射撃の線を保つ
    if (holding && rt.t > (F.wallGunT || 0)) {
      F.wallGunT = rt.t + 2.5 + Math.random() * 3;
      const spots = i <= 2 ? [[-24, 42], [24, 42], [-12, 46], [12, 46], [-20, 60], [20, 60]] : i <= 6 ? [[-20, 4], [20, 4], [24, -12], [-30, -44], [-36, -42]] : [[-16, -38], [16, -38], [-10, -34], [10, -34]];
      for (let k = 0; k < 2; k++) {
        const [x, z] = spots[Math.floor(Math.random() * spots.length)];
        rt.army.smoke(x, rt.world.heightAt(x, z) + 4.5, z, 0, 1, 1);
      }
      sfx('volley', 0.35);
    }
    if (i >= 11 && !F.magoNamed) { F.magoNamed = true; revealName(rt, '雑賀孫一'); }
    // 甲賀衆の内応の火（二の丸の東の段）→ 本丸だけが残った時に天守へ火が回る
    if (i >= 6) { this.turnKoka(rt); this.burnMatsu(rt); }
    if (i >= 8) this.burn(rt);
    // 本丸の段：元忠も前へ出て戦う（守られる大将でなく、一緒に最後まで残る）
    if (i >= 9 && !F.toriiOut && F.motochika) { F.toriiOut = true; if (F.toriiU) F.toriiU._crouch = false; F.motochika.stay = false; F.motochika.anchor = { x: HON.x, z: HON.z }; F.motochika.aggro = 8; }
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
  const remaining = allyN(rt);
  // 本丸で戦う生存者がいる間だけ下限を保つ。全滅後に架空の十人を残さない。
  const a = F.a0n ? Math.min(F.aShown ?? 1800, remaining ? Math.max(10, Math.round(1800 * Math.min(1, remaining / F.a0n))) : 0) : 1800;
  F.aShown = a;
  return { a, a0: 1800, b: Math.max(0, 40000 - (F.ek || 0) * 40), b0: 40000 };
};
// 八月一日の城方は退かない。内藤家長が西の丸で果てた時、共通の知らせが「味方の兵が退き始めた」と出していた（鳥居の侍の台詞が既に知らせている）
// 「敵の隊が崩れた」「味方の隊が崩れた」の札も出さない（八秒おきに出て、持ち場で果てる城方まで「崩れた」と出していた。森部の kaito 11/6 を全戦に）
k01_fushimi.bannerAllowed = (rt, t) => !(((rt.flags.dp?.i ?? 0) >= 6 && /味方の兵が退き始めた/.test(t)) || /隊が崩れた/.test(t));
// 危機の知らせでも今の持ち場を変えない。二の丸の守備中に
// 本丸の元忠の旗へ呼んだり、後退の下知を引き留めたりしない。
k01_fushimi.missionDangerSpeech = (rt) => {
  const i = rt.flags.dp?.i ?? 0;
  if (i >= 11) return '本丸の裏口へ。城を抜け、内府様へ届けよ';
  if (i >= 9) return '味方は討ち減らされた。元忠殿の旗の下で戦え';
  if (i >= 7) return '本丸へ退け。元忠殿の旗の下へ寄れ';
  if (i === 6) return '二の丸の東を食い止めよ。持ち場を離れるな';
  if (i >= 4) return '二の丸の西へ。家忠殿と押し返せ';
  if (i === 3) return '二の丸へ退け。味方の後退を援護せよ';
  return '味方が討ち減らされておる。持ち場の旗の下へ寄れ';
};
k01_fushimi.sides = { a: { name: '徳川勢', mon: 'tokugawa' }, b: { name: '寄せ手', mon: 'ukita' } };
k01_fushimi.date = (rt) => (rt.flags.burned ? '慶長五年（1600）八月一日　夕・本丸に火' : rt.flags.matsuBurned ? '慶長五年（1600）八月一日　昼・松の丸に火' : `慶長五年（1600）${rt.flags.k01Date || '六月十八日'}　昼`);
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
STAGES.k01_fushimi = [['大手の曲輪を守る'], ['三の丸の東の隅櫓を救う', dpAt(1)], ['三の丸の門で破城隊を止める', dpAt(2)], ['二の丸へ退く', dpAt(3)], ['二の丸の西で家忠殿と押し返す', dpAt(5)], ['二の丸の東を食い止める', dpAt(6)], ['本丸へ退く', dpAt(7)], ['本丸で最後まで持ちこたえる', dpAt(9)], ['本丸の裏口から城を抜ける', dpAt(11)]];

// 目標の札に別の刻限を重ねず、実際の段の達成だけで判定する。
// 守る段と日付の切り替えでは人数を出さない。字から相手を探す
// 共通の補完に任せると、寄せの途中の人数や次の段の兵を数えてしまう。
k01_fushimi.goals5 = () => STAGES.k01_fushimi.map((s, k) => ({ kind: 'stage', k, text: s[0],
  count: (rt) => { const now = stageNow(rt); return !rt.over && now?.i === k && rt.flags.dp?.on && rt.flags.dp.cur?.s.kind === 'fight' ? now.count : null; },
  check: (rt) => (rt.over && rt.tracker?.main === true) || (stageNow(rt)?.i ?? 0) > k }));

export { k01_fushimi };
export default k01_fushimi;
