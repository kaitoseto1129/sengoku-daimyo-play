// 武将登用の見せ方と演出（K600・docs/kaito_toyo_1121.md 5〜7・8〜16 の3D・20〜32・83〜84・104〜107・iMac k600-engi・11/21）。
//   playReveal(root, b, o) → Promise<{ skipped, skipAll }>：書状を一通開いた時の登場。b は bushou_online.js の行（name・house・rank）。
//     N 約1秒（札と印・軽い音）／R 封が少し豪華・背後に旗・短い太鼓／A 奥に軍勢の旗・法螺・3D全身・名／
//     S 暗く・風・家紋が一瞬・軍勢の足音・名乗り・3D全身・専用の写し 約4秒（家ごとの型：織田＝鉄砲と木瓜、武田＝旗と騎馬、島津＝霧と十字…）／
//     SSR 武将ごとの専用の登場 約5秒（信長・信玄・謙信・義弘・政宗）。魔法・虹・雷は使わない（戦の物だけ）。いつでも［飛ばす］・十回は［全部飛ばす］。
//   mountBushouStage(el, b, o) → { set(b), dispose() }：注目武将・詳細・編成の3D全身（指で回す・横に払うと o.onSwipe(±1)・後ろにその武将の軍勢）。
//   sealLook(set)：開く前の封の格（SR 以上がいる時だけ一通を royal。格を偽らない＝SSR でない物を SSR に見せない）。
//   作り直さず使い回す：武将の3D は preview.js の Preview（兜・甲冑・実写の顔の骨の人）、兵は world_army_geometry.js の軽い兵の形、
//   旗は textures.js の flagTexture、家紋は bushou_card_art.js、音は audio.js の sfx・signal と asset_voice.js の名乗り。
//   重さ：兵は束（InstancedMesh）で 4〜6 回の描画・煙と雪は点の一束。終われば作った形・材質・絵を全部手放し、描く板も捨てる（Preview.dispose）。
import { portraits, portraitSrc } from './portrait_art.js';
export { portraits, portraitSrc };
import * as THREE from 'three';
import { BUSHOU_ONLINE, HOUSE_NAME } from './bushou_online.js';
import { onlineLook } from './online_look.js';

const MARK = { SSR: '', SR: '', R: '', N: '' };   // K608：印は使わず、格は字と枠の色で
const RCOL = { SSR: '#e8c25a', SR: '#d9824a', R: '#9fc08a', N: '#b8ae9c' };
export const REVEAL_SEC = { N: 1.0, R: 1.5, SR: 4.2, SSR: 5.0 };   // 11/24：SR は前の S の型（A の短い型は使わない）
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sm = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------- 場の色（104：注目の種類で背景を替える。操作の位置は替えない） ----------------
//   sky：上・地平・地／fog：色・近・遠／sun・hemi：光の色と強さ／land：遠い山の形（峰の高さ・荒さ・色）／exp：露出
const MOOD = {
  night: { sky: [0x05070c, 0x1a1712, 0x0a0806], fog: [0x0e0c0a, 18, 110], sun: [0x9fb4d8, 0.9], hemi: [0x46506a, 0x1a120a, 0.35], land: [26, 0.5, 0x0a0b0e], exp: 1.15, ground: 0x15110c },
  dawn: { sky: [0x26324a, 0xd99a62, 0x2a2016], fog: [0x8a6e58, 24, 150], sun: [0xffc890, 2.2], hemi: [0xa0a8c0, 0x4a3420, 0.5], land: [30, 0.55, 0x2a2a38], exp: 1.35, ground: 0x3a2e22 },
  dusk: { sky: [0x121624, 0x6a3a22, 0x1a120c], fog: [0x2a1e16, 20, 120], sun: [0xff9a5a, 1.6], hemi: [0x5a5a78, 0x2a1a0e, 0.4], land: [24, 0.5, 0x14121a], exp: 1.25, ground: 0x241a12 },
  wind: { sky: [0x4a5260, 0xa89a80, 0x3a3022], fog: [0x8a8272, 30, 170], sun: [0xfff0d8, 2.4], hemi: [0xb0b8c8, 0x4a3a26, 0.55], land: [60, 0.7, 0x4a5058], exp: 1.4, ground: 0x4a3e2a },   // 甲斐の山
  snow: { sky: [0x9aa4b4, 0xd8dce2, 0xc8ccd2], fog: [0xc4cad2, 16, 120], sun: [0xe8eeff, 1.6], hemi: [0xdce4f0, 0x8a8e98, 0.8], land: [44, 0.6, 0x8a929e], exp: 1.2, ground: 0xd6dae0, snow: true },   // 越後・奥州
  mist: { sky: [0x5a625e, 0x9aa098, 0x4a4a40], fog: [0x9aa09a, 2, 34], sun: [0xe8ecdc, 1.2], hemi: [0xb8c0b8, 0x4a4a3a, 0.8], land: [40, 0.9, 0x6a726c], exp: 1.3, ground: 0x3a3a2c },   // 九州の山
  sea: { sky: [0x3a5a80, 0xd0c0a0, 0x3a3428], fog: [0xa0aab0, 34, 190], sun: [0xfff2d8, 2.4], hemi: [0xb8c8e0, 0x4a4030, 0.55], land: [18, 0.45, 0x3a4a5a], exp: 1.4, ground: 0x4a4030, sea: true },   // 瀬戸内
  day: { sky: [0x4a6a98, 0xc8c0a8, 0x3a3022], fog: [0x9aa0a0, 34, 180], sun: [0xfff2dc, 2.6], hemi: [0xc0c8d8, 0x4a3a26, 0.55], land: [34, 0.55, 0x4a5868], exp: 1.45, ground: 0x4a3e2c },
};
// 家ごとの型（32）：場・兵の種・旗・具足の色・S の名乗りの代わりの声
const HOUSE = {
  oda: { mood: 'dusk', kind: 'gun', flag: 'oda', armor: 0x1c1a1a },
  takeda: { mood: 'wind', kind: 'kiba', flag: 'takeda', armor: 0x8a241a },
  uesugi: { mood: 'snow', kind: 'yari', flag: 'uesugi_bi', armor: 0x1c1a1a },
  tokugawa: { mood: 'day', kind: 'yari', flag: 'tokugawa', armor: 0x24221f },
  mori: { mood: 'sea', kind: 'mixed', flag: 'mori', armor: 0x2a2622 },
  shimazu: { mood: 'mist', kind: 'gun', flag: 'shimazu', armor: 0x1c1a1a },
  other: { mood: 'dawn', kind: 'mixed', flag: null, armor: 0x2a2622 },
};
// 得意の兵種（bushou_online の fav）→ 後ろに見せる兵（83〜84）
const FAV_KIND = { teppo: 'gun', kiba: 'kiba', yari: 'yari', shubi: 'yari', std: 'mixed' };
// K601 3〜5：一人の武将＝主兵種一つの約1000人。後ろに出す兵はその兵種だけ（b.arm＝'槍'|'騎馬'|'鉄砲'|'弓'。無ければ得意の型から）
const ARM_KIND = { 鉄砲: 'gun', 騎馬: 'kiba', 槍: 'yari', 弓: 'yumi' };
const ARM_BY_NAME = { 小早川隆景: '弓' };
export const armKind = (b) => ARM_KIND[b.arm || ARM_BY_NAME[b.name]] || FAV_KIND[b.fav] || 'yari';

// SS：武将ごとの専用の登場（24〜31）。共通の型は使わない。t は秒
//   cam：[時, 目の位置, 見る所]（足元→甲冑→顔→引き）。hero：その時の武将の向き・腕・歩み。beats：その時に起こす事
const SS = {
  nobunaga: { mood: 'night', title: '天下布武', voice: '織田信長なり！', army: { kind: 'gun', n: 300, nobori: 120, front: 'gunline' }, fire: true,
    cam: [[0, [0.5, 0.22, 1.5], [0, 0.25, 0]], [1.3, [0.35, 1.0, 1.35], [0, 1.05, 0]], [2.6, [1.8, 1.7, 4.2], [0, 1.4, -4]], [3.6, [0.2, 1.6, 1.0], [0, 1.6, 0]], [5, [1.0, 1.45, 3.4], [0, 1.3, -2]]],
    hero: (t) => ({ head: 0.25 - sm(2.2, 3.4, t) * 0.25, arm: sm(1.4, 1.9, t) * (1 - sm(2.4, 3.0, t)), z: 0 }),
    beats: [[0, 'drum'], [1.2, 'mon'], [2.0, 'volley'], [2.15, 'volley2'], [3.4, 'voice'], [3.9, 'title'], [3.9, 'buzz']] },
  shingen: { mood: 'wind', title: '甲斐の虎', voice: '風林火山の旗を見よ！', army: { kind: 'kiba', n: 180, nobori: 160, front: 'riders' }, horse: true,
    cam: [[0, [0.6, 0.25, 1.6], [0, 0.3, 0]], [1.2, [0.4, 1.05, 1.45], [0, 1.1, 0]], [2.4, [-2.2, 1.9, 4.6], [0, 1.5, -6]], [3.5, [0.15, 1.62, 1.05], [0, 1.62, 0]], [5, [-1.1, 1.5, 3.6], [0, 1.3, -3]]],
    hero: (t) => ({ head: -0.2 + sm(2.6, 3.4, t) * 0.2, arm: 0, z: 0, gunbai: true }),
    beats: [[0, 'wind'], [0.4, 'hora'], [1.4, 'gallop'], [1.6, 'mon'], [3.3, 'voice'], [3.8, 'title'], [3.8, 'buzz']] },
  kenshin: { mood: 'dawn', title: '越後の龍', voice: '毘沙門天の加護ぞ！', flag: 'uesugi_bi', umaFlag: 'uesugi_ryu', army: { kind: 'yari', n: 260, nobori: 140, front: 'riders' }, horse: true, breath: true, snow: false,
    cam: [[0, [-0.4, 0.22, 1.5], [0, 0.25, 0]], [1.3, [-0.3, 1.0, 1.35], [0, 1.05, 0]], [2.5, [-1.6, 1.4, 4.4], [0, 1.6, -5]], [3.6, [-0.15, 1.6, 0.95], [0, 1.6, 0]], [5, [-0.9, 1.4, 3.4], [0, 1.4, -3]]],
    hero: (t) => ({ head: 0.3 * (1 - sm(2.8, 3.6, t)), arm: 0, z: 0 }),
    beats: [[0, 'drum'], [0.8, 'dawn'], [1.5, 'mon'], [1.7, 'neigh'], [3.4, 'voice'], [3.9, 'title'], [3.9, 'buzz']] },
  yoshihiro: { mood: 'mist', title: '鬼島津', voice: '島津義弘なり！', army: { kind: 'gun', n: 200, nobori: 80, front: 'gunline' }, enemyPass: true, walk: true,
    cam: [[0, [0.4, 0.2, 1.4], [0, 0.25, -1]], [1.3, [0.3, 1.0, 1.3], [0, 1.05, -0.6]], [2.4, [2.4, 1.6, 4.0], [0, 1.3, -6]], [3.6, [0.15, 1.6, 0.95], [0, 1.6, 0]], [5, [0.9, 1.4, 3.2], [0, 1.3, -2]]],
    hero: (t) => ({ head: -0.35 * sm(0.4, 1.4, t) * (1 - sm(2.4, 3.2, t)), arm: 0, z: lerp(-1.6, 0, sm(0.2, 3.4, t)) }),
    beats: [[0, 'mist'], [0.6, 'march'], [1.6, 'mon'], [2.6, 'volleyFar'], [3.4, 'voice'], [3.9, 'title'], [3.9, 'buzz']] },
  masamune: { mood: 'snow', title: '奥州の独眼竜', voice: 'かかれ、かかれい！', flag: 'date', army: { kind: 'kiba', n: 170, nobori: 100, front: 'riders' }, horse: true, snow: true, armor: 0x101012,
    cam: [[0, [0.9, 1.7, 3.8], [0, 1.4, -4]], [1.2, [0.6, 1.3, 2.6], [0, 1.2, 0]], [2.2, [0.35, 1.05, 1.4], [0, 1.1, 0]], [3.4, [0.12, 1.62, 1.0], [0, 1.62, 0]], [5, [1.2, 1.5, 3.6], [0, 1.3, -3]]],
    hero: (t) => ({ turn: Math.PI * (1 - sm(1.0, 2.6, t)), head: 0, arm: 0, z: 0 }),
    beats: [[0, 'wind'], [0.6, 'gallop'], [1.6, 'mon'], [3.2, 'voice'], [3.8, 'title'], [3.8, 'buzz']] },
  // 表の SSR の残り四人も、共通の型にせず一人ずつ（31）
  ieyasu: { mood: 'day', title: '厭離穢土', voice: '徳川家康なり！', flag: 'tokugawa', army: { kind: 'yari', n: 240, nobori: 140 },
    cam: [[0, [-0.5, 0.25, 1.6], [0, 0.3, 0]], [1.3, [-0.35, 1.05, 1.4], [0, 1.1, 0]], [2.6, [-3.0, 2.6, 5.4], [0, 1.2, -8]], [3.7, [-0.15, 1.6, 1.0], [0, 1.6, 0]], [5, [-1.0, 1.5, 3.6], [0, 1.3, -3]]],
    hero: (t) => ({ head: -0.15 * Math.sin(t * 0.8), hilt: sm(3.0, 3.6, t), z: 0 }),
    beats: [[0, 'drum'], [0.6, 'march'], [1.4, 'mon'], [2.4, 'hora'], [3.4, 'voice'], [3.9, 'title'], [3.9, 'buzz']] },
  motonari: { mood: 'sea', title: '謀神', voice: '毛利の旗の下に集え！', flag: 'mori', army: { kind: 'mixed', n: 220, nobori: 120 },
    cam: [[0, [2.6, 1.8, 4.8], [0, 1.2, -12]], [1.3, [0.4, 1.0, 1.5], [0, 1.05, 0]], [2.4, [0.3, 0.3, 1.6], [0, 0.35, 0]], [3.6, [0.15, 1.6, 1.0], [0, 1.6, 0]], [5, [1.1, 1.5, 3.6], [0, 1.3, -3]]],
    hero: (t) => ({ head: 0.35 * (1 - sm(2.4, 3.4, t)), z: 0 }),
    beats: [[0, 'wind'], [0.5, 'drum'], [1.5, 'mon'], [3.3, 'voice'], [3.8, 'title'], [3.8, 'buzz']] },
  yoshihisa: { mood: 'dawn', title: '九州の覇者', voice: '肩を並べよ、ここが死に場所ぞ！', flag: 'shimazu', army: { kind: 'gun', n: 220, nobori: 120, front: 'gunline' },
    cam: [[0, [0.3, 1.6, 1.2], [0, 1.6, 0]], [1.4, [0.4, 0.3, 1.6], [0, 0.4, 0]], [2.6, [2.2, 1.8, 4.6], [0, 1.4, -6]], [3.7, [0.15, 1.58, 0.95], [0, 1.6, 0]], [5, [1.0, 1.45, 3.4], [0, 1.3, -2]]],
    hero: (t) => ({ head: 0.2 * Math.sin(t * 0.6), z: 0 }),
    beats: [[0, 'drum'], [0.6, 'dawn'], [1.6, 'mon'], [2.8, 'volleyFar'], [3.4, 'march'], [3.9, 'title'], [3.9, 'buzz']] },
  nobushige: { mood: 'dusk', title: '日本一の兵', voice: '真田信繁なり！', flag: 'sanada', armor: 0x8a241a, army: { kind: 'yari', n: 220, nobori: 130 },
    cam: [[0, [0, 1.5, 5.5], [0, 1.2, -6]], [1.2, [0.4, 0.28, 1.5], [0, 0.32, 0]], [2.3, [0.3, 1.05, 1.35], [0, 1.1, 0]], [3.5, [0.12, 1.6, 0.95], [0, 1.6, 0]], [5, [0.8, 1.4, 3.2], [0, 1.3, -2]]],
    hero: (t) => ({ head: 0, z: lerp(-2.4, 0, sm(0, 2.2, t)), hilt: sm(3.6, 4.2, t) }),
    beats: [[0, 'march'], [0.4, 'hora'], [1.4, 'mon'], [2.2, 'toki'], [3.3, 'voice'], [3.8, 'title'], [3.8, 'buzz']] },
};
// K633 ②（kaito「S の方が SSR より良く見える」）：専用の登場の無い SSR（北条氏康・長宗我部元親・足した SSR）は、A の短い型に落ちていた。
//   SSR の長さ（5秒）・大きな軍勢と大馬印・遠くの太鼓・足元→甲冑→顔→引きの写しで、S より明らかに上に見せる
const SS_CAM = [[0, [0.5, 0.22, 1.5], [0, 0.25, 0]], [1.3, [0.35, 1.02, 1.4], [0, 1.08, 0]], [2.5, [2.0, 1.8, 4.6], [0, 1.4, -6]], [3.6, [0.15, 1.6, 1.0], [0, 1.6, 0]], [5, [1.0, 1.45, 3.4], [0, 1.3, -2]]];
const ssBase = (b) => ({ mood: 'dawn', title: b.senpo?.name || '', voice: `${b.name}なり！`, army: { kind: 'mixed', n: 240, nobori: 140 },
  cam: SS_CAM, hero: (t) => ({ head: 0.25 * (1 - sm(2.4, 3.4, t)), hilt: sm(3.4, 4.0, t), z: 0 }),
  beats: [[0, 'drum'], [0.6, 'dawn'], [1.0, 'hora'], [1.5, 'mon'], [2.2, 'march'], [3.4, 'voice'], [3.9, 'title'], [3.9, 'buzz']] });
// S の家ごとの型（32）：写しは同じ長さ、場・兵・旗・音を家で替える
const S_CAM = [[0, [0.45, 0.3, 1.6], [0, 0.4, 0]], [1.3, [0.35, 1.1, 1.5], [0, 1.15, 0]], [2.5, [0.15, 1.6, 1.05], [0, 1.6, 0]], [4.2, [0.9, 1.45, 3.3], [0, 1.3, -2]]];
const A_CAM = [[0, [0.8, 1.2, 3.6], [0, 1.1, 0]], [2.6, [0.6, 1.35, 3.0], [0, 1.2, -1]]];

// ---------------- 封（34〜35） ----------------
export function sealLook(set) {
  const out = set.map(() => 'plain');
  const O = ['SSR', 'SR', 'R', 'N'], top = set.reduce((m, b, i) => (O.indexOf(b.rank) < O.indexOf(set[m].rank) ? i : m), 0);
  set.forEach((b, i) => { if (b.rank === 'SR' || b.rank === 'R') out[i] = 'fine'; });
  if (set[top].rank === 'SR' || set[top].rank === 'SSR') out[top] = 'royal';
  return out;
}

// ---------------- 音 ----------------
let A = null, VO = null, vctx = null;
// 本編の外の頁（toyo.html）から開いても循環の import の読み順が崩れないよう、本編と同じ読み順の xr_order.js を先に読む（busho_portrait.js と同じ）
const ORDER = () => import('../xr_order.js').catch(() => null);
async function audioMod() { await ORDER(); if (!A) A = await import('../audio.js').catch(() => null); return A; }
function snd(name, vol = 1) { try { A?.sfx(name, vol); } catch (e) { /* 音が無くても見せる */ } }
function hora() { try { A?.signal('hora', 0, 0.9); } catch (e) { /* 同上 */ } }
async function voice(text) {
  try {
    if (!VO) VO = await import('../asset_voice.js');
    const row = VO.LINES.find((r) => r[0] === text); if (!row) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    vctx = vctx || new AC(); if (vctx.state !== 'running') await vctx.resume().catch(() => {});
    const bin = atob(VO.CLIPS[row[1]]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const buf = await vctx.decodeAudioData(u.buffer), s = vctx.createBufferSource(), g = vctx.createGain();
    g.gain.value = 0.9; s.buffer = buf; s.connect(g); g.connect(vctx.destination); s.start();
  } catch (e) { /* 声が無くても見せる */ }
}
// 紙の音（N）と風（S・SSR）：自前の短い雑音（音の素材を足さない）
function noise(sec, type, f, vol, attack = 0.01) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; vctx = vctx || new AC();
    const c = vctx, n = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    fl.type = type; fl.frequency.value = f; fl.Q.value = 0.7; s.buffer = n;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.linearRampToValueAtTime(0, t + sec);
    s.connect(fl); fl.connect(g); g.connect(c.destination); s.start();
  } catch (e) { /* 同上 */ }
}
// 107：iPhone は高レアの時だけ軽い振動を一度（連続・強い刺激はしない）
async function buzz() {
  try { const { S } = await import('../settings.js'); if (S.vibrate === false) return; if (typeof window.__haptic === 'function') window.__haptic('select', 0.35); } catch (e) { /* 震えない端末 */ }
}

// ---------------- 3D の場 ----------------
const KEEP = { gun: [0, 1, 4, 8, 9, 10], yari: [0, 1, 3, 8, 9, 10], yumi: [0, 1, 5, 8, 9, 10], banner: [0, 1, 6, 8, 9], samurai: [0, 2, 3, 8, 9, 10], rider: [0, 2, 3] };
function partGeo(base, keep) {
  const P = base.attributes.aPart, I = base.index, out = [];
  const ok = (v) => keep.includes(Math.round(P.getX(v)));
  for (let i = 0; i < I.count; i += 3) { const a = I.getX(i), b = I.getX(i + 1), c = I.getX(i + 2); if (ok(a) && ok(b) && ok(c)) out.push(a, b, c); }
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) if (base.attributes[k]) g.setAttribute(k, base.attributes[k]);
  g.setIndex(out); g.computeBoundingSphere();
  return g;
}
let PUFF = null;
function puffTex() {
  if (PUFF) return PUFF;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  PUFF = new THREE.CanvasTexture(c); PUFF.colorSpace = THREE.SRGBColorSpace;
  return PUFF;
}


// K628（kaito の写真：鎧櫃に座らせた具足を、暗い灰の背景に光を一つ当てて正面から）：舞台の飾り。返す dispose で作った物を全部手放す
export function studioRig(pv, { shade = 0x3a3c41 } = {}) {
  const scene = pv.scene, own = [];
  const mine = (x) => { own.push(x); return x; };
  const prevBg = scene.background, prevFog = scene.fog, prevEnv = scene.environment;
  scene.background = new THREE.Color(shade); scene.fog = null; scene.environment = null;
  for (const l of scene.children) {
    if (l.isDirectionalLight) { l.color.set(0xfff4e4); l.intensity = 6.2; l.position.set(-2.6, 4.2, 3.6); }
    if (l.isHemisphereLight) { l.color.set(0x8a8e96); l.groundColor.set(0x1c1c1e); l.intensity = 1.3; }
  }
  const g = new THREE.Group(), lac = mine(new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.32, metalness: 0.15 })), gold = mine(new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.8 }));
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(mine(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const H = 0.42;
  box(0.9, H, 0.62, lac, 0, H / 2, -0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.07, 0.07, 0.07, gold, sx * 0.44, H - 0.02, -0.12 + sz * 0.3);
  scene.add(g);
  return { dispose() { scene.remove(g); for (const x of own) x.dispose?.(); scene.background = prevBg; scene.fog = prevFog; scene.environment = prevEnv; } };
}

// 場を組む：空・遠い山・地面・霧・後ろの軍勢（束）・煙と雪の点。返す物の dispose で作った物を全部手放す
async function buildStage(pv, o) {
  const [{ soldierGeo, clothGeo, horseGeo }, { flagTexture }] = await Promise.all([import('../world_army_geometry.js'), import('../textures.js')]);
  if (!pv.renderer) return null;   // 読む間に閉じられて描く口が無くなった時（K619：toneMappingExposure の誤り）
  const M = MOOD[o.mood] || MOOD.day, own = [], scene = pv.scene, root = new THREE.Group(); scene.add(root);
  const mine = (x) => { own.push(x); return x; };
  const col = (h) => new THREE.Color(h);
  // 光：Preview の部屋の光を場の色へ
  for (const l of scene.children) {
    if (l.isDirectionalLight) { l.color.set(M.sun[0]); l.intensity = M.sun[1]; l.position.set(-3, 5, 4); }
    if (l.isHemisphereLight) { l.color.set(M.hemi[0]); l.groundColor.set(M.hemi[1]); l.intensity = M.hemi[2]; }
  }
  pv.renderer.toneMappingExposure = M.exp;
  scene.fog = new THREE.Fog(M.fog[0], M.fog[1], M.fog[2]);
  pv.camera.far = 600; pv.camera.near = 0.05; pv.camera.updateProjectionMatrix();
  // 空：上と地平の色の筒（霧に呑まれない）
  const sky = new THREE.Mesh(mine(new THREE.SphereGeometry(500, 24, 12)), mine(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: col(M.sky[0]) }, uH: { value: col(M.sky[1]) }, uG: { value: col(M.sky[2]) }, uDawn: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uT,uH,uG; uniform float uDawn; varying vec3 vD; void main(){ float y=vD.y;
      vec3 h = mix(uH*0.35, uH, uDawn); vec3 c = y>0.0 ? mix(h, uT, smoothstep(0.0,0.55,y)) : mix(h, uG, smoothstep(0.0,0.2,-y));
      gl_FragColor = vec4(c,1.0); }`,
  })));
  sky.renderOrder = -10; root.add(sky);
  // 遠い山（104）：二重の稜線。峰の高さと荒さを場で替える
  const [amp, rough, landCol] = M.land;
  for (const [z, k, sh] of [[-260, 1, 0], [-170, 0.55, 0.25]]) {
    const g = mine(new THREE.PlaneGeometry(1100, 1, 160, 1)), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), top = p.getY(i) > 0;
      const h = amp * k * (0.55 + 0.45 * Math.sin(x * 0.011 + z) + rough * 0.35 * Math.sin(x * 0.043 + 1.7 * z) + rough * 0.15 * Math.sin(x * 0.13));
      p.setY(i, top ? Math.max(2, h) : -4);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mine(new THREE.MeshBasicMaterial({ color: col(landCol).lerp(col(M.fog[0]), sh), fog: false })));
    m.position.set(0, 0, z); root.add(m);
  }
  if (M.sea) { const w = new THREE.Mesh(mine(new THREE.PlaneGeometry(1200, 140)), mine(new THREE.MeshLambertMaterial({ color: 0x4a6a84 }))); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.02, -150); root.add(w); }
  const ground = new THREE.Mesh(mine(new THREE.CircleGeometry(220, 48)), mine(new THREE.MeshLambertMaterial({ color: M.ground })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.003; root.add(ground);

  // 後ろの軍勢（83〜84・SSR の数百本の旗）：一つの束に兵・指物・幟・馬
  const ar = o.army || {}, kind = ar.kind || 'mixed', N = ar.n || 80, NB = ar.nobori || 0;
  const flagKey = o.flag || 'tokugawa', armor = o.armor || 0x2a2622;
  const base = soldierGeo(armor, false);
  const mainKeep = kind === 'gun' ? KEEP.gun : kind === 'kiba' ? KEEP.rider : kind === 'yumi' ? KEEP.yumi : KEEP.yari;
  const geoMain = mine(partGeo(base, mainKeep)), geoBan = mine(partGeo(base, KEEP.banner));
  const lam = (o2) => mine(new THREE.MeshLambertMaterial(o2));
  const uT = { value: 0 };
  const wave = (mat, amp2) => { mat.onBeforeCompile = (sh) => { sh.uniforms.uT = uT; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = float(gl_InstanceID) * 1.7; float k = clamp((position.x - 0.0) * 1.4, 0.0, 1.0);
    transformed.z += sin(uT * 3.2 + ph + position.x * 2.6 + position.y * 0.7) * ${amp2.toFixed(2)} * k;`); }; return mat; };
  const flagTex = flagTexture(flagKey);
  const sashiGeo = mine(clothGeo(0.42, 0.78, 3, 1, 0, 2.62, -0.17, 11)), noboGeo = mine(clothGeo(0.86, 3.0, 3, 6, 0.3, 5.2, 0.14, 12));
  const body = new THREE.InstancedMesh(geoMain, lam({ vertexColors: true }), N);
  const sashi = new THREE.InstancedMesh(sashiGeo, wave(lam({ map: flagTex, side: THREE.DoubleSide }), 0.08), N);
  const banB = NB ? new THREE.InstancedMesh(geoBan, lam({ vertexColors: true }), NB) : null;
  const nobo = NB ? new THREE.InstancedMesh(noboGeo, wave(lam({ map: flagTex, side: THREE.DoubleSide }), 0.18), NB) : null;
  const riders = kind === 'kiba' ? N : 0;
  const horses = riders ? new THREE.InstancedMesh(horseGeo(), lam({ vertexColors: true }), riders) : null;
  const d = new THREE.Object3D(), tint = new THREE.Color(), R = mulberry(o.seed || 7), muzzles = [];
  const z0 = ar.front === 'gunline' ? -5.5 : -8, cols = Math.ceil(Math.sqrt(N * 2.2));
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols), c = i % cols, sp = kind === 'kiba' ? 2.6 : 1.5;
    const x = (c - cols / 2 + 0.5) * sp + (r % 2) * sp * 0.5 + (R() - 0.5) * 0.4, z = z0 - r * (kind === 'kiba' ? 3.4 : 2.0) - (R() * 0.6);
    if (Math.abs(x) < 1.4 && z > -9) { d.position.set(x + 3 * Math.sign(x || 1), 0, z); } else d.position.set(x, 0, z);
    d.rotation.set(0, (R() - 0.5) * 0.12, 0); const s = 0.92 + R() * 0.1; d.scale.set(s, s, s);
    d.updateMatrix(); body.setMatrixAt(i, d.matrix); sashi.setMatrixAt(i, d.matrix);
    if (horses) { horses.setMatrixAt(i, d.matrix); d.position.y = 0.95; d.updateMatrix(); body.setMatrixAt(i, d.matrix); sashi.setMatrixAt(i, d.matrix); horses.setColorAt(i, tint.set([0x4a3424, 0x5a3e28, 0x6a4a30, 0x3a2a1e][i % 4])); }
    body.setColorAt(i, tint.setRGB(0.85 + R() * 0.25, 0.85 + R() * 0.2, 0.85 + R() * 0.2));
    if (kind === 'gun' && r < 2) muzzles.push(new THREE.Vector3(d.position.x - 0.25, 1.45, d.position.z + 0.75));
  }
  for (let i = 0; i < NB; i++) {
    const x = (R() - 0.5) * Math.min(140, 30 + NB * 0.5), z = z0 - 3 - R() * Math.min(90, 20 + NB * 0.35);
    d.position.set(Math.abs(x) < 2.5 ? x + 5 * Math.sign(x || 1) : x, 0, z); d.rotation.set(0, (R() - 0.5) * 0.3, 0); d.scale.setScalar(0.95 + R() * 0.1); d.updateMatrix();
    banB.setMatrixAt(i, d.matrix); nobo.setMatrixAt(i, d.matrix); banB.setColorAt(i, tint.setRGB(0.9, 0.9, 0.9));
  }
  for (const m of [body, sashi, banB, nobo, horses]) if (m) { m.frustumCulled = false; root.add(m); }
  // 大馬印（SSR）：金の傘の一本（信長の金の唐傘に推した形。ほかの家は大きな家の幟）
  if (o.uma) {
    const pole = new THREE.Mesh(mine(new THREE.CylinderGeometry(0.06, 0.07, 8, 6)), lam({ color: 0x2f2419 })); pole.position.set(-3.2, 4, -4.5); root.add(pole);
    if (o.uma === 'gold') { const kasa = new THREE.Mesh(mine(new THREE.ConeGeometry(1.0, 1.1, 16, 1, true)), mine(new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }))); kasa.position.set(-3.2, 7.6, -4.5); root.add(kasa); }
    else { const f = new THREE.Mesh(noboGeo, wave(lam({ map: o.umaFlag ? flagTexture(o.umaFlag) : flagTex, side: THREE.DoubleSide }), 0.12)); f.scale.setScalar(1.6); f.position.set(-3.7, -0.4, -4.5); root.add(f); }
  }
  // 煙（鉄砲の白煙）・火花・雪・霧・白い息：点の束を一つずつ
  const pts = (n, size, color, opacity) => {
    const g = mine(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = mine(new THREE.PointsMaterial({ size, map: puffTex(), color, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; root.add(p); return p;
  };
  const smoke = muzzles.length ? pts(muzzles.length * 4, 2.4, 0xdedcd6, 0) : null;
  const flash = muzzles.length ? pts(muzzles.length, 1.3, 0xffb050, 0) : null;
  // 一斉射撃の火の照り（火の瞬きで鉄砲の列が一瞬見える）
  const vLight = muzzles.length ? new THREE.PointLight(0xffa050, 0, 40, 1.4) : null;
  if (vLight) { vLight.position.set(0, 2.2, z0 + 1.5); root.add(vLight); }
  if (flash) flash.material.blending = THREE.AdditiveBlending;
  const snow = M.snow || o.snow ? pts(700, 0.07, 0xffffff, 0.85) : null;
  const mist = o.mood === 'mist' ? pts(60, 14, 0xc8ccc4, 0.22) : null;
  const breath = o.breath ? pts(12, 0.25, 0xffffff, 0) : null;
  const seed3 = (p, f) => { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setXYZ(i, ...f(i)); a.needsUpdate = true; };
  if (snow) seed3(snow, () => [(R() - 0.5) * 24, R() * 9, (R() - 0.5) * 22 - 4]);
  if (mist) seed3(mist, () => [(R() - 0.5) * 70, 1 + R() * 3, -6 - R() * 50]);
  if (smoke) seed3(smoke, (i) => { const m = muzzles[i % muzzles.length]; return [m.x + (R() - 0.5) * 0.8, m.y + (R() - 0.3) * 0.5, m.z + 0.3 + R() * 1.4]; });
  if (flash) seed3(flash, (i) => [muzzles[i].x, muzzles[i].y, muzzles[i].z + 0.15]);
  // 遠くを通る敵（義弘）：霧の奥を横へ進む一列（束を丸ごと動かす）
  let passing = null;
  if (o.enemyPass) {
    const en = new THREE.InstancedMesh(mine(partGeo(soldierGeo(0x24221f, false), KEEP.yari)), lam({ vertexColors: true }), 60);
    for (let i = 0; i < 60; i++) { d.position.set(i * 1.3 - 40, 0, -34 - (i % 3) * 1.4); d.rotation.set(0, -Math.PI / 2, 0); d.scale.setScalar(1); d.updateMatrix(); en.setMatrixAt(i, d.matrix); en.setColorAt(i, tint.setRGB(0.8, 0.8, 0.8)); }
    en.frustumCulled = false; root.add(en); passing = en;
  }
  // 篝火（夜の陣）
  let fire = null;
  if (o.mood === 'night') { fire = new THREE.PointLight(0xff8a3a, 6, 18, 1.6); fire.position.set(2.4, 1.2, -2.2); root.add(fire); }
  let volleyT = -99, volleyT2 = -99, dawnAt = -1, dawnK = M === MOOD.dawn ? 0 : 1;
  sky.material.uniforms.uDawn.value = dawnK;
  if (!dawnK) pv.renderer.toneMappingExposure = M.exp * 0.6;
  return {
    root,
    volley(t, second) { if (second) volleyT2 = t; else volleyT = t; },
    dawn(t) { dawnAt = t; },
    update(t, dt) {
      uT.value = t;
      if (dawnAt >= 0 && dawnK < 1) { dawnK = Math.min(1, Math.max(0.0001, (t - dawnAt) * 0.6)); sky.material.uniforms.uDawn.value = dawnK; pv.renderer.toneMappingExposure = M.exp * (0.6 + 0.4 * dawnK); }
      if (snow) { const a = snow.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (0.6 + (i % 5) * 0.12); if (y < 0) y += 9; a.setXYZ(i, a.getX(i) + Math.sin(t + i) * dt * 0.2, y, a.getZ(i)); } a.needsUpdate = true; }
      if (mist) mist.position.x = Math.sin(t * 0.15) * 3;
      if (passing) passing.position.x = t * 2.2;
      if (fire) fire.intensity = 5 + Math.sin(t * 17) * 0.8 + Math.sin(t * 7.3) * 0.6;
      if (smoke) {
        const age = Math.min(t - volleyT, t - volleyT2 < 0 ? 99 : t - volleyT2), aa = t - volleyT;
        const a2 = t - volleyT2, hot = (aa >= 0 && aa < 0.12) || (a2 >= 0 && a2 < 0.12);
        flash.material.opacity = hot ? 1 : 0;
        vLight.intensity = aa >= 0 ? 40 * Math.max(0, 1 - aa * 5) + (a2 >= 0 ? 30 * Math.max(0, 1 - a2 * 5) : 0) : 0;
        if (aa >= 0) { smoke.material.opacity = Math.min(0.85, 0.35 + aa * 6) * (1 - sm(0.7, 1.9, aa)); smoke.material.size = 2.2 + aa * 2.4; smoke.position.set(aa * 0.5, aa * 0.3, aa * 0.25); }
        void age;
      }
      if (breath) { const k = (t % 1.6) / 1.6; breath.material.opacity = k < 0.5 ? 0.45 * Math.sin(k * Math.PI * 2) : 0; const a = breath.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setXYZ(i, (i % 3 - 1) * 0.03, 1.55 + k * 0.08 + i * 0.004, 0.18 + k * 0.35 + i * 0.01); a.needsUpdate = true; }
    },
    dispose() {
      scene.remove(root); scene.fog = null;
      for (const x of own) x.dispose?.();
      for (const m of [body, sashi, banB, nobo, horses, passing]) m?.dispose?.();
    },
  };
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 武将を立たせる：具足の表（units.js の GENERALS）の人はそのまま、無い人は図鑑の名簿の顔と家の紋で（busho_portrait.js の撮り方と同じ）。
//   返す hero の pose(p) で 向き・首・右腕（手を上げる）を毎コマ替える（骨の人の時だけ。骨の無い形は向きだけ）
let PREV = null;
async function makeHero(canvas, b, shared = null, studio = false) {
  await ORDER();
  if (!PREV) PREV = await Promise.all([null, import('../preview.js'), import('../units.js'), import('../busho_portrait.js'), import('../humans_pose.js'), import('../humans_face_materials.js'), import('../humans_face_geometry.js')]);
  const [, { Preview }, U, BP, P, FM, FG] = PREV;
  const pv = shared || new Preview(canvas);
  if (!pv.renderer) return null;
  pv.spin = 0;
  // 骨の人の素材が読み終わっていなければ、暗転の間（3 秒まで）だけ待つ（演出を止めない・108）。読めなければ骨の無い具足の形で立てる。
  //   ふだんは登用の画面を開いた時に prewarmReveal() で先に読んであるので待たない
  await Promise.race([pv.loadGeneral().catch(() => 0), new Promise((r) => setTimeout(r, 3000))]);
  BP.addPortraitRows(BUSHOU_ONLINE.map((x) => [x.name, x.house]));
  const nm = BP.portraitName(b.name) || b.name;
  let key = nm, temp = null, tempK = null;
  // K600 76〜77：表に無い人・表で具足が重なる人は online_look.js の一人ずつの具足（戦の中の表は変えない）
  const ov = onlineLook(nm, U.GENERALS[nm] || BP.zukanLook(nm));
  if (ov) {
    temp = key = 'zk:' + nm; U.GENERALS[key] = ov;
    // 前立と鉢の形は具足の名の表（kacchu_data.js の KACCHU）から引かれるので、同じ鍵で一時の行を置く（dispose で消す）
    const KD = await import('../kacchu_data.js'); const k0 = KD.KACCHU[nm] || {};
    KD.KACCHU[key] = { ...k0, bowl: ov.bowl, crest: ov.crest, armor: ov.helm, helm: ov.helm, lace: ov.odo, odo: ov.odo, doStyle: ov.doStyle, haori: 0, menpo: k0.menpo || 0, menpoStyle: k0.menpoStyle || 'hanbo', mon: ov.mon || k0.mon || 'none', hat: 'kabuto', hatFix: 1, lac: k0.lac || 'kuro', fuki: k0.fuki || 'kuro' };
    tempK = KD.KACCHU;
  }
  else if (!U.GENERALS[nm]) { const L = BP.zukanLook(nm); temp = key = 'zk:' + nm; U.GENERALS[key] = L || { armor: 0x1c1a1a, lace: 0x4a3a2a, hat: 'kabuto_m', mon: 'none', skin: 0xb88e6a }; }
  // K618（kaito「甲冑が全部の武将で似ている」）：戦の中の大将と同じ物を持たせて立たせる＝背の指物（竿つき・その人の旗印）と名のある得物（蜻蛉切・十文字槍など。named_gear.js）。
  //   前は preview の setGeneral で指物も得物も外し、全員が同じ黒い立ち姿に見えた。陣羽織は kaito 10/24「マントやめて」で戦と同じく着せない
  const NG = await import('../named_gear.js').catch(() => ({}));
  const gd = U.GENERALS[key] || {}, gear = (NG.NAMED_GEAR || {})[nm] || {};
  const sashi = studio ? null : (gd.flag || gear.flag || (gd.mon && gd.mon !== 'none' ? gd.mon : null));   // K628：写真の形は指物も得物も持たない
  {
    pv.holder.clear(); pv.horse = null;
    const u = { name: nm };   // 名を持たせる＝戦の中と同じ細かい胴丸と、その人の具足の形（armor_shape.js）
    const look = { armor: gd.armor, lace: gd.lace, hat: gd.hat, sode: true, pole: !!sashi, flag: sashi, flagScale: 1.3, weapon: studio ? null : (gear.weapon || null), spear: studio ? undefined : (gear.spear || undefined), style: gear.style || '',
      skin: gd.skin, saya: true, menpo: gd.menpo || 0, menpoStyle: gd.menpoStyle, horo: gd.horo ?? 0, haori: 0, noHaori: true, tier: 3, face: 'g:' + key, mon: gd.mon, haoriMonCol: gd.haoriMonCol };
    const mm = U.buildModel(u, look);
    if (u.hand) u.hand.rotation.x = -0.5; U.poseArms(u);
    pv.holder.add(mm);
    pv.holder.rotation.y = -0.45; pv.camera.position.set(0, 1.75, 5.8); pv.camera.lookAt(0, 1.45, 0);
    if (pv.humanize(u, mm)) { pv.holder.rotation.y = 0; u.heading = 0; mm.rotation.y = 0; pv.camera.position.set(0, 1.5, 4.4); pv.camera.lookAt(0, 1.22, 0); }
  }
  if (!sashi && pv.hu?.flag) pv.hu.flag.visible = false;
  const m = pv.holder.children[0], B = pv.hu?.human?.bones || null;
  const rest = new Map();
  if (B) for (const k of ['Neck', 'Head', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) if (B[k]) rest.set(k, B[k].quaternion.clone());
  const qy = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), axX = new THREE.Vector3(1, 0, 0), azZ = new THREE.Vector3(0, 0, 1), eu = new THREE.Euler();
  const s = new THREE.Vector3(), tg = new THREE.Vector3(), pl = new THREE.Vector3();
  return {
    pv,
    pose(p, t) {
      pv.holder.rotation.y = (p.turn || 0) + (p.yaw || 0);
      pv.holder.position.z = p.z || 0;
      pv.holder.position.y = 0;
      if (!B) return;
      // 骨の人の骨は matrixAutoUpdate が切ってあるので、替えた骨は自分で updateMatrix する
      for (const [k, q] of rest) { B[k].quaternion.copy(q); B[k].updateMatrix(); }
      // 息（胸のわずかな上下）と、遠くを見る首（7：武将ごとの立ちの動き）
      if (B.Spine1) B.Spine1.quaternion.multiply(qy.setFromAxisAngle(axX, Math.sin(t * 1.6) * 0.012));
      if (B.Neck && p.head) B.Neck.quaternion.multiply(qy.setFromAxisAngle(ax, p.head * 0.5));
      if (B.Head && p.head) B.Head.quaternion.multiply(qy.setFromAxisAngle(ax, p.head * 0.5));
      if (B.Head && p.pitch) B.Head.quaternion.multiply(qy.setFromAxisAngle(axX, p.pitch));   // うつむく（手の軍配を見る）
      for (const k of ['Spine1', 'Neck', 'Head']) B[k]?.updateMatrix();
      // K628・K631（kaito の三枚の写真：鎧櫃に腰かけ、腿は水平に前へ、脛当の足は揃えて真下へ、佩楯が膝の上に広がり、手は膝の上）：
      //   骨を角度で回すと、腿が前へ出ずに下へ垂れ、足先が外へ開いた（体が櫃の前に立って見えた）。腰の高さを櫃の座面に合わせ、
      //   膝と足首の行き先を決めて脚を IK で置く（腿＝前へ水平・脛＝真下・膝は少し外）。手は膝の少し手前の腿の上へ
      if (p.sit && P.ik2 && B.LeftUpLeg && B.LeftLeg && B.LeftFoot) {
        pv.holder.position.y = 0; pv.holder.updateMatrixWorld(true);
        const v = (k) => B[k].getWorldPosition(new THREE.Vector3());
        if (!this._legLen) { const hu = v('LeftUpLeg'), kn = v('LeftLeg'), an = v('LeftFoot'); this._legLen = [hu.distanceTo(kn), kn.distanceTo(an), hu.y]; }
        const [L1, L2, hipY] = this._legLen, SEAT = globalThis.__SIT?.seat ?? 0.5;   // 腰の骨の高さ＝櫃の座面（0.42）＋尻の厚み
        pv.holder.position.y = SEAT - hipY; pv.holder.updateMatrixWorld(true);
        const ry = pv.holder.rotation.y, rot = (x) => x.applyAxisAngle(ax, ry);
        const spread = globalThis.__SIT?.spread ?? 0.035, fwd = globalThis.__SIT?.fwd ?? 0.98;
        for (const [sd, sg] of [['Left', 1], ['Right', -1]]) {
          const u = B[sd + 'UpLeg'], l = B[sd + 'Leg'], f = B[sd + 'Foot']; if (!(u && l && f)) continue;
          const hip = u.getWorldPosition(new THREE.Vector3());
          // 足の向き：立った時の足の向き（体に対して）を覚え、脚を曲げた後に戻す（前は足先が外へ開いた）
          const hq = pv.holder.getWorldQuaternion(new THREE.Quaternion()), fq = f.getWorldQuaternion(new THREE.Quaternion());
          const rel = hq.clone().invert().multiply(fq);
          // 足首：膝（腰から前へ L1・少し外）の真下 L2。膝は前へ出す（pole＝前と少し外）
          tg.copy(hip).add(rot(new THREE.Vector3(sg * spread, -L2, L1 * fwd)));
          pl.copy(rot(new THREE.Vector3(sg * 0.55, 0.2, 1)));
          P.ik2(u, l, f, tg, pl);
          l.updateMatrixWorld(true);
          const want = hq.clone().multiply(rel), lq = l.getWorldQuaternion(new THREE.Quaternion());
          f.quaternion.copy(lq.invert().multiply(want)); f.updateMatrix(); f.updateMatrixWorld(true);
          // つま先を体の前へ向ける（立ち姿の足先は外へ開いているので、真上から見た向きだけを前へ回す）
          const toe = B[sd + 'ToeBase'];
          if (toe) {
            const fp = f.getWorldPosition(new THREE.Vector3()), tp = toe.getWorldPosition(new THREE.Vector3());
            const fw = rot(new THREE.Vector3(globalThis.__SIT?.toe ?? sg * 0.12, 0, 1));
            const a0 = Math.atan2(tp.x - fp.x, tp.z - fp.z), a1 = Math.atan2(fw.x, fw.z);
            const wq = new THREE.Quaternion().setFromAxisAngle(ax, a1 - a0).multiply(f.getWorldQuaternion(new THREE.Quaternion()));
            f.quaternion.copy(l.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq)); f.updateMatrix(); f.updateMatrixWorld(true);
          }
        }
        // 手を膝の少し手前の腿の上へ（肘は外へ張って少し後ろ）
        for (const [sd, sg] of [['Left', 1], ['Right', -1]]) {
          const a = B[sd + 'Arm'], fa = B[sd + 'ForeArm'], h = B[sd + 'Hand'], kn = B[sd + 'Leg']; if (!(a && fa && h && kn)) continue;
          const k = kn.getWorldPosition(new THREE.Vector3());
          const H2 = globalThis.__SIT?.hand ?? [0.0, 0.1, -0.12];
          tg.copy(k).add(rot(new THREE.Vector3(sg * H2[0], H2[1], H2[2])));
          pl.copy(rot(new THREE.Vector3(sg * 1, -0.1, -0.5)));
          P.ik2(a, fa, h, tg, pl);
        }
      }
      // 手を上げる（信長の「放て」の合図）・手を刀へ（立ちの動き）
      if ((p.arm > 0.01 || p.hilt > 0.01) && B.RightArm && B.RightForeArm && B.RightHand && P.ik2) {
        pv.holder.updateMatrixWorld(true);
        B.RightArm.getWorldPosition(s);
        // 向きは武将の前（+z）・右手（-x）の手前の座標で決めて、武将の向きへ回す。pole は肘の出る向き（ik2 は向きとして読む）
        const ry = pv.holder.rotation.y, rot = (v) => v.applyAxisAngle(ax, ry);
        if (p.arm > 0.01) {
          // 手を下げた所（肩の下）から、頭の上の右前へ（采配を上げる）
          const up = rot(new THREE.Vector3(-0.25, 0.9, 0.25)), dn = rot(new THREE.Vector3(-0.05, -0.55, 0.12));
          tg.copy(s).add(dn.lerp(up, p.arm)); pl.copy(rot(new THREE.Vector3(-0.5, -1, 0)));
        } else {
          // 右手を左の腰の刀の柄へ
          const hip = rot(new THREE.Vector3(0.16, -0.4, 0.2)), dn = rot(new THREE.Vector3(-0.05, -0.55, 0.12));
          tg.copy(s).add(dn.lerp(hip, p.hilt)); pl.copy(rot(new THREE.Vector3(-1, -0.2, 0.4)));
        }
        P.ik2(B.RightArm, B.RightForeArm, B.RightHand, tg, pl);
      }
    },
    dispose() {
      if (temp) {
        delete U.GENERALS[temp]; if (tempK) delete tempK[temp];
        for (const [k, mt] of FM.headMats) if (String(k).startsWith('g:' + temp)) { mt.map?.dispose(); mt.dispose?.(); FM.headMats.delete(k); }
        for (const [k, g] of FG.headGeos) if (String(k).startsWith('g:' + temp)) { g.dispose(); FG.headGeos.delete(k); }
      }
      void m;
    },
  };
}

// 登用の画面を開いた時に呼ぶ：骨の人・具足・兜の素材と、演出の部品を先に読む（書状を開いてから待たない・108）
let warm = null;
export function prewarmReveal() {
  if (!warm) warm = (async () => {
    await ORDER();
    const [{ loadHumans, loadDomaru, loadKabuto }, { loadGusoku }] = await Promise.all([import('../humans.js'), import('../gusoku_scan.js')]);
    await loadHumans(); await loadDomaru(); await loadKabuto(); await loadGusoku().catch(() => {});
    await Promise.all([import('../preview.js'), import('../world_army_geometry.js'), audioMod()]);
  })().catch(() => { warm = null; });
  return warm;
}

// 札の全身の絵（K601 の三人の横並び・図鑑の札）：[data-busho-body="名"] に、3D の全身を一枚の絵にして入れる。
//   描く板は一つだけを使い回し（三人分の 3D を同時に描かない＝携帯の記憶と描く回数を増やさない）、撮り終えて 6 秒使わなければ捨てる
const BODY = new Map();
let bodyQ = Promise.resolve(), bodyPv = null, bodyCv = null, bodyIdle = 0;
// 11/21（公開の版で十組の札の顔が6枚中4枚空だった）：撮れなかった時（描く板が作れない・端末が板を取り上げた・形が読めない）に
//   空のまま覚えない。板が失われていれば作り直して撮り直し、二度撮れなければ顔の絵（busho_portrait の一枚）と家紋で埋める
const blankShot = (gl, w, h) => {
  try { const px = new Uint8Array(4); for (const [fx, fy] of [[0.5, 0.35], [0.5, 0.5], [0.5, 0.65], [0.45, 0.8]]) { gl.readPixels(Math.round(w * fx), Math.round(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (px[3] > 0) return false; } return true; } catch (e) { return false; }
};
const dropBody = () => { clearTimeout(bodyIdle); bodyCv?.remove(); try { bodyPv?.dispose(); } catch (e) { /* 捨てるだけ */ } bodyPv = null; bodyCv = null; };
function bodyShot(b) {
  if (BODY.has(b.name)) return BODY.get(b.name);
  const p = bodyQ = bodyQ.then(async () => {
    clearTimeout(bodyIdle);   // 撮っている間に板を捨てない（前の一枚の6秒の片付けが、次の一枚の途中で来ていた）
    for (let tryN = 0; tryN < 2; tryN++) {
      if (bodyPv && bodyPv.renderer?.getContext?.().isContextLost?.()) dropBody();
      if (!bodyPv) {
        const { Preview } = await (await ORDER(), import('../preview.js'));
        bodyCv = document.createElement('canvas'); bodyCv.setAttribute('aria-hidden', 'true');
        bodyCv.style.cssText = 'position:fixed;left:-10000px;top:0;width:240px;height:400px;pointer-events:none';
        document.body.appendChild(bodyCv);
        bodyPv = new Preview(bodyCv);
        if (!bodyPv.renderer) { bodyCv.remove(); bodyPv = null; return null; }
        bodyPv.renderer.setPixelRatio(1); bodyPv.renderer.setSize(240, 400, false);
        bodyPv.camera.aspect = 240 / 400; bodyPv.camera.updateProjectionMatrix();
      }
      let hero = null;
      try { hero = await makeHero(bodyCv, b, bodyPv, true); } catch (e) { hero = null; }
      if (!hero) { dropBody(); continue; }
      // K628：写真の形（鎧櫃に座る具足・灰の背景・光一つ・正面）
      const rig = studioRig(bodyPv, {});
      hero.pose({ yaw: 0, sit: 1 }, 0);
      bodyPv.camera.position.set(0, 1.1, 3.9); bodyPv.camera.lookAt(0, 1.0, 0);
      bodyPv.renderer.render(bodyPv.scene, bodyPv.camera);
      const blank = blankShot(bodyPv.renderer.getContext(), 240, 400);
      const url = blank ? null : bodyCv.toDataURL('image/webp', 0.88);
      rig.dispose(); hero.dispose();
      if (!url) { dropBody(); continue; }
      clearTimeout(bodyIdle);
      bodyIdle = setTimeout(dropBody, 6000);
      return url;
    }
    return null;
  }).catch(() => null);
  BODY.set(b.name, p);
  p.then((u) => { if (!u) BODY.delete(b.name); });   // 撮れなかった人は覚えない（次に開いた時に撮り直す）
  return p;
}
// 撮れない時の埋め：顔の絵と家紋（bushou_card_art.js の fillCardArt と同じ物）
function bodyFallback(el, nm) {
  if (!el.isConnected || el.querySelector('img,canvas')) return;
  import('../bushou_card_art.js').then((A) => {
    if (!el.isConnected || el.querySelector('img')) return;
    el.innerHTML = '';
    const box = document.createElement('div'); box.dataset.bushoArt = nm; box.dataset.face = '1'; box.style.cssText = 'height:100%;justify-content:center';
    el.appendChild(box); A.fillCardArt(el);
  }).catch(() => {});
}
export function fillBodies(root) {
  for (const el of root.querySelectorAll('[data-busho-body]')) {
    if (el.dataset.bodyDone) continue; el.dataset.bodyDone = '1';
    const nm = el.dataset.bushoBody, b = BUSHOU_ONLINE.find((x) => x.name === nm) || { name: nm, house: 'other', id: nm };
    // 撮れるまでの間も空にしない：人の影の形（頭・胴・脚）を薄く出す
    if (!el.firstElementChild) el.innerHTML = '<span aria-hidden="true" style="display:block;width:46%;max-width:70px;height:88%;margin:auto auto 0;opacity:.35;background:radial-gradient(circle at 50% 9%,#2a2018 0 9%,#0000 10%),linear-gradient(#0000 18%,#2a2018 18% 62%,#0000 62%) 50% 0/62% 100% no-repeat,linear-gradient(#0000 62%,#2a2018 62%) 50% 0/40% 100% no-repeat"></span>';
    const art = (id) => { if (!el.isConnected) return; el.innerHTML = ''; const im = new Image(); im.src = portraitSrc(id); im.alt = ''; im.decoding = 'async'; im.style.cssText = 'height:100%;max-width:100%;width:auto;object-fit:contain;display:block;margin:0 auto'; el.appendChild(im); };
    const put = (url) => {
      if (!el.isConnected) return;
      if (!url) return bodyFallback(el, nm);
      el.innerHTML = '';
      const im = new Image(); im.src = url; im.alt = ''; im.style.cssText = 'height:100%;max-height:220px;width:auto;object-fit:contain;display:block;margin:0 auto';
      el.appendChild(im);
    };
    portraits().then((S) => (S.has(b.id) ? art(b.id) : bodyShot(b).then((url) => (url || !el.isConnected ? url : new Promise((r) => setTimeout(r, 1200)).then(() => bodyShot(b)))).then(put, () => put(null))));
  }
}

// 登用の画面（toyo_screen.js の setRevealHook）へ全部の格の登場を差す。［一括開封］・［全部スキップ］の時は飛ばす
export function installReveal(setRevealHook) {
  for (const k of ['N', 'R', 'SR', 'SSR']) setRevealHook(k, (card, b, ctx) => (ctx && ctx.skip ? null : playReveal(document.body, b, { multi: true })));
}

// ---------------- 画面の札 ----------------
const CSS = `
.trv{position:fixed;inset:0;z-index:9500;background:#000;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;overflow:hidden;touch-action:none}
.trv canvas.gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.trv .dark{position:absolute;inset:0;background:#000;pointer-events:none;transition:opacity .6s}
.trv .mon{position:absolute;left:50%;top:44%;width:min(46vh,46vw);height:min(46vh,46vw);transform:translate(-50%,-50%);opacity:0;pointer-events:none;filter:drop-shadow(0 0 18px #000)}
.trv .plate{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom));opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;pointer-events:none;text-shadow:0 2px 6px #000,0 0 2px #000}
.trv .plate.on{opacity:1;transform:none}
.trv .ep{font-size:18px;letter-spacing:.5em;color:#e8c77a}
.trv .nm{font-size:40px;font-weight:700;letter-spacing:.18em;line-height:1.15}
.trv .rk{display:inline-block;margin-top:4px;padding:2px 12px;border:2px solid currentColor;font:700 18px/1.3 serif;letter-spacing:.08em;background:#0009}
.trv .skip{position:absolute;top:max(8px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;gap:8px}
.trv .skip button{min-height:44px;min-width:88px;padding:4px 14px;font:inherit;color:inherit;background:#0008;border:1px solid #8a7350;border-radius:4px;cursor:pointer}
.trv .card{position:absolute;left:50%;top:50%;width:min(34vh,200px);height:min(62vh,330px);transform:translate(-50%,-50%);border:2px solid #b8955a;background:linear-gradient(#efe4c8,#d9c9a2);color:#2a1d12;border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 10px 40px #000c}
.trv .card .cnm{font-size:30px;font-weight:700;writing-mode:vertical-rl;letter-spacing:.18em}
.trv .card .crk{font:700 22px/1 serif}
.trv .stamp{position:absolute;right:-16px;bottom:-14px;width:46px;height:46px;border:3px solid #a8281c;color:#a8281c;border-radius:6px;display:flex;align-items:center;justify-content:center;font:700 22px serif;transform:rotate(-8deg) scale(2.2);opacity:0}
.trv .stamp.on{transform:rotate(-8deg) scale(1);opacity:.9;transition:transform .22s cubic-bezier(.3,1.6,.6,1),opacity .15s}
.trv .rflag{position:absolute;top:50%;width:min(22vh,120px);height:min(56vh,300px);transform:translateY(-50%);opacity:0;transition:opacity .4s,transform .6s}
.trv .rflag.on{opacity:.95}
.trv.rk-R .card{border-color:#9fc08a;box-shadow:0 0 0 3px #3a4a2a,0 10px 40px #000c}
@media (prefers-reduced-motion:reduce){.trv *{transition:none!important}}
`;
function css() { if (!document.getElementById('trv-css')) { const s = document.createElement('style'); s.id = 'trv-css'; s.textContent = CSS; document.head.appendChild(s); } }
function shell(root, b, multi) {
  css();
  const el = document.createElement('div'); el.className = `trv rk-${b.rank}`; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${b.rank} ${b.name}`);
  el.innerHTML = `<div class="dark"></div><canvas class="mon" width="256" height="256" aria-hidden="true"></canvas>
    <div class="plate"><div class="ep"></div><div class="nm">${esc(b.name)}</div><div class="rk" style="color:${RCOL[b.rank]}">${MARK[b.rank]} ${b.rank}・${HOUSE_NAME[b.house] || ''}</div></div>
    <div class="skip"><button data-a="skip">飛ばす</button>${multi ? '<button data-a="all">全部飛ばす</button>' : ''}</div>`;
  root.appendChild(el);
  return el;
}

// ---------------- 登場 ----------------
export async function playReveal(root, b, o = {}) {
  if (!b) return { skipped: false, skipAll: false };
  await ORDER();
  const { S } = await import('../settings.js').catch(() => ({ S: {} }));
  const quiet = !!S.reduceMotion;
  const A0 = await audioMod(); try { A0?.initAudio?.(); } catch (e) { /* 音無し */ }
  const el = shell(root, b, o.multi);
  let done = null, skipped = false, skipAll = false, stop = false;
  const fin = new Promise((r) => { done = r; });
  el.querySelector('.skip').onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; skipped = true; skipAll = a === 'all'; stop = true; done(); };
  const plate = el.querySelector('.plate'), dark = el.querySelector('.dark'), monC = el.querySelector('.mon');
  const H = HOUSE[b.house] || HOUSE.other;
  let cleanup = () => {};
  try {
    if (b.rank === 'N' || b.rank === 'R') {
      // N：札と印（約1秒・紙の音）。R：封が少し豪華・背後に家の旗・短い太鼓
      dark.style.opacity = '0'; el.style.background = 'radial-gradient(ellipse at 50% 40%,#3a2c1c,#0b0806 75%)';
      el.insertAdjacentHTML('beforeend', `${b.rank === 'R' ? '<canvas class="rflag" width="80" height="200" style="left:12%"></canvas><canvas class="rflag" width="80" height="200" style="right:12%"></canvas>' : ''}
        <div class="card"><span class="crk" style="color:${b.rank === 'R' ? '#3a5a2a' : '#4a3a28'}">${MARK[b.rank]} ${b.rank}</span><span class="cnm">${esc(b.name)}</span><span>${HOUSE_NAME[b.house] || ''}</span><div class="stamp">${b.rank === 'R' ? '登' : '用'}</div></div>`);
      plate.remove();
      noise(0.25, 'bandpass', 2600, 0.18, 0.005);
      if (b.rank === 'R') {
        const art = await import('../bushou_card_art.js').catch(() => null);
        for (const f of el.querySelectorAll('.rflag')) { art?.drawCardFlag(f, b.name); requestAnimationFrame(() => f.classList.add('on')); }
        snd('taiko', 0.55);
      }
      setTimeout(() => el.querySelector('.stamp')?.classList.add('on'), quiet ? 0 : b.rank === 'R' ? 520 : 380);
      const tm = o.hold != null ? 0 : setTimeout(done, (quiet ? 0.7 : REVEAL_SEC[b.rank]) * 1000);
      cleanup = () => clearTimeout(tm);
      await fin;
      return { skipped, skipAll };
    }
    // A・S・SS：3D の場
    const cv = document.createElement('canvas'); cv.className = 'gl'; el.insertBefore(cv, el.firstChild);
    const ss = b.rank === 'SSR' ? (SS[b.id] || ssBase(b)) : null;
    const kind = armKind(b);   // K601：SSR も含め、後ろの兵はその武将の主兵種だけ
    const mood = ss?.mood || H.mood;   // 11/24：前の A の昼の型は SR（前の S の型）にまとめた
    const flag = ss?.flag || (await import('../bushou_card_art.js').then((m) => m.cardLook(b.name).flag).catch(() => null)) || H.flag || 'tokugawa';
    const army = ss?.army ? { ...ss.army, kind, front: kind === 'gun' ? 'gunline' : '', n: kind === 'kiba' ? Math.min(ss.army.n, 180) : ss.army.n } : (b.rank === 'SR' ? { kind, n: kind === 'kiba' ? 120 : 160, nobori: 50, front: kind === 'gun' ? 'gunline' : '' } : { kind, n: kind === 'kiba' ? 40 : 60, nobori: 24, front: kind === 'gun' ? 'gunline' : '' });
    // 札を出す前に、音で格を先に知らせる（106）：A＝法螺、S＝風と法螺、SS＝遠くの太鼓から
    if (b.rank === 'SR') { noise(2.6, 'lowpass', 520, 0.22, 0.6); setTimeout(hora, 300); }
    if (ss) snd('otaiko', 0.7);
    const hero = await makeHero(cv, b);
    if (!hero || stop) { if (!hero) { dark.style.opacity = '0'; plate.classList.add('on'); await Promise.race([fin, new Promise((r) => setTimeout(r, 1200))]); } return { skipped, skipAll }; }
    const pv = hero.pv;
    const fit = () => { if (!pv.renderer) return; const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; pv.renderer.setSize(w, h, false); pv.camera.aspect = w / h; pv.camera.updateProjectionMatrix(); };
    fit(); addEventListener('resize', fit);
    for (const m of pv.floor || []) m.visible = true;
    const stage = await buildStage(pv, { mood, army, flag, armor: ss?.armor || H.armor, uma: ss ? (b.id === 'nobunaga' ? 'gold' : 'flag') : null, umaFlag: ss?.umaFlag, snow: ss?.snow, breath: ss?.breath, enemyPass: ss?.enemyPass, seed: b.id.length * 31 });
    if (!stage) { hero.dispose?.(); return { skipped, skipAll }; }
    if (ss?.horse) { try { const U = PREV[2]; const hs = U.buildHorse(); hs.position.set(1.6, 0, -1.6); hs.rotation.y = -1.25; pv.scene.add(hs); stage.horse = hs; } catch (e) { /* 馬無しでも見せる */ } }
    const art = await import('../bushou_card_art.js').catch(() => null);
    art?.drawCardMon(monC, b.name, '#e8c25a');
    el.querySelector('.ep').textContent = ss?.title || '';
    const cam = ss?.cam || (b.rank === 'SR' ? S_CAM : A_CAM), dur = quiet ? 1.2 : REVEAL_SEC[b.rank];
    const heroAt = ss?.hero || ((t) => ({ head: b.rank === 'SR' ? 0.25 * (1 - sm(1.5, 2.4, t)) : 0, hilt: b.rank === 'SR' ? sm(2.6, 3.2, t) : 0, z: 0, turn: 0 }));
    const beats = (ss?.beats || (b.rank === 'SR' ? [[0.2, 'march'], [1.0, 'mon'], [2.4, 'voiceS'], [2.6, 'title'], [2.6, 'buzz']].concat(kind === 'gun' ? [[1.8, 'volley']] : kind === 'kiba' ? [[1.4, 'gallop']] : []) : [[0.5, 'title']])).slice();
    const p0 = new THREE.Vector3(), l0 = new THREE.Vector3();
    const camAt = (t) => {
      if (quiet) { const k = cam[cam.length - 1]; pv.camera.position.set(...k[1]); pv.camera.lookAt(...k[2]); return; }
      let i = 0; while (i < cam.length - 2 && t > cam[i + 1][0]) i++;
      const a = cam[i], c = cam[i + 1] || a, k = sm(a[0], c[0], t);
      p0.set(lerp(a[1][0], c[1][0], k), lerp(a[1][1], c[1][1], k), lerp(a[1][2], c[1][2], k));
      l0.set(lerp(a[2][0], c[2][0], k), lerp(a[2][1], c[2][1], k), lerp(a[2][2], c[2][2], k));
      pv.camera.position.copy(p0); pv.camera.lookAt(l0);
    };
    const doBeat = (k, t) => {
      if (k === 'drum') snd('otaiko', 0.8);
      else if (k === 'hora') hora();
      else if (k === 'wind') noise(4.5, 'lowpass', 600, 0.3, 0.8);
      else if (k === 'gallop') snd('gallop', 0.8);
      else if (k === 'neigh') snd('neigh', 0.6);
      else if (k === 'march') snd('army', 0.7);
      else if (k === 'toki') snd('toki', 0.8);
      else if (k === 'volley') { stage.volley(t); snd('volley', 1); }
      else if (k === 'volley2') { stage.volley(t, true); snd('volley', 0.8); }
      else if (k === 'volleyFar') { stage.volley(t); snd('volleyFar', 0.9); }
      else if (k === 'dawn') stage.dawn(t);
      else if (k === 'mon') { if (!quiet) monC.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.25 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' }); }
      else if (k === 'voice') voice(ss.voice);
      else if (k === 'voiceS') voice(`${b.name}なり！`);
      else if (k === 'title') plate.classList.add('on');
      else if (k === 'buzz') buzz();
    };
    // 描く直前に一コマ分を進める（Preview の輪が描く前に、写し・兵・武将の姿を決める）
    const r0 = pv.renderer.render.bind(pv.renderer);
    let t = 0, last = performance.now(), ended = false;
    pv.renderer.render = (sc, c) => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (o.hold != null) t = o.hold;
      while (beats.length && beats[0][0] <= t) { const bt = beats.shift(); doBeat(bt[1], bt[0]); }
      camAt(t); hero.pose(heroAt(t), t); stage.update(t, dt);
      if (stage.horse && PREV[2].animateHorse) PREV[2].animateHorse(stage.horse, dt, 0);
      if (!ended && o.hold == null && t >= dur + 0.6) { ended = true; done(); }
      r0(sc, c);
    };
    if (o.hold != null) globalThis.__k600 = { pv, el, o };   // 試しの頁（toyo_reveal.html?t=）で止めた一コマを手で描くため
    // 描く輪が止まっても（裏へ回った・描けない）登用は止めない：決まった長さの後に必ず閉じる
    const guard = o.hold != null ? 0 : setTimeout(done, (dur + 3) * 1000);
    requestAnimationFrame(() => { dark.style.opacity = mood === 'night' ? '0.15' : '0'; });
    cleanup = () => {
      clearTimeout(guard); removeEventListener('resize', fit);
      stage.dispose(); if (stage.horse) pv.scene.remove(stage.horse); hero.dispose();
      pv.dispose();   // 描く板を今すぐ捨てる（裏に回って描く輪が止まっていても、WebGL を残さない）
    };
    await fin;
    return { skipped, skipAll };
  } finally {
    try { cleanup(); } catch (e) { /* 片付けの失敗で止めない */ }
    el.remove();   // 描く板が外れると Preview の輪が自分で dispose する
  }
}

// 武将ごとの立ちの動き（7）：十二秒ほどの輪。信長＝遠くを見る→手の軍配を見る→刀へ手、ほかは家の型（遠くを見る・刀へ手）
const IDLE = {
  nobunaga: (t) => { const p = t % 12; return { head: 0.3 * Math.sin(t * 0.3) * sm(0, 1.5, p) * (1 - sm(3.5, 4.5, p)), arm: 0.32 * sm(5, 6, p) * (1 - sm(8, 9, p)), pitch: 0.35 * sm(5.3, 6.2, p) * (1 - sm(8, 8.8, p)), hilt: sm(9.5, 10.2, p) * (1 - sm(11.2, 12, p)) }; },
  masakage: (t) => { const p = t % 10; return { head: -0.4 * sm(0.5, 2, p) * (1 - sm(4.5, 6, p)) + 0.25 * sm(6, 7, p) * (1 - sm(8.5, 9.5, p)) }; },
  shingen: (t) => { const p = t % 12; return { head: 0.15 * Math.sin(t * 0.25), arm: 0.28 * sm(4, 5, p) * (1 - sm(8, 9, p)), pitch: 0.2 * sm(4.2, 5, p) * (1 - sm(8, 8.6, p)) }; },
  kenshin: (t) => { const p = t % 12; return { head: 0.35 * sm(1, 3, p) * (1 - sm(6, 8, p)), pitch: -0.12 * sm(1, 3, p) * (1 - sm(6, 8, p)) }; },
  masamune: (t) => { const p = t % 10; return { head: -0.45 * sm(2, 3, p) * (1 - sm(5, 6, p)), hilt: sm(7, 7.8, p) * (1 - sm(9, 10, p)) }; },
};
const idleOf = (b) => IDLE[b.id] || ((t) => { const p = t % 11; return { head: Math.sin(t * 0.35) * 0.3 * sm(0, 2, p) * (1 - sm(5, 6, p)), hilt: sm(6.5, 7.3, p) * (1 - sm(9.2, 10, p)) }; });

// ---------------- 3D の舞台（5〜7・8〜16・80〜84） ----------------
//   el の中いっぱいに描く。指で左右に回す（ゆっくり）・素早く払うと onSwipe(±1)。後ろにその武将の軍勢
export function mountBushouStage(el, b, o = {}) {
  let cur = null, gen = 0, dead = false;
  const load = async (bb) => {
    const my = ++gen;
    if (cur) { cur.dispose(); cur = null; }
    const cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y'; el.appendChild(cv);
    const hero = await makeHero(cv, bb, null, !!o.studio);
    if (!hero || dead || my !== gen) { cv.remove(); hero?.dispose(); return; }
    const pv = hero.pv, H = HOUSE[bb.house] || HOUSE.other, kind = o.kind || armKind(bb);
    const flag = (await import('../bushou_card_art.js').then((m) => m.cardLook(bb.name).flag).catch(() => null)) || H.flag || 'tokugawa';
    // 騎馬の将は、そばに乗馬（山県＝馬と槍。馬上の骨の姿は戦の側の作りが要るので、今は轡を取る立ち姿）
    let horse = null; const A2 = PREV?.[2];
    if (kind === 'kiba' && A2?.buildHorse) { try { horse = A2.buildHorse(); horse.position.set(1.5, 0, -1.3); horse.rotation.y = -1.2; pv.scene.add(horse); } catch (e) { horse = null; } }
    const rig = o.studio ? studioRig(pv, {}) : null;   // K628：写真の形（鎧櫃に座る・灰の背景・光一つ）
        const stage = rig ? { update() {}, dispose() { rig.dispose(); } } : await buildStage(pv, { mood: o.mood || H.mood, army: o.army === false ? { n: 0 } : { kind, n: o.n || 90, nobori: o.nobori || 30, front: kind === 'gun' ? 'gunline' : '' }, flag, armor: H.armor, seed: bb.id.length * 17 });
    if (!stage) { cv.remove(); hero.dispose?.(); return; }
    for (const m of pv.floor || []) m.visible = true;
    const fit = () => { if (!pv.renderer) return; const w = el.clientWidth || 300, h = el.clientHeight || 300; pv.renderer.setSize(w, h, false); pv.camera.aspect = w / h; pv.camera.updateProjectionMatrix(); };
    // K619（11/22 k564 の測り：軍団編成の 3D が止まらず毎コマ約18回の WebGL）：指で触っていない間は4秒で止める（最後の一コマを残す）。触る・武将を替える・大きさが変わると動き出す
    let wake = performance.now(), still = false;
    const poke = () => { wake = performance.now(); still = false; };
    fit(); const ro = new ResizeObserver(() => { fit(); poke(); }); ro.observe(el);
    // 指で回す・払う
    let yaw = o.studio ? 0 : 0.35, x0 = null, tx = 0, vx = 0, pid = -1;
    cv.addEventListener('pointerdown', (e) => { poke(); x0 = e.clientX; tx = performance.now(); vx = e.clientX; pid = e.pointerId; try { cv.setPointerCapture(pid); } catch (er) { /* 掴めなくても回せる */ } });
    cv.addEventListener('pointermove', (e) => { if (x0 == null || e.pointerId !== pid) return; poke(); yaw += (e.clientX - vx) * 0.012; vx = e.clientX; });
    const up = (e) => { if (x0 == null) return; const dx = e.clientX - x0, dtm = performance.now() - tx; x0 = null; if (o.onSwipe && Math.abs(dx) > 70 && dtm < 280) { yaw -= dx * 0.012; o.onSwipe(dx < 0 ? 1 : -1); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const r0 = pv.renderer.render.bind(pv.renderer);
    let t = 0, last = performance.now(), shown = true;
    // K619：画面の外・裏へ回った間は描かない（動かさない間は下で止める）（登用のトップが止まらず描いて熱くなる）
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { shown = es[es.length - 1].isIntersecting; }) : null; io?.observe(el);
    // 立ちの動き（7）：遠くを見る・刀へ手を掛ける を十秒ほどの間にゆっくり
    pv.renderer.render = (sc, c) => {
      const now = performance.now();
      if (!shown || document.hidden || !el.isConnected) { last = now; return; }   // 画面の外・裏へ回った間は描かない
      if (x0 == null && now - wake > 4000) { if (still) { last = now; return; } still = true; }   // 止まる前の最後の一コマは描く
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      hero.pose(o.studio ? { yaw, sit: 1, head: idleOf(bb)(t).head } : { yaw, ...idleOf(bb)(t) }, t);
      if (horse && A2?.animateHorse) A2.animateHorse(horse, dt, 0);
      stage.update(t, dt);
      if (o.studio) { const ox = -Math.min(1.3, Math.max(0, pv.camera.aspect - 1) * 0.35); pv.camera.position.set(ox, 1.0, 3.4); pv.camera.lookAt(ox, 0.9, 0); } else { pv.camera.position.set(0.25, 1.35, 4.2); pv.camera.lookAt(0, 1.05, 0); }
      r0(sc, c);
    };
    el.__stagePv = pv;   // 試しの頁で一コマを手で描くため
    cur = { dispose: () => { ro.disconnect(); io?.disconnect(); if (horse) pv.scene.remove(horse); stage.dispose(); hero.dispose(); pv.dispose(); cv.remove(); } };
    if (dead || my !== gen) { cur.dispose(); cur = null; }   // 読む間に閉じられた時は、その場で捨てる
  };
  load(b);
  return { set: (bb) => load(bb), dispose: () => { dead = true; gen++; if (cur) cur.dispose(); cur = null; } };
}

// 軍団編成（K600 80〜84・K601 56）の差し込み口：選んだ武将の名で中央の3D全身（後ろにその主兵種の隊・指で回す）。
//   hensei_ui.js（k598-tonya）が、選んだ枠が替わるたびに h.set(名) を呼び、画面を閉じる時に h.dispose() を呼ぶ
export function mountHenseiCenter(el, name, o = {}) {
  const find = (n) => BUSHOU_ONLINE.find((x) => x.name === n) || null;
  let st = null, cur = null;
  const set = (n) => { const b = find(n); if (!b || b === cur) return; cur = b; if (st) st.set(b); else st = mountBushouStage(el, b, { n: 70, nobori: 24, ...o }); };
  if (name) set(name);
  return { set, dispose: () => { st?.dispose(); st = null; cur = null; } };
}
