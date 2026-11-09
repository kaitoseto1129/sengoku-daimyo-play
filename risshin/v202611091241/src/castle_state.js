// castle_state.js … 落城の流れ（docs/castle_fall_spec_1107.md・kaito 11/7）
// 敵大将を倒した瞬間に勝利の札を出さない。勝ちが決まったら（battle.js の finish）ここで止め、
//   DEFENDING→BREACHED→COLLAPSING→FINAL_RESISTANCE→FALLEN を流してから本当の締めへ渡す。
// COLLAPSING：名の無い城兵を、本丸へ退く・戦い続ける・逃げる・降伏（得物を捨てて座る）に割り振る。
// 旗：本丸の大旗が立つ→傾く→倒れる→味方の旗が立つ。城主の結末は台詞と火（castle_fall.js）で見せる。
// 終わりの言葉は城ごと（「勝利」の字は出さない）。その後 10〜20 秒の余韻（動ける・曲はほぼ消す・鐘・風・遠い勝鬨）。
// 音の三段：戦の音 → 鐘の早打ちと「退け」 → 風と火と遠い勝鬨。
import * as THREE from 'three';
import { FALL } from './castle_fall_data.js';
import { castleFallStart } from './castle_fall.js';
import { brushWord } from './victory_moment.js';
import { sfx, hush } from './audio.js';
import { drawMon } from './textures.js';

export const CastleState = { DEFENDING: 0, BREACHED: 1, COLLAPSING: 2, FINAL_RESISTANCE: 3, FALLEN: 4 };

const endAt = (F) => 15 + Math.max(10, (F.sec || 20) - 6);
// def.fall が関数（隊を崩す手続き。淀の野・岐阜・長久手など）の戦は落城の定めと取り違えない。ownEnding の戦は自分で締める
export function fallSpec(rt) { const d = rt.def; if (!d || d.dojo || d.town || d.ownEnding) return null; return (d.fall && typeof d.fall === 'object' ? d.fall : null) || FALL[d.key] || null; }

// battle.js の finish の頭で呼ぶ。止めた時は true（あとで info.fallDone を付けて finish し直す）
export function fallIntercept(rt, info, delay) {
  if (info.fallDone) return false;
  if (rt._fall) return !rt._fall.done;            // 流れの間に来た勝ち負けの知らせは受けない
  if (rt.over || info.down || rt.tracker.main !== true) return false;
  const F = fallSpec(rt);
  if (!F || !rt.player?.u?.alive) return false;
  start(rt, F, info, delay);
  return true;
}

function honmaru(rt, foe) {
  const A = rt.army;
  // 敵の大将（生死を問わず最後の居場所）→ 本丸・天守の建物 → 敵の建物の真ん中 → 自分の前
  const lord = A.units.find((u) => u.team === foe && (u.isLord || u.oTaisho || u.isTaisho));
  if (lord) return { x: lord.pos.x, z: lord.pos.z };
  const S = (A.structs || []).filter((s) => s.team === foe);
  const top = S.find((s) => /本丸|天守|主殿|御殿/.test(s.name || ''));
  const pt = (s) => s.seg ? { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 } : { x: s.x, z: s.z };
  if (top) { const p = pt(top); if (Number.isFinite(p.x)) return p; }
  if (S.length) { let x = 0, z = 0, n = 0; for (const s of S) { const p = pt(s); if (Number.isFinite(p.x)) { x += p.x; z += p.z; n++; } } if (n) return { x: x / n, z: z / n }; }
  const u = rt.player.u, h = u.heading ?? 0;
  return { x: u.pos.x + Math.sin(h) * 30, z: u.pos.z + Math.cos(h) * 30 };
}

// 大旗：竿と布。布は紋をキャンバスで描く（一つの戦で二枚だけ）
function bigFlag(rt, mon, x, z, white) {
  const W = rt.world, y = W.heightAt(x, z);
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.5, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }));
  pole.position.y = 3.25; g.add(pole);
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = white ? '#e9e4d6' : '#ebe5d4'; ctx.fillRect(0, 0, 128, 256);
  if (!white && mon) { try { ctx.save(); ctx.translate(0, 64); drawMon(ctx, mon, 128, 128, false, true); ctx.restore(); } catch (e) { /* 紋が無い時は無地 */ } }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x6a5a48, side: THREE.DoubleSide, roughness: 0.95 }));   // 夜の城でも篝火に照らされて見える
  cloth.position.set(0.77, 4.9, 0); g.add(cloth);
  g.position.set(x, y, z);
  rt.scene.add(g);
  rt.cleanupTasks?.add(() => { g.removeFromParent(); pole.geometry.dispose(); pole.material.dispose(); cloth.geometry.dispose(); cloth.material.dispose(); tex.dispose(); });
  return g;
}

function start(rt, F, info, delay) {
  const A = rt.army, me = rt.player.u.team, foe = me === 0 ? 1 : 0;
  const home = honmaru(rt, F.defend ? me : foe);
  const L = rt._fall = { F, info, delay, t: 0, state: CastleState.BREACHED, home, yielded: [], keep: [], escorts: [], done: false, said: 0, tick: 0 };
  rt.player.u.invuln = true;
  rt.flags.victoryShown = true;     // 勝った瞬間の大きな勝鬨と字を出さない（落城の終わりの言葉に任せる）
  rt.flags.castleFall = true;
  // 落ちる旗と、後で立つ旗
  const sides = rt.def.sides || {};
  const lose = F.defend ? sides.a?.mon : sides.b?.mon, win = F.defend ? sides.b?.mon : sides.a?.mon;
  // 旗は主人公の目に入る所へ：本丸の方へ 14〜18 歩先（遠い本丸の代わりに、間の曲輪に立つ大旗）。布は主人公へ向け、横へ倒す
  const pp = rt.player.u.pos, hx = home.x - pp.x, hz = home.z - pp.z, hd = Math.hypot(hx, hz) || 1, fd = Math.min(hd, Math.max(14, Math.min(18, hd)));
  const fx = pp.x + hx / hd * fd, fz = pp.z + hz / hd * fd, face = Math.atan2(-hx, -hz);
  L.fpos = { x: fx, z: fz };
  L.flag = bigFlag(rt, lose, fx, fz, false); L.flag.rotation.y = face; L.flag.scale.setScalar(1.2);
  if (F.fate === 'surrender' || F.fate === 'siege') L.white = bigFlag(rt, null, fx + Math.cos(face) * 5, fz - Math.sin(face) * 5, true), L.white.rotation.y = face, L.white.scale.set(1.3, 0.01, 1.3);
  L.winFlag = bigFlag(rt, win, fx - Math.cos(face) * 2.5, fz + Math.sin(face) * 2.5, false); L.winFlag.rotation.y = face; L.winFlag.scale.set(1.2, 0.01, 1.2);
  // 城兵の割り振り（名のある人・民・守りの者は動かさない）
  const sp = F.split || {};
  const list = A.units.filter((u) => u.alive && u.team === foe && !u.isPlayer && !u.isStruct && !u.civ && !u.name && !u.invuln && !u.isLord && !u.oTaisho && !u.isTaisho && !(u.group && (u.group.civ || u.group.people)));
  const n = list.length, cut = [sp.keep || 0, (sp.keep || 0) + (sp.fight || 0), (sp.keep || 0) + (sp.fight || 0) + (sp.flee || 0)];
  if (!F.defend) list.forEach((u, i) => {
    const k = (i * 0.618034) % 1;   // 隊に偏らず混ぜる
    if (k < cut[0]) { L.keep.push(u); u.target = null; u.atk = null; u.moveTo = { x: home.x + (Math.random() - 0.5) * 8, z: home.z + (Math.random() - 0.5) * 8 }; }
    else if (k < cut[1]) { if (u.group) u.group.noRout = true; }
    else if (k < cut[2]) flee(A, u, home);
    else L.yielded.push({ u, x: u.pos.x, z: u.pos.z, at: 1 + Math.random() * 5 });
  });
  // 味方：本丸へ寄せる。一部は降った者を連れる
  const allies = A.units.filter((u) => u.alive && u.team === me && !u.isPlayer && !u.isStruct && !u.civ && !u.name && !u.mounted);
  for (let i = 0; i < allies.length && L.escorts.length < Math.min(8, L.yielded.length); i += 3) L.escorts.push(allies[i]);
  for (const g of A.groups) if (g.team === foe && !g.civ && g.count > 0 && !F.defend) g.morale = Math.min(g.morale, 25);
  // 音の二段目：鐘の早打ち・曲を沈める
  sfx('bellRapid', 0.8);
  hush(endAt(F) + 8);
  rt.bark?.(F.defend ? '味方の侍「本丸、崩れます！」' : '城兵「本丸へ！　退け！」', true);
  console.log('落城の流れ', rt.def.key, '城兵', n, '降', L.yielded.length, '退', L.keep.length);
}

function flee(A, u, home) {
  const dx = u.pos.x - home.x, dz = u.pos.z - home.z, d = Math.hypot(dx, dz) || 1;
  u.moraleDir = u.moraleDir || { x: 0, z: 0 };
  u.moraleDir.x = dx / d; u.moraleDir.z = dz / d; u.moraleFleeDir = u.moraleDir;
  u.fleeing = true; u.fleeT = A.time; u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
  if (u.wpn && u.wpn.parent && !u.dropped && !u.mounted && A.dropWeapon) { try { A.dropWeapon(u); u.wpn = null; u.wpnKind = 'none'; } catch (e) { /* 得物の無い兵 */ } }
}

function sitDown(A, y) {
  const u = y.u;
  if (!u.alive) return;
  u.target = null; u.atk = null; u.swing = null; u.moveTo = null; u.fleeing = false;
  u.noTarget = true; u.yielded = true; u._crouch = true;
  if (u.wpn && u.wpn.parent && !u.dropped && !u.mounted && A.dropWeapon) { try { A.dropWeapon(u); u.wpn = null; u.wpnKind = 'none'; } catch (e) { /* 得物の無い兵 */ } }
  y.x = u.pos.x; y.z = u.pos.z; y.sat = true;
}

// battle.js の update から毎コマ（over の後も）
export function fallTick(rt, dt) {
  const L = rt._fall;
  if (!L || L.done) return;
  const F = L.F, A = rt.army;
  L.t += dt;
  const t = L.t;
  if (L.state === CastleState.BREACHED && t > 0.2) L.state = CastleState.COLLAPSING;
  if (L.state === CastleState.COLLAPSING && t > 3) L.state = CastleState.FINAL_RESISTANCE;
  // 台詞
  while (L.said < F.lines.length && t >= F.lines[L.said][0]) { const [, who, s] = F.lines[L.said++]; rt.say?.(who, s, 3.2); }
  // 結末
  if (F.fate === 'fire' && !L.fired && t > 2) { L.fired = true; try { castleFallStart(rt); } catch (e) { /* 燃やす建物が無い戦 */ } sfx('fire', 0.6); }
  if (F.boom && !L.boomed && t > F.boom) { L.boomed = true; sfx('gateBreak', 1); try { A.burst?.(L.home.x, rt.world.heightAt(L.home.x, L.home.z) + 4, L.home.z, 30, 'dust'); } catch (e) { /* 埃が無くてもよい */ } }
  if (L.white && t > 1) L.white.scale.y = 1.3 * Math.min(1, (t - 1) / 1.5);
  // 旗：立つ → 傾く（6〜8 秒）→ 倒れる（8〜9.5 秒）→ 味方の旗が立つ（10〜12 秒）
  const fl = L.flag;
  if (fl) {
    if (t > 6 && t < 9) fl.rotation.z = -0.3 * (t - 6) / 3 + Math.sin(t * 9) * 0.03;
    else if (t >= 9) { const k = Math.min(1, (t - 9) / 2.5); fl.rotation.z = -0.3 - (Math.PI / 2 - 0.25) * k * k; if (k >= 1 && !L.thud) { L.thud = true; A.play?.('wood', L.fpos, 0.9); A.burst?.(L.fpos.x, rt.world.heightAt(L.fpos.x, L.fpos.z) + 0.3, L.fpos.z, 12, 'dust'); } }
  }
  if (L.winFlag && t > 12) L.winFlag.scale.y = 1.2 * Math.min(1, (t - 12) / 2.5);
  // 終わりの言葉と、音の三段目
  if (!L.word && t > 15) {
    L.word = true; L.state = CastleState.FALLEN;
    brushWord(rt, F.word, { hold: 3.6 });
    if (F.sub) rt.after?.(2.6, () => brushWord(rt, F.sub, { hold: 3 }));
    sfx('bell', 0.7);
    rt.after?.(1.5, () => sfx('wind', 0.5));
    if (!F.quiet && !F.defend) rt.after?.(2.5, () => { const p = rt.player.u.pos; rt.warSpeech?.crowd('eiei', { x: p.x + 60, z: p.z + 60 }, 0.3); });
  }
  // 四回/秒：降った者を座らせ留める・本丸へ退く者・連れる味方
  L.tick -= dt; if (L.tick > 0) { if (t >= endAt(F)) finishNow(rt); return; }
  L.tick = 0.25;
  for (const y of L.yielded) {
    if (!y.sat) { if (t >= y.at) sitDown(A, y); continue; }
    const u = y.u; if (!u.alive) continue;
    u.target = null; u.atk = null; u.moveTo = null; u.pos.x = y.x; u.pos.z = y.z;
  }
  for (const u of L.keep) if (u.alive && !u.target && !u.fleeing) u.moveTo = u.moveTo || { x: L.home.x, z: L.home.z };
  let i = 0;
  for (const e of L.escorts) {
    const y = L.yielded[i++]; if (!y || !e.alive) continue;
    if (y.sat && t > 6) { e.target = null; e.moveTo = { x: y.x + 1.2, z: y.z + 0.6 }; }
  }
  if (t >= endAt(F)) finishNow(rt);
}

function finishNow(rt) {
  const L = rt._fall;
  if (!L || L.done) return;
  L.done = true;
  rt.finish({ ...L.info, fallDone: true, noClosing: true }, Math.min(L.delay ?? 4, 4.5));
}

export function fallWord(rt) { const F = fallSpec(rt); return F && rt._fall ? F : null; }
