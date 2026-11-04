// ついていく相手（kaito 11/2 夜 U・全戦）：戦は誰かについていく物。
//   足軽・組頭 → 組頭・足軽大将（近い味方の組の頭）／徒士・侍 → 侍大将（名のある味方の将）／侍大将から上 → 殿（味方の総大将）。
//   今ついていく相手の頭上に青い印（味方の目印。具足は塗らない）をいつも出し、画面の外なら端に青い矢印。
//   離れすぎたら「前に出すぎ」「遅れている」を短く知らせる（同じ知らせは 20 秒に一度まで）。
//   戦の定義の口：def.missionAlly(rt) があれば足軽の間はそれを先に使う。def.noLeaderFollow で切れる（関数なら rt を渡し、真の間だけ切る）。
import { VIEW, safeInsets } from './viewport.js';
import { gearStep } from './player.js';
import { cameraWallBlocked } from './battle_sight.js';

const ok = (u, me) => u && u.alive && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.fleeing && !u.isStruct && !u.civ &&
  u !== me && u.team === me.team && !u.isPlayer && !u.isSub && !u.isTomo;
const named = (u) => !!(u.name || u.isOfficer || u.isTaisho || u.type === 'busho');

// 身分の段（0：足軽・組頭、1：徒士・侍、2：侍大将から上）
export function followTier(rt) {
  const g = gearStep(rt.G || {}).g;
  return g >= 4 ? 2 : g >= 2 ? 1 : 0;
}

function pick(rt, me, tier) {
  const A = rt.army.units;
  let best = null, bs = Infinity;
  const near = (u, limit, bias = 0) => {
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) + bias;
    if (d < limit && d < bs) { bs = d; best = u; }
  };
  if (tier === 2) {
    // 殿：味方の総大将。いなければ一番格の高い味方の将
    for (const u of A) if (ok(u, me) && u.isTaisho) near(u, 1e4);
    if (best) return best;
    for (const u of A) if (ok(u, me) && u.type === 'busho') near(u, 1e4);
    return best;
  }
  if (tier === 1) {
    // 侍大将：総大将ではない名のある味方の将（いなければ総大将）
    for (const u of A) if (ok(u, me) && named(u) && !u.isTaisho && (u.type === 'busho' || u.isOfficer || u.mounted)) near(u, 220);
    if (best) return best;
    for (const u of A) if (ok(u, me) && u.isTaisho) near(u, 1e4);
    return best;
  }
  // 足軽：戦が決めた頭（組頭の旗持ちなど）を先に。無ければ近い味方の組の頭（組頭・足軽大将）
  const own = rt.def.missionAlly?.(rt);
  if (ok(own, me)) return own;
  for (const g of rt.army.groups || []) {
    const L = g.leader;
    if (g.team !== me.team || g.isPlayerSquad || g.isTomo || !ok(L, me)) continue;
    // 総大将の旗本は足軽の頭にしない（殿のそばへ足軽を寄せない）。名のある頭は少し先に選ぶ
    near(L, 120, L.isTaisho ? 60 : named(L) ? -6 : 0);
  }
  if (best) return best;
  for (const u of A) if (ok(u, me) && named(u)) near(u, 160);
  return best;
}

// 敵の真ん中の向き（前と後ろを決める）。一秒に一度だけ数える
function foeCenter(rt, me, out) {
  let sx = 0, sz = 0, n = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.team === me.team || u.isStruct || u.civ || u.gone) continue;
    if (Math.abs(u.pos.x - me.pos.x) + Math.abs(u.pos.z - me.pos.z) > 400) continue;
    sx += u.pos.x; sz += u.pos.z; n++;
  }
  if (!n) return false;
  out.x = sx / n; out.z = sz / n;
  return true;
}

export function leaderFollowTick(rt, dt) {
  const F = rt.leaderFollow || (rt.leaderFollow = { scan: 0, far: 0, sayAt: -99, foe: { x: 0, z: 0 }, hasFoe: false, unit: null });
  const me = rt.player?.u, def = rt.def;
  // noLeaderFollow は関数でもよい（その時だけ青を消す。黄色の行き先と青を同時に出さない・AL）
  const off = typeof def.noLeaderFollow === 'function' ? def.noLeaderFollow(rt) : def.noLeaderFollow;
  if (!me || def.town || def.dojo || off || rt.G?.lord) { F.unit = null; draw(rt, F, null); return; }
  F.scan -= dt;
  if (F.scan <= 0) {
    F.scan = 1;
    const tier = followTier(rt);
    const cur = F.unit;
    // 今の相手は倒れるか遠く離れるまで保つ（足軽は戦の決めた頭が替われば替える）
    const own = tier === 0 ? def.missionAlly?.(rt) : null;
    if (!ok(cur, me) || F.tier !== tier || ok(own, me) && own !== cur ||
        Math.hypot(cur.pos.x - me.pos.x, cur.pos.z - me.pos.z) > (tier === 0 ? 150 : 260)) { F.unit = pick(rt, me, tier); F.base = null; }
    F.tier = tier;
    F.hasFoe = foeCenter(rt, me, F.foe);
    // 離れすぎ：足軽 28m・侍 40m・侍大将 60m。三秒続いたら知らせる
    const L = F.unit;
    const d = L ? Math.hypot(L.pos.x - me.pos.x, L.pos.z - me.pos.z) : 0;
    // 戦が初めから離して置いた時（侍大将と本陣の殿など）は、その間合いを基にする
    if (L && F.base == null) F.base = d;
    const limit = Math.max([28, 40, 60][tier], (F.base || 0) * 1.3 + 12);
    const busy = rt.over || rt.choice || !me.alive || rt.phase === 'wait' || rt.prelude && rt.prelude !== 'done' || rt.hud.introWaiting || rt.player.mounted && tier === 0;
    F.far = L && d > limit && !busy ? F.far + 1 : 0;
    if (F.far >= 3 && rt.t - F.sayAt >= 20 && F.hasFoe) {
      const fx = F.foe.x - L.pos.x, fz = F.foe.z - L.pos.z, fl = Math.hypot(fx, fz) || 1;
      const ahead = ((me.pos.x - L.pos.x) * fx + (me.pos.z - L.pos.z) * fz) / fl;
      F.sayAt = rt.t;
      rt.hud.bark(ahead > limit * 0.5 ? '前に出すぎ' : '遅れている');
    }
  }
  draw(rt, F, me.alive && !rt.over ? F.unit : null);
}

// 頭上の青い印（見えている時）と、画面の端の青い矢印（外にいる時）。SVG は一つを使い回す
function draw(rt, F, L) {
  const hud = rt.hud;
  let el = F.el;
  const hide = !L || rt.choice || hud.introWaiting || hud.bigmap || rt.player.camShot || rt.game?.photo ||
    hud.root.classList.contains('photo') || hud.root.classList.contains('ending');
  if (hide) { F.badgeRect = null; if (el) el.style.display = 'none'; return; }
  if (!el || !el.isConnected) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
    el.innerHTML = '<path fill="#3b7dff" stroke="#0b1a33" stroke-width="3" stroke-linejoin="round"/><path fill="#3b7dff" stroke="#0b1a33" stroke-width="3" stroke-linejoin="round"/>';
    hud.root.appendChild(el); F.el = el;
  }
  const W = VIEW.w, H = VIEW.h, sa = safeInsets();
  const cam = rt.camera;
  const seen = L.mesh?.visible !== false && !L.camHidden &&
    !cameraWallBlocked(rt, cam.position, L.pos, cam.position.y, L.pos.y + 1.8);
  const frame = seen && hud.measurePersonFrame(L, rt, true);
  let badge = '', arrow = '', tf = ''; F.badgeRect = null;
  const inside = frame && frame.cx > sa.left + 16 && frame.cx < W - sa.right - 16 && frame.top > sa.top + 30 && frame.top < H - sa.bottom - 20;
  if (inside) {
    // 下を向いた青い印（敵の赤い▼と同じ形・色だけ違う）
    const x = frame.cx, y = Math.max(sa.top + 30, frame.top - 10);
    badge = `M${(x - 11).toFixed(1)} ${(y - 18).toFixed(1)}h22l-11 16Z`;
    // 名札（field_signs.js）がこの▼に重ならないように、▼の四角を控える
    const br = F.badgeBox || (F.badgeBox = { left: 0, right: 0, top: 0, bottom: 0 });
    br.left = x - 11; br.right = x + 11; br.top = y - 18; br.bottom = y - 2; F.badgeRect = br;
  }
  // 画面の外では青い端の矢印は出さない（矢印は常に一つ・行き先の印だけ。kaito 11/3 AV15）
  el.children[0].setAttribute('d', badge);
  el.children[1].setAttribute('d', arrow);
  if (tf) el.children[1].setAttribute('transform', tf); else el.children[1].removeAttribute('transform');
  el.style.display = '';
}

export function leaderFollowDispose(rt) {
  const F = rt.leaderFollow;
  if (F?.el) F.el.remove();
  rt.leaderFollow = null;
}
