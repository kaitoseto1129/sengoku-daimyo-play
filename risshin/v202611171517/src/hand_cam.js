// カメラで手と腕を読んで遊ぶ（K255・kaito 11/11「カメラで手と腕を読み、腕を振ると刀・両手で槍・片手で鉄砲」）。パソコンと携帯の Web 版（アプリは手の型 17MB を入れる次の版）。
// K320（11/15）：握った手（拳）の軌跡で技を分ける＝振り下ろし（上段）・横薙ぎ・袈裟・逆袈裟・突き。刀は input.phoneSwing の向きの技、槍は突き・払い・叩きつけ。字は出さない。
//   設定の「カメラの手で遊ぶ」から始める。手の骨組みは MediaPipe の手の型（Apache-2.0・prototype/web_only/hands。読み込み時に外へ取りに行かない）。
//   片手を速く振る＝斬る ／ 両手をそろえて前へ突き出す＝槍の突き ／ 片手を前に伸ばして止める＝鉄砲なら撃つ・それ以外は構え
//   両腕を頭の上へ上げて止める＝受け（K310 段2・敵の振りかぶりへの答え）
//   入れる先は携帯の刀（phone_sword.js）と同じ：input.leftPressed（斬る・突く・撃つ）と input.guardHeld（構え）。
//   技に合わせて得物も持ち替える（振る＝刀・両手＝槍・片手を伸ばして止める＝鉄砲。持っていない得物は今の得物のまま）。
const BASE = new URL('../web_only/hands/', import.meta.url).href;
let lm = null, video = null, stream = null, box = null, raf = 0, lastT = 0;
const prev = [];               // 手ごとの前の手首・掌の大きさ
const trail = [];              // 手ごとの軌跡（直近 0.35 秒の {t,x,y,s,fist}）
let cdT = 0, stillT = 0, firedStill = false, pendT = 0, pushAcc = 0, prev2 = null, prev2T = 0, lastSp = 0, countT = 0, pushPk = 0;
const pushWin = [];            // 両手の大きさの窓（[右の大きさ, 左の大きさ, 時刻]・0.6 秒）
const stat = { frames: 0, handFrames: 0, kiru: 0, yari: 0, teppo: 0, uke: 0, log: [], pk: [] };   // 確かめの道具が読む（window.__handcamStat）
let ov = null;                 // 鏡の上に読んだ手の骨組みを描く

// 技に合う得物へ持ち替える。持ち替えたら隙（cd）の後に一度押す
const WPN = { kiru: 'sword', yari: 'spear', teppo: 'gun' };
function arm(act, now) {
  const p = window.__game?.battle?.player;
  const w = WPN[act];
  if (!p || !p.switchWeapon || p.weapon === w || !p.weaponList?.().includes(w)) return false;
  p.switchWeapon(w);
  if (p.weapon !== w) return false;
  pendT = now + (w === 'gun' ? 650 : 400);
  return true;
}
const PHONE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
let gapMs = PHONE ? 66 : 33;   // 読む間（携帯は 15 回/秒。読むのが重ければさらに空ける）

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const weapon = () => window.__game?.battle?.player?.weapon || '';

// K320：握り（拳）を見分ける。人差し指〜小指の先が、指の付け根より手首に近い（曲げている）指が三本以上
export function isFist(h) {
  let n = 0;
  for (const [mcp, tip] of [[5, 8], [9, 12], [13, 16], [17, 20]]) if (d2(h[tip], h[0]) < d2(h[mcp], h[0]) * 1.2) n++;
  return n >= 3;
}
// K320：握った手の軌跡から技を分ける。x,y は映像の向き（左右は鏡にしていない）。
//   手が急に大きくなる（前へ出す）＝突き／下へ大きく＝振り下ろし（上段）／横へ大きく＝横薙ぎ／斜め下＝袈裟・逆袈裟
export function swingOf(tr) {
  if (tr.length < 2) return null;
  const a = tr[0], b = tr[tr.length - 1], dt = Math.max(0.05, (b.t - a.t) / 1000);
  const dx = -(b.x - a.x), dy = b.y - a.y;        // dx は遊び手から見た右を正にする（映像は鏡でない）
  const lat = Math.hypot(dx, dy), grow = (b.s - a.s) / Math.max(0.02, a.s);
  if (grow > 0.35 && lat < Math.max(0.12, b.s * 0.9)) return 'tsuki';
  if (lat / dt < 1.6 || lat < 0.14) return null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay > ax * 1.6) return dy > 0 ? 'kara' : 'gyaku';     // 真下へ＝振り下ろし（振り上げは逆袈裟で返す）
  if (ax > ay * 1.6) return 'nagi';
  return dy > 0 && dx < 0 ? 'kesa' : 'gyaku';             // 右上から左下＝袈裟、左下から右上・左上から右下＝逆袈裟
}

// 一コマの手の骨組みから技を決める（外から試せるように分けた）。hands：[[21点{x,y,z}]...]、dt 秒、now ミリ秒
export function readHands(hands, dt, now, input = window.__input, wpn = weapon()) {
  if (!input) return null;
  const cur = hands.map((h) => ({ w: h[0], s: d2(h[0], h[9]), tip: d2(h[0], h[8]), fist: isFist(h) }));
  let act = null;
  if (prev.length !== cur.length) { prev.length = 0; trail.length = 0; countT = now; }   // 手の数が替わった一コマは速さを見ない（取り違えで斬らない）
  // 型は二つの手の順を入れ替えて返す事がある。前のコマの近い方の手と組にする（取り違えると手が飛んだように見えて「斬る」になる）
  if (cur.length === 2 && prev.length === 2 && d2(cur[0].w, prev[1].w) + d2(cur[1].w, prev[0].w) < d2(cur[0].w, prev[0].w) + d2(cur[1].w, prev[1].w)) { prev.reverse(); trail.reverse(); }
  cur.forEach((c, i) => {
    const tr = trail[i] || (trail[i] = []);
    tr.push({ t: now, x: c.w.x, y: c.w.y, s: c.s, fist: c.fist });
    while (tr.length && now - tr[0].t > 350) tr.shift();
  });
  const sp = cur.map((c, i) => (prev[i] ? d2(c.w, prev[i].w) / Math.max(0.016, dt) : 0));
  const grow = cur.map((c, i) => (prev[i] ? (c.s - prev[i].s) / Math.max(0.016, dt) / Math.max(0.02, prev[i].s) : 0));
  // 両手の突き：二つの手が近く（槍を握る幅）、0.6 秒の内の一番小さかった時よりそろって大きくなったら突き。
  //   型の読み取りは 0.3 秒ほど遅れ、機械が混むと読む回数も 9 回/秒まで落ちるので、一コマごとの増え方でなく、読む回数によらない「窓の中の一番小さい時」と比べる
  const two = cur.length === 2 && d2(cur[0].w, cur[1].w) < 0.42;
  if (two) {
    if (prev2 && now - prev2T < 350) {
      if (d2(cur[0].w, prev2[1].w) + d2(cur[1].w, prev2[0].w) < d2(cur[0].w, prev2[0].w) + d2(cur[1].w, prev2[1].w)) pushWin.forEach((q) => { const t0 = q[0]; q[0] = q[1]; q[1] = t0; });
    } else pushWin.length = 0;
    pushWin.push([cur[0].s, cur[1].s, now]);
    while (pushWin.length && now - pushWin[0][2] > 600) pushWin.shift();
    const m0 = Math.min(...pushWin.map((q) => q[0])), m1 = Math.min(...pushWin.map((q) => q[1]));
    pushAcc = Math.min(Math.log(cur[0].s / Math.max(0.02, m0)), Math.log(cur[1].s / Math.max(0.02, m1)));
    prev2 = [cur[0], cur[1]]; prev2T = now;
    if (pushAcc > pushPk) pushPk = pushAcc; else if (pushAcc < 0.02 && pushPk > 0.05) { if (stat.pk.length < 60) stat.pk.push(`${(now / 1000).toFixed(1)}:${pushPk.toFixed(2)}`); pushPk = 0; }
  } else if (now - prev2T > 350) { pushAcc = 0; pushWin.length = 0; }
  const thrusting = two && (pushAcc > 0.15 || Math.abs(grow[0]) > 0.8 || Math.abs(grow[1]) > 0.8);   // 両手が前後に動く間は振りにしない
  if (pendT && now > pendT) { input.leftPressed = true; pendT = 0; }
  // 開いた手の振りは二コマ続けて速い時だけ（一コマだけ手が飛ぶのは、型の読み替えか取り違え）。手の数が替わって 0.2 秒も振りにしない
  const spNow = sp.length ? Math.max(...sp) : 0;
  // K310 段2「両腕を上げると受け」：開いた両手を頭より上（映像の上の三分の一）に上げて止める間は構え（受け）。上げている間は振りにしない
  const raised = cur.length === 2 && cur.every((c, i) => !c.fist && c.w.y < 0.36 && sp[i] < 1.0);
  if (raised) { if (!input.guardHeld) stat.uke++; trail.forEach((t) => (t.length = 0)); pushAcc = 0; pushWin.length = 0; }
  if (now > cdT && !raised) {
    let k = null;
    if (pushAcc > 0.25) { act = 'yari'; k = 'tsuki'; if (stat.pk.length < 60) stat.pk.push(`${(now / 1000).toFixed(1)}:Y${pushAcc.toFixed(2)}`); pushAcc = 0; pushPk = 0; pushWin.length = 0; }   // 両手で前へ
    else if (!thrusting) {
      // 握った手（軌跡の多くで拳）の振りを読む
      for (let i = 0; i < cur.length && !k; i++) {
        const tr = trail[i];
        if (tr.length >= 2 && tr.filter((p) => p.fist).length * 2 >= tr.length) k = swingOf(tr);
      }
      if (k) act = k === 'tsuki' ? 'yari' : 'kiru';
      else if (lastSp > 1.2 && now - countT > 200 && cur.some((c, i) => !c.fist && sp[i] > 2.2)) act = 'kiru';                                           // 開いた手を速く振る（技は連打の段で）
    }
    if (act) {
      if (k) input.phoneSwing = { k: k === 'tsuki' ? 'kthrust' : k, pow: Math.max(0.85, Math.min(1.3, Math.max(...sp, 1.6) / 2.6)) };
      if (!arm(act, now)) input.leftPressed = true;
      cdT = now + (act === 'yari' ? 450 : 350); stillT = 0; firedStill = false;
      trail.forEach((t) => (t.length = 0));
      const S = window.__handStat || (window.__handStat = { n: 0, kinds: {} });   // 確かめ用（画面には出さない）
      S.n++; S.kinds[k || act] = (S.kinds[k || act] || 0) + 1;
    }
  }
  // 片手を前に伸ばして止める：掌が大きく（前へ伸ばした）、手首がほとんど動かない（開いた手だけ。握って止めるのは振りの溜め）
  const still = cur.length === 1 && !cur[0].fist && sp[0] < 0.35 && cur[0].s > 0.16 && cur[0].tip > cur[0].s * 1.6;
  stillT = still ? stillT + dt : 0;
  if (stillT > 0.5 && !firedStill && wpn !== 'gun' && arm('teppo', now)) { wpn = 'gun'; firedStill = true; act = 'teppo'; }
  if (wpn === 'gun') {
    input.guardHeld = false;
    if (stillT > 0.5 && !firedStill) { input.leftPressed = true; firedStill = true; act = 'teppo'; }
    if (!still) firedStill = false;
  } else input.guardHeld = raised || stillT > 0.3;
  lastSp = spNow;
  prev.length = 0; prev.push(...cur);
  return act;
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (!lm || !video || video.readyState < 2) return;
  const now = performance.now();
  if (now - lastT < gapMs) return;         // パソコン 30 回/秒・携帯 15 回/秒で足りる
  const dt = lastT ? (now - lastT) / 1000 : 0.033;
  lastT = now;
  let res = null;
  const t0 = performance.now();
  try { res = lm.detectForVideo(video, now); } catch (e) { return; }
  const cost = performance.now() - t0;   // 読むのが重い機械は間を空けて、戦の画質と速さを守る（画質は下げない）
  if (cost > 14 && gapMs < 110) gapMs += 11; else if (cost < 6 && gapMs > (PHONE ? 66 : 33)) gapMs -= 11;
  if (res?.landmarks?.length || !lastHand) lastHand = now;
  if (now - lastHand > 300000) { stopHandCam(); return; }
  const hs = res?.landmarks || [];
  const act = readHands(hs, dt, now);
  stat.frames++; if (hs.length) stat.handFrames++;
  if (act) { stat[act]++; if (stat.log.length < 300) stat.log.push(`${(now / 1000).toFixed(1)}${act[0]}`); }
  if (ov) {   // 鏡と同じく左右を返して、読めた手の骨組みを描く
    const g = ov.getContext('2d'); g.clearRect(0, 0, ov.width, ov.height); g.strokeStyle = act ? '#ffe08a' : '#7fd17f'; g.lineWidth = 2;
    for (const h of hs) for (let f = 0; f < 5; f++) { g.beginPath(); g.moveTo((1 - h[0].x) * ov.width, h[0].y * ov.height); for (let j = 1; j <= 4; j++) g.lineTo((1 - h[f * 4 + j].x) * ov.width, h[f * 4 + j].y * ov.height); g.stroke(); }
  }
  if (act && box) { box.style.borderColor = act === 'teppo' ? '#d9534f' : '#e8c36a'; setTimeout(() => { if (box) box.style.borderColor = '#b8963e'; }, 150); }
}

let lastHand = 0;
export function stopHandCam() {
  lastHand = 0;
  cancelAnimationFrame(raf); raf = 0;
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* 止まっている */ }
  stream = null; video = null; ov = null;
  if (box) box.remove(); box = null;
  if (window.__input) window.__input.guardHeld = false;
}
// 11/15 kaito「iMac でカメラが点いたままになっていた」：画面を離れた時（裏へ回す・閉じる）と、5分手が映らない時は自分で止める
document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stopHandCam(); });
addEventListener('pagehide', () => { if (stream) stopHandCam(); });

export async function startHandCam(say = () => {}) {
  if (raf) return true;
  if (!navigator.mediaDevices?.getUserMedia) { say('この端末ではカメラを使えません'); return false; }
  say('カメラと手の型を用意しています…');
  try {
    if (!lm) {
      const { HandLandmarker } = await import(BASE + 'vision_bundle.mjs');
      lm = await HandLandmarker.createFromOptions({ wasmLoaderPath: BASE + 'vision_wasm_internal.js', wasmBinaryPath: BASE + 'vision_wasm_internal.wasm' },
        { baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: PHONE ? 1 : 2 });
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
  } catch (e) { say(e && e.name === 'NotAllowedError' ? 'カメラの許しが要ります' : 'カメラか手の型を開けませんでした'); return false; }
  // 右下に小さな鏡（自分の手が映っているか分かる）と止める釦
  box = document.createElement('div');
  box.id = 'hand-cam';
  const W = PHONE ? 96 : 160;   // 携帯は下の真ん中に小さく（親指の棒と攻めの釦を隠さない）
  box.style.cssText = (PHONE ? 'left:50%;transform:translateX(-50%);bottom:6px;' : 'right:12px;bottom:12px;') + `position:fixed;z-index:9000;width:${W}px;border:2px solid #b8963e;border-radius:6px;overflow:hidden;background:#000`;
  video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  video.style.cssText = `display:block;width:${W}px;height:${W * 0.75}px;transform:scaleX(-1);object-fit:cover`;
  const off = document.createElement('button');
  off.type = 'button'; off.className = 'btn'; off.textContent = PHONE ? '止める' : 'カメラを止める';
  off.style.cssText = 'display:block;width:100%;min-height:44px;font-size:13px;border-radius:0';
  off.onclick = stopHandCam;
  ov = document.createElement('canvas'); ov.width = W; ov.height = Math.round(W * 0.75);
  ov.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${W * 0.75}px;pointer-events:none`;
  box.append(video, ov, off);
  window.__handcamStat = stat;
  document.body.appendChild(box);
  await video.play().catch(() => {});
  lastT = 0; raf = requestAnimationFrame(frame);
  say('カメラが点きました');
  return true;
}
