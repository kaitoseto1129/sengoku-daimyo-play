// k15/rakujo.js … 天王寺・岡山の戦いの終幕（落城）
// 真田信繁が討たれた後：大坂城の天守に火が回り、上の重へ燃え広がる。北の夕空が赤く焦げ、煙が太る。
// 味方は勝鬨を三度（えい、えい、おう）。その後は鬨が止み、遠くで火の爆ぜる音と、低い法螺が一つだけ鳴る（余韻）。
// 字は出さない（札と台詞は b_k15_tennoji_okayama.js の win が受け持つ）。絵と音だけで見せる。
// 重さ：火は六つまで足す。空の焦げは板一枚（キャンバスで描いた丸い暈し）を使い回し、毎コマ new しない。
// 使い方：win の中で burn の後に install(rt, { CASTLE })。
import * as THREE from 'three';
import { sfx } from '../audio.js';

let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,150,60,0.85)');
  gr.addColorStop(0.35, 'rgba(230,90,30,0.45)');
  gr.addColorStop(0.7, 'rgba(140,40,20,0.15)');
  gr.addColorStop(1, 'rgba(80,20,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  GLOW_TEX = new THREE.CanvasTexture(c);
  return GLOW_TEX;
}

export function install(rt, ctx = {}) {
  const F = rt.flags;
  if (F.rakujo) return;
  F.rakujo = true;
  const C = ctx.CASTLE || { x: 60, z: -470 };
  const W = rt.world;
  const ground = (x, z) => (W && W.farH ? W.farH(x, z) : W && W.heightAt ? W.heightAt(x, z) : 0);

  // 空の焦げ：城の上に大きな暈しを一枚。火が回るほど濃く広く、揺らぐ
  let glow = null;
  try {
    const tex = glowTex();
    if (tex && rt.scene) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
      glow = new THREE.Sprite(mat);
      const y0 = ground(C.x, C.z);
      glow.position.set(C.x, y0 + 22, C.z);
      glow.scale.set(70, 50, 1);
      glow.renderOrder = 1;
      const t0 = rt.t;
      glow.userData.k = 0.25;
      glow.onBeforeRender = () => {
        const k = glow.userData.k, s = (rt.t - t0);
        const fl = 0.86 + 0.08 * Math.sin(s * 7.3) + 0.06 * Math.sin(s * 12.9 + 1.7);
        mat.opacity = Math.min(0.9, k) * fl;
        glow.scale.set(70 + 60 * k, 50 + 40 * k, 1);
      };
      rt.scene.add(glow);
    }
  } catch (e) { glow = null; }
  const grow = (k) => { if (glow) glow.userData.k = k; };

  // 天守の上の重へ火が回る（下から順に）。焼け落ちる御殿の火も足す
  const spread = [
    [3.5, 0, 0, 3.6, 18, 0.45],
    [6.5, 0, -2, 3.2, 22, 0.6],
    [9.5, -8, -6, 3, 10, 0.7],
    [12.5, 0, 0, 5.2, 26, 0.85],
    [16, 10, -10, 2.6, 6, 0.95],
    [20, -18, 4, 2.4, 3, 1],
  ];
  for (const [t, dx, dz, s, h, k] of spread) {
    rt.after(t, () => {
      if (!W || !W.addFire) { grow(k); return; }
      try { W.addFire(C.x + dx, C.z + dz, { size: s, h, blackSmoke: true }); } catch (e) { /* 火が置けなくても終幕は続ける */ }
      grow(k);
    });
  }
  // 煙の柱を一本、天守の頂から太く（火が回りきった時）
  rt.after(13, () => { try { if (W && W.addSmokeColumn) W.addSmokeColumn(C.x, ground(C.x, C.z) + 30, C.z, { size: 6.5 }); } catch (e) { /* なし */ } });

  // 勝鬨を三度：えい、えい、おう（味方が得物を掲げる）
  for (const [t, v] of [[1.6, 0.9], [5.2, 1], [8.8, 1]]) {
    rt.after(t, () => {
      if (rt.over) return;
      try { rt.army.celebrate(rt.player.u.team); } catch (e) { /* なし */ }
      sfx('sig_eiei', v);
    });
  }
  // 余韻：鬨が止み、遠くで焼け落ちる音と、低い法螺が一つ
  rt.after(15.5, () => { if (!rt.over) sfx('fireSpread', 0.35); });
  rt.after(20.5, () => { if (!rt.over) sfx('crash', 0.25); });
  rt.after(25.5, () => { if (!rt.over) sfx('farHorn', 0.5); });
}
