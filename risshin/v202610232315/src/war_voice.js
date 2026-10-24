// 合成声の生成は既存の宣伝動画用だけに残す。ゲームでは鳴らさない。
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
  nanori: [['a', .18, 'w'], ['e', .16, 'r'], [null, .08], ['o', .18, 'k'], ['o', .23, 's']], // 我こそ
  utchi: [['u', .15], ['i', .12, 'ch'], ['o', .17, 't'], ['a', .28, 't']], // 討ち取った
  help: [['a', .18, 't'], ['u', .14, 's'], ['e', .2, 'k'], ['e', .28, 't']], // 助けて
};
const cache = new Map();
// 三通りだけ焼く。携帯で合成処理が重ならないよう一つずつ作る。
let bakeQueue = Promise.resolve();
async function bake(kind, count, variant = 0) {
  if (!CALLS[kind]) return null;
  count = count <= 1 ? 1 : count <= 8 ? 8 : 24;
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

// 日本語の肉声と確認できる掛け声を入れるまでは、合成声で埋めない。
// 音源・焼き処理・定期処理を作らず、既存の呼び出し口だけを保つ。
const SILENT_VOICES = Object.freeze({
  call() {},
  play() { return false; },
  command() {},
  dispose() {},
});
export function createWarVoices() { return SILENT_VOICES; }
