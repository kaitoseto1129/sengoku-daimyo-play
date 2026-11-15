// 合成声を指定した戦だけで、実兵の位置と下知に合わせて鳴らす。
import { S } from './settings.js';
import { WIND_STATE } from './world_weather.js';
import { createSoundPath, sampleSoundPath } from './audio_path.js';
import { takePosition, releasePosition } from './audio_positions.js';
const VOWELS = { a: [780, 1180, 2600], e: [480, 1850, 2600], i: [280, 2200, 3000], o: [500, 850, 2500], u: [330, 700, 2300] };
// 母音・長さ・出だしの子音。全文読み上げではなく、戦場の短い節を作る。
const CALLS = {
  toki: [['e', .27], ['i', .11], [null, .22], ['e', .27], ['i', .11], [null, .24], ['o', .46], ['u', .37]],
  charge: [['o', .22], ['a', .34, 'r'], ['a', .38]],
  clash: [['e', .14], ['i', .12], [null, .09]], // えいっ
  clashOu: [['o', .18], ['o', .17], [null, .09]], // おおっ
  fall: [['u', .14, 'g'], ['a', .23], ['u', .38, 'm']],
  groan: [['u', .38, 'm'], ['o', .42], ['u', .28, 'm']],
  command: [['a', .16, 'k'], ['a', .17, 'k'], ['e', .28, 'r']], // かかれ
  withdraw: [['i', .18, 'h'], ['e', .28, 'k']], // 退け
  fire: [['a', .16, 'h'], ['a', .17, 'n'], ['e', .26, 't']], // 放て
  hold: [['a', .16, 'm'], ['o', .17, 'm'], ['e', .26, 'r']], // 守れ
  advance: [['u', .16, 's'], ['u', .17, 's'], ['e', .26, 'm']], // 進め
  follow: [['u', .16, 't'], ['u', .17, 'z'], ['e', .26, 'k']], // 続け
  stop: [['o', .16, 't'], ['a', .17, 'm'], ['e', .26, 'r']], // 止まれ
  gather: [['a', .16], ['u', .17, 'ts'], ['a', .17, 'm'], ['e', .26, 'r']], // 集まれ
  nanori: [['a', .18, 'w'], ['e', .16, 'r'], [null, .08], ['o', .18, 'k'], ['o', .23, 's']], // 我こそ
  utchi: [['u', .15], ['i', .12, 'ch'], ['o', .17, 't'], ['a', .28, 't']], // 討ち取った
  help: [['a', .18, 't'], ['u', .14, 's'], ['e', .2, 'k'], ['e', .28, 't']], // 助けて
};
const KINDS = { toki: 'toki', eiei: 'toki', eshout: 'charge', shout: 'charge', cry: 'fall', groan: 'groan' };
const cache = new Map();
// 三通りだけ焼く。携帯で合成処理が重ならないよう一つずつ作る。
let bakeQueue = Promise.resolve();
let ctx = null, master = null, slots = null, compressor = null;
const audioUsers = new Set();
function audio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return false;
    ctx = new AC(); master = ctx.createGain();
    const comp = compressor = ctx.createDynamicsCompressor();
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
      const slot = { gain, filter, pan, echo, echoFilter, echoGain, source: null, until: 0, kind: '', command: false };
      slot.stopPosition = () => {
        if (slot.source) { slot.source.onended = null; try { slot.source.stop(); } catch (_) { /* 終了済み */ } slot.source.disconnect(); slot.source = null; }
        slot.gain.gain.value = 0; slot.echoGain.gain.value = 0; slot.until = 0;
      };
      return slot;
    });
    return true;
  } catch (_) { if (ctx) ctx.close().catch(() => {}); ctx = null; return false; }
}
async function bake(kind, count, variant = 0) {
  if (!CALLS[kind]) return null;
  count = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 4 : count <= 8 ? 8 : 24;
  variant = Math.abs(Math.trunc(variant)) % 3;
  const key = kind + ':' + count + ':' + variant;
  if (cache.has(key)) return cache.get(key);
  const promise = bakeQueue.then(async () => {
    const syllables = CALLS[kind], dur = syllables.reduce((n, s) => n + s[1], 0) * 1.12 + .65;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(2, Math.ceil(dur * 16000), 16000);
    const breath = off.createBuffer(1, 16000, 16000), data = breath.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // 声帯の開閉を、芯のある低音と緩やかに減る倍音で作る。
    const real = new Float32Array(33), imag = new Float32Array(33), curve = new Float32Array(256);
    for (let h = 1; h < imag.length; h++) imag[h] = 1 / Math.pow(h, 1.35);
    const wave = off.createPeriodicWave(real, imag);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 255 * 2 - 1) * 2.4);
    const injured = kind === 'fall' || kind === 'groan';
    for (let v = 0; v < count; v++) {
      const start = .015 + (count === 1 ? 0 : Math.random() * .36);
      const depth = count === 1 ? 1 : .5 + Math.random() * .5;
      const pitch = (injured ? 82 : 100) * (.88 + variant * .08 + Math.random() * .12);
      const osc = off.createOscillator(), fry = off.createOscillator(), fryGain = off.createGain();
      osc.setPeriodicWave(wave); fry.type = 'sine'; fryGain.gain.value = injured ? .32 : .18;
      const throat = off.createWaveShaper(); throat.curve = curve;
      osc.connect(throat); fry.connect(fryGain); fryGain.connect(throat);
      const air = off.createBufferSource(), airGain = off.createGain();
      air.buffer = breath; air.loop = true; airGain.gain.value = injured ? .24 : .12;
      air.connect(airGain);
      const envelope = off.createGain(), pan = off.createStereoPanner(), distanceFilter = off.createBiquadFilter();
      pan.pan.value = count === 1 ? 0 : (Math.random() * 2 - 1) * .85;
      distanceFilter.type = 'lowpass'; distanceFilter.frequency.value = 1800 + depth * 4200;
      envelope.connect(distanceFilter); distanceFilter.connect(pan); pan.connect(off.destination);
      envelope.gain.value = 0;
      // 子音の息は母音帯を通さず、閉鎖の後の破裂・摩擦として鳴らす。
      const consonant = off.createBiquadFilter(), consonantGain = off.createGain();
      consonant.type = 'bandpass'; consonant.Q.value = .8; consonantGain.gain.value = 0;
      air.connect(consonant); consonant.connect(consonantGain); consonantGain.connect(distanceFilter);
      const bands = [];
      for (let b = 0; b < 3; b++) {
        const band = off.createBiquadFilter(), gain = off.createGain();
        band.type = 'bandpass'; band.Q.value = 3.5 + b * 1.5;
        gain.gain.value = b === 0 ? 1 : b === 1 ? .62 : .24;
        throat.connect(band); airGain.connect(band); band.connect(gain); gain.connect(envelope); bands.push(band);
      }
      let t = start;
      // 話者の声道を長くする。高さとは独立に口と喉の響きを散らす。
      const shift = .78 + variant * .045 + Math.random() * .08, stretch = .94 + Math.random() * .16;
      for (let s = 0; s < syllables.length; s++) {
        const [vowel, length, onset] = syllables[s], len = length * stretch;
        if (vowel) {
          const closed = onset && /^(k|g|t|ch)$/.test(onset), nasal = onset === 'm' || onset === 'n';
          const attack = onset ? (closed ? .045 : .06) : .018;
          const voicedAt = t + attack;
          for (let b = 0; b < 3; b++) {
            if (nasal) bands[b].frequency.setValueAtTime((b === 0 ? 250 : 1100 + b * 600) * shift, t);
            bands[b].frequency.setTargetAtTime(VOWELS[vowel][b] * shift, nasal ? voicedAt : t, .018);
          }
          const level = .24 / Math.sqrt(count) * depth * (injured ? 1 - s * .13 : 1);
          if (onset && !nasal && onset !== 'w' && onset !== 'r') {
            const hiss = /^(s|z|ch)$/.test(onset);
            consonant.frequency.setValueAtTime((hiss ? 3300 : onset === 'h' ? 1300 : onset === 'g' ? 750 : 2200) * shift, t);
            const burstAt = closed ? t + .026 : t;
            consonantGain.gain.setValueAtTime(0, t);
            consonantGain.gain.linearRampToValueAtTime(level * (hiss ? .85 : .65), burstAt + .004);
            consonantGain.gain.linearRampToValueAtTime(0, voicedAt + .015);
          }
          osc.frequency.setValueAtTime(pitch * (injured ? 1 : 1.16), t);
          fry.frequency.setValueAtTime(pitch * .5, t);
          // 喉が詰まり、叫びの芯が一瞬割れる。母音の終わりは低く沈む。
          for (let j = 1; j * .045 < len; j++) {
            osc.frequency.linearRampToValueAtTime(pitch * (1.08 + (Math.random() - .5) * .12 - j * .012), t + j * .045);
            fry.frequency.linearRampToValueAtTime(pitch * (.46 + Math.random() * .06), t + j * .045);
          }
          osc.frequency.linearRampToValueAtTime(pitch * (injured ? .72 : .94), t + len);
          envelope.gain.setValueAtTime(0, t);
          if (nasal) envelope.gain.linearRampToValueAtTime(level * .4, t + .012);
          envelope.gain.linearRampToValueAtTime(level, voicedAt + .015);
          for (let j = 1; j * .043 < len - attack - .035; j++) {
            const pinch = Math.random() < .16 ? .35 : .72 + Math.random() * .28;
            envelope.gain.linearRampToValueAtTime(level * pinch, voicedAt + .015 + j * .043);
          }
          envelope.gain.linearRampToValueAtTime(0, t + len);
          // 語尾の息。叫びが終わってから短く漏れる。
          consonant.frequency.setValueAtTime(900, t + len);
          consonantGain.gain.setValueAtTime(level * .12, t + len);
          consonantGain.gain.linearRampToValueAtTime(0, t + len + .035);
        }
        t += len;
      }
      osc.start(start); fry.start(start); air.start(start, Math.random() * .8);
      osc.stop(t + .04); fry.stop(t + .04); air.stop(t + .04);
    }
    const buffer = await off.startRendering();
    // 群声の重なりでも音割れを防ぐ。割れは声帯側で作り、出力は余裕を残す。
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const samples = buffer.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    }
    if (peak > .85) for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const samples = buffer.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) samples[i] *= .85 / peak;
    }
    return buffer;
  });
  bakeQueue = promise.catch(() => {});
  cache.set(key, promise);
  try { return await promise; } catch (_) { cache.delete(key); return null; }
}

// 宣伝でも同じ名乗り・鬨の肉声を使う。実時間の六席は動かさない。
export const renderPromoVoice = (kind, count = 1) => bake(kind, count);

export function createWarVoices(rt) {
  if (!rt.def.syntheticVoices) return SILENT_VOICES;
  const owner = {}; audioUsers.add(owner);
  let disposed = false, gate = 0, commandGate = 0, pending = 0;
  let orderVersion = 0;
  const path = createSoundPath(), recent = new Map();
  function speakerAt(pos) {
    if (!pos) return null;
    let nearest = null, distance = 1;
    rt.army.forNear(pos.x, pos.z, 1, (u) => {
      if (u.isStruct || nearest?.pos === pos) return;
      // 乱戦で隣の敵が先に並んでいても、渡された位置の持ち主を優先する。
      if (u.pos === pos) { nearest = u; return; }
      const d = (u.pos.x - pos.x) ** 2 + (u.pos.z - pos.z) ** 2;
      if (u.alive && d < distance) { nearest = u; distance = d; }
    });
    return nearest;
  }
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
  async function playKind(kind, pos, vol, command = false, speaker = null, immediate = false) {
    if (!allowed() || S.volume <= 0 || S.volSfx <= 0 || !audio()) return;
    // 合成の依頼も間引く。下知は群声の混雑とは別の席を使う。
    const now = ctx.currentTime;
    if (!immediate && (now < (command ? commandGate : gate) || pending >= 2)) return;
    if (command) commandGate = now + 4; else gate = now + (kind === 'toki' ? 1.8 : .22);
    if (ctx.state !== 'running') return; // 最初の指・キー操作でだけ音を開く
    const at = pos || rt.player?.u.pos;
    if (!at || !rt.camera) return;
    const c = rt.camera.position, dx = at.x - c.x, dz = at.z - c.z, distance = Math.hypot(dx, dz);
    if (distance > (command ? 240 : 300)) return;
    let n = 0;
    const localVoices = !!rt.def.syntheticVoices;
    const source = localVoices ? speaker || speakerAt(at) : null;
    // 周囲の生きた兵だけを数える。大軍でも追加の兵や配列は作らない。
    if ((kind === 'toki' || kind === 'charge') && !command) rt.army.forNear(at.x, at.z, 24, (u) => {
      if (u.alive && !u.isStruct && (!localVoices ||
          !u.fleeing && !u.woundOut && !u.noTarget && !u.civ && !u.group?.civ &&
          u.type !== 'porter' && u.type !== 'dummy' && source && u.team === source.team &&
          (!source.group || u.group === source.group)) &&
          Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 24) n++;
    });
    // 田野の先手と後詰は別々に応える。隣の組を重ねて数えず、敵や非戦の者も除く。
    if (localVoices && (kind === 'toki' || kind === 'charge') && !command && !n) return;
    const nearby = n / (1 + distance / 120);
    // 少勢の返事も一人声に潰さず、二人・四人の合成を使い回す。実人数より厚くしない。
    const count = localVoices && !command && (kind === 'toki' || kind === 'charge') ? (n < 2 ? 1 : n < 4 ? 2 : n < 8 ? 4 : n < 24 ? 8 : 24)
      : kind === 'toki' ? 24 : kind === 'charge' && !command ? (nearby < 5 ? 1 : nearby < 20 ? 8 : 24) : 1;
    const last = recent.get(kind) ?? -1;
    const variant = last < 0 ? Math.floor(Math.random() * 3) : (last + 1 + Math.floor(Math.random() * 2)) % 3;
    recent.set(kind, variant);
    const pan = ((dx * -Math.cos(rt.player.yaw) + dz * Math.sin(rt.player.yaw)) / (distance || 1)) * .75;
    sampleSoundPath(rt.world, at, c, WIND_STATE, path, distance);
    // 焼いている間に別の声が来ても、その声の道筋は変えない。
    const delay = path.delay, pathGain = path.gain, cutoff = path.cutoff;
    const echoDelay = path.echoDelay, echoGain = path.echoGain;
    // 下知待ちの合成が終わっても、停止・集合へ変わった後に古い声を出さない。
    const version = orderVersion, orderVoice = command || kind === 'toki' || kind === 'charge';
    pending++;
    const buffer = await bake(kind, count, variant);
    pending--;
    if (!buffer || !allowed() || orderVoice && version !== orderVersion || ctx.currentTime - now > 1.2) return;
    // 田野では合成待ちの間に倒れた話者から下知や鬨を出さない。退けの声は敗走中も残す。
    if (localVoices && orderVoice && (!source || !source.alive || source.woundOut || source.noTarget ||
        source.fleeing && kind !== 'withdraw')) return;
    sync();
    let slot = command ? slots[5] : null;
    if (!command) for (let i = 0; i < 5; i++) if (slots[i].until <= ctx.currentTime) { slot = slots[i]; break; }
    if (!slot || slot.until > ctx.currentTime) return;
    const t = Math.max(ctx.currentTime, now + delay);
    const lifetime = t - ctx.currentTime + buffer.duration / .94 + Math.min(4, Math.max(echoDelay, .065 + distance / 1100)) + .1;
    if (!takePosition(slot, command || speaker?.type === 'busho' && speaker.name ? 3 : 1, distance, lifetime, slot.stopPosition)) return;
    // 耳の後ろ・背を向けた話者はこもる。兵の向きは単声だけに使う。
    const yaw = rt.player.yaw || 0;
    const facing = distance ? Math.max(0, (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance) : 1;
    const speakerFacing = count === 1 && Number.isFinite(speaker?.heading) && distance ? Math.max(0, (-dx * Math.sin(speaker.heading) - dz * Math.cos(speaker.heading)) / distance) : 1;
    const direction = .65 + facing * .2 + speakerFacing * .15;
    let identity = 0;
    const voiceName = speaker ? String(speaker.name || speaker.id || '') : '';
    for (let i = 0; i < voiceName.length; i++) identity = (identity * 31 + voiceName.charCodeAt(i)) >>> 0;
    const src = ctx.createBufferSource(); src.buffer = buffer;
    src.playbackRate.value = .94 + (identity % 9) * .008 + Math.random() * .04;
    slot.gain.gain.value = Math.min(1.5, Math.max(0, vol)) * (1 + Math.log2(count) * .16) / (1 + (distance / (command ? 60 : 40)) ** 1.4) * pathGain * direction;
    slot.filter.frequency.value = Math.max(220, Math.min(cutoff, 6500 * direction / (1 + distance / 45)));
    slot.echo.delayTime.value = Math.min(4, Math.max(echoDelay, .065 + distance / 1100));
    slot.echoFilter.frequency.value = Math.min(800, cutoff);
    slot.echoGain.gain.value = Math.max(echoGain, Math.min(.22, distance / 900));
    slot.pan.pan.value = pan; slot.source = src; slot.kind = kind; slot.command = command;
    slot.until = t + buffer.duration / src.playbackRate.value + slot.echo.delayTime.value + .05;
    src.connect(slot.gain);
    src.onended = () => { src.disconnect(); if (slot.source === src) slot.source = null; };
    src.start(t);
  }
  return {
    // 戦の下知が変わる時だけ呼ぶ。斬り合い・倒れ・うめき声はそのまま残す。
    replaceOrder() {
      orderVersion++; commandGate = 0;
      if (!ctx || !slots) return;
      for (const slot of slots) {
        if (!slot.command && slot.kind !== 'toki' && slot.kind !== 'charge') continue;
        if (slot.source) { slot.source.stop(); slot.source = null; }
        slot.gain.gain.setValueAtTime(0, ctx.currentTime);
        slot.echoGain.gain.setValueAtTime(0, ctx.currentTime);
        slot.until = 0;
      }
    },
    call(kind, pos, vol = .9) {
      if (disposed || rt.over || rt.def.town || rt.def.dojo || rt.flags.quiet || !pos || (kind !== 'nanori' && kind !== 'utchi' && kind !== 'help')) return;
      // 名乗り・討ち取り・助けを呼ぶ声は群声にせず、下知の一席を共用する。
      void playKind(kind, pos, vol, true, speakerAt(pos));
    },
    play(name, pos, vol = 1) {
      const kind = KINDS[name];
      if (!kind) return false;
      // 前進中は長い喚き、組み合う間は短い気合い。
      let charging = false;
      if (name === 'eshout' && pos) for (const g of rt.army.groups) {
        if ((g.order === 'attack' || g.order === 'assault') && g.leader && Math.hypot(g.leader.pos.x - pos.x, g.leader.pos.z - pos.z) < 15) { charging = true; break; }
      }
      void playKind(charging ? 'charge' : kind === 'clash' && Math.random() < .5 ? 'clashOu' : kind, pos, vol, false, speakerAt(pos));
      return true;
    },
    command(sp, text, order = null) {
      // 戦固有の合図は、字幕と同じ意味・実兵の位置を明示できる。
      const explicit = order && Object.hasOwn(CALLS, order.kind) && order.pos;
      // 日本語の声（war_speech.js）が使える時は、字幕の出る時にそちらが鳴らす。
      // 音源にない停止・集合は合成する。
      if (rt.warSpeech?.ready && !(explicit && (order.kind === 'stop' || order.kind === 'gather'))) return;
      if (!sp || rt.over && !(explicit && order.ending && rt.player.u.alive) || rt.def.dojo ||
          !explicit && !/進め|かかれ|掛かれ|退け|下がれ|守れ|続け|持ちこたえ|攻め|突撃|放て|撃て/.test(text)) return;
      // 田野の「組頭」などの役名も、下知に渡された実兵の向きと位置で鳴らす。
      let speaker = explicit ? speakerAt(order.pos) : null;
      if (!explicit) for (const u of rt.army.units) if (u.alive && u.name && (u.name === sp || u.name.endsWith(' ' + sp)) && (u.type === 'busho' || u.isPlayer || u.group?.leader === u)) { speaker = u; break; }
      if (!explicit && !speaker && !/大将|組頭|信長|旗本|将/.test(sp)) return;
      // 下知の節を合成する。文章の読み上げとは別の短い肉声。
      const kind = explicit ? order.kind : /退け|下がれ/.test(text) ? 'withdraw' : /放て|撃て/.test(text) ? 'fire' : /守れ|持ちこたえ/.test(text) ? 'hold' : /続け/.test(text) ? 'follow' : /進め/.test(text) ? 'advance' : 'command';
      void playKind(kind, explicit ? order.pos : speaker?.pos || rt.player?.u.pos, .85, true, speaker, !!explicit);
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearInterval(timer);
      audioUsers.delete(owner);
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', sync); window.removeEventListener('focus', sync);
      if (!audioUsers.size && slots) for (const slot of slots) {
        releasePosition(slot);
        if (slot.source) { slot.source.onended = null; try { slot.source.stop(); } catch (_) { /* 止め済み */ } slot.source.disconnect(); slot.source = null; }
        for (const node of [slot.gain, slot.filter, slot.pan, slot.echo, slot.echoFilter, slot.echoGain]) node.disconnect();
        slot.until = 0;
      }
      if (!audioUsers.size) {
        master?.disconnect(); compressor?.disconnect();
        ctx?.close().catch(() => {});
        ctx = master = slots = compressor = null;
      }
      recent.clear();
    },
  };
}
// 日本語の肉声と確認できる掛け声を入れるまでは、合成声で埋めない。
// 音源・焼き処理・定期処理を作らず、既存の呼び出し口だけを保つ。
const SILENT_VOICES = Object.freeze({
  call() {},
  play() { return false; },
  command() {},
  dispose() {},
});
