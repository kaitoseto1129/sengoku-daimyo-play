// 戦の肉声。日本語と確かめた声だけを鳴らす（10/23 に合成の台詞と日本語でない群声の録音は止めた）。
// ・名のある将の台詞（asset_lord.js）：ElevenLabs の日本語の声。戦では字幕を出さないので、声だけがその場で聞こえる（字は足さない）。
// ・鬨の声（asset_sfx.js の eiei）：同じ日本語の声を三十余人に重ねた「えい、えい、おう」。
// ・話し手の場所から聞こえる：遠いほど小さく、高い音を落とし、少し遅れて届く。左右も分ける。
// ・同時に鳴る声は二本、鬨は二本まで。音の箱と道筋は初めに作り、毎コマは作らない。
import { S } from './settings.js';
import { speaking } from './audio.js';

const STRIP = /[\s　、。，．…！!？?・「」『』（）()〜~―—-]/g;
const norm = (t) => String(t || '').replace(STRIP, '');
let vx = null;   // K635③ 兵の声の束（傷・死・掛け声。asset_voice_k635.js）
let lord = null, sfx = null, vv = null, loading = null, ctx = null, voiceBus = null, crowdBus = null, voiceSlots = null, crowdSlots = null, bankSlots = null;
const lordExact = new Map(), buffers = new Map();
const TOKI_BASE = 100000, VV_BASE = 200000, VX_BASE = 300000;
// 兵の短い声（VOICEVOX：玄野武宏・剣崎雌雄・雀松朱司・麒ヶ島宗麟。docs/CREDITS.md）。台詞の言葉から声を引く
const vvExact = new Map();
let vvLast = -99;
const SCREAM_RATE = [0.8, 0.88, 0.96];

export function loadWarSpeech() {
  if (lord || loading) return loading || Promise.resolve();
  // 将の声と兵の声は使い捨ての作業場所で解き、元の文（base64）を頁に残さない（WebKit は元の文と文字列を二重に持つ。約 10MB。11/10 支度中の落ち）
  const clips = (name) => import('./asset_reader.js').then(({ readAsset }) => readAsset(name, 'voice'));
  loading = Promise.all([clips('lord'), import('./asset_sfx.js'), clips('voice'), clips('voice_k635').catch(() => null)]).then(([l, x, v, k]) => {
    lord = l; sfx = x; vv = v; vx = k;
    if (vx) { vx.byKind = {}; for (const [, c, sp, kind] of vx.LINES) (vx.byKind[kind] ||= []).push({ c, sp }); }
    for (const [text, clip] of l.LINES) lordExact.set(norm(text), clip);
    // 台詞（種類 0・1）だけ。名乗りと群声の録音は使わない
    for (const [text, clip, , kind] of v.LINES) if (kind < 2) { const k = norm(text); if (!vvExact.has(k)) vvExact.set(k, []); vvExact.get(k).push(clip); }
    // 音の入れ物（AudioContext）は読み込みの間に作っておく。最初に触れた時に作ると、iPhone で一コマが約一秒止まった（実機 稲葉山 1076ms@1.1秒）。
    //   作るだけなら触れなくてよい（鳴らすのは触れた後の resume から）。
    audio();
  }).catch(() => { loading = null; });
  return loading;
}
// 戦の外では解いた声を捨てる（素材の文字は import の入れ物に残る）
export function releaseWarSpeech() { buffers.clear(); }

// 実機の12分の落ちの切り分け用：解いた声の数・元の大きさ・解いた後の大きさ（autoplay の毎秒の印に入る）
const VS = { dec: 0, inBytes: 0, pcm: 0, sec: 0 };
// 声の大きさ（音の釣り合いの確かめ用・呼ぶまで何も作らない）。dBFS の RMS
let vMeter = null;
export function voiceMeter() {
  if (!ctx || !voiceBus) return null;
  if (!vMeter) { vMeter = {}; for (const [k, n] of [['voice', voiceBus], ['crowd', crowdBus]]) { const a = ctx.createAnalyser(); a.fftSize = 2048; n.connect(a); vMeter[k] = [a, new Float32Array(2048)]; } }
  const o = {}; for (const k in vMeter) { const [a, b] = vMeter[k]; a.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; const r = Math.sqrt(s / b.length); o[k] = r > 1e-6 ? Math.round(200 * Math.log10(r)) / 10 : -120; }
  return o;
}
export function voiceStats() { return [VS.dec, VS.inBytes, VS.pcm, Math.round(VS.sec), ctx ? ctx.sampleRate : 0, buffers.size]; }
function audio() {
  if (ctx) return true;
  if (window.__apx?.noaudio || window.__apx?.novoice) return false;
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
    bankSlots = Array.from({ length: 2 }, () => slot(voiceBus, false));   // K635③ 兵の声の束（傷・死・掛け声）。将の台詞の口を取らず、曲や戦の音も下げない
    return true;
  } catch (_) { ctx = null; return false; }
}
// 声は鳴らす時に解く。解いた物は十二まで覚えて、古い物から捨てる
function buffer(i) {
  if (buffers.has(i)) { const p = buffers.get(i); buffers.delete(i); buffers.set(i, p); return p; }
  const clip = i >= VX_BASE ? vx.CLIPS[i - VX_BASE] : i >= VV_BASE ? vv.CLIPS[i - VV_BASE] : i >= TOKI_BASE ? sfx.SFX.eiei[i - TOKI_BASE] : lord.CLIPS[i];
  let bytes;
  // 解いた bytes は decodeAudioData が手放すので、写しを渡す
  if (clip instanceof Uint8Array) bytes = clip.slice();
  else { const bin = atob(clip); bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); }
  VS.dec++; VS.inBytes += bytes.length;
  const p = new Promise((ok0) => {
    const ok = (b) => { if (b) { VS.pcm += b.length * b.numberOfChannels * 4; VS.sec += b.duration; } ok0(b); };
    try { const r = ctx.decodeAudioData(bytes.buffer, ok, () => ok(null)); if (r && r.catch) r.catch(() => ok(null)); } catch (_) { ok(null); }
  });
  buffers.set(i, p);
  while (buffers.size > 12) buffers.delete(buffers.keys().next().value);
  return p;
}

export function createWarSpeech(rt) {
  // 合成音だけの戦では素材の読込・解凍も、録音用の時計も作らない。
  if (rt.def.syntheticVoices) return {
    ready: false, at() {}, canName() { return false; }, line() { return false; },
    bark() {}, crowd() {}, dispose() {},
  };
  let disposed = false;
  const crowdT = {}, killT = {};
  void loadWarSpeech();
  const on = () => S.battleVoice !== 'off';
  function allowed() { return !disposed && on() && !document.hidden && !rt.game.paused && !rt.game.photo && !rt.def.town && !rt.def.dojo; }
  function sync() {
    if (!ctx) return;
    voiceBus.gain.setTargetAtTime(allowed() ? 1.2 * S.volume * S.volVoice : 0, ctx.currentTime, 0.05);   // 音の釣り合い（11/17）：声が曲の上に約4dBしか出ず埋もれがちだったので 0.9→1.2（＋2.5dB）。声の圧縮器（-16dB）が上を抑える
    crowdBus.gain.setTargetAtTime(allowed() ? 0.55 * S.volume * S.volVoice : 0, ctx.currentTime, 0.05);
  }
  function unlock() {
    if (!allowed() || !audio()) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});   // iOS は電話・裏から戻ると interrupted（11/18 iPhone の箱の点検）
    sync();
  }
  for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(t, unlock);   // iOS は指を離した時に音を許す（11/18）
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
    // K635③（要件書「号令は距離で：近い＝言葉・中＝声だけ・遠い＝怒号だけ」）：将の台詞は遠くても聞かせるが、本当の距離で段を付ける。
    //   25m までは言葉のまま、70m までは高い音を落として声だけ、それより遠くはさらにこもらせ小さく
    const realD = r.d, cut = near && realD > 25 ? (realD > 70 ? 1000 : 2000) : 99999, far = near && realD > 25 ? (realD > 70 ? 0.6 : 0.85) : 1;
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
    slot.gain.gain.setValueAtTime(Math.min(1.4, vol) * far / (1 + (r.d / 22) ** 1.3), t);
    slot.filter.frequency.setValueAtTime(Math.min(cut, Math.max(450, 9000 / (1 + r.d / 28))), t);
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
  // K635③ 声の束から一つ：同じ録音は again 秒あけ、その種類の声は gap 秒あける（直前と同じ話し手も避ける）
  function bank(kind, pos, vol, again, key, gap = 1.2) {
    const list = vx?.byKind?.[kind]; if (!list) return false;
    const now = rt.t || 0;
    if ((killT[key] ?? -99) + gap > now) return false;
    const ok = list.filter((x) => ((killT['x' + x.c]) ?? -99) + again <= now && x.sp !== killT[key + 'Sp']);
    if (!ok.length) return false;
    const x = ok[Math.floor(Math.random() * ok.length)];
    killT[key] = now; killT['x' + x.c] = now; killT[key + 'Sp'] = x.sp;
    void play(bankSlots, VX_BASE + x.c, pos, vol, 0.97 + Math.random() * 0.06);
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
      if (rt.def.syntheticBattleSound || rt.over || !lord || !ctx) return false;
      const clip = lordExact.get(norm(text));
      if (clip == null) return false;
      // 同じ台詞が重ねて呼ばれても二度鳴らさない（二本の声がずれて重なると、こだまに聞こえる）
      const now = ctx.currentTime;
      for (const s of voiceSlots) if (s.clip === clip && s.until > now - 1.5) return true;
      void play(voiceSlots, clip, whereFrom(speaker, unit), 1.15, 1, 18);
      return true;
    },
    // 兵の短い声の札（「味方の足軽「押せ！」」）。同じ声の言葉が有れば、8 秒に一度まで鳴らす
    bark(text) {
      if (rt.over || !vv || !ctx) return;
      const m = /^(.*?)「(.+)」$/.exec(String(text || ''));
      const list = vvExact.get(norm(m ? m[2] : text));
      const now = rt.t || 0;
      if (!list || vvLast + 8 > now) return;
      vvLast = now;
      void play(voiceSlots, VV_BASE + list[Math.floor(Math.random() * list.length)], whereFrom(), 0.9, 1, 14);
    },
    // 倒した瞬間の声。named：自分の「討ち取ったり！」（三人の声から一つ）／foot：倒れる側の短い悲鳴（同じ録音の高さを変えて四種）
    kill(kind, pos) {
      if (rt.over || !vv || !ctx) return false;
      const now = rt.t || 0;
      if (kind === 'named') {
        const list = vvExact.get(norm('討ち取ったり！'));
        if (!list) return false;
        killT.named = now;
        void play(voiceSlots, VV_BASE + list[Math.floor(Math.random() * list.length)], rt.player?.u.pos, 1.2, 0.95 + Math.random() * 0.1, 10);
        return true;
      }
      // 倒れる側の「ぐあっ」は「うわ」と聞こえる今の言葉の叫び（kaito 11/6 BZ）。鳴らさない
      const list = null;
      if (!list || (killT.foot ?? -99) + 0.45 > now || (killT.named ?? -99) + 1.6 > now) return false;
      killT.foot = now;
      killT.pitch = ((killT.pitch ?? -1) + 1 + Math.floor(Math.random() * 3)) % SCREAM_RATE.length;
      void play(voiceSlots, VV_BASE + list[0], pos, 0.8, SCREAM_RATE[killT.pitch]);
      return true;
    },
    // K635③（音の要件書 死の声）：倒れる者の声。army_combat が割合（無言・息・声）を決め、声の時だけここへ来る。
    //   k：1＝短い声・2＝大きい声・3＝長い声。同じ録音は25秒、どの死の声も1.2秒あける（あけられない時は無言）。「ぐあっ」は kaito 11/6 に止めたので使わない
    die(pos, k = 1) {
      if (rt.over || !vv || !ctx) return false;
      const now = rt.t || 0;
      if ((killT.die ?? -99) + 1.2 > now || (killT.named ?? -99) + 1.6 > now) return false;
      // 短い声（k＝1）は声の束の死の短い声（十一の声）から。同じ声は25秒あける
      if (k === 1 && vx) { if (bank(5, pos, 0.7, 25, 'die')) return true; }
      const want = k >= 3 ? ['母上……', '殿、お先に…', '組頭、お先に…', 'む、無念…'] : ['やられた…！', 'む、無念…'];
      const pick = [];
      for (const t of want) for (const c of vvExact.get(norm(t)) || []) if (((killT['c' + c]) ?? -99) + 25 <= now) pick.push(c);
      if (!pick.length) return false;
      const c = pick[Math.floor(Math.random() * pick.length)];
      killT.die = now; killT['c' + c] = now;
      void play(bankSlots, VV_BASE + c, pos, k >= 2 ? 1 : 0.7, 0.94 + Math.random() * 0.1);
      return true;
    },
    // K635③ 兵の傷の声（kind 4）・掛け声（kind 6）。鳴らせば true（無ければ呼んだ側が息で鳴らす）
    hurt(pos) { return !rt.over && !!vx && !!ctx && bank(4, pos, 0.75, 20, 'hurt', 0.8); },
    kiai(pos) { return !rt.over && !!vx && !!ctx && bank(6, pos, 0.6, 20, 'kiai', 0.7); },
    // 鬨の声（大将の「えい、えい」に皆の「おう」）。鳴らせば true
    crowd(name, pos, vol = 1) {
      if (rt.def.syntheticCrowd) return false;
      if ((name !== 'toki' && name !== 'eiei') || !this.hasToki || !ctx || rt.over) return false;
      const now = rt.t || 0;
      // 鬨が鳴っている間に来た鬨は、合成や別の録音で重ねない（ずれた二つ目の鬨がこだまに聞こえる）
      // K635③（音の要件書「ワー！を鳴らし続けない」）：大勢の鬨は12秒に一度まで（前は4.5秒ごとに繰り返し、ずっと叫んで聞こえた）
      if ((crowdT.toki ?? -99) + (name === 'eiei' ? 2 : 12) > now) return true;
      crowdT.toki = now;
      void play(crowdSlots, TOKI_BASE + Math.floor(Math.random() * sfx.SFX.eiei.length), pos, vol * 1.25, 0.97 + Math.random() * 0.06);
      return true;
    },
    dispose() {
      disposed = true; clearInterval(timer);
      buffers.clear();   // 戦が終わったら解いた声を手放す（iOS は解いた音を長く抱える）
      for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.removeEventListener(t, unlock);
      if (ctx) for (const s of [...voiceSlots, ...crowdSlots, ...bankSlots]) { if (s.source) { try { s.source.stop(); } catch (_) { /* もう止まっている */ } s.source = null; } s.until = 0; }
      if (ctx) { voiceBus.gain.value = 0; crowdBus.gain.value = 0; }
    },
  };
}
