// 奥の乱戦の補い（11/1 c_mob「敵の大軍・乱戦が薄い」）：本人の持ち場から敵の方を見た時、左右の奥で軽い大軍どうしが刃を交える。
//   軽い作り（world.addClash）だけ。本物の兵・兵力の数・当たり・bot には入れない（本物に替えない：team を渡さない）。
//   noWake で、本人が 140m の内へ寄るまで形を作らない（携帯の記憶を増やさない）。毎コマ new しない。
//   置く所は平らで歩ける地面だけ（水・崖・建物の上には置かない）。置けない時は何もしない。
//   戦の定義で def.noFrontFill を書けば置かない。
import { MEM_TIGHT } from './settings.js';
import { SEG } from './world_common.js';
import { FLAT } from './flat_rule.js';

const KEYS = new Set([
  'inou', 'inabayama', 'kanegasaki', 'nodafukushima', 'shiga', 'hieizan', 'tonezaka', 'echizen', 'kinome', 'kizugawa', 'tottori', 'takato',
  't01_yamazaki', 't02_shizugatake', 't03_komaki', 't04_negoro', 't05_ichinomiya', 't06_hetsugi', 't07_ganjaku', 't08_nejirozaka', 't09_yamanaka', 't10_oshi', 't11_hachioji', 't12_odawara',
]);

// lax：0 きびしく・1 坂と高低を少しゆるく（山の戦・城攻めで置けない時の二の手）・2 さらに・
//   3 山の斜面にも置く（比叡山・稲葉山：平らな所が無い。歩けない山肌・木の幹は気にしない。水と建物の上には置かない）
function placeable(W, solids, x, z, f, w, lax = 0) {
  const half = W.half || 200, cf = Math.cos(f), sf = Math.sin(f);
  const slope = [0.42, 0.6, 0.75, 1.15][lax], rise = [9, 15, 24, 45][lax];
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
    for (const s of solids) if ((lax < 3 || (s.x1 - s.x0) * (s.z1 - s.z0) > 3) && px > s.x0 - 3 && px < s.x1 + 3 && pz > s.z0 - 3 && pz < s.z1 + 3) return false;
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
  return true;
}

export function frontFill(rt) {
  const def = rt.def, W = rt.world;
  if (!def || !W || !W.addClash || def.noFrontFill || def.dojo || def.mapCastle || !KEYS.has(def.key)) return [];
  const P0 = rt.player?.u?.pos || def.spawn;
  if (!P0) return [];
  // 持ち場が地図の外に書かれた戦（山中城：z=292）は、地図の内へ寄せた所から測る
  const lim = (W.half || 200) - 20, P = { x: Math.max(-lim, Math.min(lim, P0.x)), z: Math.max(-lim, Math.min(lim, P0.z)) };
  // 敵の向き：生きている敵の組の真ん中（人数で重み）。居なければ本人の向き
  let ex = 0, ez = 0, n = 0;
  const real = [];
  for (const g of rt.army?.groups || []) {
    for (const u of g.units) if (u.alive) { real.push(u.pos); if (g.team === 1) { ex += u.pos.x; ez += u.pos.z; n++; } }
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
  const D0 = Math.max(42, Math.min(fogF * 0.7, d0 * 0.85));
  const out = [];
  const w0 = MEM_TIGHT ? 40 : 52;
  let w = w0;
  for (const sd0 of [1, -1]) {
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
              if (out.some((c) => Math.hypot(c.x - x, c.z - z) < ww)) continue;
              // 本物の兵の上には重ねない（乱戦の枠：横 ww・前後 12m）
              if (real.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < ww / 2 + 5 && Math.abs(dx * fx + dz * fz) < 12; })) continue;
              if (need && !seen(W, P, fx, fz, x, z)) continue;
              if (placeable(W, solids, x, z, a, ww, lax)) { put = { x, z }; w = ww; break find; }
            }
          }
        }
      }
    }
    if (!put) continue;
    const seed = 4100 + out.length * 17 + (def.key.length * 31);
    out.push(W.addClash({
      x: put.x, z: put.z, facing: a, w, gap: 2.6, bw: 5.5, seed, noWake: true, noRout: true, killRate: 0.01, maxDrift: 2, corpses: MEM_TIGHT ? 12 : 30,
      A: { flag: amon, count: MEM_TIGHT ? 110 : 170, flagRate: 0.7 },
      B: { flag: bmon, count: MEM_TIGHT ? 130 : 200, flagRate: 0.7, bows: true },
      host: MEM_TIGHT ? false : undefined,
      play: (k, p, v) => rt.army.play(k, p, v * 0.5), smoke: (x, y, z, sx, sz) => rt.army.smoke(x, y, z, sx, sz),
    }));
  }
  // 奥の敵の大軍：敵の向きの霧の手前（fogF の 0.6〜0.9。11/2 までは 130m より先に置いて霧で白く消えていた）に、軽い列を横に並べる。
  //   動かさない・本物に替えない・後詰めを付けない。携帯は列を減らす
  const far = [];
  if (!def.noFarFill) {
    const fw = 40, fc = MEM_TIGHT ? 110 : 210, want = MEM_TIGHT ? 4 : 6;
    // 敵の後ろから霧の境までに置く（霧に溶ける大軍）。
    //   奥が地図の外なら手前へ。山の戦は坂をさらにゆるく
    //   半分は始めに見える所（霧の手前）、残りは本人が 40〜70m 進んだ時に霧の手前に来る所（山崎：進むと手前の列は横・後ろへ外れた）
    const vmax = fogF * 0.9, vmin = fogF * 0.6, dm = Math.min(vmax, Math.max(vmin, d0 + 25)), wantA = Math.ceil(want / 2);
    // 一列を置ければ true（b：列の向きの角。味方の列は敵の真ん中へ向ける）
    const tryPut = (x, z, b, lax, need, foe) => {
      // 近い乱戦とは、横に並ぶ時だけ間を空ける（前後に 22m 離れていれば重ならない。高遠：乱戦の奥に列が置けなかった）
      const hitC = (c) => { const dx = x - c.x, dz = z - c.z; return Math.abs(dx * rx + dz * rz) < (fw + w) / 2 + 4 && Math.abs(dx * fx + dz * fz) < 22; };
      if (far.some((c) => Math.hypot(c.x - x, c.z - z) < fw + 4) || out.some(hitC)) return false;
      // 本物の兵とは、列の枠（横 fw・奥 18m）に余白を足した所だけ避ける（志賀：丸く 30m 避けて町の奥に置けなかった）
      if (real.some((u) => { const dx = u.x - x, dz = u.z - z; return Math.abs(dx * rx + dz * rz) < fw / 2 + 6 && Math.abs(dx * fx + dz * fz) < 16; })) return false;
      if (need && !seen(W, P, fx, fz, x, z)) return false;
      if (!placeable(W, solids, x, z, b, fw, lax)) return false;
      const g = W.addDistantArmy({ x, z, w: fw, d: 18, count: fc, facing: foe ? a + Math.PI : (Math.atan2(ex - x, ez - z) || a), kind: (far.length % 2) ? 'mixed' : 'spear',
        flag: foe ? bmon : amon, flagRate: 0.8, seed: (foe ? 5200 : 5300) + far.length * 13, host: false, near: false, team: foe ? 1 : 0, farFill: true });
      g.noWake = true; if (g.army) g.army.noWake = true;
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
    row(wantA, 1, near);
    row(wantA, 0, near);
    // 城山・山の戦（敵の奥が崖や城）：斜め前の麓に、山を囲む味方の大軍を置く（稲葉山・比叡山）
    if (far.length < 2) {
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
        if (far.length >= wantA) break;
        const b = a + k * 0.32;
        for (const D of [fogF * 0.75, fogF * 0.6, fogF * 0.88, 48]) {
          const x = P.x + Math.sin(b) * D, z = P.z + Math.cos(b) * D;
          if (tryPut(x, z, b, 2, 0, false) || tryPut(x, z, b, 3, 0, false)) break;
        }
      }
    }
    // 進んだ先：始めは霧の奥（描かれない）、40〜70m 進むと霧の手前に来る
    row(want, 0, [[fogF * 1.4, 1], [fogF * 1.2, 1], [fogF * 1.6, 1], [fogF * 1.4, 2], [fogF * 1.2, 3]]);
  }
  rt.frontFill = out;
  rt.farFill = far;
  return out;
}
