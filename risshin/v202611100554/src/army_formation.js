// ======================================================================
// 大軍の陣立て（army_formation.js。docs/army_structure_1029.md・kaito 10/29）
// 軍を「備（そなえ）」の集まりとして持つ、描かない共通の仕組み。Three.js も戦のファイルも読まない。
//   縦：先陣→二陣→三陣→本陣→旗本・馬廻→後詰（途中で着く）・遊軍・荷駄
//   横：左翼・中央・右翼（それぞれに先備・二備・予備）
//   陣形は数の上乗せにせず、どの備をいつ出すかの動きの型にする。地形が先（谷・山道は長蛇、城攻めは縦隊）。
//   命令は使番が馬で運ぶ（届くまで時がかかる。討たれたら届かない）。
//   士気は 備・翼・軍全体 の層。侍大将の討死 −30・隣の備の敗走 −10・翼の崩れで本陣 −20・総大将の負傷で全軍 −40。
// 重さ：0.5 秒ごとに一度だけ考える。毎コマの new はしない（備の数だけの輪を回すだけ）。
// 使い方（戦の側）：
//   const A = makeArmy({ team: 0, honjin: { x, z }, facing, formation: '魚鱗', terrain: 'plain',
//     sonae: [{ id: 'saki_c', line: 'senjin', wing: 'center', men: 300, taisho: '柴田勝家' }, ...] });
//   毎コマ armyTick(A, t, dt, sense)  // sense(s) => { enemyDist, push }（push：押していれば正・押されていれば負）
//   兵が減ったら armyLoss(A, id, 人数)。侍大将の討死は armyTaishoDown(A, id)。総大将の負傷は armyGeneralHurt(A)。
//   下知は armyOrder(A, id, 'advance'|'hold'|'retreat'|'pursue', t)。どこに置くかは sonaeWorld(A, s, out)。
// ======================================================================

export const LINES = ['senjin', 'nijin', 'sanjin', 'honjin', 'hatamoto', 'gotsume', 'yugun', 'konida'];
export const LINE_NAME = { senjin: '先陣', nijin: '二陣', sanjin: '三陣', honjin: '本陣', hatamoto: '旗本', gotsume: '後詰', yugun: '遊軍', konida: '荷駄' };
export const WINGS = ['left', 'center', 'right'];
export const WING_NAME = { left: '左翼', center: '中央', right: '右翼' };
// 本陣から前へ何 m に置くか（縦の並び）。負は本陣の後ろ。
const LINE_FRONT = { senjin: 160, nijin: 100, sanjin: 50, honjin: 0, hatamoto: -12, gotsume: -90, yugun: 40, konida: -60 };
const WING_RIGHT = { left: -1, center: 0, right: 1 };
const TICK = 0.5;
const EVENT_CAP = 32;

// 一備 300 人の例（docs/army_structure_1029.md）。兵種ごとの塊に分けず、一つの備に混ぜる。
export const SONAE_MIX = { 備大将: 1, 侍大将: 4, 騎馬: 15, 徒歩侍: 30, 槍: 150, 鉄砲: 40, 弓: 20, 旗使番: 10, 小者: 30 };
const MIX_SUM = Object.values(SONAE_MIX).reduce((a, b) => a + b, 0);
export function sonaeMix(men, out = {}) {
  let left = Math.max(0, Math.round(men));
  out.備大将 = left > 0 ? 1 : 0; left -= out.備大将;
  out.侍大将 = Math.min(left, Math.max(left > 30 ? 1 : 0, Math.round(men * SONAE_MIX.侍大将 / MIX_SUM))); left -= out.侍大将;
  let rest = left;
  for (const k of ['騎馬', '徒歩侍', '鉄砲', '弓', '旗使番', '小者']) {
    out[k] = Math.min(rest, Math.round(men * SONAE_MIX[k] / MIX_SUM)); rest -= out[k];
  }
  out.槍 = rest;   // 端数は槍に寄せる
  return out;
}
// 見せる数：実体の 3D 兵・中景・遠景（一備 300 なら 40・80・180）。近くの本物は軍全体の上限で頭打ち。
export function showTiers(men, nearCap = 40, out = {}) {
  const m = Math.max(0, men);
  out.near = Math.min(nearCap, Math.round(m * 40 / 300));
  out.mid = Math.round(m * 80 / 300);
  out.far = Math.max(0, Math.round(m) - out.near - out.mid);
  return out;
}

// 陣形より地形が先。谷・山道・街道は長蛇、城攻めは縦隊、鶴翼は平地だけ。川渡りは隊列が乱れる。
export function formationFor(name, terrain = 'plain') {
  if (terrain === 'valley' || terrain === 'road' || terrain === 'mountain') return '長蛇';
  if (terrain === 'castle') return '縦隊';
  if (name === '鶴翼' && terrain !== 'plain') return '魚鱗';
  return name || '魚鱗';
}

// 陣形ごとの置き方のずらし（前へ m・横の広がりの倍）。動きの型は formationAct が受け持つ。
function shapeOf(form, line, wing) {
  const w = WING_RIGHT[wing] || 0;
  if (form === '鶴翼') return line === 'senjin' ? { front: w ? 30 : -20, spread: 1.6 } : { front: 0, spread: 1.4 };
  if (form === '魚鱗') return line === 'senjin' ? { front: w ? -30 : 20, spread: 0.7 } : { front: 0, spread: 0.8 };
  if (form === '雁行') return { front: w * 35, spread: 1.1 };
  if (form === '方円') return line === 'honjin' || line === 'konida' ? { front: 0, spread: 0 } : { front: -LINE_FRONT[line] * 0.6, spread: 0.9, ring: true };
  if (form === '長蛇' || form === '縦隊') return { front: -w * 25, spread: 0.12 };
  return { front: 0, spread: 1 };
}

class FSonae {
  constructor(A, o, i) {
    this.id = o.id || 'sonae' + i;
    this.name = o.name || this.id;
    this.line = LINES.includes(o.line) ? o.line : 'senjin';
    this.wing = WINGS.includes(o.wing) ? o.wing : 'center';
    this.men = o.men ?? 300;
    this.nominal = this.men;
    this.taisho = o.taisho || '';
    this.taishoAlive = true;
    this.mix = sonaeMix(this.men);
    this.tiers = showTiers(this.men);
    this.morale = o.morale ?? 70;
    this.arriveAt = this.line === 'gotsume' ? (o.arrive ?? 120) : 0;
    this.here = this.arriveAt <= 0;
    // 先陣と遊軍は最初から出る。ほかは待つ（最初から全軍を戦わせない）。
    this.state = !this.here ? 'away' : (this.line === 'senjin' ? 'advance' : 'wait');
    this.cmd = this.state === 'advance' ? 'advance' : 'hold';
    this.why = '';
    this.contact = false;
    this.push = 0;
    this.enemyDist = Infinity;
    this.confuseUntil = 0;
    this.right = 0; this.front = 0;
    this.offRight = o.right || 0; this.offFront = o.front || 0;
  }
  get alive() { return this.state !== 'rout' && this.state !== 'gone' && this.men > 0; }
  get fighting() { return this.state === 'advance' || this.state === 'fight' || this.state === 'pursue'; }
}

export function makeArmy(o = {}) {
  const A = {
    team: o.team ?? 0,
    name: o.name || '',
    honjin: { x: o.honjin?.x || 0, z: o.honjin?.z || 0 },
    facing: o.facing || 0,
    terrain: o.terrain || 'plain',
    formation: formationFor(o.formation, o.terrain),
    want: o.formation || '魚鱗',
    rand: o.rand || Math.random,
    courierSpeed: o.courierSpeed ?? 8,      // 使番の馬（m/秒）。300m で 40 秒ほど
    courierRisk: o.courierRisk ?? 0.0,      // 道中で討たれるくじ（1 秒あたり）。敵に近い道ほど戦の側で上げる
    hatamotoRange: o.hatamotoRange ?? 80,   // 敵がここまで本陣に寄ったら旗本・馬廻が動く
    width: o.width ?? 120,
    sonae: [],
    couriers: [],
    morale: o.morale ?? 70,
    generalHurt: false,
    honjinAttacked: false,
    broken: false,
    events: [],
    _acc: 0,
    _t: 0,
  };
  (o.sonae || []).forEach((s, i) => A.sonae.push(new FSonae(A, s, i)));
  layoutArmy(A);
  return A;
}

export function armyEvent(A, text) {
  A.events.push({ t: A._t, text });
  if (A.events.length > EVENT_CAP) A.events.shift();
}
export function sonaeOf(A, id) {
  for (const s of A.sonae) if (s.id === id) return s;
  return null;
}

// 縦×横の置き場（本陣から右と前を正にした m）。同じ線・同じ翼に二つ以上あれば横に並べる。
export function layoutArmy(A) {
  const W = A.width, form = A.formation;
  for (const s of A.sonae) {
    const sh = shapeOf(form, s.line, s.wing);
    let n = 0, k = 0;
    for (const o of A.sonae) if (o.line === s.line && o.wing === s.wing) { if (o === s) k = n; n++; }
    const sub = n > 1 ? (k / (n - 1) - 0.5) * W * 0.4 : 0;
    const w = WING_RIGHT[s.wing];
    let front = LINE_FRONT[s.line] + sh.front, right = (w * W + sub) * sh.spread;
    if (s.line === 'honjin' || s.line === 'hatamoto' || s.line === 'konida') right = sub * 0.5 + (s.line === 'hatamoto' ? w * 20 : 0);
    if (s.line === 'yugun') right = (w || 1) * W * 1.5;
    if (form === '長蛇' || form === '縦隊') {
      // 一列：前から 先陣→二陣→三陣→本陣。翼は前後にずらすだけ。
      right = sub * 0.15;
    }
    s.front = front + s.offFront;
    s.right = right + s.offRight;
  }
}

// 置き場を世界の x・z に（facing は本陣の向き。0 で +z が前）。
export function sonaeWorld(A, s, out = {}) {
  const c = Math.cos(A.facing), n = Math.sin(A.facing);
  out.x = A.honjin.x + s.right * c + s.front * n;
  out.z = A.honjin.z - s.right * n + s.front * c;
  return out;
}

// ---- 使番（命令の遅れ） ----
export function armyOrder(A, id, cmd, t = A._t) {
  const s = sonaeOf(A, id);
  if (!s) return null;
  const d = Math.hypot(s.right, s.front);
  let wait = d / A.courierSpeed;
  if (A.honjinAttacked) wait *= 2;   // 本陣が襲われると使番が混乱する
  const c = { to: id, cmd, from: t, at: t + wait, alive: true };
  A.couriers.push(c);
  return c;
}
export function killCourier(A, c) {
  if (!c || !c.alive) return;
  c.alive = false;
  armyEvent(A, '使番が討たれ、' + (sonaeOf(A, c.to)?.name || c.to) + 'へ命令が届かない');
}
function courierTick(A, t, dt) {
  let w = 0;
  for (const c of A.couriers) {
    if (c.alive && A.courierRisk > 0 && A.rand() < A.courierRisk * dt) killCourier(A, c);
    if (c.alive && t >= c.at) {
      const s = sonaeOf(A, c.to);
      if (s && s.alive && s.here) { s.cmd = c.cmd; setState(s, c.cmd === 'hold' ? 'wait' : c.cmd, '下知が届いた'); }
      c.alive = false;
    }
    if (c.alive) A.couriers[w++] = c;
  }
  A.couriers.length = w;
}

// ---- 士気（層ごと） ----
function clamp(v) { return v < 0 ? 0 : v > 100 ? 100 : v; }
export function sonaeMorale(A, s, d, why) {
  if (!s.alive) return;
  s.morale = clamp(s.morale + d);
  if (why && d <= -10) armyEvent(A, s.name + ' 士気' + d + '（' + why + '）');
}
function neighbours(A, s, fn) {
  for (const o of A.sonae) {
    if (o === s || !o.alive || !o.here) continue;
    const sameLine = o.line === s.line && Math.abs(WING_RIGHT[o.wing] - WING_RIGHT[s.wing]) <= 1;
    const sameWing = o.wing === s.wing && Math.abs(LINES.indexOf(o.line) - LINES.indexOf(s.line)) === 1;
    if (sameLine || sameWing) fn(o, sameWing && LINES.indexOf(o.line) > LINES.indexOf(s.line));
  }
}
export function armyLoss(A, id, n) {
  const s = typeof id === 'string' ? sonaeOf(A, id) : id;
  if (!s || s.men <= 0) return;
  const before = s.men;
  s.men = Math.max(0, s.men - n);
  // 名目の 10% を失うごとに −6
  const step = Math.floor((s.nominal - s.men) / (s.nominal * 0.1)) - Math.floor((s.nominal - before) / (s.nominal * 0.1));
  if (step > 0) sonaeMorale(A, s, -6 * step);
  if (s.men <= 0) routSonae(A, s, '兵が尽きた');
}
export function armyTaishoDown(A, id) {
  const s = typeof id === 'string' ? sonaeOf(A, id) : id;
  if (!s || !s.taishoAlive) return;
  s.taishoAlive = false;
  s.confuseUntil = A._t + 10;
  armyEvent(A, (s.taisho || s.name) + ' 討死');
  sonaeMorale(A, s, -30, '侍大将の討死');
  if (s.line === 'honjin') armyGeneralHurt(A, true);
}
export function armyGeneralHurt(A, dead = false) {
  if (A.generalHurt && !dead) return;
  A.generalHurt = true;
  armyEvent(A, dead ? '総大将 討死' : '総大将 負傷');
  A.morale = clamp(A.morale - 40);
  for (const s of A.sonae) sonaeMorale(A, s, dead ? -50 : -40);
}
// 本陣が襲われた：即負けにせず、士気の低下→使番の混乱→周りの崩れ、の連鎖にする。
export function armyHonjinAttacked(A, on = true) {
  if (on === A.honjinAttacked) return;
  A.honjinAttacked = on;
  if (!on) return;
  armyEvent(A, '本陣に敵');
  A.morale = clamp(A.morale - 15);
  for (const s of A.sonae) sonaeMorale(A, s, s.line === 'honjin' || s.line === 'hatamoto' ? -5 : -12);
}
export function routSonae(A, s, why) {
  if (s.state === 'rout' || s.state === 'gone') return;
  const wasFront = s.fighting;
  setState(s, s.men > 0 ? 'rout' : 'gone', why);
  armyEvent(A, s.name + ' 敗走（' + why + '）');
  neighbours(A, s, (o, behind) => {
    // 崩れた先陣が後ろの二陣へ逃げ込むと、二陣も乱れる（連鎖）
    sonaeMorale(A, o, behind && wasFront && o.state === 'wait' ? -18 : -10, s.name + 'の敗走');
  });
  A.morale = clamp(A.morale - 6);
  wingCheck(A, s.wing);
}
function wingCheck(A, wing) {
  if (wing === 'center') return;
  let up = 0, all = 0;
  for (const s of A.sonae) {
    if (s.wing !== wing || s.line === 'honjin' || s.line === 'hatamoto' || s.line === 'konida' || !s.here) continue;
    all++; if (s.alive) up++;
  }
  if (all > 0 && up === 0 && !A['_wing_' + wing]) {
    A['_wing_' + wing] = true;
    armyEvent(A, WING_NAME[wing] + ' 崩れる');
    A.morale = clamp(A.morale - 20);
    for (const s of A.sonae) if (s.line === 'honjin' || s.line === 'hatamoto') sonaeMorale(A, s, -20, WING_NAME[wing] + 'の崩れ');
  }
}

function setState(s, st, why) {
  if (s.state === st) return;
  s.state = st;
  s.why = why || '';
}

// ---- 陣形の動きの型（だれを出すか） ----
function lineAlive(A, line, wing) {
  for (const s of A.sonae) if (s.line === line && (!wing || s.wing === wing) && s.alive && s.here) return s;
  return null;
}
function commit(A, s, why) {
  if (!s || !s.alive || !s.here || s.state !== 'wait') return;
  // 本陣から遠い備には使番を出す（届くまで待つ）。重ねて出さない。
  for (const c of A.couriers) if (c.to === s.id && c.alive) return;
  armyOrder(A, s.id, 'advance', A._t).why = why;
}
function formationAct(A) {
  const form = A.formation;
  for (const wing of WINGS) {
    const saki = lineAlive(A, 'senjin', wing);
    const ni = lineAlive(A, 'nijin', wing);
    const san = lineAlive(A, 'sanjin', wing);
    const sakiAny = A.sonae.some((s) => s.line === 'senjin' && s.wing === wing);
    // 先陣が崩れた（またはいない）→ 二陣が受け止める → 二陣も崩れたら三陣
    if (sakiAny && !saki && ni) commit(A, ni, '先陣が崩れたので受け止める');
    else if (!ni && !saki && san && sakiAny) commit(A, san, '二陣も崩れたので補う');
    // 押している → 二陣も前へ（魚鱗は中央の二陣がすぐ続く。長蛇は前が進まないと後ろは詰まって待つ）
    if (saki && ni && saki.contact && saki.push > 0.3) {
      if (form === '魚鱗' && wing === 'center') commit(A, ni, '先陣が押しているので続く');
      else if (form === '鶴翼' && wing !== 'center') commit(A, ni, '左右が前へ出て内へ回る');
      else if (form !== '長蛇' && form !== '縦隊' && form !== '方円' && saki.push > 0.6) commit(A, ni, '先陣が押しているので前へ');
    }
    // 先陣が苦しい（押されて士気が落ちた）→ 二陣を入れて支える
    if (saki && ni && saki.contact && saki.push < -0.3 && saki.morale < 40) commit(A, ni, '先陣が押されているので支える');
  }
  // 敵の弱い所（押している翼）へ遊軍を入れる。崩れかけの翼の穴埋めにも使う。
  const yu = lineAlive(A, 'yugun');
  if (yu && yu.state === 'wait') {
    for (const wing of WINGS) {
      const saki = lineAlive(A, 'senjin', wing);
      if ((saki && saki.contact && saki.push > 0.5) || (!saki && A['_wing_' + wing])) { commit(A, yu, WING_NAME[wing] + 'へ'); break; }
    }
  }
  // 旗本・馬廻：敵が本陣に寄った時だけ動く（使番は要らない。本陣のすぐそば）
  const hon = lineAlive(A, 'honjin');
  for (const s of A.sonae) {
    if (s.line !== 'hatamoto' || !s.alive) continue;
    const near = (hon ? hon.enemyDist : s.enemyDist) < A.hatamotoRange;
    if (near && s.state === 'wait') { s.cmd = 'advance'; setState(s, 'fight', '本陣を守る'); }
    else if (!near && s.state === 'fight' && !s.contact) { s.cmd = 'hold'; setState(s, 'wait', '本陣へ戻る'); }
  }
  if (hon) armyHonjinAttacked(A, hon.enemyDist < A.hatamotoRange * 0.5 || hon.contact);
}

// ---- 一つの備の状態 ----
function sonaeThink(A, s, t) {
  if (!s.here) {
    if (t >= s.arriveAt) {
      s.here = true; setState(s, 'wait', '着陣');
      armyEvent(A, s.name + ' 着陣（後詰）');
      for (const o of A.sonae) if (o !== s) sonaeMorale(A, o, +8);
      A.morale = clamp(A.morale + 8);
      commit(A, s, '後詰として入る');
    }
    return;
  }
  if (!s.alive) {
    if (s.state === 'rout' && s.taishoAlive && s.enemyDist > 45 && s.morale >= 30 && s.men > s.nominal * 0.3) {
      setState(s, 'wait', '再編'); armyEvent(A, s.name + ' 再編');
    }
    return;
  }
  // 戦っていれば少しずつ削れ、押していれば上がる。待つ備は少し戻る。
  if (s.contact) s.morale = clamp(s.morale + s.push * 1.5 - 0.4);
  else if (s.state === 'wait') s.morale = clamp(s.morale + 0.3);
  // 軍全体の士気に引かれる
  s.morale = clamp(s.morale + (A.morale - s.morale) * 0.01);
  const br = s.taishoAlive ? 20 : 30;
  if (s.morale < br) { routSonae(A, s, '士気が尽きた'); return; }
  if (t < s.confuseUntil) { if (s.state !== 'shaken') setState(s, 'shaken', '混乱'); return; }
  if (s.state === 'shaken') setState(s, s.cmd === 'hold' ? 'wait' : s.cmd, '立て直し');
  if (s.fighting) setState(s, s.contact ? 'fight' : (s.cmd === 'pursue' ? 'pursue' : 'advance'));
  if (s.morale < 35 && s.contact && s.state === 'fight') setState(s, 'shaken', '動揺');
}

export function armyTick(A, t, dt, sense) {
  A._acc += dt;
  if (A._acc < TICK) return false;
  const step = A._acc; A._acc = 0; A._t = t;
  for (const s of A.sonae) {
    if (sense && s.here && s.alive) {
      const r = sense(s);
      if (r) { s.enemyDist = r.enemyDist ?? Infinity; s.push = r.push ?? 0; s.contact = r.contact ?? s.enemyDist < 15; }
    } else { s.contact = false; }
  }
  courierTick(A, t, step);
  for (const s of A.sonae) sonaeThink(A, s, t);
  formationAct(A);
  // 軍全体：戦える備が三分の一を切ると総崩れ
  let up = 0, all = 0;
  for (const s of A.sonae) { if (!s.here) continue; all++; if (s.alive) up++; }
  if (!A.broken && all > 0 && (up / all < 0.34 || A.morale < 10)) {
    A.broken = true; armyEvent(A, '総崩れ');
    for (const s of A.sonae) sonaeMorale(A, s, -25);
  }
  return true;
}

// ---- 出世と連動：その身分で見える・動かせる備 ----
// rank：'ashigaru'（自分の組だけ）・'kumigashira'・'samurai'（自分の備）・'sonae'（自分の備と隣）・'taisho'（自分の翼）・'juushin'（全軍）
export function rankView(A, rank, mineId, out = []) {
  out.length = 0;
  const me = sonaeOf(A, mineId);
  if (rank === 'juushin') { for (const s of A.sonae) out.push(s); return out; }
  if (!me) return out;
  if (rank === 'taisho') { for (const s of A.sonae) if (s.wing === me.wing) out.push(s); return out; }
  out.push(me);
  if (rank === 'sonae') neighbours(A, me, (o) => out.push(o));
  return out;
}
export function rankCommands(rank) {
  if (rank === 'juushin') return ['advance', 'hold', 'retreat', 'pursue', 'gotsume', 'kotai', 'taikyaku'];
  if (rank === 'taisho') return ['advance', 'hold', 'retreat', 'pursue'];
  if (rank === 'sonae' || rank === 'samurai') return ['advance', 'hold', 'retreat'];
  return [];
}
