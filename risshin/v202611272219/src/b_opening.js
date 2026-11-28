// 長い行軍を省いた開戦・場面替えでだけ使う。地形と兵の傷は変えない。
export function placeGroup(rt, g, x, z) {
  if (g.routed) return;
  g.anchor.x = x; g.anchor.z = z;
  g.order = 'hold'; g.dest = null; g.path = null; g.pathIdx = 0;
  g.onArrive = null; g.pending = null; g.focus = null;
  g.target = null;
  for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    const at = g.slotPos(u.slot, g.initial);
    u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z);
    u.mesh.position.copy(u.pos);
    u.moveTo = null; u.target = null;
    u._riverX = undefined; u._riverZ = undefined;
  }
}

export function placePlayer(rt, x, z, heading) {
  const u = rt.player.u, dx = x - u.pos.x, dz = z - u.pos.z;
  for (const t of rt.tomoUnits || []) if (t.alive && !t.gone && !t.woundOut) {
    t.pos.x += dx; t.pos.z += dz; t.pos.y = rt.world.heightAt(t.pos.x, t.pos.z);
    t.mesh.position.copy(t.pos); t.moveTo = null; t.target = null;
  }
  if (heading !== undefined) { u.heading = heading; rt.player.yaw = heading; }
  u.pos.set(x, rt.world.heightAt(x, z), z);
  u.mesh.position.copy(u.pos); u.moveTo = null; u.target = null;
  u._riverX = undefined; u._riverZ = undefined;
  bringHorse(rt);
}

// K667（kaito 11/25「ワープは全部禁止。させたいならボタンを押させる」）：戦の途中で本人を別の所へ移す時はこれを使う。
//   開戦の二秒以内か 6m 以内なら今まで通り置く（飛んだと分からない）。それより遠ければ勝手には動かさず、
//   「何が起きるか」を書いたボタンを出し、押した時だけ placePlayer と同じに移す。押さずに自分の足で近づけば（8m 以内）ボタンは消える。
//   label は「本陣へ移る」のように何が起きるかを書く。戻り値：その場で置いたら true。
export function moveOrAsk(rt, x, z, heading, label) {
  return askThen(rt, x, z, label, () => placePlayer(rt, x, z, heading));
}
// 本人の移しの本体 fn を、近い時（6m 以内・開戦の二秒以内）はすぐ、遠い時は書いたボタンを押した時だけ呼ぶ。すぐ呼んだら true
export function askThen(rt, x, z, label, fn) {
  const u = rt.player?.u; if (!u) return false;
  if ((rt.t || 0) < 2 || Math.hypot(x - u.pos.x, z - u.pos.z) <= 6) { fn(); return true; }
  if (typeof document === 'undefined') return false;
  rt._warpBtn?.remove();
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'k667-warp'; el.textContent = label || 'そこへ移る';
  el.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:41;min-height:44px;padding:10px 22px;border-radius:8px;'
    + 'background:#1b1410;color:#efe6d2;border:2px solid #c9a24b;font:600 16px/1.4 "Hiragino Mincho ProN","Yu Mincho",serif;cursor:pointer;touch-action:manipulation;';
  const gone = () => { el.remove(); if (rt._warpBtn === el) rt._warpBtn = null; };
  el.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); gone();
    if (rt.over || !rt.player?.u?.alive) return;
    rt.warpOk = true; fn();
  });
  document.body.appendChild(el); rt._warpBtn = el;
  const dispose = rt.dispose.bind(rt);
  rt.dispose = (...a) => { gone(); return dispose(...a); };
  const watch = () => { if (rt._warpBtn !== el) return; if (rt.over || Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) <= 8) { gone(); return; } rt.after(1, watch, true); };
  rt.after(1, watch, true);
  return false;
}

// 11/11 関所の5（鳥取）：段の間に本人だけ遠くへ移すと、降りて待つ自分の馬が二百歩後ろに残り、呼んでも来ず乗れなかった。
//   口取りが曳いて来た心で、本人の後ろ五歩へ連れて来る（逃げた・下がった・死んだ馬はそのまま）。
export function bringHorse(rt) {
  const P = rt.player, u = P?.u, L = P?.loose, h = P?.horse;
  if (!u || !L || !h || L.mode === 'fled' || L.mode === 'back' || h.userData?.horse?.dead) return;
  if (Math.hypot(L.x - u.pos.x, L.z - u.pos.z) < 20) return;
  const lim = rt.world.def.moveLim || 176;
  L.x = Math.max(-lim, Math.min(lim, u.pos.x - Math.sin(u.heading) * 5));
  L.z = Math.max(-lim, Math.min(lim, u.pos.z - Math.cos(u.heading) * 5));
  L.heading = u.heading; L.spd = 0; L.mode = 'wait'; L.farT = 0;
  h.position.set(L.x, rt.world.heightAt(L.x, L.z), L.z);
}
