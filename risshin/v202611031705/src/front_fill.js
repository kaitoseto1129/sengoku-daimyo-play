// 奥の乱戦の補い（11/1 c_mob「敵の大軍・乱戦が薄い」）：本人の持ち場から敵の方を見た時、左右の奥で軽い大軍どうしが刃を交える。
//   軽い作り（world.addClash）だけ。本物の兵・兵力の数・当たり・bot には入れない（本物に替えない：team を渡さない）。
//   noWake で、本人が 140m の内へ寄るまで形を作らない（携帯の記憶を増やさない）。毎コマ new しない。
//   置く所は平らで歩ける地面だけ（水・崖・建物の上には置かない）。置けない時は何もしない。
//   戦の定義で def.noFrontFill を書けば置かない。
import { MEM_TIGHT } from './settings.js';
import { SEG } from './world_common.js';
import { FLAT } from './flat_rule.js';
import { cameraWallBlocked } from './battle_sight.js';
import { forestAt } from './terrain_tags.js';
import * as THREE from 'three';
import { scenario } from './state.js';

// 3m より高い置物（家・陣小屋・櫓。当たりの solids を持たない物）の床の広さ。始めに一度だけ場面をなめて 8m の升に分ける（毎コマ作らない）。
//   稲生：本陣の陣小屋の裏の乱戦を「見えている」と数え、画面は小屋の壁と屋根だった
const OCC = new WeakMap();
function occluders(rt) {
  let G = OCC.get(rt);
  if (G) return G;
  G = new Map(); OCC.set(rt, G);
  const sc = rt.scene, bb = new THREE.Box3();
  if (!sc) return G;
  sc.updateMatrixWorld(true);
  sc.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || o.visible === false) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
    // 幟・竿（細い）と地面・遠景の大きな板（30m より広い）は数えない。薄い壁は 2.5m の厚みに広げる（視線を 2.5m ごとに見るので抜けないように）
    if (bb.max.y - bb.min.y < 3 || sx + sz < 3 || sx > 30 || sz > 30 || !Number.isFinite(sx)) return;
    const px = Math.max(0, 1.25 - sx / 2), pz = Math.max(0, 1.25 - sz / 2);
    const b = { x0: bb.min.x - px, x1: bb.max.x + px, z0: bb.min.z - pz, z1: bb.max.z + pz, top: bb.max.y };
    for (let i = Math.floor(b.x0 / 8); i <= Math.floor(b.x1 / 8); i++) for (let j = Math.floor(b.z0 / 8); j <= Math.floor(b.z1 / 8); j++) {
      const k = i * 65536 + j; let l = G.get(k);
      if (!l) G.set(k, l = []);
      l.push(b);
    }
  });
  return G;
}

// 本物の斬り合い（kaito 11/3 AA）：向き f の先で、味方と敵の槍足軽が向き合って斬り合う。本物の兵が多い時は false（軽い作りへ）
function realClash(rt, put, ww, f, amon, bmon) {
  const A = rt.army, def = rt.def;
  if (!A || !A.queueSpawn) return false;
  let alive = 0;
  for (const g of A.groups) for (const u of g.units) if (u.alive) alive++;
  const per = MEM_TIGHT ? 7 : 11;
  if (alive + A.pendingSpawn + per * 2 > (MEM_TIGHT ? 150 : 200)) return false;
  const fac = (team) => A.groups.find((g) => g.team === team && !g.isPlayerSquad && g.faction)?.faction;
  const fx = Math.sin(f), fz = Math.cos(f);
  for (const team of [0, 1]) {
    const s = team ? 1 : -1, mon = team ? bmon : amon;
    const faction = (team ? def.sides?.b?.faction : def.sides?.a?.faction) || fac(team) || scenario().faction || 'oda';
    const g = A.addGroup({ team, faction, name: team ? '敵の乱戦' : '味方の乱戦', order: 'attack', formation: 'line', facing: team ? f + Math.PI : f,
      anchor: { x: put.x + fx * 2.5 * s, z: put.z + fz * 2.5 * s }, width: Math.min(ww, per * 1.6), aggro: 14, seekRange: 40, speed: 3.2 });
    A.queueSpawn(g, [{ type: 'ashigaru', n: per, o: mon ? { flag: mon } : {} }]);
  }
  return true;
}

const KEYS = new Set([
  'inou', 'inabayama', 'kanegasaki', 'nodafukushima', 'shiga', 'hieizan', 'tonezaka', 'echizen', 'kinome', 'kizugawa', 'tottori', 'takato',
  'okawachi', 'echizen_ikko', 'iwamura', 'tennoji', 'miki', 'tano',
  't01_yamazaki', 't02_shizugatake', 't03_komaki', 't04_negoro', 't05_ichinomiya', 't06_hetsugi', 't07_ganjaku', 't08_nejirozaka', 't09_yamanaka', 't10_oshi', 't11_hachioji', 't12_odawara',
]);
// 見ている先の乱戦（下の aheadFill）だけを足す戦（11/2 c_mob_oda「敵の大軍・乱戦が薄い」）：小谷・雑賀・伊賀は戦の台本が自分の大軍を置くので、
//   始めの左右・奥の補いは置かず、25 秒たっても見ている先に刃を交える所が無い時だけ一つずつ足す（小谷は記憶が少ないので一度だけ）
const AHEAD_ONLY = new Set(['odani', 'saika', 'iga']);
// 11/2 c_front「手前が空く・敵が遠く乱戦が写らない」：徳川編（k01〜k16）は始めの左右・正面・奥の補いも置く。
//   上の名に無い戦（桶狭間・姉川・設楽原など、戦の台本が大軍を置く戦）も、見ている先に刃を交える所が無い時だけ足す（AHEAD_ONLY と同じ）。
//   寺の中の夜討ち（本能寺）は野の乱戦を置く所が無いので外す
const FULL = (k) => KEYS.has(k) || /^k\d\d_/.test(k);
const NEVER = new Set(['honnoji']);

// lax：0 きびしく・1 坂と高低を少しゆるく（山の戦・城攻めで置けない時の二の手）・2 さらに・
//   3 山の斜面にも置く（比叡山・稲葉山：平らな所が無い。歩けない山肌・木の幹は気にしない。水と建物の上には置かない）
function placeable(W, solids, x, z, f, w, lax = 0) {
  const half = W.half || 200, cf = Math.cos(f), sf = Math.sin(f);
  const slope = [0.42, 0.6, 0.75, 1.15, 1.5][lax], rise = [9, 15, 24, 45, 60][lax], pad = lax > 3 ? 0.5 : 3;
  let lo = Infinity, hi = -Infinity;
  for (let i = -3; i <= 3; i++) for (const d of [-10, 0, 10]) {
    const lx = (i / 3) * w / 2;
    const px = x + lx * cf + d * sf, pz = z - lx * sf + d * cf;
    if (Math.abs(px) > half - 15 || Math.abs(pz) > half - 15) return false;
    if (lax < 3 && W.walkable && !W.walkable(px, pz)) return false;
    if (W.waterW) {
      const ix = Math.round((px + W.half) / W.step), iz = Math.round((pz + W.half) / W.step);
      if (W.waterW[iz * (SEG + 1) + ix] > 0.2) return false;
    }
    if (W.slopeTan && W.slopeTan(px, pz) > slope) return false;
    const h = W.heightAt(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    for (const s of solids) if ((lax < 3 || (s.x1 - s.x0) * (s.z1 - s.z0) > 3) && px > s.x0 - pad && px < s.x1 + pad && pz > s.z0 - pad && pz < s.z1 + pad) return false;
  }
  return hi - lo < rise;
}

// 本人の後ろのカメラ（5m 後ろ・3m 上）から、その所の人の胸が見えるか（坂の峰・山の陰に隠れないか）
function seen(W, P, fx, fz, x, z) {
  const cx = P.x - fx * 5, cz = P.z - fz * 5, cy = W.heightAt(P.x, P.z) + 3.2, ty = W.heightAt(x, z) + 1.4;
  for (let i = 1; i < 12; i++) {
    const t = i / 12, px = cx + (x - cx) * t, pz = cz + (z - cz) * t;
    if (W.heightAt(px, pz) > cy + (ty - cy) * t - 0.2) return false;
  }
  // 林の帯の奥も見えない（稲生：本陣の裏の杉の帯の奥に置いた乱戦を「見えている」と数え、画面は杉の幹ばかりだった）。
  //   視線が込んだ林（forestAt）を 5m より長く通れば陰。乱戦の足元の 3m は数えない
  const d = Math.hypot(x - cx, z - cz), n = Math.ceil(d / 3);
  let cover = 0;
  for (let i = 1; i < n; i++) {
    if ((n - i) * d / n < 3) break;
    if ((cover += forestAt(W, cx + (x - cx) * i / n, cz + (z - cz) * i / n, 5) * d / n) > 5) return false;
  }
  return true;
}

// seen に加えて、家・塀・櫓の陰でないか（志賀：町の家の陰の乱戦を「見えている」と数え、画面に乱戦が無かった）。
//   幅 w の乱戦の真ん中と左右の三か所のうち二か所が見えれば見える（志賀：家の間から端だけ覗く乱戦は写って見えなかった）。
//   急な上り坂の上（見上げ 17° より上）は画面の上の縁の外（金ヶ崎の登城道：坂の上の乱戦が写らなかった）
function seenClear(rt, P, fx, fz, x, z, w = 0, need = 2) {
  const W = rt.world, cx = P.x - fx * 5, cz = P.z - fz * 5, a = { x: cx, z: cz }, ay = W.heightAt(P.x, P.z) + 3.2;
  //   カメラが坂を見上げている時は、その上向きの分だけ上まで写る（金ヶ崎の城山：見上げた画面の坂に置けなかった）
  const q = rt.camera?.quaternion, up = q ? Math.max(0.3, Math.min(0.9, Math.tan(Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z)))) + 0.3))) : 0.3;
  if (W.heightAt(x, z) + 1.6 - ay > up * Math.hypot(x - cx, z - cz)) return false;
  const rx = fz, rz = -fx;
  let vis = 0;
  for (const s of [0, -w / 3, w / 3]) {
    const px = x + rx * s, pz = z + rz * s;
    if (!seen(W, P, fx, fz, px, pz)) continue;
    let hid = false;
    try { hid = cameraWallBlocked(rt, a, { x: px, z: pz }, ay, W.heightAt(px, pz) + 1.6, true); } catch (e) { hid = false; }
    // 家の床の広さ（x0〜x1・z0〜z1）だけを持つ物は、視線の通り道の上にあれば陰（3m 以上の物）
    const occ = occluders(rt), ty = W.heightAt(px, pz) + 1.6;
    const ns = Math.max(16, Math.ceil(Math.hypot(px - cx, pz - cz) / 2.5));
    if (!hid) for (let i = 1; i < ns && !hid; i++) {
      const t = i / ns, qx = cx + (px - cx) * t, qz = cz + (pz - cz) * t, qy = ay + (ty - ay) * t;
      for (const o of rt.army?.solids || []) if (o.x0 != null && (o.x1 - o.x0) * (o.z1 - o.z0) > 9 && qx > o.x0 && qx < o.x1 && qz > o.z0 && qz < o.z1) { hid = true; break; }
      if (!hid) for (const o of occ.get(Math.floor(qx / 8) * 65536 + Math.floor(qz / 8)) || []) if (o.top > qy && qx > o.x0 && qx < o.x1 && qz > o.z0 && qz < o.z1) { hid = true; break; }
    }
    if (!hid && ++vis >= need) return true;
  }
  return false;
}

export function frontFill(rt) {
  const def = rt.def, W = rt.world;
  if (!def || !W || !W.addClash || def.noFrontFill || def.dojo || def.mapCastle || !def.key || NEVER.has(def.key)) return [];
  const aheadOnly = AHEAD_ONLY.has(def.key) || !FULL(def.key);
  const P0 = rt.player?.u?.pos || def.spawn;
  if (!P0) return [];
  // 持ち場が地図の外に書かれた戦（山中城：z=292）は、地図の内へ寄せた所から測る
  const lim = (W.half || 200) - 20, P = { x: Math.max(-lim, Math.min(lim, P0.x)), z: Math.max(-lim, Math.min(lim, P0.z)) };
  // 敵の向き：生きている敵の組の真ん中（人数で重み）。居なければ本人の向き
  let ex = 0, ez = 0, n = 0;
  const real = [], foeReal = [];
  for (const g of rt.army?.groups || []) {
    for (const u of g.units) if (u.alive) { real.push(u.pos); if (g.team === 1) { foeReal.push(u.pos); ex += u.pos.x; ez += u.pos.z; n++; } }
  }
  let a, d0 = 90;
  if (n) { ex /= n; ez /= n; a = Math.atan2(ex - P.x, ez - P.z); d0 = Math.hypot(ex - P.x, ez - P.z); }
  else a = rt.player?.u?.heading ?? def.spawn?.heading ?? 0;
  // 敵の真ん中が、始めのカメラの向き（本人の向き）から大きく外れる時は、カメラの向きの奥を満たす（山崎：敵が横にいて正面の奥が空いた）
  const h0 = rt.player?.u?.heading ?? def.spawn?.heading;
  if (n && Number.isFinite(h0) && Math.abs(Math.atan2(Math.sin(a - h0), Math.cos(a - h0))) > 0.6) { a = h0; d0 = 90; }
  const fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
  const solids = rt.army?.solids || [];
  const amon = def.sides?.a?.mon, bmon = def.sides?.b?.mon;
  // 霧の見通し（world_update.js と同じ式。霧は fogF でほぼ白くなる。軽い大軍は霧の手前で立体の人に描かれる）。
  //   置くのは霧の手前だけ（近い乱戦は fogF の 0.8 まで・奥の列は 0.6〜0.9）。それより先は白くて見えない
  const fogF = Math.max(80, Math.min(FLAT.on ? 110 : 320, def.battleViewDistance ?? 80)) * 1.15;
  // 左右の乱戦は 46m より手前（カメラが低いので、56m より先は地平の細い帯に見えて「敵が遠い」と言われた。根来）
  const D0 = Math.max(40, Math.min(46, fogF * 0.7, d0 * 0.85));
  const out = [];
  const w0 = MEM_TIGHT ? 40 : 52;
  let w = w0;
  // 置いた乱戦の真ん中と幅（列・見ている先の乱戦が重ならないように）
  const spots = [];
  const clash = (put, ww, f = a) => {
    const seed = 4100 + out.length * 17 + (def.key.length * 31);
    spots.push({ x: put.x, z: put.z, w: ww });
    // 11/3 kaito AP10「本当はいない所に軍勢を置かない」：本物の敵の兵が 50m の内にいる所（台本の前線）だけを厚くする。
    //   林の向こう・道の脇など、敵のいない所には置かない
    if (!(rt.army?.units || []).some((u) => u.alive && u.team === 1 && !u.fleeing && Math.hypot(u.pos.x - put.x, u.pos.z - put.z) < 50)) return;
    // 近づける所の乱戦は描いただけにしない（kaito 11/3 AA）：本物の兵が両側から斬り合う。兵の数が多い時だけ軽い作りに戻す
    if (realClash(rt, put, ww, f, amon, bmon)) return;
    // 11/3 kaito AP9：本人から 60m の内に作り物の乱戦は置かない（本物で埋められない時は何も置かない）
    const P1 = rt.player?.u?.pos || P;
    if (Math.hypot(put.x - P1.x, put.z - P1.z) < 60) return;
    out.push(W.addClash({
      x: put.x, z: put.z, facing: f, w: ww, gap: 2.6, bw: 5.5, seed, noWake: true, noRout: true, killRate: 0.01, maxDrift: 2, corpses: MEM_TIGHT ? 12 : 30,
      A: { flag: amon, count: MEM_TIGHT ? 110 : 170, flagRate: 0.7 },
      B: { flag: bmon, count: MEM_TIGHT ? 130 : 200, flagRate: 0.7, bows: true },
      host: MEM_TIGHT ? false : undefined,
      play: (k, p, v) => rt.army.play(k, p, v * 0.5), smoke: (x, y, z, sx, sz) => rt.army.smoke(x, y, z, sx, sz),
    }));
  };
  for (const sd0 of aheadOnly ? [] : [1, -1]) {
    let put = null;
    // 一の手：平らな所。二の手：坂をゆるく・前線を狭く（山・谷・城の戦）。三の手：山の斜面。
    //   まずカメラに写る所（峰の陰でなく、正面から 37° の内）だけ、無ければ陰でも。
    //   片側が崖・建物で置けない時は、もう片側に二つ目を置く（金ヶ崎・志賀）
    find: for (const need of [1, 0]) {
      for (const sd of [sd0, -sd0]) {
        for (const [lax, ww] of [[0, w0], [1, w0], [1, 30], [3, 30]]) {
          for (const D of [D0, D0 + 10, D0 - 12, D0 + 18, D0 - 24, 40]) {
            if (D < 36 || D > fogF * 0.8) continue;
            for (const L of [30, 46, 62, 80, 18]) {
              if (need && L > D * 0.75) continue;
              const x = P.x + fx * D + rx * L * sd, z = P.z + fz * D + rz * L * sd;
              if (spots.some((c) => Math.hypot(c.x - x, c.z - z) < ww)) continue;
              // 敵の本物の兵の上には重ねない（乱戦の枠：横 ww・前後 12m）。味方の中は寄せて組み合う所に見えるのでよい（根来）
              if (foeReal.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < ww / 2 + 5 && Math.abs(dx * fx + dz * fz) < 12; })) continue;
              if (need && !seen(W, P, fx, fz, x, z)) continue;
              if (placeable(W, solids, x, z, a, ww, lax)) { put = { x, z }; w = ww; break find; }
            }
          }
        }
      }
    }
    if (put) clash(put, w);
  }
  // 正面の乱戦（11/2）：味方の本物の兵の中でもよい（味方が寄せて組み合う所に見える。敵の兵の上には置かない）。左右の乱戦の間・手前、正面 36〜54m に味方と敵がぶつかる所をもう一つ。カメラに写る所だけ。
  //   軽い乱戦は本人の 16m の外を描く（MID_NEAR）。カメラが低いので 56m より先は地平の細い帯に見え「敵が遠い」と言われた（根来・戸次川）
  //   11/2 c_front：敵の本物の兵が正面 30m に立つ戦（関ヶ原の宇喜多の旗本）は、どこも敵の上で手前が空いた。最後の手は敵の兵の上にも幅 30m の乱戦を置く（敵が味方と組み合う所に見える）
  mid: for (const [lax, ww, avoid] of aheadOnly ? [] : [[0, w0, 1], [1, w0, 1], [1, 30, 1], [3, 30, 1], [1, 30, 0], [3, 30, 0]]) {
    // 11/2 c_front：まず 28〜34m（本人の前 20〜60m の真ん中。36m より先から探すと坂・兵に当たり、徳川編で手前が空いた）
    for (const D of [30, 36, 28, 42, 48, 54]) {
      for (const L of [0, -14, 14, -26, 26]) {
        const x = P.x + fx * D + rx * L, z = P.z + fz * D + rz * L;
        if (spots.some((c) => { const dx = c.x - x, dz = c.z - z; return Math.abs(dx * rx + dz * rz) < (ww + c.w) / 2 + 2 && Math.abs(dx * fx + dz * fz) < 10; })) continue;
        if (avoid && foeReal.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < ww / 2 + 5 && Math.abs(dx * fx + dz * fz) < 12; })) continue;
        if (!seen(W, P, fx, fz, x, z) || !placeable(W, solids, x, z, a, ww, lax)) continue;
        clash({ x, z }, ww);
        break mid;
      }
    }
  }
  // 奥の敵の大軍：敵の向きの霧の手前（fogF の 0.6〜0.9。11/2 までは 130m より先に置いて霧で白く消えていた）に、軽い列を横に並べる。
  //   動かさない・本物に替えない・後詰めを付けない。携帯は列を減らす
  const far = [];
  if (!def.noFarFill && !aheadOnly) {
    const fw = 40, fc = MEM_TIGHT ? 110 : 210, want = MEM_TIGHT ? 4 : 6;
    // 敵の後ろから霧の境までに置く（霧に溶ける大軍）。
    //   奥が地図の外なら手前へ。山の戦は坂をさらにゆるく
    //   半分は始めに見える所（霧の手前）、残りは本人が 40〜70m 進んだ時に霧の手前に来る所（山崎：進むと手前の列は横・後ろへ外れた）
    const vmax = fogF * 0.9, vmin = fogF * 0.6, dm = Math.min(vmax, Math.max(vmin, d0 + 25)), wantA = Math.ceil(want / 2);
    // 一列を置ければ true（b：列の向きの角。味方の列は敵の真ん中へ向ける）
    const tryPut = (x, z, b, lax, need, foe, big) => {
      // 近い乱戦とは、横に並ぶ時だけ間を空ける（前後に 22m 離れていれば重ならない。高遠：乱戦の奥に列が置けなかった）
      //   本隊（big）は乱戦の敵の側のすぐ奥（12m より奥）なら置く
      const hitC = (c) => { const dx = x - c.x, dz = z - c.z, l = dx * fx + dz * fz; return Math.abs(dx * rx + dz * rz) < (fw + c.w) / 2 + 4 && (big ? l > -22 && l < 12 : Math.abs(l) < 22); };
      if (far.some((c) => Math.hypot(c.x - x, c.z - z) < fw + 4) || spots.some(hitC)) return false;
      // 本物の兵とは、列の枠（横 fw・奥 18m）に余白を足した所だけ避ける（志賀：丸く 30m 避けて町の奥に置けなかった）
      if (real.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < fw / 2 + 6 && Math.abs(dx * fx + dz * fz) < 16; })) return false;
      if (need && !seen(W, P, fx, fz, x, z)) return false;
      if (!placeable(W, solids, x, z, b, fw, lax)) return false;
      const g = W.addDistantArmy({ x, z, w: fw, d: big ? 24 : 18, count: big ? Math.round(fc * 1.4) : fc, facing: foe ? a + Math.PI : (Math.atan2(ex - x, ez - z) || a), kind: big || (far.length % 2) === 0 ? 'spear' : 'mixed',
        flag: foe ? bmon : amon, flagRate: 0.8, seed: (foe ? 5200 : 5300) + far.length * 13, host: false, near: false, team: foe ? 1 : 0, farFill: true });
      g.noWake = true; if (g.army) { g.army.noWake = true; if (big && g.army.U) g.army.U.uRealNear = { value: 20 }; }
      far.push({ x, z, g });
      return true;
    };
    const row = (upto, need, list) => {
      for (const [D, lax] of list) {
        // 敵より手前の列は、本人の歩く真ん中を空けて左右から。まず峰の陰でない所
        for (const L of D < d0 - 20 ? [-44, 44, -84, 84, 0, -124, 124] : [0, -42, 42, -84, 84, -124, 124]) {
          if (far.length >= upto) return;
          tryPut(P.x + fx * D + rx * L, P.z + fz * D + rz * L, a, lax, need, true);
        }
      }
    };
    const near = [[dm, 1], [vmax, 1], [dm - 14, 1], [dm, 2], [vmin, 2], [dm, 3], [vmin, 3]];
    // 正面の敵の本隊（11/2）：いちばん手前の乱戦のすぐ奥（敵の側）に、こちらを向く敵の厚い列。カメラに写る所だけ。霧の手前に置く（霧が 92m の戦が多い）。
    //   本人の 20m の外を描く（ふつうの軽い列は 44m の内を描かないので、近い本隊が消えた）
    //   左右の乱戦と奥の列だけでは、始めの画面の真ん中が空いて「敵の大軍が遠い・少ない」と見えた
    const cD = spots.reduce((m, c) => Math.min(m, (c.x - P.x) * fx + (c.z - P.z) * fz), Infinity);
    const dB = Number.isFinite(cD) ? Math.max(48, cD + 16) : 56, bodyN = MEM_TIGHT ? 1 : 2;
    let nb = 0;
    body: for (const D of [dB, dB + 6, dB - 4, dB + 12, dB + 20]) {
      if (D < 44 || D > fogF * 0.86) continue;
      for (const L of [0, -24, 24, -46, 46]) {
        if (nb >= bodyN) break body;
        for (const lax of [1, 3]) if (tryPut(P.x + fx * D + rx * L, P.z + fz * D + rz * L, a, lax, 1, true, true)) { nb++; break; }
      }
    }
    row(wantA + nb, 1, near);
    row(wantA + nb, 0, near);
    // 城山・山の戦（敵の奥が崖や城）：斜め前の麓に、山を囲む味方の大軍を置く（稲葉山・比叡山）
    if (far.length < 2 + nb) {
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
        if (far.length >= wantA + nb) break;
        const b = a + k * 0.32;
        for (const D of [fogF * 0.75, fogF * 0.6, fogF * 0.88, 48]) {
          const x = P.x + Math.sin(b) * D, z = P.z + Math.cos(b) * D;
          if (tryPut(x, z, b, 2, 0, false) || tryPut(x, z, b, 3, 0, false)) break;
        }
      }
    }
    // 進んだ先：始めは霧の奥（描かれない）、40〜70m 進むと霧の手前に来る
    row(want + nb, 0, [[fogF * 1.4, 1], [fogF * 1.2, 1], [fogF * 1.6, 1], [fogF * 1.4, 2], [fogF * 1.2, 3]]);
  }
  rt.frontFill = out;
  rt.farFill = far;
  // 見ている先の乱戦と敵の本隊（11/2）：始めに置いた物は、本人が 30〜50m 進むと 44m の内（本物の兵だけ描く所）に入って消え、向きを変えると画面の外へ外れる。
  //   2 秒ごとに、カメラの向きの 30〜64m（カメラが低いので、それより先は地平の帯に見える。根来・戸次川：霧ぎわの列だけでは敵が遠く見えた）に軽い乱戦・列も本物の敵（15 人より）も無ければ、その向きの 40〜58m 先に乱戦を一つと、そのすぐ奥の敵の厚い列を一つ置く。
  //   形を作るのはその時の一度だけ（毎コマ new しない）。三度まで（携帯は二度まで）。置いた所から 20m 動くか、向きを 40° 変えるまでは置かない
  if (rt.after && !def.noAheadFill) {
    let last = null, prevB = null, left = def.key === 'odani' ? 1 : MEM_TIGHT ? 2 : 3;
    const tick = () => {
      if (rt.ended || !rt.player?.u?.alive) return;
      // 向きはカメラの向き（野田福島：竹束を据える時は本人の向きとカメラが九十度ずれ、カメラの外に置いた）
      const q = rt.camera?.quaternion, cy = q ? Math.atan2(-2 * (q.x * q.z + q.w * q.y), -(1 - 2 * (q.x * q.x + q.y * q.y))) : NaN;
      const Q = rt.player.u.pos, b = Number.isFinite(cy) ? cy : rt.player.yaw ?? rt.player.u.heading, sb = Math.sin(b), cb = Math.cos(b);
      // 足す数を使い切った後は、まだ形を作っていない（遠くて眠っている）始めの乱戦を、見ている先へ移す（形も材質も増やさない。金ヶ崎：
      //   25 秒で東を向いた時、足した三つは後ろに外れ、見ている先に乱戦が無かった）
      let move = -1;
      // 11/3 AP9：作り物の乱戦を本人の前 20〜50m へ移さない（足す数を使い切ったら終わり）
      if (left <= 0) { rt.after(2, tick, true); return; }
      const inView = (c) => { const dx = c.x - Q.x, dz = c.z - Q.z, d = Math.hypot(dx, dz); return d > 30 && d < 64 && dx * sb + dz * cb > d * 0.8; };
      // 刃を交える所が見えているか（11/2 c_mob_oda）：戦の台本の乱戦も数える（峰の陰は数えない）。
      //   本物の敵が見えていても、味方とぶつかっていなければ乱戦は無い（稲生・志賀：敵の列が立っているだけで「乱戦が薄い」と言われた）
      //   家・塀の陰の乱戦と、両方で百五十人に満たない小さな組み合い（金ヶ崎の坂・志賀の町口：百人ほどの押し合いは家の間で列の行き来に見えた）は数えない
      //   11/2 c_front：58m より先の乱戦は低いカメラで地平の帯に見える（関ヶ原：55m 先の乱戦だけで手前が空いた）ので数えない
      const big = (c) => { const n = (k) => c.o?.[k]?.count ?? 999; return n('A') + n('B') >= 150; };
      const clashSeen = (W.clashes || []).some((c) => c.mesh?.visible !== false && !(c.A?.routed && c.B?.routed) && big(c) && (() => { const dx = c.x - Q.x, dz = c.z - Q.z, d = Math.hypot(dx, dz); return d > 14 && d < 52 && dx * sb + dz * cb > d * 0.85 && seenClear(rt, Q, sb, cb, c.x, c.z, c.o?.w || 30); })());
      const fv = [], av = [];
      for (const g of rt.army?.groups || []) for (const u of g.units) if (u.alive) { const dx = u.pos.x - Q.x, dz = u.pos.z - Q.z, d = Math.hypot(dx, dz); if (d > 20 && d < 56 && dx * sb + dz * cb > d * 0.8) (g.team === 1 ? fv : av).push(u.pos); }
      let melee = 0;
      if (fv.length >= 8) for (const p of fv) { if (av.some((q) => Math.abs(q.x - p.x) < 3 && Math.abs(q.z - p.z) < 3) && ++melee >= 8) break; }
      // 向きを変えている最中（2 秒で 17° より回った）は置かない（金ヶ崎：振り向く途中に三つとも使い、25 秒の向きの先には残らなかった）
      const turning = prevB != null && Math.abs(Math.atan2(Math.sin(b - prevB), Math.cos(b - prevB))) > 0.3;
      prevB = b;
      if (Number.isFinite(b) && !turning && !clashSeen && melee < 8 && (!last || Math.hypot(Q.x - last.x, Q.z - last.z) > 20 || Math.abs(Math.atan2(Math.sin(b - last.b), Math.cos(b - last.b))) > 0.7)
        && aheadFill(rt, Q, b, fogF, solids, spots, far, move < 0 ? clash : (put, ww, f) => {
          const C = out[move];
          C.o.x = C.x = put.x; C.o.z = C.z = put.z; C.o.facing = C.facing = f; C.o.w = ww;
          spots[move] = { x: put.x, z: put.z, w: ww };
        }, bmon, w0, move < 0)) { if (move < 0) left--; last = { x: Q.x, z: Q.z, b }; }
      rt.after(2, tick, true);
    };
    rt.after(4, tick, true);
  }
  return out;
}

// 向き b の先（Q から）に、乱戦を一つと、その敵の側の奥に敵の厚い列を一つ。置けたら true
function aheadFill(rt, Q, b, fogF, solids, spots, far, clash, bmon, w0, body = true) {
  const W = rt.world, fx = Math.sin(b), fz = Math.cos(b), rx = Math.cos(b), rz = -Math.sin(b);
  // 一の手は本物の兵を避ける。二の手は敵の兵だけ避ける（一宮：味方の大軍が前を進み、どこにも置けなかった。味方の中の乱戦は寄せに見える）
  const all = [], foe = [];
  for (const g of rt.army?.groups || []) for (const u of g.units) if (u.alive) { all.push(u.pos); if (g.team === 1) foe.push(u.pos); }
  const ahead = [];
  for (const u of foe) { const dx = u.x - Q.x, dz = u.z - Q.z, d = Math.hypot(dx, dz), l = dx * fx + dz * fz; if (d > 22 && d < 60 && l > d * 0.85) ahead.push(l); }
  ahead.sort((p, q) => p - q);
  const front = ahead.length >= 8 ? [Math.round(ahead[2] - 5), Math.round(ahead[2] - 9)].filter((D) => D >= 20) : [];
  // 三の手（金ヶ崎の登城道：狭い坂道が兵で詰む）：本物の兵の上にも幅 20〜30m の詰まった乱戦を置く（両軍が入り乱れる所に見える）。
  //   どの手も、まず乱戦の真ん中と両端が丸ごと見える所、無ければ三か所のうち二か所が見える所
  for (const [real, need] of [[all, 3], [foe, 3], [all, 2], [foe, 2], [[], 3], [[], 2]]) {
    const free = (x, z, ww) => !real.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < ww / 2 + 5 && Math.abs(dx * fx + dz * fz) < 12; })
      && !spots.some((c) => Math.hypot(c.x - x, c.z - z) < (ww + c.w) / 2 + 4)
      && !far.some((c) => { const dx = c.x - x, dz = c.z - z; return Math.abs(dx * rx + dz * rz) < (ww + 40) / 2 && Math.abs(dx * fx + dz * fz) < 14; });
    // 狭い谷・坂道で兵が詰む時は幅 20m の詰まった乱戦（金ヶ崎の登城道）
    // 四の手（金ヶ崎の城山の急な坂）：もっと急な坂・荷車のすぐ脇にも幅 20m の乱戦
    for (const [lax, ww] of real.length || !foe.length ? [[0, w0], [1, w0], [1, 30], [3, 30], [3, 20], [4, 20]] : [[3, 30], [3, 20], [4, 20]]) {
      // 正面が本物の敵の列で塞がる時は、画面の左右の端の内（±44m）や手前（34m）にも置く（稲生・野田福島）
      // 本人から 26〜44m（カメラから 30〜50m）を先に。52m より先は低いカメラで地平の細い帯に見えた（稲生：杉の際の 53m の乱戦が数人に見えた）
      // 正面に本物の敵の列が立つ時は、その列の前の縁に寄せて組み合わせる（稲生：列の奥に置いた乱戦は列に隠れ、敵が立っているだけに見えた）
      for (const D of [...front, ...(ww <= 20 ? [36, 30, 42, 24, 48, 20] : [38, 32, 44, 26, 50])]) {
        if (D > fogF * 0.82) continue;
        for (const L of D >= 38 ? [0, -12, 12, -22, 22] : [0, -10, 10, -18, 18]) {
          // 真ん中が画面の左右の端（正面から 30° より外）に寄る所は、乱戦の半分が画面の外になる（稲生：左の杉の陰に置いて写らなかった）
          if (Math.abs(L) > D * 0.58) continue;
          const x = Q.x + fx * D + rx * L, z = Q.z + fz * D + rz * L;
          if (!free(x, z, ww) || !placeable(W, solids, x, z, b, ww, lax) || !seenClear(rt, Q, fx, fz, x, z, ww, need)) continue;
          clash({ x, z }, ww, b);
          // 敵の本隊：乱戦の 16〜28m 奥（もう列があれば足さない。移しただけの時は足さない）
          if (body) for (const k of [16, 22, 28]) {
            const bx = x + fx * k, bz = z + fz * k;
            if (D + k > fogF * 0.95 || far.some((c) => Math.hypot(c.x - bx, c.z - bz) < 30) || !placeable(W, solids, bx, bz, b, 40, Math.max(1, lax))) continue;
            const g = W.addDistantArmy({ x: bx, z: bz, w: 40, d: 22, count: MEM_TIGHT ? 150 : 280, facing: b + Math.PI, kind: 'spear',
              flag: bmon, flagRate: 0.8, seed: 5400 + far.length * 13, host: false, near: false, team: 1, farFill: true });
            g.noWake = true; if (g.army) { g.army.noWake = true; if (g.army.U) g.army.U.uRealNear = { value: 20 }; }
            far.push({ x: bx, z: bz, g });
            break;
          }
          return true;
        }
      }
    }
  }
  return false;
}
