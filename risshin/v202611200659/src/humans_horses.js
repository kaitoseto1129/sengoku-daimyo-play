// 人の処理：馬の形と読み込み。外部向けの入口は humans.js。
import { assetBytes, texOr } from './bin_assets.js';
import * as THREE from 'three';
import { GLTFLoader } from './glb_loader.js';
import { prepHorse, HORSE, HORSE_Q, HR, PX_HORSE_K, proxyLo, _pxOff, SEAT_B, CHEST_B, HIP_B } from './humans_horse_model.js';
import { horseMaterials, _lin } from './humans_horse_materials.js';
import { HORSE_HOOK } from './units.js';
import { driveHorse, placeHorseExtras } from './humans_horse_animate.js';
import { S, MEM_TIGHT } from './settings.js';
import { makeRealHorse, dressHorse, tackGeometry, colGeo, tf, strap, mergeG } from './humans_horse_tack.js';
import { preparationFrame } from './humans_shared.js';
import { MK, horseFarTackParts } from './units_model.js';
import { PLAIN_UV } from './humans_dress.js';
import { stirrupParts } from './horse_tack.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodSwap } from './units_flags.js';

// 写真から作った和鞍（.local-tools/meshy_gen.mjs：MET「Saddle (Kura)」2000.405 の写真（CC0）から Meshy で作った物。絵 512。docs/meshy_1104.md）
// 形は前が +x・底が y=0 の箱なので、前を +z へ回し、長さ 0.5m にして馬の根元の座標（背の上）へ置く。材質は一つを使い回す
function kuraGeometry(gl) {
  let g = null, map = null;
  gl.scene.updateMatrixWorld(true);
  gl.scene.traverse((o) => {
    if (!o.isMesh || g) return;
    const src = o.geometry, n = src.attributes.position.count, p = src.attributes.position, t = src.attributes.uv;
    // 量子化した形は、行列を掛ける前に小数へ戻す
    const P = new Float32Array(n * 3), U = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { P[i * 3] = p.getX(i); P[i * 3 + 1] = p.getY(i); P[i * 3 + 2] = p.getZ(i); if (t) { U[i * 2] = t.getX(i); U[i * 2 + 1] = t.getY(i); } }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (src.index) g.setIndex(Array.from(src.index.array));
    g.applyMatrix4(o.matrixWorld);
    map = o.material.map;
  });
  g.rotateY(-Math.PI / 2);
  g.computeBoundingBox();
  const b = g.boundingBox, s = 0.5 / (b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(s, s, s);
  g.translate(0, 1.15, -0.005);
  g.computeVertexNormals(); g.computeBoundingSphere();
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
  return { geo: g, mat: new THREE.MeshStandardMaterial({ map, color: 0x4a3028, roughness: 0.34, metalness: 0.05, side: THREE.DoubleSide }) };   // 11/20 imac/look-cavalry 二回目：写真の鞍の地が白木のように白っぽく、朱や黒の馬具から浮いた。地を溜塗（赤みの黒漆）へ沈める（東博「芦穂蒔絵鞍」は黒漆地。絵の木目と擦れは濃淡で残る）
}
let hrLoading = null;
function loadHorse() {
  if (hrLoading) return hrLoading;
  hrLoading = (async () => {
    const buf = await assetBytes('horse');
    const tl = new THREE.TextureLoader();
    const names = ['horse_col', 'horse_nrm', 'hair_col', 'hair_nrm', 'shoe_col', 'tack_col'];
    const [gl, ...ts] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...names.map((n) => texOr(n, new URL('../assets/horse_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: 4 })),
    ]);
    const tex = {};
    names.forEach((n, i) => { tex[n] = ts[i]; });
    prepHorse(gl, tex);
    // 和鞍の前輪・後輪・居木を、写真から作った本物の鞍の形に（読めなければ今の組んだ鞍のまま）
    // 見比べる時：?oldkura で今までの組んだ鞍だけにする
    if (!/[?&]oldkura\b/.test(location.search)) try { HR.kura = kuraGeometry(await new GLTFLoader().parseAsync((await assetBytes('meshy_kura')).buffer, '')); } catch (e) { console.warn('写真から作った鞍を読めませんでした（組んだ鞍で描きます）', e); }
    // 毛色と家ごとの馬具の色の材質を先に作っておく（戦の中で new しない。形の下ごしらえは一つを使い回す）
    try {
      const { COATS, horseStyleFor, FACTION } = await import('./units.js');
      for (const fac of ['', ...Object.keys(FACTION)]) for (const rk of [0, 1, 2]) for (const c of COATS) horseMaterials({ ...horseStyleFor(0, rk, fac), coat: c.coat, mane: c.mane, points: c.points });
    } catch (e) { /* 先に作れなくても、要る時に作る */ }
    HORSE.ready = true;
    HORSE_HOOK.drive = driveHorse;
  })().catch((e) => { HORSE.failed = true; HORSE.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の馬を読めませんでした（今の形の馬で描きます）', e); });
  return hrLoading;
}
// 支度中の戦場の光を明示して、馬の形・馬具・描き方を先に用意する。
// game.battle への引き渡し前でも動き、二戦目もその戦場の光で準備する。
async function primeHorses(rt, current = () => true) {
  // 本能寺などの徒歩の戦で、使わない馬の展開と最大八秒の待ちを挟まない（馬上の将・飾りの馬が一頭でもいれば、9月の馬で描くため読む）
  if (!horsesInBattle(rt) || !current()) return;
  let timer;
  try {
    const ready = await Promise.race([loadHorse().then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 8000); })]);
    if (!ready) return;
  } finally { clearTimeout(timer); }
  if (!HORSE.ready || !current()) return;
  // 徒歩の戦（noHorse）で定義の horse: true が真偽のまま残る将がいる。形（userData）の無い物は飛ばす（比叡山で読み込みが落ちた）
  const isHorse = (h) => !!(h && typeof h === 'object' && h.userData);
  const horses = new Set(rt.army.units.map(u => u.horse).filter(isHorse));
  if (isHorse(rt.player.horse)) horses.add(rt.player.horse);
  // 遠い馬の静かな形は残す。骨と動きの作り置きは、開幕で使う距離だけ。
  // 戦中の選び方・上限は updateHorses のまま、近づいた馬は通常どおり作る。
  const near = new Set(), cam = rt.camera.position;
  const range = HORSE_Q[S.quality].near;
  for (const u of rt.army.units) {
    if (u.gone || !u.mounted || !isHorse(u.horse) || u.horse.visible === false || (!u.alive && u.deadT > 30)) continue;
    const named = u.look?.officer || u.type === 'busho' || typeof u.look?.face === 'string' && u.look.face.startsWith('g:');
    if (u.isPlayer || Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) < (named ? (60) : range)) near.add(u.horse);
  }
  if (isHorse(rt.player.horse)) near.add(rt.player.horse);
  const prepared = [], styles = new Set();
  const cap = Math.min(near.size, HORSE_Q[S.quality].max);
  // 一頭ごとに一コマ待つと、馬の多い戦（設楽原・天王寺 約 140 頭）で待つだけで 2 秒を超えた（11/9 読み込み）。12ms 働いたら一コマ譲る
  let yieldAt = performance.now() + 12;
  try {
    for (const h of horses) {
      if (!current()) return;
      applyProxy(h);
      const st = h.userData.style || {};
      // 階級・家を持たない拵えもあるため、実際の馬具の色も鍵に含める。
      const key = [st.coat, st.mane, st.points, st.rank, st.faction, st.tack, st.saddle, st.rim, st.cushion, st.aori, st.tassels, st.big, st.reins].join('|');
      if (near.has(h) && !styles.has(key)) {
        styles.add(key);
        const R = prepared.length < cap ? (HR.pool.pop() || makeRealHorse()) : prepared[0];
        if (prepared.length < cap) prepared.push(R);
        dressHorse(R, st);
      }
      if (performance.now() > yieldAt) { await preparationFrame(); yieldAt = performance.now() + 12; }
    }
  } finally {
    HR.pool.push(...prepared);
    if (typeof window !== 'undefined' && window.__loadTimes) window.__loadTimes.horsesPrimed = prepared.length;
  }
}
// 遠めの馬の脚：面を減らした形は脚が細い棒になる。高さごとの芯から外へ膨らませ、前腕と脛（すね）の肉・膝（腕節）と飛節・球節の関節の膨らみを付ける（頂点は増やさない）
const LEG_JOINT = [[0.47, 0.2], [0.47, 0.2], [0.57, 0.2], [0.57, 0.2]];   // 前脚は腕節・球節、後脚は飛節・球節の高さ（m）
const LEG_FAT = 0.5;
function legSlices(g, S) {
  const m = /^[ul](\d)$/.exec(g); if (!m) return null;
  const leg = +m[1], N = 40, D = 0.03, sx = new Float32Array(N), sz = new Float32Array(N), sn = new Float32Array(N);
  for (let i = 0; i < S.P.length / 3; i++) { const y = S.P[i * 3 + 1], b = Math.floor(y / D); if (b < 0 || b >= N) continue; sx[b] += S.P[i * 3]; sz[b] += S.P[i * 3 + 2]; sn[b]++; }
  const c = (y) => { const b = Math.floor(y / D); return b >= 0 && b < N && sn[b] >= 3 ? [sx[b] / sn[b], sz[b] / sn[b]] : null; };
  // 脚を縮めた在来馬の形では、関節の高さも縮む。脚はもう太いので、膨らませる分は控えめに
  const ly = HR.legY || 1, fat = ly < 1 ? 0.55 : 1;
  const [jk, jf] = LEG_JOINT[leg].map((y) => y * ly), hind = leg >= 2, ss = THREE.MathUtils.smoothstep, bump = (y, y0, w) => Math.exp(-(((y - y0) / w) ** 2));
  const k = (y) => {
    const top = 1 - ss(y, (hind ? 0.78 : 0.74) * ly, (hind ? 0.95 : 0.9) * ly);   // 胴との境目は動かさない
    // 前腕・脛は太く、管（すね骨）は締まり、関節は膨らむ。蹄は少しだけ
    const meat = ss(y, jk + 0.04, jk + 0.16) * 0.5, cannon = 0.36, joint = bump(y, jk, 0.05) * 0.26 + bump(y, jf, 0.035) * 0.24;
    // 11/20 imac/look-cavalry 六回目：骨入りの馬と並べると、中ほどの脚は太さが倍近くあり、十四頭の枠の境で脚が急に細くなって見えた。膨らみを半分に（LEG_FAT）
    const f = (y < 0.1 ? 0.12 : cannon + meat + joint) * top * LEG_FAT;
    return [1 + f * 0.85 * fat, 1 + f * fat];   // 管は横より前後に厚い
  };
  return { c, k };
}
// 毛色・馬具ごとの形（部位ごとの BufferGeometry。今の形の馬の部品の座標＝根元の座標 / HORSE_K から支点を引いた所）
function proxyGeos(st) {
  const PX = HR.proxy, K = PX_HORSE_K;
  const key = [st.coat, st.mane, st.points ?? 0, st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (PX.styles.has(key)) return PX.styles.get(key);
  const coat = new THREE.Color(st.coat ?? 0x5a321c), mane = new THREE.Color(st.mane ?? 0x1a1410), hoof = new THREE.Color(0x1a1511), skin = new THREE.Color(0x231a14);
  const pts = st.points ?? 0, c = new THREE.Color();
  const out = {};
  // 11/20 imac/look-cavalry 三回目：毛色の素材の印が人の肌（MK.skin）で、遠くの馬（布の印）と光の返り方が違い、同じ鹿毛が中ほどでは黒く・遠くでは明るい橙に見えて 30m の境で色が跳んだ。
  //   中ほどと遠くを同じ印（木＝艶の無い面）・同じ焼き込みの式に揃える
  const mtlSkin = MK.wood + MK.wood * 8 + 0.2 * 0.9, mtlHair = MK.cloth + MK.cloth * 8;
  for (const g in PX.G) {
    const S = PX.G[g], n = S.P.length / 3, pv = PX.piv[g] || new THREE.Vector3();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mt = new Float32Array(n);
    const leg = legSlices(g, S);
    for (let i = 0; i < n; i++) {
      let x = S.P[i * 3], y = S.P[i * 3 + 1], z = S.P[i * 3 + 2];
      if (leg) { const k = leg.k(y), c = leg.c(y); if (c) { x = c[0] + (x - c[0]) * k[0]; z = c[1] + (z - c[1]) * k[1]; } }
      pos[i * 3] = (x - pv.x) / K; pos[i * 3 + 1] = (y - pv.y) / K; pos[i * 3 + 2] = (z - pv.z) / K;
      const kd = S.K[i];
      if (kd === 1) c.copy(hoof);
      else if (kd === 2) c.copy(mane).multiplyScalar(0.7 + 0.5 * S.T[i]);
      else if (kd === 3) c.setRGB(0.02, 0.016, 0.014);
      else {
        // 11/20 imac/look-cavalry 五回目（骨入りと並べた写真）：中ほどの毛色は骨入りより暗く、赤みが濃かった（骨入りは毛並みの鈍い照りで白っぽく返る）。少し明るく、彩を二割抜いて寄せる
        c.copy(coat).multiplyScalar(0.9 * S.C[i]); { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; c.r += (l - c.r) * 0.12; c.g += (l - c.g) * 0.12; c.b += (l - c.b) * 0.12; }   // 六回目：舞台では向きで骨入りより明るくも暗くも見えた。設楽原の戦場では 1.1 倍・彩 30% 抜きだと砂色に褪せたので、戦場で茶に見えた三回目の値の近くへ戻す
        // 鹿毛の脚先は黒い。鼻づらは暗い肌。腹の下は少し淡い（体の色の絵の陰と合わせる）
        const legs = (1 - THREE.MathUtils.smoothstep(y, 0.24, 0.55)) * Math.min(1, pts);
        c.lerp(mane, legs * 0.85);
        c.lerp(skin, THREE.MathUtils.smoothstep(z, 1.62, 1.78) * 0.6 * (1 - THREE.MathUtils.smoothstep(y, 0.6, 0.8)));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mt[i] = kd === 2 ? mtlHair : mtlSkin;
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(S.IX);
    // 尾は今の形の馬が 0.35 だけ持ち上げて置くので、その分を戻しておく
    if (g === 'tail') geo.rotateX(-0.35);
    geo.computeVertexNormals();
    // 11/20 imac/look-cavalry 三回目：中ほどの馬（本物の形の固い部品）も、陰で平らな影絵にならないよう、毛色に上下の差を焼く（近くの馬の材質の回り込みの式と同じ考え。尾は回して置く前の向きで見る）
    { const na = geo.attributes.normal; for (let i = 0; i < n; i++) { if (S.K[i]) continue; const s = 0.76 + 0.34 * THREE.MathUtils.smoothstep(na.getY(i), -0.7, 0.9); col[i * 3] *= s; col[i * 3 + 1] *= s; col[i * 3 + 2] *= s; } }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
    geo.setAttribute('mtl', new THREE.BufferAttribute(mt, 1));
    const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // 11/20 imac/look-cavalry 四回目：30m より先は部品を組んだ馬（細い棒の脚・筒の首）で、境で本物の形へ替わる時に体つきが跳んだ（K153）。
    //   遠くも同じ本物の形を、頂点を升目でまとめて間引いた版で描く（毛色・脚先の黒・陰の焼き込みはそのまま受け継ぐ）。
    //   拵えごとに一度作って共有し、兵ごとには何も作らない。?oldfar で前の部品を組んだ馬に戻して比べる
    let thin = OLD_FAR ? null : thinGeo(geo, g);
    if (thin && g === 'body') {
      const parts = []; horseFarTackParts(parts, st);
      for (const p of parts) {
        if (!p.index) { const m = p.attributes.position.count, ii = new Uint32Array(m); for (let i = 0; i < m; i++) ii[i] = i; p.setIndex(new THREE.BufferAttribute(ii, 1)); }
        if (!p.attributes.normal) p.computeVertexNormals();
        for (const nm of Object.keys(p.attributes)) if (!['position', 'normal', 'color', 'col2', 'mtl', 'uv'].includes(nm)) p.deleteAttribute(nm);
      }
      thin = mergeGeometries([thin, ...parts]) || thin;
    }
    if (g === 'body') {
      // 和鞍・胸繋・尻繋（本物の馬と同じ形）を胴に混ぜる
      const T = tackGeometry(st), add = [geo];
      const stir = [];
      for (const sd of [1, -1]) {
        for (const [g, color] of stirrupParts()) stir.push(colGeo(tf(g.clone(), sd * 0.3, 0.76, 0.1), color));
        stir.push(colGeo(strap([[sd * 0.19, 1.3, 0.03], [sd * 0.3, 0.96, 0.15]], 0.012), st.tack));
      }
      for (const [k, arr] of Object.entries({ ...T, stir: [mergeG(stir)] })) arr.forEach((tg, j) => {
        if (!tg) return;
        const t = tg.clone();
        for (const nm of Object.keys(t.attributes)) if (!['position', 'normal', 'color'].includes(nm)) t.deleteAttribute(nm);
        if (!t.attributes.normal) t.computeVertexNormals();
        // 在来馬の形に組み直した胴と同じく、馬具も骨ごとに組み直す
        const fx = HR.tackFix && HR.tackFix[k === 'chest' ? CHEST_B : k === 'hip' ? HIP_B : SEAT_B];
        if (fx) t.applyMatrix4(fx);
        t.scale(1 / K, 1 / K, 1 / K);
        const m = t.attributes.position.count;
        if (!t.attributes.color) { const cc = new Float32Array(m * 3).fill(0.3); t.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
        t.setAttribute('col2', new THREE.BufferAttribute(t.attributes.color.array.slice(), 3));
        const kind = j === 0 && k !== 'seat' ? MK.lac : j === 0 ? MK.lac : MK.cloth;
        t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(kind + MK.cloth * 8 + 0.2), 1));
        const tu = new Float32Array(m * 2); for (let i = 0; i < m; i++) { tu[i * 2] = PLAIN_UV[0]; tu[i * 2 + 1] = PLAIN_UV[1]; }
        t.setAttribute('uv', new THREE.BufferAttribute(tu, 2));
        const nx = t.index ? t : (() => { const q = t; const ii = new Uint32Array(m); for (let i = 0; i < m; i++) ii[i] = i; q.setIndex(new THREE.BufferAttribute(ii, 1)); return q; })();
        add.push(nx);
      });
      geo = mergeGeometries(add) || geo;
    }
    if (g === 'neck' && (PX.bridle || HR.bridle)) {
      const t = (PX.bridle || HR.bridle).clone();
      t.translate(-pv.x, -pv.y, -pv.z); t.scale(1 / K, 1 / K, 1 / K);
      const m = t.attributes.position.count, col = new Float32Array(m * 3), color = _lin(st.tack);
      for (let i = 0; i < m; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
      t.setAttribute('color', new THREE.BufferAttribute(col, 3));
      t.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
      t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(MK.cloth + MK.cloth * 8), 1));
      const uv = t.attributes.uv;
      for (let i = 0; i < m; i++) uv.setXY(i, PLAIN_UV[0], PLAIN_UV[1]);
      const ix = new Uint32Array(m); for (let i = 0; i < m; i++) ix[i] = i;
      t.setIndex(new THREE.BufferAttribute(ix, 1));
      // 11/20 imac/look-cavalry 五回目：遠くの馬に面懸が無く、赤備えの朱の面懸が 30m の境で急に現れた。同じ面懸を升目で間引いて遠くの首にも混ぜる
      if (thin) { const tb = thinGeo(t, 'bridle'); if (tb.index.count) { thin.computeVertexNormals(); thin = mergeGeometries([thin, tb]) || thin; } }
      geo = mergeGeometries([geo, t]) || geo;
    }
    geo.computeBoundingSphere();
    out[g] = geo;
    if (thin) { thin.computeBoundingSphere(); out[g + 'Far'] = thin; }
  }
  PX.styles.set(key, out);
  return out;
}
const OLD_FAR = typeof location !== 'undefined' && /[?&]oldfar\b/.test(location.search);
// 頂点を升目（cell）ごとに一つへまとめ、潰れた三角を捨てる。毛と体は混ぜない。脚は細いので横の升目を細かく
// 11/20 五回目：尾は升目が粗いと房がまとまって中ほどより細く見えたので細かく。面懸は太さ 1〜2cm の紐なので、紐が消えない細かさで
const THIN_CELL = { body: [0.1, 0.1, 0.12], neck: [0.075, 0.075, 0.075], tail: [0.034, 0.08, 0.034], bridle: [0.028, 0.06, 0.028] };
function thinGeo(geo, g) {
  // 六回目：脚の上（太い前腕・腿）は粗い升目で足りる。前の部品の馬と同じ三角の数に収める
  const cell = THIN_CELL[g] || (g[0] === 'u' ? [0.055, 0.11, 0.055] : [0.034, 0.1, 0.034]);
  const pos = geo.attributes.position, col = geo.attributes.color, mt = geo.attributes.mtl, n = pos.count, ix = geo.index.array;
  const id = new Map(), map = new Int32Array(n), acc = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(pos.getX(i) / cell[0]) + ',' + Math.floor(pos.getY(i) / cell[1]) + ',' + Math.floor(pos.getZ(i) / cell[2]) + ',' + Math.floor(mt.getX(i));
    let j = id.get(k);
    if (j === undefined) { j = acc.length; id.set(k, j); acc.push([0, 0, 0, 0, 0, 0, 0, mt.getX(i)]); }
    const a = acc[j]; a[0] += pos.getX(i); a[1] += pos.getY(i); a[2] += pos.getZ(i); a[3] += col.getX(i); a[4] += col.getY(i); a[5] += col.getZ(i); a[6]++;
    map[i] = j;
  }
  const m = acc.length, P = new Float32Array(m * 3), C = new Float32Array(m * 3), M = new Float32Array(m), U = new Float32Array(m * 2), IX = [];
  for (let j = 0; j < m; j++) { const a = acc[j], s = 1 / a[6]; P[j * 3] = a[0] * s; P[j * 3 + 1] = a[1] * s; P[j * 3 + 2] = a[2] * s; C[j * 3] = a[3] * s; C[j * 3 + 1] = a[4] * s; C[j * 3 + 2] = a[5] * s; M[j] = a[7]; U[j * 2] = PLAIN_UV[0]; U[j * 2 + 1] = PLAIN_UV[1]; }
  const seen = new Set();
  for (let i = 0; i < ix.length; i += 3) {
    const a = map[ix[i]], b = map[ix[i + 1]], c = map[ix[i + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(','); if (seen.has(k)) continue; seen.add(k);
    IX.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setIndex(IX); out.computeVertexNormals();
  out.setAttribute('color', new THREE.BufferAttribute(C, 3)); out.setAttribute('col2', new THREE.BufferAttribute(C.slice(), 3));
  out.setAttribute('mtl', new THREE.BufferAttribute(M, 1)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}
function applyProxy(h) {
  const H = h?.userData?.horse; if (!H || h.userData.px) return;
  h.userData.px = true;
  const P = proxyGeos(h.userData.style || {}), PV = HR.proxy.piv, K = PX_HORSE_K;
  const meshOf = (g) => g.isMesh ? g : g.children.find((o) => o.isMesh);
  const swap = (mesh, hi, off, far) => {
    if (!mesh || !hi) return;
    const L = mesh.userData.lod, lo = L ? L[1] : mesh.geometry;
    // 測る時だけ（window.__farCompare）：前の部品の馬の形も持たせ、同じコマで遠くの形を入れ替えて三角を比べられるようにする（ふだんは何も作らない）
    if (far && typeof window !== 'undefined' && window.__farCompare) mesh.userData.farOld = proxyLo(lo, off);
    lodSwap(mesh, hi, far || proxyLo(lo, off), 30);
  };
  // 胴（支点は動かさない）
  swap(H.body, P.body, _pxOff.set(0, 0, 0), P.bodyFar);
  // 首と頭
  {
    const np = PV.neck.clone().multiplyScalar(1 / K), off = H.neck.position.clone().sub(np);
    H.neck.position.copy(np); swap(meshOf(H.neck), P.neck, off, P.neckFar);
    for (const e of H.ears || []) e.visible = false;
    // 銜の場所（首の座標）：上唇の少し奥
    H.bitN = new THREE.Vector3(0.05 / K, 0, 0).add(HR.proxy.bitN);
  }
  // 尾
  { const tp = PV.tail.clone().multiplyScalar(1 / K), off = H.tail.position.clone().sub(tp); H.tail.position.copy(tp); swap(meshOf(H.tail), P.tail, off, P.tailFar); }
  // 脚
  for (let i = 0; i < 4; i++) {
    const Lg = H.legs[i], Kg = H.lowers[i];
    const up = PV['u' + i].clone().multiplyScalar(1 / K), lw = PV['l' + i].clone().multiplyScalar(1 / K);
    const oldL = Lg.position.clone(), oldKA = oldL.clone().add(Kg.position);
    Lg.position.copy(up); Kg.position.copy(lw.clone().sub(up));
    swap(meshOf(Lg), P['u' + i], oldL.clone().sub(up), P['u' + i + 'Far']);
    swap(meshOf(Kg), P['l' + i], oldKA.sub(lw), P['l' + i + 'Far']);
  }
}
// 今の形の馬に、骨の入った馬を付ける・外す
function attachReal(h, u = null) {
  const H = h.userData.horse;
  if (!H.real) H.real = HR.pool.pop() || makeRealHorse();
  const R = H.real;
  dressHorse(R, h.userData.style || {});
  if (R.holder.parent !== h) { h.add(R.holder); h.add(R.extra); }
  R.on = true; R.holder.visible = R.extra.visible = true;
  H.pose.visible = false;
  // 付けたコマのうちに姿勢を合わせる（立ち姿のまま一コマ出ないように）
  R.yaw = undefined; R.prev = H.speed || 0; R.oneK = H.dead ? 'death' : null; R.oneT = H.dead ? H.deadT : 0; R.flinch = 0;
  driveHorse(h, 0, H.speed || 0);
  // 11/20 imac/look-cavalry 七回目：骨入りの馬は使い回す（HR.pool）。鐙・力革・手綱の置き場は前の持ち主の最後の形（倒れた馬なら地面の高さ）のまま残り、
  //   付けた兵が「画面の外」の扱いの間は置き直されない（humans_runtime.js は画面の外の馬の馬具を飛ばす）ので、立っている馬の足もとに鐙が落ち、手綱が地面を這って写った。
  //   付けたコマのうちに一度、今の馬と乗り手に合わせて置く
  placeHorseExtras(h, u);
}
function detachReal(h) {
  const H = h.userData.horse, R = H.real;
  if (!R) return;
  h.remove(R.holder); h.remove(R.extra);
  R.on = false;
  H.pose.visible = true;
  H.real = null;
  // 待つ馬は骨の絵（boneTexture・一頭に四枚）を GPU から返す。また付ける時に three が作り直す（設楽原で待つ馬の分 30 枚ほど残った。10/31）
  for (const r of [R.holder, R.extra]) r.traverse((o) => { if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) o.skeleton.dispose(); });
  HR.pool.push(R);
}
// 毎コマ（updateHumans から）：近い馬を選んで、骨の入った馬に入れ替える
const horsesOn = new Set();
const horseCandidates = [];
const horseWanted = new Map();
// 11/17 n-atsumi（K365 携帯の重さ・天王寺岡山で骨入りの描く数 121＝騎馬の将の馬が 60m 内で先に骨入りになり 28 頭まで）：
//   携帯の上限は 16 頭で止める（すぐそばの 28m 内でも足さない）。?oldhorse で前と比べる
const OLD_HORSE = typeof location !== 'undefined' && /[?&]oldhorse\b/.test(location.search);
const HORSE_TIGHT = OLD_HORSE ? { near: 36, far: 40, max: 16, must: 28, mustMax: 28 } : { near: 36, far: 40, max: 16, must: 28, mustMax: 16 };
let madeHorses = 0;
// 戦に馬がいるか。def.noHorse は「自分と軍勢は徒歩」の意味で、馬上の将・飾りの馬は置かれる。
// それを馬の描き方まで止めていたので、小川・手取川・田野では馬がつるつるの作り物（橙・灰色）に見えた（11/6 共通 馬・乗り手）
function horsesInBattle(rt) {
  if (!rt.def?.noHorse || rt.horsesSeen) return true;
  const A = rt.army;
  if (HORSE_HOOK.made.length || (A && ((A.looseHorses && A.looseHorses.length) || (A.fallenHorses && A.fallenHorses.length) || A.units.some((u) => u.horse)))) rt.horsesSeen = true;
  return !!rt.horsesSeen;
}
let seenCheckAt = 0;
function updateHorses(rt) {
  madeHorses = 0;
  // 徒歩の戦（noHorse）は、馬が現れたかを一秒に一度だけ調べる
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const hasH = !rt.def?.noHorse || rt.horsesSeen || (now - seenCheckAt > 1000 && (seenCheckAt = now, horsesInBattle(rt)));
  const on = HORSE.on && hasH && !(typeof location !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search)));
  if (on && !hrLoading && !rt.horseLoadPending) loadHorse();
  const want = horseWanted; want.clear();
  if (on && HORSE.ready) {
    const cam = rt.camera, cx = cam.position.x, cz = cam.position.z;
    // 馬の見た目は画質に関わらず写実。だが何頭を骨の入った馬にするかは、人と同じく画質なり（10/2 測って直す：
    //   姉川の騎馬で、携帯でも 40m の内の十頭あまりが一頭 2〜9万面・20〜37 回の描きのまま並び、一コマの三分の一を食っていた）
    // iPhone（MEM_TIGHT）は骨の入った馬を十六頭・32m の内でも二十八頭まで（設楽原の武田の騎馬の突撃で六十頭まで本物の馬になり、WebContent が落ちた 10/30）。その先は今の形の馬（写実の形）で描く
    const HQ = MEM_TIGHT ? HORSE_TIGHT : HORSE_Q.high;
    const cand = horseCandidates; cand.length = 0;
    let pxMade = 0;
    // 同じコマに毛色別の形をまとめて作らない。本人を先に、残りは一頭ずつ次のコマへ。
    const P = rt.player;
    if (P && P.horse && HR.proxy && !P.horse.userData.px) { applyProxy(P.horse); pxMade++; }
    // 兵でない馬（使番・戦ごとの飾りの馬）も、作られた順に本物の馬の形へ
    while (HR.proxy && HORSE_HOOK.made.length && pxMade < 1) { const h = HORSE_HOOK.made.pop(); if (!h.userData.px) { applyProxy(h); pxMade++; } }
    const add = (h, u, x, z, pri) => {
      if (!h || !h.userData.horse || h.visible === false) return;
      const d = Math.hypot(x - cx, z - cz), H = h.userData.horse;
      const lim = H.real ? HQ.far : HQ.near;
      if (d < lim || pri < 0) {
        let entry = h.userData.horseCandidate;
        if (!entry) entry = h.userData.horseCandidate = { h, u: null, d: 0, dist: 0 };
        entry.u = u; entry.d = pri === -2 ? -1e9 : pri < 0 ? -1 + d * 0.001 : d * pri; entry.dist = d; cand.push(entry);
      }
    };
    for (const u of rt.army.units) {
      if (u.gone || !u.mounted || !u.horse || (!u.alive && u.deadT > 30)) continue;
      if (HR.proxy && !u.horse.userData.px && pxMade < 1) { applyProxy(u.horse); pxMade++; }
      const named = u.look && (u.look.officer || typeof u.look.face === 'string' && u.look.face.startsWith('g:') || u.type === 'busho');
      // 名のある武将の馬は本人の馬と同じ：60m までは必ず骨の入った馬に
      // 11/8 critic60 田野 21：60m より先の将の馬が木の作りの脚・板の鞍のまま見えた。見通しの利く 90m まで骨の入った馬に
      const near60 = named && Math.hypot(u.pos.x - cx, u.pos.z - cz) < (MEM_TIGHT ? (OLD_HORSE ? 60 : 40) : 90);   // 11/17 携帯は 40m（名のある将の細かい姿と同じ）   // 低（携帯）は 20m まで
      add(u.horse, u, u.pos.x, u.pos.z, u.isPlayer ? -2 : near60 ? -1 : named ? 0.6 : 1);
    }
    if (P && P.horse && !P.mounted && P.horse.parent) add(P.horse, null, P.horse.position.x, P.horse.position.z, -2);
    // 降馬した後も、近くで倒れる途中の馬は同じ枠で描く。
    for (const o of rt.army.fallenHorses || []) if (o.h?.parent && o.t < 4) add(o.h, null, o.h.position.x, o.h.position.z, 1);
    // 乗り手を失って駆け回る馬
    // 主のいない馬は兵の馬より先に本物の馬へ（突っ立つ木のおもちゃの脚に見えた。critic60 小田原 23・姉川 27）
    for (const o of rt.army.looseHorses || []) if (o.h && o.h.parent) add(o.h, null, o.h.position.x, o.h.position.z, 0.7);
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length && want.size < HQ.max; i++) want.set(cand[i].h, cand[i].u);
    if (HQ.must) for (let i = 0; i < cand.length && want.size < HQ.mustMax; i++) { const c = cand[i]; if (!want.has(c.h) && c.dist < HQ.must) want.set(c.h, c.u); }
  }
  for (const h of horsesOn) if (!want.has(h)) { detachReal(h); horsesOn.delete(h); }
  for (const h of want.keys()) {
    if (horsesOn.has(h)) continue;
    if (madeHorses >= 2 && !h.userData.horse.real) continue;   // 一コマに作るのは二頭まで（一コマが重くならないよう）
    if (!HR.pool.length) madeHorses++;
    attachReal(h, want.get(h)); horsesOn.add(h);
  }
  return want;
}
function horseCount() { return horsesOn.size; }
// 見本の画面（開発用）から：今の形の馬に骨の入った馬を付ける・鐙と手綱を置く
function showHorse(h) { if (!HORSE.ready || !h.userData.horse) return false; attachReal(h); horsesOn.add(h); return true; }
// 見本の画面（開発用）から：今の形の馬を、切り分けた本物の馬の形にする
function proxyHorse(h) { if (HR && HR.proxy) applyProxy(h); }
function horseExtras(h, u) { if (h.userData.horse && h.userData.horse.real) placeHorseExtras(h, u); }


// 戦を出る時、毛色・馬具ごとの遠めの馬の形（HR.proxy.styles）を GPU から返して空にする（11/19 k365-cloud-43：違う戦を続けると
//   戦ごとに新しい毛色・馬具の組の形が 25〜70 個ずつ残り、18戦で GPU の形が 79→412 個になった）。要る時は proxyGeos が作り直す。
function releaseHorseStyles() {
  const PX = HR && HR.proxy; if (!PX || !PX.styles) return;
  for (const out of PX.styles.values()) for (const k in out) { const geo = out[k]; if (geo && geo.isBufferGeometry) geo.dispose(); }
  PX.styles.clear();
  if (PX.lo) { for (const geo of PX.lo.values()) if (geo && geo.isBufferGeometry) geo.dispose(); PX.lo.clear(); }   // 形ごとの遠い形（proxyLo）も同じ
}
export { releaseHorseStyles, loadHorse, primeHorses, detachReal, horsesOn, horseCandidates, horseWanted, updateHorses, horseCount, showHorse, proxyHorse, horseExtras };
