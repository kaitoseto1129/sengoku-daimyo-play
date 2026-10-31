import * as THREE from 'three';
import { porterTrain } from './porters.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirtTex, leafTex } from './nature.js';
import { camNearMaterials } from './player.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　大河内城の戦い（永禄十二年・五十日の囲み・縄張り版。docs/first6-1560-1569-spec.md 42〜57）
// 伊勢を平らげようとする信長は、北畠具教・具房の籠もる大河内城を大軍で囲んだ。
// 囲み → 九月八日の三手の夜攻め → 雨中の押し返し → 坂の退路を保つ → 帰陣 → 通路封鎖 → 和睦。
// 自分は丹羽長秀の手。救出や一騎打ちは入れず、攻め口と退路を守る。
// 『信長公記』巻二は西搦手からの夜攻めと記す。現地の南搦手へ、西寄りの斜面から三手で寄せる推定復元。
// 北大手・南搦手、東の阪内川、北の矢津川、南西の谷は現地の並びを使い、距離は約1/2.5。
// 日を飛ばす演出と局地戦の時間は遊びの補い。総攻めで城内へ入る筋にはしない。
// ======================================================================
import { nobori, hut, dou, campfire, kagaribi, tawara, palisade, castleBoardFence, kuruwaBldg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { RANKS } from './state.js';
import { signal, sfx, farNext, withPan } from './audio.js';
import { WIND_STATE } from './world.js';
import { S } from './settings.js';
import { firstHelp } from './first_help.js';
import { sightPoint } from './battle_sight.js';
import { drawGroundAt } from './render_camera.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KACCHU } from './kacchu_data.js';
import { camp } from './b_mid.js';
import { timeslipField } from './timeslip_field.js';
import { placeGroup } from './b_opening.js';
import { localPoint } from './army_local_way.js';
import { monomi, kabukimon } from './castle_parts.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { yamaLift, benchRoads } from './yamalift.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { addTaba, tabaGeo, makeTabaAdvance, tickTabas, tabaInteractTick, patchGunCover } from './taketaba.js';
import { makeGate, resetGates } from './siege_gate.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { sendOrder } from './denrei.js';
import { addRamp } from './floors.js';
import { distToPolyline } from './world_common.js';
import {
  OKAWACHI_PLAN, OKAWACHI_HIGH_PLAN, OKAWACHI_HIST, GATE, OTE_GATE, MAE_C, JO_C, ROAD_KARAMETE, ROAD_OTE, ROAD_NISHI,
  HON_C, NISHI_C, NI_C, ONANDO_C, BABA_C, OTE_C,
} from './castles/okawachi.js';

// 上の身分（足軽大将候補より上）：丹羽の手の一手を預かり、退きでは殿を務める
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const CAMP = { x: 4, z: 70 };
const CAMP_LINE = { x: CAMP.x, z: CAMP.z - 6 };
const FAILED_WITHDRAWAL = '低い法螺と二つ打ちは退き太鼓じゃ。持ち場を交代する。組を崩さず南の陣へ退け！';
// 搦手へ登ってきた所から始め、長い道は地形として残す。
const OPEN_PT = ROAD_KARAMETE[5];
// 篝火の光の届き：小さな火の既定（12m・二乗の減り）では足もとの輪だけが照り、坂の土と下草が闇の一色だった（10/30）。
// 届きを広げ、減りを緩めて、持ち場の平場と坂の肩の草を照らす。光の数は共通の付け替えのまま増やさない。
const OK_FIRE_REACH = { lightRadius: 19, lightDecay: 1.3 };
const NIGHT_WAIT = 12; // 日を送る紹介の後、夕暮れから雨の夜へ移す秒数。太鼓も同じ長さだけ待つ。
// 集合は法螺二声の後、六・三秒から組が応じる。声の余韻まで札と下知を保つ。
const ASSEMBLY_LISTEN = 8.5;
// 退きの法螺・二つ打ち・鉦の余韻と、九・四秒後からの組の返事まで聞く。
const WITHDRAWAL_LISTEN = 12;
// 陽動の早打ちは最後の打音が二・八五秒、合成太鼓の胴鳴りが一・四秒。余韻の後に鬨を返す。
const NORTH_DRUM_LISTEN = 4.6;
// 共通の合成発砲音が不発に変わる雨量に合わせ、弾だけ飛ぶ食い違いを防ぐ。
const GUN_RAIN_LIMIT = 0.35;
// 『信長公記』は東の山、三重県の解説は北東の桂瀬山とする。
// 阪内川の対岸、北東の山へ置く。距離・山の断面と渡り道の位置は推定復元。
// https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
const HONJIN = { x: 174, z: -190 };
// 胴の漆と威糸を分ける。倒れた後も同じ具足の色が残る。
const ODA = { flag: 'oda', armor: 0x352d26, lace: 0x9b805a };
const KITABATAKE = { flag: 'kitabatake', armor: 0x493028, lace: 0xa08b62 };        // 北畠の笹竜胆。旗色は軍を見分ける遊び用。

// 写真の古い葺き板は灰褐色。全棟に明るい茶の縞を繰り返さず、差し替え板だけ少し明るくする。
// 形と材質は既存の束のまま、建築時に渡す頂点色だけを変える。
const OK_ROOF_COLORS = [
  [0x746e60, 0x686354, 0x7b7362, 0x6e6859, 0x8b795e],
  [0x6a6559, 0x797161, 0x706959, 0x88765b, 0x736c5e],
  [0x7a7261, 0x6c6659, 0x85775f, 0x736d5e, 0x696557],
];

// 兵は手ごとの具足、名のある将は固有の具足。生成時だけ整え、兵数や能力は変えない。
function okDress(list, colors) {
  return dress(list, colors).map((spec) => {
    // 本の足軽：茶褐色の漆胴と頂の立つ陣笠。形・材質は既存の物を使う。
    const armor = KACCHU[spec.o.name];
    const foot = ['ashigaru', 'bow', 'gun'].includes(spec.type);
    return { ...spec, o: { ...spec.o,
      ...(armor ? { armor: armor.armor, lace: armor.lace, hat: armor.hat, mon: armor.mon,
        flag: armor.mon === 'none' ? colors.flag : armor.mon } : {}),
      // 月の青い光で暗い鎧下が紺に見えた（10/29）。柿渋の茶へ寄せ、夜でも青く写らないように。
      ...(foot ? { hat: 'jingasa', hatColor: 0x49251d, cloth: spec.o.cloth ?? 0x4e3826 } : {}), haori: null } };
  });
}

// 地形：丘陵の先端（標高 110m 余りを縮める）。西と南西に深い谷、東に阪内川、北に矢津川。
// 5m標高の読み（±10m）に合わせた地形。素材の格子は丘が写っていないため使わない。
function hillRaw(x, z) {
  let h = 0.4 * Math.sin(x * 0.035 + 0.2) * Math.cos(z * 0.03) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  h += 4;
  h += 14 * gauss(x, z, 0, -112, 5200);          // 城の丘
  h += 8 * gauss(x, z, 50, -60, 2400);           // 馬場・御納戸へ続く東南の尾根
  h += 6 * gauss(x, z, 0, -150, 1800);           // 大手の北の尾根
  h -= 13 * gauss(x, z, -169, -112, 1300);        // 西ノ丸の西の深い谷
  h -= 10 * gauss(x, z, -62, -48, 1100);         // 南西の深い谷
  // 松阪市の説明では南裾にも深い谷が巡る。従来は南西の窪みだけで、南裾が平坦だった。
  // 高だけ南西の谷を南裾へ延ばす推定復元。搦手道・三手の立ち場・南の柵には掛けない。
  // 南端が z=20 で平地へ戻っていたので、南の陣の西側まで谷筋をつなぐ。
  // 北側の谷の形は保ち、南端は z=55 で閉じて里道・民の家から離す。断面・長さは推定。
  if (S.quality === 'high') {
    const side = Math.max(0, 1 - Math.abs(x + 76) / 38);
    const along = Math.max(0, 1 - Math.abs(z + 15) / (z > -15 ? 70 : 35));
    h -= 10 * side * side * (3 - 2 * side) * along * along * (3 - 2 * along);
    // 西裾と南裾の谷の間に残った平らな肩を掘り、城外の谷筋をつなぐ。
    // 松阪市「大河内城跡」の南・西裾の深い谷を基にした推定復元。
    // 西ノ丸の南端より外を通す。曲輪・西の陣・三手の坂・里道には掛けない。
    // 有限幅の滑らかな窪みを既存の地面へ加え、形・材質・毎コマの物は増やさない。
    const t = Math.max(0, Math.min(1, ((x + 169) * 93 + (z + 76) * 61) / 12370));
    const channel = Math.max(0, 1 - Math.hypot(x + 169 - 93 * t, z + 76 - 61 * t) / 18);
    h -= 8 * channel * channel * (3 - 2 * channel);
  }
  h -= Math.max(0, x - 96) * 0.12;               // 東の阪内川へ下る
  // 対岸の桂瀬山を縮める。川床と城側の斬り合いの地形は変えない。
  if (x > 140) h += 30 * gauss(x, z, HONJIN.x, HONJIN.z, 2400) * Math.min(1, (x - 140) / 26);
  h -= Math.max(0, -z - 214) * 0.14;             // 北の矢津川へ下る
  // 『信長公記』巻二は丹羽・池田・稲葉らを「南の山」に置く。
  // 南東の控えが平地になっていたため、高では陣を支える低い尾根を補う。
  // 山の断面は推定。南の封鎖口・里道・使番道（z=38）から外し、局地戦の坂は保つ。
  // https://ja.wikisource.org/wiki/信長公記 （巻二・阿坂の城退散之事）
  // 幅三十八の控え（x=65〜103）の両端まで尾根の肩を広げる。
  // 従来は東端が x=100 で切れ、兵列が山裾へ落ちていた。高さ・断面は推定復元。
  // 東端は川岸の手前、南端は民の家の手前で閉じ、川床・里道を持ち上げない。
  if (S.quality === 'high' && x > 54 && x < 108 && z > 40 && z < 92) {
    const side = Math.min(1, (x - 54) / 11, (108 - x) / 5);
    const along = Math.min(1, (z - 40) / 12, (92 - z) / 26);
    h += 7 * side * side * (3 - 2 * side) * along * along * (3 - 2 * along);
  }
  // 搦手の前へ上がるなだらかな坂（攻め口の段の縁が崖にならないように。南西の谷の肩も均す）
  const ax = Math.max(0, Math.min(1, 1 - (Math.abs(x) - 30) / 14)), rz = Math.max(0, Math.min(1, (-8 - z) / 22)) * (z > -64 ? 1 : 0);
  if (ax * rz > 0 && h < 9.4) h += (9.4 - h) * ax * rz;
  return Math.max(-1, h);
}
const HON_LEVEL = hillRaw(HON_C.x, HON_C.z) + 1.5;
function baseRaw(x, z) {
  const h = hillRaw(x, z);
  // 元の搦手の斜面へは広げず、本丸と西の尾根の間だけを掘り下げる。
  const along = Math.max(0, 1 - Math.max(0, Math.abs(z + 114) - 38) / 24);
  const valley = Math.max(0, 1 - Math.abs(x + 62) / 44);
  const v = valley * valley * (3 - 2 * valley) * along;
  const ridge = Math.max(0, 1 - Math.max(0, Math.abs(x - NISHI_C.x) - 9) / 25) * along;
  return (h + (HON_LEVEL - 30 - h) * v) * (1 - ridge) + (HON_LEVEL - 10) * ridge;
}
const HORI_FNS = OKAWACHI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseRaw(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
let HEIGHT_PLAN = null;
let SOUTH_LANDING = 0;
function heightRaw(x, z) {
  const plan = OKAWACHI_HIGH_PLAN;
  if (HEIGHT_PLAN !== plan) {
    HEIGHT_PLAN = plan; HEIGHT_FN = heightOf(plan, baseWithHori, 2.4);
    // 低すぎる平場へ短い坂をつなぐと、城兵が切岸に詰まる。
    // 歩ける傾きで着く高さを一度だけ求め、地形の問い合わせで使い回す。
    // 南裾の谷は松阪市の説明によるが、封鎖口の平場と坂の断面は推定復元。
    const entry = SOUTH_ROAD[0];
    const entryH = HEIGHT_FN(entry[0], entry[1]) + mountainLift(entry[0], entry[1]);
    SOUTH_LANDING = Math.max(HEIGHT_FN(SOUTH_BLOCK.x, 32) + mountainLift(SOUTH_BLOCK.x, 32),
      entryH - SOUTH_APPROACH * 0.6);
  }
  let h = HEIGHT_FN(x, z) + mountainLift(x, z);
  // 北東の尾根に陣幕と旗本の足場を切る。城の曲輪と南の斬り合いの坂へは広げない。
  // 高の控えは本陣の南十九〜三十七歩。従来の南二十歩の足場では、
  // 鉄砲衆・弓衆が山腹へ落ちていた。列全体を支える南の肩まで延ばす推定復元。
  // 西端は仮橋の東岸より内側に保つ。低い画質の地形は変えない。
  const campZ = S.quality === 'high'
    ? Math.max(0, HONJIN.z - 20 - z, z - HONJIN.z - 40)
    : Math.max(0, Math.abs(z - HONJIN.z) - 20);
  const campD = Math.hypot(Math.max(0, Math.abs(x - HONJIN.x) - 12), campZ);
  if (campD < 8) {
    const t = 1 - campD / 8, k = t * t * (3 - 2 * t);
    const level = HEIGHT_FN(HONJIN.x, HONJIN.z) + mountainLift(HONJIN.x, HONJIN.z);
    h += (level - h) * k;
  }
  // 南の柵の口だけに槍の列が立てる腰を切る。城の丘と谷の比高は保つ。
  const d = Math.hypot(Math.max(0, Math.abs(x - SOUTH_BLOCK.x) - 6), Math.max(0, Math.abs(z - 32) - 14));
  if (d >= 8) return h;
  const t = 1 - d / 8, k = t * t * (3 - 2 * t);
  return h + (SOUTH_LANDING - h) * k;
}

// 北畠の持ち場（曲輪の中の構え所）と、織田の囲みの陣（城外の四方。一つにまとめない）
const POST = {
  ote: { x: OTE_C.x, z: OTE_C.z + 2 }, hon: { x: HON_C.x, z: HON_C.z + 4 }, nishi: { x: NISHI_C.x, z: NISHI_C.z },
  ni: { x: NI_C.x, z: NI_C.z }, onando: { x: ONANDO_C.x, z: ONANDO_C.z }, baba: { x: BABA_C.x, z: BABA_C.z },
};
// 本物の兵が坂から下る城兵を受け止める場所。遠景の控えとは分ける。
const OK_TS = { world: null };   // 身の回りの置き物で切岸を外すための今の世界
const SOUTH_BLOCK = { x: 34, z: 26 }; // 柵の外の斜面ではなく、槍の列が並ぶ柵の口の内側。
// 坂の東の曲がり角から、二重の柵の口へ続く道。封鎖の兵も、この道を使う。
const SOUTH_ROAD = [ROAD_KARAMETE[3], [34, 10], [34, 16], [SOUTH_BLOCK.x, SOUTH_BLOCK.z], [34, 32], [34, 38]];
// 対岸の本陣からは推定の仮橋を渡り、城の馬場と南の柵を避けて封鎖の道へ合流する。
const RUNNER_ROAD = [...SOUTH_ROAD, [58, 38], [104, 38], [104, -150],
  [90, -190], [98, -190], [138, -190], [148, -190], [HONJIN.x, HONJIN.z]];
// 陣の旗まで道をつなぐ。最後の角から旗へ向かう足も、切り通しと同じ道順に含める。
const CAMP_ROAD = [[CAMP_LINE.x, CAMP_LINE.z], [-12, 50], [-12, 40], [0, 40], ROAD_KARAMETE[1]];
const SIEGE = {
  north: { x: 0, z: -188 },   // 大手攻め（矢津川の手前）
  east: { x: 92, z: -96 },                  // 阪内川と道の見張り
  west: { x: NISHI_C.x - 83, z: -112 },                // 西の谷越しの見張り
  south: { x: 84, z: 54 },                   // 南東の控え。幅約42mの軍勢を、封鎖の持ち場と帰陣の道から離す。
};
const NEAR = { ote: { x: 0, z: -174 }, ni: { x: 78, z: -117 }, nishi: { x: NISHI_C.x - 31, z: NISHI_C.z }, kara: { x: 40, z: -20 } };

// 軽い作りの部隊を、向きに縛られずに目当ての所まで歩かせる（addDistantArmy の follow。2.6m/秒）
function moveL(b, to, way = null) {
  const L = b.light;
  if (!L) return;
  const A = L.army, px = L.position.x + A.cx, pz = L.position.z + A.cz;
  const face = Math.hypot(to.x - px, to.z - pz) > 2 ? Math.atan2(to.x - px, to.z - pz) : A.facing;
  L.halt();
  const aim = { x: to.x, z: to.z, facing: face };
  let next = 0;
  L.follow(() => {
    if (way) {
      const x = L.position.x + A.cx, z = L.position.z + A.cz;
      while (next < way.length - 1 && Math.hypot(way[next][0] - x, way[next][1] - z) < 2) next++;
      aim.x = way[next][0]; aim.z = way[next][1];
      if (Math.hypot(aim.x - x, aim.z - z) > 2) aim.facing = Math.atan2(aim.x - x, aim.z - z);
    }
    return aim;
  }, { gap: 0 });
  b.pos.x = to.x; b.pos.z = to.z;
}

// 総勢の表示は三重県「大河内城の戦いと信長の伊勢進攻」の織田五万・北畠七〜八千を採る。
// https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
// 各方面・各曲輪の内訳は不明。備え表は null で未詳とし、総勢から均等割りしない。
// 実兵・遠景の人数は、局地戦を描くための別の数として保つ。
const ODA_FORCE = 50000;
const KITABATAKE_FORCE = 8000;
// 総勢は囲みの規模の目安。局地戦の討死から全軍の残兵数は算出できない。
// 高では開戦時の推定として固定し、問い合わせごとに同じ値を使う。
const OKAWACHI_FORCE_ESTIMATE = Object.freeze({ a: ODA_FORCE, a0: ODA_FORCE, b: KITABATAKE_FORCE, b0: KITABATAKE_FORCE });

// 巻二「阿坂の城退散之事」に記された南の山の将。高の備え表と遠景で同じ名を示す。
// 進藤・後藤・永原・永田・青地・山岡二人も南陣。個々の座標や兵数は史料にない。
// 実兵を増設せず、既存の南の控え全体の表示に補う。夜攻めの三手へは加えない。
// https://ja.wikisource.org/wiki/信長公記/我自刊我書
const SOUTH_GENERALS = '丹羽長秀・池田恒興・稲葉良通・織田上野守・滝川一益・津田掃部・和田新介・中島豊後・進藤山城・後藤喜三郎・蒲生右兵衛太輔・永原筑前・永田刑部少輔・青地駿河・山岡美作・山岡玉林';

// 巻二の北・東・西の布陣。個々の位置を決めず、既存の囲み全体の名として示す。
// 追加の将は史料の呼称を用いる。兵数・兵種・旗本・夜攻めの三手は変えない。
// https://ja.wikisource.org/wiki/信長公記/我自刊我書
// 北の「磯野丹波」は巻二の呼称を保つ。この条だけで磯野員昌と同定しない。
const NORTH_GENERALS = '斎藤新五・坂井政尚・蜂屋頼隆・簗田弥次右衛門・中条将監・磯野丹波・中条又衛門';
const EAST_GENERALS = '柴田勝家・長谷川与次・森可成・不破河内・佐々成政・佐々隼人・山田三左衛門・梶原平次郎・丸毛兵庫頭・丹羽源六・不破彦三・丸毛三郎兵衛';
const WEST_GENERALS = '木下藤吉郎・氏家卜全・伊賀伊賀守・飯沼勘半・佐久間信盛・塚本小大膳・市楠九郎右門';

// 信長公記巻二の四方の囲み。夜攻めは西搦手と伝わる。南搦手の西寄りの既存の道を使う。
const OKAWACHI_JIN = [
  battleJin('四方の囲み（方角は史料、各手の兵数は不明）', 0, HONJIN, -Math.PI / 2, [
    ['okNobu', '本陣', '織田信長', null, HONJIN.x, HONJIN.z, 'jinOdaCamp', 'eiraku', 'oda'],
    ['okNorth', '北大手の陣', S.quality === 'high' ? NORTH_GENERALS : '斎藤新五・坂井政尚・蜂屋頼隆・磯野員昌', null, SIEGE.north.x, SIEGE.north.z, 'siege.north', 'oda', 'oda', 0],
    ['okEast', '東の囲み', S.quality === 'high' ? EAST_GENERALS : '柴田勝家・森可成・佐々成政', null, SIEGE.east.x, SIEGE.east.z, 'siege.east', 'eiraku', 'oda'],
    ['okWest', '西の囲み', S.quality === 'high' ? WEST_GENERALS : '木下藤吉郎・氏家卜全・佐久間信盛', null, SIEGE.west.x, SIEGE.west.z, 'siege.west', 'oda', 'oda', Math.PI / 2],
    ['okSouth', '南の山の陣と封鎖', S.quality === 'high' ? SOUTH_GENERALS : '丹羽長秀・池田恒興・稲葉良通・滝川一益・津田掃部・蒲生右兵衛太輔', null, SIEGE.south.x, SIEGE.south.z, 'siege.south', 'oda', 'oda', Math.PI],
    // 廻番衆は四方の囲みを見張る役。南の既存の番で表し、特定の将の持ち場とは断定しない。
    ['okWatch', '南の通路の番（配置は推定）', '廻番衆', null, SOUTH_BLOCK.x, SOUTH_BLOCK.z + 6, 'blockGuard', 'oda', 'oda', Math.PI],
  ], '三重県の解説に従い織田五万を目安とする。方面別の内訳は不明のため、各手の兵数は記さない。巻二に北の斎藤新五・坂井・蜂屋・磯野、東の柴田・森・佐々、西の木下・氏家・佐久間、南の丹羽・池田・稲葉・滝川・津田らを記す。表は各方面の将の一部。南には織田上野守・蒲生右兵衛太輔らも布陣した。信長の本陣は馬廻・小姓・弓衆・鉄砲衆が守った。通路の封鎖には前田又左衛門・福富平左衛門ら廻番衆が置かれた。廻番衆は囲みの見張り役で、南だけにいたという記録ではない。表では既存の南の番で表し、個々の将の担当口や人数は定めない。陣の座標は推定。総勢は各手を合わせた目安であり、表の各行へ重ねて割り当てない。'),
  battleJin('曲輪の守り（配置は推定、各曲輪の兵数は不明）', 1, HON_C, 0, [
    ['okOte', '北大手', '名は伝わらない', null, POST.ote.x, POST.ote.z, 'kb.ote', 'kitabatake', 'kitabatake', Math.PI],
    ['okHon', '本陣', '北畠具教・北畠具房', null, POST.hon.x, POST.hon.z, 'kb.hon', 'kitabatake'],
    ['okNishi', '西ノ丸', '名は伝わらない', null, POST.nishi.x, POST.nishi.z, 'kb.nishi', 'kitabatake', 'kitabatake', -Math.PI / 2],
    ['okNi', '二ノ丸', '名は伝わらない', null, POST.ni.x, POST.ni.z, 'kb.ni', 'kitabatake', 'kitabatake', Math.PI / 2],
    ['okStore', '御納戸', '名は伝わらない', null, POST.onando.x, POST.onando.z, 'kb.onando', 'kitabatake'],
    ['okReserve', '馬場の控え', '名は伝わらない', null, POST.baba.x, POST.baba.z, 'kb.res', 'kitabatake'],
  ], '北畠の総勢は七千〜八千と伝わり、八千は表示の目安。各曲輪の内訳は不明のため兵数を記さず、守将も本陣以外は不明とする。旗には北畠の笹竜胆を用いる。旗色は復元ではない。'),
];

// 地形の根拠：松阪市「大河内城跡」。東は阪内川、北は矢津川、南西は深い谷。
// https://www.city.matsusaka.mie.jp/site/culture-info/okawatijyoato.html
// 民の人数・在所・門前の堂の位置は推定復元。後世の松坂の城下町は置かない。
// 谷底や川へ逃がさず、南の囲みの後方から、同じ岸の里道を南へ退く。
const PEOPLE_ROADS = [
  [[-48, 102], [-48, 128], [-48, 164]],
  [[-74, 124], [-74, 144], [-74, 164]],
  [[52, 122], [52, 142], [52, 164]],
];
const peopleRoute = (i) => PEOPLE_ROADS[i].map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  { x: -43, z: 83, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: peopleRoute(0) },
  { x: -48, z: 102, mode: 'inside', kinds: ['farmer', 'woman', 'child'], route: peopleRoute(0) },
  { x: -72, z: 108, kinds: ['monk', 'farmer', 'woman'], route: peopleRoute(1) },
  { x: -74, z: 124, mode: 'inside', kinds: ['monk', 'elder'], route: peopleRoute(1) },
  { x: 52, z: 103, kinds: ['townsman', 'merchant', 'woman', 'child'], route: peopleRoute(2) },
  { x: 52, z: 122, mode: 'inside', kinds: ['townsman', 'woman', 'child'], route: peopleRoute(2) },
];

// 桂瀬山からの連絡を切らないための仮橋。架橋の有無・位置・形は遊びの補い。
// 川床や水深は変えず、既存の床の層で渡す。板・桁・橋脚は一つの形と材質を共有する。
function okRunnerBridge(rt) {
  const W = rt.world, z = -190, width = 5.2;
  let y = Math.max(W.heightAt(98, z), W.heightAt(138, z)) + 0.2;
  for (let x = 98; x <= 138; x += 2)
    y = Math.max(y, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.3);
  const wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x66543e, roughness: 1 }), 11);
  const obj = new THREE.Object3D();
  let index = 0;
  const beam = (x, cy, cz, length, h, d, slope = 0) => {
    obj.position.set(x, cy, cz); obj.rotation.set(0, 0, slope);
    obj.scale.set(length, h, d); obj.updateMatrix(); wood.setMatrixAt(index++, obj.matrix);
  };
  beam(118, y - 0.12, z, 40, 0.24, width);
  // 岸への掛け板も床として登録し、点の使番と近くの本物の兵に同じ渡り道を使わせる。
  for (const [ax, bx, ya, yb] of [[90, 98, W.heightAt(90, z) + 0.05, y],
    [98, 138, y, y], [138, 148, y, W.heightAt(148, z) + 0.05]]) {
    addRamp({ ax, az: z, bx, bz: z, ya, yb, w: width });
    if (ax === 98) continue;
    const slope = Math.atan2(yb - ya, bx - ax);
    beam((ax + bx) / 2, (ya + yb) / 2 - 0.12, z,
      Math.hypot(bx - ax, yb - ya), 0.24, width, slope);
  }
  for (const side of [-1, 1]) {
    beam(118, y - 0.45, z + side * 1.9, 40, 0.45, 0.3);
    beam(118, y + 0.9, z + side * 2.3, 40, 0.12, 0.12);
    for (const x of [104, 132]) {
      const base = W.heightAt(x, z + side * 2.3), top = y + 1;
      beam(x, (base + top) / 2, z + side * 2.3, 0.24, top - base, 0.24);
    }
  }
  wood.instanceMatrix.needsUpdate = true;
  wood.castShadow = true; wood.receiveShadow = true; rt.scene.add(wood);
}

function okPeopleHomes(rt) {
  const W = rt.world;
  if (S.quality === 'high') {
    // 『信長公記』巻二は、包囲の初めに町を焼いたと記す。九月八日に無傷の家を並べない。
    // 焼け跡の位置・形は推定。既存の民と避難道を保ち、二軒を一つの形・材質で描く。
    const remains = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 28);
    const obj = new THREE.Object3D(), color = new THREE.Color();
    let index = 0;
    const piece = (x, z, w, h, d, rot, hex) => {
      obj.position.set(x, W.heightAt(x, z) + h / 2 + .02, z);
      obj.rotation.set(0, rot, 0); obj.scale.set(w, h, d); obj.updateMatrix();
      remains.setMatrixAt(index, obj.matrix); remains.setColorAt(index++, color.setHex(hex));
    };
    for (const [x, z] of [[-48, 96], [52, 116]]) {
      piece(x, z, 6, .06, 4, 0, 0x423b32);
      for (let i = 0; i < 6; i++)
        piece(x - 2.7 + (i % 3) * 2.7, z + (i < 3 ? -1.7 : 1.7), .18, .7 + (i % 3) * .55, .18, 0, 0x29231d);
      for (let i = 0; i < 4; i++)
        piece(x - 1.8 + i * 1.15, z - .8 + (i % 2) * 1.4, 2.4, .16, .22, .35 + i * .6, 0x302820);
      for (let i = 0; i < 3; i++)
        piece(x - 1.6 + i * 1.5, z + .3 - (i % 2) * .8, .75, .09, 1.1, i * .4, 0x514638);
    }
    remains.instanceMatrix.needsUpdate = true; remains.instanceColor.needsUpdate = true;
    remains.receiveShadow = true;
    rt.scene.add(remains);
  } else {
    const batch = makeSimpleBatch();
    for (const [x, z] of [[-48, 96], [52, 116]]) hut(W, x, z, 6, 4, 0, { batch });
    finalizeSimpleBatch(rt, batch);
  }
  rt.scene.add(dou(W, -74, 116, 6, 4));
}

// 巻二・九月九日の「作毛薙捨」を、翌朝の囲みの後方で示す。
// 多芸谷そのものをこの場所とする復元ではない。畑の位置・形・株数は演出。
// 避難道・南裾の谷・陣と斬り合いから離し、描く形は生成時にまとめる。
// https://ja.wikisource.org/wiki/信長公記/我自刊我書
function okRavagedFields(rt) {
  if (S.quality !== 'high') return null;
  const W = rt.world, fields = new THREE.Group();
  const soil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x51452f }), 96);
  const stalks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x95825a }), 96);
  const obj = new THREE.Object3D();
  for (let i = 0; i < 96; i++) {
    const x = -100 + (i % 8) * 1.6, z = 80 + Math.floor(i / 8) * 1.3;
    const h = W.heightAt(x, z);
    obj.rotation.set(0, 0, 0); obj.position.set(x, h + .025, z);
    obj.scale.set(1.5, .05, 1.2); obj.updateMatrix(); soil.setMatrixAt(i, obj.matrix);
    // 立った稲や刈り揃えた束にせず、切り倒されて散った茎を低く伏せる。
    obj.rotation.y = .4 + Math.sin(i * 2.7) * .7;
    obj.position.set(x, h + .09, z); obj.scale.set(.16, .07, 1.1);
    obj.updateMatrix(); stalks.setMatrixAt(i, obj.matrix);
  }
  soil.instanceMatrix.needsUpdate = stalks.instanceMatrix.needsUpdate = true;
  soil.receiveShadow = stalks.receiveShadow = true;
  fields.add(soil, stalks); fields.visible = false;
  rt.scene.add(fields);
  return fields;
}

// 『信長公記』巻二の夜攻めでは、雨で味方の鉄砲が役に立たなかった。
// 威力を消す代わりに点火を止める。本人の筒と雨除け付きの筒も同じ扱いにし、
// 鉄砲兵の近接攻撃・弓・城兵の攻撃には触れない。朝は通常の天候判定へ戻す。
// 雨が降るのは三手の進発から。支度中の威力・待ち時間は書き換えず、発砲時だけ判定する。
function okRainGuns(rt) {
  const army = rt.army, F = rt.flags;
  const fireGun = army.fireGun, panFlash = army.panFlash;
  const wetShot = { u: null, reason: 'wet' };
  const wet = (u) => u.team === 0 && F.assaultMoving && F.step < 4;
  army.panFlash = function(u, near) {
    if (wet(u)) return;
    return panFlash.call(this, u, near);
  };
  army.fireGun = function(u, target, launch = null, aim = null) {
    if (!wet(u)) return fireGun.call(this, u, target, launch, aim);
    wetShot.u = u; this.lastGun = wetShot;
    this.play('click', u.pos, 1);
    if (this.hooks.onGunMisfire) this.hooks.onGunMisfire(u);
    return false;
  };
}

// 二重三重の鹿垣を、削いだ杭だけでなく枝付きの木を組んだ垣として補う。
// 形の根拠：漢字ペディア「ししがき」。この戦での枝の組み方・寸法は推定。
// https://www.kanjipedia.jp/kotoba/0002899600
// 南の封鎖も含む四方に置く。既存の柵の厚みの中だけを使い、
// 口・南の乱戦・使番道へ枝を張り出させない。
function okShishigaki(rt, fences) {
  if (S.quality !== 'high') return;
  let count = 0;
  for (const [ax, az, bx, bz] of fences)
    count += Math.floor(Math.hypot(bx - ax, bz - az) / 3) * 3;
  if (!count) return;
  // 全ての枝で形・材質を共用し、一つの束として生成時だけ組む。
  const wood = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x655744, roughness: 1 }), count);
  const obj = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let index = 0;
  const branch = (ax, ay, az, bx, by, bz, radius) => {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    obj.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    obj.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
    obj.scale.set(radius, length, radius); obj.updateMatrix();
    wood.setMatrixAt(index++, obj.matrix);
  };
  for (const [ax, az, bx, bz] of fences) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 3);
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = rt.world.heightAt(x, z), lean = i % 2 ? -1 : 1;
      const topX = x + tx * lean * .65, topZ = z + tz * lean * .65;
      branch(x - tx * lean * .65, y + .2, z - tz * lean * .65, topX, y + 1.65, topZ, .045);
      branch(x, y + .92, z, x - tx * lean * .7, y + 1.5, z - tz * lean * .7, .025);
      branch(topX - tx * lean * .24, y + 1.38, topZ - tz * lean * .24,
        x + tx * lean * .9, y + 1.48, z + tz * lean * .9, .02);
    }
  }
  wood.instanceMatrix.needsUpdate = true;
  wood.castShadow = true; wood.receiveShadow = true;
  rt.scene.add(wood);
}

// 南の陣の道具と刈田。写真の板楯・丸太組みを、攻城塔ではなく陣脇の用具へ使う。
// 全て推定の生活景。戦う坂・退路・中央の広場には置かず、兵と当たりは増やさない。
function okSiegeLife(rt) {
  const W = rt.world, transform = new THREE.Object3D(), color = new THREE.Color();
  const wood = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitPole = new THREE.CylinderGeometry(1, 1, 1, 5);
  const boards = new THREE.InstancedMesh(unitBox, wood, 42);
  const poles = new THREE.InstancedMesh(unitPole, wood, 68);
  const clothGeo = new THREE.PlaneGeometry(1, 1, 8, 2);
  const cp = clothGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i);
    cp.setZ(i, Math.sin((x + .5) * Math.PI) * (.1 + .07 * Math.cos(x * 22)) * (1 - y));
    cp.setY(i, y - .06 * Math.sin((x + .5) * Math.PI));
  }
  clothGeo.computeVertexNormals();
  const cloth = new THREE.InstancedMesh(clothGeo,
    new THREE.MeshLambertMaterial({ color: 0xaaa18b, side: THREE.DoubleSide }), 4);
  let bi = 0, pi = 0, ci = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, rx, ry, rz, tint) => {
    transform.position.set(x, y, z); transform.scale.set(sx, sy, sz);
    transform.rotation.set(rx, ry, rz); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    if (tint !== undefined) mesh.setColorAt(i, color.setHex(tint));
  };
  const box = (x, y, z, w, h, d, rot, tint) => put(boards, bi++, x, y, z, w, h, d, 0, rot, 0, tint);
  const pole = (x, y, z, r, len, rx, rz, tint) => put(poles, pi++, x, y, z, r, len, r, rx, 0, rz, tint);
  // 待機の旗の外側に低い無地の陣幕。使番・帰陣の道へ幕を横切らせない。
  for (const [cx, cz, facing] of [[-29, 77, -.15], [29, 86, .2]]) {
    const c = Math.cos(facing), sn = Math.sin(facing);
    const at = (u, v) => [cx + u * c + v * sn, cz - u * sn + v * c];
    const curtainBase = Math.max(...[-3, 0, 3].map(u => {
      const [x, z] = at(u, 0); return drawGroundAt(W, x, z);
    }));
    for (let i = 0; i < 3; i++) {
      const [x, z] = at((i - 1) * 3, 0), h = drawGroundAt(W, x, z);
      const len = curtainBase + 2.2 - h;
      pole(x, h + len / 2 - .08, z, .055, len + .16, 0, 0, 0x69543b);
    }
    for (let i = 0; i < 2; i++) {
      const [x, z] = at(i ? 1.5 : -1.5, 0);
      // 竿と同じ高さへそろえ、布の下端を泥へ埋めない。
      const y = curtainBase + 1.05;
      put(cloth, ci++, x, y, z, 2.95, 1.45, 1, 0, facing, 0);
    }
    // 五枚板の矢楯三枚。横桟と後ろの控え脚を付け、材木の壁にしない。
    for (let shield = 0; shield < 3; shield++) {
      const u = (shield - 1) * 1.1, v = 2.8 + shield * .16;
      const [x, z] = at(u, v), y = W.heightAt(x, z);
      for (let plank = 0; plank < 5; plank++) {
        const [px, pz] = at(u + (plank - 2) * .17, v);
        box(px, y + .9, pz, .16, 1.75 - (plank % 2) * .04, .065, facing,
          plank % 2 ? 0x817154 : 0x6c5a40);
      }
      for (const h of [.4, 1.35]) box(x, y + h, z + .065, .87, .09, .1, facing, 0x493b2b);
      const [lx, lz] = at(u, v + .5);
      pole(lx, y + .6, lz, .045, 1.4, -.65, 0, 0x65543d);
    }
    // 横置きの青竹と縄の結束。節・縄は同じ低面数の円柱を使い回す。
    for (let i = 0; i < 7; i++) {
      const [x, z] = at(-2.5 + (i % 4) * .13, 4.6);
      const y = W.heightAt(x, z) + .12 + Math.floor(i / 4) * .12;
      pole(x, y, z, .065, 2.8, Math.PI / 2, 0, i % 2 ? 0x646343 : 0x76734b);
      for (const dz of [-.8, 0, .8]) pole(x, y, z + dz, .073, .04, Math.PI / 2, 0, 0x8b8058);
    }
  }
  for (const [mesh, count] of [[boards, bi], [poles, pi], [cloth, ci]]) {
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh);
  }
  // 家並みの外の刈田二枚。畦は短い土塊に分け、起伏をまたいで空中へ浮かせない。
  // 水面・透過・光源を増やさず、遠方では刈株を描かない。
  const detail = new THREE.Group();
  const stubble = new THREE.InstancedMesh(unitPole, wood, 192);
  const banks = new THREE.InstancedMesh(unitBox, wood, 56);
  let si = 0, ei = 0;
  for (const [cx, cz] of [[-29, 132], [31, 148]]) {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 12; col++) {
      const x = cx + (col - 5.5) * .7, z = cz + (row - 3.5) * .85;
      put(stubble, si++, x, drawGroundAt(W, x, z) + .09, z, .07, .22, .07,
        (col % 3 - 1) * .15, 0, (row % 3 - 1) * .1, (row + col) % 2 ? 0x84764b : 0x696044);
    }
    for (let side = 0; side < 4; side++) for (let i = 0; i < 7; i++) {
      const x = cx + (side < 2 ? (i - 3) * 1.4 : (side === 2 ? -5 : 5));
      const z = cz + (side < 2 ? (side ? -4 : 4) : (i - 3) * 1.15);
      put(banks, ei++, x, drawGroundAt(W, x, z) - .08, z,
        side < 2 ? 1.48 : .55, .34, side < 2 ? .55 : 1.23, 0, 0, 0, 0x56513a);
    }
  }
  stubble.instanceMatrix.needsUpdate = banks.instanceMatrix.needsUpdate = true;
  stubble.instanceColor.needsUpdate = banks.instanceColor.needsUpdate = true;
  stubble.computeBoundingSphere(); banks.computeBoundingSphere();
  banks.receiveShadow = true; rt.scene.add(banks); detail.add(stubble);
  // 距離判定は既存の仕組みへ任せ、毎コマの割り当てや独自の更新を持たない。
  const lod = new THREE.LOD(); lod.userData.noFreeze = true;
  lod.addLevel(detail, 0); lod.addLevel(new THREE.Group(), 85);
  // 距離の基点を刈田の中央へ置き、頂点の世界座標は保つ。
  lod.position.set(1, 0, 140); detail.position.set(-1, 0, -140);
  rt.scene.add(lod);
}

// 囲みの後方の板葺き陣小屋と補給場。陣の正面・使番の道・控えの中央は空ける。
// 小屋は既存の束、薪と木箱は基本形二つの使い回し。生成時だけ組み、更新処理は持たない。
function okSiegeStores(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  const timber = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), timber, 24);
  const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .15, 3.6, 6), timber, 20);
  const obj = new THREE.Object3D(), color = new THREE.Color();
  let ci = 0, li = 0;
  const box = (x, y, z, w, h, d, rot, hex) => {
    obj.position.set(x, y, z); obj.rotation.set(0, rot, 0); obj.scale.set(w, h, d); obj.updateMatrix();
    crates.setMatrixAt(ci, obj.matrix); crates.setColorAt(ci++, color.setHex(hex));
  };
  for (const [key, facing] of [['north', 0], ['east', -Math.PI / 2], ['west', Math.PI / 2], ['south', Math.PI]]) {
    const s = SIEGE[key], c = Math.cos(facing), sn = Math.sin(facing);
    // 東は川までの奥行きが浅いので、補給場を五歩だけ城側へ寄せる。
    const at = (u, v) => { const rear = v + (key === 'east' ? 5 : 0); return [s.x + u * c + rear * sn, s.z - u * sn + rear * c]; };
    const [hx, hz] = at(25, -19);
    hut(W, hx, hz, 4, 7, facing, { ita: true, boardRoof: true, boardRoofColors: OK_ROOF_COLORS[1], weatheredBoards: true, h: 2.2, wall: 0x75634d, batch });
    const [fx, fz] = at(28, -23);
    rt.scene.add(nobori(W, fx, fz, key === 'east' ? 'eiraku' : 'oda', 4.4));
    for (let i = 0; i < 4; i++) {
      const [x, z] = at(23.5 + (i % 2) * 1.1, -13 + Math.floor(i / 2) * .9);
      box(x, W.heightAt(x, z) + .4, z, .95, .8, .75, facing, 0x786044);
    }
    const [lx, lz] = at(-25, -18);
    const ends = [-1, 1].map(v => [lx + sn * v * 1.35, lz + c * v * 1.35]);
    const top = Math.max(...ends.map(([x, z]) => W.heightAt(x, z))) + .22;
    for (const [x, z] of ends) {
      const ground = W.heightAt(x, z), h = top - ground;
      box(x, ground + h / 2, z, 1.2, h, .22, facing, 0x493a2c);
    }
    for (let i = 0; i < 5; i++) {
      const u = i < 3 ? (i - 1) * .29 : (i - 3.5) * .29;
      obj.position.set(lx + c * u, top + (i < 3 ? .15 : .4), lz - sn * u);
      obj.rotation.set(Math.PI / 2, 0, -facing); obj.scale.set(1, 1, 1); obj.updateMatrix();
      logs.setMatrixAt(li, obj.matrix); logs.setColorAt(li++, color.setHex(i % 2 ? 0x78644d : 0x574836));
    }
  }
  for (const mesh of [crates, logs]) {
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
  }
  finalizeSimpleBatch(rt, batch);
}

// 曲輪の屋敷の脇。低い囲いと口を設け、長屋ごとの板材の庭として分ける。
// 主道・木戸・控えの兵列の外側だけに置く。位置と用具は推定復元。
function okHouseYards(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 128);
  const obj = new THREE.Object3D(), color = new THREE.Color();
  let index = 0;
  const box = (x, y, z, w, h, d, hex, rot = 0, tilt = 0) => {
    obj.position.set(x, y, z); obj.rotation.set(0, rot, tilt, 'YXZ'); obj.scale.set(w, h, d); obj.updateMatrix();
    wood.setMatrixAt(index, obj.matrix); wood.setColorAt(index++, color.setHex(hex));
  };
  for (const [x, z] of [[-126, -132], [73, -132], [-16, -80]]) {
    const inward = x > 0 ? -1 : 1, px = x + inward * .7;
    // 写真の屋敷囲いのように、背面の低い板塀を妻壁へ折り返す。
    // 外側の口は一・六歩空け、板材の庭へ通す。主道側の長屋の板戸は囲わない。
    // 三か所とも壁まで一・五歩の裏庭に収め、曲輪の縁と控えの兵列には広げない。
    const wallX = x + inward * 1.5;
    castleBoardFence(W, [x, z - 4, wallX, z - 4],
      { h: 1.05, plainBoards: true, boardCap: true, batch });
    for (const [az, bz] of [[z - 4, z + 1.6], [z + 3.2, z + 4]]) {
      palisade(W, [x, az, x, bz], { h: 1.05, lightFence: true, mound: false, noBrace: true, batch });
    }
    palisade(W, [x, z + 4, wallX, z + 4],
      { h: 1.05, lightFence: true, mound: false, noBrace: true, batch });
    // 二ノ丸の長屋だけ向きが直角なので、北の妻壁まで二歩の隙間も細柵でつなぐ。
    if (x > 0) palisade(W, [wallX, z - 4, wallX, z - 2],
      { h: 1.05, lightFence: true, mound: false, noBrace: true, batch });
    const y = Math.max(W.heightAt(px, z - 1.4), W.heightAt(px, z + 1.4));
    for (const dz of [-1.15, 1.15]) {
      const ground = W.heightAt(px, z + dz), h = y - ground + .2;
      box(px, ground + h / 2, z + dz, .8, h, .22, 0x4b3d2e);
    }
    for (let i = 0; i < 6; i++) {
      box(px, y + .25 + i * .075, z + (i % 2) * .09, .65, .065, 2.9 - (i % 3) * .12,
        i === 4 ? 0x927553 : 0x6a5945);
    }
    for (let i = 0; i < 2; i++) {
      // 口の正面へ木箱を置かず、板材の北端へ寄せる。
      const bx = x + inward * 1.05, bz = z - 3.2 + i * .65;
      box(bx, W.heightAt(bx, bz) + .25, bz, .65, .5, .55, i ? 0x73614a : 0x574937);
    }
  }
  // 写真の長屋の下屋。壁際から低い板庇を葺き下ろし、外の細柱で支える。
  // 屋敷の脇に収め、中央の道・木戸・控えの兵列には張り出さない。寸法は推定。
  const leanTos = [[-12, -80, 5, 8, 0], [-122, -134, 5, 12, 0], [65, -131, 6, 13, Math.PI / 2]];
  for (const [yard, [x, z, w, d, rot]] of leanTos.entries()) {
    const c = Math.cos(rot), s = Math.sin(rot), y = W.heightAt(x, z);
    const part = (u, v, h, bw, bh, bd, hex, tilt = 0) =>
      box(x + u * c + v * s, y + h, z - u * s + v * c, bw, bh, bd, hex, rot, tilt);
    const edge = w / 2 + 1.25;
    for (let i = 0; i < 4; i++) {
      const v = -d / 2 + .35 + i * (d - .7) / 3;
      const ground = W.heightAt(x + edge * c + v * s, z - edge * s + v * c) - y;
      part(edge, v, (ground + 2.12) / 2, .12, 2.12 - ground, .12, 0x63533f);
    }
    for (const u of [w / 2 - .1, edge]) part(u, 0, u === edge ? 2.12 : 2.44, .14, .16, d + .35, 0x4e4030);
    const n = Math.ceil((d + .6) / .55), step = (d + .6) / n;
    for (let i = 0; i < n; i++) part(w / 2 + .58, -(d + .6) / 2 + (i + .5) * step,
      2.36 + (i % 3) * .006, 1.85, .065, step - .008, OK_ROOF_COLORS[yard][i % 5], -.24);
  }
  wood.count = index;
  wood.instanceMatrix.needsUpdate = true; wood.instanceColor.needsUpdate = true;
  wood.castShadow = true; wood.receiveShadow = true; rt.scene.add(wood);
  finalizeSimpleBatch(rt, batch);
}

function okNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  let nearest = null, best = Infinity;
  for (const g of F.push || []) {
    if (sortieBroken(g) || g._okReturning) continue;
    for (const u of g.units) {
      if (!u.alive || u.dying || u.gone || u.fleeing || u.woundOut || u.noTarget || u.isStruct) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < best) { nearest = u; best = d; }
    }
  }
  return nearest;
}

const okawachi = {
  // 局地の押し引きで総崩れや追撃を叫ばず、退く側自身が退き口を呼ぶ。
  battleVoices: S.quality === 'high' ? { lines: {
    ally: {
      rout: ['敵が退くぞ！　深追いするな！', '敵が背を向けた！　槍の列を戻せ！'],
      pushing: ['隣の槍と並べ！　足元を固めよ！', '前の肩を支えろ！　押し返せ！'],
      breaking: ['坂を空けろ！　仲間を踏むな！', '列が割れる！　味方の旗へ退け！'],
    },
    enemy: {
      pushing: ['寄せ手に押されるな！　槍をそろえよ！', 'この口を支えろ！　肩を寄せよ！'],
      breaking: ['前の列が崩れた！　木戸へ退け！', '味方を通せ！　木戸の前を空けろ！'],
      push: ['槍をそろえて押し返せ！', '寄せ手を押し戻せ！'],
      waver: ['列が割れた！　旗の下へ寄れ！', '一人で残るな！　後ろへ退け！'],
    },
  } } : undefined,
  // 稲生の型。守りと退きの筋は保ち、字は今の任務一行にそろえる。
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt) => rt.over || !!rt.flags.ending,
  missions: ['ここで太鼓を待て', '味方と進め', '▼の城兵を倒せ', 'ここを守れ', '陣へ戻れ', '柵を守れ'],
  missionOf(rt) {
    const F = rt.flags;
    return F.step === 4 ? 5 : F.step === 3 ? 4 : F.step === 2.5 ? 3 :
      F.step === 2 ? (okNearestFoe(rt) ? 2 : 3) : F.step === 1 && F.assaultMoving ? 1 : 0;
  },
  missionHeading(rt) {
    if (rt.flags.ending) return rt.flags.failed ? '退き太鼓：味方と退け' :
      rt.flags.peaceAnnounced ? '法螺二声：槍を収めよ' : '持ち場を保ち、囲みを続けよ';
    // 一行の任務札にも、いま鳴る合図と声に対応する下知を残す。
    if (rt.t < Math.max(rt.flags.signalQuietUntil || 0, rt.flags.sortieVoiceUntil || 0,
        rt.flags.chaseVoiceUntil || 0, rt.flags.wetGunUntil || 0))
      return this.taskLabel(rt, this.missions[this.missionOf(rt)]);
    if ((rt.flags.step === 0 || rt.flags.step === 1 && !rt.flags.assaultMoving) && !okAtWaitCover(rt)) return '竹束の陰へ';
    if (rt.flags.step === 3 && Math.hypot(rt.player.u.pos.x - CAMP_LINE.x, rt.player.u.pos.z - CAMP_LINE.z) <= 8) return '陣で次の下知を待て';
    if (rt.flags.step === 4 && !okAtSouthLine(rt)) return '柵へ進め';
    return this.missions[this.missionOf(rt)];
  },
  enemyOrder: (rt) => okawachi.missionHeading(rt),
  // 城内の大将へ討ち取りを誘わず、地図の印と本丸の大旗で居所を示す。
  mapCommanderAlways: true,
  commanderSignTarget: (rt) => !rt.flags.ending && rt.flags.keep?.lord?.alive ? rt.flags.keep.lord : null,
  commanderTarget(rt) { return rt.flags.keep?.reached ? this.commanderSignTarget(rt) : null; },
  missionSignTarget: (rt) => rt.flags.step === 2 ? okNearestFoe(rt) : null,
  missionPin(rt) {
    const F = rt.flags;
    if (rt.over || F.ending) return null;
    const q = F.okPin || (F.okPin = { x: 0, z: 0 });
    q.unit = null; q.enemy = false; q.approach = false; q.defend = false;
    q.waiting = false; q.arrived = false; q.route = false; q.always = true; q.silent = true;
    q.r = 6; q.hide = 0;
    let at;
    if (F.step === 2 && (q.unit = okNearestFoe(rt))) {
      at = q.unit.pos; q.enemy = true; q.approach = true; q.r = q.hide = .2;
    } else if (F.step === 3) at = CAMP_LINE;
    else if (F.step === 4) { at = SOUTH_BLOCK; q.r = 18; q.defend = q.waiting = true; }
    else if (F.step >= 2) { at = FRONT; q.r = 18; q.defend = q.waiting = true; }
    else {
      q.waiting = F.step === 0 || !F.assaultMoving;
      at = q.waiting ? F.waitCover || okAdvanceGoal(rt) : okAdvanceGoal(rt);
      q.r = q.waiting ? .3 : 3;
    }
    // 切岸越しに直進させず、既存の歩ける道と同じ角へ案内する。
    const next = karameteWay(rt.army, rt.player.u, at);
    q.route = next !== at;
    const pos = q.route ? next : at;
    q.x = pos.x; q.z = pos.z;
    if (q.route) { q.unit = null; q.enemy = false; q.defend = q.waiting = false; q.r = .5; }
    q.arrived = !q.route && (F.step <= 1 && q.waiting ? okAtWaitCover(rt) :
      Math.hypot(rt.player.u.pos.x - at.x, rt.player.u.pos.z - at.z) <= q.r);
    // 敵本人の印は missionSignTarget の▼。行き先は同じ地点への道のピンにする。
    // 間合いに入ったら▼だけを残し、近い敵に移動のピンを重ねない。
    if (q.enemy) {
      if (rt.player.inRange && rt.player.rangeCueTarget === q.unit) return null;
      q.unit = null; q.enemy = false; q.route = true;
    }
    return q;
  },
  civilianCrowd: { bands: PEOPLE_BANDS },
  compactIntro: true,
  introTaskFirst: true,
  openingWait: (rt) => rt.flags.step === 0 || rt.flags.step === 1 && !rt.flags.assaultMoving,
  clearTravelGuide: true,
  hidePlayerSign: true, // 肩越しの本人を白い大輪で囲み、竹束や手前の兵まで透かして見せない。
  noUnitContrast: true, // 本人や兵からずれる白い人型線を消す。敵味方の印と具足の補光は残す。
  compactFieldGuides: true, // 回避先は小さい隅の印にし、大きな旗と輪で城兵を隠さない。
  compactCombatGuides: true, // 斬り合いの矢印を短く細め、目前の槍と胴を空ける。
  dodgeDangerFloor: false, // 坂の上へ投影した赤い斜線で兵を覆わず、敵の印とよける矢印で知らせる。
  groundCombatMarkers: true, // 太い輪を兵の胴へ重ねず、実際の地面に小さく示す。
  footFlagGuides: true, // 合流先は足元の小旗で示し、頭上の大きな囲みを避ける。
  routeGuideArrowOnly: true, // 道の角は矢印で示し、陣の実物の旗と区別する。
  smallFlagAvoidNotices: true, // 小旗の添え字も任務や命の札へ重ねない。
  compactRetreatSign: true, // 負傷時も退避の旗と矢印を小さくし、目前の城兵を空ける。
  singleRetreatArrow: true, // 回避も足元の矢印一本にそろえ、旗まで線を重ねない。
  retreatArrowLength: 72, // 小さい矢じりだけでは長い白線が残るため、線そのものも短くする。
  retreatLinkLength: 148, // 足元と行き先を結ぶ線は、兵の列まで横断させない。
  compactRetreatArea: true, // 退避先は足元の小さな輪で示し、坂を横断する大輪を出さない。
  compactDodgeGuide: true,
  dodgeDiamondSign: true, // 一時回避はひし形。守る旗や陣へ戻る旗と取り違えない。
  dodgeMoveGesture: false, // 携帯も足元の矢印でよける先を示し、任務札に指の札と大旗を重ねない。
  dodgeAvoidNotices: true,
  avoidCenteredDodgeNotice: true, // 足元の矢印に添える札も、任務と重ならない空きへ置く。
  shortDodgeArrow: true,
  groundFlagGuides: true, // 実物の幟は囲まず、根元の印で合流先を示す。
  compactHoldGuide: true,
  singleDestinationArrow: true, // 行き先の印に加えて、同じ方への道筋を重ねない。
  subtleTargetFrames: true, // 持ち場の旗の太い額縁を細め、近い兵や坂を覆わない。
  keepTaskWithDodge: true, // 矢の回避中も、坂を守る下知や退く先を残す。
  dodgeLabel: (rt, direction, rain) => direction || (rain ? '矢をよける' : '敵から離れる'),
  dodgeTurnDuration: 0, // 寄せの最中は指の大きな手ほどきを重ねず、端の矢印と方向の文で知らせる。
  dodgeGuideLabel: (_rt, arrived, rain) => arrived ? 'ここで槍を構えよ' : rain ? '矢の届かぬ方へ' : '城兵から離れよ',
  rainDodgeGuideLabel: (_rt, arrived) => arrived ? 'ここで矢をやり過ごせ' : '矢をよけ、味方の陰へ',
  introText: 'まず竹束の陰で待とう。北大手の遠い太鼓では動かず、搦手の法螺に鬨で応じ、かかり太鼓の早打ちで進もう。低い法螺と二つ打ちは退けの合図。翌朝の長い法螺二声で、南の柵に集まろう。',
  largeWaymarks: true, // 闇の坂でも、近い行き先を小さな点だけにしない。
  hideGuideSteps: true, // 一時退避の範囲と旗の中心までの歩数を、同じ札へ重ねない。
  compactDestinationSign: true, // 携帯の近い行き先で、大きな矢印が本人や城兵を覆わない。
  compactFloorGuides: true, // 曲がり角の印を細め、退く兵や人馬を太い輪で覆わない。
  routeGoalRadius: 0.55, // 道順と到着の判定は保ち、描く目印だけを小さくする。
  // 道の角は移動用の小旗一つで示す。本人の足から長い線を結ばない。
  taskDetails: false, // 携帯でも合流人数と守る残り時間を、任務の札に出す。
  keepCombatTask: true,
  keepCombatTaskHeading: true, // 城兵が近くても、槍の操作で坂・陣・柵の下知を消さない。
  keepCombatTaskDetail: false, // 斬り合い中も、合流人数と列が破れるまでの猶予を省かない。
  keepTaskLabel: true,
  keepDestinationTask: true, // 坂の守り・南の陣・柵の封鎖を「この旗へ」だけにしない。
  keepFlagTravelTask: true,
  keepFlagArrivalTask: true,
  keepRetreatReason: true, // 「ここへ」ではなく、坂・陣・柵のどこへ下がるかを下知に残す。
  keepRetreatGestureReason: true, // 退く先を見出しに残し、操作の向きは小さい補足一つにする。
  keepWoundRetreatReason: true, // 足を負傷した時も、退く先を名のない「旗」へ替えない。
  retreatForLimbWounds: false, // 止血後の手足の傷だけで、帰陣や柵への道案内を退避に替え続けない。
  retreatPathAllowed: okRetreatPoint,
  retreatPointAllowed: (rt, point) => karameteClear(rt.army, rt.player.u, rt.player.u.pos, point),
  // 息切れだけで坂の守り・帰陣・封鎖の下知を別の退避先に替えない。
  // 深手や包囲、被弾直後の退避は残す。
  routeGuidePriority: (rt) => rt.flags.step <= 4 && !rt.flags.ending && !rt.flags.retreatMarked &&
    rt.player.u.hp >= rt.player.u.maxHp * 0.6 && !rt.player.u.mobbed &&
    !(rt.player.u.wounds?.bleed > 0) &&
    rt.t >= (rt.retreatUntil || 0),
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    // 一時退避の印を、離れた陣や柵そのものだと言い換えない。
    if (u.wounds?.bleed > .0001) return reached ? 'ここで止まり、手当てせよ' : '血が出ている。道沿いに味方の後ろへ';
    if (u.hp < u.maxHp * .3) return reached ? '味方の後ろで身を守れ' : '命が少ない。道沿いに味方の後ろへ';
    // 一時退避中も本来の持ち場を残す。「下がれ」だけで帰陣や封鎖と競合させない。
    if (rt.flags.step === 3) return reached ? '追っ手を見て、陣への道を進め' : '城兵をよけよ。戻る先は南の陣';
    if (rt.flags.step === 4) return reached ? '息を整え、柵の列へ戻れ' : '城兵をよけよ。守る所は南の柵';
    return reached ? '味方の後ろで息を整えよ' : '城兵をよけ、道沿いに下がれ';
  },
  keepGuardTaskLabel: true, // 城兵への構え方で、守る場所の下知を置き換えない。
  // 向きは既存の矢印で示す。移動中も任務札と足元の札に退く先・守る所を残す。
  travelGuideLabel: (rt) => okawachi.taskLabel(rt, rt.missionGuide?.objective?.text || '組のそばで次の下知を待て'),
  immediatePhaseTasks: true, // 止まれ・退けの切り替わりを十秒待たせない。
  // 四方の兵の減少と、いま守る柵の崩れを混同しない。
  missionDangerText: (rt) => rt.flags.step === 4 ? '南の柵で番の組と合流し、道を守れ' :
    rt.flags.step === 3 ? '追っ手を防ぎ、道の印から南の陣へ退け' : '組が討ち減らされている。坂の旗で味方と槍をそろえよ',
  // 足元へ置き直す印までの六歩を、陣や柵までの残り距離として出さない。
  distanceText: (rt, d) => rt.missionGuide?.marker?.id === 'sakamichi' ? '' : `${Math.round(d)}メートル`,
  taskLabel(rt, text) {
    // 短い任務札にも、台詞と同じ合図を残す。北大手の陽動では動かせない。
    if (!rt.flags.ending) {
      if (rt.flags.step === 0) return !okAtWaitCover(rt) ? '手前の竹束の後ろへ戻り、法螺と早打ちを待て' :
        rt.flags.day < 12 ? '竹束の陰で夜攻めの下知を待て' : '竹束の陰で法螺と早打ちを待て';
      if (rt.flags.step === 1) {
        if (rt.t < (rt.flags.wetGunUntil || 0)) return '火縄は湿って撃てぬ。竹束の陰で槍をそろえよ';
        if (rt.t < (rt.flags.nearVoiceUntil || 0)) return rt.flags.nearVoiceText;
        if (rt.flags.assaultMoving) return 'かかり太鼓：丹羽の竹束と進め';
        if (!okAtWaitCover(rt)) return '手前の竹束の後ろで、搦手の法螺と早打ちを待て';
        return rt.flags.assaultSignalT === undefined ? '北の太鼓では動くな。搦手の法螺を待て' : '法螺に鬨を返して進め';
      }
      if (rt.flags.step === 3) {
        if (rt.t < (rt.flags.chaseVoiceUntil || 0)) return '追っ手の声！　槍を返し、組を守って退け';
        return rt.flags.roadGuideMarked ? '退き太鼓：道の印で角を曲がり、陣へ' : '退き太鼓：組と南の陣へ退け';
      }
      // 短い任務札にも、いま聞こえた追っ手の声と組頭の下知を残す。
      // 坂を守る段なので、帰陣中の「組を守って退け」とは分ける。
      if (rt.flags.step === 2.5) return rt.t < (rt.flags.chaseVoiceUntil || 0)
        ? '追っ手の声！　坂の旗で槍を返し、先に退く組を守れ'
        : '止まれの鉦：坂の旗で退路を守れ';
      if (rt.flags.step === 2) return rt.t < (rt.flags.sortieVoiceUntil || 0)
        ? '城兵の声！　坂の旗で槍をそろえ、退き口を守れ'
        : '止まれの鉦：坂の旗で城兵を止めよ';
    }
    if (rt.flags.step !== 4 || rt.flags.ending) return text;
    // 破られる猶予は道案内より先に出す。残り秒数を「南の柵へ」で隠さない。
    if (rt.flags.dp?.cur?.dangerT) return `あと${Math.max(0, Math.ceil(10 - rt.flags.dp.cur.dangerT))}秒で列が崩れる。柵の味方へ戻れ`;
    // 槍不足の下知を優先し、安全な間は鳴っている合図を短い札にも残す。
    if (rt.flags.dp?.cur?.shortLineThreat) return okShortLineOrder(rt, rt.flags.dp.cur);
    const task = rt.flags.dp?.cur;
    if (task && rt.t < task.signalUntil && task.signalCue === rt.flags.signalCue) return task.signalText;
    const left = Math.max(0, Math.ceil(240 - (rt.t - rt.flags.stepT)));
    if (okAtSouthLine(rt)) {
      const C = rt.flags.dp?.cur;
      // 旗の範囲に入っただけでは、槍の列に合流したことにはしない。
      if (!C || C.lineCount < 3) {
        return C ? okShortLineOrder(rt, C) : '柵の旗で番の組を待て';
      }
      if (!C.holding) return '南の柵の味方へ寄り、列を守れ';
      if (C.repelling) return '城兵を追わず、柵の列を守れ';
      if (!C.engaged) return '柵の旗で道を守れ。列を離れるな';
      return C.holdLeft > 0 ? `柵であと${C.holdLeft}秒。城兵を止めよ` : '柵の列を守り、城兵を押し返せ';
    }
    if (left <= 45) return `交代まで${left}秒。南の柵の旗へ進め`;
    if (rt.flags.roadGuideMarked) return '道の印で南の柵へ進め';
    return '南の柵の旗で、番の組と合流せよ';
  },
  terrainLookWeight: 1, // 切岸で視点が寄った時は本人へ向け、前方の土壁だけを映さない。
  nearSpearFade: true, // 肩越しに重なる味方の長柄は既存の透かしで道を空ける。
  hideBlockingCloseSpears: true, // 細めた味方の槍も、本人への視線を横切る間だけ避ける。
  nearLongWeaponRadius: 10, // 横から伸びる長柄も、描く間だけ避ける。兵と当たりは残す。
  nearGroundSpearRadius: 14, // 切岸では持ち手から離れた穂先も目前へ届く。落ち槍の実際の形を調べる。
  nearGroundSpearClearance: 3, // 胸への視線より下で道を横切る長柄も、描く間だけ避ける。
  nearFlagFadeRadius: 6, // 横から入る旗布も既存の判定へ含め、竹束と城兵を見る隙間を保つ。
  narrowWeaponTrail: true, // 雨の夜でも、刃先の薄い跡だけを残し、白い板で敵を覆わない。
  edgeBehindWaymarks: true, // 南の旗が背後にある時は、案内を画面の端へ寄せて斬り合いを空ける。
  rearAdviceView: true, // 坂でカメラを回した時も、警告の左右を画面の向きに合わせる。
  sideTaskAfter: Infinity, // 城内へ踏み込む櫓取りは、この囲みの任務にしない。
  uchisute: true, // 雨の夜攻めと退路守りでは、首取りの案内を出さない。
  noHorse: true, // 搦手の細い坂を竹束で登る夜攻め。徒歩で出る
  armySignals: false, // 合図は各段の下知で鳴らす。任務の文から共通の退き合図を重ねない。
  nobiki: true, // 交代の終幕も、夜攻めの退きと同じ法螺・二つ打ちで知らせる。
  jinkei: OKAWACHI_JIN,
  // 和睦まで定義が進める。具教を共通処理の討ち取り勝ちに替えない。
  taisho: { b: { def: true } },
  noTaishoRaid: true, // 城兵の出撃は下の有限の控えだけ。本陣救援の別任務を差し込まない。
  noWake: true, // 共通の新手は止める。近い兵はこの戦の有限の控えから替える。
  botOrders: true, // 閉じた木戸の外の守り・退き口を、性格の突進で上書きしない。
  botDefendsFort: true, // 城の弓への避け足より先に、坂への道順と城兵への反撃を決める。
  // 退路守り・帰陣・封鎖は下の期限で締める。封鎖の途中を共通の八分で切らない。
  pacingWait: (rt) => rt.flags.step === 2.5 || rt.flags.step === 3 || rt.flags.step === 4,
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（稲生の標準。kaito 10/24「動かない味方と敵は一切排除」）
  noControlsHelp: true, // 操作の字（なぞって動く・つく）は出さない（操作は尾張の戦で覚える。kaito 10/20）
  spawn: { x: OPEN_PT[0] + 3, z: OPEN_PT[1], heading: Math.PI },
  // 身の回りの当時の場（timeslip_field.js）。永禄十二年九月八日は今の十月半ば・囲みの夜の雨。
  // 城の南の野と搦手の坂道はぬかるみ、水たまりと轍。穂の垂れた秋草。夜討ちで斬り合った柵の口と門前ほど、倒れた槍・矢・北畠方の旗が散る。切岸には置かない。
  timeslip: {
    wet: 0.85, dust: 0.05, trample: 0.3, debris: 1, arrows: 0.7, pools: 0,   // 坂の上の平たい水たまりは、斜面から浮く灰色の板に見える。泥と轍だけ
    grass: 0x8e9458, grassTints: [0xffffff, 0xe6dcac, 0xccc690], grassH: 1.1, tallGrass: 0.8,
    flagColors: [0xe4e0d4, 0x1e1c1a, 0x5a2c2a],
    fights: () => [[FRONT.x, FRONT.z, 30], [SOUTH_BLOCK.x, SOUTH_BLOCK.z, 26], [NEAR.kara.x, NEAR.kara.z, 26], [CAMP_LINE.x, CAMP_LINE.z, 18]],
    skip: (x, z) => { const W = OK_TS.world; if (!W) return false; const h = W.heightAt(x, z); return Math.abs(W.heightAt(x + 1.5, z) - h) > 1 || Math.abs(W.heightAt(x, z + 1.5) - h) > 1; },
  },
  world: {
    compactScenery: true,
    syntheticSound: true, // 合図・鬨・鉄砲・馬・雨や川を、録音へ替えず合成音でそろえる。
    scriptedSignals: true, // 法螺と陣太鼓は下知だけ。環境音の合図を混ぜず、台詞と札にそろえる。
    scriptedWarCries: true, // 鬨と城兵の声は実在する組から。無作為な声で進軍や出撃を知らせない。
    positionedHorseCalls: true, // いななきも近くの生きた馬から。方角を無作為に振らない。
    // 柵へ向かう味方と援けの各兵も道の角を通す。組の要だけ進んで切岸に兵を残さない。
    followColumnRoad: true,
    // 「高」の井楼だけ、写真の垂直な柱と交互に重なる横丸太を使う。
    // 縄張りの指定だけでは共通のすぼまる脚組みが選ばれていた。
    lookoutLogFrame: true,
    seed: 15699,
    autumn: true, // 九月の囲み。切岸の草も夏の緑から枯れ色へそろえる。
    wind: [-0.4, 0.9],
    time: 'dusk',    // 囲みの紹介は夕暮れ。九月八日の下知から、雨の夜へゆっくり移す。
    mountainScale: 0.6, // 雨の伊勢の遠山を低い尾根にし、空を覆う鋸歯の壁にしない。
    nightLift: 4.2,
    nightFogFar: 110, // 夜の見通しを既定の短い距離へ戻さず、木戸と坂の道肩を残す。
    battleViewDistance: 110, // 持ち場から木戸まで約40m。霞の灰で門と櫓を平らに塗らない（10/29）。
    unitNightScale: 0.4, // 雨の夜も具足の色を残し、全員を白い線で縁取らない。
    contactShadows: true, // 近い兵の足元に、坂へ沿う共用の柔らかな影を残す。
    meleeGroundedFeet: true, // 近景の人数枠内で草鞋を接地させ、突きの踏み込みを支える。
    infantryWeight: true, // 槍の間合いで前後の膝へ荷重し、後列にも支える姿勢を渡す。
    noLowBlobShadows: true, // 坂へ水平な簡易影を重ねない。携帯では地面の陰影で足元を見せる。
    fireLightLift: 1.5,
    roundedFire: true,
    closeCombatAssist: true, // 坂を進む城兵も、四歩以内の本人へ向き直って槍で応戦する。
    muddy: 1,
    variedInfantry: true, // 貸し具足の籠手・威し・笠の褪せを六組で共有する。
    variedLoanArmor: true, // 軍の指定色にも、使い込みの差を薄く重ねる。
    variedHeadgear: true, // 既存の六組で陣笠と鉢巻を混ぜ、顔と装備の差を見せる。
    variedMarch: true, // 雨の坂では一人ずつ歩調をずらし、列全体が同じ拍子で跳ねない。
    livingSpearHedge: S.quality === 'high', // 槍の列と当たりは保ち、呼吸と押し返す手元だけ一人ずつずらす。
    livingGunHold: S.quality === 'high', // 鉄砲の手元は呼吸でわずかに動き、頬付けで静まる。
    rainGunDiscipline: S.quality === 'high', // 応える時も雨から火縄を庇い、装填や反動の姿を中断しない。
    contactFootMud: false, // 踏ん張りの泥は下の専用処理で草鞋の接地から出す。腰からの二重放出を止める。
    closeBattleWeight: S.quality === 'high', // 押す肩の間と、敗走の前傾・長柄の抱え方だけを変える。
    routedFlightPose: S.quality === 'high', // 隊が崩れた直後も、個人の敗走判定を待たずに肩と槍を逃げる姿へ移す。
    groundedFlightPace: S.quality === 'high', // 退路で詰まった時は実際の進みに合わせ、走る前傾だけを静める。
    groundedFlightGrip: S.quality === 'high', // 足を止めた敗走兵は槍を起こし、進み始めた分だけ脇へ抱える。
    contactBraceObstacles: S.quality === 'high', // 木戸越しや段違いの相手に肩を押し付けない。
    strideLimit: 0.9, // 走る速さは保ち、腿の振りと腰の弾みだけを人の歩幅に収める。
    naturalArrowRain: true, // 空の矢を太い黒棒にせず、細い矢軸を雨の霧へなじませる。
    arrowRainPerBow: 1, // 少数の守弓から数十本を増やさず、射手に合う一斉射ちにする。
    arrowRainGroundCue: false, // 坂を横切る白黒の大輪を出さず、矢の影と警告の声で知らせる。
    noGroundArrows: true, // 外れた矢を地面へ積み重ねず、雨の坂を針山にしない。
    bareFallenHats: true, // 落ちた笠に頭や首の布を残さない。
    fullTipMatrices: true, // 遠い兵も手首と指を同時に動かし、皮膚が長い帯へ伸びるのを防ぐ。
    groundedFalls: true, // 倒れた体に槍を沿わせ、横倒しの胴も地面で支える。
    terrainContactFalls: true, // 足元が下がってから倒れても、亡骸を古い高さへ残さない。
    settleSideFalls: true, // 横斬りでひねった肩は、倒れ切る時に坂へ寝かせる。
    settledSpearFalls: S.quality === 'high', // 落ちる槍も、ひねり終わって横に寝た胴の向きへそろえる。
    fallPaceSpread: S.quality === 'high' ? 0.35 : 0, // 同時に討たれても、膝が抜ける間まで揃えない。
    carryFallPosture: S.quality === 'high', // 押す肩や屈んだ腰を残し、立ち姿へ戻らずに崩れる。
    weightedFallTravel: S.quality === 'high', // 討たれた側へ半歩で崩し、空いた所を探して大きく回転・横滑りさせない。
    groundedMudSlide: S.quality === 'high', // 坂滑りは胴が着いてから。湿った土で短く減速し、亡骸を大きく回さない。
    terrainContactFalls: S.quality === 'high', // 下りの途中で討たれた体も、古い足元の高さから実際の土へ下ろす。
    contactFalls: S.quality === 'high', // 討たれた瞬間ではなく、体が土へ着いてから具足の重い音を鳴らす。
    blockedFallTravel: S.quality === 'high', // よろめきと坂の滑りは、閉じた木戸や柵の手前で止める。
    weightedFallImpact: S.quality === 'high', // 膝から崩れる体と、背から落ちる体で音と泥の強さを分ける。
    wetEarthBursts: S.quality === 'high', // 接地時の土は白煙にせず、既存の粒で低く短い泥跳ねにする。
    directedFallMud: S.quality === 'high', // 肩や背が倒れ込む側へ泥を低く押し出す。粒数は増やさない。
    waterFallSplash: S.quality === 'high', // 浅瀬へ落ちた胴の重さと向きで、水を低く押し出す。粒数は増やさない。
    wetFootPuffs: S.quality === 'high', // 雨の前後も湿った坂。共通の歩行粒も泥にそろえる。
    slopeContactFalls: true, // 坂へ寝かせた胴の真下で支え、下り側の亡骸を宙へ浮かせない。
    settleFallenLimbs: true, // 倒れ終わる時に浮いた肘・膝も土へ下ろす。担がれる深手は除く。
    spreadFalls: true, // 討死の時だけ空いた半歩を探し、門前の亡骸を同じ列へ重ねない。
    crumpledFlags: true, // 落ちた指物の布は縮めて伏せ、泥の上に硬い板を並べない。
    slopeLitter: true, // 落ちた笠と長柄を、この戦の急な坂へ沿わせる。
    longitudinalSpearFalls: true, // 穂先と石突で坂を測り、中央の急な法線で長柄を浮かせない。
    tabaSlopeGround: true, // 横束の両端と支え棒を坂へ合わせ、足元の隙間を減らす。
    terrainTags: true,
    terrainTriangles: true, // 切岸で足・岩・目線の高さを、描く地面の三角形にそろえる。
    groundedSlopeRocks: true, // 閉じた岩の下縁を坂へ埋め、黒い破片や浮く腹を見せない。
    rockDrawGround: true,
    rockBuriedRim: true,
    rockSlopeContact: true, // 傾けた岩の腹も実際の坂へ埋め、黒い浮き片を残さない。
    slopeRockFaces: true, // 急な道肩では岩の厚みを斜面の外へ向け、薄い黒片だけが露出するのを防ぐ。
    curvedRockTufts: true,
    litRockTufts: true,
    terrainContactView: true, // 近い視点も描く直前に四隅を調べ、切岸の内側へ入れない。
    keepTerrainGrid: true, // 携帯でも足場と同じ格子。切り通しで地面の下へ目線が入るのを防ぐ。
    // 既定の半幅百八十では、北陣・西陣・桂瀬山・矢津川が地面の外へ出る。
    // 高だけ移動範囲と両岸まで地面を延ばす。既存の分割数・兵数・材質は増やさない。
    groundHalf: S.quality === 'high' ? 280 : undefined,
    moveLim: 260,
    moveWay: karameteWay,
    runnerWay: karameteWay,
    followColumnRoad: true, // 後列も組の通った角をたどり、切岸へ斜めに登らない。
    paths: [ROAD_KARAMETE, ROAD_OTE, RUNNER_ROAD, CAMP_ROAD, ROAD_NISHI, ...PEOPLE_ROADS,
      ...OKAWACHI_PLAN.koguchi.map(g => {
        const nx = Math.sin(g.rot || 0) * OKAWACHI_PLAN.gateSlope, nz = Math.cos(g.rot || 0) * OKAWACHI_PLAN.gateSlope;
        return [[g.at[0] - nx, g.at[1] - nz], g.at, [g.at[0] + nx, g.at[1] + nz]];
      })],
    pathWidth: 2.8,
    climbTan: 0.70,
    height,
    // 阪内川（東）・矢津川（北）
    riverCross: true, // 深い本流へ徒歩で入らせない。任務はすべて城側の岸。
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [
      // 松阪市の環境調査では阪内川は伊勢湾へ北流する。水面は点の順に流れるため、
      // 高では南から北へ並べる。川筋・幅・深さ・仮橋と使番の渡り道は保つ。
      // 上流が南の野の途中で途切れないよう、同じ接線で地面の外まで延ばす。
      // 北の支流も西の場外まで延ばす。場外の川筋は推定復元。
      // https://www.city.matsusaka.mie.jp/uploaded/attachment/10322.pdf
      { pts: S.quality === 'high'
        ? [[136, 320], [128, 180], [120, 40], [126, -60], [116, -180], [122, -300]]
        : [[122, -300], [116, -180], [126, -60], [120, 40], [128, 180]], w: 10, depth: 1.4 },
      // 北大手道は川を斜めに渡る。旧浅瀬の完全に浅い帯（x=-16〜-4）から、
      // 北岸寄りの道肩が外れていた。高では道幅も含め x=-14〜2 を浅くし、両岸をつなぐ。
      // 北裾の川は松阪市の遺構解説によるが、渡り口の位置・幅は推定復元。
      // 川筋・本流の深さ・城側の備えと乱戦は保ち、浅瀬の既存の計算だけを使う。
      { pts: S.quality === 'high'
        ? [[-300, -238], [-240, -240], [-120, -244], [0, -238], [80, -242], [120, -236]]
        : [[-240, -240], [-120, -244], [0, -238], [80, -242], [120, -236]], w: 7, depth: 1.2,
        fords: [{ x: S.quality === 'high' ? -6 : -10, w: S.quality === 'high' ? 12 : 10 }] },
    ],
    // 四方の陣は『信長公記』巻二による。伐開の範囲は兵列・旗本・補給場からの推定。
    // 高の北陣（z=-202）と東陣（x=94）を含め、木が兵と陣小屋に重ならないようにする。
    // 既存の植樹候補を陣外へ回す。木の設定数・谷の林・兵数・歩く地形は保つ。
    clear: (x, z) => (S.quality === 'high' && (
      (Math.abs(x + 30) < 34 && z > -229 && z < -186)
      || (x > 82 && x < 114 && z > -128 && z < -64)
      || (x > SIEGE.west.x - 26 && x < SIEGE.west.x + 15 && z > -144 && z < -80)
      || (x > 50 && x < 117 && z > 38 && z < 82)
    )) || (Math.abs(x - HONJIN.x) < 21 && z > HONJIN.z - 32 && z < HONJIN.z + (S.quality === 'high' ? 48 : 32)) || (x > -82 && x < -36 && z > 88 && z < 170) || (x > 42 && x < 62 && z > 100 && z < 170) || (x > -142 && x < -102 && z > -174 && z < -54) || (x > -115 && x < -18 && z > -153 && z < -91) || (Math.abs(x) < 82 && z > -170 && z < 100) || (Math.abs(x) < 26 && z > -232),
    trees: 480,
    thickTrees: true,
    layeredNeedles: true,
    softFarNeedles: true, // 近い杉と遠い杉に、既存の枝先を崩す形を使う。
    raggedNeedles: true, // 杉のまっすぐな円錐の縁を枝の段で崩す。形は生成時に共有する。
    solidFoliage: true, // この戦だけ、葉の十字板を枝先の立体の房へ替える。
    nearCedarBranches: true, // 高画質の一枚板を避け、中距離にも枝房の丸みを残す。
    closedFarCrowns: true, // 場外の雑木も面の継ぎ目を閉じ、裂けた黒い板に見せない。
    tufts: 3200,
    // 株数は増やさず、画面に入る搦手と退き口の道肩へ群落を寄せる。
    undergrowthBands: [
      { x: GATE.x - 12, z: GATE.z + 13, w: 6, d: 16 },
      { x: GATE.x + 13, z: GATE.z + 15, w: 6, d: 18 },
      { x: 23, z: 26, w: 5, d: 20 },
      { x: 46, z: 28, w: 5, d: 19 },
    ],
    patchyGround: true,
    softPathSoil: true, // 道の土と泥を連続して混ぜ、地面の格子を四角い色の境目にしない。
    softEarthCrust: true, // 土塊の升の境で陰と凹凸を切り替えず、敷石のような四角を消す。
    subtleMudRelief: true, // 泥の窪みは踏まれた所だけに薄く残し、道一面の楕円を抑える。
    stableSlopeGrain: true, // 曲がる坂でも模様の座標を保ち、道肩の細かい縞を抑える。
    erodedSlopes: true, // 共通の雨溝と露岩の斑で斜面を見せ、歩ける高さは保つ。
    // 門前は踏み荒らされた泥、塀際は草の残る肩にする。歩ける地形は変えない。
    groundCover: (x, z) => {
      const apron = Math.hypot((x - GATE.x) / 8, (z - GATE.z - 5) / 12);
      return Math.max(0.03, Math.min(1, (apron - 0.55) * 1.4));
    },
    treeDensity: (x, z) => (Math.abs(x) < 82 && z > -170 && z < 100 ? 0.12 : 1),
    // 個別の林は clear の判定を通らない。南の番と旗の足場から幹を離す。
    groves: [{ x: -50, z: 0, r: 12, n: 16 }, { x: 64, z: 20, r: 10, n: 16 }, { x: -169, z: -112, r: 16, n: 22 }, { x: -64, z: -46, r: 14, n: 18 },
      // 持ち場から見える搦手の坂の両肩に秋の雑木（10/29。坂が土の一枚に見えた。戦う段と道は空ける。樹種と位置は推定）
      { x: -38, z: -24, r: 5, n: 6, kind: 'broad' }, { x: -48, z: -60, r: 5, n: 5, kind: 'broad' }, { x: 40, z: -20, r: 5, n: 6, kind: 'broad' }, { x: 22, z: -68, r: 3, n: 3, kind: 'broad' },
      // 持ち場の正面（木戸へ上る坂）の両肩に松と雑木。25秒の画面の左右に幹と枝が入る（10/29。位置は推定）
      { x: -15, z: -33, r: 3, n: 3, kind: 'broad' }, { x: 16, z: -31, r: 3, n: 3, kind: 'matsu' }, { x: -24, z: -46, r: 4, n: 4, kind: 'matsu' }, { x: 26, z: -47, r: 4, n: 4, kind: 'broad' },
      // 作り物の丸い房と幹をやめた代わりに、木戸の坂の奥の両肩へ葉の絵の雑木（秋の褐色に散らす。10/29）
      { x: -25, z: -63, r: 3, n: 3, kind: 'broad' }, { x: 25, z: -64, r: 3, n: 3, kind: 'broad' }],
    // 杉の尖った円錐ばかりが並ばないよう、九月の丘は松と雑木を多めに（10/29）。
    treeMix: { sugi: 0.22, matsu: 0.5 },
    // 坂の両肩と塀の根に下草の群れを寄せる（本数は保つ）。
    // 持ち場から木戸への坂の道肩（10/29）にも寄せ、坂を土の一枚にしない。
    undergrowthBands: [{ x: -20, z: -36, w: 6, d: 7 }, { x: 24, z: -40, w: 5, d: 12 }, { x: -9, z: -36, w: 5, d: 9 }, { x: 10, z: -36, w: 5, d: 9 }, { x: -8, z: -50, w: 4, d: 4 }, { x: 8, z: -50, w: 4, d: 4 }, { x: -14, z: -57, w: 8, d: 2.5 }, { x: 14, z: -57, w: 8, d: 2.5 }],
    fleeOut: (x, z, team) => team === 1 && z < -82,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    okRainGuns(rt);
    okScreen(rt);
    okNight(W);
    OK_TS.world = W; timeslipField(rt);   // 身の回りのぬかるみ・倒れた槍と旗・秋草（def.timeslip。切岸は外す）
    okLandscape(W);
    okSlopeDetail(W);
    okAutumnBushes(W);
    okPeopleHomes(rt);
    okSiegeLife(rt);
    // 矢の警告も既存の三枠へ。別の札と強制見上げで、坂の案内をふさがない。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || rt.t < 5 || rt.over || rt.ended || F.failed || F.ending) return;
      if (rt.t < (F.arrowRainAt ?? -Infinity) + 8) return;
      F.arrowRainAt = rt.t;
      rt.bark(F.step === 3 ? '矢が降る！　足を止めず陣へ退け' : F.step === 4 ? '矢が降る！　柵の陰へ寄れ' : '矢が降る！　竹束の陰へ寄れ', true);
    };
    rt._rfN = 3; // 持ち場の外から自動で補充する共通の新手を、この戦では使わない。
    // 遅れて届く共通の台詞も、負けの札の後には表示しない。
    const say = rt.say;
    rt.say = function(who, text, ...args) {
      if (F.failed && !(who === '組頭' && text === FAILED_WITHDRAWAL)) return false;
      // 退きの下知に、共通の追撃の声を重ねない。
      if (F.step === 3 && /敵が背を見せた！.*追え|敵が崩れた！.*押せ/.test(text))
        text = '追うな！　槍を返し、南の陣へ退け！';
      if (F.step === 4 && /敵が背を見せた！.*追え|敵が崩れた！.*押せ/.test(text))
        text = '追うな！　南の柵で列を保て！';
      // 四方の総兵数の減少を、南の持ち場の敗勢と取り違えない。
      if (F.step === 4 && /味方が討ち減らされておる|味方がもう持たぬ/.test(text))
        text = '南の柵の旗を守れ。番の組と槍をそろえ、城兵を通すな';
      return say.call(this, who, text, ...args);
    };
    const call = rt.soldierCall;
    rt.soldierCall = function(key, pos, who = '兵') {
      if (F.ending) return;
      // 下知と返事、不発や近くの将、出撃・追撃の声を、普段の掛け声と札で覆わない。
      // 助けや敗走など、目前の危険を知らせる声は残す。
      if (rt.t < Math.max(F.signalQuietUntil || 0, F.wetGunUntil || 0, F.nearVoiceUntil || 0,
          F.sortieVoiceUntil || 0, F.chaseVoiceUntil || 0) &&
          key !== 'help' && key !== 'flee' && key !== 'lordFall') return;
      if (who.startsWith('味方') && key === 'advance') {
        if (F.step === 3) key = 'retreat';
        else if (F.step === 2 || F.step === 2.5 || F.step === 4) key = 'spear';
      }
      // この城方は北畠勢。共通の声に別の家の名を残さない。
      if (!who.startsWith('味方') && who !== '兵' && /の兵$/.test(who)) who = '北畠の兵';
      // 退く側の下知と紛らわしい城兵の前進の声は、槍を構える声に替える。
      if (who === '北畠の兵' && key === 'advance' && F.step === 3) key = 'spear';
      return call.call(this, key, pos, who);
    };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true; F.day = 1;
    W.setRainTarget(0);
    // 雨の闇の篝火と、城の丘に高く立つ北畠の幟（遠くからも城の位置が見える。A064・A065）
    // 切り通しの縁では脚が土に消える。下る道の肩へ、台と火を一緒に置く。
    const roadFires = [];
    for (let i = 4; i <= 7; i++) {
      const a = KARAMETE_WAY[i - 1], b = KARAMETE_WAY[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      roadFires.push([(a[0] + b[0]) / 2 - dz / len * 1.8, (a[1] + b[1]) / 2 + dx / len * 1.8]);
    }
    // 城方の篝火：搦手口の曲輪の塀の内にも焚き、夕暮れの城の輪郭と屋根を火で浮かせる（10/28）。
    // 本丸の館の前と、木戸の内の二棟の脇・西ノ丸の東の縁にも篝火。坂の下から城の屋根を照らす（位置は推定）。
    const castleFires = [[-5, -73], [6, -78], [-8, HON_C.z + 6], [8, HON_C.z + 6], [NISHI_C.x + 10, NISHI_C.z + 6]];
    for (const [x, z] of [...roadFires, [-18, MAE_C.z], [18, MAE_C.z], [-6, GATE.z - 3], [6, GATE.z - 3], [-14, GATE.z - 7], [14, GATE.z - 7], [-10, -96], [10, -96], ...castleFires]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.35, size: 0.7, ...OK_FIRE_REACH });
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...OKAWACHI_HIST, honjinOda: 'HIST_B', honjinKitabatake: 'HIST_B', kitabatakeAI: 'GAME_C' };
    resetGates();

    // ---- 縄張り（castles/okawachi.js）：北大手・南搦手・本丸・西ノ丸・二ノ丸・御納戸・馬場。木戸は castle_plan.js に建てさせる ----
    // 夜攻めで城は落ちない。木戸は保ち、戦う場は城外の坂に限る。
    const high = true;
    // 巻二の北の囲みは城外の鹿垣を守る陣。従来は奥行き十八歩の兵列と
    // 陣の火が二重の柵（z=-184・-180）に重なっていた。高だけ十四歩北へ退く。
    // 矢津川（z≒-240）より城側に収め、五百二十人・幅・奥行きは変えない。
    // 将・旗・火・誘いの後の帰陣も同じ持ち場を使う。細かな座標は推定復元。
    SIEGE.north.z = high ? -202 : -188;
    // 北大手道は兵列の奥行き内で x≒-2〜10 を通る。中央の五百二十人で道を埋めず、
    // 高では同じ幅四十六歩の列を西へ寄せ、東端を x=-7 に収める。
    // 北の布陣は巻二、道脇の座標は推定。兵数・密度・矢津川との間隔は保つ。
    SIEGE.north.x = high ? -30 : 0;
    // 四方の柵による通路封鎖は三重県の解説による。陣の座標は推定復元。
    // 西向きの奥行き十六歩の兵列は、従来の中心 x=92 では前端 x=84 が鹿垣に重なる。
    // 高だけ二歩川側へ寄せ、前端 x=86・後端 x=102 として柵と使番道（x=104）の間へ収める。
    // 三百六十人・列の幅と奥行きは保ち、旗本・旗・陣の火・帰陣先も同じ中心を使う。
    // https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
    SIEGE.east.x = high ? 94 : 92;
    for (const [key, id] of [['north', 'okNorth'], ['east', 'okEast']]) {
      const jin = OKAWACHI_JIN[0].sonae.find(s => s.id === id);
      const dx = SIEGE[key].x - HONJIN.x, dz = SIEGE[key].z - HONJIN.z;
      jin.at.right = dx * Math.cos(OKAWACHI_JIN[0].facing) - dz * Math.sin(OKAWACHI_JIN[0].facing);
      jin.at.front = dx * Math.sin(OKAWACHI_JIN[0].facing) + dz * Math.cos(OKAWACHI_JIN[0].facing);
    }
    // 井楼の上の幟も、戦の定義と同じ北畠の笹竜胆にそろえる。
    if (high) W.def.sides = this.sides;
    const C = F.C = buildCastlePlan(rt, high ? OKAWACHI_HIGH_PLAN : OKAWACHI_PLAN, { ladders: false, baseHeight: baseWithHori, edgeW: 2.4, buildGates: true, buildTowers: true, team: 1, ...(high ? { life: false } : {}) });
    // 距離で近景と遠景を切り替える三基は、静止物の結合から外す。
    // 片方だけを結合すると、切り替え後に床と柱が消えて守兵だけが空へ残る。
    for (const tower of C.towers) tower.mesh.userData.noFreeze = true;
    const joC = C.kuruwa.jo.centroid;
    F.gates = { karamete: makeGate(rt, C.gateObjs.karamete, { name: GATE.name, guardTeam: 1 }) };
    okGate(F.gates.karamete);
    for (const gate of Object.values(C.gateObjs)) { gate.struct.armor = 1; gate.struct.noTarget = true; }
    if (S.quality === 'high') okCastleFront(rt);
    // 曲輪の中の木造の建物（板葺き。大きな石垣・天守は無い）。本丸の館に北畠具教
    const homeBatch = high ? makeSimpleBatch() : null;
    const roofs = { h: high ? 2.6 : 3.2, ita: true, wall: 0x6a5a44, ...(high ? { boardRoof: true, weatheredBoards: true, batch: homeBatch } : {}) };
    const homes = high ? [[-12, -80, 5, 8, 0], [12, -72, 5, 6, 0],
      [-122, -134, 5, 12, 0], [-122, -90, 5, 10, 0],
      [65, -131, 6, 13, Math.PI / 2], [64, -100, 6, 10, Math.PI / 2],
      [56, -79, 5, 7, 0], [67, -57, 4, 10, Math.PI / 2],
      [-11.5, -151, 3, 8, 0]] : [[-12, -77, 5, 4, 0], [12, -70, 5, 4, 0],
      [NISHI_C.x - 4, NISHI_C.z - 6, 9, 5, 0], [NI_C.x + 4, NI_C.z - 8, 10, 6, 0.1], [NI_C.x - 6, NI_C.z + 8, 7, 5, -0.1],
      [ONANDO_C.x - 6, ONANDO_C.z, 9, 6, 0], [ONANDO_C.x + 7, ONANDO_C.z + 2, 7, 5, 0.1], [BABA_C.x + 16, BABA_C.z - 10, 8, 5, 0.2],
      [OTE_C.x - 6, OTE_C.z - 4, 7, 5, 0]];
    for (const [i, [x, z, w, d, r]] of homes.entries()) {
      // 写真の長屋は長手の軒下に戸口が並ぶ。八歩以上の長屋に閉じた板戸を配る。
      // 既存の壁・当たりは保ち、下屋の軒より下へ納める。
      // 本丸の木戸のすぐ内の二棟は、坂の下から塀越しに屋根が見える高さにする（推定）。
      const home = hut(W, x, z, w, d, r, high
        ? { ...roofs, h: i < 2 ? 4.4 : roofs.h, boardRoofColors: OK_ROOF_COLORS[i % OK_ROOF_COLORS.length], nagayaDoors: d >= 8 }
        : roofs);
      if (home) rt.scene.add(home);
    }
    if (homeBatch) finalizeSimpleBatch(rt, homeBatch);
    // 囲みの陣の裏の小荷駄：兵糧と竹束を担ぐ小者が、陣の後ろを行き来する（kaito 10/28 の割合。前線には出さない）。
    porterTrain(rt, [[CAMP.x - 12, CAMP.z + 10], [CAMP.x, CAMP.z + 12], [CAMP.x + 12, CAMP.z + 10], [CAMP.x + 20, CAMP.z + 20]], 6, { name: '織田の小荷駄' });
    if (high) okHouseYards(rt);
    // 本丸の南西に水の手を補う。板葺きの井戸の位置・寸法は推定。
    const wellBatch = makeKitBatch();
    kuruwaBldg(W, 'ido', -12, -102, 0, { ita: true, boardRoof: high, batch: wellBatch });
    if (high) {
      // 御納戸は蔵、馬場の端は開いた厩。曲輪の中央の兵の場所は保つ。
      // 厚い一枚屋根と石の裾を避け、褪せた葺き板・押縁・木造の蔵の足元にする。
      kuruwaBldg(W, 'kura', 40, -79, 0, { ita: true, boardRoof: true, timberStore: true, batch: wellBatch });
      kuruwaBldg(W, 'umaya', 75, -44, Math.PI / 2, { ita: true, boardRoof: true, batch: wellBatch });
    }
    finalizeKitBatch(rt, wellBatch);
    // 館は縄張り（castles/okawachi.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に具教（kaito 10/2）
    // 写真のように曲輪の縁と木戸へ配る。館前の二重の旗列を解き、屋根・控えの兵列から離す。
    // 北畠の笹竜胆は共通の紋を使い、位置と竿の高さだけを推定で変える。
    const castleFlags = high ? [[-6, -64, 4.2], [6, -64, 4.2], [-14, -70, 4.6],
      [-10, -124, 5], [11, -124, 4.6], [-125, -76, 4.8], [-115, -143, 4.4],
      [73, -107, 4.8], [25, -136, 4.4], [57, -85, 4.2], [30, -43, 4.8], [70, -34, 4.4],
      [9, -153, 4.6], [-7, -142, 4.2]]
      : [[-6, GATE.z - 4], [6, GATE.z - 4], [HON_C.x - 10, HON_C.z + 8], [HON_C.x + 10, HON_C.z + 8], [OTE_C.x - 6, OTE_C.z + 6], [OTE_C.x + 6, OTE_C.z + 6], [NI_C.x, NI_C.z + 12], [NISHI_C.x + 6, NISHI_C.z + 10]];
    for (const [x, z, h = 4] of castleFlags) rt.scene.add(nobori(W, x, z, 'kitabatake', h));
    okKarameteFront(rt);
    okKarameteYard(rt);

    // ---- 守り（北畠勢。曲輪ごとの部隊。搦手口だけ本物の兵、ほかは軽い作りで数だけ） ----
    // 搦手口には弓八人。撃ち合う人数は小勢に絞るが、威力は弱めない。
    F.gateDef = makeButai(rt, { name: '塀の内の北畠勢', team: 1, faction: 'kitabatake', kind: 'bow', nominal: 8, nearReal: 8, maxReal: 8, armor: KITABATAKE.armor, lace: KITABATAKE.lace, flag: KITABATAKE.flag, at: { x: joC.x, z: GATE.z - 3 }, facing: 0, real: 8 });
    F.gateDef.order({ id: 'hold' });
    // 搦手の控えの一部は下の出撃組として初めから城内に置く。二重に数えない。
    F.gateDef.noSwitch = true;
    F.gateReserve = makeButai(rt, { name: '搦手の残る控え', at: { x: 10, z: -87 }, lightWidth: 10, lightDepth: 6, nominal: 96, facing: 0, armor: KITABATAKE.armor, lace: KITABATAKE.lace, flag: KITABATAKE.flag, team: 1, faction: 'kitabatake', kind: 'ashigaru', real: 0, noSwitch: true });
    // 弓の狙いは明るさに従う。倒れた弓兵の自動補充はしない。
    const KB_B = { team: 1, faction: 'kitabatake', armor: KITABATAKE.armor, lace: KITABATAKE.lace, flag: KITABATAKE.flag, real: 0, maxReal: 0 };
    F.kb = {
      ote: makeButai(rt, { ...KB_B, name: '大手の北畠勢', kind: 'ashigaru', nominal: 220, lightWidth: 18, lightDepth: 12, at: POST.ote, facing: Math.PI }),          // 北の大手へ向く
      hon: makeButai(rt, { ...KB_B, name: '本丸の旗本', kind: 'ashigaru', nominal: 130, lightWidth: 24, lightDepth: 14, at: POST.hon, facing: 0 }),
      nishi: makeButai(rt, { ...KB_B, name: '西の丸の守り', kind: 'bow', nominal: 80, lightWidth: 20, lightDepth: 14, at: POST.nishi, facing: -Math.PI / 2 }),   // 谷が守るので少数
      ni: makeButai(rt, { ...KB_B, name: '二の丸の守り', kind: 'ashigaru', nominal: 160, lightWidth: 24, lightDepth: 20, at: POST.ni, facing: Math.PI / 2 }),
      onando: makeButai(rt, { ...KB_B, name: '御納戸の番', kind: 'ashigaru', nominal: 40, lightWidth: 18, lightDepth: 10, at: POST.onando, facing: Math.PI / 2 }),
      res: makeButai(rt, { ...KB_B, name: '馬場の予備', kind: 'ashigaru', nominal: 150, lightWidth: 38, lightDepth: 18, at: POST.baba, facing: Math.PI }),
    };
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    F.gateDef.real.calm = false;
    for (const u of F.gateDef.real.units) u.noTarget = false;
    F.kbResAt = 'baba';
    // 総大将・北畠具教は本丸の館の中（天守の無い城）。旗本が縁側の上がり口を守り、踏み込むまで討てない
    F.keep = makeLordKeep(rt, {
      name: '北畠具教', spot: { x: HON_C.x, z: HON_C.z - 7 }, mouth: { x: HON_C.x, z: HON_C.z - 1 }, facing: 0, guardN: 6,
      faction: 'kitabatake', armor: KACCHU['北畠具教'].armor, flag: KITABATAKE.flag, haori: null,
    });
    // 本丸の笹竜胆を大旗に。写真の井楼と同じ木造の城に収め、兵は増やさない。
    rt.scene.add(nobori(W, HON_C.x + 5, HON_C.z - 4, KITABATAKE.flag, 6.5));
    if (F.keep.lord) { F.keep.lord.noTarget = true; F.keep.lord.invuln = true; }
    F.tomofusa = enemyGroup(rt, { fixed: true, faction: 'kitabatake', name: '北畠具房の居所', anchor: { x: F.keep.spot.x + 2, z: F.keep.spot.z }, facing: 0, width: 1, aggro: 0, noRout: true },
      KB([{ type: 'busho', n: 1, o: { name: '北畠具房', horse: false, invuln: true } }]));
    for (const u of F.tomofusa.units) { u.pos.y = F.keep.spot.y; u.keep = true; u.noTarget = true; }
    F.tomofusa.calm = true;
    F.commander = { alive: true, get real() { return F.keep && F.keep.lord && F.keep.lord.alive ? F.keep.lord : null; } };

    // ---- 丹羽長秀の手（自分の持ち場）、池田・稲葉の手、退路の支援、竹束を進める組 ----
    F.niwa = allyGroup(rt, { fixed: true, formation: 'yari', name: '丹羽長秀の手', anchor: { x: 0, z: 40 }, facing: Math.PI, width: 14, aggro: 10, noRout: false },
      okDress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', x: 0, z: 47, horse: false, invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }, { type: 'bow', n: 2 }], ODA));
    F.niwaU = F.niwa.units[0];
    // 巻二が丹羽の攻め口に記す近松豊前・神戸伯耆を、既存の侍で示す。
    // 高だけ二人目にも名を付け、共通の人数調整・能力・具足・立ち位置を保つ。
    // 討死の記録から攻め口への参加を表すが、生死は遊びに委ねる。
    // https://ja.wikisource.org/wiki/信長公記 （巻二・九月八日の夜攻め）
    let niwaSamuraiN = 0;
    for (const u of F.niwa.units) {
      if (u.type !== 'samurai') continue;
      if (niwaSamuraiN === 0) u.name = '近松豊前';
      else if (high && niwaSamuraiN === 1) u.name = '神戸伯耆';
      niwaSamuraiN++;
    }
    F.ikeda = allyGroup(rt, { fixed: true, formation: 'yari', name: '池田恒興の手', anchor: { x: -26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      okDress([{ type: 'samurai', n: 1, o: { name: '池田恒興', x: -26, z: 51, horse: false, invuln: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.inaba = allyGroup(rt, { fixed: true, formation: 'yari', name: '稲葉良通の手', anchor: { x: 26, z: 44 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      okDress([{ type: 'samurai', n: 1, o: { name: '稲葉良通', x: 26, z: 51, horse: false, invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { ...ODA, flag: 'inaba' }));
    F.ram = allyGroup(rt, { fixed: true, formation: 'yari', name: '竹束を進める組', anchor: { x: 12, z: 54 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      okDress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    // 夜攻めを命じられた三将と、南の囲みの滝川を混同しない。
    // 旧名の F.taki は名の伝わらない退路支援の組とし、兵種・人数・動きは保つ。
    F.taki = allyGroup(rt, { fixed: true, formation: 'yari', name: '南の退路を守る組', anchor: { x: -36, z: 66 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      okDress([{ type: 'busho', n: 1, o: { name: '退路の組頭', x: -36, z: 73, horse: false, invuln: true, hat: 'kabuto_f', haori: 0x2a2a32 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.niwa, F.ikeda, F.inaba, F.ram, F.taki];
    // 夜攻め・退き・封鎖の持ち場は、この戦の下知で動かす。
    // 昼に射撃を解いた後も、共通の判断で城内へ向かわせない。
    // 雨の夜は撃つ支度そのものを止める。弓と白兵の強さは保ち、昼の封鎖で射撃を解く。
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.historicalOrders = true; g.holdFire = true; }
    // 出撃組は木戸の内で待つ。カメラの背後へ生成場所を替えない。
    F.sorties = [
      enemyGroup(rt, { fixed: true, faction: 'kitabatake', name: '搦手の城兵', anchor: { x: 0, z: -68 }, facing: 0, width: 4, colW: 4, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]))),
      enemyGroup(rt, { fixed: true, faction: 'kitabatake', name: '搦手の控え', anchor: { x: 0, z: -78 }, facing: 0, width: 4, colW: 4, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]))),
      enemyGroup(rt, { fixed: true, faction: 'kitabatake', name: '封鎖へ寄せる城兵', anchor: { x: -11, z: -86 }, facing: 0, width: 3, colW: 3, spacing: 1.1, fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 0 }, KB(cappedList(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }]))),
    ];
    for (const g of F.sorties) { g.historicalOrders = true; g.calm = true; for (const u of g.units) u.noTarget = true; }
    // 夜攻めの三手とは別に、初めから南の柵を守る小組。敗走した組の到着を封鎖の条件にしない。
    // 有限の十人を初めに置き、死傷者を補充しない。以後の新手も人数の枠に数える。
    // 巻二の通路封鎖に続く廻番衆を、既存の番で示す。南の担当・十人の配分は推定。
    // https://ja.wikisource.org/wiki/信長公記/我自刊我書 （巻二・阿坂の城退散之事）
    F.blockGuard = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', name: '廻番衆の南の番',
      anchor: { x: SOUTH_BLOCK.x, z: SOUTH_BLOCK.z + 6 }, facing: Math.PI, width: 4, yariRanks: 3, spacing: 1.1,
      // 夜は通り過ぎる追っ手へ持ち場を離れず、目の前の敵にだけ応戦する。
      order: 'hold', aggro: 3, morale: 85 }, okDress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ODA));
    // 名のない番も下知で持ち場を守る。共通の前進判断で夜攻めへ連れ出さない。
    F.blockGuard.historicalOrders = true;
    F.blockGuard.noPursue = true;
    rt.scene.add(nobori(W, SOUTH_BLOCK.x + 3.5, SOUTH_BLOCK.z + 4, 'oda', 3.5),
      nobori(W, CAMP_LINE.x + 5, CAMP_LINE.z, 'oda', 3.5),
      nobori(W, FRONT.x, FRONT.z, 'oda', 3.5));
    // 支度中は鉄砲を待たせ、夜攻めでは雨で撃てない。弓は夕暮れから矢を交わす。昼の封鎖で鉄砲も解く。
    for (const g of [F.niwa, F.taki]) g.holdFire = true;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 3, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    F.lineGroups = rt.squadGroups.length ? rt.squadGroups : [F.niwa];
    F.lineMin = Math.min(3, F.lineGroups.reduce((sum, g) => sum + g.count, 0));
    [F.niwa, F.ikeda, F.inaba, F.ram, F.taki].forEach((g, i) => {
      const j = i === 0 ? 5 : i === 2 ? 3 : 4;
      const at = ROAD_KARAMETE[j], prev = ROAD_KARAMETE[j - 1];
      const dx = at[0] - prev[0], dz = at[1] - prev[1], len = Math.hypot(dx, dz);
      // 池田・竹束・退路守りを同じ一点へ重ねず、道の向きに二列で待たせる。
      const back = i === 3 ? 16 : i === 4 ? 30 : 0;
      g.formation = 'column'; g.colW = 2; g.spacing = 1.1; g.roadColumn = true;
      g.facing = g._face = Math.atan2(dx, dz);
      placeGroup(rt, g, at[0] - dx * back / len, at[1] - dz * back / len);
    });
    // ---- 竹束の寄せ（taketaba.js）：丹羽・池田・稲葉の手は竹束を押し立て、雨の闇をゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    const gateHalf = () => F.step >= 2 || F.gates.karamete.struct.hp < F.gates.karamete.struct.maxHp * 0.5;
    F.TA = makeTabaAdvance(rt, {
      near: 40,
      items: [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]].map(([g, x]) => ({ g, yose: { x, z: GATE.z + 16 }, until: gateHalf })),
      avoid: [this.spawn, { x: 10, z: 50 }],
    });
    F.advanceCover = { x: this.spawn.x, z: this.spawn.z };
    F.waitCover = { x: this.spawn.x, z: this.spawn.z };
    // 開始時の目の前にも、実際に矢を防ぐ竹束を置く。元の形を使い回す。
    // 二歩後ろの開始位置を矢除けの範囲に収める。中央に人幅の隙間を空けない。
    addTaba(rt, this.spawn.x - 1, this.spawn.z - 2, 0, { fixed: true });
    addTaba(rt, this.spawn.x + 1, this.spawn.z - 2, 0, { fixed: true });
    const tabaMaterial = F.tabas[0].m.material.clone();
    // 円柱と節の陰影は夜の光に任せる。青竹〜灰茶の形と材質を全束で共有する。
    tabaMaterial.color.setHex(0xffffff);
    // 竹の頂点色（青黄の竹）へ杉板の絵を重ねると、夜は 0.04 ほどの黒い板になっていた（10/29）。
    // 竹は板目を持たないので絵を外し、竹の色と節・縄の頂点色だけで照らす。少し艶を残す。
    // 絵を外すと青竹が鮮やかすぎるので、刈って日の経った竹のくすんだ色へ寄せる。
    tabaMaterial.map = null; tabaMaterial.roughness = 0.74; tabaMaterial.color.setRGB(0.6, 0.53, 0.42);
    tabaMaterial.emissive.setHex(0x000000); tabaMaterial.emissiveIntensity = 0;
    // 手前の壁を抜く処理は竹の側面も消し、節と横桟だけを残す。
    // この戦の共用材質だけ竹を保つ。視点は下の障害物判定で手前へ寄せる。
    tabaMaterial.userData.camNearSolid = true;
    const tabaShape = tabaGeo(false, false, false, true);
    for (const tb of F.tabas) {
      tb.m.geometry = tabaShape; tb.m.material = tabaMaterial;
      // 竹束も既存の視点の障害物に含め、束を越えて視点を引かない。
      // 矢除けの位置・当たりと、離れた束の姿はそのまま保つ。
      tb.m.userData.camBlock = true;
    }
    okTabaCamera(rt);
    okRoadCamera(rt);
    // 横長の開始画面に、坂の上の門と本丸の輪郭まで入れる。見回しの操作は保つ。
    if (S.quality === 'high') rt.player.pitch = 0.24;
    // 太鼓までは、遠い丹羽の組でなく目の前に据えた竹束の後ろへ案内する。
    rt.marker('tabaFront', F.waitCover, '手前の竹束の後ろへ', { h: 0.5, guidePriority: 100, guideAlways: true });
    rt.marker('karamete', GATE, '南の搦手の木戸', { h: 5 });
    // ---- 織田の本陣（東の山。信長）と、城外の四方の囲みの陣（軽い作り。一つのキャンプに集めない） ----
    okRunnerBridge(rt);
    F.jinOdaCamp = camp(rt, { x: HONJIN.x, z: HONJIN.z, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', armor: ODA.armor, lace: ODA.lace,
      general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: 148, z: -190 } });
    // 巻二の御座所の番は馬廻・小姓・弓衆・鉄砲衆。既存の旗本の侍で前二者を示す。
    // 高だけ六人を三人ずつ呼び分ける。人数・配分は推定で、兵種・能力・具足は保つ。
    // 馬廻という役目を騎馬兵への変更と取り違えず、山上の本陣では従来どおり徒歩で控える。
    // https://ja.wikisource.org/wiki/信長公記 （巻二・御座所御番之事）
    if (high) {
      const guard = F.jinOdaCamp.guard;
      guard.name = '信長の本陣の番衆';
      const samurai = guard.units.filter(u => u.type === 'samurai');
      const half = Math.ceil(samurai.length / 2);
      for (let i = 0; i < samurai.length; i++) samurai[i].name = i < half ? '馬廻の侍' : '小姓衆';
    }
    // 巻二に記される本陣の弓衆・鉄砲衆を、高では控えの内数で示す。
    // 六十・三十・三十の配分は推定。西向きの列を幅で分け、元の十八歩幅・百二十人を保つ。
    // https://ja.wikisource.org/wiki/信長公記/我自刊我書 （巻二・御座所御番之事）
    const honjinTroops = { facing: -Math.PI / 2, team: 0, faction: 'oda', flag: 'oda', armor: ODA.armor, lace: ODA.lace, lightDepth: 12, real: 0, noSwitch: true };
    F.honjinReserve = makeButai(rt, { ...honjinTroops, name: '信長の本陣の控え',
      at: { x: HONJIN.x + 4, z: HONJIN.z + (high ? 23.5 : 28) }, lightWidth: high ? 9 : 18, nominal: high ? 60 : 120, kind: 'ashigaru' });
    if (high) F.honjinGuns = makeButai(rt, { ...honjinTroops, name: '信長の本陣の鉄砲衆',
      at: { x: HONJIN.x + 4, z: HONJIN.z + 30.25 }, lightWidth: 4.5, nominal: 30, kind: 'gun' });
    if (high) F.honjinBows = makeButai(rt, { ...honjinTroops, name: '信長の本陣の弓衆',
      at: { x: HONJIN.x + 4, z: HONJIN.z + 34.75 }, lightWidth: 4.5, nominal: 30, kind: 'bow' });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 5));
    okSiegeStores(rt);
    F.ravagedFields = okRavagedFields(rt);
    const OB = { team: 0, faction: 'oda', armor: ODA.armor, lace: ODA.lace, real: 0, maxReal: 0 };
    F.siege = {
      north: makeButai(rt, { ...OB, name: high ? `北の囲み（${NORTH_GENERALS}）` : '北の囲み（坂井政尚・蜂屋頼隆）', kind: 'ashigaru', nominal: 520, lightDepth: 18, at: SIEGE.north, facing: 0, flag: 'oda' }),
      east: makeButai(rt, { ...OB, name: high ? `東の囲み（${EAST_GENERALS}）` : '東の囲み（柴田勝家・森可成）', kind: 'ashigaru', nominal: 360, lightWidth: 24, lightDepth: 16, at: SIEGE.east, facing: -Math.PI / 2, flag: 'eiraku' }),
      west: makeButai(rt, { ...OB, name: high ? `西の囲み（${WEST_GENERALS}）` : '西の囲み（木下藤吉郎・佐久間信盛）', kind: 'bow', nominal: 330, lightDepth: 20, at: SIEGE.west, facing: Math.PI / 2, flag: 'oda' }),
      south: makeButai(rt, { ...OB, name: high ? `南の囲み（${SOUTH_GENERALS}）` : '搦手の封鎖（丹羽・池田・稲葉・滝川）', kind: 'ashigaru', nominal: 440, lightWidth: 38, lightDepth: 24, at: SIEGE.south, facing: Math.PI, flag: 'oda' }),
    };
    F.siegeList = Object.values(F.siege); F.kbList = Object.values(F.kb);
    for (const b of F.siegeList) { b.order({ id: 'hold' }); b._to = null; b.light.army.team = 0; }
    for (const b of F.kbList) { b.light.army.team = 1; b.light.army.noWake = true; b.light.army.keepNear = true; }
    F.gateDef.light.army.team = 1;
    F.gateDef.light.army.noWake = true; F.gateDef.light.army.keepNear = true;
    // 将も護衛も初めからいる兵の内数。四方の備えの後ろに徒歩で置く。
    // 巻二の西の囲みに氏家卜全を補う。高では元の六人を三将と各一人の護衛に分ける。
    // 方角は史料、横並びの順と六人の配分は推定。実兵・遠景を合わせた人数は保つ。
    // 高では南の山の滝川・津田・蒲生右兵衛太輔を示す。夜攻めの三手には加えない。
    // 既存の六人を三将と各一人の護衛へ分ける。位置・配分・具足は推定。
    // 蒲生は巻二の呼称を用い、南陣に留める。斬り合いの兵と控えの人数は保つ。
    // https://ja.wikisource.org/wiki/信長公記/我自刊我書 （巻二・阿坂の城退散之事）
    // 北は巻二の呼称「磯野丹波」を使い、員昌固有の顔・浅井の家紋を流用しない。
    // 具足は織田の共用の推定装備。東の佐々内蔵介は佐々成政として示す。
    // 高だけ各方面の既存の六人を三将と各一人の護衛に分け、兵数・兵列の幅を保つ。
    // 個々の立ち位置と具足は推定。生成時だけ既存の兵と装備を使い、更新処理は増やさない。
    F.officers = [];
    for (const [key, names] of [['north', high ? ['坂井政尚', '蜂屋頼隆', '磯野丹波'] : ['坂井政尚', '蜂屋頼隆']], ['east', high ? ['柴田勝家', '森可成', '佐々成政'] : ['柴田勝家', '森可成']], ['west', high ? ['木下藤吉郎', '氏家卜全', '佐久間信盛'] : ['木下藤吉郎', '佐久間信盛']], ...(high ? [['south', ['滝川一益', '津田掃部', '蒲生右兵衛太輔']]] : [])]) {
      const b = F.siege[key], sx = Math.cos(b.facing), sz = -Math.sin(b.facing);
      const headcount = names.length === 3 ? 2 : 3;
      for (let i = 0; i < names.length; i++) {
        const offset = -6 + 12 * i / (names.length - 1);
        const x = b.pos.x - Math.sin(b.facing) * 12 + sx * offset;
        const z = b.pos.z - Math.cos(b.facing) * 12 + sz * offset;
        const pts = b.light.take(x, z, headcount, 1e9, null, b._canSpawn);
        if (pts.length !== headcount) { for (const q of pts) b.light.give(q.i); continue; }
        b.nominal -= headcount;
        const troops = [{ type: 'busho', n: 1, o: { name: names[i], x, z, horse: false, invuln: true } },
          { type: 'samurai', n: 1, o: { x: x - sx * 2, z: z - sz * 2 } }];
        if (headcount === 3) troops.push({ type: 'samurai', n: 1, o: { x: x + sx * 2, z: z + sz * 2 } });
        const g = allyGroup(rt, { fixed: true, name: names[i] + 'の旗本', anchor: { x, z }, facing: b.facing, width: 4, formation: 'yari', aggro: 8, noRout: false },
          okDress(troops, ODA));
        // 巻二の北の布陣にある簗田弥次右衛門・中条将監も、既存の侍で示す。
        // 史料の呼称を用いる。六人の内訳と隣り合う将の位置は推定で、
        // 高だけ名を補い、兵種・能力・具足・人数・坂の三手の密度は保つ。
        // https://ja.wikisource.org/wiki/信長公記 （巻二・阿坂の城退散之事）
        if (high && key === 'north') {
          const officer = i === 0 ? '斎藤新五' : i === 1 ? '簗田弥次右衛門' : '中条将監';
          const guard = g.units.find(u => u.type === 'samurai');
          if (guard) {
            guard.name = officer;
            g.name = names[i] + '・' + officer + 'の北の備え';
          }
        }
        // 巻二「阿坂の城退散之事」は東に長谷川与次・不破河内・佐々隼人、
        // 西に伊賀伊賀守・飯沼勘半・塚本小大膳を置く。
        // 高だけ既存の護衛の侍で示す。史料の呼称を用い、細かな位置は推定。
        // 各方面の六人・兵種・能力・具足を保ち、生成時の名付けだけで補う。
        // https://ja.wikisource.org/wiki/信長公記 （巻二・阿坂の城退散之事）
        if (high && (key === 'east' || key === 'west')) {
          const officer = key === 'east'
            ? (i === 0 ? '長谷川与次' : i === 1 ? '不破河内' : '佐々隼人')
            : (i === 0 ? '飯沼勘半' : i === 1 ? '伊賀伊賀守' : '塚本小大膳');
          const guard = g.units.find(u => u.type === 'samurai');
          if (guard) {
            guard.name = officer;
            g.name = names[i] + '・' + officer + (key === 'east' ? 'の東の備え' : 'の西の備え');
          }
        }
        // 巻二は織田上野守・和田新介・中島豊後も南の山に置く。
        // 高だけ既存の侍で示す。隣接関係・具足は推定で、兵種・能力・
        // 人数・立ち位置を保つ。南陣に留め、夜攻めの三手には加えない。
        // https://ja.wikisource.org/wiki/信長公記 （巻二・阿坂の城退散之事）
        if (high && key === 'south') {
          const officer = i === 0 ? '織田上野守' : i === 1 ? '和田新介' : '中島豊後';
          const guard = g.units.find(u => u.type === 'samurai');
          if (guard) {
            guard.name = officer;
            g.name = names[i] + '・' + officer + 'の南の備え';
          }
        }
        if (key === 'south') { g.historicalOrders = true; g.noPursue = true; g.order = 'hold'; }
        F.officers.push(g);
      }
    }
    F.nearButai = [...F.siegeList, ...F.kbList, F.gateReserve, F.honjinReserve];
    if (F.honjinGuns) F.nearButai.push(F.honjinGuns);
    if (F.honjinBows) F.nearButai.push(F.honjinBows);
    for (const b of F.nearButai) {
      b.noSwitch = true; b.light.army.noWake = true; b.light.army.keepNear = false;
      const canStand = b._canSpawn;
      b._canSpawn = (x, z) => canStand(x, z) && Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) < 24;
    }
    for (const [key, s] of Object.entries(SIEGE)) {
      // 東西の手は横を向くため、兵列の幅が南北に延びる。
      // 四方とも同じ南六歩・十二歩では、東西の旗と火が兵列に埋まる。
      // 高だけ南の列端から四歩・八歩離す。東の使番道と川、西の谷側へは出さない。
      // 四方の布陣は巻二によるが、旗と陣の火の細かな位置は推定復元。
      const edge = high && (key === 'east' || key === 'west')
        ? (F.siege[key].lightWidth ?? 46) / 2 : null;
      const flagZ = s.z + (edge === null ? 6 : edge + 4);
      const fireZ = s.z + (edge === null ? 12 : edge + 8);
      rt.scene.add(nobori(W, s.x - 6, flagZ, 'oda', 4), nobori(W, s.x + 6, flagZ, 'eiraku', 4));
      rt.scene.add(campfire(W, s.x, fireZ)); W.addFire(s.x, fireZ);
    }
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 6, 'oda'], [CAMP.x + 8, CAMP.z + 6, 'eiraku'], [-30, 36, 'oda'], [30, 36, 'inaba']]) rt.scene.add(nobori(W, x, z, k, 4));
    for (const [x, z] of [[-16, 62], [20, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    // 『信長公記』の二重三重の鹿垣。四方の二重に加え、高では北大手を三重にする。
    // https://ja.wikisource.org/wiki/信長公記 （巻二・大河内国司退城の事）
    // 西は西ノ丸の中ではなく、谷の外の寄せ手側へ置く。柵の位置・間隔は推定復元。
    const siegeFenceBatch = makeSimpleBatch();
    // 高の北二列は下で道心に合わせて一続きに作る。短い旧柵を重ねない。
    const siegeFences = [...(high ? [] : [[-22, -184, -6, -184], [6, -184, 22, -184],
      [-22, -180, -6, -180], [6, -180, 22, -180]]),
      [80, -114, 80, -102], [80, -90, 80, -78],
      [84, -114, 84, -102], [84, -90, 84, -78],
      [-190, -130, -190, -120], [-190, -108, -190, -96],
      [-186, -130, -186, -120], [-186, -108, -186, -96],
      [18, 18, 28, 18], [40, 18, 50, 18], [18, 21, 28, 21], [40, 21, 50, 21]];
    // 北の備えより城側、堀切の手前。大手道の折れに合わせて口を西へずらす。
    // 道の折れに沿って通れる口を残し、北の手は既存の道で誘いと帰陣ができる。
    // 南の乱戦・退路・封鎖の口は保ち、形と材質は同じ束へまとめる。
    if (high) {
      // 短い柵が陣の正面だけで終わると、両脇が開けて通路封鎖に見えない。
      // 北と西の二重柵を各端八歩だけ延ばす。口・大手道・西の旗本の位置は保つ。
      // 延長の長さは推定。南の斬り合いと東の川沿いの使番道には掛けない。
      for (const seg of siegeFences) {
        if (seg[1] === seg[3] && seg[1] < -170) {
          if (seg[0] === -22) seg[0] = -30;
          if (seg[2] === 22) seg[2] = 30;
        } else if (seg[0] === seg[2] && seg[0] < -180) {
          if (seg[1] === -130) seg[1] = -138;
          if (seg[3] === -96) seg[3] = -88;
        }
      }
      // 東の二重柵も、二ノ丸の北端から御納戸の南まで囲む。
      // 四方の通路封鎖は史料によるが、この線と長さは推定復元。
      // 中央の十二歩の口と東の兵列、川沿い（x=104）の使番道は保つ。
      // 馬場の北までの直線は保ち、その先は曲輪の外へ折って南端まで囲む。
      // 短く継いで横木を斜面へ沿わせる。同じ束に入れ、毎コマの処理は増やさない。
      for (const x of [80, 84]) {
        for (let z = -154; z < -114; z += 8) siegeFences.push([x, z, x, z + 8]);
        for (let z = -78; z < -66; z += 6) siegeFences.push([x, z, x, z + 6]);
        // 馬場の東側が開いていた。城の柵（東端 x=80）と区別し、
        // 囲みの二列を八歩外へ折る。線・間隔・長さは推定復元。
        // 川沿いの使番道（x=104）と南の乱戦・帰陣の道には掛けない。
        siegeFences.push([x, -66, x + 8, -66]);
        for (let z = -66; z < -26; z += 8) siegeFences.push([x + 8, z, x + 8, z + 8]);
      }
      // 西ノ丸は南北約九十五歩あるが、西の二重柵は中央の五十歩だけだった。
      // 三重県の解説にある四方の通路封鎖に合わせ、谷の外で曲輪の両端まで囲む。
      // 線と長さは推定。中央の十二歩の口・西の旗本・南の退路は保つ。
      // 七歩ずつ地面へ沿わせ、既存の柵と枝の束で描く。更新処理は増やさない。
      // https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
      for (const x of [-190, -186]) {
        for (let z = -166; z < -138; z += 7) siegeFences.push([x, z, x, z + 7]);
        for (let z = -88; z < -60; z += 7) siegeFences.push([x, z, x, z + 7]);
      }
      // 北は幅六十歩の柵だけで、東西の囲みまで大きく開いていた。
      // 四方の往来を断ったという三重県の解説に合わせ、二列を両側の鹿垣へ継ぐ。
      // 線と角の位置は推定復元。北の堀切より外で、大手道の口と使番道を保つ。
      // 八歩以下に分けて斜面へ沿わせ、既存の形・材質の束へ生成時だけ加える。
      const joinFence = (ax, az, bx, bz) => {
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 8);
        for (let i = 0; i < n; i++) siegeFences.push([
          ax + (bx - ax) * i / n, az + (bz - az) * i / n,
          ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n,
        ]);
      };
      // 北二列の口がともに x=0 に固定され、大手道の折れとずれていた。
      // ROAD_OTE は z=-184 で x=2.4、z=-180 で x=-0.8 を通る。
      // 各道心から五歩ずつ空け、既存の内側の口（z=-176）へ折れて通せる。
      // 道幅二・八歩と道肩を確保し、口の外を二重の鹿垣で閉じる。
      // 柵線・口幅は推定復元。北の備え・大手への誘い・南の斬り合いは保つ。
      for (const [west, east, z, roadX] of [[-190, 80, -184, 2.4], [-186, 84, -180, -0.8]]) {
        joinFence(west, z, roadX - 5, z);
        joinFence(roadX + 5, z, east, z);
        joinFence(west, z, west, -166);
        joinFence(east, z, east, -154);
      }
      // 東の囲みは馬場の南で止まり、南の封鎖口との間が開いていた。
      // 巻二の四方の鹿垣に合わせ、二列を南の柵の東端へ折り返す推定復元。
      // 南東の林の西縁を通し、川沿いの使番道・三手の坂道・封鎖口は空ける。
      // 短い区間で地面へ沿わせ、既存の柵と枝の束を共有する。
      for (const [east, z, corner, south] of [[88, -8, 50, 18], [92, -4, 54, 21]]) {
        joinFence(east, -26, east, z);
        joinFence(east, z, corner, z);
        joinFence(corner, z, corner, south);
        if (corner !== 50) joinFence(corner, south, 50, south);
      }
      // 西の囲みは西ノ丸の南端で止まり、南西の谷の外が開いていた。
      // 三重県の解説にある四方の通路封鎖に合わせ、二列を南へ折り返す。
      // 線・角・長さは推定。三手の攻め道の西縁（x=-38）で止め、
      // 搦手の坂・退路・南の封鎖口・後方の民の里道には掛けない。
      // 既存の短い柵と枝の束に加え、生成後の更新処理は増やさない。
      for (const [west, corner, south] of [[-190, -110, 18], [-186, -106, 21]]) {
        joinFence(west, -60, corner, south);
        joinFence(corner, south, -38, south);
      }
      // 西の鹿垣と南の封鎖の間が五十六歩も開き、道以外からも往来できる形だった。
      // 巻二の通路封鎖に合わせて二列を継ぎ、九十九折りの道の所だけ口を残す。
      // 線・口幅は推定復元。z=18 の道は x≒-22、z=21 は x≒-19。
      // 道肩を含む二十四歩を空け、三手・退路支援・帰陣・使番の道順は保つ。
      // 既存の柵と枝の束で生成時だけ描き、兵数・斬り合いの場には触れない。
      // https://ja.wikisource.org/wiki/信長公記/我自刊我書 （巻二・阿坂の城退散之事）
      for (const [z, left, right] of [[18, -34, -10], [21, -32, -8]]) {
        joinFence(-38, z, left, z);
        joinFence(right, z, 18, z);
      }
      siegeFences.push([-30, -176, -10, -176], [2, -176, 30, -176]);
    }
    for (const seg of siegeFences) {
      palisade(W, seg, { h: 1.8, solid: true, mound: false, noBrace: true, batch: siegeFenceBatch });
    }
    finalizeSimpleBatch(rt, siegeFenceBatch);
    okShishigaki(rt, siegeFences);

    // ---- 八月二十八日の布陣 → 囲みの紹介 → 九月八日の夜（自分の戦） ----
    // day は場面の進行用。旧暦の日付や実際の経過日数として表示しない。
    rt.setPhase('brief');
    rt.obj('main', '竹束の陰で太鼓を待て', 'main', true);
    rt.objProgress('main', '待つと夜攻めが始まる');
    rt.banner('大軍を止める山城', high
      ? '囲み始めの総勢は織田約五万、北畠七千〜八千とも。残る人数は分からない'
      : '総勢は織田五万、北畠七千〜八千とも。兵数は推定');
    rt.say('組頭', '丹羽様の手じゃ。ここで夜攻めの下知を待て', 4);
    // 地図の説明は初めの台詞に一度だけ添え、戦の半ばへ持ち越さない。
    if (S.hints) firstHelp('map', (text) => { rt.say('', text, 6.5); return true; });
    rt.after(1, () => { if (!rt.over && !rt.flags.ending && rt.phase === 'brief' && !rt.player.lock && !rt.game.noLock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 2.2 }; });
    rt.marker('mkHon', HON_C, '本丸', { h: 8 });
    rt.after(5, () => { rt.unmark('mkHon'); this.oteDay(rt); });
    rt.after(10, () => this.nightDay(rt));
    buildBattleJin(rt);
    okReflect(rt);
  },

  // 囲みの紹介。日付の分からない大手攻めを作らず、四方の封鎖を見せる。
  oteDay(rt) {
    const F = rt.flags;
    if (F.day >= 7 || F.step >= 1 || F.ending || rt.over) return;
    F.day = 7;
    rt.bark('北は大手、東は川。西と南の谷にも囲みの手');
    rt.say(okSpeaker(rt), '柵で四方を囲め。兵糧を城へ入れるな', 3);
    rt.after(1, () => { if (!rt.over && !F.ending && rt.phase === 'brief' && !rt.player.lock && !rt.game.noLock) rt.player.cine = { x: OTE_C.x, z: OTE_C.z, t: 2 }; });
  },
  // 九月八日の夜：雨の搦手の夜攻めへ
  nightDay(rt) {
    const F = rt.flags;
    if (F.day >= 12 || F.ending || rt.over) return;
    F.day = 12; F.nightReadyAt = rt.t + NIGHT_WAIT; rt.unmark('mkHon'); rt.player.cine = null;
    const duskLook = rt.world.currentLook(), fromDusk = rt.world.duskAmount();
    // 『信長公記』は人数を出すと雨が降ったと記す。下知の夕暮れから降らせない。
    rt.world.setTime('night');
    // 下知を早送りした時も夕暮れから移ろう。光の入れ物は切替時だけ作る。
    rt.world.fade = { from: duskLook, to: rt.world.lookOf('night'), fromNight: 0, fromDusk, t: 0, dur: NIGHT_WAIT, env: 0 };
    rt.world.applyLook(duskLook);
    rt.bark('九月八日。日が暮れる。三手で西搦手へ');
    rt.obj('main', '竹束のそばで、日が暮れるのを待て', 'main', true);
    F.waitSeconds = NIGHT_WAIT;
    rt.objProgress('main', `あと${NIGHT_WAIT}秒で法螺とかかり太鼓。竹束の陰で待て`);
    rt.say(okSpeaker(rt), '日が落ちてから三手でかかる。法螺とかかり太鼓までは、竹束の陰で待て', 4);
    rt.marker('niwa', F.niwaU.pos, '丹羽長秀', {});
    // 夜への移ろいが終わってから太鼓を鳴らす。夕空のまま夜攻めを始めない。
    rt.after(NIGHT_WAIT, () => this.assault(rt));
  },
  // 囲みの部隊を動かす（軽い作り）。_to は北畠の頭が「どこへ寄せられたか」を見る印
  siegeMove(rt, k, to) {
    const b = rt.flags.siege && rt.flags.siege[k];
    if (!b || b.aliveNominal() <= 0) return;
    moveL(b, to);
    b._to = Math.hypot(to.x - SIEGE[k].x, to.z - SIEGE[k].z) < 4 ? null : { x: to.x, z: to.z };
  },
  kbMove(rt, k, to) {
    const b = rt.flags.kb[k];
    if (!b || b.aliveNominal() <= 0) return;
    // 西への増援も本丸の西木戸から谷の折れ道へ。谷や柵を一直線に横切らない。
    const way = to.x < -100 ? [[b.pos.x, b.pos.z], [48, -70], [48, -88], [47, -93],
      [NI_C.x, NI_C.z], [30, -117], [24, -111], [18, -111], [HON_C.x, HON_C.z],
      ...ROAD_NISHI.slice(0, -1).reverse(), [to.x, to.z]] : null;
    moveL(b, to, way);
  },
  // 北畠の頭（docs 55）：大手を厚く守る／敵が東へ→二ノ丸へ増援／西ノ丸が危ない→予備を動かす／
  // 本丸が危ない→予備すべて／包囲が薄い→搦手から打って出る（三十日目の出来事。siegeDays が見る）
  kbThink(rt) {
    const F = rt.flags, S = F.siege, K = F.kb;
    const thr = (pt, r = 40) => Object.values(S).reduce((s, b) => s + (b._to && Math.hypot(b._to.x - pt.x, b._to.z - pt.z) < r ? b.aliveNominal() : 0), 0);
    const hon = thr(HON_C, 36), west = thr(NEAR.nishi), east = thr(NEAR.ni), ote = thr(NEAR.ote);
    const say = () => {}; // 城内の下知は、寄せ手の足軽には聞こえない。
    if (hon > 0 && F.kbResAt !== 'hon') {
      F.kbResAt = 'hon';
      this.kbMove(rt, 'res', POST.hon); this.kbMove(rt, 'onando', { x: POST.hon.x + 6, z: POST.hon.z });
      say('北畠勢：本丸が危うい。予備をすべて本丸へ');
    } else if (west > K.nishi.aliveNominal() * 1.2 && !F.kbWest && F.kbResAt !== 'hon') {
      F.kbWest = true;
      // 馬場の予備がまだ居れば予備を、もう二ノ丸へ回していれば御納戸の番を西ノ丸へ
      if (F.kbResAt === 'baba') { F.kbResAt = 'nishi'; this.kbMove(rt, 'res', { x: POST.nishi.x, z: POST.nishi.z + 12 }); say('北畠勢：西の丸が危うい。馬場の予備を西の丸へ'); }
      else { this.kbMove(rt, 'onando', { x: POST.nishi.x, z: POST.nishi.z + 12 }); say('北畠勢：西の丸が危うい。御納戸の番まで西の丸へ回す'); }
    } else if (east > 0 && F.kbResAt === 'baba') {
      F.kbResAt = 'ni';
      this.kbMove(rt, 'res', { x: POST.ni.x, z: POST.ni.z + 8 });
      say('北畠勢：東から寄せた。馬場の予備を二の丸へ');
    } else if (ote > K.ote.aliveNominal() * 1.5 && F.kbResAt !== 'hon' && !F.kbOteHelp) {
      F.kbOteHelp = true;
      this.kbMove(rt, 'hon', { x: POST.ote.x, z: POST.ote.z + 8 });
      say('北畠勢：大手へ本丸の旗本を回す');
    }
  },
  // 寄せた囲みの部隊と、近い北畠の部隊を数で削り合わせる（軽い作り同士）
  siegeClash(rt, dt) {
    const F = rt.flags;
    for (const a of F.siegeList) {
      if (!a._to || a.aliveNominal() <= 0) continue;
      for (const d of F.kbList) {
        const dp = d.pos;
        if (d.aliveNominal() > 0 && Math.hypot(a.pos.x - dp.x, a.pos.z - dp.z) < 46) lightClash(a, d, dt, 0.12);
      }
    }
  },

  // ① 搦手の木戸へ（軍議で選んだ道。無ければ搦手へ真っ直ぐ）
  assault(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('niwa');
    const lure = F.strategy === 'ote_lure';
    const go = () => {
      if (rt.over || F.ending || F.step !== 1) return;
      // 北の鬨が届き終わるまでは、搦手の法螺を重ねない。
      if (lure && rt.t < (F.signalQuietUntil || 0)) {
        rt.after(F.signalQuietUntil - rt.t + 0.1, go);
        return;
      }
      F.assaultSignalT = rt.t;
      // 誘いの手を待つ間には鳴らさず、法螺を聞き終えてから三手を動かす。
      const cue = okSignal(rt, 'kakari', okCommandAt(rt, F.niwa, FRONT), 0.8);
      // 作り置きの合成法螺は約三秒。届いた音が吹き終わってから鬨を返す。
      // 退きの下知へ進んでいたら、突撃の声を遅れて重ねない。
      rt.after(3.3 + F.signalDelay, () => {
        if (rt.over || F.ending || F.step !== 1 || F.signalCue !== cue) return;
        okLineReply(rt, 'toki', 0.55);
      });
      // 鬨の合成音は三・二秒。返し終えてから、早打ちと三手の前進をそろえる。
      rt.after(6.7 + F.signalDelay, () => {
        if (rt.over || F.ending || F.step !== 1 || F.signalCue !== cue) return;
        F.assaultMoving = true;
        // 三手の進発に合わせて雨を降らせ、合図待ちの間は降らせない。
        rt.world.setRainTarget(0.9);
        rt.unmark('tabaFront');
        const R = F.ram;
        R.order = 'path'; R.path = [...ROAD_KARAMETE.slice(4, 6), [-4, GATE.z + 12]]; R.pathIdx = 0; R.formation = 'column'; R.colW = 2; R.aggro = 2; R.assault = null; R.onArrive = (q) => { q.order = 'hold'; };
        for (const [g, x] of [[F.niwa, -8], [F.ikeda, -24], [F.inaba, 8]]) { g.order = 'path'; g.path = [...ROAD_KARAMETE.slice(g === F.niwa ? 5 : g === F.ikeda ? 4 : 3, 6), [x, GATE.z + 16]]; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.aggro = 3; g.speed = 2.2; g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.aggro = 12; }; }
        if (!gone(F.taki)) { F.taki.order = 'path'; F.taki.path = [...ROAD_KARAMETE.slice(4, 6), [-12, FRONT.z + 14]]; F.taki.pathIdx = 0; F.taki.formation = 'column'; F.taki.colW = 2; F.taki.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -12, z: FRONT.z + 14 }; }; }
      });
      rt.banner('夜攻め', '雨の闇の中を、南の搦手の木戸へ');
      rt.say(okSpeaker(rt), '法螺に鬨で応じよ！　かかり太鼓の早打ちじゃ。竹束の陰から、三手で搦手へ進め！', okSignalListen(rt));
      rt.obj('main', HI(rt) ? '法螺・かかり太鼓：一手を率い、竹束と坂の旗へ進め' : '法螺・かかり太鼓：竹束の陰から、坂の旗へ進め', 'main', true);
      rt.objProgress('main', '法螺が終わったら鬨を返す。太鼓の早打ちに合わせて進め');
      rt.marker('gate', () => okAdvanceGoal(rt), '丹羽の竹束の後ろへ', { h: 2.5, guidePriority: 100, guideAlways: true, alwaysDistance: true });
      rt.after(15 + F.signalDelay, () => {
        if (!rt.over && F.step === 1 && !F.ending && F.signalCue === cue)
          rt.say(okSpeaker(rt), '弓が来る！　竹束の陰を離れるな。谷へ下りるでないぞ', 4);
      });
      rt.after(20 + F.signalDelay, () => {
        if (rt.over || F.step !== 1 || F.ending || F.signalCue !== cue) return;
        if (!okNearVoice(rt, F.ikeda.units[0], '左はわしの手が受け持つ。丹羽の旗を離れるな！'))
          okNearVoice(rt, F.inaba.units[0], '槍先をそろえよ！　狭い坂で組を割るな！');
      });
    };
    if (lure) {
      // 北大手は合成の陣太鼓と、それに応じる鬨。搦手の進めの法螺とは分ける。
      const cue = F.signalCue;
      const northAt = { x: 0, z: 0 };
      const northSound = (kind, vol) => {
        const b = F.siege.north;
        if (!b || b.aliveNominal() <= 0) return 0;
        // 行き先や空になった陣ではなく、今歩いている陽動の列から鳴らす。
        const L = b.light;
        northAt.x = L ? L.position.x + L.army.cx : b.pos.x;
        northAt.z = L ? L.position.z + L.army.cz : b.pos.z;
        // 遠音の待ち列と地形の経路で、届く遅れを二重に足さない。
        // 搦手の合図と同じ経路で、丘越しのこもりと風も反映する。
        const c = rt.camera.position, dx = northAt.x - c.x, dz = northAt.z - c.z;
        const d = Math.hypot(dx, dz), yaw = rt.player.yaw;
        const back = d > 0 ? Math.max(0, -(dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d) : 0;
        const pan = rt.panAt(northAt);
        // 陣太鼓の名も渡し、乱戦で音の枠が埋まっていても下知として届ける。
        const delay = farNext(d, back, northAt, c, rt.world, WIND_STATE, kind);
        withPan(pan, () => sfx(kind, vol / (1 + d / 80)));
        // 陽動にも合図を聞く間を設け、普段の掛け声や馬の声を重ねない。
        F.signalQuietUntil = Math.max(F.signalQuietUntil || 0, rt.t + delay + (kind === 'okToki' ? 3.2 : NORTH_DRUM_LISTEN));
        return delay;
      };
      const northDelay = northSound('jindaiko', 0.65);
      // 丘越しに太鼓が届く遅れも待ち、早打ちの余韻へ返しの鬨をかぶせない。
      rt.after(NORTH_DRUM_LISTEN + northDelay, () => {
        if (rt.over || F.ending || F.step !== 1 || F.assaultMoving || F.signalCue !== cue) return;
        northSound('okToki', 0.5);
      });
      // 夜は既に明け暮れの待ちを終えている。陽動中の札も、今待つ合図へ切り替える。
      rt.obj('main', '北大手の太鼓は陽動。竹束の陰で、こちらの法螺とかかり太鼓を待て', 'main', true);
      rt.objProgress('main', '北大手の遠い太鼓と鬨では動くな。搦手の法螺と早打ちで進め');
      rt.say(okSpeaker(rt), '遠い太鼓と鬨は北大手の手じゃ。まだ動くな。竹束のそばで、こちらの法螺とかかり太鼓を待て', 8);
      this.siegeMove(rt, 'north', NEAR.ote);
      rt.after(14, () => {
        if (!rt.over && !F.ending && F.step === 1) this.siegeMove(rt, 'north', SIEGE.north);
      });
      // 大手に気を取られ、搦手の守りが薄くなる（この時点は夜の闇。雨は三手の進発から）。
      F.gateDef.morale = Math.max(40, F.gateDef.morale - 14 * nightAccuracyMult(rt.world));
      rt.after(8, go);
    } else go();
  },

  // ② 城兵の打って出
  pushback(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('push');
    rt.unmark('gate');
    rt.unmark('tabaFront'); rt.unmark('karamete');
    rt.unmark('sakamichi'); F.roadGuideMarked = false;
    F.ram.assault = null; F.ram.order = 'hold';
    rt.banner('夜攻め、敗れる', '鉄砲は役に立たず、城兵が木戸から打って出る');
    rt.obj('main', '城兵の打って出：坂の旗で槍をそろえ、城兵を止めよ', 'main', true);
    rt.marker('gate', FRONT, '城兵を止める坂の旗', { h: 3, guidePriority: 100, guideAlways: true, alwaysDistance: true });
    // 陽動の待ち時間も含む段の時計では、突撃太鼓の途中に城兵が出ることがある。
    // 出撃や斬り合いはそのまま進め、鉦とその下知だけを前の合図の後に届ける。
    F.pushSignalPending = true;
    const stop = () => {
      if (rt.over || F.ending || F.step !== 2) return;
      const wait = (F.signalQuietUntil || 0) - rt.t;
      if (wait > 0) { rt.after(wait + 0.1, stop); return; }
      F.pushSignalPending = false;
      okStopSignal(rt, F.niwa, 0.8);
      rt.obj('main', '止まれの鉦：坂の旗で槍をそろえ、城兵を止めよ', 'main', true);
      const away = Math.hypot(rt.player.u.pos.x - FRONT.x, rt.player.u.pos.z - FRONT.z) >= 22;
      rt.say(okSpeaker(rt), away
        ? '鉦二つは止まれじゃ！　城兵が坂へ出た。組を坂の旗へ寄せ、槍をそろえて退き口を固めよ！'
        : '鉦二つは止まれじゃ！　城兵が出たぞ。坂の旗に槍をそろえよ！', okSignalListen(rt));
    };
    stop();
    // 初めから曲輪で待っていた二組が、木戸を開けて順に坂へ出る。
    F.push = F.sorties.slice(0, 2);
    sendSortie(rt, F.push[0], { x: -6, z: FRONT.z - 5 });
    okPushbackVoice(rt, F.push[0], false);
    rt.after(8, () => {
      if (rt.over || F.ending || F.step !== 2) return;
      const g = F.push[1];
      sendSortie(rt, g, { x: 6, z: FRONT.z - 5 });
      okPushbackVoice(rt, g, true);
    });
  },

  // 攻めを止めて退路を保つ。任務は常に一つ。
  midA(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('tabaFront'); rt.unmark('karamete');
    rt.unmark('sakamichi'); F.roadGuideMarked = false;
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);
    rt.unmark('gate');

    if ((F.push || []).every(sortieBroken)) rt.award((t) => t.side.push('城兵の打って出を受け止めた'), '打って出を受け止めた');
    F.pushDone = true;
    F.chasers = (F.push || []).filter((g) => !sortieBroken(g) && !g._okReturning);
    F.chaseAt = rt.t + 10;
    F.chaseLeft = 24; // 搦手の控えから四小隊まで。囲みの総軍は出さない。
    F.backGroups = [F.ram, F.taki];
    // 竹束の組が先に陣へ下がり、槍の三手は退路に残る。
    if (!gone(F.ram)) {
      F.ram.assault = null; F.ram.order = 'path';
      F.ram.retreatOnly = true; F.ram.focus = null;
      F.ram.formation = 'column'; F.ram.colW = 3; F.ram.spacing = 1.1; F.ram.roadColumn = true;
      F.ram.path = downRoad(F.ram, [12, CAMP.z - 16]);
      F.ram.pathIdx = 0; F.ram.speed = 2.6;
      F.ram.onArrive = (g) => { g.order = 'hold'; g.retreatOnly = false; };
      rt.marker('backColumn', () => F.ram.count && !F.ram.routed ? F.ram.center() : null, '陣へ下がる竹束の組');
    }
    if (!gone(F.taki)) {
      F.taki.order = 'path'; F.taki.formation = 'column'; F.taki.colW = 3; F.taki.spacing = 1.1;
      F.taki.retreatOnly = true; F.taki.focus = null; F.taki.assault = null;
      F.taki.path = downRoad(F.taki, [-12, CAMP.z - 16]); F.taki.pathIdx = 0;
      F.taki.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.anchor = { x: -12, z: CAMP.z - 16 }; };
      rt.marker('backEscort', () => gone(F.taki) ? null : F.taki.center(), '後から退く退路守りの組');
    }
    okStopSignal(rt, F.niwa, 0.8);
    rt.say(okSpeaker(rt), '鉦二つは止まれじゃ！　竹束と滝川殿の手を先に退かせる。坂を固め、追っ手を食い止めよ！', okSignalListen(rt));
    rt.objRemove('main');
    depthStart(rt, okCtx(rt), [okHold({ at: FRONT, dur: 45, limit: 60, r: 18, title: '坂の旗', obj: '止まれの鉦：坂の旗で、先に退く組を守れ', groups: F.push, reward: '坂の退路を保った' })], () => this.retreat(rt));
    okHoldSignal(rt, F.dp.cur, '鉦二つは止まれ。返事を聞き、坂の旗で先に退く組を守れ', 4);
  },

  // ③ 退く（搦手の前を保ちきれなかった時の、史実どおりの筋）
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending) return;
    if (F.dp) F.dp.on = false;
    rt.objRemove('dp'); rt.unmark('dp'); rt.unzone('dp');
    rt.unmark('gate'); rt.unmark('backColumn'); rt.unmark('backEscort');
    F.step = 3; F.stepT = rt.t;
    okHideSpeech(rt);
    rt.setPhase('retreat');
    for (let i = 1; i <= 2; i++) rt.unmark('p' + i);

    const cue = okSignal(rt, 'nobiki', okCommandAt(rt, F.niwa, CAMP_LINE), 0.8);
    // 最後の鉦は七・五秒後に鳴り、一・六秒響く。余韻の後で兵が応じる。
    rt.after(9.4 + F.signalDelay, () => {
      if (rt.over || F.ending || F.step !== 3 || F.signalCue !== cue) return;
      okLineReply(rt, 'soldier_retreat', 0.5);
    });
    rt.banner('退きの下知', '夜攻めは破れた。組を崩さず、南の陣へ');
    rt.say(okSpeaker(rt), F.backHeld ? '低く下がる法螺と、二つ打ちの退き太鼓じゃ！　先の組は抜けた。南の陣へ退くぞ！' : '低く下がる法螺と、二つ打ちの退き太鼓じゃ！　槍を返せ。組を崩さず南の陣へ戻るぞ！', okSignalListen(rt));
    rt.obj('main', HI(rt) ? '低い法螺・退き太鼓：殿を務め、追っ手を防いで南の陣へ' : '低い法螺・退き太鼓：追っ手を防ぎ、南の陣へ退け', 'main', true);
    // 殿の役目も最初の下知に含め、退き太鼓と組の返事の間に別の台詞を挟まない。
    rt.marker('camp', { x: CAMP.x, z: CAMP.z - 6 }, '戻る陣の旗', { h: 4, guidePriority: 100, guideAlways: true });
    rt.marker('backColumn', () => gone(F.niwa) ? null : F.niwa.center(), '陣へ退く丹羽の組');
    rt.zone('camp', CAMP.x, CAMP.z - 6, 8);
    for (const [i, g] of [F.niwa, F.ikeda, F.inaba].entries()) if (!gone(g)) {
      // 半幅二・八メートルの道に三人を収め、後列が長く伸びすぎるのを防ぐ。
      g.order = 'path'; g.formation = 'column'; g.colW = 3; g.spacing = 1.1; g.roadColumn = true;
      g.retreatOnly = true; g.focus = null; g.assault = null;
      g.path = downRoad(g, [(i - 1) * 10, CAMP.z - 16]); g.pathIdx = 0; g.speed = 2.6;
      g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.anchor = { x: (i - 1) * 10, z: CAMP.z - 16 }; q.formation = 'yari'; };
    }
    // 生き残りが先に追い、城内の小勢が間をあけて続く。陣の手前で止めない。
    F.chasers = F.chasers.filter((g) => !sortieBroken(g) && !g._okReturning);
    F.chaseAt = rt.t + 12;
    // 退路守りで使った枠とは別に、まだ城にいる控えを順に寄せる。
    F.chaseLeft = F.gateReserve.lightCount();
    for (const g of F.chasers) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 10;
      g.path = downRoad(g, [CAMP_LINE.x, CAMP_LINE.z - 10]); g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.width = 8; q.aggro = 18; q.seekRange = 28; };
    }
    battleEvent(rt, EVENT_RETREAT, FRONT, F.niwa, 0, true, '夜攻めをやめ、南の陣へ退く');
    rt.after(12 + F.signalDelay, () => {
      if (rt.over || F.ending || F.step !== 3 || F.signalCue !== cue) return;
      rt.say(okSpeaker(rt), HI(rt) ? `${nm(rt)}、殿を務めよ。追っ手を防ぎ、最後の組と道の印で南の陣へ戻れ。谷へ下りるな` :
        '陣の旗を見失うな。谷へ下りるでない。追っ手が来たら槍を返せ', 4);
    });
  },

  // 九月九日以後の兵糧攻め。別の土地の焼き払いは知らせで伝え、封鎖の局地戦は遊びの補い。
  siegeDays(rt) {
    const F = rt.flags;
    if (F.step >= 4 || F.ending) return;
    F.step = 4; F.stepT = rt.t; F.day = 13;
    // 読み残した夜攻めの待機命令を、翌朝の封鎖の札へ重ねない。
    okHideSpeech(rt);
    F.lineGroups = [...F.lineGroups, F.blockGuard];
    // 朝への切替だけでは火縄を解かない。実際に雨が弱まるまで下の判定で待つ。
    rt.setPhase('siege');
    rt.unmark('camp'); rt.unzone('camp'); rt.unmark('ch');
    rt.unmark('sakamichi'); F.roadGuideMarked = false;
    rt.unmark('backColumn');
    for (const q of F.chasers || []) if (!gone(q)) returnSortie(q);
    rt.award((t) => t.side.push('追っ手を防ぎながら陣まで退いた'), '陣まで退いた');
    rt.objRemove('main');
    const nightLook = rt.world.currentLook();
    rt.world.setTime('morning'); rt.world.setRainTarget(0.15);
    if (F.ravagedFields) F.ravagedFields.visible = true;
    // 翌朝への場面転換は、下知を読む間に明るむ。光の入れ物はここで一度だけ作る。
    rt.world.fade = { from: nightLook, to: rt.world.lookOf('morning'), fromNight: 1, fromDusk: 0, t: 0, dur: 16, env: 0 };
    rt.world.applyLook(nightLook);
    // 四方の鹿垣と兵糧の遮断は夜攻め前から。九日を封鎖の開始にはしない。
    rt.banner('夜攻めをやめ、囲みを続ける', '九月九日。四方の封鎖を保ち、兵糧を断つ');
    // 呼び集める柵の番から鳴らし、帰陣した南の陣へ引き返す合図に聞こえないようにする。
    const cue = okSignal(rt, 'atsumare', okCommandAt(rt, F.blockGuard, SOUTH_BLOCK), 0.7);
    // 長い法螺二声を聞き終え、柵の番が下知を復唱する。
    rt.after(6.3 + F.signalDelay, () => {
      if (rt.over || F.ending || F.step !== 4 || F.signalCue !== cue || gone(F.blockGuard)) return;
      okReply(rt, F.blockGuard, 'fukusho', 0.45);
    });
    rt.say(okSpeaker(rt), '長い法螺二声は集まれじゃ。南の柵の旗で番の組と槍をそろえ、兵糧を断て', okSignalListen(rt));
    // 集合の二声と復唱の間は、別の台詞で下知を消さない。
    rt.after(ASSEMBLY_LISTEN + F.signalDelay, () => {
      if (F.ending || rt.over || F.step !== 4 || F.signalCue !== cue) return;
      rt.say('組頭', '昨夜の槍仲間が戻らん……。囲みはまだ続くで、気を抜くな', 4);
    });
    rt.after(13 + F.signalDelay, () => {
      if (F.ending || rt.over || F.step !== 4) return;
      sendOrder(rt, F.jinOdaCamp.general || HONJIN, rt.player.u, { id: 'okawachiNews', apply: () => {
        if (!F.ending && F.step === 4) rt.say('使番', '滝川左近殿へ、多芸の御殿を焼き、作物を薙げとの下知にござる', 5);
      } }, { team: 0, faction: 'oda', name: '本陣の知らせ' });
    });
    // 多芸谷は別の土地。城のすぐ裏へ火を置かず、届いた下知で伝える。
    F.blockers = [F.sorties[2]];
    depthStart(rt, okCtx(rt), [okHold({ at: SOUTH_BLOCK, dur: 75, r: 18,
      title: '南の柵の旗', obj: '集まれの法螺：南の柵の旗で、番の組と道を守れ',
      groups: F.blockers, sortie: true, reward: '南の道を保ち、城へ兵糧を通さなかった',
    })], () => { if (!F.ending) this.peace(rt); });
    okHoldSignal(rt, F.dp.cur, '長い法螺二声は集まれ。南の柵の旗で、番の組と槍をそろえよ', ASSEMBLY_LISTEN);
    rt.after(30, () => {
      if (F.ending || rt.over || F.step !== 4 || rt.phase !== 'siege') return;
      rt.say('組頭', 'そこの槍、間を詰めよ。柵の口を抜かれるで', 4);
    });
    rt.after(62, () => { if (F.ending || rt.over || F.step !== 4 || rt.phase !== 'siege') return; rt.say(okSpeaker(rt), '向こうも兵糧が欲しかろう。柵を離れるな。ひと荷も通すでない', 4); });
  },

  // 和睦（docs 57）：本丸で北畠を討って終わり、にしない。長い囲み＋圧力＋双方の損＋出来事 → 和睦
  peace(rt) {
    const F = rt.flags;
    if (F.ending || !F.blockHeld || !rt.player.u.alive) return;
    // 「五十日ほど」の籠城伝承を、八月二十八日から十月四日までの厳密な日数にしない。
    F.ending = true;
    rt.setPhase('end');
    for (const k in F.siege) this.siegeMove(rt, k, SIEGE[k]);
    for (const k in F.kb) F.kb[k].order({ id: 'hold' });
    for (const g of rt.army.groups) { g.calm = true; for (const u of g.units) { u.target = null; u.noTarget = true; } }
    rt.objDone('dp');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '南の道を保ち、兵糧を止めて和睦まで囲みに加わった', pts: 18 }; }, '任務達成・和睦');
    // 九月九日の局地戦が、その日のうちに和睦を決めたように見せない。
    // 日を送る札を先に読み、十月四日の知らせに日付・木戸・台詞をそろえる。
    rt.banner('日が巡り、囲みは続く', '九月から十月へ。城には逃れてきた者もおり、飢えが広がった');
    rt.say('組頭', '今日の持ち場は守った。囲みはまだ続くぞ', 4);
    rt.after(5, () => {
      if (rt.ended || F.failed) return;
      F.peaceAnnounced = true;
      rt.banner('十月四日　和睦', '北畠は茶筅丸へ家督を譲ると約し、城を渡す');
      F.gates.karamete._openNow(false);
      // 和睦の知らせを受ける。閉じた木戸の外へ使者を突然作らない。
      // 下知を受ける番の組の位置で吹く。遠い帰陣先から別の集合を呼ばない。
      const cue = okSignal(rt, 'atsumare', okCommandAt(rt, F.blockGuard, SOUTH_BLOCK), 0.7);
      // 二声の法螺を聞き終えた番の組が応じる。和睦では勝鬨や突撃の声にしない。
      rt.after(6.3 + F.signalDelay, () => {
        if (rt.ended || F.failed || !F.ending || F.signalCue !== cue || gone(F.blockGuard)) return;
        okReply(rt, F.blockGuard, 'fukusho', 0.4);
      });
      rt.obj('main', '集まれの法螺：和睦の下知を聞き、槍を収めよ', 'main', true);
      const listening = ASSEMBLY_LISTEN + F.signalDelay;
      // 実際の音道の遅れまで終幕を保ち、返事や説明を途中で切らない。
      rt.endT = Math.max(rt.endT, listening + 8);
      rt.say(okSpeaker(rt), '法螺二声、集まれじゃ。和睦が成った。槍を収めよ。城は滝川殿と津田殿へ渡す', listening);
      // 法螺と復唱が届くまでは任務札を残し、退城の説明へ移らない。
      rt.after(listening, () => {
        if (rt.ended || F.failed || F.signalCue !== cue) return;
        rt.objDone('main');
        rt.say('', '茶筅丸（のちの信雄）への家督譲渡を約し、北畠父子は退城した', 4);
      });
      rt.after(listening + 4.5, () => rt.say('', '翌年、織田勢は越前へ進む。金ヶ崎では追われる側となった', 3));
    });
    rt.player.u.invuln = true;
    // 日送り五秒と、法螺・復唱・退城の説明を聞いてから閉じる。
    rt.finish({ scriptedEnd: true }, 5 + ASSEMBLY_LISTEN + 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 共通の低木の一束は設営の後に届く。最初のコマと三秒後にもう一度だけ秋の色へ寄せる（同じ色を置くだけなので重ねても変わらない）。
    if ((F.autumnBushes ?? 0) < (rt.t > 3 ? 2 : 1)) { F.autumnBushes = (F.autumnBushes ?? 0) + 1; okAutumnBushes(rt.world); }
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 最後の一人が倒れた場合も、軽い兵へ戻して生き返らせない。
    for (const b of F.nearButai) if (b.real && !b.real.count && b._prevRealAlive) { b.lost = Math.min(b.nominal, b.lost + b._prevRealAlive); b._prevRealAlive = 0; }
    butaiTick(rt, dt);
    if (!F.ending && !rt.over) nearButaiTick(rt);
    if (F.keep) F.keep.tick();
    if (F.keep?.reached) { F.tomofusa.calm = false; for (const u of F.tomofusa.units) u.noTarget = false; }
    // 出撃・帰城する兵が木戸の近くにいる間は開け、通り終えてから閉める。
    let passing = false;
    for (const g of F.sorties) if (g._sortieSent) {
      // 通過中に槍を返しても木戸を閉めない。倒れた兵は通行中に数えない。
      for (const u of g.units) if (u.alive && !u.dying && !u.woundOut && !u.gone && Math.abs(u.pos.x) < 9 && Math.abs(u.pos.z - GATE.z) < 18) { passing = true; break; }
    }
    if (passing && !F.gates.karamete.opened) F.gates.karamete._openNow(false);
    else if (!passing && F.gates.karamete.opened && !F.ending) F.gates.karamete.close();
    // 闇で狙いは鈍る。弓の威力を特別に弱めず、昼になれば明るさの補正を戻す。
    { const g = F.gateDef && F.gateDef.real; if (g && !g._rain) { g._rain = true; g._okBaseDmg = g.dmgMult || 1; }
      if (g) g.dmgMult = g._okBaseDmg * nightAccuracyMult(rt.world); }
    if (F.ending || rt.over) return;
    // 七分以内に決着。成功は四分以後、最後の和睦十三秒を含める。
    if (rt.t >= 407) {
      const C = F.dp?.cur;
      // 南の柵に着いて守っていたのに、城兵が来ない・時が足りないだけで負けにしない（bot 10/26：封鎖へ寄せる城兵が坂で詰まった）。
      const P = rt.player.u.pos;
      if (F.step === 4 && rt.player.u.alive && (C?.joinedLine || Math.hypot(P.x - SOUTH_BLOCK.x, P.z - SOUTH_BLOCK.z) < 25)) { F.blockHeld = true; this.peace(rt); return; }
      const reason = F.step !== 4 ? '持ち場を保てず、交代の下知が出た' :
        !C?.joinedLine ? '南の柵で番の組と合流できず、交代の下知が出た' :
        C.lineCount < 3 ? '南の番の槍が足りず、交代の下知が出た' :
        !C?.engaged ? '南の柵へ城兵が届かず、交代の下知が出た' :
        C.holdLeft > 0 ? '南の柵を守る時間が足りず、交代の下知が出た' :
        '南の柵への城兵を押し返せず、交代の下知が出た';
      this.lose(rt, reason, true);
      return;
    }
    // 崩れた小勢の残兵を坂に置き去りにしない。生きた城兵が道を通って帰る。
    for (const g of F.sorties) if (g._sortieSent && !g._okReturning && !gone(g) && sortieBroken(g)) returnSortie(g);
    if ((F.kbT = (F.kbT || 0) - dt) <= 0) { F.kbT = 1.5; this.kbThink(rt); }
    this.siegeClash(rt, dt);
    okFootTick(rt);
    // 木戸は出撃と帰城の下知で開閉する。城内の占領で開く共通判定は使わない。
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    // 太鼓待ちの矢除けを押し出させない。寄せ始めてから押す操作を出す。
    tabaInteractTick(rt, { allowPush: F.step === 1 && F.assaultMoving, team: 0 });
    // 雨が弱まったら射撃を解く。近接の威力・待ち時間は書き換えない。
    if ((F.gunT = (F.gunT || 0) - dt) <= 0) {
      F.gunT = 1;
      const canShoot = F.step >= 4 && rt.world.rainLevel <= GUN_RAIN_LIMIT;
      for (const g of F.oda) g.holdFire = !canShoot;
    }
    depthTick(rt, dt);
    if (F.ending || rt.over) return;
    const p = rt.player.u.pos;
    if (F.step === 2.5 || F.step === 3) okChaseTick(rt);
    if (F.step === 0 && F.day === 12) {
      const left = Math.max(0, Math.ceil(F.nightReadyAt - rt.t));
      const covered = okAtWaitCover(rt);
      if (left !== F.waitSeconds || covered !== F.waitCovered) {
        F.waitSeconds = left;
        F.waitCovered = covered;
        rt.objProgress('main', left ? `あと${left}秒で法螺とかかり太鼓。${covered ? '竹束の陰で待て' : '手前の竹束の後ろへ戻れ'}` :
          covered ? '法螺に鬨を返して進め' : '手前の竹束へ戻り、搦手の法螺と早打ちを待て');
      }
    }
    if (F.step === 1 && F.assaultMoving) {
      const d = Math.hypot(p.x - FRONT.x, p.z - FRONT.z);
      const cover = okAdvanceGoal(rt);
      okRoadGuide(rt, cover, '丹羽の竹束へ戻る道');
      // 不発の知らせは近くの鉄砲足軽から一度だけ。離れていた時は一秒ごとに機会を待つ。
      if (!F.wetGunHeard && rt.t - F.assaultSignalT >= 11 && rt.t >= (F.wetGunCheckAt || 0)) {
        F.wetGunCheckAt = rt.t + 1;
        okWetGun(rt);
      }
      const el = rt.t - F.stepT, ramAt = F.ram.center();
      const ramReady = gone(F.ram) || Math.hypot(ramAt.x - FRONT.x, ramAt.z - FRONT.z) < 14;
      // 合図と不発を聞く間は説明を残し、その後は動く竹束へ案内する。
      rt.objProgress('main', rt.t < F.signalQuietUntil
        ? '法螺が終わったら鬨を返す。太鼓の早打ちに合わせ、竹束と坂の旗へ'
        : rt.t < (F.wetGunUntil || 0) ? '火縄が湿り、鉄砲は撃てぬ。竹束の陰で槍をそろえよ'
        : rt.t < (F.nearVoiceUntil || 0) ? F.nearVoiceText
        : cover === FRONT ? '木戸へ向き、竹束の後ろで槍をそろえよ'
        : Math.hypot(p.x - cover.x, p.z - cover.z) > 6 ? '組から離れるな。丹羽の竹束の後ろへ寄れ'
        : '組と歩調をそろえ、竹束が進んだら続け');
      // 竹束が寄ったら城兵が応じる。坂で一分間待たせず、遅れた時にも次へ進む。
      // 10/30：時が過ぎても、本人が坂の旗へ寄らなければ進めない（持ち場の入口に立つだけでは進まない）
      if ((d < 22 && el >= 18 && ramReady) || (d < 22 && el >= 28) || el > 45 && d < 18) {
        if (!F.pushStarted) { F.pushStarted = true; this.pushback(rt); }
      }
    }
    if (F.step === 2) {
      const L = F.push || [];
      const d = Math.hypot(p.x - FRONT.x, p.z - FRONT.z);
      let active = 0;
      for (const g of L) if (!sortieBroken(g)) active++;
      okRoadGuide(rt, FRONT, '坂道を通って、城兵を止める旗へ');
      rt.objProgress('main', F.pushSignalPending ? '城兵が坂へ出た。坂の旗で槍をそろえ、退き口を守れ' :
        rt.t < F.signalQuietUntil ? '鉦二つは止まれ。組の返事を聞き、坂の旗で槍をそろえよ' :
        rt.t < (F.sortieVoiceUntil || 0) ? '城兵の声！　坂の旗で槍をそろえ、退き口を守れ' :
        d > 18 ? '道の印をたどり、坂の旗へ戻れ' : active ?
        `木戸から城兵が来る。あと${active}組。旗で止め、城内へ追うな` : '城兵は退いた。旗で槍をそろえ、退きの下知を待て');
      // 10/30：本人が坂で城兵を一人は討った時だけ退きの段へ。立っているだけなら進まず、刻限で負け
      if (((rt.t - F.stepT >= 12 && L.length >= 2 && L.every(sortieBroken)) || rt.t - F.stepT > 60) && F.s2Own > 0 && d < 40) this.midA(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - CAMP_LINE.x, p.z - CAMP_LINE.z);
      let arrived = 0;
      // 先に退いた竹束と退路守りの組も数える。全員の帰陣を待つ条件にはしない。
      for (const g of F.oda) {
        for (const u of g.units) {
          if (!u.alive || u.dying || u.gone || u.woundOut || u.noTarget) continue;
          if (Math.hypot(u.pos.x - CAMP_LINE.x, u.pos.z - CAMP_LINE.z) <= 24) u._okReturned = true;
          if (u._okReturned) arrived++;
        }
      }
      // 仲間の帰着は本人の帰陣条件ではない。零人の表示だけで待たせない。
      rt.objProgress('main', `${rt.t < (F.chaseVoiceUntil || 0) ? '追っ手の声！　槍を返し、組を守って退け' : rt.t < F.signalQuietUntil ? d <= 8 ? '陣の旗で槍をそろえ、退き太鼓と組の返事を聞け' : '低い法螺と二つ打ちは退けの合図。道の印で南の陣へ' : d <= 12 ? '陣の旗へ入れ' : '仲間を待たず、道の印から陣の旗へ'}${arrived ? `。戻った仲間${arrived}人` : ''}`);
      okRoadGuide(rt, CAMP_LINE, '陣へ下る角');
      // 退き太鼓と九・四秒後の返事を聞き終えてから翌朝へ。集合の法螺を重ねない。
      // 遅れた組の割合では足止めしない。
      if (d <= 8 && rt.t - F.stepT >= 12 && rt.t >= F.signalQuietUntil && rt.player.u.alive) this.siegeDays(rt);
      // 帰陣が遅れた時の場面転換でも、本人を陣へ置いて翌朝につなぐ。
      else if (rt.t - F.stepT >= 70 && d < 40 && rt.player.u.alive) {
        const u = rt.player.u;
        u.pos.set(CAMP_LINE.x, rt.world.heightAt(CAMP_LINE.x, CAMP_LINE.z), CAMP_LINE.z);
        u.vel.x = u.vel.z = 0;
        rt.player.vel.x = rt.player.vel.z = 0;
        rt.player.hspd = 0;
        this.siegeDays(rt);
        rt.say('組頭', '夜明けまでに、味方と南の陣へ退いた。次は南の柵を守るぞ', 5);
      }

    }
    // 封鎖の旗への枝道も、直線の印だけで切岸へ誘わない。
    if (F.step === 4) {
      if (okAtSouthLine(rt)) {
        if (F.roadGuideMarked) { rt.unmark('sakamichi'); F.roadGuideMarked = false; }
      } else okRoadGuide(rt, SOUTH_BLOCK, '南の柵への角');
    }

  },

  lose(rt, reason, deadline = false) {
    if (!deadline && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; F.failed = true;
    if (F.dp) F.dp.on = false;
    rt.objFail('main'); rt.objFail('dp'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('backColumn'); rt.unmark('backEscort');
    rt.unmark('sakamichi'); rt.unmark('niwa');
    for (const id of ['camp', 'ch', 'gate', 'p1', 'p2']) { rt.unmark(id); rt.unzone(id); }
    rt.objRemove('main'); rt.objRemove('dp');
    rt.unmark('tabaFront'); rt.unmark('karamete');
    okHideSpeech(rt);
    rt.tracker.main = false; rt.banner('持ち場を守れず', reason);
    // しくじった三手を退かせる。総軍が壊滅した負けにはしない。
    for (const g of F.oda) if (!gone(g)) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = downRoad(g, [CAMP.x, CAMP.z - 16]); g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    rt.finish({ scriptedEnd: true, failureReason: reason }, WITHDRAWAL_LISTEN);
  },

  // 長い敗因が共通の短文へ置き換わり、南の持ち場を見失うのを防ぐ。
  retryReason(rt, info) {
    const reason = info.failureReason || '';
    if (/合流できず/.test(reason)) return '南の柵で番の組と合流できなかった';
    if (/槍が足りず/.test(reason)) return '南の柵の槍の仲間が足りなかった';
    if (/七十五秒|守る時間が足りず/.test(reason)) return '南の柵を守る時間が足りなかった';
    if (/城兵が届かず/.test(reason)) return '南の柵で城兵を迎え撃てなかった';
    if (/押し返せず/.test(reason)) return '南の柵で城兵を押し返せなかった';
    if (/組が崩れ/.test(reason)) return rt.flags.step === 4 ? '南の柵の列が崩れ、城兵を通した' : '坂の列が崩れ、退路を守れなかった';
    if (/交代の下知/.test(reason)) return '坂の持ち場を保てず、交代になった';
    return null;
  },

  onFinish(rt) {
    // 巻物に、この戦で次に取る手を一行添える（戦功は増やさない）。
    const lines = rt.tracker.lines;
    rt.tracker.lines = function() {
      const result = lines.call(this);
      result.push({ label: rt.flags.failed ? (rt.flags.step === 4 ? '次の手：南の柵の旗で、番の組と槍をそろえる' : '次の手：竹束の陰から、味方と槍をそろえる') : '次は金ヶ崎。今度は追われる味方の退き口を守る', detail: '次への心得', pts: 0, big: true });
      return result;
    };
    if (rt.flags.failed) {
      // 古い攻めの台詞は消し、交代の下知だけを退きの音と札にそろえる。
      okHideSpeech(rt);
      rt.say('組頭', FAILED_WITHDRAWAL, WITHDRAWAL_LISTEN);
      rt.obj('withdraw', '低い法螺・退き太鼓：持ち場を交代し、組と南の陣へ退け', 'main', true);
      // 共通の終幕が鳴らす退きの合図を聞き終えてから、生きた組が返事をする。
      const cue = rt.flags.signalCue;
      rt.after(9.4, () => {
        if (rt.ended || !rt.flags.failed || rt.flags.signalCue !== cue || !rt.player.u.alive) return;
        okLineReply(rt, 'soldier_retreat', 0.5);
      });
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (F.step === 2 && v.team === 1 && k === rt.player.u) F.s2Own = (F.s2Own || 0) + 1;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0)) return;
    F.routSayT = rt.t + 10; g._routSaid = true;   // 隊ごとに一度（崩れて立て直す隊が、同じ一言を十秒おきに繰り返していた。10/2）
    // 敵の敗走先を、目撃なしに知らせない。
  },
};

// 距離や経過時間だけでは列を破らない。実際の死傷・敗走と、持ち場の敵を見る。
function okLineDanger(rt, C, at, radius, id, dt, place) {
  const F = rt.flags, p = rt.player.u.pos;
  const south = F.step === 4, holdY = south ? rt.world.heightAt(at.x, at.z) : 0;
  let active = 0, foes = 0, support = 0;
  for (const g of F.lineGroups) if (!g.routed) for (const u of g.units) {
    if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.dropped && !u.noTarget) active++;
  }
  rt.army.forNear(at.x, at.z, radius, (u) => {
    if (!u.alive || u.dying || u.gone || u.isStruct || u.fleeing || u.woundOut || u.noTarget || u.dropped) return;
    // 柵の合流判定と同じ平場だけを数える。頭上の道の味方で列を回復させず、
    // 隣の折り返し道の敵で柵を破らない。
    if (south && Math.abs(u.pos.y - holdY) > 3) return;
    if (u.team === 1) foes++;
    else if (!u.isPlayer && !u.group?.routed) support++;
  });
  const near = south ? okAtSouthLine(rt) : Math.hypot(p.x - at.x, p.z - at.z) <= radius;
  // 援軍と槍をそろえるか、本人が敵を押し返せば、残る兵で持ち直せる。
  const broken = active < F.lineMin && support < 3 && foes > 0;
  if (!broken) {
    // 呼び戻した一コマだけでは立て直しにしない。共通の死傷判定を経て、
    // 二秒間保てた列だけを回復とする。境目の往復で猶予も戻さない。
    if (C.dangerT) {
      C.lineSafeT = (C.lineSafeT || 0) + dt;
      if (C.lineSafeT < 2) return false;
      if (rt.t >= (C.lineRecoveredAt ?? -Infinity) + 8) {
        C.lineRecoveredAt = rt.t;
        rt.bark('列が持ち直した。味方のそばで守れ');
      }
    }
    C.dangerT = 0; return false;
  }
  C.lineSafeT = 0;
  if (!C.dangerT && rt.t >= (C.lineWarnedAt ?? -Infinity) + 8) {
    C.lineWarnedAt = rt.t;
    rt.bark('危ない！　組が崩れかけた。十秒の間に旗へ戻り、城兵を押し返せ', true);
  }
  C.dangerT = (C.dangerT || 0) + dt;
  rt.objProgress(id, `旗の仲間 ${support}人。あと${Math.max(0, Math.ceil(10 - C.dangerT))}秒で守りが破れる`);
  if (near) {
    // 近くで支える間だけ、敗走した生き残りを呼び戻す。死者や深手の者は戻さない。
    for (const g of F.lineGroups) {
      // 共通の死傷による士気の上限で直ちに再敗走する組は呼び戻せない。
      // 武器を持つ生存者が元の人数の半分近く残り、本人の声が届く時だけ。
      let ready = 0;
      for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.woundOut && !u.dropped && !u.noTarget &&
          (!u.fleeing && !g.routed || Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 12)) ready++;
      if (ready < Math.max(F.lineMin, Math.ceil(g.initial * .45))) continue;
      let rallied = false;
      // 戦い続ける兵の突きを毎コマ取り消さない。呼び戻すのは崩れた兵だけ。
      for (const u of g.units) if ((g.routed || u.fleeing) && u.alive && !u.dying && !u.gone && !u.woundOut && !u.dropped && !u.noTarget && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 12) {
        u.fleeing = false; u.routIn = undefined; u.target = null; u.atk = null; u.confused = 0; rallied = true;
      }
      if (rallied) {
        g.routed = false; g.morale = Math.max(35, g.morale);
        g.order = 'hold'; g.focus = null; g.path = null; g.dest = null;
        g.wavered = false; g._routLeft = 0; g.anchor.x = p.x; g.anchor.z = p.z;
      }
    }
    // 猶予の解除は次の更新以降、同じ人数の条件で列が保てたかを見て行う。
  }
  if (C.dangerT >= 10) { rt.def.lose(rt, `${place}：組が崩れ、城兵を止められなかった`, true); return true; }
  return false;
}

// 紹介札だけを整える。戦場の任務は共通の右上の一行を使う。
// 戦を離れる時に札の指定を外し、次の戦へ残さない。
function okScreen(rt) {
  const root = rt.hud.root, style = document.createElement('style');
  root.dataset.okawachi = '';
  style.textContent = `
    #hud[data-okawachi] #intro .intro-person b {
      font-size:max(20px, calc(20px * var(--text-scale, 1))); line-height:1.4;
    }
    @media (orientation:landscape) and (max-height:500px) {
      html body #hud[data-okawachi] #intro > .card.card {
        width:min(680px, calc(100vw - 32px)); height:calc(100dvh - 32px) !important;
        max-height:calc(100dvh - 32px) !important; padding:12px;
      }
      #hud[data-okawachi] #intro .intro-person {
        display:inline-grid; vertical-align:top; width:calc(50% - 4px); box-sizing:border-box;
      }
    }`;
  document.head.appendChild(style);
  const dispose = rt.world.dispose;
  rt.world.dispose = function(...args) {
    style.remove(); delete root.dataset.okawachi;
    return dispose?.apply(this, args);
  };
}

// 切岸で肩まで縮んだ視点だけ、同じ坂の踏み面へ戻す。
// 描く直前の近い視点にも使い、一人称・狙い・室内・倒れた後には介入しない。
function okRoadCamera(rt) {
  const player = rt.player, W = rt.world, update = player.updateCamera;
  const previous = W.clampDrawCamera;
  const road = { x: 0, z: 0, s: 0, d: 0 };
  const branch = { x: 0, z: 0, s: 0, d: 0 };
  const eye = new THREE.Vector3(), view = new THREE.Vector3(), rear = new THREE.Vector3();
  const clear = (a, b) => {
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (a.y + (b.y - a.y) * t < drawGroundAt(W, x, z) + .3) return false;
    }
    return (W.cameraBlockFraction?.(a, b) ?? null) === null && player.camBlockHit(a, b) === null;
  };
  const clamp = (camera) => {
    previous?.call(W, camera);
    const u = player.u, p = u.pos, P = camera.position;
    if (!u.alive || rt.over || u.naka || player.fpK >= .5 || player.aiming || player.overHold || player.cine ||
        p.z < GATE.z + 2 || p.z > CAMP_LINE.z + 3 || Math.abs(p.x) > 55) return;
    let way = KARAMETE_WAY;
    karametePoint(p, road);
    karametePoint(p, branch, null, null, SOUTH_ROAD);
    if (branch.d < road.d) { Object.assign(road, branch); way = SOUTH_ROAD; }
    if (road.d > 4.5) return;
    eye.copy(p); eye.y += 1.5;
    camera.getWorldDirection(view);
    const distance = eye.distanceTo(P);
    const dot = distance > .01 ? view.dot(rear.copy(eye).sub(P)) / distance : -1;
    // 胸だけが画角に入っていても、坂の下で草鞋まで切れていた。
    // 実際の画角で足元も調べる。見下ろす角度だけで正常な見回しを戻さない。
    rear.copy(p); rear.y += .12; rear.project(camera);
    const feetVisible = Math.abs(rear.x) < .9 && rear.y > -.85 && rear.y < .9 && rear.z > -1 && rear.z < 1;
    rear.copy(P).addScaledVector(view, 3);
    // 普段の見回しは保つ。本人が画角から消えた時と、目前が土壁の時だけ直す。
    if (distance >= 1.5 && dot >= Math.cos(camera.fov * Math.PI / (360 * camera.zoom)) &&
        feetVisible && clear(P, rear) && clear(eye, P)) return;
    const i = Math.min(way.length - 2, Math.floor(road.s)), a = way[i], b = way[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const direction = dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw) >= 0 ? -1 : 1;
    // 角を越す時も道をたどり、接線を延ばして谷側や上段へ置かない。
    for (let gap = 3.5; gap >= .5; gap -= .5) {
      let s = road.s, left = gap;
      for (let n = 0; n < way.length && left > .001; n++) {
        const k = Math.max(0, Math.min(way.length - 2, direction < 0 ? Math.ceil(s) - 1 : Math.floor(s)));
        const c = way[k], d = way[k + 1], len = Math.hypot(d[0] - c[0], d[1] - c[1]);
        const part = Math.min(left / Math.max(.001, len), direction < 0 ? s - k : k + 1 - s);
        if (part <= 0) break;
        s += direction * part; left -= part * len;
      }
      const k = Math.min(way.length - 2, Math.floor(s)), t = s - k;
      rear.set(way[k][0] + (way[k + 1][0] - way[k][0]) * t, 0,
        way[k][1] + (way[k + 1][1] - way[k][1]) * t);
      rear.y = Math.max(p.y + 2.3, drawGroundAt(W, rear.x, rear.z) + 1.7);
      if (rear.y > p.y + 4 || !clear(eye, rear)) continue;
      P.copy(rear); camera.up.set(0, 1, 0); camera.lookAt(eye);
      player.camPos.copy(P); camera.updateMatrixWorld();
      return;
    }
  };
  // 寄せの前は、立ち止まって見回していない間、視点をゆっくり搦手の木戸と櫓の方へ戻す。
  // 竹束の陰で後ろの坂や味方の背だけを見て待たない。
  const last = { x: 0, z: 0 };
  const gateLook = (dt) => {
    const u = player.u, p = u.pos, F = rt.flags;
    const still = Math.hypot(p.x - last.x, p.z - last.z) < dt * .6;
    last.x = p.x; last.z = p.z;
    if (!still || !(F.step <= 1) || !u.alive || rt.over || player.lock || player.inCombatT > 0 || player.aiming ||
      player.guard || player.fpK >= .5 || player.cine || (player.lookIdle ?? 9) < 1.5 || S.reduceMotion ||
      p.z < GATE.z + 14 || p.z > CAMP_LINE.z + 3) return;
    const want = Math.atan2(GATE.x - p.x, GATE.z - p.z);
    let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * 1.4);
  };
  // 肩越しの視点の真下に味方が立つと、笠が画面の半分をふさぐ。視点の足元からは一歩退かせる。
  const cam2 = { x: 0, z: 0 };
  const clearCamFoot = (dt, camera) => {
    const P = camera.position, units = rt.army?.units;
    if (!units || player.fpK >= .5) return;
    cam2.x = P.x; cam2.z = P.z;
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < units.length; i++) {
      const v = units[i];
      if (v === player.u || v.team !== player.u.team || v.alive === false || v.hidden) continue;
      const dx = v.pos.x - cam2.x, dz = v.pos.z - cam2.z;
      if (dx > 1.6 || dx < -1.6 || dz > 1.6 || dz < -1.6 || Math.abs(v.pos.y - P.y) > 4) continue;
      const d = Math.hypot(dx, dz);
      if (d >= 1.6) continue;
      const ux = d > .01 ? dx / d : Math.sin(player.yaw + Math.PI / 2), uz = d > .01 ? dz / d : Math.cos(player.yaw + Math.PI / 2);
      v.pos.x += ux * (1.6 - d) * k; v.pos.z += uz * (1.6 - d) * k;
    }
  };
  player.updateCamera = function(dt, camera) { gateLook(dt); update.call(this, dt, camera); clamp(camera); clearCamFoot(dt, camera); };
  W.clampDrawCamera = clamp;
}

// 細竹の隙間では共通の光線が抜けるため、束全体の厚みでも視点を止める。
// この戦の据え竹束だけに使い、傾きと移動は既存の姿から読む。
function okTabaCamera(rt) {
  const W = rt.world, previous = W.cameraBlockFraction;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), inverse = new THREE.Quaternion();
  W.cameraBlockFraction = function(from, to) {
    let nearest = previous?.call(this, from, to) ?? null;
    for (const tb of rt.flags.tabas) {
      if (!tb.m.visible) continue;
      inverse.copy(tb.m.quaternion).invert();
      a.copy(from).sub(tb.m.position).applyQuaternion(inverse);
      b.copy(to).sub(tb.m.position).applyQuaternion(inverse);
      let lo = 0, hi = 1;
      for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? a.x : axis === 1 ? a.y : a.z;
        const delta = (axis === 0 ? b.x : axis === 1 ? b.y : b.z) - start;
        // 控え棒は含めず、竹の前後に目線の幅を空ける。
        const min = axis === 0 ? -1.15 : axis === 1 ? -.2 : -.4;
        const max = axis === 0 ? 1.15 : axis === 1 ? 2.05 : .4;
        if (Math.abs(delta) < .000001) {
          if (start < min || start > max) { hi = -1; break; }
        } else {
          const enter = (min - start) / delta, exit = (max - start) / delta;
          lo = Math.max(lo, Math.min(enter, exit)); hi = Math.min(hi, Math.max(enter, exit));
          if (lo > hi) break;
        }
      }
      if (lo <= hi && hi >= 0 && lo < 1 && (nearest === null || lo < nearest)) nearest = lo;
    }
    return nearest;
  };
}

function okHideSpeech(rt) {
  const H = rt.hud;
  H.subQ.length = 0; H.subT = 0; H.shownLine = null; H.shownGoalKey = null;
  for (const line of H.orderLog) line.read = true;
  H.updateLogEntry();
  for (const id of ['subtitle', 'sublog']) {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; if (id === 'sublog') el.hidden = true; }
  }
  window.speechSynthesis?.cancel();
}

// 材質はこの戦の中だけで複製して使い回す。他の戦の旗や木戸へ色を残さない。
function okReflect(rt) {
  const flagMats = new Map(), gateMats = new Map();
  const reflected = (base, cache, color, intensity) => {
    if (!base?.emissive) return base;
    if (!cache.has(base)) {
      const m = base.clone();
      if (camNearMaterials.has(base)) camNearMaterials.add(m);
      m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
      m.emissive.setHex(color); m.emissiveIntensity = intensity; m.emissiveMap = base.map;
      cache.set(base, m);
    }
    return cache.get(base);
  };
  const flag = (mesh) => { if (mesh) mesh.material = reflected(mesh.material, flagMats, 0x9caec8, 0.24); };
  rt.scene.traverse((obj) => { if (obj.userData.flag?.isMesh) flag(obj.userData.flag); });
  for (const u of rt.army.units) {
    flag(u.flag); flag(u.standardFlag);
    if (u.flag) u.flagMat = u.flag.material;
    if (u.standardFlag) u.standardFlagMat = u.standardFlag.material;
  }
  for (const b of rt.flags.nearButai) {
    const mesh = b.light.army.flags;
    if (mesh) flag(mesh);
  }
  for (const gate of Object.values(rt.flags.C.gateObjs)) {
    for (const root of [gate.mesh, gate.frame]) if (root) root.traverse((obj) => {
      if (obj.isMesh && !Array.isArray(obj.material)) obj.material = reflected(obj.material, gateMats, 0x000000, 0);
    });
  }
}

// 南の持ち場へ向く二つの門。門扉・当たりは既存のまま、薄い板葺きの切妻だけを載せる。
// 門の屋根と火の細かな位置は推定。天守や石垣には替えない。
function okCastleFront(rt) {
  const W = rt.world, boards = [], beams = [];
  for (const [z, width, eave] of [[GATE.z, 8.6, 4.4], [-94, 5.8, 4.1]]) {
    const y = W.heightAt(0, z) + eave;
    for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
      const board = new THREE.BoxGeometry(width / 24 - .015, .11, 2.05);
      board.rotateX(side * .46);
      board.translate((i + .5) * width / 24 - width / 2,
        y + .46 + .025 * Math.sin(i * 2.7), z + side * .9);
      boards.push(board);
    }
    for (const dz of [-1.8, 0, 1.8]) {
      const beam = new THREE.BoxGeometry(width + .18, .15, .16);
      beam.translate(0, y + (dz === 0 ? .98 : .15), z + dz); beams.push(beam);
    }
    // 影を描く光は増やさず、篝火に近い土塁・板塀・門の裏まで暖色を届かせる。
    const light = new THREE.PointLight(0xffb56b, 16, 24, 1.4);
    const fireX = z === GATE.z ? -6 : -10, fireZ = z === GATE.z ? z - 3 : -96;
    light.position.set(fireX, W.heightAt(fireX, fireZ) + 1.6, fireZ);
    rt.scene.add(light);
  }
  for (const [parts, color] of [[boards, 0x76654d], [beams, 0x483a2b]]) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true; rt.scene.add(mesh);
  }
}

// この戦の山だけを斜面にし、裾を深く重ねる。夜も三段の霞と山肌を残す。
// 持ち場（搦手の坂の中ほど）から25秒の画面に城の守りが入るように（10/29）。坂の上の段（搦手の前）の真ん中は寄せ手の道なので空け、
// 西の奥に番所の出丸（笠板の板塀・冠木門・番所・物見櫓・篝火）、東は馬場の西の塀の内に物見櫓、塀の外と木戸の前に篝火。
// 形は城の部品（castle_parts の物見櫓・冠木門）と props の板塀・番所を使い回す（毎コマは作らない）。位置と形は推定。
// 持ち場から25秒の画面（視点 x≈0・z≈-18 から南へ、横 ±44°）に入る搦手前の段へ、
// 城方の番小屋・長屋の家並みと、霧山城の曲輪の写真のような低木の株・下草を置く（10/29）。
// 家は段の東西の縁（道と三手の寄せる筋 x=-24・-8・8 を空ける）。位置と数は推定の補景。
// 低木と草は野の株と同じ形・材質を使い回し、設営時に一度だけ並べる。毎コマの処理は増やさない。
function okKarameteYard(rt) {
  const W = rt.world;
  for (const [x, z, w, d, rot, wall, ita] of [[16.5, -52.5, 5, 3.6, 0.06, 0x8c7a62, false], [16, -42, 4.5, 3.5, -Math.PI / 2 + 0.08, 0x857560, true],
    [-17, -53, 5, 3.6, -0.05, 0x907d64, false]]) {
    rt.scene.add(hut(W, x, z, w, d, rot, { h: 2.4, wall, ita, groundedHome: true }));
  }
  let bushSrc = null, tuftSrc = null;
  rt.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.material || Array.isArray(o.material)) return;
    if (!bushSrc && o.material.alphaTest === 0.42 && o.geometry.attributes.position.count === 126) bushSrc = o;
    if (!tuftSrc && o.material.alphaTest === 0.45) tuftSrc = o;
  });
  // 共通の草の材質は、兵の踏み跡（持ち場の平場はほぼ全面）で株を七割がた寝かせ、夜は泥の一色に消えていた（10/30）。
  // 曲輪と平場の縁の下草だけ、同じ絵と形のまま踏み跡で寝かせない材質を一つ作って共有する（揺れは無し・毎コマの処理なし）。
  if (tuftSrc) {
    const m = tuftSrc.material.clone(); m.color.setHex(0xd2ccae);
    // 葉の板の裏や月の反対を向く面が黒い影絵になった。法線を上向きにそろえ、地面と同じ光の受け方にする。
    const g = tuftSrc.geometry.clone(), nr = g.attributes.normal;
    if (nr) { for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0); nr.needsUpdate = true; }
    tuftSrc = { geometry: g, material: m, instanceColor: tuftSrc.instanceColor };
  }
  const huts = [[16.5, -52.5, 4], [16, -42, 3.6], [-17, -53, 4]];
  const keep = [[-6, -47], [6, -47], [21.5, -37], [21.5, -50], [-11, -50], [11, -50], [-4.5, -56], [4.5, -56]];
  let seed = 70717;
  const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const free = (x, z) => {
    if (distToPolyline(x, z, ROAD_KARAMETE) < 3.4) return false;
    // 三手が竹束を寄せる筋と、持ち場の竹束の列は空ける。
    if (z < -24 && (Math.abs(x + 24) < 3 || Math.abs(x + 8) < 4 || Math.abs(x - 8) < 3 || Math.abs(x) < 6)) return false;
    if (z > -29 && z < -21 && x > -12 && x < 7) return false;
    if (x < -21 && z < -45) return false; // 出丸の塀の内
    for (const [hx, hz, r] of huts) if (Math.hypot(x - hx, z - hz) < r) return false;
    for (const [kx, kz] of keep) if (Math.hypot(x - kx, z - kz) < 2.2) return false;
    return true;
  };
  const D = new THREE.Object3D(), col = new THREE.Color();
  const place = (src, max, scale, tint) => {
    if (!src) return;
    const m = new THREE.InstancedMesh(src.geometry, src.material, max);
    let n = 0;
    for (let t = 0; t < max * 12 && n < max; t++) {
      const x = -30 + R() * 60, z = -53 + R() * 46;
      // 株は群れにまとめ、まばらな所と濃い所を作る（水玉に並べない）。
      if (Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2.2) * Math.cos(z * 0.27 - x * 0.09) < -0.15 + R() * 0.5) continue;
      if (!free(x, z)) continue;
      const sc = scale * (0.7 + R() * 0.7);
      D.position.set(x, W.heightAt(x, z) - 0.06 * sc, z); D.rotation.set(0, R() * 6.28, 0);
      D.scale.set(sc, sc * (0.75 + R() * 0.45), sc); D.updateMatrix(); m.setMatrixAt(n, D.matrix);
      if (m.instanceColor || src.instanceColor) m.setColorAt(n, col.setRGB(tint[0] + R() * 0.08, tint[1] + R() * 0.08, tint[2] + R() * 0.04));
      n++;
    }
    m.count = n; m.receiveShadow = true; m.computeBoundingSphere(); rt.scene.add(m);
  };
  // 九月の山城の曲輪：くすんだ緑の低木の株と、枯れかけの下草。
  place(bushSrc, 70, 1.25, [0.34, 0.4, 0.22]);
  place(tuftSrc, 360, 0.75, [0.56, 0.52, 0.32]); // 10/30：低い株を増やし、平場の土に草の斑を作る（兵を隠す高さにしない。一つの束のまま）
  okYardRing(rt, bushSrc, tuftSrc);
}

// 持ち場（搦手の坂の上の平場の縁 x≈3・z≈-24）から八方（45度ずつ）のどこを向いても、
// 秋の雑木の株立ち・低木の茂みと下草・低い土塁（切岸の縁）のうち二つ以上が画面に入るように、平場の縁へ輪に配る（10/30）。
// 当たりは持たせない（兵と bot の歩く道は変えない）。竹束の列・三手の寄せる筋・坂道の上には木と茂みを置かず、下草だけ。
// 夜でも形が読めるよう、輪の三か所に篝火（光は共通の近い火への付け替えで、数は増えない）。
// 形と材質は野の株・木の幹を使い回し、設営時に一度だけ並べる。位置と樹種は推定の補景。乱数は自前（遊びの乱数を動かさない）。
function okYardRing(rt, bushSrc, tuftSrc) {
  const W = rt.world, P = { x: 3, z: -24 };
  let seed = 30107;
  const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const lane = (x, z) => distToPolyline(x, z, ROAD_KARAMETE) < 3.4
    || (z < -24 && (Math.abs(x + 24) < 3 || Math.abs(x + 8) < 4 || Math.abs(x - 8) < 3 || Math.abs(x) < 6))
    || (z > -30 && z < -20 && x > -13 && x < 8);
  const D = new THREE.Object3D(), col = new THREE.Color();
  const bark = (W.treeMeshes || []).find((m) => m.isInstancedMesh && m.material && !Array.isArray(m.material) && m.material.map && !(m.material.alphaTest > 0) && !m.userData.treeFoliage);
  const trunkMat = bark ? bark.material : new THREE.MeshLambertMaterial({ color: 0x3e3226 });
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.13, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 96);
  // 野の株の材質は株ごとの色を受けない（緑の一色に見える）。形は使い回し、葉の絵だけの材質を一つ作って雑木と茂みで共有する。
  const leafMat = bushSrc ? new THREE.MeshLambertMaterial({ map: leafTex('broad'), alphaTest: 0.42, side: THREE.DoubleSide }) : null;
  const crowns = bushSrc ? new THREE.InstancedMesh(bushSrc.geometry, leafMat, 72) : null;
  const bushes = bushSrc ? new THREE.InstancedMesh(bushSrc.geometry, leafMat, 110) : null;
  const tufts = tuftSrc ? new THREE.InstancedMesh(tuftSrc.geometry, tuftSrc.material, 640) : null;
  let nt = 0, nc = 0, nb = 0, nf = 0;
  // 秋の雑木（楢・櫟・山桜・漆）の葉色：褐色・黄・朱を主に、常緑のくすんだ緑を少し。
  // 鮮やかにしすぎず、くすんだ褐色・黄ばみ・赤茶に寄せる。
  const fall = [[0.82, 0.5, 0.26], [0.86, 0.64, 0.32], [0.74, 0.42, 0.24], [0.6, 0.46, 0.28], [0.4, 0.44, 0.28]];
  const putCrown = (m, i, x, y, z, sx, sy, tint) => {
    D.position.set(x, y, z); D.rotation.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3); D.scale.set(sx, sy, sx); D.updateMatrix();
    m.setMatrixAt(i, D.matrix); m.setColorAt(i, col.setRGB(tint[0] * (0.85 + R() * 0.3), tint[1] * (0.85 + R() * 0.3), tint[2] * (0.85 + R() * 0.3)));
  };
  // 雑木の株立ち：根元から三本ほどの細い幹が斜めに立ち、上に葉の房が重なる。
  const tree = (x, z, size) => {
    if (!crowns || nt + 4 > 96 || nc + 3 > 72) return;
    const g = W.heightAt(x, z), tint = fall[Math.floor(R() * fall.length)], stems = 2 + Math.floor(R() * 2);
    for (let s = 0; s < stems; s++) {
      const a = R() * 6.28, lean = 0.12 + R() * 0.16, h = size * (3.2 + R() * 1.4);
      D.position.set(x + Math.cos(a) * 0.25, g - 0.1, z + Math.sin(a) * 0.25); D.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      D.scale.set(size, h, size); D.updateMatrix(); trunks.setMatrixAt(nt++, D.matrix);
      putCrown(crowns, nc++, x + Math.cos(a) * h * lean * 0.9, g + h * 0.92, z + Math.sin(a) * h * lean * 0.9, size * (1.9 + R() * 0.8), size * (1.6 + R() * 0.6), tint);
    }
  };
  const bush = (x, z, sc) => {
    if (!bushes || nb >= 110) return;
    putCrown(bushes, nb++, x, W.heightAt(x, z) - 0.08 * sc, z, sc * (0.9 + R() * 0.5), sc * (0.7 + R() * 0.5), [0.58 + R() * 0.14, 0.46 + R() * 0.08, 0.25]);
  };
  const tuft = (x, z, y = W.heightAt(x, z)) => {
    if (!tufts || nf >= 640) return;
    // 夜の闇に沈まないよう、枯れ草の穂先の明るい藁色へ寄せる。兵の脛より低く保ち、土の上の斑として読ませる（10/30）。
    const sc = 0.7 + R() * 0.45;
    D.position.set(x, y - 0.05, z); D.rotation.set(0, R() * 6.28, 0); D.scale.set(sc, sc * (0.9 + R() * 0.5), sc); D.updateMatrix();
    tufts.setMatrixAt(nf, D.matrix); tufts.setColorAt(nf++, col.setRGB(0.7 + R() * 0.14, 0.6 + R() * 0.1, 0.36 + R() * 0.06));
  };
  // 低い土塁（切岸の縁の土盛り）：盛り上がりの断面を弧に沿って延ばし、両端を細らせる。草をまばらに乗せる。
  const pos = [], uv = [], cols = [], idx = [], tops = [];
  const mound = (cx, cz, r0, a0, a1, H) => {
    const N = 14, M = 7, base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = a0 + (a1 - a0) * t, end = Math.sin(Math.PI * t) ** 0.6;
      for (let j = 0; j <= M; j++) {
        const u = j / M, rr = r0 + (u - 0.5) * 4.2;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const bump = Math.sin(Math.PI * u) ** 1.4, n = 0.12 * Math.sin(x * 1.7 + z * 0.9) + 0.08 * Math.cos(z * 2.3 - x * 0.7);
        const y = W.heightAt(x, z) - 0.25 + (H * end + n) * bump;
        pos.push(x, y, z); uv.push(x / 3, (z + y) / 3);
        const v = 0.72 + 0.18 * bump + n;
        cols.push(v * 0.98, v * 0.88, v * 0.72);
        if (j === 3 && i % 2 === 1) tops.push([x, y, z]);
        if (i < N && j < M) { const k = base + i * (M + 1) + j; idx.push(k, k + 1, k + M + 1, k + 1, k + M + 2, k + M + 1); }
      }
    }
  };
  // 八方の扇ごとに、平場の縁（半径 7〜19m）へ雑木・茂み・土塁を散らす。道と寄せ手の筋は避ける。
  const fires = [];
  for (let k = 0; k < 8; k++) {
    const mid = k * Math.PI / 4;
    const spot = (r0, r1, tries = 30) => {
      for (let t = 0; t < tries; t++) {
        const a = mid + (R() - 0.5) * 1.1, r = r0 + R() * (r1 - r0);
        const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
        if (!lane(x, z)) return [x, z, a, r];
      }
      return null;
    };
    for (let i = 0; i < 2; i++) { const s = spot(10, 17); if (s) { tree(s[0], s[1], 0.9 + R() * 0.4); for (let j = 0; j < 3; j++) bush(s[0] + (R() - 0.5) * 4, s[1] + (R() - 0.5) * 4, 1.3 + R() * 0.6); } }
    for (let i = 0; i < 8; i++) { const s = spot(7, 16); if (s) bush(s[0], s[1], 1.2 + R() * 0.7); }
    // 下草は道の肩と寄せる筋にもまばらに（低いので歩く兵の邪魔に見えない）。竹束の列の中は空ける。
    for (let i = 0; i < 40; i++) {
      const a = mid + (R() - 0.5) * 0.8, r = 5 + R() * 13, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (distToPolyline(x, z, ROAD_KARAMETE) < 1.6 || (z > -30 && z < -20 && x > -13 && x < 8)) continue;
      tuft(x, z);
    }
    // 土塁は扇の平場の縁（半径 10〜13m。外へ置くと坂の肩に隠れる）に一つ。寄せ手の筋・道にかかる所は短く切る。
    const ra = 10 + R() * 3, half = 0.22 + R() * 0.08;
    let a0 = mid - half, a1 = mid + half;
    const at = (a) => lane(P.x + Math.sin(a) * ra, P.z + Math.cos(a) * ra);
    while (a0 < a1 && at(a0)) a0 += 0.03;
    while (a1 > a0 && at(a1)) a1 -= 0.03;
    // 弧は (cos, sin) で回すので、扇の向き（sin, cos）に合わせて角度を移す。
    if (a1 - a0 > 0.12 && !at((a0 + a1) / 2)) mound(P.x, P.z, ra, Math.PI / 2 - a1, Math.PI / 2 - a0, 1.3 + R() * 0.6);
    if (k % 3 === 1) { const s = spot(8, 11); if (s) fires.push(s); }
  }
  // 木戸へ上る坂（北）を向いた時は寄せ手の筋で扇の中が空くので、筋の外の両肩（斜め前 35〜40 度）へ雑木を足す。
  for (const [x, z] of [[12.5, -36], [12, -40.5], [-14, -44], [-16.5, -47.5]]) { tree(x, z, 1.2); bush(x + 1.5, z + 1, 1.6); bush(x - 1.2, z + 1.4, 1.4); }
  for (const [x, y, z] of tops) for (let i = 0; i < 2; i++) tuft(x + (R() - 0.5) * 1.2, z + (R() - 0.5) * 1.2, y + 0.05);
  // 平場の土に枯れ草の斑を足す（10/30）。上の雑木・土塁・篝火の並びを動かさないよう、別の種の乱数で群れに散らす。
  {
    const keepR = seed; seed = 51031;
    for (let i = 0; i < 420; i++) {
      const a = R() * 6.28, r = 4 + R() * 15, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (Math.sin(x * 0.41 + Math.cos(z * 0.33) * 2) * Math.cos(z * 0.37 - x * 0.12) < -0.1 + R() * 0.4) continue;
      if (distToPolyline(x, z, ROAD_KARAMETE) < 1.6 || (z > -30 && z < -20 && x > -13 && x < 8)) continue;
      tuft(x, z);
    }
    seed = keepR;
  }
  const tag = (m, kind) => { m.userData.okRing = kind; m.receiveShadow = true; (m.isInstancedMesh ? m : m.geometry).computeBoundingSphere(); rt.scene.add(m); };
  trunks.count = nt; trunks.castShadow = true; tag(trunks, 'ki');
  if (crowns) { crowns.count = nc; crowns.castShadow = true; tag(crowns, 'ki'); }
  if (bushes) { bushes.count = nb; tag(bushes, 'kusa'); }
  if (tufts) { tufts.count = nf; tag(tufts, 'kusa'); }
  if (idx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: W.groundU?.tDirt?.value || null, color: 0x9a8466, vertexColors: true });
    tag(new THREE.Mesh(g, mat), 'kishi');
  }
  // 篝火（台と火）。火の揺らぎの乱数で遊びの乱数を動かさないよう、置く間だけ自前の乱数を使う。
  const keep = Math.random; Math.random = R;
  try { for (const [x, z] of fires) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.35, size: 0.8, ...OK_FIRE_REACH, lightRadius: 22 }); } }
  finally { Math.random = keep; }
}

function okKarameteFront(rt) {
  const W = rt.world, high = HI(rt);
  const kit = makeKitBatch();
  const fence = (seg) => rt.scene.add(castleBoardFence(W, seg, { boardCap: true, h: 2.5 }));
  // 搦手口の曲輪の南西に張り出す出丸（坂の段の西の奥。持ち場から見て左の上）：南の面に冠木門、三方を笠板の板塀
  fence([-36, -46, -31.4, -46]); fence([-26.6, -46, -22, -46]); fence([-22, -46, -22, -60]); fence([-36, -46, -36, -60]);
  rt.scene.add(kabukimon(W, -29, -46, 4.4, 0));
  kuruwaBldg(W, 'bansho', -31, -56, 0, { ita: true, boardRoof: true, batch: kit });
  // 櫓の上にも篝火を焚く（夜の丘の上で櫓の形が遠くから分かる）。台は床の上に置き、炎も床の高さから
  const deckFire = (m, dx = 0.5, dz = 0.5) => {
    const x = m.x + dx, z = m.z + dz, k = kagaribi(W, x, z);
    k.position.y = m.topY; rt.scene.add(k);
    W.addFire(x, z, { h: m.topY - W.heightAt(x, z) + 1.35, size: 0.7, ...OK_FIRE_REACH });
  };
  deckFire(monomi(rt, -25.5, -50, { kind: 'ro', height: 7.6, boarded: true }));
  // 西の谷へ下りる肩にも番の物見（持ち場から坂の西を向いた時に見える）
  deckFire(monomi(rt, -44, -34, { kind: 'ro', height: 9.5, boarded: true }));
  rt.scene.add(nobori(W, -35, -44.5, 'kitabatake', 4.4));
  // 馬場の南西の角に物見櫓（塀の内）
  deckFire(monomi(rt, high ? 34 : 30.5, -35, { kind: 'ro', height: 8.4, boarded: true }));
  finalizeKitBatch(rt, kit);
  const fires = [[-31.8, -44], [-26.2, -44], [-20, -52], [21.5, -37], [21.5, -50]];
  for (const [x, z] of fires) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.35, size: 0.7, ...OK_FIRE_REACH }); }
  // 木戸の脇の二つは大きく焚き、門の扉と塀を火の色で照らす（10/29）。
  for (const [x, z] of [[-4.5, -56], [4.5, -56]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.35, size: 1.0, ...OK_FIRE_REACH, lightRadius: 22 }); }
  // 木戸の前の両脇に番の櫓と篝火（10/29）。持ち場から坂を見上げた画面の左右に、火に照らされた櫓と門が入る。
  // 道（幅2.8m）と前の段（MAE_C）は空ける。位置は推定復元。
  deckFire(monomi(rt, -11, -50, { kind: 'ro', height: 7.2, boarded: true }));
  deckFire(monomi(rt, 11, -50, { kind: 'ro', height: 7.2, boarded: true }));
  for (const [x, z] of [[-6, -47], [6, -47]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.35, size: 0.95, ...OK_FIRE_REACH }); }
}

function okSlopeDetail(W) {
  // 立体の樹冠は共通の不透明な材質を保つ。葉の絵で面を抜くと、
  // 遠くでは杉の側面や松の房が欠け、柱と宙に浮く板だけに見える。
  // 既存の土・岩・草の絵を使う。低画質でも雨で模様を失わず、空き地にも落ち葉を残す。
  const mat = W.terrain.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  // 土・道肩・泥で同じ細粒の土を共有し、明け方に白い砂地へ見えるのを抑える。
  // 入れ物は保ち、既に照明へ渡した絵も同時に替える。足跡と濡れの処理は残す。
  const soil = dirtTex(true, true);
  W.groundU.tDirt.value = W.groundU.tBank.value = W.groundU.tMud.value = soil;
  mat.color.setHex(0xb5a38a);
  // 壁用の透かしは切岸も抜いてしまう。地面は常に残し、既存の視点の地面判定に任せる。
  mat.userData.camNearSolid = true;
  mat.customProgramCacheKey = () => key.call(mat) + '|okawachi';
  mat.onBeforeCompile = function(sh, renderer) {
    compile.call(this, sh, renderer);
    sh.fragmentShader = sh.fragmentShader
      // 三角面ごとの向きで土・岩の貼り方を切り替えると、道に四角い継ぎ目が出る。
      // 色と模様には連続する頂点法線を使う。足場と当たりの三角面は保つ。
      .replace('vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));',
        'vec3 okFaceNormal = normalize(cross(dFdx(vWP), dFdy(vWP)));\n      vec3 gN = normalize(vWN);')
      .replace('vec3 mud = texture2D(tMud, wuv * 0.26).rgb;',
        // 切岸の泥も横から貼った土を使う。上からの絵を縦へ伸ばさず、読み出しも増やさない。
        'vec3 mud = mix(texture2D(tMud, wuv * 0.26).rgb, dirt, slopeK) * vec3(0.46, 0.45, 0.43);')
      // 小石をまばらにする直しは残す。共通の土塊の種を使い、
      // 古い葉の宣言にしかない乱数名を参照しない。
      .replace('pebble * (w.y + bareSoil)', 'pebble * step(0.55, clodSeed) * (w.y + bareSoil)')
      // 土塊の窪みを混ぜ直すと、先に掛けた斜面の排水が消えていた。
      // 最後に傾きを掛け、切岸を水面のように白く光らせない。
      .replace('float wat = smoothstep(0.3, 0.8, surfaceWater);', `
      float wat = smoothstep(0.3, 0.8, surfaceWater);
      float okWaterHold = smoothstep(0.92, 0.995, abs(okFaceNormal.y));`)
      .replace('col = mix(col, vec3(0.06, 0.065, 0.06) + mud * 0.18, pool * 0.85);', `
      // 色の継ぎ目をぼかす法線は、切岸の縁でも上を向く。排水は実際の面で判じる。
      pool *= okWaterHold;
      col = mix(col, vec3(0.06, 0.065, 0.06) + mud * 0.18, pool * 0.85);`)
      .replace('roughnessFactor = mix(roughnessFactor, 0.26, pool);', `
      roughnessFactor = mix(roughnessFactor, 0.26, pool);
      roughnessFactor = max(roughnessFactor, (1.0 - okWaterHold) * 0.82);`)
      .replace('// 雨で濡れると暗く', `
      float okSlope = smoothstep(0.08, 0.45, 1.0 - abs(gN.y));
      float okStone = smoothstep(0.58, 0.78, macro2) * (0.16 + okSlope * 0.28);
      col = mix(col, stone * vec3(1.12, 1.05, 0.92), okStone);
      col = mix(col, dirt * vec3(1.22, 1.04, 0.82), smoothstep(0.32, 0.68, edge) * (0.2 + w.z * 0.35 + okSlope * 0.2));
      float okLeaf = (0.08 + litterCover * 0.65) * (1.0 - smoothstep(0.4, 0.7, macro2)) * (1.0 - trod) * (1.0 - slopeK * 0.7);
      col = mix(col, dirt * vec3(1.55, 1.12, 0.65), okLeaf);
      // 高さごとの縞を作らず、既存の土のむらで切岸の濃淡を付ける。
      col *= mix(0.9, 1.06, smoothstep(0.2, 0.8, macro2)) * okSlope + (1.0 - okSlope);
      // 雨で濡れると暗く`)
      // 共通の夜の青灰化を弱め、土と落ち葉の色を雨の下でも残す。
      .replace('uNight * 0.16) * (1.0 - uNight * 0.2)', 'uNight * 0.08) * (1.0 - uNight * 0.14)')
      // 地面だけに足していた無方向の明るさを抑え、兵と同じ空・篝火で凹凸を読ませる。
      .replace('(0.06 + uNight * 0.12)', '(0.06 + uNight * 0.045)');
  };
  mat.needsUpdate = true;
  // 道の外に低い岩の段を置く。歩ける高さ・道順・当たりは変えない。まとめて一度だけ描く。
  const end = Math.min(6, ROAD_KARAMETE.length);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x827968 }), (end - 1) * 6);
  // 低木は丸い房を共有する。岩と同じ十二面体を潰すと、坂に緑の板片が残る。
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  const leaves = shrubGeo.attributes.position;
  for (let i = 0; i < leaves.count; i++) {
    const x = leaves.getX(i), y = leaves.getY(i), z = leaves.getZ(i);
    const r = 1 + .12 * Math.sin(x * 11 + z * 7) * Math.cos(y * 9);
    leaves.setXYZ(i, x * r, y * r, z * r);
  }
  shrubGeo.computeVertexNormals();
  const shrubs = new THREE.InstancedMesh(shrubGeo, new THREE.MeshLambertMaterial({ color: 0x596044 }), (end - 1) * 6);
  const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
  const rim = rocks.geometry.attributes.position, vertex = new THREE.Vector3();
  // 接線に合わせるだけでは、道肩の丸みに岩の下縁が浮く。
  // 設営時に実際の下半分を調べ、全ての縁を土へ埋める。
  const buryRim = () => {
    d.updateMatrix();
    let sink = 0;
    const points = d.userData.shrub ? leaves : rim;
    for (let i = 0; i < points.count; i++) {
      vertex.fromBufferAttribute(points, i).applyMatrix4(d.matrix);
      // 回転前の上下でなく、坂へ向く腹と縁を埋める。
      if ((vertex.x - d.position.x) * normal.x + (vertex.y - d.position.y) * normal.y +
          (vertex.z - d.position.z) * normal.z > .03) continue;
      sink = Math.min(sink, drawGroundAt(W, vertex.x, vertex.z) - vertex.y - 0.12);
    }
    d.position.y += sink;
    d.updateMatrix();
  };
  const onPath = (x, z, margin) => {
    for (const path of W.def.paths) for (let k = 1; k < path.length; k++) {
      const p = path[k - 1], q = path[k], vx = q[0] - p[0], vz = q[1] - p[1];
      const u = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[1]) * vz) / (vx * vx + vz * vz || 1)));
      if (Math.hypot(x - p[0] - vx * u, z - p[1] - vz * u) < margin) return true;
    }
    return false;
  };
  let count = 0, shrubCount = 0;
  for (let i = 1; i < end; i++) {
    const a = ROAD_KARAMETE[i - 1], b = ROAD_KARAMETE[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.1) continue;
    for (let j = 0; j < 3; j++) for (const side of [-1, 1]) {
      const t = (j + 0.5) / 3, offset = side * (4.2 + j * 0.4);
      const x = a[0] + dx * t - dz / len * offset, z = a[1] + dz * t + dx / len * offset;
      // 折り返した別の道も空け、岩を斜面へ沿わせて根元を埋める。
      if (!onPath(x, z, 4.2)) {
        normal.set(W.heightAt(x - 0.4, z) - W.heightAt(x + 0.4, z), 0.8,
          W.heightAt(x, z - 0.4) - W.heightAt(x, z + 0.4)).normalize();
        d.position.set(x, W.heightAt(x, z), z).addScaledVector(normal, -0.16);
        d.quaternion.setFromUnitVectors(up, normal);
        d.rotateY(Math.atan2(dx, dz) + j * 0.2);
        d.scale.set(0.45 + j * 0.1, 0.22 + j * 0.04, 0.65);
        d.userData.shrub = false; buryRim(); rocks.setMatrixAt(count++, d.matrix);
      }
      const sx = x - dz / len * side * 2.4, sz = z + dx / len * side * 2.4;
      // 折り返した別の道や、陣への通路にも房をかぶせない。
      if (!onPath(sx, sz, 4)) {
        normal.set(W.heightAt(sx - 0.4, sz) - W.heightAt(sx + 0.4, sz), 0.8,
          W.heightAt(sx, sz - 0.4) - W.heightAt(sx, sz + 0.4)).normalize();
        d.position.set(sx, W.heightAt(sx, sz), sz).addScaledVector(normal, -0.15);
        d.quaternion.setFromUnitVectors(up, normal);
        d.rotateY(Math.atan2(dx, dz) + j * 0.2);
        d.scale.set(0.7 + j * 0.1, 0.45, 0.65);
        d.userData.shrub = true; buryRim(); shrubs.setMatrixAt(shrubCount++, d.matrix);
      }
    }
  }
  rocks.count = count; rocks.instanceMatrix.needsUpdate = true;
  // 10/28：十二面体の灰色の岩は、坂の下から見ると斜面に浮いた四角い塊に見えた。道肩には低木の房だけを残す。
  rocks.receiveShadow = true; rocks.visible = false;
  shrubs.count = shrubCount; shrubs.instanceMatrix.needsUpdate = true;
  shrubs.receiveShadow = true;
  // 10/29 点付け：十二面体の房・五角の幹・四角錐の草は、木戸の坂の両肩で角ばった緑の塊に見えた。
  // 道肩は共通の林（葉の絵の雑木・松）と下草の帯に任せ、この戦の作り物の木と草は置かない。
  if (false) {
    // 開始地点より城側の道肩だけ。中央の門・本丸への見通しを空け、草と雑木を三束で描く。
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(.28, 1, 4),
      new THREE.MeshLambertMaterial({ color: 0x77734c }), 144);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .16, 1, 5),
      new THREE.MeshLambertMaterial({ color: 0x514333 }), 12);
    const crowns = new THREE.InstancedMesh(shrubGeo, shrubs.material, 24);
    let gi = 0, ti = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 6; row++) {
      const z = -34 - row * 7, x = side * (22 + row % 3 * 2);
      const h = drawGroundAt(W, x, z), height = 3.2 + row % 3 * .7;
      d.rotation.set(0, row * 1.7, side * .08); d.scale.set(1, height, 1);
      d.position.set(x, h + height / 2 - .18, z); d.updateMatrix(); trunks.setMatrixAt(ti, d.matrix);
      for (let j = 0; j < 2; j++) {
        d.scale.set(1.4, 1.5, 1.2); d.position.set(x + side * j * .6, h + height - .4 + j, z + j * .4);
        d.updateMatrix(); crowns.setMatrixAt(ti * 2 + j, d.matrix);
      }
      ti++;
      for (let j = 0; j < 12; j++) {
        const gx = side * (8 + j * 1.2 + Math.sin(row * 4 + j) * .5), gz = z + Math.cos(j * 2.4) * 2.7;
        if (onPath(gx, gz, 4.3)) continue;
        const gh = .35 + (j % 4) * .12;
        d.rotation.set(0, j * 2.4, side * .16); d.scale.set(1, gh, 1);
        d.position.set(gx, drawGroundAt(W, gx, gz) + gh / 2 - .06, gz);
        d.updateMatrix(); grass.setMatrixAt(gi++, d.matrix);
      }
    }
    grass.count = gi;
    for (const mesh of [grass, trunks, crowns]) {
      mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true; W.scene.add(mesh);
    }
  }
}

function okLandscape(W) {
  // 遠景の雑木も現在は葉の板。杉へそのまま複製すると、杉用の
  // 葉の絵と陰影が残り、夜に白い紙片になる。この戦の二束だけ閉じた房にする。
  // 一株六十四面の形と材質を共有し、株数・位置・描画回数は増やさない。
  if (W.farTreeMeshes?.length) {
    // 六角の球は遠くでも角ばった塊に見えた（10/29 点付け）。凸凹のある丸い房にして、株ごとに秋の褐色と常緑の深緑を混ぜる。
    const parts = [new THREE.CylinderGeometry(.22, .34, 4, 5), okCrownGeo(11), okCrownGeo(23)];
    parts[0].translate(0, 2, 0);
    parts[1].scale(3.2, 2.8, 2.9); parts[1].translate(-.8, 5.2, .3);
    parts[2].scale(2.7, 2.5, 2.6); parts[2].translate(.9, 7.1, -.3);
    const geometry = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const mesh of W.farTreeMeshes) {
      const old = mesh.geometry;
      mesh.geometry = geometry; mesh.material = material;
      if (mesh.isInstancedMesh) okForestColors(mesh, mesh.count, 0.6);
      mesh.computeBoundingSphere();
      old.dispose();
    }
  }
  for (const m of W.mountains.children) {
    const p = m.geometry.attributes.position, layer = m.material.uniforms.layer.value;
    const crest = m.geometry.attributes.crest;
    for (let i = 0; i < p.count; i++) {
      // 共通の山には既に斜面がある。二重に裾を狭めず、下へ延ばして地面につなぐ。
      p.setY(i, p.getY(i) - 28 * (1 - crest.getX(i)));
    }
    p.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
    const mat = m.material;
    mat.uniforms.okSky = W.skyMat.uniforms.bottom;
    mat.uniforms.okTop = W.skyMat.uniforms.top;
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform vec3 color, hazeCol,', 'uniform vec3 okSky, okTop; uniform vec3 color, hazeCol,')
      .replace('gl_FragColor = vec4(mountain, edge);', `
        // 裾は野の霧へ、峰は空へ溶かす。手前の山は濃く、奥の山ほど淡くする。
        vec3 skyAt = mix(okSky, okTop, pow(clamp(normalize(dv).y * 1.5 + 0.04, 0.0, 1.0), 0.8));
        mountain = mix(mountain, skyAt, night * smoothstep(0.2, 0.95, vCrest) * (0.6 + layer * 0.15));
        edge *= 1.0 - night * smoothstep(0.78, 1.0, vCrest) * 0.7;
        gl_FragColor = vec4(mountain, edge);`);
    mat.needsUpdate = true;
  }
  // 野と場外の地形の継ぎ目を、起伏のある土手と二列の林で覆う。道と川の中には置かない。
  const edge = W.half, segments = 48, trees = segments * 4 * 2;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 5), new THREE.MeshLambertMaterial({ color: 0x3c3025 }), trees);
  // 縁の林も七角の球をやめ、凸凹の房に秋の褐色と常緑の深緑を株ごとに混ぜる（10/29 点付け：角ばった塊・秋の林なし）。
  const crowns = new THREE.InstancedMesh(okCrownGeo(37), new THREE.MeshLambertMaterial({ color: 0xffffff }), trees);
  const d = new THREE.Object3D(), pos = [], idx = [];
  let count = 0;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i <= segments; i++) {
      const t = -edge - 16 + (edge + 16) * 2 * i / segments;
      for (let row = 0; row < 3; row++) {
        const out = edge - 12 + row * 14;
        const x = side === 0 ? out : side === 1 ? -out : t;
        const z = side === 2 ? out : side === 3 ? -out : t;
        const river = x > 106 && x < 142 || z < -224 && z > -255;
        const h = Math.max(Math.abs(x), Math.abs(z)) > edge ? W.farH(x, z) : W.heightAt(x, z);
        const bank = river ? 0 : row === 1 ? 2.8 + Math.sin(t * 0.07 + side) * 1.2 : -0.5;
        pos.push(x, h + bank, z);
        if (i < segments && row < 2) {
          const k = side * (segments + 1) * 3 + i * 3 + row;
          idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4);
        }
        if (i === segments || row === 0 || river) continue;
        const scale = 0.75 + (Math.sin(i * 7 + side * 3 + row) + 1) * 0.22;
        d.rotation.set(0, i * 1.7, 0); d.scale.set(scale, scale, scale);
        d.position.set(x, h + bank + 2 * scale, z); d.updateMatrix(); trunks.setMatrixAt(count, d.matrix);
        // 遠い林も三角の板を並べず、幅と高さの違う丸い樹冠にする。
        d.scale.set(3.3 * scale, (3.8 + Math.sin(i * 2.3 + side)) * scale, 2.9 * scale);
        d.position.y = h + bank + 5.5 * scale; d.updateMatrix(); crowns.setMatrixAt(count, d.matrix);
        count++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  W.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x494936, side: THREE.DoubleSide })));
  trunks.count = crowns.count = count;
  okForestColors(crowns, count, 0.24);
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  W.scene.add(trunks, crowns);
}

// 木戸の坂の両肩の下草の茂み（共通の低木と身の回りの茂み）は、葉の絵が緑のまま篝火に照らされ、夏の明るい緑の塊に見えた（10/29 点付け）。
// 茂みだけを枯れかけた褐色と黄ばみへ寄せる（設営時に一度だけ。形・数は変えない）。
function okAutumnBushes(W) {
  const bushes = new Set(), trees = new Set(W.treeMeshes || []);
  W.scene.traverse((o) => { if (o.isInstancedMesh && o.instanceColor && o.material?.alphaTest > 0 && o.geometry.attributes.position.count === 126 && !trees.has(o)) bushes.add(o); });
  const brown = [[0.6, 0.36, 0.15], [0.5, 0.32, 0.15], [0.66, 0.46, 0.18], [0.34, 0.3, 0.16]];
  okTintTrees(W, (i) => brown[(i * 7 + (i >> 2)) % 4], bushes);
}

// 丸い樹冠：二十面体を一度割り、向きごとに膨らみと凹みを付けて葉群の房にする（角や平らな面を作らない）。
function okCrownGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + .14 * Math.sin(x * 5.3 + seed) * Math.cos(z * 4.7 - seed * .3) + .08 * Math.sin(y * 9.1 + x * 3 + seed);
    p.setXYZ(i, x * r, y * r * (y < -.4 ? .7 : 1), z * r);
  }
  g.computeVertexNormals();
  return g;
}

// 株ごとの葉の色：秋の褐色・黄ばみと常緑の深緑を混ぜる。dark で夜の暗さに沈める（設営時に一度だけ）。
function okForestColors(mesh, n, dark) {
  const ever = [[0.2, 0.28, 0.17], [0.24, 0.31, 0.19], [0.18, 0.25, 0.16]], fall = [[0.5, 0.34, 0.18], [0.44, 0.3, 0.17], [0.56, 0.44, 0.22], [0.38, 0.26, 0.15]];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const f = (i * 0.6180339 + 0.27) % 1 < 0.5, a = f ? fall[i % 4] : ever[i % 3], v = dark * (0.85 + ((i * 0.37) % 1) * 0.3);
    mesh.setColorAt(i, c.setRGB(a[0] * v, a[1] * v, a[2] * v));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// 雨雲は残し、明るさは共通の夜の光に任せる。木戸と柵を昼の照り返しで白くしない。
function okNight(W) {
  // 山と岸の木が夏の一色の緑だった（10/29 点付け）。株ごとに常緑の深緑・秋の褐色・黄ばみへ散らす（設営時に一度だけ。形・本数は変えない）。
  {
    const ever = [[0.24, 0.33, 0.2], [0.28, 0.36, 0.22]], fall = [[0.6, 0.42, 0.24], [0.52, 0.36, 0.22], [0.66, 0.52, 0.28]];
    okTintTrees(W, (i) => ((i * 0.6180339 + 0.41) % 1 < 0.45 ? fall[i % 3] : ever[i % 2]));
  }
  // 明るさの移り変わりでも、雨雲の奥へ星と月を描き直さない。
  const applyLook = W.applyLook;
  W.applyLook = function(L) {
    applyLook.call(this, L);
    if (this.timeKey === 'night' || this.fade?.fromNight) {
      if (this.stars) this.stars.visible = false;
      if (this.moon) this.moon.visible = false;
    }
  };
  const lookOf = W.lookOf;
  W.lookOf = function(key) {
    const L = lookOf.call(this, key);
    if (key === 'night') {
      // 霞は灰の板にせず、夜の闇の色へ沈める（10/29）。
      L.sky.setHex(0x222c42); L.fog.setHex(0x161c28); L.top.setHex(0x0a1120);
      L.cover = 0.85; L.cloud = 0.9; L.vis = 100;
      // 遠山が夜の青い板に見えた（10/29 点付け：手本は秋の褐色と常緑の深緑が混ざる林の山）。山の地の色だけを褐色と深緑の闇へ寄せる。
      L.mount = [0x2b2d22, 0x36352a, 0x423f34];
      if (S.quality === 'high') {
        L.hemiSky.setHex(0x8995ae); L.hemiGround.setHex(0x655441); L.hemiI = .78;
      }
      // 地が暗い一色で、坂の土と草の斑・下草の形が見えなかった（10/30 点付け 74）。雨雲越しの月の青白い光を
      // 西寄りの低い角度から横に当て、土の起伏と下草の縁に明暗を付ける（夜のまま。光源は増やさない）。
      L.sun.setHex(0xa6bad8); L.sunI = Math.max(L.sunI, 0.82); L.sunDir.set(-62, 30, 44).normalize();
    }
    // 10/28：日の低い夕暮れで、丘の陰になる手前と城の塀が真っ黒に沈んでいた。空からの回り光を上げ、
    // 夕日の色は残したまま、陰の中の兵・竹束・板塀の木目が読める明るさにする（光源は増やさない）。
    if (key === 'dusk') { L.hemiGround.setHex(0x8a7054); L.hemiSky.setHex(0x95a0b6); L.hemiI = 1.15; L.sunDir.set(-120, 36, -24).normalize(); }
    return L;
  };
  // 日の傾きも少し高く（申の刻の終わり）。低すぎる日で、手前の窪みが丸ごと影に沈んでいた。
  if (W.timeKey === 'dusk') W.applyLook(W.lookOf('dusk'));
  const prepareNight = W.prepareNight;
  W.prepareNight = function() {
    const k = prepareNight.call(this);
    if (this.timeKey === 'night') {
      if (this.stars) this.stars.visible = false;
      if (this.moon) this.moon.visible = false;
      // 白く太い手前の筋は隠し、細い遠雨と足元の跳ねだけを闇に残す。
      this._okWetNight = true; this.rainNear.visible = false;
      this.rain.material.color.setHex(0x46505a); this.rain.material.opacity = 0.12 * this.rainLevel;
      this.splashPts.material.color.setHex(0x46505a); this.splashPts.material.opacity = 0.12 * this.rainLevel;
      return k;
    }
    if (this._okWetNight) {
      this._okWetNight = false;
      this.rain.material.color.setHex(0xc9d2d6); this.rain.material.opacity = 0.45 * this.rainLevel;
      this.splashPts.material.color.setHex(0xd8e0e4); this.splashPts.material.opacity = 0.5;
    }
    return k;
  };
  // この戦の既存の雨筋だけを短くする。粒や材質は増やさず、昼は元の雨に戻す。
  // 『信長公記』巻二は進発後の雨で味方の鉄砲が使えなかったと記す。
  // 高では雨量に応じた既存の本数を保ち、夜だけ半数以下へ間引かない。
  // https://ja.wikisource.org/wiki/信長公記/我自刊我書
  const update = W.update;
  W.update = function(dt, focus) {
    update.call(this, dt, focus);
    if (this.timeKey !== 'night') {
      if (this._okWetNight) {
        this._okWetNight = false;
        this.rain.material.color.setHex(0xc9d2d6);
        this.splashPts.material.color.setHex(0xd8e0e4); this.splashPts.material.opacity = 0.5;
      }
      return;
    }
    if (!this.rain.visible) return;
    this._okWetNight = true;
    this.rainNear.visible = false;
    this.rain.material.color.setHex(0x46505a); this.rain.material.opacity = 0.12 * this.rainLevel;
    this.splashPts.material.color.setHex(0x46505a); this.splashPts.material.opacity = 0.12 * this.rainLevel;
    const pos = this.rain.geometry.attributes.position;
    this.rain.material.linewidth = 1;
    const count = Math.floor(this.rain.geometry.drawRange.count / 2 * (S.quality === 'high' ? 1 : 0.45)) * 2;
    this.rain.geometry.setDrawRange(0, count);
    const arr = pos.array, end = Math.min(arr.length, count * 3);
    for (let i = 0; i < end; i += 6) {
      arr[i + 3] = arr[i] + (arr[i + 3] - arr[i]) * 0.35;
      arr[i + 4] = arr[i + 1] + (arr[i + 4] - arr[i + 1]) * 0.35;
      arr[i + 5] = arr[i + 2] + (arr[i + 5] - arr[i + 2]) * 0.35;
    }
    pos.needsUpdate = true;
  };
}
// 木戸を開け直しても知らせは初めの一度だけ。扉と通れる幅は毎回そろえる。
function okGate(gate) {
  const open = gate._openNow;
  gate._openNow = function(byForce) {
    if (this.opened) return;
    if (this._okOpenWidth === undefined) {
      open.call(this, byForce); this._okOpenWidth = this._flowEntry.w;
    } else {
      this.opened = this.struct.opened = true; this._flowEntry.w = this._okOpenWidth;
      if (this.gateObj.open) this.gateObj.open();
    }
  };
}

// ---------------- 搦手の前・退き・陣の前の段 ----------------
const FRONT = { x: -8, z: GATE.z + 16 };
// 据えた二束の後ろに収まった時だけ待機を促す。太鼓や戦の進行は止めない。
function okAtWaitCover(rt) {
  const p = rt.player.u.pos, cover = rt.flags.waitCover;
  return !!cover && Math.abs(p.x - cover.x) <= 1.2 && p.z >= cover.z - 0.4 && p.z <= cover.z + 0.3;
}
// 遠い旗だけを追って組を置き去りにしない。実際に動く竹束の陰を案内する。
// 座標の入れ物は開戦時の一つを使い回し、竹束が坂へ着いたら旗へ渡す。
function okAdvanceGoal(rt) {
  const F = rt.flags, item = F.TA?.items[0];
  if (!item || gone(F.niwa) || !item.tabas.length) return FRONT;
  // 組の真ん中へ入れると、肩越しの視点が味方の笠の中に埋まる。坂道に近い東の端の束の陰へ着ける。
  let tb = item.tabas[0];
  for (const t of item.tabas) if (t.x > tb.x) tb = t;
  if (Math.hypot(tb.x - FRONT.x, tb.z - FRONT.z) < 10) return FRONT;
  const p = F.advanceCover;
  p.x = tb.x - Math.sin(tb.rot) * 3;
  p.z = tb.z - Math.cos(tb.rot) * 3;
  return p;
}
// 九十九折りの横は切岸。組も遊び手も、坂を直線で横切らず道の角を通る。
const KARAMETE_WAY = [...CAMP_ROAD, ...ROAD_KARAMETE.slice(2, 6), [MAE_C.x, MAE_C.z], [FRONT.x, FRONT.z]];
const SOUTH_JOIN = KARAMETE_WAY.indexOf(ROAD_KARAMETE[3]);
const SOUTH_FROM_CAMP = [...KARAMETE_WAY.slice(0, SOUTH_JOIN + 1), ...SOUTH_ROAD.slice(1)];
const SOUTH_FROM_FRONT = [...KARAMETE_WAY.slice(SOUTH_JOIN).reverse(), ...SOUTH_ROAD.slice(1)];
const RUNNER_FROM_CAMP = [...KARAMETE_WAY.slice(0, SOUTH_JOIN + 1), ...RUNNER_ROAD.slice(1)];
const RUNNER_FROM_FRONT = [...KARAMETE_WAY.slice(SOUTH_JOIN).reverse(), ...RUNNER_ROAD.slice(1)];
const WAY_FROM = { x: 0, z: 0, s: 0, d: 0 }, WAY_TO = { x: 0, z: 0, s: 0, d: 0 };
const WAY_SIDE_FROM = { x: 0, z: 0, s: 0, d: 0 }, WAY_SIDE_TO = { x: 0, z: 0, s: 0, d: 0 };
const WAY_TEST = { x: 0, z: 0 };
// 今いる坂の所から下る。下った組を攻め口へ引き戻さず、切岸を横切らない。
function downRoad(g, end) {
  const from = { x: 0, z: 0, s: 0, d: 0 }, to = { x: 0, z: 0, s: 0, d: 0 };
  karametePoint(g.center(), from);
  karametePoint({ x: end[0], z: end[1] }, to);
  // 陣の手前に着いた組を、旗まで余計に下らせてから坂へ引き返させない。
  const road = from.s <= to.s ? KARAMETE_WAY.slice(Math.ceil(from.s), Math.ceil(to.s)) :
    KARAMETE_WAY.slice(Math.floor(to.s) + 1, Math.floor(from.s) + 1).reverse();
  return [[from.x, from.z], ...road, [to.x, to.z], end];
}
// 封鎖へ向かう組の要も、兵と同じ曲がり角を通す。切岸を直線で横切らせない。
function blockRoad(g, end) {
  const p = g.center(), from = { x: 0, z: 0, s: 0, d: 0 }, to = { x: 0, z: 0, s: 0, d: 0 };
  karametePoint(p, from);
  karametePoint(p, to, null, null, SOUTH_ROAD);
  // すでに南の枝道へ入った組を、坂の分かれ道へ引き戻さない。
  const way = to.d + 0.5 < from.d ? SOUTH_ROAD : from.s <= SOUTH_JOIN ? SOUTH_FROM_CAMP : SOUTH_FROM_FRONT;
  karametePoint(p, from, null, null, way); karametePoint(end, to, null, null, way);
  const road = from.s <= to.s ? way.slice(Math.ceil(from.s), Math.ceil(to.s)) :
    way.slice(Math.floor(to.s) + 1, Math.floor(from.s) + 1).reverse();
  return [[from.x, from.z], ...road, [end.x, end.z]];
}
function karameteClear(army, u, a, b) {
  if (army.wallBetween(a, u.team, b, false)) return false;
  // 切り通しの縁を飛ばして調べると、道の角を横切る行き先を返してしまう。
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
  const W = army.world;
  let y = W.heightAt(a.x, a.z), escaping = !W.walkable(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    const nextY = W.heightAt(x, z), clear = W.walkable(x, z);
    // 押し合いで切岸へ出た兵だけ、低い側の道へ復帰できる。道からの崖越えは通さない。
    if (!clear && !(escaping && nextY <= y + .02)) return false;
    if (clear) escaping = false;
    y = nextY;
  }
  if (escaping) return false;
  return true;
}
function karametePoint(p, out, army, u, way = KARAMETE_WAY) {
  out.d = Infinity;
  for (let i = 1; i < way.length; i++) {
    const a = way[i - 1], b = way[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d) continue;
    WAY_TEST.x = x; WAY_TEST.z = z;
    if (army && !karameteClear(army, u, p, WAY_TEST)) continue;
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
function karameteWay(army, u, want) {
  // 縦隊の後列は columnWay が、その組の通った道で歩き先を決めている。
  // さらに坂全体へ投影すると、折り返しの隣の道や南の枝道へ引き戻される。
  // 既存の道順を持つ兵だけは一度の補正で進め、本人の道案内は従来どおり。
  if (want === u._columnWay && !u.isPlayer && !u.fleeing && (u.group?.followColumnRoad || army.world.def.followColumnRoad) &&
      u.group.roadColumn && u.group.order === 'path' && u.group.pathIdx > 0) return want;
  // 木戸の内や他方面の囲みには、この坂の道を当てはめない。
  const runner = u.group?.isRunner;
  const limit = runner ? HONJIN.x + 24 : 55;
  if ((!runner && (u.pos.z < GATE.z + 1 || want.z < GATE.z + 1)) || Math.abs(u.pos.x) > limit || Math.abs(want.x) > limit) return want;
  // 道の中央へ寄せる途中で、一歩手前を「到着」と見なして止まらない。
  const q = u._okWay || (u._okWay = { x: 0, z: 0, t: -1, gx: 0, gz: 0, active: false, corner: false, botRadius: 0.1 });
  const arrival = 0.3;
  if (q.t > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 1 &&
      (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  const keepCorner = q.active && q.corner && Math.hypot(want.x - q.gx, want.z - q.gz) < 1 &&
    Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > arrival;
  q.t = army.time + 0.3; q.gx = want.x; q.gz = want.z;
  // 折り返しの内側で隣の道が近くなっても、いま向かう角までは歩き切る。
  if (keepCorner && karameteClear(army, u, u.pos, q)) return q;
  q.active = false; q.corner = false;
  // 枝道へ行く時も、枝道から戻る時も、坂との分かれ道を通る。
  karametePoint(u.pos, WAY_FROM); karametePoint(want, WAY_TO);
  const side = runner ? RUNNER_ROAD : SOUTH_ROAD;
  karametePoint(u.pos, WAY_SIDE_FROM, null, null, side);
  karametePoint(want, WAY_SIDE_TO, null, null, side);
  const fromSouth = WAY_SIDE_FROM.d + 0.5 < WAY_FROM.d, toSouth = WAY_SIDE_TO.d + 0.5 < WAY_TO.d;
  const campWay = runner ? RUNNER_FROM_CAMP : SOUTH_FROM_CAMP;
  const frontWay = runner ? RUNNER_FROM_FRONT : SOUTH_FROM_FRONT;
  const way = fromSouth && toSouth ? side : toSouth ? (WAY_FROM.s <= SOUTH_JOIN ? campWay : frontWay) :
    fromSouth ? (WAY_TO.s <= SOUTH_JOIN ? campWay : frontWay) : KARAMETE_WAY;
  // 歩ける斜面でも、九十九折りの角を飛ばすと切岸の横腹へ案内してしまう。
  // まず道の上の位置を比べ、同じ一本道にいる時だけ直進を許す。
  karametePoint(u.pos, WAY_FROM, null, null, way); karametePoint(want, WAY_TO, null, null, way);
  const lo = Math.min(WAY_FROM.s, WAY_TO.s), hi = Math.max(WAY_FROM.s, WAY_TO.s);
  const sameLeg = Math.floor(lo + .001) === Math.floor(hi - .001);
  if ((sameLeg || Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 6) &&
      karameteClear(army, u, u.pos, want)) return want;
  karametePoint(u.pos, WAY_FROM, army, u, way); karametePoint(want, WAY_TO, null, null, way);
  if (WAY_FROM.d > 40 || WAY_TO.d > 40) return want;
  q.active = true;
  // 三列の端も、歩いて通れる次の角へ進む。道の中央への横寄せだけを
  // 繰り返すと、押し合う兵が前へ進めない。切岸に当たる時は末尾で中央へ戻す。
  const forward = WAY_TO.s > WAY_FROM.s;
  let i = forward ? Math.floor(WAY_FROM.s) + 1 : Math.ceil(WAY_FROM.s) - 1;
  i = Math.max(0, Math.min(way.length - 1, i));
  // 角を手前から飛ばすと、馬が切岸へ斜めに入り、同じ角で止まり続ける。
  if (Math.hypot(way[i][0] - u.pos.x, way[i][1] - u.pos.z) < arrival) i += forward ? 1 : -1;
  if (i < 0 || i >= way.length || (forward ? i > WAY_TO.s : i < WAY_TO.s)) {
    q.x = WAY_TO.x; q.z = WAY_TO.z;
    // 最後は道の上の印から相手へ寄る。印そのものを行き先にし続けない。
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < arrival) localPoint(army, u, q, want.x, want.z);
  } else { q.x = way[i][0]; q.z = way[i][1]; q.corner = true; }
  if (!karameteClear(army, u, u.pos, q) && WAY_FROM.d > 0.2) {
    q.x = WAY_FROM.x; q.z = WAY_FROM.z; q.corner = false;
  }
  return q;
}
// 退避先も坂の道幅と通行判定に合わせ、切岸の途中に休む印を置かない。
function okRetreatPoint(rt, point) {
  const p = rt.player.u.pos, step = rt.flags.step;
  if (!karameteClear(rt.army, rt.player.u, p, point)) return false;
  if (step !== 3 && step !== 4) return true;
  const goal = step === 3 ? CAMP_LINE : SOUTH_BLOCK;
  // 陣と番の平場では列の後ろへ退ける。途中の坂は道幅の内側だけを候補にする。
  if (Math.hypot(p.x - goal.x, p.z - goal.z) <= 12 &&
      Math.hypot(point.x - goal.x, point.z - goal.z) <= 12) return true;
  const q = rt.flags.retreatRoadPoint || (rt.flags.retreatRoadPoint = { x: 0, z: 0, s: 0, d: 0 });
  karametePoint(point, q);
  if (q.d <= 2.8) return true;
  if (step === 4) { karametePoint(point, q, null, null, SOUTH_ROAD); return q.d <= 2.8; }
  return false;
}
// 歩ける道順と同じ角を案内する。旗が近くても、切岸を挟む間は道の印を消さない。
function okRoadGuide(rt, goal, label) {
  const F = rt.flags;
  if (rt.t < (F.roadGuideAt || 0)) return;
  // 近い角を通り過ぎても、一秒間同じ一点へ戻す案内を残さない。
  F.roadGuideAt = rt.t + 0.25;
  const next = karameteWay(rt.army, rt.player.u, goal);
  const p = rt.player.u.pos;
  // 足元の補正点は行き先ではない。角へ着いたら本来の陣・柵の旗を見せる。
  if (next !== goal && Math.hypot(next.x - p.x, next.z - p.z) >= 1) {
    if (!F.roadGuide) F.roadGuide = { x: 0, z: 0 };
    // 遠い曲がり角の矢印を切岸の上へ掲げず、通れる道の六歩先を示す。
    const d = Math.hypot(next.x - p.x, next.z - p.z), k = Math.min(1, 6 / d);
    F.roadGuide.x = p.x + (next.x - p.x) * k;
    F.roadGuide.z = p.z + (next.z - p.z) * k;
    if (!F.roadGuideMarked || F.roadGuideLabel !== label) {
      F.roadGuideMarked = true; F.roadGuideLabel = label;
      rt.marker('sakamichi', () => F.roadGuide, label, { h: 1.8, guidePriority: 300, guideAlways: true, guideArea: 'move' });
    }
  } else if (F.roadGuideMarked) { rt.unmark('sakamichi'); F.roadGuideMarked = false; }
}
const KB = (l) => okDress(l, KITABATAKE);
function okCtx(rt) {
  const F = rt.flags;
  return { faction: 'kitabatake', flag: 'kitabatake', armor: KITABATAKE.armor, lace: KITABATAKE.lace, dmg: 1, scale: 1, fixedSpawn: true,
    look: (list) => KB(cappedList(rt, list)), friends: () => [F.niwa, F.ikeda, F.inaba, ...(F.step === 4 ? [F.blockGuard] : [])].filter((g) => g && g.count), routeFight: true, botSteer: wallStop };
}
// 倒れた組の中心から合図を出さない。健在な味方へ引き継ぎ、いなければ陣の旗から知らせる。
// 下知の時だけ探し、毎コマの配列作りや新しい音の仕組みを増やさない。
function okCanAnswer(u) {
  return u.alive && !u.dying && !u.downed && !u.woundOut && !u.gone && !u.fleeing && !u.dropped;
}
// 返事は、その組で応じられる兵から。負傷者や敗走兵だけなら鬨や復唱を返さない。
function okAnswerer(rt, group) {
  if (gone(group) || group.routed || group.order === 'flee') return null;
  const p = rt.player.u.pos;
  let caller = null, distance = Infinity;
  // 名簿の先頭が曲がり角の向こうでも、近くの健在な兵が下知を復唱する。
  // 壁越しの声を足さず、既存の距離・方角の処理で一声だけ届ける。
  for (const u of group.units) if (okCanAnswer(u)) {
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance && !rt.army.wallBetween(u.pos, u.team, p)) {
      caller = u; distance = d;
    }
  }
  return caller;
}
function okReply(rt, group, kind, vol) {
  const caller = okAnswerer(rt, group);
  if (caller) rt.army.play(kind === 'toki' ? 'okToki' : kind === 'fukusho' ? 'okReply' : kind, caller.pos, vol);
  return caller;
}
// 丹羽の組が応じられなくても、同じ三手に残る槍組が下知を受け継ぐ。一声だけ返す。
function okLineReply(rt, kind, vol) {
  const p = rt.player.u.pos;
  let caller = null, distance = Infinity;
  // 丹羽の組を先に鳴らさず、三手のうち実際に声が届く一番近い兵が応じる。
  for (let i = 0; i < 3; i++) {
    const u = okAnswerer(rt, rt.flags.oda[i]);
    if (!u) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance) { caller = u; distance = d; }
  }
  if (caller) rt.army.play(kind === 'toki' ? 'okToki' : kind === 'fukusho' ? 'okReply' : kind, caller.pos, vol);
  return caller;
}
// 打って出る声は健在な城兵の口元から。帰城中や崩れた組には攻撃の声を出させない。
function okSortieVoice(rt, group, vol, nearOnly = false) {
  if (sortieBroken(group) || group._okReturning || group.routed || group.order === 'flee') return null;
  const p = rt.player.u.pos;
  let caller = null, distance = nearOnly ? 24 * 24 : Infinity;
  // 列の奥の一人に固定せず、声を返せる近い兵の口元から鳴らす。
  // 壁の裏の兵を選んで、開いた木戸にいる別の兵の声まで失わない。
  for (const u of group.units) if (okCanAnswer(u)) {
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance && !rt.army.wallBetween(u.pos, 1, p)) {
      caller = u; distance = d;
    }
  }
  if (caller) {
    // 南の封鎖での出撃も含め、警告の声と札を聞く間は普段の声や馬を控える。
    rt.flags.sortieVoiceUntil = rt.t + 6;
    rt.army.play('okToki', caller.pos, vol);
  }
  return caller;
}
// 鉦と味方の返事の後、城兵が声の届く所まで出た時に一度だけ知らせる。
// 出撃や接敵は待たせず、二組の声と札の間には八秒を空ける。
function okPushbackVoice(rt, group, following) {
  const F = rt.flags;
  const warn = () => {
    if (rt.over || F.ending || F.step !== 2 || sortieBroken(group) || group._okReturning) return;
    // 先の突撃太鼓を待つ鉦があれば、城兵の声も鉦と復唱の後へ回す。
    if (F.pushSignalPending) { rt.after(1, warn); return; }
    const wait = Math.max(F.signalQuietUntil || 0, F.pushVoiceNext || 0) - rt.t;
    if (wait > 0) { rt.after(wait + 0.1, warn); return; }
    if (!okSortieVoice(rt, group, following ? 0.55 : 0.65, true)) {
      rt.after(1, warn);
      return;
    }
    F.pushVoiceNext = rt.t + 8;
    rt.objProgress('main', '城兵の声！　坂の旗で槍をそろえ、退き口を守れ');
    if (following) rt.say('組頭', 'また城兵の声じゃ！　後続が来るぞ。坂の旗で槍をそろえ、退き口を守れ！', 4);
    else rt.say('北畠の城兵', 'ここは北畠の城ぞ！　寄せ手を坂から押し返せ！', 3);
  };
  rt.after(5, warn);
}
function okCommandAt(rt, group, fallback) {
  // 返事と同じ見通しで選ぶ。名簿の先頭が壁の裏でも、同じ組の近い兵から届ける。
  const caller = okAnswerer(rt, group);
  if (caller) return caller.pos;
  let nearest = null, distance = Infinity;
  const p = rt.player.u.pos;
  for (const g of rt.flags.oda) {
    const u = okAnswerer(rt, g);
    if (!u) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance) { nearest = u; distance = d; }
  }
  return nearest ? nearest.pos : fallback;
}
// 下知の時だけ既存の音の経路を使う。坂や陣からの方角・遅れ・山の遮りを付ける。
function okSignal(rt, kind, at, vol) {
  const c = rt.camera.position, dx = at.x - c.x, dz = at.z - c.z;
  const d = Math.hypot(dx, dz), yaw = rt.player.yaw;
  const back = d > 0 ? Math.max(0, -(dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d) : 0;
  const pan = rt.panAt(at);
  // 旗や雨と同じ風を通す。届くまでの遅れは、返事と札を保つ時間にも使う。
  const delay = farNext(d, back, at, c, rt.world, WIND_STATE, 'sig_' + kind);
  rt.flags.signalDelay = delay;
  const listening = delay + (kind === 'nobiki' ? WITHDRAWAL_LISTEN : kind === 'kakari' ? 15 : kind === 'atsumare' ? ASSEMBLY_LISTEN : 7);
  // 太鼓の早打ちや退きの返事が終わるまで、周囲の音量を戻さない。
  withPan(pan, () => signal(kind, d, vol, kind === 'kakari' ? 6.7 : 1.2, listening));
  // 同じ段でも下知は変わる。古い合図への返事を、新しい下知の後へ残さない。
  rt.flags.signalCue = (rt.flags.signalCue || 0) + 1;
  // 退きの返事は九・四秒後から。言い終わるまで追っ手の声や次の法螺を重ねない。
  rt.flags.signalQuietUntil = rt.t + listening;
  return rt.flags.signalCue;
}
// 二つ目の鉦の余韻が引いてから、下知を受けた組が応じる。次の段へ声を持ち越さない。
function okStopSignal(rt, group, vol) {
  const step = rt.flags.step;
  const task = step === 4 ? rt.flags.dp?.cur : null;
  const cue = okSignal(rt, 'tomare', okCommandAt(rt, group, rt.flags.step === 4 ? SOUTH_BLOCK : FRONT), vol);
  rt.after(2.3 + rt.flags.signalDelay, () => {
    if (rt.over || rt.flags.ending || rt.flags.step !== step || rt.flags.signalCue !== cue) return;
    if (task && (rt.flags.dp?.cur !== task || !rt.flags.dp.on)) return;
    if (group === rt.flags.niwa) okLineReply(rt, 'fukusho', 0.4);
    else okReply(rt, group, 'fukusho', 0.4);
  });
}
// 時間の下知でも、列がそろった時の下知でも、同じ声・鉦・札で城兵の出撃を知らせる。
function okBlockSortie(rt, C, group, at) {
  const F = rt.flags;
  if (rt.over || F.ending || F.step !== 4 || F.dp?.cur !== C || !F.dp.on ||
      C.sortieReleased || gone(group)) return;
  C.sortieReleased = true;
  sendSortie(rt, group, at);
  let heard = false;
  const warn = () => {
    if (rt.over || F.ending || F.step !== 4 || F.dp?.cur !== C || !F.dp.on ||
        C.repelling || sortieBroken(group) || group._okReturning) return;
    // 集合の二声と組の返事を途中で遮らない。城兵の出撃そのものは待たせない。
    const wait = Math.max(F.signalQuietUntil || 0, F.sortieVoiceUntil || 0) - rt.t;
    if (wait > 0) { rt.after(wait + 0.1, warn); return; }
    const guard = F.blockGuard;
    if (gone(guard)) return;
    // 合図の後、近くへ出てきた城兵の合成の声を聞いてから鉦と警告を返す。
    // 城壁の裏や遠い兵だけなら、声を聞いたという台詞を先に出さない。
    if (!heard) {
      if (!okSortieVoice(rt, group, 0.55, true)) { rt.after(1, warn); return; }
      heard = true;
      rt.after(3.2, warn);
      return;
    }
    okStopSignal(rt, guard, 0.7);
    rt.obj('dp', '止まれの鉦：南の柵で槍をそろえ、出てくる城兵を止めよ', 'main', true);
    okHoldSignal(rt, C, '鉦二つは止まれ。返事を聞き、柵の口で槍をそろえよ', 4);
    rt.say('組頭', '城兵の声じゃ！　鉦二つは止まれ。柵の口で槍をそろえ、兵糧の道を守れ！', okSignalListen(rt));
  };
  rt.after(3.2, warn);
}
// 法螺・太鼓・鉦と組の返事が届くまで、下知の台詞を読める長さにする。
function okSignalListen(rt) {
  return Math.max(4, (rt.flags.signalQuietUntil || 0) - rt.t);
}
// 合図と返事を聞く間は札にも下知を残す。新しい合図で置き換え、段を越して残さない。
function okHoldSignal(rt, task, text, seconds) {
  task.signalText = text;
  task.signalUntil = Math.max(rt.t + seconds + rt.flags.signalDelay, rt.flags.signalQuietUntil || 0);
  task.signalCue = rt.flags.signalCue;
  rt.objProgress('dp', text);
}
// 雨夜の不発は、近くに残る鉄砲足軽の火挟みと湿った火縄。斉射や発砲の煙は出さない。
function okWetGun(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (rt.over || F.ending || F.wetGunHeard || F.step !== 1 || !F.assaultMoving ||
      rt.t < F.signalQuietUntil || rt.t < (F.nearVoiceUntil || 0) ||
      rt.world.rainLevel <= GUN_RAIN_LIMIT) return;
  let gun = null, distance = 12;
  for (const g of [F.niwa, F.taki]) for (const u of g.units) {
    if (u.type !== 'gun' || !okCanAnswer(u) || g.routed || g.order === 'flee') continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < distance && !rt.army.wallBetween(u.pos, u.team, p)) { gun = u; distance = d; }
  }
  if (!gun) return;
  // 声を出す前に倒れたり壁の陰へ入ったら、別の足軽から聞き直せるようにする。
  // 火挟みだけを短い間隔で繰り返さない。
  F.wetGunCheckAt = rt.t + 3;
  rt.army.play('wetMatch', gun.pos, 0.65);
  // 火挟みの音の後に足軽が叫ぶ。台詞と任務札だけで不発を伝えない。
  const cue = F.signalCue;
  rt.after(0.4, () => {
    if (rt.over || F.ending || F.step !== 1 || F.signalCue !== cue ||
        rt.t < F.signalQuietUntil || rt.world.rainLevel <= GUN_RAIN_LIMIT ||
        !okCanAnswer(gun) || gun.group?.routed || gun.group?.order === 'flee' ||
        Math.hypot(gun.pos.x - rt.player.u.pos.x, gun.pos.z - rt.player.u.pos.z) > 12 ||
        rt.army.wallBetween(gun.pos, gun.team, rt.player.u.pos)) return;
    rt.army.play('okCall_misfire', gun.pos, 0.45);
    F.wetGunHeard = true;
    F.wetGunUntil = rt.t + 6;
    rt.objProgress('main', '火縄が湿り、鉄砲は撃てぬ。竹束の陰で槍をそろえよ');
    rt.say('足軽', '火縄が濡れた、撃てぬ！　竹束の陰で槍をそろえよ！', 3);
  });
}
function okSpeaker(rt) {
  const u = rt.flags.niwaU, p = rt.player.u.pos;
  return (rt.G.lord || HI(rt)) && u && u.alive && !u.woundOut && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 12 ? '丹羽長秀' : '組頭';
}
// 本人がそばにいる時だけ、名のある将の声を聞かせる。遠い陣からの声にはしない。
function okNearVoice(rt, u, line) {
  const F = rt.flags, p = rt.player.u.pos;
  if (rt.over || F.ending || F.step !== 1 || rt.t < (F.signalQuietUntil || 0) ||
      rt.t < (F.wetGunUntil || 0) || !u || !okCanAnswer(u) || u.downed ||
      u.group?.routed || u.group?.order === 'flee' ||
      Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 12 || rt.army.wallBetween(u.pos, u.team, p)) return false;
  // 下知は既存の合成の呼び声で知らせ、同じ文を台詞と札に残す。
  rt.army.play('okCall_spear', u.pos, 0.5);
  F.nearVoiceText = `${u.name}：${line}`;
  F.nearVoiceUntil = rt.t + 4;
  rt.objProgress('main', F.nearVoiceText);
  rt.say(u.name, line, 3);
  return true;
}
function nearButaiTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.nearButaiAt || 0)) return;
  F.nearButaiAt = rt.t + 1;
  const p = rt.player.u.pos;
  let alive = 0;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') alive++;
  // 先に遠い兵を戻す。今の場所と向きを保存し、前の持ち場へ飛ばさない。
  for (const b of F.nearButai) {
    const g = b.real;
    if (!g) continue;
    if (g.routed || g.order === 'flee') { b._okBroken = true; b.light.rout(); continue; }
    for (const u of g.units) if (u.alive && !u.keep && !u.target && !u.fleeing && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 85 &&
      u.wkFrom && u.wkFrom.A === b.light && b.light.give(u.wkFrom.i, u.pos, u.heading)) {
      rt.army.despawn(u); alive--;
    }
    b._prevRealAlive = g.count;
  }
  F.nearButai.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
  for (const b of F.nearButai) {
    if (alive >= 235) break;
    if (b._okBroken || b.aliveNominal() <= 0 || !b.light.left(p.x, p.z, 24)) continue;
    const made = b.growReal(Math.min(6, 235 - alive)); alive += made;
    if (made && b.real) { b.real.formation = b.kind === 'bow' || b.kind === 'gun' ? 'line' : 'yari'; b.real.width = Math.min(b.lightWidth || 14, 14); }
  }
}
// 押し合いの足滑りと敗走の接地で泥を蹴る。既存の粒を使い、近い二人まで。
const OK_FOOT_L = new THREE.Vector3(), OK_FOOT_R = new THREE.Vector3(), OK_FOOT_SOUND = new THREE.Vector3();
// 足の一点だけを親の変換で運ぶ。描画用の行列や兄弟の骨を更新し直さない。
// 固定行列の節も扱い、拡大・回転した人の実際の草鞋の位置を保つ。
function okFootPosition(foot, out) {
  out.set(0, 0, 0);
  for (let o = foot; o; o = o.parent) {
    if (o.matrixAutoUpdate) out.multiply(o.scale).applyQuaternion(o.quaternion).add(o.position);
    else out.applyMatrix4(o.matrix);
  }
}
function okFootMud(W, x, z, dx, dz, force, scraping) {
  // 蹄用の広い散らばりは使わず、草鞋の幅から一粒だけ蹴る。粒の枠は共用する。
  const strength = Math.min(1, force / 4.5), sideways = (Math.random() - 0.5) * 0.1;
  // 草鞋の散らばりが岸や段をまたいでも、踏んだ面と違う泥・飛沫に替えない。
  // 足音と同じ接地点の水深を使い、またぐ粒だけ草鞋の中央へ戻す。
  const ground = W.heightAt(x, z), wet = W.waterFootDepthAt(x, z, ground) > 0.02;
  const spreadX = x + dz * sideways, spreadZ = z - dx * sideways;
  const spreadGround = W.heightAt(spreadX, spreadZ);
  if (Math.abs(spreadGround - ground) < 0.15 &&
      (W.waterFootDepthAt(spreadX, spreadZ, spreadGround) > 0.02) === wet) {
    x = spreadX; z = spreadZ;
  }
  if (wet) {
    // 蹄用の大きなしぶきを草鞋へ流用しない。水面の輪と一粒の枠は共用する。
    const P = W.sprayP, first = P?.i;
    W.spray(x, z, 1);
    if (!P || P.i === first) return;
    // 遅い足滑りまで同じ勢いで噴かず、擦った速さに応じて水を押す。
    const k = P.i * 3, push = scraping ? strength * 0.94 : 0.25 + strength * 0.55;
    P.pos[k] = x; P.pos[k + 2] = z;
    // 草鞋の幅へ寄せた後の水面を使い、岸の段差で飛沫を水底へ埋めない。
    P.pos[k + 1] = W.heightAt(P.pos[k], P.pos[k + 2]) + W.waterDepthAt(P.pos[k], P.pos[k + 2]) + 0.025;
    P.vel[k] = -dx * push; P.vel[k + 2] = -dz * push;
    P.vel[k + 1] = scraping ? strength * 0.68 : 0.4 + strength * 0.6;
    P.life[P.i] = P.max[P.i] = scraping ? 0.18 : 0.22 + strength * 0.12;
    return;
  }
  const P = W.mudP;
  if (!P) return;
  const i = P.i = (P.i + 1) % P.life.length, k = i * 3;
  P.pos[k] = x; P.pos[k + 2] = z;
  // 急坂でも、横へずらす前の高さから泥を出さず、粒の真下の土へ合わせる。
  P.pos[k + 1] = W.heightAt(P.pos[k], P.pos[k + 2]) + 0.03;
  // わずかな擦れでは土の表面を低く動かす。速い滑りの勢いと粒数は保つ。
  const push = scraping ? strength * 1.45 : 0.35 + strength * 0.65;
  // 横の散らばりも草鞋の動きへ沿わせる。真下への踏み戻しは横へ噴かない。
  const scatter = (Math.random() - 0.5) * 0.12 * strength;
  P.vel[k] = -dx * push + dz * scatter;
  P.vel[k + 1] = scraping ? strength * 0.59 : 0.3 + strength * 0.6;
  P.vel[k + 2] = -dz * push - dx * scatter;
  // 泥は水平な床からでなく、蹴った坂の接線へ飛ばす。
  // 放出時だけ一歩先を測り、上り側の土へすぐ潜る粒と、下り側の高い噴き出しを避ける。
  // 段や柵際では斜面扱いせず横の勢いを止める。粒の数と寿命は増やさない。
  const travel = Math.hypot(P.vel[k], P.vel[k + 2]);
  if (travel > 0.01) {
    const ahead = W.heightAt(x + P.vel[k] / travel * 0.15, z + P.vel[k + 2] / travel * 0.15);
    const rise = ahead - (P.pos[k + 1] - 0.03);
    if (Math.abs(rise) <= 0.12) P.vel[k + 1] += rise / 0.15 * travel;
    else P.vel[k] = P.vel[k + 2] = 0;
  }
  P.life[i] = P.max[i] = scraping ? 0.18 : 0.22 + strength * 0.12;
}
// 振り終わりの相手が倒れたら、今向き合う相手へ音と踏み直しをつなぐ。
// 候補の配列を作らず、攻撃や移動の目標自体は変えない。
function okFootFoe(u) {
  for (let i = 0; i < 4; i++) {
    const v = i === 0 ? u.swing?.target : i === 1 ? u.atk?.target : i === 2 ? u.target : u.poseTarget;
    // 倒れた兵や木戸が振り終わりに残っても、今の生きた相手を先に拾う。
    // 逃げる相手は追う足の接地に使うので外さず、押す声は下で別に確かめる。
    if (v?.pos && v.alive && v.team !== u.team && !v.isStruct && !v.downed &&
        !v.dying && !v.gone && !v.noTarget && !v.woundOut) return v;
  }
  return null;
}
// 声の間隔は押し合いと敗走で共用し、接地を待っても連呼させない。
function okMeleeVoice(rt, u, fleeing) {
  const F = rt.flags;
  F.meleeVoiceAt = rt.t + 8 + (u.id % 5) * 0.7;
  F.meleeVoiceSaidAt = rt.t;
  F.meleeVoiceKind = fleeing ? 'flee' : 'push';
  u._okVoiceAt = rt.t + 28 + (u.id % 7);
  u._okVoiceKind = F.meleeVoiceKind;
  u._okCaughtUntil = 0;
  rt.army.play(fleeing ? 'soldier_flee' : 'soldier_push', u.pos, fleeing ? 0.6 : 0.45);
}
function okFootTick(rt) {
  const F = rt.flags, W = rt.world, A = rt.army, p = rt.player.u.pos;
  if (rt.t < (F.footCheckAt || 0)) return;
  const high = S.quality === 'high', total = A.units.length;
  const sampleElapsed = Math.max(0.001, rt.t - (F.footSampleAt ?? rt.t - 0.12));
  F.footSampleAt = rt.t;
  F.footCheckAt = rt.t + (high ? 0.06 : 0.12);
  // 採寸は二組に分散し、一人あたりの間隔は保つ。泥も各組一人で二人枠を分ける。
  const phase = F.footPhase || 0;
  if (high) F.footPhase = 1 - phase;
  const start = high ? (F.footCursor || 0) % Math.max(1, total) : 0;
  // 毎回同じ先頭の兵だけが泥と足音を出さないよう、見る順だけを回す。
  if (high) F.footCursor = (start + 1) % Math.max(1, total);
  let kicked = 0;
  let horse = null, horseDistance = 28 ** 2;
  let walkingHorse = null, walkingHorseDistance = 18 ** 2, horseSpeed = 0;
  const horseQuiet = rt.t < Math.max(F.signalQuietUntil || 0, F.wetGunUntil || 0, F.nearVoiceUntil || 0,
    F.sortieVoiceUntil || 0, F.chaseVoiceUntil || 0);
  const horseReady = !horseQuiet && rt.t >= (F.horseCallAt ?? 12);
  const hoofReady = !horseQuiet && rt.t >= (F.horseStepAt || 0);
  const kickLimit = high ? 1 : 2;
  for (let i = 0; i < total; i++) {
    const u = A.units[(start + i) % total];
    // 足音と同じ見回りを使う。下馬・討死した乗り手の位置からは鳴らさない。
    if (horseReady && u.mounted && u.horse && u.alive && !u.dying && !u.downed &&
        !u.woundOut && !u.gone && !u.dropped) {
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < horseDistance && !A.wallBetween(u.pos, u.team, p)) { horse = u; horseDistance = d; }
    }
    // 共通の蹄は突撃開始時だけ。行軍中の馬にも、実際の速さに合う一完歩を返す。
    // 自分の馬と突撃の音は既存の係に任せ、近い一頭だけを同じ見回りで拾う。
    if (hoofReady && !u.isPlayer && u.mounted && u.horse && okCanAnswer(u) && !u.charging && u.vel) {
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      const speed = Math.hypot(u.vel.x, u.vel.z);
      if (d < walkingHorseDistance && speed > 0.5 && speed < 6.5 &&
          !(u.hoovesAt > A.time) && !A.wallBetween(u.pos, u.team, p)) {
        walkingHorse = u; walkingHorseDistance = d; horseSpeed = speed;
      }
    }
    if (high && u.id % 2 !== phase) continue;
    const elapsed = high ? Math.max(0.001, rt.t - (u._okFootAt ?? rt.t - 0.12)) : sampleElapsed;
    if (high) u._okFootAt = rt.t;
    // 遠い兵・討死した兵の標的や骨は読まない。再接近時は採寸を取り直す。
    if (!u.alive || u.dying || u.isPlayer || u.isStruct || u.mounted || u.imp ||
        u.climb || u.downed || u.woundOut ||
        (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 > 16 ** 2) {
      u._okFootBeat = undefined;
      if (high) { u._okFootX = u._okFootZ = undefined; u._okFootBraceLoad = 0; }
      continue;
    }
    // 壁や仲間に詰まって足だけ動く時には、泥も足音も出さない。
    const movedX = high && u._okFootX !== undefined ? u.pos.x - u._okFootX : 0;
    const movedZ = high && u._okFootZ !== undefined ? u.pos.z - u._okFootZ : 0;
    const travelled = Math.hypot(movedX, movedZ);
    if (high) {
      u._okFootX = u.pos.x; u._okFootZ = u.pos.z;
      if (!(u.slipT > 0)) u._okScraped = false;
    }
    // 斬り結ぶ途中と槍衾の後列も、見た目に使う相手・踏ん張りを拾う。
    // 攻撃先がないだけで、実際に踏み直した草鞋の泥と音まで消さない。
    const foe = high ? okFootFoe(u) : u.target;
    const bracing = high && !u.braceInterrupted && u.contactBrace > 0.2;
    // 討ち取った一撃も、振り抜いて草鞋が着くまで続く。
    // 生きた相手が消えた時に、踏み込みの採寸と泥・足音を途中で切らない。
    const strike = high && !u.fleeing && !u.group?.routed && !u.group?.brokenWithdrawalPose &&
      (u.wpnKind === 'spear' || u.wpnKind === 'sword') &&
      u.swing && !u.swing.ranged && !u.swing.bow && u.swing.kind !== 'butt' &&
      u.swing.t <= u.swing.dur + 0.3 ? u.swing : null;
    if ((!high && (u.offscreen || u.moving < 0.25)) ||
        !(u.fleeing || u.group?.routed || high && u.group?.brokenWithdrawalPose || foe?.alive || bracing || strike)) {
      u._okFootBeat = undefined;
      if (high) u._okFootBraceLoad = 0;
      continue;
    }
    // 実際に逃げる者・前で踏ん張る者の場所から、間を空けて声を聞かせる。
    // 足を止めた槍衾と背後の敗走も聞く。声の種類は既存の音に対応している。
    // 同じ兵の連呼を避け、打たれた時や仲間を運ぶ時には掛け声を重ねない。
    const fleeingVoice = !!(u.fleeing || u.group?.routed || u.group?.brokenWithdrawalPose);
    // 押す声の直後に列が崩れた時も、敗走の第一声を八秒以上待たせない。
    // 切り替わりだけ二秒の間を許し、その後の連呼は元の間隔で止める。
    const flightVoiceChange = fleeingVoice && F.meleeVoiceKind === 'push' &&
      rt.t >= F.meleeVoiceSaidAt + 2;
    // 鎧で受けた直後は怯みと足滑りで声を止めている。
    // その一撃だけ短く覚え、踏ん張り直した息へつなぐ。同じ振りで期限を延ばさない。
    const received = foe?.swing, own = u.swing;
    if (high && !fleeingVoice) {
      const receivedAt = received ? received.t - received.dur * (received.at ?? 0.5) : -1;
      if (received?.target === u && !received.ranged && !received.bow &&
          (received.res === 'block' || received.res === 'armor') && receivedAt >= 0 && receivedAt < 0.3 &&
          u._okCaughtSwing !== received) {
        u._okCaughtSwing = received; u._okCaughtFoe = foe; u._okCaughtUntil = rt.t + 0.55;
      }
    }
    // 相手が次の一撃へ移ったら、前の受けを押し返す息として使わない。
    // 記録の期限だけで判定すると、新しい振りかぶりへ古い掛け声が重なる。
    const caught = high && u._okCaughtFoe === foe && received === u._okCaughtSwing &&
      received?.target === u && !foe.atk && rt.t < u._okCaughtUntil;
    const voiceReady = high && (rt.t >= (F.meleeVoiceAt || 0) || flightVoiceChange) &&
        (rt.t >= (u._okVoiceAt || 0) || flightVoiceChange && u._okVoiceKind === 'push') &&
        !u.atk && !u.hit && !u.reload && !u.dragging && !u.dodging && !(u.stagger > 0) &&
        !(u.pinT > A.time) && !(u.confused > 0) && !u.cover && !u.rearWound &&
        !(u.jinchu && !u.jinchu.standing);
    if (voiceReady && !fleeingVoice) {
      const tx = foe?.pos?.x - u.pos.x, tz = foe?.pos?.z - u.pos.z;
      // 肩を掛け直す短い間に息を吐く。構えて待つ間に押す声だけを出さない。
      // 振りかぶりへの備えでは叫ばず、柄や鎧で受け止めた直後だけ息を吐く。
      // 動きを減らす設定でも、攻撃の結果と時計で同じ拍子を拾う。
      // 打ち込んだ柄を止められた側も、その拍子に息を吐く。
      // 振り始めや空振りの声にはせず、受けた側と共通の間隔で一声だけにする。
      const stoppedAt = own ? own.t - own.dur * (own.at ?? 0.5) : -1;
      const stopped = own && own.target === foe && !own.ranged && !own.bow &&
        (own.res === 'block' || own.res === 'armor') && stoppedAt >= 0 && stoppedAt < 0.3;
      const loading = u.contactBrace > 0.25 && !u.braceInterrupted && !u._crouch && !(u.woundRest > 0.1) &&
        (stopped || !own && caught);
      const pressing = !(u.slipT > 0) && (u.wpnKind === 'spear' || u.wpnKind === 'sword') &&
        loading &&
        !u.group?.retreatOnly && foe?.alive && !foe.isStruct && foe.team !== u.team &&
        !foe.fleeing && !foe.group?.routed && !foe.group?.brokenWithdrawalPose &&
        tx * tx + tz * tz < 3.2 ** 2 &&
        tx * Math.sin(u.heading) + tz * Math.cos(u.heading) > Math.hypot(tx, tz) * 0.65 &&
        // 背や脇へ寄った時は、向かい合って押す声を出さない。
        !foe.downed && !foe.woundOut && !foe.dying && !foe.climb &&
        !foe.dragging && !foe.dodging &&
        tx * Math.sin(foe.heading) + tz * Math.cos(foe.heading) < -Math.hypot(tx, tz) * 0.45;
      // 木戸・石垣の向こうの兵を、目の前で押し合う声として鳴らさない。
      // 壁の調べは声を出せる時だけ。段の上下で離れた相手への空の掛け声も避ける。
      if (pressing && Math.abs(u.pos.y - foe.pos.y) < 1.4 && !A.wallBetween(u.pos, -1, foe.pos) &&
          Math.abs(u.pos.y - p.y) < 4 && !A.wallBetween(u.pos, -1, p)) {
        okMeleeVoice(rt, u, false);
      }
    }
    // 押し返されて接地した足を引きずる時は、歩みと別の低い泥跳ねにする。
    // 配置換えの飛びや、止まった足の空振りは足滑りに数えない。
    // 腰が止まる押し合いでも、受けに合わせて草鞋を踏み直すことがある。
    // 骨を測れる者だけ例外にし、足が動かない時は後の接地判定で落とす。
    const human = high && u.human?.root.visible && Number.isFinite(u.human.gaitPhase) ? u.human : null;
    // 腰を支えたまま草鞋だけ擦る受けも測る。動かない支持足は後の採寸で除く。
    const scraping = high && u.slipT > 0 && travelled < elapsed * 8 &&
      (travelled >= 0.025 || human?.bones.LeftFoot && human.bones.RightFoot);
    // 腰を止めた突き・斬りでも前足は踏み込む。技の時計は変えず、
    // 振り出しから戻しまでの短い間だけ、受けと同じ接地の採寸へ渡す。
    const planting = (strike || bracing && !u.atk && !u.swing) &&
      human?.bones.LeftFoot && human.bones.RightFoot && !scraping &&
      (travelled < 0.025 || u.moving < 0.25);
    const strikeStep = planting && strike && u._okFootStrike !== strike;
    // 受ける側だけでなく、肩で押し込む側の荷重も接地待ちへ渡す。
    // 共通の腰位置からの粒は使わず、どちらも実際に下りた草鞋から一度だけ出す。
    const braceLoad = planting && !strike ? u.contactBrace * Math.max(u.contactLoad || 0, u.contactDrive || 0) : 0;
    const braceStep = braceLoad > 0.25 && !(u._okFootBraceLoad > 0.25);
    // 受けを解いた間も記録する。足止めで採寸を休んでも、次の押し返しを拾う。
    if (high && braceLoad <= 0.25) u._okFootBraceLoad = braceLoad;
    if (high && (u.offscreen || !scraping && !planting && travelled < 0.025 || travelled >= elapsed * 8 ||
        !scraping && (!planting && u.moving < 0.25 || u.hit || u.stagger > 0) || u.dragging || u.dodging)) {
      u._okFootBeat = undefined;
      continue;
    }
    // 画面外や打たれた間に、まだ測っていない踏み込みを消費しない。
    if (strikeStep) u._okFootStrike = strike;
    if (high) u._okFootBraceLoad = braceLoad;
    // 骨のある兵は見えている歩きの時計を使う。簡略な体の時計とは速さが異なる。
    const beat = human ? Math.floor(u.human.gaitPhase * 2) : Math.floor((u.anim + (high ? 0 : Math.PI / 2)) / Math.PI);
    const prev = u._okFootBeat, changedBody = u._okFootHuman !== !!human;
    u._okFootHuman = !!human;
    u._okFootBeat = beat;
    if (prev === undefined || changedBody) {
      u._okFootSide = undefined; u._okFootLandUntil = 0; u._okFootGapAt = undefined;
      // 止まってからの再出発や体の切り替えでは、昔の足跡を次の半歩に使わない。
      u._okFootLX = u._okFootLZ = u._okFootRX = u._okFootRZ = undefined;
      u._okFootLAt = u._okFootRAt = undefined;
      u._okFootLiftL = u._okFootLiftR = false;
    }
    // 歩きの時計の切り替わりと、坂へ足が着く瞬間にはずれがある。
    // 骨の足は短く接地を待つ。簡略な兵も二人の枠が空くまで一回分だけ待てる。
    // 採寸が久しぶりの足は、一度目で高さを覚え、次で下りを確かめる。
    // 二回分ちょうどの期限では丸め誤差で最後の採寸を逃すため、半回分の余裕を持たせる。
    // 次の半歩が来た時は、その接地の期限に置き換わる。
    if (high && prev !== undefined && !changedBody && beat !== prev && (human || beat - prev === 1)) {
      u._okFootLandUntil = rt.t + (human ? 0.3 : 0.18);
    }
    // 歩きの時計が止まっていても、一撃や受け始めの一度だけ接地を待つ。
    // 遅い振りでは一律の待ち時間より後に前足が着く。技の残り時間まで採寸を続ける。
    // 新しい合図で、既に待っている接地の期限を縮めない。
    if (braceStep || strikeStep) u._okFootLandUntil = Math.max(u._okFootLandUntil || 0,
      rt.t + (strikeStep ? Math.max(0.42, Math.min(1, strike.dur - strike.t + 0.18)) : 0.42));
    // 骨の歩きは一周で時計が戻り、後ずさりでは逆回りする。どちらも次の接地として扱う。
    const footDue = scraping ? !u._okScraped && rt.t >= (u._okScrapeAt || 0) :
      high ? u._okFootLandUntil > rt.t : prev !== undefined && !changedBody && beat !== prev;
    const measureFeet = human?.bones.LeftFoot && human.bones.RightFoot;
    // 半歩の合図を待つ間も足の高さを覚える。合図の後から測り始めると、
    // 最初の踏み込みや速い逃げ足が着いた瞬間を見落とす。音と粒の枠は増やさない。
    if ((!high && kicked >= kickLimit) || !footDue && !measureFeet) continue;
    const side = (beat % 2 ? -0.16 : 0.16) * (high ? 1 : -1);
    const sx = Math.sin(u.heading), sz = Math.cos(u.heading);
    // 後ずさりや横への押し返しでも、泥は実際の足運びの後ろへ飛ぶ。
    // 目標へ向かう速度ではなく、仲間との押し戻しも含む実際の移動から取る。
    let speed = high ? travelled / elapsed : 0;
    let dx = high && travelled > 0 ? movedX / travelled : sx, dz = high && travelled > 0 ? movedZ / travelled : sz;
    // 調べる間に進んだ分だけ、着いた足は腰の後ろにある。坂でも足の位置から泥を蹴る。
    const stridePhase = u.anim - beat * Math.PI;
    const lag = high && !human && !scraping ? Math.min(travelled, speed * stridePhase / (3 + u.moving * 6), 0.35) : 0;
    let fx = u.pos.x + sz * side - dx * lag, fz = u.pos.z - sx * side - dz * lag, landedSide, footY;
    if (human?.bones.LeftFoot && human.bones.RightFoot) {
      // 近くで接地を待つ足は、泥の二人枠が埋まっても高さを覚える。
      // 採寸まで止めると、密集では前回から間が空き、下りの判定を繰り返し逃す。
      // 毎コマではなく既存の間引きで測り、粒と足音は後で二人までに絞る。
      okFootPosition(human.bones.LeftFoot, OK_FOOT_L);
      okFootPosition(human.bones.RightFoot, OK_FOOT_R);
      const leftGap = OK_FOOT_L.y - W.heightAt(OK_FOOT_L.x, OK_FOOT_L.z);
      const rightGap = OK_FOOT_R.y - W.heightAt(OK_FOOT_R.x, OK_FOOT_R.z);
      // 土の近くでも、上がり始めた足は接地ではない。既存の採寸だけで下りを見分ける。
      // 初回や間の空いた採寸では一度待つ。足滑りも浮き始めた足から泥を出さない。
      const freshGap = u._okFootGapAt !== undefined && rt.t - u._okFootGapAt <= 0.3;
      const sampleTime = rt.t - u._okFootGapAt;
      const leftDX = OK_FOOT_L.x - u._okFootSampleLX, leftDZ = OK_FOOT_L.z - u._okFootSampleLZ;
      const rightDX = OK_FOOT_R.x - u._okFootSampleRX, rightDZ = OK_FOOT_R.z - u._okFootSampleRZ;
      // 坂へ近づいた量と、草鞋を踏み下ろした量を分ける。
      // 登りで土だけが高くなっても、強く踏みつけた音や泥にはしない。
      const leftDown = u._okFootSampleLY - OK_FOOT_L.y, rightDown = u._okFootSampleRY - OK_FOOT_R.y;
      // 登りで腰ごと上がる分を除き、持ち上げている足を踏み下ろしと取り違えない。
      const bodyRise = u.pos.y - u._okFootSampleY;
      // 下りでは足も腰も下がる。腰に対して上げている草鞋を接地と数えず、
      // 踏み下ろす判定と泥の強さを、同じ腰から見た足運びへそろえる。
      const leftPlant = leftDown + bodyRise, rightPlant = rightDown + bodyRise;
      const leftTravel = Math.hypot(leftDX, leftDZ), rightTravel = Math.hypot(rightDX, rightDZ);
      u._okFootSampleLX = OK_FOOT_L.x; u._okFootSampleLZ = OK_FOOT_L.z;
      u._okFootSampleRX = OK_FOOT_R.x; u._okFootSampleRZ = OK_FOOT_R.z;
      u._okFootSampleLY = OK_FOOT_L.y; u._okFootSampleRY = OK_FOOT_R.y;
      u._okFootSampleY = u.pos.y;
      // 草鞋を上げて同じ足跡へ踏み戻す動きも拾う。古い採寸の浮きは持ち越さない。
      const leftLifted = freshGap && u._okFootLiftL;
      const rightLifted = freshGap && u._okFootLiftR;
      const leftDrop = u._okFootLGap - leftGap, rightDrop = u._okFootRGap - rightGap;
      // 接地を待つ合図が無い間に下りた足も、この採寸で浮きの記録を終える。
      // 次の突きや押し返しまで残すと、踏み残した支持足から遅れて泥と音が出る。
      // 今回の接地には上の leftLifted・rightLifted を使い、次回へは持ち越さない。
      if (high) {
        u._okFootLiftL = leftGap > 0.12 && (leftGap > 0.16 || leftLifted);
        u._okFootLiftR = rightGap > 0.12 && (rightGap > 0.16 || rightLifted);
      } else {
        u._okFootLiftL = leftGap > 0.16 || leftLifted;
        u._okFootLiftR = rightGap > 0.16 || rightLifted;
      }
      // 擦る足以外は下りた瞬間だけ。接地後に平らに動く支持足から遅れて泥を出さない。
      const leftLanding = freshGap && (scraping || leftPlant >= -0.005) &&
        (leftDrop >= (scraping ? -0.015 : 0.008) || leftLifted && leftDrop >= 0);
      const rightLanding = freshGap && (scraping || rightPlant >= -0.005) &&
        (rightDrop >= (scraping ? -0.015 : 0.008) || rightLifted && rightDrop >= 0);
      u._okFootLGap = leftGap; u._okFootRGap = rightGap; u._okFootGapAt = rt.t;
      if (!footDue) continue;
      // 片足が段へ埋まっていても、土に着いたもう片足の泥を取りこぼさない。
      // 足滑りでも同じ範囲を使い、深く沈んだ足から泥を出さない。
      // 歩きでも腰だけ進んで草鞋が踏み残る時は、支持足から泥を出し直さない。
      // 浮かせて踏み戻した足か、今回実際に動いた足だけ選ぶ。配置換えの飛びは除く。
      const leftContact = leftLanding && leftGap >= -0.15 && leftGap <= 0.12 &&
        (leftTravel >= 0.018 || !scraping && leftLifted) && leftTravel < sampleTime * 8;
      const rightContact = rightLanding && rightGap >= -0.15 && rightGap <= 0.12 &&
        (rightTravel >= 0.018 || !scraping && rightLifted) && rightTravel < sampleTime * 8;
      if (!leftContact && !rightContact) continue;
      landedSide = leftContact && (!rightContact || leftGap <= rightGap) ? 0 : 1;
      if (scraping && leftContact && rightContact) landedSide = leftTravel >= rightTravel ? 0 : 1;
      // 坂下の足だけを選び続けない。両足が土に近い半歩では、前回と反対の接地を拾う。
      // 高く上がった足や土へ沈んだ足は選ばず、接地を待つ時計と粒数はそのまま使う。
      const nextSide = u._okFootSide === 0 ? 1 : u._okFootSide === 1 ? 0 : landedSide;
      const nextGap = nextSide === 0 ? leftGap : rightGap;
      if (!scraping && (nextSide === 0 ? leftContact : rightContact) && nextGap <= Math.min(leftGap, rightGap) + 0.08) landedSide = nextSide;
      // 押し合いでは同じ足を踏み戻す。支持足の小さな揺れより、
      // 浮かせた足と明らかに強い踏み下ろしを優先し、交互の足音にしない。
      if (!scraping && leftContact && rightContact) {
        if (leftLifted !== rightLifted) landedSide = leftLifted ? 0 : 1;
        else if (Math.abs(leftDown - rightDown) > 0.035) landedSide = leftDown > rightDown ? 0 : 1;
      }
      const foot = landedSide === 0 ? OK_FOOT_L : OK_FOOT_R;
      const gap = landedSide === 0 ? leftGap : rightGap;
      // 持ち上がった足を接地と数えない。短い待ち時間の間に土へ下りるのを待つ。
      if (gap < -0.15 || gap > 0.12) continue;
      // 両足が接地したまま左右の選択だけ替わっても、同じ場所から泥を蹴り直さない。
      // 前に泥を蹴った足跡を左右別に覚え、実際に足を置き直した半歩だけ拾う。
      // 押し戻されて同じ足を踏み直す時も、左右の交互だけを条件にせず移動した足跡で決める。
      const lastX = landedSide === 0 ? u._okFootLX : u._okFootRX;
      const lastZ = landedSide === 0 ? u._okFootLZ : u._okFootRZ;
      const stepX = foot.x - lastX, stepZ = foot.z - lastZ;
      const stepLength = Math.hypot(stepX, stepZ);
      const lifted = landedSide === 0 ? leftLifted : rightLifted;
      if (!scraping && !lifted && lastX !== undefined && stepLength < 0.06) continue;
      // 押し合いも逃げ足も、泥の向きと勢いは同じ接地直前の採寸から取る。
      // 前の足跡からの平均速度では、減速して着いた草鞋も強く泥を蹴ってしまう。
      const contactTravel = landedSide === 0 ? leftTravel : rightTravel;
      if (contactTravel >= 0.018) {
        dx = (landedSide === 0 ? leftDX : rightDX) / contactTravel;
        dz = (landedSide === 0 ? leftDZ : rightDZ) / contactTravel;
        speed = contactTravel / sampleTime;
      } else {
        // 真下に戻る足には、進んだ腰の勢いを横向きの泥として残さない。
        dx = 0; dz = 0; speed = 0;
      }
      // 腰と一緒に坂を下る高さは踏みつけの強さに足さない。
      // 登りでも腰から見て踏み下ろした速さを拾い、足音と泥を実際の半歩へ合わせる。
      const drop = landedSide === 0 ? leftPlant : rightPlant;
      if (!scraping && freshGap && drop > 0 && drop < sampleTime * 4) {
        speed = Math.max(speed, drop / sampleTime);
      }
      fx = foot.x; fz = foot.z; footY = foot.y;
    }
    // 板床や段の縁では、足の下にない土から泥と湿った足音を出さない。
    // 骨の足を測れた時はその高さを使う。急坂では腰の根元と足元の土は同じ高さではない。
    if (high && Math.abs(W.heightAt(fx, fz) - (footY ?? u.pos.y)) > 0.35) continue;
    // 以前の半歩を見て遅れて叫ばず、今着いた草鞋に逃げる息を合わせる。
    // 泥の二人枠には左右されず、声の間隔と遮りの判定は保つ。
    if (voiceReady && fleeingVoice && !scraping && !own &&
        travelled > elapsed * 0.6 && travelled < elapsed * 8 && u.moving > 0.25 &&
        Math.abs(u.pos.y - p.y) < 4 && !A.wallBetween(u.pos, -1, p)) {
      okMeleeVoice(rt, u, true);
    }
    if (high) u._okFootLandUntil = 0;
    if (human) {
      u._okFootSide = landedSide; u._okFootLandUntil = 0;
      if (landedSide === 0) { u._okFootLX = fx; u._okFootLZ = fz; u._okFootLAt = rt.t; u._okFootLiftL = false; }
      else if (landedSide === 1) { u._okFootRX = fx; u._okFootRZ = fz; u._okFootRAt = rt.t; u._okFootLiftR = false; }
    }
    // 枠が埋まった接地も足跡は覚える。音と泥を次の採寸へ持ち越さず、次の半歩を待つ。
    if (kicked >= kickLimit) {
      if (scraping) u._okScraped = true;
      continue;
    }
    kicked++;
    // 次の採寸は最後に泥を出した兵の次から。密集でも先頭の二人へ偏らせない。
    if (high) F.footCursor = (start + i + 1) % Math.max(1, total);
    if (scraping) {
      // 一度の足滑りでは一度だけ。長く押されても、同じ接地から泥を吹き続けない。
      u._okScraped = true;
      u._okScrapeAt = rt.t + 0.45 + (u.id % 4) * 0.04;
      // 引きずった泥は移動先へ低く流す。歩いていないので踏み込む足音は鳴らさない。
      if (!S.reduceMotion) okFootMud(W, fx, fz, -dx, -dz, Math.min(1.4, speed * 0.5), true);
      continue;
    }
    // 踏ん張る半歩は低く、敗走の速い足は強く。粒数と同時人数は増やさない。
    // 柔らかい踏み戻しまで走る足と同じ最低の勢いで泥を噴かない。
    const force = high ? Math.max(planting ? 0.25 : 0.8, Math.min(4.5, speed * 1.2)) : 3;
    if (!S.reduceMotion) {
      if (high) okFootMud(W, fx, fz, dx, dz, force, false);
      else W.kick(fx, fz, dx, dz, 1, force);
    }
    // 雨と泥の足音を斬り合いに混ぜる。全員の足音を一度に重ねない。
    // 声と同じく、木戸越しや離れた段の足音を目の前の接地音にしない。
    // 遮りの調べは実際に鳴らす候補（二人まで）だけで行う。
    if (rt.t >= (F.footSoundAt || 0) && (!high ||
        Math.abs(u.pos.y - p.y) < 4 && !A.wallBetween(u.pos, -1, p))) {
      // 逃げ足は短い間で重く、踏ん張る半歩は長い間で小さく。音数は全体で制限する。
      F.footSoundAt = rt.t + (high ? Math.max(0.28, Math.min(0.75, 0.9 / Math.max(0.5, speed))) : 0.7) + (u.id % 4) * (high ? 0.025 : 0.08);
      const volume = high ? Math.max(planting ? 0.12 : 0.22, Math.min(0.65, (planting ? 0.08 : 0.2) + speed * 0.1)) : u.fleeing || u.group?.routed ? 0.65 : 0.4;
      // 浅瀬は泥の短い接地音ではなく、水を押し分ける既存の音へ替える。
      // 同時に鳴る数と間隔は保ち、音の出所も土または水面へそろえる。
      const ground = high ? W.heightAt(fx, fz) : 0;
      const depth = high ? W.waterFootDepthAt(fx, fz, ground) : 0;
      if (high) OK_FOOT_SOUND.set(fx, ground + depth + 0.03, fz);
      A.play(depth > 0.02 ? 'wade' : 'stepWet', high ? OK_FOOT_SOUND : u.pos, volume);
    }
  }
  if (horse) {
    F.horseCallAt = rt.t + 12 + Math.random() * 17;
    A.play('neigh', horse.pos, 0.4);
  }
  if (walkingHorse) {
    // 雨や泥の響きは既存の合成蹄音が受け持つ。停止中は選ばず、音を重ねない。
    F.horseStepAt = rt.t + (horseSpeed < 2.5 ? 0.96 : 0.48);
    A.play(horseSpeed < 2.5 ? 'hoofWalk' : 'hoofTrot', walkingHorse.pos, 0.35);
    if (rt.t >= (F.horseTackAt || 0)) {
      F.horseTackAt = rt.t + 3;
      A.play('tack', walkingHorse.pos, 0.2);
    }
  }
}

// 新手を出す時だけ人数を数える。死体も数えない。
function cappedList(rt, list) {
  let room = 160; // 後で置く本陣・自分の組・近習の枠を七十五人分空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 行軍のまま味方を通り過ぎず、見える距離で槍を向ける。一秒に一度だけ調べる。
function okChaseTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.chaseCheckAt || 0)) return;
  F.chaseCheckAt = rt.t + 1;
  okChaseWave(rt);
  for (const g of F.chasers) {
    if (sortieBroken(g) || g._okReturning || (g.order !== 'path' && g.order !== 'attack')) continue;
    const c = g.center();
    let foe = null;
    rt.army.forNear(c.x, c.z, 12, (u) => {
      if (!foe && u.team === 0 && u.alive && !u.isStruct && !u.fleeing && !u.woundOut && !u.noTarget &&
        !rt.army.wallBetween(c, 1, u.pos)) foe = u;
    });
    if (!foe) {
      // 槍を返した後も、その場に残らず陣へ追う。道の角は既存の道順を使う。
      if (F.step === 3 && g.order === 'attack' && Math.hypot(c.x - CAMP_LINE.x, c.z - CAMP_LINE.z) > 18) {
        g.order = 'path'; g.march = true; g.formation = 'column'; g.colW = 2;
        g.path = downRoad(g, [CAMP_LINE.x, CAMP_LINE.z - 10]); g.pathIdx = 0;
        g.onArrive = (q) => { q.order = 'attack'; q.anchor = q.center(); q.formation = 'yari'; q.width = 6; q.aggro = 18; q.seekRange = 28; };
      }
      continue;
    }
    // 追いついた城兵が一度だけ声を上げる。実際の位置から鳴らし、壁越しには警告しない。
    // 波ごとの声を重ねず、既存の一秒刻みの見回りで確かめる。
    // 退き太鼓と復唱の後に声・警告札をそろえる。接敵や斬り合いは待たせない。
    // 合図中は未発声のままにし、次の見回りで近くに健在な追っ手がいれば知らせる。
    if (!g._okChaseCalled && rt.t >= (F.chaseVoiceAt || 0) &&
        rt.t >= Math.max(F.signalQuietUntil || 0, F.sortieVoiceUntil || 0,
          F.nearVoiceUntil || 0, F.wetGunUntil || 0)) {
      const caller = okSortieVoice(rt, g, 0.55, true);
      if (caller) { g._okChaseCalled = true; F.chaseVoiceAt = rt.t + 12; }
      if (caller) {
        F.chaseVoiceUntil = rt.t + 6;
        rt.say('組頭', F.step === 3
          ? '追っ手の声じゃ！　槍を返せ。組を守りながら陣へ退け！'
          : '追っ手の声じゃ！　坂の旗で槍を返せ。先に退く組を守れ！', 4);
      }
    }
    if (g.order === 'attack') continue;
    g.order = 'attack'; g.march = false; g.onArrive = null;
    g.anchor.x = c.x; g.anchor.z = c.z;
    g.formation = 'yari'; g.width = 6; g.aggro = 18; g.seekRange = 28;
  }
}
// 二十四秒ごとに控えの小勢を木戸から出す。全体で二百三十五人まで。
function okChaseWave(rt) {
  const F = rt.flags;
  if (rt.t < F.chaseAt || F.chaseLeft <= 0) return;
  F.chaseAt = rt.t + 24;
  let active = 0;
  const p = rt.player.u.pos;
  for (const g of F.chasers) if (!sortieBroken(g) && !g._okReturning) {
    const c = g.center();
    if (Math.hypot(c.x - p.x, c.z - p.z) <= 28) active++;
  }
  if (active >= 2) return;
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  if (room <= 0) return;
  const reserve = F.gateReserve;
  const pts = reserve.light.take(reserve.pos.x, reserve.pos.z, Math.min(6, room, F.chaseLeft, reserve.lightCount()), 1e9,
    null, (x, z) => rt.world.walkable(x, z));
  if (!pts.length) return;
  reserve.nominal -= pts.length; F.chaseLeft -= pts.length;
  const g = enemyGroup(rt, { fixed: true, faction: 'kitabatake', name: '搦手からの追っ手',
    anchor: { x: reserve.pos.x, z: reserve.pos.z }, facing: 0, width: 3, colW: 2, spacing: 1.1,
    fleeDir: { x: 0, z: -1 }, formation: 'column', aggro: 6 },
  okDress(pts.map((p) => ({ type: 'ashigaru', n: 1, o: { x: p.x, z: p.z, heading: p.yaw } })), KITABATAKE));
  g._sortieSent = true; g.march = true; g.order = 'path'; g.speed = 2.8;
  g.path = F.step === 2.5 ? [[0, -68], [0, -52], [FRONT.x, FRONT.z]] :
    [[0, -68], [0, -52], [MAE_C.x, MAE_C.z],
      ...KARAMETE_WAY.slice(0, -1).reverse(), [CAMP_LINE.x, CAMP_LINE.z - 10]];
  g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.width = 6; q.aggro = 18; q.seekRange = 28; };
  F.sorties.push(g); F.chasers.push(g);
  F.gates.karamete._openNow(false);
}
function wallStop(b, inp) {
  const p = b.player, u = p.u;
  if (inp.k.has('KeyW') && u.pos.z < GATE.z + 3 && Math.cos(p.yaw) < 0) inp.k.delete('KeyW');
}
function sendSortie(rt, g, to) {
  if (!g || gone(g)) return;
  rt.flags.gates.karamete._openNow(false);
  g._sortieSent = true; g._okReturning = false; g.calm = false; g.order = 'path'; g.formation = 'column';
  // 長い二列の尾を曲輪の奥へ残さず、味方の退きと同じ三列・歩幅で坂を通る。
  g.colW = 3; g.spacing = 1.1; g.roadColumn = true; g.followColumnRoad = true;
  g.march = true; g.speed = 2.6; g.aggro = 6;
  g.focus = null; g.assault = null; g.retreatOnly = false; g.dest = null;
  g.path = to.z > -24 ? [[0, -68], [0, -52], [MAE_C.x, MAE_C.z],
    ...ROAD_KARAMETE.slice(3, 6).reverse(), ...SOUTH_ROAD.slice(1, 3), [to.x, to.z]] : [[0, -68], [0, -52], [to.x, to.z]];
  // 最初の折れでも後列が実際に通った道を持つ。
  g.path.unshift([g.anchor.x, g.anchor.z]);
  g.pathIdx = 0;
  for (const u of g.units) u.noTarget = false;
  // 敵の要は戦いながら動く。旗の位置を共有すると、敵の前進で
  // 南の持ち場まで動き、元の柵に残る味方が合流人数から外れてしまう。
  g.onArrive = (q) => { q.order = 'attack'; q.march = false; q.anchor = { x: to.x, z: to.z }; q.formation = 'yari'; q.width = 8; q.aggro = 18; q.seekRange = 28; };
}
// 崩れた小勢を一人ずつ探させない。残兵は帰城させる。
function sortieBroken(g) {
  return gone(g) || g.count <= 2 || g.units.every((u) => !u.alive || u.fleeing || u.woundOut);
}
function returnSortie(g) {
  g._okReturning = true; g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 3;
  // 二人まで減った組も整列し直す姿にせず、肩をすぼめて長柄を抱えて退く。
  // 姿と足元だけの印。個人の敗走・士気・足の速さ・帰城の道順は変えない。
  g.brokenWithdrawalPose = S.quality === 'high';
  g.roadColumn = true; g.followColumnRoad = true;
  // 帰城の下知を交戦や共通の前進判断で上書きしない。坂の道を歩いて離脱する。
  g.retreatOnly = true; g.historicalOrders = true; g.focus = null; g.assault = null;
  for (const u of g.units) u.target = null;
  const p = g.center(), q = { x: 0, z: 0, s: 0, d: 0 };
  const way = p.x > 20 && p.z > -24 ? SOUTH_FROM_FRONT : KARAMETE_WAY;
  karametePoint(p, q, null, null, way);
  const road = way === SOUTH_FROM_FRONT ? way.slice(0, Math.floor(q.s) + 1).reverse() : way.slice(Math.ceil(q.s));
  g.path = p.z < GATE.z + 1 ? [[0, -68], [0, -87]] :
    [[q.x, q.z], ...road, [0, -52], [GATE.x, GATE.z], [0, -68], [0, -87]]; g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.brokenWithdrawalPose = false; q.aggro = 0; q.calm = true; for (const u of q.units) { u.target = null; u.noTarget = true; } };
}
function okReliefGroup(groups) {
  for (const g of groups) {
    if (gone(g)) continue;
    // 三人は柵で合わせる人数。各組にも三人を求めると、一、二人ずつ
    // 生き残った組を呼べず、合計では足りても交代まで待たせてしまう。
    for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.dropped && !u.noTarget &&
      (u.type === 'ashigaru' || u.type === 'samurai')) return g;
  }
  return null;
}
// 最後に下知した組だけでなく、先に向かっている組も到着待ちに含める。
function okReliefComing(C, groups = C.reliefSent) {
  for (const g of groups) {
    if (gone(g) || g.order !== 'path') continue;
    for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.dropped && !u.noTarget &&
        (u.type === 'ashigaru' || u.type === 'samurai')) return true;
  }
  return false;
}
// 人数は本人との距離ではなく柵の持ち場で数える。残兵を追って持ち場から離れさせない。
// 下知できる組がない時は、来ない援けを待たせず、既存の交代期限を知らせる。
function okShortLineOrder(rt, C) {
  if (okReliefComing(C) || okReliefComing(C, rt.flags.lineGroups)) return '援けの組が向かう。柵の旗で待て';
  if (okReliefGroup(C.reliefGroups)) return '援けを呼ぶ。柵の旗で待て';
  if (C.shortLineThreat) return '援けは来ない。柵で城兵を押し返せ';
  return `柵で交代を待て。あと${Math.max(0, Math.ceil(407 - rt.t))}秒`;
}
// 判定の縁を一瞬出ても、破られかけた守りは元に戻らない。
// 槍が三人そろうか敵を押し返して、二秒保った時だけ猶予を戻す。
function okShortLineTick(C, near, line, foes, dt) {
  C.shortLineThreat = near && line < 3 && foes > 0;
  if (line >= 3 || foes === 0) {
    C.shortLineSafeT += dt;
    if (C.shortLineSafeT >= 2) C.shortLineT = 0;
  } else {
    C.shortLineSafeT = 0;
    if (C.shortLineThreat) C.shortLineT += dt;
  }
}
// 隣の折り返し道や切岸の上は、同じ持ち場に着いた扱いにしない。
// 任務と案内が同じ平場・範囲を見て、到着後に引き返す印を出さない。
function okAtSouthLine(rt) {
  const p = rt.player.u.pos;
  return Math.hypot(p.x - SOUTH_BLOCK.x, p.z - SOUTH_BLOCK.z) <= 18 &&
    Math.abs(p.y - rt.world.heightAt(SOUTH_BLOCK.x, SOUTH_BLOCK.z)) <= 3;
}
// 柵の列の端で出会った兵も、実際の間合いで行軍をやめる。
// 旗から八歩に入るまで待つと、十八歩の持ち場を守る槍に道をふさがれる。
function okSortieContact(rt, g, at, radius) {
  if (g._okContactAt > rt.t) return false;
  g._okContactAt = rt.t + 0.5;
  const holdY = rt.world.heightAt(at.x, at.z);
  for (const u of g.units) {
    if (!u.alive || u.dying || u.gone || u.fleeing || u.woundOut || u.dropped || u.noTarget ||
        Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > radius + 6) continue;
    let contact = false;
    rt.army.forNear(u.pos.x, u.pos.z, 6, (v) => {
      if (contact || v.team !== 0 || !v.alive || v.dying || v.gone || v.isStruct || v.fleeing ||
          v.woundOut || v.dropped || v.noTarget ||
          !(v.isPlayer || rt.flags.lineGroups.includes(v.group)) ||
          Math.hypot(v.pos.x - at.x, v.pos.z - at.z) > radius ||
          Math.abs(v.pos.y - holdY) > 3 || Math.abs(u.pos.y - v.pos.y) > 3 ||
          Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) > 6 ||
          rt.army.wallBetween(u.pos, 1, v.pos)) return;
      contact = true;
    });
    if (contact) return true;
  }
  return false;
}
function okHold(o) {
  return { kind: 'hold', max: Infinity,
    start(rt, C) {
      C.at = C.goal = o.at; C.botRadius = o.r; C.inT = 0; C.dangerT = 0; C.groups = o.groups; C.joinedLine = false; C.clearT = 0;
      C.shortLineT = 0; C.shortLineSafeT = 0; C.shortLineThreat = false;
      C.reliefWaitT = 0; C.reliefGroup = null; C.engagedHoldT = 0; C.repelling = false;
      C.quietHoldT = 0;
      // 竹束の組が崩れた場合は、帰陣先で待つ退路守りの生き残りへ下知する。
      // 候補は開始時だけ用意し、死傷者の補充や敗走の取り消しはしない。
      C.reliefGroups = o.sortie ? [rt.flags.ram, rt.flags.taki] : [];
      C.reliefSent = [];
      if (o.sortie && !gone(rt.flags.blockGuard)) {
        const g = rt.flags.blockGuard;
        g.calm = false; g.focus = null; g.assault = null; g.retreatOnly = false;
        // 初めからここを守る番を、同じ地点への行軍で切岸へ広げない。
        // 生き残りだけが持ち場を保つ。死者・敗走した組は補わない。
        g.order = 'hold'; g.path = null; g.dest = null; g.onArrive = null;
        g.anchor.x = o.at.x; g.anchor.z = o.at.z + 6; g.facing = Math.PI;
        // 坂を登って迎撃すると、旗に着いた本人から高低差で離れてしまう。
        // 番は平場の列で受け、目前の城兵にだけ槍を向ける。
        g.formation = 'yari'; g.yariRanks = 3; g.spacing = 1.1; g.aggro = 3;
      }
      rt.banner(o.sortie ? '翌朝、南の柵へ' : o.title, o.sortie ? '夜攻めは終わった。番の組と兵糧の道をふさげ' : '旗の下で槍をそろえよ');
      rt.obj('dp', o.obj, 'main', true);
      rt.marker('dp', o.at, o.title, { h: 3, guidePriority: 100, guideAlways: true, alwaysDistance: true,
        // 到着の案内は、守備時間を数える持ち場の範囲にそろえる。
        // 切岸の上からは、下の道案内で平場まで誘導する。
        ...(o.sortie ? { guideArea: 'hold', guideRadius: o.r, guideFlag: true } : {}),
        hideNear: o.sortie ? o.r : 6, hideOnArrival: true });
      rt.zone('dp', o.at.x, o.at.z, o.r);
      for (let i = 0; i < 3; i++) {
        const g = [rt.flags.niwa, rt.flags.ikeda, rt.flags.inaba][i];
        if (gone(g)) continue;
        g.calm = false; g.order = 'move'; g.retreatOnly = false; g.focus = null; g.assault = null;
        // 柵の口は十二歩の幅。横に三手を並べず、道の後ろへ縦に並ぶ。
        // 番の組は三十二歩の所。後続の組と同じ列を取り合わない。
        g.dest = o.sortie ? { x: SOUTH_BLOCK.x, z: SOUTH_BLOCK.z + (i ? (i + 1) * 6 : 0) } : { x: o.at.x + (i - 1) * 10, z: o.at.z + 5 };
        if (o.sortie) {
          g.order = 'path'; g.path = blockRoad(g, g.dest); g.pathIdx = 0;
          g.noPursue = true;
          // 三列で尾を短くし、到着後も四人幅以内で段を重ねる。
          // 槍衾では width より yariRanks が優先される。
          g.spacing = 1.1; g.yariRanks = Math.max(3, Math.ceil(g.initial / 4));
          g.formation = 'column'; g.colW = 3; g.roadColumn = true; g.speed = 2.6;
        }
        g.facing = Math.PI;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.formation = 'yari'; if (o.sortie) q.width = 4; q.aggro = o.sortie ? 3 : 12; };
      }
      if (o.sortie) {
        rt.after(14, () => {
          if (rt.over || rt.flags.ending || rt.flags.step !== 4 || rt.flags.dp?.cur !== C || !rt.flags.dp.on) return;
          const g = o.groups[0];
          if (gone(g)) return;
          // 控えの三列を保って木戸へ寄る。通常の移動で列を広げ、後列を柵へ残さない。
          g.order = 'path'; g.dest = null; g.formation = 'column';
          g.colW = 3; g.spacing = 1.1; g.roadColumn = true; g.followColumnRoad = true;
          g.path = [[g.anchor.x, g.anchor.z], [0, g.anchor.z], [0, -68]]; g.pathIdx = 0;
          g.onArrive = (q) => { q.order = 'hold'; };
          if (sightPoint(rt, g.center())) rt.bark('木戸へ城兵の旗！　道を固めよ');
        });
        rt.after(22, () => {
          okBlockSortie(rt, C, o.groups[0], o.at);
        });
      }
    },
    tick(rt, C, m, ctx, el, dt) {
      const p = rt.player.u.pos, near = o.sortie ? okAtSouthLine(rt) : Math.hypot(p.x - o.at.x, p.z - o.at.z) <= o.r;
      const holdY = o.sortie ? rt.world.heightAt(o.at.x, o.at.z) : 0;
      let foes = 0, sortieFoes = 0, friends = 0, line = 0, closeFoe = null, closeD = 18;
      rt.army.forNear(o.at.x, o.at.z, o.r, (u) => {
        if (!u.alive || u.dying || u.gone || u.isStruct || u.fleeing || u.woundOut || u.dropped || u.noTarget) return;
        if (o.sortie && Math.abs(u.pos.y - holdY) > 3) return;
        if (u.team === 1) {
          foes++;
          if (o.groups.includes(u.group)) {
            sortieFoes++;
          }
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          // 木戸の内の弓や壁越しの兵へ、振り向く案内を出さない。
          if (d < closeD && u.pos.z > GATE.z + 0.8 && !rt.army.wallBetween(p, 0, u.pos)) { closeFoe = u; closeD = d; }
        } else { friends++;
          // 印が示す持ち場の中の槍を数える。字のない小さな長方形を別の合流条件にしない。
          if (!u.isPlayer && u.group && !u.group.routed && (u.type === 'ashigaru' || u.type === 'samurai') && (u.group.order === 'hold' || u.group.order === 'attack' || u.group.order === 'move' || o.sortie && u.group.order === 'path')) line++;
        }
      });
      C.lineCount = line;
      const angle = closeFoe ? Math.atan2(closeFoe.pos.x - p.x, closeFoe.pos.z - p.z) - rt.player.yaw - (rt.player.camYawOff || 0) : 0;
      // 先頭が柵の列に触れたら槍を返す。全員の整列を待つと、味方に
      // ふさがれた縦隊が行軍のまま詰まり、出撃を受けた時間も進まない。
      if (o.sortie && C.sortieReleased && line >= 3) {
        for (const g of o.groups) if (g.order === 'path' && !g._okReturning && !sortieBroken(g) &&
            okSortieContact(rt, g, o.at, o.r)) {
          g.order = 'attack'; g.march = false; g.path = null; g.dest = null; g.onArrive = null;
          // 出会った場所で槍を向ける。要を旗へ飛ばして後列を守備兵の中へ引かない。
          const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.formation = 'yari';
          g.width = 4; g.yariRanks = Math.max(3, Math.ceil(g.initial / 4));
          g.aggro = 18; g.seekRange = 28;
        }
      }
      const face = closeFoe ? `${Math.cos(angle) > 0.5 ? '前' : Math.cos(angle) < -0.5 ? '後ろ' : Math.sin(angle) > 0 ? '左' : '右'}の城兵へ槍を向けよ` : '味方と槍をそろえよ';
      // 城兵は初めから木戸に控える同じ組。兵や死傷者は補わない。
      // 番の組が構えたら出撃する。本人を待ってから長い坂を下らせると、
      // 到着の遅れだけで封鎖の期限を使い切ってしまう。
      if (o.sortie && !C.sortieReleased && el >= 22 && line >= 3) {
        okBlockSortie(rt, C, o.groups[0], o.at);
      }
      // 十人の番だけになってから損害を待つと、坂を来る援けが間に合わない。
      // 番の人数まで減った時か、城兵が道を来る間に既存の控えへ下知する。
      if (o.sortie) okShortLineTick(C, near, line, foes, dt);
      if (o.sortie && (line <= 10 || C.sortieReleased && !C.engaged)) {
        C.reliefWaitT += dt;
        // 夜攻めから戻った二組の生き残りを、それぞれ一度だけ番へ回す。
        // 新しい兵や死者を足さず、既存の坂道から合流させる。
        // 本人が着くまで援けを待たせない。帰陣中から不足を見て道を進ませる。
        // 先の組が坂で遅れても、次の組への下知を止めない。
        // 各組は候補から一度だけ外すので、同じ組の道順を毎回作り直さない。
        if (C.reliefWaitT >= 8) {
          const g = okReliefGroup(C.reliefGroups);
          if (g) {
            C.reliefGroup = g; C.reliefWaitT = 0;
            C.reliefGroups.splice(C.reliefGroups.indexOf(g), 1);
            C.reliefSent.push(g);
            g.calm = false; g.retreatOnly = false; g.focus = null; g.assault = null;
            // 番の三段のすぐ後ろへ続き、番と同じ持ち場を奪い合わない。
            g.dest = { x: o.at.x, z: o.at.z + (g === rt.flags.ram ? 9 : 13) };
            g.order = 'path'; g.path = blockRoad(g, g.dest); g.pathIdx = 0;
            g.formation = 'column'; g.colW = 3; g.roadColumn = true; g.speed = 2.6;
            g.noPursue = true; g.spacing = 1.1; g.yariRanks = 3; g.aggro = 3;
            g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.facing = Math.PI; q.formation = 'yari'; };
            if (!rt.flags.lineGroups.includes(g)) rt.flags.lineGroups.push(g);
            // 応援を呼ぶ二声は柵の持ち場から。退き太鼓や、城へ進む早打ちと分ける。
            const reliefName = g === rt.flags.ram ? '竹束の組' : '滝川の組';
            // 援軍はすぐ道へ出し、音・台詞・札だけを先の合図の後へそろえる。
            const announce = () => {
              const F = rt.flags;
              if (rt.over || F.ending || F.step !== 4 || F.dp?.cur !== C || !F.dp.on || C.repelling || gone(g)) return;
              // 城兵の警告を聞き終えてから集合を伝える。兵の合流自体は止めない。
              const wait = Math.max(F.signalQuietUntil || 0, F.sortieVoiceUntil || 0) - rt.t;
              if (wait > 0) { rt.after(wait + 0.1, announce); return; }
              // 空の旗元から吹かず、柵の番か、近くに残る健在な味方が呼び集める。
              const cue = okSignal(rt, 'atsumare', okCommandAt(rt, F.blockGuard, o.at), 0.7);
              // 二声が終わってから、呼ばれた竹束の組が声を返す。次の下知へ持ち越さない。
              rt.after(6.3 + F.signalDelay, () => {
                const F = rt.flags;
                if (rt.over || F.ending || F.step !== 4 || F.signalCue !== cue || F.dp?.cur !== C || !F.dp.on || C.repelling || gone(g)) return;
                okReply(rt, g, 'fukusho', 0.45);
              });
              rt.obj('dp', `集まれの法螺：${reliefName}と、南の柵で槍をそろえよ`, 'main', true);
              okHoldSignal(rt, C, `長い法螺二声は集まれ。${reliefName}の返事を聞き、南の柵で槍をそろえよ`, ASSEMBLY_LISTEN);
              rt.say('組頭', `長い法螺二声は集まれじゃ！　${reliefName}、声を返して南の番へ回れ。ほかの者は柵の旗で槍をそろえよ`, okSignalListen(rt));
            };
            announce();
          }
        }
        // 三人そろわないまま「戻れ」だけを繰り返さず、守りが破れるまでの猶予を示す。
        // 本人が柵の旗で守っている間は、味方の槍の数だけで負けにしない（bot 10/26）。四百七秒の締めで和睦へ進む。
        if (C.shortLineT >= 60 && !near) {
          rt.def.lose(rt, '南の番の槍が足りず、柵の口を守れなかった', true);
          return false;
        }
      } else { C.reliefWaitT = 0; }
      const held = near && foes <= friends && friends > 0 && line >= 3;
      C.holding = held;
      if (held) C.inT += dt;
      // 兵糧攻めは道を保つ任務。敵が来ないだけで守り手を敗北させない。
      // 二分二十秒まで待ち、七十五秒は実際に列を保った時だけ完了する。
      // 近くへ来た出撃兵がいる間は、従来の迎撃と帰城の判定を使う。
      let approaching = false;
      if (o.sortie && !C.engaged) for (const g of o.groups) for (const u of g.units) {
        if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
            Math.hypot(u.pos.x - o.at.x, u.pos.z - o.at.z) <= o.r + 12) approaching = true;
      }
      C.quietHoldT = o.sortie && C.sortieReleased && held && !C.engaged && !approaching && !foes ? C.quietHoldT + dt : 0;
      // 一度崩れて帰城中の小勢が、帰り道で士気を戻しても寄せ直しにはしない。
      // 未出撃・行軍中の城兵は、これまでどおり押し返した扱いにしない。
      const clear = o.groups.every((g) => sortieBroken(g) || o.sortie && g._okReturning);
      if (o.sortie && sortieFoes > 0) C.engaged = true;
      // 番の槍が旗の外で出撃組を受けても、実際の打ち合いを数える。
      // 円の外で生き残った城兵が止まると「来るまで待て」のまま期限になる。
      // 遠くの別働隊や、狙っただけの兵は交戦としない。
      if (o.sortie && C.sortieReleased && !C.engaged) {
        for (const g of o.groups) if (!g._okReturning) for (const u of g.units) {
          const v = u.target;
          if (u.alive && !u.dying && !u.fleeing && !u.woundOut && v?.alive && v.team === 0 &&
              (v.isPlayer || rt.flags.lineGroups.includes(v.group)) &&
              (u.atk || u.swing || v.atk || v.swing) &&
              Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= 6 &&
              !rt.army.wallBetween(u.pos, 1, v.pos)) C.engaged = true;
        }
      }
      // 旗の外で出撃組を崩しても、押し返した働きを数える。
      // 未出撃や行軍中、無傷の帰城だけでは達成にしない。
      if (o.sortie && C.sortieReleased && o.groups.every((g) => g._sortieSent && sortieBroken(g))) C.engaged = true;
      // 城兵を倒し尽くす任務ではない。実際に寄せを受けた列が持ちこたえたら、
      // 有限の出撃組は帰城する。退く姿と、持ち場から離れた事を確かめて終える。
      if (o.sortie && held && C.engaged) C.engagedHoldT += dt;
      if (o.sortie && !C.repelling && held && C.inT >= o.dur && C.engagedHoldT >= 35) {
        C.repelling = true;
        for (const g of o.groups) if (!gone(g) && !g._okReturning) returnSortie(g);
        // 退くのは城兵。味方には退き太鼓ではなく、列を保つ鉦二つを伝える。
        const stopPursuit = () => {
          const F = rt.flags;
          if (rt.over || F.ending || F.step !== 4 || F.dp?.cur !== C || !F.dp.on) return;
          // 帰城はすぐ始め、集合の二声と返事を聞き終えてから追撃禁止を伝える。
          const wait = Math.max(F.signalQuietUntil || 0, F.sortieVoiceUntil || 0) - rt.t;
          if (wait > 0) { rt.after(wait + 0.1, stopPursuit); return; }
          okStopSignal(rt, F.blockGuard, 0.7);
          rt.obj('dp', '止まれの鉦：城兵を追わず、南の柵の旗で列を保て', 'main', true);
          okHoldSignal(rt, C, '鉦二つは止まれ。声を返し、城兵を追わず柵の列を保て', 3.5);
          rt.say('組頭', '鉦二つは止まれじゃ！　声を返せ。城兵を追うな。柵の旗で列を保て', okSignalListen(rt));
        };
        stopPursuit();
      }
      // 封鎖は持ち場を守る任務。追っ手が引いた後に城内まで追わせない。
      // 受け持った出撃組が持ち場から退いたかを見る。別方面の兵が一人近いだけで
      // 帰城の見届けを永久に戻さない。全敵への人数の優劣は held で引き続き見る。
      if (o.sortie) C.clearT = held && sortieFoes === 0 && C.repelling ? C.clearT + dt : 0;
      const repelled = o.sortie && C.repelling && C.inT >= o.dur && C.clearT >= 12;
      // 残る城兵がいる間は七十五秒。押し返した組が崩れた時だけ三十五秒へ縮める。
      // 札の残り時間も、下の完了判定と同じ条件で数える。
      const holdTime = o.sortie && C.engaged && clear ? 35 : o.dur;
      C.holdLeft = Math.max(0, Math.ceil(holdTime - C.inT), o.sortie && !clear ? Math.ceil(35 - C.engagedHoldT) : 0);
      const deadline = o.sortie ? Math.max(0, Math.ceil(407 - rt.t)) : Infinity;
      const deadlineText = deadline <= 45 ? `。交代まで${deadline}秒` : '';
      const place = o.sortie ? '南の柵の口の列' : '坂の退き口の列';
      // 退路守りで列が崩れたら退きへ移る。帰陣前に戦を失敗で閉じない。
      if (rt.flags.step === 2.5) {
        if (!held) C.dangerT = (C.dangerT || 0) + dt; else C.dangerT = 0;
      } else {
        // 帰陣から列へ向かう間は「崩れた列」にしない。合流してから実際の崩れを見る。
        // 合流できないまま待ち続けた場合は、封鎖の既存の期限で交代になる。
        if (near && line >= 3) C.joinedLine = true;
        // 下知済みの生存者が道を来る間は、上の六十秒の合流猶予を使う。
        // 十秒の崩壊判定を重ねて、到着する前に敗北させない。
        const reliefComing = o.sortie && line < 3 &&
          (okReliefComing(C) || okReliefComing(C, rt.flags.lineGroups));
        if (reliefComing) C.dangerT = 0;
        else if (C.joinedLine && okLineDanger(rt, C, o.at, o.r, 'dp', dt, place)) return false;
      }
      if (!C.dangerT && rt.flags.step !== 2.5) {
        const left = Math.max(0, Math.ceil(holdTime - C.inT));
        // 列を守る時間と、城兵の寄せを受けてからの時間の両方が要る。
        // 後の条件が残るのに「あと零秒」としたり、帰城前に「引いた」と告げない。
        const repelLeft = Math.max(left, Math.ceil(35 - C.engagedHoldT), 0);
        const order = !near ? '坂道で柵の旗へ進め。番の組と合流せよ' :
          line < 3 ? `槍の仲間 ${line}人／三人。${okShortLineOrder(rt, C)}` :
          foes > friends ? `旗の味方${friends}人・敵${foes}人。${face}。味方の列へ寄れ` :
          C.repelling ? (sortieFoes ? '城兵は帰城中。追わず柵の列を守れ' : `帰城を見届けよ。あと${Math.max(0, Math.ceil(12 - C.clearT))}秒`) :
          !C.engaged && o.sortie && !clear ? `味方${line}人。城兵に備えよ。交代まで${deadline}秒` :
          !clear && C.engaged ? `${face}。柵であと${repelLeft}秒守れ` :
          left ? `槍の仲間 ${line}人。柵の列を守れ。あと${left}秒` : '守る時間は満たした。柵で城兵を押し返せ';
        // 待機の文には交代時刻を含めた。残り四十五秒でも同じ秒数を二度並べない。
        rt.objProgress('dp', order + (!C.engaged && o.sortie && !clear && near && line >= 3 && foes <= friends && !C.repelling ? '' : deadlineText));
      }
      if (o.sortie && near && line < 3 && !C.dangerT) {
        const danger = foes > 0 ? `。あと${Math.max(0, Math.ceil(60 - C.shortLineT))}秒で守りが破れる` : '。槍が三人そろうまで、守る時間は進まない';
        rt.objProgress('dp', `槍の仲間 ${line}人／三人${danger}${deadlineText}`);
      }
      // 列の危険や目前の敵の案内を優先し、安全な間だけ合図の説明を保つ。
      if (o.sortie && !C.dangerT && !closeFoe && foes <= friends &&
          rt.t < C.signalUntil && C.signalCue === rt.flags.signalCue)
        rt.objProgress('dp', line >= 3 ? C.signalText : `${C.signalText}。番の組のそばで合流せよ`);
      if (rt.flags.step === 2.5) {
        const F = rt.flags;
        let backAlive = 0, backArrived = 0;
        let returned = true;
        for (const g of F.backGroups) {
          if (gone(g)) continue;
          let alive = 0, near = 0;
          for (const u of g.units) if (u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut) {
            alive++;
            if (Math.hypot(u.pos.x - CAMP.x, u.pos.z - (CAMP.z - 16)) < 24) u._okBackReturned = true;
            if (u._okBackReturned) near++;
          }
          backAlive += alive; backArrived += near;
          if (near < Math.ceil(alive * 0.6)) returned = false;
        }
        // 城兵を押し返し、先の組が抜けたら待ちを短くする。時間切れだけでは手柄にしない。
        C.returned = returned;
        C.secured = held && returned && C.inT >= (clear ? 35 : o.dur);
        const left = Math.max(0, Math.ceil((clear ? 35 : o.dur) - C.inT));
        const waitLeft = Math.max(0, Math.ceil(o.limit - el));
        const order = !near ? '坂の旗へ戻れ' : line < 3 ? `槍の仲間 ${line}人／三人。味方のそばへ` : foes > friends ? face :
          !returned ? `陣へ${backArrived}／${backAlive}人。あと${waitLeft}秒、坂の旗を守れ` :
          left ? `先の組は抜けた。あと${Math.min(left, waitLeft)}秒守れ` : '先の組は抜けた。退き太鼓を待て';
        rt.objProgress('dp', C.dangerT ? `${order}。あと${Math.max(0, Math.ceil(10 - C.dangerT))}秒で退く` : order);
        // 鉦と復唱が鳴る間は下知を札にも残す。近い敵や列の危険は先に伝える。
        if (near && !C.dangerT && !closeFoe && foes <= friends &&
            rt.t < C.signalUntil && C.signalCue === F.signalCue)
          rt.objProgress('dp', C.signalText);
        // 殿でも追っ手の合成音と下知を札にそろえる。列の危険は優先する。
        if (!C.dangerT && rt.t < (F.chaseVoiceUntil || 0))
          rt.objProgress('dp', '追っ手の声！　坂の旗で槍を返し、先に退く組を守れ');
        return C.dangerT >= 10 || el >= o.limit || C.secured;
      }
      // 実際に城兵を止め、列を固めたら封鎖完了。新手が来ていない間は早送りしない。
      if (o.sortie && rt.t >= 227 && el >= 140 && C.quietHoldT >= o.dur) {
        rt.say('組頭', '交代じゃ。道は守り通した。囲みを続けよ', 4);
        return true;
      }
      return (!o.sortie || rt.t >= 227) && held && (C.repelling ? repelled : clear) && (!o.sortie || C.sortieReleased && C.engaged) && C.inT >= holdTime;
    },
    end(rt, C) {
      const earned = o.sortie || C.secured;
      if (earned) rt.objDone('dp'); else rt.objRemove('dp');
      rt.unmark('dp'); rt.unzone('dp');
      if (rt.flags.step === 2.5) rt.flags.backHeld = !!C.secured;
      if (o.sortie) {
        rt.flags.blockHeld = true;
        for (const g of o.groups) if (!gone(g)) returnSortie(g);
      }
      if (earned) rt.award((t) => t.side.push(o.reward), o.reward);
    },
  };
}

// 高の総勢は史料解説による開戦時の推定。全軍の残数と局地戦の討死を混ぜない。
okawachi.force = (rt) => {
  if (S.quality === 'high') return OKAWACHI_FORCE_ESTIMATE;
  const F = rt.flags;
  return { a: Math.max(0, ODA_FORCE - (F.ak || 0)), a0: ODA_FORCE, b: Math.max(0, KITABATAKE_FORCE - (F.ek || 0)), b0: KITABATAKE_FORCE };
};
// 三重県の解説でも織田五万・北畠七〜八千と幅がある。兵数を確定値に見せない。
// https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
okawachi.sides = { a: { name: '織田軍（兵数は推定）', mon: 'oda' }, b: { name: '北畠軍（兵数は推定）', mon: 'kitabatake' } };
okawachi.date = (rt) => {
  const F = rt.flags, d = F.day || 1;
  if (F.ending && !F.failed) return F.peaceAnnounced
    ? '永禄十二年十月四日　城を渡す'
    : '永禄十二年　九月から十月へ　囲みは続く';
  // 下知から夜への移ろいが終わるまでは夕暮れの支度。時刻の札も合わせる。
  if (d === 12) {
    if (F.assaultMoving) return '永禄十二年九月八日　秋・雨・夜';
    // 光が夜へ移り切った後は、大手の誘いの合図を待つ間も夜とする。
    return rt.t >= F.nightReadyAt ? '永禄十二年九月八日　秋・夜　合図を待つ' : '永禄十二年九月八日　秋・夕暮れ　夜攻めの支度';
  }
  if (d === 13) {
    // 朝への十六秒の場面転換では、まだ暗い坂を昼の封鎖と取り違えない。
    const dawn = rt.world.fade && rt.world.fade.t < rt.world.fade.dur;
    return dawn ? '永禄十二年九月九日　秋・夜明け　兵糧攻めへ' : '永禄十二年九月九日　秋・朝　兵糧攻め';
  }
  // 『信長公記』巻二の布陣日。囲みの紹介を架空の「七日目」に進めない。
  // 夕暮れは場面の演出で、史料に時刻の指定があるという意味ではない。
  return '永禄十二年八月二十八日　秋・夕暮れ　四方の囲み';
};
okawachi.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.day < 12 && rt.t > 3 ? '夜攻めの下知を聞く' : '');
okawachi.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) okawachi.nightDay(rt); };
// 戦後の史実説明。実装の修正履歴を混ぜず、史料の記述と遊びの補いを明記する。
// 『信長公記』巻二「阿坂の城退散之事」「大河内国司退城之事」
// https://ja.wikisource.org/wiki/信長公記/我自刊我書
// 三重県「大河内城の戦いと信長の伊勢進攻」・松阪市「大河内城跡」
// https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail65.html
// https://www.city.matsusaka.mie.jp/site/culture-info/okawatijyoato.html
okawachi.history = [
  '永禄十二年（1569）、織田信長は北畠具教・具房の大河内城を囲んだ。『信長公記』巻二によると、町を焼き払い、八月二十八日に四方の陣を定め、二重三重の鹿垣で通路を閉ざした。前田又左衛門・福富平左衛門ら廻番衆も記され、囲みの見張りを担った。南の番の位置と人数は遊びで補ったもので、記された将を南へ割り当てたものではない。南の山には丹羽長秀・池田恒興・稲葉良通・滝川一益ら、西には木下藤吉郎・氏家卜全・佐久間信盛ら、北には斎藤新五・坂井政尚・蜂屋頼隆ら、東には柴田勝家・森可成・佐々成政らを置いた。信長の本陣は東の山に置かれ、馬廻・小姓・弓衆・鉄砲衆が守った。三重県の解説は本陣を北東の桂瀬山とする。',
  '九月八日の夜、丹羽・池田・稲葉の三手が西搦手から攻めた。兵を出すと雨が降り、味方の鉄砲が使えなかったと記す。池田の攻め口では馬廻の朝日孫八郎・波多野弥三、丹羽の攻め口では近松豊前・神戸伯耆ら侍二十余人が討死した。二十余人は丹羽の攻め口で記された侍の数で、全軍の死者総数ではない。',
  '翌九日、信長は滝川一益に多芸谷の北畠の御殿などを焼き払い、作物を薙ぎ捨てるよう命じ、兵糧攻めを続けた。茶筅丸（のちの信雄）に家督を譲る約束で和睦し、十月四日、具教・具房は城を滝川一益・津田掃部へ渡して退いた。松阪市の説明では、籠城は五十日ほどに及んだ。',
  '城跡は東に阪内川、北に矢津川、南と西に深い谷を持つ。北が大手、南が搦手で、本丸の西に西ノ丸、東に二ノ丸・御納戸・馬場が並ぶ。遊びではこの並びを縮め、西搦手の夜攻めを南搦手へ西寄りから進む道で表した。陣・柵・建物・焼け跡・畑の細かな位置と形、本陣への仮橋、北大手道の浅瀬の位置と幅、兵の立ち位置・具足は推定復元である。近くの畑は多芸谷そのものを表してはいない。軍議で選べる北大手の陽動は、この条に記録された作戦ではなく遊びの補いである。夕暮れの時刻・風向き・雨量・翌朝の小雨、城兵の出撃・退路保持・封鎖の局地戦は遊びの補いである。',
  '総勢は三重県の解説に従い、囲み始めの規模を織田約五万・北畠七千〜八千とした。『信長公記』のこの条には総勢の数はなく、各方面・各曲輪の内訳や日々の残兵数も分からない。画面で戦う兵や遠くの兵列は局地戦を表すための人数で、史実の総勢や各手の内訳を再現した数ではない。目の前の討死から全軍の残兵数を割り出すこともできない。',
].join('\n\n');
okawachi.lordAt = { ...HONJIN, r: 12, why: '城の東の山の本陣を、阪内川の対岸の北東の山へ縮めて置いた陣' };
okawachi.lordSpawn = { x: HONJIN.x, z: HONJIN.z + 8, heading: -Math.PI / 2 };
okawachi.noWake = true;
okawachi.rts = true;

// 軍議（gungi.js）：搦手の夜攻めが既定。西搦手の史料を南搦手の西寄りへ縮めた道は推定復元。
okawachi.gungi = (rt) => {
  if (!rt.G.lord) return null;
  const F = rt.flags;
  const G = {
    center: { x: 0, z: GATE.z + 30 }, dist: 140,
    landmarks: [
      { name: '搦手の木戸', x: GATE.x, z: GATE.z }, { name: '搦手の前', x: MAE_C.x, z: MAE_C.z },
      { name: '搦手口の曲輪', x: JO_C.x, z: JO_C.z }, { name: '大手（北）', x: OTE_GATE.x, z: OTE_GATE.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
    ],
    lines: [{ name: '搦手口の曲輪', owner: '敵' }],
    units: [{ id: 'main', name: '丹羽長秀の手', group: () => F.niwa }],
    routes: [
      { id: 'karamete', name: '西寄りから南の搦手へ（道は推定）' },
      { id: 'ote_lure', name: '北の大手で引きつけ、搦手へ寄せる（遊びの補い）' },
    ],
    default: { main: 'karamete' },
    enemy: [
      { name: '塀の内の北畠勢', known: false },
    ],
    cinema: { attackers: { x: 0, z: 40 }, gate: { x: GATE.x, z: GATE.z }, defenders: { x: JO_C.x, z: JO_C.z } },
    onStart: (assign) => okawachi.onGungiStart(rt, assign),
  };
  if (window.__okawachiStrategy) { okawachi.onGungiStart(rt, { main: window.__okawachiStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
okawachi.onGungiStart = (rt, assign) => { rt.flags.strategy = rt.G.lord ? (assign.main || 'karamete') : 'karamete'; };

// 素直な遊び手：木戸の組を守り、打って出た城兵と戦い、陣まで退く。その後は城外の道を封鎖する
okawachi.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.step === 0 || F.step === 1 && !F.assaultMoving) {
    if (!okAtWaitCover(b)) goTo(p, inp, F.waitCover.x, F.waitCover.z, 0.2);
    inp.guardHold = false;
    return;
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 3.2, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    if (e3 && u.hp > u.maxHp * 0.6) {
      const d = Math.hypot(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z);
      const reach = p.weapon === 'sword' ? 1.9 : 2.8;
      p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z);
      if (d > reach * 0.85) goTo(p, inp, e3.pos.x, e3.pos.z, reach * 0.85);
      patientStrike(p, inp, e3, d);
      return;
    }
    // 案内の六歩先の印を行き先へ戻すと、道の補正を二度かけて同じ角へ引き戻す。
    // 陣を行き先に保ち、共通の歩行が一度だけ坂の道順を選ぶ。
    goTo(p, inp, CAMP_LINE.x, CAMP_LINE.z, 3);
    return;
  }
  // 深手の退避と手当ては共通の頭に任せる。傷は自然に戻らず、全快待ちは戦へ戻れない。
  // 打って出た後も、木戸の内の弓や別の曲輪の兵を追わない。
  // 坂の上と下では高さが違う。歩いて寄る相手まで高さで除くと、
  // 城兵が坂へ出ても見つけられず、木戸の前で待ち続けてしまう。
  const close = strikeTarget(b, 3);
  const e = (close && close.pos.z > GATE.z + 0.8 ? close : null) || b.army.nearestEnemy(u, 22, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
    !o.isStruct && !b.army.wallBetween(u.pos, -1, o.pos) &&
    o.pos.z > GATE.z + 0.8 && Math.hypot(o.pos.x - FRONT.x, o.pos.z - FRONT.z) <= 18);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    if (Math.abs(e.pos.y - u.pos.y) < 3) patientStrike(p, inp, e, d);
    else { inp.guardHold = false; inp.leftPressed = false; }
    return;
  }
  inp.guardHold = false;
  // 下知の持ち場は木戸より下の坂。出撃前の隊の中心は城内なので追わない。
  if (F.step === 1 && F.assaultMoving) {
    const cover = okAdvanceGoal(b);
    goTo(p, inp, cover.x, cover.z, 2);
  } else if (F.step === 2) goTo(p, inp, FRONT.x, FRONT.z, 2);
};

export { okawachi };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -164, tx: 0, tz: -28, w: 82, R: 80, rise: 50 };

// 西の尾根にも同じ山の高さを足す。東と搦手の高さは元のまま。
const WEST_LIFT = { ...LIFT, x: NISHI_C.x, tx: NISHI_C.x, w: 9 };
function mountainLift(x, z) { return Math.max(yamaLift(x, z, LIFT), x < -18 ? yamaLift(x, z, WEST_LIFT) : 0); }
const NISHI_DROP = [10, 10, 18, 26, 30, 24, 9, 0, 0];
function nishiRoadHeight(x, z) {
  const h = heightRaw(x, z);
  if (x < -138 || x > 8 || z < -153 || z > -92) return h;
  let bd = 8, roadH = h;
  for (let i = 1; i < ROAD_NISHI.length; i++) {
    const a = ROAD_NISHI[i - 1], b = ROAD_NISHI[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= bd) continue;
    bd = d;
    roadH = HON_LEVEL + LIFT.rise - NISHI_DROP[i - 1] * (1 - t) - NISHI_DROP[i] * t;
  }
  const k = Math.max(0, Math.min(1, (8 - bd) / 5));
  return h + (roadH - h) * k * k * (3 - 2 * k);
}
let BENCHED = null;
let RETREAT_LEVELS = null;
// 横方向だけを均すと、曲輪の縁の急な段差が道の真ん中にも残る。
// 既存の角の高さを結び、道の縦方向にも坂を通す。高さの表は一度だけ作る。
function retreatRoadHeight(x, z) {
  const h = nishiRoadHeight(x, z);
  if (x < -33 || x > 33 || z < FRONT.z - 6.3 || z > CAMP_LINE.z + 6.3) return h;
  if (!RETREAT_LEVELS) RETREAT_LEVELS = KARAMETE_WAY.map(([px, pz]) => nishiRoadHeight(px, pz));
  let nearest = 6.3, road = h;
  for (let i = 1; i < KARAMETE_WAY.length; i++) {
    const a = KARAMETE_WAY[i - 1], b = KARAMETE_WAY[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= nearest) continue;
    nearest = d;
    road = RETREAT_LEVELS[i - 1] + (RETREAT_LEVELS[i] - RETREAT_LEVELS[i - 1]) * t;
  }
  if (nearest >= 6.3) return h;
  const k = Math.max(0, Math.min(1, (6.3 - nearest) / 3.5));
  return h + (road - h) * k * k * (3 - 2 * k);
}
// 柵の番の平場を切った縁は、横方向を均すだけでは急な段差のまま。
// 入口から旗までは歩ける坂、旗から後列までは同じ高さの平場にする。
const SOUTH_LENGTHS = [0];
for (let i = 1; i < SOUTH_ROAD.length; i++) SOUTH_LENGTHS.push(SOUTH_LENGTHS[i - 1] +
  Math.hypot(SOUTH_ROAD[i][0] - SOUTH_ROAD[i - 1][0], SOUTH_ROAD[i][1] - SOUTH_ROAD[i - 1][1]));
const SOUTH_APPROACH = SOUTH_LENGTHS[3];
function southRoadHeight(x, z) {
  const h = retreatRoadHeight(x, z);
  let nearest = 9, along = 0;
  for (let i = 1; i < SOUTH_ROAD.length; i++) {
    const a = SOUTH_ROAD[i - 1], b = SOUTH_ROAD[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= nearest) continue;
    nearest = d; along = SOUTH_LENGTHS[i - 1] + t * (SOUTH_LENGTHS[i] - SOUTH_LENGTHS[i - 1]);
  }
  if (nearest >= 9) return h;
  // 始点と終点を一本の坂で結ぶと、先に切った番の平場まで斜面に戻る。
  // 坂の終わりを旗にそろえ、柵の口から後列までは同じ平場を保つ。
  const a = SOUTH_ROAD[0];
  const start = heightRaw(a[0], a[1]), end = heightRaw(SOUTH_BLOCK.x, SOUTH_BLOCK.z);
  const road = start + (end - start) * Math.min(1, along / SOUTH_APPROACH);
  const t = Math.max(0, Math.min(1, (9 - nearest) / 5));
  return h + (road - h) * t * t * (3 - 2 * t);
}
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(southRoadHeight, [KARAMETE_WAY, ROAD_KARAMETE.slice(6), ROAD_OTE, RUNNER_ROAD]);
  return BENCHED(x, z);
}

// 林の株ごとの色を設営時に一度だけ替える。見える株を詰め直す時の元の色（cullList の orig.col）も同じに替え、詰め直しで元の色へ戻らないようにする。
function okTintTrees(W, fn, meshes = null) {
  const done = new Set();
  const apply = (arr) => {
    if (!arr || done.has(arr)) return;
    done.add(arr);
    for (let i = 0; i * 3 + 2 < arr.length; i++) {
      const c = fn(i, arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
    }
  };
  const trees = meshes || new Set(W.treeMeshes || []);
  for (const m of trees) if (m.instanceColor) { apply(m.instanceColor.array); m.instanceColor.needsUpdate = true; }
  for (const C of W.cullList || []) for (const o of C.orig || []) if (o.col && trees.has(o.m)) apply(o.col);
}
