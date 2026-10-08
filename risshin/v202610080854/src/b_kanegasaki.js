import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 信長包囲網　金ヶ崎の退き口（元亀元年四月二十八日〜晦日）
// 越前の金ヶ崎。朝倉を攻めていた織田勢は、北近江の浅井長政の裏切りで前後を挟まれた。
// 信長はわずかな供で朽木越えに京へ逃れ、殿（しんがり）に木下藤吉郎・明智光秀・池田勝正が残る。
// 足軽は木下の手。①一の備（金ヶ崎の麓）で朝倉の先手を食い止める ②笙の川まで繰り引き、騎馬の追手を川で受ける
// ③狭路まで退き、朝倉の後続を、主力が退ききるまで食い止める（退き口成る）
// 向き：北が -z（木ノ芽峠）、東の疋田方面からも朝倉が寄せる。退き口は南西（朽木へ）
// ======================================================================
import { yamaLift } from './yamalift.js';
import * as THREE from 'three';
import { nobori, tawara, hut, ishigaki, makeKitBatch, finalizeKitBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { buildCastlePlan, heightOf } from './castle_plan.js';
import { KANEGASAKI_PLAN, KG_SHU as CASTLE, KG_NI as KAZ2, KG_TEZ as TEZUTSU, KG_PATHS } from './castles/kanegasaki.js';
import { demRelief } from './dem.js';
import { buildHorse } from './units_model.js';
import { addDeck, addRamp } from './floors.js';
let kgDem = null;
import('./asset_dem_kanegasaki.js').then((m) => { kgDem = m.default; }).catch(() => {});
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const SHO = [[-180, 34], [-100, 22], [-30, 14], [30, 10], [90, 6], [130, 2]];   // 笙の川（西から海へ）
const ROAD = [[-6, -176], [2, -110], [8, -50], [8, 12], [-10, 60], [-26, 104], [-54, 150], [-70, 176]];
// docs/layout-ref/fields.md 第三節の東の寄せ口。細かな道筋は復元。
// 疋田方面から湿地の南を通り、川の北で一の備へ合流する。退き道・城山の大きさは変えない。
const HIKIDA_ROAD = [[90, -14], [74, -18], [46, -26], [28, -38], [8, -50]];
const HIKIDA_FROM = { x: 74, z: -18 };
const HIKIDA_FACING = Math.atan2(8 - HIKIDA_FROM.x, -46 - HIKIDA_FROM.z);
const NAKAIKEMI = { x: 78, z: -66, r: 26 };   // 中池見湿地（天筒山の東南、天然の防御線）
// 殿の三つの備（持ち場）と、そこで向く向き（北 = Math.PI）
const LINES = [
  { x: 8, z: -46, r: 12, name: '一の備（金ヶ崎の麓）' },
  { x: 6, z: 24, r: 12, name: '二の備（笙の川の南）' },
  { x: -22, z: 102, r: 11, name: '三の備（狭路）' },
];
const RETREAT_T = 340;    // 主力が退ききるまでの秒（5〜6分の基準に合わせてさらに詰めた）
const KUTSUKI = { x: -56, z: 150, r: 14 };    // 若狭へ向かう道（信長で遊ぶ時の退き先）                   // 主力が退ききるまでの秒（はじめから）

const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
// 戦える残兵を、退き道・崩れの判定と同じ条件で数える。
const kgActive = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
function kgFlagCounts(rt) {
  return rt.flags.tono.map(g => `${g.name}の旗 ${g.units.reduce((n, u) => n + (kgActive(u) ? 1 : 0), 0)}／${g.initial}人`).join('、');
}
const gone = (g) => !g || (!g.kgPending && g.count === 0) || g.routed;
// 新手を出す時だけ数える。味方の追いつく分を空け、遠景は軽い兵のまま。
function cappedList(rt, list) {
  let room = 225;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 後続は遠景の同じ兵から引き継ぐ。上限や見通しで出せなければ待たせる。
function enemyGroup(rt, o, list) {
  const g = spawnEnemy(rt, { fixed: true, noGuard: true, formation: 'yari', ...o }, []);
  g.kgPending = true;
  rt.flags.pursuers.push({ g, list, at: o.anchor, source: o.anchor.x > 40 ? 2 : o.anchor.x < -20 ? 1 : 0 });
  return g;
}
function pursuersTick(rt) {
  const F = rt.flags;
  if (F.ending || F.fleeing) {
    for (const q of F.pursuers) q.g.kgPending = false;
    F.pursuers.length = 0;
    return;
  }
  if (rt.t < F.pursuersAt) return;
  F.pursuersAt = rt.t + 0.5;
  for (let i = F.pursuers.length - 1; i >= 0; i--) {
    const q = F.pursuers[i], host = F.host[q.source];
    const list = cappedList(rt, q.list), n = list.reduce((a, e) => a + e.n, 0);
    if (!n) continue;
    // 近い兵の置換は共通処理へ任せる。後続の出発は見えない遠い列だけ。
    const pts = host.m.take(host.x, host.z, n, 90, null, (x, z) =>
      Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) > 60 &&
      !sightPoint(rt, { x, z }) && rt.world.walkable(x, z));
    if (!pts.length) {
      if (!host.m.left(host.x, host.z, 100)) { q.g.kgPending = false; F.pursuers.splice(i, 1); }
      continue;
    }
    let used = 0, x = 0, z = 0;
    const specs = [];
    for (const e of list) for (let j = 0; j < e.n && used < pts.length; j++) {
      const at = pts[used++]; x += at.x; z += at.z;
      specs.push({ type: e.type, n: 1, o: { ...e.o, x: at.x, z: at.z, heading: at.yaw } });
    }
    const g = q.g;
    g.anchor.x = x / used; g.anchor.z = z / used;
    rt.army.spawn(g, specs);
    g.leader = g.units.find(u => u.type === 'busho') || g.units.find(u => u.type === 'samurai') || null;
    // 寄せ口から元の持ち場へ、道の折れ点を通って歩く。位置を飛ばさない。
    g.path = [];
    if (q.source === 2) {
      for (const at of HIKIDA_ROAD) if (at[0] < g.anchor.x) g.path.push(at);
    } else {
      const first = ROAD.find(at => at[1] >= g.anchor.z) || ROAD[0];
      g.path.push(first);
    }
    const startZ = q.source === 2 ? -50 : g.anchor.z;
    // 殿が次へ退いた後も、昔の出現点へ引き返さず現在の備を追う。
    const goalZ = Math.max(q.at.z, LINES[F.line].z - 24);
    let goalX = q.at.x;
    for (let j = 0; j < ROAD.length - 1; j++) {
      const a = ROAD[j], b = ROAD[j + 1];
      if (goalZ >= a[1] && goalZ <= b[1]) goalX = a[0] + (b[0] - a[0]) * (goalZ - a[1]) / (b[1] - a[1]);
    }
    for (const at of ROAD) if (at[1] > startZ && at[1] < goalZ) g.path.push(at);
    g.dest = { x: goalX, z: goalZ };
    g.path.push([goalX, goalZ]); g.pathIdx = 0; g.order = 'path';
    g.onArrive = gg => { gg.order = 'attack'; gg.path = null; gg.onArrive = null; };
    g.kgPending = false;
    // 上限で一部しか替えられなかった時は残りも同じ列で待つ。
    let left = used;
    for (const e of q.list) { const took = Math.min(e.n, left); e.n -= took; left -= took; }
    if (q.list.some(e => e.n > 0)) {
      const rest = spawnEnemy(rt, { fixed: true, noGuard: true, noRout: g.noRout, faction: g.faction, name: g.name, anchor: { ...q.at },
        formation: g.formation, facing: g.facing, speed: g.speed, width: g.width, aggro: g.aggro,
        seekRange: g.seekRange, morale: g.morale, dmgMult: g.dmgMult, fleeDir: g.fleeDir, order: 'attack' }, []);
      rest.kgPending = true; q.g = rest;
    } else F.pursuers.splice(i, 1);
  }
}
// 各寄せで決めた傷の倍率を保つ。後から共通値で上書きしない。
// 生き延びた働きを副手柄として記録する。点数は共通の評価に任せる。
function survival(rt, label) {
  if (rt.flags.survivalAwarded) return;
  rt.flags.survivalAwarded = true;
  const sq = rt.squad || [];
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた働きを記録した`);
}

// 退く下知ごとに道筋と到着処理を入れ替える。前の備の処理で引き戻さない。
function retreatGroup(g, x, z, facing, formation) {
  const c = g.center(), path = [];
  const join = (atZ) => {
    for (let i = 0; i < ROAD.length - 1; i++) {
      const a = ROAD[i], b = ROAD[i + 1];
      if (atZ < a[1] || atZ > b[1]) continue;
      const f = (atZ - a[1]) / (b[1] - a[1]);
      return [a[0] + (b[0] - a[0]) * f, atZ];
    }
    return atZ < ROAD[0][1] ? ROAD[0] : ROAD[ROAD.length - 1];
  };
  path.push(join(c.z));
  for (const q of ROAD) if (q[1] > c.z && q[1] < z) path.push(q);
  // 最後に真横へ折れる点を足すと、川岸で縦隊の後列が回り切れない。
  path.push([x, z]);
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = path; g.pathIdx = 0;
  g.dest = { x, z }; g.speed = 3.4; g.formation = 'column';
  // 固定は出現場所の指定。退く間は道幅を合わせ、遠い追手へ戻らない。
  g.fixed = false; g.retreatOnly = true; g._fitAt = 0;
  g.focus = null; g.commanderPush = null; g.commanderPushUntil = 0;
  g.onArrive = (gg) => {
    gg.order = 'hold'; gg.anchor = gg.dest;
    gg.facing = facing; gg.formation = formation; gg.path = null;
    gg.retreatOnly = false; gg._routeCols = 0; gg._slotFit = null;
  };
}

// 届くまで知らせを出さない。使番が倒れても角笛による撤退は止めない。
function messengerOrder(rt, target, who, text) {
  const F = rt.flags, g = F.runner;
  if (!g?.count || !target?.alive) return;
  F.runnerNews = { target, who, text, at: rt.t };
  const c = g.center(), goal = target.pos, forward = goal.z >= c.z;
  g.path = [];
  for (let i = 0; i < ROAD.length; i++) {
    const q = ROAD[forward ? i : ROAD.length - 1 - i];
    if (forward ? q[1] > c.z && q[1] < goal.z : q[1] < c.z && q[1] > goal.z) g.path.push(q);
  }
  g.path.push([goal.x, goal.z]); g.pathIdx = 0; g.order = 'path'; g.dest = { x: goal.x, z: goal.z };
  g.onArrive = gg => { gg.order = 'hold'; gg.anchor = gg.dest; gg.path = null; gg.onArrive = null; };
}
function messengerTick(rt) {
  const F = rt.flags, news = F.runnerNews, g = F.runner;
  if (!news) return;
  if (!g.count || !news.target.alive || rt.t - news.at > 35) { F.runnerNews = null; return; }
  const c = g.center(), p = news.target.pos;
  if (Math.hypot(c.x - p.x, c.z - p.z) < 4) {
    rt.say(news.who, news.text, 3); F.runnerNews = null; g.order = 'hold';
    g.anchor.x = c.x; g.anchor.z = c.z; g.path = null;
  } else if (!g.path || g.pathIdx >= g.path.length - 1) {
    g.order = 'move'; g.dest.x = p.x; g.dest.z = p.z;
  }
}

// 遠くの軍勢を動かす（world の揺らしと取り合わないよう、揺れの基点 x0 を動かす）
function moveDA(rt, fa, x, z) {
  fa.x = x; fa.z = z;
  const e = (rt.world.armies || []).find((a) => a.mesh === fa.m);
  if (e) e.x0 = x - fa.x0;
  fa.m.position.z = z - fa.z0;
  fa.m.position.y = rt.world.heightAt(x, z) - rt.world.heightAt(fa.x0, fa.z0);
}

function baseRelief(x, z) {
  let h = 0.6 * Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.027) + 0.35 * Math.sin(z * 0.06 + x * 0.025);
  // 金ヶ崎の岬・別山の天筒山・西の山並み・狭路の両側の山。
  // 段と堀は城の周りだけに重ね、麓の退き道と兵の持ち場を保つ。
  h += 18 * gauss(x, z, TEZUTSU.x, TEZUTSU.z, 260);
  h += 22 * gauss(x, z, CASTLE.x, CASTLE.z, 900) + 26 * gauss(x, z, TEZUTSU.x, TEZUTSU.z, 1500);
  h += Math.max(0, -x - 90) * 0.28 + 18 * gauss(x, z, -96, -70, 2600);
  h += 30 * gauss(x, z, -82, 104, 1500) + 26 * gauss(x, z, 36, 122, 1400) + 14 * gauss(x, z, 90, 150, 2000);
  // 狭路：道の両脇に崖のような尾根が迫る細い谷
  h += 16 * gauss(x, z, -52, 96, 500) + 15 * gauss(x, z, 10, 112, 520) + 12 * gauss(x, z, -64, 132, 450) + 10 * gauss(x, z, -14, 146, 420);
  // 東は敦賀の浜から海へ
  if (x > 92) h -= Math.min(9, (x - 92) * 0.34);
  // 国土地理院の標高：戦場の外の遠い山並みにだけ実際の起伏を足す（ゲームの 1 を実の 5m に縮める）
  if (kgDem) h += demRelief(kgDem, x, z, { xy: 5, cx: 0, cz: 10, inner: 190, fade: 60, scale: 0.12 });
  return h + yamaLift(x, z, LIFT);
}

function relief(x, z) {
  let h = baseRelief(x, z);
  // 敦賀市の城跡案内と縄張りの参照：金ヶ崎は86m、天筒山は約171m。
  // 山頂の肩だけ補正する。曲輪・堀・土塁は後で重ね、麓の持ち場へ広げない。
  for (const s of KG_SUMMIT_RISE) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= 26) continue;
    const t = Math.max(0, (d - 14) / 12);
    h += s.rise * (1 - t * t * (3 - 2 * t));
  }
  return h;
}

// 見た目と歩く高さを同じ関数で作る。堀・切岸・土塁は実際に地面を上下させる。
const KG_DIPS = KANEGASAKI_PLAN.hori.map(h => horiboriHeight(h.pts, { width:h.w, depth:h.deep }));
let kgGround = null, kgRoads = null;
function height(x, z) {
  if (!kgGround) {
    kgGround = heightOf(KANEGASAKI_PLAN, (x,z) => {
      let h = relief(x,z);
      for (const dip of KG_DIPS) h += dip(x,z);
      return h;
    }, 3);
    // 道の高さは両端を結ぶ緩い登り。九十九折りの途中の山頂・堀へ引きずられない。
    kgRoads = [];
    for (const pts of KG_PATHS) {
      let len=0;
      for(let i=1;i<pts.length-1;i++) len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
      // 枝道の出だしは先に作った道の高さに合わせる。
      const start = kgRoads.length ? height(pts[0][0],pts[0][1]) : kgGround(...pts[0]);
      const end = kgGround(...pts[pts.length-1]);
      let walked=0;
      for(let i=1;i<pts.length;i++) {
        const a=pts[i-1], b=pts[i], l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        kgRoads.push({ax:a[0],az:a[1],dx:b[0]-a[0],dz:b[1]-a[1],l2:l*l,y:start+(end-start)*walked/len,dy:i===pts.length-1 ? 0 : (end-start)*l/len});
        walked+=l;
      }
    }
  }
  const h=kgGround(x,z);
  let bd=1e9, roadY=h;
  for(const r of kgRoads) {
    const t=Math.max(0,Math.min(1,((x-r.ax)*r.dx+(z-r.az)*r.dz)/r.l2));
    const d=Math.hypot(x-r.ax-r.dx*t,z-r.az-r.dz*t);
    if(d<bd){bd=d;roadY=r.y+r.dy*t;}
  }
  if(bd>=3.8) return h;
  const t=Math.max(0,Math.min(1,(3.8-bd)/1.4)), k=t*t*(3-2*t);
  return h+(roadY-h)*k;
}

// 占領後の退き口。金ヶ崎城を朝倉の籠城として作り直さない。殿の配分は復元。
const KANEGASAKI_JIN = [
  battleJin('殿の横備え', 0, LINES[0], Math.PI, [
    ['kgKino', '道の正面', '木下藤吉郎', 1000, 8, -46, 'kino', 'oda'],
    ['kgIkeda', '西の槍組', '池田勝正', 1500, -14, -44, 'ikeda', 'oda'],
    ['kgAkechi', '東の鉄砲組', '明智光秀', 500, 28, -40, 'akechi', 'oda', 'akechi'],
  ], '殿三千を仮の数とする。三つの持ち場へ順に退く。'),
  battleJin('追う縦備え', 1, { x: 24, z: -150 }, 0, [
    ['kgVan', '北の先手', '名は伝わらない', 6000, -4, -168, 'host.0', 'asakura'],
    ['kgKagetake', '西の追手', '名は伝わらない', 6000, -60, -150, 'host.1', 'asakura'],
    ['kgEast', '疋田方面の追手', '名は伝わらない', 4000, 78, -24, 'host.2', 'asakura', 'asakura', HIKIDA_FACING],
  ], '朝倉の追手一万六千は仮の数。総大将を前線へ置かない。将名と配分は不明。'),

];

const kanegasaki = {
  jinkei: KANEGASAKI_JIN,
  taisho: { a: null, b: null }, // 三将の退却はこの定義が扱う。共通の本陣増設・襲撃・即勝ちを使わない。
  wakeRoom: 200,
  // 反撃の隙と撤退は戦の頭に任せ、性格の構え直しで突きを消さない。
  botOrders: true,
  botEvacuating: (rt) => !!rt.flags.fleeing || rt.G.lord || rt.flags.step === 2 || rt.flags.step === 4,
  softOpen: 0,   // 撤退戦の開幕を無傷の猶予にしない。
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1,
  // 普通・練習では、満タンから斬り合いを二十秒続けても立てる。
  // 最初の傷は体力の８％、以後は毎秒４％まで。受けと回避の間も残す。
  meleeGrace: { rate: 0.04, burst: 0.08, interval: 0.85 },
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: LINES[0].x - 11, z: LINES[0].z + 8, heading: Math.PI },
  world: {
    blockedHint: () => '槍列の横へ回れ。退く時は南へ続く道を通れ',
    seed: 1570,
    wind: [0.3, 0.95],   // 北の峠から吹き下ろす風（朝倉の側から）
    time: 'after',
    young: true,     // 四月の越前：若葉の草
    muddy: 0.25,
    water: { x: 118, level: -2.2 },
    friendlyProjectiles: true, // 射線へ入った味方にも、同じ弾・矢が当たる。
    waterSlow: true,   // 笙の川を渡る間は遅い（terrain_tags.js の water。10/2）
    paths: [ROAD, HIKIDA_ROAD, ...KG_PATHS],
    height,
    tint(x, z, h, c) {
      // 浜の砂
      if (x > 96) { const k = Math.min(1, (x - 96) / 14); c.lerp({ r: 0.62, g: 0.58, b: 0.48 }, k * 0.8); }
      // 山の緑は濃く
      if (h > 7) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x) < 70 && z > -90 && z < 80) || Math.hypot(x - 24, z + 150) < 22,
    fieldStage: 'bare',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      // 中池見湿地：田の升目でなく、不揃いに水をたたえた湿地（天筒山の東南、天然の防御線）
      const dw = Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z);
      if (dw < NAKAIKEMI.r) {
        const n = Math.sin(x * 0.17 + z * 0.13) * 0.5 + Math.sin(x * 0.31 - z * 0.22 + 1.7) * 0.3;
        return Math.max(0, Math.min(1, (NAKAIKEMI.r - dw) / NAKAIKEMI.r * 1.4 + n * 0.3 - 0.2));
      }
      if (x < -60 || x > 80 || z < -30 || z > 70 || Math.abs(z - 20) < 12) return 0;
      if (Math.abs(x - 6) < 7) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    // 橋の下と、西から寄せる隊の浅瀬。兵の歩みも、この通れる筋へ回す。
    streams: [{ pts: SHO, w: 4.5, depth: 1.2, fords: [{ x: 8, w: 5.7 }, { x: -50, w: 10 }] }],
    trees: 460,
    tufts: 4200,
    treeDensity: (x, z) => (Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z) < NAKAIKEMI.r + 6 ? 0.08 : Math.abs(x) < 60 && z > -90 && z < 90 ? 0.2 : 1),
    groves: [{ x: -40, z: -20, r: 12, n: 18 }, { x: 50, z: 50, r: 12, n: 16 }, { x: -50, z: 70, r: 10, n: 14 }, { x: -52, z: 98, r: 10, n: 22 }, { x: 10, z: 112, r: 10, n: 20 }],
    // 崩れた追手は北の峠道か東の寄せ口へ。東の兵を海まで走らせない。
    fleeOut: (x, z, team) => team === 1 && (z < -130 || (x > 90 && z > -40 && z < 4)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { retreat: 'HIST_A', asaiBetrayal: 'HIST_B', kutsukiRoute: 'HIST_A', rearguard: 'HIST_A', castleSite: 'HIST_B', bridge: 'GAME_C', baggage: 'GAME_C', confusion: 'GAME_C' };
    rt._rfN = 3; // この撤退戦では共通の自動援兵を使わない。
    F.pursuers = []; F.pursuersAt = 0;
    F.step = 0; F.ek = 0; F.ak = 0; F.line = 0;
    const L = LINES[0];
    // 退き陣に取り残された空馬一頭は遊びの補完。持ち場を離れず手綱を取れる。
    const h = buildHorse();
    h.position.set(L.x + 6, W.heightAt(L.x + 6, L.z + 6), L.z + 6);
    h.rotation.y = Math.PI;
    rt.scene.add(h);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h, heading: Math.PI, spd: 0, t: 0, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } });
    // ---- 殿：木下藤吉郎の手（自分の持ち場）、池田勝正の手、明智光秀の鉄砲 ----
    F.kino = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '木下藤吉郎の手', anchor: { x: L.x - 3, z: L.z - 4 }, facing: Math.PI, width: 22, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { horse: false, name: '木下藤吉郎', invuln: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.kinoU = F.kino.units[0];
    F.ikeda = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '池田勝正の手', anchor: { x: L.x - 22, z: L.z + 2 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '池田勝正', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.akechi = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '明智光秀の鉄砲', anchor: { x: L.x + 20, z: L.z + 6 }, facing: Math.PI, width: 12, aggro: 30, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '明智光秀', invuln: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'ashigaru', n: 4 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 6 }], ODA));
    F.akeU = F.akechi.units[0];
    F.ikedaU = F.ikeda.units[0];
    F.gunsEast = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '明智の右の鉄砲組', anchor: { x: L.x + 30, z: L.z + 6 }, facing: Math.PI, width: 8, formation: 'line', aggro: 22, noRout: true }, dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 2 }], ODA));
    F.tono = [F.kino, F.ikeda, F.akechi, F.gunsEast];
    // 使番は開幕から同じ一人。手傷も討死も通常の判定で扱う。
    F.runner = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '殿の使番',
      anchor: { x: L.x + 3, z: L.z + 18 }, facing: Math.PI, formation: 'column',
      aggro: 0, seekRange: 0, noAI: true, noRout: true }, dress([{ type: 'samurai', n: 1 }], ODA));
    F.runner.isRunner = true; F.runner.speed = 4.5;
    F.runnerNews = null;
    for (const u of [F.kinoU, F.ikedaU, F.akeU]) { u.allyOk = true; u.pos.z += 7; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    for (const g of F.tono) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n && !rt.G.lord) rt.makeSquad({ x: L.x + 4, z: L.z + 8 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗：金ヶ崎城と天筒山に織田の旗、麓に陣幕 ----
    for (const [x, z, k] of [[CASTLE.x - 4, CASTLE.z + 6, 'oda'], [CASTLE.x + 4, CASTLE.z + 4, 'eiraku'], [TEZUTSU.x, TEZUTSU.z + 8, 'oda'], [L.x - 6, L.z + 10, 'oda'], [L.x + 8, L.z + 10, 'oda'], [L.x + 22, L.z + 12, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 占領済みの土の城。曲輪の全周と木戸・登れる物見を共通部品でまとめる。
    const C = F.castleC = buildCastlePlan(rt, KANEGASAKI_PLAN, { baseHeight:relief, edgeW:3, life:false, perch:false, buildSeat:false, buildGates:true, buildTowers:true, team:0 });
    for (const wall of C.walls) { wall.noTarget=true; wall.fireProof=true; }
    for (const gate of Object.values(C.gateObjs)) { gate.open(); gate.struct.solidR=0; gate.struct.passable=true; gate.struct.opened=true; gate.struct.noTarget=true; gate.struct.fireProof=true; }
    // 総石垣でなく、入口脇の低い留め石。購入した城の部品を使い、材質ごとにまとめる。
    const rim=makeKitBatch();
    for (const x of [70.7,77.3]) ishigaki(W, [[x,-107],[x,-103]], { topY:W.heightAt(x,-105)+.25,minH:.45,maxH:.8,batch:rim });
    finalizeKitBatch(rt,rim);
    // 配置・用途は推定。板葺き。入れる建物は共通の戸口・床・和の部屋を使う。
    const house=(x,z,w,d,name,kind) => goten(rt,x,z,{w,d,name,kind,profile:'mitsukuri',tile:false,naka:true,door:1,doorX:0,team:0,noTarget:true});
    house(99,-132,6,4,'主郭の詰所','goten');
    house(78,-114,4,3,'二の曲輪の番所','nagaya');
    house(48,-102,5,3,'天筒山の長屋','nagaya');
    // 木造の兵糧小屋。土蔵や瓦屋根を補わず、外観だけにする。
    rt.scene.add(hut(W,69,-114,4,3,0,{ita:true,minka:false,wall:0x66513b}));
    // 殿の陣は置かない（信長はもう朽木越えに発った。殿の大将・藤吉郎は一の備にいる）。捨てた俵と小屋だけ残る
    rt.scene.add(tawara(W, 20, -2, 0.4, 5), hut(W, 34, 2, 6, 4, 0.3, { roof: 0x6a5c44 }));
    // 退く道：笙の川に架かる細い板橋と、道ばたの集落（小屋）。橋の幅は狭く、一度には渡れない
    {
      const bx = 8, bz = 12, yb = Math.max(W.heightAt(bx, bz - 9), W.heightAt(bx, bz + 9)) + 0.18;
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 17), wood); deck.position.set(bx, yb, bz); deck.castShadow = true; deck.receiveShadow = true; rt.scene.add(deck);
      // 板の上面と同じ高さを歩く。両岸から短い坂でつなぐ。
      const top = yb + 0.11;
      addDeck({ x0: bx - 1.3, x1: bx + 1.3, z0: bz - 8.5, z1: bz + 8.5, y: top, name: '笙の川の橋' });
      addRamp({ ax: bx, az: bz - 10, bx, bz: bz - 8.5, w: 3.4, ya: W.heightAt(bx, bz - 10), yb: top });
      addRamp({ ax: bx, az: bz + 8.5, bx, bz: bz + 10, w: 3.4, ya: top, yb: W.heightAt(bx, bz + 10) });
      const waterDepth = W.waterDepthAt.bind(W);
      W.waterDepthAt = (x, z) => Math.abs(x - bx) <= 1.7 && Math.abs(z - bz) <= 10 ? 0 : waterDepth(x, z);
      for (const dx of [-1.55, 1.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 17), wood); rail.position.set(bx + dx, yb + 0.85, bz); rt.scene.add(rail);
        for (const dz of [-8, -4, 0, 4, 8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), wood); post.position.set(bx + dx, yb + 0.4, bz + dz); rt.scene.add(post); }
      }
      rt.marker('hashi', { x: bx, z: bz }, '笙の川の橋', { h: 3 });
      rt.scene.add(nobori(W, bx + 3, bz - 9, 'oda', 10), nobori(W, bx - 3, bz + 9, 'oda', 10));   // 橋を戦の初めの視界に（遠くから旗で分かる。A075）
      for (const [x, z, r] of [[34, 56, 0.2], [44, 70, -0.3], [28, 84, 0.1], [-34, 72, 0.4]]) rt.scene.add(hut(W, x, z, 6, 4.5, r, { wall: 0x6e5a40, roof: 0x5a4c38 }));
    }
    // 退く道の乱れ：崩れた俵、倒れた旗、捨てた荷
    for (const [x, z, r, n2] of [[2, 40, 0.8, 2], [-14, 78, -0.6, 3], [-30, 116, 1.2, 2], [-44, 138, 0.3, 1]]) rt.scene.add(tawara(W, x + 3, z, r, n2));
    for (const [x, z, r] of [[-4, 52, 0.4], [-20, 92, -1.1], [-36, 124, 2.2]]) { const fl = nobori(W, x, z, 'oda', 5); fl.rotation.set(0, r, 1.45); fl.position.y += 0.15; rt.scene.add(fl); }

    // ---- 大軍（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => {
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, kind: 'spear', flagRate: 0.25, flagTex: flagTexture(flag), seed });
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2b3140;
    // 織田の主力：南の道を朽木の方へ退いていく（時とともに消える）
    F.main = [[-6, 46, 'oda'], [-20, 84, 'eiraku'], [-40, 128, 'oda'], [20, 64, 'oda'], [-4, 110, 'oda'], [-58, 158, 'eiraku']]
      .map(([x, z, f], i) => ({ ...DA(x, z, 14, 26, 200, Math.PI * 0.85, OD, f, 1571 + i), t: 0 }));
    // 主力の後ろに、荷駄（茶の小さな列）と手負いの兵（包帯の白っぽい列）が混じって遅れる
    F.main.push({ ...DA(-14, 60, 7, 22, 70, Math.PI * 0.85, 0x6a5a3c, 'oda', 1578), t: 0 }, { ...DA(-34, 104, 8, 18, 60, Math.PI * 0.85, 0x9a948a, 'oda', 1579), t: 0 });
    // 主力は殿が次に守る川岸より先へ。戦う兵の持ち場に軽い列を重ねない。
    F.main.forEach((a, i) => {
      a.m.army.kgRetreat = true;
      const q0 = 5 + i * 0.2, q = Math.floor(q0), f = q0 - q;
      moveDA(rt, a, ROAD[q][0] + (ROAD[q + 1][0] - ROAD[q][0]) * f, ROAD[q][1] + (ROAD[q + 1][1] - ROAD[q][1]) * f);
    });
    // 朝倉の大軍：北の峠道と東の疋田方面。湿地・城山の中に東の列を置かない。
    F.host = [[-4, -168, 60, 'asakura'], [-60, -150, 40, 'asakura'], [78, -24, 40, 'asakura']]
      .map(([x, z, w, f], i) => DA(x, z, w, 28, 300, i === 2 ? HIKIDA_FACING : 0, ASAKURA.armor, f, 1590 + i));
    // 東も近づけば同じ遠景から実兵へ替える。別口の兵を重ねない。
    // 浅井の離反は伝令の報。未確認の浅井本隊・義景を敦賀の目前へ置かない。

    buildBattleJin(rt);
    rt.world.setTime('after');
    rt.setPhase('brief');
    // 攻城から撤退へ：浅井の寝返りの知らせで、織田の陣は攻めの形から総崩れ気味の退き陣へ変わる
    rt.banner('陣中、騒然', '浅井の寝返り――攻めの陣から、退き陣へ');
    messengerOrder(rt, F.kinoU, '伝令', '浅井が朝倉方についた！　後ろの道も危ういぞ！');
    rt.say('足軽', '城は落としたのに……退けとの下知じゃ！', 3);
    // 信長で遊ぶ時：殿を藤吉郎に任せ、旗本と若狭へ向かう道まで退く
    if (rt.G.lord) {
      rt.obj('main', '旗本を連れ、若狭へ向かう道まで退け', 'main');
      rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '若狭へ向かう道', { h: 2 });
      rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
      rt.say('木下藤吉郎', '殿、長政殿が朝倉方へ！　前後を挟まれまする！', 5);
      rt.say('木下藤吉郎', '殿（しんがり）はこの藤吉郎が務めまする。殿は一刻も早う、朽木越えに京へ！', 4.5);
      rt.say('織田信長', '猿、しんがりは任せた。……生きて戻れ', 3.5);
      rt.after(9, () => this.wave1(rt));
      F.t0 = 0;
      return;
    }
    rt.obj('main', HI(rt) ? 'しんがりの一手を預かり、朝倉勢を止めて主力を退かせよ' : 'しんがりとして朝倉勢を止め、主力を退かせよ', 'main');
    rt.obj('stay', HI(rt) ? '預かった手を持ち場から動かすな。退く時は組をまとめて退け' : '下知があるまで持ち場を守れ。深追いするな', 'order');
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', { h: 3.2 });
    rt.marker('holdLine', L, L.name, { h: 2 });
    rt.after(14, () => rt.unmark('kino'));
    rt.say('木下藤吉郎', `${nm(rt)}、わしらはしんがりじゃ。主力が退くまで追手を止めるぞ`, 4);
    rt.say('木下藤吉郎', 'この旗のそばを守れ。退けの下知が出たら、組を連れて下がれ', 4);
    rt.after(9, () => this.wave1(rt));
    F.t0 = 0;
  },

  // 主力の退去は内部の目安。足軽へ正確な残り秒を知らせない。
  retreatPct(rt) { return Math.min(100, Math.round((rt.flags.prog ?? rt.t) / RETREAT_T * 100)); },
  tickProg(rt, dt) {
    const F = rt.flags;
    F.prog = F.prog ?? 0;
    const cur = F.step === 1 ? F.w1 : F.step === 3 ? F.w2 : F.step === 5 ? F.w3 : null;
    const live = cur ? cur.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0) : 0;
    let k = F.breachT > 0 ? 0 : 1;
    if (cur && !live) k += 0.4;                       // 寄せが途切れた間は、主力がはかどる
    if (F.kino.count < F.kino.initial * 0.45) k -= 0.35;   // 殿の備が崩されかけると、主力の退きが遅れる
    F.prog += dt * k;
  },

  // ① 一の備：朝倉の先手
  wave1(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('l1');
    sfx('taiko', 1);
    rt.after(0.6, () => sfx('horagai', 0.8));
    rt.banner('朝倉勢、寄せ来る', '木ノ芽峠の道から、朝倉の先手');
    rt.say('足軽', '来たぞ！　三つ盛木瓜の旗じゃ！', 2.5);
    rt.say('明智光秀', '鉄砲は槍の横へ。味方の前を横切って撃つな', 3);
    rt.after(6, () => rt.say('木下藤吉郎', '峠の口を槍で塞げ。多勢でも並んでは来られぬ', 3.5));
    F.w1 = [
      enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 6, z: -92 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }], ASAKURA)),
    ];
    rt.marker('w0', centerOf(F.w1[0]), () => `朝倉の先手・旗が見える`, { red: true, group: F.w1[0] });
    rt.after(14, () => {
      if (rt.over || F.ending || F.step !== 1) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の東の追手', anchor: HIKIDA_FROM, facing: HIKIDA_FACING, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 95, fleeDir: { x: 1, z: 0.3 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_m', haori: 0x5a4020 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 2 }], ASAKURA));
      for (const u of g.units) if (u.type === 'busho') { u.announced = true; }
      F.w1.push(g);
      rt.say('足軽', '東の道からも来る！　朝倉の旗じゃ！', 3);
      rt.marker('w1', centerOf(g), () => `朝倉の東の追手・旗が見える`, { red: true, group: g });
    });
  },

  // 段を重ねる（b_depth.js）：A 一の備の総掛かり → B 笙の川の渡り → C 夜の狭路
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    rt.objRemove('back'); rt.unzone('line'); rt.unmark('line'); rt.unmark('holdLine');
    for (const k of ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']) rt.unmark(k);
        const after = () => {
      F.dpOn = false;
      if (F.ending || F.fleeing) return;
      if (F.dpMem?.kgFailed) { this.collapse(rt); return; }
      if (which === 'A') {
        if (F.cl) F.cl.rout('A', { hideAfter: 30, from: -1 });
        this.fallBack(rt, 1);
      } else if (which === 'B') this.fallBack(rt, 2);
      else this.collapse(rt);
    };
    if (which === 'A') this.lineClash(rt);
    depthStart(rt, kgCtx(rt), which === 'A' ? kgA() : which === 'B' ? kgB() : kgC(), after);
  },
  // 一の備の西の田で、殿の他の手と朝倉の大軍が組み合う（軽い作り）。寄せの厚みを見せる
  lineClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    F.cl = clash(rt, { x: -40, z: -58, facing: Math.PI, w: 44, gap0: 30, closeSpeed: 3.4, seed: 1577, noRout: true, killRate: 0.14,
      surge: { k: 'B', every: 40, count: 140, flank: 0.35 },
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 320, team: 0, faction: 'oda' },
      B: { flag: 'asakura', armor: ASAKURA.armor, count: 620, team: 1, faction: 'saito', guns: true, flagRate: 0.5 } });
    F.cl.push('B', 0.3);
    rt.after(1, () => F.cl.go());
  },

  // 繰り引き：次の備まで退く（残った者が追ってくる）
  fallBack(rt, k) {
    const F = rt.flags;
    if (F.line >= k) return;
    F.line = k;
    F.step = k * 2;            // 2：二の備へ ／ 4：三の備へ
    F.stepT = rt.t;
    rt.setPhase('back' + k);
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2'); rt.unmark('w3');
    rt.unmark('holdLine');
    const L = LINES[k];
    sfx('kane', 0.9);
    rt.banner('退け！', `${L.name}まで繰り引き`);
    battleEvent(rt, EVENT_RETREAT, L, F.kino, 0, true, `${L.name}へ退く`);
    messengerOrder(rt, rt.player.u, HI(rt) ? '使番' : '組頭', HI(rt) ? '木下様より下知！　預かった手を次の備へ退かせよ！' : '退けの下知じゃ！　組の者は旗について次の備へ下がれ！');
    rt.say('木下藤吉郎', k === 1 ? `退けぇっ！　笙の川の南まで下がる！　${rt.G.lord ? '者ども' : nm(rt)}、遅れるな！` : '次の備じゃ！　狭路まで退け！　あそこなら大勢でも横に広がれぬ', 4);
    if (!rt.G.lord) {
      rt.objRemove('stay'); rt.objRemove('dp');
      rt.obj('main', '味方と次の持ち場へ退け。追手と戦い続けるな', 'main');
      // 下知と同時に、自分の組にも「ついて来い」
      for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
      rt.obj('back', rt.squad.length ? `組を連れて${L.name}まで退け` : `${L.name}まで退け`, 'order');
      rt.zone('line', L.x, L.z, L.r);
      rt.marker('line', { x: L.x, z: L.z }, L.name, { h: 2 });
    }
    // 明智の鉄砲が先に下がって、次の備で待ち受ける
    const put = (g, dx, dz, f = Math.PI) => retreatGroup(g, L.x + dx, L.z + dz, f, (g === F.akechi || g === F.gunsEast) ? 'line' : 'yari');
    put(F.akechi, 8, 9); put(F.gunsEast, 16, 9);
    rt.after(3, () => { put(F.ikeda, -8, 2); put(F.kino, 0, 0); });
    // 寄せ手の士気は下げない。殿が退いても敵は追う。
    // 自分が着くまで、退く札と印を保つ。信長の退きでは殿だけ先に進める。
    if (rt.G.lord) rt.after(k === 1 ? 4 : 3, () => (k === 1 ? this.wave2(rt) : this.wave3(rt)));
  },

  // ② 二の備：騎馬の追手が笙の川を渡ってくる
  wave2(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('l2');
    if (!rt.G.lord) rt.obj('stay', '川岸の備を守れ。下知までは退くな', 'order');
    if (!rt.G.lord) rt.obj('main', '笙の川の南で、朝倉の騎馬を受け止めよ', 'main');
    sfx('taiko', 1);
    rt.banner('追い討ち', '朝倉の騎馬が追ってくる');
    rt.say('足軽', '騎馬じゃ！　川を渡ってくるぞ！', 2.5);
    rt.say('木下藤吉郎', '槍を揃えよ！　川を渡りきる所を突け！', 3);
    const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の騎馬の追手', anchor: { x: 4, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 3.6 },
      dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 10 }], ASAKURA));
    const g2 = enemyGroup(rt, { faction: 'saito', name: '朝倉の追手', anchor: { x: -30, z: -84 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 2.8 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASAKURA));
    F.w2 = [g, g2];
    rt.marker('w2', centerOf(g), () => `騎馬の追手・旗が見える`, { red: true, group: g });
    rt.marker('w3', centerOf(g2), () => `朝倉の追手・旗が見える`, { red: true, group: g2 });
  },

  // ③ 三の備：朝倉の後続
  wave3(rt) {
    const F = rt.flags;
    if (F.step !== 4 || F.ending) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('l3');
    if (!rt.G.lord) rt.obj('stay', '狭路の備を守れ。深追いするな', 'order');
    if (!rt.G.lord) rt.obj('main', '狭路で朝倉の本隊を食い止めよ', 'main');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 1));
    rt.banner('朝倉の本隊', '主力が退ききるまで、狭路を守れ');
    rt.say('足軽', 'また来た……！　今度は大勢じゃ！', 2.5);
    rt.say('木下藤吉郎', '主力が若狭へ抜けるまでじゃ！　この道を通すな！', 3.5);
    rt.say('池田勝正', '池田の者ども、木下殿に遅れを取るな！', 3);
    const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の本隊', anchor: { x: -6, z: -10 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 16, morale: 100, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.4, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_w', haori: 0x4a3a1a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 2 }], ASAKURA));
    for (const u of g.units) if (u.type === 'busho') { u.announced = true; }
    F.w3 = [g];
    // 苦しい戦：本隊の後ろから、もう一つの備が続いて狭路へ押し込む（大軍の厚み）
    rt.after(10, () => { if (F.ending || F.step !== 5) return;
    const g1b = enemyGroup(rt, { faction: 'saito', name: '朝倉の二の備', anchor: { x: 14, z: -30 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 14, morale: 95, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.6, speed: 2.6 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], ASAKURA));
    F.w3.push(g1b);
    rt.say('足軽', '後ろからもう一つ備が来る……！', 2.5);
    rt.after(16, () => { if (!F.ending) g1b.noRout = false; });
    });
    rt.after(13, () => {
      if (F.step !== 5 || F.ending) return;
      const g2 = enemyGroup(rt, { faction: 'saito', name: '朝倉の新手', anchor: { x: 30, z: 0 }, facing: -0.3, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.42, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ASAKURA));
      F.w3.push(g2);
      rt.say('足軽', '東の畦からも回り込んでくる！', 2.5);
      rt.marker('w5', centerOf(g2), () => `朝倉の新手・旗が見える`, { red: true, group: g2 });
    });
    rt.after(20, () => { if (!F.ending) g.noRout = false; });
    rt.marker('w4', centerOf(g), () => `朝倉の本隊・旗が見える`, { red: true, group: g });
    // 数分の守備で昼夜を飛ばさない。谷の鉄砲は昼のまま受ける。
  },

  // 殿も残兵と退く。早く崩れた場合は、退けても任務失敗。
  collapse(rt) {
    const F = rt.flags;
    if (F.ending || F.fleeing) return;
    F.fleeing = rt.t;
    F.collapseCounts = kgFlagCounts(rt);
    F.exitReady = (F.prog || 0) >= RETREAT_T && !F.dpMem?.kgFailed;
    if (!F.exitReady && F.collapseWarnAt === undefined) rt.bark('味方の陣が崩れかけている。残った組を呼び、退き道へ集まれ', true);
    if (F.dp) F.dp.on = false; F.dpOn = false;
    F.akechi.holdFire = false; F.gunsEast.holdFire = false;
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.setPhase('flee');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    sfx('kane', 1);
    rt.banner(F.exitReady ? '殿も退け' : '備が崩れる', '残った者を集め、若狭へ向かう道へ退け');
    rt.say('木下藤吉郎', F.exitReady ? '主力は退いた。組をまとめ、わしらも下がるぞ！' : '殿の任務は果たせぬ。されど生きて戻れ。残った者を連れて下がれ！', 4.5);
    rt.objRemove('stay'); rt.objRemove('back'); rt.unmark('holdLine');
    rt.obj('main', '残った味方と、若狭へ向かう道まで退け', 'main');
    rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '若狭へ向かう道', { h: 2 });
    rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
    for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
    for (const g of F.tono) if (g && g.count && !g.routed) retreatGroup(g, KUTSUKI.x + 6, KUTSUKI.z - 6, Math.PI, 'column');
  },
  fleeTick(rt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    if (rt.t >= (F.exitNoticeAt || 0)) {
      F.exitNoticeAt = rt.t + 1;
      let waiting = '';
      for (let i = 0; i < 3; i++) {
        const u = i === 0 ? F.kinoU : i === 1 ? F.akeU : F.ikedaU;
        const name = i === 0 ? '藤吉郎' : i === 1 ? '光秀' : '池田勝正';
        if (!sightPoint(rt, u.pos, 60)) continue;
        if (!u.alive || u.woundOut) { waiting = u.alive ? `${name}は深手で退いている。治るのを待たず、退き口で合流せよ` : `${name}は討たれた。この任務は果たせぬ。残った組を集めよ`; break; }
        if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) >= 30) { waiting = `${name}が退き道へ向かっている。組と旗の下で待て`; break; }
      }
      let near = 0, alive = 0;
      for (const g of F.tono) for (const u of g.units) if (kgActive(u)) {
        alive++; if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
      }
      for (const g of rt.squadGroups) for (const u of g.units) if (kgActive(u)) {
        alive++; if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
      }
      F.exitWaiting = waiting || (near < (F.exitReady ? Math.ceil(alive * 0.6) : alive) ? `退き道に集まった味方 ${near}／${alive}人・組を呼べ` : '組はそろった。三将の旗の到着を確かめよ');
    }
    rt.objProgress('main', d < KUTSUKI.r ? F.exitWaiting : `若狭へ向かう道まで ${Math.max(0, Math.round(d - KUTSUKI.r))}歩ほど`);
    if (d < KUTSUKI.r && this.escortReady(rt) && (F.exitReady || rt.t - F.fleeing >= 15)) {
      rt.unmark('kutsuki'); rt.unzone('kutsuki');
      if (F.exitReady) this.win(rt, '残った味方と、若狭へ向かう道へ退いた');
      else this.lose(rt, '主力が退く前に備が崩れた。残兵と退いたが、殿の任務は果たせなかった');
      return;
    }
    // 残兵が集まるまでは、退去の期限だけで敗北にしない。
    if (d >= KUTSUKI.r && rt.t - F.fleeing >= 85 && !F.exitLateWarn) {
      F.exitLateWarn = true;
      rt.bark('退き道へ急げ。残った組を呼び、旗の下へ集まれ', true);
    }
  },
  // 退き口に着けぬまま、朝倉に呑まれた
  lose(rt, sub = '朝倉勢が狭路を抜け、退く主力の背に追いすがった') {
    // 主力への突破、持ち場への退き遅れ、残兵の合流で結末を出す。
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    for (const id of ['dp', 'back', 'stay']) {
      const task = rt.orderObjectives?.get(id) || rt.objectives.find((o) => o.id === id);
      if (task && !task.state) rt.objFail(id);
    }
    if (F.dp) F.dp.on = false; F.dpOn = false;
    for (const id of ['dp', 'line', 'holdLine', 'w4', 'w5', 'kutsuki']) { rt.unmark(id); rt.unzone(id); }
    F.akechi.holdFire = false; F.gunsEast.holdFire = false;
    rt.tracker.main = false;
    rt.banner('しんがり、崩れる', sub);
    rt.say('木下藤吉郎', '……ここまでか。散れ、散って生き延びよ！', 4);
    rt.finish({ scriptedEnd: true, failureReason: `${sub}。${F.collapseCounts || kgFlagCounts(rt)}` }, 9);
  },

  // 退き口成る
  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    rt.objDone('main');
    if (!F.strayed) rt.objDone('stay');
    rt.tracker.main = true;
    F.prog = RETREAT_T;
    rt.award((t) => { t.main = true; t.special = { label: '金ヶ崎の殿を務めた', pts: 25 }; }, '任務達成・退き口成る');
    survival(rt, '金ヶ崎のしんがりを生き延びた');
    sfx('horagai', 0.8);
    rt.banner('退き口成る', how);
    rt.say('木下藤吉郎', '最後の列も退いた。残った者を集めよ！', 4);
    rt.say('木下藤吉郎', `${nm(rt)}、よく守った。残った者と京へ戻るぞ！`, 3.5);
    rt.after(4, () => rt.say('木下藤吉郎', '京で兵を立て直す。次は近江の浅井に備えるぞ', 3));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    if (!F.ending) this.tickProg(rt, dt);
    pursuersTick(rt);
    // 近づいて実兵になった主力も、殿へ反転せず道を退く。
    for (const g of rt.army.groups) {
      if (g.kgMarch) continue;
      for (const u of g.units) if (u.wkFrom?.A.kgRetreat) {
        g.kgMarch = true; retreatGroup(g, -70, 174, Math.PI, 'column'); break;
      }
    }
    messengerTick(rt);
    const pct = this.retreatPct(rt);
    // 織田の主力：道を南西へ退き、朽木の方で見えなくなる
    const k = pct / 100;
    for (let i = 0; i < F.main.length; i++) {
      const a = F.main[i];
      const t = Math.min(1, Math.max(0, k * 1.4 - i * 0.05));
      const pathT = (5 + i * 0.2) + (ROAD.length - 1 - (5 + i * 0.2)) * t;
      const q = Math.min(ROAD.length - 2, Math.floor(pathT)), f = pathT - q;
      moveDA(rt, a, ROAD[q][0] + (ROAD[q + 1][0] - ROAD[q][0]) * f, ROAD[q][1] + (ROAD[q + 1][1] - ROAD[q][1]) * f);
      if (t >= 1) {
        const exitT = a.exitT = (a.exitT || 0) + dt;
        moveDA(rt, a, ROAD[ROAD.length - 1][0] - exitT * 2, ROAD[ROAD.length - 1][1] + exitT * 2);
        // 目の前で列を消さない。道を歩いた位置のまま見通しへ任せる。
        a.m.visible = true;
      }
    }
    // 北の列は南へ、東の列は湿地の南から西へ。殿の実兵の列へ遠景を重ねない。
    for (let i = 0; i < F.host.length; i++) {
      const a = F.host[i];
      if (i === 2) {
        const t = Math.min(1, rt.t / 32);
        moveDA(rt, a, a.x0 + (28 - a.x0) * t, a.z0 + (-38 - a.z0) * t);
        continue;
      }
      // 見続けても寄せは止まらない。列ごと道へ寄り、殿の北から追う。
      const z = Math.min(LINES[F.line].z - 42, a.z + dt * 1.8);
      let x = a.x;
      for (let j = 0; j < ROAD.length - 1; j++) {
        const b = ROAD[j], c = ROAD[j + 1];
        if (z < b[1] || z > c[1]) continue;
        const lane = b[0] + (c[0] - b[0]) * (z - b[1]) / (c[1] - b[1]) - (i === 1 ? 24 : 0);
        x += Math.max(-dt * 1.8, Math.min(dt * 1.8, lane - x));
        break;
      }
      moveDA(rt, a, x, z);
    }
    if (F.ending || !rt.player.u.alive) return;
    if (!F.woundAdvice && rt.player.u.hp < rt.player.u.maxHp * 0.55) {
      F.woundAdvice = true; rt.bark('深手じゃ。敵に向いて構え、味方の槍の列へ下がれ', true);
    }
    // 主力の列へ追手が取り付いたままなら、時間だけで退去を成功にしない。
    let caught = false;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 1 || u.fleeing || u.woundOut || u.noTarget) continue;
      for (const a of F.main) if (a.m.visible && Math.hypot(u.pos.x - a.x, u.pos.z - a.z) < 9) { caught = true; break; }
      if (caught) break;
    }
    F.breachT = caught ? (F.breachT || 0) + dt : 0;
    if (!rt.G.lord && caught && !(F.breachWarnAt > rt.t)) { F.breachWarnAt = rt.t + 8; rt.bark('追手が主力の列へ！　味方と退き道を守れ！', true); }
    if (!rt.G.lord && !F.fleeing && F.breachT > 23) { this.lose(rt, '追手が主力の列へ取り付き、退き道を守れなかった'); return; }
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    if (F.fleeing) { this.fleeTick(rt); return; }
    let ready = 0;
    for (const g of F.tono) for (const u of g.units) if (kgActive(u)) ready++;
    const initial = F.kino.initial + F.ikeda.initial + F.akechi.initial + F.gunsEast.initial;
    // 急な大損害でも、知らせてから十五秒は立て直す猶予を残す。
    if (ready < Math.ceil(initial * 0.4) && F.collapseWarnAt === undefined) {
      F.collapseWarnAt = rt.t;
      rt.bark('味方の陣が崩れかけている。旗のそばで持ち場を守って斬れ', true);
    }
    if (ready < Math.ceil(initial * 0.25)) {
      if (rt.t - F.collapseWarnAt >= 15) { this.collapse(rt); return; }
    } else if (ready >= Math.ceil(initial * 0.4)) F.collapseWarnAt = undefined;
    // 敵の歩み（約毎秒二〜三歩）を見て、斬り合いより十秒ほど前に構えを促す。
    if (!(F.guardScanAt > rt.t) && F.step % 2 === 1) {
      F.guardScanAt = rt.t + 0.5;
      if (F.guardWarnLine !== F.line && rt.army.nearestEnemy(rt.player.u, 34, u => kgActive(u) && !u.isStruct && u.type !== 'dummy')) {
        F.guardWarnLine = F.line;
        rt.bark('敵が寄せる。槍を構えよ。味方の槍の列の後ろで迎え撃て', true);
      }
    }
    depthTick(rt, dt);
    if (F.fleeing || F.ending) return;
    if (F.dpOn) {
      // 大損害の判定は段の間も共通して行う。
      const tono = F.kino.count + F.ikeda.count, tono0 = F.kino.initial + F.ikeda.initial;
      if (tono <= Math.round(tono0 * 0.4) && !F.tonoWarn) { F.tonoWarn = true; rt.bark('しんがりが崩れかけている！　踏みとどまれ！', true); }
      rt.objProgress('main', F.breachT > 0 ? '追手が主力に取り付き、退去が止まっている。退き道を守れ' : F.kino.count < F.kino.initial * 0.45 ? 'しんがりの損害で主力の退きが遅れている。旗のそばを守れ' : '下知まで備を守れ。深追いするな');
      return;
    }
    rt.objProgress('main', F.step === 2 || F.step === 4 ? '旗の印へ退け。組と味方を連れて下がれ' : '主力が退くまで備を守れ');
    // 持ち場を離れて北へ深追いしたか
    const L = LINES[F.line];
    const ahead = L.z - p.z;
    if ((F.step === 1 || F.step === 3 || F.step === 5) && ahead > 38 && !F.strayed) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('殿の持ち場を離れて深追いした', ['木下藤吉郎', '戻れ！　殿は勝つための戦ではない、退くための戦じゃ！']); rt.objFail('stay'); }
    } else F.strayT = 0;
    // 退く途中：自分が次の備に着いたか
    if (F.step === 2 || F.step === 4) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      rt.objProgress('back', d < L.r ? '味方の到着を待て' : `次の備の輪まで ${Math.max(0, Math.round(d - L.r))}歩ほど・組を連れて退け`);
      if (d < L.r && !F['in' + F.line] && F.tono.every((g) => gone(g) || Math.hypot(g.center().x - L.x, g.center().z - L.z) < 30)) {
        F['in' + F.line] = true;
        rt.objDone('back'); rt.objRemove('back'); rt.unzone('line'); rt.unmark('line');
        rt.award((t) => t.side.push(`${L.name}へ退いた`), `${L.name}へ退いた`);
        rt.say('木下藤吉郎', 'よし、揃ったな。槍を立てよ！', 2.5);
        if (F.line === 1) this.wave2(rt); else this.wave3(rt);
        return;
      }
      if (rt.t - F.stepT > 90) { this.lose(rt, '次の備へ退けず、朝倉の追手に退き道を断たれた'); return; }
      if (rt.t - F.stepT > 30 && d > L.r + 20 && !(F.lateT > rt.t)) {
        F.lateT = rt.t + 12;
        rt.bark(`${L.name}へ急げ！　取り残されるぞ`, true);
        // 取り残されると組の士気が落ち、藤吉郎が使番をよこして呼び戻す
        for (const g of rt.squadGroups || []) g.morale = Math.max(10, (g.morale || 0) - 8);
        if (!F['late' + F.line]) { F['late' + F.line] = true; messengerOrder(rt, rt.player.u, '使番', HI(rt) ? `木下様より！　${nm(rt)}殿、預かった手を連れて早う退け！` : '木下様より退けとの下知！　組頭の旗について下がれ！'); }
      }
    }
    if (F.step === 1) {
      const all = F.w1.filter((g) => !gone(g));
      if ((F.w1.length >= 2 && !all.length) || rt.t - F.stepT > 28) this.deep(rt, 'A');
      // 東の追手。隊が弱れば崩れて退く
      if (F.w1[1] && !F.w1[1].kgPending && F.w1[1].count < 7) { F.w1[1].noRout = false; F.w1[1].morale = Math.min(F.w1[1].morale, 20); }
    }
    if (F.step === 3) {
      if (F.w2.every(gone) || rt.t - F.stepT > 22) this.deep(rt, 'B');
    }
    if (F.step === 5) {
      rt.objProgress('main', '追手を通すな。退けの下知を待て');
      // 追手の本隊。隊が弱れば崩れて退く
      if (!F.w3[0].kgPending && F.w3[0].count < 8) { F.w3[0].noRout = false; F.w3[0].morale = Math.min(F.w3[0].morale, 20); }
      // 本隊の寄せを凌いだら（あるいは長く持ちこたえたら）、夜の狭路の段へ。済めば退き口成る
      if ((F.w3more && !F.w3pending && F.w3.every(gone)) || rt.t - F.stepT > 40) this.deep(rt, 'C');
      else if (F.w3.length >= 2 && F.w3.every(gone) && !F.w3more) {
        // 早く崩しすぎたら、もう一押しが来る
        F.w3more = true; F.w3pending = true;
        rt.after(6, () => {
          F.w3pending = false;
          if (F.ending || F.step !== 5 || F.dpOn) return;
          const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の後続', anchor: { x: 0, z: -20 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 2.8 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], ASAKURA));
          F.w3.push(g);
          rt.say('木下藤吉郎', 'まだ来るか。主力が抜けるまで、あと少しじゃ！', 3);
        });
      }
    }
  },

  // 信長で遊ぶ時：殿の戦いは後ろで続き、信長は旗本と若狭へ向かう道へ退く。追手の騎馬が道を追ってくる
  lordTick(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    rt.objProgress('main', d < KUTSUKI.r ? '残った旗本を待て' : `退き道まで ${Math.max(0, Math.round(d - KUTSUKI.r))}メートル`);
    if (d >= KUTSUKI.r || !this.escortReady(rt, true)) return;
    F.ending = true;
    rt.setPhase('end'); rt.unmark('kutsuki'); rt.unzone('kutsuki');
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '旗本と若狭へ退いた');
    rt.banner('若狭へ退く', 'ここから山道を越え、朽木の案内で京へ向かう');
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true }, 10);
  },

  escortReady(rt, lord = false) {
    const F = rt.flags;
    let initial = 0, alive = 0, near = 0;
    for (let side = 0; side < 2; side++) {
      const groups = side === 0 ? (lord ? rt.squadGroups : F.tono) : (lord ? null : rt.squadGroups);
      if (!groups) continue;
      for (const g of groups) {
        initial += g.initial || 0;
        for (const u of g.units) if (kgActive(u)) {
          alive++;
          if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
        }
      }
    }
    // 任務失敗後は残兵全員の合流を待つ。七人残れば七人を集める。
    if (!lord && !F.exitReady) return near === alive;
    if (!lord && (alive < Math.ceil(initial * 0.25) || !F.kinoU.alive || !F.akeU.alive || !F.ikedaU.alive)) return false;
    return alive > 0 && near >= Math.ceil(alive * 0.6) && (lord || (Math.hypot(F.kinoU.pos.x - KUTSUKI.x, F.kinoU.pos.z - KUTSUKI.z) < 30 && Math.hypot(F.akeU.pos.x - KUTSUKI.x, F.akeU.pos.z - KUTSUKI.z) < 30 && Math.hypot(F.ikedaU.pos.x - KUTSUKI.x, F.ikedaU.pos.z - KUTSUKI.z) < 30));
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1) {
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、退く`, '深手を負い、後ろへ担ぎ込まれた');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (rt.over || F.ending || !sightPoint(rt, g.center()) || g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 殿と追手の配分は仮の目安。見える兵の死傷を全軍へ固定倍率で掛けない。
kanegasaki.force = () => ({ a: 3000, a0: 3000, b: 16000, b0: 16000 });
kanegasaki.sides = { a: { name: '織田軍の殿（数は目安）', mon: 'oda' }, b: { name: '朝倉の追手（数は目安）', mon: 'asakura' } };
kanegasaki.famous = [];
kanegasaki.date = () => '元亀元年四月の退き口';
kanegasaki.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '朝倉の寄せまで待つ' : '';
kanegasaki.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) kanegasaki.wave1(rt); };
kanegasaki.history = '元亀元年四月、織田信長は越前の朝倉義景を攻め、手筒山城と金ヶ崎城を落とした。ところが妹・お市の夫である北近江の浅井長政が朝倉方につき、織田勢は前後を挟まれる形になった。信長はわずかな供で朽木越えに京へ逃れた。信長公記は金ヶ崎に木下藤吉郎を残したと記し、太閤記などは明智光秀・池田勝正らも殿に加わったと伝える（金ヶ崎の退き口）。殿が細い道で鉄砲を使って追手を止めたとも言われるが、細かな布陣は確かではない。お市が両端を縛った小豆の袋を送って危うさを知らせたという話は、後の書物に出るもので確かではない。この戦の後、信長は兵を立て直し、六月に姉川で浅井・朝倉と戦った。追いすがった朝倉の将の名は伝えによって違い、この戦では無名の侍大将とする。局地の三つの備、笙の川の橋と渡り、谷の射撃、昼の景色と風は復元であり、当日の記録ではない。浅井の離反は知らせで扱い、敦賀で浅井本隊と直接戦ったとは断定しない。地点の間隔を縮めており、最後の退き道は若狭方面への出口で、朽木谷そのものではない。信長は朽木の案内で谷を越え、四月晦日に京へ入った。';

// 素直な遊び手：持ち場の備のそばで寄せ手を突き、「退け」の下知が出たら次の備へ走る
// 下知が出たら追手との斬り合いに居残らず、味方と同じ道を退く。
// 道の少し先を選び、川や谷の曲がりを直線で横切らない。
function botRetreat(b, inp, goTo, goal, radius) {
  const p = b.player, u = p.u;
  let x = goal.x, z = goal.z, r = radius;
  if (u.pos.z < goal.z - 6) {
    z = Math.min(goal.z, u.pos.z + 6);
    for (let i = 0; i < ROAD.length - 1; i++) {
      const a = ROAD[i], c = ROAD[i + 1];
      if (z < a[1] || z > c[1]) continue;
      x = a[0] + (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1]);
      r = 1;
      break;
    }
  }
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
  goTo(p, inp, x, z, r);
  const walking = inp.k.has('KeyW'), walkYaw = p.yaw;
  const foe = b.army.nearestEnemy(u, 6, (o) => !o.fleeing && !o.noTarget &&
    o.type !== 'gun' && o.type !== 'bow' && Math.abs(o.pos.y - u.pos.y) < 3 &&
    !b.army.wallBetween(u.pos, -1, o.pos, false));
  inp.runHeld = !foe && walking;
  if (!foe) return;
  if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  inp.guardHold = true;
  inp.k.delete('KeyW');
  if (!walking) return;
  const angle = walkYaw - p.yaw;
  if (Math.abs(Math.cos(angle)) > 0.3) inp.k.add(Math.cos(angle) > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(Math.sin(angle)) > 0.3) inp.k.add(Math.sin(angle) > 0 ? 'KeyA' : 'KeyD');
}

kanegasaki.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (!u.alive || F.ending) return;
  if (F.fleeing || b.G.lord) { botRetreat(b, inp, goTo, KUTSUKI, 6); return; }
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  const L = LINES[F.line];
  // 退く途中は、まず次の備へ
  if ((F.step === 2 || F.step === 4) && !F['in' + F.line]) {
    botRetreat(b, inp, goTo, L, 3);
    return;
  }
  // 傷は自然には戻らない。手当てを使い終えたら、持ち場へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.6 && canTreat) b.botRest = true;
  if (!canTreat || u.hp >= u.maxHp * 0.6) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.runHeld = false;
    if (p.treatmentReady) inp.k.add('KeyE');
    else goTo(p, inp, L.x, L.z + 4, 2);
    return;
  }
  const e = b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln && L.z - o.pos.z < 30);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 共通の頭と同じく、自分への打ち込みを受け、構えを解く半秒を待って突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, L.x + 3, L.z + 3, 3);
};

// 金ヶ崎だけの段。下知で次へ移る。追手の士気・生存・傷は段が終わっても変えない。
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
function kgCtx(rt) { return { friends: () => rt.flags.tono, routeFight: true, botSeek: 40, botSeekHold: true }; }
function kgHold(line, dur, waves, ambush = false) {
  const L = LINES[line];
  return {
    kind: 'hold', max: line === 2 ? dur + RETREAT_T : dur + 1,
    start(rt, C) {
      C.at = L; C.goal = L; C.botRadius = L.r + 8; C.inT = 0; C.waves = waves.slice();
      C.nextReserve = 32;
      C.reserve = { t: 0, name: '朝倉の後続の槍組', from: line === 0 ? { x: 6, z: -100 } : line === 1 ? { x: 8, z: -32 } : { x: -6, z: 46 }, list: [uS(2), uA(12)] };
      // 旗の周囲にいる先手も段の追手として探す。自分から十四歩を越えても、
      // 持ち場の範囲に入った敵は迎え撃つ（旗の外へは追わない）。
      for (const g of rt.flags['w' + (line + 1)] || []) C.groups.push(g);
      // 守る段では、この持ち場の下知だけを残す。古い主任務へ戻さない。
      rt.objRemove('main'); rt.objRemove('stay');
      rt.obj('dp', ambush ? '槍の備の後ろから、追手を谷へ引きつけよ' : `${L.name}を守れ。退けの下知を待て`, 'main');
      rt.marker('dp', L, L.name, { h: 2 }); rt.zone('dp', L.x, L.z, L.r);
      if (ambush) {
        for (let side = 0; side < 2; side++) {
          const g = side === 0 ? rt.flags.akechi : rt.flags.gunsEast;
          g.holdFire = true;
          g.order = 'move'; g.dest = { x: L.x + (side === 0 ? -10 : 10), z: L.z + 8 }; g.formation = 'column';
          g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = gg.dest; gg.facing = side === 0 ? Math.PI * 0.85 : -Math.PI * 0.85; gg.formation = 'line'; };
        }
        rt.say('明智光秀', '鉄砲は左右で待て。追手が谷へ入ったら、両側から撃つぞ', 3.5);
      }
    },
    tick(rt, C, m, ctx, el, dt) {
      // 寄せを早く崩しても待つだけにしない。八秒ごとに数え、新手は二十八秒あける。
      if (el >= C.nextReserve && !C.waves.length && el < dur + RETREAT_T &&
        (el < dur || line === 2 && (rt.flags.prog || 0) < RETREAT_T)) {
        C.nextReserve = el + 8;
        let live = 0;
        for (const g of C.groups) if (!gone(g)) for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) live++;
        }
        if (live < 6) { C.waves.push({ ...C.reserve, list: C.reserve.list.map(e => ({ ...e })) }); C.nextReserve = el + 28; }
      }
      for (let i = C.waves.length - 1; i >= 0; i--) {
        const w = C.waves[i];
        if (el < w.t) continue;
        C.waves.splice(i, 1);
        const g = enemyGroup(rt, { faction: 'saito', name: w.name, anchor: w.from, facing: 0, order: 'attack', seekRange: 140,
          width: 10, aggro: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.8, formation: w.gun ? 'line' : 'yari' }, dress(w.list, ASAKURA));
        C.groups.push(g);
      }
      if (ambush && !C.fired) {
        let entered = false;
        for (const g of C.groups) if (!gone(g)) for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.pos.z < L.z && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) < 26) { entered = true; break; }
        }
        // 移動に手間取っても撃つ下知を閉じ込めない。
        if (entered && rt.flags.akechi.order === 'hold' && rt.flags.gunsEast.order === 'hold' || el >= 40) {
          C.fired = true;
          rt.flags.akechi.holdFire = false; rt.flags.gunsEast.holdFire = false;
          rt.say('明智光秀', entered ? '谷へ入ったぞ。左右の鉄砲、放て！' : '鉄砲、撃て！　槍の備を支えよ！', 2.5);
          rt.banner('左右の鉄砲、放て', '槍の備のそばで追手を止めよ');
          rt.obj('dp', '鉄砲の間の槍列を守れ。追手を通すな', 'main');
        }
      }
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - L.x, p.z - L.z) < L.r + 8) C.inT += dt;
      rt.objProgress('dp', Math.hypot(p.x - L.x, p.z - L.z) >= L.r + 8 ? `${L.name}の旗へ戻れ。味方の備を離れるな` : line === 2 && (rt.flags.prog || 0) < RETREAT_T ? rt.flags.breachT > 0 ? '追手が主力に取り付いた。退き道を守り、主力の退去を待て' : rt.flags.kino.count < rt.flags.kino.initial * 0.45 ? '殿の損害で主力の退去が遅い。旗のそばで槍をそろえよ' : '主力がまだ山道を退いている。最後の列が抜けるまで守れ' : '持ち場を守って斬れ。旗のそばで味方と追手を止めよ');
      // 退去が遅れ続けても、この段自身の期限で撤退へ進む。
      if (line === 2 && el >= dur + RETREAT_T && (rt.flags.prog || 0) < RETREAT_T) { m.kgFailed = true; return true; }
      return el >= dur && (line !== 2 || (rt.flags.prog || 0) >= RETREAT_T);
    },
    end(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp');
      if (ambush) { rt.flags.akechi.holdFire = false; rt.flags.gunsEast.holdFire = false; }
      if (m.kgFailed) { rt.objFail('dp'); rt.bark('主力を退かせきれぬ。残った者と退け', true); }
      else if (C.inT < dur * 0.6) { rt.objFail('dp'); m.kgFailed = true; rt.bark(`${L.name}を守りきれぬ。残った組と退け`, true); }
      else rt.objDone('dp');
    },
  };
}
function kgA() {
  return [kgHold(0, 65, [
    { t: 3, name: '朝倉の後続の槍組', from: { x: 6, z: -104 }, list: [uS(2), uA(18)] },
    { t: 24, name: '朝倉の西の備', from: { x: -42, z: -90 }, list: [uS(2), uA(14)] },
  ])];
}
function kgB() {
  return [kgHold(1, 65, [
    { t: 3, name: '橋へ向かう朝倉勢', from: { x: 8, z: -38 }, list: [uS(2), uA(16)] },
    { t: 24, name: '浅瀬へ向かう朝倉勢', from: { x: -50, z: -12 }, list: [uS(2), uA(12)] },
  ])];
}
function kgC() {
  return [kgHold(2, 85, [
    { t: 3, name: '谷道へ続く朝倉勢', from: { x: -8, z: 48 }, list: [uS(2), uA(16)] },
    { t: 30, name: '朝倉の後詰の鉄砲', from: { x: 8, z: 42 }, list: [uS(1), uG(7)], gun: true },
  ], true)];
}

export { kanegasaki };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 96, z: -128, tx: 48, tz: -98, w: 22, R: 65, rise: 50 };
// 海面は世界の高さ -2.2。補正量は読み込み時に一度だけ求める。
// 曲輪の寸法・方位は実測未確認のため据え置き。高さを遊び向けに縮めない。
const KG_SUMMIT_RISE = [
  { ...CASTLE, rise: 86 - 2.2 - baseRelief(CASTLE.x, CASTLE.z) },
  { ...TEZUTSU, rise: 171 - 2.2 - baseRelief(TEZUTSU.x, TEZUTSU.z) },
];
