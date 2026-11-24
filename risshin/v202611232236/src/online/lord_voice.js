// K602（kaito 11/21）：大名本人の声。オンラインの試合（稽古場の形を借りるので war_speech の声は鳴らない＝rt.def.dojo）で、
//   開戦と、本人が命令の輪で下知を出した時に、大名の短い号令を鳴らす（字は出さない・Simple）。
//   大名ごとの録音は無いので、将の声（asset_lord.js・ElevenLabs の日本語の声・docs/CREDITS.md）から言葉の合う号令を選び、
//   大名ごとに高さと速さ（playbackRate）を変えて当てる。信長は信長の録音そのまま。使う録音だけを残し、ほかの声は持たない（携帯の記憶）
import { S } from '../settings.js';

// [録音の番号, 高さと速さ]。番号は asset_lord.js の LINES の二つ目（tools/sfx_bake.mjs が作る）
//   1「すわ、かかれ、かかれ！」（信長）・35「押せ！ここで退けば終わりぞ！」（信長）・41「腰を据えろ！　押し切るぞ！」・42「踏み込め！　わしに続け！」
//   44「よし、わしの槍に続け！」・45「突出するな！味方と並べ！」・51「右へ回れ！横から崩せ！」・32「怯むな！　旗の下に集まれ！」
export const LORD_CALL = {
  織田信長: { start: [1, 1.0], cmd: [[1, 1.0], [35, 1.0]] },        // 攻め・鉄砲の大名：鋭く速い
  武田信玄: { start: [41, 0.84], cmd: [[41, 0.84], [32, 0.86]] },    // 重く低く・ゆっくり（動かざること山の如し）
  上杉謙信: { start: [42, 0.93], cmd: [[42, 0.93], [44, 0.94]] },    // 自ら先頭に立つ
  徳川家康: { start: [45, 0.9], cmd: [[45, 0.9], [32, 0.9]] },       // 守り・列を崩さない
  毛利元就: { start: [51, 0.95], cmd: [[51, 0.95], [45, 0.96]] },    // 横から崩す・謀
  島津義久: { start: [44, 0.88], cmd: [[44, 0.88], [42, 0.9]] },     // 低く太い・突き掛かる
};
const GAP = 6;   // 同じ大名の号令は六秒に一度まで

let ctx = null, clips = null, loading = null;
const bufs = new Map();
function audio() {
  if (ctx) return ctx;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); } catch (e) { ctx = null; }
  if (ctx && typeof document !== 'undefined') {
    const wake = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
    for (const k of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(k, wake, { passive: true });
  }
  return ctx;
}
// 大名の録音だけを解いて持つ（asset_lord は一度読んで要る番号の bytes だけ残す）
export function loadLordVoice(name) {
  const C = LORD_CALL[name]; if (!C || typeof window === 'undefined' || window.__apx?.noaudio || /[?&](norender|bot)\b/.test(location.search)) return Promise.resolve(false);
  if (loading) return loading;
  const want = new Set([C.start[0], ...C.cmd.map((x) => x[0])]);
  loading = import('../asset_reader.js').then(({ readAsset }) => readAsset('lord', 'voice')).then((L) => {
    clips = new Map(); for (const i of want) if (L.CLIPS[i] != null) clips.set(i, L.CLIPS[i]);
    audio(); return true;
  }).catch(() => { loading = null; return false; });
  return loading;
}
function buffer(i) {
  if (bufs.has(i)) return bufs.get(i);
  const clip = clips?.get(i), c = audio(); if (clip == null || !c) return Promise.resolve(null);
  let bytes;
  if (clip instanceof Uint8Array) bytes = clip.slice();
  else { const bin = atob(clip); bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); }
  const p = new Promise((ok) => { try { const r = c.decodeAudioData(bytes.buffer, ok, () => ok(null)); if (r && r.catch) r.catch(() => ok(null)); } catch (e) { ok(null); } });
  bufs.set(i, p); return p;
}
let lastT = -99, nCmd = 0;
// kind：'start'（開戦）か 'cmd'（命令）。rt.t で間を見る
export function lordCall(rt, name, kind = 'cmd') {
  const C = LORD_CALL[name]; if (!C || !clips || S.battleVoice === 'off' || rt?.over || rt?.game?.paused) return false;
  const t = rt?.t ?? 0; if (t - lastT < GAP) return false;
  const [i, rate] = kind === 'start' ? C.start : C.cmd[nCmd++ % C.cmd.length];
  lastT = t;
  void buffer(i).then((b) => {
    const c = audio(); if (!b || !c || c.state === 'closed') return;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = b; src.playbackRate.value = rate;
    g.gain.value = 1.1 * (S.volume ?? 0.8) * (S.volVoice ?? 1);
    src.connect(g); g.connect(c.destination);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    try { src.start(); } catch (e) { /* 鳴らせなくても試合は進む */ }
  });
  window.__lordCalls = (window.__lordCalls || 0) + 1;
  return true;
}
// 試合が終われば解いた声を捨てる
export function releaseLordVoice() { bufs.clear(); clips = null; loading = null; lastT = -99; nCmd = 0; }
