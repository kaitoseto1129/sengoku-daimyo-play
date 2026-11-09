// k11/wagi.js … 冬の陣の中間の場面（戦わない短い場面。docs/toku15_plan_1108.md「冬の陣中間イベント」）
// 真田丸で寄せ手が退いた後：大筒が大坂城を撃つ → 天守に弾が届き、城の内が和睦へ傾く → 和議 →
// 惣構の堀が埋まっていき、真田丸が壊される（暗転を三度はさむタイムラプス）。
// 「冬の陣で落とせなかった城が、自分から守りを失った」を、絵（堀が埋まる・塀と櫓が沈む・旗が消える）と台詞で見せる。字の札は足さない。
// 重さ：埋める土は帯一枚（頂点を段ごとに四度動かすだけ）。煙は四本まで。毎コマ new しない。
// 使い方：win の中で install(rt, { C, polar, MOAT, SPAN, FENCE_R, maru, osaka })。maru は丸の塀・櫓・旗の物（沈める）。
import * as THREE from 'three';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';

// 暗転（日が過ぎる）：黒い幕を薄く降ろして上げる。字は出さない
function dip(rt, sec = 1.6) {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('k11WagiDip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'k11WagiDip';
    el.style.cssText = 'position:fixed;inset:0;background:#05060a;opacity:0;pointer-events:none;z-index:40;transition:opacity 0.6s ease';
    document.body.appendChild(el);
  }
  el.style.opacity = '0.92';
  setTimeout(() => { el.style.opacity = '0'; }, sec * 1000 * 0.55);
  setTimeout(() => { if (el.style.opacity === '0') el.remove(); }, sec * 1000 + 900);
}

// 堀を埋める土の帯：MOAT の内外の縁の間を、丸の弧に沿って細かく分けた帯。高さは頂点ごとに「今の地面」から「野の高さ」へ
function fillBand(W, polar, MOAT, a0, a1) {
  const NA = 72, NR = 4, pos = [], idx = [], from = [], to = [];
  const fieldY = (a) => { const q = polar(a, MOAT.r1 + 3); return W.heightAt(q.x, q.z) - 0.15; };
  for (let i = 0; i <= NA; i++) {
    const a = a0 + (a1 - a0) * i / NA, fy = fieldY(a);
    for (let j = 0; j <= NR; j++) {
      const r = MOAT.r0 + (MOAT.r1 - MOAT.r0) * j / NR, q = polar(a, r), y0 = W.heightAt(q.x, q.z) - 0.3;
      pos.push(q.x, y0, q.z); from.push(y0); to.push(Math.max(y0, fy));
    }
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
    const p = i * (NR + 1) + j, q = p + NR + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x6e5a40, side: THREE.DoubleSide }));
  m.userData.noBatch = true; m.userData.camBlock = false; m.receiveShadow = true;
  m.frustumCulled = false;
  return { mesh: m, set(k) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, from[i] + (to[i] - from[i]) * k);
    P.needsUpdate = true; g.computeVertexNormals();
  } };
}

export function install(rt, ctx = {}) {
  const F = rt.flags;
  if (F.wagi) return;
  F.wagi = true;
  const W = rt.world, C = ctx.C || { x: 0, z: -40 };
  const T = ctx.osaka?.tenshu || { x: -40, z: -290 };
  const ground = (x, z) => (W && W.farH ? W.farH(x, z) : W && W.heightAt ? W.heightAt(x, z) : 0);
  const S = (t, fn) => rt.after(t, () => { try { fn(); } catch (e) { /* 場面の一つが欠けても終幕は続ける */ } });

  // ① 大筒：南の陣から城へ撃ち込む。音は遠雷のように低く、天守の上に煙が立つ（四本まで）
  let puffs = 0;
  const boom = (v) => {
    sfx('tenshuBlast', 0.35 * v);
    if (puffs < 4 && W && W.addSmokeColumn) { puffs++; W.addSmokeColumn(T.x + (puffs - 2.5) * 9, ground(T.x, T.z) + 40, T.z + (puffs % 2) * 8, { size: 3.2 }); }
  };
  [[0.4, 1], [1.9, 0.8], [3.1, 1], [4.6, 0.9], [6.2, 1], [7.4, 0.8], [9.5, 1], [11.2, 0.8]].forEach(([t, v]) => S(t, () => boom(v)));
  // 家康と秀忠（茶臼山の陣。docs/generals_toyo_toku_1108.md の 11：必須の二人）
  S(0.2, () => rt.say('徳川家康', '大筒を据えよ。城へ撃ち込め', 2.6));
  S(3.0, () => rt.say('徳川秀忠', '父上、今一度、総攻めを', 2.4));
  S(5.6, () => rt.say('徳川家康', 'ならぬ。力攻めは無理だ。城の内の心を撃て', 3.2));
  S(9.0, () => rt.say('足軽', '弾が天守に届いたぞ……！', 2.4));
  S(11.6, () => rt.say('使番', '城の内で死人が出て、淀の御方が和睦を望まれておる由', 3.4));

  // ② 和議：撃ち方やめ。法螺が一つ
  S(14.2, () => { sfx('horagai', 0.5); rt.say('使番', '和議が成った。惣構の堀は埋め、この出丸は壊す約定じゃ', 4); });

  // ③ タイムラプス：暗転を三度。暗いうちに、堀が三分の一ずつ埋まり、丸の塀・櫓・旗が沈む
  let band = null;
  try {
    if (ctx.polar && ctx.MOAT && W && W.heightAt) {
      const sp = ctx.SPAN || 2.45;
      band = fillBand(W, ctx.polar, ctx.MOAT, -sp, sp);
      band.set(0); rt.scene.add(band.mesh);
    }
  } catch (e) { band = null; }
  const maru = (ctx.maru || []).filter((o) => o && o.parent);
  const base = maru.map((o) => o.position.y);
  const sink = (k) => maru.forEach((o, i) => { o.position.y = base[i] - 9 * k; if (k >= 1) o.visible = false; });
  const steps = [[17.5, 0.34, 0.25], [21.8, 0.68, 0.6], [26.1, 1, 1]];
  for (const [t, kf, ks] of steps) {
    S(t, () => dip(rt, 1.6));
    S(t + 0.75, () => {
      if (band) band.set(kf);
      sink(ks);
      sfx(ks >= 1 ? 'gateCollapse' : 'houseCollapse', 0.55);
      if (W && W.addSmokeColumn && ks < 1) W.addSmokeColumn(C.x + (ks > 0.5 ? 18 : -18), ground(C.x, C.z) + 3, C.z + 4, { size: 2.4 });
    });
  }
  // ④ 締め：埋まった堀を前に
  S(28.4, () => rt.say(nm(rt), '落とせなんだ城が、自ら堀を埋めていく……', 3.6));
  S(32.4, () => rt.say('山崎長徳', '次に攻める時、あの城にはもう堀が無い', 3.4));
  return { end: 36.5 };
}

