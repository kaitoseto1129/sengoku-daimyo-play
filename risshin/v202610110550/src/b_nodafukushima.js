import { pressureTick } from './battle_pressure.js';
import { sightPoint } from './battle_sight.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　野田・福島の戦い（元亀元年八月〜九月）
// 三好三人衆が摂津の野田・福島に砦を構え、信長はこれを囲んだ。織田方には紀伊の根来・雑賀の鉄砲衆も加わり、
// 昼も夜も鉄砲の撃ち合いが続いた。九月十二日の夜、石山本願寺が早鐘を撞いて蜂起し、織田の陣を襲った。
// 足軽は前田利家の手。①竹束を据えて鉄砲で支える ②浅瀬・中洲を渡り、野田・福島へ総攻め
// ③本願寺の早鐘。後ろと横から一揆勢が寄せ、堤へ戻って退き口を保つ
// ④浅井・朝倉が京へ迫る知らせ。囲みを解き、詰め陣の退き口へ退く（数日にわたる戦を続く段にまとめる）
// 向き：西は海、北・東・南の川に囲まれた二城。南東に織田の詰め陣と石山本願寺。
// 水路の形と前線の細かな配置は推定。天王寺の本陣までの約五キロをこの局地へ縮めない。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, tawara, campfire, carryTorches, dou, makeSimpleBatch, finalizeSimpleBatch, castleMat } from './props.js';
import { flagTexture } from './textures.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { reduceMotion } from './settings.js';
import { segHit, buildModel } from './units.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { battleEvent, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyScene } from './b_shiga.js';
import { lines, leanAll, camp } from './b_mid.js';
// 束5（docs/quality-upgrade-plan.md）：河川砦の縄張り二つ・堤の土塁・竹束・三好と一揆の部隊・夜の寄せの頭・持ち場の区域
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { doruiLine, doruiHeight, horiboriHeight, sakamogiRow, goten } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeAttackAI } from './siege_ai.js';
import { fordWatch } from './toride.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { tabaGeo, tabaMat, addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { NODA_PLAN, FUKU_PLAN, NODA_GATE, FUKU_GATE, FORT_Z, LEVEE_Z, LEVEE_DORUI, LEVEE_TABA, LEVEE_ZONE, ODA_HONJIN, IKKO_ROUTES, RANKUI_LINES, SAKAMOGI_LINES, FORT_BUILDINGS, FORT_STORES } from './castles/nodafukushima.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 4;

const RIVER = [[-220, -24], [-110, -32], [0, -30], [110, -24], [220, -30]];
// 参照節の「西は海、北・南・東は川」を補う。既存の南の川と浅瀬、二城の寸法はそのまま。
// 北・東の流路は推定。総攻めと夜の寄せが通る南岸には新しい川を横切らせない。
const ISLAND_RIVER = [[-220, -142], [-120, -138], [0, -142], [124, -138], [132, -80], [110, -24]];
const SEA_EDGE = -190;
const SPOTS = [{ x: -14, z: -13 }, { x: 0, z: -14 }, { x: 14, z: -13 }];   // 竹束を据える所（堤の川側の肩）
const CARRY_WAIT = 18; // 味方と押す姿を見せ、据え切れなくても浅瀬の敵へ向かう。
const HONGAN = { x: 170, z: 170 };          // 石山本願寺（遠く）
const ODA = { flag: 'oda' };
const MIYOSHI = { flag: 'miyoshi' };
// 一揆の門徒：具足は軽く、鉢巻に、南無阿弥陀仏の旗
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, skin: 0xc49b78, hat: 'jingasa', flag: 'namu' };
function cappedList(rt, list) {
  let room = 225; // 新手を出す時だけ数え、味方の追いつく分を空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.farSim && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
const enemyGroup = (rt, o, list) => spawnEnemy(rt, { fixed: true, formation: list.some(q => q.type === 'gun') ? 'line' : 'yari', ...o }, cappedList(rt, list));

// 共通の下知・声も、この戦の札と間隔へ揃える。ほかの戦には持ち越さない。
function installNodaNotices(rt) {
  const say = rt.say, bark = rt.bark, obj = rt.obj, dispose = rt.dispose;
  let fireAt = -99, ringAt = -99;
  const allow = (text, speaker) => {
    if (speaker === '前田利家' && /放て/.test(text)) {
      if (rt.t - fireAt < 30) return false;
      fireAt = rt.t;
    }
    if (/囲まれた|四方から敵|後ろにも敵|取り籠め|左右へ回られ|横へ回られる|脇へ回る敵/.test(text)) {
      if (rt.t - ringAt < 30) return false;
      ringAt = rt.t;
    }
    return true;
  };
  rt.say = function (sp, text, dur) {
    // 生きた利家が仲間を悼む声は、本人の最期と取り違えない言葉にする。
    if (sp === '前田利家' && this.flags.maedaU?.alive) text = text.replace(/無念じゃ/g, '仲間の働きは忘れぬ');
    if (allow(text, sp)) return say.call(this, sp, text, dur);
  };
  rt.bark = function (text, warn) { if (allow(text, '')) return bark.call(this, text, warn); };
  rt.obj = function (id, text, kind = 'main', local = false) {
    // 将の護衛・櫓など共通側の任務は、今の下知を押しのけない。
    if (id !== 'main') kind = 'side';
    return obj.call(this, id, text, kind, local);
  };
  const style = document.createElement('style');
  style.textContent = '#hud #objectives li.side:not(.done) .obj-text{font-size:13px;color:#b9b09c;line-height:1.6}#hud #objectives li.side:not(.done) .tag{font-size:0}#hud #objectives li.side:not(.done) .tag::after{content:"あとで";font-size:12px;color:#b9b09c}';
  document.head.appendChild(style);
  rt.dispose = function () {
    style.remove(); this.flags.handGeo?.dispose(); this.flags.handMat?.dispose();
    for (const geo of this.flags.bellGeos || []) geo.dispose();
    this.flags.bellMat?.dispose();
    return dispose.call(this);
  };
}

// 遠い槍の長さは一隊につき一度だけ変える。新しい隊だけ一秒ごとに拾う。
function nodaPeople(rt) {
  const F = rt.flags;
  if (rt.t < (F.peopleAt || 0)) return;
  F.peopleAt = rt.t + 1;
  for (const A of rt.world.armies || []) {
    if (A._nodaSpears) continue;
    A._nodaSpears = true;
    for (const m of A.mesh.children) {
      const a = m.geometry?.getAttribute('aInfo');
      if (!a) continue;
      for (let i = 0; i < a.count; i++) if (a.getY(i) === 0) a.setW(i, 1.05 + (i % 5) * 0.14);
      a.needsUpdate = true;
    }
  }
  for (const a of rt.warPeople?.actors || []) {
    if (a.kind !== 'monk' || a._nodaFace) continue;
    a._nodaFace = true;
    const old = a.mesh, mesh = buildModel(a.u, { ...a.u.look, hat: 'jingasa', skin: 0xc49b78, cloth: 0x403b36, dirt: 0.15 });
    mesh.position.copy(old.position); mesh.rotation.copy(old.rotation); mesh.userData = old.userData;
    rt.scene.remove(old); rt.scene.add(mesh); a.mesh = mesh;
    // 広い袖の外へ手を出す。袖と一緒に動き、形と材質は僧同士で共有する。
    if (!F.handGeo) { F.handGeo = new THREE.SphereGeometry(0.055, 6, 4); F.handMat = new THREE.MeshLambertMaterial({ color: 0xc49b78 }); }
    for (const arm of [a.u.armL, a.u.armR]) { const hand = new THREE.Mesh(F.handGeo, F.handMat); hand.position.set(0, -0.49, 0.04); hand.scale.set(1, 1.35, 1); arm.add(hand); }
  }
}

// この戦だけの幕間。更新を止め、読んでいる間に兵が討たれるのを防ぐ。
// 巻き戻しの記録には幕の進みを入れず、終幕・戦の破棄で必ず外す。
const DAY_CUTS = new WeakMap();
function installDayCuts(rt) {
  const cut = { shade: null, t: 0, changed: false };
  DAY_CUTS.set(rt, cut);
  const update = rt.update, dispose = rt.dispose;
  rt.update = function (dt, input) {
    if (cut.shade) {
      if (this.over || !this.player.u.alive) {
        cut.shade.remove(); cut.shade = null;
      } else {
        cut.t += dt;
        if (!cut.changed && cut.t >= 0.8) {
          cut.changed = true;
          this.flags.day = cut.day;
          this.world.setTime(cut.time);
          // 空を替えるのは幕が覆った後。戦場を見せたまま昼夜を飛ばさない。
          this.world.fade = null;
          this.world.applyLook(this.world.lookOf(cut.time));
          this.world.updateEnv();
        }
        cut.shade.style.opacity = cut.still ? '1' : String(Math.max(0, Math.min(1, cut.t / 0.8, 5 - cut.t)));
        if (cut.t >= 5) {
          cut.shade.remove(); cut.shade = null;
          input?.clear?.();
        }
        return;
      }
    }
    return update.call(this, dt, input);
  };
  rt.dispose = function () {
    cut.shade?.remove(); DAY_CUTS.delete(this);
    return dispose.call(this);
  };
}

// 日付と経った日数を、五秒の暗転の中で読めるようにする。
function dayCut(rt, day, time, title, word) {
  if (rt.flags.ending || rt.over || !rt.player.u.alive) return;
  const cut = DAY_CUTS.get(rt), shade = document.createElement('div');
  cut.shade?.remove();
  cut.shade = shade; cut.t = 0; cut.changed = false;
  cut.day = day; cut.time = time; cut.still = reduceMotion();
  shade.style.cssText = `position:fixed;inset:0;background:#14120f;color:#ece4d2;opacity:${cut.still ? 1 : 0};z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;text-align:center;pointer-events:auto`;
  shade.setAttribute('role', 'status');
  const date = document.createElement('div'), heading = document.createElement('div'), note = document.createElement('div');
  const passed = day - (rt.flags.day || 12);
  date.textContent = `九月${day}日${time === 'night' ? 'の夜' : ''}${passed > 0 ? `・${passed === 1 ? '一日' : passed + '日'}が過ぎた` : ''}`;
  date.style.cssText = 'font-size:16px;line-height:1.6;color:#c2a25a';
  heading.textContent = title;
  heading.style.cssText = 'font-size:24px;line-height:1.4';
  note.textContent = word;
  note.style.cssText = 'font-size:16px;line-height:1.6;max-width:32em';
  shade.append(date, heading, note);
  document.body.appendChild(shade);
}

// 共通の絵を使い、どの戦から始めても旗と指物に紋が出る
function sagarifujiTex() { return flagTexture('sagarifuji'); }
function namuTex() { return flagTexture('namu'); }

// この戦の胸壁だけを湿った土へ替える。床と弾よけは元の土塁に任せる。
// 絵・形・草は開戦時だけ作り、黒い割れ線や夜にも光る材質は使わない。
function nodaLevee(rt) {
  const first = rt.scene.children.length;
  const wall = doruiLine(rt, LEVEE_DORUI, { w: 3, h: 0.7, name: '堤の土塁', noBatch: true });
  const meshes = rt.scene.children.slice(first);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 157012;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#68543c'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 3 + rnd() * 28;
    const shade = ctx.createRadialGradient(x, y, 0, x, y, r);
    shade.addColorStop(0, i % 2 ? 'rgba(40,32,24,0.18)' : 'rgba(151,125,88,0.16)');
    shade.addColorStop(1, 'rgba(104,84,60,0)');
    ctx.fillStyle = shade; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 雨に流れた土の筋は薄く短く。線で面を区切らない。
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = 'rgba(48,39,29,0.09)';
    ctx.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 4, 8 + rnd() * 32);
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(33,28,23,0.23)' : 'rgba(166,149,119,0.3)';
    ctx.beginPath(); ctx.ellipse(rnd() * 512, rnd() * 512, 0.6 + rnd() * 2.8, 0.5 + rnd() * 1.8, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const soil = new THREE.MeshLambertMaterial({ map: tex, color: 0x9b8b77, side: THREE.DoubleSide });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x514c30, side: THREE.DoubleSide });
  const grass = [], geos = [];
  for (let s = 0; s < meshes.length; s++) {
    const [ax, az] = LEVEE_DORUI[s], [bx, bz] = LEVEE_DORUI[s + 1];
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    const n = Math.ceil(len / 0.3), rows = 16, pos = [], uv = [], indices = [];
    const surface = (d, u) => {
      const x = ax + (bx - ax) * d / len + nx * (u * 3 - 0.3);
      const z = az + (bz - az) * d / len + nz * (u * 3 - 0.3);
      // 交互に踏んだ足跡は数センチのくぼみ。裾と区画の端では消してつなぐ。
      const step = Math.round(d / 0.7), along = (d - step * 0.7) / 0.24;
      const across = (u * 3 - (step % 2 ? 0.72 : 0.42)) / 0.14;
      const fade = Math.min(1, d, len - d) * Math.sin(Math.PI * u);
      const dip = 0.055 * Math.exp(-along * along - across * across) * fade;
      const rough = 0.035 * Math.sin(x * 3.7 + z) * Math.sin(z * 5.1) * fade;
      return [x, rt.world.heightAt(x, z) + Math.max(0, 0.7 * (1 - u * u)) + rough - dip - (u > 0.98 ? 0.1 : 0), z];
    };
    for (let i = 0; i <= n; i++) for (let q = 0; q <= rows; q++) {
      pos.push(...surface(len * i / n, q / rows)); uv.push(len * i / n / 4, q / rows);
      if (i < n && q < rows) {
        const a = i * (rows + 1) + q, b = a + rows + 1;
        indices.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    meshes[s].geometry.dispose(); meshes[s].geometry = geo; meshes[s].material = soil; geos.push(geo);
    // 踏まれた天端を避け、法面に低い枯れ草の房。一枚の形へまとめる。
    for (let i = 0; i < Math.ceil(len * 1.5); i++) {
      const [x, y, z] = surface(0.3 + rnd() * (len - 0.6), 0.38 + rnd() * 0.48);
      for (let b = 0; b < 5; b++) {
        const angle = rnd() * Math.PI * 2, dx = Math.cos(angle), dz = Math.sin(angle), h = 0.13 + rnd() * 0.22;
        grass.push(x - dz * 0.025, y - 0.02, z + dx * 0.025, x + dz * 0.025, y - 0.02, z - dx * 0.025, x + dx * 0.1, y + h, z + dz * 0.1);
      }
    }
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grass, 3)); grassGeo.computeVertexNormals();
  rt.scene.add(new THREE.Mesh(grassGeo, grassMat));
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const geo of geos) geo.dispose();
    grassGeo.dispose(); soil.dispose(); grassMat.dispose(); tex.dispose();
    return dispose.call(this);
  };
  return wall;
}

function baseHeight(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 堤（川の南岸を東西に）。真ん中の持ち場は少し高く、背を平らに
  const lv = Math.exp(-((z - LEVEE_Z) ** 2) / 26) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 120) / 30);
  h += 2.6 * lv;
  // 砦の島は少し高い
  h += 1.2 * Math.max(0, Math.min(1, (-(z + 36)) / 8)) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 70) / 20);
  // 遠くの上町台地（本願寺）
  h += 12 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  // 西の海へ低くなる岸。福島砦と浦江への既存の寄せ道より外に置く。
  if (x < SEA_EDGE + 10) h = Math.min(h, -2.4 + 2.5 * Math.max(0, Math.min(1, (x - SEA_EDGE + 8) / 18)));
  return h;
}
// 砦の水堀の窪み・堤の土塁の盛りを混ぜてから、二つの砦の曲輪を平らに（castle_plan の heightOf を重ねる）
const HORI_FNS = [...NODA_PLAN.hori, ...FUKU_PLAN.hori].map((q) => horiboriHeight(q.pts, { depth: q.deep ?? 2, width: q.w ?? 6 }));
const DORUI_H = doruiHeight(LEVEE_DORUI, { w: 3, h: 0.7 });
function withHori(x, z) { let h = baseHeight(x, z) + DORUI_H(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
// 虎口の切岸を道だけ緩い坂へ直す。高さ・幅は見た目と歩く地形が共有する。
// 支点・区間は最初の一回だけ作り、川と堤の区間は既存の浅瀬を残す。
function fortRoadHeight(raw) {
  const segs = [];
  // 多角形の境界点は内外判定で外になる場合がある。虎口の支点は曲輪の床へ合わせる。
  const anchor = (x, z) => {
    let y = null;
    for (const plan of [NODA_PLAN, FUKU_PLAN]) for (const k of plan.kuruwa) for (let i = 0; i < k.poly.length; i++) {
      const [ax, az] = k.poly[i], [bx, bz] = k.poly[(i + 1) % k.poly.length];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < .01) y = Math.max(y ?? -Infinity, k.level);
    }
    return y ?? raw(x, z);
  };
  for (const p of [...NODA_PLAN.paths, ...FUKU_PLAN.paths]) {
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      if (az > -36 || bz > -36) continue;
      const dx = bx - ax, dz = bz - az;
      segs.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1, ya: anchor(ax, az), yb: anchor(bx, bz), half: (p.w ?? 4) / 2 });
    }
  }
  return (x, z) => {
    if (z > -34 || z < -95 || x < -141 || x > 20 || (x > -106 && x < -20)) return raw(x, z);
    let h = raw(x, z), best = Infinity, road = null, t = 0;
    for (const q of segs) {
      const u = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const d = Math.hypot(x - q.ax - q.dx * u, z - q.az - q.dz * u);
      if (d < best) { best = d; road = q; t = u; }
    }
    if (road && best < road.half + 1.2) {
      const k = Math.max(0, Math.min(1, (road.half + 1.2 - best) / 1.2));
      h += (road.ya + (road.yb - road.ya) * t - h) * k * k * (3 - 2 * k);
    }
    return h;
  };
}
function height(x, z) {
  if (!HEIGHT_FN) { const noda = heightOf(NODA_PLAN, withHori, 3); HEIGHT_FN = fortRoadHeight(heightOf(FUKU_PLAN, noda, 3)); }
  return HEIGHT_FN(x, z);
}
// 据えた盾を消さず、その端を回って浅瀬と堤を行き来する。
function tabaWay(army, u, want) {
  const p = u.pos;
  let way = u._tabaWay;
  if (way?.s && (!way.s.alive || Math.hypot(want.x - way.gx, want.z - way.gz) > 3)) way.s = null;
  if (way?.s) {
    if (Math.hypot(p.x - way.x, p.z - way.z) < 1.05) {
      if (!way.cross) { way.cross = true; way.z = way.sz - way.side * 2; }
      else way.s = null;
    }
    if (way.s) return way;
  }
  let blocked = null, nearest = Infinity;
  const dz = want.z - p.z;
  if (Math.abs(dz) < 0.001) return want;
  for (const s of army.structs) {
    if (!s.alive || s.opened || s.name !== '竹束' || !s.seg) continue;
    const [ax, az, bx] = s.seg, t = (az - p.z) / dz;
    if (t <= 0 || t >= 1 || t >= nearest) continue;
    const x = p.x + (want.x - p.x) * t;
    if (x < ax - 0.5 || x > bx + 0.5) continue;
    blocked = s; nearest = t;
  }
  if (!blocked) return want;
  if (!way) way = u._tabaWay = {};
  const [ax, az, bx] = blocked.seg;
  way.s = blocked; way.gx = want.x; way.gz = want.z; way.sz = az;
  way.side = p.z > az ? 1 : -1; way.cross = false;
  way.x = Math.abs(p.x - (ax - 2)) < Math.abs(p.x - (bx + 2)) ? ax - 2 : bx + 2;
  way.z = az + way.side * 2;
  return way;
}
// 部隊（butai.js）の本物の兵を、決めた数より増やさない（味方は遠くで戦う軽い作りのまま。ごちゃごちゃさせない）
function capReal(b, n) {
  b._mapPos = { x: 0, z: 0 };
  if (b.light && b.light.army) b.light.army.noWake = true;   // 軽い大軍は近づいても本物の兵に化けさせない（本物は部隊が決めた数だけ）
  b._autoSwitch = function (dt) {
    this._swT -= dt || 0.05;
    if (this._swT > 0) return;
    this._swT = 1.2;
    const have = this.realCount(), want = Math.min(n, this.aliveNominal());
    if (have > want) this.shrinkReal(have - want);
    else if (have < want && this.cmd.id === 'attack') this.growReal(Math.min(3, want - have));
  };
  return b;
}
// 軽い部隊の今の真ん中（本物が居なければ、軽い大軍の動いた先）
function bPos(b) {
  if (b.real && b.real.count) return b.pos;
  if (b.light && b.light.army) { const A = b.light.army, p = b._mapPos; p.x = A.cx + (A.off ? A.off.x : 0); p.z = A.cz + (A.off ? A.off.z : 0); return p; }
  return b.pos;
}
const bDead = (b) => !b || b.aliveNominal() <= 0;
function bDist(a, b) { const p = bPos(a), q = bPos(b); return Math.hypot(p.x - q.x, p.z - q.z); }

// 竹束：青竹を束ねて縄でくくった盾（taketaba.js の形と材質を使い回す。毎回 new しない）
// rot は今までどおり「前を向ける向き」（Math.PI＝北の砦の側）
function takeTaba(W, x, z, rot = 0) {
  const m = new THREE.Mesh(tabaGeo(), tabaMat());
  m.castShadow = true;
  m.rotation.set(0, rot + Math.PI, 0);
  m.position.set(x, W.heightAt(x, z), z);
  return m;
}

// 水際の乱杭：先を尖らせた杭を水の縁に不揃いに並べる（見た目のみ。柵・逆茂木は castle_parts 側の当たりで足りる）
let RANKUI_GEO = null, RANKUI_MAT = null;
function rankui(W, x, z, rot) {
  if (!RANKUI_GEO) { RANKUI_GEO = new THREE.ConeGeometry(0.06, 1, 5); RANKUI_MAT = new THREE.MeshStandardMaterial({ color: 0x4e3c28, roughness: 0.95 }); }
  const m = new THREE.Mesh(RANKUI_GEO, RANKUI_MAT);
  m.rotation.set(0.45, rot, 0);
  m.position.set(x, W.heightAt(x, z) - 0.25, z);
  m.castShadow = true;
  return m;
}
function rankuiLine(rt, pts, spacing = 1.5) {
  const [[ax, az], [bx, bz]] = pts;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / spacing));
  const ang = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = ((i * 7919) % 101) / 101 - 0.5;
    const x = ax + (bx - ax) * t + r * 0.5, z = az + (bz - az) * t + r * 0.5;
    rt.scene.add(rankui(rt.world, x, z, ang + Math.PI / 2 + r * 0.4));
  }
}

// 川石と足元の水際は、この戦の場面だけで組み立てる。形・配列は最初に確保する。
function installNodaWater(rt) {
  const W = rt.world, scene = rt.scene, dummy = new THREE.Object3D(), owned = [];
  const stoneGeo = new THREE.SphereGeometry(1, 10, 6);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666a64, roughness: 0.94 });
  owned.push(stoneGeo, stoneMat);
  const sourceGeo = new THREE.DodecahedronGeometry(1, 0), stride = sourceGeo.attributes.position.count;
  sourceGeo.dispose();
  // 白い平面の泡を取り除き、その直前に組まれた川石だけを厚みのある丸石へ替える。
  for (const foam of W.streamFoam || []) {
    const index = scene.children.indexOf(foam), source = scene.children[index - 1];
    if (!source?.isMesh || source.material?.color?.getHex() !== 0x6e6a62) continue;
    const pos = source.geometry.attributes.position, count = pos.count / stride;
    if (!Number.isInteger(count)) continue;
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, count);
    for (let i = 0; i < count; i++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let j = i * stride; j < (i + 1) * stride; j++) {
        x0 = Math.min(x0, pos.getX(j)); x1 = Math.max(x1, pos.getX(j));
        y0 = Math.min(y0, pos.getY(j)); y1 = Math.max(y1, pos.getY(j));
        z0 = Math.min(z0, pos.getZ(j)); z1 = Math.max(z1, pos.getZ(j));
      }
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, h = Math.max(0.22, (y1 - y0) * 0.8);
      dummy.position.set(x, W.heightAt(x, z) + h * 0.3, z);
      dummy.rotation.set(0.08 * Math.sin(i), i * 2.4, 0.12 * Math.cos(i));
      dummy.scale.set((x1 - x0) * 0.5, h, (z1 - z0) * 0.5); dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }
    stones.castShadow = stones.receiveShadow = true; scene.add(stones); owned.push(stones);
    scene.remove(source, foam);
    source.geometry.dispose(); source.material.dispose(); foam.geometry.dispose(); foam.material.dispose();
  }
  W.streamFoam = (W.streamFoam || []).filter(m => m.parent);
  const batch = (geo, count, opacity) => {
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('nodaAlpha', alpha);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb4c4ba, transparent: true, opacity, depthWrite: false, fog: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float nodaAlpha; varying float vNodaAlpha;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvNodaAlpha = nodaAlpha;');
      sh.fragmentShader = 'varying float vNodaAlpha;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNodaAlpha;');
    };
    mat.customProgramCacheKey = () => 'nodaWaterAlpha';
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); alpha.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.count = 0; scene.add(mesh);
    owned.push(geo, mat, mesh); return mesh;
  };
  const ringGeo = () => { const g = new THREE.RingGeometry(0.88, 1, 20); g.rotateX(-Math.PI / 2); return g; };
  const rings = batch(ringGeo(), 48, 0.48), lines = batch(ringGeo(), 128, 0.65);
  const drops = batch(new THREE.SphereGeometry(1, 5, 3), 144, 0.7);
  const waves = new Float32Array(48 * 4), spray = new Float32Array(144 * 7);
  // 全員分を先に確保。後から現れる兵も同じ空き枠を使い、毎コマ入れ物を作らない。
  const tracked = new Array(256).fill(null), steps = new Float32Array(256 * 3);
  const waterMeshes = [rings, lines, drops];
  let waveAt = 0, dropAt = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, alpha) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.geometry.attributes.nodaAlpha.setX(i, alpha);
  };
  let reduced = false, contact = 0;
  const visit = u => {
      const p = rt.player.u.pos;
      if (!u.alive || u.isStruct || u.farSim || u.naka || u.mounted || !u.mesh?.visible || (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 > 38 ** 2) return;
      let slot = tracked.indexOf(u);
      if (slot < 0) { slot = tracked.indexOf(null); if (slot < 0) return; tracked[slot] = u; steps[slot * 3] = u.pos.x; steps[slot * 3 + 1] = u.pos.z; steps[slot * 3 + 2] = 0; }
      const j = slot * 3, dx = u.pos.x - steps[j], dz = u.pos.z - steps[j + 1];
      const depth = W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y);
      if (depth < 0.06 || depth > 0.85) { steps[j] = u.pos.x; steps[j + 1] = u.pos.z; return; }
      const y = u.pos.y + depth + 0.025, cx = Math.cos(u.heading || 0), cz = -Math.sin(u.heading || 0);
      // 水面と脛の交点を左右の足に描き、停止中にも浸かる線を残す。
      for (let side = -1; side <= 1 && contact < 128; side += 2) {
        put(lines, contact++, u.pos.x + cx * side * 0.14, y, u.pos.z + cz * side * 0.14, 0.13, 1, 0.11, 0.8);
      }
      if (reduced) { steps[j] = u.pos.x; steps[j + 1] = u.pos.z; return; }
      if (dx * dx + dz * dz < 0.42 ** 2) return;
      steps[j] = u.pos.x; steps[j + 1] = u.pos.z; steps[j + 2] = 1 - steps[j + 2];
      const side = steps[j + 2] ? 1 : -1, x = u.pos.x + cx * side * 0.14, z = u.pos.z + cz * side * 0.14;
      const w = (waveAt++ % 48) * 4; waves[w] = x; waves[w + 1] = y; waves[w + 2] = z; waves[w + 3] = 0.8;
      for (let k = 0; k < 3; k++) {
        const s = (dropAt++ % 144) * 7, a = waveAt * 2.4 + k * 2.1;
        spray[s] = x; spray[s + 1] = y; spray[s + 2] = z;
        spray[s + 3] = Math.cos(a) * 0.65; spray[s + 4] = 1.1 + k * 0.25; spray[s + 5] = Math.sin(a) * 0.65; spray[s + 6] = 0.38;
      }
  };
  rt.flags.waterFeet = dt => {
    reduced = reduceMotion(); contact = 0;
    for (let i = 0; i < tracked.length; i++) if (tracked[i] && !tracked[i].alive) tracked[i] = null;
    visit(rt.player.u);
    for (const u of rt.army.units) if (u !== rt.player.u) visit(u);
    let n = 0;
    for (let i = 0; i < 48; i++) {
      const j = i * 4; waves[j + 3] = reduced ? 0 : Math.max(0, waves[j + 3] - dt);
      if (!waves[j + 3]) continue;
      const age = 0.8 - waves[j + 3], r = 0.16 + age * 0.85;
      put(rings, n++, waves[j], waves[j + 1], waves[j + 2], r, 1, r, waves[j + 3] / 0.8);
    }
    rings.count = n; n = 0;
    for (let i = 0; i < 144; i++) {
      const j = i * 7; spray[j + 6] = reduced ? 0 : Math.max(0, spray[j + 6] - dt);
      if (!spray[j + 6]) continue;
      spray[j] += spray[j + 3] * dt; spray[j + 1] += spray[j + 4] * dt; spray[j + 2] += spray[j + 5] * dt; spray[j + 4] -= 7 * dt;
      put(drops, n++, spray[j], spray[j + 1], spray[j + 2], 0.025, 0.045, 0.025, spray[j + 6] / 0.38);
    }
    drops.count = n; lines.count = contact;
    for (const mesh of waterMeshes) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.nodaAlpha.needsUpdate = true; }
  };
  const dispose = rt.dispose;
  rt.dispose = function () { for (const item of owned) item.dispose(); return dispose.call(this); };
}

const nodafukushima = {
  sideTaskAfter: true, // 今の任務は主の一件。護衛や櫓は「あとで」の札へ。
  noAllyReports: true, // 近い将の声だけを聞く。古い下知を使番で繰り返さない。
  uchisute: true, // 矢玉の下では首を拾わせず、帰った味方の証言で討ち取りを認める。
  battleVoices: { lines: { ally: { reload: [] } } }, // 時間だけで玉込めを知らせる声は止める。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  // 夜の任務には「退き口」が入るが、撤退の下知までは堤で斬り合う。
  frontlineDensity: { active: (rt) => !rt.flags.retreating && (rt.flags.step === 2 || rt.flags.step === 3),
    canSend: (rt, g) => g.team === 0 ? g === rt.flags.maeda || g === rt.flags.sassa : g === rt.flags.sally || g.ikko },
  taisho: { b: { def: true } }, // 砦の大将の討ち取りで、早鐘や撤退を飛ばさない。
  taishoRaidPath(g) {
    const c = g.center();
    if (c.z > FORT_Z + 3) return null;
    // 柵は左右の64mまで続く。自軍の柵でも通れないので、端の外へ回ってから浅瀬を渡る。
    const x = c.x < 0 ? -78 : 78;
    return [[x, c.z], [x, -24], [x, 10]];
  },
  spawn: { x: -10, z: -14, heading: Math.PI + 0.16 }, // 西の櫓へ向き、目の前に味方の押す二束も入れる。
  noHorse: true, // 竹束を押し、浅瀬を渡る局地は徒歩で出る。
  guideMarker(rt) {
    const F = rt.flags;
    return F.retreating ? 'retreat' : F.step === 0 ? 'maeda' : F.step === 1 ? (F.carry ? 'tabaWay' : 'pile') : F.step === 2 || F.step === 2.5 ? 'assault' : F.step === 3 ? 'leveeHold' : null;
  },
  world: {
    seed: 1570,
    wind: [0.9, -0.3],   // 西の海から。風向きは復元
    time: 'after',
    nightLift: 3.8,
    fireLightLift: 1.6, // 共通の四灯を使い回し、堤と人の輪郭へ暖かな光を足す。
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.55,
    waterSlow: true,   // 川・水路・水田が本当に足を遅くする（terrain_tags.js の 'water'。歩兵は遅く、騎馬はもっと遅い）
    paths: [[[ODA_HONJIN.x, 160], [ODA_HONJIN.x, ODA_HONJIN.z], [0, 12], [0, LEVEE_Z]], ...NODA_PLAN.paths.map(p => p.pts), ...FUKU_PLAN.paths.map(p => p.pts)],
    height,
    moveWay: tabaWay,
    tint(x, z, h, c) {
      // 川べりの葦と泥
      if (z < -16 && z > -42) c.lerp({ r: 0.42, g: 0.44, b: 0.32 }, 0.4);
    },
    clear: (x, z) => (z > -60 && z < 60 && Math.abs(x) < 90) || Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < 22 || (Math.abs(x) < 26 && z > -100 && z < -58) || (x > -142 && x < -102 && z > -106 && z < -48) || (z > 88 && z < 143 && ((x > -116 && x < -78) || (x > 80 && x < 116))),
    water: { x: -550, x2: SEA_EDGE, level: -0.6 },
    streams: [
      { pts: RIVER, w: 12, depth: 1.1, fords: [{ x: 0, w: 16 }, { x: -82, w: 12 }, { x: -122, w: 12 }, { x: 60, w: 12 }] },
      { pts: ISLAND_RIVER, w: 12, depth: 1.4 },
    ],
    // 摂津の低い田（淀川の河口の島々）
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 36 || x < SEA_EDGE + 10 || Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < 22) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260,
    tufts: 5200,
    treeDensity: (x, z) => (z > -70 && z < 70 ? 0.1 : 0.6),
    groves: [{ x: 90, z: 40, r: 14, n: 18 }, { x: -90, z: 50, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z < -170 || x > 174 || z > 174),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    installNodaNotices(rt);
    installDayCuts(rt);
    installNodaWater(rt);
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'night') { look.vis = Math.max(look.vis, 240); look.hemiI = Math.max(look.hemiI, 1.1); }
      return look;
    };
    F.step = 0; F.ek = 0; F.ak = 0; F.placed = 0; F.carry = false;
    // この戦だけ、実際に見えた射撃の煙を組頭が知らせる。構えからの予告は使わない。
    rt.army.hooks.onFoeReload = () => {};
    F.reloadScanAt = 0; F.reloadSayAt = 0; F.reloadVoice = 0;
    sagarifujiTex(); namuTex();
    resetGates(); flReset();
    // ---- 野田砦・福島砦：土塁と柵、冠木門、板葺きの登れる井楼、水堀 ----
    // 堀は組み立て側で一度加える。withHori を渡して二重に掘らない。
    const fortBase = (x, z) => baseHeight(x, z) + DORUI_H(x, z);
    const buildFort = plan => {
      const start = rt.scene.children.length;
      const C = buildCastlePlan(rt, plan, { baseHeight: fortBase, edgeW: 3, life: false, buildGates: true, buildTowers: true, team: 1 });
      // 共通部品は未造成の地面から水面を下げる。この戦の地面は既に堀底なので、
      // 最初に作られる水面を底より深さの六割五分だけ上へ戻す（土橋の切れ目は維持）。
      plan.hori.forEach((q, i) => {
        const m = rt.scene.children[start + i];
        if (m?.isMesh && m.geometry?.type === 'BufferGeometry') { m.geometry.translate(0, q.deep * 1.2, 0); m.geometry.computeBoundingSphere(); }
      });
      return C;
    };
    F.noda = buildFort(NODA_PLAN);
    F.fuku = buildFort(FUKU_PLAN);
    F.noda.height = F.fuku.height = height;
    F.nodaGate = makeGate(rt, F.noda.gateObjs.mon, { name: NODA_GATE.name, guardTeam: 1 });
    F.fukuGate = makeGate(rt, F.fuku.gateObjs.mon, { name: FUKU_GATE.name, guardTeam: 1 });
    // 束34：土橋（野田砦・福島砦の水堀の渡り口）を、一揆勢の物見に足す（知らせだけ。縄張り・勝ち方は変えない）
    F.fordWatch = fordWatch(rt, { fords: [[0, -42], [-122, -54]], team: 1, range: 26 });
    // 総攻めは門前まで。史実どおり落城前に囲みを解くため、塀・門は壊させない
    // 門も同じ（追いかけた味方が門を破って砦の奥の三好の本陣まで雪崩れ込み、夜の筋の前に戦が終わらないように）
    for (const s of [...F.noda.walls, ...F.fuku.walls, F.nodaGate.struct, F.fukuGate.struct]) if (s && s.seg) { s.noTarget = true; s.wall = true; s.hp = s.maxHp = 1e9; }
    // ---- 野田砦の左右の柵（岸の広場の柵から、川べりを東西へ） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fortWall = noT(wallLine(rt, [[-64, FORT_Z + 2], [-30, FORT_Z], [-20.5, FORT_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.fortWall.push(...noT(wallLine(rt, [[20.5, FORT_Z], [30, FORT_Z], [64, FORT_Z + 2]], { team: 1, hp: 1e9, name: '柵', segLen: 5 })));
    // 兵の中央広場を避けた番所・長屋・詰所。板葺き、共通の戸口・床・室内。
    // 城の購入部品の板床と、和の部屋の部品は naka.js の近づいた時の組み立てで使う。
    F.fortHouses = FORT_BUILDINGS.map(b => goten(rt, b.x, b.z, { ...b, tile: false, naka: true, profile: 'mitsukuri', door: 1, doorX: 0, team: 1, noTarget: true }));
    // 仮設の河川砦の外壁は板壁として補う。共通材質そのものは書き換えない。
    for (const house of F.fortHouses) house.mesh.traverse(m => { if (m.isMesh && m.material === castleMat('plaster')) m.material = castleMat('wood'); });
    const huts = makeSimpleBatch();
    for (const [x, z, w, d] of FORT_STORES) hut(W, x, z, w, d, 0, { ita: true, minka: false, wall: 0x6a5238, batch: huts });
    for (const [x, z] of [[-40, FORT_Z - 3], [-12, FORT_Z - 3], [12, FORT_Z - 3], [40, FORT_Z - 3], [0, -70]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 福島の砦（西の島。遠く）
    for (const [x, z] of [[-128, -62], [-104, -64], [-122, -92]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 河口の村と田の遠景。位置・棟数は推定。遠い小屋は材質ごとにまとめる。
    for (const [x, z] of [[-92, 96], [-106, 110], [-86, 123], [91, 102], [107, 116], [89, 133]]) hut(W, x, z, 7, 5, 0.2, { minka: false, batch: huts });
    finalizeSimpleBatch(rt, huts);
    // ---- 水際の乱杭・陸路の逆茂木（野田・福島とも、柵の切れ目でない所から回り込めないように） ----
    for (const pts of RANKUI_LINES) rankuiLine(rt, pts);
    for (const pts of SAKAMOGI_LINES) sakamogiRow(rt, pts, { team: 1, hp: 140, spacing: 5 });
    // ---- 堤の土塁（鉄砲衆の胸壁） ----
    F.dorui = nodaLevee(rt);
    // 持ち場のすぐ両脇に柵と火。中央の戻り道と、南東の寄せ道は空ける。
    for (const pts of [[[-12, LEVEE_Z - 2.5], [-5, LEVEE_Z - 2.5]], [[18, LEVEE_Z - 2.5], [25, LEVEE_Z - 2.5]]]) {
      wallLine(rt, pts, { team: 0, name: '堤の柵', hp: 400 });
    }
    for (const [x, z] of [[-3, LEVEE_Z + 4], [16, LEVEE_Z + 4], [-22, LEVEE_Z + 3], [34, LEVEE_Z + 3]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z);
    }
    // ---- 石山本願寺（遠く、南東の台地の上） ----
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 15, 9, 0.6 + Math.PI, { h: 4.2 }));   // 本願寺の御影堂（瓦の大屋根。正面は織田の陣の側）
    // 御堂の手前の鐘楼。遠景の目印だけで、当たりと戦う兵は増やさない。
    const bellTower = new THREE.Group(), wood = castleMat('wood');
    const postGeo = new THREE.BoxGeometry(0.35, 5, 0.35);
    for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) {
      const post = new THREE.Mesh(postGeo, wood); post.position.set(x, 2.5, z); bellTower.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), wood); roof.rotation.y = Math.PI / 4; roof.position.y = 5.4; bellTower.add(roof);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 1.7, 8), new THREE.MeshLambertMaterial({ color: 0x777150 })); bell.position.y = 3.7; bellTower.add(bell);
    F.bellGeos = [postGeo, roof.geometry, bell.geometry]; F.bellMat = bell.material;
    bellTower.position.set(HONGAN.x - 20, W.heightAt(HONGAN.x - 20, HONGAN.z - 24), HONGAN.z - 24); rt.scene.add(bellTower);
    for (const [x, z, w, d] of [[HONGAN.x - 22, HONGAN.z + 10, 10, 7], [HONGAN.x + 14, HONGAN.z - 16, 10, 7]]) rt.scene.add(hut(W, x, z, w, d, 0.6, { h: 3.6, wall: 0x7a5a3c, roof: 0x3a3430 }));
    for (const [x, z] of [[HONGAN.x - 20, HONGAN.z - 12], [HONGAN.x - 6, HONGAN.z - 20], [HONGAN.x + 8, HONGAN.z - 26]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    // ---- 織田勢：前田利家の手（自分の持ち場）、佐々成政の手、鉄砲衆 ----
    F.maeda = allyGroup(rt, { fixed: true, name: '前田利家の手', anchor: { x: 0, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, allyOk: true } }, { type: 'ashigaru', n: 14 }], ODA));
    F.maedaU = F.maeda.units[0];
    F.sassa = allyGroup(rt, { fixed: true, name: '佐々成政の手', anchor: { x: -30, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true, allyOk: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }], ODA));
    F.teppo = allyGroup(rt, { fixed: true, formation: 'line', name: '織田の鉄砲衆', anchor: { x: 26, z: LEVEE_Z + 2 }, facing: Math.PI, width: 12, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.maeda, F.sassa, F.teppo];
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -8, z: LEVEE_Z + 4 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦の鉄砲 ----
    F.fortGun = enemyGroup(rt, { faction: 'saito', name: '砦の鉄砲', anchor: { x: 0, z: FORT_Z - 2.5 }, facing: 0, width: 30, aggro: 50, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }, { type: 'bow', n: 3 }], MIYOSHI));
    // ---- 陣と旗・竹束の置き場 ----
    // 堤の南東の詰め陣：信長と旗本（信長で遊ぶ時は旗本だけ）。天王寺の本陣とは区別する。
    F.campA = camp(rt, { x: ODA_HONJIN.x, z: ODA_HONJIN.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 300, runTo: { x: 0, z: LEVEE_Z + 10 } });
    rt.scene.add(tawara(W, ODA_HONJIN.x - 14, ODA_HONJIN.z - 14, 0.4, 6));
    for (const [x, z, k] of [[ODA_HONJIN.x - 6, ODA_HONJIN.z - 10, 'oda'], [ODA_HONJIN.x + 6, ODA_HONJIN.z - 10, 'eiraku'], [-40, 0, 'oda'], [40, 0, 'oda'], [-4, LEVEE_Z + 4, 'oda'], [30, LEVEE_Z + 5, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    F.pileMeshes = SPOTS.map((q, i) => { const m = takeTaba(W, q.x, q.z - 3, 0); rt.scene.add(m); return m; });
    // 堤の上に、はじめから据えてある竹束（鉄砲衆の前）。陰の者には砦からの矢玉がほとんど当たらない
    patchGunCover(rt);
    for (const [x, z] of LEVEE_TABA) this.cover(rt, x, z);
    // ---- 大軍（軽い作り）：詰め陣の後ろの控え ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(40, 90, 36, 14, 240, Math.PI, 0x2b3140, flagTexture('oda'), 15703);
    // 堤の手前に構える織田の手（見た目だけ。起こさない）：竹束を据える所の左右に、川を挟んで砦と睨み合う大軍
    for (const [x, z, s, k] of [[-24, -2, 15704, 'oda'], [30, -1, 15705, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 100, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const [x, z] of [[-20, 60], [24, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 部隊（butai.js）：囲む織田の手・野田と福島の三好勢。本物はほんの少し（遠くで戦う軽い作り。携帯の重さのため名目も小さめ） ----
    const mk = (o, real) => capReal(makeButai(rt, { real, lightWidth: 24, lightDepth: 18, ...o }), real);
    F.bOdaW = mk({ name: '柴田勝家の手', general: '柴田勝家', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 160, armor: 0x2b3140, flag: 'oda', at: { x: -82, z: 10 }, facing: Math.PI }, 0);
    F.bOdaE = mk({ name: '根来・雑賀の鉄砲衆', team: 0, faction: 'oda', kind: 'gun', nominal: 140, armor: 0x2b3140, flag: 'eiraku', at: { x: 84, z: 6 }, facing: Math.PI }, 0);
    F.bOdaS = mk({ name: '佐久間信盛の手', general: '佐久間信盛', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: 0x2b3140, flag: 'oda', at: { x: 56, z: 34 }, facing: Math.PI * 0.75 }, 0);
    F.bNoda = mk({ name: '野田砦の三好勢（三好長逸）', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 100, armor: 0x35382c, flag: 'miyoshi', at: { x: 0, z: -63 }, lightWidth: 26, lightDepth: 10, facing: 0 }, 0);
    F.bFuku = mk({ name: '福島砦の三好勢（三好宗渭）', general: '三好宗渭', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 100, lightWidth: 20, lightDepth: 16, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -74 }, facing: 0.15 }, 0);
    F.bFukuGun = mk({ name: '福島砦の鉄砲', team: 1, faction: 'saito', kind: 'gun', nominal: 40, lightWidth: 20, lightDepth: 4, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -61 }, facing: 0 }, 0);
    F.bSally = mk({ name: '浅瀬を渡る三好の本隊（岩成友通）', team: 1, faction: 'saito', kind: 'ashigaru', nominal: 150, armor: 0x33302a, flag: 'miyoshi', at: { x: -82, z: -62 }, facing: 0 }, 0);
    for (const b of [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally]) b.order({ id: 'hold' });
    F.bAll = [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally];
    F.lightOda = [F.bOdaE, F.bOdaS];
    F.namedGuards = [];
    for (const [name, x, z, team, facing] of [['柴田勝家', -82, 16, 0, Math.PI], ['佐久間信盛', 56, 42, 0, Math.PI * 0.75], ['三好宗渭', -122, -84, 1, 0]]) {
      const o = { fixed: true, name: name + 'の旗本', anchor: { x, z }, facing, formation: 'yari', width: 7, aggro: 8, noRout: true, faction: team ? 'saito' : 'oda' };
      const list = dress([{ type: 'busho', n: 1, o: { name, invuln: true, allyOk: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], team ? MIYOSHI : ODA);
      F.namedGuards.push(team ? enemyGroup(rt, o, list) : allyGroup(rt, { ...o, fullStrength: true }, list));
    }
    // 野田砦の奥（本陣の曲輪）の三好の本陣：三好長逸と旗本（控えは軽い兵）。旗本は整った陣形で待つ
    // 幅十六の陣幕は左右の詰所・長屋の中を横切る。幕と荷を中央の八歩へ収める。
    F.campB = camp(rt, { x: 0, z: -84, w: 8, compact: true, tate: false, facing: 0, team: 1, faction: 'saito', mon: 'miyoshi', armor: 0x35382c, general: { name: '三好長逸', hat: 'kabuto_m', haori: 0x3a3a2a }, guard: 15, reserve: 0, runTo: { x: 10, z: FORT_Z - 6 } });
    for (const u of F.campA.guard.units) { u.pos.z -= 27; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    F.campA.guard.anchor.z = ODA_HONJIN.z - 16; // 北向きの詰め陣の前。共通の camp は南側に置くため補正
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'yari'; if (c.general) c.general.allyOk = true; }
    F.sally = enemyGroup(rt, { faction: 'saito', name: '砦の前の三好勢', anchor: { x: -4, z: -37 }, facing: 0, width: 12, aggro: 5, seekRange: 12, morale: 90, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '岩成友通', invuln: true, allyOk: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], MIYOSHI));
    // 本願寺の先陣は早鐘の後に畦道から出す。昼の浅瀬の斬り合いには加わらない。
    F.waves = [];
    // ---- 持ち場の区域（siege_zones.js）：堤の上・織田の詰め陣（味方）、野田砦・福島砦（三好） ----
    const LZ = LEVEE_ZONE;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'levee', name: '堤の持ち場', start: ZONE_STATE.FRIEND, test: (x, z) => x > LZ.x0 && x < LZ.x1 && z > LZ.z0 && z < LZ.z1, pos: { x: 0, z: LEVEE_Z }, need: 8, hold: 14 },
        { id: 'honjin', name: '織田の詰め陣', start: ZONE_STATE.FRIEND, test: (x, z) => Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < ODA_HONJIN.r, pos: ODA_HONJIN, need: 8, hold: 16 },
        // kaito 10/1：野田・福島の hold を 20→14 に詰めた（遊んで10分ほどかかる戦を4〜7分に）
        { id: 'noda', name: '野田砦', test: F.noda.kuruwa.kishi.test, pos: F.noda.kuruwa.kishi.centroid, need: 10, hold: 14 },
        { id: 'fuku', name: '福島砦', test: F.fuku.kuruwa.kishi.test, pos: F.fuku.kuruwa.kishi.centroid, need: 10, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => this.onZone(rt, id),
    });

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', '利家の下知を聞け', 'main', true);
    rt.say('前田利家', `${nm(rt)}、川向こうが野田砦じゃ。三好の鉄砲が狙うておる。頭を下げよ`, 5);
    rt.banner('水路の向こうの二つの砦', '竹束と鉄砲の列を前に、野田・福島へ総攻め');
    rt.say('前田利家', '殿は和睦を許されぬ。野田も福島も攻め落とすぞ', 4.5);
    rt.say('組頭', '竹束を前へ押せ。首に構うな、槍を揃えよ', 4.5);
    // 印の前田に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('maeda', unitPos(F.maedaU), '前田利家（話を聞く）', {});
    rt.addInteract('talk', { x: 0, z: LEVEE_Z + 6 }, '前田利家の話を聞く', () => { rt.uninteract('talk'); rt.say('前田利家', rt.G.lord ? '殿、竹束はいずこへ据えまするか' : 'よし、竹束を川べりへ押し出せ', 2); rt.after(2, () => this.carryStart(rt)); }, { r: 5 });
    rt.after(5, () => this.carryStart(rt));
    // 砦との撃ち合いの音（遠くで絶えず）
    F.shotT = 3;
    F.shotPos = { x: 0, z: 0 };
    for (const x of [-49, 49]) for (const z of [LEVEE_Z + 5, -15]) rt.scene.add(nobori(W, x + (x < 0 ? -2 : 2), z, 'oda', 4));
    this.carryStart(rt); // 下知を聞きながら、味方が二束を押す場面で始める。
  },

  // 竹束（弾よけ）の当たり
  cover(rt, x, z) {
    // 見た目と「陰の者に前からの矢玉がほとんど当たらない」は taketaba.js の竹束（据え置き）。当たりはここで足す
    addTaba(rt, x, z, 0, { fixed: true, rot: Math.PI });
    const s = rt.army.addStruct({ seg: [x - 0.9, z, x + 0.9, z], nx: 0, nz: -1, hp: 1e9, maxHp: 1e9, team: 0, name: '竹束' });
    s.noTarget = true;
    return s;
  },

  // ① 竹束を運ぶ。本人の一束と、前田の足軽二組の二束を同時に押す。
  carryStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('carry');
    rt.unmark('maeda'); rt.uninteract('talk');
    F.spots = SPOTS.map((q) => ({ ...q }));
    F.tabaDone = [false, false, false]; F.tabaHelpers = []; F.pickIndex = 0;
    // 目の前の利家と竹束の案内。遠い本陣の使番待ちで、初めの任務を残さない。
    rt.obj('main', rt.G.lord ? '竹束の置き場を命じ、堤で待て' : '竹束を押し、印へ据えよ', 'main', true);
    const begin = (i) => {
      if (F.step !== 1) return;
      rt.unmark('tabaCenter'); rt.unmark('tabaWest');
      if (i === 1) for (const q of F.spots) q.x -= 16;
      rt.say('前田利家', rt.G.lord ? '三束とも足軽に押させ申す。殿、堤の守りにも御下知を' : '残る二束は組の者に押させる。手の足りぬ所は助けてやれ', 3.5);
      this.startTabaHelpers(rt);
      this.nextPick(rt);
    };
    if (HI(rt) || rt.G.lord) rt.after(2, () => {
      if (F.step !== 1) return;
      // 既存の戦場・地図の印を使い、選んだら候補の印を消す。
      rt.marker('tabaCenter', { x: 0, z: -14 }, '候補・中央（鉄砲衆の前）', { h: 2 });
      rt.marker('tabaWest', { x: -16, z: -14 }, '候補・西（浅瀬寄り）', { h: 2 });
      rt.choose('前田「竹束は中央か、西の浅瀬寄りか？」', [
        { label: '中央に並べる', note: '鉄砲衆の前へ据える' },
        { label: '西に並べる', note: '西の浅瀬近くへ据える' },
      ], begin, 15);
    });
    else begin(0);
  },
  // 川へ下りず、胸壁の端を回る。竹束そのものが全ての角を通る。
  tabaRoute(mesh, spot) {
    const edge = spot.x < 0 ? -49 : 49;
    const path = [];
    if (mesh.position.z > LEVEE_Z - 4) {
      path.push({ x: mesh.position.x, z: LEVEE_Z + 5 });
      path.push({ x: edge, z: LEVEE_Z + 5 });
      path.push({ x: edge, z: -15 });
    }
    path.push({ x: spot.x, z: -15 }, spot);
    return path;
  },
  startTabaHelpers(rt) {
    const F = rt.flags, source = F.maeda;
    for (let i = rt.G.lord ? 0 : 1; i < SPOTS.length; i++) {
      if (F.tabaDone[i] || F.tabaHelpers.some((h) => h.i === i && !h.done)) continue;
      const workers = source.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.atk && !u.target?.alive && u.type === 'ashigaru').slice(-2);
      if (workers.length < 2) continue;
      const mesh = F.pileMeshes[i];
      const g = rt.army.addGroup({ team: 0, faction: 'oda', name: '竹束を押す足軽', order: 'hold', formation: 'line', width: 2, spacing: 1.2, aggro: 0, noRout: true, anchor: { x: mesh.position.x, z: mesh.position.z + 1.3 } });
      for (const u of workers) {
        source.units.splice(source.units.indexOf(u), 1);
        u.group = g; u.slot = g.units.length; u.target = null; u.moveTo = null; u.aiT = 0;
        g.units.push(u);
      }
      source.initial = source.units.length;
      source.units.forEach((u, j) => { u.slot = j; });
      g.initial = g.units.length;
      placeGroup(rt, g, g.anchor.x, g.anchor.z); // 堤の前へ運んだ場面から、二人で押し始める。
      F.tabaHelpers.push({ i, g, mesh, path: this.tabaRoute(mesh, F.spots[i]), at: 0, next: { x: 0, z: 0 } });
    }
  },
  returnTabaWorkers(rt, h) {
    const source = rt.flags.maeda;
    for (const u of h.g.units) {
      u.group = source; u.slot = source.units.length; u.moveTo = null; u.aiT = 0;
      u.body.rotation.x = 0;
      source.units.push(u);
    }
    source.initial = source.units.length;
    h.g.units.length = 0; h.g.initial = 0; h.done = true;
  },
  tickTabaHelpers(rt, dt) {
    const F = rt.flags;
    for (const h of F.tabaHelpers || []) {
      if (h.done) continue;
      if (h.g.units.some((u) => !u.alive || u.fleeing || u.woundOut)) { this.returnTabaWorkers(rt, h); this.nextPick(rt); continue; }
      const q = h.path[h.at], m = h.mesh.position;
      const dx = q.x - m.x, dz = q.z - m.z, d = Math.hypot(dx, dz);
      if (d < 0.2) {
        if (++h.at < h.path.length) continue;
        this.cover(rt, m.x, m.z); rt.scene.remove(h.mesh);
        F.tabaDone[h.i] = true; F.placed++;
        this.returnTabaWorkers(rt, h);
        this.tabaProgress(rt);
        continue;
      }
      const nx = dx / d, nz = dz / d;
      h.g.anchor.x = m.x - nx * 1.3; h.g.anchor.z = m.z - nz * 1.3;
      h.g.facing = Math.atan2(nx, nz);
      for (const u of h.g.units) if (!u.atk && !u.target?.alive) {
        u.body.rotation.x = 0.12; u.armL.rotation.x = u.armR.rotation.x = -1.1;
      }
      // 実兵が追いつき、交戦していない時だけ押す。隊の要だけで束を進めない。
      let ready = true; h.blocked = false;
      for (const u of h.g.units) if (!u.alive || u.fleeing || u.woundOut || u.stagger > 0 || u.atk || u.target?.alive || Math.hypot(u.pos.x - h.g.anchor.x, u.pos.z - h.g.anchor.z) > 2) ready = false;
      if (!ready) continue;
      const step = Math.min(d, dt * 0.9);
      h.next.x = m.x + nx * step; h.next.z = m.z + nz * step;
      h.blocked = !rt.world.walkable(h.next.x, h.next.z) || rt.army.wallBetween(m, -1, h.next);
      if (h.blocked) continue;
      m.set(h.next.x, rt.world.heightAt(h.next.x, h.next.z), h.next.z);
      h.mesh.rotation.y = h.g.facing;
    }
  },
  // 置き場や一度置いた実物から押し始める。向きを変えても束を移さない。
  backTaba(rt, on) {
    const F = rt.flags;
    if (on) F.backMesh = F.pileMeshes[F.pickIndex];
    else if (F.backMesh) { rt.scene.remove(F.backMesh); F.backMesh = null; }
  },
  nextPick(rt) {
    const F = rt.flags;
    if (F.carry || F.step !== 1) return;
    const i = F.tabaDone.findIndex((done, j) => !done && !F.tabaHelpers.some((h) => h.i === j && !h.done));
    rt.uninteract('pile'); rt.unmark('pile');
    if (i < 0 || rt.G.lord) return;
    F.pickIndex = i;
    const pos = F.pileMeshes[i].position;
    rt.marker('pile', pos, i > 0 ? '人手不足の竹束・代わりに押す' : '竹束・長押しで押す', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.addInteract('pile', pos, '竹束を押す', () => {
      F.carry = true;
      this.backTaba(rt, true);
      F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
      F.carryNext = { x: 0, z: 0 };
      F.carryPath = this.tabaRoute(F.backMesh, F.spots[i]); F.carryAt = 0;
      rt.uninteract('pile'); rt.unmark('pile');
      rt.marker('tabaWay', () => F.carry ? F.carryPath[F.carryAt] : null, '運び道・この印へ押す', { h: 2, guideAlways: true, alwaysDistance: true });
      const s = F.spots[i];
      rt.marker('spot', s, '竹束を据える', { h: 2 }); rt.zone('spot', s.x, s.z, 2);
      rt.addInteract('spot', s, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2, prio: 4 });
      rt.addInteract('tabaDrop', rt.player.u.pos, '竹束を置いて向きを変える', () => {
        F.carry = false; F.backMesh = null;
        rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
        this.nextPick(rt);
        rt.bark('竹束を置いた。反対側へ回り、長押しで押せ');
      }, { r: 3, hold: 0.8 });
      rt.bark('道の印へ押せ。つかえたら置き、反対側へ回れ');
    }, { r: 3, hold: 0.8, prio: 1 });
  },
  place(rt) {
    const F = rt.flags, s = F.spots[F.pickIndex];
    if (!F.carry || Math.hypot(F.backMesh.position.x - s.x, F.backMesh.position.z - s.z) > 2.8) { rt.bark('竹束を据える印へ押せ'); return; }
    // 据え位置への瞬間移動を避け、運んだ実物の場所へ据える。
    this.cover(rt, F.backMesh.position.x, F.backMesh.position.z);
    rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
    F.tabaDone[F.pickIndex] = true; F.placed++; F.carry = false;
    this.backTaba(rt, false);
    rt.award((t) => { t.special = { label: '竹束を据えた', pts: (t.special?.pts || 0) + 4 }; }, '竹束を据えた');
    this.tabaProgress(rt); this.nextPick(rt);
  },
  tabaProgress(rt) {
    if (rt.flags.placed >= SPOTS.length) {
      rt.award((t) => t.side.push('組で竹束を並べた'), '組で竹束を並べた');
      this.sallyStart(rt);
    }
    else rt.objProgress('main', `竹束 ${rt.flags.placed}／${SPOTS.length}束。残りの竹束を押せ`);
  },

  // ② 織田の総攻め。浅瀬を渡り、打って出た三好勢を押し戻す
  sallyStart(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('assault');
    // 据えきれない束はその場に残し、運び手も槍の列へ戻す。
    F.carry = false; F.backMesh = null;
    for (const h of F.tabaHelpers || []) if (!h.done) this.returnTabaWorkers(rt, h);
    for (const id of ['pile', 'spot', 'tabaWay', 'tabaDrop', 'tabaCenter', 'tabaWest']) { rt.uninteract(id); rt.unmark(id); }
    rt.unzone('spot');
    rt.obj('main', '浅瀬へ進み、味方と三好勢を押し戻せ', 'main', true);
    rt.marker('assault', { x: 0, z: -21 }, '浅瀬の入口・ここから北へ', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.say('前田利家', F.placed >= SPOTS.length ? '竹束は据わったぞ！　鉄砲衆、放て！　槍の者は浅瀬へ続け！' : '束は置け！　寄せるぞ、鉄砲衆は槍の者を援けよ！', 3.5);
    F.teppo.order = 'move'; F.teppo.dest = { x: 0, z: LEVEE_Z - 1 }; F.teppo.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: LEVEE_Z - 1 }; };
    rt.after(7, () => {
      if (F.step !== 2) return;
      // 砦の門の前（土橋の外）から、竹束を押し立てて浅瀬をゆっくり渡り、渡りきったら堤へ掛かる（束5：攻め手は竹束で寄せる）
      F.sally.name = '打って出た三好勢';
      F.sally.order = 'move'; F.sally.dest = { x: -2, z: LEVEE_Z - 13 }; F.sally.speed = 1.3;
      const charge = (g) => { if (g.order === 'attack') return; g.order = 'attack'; g.seekRange = 70; g.aggro = 14; rt.say('岩成友通', '竹束を捨てよ！　堤へ掛かれ！', 2.5); };
      F.sally.onArrive = charge;
      rt.after(8, () => { if (F.step === 2 && !gone(F.sally)) charge(F.sally); });
      for (const off of [-4, 0, 4]) addTaba(rt, -4 + off, -34, 1, { van: F.sally, off, faceSign: 1, vanDist: 3, rot: 0 });
      // 西では、福島から渡った三好の本隊と柴田の手が、堤の西の端の向こうで押し合う（軽い作り）
      F.bSally.order({ id: 'move', to: { x: -82, z: -26 } });
      F.bOdaW.order({ id: 'move', to: { x: -122, z: -40 } });
      F.bOdaE.order({ id: 'move', to: { x: 60, z: -16 } });
      F.clashW = true;
      // 控えは西の島側に残す。中央の攻め手が押し返されても、戦う兵の背へ追従して埋めない。
      const rear = rt.world.addBacking({ x: -82, z: -50, facing: 0, flag: 'miyoshi', armor: 0x33302a, kind: 'spear', w: 22, depth: 12, gap: 8, count: 100, seed: 15707 });
      rear.army.team = F.sally.team;
      (F.backs = F.backs || []).push({ b: rear, g: F.sally });
      // 左右でも、浅瀬を渡る織田の大軍が二つの砦へ押し寄せる（軽い作り）
      F.lines = lines(rt, [
        { x: -82, z: -18, facing: Math.PI, w: 20, seed: 15708, A: ['oda', 0x2b3140, 90, 'oda'], B: ['miyoshi', 0x33302a, 100, 'saito'], gunsA: true, gunsB: true },
        { x: 60, z: -15, facing: Math.PI, w: 20, seed: 15709, A: ['oda', 0x2b3140, 80, 'oda'], B: ['miyoshi', 0x33302a, 100, 'saito'], gunsB: true },
      ]);
      F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
      sfx('horagai', 0.6);
      rt.army.play('eshout', { x: 0, z: -40 }, 1.6);
      rt.banner('野田・福島へ総攻め', '鉄砲衆が放つ。浅瀬へ三好の槍が出る');
      rt.obj('main', '三好勢を押し戻し、砦前へ進め', 'main', true);
      rt.marker('assault', { x: 0, z: -37 }, '浅瀬の先・野田砦へ', { h: 2, guideAlways: true, alwaysDistance: true });
      rt.say('前田利家', '三好が出たぞ！　浅瀬で食い止めよ、槍先を下げるな！', 3.5);
      rt.after(5, () => rt.say('前田利家', '泥に足を取られるぞ。浅瀬を選べ、深みへ踏み込むな', 3.5));
      // 一斉射：鉄砲衆は竹束の陰で込めたまま待ち、三好勢が浅瀬を上りきる所で揃えて放つ
      volleyScene(rt, { guns: () => [F.teppo], at: { x: 0, z: LEVEE_Z - 6 }, r: 12, who: '前田利家', shots: 3, wait: 'まだ撃つな……浅瀬を上りきるまで待て',
        banner: ['一斉射', '竹束の陰から、鉄砲衆が揃えて放つ'], clash: () => F.lines });
      rt.zone('levee', 0, LEVEE_Z - 2, 22);
      rt.marker('sally', centerOf(F.sally), '三好の槍の列', { red: true, group: F.sally });
      // 西へ偏った二段の横陣では端の持ち場が深みに入る。三段に詰め、浅瀬の左右へ通す。
      for (const [g, x] of [[F.maeda, 6], [F.sassa, -6]]) {
        g.yariRanks = 3;
        g.order = 'move'; g.dest = { x, z: -37 }; g.aggro = 14;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; };
      }
    });
  },

  // ②の後の段（昼）：中洲を押さえて砦へ迫る → ③へ
  midA(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.botRest = false; // 次の段の退避判断へ渡し、前の休止で攻撃を止めない。
    rt.unmark('sally'); rt.unmark('assault'); rt.unzone('levee');
    if (!late) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    F.sallyDone = !late;
    if (late) rt.say('前田利家', 'ここは押し切れぬ。砦の口を押さえ、備えを崩すな', 3.5);
    F.midT = rt.t;
    rt.obj('main', '砦前で槍を揃え、竹束に隠れよ', 'main', true);
    rt.marker('assault', { x: 0, z: -37 }, '砦の口・槍を揃える', { h: 2 });
    rt.say('前田利家', '門は固いぞ。散るな、竹束を盾に塀際を押さえよ', 3.5);
  },
  // 退き口を保ったら、敵を追わず囲みを解く
  midB(rt) {
    if (rt.flags.step !== 3) return;
    rt.flags.step = 3.5;
    this.win(rt);
  },

  // ③ 夜、本願寺の早鐘
  night(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('night');
    rt.unmark('sally'); rt.unmark('assault');
    rt.obj('main', '堤へ戻り、背後の敵を防げ', 'main', true);
    rt.marker('leveeHold', { x: 8, z: LEVEE_Z + 4 }, '篝火の間・堤の持ち場', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.unzone('levee');
    if (!late && !F.sallyDone) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    // 三好の守りは崩れていない。織田の攻めを止める。
    for (const c of F.lines || []) c.phase = 'wait'; // 既存の待機状態へ戻し、敗走と消去を起こさない
    // 本願寺の側（南東）から寄せる一揆の大群と、堤の東の端の味方が押し合う（軽い作り）
    rt.after(4, () => {
      if (F.ending) return;
      F.lines2 = lines(rt, [{ x: 28, z: 4, facing: Math.PI * 0.25, w: 22, gap0: 12, seed: 15710, surge: false, A: ['oda', 0x2b3140, 120, 'oda'], B: ['namu', IKKO.armor, 180, 'saito'], gunsB: true }]);
      F.lines2.forEach((c) => c.go());
      leanAll(F.lines2, 'B', 0.3);
    });
    dayCut(rt, 12, 'night', 'その夜・本願寺の早鐘', '石山から鐘が鳴る。背後の寄せに備えよ');
    for (let k = 0; k < 8; k++) rt.after(3 + k * 0.9, () => sfx('kane', 0.9 - k * 0.07));
    // 本願寺の台地から、松明を持った門徒の列が下りてくる（遠景）
    F.monto = rt.world.addDistantArmy({ x: 92, z: 78, w: 12, d: 34, count: 160, facing: -Math.PI * 0.75, armor: IKKO.armor, team: 1, flagTex: namuTex(), seed: 15706 });
    F.monto.army.noWake = true;
    rt.after(6, () => { if (F.monto.advance) F.monto.advance(50, 70); });
    // 炎も門徒の列と同じ移動量で進める。遠い炎に光や煙の枠を費やさない。
    F.remoteTorches = [];
    for (let k = 0; k < 7; k++) {
      const x = 80 + k * 3.5, z = 66 + k * 3.5, f = rt.world.addFire(x, z, { torch: true, h: 2.2 });
      f.lit = false;
      if (f.smoke != null) { rt.world.removeSmokeColumn(f.smoke); f.smoke = null; }
      F.remoteTorches.push({ x, z, f });
    }
    rt.world.addFire(HONGAN.x - 20, HONGAN.z - 24, { torch: true, h: 3.7 }).lit = false;
    rt.after(4, () => {
      rt.say('足軽', '……本願寺の鐘だがや！　後ろから松明が寄ってくるぞ！', 3.5);
      rt.say('前田利家', '本願寺も敵に回ったぞ！　堤へ返せ、背後の寄せを受けよ！', 4.5);
    });
    rt.after(160, () => {
      if (F.step !== 3 || F.ending) return;
      F.kyotoNews = true;
      dayCut(rt, 22, 'day', '対陣を重ねて・九月二十二日', '浅井・朝倉が醍醐・山科を焼いた');
      battleEvent(rt, EVENT_MESSENGER, { x: 6, z: LEVEE_Z + 3 }, null, 0, true, '浅井・朝倉が京へ迫る知らせ');
      rt.say('伝令', '浅井・朝倉、逢坂を越え、醍醐・山科を焼き払い申した！　京が危のうござる！', 4.5);
      rt.obj('main', '堤を守り、退きの下知を待て', 'main', true);
      rt.after(6, () => rt.say('前田利家', '京を敵に踏ませるわけにはゆかぬ。退き口を固めよ！', 3.5));
    });
    // 本願寺の方に篝火
    for (const [x, z] of [[120, 120], [100, 96], [134, 90]]) rt.world.addFire(x, z, { torch: true, h: 1.4 });
    // 夜番の何人かが松明を持つ（組の者と前田の手の足軽）
    rt.after(4, () => { F.torches = carryTorches(rt.world, [...rt.squad.filter((u) => u.alive).slice(0, 2), ...F.maeda.units.filter((u) => u.type === 'ashigaru').slice(0, 3)]); });
    // 味方は堤の上で南東を向く
    for (const [g, x] of [[F.maeda, 6], [F.sassa, -16], [F.teppo, 22]]) {
      g.onArrive = null; g.order = 'hold'; g.anchor = { x, z: LEVEE_Z + 3 }; g.facing = Math.PI * 0.2; g.aggro = 14;
      if (g !== F.teppo) { g.formation = 'yari'; g.width = 10; }
      // 将の列は台本どおり保ち、無名の槍兵だけは近い敵と斬り合えるようにする。
      if (g !== F.teppo) { g.noAI = true; g.ai = true; g.frontlineMobilize = true; }
    }
    F.day = 12;
    rt.after(45, () => { if (F.step === 3 && !F.ending) dayCut(rt, 13, 'night', '翌夜・川口の寄せ', '楼の岸と川口に鉄砲の火。堤の口を守れ'); });
    rt.after(95, () => { if (F.step === 3 && !F.ending) dayCut(rt, 14, 'day', '九月十四日・堤の戦い', '天満が森から本願寺勢。春日井堤で迎え撃つ'); });
    // 本願寺の門徒の大群（butai.js・軽い作り）。寄せる道は攻めの頭（siege_ai.js の makeAttackAI）が、
    // 守りの厚さ・道の長さ・口の狭さに揺らぎを掛けて選ぶ（毎回同じ道で来ない）。本物の斬り合いは下の波（名のある組）
    if (F.bSally && !bDead(F.bSally)) F.bSally.order({ id: 'retreat' });
    F.clashW = false;
    const face = Math.atan2(46 - 130, 4 - 120);
    const mkI = (name, x, z, kind, n, gen) => capReal(makeButai(rt, { name, general: gen, team: 1, faction: 'saito', kind, nominal: n, real: 0, lightWidth: 24, lightDepth: 16, armor: IKKO.armor, flag: 'namu', at: { x, z }, facing: face }), 0);
    F.bIkko = [mkI('本願寺の門徒', 128, 118, 'ashigaru', 140), mkI('門徒の新手', 118, 132, 'ashigaru', 120), mkI('鉄砲を持った門徒', 140, 110, 'gun', 80)];
    F.AA = makeAttackAI(rt, { attackers: F.bIkko, routes: IKKO_ROUTES, feintChance: 0.6, feintShare: 0.34 });
    // 早鐘と同時に東の畦の先勢が寄せ、後続は南の畦・堤の東端から続く。
    rt.after(3, () => this.wave(rt, 0));
    rt.after(30, () => this.wave(rt, 1));
    rt.after(65, () => this.wave(rt, 2));
    rt.after(105, () => this.wave(rt, 3));
    rt.after(140, () => this.wave(rt, 4));
  },
  wave(rt, i) {
    const F = rt.flags;
    if (F.ending || F.step !== 3 || F.waves[i]) return;
    // 第一陣は東の畦へ先に回った門徒の小勢。堤の持ち場（8, -4）から約19mの所で早鐘に応じる。
    // 遠い大群を待たず、砦前から戻る間にも近づく。後続は元の畦道の口から出す。
    // 出る場所は固定し、本人の位置に合わせて背後へ移さない。兵数は既存の上限内。
    const route = i % 3;
    const [x, z] = i === 0 ? [26, 2] : [[46, 12], [50, 24], [54, 0]][route];
    const g = enemyGroup(rt, { faction: 'saito', name: ['一揆勢', '一揆勢の新手', '鉄砲を持った門徒', '堤へ寄せる門徒', '畦道の門徒'][i], anchor: { x, z }, facing: Math.atan2(6 - x, LEVEE_Z - z), aggro: 16, seekRange: 45, width: 10, yariRanks: 3, morale: 95, fleeDir: { x: 0.6, z: 0.8 }, formation: i === 2 ? 'line' : 'yari', arriveCount: 3, arriveRadius: 6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: [10, 14, 10, 10, 10][i] }, { type: 'gun', n: i === 0 ? 1 : i === 2 ? 5 : 3 }], IKKO));
    // 先陣は川の南の畦をそのまま進む。遠景用の遠い入口へ戻る道順と、途中の後列待ちは作らない。
    // 堤で待つ本人の槍が届く所まで寄せ、先頭三人の到着で斬り合いへ移る。
    const end = [[16, 0], [12, 4], [20, -3]][route];
    g.order = 'move'; g.dest = { x: end[0], z: end[1] }; g.speed = 3.2;
    g.fire = true; g.aggro = 16; g.seekRange = 45;
    g.onArrive = (v) => {
      v.order = 'attack'; v.seekRange = 60; v.aggro = 16;
      this.waveFocus(rt, v, i);
    };
    F.waves[i] = g;
    rt.army.play('eshout', { x, z }, 1.8);
    rt.say('一揆の門徒', ['南無阿弥陀仏、南無阿弥陀仏！', '南無阿弥陀仏！　仏敵の信長を討て！', '横から回れ！　退き口を塞げ！', '堤の口へ続け！', '畦から寄せよ！　槍を揃えろ！'][i], 3.5);
    g.ikko = true;
    rt.marker('w' + i, centerOf(g), g.name, { red: true, group: g });
    // 一揆の松明
    for (let k = 0; k < 3; k++) rt.world.addFire(x - 6 + k * 6, z + 6, { torch: true, h: 1.5 });
  },

  // 堤へ来た門徒は本人と組にも寄せる。壁・川越しには追わせない。
  waveFocus(rt, g, i) {
    const p = rt.player.u;
    let target = null, best = 45;
    const c = g.center();
    const consider = (u) => {
      if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.pos.z < -16) return;
      const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
      if (d < best && !rt.army.wallBetween(c, -1, u.pos) && !rt.army.terrainBlocks(c, u.pos)) { best = d; target = u; }
    };
    if (i % 2 === 0) consider(p);
    if (!target) for (const u of rt.squad) consider(u);
    if (!target) consider(p);
    g.focus = target;
  },

  // 京の危機の知らせを受け、目標は「城を落とせ」から「囲まれる前に退け」に変わり、織田の撤退で終わる
  win(rt) {
    const F = rt.flags;
    if (F.ending || F.retreating) return;
    F.retreating = true; F.retreatT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('leveeHold');
    battleEvent(rt, EVENT_RETREAT, ODA_HONJIN, F.maeda, 0, true, '囲みを解き、詰め陣へ退く');
    for (const g of F.oda) {
      g.onArrive = null; g.order = 'move'; g.dest = { x: ODA_HONJIN.x + (g === F.sassa ? -14 : 12), z: ODA_HONJIN.z };
    }
    F.namedGuards[1].order = 'move'; F.namedGuards[1].dest = { x: 28, z: 96 };
    F.bOdaW.order({ id: 'hold' }); // 柴田は殿に残る
    for (const b of [F.bOdaE, F.bOdaS]) b.order({ id: 'retreat', to: { x: 28, z: 96 } });
    for (let i = 0; i < F.waves.length; i++) rt.unmark('w' + i);
    dayCut(rt, 23, 'day', '翌日・囲みを解く', 'しんがりを残し、江口へ退く');
    sfx('horagai', 0.8);
    rt.say('伝令', '御下知！　囲みを解き、江口より京へ退くべし。しんがりは柴田勝家・和田惟政！', 4.5);
    rt.obj('main', '堤から詰め陣の印へ退け', 'main', true);
    rt.marker('retreat', ODA_HONJIN, '詰め陣（退き口）', { h: 3 });
    rt.zone('retreat', ODA_HONJIN.x, ODA_HONJIN.z, 10);
  },
  winEnd(rt) {
    const F = rt.flags;
    if (F.ending) return;
    rt.unmark('retreat'); rt.unzone('retreat');
    F.ending = true;
    rt.setPhase('end');
    for (let i = 0; i < F.waves.length; i++) rt.unmark('w' + i);
    // 自分の帰着で敵軍を敗走させない。後続を殿が支えている間に隊列へ戻る。
    rt.world.setTime('day');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '囲まれる前に退いた', pts: 20 }; }, '囲みを解き、退き口へ帰着');
    sfx('horagai', 0.6);
    rt.banner('織田、野田・福島から撤退', '砦を落とす前に攻めを止め、京へ兵を返す');
    rt.say('前田利家', `${nm(rt)}、よう戻った。京へ急ぐぞ、味方の列を離れるな`, 4.5);
    rt.after(6, () => rt.say('', '――野田・福島の囲みは解かれた。織田の兵は京へ返し、浅井・朝倉を迎え撃つ', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },
  update(rt, dt) {
    const F = rt.flags;
    F.waterFeet?.(dt);
    nodaPeople(rt);
    if (F.remoteTorches) for (const c of F.remoteTorches) {
      const off = F.monto.army.off, f = c.f;
      f.x = c.x + off.x; f.z = c.z + off.z;
      f.base = rt.world.heightAt(f.x, f.z) + 2.2 + f.size * 0.3;
      f.flame.position.set(f.x, f.base, f.z); f.inner.position.set(f.x, f.base - f.size * 0.08, f.z);
      f.glow.position.set(f.x, rt.world.heightAt(f.x, f.z) + 0.06, f.z);
    }
    if (!F.ending && !F.retreating && rt.player.u.alive && rt.t >= F.reloadScanAt) {
      F.reloadScanAt = rt.t + 0.2;
      if (rt.t >= F.reloadSayAt) for (const u of rt.army.units) {
        // 火と煙が出た鉄砲だけ。塀の奥・背後・不発・遠い撃ち合いでは声を出さない。
        if (u.team === rt.player.u.team || u.type !== 'gun' || !u.alive || u.fleeing || u.woundOut || u.noTarget || !(u.fireT > 0) || !u.reload || !sightPoint(rt, u.pos, 50, false, 1.4)) continue;
        F.reloadSayAt = rt.t + 25;
        rt.say('組頭', F.step >= 3 ? '敵が放った！　堤を守れ！' : F.step === 2.5 ? '煙が上がった！　竹束の陰へ！' : ['敵が放った！　玉込めの間に詰めよ！', '煙が上がった！　味方と寄せよ！'][F.reloadVoice++ % 2], 2.5);
        break;
      }
    }
    if ((F.step === 2 || F.step === 3) && !F.retreating && rt.t >= (F.pressureAt || 0)) {
      pressureTick(rt, F.step, F.step === 2 ? [F.sally] : F.waves, [F.maeda, F.sassa], '');
      // 持ち場は任務札に残す。三十秒おきの同じ下知は出さない。
      F.pressureSayAt = Infinity;
    }
    KIT.backTick(rt);
    butaiTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.torches) F.torches.update();
    if (F.retreating && !F.ending) {
      const pp = rt.player.u.pos, d = Math.hypot(pp.x - ODA_HONJIN.x, pp.z - ODA_HONJIN.z);
      const safe = !rt.army.nearestEnemy(rt.player.u, 12, u => !u.fleeing);
      rt.objProgress('main', safe ? '詰め陣の印へ退き、守兵に合流せよ' : '追手が近い。味方の槍の列へ戻れ');
      let joined = F.campA.guard.count > 0 && !gone(F.campA.guard);
      const rear = F.namedGuards[1];
      if ((!joined || F.retreatAlt) && rear && !gone(rear)) {
        if (!F.retreatAlt) {
          F.retreatAlt = true; rt.unzone('retreat');
          rt.marker('retreat', centerOf(rear), '佐久間の退く列へ合流', { h: 3, group: rear });
          rt.say('前田利家', '陣の口は崩れた。南東へ退く佐久間の列に合流せよ！', 3);
        }
        const c = rear.center();
        joined = rear.units.some((q) => q.alive && !q.fleeing && !q.woundOut);
        rt.objProgress('main', safe ? '佐久間の印へ退き、列に合流せよ' : '追手を味方と押し返し、佐久間の列へ戻れ');
        if (joined && safe && Math.hypot(pp.x - c.x, pp.z - c.z) < 10 && rt.player.u.alive) { this.winEnd(rt); return; }
      }
      if (joined) F.retreatLostT = 0;
      if (!joined) {
        const occupied = F.SZ?.byId.honjin?.owner === ZONE_STATE.ENEMY;
        F.retreatLostT = occupied ? (F.retreatLostT || 0) + dt : 0;
        rt.objProgress('main', occupied ? `詰め陣を奪い返せ。あと${Math.max(0, Math.ceil(8 - F.retreatLostT))}秒` : '退き口の守りが崩れた。追手を押し返せ');
        if (F.retreatLostT >= 8 && rt.canFailMission()) {
          F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
          rt.unmark('retreat'); rt.unzone('retreat');
          rt.banner('退き口を失った', '詰め陣の守兵が崩れ、追手が退き口を占めた');
          rt.finish({}, 8); return;
        }
      }
      if (!F.retreatAlt && d < 10 && safe && joined && rt.player.u.alive) this.winEnd(rt);
      else if (rt.t - F.retreatT > 35 && !F.retreatCall) { F.retreatCall = true; rt.say('前田利家', '追手に構うな！　詰め陣の守兵に合流せよ！', 3); }
    }
    if (F.ending || !rt.player.u.alive) return;
    updateGates();
    tickTabas(rt, dt);
    if (F.fordWatch) F.fordWatch.tick();
    if (F.SZ) {
      const p = rt.player.u.pos;
      if (F.step >= 2 && F.step < 3) {
        if (F.noda.kuruwa.kishi.test(p.x, p.z)) F.joined_noda = true;
        if (F.fuku.kuruwa.kishi.test(p.x, p.z)) F.joined_fuku = true;
        for (let i = 0; i < 2; i++) {
          const id = i ? 'fuku' : 'noda';
          if (F['joined_' + id] && F.SZ.byId[id].owner === ZONE_STATE.FRIEND && !F['paid_' + id]) {
            F['paid_' + id] = true;
            const name = F.SZ.byId[id].name;
            rt.award((t) => t.side.push(`${name}の岸に踏み込んだ`), `${name}の岸に踏み込んだ`);
          }
        }
      }
      F.SZ.tick(dt);
    }
    if (F.AA && F.step === 3 && !F.retreating) F.AA.tick(dt);
    this.tickLight(rt, dt);
    if (F.retreating) return;
    // 砦との撃ち合い（遠くの鉄砲の音と煙）
    // 夜も遠くの撃ち合いは弱く続く（昼も夜も絶えなかったと伝わる）
    if ((F.shotT -= dt) <= 0) {
      const night = rt.world.timeKey === 'night';
      F.shotT = night ? 4 + Math.random() * 6 : 1.2 + Math.random() * 2.5;
      let gun = null;
      if (!gone(F.fortGun) && !F.fortGun.holdFire) for (const u of F.fortGun.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.type === 'gun' && u.target?.alive && !u.reload) { gun = u; break; }
      if (gun) {
        F.shotPos.x = gun.pos.x; F.shotPos.z = gun.pos.z;
        rt.army.play('gun', F.shotPos, night ? 0.3 : 0.5);
        rt.army.smoke(gun.pos.x, gun.pos.y + 1.4, gun.pos.z, 0, 1, 0.6);
      }
    }
    if (F.step === 1) {
      this.tickTabaHelpers(rt, dt);
      // 本人と束を同じ歩幅で動かす。回転だけで束が岸や土塁を越えない。
      if (F.carry && F.backMesh && Math.hypot(rt.player.u.pos.x - F.backMesh.position.x, rt.player.u.pos.z - F.backMesh.position.z) > 3.5) {
        F.carry = false; F.backMesh = null;
        rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
        this.nextPick(rt); rt.bark('竹束から離れた。戻って長押しで押せ');
      }
      if (F.carry && F.carryPrev) {
        const u = rt.player.u, m = F.backMesh.position, prev = F.carryPrev, next = F.carryNext;
        const dx = (u.pos.x - prev.x) * 0.6, dz = (u.pos.z - prev.z) * 0.6;
        next.x = m.x + dx; next.z = m.z + dz;
        if (rt.player.canStep(m.x, m.z, next.x, next.z, m.y) && !rt.army.wallBetween(m, -1, next)) {
          u.pos.x = prev.x + dx; u.pos.z = prev.z + dz;
          m.set(next.x, rt.world.heightAt(next.x, next.z), next.z);
        } else {
          u.pos.x = prev.x; u.pos.z = prev.z;
          if (rt.t - (F.carryWarnAt ?? -99) >= 8) { F.carryWarnAt = rt.t; rt.bark('竹束がつかえた。置いて反対側へ回れ'); }
        }
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        F.backMesh.rotation.y = rt.player.yaw;
        prev.x = u.pos.x; prev.z = u.pos.z;
        const q = F.carryPath[F.carryAt];
        if (F.carryAt < F.carryPath.length - 1 && Math.hypot(m.x - q.x, m.z - q.z) < 1.8) F.carryAt++;
      }
      if (rt.G.lord && rt.t >= (F.helperRetryT || 0)) {
        F.helperRetryT = rt.t + 8; this.startTabaHelpers(rt);
      }
      let help = '';
      for (const h of F.tabaHelpers) {
        if (h.done || Math.hypot(h.mesh.position.x - rt.player.u.pos.x, h.mesh.position.z - rt.player.u.pos.z) > 24 || !sightPoint(rt, h.mesh.position)) continue;
        help = h.blocked ? '竹束がつかえた。道を空けよ' : h.g.units.some((u) => u.atk || u.target?.alive) ? '運び手が襲われた。味方と守れ' : h.g.units.some((u) => u.stagger > 0) ? '運び手が負傷。そばを守れ' : h.g.units.some((u) => Math.hypot(u.pos.x - h.g.anchor.x, u.pos.z - h.g.anchor.z) > 2) ? '運び手の到着を待て' : '運び手のそばを守れ';
        break;
      }
      if (F.step === 1) rt.objProgress('main', `総攻めまで${Math.max(0, Math.ceil(CARRY_WAIT - (rt.t - F.stepT)))}秒・竹束 ${F.placed}／${SPOTS.length}・` + (F.carry ? '据える印へ押し、長押し' : help || (rt.G.lord || F.tabaDone[F.pickIndex] ? '堤で待て。味方が竹束を押す' : '竹束の印へ。長押しで押せ')));
      // 運べなかった束は残す。据えた事にせず、総攻めの合図で準備を切り上げる。
      if (rt.t - F.stepT >= CARRY_WAIT) this.sallyStart(rt);
      if (F.step === 1 && !rt.G.lord && rt.t - F.stepT > 8 && !F.carry && !F.placed && !F.carryCall) { F.carryCall = true; rt.say('前田利家', `${nm(rt)}、その竹束を押せ。味方の鉄砲衆を矢玉から守るのじゃ`, 4); }
    }
    if (F.step === 2 && F.sally) {
      rt.objProgress('main', gone(F.sally) ? '浅瀬を渡り、砦前の印へ進め' : '味方と三好勢を押し戻せ。追うな');
      if (gone(F.sally) && !F.nightAt) { F.nightAt = rt.t + 3; rt.say('前田利家', '敵は退いたぞ！　浅瀬を越え、砦の口へ詰めよ！', 3.5); }
      // 攻めが膠着したら対陣へ移る。敵を倒した手柄にはしない。
      if (!F.nightAt && rt.t - F.stepT > 100 && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) {
        F.sally.onArrive = null; F.sally.focus = null; F.sally.order = 'retreat';
        this.midA(rt, true);
      }
      if (F.nightAt && rt.t > F.nightAt && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) this.midA(rt);

    }
    if (F.step === 2.5) {
      rt.objProgress('main', '砦前の印で並べ。塀の奥へ入るな');
      if (rt.t - F.midT > 3 && !F.bellNews) {
        F.bellNews = true; rt.say('物見', '後ろの畦に人影だがや！　味方か、敵か……', 3.5);
      }
      if (rt.t - F.midT > 6 && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) this.night(rt, true);
    }
    if (F.step === 3 && !F.retreating) {
      if (rt.t >= (F.waveFocusAt || 0)) {
        F.waveFocusAt = rt.t + 5;
        for (let i = 0; i < F.waves.length; i++) {
          const g = F.waves[i];
          if (g && !gone(g) && g.order === 'attack') this.waveFocus(rt, g, i);
        }
      }
      // 堤の持ち場の状態。日付の進みを占領の秒数で止めない。
      const lv = F.SZ && F.SZ.byId.levee;
      const held = !lv || lv.owner === ZONE_STATE.FRIEND;
      if (!held && !F.leveeLostSaid) { F.leveeLostSaid = true; F.leveeLostAt = rt.t; rt.say('前田利家', '堤を奪い返せ！　退き口を塞がれては一人も帰れぬぞ！', 3.5); }
      rt.objProgress('main', held ? (F.kyotoNews ? '堤で退き口を守り、下知を待て' : '堤の印で味方と横・背後の敵を防げ') : '味方と堤を奪い返せ');
      // 京の知らせによる撤退命令。全滅させたかどうかではなく、帰着と安全を終了条件にする。
      if (rt.t - F.stepT > 185 && F.kyotoNews && held &&
          Math.hypot(rt.player.u.pos.x - 8, rt.player.u.pos.z - LEVEE_Z - 4) < 22) this.midB(rt);
    }
  },

  // 軽い部隊どうしの押し合い（遠くの戦い）。昼は堤の西の端の向こう、夜は一揆の大群と織田の手
  tickLight(rt, dt) {
    const F = rt.flags;
    if (F.clashW && !bDead(F.bSally) && !bDead(F.bOdaW) && bDist(F.bSally, F.bOdaW) < 30) lightClash(F.bSally, F.bOdaW, dt, 0.35);
    if (F.step !== 3 || !F.bIkko || !F.AA) return;
    if (!F.oaSent && rt.t >= (F.lookT || 0)) {
      F.lookT = rt.t + 2;
      for (const b of F.bIkko) if (!bDead(b) && sightPoint(rt, bPos(b), 90)) {
        F.oaSent = true; rt.say('足軽', '畦の向こうに門徒の旗だがや！　みな、槍を揃えろ！', 3.5); break;
      }
    }
    // 寄せた大群は、いちばん近い織田の手と押し合う（堤の東・南の畦の外で。軽い作り）
    for (const b of F.bIkko) {
      if (bDead(b)) continue;
      let o = null, dist = 42;
      for (const q of F.lightOda) {
        if (bDead(q)) continue;
        const d = bDist(b, q);
        if (d < dist) { o = q; dist = d; }
      }
      if (o) lightClash(b, o, dt, 0.3);
    }
  },
  // 持ち場の区域の持ち主が変わった（siege_zones.js の onFall）
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z) return;
    if ((id === 'noda' || id === 'fuku') && z.owner === ZONE_STATE.FRIEND && !F['took_' + id]) {
      F['took_' + id] = true;
      if (F['joined_' + id] && !F['paid_' + id]) {
        F['paid_' + id] = true;
        rt.award((t) => t.side.push(`${z.name}の岸に踏み込んだ`), `${z.name}の岸に踏み込んだ`);
      }
      rt.say('前田利家', F.step < 3 ? '岸は押さえたぞ！　奥の鉄砲に備え、砦の口を固めよ' : '砦は捨て置け！　堤へ返し、味方の退く道を保て', 3);
    }
    if (id === 'honjin' && z.owner === ZONE_STATE.ENEMY && rt.t >= (F.honjinWarnT || 0)) {
      F.honjinWarnT = rt.t + 8; rt.say('伝令', '詰め陣に敵が入り申した！　退き口が危のうござる！', 3);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 一揆勢は三好の数に入れず、別に数える
    if (v.team === 1 && v.group && v.group.ikko) F.ikkoK = (F.ikkoK || 0) + 1;
    else if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退くぞ！　追わんでええ！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、野田・福島の三好勢 八千ほど。本願寺の一揆勢は数に入れない。数には諸説ある）
nodafukushima.force = () => ({ a: 30000, a0: 30000, b: 8000, b0: 8000 });
nodafukushima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '三好三人衆', mon: 'miyoshi' } };
nodafukushima.noWake = true;   // 遠景を本物に替えず、組を含めて約二百人に収める
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nodafukushima.famous = []; // 頼廉の局地配置は確認できず、軽い備と本物への重複配置も避ける。
nodafukushima.date = (rt) => `元亀元年九月${rt.flags.day || 12}日${(rt.flags.day || 12) <= 13 && rt.flags.step >= 3 ? 'の夜' : ''}・秋・${rt.flags.retreating ? '撤退' : rt.flags.step >= 3 ? '本願寺と対陣' : '砦攻め'}`;
nodafukushima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '竹束の下知まで待つ' : '');
nodafukushima.skip = (rt) => { if (rt.phase === 'brief') nodafukushima.carryStart(rt); };
nodafukushima.history = '『信長公記』巻三による。元亀元年（1570）八月、信長は二城の南東約五キロの天王寺に本陣を置き、摂津の野田・福島に籠る三好勢を囲んだ。九月十二日には足利義昭と海老江に詰陣し、土手や櫓を築いて砦へ攻め寄せた。根来・雑賀・湯川など紀伊の鉄砲衆も加わり、昼夜の銃撃が続いた。十二日の早鐘と蜂起が伝わる一方、公記の本文には十三日夜の楼の岸・川口への射撃が記される。十四日には天満が森から出た本願寺勢と春日井堤で戦い、佐々成政、前田利家らが掛かり合った。一方、浅井・朝倉は坂本口へ進み、二十一日には逢坂を越えて醍醐・山科を焼いた。二十二日に知らせを受けた信長は、京への乱入を防ぐため、二十三日に野田・福島から撤退。柴田勝家と和田惟政を殿とし、江口では一揆勢が渡し舟を隠す中、浅くなっていた川を徒歩で渡った。砦の落城による勝利ではなく、志賀の陣へ兵を返した戦である。遊びでは数日にわたる総攻め・蜂起・知らせ・撤退を続く段にまとめ、海老江の仕寄りと十四日の堤の戦いを同じ局地で表す。二城の西は海、北・東・南は川で囲む。退き口の陣は前線の詰め陣で、遠い天王寺の本陣を近くに縮めたものではない。城の向き・寸法、各将の持ち場、水路と天気は推定。見える兵は近辺の一部で、織田三万・三好八千は総勢の目安。江口の渡河は戦後の解説だけに残す。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nodafukushima.lordAt = { x: ODA_HONJIN.x, z: ODA_HONJIN.z - 4, r: 12, why: '堤の南東の詰め陣（天王寺の本陣ではなく、海老江の攻めを表す前線の陣）' };
nodafukushima.lordSpawn = { x: ODA_HONJIN.x, z: ODA_HONJIN.z - 8, heading: Math.PI };

// 素直な遊び手：竹束を据え、浅瀬を渡って攻め、早鐘の後は堤へ戻って退く
const nearIt = (b, id) => b.interacts.find((x) => x.id === id);
nodafukushima.botBrain = (b, inp, { goTo, patientStrike, canStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.retreating) {
    inp.guardHold = false; inp.runHeld = true;
    const to = F.retreatAlt ? F.namedGuards[1].center() : ODA_HONJIN;
    goTo(p, inp, to.x, to.z, 2); return;
  }
  // 話す印は将本人の立ち位置とは別。印の範囲で話を聞き、下知を待つ。
  // 話し終えた二秒の間に将を追い直したり、敵へ寄り道したりしない。
  if (F.step === 0) {
    inp.guardHold = false;
    const it = nearIt(b, 'talk');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < it.r) inp.e.add('KeyE');
      else goTo(p, inp, it.pos.x, it.pos.z, it.r * 0.8);
    }
    return;
  }
  // 傷は自然には治らず、手当ても一度・五％まで。全快を待たず、手当てと気力で戻る。
  if ((u.hp < u.maxHp * 0.5 && p.treatmentLeft > 0 && !p.bandaged) || p.sta < p.maxSta * 0.22) b.botRest = true;
  // 気力が戻れば、敵の間合いの外から戦いへ戻る。九歩以内の敵で休み続けない。
  if (b.botRest && !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget && !o.isStruct &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) && p.sta > p.maxSta * 0.55 &&
      (u.hp >= u.maxHp * 0.5 || p.treatmentLeft <= 0 || p.bandaged)) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 手当てには六メートル以内の味方が要る。固定の後方で一人きりにならない。
    const g = F.maeda && F.maeda.count ? F.maeda : F.sassa && F.sassa.count ? F.sassa : b.squadGroups.find((q) => q.count);
    if (g) { const c = g.center(); goTo(p, inp, c.x, c.z + 4, 1); }
    else { b.botRest = false; }
    if (b.botRest) return;
  }
  // 竹束を運ぶ最中（step1）は、柵際まで釣られて詰まらないよう、すぐ側の敵だけを見る
  // 名のある将も手傷で退かせられる間は相手にする。深手の将は追い続けない。
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 竹束の向こうの敵には端を回って寄れる。塀や門の奥へは追わない。
  const canApproach = (o) => {
    if (!b.army.wallBetween(u.pos, -1, o.pos)) return true;
    for (const s of b.army.structs) {
      if (!s.alive || s.opened || !s.seg || s.name === '竹束') continue;
      if (segHit(u.pos.x, u.pos.z, o.pos.x, o.pos.z, s.seg) >= 0) return false;
    }
    return true;
  };
  const canFight = (o) => !o.fleeing && canStrike(p, o) && !o.noTarget && !o.isStruct && o.type !== 'dummy' &&
    o.pos.z > FORT_Z + 2 && (F.step !== 3 || Math.hypot(o.pos.x - 8, o.pos.z - (LEVEE_Z + 4)) < 14) && Math.abs(o.pos.y - u.pos.y) < 3 && canApproach(o);
  if (F.step === 3 && Math.hypot(u.pos.x - 8, u.pos.z - (LEVEE_Z + 4)) > 12) {
    inp.guardHold = false; goTo(p, inp, 8, LEVEE_Z + 4, 2); return;
  }
  // 構えを解く半秒の間は、まだ届く相手を保つ。隣の兵への選び直しで突きを消さない。
  const previous = p.botStrikeFoe;
  const e = p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team && canFight(previous) &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach ? previous :
    // 総攻めでは浅瀬の向こうも見る。持ち場を守る段では近くの敵だけに戻す。
    b.army.nearestEnemy(u, F.step === 1 ? 3.5 : F.step === 2 ? 30 : F.step >= 2 ? 12 : 5, canFight);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const blocked = b.army.wallBetween(u.pos, -1, e.pos);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    if (d >= reach || blocked) goTo(p, inp, e.pos.x, e.pos.z, blocked ? 0.5 : reach * 0.9);
    // 受ける間と突く間を分け、構えたままの連打で気力を使い切らない。
    if (blocked) { inp.leftPressed = false; inp.guardHold = false; p.botStrikeUntil = 0; }
    else patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    if (F.carry) {
      const q = F.carryPath[F.carryAt], m = F.backMesh.position;
      const dx = q.x - m.x, dz = q.z - m.z, d = Math.hypot(dx, dz);
      const it = nearIt(b, 'spot');
      // 束と本人は拾った時の距離を保つ。本人を印の中心へ押し込むと、
      // 隣の据えた束に当たり、据えられるのに前進を続けてしまう。
      if (F.carryAt === F.carryPath.length - 1 && it && d <= 2.5 && Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z) <= it.r) { inp.k.add('KeyE'); return; }
      goTo(p, inp, u.pos.x + dx, u.pos.z + dz, 0.15); return;
    }
    const it = nearIt(b, 'pile');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2 || F.step === 2.5) { goTo(p, inp, 0, -37, 2); return; }   // 水路の浅瀬を渡り、野田砦の口へ迫る
  if (F.step === 3) { goTo(p, inp, 8, LEVEE_Z + 4, 2); return; }
};

nodafukushima.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// 信長公記巻三・地形参照の天王寺本陣、海老江の仕寄り、二城と本願寺。
// 兵数は既存の総勢を備へ割った目安。三人衆の城別の担当は確定していない。
installBattleJinkei(nodafukushima, [
  battleJin('水路を挟む攻めの陣', 0, ODA_HONJIN, Math.PI, [
    ['noda_oda_hq', '海老江の攻め・前線の詰め陣', '織田信長', 10000, ODA_HONJIN, 'eiraku', 'oda', (r) => r.flags.campA?.guard],
    ['noda_shibata', '西の仕寄り・海老江堤', '柴田勝家', 6000, { x: -82, z: 16 }, 'oda', 'oda', (r) => r.flags.namedGuards?.[0]],
    ['noda_guns', '東の仕寄り・鉄砲衆', '根来・雑賀の衆（将の名は不明）', 4000, { x: 84, z: 6 }, 'eiraku', null, (r) => r.flags.bOdaE, { named: false }],
    ['noda_sakuma', '後ろの備え・退き口', '佐久間信盛', 8000, { x: 56, z: 42 }, 'oda', 'oda', (r) => r.flags.namedGuards?.[1]],
    ['noda_maeda', '竹束の仕寄り', '前田利家', 2000, { x: 0, z: LEVEE_Z + 6 }, 'maeda', 'maeda', (r) => r.flags.maeda],
    ['noda_matsunaga', '浦江城への攻め口', '松永久秀・三好義継', null, { x: -150, z: 8 }, 'miyoshi', 'miyoshi', null, { draw: true, named: false, count: 60 }],
  ], '総勢と備ごとの数・位置は目安。付城は水辺の陣地として復元し、天正四年の六付城を混ぜない。'),
  battleJin('二つの砦と後ろからの寄せ', 1, { x: 0, z: -84 }, 0, [
    ['noda_miyoshi_hq', '本陣・野田砦の奥', '三好長逸', 2000, { x: 0, z: -84 }, 'miyoshi', 'miyoshi', (r) => r.flags.campB?.guard],
    ['noda_noda', '野田砦の岸の曲輪', '三好長逸の手', 2000, { x: 0, z: -63 }, 'miyoshi', 'miyoshi', (r) => r.flags.bNoda],
    ['noda_fuku', '福島砦の曲輪', '三好宗渭の手', 2000, { x: -122, z: -84 }, 'miyoshi', 'miyoshi', (r) => r.flags.namedGuards?.[2]],
    ['noda_fuku_gun', '福島砦の岸の鉄砲', '将の名は不明', 500, { x: -122, z: -61 }, 'miyoshi', 'miyoshi', (r) => r.flags.bFukuGun, { named: false }],
    ['noda_iwanari', '浅瀬に向く外の備え', '岩成友通の手', 1500, { x: -4, z: -37 }, 'miyoshi', 'miyoshi', (r) => r.flags.sally],
    ['noda_kennyo', '石山本願寺・後ろからの寄せ', '顕如の門徒衆', null, HONGAN, 'namu', 'honganji', null, { named: false }],
    ['noda_ikko_front', '早鐘の後・本願寺の先手', '将の名は不明', null, { x: 128, z: 118 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[0], { named: false }],
    ['noda_ikko_next', '早鐘の後・後ろからの新手', '門徒衆（将の名は不明）', null, { x: 118, z: 132 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[1], { named: false }],
    ['noda_ikko_gun', '早鐘の後・横からの鉄砲', '門徒衆（将の名は不明）', null, { x: 140, z: 110 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[2], { named: false, form: 'line' }],
  ], '三人衆は五千〜一万とも伝わる。城別の担当・各曲輪の人数は推定。本願寺は早鐘の後に参戦。'),
]);

export { nodafukushima };
export { namuTex, sagarifujiTex };
