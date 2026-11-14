// 一緒に突っ込む（kaito 11/3 AP5・13・16・全戦共通。battle.js が毎コマ呼ぶ）
//   本人が敵へ寄った（敵が 16m の内）ら、自分の組と、本人の 45m の内で控えている味方の備が「かかれ」で一緒に駆け込む。
//   向こうの 45m の内で構えて待つ敵の備も迎えに出て、大勢どうしが一気にぶつかる（小勢対小勢・一対一にしない）。
//   兵は足さず、消さない。筋書きで動く隊・持ち場を守る隊・伏兵・大将の隊・鉄砲と弓の隊は動かさない。def.noAllyCharge で止める。
//   12 秒敵がいなければ、自分の組だけ「ついて来い」へ戻す（ほかの備は大将の頭 ai.js に任せる）。
const NEAR = 45;

const free = (rt, g) => g.count > 0 && !g.routed && !g.civ && !g.hidden && !g.ambush && !g.stay && !g.guard && !g.guardOn && !g.reserve &&
  !g.noAI && !g.siegeAI && !g._massOwn && !g.dispatch && !g.isGun && !g.garrison && !(g.focus && g.focus.alive) &&
  !g.units.some((u) => u.alive && (u.isTaisho || u.isLord || u.oTaisho)) && (g.order === 'hold' || g.order === 'follow');

export function allyChargeTick(rt, dt) {
  const def = rt.def, A = rt.army, P = rt.player?.u;
  if (!A || !P || !P.alive || rt.over || rt.aftermath || def.noAllyCharge || def.dojo || def.town) return;
  if ((rt._acT = (rt._acT || 0) - dt) > 0) return;
  rt._acT = 0.5;
  const foe = A.nearestEnemy(P, 16, (o) => !o.fleeing && !o.isStruct && !o.civ && !o.noTarget && !o.downed);
  if (foe) rt._acFight = rt.t;
  if (rt._acFight == null) return;
  if (rt.t - rt._acFight > 12) {
    for (const g of A.groups) if (g._apCharge) { g._apCharge = false; if (g.isPlayerSquad && g.order === 'attack') g.order = 'follow'; }
    rt._acFight = null;
    return;
  }
  if (!foe) return;
  for (const g of A.groups) {
    if (g._apCharge) continue;
    const mine = g.team === P.team;
    if (g.isPlayerSquad) {
      if (!g.count || g.routed || g.pending || (g.order !== 'follow' && g.order !== 'hold')) continue;
    } else if (!free(rt, g)) continue;
    const c = g.center(), ref = mine ? P.pos : foe.pos;
    if (Math.hypot(c.x - ref.x, c.z - ref.z) > NEAR) continue;
    // 弓・鉄砲だけの備は撃ち続ける
    if (!g.units.some((u) => u.alive && (u.sidearm || u.type !== 'gun' && u.type !== 'bow'))) continue;
    g._apCharge = true;
    g.order = 'attack';
    g.seekRange = Math.max(g.seekRange || 0, 30);
    for (const u of g.units) if (u.alive && !u.fleeing) u.aiT = Math.min(u.aiT ?? 0, 0.1 + Math.random() * 0.4);
  }
}
