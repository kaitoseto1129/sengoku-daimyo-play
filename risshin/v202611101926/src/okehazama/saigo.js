// ======================================================================
// 桶狭間 12〜13分：義元の最期（毛利新介が届かない時の保険）
//   『信長公記』：服部小平太が義元にかかって膝を斬られ、毛利新介が義元を斬り伏せて首を取った。
//   義元が深手を負ってから五十秒たっても、退く旗本の囲みや地形に阻まれて毛利の刃が届かない時は、
//   毛利新介が囲みの切れ目を駆け抜けて義元へ寄り（歩く速さの倍。瞬間移動はしない）、間合いに入った所で討つ。
// ======================================================================
const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

function nextStep(rt, k, q, dt, stop) {
  const distance = Math.hypot(q.x - k.pos.x, q.z - k.pos.z);
  if (distance < 0.01) return null;
  const step = Math.min(Math.max(0, distance - stop), 6 * dt) / distance;
  const next = k._okeSaigoNext || (k._okeSaigoNext = { x: 0, y: 0, z: 0 });
  next.x = k.pos.x + (q.x - k.pos.x) * step;
  next.z = k.pos.z + (q.z - k.pos.z) * step;
  next.y = rt.world.heightAt(next.x, next.z);
  if (rt.army.wallBetween(k.pos, k.team, next) || rt.army.terrainBlocks(k.pos, next) || Math.abs(k.pos.y - next.y) >= 3) return null;
  return next;
}

export function tick(rt, dt) {
  const F = rt.flags, y = F.yoshimoto, mor = F.nobKill?.[1];
  if (rt.over || F.ending || F.victory || !F.koshiLeft || !F.yoshiDown || !y?.alive || rt.t - F.yoshiDownT < 50) return;
  // 毛利の手当ては本体が受け持つ。別人に討たせて毛利の首と知らせない。
  if (!ready(mor)) return;
  // 長引いても服部がかかる順を飛ばさない。健在なら先に同じ道で寄せる。
  const hat = F.nobKill?.[0];
  const hattoriFirst = !F.hattoriMet && ready(hat);
  const k = hattoriFirst ? hat : mor;
  k.target = y;
  const d = Math.hypot(k.pos.x - y.pos.x, k.pos.z - y.pos.z);
  // 通しで止まった幕の回り込みは、本体と同じ入口の道を使う。
  // 時間だけで遠くから討たず、一歩先まで幕・柵・地形を確かめる。
  const q = F.o15.C.honjinWay(rt.army, k, y.pos);
  if (d > 2.2 || q !== y.pos) {
    let next = nextStep(rt, k, q, dt, q === y.pos ? 2 : 0);
    // 幕の口への道上でも、小道具や斜面に一歩を阻まれたら同じ所で待ち続けない。
    // 共通の近い迂回先を使い、迂回する一歩も壁・地形を確かめる。
    if (!next && F.o15.C.localPoint) {
      const out = k._okeSaigoWay || (k._okeSaigoWay = { x: 0, y: 0, z: 0 });
      const way = F.o15.C.localPoint(rt.army, k, out, q.x, q.z);
      next = nextStep(rt, k, way, dt, 0);
    }
    if (!next) return;
    k.pos.x = next.x; k.pos.z = next.z;
    k.pos.y = next.y; k.yaw = Math.atan2(y.pos.x - k.pos.x, y.pos.z - k.pos.z);
    return;
  }
  // 本体と同じく、主人公が義元を見届けられる間合いまで討取りを待つ。
  const p = rt.player.u.pos;
  if (Math.hypot(p.x - y.pos.x, p.z - y.pos.z) > 12 ||
      Math.abs(p.y - y.pos.y) >= 3 ||
      rt.army.wallBetween(p, -1, y.pos) || rt.army.terrainBlocks(p, y.pos) ||
      rt.army.wallBetween(k.pos, k.team, y.pos) || rt.army.terrainBlocks(k.pos, y.pos) || Math.abs(k.pos.y - y.pos.y) >= 3) return;
  if (hattoriFirst) { F.hattoriMet = true; return; }
  y.invuln = false; y.officerSaved = true; rt.army.kill(y, k);
}
