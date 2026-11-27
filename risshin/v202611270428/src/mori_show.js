// 毛利編 K716 見せ場の道具：幟（旗）の組を場に立て、段の間にゆっくり動かす（字や札は足さない・幟は props.js の既存の物）。
import { nobori } from './props.js';

// list: [[x, z], …]。立てた幟の組の並びを返す（小道具が無くても戦は続ける）
export function plant(rt, list, kind, h = 5.5) {
  const out = [];
  try { for (const [x, z] of list) { const g = nobori(rt.world, x, z, kind, h); rt.scene.add(g); out.push(g); } } catch (e) { /* 小道具が無くても戦は続ける */ }
  return out;
}

// 幟を (dx,dz) だけ dur 秒かけて動かす（毎コマ new しない・rt.after の刻みで位置だけ変える）
export function march(rt, gs, dx, dz, dur = 8, n = 16) {
  const p0 = gs.map((g) => [g.position.x, g.position.z]);
  for (let i = 1; i <= n; i++) {
    rt.after(dur * i / n, () => {
      if (rt.over) return;
      gs.forEach((g, k) => { const x = p0[k][0] + dx * i / n, z = p0[k][1] + dz * i / n; g.position.set(x, rt.world.heightAt(x, z), z); });
    });
  }
}

// 幟を地の下から一本ずつ立てる（出る見せ場：伏兵の旗が一斉に立つ）。gs は最初は隠してある
export function rise(rt, gs, dur = 2.4) {
  gs.forEach((g, k) => { rt.after(dur * k / Math.max(1, gs.length), () => { if (!rt.over) g.visible = true; }); });
}
export function hide(gs) { for (const g of gs) g.visible = false; }
