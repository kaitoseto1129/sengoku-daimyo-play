import { useTerrain } from './asset_manifest.js';
import * as THREE from 'three';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import { dirtTex, mudTex } from './nature.js';
import { pressureTick } from './battle_pressure.js';
import { localClear } from './army_local_way.js';
// ======================================================================
// 織田家編　田野の戦い・天目山（天正十年三月十一日）
// 高遠城が落ちると、武田の家臣は次々に離れていった。武田勝頼は新府城を焼いて、小山田信茂の岩殿城を頼ったが、
// 小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。滝川一益の手がこれを追いつめ、勝頼は自害した。
// 狭い崖道で土屋昌恒が一人で多くの敵を防いだ（片手千人斬り）という話は、のちの伝えである。
// 自分は滝川の先手。谷道の押し合い → 崖道で鉄砲の合図 → 平屋敷の柵の口 → 最後の寄せ。
// 向き：西南西から東北東への谷筋を +x に合わせて復元。田野は谷の奥。細かな寸法は推定。
// ======================================================================
import { nobori, hut, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { demRelief } from './dem.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { battleEvent, EVENT_VOLLEY } from './battle_events.js';
import { KIT } from './b_nagashinojo.js';
import { depthBot } from './b_depth.js';
import { jinkeiPoint } from './jinkei.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 谷の道（西から東へ上る）
const ROAD = [[-190, 6], [-120, -4], [-60, 4], [-10, -2], [30, 2], [70, -4], [120, 2], [180, -6]];
// 田野より奥は北の天目山へ続く。寺そのものは戦場の外で、ここへ縮めて置かない。
// 戦う道筋とは分け、任務の行き先や柵の口を変えない。曲がりと幅は復元値。
const UPPER_ROAD = [[180, -6], [180, -48], [170, -140], [170, -230]];
const roadDistance = (x, z) => Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, UPPER_ROAD));
const valleyFloor = (x, z) => (x + 200) * 0.05 + Math.max(0, Math.min(1, (x - 148) / 12)) * Math.max(0, -z - 6) * 0.05;
// 上流から下流へ。崖道では川岸が道へ寄る。
const RIVER = [[194, -230], [198, -140], [206, -48], [230, 22], [72, 22], [60, 11], [24, 11], [16, 22], [-230, 22]];
const DEM_RELIEF = { inner: 55, fade: 40, ax: 0, xy: 4, scale: 0.25 };
const NARROW = { x0: 20, x1: 60 };          // 崖道（道の幅が狭い所）
// 道の印の半幅八歩は崖道の平場より広い。入口・出口を含む切岸では、
// 道扱いの例外より実際の勾配を優先する。谷の床と屋敷の道順は変えない。
function tanoCliffBlocked(world, x, z) {
  return x >= NARROW.x0 - 6 && x <= NARROW.x1 + 6 &&
    distToPolyline(x, z, ROAD) > 4.2 && world.slopeTan(x, z) > world.def.climbTan;
}
const TANO = { x: 120, z: 2 };              // 田野（勝頼の最後の陣）
const FIRST_JOIN = { x: -62, z: 4 };
const NO_FOES = [];
// 待機線へ着く前は進む向きを示す。距離は印の欄へまとめ、任務の文を折り返さない。
function tanoWaitText(rt) {
  const C = rt.flags.dp?.cur, p = rt.player.u.pos;
  if (!C?.waiting) return '射手の後ろで構えよ';
  const d = Math.hypot(p.x - C.waitAt.x, p.z - C.waitAt.z);
  if (d > 4) return `鉄砲の待ち場へ${p.x > C.waitAt.x + 2 ? '下がれ' : '進め'}`;
  return rt.flags.tgun?.order !== 'hold' ? 'ここで待て。射手が前へ出る' : 'ここで鉄砲の合図を待て';
}
// 山腹の上だけ傾きを徐々に寝かせる。高さ四十で急に折れる平らな稜線を作らない。
// 下の二十までは従来と同じ。道・崖道の足場と川岸の低い段は動かさない。
const bankRise = (distance, slope) => {
  const rise = Math.max(0, distance) * slope;
  return rise <= 20 ? rise : 20 + 20 * (1 - Math.exp(-(rise - 20) / 20));
};

// 田野は城下ではなく山間の里。景徳院は戦後の建立なので、この戦には置かない。
// 民家・人数・細道の位置は推定復元。僧と商人は里を通る者として描く。
// 平屋敷の外の山側を東へ抜け、同じ川岸のまま天目山へ上る道へ逃がす。
const PEOPLE_PATH = [[78, -38], [150, -38], [180, -48]];
const PEOPLE_EXIT = [{ x: 180, z: -65 }, { x: 176, z: -102 }, { x: 170, z: -140 }, { x: 170, z: -218 }];
const PEOPLE_BANDS = [
  { x: 84, z: -36, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], mode: 'watch',
    route: [{ x: 84, z: -48 }, { x: 106, z: -48 }, { x: 150, z: -38 }, { x: 180, z: -48 }, ...PEOPLE_EXIT] },
  { x: 154, z: -39, kinds: ['farmer', 'merchant', 'monk', 'woman', 'child'], mode: 'watch',
    route: [{ x: 180, z: -48 }, ...PEOPLE_EXIT] },
];
const peopleDistance = (x, z) => distToPolyline(x, z, PEOPLE_PATH);

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 侍四十一人（父子を含む）を五つの持ち場へ配る。非戦の者は含めない。
// 谷では大きな陣形を開けない。長蛇は道に沿う復元の呼び名で、史料の陣名ではない。
const TANO_ATTACK = sonaePlan('長蛇', 0, { x: -188, z: 0 }, Math.PI / 2, [
  ['front', '先手の槍', '滝川一益の配下', 1700, -152, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['kawa', '第二陣', '滝川一益の配下', 1500, -208, 0, Math.PI / 2, 'oda', 'none'],
  ['gun', '先手の鉄砲', '滝川一益の配下', 500, -168, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '指揮所と近習', '滝川一益', 300, -188, 0, Math.PI / 2, 'takigawa', 'takigawa'],
]);
const TANO_DEFEND = sonaePlan('谷道と平屋敷の守り', 1, { x: 138, z: -6 }, -Math.PI / 2, [
  ['valley', '谷道の殿', '名は伝わらない', 6, -40, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['rear', '殿の控え', '名は伝わらない', 8, -20, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['tsuchiya', '崖道', '土屋昌恒', 9, 34, 2, -Math.PI / 2, 'takeda', 'takeda'],
  ['fence', '平屋敷の柵の口', '武田勝頼の配下', 10, 110, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['last', '平屋敷の奥', '武田勝頼・武田信勝', 8, 136, 0, -Math.PI / 2, 'takeda', 'takeda'],
]);

// 徒歩で狭い谷を守る姿。母衣は付けず、指物は肩幅ほどに収める。
// 袖と威糸を墨色の胴から分け、肘・手首・握る手の輪郭を読めるようにする。
const TANO_KIT = { horse: false, horo: 0, flagScale: 0.64, cloth: 0x716757, lace: 0x8a765c };
const ODA = { ...TANO_KIT, flag: 'oda' };
const TAKEDA = { ...TANO_KIT, flag: 'takeda', cloth: 0x665344, lace: 0x9a5740 };
// 開戦の配置より先に兵の定義を用意する。
function uS(n) { return { type: 'samurai', n, o: { weapon: 'spear', reach: 3.4, horse: false } }; }
function uA(n, spear) { return { type: 'ashigaru', n, ...(spear ? { o: { spear } } : {}) }; }
// 名のある将の威糸は具足の表に任せる。徒歩・小指物の指定だけは谷道に合わせる。
function tanoNamedDress(s, kit) {
  const { lace, ...fieldKit } = kit;
  return dress([s], fieldKit);
}
// 無名の味方は三人に一人だけ指物を付ける。将と隊旗を残し、顔と槍先を読ませる。
// 染めと笠の褪せ、指物の配分は場面の補完。
// 将本人の紋と人数は保ち、三通りの既存の形・材質を設営時だけ使う。
function tanoAllyDress(list, kit) {
  return list.flatMap((s) => {
    if (s.o?.name) return tanoNamedDress(s, kit);
    const variants = [];
    for (let i = 0; i < 3; i++) {
      const n = Math.floor((s.n + 2 - i) / 3);
      if (!n) continue;
      variants.push({ ...s, n, o: { ...kit, ...s.o, flag: i === 0 ? kit.flag : null,
        flagScale: (kit.flagScale || 0.64) * (1 - i * 0.08),
        armor: [0x343b3d, 0x3b352d, 0x303936][i],
        cloth: [kit.cloth, 0x655e52, 0x69716a][i], lace: [kit.lace, 0x85715a, 0x76827b][i],
        hatColor: [0x292823, 0x3c352a, 0x343938][i] } });
    }
    return variants;
  });
}

// 無名の守兵は二人に一人の指物。赤茶の袖と威で、旗のない時も味方と分ける。
// 名のある将の具足は保つ。人数と得物は変えず、設営時だけ二通りへ分ける。
function tanoGuardDress(list) {
  return list.flatMap((s) => {
    if (s.o?.name) return tanoNamedDress(s, TAKEDA);
    const marked = Math.ceil(s.n / 2), plain = s.n - marked;
    const kit = { ...TAKEDA, armor: 0x594238, cloth: 0x956346, lace: 0xb18b62 };
    const variants = [{ ...s, n: marked, o: { ...kit, ...s.o } }];
    if (plain) variants.push({ ...s, n: plain, o: { ...kit, ...s.o, flag: null } });
    return variants;
  });
}

// 実測の山は道から離れた遠景だけ。読込時刻で道や屋敷の床を変えない。
let tanoDem = null, heightDem = null, heightFixed = false;
useTerrain('dem_tano', (data) => { tanoDem = data; heightDem = null; heightFixed = false; });
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = tanoDem; }
  const b = heightBase(x, z);
  const upperFade = Math.max(0, Math.min(1, (distToPolyline(x, z, UPPER_ROAD) - 24) / 30));
  const ground = b + (heightDem ? demRelief(heightDem, x, z, DEM_RELIEF) * upperFade : 0);
  // 民家と細道だけに緩い段を作る。谷道・崖道・屋敷の戦う床は変えない。
  let blend = Math.max(0, Math.min(1, (18 - peopleDistance(x, z)) / 8)) * Math.max(0, Math.min(1, (-z - 24) / 6));
  blend = blend * blend * (3 - 2 * blend);
  let settled = ground + (valleyFloor(x, z) + 1.5 - ground) * blend;
  // 道沿いの小屋だけに小さな平場を切る。最高の隅へ家全体を持ち上げ、
  // 谷側へ背の高い板の土台を露出させない。道と川の床は保つ。
  for (const site of HUT_TERRACES) {
    let terrace = Math.max(0, Math.min(1, Math.min((4.2 - Math.abs(x - site.x)) / 1.2, (3.2 - Math.abs(z - site.z)) / 1.2)));
    terrace = terrace * terrace * (3 - 2 * terrace);
    settled += (site.y - settled) * terrace;
  }
  return settled;
}
function heightBase(x, z) {
  // 平屋敷は水平な小さな平場。谷道と川床は上流へ単調に上る。
  let h = valleyFloor(x, z);
  const yardBlend = Math.max(0, Math.min(1, Math.min(x - 100, 148 - x, z + 18, 20 - z) / 4));
  const d = roadDistance(x, z);
  // 幅と傾斜を入口・出口の十二歩でつなぐ。縦の切断面を作らず、道の中央は保つ。
  const enter = Math.max(0, Math.min(1, (x - NARROW.x0 + 6) / 12));
  const leave = Math.max(0, Math.min(1, (NARROW.x1 + 6 - x) / 12));
  const narrow = enter * enter * (3 - 2 * enter) * leave * leave * (3 - 2 * leave);
  const half = 14 - 7.5 * narrow;
  if (z < 0) {
    // 崖道の切岸にも幅のある岩鼻と沢を付け、長い一枚の斜面を作らない。
    // 道の八歩以内は保ち、山側の傾きだけをなだらかに変える。
    let bank = Math.max(0, Math.min(1, (d - 8) / 10));
    bank = bank * bank * (3 - 2 * bank);
    const fold = Math.sin(x * 0.095 + Math.sin(z * 0.065)) * 0.22;
    h += bankRise(d - half, (0.7 + 1.1 * narrow) * (1 + bank * fold));
  }
  else {
    // 川側は下へ落ちる。両側に上りの崖を作らない。
    h -= Math.min(10, Math.max(0, d - half) * (0.6 + 0.7 * narrow));
    h += bankRise(d - 32, 0.8);
  }
  h += 40 * gauss(x, z, 160, -140, 9000) * Math.min(1, Math.max(0, d - 24) / 30);
  const riverD = distToPolyline(x, z, RIVER);
  // 道と川床の外だけに尾根と浅い沢を重ね、一様な斜面を崩す。
  const relief = Math.max(0, Math.min(1, (d - 18) / 24)) * Math.max(0, Math.min(1, (riverD - 10) / 12));
  h += relief * (3.2 * Math.sin(x * 0.075 + z * 0.035) + 1.8 * Math.sin(z * 0.16 - x * 0.045));
  // 道から十四歩より外の切岸だけに、浅い沢と張り出しを作る。
  // 一定の傾きの長い壁を崩す。兵の通る床・川床・屋敷の平場は保つ。
  let shoulder = Math.max(0, Math.min(1, (d - 14) / 12));
  shoulder = shoulder * shoulder * (3 - 2 * shoulder);
  const dryBank = Math.max(0, Math.min(1, (riverD - 6) / 8));
  h += shoulder * dryBank * (1 - yardBlend) *
    (3.4 * Math.sin(x * 0.12 + Math.sin(z * 0.06) * 1.4) + 1.6 * Math.cos(z * 0.19 - x * 0.07));
  // 大きな沢の凹みと岩尾根を先に作り、細い溝だけの平滑な壁にしない。
  // 道肩から十八歩の内と川床・屋敷は従来の高さを保つ。
  const spur = Math.sin(x * .058 + Math.sin(z * .033) * .8);
  const ravine = Math.pow(Math.max(0, 1 - Math.abs(spur) * 2.8), 2);
  h += relief * dryBank * (1 - yardBlend) * (3.8 * spur - 7 * ravine);
  // 沢筋の細い侵食と層状の岩棚。
  const seam = Math.sin(x * .19 + Math.sin(z * .07) * 1.3);
  const gully = Math.pow(Math.max(0, 1 - Math.abs(seam) * 3.5), 2);
  h += relief * dryBank * (1 - yardBlend) * (1.1 * Math.sin(z * .48 + x * .055) - 4.2 * gully);
  if (riverD < 6) {
    const t = 1 - riverD / 6;
    h += (valleyFloor(x, z) - 7 - h) * t * t * (3 - 2 * t);
  }
  // 川側の肩だけを浅く欠き、長い直線の天端を崩す。
  // 通る道の八歩以内・川床の六歩以内・屋敷の平場は削らない。
  if (z > 0 && d > 8 && riverD > 6) {
    let bank = Math.max(0, Math.min(1, (d - 8) / 5)) * Math.max(0, Math.min(1, (26 - d) / 8));
    bank = bank * bank * (3 - 2 * bank);
    let dry = Math.min(1, (riverD - 6) / 4);
    dry = dry * dry * (3 - 2 * dry);
    const pocket = 0.5 + 0.5 * Math.sin(x * 0.16 + Math.sin(x * 0.053) * 1.7 + z * 0.09);
    h -= 1.6 * bank * dry * pocket * pocket * (1 - yardBlend);
  }
  return h + (16 - h) * yardBlend * yardBlend * (3 - 2 * yardBlend);
}

// 平場の高さは読み込み時に一度だけ求め、足場を調べる時には使い回す。
const HUT_TERRACES = [{ x: -108, z: -19, y: heightBase(-108, -19) }, { x: -18, z: -20, y: heightBase(-18, -20) }];

// 隊の要だけでなく、一人ずつの行き先も谷道と柵の口を通す。
// 横へ広がる持ち場をそのまま追うと、崖や川岸で止まってしまう。
const inYard = (x, z) => x >= 104 && x <= 144 && z >= -14 && z <= 16;
// 川側の道肩より低い所へは踏み出さない。道の曲がりと屋敷の平場は保つ。
// 一歩ごとの高低差だけでは、ゆっくり押される兵が川底まで下り続けてしまう。
function tanoBankFoot(world, x, z) {
  return z <= 0 || inYard(x, z) || distToPolyline(x, z, ROAD) <= 6 ||
    world.heightAt(x, z) >= valleyFloor(x, z) - 0.45;
}
// 回転した屋敷の壁と軒から離れた四隅。設営と同じ家だけを避ける。
const YARD_CORNERS = [{ x: 122, z: -6 }, { x: 134, z: -6 }, { x: 134, z: 6 }, { x: 122, z: 6 }];
const YARD_EXIT = { x: 108, z: 0 };
function crossesHouse(a, b) {
  let lo = 0, hi = 1;
  for (let axis = 0; axis < 2; axis++) {
    const min = axis === 0 ? 123 : -4.5, max = axis === 0 ? 133 : 4.5;
    const start = axis === 0 ? a.x : a.z, end = axis === 0 ? b.x : b.z;
    const delta = end - start;
    if (Math.abs(delta) < 0.0001) { if (start <= min || start >= max) return false; }
    else {
      const t0 = (min - start) / delta, t1 = (max - start) / delta;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo >= hi) return false;
    }
  }
  return lo < hi;
}
function valleyWay(army, u, want) {
  const p = u.pos;
  // 柵口の曲がり角は半歩まで進んでから次へ。手当て先の到着幅（一歩半）
  // のままだと、口の手前で止まり、同じ角へ向かい続けてしまう。
  const q = u._tanoWay || (u._tanoWay = { x: 0, z: 0, botRadius: 0.5 });
  q.x = want.x; q.z = want.z;
  const inside = inYard(p.x, p.z), entering = inYard(want.x, want.z);
  // 屋敷から戻る時も家の四隅を回る。奥から口へ直進すると土壁に詰まる。
  // 出口まで来たら、下の判定で西の開口を通って外へ出る。
  if (inside && !entering && (p.x > 109 || Math.abs(p.z) > 2))
    return valleyWay(army, u, YARD_EXIT);
  if (inside && entering) {
    if (!crossesHouse(p, want)) return want;
    let best = Infinity;
    for (const a of YARD_CORNERS) {
      if (crossesHouse(p, a)) continue;
      for (const b of YARD_CORNERS) {
        if (crossesHouse(a, b) || crossesHouse(b, want)) continue;
        const length = Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(a.x - b.x, a.z - b.z) + Math.hypot(b.x - want.x, b.z - want.z);
        if (length < best) {
          best = length;
          // 本人の到着幅は半歩。隅へ着いたら次の辺へ進め、同じ点で待たせない。
          const next = Math.hypot(p.x - a.x, p.z - a.z) <= 0.6 ? (a === b ? want : b) : a;
          q.x = next.x; q.z = next.z;
        }
      }
    }
    return Number.isFinite(best) ? q : want;
  }
  // 四辺の外から屋敷へ入る時も、西の口まで柵の外を回る。
  if (!inside && entering && p.x >= 104) {
    const sideZ = p.z < 1 ? -18 : 20;
    if (p.x > 144 && p.z > -17 && p.z < 19) { q.x = Math.max(148, p.x); q.z = sideZ; }
    else { q.x = 100; q.z = p.z; }
    return q;
  }

  // 同じ足場の近い敵には直接寄せる。列の幅へ丸めると、道端の敵へ
  // 届く前に止まり、実在しない「通り口」を探し続けてしまう。
  // 六歩以内・道の中心だけでは、柵前の草地に残った侍を直接追えない。
  // 近い道肩も候補にし、途中の壁・急な段・深い川を既存の歩行判定で確かめる。
  // 柵をまたぐ時と、崖の上下にいる相手は従来の道順を使う。
  if (inside === entering && Math.hypot(want.x - p.x, want.z - p.z) <= 12 &&
      distToPolyline(p.x, p.z, ROAD) < 14 && distToPolyline(want.x, want.z, ROAD) < 14) {
    q.y = army.world.heightAt(want.x, want.z);
    if (Math.abs(q.y - p.y) < 1.2 && localClear(army, p, q)) return want;
  }

  const forward = want.x > p.x;
  // 曲がり角を飛ばさずに通る。近い敵にはその場から打ち込める。
  if (Math.hypot(want.x - p.x, want.z - p.z) > 6) {
    for (let k = 0; k < ROAD.length; k++) {
      const i = forward ? k : ROAD.length - 1 - k;
      const [x, z] = ROAD[i];
      if (forward ? x > p.x + 2 && x < q.x : x < p.x - 2 && x > q.x) { q.x = x; q.z = z; break; }
    }
  }
  let roadZ = ROAD[0][1];
  for (let i = 1; i < ROAD.length; i++) {
    const a = ROAD[i - 1], b = ROAD[i];
    if (q.x <= b[0]) { roadZ = a[1] + (b[1] - a[1]) * Math.max(0, (q.x - a[0]) / (b[0] - a[0])); break; }
    roadZ = b[1];
  }
  const half = q.x >= NARROW.x0 && q.x <= NARROW.x1 ? 4.2 : 10;
  q.z = Math.max(roadZ - half, Math.min(roadZ + half, q.z));
  if ((p.x <= 104 && q.x > 104) || (p.x > 104 && q.x <= 104)) {
    const z = p.z + (q.z - p.z) * (104 - p.x) / (q.x - p.x);
    if (Math.abs(z) > 2) {
      const before = p.x <= 104 ? 100 : 108;
      const approach = Math.abs(p.z) > 2 || (p.x <= 104 ? p.x < 99 : p.x > 109);
      q.x = approach ? before : p.x <= 104 ? 108 : 100;
      q.z = 0;
      return q;
    }
  }
  return q.x === want.x && q.z === want.z ? want : q;
}

// 道筋と前後の間隔を下知の時だけ用意する。隊の要は歩いて移る。
function roadOrder(g, x, z = 0, formation = 'column') {
  if (!g || !g.count || g.routed) return;
  const path = [[g.anchor.x, g.anchor.z]];
  const forward = x >= g.anchor.x;
  const yardFlank = forward && inYard(x, z) && x >= 116 && z <= -6;
  for (let k = 0; k < ROAD.length; k++) {
    const [rx, rz] = ROAD[forward ? k : ROAD.length - 1 - k];
    if (yardFlank && rx >= 104) continue;
    if (forward ? rx > g.anchor.x + 1 && rx < x : rx < g.anchor.x - 1 && rx > x) path.push([rx, rz]);
  }
  // 屋敷の北脇へは西の口を抜けてから曲がる。道の中心を延ばすと家の壁へ詰まる。
  if (yardFlank) {
    if (g.anchor.x < 108) path.push([108, 0]);
    if (g.anchor.x < 116) path.push([116, -8]);
  }
  path.push([x, z]);
  g.formation = 'column'; g.colW = x >= NARROW.x0 && x <= NARROW.x1 || x >= 90 ? 3 : 4; g.march = false; g.noAI = true;
  // 後列も曲がる道に沿う。直線の持ち場を崖の外に残して先頭を待たせない。
  g.roadColumn = true;
  // 崖道と柵の口では三列、広い谷でも六列まで。人数を増やしても川へ広げない。
  g.yariRanks = Math.ceil(g.initial / (x >= NARROW.x0 && x <= NARROW.x1 || x >= 90 ? 3 : 6));
  g.order = 'path'; g.path = path; g.pathIdx = 1; g.focus = null;
  g.onArrive = () => { g.order = 'hold'; g.path = null; g.formation = formation; g.facing = forward ? Math.PI / 2 : -Math.PI / 2; g.onArrive = null; };
}
function sendColumn(rt, at, phase) {
  const F = rt.flags;
  // 敵の寄せ口は印の六歩先。八歩手前で止めると、互いの間合いに入れない。
  // 崖道では射手を前へ出し、槍はその後ろで待つ。味方で射線をふさがない。
  const narrow = phase === 'narrow';
  // 奥の守兵は百三十四歩の北脇にいる。集合の印で止めず、先手も同じ脇道へ寄せる。
  roadOrder(F.front, at.x + (phase === 'tano' ? 10 : narrow ? -20 : phase === 'approach' ? -8 : 0), at.z, 'yari');
  roadOrder(F.tgun, at.x - (narrow ? 8 : 20), at.z, 'line');
  // 後詰の列頭を先手の後列と重ねない。射手と指揮の間にも一隊分の間を取る。
  // 合流の配置は保ち、先手の損耗時は既存の前線支援で後詰が歩いて寄せる。
  roadOrder(F.taki, at.x - (phase === 'approach' ? 36 : narrow ? 56 : 52), at.z, 'ring');
  // 屋敷では後詰も西の口から北脇へ入る。三十四歩後ろの柵外に残さない。
  roadOrder(F.kawa, at.x - (phase === 'tano' ? 6 : phase === 'approach' ? 20 : narrow ? 38 : 34), at.z, 'yari');
}
const fighting = (g) => g && !g.routed && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget);

// 下知の切り替わりで一度だけ鳴らす。札の「敵を退けよ」を退却と取り違えない。
// 合成済みの合図と声を使い回し、音の出どころを実際の組に合わせる。
function tanoSignal(rt, kind, group, cue, task = 'main') {
  rt.army.playFar('sig_' + kind, group.anchor, 0.9);
  const o = rt.objectives.find((o) => o.id === task);
  if (o) { o.cue = cue; o.cueT = rt.t; }
  if (kind !== 'kakari') return;
  const current = rt.flags.dp.cur;
  rt.after(2.2, () => {
    if (rt.over || rt.flags.ending || !rt.player.u.alive || rt.flags.dp.cur !== current || !fighting(group)) return;
    rt.army.play('toki', group.anchor, 0.8);
  });
}

// 生きて戦える兵だけを比べる。父子・柵・使番は優勢の数に入れない。
function tanoAdvantage(rt) {
  let ally = 0, enemy = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.civ || u.group?.civ || u.type === 'porter' || u.type === 'dummy') continue;
    if (u.team === 0) ally++; else enemy++;
  }
  return ally > 0 && ally >= enemy;
}
// 川筋の筋・岸石・早春の草は各一描画。作る時だけ形と材質を用意する。
function tanoRiver(rt, stream) {
  const surface = stream.surface;
  if (!surface || !stream.mesh) return;
  stream.mesh.material.color.setHex(0x236d68);
  stream.mesh.material.opacity = 0.96;
  stream.mesh.material.envMapIntensity = 0.15;
  const count = Math.floor((surface.length / 3 - 1) / 3);
  const flowGeo = new THREE.PlaneGeometry(0.1, 1.8); flowGeo.rotateX(-Math.PI / 2);
  const stoneGeo = rockShape(0.5, true);
  const grassGeo = rockTuftShape();
  const flow = new THREE.InstancedMesh(flowGeo, new THREE.MeshBasicMaterial({ color: 0x83bab0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), count);
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), count * 2);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x697047, side: THREE.DoubleSide }), count * 2);
  const shape = new THREE.Object3D();
  for (let k = 0; k < count; k++) {
    const i = k * 9, dx = surface[i + 3] - surface[i], dz = surface[i + 4] - surface[i + 1];
    const len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
    const x = (surface[i] + surface[i + 3]) / 2, z = (surface[i + 1] + surface[i + 4]) / 2;
    const y = (surface[i + 2] + surface[i + 5]) / 2;
    const offset = Math.sin(k * 2.4) * stream.w * 0.6;
    shape.position.set(x + nx * offset, y + 0.035, z + nz * offset);
    shape.rotation.set(0, Math.atan2(dx, dz), 0); shape.scale.set(1, 1, 1); shape.updateMatrix(); flow.setMatrixAt(k, shape.matrix);
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1, at = k * 2 + side;
      const bx = x + nx * sign * (stream.w + 0.65), bz = z + nz * sign * (stream.w + 0.65);
      shape.position.set(bx, rt.world.heightAt(bx, bz) - 0.06, bz);
      shape.rotation.set(0.2, k * 1.7, 0.1); shape.scale.set(1.2, 0.65, 0.8); shape.updateMatrix(); stones.setMatrixAt(at, shape.matrix);
      const gx = bx + nx * sign * 0.8, gz = bz + nz * sign * 0.8;
      shape.position.set(gx, rt.world.heightAt(gx, gz), gz);
      shape.rotation.set(0, k, 0); shape.scale.set(1, 0.7 + (k % 3) * 0.15, 1); shape.updateMatrix(); grass.setMatrixAt(at, shape.matrix);
    }
  }
  flow.renderOrder = 1;
  groundRocks(rt.world, stones, 0.5);
  rt.scene.add(flow, stones, grass);
}

// 早春の木を立体の幹・細枝の束で置く。この戦だけの軽い林（二描画）。
// 形・材質・変換用の道具は作る時に共有し、毎コマの処理を増やさない。
function tanoWoods(rt) {
  const W = rt.world, total = 140;
  const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 1, 1, 5), new THREE.MeshLambertMaterial({ color: 0x504537 }), total * 26);
  const rocks = new THREE.InstancedMesh(rockShape(1, true), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 144);
  const shape = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  let seed = 15823, bi = 0, ri = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const branch = (x, y, z, dx, dy, dz, radius) => {
    dir.set(dx, dy, dz);
    const length = dir.length();
    shape.position.set(x + dx / 2, y + dy / 2, z + dz / 2);
    shape.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / length));
    shape.scale.set(radius, length, radius); shape.updateMatrix(); bark.setMatrixAt(bi++, shape.matrix);
  };
  const limit = Math.min(220, W.half - 8);
  for (let i = 0, tries = 0; i < total && tries < total * 12; tries++) {
    let x = (random() * 2 - 1) * limit, z = (random() * 2 - 1) * limit;
    // 三分の二は通る谷の山側へ配る。本数を増やさず、近い切岸の裸木を残す。
    if (i % 3 !== 2) {
      const k = Math.floor(random() * (ROAD.length - 1)), t = random();
      x = ROAD[k][0] + (ROAD[k + 1][0] - ROAD[k][0]) * t;
      z = ROAD[k][1] + (ROAD[k + 1][1] - ROAD[k][1]) * t - 20 - random() * 28;
    }
    if (roadDistance(x, z) < 20 || peopleDistance(x, z) < 12 || distToPolyline(x, z, RIVER) < 9 || Math.hypot(x - TANO.x, z - TANO.z) < 30) continue;
    // 疎らな所と枝の重なる所を作り、一本ずつ同じ間隔に見せない。
    if (random() > 0.55 + 0.35 * Math.sin(x * 0.08 + Math.cos(z * 0.06) * 2)) continue;
    const y = W.heightAt(x, z), h = 5 + random() * 5, a = random() * Math.PI * 2;
    const lean = 0.25 + random() * 1.2;
    const dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
    branch(x, y - 0.2, z, dx, h * 0.6 + 0.2, dz, 0.3 + random() * 0.12);
    branch(x + dx, y + h * 0.6, z + dz, -dx * 0.4, h * (0.16 + random() * 0.24), dz * 0.3, 0.13);
    const limbs = 3 + Math.floor(random() * 2);
    for (let k = 0; k < limbs; k++) {
      const angle = a + k * 2.1 + random() * 0.9, reach = 0.8 + random() * 2.2;
      const by = h * (0.3 + random() * 0.28), trunk = by / (h * 0.6);
      const ox = x + dx * trunk, oz = z + dz * trunk;
      const bx = Math.cos(angle) * reach, bz = Math.sin(angle) * reach;
      branch(ox, y + by, oz, bx, 1.2, bz, 0.09);
      const twigs = 2;
      for (let j = 0; j < twigs; j++) {
        const turn = angle + (j ? 0.8 : -0.7);
        const tx = Math.cos(turn) * 0.9, tz = Math.sin(turn) * 0.9, ty = 0.8 + random() * 0.6;
        branch(ox + bx * 0.7, y + by + 0.84, oz + bz * 0.7, tx, ty, tz, 0.045);
        // 葉の平たい黒い塊を付けず、枝先をもう一度分けて裸木の輪郭を作る。
        branch(ox + bx * 0.7 + tx * 0.65, y + by + 0.84 + ty * 0.65, oz + bz * 0.7 + tz * 0.65,
          Math.cos(turn + 0.9) * 0.65, 0.55, Math.sin(turn + 0.9) * 0.65, 0.025);
      }
    }
    if (ri < 80) {
      shape.position.set(x + 1.6, W.heightAt(x + 1.6, z) - 0.2, z);
      shape.rotation.set(random(), a, random()); shape.scale.set(0.7 + random() * 1.4, 0.5 + random(), 0.8 + random());
      shape.updateMatrix(); rocks.setMatrixAt(ri++, shape.matrix);
    }
    i++;
  }
  // 露岩は切岸の割れ目に疎らに置く。等間隔の二列を作らず、道と川を空ける。
  // 大小・厚み・傾きを設営時だけ変え、既存の岩の一描画にまとめる。
  for (let i = 0; i < 32; i++) {
    const x = -130 + random() * 280;
    let roadZ = 0;
    for (let j = 1; j < ROAD.length; j++) {
      if (x <= ROAD[j][0]) {
        const a = ROAD[j - 1], b = ROAD[j];
        roadZ = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); break;
      }
    }
    const z = roadZ - (x > NARROW.x0 && x < NARROW.x1 ? 10 : 19) - random() * 16;
    // 道肩の露岩を山ほどの黒い塊にしない。形・本数・接地の処理は共用する。
    const size = 0.8 + random() * random() * 2.1;
    shape.position.set(x, W.heightAt(x, z) - 0.25 - size * 0.18, z);
    shape.rotation.set((random() - 0.5) * 0.7, random() * Math.PI * 2, (random() - 0.5) * 0.5);
    shape.scale.set(size * (1.5 + random() * 0.8), size * (0.5 + random() * 0.5), size * (0.8 + random() * 0.5));
    shape.updateMatrix(); rocks.setMatrixAt(ri++, shape.matrix);
  }
  // 既存の家の軒下に薪、戸口の前に不ぞろいな踏み石。共有の二描画へまとめる。
  // 屋敷の戦う床や当たりを増やさず、暮らしの残る山里にする。
  for (const [hx, hz, hw, hd, angle] of [[128, 0, 7, 5, .2], [86, -47, 5, 4, 0], [150, -47, 5, 4, 0], [-108, -19, 4.8, 3.6, .15], [-18, -20, 4.8, 3.6, -.2]]) {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4 - row; col++) {
      const lx = hw / 2 + .22 + col * .18, lz = -.65;
      const x = hx + lx * cs + lz * sn, z = hz - lx * sn + lz * cs;
      branch(x, W.heightAt(x, z) + .12 + row * .18, z, sn * 1.25, .025, cs * 1.25, .105);
    }
    for (let k = 0; k < 4; k++) {
      const x = hx + sn * (hd / 2 + .35 + k * .55), z = hz + cs * (hd / 2 + .35 + k * .55);
      shape.position.set(x, W.heightAt(x, z) + .025, z);
      shape.rotation.set(0, angle + random() * .3, 0); shape.scale.set(.65, .13, .45);
      shape.updateMatrix(); rocks.setMatrixAt(ri++, shape.matrix);
    }
  }
  for (const [mesh, count] of [[bark, bi], [rocks, ri]]) {
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }
  groundRocks(W, rocks);
  rt.scene.add(bark, rocks);
}

// 荷を運んだ二筋と足で擦れた道端。高さ・通行・戦う間合いは変えない。
function tanoRoadWear(rt) {
  const points = [], colors = [];
  for (let j = 1; j < ROAD.length; j++) {
    const a = ROAD[j - 1], b = ROAD[j], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    const steps = Math.ceil(length / 1.5);
    for (const side of [-1, 1]) for (let i = 0; i < steps; i++) {
      const corners = [];
      for (const t of [i / steps, (i + 1) / steps]) {
        const bend = side * 1.05 + Math.sin((a[0] + dx * t) * .13) * .18;
        const width = .09 + .05 * (1 + Math.sin((a[0] + dx * t) * .51));
        for (const edge of [-1, 1]) {
          const x = a[0] + dx * t + nx * (bend + edge * width);
          const z = a[1] + dz * t + nz * (bend + edge * width);
          corners.push([x, rt.world.heightAt(x, z) + .035, z]);
        }
      }
      const shade = .13 + .04 * (1 + Math.sin(i * 1.7 + j));
      for (const k of [0, 2, 1, 1, 2, 3]) { points.push(...corners[k]); colors.push(shade, shade * .85, shade * .65); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  rt.scene.add(mesh);
}

// ---- 共通の小道具（組E の戦で使い回す） ----
// 味方の鉄砲の組に一斉射を任せる。込めたまま待たせ（holdFire）、敵の前線が near m まで寄せたら「放て」で撃たせ、敵の気勢を下げる。
// o：{ guns: () => [隊], foes: () => [隊], who: 話し手, near: 38, drop: 25, max: 60（この秒を過ぎたら待たずに撃つ）, line: 見出しの小さな字, say: 合図の台詞, onFire(rt) }
export function volleyAt(rt, o) {
  const guns = o.guns() || [];
  for (const g of guns) { g.holdFire = true; g.fire = true; }
  const t0 = rt.t;
  let released = false;
  const tick = () => {
    if (rt.over || rt.flags.ending || !rt.player.u.alive) return;
    const groups = o.guns() || [], foes = o.foes() || [];
    let able = false, ready = false, fired = false;
    for (const g of groups) {
      if (!fighting(g)) continue;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.type !== 'gun' || u.gunAmmo === 0) continue;
        able = true;
        if (released && u.fireT > 0) fired = true;
        if (u.cd > 0 || u.reload || u.stagger > 0 || u.mounted) continue;
        for (const f of foes) {
          if (!fighting(f)) continue;
          for (const v of f.units) {
            if (!v.alive || v.fleeing || v.woundOut || v.noTarget || v.isStruct) continue;
            const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
            if (d > (rt.t - t0 > (o.max ?? 60) ? 100 : o.near ?? 38) || rt.army.shotBlocked(u, v.pos) || rt.army.hiddenBehind(u, v) || rt.army.allyInLine(u, v, d)) continue;
            ready = true; break;
          }
          if (ready) break;
        }
      }
    }
    if (!able) { for (const g of guns) g.holdFire = false; return; }
    if (!released && ready) {
      released = true;
      for (const g of groups) g.holdFire = false;
      rt.say(o.who || '鉄砲頭', o.say || '敵が見えたぞ……放て！', 3);
    }
    if (fired) {
      // 音・煙・命中・士気は実兵の射撃に任せ、同じ射撃を重ねない。
      rt.banner('一斉射', o.line || '味方の鉄砲が放たれた。槍の列を保て');
      if (o.onFire) o.onFire(rt, foes);
      return;
    }
    if (!foes.some(fighting)) { for (const g of guns) g.holdFire = false; return; }
    rt.after(0.2, tick);
  };
  rt.after(0.2, tick);
}
// 武田の騎馬の大きな塊を遠くに見せる（軽い作り）。facing は向く先
export function horseHost(rt, x, z, w, d, count, facing, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind: 'cavalry' });
}

// 敵の武士は全段を通じて四十一人。段の間に控えを増やさない。
const tano = {
  jinkei: [TANO_ATTACK, TANO_DEFEND],
  noWake: true, noDistantBattle: true, noTaishoRaid: true, noHorse: true, noCouriers: true, botOrders: true,
  noRevive: true, strictHits: true, armySignals: false,
  // 近い味方の顔・兜・胴を濃く残す。目が兵の体へ入る時だけ描く間避ける。
  // 笠だけ透かして頭皮を出さず、槍も本来の太さと長さを保つ。
  nearAllyFadeRadius: 1.1, nearAllySolidBody: true, nearAllyWholeOcclusion: true,
  fadeCloseStandards: true, fadeCloseStandardFrame: true, rangeCueBesideHead: true,
  // 幟は竿の高さを保ち、布を頭より上へ収める。寸法は狭い谷での復元値。
  standardClothScale: 0.72,
  // 崖道で振り向いた時、目のすぐ前の敵の兜・顔が道を隠さないようにする。
  nearEnemyFadeRadius: 1.35,
  rangeCueClearCenter: true,
  // 共通の壁・屋根の最終判定より前で目を寄せる。判定後に軒の内側へ戻さない。
  clampCamera(rt, eye) {
    const player = rt.player;
    if (!player.u.alive || rt.over || player.overHold || player.overK > 0.01 || player.aiming || player.fpWanted() || player.fpK > 0.01 || player.cine || player.camShot || player.introT > 0 || player.lookIdle <= 0.7) return;
    const p = player.u.pos, shoulder = p.y + 1.6;
    for (let k = 0; k < 12 && eye.y > shoulder + 1.2; k++) {
      eye.x += (p.x - eye.x) * 0.25; eye.z += (p.z - eye.z) * 0.25;
      eye.y = Math.max(shoulder + (eye.y - shoulder) * 0.75, rt.world.heightAt(eye.x, eye.z) + 0.65);
    }
  },
  noticeOnce: true, noAllyReports: true, // 同じ声は一戦一度。遠い将の独り言は運ばない。
  readableLogEntry: true, // 携帯で裸の数字だけを出さず、下知を読む入口と分かるようにする。
  immediateTaskChanges: true, immediatePhaseTasks: true,
  // 近い敵の矢印が出ても、谷道・崖道・柵の下知を短い札に残す。
  keepTaskLabel: true, keepCombatTaskHeading: true,
  // 打ち込む相手が替わっても、下知の札は左上で読み、持ち場の名を保つ。
  keepTaskPanel: true, keepDestinationTask: true,
  // 間合いへ進む時も、下知の札を敵の足元へ動かさない。
  keepApproachTaskPanel: true,
  // 防御中も「どこの敵を押すか」を残し、長押しだけを続けさせない。
  keepTaskWithGuard: true,
  // 接近の案内にも持ち場と味方を残し、一人で敵を追わせない。
  meleeApproachLabel: (rt) => rt.def.taskText(rt, '敵へ構え、味方と押せ'),
  meleeApproachText: (rt) => {
    const C = rt.flags.dp?.cur;
    if (C?.waiting || rt.phase === 'narrow' && !rt.flags.volley && !rt.flags.narrowPush)
      return tanoWaitText(rt);
    if (C?.routeTurn) return C.houseTurn ? '屋敷の脇の印へ進め' : C.yardTurn ? '柵の口の印へ進め' : '谷道の印へ進め';
    const place = rt.phase === 'narrow' ? '崖道' : rt.phase === 'fence' ? '柵の口'
      : rt.phase === 'tano' ? '屋敷の奥' : '谷道';
    return `${place}の敵へ味方と進め`;
  },
  // 浅い傷は部位だけを示す。歩みへの影響と退却の下知を混ぜない。
  woundEffectMin: 0.05,
  woundEffectText: (rt, slow) => slow ? 'けが・歩みが遅い' : '腕のけが・突きが鈍る',
  // 止血後も残る手足の傷だけで、攻めの下知を退避に替え続けない。
  retreatForLimbWounds: false, keepWoundRetreatReason: true, keepRetreatReason: true,
  // 操作の向きだけで退く理由を消さず、出血時は手当てへつなぐ。
  keepRetreatGestureReason: true,
  dodgeMoveCaption: (rt, side) => `${rt.player.u.wounds?.bleed > .0001 ? '出血。手当てへ' : '味方の後ろへ'}。${side}へなぞる`,
  dodgeTurnLabel: (_rt, right, touch) => `味方へ向き直れ。${right ? '右' : '左'}へ${touch ? 'なぞる' : '動かす'}`,
  // 実戦中の見回す教えで、兵と鉄砲の段取りを止めない。
  pauseTurnPractice: false, dodgeTurnDuration: 3,
  // 浅い一撃ごとに寄せの下知を退避へ替えない。深手・出血・包囲・息切れでは退く。
  damageRetreatNeeded: (rt) => !!rt.flags.retreatMarked || rt.player.u.hp < rt.player.u.maxHp * .3 ||
    rt.player.u.wounds?.bleed > .0001 || !!rt.player.u.mobbed || rt.player.sta < 20,
  // 立ち位置を囲う白い人型は歩く本人の姿とずれる。敵の隅印は残す。
  noUnitContrast: true,
  // 肩越しに見える本人を白い輪と矢印で覆わない。行き先の印は残す。
  hidePlayerSign: true,
  // 防御の相手を選ぶ時も同じ間合いにし、離れた敵を追って構え続けない。
  nearThreatRange: 6, meleeThreatRange: 6, meleeThreatHeight: 1.5,
  // 遠い敵や倒れた敵には防御札を出さず、次の持ち場への案内へ戻す。
  waitGuardAllowed(rt, enemy) {
    const p = rt.player.u;
    return !!enemy?.alive && enemy.team !== p.team && !enemy.fleeing && !enemy.woundOut &&
      !enemy.downed && !enemy.dropped && !enemy.noTarget && !enemy.isStruct &&
      (enemy.sidearm || enemy.type !== 'gun' && enemy.type !== 'bow') &&
      Math.abs(enemy.pos.y - p.pos.y) < 1.5 &&
      Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) < 6 &&
      localClear(rt.army, p.pos, enemy.pos);
  },
  // 味方を守る一時の案内でも、谷道・崖道・柵の任務を残す。
  keepRescueTaskLabel: true,
  // 攻め手の任務。近い味方を自動で護衛の相手にして、谷道の下知を隠さない。
  guardGuideAllowed: () => false,
  guardStartText: '一撃を ふせぐ', guardWaitText: '一撃を ふせぐ',
  waitGuardButtonText: '長押しで一撃をふせぐ',
  releaseGuardForAttack: true,
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u, C = rt.flags.dp?.cur;
    // 射撃を待つ段と終幕では、攻撃へ誘わない。通常の防御はそのまま使える。
    if (!C || C.waiting || rt.flags.ending || rt.over ||
        C.s.phase === 'narrow' && !rt.flags.volley && !rt.flags.narrowPush ||
        !this.waitGuardAllowed(rt, enemy) || enemy.gone || enemy.invuln ||
        enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) >
          P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust')) return false;
    // 相手の打ち終わりでも、ほかの敵が本人へ打ち込む間は防ぐ。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.gone || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          !rt.army.wallBetween(u.pos, -1, e.pos)) return false;
    }
    return true;
  },
  // 開いている西の口へ進む戦。柵の脇を通るだけでは、集合の下知を作業札で隠さない。
  // 実際に柵へ歩いて止まった時は倒せる。長押しを始めたら完了まで保つ。
  fenceUseOK: (rt) => rt.player.blockedWalkT >= 0.7 || rt.holdId === 'fence',
  // 歩兵の目印は実際の立ち位置を基準にする。離れた骨の座標を囲まない。
  positionPersonGuide: true,
  // 固定の二歩超の高さでは、小柄な徒歩兵の印が兜から山肌へ離れる。
  // 作成済みの背丈を使い、周囲の刀印は近い敵だけに添える。
  bodyHeightGuides: true, nearbyEnemySignRange: 9,
  // 敵の具足を太枠と大矢印で覆わず、既存の小さな隅印で示す。
  compactFieldGuides: true, compactCombatGuides: true, groundCombatMarkers: true, subtleTargetFrames: true,
  // 敵を囲う描画が実際に読む指定。太い全周の枠を細い四隅へ替える。
  enemyCornerSign: true,
  // 間引き描画の古い頭の骨を使わず、今いる床から敵の囲みを測る。
  enemyFrameAtPosition: true,
  // 四隅で敵を示し、頭上の刀印を重ねない。接近の大輪は足元からの案内へ替える。
  enemySignOnly: true, compactApproachGuide: true, enemyFootRingRadius: 0.45,
  quietCombatCues: true, compactDestinationArea: true, compactHoldGuide: true, groundLockRing: true,
  // 近い退き先・回避先も小さく示し、槍先と敵の体を空ける。
  compactFloorGuides: true, compactDodgeGuide: true, compactDestinationSign: true,
  // 待つ印・集合の旗にも小さい指定を通す。到着の広さは変えない。
  groundFlagGuides: true, goalFlagScale: 0.55,
  // 待機・開幕が強調した輪を求めても、小さい足元の印にそろえる。
  compactFlagEmphasis: true, compactGroundGoalRing: true,
  // 画面外の敵を示す補助旗も同じ大きさへ。通常の旗の縮小指定だけでは届かない。
  destinationPointerScale: 0.55,
  // 待機の旗は実際の床へ置く。頭上へ持ち上げて別の行き先に見せない。
  footFlagGuides: true,
  // 待機・退避の輪も中心だけを示す。到着や防御の判定の広さは保つ。
  smallTaskAreas: true,
  // 退く操作は指元だけで示す。谷を横切る点線と大きな旗で兵を覆わない。
  shortRetreatGesture: true, compactRetreatSign: true, compactRetreatArea: true,
  // 描画で使う長さも指定する。退き先の旗まで白線を引かず、足元で向きだけ示す。
  retreatArrowLength: 72, retreatLinkLength: 140,
  avoidDestinationNotices: true,
  // 移動中・待機中・長押し中で手当ての下知を分ける。
  treatmentTaskGuidance: true, treatmentCrossSign: true, treatmentApproachLabel: '手当ての印へ下がれ',
  // なぞるのは退く操作。印に着いて止まってから、別の長押しで傷を縛る。
  treatmentMoveCaption: '十字の印へ下がり、止まれ',
  // 被弾直後も、出血中は止血できる場所へ。退避と手当てを往復させない。
  preferTreatmentRetreat: () => true,
  retreatPointAllowed(rt, point) {
    const p = rt.player.u.pos;
    const d = distToPolyline(point.x, point.z, ROAD);
    const current = distToPolyline(p.x, p.z, ROAD);
    // 道を外れている時は内へ戻れる。切岸・川底には印を置かない。
    return (inYard(point.x, point.z) || d <= 6 || d < current) &&
      rt.world.slopeTan(point.x, point.z) <= 0.7;
  },
  // 歩ける床同士でも、途中に切岸があれば退き先にしない。
  // 半秒ごとの案内更新だけで調べ、本人の歩行・当たりと同じ判定を使う。
  retreatPathAllowed(rt, point) {
    return this.retreatPointAllowed(rt, point) && rt.player.clearWalkTo(point.x, point.z, false);
  },
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.treatmentLeft <= 0) return '布がない。味方の陰で構えよ';
    if (p.mounted) return '馬をおりて傷を縛れ';
    if (p.treatmentNext > rt.t) return '味方の陰で少し待て';
    if (p.treatmentReady) return p.treating ? '押したまま傷を縛れ' : '「手当て」を三秒長押し';
    // 印に着いても、被弾直後や動いている間はまだ布を巻けない。
    // 味方が離れた時も、古い印の上で手当てを促し続けない。
    return cue?.valid && Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) < cue.radius
      ? p.treatmentShelter(p.u.pos) ? '止まって手当てを待て' : '味方のすぐ後ろへ下がれ'
      : '手当ての印へ下がれ';
  },
  // 攻め手の一時の立て直し。退き先と危険の判定は共通の案内を使う。
  retreatGuideLabel(rt, reached) {
    if (rt.hud.retreatGuide?.treatment) return this.treatmentGuideLabel(rt, rt.hud.retreatGuide);
    const u = rt.player.u;
    if (u.wounds?.bleed > 0.0001)
      return rt.player.treatmentLeft > 0 ? this.treatmentGuideLabel(rt, rt.hud.retreatGuide)
        : reached ? '布がない。味方の陰で構えよ' : '布がない。味方の後ろへ';
    if (u.hp < u.maxHp * 0.3 || rt.t < (rt.retreatUntil || 0) || rt.flags.retreatMarked)
      return reached ? '味方のそばで構えよ' : '危ない。味方へ下がれ';
    if (u.mobbed) return reached ? '味方と敵へ構えよ' : '囲まれた。味方へ下がれ';
    if (rt.player.sta < 20) return reached ? 'ここで息を整えよ' : '息切れ。味方へ下がれ';
    return reached ? '味方と敵へ構えよ' : '味方の列へ下がれ';
  },
  taskText(rt, text) {
    // 射手の到着前の印は槍の待機線。「射手の後ろ」と案内して逆へ戻さない。
    if (rt.flags.dp?.cur?.waiting && /射手の後ろ|鉄砲の合図を待て/.test(text))
      return tanoWaitText(rt);
    // 傷の手当て・集合・通り口は、交戦の短い言葉に置き換えない。
    if (/傷|手当て|下が|戻|そろえ|通り口|印まで|印へ進み|ここで鉄砲/.test(text)) return text;
    const place = rt.phase === 'narrow' ? '崖道' : rt.phase === 'fence' ? '柵の口'
      : rt.phase === 'tano' ? '屋敷の奥' : '谷道';
    // 歩いて体の向きが変わるたびに別の下知へ切り替えない。
    // 横向きの携帯でも折り返しにくい長さにし、持ち場と行動を伝える。射撃待ちは保つ。
    if (/敵へ体を向けよ/.test(text)) return `${place}の敵へ向き直れ`;
    if (/敵へ構え、味方と押せ/.test(text)) return `${place}で味方と押せ`;
    if (/鉄砲の合図を待て/.test(text)) return '射手の後ろで待て';
    if (/射手の後ろ/.test(text)) return /印/.test(text) ? text
      : /待て/.test(text) ? '射手の後ろで待て' : '射手の後ろを守れ';
    if (/鉄砲を待たず/.test(text)) return '崖道で槍の組と押せ';
    if (/鉄砲が鳴った|敵へ構え、味方と押せ|先手と谷道の敵を退けよ/.test(text)) return `${place}で味方と押せ`;
    if (/出てくる敵を退け/.test(text)) return '柵の口で味方と押せ';
    if (/柵の口から入り、奥の敵/.test(text)) return '屋敷の奥で味方と押せ';
    if (/進み太鼓と法螺/.test(text)) return '谷道の先手へ続け';
    return text;
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const C = rt.flags.dp?.cur;
    if (C?.clearSaid) return C.routeTurn ? C.houseTurn ? '屋敷の脇から集合の印へ'
      : C.yardTurn ? '柵の口から集合の印へ' : '組をそろえる印へ' : '組をそろえる印へ';
    if (C?.routeTurn) return C.houseTurn ? '屋敷の脇へ' : C.yardTurn ? '柵の口へ' : '谷道へ';
    if (C?.waiting) return rt.flags.tgun?.order !== 'hold' ? '鉄砲を待つ印へ' : '射手の後ろの印へ';
    return rt.phase === 'fence' ? '柵の口へ' : rt.phase === 'tano' ? '屋敷の奥へ'
      : rt.phase === 'narrow' ? '崖道の先手へ' : '谷道の先手へ';
  },
  armySignals: false, // 下知は田野の段取りで鳴らす。敵を退ける任務に退き太鼓を鳴らさない。
  distanceUnit: 'ken', arrivalLabel: 'すぐ近く',
  // 通常の距離欄へまとめ、「旗まで何歩」と「約何間」を重ねない。
  // 手当ての退き先は床の印と指図で示し、文末へ歩数を継ぎ足さない。
  hideGuideSteps: true,
  compactIntro: true,
  introText: '青白・黄旗は味方。赤白旗と赤茶の袖は敵。谷道を進み、前の味方に加われ。',
  // 最期の言葉は作らない。戦いの下知は場面の復元で、史料の引用ではない。
  battleVoices: { lines: {
    ally: { ambient: ['谷道は石だらけだで', '足元に気をつけやあ', '前の旗が見えるで', '川へ寄ったらいかん'] },
    enemy: { ambient: ['柵の口を離れるな', '谷道から来るぞ', '槍先をそろえよ', '屋敷へ通すな'] },
  } },
  // 次の守兵は動かさず、後詰は先手の損耗か崖道の長い押し合いで支える。
  // 射撃待ちには入らず、既存の兵が道を歩いて列の穴へ寄せる。
  frontlineDensity: { strength: 0.6,
    // 射撃待ちに槍兵を射線へ集めない。敵を退けた後も次の守兵へ先走らない。
    active: (rt) => {
      const C = rt.flags.dp?.cur;
      return !!C && C.groups.some(fighting) &&
        (C.s.phase !== 'narrow' || rt.flags.volley || rt.flags.narrowPush);
    },
    canSend: (rt, g) => g === rt.flags.front ||
    g === rt.flags.kawa && (!fighting(rt.flags.front) || rt.flags.front.count < rt.flags.front.initial / 2 ||
      rt.flags.dp?.cur?.s.phase === 'narrow' && rt.t - rt.flags.dp.cur.t0 >= 30) ||
    // 崖道の九人は道を守る。混雑解消で十八歩外へ退かせると切岸へ散る。
    !!rt.flags.dp?.cur?.groups.includes(g) && rt.flags.dp.cur.s.phase !== 'narrow' },
  lordHata: { spear: 12 },
  // 本人・護衛・最期はこの戦で置く。共通の追加兵と討ち取り勝利を使わない。
  taisho: { a: null, b: null },
  spawn: { x: -74, z: -6, heading: Math.PI / 2 },
  // 描画専用の民。兵の名簿・人数・当たり・戦功には加えない。
  civilianCrowd: { bands: PEOPLE_BANDS, fireSize: 1 },
  world: {
    seed: 15823, noticeRepeatGap: Infinity, moveLim: 230, time: 'day', mood: 'plain', mist: false, fogFar: 440, smokeFogFloor: 300, fogTint: 0x727d65, hazeColor: 0x929b83, mountainHaze: 0.28, wind: [1, 0.15], muddy: 0.1, riverCross: true,
    // 八十歩の霞で柵と対岸まで白く消さず、描く範囲の内で谷筋を読ませる。
    // 遠景の本数や面数は増やさず、既存の霞の終点だけを百二十歩へ延ばす。
    battleViewDistance: 120,
    // 切岸の近くでは視点の中心だけでなく、描く直前の四隅も土の上へ戻す。
    // 既存の接地処理を田野でも使い、地面の裏から岩や木を見せない。
    terrainContactView: true,
    // 早春の落葉樹と常緑の杉を混ぜ、残雪は日陰の斑だけに残す。
    // 携帯でも足場と描く面を同じ格子にする。崖際の兵・岸石が面に埋まるのを防ぐ。
    winter: true, autumn: true, terrainTriangles: true, keepTerrainGrid: true, groundedSlopeRocks: true, softFarNeedles: true, springSnowPatch: true, spreadFalls: true,
    // 肩越し・近い視点でも、描く直前に手前の九点と視点を地面と水面の上へ戻す。
    // 共通の既存処理をこの戦でも使い、切岸の裏から山肌が消えるのを防ぐ。
    terrainContactView: true,
    patchyGround: true, subtleMudRelief: true,
    // 定義済みの土・枯草・沢の色を実際の山肌にも渡す。共通の緑一色へ戻さない。
    slopeForestTint: true,
    // 屋敷の炎は既存の丸く細る舌を使い、壁に貼った三角の板に見える縁を崩す。
    roundedFire: true,
    // 草の絵の丸い窪みも省く。土と泥だけを替えても、道端に同じ輪が残る。
    plainGrassGround: true,
    // 土塊の陰を塊の周りへ限り、谷道に四角い敷板の継ぎ目を出さない。
    softEarthCrust: true,
    // 乾いた土塊は疎らな吹き溜まりへ。全ての升に縁取りのある粒を並べない。
    sparseEarthCrust: true,
    // 道肩の法線が曲がっても模様を圧縮せず、山肌の細い縞を抑える。
    stableSlopeGrain: true,
    // 切岸の草・苔も法線で座標を回さず、細い縞へ圧縮しない。
    stableCliffGrain: true,
    // 露岩も二方向から別々に読み、曲がる斜面で石の模様を細い縞へ縮めない。
    stableRockProjection: true,
    // 谷道の列は歩調を一人ずつずらす。寄せ・敗走の速さは保ち、腿と腰の振れだけを抑える。
    variedMarch: true, strideLimit: 0.8,
    // 槍衾の段は保ち、構えて待つ手元に呼吸と押し返しの小さなずれを添える。
    livingSpearHedge: true, infantryWeight: true, rearSpearSupport: true,
    reachableSpearGrip: true,
    // 本人の周りだけ、既存の押し分けで味方の肩と笠が重なるのを抑える。
    allyPersonalSpace: 1.2,
    // 膝が折れる間をばらし、横斬りでは肩から地へ寝かせ、胴の厚みと落とす槍を支える。
    fallPaceSpread: 0.35, settleSideFalls: true, groundedFalls: true,
    // 遠目の兵も袴と脛の布を保つ。既存の軽い一体形を使い、具足だけ浮かせない。
    wholeInfantrySilhouette: true, completeCrowdLegs: true,
    // 胴が地を打つ時だけ具足の音と低い土粒。川沿いの湿った土を白煙にしない。
    contactFalls: true, wetEarthBursts: true,
    // 杉の枝先と落ちた布の輪郭を崩す。形と材質は既存の共有処理を使う。
    slopeRockFaces: true, rocks: 130,
    // 遠い山へ均等に散らさず、通る道の肩へ同じ数の岩・下草を寄せる。
    rockBands: [{ x: -92, z: -28, w: 42, d: 12 }, { x: -22, z: -26, w: 26, d: 10 }, { x: 48, z: -20, w: 20, d: 8 }],
    undergrowthBands: [{ x: -108, z: -18, w: 28, d: 5 }, { x: -54, z: -20, w: 24, d: 6 }, { x: -8, z: -21, w: 18, d: 6 }, { x: 74, z: -24, w: 20, d: 7 }],
    allySpearSpread: true, layeredNeedles: true, raggedNeedles: true, crumpledFlags: true,
    // 杉の葉房を幹の周りで不ぞろいに重ね、離れた葉の切れ端を並べない。
    // 既存の共有形を使い、本数・材質・毎コマの処理は増やさない。
    brokenNeedleTiers: true, branchTrees: true, branchFoliage: true, slopingNeedleBoughs: true,
    // 杉だけは既存の枝房へ替え、水平に離れた葉の切れ端を減らす。
    // 房を少し起こして重ねる。本数・当たり・材質は共用し、面数は従来以下。
    cedarBoughs: true, cedarBoughPitch: 0.65, cedarBoughWidth: 1.2,
    // 近い杉の葉房に奥行きを付け、横から黒い切り紙に見える面を減らす。
    foldedNeedleCards: true,
    // 高画質でも用意済みの杉の枝房を使う。低画質の形・本数・当たりは変えない。
    nearCedarBranches: true,
    // 中心だけで据えると、急な切岸で岩の腹と接地の陰が宙へ出る。
    // 描く斜面へ腹の縁まで埋め、根草は空からの光で黒い針にしない。
    // 既存の設営時の処理を使い、道の床・当たり・毎コマの処理は保つ。
    rockDrawGround: true, rockBuriedRim: true, curvedRockTufts: true, litRockTufts: true,
    // 横倒しになった岩も、回転後に斜面へ向く腹と縁を埋める。
    rockSlopeContact: true, rockLowerRimContact: true,
    paths: [ROAD, UPPER_ROAD, PEOPLE_PATH], pathWidth: 8, height, moveWay: valleyWay,
    // 道外の急な山肌を歩ける床にしない。川岸だけの下り制限では登りを防げない。
    // 谷道・里の細道は既存の道の判定で通し、ほかの戦へは広げない。
    climbTan: 0.7,
    // 川岸の切岸へ一歩ずつ下り、崖下から戻れなくなるのを防ぐ。
    // 道の上りと柵の開口は保ち、既存の足場判定で急な下りだけを止める。
    maxWalkDrop: 0.9,
    // 歩こうとして二秒止まった時だけ、柵・川・段差を確かめて一歩横へ抜ける。
    blockedEscape: true, blockedEscapeAfter: 2,
    blockedHint: () => '足が止まった。谷道の内で列の脇へ。柵の口は矢印の方じゃ',
    streams: [{ pts: RIVER, w: 3, depth: 2.8 }],
    tint(x, z, h, c) {
      const d = roadDistance(x, z);
      const litter = 0.5 + 0.5 * Math.sin(x * 0.24 + Math.cos(z * 0.19) * 2) * Math.cos(z * 0.31 - x * 0.08);
      // 屋敷の平場は踏まれた土。谷道の草の帯を柵の内へ引き込まない。
      if (inYard(x, z)) {
        c.setRGB(0.33 + litter * 0.025, 0.285 + litter * 0.02, 0.19 + litter * 0.015);
        return;
      }
      // 土の中心は五歩ほど。縁にゆるい曲がりと落葉を混ぜ、道幅を色だけで細める。
      // 兵が通る床・柵の口・川岸の高さや道順は変えない。
      if (d < 16) {
        const edgeAt = 4.8 + 0.65 * Math.sin(x * 0.075 + z * 0.025);
        let edge = Math.max(0, Math.min(1, (d - 2.5) / (edgeAt - 2.5)));
        edge = edge * edge * (3 - 2 * edge);
        // 道端も早春の枯草色へつなぐ。十六歩の境で緑の帯を切らない。
        c.setRGB(0.36 - edge * 0.06 + litter * 0.035, 0.285 + edge * 0.02 + litter * 0.025, 0.20 + edge * 0.005 + litter * 0.015);
        return;
      }
      // 大きな土・苔・露岩の斑。近い山肌にも濃淡を残し、緑の一枚壁を避ける。
      // 色は地形を作る時だけ計算し、毎コマの道具や描画を増やさない。
      const patch = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.035) * 1.6) * Math.cos(z * 0.055 - x * 0.02);
      const damp = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(x * .19 + Math.sin(z * .07) * 1.3)) * 3.5), 2);
      const earth = Math.max(0, Math.min(1, (patch - 0.35) / 0.45));
      const rock = Math.max(0, Math.min(1, (h - valleyFloor(x, z) - 12) / 20)) * earth;
      let hill = Math.max(0, Math.min(1, (d - 16) / 12));
      hill = hill * hill * (3 - 2 * hill);
      // 早春の山肌は枯れ草と土を基調にし、湿った斑だけ苔色を残す。
      c.setRGB(0.30 + litter * 0.035 + hill * (-0.025 + litter * 0.01 + earth * 0.085 + rock * 0.055 - damp * .055),
        0.305 + litter * 0.025 + hill * (-0.045 + litter * 0.03 - earth * 0.035 - damp * .035),
        0.205 + litter * 0.015 + hill * (-0.005 + litter * 0.02 + earth * 0.04 + rock * 0.045 - damp * .04));
    },
    clear: (x, z) => roadDistance(x, z) < 12 || peopleDistance(x, z) < 12 || Math.hypot(x - TANO.x, z - TANO.z) < 24,
    // 道と里を空け、細枝の林から遠い杉へなだらかにつなぐ。
    // 一律三十六歩で林床まで切ると、斜面に裸の帯が現れる。本数は増やさない。
    // 百五十本のうち六十本を、通る谷の山側の六か所へ振り分ける。
    // 遠山へ散るだけの林を避ける。道・川・里の空地には立てず、通行を保つ。
    trees: 90, clearGroves: true,
    groves: [
      { x: -145, z: -30, r: 8, n: 10, kind: 'sugi' },
      { x: -92, z: -36, r: 9, n: 10, kind: 'sugi' },
      { x: -40, z: -32, r: 8, n: 10, kind: 'sugi' },
      { x: 12, z: -32, r: 8, n: 10, kind: 'sugi' },
      { x: 60, z: -42, r: 8, n: 10, kind: 'sugi' },
      { x: 106, z: -65, r: 9, n: 10, kind: 'sugi' },
    ],
    treeDensity: (x, z) => {
      if (peopleDistance(x, z) < 12) return 0;
      let edge = Math.max(0, Math.min(1, (roadDistance(x, z) - 22) / 26));
      edge = edge * edge * (3 - 2 * edge);
      const grove = 0.65 + 0.35 * Math.sin(x * 0.08 + Math.cos(z * 0.06) * 2);
      // 沢筋へ杉を寄せ、乾いた岩棚は空ける。本数と共有の形は保つ。
      const wet = Math.max(0, 1 - Math.abs(Math.sin(x * .19 + Math.sin(z * .07) * 1.3)) * 2);
      return edge * grove * (.45 + wet * .55);
    },
    // 常緑の林は枝先を崩した杉を主にし、裸木は上の専用の林で混ぜる。
    // 同じ本数・共有の形を使い、近い斜面に平たい松の葉の段を並べない。
    sugiAt: () => 1, noBamboo: true, tufts: 520, tuftTint: 0x80745f, slopeForest: 0.5, cliffRock: 0.42,
    // 手前に足す草も同じ枯草色へ。白い穂だけが発光する帯を残さない。
    nearGrassTint: 0x80745f,
    fleeOut: (x, z, team) => team === 1 && x > 175,
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags, W = rt.world;
    // 本人と兵で同じ切岸の判定を使う。押し合いで外れた兵は既存の足場復帰で戻る。
    // この戦にだけ加え、既存の通行止めも残す。関数は設営時に一度だけ作る。
    (W.noClimb || (W.noClimb = [])).push((x, z) => tanoCliffBlocked(W, x, z));
    // 専用の札の決まりを有効にする。共通の画面は戦の名前を自動では付けない。
    rt.hud.root.classList.add('tano');
    // 傷の長い文で格子が札の外へ広がらないよう、田野だけ幅内で折り返す。
    const layout = document.createElement('style');
    layout.textContent = `
      /* まだ下知のない開戦直後も、隠した報せの釦の枠だけを出さない。 */
      html body #hud.tano #battle-log-entry[hidden] { display:none !important; }
      /* 左端へ寄せた欄に、中央配置用のずらしを残さない。 */
      html body #hud.tano #battle-notices:not(.choosing) {
        transform:none !important;
      }
      html body #hud.tano #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
        position:static !important; transform:none !important;
        width:auto !important; min-width:0 !important; max-width:100% !important;
        white-space:normal !important; overflow-wrap:anywhere !important;
        box-sizing:border-box;
      }
      html body #hud.tano .bl #h-hp.hp {
        grid-template-columns:max-content minmax(0,1fr) !important;
        min-width:0; max-width:calc(100vw - 40px);
      }
      html body #hud.tano .bl #h-hp.hp > :is(i,em) {
        min-width:0; max-width:100%; box-sizing:border-box;
      }
      html body #hud.tano .bl #h-hp.hp em {
        justify-self:stretch; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
        white-space:normal !important; word-break:normal !important; overflow-wrap:anywhere !important;
      }
      html body #hud.tano .bl #h-hp.hp em small {
        white-space:normal; word-break:normal; overflow-wrap:anywhere;
      }
      html body #hud.tano .bl #h-hp.hp em svg { width:18px; height:20px; }
      /* 防御の札は端に固定し、敵の顔と槍先を空ける。指を置いたまま動かさない。 */
      html.touch body #hud.tano #wait-guard {
        left:auto !important; right:calc(16px + env(safe-area-inset-right,0px)) !important;
        top:auto !important; bottom:calc(16px + env(safe-area-inset-bottom,0px));
        width:248px; max-width:calc(100vw - 32px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));
        min-height:64px; height:auto; border-width:3px; border-radius:8px;
        grid-template-columns:20px minmax(0,1fr) 20px; column-gap:8px; row-gap:2px;
      }
      html.touch.tc-sw body #hud.tano #wait-guard {
        left:calc(16px + env(safe-area-inset-left,0px)) !important; right:auto !important;
        bottom:calc(120px + env(safe-area-inset-bottom,0px));
      }
      html.touch body #hud.tano #wait-guard svg:first-child { width:20px; height:32px; }
      html.touch body #hud.tano #wait-guard svg + svg { width:20px; height:28px; }
      html.touch body #hud.tano #wait-guard :is(span,small) {
        min-width:0; width:auto; font-size:max(16px,calc(16px * var(--text-scale,1)));
        line-height:1.4; white-space:normal; overflow-wrap:anywhere;
      }
      /* 操作は端の釦にまとめ、上には谷道・崖道・柵の任務を残す。 */
      html.touch body #hud.tano.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:has(.guard-caption) {
        display:none !important;
      }
      /* 共通の「操作中は本文を畳む」指定より、田野の持ち場の下知を優先する。
         防御釦の出入りで、本文も隠れて空の墨の帯になるのを防ぐ。 */
      html body #hud.tano #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand) #obj-list,
      html body #hud.tano #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand) #obj-list li.cur .obj-text,
      html body #hud.tano #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand) #obj-list li.cur .obj-now {
        display:block !important;
      }
      html body #hud.tano #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand) #obj-list li.cur .obj-now {
        font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
        line-height:1.4 !important; white-space:normal !important;
      }
      /* 横の携帯は左上の欄へ。退く札も中央の敵と槍先に重ねない。 */
      @media (max-height:500px) {
        /* 開戦前は読む高さを取り、勝つ条件と出陣の釦を切らない。本文は送れる。 */
        html body #hud.tano #intro > .card {
          width:min(480px,calc(100vw - 32px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))) !important;
          max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important;
          box-sizing:border-box;
        }
        html body #hud.tano #battle-notices:not(.choosing):not(:has(#objectives.expand)),
        html body #hud.tano.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:calc(16px + env(safe-area-inset-left,0px)) !important;
          right:auto !important; top:calc(16px + env(safe-area-inset-top,0px)) !important;
          width:min(280px,40vw) !important; gap:8px;
          max-height:calc(100% - 160px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important;
        }
        /* 共通の道案内は重ねた識別子で中央上へ固定する。田野でも同じ強さで戻す。 */
        html:root body #hud.tano.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand),
        html body #hud.tano #battle-notices:not(.choosing) #objectives:not(.expand),
        html body #hud.tano.combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; min-width:0 !important; max-width:100% !important;
          height:auto !important; box-sizing:border-box;
        }
        html body #hud.tano #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
          font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
          line-height:1.4 !important;
        }
      }
      /* 縦に余裕のあるパソコンでは、任務と声を左に積み、右の地図を空ける。 */
      @media (min-height:501px) {
        html:not(.touch) body #hud.tano #battle-notices:not(.choosing),
        html:not(.touch) body #hud.tano.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:calc(16px + env(safe-area-inset-left,0px)) !important;
          right:auto !important; top:calc(104px + env(safe-area-inset-top,0px)) !important;
          width:min(320px,30vw) !important; gap:8px;
          max-height:calc(100% - 304px) !important;
        }
        /* 射撃待ち・集合でも、軍勢と方角の帯に任務を重ねない。 */
        html:root:not(.touch) body #hud.tano.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand),
        html:not(.touch) body #hud.tano #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
        html:not(.touch) body #hud.tano.combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; max-width:100% !important; min-width:0;
          height:auto !important; flex:0 0 auto;
        }
        html:not(.touch) body #hud.tano #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now) {
          white-space:normal !important; overflow-wrap:anywhere;
          height:auto !important; max-height:none !important; overflow:visible;
        }
      }
    `;
    rt.hud.root.appendChild(layout);
    const dispose = rt.dispose;
    rt.dispose = function (...args) {
      layout.remove(); rt.hud.root.classList.remove('tano');
      return dispose.apply(this, args);
    };
    F.ek = 0; F.ak = 0;
    // 午前の光を谷の向きに合わせる。＋横は東北東、＋奥行きは南南東。
    // 日付は旧暦三月十一日。日の高さ・天気は推定で、史実の確定値ではない。
    // 共通の昼の北寄りの日差しを替え、既存の光と空で同じ方向を使う。
    W.sunOffset.set(36, 84, 78).normalize().multiplyScalar(120);
    // 急な山肌に影自身の縞を残さない。田野の光だけを調整する。
    W.sun.shadow.normalBias = 0.12;
    // 低い朝日が当たる切岸へ、影の深さを押し込みすぎて網目を出さない。
    // 影の大きさ・光源・足場は保ち、この戦の深さの補正だけを弱める。
    W.sun.shadow.bias = -0.00008;
    W.skyMat.uniforms.sunDir.value.copy(W.sunOffset).normalize();
    W.look.sunDir.copy(W.skyMat.uniforms.sunDir.value);
    // 谷の陰でも袖・手・威糸を読める散乱光。
    // この戦の既存の光だけを調整し、光源や毎コマの処理は増やさない。
    W.baseHemi = W.hemi.intensity * 1.6;
    W.hemi.intensity = W.baseHemi;
    W.hemi.groundColor.setHex(0x665d4b);
    // 乾いた谷道が空を白く映さないよう、この戦の地面だけ照りを抑える。
    // 人の陰を見せる散乱光と、道・川岸の足場は保つ。
    W.terrain.material.envMapIntensity = 0.12;
    W.terrain.material.roughness = 1;
    // 土塊と足形の同じ絵を敷き詰めず、粒と連続した土色を共有する。足跡と轍は既存の処理に任せる。
    W.groundU.tDirt.value = dirtTex(true);
    W.groundU.tMud.value = mudTex(true);
    // 近い川岸も粒の土を共用し、切岸に同じ網目の絵を並べない。
    W.groundU.tBank.value = W.groundU.tDirt.value;
    tanoWoods(rt);
    tanoRoadWear(rt);
    // 突きのたびに下向きの傾きが積もるのを、この戦の肩越し視点だけで止める。
    // 自分で見回している間と、狙い・大将の目はそのまま使える。
    const player = rt.player, normalCamera = player.updateCamera;
    // この戦の歩行と迂回に同じ川岸の判定を使う。ほかの戦の判定は替えない。
    const normalWalkable = W.walkable;
    W.walkable = function (x, z, y) {
      return tanoBankFoot(this, x, z) && normalWalkable.call(this, x, z, y);
    };
    // 体の押し分けは歩行判定の後に位置を動かす。道肩を越す分だけ止め、
    // 岸に沿うずれは残す。兵を印へ移したり、敵を消して段を進めたりしない。
    const normalBodies = rt.army.bodies;
    rt.army.bodies = function (u, dt) {
      const x = u.pos.x, z = u.pos.z;
      const safe = u.alive && !u.isStruct && tanoBankFoot(W, x, z);
      normalBodies.call(this, u, dt);
      if (!safe || tanoBankFoot(W, u.pos.x, u.pos.z)) return;
      if (tanoBankFoot(W, u.pos.x, z)) u.pos.z = z;
      else if (tanoBankFoot(W, x, u.pos.z)) u.pos.x = x;
      else { u.pos.x = x; u.pos.z = z; }
    };
    const normalStep = player.canStep;
    player.canStep = function (x0, z0, x, z, y) {
      // 小刻みの歩行と兵の押し返しでも、川岸の下りへ入り続けない。
      // 谷道の中央・屋敷・道へ戻る一歩は従来の歩行判定を使う。
      if (z > 0 && !inYard(x, z)) {
        const d = distToPolyline(x, z, ROAD);
        if (d > 6 && d > distToPolyline(x0, z0, ROAD) + 0.000001 &&
            W.heightAt(x, z) < valleyFloor(x, z) - 0.45) return false;
      }
      return normalStep.call(this, x0, z0, x, z, y);
    };
    const normalEscape = player.escapeBlocked;
    player.escapeBlocked = function (vx, vz) {
      const C = F.dp?.cur, p = this.u.pos;
      if (C && !inYard(p.x, p.z) && distToPolyline(p.x, p.z, ROAD) < 8) {
        // 接敵中は残る敵へ、射撃待ちは待機線へ。空の集合点へ押し戻さない。
        const goal = C.seeking ? C.enemyAt : C.waiting ? C.waitAt : C.at;
        const q = valleyWay(rt.army, this.u, goal);
        const angle = Math.atan2(q.x - p.x, q.z - p.z);
        // 入力の向きへ戻る輪を避け、谷道の進む側から列の脇を探す。
        // 柵・川・段差は二十センチずつ共通の判定で確かめる。
        for (let i = 0; i < 5; i++) {
          const a = angle + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 4);
          for (let d = 1.2; d <= 2.4; d += 0.6) {
            const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
            if (distToPolyline(x, z, ROAD) > 3 || !this.clearWalkTo(x, z, false)) continue;
            let empty = true;
            const y = W.heightAt(x, z);
            for (const other of rt.army.units) {
              if (other === this.u || !other.alive || other.isStruct || Math.abs(other.pos.y - y) >= 1.8) continue;
              if (Math.hypot(other.pos.x - x, other.pos.z - z) < 0.8) { empty = false; break; }
            }
            if (!empty) continue;
            p.set(x, y, z); this.vel.x = this.vel.z = 0;
            return;
          }
        }
      }
      normalEscape.call(this, vx, vz);
    };
    const lastLook = new THREE.Vector3(135, W.heightAt(135, -3) + 1.4, -3);
    const lastEye = new THREE.Vector3(114, W.heightAt(114, -12) + 3, -12);
    const levelLook = new THREE.Vector3();
    player.updateCamera = function (dt, camera) {
      if (!this.overHold && !this.aiming && !this.fpWanted() && this.lookIdle > 0.7) {
        this.pitch = Math.max(-0.28, Math.min(0.22, this.pitch));
      }
      normalCamera.call(this, dt, camera);
      if (this.u.alive && !rt.over && !this.overHold && !(this.overK > 0.01) && !this.aiming && !this.fpWanted() && !(this.fpK > 0.01) && !this.cine && !this.camShot && !(this.introT > 0) && this.lookIdle > 0.7) {
        // 位置は壁・屋根の判定内で決め、ここでは見下ろす角度だけ抑える。
        const eye = camera.position;
        camera.getWorldDirection(levelLook);
        const horizontal = Math.hypot(levelLook.x, levelLook.z);
        if (horizontal > 0.001) {
          levelLook.y = Math.max(-horizontal * 0.22, Math.min(horizontal * 0.22, levelLook.y));
          levelLook.add(eye); camera.lookAt(levelLook);
        }
      }
      // 終幕は屋敷の脇から父子を見る。上へ引く共通の勝利視点を重ねない。
      if (F.lastView) { camera.position.copy(lastEye); camera.lookAt(lastLook); }
    };
    // 後続の大半は戦場の外。近づける谷道に軽い形だけの兵を置かない。
    // 粗い地形の補間に水面を引かせず、上流から下流へ下る高さをそろえる。
    // 作る時に一度だけ直し、深さの判定も同じ水面を使う。
    const stream = W.def.streams[0], surface = stream.surface;
    if (surface && stream.mesh) {
      const positions = stream.mesh.geometry.attributes.position;
      let level = Infinity;
      for (let i = 0; i < surface.length; i += 3) {
        level = Math.min(level, surface[i + 2]);
        surface[i + 2] = level;
        positions.setY(i / 3 * 2, level); positions.setY(i / 3 * 2 + 1, level);
      }
      positions.needsUpdate = true; stream.mesh.geometry.computeVertexNormals();
      stream.mesh.geometry.computeBoundingSphere();
    }
    tanoRiver(rt, stream);
    // 谷・平屋敷の柵は信長公記。崖道の寸法と鉄砲の運用は遊びのための復元。
    F.hist = { valley: 'HIST_A', fence: 'HIST_A', cliffRoad: 'HIST_B', volley: 'GAME_C' };
    // 城ではなく民家を囲む急ごしらえの柵。西の口だけは六メートル開ける。
    F.fence = wallLine(rt, [[104, -3], [104, -14], [144, -14], [144, 16], [104, 16], [104, 3]], { team: 1, hp: 180, name: '田野の柵', segLen: 6, meshOpt: { h: 1.8 } });
    // 黒い板倉に見せず、土壁・格子・礎石を既存の近景用の家で示す。
    // 屋敷の位置・戸口・当たりは変えず、壁の仕上げだけを復元する。
    rt.scene.add(hut(W, 128, 0, 7, 5, 0.2, { wall: 0xa18e70, minka: false, groundedHome: true }), tawara(W, 138, 7, 0.2, 3));
    // 民は屋敷の柵内に足さず、山側の里の家の前で遠巻きに見物する。
    rt.scene.add(hut(W, 86, -47, 5, 4, 0, { wall: 0x9b876b, groundedHome: true }), hut(W, 150, -47, 5, 4, 0, { wall: 0x8f7e63, groundedHome: true }));
    // 道沿いに残る作業小屋は推定の補景。軍の施設とは断定しない。
    // 道・射線から外し、当たりと民の発生を足さない。屋根と土壁の材質は既存の物を共用。
    for (const [x, z, rot] of [[-108, -19, .15], [-18, -20, -.2]]) {
      rt.scene.add(hut(W, x, z, 4.8, 3.6, rot, { h: 2, wall: 0x94816b, groundedHome: true, minka: false, solid: false, thatchTies: true }));
    }
    // 崖道の幟は山側の肩へ。兵と肩越しの目が通る道の内に大きな布を立てない。
    for (const [x, z] of [[-40, -7], [34, -10], [108, -9], [140, 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 5));
    // 狭い谷の先手も二間半の長柄へ。三間半の竿が密集して敵と道を隠すのを抑える。
    // 寸法の配分は復元値。人数・兵種・道順は保ち、既存の槍を共用する。
    F.front = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の先手の槍', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[0]), facing: Math.PI / 2, width: 4, yariRanks: 4, aggro: 9, noAI: true, formation: 'yari' }, tanoAllyDress([uS(6), uA(18, 'naga')], { ...TANO_KIT, flag: 'takigawa' }));
    // 指揮所と後詰も既存の二間半を使う。装備配分は復元値。
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益と近習', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[3]), facing: Math.PI / 2, aggro: 4, noAI: true, guardOn: true, formation: 'ring' },
      tanoAllyDress([{ type: 'busho', n: 1, o: { name: '滝川一益', horse: false, invuln: true, hat: 'kabuto_w' } }, uS(4), uA(4, 'naga')], { ...TANO_KIT, flag: 'takigawa' }));
    F.taki.leader = F.taki.units.find((u) => u.type === 'busho');
    // 公記で追手を率いるのは滝川。後詰の持ち場を河尻本人の陣と断定しない。
    // 組頭の兵種・人数・下知は保ち、実名の将だけを推定の役名へ替える。
    F.kawa = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の後ろの手', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[1]), facing: Math.PI / 2, colW: 2, aggro: 12, noAI: true, ai: true, formation: 'column' },
      tanoAllyDress([{ type: 'busho', n: 1, o: { name: '後詰の組頭', horse: false, invuln: true } }, uS(6), uA(13, 'naga')], ODA));
    F.kawa.leader = F.kawa.units.find((u) => u.type === 'busho');
    F.taki.leader.allyOk = true; F.kawa.leader.allyOk = true;
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の鉄砲組', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[2]), facing: Math.PI / 2, width: 3, ranks: 2, aggro: 6, noAI: true, order: 'hold' }, tanoAllyDress([{ type: 'gun', n: 6 }], { ...TANO_KIT, flag: 'takigawa', flagScale: 0.55 }));
    F.oda = [F.front, F.tgun, F.taki, F.kawa];
    // 長い後列が曲がり角で先頭を待たせ続けないよう、歩く列を詰める。
    // 槍兵三人が持ち場に着けば構え、後列も歩いて追いつく。
    for (const g of F.oda) { g.spacing = 1.7; g.rankSpacing = 1.1; }
    // 横を広げた分だけ前後を詰めると笠と腕が重なる。先手の列間は一歩以上残す。
    // 人数・道幅・到着を待つ人数は保ち、後列だけに歩く余地を作る。
    // 接敵中は共通の処理で横も縦も詰まるため、後列の間をもう半歩残す。
    F.front.spacing = 2; F.front.rankSpacing = 1.7;
    // 後詰も接触時の横幅が一歩を下回らないようにする。先手への加勢と人数は保つ。
    F.kawa.spacing = 2; F.kawa.rankSpacing = 1.5;
    F.front.arriveCount = 3; F.kawa.arriveCount = 3;
    // 射手全員の後列待ちで合図を逃さない。先の二人が着けば射線を確かめる。
    F.tgun.arriveCount = 2;
    // 道順と将の下知は保ち、到着した先手と後詰の無名兵だけが隙へ寄せる。
    F.front.frontlineMobilize = true; F.kawa.frontlineMobilize = true;
    placeGroup(rt, F.front, -80, 0);
    placeGroup(rt, F.tgun, -94, -4);
    placeGroup(rt, F.taki, -106, 0);
    placeGroup(rt, F.kawa, -118, 0);
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -86, z: 0 }, Math.PI / 2, [{ kind: 'spear', n }]);
    // 守る兵は初めから地形に置く。共通の増援処理で背後へ出し直さない。
    // 守兵も接触時に肩と兜が重ならない間を残す。三列の崖道の幅には収める。
    const guard = (name, slot, list, width = 6) => enemyGroup(rt, { fixed: true, noAI: true, guardOn: true, faction: 'takeda', name, anchor: jinkeiPoint(TANO_DEFEND, TANO_DEFEND.sonae[slot]), facing: -Math.PI / 2, order: 'hold', width, spacing: 2, rankSpacing: 1.5, aggro: 5, morale: 100, noRout: true, fleeDir: { x: 1, z: 0 }, formation: 'yari', yariRanks: 3 }, tanoGuardDress(list));
    F.defenders = [
      guard('谷道の武田勢', 0, [uS(6)], 8),
      guard('谷道の後ろの侍', 1, [uS(8)], 8),
      guard('土屋昌恒の衆', 2, [{ type: 'busho', n: 1, o: { name: '土屋昌恒', horse: false, hat: 'kabuto_m' } }, uS(8)], 5),
      guard('田野の柵を守る侍', 3, [uS(10)], 7),
      guard('武田の最後の侍', 4, [uS(6)], 4),
    ];
    // 奥の六人は柵が落ちるまでは屋敷の控え。先の段で討ち尽くさない。
    placeGroup(rt, F.defenders[4], 134, -8);
    for (const u of F.defenders[4].units) { u.noTarget = true; u.invuln = true; }
    // 父子二人も四十一人に含める。屋敷の奥に近習を置き、討ち取りの的にしない。
    F.principals = enemyGroup(rt, { fixed: true, noAI: true, faction: 'takeda', name: '武田父子の居所', anchor: { x: 138, z: -6 }, facing: -Math.PI / 2, aggro: 0, noRout: true, stay: true, formation: 'column', civ: true },
      tanoGuardDress([{ type: 'busho', n: 1, o: { name: '武田勝頼', horse: false, noTarget: true, invuln: true } }, { type: 'samurai', n: 1, o: { name: '武田信勝', horse: false, noTarget: true, invuln: true } }]));
    // 無名の侍の呼び名は仮名。本人と同じ名を避け、実名の土屋は保つ。
    const names = ['源六', '平八', '彦七', '新八', '又六', '弥三郎', '喜助'];
    for (const g of F.defenders) for (const u of g.units) {
      u.duelDone = true;
      if (!u.name) {
        let n = u.id % names.length;
        if (names[n] === rt.G.name) n = (n + 1) % names.length;
        u.nanori = `武田が家来、${names[n]}なり！`;
      }
    }
    for (const g of rt.army.groups) if (g.team === 0 && !g.civ) {
      g.noRout = true;
      if (g.isPlayerSquad) { g.spacing = 2; g.rankSpacing = 1.5; g.width = 3; }
    }
    rt.setPhase('brief');
    rt.obj('main', '谷道の先手に加われ', 'main');
    rt.marker('dp', FIRST_JOIN, '谷道の先手', { h: 3, alwaysDistance: true });
    rt.banner('谷の奥に、武田の最後の旗', '勝頼父子は田野の屋敷にいる');
    rt.say('滝川一益', '前の旗へ続け。川へ下りず、谷道の敵を押せ', 4);
    rt.after(5, () => this.valley(rt));
  },
  valley(rt) {
    const F = rt.flags;
    if (F.started || F.ending || rt.over || !rt.player.u.alive) return;
    F.started = true;
    // 初めからいる守兵と到着で進める。果たせない任務は失敗として閉じる。
    const steps = [
      { phase: 'approach', kind: 'move', at: FIRST_JOIN, label: '谷道の先手', text: '進み太鼓と法螺に従い、先手へ' },
      { phase: 'valley', kind: 'hold', at: { x: -46, z: 0 }, guards: [0, 1], label: '谷道の先手', text: '先手と谷道の敵を退けよ' },
      { phase: 'narrow', kind: 'hold', at: { x: 22, z: 2 }, guards: [2], label: '土屋昌恒の崖道', text: '射手の後ろで鉄砲の合図を待て' },
      { phase: 'fence', kind: 'fight', at: { x: 98, z: 0 }, guards: [3], label: '田野の柵の口', text: '出てくる敵を退け、柵の口へ' },
      { phase: 'tano', kind: 'hold', at: { x: 124, z: -8 }, guards: [4], label: '屋敷の奥', text: '柵の口から入り、奥の敵を退けよ' },
    ];
    // 手当てができる命の六割未満に合わせる。六割台で退いて待ち続けない。
    F.dp = { on: true, i: -1, steps, ctx: { friends: () => F.oda, routeFight: true, botTreatAt: 0.6, botSeek: 100, botSeekHold: true,
      // 手当てへ退く時も谷の曲がりと西の柵口を通す。
      // 味方の背後でも、川底・切岸を休む場所に選ばない。
      withdrawWay: valleyWay,
      botBackAllowed: (b, x, z) => (inYard(x, z) || distToPolyline(x, z, ROAD) <= 6) &&
        b.world.slopeTan(x, z) <= 0.7 && b.world.walkable(x, z, b.world.heightAt(x, z)),
      // 次の持ち場の近くを通るだけでは追い始めない。本人への打ち込みには応じる。
      botFoeAllowed: (u) => F.dp.cur.groups.includes(u.group) ||
        Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 4.4 &&
        (u.atk?.target === rt.player.u || u.swing && !u.swing.done && u.swing.target === rt.player.u ||
          u.charging && u.target === rt.player.u),
    }, cur: null };
    this.next(rt);
  },
  next(rt) {
    const F = rt.flags, D = F.dp, s = D.steps[++D.i];
    rt.unmark('dp'); rt.unmark('tanoEnemy'); rt.unzone('dp');
    if (!s) { D.on = false; this.win(rt); return; }
    const groups = (s.guards || []).map((i) => F.defenders[i]);
    D.cur = { s, at: s.at, waitAt: { x: s.at.x - 20, z: s.at.z }, waiting: s.phase === 'narrow', goal: { ...s.at }, enemyAt: { x: 0, z: 0 }, turnAt: { x: 0, z: 0 }, enemyCount: 0, enemyDistance: Infinity, groups, columns: F.oda.concat(groups), botRadius: Infinity, support: 0, settled: 0, outT: 0, t0: rt.t, sampledAt: rt.t, nudgeAt: rt.t };
    F.pressureStage = D.i; F.pressureSince = rt.t; F.pressureSayAt = Infinity;
    rt.setPhase(s.phase);
    const task = rt.obj('main', s.text, 'main');
    // 合流の進み太鼓を、接敵後の押し合いや射撃待ちの札へ持ち越さない。
    task.cue = ''; task.cueT = 0;
    if (s.phase === 'approach') {
      tanoSignal(rt, 'susume', F.taki, '合図：太鼓の早打ちと法螺貝＝進め');
      rt.say('滝川の組頭', '進み太鼓じゃ。法螺に従い、谷道の先手へ続け', 3.5);
    }
    if (s.phase === 'tano') {
      // 侍六人と父子二人。史料の四十一人の内から残った小勢を見せる。
      for (const u of F.defenders[4].units) { u.noTarget = false; u.invuln = false; }
      rt.climax = true;
      // 火の位置と大きさは場面の補完。父子を炎で隠さず、屋敷側だけに置く。
      rt.world.addFire(128, 2, { size: 2.4, h: 1, blackSmoke: true });
      rt.world.addFire(131, 3, { size: 1.8, h: 0.8, blackSmoke: true });
      rt.say('物見', '柵の口から入れ。屋敷の脇を進み、奥の敵を退けよ', 4);
    }
    if (s.phase === 'narrow') rt.say('鉄砲頭', '射手の前を空けよ。鉄砲が鳴ったら槍で押せい', 3.5);
    // 交戦中は到着点へ振り返らせない。敵を退けたら組をそろえる印を戻す。
    const current = D.cur;
    // 射撃待ちの印は槍の待機位置。射手より前の寄せ口へ案内しない。
    rt.marker('dp', () => current.seeking || current.routeTurn ? null : current.waiting ? current.waitAt : s.at,
      () => current.waiting ? F.tgun.order !== 'hold' ? '鉄砲を待つ印' : '射手の後ろの待ち場' : s.label, { h: 3, alwaysDistance: true });
    // 混戦でも最寄りの敵一人だけを短い名で示す。旗のない侍も見失わせない。
    // 父子・次の持ち場は示さず、到着の印と同時には出さない。距離は近くで省く。
    rt.marker('tanoEnemy', () => D.on && !F.ending && current.seeking && !current.routeTurn ? current.enemyAt : null,
      () => current.enemyDistance <= 6 ? '敵' : '残る敵', { red: true, h: 2.6 });
    rt.zone('dp', s.at.x, s.at.z, s.kind === 'move' ? 8 : 12);
    sendColumn(rt, s.at, s.phase);
    for (const g of groups) {
      if (!fighting(g)) continue;
      // 今の持ち場だけが打って出る。次の守兵は本人を追わず、その場で迎える。
      g.guardOn = false;
      if (s.phase === 'tano') {
        g.frontlineMobilize = false; g.order = 'hold'; g.path = null;
        g.formation = 'yari'; g.facing = -Math.PI / 2; g.onArrive = null;
        continue;
      }
      g.frontlineMobilize = true;
      if (s.phase === 'fence') {
        // 柵の内で待つだけにせず、既存の十人が西の口から打って出る。
        g.aggro = 12;
        roadOrder(g, s.at.x - 10, s.at.z, 'yari');
        D.cur.sortieAt = rt.t + 4;
        continue;
      }
      // 守兵の後列も曲がり角を通す。寄せ口と到着後の槍衾は変えない。
      roadOrder(g, s.at.x + 6, s.at.z, 'yari');
    }
    // 持ち場へ着くまでは射手が槍の後ろから勝手に撃たない。
    F.tgun.holdFire = true; F.tgun.fire = true;
    if (s.phase !== 'narrow') F.tgun.onArrive = () => { F.tgun.order = 'hold'; F.tgun.path = null; F.tgun.formation = 'line'; F.tgun.facing = Math.PI / 2; F.tgun.onArrive = null; F.tgun.holdFire = false; };
  },
  flowTick(rt, dt) {
    const F = rt.flags, D = F.dp, C = D && D.cur;
    if (!D || !D.on || !C || rt.over || !rt.player.u.alive) return;
    // 道の後列待ちだけをほどく。時刻で敵全員の狙いを本人へ変えない。
    if (rt.t >= (F.pressureAt || 0)) pressureTick(rt, D.i, NO_FOES, C.columns, '');
    if (C.s.phase === 'narrow' && !F.volleyQueued && !F.narrowPush && F.tgun.order === 'hold' && F.tgun.count) {
      F.volleyQueued = true;
      C.gunWaitAt = rt.t;
      volleyAt(rt, { guns: () => F.dp.cur.s.phase === 'narrow' && !F.narrowPush && fighting(F.defenders[2]) ? [F.tgun] : [], foes: () => [F.defenders[2]], near: 45, max: 30, drop: 0, who: '鉄砲頭',
        line: '鉄砲が鳴ったぞ。槍をそろえて押せ',
        onFire: () => {
          F.volley = true;
          if (F.dp.cur === C) {
            rt.obj('main', '鉄砲が鳴った。陣太鼓に従い崖道を押せ', 'main');
            tanoSignal(rt, 'kakari', F.front, '合図：陣太鼓の連打＝槍で押せ');
            rt.say('滝川の組頭', '鉄砲が鳴ったぞ。陣太鼓に合わせ、槍の組、押せい', 3.5);
          }
          if (F.dp.cur.s.phase === 'narrow' && fighting(F.front)) roadOrder(F.front, F.dp.cur.at.x + 6, F.dp.cur.at.z, 'yari');
          battleEvent(rt, EVENT_VOLLEY, F.tgun.anchor, F.tgun, 0, true, '崖道に鉄砲の音が返る');
        } });
    }
    F.flowScan = (F.flowScan || 0) - dt;
    if (F.flowScan > 0) return;
    F.flowScan = 0.4;
    // 射手の損耗や味方の割り込みで撃てなくても、槍の寄せへ切り替える。
    // 撃っていない鉄砲の音・煙・手柄は作らない。
    if (C.s.phase === 'narrow' && !F.volley && !F.narrowPush &&
        (!fighting(F.tgun) || (C.gunWaitAt !== undefined && rt.t - C.gunWaitAt >= 12) || rt.t - C.t0 >= 45)) {
      F.narrowPush = true; F.tgun.holdFire = true; F.tgun.fire = false;
      let armed = false, loaded = false;
      for (const u of F.tgun.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.type !== 'gun' || u.gunAmmo === 0) continue;
        armed = true;
        if (u.cd <= 0 && !u.reload && !(u.stagger > 0)) loaded = true;
      }
      rt.say('鉄砲頭', !fighting(F.tgun) ? '射手が倒れ、撃てる者がおらぬ' : !armed ? '撃てる玉が尽きた'
        : F.tgun.order !== 'hold' ? '射手が崖道へ着けぬ'
          : !loaded ? '玉込めが間に合わぬ'
            : '敵へ筒先が通らぬ', 3.5);
      rt.obj('main', '鉄砲を待たず、槍の組と崖道を押せ', 'main');
      // 押せの札・太鼓・槍の前進を同時に切り替え、本人だけを先へ出さない。
      roadOrder(F.front, C.at.x + 6, C.at.z, 'yari');
      tanoSignal(rt, 'kakari', F.front, '合図：陣太鼓の連打＝鉄砲を待たず押せ');
      rt.say('滝川の組頭', '鉄砲は待たぬ。槍の組と崖道を押せ', 3.5);
    }
    const elapsed = Math.max(0, rt.t - C.sampledAt); C.sampledAt = rt.t;
    const p = rt.player.u.pos;
    // 柵の段だけ四秒ごとに寄せ直す。行軍中は道順を最初へ戻さない。
    if (C.s.phase === 'fence' && rt.t >= C.sortieAt) {
      C.sortieAt = rt.t + 4;
      const g = F.defenders[3];
      if (fighting(g) && p.x >= 60 && p.x < 104 && distToPolyline(p.x, p.z, ROAD) < 8) {
        let nearest = Infinity;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) {
          nearest = Math.min(nearest, Math.hypot(u.pos.x - p.x, u.pos.z - p.z));
        }
        // 既に打ち合っている時は、下知で槍の動きを止めない。
        if (nearest > 12 && g.order !== 'path') roadOrder(g, Math.max(62, Math.min(98, p.x + 6)), 0, 'yari');
      }
    }
    // 敵将は姿が近づいてから名と声を結ぶ。味方の将は下知が届く距離で話す。
    const speaker = C.s.phase === 'narrow' ? F.defenders[2].units[0] : C.s.phase === 'fence' ? F.kawa.leader : null;
    if (!C.generalSaid && speaker?.alive && Math.hypot(p.x - speaker.pos.x, p.z - speaker.pos.z) <= (speaker.team === 0 ? 12 : 24)) {
      C.generalSaid = true;
      rt.say(speaker.name, C.s.phase === 'narrow' ? '屋敷へ通すな。狭い道で迎えよ' : '敵が柵から打って出るぞ。先手の後ろを支えよ', 3);
    }
    const advantage = tanoAdvantage(rt);
    if (!advantage && rt.canFailMission() && !fighting(F.front) && !fighting(F.kawa)) {
      D.on = false; F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
      rt.banner('先手が崩れた', '戦える味方が足りぬ。退け'); rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: '先手と後詰が崩れた' }, 8); return;
    }
    if (!C.nudged && rt.t - C.nudgeAt >= 30 && !inYard(p.x, p.z) && distToPolyline(p.x, p.z, ROAD) > 8) {
      C.nudged = true; rt.bark('川へ下りるな。谷道の旗へ戻れ');
    }
    const inside = C.s.phase !== 'tano' || (p.x > 104 && p.x < 144 && p.z > -14 && p.z < 16);
    const distance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
    const clear = !C.groups.some(fighting) && (C.s.phase !== 'tano' || !F.defenders.some(fighting));
    // 敵を押して先へ出た者を、空になった崖道へ引き返させない。
    // 柵の段と屋敷の段は従来どおり、実際に口・屋敷へ着く必要がある。
    const passed = clear && (C.s.phase === 'valley' || C.s.phase === 'narrow') &&
      p.x >= C.at.x && p.x < 104 && distToPolyline(p.x, p.z, ROAD) < 8;
    const near = inside && (distance < (C.s.kind === 'move' ? 8 : 12) || passed);
    // 合流に来ない、または寄せが止まったままなら閉じる。交戦中に時刻だけで負けにしない。
    if (!advantage && rt.t - C.t0 >= 180 && (!near || !clear) && rt.player.inCombatT <= 0 &&
        !rt.army.nearestEnemy(rt.player.u, 28, (u) => !u.isStruct && !u.noTarget && u.type !== 'dummy')) {
      D.on = false; F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
      rt.banner('寄せが止まった', '味方が減り、持ち場へ進めぬ');
      rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: '味方が減り、寄せが止まった' }, 8); return;
    }
    C.enemyCount = 0; C.enemyDistance = Infinity;
    for (const g of C.s.phase === 'tano' ? F.defenders : C.groups) {
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        C.enemyCount++;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < C.enemyDistance) { C.enemyDistance = d; C.enemyUnit = u; }
      }
    }
    // 混戦で隣の侍へ印が飛び、柵の内外の下知が往復するのを抑える。
    // 今の相手が戦える間は保ち、四歩以上近い相手が現れた時だけ替える。
    const previous = C.guideEnemy;
    if (previous?.alive && !previous.fleeing && !previous.woundOut && !previous.noTarget &&
        (C.s.phase === 'tano' ? F.defenders : C.groups).includes(previous.group)) {
      const d = Math.hypot(previous.pos.x - p.x, previous.pos.z - p.z);
      if (d <= C.enemyDistance + 4) { C.enemyUnit = previous; C.enemyDistance = d; }
    }
    C.guideEnemy = C.enemyCount ? C.enemyUnit : null;
    if (C.guideEnemy) { C.enemyAt.x = C.guideEnemy.pos.x; C.enemyAt.z = C.guideEnemy.pos.z; }
    // 隊の平均は空いた道や次の持ち場に出る。今の任務に残る最寄りの兵を示す。
    if (C.enemyCount) { C.goal.x = C.enemyAt.x; C.goal.z = C.enemyAt.z; }
    else { C.goal.x = passed ? p.x : C.at.x; C.goal.z = passed ? p.z : C.at.z; }
    const ready = C.s.phase !== 'narrow' || F.volley || F.narrowPush || !fighting(F.tgun) || !fighting(F.defenders[2]);
    // 射撃後と屋敷の奥で、固定の寄せ口から離れた守兵にも先手が道を歩いて寄せる。
    // 本人が離れていても進めるが、次の持ち場の敵は追わない。
    // 四秒に一度だけ調べ、行軍中と打ち合い中は下知を上書きしない。
    if ((C.s.phase === 'narrow' || C.s.phase === 'tano') && ready && !clear && rt.t >= (C.spearAt || 0)) {
      C.spearAt = rt.t + 4;
      for (const g of F.oda) {
        if (g !== F.front && g !== F.kawa) continue;
        // 先手が健在でも、崖道の寄せが三十秒続いたら後詰が列の穴を支える。
        // 射撃待ちには入らず、指揮所と射手の持ち場は保つ。
        if (g === F.kawa && fighting(F.front) && F.front.count >= F.front.initial / 2 && rt.t - C.t0 < 30) continue;
        if (!fighting(g) || g.order !== 'hold') continue;
        let touching = false, target = null, distance = Infinity;
        for (const u of g.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          if (u.atk || u.swing && !u.swing.done) { touching = true; break; }
          for (const e of C.s.phase === 'tano' ? rt.army.units : F.defenders[2].units) {
            if (e.team !== 1 || !(C.s.phase === 'tano' ? F.defenders : C.groups).includes(e.group)) continue;
            if (!e.alive || e.fleeing || e.woundOut || e.noTarget) continue;
            const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
            // 八歩では槍が届かない。実際の間合いへ入るまで寄せ直す。
            if (d <= Math.max(u.reach || 0, e.reach || 0) + 0.3 &&
                Math.abs(e.pos.y - u.pos.y) < 1.5 && localClear(rt.army, u.pos, e.pos)) touching = true;
            if (d < distance) { distance = d; target = e; }
          }
        }
        if (!touching && target) {
          // 守兵が本人を追って崖道の外へ出ても、今の九人を見失わない。
          // 次の持ち場の守兵は上の候補に含めず、既存の谷道・西の口を歩かせる。
          if (inYard(target.pos.x, target.pos.z))
            roadOrder(g, Math.max(108, target.pos.x - 2), target.pos.z, 'yari');
          else if (distToPolyline(target.pos.x, target.pos.z, ROAD) < 8 &&
              target.pos.x >= ROAD[0][0] && target.pos.x < 104)
            roadOrder(g, Math.min(100, target.pos.x - 2), target.pos.z, 'yari');
        }
      }
    }
    C.engaged = inside && C.enemyDistance < 25 && !clear;
    C.seeking = !clear && (ready || C.enemyDistance <= 12);
    C.waiting = !ready && !C.seeking;
    // 射撃開始と同じく先着の二人を基準にする。遅れた一人まで谷道を戻らせない。
    // 行軍中の射手を追って谷の入口まで戻らず、槍の待機線で到着を待つ。
    // 射手が追いついたら先着二人の後ろ四歩へ寄せ、射線を空ける。
    // 既存の印の座標だけを更新し、射撃・寄せ・段の完了条件は保つ。
    if (C.waiting) {
      let first = -Infinity, second = -Infinity, firstZ = C.s.at.z, secondZ = C.s.at.z;
      for (const u of F.tgun.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        if (u.pos.x > first) {
          second = first; secondZ = firstZ; first = u.pos.x; firstZ = u.pos.z;
        } else if (u.pos.x > second) { second = u.pos.x; secondZ = u.pos.z; }
      }
      if (Number.isFinite(first)) {
        const gunX = (Number.isFinite(second) ? second : first) - 4;
        C.waitAt.x = Math.max(C.s.at.x - 20, gunX);
        C.waitAt.z = gunX < C.s.at.x - 20 ? C.s.at.z : Number.isFinite(second) ? secondZ : firstZ;
      }
    }
    // 残敵を追う時も柵の口・谷道の曲がりを通す。柵越しの敵へ直進させない。
    // 行き先の印と同時に敵の印を出さず、通り口を抜けたら敵へ戻す。
    const destination = C.seeking ? C.enemyAt : C.waiting ? C.waitAt : C.at;
    const route = valleyWay(rt.army, rt.player.u, destination);
    C.routeTurn = route !== destination && Math.hypot(route.x - p.x, route.z - p.z) > 0.6;
    C.yardTurn = inYard(p.x, p.z) !== inYard(destination.x, destination.z);
    C.houseTurn = C.routeTurn && inYard(p.x, p.z) && inYard(route.x, route.z);
    if (passed) rt.unmark('dp');
    if (!passed && C.routeTurn) {
      // 移動用の座標は退避・接敵でも書き換わる。表示には段ごとの座標を使う。
      C.turnAt.x = route.x; C.turnAt.z = route.z;
      rt.marker('turn', C.turnAt, C.houseTurn ? '屋敷の脇' : C.yardTurn ? '柵の口' : '谷道', { h: 3 });
    } else rt.unmark('turn');
    // 敵が残る間に先手の近くで支えた事を数える。到着後の待ちだけでは手柄にしない。
    if (!clear && inside && distance < 25 && Math.hypot(p.x - C.goal.x, p.z - C.goal.z) < 25) C.support += elapsed;
    if (!clear || !ready) { C.settled = 0; C.outT = 0; }
    else if (near) { C.settled += elapsed; C.outT = 0; }
    else {
      C.outT += elapsed;
      // 短い押し出しの間は確認を止める。三秒以上離れたら持ち場を放棄した扱い。
      if (C.outT >= 3 || distance >= 20) C.settled = 0;
    }
    // 自分か配下が道を開いた時は、長い足踏みを挟まず次の寄せにつなぐ。
    const settleTime = C.s.kind === 'move' ? 0.4 : C.playerKills ? 3 : 5;
    if (clear && ready && !C.clearSaid && C.s.kind !== 'move') {
      C.clearSaid = true;
      // 次の下知までは集合。台詞で次の持ち場へ先走らせない。
      const cleared = C.s.phase === 'valley' ? '谷道が開いた。'
        : C.s.phase === 'narrow' ? '崖道が開いた。'
          : C.s.phase === 'fence' ? '柵の口を押さえた。' : '奥の敵も退けた。';
      rt.say('滝川の組頭', cleared + (near ? 'その場で組をそろえよ' : '印で組をそろえよ'), 3);
    }
    if (clear && ready && C.s.kind !== 'move') {
      const place = C.s.phase === 'valley' ? '谷道' : C.s.phase === 'narrow' ? '崖道'
        : C.s.phase === 'fence' ? '柵の口' : '屋敷の奥';
      const task = near ? `${place}を押さえた。あと${Math.max(0, Math.ceil(settleTime - C.settled))}秒、組をそろえよ`
        : !inside ? '敵は退いた。柵の口から中へ' : `${place}の集合の印へ進め`;
      if (rt.objectives.find((o) => o.id === 'main')?.text !== task) rt.obj('main', task, 'main');
    }
    // 体の背後と画面の奥を混同させず、「敵へ体を向けよ」と伝える。
    const behind = (C.enemyAt.x - p.x) * Math.sin(rt.player.u.heading) + (C.enemyAt.z - p.z) * Math.cos(rt.player.u.heading) < 0;
    // 間合いの境と真横で札を往復させない。向き直る下知は八秒間隔にする。
    if (!C.enemyCount || C.enemyDistance > 14) { C.closeFight = false; C.turnBack = false; }
    else if (C.enemyDistance <= 10) C.closeFight = true;
    const facing = ((C.enemyAt.x - p.x) * Math.sin(rt.player.u.heading) +
      (C.enemyAt.z - p.z) * Math.cos(rt.player.u.heading)) / Math.max(0.01, C.enemyDistance);
    if (C.closeFight) {
      if (C.turnBack && facing > 0.3) C.turnBack = false;
      else if (!C.turnBack && facing < -0.3 && rt.t >= (C.turnTaskAt || 0)) {
        C.turnBack = true; C.turnTaskAt = rt.t + 8;
      }
    }
    // 携帯では任務の補足が畳まれる。近い敵への応戦を主の一文でも伝える。
    // 持ち場を主文に残す。同じ押し合いでも谷道・崖道・柵の段を見失わせない。
    // 射撃待ちは接敵しても残す。「退け」を退却と取り違えさせない。
    if (!clear && C.s.kind !== 'move') {
      const task = C.seeking && C.routeTurn ? C.houseTurn ? '屋敷の脇の印へ進め' : C.yardTurn
        ? '柵の口の印へ進め'
        : '谷道の印へ進め'
        : C.s.phase === 'narrow' && ready && C.enemyAt.x > 70 ? '崖道を離れた敵へ、味方と進め'
        : C.s.phase === 'narrow' && !ready && C.closeFight ? '敵へ構えよ。射手の後ろを守れ'
        : C.closeFight && C.turnBack ? C.s.phase === 'valley' ? '谷道で敵へ体を向けよ'
          : C.s.phase === 'narrow' ? '崖道で敵へ体を向けよ'
            : C.s.phase === 'fence' ? '柵の口で敵へ体を向けよ' : '屋敷の奥で敵へ体を向けよ'
        : C.closeFight ? C.s.phase === 'valley' ? '谷道で敵へ構え、味方と押せ'
          : C.s.phase === 'narrow' ? '崖道で敵へ構え、味方と押せ'
            : C.s.phase === 'fence' ? '柵の口で敵へ構え、味方と押せ'
              : '屋敷の奥で敵へ構え、味方と押せ'
          : !inside ? '柵の口から屋敷へ入れ'
          : C.s.phase !== 'narrow' ? C.s.text
        : F.volley ? '鉄砲が鳴った。陣太鼓に従い崖道を押せ'
          : F.narrowPush ? '鉄砲を待たず、槍の組と崖道を押せ'
            // 射手の到着前後で、本文も補足と同じ待機位置を案内する。
            : C.waiting ? tanoWaitText(rt) : C.s.text;
      if (rt.objectives.find((o) => o.id === 'main')?.text !== task) rt.obj('main', task, 'main');
    }
    rt.objProgress('main', !inside ? '柵の口から中へ進め'
      : C.waiting ? tanoWaitText(rt)
      : C.engaged ? behind ? '敵へ体を向けよ。味方と構えよ'
        : C.s.phase === 'narrow' && !ready ? '射手の後ろで構えよ。前を空けよ' : '味方の列と敵を押せ'
      : C.seeking ? `${behind ? '敵へ体を向けよ。' : ''}敵の旗と赤茶の袖を見て、味方と進め`
      : !near ? `${C.s.label}へ。あと約${Math.max(1, Math.round(distance / 1.82))}間`
        : C.s.phase === 'narrow' && !ready ? '射手の後ろで待て。前を空けよ'
        : !clear ? `敵は${C.goal.x < C.at.x ? '谷道の手前' : '谷道の奥'}におる。${C.s.phase === 'fence' || C.s.phase === 'tano' ? (C.s.phase === 'tano' ? '屋敷の脇から' : '柵の口から') : '川へ下りず'}組と進み、敵を退けよ`
          : C.s.kind === 'move' ? '先手に加わった' : `敵を退けた。組をそろえよ。あと${Math.max(0, Math.ceil(settleTime - C.settled))}秒`);
    if (near && clear && ready && C.settled >= settleTime) {
      // 間に合わなかった段は手柄を付けず、敵を退けた先手に続く。
      if (C.s.kind !== 'move' && (C.support >= 3 || C.playerKills)) {
        const label = C.s.phase === 'valley' ? '谷道の先手を支えた' : C.s.phase === 'narrow' ? '土屋昌恒の守る崖道を開いた' : C.s.phase === 'fence' ? '田野の柵の口を押さえた' : '屋敷の奥への道を押さえた';
        rt.award((t) => t.side.push(label), label);
      } else if (C.s.kind === 'move') rt.award((t) => { t.special = { label: '谷道の先手に合流した', pts: 5 }; }, '谷道の先手に合流した');
      this.next(rt);
    }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (!rt.player.u.alive || F.defenders.some(fighting)) return;
    rt.award((t) => { t.main = true; t.special = { label: '谷道から田野の柵へ攻め込んだ', pts: 20 }; }, '田野の柵を押さえた');
    F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unmark('tanoEnemy'); rt.unzone('dp'); rt.unmark('turn'); rt.objRemove('dp'); rt.objDone('main');
    // 父子の姿と屋敷の火を八秒見せてから結末へ。最期の言葉や決闘は作らない。
    F.lastView = true;
    rt.banner('田野の柵を押さえた', '追わず、組をそろえよ');
    for (const g of F.oda) { g.order = 'hold'; g.path = null; g.onArrive = null; g.frontlineMobilize = false; }
    rt.obj('tanoGather', '鉦二つで止まれ。追わず、組をそろえよ', 'main', true);
    tanoSignal(rt, 'tomare', F.taki, '合図：間を空けた鉦二つ＝止まれ', 'tanoGather');
    rt.say('滝川の組頭', '鉦二つは止まれの合図じゃ。追わず、組をそろえよ', 3.5);
    rt.after(4, () => {
      if (rt.over || !rt.player.u.alive) return;
      rt.obj('tanoGather', '法螺の二声で集まれ。組をそろえよ', 'main', true);
      tanoSignal(rt, 'atsumare', F.taki, '合図：法螺貝の長い二声＝集まれ', 'tanoGather');
      rt.say('滝川の組頭', '法螺の二声は集まれの合図じゃ。勝頼父子に退く道はない。追うな', 3.5);
    });
    rt.after(8, () => {
      rt.objDone('tanoGather');
      for (let i = 0; i < F.principals.units.length; i++) {
        const u = F.principals.units[i];
        // 平場に四歩離し、通常の横倒れで膝と手足を地面へ戻す。討ち取りには数えない。
        const x = 136 + i * 4, z = -6;
        u.pos.set(x, rt.world.heightAt(x, z), z); u.heading = -Math.PI / 2;
        u.alive = false; u.hp = 0; u.deadT = 0; u.atk = null; u.swing = null; u.target = null;
        u.death = { kind: 'side', side: i ? -1 : 1, t: 0, pace: 1, floor: true, fwd: false };
        if (u.human) u.human.still = false;
      }
      F.principalsDead = true;
      rt.say('使番', '勝頼、信勝、北条夫人。この田野で命を絶たれた由', 4);
      rt.banner('武田家の終わり', '勝頼父子は田野で果てた');
    });
    // 自害は攻め手の討ち取りにせず、姿と火の残る場面を保って戦を閉じる。
    rt.after(13, () => {
      rt.say('語り', '甲斐の戦は終わった。およそ三か月後、舞台は京の本能寺へ移る', 4);
    });
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true }, 18);
  },
  update(rt, dt) {
    if (rt.flags.ending) return;
    const advantage = tanoAdvantage(rt);
    for (const g of rt.army.groups) if (g.team === 0 && !g.civ && !g.routed) g.noRout = advantage;
    KIT.backTick(rt);
    if (rt.flags.started) this.flowTick(rt, dt);
    // 三割まで減ってからでは、侍の次の一撃に間に合わない。傷の原因も伝える。
    const u = rt.player.u, hit = rt.player.lastHit;
    const cause = hit ? hit.ranged ? 1 : hit.back || hit.side ? 2 : hit.type === 'samurai' || hit.type === 'busho' ? 4 : 8 : 0;
    if (!rt.over && u.alive && u.hp < u.maxHp * 0.65 && hit && rt.t - hit.t < 2 &&
        !(rt.flags.guardHelpT > rt.t) && !((rt.flags.guardHelpMask || 0) & cause)) {
      rt.flags.guardHelpT = rt.t + 30;
      rt.flags.guardHelpMask = (rt.flags.guardHelpMask || 0) | cause;
      rt.bark(hit.ranged
        ? '矢玉だで。道の陰へ退きゃあ'
        : hit.back || hit.side
        ? '脇から来るで。敵を向いて味方へ退きゃあ'
        : hit.type === 'samurai' || hit.type === 'busho'
          ? '槍を受けたか。味方の後ろへ退きゃあ'
          : '深手だで。味方へ退きゃあ', true);
    }
  },
  onKill(rt, v, k) {
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) {
      rt.flags.ek++;
      const C = rt.flags.dp?.cur;
      if (C && rt.flags.dp.on && C.groups.includes(v.group) && (k?.isPlayer || k?.isSub)) C.playerKills = (C.playerKills || 0) + 1;
    } else rt.flags.ak++;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.flags.routSaid) return;
    rt.flags.routSaid = true;
    rt.say('足軽', '谷道の旗へ続け。組を離れるな', 2.5);
  },
};
// 味方は数千という復元値。敵は信長公記の侍四十一人（非戦闘員は含めない）。
tano.force = (rt) => ({ a: Math.max(0, 4000 - (rt.flags.ak || 0)), a0: 4000, b: Math.max(0, 41 - (rt.flags.ek || 0) - (rt.flags.principalsDead ? 2 : 0)), b0: 41 });
tano.sides = { a: { name: '滝川の織田軍', mon: 'oda' }, b: { name: '武田の残る侍', mon: 'takeda' } };
tano.famous = [];
tano.date = () => '天正十年三月十一日　春・午前';
tano.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
tano.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  tano.valley(rt);
};
// 人数には史料の異同がある。父子を含む四十一人という配分はこの戦の復元。
// 織田の総勢・各将の持ち場・川幅・道幅・光・鉄砲の合図・火・下知の台詞は補完。
tano.history = '天正十年三月十一日。信長公記は、滝川一益の軍が田野の平屋敷を囲み、武田の侍が打って出たと記す。土屋昌恒らは戦い続けた。勝頼、信勝、北条夫人は田野で命を絶った。\n信長公記の侍は四十一人。侍女らは別に記され、四十一人が一行の総人数という意味ではない。父子を含めた守兵の配分と、織田方の四千人・備えごとの人数は遊びのための推定である。人数や最期の様子には別の伝えもある。\n崖道の「片手千人斬り」は後の伝え。道幅や鉄砲の合図、後詰の組頭と武将の下知は復元である。午前の時刻・日差し・天気も推定で、当日の晴天を確定したものではない。景徳院は戦の後に建てられた。\n甲斐の武田家はここで終わった。およそ三か月後、京の本能寺で信長の運命も変わる。';
tano.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  if (b.flags.started) depthBot(b, inp, goTo);
  else goTo(b.player, inp, -62, 4, 3);
};
export { tano };
