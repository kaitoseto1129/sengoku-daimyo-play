// 秒数・合図・行き先は各戦の定義を使う。ここでは下知を守り、今の様子だけ知らせる。
// ゲーム内の秒数や台詞を、史料にある時刻・発言として扱わない。
import { sendOrder } from './denrei.js';
import { heardRecently } from './notice_source.js';

export function scriptedAlly(g) {
  return g.team === 0 && g.historicalOrders && g.ai !== true && !g.isPlayerSquad && !g.dispatch;
}

export function allyLeader(g) {
  for (const u of g.units) {
    if (u.alive && u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai')) return u;
  }
  return null;
}

export function allyAction(g) {
  if (g.routed || g.order === 'flee') return '逃げている';
  if (g.order === 'retreat') return '退いている';
  if (g.order === 'move' || g.order === 'path') return '移動中';
  // 的は兵とは限らない（木戸や塀など pos を持たない物もある）
  for (const u of g.units) {
    if (!u.alive) continue;
    if (u.atk) return '戦っている';
    const t = u.target, tp = t && t.alive !== false && (t.pos || t);
    if (tp && tp.x !== undefined && Math.hypot(u.pos.x - tp.x, u.pos.z - tp.z) < 14) return '戦っている';
  }
  if (g.order === 'attack' || g.order === 'assault') return '攻めている';
  return g.reserve ? '合図を待つ' : '持ち場を守る';
}

export function allyPlace(x, z, p) {
  const dx = x - p.x, dz = z - p.z;
  if (Math.hypot(dx, dz) < 16) return 'すぐそば';
  return `${dz > 12 ? '南' : dz < -12 ? '北' : ''}${dx > 12 ? '東' : dx < -12 ? '西' : ''}` || 'すぐそば';
}

export function allyOrdersTick(rt, dt) {
  if (rt.over || rt.def.dojo || rt.def.town) return;
  rt.allyOrdersT = (rt.allyOrdersT || 0) - dt;
  if (rt.allyOrdersT > 0) return;
  rt.allyOrdersT = 0.5;
  const rows = rt.allyOrders || (rt.allyOrders = []), p = rt.player.u.pos;
  for (const row of rows) row.active = false;
  for (const g of rt.army.groups) {
    if (g.team !== 0 || g.isPlayerSquad || !g.count) continue;
    const lead = allyLeader(g);
    if (!lead) continue;
    let row = rows.find((r) => r.g === g);
    const action = allyAction(g);
    if (!row) {
      row = { g, number: rows.length + 1, name: lead.name, action, announced: action, x: 0, z: 0, active: true };
      rows.push(row);
      // 新手の移動も知らせる。開戦前の持ち場の説明は既存の台詞に任せる。
      if (rt.t > 8 && (g.order === 'move' || g.order === 'path')) row.announced = '';
    }
    row.name = lead.name; row.active = true; row.action = action;
    let x = 0, z = 0, n = 0;
    for (const u of g.units) if (u.alive) { x += u.pos.x; z += u.pos.z; n++; }
    row.x = x / n; row.z = z / n;
  }
  // 小地図に出す近い三隊。入れ物と座標は使い回す。
  const mapRows = rt.allyMapRows || (rt.allyMapRows = []);
  mapRows.length = 0;
  for (const row of rows) {
    if (!row.active) continue;
    row.distance = Math.hypot(row.x - p.x, row.z - p.z);
    let at = 0;
    while (at < mapRows.length && mapRows[at].distance <= row.distance) at++;
    if (at < 3) { mapRows.splice(at, 0, row); if (mapRows.length > 3) mapRows.length = 3; }
  }
  const focus = rt.allyOrdersFocus;
  if (focus && focus.active && (rt.allyOrdersSayT ?? -99) + 8 > rt.t) {
    const at = mapRows.indexOf(focus);
    if (at >= 0) mapRows.splice(at, 1);
    mapRows.unshift(focus); if (mapRows.length > 3) mapRows.length = 3;
  }
  // 戦の定義が allyReports: false（または noAllyReports）の時は、使番の様子の知らせを出さない（小地図の並びは保つ）。
  if (rt.def.allyReports === false || rt.def.noAllyReports || (rt.allyOrdersSayT ?? -99) + 8 > rt.t || rt.choice || rt.pendingChoice || rt.prelude && rt.prelude !== 'done') return;
  for (const row of rows) {
    if (!row.active || row.action === row.announced || row.runner) continue;
    row.announced = row.action; rt.allyOrdersSayT = rt.t;
    rt.allyOrdersFocus = row;
    const at = mapRows.indexOf(row);
    if (at >= 0) mapRows.splice(at, 1);
    mapRows.unshift(row); if (mapRows.length > 3) mapRows.length = 3;
    // 出発後に用向きが変わった報告や、既にそばにいる隊の報告は捨てる。
    const action = row.action, sent = rt.t;
    // そばの隊は目で分かる。移動と戦闘の小さな切り替わりも運ばない。
    if (row.distance <= 25 || action === '戦っている') continue;
    const word = `${row.name}殿の隊は${allyPlace(row.x, row.z, p)}で${action}`;
    row.runner = sendOrder(rt, row.g, rt.player.u, { id: 'report', apply: () => {
      if (rt.over || !row.active || row.action !== action || rt.t - sent > 25 || row.distance <= 25 || heardRecently(rt, word)) return;
      rt.say('使番', word);
    } }, {
      team: 0, faction: row.g.faction, name: '自分の隊',
      onArrive: () => { row.runner = null; }, onLost: () => { row.runner = null; },
    });
    break;
  }
}
