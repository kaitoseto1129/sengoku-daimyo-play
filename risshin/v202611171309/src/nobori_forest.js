// 幟の林（11/17 クラウド kaito2・物差し③「太い塊と幟の林」・取り札「幟と旗指物の動きと数」）
//   全戦の 874×402 の写真で数えると、本人から 120m 内の幟は天王寺・岡山の 109 本に対し、多くの戦が 0〜35 本だった
//   （布陣の表 fujin_layout に行のある戦だけ塊の後ろに幟の林が立ち、戦の筋で出す本物の組には家の幟が無かった）。
//   本物の組（兵 8 人以上）の後ろに、その組の旗の幟を数本立て、組の真ん中と向きに付いて動かす。崩れた・尽きた組の幟は下げる。
//   なびきは付けない（kaito 10/24「旗・幟・指物のなびきは全戦で止める」settings.js）。描くのは props.js の束（InstancedMesh）なので描く回数は増えない。
import { nobori } from './props.js';
import { isTouch } from './touch.js';

const MAX_ALL = isTouch ? 90 : 160;   // 一つの戦で足す幟の上限（携帯の重さ）
const PER = isTouch ? 3 : 5;          // 一つの組の後ろに立てる本数
const MIN_MEN = 8;
const OFF = typeof location !== 'undefined' && /[?&]noforest/.test(location.search);   // 比べる時だけ（botrun --q=noforest=1）

function flagOf(g) {
  for (const u of g.units || []) if (u.alive && u.look && u.look.flag && u.type !== 'porter' && u.type !== 'player') return u.look.flag;
  return null;
}
function centerOf(g) {
  let x = 0, y = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone) { x += u.pos.x; y += u.pos.y; z += u.pos.z; n++; }
  return n ? { x: x / n, y: y / n, z: z / n, n } : null;
}

export function noboriForestTick(rt, dt) {
  if (OFF || rt.def.noForest || rt.def.town || rt.def.dojo || rt.def.duel) return;
  const A = rt.army, W = rt.world, P = rt.player?.u;
  if (!A || !W || !P || !rt.scene) return;
  const F = rt.flags;
  const S = F._nbF || (F._nbF = { n: 0, t: 0, list: [] });
  S.t -= dt;
  if (S.t <= 0) {
    S.t = 1;
    // 立てる：まだ幟の無い本物の組（布陣の表の塊は fujin_place が立てる）
    for (const g of A.groups || []) {
      if (S.n >= MAX_ALL) break;
      if (g._nbF || g._nobs || g._fjR || g.isPlayerSquad || g.hidden || g.routed || (g.team !== 0 && g.team !== 1)) continue;
      if ((g.count || 0) < MIN_MEN) continue;
      const kind = flagOf(g); if (!kind) continue;
      const c = centerOf(g); if (!c) continue;
      const list = [];
      for (let j = 0; j < PER && S.n < MAX_ALL; j++) {
        try {
          const nb = nobori(W, c.x, c.z, kind, 5.2);
          rt.scene.add(nb);
          list.push(nb); S.n++;
        } catch (e) { break; }
      }
      g._nbF = { list, x: c.x, z: c.z, f: g.facing || 0 };
      S.list.push(g);
    }
  }
  // 動かす・下げる（毎コマ。組の真ん中へ寄せ、向きの後ろ 5〜7m に横に並べる）
  for (let i = S.list.length - 1; i >= 0; i--) {
    const g = S.list[i], d = g._nbF;
    const c = !g.routed && g.order !== 'flee' && (g.count || 0) >= 3 ? centerOf(g) : null;
    if (!c) {
      for (const nb of d.list) nb.parent?.remove(nb);
      S.n -= d.list.length; d.list.length = 0; S.list.splice(i, 1);
      continue;
    }
    const k = Math.min(1, dt * 1.5);
    d.x += (c.x - d.x) * k; d.z += (c.z - d.z) * k;
    let df = (g.facing || 0) - d.f; df = Math.atan2(Math.sin(df), Math.cos(df)); d.f += df * Math.min(1, dt * 0.8);
    const fx = Math.sin(d.f), fz = Math.cos(d.f), lx = Math.cos(d.f), lz = -Math.sin(d.f);
    const w = Math.min(10, 2 + c.n * 0.25), m = d.list.length;
    for (let j = 0; j < m; j++) {
      const nb = d.list[j];
      const side = ((j + 0.5) / m - 0.5) * w + Math.sin(j * 3.1 + i * 1.7) * 0.9, dep = 5 + (j % 2) * 1.6 + Math.sin(j * 2.3 + i) * 0.8;
      const x = d.x + lx * side - fx * dep, z = d.z + lz * side - fz * dep;
      const gy = W.heightAt(x, z);
      nb.position.x = x; nb.position.z = z; nb.position.y = gy;
      nb.rotation.y = d.f + Math.PI + Math.sin(j * 1.9 + i) * 0.4;
      // 本人の 9m 内では隠す（間近の布が画面いっぱいの黒い板に見える・depth_real.js と同じ）
      //   城の段・石垣・塀の上では地の高さが組の足元と食い違い、幟が宙に浮いた白い板に見えた（11/17 佐和山の段5・iMac の検品）→ 1.2m より食い違う幟は隠す
      const v = Math.hypot(x - P.pos.x, z - P.pos.z) > 9 && Math.abs(gy - c.y) < 1.2;
      if (nb.visible !== v) nb.visible = v;
    }
  }
}
