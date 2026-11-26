// ======================================================================
// 設楽原の決戦　追加改善（docs/shitaragahara_plus_1109.md）
//   ・鳶ヶ巣山（酒井忠次）：使番の報だけで終わらせない。開戦から一分余りで遠くの鳶ヶ巣山から鉄砲の音と白煙
//     → 使番「酒井隊、鳶ヶ巣山へ攻め入りました！」→ 四十秒ほどで陥落の黒煙と「長篠城、包囲解けました！」
//     → 武田の備の気が落ち、川向こうの奥の備の一部が後ろ（東）へ下がる（後ろが危ない）。
//   ・大斉射：毎回の番の射撃とは別に、寄せが近い口で十五分に六回まで「構え！」「まだだ！」「放て！」の大斉射。
//     撃ってから少し遅れて何人も倒れる（火縄銃の重さ）。白煙の後に柵際まで来た敵がいれば「来てるぞ！」。
// 兵は足さない。毎コマ new しない。字は台詞だけ。
// ======================================================================
import * as THREE from 'three';
import { sfx } from '../audio.js';
import { SH } from './side.js';   // K661：両軍の側

export const TOBI = { x: 880, z: 620 };
const PT = { x: 0, z: 0 };
export const shooters = (q) => q.routed ? 0 : q.units.reduce((n, u) => n +
  (u.type === 'gun' && !u.sidearm && u.gunAmmo !== 0 && u.alive && !u.fleeing && !u.gone &&
    !u.woundOut && !u.rearWound && !u.noTarget ? 1 : 0), 0);

// 鳶ヶ巣山の別の戦場。t0 は夜明けの寄せの始まり（本体の N.t0）
// 鳶ヶ巣山の遠い煙（11/14 クラウドか K294：図鑑の長篠の屏風「右奥に鳶ヶ巣山砦が燃える」が、柵の所から写真で一筋も見えなかった）。
//   共通の煙の柱（world_smoke）は霧（約九十メートル）に溶け、一キロ先の煙は消える。遠い山と同じく霧の外で描く一枚絵を、
//   本当の場所（東南東・約1.2km）に足す。高さは遠景の山（farH）に合わせる。一つの戦で五枚まで・作るのは段の変わり目の一度だけ。
let PLUME_TEX = null;
function plumeTex() {
  if (PLUME_TEX) return PLUME_TEX;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const t = i / 25, x = 32 + Math.sin(i * 1.7) * t * 10, y = 246 - t * 222, r = 10 + t * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.34 * (1 - t * 0.7)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  }
  PLUME_TEX = new THREE.CanvasTexture(c);
  return PLUME_TEX;
}
function farPlume(rt, x, z, w, h, black) {
  const W = rt.world;
  if (!W?.scene || typeof document === 'undefined') return null;
  const y = Math.max(W.heightAt(x, z), W.farH ? W.farH(x, z) : -1e9);
  const m = new THREE.SpriteMaterial({ map: plumeTex(), transparent: true, depthWrite: false, fog: false, opacity: black ? 0.7 : 0.5 });
  m.color.set(black ? 0x3d3935 : 0xdcd8d0);
  if (W.scene.fog) m.color.lerp(W.scene.fog.color, 0.3);
  const sp = new THREE.Sprite(m);
  sp.center.set(0.5, 0.02); sp.position.set(x, y - 6, z); sp.scale.set(w, h, 1);
  sp.userData.home = { x, y: y - 6, z, w, h };
  W.scene.add(sp);
  return sp;
}
// 落ちた砦の火（11/14 クラウドし K295 長篠の屏風「鳶ヶ巣山砦が燃える」：黒煙だけでは燃えて見えない）。
//   黒煙の根に、霧の外で描く橙の火の照り一枚。足すのは陥落の時の一度だけ・毎コマは明るさを揺らすだけ。
let GLOW_TEX = null;
function farGlow(rt, x, z, w) {
  const W = rt.world;
  if (!W?.scene || typeof document === 'undefined') return null;
  if (!GLOW_TEX) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 30, 0, 32, 30, 30);
    gr.addColorStop(0, 'rgba(255,150,40,1)'); gr.addColorStop(0.4, 'rgba(225,70,18,0.8)'); gr.addColorStop(1, 'rgba(120,25,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 32);
    GLOW_TEX = new THREE.CanvasTexture(c);
  }
  const y = Math.max(W.heightAt(x, z), W.farH ? W.farH(x, z) : -1e9);
  const m = new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });   // 明るい空で足し算の光は白く飛ぶので、ふつうの重ねで橙を残す
  const sp = new THREE.Sprite(m);
  sp.center.set(0.5, 0.1); sp.position.set(x, y - 6, z); sp.scale.set(w, w * 0.4, 1);
  sp.userData.home = { x, y: y - 6, z, w, h: w * 0.4 }; sp.userData.glow = Math.random() * 6;
  W.scene.add(sp);
  return sp;
}
// 写す先の遠さ（camera.far）の内へ、目から同じ向き・同じ見かけの大きさのまま寄せる（毎コマ。new しない）
function placePlumes(rt, list) {
  const cam = rt.camera;
  if (!list || !cam) return;
  const C = cam.position, lim = (cam.far || 150) * 0.8;
  for (const sp of list) {
    const o = sp && sp.userData.home;
    if (!o) continue;
    const dx = o.x - C.x, dy = o.y - C.y, dz = o.z - C.z, d = Math.hypot(dx, dy, dz) || 1, k = d > lim ? lim / d : 1;
    sp.position.set(C.x + dx * k, C.y + dy * k, C.z + dz * k); sp.scale.set(o.w * k, o.h * k, 1);
    if (sp.userData.glow != null) { const q = (sp.userData.glow += 0.11); sp.material.opacity = 0.62 + 0.2 * Math.sin(q) * Math.sin(q * 2.3 + 1); }
  }
}

export function tobiTick(rt, t0) {
  const F = rt.flags;
  const K = F.shTobi || (F.shTobi = { s: 0, next: 0 });
  placePlumes(rt, K.far);
  if (K.s >= 3 || F.ending) return;
  const t = rt.t - t0;
  if (K.s === 0) {
    if (t < 75) return;
    K.s = 1; K.at = rt.t;
    K.cols = [[880, 620], [905, 645]].map(([x, z]) =>
      rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 8, z, { size: 2.6 }));
    K.far = [[880, 620, 120, 240], [905, 645, 86, 180]].map(([x, z, w, h]) => farPlume(rt, x, z, w, h, false));
    try { sfx('volleyFar', 0.55); } catch (e) { /* 音が無くても進む */ }
    rt.say('使番', '鳶ヶ巣山の方で鉄砲の音！　酒井隊が、武田の砦へ攻め入りました！', 4);
    return;
  }
  if (K.s === 1) {
    // 遠い砦攻めの音が途切れ途切れに続く
    if (rt.t - (K.last || 0) > K.next) {
      K.last = rt.t; K.next = 3 + Math.random() * 3;
      try { sfx('volleyFar', 0.3 + Math.random() * 0.2); } catch (e) { /* なし */ }
    }
    if (rt.t - K.at < 40) return;
    K.s = 2; K.at = rt.t;
    F.tobiSmoke = [[880, 620], [930, 660], [850, 700]].map(([x, z], i) =>
      rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 8, z, { size: 4 - i * 0.6, black: true }));
    // 白煙の遠い絵は黒煙へ替える（落ちた砦が燃える）
    for (const sp of K.far || []) if (sp) { sp.material.color.set(0x3d3935); if (rt.world.scene?.fog) sp.material.color.lerp(rt.world.scene.fog.color, 0.3); sp.material.opacity = 0.72; sp.userData.home.w *= 1.3; sp.userData.home.h *= 1.35; }
    K.far = (K.far || []).concat([[930, 660, 100, 210]].map(([x, z, w, h]) => farPlume(rt, x, z, w, h, true)));
    K.far = K.far.concat([[880, 620, 46], [930, 660, 36]].map(([x, z, w]) => farGlow(rt, x, z, w)).filter(Boolean));
    rt.say('使番', '鳶ヶ巣山の砦、陥落！　長篠城の囲みが解けました！', 4);
    // 武田の後ろが危ない：気が落ち、川向こうの奥の備の一部が東へ下がる
    let k = 0;
    for (const g of rt.army.groups) {
      if (g.team !== SH.tak || g.routed) continue;
      g.morale = Math.max(0, (g.morale ?? 100) - 12);
      if (!g.count || g.noRout === true || g.fixed) continue;
      const c = g.center?.();
      if (c && c.x > 220 && k < 3 && g.order === 'hold' && g.anchor) { g.anchor.x += 70; k++; }
    }
    return;
  }
  if (K.s === 2 && rt.t - K.at > 6) {
    K.s = 3;
    rt.say('組頭', '武田の後ろが燃えておる。もう退くだけでは済まぬぞ。勝頼は前へ出るしかない', 4);
  }
}

// 大斉射（四〜六回の見せ場）。teppo_wall.js の近い口の番から呼ぶ。
// gs：その口で撃てる鉄砲組、z：口の z、power：鉄砲兵の残り（0〜1）、hit(z, power)：当たり
export function bigVolley(rt, W, gs, z, SB, power, hit) {
  const n0 = gs.reduce((n, q) => n + shooters(q), 0);
  if (!n0 || !W.on || rt.over || rt.flags.ending) return;
  W.big = (W.big || 0) + 1; W.bigT = rt.t;
  for (const q of gs) { q.fire = false; q.holdFire = true; }
  rt.say('鉄砲頭', '構え！　引き付けよ……', 1.6);
  rt.after(1.7, () => { if (W.on && !rt.over && !rt.flags.ending) rt.say('鉄砲頭', 'まだだ！　まだ撃つな！', 1.4); });
  rt.after(3.4, () => {
    if (!W.on || rt.over || rt.flags.ending) return;
    const remaining = gs.reduce((n, q) => n + shooters(q), 0);
    let inside = 0, approaching = 0;
    for (const u of rt.army.units) {
      if (u.team !== SH.tak || !u.alive || u.fleeing || u.gone || u.noTarget || u.woundOut || u.rearWound || u.group?.shWaiting) continue;
      const dx = u.pos.x - SB.x0;
      if (dx > -2 && dx < 80 && Math.abs(u.pos.z - z) < 60) approaching++;
      if (u.pos.x < SB.x0 - SB.gap - 1 && u.pos.x > SB.x0 - 40 && Math.abs(u.pos.z - z) < 32) inside++;
    }
    // 号令から発砲までの損耗・突破・退却を反映する。去った寄せへの射撃を再開しない。
    if (!remaining || !approaching || inside >= 3) {
      for (const q of gs) { q.fire = false; q.holdFire = true; }
      return;
    }
    power *= Math.min(1, remaining / n0);
    rt.say('鉄砲頭', '放てぇっ！', 1.4);
    // 11/17 iMac n-nagashino K354（本「煙で何も見えぬ」「弾込めの暇は無いはず」）：一度目と二度目の大斉射の後、煙の向こうの武田の将の声を一度ずつ
    if (W.big === 1) rt.after(2.4, () => { if (W.on && !rt.over && !rt.flags.ending) rt.say('武田の侍大将', '煙で何も見えぬ……先手は柵に取り付いたのか！', 3); });
    else if (W.big === 2) rt.after(2.4, () => { if (W.on && !rt.over && !rt.flags.ending) rt.say('武田の侍大将', '間が短すぎる。弾込めの暇は無いはずじゃ……', 3); });
    for (const q of gs) { q.fire = shooters(q) > 0; q.holdFire = !q.fire; }
    PT.x = SB.x0 + 2; PT.z = z;
    try { rt.army.play('volley', PT, 1.6); } catch (e) { /* なし */ }
    const rows = Math.max(1, Math.round(3 * power));
    for (let k = -rows; k <= rows; k++) {
      try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, z + k * 4) + 1.5, z + k * 4, 1, 0); } catch (e) { /* なし */ }
    }
    try { rt.world.gunSmoke?.(SB.x0 + 4, z); rt.world.gunSmoke?.(SB.x0 + 6, z + 8); } catch (e) { /* なし */ }
    // 撃ってから少し遅れて倒れる（火縄銃の重さ）
    rt.after(0.2, () => hit(z, power * 1.6));
    rt.after(0.45, () => hit(z + 6, power));
    // 白煙で前が見えない。晴れると柵際まで来ている
    rt.after(5.5, () => {
      if (!W.on || rt.over || rt.flags.ending) return;
      let n = 0;
      for (const u of rt.army.units) {
        if (u.team !== SH.tak || !u.alive || u.fleeing || u.gone || u.noTarget || u.woundOut || u.rearWound || u.group?.shWaiting) continue;
        const dx = u.pos.x - SB.x0;
        if (dx > -2 && dx < 14 && Math.abs(u.pos.z - z) < 30) n++;
      }
      if (n >= 2) { try { sfx('hooves', 0.8); } catch (e) { /* なし */ } rt.say('足軽', '煙の向こう……来てるぞ！　柵の際じゃ！', 2.6); }
    });
  });
}
