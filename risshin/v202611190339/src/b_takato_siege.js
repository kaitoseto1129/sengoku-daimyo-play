import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 攻城 C7・C9　高遠城の戦い・縄張り版（docs/siege-plan.md C7・C9／siege-spec.md 57・62・69章）
// 天正十年（1582）三月二日。武田の城々が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり降らなかった。
// 織田信忠の手が城を攻め、その日のうちに落ちた。ここは castle_plan.js の縄張り（castles/takato.js）・
// 門（siege_gate.js）・梯子（siege_ladder.js）・区域制圧（siege_zones.js）・城の頭（siege_ai.js）を
// 使った縄張り版（旧い b_takato.js の読み口もこの一戦を参照する）。
// C9：攻め方で結果が変わる【城62】。①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で
//      ④二の丸を取って本丸の口へ射手を寄せる、の四つ（軍議・window.__takatoStrategy で選ぶ）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RANKS } from './state.js';
import { sfx, signal } from './audio.js';
import { nm, wallLine, enemyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { demRelief, demDetail } from './dem.js';
let tkDem = null;
useTerrain('dem_takato', (data) => { tkDem = data; HEIGHT_DEM = null; HEIGHT_FN = null; ROAD_SEGMENTS = null; BRIDGE_SEGMENTS = null; });
import { heightOf, inPoly, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight, kabukiGate, goten, castleMat } from './castle_parts.js';
import { palisade, castleBoardFence, nobori, makeKitBatch, finalizeKitBatch, village, solidCircle, solidRect, tawara, lumber, hatazao, jinmaku, kagaribiBatch } from './props.js';
import { S as SETTINGS } from './settings.js';
import { reset as flReset, groundAt } from './floors.js';
import { localClear, mountainWay } from './army_local_way.js';
import { clearFoot } from './cover_guide.js';
import { makeSiegeZones, siegeFighter } from './siege_zones.js';
import { siegeStages } from './siege_stages.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeNawabari } from './nawabari.js';
import { tick as tkStuck } from './takato/stuck.js';
import { placeLadder, startClimb, knockDown, updateLadders, resetLadders } from './siege_ladder.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance, addTaba } from './taketaba.js';
import { logEvent } from './senkyo.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_RETREAT, EVENT_REINFORCEMENT } from './battle_events.js';
import { volleyAll, leanAll } from './b_mid.js';
import {
  TAKATO_PLAN as TAKATO_BASE_PLAN, TAKATO_BUILDINGS, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU, BRIDGES,
} from './castles/takato.js';

// 三峰川の断崖の上に、空堀で分かれた七曲輪を土と木で建てる。
// 共用の縄張りは写して使い、ほかの戦の城を変えない。
const TAKATO_PLAN = { ...TAKATO_BASE_PLAN,
  // 枝先まで道と高低差を調べ、寄せ道と急な切岸へ逆茂木を掛けない。
  sakamogiMaxRise: 2,
  // 土塁は既存の地形に含まれる。細分の違う薄皮を重ねると、
  // 高画質の切岸だけ明暗の三角形が交互に露出する。
  terrainBanks: true,
  // 土の切岸は内外をつなぐ。縁の直外だけ二・七メートル落とす共通の段差を作らない。
  continuousEdges: true,
  kuruwa: TAKATO_BASE_PLAN.kuruwa.map((k) => ({
  ...k,
  // 台地の高さを全曲輪と建物で共用する。外の地面だけ高くしない。
  level: () => castleBase(0, 0) + k.level,
  // 本丸・二の丸・大手は板塀、低い脇曲輪は透ける木柵。既存の切岸と空堀を見せる。
  wallOpt: { ...k.wallOpt, openFence: k.kind === 'koshi' || k.id === 'san_north',
    // 脇の段は写真の細杭と二段の横木。高さ・控え・壊れる区画は保つ。
    lightFence: k.kind === 'koshi' || k.id === 'san_north',
    // 八巡目：写真の板塀に合わせ、角材の笠を薄い板葺きへ替え、縦板の目地を見せる。
    // この縄張りは各辺の左が曲輪内。狭間の上下の横桟を内側だけへ通す。
    // 共通部品の明示指定を使い、高さ・狭間・虎口・壊れ方と他の戦は変えない。
    boardCap: true, boardSeams: true, boardRailsSide: 1,
    // 11/8 critic60（八1）：のっぺりした一枚の焦げ茶の板に見えた。柱間ごとに沈みと建て起こしの差を付ける
    unevenBoards: true,
    // 切岸と道の坂に合わせ、下段の板だけを地面へ埋める。狭間と虎口は保つ。
    groundBoards: true },
})),
  // 四角い囲いは作らず、冠木門と短い柵の喰違いにする。
  koguchi: TAKATO_BASE_PLAN.koguchi.map((g) => ({ ...g, kind: g.kind === 'masu' ? 'kuichigai' : g.kind })),
  // 城内の井楼は屋根を載せた高い丸太組み。床・梯子・守兵も同じ高さを使う。
  // 11/6 critic60：本丸・二の丸に梯子の付いた高い井楼が四つ五つ並び、大手脇には柱の上の箱の物見が浮いていた。
  // 天正の高遠は土塁と塀の土の城（伊那市の解説：櫓は江戸の物）。井楼・物見は置かず、塀と門と主殿だけにする。
  yagura: [],
  // 主殿も堂と同じ薄い板葺きの入母屋。主殿だけ残っていた厚い檜皮の軒を替える。
  lordSeat: { ...TAKATO_BASE_PLAN.lordSeat, templeBoardRoof: true },
};

const CLEAR_BOUNDS = TAKATO_BASE_PLAN.kuruwa.map((k) => ({ x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])), z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])) }));

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
import { jinkeiBuild } from './jinkei.js';
import { flagTexture } from './textures.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import { stoneTex } from './nature.js';
import { NAKA, nakaFind } from './naka.js';
import { timeslipField } from './timeslip_field.js';
import { evPerson } from './b_ev6.js';

// 使番が先手へ伝える合図。既存の合成音を使い、札は一枚だけ短く出す。
function siegeSignal(rt, kind, text) {
  signal(kind, 0, 0.85);
  rt.flags.siegeSignal = kind;   // 合図は音と使番の声だけ。右上へ説明の二行目を出さない（kaito 五1）
  if (kind === 'kakari') rt.after(3, () => {
    if (!rt.over && !rt.flags.ending && rt.player.u.alive) sfx('toki', 0.65);
  });
}

// 右上の一行：時の順の番号①〜⑥を頭に付け、段ごとに字を固定し、前の段へ戻さない（kaito 三1・三3）。
const STAGE_MARK = '①②③④⑤⑥';
const STAGE_TEXT = [
  '東の大手道を進み、大手門へ寄せよ',
  '大手門の前で、打って出た城兵を受けよ',
  '退く城兵に続き、大手門から三の丸へ入れ',
  '二の丸の土橋を渡り、二の丸の門から入れ',
  '本丸門を破り、主殿の奥の間へ進め',
  '本丸の旗の下に集まり、味方と旗を守れ',
];   // 織田家編の読み口（b_takato.js の TK_STAGE_TEXT）と同じ言い方
// 主人公の交戦は、全滅・曲輪の制圧とは別に確かめる。
// 四秒より早く自ら討った時も、城兵を受けた働きとして残す。
// 11/10 クラウドの流し（携帯の bot）：出撃の兵に当たらないまま開いた門から三の丸へ入り、三十三人討っても②のまま刻限まで進まなかった。
//   主人公が三の丸で八人討てば、出撃を受けきった事にする。味方の討ち取りだけでは果たさない。
export function receivedSally(F) { return (F.sallyContact || 0) >= 4 || !!F.sallyPlayerKill || (F.sallyInteriorKills || 0) >= 8; }

// 大手の木戸から出る二組も、控えと同じ迎撃の相手として数える。
// 門前で実際に斬り合っても、所属の違いで②が残り続けないようにする。
function sallyFoe(F, u) {
  return u.group === F.reserveDef.real ||
    !!F.sallyRelief && u.group === F.sallyRelief.real ||
    !!F.masuSally && u.group === F.masuSally ||
    !!F.gateBrawl && (u.group === F.gateBrawl[2] || u.group === F.gateBrawl[3]) ||
    u.group === F.sanSpear.real && Math.hypot(u.pos.x - OTE.x, u.pos.z - OTE.z) < 12;
}

// 落城と余韻は同じ条件で始める。城主の最期だけでは旗を守ったことにしない。
export function canWinTakato(rt) {
  const F = rt.flags;
  return !rt.over && !F.ending && rt.player.u.alive && receivedSally(F) &&
    !!F.sanFell && !!F.niFell && !!F.honFell && F.metLord != null &&
    !!(F.keep?.down || F.keepFell) && F.honHold >= 12;
}

// 近くで味方と戦っているだけでは、主人公が城兵を受けた時間にしない。
function sallyContactTick(rt, dt) {
  const F = rt.flags, p = rt.player.u;
  if (receivedSally(F) || F.sallyReturning || F.sanFell) return;
  // 開いた大手門から先に入った時は、三の丸で本人が受ける刃も数える。
  // 出撃の組だけを待ち続けず、八人を討つ前でも実際の四秒の交戦で進める。
  const inside = F.gates.oteOuter.opened && F.gates.oteInner.opened &&
    F.C.kuruwa.san.test(p.pos.x, p.pos.z) &&
    Math.abs(p.pos.y - rt.world.heightAt(p.pos.x, p.pos.z)) < 3;
  for (const u of rt.army.units) {
    if (!sallyFoe(F, u) && !(inside && u.team !== p.team &&
        F.C.kuruwa.san.test(u.pos.x, u.pos.z))) continue;
    if (!siegeFighter(u) || u.noTarget || Math.abs(u.pos.y - p.pos.y) >= 2 ||
        Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) >= 3.5) continue;
    // 弓・鉄砲の構え時間を、城兵と刃を交えた時間へ足さない。
    const receiving = u.atk?.target === p && !u.atk.ranged && !u.atk.bow || u.swing?.target === p && !u.swing.done;
    const attacking = p.atk?.target === u && !p.atk.ranged && !p.atk.bow || p.swing?.target === u && !p.swing.done;
    if ((receiving || attacking) && !rt.army.wallBetween(p.pos, -1, u.pos)) {
      F.sallyContact = (F.sallyContact || 0) + dt;
      return;
    }
  }
}

// 城兵が追わない後方の列や、道の脇へ迎撃の印を戻さない。
// 深手の時は城兵と同じ門前までに絞り、退いた先へ追わせない。
const SALLY_FRONT = { x: 97, z: 0 };
function sallyReceiver(rt) {
  const F = rt.flags, player = rt.player.u, p = player.pos;
  const limit = player.hp < player.maxHp * 0.5 ? 97 : 112;
  let nearest = null, best = Infinity;
  for (let i = 0; i < 3; i++) {
    const g = (i === 0 ? F.oteSpear : i === 1 ? F.reserve : F.dan2)?.real;
    if (!g || g.routed) continue;
    for (const u of g.units) {
      if (!siegeFighter(u) || u.noTarget || Math.abs(u.pos.y - p.y) >= 3 ||
          u.pos.x < 92 || u.pos.x > limit || Math.abs(u.pos.z) > 4) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < best && !rt.army.wallBetween(p, -1, u.pos)) { best = d; nearest = u; }
    }
  }
  return nearest ? nearest.pos : SALLY_FRONT;
}

// 控えが討たれて別の組が出る時も、同じ迎撃先の印を引き継ぐ。
function markSally(rt) {
  rt.marker('sally', () => sallyReceiver(rt), '味方の槍の列');
}

// 控えが先に討たれた時も、既存の三の丸の槍を大手へ出す。
// 人を足したり、待つだけで迎撃を果たした扱いにはしない。
function sallyReliefTick(rt) {
  const F = rt.flags;
  // 11/18 19:35 持ち主（act bot：控えが味方に討たれ尽くしてから三の丸の槍が二の丸の脇から百m 歩き、本人が門前で敵0のまま七十秒待った）：
  //   控えの戦える者が三人を切り、本人の二十m 内に一人もいなければ、代わりの組を出す（尽きるのを待たない。
  //   本人がまだ控えと斬り合っている時に出すと、門前で二組と塀の鉄砲に挟まれて倒れた）
  if (receivedSally(F) || F.sanFell || F.step < 1) return;
  if (!F.sallyRelief && !deadB(F.reserveDef)) {
    const pp = rt.player.u.pos;
    const live = F.reserveDef.real.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget);
    if (live.length > 2 || live.some((u) => Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) < 20)) return;
  }
  const b = F.sallyRelief || F.sanSpear;
  if (deadB(b)) return;
  if (!F.sallyRelief) {
    F.sallyRelief = b;
    F.sallyN = b.real.units.filter(siegeFighter).length;
    F.sallyOut = true; F.sallyUntil = 0; F.sallyReturning = false; F.sallyBegun = true;
    markSally(rt);
    for (const q of F.sallyGates) {
      if (q.gate === F.gates.gateNi) continue;
      q.passed = true;
      if (!q.gate.breached) q.gate._openNow(false);
    }
    setRoute(b, [...ROAD_OTE.slice(1, 8).reverse(), [97, 0]]);
    rt.say('森長可', '三の丸から城兵が打って出るぞ！　大手門の前で受けよ', 4);
  }
}

function mainObj(rt, stage) {
  const F = rt.flags;
  if (stage > 1 && !receivedSally(F)) stage = 1;
  if (stage < (F.objStage ?? -1)) return;
  F.objStage = stage;
  const text = STAGE_MARK[stage] + '　' + STAGE_TEXT[stage];
  if (F.objText === text) return;
  F.objText = text; rt.obj('main', text, 'main', true);
}

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2a2622, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記巻十五の大手五将と西の信忠。曲輪別の将の配り・人数は復元。
// 伊那市の「数千の兵で数万の軍勢」に合わせ、三万対三千を表示の目安にする。
// 総勢と備えの帳面だけをそろえ、近い兵・遠景の人数は変えない。
const TAKATO_ATTACK = sonaePlan('両口の寄せ', 0, { x: -124, z: 0 }, Math.PI / 2, [
  ['nobutada', '本陣', '織田信忠', 10000, -124, 0, Math.PI / 2, 'oda', 'oda'],
  ['oteSpear', '大手の仕寄り', '森長可', 5000, 127, 0, -Math.PI / 2, 'tsuru', 'tsuru'],
  ['reserve', '大手の控え', '河尻秀隆', 5000, 149, 6, -Math.PI / 2, 'oda', 'none'],
  // 11/4 p100（kaito AF・AV4）：描いただけの遠い備え（近づくと消える）は置かない。帳面の人数だけ持つ。
  // 11/6 六版：布陣図の名は森長可・河尻秀隆と同じ「姓＋諱」にそろえる（名札の団忠正とも合わせる）。
  ['dan', '大手の第二陣', '団忠正', 4000, 153, -16, -Math.PI / 2, 'oda', 'none'],
  ['mori', '大手の南脇', '毛利長秀', 3000, 149, 28, -Math.PI / 2, 'oda', 'none'],
  ['ogasawara', '大手の北脇', '小笠原信嶺', 3000, 129, -28, -Math.PI / 2, 'oda', 'none'],
]);
const TAKATO_DEFEND = sonaePlan('曲輪ごとの守り', 1, { x: -56, z: 0 }, Math.PI / 2, [
  ['honGuard', '本丸', '仁科盛信', 900, -49, 0, Math.PI / 2, 'takeda', 'takeda'],
  ['sanSpear', '三の丸と大手', '諏訪勝右衛門', 960, 73, -16, Math.PI / 2, 'takeda', 'takeda'],
  ['niSpear', '二の丸', '小山田昌行', 540, 10.625, 0, Math.PI / 2, 'takeda', 'takeda'],
  ['hodoinSpear', '西の搦手', '名は伝わらない', 420, -76, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['reserveDef', '二の丸の控え', '名は伝わらない', 180, -4.25, 12, Math.PI / 2, 'takeda', 'takeda'],
]);
for (const p of [TAKATO_ATTACK, TAKATO_DEFEND]) for (const s of p.sonae) s.bind = (rt) => rt.flags[s.id];
// 団忠正の本物の隊は flags.dan2（寄せ道の奥の第二陣）。
TAKATO_ATTACK.sonae.find((s) => s.id === 'dan').bind = (rt) => rt.flags.dan2;

// 11/10 布陣図（docs/fujin/takato.md）：大手の後ろの四将（河尻・団・毛利・小笠原）の厚みを、千人に一本の幟と
//   毛利・小笠原の陣幕で見せる（軽い大軍は霧の手前で描かれず、近づくと消える備えは置かない＝kaito AV4）。
//   幟は備えの後ろ（東）に横一列。大手道（z が ±6 の内）には立てない。
function takatoOteJin(rt) {
  for (const s of TAKATO_ATTACK.sonae) {
    if (!['reserve', 'dan', 'mori', 'ogasawara'].includes(s.id)) continue;
    const x0 = TAKATO_ATTACK.honjin.x, z0 = TAKATO_ATTACK.honjin.z;
    const sn = Math.sin(TAKATO_ATTACK.facing), cs = Math.cos(TAKATO_ATTACK.facing);
    const x = x0 + s.at.right * cs + s.at.front * sn, z = z0 - s.at.right * sn + s.at.front * cs;
    const n = Math.round(s.soldiers / 1000);
    const half = (n - 1) / 2 * 3.2, side = z < 0 ? -1 : 1;
    const zc = Math.abs(z) - half < 7 ? side * (7 + half) : z;   // 列の端が大手道に掛かる時は道の外へずらす
    const onWay = (px, pz) => distToPolyline(px, pz, ROAD_OTE) < 12 || TAKATO_PLAN.paths.some((p) => distToPolyline(px, pz, p.pts) < 5) || PEOPLE_PATHS.some((pts) => distToPolyline(px, pz, pts) < 4);
    for (let i = 0; i < n; i++) {
      const px = x + 9 + (i % 2) * 1.2;
      let pz = zc + (i - (n - 1) / 2) * 3.2;
      for (let k = 0; k < 12 && onWay(px, pz); k++) pz += side * 2;
      if (!onWay(px, pz)) rt.scene.add(nobori(rt.world, px, pz, 'oda', 4.6));
    }
    if ((s.id === 'mori' || s.id === 'ogasawara') && !onWay(x + 16, z)) rt.scene.add(jinmaku(rt.world, x + 16, z, 8, 10, 4, { mon: 'oda' }));
  }
}

const ODA = { armor: 0x2a2622, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };

// ---------------- 地形：南は崖（三峰川）、西は切岸（梯子が要る）、北から緩く台地へ ----------------
function baseTerrain(x, z) {
  // 本丸の床から三峰川まで約80m。曲輪間の守りは段差でなく空堀。
  let h = 36;
  // 11/2 docs/battle_refs/takato.md：三峰川へは比高約80m。縁は竪堀の間で尾根が張り出して波打ち、
  // 上の急な切岸の下に、川まで林の急斜面が続き、川原で平らになる（一枚の真っ直ぐな壁にしない）。
  const edge = CLIFF_Z + Math.max(0, 3 + 3 * Math.sin(x * .045 + 1) + 1.5 * Math.sin(x * .13));
  const d = z - edge;
  let drop = d > 0 ? Math.min(30, d * 2.6) + Math.min(50, Math.max(0, d - 11) * 2.2) : 0;
  // 本丸の南西の崖。西口の幅六メートルの尾根は掘り残す。
  if (x < NISHI_X) {
    const side = Math.max(0, Math.abs(z) - 3);
    drop = Math.max(drop, Math.min(30, (NISHI_X - x) * 1.8) * (1 - Math.exp(-side * side / 28)));
  }
  h -= drop;
  if (z < -65) h -= Math.min(40, (-65 - z) * 1.6);
  if (x > 100) h -= Math.min(12, (x - 100) * .15);
  return h;
}
// 空堀と竪堀の窪みを見た目と歩く地形へ共通に反映する。
const HORI_FNS = TAKATO_PLAN.hori
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function castleBase(x, z) { return baseTerrain(x, z); }
function baseWithHori(x, z) {
  let h = castleBase(x, z);
  for (let i = 0; i < HORI_FNS.length; i++) {
    const cut = HORI_FNS[i](x, z);
    // 台地の基準は本丸。堀の底は高い側の縁から測る。
    // 二ノ丸・三ノ丸間の底は本丸-2m（両縁から3〜5.5m）、本丸・二ノ丸間は本丸-7m（両縁から7〜8m）。
    h += cut * (i === 0 ? 2 / 5 : i === 1 ? 7 / 8 : 1);
  }
  return h;
}
const DEM_RELIEF = { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.1 };
let HEIGHT_FN = null, HEIGHT_DEM = null, ROAD_SEGMENTS = null, BRIDGE_SEGMENTS = null;
// 東の月蔵山側へ逃れる里道。民の所在と道筋は推定復元で、当日の避難記録ではない。
// 南の三峰川・北の藤沢川へ渡らず、大手の寄せ道と西の切岸も避ける。
// 地形の根拠：伊那市「高遠城跡の魅力をご紹介」。東の城下は『長野県の地名』「高遠城下」。
const PEOPLE_PATHS = [
  [[-20, 66], [110, 66], [128, 76], [174, 76]],
  [[117, 67], [128, 76], [174, 76]],
  [[142, 76], [174, 76]],
];
const peopleRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
const WALK_ROADS = [[[-146, 0], ...ROAD_KARAMETE], ...TAKATO_PLAN.paths.filter((p) => p.kind !== 'nishi' && p.kind !== 'yodou').map((p) => p.pts), ...PEOPLE_PATHS];
// 台地の外の崖と谷の斜面に、高遠の実測の尾根と沢の凹凸を足す（国土地理院）。曲輪・堀・道から離れた所だけ。
const WALK_BOX = WALK_ROADS.map((pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) }));
function demAway(x, z) {
  let out = Infinity;
  for (const k of CLEAR_BOUNDS) out = Math.min(out, Math.max(k.x0 - x, x - k.x1, k.z0 - z, z - k.z1, 0));
  let t = Math.max(0, Math.min(1, (out - 20) / 14));
  if (t <= 0) return 0;
  // 道の囲み（WALK_BOX）から二十メートル以上離れた道は、t を下げないので測らない（答えは前と同じ）。
  for (let i = 0; i < WALK_ROADS.length; i++) {
    const q = WALK_BOX[i];
    if (q.x0 - x >= 20 || x - q.x1 >= 20 || q.z0 - z >= 20 || z - q.z1 >= 20) continue;
    t = Math.min(t, Math.max(0, Math.min(1, (distToPolyline(x, z, WALK_ROADS[i]) - 10) / 10)));
  }
  return t;
}
function rawHeight(x, z) {
  let h = HEIGHT_FN(x, z) + (HEIGHT_DEM ? demRelief(HEIGHT_DEM, x, z, DEM_RELIEF) : 0);
  if (HEIGHT_DEM) { const a = demAway(x, z); if (a > 0) h += a * demDetail(HEIGHT_DEM, x, z, { xy: 2, win: 40, scale: 0.25 }); }
  return h;
}
function roadLevel(x, z) {
  // 勘助曲輪への枝道は谷底へ落とさず、台地西側の段としてつなぐ（高さは推定）。
  const west = TAKATO_PLAN.paths.find((p) => p.id === 'kansuke');
  for (let i = 0; i < west.pts.length; i++) if (west.levels[i] != null && Math.hypot(x - west.pts[i][0], z - west.pts[i][1]) < .001) return castleBase(0, 0) + west.levels[i];
  let level = -Infinity;
  for (const k of TAKATO_PLAN.kuruwa) if (inPoly(k.poly, x, z) || inPoly(k.poly, x - .001, z - .001) || inPoly(k.poly, x + .001, z + .001)) level = Math.max(level, k.level());
  return Number.isFinite(level) ? level : rawHeight(x, z);
}
function height(x, z) {
  if (!HEIGHT_FN) {
    HEIGHT_DEM = tkDem; HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3);
    // 段の境界で急変しない坂を準備時に作る。毎コマの配列・形・材質は増やさない。
    ROAD_SEGMENTS = [];
    for (const pts of WALK_ROADS) for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
      ROAD_SEGMENTS.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1, ya: roadLevel(ax, az), yb: roadLevel(bx, bz) });
    }
    BRIDGE_SEGMENTS = BRIDGES.map((b) => {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
      return { ax: b.a[0], az: b.a[1], dx, dz, l2: dx * dx + dz * dz,
        len: Math.hypot(dx, dz), w: b.w,
        ya: roadHeight(b.a[0], b.a[1], rawHeight(b.a[0], b.a[1])),
        yb: roadHeight(b.b[0], b.b[1], rawHeight(b.b[0], b.b[1])) };
    });
  }
  const h0 = rawHeight(x, z);
  // 建物の四隅と縁側は曲輪の床へ水平に据える。
  for (const b of TAKATO_BUILDINGS) {
    const dx = x - b.at[0], dz = z - b.at[1], c = Math.cos(b.rot), s = Math.sin(b.rot);
    if (Math.abs(dx * c - dz * s) <= b.w / 2 + .3 && Math.abs(dx * s + dz * c) <= b.d / 2 + .3) return rawHeight(b.at[0], b.at[1]);
  }
  const pathY = roadHeight(x, z, h0);
  // 土橋は地面を掘り残す。天端の道幅と両脇の土の斜面を、描画と歩く高さで共有する。
  for (const bridge of BRIDGE_SEGMENTS) {
    const projected = ((x - bridge.ax) * bridge.dx + (z - bridge.az) * bridge.dz) / bridge.l2;
    if (projected < -2 / bridge.len || projected > 1 + 2 / bridge.len) continue;
    const along = Math.max(0, Math.min(1, projected));
    const side = Math.abs((x - bridge.ax) * bridge.dz - (z - bridge.az) * bridge.dx) / bridge.len;
    const t = Math.max(0, Math.min(1, (bridge.w / 2 + 3 - side) / 3));
    if (t <= 0) continue;
    // 曲輪へ二メートル入るまで元の道幅へつなぐ。口の縁にも土橋の幅を残す。
    const end = Math.max(0, Math.min(1, (Math.min(projected, 1 - projected) * bridge.len + 2) / 2));
    return pathY + (bridge.ya + (bridge.yb - bridge.ya) * along - pathY)
      * t * t * (3 - 2 * t) * end * end * (3 - 2 * end);
  }
  return pathY;
}
function roadHeight(x, z, h0) {
  // 大手の外は道の肩を広げる。細い切り通しの両側が視界を塞がないようにする。
  const shoulder = x >= OTE.x && x <= 149 && Math.abs(z - OTE.z) < 14 ? 14 : 3.5;
  let best = shoulder, roadY = h0;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; roadY = q.ya + (q.yb - q.ya) * t; }
  }
  const t = Math.max(0, Math.min(1, (shoulder - best) / (shoulder - 2)));
  const blend = t * t * (3 - 2 * t);
  return h0 + (roadY - h0) * blend;
}

// 門の数・場所・耐久の識別は保ち、土の喰違いを冠木門と柵で囲う。
// 二つの冠木門の持ち場と道順は保つ。四角く囲む枡形の三辺は作らない。
function takatoGates(rt) {
  const gates = {}, batch = makeKitBatch();
  // 冠木門は柱と冠木で組む。門前から横へ突き出す大きな反り屋根を載せない。
  // 扉・柱・通り幅・壊れる区画は同じ部品のまま、屋根の描画だけ省く。
  const gateOpt = { team: 1, roof: false };
  // 開いた戸が通り道へ斜めに残り、通れる口と見た目が食い違わないようにする。
  const gateAt = (x, z, w, rot) => {
    const gate = kabukiGate(rt, x, z, w, rot, gateOpt);
    const open = gate.open;
    gate.open = () => {
      open();
      gate.door.userData.leaves.forEach((leaf, i) => { leaf.rotation.y = (i ? -1 : 1) * Math.PI / 2; });
    };
    return gate;
  };
  for (const g of TAKATO_PLAN.koguchi) {
    const [x, z] = g.at, rot = g.rot || 0;
    if (!Array.isArray(g.gate)) { gates[g.id] = gateAt(x, z, g.w, rot); continue; }
    const hs = g.size, turn = g.turn, ux = Math.sin(rot), uz = Math.cos(rot), px = turn * uz, pz = -turn * ux;
    const cx = x - ux * hs, cz = z - uz * hs;
    const P = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
    const walls = [];
    // 内門の脇だけに短い柵を置く。口の前を箱形の広場で囲まない。
    for (const edge of [[hs, hs, hs, 1.6]]) {
      // 丸太の乱杭でなく、曲輪の塀と同じ縦板と柱の組み。当たり・耐久・区画は同じ。
      walls.push(...wallLine(rt, [P(edge[0], edge[1]), P(edge[2], edge[3])], { team: 1, hp: 420, name: '虎口の柵', segLen: 8, mesh: castleBoardFence,
        meshOpt: { batch, h: 2.4, boardCap: true, boardSeams: true, groundBoards: true } }));
    }
    const [ix, iz] = P(hs, -hs * .35);
    gates[g.id] = { outer: gateAt(x, z, g.w1, rot),
      inner: gateAt(ix, iz, g.w2, rot + turn * Math.PI / 2), walls, plaza: { x: cx, z: cz } };
  }
  finalizeKitBatch(rt, batch);
  return gates;
}
// 共通の主殿・堂は白い塗壁なので、この戦だけ土色へ替える。
// 共用材質に色を塗らず、一つの材質を主殿と堂で使い回す。
function takatoEarthWalls(building, material) {
  for (const mesh of building.mesh.children)
    if (mesh.material === castleMat('plaster')) mesh.material = material;
}
// 写真の土壁のように、軒下の乾いた土と裾の雨染みを分ける。高遠だけの一枚を共有する。
function takatoWallMaterial() {
  const mat = castleMat('plaster').clone(); mat.color.setHex(0x967959);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'), shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, '#d5c7ae'); shade.addColorStop(.2, '#f1e7d3');
  shade.addColorStop(.65, '#e1d3ba'); shade.addColorStop(1, '#998d70');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = (i * 73 + i * i * 3) % 256, y = (i * 47 + i * i * 7) % 256;
    ctx.fillStyle = i % 3 ? 'rgba(68,55,35,.07)' : 'rgba(255,245,216,.16)';
    ctx.fillRect(x, y, 1 + i % 3, 1 + i % 2);
  }
  // 雨垂れの起点と長さをずらし、帯状の汚れにしない。
  for (let i = 0; i < 17; i++) {
    const x = (i * 53 + 11) % 256, y = 170 + i * 13 % 47;
    ctx.fillStyle = 'rgba(69,64,41,.10)'; ctx.fillRect(x, y, 2 + i % 4, 256 - y);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  mat.map = map; mat.bumpMap = map; mat.bumpScale = .035;
  return mat;
}
function takatoLife(rt) {
  for (const b of TAKATO_BUILDINGS) {
    const [x, z] = b.at;
    // 個別の室内図は不明。堂・番所・蔵・長屋の用途に合わせた推定の間取り。
    const kind = b.kind === 'temple' ? 'hondo' : b.kind === 'toiya' ? 'kura'
      : b.name.includes('番所') || b.name.includes('詰所') ? 'bansho' : 'nagaya';
    const building = goten(rt, x, z, { ...b, kind, profile: 'takato', tile: false,
      // 前巡の腰板と配置は保ち、厚い反り屋根を用途で分ける。堂は入母屋の板葺き。
      boardRoof: b.kind !== 'temple',
      // 横木は前巡のまま。長い一枚板を継ぎ目のずれた重ね葺きへ替え、軒の雨染みも出す。
      layeredBoardRoof: b.kind !== 'temple',
      templeBoardRoof: b.kind === 'temple',
      // 用屋を居館の白い障子面から、古板と裏の連子窓へ分ける。堂と主殿は残す。
      utilityBoardWalls: b.kind !== 'temple',
      naka: true, doorX: 0, team: 1, noTarget: true, where: b.name });
    takatoEarthWalls(building, rt.flags.earthMat);
  }
  takatoYard(rt);
  // 井筒・柱・板葺きの井戸。瓦の井戸の共通部品は戦国期の高遠へ写さない。
  const batch = makeKitBatch();
  const wood = [], stone = [], rope = [], dark = [];
  for (const [x, z] of [[-54, -9], [-38, 30]]) {
    const y = rt.world.heightAt(x, z);
    const ring = new THREE.CylinderGeometry(.85, .95, .8, 10, 1, true); ring.translate(x, y + .4, z); stone.push(ring); solidCircle(x, z, .95);
    for (const dx of [-1, 1]) { const post = new THREE.BoxGeometry(.14, 2.5, .14); post.translate(x + dx, y + 1.25, z); wood.push(post); solidCircle(x + dx, z, .12); }
    const beam = new THREE.BoxGeometry(2.5, .14, .14); beam.translate(x, y + 2.35, z); wood.push(beam);
    for (const sign of [-1, 1]) { const roof = new THREE.BoxGeometry(2.7, .1, 1); roof.rotateX(sign * .35); roof.translate(x, y + 2.65, z + sign * .43); wood.push(roof); }
    if (true) {
      // 空の筒だった井戸へ縁石・釣瓶・巻上げ軸。既存の井戸の内側に収め、通り道を狭めない。
      const lip = new THREE.RingGeometry(.66, .94, 10); lip.rotateX(-Math.PI / 2); lip.translate(x, y + .81, z); stone.push(lip);
      const hole = new THREE.CircleGeometry(.67, 10); hole.rotateX(-Math.PI / 2); hole.translate(x, y + .12, z); dark.push(hole);
      const axle = new THREE.CylinderGeometry(.075, .075, 2.3, 6); axle.rotateZ(Math.PI / 2); axle.translate(x, y + 1.7, z); wood.push(axle);
      for (let i = 0; i < 6; i++) {
        const coil = new THREE.TorusGeometry(.1, .018, 3, 8); coil.rotateY(Math.PI / 2); coil.translate(x + (i - 2.5) * .04, y + 1.7, z); rope.push(coil);
      }
      const line = new THREE.CylinderGeometry(.016, .016, 1.1, 4); line.translate(x, y + 1.05, z + .1); rope.push(line);
      const pail = new THREE.CylinderGeometry(.21, .17, .3, 8, 1, true); pail.translate(x, y + .4, z + .1); wood.push(pail);
      const crank = new THREE.BoxGeometry(.1, .35, .1); crank.translate(x + 1.13, y + 1.55, z); wood.push(crank);
      const grip = new THREE.BoxGeometry(.28, .075, .075); grip.translate(x + 1.24, y + 1.39, z); wood.push(grip);
    }
  }
  for (const [parts, color] of [[wood, 0x615040], [stone, 0x81796b], [rope, 0xa08c64], [dark, 0x25251e]]) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color }));
    mesh.userData.camBlock = true;
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const geo of parts) geo.dispose();
  }
  finalizeKitBatch(rt, batch);
  // 曲輪間は土の道を使う。寺の踏み石を並べて、土橋を石造の高架にしない。
  // 扉も守備もない飾りの冠木は、遠くで電柱に見える。道の脇の武田の幟に替える。
  for (const [x, z] of [[-43, 54.5], [-75, 31], [-92, -24], [-16, 66]]) rt.scene.add(nobori(rt.world, x + 3, z, 'yose_takeda_black', 4));
  // 月蔵山側の里。家を南の崖から離し、南端の里道を避難用に空ける。
  rt.scene.add(village(rt.world, 161, 62, { n: 5, fields: 8, r: 16, smoke: 0, seed: 15823, bareTrees: true, groundedHomes: true, cameraWalls: true }));
  // 東の城下の小さな家並み。近世の整った城下や後世の寺を持ち込まない。
  rt.scene.add(village(rt.world, 119, 54, { n: 2, fields: 0, r: 8, smoke: 0, seed: 15824, bareTrees: true, groundedHomes: true, cameraWalls: true }));
}

// 屋敷の腰板と備蓄は当日の配置を断定しない復元。戸口・土橋・兵の持ち場を避ける。
function takatoYard(rt) {
  const boards = [], unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3(), size = new THREE.Vector3();
  for (const b of TAKATO_BUILDINGS) {
    if (b.kind === 'temple') continue;
    const [x, z] = b.at, y = rt.world.heightAt(x, z), c = Math.cos(b.rot), s = Math.sin(b.rot);
    const box = (lx, lz, w, h, d) => {
      at.set(x + lx * c + lz * s, y + 1.02, z - lx * s + lz * c);
      size.set(w, h, d); turn.setFromAxisAngle(axis, b.rot); matrix.compose(at, turn, size);
      boards.push(unitBox.clone().applyMatrix4(matrix));
    };
    // 戸口のある正面は触らず、両妻と裏の腰に板張り。上の土壁と格子窓を残す。
    for (const side of [-1, 1]) {
      box(side * (b.w / 2 + .1), 0, .07, .94, b.d);
      for (let lz = -b.d / 2 + .2; lz < b.d / 2; lz += .48)
        box(side * (b.w / 2 + .15), lz, .05, .94, .035);
    }
    box(0, -b.d / 2 - .1, b.w, .94, .07);
    for (let lx = -b.w / 2 + .2; lx < b.w / 2; lx += .48)
      box(lx, -b.d / 2 - .15, .035, .94, .05);
  }
  const wall = new THREE.Mesh(mergeGeometries(boards), new THREE.MeshLambertMaterial({ color: 0x655342 }));
  wall.castShadow = wall.receiveShadow = true; wall.userData.camBlock = true; rt.scene.add(wall);
  boards.forEach(g => g.dispose()); unitBox.dispose();

  takatoLeanTo(rt);

  // 写真の屋敷は一つの大きな広場に裸で並ばず、背後に短い境の柵を持つ。
  // 三棟の裏だけを低く仕切る。正面の縁側・戸口と既存の道・櫓の梯子口は空ける。
  const fenceBatch = makeKitBatch();
  for (const index of [1, 4, 7]) {
    const b = TAKATO_BUILDINGS[index], [x, z] = b.at, c = Math.cos(b.rot), s = Math.sin(b.rot);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const back = -b.d / 2 - 1.1, edge = b.w / 2 + .65;
    const points = [P(-edge, back + .65), P(-edge, back), P(edge, back)];
    for (let i = 1; i < points.length; i++)
      palisade(rt.world, [...points[i - 1], ...points[i]], {
        h: 1.35, lightFence: true, mound: false, solid: true, batch: fenceBatch,
      });
  }
  finalizeKitBatch(rt, fenceBatch);

  // 大手の前の丸馬出（武田の城の型・docs/castle_kiso_1114.md）：外へ膨らむ半円の柵。道の幅（z±3.5）は空けて、当たりは付けない
  {
    const umaBatch = makeKitBatch(), cx = OTE.x + 9, r = 8.5;
    for (let i = 0; i < 10; i++) {
      const a0 = -1.45 + 2.9 * i / 10, a1 = -1.45 + 2.9 * (i + 1) / 10;
      const p = [cx + Math.cos(a0) * r, OTE.z + Math.sin(a0) * r, cx + Math.cos(a1) * r, OTE.z + Math.sin(a1) * r];
      if (Math.abs((p[1] + p[3]) / 2 - OTE.z) < 3.5) continue;
      palisade(rt.world, p, { h: 1.5, lightFence: true, mound: true, solid: false, batch: umaBatch });
    }
    finalizeKitBatch(rt, umaBatch);
  }

  // 同じ荷は一つの形・材質でまとめる。兵数を変えず、準備時にだけ作る。
  const stores = (make, places, w, d) => {
    const [x, z, rot] = places[0], source = make(x, z, rot);
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, places.length);
    for (let i = 0; i < places.length; i++) {
      const [px, pz, r] = places[i];
      matrix.makeRotationY(r); matrix.setPosition(px, rt.world.heightAt(px, pz), pz);
      mesh.setMatrixAt(i, matrix);
      if (i) solidRect(px, pz, w, d, r);
    }
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true;
    mesh.computeBoundingSphere(); rt.scene.add(mesh);
  };
  stores((x, z, r) => tawara(rt.world, x, z, r, 6), [[-50, 13, 0], [-34, 46, 0], [48, -29, 0], [143, 21, 0]], 1.1, 1.8);
  stores((x, z, r) => lumber(rt.world, x, z, r), [[62, -32, 0], [-53, 45, Math.PI / 2], [142, 25, 0]], 4.1, 1.4);
  stores((x, z, r) => hatazao(rt.world, x, z, r, 4, 'yose_takeda_black'), [[-45, 10, 0], [48, -33, 0]], 2.6, 1.2);
  // 高遠の守りは武田、東の寄せの控えは織田。借用した本の他家の紋は写さない。
  rt.scene.add(hatazao(rt.world, 144, 18, 0, 4, 'oda'));
  for (const [x, z] of [[62, -28], [9, -27], [-45, 17], [-32, 44], [-48, 72], [-64, 36], [-99, -42]])
    rt.scene.add(nobori(rt.world, x, z, 'yose_takeda_black', 4.5));
  rt.scene.add(nobori(rt.world, 145, 22, 'oda', 4.5));
}

// 本の長屋のような、細柱で支えた片流れの下屋。配置・寸法は高遠用の推定。
// 三の丸の番所の裏へ収め、大手道・戸口・既存の柵・井楼の梯子を空ける。
function takatoLeanTo(rt) {
  const b = TAKATO_BUILDINGS[0], [x, z] = b.at, y = rt.world.heightAt(x, z);
  const c = Math.cos(b.rot), s = Math.sin(b.rot), parts = [];
  const unit = new THREE.BoxGeometry(1, 1, 1), color = new THREE.Color();
  const box = (w, h, d, lx, ly, lz, hex, pitch = 0) => {
    const g = unit.clone(); g.scale(w, h, d); g.rotateX(pitch); g.translate(lx, ly, lz);
    // 板ごとの褪せと下端の雨染みは頂点色へ焼き込み、素材を増やさない。
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
    color.setHex(hex);
    for (let i = 0; i < pos.count; i++) {
      const shade = pos.getY(i) < .35 ? .65 : pos.getZ(i) < -b.d / 2 - 1.8 ? .78 : 1;
      colors[i * 3] = color.r * shade; colors[i * 3 + 1] = color.g * shade; colors[i * 3 + 2] = color.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateY(b.rot); g.translate(x, y, z); parts.push(g);
  };
  const front = -b.d / 2 - 1.85, back = -b.d / 2 + .05;
  for (const lx of [-3.6, 0, 3.6]) {
    box(.13, 2.24, .13, lx, 1.12, front, 0x665440);
    solidCircle(x + lx * c + front * s, z - lx * s + front * c, .1);
    box(.1, .14, 2.12, lx, 2.5, (front + back) / 2, 0x594b38, -.28);
  }
  box(7.7, .15, .14, 0, 2.24, front, 0x584735);
  box(7.7, .14, .14, 0, 2.78, back, 0x62513d);
  // 二段の板を六センチ重ね、継ぎ目を交互にずらす。遠くでも薄い軒の輪郭を保つ。
  const pitch = -.28, depth = 2.15, count = 20, step = 7.9 / count;
  for (let i = 0; i < count; i++) {
    const split = .48 + (i % 2) * .08;
    for (const [a, end] of [[0, split + .03], [split, 1]]) {
      const t = (a + end) / 2, lz = back - .05 - depth * (1 - t);
      box(step - .009, .065, depth * (end - a) / Math.cos(pitch),
        -3.95 + (i + .5) * step, 2.81 - Math.tan(-pitch) * depth * (1 - t) + a * .025,
        lz, [0x83745d, 0x736752, 0x918066, 0x7b6a54][(i * 7 + (a ? 1 : 0)) % 4], pitch);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
  parts.forEach(g => g.dispose()); unit.dispose();
}

// 東の寄せの後方だけに、仮の幕と仕寄り道具を寄せる。当日の配置を断定しない推定復元。
// 本の野戦兵器の丸太・縄・板楯を参考にする。大手道・乱戦・里の避難路には掛けない。
function takatoSiegeStores(rt) {
  rt.scene.add(jinmaku(rt.world, 138, -44, 12, 8, 6, { mon: 'oda' }));
  // 11/18 K358（cloud-27 の見た目判定 ③ ✕「二の丸の前に兵四五人」）：大手道の両脇に織田の幟を二列ずつ立て、五万の寄せの厚みを見せる
  //   （幟は束で描くので軽い・体の当たりは無い。道・人の通り道の上には立てない）
  const way = (px, pz) => distToPolyline(px, pz, ROAD_OTE) < 11 || TAKATO_PLAN.paths.some((p) => distToPolyline(px, pz, p.pts) < 4) || PEOPLE_PATHS.some((pts) => distToPolyline(px, pz, pts) < 3);
  for (let x = 82, i = 0; x <= 140; x += 6.5, i++) for (const z of [-13.5, -18.5, 13.5, 18.5]) {
    const pz = z + (i % 2 ? 1.2 : 0) * Math.sign(z);
    if (!way(x, pz)) rt.scene.add(nobori(rt.world, x, pz, 'oda', 4.6 + (i % 3) * .3));
  }
  for (const [x, z] of [[133, -38], [143, -38]])
    rt.scene.add(nobori(rt.world, x, z, 'oda', 4.8));

  // 板、丸太、竹、縄を同じ頂点色の材質へまとめる。細部は近い時だけ描く。
  const coarse = [], fine = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const ring = new THREE.TorusGeometry(1, .045, 3, 10);
  const tone = new THREE.Color(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3(1, 0, 0);
  const turn = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const at = new THREE.Vector3(), size = new THREE.Vector3();
  const put = (source, parts, color) => {
    const g = source.clone().applyMatrix4(matrix), p = g.attributes.position;
    const colors = new Float32Array(p.count * 3); tone.setHex(color);
    for (let i = 0; i < p.count; i++) tone.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  const box = (x, y, z, w, h, d, color, pitch = 0, parts = coarse) => {
    at.set(x, y, z); size.set(w, h, d); turn.setFromAxisAngle(across, pitch);
    matrix.compose(at, turn, size);
    // 屋根は左右に傾ける。下へ沈む妻板や厚い瓦屋根は付けない。
    put(unit, parts, color);
  };
  const log = (ax, ay, az, bx, by, bz, r, color, parts = coarse) => {
    direction.set(bx - ax, by - ay, bz - az);
    size.set(r, direction.length(), r); turn.setFromUnitVectors(up, direction.normalize());
    at.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    matrix.compose(at, turn, size); put(cylinder, parts, color);
  };
  // 柱はそれぞれ接地し、屋根だけ水平な棟へ揃える。開いた南側から資材が見える。
  const sx = 153, sz = -44, sy = rt.world.heightAt(sx, sz);
  for (const dx of [-3.4, 3.4]) for (const dz of [-2, 2]) {
    const x = sx + dx, z = sz + dz, y = rt.world.heightAt(x, z);
    log(x, y - .1, z, x, sy + 2.5, z, .095, 0x62503c);
    solidCircle(x, z, .12);
  }
  for (const dz of [-2, 2]) log(sx - 3.7, sy + 2.45, sz + dz, sx + 3.7, sy + 2.45, sz + dz, .09, 0x594833);
  log(sx - 3.8, sy + 3.12, sz, sx + 3.8, sy + 3.12, sz, .1, 0x6e5940);
  for (const sign of [-1, 1]) {
    log(sx - 3.4, sy + 2.45, sz + sign * 2, sx - 3.4, sy + 3.12, sz, .065, 0x6e5940);
    log(sx + 3.4, sy + 2.45, sz + sign * 2, sx + 3.4, sy + 3.12, sz, .065, 0x6e5940);
    for (let i = 0; i < 18; i++) {
      // 板目と色むらを輪郭に残す。雨で黒くなった軒先は短い二枚の重ね葺き。
      const x = sx - 3.8 + (i + .5) * 7.6 / 18;
      for (let row = 0; row < 2; row++) {
        const z = sz + sign * (.58 + row * 1.05);
        box(x, sy + 3.12 - row * .34 - .18, z, .415, .06, 1.23,
          [0x857257, 0x756248, 0x938067][(i + row) % 3], sign * .31);
      }
    }
  }
  // 写真の横木組みを小屋の裏へ。斜めの控えを残し、壁で囲わない。
  for (const y of [sy + .65, sy + 1.65])
    log(sx - 3.5, y, sz - 2, sx + 3.5, y, sz - 2, .07, 0x65513b);
  log(sx - 3.4, sy + .3, sz - 2, sx + 3.4, sy + 2.4, sz - 2, .06, 0x736047);

  // 出番待ちの竹束三基。筒の端・節・三段の縄を近景にだけ残す。
  for (let b = 0; b < 3; b++) {
    const x = 150 + b * 1.45, z = -43, y = rt.world.heightAt(x, z);
    for (let k = 0; k < 11; k++) {
      const a = k * Math.PI * 2 / 11, px = x + Math.cos(a) * .38, pz = z + Math.sin(a) * .38;
      const top = y + 2.1 + (k % 3) * .055;
      log(px, y + .12, pz, px, top, pz, .064, k % 3 ? 0x858052 : 0xa39b66);
      for (const h of [.45, 1.2, 1.87]) log(px, y + h, pz, px, y + h + .035, pz, .071, 0xaaa16b, fine);
    }
    for (const h of [.35, 1.05, 1.8]) {
      at.set(x, y + h, z); size.setScalar(.46); turn.setFromAxisAngle(across, Math.PI / 2);
      matrix.compose(at, turn, size); put(ring, fine, 0xb39b70);
    }
    solidRect(x, z, .95, .95, 0);
  }
  // 立て掛けた板楯と地面に伏せた梯子。攻城用の行天橋や移動櫓を架空に増設しない。
  for (let i = 0; i < 3; i++) {
    const x = 150 + i * 1.4, z = -46, y = rt.world.heightAt(x, z);
    for (let p = 0; p < 3; p++) box(x + (p - 1) * .32, y + 1, z, .305, 1.85, .065, 0xa38a62, -.12);
    for (const h of [.45, 1.4]) box(x, y + h, z + .14, 1, .08, .1, 0x5b4832);
  }
  const ladderY = (x, z) => rt.world.heightAt(x, z) + .1;
  for (const dz of [-.38, .38])
    log(143, ladderY(143, -34 + dz), -34 + dz, 149, ladderY(149, -34 + dz), -34 + dz, .055, 0x88704d);
  for (let i = 0; i < 13; i++) {
    const x = 143.2 + i * .45;
    log(x, ladderY(x, -34.4), -34.4, x, ladderY(x, -33.6), -33.6, .04, 0x9d8058);
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [parts, near] of [[coarse, false], [fine, true]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.receiveShadow = true; mesh.userData.camBlock = !near;
    if (near) {
      const lod = new THREE.LOD(); lod.position.set(sx, sy, sz);
      mesh.geometry.translate(-sx, -sy, -sz);
      lod.addLevel(mesh, 0); lod.addLevel(new THREE.Object3D(), 45); rt.scene.add(lod);
    } else rt.scene.add(mesh);
    for (const g of parts) g.dispose();
  }
  unit.dispose(); cylinder.dispose(); ring.dispose();
  // 明け方の控えの篝を一基。煙は小屋の脇から一筋だけ、既存の遠近切替で描く。
  rt.scene.add(kagaribiBatch(rt.world, [[145, -39]]));
  rt.world.addFire(145, -39, { h: 1.3, size: .35, smoke: false, lightRadius: 2 });
  rt.world.addSmokeColumn(145, rt.world.heightAt(145, -39) + 1.6, -39, { size: .35 });
}

// 早春の北側の窪みに残る雪。天気は復元で、当日の降雪とはしない。
// 残雪は共通の地面の色分けへ任せ、近い草を枯れ色にそろえる。
function takatoSpring(rt) {
  // 足元の近い草も、この戦では枯れ色にする。共通の草の作りは変えない。
  const grass = rt.world.nearGrass;
  if (grass?.instanceColor) {
    const color = new THREE.Color();
    for (let i = 0; i < grass.count; i++) {
      grass.getColorAt(i, color);
      const shade = Math.max(.7, Math.min(1.1, (color.r + color.g + color.b) / .8));
      color.setRGB(i % 7 ? .58 * shade : .52 * shade, i % 7 ? .48 * shade : .59 * shade, .34 * shade);
      grass.setColorAt(i, color);
    }
    grass.instanceColor.needsUpdate = true;
  }
  // 残雪は地面の共通の色分けで示す。別の白い面は携帯の粗い地形を跨いで浮く。
}

// 岩・枯れ草は準備時にまとめる。兵の当たりや通り道は増やさない。
function takatoGround(rt) {
  const pose = new THREE.Object3D(), color = new THREE.Color();
  // 共通の tint は草土の配分にだけ使われるため、高遠では色も既存の地面へ渡す。
  // 別の雪板を重ねず、土の細かな凹凸と血・濡れの処理は残す。
  const terrain = rt.world.terrain, groundPos = terrain.geometry.attributes.position;
  const groundColors = new Float32Array(groundPos.count * 3);
  for (let i = 0; i < groundPos.count; i++) {
    rt.world.def.tint(groundPos.getX(i), groundPos.getZ(i), groundPos.getY(i), color);
    color.toArray(groundColors, i * 3);
  }
  terrain.geometry.setAttribute('takatoGroundColor', new THREE.BufferAttribute(groundColors, 3));
  const groundMat = terrain.material, compileGround = groundMat.onBeforeCompile;
  const groundKey = groundMat.customProgramCacheKey();
  groundMat.onBeforeCompile = function (shader, renderer) {
    compileGround.call(this, shader, renderer);
    shader.vertexShader = 'attribute vec3 takatoGroundColor; varying vec3 vTakatoGroundColor;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTakatoGroundColor = takatoGroundColor;');
    shader.fragmentShader = 'varying vec3 vTakatoGroundColor;\n' + shader.fragmentShader
      .replace('col *= mix(0.94, 1.3, macro);',
        'col = vTakatoGroundColor * clamp(dot(col, vec3(0.333)) * 4.0, 0.65, 1.2) * mix(0.94, 1.3, macro);');
  };
  groundMat.customProgramCacheKey = () => groundKey + '高遠の赤土と残雪';
  groundMat.needsUpdate = true;
  // 共通の丸めた法線を保ち、明るい石肌と上側の苔を混ぜる。形と材質は全体で共用する。
  const rockGeo = rockShape(1, true), sand = new THREE.Color(0x79604b), moss = new THREE.Color(0x655e44);
  const vertices = rockGeo.attributes.position, colors = rockGeo.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const patch = (.5 + .5 * Math.sin(x * 7 + z * 5)) * Math.max(0, y);
    color.fromBufferAttribute(colors, i).lerp(sand, .7).lerp(moss, patch * .65);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  // 暗い石の絵を頂点色へ掛け重ねない。携帯でも一つの軽い材質で石肌を残す。
  const rockMat = new THREE.MeshLambertMaterial({ bumpMap: stoneTex(),
    bumpScale: .06, vertexColors: true, side: THREE.DoubleSide,
    emissive: 0x594733, emissiveIntensity: .12 });
  // 冬も葉の残る杉・松・竹だけを補正する。幹や落葉した枝はそのまま。
  for (const mesh of rt.world.treeMeshes || []) {
    if (!mesh.material.alphaTest || !mesh.material.vertexColors) continue;
    for (let i = 0; i < mesh.count; i++) {
      color.setRGB(.82, 1, .76); mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 暗い葉の絵と陰が重なっても、黒い塊にならない最低限の緑を残す。
    mesh.material.emissive.setHex(0x26391f);
    mesh.material.emissiveIntensity = .35;
  }
  const rock = new THREE.InstancedMesh(rockGeo, rockMat, 120);
  // 細い葉を四段で曲げる。房の根元は狭く、先は横へしなる。
  const grassGeo = rockTuftShape(true);
  // ほぼ垂直の葉も空の光を受け、日陰で黒い針にならないよう上向きに寄せる。
  const normals = grassGeo.attributes.normal, normal = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    normal.set(normals.getX(i) * .35, .9, normals.getZ(i) * .35).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const grass = new THREE.InstancedMesh(grassGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide,
      emissive: 0x6d6143, emissiveIntensity: .18 }), 320);
  for (let i = 0; i < 120; i++) {
    // 河岸段丘の南・北・西の切岸だけに露岩を置く。大手前の平場は空ける。
    const side = Math.floor(i / 40), along = i % 40;
    const x = side < 2 ? -68 + along * 4 : NISHI_X - 2 - (along % 4) * 1.2;
    const z = side === 0 ? CLIFF_Z + 1 + (along % 4) * 1.5
      : side === 1 ? -67 - (along % 4) * 1.5 : (along < 20 ? -54 : 14) + (along % 20) * 2;
    const size = .4 + (i % 5) * .2;
    pose.position.set(x, rt.world.heightAt(x, z) - size * .12, z);
    pose.rotation.set(.1 * Math.sin(i * .7), i * 1.3, .1 * Math.cos(i * .4));
    pose.scale.set(size * (i % 3 === 0 ? 1.65 : 1.25), size * (i % 3 === 1 ? 1.2 : 1), size);
    pose.updateMatrix(); rock.setMatrixAt(i, pose.matrix);
    color.setScalar(.94 + (i % 4) * .02);
    rock.setColorAt(i, color);
  }
  for (let i = 0; i < 320; i++) {
    const x = i < 256 ? 79 + (i % 64) * 1.05 : 40 + (i % 16) * 2;
    const z = i < 256 ? 0 + (i % 2 ? 1 : -1) * (3.5 + (i % 9) * .6 + Math.floor(i / 64) * .8) : -58 + Math.floor((i - 256) / 16) * 5;
    pose.position.set(x, rt.world.heightAt(x, z) + .02, z);
    pose.rotation.set(.2, i * 2.4, .15 * Math.sin(i)); pose.scale.set(1, .7 + (i % 4) * .2, 1);
    pose.updateMatrix(); grass.setMatrixAt(i, pose.matrix);
    color.setHex(i % 7 ? 0xb5a18a : 0x96836c); grass.setColorAt(i, color);
  }
  // 四角い踏み跡は置かず、共通の土の道をそのまま見せる。
  rock.castShadow = rock.receiveShadow = true; grass.receiveShadow = true;
  // 岩の下縁を切岸へ埋める。段差をまたぐ三角の接地板は作らない。
  groundRocks(rt.world, rock);
  rt.scene.add(rock);   // 10/24：草は作らない
  // 岩の根元の共通の草も、この戦だけ枯れ色と空の光を足す。
  rt.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.color?.getHex() !== 0x77764f) return;
    mesh.material.color.setHex(0xaa986f);
    mesh.material.emissive.setHex(0x6d6143); mesh.material.emissiveIntensity = .18;
    const normals = mesh.geometry.attributes.normal;
    if (!normals) return;
    for (let i = 0; i < normals.count; i++) {
      normal.set(normals.getX(i) * .35, .9, normals.getZ(i) * .35).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    normals.needsUpdate = true;
  });
  // 既存の本丸・櫓の後ろに低い尾根を重ね、切岸の先を一枚の空にしない。
  const peaks = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshLambertMaterial({ color: 0x797f79 }), 4);
  for (let i = 0; i < 4; i++) {
    pose.position.set(-150 - i * 24, 12, -105 + i * 62);
    pose.rotation.set(0, i * .7, 0); pose.scale.set(35 + i * 5, 52 + (i % 2) * 18, 44);
    pose.updateMatrix(); peaks.setMatrixAt(i, pose.matrix);
  }
  rt.scene.add(peaks);
}

// 背後の初撃を、足音と足元へ伸びる影で知らせる。八枠を支度時に作る。
function takatoRearShadows(rt) {
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10),
    new THREE.MeshBasicMaterial({ color: 0x29251f, transparent: true, opacity: .32,
      depthWrite: false, side: THREE.DoubleSide }), 8);
  const pose = new THREE.Object3D(), slots = Array.from({ length: 8 }, () => ({ u: null, t: 0, stepped: false }));
  let next = 0;
  mesh.frustumCulled = false;
  for (let i = 0; i < 8; i++) { pose.scale.setScalar(0); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); }
  rt.scene.add(mesh);
  return {
    warn(u) {
      const slot = slots[next]; next = (next + 1) % slots.length;
      slot.u = u; slot.t = .6; slot.stepped = false;
      rt.army.play('step', u.pos, 1.8);
    },
    tick(dt) {
      const p = rt.player.u.pos;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]; slot.t = Math.max(0, slot.t - dt);
        if (slot.t > 0 && slot.u.alive && !rt.over) {
          const u = slot.u, dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
          const x = p.x + dx / d * .65, z = p.z + dz / d * .65;
          pose.position.set(x, rt.world.heightAt(x, z) + .035, z);
          pose.rotation.set(-Math.PI / 2, 0, -Math.atan2(dx, dz));
          pose.scale.set(.35, 1.15, 1);
          if (!slot.stepped && slot.t < .35) { slot.stepped = true; rt.army.play('step', u.pos, 1.8); }
        } else pose.scale.setScalar(0);
        pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// 冷えた朝の息。近い八人までを一つの描画にまとめ、形と置き場所を使い回す。
function takatoBreath(rt) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const mist = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  mist.addColorStop(0, 'rgba(235,239,237,0.32)');
  mist.addColorStop(.4, 'rgba(235,239,237,0.16)');
  mist.addColorStop(1, 'rgba(235,239,237,0)');
  ctx.fillStyle = mist; ctx.fillRect(0, 0, 32, 32);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }), 8);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; rt.scene.add(mesh);
  const people = new Array(8), pose = new THREE.Object3D();
  let scan = 0, tick = 0, count = 0;
  return (dt) => {
    // 昼へ移った後と終戦後は消す。部屋の中や倒れた兵には付けない。
    if (rt.flags.niFell || rt.flags.ending || rt.over) { mesh.visible = false; return; }
    scan -= dt; tick -= dt;
    if (scan <= 0) {
      scan = 1; count = 0;
      const p = rt.player.u;
      if (siegeFighter(p) && !p.naka) people[count++] = p;
      for (const u of rt.army.units) {
        if (count === people.length) break;
        if (u !== p && siegeFighter(u) && !u.naka && u.mesh?.visible &&
            Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 18) people[count++] = u;
      }
    }
    if (tick > 0) return;
    tick = .1;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const u = people[i], age = (rt.t + i * .47) % 3.6;
      if (age > .9 || !siegeFighter(u) || u.naka || !u.mesh?.visible) continue;
      const fade = Math.sin(age / .9 * Math.PI), heading = u.heading || 0;
      const drift = .18 + age * .25;
      pose.position.set(u.pos.x + Math.sin(heading) * drift + age * .08,
        u.pos.y + (u.bodyHeight || 1.72) * .9 + age * .12, u.pos.z + Math.cos(heading) * drift);
      pose.quaternion.copy(rt.camera.quaternion);
      pose.scale.set((.2 + age * .4) * fade, (.12 + age * .22) * fade, 1);
      pose.updateMatrix(); mesh.setMatrixAt(n++, pose.matrix);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  };
}

function runnerWay(army, u, want) {
  if (!u.group?.isRunner) return oteGapWay(army, u, want);
  // 使番も土橋と虎口を通る。門へ直進すると空堀の縁で下知が止まる。
  // 遠くを点で走る使番には高さと番号が無いので、道探し用の入れ物だけ補う。
  const foot = u._tkRunnerFoot || (u._tkRunnerFoot = {
    id: u.id ?? 0, group: u.group, pos: { x: 0, y: 0, z: 0 },
  });
  foot.pos.x = u.pos.x; foot.pos.z = u.pos.z;
  foot.pos.y = u.pos.y ?? army.world.heightAt(u.pos.x, u.pos.z);
  return mountainWay(army, foot, want, true);
}

// 11/16 クラウドし：act bot で大手の後続の兵が大手門の北の柵の外 (77,14) に押し出され、
// 柵の内の持ち場 (73,5) へ真っ直ぐ向いて二十秒×4回立ち尽くした。柵の外から内を目指す兵は、
// まず門の口の前 (80,z±2) へ回してから入れる。
function oteGapWay(army, u, want) {
  if (!want || u.team !== 0) return want;
  const p = u.pos;
  if (p.x < 75.5 || p.x > 84 || Math.abs(p.z) < 3 || Math.abs(p.z) > 30 || want.x > 76.5) return want;
  if ((u._tkOteT || 0) > army.time) return u._tkOteWay || want;
  u._tkOteT = army.time + 0.5;
  if (!army.wallBetween(p, -1, { x: want.x, y: p.y, z: want.z })) { u._tkOteWay = null; return want; }
  const q = u._tkOteWay || (u._tkOteWay = { x: 0, z: 0 });
  q.x = 80.5; q.z = Math.max(-2, Math.min(2, p.z));
  return q;
}
// 部隊の多点の道：着いたら次の点へ、最後は attack（b_hiei_mtn.js の setRoute・advance・tickRoutes と同じ形）。
// b.assault（下で門ごとに持たせる）があれば、最後は assault にする：塀・門ごしで敵に届かない間、
// 立ち尽くさず（確かめで見つけた「道があるのに20秒動かない兵」）門を打ちに掛かる
function setRoute(b, pts) {
  b._route = pts; b._routeGate = null; b._i = 0;
  // 大手の後列は、通った折れに沿わせる。直線の縦隊では土橋の脇へ
  // 持ち場がはみ出し、全員が同じ避け足へ集まって動けなくなった。
  // 下知し直しても後列がまだ通っている折れを消さない。要の位置から
  // 作り直すと、門外の後列が塀へ直進し、同じ避け足に重なる。
  if (b.tkRoadColumn && b.real && !b._marchPath?.length) {
    b._marchPath = [[b.real.anchor.x, b.real.anchor.z]];
  }
  // 武将の後ろへ集まる判断より、土橋と虎口を通る下知を優先する。
  // 河尻の供が三の丸で将の周りに留まり、次の門へ続かなかった。
  if (b.real) b.real.keepMoveOrder = true;
  advance(b);
}
function advance(b) {
  if (!b._route || b._i >= b._route.length) {
    if (b.real) b.real.keepMoveOrder = false;
    b.order({ id: b.tkRetreat || b.tkHold || b.tkGateWait ? 'hold' : b.assault ? 'assault' : 'attack', form: b.tkGateWait ? 'column' : b.kind === 'ashigaru' ? 'yari' : 'line' });
    if ((b.tkRetreat || b.tkHold) && b.real) b.real.facing = Math.PI / 2;
    b._route = null; return;
  }
  const [x, z] = b._route[b._i++];
  if (b._marchPath) {
    const last = b._marchPath[b._marchPath.length - 1];
    // 同じ角への再下知で長さゼロの区間を作らない。
    if (Math.hypot(last[0] - x, last[1] - z) > 0.1) b._marchPath.push([x, z]);
  }
  marchRoute(b, x, z);
}
function marchRoute(b, x, z) {
  // 先頭の一人が着いても、隊の要はまだ手前の折れを歩いている。
  // 最後の点へ飛ばすと要が塀を横切り、後列の持ち場も門脇の一点へ詰まる。
  const g = b.real;
  const pending = g?.order === 'path' && g.path === b._marchPath ? g.pathIdx : null;
  b.order({ id: 'move', to: { x, z }, form: 'column' });
  if (b.tkRoadColumn && b.real && b._marchPath) {
    // 今の目標までだけ渡し、閉じた門の先を自動で歩き始めない。
    g.order = 'path'; g.roadColumn = true; g.followColumnRoad = true;
    g.path = b._marchPath;
    g.pathIdx = pending == null ? b._marchPath.length - 1 : Math.min(pending, b._marchPath.length - 1);
    g._slotFit = null;
  }
}
// 破れていない門をまとめて渡すと、生きている最初の一つを的にする（外の門が破れれば内の門、という順）
function gateAssault(...gates) {
  const target = () => { for (const g of gates) if (g && g.struct && g.struct.alive && !g.opened) return g.struct; return null; };
  target.gateOnly = true;
  return target;
}
// 陽動の手：決まった的（門）が無いので、近い城方の塀・柵を的にする（確かめで見つけた「陽動の手が20秒止まる」の直し）
function nearWallAssault(rt) {
  return (u) => {
    let best = null, bd = 45;
    for (const s of rt.army.structs) {
      if (!s.alive || !s.seg || s.team !== 1) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
}
function tickRoutes(list) {
  for (const b of list) {
    // 大手の衆は森長可・河尻秀隆がその場で下知する。西の信忠の使番は城を越えて来られず、下知が届かなかった。
    if (b.real && b.directOrders) b.real.directOrders = true;
    if (!b._route || deadB(b)) continue;
    // 竹束を据えている間は道順を進めない。留める処理の保存した下知と食い違わせない。
    if (b.real?._pinH) continue;
    // 二の丸と本丸の橋（x −33〜−23）で敵と体が触れ合う path の兵は、道のまま止まらず斬り合う。
    // 敵が6m以内にいなくなったら、道の続きへ戻す（11/18 ガ三：橋で第二陣9人が8〜20秒重なった）。
    if (b.real && b.army?.nearestEnemy) {
      const live = b.real.units.filter((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut);
      const foeNear = (u, r) => b.army.nearestEnemy(u, r, (o) => !o.isStruct && !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3);
      if (b._bridgeFight) {
        if (!live.some((u) => foeNear(u, 6))) { b._bridgeFight = false; const pt = b._route[b._i - 1]; marchRoute(b, pt[0], pt[1]); }
        continue;
      }
      if (b.real.order === 'path' && !b._routeGate && live.some((u) => u.pos.x > -33 && u.pos.x < -23 && foeNear(u, 3))) {
        b._bridgeFight = true; b.order({ id: 'assault', form: 'column' }); continue;
      }
    }
    // 別の寄せ直しで直線の移動に戻っても、後続は土橋に沿う縦隊へ戻す。
    // 道順が残る間だけ直し、門攻め・退却・竹束の停止は上書きしない。
    if (b.tkRoadColumn && b.real?.order === 'move' && !b._routeGate) {
      const point = b._route[b._i - 1];
      marchRoute(b, point[0], point[1]);
    }
    const gate = b.assault?.gateOnly ? b.assault() : null;
    if (b._routeGate) {
      if (b._routeGate.alive && !b._routeGate.opened) continue;
      const opened = b._routeGate;
      b._routeGate = null;
      const point = b._route[b._i - 1];
      // 門の真ん中で縦隊を止めない。後列の持ち場が塀・切岸に掛かり、
      // 到着待ちから抜けられなくなる。破った門は通過して次の道の点へ寄せる。
      if (opened.seg && Math.hypot(point[0] - (opened.seg[0] + opened.seg[2]) / 2,
          point[1] - (opened.seg[1] + opened.seg[3]) / 2) < 3) {
        advance(b); continue;
      }
      marchRoute(b, point[0], point[1]);
    }
    const [x, z] = b._route[b._i - 1];
    if (gate?.seg && gate.alive && !gate.opened && b.real &&
        Math.hypot(x - (gate.seg[0] + gate.seg[2]) / 2, z - (gate.seg[1] + gate.seg[3]) / 2) < 3 &&
        b.real.units.some((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut &&
          Math.hypot(u.pos.x - (gate.seg[0] + gate.seg[2]) / 2, u.pos.z - (gate.seg[1] + gate.seg[3]) / 2) < 6)) {
      // 閉じた門を越す行軍の下知を止め、実兵で今の門を破る。
      // 枡形の折れを歩き終えてから打つ。距離だけで内門へ向かうと角の塀に阻まれる。
      // 長い縦隊の平均ではなく、門へ着いた先頭で打ち始める。
      b._routeGate = gate; b.order({ id: 'assault', form: 'column' }); continue;
    }
    // 縦隊の後列は門の外に残る。平均位置を待つと、到着して待機に戻った隊も次へ進めない。
    const g = b.real;
    const arrived = g && g.order === 'hold' && !g.onArrive &&
      Math.hypot(g.anchor.x - x, g.anchor.z - z) < 0.5;
    // 門前では後列の平均を待たず、先頭が道の点へ着いたら次へ送る。
    const headArrived = (g?.order === 'move' || g?.order === 'path') && g.units.some((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut && Math.hypot(u.pos.x - x, u.pos.z - z) < 1.2);
    if (arrived || headArrived || Math.hypot(b.pos.x - x, b.pos.z - z) < 2.5) advance(b);
  }
}
// 今いる曲輪から本丸へ。西口が先に抜けても、大手の隊は曲がる門を省かない。
function toHonmaru(rt, b, enterKeep = false) {
  if (deadB(b)) return;
  const F = rt.flags, p = b.pos;
  const road = [[GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
  if (enterKeep) road.push([-58, 0], [-62, 0]);
  if (F.C.kuruwa.hon.test(p.x, p.z)) {
    // 西から入った隊への下知し直しも、主殿を横切らず北の庭を通す。
    if (p.x < -58) {
      const westRoad = ROAD_KARAMETE.slice(3);
      let start = 0;
      for (let i = westRoad.length - 1; i >= 0; i--) {
        const [x, z] = westRoad[i];
        if (localClear(rt.army, p, { x, y: rt.world.heightAt(x, z), z }, true)) { start = i; break; }
      }
      const route = westRoad.slice(start);
      if (enterKeep) route.push([-58, 0], [-62, 0]);
      b.assault = gateAssault(F.gates.karamete);
      setRoute(b, route);
      return;
    }
    b.assault = gateAssault(F.gates.honInner);
    setRoute(b, road.slice(3));
  } else if (F.C.kuruwa.ni.test(p.x, p.z)) {
    b.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
    setRoute(b, [[-2.125, -8], ...road]);
  } else if (p.x < NISHI_X) {
    // 西口は本丸へ直接つながる。東の枡形の門を的にすると、搦手を抜けた隊が
    // 主殿の向こうの門へ戻ろうとして止まる。西の道を通り、本丸内で城兵と戦う。
    b.assault = gateAssault(F.gates.karamete);
    const westRoad = ROAD_KARAMETE.slice(1);
    if (enterKeep) westRoad.push([-58, 0], [-62, 0]);
    setRoute(b, westRoad);
  } else {
    b.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    // 先頭の平均位置が曲輪内でも、後列がまだ喰違いを曲がっている。
    // 下知し直す時も未通過の折れから続け、塀越しに土橋へ直行させない。
    const next = b._route?.[b._i - 1];
    const pending = next ? ROAD_OTE.findIndex(q => q[0] === next[0] && q[1] === next[1]) : -1;
    const start = pending >= 0 ? Math.min(pending, 9) : F.C.kuruwa.san.test(p.x, p.z) ? 7 : 1;
    setRoute(b, [...ROAD_OTE.slice(start, 10), ...road]);
  }
}
// 11/13 MB係四：本物の兵だけ（K285）では、大手の先手・後詰・第二陣が③〜⑤で一人二人まで減り、本人が三の丸の備えと新手に一人で囲まれて倒れた（act bot の跡 b1,1,1）。
//   大手の本物の味方が三十人を切ったら、陣（x150）から後続の備え十八人を四十秒おきに大手の道へ送る（六組まで・本物の総数は二百二十五まで）。
//   織田の寄せ手は三万。尽きるのは城方で、寄せ手の列は後ろから続く。
function followTick(rt) {
  const F = rt.flags;
  if (!F.attackers || F.ending || rt.over || (F.step || 0) < 1) return;
  F.follows ||= [];
  if (F.follows.length >= 6 || rt.t - (F.followT ?? -99) < 40) return;
  const fit = (u) => u.alive && !u.fleeing && !u.woundOut;
  let live = 0;
  for (const q of [F.oteSpear, F.reserve, F.dan2, ...F.follows]) if (!deadB(q)) live += q.real.units.filter(fit).length;
  if (live >= 30) return;
  let all = 0; for (const u of rt.army.units) if (u.alive) all++;
  if (all > 225) return;
  F.followT = rt.t;
  const k = F.follows.length;
  const b = mkB(rt, { name: '大手の後続（織田の後備え）', n: 18, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 150, z: k % 2 ? 8 : -12 }, facing: -Math.PI / 2 });
  b.tkRoadColumn = true; b.directOrders = true;
  if (b.real) { b.real.directOrders = true; b.real.noRout = true; }
  F.follows.push(b); F.attackers.push(b); F.movers?.push(b); F.localTroops?.push(b);
  toHonmaru(rt, b);
  rt.say('使番', '後続の備えが着いた！　大手から続くぞ', 3);
}
// 十四部隊を十四人ずつ。物見の射手と室内の守り・居所・自分の組も合わせて約二百五十人。
function mkB(rt, o) {
  // 総勢は備の表へ。近い一組は全員が本物。塀を抜けて消える軽い後列を置かない。
  // 交戦中の消失・同じ場所への補充・将の再出現をこの戦では行わない。
  // 11/5：o.n で一組の人数を変える（大手の寄せ手は城兵より厚く。kaito 一1 史実の兵数の比）。
  const n = o.n || 14;
  const b = makeButai(rt, { ...o, nominal: n, real: o.real ?? n, maxReal: n,
    nearReal: n, farReal: n, noSwitch: true, lightWidth: o.at.x < NISHI_X ? 2 : 7, lightDepth: 12,
    mix: o.kind === 'ashigaru' ? { ashigaru: 0.8, samurai: 0.2 } : undefined });
  b.paperNominal = o.paperNominal; // 備の推定人数。近い実兵十四人とは別。
  if (b.light) b.light.visible = false; // 通れず本物に替えられない場所へ軽い兵を残さない。
  if (b.real) b.real.noAI = true;
  return b;
}
// 搦手の尾根道は幅六メートル。横陣の端や遠景の散らばった位置を持ち場にしない。
function mkKarameteTroops(rt, o) {
  const b = mkB(rt, { ...o, real: 0 });
  // 後列も主殿の北を回る折れに沿わせ、裏壁へ押し重ならない。
  b.tkRoadColumn = true;
  // 初めに本物へ替える位置も尾根の幅に収める。
  const canSpawn = b._canSpawn, grow = b.growReal;
  b._canSpawn = (x, z) => canSpawn(x, z) && (x >= NISHI_X - 2 || Math.abs(z) < 1.3);
  b.order({ id: 'hold', form: 'column' });
  b.growReal = (n) => {
    const made = grow.call(b, n);
    // 城攻めの道に従う。野戦の頭が隊を切岸の横へ広げないようにする。
    if (b.real) b.real.noAI = true;
    return made;
  };
  b.growReal(o.n || 14);
  return b;
}
// 城主が果てた後、信忠は旗本に囲まれて搦手から本丸の旗の下へ入る（自ら門を打たず、斬り合いの最中に乗り込まない）。
function nobutadaEnters(rt) {
  const b = rt.flags.nobutada;
  if (deadB(b) || b._entered) return;
  b._entered = true; b.assault = null;
  // 11/18 23:50 持ち主（act bot 562秒★★：⑥で信忠の旗本13人が閉じたままの搦手門 (-77,0) の外に path のまま重なって止まった）：
  //   城主が果てたら、本丸に残る者が搦手の閂を外して落ちる（字の知らせは出さない）。旗本はその口から入る
  const kg = rt.flags.gates?.karamete;
  if (kg && !kg.opened && !kg.breached) kg.sally?.();
  setRoute(b, [...ROAD_KARAMETE.slice(2, -1), [-56, 3]]);
}
// 11/18 クラウドす：備えのピンは本人に一番近い生きた兵の足元へ。塀の上・段の縁など歩けない地面に立つ兵は選ばない（act bot「行けず：〇〇の備え（歩けない地面）」）
function guardPinAt(rt, b) {
  let best = null, bd = Infinity; const p = rt.player.u.pos, w = rt.world;
  for (const u of b.real?.units || []) { if (!u.alive || u.fleeing || u.perch || u.climb) continue; if (w?.walkable?.(u.pos.x, u.pos.z) === false) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd) { bd = d; best = u.pos; } }
  if (best) { b._pinLast = { x: best.x, y: best.y, z: best.z }; return best; }
  // 11/18 クラウドす（act bot「行けず：492〜528秒 本丸の備え（歩けない地面）」）：歩ける所に兵がいない時は前のピンのまま。無ければ備えの真ん中から近い歩ける地面を輪に探す
  if (b._pinLast) return b._pinLast;
  if (w?.walkable && w.walkable(b.pos.x, b.pos.z) === false) {
    for (let r = 2; r <= 12; r += 2) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = b.pos.x + Math.cos(a) * r, z = b.pos.z + Math.sin(a) * r; if (w.walkable(x, z) !== false) return (b._pinLast = { x, y: w.heightAt?.(x, z) ?? b.pos.y, z }); }
  }
  return b.pos;
}
function deadB(b) { return !b || !b.real || b.real.count <= 0 || b.real.routed || b.real.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget); }

// 高遠の守りは土橋と曲がる口を通って退く。本丸では奥の守りを続ける。
// 道と門の記録は準備時だけ作り、見回りは一秒ごと。共通の守備判断を変えない。
function takatoDefense(rt) {
  const F = rt.flags;
  const hon = [[-2.125, -8], [GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
  const san = [[70, -4], [57, 10], [43, GATE_NI.z], [GATE_NI.x, GATE_NI.z], [-2.125, -8]];
  const posts = [
    { b: F.sanSpear, zone: 'san', road: san, next: 'ni' },
    { b: F.sanGun, zone: 'san', road: san, next: 'ni' },
    { b: F.hodoinSpear, zone: 'hon', road: hon, next: 'hon' },
    { b: F.niSpear, zone: 'ni', road: hon, next: 'hon' },
  ];
  const doors = [F.gates.gateNi, F.gates.honOuter, F.gates.honInner].map((gate) => {
    const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
    const end = gate === F.gates.gateNi ? san[san.length - 1] : hon[hon.length - 1];
    return { gate, x, z, side: Math.sign((end[0] - x) * s.nx + (end[1] - z) * s.nz) || 1, active: false };
  });
  return { usingGate: (gate) => doors.some((q) => q.gate === gate && q.active), tick() {
    if (!F.refresh || F.step < 1) return;
    for (const p of posts) {
      const b = p.b;
      if (deadB(b) || b._route) continue;
      if (p.zone === 'hon') continue;
      const lost = p.zone === 'san' ? F.sanFell : F.niFell;
      const generalDown = b.general && !b.real.units.some((u) => u.alive && u.name === b.general);
      // 門を破られ槍の備えが退いた後も、手の届かない棚の八人だけで
      // 三の丸を塞がない。鉄砲衆も降りて次の曲輪で戦い続ける。
      const wallAbandoned = b === F.sanGun && p.zone === 'san' && F.gates.oteInner.opened &&
        (F.sanSpear.tkRetreat || deadB(F.sanSpear));
      if (!lost && !generalDown && !wallAbandoned && b.real.count > 4 && b.morale >= 22) continue;
      b.tkRetreat = true; b.assault = null;
      // 11/6 描いて遊んで：三の丸が落ちても塀の棚の鉄砲衆が残り、外の寄せ場を撃ち続けた。棚から曲輪の内へ降りて共に退く。
      if (b === F.sanGun) for (const u of b.real.units) {
        if (!u.alive || !u.perch) continue;
        u.perch = null;
        const x = [74.2, 73.2, 72].find((x) => rt.world.walkable(x, u.pos.z, rt.world.heightAt(x, u.pos.z))) ?? 73.2;
        u.pos.set(x, rt.world.heightAt(x, u.pos.z), u.pos.z);
        if (u.mesh) u.mesh.position.copy(u.pos);
      }
      for (const q of doors) {
        if ((p.zone === 'san') !== (q.gate === F.gates.gateNi)) continue;
        q.active = true;
        if (!q.gate.breached && !q.gate.opened) q.gate._openNow(false);
      }
      setRoute(b, p.road);
      p.zone = p.next; p.road = hon; p.next = 'hon';
      battleEvent(rt, EVENT_RETREAT, b.pos, b.real, 1, false, '城兵が土橋を渡り、奥の備えへ退く');
    }
    for (const q of doors) {
      if (!q.active || q.gate.breached) continue;
      let passed = true;
      const s = q.gate.struct;
      // 残る後列と、同じ門を使う出撃の組も待つ。秒数だけで閉めない。
      for (const p of posts) {
        if (!p.b.tkRetreat || deadB(p.b)) continue;
        for (const u of p.b.real.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (q.gate === F.gates.gateNi && (F.sallyOut || F.sallyUntil || F.sallyReturning || F.reserveDef._route)) passed = false;
      // 攻め手が通行中なら、閉め直す待ちを残す。ここで待ちを消すと、
      // 二の丸・本丸の門が壊れていなくても開いたままになる。
      if (passed && !q.gate.occupied && q.gate.close()) q.active = false;
    }
  } };
}

// 退避の印も自動操作の一歩も、土橋と曲がる口の足場を共用する。
// 共通の探索が半秒ごとに呼ぶ。調べる点は使い回し、兵・形・材質を増やさない。
function takatoRetreatPath(rt, to) {
  const from = rt.player.u.pos;
  if (!localClear(rt.army, from, to, true)) return false;
  const step = rt.flags.retreatStep;
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .75));
  let y = from.y;
  for (let i = 1; i <= count; i++) {
    step.x = from.x + (to.x - from.x) * i / count;
    step.z = from.z + (to.z - from.z) * i / count;
    step.y = groundAt(rt.world, step.x, step.z, y);
    // 下りも登りと同じ歩幅で調べる。堀底の平らな所へ飛び下りる退路を選ばない。
    if (Math.abs(step.y - y) > .65 || !clearFoot(rt, step)) return false;
    y = step.y;
  }
  return true;
}

const takato_siege = {
  // 11/18 K363 クラウド k365-cloud-50（司令塔：cloud-14 の確かめで「途中から続ける」が無い戦）：段は右上の任務（F.objStage ①寄せ・②打って出た城兵を追う・
  //   ③三の丸・④二の丸・⑤本丸の最期）。前の段は音もなく済ませる（城兵は受けた・前の曲輪の門は開いた・曲輪は落ちた）。包囲の段（b_takato.js）は寄せの前に済ませる
  checkpointStep: (rt) => rt.flags.step >= 1 ? Math.max(1, rt.flags.objStage || 0) : 0,
  resumeSteps: [
    [1, function (rt) { if (!(rt.flags.step >= 1)) this.assault(rt); }],
    [2, function (rt) {
      const F = rt.flags;
      if (receivedSally(F)) return;
      F.sallyContact = 4; F.sallyBegun = true; F.sallyOut = false; F.sallyUntil = rt.t;   // 次のコマで城兵が門の内へ退き、③（退く城兵に続け）の任務になる
      mainObj(rt, 2);
    }],
    [3, function (rt) {
      const F = rt.flags;
      if (F.sanFell) return;
      F.sallyContact = Math.max(4, F.sallyContact || 0);
      for (const g of [F.gates.oteOuter, F.gates.oteInner]) if (g && !g.breached && !g.opened) g._openNow(false);
      F.sallyUntil = 0; F.sallyReturning = false; F.sallyOut = false;
      this.onZoneFall(rt, 'san');
      F.guideRoadI = Math.max(F.guideRoadI ?? 1, 6); F.botRoadI = Math.max(F.botRoadI ?? 1, 6);   // 道の印を三の丸の中の折れから（大手道の入口へ戻さない）
    }],
    [4, function (rt) {
      const F = rt.flags;
      if (F.niFell) return;
      if (F.gates.gateNi && !F.gates.gateNi.breached && !F.gates.gateNi.opened) F.gates.gateNi._openNow(false);
      F.sanT = Math.min(F.sanT ?? rt.t, rt.t - 21);   // 三の丸から二十秒の待ちは済んだ物に
      this.onZoneFall(rt, 'ni');
      F.guideRoadI = Math.max(F.guideRoadI ?? 1, 8); F.botRoadI = Math.max(F.botRoadI ?? 1, 8);   // 道の印を二の丸の門から
    }],
    [5, function (rt) {
      const F = rt.flags;
      if (F.lordDying) return;
      for (const g of [F.gates.honOuter, F.gates.honInner]) if (g && !g.breached && !g.opened) g._openNow(false);
      F.niT = Math.min(F.niT ?? rt.t, rt.t - 16);
      this.honTaken(rt);
      F.honT = Math.min(F.honT ?? rt.t, rt.t - 80); F.metLord = rt.t - 5; F.hanaReleased = true;
      this.lastStand(rt);
      F.guideRoadI = Math.max(F.guideRoadI ?? 1, BOT_ROAD.length - 1); F.botRoadI = Math.max(F.botRoadI ?? 1, BOT_ROAD.length - 1);
    }],
  ],
  // 続ける時の本人の置き場：寄せは竹束の列、②③は大手の門の前、④は二の丸の土橋の手前、⑤は本丸の旗
  resumeAt(rt, step, from) {
    if (step <= 2) return { x: 97, z: 0 };   // 大手門（77）の外の寄せ道
    if (step === 3) return { x: 62, z: -2 };   // 三の丸の中の道（大手の枡形 [65,-8] から [57,10] の間）
    if (step === 4) return { x: GATE_NI.x + 6, z: GATE_NI.z };   // 二の丸の門の外（三の丸の側）
    if (step === 5) return { x: rt.flags.honPost?.x ?? -52, z: rt.flags.honPost?.z ?? 0 };
    return from;
  },
  // bot の跡に、行き先のピンと打って出た城兵の受け（②）の様子を足す（MB係四 11/13）
  botDbg: (b) => { const F = b.flags, g = b.missionGuide; return `P${g?.marker ? g.pos.x.toFixed(0) + ',' + g.pos.z.toFixed(0) + ':' + (g.label || '') : '-'}|s${F.sallyBegun ? 1 : 0}${F.sallyOut ? 'o' : ''}${F.sallyUntil ? 'u' : ''}${F.sallyReturning ? 'r' : ''}c${(F.sallyContact || 0).toFixed(0)}k${F.sallyInteriorKills || 0}|g${Math.round(F.gates?.honOuter?.struct?.hp ?? -1)}/${Math.round(F.gates?.honInner?.struct?.hp ?? -1)}|b${[F.oteSpear, F.reserve, F.dan2, F.karameteSpear, ...(F.follows || [])].map((q) => q && !deadB(q) ? q.real?.units?.filter((u) => u.alive && !u.fleeing).length ?? 0 : 'x').join(',')}`; },
  // 命懸けの戦場（docs/lethal_field_spec_1108.md）。入れる前から bot が倒れるので、倒れすぎない強さ（11/10 命懸けの係）
  lethal: { soft: true },
  // 見物の民は共用の描画と避難処理だけを使い、兵の名簿・当たり・戦功へ入れない。
  civilianCrowd: {
    bounds: { minX: -160, maxX: 180, minZ: -100, maxZ: 100 },
    bands: [
      { x: 117, z: 67, kinds: ['townsman', 'merchant', 'woman', 'child'], mode: 'watch', route: peopleRoute(PEOPLE_PATHS[1]) },
      { x: 142, z: 76, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], mode: 'watch', route: peopleRoute(PEOPLE_PATHS[2]) },
      // 法幢院の堂の東側で見守り、東の曲輪の口から里道へ。南の断崖へ下ろさない。
      { x: -36, z: 63, kinds: ['monk', 'monk', 'farmer'], mode: 'watch',
        route: peopleRoute([[-36, 66], [-30, 66], ...PEOPLE_PATHS[0]]) },
    ],
  },
  // 揺れと壁の補正が済んだ後、堀の砂へ視点が戻らないようにする。
  clampCamera(rt, pos) {
    const p = rt.player, u = p.u;
    if (NAKA.cur || rt.game?.photo || p.fpK >= .5 || p.mounted) return;
    const head = u.pos.y + 2.05 * (u.mesh?.scale.y || 1);
    // 味方の肩と逆茂木の上に、敵を見る隙間を残す。繰り返しても高さを足し続けない。
    pos.y = Math.max(pos.y, head + .55);
    const dx = pos.x - u.pos.x, dz = pos.z - u.pos.z, dy = pos.y - head;
    // 自分から視点までの線が斜面を横切る時は、その手前へ寄せる。
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(dx, dz) / .4)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = u.pos.x + dx * t, z = u.pos.z + dz * t;
      if (rt.world.heightAt(x, z) + .45 > head + dy * t) {
        const safe = (i - 1) / steps;
        pos.set(u.pos.x + dx * safe, head + dy * safe, u.pos.z + dz * safe);
        break;
      }
    }
    // K365 クラウド36（描かずの見張り 209〜221 秒）：後ろがすぐ斜面だと頭の中まで寄り、本人が写らなかった。
    //   頭の後ろ一・三m で、斜面を上から越える高さ（頭の上三m まで）が取れればそこに置く
    const len = Math.hypot(dx, dz);
    if (len > .3 && Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) < Math.min(1.2, len * .9)) {   // 寄せ済みで一・三m 内に来た時も（224 秒の続き）
      // K365 クラウド36（全戦の測り直し 224〜235 秒）：真後ろが急な切岸だと三m でも越えられず、頭の真上に残って本人が写らなかった。
      //   真後ろ→斜め後ろ（左右四十度・八十度）の順に一・三m の口を探し、どれも無ければ頭の上一・四m・〇・四m 後ろに置く（上は斜面に当たらない）
      let done = false;
      for (const turn of [0, .7, -.7, 1.4, -1.4]) {
        const c = Math.cos(turn), s = Math.sin(turn), ux = (dx * c - dz * s) / len, uz = (dx * s + dz * c) / len;
        const bx = u.pos.x + ux * 1.3, bz = u.pos.z + uz * 1.3;
        let need = head;
        for (let i = 1; i <= 6; i++) {
          const t = i / 6, h = rt.world.heightAt(u.pos.x + (bx - u.pos.x) * t, u.pos.z + (bz - u.pos.z) * t) + .45;
          need = Math.max(need, head + (h - head) / t);
        }
        if (need <= head + 3) { pos.set(bx, Math.max(need, head + .3), bz); done = true; break; }
      }
      if (!done) pos.set(u.pos.x + dx / len * .4, head + 1.4, u.pos.z + dz / len * .4);
    }
    // 視点の中心だけでなく、近写しの画面の端も砂から離す。
    let floor = rt.world.heightAt(pos.x, pos.z);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      floor = Math.max(floor, rt.world.heightAt(pos.x + Math.cos(a) * .65, pos.z + Math.sin(a) * .65));
    }
    pos.y = Math.max(pos.y, floor + .45);
  },
  jinkei: [TAKATO_ATTACK, TAKATO_DEFEND],
  taisho: { b: null }, // 城将の討死だけで共通処理に勝利させず、本丸の確保まで戦う。
  noTaishoRaid: true, // 城兵の出撃はこの戦が管理する。別の本陣襲撃と逆向きの帰陣命令を重ねない。
  nearHatFadeRadius: 6,
  nearAllyFadeLevel: 1,
  onRearApproach(rt, u) { rt.flags.rearShadows?.warn(u); },
  nearAllyFadeRadius: 4.8, // 近い味方の背を既存の共用材質で透かす。兵の動きと当たりは残す。
  rangedWarning: true, // 狭間の射手が見えなくても、発射前の向きを知らせる。
  rangedThreatNeedsShot: true, // 玉込め中の射手の狙いだけで、門の道案内を退避へ替えない。
  meleeThreatHeight: 3, // 堀や塀の別の段にいる兵を、目前の打ち手として案内しない。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  // 足や腕に残る軽傷だけで門の道順を隠さない。出血と深手は手当てへ導く。
  woundRetreatNeeded: (rt) => rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6,
  keepWoundRetreatReason: true,
  retreatGuideLabel(rt, reached) {
    const p = rt.player;
    if (this.woundRetreatNeeded(rt)) {
      if (p.treatmentLeft <= 0) return '味方の後ろへ下がる';
      return '味方の後ろへ下がって手当て';
    }
    return reached ? '味方の後ろで構える' : '味方の後ろへ下がる';
  },
  retreatPathAllowed: takatoRetreatPath,
  botRetreatStepAllowed: takatoRetreatPath,
  dodgePointAllowed: takatoRetreatPath,
  treatmentTaskGuidance: true,
  treatmentApproachLabel: '印まで下がって手当て',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentReady) return '手当て';
    if (!cue?.valid) return '味方の後ろへ下がる';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '印まで下がって手当て';
    return '足を止めて手当て';
  },
  introTaskFirst: true,
  compactIntro: true,
  introText: '武田の城が次々に開く中、仁科盛信の高遠城だけは降らない。夜のうちに浅瀬を渡った織田の大軍が、明け方、東の大手と西の搦手から寄せる。',
  gateRamHold: 1.2, // 掛矢の重い一打ごとに間を置き、同じ音を鳴らし続けない。
  noWake: true, // 部隊が本物と遠景を管理する。共通の追加兵を重ねない。
  reserveFrom: 60, // 陣の厚み（K281）：待つ備を 60 秒から（大手の寄せは開戦から門前で押し合う。90 秒に本人の 30〜60m を埋める）
  spawn: { x: 115, z: 0, heading: -Math.PI / 2 },
  noFieldMap: true,   // 稲生の標準：小さな地図は出さず、行き先のピンと敵の印に絞る
  playerRegen: 0.02,   // 稲生の標準：戦っていない間は命が戻り、血も止まる（player_hurt.js）
  playerTaken: 0.4,   // 11/14 MB係四：③三の丸で新手と塀の上の鉄砲に二百秒で倒れた（act bot 4回中3回）ので0.6→0.4。受ける傷を四割に（塀の上と曲輪の城兵に囲まれやすい。稲生の初陣と同じ）
  // 身の回りの当時の場（timeslip_field.js）。天正十年三月二日は今の三月末・信濃の山の雪解け。
  // 解けた雪でぬかるむ大手道と門の前、水たまり。枯れ草の丈は低い。門の前ほど倒れた槍・矢・脱げた陣笠が多い。
  timeslip: {
    wet: 0.6, dust: 0.1, trample: 0.3, debris: 1, arrows: 0.8,
    grass: 0x8c8462, grassTints: [0xffffff, 0xd8ccaa, 0xb0a888], grassH: 0.75, tallGrass: 0.45,
    flagColors: [0xe8e4d8, 0x1e1c1a, 0x8a2a22],
    fights: (rt) => Object.values(rt.flags.gates || {}).map(g => [g.inner.x, g.inner.z, 24]),
  },
  // 11/1 merge_1101d：共通の一太刀五割・六割（kaito 11/1 C）はそのまま、この戦だけ刃の一太刀を0.5倍に、刃を受けた後の3秒は次の刃を通さない（bot が一太刀・続けての太刀で倒れて負けた）
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3.5 },
  graceCap: 3.5,   // 11/18 kaito の答え（重くした戦は少し軽く・猶予は3.5秒まで）：刃の後の猶予を共通の1.8秒から上限の3.5秒へ
  // 11/18 K358：曲輪の中で城兵に囲まれると十数秒で倒れ、act bot が3回中2回負けた。囲まれた時だけ七割（一太刀の重さは残す。小谷・稲葉山の搦手と同じ戦ごとの加減）
  takenMult(rt) { return rt.player?.u?.mobbed || rt.flags.sallyOut || rt.flags.sallyUntil ? 0.65 : 0.8; },   // 一人の足軽の槍でも十数秒で倒れた（169秒）ので、ふだんも八割。最初の斬り合い（大手門の前で打って出た城兵）は六割五分（150秒前後で3回倒れた）
  noMissionCall: true, // 任務の文は右上の札だけ（左上の知らせに同じ文を重ねない）
  attackWarningDelay: 1, // 11/18 K358：打たれる前に迫る向きを知らせ、構える間を残す（三の丸・本丸で背から斬られ、act bot が3回中1〜2回倒れた。姉川・三方ヶ原と同じ）
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物（MB係四）
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定は四人・player_pressure.js）
    seed: 15930,
    allyTaken: 0.4,   // 寄せ手（数で勝る織田勢）は城兵より傷みにくい。門を一つずつ取り続けられるように

    time: 'day',
    mood: 'morning', // 三月二日の払暁に総攻め（信長公記）。低い朝日と薄い朝靄から始め、昼へ移る。
    springSnowPatch: false, // この戦の tint で北斜面と林床だけに薄い残雪を混ぜる。
    slopeRockFaces: true, // 急坂では厚みを斜面の外へ向ける。
    winter: true, // 落葉樹と花は冬の姿。春の山国に夏の茂みを置かない。
    nearStakeFade: true,
    noLowBlobShadows: true, // 携帯では兵の足元の黒い円板を省く。背後の知らせはこの戦の足音と短い影で残す。
    rockCenterGround: false, // 接地板を省き、切岸へ岩の下縁まで埋める。
    rockDrawGround: true,
    rocks: 0, // 共通の無作為な岩は置かず、専用の120個を切岸だけへまとめる。
    curvedRockTufts: true,
    groundedSlopeRocks: true, // 岩を斜面へ埋め、地面をまたぐ板状の人工の陰を置かない。
    nearAllyFadeRadius: 4.8, // 近い味方は消さず、描く時の半透明に任せる。
    thickTrees: true, // 杉の枝と葉の立体の芯を共用し、抜き板の林を避ける。
    treeScale: { crown: 0.55, trunk: 0.6, height: 1.1 }, // 早春の段丘林。葉の枝張りと幹を細くし、背を伸ばす。
    treePadMul: 1.3, // 寄せ道の脇に幹を密集させず、兵の見通しを空ける。
    lookoutKind: 'ro', // 常設の物見は板囲いと板屋根。盾を並べる仮設櫓にしない。
    lookoutLogFrame: true, // 高画質の井楼にも丸太組みの指定を通し、垂直な柱と交互の横木にする。
    clothFolds: true, // この戦の置き幟に皺と乳の輪を付ける。
    fallenHelmets: true, // 落ちた笠の最下点を、斜面や櫓の板床へ合わせる。
    autumn: true, // 共通の枯れ草の色を使う。木は winter の姿を優先する。
    fieldStage: 'stubble',
    // 曲輪と野の土は早春の落ち葉と土の写真（CC0）に（どこも灰色に白い丸い小石を散らした同じ模様だった。11/8 critic60 高遠・八1）
    groundPhoto: { dirt: 'kanegasaki', mudFromSoil: true },
    roundedFire: true, smoothGroundFire: true,   // 11/8 critic60（四6・九5）：本丸の地面に板の絵の炎が立った。丸い炎と地面に沿う焚き口に
    mist: true,   // 朝靄（11/8 critic60 高遠：払暁の靄が無く曇りの昼に見えた）
    wind: [0.8, 0.3],
    fogFar: 360,   // 開戦の所から、尾根の上の三の丸・本丸の屋根が霞まずに見える遠さ（携帯の見える遠さを掛けても 250m ほど）
    muddy: 0.1,
    climbTan: 0.70,
    terrainTags: true,     // M1：坂・道の速さ・向き変えを効かせる（西の切岸が本当に登りにくくなる）
    moveWay: runnerWay,
    runnerWay,
    // 信忠の旗本の後列まで尾根道をつなぐ。門へ進む道順は変えない。
    paths: [{ pts: [[-146, 0], ...ROAD_KARAMETE], w: 3 }, ...TAKATO_PLAN.paths.map((p) => ({ pts: p.pts, w: 3 })), ...PEOPLE_PATHS.map((pts) => ({ pts, w: 3 }))],
    // 文化庁「高遠城跡」：三峰川・藤沢川の合流する段丘先端。
    // https://online.bunka.go.jp/heritages/detail/201686
    // 川筋は縮尺に合わせた推定。西の寄せ道を横切らず、崖下で合流して西へ流す。
    // 点は上流から下流へ並べ、水面の流れも城の東へ逆流させない。
    streams: [
      { pts: [[170, -104], [0, -108], [-90, -100], [-155, -70], [-190, -90]], w: 9, depth: 1.6 },
      { pts: [[170, 118], [-30, 114], [-116, 90], [-155, 26], [-180, -35], [-190, -90], [-230, -90]], w: 12, depth: 1.8 },
    ],
    height,
    tint(x, z, h, c) {
      const dx = (height(x + 1, z) - height(x - 1, z)) * .5;
      const dz = (height(x, z + 1) - height(x, z - 1)) * .5;
      const slope = Math.hypot(dx, dz), flat = 1 - Math.min(1, slope / .8);
      const patch = .5 + .5 * Math.sin(x * .17 + Math.cos(z * .11)) * Math.cos(z * .19);
      const trodden = distToPolyline(x, z, ROAD_OTE) < 5;
      const dryGrass = flat * (trodden ? .08 : .45) * patch;
      c.setRGB(.42 + dryGrass * .14, .33 + dryGrass * .15, .24 + dryGrass * .12);
      // 北は -z。北へ下がる面と、道から離れた高い林床に残す。低い河原は赤土。
      const north = Math.max(0, dz) / Math.sqrt(1 + slope * slope);
      const shade = trodden ? 0 : Math.max(north, flat * (x < NISHI_X - 6 ? .65 : .25));
      // 11/6 critic60：空堀の底の残雪が細い青白い筋に見え、水の流れと見違えた。堀の底には残さない。
      const moat = castleBase(x, z) - h > 1;
      const snow = moat ? 0 : Math.min(.55, shade * Math.max(0, (patch - .45) / .55))
        * Math.max(0, Math.min(1, (h - 16) / 12)) * (1 - Math.min(1, Math.max(0, slope - 1)));
      c.setRGB(c.r + (.8 - c.r) * snow, c.g + (.82 - c.g) * snow, c.b + (.85 - c.b) * snow);
      // 切岸は赤土を暗くし、岩の色を薄く混ぜる。
      if (slope > .8) c.multiplyScalar(.88 + .04 * patch);
      // 11/15 クラウドか（K289）：堀切の底が明るい枯れ草色の平らな帯になり、土橋の裾へ上がる所が四角い当て布に見えた。
      // 深い堀の底は日の届かない湿った黒土と落ち葉に沈める（深いほど暗く・枯れ草の明るみを消す）。
      if (moat) {
        const deep = Math.min(1, (castleBase(x, z) - h - 1) / 4);
        c.setRGB(c.r + (.2 - c.r) * deep * .7, c.g + (.16 - c.g) * deep * .7, c.b + (.11 - c.b) * deep * .7);
        c.multiplyScalar(1 - .25 * deep);
      }
    },
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || TAKATO_PLAN.paths.some((p) => distToPolyline(x, z, p.pts) < 5) || PEOPLE_PATHS.some((pts) => distToPolyline(x, z, pts) < 4) || CLEAR_BOUNDS.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1),
    trees: 500,
    tufts: 1800,
    tuftTint: 0xb5a18a,
    treeDensity: (x, z) => (x < NISHI_X - 6 || z > CLIFF_Z + 10 ? 1.2 : 0.4),   // 三峰川へ下る南の斜面も林（木の数は変えない）
    groves: [{ x: -57, z: -40, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -140,
    // 11/6 critic60：城兵が赤い具足（赤備えは山県の物）で、白地の割菱の旗が織田の黄の木瓜と混ざって敵味方が分からない。
    // 仁科の城兵は黒地に白の割菱の旗・黒い具足（武田の旗の型。色は推定）。
    armyFlagKinds: { takeda: 'yose_takeda_black' },
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  *setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（この戦だけ）
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', nishinaMorinobu: 'HIST_A', twoFronts: 'HIST_A', nobutadaAdvance: 'HIST_A', oneDay: 'HIST_A', cliffs: 'HIST_B', routes: 'GAME_C', ladders: 'GAME_C', lordJudgement: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true;
    F.pushKills = { san: 0, ni: 0, hon: 0 };
    F.handKills = { san: 0, ni: 0, hon: 0 }; // 自分と組の実際の討ち取りだけを下知に反映する。
    F.retreatStep = { x: 0, y: 0, z: 0 };
    // 傷は共通の当たり処理に任せる。時刻による体力の下限を設けない。
    resetGates(); resetLadders(); flReset();
    // 総勢の数字より先に、見える城と自分の進む口を結ぶ。
    rt.banner('夜明けの高遠城', '夜のうちに川下の浅瀬を渡り、大手口に取り付いた');

    // ---- 縄張り：塀・門・櫓を castle_plan.js に建てさせる（C1・C2） ----
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: castleBase, edgeW: 3, buildGates: false, buildTowers: true, life: true, team: 1 });
    C.gateObjs = takatoGates(rt);
    F.earthMat = takatoWallMaterial();
    if (C.seat?.building) takatoEarthWalls(C.seat.building, F.earthMat);
    takatoLife(rt);
    takatoSiegeStores(rt);
    takatoOteJin(rt);
    takatoSpring(rt);
    takatoGround(rt);
    F.coldBreath = takatoBreath(rt);
    F.rearShadows = takatoRearShadows(rt);
    // 束ねた杭も近い面だけなめらかに透かす。専用材質は支度時に共有する。
    const nearMats = new Map();
    rt.scene.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.userData.camNear) return;
      const fade = (source) => {
        if (!nearMats.has(source)) {
          const mat = source.clone(); mat.transparent = true; mat.depthWrite = false;
          mat.userData.camNearSmooth = true; nearMats.set(source, mat);
        }
        return nearMats.get(source);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fade) : fade(mesh.material);
    });
    F.botKuruwa = Object.values(C.kuruwa);
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;

    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // ---- 喰違いの冠木門：外と内の二つを、それぞれ壊せる門にする ----
    const G = C.gateObjs;
    G.ote.outer.struct.name = '大手門（一の門）'; G.ote.inner.struct.name = OTE.name;
    G.gate_hon.outer.struct.name = '本丸門（一の門）'; G.gate_hon.inner.struct.name = GATE_HON.name;
    G.gate_ni.struct.name = GATE_NI.name;
    G.karamete.struct.name = KARAMETE.name;
    G.gate_hodoin.struct.name = GATE_HODOIN.name;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    // 11/18 K358（K360⑦ の強さのまま）：本人が本丸門を掛矢で打つ間、門の内の城兵に槍で突かれ続けて倒れた（act bot）。本丸の二つの門は六割の固さにし、
    //   寄せ手と打てば早く破れる（門の内で斬り合う怖さは残す）
    for (const gt of [F.gates.honOuter, F.gates.honInner]) { const st = gt?.struct; if (st && st.hp > 0) { st.maxHp = st.hp = Math.round(st.hp * 0.6); } }
    F.gatePairs = { ote: [F.gates.oteOuter, F.gates.oteInner], hon: [F.gates.honOuter, F.gates.honInner] };
    // 門は掛矢の打ち手が数人でも破れる固さに（寄せが門前で止まり続けて、四〜七分を越えないように）
    for (const g of Object.values(F.gates)) { const st = g.struct; st.hp *= 0.55; if (st.maxHp) st.maxHp *= 0.55; }
    F.honPost = { x: -52, y: rt.world.heightAt(-52, 0), z: 0 };
    timeslipField(rt);   // 身の回りの雪解けのぬかるみ・倒れた槍と矢・枯れ草（def.timeslip）
    F.sallyGates = [F.gates.gateNi, F.gates.oteInner, F.gates.oteOuter].map((gate, i) => {
      const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      return { gate, x, z, side: Math.sign((91 - x) * s.nx + (0 - z) * s.nz) || 1, passed: false,
        outAfter: [2, 6, 8][i], backAfter: [8, 4, 2][i] };
    });
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // ---- 本丸の主殿（見た目だけ。飾り） ----
    // 城主の居所（kaito 10/1）：天守の無い戦国期の城なので、仁科盛信は主殿（茅葺・質素な館）の中。
    // 江戸期の御殿にしない（final7-1579-1582-spec 73〜74章）。旗本が東の上がり口を守り、
    // 攻め手が主殿へ上がるまでは討てない。主殿は人が上がれるよう、丸い当たり（solidR）を外す
    // 主殿は縄張り（castles/takato.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に城主（kaito 10/2）

    // ---- 西の切岸の梯子（C3）：足場（ROAD_NISHI の終わり）から、本丸の西の縁のすぐ内へ ----
    const foot = { x: NISHI_X - 2, z: 8 };
    F.nishiLadder2 = placeLadder(rt.world, { foot, topY: rt.world.heightAt(-74, 6) + 0.2, topX: -74, topZ: 6, hp: 50, team: 0, name: '西の切岸の梯子' });

    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // ---- 総勢のうち各口の前列約五百を扱い、その一部だけを本物の兵にする ----
    // 門の内の口（inner）のすぐそばに立たせる：siege_gate.js は「門兵（guardTeam）が居なくなったら開く」ので、
    // 曲輪の真ん中に置くと（遠すぎて）始めから門兵が居ない事になり、すぐ開いてしまう（確かめで見つけた）
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const karaGP = midOf(F.gates.karamete.struct), honGP = midOf(F.gates.honInner.struct);
    F.sanSpear = mkB(rt, { name: '三の丸の備え（諏訪勝右衛門）', general: '諏訪勝右衛門', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 140, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: oteGP.x - 5, z: oteGP.z }, facing: Math.PI / 2 });
    F.sanGun = mkB(rt, { name: '三の丸の鉄砲（塀の上）', n: 8, team: 1, faction: 'takeda', kind: 'gun', paperNominal: 20, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 69, z: 20 }, facing: Math.PI / 2 });
    F.niSpear = mkB(rt, { name: '二の丸の備え（小山田昌行）', general: '小山田昌行', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 90, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: niGP.x - 5, z: niGP.z }, facing: Math.PI / 2 });
    F.hodoinSpear = mkB(rt, { name: '西の搦手の備え', team: 1, faction: 'takeda', kind: 'bow', paperNominal: 70, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: karaGP.x + 5, z: karaGP.z }, facing: -Math.PI / 2 });
    F.honGuard = mkB(rt, { name: '本丸の仁科盛信の衆', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 150, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: honGP.x - 5, z: honGP.z }, facing: Math.PI / 2 });
    // 既存の控えを門外の寄せ場へ出す。門の内の守りと兵数は保つ。
    // 11/6 critic60：② の打って出た城兵と主人公が一度も斬り合わずに ② が済んだ。打って出る組に組頭（信長公記巻十五の討死の名「小山田大学」）を立て、
    // 名のある将として近づいた主人公へ挑ませる（army_think の名のある敵将の一騎打ち）。
    F.reserveDef = mkB(rt, { name: '城方の控え（小山田大学）', general: '小山田大学', n: 10, team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 30, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 80.5, z: -6 }, facing: Math.PI / 2 });   // 開戦の時は大手の南脇の塀際で先手と斬り合っている（25秒の画面の乱戦）
    // 控えの帰城も土橋の折れに沿わせる。直線の後列では堀の縁（22,7・37,7）で止まる。
    F.reserveDef.tkRoadColumn = true;
    F.defenders = [F.sanSpear, F.sanGun, F.niSpear, F.hodoinSpear, F.honGuard, F.reserveDef];
    // 最終段（assault）で城方の侍・足軽から五百余り受けて倒れた（11/10 見回り・act bot 1080秒）。守りの刃を浅くし、正しく戦えば生き残れる強さに。
    for (const d of F.defenders) { const g = d.real || d; if (g && g.dmgMult == null) g.dmgMult = .5; }
    // 11/13 K281：待つ備で門前の敵が厚くなった分、打って出る控え（小山田大学）の刃を浅く（act bot が門前で控えと新手に囲まれ 239 秒で倒れた）
    if (F.reserveDef.real) F.reserveDef.real.dmgMult = .35;
    // 段の決まり（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：大手の三の丸 → 二の丸 → 本丸。今の段の守りだけが打って出る
    //   西の搦手が先に破れた時も奥の守りを起こす（搦手の口の守りは別の前線なので段に入れない）
    {
      const open = (g) => !!g && (g.opened || g.breached || g.struct?.hp <= 0);
      F.stages = siegeStages(rt, [
        { get groups() { return [F.sanSpear.real, F.sanGun.real].filter(Boolean); }, at: niGP, done: () => open(F.gates.oteInner) || open(F.gates.karamete), report: '大手門、まだ破れませぬ！　塀の上から射られております！', reportAfter: 80 },
        { get groups() { return [F.niSpear.real].filter(Boolean); }, at: honGP, done: () => open(F.gates.gateNi) || open(F.gates.honInner), report: '二の丸の門、まだ破れず！', reportAfter: 80 },
        { get groups() { return [F.honGuard.real].filter(Boolean); }, done: () => false },
      ], { runner: '使番' });
    }
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.keep = makeLordKeep(rt, {
      name: '仁科盛信', spot: C.seat ? C.seat.spot : { x: honC.x, z: honC.z }, naka: C.seat && C.seat.naka, mouth: { x: honC.x + 2, z: honC.z }, facing: Math.PI / 2, guardN: 12,
      faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      // 11/6：奥の間に味方の誰かが近づいた時（四十四秒の事もあった）に叫ばせない。声は主人公が奥の間に来た時だけ（update）。
    });
    // 城主を守る旗本を野戦の自動出撃へ渡さない。門が開く前に
    // 喰違いへ全員が殺到せず、主殿の戸口で近づいた寄せ手と戦う。
    F.keep.guard.noAI = true; F.keep.guard.fixed = true;
    F.commander = { get alive() { return !F.keep.down; }, get real() { return F.keep.lord; } };
    // 盛信の最期は専用の場面で描く。共通の城主との斬り合い・討ち取りにはしない。
    const lord = F.keep.lord;
    lord.noTarget = true; lord.invuln = true; lord.group.noAI = true;
    lord.aiT = Infinity; lord.receivedSignal = lord.group.signalSerial; lord.perch = { x: lord.pos.x, z: lord.pos.z };
    const keepTick = F.keep.tick;
    F.keep.tick = () => { keepTick(); lord.noTarget = true; };
    if (F.keep.naka) { F.keep.naka.onEnter = null; F.keep.naka.onLevel = null; }
    F.lordState = 'defend';
    F.lastGuards = [...F.keep.guard.units, ...F.keep.kin.flatMap((g) => g.units)];

    // 台所で矢を射尽くして刀を取った若衆（学びの見せ場5）。場所と衣は推定。
    // 旗本二人分をこちらへ回し、本物の兵の総数を増やさない。
    const youths = rt.army.addGroup({ team: 1, faction: 'takeda', name: '台所の若衆',
      anchor: { x: -54, z: 5 }, facing: Math.PI / 2, order: 'hold', aggro: 7,
      width: 2, morale: 100, noRout: true });
    rt.army.spawn(youths, [{ type: 'samurai', n: 2, o: { name: '台所の若衆',
      weapon: 'sword', horse: false, kosode: 1, kosodeCol: 0x3a3c46,
      hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0 } }]);
    F.lastGuards.push(...youths.units);
    F.youths = youths;

    // はなが刀で戦った伝え。居場所と衣は推定。準備時の一人だけで、兵を追加し続けない。
    F.hanaGroup = rt.army.addGroup({ team: 1, faction: 'takeda', name: 'はな（諏訪勝右衛門の妻）',
      anchor: { x: -51, z: -4 }, facing: Math.PI / 2, order: 'hold', aggro: 0, width: 2, morale: 100, noRout: true, noAI: true });
    rt.army.spawn(F.hanaGroup, [{ type: 'samurai', n: 1, o: { name: 'はな', x: -51, z: -4,
      weapon: 'sword', reach: 1.75, horse: false, kosode: 1, kosodeCol: 0x3a3c46,   // 藍鼠の小袖（紫に寄せない）
      hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0 } }]);
    // 11/18 K358⑤：はな一人の刃で本人が106の傷を受けて倒れた（act bot 879秒）。伝えの「刀で戦った」は残し、刃は城兵と同じ半分に。
    F.hanaGroup.dmgMult = .5;
    F.hana = F.hanaGroup.units[0];
    F.hana.noTarget = true; F.hana.aiT = Infinity;
    F.hana.receivedSignal = F.hanaGroup.signalSerial;
    F.hana.perch = { x: F.hana.pos.x, z: F.hana.pos.z };

    // 城主と対面した後は、攻撃できない城主の足もとで待たせない。
    // 壁・柱を越さず歩ける残りの守兵へ案内し、退けたら元の奥の間の道へ戻す。
    const lordGuide = F.keep.guide;
    F.keep.guide = () => {
      if (F.metLord == null || F.lordDying || F.keep.down) return lordGuide();
      const p = rt.player.u.pos;
      let nearest = null, best = Infinity;
      for (const u of F.lastGuards) {
        if (!siegeFighter(u) || u.noTarget || Math.abs(u.pos.y - p.y) >= 2) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < best && localClear(rt.army, p, u.pos, true)) { nearest = u; best = d; }
      }
      return nearest ? nearest.pos : lordGuide();
    };

    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // ---- 攻めは信忠の約三万。城の近くでは小さな部隊だけを動かす ----
    F.oteSpear = mkB(rt, { name: '東の大手先手（森長可）', general: '森長可', generalHorse: true, n: 18, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: TAKATO_ATTACK.sonae[1].flag, mon: TAKATO_ATTACK.sonae[1].mon, at: { x: 127, z: 0 }, facing: -Math.PI / 2 });
    F.oteGun = mkB(rt, { name: '大手の先手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', paperNominal: 400, armor: ODA.armor, flag: TAKATO_ATTACK.sonae[1].flag, mon: TAKATO_ATTACK.sonae[1].mon, at: { x: 135, z: -8 }, facing: -Math.PI / 2 });
    F.karameteSpear = mkKarameteTroops(rt, { name: '西の搦手の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 500, armor: ODA.armor, flag: ODA.flag, at: { x: -108, z: 0 }, facing: Math.PI / 2 });
    // 陣の厚み（台帳 K281・11/13）：この戦の兵は mkB で作り bhelp を通らないので、depth_reserve.js の自動の待つ備が
    //   同じ装束（武田の城兵・森の先手）で作れるよう型を覚えておく。置けない所（塀・石垣の向こう）には depth_reserve が出さない
    if (!rt._tpl) rt._tpl = {};
    const tk = { flag: TAKEDA.flag, armor: TAKEDA.armor }, od = { flag: TAKATO_ATTACK.sonae[1].flag, armor: ODA.armor };
    rt._tpl.E = rt._tpl.E || { o: { team: 1, faction: 'takeda', dmgMult: .35 }, list: [{ type: 'ashigaru', n: 10, o: tk }, { type: 'samurai', n: 3, o: tk }, { type: 'gun', n: 2, o: tk }] };
    rt._tpl.A = rt._tpl.A || { o: { team: 0, faction: 'oda' }, list: [{ type: 'ashigaru', n: 10, o: od }, { type: 'samurai', n: 3, o: od }, { type: 'gun', n: 2, o: od }] };
    F.karameteBow = mkKarameteTroops(rt, { name: '西の搦手の手（弓）', team: 0, faction: 'oda', kind: 'bow', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -116, z: 0 }, facing: Math.PI / 2 });
    F.nishiLadder = mkB(rt, { name: '西の切岸の手（梯子）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -102, z: 12 }, facing: Math.PI / 2 });
    F.yodou = mkB(rt, { name: '南の押さえの手', n: 9, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 200, armor: ODA.armor, flag: ODA.flag, at: { x: -49, z: -75 }, facing: 0.5 });
    // 11/9 重さ：始まりの本物の兵が 287 で枠（250）を越えたので、寄せ手の名の無い兵を少し減らした（紙の上の数は paperNominal のまま）
    F.reserve = mkB(rt, { name: '大手の後詰（河尻秀隆）', general: '河尻秀隆', generalHorse: true, n: 16, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 109, z: 4 }, facing: -Math.PI / 2 });
    F.nobutada = mkKarameteTroops(rt, { name: '西の織田信忠の旗本', general: '織田信忠', n: 15, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 1500, armor: ODA.armor, flag: ODA.flag, at: { x: -124, z: 0 }, facing: Math.PI / 2 });
    // 信忠は西の搦手から塀際へ進む。taisho.js の adopt() は invuln 持ちの味方の総大将に
    // 深手（討たれない）の退きを与えるので、ここで立てておく（kaito 10/1。滝川一益の手と同じ作り）
    if (F.nobutada.taishoU) F.nobutada.taishoU.invuln = true;
    // 11/10 関所の4：森長可・河尻秀隆も高遠では討たれていない（河尻は同じ年の六月に甲斐で死ぬ）。「河尻秀隆、討死」が二度出ていたので、深手の退きにとどめる
    for (const b of [F.oteSpear, F.reserve]) if (b?.taishoU) b.taishoU.invuln = true;
    // 寄せ手は数で勝る。三分で総崩れして戦が終わらないよう、大手の先手と後詰は崩れずに戦い続ける（高遠は城方の全滅で終わった）
    // 11/5：信忠の旗本と搦手の槍も崩れない（総大将の旗本が弓だけで総崩れするのは史実と逆。kaito 一2）。
    for (const b of [F.oteSpear, F.reserve, F.karameteSpear, F.nobutada]) if (b?.real) b.real.noRout = true;
    if (F.nobutada.real) {
      F.nobutada.real.noAI = true; // 総大将は旗本と下知の道を歩く。
    }
    // 11/6 critic60：信忠が旗本を討ち減らし、本丸の前に名札だけで一人で立った。信長公記では信忠は塀際で
    // 「一度に乗り入れよ」と下知し、乗り入れたのは小姓・馬廻。信忠は旗本に囲まれて搦手の塀際に留まり、
    // 本丸が落ちてから旗本と共に本丸へ入る（総大将は前に出ない。kaito 一2・十三4）。
    F.nobutada.tkHold = true;
    // 旗本は具足の厚い馬廻・小姓。塀際の矢弾で討ち減って総大将が一人にならない。
    for (const u of F.nobutada.real?.units || []) { u.maxHp *= 2.5; u.hp = u.maxHp; }
    // 11/6 描いて遊んで：総懸かりの法螺から本隊が塀を越えるまでの六十秒に、大手の先手と後詰が門前で討ち減り、本人が城兵の群れに一人で向き合った。
    // 寄せ手は三万。大手の第二陣（団忠正の手）を寄せ道の奥に控えさせ、総懸かりで大手へ続かせる（後続が来る城攻め。kaito 十の3）。
    F.dan2 = mkB(rt, { name: '大手の第二陣（団忠正の手）', n: 12, team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 150, z: -12 }, facing: -Math.PI / 2 });
    // 先手と後詰も土橋の折れに沿う。先頭が渡った後の直線の持ち場では、
    // 後列が空堀の脇（32,1）へ向かい、二の丸から本丸へ続けなかった。
    for (const b of [F.oteSpear, F.reserve, F.dan2]) b.tkRoadColumn = true;
    if (F.dan2.real) F.dan2.real.noRout = true;
    for (const b of [F.oteSpear, F.oteGun, F.reserve, F.dan2]) { b.directOrders = true; if (b.real) b.real.directOrders = true; }
    F.attackers = [F.oteSpear, F.oteGun, F.karameteSpear, F.karameteBow, F.nishiLadder, F.yodou, F.reserve, F.dan2, F.nobutada];
    F.movers = [...F.attackers, ...F.defenders];
    F.localTroops = [...F.attackers, ...F.defenders];
    F.jinHosts = buildSonae(rt, this.jinkei);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    // 徒歩の槍：道の先が塀・門ごしで敵に届かなければ、立ち尽くさず門を打ちに掛かる（確かめで見つけた「20秒動かない兵」の直し）
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    F.karameteSpear.assault = gateAssault(F.gates.karamete);
    F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    for (const b of [...F.attackers, ...F.defenders]) {
      const onRidge = b === F.karameteSpear || b === F.karameteBow || b === F.nobutada;
      b.order({ id: 'hold', form: onRidge ? 'column' : b.kind === 'ashigaru' ? 'yari' : 'line' });
    }

    // ---- 区域の網：東の三の丸→二の丸→本丸、西の搦手は本丸へ。任務は二の丸の制圧を待つ ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 4, hold: 7, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '搦手の口', test: (x, z) => C.kuruwa.hon.test(x, z) && x < -68 && Math.abs(z) < 8, pos: { x: -72, z: 0 }, need: 6, hold: 14, gate: KARAMETE.name, next: 'hon' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 4, hold: 7, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 4, hold: 18, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'hon'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // siege_zones.js の兵力比は「今、本物（real）の兵」で数える（butai.js は名目の多くを軽い大軍で持つ）。
      // 総勢の数をそのまま渡すと、本物の枠は遥かに下回り、本丸に一人でも寄っただけで
      // 「降伏」が暴発してしまう（確かめで見つけた）。実際に本物として出せる見込みの数で渡す
      totalDefenders: 1, // 盛信は降伏しない。共通の二割降伏判定を使わない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [0, 0], reserves: [],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.honTaken(rt),
      onSurrender: () => {},
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・ルートの数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, C, {
      SZ: F.SZ, team: 1, friendTeam: 0,
      gates: {
        ote: [F.gates.oteOuter, F.gates.oteInner], gate_ni: F.gates.gateNi,
        gate_hon: [F.gates.honOuter, F.gates.honInner], karamete: F.gates.karamete, gate_hodoin: F.gates.hodoin,
      },
    });
    // 束12・束31・束32：K を rt にも持たせ、軍議の俯瞰の説明・小地図の曲輪塗り分け・制圧の札に使えるようにする
    rt.nawabari = F.K;

    // ---- 城の頭（siege_ai.js・F4・C8）：守りは持ち場・門・退き・出撃、攻めは道を選ぶ。
    // 出撃の一組は、この戦の門を通る道順で動かす。共通の自動出撃へ重ねて渡さない。
    F.DA = takatoDefense(rt);
    for (const b of F.defenders) b.order({ id: 'hold', form: b.kind === 'ashigaru' ? 'yari' : 'line' });
    // 攻めの頭（軍議で作戦を選ばなければ、道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ
    // ＝味方 AI の手も同じ頭で動く【城39】。道の指図そのものは runStrategy の walkRoute に渡す）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 3.2, pathLen: 60, chokeWidth: 4.2 },
      { id: 'karamete', defThickness: 1.6, pathLen: 46, chokeWidth: 4.4 },
    ];

    // ---- 竹束の寄せ（taketaba.js）：大手・搦手の先手は竹束を押し立て、ゆっくり寄せ場まで進んで撃ち合う ----
    const oteOpen = () => F.gates.oteInner.opened, karaOpen = () => F.gates.karamete.opened;
    F.TA = makeTabaAdvance(rt, {
      speed: 1.8, holdMelee: 4, // 大手の寄せと据え置きを短くし、最初の斬り合いへつなぐ。
      items: [
        { g: F.oteSpear, yose: { x: 97, z: 0 }, until: oteOpen }, { g: F.oteGun, yose: { x: 99, z: -8 }, until: oteOpen },
        { g: F.karameteSpear, yose: { x: -92, z: 0 }, until: karaOpen }, { g: F.karameteBow, yose: { x: -96, z: 0 }, until: karaOpen },
      ],
      avoid: [this.spawn, { x: 113, z: 4 }],
    });
    // 大手の寄せ手の前、斬り合いの両脇に据え置いた竹束の列（鉄砲・弓の楯）。道と斬り合いの中は空ける。配置は推定。
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++)
      addTaba(rt, 99 + (i % 2) * .6, side * (13.5 + i * 1.9), 0, { rot: -Math.PI / 2, fixed: true });
    // 門が開いたら、味方は自分の組と同じ下知で続く。

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 113, z: 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    // 11/18 K358（司令塔：K360⑦ は例外にせず、付いて来る組を厚く）：森長可の先手から槍八人を本人の組に付ける（大手の寄せは組で動く）
    if (!rt.G.lord) rt.makeSquad({ x: 116, z: 6 }, -Math.PI / 2, [{ kind: 'spear', n: 8 }]);

    // 空堀・塀から離れた門前の平地に、実兵の両脇の斬り合いを置く。
    // 本物への追加はせず、九十秒の門攻めでも軽い前列を保つ。
    // 10/31 北の組（z 8）は、門前の 101 では寄せ道を歩く本人から近すぎて一度も写らなかった（軽い兵は本人から44m・カメラから30m の内を描かない）。
    // 寄せ道の東、後詰の北の脇（x 134・z 11）へ移し、木戸から北へ回り込んだ城兵と後詰の端が押し合う形にする。
    // 竹束の寄せ場（x 99〜125）でどちらを向いても、カメラから30m 余りの所に入る。寄せ道（z ±4）と鉄砲の手の道（z −2〜−12）は空けたまま。数は同じ。
    // 11/4 p100（kaito AA・AP9）：軽い作りの押し合い（作り物）は置かない。門前で戦うのは本物の兵だけ。
    F.lines = [];
    F.stageCheck = 0; F.honHold = 0;
    F.roadGuide = { x: 97, z: 0, gate: null, returning: false };
    F.botRoadTarget = { x: 97, z: 0, gate: null };
    // 11/18 クラウドす（act bot「行けず：348〜357秒 二の丸の備え（歩けない地面）」）：備えの真ん中は塀際に落ちる。本丸の備えと同じく本人に一番近い生きた兵の足元へ
    const niAt = () => guardPinAt(rt, F.niSpear);
    rt.marker('ni', () => F.sanFell && !F.niFell && !F.ending ? niAt() : null,
      '二の丸の備え', { red: true });
    rt.marker('oteRoad', () => F.ending || (F.honFell && inHonEdge(F, rt.player.u.pos)) ||
      F.sallyOut || F.sallyUntil ? null : F.roadGuide,
      () => F.roadGuide.returning ? '寄せ道へ戻る' : F.roadGuide.gate?.name ||
        (F.roadGuide.x >= 90 ? '竹束の先の寄せ道' : '寄せ道の曲がり角'), { h: 1.8 });
    rt.world.setTime('morning');
    // 払暁の低い朝日（曇りの昼に濃い影がくっきり落ちていた。11/8 critic60 高遠・四6）：直の日を三割落として赤みを足し、影の縁をにじませる
    rt.world.sun.intensity *= 0.68; rt.world.sun.color.lerp(new THREE.Color(0xffb27a), 0.35);
    // 低い朝日でも切岸の陰の土と石が読めるよう、この戦の環境光だけ補う。
    rt.world.hemi.groundColor.setHex(0x80735a);
    rt.world.hemi.intensity = Math.max(.9, rt.world.hemi.intensity);
    rt.setPhase('brief');
    sfx('siegeDistant', 0.4);
    mainObj(rt, 0);
    // 降らない城へ両口から寄せる。最初の下知と使番の声を重ねない。
    rt.say('森長可', `${nm(rt)}、竹束の陰へ。城兵が寄れば、味方の列で受けよ！`, 4.5);
    rt.after(13, () => {
      if (F.ending || rt.over || F.niFell || !rt.player.u.alive) return;
      rt.say('使番', '夜のうちに小笠原殿の案内で浅瀬を越えた。中将様（信忠）は西の搦手口へ回られた', 5);
    });
    // 紙（battle_events_1101）：武田の城が次々に離れ開く中、高遠だけが降らない。盛信は降れとの使いを拒む。
    rt.after(2, () => { if (!F.ending && !rt.over) rt.say('使番', '木曽が寝返り、伊那の城々は戦わずに開いた。降らぬのは、この高遠だけじゃ', 4.5); });
    rt.after(21, () => { if (!F.ending && !rt.over && !F.niFell) rt.say('使番', '中将様の降れとの使いを、仁科五郎は追い返した。城を枕に戦う気じゃ', 4.5); });
    // 大手五将の一人、毛利長秀（河内守）を控えの脇に。名を頭上に。
    evPerson(rt, 0, '毛利長秀', { x: 152, z: 16 }, -Math.PI / 2, { calm: true, guard: 6 });
    // 松尾の小笠原信嶺：大手の衆を夜の浅瀬へ案内した土地の将（信長公記 巻十五）。寄せ道の北の脇で旗本と控える。
    evPerson(rt, 0, '小笠原信嶺', { x: 132, z: -22 }, -Math.PI / 2, { calm: true, guard: 6 });
    rt.after(6, () => this.assault(rt));
  },

  // ① 軍議で選んだ作戦（無ければ攻めの頭が自分で選ぶ）に沿って、部隊を動かす（C9）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    // 先に城兵の控えが崩れて打って出が無い時も、②を飛ばして③の門へ進める。
    rt.after(15, () => { if (!F.sallyOut && !F.sallyUntil) F.sallyBegun = true; });
    rt.setPhase('assault');
    siegeSignal(rt, 'susume', '進み太鼓と法螺貝：竹束の後ろから大手へ寄せよ');
    // 11/6 六版：信忠は西の搦手（二百歩余り先）にいる。大手の進みの声は森長可の下知だけにし、総大将の声を届かせない。
    announceAdvance(rt, null);
    F.strategy = window.__takatoStrategy || F.strategy || 'ote';
    this.runStrategy(rt, F.strategy);
    for (const c of F.lines) c.go();
    rt.after(12, () => { if (!F.ending) volleyAll(F.lines, 'B'); });
    // 門前の撃ち合いを一度で終えず、寄せの間に硝煙が立ち続けるよう打ち返しを重ねる（10/29 採点：鉄砲の煙が見えない）。
    for (const [t, side] of [[17, 'A'], [22, 'A'], [30, 'A']]) rt.after(t, () => { if (!F.ending) volleyAll(F.lines, side); });
    // 旧い読み口の六十秒待ちに乗せず、寄せの後すぐに第一の山場へ進む。
    // 11/5：大手の寄せ手を厚くしたので、塀際の控えが討ち減る前（十四秒）に打って出る（史実：寄せの始めに城兵が大手へ斬って出た）。
    rt.after(14, () => {   // 十四秒：塀際の斬り合いから門の前の道へ押し出す
      if (F.ending || rt.over || F.sanFell || F.niFell || deadB(F.reserveDef)) return;
      F.sallyOut = true; F.sallyUntil = 0; F.sallyBegun = true;
      // 付け入り（docs/kaito_refs_1103 の山中城の型）：打って出た組の半ばを討てば退き始める。
      F.sallyN = (F.reserveDef.real?.units || []).filter((u) => u.alive && !u.fleeing && !u.woundOut).length;
      // 門前へ出した既存の控えが寄せ手を受ける。門は退く時に開ける。
      for (const q of F.sallyGates) q.passed = false;
      setRoute(F.reserveDef, [this.sallyAim(rt)]);
      // 開始直後の塀際で受けた斬り合いも消さない。
      F.sallyContact ??= 0;
      mainObj(rt, 1);
      rt.say('森長可', '城兵が出たぞ！　味方の槍の列で受けよ。崖へ散るな！', 4);
      markSally(rt);
    });
    rt.after(45, () => {
      if (F.ending || rt.over || F.niFell || deadB(F.nobutada)) return;
      setRoute(F.nobutada, [[-88, 0]]); // 搦手門（x −76）の手前の塀際へ。縦隊の先頭が着けば止まり、旗本は十数m 後ろに固まる
      F.signalReady = true;
    });
    // 陽動の手：どの作戦でも、西の切岸の下へ出て塀際を脅す（決まった的が無いまま hold で待ち続けて、
    // 他家の見張りに「道があるのに20秒動かない」と見つかった兵。kaito 10/1）
    F.yodou.assault = nearWallAssault(rt);
    setRoute(F.yodou, [...ROAD_YODOU]);
    // 11/18 クラウドす（act bot「行けず：231〜250秒 三の丸の備え（歩けない地面）」）：二の丸・本丸の備えと同じく本人に一番近い生きた兵の足元へ
    rt.marker('san', () => guardPinAt(rt, F.sanSpear), '三の丸の備え', { red: true });
    // 本丸の衆と本丸の門の印は、二の丸の守りが崩れてから出す（開戦で札が四つ固まって浮かないように。見回り 10/3）
  },

  // 打って出た城兵の行き先：大手の寄せ場にいる主人公の所。寄せ場の外なら門前の道。
  sallyAim(rt) {
    const p = rt.player.u.pos;
    // 11/13 MB係四：深手で陣へ退く本人を、打って出た城兵が大手の外 x125 まで追い続けて討っていた（act bot 251秒倒れ）。
    //   城兵は門から二十m（x112）より外へは出ず、本人が深手（命半分未満）の時は門前（x97）で構えて追わない。
    const u = rt.player.u, lim = u.hp < u.maxHp * 0.5 ? 97 : 112;
    return p.x > 88 && p.x < 128 && Math.abs(p.z) < 14 ? [Math.min(lim, Math.max(92, p.x)), Math.max(-4, Math.min(4, p.z))] : [97, 0];
  },

  // C9 の四つの作戦：①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で ④二の丸を取って本丸を撃つ
  runStrategy(rt, strat) {
    const F = rt.flags;
    strat = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(strat) ? strat : 'ote';
    F.pushVia = strat;
    // 自分は大手の先手。選ぶのは支え方で、両口の総攻めは必ず行う。
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    setRoute(F.oteSpear, ROAD_OTE.slice(1, 8));
    // 後詰も初めから門へ寄せ、門が開くまで遠方で待たせない。
    F.reserveSent = true;
    setRoute(F.reserve, [[101, 4], ...ROAD_OTE.slice(1, 8)]);
    setRoute(F.oteGun, ROAD_OTE.slice(1, 2));
    F.oteGun._pin = true;
    setRoute(F.karameteSpear, ROAD_KARAMETE.slice(1));
    // 射手は槍の手が門を開くまで尾根で縦隊を保つ。閉じた門へ押し重ならない。
    F.karameteBow.tkGateWait = F.gates.karamete;
    setRoute(F.karameteBow, ROAD_KARAMETE.slice(1, 2));
    if (strat === 'nishi') setRoute(F.nishiLadder, ROAD_NISHI.slice(1));
    // 右上の下知は一行だけ（kaito 10/23 Simple）。添えの下知は出さない。
    rt.say('森長可', '進み太鼓と法螺じゃ！　竹束を先に立て、槍の衆は後へ続け。門へ取り付くぞ', 5);
  },

  // 区域が落ちた（siege_zones.js の onFall）
  // 本丸の備えを崩したら、旗の周りを守って攻め手を通す
  honTaken(rt) {
    const F = rt.flags;
    if (F.honFell || F.ending) return;
    if (!receivedSally(F)) { F.pendingHon = true; return; }
    // 二の丸を取ってから十五秒あけて④→⑤（搦手が先に本丸へ入っていても、右上が同じ一秒に二つ進まない）
    if (!F.niFell || rt.t - (F.niT ?? rt.t) < 15) { F.pendingHon = true; return; }
    F.honFell = true; F.honT = rt.t;
    const zone = F.SZ.byId.hon; zone.owner = zone.state = 'friend'; zone.fallen = true;
    rt.banner('本丸へ攻め入る', '主殿に盛信の近習が籠る');
    mainObj(rt, F.keep.down ? 5 : 4);
    rt.objRemove('support');
    rt.say('森長可', F.keep.down ? '城主は倒れた。旗へ集まれ！　後の兵を通すぞ'
      : F.handKills.hon ? 'そなたの働き、見たぞ。本丸へ続け！　城主は主殿じゃ'
      : '本丸へ入ったぞ！　城主は主殿じゃ。味方と共に押し寄せよ', 4);
    rt.unmark('hon'); rt.unmark('gateHon'); rt.unmark('next');
    rt.marker('rally', F.keep.down ? F.honPost : F.keep.guide,
      F.keep.down ? '味方と本丸の旗を守る' : '主殿の守りを崩す');
    for (const b of [F.oteSpear, F.reserve, F.dan2, F.karameteSpear, ...(F.follows || [])])
      toHonmaru(rt, b, true);
    // 信忠は搦手の塀際に旗本と留まる（本丸の斬り合いへ自ら入らない）。

  },

  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending) return;
    // 別働の先着や城兵の全滅だけで、②を果たしたことにしない。
    if ((id === 'san' || id === 'ni') && !receivedSally(F)) {
      if (id === 'san') F.pendingSan = true; else F.pendingNi = true;
      return;
    }
    // 下知を保留する間は、人数による制圧の記録だけを先に進めない。
    // 二の丸を取った扱いが先行すると、④の途中で守りと地図だけが本丸へ進む。
    if (id === 'ni' && !F.niFell && (!F.sanFell || rt.t - F.sanT < 20)) {
      F.pendingNi = true; return;
    }
    // 人数で押し崩した場合も、縄張りの記録と下知を同じ状態にする。
    const zone = F.SZ.byId[id];
    if (zone && (id === 'san' || (id === 'ni' && F.sanFell))) {
      zone.owner = zone.state = 'friend'; zone.fallen = true;
    }
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true; F.sanT = rt.t; F.sallyUntil = 0; F.sallyOut = false; F.sallyReturning = false;
      // 11/18 K358（見た目 ③）：三の丸を取ったら、寄せ手が曲輪の道の脇に織田の幟を立て並べる（二の丸の前の寄せ手を大軍に見せる）
      for (const [x, z] of [[62, -12], [60, 2], [52, 14], [44, 5], [38, 14], [30, 5], [24, 14], [14, 2], [8, -14], [4, -2]])
        rt.scene.add(nobori(rt.world, x, z, 'oda', 4.8));
      rt.unmark('san'); rt.unmark('sally');
      // 11/6 描いて遊んで：三の丸を取っても大手の物見櫓の射手が床に残り、外の寄せ場の本人と味方を撃ち続けた。
      // 三の丸の内の櫓の射手は床から降り、曲輪へ込み入った寄せ手と斬り結ぶ（降らずに戦う。信長公記）。
      for (const g of rt.army.groups) {
        if (g.team !== 1 || !/櫓の守り$/.test(g.name || '') || !g.anchor || g.anchor.x < 40) continue;
        for (const u of g.units) {
          if (!u.alive || !u.perch) continue;
          u.perch = null;
          let at = null;
          for (let r = 1.5; r <= 15 && !at; r += 1.5) for (let k = 0; k < 12 && !at; k++) {
            const x = g.anchor.x + Math.cos(k * Math.PI / 6) * r, z = g.anchor.z + Math.sin(k * Math.PI / 6) * r, y = rt.world.heightAt(x, z);
            if (x < 75 && F.C.kuruwa.san.test(x, z) && rt.world.walkable(x, z, y)) at = { x, y, z };
          }
          if (!at) { u.perch = { x: u.pos.x, y: u.pos.y, z: u.pos.z }; continue; }
          u.pos.set(at.x, at.y, at.z);
          if (u.mesh) u.mesh.position.copy(u.pos);
        }
        g.aggro = 12;
      }
      if (F.niFell) return;
      if (F.pushVia !== 'ni_bombard') rt.objRemove('support');
      mainObj(rt, 3);
      rt.say('森長可', F.handKills.san ? 'そなたの働きで先手が続いた。次は二の丸の土橋じゃ！'
        : '三の丸を取った！　後の兵も続け。次は二の丸の土橋じゃ', 4);
      // 三の丸の範囲には大手の枡形も入る。途中の隊を土橋へ直行させず、
      // 未通過の折れから続ける。門外の第二陣も、手前の門から順に打つ。
      for (const b of [F.oteSpear, F.reserve, F.dan2]) {
        if (deadB(b)) continue;
        b.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi);
        const next = b._route?.[b._i - 1];
        const pending = next ? ROAD_OTE.findIndex(p => p[0] === next[0] && p[1] === next[1]) : -1;
        const start = pending >= 0 ? Math.min(pending, 7)
          : F.C.kuruwa.san.test(b.pos.x, b.pos.z) ? 7 : 1;
        setRoute(b, ROAD_OTE.slice(start, 10));
      }
      rt.marker('next', GATE_NI, '二の丸の土橋');
      setRoute(F.reserveDef, [[57, 10], [43, GATE_NI.z]]);
      battleEvent(rt, EVENT_REINFORCEMENT, F.reserveDef.pos, F.reserveDef.real, 1, true, '二の丸の門から城兵が押し返す');
    } else if (id === 'hodoin') {
      F.hodoinFell = true;
    } else if (id === 'ni' && !F.niFell) {
      F.pendingNi = false;
      F.niFell = true; F.niT = rt.t;
      // 数分の攻城で昼へ飛ばさず、開戦時の払暁の光と朝靄を保つ。
      rt.unmark('next'); rt.unmark('gateOte'); rt.unmark('sally');
      F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
      rt.banner('二の丸の守りを破る', '最後は本丸。盛信は主殿に籠る');
      mainObj(rt, 4);
      rt.say('森長可', F.handKills.ni ? 'よく守りを崩した。後の兵も続け！　本丸の門へ寄せよ'
        : '二の丸を取ったぞ。土橋へ槍をそろえ、本丸の門へ！', 4);
      rt.marker('next', GATE_HON, '本丸への土橋');
      const road = [[GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
      for (const b of [F.oteSpear, F.reserve, F.dan2, F.karameteSpear, ...(F.follows || [])]) toHonmaru(rt, b);
      // 西の射手は、下の開門確認を経て搦手から続く。
      F.oteGun._pin = false;
      setRoute(F.oteGun, [[77, 0], [72.5, 0], [74.075, -4.5], [74.075, -8], [65, -8], [57, 10], [GATE_NI.x, GATE_NI.z], [-2.125, -8]]);
      setRoute(F.reserveDef, [...ROAD_OTE.slice(7, 10), ...road]);
    } else if (id === 'hon') this.honTaken(rt);
  },

  // 第二の山場は本丸の刀と主殿の近習。台詞だけで守りを消さない。
  lastStand(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (!F.niFell || F.keep.down || F.lordDying) return;
    // 11/18 K358：本丸を取った事になっても内の門が開いていないと、はなが出ず城主の最期へ進めず⑤で止まった（act bot 1080秒）。本丸を取って一分たてば門を問わない
    if (!F.hanaReleased && (F.gates.honInner.opened || F.honFell && rt.t - (F.honT ?? rt.t) > 60) &&
        F.C.kuruwa.hon.test(p.x, p.z) && Math.hypot(p.x - F.hana.pos.x, p.z - F.hana.pos.z) < 12 &&
        Math.abs(p.y - F.hana.pos.y) < 3 && !rt.army.wallBetween(p, -1, F.hana.pos)) {
      F.hanaReleased = true;
      F.hana.noTarget = false; F.hana.aiT = 0; F.hana.perch = null;
      F.hanaGroup.noAI = false; F.hanaGroup.order = 'attack'; F.hanaGroup.aggro = 7;
      rt.banner('本丸の決死の守り', '諏訪勝右衛門の妻はな、刀を抜いて斬って出る');
      rt.say('はな（諏訪勝右衛門の妻）', 'ここは通さぬ。わらわも刀を取る！', 4);
    }
    // 本丸を取って二分半たっても奥の間で対面していなければ、対面した事にする（主殿へ入れず止まらない）
    // 11/18 01:55 毎時の持ち主（act bot：⑤が100〜340秒とぶれ、戦が十一分になる回）：二分半→百秒・四分→百六十秒
    if (F.honFell && F.metLord == null && rt.t - (F.honT ?? rt.t) > 60) F.metLord = rt.t - 5;   // 11/18 夜50-09（act bot 4回で本丸を取ってから⑥まで30〜110秒・戦が十分）：百秒→六十秒
    if (F.honFell && !F.hanaReleased && rt.t - (F.honT ?? rt.t) > 60) { F.hanaReleased = true; if (F.hana) { F.hana.noTarget = false; F.hana.perch = null; } if (F.hanaGroup) { F.hanaGroup.noAI = false; F.hanaGroup.order = 'attack'; } }
    // 11/18 夜50-09（act bot 1080秒：本人が奥の間で盛信の前に立ったまま、はなが本丸の隅で斬り合い続けて⑤が六百秒動かなかった）：本丸を取って百二十秒たてば、はなの決着を待たない（はなは残る城兵として戦い続ける）
    if (!F.honFell || !F.hanaReleased || siegeFighter(F.hana) && rt.t - (F.honT ?? rt.t) < 120 || F.metLord == null || rt.t - F.metLord < 4.5) return;
    // 近習の主力を退ければ最期へ進む。柱や戸口に残った一人の全滅待ちにしない。
    // 対面とはなとの戦いは上で確かめ、残る城兵は最期の後も戦い続ける。
    let guards = 0;
    for (const u of F.lastGuards) if (siegeFighter(u)) guards++;
    if (guards > Math.floor(F.lastGuards.length * .2) && rt.t - (F.honT ?? rt.t) < 75) return;   // 本丸を取って七十五秒（夜50-09：百六十→七十五。act bot で本丸を取ってから⑥まで百十秒かかっていた）たてば残る近習を待たない
    // 奥の間まで攻め入った時だけ最期へ進む。盛信の最期は討ち取りの数・戦功へ渡さない。
    F.lordDying = true; F.lordState = 'last';
    rt.say('仁科盛信', '城はここまでか。降りはせぬ。さらばじゃ', 4);
    mainObj(rt, 5);
    rt.marker('rally', F.honPost, '味方と本丸の旗を守る');
    rt.after(4.5, () => {
      if (F.ending || rt.over || !rt.player.u.alive) return;
      const lord = F.keep.lord;
      if (lord?.alive) { lord.invuln = false; lord.hp = 0; rt.army.kill(lord, null); }
      F.keepFell = true; F.lordState = 'dead';
      for (const d of F.defenders) if (d?.real?.units?.some((u) => u.alive)) d.order({ id: 'attack' });
      rt.say('使番', '仁科五郎、本丸にて果てたり！　残る城兵に備え、旗を守れ', 4);
      nobutadaEnters(rt);
    });
  },

  // 門を越した味方と局地の討ち取りで進む。残る城兵は奥の備えへ退く。
  checkAttrition(rt) {
    const F = rt.flags;
    const held = F.attritionHeld || (F.attritionHeld = {});
    const occupied = (id, foothold = false) => {
      let n = 0, enemy = 0;
      for (const u of rt.army.units) {
        if (!siegeFighter(u) || !F.C.kuruwa[id].test(u.pos.x, u.pos.z) ||
            Math.abs(u.pos.y - rt.world.heightAt(u.pos.x, u.pos.z)) >= 3) continue;
        if (u.team === 0) n++; else enemy++;
      }
      const zone = F.SZ.byId[id];
      if (foothold) return n >= zone.need;
      if (n < zone.need || enemy > 0 || rt.t < zone.quietUntil) { delete held[id]; return false; }
      if (held[id] == null) held[id] = rt.t;
      return rt.t - held[id] >= zone.hold;
    };
    // 11/10 クラウドの流し（携帯の bot）：二の丸の門が開いて本人が二の丸に入り、残る城兵と二百秒斬り合っても、
    //   味方が三人までしか入らず（要るのは四人）討ち取りの数も足りず、刻限まで二の丸が落ちなかった。
    //   門が開いた曲輪に本人が入って七十五秒たてば、残る城兵は奥の備えへ退き、その曲輪は落ちる
    const inside = F.attrInside || (F.attrInside = {});
    const pp = rt.player.u.pos;
    // 味方が要る数だけ曲輪に入って九十秒斬り合っても討ち取りが足りない時も同じ（本人が三の丸で長屋の中の城兵に構えたまま三百秒）
    const footT = F.attrFoot || (F.attrFoot = {});
    const longIn = (id, open) => {
      // 出撃・帰城で閉じた門の向こうを、以前から攻め続けた扱いにしない。
      // 閉門中も呼び、本人と味方が離れた時間の持ち越しを防ぐ。
      if (!open) {
        inside[id] = footT[id] = null; delete held[id];
        return false;
      }
      // 曲輪から退いた時間や、同じ平面位置の堀底で待った時間は制圧に数えない。
      if (siegeFighter(rt.player.u) && F.C.kuruwa[id].test(pp.x, pp.z) &&
          Math.abs(pp.y - rt.world.heightAt(pp.x, pp.z)) < 3) inside[id] ??= rt.t;
      else inside[id] = null;
      if (occupied(id, true)) footT[id] ??= rt.t; else footT[id] = null;
      return inside[id] != null && rt.t - inside[id] >= 75 || footT[id] != null && rt.t - footT[id] >= 90;
    };
    // 搦手門は本丸に通じる。西から二の丸へ出るには、本丸の内外の門も開いている必要がある。
    const niOpen = F.gates.gateNi.opened || F.gates.honOuter?.opened && F.gates.honInner.opened;
    if (!F.sanFell && longIn('san', F.gates.oteInner.opened)) this.onZoneFall(rt, 'san');
    // 11/18 16:55 クラウド持ち主（act bot 1080秒 刻限切れ：③の段で本人が退く城兵を追って二の丸の内 (-17,8) へ抜け、そこで十五分斬り合ったまま
    //   三の丸の落ちる判定が揃わず、任務が三の丸の道 (57,10) を指し続けた）：大手門が開いた後、本人が二の丸・本丸の内で九十秒戦い続けたら三の丸は落ちた事にする
    if (!F.sanFell && F.gates.oteInner.opened && rt.player.u.alive) {
      const pp2 = rt.player.u.pos, beyond = (F.C.kuruwa.ni.test(pp2.x, pp2.z) || F.C.kuruwa.hon.test(pp2.x, pp2.z)) && !F.C.kuruwa.san.test(pp2.x, pp2.z);
      if (beyond) { F.tkBeyondT ??= rt.t; if (rt.t - F.tkBeyondT >= 90) this.onZoneFall(rt, 'san'); } else F.tkBeyondT = null;
    }
    if (!F.niFell && longIn('ni', niOpen)) this.onZoneFall(rt, 'ni');
    // 11/19 07:58 持ち主（act bot 940秒：④が175→539秒の六分＝本人が大手門の外の休み場で息を戻す間、二の丸の落ちる判定が揃わない。④の長さは 126〜364秒とぶれる）：
    //   三の丸を取って三分半たったら、寄せ手の本隊が二の丸の門を押し開け二の丸は落ちた事にする（③の百秒と同じ手。途中から続ける④の済ませ方と同じ）
    if (!F.niFell && F.sanFell && rt.t - (F.sanT ?? rt.t) > 210 && rt.player.u.alive) {
      if (F.gates.gateNi && !F.gates.gateNi.breached && !F.gates.gateNi.opened) F.gates.gateNi._openNow(false);
      this.onZoneFall(rt, 'ni');
      if (F.niFell) { F.guideRoadI = Math.max(F.guideRoadI ?? 1, 8); F.botRoadI = Math.max(F.botRoadI ?? 1, 8); }
    }
    if (!F.honFell && longIn('hon', F.gates.honInner.opened)) this.honTaken(rt);
    if (!F.sanFell && F.gates.oteInner.opened && ((F.pushKills.san >= 6 && occupied('san', true)) || (occupied('san') && deadB(F.sanSpear) && deadB(F.sanGun)))) this.onZoneFall(rt, 'san');
    if (!F.niFell && niOpen && ((F.pushKills.ni >= 5 && occupied('ni', true)) || (occupied('ni') && deadB(F.niSpear)))) this.onZoneFall(rt, 'ni');
    if (!F.honFell && F.gates.honInner.opened && occupied('hon', true) && (F.pushKills.hon >= 5 || deadB(F.honGuard))) this.honTaken(rt);
    // 11/18 K358：本人が本丸の西の塀際（本丸の縁の内）に入ったのに、門の判定が揃わず「寄せ道へ戻る」が塀の向こうを指して
    //   五百秒止まった（act bot）。二の丸を取って四分を過ぎ、本人が本丸の縁の内で九十秒戦い続けたら本丸を取った事にする。
    // 11/19 06:05 持ち主（act bot ⑤が 358・500秒・戦が十三〜十五分）：二の丸を取って四分→二分半、本丸の縁の内で九十→六十秒
    if (!F.honFell && F.niFell && rt.t - (F.niT ?? rt.t) > 150 && rt.player.u.alive) {
      const p = rt.player.u.pos, t = F.C.kuruwa.hon.test;
      const inHon = t(p.x, p.z) || p.x < -44 && HON_EDGE.some(([dx, dz]) => t(p.x + dx, p.z + dz));
      if (inHon) F.tkHonInT ??= rt.t; else F.tkHonInT = null;
      if (F.tkHonInT != null && rt.t - F.tkHonInT >= 60) this.honTaken(rt);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (!canWinTakato(rt)) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon'); rt.unmark('next'); rt.unmark('rally'); rt.unmark('gateOte'); rt.unmark('gateHon'); rt.unmark('sally');
    rt.objDone('main'); rt.objRemove('support');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城を攻め落とした', pts: 24 }; }, '高遠城を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('高遠城、落ちる', '天正十年三月二日。一日の攻めで落城。仁科盛信は最期まで戦ったと伝わる');
    // 高遠の残兵は落城の札の間も抵抗する。締めだけで敗走へ切り替えない。
    for (const b of F.defenders || []) {
      if (b.real) b.real.noRout = true;
      b.order({ id: 'attack' });
    }
    // 11/8 critic60（一7）：勝つ間際の味方が皆、膝を曲げて宙に浮いたように跳ねて駆けていた。落城の札の間は、本物の味方の組を今の所で止めて歩ませる
    for (const g of rt.army.groups || []) if (g.team === 0 && !g.isPlayerSquad && g.count && !g.routed) { const c = g.center(); g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.speed = Math.min(g.speed || 3, 2.2); g.focus = null; }
    rt.say('森長可', '旗を守り通したな。組の者を確かめよ。傷ある者を置いて行くな', 4.5);
    rt.after(5.5, () => rt.say('使番', '落ちのびた者が新府へ走った。二十日は持つと見た城が、一日で落ちたと武田四郎も知ろう', 4.5));
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 東の大手は二つの冠木門を通る。四角い囲いと櫓門は置かない。
  // 今打つ門だけに印を出す。壊れた・開いた門は外し、
  // 奥の門へ切り替える（二つとも済んだら印を消す。確かめで見つけた：両方出ると、どちらを打つか迷う）
  gateMarker(rt, id, pair) {
    // 出撃を受ける間は門へ誘導せず、味方の槍の列を行き先にする。
    const holding = id === 'gateOte' && (rt.flags.sallyOut || rt.flags.sallyUntil);
    const g = holding ? null : pair.find((q) => q.struct.alive && !q.opened);
    const key = id + 'Target';
    if (rt.flags[key] === (g || null)) return;
    rt.flags[key] = g || null;
    if (!g) { rt.unmark(id); return; }
    const mid = { x: (g.struct.seg[0] + g.struct.seg[2]) / 2, z: (g.struct.seg[1] + g.struct.seg[3]) / 2 };
    rt.marker(id, mid, g.name, { h: 4.8 });
  },

  // 目の前の門と曲輪の変化は、その場の下知にする。遠い使番の到着を待たない。
  guideAssault(rt) {
    const F = rt.flags;
    if (F.step < 1 || F.honFell) return;
    mainObj(rt, F.niFell ? 4 : F.sanFell ? 3 : F.sallyOut || F.sallyUntil ? 1
      : F.sallyBegun || F.sallyReturning || F.gates.oteOuter.opened ? 2 : 0);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 11/19 クラウド kaito2（夜50-09 の Opus 宛て・act bot 207秒 ④二の丸の土橋で後続より先に着き、足軽・鉄砲に囲まれ倒れた）：
    //   攻めの段で本人が三人以上（手負いなら二人以上）に囲まれたら、四十五m 内の味方の組（二組）が駆け寄って斬り合う
    if (rt.phase === 'assault' && rt.player?.u?.alive && (F.tsSurT = (F.tsSurT || 0) - dt) <= 0) {
      F.tsSurT = 0.5;
      const me = rt.player.u, P = me.pos;
      let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.abs(u.pos.x - P.x) < 6 && Math.abs(u.pos.z - P.z) < 6 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 5.5) n++;
      if (n >= 3 || (n >= 2 && me.hp < me.maxHp * 0.4)) {
        const ns = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && !g.civ && !g.honjin && g.count >= 4).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9 }; }).filter((x) => x.d < 45 && x.d > 3).sort((a, b) => a.d - b.d).slice(0, 2);
        for (const { g } of ns) if (!(g._rescueT > rt.t)) { g._rescueT = rt.t + 6; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 12; q.seekRange = 16; }; }
      }
    }
    F.coldBreath?.(dt);
    F.rearShadows?.tick(dt);
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const hit = rt.player.lastHit;
    // 同じ守り方の知らせを、被弾のたびに出し直さない。
    if (hit?.ranged && rt.t - hit.t < 2 && !F.gunHelpSaid) {
      F.gunHelpSaid = true; rt.bark('矢玉じゃ！　竹束か門脇の陰へ', true);
    }
    sallyContactTick(rt, dt);
    // 11/13 MB係四：三の丸・二の丸で城兵の備えに囲まれ（囲距1.5〜2.5m・足軽の一突き11）、退く道も塞がれて一人で倒れていた（Mac act bot 205〜267秒）。
    //   本人が三人以上に囲まれて命が六割を切ったら、近くの味方の組（名の無い組・40m 内）を二つまで本人の所へ駆けつけさせる（味方の大軍の中の一人）。
    if ((F._helpT = (F._helpT || 0) - dt) <= 0) {
      F._helpT = 1.5;
      const me = rt.player.u, pp = me.pos;
      let near = 0, foe = null;
      rt.army.forNear(pp.x, pp.z, 4, (o) => { if (o.alive && o.team !== me.team && !o.fleeing && !o.woundOut && !o.isStruct) { near++; foe = foe || o; } });
      // 命が四割を切って囲まれている間は、駆けつけた味方が囲みの外の城兵を受け、本人へ同時に打ち込むのは一人まで（act bot 二回の一回が 216秒で倒れた）
      // ふだんも本人へ同時に打ち込むのは二人まで（稲生・豊臣編と同じ。三の丸の備え百四十に四方から打たれ、act bot 三回に二回 250〜313秒で倒れた）
      // 11/18 20:45 クラウド持ち主（act bot 215秒：③で命41から二人の囲み（侍17・足軽18）に六秒で倒れた。共通の傷の下限0.8で playerTaken 0.6 が効かなくなった）：
      //   命が六割を切ったら、囲みの数を問わず同時に打ち込むのは一人まで・二人に寄られたら味方を呼ぶ（傷の重さは変えない）
      if (rt.world?.def) rt.world.def.playerAtkMax = near >= 2 && me.hp < me.maxHp * 0.6 ? 1 : 2;   // 11/18 01:50 毎時の持ち主：四割→六割（③三の丸で命75から十五秒で倒れた）   // player_pressure.js が毎回 world.def から読む
      if (near >= 2 && me.hp < me.maxHp * 0.6) {
        const gs = rt.army.groups.filter((g) => { if (g.team !== me.team || g.isPlayerSquad || g.routed || !(g.count >= 3) || g._helpPlayer > rt.t || g.units.some((u) => u.isPlayer || u.name)) return false; const c = g.center(); return Math.hypot(c.x - pp.x, c.z - pp.z) < 40; });
        gs.sort((x, y) => { const cx = x.center(), cy = y.center(); return Math.hypot(cx.x - pp.x, cx.z - pp.z) - Math.hypot(cy.x - pp.x, cy.z - pp.z); });
        for (const g of gs.slice(0, 2)) { g._helpPlayer = rt.t + 20; g.order = 'attack'; g.focus = foe; g.path = null; g.dest = null; g.onArrive = null; g.seekRange = Math.max(g.seekRange || 0, 30); g.aggro = Math.max(g.aggro || 0, 12); }
        if (gs.length && !F._helpSaid) { F._helpSaid = true; rt.say('組頭', '囲まれておるぞ！　者ども、助けに行け！', 3); }
      }
      // 11/18 夜50-09（act bot 534秒：主殿の戸口で盛信の旗本に斬られて本丸の外 (−41,−15) へ退いた本人を、旗本の侍が十五歩追って一太刀26で斬り倒した）：
      //   旗本は主殿の戸口を守る者。本丸の外へ退いた本人は追わず、戸口から十二歩より離れたら戸口へ戻る（本丸の中の斬り合いはそのまま）
      const kg = F.keep?.guard, ka = kg?.anchor;
      if (kg && ka && !F.keep.down) for (const o of kg.units || []) {
        if (!o?.alive || !o.pos || o.fleeing || o.woundOut) continue;
        if (Math.hypot(o.pos.x - ka.x, o.pos.z - ka.z) < 12 || F.C.kuruwa.hon.test(pp.x, pp.z)) continue;
        o.target = null; o.atk = null; o.moveTo = { x: ka.x + (Math.random() - 0.5) * 4, z: ka.z + (Math.random() - 0.5) * 4 }; o.aiT = Math.min(o.aiT || 0, 0.4);
      }
    }
    F.stageCheck -= dt;
    F.refresh = F.stageCheck <= 0;
    if (F.refresh) F.stageCheck = 1;
    if (F.gates && F.refresh) {
      if (!F.sanFell && !F.niFell) this.gateMarker(rt, 'gateOte', F.gatePairs.ote);
      if (F.niFell && !F.honFell) this.gateMarker(rt, 'gateHon', F.gatePairs.hon);
      if (F.niFell && !F.honMk && !F.honFell) { F.honMk = true; // 11/18 毎時の持ち主（act bot「行けず：本丸の備え（歩けない地面）」）：備えの真ん中は主殿の壁際に落ちる。本人に一番近い生きた兵の足元へ
        const honAt = () => guardPinAt(rt, F.honGuard);
        rt.marker('hon', honAt, '本丸の備え', { red: true }); }
    }
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    updateGates();
    updateLadders(rt.army, dt);
    // 死傷で味方の全体が四人未満になっても、消えた人数を待たせない。
    // 地域の敵を退ける条件と、確保に要る時間は保つ。
    if (F.refresh) {
      let alive = 0;
      for (const u of rt.army.units)
        if (u.team === 0 && siegeFighter(u)) alive++;
      F.captureNeed = Math.max(1, Math.min(4, alive));
      for (const z of F.SZ.zones) {
        // 共通の制圧は onZoneFall より先に士気・退却・門へ作用する。
        // 下知だけを保留せず、迎撃と曲輪の順序を制圧の入口でも守る。
        const ready = z.id === 'hodoin' || receivedSally(F) &&
          (z.id === 'san' || z.id === 'ni' && F.sanFell && rt.t - F.sanT >= 20 ||
            z.id === 'hon' && F.niFell && rt.t - F.niT >= 15);
        z.need = ready ? Math.max(1, Math.min(z.id === 'hodoin' ? 6 : 4, alive)) : Infinity;
      }
    }
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 1) {
      const bow = F.karameteBow;
      if (!deadB(bow) && bow.tkGateWait?.opened && (F.niFell || F.pushVia === 'karamete')) {
        bow.tkGateWait = null;
        setRoute(bow, ROAD_KARAMETE.slice(1));
      }
      tickRoutes(F.movers); if (F.refresh) this.checkAttrition(rt);
    }
    tkStuck(rt, this.guideMarker?.(rt), BOT_ROAD);   // 段差や堀へ落ちて抜けられない時（takato/stuck.js）
    if (F.refresh) followTick(rt);
    // 11/18 15:50 持ち主（act bot 415秒：大手の後続（織田の後備え）の足軽が大手門の外 (85,-10) で道行きのまま、塀の無い行き先 (85,0) を前に隊速0で二十秒立ち尽くした）：
    //   後続の備えが大手の外（x>78）で十五秒動かなければ、今いる所から道順を下知し直す（人は足さない・減らさない）
    // 11/18 17:05 クラウド持ち主（act bot 260秒：三の丸の段で後続の足軽二人が大手門の内の北 (72,9) で重なり、行き先 (38,14) を前に attack のまま隊速0で二十秒）：
    //   三の丸が落ちる前でも、大手門が開いた後に後続の備えが三の丸の東（x>60）で十五秒動かなければ、三の丸の道（70,-4 → 57,10 → 43,二の丸門）を下知し直す
    // 11/18 17:30 クラウド持ち主（act bot 466秒：三の丸が落ちた後、七人の隊が三の丸の内 (65,9) で重なったまま）：落ちた後も三の丸の東（x>60）を見張り、本丸への道を下知し直す
    // 11/18 17:40 同（act bot 473秒：味方の新手が二の丸 (33,4) で塀の向こう七十m の台所の若衆を的に attack のまま歩み0で二十秒）：三の丸が落ちた後はどの曲輪でも見張り、本丸へ（本丸が落ちた後は奥まで）の道を下知し直す
    // 11/19 01:40 持ち主（act bot 496秒★★十回：三の丸が落ちた後、大手の後詰（河尻）と森の先手の侍が二の丸の東 (10〜16,12) で道行きのまま隊速0で二十秒・本丸の段が七百秒）：
    //   三の丸が落ちた後は、大手の先手・後詰・団の手も同じ見張りに入れる（人は足さない）
    if (F.refresh && (F.sanFell || F.gates.oteInner.opened)) for (const b of [...(F.follows || []), ...(F.sanFell ? [F.oteSpear, F.reserve, F.dan2] : [])]) {
      const g = b?.real;
      if (!g || deadB(b) || (g.order !== 'path' && g.order !== 'attack') || !(b.pos.x > 60 || F.sanFell)) { if (b) b._tkStillT = b._tkStillC = null; continue; }
      // 11/18 21:00 クラウド持ち主（act bot 437秒：後続の足軽が二の丸 (33,4) で塀の向こう六十mの的を持ったまま二十秒）：斬り合いと見るのは的が五m内の時だけ
      // 11/18 22:45 持ち主（act bot 367秒：後続の侍が (85,-10) で行き先 (85,0) を前に二十秒。隊の旗は動き（隊速2.38）兵は動かない）：
      //   隊速でなく兵の真ん中の動きで見る。下知の時から真ん中が二m 動いていなければ止まりと見る
      const cm = g.center?.() || b.pos;
      const moved = b._tkStillC ? Math.hypot(cm.x - b._tkStillC.x, cm.z - b._tkStillC.z) > 2 : false;
      if (moved || g.units.some((u) => u.alive && (u.swing || u.atk?.target?.pos && Math.hypot(u.atk.target.pos.x - u.pos.x, u.atk.target.pos.z - u.pos.z) < 5))) { b._tkStillT = null; b._tkStillC = null; continue; }   // 斬り合っている間は下知し直さない
      if (b._tkStillT == null) { b._tkStillT = rt.t; b._tkStillC = { x: cm.x, z: cm.z }; }
      // 11/18 20:40 クラウド持ち主（act bot 378秒：後続が大手門の外 (93,-1) で道行きのまま、十一m先で斬り合う三の丸の備えを前に二十秒立った）：
      //   十秒動かず、塀の無い十六m内に城兵がいれば、道を下知し直す前にその城兵へ掛からせる（人は足さない）
      if (rt.t - b._tkStillT > 10 && !b._tkFoeT) {
        const c = g.center?.() || b.pos;
        let foe = null, fd = 16;
        for (const o of rt.army.units) {
          if (o.team === g.team || !o.alive || o.fleeing || o.woundOut || o.isStruct || o.noTarget || o.civ || Math.abs(o.pos.y - (c.y ?? o.pos.y)) > 3) continue;
          const d = Math.hypot(o.pos.x - c.x, o.pos.z - c.z);
          if (d < fd && !rt.army.wallBetween(c, g.team, o.pos)) { fd = d; foe = o; }
        }
        if (foe) { b._tkStillT = rt.t - 9; b._tkFoeT = rt.t;   // 掛かっても六秒動かなければ道を下知し直す（act bot 462秒：掛かった城兵が動いて二十秒止まった）
           g.order = 'attack'; g.focus = foe; g.path = null; g.dest = null; g.onArrive = null; g.seekRange = Math.max(g.seekRange || 0, 20); continue; }
      }
      if (b._tkFoeT && rt.t - b._tkFoeT > 20) b._tkFoeT = null;
      if (rt.t - b._tkStillT > 15) { b._tkStillT = null; b._tkStillC = null; if (F.sanFell) toHonmaru(rt, b, F.honFell); else setRoute(b, [[70, -4], [57, 10], [43, GATE_NI.z]]); }
    }
    // 11/10 クラウドの正式の流し：二の丸を取った後、本丸門をだれも打たず（寄せ手は土橋の手前・本人は搦手の側）四百秒止まった。
    //   六十秒後も門を四十五秒打てていなければ、残る隊へ道順と門攻めを下知し直す。
    //   待つだけで門を消したり、まだ起きていない突破を知らせたりしない。
    //   11/18 毎時の持ち主（act bot「本丸門の段で九十秒だれも門を打たない」）：百五十秒・九十秒の待ちを六十秒・四十五秒に。
    // 11/18 18:05 クラウド持ち主（POSLOG：⑤が百七十〜三百八十秒。退く城兵の後で閉め直された本丸門を八十秒余り打てない）：六十秒・四十五秒→四十五秒・三十秒
    if (F.niFell && !F.honFell && !F.ending && rt.t - (F.niT ?? rt.t) > 45) {
      const gs = [F.gates.honOuter, F.gates.honInner].filter((g) => g && !g.opened);
      const hp = gs.reduce((n, g) => n + (g.struct?.hp || 0), 0);
      if (F.tkHonHp !== hp) { F.tkHonHp = hp; F.tkHonHpT = rt.t; }
      if (gs.length && rt.t - F.tkHonHpT > 30) {
        let ordered = false;
        for (const b of [F.oteSpear, F.reserve, F.dan2, F.karameteSpear, ...(F.follows || [])]) {
          if (!b || deadB(b)) continue;
          toHonmaru(rt, b);
          ordered = true;
        }
        F.tkHonHpT = rt.t;
        if (ordered) rt.say('使番', '残る備えも本丸の門へ！　土橋から続け！', 3.4);
      }
    }

    // 西の切岸の梯子：着いた兵を一人ずつ登らせ、守りが時おり押し倒す
    if (F.nishiLadder2 && F.nishiLadder2.hp > 0) {
      for (const u of (F.nishiLadder.real ? F.nishiLadder.real.units : [])) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.group?.routed || u.climb) continue;
        if (Math.hypot(u.pos.x - F.nishiLadder2.x, u.pos.z - F.nishiLadder2.z) < 2.2) startClimb(u, F.nishiLadder2);
      }
      F._kdT = (F._kdT || 0) - dt;
      if (F._kdT <= 0) {
        F._kdT = 6;
        let defender = false;
        for (const u of rt.army.units) if (u.team === 1 && u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct && Math.hypot(u.pos.x - F.nishiLadder2.topX, u.pos.z - F.nishiLadder2.topZ) < 4 && Math.abs(u.pos.y - F.nishiLadder2.y1) < 3) { defender = true; break; }
        if (defender && Math.random() < 0.4) {
          const fallen = knockDown(F.nishiLadder2, rt.army);
          if (fallen && F.pushVia === 'nishi' && !F.ladderFallSaid) {
            F.ladderFallSaid = true;
            rt.say('使番', '西の梯子衆が落とされた！　大手の攻めを緩めるな', 4);
          }
        }
      }
    }
    if (F.pushVia === 'nishi' && F.nishiLadder2?.hp <= 0 && !F.ladderLost) {
      F.ladderLost = true;
      // 倒れた梯子を待たず、既にいる兵を尾根の門へ回す。
      F.nishiLadder.assault = gateAssault(F.gates.karamete);
      if (F.niFell) toHonmaru(rt, F.nishiLadder, F.honFell);
      else if (!deadB(F.nishiLadder)) setRoute(F.nishiLadder, ROAD_KARAMETE.slice(1));
      rt.say('使番', '西の梯子は倒れた。そなたは大手で先手を助けよ', 4);
    }
    // 鉄砲の損害は実際の射撃だけで決める。時刻だけで本丸の兵を減らさない。
    // 段の札は一秒に一度だけ。毎コマ、道や印を作り直さない。
    if (F.step >= 1 && F.refresh) {
      // 三の丸を取ってからでは、先手が減った時に口を越す人数をそろえられない。
      // 外の門が開くか先手が崩れたら、既にいる後詰を同じ道から寄せる。
      if (!F.sanFell && !F.niFell && !F.reserveSent && !deadB(F.reserve) &&
          (F.gates.oteOuter.opened || deadB(F.oteSpear))) {
        F.reserveSent = true;
        F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
        setRoute(F.reserve, ROAD_OTE.slice(1, 8));
      }
      if (F.signalReady && !F.signalGiven && !deadB(F.nobutada) && Math.hypot(F.nobutada.pos.x - KARAMETE.x, F.nobutada.pos.z - KARAMETE.z) < 28) {
        F.signalGiven = true; F.signalT = rt.t;
        battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobutada.pos, F.nobutada.real, 0, true, '中将様が西の塀際へ出られた。両口から押し入れ');
        siegeSignal(rt, 'kakari', '総懸かりの陣太鼓と法螺貝：味方と両口から押し入れ');
        rt.say('使番', '総懸かりの陣太鼓と法螺じゃ！　中将様の下知、「一度に乗り入れよ！」大手も押せ！', 5);
        leanAll(F.lines, 'A', 0.55); volleyAll(F.lines, 'A');
        // 大手の第二陣も総懸かりで寄せ道を駆け上がり、門へ続く。
        if (!deadB(F.dan2) && !F.sanFell) {
          F.dan2.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi);
          // 通り過ぎた折れへ戻さず、未通過の折れから門前（折れ9）まで続ける（8,-6 の詰まり）。
          const nx = F.dan2._route?.[F.dan2._i - 1];
          const pd = nx ? ROAD_OTE.findIndex(p => p[0] === nx[0] && p[1] === nx[1]) : -1;
          setRoute(F.dan2, ROAD_OTE.slice(pd >= 0 ? Math.min(pd, 8) : 0, 10));
        }
      }
      if ((F.sallyOut || F.sallyUntil || F.sallyReturning) && deadB(F.sallyRelief || F.reserveDef)) {
        F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
        if (!F.tsukeiri) for (const q of F.sallyGates) if (!q.gate.breached && !F.DA.usingGate(q.gate)) q.gate.close();
        rt.unmark('sally');
        // 11/19 持ち主（act bot 位置の記録：160秒に打って出た組が尽きて門が閉じ、本人は斬り合い1.5秒・討ち取り3のまま、
        //   ②が百八十秒の待ちまで八十秒止まった（門前 (79,0) で塀ごしの城兵を前に立つだけ））：打って出た組が尽きた時、本人が一度でも斬り合っていれば受けた事にする
        if (!receivedSally(F) && ((F.sallyContact || 0) > 0 || (rt.stats?.kills || 0) > 0)) F.sallyContact = 4;
      }
      // 11/18 21:50 持ち主（act bot 3回に2回：三の丸の将 諏訪勝右衛門が本人の41・99m 先で、八十秒待った後に味方に討たれ、本人の名の手柄0・九分で九人）：
      //   諏訪のとどめは本人の二百m 内なら百五十秒まで本人に残す（共通の heroFinishCap の待ち。命一割五分で止まるだけで、段は止めない）
      //   21:58 次の3回で小山田大学（控え）・小山田昌行（二の丸）が同じく味方に討たれた（41〜96m）→ 三人とも同じ待ちにする
      for (const [b, nm] of [[F.sanSpear, '諏訪勝右衛門'], [F.reserveDef, '小山田大学'], [F.niSpear, '小山田昌行']]) {
        const su = b.real?.units.find((u) => u.name === nm && u.heroReach == null); if (su) { su.heroReach = 200; su.heroWaitS = 150; }
      }
      sallyReliefTick(rt);
      // 11/19 05:40 持ち主（act bot 170〜184秒・03:50 の 215秒も同じ：③で味方の先手・後詰が一人ずつまで減った後、三の丸の備え（諏訪勝右衛門）が
      //   大手門の外 (82〜88,1) へ追い出て、休む印へ下がる本人を四方から突いて倒した）：打って出た組でない間の三の丸の備えは、
      //   大手門の外（x78 より東）へ追わず門の内の持ち場へ戻る（三の丸は落ちるまで守る。本人が門を入れば今まで通り斬り合う）
      // 06:12 追い（直しの後 act bot ②③が 354・370秒に延びた＝備えが門の内に留まり三の丸の落ちる判定が揃わない）：③に入って百秒、大手門が開いていれば三の丸は落ちた事にする
      if (receivedSally(F) && !F.sanFell) { F.tkRecvT ??= rt.t; if (rt.t - F.tkRecvT > 100 && F.gates.oteInner.opened) this.onZoneFall(rt, 'san'); }
      if (receivedSally(F) && !F.sanFell && F.sallyRelief !== F.sanSpear && !deadB(F.sanSpear)) {
        for (const u of F.sanSpear.real.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.pos.x < 78 || u._tkHomeT > rt.t - 1.5) continue;
          u._tkHomeT = rt.t;
          u.target = null; u.atk = null; u.moveTo = { x: 70 + Math.random() * 3, z: -4 + Math.random() * 8 }; u.aiT = 1.5;
        }
      }
      // 11/19 07:45 持ち主（act bot 位置の記録 0726・0728・0732：③に入って百秒で三の丸を落ちた事にした後、④の 170〜300秒に
      //   諏訪の備え十五人と城兵の新手二十人が大手門の外 (88〜103,0) へ追い出て、本人は三〜七人に囲まれ退き続け④の討ち取り0）：
      //   三の丸を取られた後の城兵（諏訪の備え・城兵の新手）は大手門の外（x78 より東）へ追わず、三の丸の内を二の丸へ退きながら戦う
      if (F.sanFell && !F.niFell) {
        for (const g of rt.army.groups) {
          if (g.team !== 1 || !(g === F.sanSpear?.real || g === F.sanGun?.real || g._rsv || g.isReserve || g.name === '新手')) continue;
          for (const u of g.units) {
            if (!u.alive || u.fleeing || u.woundOut || u.perch || u.pos.x < 78 || u._tkHomeT > rt.t - 1.5) continue;
            u._tkHomeT = rt.t;
            u.target = null; u.atk = null; u.moveTo = { x: 62 + Math.random() * 6, z: -2 + Math.random() * 8 }; u.aiT = 1.5;
          }
        }
      }
      // 11/19 05:50 持ち主（act bot 直しの後の3回のうち2回：③で大手門の外の寄せ道の休み場 (85〜103,0〜14) へ下がった本人を、
      //   三の丸の塀の上の鉄砲が十三〜二十六m から撃ち続けて倒した（受けた傷の六割が塀の鉄砲・125と70））：三の丸が落ちる前、
      //   命六割より下で大手門の外（x78 より東）にいる本人は塀の鉄砲が狙わない（ほかの寄せ手を撃つ。弾の傷の値は変えない）
      if (!F.sanFell && !deadB(F.sanGun)) {
        const P = rt.player.u;
        // 一斉射の号令は組の間を越えるので、構えた的が本人なら外す（一秒ごとの見回り。構えは〇・九秒より長い）
        if (P.alive && P.pos.x > 78 && P.hp < P.maxHp * 0.6) {
          F.sanGun.real.playerAimAt = rt.army.time + 1;
          for (const u of F.sanGun.real.units) {
            if (!u.alive || u.atk?.target !== P && u.target !== P) continue;
            if (u.atk?.target === P) { u.atk = null; u.shotWarnUntil = 0; }
            u.target = null; u.aiT = 2;
          }
        }
      }
      // 出撃後の追い直し・損耗・帰城も、代わって出た組を使う。
      const sallyTroops = F.sallyRelief || F.reserveDef;
      // 門へ着く前から半平面の向こうにいる兵もいる。曲がった道の該当の門を抜けてから閉める。
      if (F.sallyOut && !sallyTroops._route && !deadB(sallyTroops)) {
        F.sallyOut = false; F.sallyUntil = rt.t + 55;   // 11/18 K358（司令塔：段を短く）：打って出た城兵が門前に留まるのを九十→五十五秒（act bot がここで三回に一度倒れた）
      }
      if (F.sallyOut || F.sallyUntil || F.sallyReturning) for (const q of F.sallyGates) {
        if (q.passed || q.gate.breached || F.DA.usingGate(q.gate)) continue;
        if (sallyTroops._route && sallyTroops._i < (F.sallyReturning ? q.backAfter : q.outAfter)) continue;
        const s = q.gate.struct; let passed = true;
        for (const u of sallyTroops.real?.units || []) {
          if (!u.alive || u.fleeing || u.woundOut) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (!passed) continue;
        q.passed = true;
        // 付け入り：退く城兵の後ろに自分か味方が続いていれば、門を閉め切れず、そのまま開いて残る。
        if (F.sallyReturning && q.gate !== F.gates.gateNi) {
          let close = 0;
          const pp = rt.player.u.pos;
          if (rt.player.u.alive && Math.hypot(pp.x - q.x, pp.z - q.z) < 12) close = 9;
          for (const u of rt.army.units) {
            if (close >= 3) break;
            if (u.team === 0 && siegeFighter(u) && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 7) close++;
          }
          if (close >= 3) {
            if (!F.tsukeiri) {
              F.tsukeiri = true;
              rt.say('森長可', '門を閉めさせるな！　退く城兵に紛れて、三の丸へ押し入れ！', 4);
            }
            continue;
          }
        }
        q.gate.close();
      }
      // 11/6 critic60：打って出た城兵は主人公の居る所へ寄せ直し、主人公と斬り合った秒を数える（② は主人公が受けて済む）。
      if ((F.sallyOut || F.sallyUntil) && !F.sallyReturning && !deadB(sallyTroops)) {
        const pp = rt.player.u.pos;
        let far = true, near8 = false;
        for (const u of sallyTroops.real.units) {
          if (!u.alive || u.fleeing || u.woundOut) continue;
          const d = Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z);
          if (d < 8) near8 = true;
          if (d < 3.5 && Math.abs(u.pos.y - pp.y) < 2 &&
              !rt.army.wallBetween(pp, -1, u.pos)) far = false;
        }
        // 11/18 クラウドす（act bot 89秒「味方の槍の列」に着いて六秒なにも起きない）：打って出たまま（退く刻の前）でも、
        //   本人の八歩の内に城兵が三秒いなければ本人の所へ寄せ直す。
        if (near8 || F.sallyUntil) F._sallyLoneT = rt.t;
        const lone = F.sallyOut && rt.t - (F._sallyLoneT ??= rt.t) > 3;
        if (far && !sallyTroops._route && (F.sallyUntil || lone) && rt.t >= (F.sallyAimT || 0)) {
          const aim = this.sallyAim(rt);
          // 受ける刃が届く三歩半まで寄せる。深手で陣へ退く本人は追わない。
          // 同じ持ち場へ下知し続けず、歩く先が変わった時だけ寄せ直す。
          F.sallyAimT = rt.t + 4;
          if (Math.hypot(sallyTroops.real.anchor.x - aim[0], sallyTroops.real.anchor.z - aim[1]) > 2)
            setRoute(sallyTroops, [aim]);
        }
      }
      // 打って出た組の半ばを討てば、城兵は門の内へ退き始める（待つだけの九十秒にしない）。
      if ((F.sallyOut || F.sallyUntil) && F.sallyN && !deadB(sallyTroops)) {
        const left = (sallyTroops.real?.units || []).filter((u) => u.alive && !u.fleeing && !u.woundOut).length;
        if (left <= F.sallyN / 2) { F.sallyOut = false; F.sallyUntil = rt.t; }
      }
      // 11/13 MB係四：打って出た城兵が味方に討たれて尽き、本人の斬り合いが三秒で止まったまま、②が十八分終わらなかった（Mac act bot 1080秒・跡 s1u c3）。
      //   退く刻から六十秒たって本人が一度でも斬り合っていれば、受けた事にする（城兵はもう門の外にいない）。
      if (F.sallyUntil && rt.t - F.sallyUntil > 60 && (F.sallyContact || 0) > 0 && !receivedSally(F)) F.sallyContact = 4;
      // 11/14 MB係四：退く刻が立たないまま（sallyUntil 0）②が十八分続いた（act bot 跡 s1c3k6・本人は門前で無傷）。②に入って本人が斬り合った後、百八十秒で受けた事にする
      if (F.step >= 1 && !F.sanFell && !receivedSally(F) && (F.sallyContact || 0) > 0) { F._sallyWaitT ??= rt.t; if (rt.t - F._sallyWaitT > 180) F.sallyContact = 4; }
      // 主人公が打って出た城兵と斬り合うまで（四秒）、城兵は退かない。総懸かりだけでは交戦の代わりにしない。
      if (F.sallyUntil && rt.t >= F.sallyUntil && receivedSally(F)) {
        for (const q of F.sallyGates) if (!q.gate.breached) q.gate._openNow(false);
        F.sallyUntil = 0; F.sallyReturning = true;
        for (const q of F.sallyGates) { q.side = -q.side; q.passed = false; }
        rt.unmark('sally');
        setRoute(sallyTroops, [[77, 0], [72.5, 0], [74.075, -4.5], [74.075, -8], [65, -8], [57, 10], [GATE_NI.x, GATE_NI.z], [-2.125, -8]]);
        battleEvent(rt, EVENT_RETREAT, sallyTroops.pos, sallyTroops.real, 1, false, '打って出た城兵が門の内へ退く');
        if (!F.sanFell) {
          mainObj(rt, 2);
          rt.say('森長可', '城兵が退くぞ！　追え、門を閉めさせるな！', 4);
          // 大手の先手と後詰も、退く城兵の後ろから門へ続く。
          for (const b of [F.oteSpear, F.reserve]) if (!deadB(b)) {
            b.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
            setRoute(b, ROAD_OTE.slice(1, 8));
          }
        }
      }
      // 本人の交戦を待つ間は城兵を追わせ続ける。時間で三の丸を確定すると交戦を数えられなくなる。
      if (F.pendingSan && receivedSally(F)) { F.pendingSan = false; this.onZoneFall(rt, 'san'); }
      // 別働が先に入っていても、三の丸と二の丸の目標を同じ瞬間に済ませない。
      if (F.pendingNi && F.sanFell && rt.t - F.sanT >= 20) { F.pendingNi = false; this.onZoneFall(rt, 'ni'); }
      if (F.pendingHon && F.niFell) this.honTaken(rt);
      // 城兵が退くために門を開けただけでは、一番乗りと知らせない。
      // 森の先手が奥の門を越し、三の丸へ実際に入った時に一度だけ。
      if (!F.kagamiSaid && F.gates.oteInner.opened && !F.sanFell &&
          F.oteSpear.real?.units.some((u) => siegeFighter(u) &&
            F.C.kuruwa.san.test(u.pos.x, u.pos.z) &&
            u.pos.x < ROAD_OTE[5][0] &&
            Math.abs(u.pos.y - rt.world.heightAt(u.pos.x, u.pos.z)) < 3)) {
        F.kagamiSaid = true;
        rt.say('使番', '森殿の家中、各務元正が一番乗りじゃ！　続け！', 4);
      }
      this.guideAssault(rt);
      // 右上は段の一行だけ。人数・秒の進み具合は出さない（kaito 三1・五1）。
      if (rt.t - F.stepT > 300 && !F.lastPush) {
        F.lastPush = true;
        rt.say('森長可', '控えも続け！　ここで退くな。残る備えを押し崩すのじゃ', 4);
        if (!deadB(F.reserve)) {
          if (F.honFell || F.niFell) {
            toHonmaru(rt, F.reserve, F.honFell);
          } else {
            F.reserve.assault = F.sanFell ? gateAssault(F.gates.gateNi) : gateAssault(F.gates.oteOuter, F.gates.oteInner);
            setRoute(F.reserve, ROAD_OTE.slice(1, F.sanFell ? 10 : 8));
          }
        }
        leanAll(F.lines, 'A', 0.8);
      }
    }
    if (F.refresh) {
      // 自分の命と寄せ手の戦力は別。壊滅してから初めて知らせず、後詰が残る間に伝える。
      if (!F.oteBrokenSaid && deadB(F.oteSpear) && !deadB(F.reserve)) {
        F.oteBrokenSaid = true;
        rt.say('使番', '大手の先手が崩れた。後詰の槍の列で城兵を受けよ。一人で追うな', 5);
      }
      for (const b of F.localTroops) if (deadB(b) && !b.tkRouted) {
        b.tkRouted = true;
        if (b.light) b.light.rout();
      }
      if (F.keep.down && !F.lordDown) {
        F.lordDown = true;
        // 城主が果てても降らずに戦う。旗を守る⑥の途中で敗走させない。
        for (const b of F.defenders) if (b.real) {
          b.real.noRout = true;
          b.order({ id: 'attack' });
        }
        rt.marker('rally', { x: -52, z: 0 }, '味方と本丸の旗を守る');
        if (F.honFell) mainObj(rt, 5);
      }
      // 総懸かりは大手の停滞を解く援護。曲輪の制圧は実際の進軍と戦闘で決める。
      if (F.step >= 1 && !F.honFell && (rt.t - F.stepT >= 300 || F.signalT != null && rt.t - F.signalT >= 60) && !F.allIn) {
        F.allIn = true;
        // 時間だけで大手門・二の丸門を破壊しない。既存の寄せ手が門を打つ。
        rt.say('使番', '総懸かりの下知じゃ！　両口の味方と門を押し破れ！', 4);
      }
      // 奥の間で城主と向き合うまでは、時間だけで最期へ飛ばさない。
      const pp = rt.player.u.pos, lp = F.keep.lord?.pos;
      if (F.honFell && F.metLord == null && lp &&
          Math.hypot(pp.x - lp.x, pp.z - lp.z) < 5 && Math.abs(pp.y - lp.y) < 2 &&
          (F.keep.naka ? rt.player.u.naka === F.keep.naka.id + 1 : true) && !rt.army.wallBetween(pp, -1, lp)) {
        F.metLord = rt.t;
        rt.say('仁科盛信', '武田の一門、仁科五郎盛信なり。この城、渡しはせぬ', 4);
      }
      // 時間だけで未達にしない。寄せ手の備えが全て崩れた時に退く。
      if (F.step >= 1 && !F.keep.down && !F.keepFell && F.lordState !== 'dead' &&
          rt.canFailMission() && deadB(F.oteSpear) && deadB(F.reserve) &&
          deadB(F.karameteSpear) && deadB(F.nobutada) && (F.attackers || []).every(deadB)) {
        F.ending = true;
        rt.setPhase('end'); rt.objRemove('support'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
        for (const id of ['san', 'hon', 'next', 'rally', 'gateOte', 'gateHon', 'sally']) rt.unmark(id);
        rt.banner('先手が崩れた。退け', '後の備えへ退き、味方の旗に集まれ');
        siegeSignal(rt, 'nobiki', '退き太鼓と低い法螺貝：後の備えへ退き、味方の旗へ集まれ');
        rt.say('森長可', '退き太鼓じゃ！　追うな。味方の旗へ集まれ。手負いも連れて行け！', 5);
        rt.player.u.invuln = true;
        rt.finish({ failureReason: '門へ進む味方が崩れ、攻めを続けられなくなった' }, 8); return;
      }
    }
    if (F.keep) F.keep.tick();
    if (F.refresh) this.lastStand(rt);
    // 時間だけで勝ちにはしない。本丸内で旗を守り、最後の備えを崩して決着。
    if (F.honFell) {
      const p = rt.player.u.pos;
      // 城主の最期の後は、本丸の内なら旗から十八m まで「旗の下」とする（喰違いの内で味方に詰まっても締まる）。
      const reach = F.keep.down || F.keepFell || F.lordState === 'dead' ? 18 : 14;
      const near = siegeFighter(rt.player.u) && Math.hypot(p.x - F.honPost.x, p.z - F.honPost.z) < reach &&
        F.C.kuruwa.hon.test(p.x, p.z) && Math.abs(p.y - F.honPost.y) < 3 &&
        !rt.army.wallBetween(p, -1, F.honPost);
      const need = F.captureNeed || 4;
      let enemy = 0, friend = 0;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 1 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) enemy++;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 0 && Math.hypot(u.pos.x - F.honPost.x, u.pos.z - F.honPost.z) < 14 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z) &&
            Math.abs(u.pos.y - rt.world.heightAt(-52, 0)) < 3 &&
            !rt.army.wallBetween(u.pos, -1, F.honPost)) friend++;
      // 11/5 kaito 三3「全部果たしたら、その場で締めて数秒で勝利」：盛信の最期の後は、旗の下に着いて十二秒で締める
      // （残る城兵の数や集まる味方の数で、着いた後に百秒余り待たせない）。
      if (near && (F.keep.down || F.keepFell) && (enemy === 0 || F.pushKills.hon >= 5 || friend >= Math.min(need, 1) || F.lordState === 'dead')) F.honHold += dt;
      else F.honHold = Math.max(0, F.honHold - dt);
      if (F.honHold >= 12) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    // 死傷は部隊の通常の集計に任せる。局地の一人を全軍の数十人へ換算しない。
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) {
      // 11/18 19:50 持ち主（act bot：大手門の前で本人が四人討っても②が百八十秒明けなかった）：槍の届く六m まで、
      //   また大手門の外（x>78）で討った城兵は、組の名に関わらず打って出た城兵を受けた事にする
      if ((sallyFoe(F, v) || v.pos.x > 78) && k === rt.player.u && !F.sanFell &&
          Math.hypot(v.pos.x - k.pos.x, v.pos.z - k.pos.z) < 6 &&
          Math.abs(v.pos.y - k.pos.y) < 2 && !rt.army.wallBetween(k.pos, -1, v.pos)) F.sallyPlayerKill = true;
      F.ek = (F.ek || 0) + 1;
      // 自分と味方の討ち取りを共に数える。別の口・奥の守りの討ち取りは流用しない。
      const id = F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san';
      const local = F.C.kuruwa[id].test(v.pos.x, v.pos.z);
      if (id === 'san' && local && k === rt.player.u && siegeFighter(k) &&
          F.C.kuruwa.san.test(k.pos.x, k.pos.z) &&
          Math.abs(k.pos.y - rt.world.heightAt(k.pos.x, k.pos.z)) < 3 &&
          Math.abs(v.pos.y - k.pos.y) < 2 && !rt.army.wallBetween(k.pos, -1, v.pos))
        F.sallyInteriorKills = (F.sallyInteriorKills || 0) + 1;
      const guard = id === 'san' ? v.group === F.sanSpear.real || v.group === F.sanGun.real || v.group === F.reserveDef.real
        : id === 'ni' ? v.group === F.niSpear.real || v.group === F.hodoinSpear.real : v.group === F.honGuard.real;
      if (local || guard) {
        F.pushKills[id]++;
        if (k && k.team === 0 && (k.isPlayer || k.isSub || k.isTomo)) F.handKills[id]++;
      }
    } else F.ak = (F.ak || 0) + 1;
  },
  // 崩れた知らせは共通の戦況へ任せ、同じ隊の台詞を重ねない。
};

// 開戦時の総勢の目安。近い一組の死傷から全軍の残数を逆算しない。
takato_siege.force = () => ({ a: 30000, a0: 30000, b: 3000, b0: 3000 });
takato_siege.sides = { a: { name: '織田軍（およそ三万人）', mon: 'oda' }, b: { name: '武田軍（およそ三千人）', mon: 'takeda' } };
takato_siege.holdUnstack = true;   // 11/18 クラウドす（act bot 141秒 西の搦手の手（弓）13人が門の開くのを待つ hold のまま (-82,-2) に15組重なる★★）：共通の渦の散らし（depth_reserve.js holdUnstack）を使う
takato_siege.famous = []; // 両将は持ち場に最初からいる。別の隊へ追加しない。
takato_siege.date = (rt) => '天正十年三月二日　早春・明け方';
// 自害の伝えと土の城の参考：伊那市『高遠城跡の魅力をご紹介』
// https://www.inacity.jp/kurashi/shogaigakushu_bunka/bunkazai/takatojyoseki.html
takato_siege.history = '信長公記巻十五によれば、天正十年三月二日の明け方、森長可・団平八・河尻秀隆・毛利河内守・小笠原信嶺らが大手へ、信忠は「尾続き」から搦手へ寄せた（尾続きを東の月蔵山への尾根と読み、大手を川の側とする説もある。ここは伊那市の解説に従い、大手を東・搦手を西に置いた）。大手では城兵が打って出て数刻戦い、信忠自身も柵を破り塀へ上がって突入を命じた。両口の兵が城内で激しく戦い、城兵は最後まで戦い、その日のうちに落城した。信長公記は、討ち取った首に仁科五郎（盛信）の名を挙げる。討ち死にとも読める。自害したとも伝わる。これは後の甲陽軍鑑の系統や地元の伝えで、伊那市の解説も紹介する。降伏の使いを断った話も後の軍記に伝わる。信長公記には記されない。信濃史料は兼見卿記ほかも挙げて三月二日の落城を記す。兵数には諸説ある。伊那市の解説は数千の城兵が数万の軍勢と戦ったとする。表示は信忠約三万・城兵約三千を目安とし、信長公記の確定数ではない。諏訪勝右衛門の妻はなが刀を取って戦ったという話は伝えで、居場所や衣、台詞は推定である。落城の時刻や当日の天気も同書には記されない。戦国期の大手は東、搦手は西。七曲輪の名称は伊那市の保存活用計画を参考にした。現存する縄張りは江戸時代の改修を含む。曲輪の並び・比高・空堀は『史跡高遠城跡二の丸Ⅱ』第3図の測量図を基準にし、曲輪の平面寸法は実長の半分に縮めた。搦手は図に無く、西の本丸側に遊び用の口を残した。南の三峰川と北の藤沢川は城の西側で合流する。川筋は戦場に収めた推定である。曲輪・川・門・館の位置や寸法、段差、天気、竹束・梯子・鉄砲の下知、武将の台詞は遊びのための推定復元。近い兵は各備えの前の一組だけで、総勢の全員を城内へ置くものではない。遊びの都合で二の丸の床は本丸よりわずかに高く、鉄砲は見通せる城兵を撃つ。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';
takato_siege.history += '\n当代記（江戸の初め・作者は諸説）は、高遠の城主を保科弾正とし、裏の口から退いたと書く。信長公記が首の名に仁科五郎を挙げるのと食い違う。城に誰がいたかは史料で揺れる（docs/sources/todaiki.md）。';   // K323 一次史料の照らし合わせ（docs/sources/）

// 軍議（gungi.js・C6）：城を回して見て、作戦を一つ選ぶ【城19〜22・68】
takato_siege.gungi = (rt) => {
  const F = rt.flags;
  if (!rt.G.lord) return null; // 足軽は全軍の攻め方を選ばず、森の下知に従う。
  const G = {
    center: { x: -2.125, z: 0 }, dist: 130,
    // 束31：info を足し、押すと短い札が出るように（俯瞰の説明）
    landmarks: [
      { name: '大手門', x: OTE.x, z: OTE.z, info: '東の正門。森長可の先手が西へ攻める' },
      { name: '搦手門', x: KARAMETE.x, z: KARAMETE.z, info: '西の細い口。信忠の旗本が東へ攻め入る' },
      { name: '三の丸', x: 57, z: 0, info: '大手門のすぐ内。城兵が多い' },
      { name: '二の丸', x: 0, z: 0, info: '空堀と土橋の内。土塁と木の柵で守る' },
      { name: '勘助曲輪', x: -92, z: -36, info: '本丸の北西。本丸より一段低い' },
      { name: '笹曲輪', x: -68, z: 36, info: '本丸の直ぐ下。一段低い小さな曲輪' },
      { name: '南曲輪', x: -43, z: 38, info: '本丸の南東。空堀の先に法幢院曲輪' },
      { name: '法幢院曲輪', x: -36, z: 66, info: '城の南の端。馬道で二の丸の下へ出る' },
      { name: '本丸', x: -56, z: 0, info: '最後の備え。堀と土橋を越えて旗の周りを取る' },
      { name: '西の切岸', x: NISHI_X, z: 8, info: '道が狭く、梯子でしか登れない' },
    ],
    nawabari: F.K,
    lines: [
      { name: '三の丸', owner: '敵' }, { name: '法幢院曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '織田信忠の旗本', group: () => F.nobutada && F.nobutada.real, nominal: () => (F.nobutada ? F.nobutada.aliveNominal() : 0) }],
    routes: [
      { id: 'ote', name: '両口から寄せ、大手を厚くする' },
      { id: 'karamete', name: '両口から寄せ、搦手を支える' },
      { id: 'nishi', name: '別働は西の梯子へ、大手を攻める' },
      { id: 'ni_bombard', name: '二の丸へ鉄砲を進め、城兵を討つ' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '三の丸の備え', known: false },
      { name: '法幢院曲輪の備え', known: false },
      { name: '二の丸・本丸の備え', known: false },
    ],
    cinema: { attackers: { x: 145, z: 0 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: F.honGuard ? F.honGuard.pos.x : -56, z: F.honGuard ? F.honGuard.pos.z : 0 } },
    onStart: (assign) => takato_siege.onGungiStart(rt, assign),
  };
  // F9：bot・sim で確かめる時、作戦を渡していれば window.__takatoStrategy で決め打ち。
  // 渡していなければ（AI どうしの確かめ）軍議の札を出さず、攻めの頭（siege_ai.js）に選ばせる
  if (window.__takatoStrategy) { takato_siege.onGungiStart(rt, { main: window.__takatoStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
takato_siege.onGungiStart = (rt, assign) => { rt.flags.strategy = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(assign?.main) ? assign.main : 'ote'; };

// 素直な遊び手：敵へ向かって戦い、無ければ大手へ
// 喰違いの口と土橋を省かず通る。道と門の対応は準備時に一度だけ作る。
const BOT_ROAD = [...ROAD_OTE.slice(0, 11), [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
const BOT_GATES = { 2: 'oteOuter', 4: 'oteInner', 8: 'gateNi', 10: 'honOuter', 12: 'honInner' };
// 決着後も喰違いと土橋を逆にたどる。殿から四十歩の直線では、柵や空堀へ突き当たる。
takato_siege.botWithdraw = (rt, inp, { goTo }) => {
  const F = rt.flags, p = rt.player, pos = p.u.pos;
  if (F.botWithdrawI == null) {
    let best = Infinity, index = -1;
    const probe = F.botWithdrawProbe || (F.botWithdrawProbe = { x: 0, y: 0, z: 0 });
    probe.y = pos.y;
    for (let i = 0; i < BOT_ROAD.length; i++) {
      const w = BOT_ROAD[i], d = Math.hypot(w[0] - pos.x, w[1] - pos.z);
      if (d >= best) continue;
      probe.x = w[0]; probe.z = w[1];
      if (rt.army.wallBetween(pos, -1, probe) || !rt.world.walkable(probe.x, probe.z, pos.y)) continue;
      best = d; index = i;
    }
    // 口がまだ見えない時は次の判断で探す。城外の遠い一点へ向けて走らせない。
    if (index < 0) return;
    F.botWithdrawI = index;
  }
  let w = BOT_ROAD[F.botWithdrawI];
  if (F.botWithdrawI > 0 && Math.hypot(w[0] - pos.x, w[1] - pos.z) < .5)
    w = BOT_ROAD[--F.botWithdrawI];
  goTo(p, inp, w[0], w[1], .3);
};
// 斬り合いや別の口から入った時も、実際に着いた曲輪まで道順を引き継ぐ。
// 開いていない門は飛ばさない。表は準備前に一度だけ作り、人と自動の案内で共用する。
const ROAD_ZONES = [
  { id: 'san', end: 7 }, { id: 'ni', end: 9 }, { id: 'hon', end: BOT_ROAD.length - 1 },
];
// 人も遊び手も喰違いの道順を使う。追撃で道を外れたら、今の道へ戻してから進む。
// 戻り先は支度時の二つの入れ物へ書き、毎コマ位置や配列を作らない。
function roadTarget(rt, key, target) {
  const F = rt.flags, p = rt.player.u.pos;
  const end = F.niFell ? BOT_ROAD.length - 1 : F.sanFell ? 9 : 7;
  // 押し合いで任務が往復しないよう、外れる幅と戻れた幅を分ける。
  const returnWidth = target.returning ? 2 : 4;
  target.returning = false;
  let i = F[key] ?? 1;
  let open = true, checked = 2;
  for (const reached of ROAD_ZONES) {
    if (reached.end > end) break;
    for (; checked <= reached.end; checked++) {
      const gate = F.gates[BOT_GATES[checked]];
      if (gate && gate.struct.alive && !gate.opened) { open = false; break; }
    }
    if (!open) break;
    if (F.C.kuruwa[reached.id].test(p.x, p.z)) {
      i = Math.max(i, reached.end);
      F[key] = i;
    }
  }
  // 最後の折れを抜けて曲輪へ入ったら、広場で城兵を退ける。
  // 最後の印の一点へ近づくために、敵と柵の間を往復させない。
  const zone = F.C.kuruwa[F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san'];
  if (i >= end && zone.test(p.x, p.z)) {
    F[key] = end + 1; target.gate = null; return null;
  }
  // 11/2 win_1102b：bot が本丸へ入った後に門の外へ押し出されると、道を歩き終えた扱いのまま立ち止まり、
  //   四百秒の交代で負けた（4回に1回）。曲輪の外で最後の印から離れていれば、最後の喰違いから歩き直す。
  // 手動の行き先も同じ道へ戻す。歩き終えた主殿前を直接指すと、本丸の塀と空堀を横切らせてしまう。
  if (i > end && !zone.test(p.x, p.z) &&
      Math.hypot(p.x - BOT_ROAD[end][0], p.z - BOT_ROAD[end][1]) > 8) { i = Math.max(1, end - 3); F[key] = i; }
  while (i <= end) {
    const gate = F.gates[BOT_GATES[i]], closed = gate && gate.struct.alive && !gate.opened;
    const prev = BOT_ROAD[i - 1], next = BOT_ROAD[i];
    let x = next[0], z = next[1];
    if (closed) {
      const s = gate.struct, mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const side = Math.sign((prev[0] - mx) * s.nx + (prev[1] - mz) * s.nz) || 1;
      x = mx + s.nx * side * 1.5; z = mz + s.nz * side * 1.5;
    } else {
      // 11/18 17:35 クラウド持ち主（act bot：印「寄せ道の曲がり角」に着いても、喰違いに詰まった味方に阻まれ一歩半の内へ入れず六秒止まった）：
      //   次の折れまで塀が無ければ、二歩半の内で次の折れへ進める（塀越しの近道はしない）
      const d = Math.hypot(p.x - x, p.z - z), nx = BOT_ROAD[i + 1];
      if (d < 1.5 || (d < 2.5 && nx && i < end && !rt.army.wallBetween?.(p, -1, { x: nx[0], y: p.y, z: nx[1] }))) { F[key] = ++i; continue; }
    }
    const dx = x - prev[0], dz = z - prev[1];
    const l2 = dx * dx + dz * dz || 1;
    const along = ((p.x - prev[0]) * dx + (p.z - prev[1]) * dz) / l2;
    // 竹束に続いて既に通った直線の目印へ、後戻りさせない。折れを横切って省く事はしない。
    if (!closed && along >= 1 && Math.abs((p.x - prev[0]) * dz - (p.z - prev[1]) * dx) / Math.sqrt(l2) < 1.5) {
      F[key] = ++i; continue;
    }
    const t = Math.max(0, Math.min(1, along));
    const rx = prev[0] + dx * t, rz = prev[1] + dz * t;
    let safeWidth = returnWidth;
    // 土橋の縁は広場と同じ四メートルまで許すと、堀へ下りた後も門へ進めと案内してしまう。
    for (const bridge of BRIDGES) {
      const bx = bridge.b[0] - bridge.a[0], bz = bridge.b[1] - bridge.a[1], bl2 = bx * bx + bz * bz;
      const along = ((rx - bridge.a[0]) * bx + (rz - bridge.a[1]) * bz) / bl2;
      if (along >= 0 && along <= 1 && Math.abs((rx - bridge.a[0]) * bz - (rz - bridge.a[1]) * bx) / Math.sqrt(bl2) < .1)
        safeWidth = Math.min(safeWidth, bridge.w / 2 - .5);
    }
    target.gate = closed ? gate.struct : null;
    if (Math.hypot(p.x - rx, p.z - rz) > safeWidth) {
      target.x = rx; target.z = rz; target.gate = null; target.returning = true;
    } else { target.x = x; target.z = z; }
    // 11/6 描いて遊んで：二の丸の門の脇の塀の外に押し出された主人公へ、塀の向こうの道の点を
    // 「味方と旗 20m」と示し続け、塀に突き当たって百八十秒動けず ⑥ に間に合わなかった。
    // 塀・柵が間にある時は、手前の通れる道の点（門・喰違いの角）まで戻して示す。
    if (rt.army.wallBetween && rt.army.wallBetween(p, -1, { x: target.x, y: p.y, z: target.z })) {
      for (let j = i - 1; j >= 1; j--) {
        const q = BOT_ROAD[j];
        // 今立つ点（門の真ん中など）は飛ばし、さらに手前の通れる角を探す。
        // ここで探索を止めると、塀の向こうを指したまま動けなくなる。
        if (Math.hypot(p.x - q[0], p.z - q[1]) < 3) continue;
        if (!rt.army.wallBetween(p, -1, { x: q[0], y: p.y, z: q[1] })) {
          target.x = q[0]; target.z = q[1]; target.gate = null; target.returning = true; break;
        }
      }
    }
    return target;
  }
  // 道を歩き終えた曲輪の中では城兵を退ける。広場の戦いを、古い角へ戻す案内で中断しない。
  // 切岸の外へ出た時だけ道へ戻す。曲輪へ入る前の喰違いは省かない。
  if (zone.test(p.x, p.z)) { target.gate = null; return null; }
  const last = BOT_ROAD[end];
  if (key === 'guideRoadI' && Math.hypot(p.x - last[0], p.z - last[1]) > returnWidth) {
    target.x = last[0]; target.z = last[1]; target.gate = null; target.returning = true;
    return target;
  }
  return null;
}

// 11/15 クラウドし：本丸を取った後、南の口（-58,23）や西の塀際（-76,-10）に立つと本丸の外と見なされ、
//   「寄せ道へ戻る」が二の丸の土橋 (-45,-8) を指して塀に阻まれ、act bot が百〜百五十秒立ち尽くした（⑤が二百〜五百秒）。
//   門のある東の縁を除き、本丸の縁から三m の内は本丸の内として主殿への印を出す。
const HON_EDGE = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]];
function inHonEdge(F, p) {
  const t = F.C.kuruwa.hon.test;
  return t(p.x, p.z) || p.x < -44 && HON_EDGE.some(([dx, dz]) => t(p.x + dx, p.z + dz));
}
takato_siege.guideMarker = (rt) => {
  const F = rt.flags;
  if (F.ending || rt.over) return null;
  if (F.tkRecovery) return 'tk-recover';
  // 味方が先に本丸を取っても、外にいる自分は土橋と門を通る。
  // 主殿を直接指すと、二の丸の塀へ突き当たってしまう。
  // 本丸の内では、城主が生きている間も主殿への印を使う。
  // 制圧時に消した「hon」を選ぶと、奥の間への案内が途切れる。
  if (F.honFell && inHonEdge(F, rt.player.u.pos)) return 'rally';
  if (F.sallyOut || F.sallyUntil) return 'sally';
  if (rt.G.lord && !F.honFell) return F.niFell ? 'gateHon' : F.sanFell ? 'next' : 'gateOte';
  const target = roadTarget(rt, 'guideRoadI', F.roadGuide);
  if (!target) return F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san';
  // 遠い門の打ち場より、手前の折れを先に示す。門前に着いた時だけ掛矢へ切り替える。
  return target.gate && rt._gg?.cur === target.gate &&
    Math.hypot(rt.player.u.pos.x - target.x, rt.player.u.pos.z - target.z) < 4 ? '_gate' : 'oteRoad';
};
// 歩く向きはそのまま、体と画面は (x, z) へ向ける。前へ歩く時は何もしない。
function botWalkFacing(p, inp, x, z) {
  if (!inp.k.has('KeyW')) return;
  const u = p.u, walk = p.yaw, face = Math.atan2(x - u.pos.x, z - u.pos.z), turn = walk - face;
  if (Math.cos(turn) > 0.3) return;
  p.yaw = face; inp.k.delete('KeyW');
  if (Math.cos(turn) < -0.3) inp.k.add('KeyS');
  if (Math.sin(turn) > 0.3) inp.k.add('KeyA');
  else if (Math.sin(turn) < -0.3) inp.k.add('KeyD');
}
takato_siege.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  b.botFollowingTaba = false;
  if (!u.alive || F.ending) return;
  // 下知の前に単独で門へ走り込まず、味方と同じ寄せの合図を待つ。
  if (F.step < 1) {
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
    // 下知を待つ間も、門前の城兵が斬りかかって来たら向き直って受ける（棒立ちで斬られない）。
    const near = b.army.nearestEnemy(u, 4, (o) => !o.isStruct && !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3);
    if (near) {
      if (p.lock && p.lock !== near) inp.e.add('KeyQ');
      p.yaw = Math.atan2(near.pos.x - u.pos.x, near.pos.z - u.pos.z);
      patientStrike(p, inp, near, Math.hypot(near.pos.x - u.pos.x, near.pos.z - u.pos.z), true);
    }
    return;
  }
  // 大手の先手が竹束を運び、据えて撃ち合う間は、その陰から寄せる。
  // 構えだけでは鉄砲を防げない。目の前の城兵には従来どおり応戦する。
  // 先手が敵に向き直ると竹束も後ろへ回る。据え直しを待ち続けず、寄せの後は門の道順へ戻る。
  if (b.t - F.stepT < 30 && !F.gates.oteOuter.opened && F.gates.oteOuter.struct.alive &&
      !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    const it = F.TA && F.TA.items.find((it) => it.g === F.oteSpear);
    if (it && it.st !== 'free') {
      let tb = null, bd = Infinity;
      for (const t of it.tabas) {
        // 中央の切れ目の両脇の束から寄せの位置を読む。歩くのは道の芯のまま。
        if (Math.abs(t.z - OTE.z) > 4) continue;
        const d = Math.hypot(t.x - u.pos.x, t.z - u.pos.z);
        if (d < bd) { tb = t; bd = d; }
      }
      if (tb) {
        b.botFollowingTaba = true;
        inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
        goTo(p, inp, tb.x - Math.sin(tb.rot) * 1.4, OTE.z, 0.5);
        // 竹束より前へ出た時は、門を向いたまま竹束の陰へ下がる（25秒の写真が味方の背と木ばかりにならないように）。
        botWalkFacing(p, inp, OTE.x - 20, OTE.z);
        return;
      }
    }
  }
  // 門の途中から曲輪の敵へ直進すると、喰違いの口を飛ばして壁際で撃たれ続ける。
  // 近い打ち手には応戦し、遠い敵を追うのは同じ曲輪へ入ってから。
  let here = null;
  if ((F.botRoadI ?? 1) > 7) {
    for (const k of F.botKuruwa) if (k.test(u.pos.x, u.pos.z)) { here = k; break; }
  }
  // 三の丸では先手の列から離れて城兵を追わない。敵の人数と寄せは変えない。
  let mate = null, mateDistance = 24;
  if (here) for (const o of b.army.units) {
    if (o === u || o.team !== u.team || !o.alive || o.fleeing || o.woundOut || o.rearWound ||
        o.noTarget || o.isStruct || o.downed || o.civ || o.farSim || o.group?.isRunner ||
        o.group?.hidden || o.group?.routed ||
        o.type === 'gun' || o.type === 'bow' || o.type === 'porter' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || !here.test(o.pos.x, o.pos.z)) continue;
    // 番所へ入った味方を、曲輪を確保する前の合流先にしない。
    if (!F.honFell && nakaFind(o.pos.x, o.pos.z)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < mateDistance && !b.army.wallBetween(u.pos, -1, o.pos)) { mate = o; mateDistance = d; }
  }
  // 近い敵の隙を突く間も、横から自分へ打ち込む兵を先に受ける。
  // この戦は性格の頭が構えを上書きしないため、ここで実際の打ち手へ向く。
  // 二の丸の乱戦では、近い侍の溜めより先に横の槍が届く。
  // 距離だけで構える相手を決めず、実際に刃が届くまでの時を比べる。
  let attacker = null, impact = Infinity, attackDistance = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.isStruct || o.fleeing || o.woundOut || o.noTarget ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const charge = o.charging && o.target === u;
    if (!(o.atk && !o.atk.ranged && !o.atk.bow && o.atk.target === u) && !swing && !charge) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 柵を越して届く槍も受ける。通れない事と、武器が届く事は分ける。
    if (d > 8 || b.army.wallBetween(o.pos, -1, u.pos,
        (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
    if (soon < impact || soon === impact && d < attackDistance) {
      attacker = o; impact = soon; attackDistance = d;
    }
  }
  // 11/18 K358（main の流しで寄せ道の曲がり角に立ったまま足軽に斬られ続け、突き1で倒れた）：上の判定で拾えない打ち手
  //   （竹束・柵越しに届く槍など）でも、二秒内に本人を実際に斬った者が四歩内にいれば、その者へ向き直って応戦する
  const lh = p.lastHit;
  if (!attacker && lh && !lh.ranged && b.t - lh.t < 2 && lh.source?.alive && lh.source.pos && lh.source.team !== u.team &&
      !lh.source.fleeing && Math.abs(lh.source.pos.y - u.pos.y) < 3 &&
      Math.hypot(lh.source.pos.x - u.pos.x, lh.source.pos.z - u.pos.z) < 4) attacker = lh.source;
  const e = attacker || b.army.nearestEnemy(u, 12, (o) => !o.isStruct && !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false) &&
    // 戸口の敵への応戦は残し、届かない室内の敵に誘われて列を離れない。
    // 11/6：本丸を取った後、二の丸の長屋の中の城兵に誘われ、外壁に詰まって主殿へ行けなかった。室内の敵を追うのは本丸の内だけ。
    ((F.honFell && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (p.weapon === 'sword' ? 1.6 : 2.5) ||
      !nakaFind(o.pos.x, o.pos.z)) &&
    // 城外では逃げる兵を坂へ追わない。道の外から実際に打つ兵には上の判定で応戦する。
    (here || (o.pos.x >= OTE.x && o.pos.x <= 119 && Math.abs(o.pos.z - OTE.z) < 4)) &&
    (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4 ||
      (F.honFell && !F.keep.down && F.C.kuruwa.hon.test(u.pos.x, u.pos.z) &&
        F.C.kuruwa.hon.test(o.pos.x, o.pos.z) && (o === F.hana || F.lastGuards?.includes(o)) &&
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 8) ||
      ((F.sallyOut || F.sallyUntil) && sallyFoe(F, o) && o.pos.x >= OTE.x && Math.abs(o.pos.z - OTE.z) < 4) ||
      (here && mateDistance < 6 && here.test(o.pos.x, o.pos.z) &&
        Math.hypot(o.pos.x - mate.pos.x, o.pos.z - mate.pos.z) < 6)) &&
    // 主殿の柱や調度越しに見える守兵へ直進できなくても、戸口への道は歩き続ける。
    // 刃が届く相手と、実際にこちらを打つ相手への応戦は残す。
    (!F.honFell || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (p.weapon === 'sword' ? 1.6 : 2.5) ||
      clearFoot(b, o.pos) && localClear(b.army, u.pos, o.pos, true)));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 間合い外の城兵を待つ間に列から取り残されない。打ち込みと届く敵への応戦は続ける。
    if (!attacker && d > (p.weapon === 'sword' ? 1.6 : 2.5) && here && mate &&
        mateDistance > 5 && !F.honFell &&
        (mate.pos.x - u.pos.x) * (e.pos.x - u.pos.x) +
          (mate.pos.z - u.pos.z) * (e.pos.z - u.pos.z) <= 0 &&
        clearFoot(b, mate.pos) && localClear(b.army, u.pos, mate.pos, true)) {
      if (p.lock) inp.e.add('KeyQ');
      inp.leftPressed = false; inp.chargeHold = false;
      goTo(p, inp, mate.pos.x, mate.pos.z, 3);
      inp.runHeld = inp.k.has('KeyW');
      return;
    }
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 四歩以内の敵にも列の支えを確かめる。近いだけで追うと塀際へ誘い出される。
    // 退き先が見つからない深手・息切れでも、ここから追撃を再開しない。
    const reach = p.weapon === 'sword' ? 1.6 : 2.5;
    // 最後の守兵は八歩まで詰める。味方が離れた時、四歩外の近習を
    // 無視して城主の前で待つと、守兵を倒す決着条件を果たせない。
    const inHon = F.honFell && F.C.kuruwa.hon.test(u.pos.x, u.pos.z) &&
      F.C.kuruwa.hon.test(e.pos.x, e.pos.z) &&
      (d < 4 || !F.keep.down && (e === F.hana || F.lastGuards?.includes(e)) && d < 8);
    if (!attacker && d > reach && here && (inHon || mateDistance < 6) &&
        ((F.honFell && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) || !nakaFind(e.pos.x, e.pos.z)) &&
        here.test(e.pos.x, e.pos.z) && (inHon || Math.hypot(e.pos.x - mate.pos.x, e.pos.z - mate.pos.z) < 6) &&
        u.hp >= u.maxHp * .6 && p.sta >= p.maxSta * .35 && !(p.guardBroken > 0) &&
        clearFoot(b, e.pos) && localClear(b.army, u.pos, e.pos, true))
      goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 長い振りかぶりを受け続けるだけでは、気力を失い反撃も出ない。
    // 別の打ち手がいない時だけ、普通の突きが先に届く隙を使う。
    let opening = true;
    for (const other of b.army.threats || []) {
      if (other === e || !other.alive || other.fleeing || other.woundOut || other.noTarget ||
          other.type === 'gun' || other.type === 'bow' || Math.abs(other.pos.y - u.pos.y) >= 3) continue;
      const gap = Math.hypot(other.pos.x - u.pos.x, other.pos.z - u.pos.z);
      if (gap < 8 && !b.army.wallBetween(other.pos, -1, u.pos,
          (other.wpnKind || other.lookWeapon) === 'spear' && gap <= other.reach + 0.3)) {
        opening = false; break;
      }
    }
    patientStrike(p, inp, e, d, opening);
    return;
  }
  inp.guardHold = false;
  if (F.tkRecovery) {
    goTo(p, inp, F.tkRecovery.x, F.tkRecovery.z, .5);
    inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  // 出撃を受ける下知の間は、門や遠い城兵へ進まず味方の槍の列へ戻る。
  // 目の前の打ち手への応戦は上で済ませる。退く城兵を追って列から離れない。
  if (F.sallyOut || F.sallyUntil) {
    const receiver = sallyReceiver(b);
    const distance = Math.hypot(receiver.x - u.pos.x, receiver.z - u.pos.z);
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
    if (receiver && distance > 3) {
      goTo(p, inp, receiver.x, receiver.z, 2);
      // 11/2 写真（25秒）：列へ戻る間に打って出た城兵へ背を向け、画面が味方の背と木ばかりになっていた。
      //   出撃の兵を向いたまま、横・後ろへ歩いて列へ戻る（教えの「敵を向いて退け」と同じ）。
      const foe = b.army.nearestEnemy(u, 20, (o) => !o.isStruct && !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3);
      if (foe) botWalkFacing(p, inp, foe.pos.x, foe.pos.z);
    }
    return;
  }
  // 近い打ち手がいない時に先手へ戻る。三の丸の奥へ一人で進み直さない。
  if (here && mate && mateDistance > 5 && !F.honFell) {
    goTo(p, inp, mate.pos.x, mate.pos.z, 3);
    inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  if (F.honFell && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) {
    const rally = F.keepFell || F.keep.down;
    const target = rally ? F.honPost : F.keep.guide();
    // 主殿の道案内は曲がり角の六十五センチ以内で次へ進む。
    // 一・五メートル手前で止めると、戸口や奥の間の途中で永久に待ってしまう。
    goTo(p, inp, target.x, target.z, rally ? 1.5 : .35);
    return;
  }
  // 本丸を味方が先に取っても、案内と同じ道順で土橋と喰違いを通る。
  // 横座標だけで西の点へ向けると、二の丸の西端（−17,−13）から柵を横切ろうとして止まる。
  // 道外では道の上へ戻し、壁を挟む時は手前の折れへ戻す。時刻だけで次の折れへ飛ばさない。
  const target = roadTarget(b, 'botRoadI', F.botRoadTarget);
  // 閉じた門へ一人で先に着くと、櫓と塀の上から撃たれ続ける。味方の衆が門へ寄るまで、その列の中で待つ。
  // 開いた口の先に城兵が固まっている時（二の丸の備えなど）も同じ。味方の槍が先に入るまで、列の中で待つ。
  let foes = 0;
  if (target && !target.gate) for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.downed || o.woundOut || o.rearWound || o.noTarget || o.isStruct || o.group?.hidden || o.group?.routed || Math.abs(o.pos.y - u.pos.y) > 3) continue;
    if (Math.hypot(o.pos.x - target.x, o.pos.z - target.z) < 12 && ++foes >= 3) break;
  }
  // 深手でも待つ時の上限を通す。ここで戻ると、味方が尽きた後も同じ場所で止まり続ける。
  if (target?.gate || foes >= 3) {
    let near = 0, mate = null, md = Infinity;
    for (const o of b.army.units) {
      if (!o.alive || o.team !== u.team || o === u || o.fleeing || o.downed || o.woundOut || o.rearWound || o.noTarget || o.isStruct || o.group?.hidden || o.group?.routed || o.group?.isRunner || o.type === 'porter') continue;
      if (Math.abs(o.pos.y - u.pos.y) > 3) continue;
      if (!F.honFell && nakaFind(o.pos.x, o.pos.z)) continue;
      if (Math.hypot(o.pos.x - target.x, o.pos.z - target.z) < 10) near++;
      const g = o.group;
      if (g === F.oteSpear.real || g === F.reserve.real || !target.gate && o.type !== 'gun' && o.type !== 'bow') {
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < md) { md = d; mate = o; }
      }
    }
    // 味方を待つのは一つの的につき二十秒まで（味方が減ると、門の前で待ち続けて戦が止まる）。
    const waitKey = target.gate || Math.round(target.x / 8) + ',' + Math.round(target.z / 8);
    if (F.botWaitFor !== waitKey) { F.botWaitFor = waitKey; F.botWaitT = b.t; }
    if (b.t - F.botWaitT < 20 && near < (target.gate ? 3 : u.hp < u.maxHp * 0.6 ? 5 : 3) &&
        (foes >= 3 && u.hp < u.maxHp * 0.35 || mate && Math.hypot(mate.pos.x - target.x, mate.pos.z - target.z) > 6)) {
      if (mate && md > 3) goTo(p, inp, mate.pos.x, mate.pos.z, 2);
      return;
    }
  }
  // 11/13 MB係四：⑤で二の丸の空堀の脇（−7,12）から道の点（−41,−8）へ真っすぐ押し続け、切岸に阻まれて八百秒動けなかった（act bot）。
  //   六秒同じ所に留まったら、近い順に道の点を一つずつ四秒ずつ試して道へ乗り直す。
  if (target && !(target.gate && Math.hypot(u.pos.x - target.x, u.pos.z - target.z) < 2.5)) {   // 門を掛矢で叩く間は動かさない
    // 11/14 MB係四：「寄せ道へ戻る」の印の四〜七歩手前で塀に阻まれ、二歩の升目を行き来して数え直し、五百秒動けなかった（act bot 4回中2回）。
    //   升目を四歩にし、詰まったら一度は道探し（mountainWay）で回り込む
    const cell = Math.round(u.pos.x / 4) + ',' + Math.round(u.pos.z / 4);
    if (F.botRoadCell !== cell) { F.botRoadCell = cell; F.botRoadCellT = b.t; F.botRoadTry = 0; }
    if (F.botRoadAlt && b.t < F.botRoadAlt.until) {
      const foot = F._botFoot || (F._botFoot = { id: 0, group: null, pos: { x: 0, y: 0, z: 0 } });   // 本人のままでは道探しが素通しを返す
      foot.pos.x = u.pos.x; foot.pos.y = u.pos.y; foot.pos.z = u.pos.z;
      const w = F.botRoadAlt.way ? mountainWay(b.army, foot, F.botRoadAlt.way, true) : null;
      goTo(p, inp, w ? w.x : F.botRoadAlt.pt[0], w ? w.z : F.botRoadAlt.pt[1], 1); return;
    }
    if (b.t - F.botRoadCellT > 6 && F.botRoadTry % 2 === 0) {
      F.botRoadTry++; F.botRoadCellT = b.t;
      F.botRoadAlt = { pt: [target.x, target.z], way: { x: target.x, z: target.z }, until: b.t + 5 };
      return;
    }
    if (b.t - F.botRoadCellT > 6) {
      const order = BOT_ROAD.map((q) => [q, Math.hypot(q[0] - u.pos.x, q[1] - u.pos.z)]).filter(([, d]) => d > 2.5).sort((m, n) => m[1] - n[1]);
      const pt = order[(F.botRoadTry++) % Math.min(4, order.length)]?.[0];
      F.botRoadCellT = b.t;
      if (pt) { F.botRoadAlt = { pt, until: b.t + 4 }; goTo(p, inp, pt[0], pt[1], 1); return; }
    }
  }
  if (target) {
    const { x, z, gate: t } = target;
    goTo(p, inp, x, z, 0.6);
    if (t && Math.hypot(u.pos.x - x, u.pos.z - z) < 1) {
      const mx = (t.seg[0] + t.seg[2]) / 2, mz = (t.seg[1] + t.seg[3]) / 2;
      p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z);
      // 槍の空振りを重ねず、画面で案内している掛矢を使う。
      // 門前へ歩き続けないので、柱への挟まりと突きの連続音も防ぐ。
      inp.k.delete('KeyW'); inp.leftPressed = false; inp.chargeHold = false;
      const it = b.nearestInteract();
      if (it?.id === '_gram' && b._gg?.cur === t) inp.k.add('KeyE');
    }
  }
};

// 11/18 K358（cloud-30 の見回り「十分で本人の討ち取り4・味方87」）：寄せ手の味方が先に城兵を討ち、本人の前に敵が来なかった。
//   本人の十八歩の内で味方と斬り合う城兵を、二秒ごとに二人まで本人へ向ける（本人を狙う者は三人まで。台本の打って出・本丸の守りは今のまま）
{
  const up = takato_siege.update;
  takato_siege.update = function (rt, dt) {
    up.call(this, rt, dt);
    const F = rt.flags, me = rt.player?.u;
    if (!me?.alive || F.ending || rt.over || rt.G?.lord) return;
    if ((F.tkDrawT = (F.tkDrawT || 0) - dt) > 0) return;
    F.tkDrawT = 2;
    // 11/18 K358（act bot 526秒：西の搦手の備えの弓二人が本人の3m先で六秒なにもしなかった）：同じ高さで本人の四歩の内に寄られた射手は脇差を抜いて斬り合う
    for (const u of F.hodoinSpear?.real?.units || []) {
      if (!u.alive || u.fleeing || u.sidearm || (u.type !== 'bow' && u.type !== 'gun')) continue;
      if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 4 || Math.abs(u.pos.y - me.pos.y) > 1.2) continue;
      u.perch = null; rt.army.drawSidearm(u); u.target = me; u.aiT = Math.min(u.aiT || 0, 0.3);
    }
    // 11/18 クラウドす（act bot 443秒：三の丸の備えの足軽が塀の向こう24m の本人を狙ったまま (-41,22) で二十秒動かなかった）：
    //   本人を狙う槍・刀の城兵が十歩より遠く、間に塀があって二秒前から動いていなければ、狙いを外して近くの寄せ手と組ませ直す
    for (const o of rt.army.units) {
      if (!o.alive || o.team === me.team || o.target !== me || o.isStruct || o.fleeing || o.perch || o.climb || o.type === 'bow' || o.type === 'gun') { if (o) o._tkWp = null; continue; }
      const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z), w = o._tkWp;
      o._tkWp = { x: o.pos.x, z: o.pos.z };
      if (d < 10 || !w || Math.hypot(o.pos.x - w.x, o.pos.z - w.z) > 0.5 || !rt.army.wallBetween(me.pos, -1, o.pos)) continue;
      o.target = null; o.atk = null; o.moveTo = null; o.aiT = Math.min(o.aiT || 0, 0.2); o._tkWp = null;
    }
    // 11/18 K358（act bot 461秒：三の丸を取った後、大手門の外 (80,-15) に残った諏訪の備えの九人が、塀の内の退き道へ向かったまま一点に重なり二十秒止まった）：
    //   三の丸を取った後、門の外（x 75 より東）で十五秒動けない三の丸の城兵は、取り残された者として東の山へ散って逃げる
    if (F.sanFell) for (const b of [F.sanSpear, F.sanGun]) for (const u of b?.real?.units || []) {
      if (!u.alive || u.fleeing || u.perch || u.name || u.pos.x < 75) continue;
      const q = u.tkCut || (u.tkCut = { x: u.pos.x, z: u.pos.z, t: rt.t });
      if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 1.5) { q.x = u.pos.x; q.z = u.pos.z; q.t = rt.t; continue; }
      if (rt.t - q.t < 15) continue;
      u.fleeing = true; u.fleeT = rt.t; u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
    }
    // 11/18 04:50 持ち主（act bot 541秒：三の丸の備え（諏訪）の侍が本丸の外 (-38,-3) で塀の向こうの行き先へ move のまま／504秒：二の丸の備え（小山田）の
    //   足軽が的を持ったまま、ともに二十秒動かない）：曲輪を取られた後、門の内（x 75 より西）で十五秒動けない備えの槍・刀の城兵は、塀の無い二十五歩内の
    //   寄せ手（本人の外）と斬り合わせる（鉄砲・弓も向けると本人が撃たれて倒れた）。相手がいなければ退く（人は足さない・消さない）
    // 11/18 16:45 クラウド持ち主（act bot 360秒★★ 3回：諏訪の侍が本丸門の前 (-41,-11) で、塀の向こう六十m 先の団忠正の手を的（atk）に持ったまま止まり、上の見直しに入らなかった）：
    //   的が六m より遠い打ちかかり（atk）は止まりとして見直す
    for (const [fell, bs] of [[F.sanFell, [F.sanSpear, F.sanGun]], [F.niFell, [F.niSpear, F.hodoinSpear]]]) {
      if (!fell) continue;
      for (const b of bs) for (const u of b?.real?.units || []) {
        // 11/19 06:45 持ち主（act bot 234秒★★ 4回：三の丸を取られた後、将の諏訪勝右衛門本人が二の丸 (17,-18) で塀の向こう三十六m の団忠正の手へ
        //   attack のまま二十秒立った＝名のある者はこの見直しから外れていた）：名のある将も見直す。相手がいなければ逃がさず本丸の縁へ退かせる
        if (!u.alive || u.fleeing || u.perch || u.woundOut || u.pos.x >= 75 || (u.atk && !(u.atk.target?.pos && Math.hypot(u.atk.target.pos.x - u.pos.x, u.atk.target.pos.z - u.pos.z) > 6)) || u.swing || u.type === 'gun' || u.type === 'bow') continue;
        const q = u.tkIn || (u.tkIn = { x: u.pos.x, z: u.pos.z, t: rt.t });
        if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 1.5) { q.x = u.pos.x; q.z = u.pos.z; q.t = rt.t; continue; }
        if (rt.t - q.t < 15) continue;
        q.t = rt.t;
        let foe = null, fd = 25;
        for (const a of rt.army.units) {
          if (!a.alive || a === me || a.team === u.team || a.isStruct || a.fleeing || a.woundOut || a.civ || Math.abs(a.pos.y - u.pos.y) > 2.5) continue;
          const d = Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z);
          if (d < fd && !rt.army.wallBetween(u.pos, u.team, a.pos)) { fd = d; foe = a; }
        }
        if (foe) { u.target = foe; u.moveTo = null; u.atk = null; u.aiT = Math.min(u.aiT || 0, 0.2); }
        else if (u.name) { u.target = null; u.atk = null; u.moveTo = { x: -44 - Math.random() * 3, z: -9 + Math.random() * 3 }; u.aiT = 4; }
        else { u.fleeing = true; u.fleeT = rt.t; u.target = null; u.atk = null; u.aiT = 0; }
      }
    }
    // 11/18 K358（司令塔：味方の組が駆け寄る）：打って出た城兵と斬り合う間（三の丸を取るまで）、本人が三人以上に囲まれたら、
    //   四十歩の内の寄せ手の味方（斬り合っていない者）を八人まで本人の脇へ駆け寄らせる
    // 11/18 追い（main の流しで退く途中に打って出た足軽に背から突かれ続けて倒れた）：命が六割を切って二秒内に斬られた時も駆け寄らせる
    const lhP = rt.player?.lastHit;
    // 11/18 司令塔（高遠は 3/3 が線。深手で退く途中に三の丸・二の丸の備えに削られて倒れる）：命が二割を切ったら、
    //   三十歩の内の寄せ手の味方（弓・鉄砲を除く）を六人まで、本人と一番近い打ち手の間（本人から二歩、敵の側）へ割り込ませ、
    //   その打ち手を相手にさせる（本能寺の小姓衆の受けと同じ作り。受ける傷の値と敵の数は変えない）
    if (me.hp < me.maxHp * 0.45 && (F.tkGuardT = (F.tkGuardT || 0) - 2) <= 0) {
      F.tkGuardT = 1;
      let foe = null, fd = 9;
      for (const o of rt.army.units) {
        if (!o?.alive || !o.pos || o.team === me.team || o.isStruct || o.fleeing || o.woundOut || o.civ || Math.abs(o.pos.y - me.pos.y) > 2.5) continue;
        if (!(o.target === me || o.atk?.target === me || o.swing?.target === me)) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d < fd) { fd = d; foe = o; }
      }
      if (foe) {
        const k = 2 / Math.max(fd, 0.5), gx = me.pos.x + (foe.pos.x - me.pos.x) * k, gz = me.pos.z + (foe.pos.z - me.pos.z) * k;
        let sent = 0;
        for (const o of rt.army.units) {
          if (sent >= 6) break;
          if (!o?.alive || !o.pos || o.team !== me.team || o === me || o.isStruct || o.fleeing || o.woundOut || o.civ || o.type === 'gun' || o.type === 'bow') continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d > 30 || Math.abs(o.pos.y - me.pos.y) > 2.5) continue;
          o.moveTo = { x: gx + (Math.random() - 0.5) * 2, z: gz + (Math.random() - 0.5) * 2 }; o.target = foe; o.aiT = Math.min(o.aiT || 0, 0.3); sent++;
        }
        if (foe.target === me && sent >= 2) { const g = rt.army.units.find((o) => o?.alive && o.team === me.team && o !== me && o.target === foe && Math.hypot(o.pos.x - foe.pos.x, o.pos.z - foe.pos.z) < 4); if (g) { foe.target = g; foe.aiT = Math.min(foe.aiT || 0, 0.3); } }
      }
    }
    // 11/18 毎時の持ち主（三回に一回、二の丸の門の内で退く三の丸の備えと二の丸の備えに挟まれ倒れた）：二の丸を取るまで続ける
    // 11/18 夜50-09（act bot 387・477秒：⑤本丸門の前で門を打つ間に本丸の仁科盛信の衆と旗本に削られ倒れた）：本丸を取るまで続ける
    if (!F.honFell && (me.mobbed || (me.hp < me.maxHp * 0.6 && lhP && !lhP.ranged && rt.t - lhP.t < 2))) {
      let sent = 0;
      for (const o of rt.army?.units || []) {
        if (sent >= 8) break;
        if (!o?.alive || !o.pos || o.team !== me.team || o === me || o.isStruct || o.fleeing || o.woundOut || o.civ || o.type === 'gun' || o.type === 'bow') continue;
        if (o.atk && o.target?.alive && o.target.pos && Math.hypot(o.target.pos.x - o.pos.x, o.target.pos.z - o.pos.z) < 3) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d < 6 || d > 40) continue;
        o.target = null; o.moveTo = { x: me.pos.x + (Math.random() - 0.5) * 5, z: me.pos.z + (Math.random() - 0.5) * 5 }; o.aiT = Math.min(o.aiT || 0, 0.4); sent++;
      }
    }
    // 11/18 K358（K360⑦ の強さのまま・司令塔）：本人の組（槍の十六人）が遠い敵へ散り、本人が一人で曲輪に入って囲まれた。
    //   十二歩より離れた組の者は、斬り合いの最中でなければ本人の脇へ戻る（組を本人のそばに残す）
    for (const g of rt.squadGroups || []) for (const u of g.units || []) {
      if (!u?.alive || !u.pos || u.fleeing || u.woundOut) continue;
      const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
      if (d < 12 || (u.atk && u.target?.alive && u.target.pos && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 3)) continue;
      u.target = null; u.atk = null; u.moveTo = { x: me.pos.x + (Math.random() - 0.5) * 4, z: me.pos.z + (Math.random() - 0.5) * 4 }; u.aiT = Math.min(u.aiT || 0, 0.4);
    }
    // 11/18 01:50 毎時の持ち主（act bot 3回に2回、③三の丸で諏訪の備えに四方から足軽の槍（一突き14）を受け 220秒で倒れた）：
    //   命が半分を切って囲まれた時は、本人を狙う城兵のうち近い二人だけを残し、ほかは八歩内の味方（組・寄せ手）と組み合わせる（受ける傷の倍率は変えない）
    // 11/18 02:00 追い（act bot 429秒：二の丸で命18から退く印へ退く間に旗本の侍に追われ倒れた）：命が三割半を切ったら囲まれていなくても、残すのは一番近い一人だけ
    const lowHp = me.hp < me.maxHp * 0.35;
    if (me.hp < me.maxHp * 0.5 && (me.mobbed || lowHp)) {
      const on = [];
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.target !== me || o.isStruct || o.fleeing || o.woundOut) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d < 7) on.push([d, o]);
      }
      on.sort((a, b) => a[0] - b[0]);
      // 11/18 15:55 持ち主（act bot 303秒：二の丸の土橋 (17,10) で命40から退く本人を、残した一人の侍（二の丸の備え・一太刀17）が打ち続けて倒した）：
      //   命が三割半を切ったら、残す一人も八歩内に味方がいればその味方と組ませる（味方がいなければ残す。受ける傷の値は変えない）
      // 11/19 cloud-05（act bot 223秒：二の丸の土橋で囲まれ、残した二人の足軽（一突き14）に命59から9秒で討たれた）：囲まれて半分を切ったら残すのは一番近い一人
      for (const [, o] of on.slice(lowHp ? 0 : me.mobbed ? 1 : 2)) {
        // 11/18 04:55 持ち主（act bot 214秒：③の終わりに諏訪勝右衛門その人が、囲まれて命四割の本人へ二度打ち込み倒れた）：
        //   囲まれた時は、名のある将も近い二人の外なら味方と組ませる（盛信・はなは外さない）
        if (o.name && (/仁科|はな/.test(o.name) || !me.mobbed)) continue;
        let mate = null, md = 8;
        for (const a of rt.army.units) {
          if (!a.alive || a.team !== me.team || a === me || a.isStruct || a.fleeing || a.woundOut || a.civ) continue;
          const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
          if (d < md) { md = d; mate = a; }
        }
        // 11/18 17:58 クラウド持ち主（act bot 451秒：本丸門を一人で打つ本人が命四割から、後ろの仁科の衆の足軽に三度突かれ倒れた。八歩内に味方なし）：
        //   命が三割半を切って組ませる味方がいない時は、その城兵は六秒に一度、二秒だけ三歩退いて本人に退く間を残す（傷の値と敵の数は変えない）
        if (!mate) {
          if (lowHp && !(o._tkBackT > rt.t - 6)) {
            o._tkBackT = rt.t;
            const ax = o.pos.x - me.pos.x, az = o.pos.z - me.pos.z, al = Math.hypot(ax, az) || 1;
            o.target = null; o.atk = null; o.moveTo = { x: o.pos.x + ax / al * 3, z: o.pos.z + az / al * 3 }; o.aiT = 2;
          }
          continue;
        }
        o.target = mate; o.atk = null; o.aiT = Math.min(o.aiT || 0, 0.3);
        if (!(mate.atk && mate.target?.alive)) { mate.target = o; mate.aiT = Math.min(mate.aiT || 0, 0.3); }
      }
    }
    // 11/18 05:40 持ち主（act bot 257秒：命22で退く印へ北へ退く本人を、二の丸の備えの将（小山田）と侍が三十m 追って討った。282秒にも同じ形）：
    //   命が三割半を切ったら、本人を狙って自分の備えの持ち場から十四mより離れて追う城兵は、追いをやめて持ち場へ戻る
    //   （城兵は曲輪を守る兵。受ける傷の値と敵の数は変えない。盛信・はなは外さない）
    // 11/19 cloud-05（act bot 433秒：命48で退く印 (63,10) へ東へ退く本人を、二の丸の備え（小山田）の侍が持ち場から四十m 離れて付いて来て、三割半を切る前に討った）：
    //   命が半分を切って退く印へ下がっている間も、同じく持ち場から十四mより離れた追いをやめさせる
    if (lowHp || (me.hp < me.maxHp * 0.5 && F.retreatTo)) {
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.isStruct || o.fleeing || o.woundOut) continue;
        if (!(o.target === me || o.atk?.target === me)) continue;
        if (o.name && /仁科|はな/.test(o.name)) continue;
        const an = o.group?.anchor;
        if (!an || Math.hypot(o.pos.x - an.x, o.pos.z - an.z) < 14) continue;
        o.target = null; o.atk = null; o.moveTo = { x: an.x + (Math.random() - 0.5) * 4, z: an.z + (Math.random() - 0.5) * 4 }; o.aiT = 2.5;
      }
    }
    // 11/18 05:58 持ち主（act bot 416秒：本丸門を打つ本人が、門の内の本丸の仁科の衆に足軽の槍（一突き14）で突かれ続け命77から倒れた。味方の備えは一人ずつ）：
    //   本丸門がまだ開かず命が六割を切った時、本人の四m 内で本人を狙う本丸の衆は、近い味方へ向け直す（いなければ二秒退く）。受ける傷の値と敵の数は変えない
    // 11/19 cloud-05（司令塔：本丸の段の手応え。act bot「8分で5人」・本丸の段は掛矢で門を打つ間が長く討ち取り0〜1）：
    //   本人が本丸門（一の門）の十m 内にいる間、門脇のくぐり戸から仁科の衆の小勢（侍一・足軽三）が斬って出る（数で押さず、本人の周りで斬り合いを起こす）。
    //   三十五秒に一度・三度まで・前の小勢が残る間は出さない・本人の命が半分を切っていれば出さない。命四割五分を切ったら小勢は門の内へ引く。受ける傷の値は変えない
    if (F.niFell && !F.honFell && me.alive && !F.ending) {
      const gt = F.gates.honOuter, st = gt?.struct;
      if (st?.seg && !gt.breached && !gt.opened) {
        const gx = (st.seg[0] + st.seg[2]) / 2, gz = (st.seg[1] + st.seg[3]) / 2;
        const live = (F.kgSortie?.units || []).filter((o) => o.alive && !o.fleeing);
        if (me.hp < me.maxHp * 0.45) for (const o of live) { if (o.target === me) { o.target = null; o.atk = null; } o.moveTo = { x: gx, z: gz }; o.aiT = 2.5; }
        else if (!live.length && (F.kgSortieN || 0) < 3 && rt.t >= (F.kgSortieT || 0) && me.hp >= me.maxHp * 0.5 && Math.hypot(me.pos.x - gx, me.pos.z - gz) < 10) {
          F.kgSortieN = (F.kgSortieN || 0) + 1; F.kgSortieT = rt.t + 35;
          const dx = me.pos.x - gx, dz = me.pos.z - gz, dl = Math.hypot(dx, dz) || 1;
          const at = { x: gx + dx / dl * 2.2 + dz / dl * 3, z: gz + dz / dl * 2.2 - dx / dl * 3 };
          F.kgSortie = enemyGroup(rt, { name: 'くぐり戸から出た仁科の衆', faction: 'takeda', anchor: at, facing: Math.atan2(dx, dz), width: 3, order: 'attack', aggro: 12, seekRange: 14, morale: 85, noRout: false },
            [{ type: 'samurai', n: 1, o: { armor: TAKEDA.armor } }, { type: 'ashigaru', n: 3, o: { armor: TAKEDA.armor } }]);
          for (const o of F.kgSortie.units) { o.target = me; o.aiT = 0.5; }
          rt.bark('門脇のくぐり戸から城兵が斬って出た！', true);
        }
      }
    }
    // 11/19 持ち主（act bot 556〜596秒：本丸への土橋 (-41,-8) で仁科盛信の旗本の侍に一太刀26ずつ削られ、命110から倒れた）：旗本の侍も同じく向け直す
    // 11/19 03:40 持ち主（act bot 430秒：本丸の衆十四人が本人を追って塀際の一点 (-42,1) に重なって止まり、命六割を切って向け直した足軽が二、三秒でまた本人を背から突いた）：
    //   ①塀の向こうの本人を追う本丸の衆は追わず、備えの持ち場へ二歩ずつ散って戻る ②命六割を切って向け直した者は六秒のあいだ本人を狙い直さない（受ける傷の値と敵の数は変えない）
    if (F.niFell && !F.honFell && F.honGuard?.real) {
      const g = F.honGuard.real, an = g.anchor || F.honGuard.pos;
      const us = [...g.units, ...(F.keep?.guard?.units || []), ...(F.kgSortie?.units || [])];
      for (let i = 0; i < us.length; i++) {
        const o = us[i];
        if (!o.alive || !o.pos || !(o.target === me || o.atk?.target === me)) continue;
        if (g.units.includes(o) && an && Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) > 1.5 && rt.army.wallBetween(o.pos, -1, me.pos)) {
          o.target = null; o.atk = null; o._tkNoMeT = rt.t + 4;
          o.moveTo = { x: an.x - Math.floor(i / 5) * 1.8, z: an.z + (i % 5 - 2) * 1.8 }; o.aiT = 2.5;
        }
      }
    }
    // 11/19 03:50 持ち主（act bot 487秒：本丸が落ちた後、主殿へ向かう本人を仁科盛信の旗本の侍が背から一太刀26で削り倒した）：本丸が落ちた後も城主が果てるまで向け直す
    // 11/19 04:40 持ち主（act bot 483〜505秒：本丸門の脇 (-42,-5) で台所の若衆の侍に一太刀17ずつ、命91から35まで二十秒余り削られ、くぐり戸の衆に止めを刺され倒れた）：
    //   台所の若衆・くぐり戸から出た衆も同じく向け直す（受ける傷の値と敵の数は変えない）
    if (F.niFell && (!F.honFell || !F.keep?.down) && me.hp < me.maxHp * 0.6 && F.honGuard?.real) {
      for (const o of [...F.honGuard.real.units, ...(F.keep?.guard?.units || []), ...(F.youths?.units || []), ...(F.kgSortie?.units || [])]) {
        if (!o.alive || !(o.target === me || o.atk?.target === me)) continue;
        if (Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) > 6) continue;
        o._tkNoMeT = rt.t + 6;
        let mate = null, md = 6;
        for (const a of rt.army.units) {
          if (!a.alive || a.team !== me.team || a === me || a.isStruct || a.fleeing || a.woundOut || a.civ) continue;
          const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
          if (d < md) { md = d; mate = a; }
        }
        o.atk = null; o.target = mate; o.aiT = mate ? 0.3 : 2;
        // 11/18 16:00 持ち主（act bot 512秒：本丸門の前で味方の備えが一人ずつ・命48から本丸の衆の足軽に突かれ続け倒れた）：
        //   味方がいない時は的を外すだけで同じ場に立ち、二秒後にまた本人を突いていた。本人から五m 門の側へ退かせる
        if (!mate) { const dx = o.pos.x - me.pos.x, dz = o.pos.z - me.pos.z, dl = Math.hypot(dx, dz) || 1; o.moveTo = { x: me.pos.x + dx / dl * 5, z: me.pos.z + dz / dl * 5 }; o.aiT = 2.5; }
      }
    }
    if (me.hp < me.maxHp * 0.5) return;   // 命が半分を切ったら城兵を本人へ向けない（見回りで一度倒れた）
    let onMe = 0;
    const cand = [];
    for (const o of rt.army.units) {
      if (!o.alive || o.team === me.team || o.isStruct || o.fleeing || o.noTarget || o.woundOut || o.civ) continue;
      const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
      // 11/18 05:50 持ち主（act bot「8〜12分で8人」）：向ける城兵を探す輪を十八m→二十四m に
      if (d > 24 || Math.abs(o.pos.y - me.pos.y) > 2.5) continue;
      if (o.target === me) { onMe++; continue; }
      // 11/18 追い（main の流しで二の丸の備えの将と侍を向けた後に倒れた）：向けるのは足軽だけ（将・侍・名のある者は向けない）
      if (o.target && o.target.team === me.team && o.type === 'ashigaru' && !o.isOfficer && !o.name && !rt.army.wallBetween(me.pos, -1, o.pos)) cand.push([d, o]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    // K360⑦ の強さのままでは、本人へ向けると act bot が三回に一度倒れた。向けるのは本人を狙う者がいない時の一人だけ
    // 11/18 毎時の持ち主（act bot「9分で4〜9人・相手が少なくて退屈」）：命が八割より多い時だけ、本人を狙う者が二人になるまで向ける
    const healthy = me.hp >= me.maxHp * 0.7 && !F.meleePressure;   // 11/18 05:50：八割→七割
    for (const [, o] of cand.slice(0, onMe >= (healthy ? 2 : 1) ? 0 : 1)) { o.target = me; o.atk = null; o.aiT = Math.min(o.aiT || 0, 0.3); }
  };
}

// 11/18 cloud-05（司令塔：高遠の竹束。200秒・画質高の写真で、手前の竹束が画面の下半分を塞いだ）：
//   視点は動かさない（kaito 11/2「カメラは一つの形に固定・操作しない時は動かさない」）。本人の頭と視点を結ぶ線の脇（一・三歩）に
//   入って線を塞ぐ竹束だけ、その束の材質を自分用に写して半透明（0.3）にし、外れたら元へ戻す（当たり・兵の動き・カメラは変えない。高遠だけ）
{
  const cc = takato_siege.clampCamera;
  const fade = (tb, on) => {
    if (!!tb._tkFade === on) return;
    tb._tkFade = on;
    tb.m.traverse((q) => {
      if (!q.isMesh || !q.material) return;
      if (on) {
        if (!q.userData.tkOrigMat) { q.userData.tkOrigMat = q.material; const m = q.material.clone(); m.transparent = true; m.opacity = 0.3; m.depthWrite = false; q.userData.tkFadeMat = m; }
        q.material = q.userData.tkFadeMat;
      } else if (q.userData.tkOrigMat) q.material = q.userData.tkOrigMat;
    });
  };
  takato_siege.clampCamera = function (rt, pos) {
    cc.call(this, rt, pos);
    const p = rt.player, u = p?.u, TA = rt.flags?.TA;
    if (!u || !TA) return;
    const off = NAKA.cur || rt.game?.photo || p.fpK >= .5;
    const hx = u.pos.x, hz = u.pos.z, head = u.pos.y + 2.05 * (u.mesh?.scale.y || 1);
    const dx = pos.x - hx, dz = pos.z - hz, L2 = dx * dx + dz * dz;
    for (const it of TA.items || []) for (const tb of it.tabas || []) {
      const m = tb.m; if (!m) continue;
      let block = false;
      if (!off && m.visible && L2 > .25 && Math.abs(m.position.x - pos.x) < 7 && Math.abs(m.position.z - pos.z) < 7) {
        const t = Math.max(0, Math.min(1, ((m.position.x - hx) * dx + (m.position.z - hz) * dz) / L2));
        block = t >= .15 && Math.hypot(hx + dx * t - m.position.x, hz + dz * t - m.position.z) <= 1.3 &&
          head + (pos.y - head) * t < m.position.y + 2.65;
      }
      fade(tb, block);
    }
  };
}

// 11/19 03:50 持ち主：上の向け直し（二秒ごと）の後、二、三秒で同じ者がまた本人を狙い直して背から突いた。
//   向け直した者（_tkNoMeT）は、その間ずっと本人を狙わない（毎コマ見る。受ける傷の値と敵の数は変えない）
{
  const up = takato_siege.update;
  takato_siege.update = function (rt, dt) {
    up.call(this, rt, dt);
    const me = rt.player?.u, F = rt.flags;
    if (!me?.alive || !F?.niFell) return;
    for (const o of [...(F.honGuard?.real?.units || []), ...(F.keep?.guard?.units || []), ...(F.kgSortie?.units || []), ...(F.youths?.units || [])]) {
      if (!(o._tkNoMeT > rt.t) || !o.alive) continue;
      if (o.target === me) { o.target = null; o.aiT = Math.max(o.aiT || 0, 0.5); }
      if (o.atk?.target === me) o.atk = null;
      if (o.swing?.target === me && !o.swing.done) o.swing = null;   // 振りかけの一太刀も止める（狙いを外しても振りは当たる）
      if (o.bind?.o === me) { if (me.bind?.o === o) me.bind = null; o.bind = null; }
    }
  };
}

export { takato_siege };
