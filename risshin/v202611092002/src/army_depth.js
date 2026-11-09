// ======================================================================
// 軍勢の厚み・陣立て（army_depth.js。docs/army_depth_spec_1108.md・kaito 11/8）全野戦の共通基盤の「考え」の側
//   Three.js も戦のファイルも読まない（描くのは army_depth_view.js）。戦ごとの差は配置の表だけ（docs/army_depth_howto.md）。
//   army_formation.js（10/29 の備・使番・層の士気）の考えを引き継ぎ、11/8 の仕様で足りない所を足した：
//     層：先鋒→第一線→第二線→予備→旗本・馬廻→本陣→後詰→荷駄 × 左翼・中央・右翼（各翼に先備・二備・予備）
//     備の状態：FORMED→ADVANCING→ENGAGED→DISORDERED→RETREATING→ROUTING→REFORMING と隊列維持度 0〜100
//     層ごとの順番投入・連鎖崩壊・本陣の危機の段（座る→立つ→使番が増える→予備→馬を引かせる→旗本出撃・方円）
//     使番は本陣から馬で走る（位置を持つ。敵の近くで討たれると届かない）。援軍・後詰は 30 秒前から土煙と旗
//     陣形（鶴翼・魚鱗・長蛇・雁行・方円）は数の上乗せでなく、備の置き場と動きの決まり
// 本物の兵（Army の隊）は作らない・消さない・勝ち負けに入れない。重さ：0.5 秒に一度だけ考え、毎コマ new しない。
// ======================================================================

export const LAYERS = ['sakite', 'ichi', 'ni', 'yobi', 'hatamoto', 'honjin', 'gozume', 'konida'];
export const LAYER_NAME = { sakite: '先鋒', ichi: '第一線', ni: '第二線', yobi: '予備', hatamoto: '旗本・馬廻', honjin: '本陣', gozume: '後詰', konida: '荷駄' };
export const WINGS = ['left', 'center', 'right'];
export const ST = { FORMED: 'FORMED', ADVANCING: 'ADVANCING', ENGAGED: 'ENGAGED', DISORDERED: 'DISORDERED',
  RETREATING: 'RETREATING', ROUTING: 'ROUTING', REFORMING: 'REFORMING', AWAY: 'AWAY', APPROACH: 'APPROACH' };
// 本陣の危機の段（31・5）：0 床几に座る／1 立って見る／2 使番が頻繁に走る／3 予備を入れる／4 馬を引かせる／5 旗本・馬廻が出て方円で本陣を守る
export const CRISIS_POSE = ['seated', 'standing', 'standing', 'standing', 'mounted', 'mounted'];

// 縦の並び：第一線を 0 として、後ろへ実の何 m（6：前線→100〜200m→第二線→約100m→予備→100〜300m→本陣）。
const BACK_M = { sakite: -60, ichi: 0, ni: 150, yobi: 260, hatamoto: 440, honjin: 480, gozume: 620, konida: 700 };
const WING_SIGN = { left: -1, center: 0, right: 1 };
const TICK = 0.5;
const SPEED_M = { march: 1.6, charge: 3.4, back: 2.2, rout: 4.2, ride: 9 };   // 実の m/秒

// 一備（300 人）の割り振り（1）。端数は槍へ。
export const ROLE_MIX = { 備大将: 1, 組頭: 6, 槍: 132, 鉄砲: 45, 弓: 20, 徒歩侍: 36, 騎馬: 20, 旗持: 18, 使番: 4, 護衛: 18 };
const MIX_SUM = Object.values(ROLE_MIX).reduce((a, b) => a + b, 0);
export function sonaeRoles(men, out = {}) {
  let left = Math.max(0, Math.round(men));
  out.備大将 = left > 0 ? 1 : 0; left -= out.備大将;
  for (const k of ['組頭', '鉄砲', '弓', '徒歩侍', '騎馬', '旗持', '使番', '護衛']) {
    out[k] = Math.min(left, Math.round(men * ROLE_MIX[k] / MIX_SUM)); left -= out[k];
  }
  out.槍 = left;
  return out;
}
// 見た目の数（24・25）：近景の高品質（本物の兵・戦の側が持つ）／中景の簡略／遠景の軽い兵／それより先は板・旗・群衆。
//   300 人＝24・45・100、1000 人＝60・150・300。近景は軍全体で 250 人の上限（戦の側が守る）。
export function showSplit(men, out = {}) {
  const m = Math.max(0, men);
  out.near = Math.min(60, Math.round(m * 0.08));
  out.mid = Math.min(150, Math.round(m * 0.15));
  out.far = Math.min(300, Math.round(m * 0.33));
  out.board = Math.max(0, Math.round(m) - out.near - out.mid - out.far);
  // 旗（22）：大旗 1・指物 5〜15・小旗（人数で）
  out.bigFlag = m > 0 ? 1 : 0;
  out.sashimono = Math.max(5, Math.min(15, Math.round(m / 60)));
  out.kobata = Math.round(m / 40);
  return out;
}

// 地形が先（15）：谷・山道は長蛇、城攻めは縦列、森は小隊、鶴翼・魚鱗は平地。
export function formationFor(name, terrain = 'plain') {
  if (terrain === 'valley' || terrain === 'road' || terrain === 'mountain') return '長蛇';
  if (terrain === 'castle') return '長蛇';
  if (terrain === 'forest') return '雁行';
  return name || '魚鱗';
}

// ---- 作る ----
// P：{ team, name, honjin:{x,z}, facing（敵の方。0 で +z）, mpu（ゲームの 1 が実の何 m。既定 4）, squeeze（縦の詰め。既定 1）,
//      width（翼の間の実 m。既定 240）, formation, terrain, flag, armor, sonae:[…] }
// sonae の一行：{ id, layer, wing, men, taisho, flag, armor, at:{x,z}（地図の場所を直に）, front, right（表の置き場からのずれ・実 m）,
//      arrive（後詰・援軍の着く秒）, from:{x,z}（援軍の来る方）, hold:true（自分からは出ない）, bind:(rt)=>本物の隊, show:false（描かない）}
export function makeDepthArmy(P) {
  const D = {
    team: P.team ?? 0, name: P.name || '', P,
    honjin: { x: P.honjin?.x || 0, z: P.honjin?.z || 0 },
    facing: P.facing || 0, mpu: P.mpu || 4, squeeze: P.squeeze ?? 1, width: P.width ?? 240,
    terrain: P.terrain || 'plain', formation: formationFor(P.formation, P.terrain),
    sonae: [], couriers: [], events: [],
    crisis: 0, pose: 'seated', crisisAt: 0, foe: null, broken: false,
    rand: P.rand || mulberry(P.seed || 1615 + (P.team || 0)),
    _acc: 0, _t: 0, _courierT: 0,
  };
  for (let i = 0; i < 8; i++) D.couriers.push({ on: false, x: 0, z: 0, to: null, cmd: '', from: 0 });
  (P.sonae || []).forEach((o, i) => D.sonae.push(makeSonae(D, o, i)));
  layoutDepth(D);
  for (const s of D.sonae) { s.x = s.hx; s.z = s.hz; s.tx = s.hx; s.tz = s.hz; }
  // 援軍は来る方（from）に置いておく
  for (const s of D.sonae) if (s.from && s.state === ST.AWAY) { s.x = s.from.x; s.z = s.from.z; }
  return D;
}
function makeSonae(D, o, i) {
  const layer = LAYERS.includes(o.layer) ? o.layer : 'ichi';
  const men = o.men ?? 300;
  const arrive = o.arrive ?? (layer === 'gozume' && o.from ? 150 : 0);
  return {
    i, id: o.id || 'sonae' + i, layer, wing: WINGS.includes(o.wing) ? o.wing : 'center',
    men, nominal: men, taisho: o.taisho || '', taishoAlive: true, flag: o.flag || D.P.flag, armor: o.armor ?? D.P.armor,
    roles: sonaeRoles(men), show: showSplit(men), o,
    state: arrive > 0 ? ST.AWAY : ST.FORMED, since: 0, integrity: 100, cmd: 'hold', hold: !!o.hold,
    arrive, from: o.from || null, warned: false, committed: layer === 'sakite' || layer === 'ichi',
    hx: 0, hz: 0, x: 0, z: 0, tx: 0, tz: 0, face: D.facing, speed: 0,
    contact: false, foeD: Infinity, push: 0, flank: false, foeS: null, lastMen: men,
    bound: !!o.bind, flagPose: 'ordered', bigFlagDown: false, chainHit: false, routT: 0, stagger: 0,
  };
}

// 縦×横の置き場（本陣から）。at があればそこ。陣形で前後左右をずらす（9〜14）。
export function layoutDepth(D) {
  const f = D.facing, fx = Math.sin(f), fz = Math.cos(f), rx = -Math.cos(f), rz = Math.sin(f);
  const u = 1 / D.mpu, form = D.formation;
  for (const s of D.sonae) {
    if (s.o.at) { s.hx = s.o.at.x; s.hz = s.o.at.z; continue; }
    let n = 0, k = 0;
    for (const o of D.sonae) if (!o.o.at && o.layer === s.layer && o.wing === s.wing) { if (o === s) k = n; n++; }
    const w = WING_SIGN[s.wing];
    let front = (BACK_M.honjin - BACK_M[s.layer]) * D.squeeze, right = w * D.width + (n > 1 ? (k / (n - 1) - 0.5) * D.width * 0.5 : 0);
    if (s.layer === 'honjin' || s.layer === 'konida') right *= 0.2;
    if (s.layer === 'hatamoto') right = right * 0.3 + (w || 1) * 50;
    if (form === '鶴翼') { if (w) { front += 60; right *= 1.35; } else front -= 40; }
    else if (form === '魚鱗') { if (w) { front -= 50; right *= 0.7; } else front += 30; }
    else if (form === '雁行') front += w * 70;
    else if (form === '長蛇') { right *= 0.08; front -= Math.abs(w) * 90 + k * 50; }
    front += s.o.front || 0; right += s.o.right || 0;
    s.hx = D.honjin.x + (fx * front + rx * right) * u;
    s.hz = D.honjin.z + (fz * front + rz * right) * u;
  }
}

export function depthEvent(D, text) { D.events.push({ t: D._t, text }); if (D.events.length > 24) D.events.shift(); }
export function sonaeById(D, id) { for (const s of D.sonae) if (s.id === id) return s; return null; }
const clamp = (v, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
const alive = (s) => s.state !== ST.ROUTING && s.state !== ST.AWAY && s.men > 0 && !s.gone;
const broken = (s) => s.gone || s.men <= 0 || s.state === ST.ROUTING || s.state === ST.RETREATING || s.state === ST.DISORDERED && s.integrity < 25;
function setState(D, s, st) { if (s.state === st) return; s.state = st; s.since = D._t; }

// ---- 戦の側から ----
// 下知は使番が運ぶ（29）。cmd：'advance'｜'hold'｜'retreat'。届くまで待つ。
export function depthOrder(D, id, cmd) {
  const s = typeof id === 'string' ? sonaeById(D, id) : id;
  if (!s || !alive(s)) return null;
  for (const c of D.couriers) if (c.on && c.to === s) { c.cmd = cmd; return c; }
  const near = Math.hypot(s.x - D.honjin.x, s.z - D.honjin.z) * D.mpu < 60 || s.layer === 'hatamoto' || s.layer === 'honjin';
  if (near) { applyCmd(D, s, cmd); return null; }   // 本陣のすぐそばは声で届く
  const c = D.couriers.find((q) => !q.on);
  if (!c) { applyCmd(D, s, cmd); return null; }
  c.on = true; c.to = s; c.cmd = cmd; c.from = D._t; c.x = D.honjin.x; c.z = D.honjin.z; c.dead = false;
  return c;
}
export function depthTaishoDown(D, id) {
  const s = typeof id === 'string' ? sonaeById(D, id) : id;
  if (!s || !s.taishoAlive) return;
  s.taishoAlive = false; s.bigFlagDown = true;
  s.integrity = clamp(s.integrity - 30);
  depthEvent(D, (s.taisho || s.id) + ' 討死');
  if (s.layer === 'honjin') for (const o of D.sonae) o.integrity = clamp(o.integrity - 40);
}
// 騎馬の突撃・川渡り・狭い虎口など、戦の側が知る崩れ（18）
export function depthShock(D, id, amount = 15) {
  const s = typeof id === 'string' ? sonaeById(D, id) : id;
  if (s && alive(s)) s.integrity = clamp(s.integrity - amount);
}
export function depthLoss(D, id, n) {
  const s = typeof id === 'string' ? sonaeById(D, id) : id;
  if (s) s.men = Math.max(0, s.men - n);
}
// 台本で崩す・戻す（筋書きが勝ち負けを決める戦のため）
export function depthRout(D, id) { const s = typeof id === 'string' ? sonaeById(D, id) : id; if (s && s.men > 0) startRout(D, s, '台本'); }
export function depthReform(D, id) { const s = typeof id === 'string' ? sonaeById(D, id) : id; if (s && s.men > 0) { s.gone = false; setState(D, s, ST.REFORMING); } }
export function depthCourierKill(c) { if (c && c.on) { c.on = false; c.dead = true; } }

function applyCmd(D, s, cmd) {
  s.cmd = cmd;
  if (cmd === 'advance') { s.committed = true; if (s.state === ST.FORMED || s.state === ST.REFORMING) setState(D, s, ST.ADVANCING); }
  else if (cmd === 'retreat') { if (s.state !== ST.ROUTING) setState(D, s, ST.RETREATING); }
  else if (cmd === 'hold' && s.state === ST.ADVANCING) setState(D, s, ST.FORMED);
}

// ---- 一コマ（0.5 秒に一度だけ考える） ----
// foe：向かいの D（無ければ null）。sense(s)：本物の兵の様子を返す（無ければ null）→ { foeD（ゲームの m）, contact, push, flank, lost }
export function depthTick(D, t, dt, foe, sense) {
  D._acc += dt;
  if (D._acc < TICK) { moveTick(D, dt); return false; }
  const step = D._acc; D._acc = 0; D._t = t; D.foe = foe;
  for (const s of D.sonae) senseOne(D, s, foe, sense, step);
  courierTick(D, step);
  for (const s of D.sonae) think(D, s, t, step);
  commitTick(D);
  crisisTick(D, t);
  formationTick(D, foe);
  for (const s of D.sonae) s.flagPose = flagPose(s);
  moveTick(D, dt);
  let up = 0, all = 0;
  for (const s of D.sonae) { if (s.state === ST.AWAY) continue; all++; if (!broken(s)) up++; }
  if (!D.broken && all > 2 && up / all < 0.3) { D.broken = true; depthEvent(D, '総崩れ'); for (const s of D.sonae) s.integrity = clamp(s.integrity - 25); }
  return true;
}

function senseOne(D, s, foe, sense, step) {
  s.contact = false; s.flank = false; s.push = 0; s.foeD = Infinity; s.foeS = null;
  if (s.bound) {
    // 本物の隊に結んだ備：隊がまだ出ていない（後の段で出る）間は居ないものとする
    const r = sense ? sense(s) : null;
    if (!r || (r.x == null && !r.routed)) { if (s.state !== ST.AWAY) { s.state = ST.AWAY; s.arrive = Infinity; } return; }
    if (s.state === ST.AWAY) { setState(D, s, ST.FORMED); s.lastMen = r.men ?? s.men; }
    if (r.x != null) { s.x = r.x; s.z = r.z; }
    if (r.men != null) s.men = r.men;
    s.foeD = r.foeD; s.contact = !!r.contact; s.push = r.push ?? 0;
    if (r.routed && s.state !== ST.ROUTING) startRout(D, s, '本物の隊が崩れた');
    return;
  }
  if (s.state === ST.AWAY || s.gone) return;
  const cr = 22 / D.mpu + 4;
  if (foe) for (const o of foe.sonae) {
    if (o.state === ST.AWAY || o.gone || o.men <= 0) continue;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d < s.foeD) { s.foeD = d; s.foeS = o; }
  }
  if (s.foeS && s.foeD < cr && s.foeS.state !== ST.ROUTING) {
    s.contact = true;
    s.push = (s.integrity * Math.sqrt(s.men) - s.foeS.integrity * Math.sqrt(s.foeS.men)) / (100 * Math.sqrt(Math.max(s.men, s.foeS.men, 1)));
    // 横・後ろから（向きと敵の方のずれ）
    const a = Math.atan2(s.foeS.x - s.x, s.foeS.z - s.z), da = Math.abs(((a - s.face) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    s.flank = da > 1.2;
    // 軽い備どうしの削り合い（見せ物の数。本物の兵には入れない）
    const rate = (D.P.attrition ?? 0.004) * step * (1 + Math.max(0, -s.push) * 2);
    s.men = Math.max(0, s.men - s.nominal * rate);
  }
  const r = sense ? sense(s) : null;
  if (r) {
    if (r.foeD < s.foeD) s.foeD = r.foeD;
    if (r.contact) { s.contact = true; s.push = r.push ?? s.push; s.flank = s.flank || !!r.flank; }
    if (r.men != null) s.men = r.men;
    if (r.x != null) { s.x = r.x; s.z = r.z; }
    if (r.routed && s.state !== ST.ROUTING) startRout(D, s, '本物の隊が崩れた');
  }
}

function think(D, s, t, step) {
  if (s.state === ST.AWAY) {
    if (t >= s.arrive - 30 && s.from) {
      setState(D, s, ST.APPROACH); s.warned = true; depthEvent(D, (s.taisho || s.id) + ' の旗が見える');
      s.tx = s.hx; s.tz = s.hz;
    } else if (t >= s.arrive) { setState(D, s, ST.FORMED); s.x = s.hx; s.z = s.hz; }
    return;
  }
  if (s.state === ST.APPROACH) {
    s.tx = s.hx; s.tz = s.hz;
    if (t >= s.arrive) { setState(D, s, ST.FORMED); depthEvent(D, (s.taisho || s.id) + ' 着陣'); for (const o of D.sonae) if (alive(o)) o.integrity = clamp(o.integrity + 8); }
    return;
  }
  if (s.gone) return;
  // 隊列維持度（17〜19）
  let d = 0;
  const lost = s.lastMen - s.men; s.lastMen = s.men;
  if (lost > 0) d -= lost / s.nominal * 100;                    // 大損害
  if (s.contact) d -= (0.6 + Math.max(0, -s.push) * 3) * step;    // 斬り合う
  if (s.flank) d -= 4 * step;                                     // 側面・背後
  if ((s.state === ST.ADVANCING || s.state === ST.RETREATING) && (D.terrain === 'river' || D.terrain === 'mountain' || D.terrain === 'marsh')) d -= 1.2 * step;
  if (D.crisis >= 3 && (s.layer === 'honjin' || s.layer === 'hatamoto' || s.layer === 'yobi')) d -= 0.4 * D.crisis * step;
  if (!s.taishoAlive) d -= 0.5 * step;
  if (!s.contact) {
    if (s.state === ST.FORMED || s.state === ST.REFORMING) d += 4 * step;            // 停止・再集合
    if (s.foeD * D.mpu > 120) d += 2 * step;                                         // 敵から遠い
    if (s.taishoAlive) d += 1 * step;                                                // 指揮官・旗
    if (Math.hypot(s.x - D.honjin.x, s.z - D.honjin.z) * D.mpu < 120) d += 1 * step;  // 本陣の近く
  }
  s.integrity = clamp(s.integrity + d);
  // 状態（16）
  const I = s.integrity, st = s.state;
  if (s.men <= s.nominal * 0.12 && st !== ST.ROUTING && !s.bound) { startRout(D, s, '兵が尽きた'); return; }
  if (st === ST.ROUTING) {
    if (t - s.since > 25) {
      if (s.taishoAlive && s.men > s.nominal * 0.3 && s.foeD * D.mpu > 150 && !D.broken) { setState(D, s, ST.REFORMING); s.integrity = 20; s.bigFlagDown = false; depthEvent(D, (s.taisho || s.id) + ' 再編'); }
      else s.gone = true;
    }
    return;
  }
  if (s.bound && I < 10) s.integrity = 10;   // 本物の隊の崩れは本物の隊が決める
  else if (I <= 0 || (!s.taishoAlive && I < 15)) { startRout(D, s, '隊列が尽きた'); return; }
  if (st === ST.FORMED) { if (s.contact) setState(D, s, ST.ENGAGED); else if (s.cmd === 'advance' && !s.hold) setState(D, s, ST.ADVANCING); }
  else if (st === ST.ADVANCING) { if (s.contact) setState(D, s, ST.ENGAGED); }
  else if (st === ST.ENGAGED) {
    if (I < 40) setState(D, s, ST.DISORDERED);
    else if (!s.contact && t - s.since > 4) setState(D, s, s.cmd === 'advance' ? ST.ADVANCING : ST.FORMED);
  } else if (st === ST.DISORDERED) {
    if (I < 20 && s.push <= 0) { setState(D, s, ST.RETREATING); depthEvent(D, (s.taisho || s.id) + ' 退く'); }
    else if (I >= 55) setState(D, s, s.contact ? ST.ENGAGED : ST.FORMED);
  } else if (st === ST.RETREATING) {
    if (s.foeD * D.mpu > 120 && I >= 30) setState(D, s, ST.REFORMING);
  } else if (st === ST.REFORMING) {
    s.integrity = clamp(s.integrity + 4 * step);
    if (s.contact && I < 30) startRout(D, s, '再編の途中で討たれた');
    else if (s.integrity >= 70) setState(D, s, ST.FORMED);
  }
}

// 連鎖崩壊（30）：敗走した備は後ろの層へ逃げ込み、そこの隊列維持度を下げる。隣の備も揺れる。
function startRout(D, s, why) {
  if (s.state === ST.ROUTING) return;
  setState(D, s, ST.ROUTING); s.routT = D._t; s.integrity = 0;
  depthEvent(D, (s.taisho || s.id) + ' 敗走（' + why + '）');
  const li = LAYERS.indexOf(s.layer);
  for (const o of D.sonae) {
    if (o === s || !alive(o)) continue;
    const oi = LAYERS.indexOf(o.layer);
    const behind = oi > li && (o.wing === s.wing || o.wing === 'center' || s.wing === 'center') && oi - li <= 2;
    const beside = oi === li && Math.abs(WING_SIGN[o.wing] - WING_SIGN[s.wing]) === 1;
    if (behind) { o.integrity = clamp(o.integrity - (oi - li === 1 ? 18 : 9)); o.chainHit = true; }
    else if (beside) o.integrity = clamp(o.integrity - 8);
  }
}

// 層ごとの順番投入（2）：第一線が崩れる→第二線→予備→旗本。先鋒・第一線のほかは最初は待つ。
function commitTick(D) {
  // 開戦（既定 20 秒は整然と並んで待つ）：先鋒・第一線へ使番が「前へ」を運ぶ
  if (!D.opened && D._t >= (D.P.openAt ?? 20)) {
    D.opened = true;
    for (const s of D.sonae) if ((s.layer === 'sakite' || s.layer === 'ichi') && !s.hold && alive(s)) depthOrder(D, s, 'advance');
  }
  for (const wing of WINGS) {
    const front = D.sonae.filter((s) => s.wing === wing && (s.layer === 'sakite' || s.layer === 'ichi') && s.state !== ST.AWAY);
    if (!front.length) continue;
    const fBroke = front.every(broken);
    const fHard = front.some((s) => s.contact && s.integrity < 45);
    for (const s of D.sonae) {
      if (s.wing !== wing || s.layer !== 'ni' || s.committed || !alive(s) || s.hold) continue;
      if (fBroke || fHard) { s.committed = true; depthOrder(D, s, 'advance'); depthEvent(D, (s.taisho || s.id) + '（第二線）が前へ'); }
    }
  }
  // 予備は全体で一つ：どこかの翼の第二線まで崩れたら、その翼へ
  const yobi = D.sonae.filter((s) => s.layer === 'yobi' && !s.committed && alive(s) && !s.hold);
  if (yobi.length) for (const wing of WINGS) {
    const ln = D.sonae.filter((s) => s.wing === wing && (s.layer === 'sakite' || s.layer === 'ichi' || s.layer === 'ni') && s.state !== ST.AWAY);
    if (!ln.length || !ln.every(broken) && !(D.crisis >= 3)) continue;
    const y = yobi.sort((a, b) => Math.abs(WING_SIGN[a.wing] - WING_SIGN[wing]) - Math.abs(WING_SIGN[b.wing] - WING_SIGN[wing]))[0];
    y.committed = true; y.wantWing = wing; depthOrder(D, y, 'advance'); depthEvent(D, (y.taisho || y.id) + '（予備）を入れる');
    break;
  }
  // 後詰（7）：悪化すると法螺→旗が動く→前進。突然出さない（着いている後詰だけ）
  if (D.crisis >= 2) for (const s of D.sonae) if (s.layer === 'gozume' && !s.committed && alive(s) && !s.hold) {
    s.committed = true; s.horn = D._t; depthOrder(D, s, 'advance'); depthEvent(D, '法螺。後詰が前へ');
  }
}

// 本陣の危機（5・31）：前線が崩れ、敵が本陣へ寄るほど段が上がる。一度上がった段は、敵が退くまで下げない。
function crisisTick(D, t) {
  let near = Infinity;
  if (D.foe) for (const o of D.foe.sonae) if (alive(o) && o.state !== ST.APPROACH) near = Math.min(near, Math.hypot(o.x - D.honjin.x, o.z - D.honjin.z) * D.mpu);
  if (D.senseHonjin) near = Math.min(near, D.senseHonjin * D.mpu);
  const front = D.sonae.filter((s) => s.layer === 'sakite' || s.layer === 'ichi');
  const ni = D.sonae.filter((s) => s.layer === 'ni');
  const fBroke = front.filter(broken).length, niBroke = ni.filter(broken).length;
  let c = 0;
  if (near < 300 || fBroke > 0) c = 1;
  if (near < 220 || fBroke >= Math.max(1, front.length / 2)) c = 2;
  if (near < 150 || (ni.length && niBroke >= Math.max(1, ni.length / 2))) c = 3;
  if (near < 100) c = 4;
  if (near < 60) c = 5;
  if (c < D.crisis && near > 300 && t - D.crisisAt > 20) c = D.crisis - 1;   // 敵が退けばゆっくり落ち着く
  else if (c < D.crisis) c = D.crisis;
  if (c !== D.crisis) { D.crisis = c; D.crisisAt = t; depthEvent(D, '本陣の危機 ' + c); }
  D.pose = CRISIS_POSE[D.crisis];
  // 旗本・馬廻：段 5 で出る（方円）。段 4 では馬を引かせて控える
  for (const s of D.sonae) if (s.layer === 'hatamoto' && alive(s)) {
    if (D.crisis >= 5 && !s.committed) { s.committed = true; s.ring = true; applyCmd(D, s, 'advance'); depthEvent(D, '旗本・馬廻が出る'); }
  }
  // 段 2 から使番が頻繁に走る（見た目の忙しさ）。前の備へ「持ちこたえよ」を運ぶ
  if (D.crisis >= 2 && t - D._courierT > (D.crisis >= 4 ? 6 : 12)) {
    D._courierT = t;
    const s = D.sonae.find((o) => alive(o) && o.committed && (o.layer === 'ichi' || o.layer === 'ni' || o.layer === 'sakite') && !D.couriers.some((c) => c.on && c.to === o));
    if (s) depthOrder(D, s, s.cmd || 'hold');
  }
}

// 使番：本陣から馬で走る（29）。敵の備の近くを通ると討たれることがある。
function courierTick(D, step) {
  const v = Math.max(SPEED_M.ride / D.mpu, 4);   // 縮めた戦場でも 30 秒ほどで届くように
  for (const c of D.couriers) {
    if (!c.on) continue;
    const s = c.to;
    if (!s || !alive(s)) { c.on = false; continue; }
    const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz);
    if (d < 3) { c.on = false; applyCmd(D, s, c.cmd); continue; }
    const k = Math.min(1, v * step / d); c.x += dx * k; c.z += dz * k;
    if (D.foe) for (const o of D.foe.sonae) {
      if (!alive(o) || o.state === ST.APPROACH) continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) * D.mpu < 40 && D.rand() < 0.08 * step) { depthEvent(D, '使番が討たれた'); depthCourierKill(c); break; }
    }
  }
}

// 陣形の動きの決まり（9〜14）：前へ出る備の行き先（tx・tz）を決める。
function formationTick(D, foe) {
  const form = D.formation;
  const center = D.sonae.find((s) => s.wing === 'center' && (s.layer === 'sakite' || s.layer === 'ichi') && alive(s));
  const fx = Math.sin(D.facing), fz = Math.cos(D.facing), rx = -Math.cos(D.facing), rz = Math.sin(D.facing);
  const u = 1 / D.mpu;
  let prev = null;
  for (const s of D.sonae) {
    s.face = D.facing;
    if (s.state === ST.AWAY || s.state === ST.APPROACH || s.gone) continue;
    if (s.bound) { s.tx = s.x; s.tz = s.z; if (s.layer !== 'konida') prev = s; continue; }   // 本物の隊は台本と兵が動かす
    if (s.state === ST.ROUTING || s.state === ST.RETREATING) {
      // 後ろへ（本陣の方）。敗走は本陣の向こうへ散る
      const back = s.state === ST.ROUTING ? 160 : 70;
      s.tx = s.x - fx * back * u; s.tz = s.z - fz * back * u; s.face = D.facing + Math.PI;
      continue;
    }
    if (s.state === ST.REFORMING) { s.tx = s.x; s.tz = s.z; continue; }
    // 方円（14）：旗本・馬廻は本陣のまわりに輪
    if (s.ring) {
      const k = D.sonae.filter((o) => o.ring).indexOf(s), n = D.sonae.filter((o) => o.ring).length;
      const a = D.facing + (n > 1 ? (k / (n - 1) - 0.5) * Math.PI : 0), r = 50 * u;
      s.tx = D.honjin.x + Math.sin(a) * r; s.tz = D.honjin.z + Math.cos(a) * r; s.face = a;
      continue;
    }
    if (s.state !== ST.ADVANCING && s.state !== ST.ENGAGED && s.state !== ST.DISORDERED) { s.tx = s.hx; s.tz = s.hz; continue; }
    let tgt = s.foeS && alive(s.foeS) ? s.foeS : nearestFoeAlive(D, foe, s);
    if (!tgt) { s.tx = s.x; s.tz = s.z; continue; }
    let gx = tgt.x, gz = tgt.z;
    const w = WING_SIGN[s.wantWing || s.wing];
    if (form === '鶴翼') {
      // 中央は持ちこたえる（前へ出すぎない）。左右は敵の翼の外へ回り込み、敵の中央が出たら内へ旋回する
      if (!w) { gx = (s.hx * 2 + gx) / 3; gz = (s.hz * 2 + gz) / 3; }
      else {
        const foeCenterOut = foe && foe.sonae.some((o) => o.wing === 'center' && o.state === ST.ENGAGED);
        if (!foeCenterOut) { gx += rx * w * 40 * u; gz += rz * w * 40 * u; }
      }
    } else if (form === '魚鱗') {
      // 中央の先鋒が突破し、二陣は同じ所へ。左右は中央との間を保つ
      if (!w && s.layer === 'ni' && center) { gx = center.tx - fx * 20 * u; gz = center.tz - fz * 20 * u; }
      else if (w && center) { gx = center.x + rx * w * D.width * 0.6 * u; gz = center.z + rz * w * D.width * 0.6 * u; }
    } else if (form === '長蛇') {
      // 縦隊：前の備が止まれば後ろも止まる
      if (prev && prev.state !== ST.ADVANCING && prev.state !== ST.ENGAGED) { gx = s.x; gz = s.z; }
      else if (prev) { gx = prev.x - fx * 30 * u; gz = prev.z - fz * 30 * u; }
    } else if (form === '雁行') {
      // 斜めにずらす：右の備ほど遅れて出る（順に撃つ）
      if (D._t - s.since < (w + 1) * 6) { gx = s.x; gz = s.z; }
    }
    // 組み合ったら押し合いの間（ゲームの数 m）で止まる
    const dd = Math.hypot(gx - s.x, gz - s.z), stop = 10 / D.mpu + 2;
    if (s.contact && dd < stop * 2) { gx = s.x; gz = s.z; }
    s.tx = gx; s.tz = gz;
    if (s.layer !== 'konida') prev = s;
  }
}
function nearestFoeAlive(D, foe, s) {
  if (!foe) return null;
  let best = null, bd = Infinity;
  for (const o of foe.sonae) { if (!alive(o) || o.state === ST.APPROACH) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < bd) { bd = d; best = o; } }
  return best;
}

// 毎コマ：行き先へ歩く（速さは状態で）
function moveTick(D, dt) {
  const u = 1 / D.mpu;
  for (const s of D.sonae) {
    if (s.state === ST.AWAY || s.gone || s.bound) { s.speed = 0; continue; }
    const v = (s.state === ST.ROUTING ? SPEED_M.rout : s.state === ST.RETREATING ? SPEED_M.back : s.state === ST.APPROACH ? approachSpeed(s) * D.mpu :
      s.state === ST.ENGAGED || s.state === ST.DISORDERED ? 0.6 : s.contact ? 0 : s.foeD * D.mpu < 80 ? SPEED_M.charge : SPEED_M.march) * u;
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
    if (d < 0.3 || v <= 0) { s.speed = 0; continue; }
    const k = Math.min(1, v * dt / d);
    s.x += dx * k; s.z += dz * k; s.speed = v;
  }
}
function approachSpeed(s) {
  const d = Math.hypot(s.hx - (s.from?.x ?? s.hx), s.hz - (s.from?.z ?? s.hz));
  return Math.max(0.5, d / 30);
}

// 旗で様子を見せる（23）：整然／ばらつく／後ろへ／倒れる
function flagPose(s) {
  if (s.state === ST.ROUTING || s.gone) return 'down';
  if (s.state === ST.RETREATING) return 'back';
  if (s.integrity < 55 || s.state === ST.DISORDERED) return 'scatter';
  return 'ordered';
}

// 見た目の物差し（20）：間隔の倍・槍の揃い（0〜1）・背を向けるか
export function lookOf(s, out = {}) {
  const I = s.integrity;
  out.spacing = I >= 90 ? 1 : I >= 60 ? 1.15 : I >= 35 ? 1.35 : 1.6;
  out.align = I >= 85 ? 1 : I >= 60 ? 0.6 : I >= 35 ? 0.25 : 0;
  out.back = s.state === ST.ROUTING || s.state === ST.RETREATING;
  out.lowered = s.state === ST.ENGAGED || s.state === ST.ADVANCING && s.foeD < 20;
  return out;
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
