// siege_path.js … 城攻め共通の「迷わせない・詰ませない」仕組み（docs/inabayama_spec_1109.md・kaito 11/9 夜）
// 稲葉山で作り、小谷・岩村・信貴山・有岡・高遠・山中・八王子・佐和山にも同じ形で使う。触るのは城攻め共通の係だけ。
//   ① 進み具合の帯：右上の目標の札の下に「山麓✓ › 鹿垣✓ › 七曲り● › 木戸 › 本丸」。字は区画の名だけ（短く・色と印が主）。
//   ② 迷いの段々の案内：行き先へ 25 秒近づけないと、1段目＝使番（近くの味方の組が実際に走って来て「こちらです！」）、
//      2段目＝行き先に大きな味方の旗、3段目＝足元に行き先への矢印を一時。三巡詰まったら onStuck で味方の援護を強める。
//   ③ 区画の制圧（sectionTaken）：全滅でなく「指揮官が倒れる／大旗に着く」＋「七割五分が討たれるか退く」。残りは退かせる。
//   ④ 門の開く条件（anyOf）：どれか一つで開く。一つの AI が引っかかっても止まらない。
// 使い方（戦の定義）：
//   import { siegePath, sectionTaken, anyOf } from './siege_path.js';
//   siegePath: { sections: [{ name: '山麓', done: (rt) => … }, …] },     // 定義に置けば帯は hud_goals が描く
//   setup(rt) { F.SP = siegePath(rt, def.siegePath); }  update(rt, dt) { F.SP.tick(dt); }  cleanup(rt) { F.SP?.dispose(); }
import * as THREE from 'three';
import { S } from './settings.js';

const STALL = 25;   // この秒数、行き先へ近づけなければ一段上げる
const STEP_GAP = 18; // 段と段の間

// ---------- ① 進み具合の帯 ----------
// 戦の定義に siegePath が無い城攻めは、右上の目標の行（goals5）の何番目が済めばその区画が済むかの表で帯を作る。
// [区画の名, 目標の行の番号]。名は指示書と地図の名（字は短く）。
export const SIEGE_SECTIONS = {
  odani: [['清水谷', 0], ['大野木屋敷', 1], ['京極丸', 2], ['小丸', 3], ['本丸', 4]],
  t09_yamanaka: [['岱崎出丸', 0], ['障子堀', 1], ['大手門', 3], ['本丸', 4]],
  t11_hachioji: [['山下曲輪', 1], ['御主殿', 3], ['金子丸', 5], ['本丸', 7]],
  takato: [['大手門', 2], ['二の丸', 3], ['本丸', 5]],
  shigisan: [['尾根道', 0], ['大手の木戸', 1], ['土橋', 2], ['北尾根', 3], ['本丸', 4]],
  arioka: [['上臈塚の木戸', 0], ['惣構え', 1], ['侍町の辻', 2], ['奥の木戸', 3]],
  k07_sawayama: [['大手門', 0], ['三の丸', 1], ['二の丸', 3], ['本丸', 4]],
};
const isSiege = (rt) => !!(rt.def.siegePath || SIEGE_SECTIONS[rt.def.id]);
export function siegeSections(rt, rows) {
  if (rt.def.siegePath?.sections) return rt.def.siegePath.sections;
  const t = SIEGE_SECTIONS[rt.def.id];
  if (!t || !rows) return null;
  return t.map(([name, k]) => ({ name, done: () => !!rows[Math.min(k, rows.length - 1)]?.done }));
}
export function siegePathNow(rt, rows) {
  const list = siegeSections(rt, rows);
  if (!list) return -1;
  for (let i = 0; i < list.length; i++) { let d = false; try { d = !!list[i].done(rt); } catch (e) { d = false; } if (!d) return i; }
  return list.length;
}
export const hasSiegePath = isSiege;
// hud_goals.js が目標の札の中に描く（達成の棒の代わり）。字が変わる時だけ書く。rows は goals5 の行。
export function siegePathStrip(box, rt, rows) {
  const list = siegeSections(rt, rows);
  if (!list) return false;
  let el = box._sp;
  if (!el || el.parentNode !== box) {
    el = box._sp = document.createElement('div'); el.className = 'siege-path'; el.setAttribute('role', 'status');
    el.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;margin-top:6px;font:700 13px/1.4 sans-serif;color:#a39a8a;letter-spacing:.02em';
    box.appendChild(el);
  }
  const now = siegePathNow(rt, rows);
  const key = (rt.def.id || '') + now;
  if (el._key === key) return true;
  el._key = key;
  el.textContent = '';
  list.forEach((s, i) => {
    if (i) { const sep = document.createElement('span'); sep.textContent = '›'; sep.style.cssText = 'color:#6f675b'; el.appendChild(sep); }
    const b = document.createElement('span');
    b.textContent = i < now ? `${s.name}✓` : i === now ? `●${s.name}` : s.name;
    b.style.cssText = i < now ? 'color:#9fe08a' : i === now ? 'color:#fff3ba;background:rgba(224,38,26,.32);border-radius:3px;padding:0 4px' : 'color:#b8ae9c';
    el.appendChild(b);
  });
  el.setAttribute('aria-label', `城攻めの進み ${list.length}のうち${Math.min(now, list.length)}`);
  return true;
}

// ---------- ③ 区画の制圧・④ 門の開く条件 ----------
const aliveIn = (g) => (g?.units || []).filter((u) => u.alive && !u.fleeing && !u.woundOut).length;
// 出てきた兵の数の最大を覚える（後から出る組・継ぎ足しも数える。出る前の空の組で 1 に決めない）
const totalIn = (g) => g ? (g._spTotal = Math.max(g._spTotal || 0, (g.units || []).length)) : 0;
// groups の七割五分（ratio）が討たれるか退き、かつ（leader が倒れたか退いた・旗 flag に本人が着いた・どちらも無い）なら true。
// 制圧したら残りを退かせる（routed）。「残り一人を岩の裏で探して十分」を無くす。
export function sectionTaken(rt, groups, o = {}) {
  const list = (groups || []).filter(Boolean);
  if (!list.length) return true;
  let all = 0, live = 0;
  for (const g of list) { all += totalIn(g); live += g.routed ? 0 : aliveIn(g); }
  if (!all) return false;   // まだ誰も出ていない
  const ratio = o.ratio ?? 0.75;
  const thinned = all ? 1 - live / all >= ratio : true;
  const L = o.leader;
  const leaderDown = !L || !L.alive || L.fleeing || L.woundOut;
  const P = rt.player?.u, f = o.flag;
  const atFlag = !!(f && P && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < (f.r || 8));
  const ok = thinned && (leaderDown || atFlag || (!L && !f)) || live <= (o.few ?? 2);
  // 残りは退かせる。戦に自前の退き方があれば o.retreat(g)、無ければ気を零にして崩れさせる（army の崩れの仕組み）
  if (ok && !o.keep) for (const g of list) if (!g.routed && aliveIn(g) && !g._spOut) { g._spOut = true; if (o.retreat) o.retreat(g); else { g.noRout = false; g.morale = 0; } }
  return ok;
}
// 門の開く条件は必ず複数。どれか一つで開く。
export const anyOf = (...fns) => (rt) => fns.some((fn) => { try { return !!fn(rt); } catch (e) { return false; } });

// ---------- ② 迷いの段々の案内 ----------
let FLAG_GEO = null, FLAG_MAT = null, ARROW_GEO = null, ARROW_MAT = null;
function flagMesh() {
  if (!FLAG_GEO) {
    FLAG_GEO = { pole: new THREE.CylinderGeometry(0.09, 0.11, 9, 6).translate(0, 4.5, 0), cloth: new THREE.PlaneGeometry(1.5, 4.2).translate(0.78, 6.6, 0) };
    // 織田の白に、遠くからも分かる黄の縁（字は使わない）
    const c = document.createElement('canvas'); c.width = 32; c.height = 96;
    const x = c.getContext('2d'); x.fillStyle = '#f4efe2'; x.fillRect(0, 0, 32, 96); x.fillStyle = '#e0b84c'; x.fillRect(0, 0, 32, 6); x.fillRect(0, 0, 4, 96);
    x.fillStyle = '#222'; x.beginPath(); x.arc(17, 26, 7, 0, Math.PI * 2); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    FLAG_MAT = { pole: new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9 }), cloth: new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x332a10 }) };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(FLAG_GEO.pole, FLAG_MAT.pole), new THREE.Mesh(FLAG_GEO.cloth, FLAG_MAT.cloth));
  g.scale.setScalar(1.25);
  return g;
}
function arrowMesh() {
  if (!ARROW_GEO) {
    const sh = new THREE.Shape(); sh.moveTo(-0.35, 0); sh.lineTo(0.35, 0); sh.lineTo(0.35, 1.6); sh.lineTo(0.9, 1.6); sh.lineTo(0, 2.8); sh.lineTo(-0.9, 1.6); sh.lineTo(-0.35, 1.6); sh.closePath();
    ARROW_GEO = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);   // 先は -z…向きは rotation.y で合わせる
    ARROW_GEO.rotateY(Math.PI);
    ARROW_MAT = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  }
  const m = new THREE.Mesh(ARROW_GEO, ARROW_MAT); m.renderOrder = 3; return m;
}

// 三巡詰まった時の既定：本人の 50m の内の味方の組を本人のまわりへ寄せ、近くの敵へかからせる（兵は足さない）
function allyHelp(rt) {
  const A = rt.army, P = rt.player?.u; if (!A || !P) return;
  let n = 0;
  for (const g of A.groups) {
    if (n >= 2 || !freeAlly(g, P.team) || g.count < 2) continue;
    const c = g.center(g._spProbe || (g._spProbe = {}));
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 50) continue;
    g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 30); g.dest = { x: P.pos.x, z: P.pos.z };
    if (g.anchor) { g.anchor.x = P.pos.x; g.anchor.z = P.pos.z; }
    n++;
  }
}

// 筋書きで動く組（道を行く列・伏兵・控え・本陣の采配で出す組）は動かさない。持ち場で控えている組だけ。
const freeAlly = (g, team) => g.team === team && !g.routed && !g.isPlayerSquad && !g.isTomo && !g.noAI && !g.siegeAI && !g.stay && !g.garrison &&
  !g.hidden && !g.ambush && !g.reserve && !g.pending && !g.dispatch && !g.historicalOrders && !g._route && g.count >= 1 &&
  (g.order === 'hold' || g.order === 'follow' || g.order === 'idle' || g.order === 'attack') &&
  !g.units.some((u) => u.alive && (u.isTaisho || u.isLord || u.oTaisho));

const CALL = ['こちらです！', '道はこちらじゃ！', 'こっちだ！ 続け！'];

export function siegePath(rt, o = {}) {
  const T = { level: 0, t: 0, rounds: 0, best: Infinity, key: '', flag: null, arrow: null, arrowT: 0, runner: null, last: -99 };
  const scene = rt.world?.scene || rt.scene;
  const target = () => {
    const at = o.target?.(rt) || (rt.missionGuide?.marker ? rt.missionGuide.pos : null);
    return at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : null;
  };
  const reset = () => {
    T.level = 0; T.t = 0; T.best = Infinity;
    if (T.flag) T.flag.visible = false;
    if (T.arrow) T.arrow.visible = false;
  };
  const say = (who, text) => { if (rt.t - T.last < 8) return; T.last = rt.t; rt.hud?.say?.(who, text, 3.5, false); };
  // 使番：本人の 45m の内で手の空いた味方の組を、本人と行き先の間へ走らせる（兵は足さない）
  const runner = (P, at) => {
    const A = rt.army; if (!A) return false;
    let best = null, bd = 45;
    for (const g of A.groups) {
      if (!freeAlly(g, P.team)) continue;
      const c = g.center(g._spProbe || (g._spProbe = {}));
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return false;
    const D = Math.hypot(at.x - P.pos.x, at.z - P.pos.z) || 1, k = Math.min(1, 12 / D);
    best.order = 'move'; best.dest = { x: P.pos.x + (at.x - P.pos.x) * k, z: P.pos.z + (at.z - P.pos.z) * k };
    best.facing = Math.atan2(at.x - P.pos.x, at.z - P.pos.z);
    best.onArrive = (gg) => { if (gg.order === 'move') gg.order = 'hold'; };
    for (const u of best.units) if (u.alive && !u.fleeing) u.aiT = Math.min(u.aiT ?? 0, 0.2);
    T.runner = best;
    return true;
  };
  const up = (P, at) => {
    T.level++; T.t = 0;
    if (T.level === 1) {
      runner(P, at);
      say('使番', o.call?.(rt, 1) || CALL[T.rounds % CALL.length]);
    } else if (T.level === 2) {
      if (!T.flag && scene) { T.flag = flagMesh(); scene.add(T.flag); }
      if (T.flag) { T.flag.visible = true; T.flag.position.set(at.x, rt.world.heightAt(at.x, at.z), at.z); }
      say('使番', o.call?.(rt, 2) || 'あの旗じゃ！ 旗の所へ！');
    } else {
      if (!T.arrow && scene) { T.arrow = arrowMesh(); scene.add(T.arrow); }
      T.arrowT = 14;
      T.rounds++;
      if (T.rounds >= 3) (o.onStuck || allyHelp)(rt, T.rounds);
      T.level = 0;   // 次の巡は一段目から（旗は残す）
    }
  };
  // 援護：命が四割を切り、六歩の内に三人以上の敵がいる時、味方が助太刀に駆け付け、囲む敵の手が一息止まる（二十五秒に一度）。
  //   指示書「それでも倒れるなら味方の援護を強める」。敵を弱くするのでなく、囲まれた所を味方が割って入る。
  const relief = () => {
    const P = rt.player?.u, A = rt.army;
    if (!P || !A || rt.t < (T.reliefAt || 0) || !P.maxHp || P.hp > P.maxHp * 0.4) return;
    const near = [];
    for (const u of A.units) if (u.alive && !u.fleeing && u.team !== P.team && !u.isStruct && !u.civ && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 6) near.push(u);
    if (near.length < 3) return;
    T.reliefAt = rt.t + 25;
    for (const u of near) { if (u.atk?.target === P || u.target === P) { u.atk = null; u.swing = null; u.target = null; } u.aiT = Math.max(u.aiT ?? 0, 1.6); }
    allyHelp(rt);
    say('味方', o.reliefCall || '助太刀いたす！　下がって息を整えよ！');
  };
  return {
    T,
    tick(dt) {
      const P = rt.player?.u;
      if (!P || !P.alive || rt.over || rt.choice || (rt.prelude && rt.prelude !== 'done')) return;
      if ((T.rT = (T.rT || 0) - dt) <= 0) { T.rT = 0.5; relief(); }
      if (S.reduceGuidance && !o.always) return;
      // 矢印は足元から行き先を指す。十四秒で消す
      if (T.arrow && T.arrowT > 0) {
        T.arrowT -= dt;
        const at = target();
        T.arrow.visible = !!at && T.arrowT > 0;
        if (at) {
          const a = Math.atan2(at.x - P.pos.x, at.z - P.pos.z);
          T.arrow.position.set(P.pos.x + Math.sin(a) * 2.2, rt.world.heightAt(P.pos.x + Math.sin(a) * 2.2, P.pos.z + Math.cos(a) * 2.2) + 0.15, P.pos.z + Math.cos(a) * 2.2);
          T.arrow.rotation.y = a;
        }
      }
      const at = target();
      if (!at) return;
      const key = (rt.missionGuide?.key || '') + '|' + Math.round(at.x / 6) + ',' + Math.round(at.z / 6);
      if (key !== T.key) { T.key = key; reset(); }
      const d = Math.hypot(at.x - P.pos.x, at.z - P.pos.z);
      const fighting = !!rt.missionGuide?.closeEnemy || P.attackT > 0;
      if (d < 7 || d < T.best - 2 || fighting) { T.best = Math.min(T.best, d); T.t = 0; return; }
      T.t += dt;
      if (T.t >= (T.level ? STEP_GAP : STALL)) up(P, at);
    },
    dispose() {
      for (const m of [T.flag, T.arrow]) if (m) { m.parent?.remove(m); }
      T.flag = T.arrow = null;
    },
  };
}

// battle.js が毎コマ呼ぶ：表にある城攻めで、戦の側が自分で siegePath を持たない時は、ここで迷いの案内を回す。
export function siegePathAutoTick(rt, dt) {
  if (rt.flags?.SP || !isSiege(rt) || rt.def.town || rt.def.dojo) return;
  if (!rt._spAuto) { rt._spAuto = siegePath(rt, rt.def.siegePath || {}); rt.cleanupTasks?.add(() => { rt._spAuto?.dispose(); rt._spAuto = null; }); }
  rt._spAuto.tick(dt);
}
