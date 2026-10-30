import { useTerrain } from './asset_manifest.js';
import * as THREE from 'three';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日・夕方から夜の強襲・縄張り版。docs/first6-1560-1569-spec.md 34〜41）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、申の刻から攻めかかって、夜のうちに落とした。
// 八段の流れ：1 山麓へ寄る → 2 外側の柵（三の郭）→ 3 三の郭を取る → 4 日が傾き松明を灯す → 5 二の丸の木戸
//   → 6 夜戦 → 7 本丸の守りが崩れる → 8 翌日の観音寺入城を後日談で伝える
// 攻め手は佐久間・丹羽・木下・浅井新八の四手が同時に寄せる。自分は木下藤吉郎の手（南の大手の一方向）。ほかの方向は遠景と AI
// （castles/mitsukuri.js の縄張り・castle_plan.js・siege_zones.js・siege_ai.js・butai.js を使う。
//  三の郭〔坂の上〕→二の丸〔木戸構え〕→本丸、の区域の取り合い＋城の頭）
// 落城後の架空の後詰・放火・一騎打ちは挟まない。守りを退け、三曲輪を押さえる。
// 向き：北（-z）が箕作山の城。北西の奥（-x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// 時刻：信長公記の申剋より夜に入り攻め落とす記事（徳富蘇峰文庫の引用）。
// https://wp.tokutomisohou.com/近世日本國民史/１１．織田氏時代前篇/第九章　天下布武の第一著/
// 周辺の山と川：東近江市「五個荘金堂伝統的建造物群保存地区保存計画」第一章１。
// https://www.city.higashiomi.shiga.jp/_res/projects/default_project/_page_/001/004/445/keikaku.pdf
// 和田山城の退去：滋賀県立図書館の調査（信長公記・日本城郭大系）。
// https://crd.ndl.go.jp/reference/entry/index.php?id=1000097854&page=ref_view
// ======================================================================
import { nobori, hut, tawara, lumber, hatazao, campfire, ishigaki, kabukimon, dobei, kuruwaBldg, solidCircle, solidRect, solidSeg, village, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { stoneTex, woodTex } from './nature.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, nm, allyGroup, enemyGroup } from './bhelp.js';
import { customFlag, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { buildHorse } from './units_model.js';
import { yamaLift } from './yamalift.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { sakamogiRow, horiboriHeight, goten, monomi } from './castle_parts.js';
import { makeSiegeZones, siegeFighter } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { addRamp, groundAt } from './floors.js';
import { timeslipField } from './timeslip_field.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { demDetail } from './dem.js';
import { drawGroundAt, avoidCameraBodies } from './render_camera.js';
import { retreatRequired, rescueTarget } from './battle_danger.js';
import { NAKA, nakaGuide, nakaCamClamp } from './naka.js';
import { SOLIDS } from './props.js';
import { interiorBlocked } from './shironaka.js';
import { S as SETTINGS } from './settings.js';
import { WIND_STATE } from './world.js';
import { createSoundPath } from './audio_path.js';
import { sampleBattleSoundPath } from './audio.js';
import {
  MITSUKURI_PLAN, SAN_C, NI_C, HON_C, KIDO, NISHI_TANI_X, ROAD_OTE, ROAD_TANI, ROAD_URA, ROAD_HON, ROAD_HON_LEVELS, HON_ENTRY, HON_EXIT, honPoint,
} from './castles/mitsukuri.js';

// 束0 の asset_dem_mitsukuri.js がまだ無い時も止まらないように（無ければ base のまま）
let dem = null;
let terrainDem;
useTerrain('dem_mitsukuri', (data) => { dem = data; terrainDem = undefined; });

// 広げた西尾根と遠景の城を重ねないよう、繖山の城だけ北へ90ｍ離す。
const KAN = { x: -130, z: -286 };           // 観音寺城のある繖山
// 標高約４３３ｍ（近江の平地から約３３０ｍ）。遠景の距離・曲輪の広さは縮めた復元。
const KAN_COURTS = [
  { name: '本丸', x: -130, z: -284, w: 24, d: 18 },
  { name: '平井丸', x: -116, z: -254, w: 24, d: 18 },
  { name: '落合丸', x: -147, z: -243, w: 20, d: 16 },
  { name: '池田丸', x: -173, z: -241, w: 20, d: 16 },
];
const KAN_FOOT = { name: '御屋形', x: -215, z: -60, w: 30, d: 22 };
const KAN_TOWN = { name: '城下の町', x: -218, z: -17, w: 40, d: 30 };
const KAN_TERRACES = [...KAN_COURTS, KAN_FOOT, KAN_TOWN];
// 繖山だけを持ち上げ、箕作の攻め口と道の高さには足さない。
const KAN_LIFT = { ...KAN, tx: KAN.x, tz: KAN.z + 1, w: 0, R: 90, rise: 333 - baseRaw(KAN.x, KAN.z) };
// 五個荘の北の和田山（標高約１８０ｍ・平地から約８０ｍ）。
// 三城の方向と高低差を残し、遠景の距離・城の広さは遊び用に縮める。
const WADA = { x: 75, z: -286 };
const WADA_LIFT = { ...WADA, tx: WADA.x, tz: WADA.z + 8, w: 8, R: 65, rise: 80 - baseRaw(WADA.x, WADA.z) };
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], ...ROAD_OTE];
// 麓の九十九折りを省き、三の郭の柵の手前の道から始める。
const OPEN_PT = [0, -33];
const TANI_ATTACK_ROAD = [...ROAD_TANI, [SAN_C.x, SAN_C.z]];
const CASTLE_ROADS = [{ pts: ROAD }, { pts: TANI_ATTACK_ROAD }, ...MITSUKURI_PLAN.paths.filter((p) => !['ote', 'tani', 'ura'].includes(p.id))];
// 松明の束は三の郭の平らな足場に置く。取った郭から切岸へ戻らせない。
const TORCH = [{ x: -5, z: -50 }, { x: 5, z: -50 }, { x: 0, z: -58 }];
const COURT_EDGES = [-64];
// 二の丸の奥の段（北の腰曲輪と上の段）。形・高さは推定。
const KITA_DAN = [{ x: 0, z: -103, w: 30, d: 10, level: 22 }, { x: 0, z: -121, w: 40, d: 14, level: 31 }];
// 館の中心でなく、南の縁側から離れた本丸の空き地へ集まる。
const HON_GATHER_PT = honPoint(4, 2);
const HON_GATHER = { x: HON_GATHER_PT[0], z: HON_GATHER_PT[1] };
// 館の東の庭で受ける。退いて来る組も同じ持ち場へ向かい、館の壁へ押し込まれない。
const HON_DEFEND_PT = honPoint(5, 0);
const HON_DEFEND = { x: HON_DEFEND_PT[0], z: HON_DEFEND_PT[1] };
// 二の丸の奥の段の上の段（地の高さは三の郭より約二十九ｍ上）。三の郭から見上げて、木戸の塀の上に胴まで出る置き場。
//   本丸へ攻め上がるまで本丸の守備衆が立つ。
const HON_OKU = { x: 0, z: -117.2 };
const HON_POLY = MITSUKURI_PLAN.kuruwa.find((k) => k.id === 'hon').poly;
const torchReady = (u) => u.type === 'ashigaru' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.downed && !u.rearWound && !u.climb;
const ODA = { flag: 'oda' };
const RK = { armor: 0x33291f, flag: 'rokkaku' };
// 下知は近くでは将本人。塀・切岸の向こうや、声を出せない時は組頭が伝える。
const sayKino = (rt, text, secs) => {
  const u = rt.flags.kinoU, p = rt.player.u.pos;
  const direct = u && cryReady(rt, u) &&
    Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 16 && Math.abs(u.pos.y - p.y) <= 4 &&
    !rt.army.wallBetween(u.pos, -1, p);
  rt.say(direct ? '木下藤吉郎' : '組頭', text, secs);
};
// 遠い将や倒れた将には話させず、鬨と同じく声を出せる本人だけが声を掛ける。
const sayNear = (rt, u, text, secs = 3.5) => {
  const p = rt.player.u;
  if (!u || !cryReady(rt, u) || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 12 ||
    Math.abs(u.pos.y - p.pos.y) > 4 || rt.army.wallBetween(u.pos, -1, p.pos)) return;
  rt.say(u.name, text, secs);
};
// 攻め止めの見出しが消えても、今の下知と残り時間を一枚で伝える。
// 人数が戻れば損耗による予告も外す。別の札や毎コマの入れ物は増やさない。
const attackTaskText = (rt, text) => {
  const F = rt.flags;
  text = text.replace(/（攻め止めまで\d+秒）$/, '');
  const deadline = Math.min(F.failDeadline ?? Infinity, F.lossDeadline ?? Infinity);
  if (F.ending || F.warnDeadline !== deadline || rt.t < deadline - 30) return text;
  const left = Math.max(0, Math.ceil(Math.max(deadline, F.failureReadyAt ?? deadline) - rt.t));
  return `${text}（攻め止めまで${left}秒）`;
};
// 目の前の郭の任務は、その場で札にする。使番待ちで古い行き先を残さない。
const nextObj = (rt, text) => {
  const label = attackTaskText(rt, text);
  const task = rt.obj('main', label, 'main', true);
  // 共通の操作文の省略で、長押しや必要人数を右上の札から落とさない。
  task.mitsukuriText = label;
  return task;
};
// 落城後も屋内からは戸口へ案内する。集合の札と印を同じ下知にそろえる。
const endGatherLabel = (rt) => {
  const action = rt.G.lord ? '追わずに備え、戦の知らせを聞け'
  : rt.flags.endGathered ? '本丸を守り、戦の知らせを聞け'
    : courtyardHouse(rt, rt.player.u) ? '戸口から庭へ出て、集合印へ' : '本丸の集合印へ寄れ';
  return `${action}（戦の終わりまで${Math.max(0, Math.ceil((rt.flags.endAt || rt.flags.stepT + 22) - rt.t))}秒）`;
};
const endGatherTask = (rt) => rt.obj('gatherEnd', endGatherLabel(rt), 'main', true);
const markEndGather = (rt) => rt.marker('gather', () => courtyardWay(rt, HON_GATHER), () => endGatherLabel(rt),
  { guideAlways: true, alwaysDistance: true, guidePriority: 120 });
const sanWay = (rt) => rt.flags.strategy === 'tani' ? '西の谷から三の郭へ' : '柵の口から三の郭へ';
// 呼び直しの待ち時間と、実際に郭へ向かう味方を分けて案内する。
function incomingFriends(rt, z) {
  const F = rt.flags;
  const missing = z.need - (z.friends || 0);
  let incoming = 0;
  z._callable = false;
  for (let i = 0; i <= F.oda.length; i++) {
    const g = i < F.oda.length ? F.oda[i] : F.ramNext;
    if (gone(g) || g === F.torchHelp?.group || (g === F.ram && F.step === 3 && !F.gatePass)) continue;
    const moving = g.order === 'move' && g._sanGoalX === z.pos.x && g._sanGoalZ === z.pos.z;
    // 一人だけ向かっていても、不足を埋められなければ呼び寄せを案内する。
    // 到着済みの者や退く負傷兵は数えない。
    for (const u of g.units) if (zoneNeedsFriend(rt, z, u)) {
      if (moving) incoming++;
      else z._callable = true;
    }
  }
  // ほかに呼べる組がなければ、まず向かっている仲間を迎える。
  // 不足を埋め切れなくても「呼べる組はいない」と到着の案内を消さない。
  return incoming >= missing || (incoming > 0 && !z._callable);
}
const noCallAdvice = '呼べる組はいない。近くの仲間と旗へ';
// 郭の奪い合いでも、火入れ・木戸打ちと同じ退避と救援を先に伝える。
const zonePause = (rt) => rt.G.lord ? '' : retreatRequired(rt) ? '先に味方の後ろへ退け'
  : rescueTarget(rt) ? '先に傷ついた仲間を守れ' : '';
// 呼び寄せも、今使える操作と札をそろえる。手当て中に呼ぶ操作を探させない。
const callAction = (rt) => {
  const work = rt.nearestInteract();
  return work?.id === 'callFriends' ? '「味方を呼ぶ」で集めよ'
    : work?.id === 'bandage' ? '先に手当てを済ませ、味方を呼べ'
      : work ? '近くの作業を終え、味方を呼べ' : '味方を呼び、旗を守れ';
};
// 実際に選ばれている操作に合わせ、届かない松明の長押しを促さない。
const torchPause = (rt) => retreatRequired(rt) ? '火入れは後だ。味方の後ろへ退け'
  : rescueTarget(rt) ? '火入れは後だ。傷ついた仲間を守れ' : '';
const torchAction = (rt) => {
  const pause = torchPause(rt);
  if (pause) return pause;
  if (courtyardHouse(rt, rt.player.u)) return '戸口から庭へ出て、松明へ';
  if (!rt.flags.SZ.byId.san.test(rt.player.u.pos.x, rt.player.u.pos.z)) return '三の郭へ戻り、松明へ';
  const work = rt.nearestInteract();
  return work?.label === '火を移す' ? '「火を移す」を長押し'
    : work?.id === 'bandage' ? '先に手当てを済ませ、松明へ' : '印の松明へ近づけ';
};
// 灯す組は人数待ちをせず働く。大将の札と印も、待機でなく護衛へそろえる。
const torchGuardAction = (rt) => courtyardHouse(rt, rt.player.u) ? '戸口から庭へ出て、松明へ'
  : !rt.flags.SZ.byId.san.test(rt.player.u.pos.x, rt.player.u.pos.z) ? '三の郭へ戻り、松明へ'
    : rt.flags.torchBlocked ? '松明のそばの敵を払え' : '松明へ。灯す組を守れ';
// 操作と残る束を、火入れの直後にも同じ短い札で伝える。
const torchTask = (rt) => {
  const F = rt.flags;
  // 火入れと郭の守りは一枚にまとめ、戦場を隠す札を増やさない。
  rt.objRemove('keepSan');
  // 奪われた時は、携帯でも見える主札に人数と呼び方を出す。
  if (!F.sanFell) {
    zoneTask(rt, F.SZ.byId.san);
    markZone(rt, 'san');
    return;
  }
  const san = F.SZ.byId.san;
  const short = (san.friends || 0) < san.need;
  san._incoming = short && incomingFriends(rt, san);
  F.callZone = short ? san : null;
  // 本人の火入れは人数待ちを要しない。灯す組の足止めと混同しない。
  const pause = !rt.G.lord ? torchPause(rt) : '';
  const action = rt.G.lord ? torchGuardAction(rt) : torchAction(rt);
  // 携帯で束数の途中が折れないよう、残りだけを短く主札に残す。
  const left = TORCH.length - F.lit;
  nextObj(rt, `${action}・あと${left}束`);
  // 灯し手の動きと足止めを既存の札で伝え、何もせず待たせない。
  const helping = F.torchHelp?.group?.units.some(torchReady);
  const helpText = helping ? F.torchBlocked ? '灯す仲間が敵に阻まれた。松明のそばの敵を払え'
    : '仲間も松明へ向かう。そばで守れ' : '三束灯したら木戸へ';
  // 火入れが届かない間は、本文と同じ移動・手当てを先に伝える。
  const canLight = !rt.G.lord && action === '「火を移す」を長押し';
  rt.objProgress('main', pause || (rt.G.lord ? helpText : !canLight ? action
    : helping ? F.torchBlocked ? '仲間が敵に阻まれた。自分で灯すか、そばの敵を払え'
      : '仲間も灯す。自分でも火を移せ' : '人数を待たず灯せる。三束灯したら木戸へ'));
  // 火入れを止める共通の条件と下知をそろえ、届かない操作を待たせない。
  if (F.torchPause !== pause && rt.t >= (F.torchPauseSayAt || 0)) {
    F.torchPause = pause;
    if (pause) { F.torchPauseSayAt = rt.t + 8; sayKino(rt, pause, 3); }
  }
};
// 灯す組や敗走した組を、木戸を打つ手として案内しない。
const gateCrewCount = (g) => {
  if (gone(g)) return 0;
  let n = 0;
  for (const u of g.units) if (marchFighter(u)) n++;
  return n;
};
const gateCrewReady = (rt) => {
  const F = rt.flags;
  const ready = (g) => gateCrewCount(g) > 0;
  return ready(F.ram) || (F.ram2 && F.ramNext?._sanGoalX === KIDO.x &&
    F.ramNext?._sanGoalZ === KIDO.z + 3 && ready(F.ramNext));
};
const gateTask = (rt, mark = true) => {
  const gate = rt.flags.gates.kido, opened = gate.opened;
  // 三の郭の人数不足を持ち越し、呼び寄せの操作で掛矢を隠さない。
  if (rt.flags.sanFell) rt.flags.callZone = null;
  const damage = Math.max(0, Math.min(100, Math.floor((1 - gate.struct.hp / gate.struct.maxHp) * 100)));
  const p = rt.player.u.pos;
  // 木戸中心からの距離だけで長押しを促さず、実際の打ち場に届いてから案内する。
  const ram = rt.interacts.find((it) => it.id === '_gram' && it.label === `掛矢で${gate.struct.name}を打つ`);
  const hitAt = ram && (typeof ram.pos === 'function' ? ram.pos() : ram.pos);
  const approaching = rt.G.lord
    ? Math.hypot(p.x - KIDO.x, p.z - KIDO.z) > 6
    : !hitAt || Math.hypot(p.x - hitAt.x, p.z - hitAt.z) >= ram.r;
  const work = rt.nearestInteract();
  const canHit = ram && work === ram;
  const crewReady = gateCrewReady(rt);
  const guardAction = crewReady ? '木戸前の敵を払い、丸太の組を守れ' : '木戸を打つ組がいない。仲間を守れ';
  const indoors = courtyardHouse(rt, rt.player.u);
  // 深手や救援の最中は、木戸打ちより先に必要な行動を札と印へ出す。
  const pause = !rt.G.lord ? retreatRequired(rt) ? '木戸打ちは後だ。味方の後ろへ退け'
    : rescueTarget(rt) ? '木戸打ちは後だ。傷ついた仲間を守れ' : '' : '';
  const action = pause || (indoors ? '戸口から庭へ出て、木戸へ' : rt.G.lord && !crewReady ? guardAction : approaching ? '坂の中央を通り、木戸の前へ' : rt.G.lord ? guardAction
    : canHit ? '「掛矢で木戸を打つ」を長押し'
      : work?.id === 'bandage' ? '先に手当てを済ませ、木戸の打ち場へ'
        : 'ほかの操作の場所を離れ、木戸の正面へ');
  // 主札・道案内・木戸の印で、同じ操作と行き先を示す。
  rt.flags.gateAction = opened ? '開いた木戸から二の丸へ' : action;
  nextObj(rt, opened ? rt.flags.gateAction : `${action}（木戸の傷み${damage}％）`);
  // 補足も今できる行動にそろえ、移動中や屋内で長押しを探させない。
  rt.objProgress('main', opened ? '' : action === '「掛矢で木戸を打つ」を長押し'
    ? '掛矢で打て。槍では木戸を壊せない' : action);
  if (!opened && rt.flags.gatePause !== pause && rt.t >= (rt.flags.gatePauseSayAt || 0)) {
    rt.flags.gatePause = pause;
    if (pause) { rt.flags.gatePauseSayAt = rt.t + 8; sayKino(rt, pause, 3); }
  }
  if (!mark) return;
  rt.marker('gate', () => {
    const work = rt.interacts.find((it) => it.id === '_gram');
    const point = work && (typeof work.pos === 'function' ? work.pos() : work.pos);
    return courtyardWay(rt, point || KIDO);
  }, () => rt.flags.gateAction,
    { h: 4, guideAlways: true, alwaysDistance: true, guidePriority: 120 });
};
// 足軽には近い未点火の束を示す。操作できる束と印の行き先をそろえる。
const torchPoint = (rt, fallback) => {
  if (rt.G.lord) return TORCH[fallback];
  const work = rt.nearestInteract();
  if (work?.label === '火を移す') return typeof work.pos === 'function' ? work.pos() : work.pos;
  const p = rt.player.u.pos;
  let next = fallback, distance = Infinity;
  for (let i = 0; i < TORCH.length; i++) {
    if (rt.flags.litMask & (1 << i)) continue;
    const t = TORCH[i], d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < distance) { next = i; distance = d; }
  }
  return TORCH[next];
};
// 火入れの印は一束だけ。操作できる束は減らさない。
const markTorch = (rt) => {
  let next = -1;
  for (let i = 0; i < TORCH.length; i++) {
    rt.unmark('t' + i);
    if (next < 0 && !(rt.flags.litMask & (1 << i))) next = i;
  }
  if (rt.flags.sanFell && next >= 0) {
    // 奪還の印は残さず、灯す束へ一つの印で案内する。
    rt.unmark('san');
    // 屋内では松明への直線で壁へ誘わず、先に実際の戸口を示す。
    rt.marker('t' + next, () => courtyardWay(rt, torchPoint(rt, next)),
      () => rt.G.lord ? torchGuardAction(rt) : torchAction(rt),
      { h: 1.2, guideAlways: true, alwaysDistance: true, guidePriority: 120 });
  }
};
// 切岸では歩行用の補間より、実際に描く三角面が高いことがある。
// 箕作の視点だけ両方の上へ置き、面を透かさずに肩側へ避ける。
const cameraGround = (world, x, z) => Math.max(world.heightAt(x, z), drawGroundAt(world, x, z));
// 松明を早く灯しても、夕空から星空へ急に飛ばさない。進軍と制圧の待ちは増やさない。
function siegeNight(world) {
  if (world.timeKey === 'night') return;
  // 火入れは夜への準備。早く済ませても、まだ西日のある空を星空へ替えない。
  if (world.dayClock && world.dayClock.hour < 17.8) return;
  world.setTime('night');
  if (world.fade) world.fade.dur = 60;
}

const marchFighter = (u) => siegeFighter(u) && !u.rearWound && !u.climb;
// 担い手や動けない兵を、鬨の声の出どころにしない。
const cryReady = (rt, u) => marchFighter(u) && !u.dragging && !u.death?.aid && !u.bind &&
  !(u.stagger > 0) && !(u.pinT > rt.army.time);
// 楽器は手の空いた徒歩の足軽から。操作中の本人を太鼓・鉦の奏者に数えない。
// 斬り結ぶ兵・装填中や打たれてよろめく兵には吹かせない。
const signalHandsFree = (rt, u) => cryReady(rt, u) && !u.isPlayer && u.type === 'ashigaru' && !u.mounted &&
  !u.banner && !u.stdHeld && !u.stdPickup && !u.dropped &&
  !rt.flags.torches?.holds(u) && !rt.flags.playerTorch?.holds(u) &&
  !u.atk && !u.swing && !u.reload &&
  !(u.target?.alive && !u.target.gone && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 8);
const signalSafe = (rt, u) => {
  if (!signalHandsFree(rt, u)) return false;
  // 狙っている敵だけでは、背後から迫る敵や別の味方と斬り結ぶ敵を見落とす。
  // 合図を出す時だけ調べ、前線の兵を止めずに、後ろの手の空いた組へ任せる。
  for (const foe of rt.army.units) {
    if (foe.team === u.team || !marchFighter(foe)) continue;
    if (Math.abs(foe.pos.y - u.pos.y) < 4 && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 8) return false;
  }
  return true;
};
const signalReady = (rt, u, kind) => {
  if (!signalSafe(rt, u)) return false;
  // 組の退却を、まだ残っている攻めの合図で打ち消さない。集合と退きの合図は届ける。
  if ((kind === 'kakari' || kind === 'susume') && u.group.order === 'retreat') return false;
  // 集合は法螺一人、攻め・前進は法螺と太鼓、退きは鉦も別の者が受け持つ。
  // 法螺だけの集合まで三人待ちにして、近くの合図を麓へ戻さない。
  // 組が散った時は既存の麓の陣から鳴らし、兵や音の数は増やさない。
  const needed = kind === 'atsumare' ? 0 : kind === 'nobiki' ? 2 : 1;
  if (!needed) return true;
  let helpers = 0;
  for (const ally of u.group.units) {
    if (ally === u || ally.isPlayer || !signalHandsFree(rt, ally) ||
      Math.abs(ally.pos.y - u.pos.y) > 2 || Math.hypot(ally.pos.x - u.pos.x, ally.pos.z - u.pos.z) > 6 ||
      rt.army.wallBetween(ally.pos, -1, u.pos)) continue;
    // 太鼓・鉦の役にも背後の敵を確かめる。法螺役だけ安全でも連奏させない。
    // 候補を距離と壁で絞ってから調べ、毎コマの処理は増やさない。
    if (!signalSafe(rt, ally)) continue;
    if (++helpers === needed) return true;
  }
  return false;
};
// 近くの一人が孤立していても、別の組に唱和できる兵がいれば、そこから鬨を上げる。
// 壁の向こうや負傷中の兵を返事の人数に数えず、声を出す時だけ調べる。
const cryCompanyReady = (rt, caller, needed) => {
  if (caller.group.order === 'retreat') return false;
  if (needed <= 1) return true;
  let voices = 1;
  for (const u of rt.army.units) {
    if (u === caller || u.team !== caller.team || !cryReady(rt, u) || u.group.order === 'retreat' ||
      Math.abs(u.pos.y - caller.pos.y) > 4 || Math.hypot(u.pos.x - caller.pos.x, u.pos.z - caller.pos.z) > 12 ||
      rt.army.wallBetween(u.pos, -1, caller.pos)) continue;
    if (++voices >= needed) return true;
  }
  return false;
};
// 鬨は戦える味方から。楽器の合図役は健在な間は同じ兵を保ち、視点の移動で音源を飛ばさない。
const signalCaller = (rt, instrument = '', voices = 1) => {
  const previous = rt.flags.instrumentCaller;
  if (instrument && previous && rt.flags.signalGroups.includes(previous.group) &&
    !gone(previous.group) && !previous.group.routed && !previous.isPlayer && signalReady(rt, previous, instrument)) return previous;
  const p = rt.player.u.pos;
  let caller = null, distance = Infinity, near = null, nearDistance = Infinity;
  for (const g of rt.flags.signalGroups) {
    if (gone(g) || g.routed) continue;
    for (const u of g.units) {
      if (u.isPlayer || !cryReady(rt, u) || (instrument && !signalReady(rt, u, instrument))) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.y - p.y, u.pos.z - p.z);
      if (d >= distance && d >= nearDistance) continue;
      if (!instrument && !cryCompanyReady(rt, u, voices)) continue;
      if (d < distance) { caller = u; distance = d; }
      if (d < nearDistance && Math.abs(u.pos.y - p.y) <= 4 && !rt.army.wallBetween(u.pos, -1, p)) {
        near = u; nearDistance = d;
      }
    }
  }
  // 全員が塀の向こうなら、実在する最寄りの兵の音を既存の遮音処理へ渡す。
  const chosen = near || caller;
  if (instrument) rt.flags.instrumentCaller = chosen;
  return chosen;
};
const armyCry = (rt, kind = 'toki', onArrival = null) => {
  // 合成音は突撃が三人、勝鬨が六人。一人残った兵から大勢の返事を鳴らさない。
  const needed = kind === 'eiei' ? 6 : 3;
  const caller = signalCaller(rt, '', needed);
  // 鳴らさない時は到達の処理も呼ばず、鬨の台詞・任務札を音だけ先に出さない。
  if (!caller) return 0;
  const F = rt.flags, ear = rt.camera.position;
  const path = F.signalPath || (F.signalPath = createSoundPath());
  const distance = Math.hypot(caller.pos.x - ear.x, caller.pos.z - ear.z);
  sampleBattleSoundPath(rt.world, caller.pos, ear, WIND_STATE, path, distance || 1);
  // 共通の鬨の減衰距離は五十五ｍ。尾根と風で聞き取れない声を、
  // 届いた合図として札と台詞に出さず、後日談にも架空の待ちを足さない。
  // 再生側は減衰距離の九倍を越す声を鳴らさない。札にも同じ上限を使う。
  if (distance > 55 * 9 || 0.8 * path.gain / (1 + Math.pow(distance / 55, 1.35)) < 0.02) return 0;
  // 周囲の叫びと分け、任務札・下知に結んだ鬨を合図の枠で鳴らす。
  rt.army.play('sig_' + kind, caller.pos, 0.8);
  if (onArrival) {
    if (path.delay > 0) rt.after(path.delay, onArrival); else onArrival();
  }
  // 太鼓の後の鬨も一続きの合図。届いて鳴り終わる前に集合・退きの法螺を重ねない。
  // 合成した鬨の三・二秒と、音高の揺れ・余韻を待つ。
  F.signalUntil = Math.max(F.signalUntil || 0, rt.t + path.delay + 3.6);
  return path.delay + 3.6;
};
// 鬨の案内は声の余韻まで。後から出た下知や同じ文の新しい合図は消さない。
const cryCue = (rt, o, text, seconds) => {
  o.cue = text; o.cueT = rt.t;
  const cueT = o.cueT;
  rt.after(seconds, () => {
    if (o.cue === text && o.cueT === cueT) { o.cue = ''; o.cueT = 0; }
  });
};
const SIGNAL_LABELS = {
  kakari: '合図：法螺貝。続く陣太鼓の早打ちで総懸かり',
  susume: '合図：法螺貝。続く進み太鼓で前へ進め',
  atsumare: '合図：集合の法螺貝、一声目。二声で旗へ寄れ',
  nobiki: '合図：低い法螺貝。退き太鼓と鉦に続き麓へ退け',
};
// 合成音の出だしに合わせ、まだ鳴っていない太鼓・二声目・鉦を「聞こえた」と示さない。
// 時刻は audio.js の signal の譜面。音の到着から数え、次の下知へ移ったら更新を止める。
const SIGNAL_PARTS = {
  // 一打ち目はまだ間が広い。九打目から間が約〇・二秒に詰まる。
  kakari: [[1.2, '合図：陣太鼓が打ち始めた。早打ちへ続く'], [4.51, '合図：陣太鼓の早打ち＝総懸かり']],
  susume: [[0.3, '合図：進み太鼓＝前へ進め']],
  atsumare: [[3, '合図：法螺貝の二声目＝旗へ集合']],
  nobiki: [[1.6, '合図：退き太鼓の一打目。組を連れて退け'], [2.15, '合図：退き太鼓の二つ打ち＝組を連れて退け'], [4.4, '合図：低い法螺貝の二声目＝組を散らさず退け'], [6.6, '合図：退き鉦＝組を散らさず麓へ退け']],
};
const signalCue = (rt, kind, o, valid, audible = true) => {
  o.cue = audible ? SIGNAL_LABELS[kind] : '合図が遠い。任務の指示に従え'; o.cueT = rt.t;
  let previous = o.cue;
  if (audible) for (const [delay, text] of SIGNAL_PARTS[kind]) rt.after(delay, () => {
    // 別の下知が札を使ったら、先の太鼓の続きで上書きしない。
    if (!valid() || o.state || o.cue !== previous) return;
    o.cue = text; o.cueT = rt.t;
    previous = text;
  });
  // 聞こえない時の案内も演奏の終わりに消し、後から近づいても古い合図待ちを残さない。
  rt.after(SIGNAL_SECONDS[kind], () => {
    if (!valid() || o.state || o.cue !== previous) return;
    o.cue = ''; o.cueT = 0;
  });
};
const SIGNAL_WAIT_LABELS = {
  kakari: '合図待ち：総懸かりの法螺貝と陣太鼓',
  susume: '合図待ち：前進の法螺貝と進み太鼓',
  atsumare: '合図待ち：集合の法螺貝二声',
  nobiki: '合図待ち：退きの法螺貝と太鼓、鉦',
};
// 合成音の長さと余韻。鳴っている合図を最後まで聞かせ、待つ間の古い下知は取り消す。
// 総懸かりの最後の一打ちは約六・九秒、進み太鼓は〇・三秒から鳴る。
// 大太鼓一・九秒／陣太鼓一・四秒の合成音と音高の揺れまで待つ。
const SIGNAL_SECONDS = { kakari: 9.2, susume: 4.8, atsumare: 6.5, nobiki: 9.2 };
// 共通の合図音は八秒以内の同じ合図を間引く。短い進み・集合の後も発音間隔を守る。
const SIGNAL_GAP = 8.1;
const signalWait = (rt) => Math.max(0, Math.max(rt.flags.signalUntil || 0, rt.flags.signalReadyAt || 0) - rt.t);
const clearSignalCues = (rt) => {
  // 次の合図を待つ札に、前の「総懸かり」「集合」を残さない。
  for (const o of rt.objectives) { o.cue = ''; o.cueT = 0; }
  rt.flags.callSignalZone = null;
  rt.flags.callSignalUntil = 0;
};
// 音の遅れは共通の伝音処理に任せ、札と下知だけを到達まで待たせる。
// 合図役が退いた時も、麓の陣から合図を届ける。
const playArmySignal = (rt, kind, vol, onArrival) => {
  const F = rt.flags, caller = signalCaller(rt, kind);
  const pos = caller ? caller.pos : (F.signalCamp || (F.signalCamp = {
    x: CAMP.x, y: rt.world.heightAt(CAMP.x, CAMP.z), z: CAMP.z,
  }));
  const ear = rt.camera.position;
  const path = F.signalPath || (F.signalPath = createSoundPath());
  const distance = Math.hypot(pos.x - ear.x, pos.z - ear.z);
  sampleBattleSoundPath(rt.world, pos, ear, WIND_STATE, path, distance || 1);
  const delay = path.delay;
  // 麓からの法螺も鳴らすが、尾根越しに聞き取れない合図を札で聞こえた扱いにしない。
  // 共通の合図の距離減衰と、鬨と同じ聞き取りの下限を使う。
  const audible = distance <= 1440 && vol * path.gain / (1 + Math.pow(distance / 160, 1.35)) >= 0.02;
  rt.army.play('sig_' + kind, pos, vol);
  F.signalReadyAt = rt.t + SIGNAL_GAP;
  if (delay > 0) rt.after(delay, () => onArrival(audible)); else onArrival(audible);
  return delay;
};
const armySignal = (rt, kind, vol = 1, task = 'main', onEnd = null, onStart = null) => {
  const F = rt.flags, serial = F.signalSerial = (F.signalSerial || 0) + 1, step = F.step;
  clearSignalCues(rt);
  const valid = () => F.signalSerial === serial && F.step === step && rt.player.u.alive &&
    ((!rt.over && !F.ending) || (task === 'gatherEnd' && (!rt.over || (rt.result?.scriptedEnd && !rt.result.down && rt.tracker.main))));
  // 前の合図の余韻と伝音を待つ間は、まだ新しい音が届いていないと札で伝える。
  const waiting = rt.objectives.find((o) => o.id === task && !o.state);
  if (waiting) { waiting.cue = SIGNAL_WAIT_LABELS[kind]; waiting.cueT = rt.t; }
  const emit = () => {
    if (!valid()) return;
    const o = rt.objectives.find((o) => o.id === task && !o.state);
    if (!o) return;
    // 発音後に合図役が退いても、すでに出た音は届く。古い下知だけ取り消す。
    const delay = playArmySignal(rt, kind, vol, (audible) => {
      if (!valid() || o.state) return;
      F.signalUntil = rt.t + SIGNAL_SECONDS[kind];
      // 音が届いた時に札と下知をそろえ、鬨もここから待つ。
      signalCue(rt, kind, o, valid, audible);
      if (audible && onStart) onStart();
      // 聞こえなくても合図の演奏は続く。後日談や次の下知を止めない。
      if (onEnd) rt.after(SIGNAL_SECONDS[kind], () => { if (valid()) onEnd(); });
    });
    F.signalUntil = rt.t + delay + SIGNAL_SECONDS[kind];
  };
  const wait = signalWait(rt);
  if (wait > 0) rt.after(wait, emit); else emit();
};
const assaultOrder = (rt, text, line = null) => {
  rt.obj('main', text, 'main', true);
  // 鬨も実際に鳴り始めてから待つ。集合に変われば取り消す。
  armySignal(rt, 'kakari', 1, 'main', () => {
    const F = rt.flags, serial = F.signalSerial, step = F.step;
    if (zonePause(rt) || (step === 4 && (!F.sanFell || !F.niFell))) return;
    armyCry(rt, 'toki', () => {
      // 音が届く間に集合・退きへ変わったら、古い突撃の札と声は出さない。
      if (F.signalSerial !== serial || F.step !== step || rt.over || F.ending || !rt.player.u.alive ||
        zonePause(rt) || (step === 4 && (!F.sanFell || !F.niFell))) return;
      const o = rt.objectives.find((o) => o.id === 'main' && !o.state);
      if (!o) return;
      cryCue(rt, o, '鬨の声：おおう！　味方と声を合わせて攻めよ', 3.6);
      sayKino(rt, 'おおう！　鬨を合わせよ。仲間と肩を並べてかかれ！', 3.5);
    });
  },
    line ? () => sayKino(rt, zonePause(rt) || (rt.flags.step === 4 && !rt.flags.sanFell
      ? '先に三の郭へ戻れ。後ろの守りを固めよ！' : line), 3.5) : null);
};
// 四挺の組は、二人以上が弾込めを終え、筒先と射線がそろった時に一度だけ号令を出す。
// 銃声を足す演出は使わず、発砲・不発・味方や柵による遮りは本来の射撃に任せる。
const gunCallReady = (rt, u) => {
  const t = u.target, g = u.group;
  // 馬上・弾切れ・退却中の射手は射撃本体でも撃てない。「放て」の声と札だけを出さない。
  if (!cryReady(rt, u) || u.isPlayer || u.type !== 'gun' || u.mounted || u.sidearm || u.gunAmmo <= 0 ||
    g.order === 'retreat' || u.reload || u.atk || u.cd > 0 ||
    !t?.alive || t.gone || t.noTarget || t.isStruct || t.team === u.team) return false;
  const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  // 射撃本体は、敵に寄られた野外の射手を先に後退させる。
  // 四〜六歩の敵や、間合いを取り直す途中の兵へ「放て」を出さない。
  // 狭間・館内の持ち場では本来どおり構えを保てる。
  if (!u.mounted && !g.interiorHold && !u.perch && !rt.army.atLoop(u) &&
    (d < 6 || u.rangedBack && d < 10)) return false;
  // 射撃本体と同じ下知を守る。向きを変えている組や、先の一斉射に
  // 加われなかった射手を「放て」の人数へ数え、音と札だけを出さない。
  if (g.salvoOnly && u.salvoAt !== g.salvoAt) return false;
  // 段を組んだ鉄砲は、持ち場へ着いた前列だけが撃てる。
  // 後列や移動中の二人を数えて、発砲のない「放て」を鳴らさない。
  if (rt.army.gunGated(g) && !rt.army.atLoop(u)) {
    const slot = g.slotPos(u.slot, g.initial);
    if (Math.hypot(slot.x - u.pos.x, slot.z - u.pos.z) >= 1.1 || !rt.army.gunFront(u)) return false;
  }
  const bearing = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  if (g.fireArc > 0) {
    const arc = bearing - (g.facing || 0);
    if (g.gunTurnUntil > rt.army.time || Math.abs(Math.atan2(Math.sin(arc), Math.cos(arc))) > g.fireArc / 2) return false;
  }
  const aim = bearing - u.heading;
  return Math.abs(Math.atan2(Math.sin(aim), Math.cos(aim))) < 0.5 && d > 4 && d <= u.range &&
    !rt.army.shotBlocked(u, t.pos) && !rt.army.hiddenBehind(u, t) && !rt.army.allyInLine(u, t, d);
};
// 塀越しや離れた撃ち手を、同じ「放て」に応じる人数へ数えない。
// 四挺だけを号令の前後に調べ、通常の射撃や毎コマの処理は変えない。
const gunCompanyReady = (rt, g, caller) => {
  if (!gunCallReady(rt, caller)) return false;
  const bearing = Math.atan2(caller.target.pos.x - caller.pos.x, caller.target.pos.z - caller.pos.z);
  let ready = 0;
  for (const u of g.units) {
    if (!gunCallReady(rt, u) || Math.abs(u.pos.y - caller.pos.y) > 4 ||
      Math.hypot(u.pos.x - caller.pos.x, u.pos.z - caller.pos.z) > 12 ||
      (u !== caller && rt.army.wallBetween(caller.pos, -1, u.pos))) continue;
    // 前後に散った敵へ個別に構える二挺を、そろった斉射と数えない。
    // 号令を待つ間に筒先が散った時も、通常の射撃へ戻す。
    const aim = Math.atan2(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) - bearing;
    if (Math.abs(Math.atan2(Math.sin(aim), Math.cos(aim))) >= 0.5) continue;
    if (++ready >= 2) return true;
  }
  return false;
};
const openingGunCall = (rt) => {
  const F = rt.flags, g = F.gunK;
  if (F.gunCalled || F.step !== 2 || signalWait(rt) > 0 || gone(g) || g.routed || g.holdFire || g.fire === false) return;
  let caller = null, callerDistance = Infinity;
  for (const u of g.units) {
    // 射撃本体と同じ向きの条件。背を向けている兵まで数え、声と札だけ先走らせない。
    if (!gunCallReady(rt, u)) continue;
    // 配列の先頭が塀の裏でも、近くで下知を伝えられる撃ち手を選ぶ。
    const p = rt.player.u.pos, distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (distance <= 20 && distance < callerDistance && Math.abs(u.pos.y - p.y) <= 4 &&
      !rt.army.wallBetween(u.pos, -1, p) && gunCompanyReady(rt, g, u)) { caller = u; callerDistance = distance; }
  }
  if (!caller) return;
  // 既存の合成人声を撃ち手の位置から。法螺・太鼓の最中には重ねない。
  const serial = F.signalSerial, step = F.step;
  const path = F.signalPath || (F.signalPath = createSoundPath()), ear = rt.camera.position;
  const distance = Math.hypot(caller.pos.x - ear.x, caller.pos.z - ear.z);
  sampleBattleSoundPath(rt.world, caller.pos, ear, WIND_STATE, path, distance || 1);
  // 射手が近くても、視点まで声が届かない時は通常の射撃を続ける。
  // 「放て」の札だけを出すために、撃ち手を待機させない。
  if (0.65 * path.gain * Math.max(0, 1 - distance / 55) ** 1.5 < 0.02) return;
  F.gunCalled = true;
  g.holdFire = true;
  const delay = path.delay;
  rt.army.play('sig_fire', caller.pos, 0.65);
  // 「放て」も合図音の八秒間隔を使う。射線が崩れて呼び直す時に、
  // 音だけ間引かれて台詞と札だけが出ることを防ぐ。
  F.signalReadyAt = rt.t + SIGNAL_GAP;
  // 号令が届き、下知を聞き終えるまで次の法螺・太鼓を待つ。射撃自体は待たせない。
  F.signalUntil = Math.max(F.signalUntil || 0, rt.t + delay + 3);
  const o = rt.objectives.find((task) => task.id === 'main' && !task.state);
  const cue = '鉄砲組の合図：放て。味方の筒先を空けよ';
  let cancelled = false;
  const cancelCue = () => {
    cancelled = true;
    if (o && o.cue === cue) { o.cue = ''; o.cueT = 0; }
  };
  const valid = () => F.signalSerial === serial && F.step === step && !rt.over && !F.ending &&
    rt.player.u.alive && !gone(g) && !g.routed && g.fire !== false && g.order !== 'retreat' && o && !o.state;
  // 声が届く前に札を出さず、集合や退きへ変わったら古い号令を見せない。
  rt.after(delay, () => {
    if (cancelled || !valid()) return;
    rt.say('鉄砲組頭', '鉄砲、放て！　味方は筒先を空けよ！', 3);
    o.cue = cue; o.cueT = rt.t;
  });
  rt.after(0.8, () => {
    // 待つ間の撃ち方やめ・敗走・攻め止めを、古い「放て」で解かない。
    if (!valid() || g.holdFire !== true) {
      // 集合や次の郭へ下知が変わった時は、この号令の一時待機だけを解く。
      // 待機解除を共通処理が一斉射と解釈しないよう、前の待機の覚えも消す。
      // すでに別の下知で待機が解けていたら、その一斉射の覚えは消さない。
      // 後から出た撃ち方やめ・退却・敗走の待機は残す。
      // この号令だけが古くなった時に限り、一時待機を解く。
      if (g.holdFire === true && g.fire !== false && g.order !== 'retreat' && !g.routed && !gone(g)) {
        g._hf = false; g.holdFire = false;
      }
      cancelCue();
      if (!rt.over && !F.ending && F.step === step && rt.player.u.alive) F.gunCalled = false;
      return;
    }
    // 下知の間に負傷・弾切れ・射線への割り込みがあれば、一斉射の覚えを残さない。
    // 撃てる一人の通常射撃は止めず、架空の揃った発砲へ切り替えることだけを防ぐ。
    if (!gunCompanyReady(rt, g, caller)) {
      g._hf = false;
      F.gunCalled = false;
      // 不発の一斉射を促す札は残さず、届く前の古い台詞も取り消す。
      cancelCue();
    }
    g.holdFire = false;
  });
  rt.after(delay + 3, () => {
    if (o && o.cue === cue) { o.cue = ''; o.cueT = 0; }
  });
};
const markZone = (rt, id) => {
  for (const other of ['san', 'ni', 'hon']) if (other !== id) rt.unmark(other);
  rt.unmark('gate');
  // 開戦時の固定の柵印は、郭へ入ったら残る敵を追う印に替える。
  if (rt.markers.some((m) => m.id === id && m.zoneGuide)) return;
  const z = rt.flags.SZ.byId[id];
  const name = id === 'san' ? '三の郭' : id === 'ni' ? '二の丸' : '本丸';
  // 郭に入ったら人数不足でも残る敵を示す。味方はその場から呼べる。
  const remainingEnemy = () => z.owner !== 'friend' && z._guideEnemy && zoneGroundFighter(rt, z._guideEnemy) && z.test(z._guideEnemy.pos.x, z._guideEnemy.pos.z) ? z._guideEnemy : null;
  const gathering = () => z.owner !== 'friend' && (z.friends || 0) < z.need && rt.t >= (rt.flags.callReadyAt || 0);
  // 西へ折れる道の途中では、崖越しの旗でなく次の曲がり角を示す。
  const pos = () => {
    const enemy = z.test(rt.player.u.pos.x, rt.player.u.pos.z) ? remainingEnemy() : null;
    return courtyardWay(rt, enemy ? enemy.pos : z.pos);
  };
  rt.marker(id, pos, () => zonePause(rt) || (courtyardHouse(rt, rt.player.u) ? '戸口から庭の旗へ戻れ' : !z.test(rt.player.u.pos.x, rt.player.u.pos.z)
    ? id === 'hon' ? rt.flags.honWait ? '城は取った。本丸の旗へ' : '西の石段から本丸へ' : id === 'ni' ? '木戸から二の丸へ' : sanWay(rt)
    : z.owner === 'friend' ? `${name}の旗へ。味方と固めよ`
      : remainingEnemy() ? `${name}の残る敵　${z.enemies}人`
      : z._incoming && (z.friends || 0) < z.need ? `${name}で味方を迎えよ　${z.friends || 0}／${z.need}人`
      : z._callable === false && (z.friends || 0) < z.need ? noCallAdvice
      : gathering() ? `${callAction(rt)}　${z.friends || 0}／${z.need}人`
      : (z.friends || 0) < z.need
          ? `${name}を守れ　呼び直しまで${Math.max(0, Math.ceil((rt.flags.callReadyAt || 0) - rt.t))}秒`
          : z.owner !== 'friend' && !z.enemies && (z.friends || 0) >= z.need
          ? `${name}をあと${Math.max(1, Math.ceil(z.hold - z.holdT))}秒守れ` : name),
    { zoneGuide: true, guideAlways: true, alwaysDistance: true, guidePriority: 120 });
};

// 箕作の携行松明。横の切岸の高さで炎を浮かせず、左手の位置に柄と穂を添える。
// 形・材質・計算用の入れ物は火入れ時だけ作り、更新では使い回す。
function carryTorches(world, units) {
  const shaftGeo = new THREE.CylinderGeometry(0.025, 0.032, 1.05, 5);
  const headGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.18, 6);
  const wood = new THREE.MeshLambertMaterial({ color: 0x65432a });
  const char = new THREE.MeshLambertMaterial({ color: 0x34251a });
  const grip = new THREE.Vector3();
  const axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const list = units.filter((u) => u && u.alive).map((u) => {
    const shaft = new THREE.Mesh(shaftGeo, wood), head = new THREE.Mesh(headGeo, char);
    world.scene.add(shaft, head);
    const f = world.addFire(u.pos.x, u.pos.z, { torch: true, h: 1.7, size: 0.22, smoke: false, lightStrength: 3, lightRadius: 7 });
    // 携行する小さな火は外炎と芯だけ。横へ足した舌を別の浮いた火に見せない。
    // 形と材質はほかの火も使うので、ここでは場面から外すだけにする。
    while (f.flame.children.length) f.flame.remove(f.flame.children[0]);
    // 立ち止まった松明も動く持ち物。景物へ結合すると、柄や炎の芯だけが元の場所へ残る。
    for (const part of [shaft, head, f.flame, f.inner, f.glow]) if (part) {
      part.userData.noFreeze = true;
      part.userData.noBatch = true;
    }
    return { u, f, shaft, head };
  });
  return {
    // 合図を出す時だけ参照し、松明を持ったまま法螺・太鼓・鉦を受け持たせない。
    holds(u) { return list.some((c) => c.u === u && c.f); },
    update() {
      for (const c of list) {
        const { u, f, shaft, head } = c;
        if (!c.f) continue;
        if (!u.alive || u.gone || u.downed || u.woundOut || u.fleeing) {
          world.removeFire(f); c.f = null; shaft.visible = head.visible = false;
          continue;
        }
        const hand = u.human?.root.visible && u.human.root.parent && u.human.bones.LeftHand;
        if (hand) hand.getWorldPosition(grip);
        else {
          const h = u.heading || 0;
          grip.set(u.pos.x - Math.cos(h) * 0.35, u.pos.y + 1.08, u.pos.z + Math.sin(h) * 0.35);
        }
        // 握りは手に残し、火の穂だけを体の外へ傾ける。直立させると笠を貫いて燃える。
        const h = u.heading || 0;
        // 攻撃中は左手も動く。体の向きだけで傾けず、実際の握りから外へ向ける。
        const gx = grip.x - u.pos.x, gz = grip.z - u.pos.z, reach = Math.hypot(gx, gz);
        // 火の穂を斜め上へ掲げる。横へ寝かせた槍のようにせず、笠の外へも余白を残す。
        axis.set(reach > 0.1 ? gx / reach * 0.65 : -Math.cos(h) * 0.65, 1.5,
          reach > 0.1 ? gz / reach * 0.65 : Math.sin(h) * 0.65).normalize();
        shaft.quaternion.setFromUnitVectors(up, axis);
        head.quaternion.copy(shaft.quaternion);
        shaft.position.copy(grip).addScaledVector(axis, 0.34);
        head.position.copy(grip).addScaledVector(axis, 0.91);
        shaft.visible = head.visible = u.mesh.visible !== false;
        // 共通の火の更新もこの値を見る。持ち主を隠した後に炎だけを再表示しない。
        f.lit = shaft.visible;
        f.x = grip.x + axis.x; f.z = grip.z + axis.z; f.base = grip.y + axis.y;
        f.ly = f.base - world.heightAt(f.x, f.z) + 0.25;
        f.flame.position.set(f.x, f.base, f.z);
        f.inner.position.set(f.x, f.base - f.size * 0.08, f.z);
        f.flame.visible = f.inner.visible = shaft.visible;
        if (f.light) f.light.position.set(f.x, f.base + 0.25, f.z);
      }
    },
  };
}

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
// 国土地理院の標高（箕作山。asset_dem_mitsukuri.js は本丸が格子の原点）の尾根と谷の凹凸を、手書きの山に足す。
// 実測の水平距離は１ｍを１座標で使い、本丸（HON_C）を原点に合わせる。細かな起伏だけを足す。
const MITSUKURI_DEM_OPTIONS = { xy: 1, ox: HON_C.x, oz: HON_C.z, win: 60, scale: 0.35 };
function baseWithDem(x, z) {
  const b = baseRaw(x, z);
  // 曲輪の床と山の肩の高さをそろえる。盛り上げ前の主郭は１１ｍ。
  const shoulder = (baseRaw(HON_C.x, HON_C.z) - 11) * gauss(x, z, HON_C.x, HON_C.z, 5000);
  const data = terrainDem === undefined ? dem : terrainDem;
  return b - shoulder + (data ? demDetail(data, x, z, MITSUKURI_DEM_OPTIONS) : 0);
}
// 堀の形は一度だけ用意し、城の部品と同じ窪みを実際の地面にも付ける。
const HORI_HEIGHTS = MITSUKURI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
function baseWithHori(x, z) {
  let h = baseWithDem(x, z);
  for (const f of HORI_HEIGHTS) h += f(x, z);
  return h;
}
let HEIGHT_FN = null;
let ROAD_SEGMENTS = null;
// 曲輪間の段差を道の長さに分ける。道の外の切岸・土塁・堀は残す。
// 交差する大手と谷道は同じ標高を用い、口で急に上下しない。
function roadLevel(x, z) {
  const san = LIFT.rise + 2, ni = LIFT.rise + 6, hon = LIFT.rise + 11;
  if (x < -0.01 && z < -78) {
    let best = Infinity, level = 6;
    for (let i = 1; i < ROAD_HON.length; i++) {
      const a = ROAD_HON[i-1], b = ROAD_HON[i], dx = b[0]-a[0], dz = b[1]-a[1];
      const t = Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
      const d = (x-a[0]-dx*t)**2+(z-a[1]-dz*t)**2;
      if (d < best) { best = d; level = ROAD_HON_LEVELS[i-1]+(ROAD_HON_LEVELS[i]-ROAD_HON_LEVELS[i-1])*t; }
    }
    return LIFT.rise + level;
  }
  if (z >= -44) {
    const foot = HEIGHT_FN(0, 56);
    const t = Math.max(0, Math.min(1, (56 - z) / 86));
    return foot + (san - foot) * t;
  }
  if (z >= -60) return san;
  if (z >= -68) return san + (-60 - z) * 0.5;
  if (z >= -86) return ni;
  if (z > -98) return ni + (-86 - z) * 5 / 12;
  if (z >= -110) {
    if (x <= -12) return LIFT.rise + 9;
    if (x < -6 && z <= -102) return hon - (-6 - x) / 3;
    if (x >= 13) return LIFT.rise + 8;
    if (x > 6 && z >= -100) return hon - (x - 6) * 3 / 7;
    return hon;
  }
  return hon + (z + 110) * 0.4;
}
function prepareHeight() {
  if (HEIGHT_FN) return;
  // 標高が後から届いても、出来上がった道と建物の床を動かさない。
  terrainDem = dem;
  HEIGHT_FN = heightOf(MITSUKURI_PLAN, baseWithHori, 2.6);
  // 主郭１１ｍ＋盛り上げ＝麓から２１０ｍ。標高データの有無にかかわらず比高を保つ。
  LIFT.rise = HEIGHT_FN(0, 56) + 210 - 11;
  RIDGE_LIFT.rise = SOUTH_LIFT.rise = LIFT.rise;
  for (const k of KAN_TERRACES) k.y = HEIGHT_FN(k.x, k.z) + castleLift(k.x, k.z) + yamaLift(k.x, k.z, KAN_LIFT);
  ROAD_SEGMENTS = [];
  // 境目を道の点にも入れ、二の丸と本丸の床を平らに保つ。
  const cuts = [-30, -44, -60, -68, -86, -98, -110];
  for (const path of CASTLE_ROADS) for (let i = 1; i < path.pts.length; i++) {
    const pts = path.pts;
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const ts = [0, 1];
    if (dz) for (const z of cuts) { const t = (z - az) / dz; if (t > 0 && t < 1) ts.push(t); }
    ts.sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const t0 = ts[j - 1], t1 = ts[j], x0 = ax + dx * t0, z0 = az + dz * t0;
      const x1 = ax + dx * t1, z1 = az + dz * t1, sx = x1 - x0, sz = z1 - z0, l2 = sx * sx + sz * sz;
      if (l2 < 0.001) continue;
      ROAD_SEGMENTS.push({ ax: x0, az: z0, dx: sx, dz: sz, l2, ya: path.levels ? LIFT.rise + path.levels[i-1] + (path.levels[i]-path.levels[i-1])*t0 : roadLevel(x0, z0), yb: path.levels ? LIFT.rise + path.levels[i-1] + (path.levels[i]-path.levels[i-1])*t1 : roadLevel(x1, z1) });
    }
  }
}
function roadDistance(x, z) {
  prepareHeight();
  let best = Infinity;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    best = Math.min(best, Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t));
  }
  return best;
}
function height(x, z) {
  prepareHeight();
  let raw = HEIGHT_FN(x, z) + castleLift(x, z) + yamaLift(x, z, KAN_LIFT) + yamaLift(x, z, WADA_LIFT);
  // 遠景の四曲輪と麓は平らな段。建物・石垣もこの床を使う。形や配列は毎コマ作らない。
  if (x < -98) for (const k of KAN_TERRACES) {
    const edge = Math.max(Math.abs(x - k.x) - k.w / 2, Math.abs(z - k.z) - k.d / 2);
    if (edge >= 4) continue;
    const t = Math.max(0, Math.min(1, (4 - edge) / 4));
    raw += (k.y - raw) * t * t * (3 - 2 * t);
  }
  // 二の丸の奥（北）へ上る二つの段。三の郭から木戸を見上げた時、塀の上に段の重なりが出る（推定・遊びの補い）。
  if (z < -91 && z > -136 && x > -30 && x < 30) for (const k of KITA_DAN) {
    const edge = Math.max(Math.abs(x - k.x) - k.w / 2, Math.abs(z - k.z) - k.d / 2);
    if (edge >= 6) continue;
    const t = Math.max(0, Math.min(1, (6 - edge) / 6)), top = LIFT.rise + k.level;
    if (top > raw) raw += (top - raw) * t * t * (3 - 2 * t);
  }
  let best = Infinity, y = raw;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; y = q.ya + (q.yb - q.ya) * t; }
  }
  // 麓から柵の口までは半幅２．８ｍ。木戸と城内の幅・床は保つ。
  const shoulder = z > -44 ? 4.8 : 3.6;
  if (best >= shoulder) return raw;
  const t = Math.max(0, Math.min(1, (shoulder - best) / 2));
  return raw + (y - raw) * t * t * (3 - 2 * t);
}

// 大手と本丸へ続く西の道の切岸を細かな格子にする。歩く床・当たり・遠い山は変えない。
// 元の三角形の縁では凹凸をゼロにし、隣の面との隙間を作らない。開戦時に一度だけ。
function detailCliff(W) {
  const source = W.terrain.geometry, pos = source.attributes.position;
  const sourceIndex = source.userData.terrainViewIndex || source.index.array;
  const attrs = Object.entries(source.attributes).map(([name, attr]) => ({ name, attr, data: Array.from(attr.array) }));
  const reliefWeights = new Array(pos.count).fill(0);
  const indices = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let k = 0; k < sourceIndex.length; k += 3) {
    const ia = sourceIndex[k], ib = sourceIndex[k + 1], ic = sourceIndex[k + 2];
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    normal.crossVectors(ab.copy(b).sub(a), ac.copy(c).sub(a)).normalize();
    if (x < -95 || x > 38 || z < -130 || z > -16 || Math.abs(normal.y) > 0.88) {
      indices.push(ia, ib, ic); continue;
    }
    const divisions = 6, rows = [];
    for (let i = 0; i <= divisions; i++) {
      const row = []; rows.push(row);
      for (let j = 0; j <= divisions - i; j++) {
        const u = i / divisions, v = j / divisions, w = 1 - u - v;
        const edge = Math.max(0, Math.min(1, 12 * Math.min(u, v, w)));
        reliefWeights.push(edge * edge * (3 - 2 * edge));
        const index = attrs[0].data.length / attrs[0].attr.itemSize;
        row.push(index);
        const px = a.x * w + b.x * u + c.x * v, py = a.y * w + b.y * u + c.y * v;
        const pz = a.z * w + b.z * u + c.z * v;
        // 岩の薄い段と欠け。道に近い縁では張り出させない。
        const relief = edge * edge * (3 - 2 * edge) * Math.min(1, Math.max(0, (roadDistance(px, pz) - (pz > -44 ? 4.8 : 3.6)) / 2))
          * (0.14 * Math.sin(py * 3.8 + px * 0.4 + pz * 0.3) + 0.07 * Math.cos(px * 2.1 - pz));
        for (const { name, attr, data } of attrs) for (let n = 0; n < attr.itemSize; n++) {
          let value = attr.array[ia * attr.itemSize + n] * w + attr.array[ib * attr.itemSize + n] * u + attr.array[ic * attr.itemSize + n] * v;
          if (name === 'position') value += normal.getComponent(n) * relief;
          data.push(value);
        }
      }
    }
    for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions - i; j++) {
      indices.push(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
      if (j < divisions - 1 - i) indices.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const { name, attr, data } of attrs) geo.setAttribute(name, new THREE.BufferAttribute(new attr.array.constructor(data), attr.itemSize, attr.normalized));
  // 元の三角形の縁にも連続する崩れを付ける。道・曲輪の平場は動かさない。
  // 世界の位置と共有の法線から一度だけ計算し、隣り合う面の縁を離さない。
  const points = geo.attributes.position, surface = geo.attributes.normal;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const region = Math.min(1, Math.max(0, Math.min(x + 95, 38 - x, z + 130, -16 - z) / 5));
    const slope = THREE.MathUtils.smoothstep(1 - Math.abs(surface.getY(i)), 0.12, 0.48);
    const verge = THREE.MathUtils.smoothstep(roadDistance(x, z), z > -44 ? 4.8 : 3.6, z > -44 ? 6.8 : 5.6);
    const weight = region * slope * verge;
    const scar = (Math.sin(x * 0.93 + z * 0.71 + Math.sin(y * 0.57)) * 0.25
      + Math.cos(z * 1.8 - x * 0.65 + y * 1.2) * 0.10) * weight;
    points.setXYZ(i, x + surface.getX(i) * scar, y + surface.getY(i) * scar, z + surface.getZ(i) * scar);
    reliefWeights[i] = Math.max(reliefWeights[i], weight);
  }
  // 境の法線は保ち、内側だけ細分した岩肌の向きへなじませる。
  // 元の法線だけでは凹凸に陰が付かず、大きな白い三角面のまま残る。
  const originalNormals = geo.attributes.normal.array.slice();
  geo.setIndex(indices); geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  for (let i = 0; i < normals.count; i++) {
    a.fromArray(originalNormals, i * 3);
    b.fromBufferAttribute(normals, i);
    a.lerp(b, reliefWeights[i]).normalize();
    normals.setXYZ(i, a.x, a.y, a.z);
  }
  // 細分で複製した同じ位置の法線をそろえ、三角形ごとの明暗の継ぎ目を消す。
  // 歩く格子と縁の位置は動かさず、開戦時だけ同じ頂点を集計する。
  const joined = new Map(), positions = geo.attributes.position;
  const vertexKey = (i) => `${Math.round(positions.getX(i) * 10000)},${Math.round(positions.getY(i) * 10000)},${Math.round(positions.getZ(i) * 10000)}`;
  for (let i = 0; i < normals.count; i++) {
    const key = vertexKey(i);
    let sum = joined.get(key);
    if (!sum) { sum = new THREE.Vector3(); joined.set(key, sum); }
    sum.x += normals.getX(i); sum.y += normals.getY(i); sum.z += normals.getZ(i);
  }
  for (let i = 0; i < normals.count; i++) {
    a.copy(joined.get(vertexKey(i))).normalize();
    normals.setXYZ(i, a.x, a.y, a.z);
  }
  geo.computeBoundingSphere();
  // 細分した切岸は全ての面を固定する。視点ごとの索引の詰め替えで
  // 足元や郭の外側が欠けないよう、この戦だけ描画前の間引きから外す。
  geo.userData.terrainViewIndex = geo.index.array;
  W.terrain.onBeforeRender = function() {};
  W.terrain.geometry = geo; source.dispose();
}

// 虎口の石段はまとめて描き、同じ高さの坂を歩く当たりに登録する。
function entranceSteps(rt) {
  const geos = [];
  const W = rt.world;
  // 角を落とした石を三形だけ用意する。上の一角は欠けて低くなる。
  const stones = [0, 1, 2].map((v) => {
    const cut = 0.04 + v * 0.015;
    const ring = [[-0.5 + cut, -0.5], [0.5 - cut, -0.5], [0.5, -0.5 + cut], [0.5, 0.5 - cut],
      [0.5 - cut, 0.5], [-0.5 + cut, 0.5], [-0.5, 0.5 - cut], [-0.5, -0.5 + cut]];
    const pos = [], indices = [];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) {
      // 踏面を広く平らに残す。大きな面取りと盛り上がった中心で、饅頭状の石にしない。
      const inset = r === 2 ? 0.985 : r === 0 ? 0.92 : 1;
      pos.push(ring[k][0] * inset, r === 0 ? -0.5 : r === 1 ? 0.34 : 0.49 - ((k * 3 + v * 2) % 5) * 0.012, ring[k][1] * inset);
    }
    for (let r = 0; r < 2; r++) for (let k = 0; k < 8; k++) {
      const a = r * 8 + k, b = r * 8 + (k + 1) % 8;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
    pos.push(0.04 - v * 0.03, 0.5, -0.03);
    for (let k = 0; k < 8; k++) indices.push(24, 16 + (k + 1) % 8, 16 + k);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(indices);
    const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
    return flat;
  });
  const boxBase = new THREE.BoxGeometry(1, 1, 1), patchBase = new THREE.CylinderGeometry(1, 1, 1, 7);
  const box = boxBase.toNonIndexed(), patch = patchBase.toNonIndexed();
  boxBase.dispose(); patchBase.dispose();
  box.deleteAttribute('uv'); patch.deleteAttribute('uv');
  const palette = [0x777366, 0x807969, 0x727163, 0x847d6c, 0x7a7768];
  const color = new THREE.Color();
  // 石・土・苔・割れ目は開戦時に一つへまとめ、毎コマの追加をしない。
  const piece = (source, x, y, z, w, h, d, tint, turn = 0) => {
    const g = source.clone(); g.scale(w, h, d); g.rotateY(turn); g.translate(x, y, z);
    color.setHex(tint);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < colors.length; k += 3) { colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geos.push(g);
    return g;
  };
  for (const [a, b] of [[[0, -60], [0, -68]], [honPoint(26), honPoint(10)]]) {
    const ya = height(...a), yb = height(...b), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // 緩い坂でも一枚が長い台にならないよう、踏面を半メートル以内にする。
    const n = Math.max(1, Math.ceil((yb - ya) / 0.22), Math.ceil(len / 0.5)), run = len / n;
    const ux = (b[0]-a[0])/len, uz = (b[1]-a[1])/len, turn = Math.atan2(ux,uz);
    let treadEnd = 0, treadY = ya;
    const stepPiece = (geo,x,y,z,w,h,d,tint,rot=0) => {
      const g = piece(geo,a[0]+uz*x+ux*z,y,a[1]-ux*x+uz*z,w,h,d,tint,rot+turn);
      const P = g.attributes.position;
      for (let k = 0; k < P.count; k++) {
        const px = P.getX(k), pz = P.getZ(k);
        const along = (px-a[0])*ux + (pz-a[1])*uz;
        // 各段の奥の実際の地面へ合わせる。元の坂との差を頂点ごとに足すと段がねじれる。
        const endY = W.heightAt(px+ux*(treadEnd-along), pz+uz*(treadEnd-along));
        let py = P.getY(k) + endY - treadY;
        // 石の底を土へ埋める。全幅の茶色い箱を敷かず、石ごとに地面へ据える。
        if (stones.includes(geo) && P.getY(k) < y - h * 0.4) py = Math.min(py, W.heightAt(px,pz)-0.08);
        P.setY(k, py);
        if (stones.includes(geo)) {
          const C = g.attributes.color;
          const localY = (P.getY(k) - endY - (y - treadY)) / h;
          // 夜の陰影に濃い頂点色を重ねて、蹴上げを黒い厚板にしない。
          const shade = 0.88 + 0.12 * THREE.MathUtils.smoothstep(localY, -0.4, 0.4);
          C.setXYZ(k, C.getX(k) * shade, C.getY(k) * shade, C.getZ(k) * shade);
        }
      }
    };
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, y = ya + (yb - ya) * t;
      treadEnd = len * t; treadY = y;
      const z = len * (i + 0.5) / n;
      // 下の土が細い目地からのぞく。段ごとに石の数と幅を変え、目地をずらす。
      const count = 4 + i % 2, weights = [];
      const edgeLeft = -1.6 - 0.12 * (0.5 + 0.5 * Math.sin(i * 2.17));
      const edgeRight = 1.6 + 0.14 * (0.5 + 0.5 * Math.cos(i * 1.73));
      let total = 0, edge = edgeLeft;
      for (let j = 0; j < count; j++) { const w = 0.8 + ((i * 7 + j * 3) % 5) * 0.13; weights.push(w); total += w; }
      for (let j = 0; j < count; j++) {
        const span = (edgeRight - edgeLeft) * weights[j] / total, x = edge + span / 2;
        const top = y + ((i + j * 2) % 3 - 1) * 0.008, depth = run - 0.014 - ((i * 3 + j * 7) % 5) * 0.008;
        // 一段の先端を一直線にそろえず、敷いた石ごとの小さな凹凸を残す。
        const stagger = (((i * 3 + j * 2) % 5) - 2) * (j === 0 || j === count - 1 ? 0.045 : 0.018);
        // 踏面の高さを保ち、石の厚みだけ抑える。底は上の処理で土へ埋める。
        stepPiece(stones[(i + j) % 3], x, top - 0.14, z + stagger, span - 0.018, 0.28, depth, palette[(i * 3 + j) % palette.length]);
        if ((i + j) % 3 === 0) {
          // 細い割れを二本で折り、石の表面に沿わせる。
          stepPiece(box, x - 0.06, top - 0.012, z + depth * 0.12, 0.012, 0.003, depth * 0.4, 0x48463b, 0.22);
          stepPiece(box, x - 0.06 - depth * 0.065, top - 0.012, z - depth * 0.18, 0.012, 0.003, depth * 0.25, 0x48463b, -0.35);
        }
        // 土と苔は踏む中央を避け、脇と目地に小さく残す。
        if (j === 0 || j === count - 1) {
          stepPiece(patch, x + (j === 0 ? -1 : 1) * span * 0.2, top - 0.015, z, span * 0.13, 0.006, depth * 0.19, i % 3 ? 0x596044 : 0x6b5940, i * 0.7);
        }
        edge += span;
      }
    }
    // 格子補間後の坂に沿う短い床。元の高さを結ぶ一本の坂では兵が宙に立つ。
    for (let i = 0, n = Math.ceil(len); i < n; i++) {
      const ax = a[0]+(b[0]-a[0])*i/n, az = a[1]+(b[1]-a[1])*i/n;
      const bx = a[0]+(b[0]-a[0])*(i+1)/n, bz = a[1]+(b[1]-a[1])*(i+1)/n;
      addRamp({ ax, az, bx, bz, ya: W.heightAt(ax,az), yb: W.heightAt(bx,bz), w: 3.2, step: 0.22 });
    }
  }
  // 設営時にそろえた石・土台・目地・苔へ、同じ縮尺の石肌を貼る。
  for (const g of geos) {
    const P = g.attributes.position;
    g.computeVertexNormals();
    // 石段の上面と側面に同じ縮尺の石肌を貼る。単色の大きな板に見せない。
    const N = g.attributes.normal, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) {
      const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      uv[i * 2] = (nx > ny && nx > nz ? P.getZ(i) : P.getX(i)) * 1.6;
      uv[i * 2 + 1] = (ny >= nx && ny >= nz ? P.getZ(i) : P.getY(i)) * 1.6;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  // 凹凸だけでは夜に無地の板になる。共有の石肌を明るさの狭い幅に収め、粒と割れを残す。
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTex(), bumpMap: stoneTex(), bumpScale: 0.065,
    emissive: 0x171913, emissiveIntensity: 0.2 });
  material.onBeforeCompile = (shader) => {
    // 夜の踏面にも空からの弱い明かりを残す。石肌を通し、発光する白板にはしない。
    shader.uniforms.uStepNight = W.nightU;
    shader.fragmentShader = 'uniform float uStepNight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 grain = texture2D(map, vMapUv).rgb;
        diffuseColor.rgb *= mix(vec3(0.72), vec3(1.18), smoothstep(vec3(0.12), vec3(0.68), grain));
      #endif`).replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * uStepNight * 0.12;`);
  };
  material.customProgramCacheKey = () => 'mitsukuriStepGrainNight';
  const mesh = new THREE.Mesh(mergeGeometries(geos), material);
  for (const g of [...geos, ...stones, box, patch]) g.dispose();
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 観音寺の四本の幟を、布と竿の二束にする。退去時は束ごと隠せる。
// 形と材質は既存の幟を共用し、揺れを計算する局所座標も保つ。
function batchKanFlags(flags) {
  const group = new THREE.Group(), byGeometry = new Map();
  for (const flag of flags) {
    flag.updateMatrixWorld(true);
    flag.traverse((mesh) => {
      if (!mesh.isMesh) return;
      let byMaterial = byGeometry.get(mesh.geometry);
      if (!byMaterial) { byMaterial = new Map(); byGeometry.set(mesh.geometry, byMaterial); }
      let entries = byMaterial.get(mesh.material);
      if (!entries) { entries = []; byMaterial.set(mesh.material, entries); }
      entries.push(mesh);
    });
  }
  for (const [geometry, byMaterial] of byGeometry) for (const [material, entries] of byMaterial) {
    // 近づいた時の透けと風の位相も、束の原点でなく各幟の位置で計算する。
    const instancedMaterial = material.clone(), compile = material.onBeforeCompile;
    instancedMaterial.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.vertexShader = shader.vertexShader.replaceAll('modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)',
        'modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)');
    };
    instancedMaterial.customProgramCacheKey = () => material.customProgramCacheKey() + '箕作の幟の束';
    const mesh = new THREE.InstancedMesh(geometry, instancedMaterial, entries.length);
    entries.forEach((entry, i) => mesh.setMatrixAt(i, entry.matrixWorld));
    mesh.castShadow = entries[0].castShadow;
    mesh.receiveShadow = entries[0].receiveShadow;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  return group;
}

// 六角の幟の布：晒していない木綿の色と、一本ごとの色むら・裾の汚れ・織りの筋。風の無い日でも重く垂れた布がゆっくり揺れる（はためかせない）。
// 揺れは「動きを減らす」で止める。材質は元の幟ごとに一つだけ作って使い回す。
const MK_CLOTH_T = { value: 0 };
const mkClothMats = new Map();
function mkClothMat(src) {
  let m = mkClothMats.get(src);
  if (m) return m;
  const compile = src.onBeforeCompile;
  m = src.clone();
  m.onBeforeCompile = (sh, r) => {
    compile.call(src, sh, r);
    sh.uniforms.uMkT = MK_CLOTH_T;
    sh.vertexShader = "uniform float uMkT;\nvarying vec2 vMkUv;\nvarying float vMkSeed;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float mkPh = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).x * 0.71 + (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z * 0.43;
      float mkFree = clamp((position.x - 0.025) / 0.75, 0.0, 1.0);
      float mkDown = smoothstep(0.0, 1.0, 1.0 - uv.y);
      float mkK = mkDown * (0.3 + 0.7 * mkFree);
      transformed.z += (sin(uMkT * 1.1 + mkPh + position.y * 0.8) * 0.065 + sin(uMkT * 2.3 + mkPh * 1.7 + position.x * 5.0) * 0.02) * mkK;
      transformed.x += sin(uMkT * 0.85 + mkPh) * 0.03 * mkDown * mkFree;
      vMkUv = uv; vMkSeed = fract(sin(mkPh * 12.9898) * 43758.5453);`);
    sh.fragmentShader = `varying vec2 vMkUv;
varying float vMkSeed;
float mkH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mkV(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mkH(i), mkH(i + vec2(1.0, 0.0)), f.x), mix(mkH(i + vec2(0.0, 1.0)), mkH(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      {
        float mkD = 1.0 - vMkUv.y;
        float mkM = mkV(vMkUv * vec2(4.0, 14.0) + vMkSeed * 31.0) * 0.6 + mkV(vMkUv * vec2(11.0, 40.0) + vMkSeed * 7.0) * 0.4;
        float mkStain = smoothstep(0.62, 0.9, mkV(vMkUv * vec2(3.0, 7.0) + vMkSeed * 53.0));
        vec3 mkTint = mix(vec3(0.80, 0.74, 0.62), vec3(0.72, 0.67, 0.56), vMkSeed);
        float mkDirt = smoothstep(0.45, 1.0, mkD) * 0.3 + (mkM - 0.5) * 0.24 + mkStain * 0.18;
        diffuseColor.rgb *= mkTint * (1.0 - mkDirt) * vec3(1.0, 0.985 - mkStain * 0.03, 0.96 - mkStain * 0.06);
        diffuseColor.rgb *= 0.965 + 0.035 * sin(vMkUv.x * 150.0 + mkV(vMkUv * vec2(2.0, 24.0)) * 3.0);
        // 垂れた布の縦の折り目の陰（形の襞に重ねて、平らな板に見せない）
        diffuseColor.rgb *= 0.86 + 0.14 * (0.5 + 0.5 * sin(vMkUv.x * 19.0 + vMkSeed * 6.0 + mkD * 1.3));
      }`);
  };
  m.customProgramCacheKey = () => src.customProgramCacheKey() + "_箕作の布";
  mkClothMats.set(src, m);
  return m;
}
// 城の共通の作りが立てた置き幟も、晒していない布の色むらと垂れた布の揺れに替える（白い板に見せない）。支度の後に一度だけ。
function mkClothSweep(scene) {
  const made = new Set(mkClothMats.values());
  scene.traverse((o) => { const m = o.isMesh && !o.isInstancedMesh && o.material; if (m && !made.has(m) && m.customProgramCacheKey?.().startsWith('置き幟の皺')) o.material = mkClothMat(m); });
}
function mkNobori(W, x, z, kind, h) {
  const g = nobori(W, x, z, kind, h), flag = g.userData.flag;
  if (flag) flag.material = mkClothMat(flag.material);
  return g;
}

// 箕作専用の透いた丸太柵。二段の横木と斜めの控え、削いだ杭先を共有形で並べる。
// 板塀と同じ当たりを使う所は見た目だけ替える。遠くでは杭と控えを間引く。
let mitsukuriSakuParts;
function mitsukuriSaku(W, lines, h = 2.1, solid = false) {
  if (!mitsukuriSakuParts) {
    // 本の柵の灰褐色の樹皮。写真は使わず、細い割れと擦れを一枚へ描いて共用する。
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a99e89'; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 64; i++) {
      const x = (i * 37) % 128, y = (i * 53) % 256;
      ctx.strokeStyle = i % 3 ? 'rgba(57,48,35,.25)' : 'rgba(224,211,185,.35)';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (i % 3 - 1) * 2, Math.min(256, y + 30 + i % 60)); ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    mitsukuriSakuParts = {
      wood: new THREE.MeshLambertMaterial({ color: 0x958774, map }),
      cut: new THREE.MeshLambertMaterial({ color: 0xa08c6b }),
      rope: new THREE.MeshLambertMaterial({ color: 0x9a8965 }),
      logs: [new THREE.CylinderGeometry(.85, 1, 1, 5), new THREE.CylinderGeometry(.85, 1, 1, 3)],
      tip: new THREE.ConeGeometry(1, 1, 3),
      tie: new THREE.CylinderGeometry(.115, .115, .065, 5, 1, true),
    };
  }
  const lod = new THREE.LOD(), matrix = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  // 山上でも近づけば細工を表示する。原点からの距離で常に遠景へ替えない。
  const centerX = lines.reduce((sum, line) => sum + line[0] + line[2], 0) / (lines.length * 2);
  const centerZ = lines.reduce((sum, line) => sum + line[1] + line[3], 0) / (lines.length * 2);
  lod.position.set(centerX, W.heightAt(centerX, centerZ), centerZ);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  const { wood, cut, rope, logs: logGeos, tip, tie } = mitsukuriSakuParts;
  for (const coarse of [false, true]) {
    const logs = [], tips = [], ties = [];
    const beam = (p, r, radius) => {
      a.set(...p); b.set(...r); dir.subVectors(b, a); q.setFromUnitVectors(up, dir.clone().normalize());
      matrix.compose(a.add(b).multiplyScalar(.5), q, new THREE.Vector3(radius, dir.length(), radius));
      logs.push(matrix.clone());
    };
    for (const [ax, az, bx, bz] of lines) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (coarse ? .9 : .36)));
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      if (!coarse && solid) Object.assign(solidSeg(ax, az, bx, bz, .15), { missileH: h, missileType: 'wood' });
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = W.heightAt(x, z);
        const seed = x * 2.31 + z * 1.73;
        const H = h + .21 * Math.sin(seed) + .08 * Math.sin(seed * 2.7);
        const leanX = Math.sin(seed * .7) * .09, leanZ = Math.cos(seed * 1.3) * .09;
        const radius = .078 + .018 * (1 + Math.sin(seed * 1.9)) * .5;
        beam([x, y - .25, z], [x + leanX, y + H - .2, z + leanZ], radius);
        matrix.makeScale(radius * .94, .3, radius * .94); matrix.setPosition(x + leanX, y + H - .05, z + leanZ); tips.push(matrix.clone());
        // 横木を結ぶ縄は近景だけ。五角の筒を使い回し、細かな縄のねじれは作らない。
        if (!coarse && i % 3 === 1) for (const hy of [.6, h * .78]) {
          matrix.makeTranslation(x, y + hy, z); ties.push(matrix.clone());
        }
        if (!coarse && i % 5 === 2) beam([x + nx * .85, W.heightAt(x + nx * .85, z + nz * .85), z + nz * .85], [x, y + h * .65, z], .065);
      }
      // 短い横木で斜面の高さに沿わせる。長い一本で地面へ埋めない。
      const spans = Math.max(1, Math.ceil(len / 3));
      for (let i = 0; i < spans; i++) for (const hy of [.6, h * .78]) {
        const x0 = ax + (bx - ax) * i / spans, z0 = az + (bz - az) * i / spans;
        const x1 = ax + (bx - ax) * (i + 1) / spans, z1 = az + (bz - az) * (i + 1) / spans;
        beam([x0, W.heightAt(x0, z0) + hy, z0], [x1, W.heightAt(x1, z1) + hy, z1], .065);
      }
    }
    const group = new THREE.Group();
    for (const [geo, mat, entries] of [
      [logGeos[coarse ? 1 : 0], wood, logs],
      [tip, cut, tips],
      [tie, rope, ties],
    ]) {
      if (!entries.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
      entries.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.position.copy(lod.position).negate();
      mesh.computeBoundingSphere(); mesh.castShadow = !coarse; mesh.receiveShadow = true;
      group.add(mesh);
    }
    lod.addLevel(group, coarse ? 85 : 0);
  }
  return lod;
}

// この戦の板葺きだけ補正する。共通の小屋や、ほかの戦の見た目には触れない。
function mitsukuriHut(W, x, z, w, d, o) {
  const batch = makeSimpleBatch();
  hut(W, x, z, w, d, 0, { ...o, weatheredBoards: true, solid: false, batch });
  // 軒から斜面伝いに屋根へ入れないよう、屋根の張り出しまで当たりを広げる。
  solidRect(x, z, w + 1.4, d + 1.4);
  const list = batch.byMat.values().next().value;
  const geo = list[0].geo, P = geo.attributes.position, C = geo.attributes.color;
  const H = o.h || 2.6, rh = (w / 2 + 0.7) * 0.42;
  let base = W.heightAt(x, z);
  for (const dx of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) base = Math.max(base, W.heightAt(x + dx, z + dz));
  // 元の形は、部品ごとに同じ頂点色が連続する。壁・妻を残し、棟板と石押さえだけを面へ寄せる。
  const barColor = new THREE.Color(0x4e473c), ridgeColor = new THREE.Color(0x4a4238);
  const wallColor = new THREE.Color(), weatherColor = new THREE.Color();
  const silverWood = new THREE.Color(0x978d7a), dampWood = new THREE.Color(0x504b3b);
  const angle = Math.atan(0.42), cos = Math.cos(angle), sin = Math.sin(angle);
  const roofY = (lx) => base + H + rh + 0.05 + 0.05 / cos - Math.abs(lx) * 0.42;
  for (let start = 0; start < P.count;) {
    let end = start + 1;
    while (end < P.count && C.getX(end) === C.getX(start) && C.getY(end) === C.getY(start) && C.getZ(end) === C.getZ(start)) end++;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = start; i < end; i++) { x0 = Math.min(x0, P.getX(i)); x1 = Math.max(x1, P.getX(i)); y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); }
    const cx = (x0 + x1) / 2 - x, cy = (y0 + y1) / 2;
    const same = (c) => Math.abs(C.getX(start) - c.r) < 0.000001 && Math.abs(C.getY(start) - c.g) < 0.000001 && Math.abs(C.getZ(start) - c.b) < 0.000001;
    if (cy > base + H && same(ridgeColor)) {
      // 棟を覆う板の両端を、両側の屋根面に接する高さへ寄せる。
      for (let i = start; i < end; i++) P.setY(i, P.getY(i) - Math.abs(P.getX(i) - x) * 0.42 + 0.05 / cos);
    } else if (cy > base + H && same(barColor)) {
      // 石を省く画質では複数の丸太が同じ色で続くため、高さの差は共通の式で求める。
      const dy = 0.05 + 0.11 / cos - 0.13;
      for (let i = start; i < end; i++) P.setY(i, P.getY(i) + dy);
    } else if (cy > base + H && x1 - x0 < 0.6 && C.getZ(start) > C.getX(start) * 0.7 && C.getY(start) > C.getX(start) * 0.9) {
      // 屋根上の灰色の石だけ。面に沿って傾け、押さえ木に下端を接する。
      const sign = Math.sign(cx);
      let bottom = Infinity;
      for (let i = start; i < end; i++) {
        const dx = P.getX(i) - x - cx, dy = P.getY(i) - cy;
        const lx = cx + dx * cos + sign * dy * sin, yy = cy - sign * dx * sin + dy * cos;
        P.setXY(i, x + lx, yy); bottom = Math.min(bottom, yy - roofY(lx));
      }
      for (let i = start; i < end; i++) P.setY(i, P.getY(i) + 0.12 / cos - bottom);
    } else if (Math.abs(y0 - base - .25) < .001 &&
      Math.abs(y1 - base - H + .1) < .001) {
      // 尾根の小屋の壁板だけ。柱・貫・戸・礎石・妻板は寸法で外す。
      // 写真の軒下の褪せと地際の湿りを既存頂点へ焼き込み、材質も面数も増やさない。
      wallColor.setRGB(C.getX(start), C.getY(start), C.getZ(start));
      const patch = .15 + .12 * (Math.sin(cx * 4.7 + z * 2.3) * .5 + .5);
      for (let i = start; i < end; i++) {
        const t = Math.max(0, Math.min(1, (P.getY(i) - y0) / (y1 - y0)));
        weatherColor.copy(wallColor).lerp(silverWood, patch + t * .13)
          .lerp(dampWood, (1 - t) * .48);
        C.setXYZ(i, weatherColor.r, weatherColor.g, weatherColor.b);
      }
    }
    start = end;
  }
  geo.computeVertexNormals();
  for (const [mat, entries] of batch.byMat) {
    if (!o.batch.byMat.has(mat)) o.batch.byMat.set(mat, []);
    o.batch.byMat.get(mat).push(...entries);
  }
}

// 写真の長屋の下屋と、屋敷ごとの板囲い。箕作の高画質だけに置く推定の細工。
// 板・柱は一つの箱を使い回し、遠くは葺き板と縦板の割りを省く。
let mitsukuriYardParts;
function mitsukuriWoodParts() {
  return mitsukuriYardParts ||= {
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };
}
function mitsukuriYards(W, nagayaBase) {
  mitsukuriWoodParts();
  const lod = new THREE.LOD(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color(), axis = new THREE.Vector3(0, 0, 1);
  lod.position.set(-12, nagayaBase, -73);
  for (const coarse of [false, true]) {
    const entries = [];
    const box = (x, y, z, w, h, d, hex, tilt = 0, acrossZ = false) => {
      pos.set(x + 12, y - nagayaBase, z + 73); scale.set(w, h, d);
      axis.set(acrossZ ? 1 : 0, 0, acrossZ ? 0 : 1);
      q.setFromAxisAngle(axis, tilt);
      entries.push({ matrix: matrix.compose(pos, q, scale).clone(), hex });
    };
    // 二の丸の長屋は東向き。既存の縁側の外に柱を立て、道の西側で下屋を止める。
    // 地面ではなく館の床高に桁を合わせ、柱の根元だけ実際の地面へ下ろす。
    const y = nagayaBase, pitch = .28, width = 1.8, n = coarse ? 1 : 18;
    for (let i = 0; i < n; i++) box(-6.85, y + 2.85, -77.3 + (i + .5) * 8.6 / n,
      width, .075, 8.6 / n - (coarse ? 0 : .012), i % 4 === 0 ? 0x88755e : 0x6f604e, -pitch);
    for (const x of [-7.5, -6.15]) box(x, y + 2.85 - (x + 6.85) * Math.tan(pitch) + .08, -73,
      .085, .1, 8.8, 0x514737, -pitch);
    box(-6.05, y + 2.48, -73, .14, .18, 8.8, 0x554735);
    for (const z of [-77, -74.35, -71.65, -69]) {
      const base = W.heightAt(-6.05, z) - .15, top = y + 2.55;
      box(-6.05, (base + top) / 2, z, .14, top - base, .14, 0x665640);
    }
    // 遠い小郭も一棟だけ裸で置かず、板囲いで屋敷の庭を分ける。尾根道側は開けておく。
    for (const [ax, az, bx, bz] of [
      [-125,-129,-125,-142], [-125,-142,-117,-142],
      [113,-140,113,-124], [104,-124,113,-124],
      // 尾根端も屋敷と蔵で一戸を成す。道へ向く南・東の口は板塀で閉じない。
      [-152,-171,-152,-182], [-152,-182,-135,-182],
      [88,-132,88,-139], [88,-139,99,-139],
    ]) {
      const len = Math.hypot(bx - ax, bz - az), n = coarse ? Math.ceil(len / 3) : Math.ceil(len / .32);
      const alongZ = ax === bx;
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = W.heightAt(x, z), h = 1.45 + (coarse ? 0 : .045 * Math.sin(i * 2.1));
        box(x, y + h / 2 - .08, z, alongZ ? .07 : len / n - .012, h,
          alongZ ? len / n - .012 : .07, [0x756650, 0x685a49, 0x80715c][i % 3]);
      }
      const spans = Math.ceil(len / 2.5);
      for (let i = 0; i <= spans; i++) {
        const t = i / spans, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = W.heightAt(x, z);
        box(x, y + .72, z, .13, 1.65, .13, 0x514534);
        if (i < spans) {
          const mx = x + (bx - ax) / spans / 2, mz = z + (bz - az) / spans / 2;
          box(mx, W.heightAt(mx, mz) + 1.48, mz, alongZ ? .18 : len / spans + .12, .09,
            alongZ ? len / spans + .12 : .18, 0x5b4e3c);
          // 写真の板塀の小さな切妻の笠。瓦は使わず、軒を両側へ出して雨を落とす。
          const boards = coarse ? 1 : Math.ceil(len / spans / .32);
          for (let j = 0; j < boards; j++) for (const side of [-1, 1]) {
            const t = (i + (j + .5) / boards) / spans;
            const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
            const width = len / spans / boards - (coarse ? 0 : .008);
            box(px + (alongZ ? side * .17 : 0), W.heightAt(px, pz) + 1.61,
              pz + (alongZ ? 0 : side * .17), alongZ ? .37 : width, .055,
              alongZ ? width : .37, j % 4 ? 0x70614f : 0x8b7960,
              side * (alongZ ? -.3 : .3), !alongZ);
          }
        }
      }
      if (!coarse) Object.assign(solidSeg(ax, az, bx, bz, .12), { missileH: 1.5, missileType: 'wood' });
    }
    const mesh = new THREE.InstancedMesh(mitsukuriYardParts.geo, mitsukuriYardParts.mat, entries.length);
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix); mesh.setColorAt(i, color.setHex(entry.hex));
    });
    mesh.castShadow = !coarse; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    lod.addLevel(mesh, coarse ? 75 : 0);
  }
  return lod;
}

// 曲輪と本陣の補修材。土へ直置きせず枕木へ積み、縄と運搬用の桟を添える。
// 箱の形と材質は板囲いと共用。近くは板の隙間、遠くは一塊だけにする。
function mitsukuriStores(W, x, z) {
  const { geo, mat } = mitsukuriWoodParts(), lod = new THREE.LOD();
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  let base = W.heightAt(x, z);
  for (const dx of [-1.3, 1.3]) for (const dz of [-.55, .55]) base = Math.max(base, W.heightAt(x + dx, z + dz));
  lod.position.set(x, base, z);
  for (const coarse of [false, true]) {
    const entries = [];
    const box = (x, y, z, w, h, d, hex) => {
      pos.set(x, y, z); scale.set(w, h, d);
      entries.push({ matrix: matrix.compose(pos, q, scale).clone(), hex });
    };
    for (const dx of [-.9, .9]) {
      // 高い側で材を水平に支え、低い側の枕木は地面まで下ろす。
      const bottom = Math.min(-.08, W.heightAt(x + dx, z) - base - .08);
      box(dx, (bottom + .22) / 2, 0, .2, .22 - bottom, 1.25, 0x514635);
    }
    if (coarse) box(0, .46, 0, 2.65, .45, 1.04, 0x796b57);
    else {
      for (let layer = 0; layer < 5; layer++) for (let row = 0; row < 3; row++)
        box((layer % 2) * .06, .27 + layer * .085, (row - 1) * .36,
          2.65 - layer * .025, .065, .33, [0x81735e, 0x6d604f, 0x968167][(layer + row) % 3]);
      for (const dx of [-.78, .82]) {
        box(dx, .69, 0, .035, .025, 1.09, 0xa18e67);
        for (const dz of [-.54, .54]) box(dx, .46, dz, .035, .46, .025, 0x8d7a55);
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
    entries.forEach((entry, i) => { mesh.setMatrixAt(i, entry.matrix); mesh.setColorAt(i, color.setHex(entry.hex)); });
    mesh.castShadow = !coarse; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    lod.addLevel(mesh, coarse ? 55 : 0);
  }
  return lod;
}

// 写真の竹束・木楯と、夕刻の陣の支度。配置・小屋の用途は推定。
// 攻め口の両脇と麓の端だけに置く。兵・道・曲輪・共有の城の形には手を加えない。
function mitsukuriCampDetail(rt) {
  const W = rt.world, { geo, mat } = mitsukuriWoodParts();
  const round = new THREE.CylinderGeometry(1, 1, 1, 6);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const ground = (x, z) => {
    const y = drawGroundAt(W, x, z);
    return Number.isFinite(y) ? y : W.heightAt(x, z);
  };
  const build = (cx, cz, shelter) => {
    const base = ground(cx, cz), lod = new THREE.LOD();
    lod.position.set(cx, base, cz);
    for (const coarse of [false, true]) {
      const boxes = [], rounds = [], group = new THREE.Group();
      const part = (list, x, y, z, w, h, d, hex, tilt = 0) => {
        dummy.position.set(x, y, z); dummy.rotation.set(tilt, 0, 0); dummy.scale.set(w, h, d);
        dummy.updateMatrix(); list.push({ matrix: dummy.matrix.clone(), hex });
      };
      // 丸太の両端を別々に接地させ、坂でも支えを浮かせない。
      const beam = (ax, ay, az, bx, by, bz, radius, hex) => {
        dir.set(bx - ax, by - ay, bz - az);
        const length = dir.length();
        dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        dummy.quaternion.setFromUnitVectors(up, dir.normalize()); dummy.scale.set(radius, length, radius);
        dummy.updateMatrix(); rounds.push({ matrix: dummy.matrix.clone(), hex });
      };
      const floor = (x, z) => ground(cx + x, cz + z) - base;
      if (shelter) {
        // 三間弱の片流れの陣小屋。入口は北、薪と飯櫃は奥へ寄せる。
        const top = Math.max(floor(-2, -1.5), floor(2, -1.5), floor(-2, 1.5), floor(2, 1.5)) + 2.3;
        for (const x of [-2, 2]) for (const z of [-1.5, 1.5])
          beam(x, floor(x, z) - .12, z, x, top - z * .18, z, .085, 0x64533e);
        for (const x of [-2, 0, 2]) beam(x, top + .38, -1.85, x, top - .38, 1.85, .07, 0x776248);
        const n = coarse ? 3 : 17;
        for (let i = 0; i < n; i++) part(boxes, -2.2 + (i + .5) * 4.4 / n, top, 0,
          4.4 / n - .014, .07, 3.8, [0x88765d, 0x71634f, 0x958068][i % 3], .2);
        // 背面だけ葦簀で風を切る。横と正面は開けて足元が見える。
        const reeds = coarse ? 4 : 24;
        for (let i = 0; i < reeds; i++) {
          const x = -2 + (i + .5) * 4 / reeds, y = floor(x, 1.5);
          part(boxes, x, y + .8, 1.5, 4 / reeds - .015, 1.6, .045,
            i % 3 ? 0x8f8057 : 0x796f4d);
        }
        for (const y of [.4, 1.2]) part(boxes, 0, floor(0, 1.5) + y, 1.54, 4.1, .035, .04, 0x554b33);
        for (let i = 0; i < (coarse ? 3 : 9); i++) {
          const x = -1.3 + (i % 3) * .18, y = floor(x, .7) + .1 + Math.floor(i / 3) * .15;
          beam(x, y, .1, x, y, 1.25, .08, i % 2 ? 0x66513a : 0x847054);
        }
        // 木の飯櫃と蓋、箍。遠くでは一塊にする。
        const y = floor(1.1, .65);
        part(rounds, 1.1, y + .35, .65, .36, .65, .36, 0x8a7352);
        part(rounds, 1.1, y + .71, .65, .39, .06, .39, 0xa38a60);
        if (!coarse) for (const h of [.12, .54])
          part(rounds, 1.1, y + h, .65, .37, .045, .37, 0x514837);
      } else {
        // 野戦写真の縦竹と三段の縄。竹束は一面の壁にせず二束だけ。
        for (const x of [-.55, .55]) {
          const y = floor(x, 0), n = coarse ? 5 : 17;
          for (let i = 0; i < n; i++) {
            const a = i * 2.39996, r = coarse ? .2 : .25 * Math.sqrt((i + .5) / n);
            part(rounds, x + Math.cos(a) * r, y + 1.05, Math.sin(a) * r,
              coarse ? .12 : .065, 2.05 + Math.sin(i * 3.1) * .09,
              coarse ? .12 : .065, [0x74734a, 0x96905a, 0x626746][i % 3]);
          }
          for (const h of [.3, 1.05, 1.8])
            part(rounds, x, y + h, 0, .34, .065, .34, 0x9c8357);
          beam(x, y + 1.6, .15, x, floor(x, 1.05) + .03, 1.05, .065, 0x6c593d);
        }
        // 傍らに立て掛けた板楯。背の横桟と控え脚まで同じ束へ入れる。
        const x = 1.7, y = floor(x, .1);
        for (let i = 0; i < (coarse ? 1 : 3); i++)
          part(boxes, x + (coarse ? 0 : (i - 1) * .26), y + .87, .1,
            coarse ? .79 : .25, 1.7, .065, i % 2 ? 0x9b855f : 0x897652, -.12);
        for (const h of [.35, 1.35]) part(boxes, x, y + h, .25, .88, .08, .09, 0x5f5039);
        beam(x, y + 1.3, .25, x, floor(x, 1) + .03, 1, .055, 0x6a573c);
      }
      for (const [shape, list] of [[geo, boxes], [round, rounds]]) {
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(shape, mat, list.length);
        list.forEach((entry, i) => { mesh.setMatrixAt(i, entry.matrix); mesh.setColorAt(i, color.setHex(entry.hex)); });
        mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
      }
      lod.addLevel(group, coarse ? 38 : 0);
    }
    // 細い竹・縄は遠景に残さない。更新処理・動く障害物は増やさない。
    lod.addLevel(new THREE.Group(), 110); rt.scene.add(lod);
  };
  for (const x of [-15, 14]) build(x, -39, false);
  for (const x of [CAMP.x - 28, CAMP.x + 28]) build(x, CAMP.z + 29, true);
}

// 攻め口の山肌。岩・根・草と丸太・土は開戦時にまとめ、毎コマ追加しない。
// 三の郭の取り合いの跡：庭の土に刺さった矢、落ちた陣笠、折れた槍の柄（一度だけ作り、三つの束で描く）。
// 25秒で着く三の郭の庭（茶の平らな土）に、ここで斬り合いがあった跡を見せる。中央の道と柵の口は空ける。
function sanYardDebris(rt) {
  const W = rt.world;
  const gy = (x, z) => { const y = drawGroundAt(W, x, z); return Number.isFinite(y) ? y : W.heightAt(x, z); };
  let seed = 7193;
  const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const shaft = new THREE.CylinderGeometry(.012, .012, .9, 4, 1, true); shaft.translate(0, .45, 0);
  const fl = new THREE.PlaneGeometry(.05, .14); fl.translate(0, .8, 0);
  const fl2 = fl.clone(); fl2.rotateY(Math.PI / 2);
  const arrowGeo = mergeGeometries([shaft.toNonIndexed(), fl.toNonIndexed(), fl2.toNonIndexed()]);
  const kasaGeo = new THREE.ConeGeometry(.36, .13, 10, 1);
  const poleGeo = new THREE.CylinderGeometry(.022, .022, 1, 5, 1); poleGeo.rotateZ(Math.PI / 2);
  for (const g of [shaft, fl, fl2]) g.dispose();
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshLambertMaterial({ color: 0xb59a6c, side: THREE.DoubleSide }), 70);
  const kasa = new THREE.InstancedMesh(kasaGeo, new THREE.MeshLambertMaterial({ color: 0x2a2620 }), 7);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x5c4630 }), 6);
  const o = new THREE.Object3D();
  const spot = () => {
    for (let k = 0; k < 12; k++) {
      const x = (R() - .5) * 26, z = -40 - R() * 22;
      if (Math.abs(x) < 2.2 || roadDistance(x, z) < 1.6) continue;
      const y = gy(x, z);
      if (Math.abs(gy(x + .6, z) - y) > .25 || Math.abs(gy(x, z + .6) - y) > .25) continue;   // 切岸と段の縁には置かない
      return [x, y, z];
    }
    return null;
  };
  let n = 0;
  for (let i = 0; i < 70; i++) {
    const p = spot(); if (!p) continue;
    // 北（三の郭の上の柵）から射込まれた矢は、南へ傾いて刺さる
    o.position.set(p[0], p[1] - .12, p[2]); o.rotation.set(-.35 - R() * .4, (R() - .5) * .8, (R() - .5) * .4, 'YXZ');
    o.scale.setScalar(.9 + R() * .2); o.updateMatrix(); arrows.setMatrixAt(n++, o.matrix);
  }
  arrows.count = n; n = 0;
  for (let i = 0; i < 7; i++) {
    const p = spot(); if (!p) continue;
    o.position.set(p[0], p[1] + .04, p[2]); o.rotation.set((R() - .5) * .5, R() * 6, (R() - .5) * .5); o.scale.setScalar(.9 + R() * .2);
    o.updateMatrix(); kasa.setMatrixAt(n++, o.matrix);
  }
  kasa.count = n; n = 0;
  for (let i = 0; i < 6; i++) {
    const p = spot(); if (!p) continue;
    o.position.set(p[0], p[1] + .03, p[2]); o.rotation.set(0, R() * 6, (R() - .5) * .08); o.scale.set(1.2 + R() * 1.6, 1, 1);
    o.updateMatrix(); poles.setMatrixAt(n++, o.matrix);
  }
  poles.count = n;
  for (const m of [arrows, kasa, poles]) { m.castShadow = false; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); rt.scene.add(m); }
}

function approachDetail(rt) {
  // 凹凸を加えた描画面へ岩・根・草を据える。足場の高さには手を加えない。
  const groundHeight = (x, z) => {
    const y = drawGroundAt(rt.world, x, z);
    return Number.isFinite(y) ? y : rt.world.heightAt(x, z);
  };
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const surfaceNormal = (x, z) => normal.set(
    groundHeight(x - 0.15, z) - groundHeight(x + 0.15, z), 0.3,
    groundHeight(x, z - 0.15) - groundHeight(x, z + 0.15)
  ).normalize();
  // 切岸の上の岩は夜に黒い丸い塊に見えるため描かない。位置は土と根の置き場にだけ使う。
  const rocks = { count: 72, setMatrixAt() {} };
  const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 5), new THREE.MeshLambertMaterial({ color: 0x786046 }), 288);
  // 幅広の三角板ではなく、共通の細く曲がる葉を使う。株の根元は暗く、葉先は枯れ色。
  const grassGeo = rockTuftShape(true);
  grassGeo.scale(1.5, 1.8, 1.5);
  const blades = grassGeo.attributes.position, bladeColors = [], bladeColor = new THREE.Color();
  const rootColor = new THREE.Color(0x484632), tipColor = new THREE.Color(0x99845a);
  for (let i = 0; i < blades.count; i++) {
    bladeColor.copy(rootColor).lerp(tipColor, Math.min(1, blades.getY(i) / 0.6));
    bladeColors.push(bladeColor.r, bladeColor.g, bladeColor.b);
  }
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(bladeColors, 3));
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 384);
  const soilPos = [], soilColors = [], color = new THREE.Color();
  // 土の面は小さく分けて実際の斜面へ密着させる。平らな板を浮かせない。
  const soilPatch = (x, z, sx, sz, fx, fz, width, depth, tint) => {
    color.setHex(tint);
    const vertex = (u, v) => {
      const px = x + sx * u + fx * v, pz = z + sz * u + fz * v;
      soilPos.push(px, groundHeight(px, pz) + 0.003, pz);
      // 土の端を透かし、草と地面へなじませる。
      const edge = Math.max(0, 1 - (2 * u / width) ** 2) * Math.max(0, 1 - (2 * v / depth) ** 2);
      soilColors.push(color.r, color.g, color.b, edge * 0.65);
    };
    const across = Math.ceil(width / 0.25), along = Math.ceil(depth / 0.2);
    for (let j = 0; j < across; j++) for (let k = 0; k < along; k++) {
      const u0 = width * (j / across - 0.5), u1 = width * ((j + 1) / across - 0.5);
      const v0 = depth * (k / along - 0.5), v1 = depth * ((k + 1) / along - 0.5);
      vertex(u0, v0); vertex(u1, v0); vertex(u0, v1);
      vertex(u1, v0); vertex(u1, v1); vertex(u0, v1);
    }
  };
  // 柱の礎石の周囲に雨だれと踏み固めた土。斜面へ密着させ、既存の土の束へまとめる。
  for (const side of [-1, 1]) for (const dz of [0, -1.6]) {
    const x = KIDO.x + side * 1.97, z = KIDO.z + dz;
    soilPatch(x, z, 1, 0, 0, 1, 1.15, 0.95, 0x62523d);
    soilPatch(x, z, 1, 0, 0, 1, 0.64, 0.55, 0x3f372a);
  }
  // 雨で削れた細い筋と乾いた縁を、道の外の斜面に沿わせる。
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = KIDO.z + 4.5 - i * 1.6, x = side * (4.5 + (i % 3) * 1.35);
    const n = surfaceNormal(x, z), fall = Math.hypot(n.x, n.z);
    if (fall < 0.2) continue;
    const fx = n.x / fall, fz = n.z / fall;
    soilPatch(x, z, -fz, fx, fx, fz, 0.28, 1.5, 0x514632);
    soilPatch(x + fz * 0.2, z - fx * 0.2, -fz, fx, fx, fz, 0.16, 1.3, 0x897254);
  }
  for (let i = 0; i < rocks.count; i++) {
    const side = i % 2 ? 1 : -1;
    const gateBank = i >= 48;
    const z = gateBank ? KIDO.z + 6 - Math.floor((i - 48) / 2) * 1.15 + Math.sin(i * 2.4) * 0.4
      : -43 + (i % 16) * 1.65;
    const x = side * (gateBank ? 4.6 + ((i * 0.618) % 1) * 4.4
      : 4.2 + Math.floor(i / 16) * 4 + Math.sin(i * 2.4) * 0.7);
    const n = surfaceNormal(x, z);
    dummy.position.set(x - n.x * 0.12, groundHeight(x, z) - n.y * 0.12, z - n.z * 0.12);
    dummy.quaternion.setFromUnitVectors(up, n);
    dummy.rotateY(i * 1.7);
    dummy.scale.set(0.6 + (i % 4) * 0.23, 0.4 + (i % 3) * 0.2, 0.6);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    // 岩の脇に露出した土。草と根は踏む道から離す。
    soilPatch(x, z + 0.35, -1, 0, 0, 1, 0.7 + (i % 3) * 0.2, 0.35, i % 2 ? 0x79674f : 0x68573f);
    // 根を四つの短い節に分け、急な崖でも山肌から浮かせない。
    for (let j = 0; j < 4; j++) {
      const ax = x + j * 0.3, az = z + 0.45 + 0.08 * Math.sin(i + j);
      const bx = x + (j + 1) * 0.3, bz = z + 0.45 + 0.08 * Math.sin(i + j + 1);
      const ay = groundHeight(ax, az) + 0.035, by = groundHeight(bx, bz) + 0.035;
      dir.set(bx - ax, by - ay, bz - az);
      dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      const length = dir.length();
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(0.65, length, 0.65); dummy.updateMatrix(); roots.setMatrixAt(i * 4 + j, dummy.matrix);
    }
  }
  for (let i = 0; i < grass.count; i++) {
    const j = i % 72, fringe = i >= 72 && i < 144;
    let x = (j % 2 ? 1 : -1) * ((fringe ? 11 : 3.9) + (j % 5) * 1.8 + Math.sin(j * 2.3) * 0.6);
    let z = -43 + Math.floor(j / 2) * 0.75 + Math.sin(j * 4.7) * 0.24;
    // 三の郭から木戸の脇にも小株を残す。中央の踏む道には置かない。
    if (i >= 144) {
      x = (j % 2 ? 1 : -1) * (4.3 + (j % 4) * 0.65 + Math.sin(j * 2.3) * 0.3);
      z = -44 - Math.floor(j / 2) * 0.58;
    }
    // 土手の中腹と天端にも株のまとまりを置く。道の縁から外へ広げ、等間隔の列を崩す。
    if (i >= 216) {
      const k = i - 216, cluster = Math.floor(k / 7), leaf = k % 7;
      x = (cluster % 2 ? 1 : -1) * (5.3 + (cluster % 4) * 1.7) + Math.sin(leaf * 2.4) * 0.8;
      z = -23 - Math.floor(cluster / 2) * 4.2 + Math.cos(leaf * 2.4) * 0.75;
    }
    // 最後の株は木戸両脇へ。裸の斜面を一列の草で縁取らず、岩際へ小さく固める。
    if (i >= 312) {
      const k = i - 312, clump = Math.floor(k / 6), leaf = k % 6;
      x = (clump % 2 ? 1 : -1) * (4.8 + (clump % 3) * 1.35) + Math.sin(leaf * 2.4) * 0.45;
      z = KIDO.z + 5 - Math.floor(clump / 2) * 2.1 + Math.cos(leaf * 2.4) * 0.5;
    }
    if (fringe) soilPatch(x, z, 1, 0, 0, 1, 1.5, 0.8, j % 2 ? 0x79674f : 0x73744b);
    const n = surfaceNormal(x, z);
    dummy.position.set(x + n.x * 0.04, groundHeight(x, z) + n.y * 0.04, z + n.z * 0.04);
    dummy.quaternion.setFromUnitVectors(up, n); dummy.rotateY(i * 2.4);
    const size = 0.45 + ((i * 0.618) % 1) * 0.85;
    dummy.scale.set(size, size * (0.65 + ((i * 0.371) % 1) * 0.6), size);
    dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
  }
  // 登り口の横木は細い丸太にする。頂部を歩く地面の高さへ合わせる。
  const logParts = 16;
  const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 6), new THREE.MeshLambertMaterial({ color: 0x796044 }), 48 * logParts);
  const a = ROAD_OTE[6], b = ROAD_OTE[7];
  for (let i = 0; i < 48; i++) {
    const diagonal = i < 32, t = diagonal ? (i + 0.5) / 32 : (i - 32 + 0.5) / 16;
    const dx = diagonal ? b[0] - a[0] : 0, dz = diagonal ? b[1] - a[1] : -13;
    const len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len, sx = -fz, sz = fx;
    const x = diagonal ? a[0] + dx * t : 0, z = diagonal ? a[1] + dz * t : -30 + dz * t;
    // 横木の間は地続きの土。端の幅だけ揺らし、紙のような等幅の板を並べない。
    const width = 2.65 + 0.12 * Math.sin(i * 1.7);
    // 土は地面の細かな絵を見せる。橙の一枚板になる土の上張りを置かない。
    for (let j = 0; j < logParts; j++) {
      const u0 = width * (j / logParts - 0.5), u1 = width * ((j + 1) / logParts - 0.5);
      const ax = x + sx * u0, az = z + sz * u0, bx = x + sx * u1, bz = z + sz * u1;
      const ay = groundHeight(ax, az) - 0.062, by = groundHeight(bx, bz) - 0.062;
      dir.set(bx - ax, by - ay, bz - az);
      // 三角形の境目をまたいでも、横木の腹を実際の土へ埋める。
      dummy.position.set((ax + bx) / 2, groundHeight((ax + bx) / 2, (az + bz) / 2) - 0.062, (az + bz) / 2);
      const length = dir.length();
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(1, length + 0.008, 1); dummy.updateMatrix(); logs.setMatrixAt(i * logParts + j, dummy.matrix);
    }
  }
  const soilGeo = new THREE.BufferGeometry();
  soilGeo.setAttribute('position', new THREE.Float32BufferAttribute(soilPos, 3));
  soilGeo.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 4));
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  for (const mesh of [roots, logs, soil]) { mesh.receiveShadow = true; rt.scene.add(mesh); }
}

// 開戦の列を道の折れに沿わせる。下知が出たら通常の隊の並びへ戻す。
function openingColumn(rt, g, back) {
  const pts = [...ROAD_OTE.slice(0, 8), [0, -38]], slots = [];
  g.formation = 'column'; g.colW = 2; g.spacing = 1.15;
  for (let i = 0; i < g.initial; i++) {
    let d = back + Math.floor(i / 2) * 1.5, j = pts.length - 1;
    while (j > 1 && d > Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])) {
      d -= Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); j--;
    }
    const a = pts[j - 1], b = pts[j], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const side = (i % 2 ? 1 : -1) * 0.55;
    slots.push({ x: b[0] - dx / len * d - dz / len * side, z: b[1] - dz / len * d + dx / len * side, heading: Math.atan2(dx, dz) });
  }
  const slotPos = g.slotPos;
  g.slotPos = function(i, n) {
    if (rt.flags.step < 2 || (g === rt.flags.ramNext && !rt.flags.ram2)) return slots[i];
    return marchSlot(this, i, n, slotPos);
  };
  g._sanMarchSlots = true;
  g.facing = g._face = slots[0].heading;
  placeGroup(rt, g, slots[0].x, slots[0].z);
  for (const u of g.units) { u.heading = slots[u.slot].heading; u.mesh.rotation.y = u.heading; u._sanRoad = ROAD_OTE; }
}

// 下知後も後列を九十九折りに沿わせる。直線の持ち場を崖の外へ伸ばさない。
// 城内の並びと斬り合いは従来どおり。道の計算と持ち場の入れ物は隊で使い回す。
function marchSlot(g, i, n, slotPos) {
  if (g.formation !== 'column' || g.order !== 'move' || g.anchor.z < -44 || !g.dest || g.dest.z > g.anchor.z + 0.3) return slotPos.call(g, i, n);
  const road = g.units[0]?._sanRoad || ROAD_OTE;
  const from = g._sanColumnFrom || (g._sanColumnFrom = { x: 0, z: 0, s: 0, d: 0 });
  sanRoadPoint(road, g.anchor, from);
  if (from.d > 9) return slotPos.call(g, i, n);
  const { sp, sd, cols } = g.layout(n), row = Math.floor(i / cols), col = i % cols;
  const inRow = Math.min(cols, n - row * cols), side = (col - (inRow - 1) / 2) * sp;
  let j = Math.min(road.length - 2, Math.floor(from.s));
  let a = road[j], b = road[j + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  let along = (from.s - j) * len - row * sd * 1.3;
  while (along < 0 && j > 0) {
    b = a; a = road[--j]; dx = b[0] - a[0]; dz = b[1] - a[1];
    len = Math.hypot(dx, dz); along += len;
  }
  // 木戸前の重複点には列を置かない。
  if (len < 0.01) return slotPos.call(g, i, n);
  along = Math.max(0, along);
  const slots = g._sanColumnSlots || (g._sanColumnSlots = []);
  const q = slots[i] || (slots[i] = { x: 0, z: 0 });
  q.x = a[0] + dx / len * along - dz / len * side;
  q.z = a[1] + dz / len * along + dx / len * side;
  return q;
}

// 庭の制圧に室内の兵を混ぜない。印の更新を待たず、現在の足元で調べる。
function courtyardHouse(rt, u) {
  for (const I of rt.flags.retreatHouses || []) {
    if (I.disabled) continue;
    const dx = u.pos.x - I.x, dz = u.pos.z - I.z;
    const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
    for (const lv of I.levels) if (Math.abs(x) <= lv.w / 2 + .05 && Math.abs(z) <= lv.d / 2 + .05 &&
      u.pos.y >= lv.y - .6 && u.pos.y <= lv.y + lv.h) return I;
  }
  return null;
}

function courtyardWay(rt, goal) {
  const house = courtyardHouse(rt, rt.player.u);
  return house ? rt.flags.houseExitWays.get(house)() : sanKuchiWay(rt.army, rt.player.u, goal);
}

function zoneGroundFighter(rt, u) {
  return marchFighter(u) && Math.abs(u.pos.y - rt.world.heightAt(u.pos.x, u.pos.z)) < 2 && !courtyardHouse(rt, u);
}

// 屋内や上階の仲間は庭の守りに未着。制圧と呼び寄せで同じ足元を見る。
function zoneNeedsFriend(rt, z, u) {
  return marchFighter(u) && (!z.test(u.pos.x, u.pos.z) || !zoneGroundFighter(rt, u));
}

// 携帯の短い任務札にも人数を残す。補足欄を閉じても、次の手が分かる。
function zoneTask(rt, z, id = 'main', action = '') {
  // 火入れ中の奪還でも、今いる地上の敵へ同じ印を向ける。
  if (id === 'main') {
    z._guideEnemy = null;
    let nearest = Infinity;
    if (z.enemies) for (const enemy of rt.army.units) if (enemy.team === 1 && zoneGroundFighter(rt, enemy) && z.test(enemy.pos.x, enemy.pos.z)) {
      const d = Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z);
      if (d < nearest) { nearest = d; z._guideEnemy = enemy; }
    }
  }
  const enough = (z.friends || 0) >= z.need;
  z._incoming = !enough && incomingFriends(rt, z);
  // 操作の選び直しより先に、今回の呼び先を渡す。
  rt.flags.callZone = enough ? null : z;
  const p = rt.player.u.pos;
  const approaching = id === 'main' && !z.test(p.x, p.z);
  const way = z.id === 'hon' ? '西の石段から本丸へ' : z.id === 'ni' ? '木戸から二の丸へ' : sanWay(rt);
  const name = z.id === 'hon' ? '本丸' : z.id === 'ni' ? '二の丸' : '三の郭';
  const callWait = Math.max(0, Math.ceil((rt.flags.callReadyAt || 0) - rt.t));
  const gather = z._incoming ? z.enemies ? '敵を払い、味方を迎えよ' : '旗で味方を迎えよ'
    : !z._callable ? z.enemies ? '敵を払え。呼べる組はいない' : noCallAdvice
      : callWait ? `${z.enemies ? '敵を払え' : '郭を守れ'}。呼び直しまで${callWait}秒` : z.enemies ? '敵を払い、味方を呼べ' : callAction(rt);
  const indoors = id === 'main' && courtyardHouse(rt, rt.player.u);
  const pause = id === 'main' ? zonePause(rt) : '';
  // 道の下知は郭の外だけ。到着したら、味方がまだ来ていなくても戦う手を示す。
  const next = pause || (indoors ? '戸口から庭の旗へ戻れ' : approaching ? action || way : !enough ? gather : z.enemies ? '地上の敵を払え' : z.owner === 'friend' ? '味方を残し、旗を守れ' : `あと${Math.max(1, Math.ceil(z.hold - z.holdT))}秒守れ`);
  const call = !pause && rt.flags.callSignalZone === z && rt.t < rt.flags.callSignalUntil
    ? rt.t < rt.flags.callSignalSecondAt ? '集合の法螺貝、一声目。' : '法螺貝の二声目、旗へ集合。' : '';
  // 「あと○人」は共通の知らせで「残る者」に変わる。制圧に要る人数は短い札にも残す。
  const status = enough ? z.enemies ? `敵${z.enemies}人` : ''
    : `味方${z.friends || 0}／${z.need}人${z.enemies ? `・敵${z.enemies}人` : ''}`;
  // 郭名は一度だけ。人数がそろったら残り秒数を先に読み取れる長さにする。
  const text = `${call}${next.includes(name) ? '' : name + '：'}${next}${status ? `（${status}）` : ''}`;
  if (id === 'main') nextObj(rt, text);
  else rt.obj(id, text, 'side', true);
  // 人数は本文に残し、補足には今の手と待つ理由だけを出す。
  rt.objProgress(id, pause ? '' : indoors ? '庭にいる仲間だけが守りに数えられる'
    : approaching ? '印をたどり、仲間と郭の中へ'
      : z.enemies ? '庭の敵を払え。屋内や上階の敵は追わずに守れ'
        : !enough ? z._incoming ? '仲間が向かっている。旗のそばで迎えよ'
          : !z._callable ? '近くの仲間と旗を守れ'
            : callWait ? '呼び直せるまで、旗のそばで守れ' : callAction(rt)
          : z.owner !== 'friend' ? '敵が入るか味方が足りなくなると数え直し' : '仲間と旗のそばで守れ');
  // 人数をそろえた後の待ちも下知で説明する。札は増やさず、同じ文は八秒以上あける。
  if (id === 'main' && (pause || indoors || !approaching) && z.owner !== 'friend') {
    const advice = pause || (indoors ? '戸口から庭へ戻れ。旗のそばで仲間を迎えよ' : z.enemies ? '郭の中に敵が残る。仲間と払え' : !enough
      ? z._incoming ? '仲間が向かっておる。郭の中で迎えよ' : !z._callable ? noCallAdvice : callWait ? '呼び直すまで、郭の中で敵に備えよ'
        : rt.nearestInteract()?.id === 'bandage' ? '先に手当てを済ませよ。仲間はその後で呼べ' : '仲間が足りぬ。味方を呼び、郭の中で迎えよ'
      : '人数はそろった。仲間と旗を守れ');
    if (z._advice !== advice && rt.t >= (rt.flags.zoneAdviceAt || 0)) {
      z._advice = advice;
      rt.flags.zoneAdviceAt = rt.t + 8;
      sayKino(rt, advice, 3);
    }
  }
  // 郭の印に案内をそろえる。人数不足の時も同じ場所に二枚目を重ねない。
}

// 傷ついて退いた兵に隊の中心を引かれず、戦える兵の位置から道を決める。
function fightingCenter(g) {
  const c = g._sanCenter || (g._sanCenter = { x: 0, z: 0 });
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (marchFighter(u)) { x += u.pos.x; z += u.pos.z; n++; }
  c.x = n ? x / n : g.anchor.x; c.z = n ? z / n : g.anchor.z;
  return c;
}

// 控えも現在地から登る。呼ぶたびに麓の道の始点へ引き返させない。
function sanApproach(g, path) {
  const c = fightingCenter(g);
  if (c.z <= -44) return;
  const road = g.units[0]?._sanRoad || ROAD_OTE;
  const from = g._sanGatherFrom || (g._sanGatherFrom = { x: 0, z: 0, s: 0, d: 0 });
  sanRoadPoint(road, c, from);
  // 谷の道も柵の南へ出てから中央の口を抜ける。
  const end = road === ROAD_OTE ? 8 : road.length;
  for (let i = Math.floor(from.s) + 1; i < end; i++) path.push(road[i]);
  path.push([0, -35], [0, -49]);
}

// 本丸への呼び直しは、いまいる曲がり角から先だけ。石段の途中の組を二の丸へ戻さない。
function honApproach(g, path) {
  const c = fightingCenter(g);
  const from = g._honGatherFrom || (g._honGatherFrom = { x: 0, z: 0, s: 0, d: 0 });
  sanRoadPoint(ROAD_HON, c, from);
  if (from.d > 3) path.push([from.x, from.z]);
  // 最後の館の中心へは入らず、呼び手が足す本丸の空き地へ進む。
  for (let i = Math.floor(from.s) + 1; i < ROAD_HON.length - 1; i++) path.push(ROAD_HON[i]);
}

// 郭へ入った仲間を孤立させない。人数が増えなければ、既存の控えも寄せる。
function gatherZone(rt, z) {
  if (z.friends >= z.need) { z._gatherSince = null; z._gatherFriends = z.friends; return; }
  // 敵だけの郭にも仲間を寄せる。本人が先に入るまで下知を止めない。
  const F = rt.flags;
  if (z._gatherSince == null || z.friends > (z._gatherFriends || 0)) z._gatherSince = rt.t;
  // 出入りで五人→六人を繰り返しても、控えを呼ぶ待ち時間を毎回延ばさない。
  z._gatherFriends = Math.max(z._gatherFriends || 0, z.friends || 0);
  let ready = 0;
  for (const g of F.oda) for (const u of g.units) if (marchFighter(u)) ready++;
  // 人数が足りる時の控えは木戸突破後だけ。木戸破りに残した控えを先に使い切らない。
  const callReserve = ready < z.need || (F.gatePass && rt.t - z._gatherSince >= 24);
  for (let i = 0; i < F.oda.length + (callReserve ? 1 : 0); i++) {
    const g = i < F.oda.length ? F.oda[i] : F.ramNext;
    if (gone(g) || g === F.torchHelp?.group) continue;
    if (g === F.ram && F.step === 3 && !F.gatePass) continue;
    if (!g.units.some((u) => zoneNeedsFriend(rt, z, u))) continue;
    const c = fightingCenter(g), d = Math.hypot(c.x - z.pos.x, c.z - z.pos.z);
    if (g._sanGatherZone !== z.id || g._sanGatherDistance == null || d < g._sanGatherDistance - 1) {
      g._sanGatherZone = z.id;
      g._sanGatherDistance = d; g._sanGatherAt = rt.t;
    }
    if ((g.order === 'move' || g.order === 'path' || g.order === 'assault') && rt.t - g._sanGatherAt < 24) continue;
    g._sanGatherDistance = d; g._sanGatherAt = rt.t;
    g.assault = null; g.width = Math.min(g.width, 6);
    const path = [];
    sanApproach(g, path);
    // 木戸のすぐ内側で縦隊の到着を待つと、後列の持ち場が門の外へ戻る。
    // 口の手前から郭の中央まで進め、各兵は sanKuchiWay で石段を通る。
    if (z.id !== 'san' && c.z > -64) path.push([SAN_C.x, SAN_C.z], [KIDO.x, KIDO.z + 3]);
    if (z.id === 'hon') honApproach(g, path);
    path.push([z.pos.x, z.pos.z]);
    if (g === F.ramNext && !F.ram2) {
      F.ram2 = true;
      sayKino(rt, '控えの組、旗へ続け！　仲間と郭を固めよ', 3);
    }
    routeOld(g, path, 2.6, () => { g.order = 'hold'; g.anchor = g.dest; });
  }
}

// 山道では縦隊を保ち、曲輪へ入る時は二段の槍衾へ詰める。
// 奥の段に立つ本丸の守備衆は、本丸へ攻め上がる時に本丸の東の口の内へ移る（一度だけ）。
//   奥の段は四方が切岸で歩いて下りられないので、カメラから奥の段も本丸の持ち場も見えない時にだけ移す（目の前で消えも湧きもしない）。
const HON_SEEN_V = new THREE.Vector3();
function honSpotSeen(rt, x, z) {
  const W = rt.world, cam = rt.camera.position, y = W.heightAt(x, z) + 1.4;
  HON_SEEN_V.set(x, y, z).project(rt.camera);
  if (Math.abs(HON_SEEN_V.x) > 1.1 || Math.abs(HON_SEEN_V.y) > 1.1 || HON_SEEN_V.z > 1) return false;
  for (let i = 1; i < 16; i++) {
    const t = i / 16, px = cam.x + (x - cam.x) * t, pz = cam.z + (z - cam.z) * t;
    if (W.heightAt(px, pz) > cam.y + (y - cam.y) * t + 0.3) return false;
  }
  HON_SEEN_V.set(x, y, z);
  return W.cameraBlockFraction(cam, HON_SEEN_V) === null;
}
function honDown(rt) {
  const F = rt.flags, g = F.honDef?.real;
  if (F.honDown || !g || gone(g) || g.routed || F.step < 4) return;
  const c = g.center();
  if (honSpotSeen(rt, c.x, c.z) || honSpotSeen(rt, c.x - 5, c.z) || honSpotSeen(rt, c.x + 5, c.z) || honSpotSeen(rt, HON_DEFEND.x, HON_DEFEND.z)) return;
  F.honDown = true;
  const facing = Math.PI / 2 - Math.PI / 9;
  g.width = 6; g.yariKneel = true; g.facing = g._face = facing;
  placeGroup(rt, g, HON_DEFEND.x, HON_DEFEND.z);
  for (const u of g.units) if (u.alive) { u.heading = facing; u.mesh.rotation.y = facing; }
}
function routeOld(g, pts, speed = 2.3, done = null) {
  if (!g) return;
  // 呼び直しても、同じ郭へ進む列を手前の曲がり角へ戻さない。
  const goal = pts[pts.length - 1];
  // 館の中心を庭へ置き換える時は、到着待ちの判定にも同じ行き先を残す。
  const honGoal = goal?.[0] === HON_C.x && goal?.[1] === HON_C.z;
  g._sanGoalX = honGoal ? HON_GATHER.x : goal?.[0];
  g._sanGoalZ = honGoal ? HON_GATHER.z : goal?.[1];
  if (!g._sanMarchSlots) {
    const slotPos = g.slotPos;
    g.slotPos = function(k, n) { return marchSlot(this, k, n, slotPos); };
    g._sanMarchSlots = true;
  }
  // 下知の短い道で、帰りにも使う山道全体を消さない。
  for (const u of g.units) if (!u._sanRoad) u._sanRoad = ROAD_OTE;
  let i = 0;
  const step = () => {
    if (!g.count || g.routed) return;
    if (i >= pts.length) { g.onArrive = null; g.arriveCount = g._sanArriveCount; if (done) done(); else { g.order = 'attack'; g.seekRange = g.isGun ? 50 : 16; } return; }
    let [x, z] = pts[i++];
    // 本丸への進軍・呼び寄せは同じ空き地で止め、館の白壁へ列を押し込まない。
    if (x === HON_C.x && z === HON_C.z) { x = HON_GATHER.x; z = HON_GATHER.z; }
    // 長い縦隊のままだと後列の持ち場が柵の外へ残り、郭の人数も到着待ちも満たせない。
    // 口の手前では共通の fitGroupSlots が幅を絞り、郭の中で二段に広がる。
    g.formation = [SAN_C, NI_C, HON_GATHER].some((c) => x === c.x && z === c.z) ? 'yari' : 'column'; g.colW = 2;
    // 狭い口では先頭の二人が着いたら列を進める。最後の持ち場では従来の人数を待つ。
    // 曲がり角で全隊の到着を待つと、後列の持ち場が前の柵の外へ戻ってしまう。
    if (!g._sanRouting) { g._sanArriveCount = g.arriveCount; g._sanRouting = true; }
    g.arriveCount = i < pts.length ? Math.min(2, g._sanArriveCount ?? 2) : g._sanArriveCount;
    g.order = 'move'; g.dest = { x, z }; g.speed = speed; g.onArrive = step;
  };
  step();
}

// 大手も谷の手も、外柵の口を通る。横へ開いた兵が柵へ直進して止まらないようにする。
function sanGroundPassage(army, from, goal) {
  if (army.wallBetween(from, -1, goal)) return false;
  const W = army.world, distance = Math.hypot(goal.x - from.x, goal.z - from.z);
  const n = Math.max(1, Math.ceil(distance / 0.6));
  let y = groundAt(W, from.x, from.z, from.y ?? W.heightAt(from.x, from.z));
  // 道の指定は急な斜面でも walkable を通す。途中の足場もたどり、切岸を近道にしない。
  // 石段の小さな段差は残し、登りも下りも同じ道を使う。計算用の点は作らない。
  const rise = Math.max(0.55, distance / n * 0.95);
  for (let i = 1; i <= n; i++) {
    const x = from.x + (goal.x - from.x) * i / n, z = from.z + (goal.z - from.z) * i / n;
    const h = groundAt(W, x, z, y);
    if (!W.walkable(x, z, y) || Math.abs(h - y) > rise) return false;
    y = h;
  }
  return true;
}

function sanDirect(army, u, goal) {
  return Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z) <= 12 && sanGroundPassage(army, u.pos, goal);
}

function sanKuchiWay(army, u, goal) {
  if (u.team !== 0 && !u.group?._sanCastleRoad) return goal;
  // 近くの歩いて届く相手には直接寄る。斬り合いを次の曲がり角へすり替えない。
  if (sanDirect(army, u, goal)) return goal;
  if (u.pos.z < -64 && goal.z < -64 && (u.pos.x < -16 || goal.x < -16)) {
    const from = u._sanFrom || (u._sanFrom = { x: 0, z: 0, s: 0, d: 0 });
    const to = u._sanTo || (u._sanTo = { x: 0, z: 0, s: 0, d: 0 });
    // 外の切岸から内側の道へ投影すると、入口を飛ばして柵へ直進してしまう。
    // 道を外れた時だけ、遮られない道の点へ戻してから石段をたどる。
    sanRoadPoint(ROAD_HON, u.pos, from, army); sanRoadPoint(ROAD_HON, goal, to);
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    if (!Number.isFinite(from.d)) {
      // 柵の長辺の外では道全体が隠れる。まず長辺に沿って東端の外へ回る。
      const dx = u.pos.x - HON_C.x, dz = u.pos.z - HON_C.z;
      const side = -dx * Math.sin(Math.PI / 9) + dz * Math.cos(Math.PI / 9);
      const along = dx * Math.cos(Math.PI / 9) + dz * Math.sin(Math.PI / 9);
      if (along < 23 && !inPoly(HON_POLY, u.pos.x, u.pos.z)) {
        // 最も張り出す柵は中心線から七・五ｍ。十ｍへ離れる一案だけでは
        // 切岸に当たり、歩ける柵沿いがあっても足元を案内し続けてしまう。
        // 狭い帯から順に試す。角を斜めに横切らず、地面と柵の当たりは全案で調べる。
        for (let i = 0; i < 3; i++) {
          const width = Math.min(10, 8.5 + i), t = (side < 0 ? -1 : 1) * Math.max(width, Math.abs(side));
          const s = Math.abs(side) < width - .5 ? along : 26;
          q.x = HON_C.x + s * Math.cos(Math.PI / 9) - t * Math.sin(Math.PI / 9);
          q.z = HON_C.z + s * Math.sin(Math.PI / 9) + t * Math.cos(Math.PI / 9);
          if (sanGroundPassage(army, u.pos, q)) return q;
        }
        return u.pos;
      }
      return u.pos;
    }
    if (from.d > 1.5) { q.x = from.x; q.z = from.z; return q; }
    const forward = to.s > from.s;
    let i = forward ? Math.floor(from.s)+1 : Math.ceil(from.s)-1;
    i = Math.max(0,Math.min(ROAD_HON.length-1,i));
    if (Math.hypot(u.pos.x-ROAD_HON[i][0],u.pos.z-ROAD_HON[i][1]) < 1.5) i += forward ? 1 : -1;
    if (i < 0 || i >= ROAD_HON.length || (forward ? i >= to.s : i <= to.s)) {
      if (sanGroundPassage(army, u.pos, goal)) return goal;
      q.x = from.x; q.z = from.z; return q;
    }
    q.x = ROAD_HON[i][0]; q.z = ROAD_HON[i][1];
    // 道に近くても、曲がり角への斜めの近道が柵や切岸を横切る時は先に道へ戻る。
    if (!sanGroundPassage(army, u.pos, q)) { q.x = from.x; q.z = from.z; }
    return q;
  }
  // 木戸の切岸は中央の石段を通る。広がった列が横の柵を押し続けない。
  for (const edge of COURT_EDGES) {
    const inward = u.pos.z >= edge && u.pos.z < edge + 20 && goal.z < edge;
    const outward = u.pos.z < edge && u.pos.z > edge - 22 && goal.z >= edge;
    if (!inward && !outward) continue;
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    q.x = 0;
    q.z = Math.abs(u.pos.x) > 1.2 ? edge + (inward ? 5 : -6) : edge + (inward ? -6 : 5);
    return q;
  }
  // 松明を取りに戻る組も、外柵の中央の口を抜けてから左右へ回る。
  if (u.pos.z >= -64 && u.pos.z < -44 && goal.z >= -44 && goal.z < -30) {
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    q.x = 0; q.z = Math.abs(u.pos.x) > 2.4 ? -49 : -35;
    return q;
  }
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

const SAN_ROAD_PROBE = { x: 0, z: 0 };
function sanRoadPoint(road, p, out, army = null) {
  if (army) {
    // 通常の進軍は最近点を一度だけ調べる。細かな探し直しは柵外へそれた時だけ。
    sanRoadPoint(road, p, out);
    SAN_ROAD_PROBE.x = out.x; SAN_ROAD_PROBE.z = out.z;
    if (sanGroundPassage(army, p, SAN_ROAD_PROBE)) return;
  }
  out.d = Infinity;
  for (let i = 0; i + 1 < road.length; i++) {
    const a = road[i], b = road[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t;
    SAN_ROAD_PROBE.x = x; SAN_ROAD_PROBE.z = z;
    const blocked = army && !sanGroundPassage(army, p, SAN_ROAD_PROBE);
    // 最近点が柵の向こうなら、同じ道の端と途中を探す。形・兵・毎コマの配列は増やさない。
    for (let j = 0; j <= (blocked ? 8 : 0); j++) {
      const k = blocked ? j / 8 : t;
      const px = a[0] + dx * k, pz = a[1] + dz * k, d = (p.x - px) ** 2 + (p.z - pz) ** 2;
      if (d >= out.d) continue;
      SAN_ROAD_PROBE.x = px; SAN_ROAD_PROBE.z = pz;
      if (army && !sanGroundPassage(army, p, SAN_ROAD_PROBE)) continue;
      out.x = px; out.z = pz; out.s = i + k; out.d = d;
    }
  }
  // 呼び手はメートルで道幅を比べる。距離の二乗のまま返さない。
  out.d = Math.sqrt(out.d);
}

// 信長公記巻一の四手の攻め。短い強襲なので、史料にない付城を新設しない。
const MITSUKURI_JIN = [
  battleJin('四手の寄せ', 0, { x: CAMP.x, z: CAMP.z + 22 }, Math.PI, [
    ['mkNobu', '本陣', '織田信長', 3000, CAMP.x, CAMP.z + 22, 'odaCamp', 'eiraku', 'oda'],
    ['mkKino', '大手の仕寄り', '木下藤吉郎', 1500, CAMP.x, CAMP.z - 6, 'kino', 'oda'],
    ['mkNiwa', '西の仕寄り', '丹羽長秀', 2000, CAMP.x - 22, CAMP.z - 4, 'niwa', 'oda', 'sujikai'],
    ['mkSaku', '大手の控え', '佐久間信盛', 2000, CAMP.x + 24, CAMP.z - 4, 'saku', 'oda'],
    ['mkAsai', '東の仕寄り', '浅井新八', 1500, 58, -70, 'asai', 'oda'],
  ], '各手の人数・持ち場は仮定。上洛軍全体の人数ではない。'),
  battleJin('曲輪の守り', 1, HON_C, 0, [
    ['mkSan', '外の小曲輪', '名は伝わらない', 220, SAN_C.x, SAN_C.z, 'sanDef', 'rokkaku'],
    ['mkNi', '二の丸', '名は伝わらない', 260, NI_C.x, NI_C.z, 'niDef', 'rokkaku'],
    ['mkEast', '東の曲輪', '名は伝わらない', 140, 48, -103, 'asaiFoe', 'rokkaku'],
    ['mkYoshida', '本陣', '城将', 180, HON_C.x, HON_C.z, 'honDef', 'rokkaku'],
  ], '城兵の総数・城将の名は信長公記に記載なし。八百人と各持ち場は仮定。旗は六角の紋で表す。'),
];

const mitsukuri = {
  compactIntro: true,
  // 柵と物見を画面中央の長方形で抜かない。近すぎる面だけ距離で避ける。
  nearSceneryScreenCut: false,
  standardClothScale: 0.75, // 狭い柵の口では隊旗の布を控えめにし、奥の守兵と槍先を見せる。
  introTaskFirst: true, // 人物紹介より先に、最初の行き先と勝つ条件を読む。
  introPeopleFolded: true, // 下知の下で人物名が半分だけ切れないよう、説明は開いて読む。
  introSides: { a: '織田勢', b: '六角勢' },
  introText: 'ひょうたんの旗に続き、柵の口へ。三の郭の敵を払い、味方四人で守ろう。',
  keepOpeningTaskLabel: true, // 携帯でも、指の動かし方だけでなく最初の攻め口を伝える。
  pauseTurnPractice: false, // 矢の回避中に見回す操作を待って、兵と任務の時計を止めない。
  dodgeTurnDuration: 0, // 大きな手の説明を重ねず、回避の方向と足元の印は残す。
  keepTaskWithDodge: true,
  dodgeAvoidNotices: true,
  keepRetreatReason: true, // 「ここへ」だけにせず、包囲・深手・息切れのどれで退くかを任務札に残す。
  keepRetreatGestureReason: true, // 携帯のなぞる操作でも、退く理由を本文から消さない。
  retreatForLimbWounds: false, // 止血後も残る足・腕のけがだけで、攻める郭の案内を消し続けない。
  dodgeLabel: (_rt, direction, rain) => direction || (rain ? '矢の雨の外へ' : '矢をよけ、味方のそばへ'),
  dodgeGuideLabel: (_rt, reached, rain) => reached ? 'ここで構え、敵を見よ' : rain ? '矢の雨の外へ' : '矢をよけ、足元の印へ',
  // 攻め止めと取り違えないよう、一時の矢よけと行き先を伝える。
  escapePlaceLabel: (_rt, rain) => rain ? '矢の雨だ。印へよけよ' : '矢をよけ、印へ',
  compactDodgeArrow: true, // 画面を横断する線で、味方の体と攻め口を隠さない。
  // 攻城の途中の退避であることを伝え、攻め止めの下知と区別する。
  retreatGuideLabel(rt, reached) {
    const p = rt.player, u = p.u;
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) return mitsukuri.treatmentGuideLabel(rt, cue);
    if (u.hp < u.maxHp * 0.3) return reached && p.treatmentReady
      ? '止まって「手当て」を三秒長押し' : '傷が深い。味方へ退け';
    if (u.wounds?.bleed > 0) return reached && p.treatmentReady
      ? '止まって「手当て」を三秒長押し' : '血が出ている。味方へ退け';
    if (u.mobbed) return '囲まれた。味方へ退け';
    if (p.sta < 20) return reached ? '足を止め、息を整えよ' : '息が切れた。味方へ退け';
    if (reached) {
      if (p.treatmentReady) return '止まって「手当て」を三秒長押し';
      return '一撃を防ぎ、仲間と進め';
    }
    // 歩数が後ろに付く携帯の札でも、動詞を途中で折らない長さにする。
    if (rt.t < (rt.retreatUntil || 0)) return '攻めを受けた。味方へ退け';
    return '味方と構えよ';
  },
  coverGuideTouchLabel: '長押しで\n印へよける',
  // 庭の攻防から、退く印で館や番所の狭い廊下へ誘い込まない。
  // 自分で入った建物からは出られるよう、今いる室内だけは除く。
  retreatPointAllowed(rt, point) {
    // 道の脇の切岸や堀底を休む場所にしない。道を外れた兵は、緩い斜面から道へ戻れる。
    // 共通側が途中の点も調べるので、郭どうしを崖越しに結ぶ退避も除ける。
    if (!NAKA.cur) {
      const inCourt = MITSUKURI_PLAN.kuruwa.some((k) => inPoly(k.poly, point.x, point.z));
      const distance = roadDistance(point.x, point.z);
      if (!inCourt && distance > 2.8) {
        const p = rt.player.u.pos;
        if (distance >= roadDistance(p.x, p.z) || rt.world.slopeTan(point.x, point.z) > 0.7) return false;
      }
    }
    // 物見の足元は横木と梯子で囲まれる。休む印で骨組みの中へ誘わない。
    for (const tower of rt.flags.C?.towers || []) {
      const I = tower.naka;
      if (!I || NAKA.cur?.I === I) continue;
      const dx = point.x - I.x, dz = point.z - I.z;
      const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
      if (Math.abs(x) < 2.8 && z > -2.8 && z < 4) return false;
    }
    for (const I of rt.flags.retreatHouses || []) {
      if (I.disabled || NAKA.cur?.I === I) continue;
      const lv = I.levels[0], dx = point.x - I.x, dz = point.z - I.z;
      const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
      // 壁だけでなく縁側も空け、軒や柱へ視点を押しつけない。
      if (Math.abs(x) < lv.w / 2 + 1 && Math.abs(z) < lv.d / 2 + 1.5) return false;
    }
    return true;
  },
  // 矢をよける印も、退く印と同じく建物・物見・切岸を避ける。
  dodgePointAllowed(rt, point) {
    return this.retreatPointAllowed(rt, point);
  },
  treatmentTaskGuidance: true,
  // なぞるだけでは止血できない。退く操作と、止まって行う手当てを区別する。
  treatmentMoveCaption: '味方へ下がって手当て',
  keepWoundRetreatReason: true,
  keepDestinationTask: true, // 行き先の旗で「味方を呼ぶ」や必要な人数を消さない。
  keepCombatTask: true, // 構える間も、取る郭と集める人数を任務に残す。
  keepTaskLabel: true,
  keepGuardTaskLabel: true,
  keepTaskWithGuard: true,
  keepCombatTaskDetail: true,
  // 目の前の一人への「つく」で、郭を取る下知を置き換えない。
  // 深手・出血・包囲などの退避は、共通の優先判定をそのまま使う。
  combatTaskLabel(rt) {
    if (rt.flags.ending || !(rt.guideEnemyShown && rt.guideEnemy?.alive ||
      rt.hud.defendEnemy?.alive || rt.hud.attackGuideEnemy?.alive || rt.hud.approachGuideEnemy?.alive)) return '';
    for (const o of rt.objectives) if (o.id === 'main' && !o.state) return o.text;
    return '';
  },
  // 敵から離れて息を整える間は、元気な兵をさらに後ろへ誘わず攻め口を示す。
  // 深手・出血・包囲・被弾直後の退避は従来どおり優先する。
  routeGuidePriority: (rt) => !rt.flags.ending && !rt.flags.retreatMarked &&
    rt.player.inCombatT <= 0 && rt.player.sta >= 20 && rt.player.u.hp >= rt.player.u.maxHp * 0.3 &&
    !(rt.player.u.hp < rt.player.u.maxHp * 0.6 && rt.player.treatmentLeft > 0 && !rt.player.bandaged) &&
    !(rt.player.u.wounds?.bleed > 0) && !rt.player.u.mobbed && rt.t >= (rt.retreatUntil || 0),
  compactTravelArrow: true,
  guideArrowLength: 72, // 本丸の旗へ戻る時も、案内線で兵の背中と戦場を縦断しない。
  swipeArrowLength: 72, // 実旗へ結ぶ線も同じ長さに収める。共通の方向線とは別の描画経路。
  footFlagGuides: true, // 布の背丈いっぱいの囲みをやめ、到着点の小旗へそろえる。
  openingFootSignOnly: true, // 開幕の本人を縦長の枠で囲まず、足元の操作の輪だけ残す。
  compactGuardDestination: true, // 近い守り場は小さな旗と輪にし、味方の足元を隠さない。
  distanceUnit: 'steps', // 退く印と攻める印で、距離の単位を変えない。
  compactDestinationSign: true, // 大きな旗の印で柵の口と槍を隠さない。
  singleRetreatArrow: true, // 退く先への短い矢印一本にし、輪・点線・大矢じりを重ねない。
  compactRetreatArea: true,
  compactGroundGoalRing: true, // 退く印を地面の小旗にそろえ、近い兵を隠さない。
  compactFlagGuide: true, // 実物の旗を囲む輪・矢印・大旗を重ねず、足元の小旗で示す。
  goalFlagScale: 0.4,
  compactTreatmentSign: true, // 手当ての場所は小さな十字一つ。空中と地面へ二重に重ねない。
  edgeDestinationLabel(rt) {
    const F = rt.flags;
    const indoors = courtyardHouse(rt, rt.player.u);
    // 画面端の行き先も現在の下知に合わせる。段だけで決めると奪還中も先へ誘ってしまう。
    if (F.ending) return F.step === 4.5
      ? rt.G.lord ? '本陣で備えよ' : indoors ? '戸口から庭へ出よ' : F.endGathered ? '本丸を守れ' : '本丸の集合印へ'
      : indoors ? '戸口から庭へ出て退け' : '味方の後ろへ退け';
    // 主札が退避・救援や戸口を示す間は、画面端から攻め先へ誘わない。
    const pause = zonePause(rt);
    if (pause) return pause;
    if (indoors) return '戸口から庭へ出よ';
    // 郭に着いた後は、端の印も呼び寄せ・敵払い・守る秒数を伝える。
    const holding = !F.sanFell ? F.SZ?.byId.san
      : F.step === 3 && F.gatePass ? F.SZ?.byId.ni
        : F.step >= 4 ? F.SZ?.byId[F.niFell ? 'hon' : 'ni'] : null;
    if (holding?.test(rt.player.u.pos.x, rt.player.u.pos.z)) return this.travelGuideLabel(rt);
    if (F.step >= 2 && !F.sanFell) return sanWay(rt);
    if (F.step === 2.5) return rt.G.lord ? torchGuardAction(rt) : torchAction(rt);
    if (F.step === 3) return F.gatePass ? '二の丸へ' : F.gateAction || '木戸へ';
    if (F.step >= 4) {
      if (!F.niFell) return '二の丸へ';
      // 本丸に着いた人を石段へ戻さず、庭の旗へ案内する。
      return F.honWait || F.SZ.byId.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)
        ? '本丸の旗へ' : '西の石段へ';
    }
    return F.step >= 2 ? sanWay(rt) : '藤吉郎の旗へ';
  },
  treatmentApproachLabel: '手当ての印へ下がれ',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬から降りて手当て';
    if (p.treatmentReady) return p.treating ? 'そのまま押し続ける' : '「手当て」を三秒長押し';
    if (cue?.valid && Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) < cue.radius) return p.treatmentNext > rt.t
      ? '手当てまであと' + Math.max(1, Math.ceil(p.treatmentNext - rt.t)) + '秒' : '足を止め、手当てを待て';
    return p.u.wounds?.bleed > 0 ? '血が出ている。手当ての印へ' : '手当ての印へ下がれ';
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.ending && F.step === 4.5) return endGatherLabel(rt);
    // 攻め止めは屋内の案内より先に判定し、取り返す旗へ戻さない。
    if (F.ending) return courtyardHouse(rt, rt.player.u)
      ? '戸口から庭へ出て、味方の後ろへ退け' : '味方の後ろへ退け';
    const pause = zonePause(rt);
    if (pause) return pause;
    if (F.step === 2.5 && F.sanFell) return rt.G.lord ? torchGuardAction(rt) : torchAction(rt);
    if (courtyardHouse(rt, rt.player.u)) return F.step === 2.5 && F.sanFell ? '戸口から庭へ出て、松明へ'
      : F.step === 3 && !F.gatePass && F.sanFell ? '戸口から庭へ出て、木戸へ' : '戸口から庭の旗へ戻れ';
    if (F.honWait && F.sanFell && F.niFell && F.honFell) return '城は取った。本丸の旗へ';
    // 郭の奪還・呼び寄せ待ちも主札とそろえる。火入れ中の足軽は自分で灯せる。
    const z = F.callZone;
    if (z && !(F.step === 2.5 && F.sanFell && !rt.G.lord)) {
      const p = rt.player.u.pos;
      if (!z.test(p.x, p.z)) return z.id === 'hon' ? '西の石段から本丸へ' : z.id === 'ni' ? '木戸から二の丸へ' : sanWay(rt);
      // 目の前の敵を残したまま、到着待ちだけを促さない。主札・台詞とそろえる。
      if (F.step === 2.5 && F.sanFell && F.torchBlocked) return '松明のそばの敵を払え';
      if (z.owner !== 'friend' && z.enemies) return '郭の中の敵を仲間と払え';
      return z._incoming ? '郭の中で味方を迎えよ' : z._callable === false ? noCallAdvice : rt.t < (F.callReadyAt || 0) ? '郭を守り、呼び直しを待て' : callAction(rt);
    }
    // 人数がそろうと呼び寄せは終わるが、制圧はまだ続く。登り直しを促さない。
    const holding = !F.sanFell ? F.SZ?.byId.san
      : F.step === 3 && F.gatePass ? F.SZ?.byId.ni
        : F.step >= 4 ? F.SZ?.byId[F.niFell ? 'hon' : 'ni'] : null;
    if (holding && holding.owner !== 'friend' && holding.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
      if (holding.enemies) return '郭の中の敵を仲間と払え';
      if (holding.friends >= holding.need) return `あと${Math.max(1, Math.ceil(holding.hold - holding.holdT))}秒、仲間と旗を守れ`;
    }
    // 庭に着いたら石段へ戻さず、その場の旗を守る下知にする。
    if (holding?.test(rt.player.u.pos.x, rt.player.u.pos.z)) return holding.id === 'hon' ? '本丸の旗を守れ' : holding.id === 'ni' ? '二の丸の旗を守れ' : '三の郭の旗を守れ';
    if (F.step >= 2 && !F.sanFell) return sanWay(rt);
    if (F.step === 2.5) return !rt.G.lord ? torchAction(rt)
      : F.torchBlocked ? '松明のそばの敵を払え' : '松明を灯す組を守れ';
    if (F.step === 3) return F.gatePass ? '二の丸へ' : F.gateAction || '木戸へ';
    if (F.step >= 4) return F.niFell ? '西の石段から本丸へ' : '木戸から二の丸へ';
    return F.step >= 2 ? sanWay(rt) : '藤吉郎の旗へ';
  },
  terrainLookWeight: 0.25, // 崖を避けて寄った時も、足元だけを見ず進む先を残す。
  footFrameMinDistance: 3, // 壁際で肩へ寄った時は、足を収めるために地面へ向き直らない。
  // 演出と壁の補正が済んだ視点から、斜面までの余白を測る。室内・一人称は保つ。
  clampCamera(rt, pos) {
    const P = rt.player, u = P.u, F = rt.flags, W = rt.world;
    if (rt.game?.photo || rt._rts?.on || P.fpK >= 0.5 || P.mounted || !F.camAim) return;
    const aim = F.camAim.set(u.pos.x, u.pos.y + 1.6, u.pos.z);
    // 室内の壁は共通の補正に任せ、戸口の柱だけは待たずに本人の側で止める。
    if (NAKA.cur) {
      nakaCamClamp(pos);
      const hit = W.cameraBlockFraction(aim, pos);
      if (hit !== null) pos.lerpVectors(aim, pos, Math.max(0, hit - 0.35 / Math.max(0.35, aim.distanceTo(pos))));
      return;
    }
    // 門をくぐる間は肩へ寄せ、梁の上から石段を見下ろさない。
    // 外の冠木と奥の木戸だけに効かせ、ほかの坂では元の距離を保つ。
    const gateDistance = Math.min(Math.hypot(u.pos.x, u.pos.z + 44), Math.hypot(u.pos.x - KIDO.x, u.pos.z - KIDO.z));
    const gateNear = Math.max(0, 1 - gateDistance / 5);
    // 視点補正は一コマに複数回呼ばれる。倍率を重ねず、門からの距離で上限を決める。
    const reach = gateNear > 0 ? Math.min(1, (1.8 + gateDistance * 1.4) / Math.max(0.001, Math.hypot(pos.x - aim.x, pos.z - aim.z))) : 1;
    const dx = (pos.x - aim.x) * reach, dz = (pos.z - aim.z) * reach;
    const y0 = Math.min(pos.y, aim.y + 1.2 - gateNear * 0.9);
    for (let attempt = 0; attempt < 6; attempt++) {
      // 切岸が背後を全部塞ぐ時は肩まで寄せる。最後も崖の上へ持ち上げない。
      const k = attempt === 5 ? 0 : 1 - attempt * 0.16;
      const x = aim.x + dx * k, z = aim.z + dz * k;
      let y = Math.max(y0, cameraGround(W, x, z) + 1.0);
      // カメラの端が横の切岸に埋まるのも防ぐ。
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, radius = 0.18 + k * 0.62;
        y = Math.max(y, cameraGround(W, x + Math.cos(a) * radius, z + Math.sin(a) * radius) + 0.65);
      }
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, h = cameraGround(W, aim.x + dx * k * t, aim.z + dz * k * t) + 0.8;
        y = Math.max(y, aim.y + (h - aim.y) / t);
      }
      if (y > aim.y + 1.8 && attempt < 5) continue;
      pos.set(x, y, z);
      // 土を避けて寄せた先も兵の胴や笠へ入れない。壁との判定より先に済ませる。
      avoidCameraBodies(rt.army.units, u, aim, pos);
      // 石垣・梯子・横木の向こうへ視点を戻さない。
      let hit = P.camBlockHit(aim, pos);
      // 中心の線が軒を外れても、視点の左右が屋根へ入らないよう余白を取る。
      const length = Math.max(0.001, Math.hypot(dx, dz));
      for (let side = -1; side <= 1; side += 2) {
        F.camProbe.copy(pos);
        F.camProbe.x += dz / length * 0.45 * side;
        F.camProbe.z -= dx / length * 0.45 * side;
        F.camProbe.y += 0.35;
        const edge = P.camBlockHit(aim, F.camProbe);
        if (edge !== null) hit = hit === null ? edge : Math.min(hit, edge);
      }
      if (hit !== null) pos.lerpVectors(aim, pos, Math.max(0, hit - 0.6 / Math.max(0.6, aim.distanceTo(pos))));
      const floor = cameraGround(W, pos.x, pos.z) + 0.8;
      // 壁から寄せた先の土が高い時、上げ直して梁や切岸へ戻さない。
      // 次の候補を肩へ寄せ、地面と壁を同じ位置で測り直す。
      if (floor > pos.y && attempt < 5) continue;
      pos.y = Math.max(pos.y, floor);
      break;
    }
  },
  frameCamera(rt, pos, look) {
    const P = rt.player, u = P.u, F = rt.flags;
    if (rt.game?.photo || rt._rts?.on || P.fpK >= 0.5 || P.mounted || !F.camAim) return;
    // 共通の地形補正と演出は、この戦の補正の後にも視点を動かす。
    // 最後の位置で兵を避ける。斜面でも共通補正が視点を動かすので、門以外も測り直す。
    const x = pos.x, y = pos.y, z = pos.z;
    const aim = F.camAim.set(u.pos.x, u.pos.y + 1.6, u.pos.z);
    if (!NAKA.cur) avoidCameraBodies(rt.army.units, u, aim, pos);
    const gateNear = Math.min(Math.hypot(u.pos.x, u.pos.z + 44), Math.hypot(u.pos.x - KIDO.x, u.pos.z - KIDO.z)) < 6;
    if (NAKA.cur || gateNear || pos.x !== x || pos.y !== y || pos.z !== z ||
      pos.y < cameraGround(rt.world, pos.x, pos.z) + 1 || rt.world.cameraBlockFraction(aim, pos) !== null) {
      mitsukuri.clampCamera(rt, pos);
      P.camPos.copy(pos);
    }
    // 室内では注視点まで壁を調べる。手前の二・四ｍだけでは、向かいの白壁を見続ける。
    // 実際の間仕切りも同じ視線で調べる。
    if (NAKA.cur) {
      if (look) {
        F.camProbe.copy(look);
        if (interiorBlocked(SOLIDS, pos, F.camProbe, false, 0, 0) || P.camBlockHit(pos, F.camProbe) !== null) {
          // 壁際で目元まで寄った時も、本人と同じ点を見ず、次に通る戸口へ向ける。
          const way = F.houseExitWays.get(NAKA.cur.I)?.();
          if (way) {
            F.camProbe.set(way.x, (way.y ?? u.pos.y) + 1.4, way.z);
            if (!interiorBlocked(SOLIDS, pos, F.camProbe, false, 0, 0) && rt.world.cameraBlockFraction(pos, F.camProbe) === null) look.copy(F.camProbe);
            else if (pos.distanceToSquared(aim) > .04) look.copy(aim);
          } else if (pos.distanceToSquared(aim) > .04) look.copy(aim);
        }
      }
      return;
    }
    // 壁を避けて本人へ寄るだけでは、壁一枚と足元しか見えなくなる。
    // 戸外で肩まで詰まった時だけ、同じ高さの左右の空きを探す。
    // 建物の箱は即座に測れ、点と方向は設営時の入れ物を使い回す。
    if (!NAKA.cur && pos.distanceToSquared(aim) < 2.25) {
      const back = F.camBack;
      back.set(pos.x - aim.x, 0, pos.z - aim.z);
      if (back.lengthSq() < .04) back.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      back.normalize();
      F.camClear.copy(back).multiplyScalar(3).add(aim);
      // 味方の列だけで寄った場合は、勝手に横へ回り込まない。
      const wallNear = rt.world.cameraBlockFraction(aim, F.camClear) !== null;
      for (let i = 0; wallNear && i < 6; i++) {
        const angle = (i % 2 ? -1 : 1) * (.55 + Math.floor(i / 2) * .5);
        const c = Math.cos(angle), s = Math.sin(angle), q = F.camProbe;
        q.set(aim.x + (back.x * c - back.z * s) * 2.6, aim.y + .3,
          aim.z + (back.x * s + back.z * c) * 2.6);
        if (cameraGround(rt.world, q.x, q.z) + .8 > q.y || rt.world.cameraBlockFraction(aim, q) !== null) continue;
        // 手前の面と横の切岸にも余白を残す。空いていない時は元の肩の位置を保つ。
        const clear = F.camClear;
        let groundBlocked = false;
        for (let j = 1; j <= 3; j++) {
          clear.copy(aim).lerp(q, j / 4);
          if (cameraGround(rt.world, clear.x, clear.z) + .8 > clear.y) { groundBlocked = true; break; }
        }
        if (groundBlocked) continue;
        clear.copy(q).sub(aim).normalize().multiplyScalar(.4).add(q);
        if (cameraGround(rt.world, clear.x, clear.z) + .65 > clear.y || rt.world.cameraBlockFraction(aim, clear) !== null) continue;
        pos.copy(q);
        avoidCameraBodies(rt.army.units, u, aim, pos);
        P.camPos.copy(pos);
        if (look) look.copy(aim);
        break;
      }
    }
    // 本人との間が空いていても、肩の横の壁が視線の直前を塞ぐことがある。
    // 建物が六ｍ以内に迫る時だけ本人側へ寄せる。
    // 兵の列や遠い塀では寄せず、箱と計算用の点は設営時の物を使う。
    let wallViewBlocked = false;
    if (look) for (let i = 0; i < 3; i++) {
      const distance = pos.distanceTo(look);
      if (distance < 0.01 || pos.distanceToSquared(aim) < 0.04) break;
      F.camProbe.copy(pos).lerp(look, Math.min(1, 6 / distance));
      if (P.camBlockHit(pos, F.camProbe) === null) break;
      if (rt.world.cameraBlockFraction(pos, F.camProbe) !== null) wallViewBlocked = true;
      // 最後まで目元へ押すと、本人も消えて正面の白壁だけになる。
      // 二度寄っても塞がる時は、空いている本人への視線で肩越しの姿を残す。
      if (i === 2) { look.copy(aim); break; }
      pos.lerp(aim, 0.5);
      mitsukuri.clampCamera(rt, pos);
      P.camPos.copy(pos);
    }
    // 壁を避けて本人へ寄るだけでは、目元まで縮んで白壁だけが残る。
    // 屋外で直前の建物が塞ぐ時は、本人の周囲の空いた側から肩越しに見る。
    // 地面・建物・近くの兵を同じ候補で調べ、毎コマの入れ物は作らない。
    if (look && !NAKA.cur) {
      const distance = pos.distanceTo(look);
      F.camProbe.copy(pos).lerp(look, Math.min(1, 6 / Math.max(.01, distance)));
      const blocked = rt.world.cameraBlockFraction(pos, F.camProbe) !== null;
      if (blocked || wallViewBlocked) {
        // 横へ回れる場所が無くても、壁へ視線を戻さない。
        if (pos.distanceToSquared(aim) > .04) look.copy(aim);
        const yaw = Math.atan2(pos.x - aim.x, pos.z - aim.z);
        for (let i = 0; i < 8; i++) {
          const angle = yaw + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 4;
          const candidate = F.camShoulder.set(aim.x + Math.sin(angle) * 2.4, aim.y + .5, aim.z + Math.cos(angle) * 2.4);
          if (cameraGround(rt.world, candidate.x, candidate.z) + .8 > candidate.y ||
            rt.world.cameraBlockFraction(aim, candidate) !== null) continue;
          avoidCameraBodies(rt.army.units, u, aim, candidate);
          if (candidate.distanceToSquared(aim) < 1.44 ||
            cameraGround(rt.world, candidate.x, candidate.z) + .8 > candidate.y ||
            rt.world.cameraBlockFraction(aim, candidate) !== null) continue;
          // 視点の幅も壁から離す。中心だけ通る軒下へ戻さない。
          let clear = true;
          for (let side = -1; side <= 1; side += 2) {
            F.camProbe.copy(candidate);
            F.camProbe.x += Math.cos(angle) * .45 * side;
            F.camProbe.z -= Math.sin(angle) * .45 * side;
            if (rt.world.cameraBlockFraction(aim, F.camProbe) !== null) { clear = false; break; }
          }
          if (!clear) continue;
          // 本人まで通るだけでは、その背後の障子が画面いっぱいに残る。
          // 本人の先にも三ｍの見通しがある側を選び、庭と戦う兵を視界に残す。
          F.camClear.copy(aim).addScaledVector(F.camBack.copy(aim).sub(candidate).normalize(), 3);
          if (rt.world.cameraBlockFraction(candidate, F.camClear) !== null) continue;
          pos.copy(candidate); look.copy(aim); P.camPos.copy(pos);
          break;
        }
      }
    }
  },
  jinkei: MITSUKURI_JIN,
  // 10/28：坂の矢と鉄砲で開始一分に命が三割まで減り、深手のまま郭を取れずに攻め止めになった（bot 5回に4敗）。受ける傷を七割、休む間は少し戻す。
  playerTaken: 0.7,
  playerRegen: 0.012,
  noTaisho: true, // 城将一人の討死で即勝ち・討ち取りの副任務を出さない。
  noWake: true,   // 城の部隊だけを本物へ替え、遠景の兵は重ねない。
  nobiki: true,   // 攻め止めの合図も、札と同じ法螺貝と退き太鼓にそろえる。
  armySignals: false, // 攻め・集合・退きとも、戦固有の音源と札を使う。
  syntheticBattleSound: true, // 箕作の声・蹄・火・風や川も録音へ替えず、合成音を使う。
  syntheticRallyCries: true, // 突撃は「おおう」、勝鬨は「えい、えい、おう」。札と同じ合成音だけを鳴らす。
  keepCompanyVoices: true, // 中距離でも敵の叫び・負傷の声を保ち、退く組には攻めの鬨を足さない。
  onRetreatSignal(rt) {
    const F = rt.flags;
    // 鳴り終わるまで待ち、古い攻め・集合の下知と鬨は取り消す。
    F.signalSerial = (F.signalSerial || 0) + 1;
    const serial = F.signalSerial;
    const valid = () => F.signalSerial === serial && rt.player.u.alive && !rt.result?.down && !rt.tracker.main;
    clearSignalCues(rt);
    // 退き太鼓が出る前から退き口を示す。古い攻めの札へ兵を戻さない。
    for (const o of rt.objectives) if (!o.state && (o.id === 'main' || o.id === 'keepSan')) rt.objFail(o.id);
    const retreat = rt.obj('retreat', '攻め止め。組を連れ、麓の陣へ戻れ', 'main', true);
    retreat.cue = SIGNAL_WAIT_LABELS.nobiki; retreat.cueT = rt.t;
    const wait = signalWait(rt);
    // 前の総懸かりと鬨を待つ間も、退き口の早仕舞いで合図を切らない。
    if (rt.withdrawal) rt.withdrawal.signalUntil = rt.t + wait + SIGNAL_SECONDS.nobiki + 1;
    rt.after(wait, () => {
      if (!valid()) return;
      const delay = playArmySignal(rt, 'nobiki', 1, (audible) => {
        if (!valid()) return;
        if (!audible) {
          signalCue(rt, 'nobiki', retreat, valid, false);
          return;
        }
        const o = rt.obj('retreat', '低い法螺貝。続く退き太鼓と鉦に合わせ、組を連れて麓へ戻れ', 'main', true);
        signalCue(rt, 'nobiki', o, valid);
        sayKino(rt, '低い法螺貝じゃ。続く退き太鼓と鉦が退く合図。組を散らさず、麓へ退け！', 5);
      });
      F.signalUntil = rt.t + delay + SIGNAL_SECONDS.nobiki;
      if (rt.withdrawal) {
        rt.withdrawal.signalUntil = F.signalUntil;
        rt.endT = Math.max(rt.endT, F.signalUntil - rt.t + 1);
      }
    });
  },
  // 普通・易では、満身から二十秒の近接戦でも退く余地を残す。
  meleeGrace: { rate: 0.035, burst: 0.07, interval: 0.9 },
  noticeLimit: 2,
  missionDialogue: true, // 箕作の下知は任務一枚と短い台詞で伝える。
  missionSingleLine: true,
  hideGuideSteps: true,
  // 右上の一枚に今の下知を残す。「呼べる組はいない」も途中で切らない。
  missionHeading(rt) {
    if (rt.flags.ending && rt.flags.step === 4.5) return endGatherLabel(rt);
    if (!rt.flags.ending) {
      const pause = zonePause(rt);
      if (pause) return pause;
    }
    for (const task of rt.objectives) if (task.kind === 'main' && !task.state) {
      return attackTaskText(rt, task.mitsukuriText || task.text);
    }
    return '藤吉郎の旗へ';
  },
  gateGuideOwnTask: true, // 木戸の任務と道案内は、この戦の主札と印にまとめる。
  quietOrders: true, // 更新した下知は八秒読み、その後は小さな目標印から開く。
  immediateTaskChanges: true, // 人数が足りたら、古い「味方を呼べ」を十秒残さない。
  nearAllyFadeRadius: 1.1, // 視点が体へ入る所だけ避け、隣で戦う味方の具足は濃く残す。
  nearAllySolidBody: true, // 胴だけ透けて顔・首・草摺が宙に残る姿を出さない。
  nearAllyWholeOcclusion: true, // 本人への視線を塞ぐ味方も、部位ごとの透かしへ回さない。
  compactPlayerSign: true, // 肩へ寄る視点では自分の輪を小さくし、梁や胴へ重ねない。
  playerSignMinScale: 0.4, playerSignScale: 0.4, // 小輪の下限も指定し、通常寸法へ戻さない。
  noUnitContrast: true, // 本人の具足からずれて残る白い人型を消し、足元の輪と敵味方の印で示す。
  teamSignsOnly: true, // 敵案内の骨に沿う太線も省き、笠・具足と構えを見せる。
  enemyCornerSign: true, // 敵案内が実際に読む指定。全身の箱を四隅の短い印へ替える。
  compactApproachGuide: true, // 敵へ近づく時も小さな足元の向きだけ示し、大旗を重ねない。
  compactFloorGuides: true,
  subtleTargetFrames: true, // 敵の全身を太い箱で囲まず、四隅で示す。
  compactEnemyFrame: true, // 攻撃中の囲みにも既存の四隅の印を使う。
  cornerEnemyGuide: true, // 接近・防御中の印も四隅へそろえ、門柱に重なる長い囲みを残さない。
  bodyHeightGuides: true, // 印の高さを一律の背丈でなく、その兵の背丈に合わせる。
  positionPersonGuide: true, // 骨の描画更新を待たず、現在の立ち位置へ敵の印を合わせる。
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: OPEN_PT[0] + 0.8, z: OPEN_PT[1], heading: Math.PI },
  noPlayerFoot: true, // 足元の白い輪は描いた印なので出さない（10/29 点付け）。
  // 身の回りの当時の場（timeslip_field.js）。永禄十一年九月十二日は今の十月初め・秋の雨上がり。
  // 箕作山の登り道は湿った赤土で、脇は色づいた秋草。柵の口・三の郭・二の丸・本丸と攻め上った所ほど、
  // 倒れた槍・六角方の旗・刺さった矢が多い。郭の板の間や台の上には置かない。
  timeslip: {
    wet: 0.35, pools: 0, dust: 0.3, trample: 0.3, debris: 1, arrows: 0.6, // 乾いた秋の夕方。空を映す水たまりが足元の白い輪に見えるので置かない（10/29）
    grass: 0x8e9058, grassTints: [0xffffff, 0xeadcae, 0xcfc08a], grassH: 1.05, tallGrass: 0.8,
    flagColors: [0xe6e0d0, 0x22201c, 0xd9b23a],
    fights: [[OPEN_PT[0], OPEN_PT[1] - 6, 24], [TORCH[2].x, TORCH[2].z, 20], [0, -75, 22], [-45, -95, 24]],
  },
  world: {
    allyTaken: 0.7,   // 10/28：郭ごとの制圧に要る味方が城兵の新手に削られ、二の丸・本丸の手前で攻め止めになった（bot 6回に4敗）。寄せ手の傷みを七割に
    nearAllyFadeRadius: 1.1, // 兵の更新側も描画直前の全身よけへそろえる。
    blockedHint: () => '急な崖は通れない。二の丸から本丸へは西の道と石段を通れ',
    seed: 1568,
    // 八十ｍの一様な霞で郭の外の山肌まで空色にしない。
    // 既存の百五十ｍの描画上限内に収め、兵・草木の数や形は増やさない。
    battleViewDistance: 140,
    wind: [0.7, 0.7],   // 風向き・強さは景色の復元で、史料の断定ではない
    time: 'day', // 箕作用の時計で申の刻の西日から始める。雨上がりの時刻では時計が進まない。
    // 松明のある攻め口では、月と空の補助光を重ねて具足や木々を白くしない。
    nightLift: 1.35, nightFill: 0.16, nightMoonMin: 0.28,
    unitNightScale: 0.35, // 松明のそばで具足まで白くなる面の補光を控える。
    lowNightExposure: 0.45, // 携帯の夜だけの増感を抑え、火の暖色と月の陰を残す。
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.15,
    // 雨上がりの曲輪と道は濡れて黒ずんだ赤土。日の下で砂浜や雪のような白っぽい一枚にしない（10/28）。
    dirtTint: [0.7, 0.58, 0.47],
    muddyCastleFloor: 0.9,
    softPathSoil: true, // 道と草、湿った土の境を格子ごとに切らずにつなぐ。
    softEarthCrust: true, // 土塊の升の境で高さと陰が飛び、四角い敷石に見えるのを防ぐ。
    sparseEarthCrust: true, subtleMudRelief: true, // 乾いた山道は小さな土塊をまばらに残す。
    ordinaryFlagStride: 3, // 無名の足軽の指物は三人に一本。隊旗・旗持ち・本人の組は残す。割合は復元。
    kasaDrape: false, // 笠の下を一律の白い筒で覆わず、顔・耳・首と忍の緒を見せる。
    bareFallenHats: true, slopeLitter: true, // 落とした笠と長柄を、携帯でも坂へ沿わせる。
    variedInfantry: true, variedLoanArmor: true, variedHeadgear: true, // 六角の指定色にも既存の六組の褪せ・泥を付ける。
    branchFoliage: true, raggedNeedles: true, foldedNeedleCards: true, // 枝葉の共有形で樹冠の丸い塊と円錐を崩す。
    nearCedarBranches: true, // 高画質でも杉を木全体の板へ替えず、既存の枝房の奥行きを残す。
    // 杉も枝房が重なる既存の形を使う。疎らな一枝の絵を横へ寝かせた段々の樹冠を避ける。
    cedarBoughs: false,
    infantryWeight: true, // 目前の敵との間合いと前後列で、腰と膝の受けを分ける。
    meleeGroundedFeet: true, // 既存の近い十八人の枠内で、攻撃中も草鞋を坂へ接地させる。
    livingSpearHedge: true, contactDust: true, // 既存の後列の踏ん張りと近い足元の土煙。
    variedMarch: true, strideLimit: 0.95, // 坂の歩調を一人ずつずらし、敗走でも腿を上げすぎない。
    groundedFalls: true, settleSideFalls: true,
    terrainTriangles: true,   // 足を描く三角面に置き、斜面で体が地面に沈んで首だけ出るのを無くす（10/28 点付け）。
    contactFalls: true, // 倒れた体が地へ着いてから、具足の音と低い土煙を出す。
    terrainTags: true,
    terrainTriangles: true, // 急な切岸でも、歩く高さと描く地面の三角形をそろえる。
    stableSlopeGrain: true, // 曲がる斜面の法線で土と草の模様を細い縞へ引き延ばさない。
    softEarthCrust: true, sparseEarthCrust: true, // 土塊の陰を升の端で消し、四角い敷石のような継ぎ目を残さない。
    softPathSoil: true, // 道の縁も既存の連続した土色でつなぐ。
    terrainContactView: true, // 細分した切岸は、描く直前にも視点の四隅まで実際の面から離す。
    keepTerrainGrid: true, // 携帯でも切岸と石段の下の土を足場と同じ格子で描く。
    climbTan: 0.85,
    maxWalkDrop: 1.2, // 列を避けた一歩で切岸へ落ちず、石段と山道で上り下りする。
    clothFolds: true, // 既存の紋・乳・皺と風の処理を使う。
    plantedArrows: true, // 地面の矢は鏃を土へ入れ、白い羽だけが宙に浮く姿を避ける。
    groundedSlopeRocks: true, // 共通の接地する岩を選び、切岸に白い三角の面だけを残さない。
    rockDrawGround: true, rockSlopeContact: true, litRockTufts: true, // 描く山肌へ岩の腹を埋め、根草の裏も空の光で拾う。
    deferRockGround: true, deferRockCull: true, // 切岸の細分後の面へ据えてから、省略用の位置を控える。
    lookoutLogFrame: true, // 高画質の井楼だけ直立柱と交互の組み木を有効にする。
    lookoutDeckBraces: true, // 見張り床を受ける腕木。形は高さごとに共有し、遠景では斜材を省く。
    slopeRockFaces: true, curvedRockTufts: true, // 岩の厚みを斜面の外へ向け、根草も短い葉にする。
    noArrowRain: true, // 数人の弓兵から三十六本以上を足さず、本人が射た矢だけで攻め口を守る。
    scriptedArmySignals: true, // 札と下知に結んだ合図だけを鳴らし、背景の無関係な太鼓・法螺は叫びへ替える。
    locatedBattleVoices: true, // 鬨と馬の声は実在する兵・馬から。位置のない背景の声を重ねない。
    smallGunVolley: true, // 数挺の鉄砲組に、十四挺分の大きな斉射音を重ねない。
    smokeFogFloor: 65, // 発砲の煙は残し、近い門と守兵まで一様な白い霧で隠さない。
    lowHumanDetail: 24, // 前線の人数と骨の動きは保ち、遠い一般兵の顔・具足だけ既存の軽い形へ。
    paths: CASTLE_ROADS.map((p) => p.pts),
    fireLightLift: 0.85, // 火が重なる木戸前でも石肌と具足の陰を残す。
    roundedFire: true, // 共通の丸い炎を使い回し、松明の先を三角の板にしない。
    moveWay: sanKuchiWay,
    castleRoute: (from, to) => from === 'san' && to === 'ni' ? [[0, -60], [KIDO.x, KIDO.z], [NI_C.x, NI_C.z]]
      : from === 'ni' && to === 'hon' ? ROAD_HON : null,
    height,
    tint(x, z, h, c) {
      const rim = Math.max(0, Math.min(1, (roadDistance(x, z) - 2.8) / 3));
      const high = Math.max(0, Math.min(1, (h - 8) / 4));
      if (rim > 0 && high > 0) {
        const blend = rim * rim * (3 - 2 * rim) * high * high * (3 - 2 * high);
        const patch = Math.sin(x * 0.37 + Math.sin(z * 0.23)) * Math.cos(z * 0.31 - x * 0.12);
        c.r += (0.34 + patch * 0.07 - c.r) * blend;
        c.g += (0.38 + patch * 0.09 - c.g) * blend;
        c.b += (0.23 + patch * 0.05 - c.b) * blend;
      }
    },
    clear: (x, z) => roadDistance(x, z) < (z > -44 ? 4.8 : 3.8) || (Math.abs(x - CAMP.x) < 40 && Math.abs(z - CAMP.z) < 36) || (Math.abs(x - WADA.x) < 10 && Math.abs(z - WADA.z - 4) < 8) || KAN_TERRACES.some((k) => Math.abs(x - k.x) < k.w / 2 + 2 && Math.abs(z - k.z) < k.d / 2 + 2) || MITSUKURI_PLAN.kuruwa.some((k) => inPoly(k.poly,x,z)) || (Math.abs(x) < 26 && z < -92 && z > -132),
    // 近江の稲田（刈り入れ前）
    // 愛知川は五個荘の東。観音寺側の西麓に川を置かない。
    // 実際の川幅・距離・当時の流路の復元ではなく、東の遠景へ縮めた水筋。
    streams: [{ pts: [[176, -30], [166, 30], [150, 96], [162, 170]], w: 5, depth: 0.7 }],
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 0 || z > 150 || Math.abs(x - CAMP.x) < 42 || Math.abs(x) > 150) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.6;
    },
    trees: 520,
    tufts: 3400,
    grassSlopeMax: 0.85, // 切岸の岩に黒い草の束を貼りつけない。
    treeDensity: (x, z) => (z > 0 ? 0.2 : 1),
    // 箕作山の山腹は杉の木立。本数は変えず、山側の樹種を杉へ寄せて固まりで生やす。
    sugiAt: (x, z) => (z < 10 ? 1 : 0.3),
    // 山肌の地面の石は少なく。切岸に黒い丸い塊を並べない。
    rocks: 70,
    groves: [{ x: -50, z: 20, r: 12, n: 16 }, { x: 60, z: 30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -118 && Math.abs(x) > 40)),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    rt.def.timeslip.skip = (x, z) => groundAt(W, x, z, W.heightAt(x, z) + 30) > W.heightAt(x, z) + 0.25;   // 板の間・台の上は床に隠れる
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・秋草（def.timeslip）
    // 共通の回避表示は任務の本文を隠す。箕作だけ、今攻める郭を残す。
    // 開戦札の戦名を使うので、別の戦へ移ればこの指定は効かない。
    if (!document.getElementById('mitsukuri-task-css')) {
      const style = document.createElement('style');
      style.id = 'mitsukuri-task-css';
      style.textContent = `html body #hud.mitsukuri #h-prog {
          max-width:min(480px,60vw); white-space:normal;
        }
        html body #hud.mitsukuri #h-prog .pg-st span {
          max-width:100%; white-space:normal; overflow-wrap:anywhere;
          font-size:max(18px,calc(18px * var(--text-scale,1))); line-height:1.4;
        }
        /* 任務だけの共通表示でも、この戦の台詞は選ばれた一枚だけ残す。 */
        html:root body #hud.mitsukuri.mission-only #battle-notices #battle-message > #subtitle:not([hidden]):not(.notice-muted):not(:empty) {
          display:block !important;
        }
        html:root body #hud.mitsukuri #battle-notices #subtitle .more { display:none !important; }
        html body #hud.dodge-active:has(#intro[data-battle="mitsukuri"]) #battle-notices #objectives.keep-dodge-task:not(.expand) #obj-list { display:block !important; }
        @media (min-height:501px) {
          /* 左端の旗の案内と、傷を受けた知らせの間を八画素以上空ける。 */
          html:not(.touch) body #hud.mitsukuri #battle-notices:not(.choosing) {
            left:calc(112px + env(safe-area-inset-left, 0px)) !important;
          }
        }
        @media (max-height:500px) {
          /* 右端の操作欄と下の指の余白を避け、手当て・下知・任務の三枚を縦に収める。
             細い欄の高さまで画面の三分の一にすると、二枚目の台詞が半行で切れる。 */
          html body #hud.mitsukuri #battle-notices:not(.choosing):not(:has(#objectives.expand)),
          html.touch body #hud.mitsukuri #battle-notices:not(.choosing):not(:has(#objectives.expand)),
          html.touch body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
            left:auto !important; right:calc(112px + env(safe-area-inset-right, 0px)) !important;
            top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
            width:min(280px, 34vw) !important;
            max-height:calc(100% - 136px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
          }
          /* 会話の親も縮ませない。任務と同様、長い時は欄全体を送って読む。 */
          html body #hud.mitsukuri #battle-notices:not(.choosing) > #battle-message {
            flex:0 0 auto !important; height:auto !important; max-height:none !important;
            min-height:0 !important; overflow:visible !important;
          }
          html body #hud.mitsukuri #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
            font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
            line-height:1.4 !important;
          }
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) {
            position:relative !important; inset:auto !important; transform:none !important;
            flex:0 0 auto !important; width:100% !important; height:auto !important;
            max-height:none !important; overflow:visible !important;
          }
          /* 本文の外側と距離の行にも高さの制限が残ると、下端だけ切れてしまう。 */
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list,
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,small.goal-place) {
            height:auto !important; max-height:none !important; overflow:visible !important;
          }
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place {
            font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
            line-height:1.4 !important; white-space:normal !important;
          }
          /* 地面の印に結ぶ共通札は指定が強い。退避・手当ても同じ端の欄へ戻す。 */
          html body #hud.mitsukuri.single-guide #battle-notices:not(.choosing) #objectives:is(.ground-order,.travel-retreat.destination-sign,.linked-destination.ground-order):not(.expand) {
            position:relative !important; inset:auto !important; transform:none !important;
            width:100% !important; min-width:0 !important; max-width:100% !important;
            height:auto !important; max-height:none !important; box-sizing:border-box !important;
            padding:6px 8px !important;
          }
          html body #hud.mitsukuri.single-guide #battle-notices:not(.choosing) #objectives:is(.ground-order,.travel-retreat.destination-sign,.linked-destination.ground-order):not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
            font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
            line-height:1.4 !important; white-space:normal !important;
          }
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now,
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
            display:block !important; -webkit-line-clamp:unset !important; line-clamp:unset !important;
            height:auto !important; max-height:none !important; overflow:visible !important;
          }
          html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
            display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
            white-space:normal !important; overflow-wrap:normal !important; max-height:none !important;
          }
        }`;
      document.head.appendChild(style);
    }
    // 足場を透かすと切岸の向こうの空が白い三角面に見える。視点は既存の退避で守る。
    W.terrain.material.userData.camNearSolid = true;
    // 携帯の夜空を大きな白粒で埋めない。箕作の空だけ既存の星を小さく薄くする。
    if (W.stars) { W.stars.material.size = 0.45; W.stars.material.opacity = 0.25; }
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.litMask = 0; F.fow = true;
    F.camAim = new THREE.Vector3();
    F.camProbe = new THREE.Vector3();
    F.camBack = new THREE.Vector3();
    F.camClear = new THREE.Vector3();
    F.camShoulder = new THREE.Vector3();
    F.soilTorches = { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, -10000, 0)) };
    // 刺さって止まった矢も後で回収して射直す。景物へ結合すると空に古い写しが残る。
    // 出陣時の控えと、控えが尽きて追加する矢の両方を対象にする。
    // 行列の固定と景物の一括描画は別の除外指定なので、両方へ印を付ける。
    const makeArrow = rt.army.makeArrow;
    rt.army.makeArrow = function() {
      const a = makeArrow.call(this);
      a.mesh.userData.noFreeze = true;
      a.mesh.userData.noBatch = true;
      return a;
    };
    for (const a of rt.army.arrowPool) {
      a.mesh.userData.noFreeze = true;
      a.mesh.userData.noBatch = true;
    }
    // 地面の矢だけ十八本まで、十二秒で消す。人や柵への命中・射撃はそのまま。
    const pinArrow = rt.army.pinArrow, bakeArrow = rt.army.bakeArrow;
    rt.army.pinArrow = function(a, life, parent, support = null) {
      if (!parent && !support) {
        let count = 0;
        for (const other of this.arrows) if (other.groundPinned && other.life > 0) count++;
        if (count >= 18) { a.life = 0; return false; }
        life = Math.min(life, 12);
      }
      return pinArrow.call(this, a, life, parent, support);
    };
    rt.army.bakeArrow = function(a) { if (!a.groundPinned) bakeArrow.call(this, a); };
    // 斜面に沿う足元の薄い影。一束を使い回し、近い兵だけ十回／秒で更新する。
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ink = canvas.getContext('2d'), shade = ink.createRadialGradient(16, 16, 2, 16, 16, 16);
    shade.addColorStop(0, 'rgba(18,13,8,0.7)');
    shade.addColorStop(0.38, 'rgba(18,13,8,0.32)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
    ink.fillStyle = shade; ink.fillRect(0, 0, 32, 32);
    const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
    F.footShadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 250);
    F.footShadows.count = 0; F.footShadows.frustumCulled = false;
    F.shadowDummy = new THREE.Object3D(); F.shadowNormal = new THREE.Vector3(); F.shadowUp = new THREE.Vector3(0, 1, 0);
    rt.scene.add(F.footShadows);

    // 石そのものは止めず、この戦の同じ知らせだけ二分あける。
    const bark = rt.bark;
    rt.bark = function(text, warn) {
      // 閉じた木戸の脇は柵と切岸。奥の槍の列を見て、通れない横道へ誘わない。
      if (/^槍衾だ/.test(text) && F.step === 3 && !F.gatePass) {
        return bark.call(this, !F.sanFell ? '先に三の郭へ戻り、仲間と取り戻せ'
          : !this.G.lord && retreatRequired(this) ? '味方の後ろへ退け'
            : !this.G.lord && rescueTarget(this) ? '傷ついた仲間を守れ'
              : this.G.lord ? '木戸前の敵を払い、丸太の組を守れ' : '仲間と敵を払い、木戸の前で掛矢を使え', true);
      }
      // 兵を本物へ替えた場所だけで接近を断定しない。別の郭や柵の向こうはまだ遠い。
      if (/^(前|後ろ|左手|右手)から(敵|味方)が来るぞ！$/.test(text)) {
        const team = text.includes('敵') ? 1 : 0;
        const p = this.player.u;
        if (!this.army.units.some((u) => u.team === team && u !== p && marchFighter(u) && !u.isStruct &&
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 24 && Math.abs(u.pos.y - p.pos.y) < 4 &&
          !this.army.wallBetween(p.pos, p.team, u.pos))) return;
      }
      if (text === '上から石が来るぞ！') {
        if (this.t - (F.stoneWarnAt ?? -Infinity) < 120) return;
        F.stoneWarnAt = this.t;
      }
      return bark.call(this, text, warn);
    };
    // 共通の夜の補助光に重ねすぎず、切岸の土色と具足の陰を残す。
    F.slopeFill = new THREE.HemisphereLight(0xd6c6ae, 0x867252, 0.32);
    rt.scene.add(F.slopeFill);
    detailCliff(W);
    if (W.deferredGroundRocks) {
      groundRocks(W, W.deferredGroundRocks);
      W.viewCull([W.deferredGroundRocks], false && !window.__vegFull ? 0 : 40);
      W.deferredGroundRocks = null;
    }
    // 共通の地層の横筋を、箕作の攻め口では土・岩・草の不規則な斑に替える。
    const ground = W.terrain.material, compileGround = ground.onBeforeCompile;
    const groundProgramKey = ground.customProgramCacheKey();
    ground.onBeforeCompile = function(shader, renderer) {
      compileGround.call(this, shader, renderer);
      shader.uniforms.uMitsukuriTorches = F.soilTorches;
      shader.fragmentShader = 'uniform vec3 uMitsukuriTorches[4];\n' + shader.fragmentShader;

      // 面ごとの法線を土色・草色の境に使うと、細分前の三角形が大きな紙片に見える。
      // 草と土の色境だけ頂点の法線でつなぐ。絵の投影には共通の実面の向きを残す。
      // 投影まで頂点の向きへ戻すと、切岸にも上から絵を貼って縦に引き伸ばしてしまう。
      shader.fragmentShader = shader.fragmentShader.replace(
        'float slopeGrade = 1.0 - mix(abs(normalize(vWN).y), abs(gN.y), 0.65);',
        'float slopeGrade = 1.0 - abs(normalize(vWN).y);'
      ).replace(
        'float steep = smoothstep(0.10, 0.46, slopeGrade);',
        // 土と草の境を小さな斑で崩し、格子の縁を目立たせない。
        'float steep = smoothstep(0.10, 0.46, slopeGrade + (macro2 - 0.5) * 0.05);'
      ).replace(
        'float band = fract(vWP.y * 0.42 + lay * 2.6 + texture2D(tMacro, vec2(sx * 0.03, vWP.y * 0.02)).r * 0.9);',
        'float band = (texture2D(tMacro, uX * 0.075 + 0.37).r * an.x + texture2D(tMacro, uZ * 0.075 + 0.37).r * an.z) / max(0.001, an.x + an.z);'
      ).replace('vec3 cliff = mix(earth, stT, rockK);',
        `// 岩の絵は粒と割れに使い、白い紙片のような明暗差を作らない。
         stT = mix(earth, clamp(stT * vec3(0.78, 0.72, 0.62), earth * 0.72, earth * 1.28), 0.6);
         vec3 cliff = mix(earth * 1.12, stT, rockK * 0.65);
         // 雨溝と粒は共通部品の二方向投影を使う。混ぜた座標では斜めの崖で絵が伸びる。
         // 共通側の沢と同名の変数も宣言しない。`)
        .replace('cliff = mix(cliff, grassT * 0.85, lip * 0.45 * w.x);', 'cliff = mix(cliff, grassT * 0.95, lip * 0.18 * w.x);')
        .replace('veg * (1.0 - hollow) * 0.7);', 'veg * (1.0 - hollow) * 0.55);')
        .replace('col = mix(col, cliff, steep);', `// 切岸の土に、根を張った草の斑を不規則に残す（土と草のまだら）。
          float mkPatch = texture2D(tMacro, vec2(vWP.x + vWP.z, vWP.y * 1.6) * 0.06).r * 0.6
            + texture2D(tMacro, vec2(vWP.x - vWP.z, vWP.y * 1.3) * 0.17 + 0.41).r * 0.4;
          cliff = mix(cliff, grassT * vec3(0.62, 0.7, 0.5), smoothstep(0.5, 0.62, mkPatch) * 0.75);
          // 鍬と鋤で削った縦の跡（上下に長い暗い筋と、削り口の明るい縁）。
          float mkScr = texture2D(tMacro, vec2((vWP.x - vWP.z) * 0.85, vWP.y * 0.035) + 0.23).r;
          float mkLip = texture2D(tMacro, vec2((vWP.x - vWP.z) * 0.85 + 0.013, vWP.y * 0.035) + 0.23).r;
          cliff *= 1.0 - smoothstep(0.52, 0.68, mkScr) * 0.32 * (1.0 - smoothstep(0.5, 0.62, mkPatch));
          cliff += vec3(0.05, 0.035, 0.02) * smoothstep(0.08, 0.16, mkLip - mkScr);
          // 露出した切岸は土と岩の狭い色幅に収め、明るい斑が紙片のように浮くのを防ぐ。
          // 上限への切り詰めで土の粒まで一色にしない。明るさを緩く圧縮する。
          cliff = max(cliff, vec3(0.025, 0.018, 0.012));
          cliff *= 0.82 / (0.7 + dot(cliff, vec3(0.333)) * 1.4);
          col = mix(col, cliff, steep);`)
        // 大きな岩の絵を細かく繰り返す。上向き・横向きの両方に同じ縮尺を使う。
        .replaceAll('wuv * 0.12', 'wuv * 0.42')
        .replaceAll('uX * 0.12', 'uX * 0.42').replaceAll('uZ * 0.12', 'uZ * 0.42')
        .replace('vec2(0.11, 0.16)', 'vec2(0.42, 0.48)')
        .replace('float nearK =', `float grit = texture2D(tDirt, ruv * 1.1).r;
          dirt *= mix(0.72, 1.32, smoothstep(0.15, 0.75, grit));
          float nearK =`)
        .replace('uNight * 0.62', 'uNight * 0.32').replace('uNight * 0.28', 'uNight * 0.16')
        .replace('smoothstep(0.35, 0.8, uWet)', 'max(smoothstep(0.35, 0.8, uWet), uNight * (1.0 - macro2) * 0.18)')
        .replace('diffuseColor.rgb *= col;', `// 踏まれた土を夜にも残し、実際に灯った松明の足元だけ暖色にする。
          // 切岸の粒は横から貼る共通の土肌に任せ、真上から読む粒を重ねない。
          col *= mix(vec3(1.0), vec3(0.76, 0.69, 0.57) * mix(0.85, 1.15, mix(grit, 0.5, steep)), steep * 0.55);
          col *= 1.0 - smoothstep(0.1, 0.8, wear) * 0.18 * uNight;
          float torchSoil = 0.0;
          for (int i = 0; i < 4; i++) {
            vec3 gap = vWP - uMitsukuriTorches[i];
            torchSoil += exp(-dot(gap, gap) * 0.16);
          }
          col += vec3(0.16, 0.065, 0.016) * min(1.0, torchSoil) * uNight * (1.0 - steep);
          diffuseColor.rgb *= col;`);
    };
    ground.customProgramCacheKey = () => groundProgramKey + '|mitsukuriSoil';
    ground.needsUpdate = true;
    // 共通の弔いの台詞は、近くの味方が実際に倒れた後だけ通す。
    const battleSay = rt.say;
    const speechTimes = new Map();
    rt.say = function(speaker, text, seconds) {
      if (speaker === '木下藤吉郎' && /仲間が討たれたか|無念じゃ|その働き、忘れぬぞ/.test(text) &&
        !this.army.units.some((u) => u.team === 0 && !u.civ && !u.isStruct && !u.alive &&
          Math.hypot(u.pos.x - this.player.u.pos.x, u.pos.z - this.player.u.pos.z) < 24 &&
          Math.abs(u.pos.y - this.player.u.pos.y) < 4)) return;
      // 字幕を省く声の経路でも、話し手を替えた同じ台詞を八秒以内に重ねない。
      const last = speechTimes.get(text);
      if (last !== undefined && this.t - last < 8) return;
      speechTimes.set(text, this.t);
      return battleSay.call(this, speaker, text, seconds);
    };
    rokkakuTex();
    resetGates();

    // ---- 縄張り（castles/mitsukuri.js）：三の郭・二の丸・本丸。木戸は castle_plan.js に建てさせる ----
    // 土塁は既に地形にある。切岸へ張り出す飾りの盛り土を重ねない。
    // 灰褐色の頂点色へ暗い木肌をそのまま掛けると、夕方の板が黒く潰れる。
    // この城の板塀だけ木肌の明暗を狭める。材質は全区画で共用し、夜も通常の光で陰影を付ける。
    const fenceWood = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(),
      bumpMap: woodTex(), bumpScale: 0.045, roughness: 0.94, metalness: 0 });
    fenceWood.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 grain = texture2D(map, vMapUv).rgb;
          diffuseColor.rgb *= mix(vec3(0.55), vec3(1.05), smoothstep(vec3(0.025), vec3(0.55), grain));
        #endif`);
    };
    fenceWood.customProgramCacheKey = () => 'mitsukuriFenceWood';
    const castlePlan = { ...MITSUKURI_PLAN,
      // 切岸は既に地面にある。別の格子の薄い土を重ねると、交差した面が白い破れに見える。
      terrainBanks: true,
      kuruwa: MITSUKURI_PLAN.kuruwa.map((k) => ({ ...k,
        // 雨上がりの山城の平場は濡れた土。城の白い砂利の平場にしない（10/28 雪のように白く見えた）。
        floor: false,
        // 塀の名に「木戸」を含めると、門の案内が短い塀まで打たせてしまう。
        ...(k.id === 'ni' ? { name: '二の丸' } : {}),
        wallOpt: { ...k.wallOpt, mound: false, material: fenceWood, groundBoards: true,
        // 本丸と二の丸は写真の板笠の塀へ。外側の乱杭・透いた柵との違いを残す。
        // 既存の部品を指定するだけで、狭間・当たり・耐久・守兵の位置は共用する。
        ...(['hon', 'ni'].includes(k.id)
          ? { boardCap: true, boardSeams: true, boardRailsSide: 1,
            // 細長い本丸は館と塀が近い。控えは庭に余裕のある二の丸だけ。
            boardBracesSide: k.id === 'ni' ? 1 : 0 } : {}),
      } })),
      yagura: MITSUKURI_PLAN.yagura.filter((y) => y.id === 'monomi_ni').map((y) => ({ ...y,
        // 木戸の物見は既定の八・八ｍへ戻さず、床・梯子も十ｍへそろえる。
        ...({ height: 10, boarded: false }),
      })) };
    const C = F.C = buildCastlePlan(rt, castlePlan, { ladders: true, baseHeight: baseWithDem, edgeW: 2.6, buildGates: true, buildTowers: true, team: 1, life: false });
    // 館の外壁と室内は透かさず、視点を壁の手前へ寄せる。材質はこの戦だけで共有する。
    const houseInteriors = [], cameraHouses = [], interiorMaterials = new Map(), preparedInteriors = new WeakSet();
    F.retreatHouses = houseInteriors;
    F.houseExitWays = new Map();
    // 束ねた外壁の面判定は数コマ待つ。本丸の館へ視点が入らないよう、建物の箱は毎回すぐ調べる。
    // 箱・行列・線は設営時だけ作り、室内では既存の室内視点に任せる。
    const houseEye = new THREE.Vector3(), houseEnd = new THREE.Vector3(), houseHit = new THREE.Vector3();
    const houseRay = new THREE.Ray(), cameraBlock = W.cameraBlockFraction;
    W.cameraBlockFraction = (from, to) => {
      let hit = cameraBlock?.call(W, from, to) ?? null;
      for (const house of cameraHouses) {
        if (house.wall && (!house.wall.alive || house.wall.hp <= 0)) continue;
        if (NAKA.cur && house.interior !== NAKA.cur.I) continue;
        houseEye.copy(from).applyMatrix4(house.inverse);
        houseEnd.copy(to).applyMatrix4(house.inverse).sub(houseEye);
        const length = houseEnd.length();
        if (length < 0.0001) continue;
        let t;
        if (house.box.containsPoint(houseEye)) t = 0;
        else {
          houseRay.set(houseEye, houseEnd.multiplyScalar(1 / length));
          if (!houseRay.intersectBox(house.box, houseHit)) continue;
          t = houseHit.distanceTo(houseEye) / length;
        }
        if (t <= 1 && (hit === null || t < hit)) hit = t;
      }
      return hit;
    };
    // 室内は近づいてから別の組として作られる。外壁だけの処理では障子の網目が残る。
    // 壁の当たりと室内の視点制御を使い、内側の建具は透かさず濃く残す。
    const solidInterior = (source) => {
      // 視点判定だけの見えない壁と、灯りの薄い絵は元の用途を保つ。
      if (source.colorWrite === false || source.isShaderMaterial || (source.transparent && source.depthWrite === false)) return source;
      if (!interiorMaterials.has(source)) {
        const mat = source.clone(), compile = source.onBeforeCompile;
        mat.userData.camNearSolid = true;
        mat.transparent = false; mat.depthWrite = true; mat.alphaHash = false; mat.opacity = 1;
        mat.onBeforeCompile = function(shader, renderer) {
          compile.call(this, shader, renderer);
          // 共有元が別の建物で既に近接用へ変わっていても、点描を持ち込まない。
          shader.fragmentShader = shader.fragmentShader.replace('if (camKeep < grain) discard;', '')
            .replaceAll('diffuseColor.a *= camKeep;', '');
        };
        mat.customProgramCacheKey = () => source.customProgramCacheKey() + '|mitsukuriInteriorSolid';
        interiorMaterials.set(source, mat);
      }
      return interiorMaterials.get(source);
    };
    F.prepareHouseInteriors = () => {
      for (const interior of houseInteriors) {
        const mesh = interior.mesh;
        if (!mesh || preparedInteriors.has(mesh)) continue;
        mesh.traverse((part) => {
          if (part.isMesh && part.material) part.material = Array.isArray(part.material) ? part.material.map(solidInterior) : solidInterior(part.material);
        });
        preparedInteriors.add(mesh);
      }
    };
    const solidHouse = (mesh) => {
      if (!mesh) return;
      mesh.traverse((part) => {
        if (!part.isMesh || !part.material) return;
        part.material = Array.isArray(part.material) ? part.material.map(solidInterior) : solidInterior(part.material);
        part.userData.camBlock = true;
      });
    };
    const protectHouse = (house) => {
      if (!house) return;
      solidHouse(house.mesh);
      if (house.naka) {
        const I = house.naka, level = I.levels[0];
        // 濃い壁を透かさず、室内の視点と柱・間仕切りの間を広めに空ける。
        for (const lv of I.levels) lv.cameraWallMargin = 0.65;
        houseInteriors.push(I);
        // 外壁の大きな箱は室内では使えない。実際の戸口の両柱を小さな箱で測る。
        // 箱と逆行列は設営時だけ作り、描く物や兵の当たりは増やさない。
        const postInverse = new THREE.Matrix4().makeRotationY(I.rot).setPosition(I.x, level.y, I.z).invert();
        const post = (x, z) => cameraHouses.push({ interior: I, inverse: postInverse,
          box: new THREE.Box3(new THREE.Vector3(x - .32, -.55, z - .32), new THREE.Vector3(x + .32, level.h, z + .32)) });
        const outerW = level.w + .3, outerD = level.d + .3, bays = Math.max(2, Math.round(outerW / 3));
        for (let i = 0; i <= bays; i++) for (const side of [-1, 1]) {
          const x = -outerW / 2 + i * outerW / bays;
          if (side === I.door.side && Math.abs(x - I.door.lx) < .91) continue;
          post(x, side * outerD / 2);
        }
        for (const side of [-1, 1]) {
          const x = I.door.lx + side * (I.door.w / 2 + .08), z = I.door.side * (level.d / 2 + .2);
          post(x, z);
        }
        // 戸口までの曲がり角は既存の室内案内を使う。計算用の入れ物も設営時に作る。
        F.houseExitWays.set(I, nakaGuide(I, () => {
          const p = rt.player.u.pos, dx = p.x - I.x, dz = p.z - I.z;
          const x = dx * I.c - dz * I.s, z = (dx * I.s + dz * I.c) * I.door.side;
          // まず戸口の内側へ回る。部屋から外の点へ直進すると外壁を横切ってしまう。
          return Math.abs(x - I.door.lx) < .6 && z >= level.d / 2 - 1.2 && Math.abs(p.y - level.y) < .8
            ? I.doorOut : I.doorIn;
        }));
        // 部屋全体を詰まった箱にすると、戸口で目が箱に入り、どの肩位置も当たりゼロになる。
        // 実際の四壁だけを測り、戸口を空ける。箱・逆行列は設営時に作って使い回す。
        const wallBox = (x0, x1, z0, z1, y0 = -.75, y1 = level.h) => {
          if (x1 <= x0 || z1 <= z0 || y1 <= y0) return;
          cameraHouses.push({ interior: I, inverse: postInverse,
            box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
        };
        const hw = level.w / 2, hd = level.d / 2, thick = .15;
        wallBox(-hw - thick, -hw + thick, -hd - thick, hd + thick);
        wallBox(hw - thick, hw + thick, -hd - thick, hd + thick);
        for (const side of [-1, 1]) {
          const z0 = side * hd - thick, z1 = side * hd + thick;
          if (side !== I.door.side) wallBox(-hw, hw, z0, z1);
          else {
            const left = I.door.lx - I.door.w / 2, right = I.door.lx + I.door.w / 2;
            wallBox(-hw, left, z0, z1);
            wallBox(right, hw, z0, z1);
            wallBox(left, right, z0, z1, I.door.h ?? Math.min(level.h - .3, 2));
          }
        }
        // 壁の箱だけでは張り出す軒と高い棟が抜け、屋根裏へ視点が入る。
        // 実物の外形を設営時に測り、梁から上だけを別の箱で守る。
        // 床下や戸口は塞がず、室内では従来の柱と間仕切りの判定を使う。
        const roofBox = new THREE.Box3().setFromObject(house.mesh).applyMatrix4(postInverse);
        if (!roofBox.isEmpty()) {
          roofBox.min.y = Math.max(roofBox.min.y, level.h - .6);
          if (roofBox.max.y > roofBox.min.y) cameraHouses.push({ inverse: postInverse, box: roofBox });
        }
      }
      // 曲輪を守る任務で白壁を打たせない。室内・壁の当たりは残す。
      house.struct.noTarget = true; house.struct.fireProof = true;
      // 自分の「届く」案内も、石垣と同じ壊せない建物として除く。
      house.struct.hp = house.struct.maxHp = 1e9;
    };
    protectHouse(C.seat?.building);
    // 門の梁と屋根は、束ねた面の判定を待たずに視点を止める。
    // 通り道の高さは空ける。箱と行列は設営時だけ作り、建物の既存の判定で使い回す。
    for (const [x, z, halfWidth, bottom, top, depth] of [
      [0, -44, 3.2, 2.8, 3.6, 0.3],
      [KIDO.x, KIDO.z, 3.3, 2.9, 5, 1.6],
    ]) cameraHouses.push({
      inverse: new THREE.Matrix4().makeTranslation(x, W.heightAt(x, z), z).invert(),
      box: new THREE.Box3(new THREE.Vector3(-halfWidth, bottom, -depth), new THREE.Vector3(halfWidth, top, depth)),
    });
    // 梁だけでは横から寄る視点が柱・控柱・貫へ入る。開口は残し、左右の木組みだけを囲う。
    // 冠木門と同じ柱位置・控えの奥行きで、地形の高い側にも箱の下端を合わせる。
    for (const [x, z, width] of [[0, -44, 7], [KIDO.x, KIDO.z, 3.6]]) {
      const floor = W.heightAt(x, z);
      const inverse = new THREE.Matrix4().makeTranslation(x, floor, z).invert();
      for (const side of [-1, 1]) {
        const px = side * (width / 2 + .17);
        const bottom = Math.min(W.heightAt(x + px, z), W.heightAt(x + px, z - 1.6)) - floor - .3;
        cameraHouses.push({ inverse,
          box: new THREE.Box3(new THREE.Vector3(px - .4, bottom, -1.95), new THREE.Vector3(px + .4, 3.6, .4)) });
      }
    }
    // 城作りが差し替えた道の網を、この戦の床の高さに沿う退き道へ戻す。
    W.def.castleRoute = mitsukuri.world.castleRoute;
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;
    // 地面の案内も兵と同じ道を通し、横の柵や切岸へまっすぐ向けない。
    W.def.guideWay = (u, goal) => u === rt.player.u ? courtyardWay(rt, goal) : sanKuchiWay(rt.army, u, goal);
    F.gates = { kido: makeGate(rt, C.gateObjs.kido, { name: KIDO.name, guardTeam: 1 }) };
    // 門の形の名ではなく、任務と同じ呼び名を掛矢の案内にも使う。
    F.gates.kido.struct.name = KIDO.name;
    // 柱だけを視点の透かしで抜くと屋根が宙に残る。木戸の枠は柱・冠木・屋根を一緒に残す。
    // 共通の材質は変えず、この門だけ設営時に複製する。
    const frameMaterials = new Map();
    const solidGateFrame = (frame) => frame.traverse((part) => {
      if (!part.isMesh || !part.material) return;
      const solidFrame = (source) => {
        if (!frameMaterials.has(source)) {
          const mat = source.clone(), compile = source.onBeforeCompile;
          mat.onBeforeCompile = function(shader, renderer) {
            compile.call(this, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('if (camNearFade > 0.5) {', 'if (false) {');
          };
          mat.customProgramCacheKey = () => source.customProgramCacheKey() + '|mitsukuriGateFrame';
          mat.userData.camNearSolid = true;
          frameMaterials.set(source, mat);
        }
        return frameMaterials.get(source);
      };
      part.material = Array.isArray(part.material) ? part.material.map(solidFrame) : solidFrame(part.material);
    });
    solidGateFrame(C.gateObjs.kido.frame);
    // 倒れた戸は共通の処理で坂と板の四隅に沿わせる。
    // ここで角度を上書きすると、上り坂へ向かう板先を逆に土中へ沈めてしまう。
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { honmaru: 'HIST_A', ninomaru: 'HIST_B', sekirui: 'HIST_A', saku: 'HIST_B', kido: 'HIST_B', kirigishi: 'HIST_B', sanKuruwa: 'GAME_C',
      kannonjiNet: 'HIST_A', dayToNight: 'HIST_A', fourCommanders: 'HIST_A', torchLegend: 'HIST_B', honjinOda: 'GAME_C', honjinRokkaku: 'HIST_B', yoshidaIzumo: 'HIST_B' };
    // 三の郭（外側の防御線）：柵で囲い、南の柵の口に冠木の枠（戸は無い）。口の外に逆茂木を並べて寄せを鈍らせる
    // 縄張りの七ｍの開口に柱を合わせ、柱と塀の間へ余分な抜け道を残さない。
    const outerGate = kabukimon(W, 0, -44, MITSUKURI_PLAN.koguchi.find((g) => g.id === 'san_kuchi').w, 0, { doors: false, roof: false });
    solidGateFrame(outerGate);
    rt.scene.add(outerGate);
    sakamogiRow(rt, [[-20, -39], [-9, -39]], { n: 3 }); sakamogiRow(rt, [[9, -39], [20, -39]], { n: 3 });
    // 木戸は十メートル、外側は八・九メートルの丸太組み。床と梯子も同じ指定にそろえる。
    for (const y of MITSUKURI_PLAN.yagura) if (y.id !== 'monomi_ni') C.towers.push({ id: y.id, kind: y.kind,
      ...monomi(rt, ...y.at, { name: y.name, team: 1,
        ...({ mon: 'rokkaku', logFrame: true,
          height: y.id === 'monomi_san_e' ? 8 : 9, boarded: false }) }) });
    // 物見の面判定を待つ間も、横木の内側や床裏へ視点を入れない。
    // 柱間の歩行・梯子は残す。登って室内へ入った時は既存の室内視点に任せる。
    // 四基分の箱と行列は設営時に作り、更新では既存の建物判定を使い回す。
    for (const tower of C.towers) {
      // 遠近の切替が参照する網を景物の束へ移すと、外形だけ消えて床の兵と戸口が空に残る。
      // 箕作の四基だけ元の遠近切替で描く。形と材質は共用し、床・梯子・守兵は動かさない。
      tower.mesh.userData.noFreeze = true;
      tower.mesh.traverse((part) => { if (part.isMesh) part.userData.noBatch = true; });
      const I = tower.naka;
      if (!I) continue;
      const base = W.heightAt(I.x, I.z);
      cameraHouses.push({
        inverse: new THREE.Matrix4().makeRotationY(I.rot).setPosition(I.x, base, I.z).invert(),
        box: new THREE.Box3(new THREE.Vector3(-1.85, -.4, -1.85),
          new THREE.Vector3(1.85, tower.topY - base + 3, 1.85)),
      });
    }
    if (true) {
      // 正面の狭間付き板塀は残し、三の郭の左右だけ透いた柵へ替える。当たり・耐久・守兵は共用。
      for (const wall of C.walls) if (wall.name === '三の郭（坂の上）' && wall.seg && Math.abs(wall.seg[0] - wall.seg[2]) < .01) {
        wall.mesh.visible = false;
        wall.mesh = mitsukuriSaku(W, [wall.seg]);
        rt.scene.add(wall.mesh);
      }
    }
    entranceSteps(rt);
    approachDetail(rt);
    sanYardDebris(rt);
    // 門へ続く中央の道を白い幟で隠さない。兵・柵・松明の位置は保つ。
    for (const [x, z] of [[-15, sanC.z - 4], [15, sanC.z - 4], [10, niC.z - 8]]) rt.scene.add(mkNobori(W, x, z, 'rokkaku', 4.2));
    // 旗は柵の手前へ。焚き火は切岸を避け、柵の内側の平らな郭へ置く。
    for (const [x, z] of [[-5, -43], [5, -43]]) {
      rt.scene.add(mkNobori(W, x * 1.6, z, 'rokkaku', 4.2));
    }
    for (const [x, z] of [[-6, -47], [6, -47]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { h: 0.12, size: 0.8 });
    }
    // 縁の土塁は高さ関数と柵を共用。麓の飾り土塁は九十九折りを塞ぐので置かない。
    // 西面の低い野面積みと板笠の土塀だけ。総石垣や瓦・天守を補わない。
    const stoneBatch = makeKitBatch(), top = W.heightAt(...honPoint(-17,0)) + 0.25;
    ishigaki(W, [honPoint(-20.1,-5), honPoint(-20.1,-3.8)], { topY: top, minH: 2, maxH: 2.6, lean: 0.14, out: 1, batch: stoneBatch, scene: rt.scene });
    // 石垣の上の部分だけ、既存の柵を土塀へ替える。当たりの線を共用する。
    for (const wall of C.walls) if (wall.name === '本丸' && wall.seg && Math.hypot((wall.seg[0]+wall.seg[2])/2-HON_EXIT[0], (wall.seg[1]+wall.seg[3])/2-HON_EXIT[1]) < 6) {
      wall.mesh.visible = false;
      wall.mesh = dobei(W, wall.seg, { baseY: top, h: 1.4, ita: true, batch: stoneBatch });
      wall.noTarget = true; wall.fireProof = true;
    }
    kuruwaBldg(W, 'ido', 50, -99, 0, { ita: true, batch: stoneBatch });
    solidCircle(50, -99, 0.95);
    finalizeKitBatch(rt, stoneBatch);
    // 板塀も館と同じ即時の視点判定へ入れる。束ねた面の判定待ちに柵裏へ入り込ませない。
    // 口は既存の壁の線に無いので塞がない。壊れた壁は上の判定から外す。
    for (const wall of C.walls) if (wall.seg && ['本丸', '二の丸'].includes(wall.name)) {
      const [ax, az, bx, bz] = wall.seg, dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      let bottom = Infinity, top = -Infinity;
      const n = Math.max(1, Math.ceil(length / 2));
      for (let i = 0; i <= n; i++) {
        const y = W.heightAt(ax + dx * i / n, az + dz * i / n);
        bottom = Math.min(bottom, y); top = Math.max(top, y + (wall.h || 2.6));
      }
      cameraHouses.push({ wall,
        inverse: new THREE.Matrix4().makeRotationY(-Math.atan2(dz, dx)).setPosition((ax + bx) / 2, 0, (az + bz) / 2).invert(),
        box: new THREE.Box3(new THREE.Vector3(-length / 2 - 0.15, bottom - 0.2, -0.35),
          new THREE.Vector3(length / 2 + 0.15, top + 0.2, 0.35)),
      });
    }
    // 位置・広さ・用途は永禄期の近江の推定。各戸口は道につなぐ。
    const paper = new THREE.Color(0xf2eee2), soot = new THREE.Color(0x494139);
    const roofColors = [new THREE.Color(0x82705b), new THREE.Color(0x6a5948)];
    const wallBoards = [0x72604e, 0x635241, 0x796a57, 0x665746].map((c) => new THREE.Color(c));
    const dampBoard = new THREE.Color(0x494634), fadedBoard = new THREE.Color(0x938775);
    const oldBoard = new THREE.Color(0x777064), patchBoard = new THREE.Color(0x958064), roofTint = new THREE.Color();
    const house = (x, z, w, d, rot, name, kind) => {
      const fireCount = W.fires.length;
      // 番所・蔵・長屋は低い切妻の板葺き。館と祠の格式ある屋根は残す。
      const utility = ['bansho', 'kura', 'nagaya'].includes(kind);
      const h = goten(rt, x, z, { w, d, rot, name, kind, team: 1, tile: false, naka: true,
        fieldFort: utility, weatheredBoards: utility, utilityBoardWalls: utility,
        profile: 'mitsukuri', doorX: 0, noTarget: true });
      protectHouse(h);
      // 戸口の炎の板が障子に重なるため、付属の火を外し、紙だけ煤けた焼け跡にする。
      // この建物専用の頂点色だけを替え、共通の材質・室内・松明の任務は保つ。
      while (W.fires.length > fireCount) W.removeFire(W.fires[W.fires.length - 1]);
      h.mesh.traverse((m) => {
        const colors = m.geometry?.attributes.color;
        if (!colors) return;
        for (let i = 0; i < colors.count; i++) {
          if (Math.abs(colors.getX(i) - paper.r) < 0.001 && Math.abs(colors.getY(i) - paper.g) < 0.001 && Math.abs(colors.getZ(i) - paper.b) < 0.001) colors.setXYZ(i, soot.r, soot.g, soot.b);
          // 写真の灰褐色の壁板。足元を湿った土色へ、上を日焼けした木地へ寄せる。
          // 妻板も同じ調子にし、屋根や柱の色と共有材質は変えない。
          if (utility && wallBoards.some((c) => Math.abs(colors.getX(i) - c.r) < .00001 &&
            Math.abs(colors.getY(i) - c.g) < .00001 && Math.abs(colors.getZ(i) - c.b) < .00001)) {
            const p = m.geometry.attributes.position, above = p.getY(i) - (h.naka.levels[0].y - .55);
            roofTint.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
            roofTint.lerp(fadedBoard, .18).lerp(dampBoard, Math.max(0, 1 - above / 1.25) * .48);
            colors.setXYZ(i, roofTint.r, roofTint.g, roofTint.b);
          }
          // 切妻の葺き板だけ、灰色の古板・差し替え板と軒の雨染みを既存頂点へ付ける。
          // 壁・棟・押さえ木は元の色。面数と材質の数は増やさない。
          if (utility && roofColors.some((c) => Math.abs(colors.getX(i) - c.r) < .00001 &&
            Math.abs(colors.getY(i) - c.g) < .00001 && Math.abs(colors.getZ(i) - c.b) < .00001)) {
            const p = m.geometry.attributes.position, dx = p.getX(i) - x, dz = p.getZ(i) - z;
            const lx = dx * Math.cos(rot) - dz * Math.sin(rot), lz = dx * Math.sin(rot) + dz * Math.cos(rot);
            const bay = Math.floor((lx + (w + 1.2) / 2) / ((w + 1.2) / Math.ceil((w + 1.2) / .45)) + .001);
            const seed = Math.sin(bay * 17.3 + x * 2.7 + z) * .5 + .5;
            const eave = Math.min(1, Math.abs(lz) / ((d + 1.2) / 2));
            roofTint.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
            roofTint.lerp(seed > .83 ? patchBoard : oldBoard, seed > .83 ? .55 : .32);
            roofTint.multiplyScalar((.91 + seed * .13) * (1 - .22 * eave * eave));
            colors.setXYZ(i, roofTint.r, roofTint.g, roofTint.b);
          }
        }
        colors.needsUpdate = true;
      });
      return h;
    };
    const roofed = [];
    const roofHouse = (...a) => {
      const h = house(...a);
      roofed.push([h, ...a.slice(0, 5)]);
      return h;
    };
    roofHouse(-12, -53, 5, 4, Math.PI / 2, '大手の番所', 'bansho');
    roofHouse(12, -51, 5, 4, -Math.PI / 2, '兵糧の蔵', 'kura');
    // 西の柵と裏壁の間にも兵二人分の幅を残す。南の本丸道からは離しておく。
    const nagaya = roofHouse(-10, -73, 8, 5, Math.PI / 2, '二の丸の長屋', 'nagaya');
    rt.scene.add(mitsukuriYards(W, nagaya.naka.levels[0].y - .55));
    roofHouse(8, -87, 6, 4, 0, '二の丸の詰所', 'bansho');
    // 段の上の番所・蔵・長屋の板葺きに、押さえの石を並べる（石置き屋根。持ち場から最初の画面に入る。10/28 点付け）。
    // 屋根の面は goten の仮設切妻と同じ寸法（壁高 3・勾配 0.36・軒の出 0.6）で求める。石は一つの InstancedMesh で描く。
    {
      const spots = [], pitch = 0.36, tp = Math.tan(pitch), sp = Math.sin(pitch), cp = Math.cos(pitch);
      for (const [h, x, z, w, d, rot] of roofed) {
        const base = h?.naka?.levels?.[0]?.y;
        if (base == null) continue;
        const y0 = base - 0.55 + 3.0 + 0.08 + 0.06, len = w + 0.6, half = (d + 1.2) / 2, n = Math.max(4, Math.round(len / 0.55));
        const c = Math.cos(rot), s = Math.sin(rot);
        for (const side of [-1, 1]) for (const f of [0.3, 0.68]) for (let i = 0; i < n; i++) {
          const lx = -len / 2 + (i + 0.5) * len / n + Math.sin(i * 7.1 + f * 13 + x) * 0.12, lz = side * half * f;
          // goten の部品と同じ向き（局所 x が棟の方向）。
          const p = new THREE.Vector3(x + lx * c + lz * s, y0 + tp * (half - Math.abs(lz)), z - lx * s + lz * c);
          const nrm = new THREE.Vector3(side * sp * s, cp, side * sp * c);
          spots.push([p, nrm, i * 3.7 + side * 1.9 + f * 5.3 + x]);
        }
      }
      if (spots.length) {
        const g = new THREE.DodecahedronGeometry(0.2, 0);
        const stones = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
        spots.forEach(([p, nrm, seed], i) => {
          const r = Math.sin(seed * 12.9898) * 0.5 + 0.5, r2 = Math.sin(seed * 78.233) * 0.5 + 0.5;
          q.setFromUnitVectors(up, nrm).multiply(new THREE.Quaternion().setFromAxisAngle(up, r * 6.28));
          sc.set(0.8 + r * 0.6, 0.5 + r2 * 0.3, 0.7 + r2 * 0.5);
          m4.compose(p.clone().addScaledVector(nrm, 0.06), q, sc);
          stones.setMatrixAt(i, m4);
          stones.setColorAt(i, col.setHex(0xa29d90).multiplyScalar(0.8 + r2 * 0.35));
        });
        stones.castShadow = true; stones.receiveShadow = true;
        rt.scene.add(stones);
      }
    }
    house(-86, -116, 4, 4, Math.PI / 2, '西の段の小祠', 'shrine');
    house(57, -103, 5, 4, -Math.PI / 2, '東の段の番所', 'bansho');
    rt.scene.add(tawara(W, 13, -52, 0, 4));
    // 麓の里は一つの形にまとめる。川は東の平野の遠景。
    rt.scene.add(village(W, 92, 112, { n: 7, r: 22, seed: 15684 }));
    const farBatch = makeSimpleBatch();
    // 三の郭の口の脇に、軒の低い物置を一つ。目の高さより下の軒から、板葺きと押さえ石が持ち場の画面に見える（10/29 点付け）。
    mitsukuriHut(W, -6.2, -58.6, 3.4, 2.8, { h: 1.6, wall: 0x6f624f, ita: true, batch: farBatch });
    if (true) {
      // 既存の小郭へ屋敷・蔵・幟を補う。配置は推定。尾根道と堀切を跨がず、曲輪の床だけを使う。
      for (const [x, z, w, d, fx, fz] of [
        [-120, -130, 6, 4, -123, -139], [-147, -174, 5, 4, -138, -176],
        [106, -134, 6, 4, 110, -124], [-55, -20, 5, 4, -50, -20],
      ]) {
        mitsukuriHut(W, x, z, w, d, { h: 2.5, wall: 0x796b56, ita: true, batch: farBatch });
        rt.scene.add(mkNobori(W, fx, fz, 'rokkaku', 4.8));
      }
      // 写真の小郭の屋敷群を参考に、尾根端の二戸へ低い板蔵を添える（配置は推定）。
      // 既存の屋敷・六角の幟を主にし、中央の道と堀切の外に納める。
      // 石を載せない軽い板葺きとし、既存の建物の束へ結合する。
      for (const [x, z, w, d] of [[-139, -179, 4, 3], [94, -136, 5, 3]])
        mitsukuriHut(W, x, z, w, d, { h: 2.1, wall: 0x726653, ita: true,
          boardRoof: true, boardRoofColors: [0x817765, 0x746957, 0x8b7960], batch: farBatch });
      const edges = [
        [-126,-127,-126,-144], [-126,-144,-105,-144],
        [-154,-150,-154,-184], [-154,-184,-134,-184],
        [86,-141,114,-141], [114,-141,114,-119],
        [-62,-16,-62,-35], [-62,-16,-48,-16], [-48,-16,-48,-35],
        [37,-111,59,-111], [37,-95,59,-95],
      ];
      rt.scene.add(mitsukuriSaku(W, edges, 1.8, true));
      // 板葺きの蔵脇には修理用の丸太と巻いた幟。任務の松明置き場と中央の道は空ける。
      rt.scene.add(lumber(W, 14, -57, Math.PI / 2), hatazao(W, -17, -52, Math.PI / 2, 5, 'rokkaku'));
      rt.scene.add(mitsukuriStores(W, 17, -52));
      // 三の郭・二の丸の段ごとに、隅へ小さな板葺きの小屋と短い柵を詰める（配置は推定）。
      // 口・木戸・郭の真ん中の道は空け、当たりは付けない。
      // 屋根は板葺きに押さえ木と石を並べる（石置き屋根。持ち場から最初の画面の段の上に見える。10/28 点付け）。
      for (const [x, z, w, d] of [[-16.5, -47, 3, 2.4], [16, -61, 3.2, 2.6], [12.5, -70, 3.4, 2.6], [-12, -89, 3, 2.4]])
        mitsukuriHut(W, x, z, w, d, { h: 2, wall: 0x6f624e, ita: true, batch: farBatch });
      // 二の丸の段の上、門の左右の奥に一回り大きい石置き屋根の小屋。持ち場から塀越しに屋根と石が見える（配置は推定）。
      // 塀の上に屋根と石が出るよう、二階の板蔵の高さにする（10/28 点付け：段の上に石置き屋根の小屋）。
      for (const [x, z] of [[-9, -71], [7.5, -74]])
        mitsukuriHut(W, x, z, 5, 3.4, { h: 4, wall: 0x6f624e, ita: true, batch: farBatch });
      rt.scene.add(mitsukuriSaku(W, [[-20, -51, -13.5, -51], [13, -57, 20, -57], [9, -66, 16, -66], [-15, -81, -9, -81]], 1.6, false));
      // 二の丸の奥の段：塀・石置き屋根の小屋・六角の幟と守り手。三の郭から見上げて段が上へ重なる（推定）。
      // 守り手48人は新しく足さず、二の丸の槍と弓（F.niDef、もと260）から奥の段へ回した者。六角方の総数は変えない。
      rt.scene.add(mitsukuriSaku(W, [[-14, -98.4, -2, -98.4], [2, -98.4, 14, -98.4], [-19, -114.4, 19, -114.4]], 1.15, false));
      for (const [x, z, w, d, h] of [[-8, -104.5, 5, 3.4, 2.6], [8.5, -104, 4.4, 3.2, 2.4], [-7, -122, 7, 4.5, 3.2], [9, -123, 6, 4, 3]])
        mitsukuriHut(W, x, z, w, d, { h, wall: 0x6f624e, ita: true, batch: farBatch });
      for (const [fx, fz] of [[-13, -100], [13, -100], [-16, -116], [-2, -116], [15, -116]]) rt.scene.add(mkNobori(W, fx, fz, 'rokkaku', 5));
      const kitaCrew = [];
      for (let i = 0; i < 22; i++) kitaCrew.push({ x: -11 + i + ((i * 37) % 10) / 10 - 0.5, z: -99.3 - ((i * 53) % 9) / 10, k: ['spear', 'spear', 'gun', 'spear', 'bow'][i % 5], flag: i % 7 === 3 ? 1 : 0, facing: ((i * 29) % 9 - 4) * 0.07 });
      // 上の段の中ほどには本丸の守備衆（本物の兵）が立つので、遠景の人を重ねない。
      for (let i = 0; i < 26; i++) if (Math.abs(-15 + i * 1.2) > 6.5) kitaCrew.push({ x: -15 + i * 1.2 + ((i * 31) % 10) / 10 - 0.5, z: -115.3 - ((i * 47) % 13) / 10, k: ['spear', 'gun', 'spear', 'samurai', 'spear', 'banner'][i % 6], flag: i % 6 === 0 ? 1 : 0, facing: ((i * 23) % 9 - 4) * 0.07 });
      W.addDistantArmy({ people: kitaCrew, armor: RK.armor, team: 1, flagTex: rokkakuTex(), seed: 15701 });
    }
    // 和田山城は遠景の小城。守りの置き方は推定で、箕作の乱戦に兵を足さない。
    mitsukuriHut(W, WADA.x, WADA.z + 4, 6, 4, { h: 2.6, wall: 0x7a6a50, ita: true, batch: farBatch });
    F.wadaFlag = mkNobori(W, WADA.x + 6, WADA.z + 4, 'rokkaku', 5);
    rt.scene.add(F.wadaFlag);
    // ---- 繖山の観音寺城：四曲輪を低い野面積みで囲う。天守・白壁・高石垣は置かない ----
    const kanStone = makeKitBatch();
    F.kanFlags = [];
    for (const k of KAN_COURTS) {
      const x0 = k.x - k.w / 2, x1 = k.x + k.w / 2, z0 = k.z - k.d / 2, z1 = k.z + k.d / 2;
      // 南面の中央は出入口。外向きに積み、共通の重い張り替え素材は使わない。
      ishigaki(W, [[k.x - 2, z1], [x0, z1], [x0, z0], [x1, z0], [x1, z1], [k.x + 2, z1]],
        { topY: k.y + 0.2, minH: 1.2, maxH: 2.2, lean: 0.2, out: -1, kind: 'nozura',
          big: 1.7, noKit: true, batch: kanStone });
      mitsukuriHut(W, k.x, k.z - 2, 8, 5, { h: 2.6, wall: 0x7a6a50, ita: true, batch: farBatch });
      const flag = mkNobori(W, k.x + 6, k.z + 3, 'rokkaku', 5);
      F.kanFlags.push(flag);
    }
    F.kanFlags = [batchKanFlags(F.kanFlags)];
    rt.scene.add(F.kanFlags[0]);
    finalizeKitBatch(rt, kanStone);
    // 麓の御屋形も中に入れる平屋にする。北棟は北向きに開き、南棟で戸口を塞がない。
    // 畳の座敷・土間・竿縁天井と襖は共通の室内を使い、近づいた時だけ組み立てる。
    for (const [x, z, w, d, rot, name] of [[-219, -63, 12, 7, Math.PI, '御屋形の主殿'], [-208, -63, 8, 7, 0, '御屋形の脇屋'], [-219, -55, 12, 5, 0, '御屋形の南棟']]) {
      const fireCount = W.fires.length;
      goten(rt, x, z, { w, d, rot, name, kind: 'yashiki', profile: 'mitsukuri', naka: true, tile: false, earth: 0x7a6a50, doorX: 0, team: 1, noTarget: true });
      // 戦わず退いた屋敷に篝火を増やさない。室内は既存の灯明で照らす。
      while (W.fires.length > fireCount) W.removeFire(W.fires[W.fires.length - 1]);
    }
    for (const [x, z] of [[-226, -24], [-211, -24], [-226, -10], [-211, -10]])
      hut(W, x, z, 7, 5, 0, { solid: false, batch: farBatch });
    finalizeSimpleBatch(rt, farBatch);
    // 観音寺城の火。遠い火の消失だけで父子の行き先を知る扱いにはしない。
    F.kanFires = KAN_COURTS.map((k) => W.addFire(k.x - 5, k.z + 3, { h: 0.3, nightOnly: true }));

    // ---- 守り（箕作城・六角の衆。曲輪ごとに butai.js の部隊。siege_ai.js の城の頭で動かす） ----
    // 南の攻め手に正対し、曲輪の幅と奥行きの中に備えを置く。
    F.sanDef = makeButai(rt, { name: '坂の守り', team: 1, faction: 'rokkaku', kind: 'ashigaru', nominal: 220, nearReal: 11, maxReal: 11, armor: 0x574737, flag: RK.flag, at: sanC, facing: 0, lightWidth: 36, lightDepth: 18, real: 0 });
    F.sanDef.mix = { ashigaru: 0.75, bow: 0.25, samurai: 0, gun: 0, cavalry: 0 };
    F.sanDef.growReal(11);
    F.sanReserve = enemyGroup(rt, { fixed: true, name: '柵の口の控え', faction: 'rokkaku',
      anchor: { x: ROAD_OTE[6][0], z: ROAD_OTE[6][1] }, facing: Math.PI, width: 2, formation: 'column', aggro: 2 },
      dress([{ type: 'ashigaru', n: 3 }], RK));
    // 260人のうち48人は奥の段（kitaCrew）へ回してある。
    F.niDef = makeButai(rt, { name: '二の丸の槍と弓', team: 1, faction: 'rokkaku', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 212, armor: 0x33291f, flag: RK.flag, at: niC, facing: 0, lightWidth: 28, lightDepth: 22, real: 0 });
    // 遠景は徒歩の槍の形に保つ。共通の混成遠景が城内へ騎馬を足すのを避ける。
    F.niDef.mix = { ashigaru: 0.75, bow: 0.25, samurai: 0, gun: 0, cavalry: 0 };
    F.niDef.growReal(14);
    F.honDef = makeButai(rt, { name: '本丸の守備衆', team: 1, faction: 'rokkaku', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 180, armor: 0x33291f, flag: RK.flag, at: HON_DEFEND, facing: Math.PI / 2 - Math.PI / 9, lightWidth: 10, lightDepth: 5, real: 14 });
    F.defenders = [F.sanDef, F.niDef, F.honDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    // 城将は本丸の館前で近習と徒歩で守る。自動騎乗で狭い庭へ馬を足さない。
    F.commandGuard = enemyGroup(rt, { fixed: true, name: '城将の旗本', faction: 'rokkaku',
      anchor: { ...HON_DEFEND }, facing: Math.PI / 2 - Math.PI / 9, width: 5, formation: 'yari', aggro: 5 },
      dress([{ type: 'busho', n: 1, o: { name: '城将', horse: false } }, { type: 'samurai', n: 5 }], RK));
    F.commander = F.commandGuard.units[0];
    if (rt.castleSeat) rt.castleSeat.used = true;
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、丹羽長秀の手、佐久間信盛の手、木戸を破る組 ----
    // 狭い山道と柵の口を攻める三将は徒歩。自動の騎乗で馬が切岸に乗り上げるのを防ぐ。
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: CAMP.x, z: CAMP.z - 6 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true, horse: false } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: CAMP.x - 22, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: CAMP.x + 24, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: false, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { fixed: true, name: '木戸を破る組', anchor: { x: CAMP.x + 10, z: CAMP.z + 10 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.kino, F.niwa, F.saku, F.ram];
    F.gunK = allyGroup(rt, { fixed: true, name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: false }, dress([{ type: 'gun', n: 4 }], ODA));
    F.attackers = F.oda;
    F.attackTotal = F.oda.reduce((n, g) => n + g.count, 0);
    // 浅井新八の手：北東の尾根から本丸の東の切岸へ寄せる（遠景・AI。軽い作りの部隊で、数だけで押し合う）
    F.asai = makeButai(rt, { name: '浅井新八の手', general: '浅井新八', team: 0, faction: 'oda', kind: 'busho', look: { horse: false }, nominal: 1500, armor: 0x2a2622, flag: 'oda', at: { x: 58, z: -70 }, facing: -Math.PI * 0.62, lightWidth: 40, lightDepth: 50, real: 1, nearReal: 6, farReal: 1, maxReal: 6 });
    // 本人も徒歩。兵種の変更だけでは最初に生まれた将の自動騎乗は止まらない。
    F.asai.kind = 'ashigaru';
    F.asaiFoe = makeButai(rt, { name: '本丸の東の守り', team: 1, faction: 'rokkaku', kind: 'ashigaru', nominal: 140, armor: 0x33291f, flag: RK.flag, at: { x: 48, z: -103 }, facing: Math.PI / 2, lightWidth: 20, lightDepth: 14, real: 0, nearReal: 6, farReal: 0, maxReal: 6 });
    for (const b of [F.asai, F.asaiFoe]) b.order({ id: 'hold' });
    for (const [x, z] of [[62, -64], [54, -62]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 0.8, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
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
    F.campHorse = { h: horse, heading: Math.PI, spd: 0, t: 20, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } };
    horses.push(F.campHorse);
    F.campHorseSoundAt = rt.t + 6;
    F.campHorseNeighAt = rt.t + 6;
    F.ramNext = allyGroup(rt, { fixed: true, name: '木戸破りの控え', anchor: { x: 14, z: 96 },
      facing: Math.PI, width: 5, formation: 'column', aggro: 2 }, dress([{ type: 'ashigaru', n: 10 }], ODA));
    // 控えや鉄砲組が近くで戦っていれば、その生きた兵からも合図を出す。
    F.signalGroups = [...F.oda, F.gunK, F.ramNext];
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 16, 0.3, 6));
    rt.scene.add(mitsukuriStores(W, CAMP.x - 19, CAMP.z + 18));
    mitsukuriCampDetail(rt);
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 14, 'oda'], [CAMP.x + 8, CAMP.z + 14, 'eiraku'], [CAMP.x - 26, CAMP.z + 4, 'oda'], [CAMP.x + 28, CAMP.z + 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[CAMP.x - 16, CAMP.z + 2], [CAMP.x + 18, CAMP.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 三本脚は中心の高さだけでは切岸の下側へ届かない。箕作の篝火だけ、
    // 描く土まで脚先を延ばす。籠・薪・炎・当たりは保ち、共有形は書き換えない。
    rt.scene.traverse((part) => {
      if (part.name !== '篝火') return;
      const iron = part.children[0];
      if (!iron?.isMesh) return;
      const geo = iron.geometry.clone(), points = geo.attributes.position;
      for (let i = 0; i < points.count; i++) {
        if (points.getY(i) > 0.18) continue;
        const x = part.position.x + points.getX(i), z = part.position.z + points.getZ(i);
        const y = drawGroundAt(W, x, z);
        if (Number.isFinite(y)) points.setY(i, Math.min(points.getY(i), y - part.position.y - 0.04));
      }
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      iron.geometry = geo;
    });
    for (const t of TORCH) rt.scene.add(tawara(W, t.x, t.z, 0.5, 2));
    // ---- 大軍（軽い作り）：上洛の織田勢と、繖山の六角勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed, kind: 'spear', host: false });
    const OT = flagTexture('oda'), ET = flagTexture('eiraku');
    DA(-40, 96, 36, 14, 260, Math.PI, 0x2a2622, OT, 15681);
    DA(46, 100, 36, 14, 260, Math.PI, 0x2a2622, ET, 15682);
    DA(0, 140, 50, 14, 300, Math.PI, 0x2a2622, OT, 15683);
    // 観音寺城は戦わず退く。義賢の戦闘部隊や後詰を置かず、遠景と後日談だけで伝える。

    // ---- 区域の網（siege_zones.js）：三の郭→二の丸（木戸）→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の郭（坂の上）', test: C.kuruwa.san.test, pos: sanC, need: 4, hold: 10, next: 'ni' },
        { id: 'ni', name: '二の丸（木戸構え）', test: (x, z) => F.step >= 3 && C.kuruwa.ni.test(x, z), pos: niC, need: 5, hold: 12, gate: KIDO.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: HON_GATHER, need: 6, hold: 12, honmaru: true },
      ],
      links: [['san', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // 物見の二階に移った守兵は地上の持ち場を守っていない。
      // 櫓の射撃・室内の斬り合いは残し、庭を守る人数だけを数える。
      unitFilter: (u) => zoneGroundFighter(rt, u),
      totalDefenders: 1, // 遠景を数えない実兵数から城全体の八割損失を推定しない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [0, 0], // 強襲を止めず、次の備えとの斬り合いへつなぐ。
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => { if (F.step >= 4) this.midB(rt); },
    });
    // ---- 城の頭（siege_ai.js）：守りは持ち場・門・退き ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanDef, at: sanC, next: 'ni' },
        { id: 'ni', butai: F.niDef, at: niC, gate: KIDO.name, next: 'hon' },
        { id: 'hon', butai: F.honDef, at: HON_DEFEND },
      ],
      reserves: [],
      fallback: { x: -62, z: -120 },
    });
    // 開始の札と台詞は climb に一本化。軍議の道と違う下知や、遠景の三つの印を重ねない。
    buildBattleJin(rt);
    [F.kino, F.niwa, F.saku, F.ram, F.gunK, F.ramNext].forEach((g, i) => openingColumn(rt, g, [0, 16, 32, 47, 60, 74][i]));
    // 木戸は南、本丸は東の口へ向け、元の人数を二段の槍と弓に詰める。全員が横一列で同じ姿にならない。
    for (const b of F.defenders) if (b.real) {
      b.real._sanCastleRoad = true;
      // 本丸の守備衆は、本丸へ攻め上がるまで二の丸の奥の上の段に立ち、塀の内に槍を並べて坂を見下ろす。
      //   三の郭から見上げた時、木戸の塀に隠れず胴まで見える高さと置き場を、目の高さと塀の高さから選んだ（10/29）。兵は増やさず、作る順も変えない。
      const oku = b === F.honDef;
      b.setForm('yari'); b.real.width = b === F.sanDef ? 8 : oku ? 7 : 6;
      const facing = 0;
      b.real.yariKneel = !oku; b.real.facing = b.real._face = facing;
      const at = b === F.sanDef ? { x: 0, z: -48 } : b === F.niDef ? niC : HON_OKU;
      placeGroup(rt, b.real, at.x, at.z);
      for (const u of b.real.units) { u.heading = facing; u.mesh.rotation.y = facing; }
    }
    // 不足を埋める仲間が向かっている間は、別の郭の守りまで呼び戻さない。
    rt.addInteract('callFriends', () => F.callZone && !F.callZone._incoming && F.callZone._callable !== false && rt.t >= (F.callReadyAt || 0) ? rt.player.u.pos : null,
      '味方を呼ぶ', () => this.callFriends(rt), { r: 3, prio: 1 });
    // 軍議を終えた最初の更新で下知を出し、選んだ道へすぐ進める。
    rt.setPhase('brief');
    rt.after(0, () => this.climb(rt));
  },

  callFriends(rt) {
    const F = rt.flags, z = F.callZone;
    if (!z || z.friends >= z.need || F.ending || rt.over || rt.t < (F.callReadyAt || 0)) return;
    if (incomingFriends(rt, z)) {
      z._incoming = true;
      rt.bark('味方は向かっている。郭の中で迎えよ');
      return;
    }
    let best = null, distance = Infinity, incoming = false;
    for (const g of [...F.oda, F.ramNext]) {
      if (gone(g) || g === F.torchHelp?.group || (g === F.ram && F.step === 3 && !F.gatePass)) continue;
      let outside = 0;
      for (const u of g.units) if (zoneNeedsFriend(rt, z, u)) outside++;
      if (!outside) continue;
      if (g.order === 'move' && g._sanGoalX === z.pos.x && g._sanGoalZ === z.pos.z) {
        incoming = true;
        continue;
      }
      // 一人だけ残る近い組を繰り返し呼ぶより、不足を埋められる組を先に呼ぶ。
      const c = fightingCenter(g), d = Math.hypot(c.x - z.pos.x, c.z - z.pos.z) / Math.min(outside, z.need - (z.friends || 0));
      if (d < distance) { best = g; distance = d; }
    }
    if (!best) {
      // 向かっている組しかいない間は、使えない呼び直しより到着を案内する。
      // 来られる組がない場合には、到着待ちの札を出さない。
      if (incoming) F.callReadyAt = rt.t + 8;
      rt.bark(incoming ? '味方は向かっている。郭の中で迎えよ' : '来られる味方がいない。仲間を守れ');
      return;
    }
    // 新しく組が出た時は十二秒あける。
    F.callReadyAt = rt.t + 12;
    const c = fightingCenter(best), path = [];
    if (best === F.ramNext && !F.ram2) F.ram2 = true;
    sanApproach(best, path);
    if (z.id === 'san' || c.z > -64) path.push([SAN_C.x, SAN_C.z]);
    if (z.id !== 'san' && c.z > -64) path.push([KIDO.x, KIDO.z + 3]);
    if (z.id === 'ni') path.push([NI_C.x, NI_C.z]);
    if (z.id === 'hon') honApproach(best, path);
    // 石段を上り切っていても、呼んだ郭の庭まで進ませる。
    path.push([z.pos.x, z.pos.z]);
    best.assault = null; best.width = Math.min(best.width, 6);
    routeOld(best, path, 2.6, () => { best.order = 'hold'; best.anchor = best.dest; });
    zoneTask(rt, z, F.step === 2.5 ? 'keepSan' : 'main');
    armySignal(rt, 'atsumare', 0.8, F.step === 2.5 ? 'keepSan' : 'main', null, () => {
      F.callSignalZone = z; F.callSignalUntil = rt.t + SIGNAL_SECONDS.atsumare;
      F.callSignalSecondAt = rt.t + 3;
      zoneTask(rt, z, F.step === 2.5 ? 'keepSan' : 'main');
      sayKino(rt, '法螺貝の二声は集合じゃ。味方は郭の旗へ寄れ！', 4);
    });
  },

  // ④ 日が傾く：三の郭を取ったら、松明を灯して攻め続ける
  dusk(rt) {
    const F = rt.flags;
    if (F.step >= 2.5 || F.ending || rt.over) return;
    F.step = 2.5; F.stepT = rt.t;
    if (rt.world.timeKey === 'day' || rt.world.timeKey === 'after') rt.world.setTime('dusk');
    rt.setPhase('torch');
    rt.banner(rt.world.timeKey === 'night' ? '夜攻めの支度' : '日が傾く', '藤吉郎が松明で攻めたと伝わる');
    torchTask(rt);
    rt.obj('keepSan', '三の郭に味方六人以上を残せ', 'side');
    // 深手や救援で火入れを止める札が出ている時は、逆の下知を重ねない。
    if (rt.G.lord || !torchPause(rt)) sayKino(rt, rt.G.lord ? '火を灯す組を守れ。仲間はここに残せ' : '印の松明に火を移せ。仲間はここを守れ', 3.5);
    armySignal(rt, 'atsumare', 0.8, 'keepSan', () => {
      // 使えなくなった火入れを言い直さず、奪還・退避・救援の下知を保つ。
      if (rt.over || F.ending || F.step !== 2.5 || !F.sanFell || (!rt.G.lord && torchPause(rt))) return;
      sayNear(rt, F.saku.units[0], F.torchBlocked ? rt.G.lord ? '松明のそばの敵を払え' : '敵を払うか、自分で火を移せ'
        : rt.G.lord ? '残る松明にも火を。灯す仲間を守れ' : '残る松明にも火を移せ。まだ先へ出るな');
    }, () => {
      if (!F.sanFell || (!rt.G.lord && torchPause(rt))) return;
      sayKino(rt, rt.G.lord ? '法螺貝の二声は集合じゃ。郭を固め、灯す組を守れ'
        : '法螺貝の二声は集合じゃ。仲間は郭を守り、残る松明に火を移せ', 4);
    });
    F.torchHelp = { group: null, index: -1, hold: 0, tick: 0 };
    markTorch(rt);
    if (rt.G.lord) return;
    TORCH.forEach((t, i) => {
      // すぐそばの「味方を呼ぶ」に隠れて火入れできなくなるのを防ぐ。
      rt.addInteract('t' + i, () => F.sanFell ? t : null, '火を移す', () => this.light(rt, i), { r: 3.4, hold: 1.2, prio: 5 });
    });
    torchTask(rt);
  },
  light(rt, i, own = true) {
    const F = rt.flags;
    if (F.step !== 2.5 || !F.sanFell || F.ending || rt.over || !TORCH[i]) return;
    const t = TORCH[i];
    rt.uninteract('t' + i); rt.unmark('t' + i);
    if (F.litMask & (1 << i)) return;
    rt.world.addFire(t.x, t.z, { torch: true, h: 0.35, size: 0.28 });
    // 山上の火入れも、地面の高さにある火の穂から音を届ける。
    const firePos = F.torchSoundPos || (F.torchSoundPos = { x: 0, y: 0, z: 0 });
    firePos.x = t.x; firePos.y = rt.world.heightAt(t.x, t.z) + 0.35; firePos.z = t.z;
    const path = F.signalPath || (F.signalPath = createSoundPath()), ear = rt.camera.position;
    const distance = Math.hypot(firePos.x - ear.x, firePos.z - ear.z);
    sampleBattleSoundPath(rt.world, firePos, ear, WIND_STATE, path, distance || 1);
    const audible = 0.7 * path.gain * Math.max(0, 1 - distance / 55) ** 1.5 >= 0.02;
    const delay = path.delay;
    rt.army.play('torchLight', firePos, 0.7);
    F.litMask = (F.litMask || 0) | (1 << i);
    F.lit++;
    if (own) {
      F.ownLit = (F.ownLit || 0) + 1; rt.tracker.c.torch = F.ownLit;
      // 落城を待たず、その場の働きを残す。途中で退いても消さない。
      if (!F.torchAwarded) {
        F.torchAwarded = true;
        rt.award((m) => m.side.push('松明で足元を照らし、夜攻めを続けた'), '松明で足元を照らした。味方が進める');
      }
      // 束で火を移した本人も一本を運ぶ。二本目を重ねて作らない。
      if (!F.playerTorch) F.playerTorch = carryTorches(rt.world, [rt.player.u]);
    }
    if (F.lit >= TORCH.length) this.night(rt);
    else {
      markTorch(rt);
      torchTask(rt);
      // 着火の合成音が届いた時だけ札にも残す。次の束や新しい下知へは持ち越さない。
      const lit = F.lit, serial = F.signalSerial;
      if (audible) rt.after(delay, () => {
        if (rt.over || F.ending || !rt.player.u.alive || F.step !== 2.5 ||
          F.lit !== lit || F.signalSerial !== serial || (!rt.G.lord && torchPause(rt))) return;
        const o = rt.objectives.find((task) => task.id === 'main' && !task.state);
        if (!o) return;
        const cue = rt.G.lord ? '火入れ：松明が爆ぜた。残る束を灯す組を守れ' : '火入れ：松明が爆ぜた。残る束へ火を移せ';
        // 同時に届いた集合の法螺・太鼓の案内を、着火の余韻で消さない。
        if (signalWait(rt) > 0 || o.cue) return;
        o.cue = cue; o.cueT = rt.t;
        const cueT = o.cueT;
        rt.after(4, () => {
          if (o.cue === cue && o.cueT === cueT) { o.cue = ''; o.cueT = 0; }
        });
      });
      // 最初の着火を下知にも残す。集合の法螺と台詞が終わるまで待つ。
      if (F.lit === 1) {
        const serial = F.signalSerial;
        rt.after(signalWait(rt), () => {
          // すでに全束を灯した時や、新しい合図が出た時には古い案内を出さない。
          if (rt.over || F.ending || !rt.player.u.alive || F.step !== 2.5 || F.signalSerial !== serial || (!rt.G.lord && torchPause(rt))) return;
          sayKino(rt, '火が移ったぞ。残る束にも灯せ。郭を守る仲間から離れるな！', 4);
        });
      }
    }
  },
  torchHelpTick(rt, dt) {
    const F = rt.flags, help = F.torchHelp;
    if (!help || !F.sanFell) return;
    help.tick += dt;
    if (help.tick < 0.5) return;
    const elapsed = help.tick; help.tick = 0;
    let i = 0;
    while (i < TORCH.length && (F.litMask & (1 << i))) i++;
    if (i >= TORCH.length) return;
    const t = TORCH[i];
    if (i !== help.index || gone(help.group) || !help.group.units.some(torchReady)) {
      let group = null, nearest = Infinity;
      // 灯す三組が倒れても、既存の控えが引き継ぐ。木戸を打つ組は残す。
      for (const g of [F.niwa, F.saku, F.kino, F.ramNext]) {
        if (g === F.ramNext && group) break;
        if (gone(g)) continue;
        for (const u of g.units) {
          if (!torchReady(u)) continue;
          const d = Math.hypot(u.pos.x - t.x, u.pos.z - t.z);
          if (d < nearest) { group = g; nearest = d; }
        }
      }
      if (!group) return;
      help.group = group; help.index = i; help.hold = 0;
      // 控えも開戦の固定位置から離し、柵の口を通って松明へ向かわせる。
      // 古い進軍の到着処理を残すと、火入れの途中で別の持ち場へ戻ってしまう。
      if (group === F.ramNext) F.ram2 = true;
      const path = [];
      sanApproach(group, path);
      path.push([t.x, t.z]);
      group.assault = null;
      routeOld(group, path, 2.3, () => { group.order = 'hold'; group.anchor = group.dest; });
    }
    const worker = help.group.units.find((u) => torchReady(u) && !(u.pinT > rt.army.time) && !u.atk && !u.swing && Math.hypot(u.pos.x - t.x, u.pos.z - t.z) < 3 && !rt.army.wallBetween(u.pos, -1, t));
    // 斬り合い中の灯し手も拾い、火が止まった理由を札と下知で伝える。
    // 実際に火を移せる条件は worker のまま変えない。
    const nearby = worker || help.group.units.find((u) => torchReady(u) && Math.hypot(u.pos.x - t.x, u.pos.z - t.z) < 3 && !rt.army.wallBetween(u.pos, -1, t));
    // 上階や塀の向こうの兵では火入れを止めない。灯し手に届く地上の敵だけを見る。
    const blocked = !!(nearby && rt.army.nearestEnemy(nearby, 6, (u) => zoneGroundFighter(rt, u) &&
      Math.abs(u.pos.y - nearby.pos.y) < 3 && !rt.army.wallBetween(nearby.pos, -1, u.pos)));
    if (F.torchBlocked !== blocked) {
      F.torchBlocked = blocked;
      torchTask(rt);
      // 退避・救援の札が出ている間は、本人へ火入れや攻撃を命じない。
      if (blocked && (rt.G.lord || !torchPause(rt)) && rt.t >= (F.torchWarnAt || 0)) {
        F.torchWarnAt = rt.t + 8;
        sayKino(rt, rt.G.lord ? '灯す組が敵に阻まれた。松明のそばの敵を払え' : '灯す仲間が敵に阻まれた。敵を払うか、自分で火を移せ', 3);
      }
    }
    if (!worker || blocked) { help.hold = 0; return; }
    help.hold += elapsed;
    if (help.hold >= 1.2) this.light(rt, i, false);
  },
  // ⑥ 夜戦：松明を持って二の丸の木戸へ。
  night(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2.8) return;
    F.step = 2.8; F.stepT = rt.t; F.nightStarted = rt.t;
    F.torchHelp = null;
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    // 火入れの守り札を外し、全員で木戸へ進む下知と食い違わせない。
    rt.objRemove('keepSan');
    siegeNight(rt.world);
    const W = rt.world;
    F.torches = carryTorches(W, F.kino.units.filter((u) => u.alive && u.type === 'ashigaru' && !(F.playerTorch && u === rt.player.u)).slice(0, 6));
    this.gateFight(rt);
  },

  // ②③ 夕方：軍議で選んだ道（無ければ攻めの頭が自分で選ぶ）で、外側の柵（三の郭）へ攻め上る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over) return;
    F.step = 2; F.stepT = rt.t;
    F.failDeadline = rt.t + 390; // 必要な人数が一度も集まらなくても、七分以内に攻め止めを決める。
    rt.setPhase('climb');
    rt.unmark('kino'); rt.uninteract('talk');
    // 浅井新八の手が北東の尾根から寄せ、本丸の東の守りと押し合う（遠景）
    F.asai.order({ id: 'move', to: { x: 62, z: -99 } });
    rt.after(6, () => rt.bark('浅井新八の手、東の尾根へ寄せる'));
    F.strategy = window.__mitsukuriStrategy || F.strategy || null;
    if (F.strategy !== 'ote' && F.strategy !== 'tani') F.strategy = null;
    if (!F.strategy) {
      // 初めての足軽を、開始地点から長い谷道へ引き返させない。
      F.strategy = 'ote';
      rt.bark(`下知、${F.strategy === 'tani' ? '西の谷' : '大手'}より寄せよ`);
    }
    rt.banner(F.strategy === 'tani' ? '西の谷から攻めよ' : '柵の口を抜け', '仲間と坂の守りを退け、足場を取れ');
    assaultOrder(rt, '柵の口を抜け、味方六人で三の郭を取れ', F.strategy === 'tani'
      ? '法螺貝じゃ。続く陣太鼓の早打ちでかかれ！　旗を伏せ、西の谷から守りの脇を突け'
      : '法螺貝じゃ。続く陣太鼓の早打ちでかかれ！　槍をそろえ、狭い柵の口を突き崩せ！');
    this.runStrategy(rt, F.strategy);
    // 総懸かりの札で共通の合成陣太鼓を鳴らす。単発の法螺と太鼓を重ねない。
    nextObj(rt, `総懸かり。${sanWay(rt)}。味方${F.SZ.byId.san.need}人で取れ`);
    // 人数と呼び方は現在の任務札で伝える。次の任務へ古い手ほどきを持ち越さない。
    rt.player.u._sanRoad = F.strategy === 'tani' ? TANI_ATTACK_ROAD : ROAD_OTE;
    rt.marker('san', F.strategy === 'tani' ? { x: -26, z: -35 } : { x: 0, z: -44 }, F.strategy === 'tani' ? '西の谷から柵の口へ' : '三の郭の柵の口', { guideAlways: true, alwaysDistance: true, guidePriority: 120 });

  },

  // 軍議の作戦：①大手の夜攻め（正面から三の郭へ） ②谷から松明で回る（三の郭の守りを避け、二の丸の脇へ）
  runStrategy(rt, strat) {
    const F = rt.flags;
    for (const g of [F.kino, F.niwa, F.ram]) for (const u of g.units) u._sanRoad = strat === 'tani' ? TANI_ATTACK_ROAD : ROAD_OTE;
    if (strat === 'tani') {
      routeOld(F.kino, TANI_ATTACK_ROAD.slice(4), 2.3);
      routeOld(F.niwa, TANI_ATTACK_ROAD.slice(3), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(5, 8));   // 今いる坂から寄せ、正面の守りを引きつける。
      routeOld(F.ram, TANI_ATTACK_ROAD.slice(3));
    } else {
      routeOld(F.kino, ROAD_OTE.slice(7, 9), 2.3);
      routeOld(F.niwa, ROAD_OTE.slice(6, 9), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(5, 9), 2.2);
      routeOld(F.ram, ROAD_OTE.slice(6, 9));
    }
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    routeOld(F.gunK, [...ROAD_OTE.slice(6, 8), [6, -34]]);

  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (rt.over || F.ending) return;
    if (F.SZ?.byId[id]?.owner === 'enemy') {
      F[id + 'Fell'] = false;
      F.honWait = false; F.honWaitWay = null;
      if (id === 'san' && F.step === 2.5) {
        // 火入れより奪還を先にする。灯す組も郭を取り戻す下知に戻す。
        if (F.torchHelp) {
          F.torchHelp.group = null; F.torchHelp.index = -1;
          F.torchHelp.hold = 0; F.torchHelp.tick = 0;
        }
        markTorch(rt); torchTask(rt);
      }
      // 本丸へ向かう途中で後ろを失ったら、札だけでなく味方の行き先も戻す。
      // 遠ざかる列が止まるまで、呼び直しを待たせない。
      if (F.step >= 4) this.resumeInside(rt);
      // 二つ以上失った時も、手前の郭から取り戻す。札・台詞・印を同じ下知にする。
      const target = !F.sanFell ? 'san' : !F.niFell && F.step >= 3 ? 'ni' : id;
      const name = target === 'san' ? '三の郭' : target === 'ni' ? '二の丸' : '本丸';
      if (F.step !== 2.5) nextObj(rt, zonePause(rt) || `味方と${name}へ戻り、敵を払え`);
      armySignal(rt, 'atsumare', 0.8, F.step === 2.5 ? 'keepSan' : 'main', null, () => {
        sayKino(rt, zonePause(rt) || `${name}の旗を守り直せ。法螺貝の二声は集合じゃ。仲間と戻れ！`, 4);
      });
      markZone(rt, target);
      return;
    }
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      if (!F.sanAwarded) { F.sanAwarded = true; rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた'); }
      if (F.step < 2.5) this.dusk(rt);
      else if (F.step === 2.5) {
        torchTask(rt); markTorch(rt);
        sayKino(rt, zonePause(rt) || (rt.G.lord ? '三の郭を取り戻した。残る松明を灯す組を守れ' : '三の郭を取り戻した。残る松明に火を移せ'), 3);
      }
      else if (F.step < 4) {
        if (F.gatePass) {
          nextObj(rt, zonePause(rt) || `木戸を抜け、味方${F.SZ.byId.ni.need}人で二の丸を取れ`);
          markZone(rt, 'ni');
          sayKino(rt, zonePause(rt) || '後ろは固まった。仲間と木戸の内へ進め！', 3);
          for (const g of F.oda) if (!gone(g)) routeOld(g, [[KIDO.x, KIDO.z + 3], [NI_C.x, NI_C.z]], 2.8);
          if (F.ram2 && !gone(F.ramNext)) routeOld(F.ramNext, [[KIDO.x, KIDO.z + 3], [NI_C.x, NI_C.z]], 2.8);
        } else {
          gateTask(rt);
        }
      } else this.resumeInside(rt);
    } else if (id === 'ni' && !F.niFell) {
      F.niFell = true;
      rt.unmark('ni');
      if (!F.niAwarded) { F.niAwarded = true; rt.award((t) => t.side.push('二の丸を押さえた'), '二の丸を押さえ、本丸への道を開いた'); }
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
    rt.banner('木戸へかかれ', '丸太の組、木戸へ詰める');
    gateTask(rt);
    // 札・下知とそろえ、今いる攻め手から鳴らす。無人の郭を音源にしない。
    armySignal(rt, 'susume', 1, 'main', null, () => {
      sayKino(rt, zonePause(rt) || '法螺貝じゃ。続く進み太鼓に合わせよ！　松明を掲げ、足元を見定めて木戸へ詰めよ', 4);
    });
    F.ram.assault = () => (F.gates.kido.struct.alive ? F.gates.kido.struct : null);
    F.ram.aggro = 2;
    // 松明から戻る手には新しい下知を渡す。古い到着待ちで再び足を止めない。
    for (const g of [F.kino, F.niwa, F.saku]) if (!gone(g)) routeOld(g, [[SAN_C.x, SAN_C.z]]);
    if (!gone(F.ram)) routeOld(F.ram, [[SAN_C.x, SAN_C.z], [KIDO.x, KIDO.z + 3]], 2.3,
      () => { F.ram.order = 'assault'; });

  },
  // 木戸の内（二の丸が落ちた直後の演出）
  resumeInside(rt) {
    const F = rt.flags;
    // 奪還後も、手前の郭から順に固める。札だけ変えて味方を置き去りにしない。
    const id = !F.sanFell ? 'san' : !F.niFell ? 'ni' : 'hon';
    const z = F.SZ.byId[id];
    nextObj(rt, zonePause(rt) || (id === 'san' ? '味方と三の郭を取り戻せ' : id === 'ni' ? '味方と二の丸を取り戻せ' : '味方と本丸の旗を守れ'));
    markZone(rt, id);
    sayKino(rt, zonePause(rt) || (id === 'san' ? '三の郭へ戻れ。仲間と旗を守れ' : id === 'ni' ? '次は二の丸じゃ。仲間と取り戻せ' : '後ろは固まった。仲間と本丸へ進め'), 3);
    for (const g of [...F.oda, ...(F.ram2 ? [F.ramNext] : [])]) {
      if (gone(g)) continue;
      const c = fightingCenter(g), path = [];
      sanApproach(g, path);
      if (id === 'san' || c.z > -64) path.push([SAN_C.x, SAN_C.z]);
      if (id !== 'san' && c.z > -64) path.push([KIDO.x, KIDO.z + 3]);
      if (id === 'hon') honApproach(g, path);
      path.push([z.pos.x, z.pos.z]);
      g.assault = null;
      routeOld(g, path, 2.8);
    }
  },
  inside(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (F.insideSaid) { this.resumeInside(rt); return; }
    F.insideSaid = true; F.step = 4; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate');
    rt.banner(F.sanFell ? '本丸へ押し上がれ' : '三の郭を取り戻せ', F.sanFell ? '二の丸を取った。最後の守りは坂の上' : '二の丸は取った。先に後ろの守りを固めよ');
    if (F.sanFell && !zonePause(rt)) {
      // 合図待ちの間に別の前進台詞を出さず、音が届く時の下知にまとめる。
      assaultOrder(rt, '本丸の敵を払い、味方十人以上で旗を守れ',
        '法螺貝じゃ。続く陣太鼓の早打ちでかかれ！　槍の列を崩すな。隣を守り、本丸へかかれ！');
    } else {
      sayKino(rt, zonePause(rt) || '先に三の郭へ戻れ。後ろの守りを固めよ！', 3.5);
    }
    zoneTask(rt, F.SZ.byId[F.sanFell ? 'hon' : 'san']);
    F.ram.assault = null;
    const path = F.sanFell ? ROAD_HON : [[SAN_C.x, SAN_C.z]];
    for (const g of F.oda) if (!gone(g)) routeOld(g, path, 2.8);
    if (F.ram2 && !gone(F.ramNext)) { F.ramNext.assault = null; routeOld(F.ramNext, path, 2.8); }
    markZone(rt, F.sanFell ? 'hon' : 'san');
    // 城将も郭の「残る敵」の印で案内する。別の印で旗の守りから引き離さない。
  },

  // 三曲輪を押さえた時だけ落城。城将一人を討っても即勝ちにはしない。
  midB(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || !F.sanFell || !F.niFell || !F.honFell) return;
    if (F.SZ) for (const z of F.SZ.zones) if (z.owner !== 'friend') return;
    // 味方が先に押さえても、足軽は本丸へ入り、持ち場を固めてから終える。
    const indoors = !rt.G.lord && courtyardHouse(rt, rt.player.u);
    if (!rt.G.lord && (!F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z) || indoors)) {
      F.callZone = null;
      if (!F.honWait) {
        F.honWait = true;
        rt.unmark('commander');
        markZone(rt, 'hon');
      }
      // すでに館へ入った本人には、登り終えた石段へ戻る下知を出さない。
      const way = indoors ? '戸口から庭の旗へ戻れ' : '城は取った。本丸の旗へ';
      if (F.honWaitWay !== way) {
        F.honWaitWay = way;
        nextObj(rt, way);
        rt.objProgress('main', '味方は三つの郭を押さえた。庭で仲間と守りを固めよ');
        if (rt.t >= (F.honWaitSayAt || 0)) {
          F.honWaitSayAt = rt.t + 8;
          sayKino(rt, indoors ? '城は取った。戸口から庭へ戻れ' : '味方が本丸を取ったぞ。西の石段を上がれ', 3);
        }
      }
      return;
    }
    F.step = 4.5; F.stepT = rt.t;
    this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('ni'); rt.unmark('hon'); rt.unmark('gate'); rt.unmark('commander'); rt.unmark('gather');
    rt.objDone('main'); rt.objDone('keepSan');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; if (F.nightStarted !== undefined && rt.t > F.nightStarted && rt.world.timeKey === 'night') t.special = { label: '夜のうちに箕作城を落とした', pts: 20 }; }, '箕作城を落とした');
    rt.objRemove('main'); rt.objRemove('keepSan');
    endGatherTask(rt);
    if (!rt.G.lord) markEndGather(rt);
    // 先の太鼓を待つ時間と、山中を音が届く余裕を後日談にも足す。
    // 合図役が全員退いても、後日談と戦の終了は止めない。
    F.endAt = rt.t + signalWait(rt) + SIGNAL_SECONDS.atsumare + 21;
    // 三秒ずつの法螺貝二声が届いてから勝鬨を上げ、集合の合図を聞き取れるようにする。
    // 合図と後日談の間も更新を続け、集合印と到着の判定を保つ。
    armySignal(rt, 'atsumare', 0.8, 'gatherEnd', () => {
      if (!rt.player.u.alive || rt.result?.down || !rt.tracker.main) return;
      const cryWait = armyCry(rt, 'eiei', () => {
        if (!rt.player.u.alive || rt.result?.down || !rt.tracker.main) return;
        const o = rt.objectives.find((o) => o.id === 'gatherEnd' && !o.state);
        const call = '勝鬨の音頭：えい、えい。続く「おう」に声を合わせよ';
        if (o) { o.cue = call; o.cueT = rt.t; }
        sayKino(rt, '勝鬨じゃ。「えい、えい」に続いて「おう」と返せ！　旗を守れ！', 3.5);
        // 合成音の返事は音頭の一・二五秒後。群声が届く時に札も返す。
        const serial = F.signalSerial;
        rt.after(1.25, () => {
          if (!rt.player.u.alive || rt.result?.down || !rt.tracker.main ||
            F.signalSerial !== serial || !o || o.state || o.cue !== call) return;
          // 音頭から三・六秒で余韻も終わる。後日談へ鬨の札を持ち越さない。
          cryCue(rt, o, '勝鬨の返事：おう！　深追いせず旗を守れ', 3.6 - 1.25);
        });
      });
      // 合図と勝鬨の到着を起点に後日談を送る。遠い合図でも勝鬨の台詞を途中で消さない。
      // 声を出せる兵が残らない時は、勝鬨を待たず後日談へ進む。
      rt.after(cryWait, () => {
        rt.say('', '箕作落城の知らせを受け、六角勢は観音寺城を捨てた。和田山城の兵も戦わず退いた', 6);
        for (const flag of F.kanFlags) flag.visible = false;
        F.wadaFlag.visible = false;
        for (const fire of F.kanFires) rt.world.removeFire(fire);
        F.kanFires.length = 0;
      });
      rt.after(cryWait + 6, () => rt.say('', 'その夜、信長は箕作山に陣を置いた。翌十三日、空になった観音寺城へ入った', 5));
      rt.after(cryWait + 11, () => rt.say('', '京への道が開いた。次の戦は伊勢、大河内城', 4));
      F.endAt = rt.t + cryWait + 16;
      rt.after(cryWait + 16, () => rt.finish({ scriptedEnd: true }, 0));
    }, () => {
      if (rt.G.lord) rt.say('近習', '箕作城が落ちました。追わずに備え、知らせをお待ちくだされ', 4);
      else sayKino(rt, `よく働いた、${nm(rt)}。法螺貝の二声は集合じゃ。本丸の集合印へ寄れ！`, 5);
    });
    rt.banner('六角勢、退く', '箕作城、落つ。本丸の守りを固めよ');
    // 固有の後日談を共通の追撃で消さず、勝った組は曲輪を固める。
    for (const g of [...F.oda, F.gunK, F.ramNext]) {
      if (gone(g)) continue;
      g.assault = null; g.onArrive = null; g.dest = null;
      const c = g.center();
      g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.formation = 'yari';
    }
    for (const b of F.defenders) if (b.real && !gone(b.real)) {
      b.real.onArrive = null; b.real.order = 'path'; b.real.formation = 'column'; b.real.colW = 2;
      b.real.path = ROAD_URA.map((p) => [...p]); b.real.pathIdx = 0;
    }
    rt.player.u.invuln = true;
    // 集合の合図と勝鬨、後日談を終えてから戦を閉じる。
  },

  update(rt, dt) {
    const F = rt.flags;
    if (!SETTINGS.reduceMotion) MK_CLOTH_T.value += dt;
    if (!F.clothSwept) { F.clothSwept = true; mkClothSweep(rt.scene); }
    if (!F.honDown && F.step >= 4 && rt.camera) honDown(rt);
    // 丸太の組と先手の掛矢も木戸を打つ。本人が門前へ着けなくても、三十秒を過ぎた木戸は少しずつ傷む（一戦を四〜七分に）。
    { const kido = F.step === 3 && F.gates?.kido?.struct;
      if (kido?.alive && rt.t - F.stepT > 30 && !F.ending) rt.army.damage(kido, 3 * dt, null, { kind: 'gateWork' }); }
    F.slopeFill.intensity = 0.32 - rt.world.nightAmount() * 0.17;
    // 控え馬の鼻息といななきは実在する馬の位置から。乗られた後や消えた後には鳴らさない。
    // 一秒ごとの確認と長い休みだけで、合図の最中にも重ねない。
    if (!rt.over && !F.ending && rt.t >= F.campHorseSoundAt) {
      F.campHorseSoundAt = rt.t + 1;
      const o = F.campHorse, H = o.h.userData.horse;
      if (rt.army.looseHorses.includes(o) && !H.dead && o.spd < 0.5 && signalWait(rt) === 0 &&
        Math.hypot(o.h.position.x - rt.camera.position.x, o.h.position.y - rt.camera.position.y,
          o.h.position.z - rt.camera.position.z) < 28) {
        // いななきは長く間を空け、間の鼻息とともに既存の合成音を使い回す。
        if (rt.t >= F.campHorseNeighAt) {
          rt.army.play('neigh', o.h.position, 0.65);
          F.campHorseNeighAt = rt.t + 45 + Math.random() * 20;
        } else {
          H.snortT = 0;
          rt.army.play('snort', o.h.position, 0.65);
        }
        F.campHorseSoundAt = rt.t + 14 + Math.random() * 10;
      }
    }
    if (!(F.groundDetailAt > rt.t)) {
      F.groundDetailAt = rt.t + 0.1;
      F.prepareHouseInteriors();
      const W = rt.world, p = rt.player.u.pos, dummy = F.shadowDummy;
      let count = 0;
      for (const u of rt.army.units) {
        if (u.blob) u.blob.visible = false;
        if (!u.alive || u.gone || u.isStruct || u.climb || u.mesh.visible === false || count >= 250 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 35) continue;
        const x = u.pos.x, z = u.pos.z, y = groundAt(W, x, z, u.pos.y);
        if (Math.abs(u.pos.y - y) > 0.6) continue;
        F.shadowNormal.set(
          groundAt(W, x - 0.2, z, y) - groundAt(W, x + 0.2, z, y), 0.4,
          groundAt(W, x, z - 0.2, y) - groundAt(W, x, z + 0.2, y)
        ).normalize();
        dummy.position.set(x + F.shadowNormal.x * 0.035, y + F.shadowNormal.y * 0.035, z + F.shadowNormal.z * 0.035);
        dummy.quaternion.setFromUnitVectors(F.shadowUp, F.shadowNormal);
        dummy.scale.set(u.mounted ? 1.4 : 0.85, 1, u.mounted ? 2 : 1.1);
        dummy.updateMatrix(); F.footShadows.setMatrixAt(count++, dummy.matrix);
      }
      F.footShadows.count = count; F.footShadows.instanceMatrix.needsUpdate = true;
      let lit = 0;
      for (const f of W.fires) if (f.lit && f.torch && lit < 4 && Math.hypot(f.x - p.x, f.z - p.z) < 25) F.soilTorches.value[lit++].set(f.x, W.heightAt(f.x, f.z), f.z);
      while (lit < 4) F.soilTorches.value[lit++].set(0, -10000, 0);
    }
    KIT.backTick(rt);
    if (F.torches) F.torches.update();
    if (F.playerTorch) F.playerTorch.update();
    butaiTick(rt, dt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (rt.over || !rt.player.u.alive) { F.callZone = null; rt.unmark('gather'); return; }
    if (F.ending) {
      F.callZone = null;
      // 落城後も集合印を残す。着いたら同じ札を書き替え、後日談を聞く役目に移る。
      const p = rt.player.u.pos;
      if (F.step === 4.5 && rt.t >= (F.endGuideAt || 0)) {
        F.endGuideAt = rt.t + 1;
        endGatherTask(rt);
      }
      if (!rt.G.lord && F.step === 4.5) {
        const gathered = F.C.kuruwa.hon.test(p.x, p.z) &&
          Math.hypot(p.x - HON_GATHER.x, p.z - HON_GATHER.z) <= 4 &&
          Math.abs(p.y - rt.world.heightAt(p.x, p.z)) < 2 && !courtyardHouse(rt, rt.player.u);
        // 一度集まってから庭を離れても、戻る道を失わせない。印は出入りの時だけ替える。
        if (gathered !== !!F.endGathered) {
          F.endGathered = gathered;
          if (gathered) rt.unmark('gather');
          else markEndGather(rt);
          endGatherTask(rt);
        }
      }
      return;
    }
    const pu = rt.player.u;
    if (pu.alive && pu.hp < pu.maxHp * 0.5 && (F.heavyWarnT ?? -31) + 30 < rt.t &&
      (rt.army.threats?.length || rt.army.nearestEnemy(pu, 8, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - pu.pos.y) < 3 && !rt.army.wallBetween(pu.pos, -1, o.pos)))) {
      F.heavyWarnT = rt.t;
      sayKino(rt, '深手じゃ。味方の後ろへ退け。命を捨てるな', 4);
    }
    // 曲輪の制圧を待って時刻を止めない。秒数は遊びの中での目安。
    if (rt.t >= 90 && (rt.world.timeKey === 'day' || rt.world.timeKey === 'after')) rt.world.setTime('dusk');
    if (rt.t >= 180 && rt.world.timeKey !== 'night') {
      siegeNight(rt.world);
    }
    // 夕空の間は知らせを積まず、実際に夜になった時だけ今の下知を伝える。
    if (rt.world.timeKey === 'night' && !F.nightSaid) {
      F.nightSaid = true;
      const action = zonePause(rt) || (!F.sanFell ? '仲間と三の郭の旗へ'
        : F.step === 2.5 ? rt.G.lord ? '松明を灯す組を守れ' : '残る松明に火を移せ'
          : F.step === 3 && !F.gatePass ? rt.G.lord ? '木戸を打つ組を守れ' : '木戸の前で掛矢を使え'
            : !F.niFell ? '仲間と二の丸の旗へ' : '仲間と本丸の旗へ');
      sayKino(rt, `暗くなったぞ。${action}`, 3);
    }
    updateGates();
    if (F.SZ) F.SZ.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (rt.t >= (F.guardWatchAt || 0)) {
      F.guardWatchAt = rt.t + 0.8;
      openingGunCall(rt);
      if (F.step === 4 && !F.commanderSaid && F.commander.alive && !F.commander.gone &&
        Math.hypot(F.commander.pos.x - pu.pos.x, F.commander.pos.z - pu.pos.z) <= 12 &&
        Math.abs(F.commander.pos.y - pu.pos.y) <= 4 && !rt.army.wallBetween(F.commander.pos, -1, pu.pos)) {
        F.commanderSaid = true;
        sayNear(rt, F.commander, 'ここが最後の守りぞ。槍をそろえ、押し返せ！', 3);
      }
      for (const b of F.defenders) {
        const g = b.real;
        if (!g || g.routed || g.order !== 'hold') continue;
        for (const u of g.units) if (siegeFighter(u) && !u.target && !u.atk && !u.swing &&
          Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 30 && Math.abs(u.pos.y - pu.pos.y) < 4) {
          u.watch = pu; u.watchT = rt.army.time + 2;
        }
      }
    }
    if (F.callZone && (F.callZone.friends >= F.callZone.need || F.step < 2 || F.step >= 4.5 || (F.step === 3 && !F.gatePass && F.sanFell))) F.callZone = null;
    if (!F.callZone) rt.unmark('gather');
    // 空白が続いた時だけ、坂の守りから分けた三人が南の口を通る。一度きりで増員しない。
    if (F.step === 2 && !F.sanFell && !F.sanSally && rt.t >= (F.sanSallyCheck || 0)) {
      F.sanSallyCheck = rt.t + 1;
      const z = F.SZ.byId.san;
      const empty = !z.enemies && Math.hypot(pu.pos.x - z.pos.x, pu.pos.z - z.pos.z) < 25 &&
        !rt.army.nearestEnemy(pu, 12, (u) => siegeFighter(u));
      if (!empty) F.sanEmptyAt = null;
      else {
        if (F.sanEmptyAt == null) F.sanEmptyAt = rt.t;
        if (rt.t - F.sanEmptyAt >= 20 && !gone(F.sanReserve)) {
          F.sanSally = true;
          routeOld(F.sanReserve, [ROAD_OTE[7], [0, -35], [0, -49], [SAN_C.x, SAN_C.z]], 2.2);
          sayKino(rt, '柵の口から敵が来るぞ。仲間と迎えよ', 3);
        }
      }
    }
    // 本人の近くは本物どうしの打撃だけ。数による推定損耗を重ねない。
    if (F.step >= 2 && F.asai && Math.hypot(pu.pos.x - F.asai.pos.x, pu.pos.z - F.asai.pos.z) > 70 &&
      Math.hypot(pu.pos.x - F.asaiFoe.pos.x, pu.pos.z - F.asaiFoe.pos.z) > 70 &&
      Math.hypot(F.asai.pos.x - F.asaiFoe.pos.x, F.asai.pos.z - F.asaiFoe.pos.z) <= 20) lightClash(F.asai, F.asaiFoe, dt, 0.06);
    // 火入れの下知と同時に仲間も動く。本人の操作を待つ空白を作らない。
    if (F.step === 2.5) this.torchHelpTick(rt, dt);
    if (F.step === 3 && F.gates.kido.opened && !F.gatePass) {
      F.gatePass = true; F.ram.assault = null;
      // 門が開いた瞬間に応える。二の丸制圧後に突破を言い直さない。
      if (F.gates.kido.breached) rt.award((t) => t.side.push('木戸を破った'), '木戸を破った。味方が二の丸へ進める');
      zoneTask(rt, F.SZ.byId[F.sanFell ? 'ni' : 'san']);
      armySignal(rt, 'susume', 1, 'main', null, () => {
        sayKino(rt, zonePause(rt) || (!F.sanFell ? '木戸は開いた。法螺貝じゃ。先に三の郭へ戻り、旗を固めよ！' : '口が開いたぞ！　法螺貝じゃ。続く進み太鼓に合わせ、二の丸へ入れ！'), 4);
      });
      rt.unmark('gate');
      markZone(rt, F.sanFell ? 'ni' : 'san');
      for (const g of F.oda) if (!gone(g)) routeOld(g, F.sanFell ? [[KIDO.x, KIDO.z + 3], [NI_C.x, NI_C.z]] : [[SAN_C.x, SAN_C.z]], 2.8);
      if (!gone(F.ramNext)) {
        // 門が開いたら控えも現在地から登る。人数不足になるまで麓へ残さない。
        F.ram2 = true;
        F.ramNext.assault = null;
        const path = [];
        sanApproach(F.ramNext, path);
        path.push([SAN_C.x, SAN_C.z]);
        if (F.sanFell) path.push([KIDO.x, KIDO.z + 3], [NI_C.x, NI_C.z]);
        routeOld(F.ramNext, path, 2.8);
      }
    }
    if (F.honFell && F.niFell && F.sanFell) this.midB(rt);
    if (F.ending) return;
    if (F.step === 2.5 && rt.t >= (F.sanGuideAt || 0)) {
      F.sanGuideAt = rt.t + 1;
      const z = F.SZ.byId.san;
      // 守れている間は火入れを主札にし、奪われたら奪還を先に示す。
      torchTask(rt);
      gatherZone(rt, z);
    }
    if (F.step >= 2 && F.step !== 2.5 && (F.step !== 3 || F.gatePass || !F.sanFell) && rt.t >= (F.zoneGuideAt || 0)) {
      F.zoneGuideAt = rt.t + 1;
      const id = !F.sanFell ? 'san' : F.step >= 3 && !F.niFell ? 'ni' : F.step >= 4 ? 'hon' : 'san';
      const z = F.SZ?.byId[id];
      if (z && z.owner !== 'friend') {
        const entered = id !== 'san' || z.friends > 0 || F.C.kuruwa.san.test(pu.pos.x, pu.pos.z);
        if (id === 'san' && entered && !F.sanEntered) {
          F.sanEntered = true;
          nextObj(rt, `三の郭の敵を払い、味方${z.need}人で守れ`);
          markZone(rt, 'san');
        }
        zoneTask(rt, z, 'main', id === 'san' && !F.sanEntered ? sanWay(rt) : '');
        if (id !== 'san' || F.sanEntered) markZone(rt, id);
        gatherZone(rt, z);
      }
    }
    if (F.step === 3 && !F.gatePass) {
      // 既存の札だけを更新する。三の郭を奪われた時は奪還の案内を優先する。
      if (F.sanFell && rt.t >= (F.gateGuideAt || 0)) {
        F.gateGuideAt = rt.t + 1;
        gateTask(rt, false);
      }
      // 負傷・敗走した兵を打ち手に数えない。郭へ呼んだ控えも木戸を引き継げる。
      // 控えの出動済みと木戸への下知を分け、三の郭の奪還中は引き抜かない。
      if (F.sanFell && gateCrewCount(F.ram) < 4 && !F.gateReserveSent) {
        F.gateReserveSent = true;
        const g = F.ramNext;
        const ready = gateCrewCount(g) > 0;
        if (ready) {
          F.ram2 = true;
          const path = [];
          sanApproach(g, path);
          path.push([SAN_C.x, SAN_C.z], [KIDO.x, KIDO.z + 3]);
          routeOld(g, path, 2.2, () => {
            g.order = 'assault';
            g.assault = () => F.gates.kido.struct.alive ? F.gates.kido.struct : null;
          });
        }
        // 控えへの下知を札にも即座に反映し、奪還中の札は上書きしない。
        if (F.sanFell) gateTask(rt, false);
        sayKino(rt, zonePause(rt) || (ready ? '控えの組が木戸を打つ。そばの敵を払え' : rt.G.lord
          ? '木戸を打つ組がいない。仲間を守れ' : '木戸を打つ組がいない。掛矢で打て'), 3);
      }
    }
    // 催促は下の攻め止め予告にそろえ、火入れや木戸打ちに別の下知を重ねない。
    // 藤吉郎の一隊が崩れかけたら知らせる。退却は下で攻め手全体を数えて決める。
    if (F.step >= 2 && !F.ending && !F.kinoWarn && F.kino.count > 0 && (F.kino.routed || F.kino.morale < 35 || F.kino.count < 6)) {
      F.kinoWarn = true; rt.say('組頭', '藤吉郎の組が崩れかけた。近くの味方と支え合え！', 4);
    }
    // 一隊の損耗ではなく、札と同じ制圧人数を集められなくなった時だけ早く退く。
    const target = F.SZ.byId[!F.sanFell ? 'san' : !F.niFell ? 'ni' : 'hon'];
    let ready = 0;
    for (const g of F.oda) for (const u of g.units) if (marchFighter(u)) ready++;
    if (F.ramNext) for (const u of F.ramNext.units) if (marchFighter(u)) ready++;
    const loss = F.step >= 2 && ready < target.need && target.friends < target.need;
    const canStop = rt.canFailMission() || rt.t >= F.failDeadline - 30;
    if (F.step >= 2 && F.step < 4.5 && canStop) {
      if (loss && F.lossDeadline == null) F.lossDeadline = rt.t + 30;
      if (!loss) F.lossDeadline = null;
      const deadline = Math.min(F.failDeadline, F.lossDeadline ?? Infinity);
      if (rt.t >= deadline - 30 && F.warnDeadline !== deadline) {
        F.warnDeadline = deadline; F.failureReadyAt = rt.t + 30;
        // 火入れ・木戸破りの最中に、別の郭を奪う下知を出さない。
        const action = loss ? '仲間を守り、退く支度をせよ' : !F.sanFell ? '味方と三の郭を取り戻せ' : F.step === 2.5
          ? rt.G.lord ? '松明を灯す組を守れ' : '残る松明に火を移せ'
          : F.step === 3 && !F.gatePass
            ? rt.G.lord ? gateCrewReady(rt) ? '木戸前の敵を払い、丸太の組を守れ' : '仲間を守り、退く支度をせよ' : '木戸の前で掛矢を使え'
            : !F.niFell ? '味方と二の丸を取れ' : '味方と本丸の旗を守れ';
        rt.banner(loss ? '手勢が足りぬ。攻め止めまで三十秒' : '攻め止めまで三十秒', action);
        sayKino(rt, loss ? '郭を守る人数が足りぬ。仲間を守り、退く支度をせよ' : `時がない。${action}`, 3);
      }
    }
    // 予告した直後と、人数回復で予告が取り消された時も同じ主札へ反映する。
    // 本丸への集合待ちなど、ほかの札の定期更新がない間も一秒ごとに数える。
    if (F.warnDeadline !== undefined && rt.t >= (F.stopGuideAt || 0)) {
      F.stopGuideAt = rt.t + 1;
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task) {
        const text = attackTaskText(rt, task.text);
        // 本文の更新で消える補足は戻し、火入れや掛矢の操作案内も残す。
        if (text !== task.text) {
          const progress = task.progress;
          rt.obj('main', text, 'main', true);
          rt.objProgress('main', progress);
        }
      }
    }
    if (F.step >= 2 && canStop && rt.t >= Math.max(F.failureReadyAt ?? Infinity, Math.min(F.failDeadline, F.lossDeadline ?? Infinity)) && F.step < 4.5 && !F.ending) {
      F.ending = true; rt.tracker.main = false; rt.objFail('main');
      F.callZone = null;
      rt.objRemove('main'); rt.objRemove('keepSan');
      for (const id of ['kino', 'san', 'ni', 'hon', 'gate', 'commander', 'gather']) rt.unmark(id);
      rt.uninteract('talk'); rt.uninteract('callFriends');
      for (let i = 0; i < TORCH.length; i++) { rt.unmark('t' + i); rt.uninteract('t' + i); }
      rt.obj('retreat', '攻めは終わり。味方の後ろへ退け', 'main', true);
      rt.banner('攻めを止め、麓へ退く');
      sayKino(rt, '攻めを止める。味方の後ろへ退け！', 3);
      rt.finish({}, 8);
    }
  },

  onFinish(rt) {
    const F = rt.flags;
    const text = rt.tracker.main ? '箕作を越え、次は京への道を進む' :
      // 一度取った郭も奪われる。手柄の有無より、止まった所と本人の役目を伝える。
      !F.sanFell ? `味方を呼び、${sanWay(rt)}` :
      F.lit < TORCH.length ? rt.G.lord ? '三の郭で松明を灯す組を守れ' : '三の郭の松明に三束とも火を移せ' :
      !F.gatePass ? rt.G.lord ? '木戸前の敵を払い、丸太の組を守れ' : '木戸の前で掛矢を使え' :
      !F.niFell ? `木戸を抜け、味方${F.SZ.byId.ni.need}人で二の丸を取れ` :
      `西の石段から本丸へ。味方${F.SZ.byId.hon.need}人で旗を守れ`;
    rt.hud.resultNotices.push({ text });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v === F.commander && v.group) {
      rt.unmark('commander'); v.group.noRout = false; v.group.morale -= 40;
      // 城将を先に討っても、火入れや木戸破り、手前の郭の奪還を飛ばさない。
      if (k && k.isPlayer && !F.ending) {
        // 討取りの直後も、退避・救援の下知を任務札とそろえる。
        const action = zonePause(rt) || (!F.sanFell ? '仲間と三の郭を取れ' : F.step === 2.5
          ? rt.G.lord ? '松明を灯す組を守れ' : '残る松明に火を移せ'
          : !F.gatePass ? rt.G.lord ? '木戸前の敵を払え' : '掛矢で木戸を打て'
            : !F.niFell ? '仲間と二の丸を取れ' : '仲間と本丸の旗を守れ');
        rt.say('足軽', `城将が倒れた！　${action}`, 3);
      }
    }
  },
  onRout(rt, g) {
    // 同じ隊の知らせは一度だけ。ほかの隊とも三十秒あける。
    const F = rt.flags;
    if (F.ending || rt.over || g.team !== 1 || !g.name || g._routSaid || rt.t < (F.routSayT || 0) || Math.hypot(g.center().x - rt.player.u.pos.x, g.center().z - rt.player.u.pos.z) > 35) return;
    g._routSaid = true; F.routSayT = rt.t + 30;
    // 敗走先を決めつけて追わせず、現在の任務を続ける下知にする。
    // 敵が退いても、深手の本人や救援中の本人を前へ追わせない。
    const action = zonePause(rt) || (!F.sanFell ? '仲間と三の郭を取れ' : F.step === 2.5
      ? rt.G.lord ? '松明を灯す組を守れ' : '残る松明に火を移せ'
      : F.step === 3 && !F.gatePass ? rt.G.lord ? '丸太の組を守れ' : '掛矢で木戸を打て'
        : !F.niFell ? '仲間と二の丸を取れ' : '仲間と本丸の旗を守れ');
    rt.say('足軽', `敵の列が崩れた。${action}`, 3);
  },
};

// この局地の仮の人数。討死一人を数十人に水増ししない。全軍の残数とはしない。
mitsukuri.force = () => ({ a: 10000, a0: 10000, b: 800, b0: 800 });
mitsukuri.sides = { a: { name: '織田勢（仮の人数）', mon: 'oda' }, b: { name: '六角勢（仮の人数）', mon: 'rokkaku' } };
mitsukuri.noTaishoRaid = true;   // 短い強襲では殿の守りの襲来を出さない（A059）
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・${rt.world.timeKey === 'night' ? '夜' : rt.world.timeKey === 'dusk' ? '夕暮れ' : '申の刻'}`;
mitsukuri.canSkip = () => ''; // 遠くの射撃・下知・時刻を一度に飛ばさない。
mitsukuri.history = '永禄十一年（1568）九月、織田信長は足利義昭を奉じて京へ上る兵を起こした。道をふさぐ南近江の六角義賢（承禎）・義治の父子は従わず、観音寺城と、その支えの和田山城・箕作城に兵を入れた。九月十二日、信長は佐久間信盛・木下藤吉郎・丹羽長秀・浅井新八に箕作城を攻めさせた。織田勢は申の刻から攻めかかり、夜のうちに城を落とした。藤吉郎が数百の松明を灯して夜に攻め上ったという話は、のちの伝えである。その夜、信長は箕作山に陣を置き、六角父子三人が退いた観音寺城へ翌十三日に入った。信長はこのあと京へ入り、義昭は十五代将軍となった。信長公記に城将の名・城兵の総数・天候の記載はない。四手の攻め口、曲輪の配置、木戸破り、風や地面の湿りは仮定。表示する織田一万・城兵八百は局地の仮の人数で、上洛軍全体や史料で確定した総数ではない。';
mitsukuri.lordAt = { x: 4, z: 74, r: 12, why: '箕作の麓の織田の陣（諸将に箕作攻めを命じた）' };
mitsukuri.lordSpawn = { x: 4, z: 70, heading: Math.PI };
mitsukuri.rts = true;
// 敗れた組も、登った大手道を縦隊で下る。斜面へ直進させない。
mitsukuri.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const from = { x: 0, z: 0, s: 0, d: 0 };
  sanRoadPoint(ROAD_OTE, g.center(), from);
  for (const u of g.units) u._sanRoad = ROAD_OTE;
  return [...ROAD_OTE.slice(0, Math.floor(from.s) + 1).reverse(), [CAMP.x, CAMP.z]];
};

// 軍議（gungi.js）：城を回して見て、道を一つ選ぶ
mitsukuri.gungi = (rt) => {
  if (!rt.G.lord) return null; // 足軽・組頭は全軍の軍議を開かない。
  const F = rt.flags;
  const G = {
    center: { x: -20, z: -95 }, dist: 210,
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
  // 館へ迷い込んだら、壁を押さず戸口を通って庭の任務へ戻る。
  if (courtyardHouse(b, u)) {
    const exit = courtyardWay(b, HON_GATHER);
    inp.guardHold = false;
    goTo(p, inp, exit.x, exit.z, 0.4, true);
    return;
  }
  const e = strikeTarget(b, 12);
  // 斜面の向こうの兵を追い続けると、道案内と敵追いが競合して山道から進めない。
  // 届く相手へ寄り、届かない所からの打ち込みは受け、それ以外は下知の道を進む。
  if (e && !courtyardHouse(b, e) && (sanDirect(b.army, u, e.pos) || e.atk?.target === u ||
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
  if (F.step === 3 && !F.gatePass) {
    // 木戸前に立つだけでは掛矢が出ない。遊ぶ人と同じ長押しの打つ手を使う。
    const q = nearIt(b, '_gram');
    if (q) {
      if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2);
      else { inp.k.add('KeyE'); inp.k.delete('KeyW'); }
    } else goTo(p, inp, KIDO.x, KIDO.z + 3, 1.5);
    return;
  }
  const zone = F.SZ.byId[!F.sanFell ? 'san' : !F.niFell ? 'ni' : 'hon'];
  const enemy = zone._guideEnemy;
  const tgt = enemy && zoneGroundFighter(b, enemy) && zone.test(enemy.pos.x, enemy.pos.z) ? enemy.pos : zone.pos;
  goTo(p, inp, tgt.x, tgt.z, 2);
};

export { mitsukuri };

// 比高２１０ｍ。盛り上げ量は地形の準備で麓の高さから一度だけ決める。曲輪間の段差は保つ。
const LIFT = { x: 0, z: -100, tx: 0, tz: -40, w: 30, R: 95, rise: 199 };

// 東西の尾根と南支尾根を同じ比高で持ち上げる。麓の陣と既存の九十九折りは元の盛り上げを使う。
const RIDGE_LIFT = { x: -165, z: -145, tx: 115, tz: -130, w: 57, R: 55, rise: 199 };
const SOUTH_LIFT = { x: -55, z: -100, tx: -55, tz: -25, w: 18, R: 45, rise: 199 };
function castleLift(x,z) { return Math.max(yamaLift(x,z,LIFT),yamaLift(x,z,RIDGE_LIFT),yamaLift(x,z,SOUTH_LIFT)); }
