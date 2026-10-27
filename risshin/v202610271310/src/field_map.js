// 隅の小さな全体地図（kaito 10/25「どっちも ok」・テストプレイの声 10/24「両軍の位置関係が分かりづらい」）
//   自分の位置と向き・行き先のピン・味方の固まり（味方の色）・敵の固まり（敵の色）を形で分ける。味方は丸、敵は三角、行き先は旗。字は出さない。
//   canvas 一枚。十分の一秒ごとに描き直し、毎コマは描かない。北（戦の始めの向き）を上に固定し、点が回らない。
//   押したら大きな地図を開く。
//   10/28 kaito「小さな地図復活でもいいよ」（tarapon「透けて見える小さな地図が無くなったのが気になった」）：全部の戦で出す。半透明で小さく、四分の一秒ごとに描く。
import { missionTarget } from './mission_pin.js';

const CELLS = 5, CELL_COUNT = CELLS * CELLS, MARKS = 6;
const RANGE = 75;          // 地図の半径（歩）
const STEP = 0.25;         // 描き直しの間（秒）。毎コマは描かない
let st = null;

function build(root) {
  const cv = document.createElement('canvas');
  cv.id = 'fieldmap';
  cv.setAttribute('role', 'button');
  cv.tabIndex = 0;
  cv.setAttribute('aria-label', '大きな地図を開く');
  const style = document.createElement('style');
  style.textContent = `#fieldmap{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));top:calc(60px + env(safe-area-inset-top,0px));width:21vh;height:21vh;min-width:80px;min-height:80px;max-width:150px;max-height:150px;border-radius:50%;opacity:.78;pointer-events:auto;cursor:pointer;z-index:6;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#fieldmap:focus-visible{outline:3px solid #fff3ba;outline-offset:3px}
#fieldmap[hidden],#hud.photo #fieldmap,#hud.ending #fieldmap,#hud:has(#bigmap:not([hidden])) #fieldmap,body:has(#pause:not([hidden])) #fieldmap{display:none}
#hud.has-fieldmap #minimap{display:none !important}`;
  document.head.appendChild(style);
  root.appendChild(cv);
  cv.addEventListener('click', (e) => { e.stopPropagation(); window.__game?.toggleBigMap?.(); });
  cv.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) window.__game?.toggleBigMap?.(); }
  });
  cv.addEventListener('pointerdown', (e) => e.stopPropagation());
  cv.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  return { cv, g: cv.getContext('2d'), t: 0, rt: null, up: 0, px: 0, style, counts: new Uint16Array(CELL_COUNT * 2) };
}

export function fieldMapTick(rt, root, dt) {
  if (!root || !rt?.army || !rt.player) return;
  // 戦の noFieldMap（稲生の標準で消していた）は見ない。全部の戦で出す（kaito 10/28）
  const off = rt.def.town || rt.def.dojo;
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
  const unit = px / css;
  const R = px / 2, k = (R - 6 * unit) / RANGE;
  const me = rt.player.u.pos;
  // 世界の x,z を地図の上下左右へ。始めの向き（up）が画面の上。
  const c = Math.cos(st.up), s = Math.sin(st.up);
  const mapX = (x, z) => { const dx = x - me.x, dz = z - me.z; return R + (-dx * c + dz * s) * k; };
  const mapY = (x, z) => { const dx = x - me.x, dz = z - me.z; return R - (dx * s + dz * c) * k; };
  g.clearRect(0, 0, px, px);
  g.save();
  g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2);
  g.fillStyle = 'rgba(14,12,10,.42)'; g.fill();
  g.lineWidth = Math.max(1, px / 90); g.strokeStyle = 'rgba(232,194,90,.55)'; g.stroke();
  g.clip();
  // 兵を升目でまとめ、両軍六つずつまで。減らすのは地図の印だけ。
  // 入れ物は初回に作り、人数の多い固まりから同じ升目の中心へ描く。
  const counts = st.counts, cell = px / CELLS, dot = 3.5 * unit, team = rt.player.u.team;
  counts.fill(0);
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.team > 1 || u.type === 'dummy' || u.type === 'porter') continue;
    const x = mapX(u.pos.x, u.pos.z), y = mapY(u.pos.x, u.pos.z);
    if (Math.hypot(x - R, y - R) > R - dot || x < 0 || y < 0 || x >= px || y >= px) continue;
    const pass = u.team === team ? 0 : 1;
    counts[pass * CELL_COUNT + Math.floor(y / cell) * CELLS + Math.floor(x / cell)]++;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < MARKS; n++) {
      let best = -1, most = 0;
      for (let i = 0; i < CELL_COUNT; i++) {
        const count = counts[pass * CELL_COUNT + i];
        if (count > most) { most = count; best = i; }
      }
      if (best < 0) break;
      counts[pass * CELL_COUNT + best] = 0;
      // 同じ升目で戦う敵味方は左右に分け、色が重なって消えるのを防ぐ。
      let x = (best % CELLS + .5) * cell + (pass ? 1 : -1) * dot * 1.3;
      let y = (Math.floor(best / CELLS) + .5) * cell;
      const d = Math.hypot(x - R, y - R), lim = R - dot - 2 * unit;
      if (d > lim) { x = R + (x - R) / d * lim; y = R + (y - R) / d * lim; }
      g.beginPath();
      if (pass === 0) { g.arc(x, y, dot, 0, Math.PI * 2); }
      else {
        // 桶狭間は頭上と同じ赤い▼。上向きの別の印にしない。
        const tip = rt.def.missionStyle === 'raid' ? 1 : -1;
        g.moveTo(x, y + tip * dot * 1.3); g.lineTo(x + dot * 1.2, y - tip * dot); g.lineTo(x - dot * 1.2, y - tip * dot); g.closePath();
      }
      g.lineWidth = 2 * unit; g.strokeStyle = '#14120f'; g.stroke();
      g.fillStyle = pass === 0 ? '#f2ce6e' : '#ff8067'; g.fill();
    }
  }
  // 行き先は大きな旗。遠い時も地図の縁に同じ旗を残す。
  const pin = missionTarget(rt);
  if (pin && Number.isFinite(pin.x) && Number.isFinite(pin.z)) {
    let x = mapX(pin.x, pin.z), y = mapY(pin.x, pin.z);
    const dx = x - R, dy = y - R, d = Math.hypot(dx, dy), lim = R - 16 * unit;
    if (d > lim) { x = R + dx / d * lim; y = R + dy / d * lim; }
    const h = 16 * unit;
    g.beginPath();
    g.moveTo(x - h * .2, y + h * .5); g.lineTo(x - h * .2, y - h * .5);
    g.lineTo(x + h * .55, y - h * .5); g.lineTo(x + h * .35, y - h * .2);
    g.lineTo(x + h * .55, y + h * .1); g.lineTo(x - h * .2, y + h * .1);
    g.lineWidth = 3 * unit; g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(x - h * .2, y - h * .5); g.lineTo(x - h * .2, y + h * .5);
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2 * unit; g.stroke();
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
