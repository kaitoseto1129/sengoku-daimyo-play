// 弓・鉄砲の「どこから飛んでくるか分からない怖さ」（docs/missile_spec_1109.md）の全戦共通の一か所。
//   lethal.js（流れ弾・ニアミス・突然の負傷）の上に乗る。lethal の入っていない戦でも入る（戦の定義の missile: false で外す）。
//   MISSILE_PRESSURE（g.mp 0〜100）：周りの着弾・味方の被弾・上からの矢玉・横矢・組頭の被弾で上がり、
//     高いと前進が遅れ・陣形が崩れ・頭を下げ・気が落ちる。撃ち止むと「今だ、進め！」で一気に寄せる（g.mpSurge）。
//   COVER_VALUE：柵・塀・森・竹束のそばでは降る矢・流れ弾に当たりにくい。
//   NEAR_MISS_EVENT・ALLY_CASUALTY_EVENT：本人のそばに、狙っていない矢玉が刺さり・隣の兵が倒れる（射手は見えなくてよい）。
//   字は足さない。音・土煙・兵の動き・短い台詞だけ。毎コマ入れ物を作らない。
import { hush } from './audio.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function missileOn(def) {
  return !!def && !def.town && !def.dojo && !def.duel && !def.mapCastle && def.missile !== false;
}

// 戦の始め（battle.js の lethalSetup の後）に一度。戦の定義の missile: { stray, allyMax, gap } で細かく変えられる。
export function missileSetup(rt) {
  const army = rt.army;
  if (!army) return;
  army.missile = null;
  if (!missileOn(rt.def)) return;
  const o = typeof rt.def.missile === 'object' ? rt.def.missile : {};
  const soft = !!(rt.def.lethal && typeof rt.def.lethal === 'object' && rt.def.lethal.soft);
  army.missile = {
    rt, step: 0, slow: 0, soft,
    hard: rt.G?.difficulty === 'hard',
    // 流れ矢玉の間（秒）。0 で止める。
    stray: o.stray ?? 1, nextStray: 25, allyMax: o.allyMax ?? (soft ? 2 : 6), allyN: 0, nextAlly: o.firstAlly ?? 60, allyGap: o.gap ?? 28,
    says: Object.create(null), sayAt: -99, surgeAt: -99,
    q: [{ at: -1 }, { at: -1 }, { at: -1 }, { at: -1 }],
    stats: { near: 0, stray: 0, ally: 0, allyDead: 0, surge: 0, cover: 0, pHit: 0, mpMax: 0 },
  };
}

function say(M, who, text, gap = 8) {
  const rt = M.rt, t = rt.t || 0;
  if ((M.says[text] ?? -99) + gap > t || M.sayAt + 4 > t) return;   // 同じ声は八秒に一度、声どうしは四秒あける
  M.says[text] = t; M.sayAt = t;
  rt.say?.(who, text, 1.8);
}

// 組の射撃の圧を足す。from は射た者（上から・横からを重く）。
function press(army, g, add, from, at) {
  if (!g || g.civ || !(add > 0)) return;
  if (from?.pos && at) {
    if (from.pos.y > at.y + 3) add *= 1.5;                                    // 上から（櫓・塀・山上）
    const h = g.facing;
    if (h !== undefined) {
      const a = Math.atan2(from.pos.x - at.x, from.pos.z - at.z);
      let d = Math.abs(a - h) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > 1.05) add *= 1.4;                                                // 横矢・背からの弾
    }
  }
  g.mp = Math.min(100, (g.mp || 0) + add);
  g.mpAt = army.time;
  if (g.mp > g.mpPeak || !(g.mpPeak > 0)) g.mpPeak = g.mp;
}

// ── ニアミス：矢・弾・一斉射ちが落ちた所の周りの組に圧（一つの組に一度だけ）。
const _nv = { army: null, team: 0, add: 0, from: null, at: null, seen: null };
function nearVisit(o, s) {
  if (!o.alive || o.team === s.team || o.isStruct || o.isPlayer || o.farSim || !o.group || s.seen.has(o.group)) return;
  s.seen.add(o.group);
  press(s.army, o.group, s.add, s.from, o.pos);
}
const _seen = new Set();
export function missileNear(army, x, z, team, kind = 'arrow', r = 3, from = null) {
  const M = army.missile;
  if (!M) return;
  M.stats.near++;
  const s = _nv;
  s.army = army; s.team = team; s.add = kind === 'volley' ? 16 : kind === 'gun' ? 5 : 3; s.from = from; s.at = null; s.seen = _seen;
  army.forNear(x, z, r, nearVisit, s);
  _seen.clear(); s.army = null; s.from = null;
}

// ── 当たった（army_combat の damage から。矢・鉄砲だけ）。組の圧、組頭・旗持の被弾、本人の手応え。
export function missileHit(army, t, amount, src, kind) {
  const M = army.missile;
  if (!M || !(amount > 0) || t.isStruct || t.type === 'dummy') return amount;
  const g = t.group;
  if (t.isPlayer) {
    M.stats.pHit++;
    const pl = M.rt.player;
    // 鉄砲：強い衝撃・音が一瞬こもる・息が上がる。矢：小さな揺れ（向きの印は battle の damageNotice）
    if (kind === 'gun') { hush(0.9); pl?.addShake?.(0.16); if (pl && pl.sta > 0) pl.sta = Math.max(0, pl.sta - (pl.maxSta || 100) * 0.2); }
    else pl?.addShake?.(0.06);
    if (g) press(army, g, kind === 'gun' ? 12 : 6, src, t.pos);
    return amount;
  }
  if (g) {
    const head = t === g.leader || t.ashiTaisho || t.stdHeld || t.banner;
    press(army, g, (kind === 'gun' ? 9 : 5) + (head ? 18 : 0), src, t.pos);
    // 撃たれた者の隣は身を低くする
    if (kind === 'gun' || head) army.forNear(t.pos.x, t.pos.z, 3.5, (o) => {
      if (o !== t && o.alive && o.team === t.team && !o.isPlayer && !o.mounted && !o.atk && !o.swing && !o.isStruct) o.duckT = Math.max(o.duckT || 0, army.time + 0.6 + (o.id % 3) * 0.2);
    });
  }
  return amount;
}

// 本人の上限（playerHitLimit）の後。「難しい」だけ、近い鉄砲は一発で命を取ることがある。
export function missilePlayerAfter(army, t, amount, src, kind) {
  const M = army.missile;
  if (!M || !M.hard || kind !== 'gun' || !(amount > 0) || !src?.pos) return amount;
  if (Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z) < 25 && Math.random() < 0.12) return t.hp + 0.01;
  return amount;
}

// ── 遮蔽（COVER_VALUE）：降る矢・流れ弾に当たる割合（1＝むき出し）。一人一秒に一度だけ測る。
export function missileCover(army, u) {
  if (!army.missile || !u) return 1;
  if (u._mcAt > army.time) return u._mc;
  u._mcAt = army.time + 1;
  let k = 1;
  if (u.terrain === 'forest') k *= 0.55;
  if (u.terrain === 'hori') k *= 0.6;
  if (u.tatake) k *= 0.25;
  const S = army.structs;
  if (S && S.length) {
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.alive || s.opened || !s.seg) continue;
      const q = s.seg;
      if (Math.abs(u.pos.x - (q[0] + q[2]) / 2) > Math.abs(q[2] - q[0]) / 2 + 3 || Math.abs(u.pos.z - (q[1] + q[3]) / 2) > Math.abs(q[3] - q[1]) / 2 + 3) continue;
      if (segDist(u.pos.x, u.pos.z, q) < 2.2) { k *= 0.5; break; }
    }
  }
  if (u.duckT > army.time) k *= 0.8;
  u._mc = k;
  return k;
}
function segDist(x, z, s) {
  const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - s[0]) * dx + (z - s[1]) * dz) / l2, 0, 1);
  return Math.hypot(s[0] + dx * t - x, s[1] + dz * t - z);
}
// 降る矢が当たる時に一度だけ引く（arrow_rain の rainHit）。true なら遮蔽に守られた。
export function missileShielded(army, u) {
  const k = missileCover(army, u);
  if (k >= 1 || Math.random() < k) return false;
  army.missile.stats.cover++;
  return true;
}

// ── 前進の遅れ（army_move の steer）。押されている組は足が鈍る。撃ち止んだ直後の「進め」は少し速い。
export function missileSlow(army, u) {
  const g = u.group;
  if (!g || !army.missile) return 1;
  if (g.mpSurge > army.time) return 1.15;
  const mp = g.mp || 0;
  return mp > 15 ? 1 - Math.min(0.35, (mp - 15) / 85 * 0.4) : 1;
}

// ── 毎コマ（units.js の update から）。重い見回しは間引く。
export function missileTick(army, dt) {
  const M = army.missile;
  if (!M || !(dt > 0)) return;
  const now = army.time;
  // 遅れて届く音・土煙（玉は音より先に着く）
  for (let i = 0; i < M.q.length; i++) {
    const e = M.q[i];
    if (e.at >= 0 && now >= e.at) { e.at = -1; if (e.snd) army.play(e.snd, e, e.vol); }
  }
  M.step += dt;
  if (M.step < 0.5) return;
  const st = M.step; M.step = 0;
  const rt = M.rt, P = army.playerUnit;
  for (const g of army.groups) {
    if (!(g.mp > 0)) continue;
    if (g.mp > M.stats.mpMax) M.stats.mpMax = Math.round(g.mp);
    const quiet = now - (g.mpAt ?? -99);
    // 撃ち止んで二秒半：押されていた組が「今だ、進め！」で一気に寄せる（攻めの組だけ）
    if (quiet > 2.5 && (g.mpPeak || 0) >= 40 && g.order === 'attack' && !g.routed && g.count > 2) {
      g.mpSurge = now + 5; g.mpPeak = 0; g.mp *= 0.4; M.stats.surge++;
      if (P?.alive && g.team === P.team && !rt.over) {
        const c = g.center();
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 45 && now - M.surgeAt > 20) { M.surgeAt = now; say(M, '組頭', '今だ、進め！', 20); }
      }
    }
    g.mp = Math.max(0, g.mp - st * (quiet > 3 ? 12 : 5));
    if (g.mp < 20) g.mpPeak = Math.min(g.mpPeak || 0, g.mp);
    if (g.mp > 45) { g.formLoose = now; g._looseT = now; }                 // 密集が崩れる
    if (g.mp > 60 && !M.soft && g.morale > 40 && !g.civ) g.morale = Math.max(40, g.morale - st * 0.6);   // 気が落ちる（四十より下へは押さない）
    // 本人の組が押された時の叫び
    if (P?.alive && g.team === P.team && g.mp > 50 && !rt.over) {
      const c = g.center();
      // 「伏せろ」と「盾を上げろ」は同じ叫びの言い替え。二つを合わせて十八秒に一度（木津川口の関所：五秒おきに交互に出続けた）
      if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 30 && now - (M.pinAt ?? -99) > 18) { M.pinAt = now; say(M, '組頭', g.mpUp ? '伏せろ！' : '盾を上げろ！', 10); }
      g.mpUp = !g.mpUp;
    }
  }
  M.slow += st;
  if (M.slow < 1) return;
  M.slow = 0;
  if (!rt.over && P?.alive && M.stray > 0) stray(army, M, P, now);
}

// ── 流れ矢・流れ弾と、隣の兵が突然倒れる（NEAR_MISS_EVENT・ALLY_CASUALTY_EVENT）
//   敵の弓・鉄砲が百二十歩の内にいて、斬り合いか射合いの場にいる時だけ。射手は見えなくてよい。
const _src = { team: 0, P: null, n: 0, pick: null, fight: false };
function srcVisit(o, s) {
  if (!o.alive || o.team === s.team || o.isStruct || o.fleeing || o.civ || o.gone) return;
  if (!s.fight && Math.abs(o.pos.x - s.P.pos.x) < 40 && Math.abs(o.pos.z - s.P.pos.z) < 40) s.fight = true;
  if (o.type !== 'gun' && o.type !== 'bow') return;
  s.n++;
  if (Math.random() * s.n < 1) s.pick = o;                                    // 一人をむらなく選ぶ
}
function stray(army, M, P, now) {
  const rt = M.rt, t = rt.t || 0;
  if (t < M.nextStray) return;
  const s = _src;
  s.team = P.team; s.P = P; s.n = 0; s.pick = null; s.fight = false;
  army.forNear(P.pos.x, P.pos.z, 120, srcVisit, s);
  const src = s.pick; s.P = null; s.pick = null;
  if (!src || !s.fight) { M.nextStray = t + 4; return; }
  M.nextStray = t + (7 + Math.random() * 9) / M.stray;
  const kind = src.type === 'gun' ? 'gun' : 'arrow';
  const far = Math.hypot(src.pos.x - P.pos.x, src.pos.z - P.pos.z);
  // 隣の兵が倒れる（毎回ではない）
  if (t >= M.nextAlly && M.allyN < M.allyMax && Math.random() < 0.5 && allyFalls(army, M, P, src, kind, far)) return;
  // 狙っていない矢玉が本人のそばへ（二〜五歩）。木・柵・土に刺さる
  const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
  const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r, y = army.world.heightAt(x, z);
  const wood = nearStruct(army, x, z);
  if (kind === 'gun') {
    army.play('whiz', P.pos, 1.1);
    army.burst(x, y + (wood ? 1.1 : 0.05), z, 5, wood ? 'wood' : 'dust', 0, 0, null, true);
    army.play('thunk', { x, y, z }, wood ? 0.6 : 0.35);
    queue(M, now + Math.min(0.6, far / 340), 'gun', src.pos, 0.55);          // 遅れて遠い銃声（どこからか分からない）
  } else {
    army.play('arrow', { x, y: y + 1, z }, 1.2);
    army.burst(x, y + (wood ? 1.2 : 0.05), z, 3, wood ? 'wood' : 'dust', 0, 0, null, true);
    army.play('thunk', { x, y, z }, 0.4);
  }
  if (army.lethal) { army.lethal.pSupp = Math.min(100, army.lethal.pSupp + (kind === 'gun' ? 14 : 8)); army.lethal.stats.nearMiss++; }
  if (P.group) press(army, P.group, kind === 'gun' ? 6 : 3, src, P.pos);
  M.stats.stray++;
}
function nearStruct(army, x, z) {
  const S = army.structs;
  if (!S) return false;
  for (let i = 0; i < S.length; i++) { const s = S[i]; if (s.alive && s.seg && segDist(x, z, s.seg) < 1.2) return true; }
  return false;
}
function queue(M, at, snd, p, vol) {
  for (let i = 0; i < M.q.length; i++) {
    const e = M.q[i];
    if (e.at < 0) { e.at = at; e.snd = snd; e.x = p.x; e.y = p.y; e.z = p.z; e.vol = vol; return; }
  }
}
// 名の無い雑兵（足軽・弓・鉄砲）だけ。史実・筋書きの者・名のある者・組頭・旗持は lethal.js の突然の負傷に任せる。
function plain(u) {
  return !(u.isPlayer || u.invuln || u.keepInvuln || u.mustLive || u.onWound || u.isTaisho || u.oTaisho || u.isLord || u.isCourier ||
    u.civ || u.kerai || u.isTomo || u.isSub || u.name || u.campProtected || u.noTarget || u.isStruct || u.histDeath || u.mounted ||
    u.type === 'dummy' || u.type === 'porter' || u.type === 'busho' || u.type === 'samurai' || u.ashiTaisho || u.stdHeld || u.banner ||
    u.farSim || u.gone || u.dying || u.woundOut || u.downed || u === u.group?.leader);
}
const _ally = { P: null, best: 1e9, pick: null };
function allyVisit(o, s) {
  if (!o.alive || o.team !== s.P.team || !plain(o) || Math.abs(o.pos.y - s.P.pos.y) > 3) return;
  const d = Math.hypot(o.pos.x - s.P.pos.x, o.pos.z - s.P.pos.z);
  if (d < 2.5 || d > 12) return;
  const r = d + Math.random() * 6;
  if (r < s.best) { s.best = r; s.pick = o; }
}
function allyFalls(army, M, P, src, kind, far) {
  const s = _ally;
  s.P = P; s.best = 1e9; s.pick = null;
  army.forNear(P.pos.x, P.pos.z, 12, allyVisit, s);
  const u = s.pick; s.P = null; s.pick = null;
  if (!u || missileShielded(army, u)) return false;
  const t = M.rt.t || 0;
  M.allyN++; M.nextAlly = t + M.allyGap * (0.8 + Math.random() * 0.5);
  M.stats.ally++;
  const die = !M.soft && Math.random() < 0.55;
  if (kind === 'gun') queue(M, army.time + Math.min(0.6, far / 340), 'gun', src.pos, 0.6);
  else army.play('arrow', u.pos, 1);
  army.damage(u, Math.max(1, die ? u.maxHp * 0.15 : u.hp - u.maxHp * 0.25), src, { kind, noCover: true });
  if (die && u.alive && !u.dying) { u.hp = 0; army.kill(u, src); M.stats.allyDead++; }
  else if (u.alive && !u.woundOut && !u.rearWound) army.subFallBack?.(u, src);
  army.play('cry', u.pos, 0.8);
  if (u.group) press(army, u.group, 14, src, u.pos);
  if (army.lethal) { army.lethal.pSupp = Math.min(100, army.lethal.pSupp + 12); army.lethal.allyDeathAt = army.time; }
  say(M, '足軽', kind === 'gun' ? '撃たれた！　どこからだ！' : '矢だ！　頭を下げろ！', 12);
  return true;
}

// 確かめの道具が読む（字は画面に出さない）
export function missileStats(army) {
  const M = army?.missile;
  return M ? { ...M.stats, allyN: M.allyN } : null;
}
