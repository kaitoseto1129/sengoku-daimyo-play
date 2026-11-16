// K316⑤：二人がそれぞれの携帯で共闘する（同じパソコンの画面で）。
//   一人目は今まで通り phone_sword.js で自分を動かす。二人目は、もう一つの QR を自分の携帯で読むと、
//   自分の組の兵一人（相棒）を受け持つ。親指の棒で歩き（向きは画面の奥が前）、振ると近くの敵へ斬る・突く、
//   寝かせると構える。携帯の頁（sword.html）は一人目と同じ物を使い、つなぐ部屋の名だけを分ける。
//   二人目が3秒何もしなければ、相棒はいつもの兵の判断に戻る（army_think.js の thinkNow が u.coopUntil を見る）。
import * as THREE from 'three';
let peer = null, conn = null, tickT = 0, mark = null, mate = null, battleRef = null;
const st = { x: 0, y: 0, guard: false, at: 0, n: 0, hits: 0 };
window.__coopStat = st;

function loadScript(rel) {
  return new Promise((ok, ng) => {
    const url = new URL(rel, import.meta.url).href;
    if (document.querySelector(`script[src="${url}"]`)) return ok();
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => ng(new Error('読めない ' + rel));
    document.head.appendChild(s);
  });
}
const battle = () => window.__game?.battle || null;
const send = (m) => { try { if (conn && conn.open) conn.send(m); } catch (e) { /* 切れた */ } };

// 相棒：自分の組の生きている徒（騎馬・鉄砲・弓は除く）のうち、本人に一番近い者
function pickMate(b) {
  const P = b?.player?.u; if (!P || !b.squad) return null;
  let best = null, bd = 1e9;
  for (const u of b.squad) {
    if (!u.alive || u.fleeing || u.mounted || u.type === 'gun' || u.type === 'bow' || u.type === 'cavalry') continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
// 頭の上の小さな青い印（二人目の兵だと分かる。字は出さない）
function markOn(b, u) {
  if (!mark) {
    mark = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0x3f9bff, depthTest: false, transparent: true, opacity: 0.95 }));
    mark.rotation.x = Math.PI; mark.renderOrder = 999;
  }
  if (mark.parent !== b.scene) b.scene.add(mark);
  mark.position.set(u.pos.x, (u.pos.y || 0) + 2.55 + Math.sin(performance.now() / 300) * 0.06, u.pos.z);
}
function markOff() { if (mark && mark.parent) mark.parent.remove(mark); }

// 振りの向き → 兵の技（槍は突き・払い・叩き、刀は袈裟・逆袈裟・横・突き）
function kindOf(u, k) {
  const sword = (u.wpnKind || u.lookWeapon) === 'sword';
  if (sword) return { kara: 'kesa', kesa: 'kesa', gyaku: 'gyaku', nagi: 'yoko', tsuki: 'tsuki', kthrust: 'tsuki' }[k] || 'kesa';
  return { kara: 'slam', nagi: 'sweep', kesa: 'sweep', gyaku: 'sweep', tsuki: 'thrust', kthrust: 'thrust' }[k] || 'thrust';
}
// 画面の奥を前にした向き（xz）
function camAxes(b) {
  const c = b.camera, P = b.player?.u;
  let fx = 0, fz = 1;
  if (c && P) { fx = P.pos.x - c.position.x; fz = P.pos.z - c.position.z; }
  const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  return { fx, fz, rx: -fz, rz: fx };
}
// 前の 3.5m（向いている側 ±75 度）で一番近い敵。いなければ 2.4m 以内の一番近い敵
function foeNear(b, u, ax, az) {
  let best = null, bd = 1e9;
  for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.isStruct || o.noTarget || o.type === 'dummy') continue;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
    if (d > 3.5) continue;
    const front = (dx * ax + dz * az) / (d || 1) > 0.26;
    if (!front && d > 2.4) continue;
    const score = d - (front ? 0.6 : 0);
    if (score < bd) { bd = score; best = o; }
  }
  return best;
}

function swing(m) {
  const b = battle(); if (!b?.army || !mate?.alive) return;
  const u = mate, A = b.army;
  if (u.swing && !u.swing.done) return;
  const { fx, fz } = camAxes(b);
  const ax = Math.sin(u.heading), az = Math.cos(u.heading);
  const foe = foeNear(b, u, st.x || st.y ? ax : fx, st.x || st.y ? az : fz);
  st.n++;
  u.coopUntil = A.time + 3;
  if (!foe) return;
  const kind = kindOf(u, m.t === 'k' ? 'tsuki' : m.d);
  u.heading = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  u.target = foe; u.guarding = 0;
  u.atk = { t: 0.1, dur: 0.1, target: foe, kind, fast: (+m.p || 1) > 1.1 };
  const hp0 = foe.hp;
  setTimeout(() => { if (!foe.alive || foe.hp < hp0) { st.hits++; send({ t: 'hit', n: 1 }); } }, 650);
}

function apply(m) {
  if (!m) return;
  st.at = performance.now();
  if (m.t === 's' || m.t === 'k') swing(m);
  else if (m.t === 'g') st.guard = !!m.on;
  else if (m.t === 'm') { st.x = Math.abs(+m.x || 0) < 0.2 ? 0 : +m.x || 0; st.y = Math.abs(+m.y || 0) < 0.3 ? 0 : +m.y || 0; }
  else if (m.t === 'p') send({ t: 'q', ts: m.ts, ride: false });
}
export const applyCoop = apply;   // 試しの道具（coop_try.mjs）が携帯なしで振りを入れる所

// 毎コマ（30 回/秒）：相棒を選び直し・棒で歩かせ・構えを保ち・印を付ける
function tick() {
  const b = battle();
  if (!b?.army || !b.player?.u || b.ended) { markOff(); mate = null; return; }
  if (b !== battleRef) { battleRef = b; mate = null; }
  if (!mate || !mate.alive || mate.fleeing) { if (mate) mate.coopUntil = 0; mate = pickMate(b); }
  if (!mate) { markOff(); return; }
  markOn(b, mate);
  const u = mate, A = b.army;
  const live = performance.now() - st.at < 3000;
  if (!live) return;
  if (st.guard) { u.guarding = 0.5; u.coopUntil = A.time + 3; }
  if (st.x || st.y) {
    const { fx, fz, rx, rz } = camAxes(b);
    let mx = fx * -st.y + rx * st.x, mz = fz * -st.y + rz * st.x;
    const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    u.coopUntil = A.time + 3;
    if (!(u.atk && !u.atk.ranged) && !(u.swing && !u.swing.done)) { u.target = null; u.atk = null; }
    if (!u.moveTo || !u.moveTo.coop) u.moveTo = { x: 0, z: 0, coop: true };
    u.moveTo.x = u.pos.x + mx * 4; u.moveTo.z = u.pos.z + mz * 4;
  } else if (u.moveTo?.coop) { u.moveTo.x = u.pos.x; u.moveTo.z = u.pos.z; }
}

function panel() {
  let el = document.getElementById('coop-pair');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'coop-pair';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '二人目の携帯をつなぐ');
  el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;max-width:min(26em,calc(100vw - 32px));box-sizing:border-box;padding:12px;background:rgba(20,18,15,.92);color:#f1e9d8;border:1px solid #3f9bff;border-radius:8px;font-size:15px;line-height:1.5;text-align:center';
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;justify-content:center">
      <span aria-hidden="true" style="font-size:22px">📱</span><span aria-hidden="true" style="font-size:22px">📱</span><span aria-hidden="true" style="font-size:18px">→</span><span aria-hidden="true" style="font-size:22px;color:#3f9bff">▼</span></div>
    <div id="coop-qr" style="display:inline-block;background:#fff;padding:8px;border-radius:4px;line-height:0;margin-top:6px"></div>
    <p id="coop-st" role="status" aria-live="polite" style="margin:6px 0;font-size:13px;min-height:1.5em"></p>
    <button type="button" class="btn" id="coop-close" style="min-height:44px;min-width:44px">閉じる</button>`;
  document.body.appendChild(el);
  el.querySelector('#coop-close').onclick = () => el.remove();
  return el;
}

export async function openCoopPair() {
  const el = panel();
  const say = (t) => { const s = el.querySelector('#coop-st'); if (s) s.textContent = t; };
  try { await Promise.all([loadScript('./vendor/peerjs.min.js'), loadScript('./vendor/qrcode.js')]); }
  catch (e) { say('部品を読めませんでした'); return; }
  if (conn && conn.open) { say('つながっています'); setTimeout(() => el.remove(), 1200); return; }
  const room = 'k2' + Math.random().toString(36).slice(2, 10);
  const opts = window.__swordPeerOpts || null;
  const url = new URL('sword.html?r=' + room + (opts ? '&ps=' + encodeURIComponent(JSON.stringify(opts)) : ''), location.href.replace(/[?#].*$/, '')).href;
  el.dataset.url = url;
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  el.querySelector('#coop-qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: false });
  if (!/^https:/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) say('公開の Web 版の頁で開くと動きます');
  try { peer && peer.destroy(); } catch (e) { /* 前のつながり */ }
  peer = opts ? new window.Peer('risshin-sword-' + room, opts) : new window.Peer('risshin-sword-' + room);
  peer.on('error', () => say('つなぐ所に届きませんでした'));
  peer.on('connection', (c) => {
    try { conn && conn.close(); } catch (e) { /* 前の携帯 */ }
    conn = c;
    c.on('open', () => { say('つながりました'); window.__coopOn = true; setTimeout(() => { if (document.getElementById('coop-pair') === el) el.remove(); }, 1200); });
    c.on('data', apply);
    c.on('close', () => { conn = null; window.__coopOn = false; st.x = st.y = 0; st.guard = false; if (mate) mate.coopUntil = 0; markOff(); });
  });
  startTick();
}
export function startTick() { if (!tickT) tickT = setInterval(tick, 33); }
