// 隅の小さな全体地図（kaito 10/25「どっちも ok」・テストプレイの声 10/24「両軍の位置関係が分かりづらい」）
//   自分の位置と向き・行き先のピン・味方の固まり（味方の色）・敵の固まり（敵の色）だけを点で描く。字は出さない。
//   canvas 一枚。十分の一秒ごとに描き直し、毎コマは描かない。北（戦の始めの向き）を上に固定し、点が回らない。
//   押したら大きな地図を開く。
const RANGE = 75;          // 地図の半径（歩）
const STEP = 0.1;          // 描き直しの間（秒）
let st = null;

function build(root) {
  const cv = document.createElement('canvas');
  cv.id = 'fieldmap';
  cv.setAttribute('role', 'button');
  cv.setAttribute('aria-label', '大きな地図を開く');
  const style = document.createElement('style');
  style.textContent = `#fieldmap{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));top:calc(60px + env(safe-area-inset-top,0px));width:22vh;height:22vh;min-width:80px;min-height:80px;max-width:180px;max-height:180px;border-radius:50%;pointer-events:auto;cursor:pointer;z-index:6;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#fieldmap[hidden],#hud.photo #fieldmap,#hud.ending #fieldmap,#hud:has(#bigmap:not([hidden])) #fieldmap,body:has(#pause:not([hidden])) #fieldmap{display:none}
#hud.has-fieldmap #minimap{display:none !important}`;
  document.head.appendChild(style);
  root.appendChild(cv);
  cv.addEventListener('click', (e) => { e.stopPropagation(); window.__game?.toggleBigMap?.(); });
  cv.addEventListener('pointerdown', (e) => e.stopPropagation());
  cv.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  return { cv, g: cv.getContext('2d'), t: 0, rt: null, up: 0, px: 0, style };
}

export function fieldMapTick(rt, root, dt) {
  if (!root || !rt?.army || !rt.player) return;
  const off = rt.def.town || rt.def.dojo || rt.def.noFieldMap;
  if (!st) { if (off) return; st = build(root); }
  root.classList.toggle('has-fieldmap', !off);
  const hide = off || !!rt.hud?.introWaiting || !!rt.choice || !rt.player.u;
  if (st.cv.hidden !== hide) st.cv.hidden = hide;
  if (hide) return;
  if (st.rt !== rt) {
    // 戦の始めに向いていた方を上にして、戦の間は回さない。
    st.rt = rt; st.t = 0;
    st.up = rt.def.spawn?.heading ?? rt.player.yaw ?? 0;
  }
  st.t -= dt || 0;
  if (st.t > 0) return;
  st.t = STEP;
  const cv = st.cv, g = st.g;
  const css = Math.round(cv.clientWidth) || 96;
  const px = Math.min(2, window.devicePixelRatio || 1) * css | 0;
  if (cv.width !== px) { cv.width = cv.height = px; }
  const R = px / 2, k = (R - 4) / RANGE;
  const me = rt.player.u.pos;
  // 世界の x,z を地図の上下左右へ。始めの向き（up）が画面の上。
  const c = Math.cos(st.up), s = Math.sin(st.up);
  const mapX = (x, z) => { const dx = x - me.x, dz = z - me.z; return R + (-dx * c + dz * s) * k; };
  const mapY = (x, z) => { const dx = x - me.x, dz = z - me.z; return R - (dx * s + dz * c) * k; };
  g.clearRect(0, 0, px, px);
  g.save();
  g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2);
  g.fillStyle = 'rgba(14,12,10,.55)'; g.fill();
  g.lineWidth = Math.max(1, px / 90); g.strokeStyle = 'rgba(232,194,90,.55)'; g.stroke();
  g.clip();
  // 兵：味方は金、敵は朱。小さな点が重なって固まりに見える。いつも同じ順に描く。
  const dot = Math.max(1.5, px / 70), team = rt.player.u.team;
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = pass === 0 ? 'rgba(242,206,110,.85)' : 'rgba(240,70,46,.9)';
    g.beginPath();
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.type === 'dummy' || u.type === 'porter') continue;
      if ((u.team === team) !== (pass === 0)) continue;
      const x = mapX(u.pos.x, u.pos.z), y = mapY(u.pos.x, u.pos.z);
      if (x < -dot || y < -dot || x > px + dot || y > px + dot) continue;
      g.moveTo(x + dot, y); g.arc(x, y, dot, 0, Math.PI * 2);
    }
    g.fill();
  }
  // 行き先のピン：画面の外なら縁に寄せる。
  const pin = rt.def.missionPin ? rt.def.missionPin(rt) : rt.missionGuide?.pos;
  if (pin && Number.isFinite(pin.x) && Number.isFinite(pin.z)) {
    let x = mapX(pin.x, pin.z), y = mapY(pin.x, pin.z);
    const dx = x - R, dy = y - R, d = Math.hypot(dx, dy), lim = R - px / 12;
    if (d > lim) { x = R + dx / d * lim; y = R + dy / d * lim; }
    const h = px / 9;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x - h * .45, y - h * .75); g.arc(x, y - h, h * .5, Math.PI * .8, Math.PI * .2); g.closePath();
    g.lineWidth = Math.max(2, px / 50); g.strokeStyle = '#14120f'; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
  }
  // 自分：白い矢じり。向きは本人の向き。
  const yaw = rt.player.yaw ?? 0, a = yaw - st.up;
  const sz = px / 11;
  g.translate(R, R); g.rotate(-a);
  g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * .7, sz * .75); g.lineTo(0, sz * .35); g.lineTo(-sz * .7, sz * .75); g.closePath();
  g.lineWidth = Math.max(2, px / 50); g.strokeStyle = '#14120f'; g.stroke();
  g.fillStyle = '#ffffff'; g.fill();
  g.restore();
}
