// 天王寺・岡山の戦い（b_k15_tennoji_okayama.js）の音と声。
// 既にある音（audio.js の sfx・farNext・withPan）と台詞（rt.say）だけを使う。外の素材・新しい音の焼きは無し（重さを増やさない）。
// 鳴らす所は戦場の決まった場所（茶臼山・天王寺口・本陣・安居の天神・大坂城）と、動いている隊の真ん中。
// 遠さで小さく遅く・こもって、向きで左右に分かれて届く（farNext → withPan）。同じ音は名ごとの間を空け、連打しない。
// 本体は setup で k15SoundSetup(rt)、update の頭で k15SoundTick(rt, dt) を呼ぶだけ。段の移りは F.step を見て自分で気づく。
import { sfx, farNext, withPan, hush, setWarStage } from '../audio.js';
import { WIND_STATE } from '../world.js';
import { centerOf } from '../bhelp.js';

const CHAUSU = { x: -106, z: 4 };     // 茶臼山（真田の陣）
const SHITENNO = { x: -46, z: -14 };  // 四天王寺の南門の前（毛利勝永）
const FRONT = { x: -46, z: 40 };      // 天王寺口の先手
const YASUI = { x: -89, z: -37 };     // 安居の天神
const HON = { x: -40, z: 130 };       // 家康の本陣
const CASTLE = { x: 60, z: -470 };    // 大坂城
const OKAYAMA = { x: 80, z: 60 };     // 岡山口（東。将軍の手と大野治房の戦い。遠音だけ）

// 名ごとの最短の間（秒）。これより早くは同じ音を鳴らさない
const GAP = { horagai: 9, jindaiko: 6, farHorn: 12, farDrum: 6, volley: 3, gunEcho: 4, volleySmall: 3, toki: 8, eshout: 4, himei: 5, cry: 5,
  hooves: 3, tramp: 3, gallop: 3.4, hoofGallop: 0.5, farClash: 4, fireSpread: 6, crack: 4, houseCollapse: 14, siegeDistant: 10, kane: 10, bellRapid: 14, kachidoki: 30 };
const pt = { x: 0, z: 0 };

// p の場所から name の音を鳴らす。ref は「この遠さで半分の大きさ」（大きな音ほど遠くまで届く）
function at(rt, p, name, vol = 1, ref = 80) {
  const st = rt.flags._k15snd;
  if (!st || rt.over) return false;
  const last = st.last[name] || -1e9, gap = GAP[name] || 3;
  if (rt.t - last < gap) return false;
  const cam = rt.camera && rt.camera.position, P = rt.player;
  if (!cam || !P) return false;
  st.last[name] = rt.t;
  const dx = p.x - cam.x, dz = p.z - cam.z, d = Math.hypot(dx, dz) || 1, yaw = P.yaw || 0;
  const back = Math.max(0, -(dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d);
  const pan = ((dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / d) * 0.7;
  farNext(d, back, p, cam, rt.world, WIND_STATE, name);
  withPan(pan, () => sfx(name, vol / (1 + d / ref)));
  return true;
}
const mid = (g) => { if (!g || g.routed || !(g.count > 0)) return null; const c = centerOf(g)(); pt.x = c.x; pt.z = c.z; return pt; };
const dist = (rt, p) => { const q = rt.player && rt.player.u && rt.player.u.pos; return q ? Math.hypot(p.x - q.x, p.z - q.z) : 999; };
// 次に鳴らすまでの秒（毎回少しずらし、拍子が揃って機械の音に聞こえないように）
const next = (st, key, a, b) => { st.next[key] = st.t + a + Math.random() * (b - a); };
const due = (st, key) => st.t >= (st.next[key] || 0);

// 段ごとの名のある将の短い台詞（史実に沿う。一文を短く）
const LINES = {
  0: [[2, '真田信繁', '茶臼山から動くな。鉄砲が鳴るまで待て'], [6, '毛利勝永', '豊臣の家の、最後の一戦ぞ']],
  1: [[9, '本多忠朝', '退くな！　この忠朝が先に立つ'], [15, '毛利勝永', '鉄砲、続けて放て！']],
  2: [[6, '真田信繁', '六文銭を押し立てよ！'], [14, '徳川家康', '旗本、前へ出よ！']],
  3: [[5, '旗本', '大御所様はいずこ！　馬印はどこじゃ！'], [12, '徳川家康', '旗本は何をしておる！']],
  4: [[11, '水野勝成', '水野の槍、続け！　真田を囲め！'], [16, '真田信繁', 'まだじゃ。家康の首を取るまで退くな']],
  5: [[8, '真田信繁', '少し休ませてくれ。もう槍も重い']],
};

export function k15SoundSetup(rt) {
  rt.flags._k15snd = { t: 0, step: -1, last: Object.create(null), next: Object.create(null), quiet: false, burn: false };
}

function stepStart(rt, st, step) {
  const F = rt.flags;
  st.next = Object.create(null);
  // 戦の曲の五段階（docs/k15_crisis_spec_1108.md 7）：A 通常→B 毛利突破でテンポ上昇→C 真田で低音と太鼓→D 本陣危機でほぼ消す→E 後詰でテーマ復帰
  setWarStage(step === 2 ? 2 : step === 3 ? 3 : step >= 4 ? 4 : 0);
  if (step === 1) rt.after(40, () => { if (!rt.over && F.step === 1) setWarStage(1); });
  for (const [sec, sp, text] of LINES[step] || []) rt.after(sec, () => { if (!rt.over && F.step === step && !F.ending) rt.say(sp, text, 3); });
  if (step === 1) { rt.after(0.4, () => at(rt, CHAUSU, 'horagai', 0.9, 160)); rt.after(2.4, () => at(rt, SHITENNO, 'volley', 1, 140)); }
  if (step === 2) { at(rt, CHAUSU, 'horagai', 1, 180); rt.after(1, () => at(rt, CHAUSU, 'toki', 1, 120)); }
  if (step === 3) { at(rt, HON, 'bellRapid', 0.8, 90); }
  if (step === 4) { rt.after(1.5, () => at(rt, CHAUSU, 'farHorn', 0.8, 160)); }
}

export function k15SoundTick(rt, dt) {
  const F = rt.flags, st = F._k15snd;
  if (!st || rt.over) return;
  st.t += dt;
  const step = F.step || 0;
  if (step !== st.step && !F.ending) { st.step = step; stepStart(rt, st, step); }

  // 大坂城が燃える（勝ちの後）。遠い北の空から、火のはぜる音と崩れる音
  if (F.burned) {
    if (!st.burn) { st.burn = true; next(st, 'fire', 1, 2); next(st, 'fall', 6, 9); }
    if (due(st, 'fire')) { at(rt, CASTLE, Math.random() < 0.6 ? 'fireSpread' : 'crack', 1.6, 320); next(st, 'fire', 4, 7); }
    if (due(st, 'fall')) { at(rt, CASTLE, 'houseCollapse', 1.4, 320); next(st, 'fall', 12, 18); }
    return;
  }
  if (F.ending) return;

  // 安居の天神の杜は静か：杜に入ると楽を下げ、戦の音はごく遠く小さくだけにする
  const quiet = step === 5 && dist(rt, YASUI) < 26;
  if (quiet && !st.quiet) hush(6);
  st.quiet = quiet;
  if (quiet) {
    if (due(st, 'q')) { at(rt, FRONT, 'farClash', 0.25, 60); next(st, 'q', 9, 14); }
    if (due(st, 'qc')) { at(rt, CASTLE, 'siegeDistant', 0.6, 300); next(st, 'qc', 16, 24); }
    return;
  }

  // 敵の騎馬の蹄（11/8 kaito「近づくほど大きく。進軍が来たのが分かるように」）：一番近い、走っている敵の騎馬から。
  //   遠い（百メートル）うちは小さくまばらに、近いほど大きく速い拍子で。ほかの音と違い、遠さでの弱まりを強くする（ref 22）
  hoofTick(rt, st);

  // 岡山口（東）の遠い戦の音は、戦の間ずっと薄く
  if (step >= 1 && due(st, 'oka')) { at(rt, OKAYAMA, Math.random() < 0.5 ? 'volleySmall' : 'farClash', 0.6, 120); next(st, 'oka', 9, 15); }

  if (step === 0) {
    // 開戦の前：茶臼山の法螺貝と陣太鼓が、間をおいて
    if (due(st, 'drum')) { at(rt, CHAUSU, 'jindaiko', 0.7, 140); next(st, 'drum', 7, 11); }
    if (due(st, 'hora')) { if (st.t > 3) at(rt, CHAUSU, 'horagai', 0.6, 160); next(st, 'hora', 14, 20); }
  } else if (step === 1) {
    // 天王寺口：毛利の手の鉄砲の一斉射と鬨の声。茶臼山の太鼓が遠く
    const m = mid(F.mori) || SHITENNO;
    if (due(st, 'vol')) { at(rt, m, Math.random() < 0.7 ? 'volley' : 'gunEcho', 1.2, 150); next(st, 'vol', 2, 5); }   // 11/12 MB二（台帳 K032「鉄砲の音がもっと」）：大きく・間を短く
    if (due(st, 'toki')) { if (st.t > 4) at(rt, m, 'toki', 0.9, 100); next(st, 'toki', 12, 18); }
    if (due(st, 'drum')) { at(rt, CHAUSU, 'jindaiko', 0.6, 140); next(st, 'drum', 9, 13); }
  } else if (step === 2 || step === 4) {
    // 真田の突撃：赤備えの足と蹄の地鳴り。突撃する隊の真ん中から
    const g = step === 2 ? mid(F.sanada) : (mid(F.nobu) || mid(F.nobu2));
    if (g && due(st, 'run')) { at(rt, g, Math.random() < 0.5 ? 'hooves' : 'tramp', 1.2, 70); next(st, 'run', 3, 5); }
    if (g && due(st, 'toki')) { at(rt, g, step === 2 ? 'toki' : 'eshout', 1, 90); next(st, 'toki', 10, 15); }
    if (due(st, 'vol')) { at(rt, Math.random() < 0.5 ? FRONT : HON, Math.random() < 0.6 ? 'volley' : 'volleySmall', 0.9, 130); next(st, 'vol', 3, 6); }   // 11/9 kaito 四10：鉄砲の音をもっと
    if (due(st, 'drum')) { at(rt, CHAUSU, 'jindaiko', 0.6, 140); next(st, 'drum', 8, 12); }
  } else if (step === 3) {
    // 家康の本陣の混乱：叫び・悲鳴・早鐘。真田の二番手の地鳴り
    if (due(st, 'cry')) { at(rt, HON, Math.random() < 0.5 ? 'himei' : 'cry', 0.9, 60); next(st, 'cry', 4, 7); }
    if (due(st, 'sh')) { at(rt, HON, 'eshout', 0.9, 60); next(st, 'sh', 5, 8); }
    if (due(st, 'vol')) { at(rt, HON, Math.random() < 0.6 ? 'volley' : 'gunEcho', 1.1, 130); next(st, 'vol', 3, 6); }
    if (due(st, 'bell')) { at(rt, HON, 'bellRapid', 0.6, 90); next(st, 'bell', 16, 22); }
    const g = mid(F.sanada2);
    if (g && due(st, 'run')) { at(rt, g, Math.random() < 0.5 ? 'hooves' : 'tramp', 1.1, 70); next(st, 'run', 3, 5); }
  } else if (step === 5) {
    // 退く信繁を追う：後ろの戦は遠ざかる
    if (due(st, 'far')) { at(rt, FRONT, 'farClash', 0.6, 80); next(st, 'far', 6, 10); }
  }
}

const hp = { x: 0, z: 0 };
function hoofTick(rt, st) {
  if (!due(st, 'hoof')) return;
  const P = rt.player && rt.player.u && rt.player.u.pos, A = rt.army;
  if (!P || !A) { next(st, 'hoof', 1, 1); return; }
  let best = null, bd = 110;
  for (const u of A.units) {
    if (!u.alive || u.team !== 1 || !u.mounted || u.fleeing) continue;
    const v = u.vel, sp = v ? Math.hypot(v.x, v.z) : 0;
    if (sp < 2.2) continue;   // 歩く馬・止まった馬は鳴らさない（駆けて来る騎馬だけ）
    const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) { next(st, 'hoof', 0.8, 1.2); return; }
  hp.x = best.pos.x; hp.z = best.pos.z;
  const k = 1 - bd / 110;   // 近さ 0〜1
  // gallop・hooves は多くの蹄の続く音（一つが四秒ほど）。間は音の長さに合わせ、近さで大きさを変える。間近（二十五メートル）では一頭の蹄も重ねる
  at(rt, hp, bd < 45 ? 'gallop' : 'hooves', 0.35 + 1.75 * k * k, 22);
  if (bd < 25) at(rt, hp, 'hoofGallop', 0.6 + 0.8 * k, 12);
  next(st, 'hoof', bd < 25 ? 0.6 : 3.4, bd < 25 ? 0.9 : 4.6);
}
