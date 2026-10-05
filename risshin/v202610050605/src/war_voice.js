// 戦の肉声。外の音源は使わず、声帯・息・三つの母音帯を重ねて焼く。
// 焼いた群声を使い回し、実際に鳴らす音源は六つまで（下知の席を一つ残す）。
import { S } from './settings.js';
import { WIND_STATE } from './world.js';
import { createSoundPath, sampleSoundPath } from './audio_path.js';
const VOWELS = { a: [780, 1180, 2600], e: [480, 1850, 2600], i: [280, 2200, 3000], o: [500, 850, 2500], u: [330, 700, 2300] };
const CALLS = {
  toki: [['e', .27], ['i', .11], [null, .22], ['e', .27], ['i', .11], [null, .24], ['o', .46], ['u', .37]],
  charge: [['o', .22], ['a', .48], ['a', .42]],
  clash: [['e', .13], ['i', .12], [null, .06], ['a', .22]],
  fall: [['a', .25], ['a', .37], ['o', .24], ['u', .26]],
  command: [['a', .18], ['a', .16], [null, .08], ['e', .24], ['i', .17]],
  nanori: [['a', .18], ['e', .16], [null, .1], ['a', .18], ['i', .16], [null, .12], ['a', .25], ['i', .3]],
  utchi: [['u', .15], ['i', .12], ['o', .15], ['a', .17], ['a', .18], ['i', .32]],
  help: [['a', .18], ['u', .14], ['e', .2], ['o', .26], [null, .1], ['o', .3]],
};
const KINDS = { toki: 'toki', eiei: 'toki', shout: 'charge', eshout: 'clash', cry: 'fall', umeki: 'fall' };
const cache = new Map();
let ctx = null, master = null, slots = null;
function audio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return false;
    ctx = new AC(); master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 5;
    master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    slots = Array.from({ length: 6 }, () => {
      const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
      filter.type = 'lowpass'; filter.Q.value = .45;
      gain.connect(filter); filter.connect(pan); pan.connect(master);
      // 六席のこだまの出口も初めに作り、鳴るたびには作らない。
      const echo = ctx.createDelay(4), echoFilter = ctx.createBiquadFilter(), echoGain = ctx.createGain();
      echoFilter.type = 'lowpass'; echoFilter.frequency.value = 800; echoGain.gain.value = 0;
      filter.connect(echo); echo.connect(echoFilter); echoFilter.connect(echoGain); echoGain.connect(pan);
      return { gain, filter, pan, echo, echoFilter, echoGain, source: null, until: 0 };
    });
    return true;
  } catch (_) { if (ctx) ctx.close().catch(() => {}); ctx = null; return false; }
}
async function bake(kind, count) {
  const key = kind + count;
  if (cache.has(key)) return cache.get(key);
  const promise = (async () => {
    const syllables = CALLS[kind], dur = syllables.reduce((n, s) => n + s[1], 0) + .42;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(2, Math.ceil(dur * 16000), 16000);
    const breath = off.createBuffer(1, 16000, 16000), data = breath.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    for (let v = 0; v < count; v++) {
      const start = v === 0 ? .01 : .025 + Math.random() * .18;
      const pitch = (kind === 'command' ? 112 : kind === 'fall' ? 180 : 135) * (.78 + Math.random() * .48);
      const osc = off.createOscillator(), air = off.createBufferSource(), airGain = off.createGain();
      osc.type = 'sawtooth'; osc.detune.value = (Math.random() - .5) * 35;
      air.buffer = breath; air.loop = true; airGain.gain.value = kind === 'fall' ? .28 : .15;
      air.connect(airGain);
      const envelope = off.createGain(), pan = off.createStereoPanner();
      pan.pan.value = count === 1 ? 0 : (v / (count - 1) - .5) * 1.3;
      envelope.connect(pan); pan.connect(off.destination);
      envelope.gain.value = 0;
      const bands = [];
      for (let b = 0; b < 3; b++) {
        const band = off.createBiquadFilter(), gain = off.createGain();
        band.type = 'bandpass'; band.Q.value = 5 + b * 2;
        gain.gain.value = b === 0 ? 1 : b === 1 ? .7 : .35;
        osc.connect(band); airGain.connect(band); band.connect(gain); gain.connect(envelope); bands.push(band);
      }
      let t = start;
      const shift = .9 + Math.random() * .2, stretch = .94 + Math.random() * .1;
      for (let s = 0; s < syllables.length; s++) {
        const vowel = syllables[s][0], len = syllables[s][1] * stretch;
        if (vowel) {
          for (let b = 0; b < 3; b++) bands[b].frequency.setTargetAtTime(VOWELS[vowel][b] * shift, t, .025);
          osc.frequency.setValueAtTime(pitch * (1.06 + Math.random() * .08), t);
          osc.frequency.exponentialRampToValueAtTime(pitch * (kind === 'fall' ? .62 : .93), t + len);
          const level = .19 / Math.sqrt(count) * (kind === 'fall' ? 1 - s * .15 : 1);
          envelope.gain.setValueAtTime(0, t);
          envelope.gain.linearRampToValueAtTime(level, t + .025);
          // 息が震える細かな起伏。声ごとに位相・時刻・声の高さが異なる。
          for (let j = 1; j * .055 < len - .03; j++) envelope.gain.linearRampToValueAtTime(level * (.72 + Math.random() * .28), t + j * .055);
          envelope.gain.linearRampToValueAtTime(0, t + len);
        }
        t += len;
      }
      osc.start(start); air.start(start); osc.stop(t + .01); air.stop(t + .01);
    }
    return off.startRendering();
  })();
  cache.set(key, promise);
  try { return await promise; } catch (_) { cache.delete(key); return null; }
}

// 宣伝でも同じ名乗り・鬨の肉声を使う。実時間の六席は動かさない。
export const renderPromoVoice = (kind, count = 1) => bake(kind, count);

export function createWarVoices(rt) {
  let disposed = false, gate = 0, commandGate = 0, pending = 0;
  const path = createSoundPath();
  function allowed() { return !disposed && !document.hidden && document.hasFocus() && !rt.game.paused && !rt.game.photo; }
  function sync() {
    if (master) master.gain.setTargetAtTime(allowed() ? .7 * S.volume * S.volSfx : 0, ctx.currentTime, .04);
  }
  function unlock() {
    if (!allowed() || !audio()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    sync();
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('blur', sync); window.addEventListener('focus', sync);
  // 音量変更・一時停止は描画と独立して追う。毎コマ音源や配列を作らない。
  const timer = setInterval(sync, 120);
  async function playKind(kind, pos, vol, command = false) {
    if (!allowed() || S.volume <= 0 || S.volSfx <= 0 || !audio()) return;
    // 合成の依頼も間引く。下知は群声の混雑とは別の席を使う。
    const now = ctx.currentTime;
    if (now < (command ? commandGate : gate) || pending >= 2) return;
    if (command) commandGate = now + 4; else gate = now + (kind === 'toki' ? 1.8 : .22);
    if (ctx.state !== 'running') return; // 最初の指・キー操作でだけ音を開く
    const at = pos || rt.player?.u.pos;
    if (!at || !rt.camera) return;
    const c = rt.camera.position, dx = at.x - c.x, dz = at.z - c.z, distance = Math.hypot(dx, dz);
    if (distance > (command ? 240 : 300)) return;
    let n = 0;
    // 周囲の生きた兵だけを数える。大軍でも追加の兵や配列は作らない。
    if (kind !== 'fall' && !command) for (const u of rt.army.units) {
      if (u.alive && !u.isStruct && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 24) n++;
    }
    const nearby = n / (1 + distance / 120);
    const count = kind === 'fall' || command ? 1 : nearby < 5 ? 1 : nearby < 20 ? 4 : 8;
    const pan = ((dx * -Math.cos(rt.player.yaw) + dz * Math.sin(rt.player.yaw)) / (distance || 1)) * .75;
    sampleSoundPath(rt.world, at, c, WIND_STATE, path, distance);
    // 焼いている間に別の声が来ても、その声の道筋は変えない。
    const delay = path.delay, pathGain = path.gain, cutoff = path.cutoff;
    const echoDelay = path.echoDelay, echoGain = path.echoGain;
    pending++;
    const buffer = await bake(kind, count);
    pending--;
    if (!buffer || !allowed() || ctx.currentTime - now > 1.2) return;
    sync();
    let slot = command ? slots[5] : null;
    if (!command) for (let i = 0; i < 5; i++) if (slots[i].until <= ctx.currentTime) { slot = slots[i]; break; }
    if (!slot || slot.until > ctx.currentTime) return;
    const t = Math.max(ctx.currentTime, now + delay);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    src.playbackRate.value = .94 + Math.random() * .12;
    slot.gain.gain.value = Math.min(1.5, Math.max(0, vol)) * (1 + Math.log2(count) * .16) / (1 + (distance / (command ? 60 : 40)) ** 1.4) * pathGain;
    slot.filter.frequency.value = Math.max(220, Math.min(cutoff, 6500 / (1 + distance / 45)));
    slot.echo.delayTime.value = Math.min(4, echoDelay);
    slot.echoFilter.frequency.value = Math.min(800, cutoff);
    slot.echoGain.gain.value = echoGain;
    slot.pan.pan.value = pan; slot.source = src;
    slot.until = t + buffer.duration / src.playbackRate.value + Math.min(4, echoDelay) + .05;
    src.connect(slot.gain);
    src.onended = () => { src.disconnect(); if (slot.source === src) slot.source = null; };
    src.start(t);
  }
  return {
    call(kind, pos, vol = .9) {
      if (disposed || rt.over || rt.def.town || rt.def.dojo || rt.flags.quiet || !pos || (kind !== 'nanori' && kind !== 'utchi' && kind !== 'help')) return;
      // 名乗り・討ち取り・助けを呼ぶ声は群声にせず、下知の一席を共用する。
      void playKind(kind, pos, vol, true);
    },
    play(name, pos, vol = 1) {
      const kind = KINDS[name];
      if (!kind) return false;
      // 前進中は長い喚き、組み合う間は短い気合い。
      let charging = false;
      if (name === 'eshout' && pos) for (const g of rt.army.groups) {
        if ((g.order === 'attack' || g.order === 'assault') && g.leader && Math.hypot(g.leader.pos.x - pos.x, g.leader.pos.z - pos.z) < 15) { charging = true; break; }
      }
      void playKind(charging ? 'charge' : kind, pos, vol);
      return true;
    },
    command(sp, text) {
      if (!sp || rt.over || rt.def.dojo || !/進め|かかれ|掛かれ|退け|下がれ|守れ|続け|持ちこたえ|攻め|突撃|放て|撃て/.test(text)) return;
      let speaker = null;
      for (const u of rt.army.units) if (u.alive && u.name && (u.name === sp || u.name.endsWith(' ' + sp)) && (u.type === 'busho' || u.isPlayer || u.group?.leader === u)) { speaker = u; break; }
      if (!speaker && !/大将|組頭|信長|旗本|将/.test(sp)) return;
      // 下知の節を合成する。文章の読み上げとは別の短い肉声。
      void playKind('command', speaker?.pos || rt.player?.u.pos, .85, true);
    },
    dispose() {
      disposed = true; clearInterval(timer);
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', sync); window.removeEventListener('focus', sync);
      if (slots) for (const slot of slots) {
        if (slot.source) { slot.source.stop(); slot.source = null; }
        slot.until = 0;
      }
      if (master) master.gain.value = 0;
    },
  };
}
