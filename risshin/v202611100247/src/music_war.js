// 戦の曲（kaito 11/9）：戦以外の曲（music.js の title・town など）とは別に、戦だけで鳴らす自作の曲。
// 手本の雰囲気は大河ドラマの勇壮な合戦の曲（低い弦の刻みが続き、太鼓が脈を打ち、金管の主題で高まる）。旋律は自作で、既存曲の写しではない。
// 外の素材は無し。music.js の楽器（弦・太鼓・法螺・笛）を組み合わせるだけで、音源の数の上限（cap）もそのまま。
// 戦ごとに曲が変わる：tune（戦の名から決める 0〜3）で、音階・和音・主題の形を替える。
// 段（stage）：0 通常／1 テンポ上昇／2 低音と太鼓が前に出る／3 ほぼ無音（呼吸だけ）／4 主題が戻る。天王寺の BGM 五段階はこれに合わせる。
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 音階（D からの半音）と和音の進み。和音は music.js の CH の名前
const MODES = { min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10], hmin: [0, 2, 3, 5, 7, 8, 11] };
const ROOT_MIDI = { Dm: 38, Bb: 34, A: 33, Gm: 43, Eb: 39, D: 38, F: 41, C: 36, G: 43 };
const TUNES = [
  { mode: 'min', chords: ['Dm', 'Dm', 'Bb', 'A'] },
  { mode: 'dor', chords: ['Dm', 'Gm', 'Dm', 'A'] },
  { mode: 'phr', chords: ['Dm', 'Eb', 'Dm', 'A'] },
  { mode: 'hmin', chords: ['Dm', 'Bb', 'Gm', 'A'] },
  // 4 勇ましい主題（kaito 11/9「真田丸のような雰囲気」）：下がっていく和音（Dm→C→Bb→A）の上を、高い弦の速い刻みが走り、金管が跳ねて上がる。旋律は自作
  { mode: 'min', chords: ['Dm', 'C', 'Bb', 'A'], motif: 3, drive: true },
];
// 戦ごとの曲（徳川C 11/9）：戦の性格で当てる。0 野の合戦／1 渡河・若い戦／2 暗い・悲しい（焼き討ち・落城・退き口・夜）／3 張りつめた城攻め・籠城／4 勇ましい決戦。
// 表に無い戦は名前から決める（前と同じ）
const BATTLE_TUNE = {
  inou: 1, okehazama: 1, moribe: 1, sunomata: 1, k02_kawada: 1, k02_kisogawa: 1, k04_kuisegawa: 1, kizugawa: 1, k08_kizugawaguchi: 1, k08_osaka_kizu: 1, t03_komaki: 1,
  hieizan: 2, hiei_mtn: 2, nagashima: 2, honnoji: 2, arioka: 2, tottori: 2, takato: 2, takato_siege: 2, tano: 2, iga: 2, echizen: 2, echizen_ikko: 2, kinome: 2,
  kanegasaki: 2, mikatagahara: 2, tonezaka: 2, odani: 2, miki: 2, tobinosu: 2, t11_hachioji: 2, t06_hetsugi: 2, k16_secret: 2,
  inabayama: 3, mitsukuri: 3, okawachi: 3, iwamura: 3, shigisan: 3, nagashinojo: 3, sune: 3, suwahara: 3, k01_fushimi: 3, k03_gifu: 3, k07_sawayama: 3,
  t04_negoro: 3, t05_ichinomiya: 3, t07_ganjaku: 3, t08_nejirozaka: 3, t09_yamanaka: 3, t10_oshi: 3, t12_odawara: 3, k09_imafuku: 3, k10_shigino: 3, mvp_rojo: 3, mvp_shiro: 3, mvp_toride: 3,
  anegawa: 0, nodafukushima: 0, shiga: 0, saika: 0, tedorigawa: 0, mvp_yasen: 0,
  sanadamaru: 4, k11_sanadamaru: 4, k05_ueda: 4, k15_tennoji: 4, k15_tennoji_okayama: 4, k12_kashii: 4, k13_domyoji: 4, domyoji: 4, k14_yao_wakae: 4,
  sekigahara: 4, k06_sekigahara: 4, shitaragahara: 4, tennoji: 4, t01_yamazaki: 4, t02_shizugatake: 4,
};
// 主題：四小節 [音階の番号/拍]。r は休み。三つの形を戦ごとに選ぶ
const MOTIFS = [
  ['0/1 0/.5 2/.5 4/2', '5/1.5 4/.5 2/2', '0/1 0/.5 2/.5 4/1 7/1', '6/1.5 4/.5 3/1 2/1'],
  ['4/1.5 2/.5 0/1 2/1', '4/1 5/1 7/2', '7/1.5 5/.5 4/1 2/1', '0/1 2/1 0/2'],
  ['0/.5 0/.5 4/1 3/1 2/1', '2/1 3/1 4/2', '4/.5 4/.5 7/1 6/1 4/1', '5/1 4/1 2/1 0/1'],
  // 3 勇ましい形：一小節目で一気に駆け上がり、Bb で一番高く、A で息をつく
  ['0/.5 2/.5 4/1 7/2', '6/1.5 7/.5 6/1 4/1', '5/.5 4/.5 5/1 7/1 9/1', '8/1.5 7/.5 4/2'],
];
function parse(s, mode, base) {
  let b = 0; const out = [];
  for (const tok of s.split(' ')) {
    const [n, d] = tok.split('/'); const len = +d || 1;
    if (n !== 'r') { const i = +n, o = Math.floor(i / 7), k = ((i % 7) + 7) % 7; out.push([b, f(base + o * 12 + MODES[mode][k]), len]); }
    b += len;
  }
  return out;
}
const cache = {};
function motif(tune, bar) {
  const key = tune + ':' + bar;
  return cache[key] ||= parse(MOTIFS[TUNES[tune].motif ?? tune % 3][bar], TUNES[tune].mode, 62);   // D4 から
}
export function tuneOf(id) {
  if (BATTLE_TUNE[id] != null) return BATTLE_TUNE[id];
  let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 4;
}

// 戦の一小節。mode：'pre'（行軍→睨み合い）／'war'（激突）／'clx'（山場）。rise：music.js の場面の移りの太鼓
function warBar(a, t, n, mode, rise) {
  const B = a.B, E = a.E, c = a.c;
  rise(a, t, c);
  const tune = (E.tune | 0) % TUNES.length, T = TUNES[tune];
  const stage = E.stage | 0;
  const raw = mode === 'clx' ? Math.max(0.85, E.intensity) : E.intensity;
  c.xs = c.xs == null ? raw : c.xs + (raw - c.xs) * 0.5;
  const xs = c.xs;
  const ps = mode === 'clx' ? 0 : a.pressed();
  c.ps = c.ps == null ? ps : c.ps + (ps - c.ps) * 0.3;
  const hit = 1 - c.ps * 0.7;
  const m4 = n % 4, ch = T.chords[m4], rootF = f(ROOT_MIDI[ch] + 12);

  // 本陣の危機：呼吸だけ。低い弦をごく小さく伸ばし、鼓動のような太鼓を遠く一つ
  if (stage === 3) {
    if (m4 === 0) a.low(t, rootF / 2, B * 7.5, 0.22, { a: 1.2, r: 1.5, cut: 380, prio: 0 });
    if (m4 % 2 === 0) a.taiko(t, 0.2, { big: true, prio: 1 });
    return;
  }
  const boost = stage === 2 ? 1.25 : stage === 4 ? 1.1 : 1;   // 真田の登場で低音と太鼓、後詰で主題

  if (mode === 'pre') {
    // 行軍：低い弦の持続と、太鼓の足取り。睨み合いに近づくと脈だけ。主題は八小節に一度、法螺と弦で短く
    const w = Math.max(0, Math.min(1, (0.38 - xs) / 0.22));
    a.low(t, rootF / 2, B * 3.9, (0.35 + 0.2 * xs) * boost, { a: 0.5, r: 0.6, cut: 420, prio: 0 });
    a.pad(t, ch, B * 4, 0.3 + 0.25 * xs, { a: 0.9, r: 0.8 });
    for (let j = 0; j < 4; j++) a.taiko(t + j * B, ((j % 2 ? 0.36 : 0.55) * w + 0.3 * (1 - w) * (j % 2 ? 0 : 1)) * boost, { big: j === 0 });
    if (w > 0.05) for (let j = 1; j < 8; j += 2) a.shime(t + j * B * 0.5, 0.18 * w);
    if (n % 8 >= 4) for (const [b, fr, len] of motif(tune, m4)) { a.brass(t + b * B, fr / 2, len * B * 0.95, 0.55 + 0.1 * xs); }
    if (n % 16 === 0) a.hora(t, rootF, 3 * B, 0.7);
    return;
  }

  // 激突
  // 低い弦の刻み（八分）。頭と裏拍に重み。激しいほど強く、押されるほど退く
  const dens = xs > 0.6 ? 8 : 4;   // 四分か八分
  for (let j = 0; j < dens; j++) {
    const q = 4 / dens, accent = j % (dens / 4) === 0 ? 1 : 0.62;
    a.low(t + j * q * B, rootF * (j === dens - 1 && m4 === 3 ? 1.5 : 1), q * B * 0.62, (0.32 + 0.4 * xs) * accent * boost * hit, { prio: 1 });
  }
  a.pad(t, ch, B * 4, (0.45 + 0.4 * xs) * hit, { a: 0.4, r: 0.5 });
  // 勇ましい主題：高い弦の速い刻み（十六分。根音・五度・八度を行き来する）。激しいほど強い。押されると細る
  if (T.drive && xs > 0.15) {
    const up = [1, 1.5, 2, 1.5];
    for (let j = 0; j < 16; j++) a.low(t + j * B / 4, rootF * 2 * up[j % 4], B / 4 * 0.55, (0.16 + 0.22 * xs) * (j % 4 ? 0.7 : 1) * hit, { prio: 2, cut: 1800 + 1200 * xs });
  }
  // 太鼓：一・三拍に大きく。激しいほど裏と四拍目も
  a.taiko(t, (0.7 + 0.25 * xs) * boost * hit, { big: n % 2 === 0 });
  a.taiko(t + 2 * B, (0.55 + 0.2 * xs) * boost * hit);
  if (xs > 0.4 || stage === 2) a.taiko(t + 1.5 * B, (0.4 + 0.2 * xs) * boost * hit, { prio: 1 });
  if (xs > 0.6) a.taiko(t + 3 * B, (0.35 + 0.3 * xs) * hit, { prio: 1 });
  if (m4 === 3 && xs > 0.3) for (let j = 0; j < 4; j++) a.taiko(t + (3 + j * 0.25) * B, (0.3 + 0.12 * j) * hit, { prio: 2 });
  if (xs > 0.45 && hit > 0.45) for (let j = 0; j < (xs > 0.85 ? 16 : 8); j++) a.shime(t + j * B * 4 / (xs > 0.85 ? 16 : 8), (j % 2 ? 0.14 : 0.3) * hit);
  if (n % 8 === 0 && xs > 0.5) a.hora(t, rootF, 2 * B, 0.6 * hit, { prio: 1 });
  if (xs > 0.8) a.kane(t + 3.5 * B, 0.25 * hit);

  // 主題：金管（法螺の響きに近い低めの音）に弦が重なる。四小節ごと、最初の四小節は前奏として刻みだけ
  const sing = n >= 4 && c.ps < 0.45 && (xs > 0.2 || stage === 4 || mode === 'clx');
  if (sing) {
    const loud = (0.62 + 0.3 * xs) * boost;
    for (const [b, fr, len] of motif(tune, m4)) {
      a.brass(t + b * B, fr / 2, len * B * 0.95, loud, { prio: 0 });
      if (xs > 0.5 || stage === 4) a.str(t + b * B, fr, len * B * 0.97, 0.7 * boost, { prio: 1 });
      if (mode === 'clx' || stage === 4) a.fue(t + b * B, fr * 2, len * B * 0.9, 0.45);
    }
  }
  // 押される：早鐘と、重く間延びした太鼓
  if (c.ps > 0.1) {
    a.taiko(t + 2.5 * B, 0.5 * c.ps, { big: true, prio: 1 });
    if (c.ps > 0.35) for (let j = 0; j < 4; j++) a.kane(t + j * B, (j % 2 ? 0.12 : 0.2) * c.ps, { prio: 2, short: true });
  }
}

// music.js の CUES に差し込む（rise は music.js の場面の移りの太鼓）
export function warCues(rise) {
  return {
    prebattle: { bpm: 60, gain: 0.62, cap: 16, dyn: true, bar(a, k, t, n) { warBar(a, t, n, 'pre', rise); } },
    battle: { bpm: 120, gain: 0.42, cap: 18, dyn: true, bar(a, k, t, n) { warBar(a, t, n, 'war', rise); } },
    climax: { bpm: 120, gain: 0.47, cap: 22, dyn: true, bar(a, k, t, n) { warBar(a, t, n, 'clx', rise); } },
  };
}
// 段ごとのテンポの倍率
export const STAGE_TEMPO = [1, 1.16, 1.06, 0.8, 1];
