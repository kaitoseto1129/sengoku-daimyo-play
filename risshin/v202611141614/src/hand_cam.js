// カメラで手と腕を読んで遊ぶ（K255・kaito 11/11「カメラで手と腕を読み、腕を振ると刀・両手で槍・片手で鉄砲」）。パソコンの Web 版だけ。
//   設定の「カメラの手で遊ぶ」から始める。手の骨組みは MediaPipe の手の型（Apache-2.0・prototype/web_only/hands。読み込み時に外へ取りに行かない）。
//   片手を速く振る＝斬る ／ 両手をそろえて前へ突き出す＝槍の突き ／ 片手を前に伸ばして止める＝鉄砲なら撃つ・それ以外は構え
//   入れる先は携帯の刀（phone_sword.js）と同じ：input.leftPressed（斬る・突く・撃つ）と input.guardHeld（構え）。
const BASE = new URL('../web_only/hands/', import.meta.url).href;
let lm = null, video = null, stream = null, box = null, raf = 0, lastT = 0;
const prev = [];               // 手ごとの前の手首・掌の大きさ
let cdT = 0, stillT = 0, firedStill = false;

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const weapon = () => window.__game?.battle?.player?.weapon || '';

// 一コマの手の骨組みから技を決める（外から試せるように分けた）。hands：[[21点{x,y,z}]...]、dt 秒、now ミリ秒
export function readHands(hands, dt, now, input = window.__input, wpn = weapon()) {
  if (!input) return null;
  const cur = hands.map((h) => ({ w: h[0], s: d2(h[0], h[9]), tip: d2(h[0], h[8]) }));
  let act = null;
  if (prev.length !== cur.length) prev.length = 0;   // 手の数が替わった一コマは速さを見ない（取り違えで斬らない）
  const sp = cur.map((c, i) => (prev[i] ? d2(c.w, prev[i].w) / Math.max(0.016, dt) : 0));
  const grow = cur.map((c, i) => (prev[i] ? (c.s - prev[i].s) / Math.max(0.016, dt) / Math.max(0.02, prev[i].s) : 0));
  if (now > cdT) {
    if (cur.length === 2 && d2(cur[0].w, cur[1].w) < 0.3 && grow[0] > 1.6 && grow[1] > 1.6) act = 'yari';        // 両手で前へ（手が急に大きくなる）
    else if (cur.length >= 1 && Math.max(...sp) > 2.2) act = 'kiru';                                              // 片手を速く振る
    if (act) { input.leftPressed = true; cdT = now + (act === 'yari' ? 450 : 350); stillT = 0; firedStill = false; }
  }
  // 片手を前に伸ばして止める：掌が大きく（前へ伸ばした）、手首がほとんど動かない
  const still = cur.length === 1 && sp[0] < 0.35 && cur[0].s > 0.16 && cur[0].tip > cur[0].s * 1.6;
  stillT = still ? stillT + dt : 0;
  if (wpn === 'gun') {
    input.guardHeld = false;
    if (stillT > 0.5 && !firedStill) { input.leftPressed = true; firedStill = true; act = 'teppo'; }
    if (!still) firedStill = false;
  } else input.guardHeld = stillT > 0.3;
  prev.length = 0; prev.push(...cur);
  return act;
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (!lm || !video || video.readyState < 2) return;
  const now = performance.now();
  if (now - lastT < 33) return;            // 30 回/秒で足りる
  const dt = lastT ? (now - lastT) / 1000 : 0.033;
  lastT = now;
  let res = null;
  try { res = lm.detectForVideo(video, now); } catch (e) { return; }
  const act = readHands(res?.landmarks || [], dt, now);
  if (act && box) { box.style.borderColor = act === 'teppo' ? '#d9534f' : '#e8c36a'; setTimeout(() => { if (box) box.style.borderColor = '#b8963e'; }, 150); }
}

export function stopHandCam() {
  cancelAnimationFrame(raf); raf = 0;
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* 止まっている */ }
  stream = null; video = null;
  if (box) box.remove(); box = null;
  if (window.__input) window.__input.guardHeld = false;
}

export async function startHandCam(say = () => {}) {
  if (raf) return true;
  if (!navigator.mediaDevices?.getUserMedia) { say('この端末ではカメラを使えません'); return false; }
  say('カメラと手の型を用意しています…');
  try {
    if (!lm) {
      const { HandLandmarker } = await import(BASE + 'vision_bundle.mjs');
      lm = await HandLandmarker.createFromOptions({ wasmLoaderPath: BASE + 'vision_wasm_internal.js', wasmBinaryPath: BASE + 'vision_wasm_internal.wasm' },
        { baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 });
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
  } catch (e) { say(e && e.name === 'NotAllowedError' ? 'カメラの許しが要ります' : 'カメラか手の型を開けませんでした'); return false; }
  // 右下に小さな鏡（自分の手が映っているか分かる）と止める釦
  box = document.createElement('div');
  box.id = 'hand-cam';
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9000;width:160px;border:2px solid #b8963e;border-radius:6px;overflow:hidden;background:#000';
  video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  video.style.cssText = 'display:block;width:160px;height:120px;transform:scaleX(-1);object-fit:cover';
  const off = document.createElement('button');
  off.type = 'button'; off.className = 'btn'; off.textContent = 'カメラを止める';
  off.style.cssText = 'display:block;width:100%;min-height:44px;font-size:13px;border-radius:0';
  off.onclick = stopHandCam;
  box.append(video, off);
  document.body.appendChild(box);
  await video.play().catch(() => {});
  lastT = 0; raf = requestAnimationFrame(frame);
  say('手が映りました。振ると斬る・両手で突く・片手を伸ばして止める');
  return true;
}
