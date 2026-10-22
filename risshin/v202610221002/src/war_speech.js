// 戦の肉声（焼いた日本語の声と、本物の群声の録音）。素材は asset_voice.js（tools/voice_bake.mjs が作る）。
// 声：VOICEVOX:玄野武宏・剣崎雌雄・雀松朱司・麒ヶ島宗麟。録音：freesound の CC0（docs/CREDITS.md）。
// ・字幕が出た時に、同じ言葉の声があれば鳴らす（無ければ字幕の中の下知の言葉だけ）。
// ・話し手の場所から聞こえる：遠いほど小さく、高い音を落とし、少し遅れて届く。左右も分ける。
// ・同時に鳴る声は三本、群声は三本まで。音の箱と道筋は初めに作り、毎コマは作らない。
import { S } from './settings.js';
import { takePosition, releasePosition } from './audio_positions.js';

const STRIP = /[\s　、。，．…！!？?・「」『』（）()〜~―—-]/g;
const norm = (t) => String(t || '').replace(STRIP, '');
// 名のある将の声は年かさの声（3）。ほかは名から決めて、同じ人はいつも同じ声
const LORD = /信長|義元|大将|殿|御屋形|お屋形|勝家|秀吉|光秀|家康|信玄|勝頼|長政|義景|謙信|旗本|本陣/;
const CROWD_OF = { toki: ['charge', 'shout'], eiei: ['shout', 'charge'], shout: ['charge', 'shout'], eshout: ['clash', 'shout'], cry: ['fall'], umeki: ['umeki', 'fall'] };
const CROWD_GAP = { charge: 5, shout: 3.5, clash: 2.5, fall: 0.9, umeki: 2.5 };

let asset = null, loading = null, ctx = null, voiceBus = null, crowdBus = null, voiceSlots = null, crowdSlots = null;
let compressor = null;
const audioUsers = new Set();
let exact = null, commands = null, houses = null, names = null;
const buffers = new Map();

let loadGeneration = 0;
export function releaseWarSpeech() {
  loadGeneration++;
  asset = loading = exact = commands = houses = names = null; buffers.clear();
}
export function loadWarSpeech() {
  if (asset || loading) return loading;
  const generation = loadGeneration;
  loading = import('./asset_reader.js').then(({ readAsset }) => readAsset('voice', 'voice')).then((m) => {
    if (generation !== loadGeneration) return;
    asset = m; exact = new Map(); commands = []; houses = new Map(); names = new Map();
    for (const [text, clip, voice, kind] of m.LINES) {
      const k = norm(text);
      if (kind === 2) houses.set(k.replace(/が家来$/, ''), clip);
      else if (kind === 3) names.set(k.replace(/なり$/, ''), clip);
      else {
        if (!exact.has(k)) exact.set(k, []);
        exact.get(k).push([clip, voice]);
        if (kind === 1 && !commands.some((c) => c.key === k)) commands.push({ key: k });
      }
    }
    for (const c of commands) c.clips = exact.get(c.key);
    commands.sort((a, b) => b.key.length - a.key.length);
  }).catch(() => { if (generation === loadGeneration) loading = null; });
  return loading;
}
function audio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = compressor = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    voiceBus = ctx.createGain(); crowdBus = ctx.createGain();
    voiceBus.gain.value = 0; crowdBus.gain.value = 0;
    voiceBus.connect(comp); crowdBus.connect(comp);
    const slot = (bus) => {
      const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
      filter.type = 'lowpass'; filter.Q.value = 0.5;
      gain.connect(filter); filter.connect(pan); pan.connect(bus);
      const s = { gain, filter, pan, source: null, until: 0, dist: 0 };
      s.stopPosition = () => {
        if (s.source) { s.source.onended = null; try { s.source.stop(); } catch (_) { /* 終了済み */ } s.source.disconnect(); s.source = null; }
        s.gain.gain.cancelScheduledValues(ctx.currentTime); s.gain.gain.value = 0; s.until = 0;
      };
      return s;
    };
    voiceSlots = Array.from({ length: 3 }, () => slot(voiceBus));
    crowdSlots = Array.from({ length: 3 }, () => slot(crowdBus));
    return true;
  } catch (_) { ctx = null; return false; }
}
// 焼いた声は鳴らす時に解く。解いた物は四十八まで覚えて、古い物から捨てる
function buffer(i) {
  if (buffers.has(i)) { const p = buffers.get(i); buffers.delete(i); buffers.set(i, p); return p; }
  const bytes = asset.CLIPS[i].slice();
  const p = new Promise((ok) => {
    try { const r = ctx.decodeAudioData(bytes.buffer, ok, () => ok(null)); if (r && r.catch) r.catch(() => ok(null)); } catch (_) { ok(null); }
  });
  buffers.set(i, p);
  while (buffers.size > 48) buffers.delete(buffers.keys().next().value);
  return p;
}

export function createWarSpeech(rt) {
  const owner = {}; audioUsers.add(owner);
  let disposed = false, lastVoice = -1, atPos = null, atT = -1;
  const crowdT = {};
  loadWarSpeech();
  function allowed() { return !disposed && !document.hidden && !rt.game.paused && !rt.game.photo && !rt.def.town && !rt.def.dojo; }
  function sync() {
    if (!ctx) return;
    voiceBus.gain.setTargetAtTime(allowed() ? 0.9 * S.volume * S.volVoice : 0, ctx.currentTime, 0.05);
    crowdBus.gain.setTargetAtTime(allowed() ? 0.55 * S.volume * S.volSfx : 0, ctx.currentTime, 0.05);
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
  async function play(slots, clip, pos, vol, rate = 1, then = null) {
    if (!allowed() || !ctx || ctx.state !== 'running' || S.volume <= 0) return false;
    const r = route(pos);
    if (!r || r.d > 160) return false;
    if (!Number.isFinite(r.d) || !Number.isFinite(r.pan) || !Number.isFinite(vol) || !Number.isFinite(rate) || rate <= 0) return false;   // 位置が NaN の兵の声で setValueAtTime が投げた（墨俣 10/20 実機）
    const now = ctx.currentTime;
    let slot = null;
    for (const s of slots) if (s.until <= now) { slot = s; break; }
    // 席が埋まっていたら、いま鳴っている一番遠い声より近い時だけ替わる
    if (!slot) { for (const s of slots) if (s.dist > r.d + 10 && (!slot || s.dist > slot.dist)) slot = s; if (!slot) return false; }
    slot.until = now + 0.6; slot.dist = r.d;
    const buf = await buffer(clip);
    if (!buf || !allowed() || ctx.currentTime - now > 0.8) { slot.until = 0; return false; }
    if (!takePosition(slot, slots === voiceSlots ? 3 : 1, r.d, r.d / 340 + buf.duration / rate + .05, slot.stopPosition)) { slot.until = 0; return false; }
    if (slot.source) { try { slot.source.stop(); } catch (_) { /* もう止まっている */ } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const t = ctx.currentTime + r.d / 340;
    slot.gain.gain.setValueAtTime(Math.min(1.4, vol) / (1 + (r.d / 22) ** 1.3), t);
    slot.filter.frequency.setValueAtTime(Math.max(450, 9000 / (1 + r.d / 28)), t);
    slot.pan.pan.setValueAtTime(r.pan, t);
    src.connect(slot.gain);
    slot.source = src;
    slot.until = t + buf.duration / rate + 0.05;
    src.onended = () => { src.disconnect(); if (slot.source === src) { slot.source = null; if (then) then(); } };
    src.start(t);
    return true;
  }
  function voiceFor(speaker, list) {
    let want = -1;
    if (speaker && LORD.test(speaker)) want = 3;
    else if (speaker && !/兵|足軽|味方|^敵/.test(speaker)) { let h = 0; for (const ch of speaker) h = (h * 31 + ch.charCodeAt(0)) % 997; want = h % 3; }
    let pick = list.find((x) => x[1] === want);
    if (!pick) { const others = list.filter((x) => x[1] !== lastVoice); pick = (others.length ? others : list)[Math.floor(Math.random() * (others.length || list.length))]; }
    lastVoice = pick[1];
    return pick;
  }
  // 話し手のいる所：名が分かればその人、無ければ近くのその陣営の兵
  function whereFrom(speaker, unit) {
    if (unit?.pos) return unit.pos;
    if (atPos && rt.t - atT < 0.5) return atPos;
    const me = rt.player?.u;
    if (!me) return null;
    const foe = !!speaker && (/^敵|の兵$/.test(speaker) && !/^味方/.test(speaker));
    let best = null, bd = 30;
    for (const u of rt.army.units) {
      if (!u.alive || u.isStruct || u === me || (u.team !== me.team) !== foe) continue;
      const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
      if (d < bd) { bd = d; best = u; }
    }
    return best ? best.pos : me.pos;
  }
  function say(speaker, text, unit, quietIfNoMatch) {
    if (!asset || !ctx) return 0;
    const k = norm(text);
    const list = exact.get(k);
    const pos = whereFrom(speaker, unit);
    const rate = 0.97 + Math.random() * 0.06;
    if (list) { const [clip] = voiceFor(speaker, list); void play(voiceSlots, clip, pos, 1, rate); return 2; }
    // 名乗り：「家が家来、名なり！」は二つの声を続けて
    const nm = /^(?:(.+?)が家来)?(.+?)なり$/.exec(k);
    if (nm && names.has(nm[2])) {
      const nameClip = names.get(nm[2]), houseClip = nm[1] ? houses.get(nm[1]) : null;
      let h = 0; for (const ch of nm[2]) h = (h * 31 + ch.charCodeAt(0)) % 997;
      const r2 = 0.94 + (h % 9) * 0.012;
      if (houseClip != null) void play(voiceSlots, houseClip, pos, 1, r2, () => void play(voiceSlots, nameClip, pos, 1, r2));
      else void play(voiceSlots, nameClip, pos, 1, r2);
      return 2;
    }
    if (quietIfNoMatch) return 0;
    for (const c of commands) if (k.includes(c.key)) { const [clip] = voiceFor(speaker, c.clips); void play(voiceSlots, clip, pos, 1, rate); return 1; }
    return 0;
  }
  return {
    get ready() { return !!asset; },
    // 次の兵の声がどこから聞こえるか（soldierCall・名乗り・討ち取りが字幕の前に教える）
    at(pos) { atPos = pos; atT = rt.t; },
    canName(text) { const m = /^(?:(.+?)が家来)?(.+?)なり$/.exec(norm(text)); return !!(asset && m && names.has(m[2])); },
    // 字幕に出た台詞。同じ言葉を声にできたら true（読み上げの声と重ねない）
    line(speaker, text, unit, tts) {
      if (rt.over || !allowed()) return false;
      return say(speaker, text, unit, tts) === 2;
    },
    // 兵の短い声の札（「味方の足軽「押せ！」」の形）
    bark(text) {
      if (rt.over || !allowed()) return;
      const m = /^(.*?)「(.+)」$/.exec(String(text || ''));
      say(m ? m[1] : '', m ? m[2] : text, null, false);
    },
    // 鬨・突撃・斬り合い・倒れの声に、本物の群声を重ねる
    crowd(name, pos, vol = 1) {
      const kinds = CROWD_OF[name];
      if (!kinds || !asset || !ctx || rt.over) return;
      const now = rt.t || 0;
      for (const kind of kinds) {
        const list = asset.CROWD[kind];
        if (!list || (crowdT[kind] ?? -99) + CROWD_GAP[kind] > now) continue;
        crowdT[kind] = now;
        void play(crowdSlots, list[Math.floor(Math.random() * list.length)], pos, vol * (kind === 'fall' || kind === 'umeki' ? 0.8 : 1.1), 0.94 + Math.random() * 0.12);
        return;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearInterval(timer);
      audioUsers.delete(owner);
      if (!audioUsers.size) releaseWarSpeech();
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      if (!audioUsers.size && ctx) {
        for (const slot of [...(voiceSlots || []), ...(crowdSlots || [])]) {
          releasePosition(slot);
          if (slot.source) {
            slot.source.onended = null;
            try { slot.source.stop(); } catch (_) { /* 止め済み */ }
            slot.source.disconnect(); slot.source = null;
          }
          slot.gain.disconnect(); slot.filter.disconnect(); slot.pan.disconnect();
        }
        voiceBus?.disconnect(); crowdBus?.disconnect(); compressor?.disconnect();
        ctx.close().catch(() => {});
        ctx = voiceBus = crowdBus = voiceSlots = crowdSlots = compressor = null;
      }
      atPos = null;
    },
  };
}
