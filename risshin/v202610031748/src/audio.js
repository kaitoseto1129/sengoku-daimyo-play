// WebAudio で合成する効果音（音源ファイルなし）
import { S } from './settings.js';
import { createMusic } from './music.js';

// 音の釣り合いはここで決める。小さい優先度から譲り、危険と下知の枠を残す。
// 音源は効果音48・曲32・使い回す環境音16まで（合わせて96）。
const MIX = {
  hard: 96, sources: 48, events: 24, ambient: 16,
  environment: 0.72, music: 0.85, hoofRumble: 0.55,
  speech: { ambient: 0.22, music: 0.28, background: 0.22, command: 0.65, danger: 0.9 },
  command: { ambient: 0.38, music: 0.45, background: 0.35, seconds: 6.5 },
  danger: { ambient: 0.45, music: 0.55, background: 0.45, seconds: 0.7 },
};
const MIX_KIND = {
  background: { gain: 0.65, priority: 0, cap: 24 },
  battle: { gain: 0.85, priority: 1, cap: 28 },
  soldier: { gain: 0.7, priority: 0, cap: 24 },
  gun: { gain: 0.7, priority: 1, cap: 24, events: 8 },
  bullet: { gain: 1, priority: 3, cap: MIX.sources, events: 4 },
  horse: { gain: 0.65, priority: 0, cap: 24 },
  command: { gain: 1, priority: 2, cap: 40 },
  notice: { gain: 0.9, priority: 2, cap: 40 },
  danger: { gain: 1, priority: 3, cap: MIX.sources },
};
const COMMAND_SOUNDS = new Set(['horagai', 'taiko', 'sig_susume', 'sig_hike', 'sig_atsumare', 'sig_hajime', 'kane', 'jindaiko', 'bell', 'bellRapid', 'fukusho']);
const DANGER_SOUNDS = new Set(['whiz', 'heart', 'parry', 'block', 'guard']);
const NOTICE_SOUNDS = new Set(['ui', 'obj', 'merit', 'neg', 'victory', 'promote', 'back', 'deny']);
const SOLDIER_SOUNDS = new Set(['cry', 'shout', 'toki', 'eiei', 'eshout', 'umeki', 'far', 'siegeDistant']);
const HORSE_SOUNDS = new Set(['gallop', 'hooves', 'hoovesWet', 'hoofBeat', 'neigh', 'snort', 'tramp']);
const GUN_SOUNDS = new Set(['gun', 'gunEcho', 'volley', 'gunScatter', 'bulletHit', 'bulletArmor', 'crack']);
function soundKind(name) {
  if (name === 'whiz') return MIX_KIND.bullet;
  if (busOverride === ambBus && ambBus) return MIX_KIND.background;
  if (DANGER_SOUNDS.has(name)) return MIX_KIND.danger;
  if (COMMAND_SOUNDS.has(name)) return MIX_KIND.command;
  if (NOTICE_SOUNDS.has(name)) return MIX_KIND.notice;
  if (name.startsWith('soldier_') || SOLDIER_SOUNDS.has(name)) return MIX_KIND.soldier;
  if (HORSE_SOUNDS.has(name)) return MIX_KIND.horse;
  if (GUN_SOUNDS.has(name)) return MIX_KIND.gun;
  return MIX_KIND.battle;
}
// 出口の音量だけを動かす。24組の出口を使い回し、毎コマは作らない。
const mixSlots = Array.from({ length: MIX.events }, () => ({ node: null, wet: null, muted: false, until: 0, kind: MIX_KIND.background }));
let mixCurrent = null, speechUntil = 0, commandUntil = 0, dangerUntil = 0;
function mixLevel(kind, now = ctx.currentTime) {
  let k = kind.gain;
  if (now < speechUntil) k *= kind.priority >= 3 ? MIX.speech.danger : kind.priority >= 2 ? MIX.speech.command : MIX.speech.background;
  if (kind.priority < 2) {
    if (now < commandUntil) k *= MIX.command.background;
    if (now < dangerUntil) k *= MIX.danger.background;
  }
  return k;
}
function refreshMix() {
  const now = ctx.currentTime;
  const speechEnd = Math.max(now, speechUntil), commandEnd = Math.max(now, commandUntil), dangerEnd = Math.max(now, dangerUntil);
  const first = Math.min(speechEnd, commandEnd, dangerEnd), last = Math.max(speechEnd, commandEnd, dangerEnd);
  const middle = speechEnd + commandEnd + dangerEnd - first - last;
  for (const slot of mixSlots) {
    if (!slot.node || slot.muted || slot.until <= now) continue;
    for (let i = 0; i < 2; i++) {
      const g = (i ? slot.wet : slot.node).gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.setTargetAtTime(mixLevel(slot.kind), now, 0.025);
      // 期限ごとに戻す。毎コマの見張りや予約用の配列は作らない。
      for (let j = 0; j < 3; j++) {
        const t = j === 0 ? first : j === 1 ? middle : last;
        if (t > now) g.setTargetAtTime(mixLevel(slot.kind, t), t, 0.25);
      }
    }
  }
}
function focusMix(kind, sec) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === 'speech') speechUntil = Math.max(speechUntil, now + sec);
  else if (kind === 'command') commandUntil = Math.max(commandUntil, now + sec);
  else dangerUntil = Math.max(dangerUntil, now + sec);
  const policy = MIX[kind];
  pump([[ambDuck, policy.ambient], [musicDuck, policy.music]], sec);
  refreshMix();
}
function mixed(kind, fn) {
  if (mixCurrent) return fn(); // 一つの音の中の重ね音は同じ出口と優先度にそろえる
  const now = ctx.currentTime;
  let slot = null, count = 0, same = 0;
  for (const v of mixSlots) { if (v.until > now) { count++; if (v.kind === kind) same++; } else if (!slot) slot = v; }
  const cap = kind.priority < 2 ? MIX.events - 8 : kind.priority === 2 ? MIX.events - 4 : MIX.events;
  live();
  if (!slot || count >= cap || same >= (kind.events ?? MIX.events) || ends.length >= kind.cap) { dropped++; return; }
  if (!slot.node) { slot.node = ctx.createGain(); slot.wet = ctx.createGain(); if (revIn) slot.wet.connect(revIn); }
  else slot.node.disconnect();
  const prev = out;
  slot.node.connect(dest()); slot.muted = false; slot.kind = kind; slot.until = now + 0.1;
  slot.node.gain.cancelScheduledValues(now); slot.node.gain.setValueAtTime(mixLevel(kind), now);
  slot.wet.gain.cancelScheduledValues(now); slot.wet.gain.setValueAtTime(mixLevel(kind), now);
  out = slot.node; mixCurrent = slot;
  refreshMix();
  try { fn(); } finally { out = prev; mixCurrent = null; }
}

let ctx = null;
let master = null;
let comp = null;
let noiseBuf = null;
let rainNode = null;
let crowdNode = null;
let windNode = null;
let riverNode = null;
let marchNode = null;
let cicadaNode = null, frogT = 2, flapT = 1, rainLow = null;
let chirpT = 3;
let heartT = 0;
let sfxBus = null, ambBus = null, musicBus = null;
let sfxDuck = null, ambDuck = null, musicDuck = null; // 混ぜの引き下げ（音量の設定は各 Bus のまま。こちらは一時の下げだけ）
let irBuf = null;
let droneT = 0, beatT = 0, beatN = 0;
let townTimer = null;
let music = null, musicWant = null; // 楽の音（music.js）と、音が出せる前に頼まれた曲
let muffle = null, deafUntil = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ctx.createGain();
  master.gain.value = 0.7 * S.volume;
  // 590：たくさん重なっても割れないよう、最後に圧縮器を通す
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
  master.connect(comp); comp.connect(ctx.destination);
  // 効果音・環境音・楽の音で音量を分ける
  sfxBus = ctx.createGain(); sfxBus.gain.value = S.volSfx;
  // 耳の遠のき：すぐ近くで鉄砲が鳴ると、しばらく戦の音がこもる（deafen）。ふだんは素通し
  muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.4;
  sfxDuck = ctx.createGain(); ambDuck = ctx.createGain(); musicDuck = ctx.createGain();
  sfxBus.connect(muffle); muffle.connect(sfxDuck); sfxDuck.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = S.volAmb * MIX.environment; ambBus.connect(ambDuck); ambDuck.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = S.volMusic * MIX.music; musicBus.connect(musicDuck); musicDuck.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // 楽の音：同時に鳴る数を、効果音の見張りにも数えさせる
  music = createMusic(ctx, musicBus, {
    mark: (delay, dur, w) => { const n = performance.now() + delay * 1000; mIv.push([n, n + dur * 1000 + 60, w]); live(); },
    pressure: () => { live(); return ends.length * 2; },
  });
  if (musicWant) { const [n, o] = musicWant; musicWant = null; playMusic(n, o); }
  // 残響：野の広がり。耳の遠のき（muffle）の前に入れて、こもる時は残響も一緒にこもる
  try {
    irBuf = makeIR();
    const rev = ctx.createConvolver(); rev.buffer = irBuf;
    const rOut = ctx.createGain(); rOut.gain.value = 0.42;
    revIn = ctx.createGain(); revIn.connect(rev); rev.connect(rOut); rOut.connect(muffle);
  } catch (e) { revIn = null; }
  // 本物らしい音の元を、少し後から一つずつ焼く
  setTimeout(bakeAll, 400);
}

// ---------------- 楽の音（曲） ----------------
// playMusic('title') のように呼ぶ。名前：title・town・prebattle・battle・climax・victory・defeat・promote・map
// o：{ season：'春'|'夏'|'秋'|'冬'（town）, then：一度きりの曲のあとに続ける曲, delay：秒, fadeIn, fadeOut }
// 同じ曲をもう一度呼んでも頭からにはならない（季節などの設定だけ変わる）。null で止める
export function playMusic(name, o = {}) {
  if (name === 'town' && !S.townMusic) name = null;
  if (!music) { musicWant = name ? [name, o] : null; return; }
  if (!name) { stopMusic(o.fadeOut ?? 2); return; }
  if (WAR_SCORES[name]) { music.stop(0.7); playWarMusic(name, o); return; }
  stopWarMusic(o.fadeOut ?? 1);
  music.play(name, o);
}
export function stopMusic(fade = 2) { musicWant = null; stopWarMusic(fade); if (music) music.stop(fade); }
// 楽の音の厚み。戦の節は ambience から静か・寄せ・激しいを選ぶ。
export function setMusicIntensity(x) { if (music) music.setIntensity(x); }
export function musicNow() { return warMusic.name || (music ? music.now() : (musicWant ? musicWant[0] : null)); }

// 戦の短い節。太鼓・笛・法螺だけにし、節の後には長い休みを置く。
// 譜面：[秒、楽器（0＝太鼓・1＝笛・2＝法螺）、高さ、長さ、強さ]。
const WAR_SCORES = {
  prebattle: { span: 14, notes: [[0, 1, 587.3, 1.1, 0.018], [1.5, 1, 440, 0.9, 0.016], [3, 0, 68, 0.6, 0.06]] },
  battle: { span: 10, notes: [[0, 0, 76, 0.55, 0.08], [0.8, 0, 76, 0.45, 0.06], [1.6, 1, 587.3, 0.6, 0.02], [2.4, 1, 659.3, 0.65, 0.018], [3.3, 2, 146.8, 1.1, 0.016]] },
  climax: { span: 8, notes: [[0, 0, 80, 0.55, 0.09], [0.55, 0, 80, 0.4, 0.06], [1.1, 0, 80, 0.5, 0.075], [1.7, 1, 587.3, 0.45, 0.022], [2.25, 1, 784, 0.5, 0.02], [2.9, 2, 196, 1.1, 0.018], [4.1, 0, 68, 0.65, 0.08]] },
  victory: { span: 6, once: true, notes: [[0, 0, 76, 0.6, 0.08], [0.7, 1, 587.3, 0.6, 0.02], [1.5, 1, 784, 0.65, 0.021], [2.3, 1, 880, 1.1, 0.018], [3.5, 2, 196, 1.2, 0.016]] },
  defeat: { span: 6, once: true, notes: [[0, 0, 58, 0.8, 0.055], [1, 1, 587.3, 0.8, 0.015], [2, 1, 440, 0.9, 0.014], [3.2, 2, 146.8, 1.2, 0.012]] },
};
const warMusic = { name: null, bus: null, timer: null, next: 0, index: 0, change: null, hold: 0 };
function stopWarMusic(fade = 1) {
  if (warMusic.timer !== null) clearInterval(warMusic.timer);
  warMusic.timer = null; warMusic.name = null; warMusic.change = null; warMusic.hold = 0;
  if (warMusic.bus) {
    const g = warMusic.bus.gain, now = ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, Math.max(0.02, fade / 3));
  }
}
function playWarMusic(name, o) {
  if (warMusic.name === name && !o.restart) return;
  const first = !warMusic.name;
  stopWarMusic(o.fadeOut ?? 0.6);
  // 出口は全段で使い回す。曲の音量と、台詞・下知の時の引き下げに従う。
  if (!warMusic.bus) { warMusic.bus = ctx.createGain(); warMusic.bus.gain.value = 0; warMusic.bus.connect(musicBus); }
  const now = ctx.currentTime, delay = o.delay ?? (first && name === 'prebattle' ? 6 : 0.8);
  warMusic.name = name; warMusic.index = 0; warMusic.next = now + Math.max(0.2, delay);
  warMusic.bus.gain.setTargetAtTime(1, warMusic.next, Math.max(0.05, (o.fadeIn ?? 0.8) / 3));
  warMusic.timer = setInterval(warMusicTick, 120);
}
function warMusicTick() {
  if (!warMusic.name || ctx.state !== 'running') return;
  const score = WAR_SCORES[warMusic.name], now = ctx.currentTime;
  // 裏に回っていた間の拍をまとめて鳴らさない。
  if (warMusic.next + score.span < now) { warMusic.next = now + 0.2; warMusic.index = 0; }
  while (warMusic.index < score.notes.length) {
    const note = score.notes[warMusic.index], t = warMusic.next + note[0];
    if (t > now + 0.15) return;
    warMusic.index++;
    if (t >= now - 0.12 && S.volume > 0 && S.volMusic > 0) warNote(note, Math.max(now, t));
  }
  if (score.once) { clearInterval(warMusic.timer); warMusic.timer = null; return; }
  warMusic.next += score.span; warMusic.index = 0;
}
function warNote(note, t) {
  const kind = note[1], f = note[2], dur = note[3], vol = note[4];
  const count = kind === 0 ? 2 : 1;
  // 戦の効果音に枠を譲る。音源を作るのは、節の音を鳴らす時だけ。
  if (live() + count > HARD || !room(count) || ends.length > 24) return;
  const src = ctx.createOscillator(), g = ctx.createGain();
  src.type = kind === 2 ? 'triangle' : 'sine';
  src.frequency.setValueAtTime(kind === 0 ? f * 1.6 : f * 0.985, t);
  src.frequency.exponentialRampToValueAtTime(kind === 0 ? f * 0.65 : f, t + (kind === 0 ? dur : 0.12));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (kind === 0 ? 0.008 : 0.09));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g); g.connect(warMusic.bus); src.start(t); src.stop(t + dur + 0.03);
  src.onended = () => { src.disconnect(); g.disconnect(); };
  mark(t - ctx.currentTime + dur + 0.03);
  if (kind === 0) {
    const prev = out; out = warMusic.bus;
    try { noise(0.08, 'lowpass', 520, 0.5, vol * 0.25, t - ctx.currentTime); } finally { out = prev; }
  }
}
// 上がる時は二秒、下がる時は七秒待ち、境目で曲を行き来させない。
function warMusicMood(dt, o) {
  const name = warMusic.name;
  if (!name || WAR_SCORES[name].once || quiet || o.aftermath) return;
  const heat = Math.max(o.heat || 0, crowdLv);
  const rush = Math.max(o.march || 0, scene.approach || 0);
  let target = name;
  if (o.climax || heat > 0.7) target = 'climax';
  else if (name === 'climax' && heat > 0.48) target = 'climax';
  else if (heat > 0.25 || rush > 0.2) target = 'battle';
  else if (name === 'battle' && (heat > 0.12 || rush > 0.1)) target = 'battle';
  else target = 'prebattle';
  if (target === name) { warMusic.change = null; warMusic.hold = 0; return; }
  if (warMusic.change !== target) { warMusic.change = target; warMusic.hold = 0; }
  warMusic.hold += dt;
  const rising = target === 'climax' || (target === 'battle' && name === 'prebattle');
  if (warMusic.hold >= (rising ? 2 : 7)) playMusic(target);
}

export function setVolume(v) {
  if (!master) return;
  master.gain.setTargetAtTime(0.7 * v, ctx.currentTime, 0.05);
  sfxBus.gain.setTargetAtTime(S.volSfx, ctx.currentTime, 0.05);
  ambBus.gain.setTargetAtTime(S.volAmb * MIX.environment, ctx.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(S.volMusic * MIX.music, ctx.currentTime, 0.05);
}
// ウィンドウが裏に回ったら音を落とす
export function duck(on) { if (master) master.gain.setTargetAtTime(on ? 0 : 0.7 * S.volume, ctx.currentTime, 0.2); }
// 混ぜの一時の引き下げ：[[node, 下げた倍率], …] を sec 秒。重なった時は深い方・長い方を守る
function pump(sets, sec) {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const [n, k0] of sets) {
    if (!n || k0 >= 1) continue;
    const st = n._d || (n._d = { u: 0, k: 1 });
    const k = now < st.u ? Math.min(k0, st.k) : k0;
    st.k = k; st.u = Math.max(st.u, now + sec);
    n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(n.gain.value, now);
    n.gain.setTargetAtTime(k, now, 0.05); n.gain.setTargetAtTime(1, st.u, 0.45);
  }
}
// 主の台詞：言っている間、戦のざわめき・曲・効果音を少し下げて、声を前に出す
export function speaking(sec = 2.5) { focusMix('speech', Math.max(0.5, Math.min(30, sec))); }

// ---------------- 590：同時に鳴る音の数の見張り ----------------
// 鳴り終わる時刻を覚えておき、上限を超えそうなら弱い音から鳴らさない
const CAP = MIX_KIND.battle.cap;      // 新しい効果音を鳴らし始めてよい数
const HARD = MIX.hard;     // 曲と環境の輪に残した枠も含めた上限
let ends = [];
let mIv = []; // 楽の音の予約：[始まり, 終わり, 重さ]（performance.now の時刻）
let peak = 0, dropped = 0;
// 環境の短い音は予約も含め16音まで。使い回す風・川などの輪は種類ごとに一つ。
const AMB_CAP = MIX.ambient;
const ambEnds = new Float64Array(AMB_CAP);
function ambLive() {
  const now = performance.now();
  let n = 0;
  for (let i = 0; i < AMB_CAP; i++) if (ambEnds[i] > now) n++;
  return n;
}
function live() {
  const n = performance.now();
  for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= n) ends.splice(i, 1);
  let m = 0;
  if (mIv.length) { for (let i = mIv.length - 1; i >= 0; i--) if (mIv[i][1] <= n) mIv.splice(i, 1); for (const v of mIv) if (v[0] <= n) m += v[2]; }
  const k = ends.length + m; if (k > peak) peak = k;
  return k;
}
function mark(dur) {
  const now = performance.now(), end = now + dur * 1000 + 60;
  ends.push(end);
  if (mixCurrent) mixCurrent.until = Math.max(mixCurrent.until, ctx.currentTime + dur + curLag + 0.1);
  spatialUntil = Math.max(spatialUntil, ctx.currentTime + dur);
  if (busOverride === ambBus && ambBus) {
    for (let i = 0; i < AMB_CAP; i++) if (ambEnds[i] <= now) { ambEnds[i] = end; break; }
  }
  if (ends.length > peak) peak = ends.length;
}
function room(k = 1) {
  live();
  const ambient = busOverride === ambBus && ambBus;
  const cap = ambient ? AMB_CAP : mixCurrent ? mixCurrent.kind.cap : CAP;
  if (ends.length + k > Math.min(MIX.sources, cap) || (ambient && ambLive() + k > AMB_CAP)) { dropped++; return false; }
  return true;
}
export function audioStats() { return { live: ctx ? live() : 0, peak, dropped, cap: CAP, hard: HARD, sourceCap: MIX.sources, eventCap: MIX.events, ambient: ambLive(), ambientCap: AMB_CAP, baked: Object.keys(BANK).length + '/' + RECIPES.length, music: music ? music.stats() : null }; }
// 鳴らさなかった時に返す空の入れ物（呼んだ側が周波数を動かしても困らないように）
const NOP = { setTargetAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setValueAtTime() {} };
const STUB = { frequency: NOP, gain: NOP };
function full() { return !room(); }
// 同じ音を一瞬にたくさん鳴らさない（0.06 秒の内に 3 つまで）
const rate = {};

// 効果音の出口（左右の定位を付けられる）
let out = null;
let busOverride = null;
function dest() { return out || busOverride || sfxBus || master; }
function onBus(bus, fn) { busOverride = bus; try { fn(); } finally { busOverride = null; } }
// 耳の遠のき（k は 0〜1）：すぐ近くの一斉射撃・自分の鉄砲で、戦の音が一瞬こもり、細い耳鳴りが残って、二、三秒で戻る
// 楽の音と環境音はそのまま（効果音だけ）。続けて鳴っても重ねすぎない
export function deafen(k = 0.5) {
  if (!ctx || !muffle || S.volume <= 0) return;
  const now = ctx.currentTime;
  if (!room() || now < deafUntil - 1.2) return;
  k = Math.max(0.1, Math.min(1, k));
  const f = muffle.frequency;
  f.cancelScheduledValues(now);
  f.setValueAtTime(Math.max(f.value, 300), now);
  f.exponentialRampToValueAtTime(Math.max(350, 2400 * (1 - k) + 350), now + 0.03);
  f.setTargetAtTime(20000, now + 0.25 + k * 0.6, 0.55 + k * 0.5);
  deafUntil = now + 1.5 + k * 1.5;
  // 耳鳴り（高く細い音が、ゆっくり消える）
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 3600 + Math.random() * 700;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.012 * k, now + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6 + k * 1.6);
  o.connect(g); g.connect(master); o.start(now); o.stop(now + 3.4); mark(3.4);
}

// 倒れた時：戦場の音がゆっくり遠のく（高い音から消えていく）。次の戦の始め（silence）で元に戻す
export function fadeAway(sec = 3) {
  if (!ctx || !muffle) return;
  const now = ctx.currentTime;
  muffle.frequency.cancelScheduledValues(now);
  muffle.frequency.setValueAtTime(Math.max(muffle.frequency.value, 400), now);
  muffle.frequency.exponentialRampToValueAtTime(380, now + sec);
  deafUntil = now + 99;
}

// 映画の「無音の間」：大事な瞬間（名乗り・大将の討死）の間だけ、曲を遠くに沈め、戦場の音だけにする
export function hush(sec = 2.5) {
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(S.volMusic * 0.12, now, 0.25);
  musicBus.gain.setTargetAtTime(S.volMusic * MIX.music, now + sec, 1.2);
}

// 次の withPan の音の出どころまでの遠さ（m）。遠い音は、音の速さ（毎秒 343m）の分だけ遅れて届き、高い音が削れてこもる
// （鉄砲の煙が見えてから「どん」が来る。battle.js の panAt が army.play の音ごとに決める）
let farD = 0, farBack = 0;
// back：その音が後ろ（0 前〜1 真後ろ）。後ろの音は耳の形で高い音が少しこもる（背後の危なさが耳で分かる）
export function farNext(d, back = 0) { farD = d || 0; farBack = back; }
export function withPan(pan, fn) {
  const d = farD, bk = farBack; farD = 0; farBack = 0;
  const far = ctx && (d > 18 || bk > 0.3);
  const pd = curD, pf = inFar, pl = curLag, prev = out, end = spatialUntil; curD = d; curLag = 0;
  if (!ctx || ((!ctx.createStereoPanner || !pan) && !far)) { try { fn(); } finally { curD = pd; curLag = pl; } return; }
  const nodes = [];
  let last = sfxBus || master;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(last); last = p; nodes.push(p);
  }
  let lag = 0;
  if (far) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = Math.max(520, Math.min(11000 / (1 + d / 55), bk > 0.3 ? 9000 - bk * 5500 : 20000));
    lp.connect(last); last = lp; nodes.push(lp);
    lag = d > 18 ? Math.min(2.5, d / 343) : 0;
    // 遠いほど、直の音より野の響きの方が勝つ（遅れて届いた後で残響へ送る）
    if (revIn && d > 18) { const wg = ctx.createGain(); wg.gain.value = Math.min(0.65, 0.12 + d / 550); lp.connect(wg); wg.connect(revIn); nodes.push(wg); }
    if (lag > 0) { const dl = ctx.createDelay(3); dl.delayTime.value = lag; dl.connect(last); last = dl; nodes.push(dl); }
    // 遠い大きな音（100m より先）は、少し遅れて山や林から低いこだまが返る
    if (d > 100) {
      const head = ctx.createGain(); head.connect(last);
      const ed = ctx.createDelay(4); ed.delayTime.value = Math.min(3.5, lag + 0.55 + Math.random() * 0.5);
      const eg = ctx.createGain(); eg.gain.value = 0.28;
      const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 650;
      head.connect(ed); ed.connect(eg); eg.connect(ef); ef.connect(sfxBus || master);
      nodes.push(head, ed, eg, ef); last = head; lag += 1.2;
    }
  }
  out = last; inFar = far; curLag = lag; spatialUntil = ctx.currentTime;
  let keep = 3.2;
  try { fn(); } finally {
    keep = Math.max(keep, spatialUntil - ctx.currentTime + 0.15);
    out = prev; curD = pd; inFar = pf; curLag = pl; spatialUntil = Math.max(end, spatialUntil);
    setTimeout(() => { for (const n of nodes) n.disconnect(); }, (keep + lag) * 1000);
  }
}
// 遠くの音：高い音を削ってこもらせる（withPan の内でも使える）
function through(freq, fn, keep = 4) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = 0.5;
  const prev = out;
  lp.connect(prev || busOverride || sfxBus || master);
  out = lp;
  try { fn(); } finally { out = prev; }
  setTimeout(() => lp.disconnect(), keep * 1000);
}

function noise(dur, type, freq, q, vol, t0 = 0) {
  if (full()) return STUB;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime + t0;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest());
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  mark(t0 + dur);
  return f;
}

function tone(type, f0, f1, dur, vol, t0 = 0) {
  if (full()) return STUB;
  const o = ctx.createOscillator();
  o.type = type;
  const t = ctx.currentTime + t0;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest());
  o.start(t); o.stop(t + dur + 0.05);
  mark(t0 + dur);
  return o;
}

// ---------------- 音の蔵：本物らしい音の元を、はじめに一度だけ焼いておく ----------------
// OfflineAudioContext で組んだ音を一本の音（AudioBuffer）に焼き、鳴らす時は BufferSource と Gain だけで済ませる（軽い）
// 一つの音に幾通りか焼いて、鳴らすたびに選び、高さも少し揺らす（同じ音の繰り返しに聞こえないように）
// 焼けるまで（はじめの一、二秒）と、焼けない古い端末では、sfx の中の合成の音がそのまま鳴る
const BANK = {};
let revIn = null;              // 残響（野の広がり・山のこだま）への送り口
let curD = 0, inFar = false, curLag = 0, spatialUntil = 0;   // 音の遠さ・遅れと、向きを付けた音が終わる時刻
const has = (k) => !!(BANK[k] && BANK[k].length);
// 焼いた音を鳴らす。o：{ t0 遅れ, wet 残響へ送る量, jit 高さの揺らぎ, rate, to 出口 }。鳴らせば true
function play(k, vol, o = {}) {
  if (!ctx || !has(k) || full()) return false;
  const b = BANK[k], buf = b[(Math.random() * b.length) | 0];
  const t0 = o.t0 || 0, t = ctx.currentTime + t0;
  const r = o.rate || 1 + (Math.random() - 0.5) * (o.jit ?? 0.08);
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = r;
  const g = ctx.createGain(); g.gain.value = vol * (0.86 + Math.random() * 0.28);
  s.connect(g); g.connect(o.to || dest());
  // 近い音は、そのまま残響へも送る（遠い音は withPan が遅れの後で送る）
  if (o.wet && revIn && !inFar) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(mixCurrent ? mixCurrent.wet : revIn); }
  s.start(t);
  mark(t0 + buf.duration / r);
  return true;
}
// 残響の響き（野戦の広がり）：早い返り（柵・木・地面）のあとに、だんだん高い音が削れる長い尾
function makeIR() {
  const sr = ctx.sampleRate, len = Math.floor(sr * 2.3);
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * (0.8 - 0.72 * Math.min(1, t / 0.9));
      d[i] = lp * Math.exp(-t * 3.2) * Math.min(1, t / 0.015);
    }
    for (const [ms, a] of [[19, 0.45], [37, 0.32], [61, 0.26], [98, 0.2], [151, 0.14], [230, 0.09]]) {
      const j = Math.floor(sr * (ms + c * 5 + Math.random() * 7) / 1000);
      d[j] += a * (Math.random() < 0.5 ? -1 : 1);
    }
    // 林と山の遅い返り：0.3〜0.9 秒に、こもった小さな返りがばらばらと
    for (let k = 0; k < 6; k++) {
      const j0 = Math.floor(sr * (0.3 + Math.random() * 0.6)), n = Math.floor(sr * 0.08), a = 0.05 + Math.random() * 0.05;
      let q = 0;
      for (let i = 0; i < n && j0 + i < len; i++) { q += (Math.random() * 2 - 1 - q) * 0.08; d[j0 + i] += q * a * 6 * Math.exp(-i / (n * 0.35)); }
    }
  }
  return b;
}

// --- 焼き場（OfflineAudioContext の中で組む道具） ---
let OC = null, OD = null;
const R = () => Math.random();
function envG(g, t, a, dur, att = 0.001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(a, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + dur);
}
// 雑音の一打ち（返すのは濾波器。周波数を動かせる）
function bN(t, dur, type, f, q, a, att = 0.001, to = OD) {
  const s = OC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = OC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = OC.createGain(); envG(g, t, a, dur, att);
  s.connect(fl); fl.connect(g); g.connect(to);
  s.start(t, R() * 1.8); s.stop(t + att + dur + 0.02);
  return fl;
}
// 音叉のような一音（f0 から f1 へ）
function bT(type, t, f0, f1, dur, a, att = 0.001, to = OD) {
  const o = OC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + att + dur);
  const g = OC.createGain(); envG(g, t, a, dur, att);
  o.connect(g); g.connect(to);
  o.start(t); o.stop(t + att + dur + 0.02);
  return o;
}
// 金物・木の響き：倍音が整数倍でない音を重ねる（打ち合う鉄・槍の柄）
function ring(t, f, ratios, amps, decs, a) {
  for (let i = 0; i < ratios.length; i++) bT('sine', t, f * ratios[i] * (1 + (R() - 0.5) * 0.01), f * ratios[i], decs[i], a * amps[i], 0.0005);
}
const steel = (t, f, a, len = 1) => ring(t, f, [1, 1.51, 2.43, 3.6, 4.93, 6.4], [1, 0.7, 0.55, 0.4, 0.28, 0.18], [0.9, 0.62, 0.42, 0.3, 0.2, 0.13].map((d) => d * len), a);
const shaft = (t, f, a) => ring(t, f, [1, 2.76, 5.4], [1, 0.5, 0.25], [0.1, 0.05, 0.03], a);
// 蹄の一打ち：土を打つ重さ・蹄の硬さ・跳ねる土（wet なら泥水）
function hoofAt(t, a, wet = false) {
  bN(t, 0.06, 'lowpass', 220 + R() * 140, 1, a);
  bT('sine', t, 120, 55, 0.07, a * 0.6);
  bN(t + 0.002, 0.012, 'bandpass', 1300 + R() * 700, 2, a * 0.4);
  bN(t + 0.01, 0.1, 'highpass', 2600, 0.7, a * 0.1, 0.005);
  if (wet) bN(t + 0.015, 0.16, 'bandpass', 900 + R() * 500, 1.5, a * 0.5, 0.006);
}
// 一人の声（大勢の鬨の声を焼く時に使う）：口の形は「お」から vow2 へ
function bVoice(t, f0, len, a, vow2 = 'o', vow1 = 'o') {
  const o = OC.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 0.9, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.12, t + len * 0.35);
  o.frequency.linearRampToValueAtTime(f0 * 0.88, t + len);
  const v = OC.createOscillator(); v.frequency.value = 4.5 + R() * 2.5;
  const vg = OC.createGain(); vg.gain.value = f0 * 0.03; v.connect(vg); vg.connect(o.frequency);
  // 揺れ（喉の震えのむら）：ゆっくりの揺らぎを重ねて、機械のまっすぐな高さを崩す
  const j = OC.createOscillator(); j.frequency.value = 1.1 + R() * 2.2;
  const jg = OC.createGain(); jg.gain.value = f0 * (0.02 + R() * 0.02); j.connect(jg); jg.connect(o.frequency);
  const fm = 0.9 + R() * 0.2;
  const f1 = OC.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.value = VOW[vow1][0] * fm;
  const f2 = OC.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7; f2.frequency.value = VOW[vow1][1] * fm;
  // 叫ぶ息のかすれ：雑音も同じ口の形に通す
  const ns = OC.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
  const ng = OC.createGain(); ng.gain.value = 0.35 + R() * 0.4; ns.connect(ng); ng.connect(f1); ng.connect(f2);
  if (vow2 !== vow1) { f1.frequency.setTargetAtTime(VOW[vow2][0] * fm, t + len * 0.5, 0.05); f2.frequency.setTargetAtTime(VOW[vow2][1] * fm, t + len * 0.5, 0.05); }
  const g2 = OC.createGain(); g2.gain.value = 0.5;
  const e = OC.createGain();
  e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(a, t + 0.12 + R() * 0.25);
  e.gain.setValueAtTime(a, t + len * 0.7); e.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f1); o.connect(f2); f2.connect(g2); f1.connect(e); g2.connect(e); e.connect(OD);
  o.start(t); v.start(t); j.start(t); ns.start(t, R() * 1.5);
  for (const n of [o, v, j, ns]) n.stop(t + len + 0.05);
}
// 一通り焼く（n 通り）。焼けた音は山を 0.9 にそろえる
function bake(k, dur, n, build, opt = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const oc = new OAC(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    OC = oc; OD = oc.destination;
    try { build(i); } finally { OC = null; OD = null; }
    jobs.push(new Promise((res) => { oc.oncomplete = (e) => res(e.renderedBuffer); const p = oc.startRendering(); if (p && p.then) p.then(res); }).then((buf) => {
      const d = buf.getChannelData(0); let m = 0;
      for (let j = 0; j < d.length; j++) { const x = Math.abs(d[j]); if (x > m) m = x; }
      if (m > 0) { const s = 0.9 / m; for (let j = 0; j < d.length; j++) d[j] *= s; }
      // 繰り返して流す音：終わりの x 秒を頭に重ねて継ぎ目を消す（長さは x 秒短くなる）
      if (opt.loop) {
        const x = Math.floor(buf.sampleRate * opt.loop), L = d.length - x;
        const nb = ctx.createBuffer(1, L, buf.sampleRate), o = nb.getChannelData(0);
        for (let j = 0; j < L; j++) o[j] = d[j];
        for (let j = 0; j < x; j++) { const u = j / x; o[j] = d[j] * Math.sin(u * Math.PI / 2) + d[L + j] * Math.cos(u * Math.PI / 2); }
        return nb;
      }
      return buf;
    }));
  }
  return Promise.all(jobs).then((b) => { BANK[k] = b; });
}
// 焼く物の表。[名, 長さ(秒), 幾通り, 組み方]
const RECIPES = [
  // 鉄砲（近く）：乾いた破裂 → 胴に来る低い衝撃 → 煙のように尾を引く轟き。近くの柵や林から短い返り
  ['gunNear', 2.4, 4, () => {
    bN(0, 0.012, 'highpass', 2200 + R() * 800, 0.7, 1, 0.0004);
    bN(0.001, 0.08 + R() * 0.03, 'lowpass', 3000 + R() * 800, 0.7, 0.85, 0.0006);
    bT('sine', 0, 105 + R() * 20, 36, 0.32, 0.9, 0.002);
    bN(0.004, 0.45, 'lowpass', 380 + R() * 120, 0.6, 0.55, 0.004);
    bN(0.05, 1.5, 'lowpass', 200 + R() * 60, 0.5, 0.2, 0.06);
    bN(0.08 + R() * 0.06, 0.22, 'lowpass', 1300, 0.6, 0.16, 0.004);
    // 山と林からの返り：少し遅れて、こもった「どん」が二度
    const e = 0.45 + R() * 0.4;
    bN(e, 0.45, 'lowpass', 480 + R() * 150, 0.6, 0.13, 0.02);
    bN(e + 0.3 + R() * 0.35, 0.55, 'lowpass', 340, 0.6, 0.07, 0.04);
  }],
  // 鉄砲（遠く）：尖りが消え、こもった「どおん」が野に転がって長く残る
  ['gunFar', 3, 2, () => {
    bN(0, 0.25, 'lowpass', 650 + R() * 150, 0.6, 0.9, 0.007);
    bT('sine', 0, 72, 32, 0.6, 0.8, 0.01);
    for (let j = 0; j < 5; j++) bN(0.12 + j * 0.34 + R() * 0.2, 0.9, 'lowpass', 240 + R() * 120, 0.6, 0.38 * (1 - j / 6), 0.07);
  }],
  // 一斉射（近く）：十四挺がほぼ揃って破裂し、一つの大きな轟きになって残る
  ['volley', 4.4, 3, () => {
    for (let j = 0; j < 14; j++) {
      const t = Math.pow(R(), 1.4) * 0.12, a = 0.55 + R() * 0.45;
      bN(t, 0.01, 'highpass', 2200 + R() * 900, 0.7, a, 0.0004);
      bN(t, 0.08, 'lowpass', 2600 + R() * 800, 0.7, 0.75 * a, 0.0006);
      bT('sine', t, 95 + R() * 25, 36, 0.35, 0.45 * a, 0.002);
    }
    bN(0.02, 0.7, 'lowpass', 420, 0.6, 0.8, 0.02);
    bN(0.1, 3.2, 'lowpass', 230, 0.5, 0.5, 0.15);
    // 向こうの山へ当たって返る一斉射の轟き（ばらけて、こもって）
    for (let j = 0; j < 5; j++) bN(1.0 + R() * 0.9, 0.7, 'lowpass', 300 + R() * 200, 0.6, 0.12 + R() * 0.08, 0.05);
  }],
  // 一斉射（遠く）：遠雷のような、こもった轟きの連なり
  ['volleyFar', 4, 2, () => {
    for (let j = 0; j < 14; j++) { const t = Math.pow(R(), 1.3) * 0.16; bN(t, 0.3, 'lowpass', 550 + R() * 250, 0.6, 0.45 + R() * 0.4, 0.008); }
    bT('sine', 0.05, 70, 30, 0.9, 0.7, 0.02);
    for (let j = 0; j < 6; j++) bN(0.3 + j * 0.45 + R() * 0.2, 1.1, 'lowpass', 220 + R() * 100, 0.6, 0.45 * (1 - j / 7), 0.1);
  }],
  // ばらばらの射撃：間の空いた五発を一本に焼き、鳴らす時の音源を増やさない
  ['gunScatter', 3.2, 2, () => {
    for (let j = 0; j < 5; j++) {
      const t = j * 0.29 + R() * 0.16, a = 0.5 + R() * 0.3;
      bN(t, 0.014, 'highpass', 2400, 0.7, a, 0.0004);
      bN(t, 0.12, 'lowpass', 2800, 0.7, a, 0.001);
      bT('sine', t, 95 + R() * 20, 36, 0.32, a * 0.6, 0.002);
      bN(t + 0.04, 1.3, 'lowpass', 300, 0.6, a * 0.25, 0.04);
    }
  }],
  ['gunScatterFar', 3.4, 2, () => {
    for (let j = 0; j < 5; j++) {
      const t = j * 0.29 + R() * 0.16;
      bN(t, 0.28, 'lowpass', 650, 0.6, 0.65, 0.008);
      bT('sine', t, 70, 32, 0.5, 0.45, 0.01);
      bN(t + 0.1, 1.7, 'lowpass', 260, 0.6, 0.22, 0.06);
    }
  }],
  // 弾が耳の横を抜ける：短い空気の裂けと、急に低くなって遠ざかる唸り
  ['whiz', 0.3, 3, () => {
    bN(0, 0.009, 'highpass', 4200, 0.7, 0.65, 0.0003);
    bT('sine', 0.004, 2500 + R() * 500, 650, 0.2, 0.08, 0.001);
    const f = bN(0.004, 0.22, 'bandpass', 3900, 3, 0.35, 0.002);
    f.frequency.exponentialRampToValueAtTime(850, 0.22);
  }],
  // 鉛玉の当たり：体や土は鈍く短く、甲冑は潰れた当たりに細い金の鳴り
  ['bulletHit', 0.4, 3, () => {
    bN(0, 0.018, 'bandpass', 1200 + R() * 500, 0.8, 0.8, 0.0005);
    bT('sine', 0.001, 170 + R() * 30, 55, 0.12, 0.65, 0.001);
    bN(0.005, 0.17, 'lowpass', 650, 0.8, 0.4, 0.003);
  }],
  ['bulletArmor', 0.65, 2, () => {
    bN(0, 0.012, 'bandpass', 2700, 0.8, 0.8, 0.0004);
    bT('sine', 0, 180, 60, 0.1, 0.45, 0.001);
    steel(0.002, 1900 + R() * 700, 0.24, 0.4);
  }],
  // 刀と刀：鋭い当たり → 二本の鋼の鳴り（うなりのある澄んだ響き）→ 擦れ
  ['clash', 1, 6, () => {
    const f = 1300 + R() * 800;
    bN(0, 0.006, 'highpass', 3200, 0.7, 1, 0.0003);
    bN(0.001, 0.05, 'bandpass', 4200 + R() * 1500, 1.2, 0.5, 0.0005);
    steel(0, f, 0.2, 0.9 + R() * 0.4);
    steel(0.002, f * (1.07 + R() * 0.1), 0.14, 0.7);
    bN(0.004, 0.12, 'highpass', 5000, 0.7, 0.08, 0.002);
  }],
  // 槍の穂と刃・柄が噛み合う：木の詰まった当たりに短い鉄の鳴りと、擦り抜ける音
  ['yari', 0.7, 4, () => {
    bN(0, 0.012, 'bandpass', 2000 + R() * 800, 1.2, 0.7, 0.0004);
    shaft(0, 230 + R() * 150, 0.45);
    steel(0.003, 1500 + R() * 900, 0.1, 0.45 + R() * 0.3);
    const sc = bN(0.02, 0.14 + R() * 0.1, 'bandpass', 2400, 2.5, 0.18, 0.01); sc.frequency.exponentialRampToValueAtTime(4800 + R() * 1500, 0.2);
  }],
  // 受け流し：刃が滑って長く鳴る
  ['parry', 1.6, 2, () => {
    const f = 1500 + R() * 600;
    bN(0, 0.006, 'highpass', 3500, 0.7, 0.9, 0.0003);
    const sl = bN(0.004, 0.18, 'bandpass', 3000, 3, 0.35, 0.01); sl.frequency.exponentialRampToValueAtTime(6500, 0.19);
    steel(0, f, 0.24, 1.7);
    steel(0.003, f * 1.13, 0.12, 1.2);
  }],
  // 刃の澄んだ鳴り（高く細い）
  ['kin', 1.1, 3, () => { bN(0, 0.005, 'highpass', 4200, 0.8, 0.8, 0.0003); steel(0, 2100 + R() * 400, 0.25, 1); }],
  // 槍の柄で受ける：木の乾いた当たりに、穂先の小さな鉄の音
  ['block', 0.5, 3, () => {
    bN(0, 0.015, 'bandpass', 1700 + R() * 500, 1.2, 0.6, 0.0004);
    shaft(0, 280 + R() * 120, 0.5);
    bN(0, 0.05, 'lowpass', 520, 0.8, 0.35);
    steel(0.004, 1800 + R() * 600, 0.05, 0.35);
  }],
  // 木：槍の柄どうし・木の盾や柵を打つ「かん」「こん」
  ['wood', 0.4, 3, () => {
    bN(0, 0.015, 'bandpass', 1800 + R() * 600, 1.2, 0.55, 0.0004);
    shaft(0, 250 + R() * 160, 0.6);
    bN(0, 0.06, 'lowpass', 520 + R() * 200, 0.8, 0.45);
  }],
  // 甲冑を打つ：漆の小札がばらばらと鳴り、鈍い当たりと小さな金物の響き
  ['yoroi', 0.5, 3, () => {
    bN(0, 0.07, 'lowpass', 520, 0.8, 0.55);
    for (let j = 0; j < 9; j++) bN(R() * 0.09, 0.014, 'bandpass', 2400 + R() * 2600, 4, 0.2 + R() * 0.25, 0.0005);
    steel(0.002, 850 + R() * 300, 0.08, 0.2);
  }],
  // 小札の擦れ（歩く・構える）
  ['kozane', 0.35, 3, () => { for (let j = 0; j < 7; j++) bN(j * 0.022 + R() * 0.015, 0.02, 'bandpass', 2800 + R() * 2000, 5, 0.3 + R() * 0.4, 0.0005); bN(0, 0.12, 'bandpass', 1200, 1.5, 0.2); }],
  // 小さな金物の当たり
  ['clank', 0.3, 3, () => { bN(0, 0.004, 'highpass', 3500, 0.8, 0.5, 0.0003); steel(0, 2600 + R() * 1200, 0.2, 0.25); }],
  // 体に入る一撃：鈍い肉と布の音
  // 奇数：突き（布が裂けて、湿った短い音）。偶数：打ち（重い当たり）。三つ目ごとに具足の小札も鳴る
  ['hit', 0.45, 6, (i) => {
    const p = 0.85 + R() * 0.3;
    if (i % 2) {
      bN(0, 0.035, 'highpass', 2600 * p, 0.8, 0.35, 0.001);
      bN(0.004, 0.08, 'bandpass', 700 * p, 1.6, 0.7, 0.002);
      bT('sine', 0.004, 120 * p, 60, 0.1, 0.45, 0.002);
    } else {
      bN(0, 0.09, 'lowpass', 850 * p, 0.8, 0.8, 0.001);
      bT('sine', 0, 140 * p, 55, 0.14, 0.6, 0.002);
      bN(0.004, 0.05, 'bandpass', 1500 * p, 1, 0.25, 0.001);
    }
    if (i % 3 === 0) for (let j = 0; j < 4; j++) bN(0.01 + R() * 0.05, 0.014, 'bandpass', 2600 + R() * 2200, 4, 0.12 + R() * 0.1, 0.0005);
  }],
  // 一頭の馬が駆ける：タ・タ・タン の三つ打ちを四度
  ['hooves', 1.6, 2, () => { for (let s = 0; s < 4; s++) { const b = s * (0.34 + R() * 0.04); hoofAt(b, 0.8); hoofAt(b + 0.07, 0.62); hoofAt(b + 0.15, 0.95); } }],
  ['hoovesWet', 1.6, 2, () => { for (let s = 0; s < 4; s++) { const b = s * 0.36; hoofAt(b, 0.75, true); hoofAt(b + 0.07, 0.6, true); hoofAt(b + 0.15, 0.9, true); } }],
  // 騎馬の群れ：幾頭もの駆け足がずれて重なり、地が鳴る
  ['gallop', 2.4, 2, () => {
    for (let h = 0; h < 6; h++) {
      const p = 0.33 + R() * 0.07, a = 0.4 + R() * 0.4;
      for (let b = R() * p; b < 2.05; b += p) { hoofAt(b, a); hoofAt(b + 0.07, a * 0.75); hoofAt(b + 0.15, a); }
    }
    bN(0, 2.2, 'lowpass', 120, 0.6, 0.6, 0.2);
  }],
  // 嘶き：震えながら高く上がり、段々に下がって、鼻を鳴らす
  ['neigh', 1.7, 3, (i) => {
    const p = [0.94, 1.12, 1.02][i] * (0.97 + R() * 0.06), t = 0.01;
    const o = OC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(480 * p, t);
    o.frequency.linearRampToValueAtTime(1180 * p, t + 0.16);
    o.frequency.linearRampToValueAtTime(1020 * p, t + 0.42);
    o.frequency.linearRampToValueAtTime(800 * p, t + 0.78);
    o.frequency.linearRampToValueAtTime(520 * p, t + 1.1);
    o.frequency.linearRampToValueAtTime(400 * p, t + 1.28);
    const l = OC.createOscillator(); l.frequency.setValueAtTime(24, t); l.frequency.linearRampToValueAtTime(10, t + 1.2);
    const lg = OC.createGain(); lg.gain.setValueAtTime(110, t); lg.gain.linearRampToValueAtTime(40, t + 1.2); l.connect(lg); lg.connect(o.frequency);
    const e = OC.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.05); e.gain.setValueAtTime(0.85, t + 0.75); e.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    for (const [f, q, a] of [[1100, 1.4, 1], [2400, 3, 0.5], [3600, 4, 0.25]]) { const bp = OC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const g = OC.createGain(); g.gain.value = a; o.connect(bp); bp.connect(g); g.connect(e); }
    const br = bN(t, 1.25, 'bandpass', 2000, 0.8, 0.12, 0.05, e);
    br.Q.value = 0.8;
    e.connect(OD);
    o.start(t); l.start(t); o.stop(t + 1.35); l.stop(t + 1.35);
    bN(1.33, 0.18, 'bandpass', 700, 1.2, 0.35, 0.01); bN(1.46, 0.12, 'lowpass', 420, 0.7, 0.25, 0.01);
  }],
  // 鼻息：鼻の穴が震える「ぶるるっ」と、息の抜け（吸う息が付く時と付かない時）
  ['snort', 0.9, 4, (i) => {
    const len = 0.28 + R() * 0.28;
    const s = OC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = OC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480 + R() * 260; bp.Q.value = 1.3;
    const am = OC.createGain(); am.gain.value = 0.55;
    const l = OC.createOscillator(); l.frequency.value = 20 + R() * 16; const lg = OC.createGain(); lg.gain.value = 0.45; l.connect(lg); lg.connect(am.gain);
    const e = OC.createGain(); envG(e, 0.01, 1, len, 0.02);
    s.connect(bp); bp.connect(am); am.connect(e); e.connect(OD);
    s.start(0, R() * 1.5); l.start(0); s.stop(len + 0.08); l.stop(len + 0.08);
    bN(0.01, len * 0.8, 'highpass', 1800, 0.7, 0.18, 0.01);
    if (i % 2) bN(len + 0.08, 0.22 + R() * 0.1, 'bandpass', 1000 + R() * 400, 0.9, 0.3, 0.05);
  }],
  // 陣太鼓：皮の張った低い胴鳴り（高さが下がる）・皮を打つ音・胴の響き
  ['taiko', 1.4, 3, () => {
    bT('sine', 0, 108 + R() * 12, 46, 0.55, 1, 0.002);
    bT('sine', 0, 172 + R() * 15, 80, 0.25, 0.35, 0.002);
    bN(0, 0.03, 'lowpass', 1200, 0.8, 0.45, 0.0006);
    bN(0, 0.6, 'lowpass', 160, 0.7, 0.35, 0.004);
  }],
  // 法螺貝：息の吹き込みで下からすくい上がり、太い倍音の「ぶおお」が震えて伸び、最後に少し裏返る
  ['hora', 3, 2, (i) => {
    const t = 0.02, f = (i ? 196 : 185);
    const o = OC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.72, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.32);
    o.frequency.setValueAtTime(f, t + 1.7); o.frequency.linearRampToValueAtTime(f * 1.04, t + 2.0); o.frequency.linearRampToValueAtTime(f * 0.9, t + 2.6);
    const o2 = OC.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 2.003; const g2 = OC.createGain(); g2.gain.value = 0.18; o2.connect(g2);
    const l = OC.createOscillator(); l.frequency.value = 5.5; const lg = OC.createGain(); lg.gain.value = 3; l.connect(lg); lg.connect(o.frequency);
    const lp = OC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 1.2;
    const fo = OC.createBiquadFilter(); fo.type = 'peaking'; fo.frequency.value = 650; fo.Q.value = 1.5; fo.gain.value = 9;
    const e = OC.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.28); e.gain.setValueAtTime(0.95, t + 1.95); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const tr = OC.createOscillator(); tr.frequency.value = 5.5; const tg = OC.createGain(); tg.gain.value = 0.1; tr.connect(tg); tg.connect(e.gain);
    o.connect(lp); g2.connect(lp); lp.connect(fo); fo.connect(e); e.connect(OD);
    bN(t, 2.6, 'bandpass', 900, 2, 0.08, 0.2);
    for (const n of [o, o2, l, tr]) { n.start(t); n.stop(t + 2.85); }
  }],
  // 大軍の鬨の声：二十余人の「おおおー」がずれて重なる
  ['toki', 3.2, 2, () => {
    for (let j = 0; j < 22; j++) bVoice(R() * 0.35, 100 + R() * 70, 2.2 + R() * 0.6, 0.12 + R() * 0.06);
    const f = bN(0.1, 2.6, 'bandpass', 560, 1.3, 0.25, 0.3); f.frequency.exponentialRampToValueAtTime(380, 2.7);
  }],
  // 「えい、えい」に応える皆の「おう！」
  ['ou', 1.3, 1, () => { for (let j = 0; j < 16; j++) bVoice(R() * 0.12, 120 + R() * 70, 0.8 + R() * 0.2, 0.14, 'u'); bN(0, 0.9, 'bandpass', 600, 1.2, 0.2, 0.05); }],
  // 合戦のざわめき（繰り返して流す六秒）：幾十人の喚き・叫び・鬨が絶えずずれて重なり、打ち合いが混じる。野の残響ごと焼く
  ['roar', 7, 2, () => {
    const dry = OC.createGain(); dry.connect(OD);
    if (irBuf) { const cv = OC.createConvolver(); cv.buffer = irBuf; const wg = OC.createGain(); wg.gain.value = 0.5; dry.connect(cv); cv.connect(wg); wg.connect(OD); }
    OD = dry;
    const V = 'aoeoau';
    for (let j = 0; j < 44; j++) bVoice(R() * 6.9, 95 + R() * 115, 0.45 + R() * 1.5, 0.05 + R() * 0.07, V[(R() * 6) | 0], V[(R() * 6) | 0]);
    for (let j = 0; j < 26; j++) { const t = R() * 6.9; if (R() < 0.5) steel(t, 1100 + R() * 1400, 0.012 + R() * 0.02, 0.35); else shaft(t, 220 + R() * 200, 0.04 + R() * 0.05); }
    // 揉み合う足と体の低いうねり（一定の強さで流す）
    const s = OC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = OC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.6;
    const g = OC.createGain(); g.gain.value = 0.3; s.connect(lp); lp.connect(g); g.connect(dry); s.start(0); s.stop(7);
  }, { loop: 1 }],
  // 大軍の足音の地鳴り（繰り返して流す四秒）：数えきれない足音と、小札の擦れ
  ['army', 4, 1, () => {
    const s = OC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = OC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.6;
    const g = OC.createGain(); g.gain.value = 0.35; s.connect(lp); lp.connect(g); g.connect(OD); s.start(0); s.stop(4);
    for (let j = 0; j < 220; j++) bN(R() * 3.85, 0.07, 'lowpass', 150 + R() * 220, 0.8, 0.12 + R() * 0.2);
    for (let j = 0; j < 50; j++) bN(R() * 3.95, 0.02, 'bandpass', 2600 + R() * 2200, 5, 0.04 + R() * 0.05, 0.0005);
  }],
];
// 一つずつ順に焼く（一度に全部組まない。遊びの頭を重くしない）
async function bakeAll() {
  if (!(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return;
  for (const [k, dur, n, fn, opt] of RECIPES) {
    try { await bake(k, dur, n, fn, opt); } catch (e) { /* 焼けない音は合成のまま */ }
    await new Promise((r) => setTimeout(r, 30));
  }
}
// 環境の繰り返し音（雑音）を、焼いた音に差し替える
function swapLoop(n, k) {
  const s = ctx.createBufferSource(); s.buffer = BANK[k][0]; s.loop = true;
  s.connect(n.f); s.start();
  try { n.src.stop(); } catch (e) { /* もう止まっている */ }
  n.src.disconnect(); n.src = s; n.baked = true;
}
// 太鼓の一打ち（焼けていなければ合成）
function drum(vol, t0 = 0, wet = 0.3) { if (!play('taiko', 0.85 * vol, { t0, wet, jit: 0.04 })) { tone('sine', 95, 42, 0.7, 0.9 * vol, t0); noise(0.05, 'lowpass', 900, 1, 0.3 * vol, t0); } }

export function sfx(name, vol = 1) {
  if (!ctx || vol < 0.02) return;
  const kind = soundKind(name);
  const n = performance.now(), r = rate[name] || (rate[name] = { t: 0, k: 0 });
  if (n - r.t > 60) { r.t = n; r.k = 0; }
  if (++r.k > (kind.priority >= 2 ? 2 : 3)) { dropped++; return; }
  mixed(kind, () => {
    if (kind === MIX_KIND.command) focusMix('command', MIX.command.seconds);
    else if (kind === MIX_KIND.danger || kind === MIX_KIND.bullet) focusMix('danger', MIX.danger.seconds);
    emitSfx(name, vol);
  });
}
function emitSfx(name, vol) {
  // 人の声は、小さく聞こえる（遠い）ほどこもらせる
  const muf = 900 + 4200 * Math.min(1, vol);
  if (name.startsWith('soldier_')) {
    const call = SOLDIER_CALLS[name.slice(8)];
    if (!call) return;
    // 同じ用向きでも節回しと話す者を替える。音の並びは読み込み時に作って使い回す。
    const style = lastSoldierStyle < 0 ? Math.floor(Math.random() * 3) : (lastSoldierStyle + 1 + Math.floor(Math.random() * 2)) % 3;
    lastSoldierStyle = style;
    through(muf, () => voice(call[style % 2], { f0: 115 + style * 35, vol: 0.055 * vol, rasp: 0.3 + style * 0.18, fm: 0.9 + style * 0.1 }));
    return;
  }
  switch (name) {
    case 'thrust': { const f = noise(0.16, 'bandpass', 900, 1.2, 0.35 * vol); f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.14); break; }
    case 'swing': { const f = noise(0.24, 'bandpass', 600, 1.0, 0.35 * vol); f.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.2); break; }
    case 'hit': if (play('hit', 0.55 * vol, { wet: 0.05 })) break; noise(0.12, 'lowpass', 1400, 0.8, 0.5 * vol); tone('sine', 150, 60, 0.12, 0.35 * vol); break;
    case 'clash': if (Math.random() < 0.3 && play('yari', 0.32 * vol, { wet: 0.15, jit: 0.1 })) break; if (play('clash', 0.3 * vol, { wet: 0.18, jit: 0.1 })) break; tone('square', 1900, 1500, 0.1, 0.07 * vol); tone('square', 2750, 2300, 0.14, 0.05 * vol); noise(0.08, 'highpass', 3000, 0.7, 0.2 * vol); break;
    case 'block': if (play('block', 0.32 * vol, { wet: 0.12 })) break; tone('triangle', 900, 700, 0.12, 0.2 * vol); noise(0.06, 'bandpass', 2500, 2, 0.25 * vol); break;
    case 'parry': if (play('parry', 0.32 * vol, { wet: 0.22 })) break; tone('square', 2600, 2400, 0.25, 0.09 * vol); tone('triangle', 1300, 1250, 0.35, 0.15 * vol); noise(0.05, 'highpass', 4000, 1, 0.3 * vol); break;
    case 'arrow': { const f = noise(0.3, 'bandpass', 3000, 3, 0.12 * vol); f.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3); break; }
    case 'wood': if (play('wood', 0.5 * vol, { wet: 0.12 })) break; noise(0.2, 'lowpass', 500, 1, 0.5 * vol); tone('sine', 110, 70, 0.18, 0.3 * vol); break;
    // 城69：門を打つ木の音（掛矢・破城槌）。'wood' より重く低く、当たった後に二度ほど響き足が続く
    case 'gateBash': {
      noise(0.24, 'lowpass', 340, 0.9, 0.7 * vol); tone('sine', 85, 40, 0.28, 0.5 * vol);
      noise(0.3, 'bandpass', 700, 1.6, 0.18 * vol, 0.05);
      for (let i = 0; i < 2; i++) noise(0.1, 'lowpass', 260, 1, 0.12 * vol, 0.12 + i * 0.09);
      break;
    }
    // 門・柵が壊れる：木の裂ける鋭い音 → 太い梁の折れる低い響き → 地を揺らす重さ → 破片の散らばる音
    case 'crash': {
      noise(0.06, 'highpass', 1800, 0.7, 0.5 * vol);
      for (let i = 0; i < 4; i++) noise(0.05, 'bandpass', 1200 + Math.random() * 1400, 2, (0.3 - i * 0.05) * vol, 0.02 + i * (0.03 + Math.random() * 0.03));
      noise(0.45, 'lowpass', 420, 0.9, 0.75 * vol, 0.03); tone('sine', 70, 32, 0.6, 0.6 * vol, 0.03);
      noise(1.4, 'lowpass', 160, 0.6, 0.35 * vol, 0.1);
      for (let i = 0; i < 7; i++) noise(0.04, 'bandpass', 900 + Math.random() * 2200, 3, (0.05 + Math.random() * 0.06) * vol, 0.35 + Math.random() * 0.9);
      break;
    }
    // 破られた扉が地に倒れる：低く重い一打と、跳ね返りの小さな一打
    case 'doorSlam': {
      noise(0.3, 'lowpass', 260, 0.9, 0.8 * vol); tone('sine', 58, 30, 0.5, 0.7 * vol);
      noise(0.12, 'lowpass', 340, 1, 0.25 * vol, 0.2); tone('sine', 75, 40, 0.15, 0.2 * vol, 0.2);
      noise(1.6, 'lowpass', 140, 0.6, 0.25 * vol, 0.05);
      break;
    }
    case 'taiko': drum(vol); break;
    case 'ui': tone('sine', 660, 640, 0.08, 0.08 * vol); break;
    case 'obj': tone('sine', 520, 515, 0.2, 0.07 * vol); tone('sine', 780, 775, 0.3, 0.06 * vol, 0.12); break;
    case 'merit': tone('sine', 880, 870, 0.18, 0.06 * vol); tone('sine', 1320, 1310, 0.25, 0.04 * vol, 0.05); break;
    case 'neg': tone('triangle', 300, 220, 0.3, 0.12 * vol); break;
    // 画面の音の使い分け：back＝やめる・戻る（下がる二音）、deny＝足りない・押せない（低く短い二度打ち）
    case 'back': tone('sine', 520, 500, 0.07, 0.07 * vol); tone('sine', 390, 380, 0.1, 0.06 * vol, 0.06); break;
    case 'deny': tone('triangle', 180, 170, 0.07, 0.1 * vol); tone('triangle', 180, 165, 0.09, 0.09 * vol, 0.11); break;
    case 'step': noise(0.07, 'lowpass', 420 + Math.random() * 200, 0.7, 0.16 * vol); break;
    case 'stepPath': noise(0.06, 'lowpass', 700 + Math.random() * 200, 0.9, 0.18 * vol); break;
    case 'stepSand': noise(0.09, 'bandpass', 1800 + Math.random() * 400, 0.8, 0.12 * vol); break;
    case 'stepWet': noise(0.08, 'bandpass', 900 + Math.random() * 300, 2, 0.18 * vol); tone('sine', 300, 180, 0.06, 0.03 * vol); break;
    // 583：倒れる声は短い「ぐあっ」
    // 叫びは六通り（「ぐあっ」「うおっ」「ぎゃっ」「うっ」「おおっ」「があ…」）から、直前と違うものを選ぶ
    case 'cry': {
      let k = Math.floor(Math.random() * CRIES.length);
      if (k === lastCry) k = (k + 1) % CRIES.length;
      lastCry = k;
      const [syl, f0, rasp] = CRIES[k];
      through(muf, () => { voice(syl, { f0: f0 + Math.random() * 40, vol: 0.05 * vol, rasp }); noise(0.3, 'bandpass', 480 + Math.random() * 120, 6, 0.04 * vol); });
      break;
    }
    case 'slash': noise(0.1, 'highpass', 2600, 1, 0.3 * vol); tone('triangle', 3200, 2400, 0.12, 0.05 * vol); break;
    case 'victory': horagai(vol); for (let i = 0; i < 8; i++) drum(0.75 * vol, 0.6 + i * 0.16, 0.2); crowd('toki', 6, vol * 0.8, 2.2); break;
    // 鉄砲：近くは乾いた破裂と残響、150m より遠くはこもった轟き（遅れとこもりは withPan が足す）
    case 'gun': {
      const far = curD > 150;
      if (play(far ? 'gunFar' : 'gunNear', (far ? 0.85 : 0.95) * vol, { wet: far ? 0 : 0.35, jit: 0.1 })) break;
      if (!far) noise(0.014, 'highpass', 2200, 0.7, 0.5 * vol);
      noise(far ? 0.28 : 0.12, 'lowpass', far ? 650 : 2800, 0.7, 0.85 * vol);
      tone('sine', far ? 72 : 100, 36, 0.4, 0.55 * vol);
      noise(far ? 2.4 : 1.5, 'lowpass', far ? 240 : 380, 0.6, 0.22 * vol, 0.05);
      break;
    }
    // 城69：城内の鉄砲の響き（塀・石垣に挟まれた曲輪の中で撃った音。'gun' に、短い間隔のこだまを二つ足す）
    case 'gunEcho': {
      emitSfx('gun', vol);
      const echo = (t0, f, a) => { const n = noise(0.16, 'lowpass', f, 0.8, a * vol, t0); if (n && n.frequency) n.frequency.exponentialRampToValueAtTime(f * 0.6, ctx.currentTime + t0 + 0.14); };
      echo(0.06, 1500, 0.22); echo(0.13, 1000, 0.14);
      break;
    }
    // 揃った射撃と、間がばらけた射撃。焼ける前も一組九音以内に収める
    case 'volley':
    case 'gunScatter': {
      const far = curD > 150, scatter = name === 'gunScatter';
      const key = scatter ? (far ? 'gunScatterFar' : 'gunScatter') : (far ? 'volleyFar' : 'volley');
      if (play(key, (far ? 0.9 : 1) * vol, { wet: far ? 0 : 0.3, jit: 0.06 })) break;
      for (let i = 0; i < 4; i++) {
        const t0 = scatter ? i * 0.29 + Math.random() * 0.16 : Math.random() * 0.12;
        noise(far ? 0.28 : 0.1, 'lowpass', far ? 650 : 2800, 0.7, 0.6 * vol, t0);
        tone('sine', far ? 70 : 100, 36, 0.35, 0.3 * vol, t0);
      }
      noise(2, 'lowpass', 280, 0.6, 0.35 * vol, scatter ? 0.3 : 0.05);
      break;
    }
    // 弓の斉射：弦の音が重なり、矢の風切りがまとまって飛ぶ
    case 'volleyBow': for (let i = 0; i < 7; i++) { const t0 = Math.random() * 0.3; tone('triangle', 380 + Math.random() * 90, 330, 0.12, 0.08 * vol, t0); noise(0.05, 'highpass', 2500, 1, 0.06 * vol, t0); } { const f = noise(0.8, 'bandpass', 2600, 1.5, 0.16 * vol, 0.12); f.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.9); } break;
    // 騎馬の群れ：蹄が地を打つ音が重なって地鳴りになる
    case 'gallop': if (play('gallop', 0.6 * vol, { wet: 0.12, jit: 0.1 })) break; for (let i = 0; i < 22; i++) noise(0.06, 'lowpass', 240 + Math.random() * 160, 1, (0.2 + Math.random() * 0.15) * vol, i * 0.08 + Math.random() * 0.04); noise(1.2, 'lowpass', 110, 0.6, 0.35 * vol); break;
    case 'click': tone('square', 1800, 1700, 0.03, 0.06 * vol); noise(0.05, 'highpass', 3000, 1, 0.08 * vol); break;
    case 'tick': tone('square', 2400, 2300, 0.04, 0.03 * vol); break;
    // 585：駆け足は三拍（後ろ足・後ろ足・前足）に土の響き
    case 'hooves': if ((scene.wet || 0) > 0.45 && play('hoovesWet', 0.32 * vol, { wet: 0.08, jit: 0.12 })) break; if (play('hooves', 0.32 * vol, { wet: 0.08, jit: 0.12 })) break; for (let i = 0; i < 4; i++) { const b = i * 0.36; for (const [dt, a] of [[0, 0.3], [0.07, 0.24], [0.15, 0.34]]) noise(0.05, 'lowpass', 260 + Math.random() * 120, 1.2, a * vol, b + dt + Math.random() * 0.01); } noise(1.3, 'lowpass', 140, 0.5, 0.08 * vol); break;
    // ぬかるみを駆ける蹄：土の響きに、泥を跳ね上げる湿った音が混じる
    case 'hoovesWet': if (play('hoovesWet', 0.32 * vol, { wet: 0.08, jit: 0.12 })) break; for (let i = 0; i < 4; i++) { const b = i * 0.36; for (const [dt, a] of [[0, 0.26], [0.07, 0.2], [0.15, 0.3]]) { noise(0.05, 'lowpass', 220 + Math.random() * 100, 1.2, a * vol, b + dt); noise(0.08, 'bandpass', 900 + Math.random() * 500, 2, a * 0.35 * vol, b + dt + 0.02); } } break;
    case 'snort': if (play('snort', 0.16 * vol, { wet: 0.08, jit: 0.12 })) break; noise(0.18, 'bandpass', 700, 1.2, 0.12 * vol); noise(0.22, 'bandpass', 520, 1.2, 0.1 * vol, 0.22); break;
    case 'thunder': { const f = noise(2.8, 'lowpass', 180, 0.7, 0.9 * vol); f.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 2.6); noise(0.3, 'lowpass', 900, 0.8, 0.5 * vol); break; }
    // 浅瀬を歩く：水を蹴るしぶきと、脚にまとわる水の重い音
    case 'wade': { const f = noise(0.22, 'bandpass', 1400 + Math.random() * 600, 1.2, 0.2 * vol); f.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.2); noise(0.3, 'lowpass', 380, 0.8, 0.14 * vol, 0.03); break; }
    // 刀を抜く鞘走り：鋼が鞘の口を擦る細い音が、高く伸びて止まる
    case 'saya': { const f = noise(0.32, 'bandpass', 2600, 3, 0.1 * vol); f.frequency.exponentialRampToValueAtTime(5200, ctx.currentTime + 0.3); tone('sine', 3900, 4100, 0.25, 0.012 * vol, 0.28); break; }
    // 大勢が進んでくる足音：地を踏む鈍い音が重なり、具足がざわめく（遠くの隊の寄せを耳で知る）
    case 'tramp': for (let i = 0; i < 10; i++) noise(0.07, 'lowpass', 180 + Math.random() * 140, 0.9, (0.1 + Math.random() * 0.08) * vol, i * 0.09 + Math.random() * 0.05); noise(0.9, 'lowpass', 120, 0.6, 0.12 * vol); for (let i = 0; i < 3; i++) noise(0.03, 'bandpass', 3000 + Math.random() * 1400, 5, 0.02 * vol, 0.1 + i * 0.25); break;
    // 人が地に崩れ落ちる鈍い音と、具足の擦れ
    // 体が地に崩れる音：毎回少し違う（膝から崩れる二段・どさりと一度）。濡れた地面は泥を打つ湿った音、乾いた地面は草と土の擦れ。具足の小札が鳴る数も毎回違う
    // 自分の馬の一完歩：四つの蹄が重く地を打ち、胸に来る低い響き（駆けるほど重い。vol は速さ）
    case 'hoofBeat': {
      const wet = (scene.wet || 0) > 0.45, p = 0.9 + Math.random() * 0.2;
      for (const [t, a] of [[0, 0.7], [0.06, 0.55], [0.13, 0.9], [0.19, 0.75]]) noise(0.06, 'lowpass', (wet ? 220 : 300) * p, 1, a * 0.22 * vol, t + Math.random() * 0.01);
      tone('sine', 72 * p, 38, 0.22, 0.3 * vol, 0.12);
      if (!wet) noise(0.18, 'bandpass', 1500 * p, 0.8, 0.035 * vol, 0.14);
      break;
    }
    case 'thud': {
      const two = Math.random() < 0.4, wet = (scene.wet || 0) > 0.45, p = 0.85 + Math.random() * 0.3;
      if (two) { noise(0.12, 'lowpass', 300 * p, 0.8, 0.22 * vol); tone('sine', 110 * p, 60, 0.1, 0.1 * vol); }
      const t1 = two ? 0.16 + Math.random() * 0.1 : 0;
      noise(0.22, 'lowpass', 260 * p, 0.8, 0.4 * vol, t1); tone('sine', 90 * p, 45, 0.18, 0.2 * vol, t1);
      if (wet) { const f = noise(0.2, 'bandpass', 900 * p, 2.2, 0.16 * vol, t1 + 0.02); f.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + t1 + 0.2); }
      else noise(0.3, 'bandpass', 1900 * p, 0.9, 0.05 * vol, t1 + 0.03);
      const nk = Math.floor(Math.random() * 5);
      for (let i = 0; i < nk; i++) noise(0.03, 'bandpass', 2600 + Math.random() * 1500, 5, 0.03 * vol, t1 + 0.04 + i * (0.02 + Math.random() * 0.03));
      break;
    }
    // 近い落雷の「バリッ」と裂ける音
    // 耳の横を抜ける弾：鋭い「ぱしっ」という空気の裂ける音と、ひゅんと下がって遠ざかる唸り
    case 'whiz': { if (play('whiz', 0.55 * vol, { jit: 0.1 })) break; noise(0.012, 'highpass', 4200, 0.7, 0.45 * vol); tone('sine', 2400 + Math.random() * 500, 700, 0.22, 0.05 * vol, 0.005); const f = noise(0.2, 'bandpass', 3800, 3, 0.2 * vol, 0.005); if (f.frequency) f.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.2); break; }
    case 'bulletHit':
    case 'bulletArmor': {
      if (play(name, 0.55 * vol, { wet: 0.04, jit: 0.12 })) break;
      const armor = name === 'bulletArmor';
      noise(0.018, 'bandpass', armor ? 2700 : 1400, 0.8, 0.45 * vol);
      tone('sine', 180, 55, 0.12, 0.3 * vol);
      if (armor) tone('triangle', 2300, 1900, 0.24, 0.08 * vol);
      else noise(0.17, 'lowpass', 650, 0.8, 0.2 * vol);
      break;
    }
    case 'crack': noise(0.05, 'highpass', 2200, 0.7, 0.55 * vol); noise(0.35, 'bandpass', 900, 0.8, 0.45 * vol, 0.02); noise(0.5, 'lowpass', 400, 0.6, 0.5 * vol, 0.08); break;
    case 'far': through(1100, () => { if (!play('toki', 0.2 * vol, { rate: 0.85 + Math.random() * 0.08, wet: 0.3 })) crowd('toki', 4, vol * 0.5, 1.3, 0.85); }); break;
    // 城69：遠くの鬨と太鼓（外郭の外・別の曲輪で戦っている気配。軍議・移動中の背景に薄く流す）
    case 'siegeDistant': through(900, () => { crowd('toki', 3, vol * 0.4, 1.1, 0.8); }); drum(0.35 * vol, 0.25, 0.5); break;
    case 'kill': tone('sine', 110, 60, 0.25, 0.25 * vol); noise(0.12, 'lowpass', 600, 1, 0.2 * vol); break;
    case 'clank': if (play('clank', 0.07 * vol, { wet: 0.1 })) break; noise(0.05, 'bandpass', 3200 + Math.random() * 800, 4, 0.05 * vol); break;
    // 581：鬨の声・えいえいおう（数で重ね、遠いほどこもる）
    // 鬨の声：焼いた大軍の声の上に、近くの二、三人の生の声を重ねる
    case 'shout': through(muf, () => { if (play('toki', 0.14 * vol, { rate: 1.06 + Math.random() * 0.06, wet: 0.2 })) crowd('toki', 2, vol * 0.7); else crowd('toki', 4, vol); }); break;
    case 'toki': through(muf, () => { if (play('toki', 0.24 * vol, { wet: 0.28, jit: 0.08 })) crowd('toki', 3, vol * 0.7); else crowd('toki', 6, vol); }); break;
    case 'eiei': through(muf, () => crowd('eiei', 6, vol)); break;
    // 582：号令の復唱
    case 'fukusho': through(muf, () => crowd('fukusho', 4, vol)); break;
    // 583：うめき声
    case 'umeki': through(Math.min(muf, 1400), () => voice([['u', 0.7, 1], ['o', 0.6, 0.85]], { f0: 90 + Math.random() * 25, vol: 0.03 * vol, rasp: 0.3, trem: 3 })); break;
    // 584：小札の擦れる音（細かい金具と革の音）
    case 'kozane': if (play('kozane', 0.1 * vol)) break; for (let i = 0; i < 5; i++) noise(0.03, 'bandpass', 3000 + Math.random() * 1600, 5, (0.03 + Math.random() * 0.03) * vol, i * 0.022 + Math.random() * 0.01); noise(0.12, 'bandpass', 1200, 1.5, 0.03 * vol); break;
    // 586：合図（遠くの音は army.play の音量で小さくなる）
    case 'kane': kane(vol, 0); break;
    // 寺の梵鐘：低く長く唸る青銅の響き。bellRapid は乱れ打ち（寺が危急を知らせる）
    case 'bell': bonsho(vol, 0); break;
    case 'bellRapid': for (let i = 0; i < 6; i++) bonsho(vol * (0.7 + Math.random() * 0.3), i * (0.55 + Math.random() * 0.25), 2.2); break;
    case 'jindaiko': jindaiko(vol, 0, 'susume'); break;
    case 'sig_susume': signal('susume', 0, vol); break;
    case 'sig_hike': signal('hike', 0, vol); break;
    case 'sig_atsumare': signal('atsumare', 0, vol); break;
    case 'sig_hajime': signal('hajime', 0, vol); break;
    case 'ack': { const f = noise(0.25, 'bandpass', 500, 3, 0.18 * vol); f.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2); break; }
    case 'heart': tone('sine', 62, 40, 0.14, 0.5 * vol); tone('sine', 58, 38, 0.16, 0.4 * vol, 0.2); break;
    case 'horagai': horagai(vol); break;
    // 弦音：離れの瞬間の、高く澄んで短く響く「ぴん」と、弓の胴の小さな鳴り
    case 'string': tone('sine', 1180, 1150, 0.28, 0.05 * vol); tone('sine', 2370, 2330, 0.14, 0.02 * vol); tone('triangle', 330, 300, 0.1, 0.05 * vol); noise(0.03, 'highpass', 3500, 1, 0.06 * vol); break;
    // 刃と刃が打ち合う：鋭い当たりと、鋼の尾を引く響き（倍音はずらして金らしく）
    case 'kin': if (play('kin', 0.22 * vol, { wet: 0.2 })) break; noise(0.03, 'highpass', 4200, 0.8, 0.28 * vol); tone('sine', 2140 + Math.random() * 120, 2120, 0.5, 0.05 * vol); tone('sine', 3460 + Math.random() * 150, 3430, 0.32, 0.035 * vol); tone('sine', 5230, 5200, 0.18, 0.02 * vol); break;
    // 甲冑に弾かれる：小札・鉄の板の乾いた「かっ」と、鎧が擦れる音
    case 'yoroi': if (play('yoroi', 0.24 * vol, { wet: 0.06 })) break; noise(0.04, 'bandpass', 2300 + Math.random() * 600, 3, 0.16 * vol); tone('square', 900 + Math.random() * 200, 700, 0.05, 0.025 * vol); for (let i = 0; i < 3; i++) noise(0.025, 'bandpass', 3200 + Math.random() * 1500, 5, 0.03 * vol, 0.03 + i * 0.02); break;
    // 火皿の口薬が燃える「しゅっ」
    case 'hizara': { const f = noise(0.12, 'bandpass', 2600, 1.2, 0.07 * vol); f.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.12); break; }
    // 矢が板・柵に刺さる「とすっ」
    case 'thunk': noise(0.06, 'lowpass', 900, 1.5, 0.22 * vol); tone('sine', 240, 150, 0.08, 0.1 * vol); break;
    case 'knock': noise(0.09, 'lowpass', 700, 2, 0.35 * vol); tone('sine', 180, 120, 0.1, 0.2 * vol); break;
    // 城下：犬の吠え声（短く二度）と、夜回りの拍子木（乾いた高い木の音）
    case 'dog': for (const t0 of [0, 0.22]) { tone('sawtooth', 560, 340, 0.1, 0.05 * vol, t0); noise(0.08, 'bandpass', 1100, 2.5, 0.12 * vol, t0); } break;
    case 'hyoshigi': noise(0.04, 'highpass', 2600, 1, 0.3 * vol); tone('triangle', 1850, 1760, 0.12, 0.12 * vol); tone('sine', 920, 900, 0.1, 0.08 * vol); break;
    case 'hover': tone('sine', 900, 880, 0.04, 0.03 * vol); break;
    case 'guard': tone('triangle', 700, 600, 0.1, 0.15 * vol); noise(0.05, 'bandpass', 1800, 3, 0.15 * vol); break;
    case 'neigh': if (!play('neigh', 0.17 * vol, { wet: 0.2, jit: 0.1 })) neigh(vol); break;
    // 敵の鬨の声は敵方で少し違う：今川（駿河）は「えい、とう」と短く切る、斎藤（美濃）・浅井は「おおりゃ」と荒く、一揆・本願寺は「なむあみだぶつ」の唱え
    case 'eshout': through(muf, () => foeShout(vol)); break;
    case 'koto': melody(KOTO, vol, pluck); break;
    case 'flute': melody(FLUTE, vol, flute); break;
    case 'promote': for (let i = 0; i < 3; i++) drum(0.85 * vol, i * 0.28); drum(1.1 * vol, 0.95, 0.4); break;
    // 599：日本地図の知らせ（季節の送り・落城・急使）
    case 'season': kane(0.35 * vol, 0); drum(0.55 * vol, 0.15); break;
    case 'fall': through(1500, () => horagai(0.5 * vol)); tone('sine', 80, 40, 0.8, 0.4 * vol, 0.3); break;
    case 'kyushi': sfx('hooves', 0.6 * vol); drum(0.65 * vol, 1.3); drum(0.65 * vol, 1.55); break;
    default: break;
  }
}

// 討たれる叫びの六通り：[音の並び, 声の高さ, かすれ]
const CRIES = [
  [[['a', 0.28, 0.85]], 150, 0.5],
  [[['u', 0.08, 1], ['o', 0.26, 0.9]], 135, 0.45],
  [[['a', 0.16, 1.25]], 190, 0.6],
  [[['u', 0.14, 0.95]], 125, 0.35],
  [[['o', 0.12, 1], ['o', 0.3, 0.8]], 140, 0.5],
  [[['a', 0.45, 0.9], ['a', 0.2, 0.7]], 115, 0.7],
];
let lastCry = -1;
// 前進・発見・退却・大将の討死・槍・射撃・救援・逃走・押し・門・本陣。
// 今ある母音の合成で、短い言葉の拍を刻む。二通りの間と抑揚をあらかじめ用意する。
const SOLDIER_CALLS = {};
for (const [key, vowels] of Object.entries({
  advance: 'eei', enemy: 'eia', retreat: 'ie', lordFall: 'ooa uaae a',
  spear: 'aio aaeo', fire: 'aae', help: 'aueo', flee: 'ieo',
  push: 'oe oe', gate: 'oo aue', headquarters: 'oi e',
})) {
  SOLDIER_CALLS[key] = [0, 1].map((style) => Array.from(vowels, (v, i) =>
    v === ' ' ? [null, 0.12 + style * 0.06] : [v, 0.09 + (i === vowels.length - 1 ? 0.13 : 0) + style * 0.025, 1 + (i % 2 ? -0.1 : 0.12) * (style ? -1 : 1)]));
}
let lastSoldierStyle = -1;
// ---------------- 581：人の声の合成 ----------------
// 声帯の音（鋸歯）を、口の形の響き（母音の二つの山）に通す
const VOW = { a: [750, 1200], i: [300, 2300], u: [350, 1300], e: [480, 1850], o: [470, 820] };
// syl：[[母音 か null（間）, 長さ, 高さの倍率], …]　o：{ f0, vol, t0, rasp, trem }
function voice(syl, o) {
  if (!room(o.trem ? 5 : 4) || full()) return;
  const t0 = ctx.currentTime + (o.t0 || 0);
  const f0 = o.f0, fm = o.fm || 1 + (Math.random() - 0.5) * 0.12;
  const src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = f0;
  const vib = ctx.createOscillator(); vib.frequency.value = 4.6 + Math.random() * 2.4;
  const vg = ctx.createGain(); vg.gain.value = f0 * (0.015 + Math.random() * 0.02); vib.connect(vg); vg.connect(src.frequency);
  // 揺れのむら：遅い揺らぎを重ね、高さがまっすぐにならないように（機械の声っぽさを消す）
  const jit = ctx.createOscillator(); jit.type = 'triangle'; jit.frequency.value = 1.2 + Math.random() * 2.5;
  const jg = ctx.createGain(); jg.gain.value = f0 * (0.015 + Math.random() * 0.02); jit.connect(jg); jg.connect(src.frequency);
  const first = VOW[(syl.find((s) => s[0]) || ['a'])[0]];
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.value = first[0] * fm;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7; f2.frequency.value = first[1] * fm;
  const g2 = ctx.createGain(); g2.gain.value = 0.55;
  // 三つ目の口の響き（声の明るさ・張り）
  const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.Q.value = 9; f3.frequency.value = 2500 * fm;
  const g3 = ctx.createGain(); g3.gain.value = 0.22;
  const env = ctx.createGain(); env.gain.value = 0.0001;
  src.connect(f1); src.connect(f2); src.connect(f3); f2.connect(g2); f3.connect(g3);
  f1.connect(env); g2.connect(env); g3.connect(env);
  // 息のかすれ：かすれの指定が無くても、少しの息は必ず混ぜる（生の喉らしく）
  const br = ctx.createBufferSource(); br.buffer = noiseBuf;
  { const bg = ctx.createGain(); bg.gain.value = 0.12 + (o.rasp || 0) * 0.6; br.connect(bg); bg.connect(f1); bg.connect(f2); bg.connect(f3); }
  // 震え（うめき）
  let tr = null;
  if (o.trem) { tr = ctx.createOscillator(); tr.frequency.value = o.trem; const tg = ctx.createGain(); tg.gain.value = o.vol * 0.4; tr.connect(tg); tg.connect(env.gain); }
  env.connect(dest());
  let t = t0;
  for (const [v, d, p = 1] of syl) {
    if (v) {
      const [a, b] = VOW[v];
      f1.frequency.setTargetAtTime(a * fm, t, 0.03); f2.frequency.setTargetAtTime(b * fm, t, 0.03);
      src.frequency.setTargetAtTime(f0 * p, t, 0.06);
      env.gain.setTargetAtTime(o.vol, t, 0.025);
      env.gain.setTargetAtTime(0.0001, t + d * 0.8, 0.06);
    }
    t += d;
  }
  // 言い終わりは息が抜けて高さが落ちる
  src.frequency.setTargetAtTime(f0 * 0.82, Math.max(t0, t - 0.12), 0.12);
  const end = t + 0.4;
  src.start(t0); vib.start(t0); jit.start(t0); src.stop(end); vib.stop(end); jit.stop(end);
  br.start(t0, Math.random()); br.stop(end);
  if (tr) { tr.start(t0); tr.stop(end); }
  const dd = end - ctx.currentTime; mark(dd); mark(dd); mark(dd);
  mark(dd); if (tr) mark(dd);
}
// 大勢の声：一人ずつ高さと出だしをずらして重ね、多い時は群れの息を足す
function crowd(kind, n, vol, len = 1.4, pitch = 1) {
  if (!ctx) return;
  // 混んでいる時は声の数を減らす
  n = Math.max(1, Math.min(n, 6, Math.floor((CAP - live()) / 6)));
  const base = 0.045 * vol / Math.sqrt(n);
  const pf = () => (105 + Math.random() * 60) * pitch;
  if (kind === 'eiei') {
    // 大将「えい、えい」→ 皆「おう！」
    voice([['e', 0.3, 1.1], ['i', 0.12, 1.2], [null, 0.28], ['e', 0.3, 1.1], ['i', 0.12, 1.2]], { f0: 165 * pitch, vol: base * 1.8, rasp: 0.4 });
    if (play('ou', 0.2 * vol, { t0: 1.25, wet: 0.3, rate: pitch })) voice([['o', 0.5, 1.15], ['u', 0.35, 1]], { f0: pf() * 1.2, vol: base, rasp: 0.5, t0: 1.28 });
    else for (let i = 0; i < n; i++) voice([['o', 0.5, 1.15], ['u', 0.35, 1]], { f0: pf() * 1.2, vol: base, rasp: 0.5, t0: 1.25 + Math.random() * 0.12 });
    noise(0.9, 'bandpass', 600 * pitch, 1.2, 0.05 * vol * Math.min(1, n / 4), 1.25);
  } else if (kind === 'fukusho') {
    // 号令を受けて、組の者が口々に「おう」「はっ」
    for (let i = 0; i < n; i++) {
      // 「おう」「はっ」「応っ」「しょうち」（短い母音の並びで）。一人ずつ違う返事
      const r = Math.random();
      const s = r < 0.35 ? [['o', 0.28, 1.1], ['u', 0.14, 1]] : r < 0.55 ? [['a', 0.2, 1.15]] : r < 0.75 ? [['o', 0.1, 1.2], ['o', 0.22, 1.05]] : r < 0.9 ? [['o', 0.12, 1], ['o', 0.1, 1.08], ['i', 0.14, 1.12]] : [['e', 0.12, 1.1], ['i', 0.2, 1.2]];
      voice(s, { f0: pf() * 1.1, vol: base * 1.2, rasp: 0.4, t0: 0.12 + i * 0.07 + Math.random() * 0.12 });
    }
  } else {
    // 鬨の声：「おおおー」と上がって下がる大きな声のうねり
    for (let i = 0; i < n; i++) voice([['o', len * 0.55, 1.1], ['o', len * 0.45, 0.92]], { f0: pf() * 1.15, vol: base, rasp: 0.6, t0: Math.random() * 0.2 });
    const f = noise(len + 0.3, 'bandpass', 520 * pitch, 1.3, 0.08 * vol * Math.min(1, n / 4), 0.05);
    f.frequency.exponentialRampToValueAtTime(380 * pitch, ctx.currentTime + len);
  }
}

function foeShout(vol) {
  const f = scene.foe || '';
  const n = Math.max(1, Math.min(3, Math.floor((CAP - live()) / 6)));
  const base = 0.045 * 0.8 * vol / Math.sqrt(n);
  const pf = () => (105 + Math.random() * 60) * 0.9;
  if (f === 'imagawa') {
    for (let i = 0; i < n; i++) { const t0 = Math.random() * 0.15; voice([['e', 0.22, 1.15], ['i', 0.1, 1.2], [null, 0.12], ['o', 0.3, 1.05]], { f0: pf() * 1.15, vol: base, rasp: 0.55, t0 }); }
  } else if (f === 'saito' || f === 'azai' || f === 'asakura') {
    for (let i = 0; i < n; i++) voice([['o', 0.4, 1.1], ['a', 0.3, 1.2], ['a', 0.2, 0.95]], { f0: pf() * 1.1, vol: base * 1.1, rasp: 0.75, t0: Math.random() * 0.2 });
  } else if (f === 'namu' || f === 'sagarifuji') {
    // 唱え：低く揃った声で、同じ高さを刻む
    const f0 = 100 + Math.random() * 10;
    for (let i = 0; i < n; i++) voice([['a', 0.18, 1], ['u', 0.18, 1], ['a', 0.18, 1], ['i', 0.18, 1], ['a', 0.2, 1], ['u', 0.3, 0.95]], { f0: f0 * (0.97 + Math.random() * 0.06), vol: base * 0.9, rasp: 0.4, t0: Math.random() * 0.06 });
  } else crowd('toki', 3, vol * 0.8, 1.0, 0.9);
}

// ---------------- 586：合図 ----------------
// 陣鉦：金物の響き（倍音が整数倍でない）
function kane(vol, t0) {
  for (const [k, a, d] of [[1, 1, 1.6], [2.76, 0.5, 1.0], [5.4, 0.3, 0.6], [8.9, 0.15, 0.35]]) tone('sine', 620 * k, 612 * k, d, 0.06 * a * vol, t0);
  noise(0.03, 'highpass', 3000, 1, 0.08 * vol, t0);
}
function bonsho(vol, t0, len = 6) {
  for (const [f, a, d] of [[82, 1, 1], [165, 0.55, 0.8], [221, 0.35, 0.6], [311, 0.25, 0.45], [452, 0.12, 0.3]]) tone('sine', f, f * 0.995, len * d, 0.09 * a * vol, t0);
  noise(0.05, 'lowpass', 700, 1, 0.12 * vol, t0);
}
function jindaiko(vol, t0, kind) {
  // 進め：ドン・ドン・ドドン を二度。集まれ：ゆっくり三つ
  const pat = kind === 'susume' ? [0, 0.5, 0.9, 1.05, 1.8, 2.3, 2.7, 2.85] : [0, 1.1, 2.2];
  for (const b of pat) drum((b % 1 > 0.5 && kind === 'susume' ? 0.7 : 0.85) * vol, t0 + b);
}
// kind：'susume'（進め＝太鼓の早打ちと法螺貝）・'hike'（退け＝鉦の乱打）・'atsumare'（集まれ＝法螺貝の長い二声）・'hajime'（始め＝法螺貝と太鼓三つ）
// dist：その合図の出どころまでの遠さ（m）。遠いほど遅れて、小さく、こもる
export function signal(kind, dist = 0, vol = 1) {
  if (!ctx) return;
  const d = Math.max(0, dist);
  const dl = Math.min(1.5, d / 340), v = vol / (1 + d / 80);
  mixed(MIX_KIND.command, () => {
    focusMix('command', MIX.command.seconds + dl);
    through(Math.max(700, 7000 / (1 + d / 60)), () => {
      if (kind === 'susume') { horagai(v * 0.8, dl); jindaiko(v, dl + 0.3, 'susume'); }
      else if (kind === 'hike') { for (let i = 0; i < 9; i++) kane(v, dl + i * 0.26 + (i % 3 === 2 ? 0.2 : 0)); }
      else if (kind === 'atsumare') { horagai(v, dl); horagai(v, dl + 3.0); }
      else { horagai(v, dl); jindaiko(v, dl + 2.4, 'atsumare'); }
    }, 7);
  });
}

// 尺八のような息の長い音
function breath(freq, vol) {
  if (full()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.97, t); o.frequency.linearRampToValueAtTime(freq, t + 0.6);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.8); g.gain.setValueAtTime(vol, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0005, t + 3.4);
  o.connect(g); g.connect(dest());
  o.start(t); o.stop(t + 3.5);
  mark(3.5);
  noise(3, 'bandpass', freq * 3, 4, vol * 0.25);
}

// ---------------- 589：城下の楽の音と市の声 ----------------
let market = null;
// season：'春'|'夏'|'秋'|'冬'（渡さなければ前の季節のまま。はじめは春）
export function townMusic(on, season) {
  if (townTimer) { clearInterval(townTimer); townTimer = null; }
  if (ctx) marketOn(on);
  if (season) townSeason = season;
  if (on) playMusic('town', { season: townSeason });
  else if (musicNow() === 'town') stopMusic(2.5);
}
let townSeason = '春';
function marketOn(on) {
  if (market) { clearInterval(market.timer); market.node.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); const m = market; setTimeout(() => { try { m.node.src.stop(); } catch (e) { /* 止まっている */ } }, 2000); market = null; }
  if (!on || !ctx) return;
  // 遠いざわめき（人の声の高さの帯を、ゆっくり揺らす）
  const node = loop(650, 'bandpass', 1.4);
  node.g.gain.setTargetAtTime(0.035, ctx.currentTime, 1.5);
  let k = 0;
  const tick = () => {
    k++;
    const now = ctx.currentTime;
    node.g.gain.setTargetAtTime(0.02 + Math.random() * 0.03, now, 1.2);
    node.f.frequency.setTargetAtTime(550 + Math.random() * 250, now, 1.5);
    onBus(ambBus, () => withPanAmb((Math.random() - 0.5) * 1.4, () => {
      const r = Math.random();
      if (r < 0.35) {
        // 呼び込み「いらっしゃい」「やすいよ」
        const calls = [[['i', 0.12, 1.1], ['a', 0.22, 1.25], ['a', 0.14, 1.1], ['i', 0.3, 0.95]], [['a', 0.16, 1.2], ['u', 0.12, 1.1], ['i', 0.14, 1.15], ['o', 0.4, 0.95]]];
        through(1800, () => voice(calls[Math.floor(Math.random() * 2)], { f0: 150 + Math.random() * 60, vol: 0.012, rasp: 0.2 }));
      } else if (r < 0.7) {
        // 下駄の音が通り過ぎる
        for (let i = 0; i < 6; i++) { const t0 = i * 0.32 + Math.random() * 0.03; noise(0.03, 'bandpass', 1500 + (i % 2) * 300, 3, 0.03, t0); tone('sine', 520 + (i % 2) * 60, 480, 0.04, 0.012, t0); }
      } else if (r < 0.8 && k % 4 === 0) {
        // 遠い寺の鐘
        for (const [f, a, d] of [[110, 1, 6], [236, 0.5, 4], [382, 0.25, 3]]) tone('sine', f, f * 0.995, d, 0.03 * a);
      } else {
        // 荷車のきしみ・木を打つ音
        for (let i = 0; i < 3; i++) noise(0.12, 'bandpass', 700 + Math.random() * 300, 6, 0.02, i * 0.4);
      }
    }));
  };
  market = { node, timer: setInterval(tick, 2600) };
}
function withPanAmb(pan, fn) {
  if (!ctx.createStereoPanner) { fn(); return; }
  const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(busOverride || ambBus);
  const prev = out; out = p;
  try { fn(); } finally { out = prev; }
  setTimeout(() => p.disconnect(), 8000);
}

// 585：馬の嘶き。震えながら高く上がり、段々に下がって鼻を鳴らす
function neigh(vol) {
  if (!room(3)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t);
  o.frequency.linearRampToValueAtTime(1150, t + 0.18);
  o.frequency.linearRampToValueAtTime(980, t + 0.45);
  o.frequency.linearRampToValueAtTime(760, t + 0.8);
  o.frequency.linearRampToValueAtTime(430, t + 1.15);
  const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(26, t); lfo.frequency.linearRampToValueAtTime(12, t + 1.1);
  const lg = ctx.createGain(); lg.gain.setValueAtTime(90, t); lg.gain.linearRampToValueAtTime(40, t + 1.1); lfo.connect(lg); lg.connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.6;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2900; f2.Q.value = 3;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07 * vol, t + 0.06); g.gain.setValueAtTime(0.06 * vol, t + 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  const g2 = ctx.createGain(); g2.gain.value = 0.4;
  o.connect(f); o.connect(f2); f2.connect(g2); f.connect(g); g2.connect(g); g.connect(dest());
  o.start(t); lfo.start(t); o.stop(t + 1.25); lfo.stop(t + 1.25);
  mark(1.3); mark(1.3);
  noise(0.2, 'bandpass', 650, 1.2, 0.08 * vol, 1.2);
}

// 琴（撥弦）と笛の短い旋律。音階は都節（みやこぶし）音階
const KOTO = [[0, 293.7], [0.28, 311.1], [0.56, 392], [0.84, 440], [1.4, 466.2], [1.68, 440], [2.1, 392], [2.8, 293.7]];
const FLUTE = [[0, 587.3], [0.45, 622.3], [0.9, 784], [1.6, 880], [2.4, 784]];
function melody(notes, vol, voiceFn) { for (const [t, f] of notes) voiceFn(f, t, vol); }
function pluck(freq, t0, vol) {
  if (!room(2)) return;
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);
  const g2 = ctx.createGain(); g2.gain.value = 0.3;
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest());
  o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
  mark(t0 + 1.4); mark(t0 + 1.4);
}
function flute(freq, t0, vol) {
  if (!room(3)) return;
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq * 0.98, t); o.frequency.linearRampToValueAtTime(freq, t + 0.12);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * vol, t + 0.1); g.gain.setValueAtTime(0.05 * vol, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
  noise(0.7, 'bandpass', freq * 2, 3, 0.01 * vol, t0);
  o.connect(g); g.connect(dest());
  o.start(t); lfo.start(t); o.stop(t + 0.85); lfo.stop(t + 0.85);
  mark(t0 + 0.85); mark(t0 + 0.85);
}

function horagai(vol, t0 = 0) {
  if (play('hora', 0.26 * vol, { t0, wet: 0.45, jit: 0.03, to: dest() })) return;
  if (!room(2)) return;
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(150, t);
  o.frequency.linearRampToValueAtTime(196, t + 0.35);
  o.frequency.setValueAtTime(196, t + 1.6);
  o.frequency.linearRampToValueAtTime(174, t + 2.4);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
  const lg = ctx.createGain(); lg.gain.value = 3;
  lfo.connect(lg); lg.connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 850; f.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.3);
  g.gain.setValueAtTime(0.22 * vol, t + 1.9);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
  o.connect(f); f.connect(g); g.connect(dest());
  o.start(t); lfo.start(t); o.stop(t + 2.7); lfo.stop(t + 2.7);
  mark(t0 + 2.7);
  mark(t0 + 2.7);
}

function loop(freq, type, q) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(ambBus || master);
  src.start();
  return { src, g, f };
}

export function setRain(level) {
  if (!ctx) return;
  if (!rainNode) rainNode = loop(2600, 'bandpass', 0.4);
  rainNode.g.gain.setTargetAtTime(0.28 * level, ctx.currentTime, 0.8);
  // 豪雨は低い唸り（地面と木々を叩く轟き）が重なり、雨音の山も下がって太くなる
  if (level > 0.35 || rainLow) {
    if (!rainLow) rainLow = loop(420, 'lowpass', 0.6);
    rainLow.g.gain.setTargetAtTime(0.2 * Math.max(0, level - 0.35), ctx.currentTime, 1.2);
    rainNode.f.frequency.setTargetAtTime(2600 - Math.max(0, level - 0.5) * 1400, ctx.currentTime, 1.5);
  }
  scene.rainLv = level;
}

export function setCrowd(level) {
  if (!ctx) return;
  if (!crowdNode) crowdNode = loop(700, 'bandpass', 0.9);
  // 581：喧噪は一定の雑音でなく、うねるように（ambience が揺らす）
  crowdLv = level;
  if (music) music.setIntensity(Math.max(level, heatLv));
}
let heatLv = 0;
let crowdLv = 0, farTokiT = 6, farWarT = 12;
// ざわめきの繰り返し音を、焼いた合戦の声（二通りを左右に分け、速さを少しずらして重ねる）に差し替える
// 焼いた喚声の繰り返しと遠くの鬨は、戦の中で曲のように聞こえたので止める（kaito 9/30「変な BGM」）。元の合成のざわめきに戻す
const BAKED_CROWD = false;
function swapRoar(n) {
  const b = BANK.roar, srcs = [];
  try { n.src.stop(); } catch (e) { /* もう止まっている */ }
  n.src.disconnect();
  for (let i = 0; i < 2; i++) {
    const s = ctx.createBufferSource(); s.buffer = b[i % b.length]; s.loop = true; s.playbackRate.value = i ? 1.035 : 0.97;
    let last = s;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = i ? 0.55 : -0.55; s.connect(p); last = p; }
    last.connect(n.f); s.start(0, i ? b[0].duration * 0.5 : 0); srcs.push(s);
  }
  n.f.type = 'lowpass'; n.f.Q.value = 0.5; n.f.frequency.value = 700;
  n.src = { stop() { for (const s of srcs) s.stop(); }, disconnect() { for (const s of srcs) s.disconnect(); } };
  n.baked = true;
}

// ---------------- 587：場面の音（戦の定義から呼べる） ----------------
// river：川の近さ 0〜1、night：夜・夕（虫が鳴く）、wind：風の強さ 0〜1、birds：鳥を鳴かせるか
// fire：近くの火の近さ 0〜1、fireFar：遠くの大きな火 0〜1、hail：雹の強さ 0〜1（world.js が渡す）
const scene = { river: 0, night: false, cold: false, wind: 0, birds: true, rainLv: 0, fire: 0, fireFar: 0, hail: 0 };
let fireNode = null, crackT = 0, hailT = 0;
// 迫る大軍と張り詰め（player.js の senseWar が渡す）
let hoofNode = null, hoofHerdT = 0, rumbleNode = null, tenseNode = null, foeDrumT = 3, foeShoutT = 8, clankT = 1, lastCrumble = 0;
export function setScene(o = {}) { Object.assign(scene, o); }

// 足もとの環境を四分の三秒に一度だけ読む。入れ物と採る位置は使い回す。
const landSound = { world: null, t: 0, river: 0, paddy: 0, woods: 0.5 };
const LAND_OFFSETS = [0, 0, -12, 0, 12, 0, 0, -12, 0, 12];
function bankDistance(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}
function sampleLand(dt, world, pos) {
  landSound.t -= dt;
  if (landSound.world === world && landSound.t > 0) return;
  landSound.world = world; landSound.t = 0.75;
  const d = world.def, x = pos.x, z = pos.z;
  let river = 0, paddy = 0;
  if (d.streams) for (const st of d.streams) {
    if (st.pts) river = Math.max(river, 1 - Math.max(0, bankDistance(x, z, st.pts) - (st.w || 2)) / 35);
  }
  // 大きな川は定義の水面の高さと両岸に合わせる。川があるだけで全域を鳴らさない。
  const w = d.water;
  if (w) for (let i = 0; i < LAND_OFFSETS.length; i += 2) {
    const px = x + LAND_OFFSETS[i], pz = z + LAND_OFFSETS[i + 1];
    if (px >= w.x && px <= (w.x2 ?? Infinity) && world.heightAt(px, pz) < (w.level ?? -99) + 0.3)
      river = Math.max(river, i === 0 ? 1 : 0.55);
  }
  if (d.paddy) for (let i = 0; i < LAND_OFFSETS.length; i += 2)
    paddy = Math.max(paddy, d.paddy(x + LAND_OFFSETS[i], z + LAND_OFFSETS[i + 1]) * (i === 0 ? 1 : 0.6));
  const density = d.treeDensity ? d.treeDensity(x, z) : 1;
  landSound.river = Math.max(0, Math.min(1, river));
  landSound.paddy = Math.max(0, Math.min(1, paddy));
  landSound.woods = Math.max(0, Math.min(1, ((d.trees ?? 520) / 520) * density * (d.clear && d.clear(x, z) ? 0.3 : 1)));
}

let gustT = 2, gustV = 1, kiteT = 20, insectT = 1, dripT = 0, stepT = 0, crowdT = 0;
let warT = 0, calmT = 0, quiet = false, crowT = 2, groanT = 4, hurtOn = 0, pantT = 0, rustleT = 1, farClashT = 2, ughT = 5;
// 588：戦の後の静けさ（main.js などから明示して入れることもできる）
export function afterBattle(on, won) {
  quiet = !!on; calmT = 0; warT = 0;
  if (on && won != null) playMusic(won ? 'victory' : 'defeat', { delay: 0.8 });
  else if (on && WAR_SCORES[musicNow()]) stopMusic(1);
}

// 風・鳥・太鼓・心音などの環境音（毎フレーム呼ぶ）
// o：{ heat, calm, rain, hurt }（ほかに march：近くを歩く兵の多さ 0〜1、river・night も渡せる）
export function ambience(dt, o, world = null, pos = null, wind = 1) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (world && pos) sampleLand(dt, world, pos);
  const local = !!(world && pos), woods = local ? landSound.woods : 0.5;
  const night = local ? world.timeKey === 'dusk' || world.timeKey === 'night' : o.night ?? scene.night;
  const river = local ? landSound.river : o.river ?? scene.river, paddy = local ? landSound.paddy : 0;
  const march = o.march || 0, rain = local ? world.rainLevel || 0 : scene.rainLv || Number(o.rain) || 0;
  const hot = Math.min(1, Math.max(o.heat || 0, quiet || o.aftermath ? 0 : crowdLv));
  const nature = Math.max(0, 1 - hot * 1.8) * Math.max(0, 1 - rain * 1.5);
  const cold = local ? !!world.def.snow : scene.cold;
  const windK = local ? (world.timeKey === 'storm' ? 1 : 0.3) * Math.max(0.3, Math.min(1.5, wind)) * (1 - woods * 0.35) : scene.wind;
  if (!windNode) windNode = loop(320, 'lowpass', 0.5);
  // 587：風は強くなったり弱くなったり（突風）
  gustT -= dt;
  if (gustT <= 0) { gustT = 3 + Math.random() * 7; gustV = 0.5 + Math.random() * 0.5; windNode.f.frequency.setTargetAtTime(240 + Math.random() * 320, now, 2); }
  windNode.g.gain.setTargetAtTime((0.018 + rain * 0.03 + windK * 0.03) * gustV * (quiet ? 1.1 : 1), now, 1.2);   // kaito 9/30「風がうるさい」で半分より下に
  // 581：喧噪のうねり
  if (crowdNode) {
    if (BAKED_CROWD && !crowdNode.baked && has('roar')) swapRoar(crowdNode);
    crowdT -= dt;
    // 焼けたざわめき：激しいほど近く明るく（こもりが開き）、静かな時は遠く籠もる。強さは波のようにうねる
    if (crowdT <= 0 && crowdNode.baked) { crowdT = 0.8 + Math.random() * 1.4; crowdNode.f.frequency.setTargetAtTime((550 + crowdLv * crowdLv * 3200) * (0.8 + Math.random() * 0.4), now, 0.9); crowdNode.g.gain.setTargetAtTime(0.34 * crowdLv * (0.7 + Math.random() * 0.55), now, 0.6); }
    else if (crowdT <= 0) { crowdT = 0.6 + Math.random() * 0.9; crowdNode.f.frequency.setTargetAtTime(560 + Math.random() * 300, now, 0.4); crowdNode.g.gain.setTargetAtTime(0.18 * crowdLv * (0.7 + Math.random() * 0.6), now, 0.3); }
    // 戦場のどこかで上がる鬨の声のうねり：左右や遠くから、こもって響く（激しい時だけ）
    if (BAKED_CROWD && crowdLv > 0.4 && !quiet && has('toki')) {
      farTokiT -= dt;
      if (farTokiT <= 0) {
        farTokiT = 10 + Math.random() * 14 - crowdLv * 4;
        const pan = (Math.random() * 2 - 1) * 0.9, f = 600 + crowdLv * 1000 * Math.random();
        onBus(ambBus, () => withPanAmb(pan, () => through(f, () => play('toki', 0.1 + 0.12 * crowdLv, { rate: 0.8 + Math.random() * 0.14, wet: 0.45, t0: Math.random() * 0.3 }), 5)));
      }
    }
  }
  // 戦場の広さ：戦が熱い間、ずっと遠くの別の場から、陣太鼓の連打か鬨の声がときどき（20〜40 秒に一度・左右と奥から・深くこもらせる）。
  //   繰り返しの音にすると曲のように聞こえる（9/30）ので、一度ずつ・打つ数も間も毎回変える
  if (hot > 0.15 && !quiet && !o.aftermath) {
    farWarT -= dt;
    if (farWarT <= 0) {
      farWarT = 25 + Math.random() * 22 - hot * 12;
      const pan = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5), k = 0.35 + hot * 0.65;
      onBus(ambBus, () => withPanAmb(pan, () => through(380 + Math.random() * 200, () => {
        const call = Math.random();
        if (call < 0.45) {
          const n = 2 + Math.floor(Math.random() * 3), gap = 0.3 + Math.random() * 0.25;
          for (let i = 0; i < n; i++) drum(0.22 * k * (0.75 + Math.random() * 0.4), i * gap + Math.random() * 0.05, 0.6);
        } else if (call < 0.8) crowd('toki', 3, 0.24 * k, 1.6, 0.85);
        else horagai(0.2 * k);
      }, 6)));
    }
  }
  // 587：川のせせらぎ
  if (river > 0 || paddy > 0 || riverNode) {
    if (!riverNode) riverNode = loop(1100, 'bandpass', 0.35);
    riverNode.g.gain.setTargetAtTime((0.07 * river + 0.018 * paddy) * (1 - hot * 0.35), now, 1);
    if (Math.random() < dt * 2) riverNode.f.frequency.setTargetAtTime(river > 0.1 ? 900 + Math.random() * 500 : 600 + Math.random() * 200, now, 0.5);
  }
  // 587：雨粒が笠や地面を打つ音（強さに応じて、多すぎないように）
  if (scene.rainLv > 0.2) {
    dripT -= dt;
    if (dripT <= 0) { dripT = 0.05 / scene.rainLv + Math.random() * 0.1; onBus(ambBus, () => noise(0.02, 'highpass', 3500 + Math.random() * 3000, 1, 0.015 + Math.random() * 0.02)); }
  }
  // 火：近くの火はぱちぱちとはぜ、遠くの大きな火（燃える堂・町）は低く唸る
  const fireRoar = Math.max(scene.fire * 0.6, scene.fireFar);
  if (fireRoar > 0.02 || fireNode) {
    if (!fireNode) fireNode = loop(240, 'lowpass', 0.7);
    fireNode.g.gain.setTargetAtTime(0.09 * fireRoar * (0.8 + 0.2 * Math.sin(now * 1.7) * Math.sin(now * 0.63)), now, 0.6);
  }
  if (scene.fire > 0.05) {
    crackT -= dt;
    if (crackT <= 0) {
      crackT = 0.05 + Math.random() * 0.35 / (0.3 + scene.fire);
      const v = 0.02 + scene.fire * 0.05, n = Math.random() < 0.3 ? 2 : 1;
      onBus(ambBus, () => { for (let i = 0; i < n; i++) noise(0.012 + Math.random() * 0.02, 'highpass', 1800 + Math.random() * 2600, 0.8, v * (0.5 + Math.random()), i * 0.03); });
    }
  }
  // 迫る大軍：地鳴り（大勢の足音）が近づくほど厚く、甲冑の擦れがざわざわと重なり、敵の陣太鼓と鬨の声が向こうの方角から大きくなる
  const ap = scene.approach || 0, apPan = scene.approachPan || 0, apD = scene.approachDist || 80;
  if (ap > 0.02 || rumbleNode) {
    if (!rumbleNode) rumbleNode = loop(95, 'lowpass', 0.9);
    // 焼けた地鳴り（足音と小札）に差し替える。近いほど一つ一つの足音まで聞こえる
    if (!rumbleNode.baked && has('army')) swapLoop(rumbleNode, 'army');
    const bk = rumbleNode.baked;
    rumbleNode.g.gain.setTargetAtTime((bk ? 0.3 : 0.16) * ap, now, 1.2);
    rumbleNode.f.frequency.setTargetAtTime(bk ? 160 + ap * ap * 1600 : 80 + ap * 90, now, 1.5);
  }
  // 近くを駆ける騎馬の群れ：腹に来る低い地鳴りと、幾頭もの蹄の重なり（scene.hoofRumble 0〜1）
  const hr = scene.hoofRumble || 0;
  if (hr > 0.02 || hoofNode) {
    if (!hoofNode) hoofNode = loop(55, 'lowpass', 0.7);
    hoofNode.g.gain.setTargetAtTime(0.5 * MIX.hoofRumble * hr, now, 0.6);
    hoofNode.f.frequency.setTargetAtTime(45 + hr * 50, now, 0.8);
    if (hr > 0.3) {
      hoofHerdT -= dt;
      if (hoofHerdT <= 0) { hoofHerdT = 1.9 + Math.random() * 0.4; sfx('gallop', 0.25 + 0.75 * hr); }
    }
  }
  if (ap > 0.12) {
    clankT -= dt;
    if (clankT <= 0) {
      clankT = 0.12 + (1 - ap) * 0.5;
      onBus(ambBus, () => { for (let i = 0; i < 2; i++) noise(0.03, 'bandpass', 2600 + Math.random() * 1800, 5, 0.012 * ap, i * 0.05); });
    }
    foeDrumT -= dt;
    if (foeDrumT <= 0) {
      // 近いほど速く打つ（遠い：ゆっくり二つ、近い：早打ち）
      foeDrumT = 2.6 - ap * 1.6;
      const lag = Math.min(0.4, apD / 343), v = 0.25 + ap * 0.6, n = ap > 0.5 ? 3 : 2;
      onBus(ambBus, () => withPanAmb(apPan * 0.9, () => through(Math.max(500, 4000 - apD * 20), () => { for (let i = 0; i < n; i++) { const t0 = lag + i * (ap > 0.5 ? 0.22 : 0.45); if (!play('taiko', 0.32 * v, { t0, wet: 0.35, rate: 0.85 })) tone('sine', 88, 40, 0.6, 0.35 * v, t0); } }, 5)));
    }
    foeShoutT -= dt;
    if (foeShoutT <= 0) {
      foeShoutT = 7 + Math.random() * 6 - ap * 4;
      onBus(ambBus, () => withPanAmb(apPan * 0.9, () => through(Math.max(700, 5000 - apD * 25), () => foeShout(0.4 + ap * 0.8))));
    }
  }
  // 押されている時：低く張り詰めた弦のような唸りが下に敷かれ、曲も厚くなる
  const ten = scene.tense || 0;
  if (ten > 0.05 || tenseNode) {
    if (!tenseNode) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55 * 1.498;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(g.gain);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus || master); o1.start(); o2.start(); lfo.start();
      tenseNode = { g, f, lg };
    }
    tenseNode.g.gain.setTargetAtTime(0.03 * ten, now, 1.5);
    tenseNode.lg.gain.setTargetAtTime(0.012 * ten, now, 1.5);
    tenseNode.f.frequency.setTargetAtTime(220 + ten * 400, now, 2);
    if (music && ten > 0.3) music.setIntensity(Math.min(1, Math.max(heatLv, crowdLv) + ten * 0.4));
  }
  // 味方が崩れかけた瞬間：後ろの本陣から法螺貝が鳴り、味方の叫びが上がる（二十五秒に一度まで）
  if (scene.crumble && now - lastCrumble > 20) {
    lastCrumble = now; scene.crumble = 0;
    onBus(ambBus, () => { withPanAmb(-apPan * 0.5, () => through(2600, () => horagai(0.6))); });
    sfx('shout', 0.9);
    sfx('umeki', 0.5);
  }
  // 雹：石まじりの雨が笠と具足を硬く叩く（かち、こつ）
  if (scene.hail > 0.02) {
    hailT -= dt;
    if (hailT <= 0) {
      hailT = 0.03 + Math.random() * 0.07 / scene.hail;
      const metal = Math.random() < 0.35;
      onBus(ambBus, () => {
        if (metal) tone('triangle', 2200 + Math.random() * 1600, 1900, 0.04, 0.012 * scene.hail);
        noise(0.018, 'bandpass', metal ? 4200 : 1500 + Math.random() * 1200, 2, (0.03 + Math.random() * 0.04) * scene.hail);
      });
    }
  }
  // 584：大勢が歩く地鳴りと、小札の擦れる音
  if (march > 0 || marchNode) {
    if (!marchNode) marchNode = loop(110, 'lowpass', 0.8);
    if (!marchNode.baked && has('army')) { swapLoop(marchNode, 'army'); marchNode.f.frequency.value = 700; }
    marchNode.g.gain.setTargetAtTime((marchNode.baked ? 0.13 : 0.1) * march, now, 0.6);
    if (march > 0.05) {
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 0.3 + Math.random() * 0.12;
        // ぬかるみ・雨の後は、泥を踏む「ぐちゃ」という湿った足音に
        onBus(ambBus, () => { for (let i = 0; i < 3; i++) { if (o.wet) noise(0.09, 'bandpass', 700 + Math.random() * 400, 2.2, 0.05 * march, Math.random() * 0.12); else noise(0.06, 'lowpass', 350 + Math.random() * 200, 0.8, 0.05 * march, Math.random() * 0.12); } if (Math.random() < 0.6) sfx('kozane', 0.6 * march); });
      }
    }
  }
  // 588：激しい戦のあと、しばらく静かなら「戦の後」の音に
  if (o.heat > 0.4) { warT += dt; calmT = 0; if (o.heat > 0.6) quiet = false; }
  else if (o.calm) { calmT += dt; if (warT > 20 && calmT > 6) { quiet = true; warT = 0; } }
  if (quiet) {
    crowT -= dt;
    if (crowT <= 0) {
      crowT = 5 + Math.random() * 9;
      // 烏の声「カア、カア」
      onBus(ambBus, () => withPanAmb((Math.random() - 0.5) * 1.6, () => through(2600, () => { const n = 2 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) voice([['a', 0.26, 1]], { f0: 520 + Math.random() * 60, vol: 0.02, rasp: 0.9, t0: i * 0.42, fm: 1.3 }); })));
    }
    groanT -= dt;
    if (groanT <= 0) { groanT = 7 + Math.random() * 10; onBus(ambBus, () => withPanAmb((Math.random() - 0.5) * 1.6, () => sfx('umeki', 0.35))); }
  }
  // 平時は鳥の声（夜は虫）
  if (o.calm && nature > 0.2 && !quiet && !night && !cold && scene.birds) {
    chirpT -= dt;
    if (chirpT <= 0) {
      chirpT = (3 + Math.random() * 7) / (0.4 + woods) * (local && world.mood === 'morning' ? 0.65 : 1);
      const f0 = 2600 + Math.random() * 1200;
      onBus(ambBus, () => { for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone('sine', f0, f0 * 1.25, 0.07, 0.015 * nature, i * 0.11); });
    }
    // 587：鳶の「ピーヒョロロ」がときどき高く
    kiteT -= dt;
    if (kiteT <= 0) {
      kiteT = 30 + Math.random() * 35 + woods * 20;
      onBus(ambBus, () => { tone('sine', 1700, 2500, 0.45, 0.012); for (let i = 0; i < 3; i++) tone('sine', 2300 - i * 120, 1900 - i * 120, 0.16, 0.009, 0.55 + i * 0.18); });
    }
  }
  // 旗が風で鳴る：ばたばたと布が打つ音を、突風の強さで（o.flap 0〜1.5）
  if (o.flap > 0.05) {
    flapT -= dt;
    if (flapT <= 0) {
      flapT = 0.35 + Math.random() * 0.9 / (0.5 + o.flap);
      const v = Math.min(0.05, 0.015 + o.flap * 0.025), n = 2 + Math.floor(Math.random() * 3);
      onBus(ambBus, () => withPanAmb((Math.random() - 0.5) * 1.2, () => { for (let i = 0; i < n; i++) noise(0.045, 'bandpass', 420 + Math.random() * 380, 1.1, v * (1 - i * 0.18), i * (0.07 + Math.random() * 0.04)); }));
    }
  }
  // 夏の昼は蝉（静かな時ほどよく聞こえ、戦が激しいとかき消される）
  const semi = o.summer && !night && !cold && !quiet ? nature * woods : 0;
  if (semi > 0 || cicadaNode) {
    if (!cicadaNode) cicadaNode = loop(5200, 'bandpass', 3);
    cicadaNode.g.gain.setTargetAtTime(0.022 * semi * (0.7 + 0.3 * Math.sin(now * 0.7)), now, 0.8);
  }
  // 雨上がりは蛙（田や川のそば）
  if ((o.after || night) && nature > 0.4 && !cold && Math.max(river, paddy) > 0.25) {
    frogT -= dt;
    if (frogT <= 0) {
      frogT = 0.5 + Math.random() * 1.6;
      const f = 380 + Math.random() * 260, n = 2 + Math.floor(Math.random() * 3);
      onBus(ambBus, () => withPanAmb((Math.random() - 0.5) * 1.6, () => { for (let i = 0; i < n; i++) { noise(0.05, 'bandpass', f, 6, 0.03, i * 0.11); tone('triangle', f * 0.5, f * 0.45, 0.05, 0.006, i * 0.11); } }));
    }
  }
  if (night && !cold && nature > 0.4) {
    // 587：鈴虫のリーン、リーン
    insectT -= dt;
    if (insectT <= 0) {
      insectT = (1.2 + Math.random() * 2.4) / (0.5 + Math.max(woods, paddy));
      const f = 4100 + Math.random() * 500;
      onBus(ambBus, () => { for (let i = 0; i < 6; i++) tone('sine', f, f * 0.99, 0.035, 0.006 * nature, i * 0.045); });
    }
  }
  heatLv = o.heat || 0;
  warMusicMood(dt, o);
  const cue = musicNow();
  if (music && !warMusic.name) music.setIntensity(Math.max(heatLv, crowdLv));
  // 楽の音：平時は尺八のような長い息、戦いが激しくなるほど太鼓が重なる（戦の後は太鼓を止める）
  // 曲が鳴っている間は、曲に任せる
  if (!cue && !o.aftermath) onBus(musicBus, () => {
    if (o.calm) {
      droneT -= dt;
      if (droneT <= 0) {
        droneT = (quiet ? 12 : 6) + Math.random() * 5;
        const f0 = [293.7, 311.1, 392, 440][Math.floor(Math.random() * 4)] / 2;
        breath(f0, quiet ? 0.03 : 0.05);
      }
    }
    if (o.heat > 0.2 && !quiet) {
      beatT -= dt;
      if (beatT <= 0) {
        beatT = o.heat > 0.7 ? 0.42 : 0.84;
        beatN++;
        tone('sine', 80, 40, 0.5, 0.09 + 0.1 * o.heat);
        if (o.heat > 0.5 && beatN % 2 === 0) tone('sine', 130, 70, 0.25, 0.06 * o.heat, 0.21);
        if (o.heat > 0.75 && beatN % 4 === 0) noise(0.08, 'bandpass', 2200, 3, 0.05);
      }
    }
  });
  // 深手のときは心音
  if (o.hurt) {
    // 鳴り始めは強く、8 秒ほどたつと小さくして耳障りにしない（深手が治ればまた初めから）
    hurtOn += dt;
    heartT -= dt;
    // 傷が深いほど鼓動が速く・強く（o.hurtK 0〜1）。深い時は慣れで小さくしない
    const hk = o.hurtK || 0;
    if (heartT <= 0) { heartT = 0.95 - hk * 0.4; sfx('heart', (0.7 + hk * 0.5) * Math.max(0.35 + hk * 0.6, 1 - Math.max(0, hurtOn - 8) / 10)); }
  } else hurtOn = 0;
  // 甲冑の擦れ：近くを歩く兵が多いほど・戦が激しいほど、小札と草摺が擦れ合う音が左右のあちこちから（一度に二、三枚ずつ）
  const rl = Math.max(o.march || 0, (o.heat || 0) * 0.8);
  if (rl > 0.08 && !quiet) {
    rustleT -= dt;
    if (rustleT <= 0) {
      rustleT = 0.16 + (1 - rl) * 0.55 + Math.random() * 0.25;
      const pan = Math.random() * 2 - 1, n = 2 + Math.floor(Math.random() * 3), v = 0.006 + 0.013 * rl;
      onBus(ambBus, () => withPanAmb(pan * 0.8, () => { for (let i = 0; i < n; i++) noise(0.01 + Math.random() * 0.012, 'bandpass', 2000 + Math.random() * 2800, 6, v * (0.6 + Math.random() * 0.6), i * (0.03 + Math.random() * 0.03)); noise(0.09, 'bandpass', 900 + Math.random() * 300, 1.5, v * 0.35, 0.02); }));
    }
  }
  // 遠くの打ち合い：激しい時は、左右や後ろの遠くでも槍の柄と刃の打ち合う音がこもって届く（戦場がこの周りだけではない）
  if ((o.heat || 0) > 0.3 || o.aftermath) {
    farClashT -= dt;
    if (farClashT <= 0) {
      farClashT = o.aftermath ? 2 + Math.random() * 3 : 0.4 + Math.random() * 1.4 / o.heat;
      const pan = Math.random() * 2 - 1, f = o.aftermath ? 550 : 1300 + Math.random() * 1600, v = o.aftermath ? 0.008 : 0.012 + 0.03 * o.heat * Math.random();
      onBus(ambBus, () => withPanAmb(pan, () => through(f, () => {
        tone('triangle', 700 + Math.random() * 900, 520 + Math.random() * 300, 0.12 + Math.random() * 0.1, v);
        noise(0.03, 'bandpass', 1400 + Math.random() * 800, 2, v * 1.2);
        if (Math.random() < 0.5) noise(0.05, 'lowpass', 500, 1, v * 0.8, 0.08 + Math.random() * 0.1);
      }, 3)));
    }
  }
  // 深手の呻き：傷が深い時、ときどき歯を食いしばった低い声が漏れる
  if (o.hurt && (o.hurtK || 0) > 0.3) {
    ughT -= dt;
    if (ughT <= 0) {
      ughT = 6 + Math.random() * 7 - (o.hurtK || 0) * 3;
      const v = 0.03 + 0.04 * (o.hurtK || 0);
      onBus(ambBus, () => through(900, () => { tone('sawtooth', 128 + Math.random() * 20, 92, 0.34, v); noise(0.3, 'bandpass', 420, 2, v * 0.6); }, 3));
    }
  }
  // 自分の息：走り続けると息が上がり、気力が尽きかけると荒い息（o.pant は 0〜1）
  if (o.pant > 0.05) {
    pantT -= dt;
    if (pantT <= 0) {
      pantT = 0.62 - o.pant * 0.22 + Math.random() * 0.08;
      const v = 0.05 + o.pant * 0.09;
      // 吸う息は細く高く、吐く息は太く低く、ときどき喉が鳴る。一息ごとに少しずつ違う
      const fi = 1150 + Math.random() * 250, fo = 700 + Math.random() * 160;
      onBus(ambBus, () => {
        noise(0.14 + Math.random() * 0.05, 'bandpass', fi, 2.2, v * 0.6);
        noise(0.2 + Math.random() * 0.06, 'bandpass', fo, 1.4, v, 0.2);
        if (o.pant > 0.6 && Math.random() < 0.3) tone('sawtooth', 150 + Math.random() * 30, 120, 0.14, v * 0.25, 0.22);
      });
    }
  }
}

export function silence() {
  stopWarMusic(0.3);
  speechUntil = 0; commandUntil = 0; dangerUntil = 0;
  if (ctx) {
    for (const slot of mixSlots) { slot.muted = true; if (slot.node) { slot.node.disconnect(); slot.node.gain.cancelScheduledValues(ctx.currentTime); slot.wet.gain.cancelScheduledValues(ctx.currentTime); slot.wet.gain.setValueAtTime(0, ctx.currentTime); } }
    for (const n of [ambDuck, musicDuck]) if (n) { n.gain.cancelScheduledValues(ctx.currentTime); n.gain.setValueAtTime(1, ctx.currentTime); n._d = null; }
  }
  if (muffle) { muffle.frequency.cancelScheduledValues(ctx.currentTime); muffle.frequency.setValueAtTime(20000, ctx.currentTime); deafUntil = 0; }
  setRain(0);
  setCrowd(0);
  if (crowdNode) crowdNode.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  if (windNode) windNode.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  for (const n of [riverNode, marchNode, cicadaNode, fireNode, rumbleNode, tenseNode, hoofNode]) if (n) n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  Object.assign(scene, { river: 0, night: false, cold: false, wind: 0, birds: true, rainLv: 0, fire: 0, fireFar: 0, hail: 0, approach: 0, tense: 0, crumble: 0, hoofRumble: 0 });
  if (tenseNode) tenseNode.lg.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  quiet = false; warT = 0; calmT = 0;
  landSound.world = null; landSound.t = 0;
  farWarT = 12 + Math.random() * 10; chirpT = 3; kiteT = 20; insectT = 1; frogT = 2;
}
