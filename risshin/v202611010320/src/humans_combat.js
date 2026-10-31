// 人の処理：装備の動き。外部向けの入口は humans.js。
import { crowdSweep, PART_BONE } from './humans_crowd_geometry.js';
import { reduceMotion, MEM_TIGHT } from './settings.js';
import { crowdGeos, memTight, crowdShapes, SRC, isNamed, HUM, restMatrix, m0, XB, m1, kusaPlates } from './humans_shared.js';
import { ARMY, WORLD } from './humans_context.js';
import { disposeShGeo, BODY_SHADOW_CAMERA, shadowGeoOf } from './humans_lod.js';
import { DM } from './humans_armor.js';
import { RIDE, thrustOut } from './units.js';
import { fpLift } from './humans_grip.js';
import { _fpA, _fpB, _fpC, _fpE, _fpD, GUN_BUTT } from './humans_arms.js';
import { clamp01, rotWorld, _right, _fwd, _up, ease } from './humans_pose.js';
import { HORO_TOP, HORO_BACK } from './units_model.js';
import * as THREE from 'three';
import { WIND_STATE } from './world.js';

// 長く使われていない束の形を手放す（開戦後に増える姿の種類ごとの形が、戦の間ずっと積み上がらないように）
let crowdSweepAt = 0;
function resetCrowdSweep() {
  crowdSweepAt = 0; crowdSweep.keys = null; crowdSweep.left = 0; crowdSweep.used = null;
}
function sweepCrowdGeos(now) {
  if (MEM_TIGHT) return;   // 貸出待ちの甲冑も共有の形を保持し、出入りで再転送しない。
  const work = crowdSweep;
  if (!work.keys) {
    if (now - crowdSweepAt < 5000) return;
    crowdSweepAt = work.at = now;
    work.keys = crowdGeos.keys(); work.left = crowdGeos.size;
    // 今だれか（見えていない人も）が着ている形は表に残す（外すと二重に作られる。h.cg）。巡回の初めに一度だけ集める
    const used = work.used || (work.used = new Set()); used.clear();
    if (ARMY) for (const u of ARMY.units) { const h = u.human; if (h && h.cg) for (const g of h.cg) used.add(g); }
    for (const h of humans) if (h.cg) for (const g of h.cg) used.add(g);
  }
  // 五秒ごとの全消去を重ねない。調べる数は三十二、返す数は四つ。半ミリ秒を超えたら次のコマへ。
  // 鍵だけを巡回し、候補の写しや [鍵, 形] の配列を毎回作らない。
  const t0 = performance.now(), idle = 20000;   // iPhone も 20 秒（8 秒では返した形をすぐ作り直し、そのごみが WebContent を押した。鍵が中身になったので同じ姿は一つ。10/21）
  let scanned = 0, freed = 0;
  while (work.left > 0 && scanned < 32 && freed < 4) {
    const next = work.keys.next();
    if (next.done) { work.left = 0; break; }
    work.left--; scanned++;
    const key = next.value, g = crowdGeos.get(key);
    // 巡回の途中で使われた形と、巡回開始後に作った形は残す。
    if (g?.userData && work.at - (g.userData.use || 0) >= idle) {
      if (work.used.has(g)) { if (memTight()) { g.dispose(); disposeShGeo(g); } continue; }   // 着ている人がいる形は表に残し、GPU の分だけ返す（描けば three が送り直す）
      g.dispose(); disposeShGeo(g); crowdGeos.delete(key);
      freed++;
    }
    if (performance.now() - t0 >= 0.5) break;
  }
  if (work.left === 0) {
    work.keys = null; work.used.clear();
    // 形（crowdShapes）は姿の組み合わせごとに増え続けていた（森部 2.5 分で 209 個・62MB。GPU へも同じだけ）。
    //   今どの束の形からも使われず、長く（iPhone 20 秒・ほか 60 秒）使っていない形は手放す（また要れば作り直す）
    if (crowdShapes.size > 24) {
      const live = new Set();
      for (const g of crowdGeos.values()) if (g && g.userData) live.add(g.userData.shapeKey);
      const keep = 60000;   // iPhone も 60 秒（作り直しのごみを減らす。10/21）
      for (const [sk, sh] of crowdShapes) if (!live.has(sk) && now - (sh.use || 0) > keep) crowdShapes.delete(sk);
    }
  }
}
function humanShadowLod(scene, shadow) {
  if (WORLD?.scene !== scene || (shadow && false)) return;
  for (const h of humans) {
    const m = h.body;
    if (shadow) {
      if (!h.root.visible || !h.u?.shOn) continue;   // 選ばれた近くの兵だけ、影の形を軽くする
      if (m.castShadow) { h.bodyScreenGeometry = m.geometry; m.onBeforeRender(null, scene, BODY_SHADOW_CAMERA); }
      // 具足・胴丸も影では升でまとめた軽い形（影の画素 2cm に合わせた 3〜4cm の升。輪郭は同じ）。画面用の形は描き終えたら戻す
      //   （影では onBeforeRender が呼ばれず、画面で選んだ細かい形（具足 1 万・胴丸 4 万の三角）をそのまま影にも描いていた。10/21 熱）
      const ar = h.parts.armor;
      if (window.__apx?.shfull) continue;   // x_shfull：試しで切る（前と比べる）
      if (ar && ar.castShadow && ar.visible && h.cg) {
        const base = h.lodFar || h.loanedDomaru ? h.geoFar : h.cg[1];
        let g = base && shadowGeoOf(base);
        if (g && ar.userData.humanBoneMap) g = ar.userData.humanBoneMap(g);
        if (g && g !== ar.geometry) { h.armorScreenGeometry = ar.geometry; ar.geometry = g; }
      }
      const dm = h.parts.domaru;
      if (dm && dm.castShadow && dm.visible && DM) {
        let g = shadowGeoOf(DM.lo);
        // 影の形も、着せた時と同じ骨番号へ。元の番号では手足の影が原点へ伸びる。
        if (dm.userData.humanBoneMap) g = dm.userData.humanBoneMap(g);
        if (g !== dm.geometry) { h.domaruScreenGeometry = dm.geometry; dm.geometry = g; }
      }
    } else {
      if (h.bodyScreenGeometry) { m.geometry = h.bodyScreenGeometry; h.bodyScreenGeometry = null; }
      if (h.armorScreenGeometry) { h.parts.armor.geometry = h.armorScreenGeometry; h.armorScreenGeometry = null; }
      if (h.domaruScreenGeometry) { h.parts.domaru.geometry = h.domaruScreenGeometry; h.domaruScreenGeometry = null; }
    }
  }
}   // 鉄砲の握りから台尻の端まで（units.js の形）
function gripPose(h, dt) {
  if (window.__apx?.noskin && h.poseReady) return;
  h.skelDirty = true;
  const u = h.u, hd = u.hand, w = u.wpnKind || u.lookWeapon;
  // 一人称の本人（u.fpk：player.js が 0〜1 で渡す）は、馬上でも手を見える所へ寄せる
  const fp = u.isPlayer && (u.fpk || 0) > 0.01;
  if (!hd || !u.alive || !u.wpn || (u.mounted && !fp && !h.fpOff && !(w === 'sword' && (u.swing || h.swd)))) return;
  // units.js がこのコマに構えを置き直していなければ（画面の外など）、前のコマの置き直しのまま（二重にずらさない）
  const G = h.gset;
  if (G && hd.position.x === G[0] && hd.position.y === G[1] && hd.position.z === G[2] && hd.rotation.x === G[3]) return;
  // 前のコマに一人称で寄せた分は、units.js が置き直さなかった成分から引いて戻す（寄せが積み重ならない）
  const F = h.fpOff;
  if (F) { if (hd.position.y === F.ly) hd.position.y -= F.dy; if (hd.position.z === F.lz) hd.position.z -= F.dz; if (hd.position.x === F.lx) hd.position.x -= F.dx; h.fpOff = null; }
  if (!u.mounted && !(w === 'spear' && u.woundRest > 0.01)) gripSet(h, u, hd, w, dt);
  else if (w === 'sword') swordGrip(h, u, hd, dt);
  // 一人称で槍を受けに構える時は、穂先を上げすぎない（前の左手が顔の前へ来て目をふさがない）
  if (fp && w === 'spear' && hd.rotation.x < -0.5) hd.rotation.x += (-0.5 - hd.rotation.x) * u.fpk;
  if (fp) {
    // 一人称：手と武器をいっしょに、目の少し下・少し前へ寄せる（FPS の手のように。三人称の形は変えない）
    // 馬上の人は肩が低い（armsPose で手を 0.18 下げる）。一人称では武器の方を手へ下ろし、手と柄を離さない
    const base = u.mounted ? -0.18 : 0;
    const eyeY = 1.62 + (u.mounted ? RIDE.y - 0.18 : 0);
    // 槍・鉄砲は前の左手が目に近いので、前への寄せは左手の所で測る（寄せすぎて左手が届かなくならない）
    const long = w === 'spear' || w === 'gun';
    const L = long ? fpLift(hd.position.y + base, hd.position.z + 0.22, eyeY - 0.08, u.fpk, 0.28, 0.2) : fpLift(hd.position.y + base, hd.position.z, eyeY, u.fpk);
    let dy = L[0] + base * u.fpk, dz = L[1], dx = 0;
    // 刀を振りかぶる時は、手を頭の上まで上げずに右の肩の前で止める（籠手が画面の下半分をふさがない）
    const top = hd.position.y + base + dy - 1.28;
    if (w === 'sword' && top > 0) { dy -= top * 0.65 * u.fpk; dx += Math.min(0.3, top * 0.9) * u.fpk; dz += Math.min(0.12, top * 0.4) * u.fpk; }
    // 刀を振る間は、手を目の高さより十分下・腕の長さほど前に保つ（振り下ろす腕の籠手が目の前をふさがず、刃の弧が見える）
    if (w === 'sword' && (u.swing || u.pAtk)) {
      const y1 = hd.position.y + base + dy, z1 = hd.position.z + dz, capY = eyeY - 0.3;
      const capY2 = capY + 0.02;
      if (y1 > capY2) dy -= (y1 - capY2) * u.fpk;
      if (z1 < 0.74) dz += (0.74 - z1) * u.fpk;
      dx += 0.1 * u.fpk;
    }
    // 鉄砲は筒を右へ少し寄せる（支える左の前腕が画面の真ん中をふさがない）
    if (w === 'gun') dx -= 0.1 * u.fpk;
    // 槍は狭い視野の下側へ手と袖を残す（前の左腕で中央をふさがない）
    if (w === 'spear') { dy -= 0.06 * u.fpk; dx -= 0.08 * u.fpk; }
    // 弓は弓手を少し下げ、左へ開く（伸ばした左の籠手が画面の左半分をふさがない）
    if (w === 'bow') { dy -= 0.1 * u.fpk; dx -= 0.14 * u.fpk; }
    // 握りが右の肩から腕の長さより遠い時は、肩の方へ引き寄せる（腕が届かず、拳が柄から離れて武器だけ浮いて見えない。馬上で多い）
    const RB = h.bones;
    if (u.mounted && w !== 'bow' && RB && RB.RightArm && RB.RightForeArm && RB.RightHand && hd.parent) {
      hd.parent.updateWorldMatrix(true, false);
      const sp = hd.parent.worldToLocal(RB.RightArm.getWorldPosition(_fpA)), ep = hd.parent.worldToLocal(RB.RightForeArm.getWorldPosition(_fpB)), wp = hd.parent.worldToLocal(RB.RightHand.getWorldPosition(_fpC));
      const reach = (sp.distanceTo(ep) + ep.distanceTo(wp)) * 0.9;
      _fpC.set(hd.position.x + dx - sp.x, hd.position.y + dy - sp.y, hd.position.z + dz - sp.z);
      // 馬上：拳は右の肩から前へ（少し内・少し下）腕を伸ばした所へ（目の真横に来て画面の外へ出ない）
      if (u.mounted && w !== 'bow' && !u.swing && !u.pAtk) {
        // 世界の向きで決める（握りの親の軸は体の前と揃わないことがある）
        const sw = RB.RightArm.getWorldPosition(_fpE), ew = RB.RightForeArm.getWorldPosition(_fpD), rw = sw.distanceTo(ew) + ew.distanceTo(RB.RightHand.getWorldPosition(_fpC));
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        let cx = u.pos.x - sw.x, cz = u.pos.z - sw.z; const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
        _fpD.set(sw.x + fx * rw * 0.85 + cx * 0.12, sw.y - 0.06, sw.z + fz * rw * 0.85 + cz * 0.12);
        hd.parent.worldToLocal(_fpD);
        const tx = _fpD.x, ty = _fpD.y, tz = _fpD.z;
        dx += (tx - (hd.position.x + dx)) * u.fpk; dy += (ty - (hd.position.y + dy)) * u.fpk; dz += (tz - (hd.position.z + dz)) * u.fpk;
        _fpC.set(hd.position.x + dx - sp.x, hd.position.y + dy - sp.y, hd.position.z + dz - sp.z);
      }
      const L = _fpC.length();
      if (L > reach && reach > 0.1) { const k = (1 - reach / L) * u.fpk; dx -= _fpC.x * k; dy -= _fpC.y * k; dz -= _fpC.z * k; }
    }
    // 一人称の込め直し：筒を立てて目の前をふさがないよう、体の前で斜めに下げ、筒口を画面の下の右寄りへ（台尻は腿の上）
    const rl = w === 'gun' && FP_RELOAD.has(u.gunPh);
    h.fpRl = (h.fpRl || 0) + ((rl ? 1 : 0) - (h.fpRl || 0)) * Math.min(1, dt * 6);
    // 一人称で担いだ鉄砲は、筒先を立てずに前へ寝かせる（筒が画面を縦に割って前をふさがない）
    if (w === 'gun' && (u.gunPh === 'carry' || u.gunPh === 'ready') && hd.rotation.x < -0.3) hd.rotation.x += (-0.3 - hd.rotation.x) * u.fpk;
    if (h.fpRl > 0.01 && RB && RB.Head && hd.parent) {
      // 目（頭の骨）から測る：筒口は目の前 0.7m・右へ 0.16m・下へ 0.24m（馬上は目を 0.16m 上げてあるので 0.08m）、筒は 35° ほど立てる
      // 一人称の体は描く間だけ左右に映す（player.js fpHide）ので、画面の右は体の左（-右）の側で置く
      const k = h.fpRl * u.fpk, ang = 0.6, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      hd.parent.updateWorldMatrix(true, false);
      RB.Head.getWorldPosition(_fpA);
      const dn = u.mounted ? 0.08 : 0.24, ca = Math.cos(ang), sa = Math.sin(ang);
      _fpA.x += fx * 0.7 + fz * 0.16 - fx * ca * 1.02; _fpA.z += fz * 0.7 - fx * 0.16 - fz * ca * 1.02; _fpA.y += 0.075 - dn - sa * 1.02;
      hd.parent.worldToLocal(_fpA);
      dx += (_fpA.x - (hd.position.x + dx)) * k; dy += (_fpA.y - (hd.position.y + dy)) * k; dz += (_fpA.z - (hd.position.z + dz)) * k;
      hd.rotation.x += (-ang - hd.rotation.x) * k;
    }
    hd.position.x += dx; hd.position.y += dy; hd.position.z += dz;
    const off = h.fpOffCache;
    off.dx = dx; off.dy = dy; off.dz = dz;
    off.lx = hd.position.x; off.ly = hd.position.y; off.lz = hd.position.z;
    h.fpOff = off;
  }
  // 技（u.tech）：武器の置き所と向きを、技の型に沿って動かす（腕は armsPose がその握りへ付いて行く）
  if (u.tech && !u.mounted) techHand(u, hd);
  const set = h.gset;
  set[0] = hd.position.x; set[1] = hd.position.y; set[2] = hd.position.z; set[3] = hd.rotation.x;
}
// 一人称で筒を斜めに下げて込める手順（units.js の RELOAD の前半）
const FP_RELOAD = new Set(['lower', 'powder', 'ball', 'ram']);
function gripSet(h, u, hd, w, dt) {
  if (w === 'spear') {
    const g0 = h.grip0 || (h.grip0 = { x: hd.position.x, y: hd.position.y });
    const wp = u.wpn;
    // 待つ・歩く（構えていない）時は槍を立てる
    const still = !(u.spearSupport > 0.01) && !(u.contactBrace > 0.1) && !u.atk && !u.pAtk && !u.isPlayer && !u.swing && !(u.strikeT > 0) && !(u.cheer > 0) && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.sweepT > 0);
    // units.js が槍を立てたまま（駆ける・的を見ている）なら、構えの握り（右手を胸の高さへ振り上げ、左手を柄の先へ）にしない。
    //   立てた柄の先へ左手を伸ばすと、両手が頭の上へ上がった崩れた姿になる（稲生の味方の長柄。10/24）
    const calm = still && hd.rotation.x < -0.4 && (hd.rotation.x < -1.05 || !u.poseTarget?.alive && ((h.spd || 0) < 2.6 || u.spearRear) && (!u.target || u.spearRear));
    h.upK = (h.upK ?? (calm ? 1 : 0)) + ((calm ? 1 : 0) - (h.upK ?? 0)) * Math.min(1, dt * 5);
    const k = h.upK, s = h.seed;
    // 構え：右手は右の腰（体の少し後ろ）、槍は units.js の向きのまま。叩きで振り上げる時は手も上がる
    const raise = Math.max(0, -hd.rotation.x - 0.25) * 0.28;
    const close = u.isPlayer || h.near || u.focusD <= 15;
    // 突き出す時は、右手を柄の線に沿って前へ（穂先の高さのまま一直線に）押し出し、手元を体の真ん中へ絞る
    const ez0 = hd.position.z - 0.18;
    // 踏み込んで腰が沈む分だけ手元も下げる（手が顔の前へ上がらない）
    const sink = h.atkB ? 0.1 * h.atkB.L + 0.05 * h.atkB.W : 0;
    // 二列目の頭越しの構えも、共通のばねでならした高さを一度だけ渡す。
    const ex = 0.2 + (s - 0.5) * 0.03 - Math.max(0, ez0) * 0.12, ey = 1.08 + (s - 0.5) * 0.06 + raise + (u.spLift || 0) + ez0 * Math.sin(-hd.rotation.x) * 0.9 - sink, ez = close ? Math.max(0.22, hd.position.z - 0.16) : hd.position.z - 0.16;
    // 立て槍：右手は胸の右、穂先を少し前へ。歩く・走るほど前へ傾ける
    const mv = Math.min(1, (u.moving || 0) / 1.4);
    // 立てた槍も握り直す：同じ腕の骨と握り合わせを使い、手元を少し上げて戻す
    const regrip = calm && u.idl && u.idl.a === 'regrip' ? Math.sin(clamp01(u.idl.k / u.idl.d) * Math.PI) : 0;
    const ux = 0.23, uy = 1.2 + (s - 0.5) * 0.04 + regrip * 0.055, uz = close ? 0.24 : 0.1, urx = -1.47 + 0.06 * s + 0.25 * mv + regrip * 0.12 + (u.passCarry || 0);
    hd.position.set(ex + (ux - ex) * k, ey + (uy - ey) * k, ez + (uz - ez) * k);
    if (k > 0.001) {
      hd.rotation.x += (urx - hd.rotation.x) * k;
      hd.rotation.y = hd.rotation.y * (1 - k) + (u.passCarry || 0) * .6 * k;
      // 石突が地面の少し上に来るよう、柄の握る所をずらす
      const butt = wp.userData.butt ?? -1.5, sp = Math.sin(-hd.rotation.x);
      const slide = Math.max(-0.3, Math.min(0.9, (0.05 - hd.position.y) / Math.max(0.3, sp) - butt));
      wp.position.z += (slide - wp.position.z) * k;
    }
  } else if (w === 'sword') {
    swordGrip(h, u, hd, dt);
  } else if (w === 'gun' && u.gunPh === undefined && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6) {
    // units.js が込め直しの形を出さない時（下の gunReload）：筒を立てて台尻を地面へ
    hd.rotation.x = -1.45;
    hd.position.y = 0.04 + GUN_BUTT * Math.sin(1.45);
  } else if (w === 'gun' && (u.gunPh === 'ready' || u.gunPh === 'kiri')) {
    // 構え：銃を腰の前に引き寄せる（腕を前へ突き出さない）
    hd.position.z -= 0.09; hd.position.x -= 0.02;
    if (u.lh) { u.lh[0] -= 0.02; u.lh[2] -= 0.09; }
  } else if (w === 'gun' && u.lh && (u.gunPh === 'lower' || u.gunPh === 'powder' || u.gunPh === 'ball' || u.gunPh === 'ram')) {
    // 台尻を地面へ：筒を立てたまま下げる。左手の置き所（u.lh）も同じだけ下げる
    const sp = Math.sin(Math.max(0.3, -hd.rotation.x));
    const dy = Math.min(0, 0.04 + GUN_BUTT * sp - hd.position.y);
    hd.position.y += dy;
    u.lh[1] += dy;
  }
}
// 人をやめる時は、握りを units.js の所へ戻す
function gripReset(h) {
  const u = h.u;
  if (h.grip0 && u.hand) { u.hand.position.x = h.grip0.x; u.hand.position.y = h.grip0.y; h.upK = 0; }
  h.gset[0] = NaN;
}
function rideHuman(h, dt) {
  const u = h.u, B = h.bones;
  const H = u.horse && u.horse.userData.horse;
  // 脚：腿を前へ上げて開き、膝を曲げて鐙へ
  rotWorld(B.RightUpLeg, _right, -0.65); rotWorld(B.LeftUpLeg, _right, -0.65);
  rotWorld(B.RightUpLeg, _fwd, 0.65); rotWorld(B.LeftUpLeg, _fwd, -0.65);
  rotWorld(B.RightLeg, _right, 0.85); rotWorld(B.LeftLeg, _right, 0.85);
  rotWorld(B.RightLeg, _fwd, -0.65); rotWorld(B.LeftLeg, _fwd, 0.65);
  // 腰の高さを鞍へ。馬の背の上下・前後の揺れは、乗り手の入れ物（u.seat）が鞍の骨からそのまま受ける
  const spd = H ? H.speed || 0 : h.spd;
  h.model.position.y = RIDE.y + 0.71 - SRC.rest.Hips.y;
  h.model.position.z = 0;
  // 鞍の傾き（竿立ちで前が上がる）：上体は前へ倒して釣り合いを取る
  const se = u.seat ? u.seat.matrix.elements : null;
  const up = se ? Math.asin(Math.max(-1, Math.min(1, se[9]))) : 0;
  // 鞍の上下の弾みを、上体が遅れて受ける（ばね）：駆けると背が波打ち、頭は静かに保つ
  const sy = se ? se[13] : 0;
  const R = h.rs || (h.rs = { y: sy, v: 0 });
  R.v += ((sy - R.y) * 160 - R.v * 14) * dt; R.y += R.v * dt;
  const bob = Math.max(-0.25, Math.min(0.25, (sy - R.y) * 6));
  // 鞍の弾みは腰と膝でも受け、胴だけが折れる乗り方を避ける。既存の骨を使う。
  const absorb = Math.max(-.06, Math.min(.06, sy - R.y));
  h.model.position.y -= absorb * .45;
  rotWorld(B.RightLeg, _right, bob * .12); rotWorld(B.LeftLeg, _right, bob * .12);
  rotWorld(B.RightUpLeg, _right, -bob * .06); rotWorld(B.LeftUpLeg, _right, -bob * .06);
  // 上体：速いほど前へ、曲がる時は内へ、止まる時は後ろへ体を残す
  const charge = u.charging ? 0.12 : 0;
  const lean = Math.min(0.1, spd * 0.01) + charge - Math.min(0.2, (h.decel || 0) * 0.25) + Math.max(0, up) * 0.55;
  rotWorld(B.Spine, _right, lean + bob * 0.5);
  rotWorld(B.Spine2, _right, -bob * 0.35);
  rotWorld(B.Spine, _fwd, -(h.turn || 0) * 0.25);
  // 胸が揺れを受けても兜は遅れて戻る。重い具足の上体と視線を分ける。
  rotWorld(B.Neck, _right, -bob * .12);
  // 駆ける時は鐙に立つ：膝で弾みを吸い、腰を鞍から浮かせて前へ。頭の高さはほとんど動かさない（名のある武将と本人は深く、兵は浅く）
  const named = isNamed(h.look) || u.isPlayer;
  const stand = clamp01((spd - 5) / 4) * (named ? 1 : 0.6);
  h.stand = (h.stand || 0) + (stand - (h.stand || 0)) * Math.min(1, dt * 3);
  if (h.stand > 0.01) {
    const st = h.stand;
    h.model.position.y += 0.1 * st - bob * 0.05 * st;
    rotWorld(B.RightLeg, _right, -0.4 * st); rotWorld(B.LeftLeg, _right, -0.4 * st);
    rotWorld(B.RightUpLeg, _right, 0.25 * st); rotWorld(B.LeftUpLeg, _right, 0.25 * st);
    // 本人は襲歩で鞍の上に低く伏せ、首だけ起こして前を見る（後ろから背が大きく見える）
    const dive = u.isPlayer ? clamp01((spd - 8) / 3) : 0;
    rotWorld(B.Spine, _right, (0.1 + 0.14 * dive) * st);
    rotWorld(B.Neck, _right, -(0.12 + 0.12 * dive) * st);
  }
  // 武将の背筋：並足・止まっている時は腰を据えて背を立て、胸を張る（兵より姿勢が良い）
  if (named && !u.isPlayer) { const k = 1 - h.stand; rotWorld(B.Spine1, _right, -0.05 * k); rotWorld(B.Spine2, _right, -0.04 * k); }
  // 首を立てて顎を引く：馬上で首だけ前へ突き出すと、兜の重さで背を丸めた荷物に見える（測ると首が前へ 27 度）
  if (!u.isPlayer) rotWorld(B.Neck, _right, -0.2 * (1 - 0.5 * h.stand));
}
// 突き・振りの体：W 溜め（引いて腰を落とし、後ろ足に乗る）・L 突き出し／振り下ろし（前へ踏み込み、腰を切る）。
// どちらもならして（一コマで跳ばない）骨に重ねる。馬上は踏み込む代わりに鐙に立ち、上から突き・払う
// ---- 槍捌き・刀捌きの技（名前で呼ぶ：startTech(兵, '名前')） ----
// 型は時刻ごとの鍵：[時(0〜1), 手の置き所のずれ x・y・z（m、体の座標）, 武器の向きのずれ rx（負で穂先・切っ先が上）・ry（横へ振る）・rz（刃の傾き）,
//                    （槍の rx は構え（穂先を少し上げた形）からのずれ）胸のひねり tw（正で左へ）, 反り lean（正で前へ折る）, 腰の沈み drop（m）]。鍵の間は滑らかにつなぐ
const TECH = {
  // 二段突きから払い（名は元のまま。頭上で回さない）：腰を落として手元を引き、真っ直ぐ突いて速く繰り込み、
  //   もう一度突き、そのまま穂先を低く右から左へ払って中段へ戻す。突きごとに一瞬とどめる
  yari_mawashi: { dur: 1.5, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.1, 0, 0.02, -0.18, -0.08, 0, 0, 0.18, -0.06, 0.06], [0.2, 0, -0.04, 0.32, 0.04, 0, 0, -0.16, 0.16, 0.1], [0.26, 0, -0.04, 0.32, 0.04, 0, 0, -0.16, 0.16, 0.1], [0.36, 0, 0.02, -0.16, -0.06, 0, 0, 0.16, -0.04, 0.07], [0.46, 0, -0.04, 0.34, 0.05, 0, 0, -0.18, 0.18, 0.11], [0.52, 0, -0.04, 0.34, 0.05, 0, 0, -0.18, 0.18, 0.11], [0.62, 0.12, -0.06, 0, 0.6, 0.8, 0, -0.4, 0.08, 0.08], [0.8, -0.18, -0.08, 0.06, 0.66, -1.0, 0, 0.5, 0.18, 0.1], [0.86, -0.18, -0.08, 0.06, 0.66, -1.0, 0, 0.5, 0.18, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 払う：穂先を低く、右から左へ大きく薙ぎ払う（足を払う）。腰を落とし、胸を回し切る
  yari_harai: { dur: 0.8, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.25, 0.15, -0.05, -0.05, 0.75, 0.9, 0.2, -0.5, 0.1, 0.06], [0.6, -0.2, -0.1, 0.1, 0.8, -1.1, -0.2, 0.6, 0.2, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 叩き下ろす：穂先を高く振り上げ（体を反らす）、全身で打ち下ろす（腰を沈め、前へ折る）。打った後は一瞬とどめる
  yari_tataki: { dur: 0.95, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.4, 0, 0.45, -0.15, -0.9, 0, 0, 0.1, -0.2, 0], [0.55, 0, -0.05, 0.2, 0.7, 0, 0, -0.05, 0.3, 0.12], [0.75, 0, -0.05, 0.2, 0.66, 0, 0, 0, 0.28, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 石突きで突く：槍を回さず、穂先を肩の上へ立てて手元を前下へ押し、石突きで短く鋭く突き込む（詰め寄った敵へ）
  yari_ishizuki: { dur: 0.9, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.3, 0, 0.12, -0.14, -0.95, 0, 0, 0.18, -0.04, 0.04], [0.42, 0, -0.08, 0.26, -1.0, 0, 0, -0.12, 0.18, 0.09], [0.52, 0, -0.08, 0.26, -1.0, 0, 0, -0.12, 0.18, 0.09], [0.72, 0, 0.06, -0.06, -0.6, 0, 0, 0.06, 0.02, 0.04], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 刀の連続斬り：袈裟（右上から左下）→ 逆袈裟（左下から右上）→ 横一文字。一太刀ごとに踏み込み、胸を切り返す
  //   振りかぶりは小さく（手を頭の上まで上げない）、一太刀ごとに振り終わりで一呼吸とどめる
  katana_renzan: { dur: 1.3, w: 'sword', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.12, 0.12, 0.28, -0.06, -1.0, 0.3, -0.6, -0.4, -0.1, 0], [0.3, -0.2, -0.1, 0.25, 0.7, -0.4, 0.6, 0.45, 0.25, 0.1], [0.5, 0.2, 0.3, 0.1, -0.9, 0.5, 0.9, -0.35, 0, 0.05], [0.65, 0.25, 0.1, 0.1, -0.2, 0.9, 1.5, -0.5, 0.05, 0.06], [0.85, -0.25, 0.1, 0.25, -0.2, -0.9, 1.5, 0.55, 0.15, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 切り返し：真っ向から斬り下ろし、下で手首を返して刃を上へ向け、下から斬り上げる（間を空けずに）。
  //   刀は回さない：返した刃は斬り上げの後、手首を戻して構えの向きへ（一回りさせない）
  katana_kaeshi: { dur: 0.9, w: 'sword', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.2, 0, 0.32, -0.06, -1.0, 0, 0, 0, -0.1, 0], [0.4, 0, -0.15, 0.25, 0.8, 0, 0, 0, 0.3, 0.12], [0.52, 0, -0.16, 0.25, 0.82, 0, 2.6, 0, 0.3, 0.12], [0.72, 0.1, 0.32, 0.15, -1.0, 0.2, 2.6, -0.25, -0.1, 0.04], [0.82, 0.1, 0.3, 0.15, -0.95, 0.2, 2.5, -0.25, -0.1, 0.04], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
};
const TECH_OF = { spear: ['yari_mawashi', 'yari_harai', 'yari_tataki', 'yari_ishizuki'], sword: ['katana_renzan', 'katana_kaeshi'] };
const GOU_TECH = { spear: ['yari_mawashi', 'yari_mawashi', 'yari_harai', 'yari_tataki'], sword: ['katana_renzan', 'katana_renzan', 'katana_kaeshi'] };
const TECH_NAMES = Object.keys(TECH);
// 技を出す（兵 u、技の名前）。返す物：技の長さ（秒。知らない名前・馬上なら 0）。体の動きの形だけで、当たりは呼ぶ側が決める
function startTech(u, name) {
  const T = TECH[name];
  if (!T || !u || !u.alive || u.mounted) return 0;
  u.tech = { k: name, t: 0 };
  return T.dur;
}
function techDur(name) { return TECH[name] ? TECH[name].dur : 0; }
const _tk = new Float32Array(9);
function techAt(u) {
  const T = TECH[u.tech.k], K = T.keys, q = clamp01(u.tech.t / T.dur);
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= q) i++;
  const a = K[i], b = K[i + 1], f = clamp01((q - a[0]) / Math.max(1e-4, b[0] - a[0])), e = f * f * (3 - 2 * f);
  for (let j = 0; j < 9; j++) _tk[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * e;
  return _tk;
}
function techHand(u, hd) {
  const k = techAt(u);
  hd.position.x += k[0]; hd.position.y += k[1]; hd.position.z += k[2];
  hd.rotation.x += k[3]; hd.rotation.y += k[4]; hd.rotation.z += k[5];
}
function techBody(h, B, u) {
  const k = techAt(u);
  if (k[6]) { rotWorld(B.Spine, _up, k[6] * 0.35); rotWorld(B.Spine1, _up, k[6] * 0.4); rotWorld(B.Neck, _up, -k[6] * 0.5); }
  if (k[7]) { rotWorld(B.Spine, _right, k[7] * 0.5); rotWorld(B.Spine1, _right, k[7] * 0.4); }
  if (k[8]) {
    rotWorld(B.LeftUpLeg, _right, -k[8] * 3); rotWorld(B.LeftLeg, _right, k[8] * 4);
    rotWorld(B.RightUpLeg, _right, k[8] * 1.2); rotWorld(B.RightLeg, _right, k[8] * 3);
    rotWorld(B.LeftUpLeg, _fwd, -k[8] * 1.2); rotWorld(B.RightUpLeg, _fwd, k[8] * 1.2);
    h.model.position.y -= k[8];
  }
}
function atkPhase(u, w, out) {
  let W = 0, L = 0, tw = 0;
  const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk;
  // 溜めはゆっくり（出だしと溜め切りを柔らかく）
  if (a && (a.dur || u.windup)) { W = clamp01(1 - Math.max(0, a.t) / (a.dur || u.windup)); W = W * W * (3 - 2 * W); }
  const sw = u.swing;
  if (sw && sw.t < sw.dur + 0.3) {
    const p = sw.t / Math.max(0.05, sw.dur);
    if (w === 'spear' && (sw.kind === 'thrust' || sw.kind === 'charge')) L = thrustOut(p, sw.dur, !u.mounted && (u.wpn?.userData.spec?.L ?? 9) < 4.2 ? 0.1 : !u.mounted && (u.isPlayer || u.focusD <= 15) ? 0.14 : 0.26);
    else if (w === 'spear' && sw.kind === 'hook') {
      // 引き倒し：突きで踏み込み、引く時は腰を落として後ろ足へ体を預ける
      const x = clamp01(p / 0.35), y = clamp01((p - 0.4) / 0.45), r = clamp01((sw.t - sw.dur) / 0.3);
      L = (x * x * (3 - 2 * x) * (1 - y) - 0.3 * y * y * (3 - 2 * y)) * (1 - r * r * (3 - 2 * r));
    } else {
      // 振り抜いたら残心（一呼吸とどめる）、それから中くらいの速さで構えへ
      const q = clamp01(p), r = clamp01((sw.t - sw.dur - 0.08) / 0.22);
      L = p <= 1 ? Math.sin(Math.min(1, q * 1.3) * Math.PI / 2) : 1 - r * r * (3 - 2 * r); tw = (sw.side || 1) * (q < 0.3 ? -q / 0.3 : -1 + 2 * Math.min(1, (q - 0.3) / 0.6)) * (1 - r * r * (3 - 2 * r)); }
    W = 0;
  } else if (u.strikeT > 0 && u.isPlayer) L = Math.sin((1 - u.strikeT / 0.2) * Math.PI);
  if (u.sweepT > 0) { L = Math.max(L, Math.sin((1 - u.sweepT / 0.35) * Math.PI) * 0.7); tw = Math.sin((1 - u.sweepT / 0.35) * Math.PI * 2) * 0.8; }
  out.wantW = W; out.wantL = L; out.wantTw = tw;
}
// 刀の扱い：刃筋・残心・鎬の受け・馬上の片手斬り（units.js の手の置き所と向きに、ずれを足す）
//   振る間：刃（刀の下の側）を振る向きへ向ける。袈裟は刀を斜めに寝かせ、真っ向は立てたまま（刃筋が通る）
//   振り抜いた後：切っ先を少し下げて一呼吸とどめる（残心）
//   受け：刀を斜めに立て、刃でなく鎬（刀の側面の稜）を相手の太刀へ当てる
//   馬上：片手で、体の横へ大きく斬り下ろす。振り抜きで手首を返す
function swordGrip(h, u, hd, dt) {
  const S = h.swd || (h.swd = { roll: 0, guard: 0, zan: 0, t: 0 });
  const sw = u.swing;
  let roll = 0, zan = 0, pitch = 0, side = 0;
  if (sw) {
    const p = sw.t / Math.max(0.05, sw.dur), sd = sw.side || 0;
    // 袈裟・逆袈裟（side が左右）は刀を寝かせ、真っ向（0）は立てる。振り出しから振り抜きへ、手首を返して刃筋を合わせる
    roll = sd * (0.55 + 0.25 * Math.min(1, p));
    if (p > 1) zan = Math.min(1, (p - 1) * 3) * (1 - clamp01((sw.t - sw.dur - 0.35) / 0.25));
    if (u.mounted) { side = (sd || 1) * 0.22 * Math.sin(Math.min(1, p) * Math.PI); pitch = 0.3 * Math.sin(clamp01(p) * Math.PI); }
  }
  const g = u.guard || u.guardFlash > 0 || u.guarding > 0 ? 1 : 0;
  const k = Math.min(1, dt * 14);
  S.roll += (roll - S.roll) * k; S.zan += (zan - S.zan) * k; S.guard += (g - S.guard) * Math.min(1, dt * 12);
  hd.rotation.z += S.roll;
  // 残心：切っ先を少し下げ、腕を伸ばしたまま
  hd.rotation.x += 0.28 * S.zan; hd.position.z += 0.05 * S.zan;
  // 鎬で受ける：刀を斜めに立て、刃を外へ、鎬を相手へ（手は胸の前、少し上）
  if (S.guard > 0.01 && !sw) {
    const gk = S.guard, sd = h.seed > 0.5 ? 1 : -1;
    hd.rotation.x += (-1.05 - hd.rotation.x) * gk; hd.rotation.z += (0.75 * sd - hd.rotation.z) * gk;
    hd.position.y += 0.14 * gk; hd.position.x -= 0.06 * gk; hd.position.z += 0.06 * gk;
  }
  // 馬上の片手斬り：体の横へ手を出し、振り抜きで手首を返す
  if (u.mounted && sw) { hd.position.x += side; hd.rotation.x += pitch; hd.rotation.z += side * 1.8; }
  if (!sw && S.guard < 0.01 && Math.abs(S.roll) < 0.01 && S.zan < 0.01 && u.mounted) h.swd = null;
}
// 速さを持ったばね（army_anim.js の spr2 と同じ）：目当てへ行き過ぎずに寄せ、速さが一コマで跳ばない
function spr2(s, k, to, w, dt) {
  const vk = 'v' + k, y = s[k] - to, v = s[vk] || 0, e = Math.exp(-w * dt), c = (v + w * y) * dt;
  s[k] = to + (y + c) * e; s[vk] = (v - w * c) * e;
}
function attackBody(h, B, u, w, dt) {
  const A = h.atkB || (h.atkB = { W: 0, L: 0, t: 0, R: 0 });
  atkPhase(u, w, A);
  let W = A.wantW; const L = A.wantL, tw = A.wantTw;
  // 振り出す間は、溜めの形を打ちの伸びと入れ替えて解く（溜めが一コマで消えて体が跳ねない）
  if (u.swing && u.swing.t < u.swing.dur) W = Math.min(A.W, 1 - L);
  // 速さを持ったばねで寄せる（溜め→踏み込み→戻り→次の踏み込みで、腰と足が一コマで跳ばない）
  spr2(A, 'W', W, 30, dt); spr2(A, 'L', L, 34, dt); spr2(A, 't', tw, w === 'spear' ? 22 : 26, dt);
  // 受け止められた一撃は、その当たりの時計で腰を引き、後ろ足へ重さを戻す。
  // 手の止まりに体が追い越さない。近い徒歩だけ、既存の骨とばねを使う。
  const sw = u.swing;
  let resist = 0;
  if (HUM.fx && !h.far && !u.isPlayer && !u.mounted && !u.hit && !u.downed && !reduceMotion()
    && sw?.done && (sw.res === 'block' || sw.res === 'armor')) {
    const age = Math.max(0, sw.t - sw.dur * (sw.at || 0));
    resist = ease(0, 0.07, age) * (1 - ease(0.1, 0.32, age)) * (sw.res === 'block' ? 1 : 0.55);
  }
  if (A.R === undefined) A.R = 0;
  if (resist > 0 || A.R > 0.001 || Math.abs(A.vR || 0) > 0.001) spr2(A, 'R', resist, 32, dt);
  else A.R = 0;
  const r0 = !h.far && !u.isPlayer && !u.mounted && !u.hit && !u.downed && !reduceMotion() ? Math.max(0, A.R) : 0;
  // 録った斬り・突きが腰と脚を受け持つ分だけ、作った溜めと踏み込みを弱める（二重に沈まない）
  const mk = 1 - 0.65 * (h.mcAtk || 0);
  const w0 = Math.max(0, A.W) * mk, l0 = Math.max(-0.35, A.L * (1 - 0.7 * r0)) * mk, t0 = A.t * mk;
  if (w0 < 0.01 && Math.abs(l0) < 0.01 && Math.abs(t0) < 0.01 && r0 < 0.01) return;
  if (u.mounted) {
    // 馬上：溜めでは上体を引き、突き・振りでは鐙に立って腰を浮かせ、上から前へ体を預ける
    // 勝家ら豪傑は馬上でも鐙を踏み、胸を大きく返す。技の速さ・間合い・威力は変えず姿だけに差を出す。
    const gou = !u.isPlayer && (u.look?.style === 'gouketsu' || u.look?.style === 'gouketsu_thrust'), power = gou ? 1.5 : 1;
    h.model.position.y += (0.1 * l0 - 0.02 * w0) * power;
    rotWorld(B.RightLeg, _right, -0.45 * l0 * power); rotWorld(B.LeftLeg, _right, -0.45 * l0 * power);
    rotWorld(B.Spine, _right, (0.22 * l0 - 0.1 * w0) * power);
    rotWorld(B.Spine1, _up, ((w === 'spear' ? 0.25 * w0 - 0.2 * l0 : 0) - t0 * 0.3) * power);
    return;
  }
  const sp = w === 'spear';
  // 長島の勝家・利家と手取川の利家。槍を回す代わりに、足を据えた突きの溜めと腰の返しを強くする。
  // 骨の姿だけを動かし、当たり判定・踏み込みの移動量・速さには触れない。
  if (sp && !u.isPlayer && (u.look?.style === 'gouketsu_thrust' || u.look?.spearThrust && u.look.style === 'gouketsu')) {
    h.model.position.y -= 0.035 * (w0 + Math.abs(l0));
    rotWorld(B.RightLeg, _right, 0.12 * w0);
    rotWorld(B.Hips, _up, 0.08 * w0 - 0.1 * l0);
    rotWorld(B.Spine1, _up, 0.1 * w0 - 0.09 * l0);
  }
  // 溜め：腰を落とし、上体を少し引いて後ろ（右）足に乗る。槍は右の肩を引いて胸を開く
  h.model.position.y -= 0.06 * w0 + 0.075 * Math.abs(l0);
  h.model.position.z -= 0.045 * w0;
  // 刀は右足が前なので、溜めで乗る後ろ足・踏み込む前足を左右入れ替える（剣術の中段・右足の踏み込み）
  const rl = w === 'sword', FU = rl ? B.RightUpLeg : B.LeftUpLeg, FL = rl ? B.RightLeg : B.LeftLeg, BU = rl ? B.LeftUpLeg : B.RightUpLeg, BL = rl ? B.LeftLeg : B.RightLeg;
  rotWorld(BU, _right, -0.2 * w0); rotWorld(BL, _right, 0.35 * w0);
  rotWorld(B.Spine, _right, -0.08 * w0 + (sp ? 0.12 : 0.07) * l0);   // 背は立てたまま、腰ごと前へ出る（頭から突っ込まない）
  if (sp) {
    // 長い柄を後ろ足と腰で支え、腰から押して胸が遅れてついて来る。
    rotWorld(B.Hips, _up, 0.12 * w0 - 0.2 * l0);
    rotWorld(B.Spine1, _up, 0.22 * w0 - 0.18 * l0);
    rotWorld(B.Spine2, _right, 0.035 * w0 + 0.04 * Math.abs(l0));
    rotWorld(B.Neck, _up, -0.18 * w0 + 0.2 * l0);
  }
  // 侍の素槍：腰を一段落とし、前の膝を深く折って真っ直ぐ突く（上体は前へ倒さず、腰ごと出る）
  if (sp && (u.wpn?.userData.spec?.L ?? 9) < 4.2) {
    const d = Math.max(0, l0);
    h.model.position.y -= 0.05 * d;
    rotWorld(B.LeftUpLeg, _right, -0.14 * d); rotWorld(B.LeftLeg, _right, 0.2 * d);
    rotWorld(B.Spine, _right, -0.05 * d);
  }
  // 突き出し・振り下ろし：後ろ足で地を押して前へ踏み込む（前の左足は膝を曲げ、後ろの右足は伸びる）
  h.model.position.z += (sp ? 0.22 : 0.12) * l0;
  rotWorld(FU, _right, -0.4 * l0); rotWorld(FL, _right, 0.5 * l0);
  rotWorld(BU, _right, 0.3 * l0); rotWorld(BL, _right, -0.18 * Math.max(0, l0) * clamp01(h.stance || 0));
  rotWorld(rl ? B.LeftFoot : B.RightFoot, _right, 0.12 * Math.max(0, l0));
  if (r0 > 0.01) {
    h.model.position.z -= 0.085 * r0; h.model.position.y -= 0.035 * r0;
    rotWorld(BU, _right, -0.12 * r0); rotWorld(BL, _right, 0.26 * r0);
    rotWorld(B.Spine, _right, -0.1 * r0); rotWorld(B.Spine1, _up, 0.1 * r0);
    rotWorld(B.Neck, _up, -0.08 * r0);
  }
  // 刀：肩から腰を回して振る（腰が先、胸が後から付いて来る）
  if (!sp && Math.abs(t0) > 0.01) { rotWorld(B.Hips, _up, -t0 * 0.16); rotWorld(B.Spine1, _up, -t0 * 0.24); rotWorld(B.Spine2, _up, -t0 * 0.08); rotWorld(B.Neck, _up, t0 * 0.3); }
}
// 受け：腰を落として備え、当たりを後ろ足で受け、胸から遅れて構えに戻る。
function guardBody(h, B, u, dt) {
  // 手元の備えと同じ量で胸と後ろ膝を引く。実際の防御・被弾の反応を優先する。
  const cover = !h.far && !u.hit && !u.atk && !u.swing ? (u.contactCover || 0) : 0;
  const wanted = u.guard || u.guardFlash > 0 || u.guarding > 0 ? 1 : cover * 0.75;
  h.guardK = (h.guardK || 0) + (wanted - (h.guardK || 0)) * (1 - Math.exp(-dt * (wanted ? 12 : 5)));
  const g = h.guardK * (1 - clamp01(h.atkB ? h.atkB.L : 0));
  const hit = u.hit;
  const recoil = hit && hit.res === 'block' ? Math.sin(ease(0, 0.22, hit.t / Math.max(0.05, hit.dur || 0.4)) * Math.PI / 2) * (1 - ease(0.22, 1, hit.t / Math.max(0.05, hit.dur || 0.4))) : 0;
  if (g + recoil < 0.01) return;
  // 当たりを受ける後ろ足：刀は右足が前なので左足、ほかは右足
  const rl = (u.wpnKind || u.lookWeapon) === 'sword' && !u.mounted;
  rotWorld(rl ? B.LeftUpLeg : B.RightUpLeg, _right, -0.16 * g - 0.08 * recoil);
  rotWorld(rl ? B.LeftLeg : B.RightLeg, _right, 0.28 * g + 0.18 * recoil);
  rotWorld(rl ? B.RightUpLeg : B.LeftUpLeg, _right, -0.06 * g);
  rotWorld(rl ? B.RightLeg : B.LeftLeg, _right, 0.18 * g);
  rotWorld(B.Spine, _right, -0.06 * g - 0.1 * recoil);
  rotWorld(B.Spine2, _right, 0.025 * g - 0.05 * recoil);
  rotWorld(B.Neck, _right, 0.05 * g);
  h.model.position.y -= 0.035 * g + 0.025 * recoil;
  h.model.position.z -= 0.035 * recoil;
  if (cover > 0.01) {
    rotWorld(B.Spine1, _up, (u.id % 2 ? 0.1 : -0.1) * cover);
    rotWorld(B.Neck, _up, (u.id % 2 ? -0.08 : 0.08) * cover);
  }
}

// 草摺・袖の揺れ（ばね）
// 支点（体の座標）：草摺は腰、袖は肩、陣羽織は肩の下、母衣は背の上
const PIVOT = { hips: [0, 0.9, 0.0], sodeP: [0.2, 1.43, 0], sodeN: [-0.2, 1.43, 0], haori: [0, 1.42, -0.1], back: [0, HORO_TOP, HORO_BACK], pole: [0, 1.1, -0.21] };
const SWAY_K = { hips: 0.5, sodeP: 0.8, sodeN: 0.8, haori: 0.9, back: 1.1, pole: 0.45 };
const _pv3 = new THREE.Matrix4();
const _pr = new THREE.Matrix4();
const _sm = new THREE.Matrix4();
const _hgM = new THREE.Matrix4();
const HANG_K = 0.85;
function sway(h, dt) {
  const u = h.u;
  // 上下の弾み（歩み・駆け足・馬の背）と、前後の速さの変わり、曲がる速さ。高さは世界の座標で（馬上は鞍の揺れも入る）
  const yNow = h.model.matrixWorld.elements[13];
  const s = h.sw || (h.sw = { a: 0, va: 0, b: 0, vb: 0, py: yNow, ps: 0 });
  const vy = dt > 0 ? (yNow - s.py) / dt : 0; s.py = yNow;
  const acc = dt > 0 ? (h.spd - s.ps) / dt : 0; s.ps = h.spd;
  // 目標の角度へばねで寄る（遅れて揺れる）。弾みが大きいほど大きく
  // 風：体の前後・左右に分けて、垂れた布（陣羽織・草摺・袖）を風下へ押し、突風で細かく震わせる
  const wg = Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1)), wr = WIND_STATE.dirX * _right.x + WIND_STATE.dirZ * _right.z, wf = WIND_STATE.dirX * _fwd.x + WIND_STATE.dirZ * _fwd.z;
  const wfl = Math.sin((h.clock || 0) * 3.3 + h.seed * 7) * 0.6 + Math.sin((h.clock || 0) * 5.9 + h.seed * 3) * 0.4;
  // 突き戻しの重心も同じばねへ渡し、止まって戦う兵の草摺・袖が腰から遅れて戻る。
  const contactCloth = reduceMotion() || !u.alive || u.mounted ? 0 : (u.contactDrive || 0) * 0.075 - (u.contactLoad || 0) * 0.045;
  const want = Math.max(-0.4, Math.min(0.4, -vy * 0.07 - acc * 0.02 + Math.min(0.25, h.spd * 0.025) + wf * 0.035 * wg + wfl * 0.012 * wg + contactCloth));
  const k = Math.min(dt, 1 / 30);
  s.va += ((want - s.a) * 90 - s.va * 8) * k; s.a += s.va * k;
  // 横から受けた力も袖と草摺へ遅れて伝える。風だけで同時に揺れる板にしない。
  const receiveSide = !reduceMotion() && u.alive && !u.mounted
    ? (u.contactParrySide || 0) * 0.065 + (u.contactStop || 0) * (u.id % 2 ? 0.035 : -0.035) : 0;
  const wantB = Math.max(-0.3, Math.min(0.3, (h.turn || 0) * 0.12 + wr * 0.07 * wg * (1 + 0.35 * wfl) + Math.sin(h.runPh || 0) * 0.09 * (u.mounted || !u.alive ? 0 : h.runW || 0) + receiveSide));
  s.vb += ((wantB - s.b) * 60 - s.vb * 7) * k; s.b += s.vb * k;
  // 母衣のふくらみ：止まるとしぼんで垂れ、駆けると風をはらんで後ろへなびく（0..1。ふくらむのは速く、しぼむのはゆっくり）
  const infW = Math.max(0, Math.min(1, (h.spd - 1.2) / 5.5));
  s.inf = (s.inf ?? infW) + (infW - (s.inf ?? infW)) * Math.min(1, k * (infW > (s.inf ?? 0) ? 3 : 1.2));
  // 陣羽織は胸の骨に付くので、胸が前へ屈むと裾が板のように後ろへ跳ね上がる。胸の傾き（立ち姿から）の分だけ裾を戻し、下へ垂らす
  let hang = 0;
  if (h.parts.haori || h.parts.back || (h.xb && (h.xb.swHaori || h.xb.swBack))) {
    const sp = h.bones && h.bones.Spine2;
    if (sp) {
      const e = _hgM.copy(h.model.matrixWorld).invert().multiply(sp.matrixWorld).elements, r = restMatrix('Spine2').elements;
      hang = Math.max(-0.7, Math.min(0.7, Math.atan2(e[6], e[5]) - Math.atan2(r[6], r[5]))) * HANG_K;
    }
  }
  for (const key in PIVOT) {
    // 岩村で横へ落とした竿は、背の形と二重に出さない。
    if (key === 'pole' && (u.iwaFlagRig || u.tennojiFlagRig)) {
      if (h.xb?.swPole) h.xb.swPole.matrix.makeScale(0, 0, 0);
      if (h.parts.pole) h.parts.pole.visible = false;
      continue;
    }
    const [x, y, z] = PIVOT[key], K = SWAY_K[key];
    // 前へ出る向きの揺れは袖・草摺は小さく、後ろへなびく物（陣羽織・母衣）は大きく
    let ax = key === 'haori' || key === 'back' ? -Math.abs(s.a) * K - 0.02 - (key === 'back' ? s.inf * 0.35 : 0) : s.a * K;
    // 桶狭間の竹籠は背に沿わせる。駆けても裾を後ろへ大きく跳ね上げない。
    const ovalHoro = key === 'back' && h.look.longHoro;
    if (ovalHoro) ax = Math.max(-0.06, -Math.abs(s.a) * 0.15 - 0.01);
    // 背に結んだ布も胸の傾きを戻し、馬上で前屈しても裾は下へ垂らす。
    if (key === 'back' && !ovalHoro) ax = hang - Math.min(0.16, Math.abs(s.a) * 0.4 + s.inf * 0.08);
    // 胴を包む短い上着は胸に沿わせる。背だけを大きく跳ね上げるマントの動きにしない。
    if (key === 'haori') ax = reduceMotion() ? 0 : Math.max(-0.035, -Math.abs(s.a) * 0.12);
    // 倒れた陣羽織は根元の傾きにも沿わせ、裾が空へ張り出すのを抑える。
    const fallenCloth = !u.alive && !u.mounted && key === 'haori';
    if (fallenCloth) ax = hang - Math.sin(u.mesh.rotation.x) * 0.18;
    // 指物の竿：駆けると風を受けて後ろへしなり、風上を向けば押し返される（馬上は大きく）
    if (key === 'pole') ax += -Math.min(0.3, h.spd * 0.03) * (u.mounted ? 1 : 0.4) + wf * 0.05 * wg + (u.mounted && h.spd > 6 ? Math.sin((h.clock || 0) * 14.5 + h.seed * 5) * Math.min(0.05, (h.spd - 6) * 0.01) : 0);   // 駆ける馬上では、蹄の拍子で竿が細かく震える
    // 指物をそろえる戦では、受筒から上の竿だけは真っ直ぐに保つ。
    const straightPole = key === 'pole' && u.look.straightFlag;
    _pr.makeRotationFromEuler(_eu.set(straightPole ? 0 : ax, 0, fallenCloth ? -Math.sin(u.mesh.rotation.z) * 0.18 : straightPole || key === 'haori' && h.look.nanban && reduceMotion() ? 0 : s.b * (ovalHoro ? 0.2 : key === 'back' ? 1 : 0.5)));
    // 吊った袖は腕が押した分だけ外へ開く。胸と一体の箱のまま腕を貫かせない。
    // 骨の既存の行列を読み、肩の支点・形・材質は共用する。
    if (!h.far && u.alive && (key === 'sodeP' || key === 'sodeN')) {
      const positive = key === 'sodeP', left = (SRC.rest.LeftArm.x > 0) === positive;
      const shoulder = h.bones[left ? 'LeftArm' : 'RightArm']?.matrixWorld.elements;
      const elbow = h.bones[left ? 'LeftForeArm' : 'RightForeArm']?.matrixWorld.elements;
      if (shoulder && elbow) {
        const dx = elbow[12] - shoulder[12], dy = elbow[13] - shoulder[13], dz = elbow[14] - shoulder[14];
        const len = Math.max(.01, Math.hypot(dx, dy, dz));
        const out = Math.max(0, (dx * _right.x + dy * _right.y + dz * _right.z) * (positive ? 1 : -1) / len);
        const forward = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / len;
        _pr.multiply(m0.makeRotationZ((positive ? 1 : -1) * Math.min(.55, out * .65)));
        _pr.multiply(m0.makeRotationX(Math.max(-.3, Math.min(.3, forward * .35))));
      }
    }
    if (u.tennojiGrounded && (!u.alive || u.dying) && (key === 'sodeP' || key === 'sodeN')) _pr.makeRotationFromEuler(_eu.set(-.1, 0, key === 'sodeP' ? -.18 : .18));
    if (key === 'back') {
      // 竹の輪の寸法は保ち、布のたるみだけ小さく揺らす。風船のような膨張を避ける。
      const f = s.inf;
      const flap = reduceMotion() ? 0 : (0.004 + f * 0.006) * wg * wfl;
      _pr.multiply(m0.makeScale(1 + flap * 0.3, 1, 0.98 + 0.02 * f + flap));
    }
    if (h.xb) {
      // まとめた形：揺れる部品の骨を回す（体の座標の支点のまわり → 親の骨の座標へ）
      const bn = h.xb[PART_BONE[key]], par = XB[PART_BONE[key]];
      const Rm = restMatrix(par), Ri = restInverse(par);
      _sm.copy(SRC.fitT).multiply(_pv3.makeTranslation(x, y, z)).multiply(_pr).multiply(m1.makeTranslation(-x, -y, -z)).multiply(SRC.fitTi);
      bn.matrix.copy(Ri).multiply(_sm).multiply(Rm);
      continue;
    }
    const p = h.parts[key];
    if (!p) continue;
    const m0_ = p.userData.m0 || (p.userData.m0 = p.matrix.clone());
    p.matrix.copy(m0_).multiply(_pv3.makeTranslation(x, y, z)).multiply(_pr).multiply(m1.makeTranslation(-x, -y, -z));
  }
  if (((h.xb && h.xb.swK0) || h.kzMesh) && !h.look.sohei) kusazuri(h, s, k, vy);
}
// 草摺の板：一枚ずつ、腰の上の縁を支点に外へ開く角度をばねで動かす
// 膝がその板の裾より外へ出れば（歩み・踏み込み・膝つき）板は押し開かれ、体の弾みと向きの変わりで遅れて揺れる
const _kA = new THREE.Vector3();
const _kH = new THREE.Vector3();
const _kN = new THREE.Vector3();
const _kT = new THREE.Vector3();
function kusazuri(h, s, k, vy) {
  const B = h.bones, KP = kusaPlates(h.look);
  const P = h.kz || (h.kz = { a: new Float32Array(KP.np), v: new Float32Array(KP.np) });
  B.Hips.getWorldPosition(_kH);
  const knees = [B.LeftLeg, B.RightLeg];
  const R0 = 0.21, R1 = 0.25, L = 0.27;
  for (let i = 0; i < KP.np; i++) {
    const c = KP.c(i), sc = Math.sin(c), cc = Math.cos(c);
    _kN.copy(_right).multiplyScalar(sc).addScaledVector(_fwd, cc);
    let push = 0;
    if (k > 0) for (const kn of knees) {
      kn.getWorldPosition(_kA).sub(_kH);
      const d = _kA.dot(_kN), drop = Math.max(0.1, -_kA.y);
      // 膝が板の裾より外なら、その分だけ開く（膝の高さまでの板の長さで角度に）
      push = Math.max(push, Math.atan2(Math.max(0, d - R1 * 0.8), Math.min(L, drop)));
    }
    // 体の弾みと前後の揺れ（全体の揺れ s.a の前後の成分）、板ごとに少しずつ違う
    const want = Math.min(0.9, push * 1.1) + s.a * 0.5 * cc - vy * 0.02 * (0.7 + 0.3 * ((i * 0.37 + h.seed) % 1));
    P.v[i] += ((want - P.a[i]) * 140 - P.v[i] * 10) * k; P.a[i] += P.v[i] * k;
    const a = Math.max(-0.25, Math.min(1.0, P.a[i]));
    const px = sc * R0, pz = cc * R0 * 0.86, py = 0.9;
    _kT.set(cc, 0, -sc);
    _pr.makeRotationAxis(_kT, -a);
    // 本人・武将（部品の形）：板の形を腰の部品の中で回す
    if (h.kzMesh) { const pm = h.kzMesh[i]; if (pm) pm.matrix.copy(_pv3.makeTranslation(px, py, pz)).multiply(_pr).multiply(m1.makeTranslation(-px, -py, -pz)); continue; }
    const bn = h.xb['swK' + i];
    const Rm = restMatrix('Hips'), Ri = restInverse('Hips');
    _sm.copy(SRC.fitT).multiply(_pv3.makeTranslation(px, py, pz)).multiply(_pr).multiply(m1.makeTranslation(-px, -py, -pz)).multiply(SRC.fitTi);
    bn.matrix.copy(Ri).multiply(_sm).multiply(Rm);
  }
}
const _eu = new THREE.Euler();
const restInvs = {};
function restInverse(nm) { return restInvs[nm] || (restInvs[nm] = restMatrix(nm).clone().invert()); }

// ---------------- 近い者を選んで入れ替える ----------------
const humans = new Set();
// 選び直す入れ物は、人と馬で分けて使い回す。
const humanCandidates = [];
const humanWanted = new Map();
const humanNear = [];
// 上限付きの入れ物を支度の時に作り、兵ごとの候補を毎コマ作らない。
const humanCandidatePool = Array.from({ length: 512 }, () => ({ u: null, d: 0, dist: 0, vis: false, required: false }));
const humanNearPool = Array.from({ length: 250 }, () => ({ h: null, dist: 0 }));
const humanQuality = {};
const humanQualityValues = {};
// 距離・画面判定・並べ替えだけ隔コマにする。倒れた兵と増援は軽い照合で毎コマ拾う。
const humanUnitRefs = [];
const humanUnitStates = [];

export { resetCrowdSweep, sweepCrowdGeos, humanShadowLod, gripPose, gripReset, rideHuman, TECH, TECH_OF, GOU_TECH, TECH_NAMES, startTech, techDur, techBody, attackBody, guardBody, sway, restInverse, humans, humanCandidates, humanWanted, humanNear, humanCandidatePool, humanNearPool, humanQuality, humanQualityValues, humanUnitRefs, humanUnitStates };
