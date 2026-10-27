// 戦の肉声。日本語と確かめた声だけを鳴らす（10/23 に合成の台詞と日本語でない群声の録音は止めた）。
// ・名のある将の台詞（asset_lord.js）：ElevenLabs の日本語の声。戦では字幕を出さないので、声だけがその場で聞こえる（字は足さない）。
// ・鬨の声（asset_sfx.js の eiei）：同じ日本語の声を三十余人に重ねた「えい、えい、おう」。
// ・話し手の場所から聞こえる：遠いほど小さく、高い音を落とし、少し遅れて届く。左右も分ける。
// ・同時に鳴る声は二本、鬨は二本まで。音の箱と道筋は初めに作り、毎コマは作らない。
import { S } from './settings.js';
import { speaking } from './audio.js';

const STRIP = /[\s　、。，．…！!？?・「」『』（）()〜~―—-]/g;
const norm = (t) => String(t || '').replace(STRIP, '');
let lord = null, sfx = null, loading = null, ctx = null, voiceBus = null, crowdBus = null, voiceSlots = null, crowdSlots = null;
const lordExact = new Map(), buffers = new Map();
const TOKI_BASE = 100000;

export function loadWarSpeech() {
  if (lord || loading) return loading || Promise.resolve();
  loading = Promise.all([import('./asset_lord.js'), import('./asset_sfx.js')]).then(([l, x]) => {
    lord = l; sfx = x;
    for (const [text, clip] of l.LINES) lordExact.set(norm(text), clip);
  }).catch(() => { loading = null; });
  return loading;
}
// 戦の外では解いた声を捨てる（素材の文字は import の入れ物に残る）
export function releaseWarSpeech() { buffers.clear(); }

function audio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    voiceBus = ctx.createGain(); crowdBus = ctx.createGain();
    voiceBus.gain.value = 0; crowdBus.gain.value = 0;
    voiceBus.connect(comp); crowdBus.connect(comp);
    // 野外の声は乾いている（10/27 tarapon「エコーが効きすぎ」）。近い声は響かせず、遠い鬨だけ短い野の返りを少し足す
    const air = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 0.45), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.exp(-t * 11) * Math.min(1, t / 0.02); } }
    air.buffer = ir; air.connect(crowdBus);
    const slot = (bus, far) => {
      const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
      filter.type = 'lowpass'; filter.Q.value = 0.5;
      gain.connect(filter); filter.connect(pan); pan.connect(bus);
      let send = null;
      if (far) { send = ctx.createGain(); send.gain.value = 0; pan.connect(send); send.connect(air); }
      return { gain, filter, pan, send, source: null, until: 0, dist: 0, clip: -1 };
    };
    voiceSlots = Array.from({ length: 2 }, () => slot(voiceBus, false));
    crowdSlots = Array.from({ length: 2 }, () => slot(crowdBus, true));
    return true;
  } catch (_) { ctx = null; return false; }
}
// 声は鳴らす時に解く。解いた物は二十四まで覚えて、古い物から捨てる
function buffer(i) {
  if (buffers.has(i)) { const p = buffers.get(i); buffers.delete(i); buffers.set(i, p); return p; }
  const b64 = i >= TOKI_BASE ? sfx.SFX.eiei[i - TOKI_BASE] : lord.CLIPS[i];
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  const p = new Promise((ok) => {
    try { const r = ctx.decodeAudioData(bytes.buffer, ok, () => ok(null)); if (r && r.catch) r.catch(() => ok(null)); } catch (_) { ok(null); }
  });
  buffers.set(i, p);
  while (buffers.size > 24) buffers.delete(buffers.keys().next().value);
  return p;
}

export function createWarSpeech(rt) {
  let disposed = false;
  const crowdT = {};
  void loadWarSpeech();
  const on = () => S.battleVoice !== 'off';
  function allowed() { return !disposed && on() && !document.hidden && !rt.game.paused && !rt.game.photo && !rt.def.town && !rt.def.dojo; }
  function sync() {
    if (!ctx) return;
    voiceBus.gain.setTargetAtTime(allowed() ? 0.9 * S.volume * S.volVoice : 0, ctx.currentTime, 0.05);
    crowdBus.gain.setTargetAtTime(allowed() ? 0.55 * S.volume * S.volVoice : 0, ctx.currentTime, 0.05);
  }
  function unlock() {
    if (!allowed() || !audio()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    sync();
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  const timer = setInterval(sync, 150);

  // pos から聞く人（カメラ）までの道筋。遠いほど小さく・こもり・遅れる
  function route(pos) {
    const c = rt.camera?.position, at = pos || rt.player?.u.pos;
    if (!c || !at) return null;
    const dx = at.x - c.x, dz = at.z - c.z, d = Math.hypot(dx, dz);
    const m = rt.camera.matrixWorld.elements, rl = Math.hypot(m[0], m[2]) || 1;
    return { d, pan: d < 1 ? 0 : Math.max(-0.85, Math.min(0.85, (dx * m[0] + dz * m[2]) / rl / d)) };
  }
  // near（m）：将の台詞はその場の声なので、遠くても near の所の大きさ・こもりで聞かせる
  async function play(slots, clip, pos, vol, rate = 1, near = 0) {
    if (!allowed() || !ctx || ctx.state !== 'running' || S.volume <= 0) return false;
    const r = route(pos);
    if (!r || r.d > 160) return false;
    if (near && r.d > near) r.d = near;
    const now = ctx.currentTime;
    let slot = null;
    for (const s of slots) if (s.until <= now) { slot = s; break; }
    if (!slot) { for (const s of slots) if (s.dist > r.d + 10 && (!slot || s.dist > slot.dist)) slot = s; if (!slot) return false; }
    slot.until = now + 0.6; slot.dist = r.d; slot.clip = clip;
    const buf = await buffer(clip);
    if (!buf || !allowed() || ctx.currentTime - now > 0.8) { slot.until = 0; return false; }
    if (slot.source) { try { slot.source.stop(); } catch (_) { /* もう止まっている */ } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const t = ctx.currentTime + r.d / 340;
    slot.gain.gain.setValueAtTime(Math.min(1.4, vol) / (1 + (r.d / 22) ** 1.3), t);
    slot.filter.frequency.setValueAtTime(Math.max(450, 9000 / (1 + r.d / 28)), t);
    slot.pan.pan.setValueAtTime(r.pan, t);
    // 30m より遠い鬨だけ、少し野に返る（近い声は乾いたまま）
    if (slot.send) slot.send.gain.setValueAtTime(r.d < 30 ? 0 : Math.min(0.16, (r.d - 30) / 400), t);
    src.connect(slot.gain);
    slot.source = src;
    slot.until = t + buf.duration / rate + 0.05;
    src.onended = () => { src.disconnect(); if (slot.source === src) slot.source = null; };
    src.start(t);
    // 将の声の間は、戦の音と曲を下げて言葉を聞かせる（字幕が無いので声が埋もれないように）
    if (slots === voiceSlots) speaking(buf.duration / rate + r.d / 340);
    return true;
  }
  // 話し手のいる所：名の一致する生きた者、無ければ自分のそば
  function whereFrom(speaker, unit) {
    if (unit?.pos) return unit.pos;
    if (speaker) for (const u of rt.army.units) if (u.alive && u.name && (u.name === speaker || u.name.endsWith(speaker))) return u.pos;
    return rt.player?.u.pos || null;
  }
  return {
    get ready() { return !!lord; },
    get hasToki() { return !!(sfx && sfx.SFX.eiei && sfx.SFX.eiei.length); },
    at() {},
    canName() { return false; },
    // 名のある将の台詞。その将の声が有れば鳴らして true
    line(speaker, text, unit) {
      if (rt.over || !lord || !ctx) return false;
      const clip = lordExact.get(norm(text));
      if (clip == null) return false;
      // 同じ台詞が重ねて呼ばれても二度鳴らさない（二本の声がずれて重なると、こだまに聞こえる）
      const now = ctx.currentTime;
      for (const s of voiceSlots) if (s.clip === clip && s.until > now - 1.5) return true;
      void play(voiceSlots, clip, whereFrom(speaker, unit), 1.15, 1, 18);
      return true;
    },
    bark() {},
    // 鬨の声（大将の「えい、えい」に皆の「おう」）。鳴らせば true
    crowd(name, pos, vol = 1) {
      if ((name !== 'toki' && name !== 'eiei') || !this.hasToki || !ctx || rt.over) return false;
      const now = rt.t || 0;
      // 鬨が鳴っている間に来た鬨は、合成や別の録音で重ねない（ずれた二つ目の鬨がこだまに聞こえる）
      if ((crowdT.toki ?? -99) + (name === 'eiei' ? 2 : 4.5) > now) return true;
      crowdT.toki = now;
      void play(crowdSlots, TOKI_BASE + Math.floor(Math.random() * sfx.SFX.eiei.length), pos, vol * 1.25, 0.97 + Math.random() * 0.06);
      return true;
    },
    dispose() {
      disposed = true; clearInterval(timer);
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      if (ctx) for (const s of [...voiceSlots, ...crowdSlots]) { if (s.source) { try { s.source.stop(); } catch (_) { /* もう止まっている */ } s.source = null; } s.until = 0; }
      if (ctx) { voiceBus.gain.value = 0; crowdBus.gain.value = 0; }
    },
  };
}
