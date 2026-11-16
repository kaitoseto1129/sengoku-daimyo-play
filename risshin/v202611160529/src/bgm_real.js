// 本物の曲（K322 大河の曲・自作。管弦楽は VSCO-2 CE（CC0）の生の音、琴と笛の息は合成。出所は docs/CREDITS.md）と法螺貝（freesound・CC0）。
// 重く荘厳・哀愁の七曲。題・地図・戦の前・合戦（静かな層と激しい層）・勝ち・負けで分ける。譜面は prototype/tools/bgm_taiga/score.py。
// 場面の曲を輪で回し、替わりは重ねて切り替える。戦の中は静かな層と激しい層を同時に回し、戦の熱さで混ぜる（二つは同じ長さ・同じ拍）。
// 読み込みは曲が要る時まで遅らせる（m4a・72kbps）。読めなければ play が false を返し、audio.js は自作の曲に戻る。
const URLS = {
  title: 'taiga_title.m4a', sanga: 'taiga_map.m4a', pre: 'taiga_pre.m4a',
  warLow: 'taiga_war_low.m4a', warHigh: 'taiga_war_high.m4a', gaika: 'taiga_victory.m4a', aika: 'taiga_defeat.m4a',
};
// 曲ごとの大きさ合わせ（どれも約 -15 LUFS で焼いた。前の曲と同じ大きさに上げる）
const NORM = { title: 1.35, sanga: 1.35, pre: 1.4, warLow: 1.3, warHigh: 1.3, gaika: 1.3, aika: 1.35 };
// 場面 → { 曲: 混ぜ具合 }。合戦の三段は同じ二曲の混ぜ方だけが違う（頭がそろったまま移る）
const SCENES = {
  title: { title: 1 }, promote: { gaika: 1 },
  map: { sanga: 1 }, honjin: { sanga: 1 }, town: { sanga: 1 },
  victory: { gaika: 1 }, defeat: { aika: 1 },
  prebattle: { pre: 1 },
  battle: { warLow: 1, warHigh: 0.5 },
  climax: { warLow: 0.55, warHigh: 1 },
  tension: { warLow: 0.5, warHigh: 0.85 },
};
export const REAL_WAR = new Set(['prebattle', 'battle', 'climax', 'tension']);

export function createRealBgm(ctx, dest) {
  const out = ctx.createGain(); out.connect(dest);
  const base = (f) => new URL('../assets/bgm/' + f, import.meta.url).href;
  const bufs = {}, loading = {}, failed = new Set(), live = {};
  let cur = null, token = 0;

  function load(k, file = URLS[k]) {
    if (bufs[k]) return Promise.resolve(bufs[k]);
    if (failed.has(k)) return Promise.reject(new Error(k));
    return loading[k] ||= fetch(base(file)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((a) => new Promise((ok, ng) => ctx.decodeAudioData(a, ok, ng)))
      .then((b) => (bufs[k] = b))
      .catch((e) => { failed.add(k); delete loading[k]; throw e; });
  }
  function ramp(g, v, tc) {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(v, t, Math.max(0.05, tc));
  }
  function start(k, tc) {
    if (live[k]) return live[k];
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = bufs[k]; src.loop = true; g.gain.value = 0;
    src.connect(g); g.connect(out); src.start();
    return (live[k] = { src, g });
  }
  function drop(k, fade) {
    const l = live[k]; if (!l) return;
    delete live[k];
    ramp(l.g, 0, fade / 3);
    setTimeout(() => { try { l.src.stop(); l.src.disconnect(); l.g.disconnect(); } catch (e) { /* 止まり済み */ } }, fade * 1000 + 400);
  }

  return {
    // 曲を替える。頼めた（読んでいる最中も含む）なら true、この場面に本物の曲が無い・読めない時は false
    play(name, o = {}) {
      const mix = SCENES[name];
      if (!mix) return false;
      const keys = Object.keys(mix);
      if (keys.some((k) => failed.has(k))) return false;
      const fade = o.fadeIn ?? (REAL_WAR.has(name) && cur && REAL_WAR.has(cur) ? 3 : 2.5);
      const my = ++token; cur = name;
      const apply = () => {
        if (my !== token) return;
        for (const k of Object.keys(live)) if (!(k in mix)) drop(k, o.fadeOut ?? 2.5);
        for (const k of keys) { const l = start(k); ramp(l.g, mix[k] * NORM[k], fade / 3); }
      };
      const need = keys.filter((k) => !bufs[k]);
      if (!need.length) apply();
      else Promise.all(keys.map((k) => load(k))).then(apply).catch(() => { if (my === token) cur = null; });
      return true;
    },
    stop(fade = 2) {
      token++; cur = null;
      for (const k of Object.keys(live)) drop(k, fade);
    },
    now: () => cur,
    stats: () => ({ now: cur, live: Object.keys(live), loaded: Object.keys(bufs), failed: [...failed] }),
    // 法螺貝：戦の始まり。一度鳴らせば二十秒は鳴らさない
    horn(vol = 0.7, delay = 0.4) {
      const now = performance.now();
      if (this._hornAt && now - this._hornAt < 20000) return;
      this._hornAt = now;
      load('horagai', 'horagai_ohrwurm.m4a').then((b) => {
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = b; g.gain.value = vol; s.connect(g); g.connect(out); s.start(ctx.currentTime + delay);
      }).catch(() => {});
    },
    // 曲が鳴る前に取っておく（本陣へ入る時などに）
    preload(name) { for (const k of Object.keys(SCENES[name] || {})) load(k).catch(() => {}); },
  };
}
