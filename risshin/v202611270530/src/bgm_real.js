// 本物の曲（K322 大河の曲・自作。管弦楽は VSCO-2 CE（CC0）の生の音、琴と笛の息は合成。出所は docs/CREDITS.md）と法螺貝（freesound・CC0）。
// 重く荘厳・哀愁の七曲。題・地図・戦の前・合戦（静かな層と激しい層）・勝ち・負けで分ける。譜面は prototype/tools/bgm_taiga/score.py。
// 場面の曲を輪で回し、替わりは重ねて切り替える。戦の中は静かな層と激しい層を同時に回し、戦の熱さで混ぜる（二つは同じ長さ・同じ拍）。
// 読み込みは曲が要る時まで遅らせる（m4a・72kbps）。読めなければ play が false を返し、audio.js は自作の曲に戻る。
const URLS = {
  title: 'taiga_title.m4a', sanga: 'taiga_map.m4a', pre: 'taiga_pre.m4a',
  warLow: 'taiga_war_low.m4a', warHigh: 'taiga_war_high.m4a', gaika: 'taiga_victory.m4a', aika: 'taiga_defeat.m4a',
  // K299 場面ごとの曲（11/14 kaito「ホーム・稽古場・各ステージで曲を変える」）。譜面は prototype/tools/bgm_taiga/score_scenes.py
  honjin: 'taiga_honjin.m4a', dojo: 'taiga_dojo.m4a', shusse: 'taiga_promote.m4a',
  // K710 11/26：戦以外（題・ホーム・地図・本陣・稽古場・出世・話）は平和な昔の日本の曲（箏・尺八）。大河風の曲は戦の中だけ。譜面は score_peace.py
  peaceHome: 'peace_home.m4a', peaceMap: 'peace_map.m4a', peaceCalm: 'peace_calm.m4a', peaceRise: 'peace_rise.m4a',
};
// 戦の性格（music_war.js の tuneOf：1 渡河・若い戦／2 暗い・悲しい／3 城攻め・籠城／4 勇ましい決戦）ごとの三曲。0（野の合戦）は上の pre・warLow・warHigh
for (const t of [1, 2, 3, 4]) { URLS['pre' + t] = `taiga_t${t}_pre.m4a`; URLS['warLow' + t] = `taiga_t${t}_low.m4a`; URLS['warHigh' + t] = `taiga_t${t}_high.m4a`; }
// 曲ごとの大きさ合わせ（どれも約 -15 LUFS で焼いた。前の曲と同じ大きさに上げる）
const NORM = { title: 1.35, sanga: 1.35, pre: 1.4, warLow: 1.3, warHigh: 1.3, gaika: 1.3, aika: 1.35, honjin: 1.4, dojo: 1.3, shusse: 1.3, peaceHome: 1.3, peaceMap: 1.3, peaceCalm: 1.3, peaceRise: 1.3 };
for (const t of [1, 2, 3, 4]) { NORM['pre' + t] = t === 2 ? 1.45 : 1.4; NORM['warLow' + t] = 1.3; NORM['warHigh' + t] = 1.3; }
// 曲の本当の長さ（秒・譜面の小節×拍）。AAC は終わりに 10〜20ms の無音を足すので、輪はここで切る（継ぎ目の途切れ・カチッを無くす。K299 11/18）
const LOOP = { title: 80, sanga: 64, pre: 48, warLow: 60, warHigh: 60, gaika: 49.6552, aika: 53.3333, honjin: 40, dojo: 36.9231, shusse: 37.5, peaceHome: 68.5714, peaceMap: 58.1818, peaceCalm: 67.2, peaceRise: 54.1935 };
const T_LEN = { 1: [34.2857, 35.5556], 2: [48, 48], 3: [40, 41.7391], 4: [32.7273, 34.2857] };   // [静か, 押し合い・山場]
for (const t of [1, 2, 3, 4]) { LOOP['pre' + t] = T_LEN[t][0]; LOOP['warLow' + t] = LOOP['warHigh' + t] = T_LEN[t][1]; }
// 場面 → { 曲: 混ぜ具合 }。合戦の三段は同じ二曲の混ぜ方だけが違う（頭がそろったまま移る）
const SCENES = {
  // 城下（town）は本物の曲を当てず、9月の自作の四季の曲（music_sep.js）を鳴らす
  title: { peaceHome: 1 }, promote: { peaceRise: 1 },
  map: { peaceMap: 1 }, honjin: { peaceCalm: 1 }, dojo: { peaceCalm: 1 },
  victory: { gaika: 1 }, defeat: { aika: 1 },
  prebattle: { pre: 1 },
  battle: { warLow: 1, warHigh: 0.5 },
  climax: { warLow: 0.55, warHigh: 1 },
  tension: { warLow: 0.5, warHigh: 0.85 },
};
// K299 戦ごとの節（kaito 11/14「各ステージ（戦）で曲を変える」）：押し合い・山場の二曲と同じ拍・同じ長さの、その戦だけの旋律を一本重ねる。
// 譜面は prototype/tools/bgm_taiga/score_battles.py（taiga_b_<戦の id>.m4a・32kbps）。無い戦・読めない時はこの層だけ抜いて鳴らす
// [節の重み, ほかの層に掛ける数]。節を足しても全体の大きさが変わらないように測って決めた（5戦の平均で ±0.1dB・docs/evidence_cloud_1118/K299/loudness.md）
const BATTLE_MIX = { battle: [0.75, 0.86], climax: [0.55, 0.92], tension: [0.5, 0.92] };
export const REAL_WAR = new Set(['prebattle', 'battle', 'climax', 'tension']);
// 入りの強さ（11/19 司令塔「突撃・勝ち・負けの入りを一段」）：勝ちは前の戦の曲を早く引いて0.9秒で立ち上げ、負けは1.8秒で沈むように入る（前は全部2.5秒で、頭の一打が埋もれていた）
//   出世（11/19）は頭の一打（-19dB）を、稽古場は頭の太鼓（-15.6dB、次の0.5秒は -21.6dB）を埋めないよう素早く入る。本陣は頭から満ちた曲なので少し早める。題と山河（地図）は静かに始まる曲なので今のまま2.5秒
const ENTRY = { victory: [0.9, 1.2], defeat: [1.8, 1.6], promote: [2, 2], dojo: [2, 2], honjin: [2, 2], title: [2, 2], map: [2, 2], prebattle: [2, 2] };   // K710：戦の出入り・戦以外の場面の替わりは約2秒で重ねる   // [入り, 前の曲の引き]

// onFail(name, o)：曲を読めなかった時に呼ぶ（K360① 11/17 kaito「BGM が消えた」：読み込みが後から失敗すると何も鳴らないまま止まっていた。audio.js が9月の自作の曲へ戻す）
export function createRealBgm(ctx, dest, onFail = null) {
  const out = ctx.createGain(); out.connect(dest);
  const base = (f) => new URL('../assets/bgm/' + f, import.meta.url).href;
  const bufs = {}, loading = {}, failed = new Set(), live = {};
  let cur = null, token = 0, tune = 0, bkey = null;
  // 戦の場面の混ぜ方を、今の戦の性格の曲に読み替える（pre → pre2 など）。押し合い・山場には戦ごとの節を足す
  const mixOf = (name) => {
    const m = SCENES[name];
    if (!m || !REAL_WAR.has(name)) return m;
    const bm = bkey && BATTLE_MIX[name] && !failed.has(bkey) ? BATTLE_MIX[name] : null;
    const o = {}; for (const k of Object.keys(m)) o[tune ? k + tune : k] = m[k] * (bm ? bm[1] : 1);
    if (bm) o[bkey] = bm[0];
    return o;
  };

  function load(k, file = URLS[k]) {
    if (bufs[k]) return Promise.resolve(bufs[k]);
    if (failed.has(k)) return Promise.reject(new Error(k));
    return loading[k] ||= fetch(base(file)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((a) => new Promise((ok, ng) => ctx.decodeAudioData(a, ok, ng)))
      .then((b) => { delete loading[k]; return (bufs[k] = b); })   // 読み終えたら約束を手放す（trim で外した後に読み直せるように・古い buffer を握らない）
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
    const len = LOOP[k] ?? (k.startsWith('b_') ? (tune ? T_LEN[tune][1] : LOOP.warLow) : 0);   // 戦ごとの節は押し合いの曲と同じ長さ
    if (len && len < src.buffer.duration && len > src.buffer.duration - 0.1) { src.loopStart = 0; src.loopEnd = len; }
    src.connect(g); g.connect(out);
    // 同じ長さの層が鳴っていれば、その頭に合わせて途中から入る（戦ごとの節が後から重なっても拍がずれない）
    const d = src.loopEnd || src.buffer.duration, mate = Object.values(live).find((l) => Math.abs((l.src.loopEnd || l.src.buffer.duration) - d) < 0.05);
    const off = mate ? (ctx.currentTime - mate.t0) % d : 0;
    src.start(0, off);
    return (live[k] = { src, g, t0: ctx.currentTime - off });
  }
  function drop(k, fade) {
    const l = live[k]; if (!l) return;
    delete live[k];
    ramp(l.g, 0, fade / 3);
    setTimeout(() => { try { l.src.stop(); l.src.disconnect(); l.g.disconnect(); } catch (e) { /* 止まり済み */ } trim(); }, fade * 1000 + 400);
  }
  // 読んだ曲を持ちすぎない（K374 11/18：一曲を戻すと 35〜80秒×2ch×4バイト＝12〜28MB。戦ごとの節と性格の曲を全部持つと
  //   長く遊ぶほど数百MBになり、携帯で落ちる元になる）。鳴っている曲と、今の戦の三曲（静か・押し合い・山場）と節だけ残す。外した曲は要る時に読み直す（ファイルは手元の HTTP の控えから）
  function trim() {
    const keep = new Set([...Object.keys(live), ...Object.keys(mixOf(cur) || {})]);   // 読み込み中の場面の曲も外さない
    if (cur && REAL_WAR.has(cur)) for (const b of ['pre', 'warLow', 'warHigh']) keep.add(tune ? b + tune : b);   // 戦の曲でない時（戦を出た後）は戦の三曲を持たない（K643 音）
    if (bkey) keep.add(bkey);
    for (const k of Object.keys(bufs)) if (!keep.has(k) && !loading[k]) delete bufs[k];
  }

  return {
    // 曲を替える。頼めた（読んでいる最中も含む）なら true、この場面に本物の曲が無い・読めない時は false
    play(name, o = {}) {
      const mix = mixOf(name);
      if (!mix) return false;
      const keys = Object.keys(mix);
      if (keys.some((k) => failed.has(k) && k !== bkey)) return false;
      const fade = o.fadeIn ?? ENTRY[name]?.[0] ?? (REAL_WAR.has(name) && cur && REAL_WAR.has(cur) ? 3 : 2.5);
      const my = ++token; cur = name;
      const apply = () => {
        if (my !== token) return;
        for (const k of Object.keys(live)) if (!(k in mix)) drop(k, o.fadeOut ?? ENTRY[name]?.[1] ?? 2.5);
        for (const k of Object.keys(mix)) { const l = start(k); ramp(l.g, mix[k] * NORM[k], fade / 3); }
      };
      const need = keys.filter((k) => !bufs[k]);
      // 別の戦の曲（性格や節が替わった）が読み込みの間も鳴り続けないよう、戦の曲どうしの替わりで新しい曲を待つ時は、今の戦の曲に無い層を先に引く（11/18：新しい戦の始めに前の戦の静かな曲が1.5秒ほど鳴っていた）
      //   同じ戦の中の替わり（静か→押し合い）は、読み終えるまで今の曲を鳴らし続ける（11/19：突撃で押し合いへ上げた時、読み込みの間が無音になっていた）
      const other = (k) => (k.startsWith('b_') ? k !== bkey : (k.match(/^(?:pre|warLow|warHigh)(\d?)$/) || [])[1] !== (tune ? String(tune) : ''));
      if (need.length && REAL_WAR.has(name)) for (const k of Object.keys(live)) if (!(k in mix) && /^(pre|warLow|warHigh|b_)/.test(k) && other(k)) drop(k, 1.2);
      if (!need.length) apply();
      else Promise.all(keys.map((k) => (k === bkey ? load(k).catch(() => { delete mix[k]; }) : load(k)))).then(apply).catch(() => { if (my === token) { cur = null; try { onFail?.(name, o); } catch (e) { /* 戻せなければ無音 */ } } });
      return true;
    },
    // 戦を出る時（K643 音）：鳴っていない・読み込み中でない曲の解いた入れ物を全部手放し、戦ごとの節の札も外す。要る時は読み直す
    release() {
      bkey = null;
      for (const k of Object.keys(bufs)) if (!live[k] && !loading[k]) delete bufs[k];
    },
    stop(fade = 2) {
      token++; cur = null;
      for (const k of Object.keys(live)) drop(k, fade);
    },
    now: () => cur,
    // 戦ごとの曲（0〜4）。戦の曲が鳴っている間に替われば、その場で替える
    setTune(t) {
      t = (t | 0) % 5; if (t === tune) return;
      tune = t;
      if (cur && REAL_WAR.has(cur)) this.play(cur, { fadeIn: 2 });
      trim();
    },
    tune: () => tune,
    // 戦ごとの節（K299）。戦の id を渡す。次の play から重なる（setTune の後に呼ぶと同じ時に替わる）
    setBattle(id) {
      const k = id && /^[a-z0-9_]+$/.test(id) ? 'b_' + id : null;
      if (k === bkey) return;
      if (k && !URLS[k]) { URLS[k] = `taiga_b_${id}.m4a`; NORM[k] = 1.3; }
      bkey = k;
      if (k) load(k).catch(() => {});   // 戦の前（静かな曲の間）に読んでおき、押し合いの頭で待たせない
      if (cur && REAL_WAR.has(cur)) this.play(cur, { fadeIn: 2 });
      trim();
    },
    battle: () => bkey,
    // 今の場面で鳴っている曲の札（確かめ用）
    tracks: () => Object.entries(mixOf(cur) || {}).map(([k, v]) => URLS[k] + (v === 1 ? '' : '×' + +v.toFixed(2))),
    stats: () => ({ now: cur, tune, live: Object.keys(live), loaded: Object.keys(bufs), failed: [...failed] }),
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
    // 突撃の押し（11/19）：曲全体を k 倍に素早く上げ、sec 秒後にゆっくり戻す。重ねて呼んでも k 倍より上がらない
    //   delay 秒あとから上げる（下知の鬨の間は audio.js が曲を下げるので、その明けに合わせる）
    swell(k = 1.45, sec = 3, delay = 0) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(k, t + delay, delay ? 0.2 : 0.08); out.gain.setTargetAtTime(1, t + delay + sec, 1.2);
    },
    // 曲が鳴る前に取っておく（本陣へ入る時などに）
    preload(name) { for (const k of Object.keys(mixOf(name) || {})) load(k).catch(() => {}); },
  };
}
