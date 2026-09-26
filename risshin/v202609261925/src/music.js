// 大河ドラマのような楽の音（音源ファイルなし。発振器・雑音・フィルター・残響だけで作る）
// 曲の譜面と、それを少し先まで予約して鳴らす仕組み。
// 使い方：const m = createMusic(ctx, 出口, { mark, pressure }); m.play('title'); m.stop(2); m.setIntensity(0.7)
// OfflineAudioContext でも同じ物が鳴る（renderMusic で WAV に書き出せる）
//
// 曲の名前：
//   title（主題曲・約1分で繰り返す）・town（城下。季節で変わる）・prebattle（合戦の前）・battle（合戦の最中）
//   climax（戦の山場）・victory（凱歌）・defeat（負け・討死の尺八）・promote（昇進の金管）・map（日本地図）
// 音階：都節（D Eb G A Bb）・民謡（D F G A C）・陽（D E G A B）に、西洋の和音（Dm Bb Gm A Eb F C）を重ねる

// ---------------- 音の高さと譜面 ----------------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function hz(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  const pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (12 * (+m[3] + 1) + pc - 69) / 12);
}
// 'D5/2 r/1 A4/.5' → [[拍の位置, 高さ, 拍の長さ], …]（r は休み。| は見やすくするための区切りで無視）
function seq(s) {
  let b = 0; const out = [];
  for (const tok of s.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, d] = tok.split('/'); const len = +d || 1;
    if (n !== 'r') out.push([b, hz(n), len]);
    b += len;
  }
  return out;
}
// 小節ごとの譜面（'|' で区切る）→ 小節ごとの配列
const bars = (s) => s.split('|').map((x) => seq(x));

// 和音（弦の合奏の置き方）と低音
const CH = {};
for (const [k, pad, bass] of [
  ['Dm', 'A3 D4 F4 A4', 'D2'], ['D', 'A3 D4 F#4 A4', 'D2'], ['Bb', 'F3 Bb3 D4 F4', 'Bb1'], ['Gm', 'G3 Bb3 D4 G4', 'G2'],
  ['A', 'A3 C#4 E4 A4', 'A1'], ['Asus', 'A3 D4 E4 A4', 'A1'], ['Eb', 'G3 Bb3 Eb4 G4', 'Eb2'], ['F', 'A3 C4 F4 A4', 'F2'],
  ['C', 'G3 C4 E4 G4', 'C2'], ['G', 'G3 B3 D4 G4', 'G2'], ['D5', 'A3 D4 A4', 'D2'],
]) CH[k] = { pad: pad.split(' ').map(hz), bass: hz(bass) };

// 決まった並びの乱数（書き出しても毎回同じ曲になる）
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- 主題（タイトル・凱歌・山場・日本地図で使い回す） ----------------
// 18小節：前奏2・A 8・B 6・結び2（72拍/分で約1分）
const THEME_CH = ['D5', 'Dm', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'Gm', 'A', 'Bb', 'F', 'Gm', 'Eb', 'Bb A', 'Asus A', 'Dm', 'Dm'];
const THEME = bars(
  'r/4 | r/4 |' +
  // A：ホルンが静かに歌い出す
  'A4/.5 D5/1.5 E5/1 F5/1 | D5/3 F5/1 | G5/1.5 F5/.5 D5/2 | E5/2 C#5/1 E5/1 |' +
  'F5/1.5 E5/.5 D5/1 A4/1 | Bb4/1.5 Eb5/.5 G5/2 | Bb5/1.5 A5/.5 G5/1 D5/1 | E5/2 A5/2 |' +
  // B：弦と金管がそろって高く
  'D6/3 C6/1 | A5/2 C6/1 A5/1 | Bb5/2 A5/1 G5/1 | G5/2 Bb5/1 Eb6/1 | D6/2 C#6/2 | E6/1.5 D6/.5 C#6/2 |' +
  'D6/4 | r/4');
// 前奏の篠笛（都節の終わり方 Eb→D）
const INTRO_FUE = bars('r/1 A5/2 Bb5/.5 A5/.5 | G5/1 Eb5/.5 D5/2.5');

// ---------------- 仕組み ----------------
export function createMusic(ctx, dest, hooks = {}) {
  const sr = ctx.sampleRate;
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  const E = { intensity: 0, level: 1, stats: { peak: 0, dropped: 0, notes: 0, drop: [0, 0, 0] } };
  const nb = ctx.createBuffer(1, sr, sr);
  { const d = nb.getChannelData(0); const r = rng(7); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  // 残響（広い広間のような、暗めの尾）
  const rev = ctx.createConvolver();
  rev.buffer = impulse(ctx, 2.6);
  const revIn = ctx.createGain(); revIn.gain.value = 1;
  revIn.connect(rev); rev.connect(dest);

  let cur = null, timer = null, horizon = 0;
  let iv = []; // [始まり, 終わり, 重さ]（音の時刻）

  // ---- 同時に鳴る数の見張り（prio 0＝旋律、1＝和音、2＝飾り） ----
  function busy(t) { let n = 0; for (const v of iv) if (v[0] <= t + 0.001 && v[1] > t) n += v[2]; return n; }
  function take(t, dur, w, prio) {
    if (iv.length > 48) { const lim = Math.max(ctx.currentTime, horizon - 0.5); iv = iv.filter((v) => v[1] > lim); }
    const cap = cur ? cur.cap : 16;
    const lim = prio === 0 ? cap : prio === 1 ? cap - 3 : cap - 7;
    // 鳴っている間のいちばん混む所で数える（あとから始まる音とも重ならないように）
    let n = busy(t);
    for (const v of iv) if (v[0] > t && v[0] < t + dur) n = Math.max(n, busy(v[0]));
    if (n + w > lim) { E.stats.dropped++; E.stats.drop[prio]++; return false; }
    // 効果音が混んでいる時は、飾りの音から譲る
    if (prio >= 1 && hooks.pressure && hooks.pressure() > (prio === 2 ? 40 : 50)) { E.stats.dropped++; return false; }
    iv.push([t, t + dur, w]);
    if (n + w > E.stats.peak) E.stats.peak = n + w;
    E.stats.notes++;
    if (hooks.mark) hooks.mark(t - ctx.currentTime, dur, w);
    return true;
  }
  E.live = () => busy(ctx.currentTime);

  // ---- 楽器ごとの通り道（音量・左右・残響の量） ----
  const BUS = {
    str: [0.9, 0, 0.5], low: [0.5, 0, 0.25], brass: [0.9, -0.2, 0.45], taiko: [1, 0, 0.35], shime: [0.8, 0.3, 0.2],
    kane: [0.8, 0.45, 0.45], koto: [1, 0.35, 0.35], sham: [0.9, -0.35, 0.25], fue: [0.9, -0.3, 0.5], shaku: [1, -0.1, 0.6],
  };
  function bus(c, name) {
    if (c.bus[name]) return c.bus[name];
    const [v, pan, wet] = BUS[name];
    const g = ctx.createGain(); g.gain.value = v;
    let tail = g;
    if (name === 'str') tail = chorus(g, c);
    let p = tail;
    if (pan && ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = pan; tail.connect(p); }
    p.connect(c.dry);
    const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(c.wet);
    return (c.bus[name] = g);
  }
  // 弦の合奏の厚み：少し揺れる遅れを左右に二つ足す
  function chorus(input, c) {
    const out = ctx.createGain();
    input.connect(out);
    for (const [d, rate, pan] of [[0.013, 0.37, -0.6], [0.019, 0.29, 0.6]]) {
      const dl = ctx.createDelay(0.05); dl.delayTime.value = d;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = 0.0025; lfo.connect(lg); lg.connect(dl.delayTime);
      const g = ctx.createGain(); g.gain.value = 0.55;
      input.connect(dl); dl.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
      lfo.start(); c.lfos.push(lfo);
    }
    return out;
  }
  function noiseSrc(t, dur) { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, (t * 7.31) % 0.9); s.stop(t + dur); return s; }
  function adsr(p, t, a, peak, hold, rel, sus = 1) {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(peak, t + a);
    if (sus !== 1) p.linearRampToValueAtTime(peak * sus, t + a + Math.max(0.01, hold * 0.5));
    p.setValueAtTime(peak * sus, t + a + Math.max(0.01, hold));
    p.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.01, hold) + rel);
  }

  // ---- 楽器 ----
  // 弦（合奏・独奏・刻み・トレモロ）
  function str(c, name, t, f, dur, vel, o = {}) {
    const n = o.solo ? 2 : 1, a = o.a ?? 0.35, rel = o.r ?? 0.8, end = t + dur + rel + 0.05;
    if (!take(t, dur + rel, n, o.prio ?? 1)) return;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut || 700 + 1500 * vel; lp.Q.value = 0.6;
    const g = ctx.createGain();
    let vib = null;
    if (o.vib && dur > 0.5) {
      vib = ctx.createOscillator(); vib.frequency.value = 5.2;
      const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(14, t + Math.min(dur, 0.8));
      vib.connect(vg); vib.start(t); vib.stop(end); vib._g = vg;
    }
    for (let i = 0; i < n; i++) {
      const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f;
      s.detune.value = n > 1 ? (i ? 8 : -8) : (Math.sin(t * 13.7 + f) * 6);
      if (vib) vib._g.connect(s.detune);
      s.connect(lp); s.start(t); s.stop(end);
    }
    const peak = (o.v ?? 0.05) * vel / Math.sqrt(n);
    if (o.trem) {
      // トレモロ：弓を細かく往復させる
      const tg = ctx.createGain(); tg.gain.value = 0.55;
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = o.trem;
      const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(tg.gain);
      lfo.start(t); lfo.stop(end);
      lp.connect(tg); tg.connect(g);
    } else lp.connect(g);
    adsr(g.gain, t, a, peak, dur - a, rel);
    g.connect(bus(c, name));
  }
  // 金管：息を吹き込んだ瞬間に明るく開く
  function brass(c, t, f, dur, vel, o = {}) {
    const end = t + dur + 0.45;
    if (!take(t, dur + 0.4, 2, o.prio ?? 0)) return;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    const top = 700 + 2300 * vel;
    lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(top, t + 0.08);
    lp.frequency.linearRampToValueAtTime(top * 0.7, t + Math.max(0.1, Math.min(dur, 0.5)));
    const g = ctx.createGain();
    for (const [type, k, v] of [['sawtooth', 1, 1], ['square', 1.003, 0.35]]) {
      const s = ctx.createOscillator(); s.type = type;
      s.frequency.setValueAtTime(f * k * 0.985, t); s.frequency.linearRampToValueAtTime(f * k, t + 0.07);
      const sg = ctx.createGain(); sg.gain.value = v; s.connect(sg); sg.connect(lp);
      s.start(t); s.stop(end);
    }
    lp.connect(g);
    adsr(g.gain, t, 0.05, (o.v ?? 0.07) * vel, Math.max(0.05, dur - 0.05), 0.35, 0.78);
    g.connect(bus(c, 'brass'));
  }
  // 和太鼓（大太鼓）：低い胴鳴りと皮を打つ音
  function taiko(c, t, vel, o = {}) {
    const big = o.big, len = big ? 1.4 : 0.75;
    if (!take(t, len, 2, o.prio ?? 0)) return;
    const f0 = big ? 58 : 84;
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(f0 * 1.7, t); s.frequency.exponentialRampToValueAtTime(f0, t + 0.035); s.frequency.exponentialRampToValueAtTime(f0 * 0.66, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(g); s.start(t); s.stop(t + len + 0.02);
    const n = noiseSrc(t, 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = big ? 420 : 700;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp); lp.connect(ng);
    const b = bus(c, 'taiko'); g.connect(b); ng.connect(b);
  }
  // 締太鼓：高く締まった「カン」
  function shime(c, t, vel, o = {}) {
    if (!take(t, 0.16, 1, o.prio ?? 2)) return;
    const s = ctx.createOscillator(); s.type = 'triangle';
    s.frequency.setValueAtTime(430, t); s.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13 * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const n = noiseSrc(t, 0.06);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.1 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(g); n.connect(bp); bp.connect(ng);
    const b = bus(c, 'shime'); g.connect(b); ng.connect(b);
    s.start(t); s.stop(t + 0.16);
  }
  // 鉦：倍音が整数倍でない金物の響き
  function kane(c, t, vel, o = {}) {
    if (!take(t, 1.3, 2, o.prio ?? 2)) return;
    const b = bus(c, 'kane');
    for (const [k, a, d] of [[1, 1, 1.3], [2.76, 0.45, 0.6]]) {
      const s = ctx.createOscillator(); s.frequency.value = 1040 * k;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035 * a * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(g); g.connect(b); s.start(t); s.stop(t + d + 0.02);
    }
  }
  // 琴：弾いた瞬間は明るく、すぐ柔らかくなる。bend で押し手（半音上げ）
  function koto(c, t, f, vel, o = {}) {
    const len = o.long ? 2.2 : 1.2;
    if (!take(t, len, 1, o.prio ?? 1)) return;
    const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(f, t);
    if (o.bend) { s.frequency.setValueAtTime(f, t + 0.3); s.frequency.linearRampToValueAtTime(f * 1.0595, t + 0.45); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((o.v ?? 0.1) * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.02 * vel, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(lp); lp.connect(g); g.connect(bus(c, 'koto'));
    s.start(t); s.stop(t + len + 0.02);
  }
  // 三味線：撥で打つ硬い音と、さわりのびりつき
  function sham(c, t, f, vel, o = {}) {
    if (!take(t, 0.6, 1, o.prio ?? 1)) return;
    const s = ctx.createOscillator(); s.type = 'sawtooth';
    s.frequency.setValueAtTime(f * 1.01, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.setValueAtTime(f * 4, t); hp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.2); hp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    s.connect(hp); hp.connect(g); g.connect(bus(c, 'sham'));
    s.start(t); s.stop(t + 0.6);
  }
  // 笛（篠笛・尺八）：息の音を混ぜ、入りに装飾、伸ばすと揺れる
  function wind(c, name, t, f, dur, vel, o = {}) {
    const shaku = name === 'shaku';
    const end = t + dur + 0.35;
    if (!take(t, dur + 0.3, 2, o.prio ?? 0)) return;
    const s = ctx.createOscillator(); s.type = shaku ? 'triangle' : 'sine';
    if (o.grace) { s.frequency.setValueAtTime(o.grace, t); s.frequency.setValueAtTime(f, t + 0.08); }
    else if (shaku) { s.frequency.setValueAtTime(f * 0.95, t); s.frequency.linearRampToValueAtTime(f, t + 0.28); }
    else { s.frequency.setValueAtTime(f * 0.99, t); s.frequency.linearRampToValueAtTime(f, t + 0.06); }
    if (dur > 0.7) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = shaku ? 4.6 : 5.6;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.35); lg.gain.linearRampToValueAtTime(f * (shaku ? 0.016 : 0.01), t + dur);
      lfo.connect(lg); lg.connect(s.frequency); lfo.start(t); lfo.stop(end);
    }
    if (shaku && o.fall) s.frequency.setTargetAtTime(f * 0.94, t + dur - 0.1, 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * (shaku ? 3 : 4);
    const g = ctx.createGain();
    const peak = (o.v ?? (shaku ? 0.08 : 0.06)) * vel;
    adsr(g.gain, t, shaku ? 0.12 : 0.05, peak, Math.max(0.05, dur - 0.1), shaku ? 0.3 : 0.18, 0.85);
    s.connect(lp); lp.connect(g);
    // 息：尺八は強く、入りに「むら息」
    const n = noiseSrc(t, dur + 0.35);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (shaku ? 1.5 : 2); bp.Q.value = shaku ? 1.2 : 2.5;
    const ng = ctx.createGain();
    const br = peak * (shaku ? (o.muraiki ? 1.4 : 0.55) : 0.25);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(br, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(br * 0.35, t + 0.3); ng.gain.setValueAtTime(br * 0.35, t + dur); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    n.connect(bp); bp.connect(ng);
    const b = bus(c, name); g.connect(b); ng.connect(b);
    s.start(t); s.stop(end);
  }

  // 曲の中から使う道具
  function api(c) {
    return {
      c, B: c.B, rnd: c.rnd, E, o: c.o,
      pad: (t, ch, dur, vel, o = {}) => { for (const f of CH[ch].pad) str(c, 'str', t, f, dur, vel, { prio: 1, v: 0.028, cut: 900 + 900 * vel, a: 0.5, r: 0.7, ...o }); },
      bass: (t, ch, dur, vel, o = {}) => str(c, 'low', t, CH[ch].bass, dur, vel, { prio: 1, v: 0.07, cut: 380 + 300 * vel, a: 0.2, r: 0.6, ...o }),
      str: (t, f, dur, vel, o = {}) => str(c, 'str', t, f, dur, vel, { solo: true, vib: true, prio: 0, v: 0.065, a: 0.12, r: 0.6, ...o }),
      low: (t, f, dur, vel, o = {}) => str(c, 'low', t, f, dur, vel, { prio: 1, v: 0.07, cut: 500 + 500 * vel, a: 0.01, r: 0.12, ...o }),
      brass: (t, f, dur, vel, o) => brass(c, t, f, dur, vel, o),
      taiko: (t, vel, o) => taiko(c, t, vel, o),
      shime: (t, vel, o) => shime(c, t, vel, o),
      kane: (t, vel, o) => kane(c, t, vel, o),
      koto: (t, f, vel, o) => koto(c, t, f, vel, o),
      sham: (t, f, vel, o) => sham(c, t, f, vel, o),
      fue: (t, f, dur, vel, o) => wind(c, 'fue', t, f, dur, vel, o),
      shaku: (t, f, dur, vel, o) => wind(c, 'shaku', t, f, dur, vel, o),
      // 譜面の一小節を、楽器 fn で鳴らす（mul：高さの倍率、stretch：拍の長さの倍率）
      line: (t, notes, fn, mul = 1, stretch = 1) => { for (const [b, f, len] of notes) fn(t + b * c.B * stretch, f * mul, len * c.B * stretch); },
    };
  }

  // ---- 曲を始める・止める ----
  function play(name, o = {}) {
    const def = CUES[name];
    if (cur && cur.name === name && !o.restart) { Object.assign(cur.o, o); return; }
    const now = ctx.currentTime;
    if (cur) fadeOut(cur, o.fadeOut ?? (def && def.once ? 0.8 : 2.5));
    cur = null;
    if (!def) return;
    const c = {
      name, def, o: { ...o }, bus: {}, lfos: [], n: 0,
      B: 60 / (def.bpm * (o.tempo || 1) * (def.tempo ? def.tempo(o) : 1)), rnd: rng(o.seed ?? (name.length * 97 + 13)),
      cap: def.cap || 18,
    };
    c.barLen = c.B * (def.beats || 4);
    c.dry = ctx.createGain(); c.wet = ctx.createGain();
    const g = (def.gain ?? 1) * E.level;
    const fin = o.fadeIn ?? (def.once ? 0.02 : 1.2);
    const t0 = now + (o.delay || 0) + 0.12;
    for (const [node, v] of [[c.dry, g], [c.wet, g * 0.5]]) {
      node.gain.setValueAtTime(0.0001, now); node.gain.setValueAtTime(0.0001, t0);
      node.gain.exponentialRampToValueAtTime(v, t0 + Math.max(0.03, fin));
    }
    c.dry.connect(dest); c.wet.connect(revIn);
    c.next = t0;
    cur = c;
    fill(now + LOOK);
    if (!offline && !timer) timer = setInterval(tick, 150);
  }
  function fadeOut(c, sec) {
    const now = ctx.currentTime;
    for (const n of [c.dry, c.wet]) { n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(n.gain.value, now); n.gain.setTargetAtTime(0.0001, now, Math.max(0.05, sec / 3)); }
    for (const l of c.lfos) { try { l.stop(now + sec + 1); } catch (e) { /* 止まっている */ } }
    const drop = () => { try { c.dry.disconnect(); c.wet.disconnect(); } catch (e) { /* 外れている */ } };
    if (!offline) setTimeout(drop, (sec + 5) * 1000);
  }
  function stop(sec = 2) { if (cur) fadeOut(cur, sec); cur = null; }
  const LOOK = 0.7;
  function fill(until) {
    const c = cur;
    if (!c) return;
    while (c.next < until) {
      if (c.def.once && c.n >= c.def.len) {
        // 一度きりの曲：鳴り終わったら次の曲へ（then）か、静かに
        if (!c.doneAt) c.doneAt = c.next + (c.def.tail ?? 2.5);
        return;
      }
      horizon = c.next;
      const len = c.def.len || Infinity;
      c.def.bar(api(c), c.def.once ? c.n : c.n % len, c.next, c.n);
      c.n++; c.next += c.barLen;
    }
  }
  function tick() {
    if (!cur) return;
    const now = ctx.currentTime;
    if (cur.doneAt && now > cur.doneAt) {
      const then = cur.o.then; const c = cur; cur = null;
      fadeOut(c, 1.5);
      if (then) play(then, { season: c.o.season });
      return;
    }
    fill(now + LOOK);
  }

  return {
    play, stop, E,
    now: () => (cur ? cur.name : null),
    setIntensity(x) { E.intensity = Math.max(0, Math.min(1, x)); },
    setLevel(x) { E.level = x; if (cur) { const g = (cur.def.gain ?? 1) * x; cur.dry.gain.setTargetAtTime(g, ctx.currentTime, 0.8); cur.wet.gain.setTargetAtTime(g * 0.5, ctx.currentTime, 0.8); } },
    // 書き出し用：sec 秒ぶんを先に全部予約する
    prerender(sec) { fill(sec); },
    stats: () => ({ ...E.stats, live: busy(ctx.currentTime), cue: cur ? cur.name : null }),
  };
}

// 残響の元（左右で違う雑音が、だんだん暗く弱くなる）
function impulse(ctx, sec) {
  const sr = ctx.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.018);
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), r = rng(31 + ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      lp += (r() * 2 - 1 - lp) * (0.6 - 0.45 * x);
      d[i] = lp * Math.pow(1 - x, 2.4);
    }
  }
  return b;
}

// ---------------- 曲 ----------------
// bar(a, k, t, n)：k＝曲の中の小節（繰り返しで戻る）、t＝その小節の始まりの時刻、n＝始めからの小節数
const SCALES = {
  春: ['D', 'Eb', 'G', 'A', 'Bb'],   // 都節：桜の頃のしっとりした響き
  夏: ['D', 'E', 'G', 'A', 'B'],     // 陽音階：祭りの明るさ
  秋: ['D', 'F', 'G', 'A', 'C'],     // 民謡音階：実りと夕暮れ
  冬: ['D', 'Eb', 'G', 'A', 'Bb'],   // 都節：静かな雪
};
// 音階の番号（0＝低いD）→ 高さ
function deg(scale, i, base = 4) { const n = scale.length; const o = Math.floor(i / n); const k = ((i % n) + n) % n; const name = scale[k]; return hz(name + (base + o + (PC[name[0]] < PC.D ? 1 : 0))); }

const CUES = {
  // 1. タイトル：大河ドラマの主題曲のように
  title: {
    bpm: 72, len: 18, gain: 0.85, cap: 30,
    bar(a, k, t) {
      const B = a.B, chs = THEME_CH[k].split(' '), half = chs.length > 1;
      const inA = k >= 2 && k <= 9, inB = k >= 10 && k <= 15;
      // 和音（弦の合奏）と低音
      chs.forEach((ch, i) => {
        const tt = t + i * 2 * B, d = half ? 2 * B : 4 * B;
        if (k >= 2) a.pad(tt, ch, d, inB || k === 16 ? 0.85 : 0.55);
        if (k < 2) { a.bass(tt, ch, d, 0.5, { a: 1.2 }); }
        else if (inB) { a.bass(tt, ch, d * 0.5, 0.9); a.bass(tt + d * 0.5, ch, d * 0.5, 0.8); }
        else a.bass(tt, ch, d, 0.7);
      });
      // 旋律：A はホルン、B は弦と金管がそろう
      const mel = THEME[k];
      if (inA) a.line(t, mel, (tt, f, d) => { if (k <= 5) a.brass(tt, f / 2, d * 0.95, 0.8); else a.str(tt, f, d * 0.98, 0.85); });
      if (inB || k === 16) a.line(t, mel, (tt, f, d) => { a.str(tt, f, d * 0.98, 0.95); a.brass(tt, f / 2, d * 0.9, 0.8); });
      // 前奏と結びの篠笛
      if (k < 2) a.line(t, INTRO_FUE[k], (tt, f, d) => a.fue(tt, f, d * 0.95, 0.8, { grace: k === 0 && tt === t + B ? f * 1.12 : 0 }));
      // 琴の分散和音（A）と、B では拍ごとの強い弾き
      if (inA || k === 16 || k === 17) {
        chs.forEach((ch, i) => {
          const p = CH[ch].pad.map((f) => f * 2);
          const pat = [0, 2, 1, 3, 2, 1, 3, 2];
          const n = half ? 4 : 8;
          for (let j = 0; j < n; j++) a.koto(t + (i * 4 + j) * B * 0.5, p[pat[j] % p.length], (j % 2 ? 0.45 : 0.6) * (k >= 16 ? 0.7 : 1), { prio: 2 });
        });
      }
      if (inB) chs.forEach((ch, i) => { for (let j = 0; j < (half ? 2 : 4); j++) a.koto(t + (i * 2 + j) * B, CH[ch].bass * 4, 0.55, { prio: 2 }); });
      // 和太鼓
      if (k === 0) { a.taiko(t, 1, { big: true }); a.kane(t + 3 * B, 0.4); }
      if (k === 1) { a.taiko(t, 0.8, { big: true }); a.taiko(t + 3 * B, 0.5); a.taiko(t + 3.5 * B, 0.7); }
      if (inA && k % 2 === 0) a.taiko(t, 0.55, { big: true });
      if (inA && k === 9) { a.taiko(t + 2 * B, 0.5); a.taiko(t + 3 * B, 0.6); a.taiko(t + 3.5 * B, 0.8); }
      if (inB) {
        a.taiko(t, 0.95, { big: k % 2 === 0 }); a.taiko(t + 1.5 * B, 0.5); a.taiko(t + 2 * B, 0.8); a.taiko(t + 3 * B, 0.6); a.taiko(t + 3.5 * B, 0.7);
        for (let j = 0; j < 8; j++) a.shime(t + j * B * 0.5, j % 2 ? 0.35 : 0.6);
        if (k === 10 || k === 14) a.kane(t, 0.7);
      }
      if (k === 16) { a.taiko(t, 1, { big: true }); a.kane(t, 0.8); a.taiko(t + 2 * B, 0.6, { big: true }); }
      if (k === 17) {
        // 結び：太鼓が次第に詰まり、最初へ戻る
        for (let j = 0; j < 6; j++) a.taiko(t + (1.5 + j * 0.4) * B, 0.3 + j * 0.1);
        a.koto(t, hz('D5'), 0.6, { long: true }); a.koto(t + 0.5 * B, hz('A5'), 0.5, { bend: true, long: true });
      }
    },
  },

  // 2. 城下：穏やかな琴と篠笛（季節で音階と楽器が少し変わる）
  town: {
    bpm: 66, gain: 2.5, cap: 14,
    tempo: (o) => ({ 夏: 1.15, 冬: 0.85 }[o.season] || 1),
    bar(a, k, t, n) {
      const s = a.o.season || '春', sc = SCALES[s] || SCALES.春, B = a.B;
      const r = a.rnd;
      // うっすらと弦の持続音（D と A の空五度、ときどき色を変える）
      if (n % 2 === 0) {
        const ch = s === '夏' ? 'D5' : [ 'D5', 'D5', s === '秋' ? 'F' : 'Eb', 'D5'][(n >> 1) % 4];
        a.pad(t, ch, 8 * B, 0.3, { v: 0.018, a: 2, r: 2.5, prio: 1 });
        a.bass(t, 'D5', 8 * B, 0.35, { a: 2, r: 2 });
      }
      // 琴の句（二小節ごと）と、笛の答え（次の二小節）
      const phr = (n >> 1) % 2 === 0;
      const dens = s === '冬' ? 0.5 : s === '夏' ? 1.2 : 1;
      if (phr && n % 2 === 0) {
        let pos = 5 + Math.floor(r() * 3); let b = 0;
        const rhythms = [[1, 1, 2], [0.5, 0.5, 1, 2], [1.5, 0.5, 2], [1, 0.5, 0.5, 2], [2, 1, 1]];
        while (b < 7) {
          const rh = rhythms[Math.floor(r() * rhythms.length)];
          for (const d of rh) {
            if (b >= 7.5) break;
            if (r() < 0.9 * Math.min(1, dens + 0.3)) a.koto(t + b * B, deg(sc, pos, 3), 0.55 + r() * 0.2, { bend: r() < 0.12, long: d >= 2 });
            if (s === '夏' && r() < 0.5) a.sham(t + (b + 0.5) * B, deg(sc, pos - 5, 3), 0.4);
            b += d * (s === '冬' ? 1.5 : 1);
            pos += [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)];
            pos = Math.max(2, Math.min(11, pos));
          }
        }
        a.koto(t + 7.5 * B, deg(sc, r() < 0.5 ? 5 : 3, 3), 0.5, { long: true, prio: 2 });
      } else if (!phr && n % 2 === 0) {
        // 篠笛（秋・冬は尺八）がゆったり答える
        const fn = s === '秋' || s === '冬' ? a.shaku : a.fue;
        const base = s === '秋' || s === '冬' ? 4 : 5;
        let pos = 3 + Math.floor(r() * 3), b = 0.5;
        const lens = s === '夏' ? [1, 1, 2, 1.5, 0.5] : [2, 1, 3, 1.5, 0.5, 2];
        while (b < 7) {
          const d = lens[Math.floor(r() * lens.length)];
          const f = deg(sc, pos, base - 1);
          fn(t + b * B, f, Math.min(d, 7.5 - b) * B * 0.95, 0.5, { v: fn === a.fue ? 0.04 : 0.055, grace: fn === a.fue && r() < 0.3 ? deg(sc, pos + 1, base - 1) : 0 });
          b += d;
          pos += [-1, -1, 1, 1, 2, -2][Math.floor(r() * 6)];
          pos = Math.max(0, Math.min(8, pos));
        }
        // 琴が低く支える
        a.koto(t, deg(sc, 0, 3), 0.4, { long: true, prio: 2 }); a.koto(t + 4 * B, deg(sc, 3, 3), 0.35, { long: true, prio: 2 });
      }
      // 季節の飾り：夏は締太鼓、冬は遠い鉦
      if (s === '夏' && n % 2 === 1) for (let j = 0; j < 4; j++) a.shime(t + j * B, j % 2 ? 0.2 : 0.3);
      if (s === '冬' && n % 8 === 3) a.kane(t + B, 0.25);
    },
  },

  // 3. 合戦の前：張りつめた太鼓と低い弦
  prebattle: {
    bpm: 60, gain: 0.7, cap: 14,
    bar(a, k, t, n) {
      const B = a.B, m = n % 8;
      // 低い弦のトレモロ（D の持続。後半は Eb にずれて緊張）
      a.str(t, hz('D2'), 4 * B, 0.55, { trem: 9, solo: false, vib: false, prio: 1, v: 0.06, cut: 520, a: 0.8, r: 0.6 });
      const up = m === 5 || m === 6 ? 'Eb3' : 'D3';
      a.str(t, hz(up), 4 * B, 0.45, { trem: 7, solo: false, vib: false, prio: 1, v: 0.04, cut: 650, a: 1.0, r: 0.8 });
      // 高い弦がかすかに（4小節ごとに膨らむ）
      if (m % 4 === 0) a.str(t, hz('A5'), 8 * B, 0.35, { solo: false, vib: true, prio: 2, v: 0.02, cut: 2400, a: 3, r: 2 });
      // 大太鼓：心臓の音のように「ドン……ドドン」
      const gr = 0.45 + 0.1 * (m / 7) + 0.2 * a.E.intensity;
      a.taiko(t, gr, { big: true }); a.taiko(t + 2.75 * B, gr * 0.45); a.taiko(t + 3 * B, gr * 0.7);
      if (m === 7) { a.taiko(t + 3.25 * B, gr * 0.5); a.taiko(t + 3.5 * B, gr * 0.6); a.taiko(t + 3.75 * B, gr * 0.75); }
      if (a.E.intensity > 0.3) for (let j = 1; j < 4; j++) a.shime(t + j * B, 0.25);
      // 低い金管の呼び交わし
      if (m === 3) a.line(t, seq('D3/1 A3/3'), (tt, f, d) => a.brass(tt, f, d * 0.9, 0.45));
      if (m === 7) a.line(t, seq('D3/1 Eb3/3'), (tt, f, d) => a.brass(tt, f, d * 0.9, 0.5));
      if (m === 2 || m === 6) a.kane(t + 3 * B, 0.2);
      // 十六小節に一度、尺八が遠く
      if (n % 16 === 9) a.line(t, seq('A4/3 Bb4/.5 A4/.5 | G4/1 Eb4/1 D4/2'), (tt, f, d) => a.shaku(tt, f, d * 0.95, 0.4, { v: 0.05, muraiki: tt === t }));
    },
  },

  // 4. 合戦の最中：太鼓と弦の刻み（E.intensity＝戦の激しさで厚みが変わる）
  battle: {
    bpm: 126, gain: 0.4, cap: 18,
    bar(a, k, t, n) { battleBar(a, t, n, a.E.intensity, false); },
  },
  // 戦の山場：刻みの上で主題の B を弦と金管が歌う
  climax: {
    bpm: 126, gain: 0.45, cap: 24,
    bar(a, k, t, n) { battleBar(a, t, n, Math.max(0.85, a.E.intensity), true); },
  },

  // 5. 勝ち：主題の頭を明るく（bVI・bVII・I の凱歌）
  victory: {
    bpm: 84, once: true, len: 5, gain: 0.8, cap: 28, tail: 4,
    bar(a, k, t) {
      const B = a.B;
      const plan = ['A', 'D', 'Bb', 'C', 'D'];
      const mel = bars('r/4 | D5/2 A4/1 D5/1 | F5/2 D5/1 F5/1 | G5/2 E5/1 G5/1 | A5/4');
      a.pad(t, plan[k], k === 4 ? 6 * B : 4 * B, k === 0 ? 0.5 : 0.85, { a: k === 0 ? 2 : 0.3 });
      a.bass(t, plan[k], k === 4 ? 6 * B : 4 * B, 0.85);
      a.line(t, mel[k], (tt, f, d) => { a.brass(tt, f / 2, d * (k === 4 ? 1.5 : 0.92), 0.85); a.str(tt, f, d * (k === 4 ? 1.5 : 0.95), 0.9); });
      if (k === 0) { for (let j = 0; j < 10; j++) a.taiko(t + (1.2 + j * 0.28) * B, 0.25 + j * 0.07); a.kane(t, 0.5); }
      if (k >= 1 && k <= 3) { a.taiko(t, 0.9, { big: true }); a.taiko(t + 2 * B, 0.6); a.taiko(t + 3 * B, 0.5); a.taiko(t + 3.5 * B, 0.6); }
      if (k === 4) {
        a.taiko(t, 1, { big: true }); a.kane(t, 0.8); a.kane(t + 1.5 * B, 0.5);
        [hz('D4'), hz('A4'), hz('D5'), hz('F#5'), hz('A5')].forEach((f, j) => a.koto(t + j * 0.09, f, 0.6, { long: true, prio: 2 }));
      }
    },
  },
  // 負け・討死：尺八の哀しい一節
  defeat: {
    bpm: 50, once: true, len: 4, gain: 1, cap: 12, tail: 4,
    bar(a, k, t) {
      const B = a.B;
      const mel = bars('A4/2.5 Bb4/.5 A4/1 | G4/1.5 Eb4/.5 D4/2 | r/1 F4/1.5 Eb4/.5 D4/1 | D4/4');
      if (k === 0) { a.bass(t, 'Dm', 16 * B, 0.4, { a: 2, r: 3 }); a.taiko(t, 0.35, { big: true }); }
      if (k === 0 || k === 2) a.str(t, hz('A3'), 8 * B, 0.3, { solo: false, prio: 1, v: 0.02, cut: 800, a: 2, r: 2 });
      a.line(t, mel[k], (tt, f, d) => a.shaku(tt, f, d * 0.95, 0.8, { muraiki: k === 0 && tt === t, fall: k === 3 }));
      if (k === 3) { a.koto(t + 2 * B, hz('D3'), 0.5, { long: true }); a.kane(t + 3 * B, 0.15); }
    },
  },
  // 昇進：金管の華やかな一節
  promote: {
    bpm: 96, once: true, len: 3, gain: 0.8, cap: 28, tail: 3,
    bar(a, k, t) {
      const B = a.B;
      if (k === 0) {
        a.line(t, seq('D4/.5 D4/.25 D4/.25 A4/1 D5/2'), (tt, f, d) => a.brass(tt, f, d * 0.9, 0.9));
        a.line(t, seq('r/2 F#4/2'), (tt, f, d) => a.brass(tt, f, d * 0.9, 0.6, { prio: 1 }));
        a.pad(t + 2 * B, 'D', 2 * B, 0.7); a.bass(t, 'D', 4 * B, 0.8);
        a.taiko(t, 0.8, { big: true }); a.taiko(t + 2 * B, 0.7);
      }
      if (k === 1) {
        a.line(t, seq('C5/1 D5/1 F5/1 G5/1'), (tt, f, d) => { a.brass(tt, f, d * 0.92, 0.9); a.str(tt, f * 2, d * 0.95, 0.7); });
        a.pad(t, 'F', 2 * B, 0.7); a.pad(t + 2 * B, 'C', 2 * B, 0.75); a.bass(t, 'F', 2 * B, 0.8); a.bass(t + 2 * B, 'C', 2 * B, 0.8);
        for (let j = 0; j < 4; j++) a.taiko(t + j * B, 0.5 + j * 0.1);
      }
      if (k === 2) {
        for (const [f, v, p] of [['A5', 0.95, 0], ['F#5', 0.7, 1], ['D5', 0.7, 1]]) a.brass(t, hz(f), 4 * B, v, { prio: p });
        a.str(t, hz('D6'), 4 * B, 0.8);
        a.pad(t, 'D', 5 * B, 0.9); a.bass(t, 'D', 5 * B, 0.9);
        a.taiko(t, 1, { big: true }); a.kane(t, 0.8); a.kane(t + B, 0.5);
        [hz('D5'), hz('F#5'), hz('A5'), hz('D6')].forEach((f, j) => a.koto(t + 0.25 * B + j * 0.08, f, 0.55, { long: true, prio: 2 }));
      }
    },
  },

  // 6. 日本地図：主題をゆったりと、尺八と篠笛で
  map: {
    bpm: 60, len: 12, gain: 1.7, cap: 18,
    bar(a, k, t) {
      const B = a.B;
      if (k < 8) {
        const tk = k + 2, ch = THEME_CH[tk];
        a.pad(t, ch, 4 * B, 0.4, { v: 0.022, a: 1.2, r: 1.5 });
        a.bass(t, ch, 4 * B, 0.45, { a: 0.8 });
        a.line(t, THEME[tk], (tt, f, d) => (k < 4 ? a.shaku(tt, f / 2, d * 0.96, 0.6, { v: 0.06 }) : a.fue(tt, f, d * 0.96, 0.5, { v: 0.04 })));
        const p = CH[ch].pad.map((f) => f * 2);
        for (let j = 0; j < 4; j++) a.koto(t + j * B, p[[0, 2, 1, 3][j]], 0.4, { prio: 2 });
        if (k % 4 === 0) a.taiko(t, 0.35, { big: true });
      } else {
        // 間奏：琴の独り言
        const ch = ['Dm', 'Eb', 'Dm', 'A'][k - 8];
        a.pad(t, ch, 4 * B, 0.35, { v: 0.02, a: 1.5, r: 1.5 });
        a.bass(t, ch, 4 * B, 0.4, { a: 0.8 });
        const lines = ['D5/1 Eb5/.5 G5/.5 A5/2', 'Bb5/1.5 A5/.5 G5/1 Eb5/1', 'D5/1 A4/1 D5/2', 'E5/1 C#5/1 A4/2'];
        a.line(t, seq(lines[k - 8]), (tt, f, d) => a.koto(tt, f, 0.6, { long: d > B * 1.5, bend: k === 9 && tt === t }));
        if (k === 11) a.kane(t + 3 * B, 0.2);
      }
    },
  },
};

// 合戦の刻み（climax は主題の B を重ねる）
const BAT_HEAD = bars('D4/2 A3/1 D4/1 | Eb4/3 D4/1 | G4/1.5 F4/.5 D4/2 | E4/2 C#4/2');
const BAT_CH = ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Eb', 'Gm', 'A'];
const CLX_CH = ['Bb', 'Bb', 'F', 'F', 'Gm', 'Gm', 'Eb', 'Eb', 'Bb', 'A', 'Asus', 'A', 'Dm', 'Dm', 'Dm', 'A'];
const CLX_MEL = bars(
  'D6/3 C6/1 | A5/2 C6/1 A5/1 | Bb5/2 A5/1 G5/1 | G5/2 Bb5/1 Eb6/1 | D6/2 C#6/2 | E6/1.5 D6/.5 C#6/2 | D6/4 | r/2 A5/1 C#6/1');
function battleBar(a, t, n, x, clx) {
  const B = a.B;
  let ch;
  if (clx) ch = CLX_CH[n % 16]; else ch = BAT_CH[n % 8];
  const root = CH[ch].bass * (CH[ch].bass < 70 ? 2 : 1);
  // 山場：主題の B（一小節を二小節に伸ばす。旋律を先に置いて、数の上限で削られないように）
  if (clx) {
    const m = n % 16;
    if (m % 2 === 0) a.line(t, CLX_MEL[m >> 1], (tt, f, d) => { a.str(tt, f, d * 0.97, 0.9, { r: 0.4 }); a.brass(tt, f / 2, d * 0.9, 0.75); }, 1, 2);
    if (m === 0 || m === 8) a.kane(t, 0.5);
  }
  // 低い弦の八分の刻み（いつも）
  const oct = [1, 1, 2, 1, 1, 1, 2, 1], acc = [1, 0.55, 0.8, 0.55, 0.95, 0.55, 0.85, 0.65];
  for (let j = 0; j < 8; j++) a.low(t + j * B * 0.5, root * oct[j], B * 0.34, (0.55 + 0.35 * x) * acc[j]);
  // 和太鼓
  a.taiko(t, 0.7 + 0.25 * x, { big: n % 2 === 0 }); a.taiko(t + 2 * B, 0.55 + 0.2 * x);
  if (x > 0.3) { a.taiko(t + 2.5 * B, 0.4 * x + 0.1, { prio: 1 }); a.taiko(t + 3 * B, 0.5 * x + 0.2, { prio: 1 }); }
  if (x > 0.6) { a.taiko(t + 3.5 * B, 0.6 * x, { prio: clx ? 2 : 1 }); a.taiko(t + 3.75 * B, 0.5 * x, { prio: 2 }); }
  // 締太鼓の刻み
  if (x > 0.35 && !clx) for (let j = 0; j < 8; j++) a.shime(t + j * B * 0.5, j % 2 ? 0.25 : 0.4);
  if (x > 0.7) for (let j = 0; j < 4; j++) a.shime(t + (3 + j * 0.25) * B, 0.3 + j * 0.08);
  // 弦の和音（厚み）
  if (x > 0.3 && (clx || n % 2 === 0)) a.pad(t, ch, (clx ? 4 : 8) * B, 0.35 + 0.4 * x, { prio: clx ? 1 : 2, a: 0.4, r: 0.6 });
  // 金管の打ち込み、激しい時は主題の頭
  if (!clx && x > 0.55 && n % 4 === 0) a.brass(t, root * 2, B * 1.2, 0.5 + 0.3 * x, { prio: 1 });
  if (!clx && x > 0.75 && n % 8 >= 4) {
    a.line(t, BAT_HEAD[n % 4], (tt, f, d) => a.brass(tt, f, d * 0.9, 0.7));
  }
  if (x > 0.8 && !clx) { a.kane(t + 1.5 * B, 0.3); a.kane(t + 3.5 * B, 0.3); }
}

export const MUSIC_NAMES = Object.keys(CUES);

// ---------------- 書き出し（確かめ用） ----------------
// renderMusic('title', 62, { season, intensity }) → AudioBuffer
export async function renderMusic(name, sec, o = {}, sampleRate = 44100) {
  const oc = new OfflineAudioContext(2, Math.ceil(sec * sampleRate), sampleRate);
  const out = oc.createGain(); out.gain.value = o.gain ?? 1; out.connect(oc.destination);
  const m = createMusic(oc, out);
  if (o.intensity != null) m.setIntensity(o.intensity);
  m.play(name, { ...o, fadeIn: 0.02 });
  // 強さを途中で変える（[{ at: 秒, x: 強さ }, …]）
  for (const step of o.ramp || []) { m.prerender(step.at); m.setIntensity(step.x); }
  m.prerender(sec);
  const buf = await oc.startRendering();
  return { buf, stats: m.stats() };
}
// AudioBuffer → 16bit の WAV
export function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + len * ch * 2), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let p = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true); p += 2; }
  return ab;
}
