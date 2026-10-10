import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior, facePanels } from './naka.js';
import { SOLIDS, castleMat } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
// 墨俣の戦の定義（砦づくりと守り。battles.js から分けた。中身は元のまま）
import { palisade, bobosaku, kabukimon, tawara, hut, yagura, lumber, scaffold, umatsunagi, campfire, hasa, nobori, kagaribi, takataba, kobune, stumps, dorui, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { demBlend } from './dem.js';
import { gauss, allyGroup, nm, enemyGroup, centerOf, unitPos } from './bhelp.js';
import { nagashinojo } from './b_nagashinojo.js';
import { RANKS } from './state.js';
import { buildHorse } from './units_model.js';
import { sfx } from './audio.js';
import { flagTexture } from './textures.js';
import { volleyAt } from './b_okehazama.js';
import { battleEvent, EVENT_MESSENGER, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { seasonOf } from './b_shared.js';
import { makeSiegeZones, ZONE_STATE, WIN } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset, FL } from './floors.js';
import { makeButai, butaiTick, adoptGroup } from './butai.js';
import { chooseRoute } from './siege_ai.js';
import { addTaba, tickTabas, patchGunCover } from './taketaba.js';
import { addFieldFence } from './yasen_obstacles.js';
import { FORT, ROAD3, ROAD3N, YOSE, SIDE_WORD, HORI, SUNOMATA_PLAN, SUNOMATA_PATHS, SHEDS as PLAN_SHEDS, sunomataGround } from './castles/sunomata.js';

// ======================================================================
// 第3戦　墨俣
// 縄張りは castles/sunomata.js（riverFortPlan に倣った河川砦：砦の内・岸の舟着き・物見・外の空堀・寄せの道）。
// 斎藤の寄せは「備（butai）」：本物は波の組、後ろの数百は軽い大軍。寄せる道は寄せの頭（chooseRoute）が
// 柵の内の守りの厚さを見て毎回選び、竹束を押してゆっくり寄せ場まで来てから柵へ取り付く。
// 守り切りは寄せの退却、人足の生存、柵の完成、砦内の安全をそろえて決める。
// ======================================================================
// 合印：柵の口の斬り合いで敵味方を見分ける。織田方の手は旗と同じ黄土の陣笠、斎藤の寄せ手は柿渋の陣笠と大きめの旗指物。
// （具足はどちらも黒く、旗の色だけでは乱戦で取り違えた。名のある武将の兜はそのまま）
const ODA_AIJI = { hatColor: 0x9c7c34 };
const SAITO_AIJI = { hatColor: 0x6a3222, flagScale: 1.25 };
const aiji = (list, look) => list.map((e) => ({ ...e, o: { ...look, ...(e.o || {}) } }));
const allyGroupA = (rt, o, list) => allyGroup(rt, o, aiji(list, ODA_AIJI));
const MOAT = HORI.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));

// 墨俣の札は今やる一件。別の手柄の判定は残し、済・失敗の札を積まない。
const TASK_ORDER = ['complete', 'retreat', 'flag', 'porters', 'nida', 'scout', 'post', 'gate', 'defend'];
function sunoSync(rt) {
  const tasks = rt.flags.sunoTasks;
  let next = null;
  for (const id of TASK_ORDER) {
    const task = tasks.get(id);
    if (task && !task.state) { next = task; break; }
  }
  const old = rt.flags.sunoTask;
  if (old && old !== next?.id) rt.objRemove(old);
  rt.flags.sunoTask = next?.id || null;
  if (next) {
    // そばの下知として出す。運びかけの古い札が後から戻らない。
    rt.obj(next.id, next.text, next.kind, true);
    rt.objProgress(next.id, next.progress);
  }
}
function sunoObj(rt, id, text, kind = 'main') {
  const tasks = rt.flags.sunoTasks || (rt.flags.sunoTasks = new Map());
  let task = tasks.get(id);
  if (!task) { task = { id, text, kind, state: '', progress: '' }; tasks.set(id, task); }
  else { if (task.text !== text) task.progress = ''; task.text = text; task.kind = kind; task.state = ''; }
  sunoSync(rt);
  return task;
}
function sunoProgress(rt, id, text) {
  const task = rt.flags.sunoTasks?.get(id);
  if (task && !task.state) task.progress = text;
  if (rt.flags.sunoTask === id) rt.objProgress(id, text);
}
function sunoClose(rt, id, state) {
  const task = rt.flags.sunoTasks?.get(id);
  if (!task || task.state) return;
  task.state = state; task.progress = '';
  if (state === 'done') rt.objDone(id); else rt.objFail(id);
  rt.objRemove(id);
  sunoSync(rt);
}
const sunoDone = (rt, id) => sunoClose(rt, id, 'done');
const sunoFail = (rt, id) => sunoClose(rt, id, 'fail');
function sunoRemove(rt, id) {
  rt.flags.sunoTasks?.delete(id); rt.objRemove(id);
  if (rt.flags.sunoTasks) sunoSync(rt);
}

// この戦に置かれた蜂須賀の幟だけ染め直す。共有の旗の絵・材質は変えない。
let hachiCloth;
const hachiMats = new WeakMap();
function dressHachiFlags(rt) {
  const original = flagTexture('hachisuka');
  rt.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.map !== original) return;
    if (!hachiCloth) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#ad8239'; g.fillRect(0, 0, 128, 256);
      // 丸に三つの山形。史実の家紋と断定しない、この戦だけの合印。
      g.strokeStyle = '#242018'; g.lineWidth = 5;
      g.beginPath(); g.arc(64, 72, 22, 0, Math.PI * 2); g.stroke();
      for (const y of [62, 72, 82]) {
        g.beginPath(); g.moveTo(51, y + 4); g.lineTo(64, y - 4); g.lineTo(77, y + 4); g.stroke();
      }
      for (let y = 0; y < 256; y += 4) { g.fillStyle = 'rgba(30,24,16,.05)'; g.fillRect(0, y, 128, 1); }
      hachiCloth = new THREE.CanvasTexture(c); hachiCloth.colorSpace = THREE.SRGBColorSpace;
    }
    const base = mesh.material;
    let mat = hachiMats.get(base);
    if (!mat) {
      mat = base.clone(); mat.map = hachiCloth;
      mat.onBeforeCompile = base.onBeforeCompile; mat.customProgramCacheKey = base.customProgramCacheKey;
      hachiMats.set(base, mat);
    }
    mesh.material = mat;
    // 幟の竿・横木も一緒に細くし、布だけが横木から外れないようにする。
    if (mesh.parent?.userData.flag === mesh) mesh.parent.scale.x *= .6;
    else mesh.scale.x *= .6;
  });
}

// 小道と柵の間を空ける。室内・外壁・歩く時の避け先は同じ寸法を使う。
const SHEDS = PLAN_SHEDS.map((p) => ({ ...p, w: p.w * .85, d: p.d * .85 }));
const MAIN_SHED = { name: '普請小屋', x: 0, z: -4, w: 5.4, d: 3.6, rot: 0, kind: 'yagura' };

// 墨俣専用の逆茂木。閉じた円柱で木の厚みを出し、削り面・枝・結び縄まで設営時にまとめる。
let sunoWoodMat, sunoRopeMat;
function sunoSakamogi(world, x, z, rot, len) {
  if (!sunoWoodMat) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#a18a69'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 64; i++) {
      const xx = h01s(i, 1) * 128;
      g.strokeStyle = i % 3 ? '#796348' : '#bc9f78'; g.lineWidth = 1 + h01s(i, 2) * 2;
      g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, 80, xx - 5, 170, xx + 2, 256); g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const xx = 12 + h01s(i, 3) * 104, yy = 20 + h01s(i, 4) * 216;
      g.strokeStyle = '#665039'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(xx, yy, 4, 11, .15, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(xx, yy, 1.5, 5, .15, 0, Math.PI * 2); g.stroke();
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    sunoWoodMat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1 });
    sunoRopeMat = new THREE.MeshStandardMaterial({ color: 0xb69a65, roughness: 1 });
  }
  const wood = [], rope = [], up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color(), quat = new THREE.Quaternion();
  const add = (geo, hex, list) => {
    if (list === wood) {
      color.setHex(hex);
      const a = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    list.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const log = (a, b, r0, r1, hex, bare = false) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const geo = new THREE.CylinderGeometry(r1, r0, d.length(), 8, 1, false);
    geo.translate(0, d.length() / 2, 0); geo.applyQuaternion(quat.setFromUnitVectors(up, d.normalize())); geo.translate(a.x, a.y, a.z);
    if (bare) geo.attributes.uv.array.fill(0);
    add(geo, hex, wood);
  };
  const n = Math.max(3, Math.round(len / .9));
  for (let i = 0; i < n; i++) {
    const q = h01s(x + i, z), r = .14 + q * .065;
    const a = new THREE.Vector3(-len / 2 + (i + .5) * len / n, .22, -.35 + q * .35);
    const b = a.clone().add(new THREE.Vector3((h01s(i, x) - .5) * .95, .85 + h01s(i, z) * .75, 2.5 + q * 1.3));
    const d = b.clone().sub(a).normalize(), shoulder = b.clone().addScaledVector(d, -.42);
    const hex = [0x9c896f, 0xb19b7d, 0x88755e][i % 3];
    log(a, shoulder, r, r * .8, hex);
    log(shoulder, b, r * .8, .008, 0xe0bd86, true);
    for (let k = 0; k < 3; k++) {
      const start = a.clone().lerp(shoulder, .3 + k * .21);
      const end = start.clone().add(new THREE.Vector3((k % 2 ? 1 : -1) * (.42 + q * .45), .2 + q * .25, .3 + q * .4));
      const neck = end.clone().lerp(start, .2);
      log(start, neck, .055, .035, hex); log(neck, end, .035, .003, 0xe0bd86, true);
    }
    const tie = a.clone().lerp(shoulder, .12);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.TorusGeometry(r + .016, .021, 4, 10);
      ring.rotateX(Math.PI / 2); ring.applyQuaternion(quat.setFromUnitVectors(up, d));
      const at = tie.clone().addScaledVector(d, (k - 1) * .05); ring.translate(at.x, at.y, at.z); add(ring, 0, rope);
    }
    const knot = new THREE.SphereGeometry(.055, 6, 4); knot.scale(1.4, 1, 1);
    knot.translate(tie.x + r, tie.y + .04, tie.z); add(knot, 0, rope);
  }
  log(new THREE.Vector3(-len / 2, .22, -.2), new THREE.Vector3(len / 2, .22, -.2), .1, .09, 0xa08a6c);
  for (let i = 0; i < n; i += 2) {
    const xx = -len / 2 + (i + .5) * len / n;
    log(new THREE.Vector3(xx, -.15, -.45), new THREE.Vector3(xx + .05, .65, -.4), .07, .04, 0xa08a6c);
  }
  const group = new THREE.Group();
  for (const [parts, mat] of [[wood, sunoWoodMat], [rope, sunoRopeMat]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    for (const geo of parts) geo.dispose();
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  group.position.set(x, world.heightAt(x, z), z); group.rotation.y = rot;
  return group;
}

// 急ごしらえの板屋。壁の穴・床・戸口は共通室内と同じ寸法。設営時だけ組み、材質は使い回す。
let shedMat;
const PLANK = [0x7a6e5c, 0x6b604f, 0x857865, 0x726552];
const h01s = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function fortShed(rt, p, parts) {
  const y = rt.world.heightAt(p.x, p.z) + .14, H = 2.15;
  const I = addInterior(rt.world, { name: p.name, kind: p.kind, profile: 'toride', x: p.x, z: p.z, rot: p.rot, team: 0,
    levels: [{ y, w: p.w, d: p.d, h: H }], door: { w: 1.4, h: 1.9 },
    approach: { pad: .2, len: .8 }, hasExterior: true,
    wins: () => [{ face: 'z', s: -1, t: 0, w: 1.1, y0: .95, y1: 1.7 },
      ...[-1, 1].map((s) => ({ face: 'x', s, t: 0, w: 1.1, y0: .95, y1: 1.7 }))],
  });
  const box = (x, yy, z, w, h, d, hex, tilt = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateZ(tilt); g.translate(x, yy, z); g.rotateY(p.rot); g.translate(p.x, y, p.z);
    const color = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = color.r; a[k + 1] = color.g; a[k + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  const stone = (x, yy, z, r) => {
    const g = new THREE.DodecahedronGeometry(r, 0); g.scale(1.3, .6, 1); g.rotateY(x * 3 + z); g.translate(x, yy, z); g.rotateY(p.rot); g.translate(p.x, y, p.z);
    const c = new THREE.Color(0x7d7a70).multiplyScalar(.8 + h01s(x, z) * .35), a = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  // 細い板を縦に並べ、戸口と明かり窓を外壁にも抜く。
  for (const face of ['z', 'x']) for (const side of [-1, 1]) {
    const len = face === 'z' ? p.w : p.d, off = (face === 'z' ? p.d : p.w) / 2 - .08;
    const holes = face === 'z' && side === 1 ? [{ t0: -.7, t1: .7, y0: 0, y1: 1.9 }]
      : [{ t0: -.55, t1: .55, y0: .95, y1: 1.7 }];
    for (const [a, b, low, high] of facePanels(len, H, holes)) {
      const n = Math.ceil((b - a) / .45), w = (b - a) / n;
      for (let k = 0; k < n; k++) {
        const t = a + (k + .5) * w;
        // 風雨に晒した古材：板ごとに灰色がかった茶の濃淡（新しい木の色を揃えて並べない）
        const tone = PLANK[(Math.floor(t * 7.3 + p.x * 3.1 + side * 5) % 4 + 4) % 4];
        if (face === 'z') box(t, (low + high) / 2, side * off, w - .006, high - low, .08, tone);
        else box(side * off, (low + high) / 2, t, .08, high - low, w - .006, tone);
        // 裾の泥と雨じみ。薄い板をまとめて描き、窓と戸口には重ねない。
        const stain = Math.min(high - low, .14 + h01s(t, p.z + side) * .25);
        if (low === 0) {
          if (face === 'z') box(t, stain / 2, side * (off + .045), w - .02, stain, .014, 0x625844);
          else box(side * (off + .045), stain / 2, t, .014, stain, w - .02, 0x625844);
        }
      }
    }
  }
  for (const x of [-p.w / 2 + .1, p.w / 2 - .1]) for (const z of [-p.d / 2 + .1, p.d / 2 - .1]) {
    box(x, H / 2, z, .22, H, .22, 0x65533e);
    for (const yy of [.45, H - .25]) for (let k = 0; k < 3; k++) box(x, yy + k * .035, z, .26, .025, .26, 0xb2a079);
  }
  // 土台（地に据えた太い角材）と、壁の上の桁。柱と横の材が前に出て、板壁の箱に見せない
  for (const side of [-1, 1]) {
    box(0, .09, side * (p.d / 2 - .08), p.w + .1, .18, .16, 0x3e3226);
    box(side * (p.w / 2 - .08), .09, 0, .16, .18, p.d + .1, 0x3e3226);
    box(0, H - .08, side * (p.d / 2 - .08), p.w + .2, .16, .18, 0x45372a);
    box(side * (p.w / 2 - .08), H - .08, 0, .18, .16, p.d + .2, 0x45372a);
  }
  for (const x of [-.78, .78]) box(x, .95, p.d / 2 - .08, .14, 1.9, .16, 0x51412f);
  box(0, 1.98, p.d / 2 - .08, 1.7, .16, .16, 0x51412f);
  // 低い切妻に厚い茅を束ねる。軒を小道へ張り出しすぎず、押さえ木と重しで留める。
  const half = p.w / 2 + .35, rise = half * .25, slope = Math.hypot(half, rise), RD = p.d + .6, ang = Math.atan(.25);
  for (const side of [-1, 1]) {
    const n = Math.ceil(RD / .5);
    // 軒から棟へ四段を重ねる。藁束の間へ短い板を差し、段の影を残す。
    for (let row = 0; row < 4; row++) for (let k = 0; k < n; k++) {
      const f = (row + .5) / 4, z = -RD / 2 + (k + .5) * RD / n;
      box(side * half * (1 - f), H + rise * f - .12 + row * .045, z, slope / 4 + .16, .18, RD / n + .03, [0x796d4f, 0x8c7953, 0x695e48, 0x95825c][(k + row) % 4], -side * ang);
      if ((k + row) % 3 === 0) box(side * half * (1 - f), H + rise * f + row * .045, z, slope / 4 + .2, .04, RD / n * .7, PLANK[(k + row) % 4], -side * ang);
    }
    for (const f of [.28, .58, .88]) {
      const bx = side * half * (1 - f), by = H - .2 + rise * f + .2;
      box(bx, by, 0, .1, .1, RD, 0x4a3e30);
      for (let q = 0; q < 5; q++) {
        const z = -RD / 2 + (q + .5 + (h01s(p.x + q, f) - .5) * .5) * RD / 5, r = .1 + h01s(q, p.z + f) * .08;
        stone(bx + side * .02, by + .1 + r * .5, z, r);
      }
    }
  }
  // 妻の破風板（屋根の縁に沿った板）
  for (const zs of [-1, 1]) for (const side of [-1, 1]) box(side * half / 2, H + rise / 2 - .14, zs * RD / 2, slope + .1, .22, .06, 0x3e3226, -side * ang);
  for (let x = -p.w / 2; x < p.w / 2; x += .4) {
    const h = Math.max(.05, rise * (1 - Math.abs(x + .2) / half));
    for (const z of [-p.d / 2 + .08, p.d / 2 - .08]) box(x + .2, H + h / 2 - .1, z, .4, h, .08, 0x6e604c);
  }
  return I;
}
function shedMesh(parts) {
  // 木目と節のある板の材（城・砦の部品と同じ。色だけの板にすると、陰の面が紺の箱に見えた）
  shedMat ||= castleMat('wood');
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), shedMat);
  for (const g of parts) g.dispose();
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = true;
  return mesh;
}

// 寄せの頭：柵の内の守り（織田の兵）が厚い側を避ける。道の長さ・口の狭さに揺らぎを掛けて選ぶ（siege_ai.js の chooseRoute）
function pickYose(rt, prefer) {
  const thick = (r) => {
    let n = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 0 && Math.hypot(u.pos.x - (r.yose.x + r.dir.x * 20), u.pos.z - (r.yose.z + r.dir.z * 20)) < 14) n++;
    return 1 + n * 0.35 + (prefer && prefer !== r.id ? 0.6 : 0);
  };
  const routes = Object.values(YOSE).map((r) => ({ ...r, defThickness: thick(r) }));
  return YOSE[(chooseRoute(routes, Math.random) || YOSE.kita).id];
}
// 斎藤の寄せの備：本物は波の組をそのまま預け（adoptGroup）、後ろに続く数百は軽い大軍（名目の数）で見せる
function yoseButai(rt, g, o) {
  const at = { x: o.at.x - o.dir.x * 14, z: o.at.z - o.dir.z * 14 };
  const b = makeButai(rt, { name: o.name, general: o.general, team: 1, faction: 'saito', kind: 'ashigaru', nominal: g.count + o.back, real: 0, at, facing: Math.atan2(o.dir.x, o.dir.z), armor: o.armor || 0x3a3a30, flag: 'saito' });
  adoptGroup(b, g);
  b.light.army.team = 1;
  b.light.army.jinkeiGuard = true;
  // 軽い大軍は柵から 50m ほどまで押し出して止まる
  const d = Math.max(0, Math.hypot(at.x, at.z) - FORT - 50);
  b.push = () => { if (b.light && d > 0 && g.count && !g.routed) b.light.advance(d, d / 1.6); };
  return b;
}
// 竹束を押して寄せ場までゆっくり進み、着いたら柵へ取り付く（kaito 10/1「攻め手は竹束を押してゆっくり寄せる」）
function yoseApproach(rt, g, r, side, n = 3) {
  if (!g.count || g.routed) return;
  const sp0 = g.speed;
  g.order = 'move'; g.dest = { ...r.yose }; g.speed = 2.2;
  g.onArrive = (gg) => { gg.order = 'assault'; gg.speed = sp0; gg.formation = 'yari'; gg.yariRanks = 3; gg.width = 6; gg.facing = Math.atan2(r.dir.x, r.dir.z); };
  g.assault = assaultFn(rt, side);
  const c = g.center();
  for (let k = 0; k < n; k++) addTaba(rt, c.x + r.dir.x * 3, c.z + r.dir.z * 3, 1, { van: g, dir: r.dir, off: (k - (n - 1) / 2) * 3.4, vanDist: 3, rot: Math.atan2(r.dir.x, r.dir.z) });
  // 寄せ場へ実際に着くまで隊列を保つ。時間だけで柵への突撃に切り替えない。
}

function buildFort(rt) {
  const W = rt.world;
  const segs = [];
  const nSegs = [];
  // 柵（palisade）と土塁（dorui）は区画ごとに別メッシュだったので、砦一つぶんをそれぞれ
  // 一つの BatchedMesh へまとめて描く回数を減らす（見た目・壊れた時の傾きはそのまま）
  const fb = makeSimpleBatch(), db = makeSimpleBatch();
  const add = (ax, az, bx, bz, side, nx, nz) => {
    const s = rt.army.addStruct({ seg: [ax, az, bx, bz], side, nx, nz, hp: 240, maxHp: 240, team: 0, name: '柵' });
    s.mesh = palisade(W, s.seg, { batch: fb });
    if (!s.mesh.isBatchedPart) rt.scene.add(s.mesh);
    // 柵の外の土塁（草の生えた土の斜面）
    const d = dorui(W, s.seg, nx, nz, { batch: db, h: .02 }); // 盛り土は歩く地形に反映済み。草土の表面だけ重ねる。
    if (!d.isBatchedPart) rt.scene.add(d);
    segs.push(s);
    if (side === 'n') nSegs.push(s);
  };
  const st = (FORT * 2) / 8;
  for (let i = 0; i < 8; i++) {
    const a = -FORT + i * st, b = a + st;
    add(a, -FORT, b, -FORT, 'n', 0, -1);
    add(-FORT, a, -FORT, b, 'w', -1, 0);
    add(FORT, a, FORT, b, 'e', 1, 0);
  }
  for (const [a, b] of [[-18, -13], [-13, -8], [-8, -3], [3, 8], [8, 13], [13, 18]]) add(a, FORT, b, FORT, 's', 0, 1);
  // 四隅は柵が直角に出会う所。角の内側で二つの柵にはさまれて進めなくなるのを防ぐため、角を斜めに削る
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(sx * (FORT - 0.9), sz * FORT, sx * FORT, sz * (FORT - 0.9), 'c', sx * 0.7, sz * 0.7);
  }
  finalizeSimpleBatch(rt, fb);
  finalizeSimpleBatch(rt, db);
  // 完成した砦から始めない（spec 17〜24）：北の柵は普請の途中。北門（中央2区画）と、もう1区画は
  // まだ結っていない（alive=false・見た目は隠す＝assaultFn の「破れ目」と同じ扱いで、弱点として遊びに使える）
  segs.gate = [nSegs[3], nSegs[4]];
  segs.unfinished = [nSegs[2], nSegs[3], nSegs[4]];
  for (const s of segs.unfinished) { s.alive = false; s.mesh.visible = false; s.building = true; }
  return segs;
}

// 普請は実在の人足が持ち場へ着いてから進む。敵が迫れば作業を止める。
function finishBuild(rt, order, onDone, reinforce = false) {
  const F = rt.flags;
  if (!order.length || rt.over || F.ending || F.won) return;
  if (F.buildBusy) { if (!reinforce) F.buildPending = { order, onDone }; return; }
  F.buildBusy = true;
  let i = 0, worked = 0;
  const step = () => {
    if (rt.over || F.ending || F.won) { F.buildBusy = false; return; }
    const s = order[i], wk = F.wk;
    if (!wk || wk.routed || !wk.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget)) {
      F.buildBusy = false;
      if (reinforce) { F.reinforcing = false; F.reinforceStopped = true; }
      return;
    }
    const x = (s.seg[0] + s.seg[2]) / 2 - s.nx * 6;
    const z = (s.seg[1] + s.seg[3]) / 2 - s.nz * 6;
    wk.order = 'move'; wk.dest = { x, z }; wk.speed = 1.4; wk.onArrive = null;
    let hands = 0, foe = false;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
      if (u.team === 1 && Math.hypot(u.pos.x - x, u.pos.z - z) < 18) foe = true;
      if (u.group === wk && Math.hypot(u.pos.x - x, u.pos.z - z) < 8) hands++;
    }
    // 敵が近い間は、人足を柵ぎわに立たせたままにしない。小屋の南の陰へ下げ、槍の列の後ろで待たせる。
    if (foe) { wk.dest = { x: -4, z: 9 }; wk.speed = 2.2; }
    sunoProgress(rt, 'gate', foe ? '敵が近く、普請が止まっている。人足を守れ' : hands < 2 ? '人足が柵へ向かう。道を空けよ' : '人足が柵を結んでいる。持ち場を守れ');
    // 人足が結んでいる間は、掛矢で杭を打つ音が柵ぎわから聞こえる（普請が進んでいる事を画面の字に頼らず伝える）。
    if (!foe && hands >= 2) { worked += F.buildStock > 0 ? 2 : 1; if (F.buildStock > 0) F.buildStock--; rt.army.play('knock', { x, z }, 0.55); rt.after(0.45, () => { if (!rt.over) rt.army.play('knock', { x: x + 1, z }, 0.4); }); }
    if (worked >= 5) {
      if (reinforce && !s.reinforced) { s.maxHp *= 1.25; s.reinforced = true; }
      s.alive = true; s.hp = s.maxHp; s.building = false; s.mesh.visible = true;
      if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
      rt.army.play('knock', { x, z }, 0.8);
      worked = 0; i++;
    }
    if (i < order.length) rt.after(1, step);
    else {
      F.buildBusy = false;
      wk.order = 'move'; wk.dest = { x: -4, z: 9 };
      wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -4, z: 9 }; };
      if (onDone) onDone();
    }
  };
  step();
}

// 馬防柵：南北に長い柵を三重に。列の間は数メートル、ところどころに虎口（出入りの口）を空ける
// x0 が一列目（敵に近い側）、facing が敵の方向（+1 = x の正の向き）
export function buildBobosaku(rt, o) {
  const { x0, z0, z1, rows = 3, gap = 7, segLen = 6, gates = [], facing = 1, hp = 520 } = o;
  const out = [];
  const bb = o.noBatch ? null : makeSimpleBatch();
  if (bb) bb.mergeFence = true;
  for (let r = 0; r < rows; r++) {
    const x = x0 - facing * r * gap;
    const off = (r % 2) * segLen * 0.5;   // 列ごとに口の位置をずらす
    for (let z = z0 + off; z < z1 - 0.5; z += segLen) {
      const a = z, b = Math.min(z1, z + segLen);
      const mid = (a + b) / 2;
      // 虎口：口の位置（列ごとに半区画ずらす）を含む区画は結わない
      if (gates.some((g) => { const gz = g + (r % 2) * segLen * 0.5; return gz >= a && gz < b; })) continue;
      const bend = Math.sin(mid * 0.05 + r) * 1.2 + (Math.floor((mid + r * 7) / 24) % 2) * 1.1;   // まっすぐすぎない：折れと一段のずれ（A119）
      const s = addFieldFence(rt, [x + bend, a, x + bend, b - 0.9], { side: 'baboo', nx: facing, nz: 0, hp, team: 0, name: '馬防柵', row: r, horse: true, batch: bb });
      out.push(s);
    }
  }
  if (bb) finalizeSimpleBatch(rt, bb);
  return out;
}

// 壊れた柵だけを一区画ずつ直す。小屋の傷は声だけでは戻さない。
function repairFort(rt) {
  if (rt.flags.buildBusy) { rt.flags.repairPending = true; return; }
  rt.flags.repairPending = false;
  finishBuild(rt, rt.flags.segs.filter((s) => !s.alive), () => rt.say('人足', '破れた柵を結び直したぞ', 3));
}

// 普請を失った時は、自分の組も小屋を避けて南門へ退く。終わりの待ちにも退き先を残す。
function retreatFort(rt) {
  rt.marker('retreat', { x: 0, z: FORT + 8 }, '南門の外へ退く', { h: 2.5 });
  for (const g of rt.squadGroups || []) {
    if (!g.count || g.routed) continue;
    const c = g.center();
    if (Math.abs(c.x) >= FORT || Math.abs(c.z) >= FORT) continue;
    const lane = c.x < 0 ? -6 : 6;
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0;
    g.path = [[lane, c.z], [lane, 10], [0, 10], [0, FORT + 8]];
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 0, z: FORT + 8 }; };
  }
}

// 砦内でまだ戦える敵だけを調べる。退く者を討ち尽くす条件にはしない。
function fortSafe(rt) {
  for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && Math.abs(u.pos.x) < FORT + 3 && Math.abs(u.pos.z) < FORT + 3) return false;
  return true;
}

// 北門がまだ開いている時、前野の手が門の口に槍を並べて塞ぐ（口へ押し寄せる寄せ手と槍衾がぶつかる所が、毎回の山場になる）。
// 寄せが北でなければ、または口が塞がったら西の持ち場へ戻る。
function gateWall(rt, on) {
  const F = rt.flags, g = F.ally;
  if (!g || !g.count || g.routed) return;
  const open = F.segs.gate.some((s) => !s.alive);
  if (on && open) {
    if (F.gateWallOn) return;
    F.gateWallOn = true;
    g.order = 'move'; g.dest = { x: -2, z: -FORT + 2.5 }; g.speed = 3;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -2, z: -FORT + 2.5 }; q.facing = Math.PI; q.formation = 'yari'; q.yariRanks = 2; q.width = 6; q.aggro = 6; };
    rt.say('前野長康', '北の口が開いておる！　わしの手で槍を並べて塞ぐ。お主の組は脇を固めよ', 3.5);
  } else if (F.gateWallOn && (!on || !open)) {
    F.gateWallOn = false;
    g.order = 'move'; g.dest = { x: -14, z: 2 }; g.speed = 2.6;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -14, z: 2 }; q.facing = -Math.PI / 2; q.width = 3; q.aggro = 5; };
  }
}

function assaultFn(rt, side) {
  const outside = { x: 0, z: 0 }, cands = [];
  let crowdTeam, crowdSeg, crowdCount;
  const countCrowd = (o) => { if (o.alive && o.team === crowdTeam && o.segTarget === crowdSeg) crowdCount++; };
  const farFromCorner = (s) => {
    const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
    return Math.min(Math.hypot(mx - FORT, mz - FORT), Math.hypot(mx - FORT, mz + FORT), Math.hypot(mx + FORT, mz - FORT), Math.hypot(mx + FORT, mz + FORT)) > 6;
  };
  return (u) => {
    const F = rt.flags;
    const goal = u._sunoAssaultGoal || (u._sunoAssaultGoal = { x: 0, z: 0 });
    const inside = Math.abs(u.pos.x) < FORT - 0.4 && Math.abs(u.pos.z) < FORT - 0.4;
    if (inside) {
      if (!F.hut.alive) return null;
      // 小屋を一度に打てるのは6人まで。あぶれた者は小屋のまわりで守り手と斬り合う（一息に焼け落ちないように）
      const hit = F.hutHit || (F.hutHit = []);
      for (let i = hit.length - 1; i >= 0; i--) if (!hit[i].alive || hit[i].gone || hit[i].fleeing || hit[i].woundOut || hit[i].noTarget || !hit[i].group || hit[i].group.routed || Math.hypot(hit[i].pos.x - F.hut.x, hit[i].pos.z - F.hut.z) > 7) hit.splice(i, 1);
      if (hit.includes(u)) return F.hut;
      if (hit.length < 6) { hit.push(u); return F.hut; }
      const foe = rt.army.nearestEnemy(u, 16);
      if (foe) { goal.x = foe.pos.x; goal.z = foe.pos.z; return goal; }
      const a = u.id * 2.4;
      goal.x = F.hut.x + Math.sin(a) * 7.5; goal.z = F.hut.z + Math.cos(a) * 7.5; return goal;
    }
    // 破れ目があればそこから入る
    let gap = null, gd = 50;
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      outside.x = mx + s.nx * 2.5; outside.z = mz + s.nz * 2.5;
      if (d < gd && !rt.army.wallBetween(u.pos, -1, outside) && rt.world.walkable(outside.x, outside.z)) { gd = d; gap = s; }
    }
    if (gap) {
      const mx = (gap.seg[0] + gap.seg[2]) / 2, mz = (gap.seg[1] + gap.seg[3]) / 2;
      const out = (u.pos.x - mx) * gap.nx + (u.pos.z - mz) * gap.nz;
      const lat = Math.abs((u.pos.x - mx) * gap.nz - (u.pos.z - mz) * gap.nx);
      const step = out < 3 && lat < 2 ? -5 : 2.5;
      goal.x = mx + gap.nx * step; goal.z = mz + gap.nz * step; return goal;
    }
    if (u.segTarget?.alive) {
      rt.army.targetPoint(u.segTarget, u, outside);
      outside.x += u.segTarget.nx * 2; outside.z += u.segTarget.nz * 2;
      if (rt.army.wallBetween(u.pos, -1, outside)) u.segTarget = null;
    }
    if (!u.segTarget || !u.segTarget.alive) {
      // 角（袋小路）に近い柵は外す。角へ押し込まれて詰まるのを防ぐ（kaito 10/1：4m→6mに広げた。原因を測って・束の詰まり）
      cands.length = 0;
      for (const s of F.segs) if (s.alive && s.side === side && farFromCorner(s)) cands.push(s);
      if (!cands.length) for (const s of F.segs) if (s.alive && s.side === side) cands.push(s);
      if (!cands.length) return F.hut;
      // 柵は the 一区画に何人も詰めかけない（crowdOk は的が柵の時は数を絞らないので、ここで絞る。
      // 絞らないと、人気の一区画――たいてい角のすぐ隣――に皆が寄って、角の袋へ押し込まれて詰まる）
      let best = null, bd = Infinity;
      for (const s of cands) {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        outside.x = mx + s.nx * 2; outside.z = mz + s.nz * 2;
        if (rt.army.wallBetween(u.pos, -1, outside) || !rt.world.walkable(outside.x, outside.z)) continue;
        crowdTeam = u.team; crowdSeg = s; crowdCount = 0;
        rt.army.forNear(mx, mz, 3.2, countCrowd);
        if (crowdCount >= 7) continue;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      // 届く区画が混んでいても、届かない反対側の柵へ振り替えない。
      if (!best) for (const s of cands) {
        rt.army.targetPoint(s, u, outside); outside.x += s.nx * 2; outside.z += s.nz * 2;
        if (!rt.army.wallBetween(u.pos, -1, outside) && rt.world.walkable(outside.x, outside.z)) { best = s; break; }
      }
      u.segTarget = best;
    }
    if (u.segTarget) return u.segTarget;
    // 物見や堀に遮られた遠い兵にも、柵へ回る行き先を返す。空なら元の控えへ戻ってしまう。
    if (side === 'e') {
      goal.x = Math.max(FORT + 8, Math.min(52, u.pos.x)); goal.z = 3;
      if (Math.abs(u.pos.z - 3) < 3) goal.x = FORT + 3;
    } else if (side === 'n') {
      goal.x = 0; goal.z = u.pos.z < -FORT - 12 ? -FORT - 14 : -FORT - 3;
    } else {
      goal.x = u.pos.x < -FORT - 12 ? -FORT - 14 : -FORT - 3; goal.z = 0;
    }
    return goal;
  };
}

let sunoDem = null;
import('./asset_dem_sunomata.js').then((m) => { sunoDem = m.default; }).catch(() => {});

// 首巻の洲股修築と一夜城伝承を分ける。守将の参加・三方の寄せは伝承に沿う遊びの復元。
const SUNOMATA_JIN = [
  battleJin('砦の守り', 0, { x: 4, z: 2 }, Math.PI, [
    ['suKino', '本陣', '木下藤吉郎', 80, 4, 2, 'tokichiro.group', 'oda'],
    ['suMaeno', '西の柵', '前野長康', 50, -14, 2, 'ally', 'oda'],
    ['suHachi', '東の柵と舟着き', '蜂須賀正勝', 50, 13, 2, 'ally2', 'oda', 'hachisuka'],
    ['suSupply', '南門と普請の控え', '名は伝わらない', 1320, -64, 112, 'jinSupply', 'oda'],
  ], '織田千五百は人足と砦外の控えを含む仮の数。柵内の守りは百八十の目安。'),
  battleJin('三方の寄せ', 1, { x: 160, z: -30 }, -Math.PI / 2, [
    ['suNorth', '北の仕寄り', '名は伝わらない', 1200, -30, -150, 'jinNorth', 'saito', 'saito', 0],
    ['suWest', '西の仕寄り', '名は伝わらない', 1000, -150, -12, 'jinWest', 'saito', 'saito', Math.PI / 2],
    ['suEast', '東岸の控え', '名は伝わらない', 1000, 150, -60, 'jinEast', 'saito'],
    ['suHead', '本陣', '名は伝わらない', 800, 160, -30, 'jinEnemyCamp', 'saito'],
  ], '斎藤四千は仮の数。指揮した将の名は不明。龍興の出陣を断定しない。'),
];

const sunomata = {
  jinkei: SUNOMATA_JIN,
  // 砦にいる本人を使う。名の確かでない敵将や、台本外の寄せは増やさない。
  taisho: { a: { name: '木下藤吉郎', use: true }, b: null },
  noTaishoRaid: true,
  botOrders: true, // 柵の内での守り・南門への回り道・深手の退避を遊び手の突進で上書きしない。
  noWake: false, // 任務の実兵は回収せず、近づいた軽い兵だけ同じ場所で本物へ替える。
  noReserve: true, // 共通の補充で台本外の新しい寄せを足さない。
  noDistantBattle: true, // 点呼に入らない飾りの軍勢を共通側で重ねない。
  // 共通の「前線の濃さ」は、控えの寄せ手を台本の外で砦へ送り、柵の内に物見を湧かせていた。寄せは三度の手と、日暮れの小さな波だけで決める。
  frontlineDensity: false,
  noRevive: true,
  strictHits: true, // 一撃の上限と連続被弾の軽減で本人だけ助けない。
  wakeRoom: 250,
  // 自分の組への下知は、上役の隊が進む知らせと分ける（組へ号令するたびに「任務の印へ」が重なっていた）。
  signalHint: (rt, g, kind) => g.team !== rt.player.u.team || kind !== 'susume' ? ''
    : g.isPlayerSquad ? '組の太鼓：進め' : '味方の隊が進む。自分の組は任務の印へ向かえ',
  // 南門へまっすぐ歩ける中央の道。北西の小屋と柵の間から始めない。
  spawn: { x: 2, z: 12, heading: 0 },
  world: {
    moveWay: sunomataRunnerWay,
    runnerWay: sunomataRunnerWay,
    blockedHint: () => '柵は通れない。「外へ出る門」の印へ、真ん中の道を歩け',
    seed: 33,
    muddy: 0.45,     // 川辺の砦は湿っている
    paths: SUNOMATA_PATHS,
    water: { x: 62, x2: 112, level: -0.7 },
    riverCross: true, // 舟以外は深みを歩いて渡れない。   // 長良川：向こう岸は 112 から
    waterSlow: true,   // 水が主役（spec first6 17〜24）：川の中は terrain_tags の 'water' で歩み・向き変えが鈍る
    time: 'day',
    autumn: true,
    // 長良川の中洲と枝の水路：川の手前に低い砂の洲（渡りの足場）と、細い水路が砦の前を横切る
    streams: [{ pts: [[-176, -52], [-80, -48], [-30, -44], [30, -46], [60, -60]], w: 2.4, depth: 0.7 }],
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.08 + x * 0.02);
      // 川沿いの低地。高い丘でなく、寄せ手の旗が見える低い微高地。
      h += 1.4 * gauss(x, z, -140, -140, 3000) + 0.9 * gauss(x, z, -150, 60, 2600);
      // 国土地理院の標高（asset_dem_sunomata.js）を薄く混ぜる（砦と堀の整地はこのあと）
      if (sunoDem) h = demBlend(sunoDem, x, z, h, { scale: 0.25, floor: h - 1.5, xyScale: 4 });
      // 川面の範囲と河床をそろえ、舟着きの西岸を水面下にしない。
      if (x > 58 && x < 112) {
        const bank = Math.min(1, (x - 58) / 8, (112 - x) / 4);
        h = h * (1 - bank) - 2.6 * bank;
      }
      h = sunomataGround(x, z, h);
      // 外の空堀（castles/sunomata.js の HORI）
      for (const f of MOAT) h += f(x, z);
      return h;
    },
    tint(x, z, h, c) {
      if (x > 50 && x < 118) c.setRGB(0.42, 0.38, 0.28);
      if (Math.abs(x) < FORT && Math.abs(z) < FORT) c.setRGB(0.4, 0.34, 0.24);
    },
    clear: (x, z) => (Math.abs(x) < 70 && Math.abs(z) < 70) || x > 45 || Math.hypot(x + 100, z - 150) < 34,
    trees: 260,
    tufts: 3500,
    groves: [{ x: -95, z: -30, r: 14, n: 20 }, { x: -60, z: 100, r: 12, n: 14 }, { x: 30, z: -110, r: 14, n: 18 }],
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    flReset();
    // 共通の札と台詞をこの戦だけで絞る。討死の返事は実際の死亡処理中だけ。
    const bark = rt.bark.bind(rt), say = rt.say.bind(rt), onKill = rt.onKill.bind(rt);
    rt.bark = (text, ...args) => {
      if (text.startsWith('弓隊が遅れている')) {
        if (F.bowLagShown) return;
        F.bowLagShown = true;
      }
      return bark(text, ...args);
    };
    rt.onKill = (v, k) => {
      F.allyFell = v.team === 0 && !v.alive && !v.civ && !v.isStruct;
      try { return onKill(v, k); } finally { F.allyFell = false; }
    };
    rt.say = (name, text, ...args) => {
      if (name === '木下藤吉郎' && text.includes('仲間が討たれた') && !F.allyFell) return;
      return say(name, text, ...args);
    };
    // 時計が毎回使う夕色を開戦時だけ調整し、陰の兵にも空の光を回す。
    const dusk = W.dayClock?.dusk;
    if (dusk) {
      dusk.sky.set(0xd3a08a); dusk.fog.set(0xb79b8d); dusk.top.set(0x956f79);
      dusk.glow.set(0xff8054); dusk.glowK = .85;
      dusk.hemiSky.set(0xd3b9a0); dusk.hemiGround.set(0x81715b);
      dusk.hemiI = Math.max(dusk.hemiI, 1.65); dusk.sunI = Math.max(dusk.sunI, 1.7);
    }
    // 人数だけで順番待ちにせず、槍の間合い・柵・隊列の当たりで打てる者を決める。
    rt.army.maxAttackers = 250; rt.army.mobCapMax = 250; rt.army.attackCap = 250;
    rt.army.crowdOk = sunomataCrowdOk;
    // 縄張り（castles/sunomata.js）：物見・空堀・場の当たり。柵は下の buildFort が結う
    F.C = buildCastlePlan(rt, SUNOMATA_PLAN, { buildTowers: true, team: 0 });
    patchGunCover(rt);
    // 洲股の地域と、一夜城伝承の推定場所を分ける。今の川筋や縄張りは確定しない。
    // 縄張りの細部・寄せの道筋はゲーム補完。もしもの防衛戦である事自体が GAME_C
    F.hist = { sunomataRegion: 'HIST_A', site: 'HIST_B', fort: 'HIST_B', kuruwa: 'GAME_C', assaultRoutes: 'GAME_C', foeComposition: 'GAME_C', sheds: 'GAME_C', channels: 'GAME_C' };
    F.segs = buildFort(rt);
    // 南の冠木門と、兵糧の俵
    rt.scene.add(kabukimon(W, 0, FORT, 6, 0, { doors: false }));
    rt.scene.add(tawara(W, 9, -11, 0.4, 6), tawara(W, -10, 7, -0.3, 5), tawara(W, 6, 8, 1.2, 3));
    F.hut = rt.army.addStruct({ x: 0, z: -4, r: 3.8, solidR: 0, hp: 1500, maxHp: 1500, armor: 0.4, team: 0, name: '普請小屋' });
    W.sunoHut = F.hut;
    const mainParts = [], rampStart = FL.ramps.length, deckStart = FL.decks.length;
    F.hut.naka = fortShed(rt, MAIN_SHED, mainParts);
    F.hut.naka.struct = F.hut;
    F.hut.floors = { rampStart, rampEnd: FL.ramps.length, deckStart, deckEnd: FL.decks.length };
    F.hut.mesh = shedMesh(mainParts);
    rt.scene.add(F.hut.mesh);
    // 砦の内の小屋の並び：兵舎・倉・武器置場・兵糧置場・作業場（急ごしらえの板屋。柵の内側に寄せる）
    const shedParts = [];
    for (const p of SHEDS) fortShed(rt, p, shedParts);
    rt.scene.add(shedMesh(shedParts), tawara(W, 12, 13, .2, 6));
    // 北西の物見は縄張り側が一つ置く。重ねて置かない。
    // 斜面の逆茂木：柵の外に尖った枝の束を並べる（北と東西。南の門の前は空ける）
    for (let k = -2; k <= 2; k++) rt.scene.add(sunoSakamogi(W, k * 7, -FORT - 5.5, Math.PI, 5), sunoSakamogi(W, -FORT - 5.5, k * 7, -Math.PI / 2, 5), sunoSakamogi(W, FORT + 5.5, k * 7, Math.PI / 2, 5));
    rt.scene.add(lumber(W, 9, -10, 0.2));
    rt.scene.add(lumber(W, 10, 4, -0.1));
    rt.scene.add(lumber(W, -9, 7, 1.4));
    rt.scene.add(scaffold(W, -9, -16, 0.3)); // 小屋の戸口と西の通路を空ける。
    // 未完成の柵ぎわの資材：丸太の山・足場・俵（普請の途中の跡。A049）
    rt.scene.add(lumber(W, -13, -18, 0.6), lumber(W, 14, -19, -0.4), lumber(W, -19, 12, 1.2), scaffold(W, 8, -18, -0.2), scaffold(W, -18, -6, 1.5), tawara(W, 17, 8, 0.3, 4));
    // 普請の途中：北東の隅は櫓の足場だけ、縄を張った杭で次に結う柵の線を示す
    F.scaf = scaffold(W, 13, -13, 0.1);
    rt.scene.add(F.scaf);
    // 北の口のすぐ内にあった馬繋ぎは、口と柵の間に人を閉じ込めた（本人が六十秒挟まった）。東の一つだけ残す。
    rt.scene.add(umatsunagi(W, 14.5, 4, Math.PI / 2, 8));
    // 打って出る時の控え馬。飾りの馬繋ぎだけでなく、手綱を取れる馬を一頭置く。
    const h = buildHorse();
    h.position.set(12, W.heightAt(12, 5), 5);
    h.rotation.y = Math.PI;
    rt.scene.add(h);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h, heading: Math.PI, spd: 0, t: 20, calm: true, from: { team: 0, house: '織田', name: '', speed: 1, hp: 200 } });
    rt.after(6, () => rt.bark('東の馬繋ぎに控え馬がいる。静かに寄り、「乗る」で手綱を取れる'));
    // 大軍：川向こうの岸に斎藤の本隊が隊ごとに並ぶ。北と西の丘にも斎藤の備え（襲来はそこから来る）
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, kind, host: false });
      m.army.team = flag === 'oda' ? 0 : 1;
      m.army.jinkeiGuard = true; // 控えは近づいた本人の後へ勝手について行かない。
      return m;
    };
    // 岸の前に鉄砲と槍、後ろに騎馬の備と斎藤の本陣
    const KS = ['gun', 'spear', 'gun', 'spear', 'mixed', 'cavalry', 'honjin', 'cavalry', 'spear'];
    [[128, -118], [126, -62], [130, -8], [128, 50], [134, 110], [156, -88], [160, -30], [156, 34], [160, 92]]
      .forEach(([x, z], i) => KS[i] !== 'honjin' && DA(x, z, KS[i] === 'gun' ? 28 : (KS[i] === 'honjin' ? 30 : 16), KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 24 : 28), KS[i] === 'cavalry' ? 100 : 150, -Math.PI / 2, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 7 + i, KS[i]));
    // 川向こうの控えは軽い旗列。参戦の記録がない龍興の本陣は置かない。
    F.jinEast = DA(150, -60, 12, 18, 100, -Math.PI / 2, 0x35382c, 'saito', 15, 'spear');
    F.jinEnemyCamp = DA(160, -30, 30, 24, 150, -Math.PI / 2, 0x35382c, 'saito', 16, 'honjin');
    for (const [x, z] of [[132, -90], [134, 20], [136, 80], [150, -40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.jinNorth = DA(-30, -150, 60, 12, 200, 0.1, 0x35382c, 'saito', 17, 'mixed');
    DA(-120, -106, 24, 30, 160, 0.8, 0x3a3a30, 'saito', 18, 'spear');
    F.jinWest = DA(-150, -12, 12, 40, 140, Math.PI / 2, 0x35382c, 'saito', 19, 'spear');
    // 味方：南に控える織田の備え
    F.jinSupply = DA(-64, 112, 34, 14, 170, Math.PI, KT.ARMOR.oda, 'oda', 21, 'spear');
    DA(34, 104, 28, 6, 130, Math.PI, KT.ARMOR.oda, 'oda', 22, 'gun');
    DA(-128, 90, 20, 14, 110, 2.0, KT.ARMOR.oda, 'oda', 23, 'cavalry');
    // 遠景の村（南西の在所。秋の柿）
    KT.farVillage(rt, -100, 150, { rot: Math.PI, n: 6, fields: 8, seed: 5, autumn: true });
    // 九月の刈田：畦に稲架を立て、刈った稲を干す
    for (const [x, z, r] of [[-70, 128, 0.1], [-52, 140, 0.05], [-88, 122, -0.1], [-30, 132, 0.2]]) rt.scene.add(hasa(W, x, z, r, 9));
    for (const [x, z] of [[-64, 100], [34, 94]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 砦の南：これから運び込む材木
    rt.scene.add(lumber(W, -14, 34, 0.5), lumber(W, 12, 44, -0.3), lumber(W, -36, 34, 1.2));
    // 襲来のたびに、川向こうの隊が岸まで押し出してくる（見た目だけ）
    F.far = [[150, -60], [150, 60], [150, -120], [150, 0], [150, 120], [150, -30]].map(([x, z], i) => ({ m: DA(x, z, 10, 8, 60, -Math.PI / 2, 0x35382c, 'saito', 40 + i, i % 2 ? 'gun' : 'spear'), v: 0 }));
    for (const [x, z] of [[-15, 15], [15, 15], [0, -15]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 篝火（夕暮れに灯る）
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) W.addFire(x, z, { torch: true, h: 1.5 });
    // 城の見栄え（A4）：篝火の火の下に鉄の籠の台、砦の外（北と西の寄せ口の間）に逆茂木、川の岸に竹束
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) rt.scene.add(kagaribi(W, x, z - 0.02));
    for (const [x, z, r] of [[-12, -25, Math.PI], [12, -25, Math.PI], [-25, -10, -Math.PI / 2], [-25, 10, -Math.PI / 2]]) rt.scene.add(sunoSakamogi(W, x, z, r, 6));
    for (const [x, z] of [[40, -30], [42, -26], [40, 26], [42, 30]]) rt.scene.add(takataba(W, x, z, Math.PI / 2));
    F.perfect = true;

    const n = RANKS[rt.G.rank].squad || 5;
    // 守りや敵の強さを本人の身分で変えない。
    const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
    rt.makeSquad({ x: 0, z: 10 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    const tk = allyGroupA(rt, { name: '藤吉郎', fixed: true, fullStrength: true, anchor: { x: 4, z: 2 }, facing: Math.PI, formation: 'ring', aggro: 5 }, [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', invuln: true, allyOk: true, hat: 'jingasa_n' } }, { type: 'ashigaru', n: 4 }]);
    tk.leader = tk.units[0]; F.tk = tk;
    F.tokichiro = tk.units[0];
    const wk = allyGroup(rt, { name: '人足', fixed: true, fullStrength: true, anchor: { x: -6, z: -10 }, facing: 0, width: 3, aggro: 0 }, [{ type: 'porter', n: 10 }]);
    F.wk = wk;
    // 材木を運ぶ間も人足と敵を見張る。材を届けると実際の普請が早まる。
    F.buildStock = 0;
    const carried = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 2.1, 6), castleMat('wood'));
    carried.rotation.z = Math.PI / 2; carried.position.set(0, 1, .45); carried.visible = false;
    rt.player.u.mesh.add(carried); F.carriedWood = carried;
    const canCarry = () => !rt.over && !F.won && !F.ending && rt.player.u.alive;
    rt.addInteract('woodPick', { x: -9, z: 7 }, '材木を担ぐ', () => {
      if (!canCarry() || F.carryingWood) return;
      if (!rt.player.treatmentSafe()) { rt.bark('敵を押し返してから材木を担げ'); return; }
      F.carryingWood = true; carried.visible = true;
      rt.marker('woodDrop', { x: 6, z: -10 }, '材木を届ける場所', { h: 2 });
      sunoProgress(rt, F.sunoTask || 'defend', '北の柵の内へ材木を届けよ');
    }, { r: 3, hold: 1 });
    rt.addInteract('woodDrop', { x: 6, z: -10 }, '材木を人足へ渡す', () => {
      if (!canCarry() || !F.carryingWood) return;
      F.carryingWood = false; carried.visible = false; F.buildStock = Math.min(3, F.buildStock + 1);
      if (F.finalCheckSent && !F.buildBusy) F.finalChecked = true;
      else if (!F.buildBusy) this.doubleFence(rt);
      rt.unmark('woodDrop'); rt.army.play('wood', { x: 6, z: -10 }, .7);
      rt.bark('材木を届けた。人足の普請が進む');
    }, { r: 3, hold: 1 });
    rt.marker('woodPick', { x: -9, z: 7 }, '普請に使う材木', { h: 2 });
    // 人足は斬り合いの場から下がって待つ。士気が崩れて砦の外へ散り、そのまま任務が終わる事はさせない。
    wk.noRout = true;
    F.ally = allyGroupA(rt, { name: '前野長康の手', fixed: true, fullStrength: true, formation: 'yari', anchor: { x: -14, z: 2 }, facing: -Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '前野長康', invuln: true, allyOk: true } }, { type: 'ashigaru', n: 10 }]);
    // 川並衆：東の柵（川の側）を受け持つ
    F.ally2 = allyGroupA(rt, { name: '川並衆', fixed: true, fullStrength: true, formation: 'yari', anchor: { x: 13, z: 2 }, facing: Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, allyOk: true, hat: 'jingasa_n' } }, { type: 'ashigaru', n: 9 }]);
    F.koroku = F.ally2.units[0];
    F.ally.leader = F.ally.units[0]; F.ally2.leader = F.koroku;
    this.reserves(rt);
    // 門の印は出陣直後から残す。閉じた柵の向こうの敵へ直進させない。
    rt.scene.add(nobori(W, -3.8, FORT + 2, 'oda', 5), nobori(W, 3.8, FORT + 2, 'oda', 5));
    rt.marker('exitGate', { x: 0, z: FORT + 2 }, '外へ出る門（南門）', { h: 2.5 });
    rt.marker('post0', F.r1.side === 'n' ? { x: 6, z: -FORT + 6 } : { x: -FORT + 6, z: 0 }, `守る場所（${SIDE_WORD[F.r1.side]}の柵）`, { h: 2.5 });

    // 守る砦：後詰は三の手の段で一度だけ呼び、区域側からは重ねて出さない。
    // 寄せが退き、人足と柵が残り、敵のいない砦を二十秒守ってから勝つ。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'honjin', name: '砦の内', test: F.C.kuruwa.toride.test, pos: { x: 0, z: 0 }, need: 1, hold: 6, start: ZONE_STATE.FRIEND },
        { id: 'kishi', name: '岸の舟着き', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 3, hold: 8, start: ZONE_STATE.FRIEND },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      reinforceAt: { zoneId: 'honjin', sec: 150 },
      onReinforce: () => this.callReinforce(rt),
      winWhen: [
        [() => !!F.w3Clear && F.safeSince != null && rt.t - F.safeSince >= 20 && fortSafe(rt) && F.wk.count >= 2 && !F.buildBusy && F.segs.every((s) => s.alive) && F.finalChecked, WIN.timeHeld('honjin', 4)],
      ],
      onWin: () => this.holdWin(rt),
    });

    rt.setPhase('brief');
    sunoObj(rt, 'defend', '人足と小屋を守れ。最後の寄せを退け、柵を仕上げるまでが任務じゃ', 'main');
    sunoObj(rt, 'perfect', '追加の手柄：柵を一か所も破らせずに守れ（破れても主任務は続く）', 'side');
    rt.say('足軽大将', '藤吉郎殿の下知だ。お主は自分の組で、人足と柵を守れ', 5);
    rt.say('木下藤吉郎', '北の柵はまだ開いておる。人足を守り、先に口を塞ぐのじゃ', 4.5);
    rt.say('木下藤吉郎', '西は前野、東は小六が守る。お主は北の人足を守れ', 4);
    // 砦は完成していない所から始まる（spec 17〜24）：北の柵は普請の途中で、北門もまだ塞がっていない。
    // 上役が出した普請の順に、組で人足を守る。敵が迫れば作業を止める。
    sunoObj(rt, 'gate', '北の柵へ来る敵を止め、人足の普請を守れ（北門はまだ開いている）', 'side');
    rt.after(3, () => {
      const mark = (id, seg, label) => rt.marker(id, { x: (seg.seg[0] + seg.seg[2]) / 2, z: (seg.seg[1] + seg.seg[3]) / 2 }, label);
      mark('buildGate', F.segs.gate[0], '北門の口');
      mark('buildSide', F.segs.unfinished[0], '北門の西脇の破れ');
      rt.choose('足軽大将「北の普請を守る。組はどちらの口に付く？」', [
      { label: '北門の普請を守る', note: '上役の下知で北門から塞ぐ。組はその人足を守る' },
      { label: '脇の柵の普請を守る', note: '上役の下知で脇から直す。北門は開いたまま残る' },
    ], (i) => {
      rt.unmark('buildGate'); rt.unmark('buildSide');
      const [g1, g2] = F.segs.gate;
      const extra = F.segs.unfinished.find((s) => s !== g1 && s !== g2);
      const order = i === 0 ? [g1, g2, extra] : [extra, g1, g2];
      rt.say('木下藤吉郎', i === 0 ? 'よし、北門から塞ぐぞ！' : '脇の破れからじゃ、急げ！', 2.5);
      finishBuild(rt, order, () => { sunoDone(rt, 'gate'); sunoRemove(rt, 'gate'); rt.say('木下藤吉郎', '北の柵、ひとまず塞いだぞ！', 2.5); });
    }); });
    // 操作の案内は字幕に積まず、短い知らせで（弓の人数も書く）
    rt.after(2, () => rt.bark(bows ? `弓 ${bows}人が組に加わった（号令の相手を「弓隊」に替えられる）` : '組は槍だけ。柵の内から突け'));
    rt.after(20, () => rt.bark('「守る場所」の印へ歩き、柵の内から槍で突け。外へ出る時は南門の旗へ'));
    // 最初の持ち場の印は敵が来ても残し、閉じた柵へ直進させない。
    // 柵のすぐ際（-FORT+3）だと、柵が破られた所がそのまま自分の足元になり、始まってすぐ囲まれて倒れやすかった。
    // 柵から少し退いた所を持ち場にする（原因を測って・M9）
    // 一の手の道は、寄せの頭が選ぶ（北の畑か、西の林の口か。毎回変わる）
    rt.after(9, () => {
      if (F.wave) return;
      const w = SIDE_WORD[F.r1.side];
      rt.say('木下藤吉郎', `物見の知らせじゃ。一の手は${w}から来る。組を連れて${w}の柵に付け`, 3.5);
      rt.bark('自分の組は「守る場所」の印へ。小屋は脇を回れ。柵を越える時は南門へ');
    });
    // 一の手まで（出会うまでが長すぎるとの声で、少し早めた分、太鼓・煙は濃く残す）
    rt.after(12, () => this.wave1(rt));
    // 藤吉郎の策（名乗りの台詞が終わってから）
    rt.after(24, () => rt.choose('足軽大将「藤吉郎殿が柵の補強と弓の控えを用意した。組はどちらを助ける？」', [
      { label: '柵を直す人足を守る', note: '人足が北の柵へ材木を運ぶ。敵が近い間は作業を止める' },
      { label: '控えの弓を柵へ導く', note: '初めから控える二人が歩いて北の柵へ付く' },
    ], (i) => {
      if (i === 0) { rt.say('木下藤吉郎', '心得た、北の柵へ控えの材木を回す', 3); this.doubleFence(rt); }
      else {
        const g = F.bowReserve;
        g.order = 'move'; g.dest = { x: 5, z: -FORT + 6 };
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.facing = Math.PI; };
        rt.say('足軽大将', '控えの弓を北へ寄せる。射つ場所を空けてやれ', 3);
      }
      rt.G.rel.tokichiro.like += 3;
    }));
    // 普請小屋で手当てを受けられる（襲来の合間の立て直し）
    F.healCd = 0;
    rt.addInteract('heal', { x: -6, z: 5 }, '傷を縛ってもらう（一度まで）', () => {
      if (F.healUsed) { rt.hud.flash('この小屋の手当ては一度まで。処置は済んだ', 'dim'); return; }
      const p = rt.player, u = p.u;
      if (p.treatmentLeft <= 0) { rt.hud.flash('手当ての布が尽きた', 'dim'); return; }
      if (!p.treatmentSafe()) { rt.hud.flash('敵から退き、足を止めて手当てを受ける', 'dim'); return; }
      if (F.buildBusy) { rt.hud.flash('人足は柵を直している。手が空くまで待て', 'dim'); return; }
      let helper = null, helperD = Infinity;
      for (const o of F.wk.units) if (o.alive && !o.fleeing && !o.woundOut) {
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < helperD) { helper = o; helperD = d; }
      }
      if (!helper) { rt.hud.flash('手当てをする者がいない', 'dim'); return; }
      if (Math.hypot(helper.pos.x - u.pos.x, helper.pos.z - u.pos.z) > 3) {
        F.wk.order = 'move'; F.wk.dest = { x: -6, z: 5 };
        F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
        rt.hud.flash('人足が来るまで、敵から離れて待て', 'dim'); return;
      }
      if (!p.treatWounds(0.05)) return;
      F.healUsed = true;
      rt.uninteract('heal'); rt.unmark('heal'); F.healMarked = false;
      rt.say('人足', '傷を縛りまする。ご無理なさいますな', 2.5);
      sfx('ui');
    }, { r: 4 });
    rt.after(50, () => rt.bark('深手を負ったら普請小屋へ。敵から離れ、足を止めて手当てを受けよ'));
    rt.tutStart('組頭の手ほどき', [['radial', '号令の輪を開く'], ['cmd_yari', '槍を並べ、柵の内から突く'], ['cmd_fire', '弓隊に射撃を命じる'], ['group', '号令する組を選ぶ']]);
    F.nextWaveAt = 12;
    buildBattleJin(rt);
    dressHachiFlags(rt);
    tk.formation = 'ring';
    F.botBrain = makeSunomataBrain(rt);
  },

  reserves(rt) {
    const F = rt.flags;
    F.r1 = pickYose(rt); F.r2 = F.r1.id === 'kita' ? YOSE.nishi : YOSE.kita;
    const camp = (name, at, facing, list) => enemyGroup(rt, { fixed: true, faction: 'saito', name, anchor: at, facing, order: 'hold', formation: 'yari', yariRanks: 3, width: 6, aggro: 4, seekRange: 6, noAI: true, fleeDir: { x: at.x < -60 ? -1 : 0, z: at.x < -60 ? 0 : -1 } }, aiji(list, SAITO_AIJI));
    // 一の手の実兵は仕寄りの手前へ。出陣十二秒＋十六米の歩みで最初の接敵へ進む。
    const firstAt = { x: F.r1.yose.x - F.r1.dir.x * 16, z: F.r1.yose.z - F.r1.dir.z * 16 };
    // 一の手は先手と後詰の二つ。先手が柵の口で揉み合う間に後詰が押し出し、組が一度に二十人を受けないようにする。
    F.reserveW1 = camp('斎藤の一の手', firstAt, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]);
    F.reserveW1b = camp('斎藤の一の手（後詰）', { x: firstAt.x - F.r1.dir.x * 10, z: firstAt.z - F.r1.dir.z * 10 }, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }]);
    // 波の合間に柵を探る物見の小勢（一の手の後は一の手の側、二の手の後は北の畑から）
    F.probe1 = camp('斎藤の物見', { x: F.r1.from.x - F.r1.dir.x * 2, z: F.r1.from.z - F.r1.dir.z * 2 }, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    F.probe2 = camp('斎藤の物見（北）', { x: 14, z: -66 }, 0, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 1 }]);
    // 二の手は寄せの口の手前（柵から四十米ほど）に控え、砦から旗が見える。一の手の後、すぐ寄せて来る間合い。
    const r2At = { x: F.r2.from.x - F.r2.dir.x * 6, z: F.r2.from.z - F.r2.dir.z * 6 };
    F.reserveW2 = camp('斎藤の二の手', r2At, Math.atan2(F.r2.dir.x, F.r2.dir.z), [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 3 }]);
    // 北の畑・西の林という寄せの筋を保ち、控えを寄せ場の後ろへ置く。
    // 百米以上の道を歩く控えは遠景に任せ、本物を一分以上待たせない。
    F.reserveW3a = camp('斎藤の三の手（北）', { x: -10, z: -56 }, 0.45, [{ type: 'samurai', n: 1, o: { name: '斎藤方の旗持ち', flag: 'saito', flagScale: 1.8, tag: 'flag' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }]);
    F.reserveW3b = camp('斎藤の三の手（西）', { x: -56, z: -10 }, 1.2, [{ type: 'busho', n: 1 }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 3 }]);
    // 三の手の十五人を後続の三組へ分ける。総兵数を増やさず、同じ兵が順に寄せる。
    F.duskWaves = ['n', 'w', 'n'].map((side, i) => ({
      side, startedAt: null,
      group: camp(`日暮れの寄せ手（${['一', '二', '三'][i]}の組）`,
        side === 'n' ? { x: 12 + i * 4, z: -52 } : { x: -52, z: 12 },
        side === 'n' ? 0 : Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]),
    }));
    F.reserveW3d = camp('西の林の寄せ手', { x: -106, z: -26 }, Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }]);
    F.supplyEnemy = camp('西の林の物見', { x: -142, z: 48 }, Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
    F.boatWaves = [-20, -6, 8].map((z, i) => {
      const g = camp(`舟の寄せ手（${['一', '二', '三'][i]}の舟）`, { x: 130, z }, -Math.PI / 2,
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 2 }]);
      g.aggro = 0; g.fire = false; g.noRout = true; return g;
    });
    F.boatCrew = F.boatWaves[0];
    const guard = (name, at, list, formation = 'yari') => allyGroupA(rt, { fixed: true, fullStrength: true, name, anchor: at, facing: Math.PI, formation, aggro: 5, width: 3 }, list);
    F.gunReserve = guard('川並衆の鉄砲', { x: -6, z: 6 }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }], 'line');
    F.bowReserve = guard('控えの弓', { x: 6, z: 6 }, [{ type: 'bow', n: 2 }], 'line');
    F.supplyReserve = guard('材木の荷駄', { x: -112, z: 104 }, [{ type: 'porter', n: 4 }, { type: 'ashigaru', n: 2 }], 'column');
    F.supplyReserve.speed = 1.5;
    // 荷駄と後詰は呼ばれるまで動かない（共通の頭が「敵が七十米に来た」と西の林の物見へ打って出させていた）
    F.supplyReserve.stay = true;
    F.reinforceReserve = guard('南の控え', { x: -64, z: 112 }, [{ type: 'ashigaru', n: 9 }], 'column');
    F.reinforceReserve.stay = true;
    // 柵へ取り付く寄せ手は、三割ほど討たれると竹束の陰へ崩れる（城攻めの寄せは長く持たない）。
    // 柵の内の守り手は足場と柵の陰の分だけ傷が浅い。数で劣る組が持ち場を守れる釣り合いにする。
    for (const g of [F.reserveW1, F.reserveW2, F.reserveW3a, F.reserveW3b, F.reserveW3d, ...F.duskWaves.map((q) => q.group), ...F.boatWaves]) g.morale = 72;
    for (const g of [F.ally, F.ally2, F.tk, F.gunReserve, F.bowReserve]) if (g) g.defMult = 1.4;
    F.reserveB1 = yoseButai(rt, F.reserveW1, { name: '北西の先手の備', at: F.reserveW1.anchor, dir: F.r1.dir, back: 160 });
    F.reserveB2 = yoseButai(rt, F.reserveW2, { name: '北西の次の備', at: F.reserveW2.anchor, dir: F.r2.dir, back: 150 });
    F.reserveB3a = yoseButai(rt, F.reserveW3a, { name: '北の控えの備', at: F.reserveW3a.anchor, dir: { x: 0.4, z: 0.92 }, back: 130 });
    F.reserveB3b = yoseButai(rt, F.reserveW3b, { name: '西の控えの備', at: F.reserveW3b.anchor, dir: { x: 0.93, z: 0.36 }, back: 130 });
    F.flagbearer = F.reserveW3a.units[0];
    this.boats(rt, null);
  },

  wave1(rt) {
    const F = rt.flags;
    if (F.wave || F.ending || F.won || rt.over) return;
    F.wave = 1; F.waveT = 0; F.nextWaveAt = 0; F.w1T = rt.t;
    rt.setPhase('w1');
    const r = F.r1 || YOSE.kita, w = SIDE_WORD[r.side];
    F.W1 = F.reserveW1;
    F.B1 = F.reserveB1; F.B1.push();
    yoseApproach(rt, F.W1, r, r.side);
    rt.after(16, () => {
      if (rt.over || F.ending || F.won || F.next2) return;
      F.W1b = F.reserveW1b;
      if (!F.W1b.count || F.W1b.routed) return;
      yoseApproach(rt, F.W1b, r, r.side, 1);
      rt.bark(`${w}の後詰が押し出してきた。口を空けるな`, true);
    });
    gateWall(rt, r.side === 'n');
    rt.banner('斎藤勢、来襲', `${w}より`);
    rt.army.play('eshout', { ...r.from }, 2);
    rt.say('木下藤吉郎', `来おったぞ！　${w}じゃ。竹束を押して寄せてくる。柵に取り付かせるな！`, 3.5);
    rt.after(10, () => { if (rt.over || F.ending || F.won || !F.W1 || !F.W1.count || F.W1.routed) return; rt.say('蜂須賀正勝', '逆茂木で足が止まる。柵に取り付いた所を、内から槍で突け', 4); });
    rt.marker('w', centerOf(F.W1), '敵の寄せ', { red: true, group: F.W1 });
    sunoProgress(rt, 'defend', '');
    sunoObj(rt, 'defend', `普請を守れ（一の手・${w}の柵）`, 'main');
  },

  wave2(rt) {
    const F = rt.flags;
    if (F.W2 || F.ending || F.won || rt.over) return;
    F.wave = 2; F.waveT = 0; F.nextWaveAt = 0; sunoRemove(rt, 'scout'); sunoRemove(rt, 'gate');
    rt.setPhase('w2');
    // 波ごとに日が傾く：二の手は昼下がり、三の手で夕焼け
    rt.world.setTime('afternoon');
    // 二の手の道：寄せの頭が、一の手で守りが厚くなった側を避けて選ぶ（毎回変わる）
    // 二の手は控えていた側（一の手の反対）から寄せる。控えの場から遠い側へ百米以上歩かせると、戦の間が空く。
    const r = F.r2 || YOSE.kita, w = SIDE_WORD[r.side];
    rt.marker('post0', r.side === 'n' ? { x: 6, z: -FORT + 6 } : { x: -FORT + 6, z: 0 }, `守る場所（${w}の柵）`, { h: 2.5 });
    F.W2 = F.reserveW2;
    F.B2 = F.reserveB2; F.B2.push();
    const g = F.W2, c = g.center();
    g.formation = 'column'; g.colW = 2; g.speed = 2.2;
    // 同じ側なら前へ進む。側を替える時だけ砦の北西を回り、遠い控えへ逆戻りしない。
    // 縦隊の「道」は後列が遅れると先頭が待ち続け、二の手が控えの場で立ち尽くした（八十秒以上）。
    // 一つずつの行き先（move）で歩かせ、着かなくても update の見張りが寄せ場へ向かわせる。
    const fromNorth = c.z < -FORT - 12;
    const go = (q) => { if (!rt.over && !F.ending && F.wave === 2) yoseApproach(rt, q, r, r.side); };
    g.order = 'move';
    if (fromNorth === (r.side === 'n')) { g.dest = { ...r.from }; g.onArrive = go; }
    else { g.dest = { x: -FORT - 14, z: -FORT - 14 }; g.onArrive = (q) => { q.order = 'move'; q.dest = { ...r.from }; q.onArrive = go; }; }
    F.w2Go = rt.t; F.w2Fn = go;
    gateWall(rt, r.side === 'n');
    rt.banner('二の手', `${w}より`);
    rt.say('木下藤吉郎', `${w}の旗が動いた！　柵を守れ。南西の材木も迎えるぞ`, 4);
    rt.marker('w', centerOf(F.W2), '敵の寄せ', { red: true, group: F.W2 });
    sunoObj(rt, 'defend', `柵を守り、南の門から材木を迎えよ（二の手・${w}）`, 'main');
    // 西の柵の内に味方の鉄砲（まだ数は少ない）。二の手が柵へ寄せた所で一斉に放つ
    F.gunW = F.gunReserve;
    F.gunW.order = 'move'; F.gunW.dest = r.side === 'n' ? { x: -3, z: -FORT + 5 } : { x: -FORT + 5, z: -3 };
    F.gunW.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.facing = r.side === 'n' ? Math.PI : -Math.PI / 2; };
    rt.after(6, () => rt.say('蜂須賀正勝', `${w}へ鉄砲を回す。竹束の陰から出た敵を撃つぞ`, 4));
    // 荷駄
    const ND = F.supplyReserve;
    ND.order = 'path'; ND.path = [[-112, 104], [-90, 86], [-36, 44], [0, 26], [0, 8]];
    ND.onArrive = (g) => { g.order = 'hold'; };
    F.K = ND;
    F.saved = 0;
    sunoObj(rt, 'nida', '材木を担ぐ人足を南門へ導け', 'side');
    rt.marker('gate', { x: 0, z: FORT + 1 }, '南の門（打って出られる）', { h: 2.5 });
    // 荷駄を迎え終わるまで南門の印を残す。
    rt.marker('nida', () => ND.count && !ND.routed ? ND.center() : null, '材木を運ぶ人足', { group: ND });
    // 荷駄を狙う斎藤の組は、少し遅れて西の林から出る（砦から駆けつければ間に合う間をおく）
    rt.after(4, () => rt.say('木下藤吉郎', '南の門から荷駄を迎えよ！　荷を守るのも戦のうちじゃ。西の林を警戒せよ', 4.5));
    F.KE = null; F.KEwait = true;
    rt.after(18, () => {
      F.KEwait = false;
      if (rt.over || F.ending || F.won || F.wave !== 2 || F.nidaDone || F.woodsClear) return;
      const KE = F.supplyEnemy;
      if (!KE.count || KE.routed) return;
      KE.order = 'attack'; KE.seekRange = 90;
      KE.focus = ND.units.find((u) => u.alive && u.type === 'porter') || null;
      F.KE = KE;

      rt.say('足軽', '西の林から斎藤の者が出たぞ！　荷駄を狙っておる！', 3);
      rt.marker('ke', centerOf(KE), '荷駄を狙う敵', { red: true, group: KE });
    });
  },

  wave3(rt) {
    const F = rt.flags;
    if (F.wave >= 3 || F.ending || F.won || rt.over) return;
    rt.unmark('post0');
    // 荷駄がまだ着かないまま日が傾いた時は、着いた分で材木の行方を決めて三の手へ移る。
    if (F.K && !F.nidaDone) {
      F.nidaDone = true; rt.unmark('nida'); rt.unmark('gate'); rt.unmark('ke');
      if (F.saved >= 2) { sunoDone(rt, 'nida'); rt.award((t) => { t.side.push('材木を届けた'); t.c.portersSaved = F.saved; }, '材木を届けた'); this.doubleFence(rt); }
      else sunoFail(rt, 'nida');
    }
    F.wave = 3; F.waveT = 0; F.nextWaveAt = 0; sunoRemove(rt, 'nida');
    sunoObj(rt, 'post', '北と西の柵を守れ。舟が出たら東へ', 'order');
    rt.setPhase('w3');
    rt.world.setTime('dusk');
    F.w3T = rt.t;
    F.finishAt = Math.min(480, rt.t + 180);
    F.duskNext = 0;
    // 荷駄を狙う役が終わった林の組も、同じ生き残りで最後の寄せに加わる。敵を足し直さない。
    if (F.supplyEnemy.count && !F.supplyEnemy.routed) {
      F.lastPush = F.supplyEnemy;
      F.lastPush.focus = null; F.lastPush.onArrive = null;
      F.lastPush.order = 'assault'; F.lastPush.noAI = false;
      F.lastPush.assault = assaultFn(rt, 'w'); F.lastPush.speed = 3; F.lastPush.aggro = 8; F.lastPush.seekRange = 45;
      rt.after(14, () => {
        if (rt.over || F.ending || F.won || !F.lastPush.count || F.lastPush.routed) return;
        rt.say('前野長康', '林に残った者も西の柵へ来る。追わずに、ここで受けるぞ', 3.5);
      });
    }
    F.W3a = F.reserveW3a;
    F.B3a = F.reserveB3a; F.B3a.push();
    yoseApproach(rt, F.W3a, YOSE.kita, 'n', 2);
    gateWall(rt, true);
    F.W3b = F.reserveW3b;
    F.B3b = F.reserveB3b; F.B3b.push();
    yoseApproach(rt, F.W3b, YOSE.nishi, 'w', 2);
    // 北西の寄せのあと、三隻が二十六秒ずつ間を空けて出る。各舟の弓と槍が東の柵へ寄せる。
    rt.after(32, () => {
      if (rt.over || F.ending || F.won || F.wave !== 3) return;
      rt.say('足軽', '川に舟が出たぞ！　斎藤の者が川を渡ってくる！', 3.5);
      sunoObj(rt, 'post', '舟が着く前に東の柵へ。川並衆と並んで守れ', 'order');
      rt.marker('boats', () => ({ x: F.boats[1].m.position.x, z: F.boats[1].m.position.z }), '川を渡る舟', { red: true, h: 2.5 });
      this.boats(rt, (g, i) => {
        if (i === 0) { F.W3c = g; F.landT = rt.t; }
        g._sunoLandT = rt.t; g.order = 'assault'; g.noAI = false; g.noRout = false; g.aggro = 8; g.seekRange = 45; g.fire = true; g.speed = 3;
        g.anchor.x = 58; g.assault = assaultFn(rt, 'e');
        if (!g.count) { rt.bark('舟から岸へ寄せる者はいない'); return; }
        rt.army.play('eshout', { x: 54, z: -6 }, 1.4);
        rt.say('足軽', '舟の者が岸に上がった！　東の柵じゃ！', 3);
        sunoObj(rt, 'post', i < 2 ? '東の柵で舟の敵を止めよ。次の舟も来る' : '東の柵で最後の舟の敵を止め、普請を守れ', 'order');
        battleEvent(rt, EVENT_REINFORCEMENT, { x: 54, z: -6 }, g, 1, true, '川から新手。東の柵を守れ');
        rt.marker('w3', centerOf(g), '敵の寄せ（東）', { red: true, group: g });
      });
    });
    F.flagbearer = F.W3a.units[0];
    // 伏兵：西の林から不意に
    rt.after(22, () => {
      if (rt.over || F.ending || F.won || F.wave !== 3) return;
      // 開戦時から林に控えた同じ組が出る。見つけて先に退ければ復活しない。
      F.W3d = F.reserveW3d;
      if (!F.W3d.count || F.W3d.routed) return;
      F.W3d.order = 'assault';
      F.W3d.assault = assaultFn(rt, 'w');

      rt.banner('西の寄せ手', '林から出る');
      rt.say('足軽', '西の林の組が出てきたぞ！', 3);
      rt.marker('w4', centerOf(F.W3d), '西の林の寄せ手', { red: true, group: F.W3d });
    });
    rt.banner('三の手', '夕暮れ、北西より大軍');
    rt.say('木下藤吉郎', '普請はあと一息じゃ！　柵を守り抜け！', 4);
    rt.marker('w', centerOf(F.W3a), '敵の寄せ（北）', { red: true, group: F.W3a });
    rt.marker('w2', centerOf(F.W3b), '敵の寄せ（西）', { red: true, group: F.W3b });
    rt.marker('flag', unitPos(F.flagbearer), '敵の旗', { red: true, group: F.W3a });
    sunoObj(rt, 'defend', '最後の寄せを止め、砦の内を守れ', 'main');
    rt.bark('旗が崩れれば寄せ手も揺れる。柵を離れて追うな');
  },

  // 物見の小勢：柵の一区画に取り付き、破れ目を探る。数は少なく、討つか追えば退く。
  probe(rt, k, g, side) {
    const F = rt.flags;
    if (rt.over || F.ending || F.won || !g || !g.count || g.routed) return;
    F['PR' + k] = g; F['pr' + k + 'T'] = rt.t;
    g.order = 'assault'; g.assault = assaultFn(rt, side); g.speed = 3; g.formation = 'line';
    rt.marker('pr' + k, centerOf(g), '柵を探る物見', { red: true, group: g });
    rt.bark(`${SIDE_WORD[side]}の柵に斎藤の物見が寄る。破れ目を探らせるな`, true);
  },

  // 材木を運んだ人足が、北の柵を一区画ずつ結び直して補強する。
  doubleFence(rt) {
    const F = rt.flags;
    if (F.doubleFence || F.reinforcing || F.reinforceStopped) return;
    if (F.buildBusy) { F.reinforcePending = true; return; }
    F.reinforcePending = false;
    F.reinforcing = true;
    const remaining = F.segs.filter((s) => s.side === 'n' && !s.reinforced);
    const done = () => { F.reinforcing = false; F.doubleFence = F.segs.every((s) => s.side !== 'n' || s.reinforced); };
    if (!remaining.length) done(); else finishBuild(rt, remaining, done, true);
  },
  // 完了時に新しい大型櫓を出さない。既存の足場と小さな物見で守りを固める。
  fortDone(rt) {
    rt.army.play('wood', { x: 13, z: -13 }, 1);
  },
  // 開戦時から同じ舟・兵を置く。船上だけ固定し、舷から歩いて同じ兵が上陸する。
  boats(rt, onLand) {
    const F = rt.flags;
    if (F.boats) { F.onLand = onLand; return; }
    F.boats = [[108, -20], [110, -6], [108, 8]].map(([x, z], i) => {
      const m = kobune(x, -0.65, z, -Math.PI / 2);
      rt.scene.add(m);
      return { m, x, z, x1: 61, delay: i * 26, group: F.boatWaves[i], landed: false, passengers: F.boatWaves[i].units.map((u, j) => {
        const at = { x: x + (Math.floor(j / 2) - 1.5) * 1.1, y: -0.35, z: z + (j % 2 ? .4 : -.4) };
        u.perch = at; u.pinT = Infinity;
        u.pos.set(at.x, -0.35, at.z); u.mesh.position.copy(u.pos);
        return { u, at, dx: at.x - x, dz: at.z - z };
      }) };
    });
    F.boatT = 0;
  },
  moveBoats(rt, dt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.won || !F.boats || F.landed || !F.onLand) return;
    F.boatT += dt;
    for (let i = 0; i < F.boats.length; i++) {
      const b = F.boats[i];
      if (b.landed || F.boatT < b.delay) continue;
      const k = Math.min(1, (F.boatT - b.delay) / 24);
      let landed = true;
      b.m.position.x = b.x + (b.x1 - b.x) * k;
      b.m.rotation.z = Math.sin(F.boatT * 1.7 + b.z) * 0.03;
      for (const q of b.passengers) {
        if (!q.u.alive || !q.u.perch) continue;
        if (q.u.woundOut || q.u.fleeing || q.u.noTarget) { q.u.perch = null; q.u.pinT = 0; continue; }
        if (k >= 1) q.dx -= dt * 1.2;
        q.at.x = b.m.position.x + q.dx; q.at.z = b.z + q.dz;
        q.at.y = q.at.x <= 60 ? rt.world.heightAt(q.at.x, q.at.z) : -0.35;
        q.u.pos.set(q.at.x, q.at.y, q.at.z);
        q.u.mesh.position.copy(q.u.pos);
        if (q.at.x <= 58) { q.u.perch = null; q.u.pinT = 0; }
        else landed = false;
      }
      if (k >= 1 && landed) { b.landed = true; F.onLand(b.group, i); }
    }
    if (F.boats.every((b) => b.landed)) { F.landed = true; rt.unmark('boats'); }
  },

  // 川向こうの押し出し：襲来ごとに二隊が岸まで出て、しばらく睨んでから戻る
  moveFar(rt, dt) {
    const F = rt.flags;
    if (F.wave && F.farWave !== F.wave) {
      F.farWave = F.wave;
      for (const q of F.far.slice((F.wave - 1) * 2, F.wave * 2)) { q.v = 1; q.t = 0; }
    }
    for (const q of F.far) {
      if (!q.v) continue;
      q.t += dt;
      if (q.v === 1 && !q.go) { q.go = true; q.m.advance(33, 8); }
      if (q.v === 1 && q.t > 34) { q.v = -1; q.m.retreat(33, 13); }
      if (q.v === -1 && q.t > 48) { q.v = 0; q.go = false; }
    }
    nagashinojo.kit.backTick(rt);
    // 替えた組だけ一度整える。任務の控え・人足・舟の兵には触れない。
    for (const g of rt.army.groups) if (g.woke && !g.sunomataFormed) {
      g.sunomataFormed = true;
      g.formation = g.woke.kind === 'honjin' ? 'ring' : g.units.some((u) => u.type === 'gun' || u.type === 'bow' || u.mounted) ? 'line' : 'yari';
      g.yariRanks = 3;
      for (const u of g.units) u.mesh.scale.set(1, 1, 1);
      // 寄せの後ろの備は、本物に替えても隊列のまま控える。開いた北門へ一度に雪崩れ込ませず、
      // 柵へ取り付くのは台本の波だけにする（一の手で人足が討ち尽くされて七十秒で終わった）。
      if (g.team === 1) {
        g.order = 'hold'; g.guard = false; g.noAI = true; g.aggro = 3; g.seekRange = 6; g.sunoRear = true;
        const d = Math.hypot(g.anchor.x, g.anchor.z);
        if (d < FORT + 22) { const k = (FORT + 22) / (d || 1); g.anchor.x *= k; g.anchor.z *= k; }
        g.facing = Math.atan2(-g.anchor.x, -g.anchor.z);
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    const gone = (g) => !g || g.routed || !g.units.some((u) => u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
    butaiTick(rt, dt);
    tickTabas(rt, dt);
    this.moveFar(rt, dt);
    this.moveBoats(rt, dt);
    if (!fortSafe(rt)) { F.w3Clear = false; F.safeSince = null; }
    if (F.SZ && !F.ending && !rt.over) F.SZ.tick(dt);
    if (F.won || F.ending || rt.over || !rt.player.u.alive) {
      if (!F.woodClosed) {
        F.woodClosed = true; F.carriedWood.visible = false;
        rt.uninteract('woodPick'); rt.uninteract('woodDrop'); rt.unmark('woodPick'); rt.unmark('woodDrop');
      }
      return;
    }
    if (!F.hut.alive && rt.canFailMission()) { this.onStructDestroyed(rt, F.hut); return; }
    // 寄せが退いても修理や点検が止まれば終わらなかった。期限は接敵の猶予と別に必ず判定する。
    const deadline = F.finishAt ?? 480;
    if (rt.t >= deadline && F.w3Clear && F.safeSince != null && rt.t - F.safeSince >= 20 && F.finalChecked && !F.buildBusy && F.segs.every((s) => s.alive)) {
      this.holdWin(rt);
      if (F.won) return;
    }
    if (rt.t >= deadline || (rt.canFailMission() && (F.wk.count < 2 || F.wk.routed))) {
      F.ending = true; rt.tracker.main = false; sunoFail(rt, 'defend');
      for (const id of ['gate', 'nida', 'porters', 'scout', 'post', 'flag', 'perfect']) {
        const task = F.sunoTasks?.get(id);
        if (task && !task.state) sunoFail(rt, id);
      }
      for (const id of ['post3', 'gate', 'nida', 'heal', 'hut', 'scout', 'ke', 'flagdrop', 'w', 'w2', 'w3', 'w4', 'boats', 'post0', 'flag', 'pr1', 'pr2']) rt.unmark(id);
      rt.uninteract('heal'); rt.uninteract('flag');
      sunoObj(rt, 'retreat', '任務は失敗。南門の外へ退き、組をまとめよ', 'main');
      retreatFort(rt);
      if (rt.t >= deadline) rt.world.setTime('dusk');
      rt.banner(F.wk.count < 2 || F.wk.routed ? '人足が散った。普請を止め、組を下げる' : '日が暮れる。普請を止め、砦から退く');
      rt.say('木下藤吉郎', '砦の内を守り切れぬ。南の門へ退け、組を散らすな！', 4);
      rt.finish({}, 12); return;
    }
    F.waveT = (F.waveT || 0) + dt;
    if (rt.t < (F.noticeT || 0)) return;
    F.noticeT = rt.t + 1;
    if (!F.buildBusy) {
      if (F.buildPending) { const q = F.buildPending; F.buildPending = null; finishBuild(rt, q.order, q.onDone); }
      else if (F.repairPending) repairFort(rt);
      else if (F.reinforcePending) this.doubleFence(rt);
    }
    if (F.gateWallOn && F.segs.gate.every((s) => s.alive)) gateWall(rt, false);
    // 柵の内へ敵が入ったら、藤吉郎の手と川並衆も持ち場から槍を向ける（人足と小屋が見殺しにならない）。
    const inside = !fortSafe(rt);
    // 柵の内の敵の固まりへ、藤吉郎の手と川並衆が持ち場ごと寄って槍を向ける。退けば元の持ち場へ戻る。
    let ix = 0, iz = 0, inN = 0;
    if (inside) for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && !u.noTarget && Math.abs(u.pos.x) < FORT - 1 && Math.abs(u.pos.z) < FORT - 1) { ix += u.pos.x; iz += u.pos.z; inN++; }
    for (const g of [F.tk, F.ally2]) {
      if (!g || !g.count || g.routed || g.order !== 'hold') continue;
      if (inN >= 2) {
        g._sunoHome ||= { x: g.anchor.x, z: g.anchor.z };
        g.anchor = { x: Math.max(-FORT + 3, Math.min(FORT - 3, ix / inN)), z: Math.max(-FORT + 3, Math.min(FORT - 3, iz / inN)) };
        g.aggro = 12;
      } else if (g._sunoHome) { g.anchor = g._sunoHome; g._sunoHome = null; g.aggro = 5; }
    }
    for (const g of rt.squadGroups || []) if (g.count) { const c = g.center(); g.defMult = Math.abs(c.x) < FORT && Math.abs(c.z) < FORT ? 1.3 : 1; }
    // 控えの寄せ手は、自分の番が来るまで共通の頭で打って出ない（三の手の控えが一の手の間に砦へ入っていた）。
    for (const g of [F.W1, F.W1b, F.PR1, F.PR2, F.W2, F.W3a, F.W3b, F.W3c, F.W3d, F.KE, F.scoutOut]) if (g && g.noAI) { g.noAI = false; g.aggro = Math.max(g.aggro, 8); g.seekRange = Math.max(g.seekRange || 0, 45); }
    // 遠さだけで寄せを打ち切らない。最後の舟も同じ兵が柵へ向かい、傷ついた小勢だけ退く。
    for (const g of F.boatWaves) if (g._sunoLandT != null && !gone(g)) {
      g.noAI = false; g.order = 'assault'; g.aggro = 8; g.seekRange = 45;
    }
    for (const [g, t0] of [[F.boatWaves[1], F.boatWaves[1]._sunoLandT], [F.boatWaves[2], F.boatWaves[2]._sunoLandT], [F.W1, F.w1T], [F.W1b, F.w1T], [F.PR1, F.pr1T], [F.PR2, F.pr2T], [F.W2, F.w2Go], [F.W3a, F.w3T], [F.W3b, F.w3T], [F.W3c, F.landT], [F.W3d, F.w3T], [F.lastPush, F.w3T]]) {
      if (gone(g) || t0 == null || rt.t - t0 < 40 || g.count > 3) continue;
      g.noRout = false; g.morale = 0;
    }
    for (const k of [1, 2]) if (F['PR' + k] && gone(F['PR' + k])) rt.unmark('pr' + k);
    // 寄せの見張り：歩いている波が十秒ほとんど進まなければ（後列待ち・到着判定の詰まり）、次の段へ進める。
    for (const g of [F.W1, F.W1b, F.PR1, F.PR2, F.W2, F.W3a, F.W3b]) {
      if (gone(g) || g.order !== 'move') { if (g) g._sunoStall = null; continue; }
      const c = g.center(), st = g._sunoStall || (g._sunoStall = { x: c.x, z: c.z, t: rt.t });
      if (Math.hypot(c.x - st.x, c.z - st.z) > 3) { st.x = c.x; st.z = c.z; st.t = rt.t; continue; }
      if (rt.t - st.t < 10) continue;
      g._sunoStall = null;
      const f = g.onArrive; g.onArrive = null;
      if (f) f(g); else { g.order = 'assault'; g.formation = 'yari'; }
    }
    F.portersUnsafe = false;
    if (F.nidaDone && F.portersLeft > 0) {
      let left = 0;
      for (const u of F.K.units) if (u.type === 'porter' && u.alive && !u.saved) {
        if (Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        else {
          left++;
          if (rt.army.nearestEnemy(u, 12, (e) => !e.fleeing && !e.woundOut && !e.noTarget)) F.portersUnsafe = true;
        }
      }
      F.portersLeft = left;
      if (left) sunoObj(rt, 'porters', `南門の外に人足${left}人。道を守って迎えよ`, 'side');
      else {
        sunoRemove(rt, 'porters');
        const allSaved = F.K.units.every((u) => u.type !== 'porter' || u.saved);
        rt.award((t) => { t.c.portersSaved = F.saved; t.c.portersLeft = 0; if (allSaved) t.side.push('遅れた人足も迎えた'); }, allSaved ? '遅れた人足も迎えた' : '外の人足の行方を確かめた');
      }
    }
    // 波の後ろの旗列も退く。札と後ろの動きの判定は一秒おき。
    for (const [b, g] of [[F.B1, F.W1], [F.B2, F.W2], [F.B3a, F.W3a], [F.B3b, F.W3b]]) {
      if (b && !b._back && gone(g)) { b._back = true; if (b.light) b.light.retreat(40, 14); }
    }
    // 深手のときだけ、手当ての場所を示す
    if (rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.65 && !(F.hurtHintT > rt.t)) {
      F.hurtHintT = rt.t + 12;
      rt.bark(Math.abs(rt.player.u.pos.x) > FORT || Math.abs(rt.player.u.pos.z) > FORT ? '囲まれる前に南の門から柵の内へ戻れ。敵を向いて構えよ' : rt.player.treatmentLeft > 0 && !rt.player.bandaged ? '柵の内で味方の後ろへ下がれ。小屋で手当てを受けよ' : '手当ての布は使い切った。敵を向いて構え、柵の内の味方へ下がれ', true);
    }
    const low = !rt.player.bandaged && rt.player.treatmentLeft > 0 && rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.healCd > rt.t);
    if (low && !F.healMarked) { F.healMarked = true; rt.marker('heal', { x: -6, z: 5 }, '手当て', { h: 2.5 }); }
    if (!low && F.healMarked) { F.healMarked = false; rt.unmark('heal'); }
    // 小屋の見える傷みと、物見の知らせ。正確な耐久や敵の到着秒は出さない。
    const hutPct = Math.round(F.hut.hp / F.hut.maxHp * 100);
    const wait = F.nextWaveAt ? Math.ceil(F.nextWaveAt - rt.t) : 0;
    sunoProgress(rt, 'defend', F.carryingWood ? '北の柵の内へ材木を届けよ' : wait > 0 ? F.wave ? '寄せ手が引いた。材木の印へ行き、北の柵へ運べ' : '人足の普請を守り、最初の寄せに備えよ' : hutPct > 50 ? '柵の内から寄せ手を止め、人足を守れ' : '小屋が傷んでいる。組を小屋へ戻し、取り付いた敵を止めよ');
    // 襲来の十秒前：物見が敵の旗の動きを知らせる。
    if (wait > 0 && wait <= 10 && F.warnFor !== F.nextWaveAt) { F.warnFor = F.nextWaveAt; rt.bark('物見「北と西で旗が動いた。持ち場に付け！」', true); }
    // 小屋が打たれ始めたら早めに知らせ、印を立てる（気づいた時には手遅れ、にならないように）
    const hw = hutPct <= 25 ? 25 : hutPct <= 50 ? 50 : hutPct <= 85 ? 85 : 0;
    if (hw && hw < (F.hutWarnLevel || 100) && rt.t >= (F.hutWarnAt || 0)) {
      if (!F.hutWarnLevel) { rt.marker('hut', { x: 0, z: -4 }, '普請小屋', { h: 5 }); rt.after(30, () => rt.unmark('hut')); }
      F.hutWarnLevel = hw; F.hutWarnAt = rt.t + 8;
      if (hw === 85) rt.say('木下藤吉郎', '小屋に敵が取り付いた！　組を連れて戻れ、小屋を守れ！', 3.5);
      else rt.bark('普請小屋が危ない！　中に入った敵を押し返せ', true);
    }
    if (F.wave === 1 && gone(F.W1) && (!F.W1b || gone(F.W1b)) && rt.t - F.w1T > 18 && fortSafe(rt) && !F.next2) {
      F.next2 = true; F.next2T = rt.t;
      rt.unmark('w');
      rt.say('木下藤吉郎', 'ようやった！　じゃが、まだ来るぞ。今のうちに備えを直せ', 4);
      sunoObj(rt, 'defend', '破れた柵を直し、次の寄せに備えよ', 'main');
      rt.after(12, () => rt.say('木下藤吉郎', '北と西の柵を直せ。次は材木を砦へ運び込む', 3.5));
      rt.after(8, () => repairFort(rt));
      // 崩れた一の手の陰から、物見の小勢が柵の破れを探りに来る（波の合間も柵ぎわは気が抜けない）。
      rt.after(1, () => this.probe(rt, 1, F.probe1, F.r1.side));
      // 二の手は一の手が崩れるのを見て、間を置かずに寄せ始める（判断の間も旗が動く。林へ出た組は急いで戻る）。
      rt.after(7, () => { if (!F.scoutOut) { F.nextWaveAt = rt.t; this.wave2(rt); } });
      // 判断：柵を直して待つか、打って出て西の林の物見を追い払うか（荷駄の道が安くなる）
      rt.after(1.5, () => rt.choose('足軽大将「次の寄せまで組の持ち場を選べ。南門から林へ出る許しは出た」', [
        { label: '砦に残り、柵を直して待つ', note: '破れた柵を多めに直す。西の林の斎藤の者はそのまま' },
        { label: '打って出て、西の林の物見を追い払う', note: '林に出た敵を退け、荷駄の通る道を守る。遅れたら砦へ戻る' },
      ], (i) => {
        if (i === 0) { rt.after(4, () => repairFort(rt)); rt.say('木下藤吉郎', 'よし、人足を総出で柵に回す', 3); rt.after(3, () => this.wave2(rt)); F.nextWaveAt = rt.t + 3; }
        else {
          F.scoutOut = F.supplyEnemy;

          sunoObj(rt, 'scout', '西の林の物見を追い払え', 'side');
          rt.marker('scout', centerOf(F.scoutOut), '西の林の物見', { red: true, group: F.scoutOut });
          rt.say('木下藤吉郎', '南の門から出よ。林に潜む者を追い散らせ。遅れるなよ、二の手が来るまでに戻れ', 4);
          F.scoutT = rt.t;
        }
      }, 7));
    }
    // 保険：判断の段で二の手が始まらないまま長引いたら、二の手を始める
    if (F.next2T && !F.W2 && !F.wave2Q && rt.t - F.next2T > 110) { F.wave2Q = true; this.wave2(rt); }
    if (F.scoutOut && !F.scoutDone) {
      const q = F.scoutOut;
      if (gone(q) || rt.t - F.scoutT > 50) {
        F.scoutDone = true; rt.unmark('scout');
        if (gone(q)) { F.woodsClear = true; sunoDone(rt, 'scout'); rt.award((t) => t.side.push('西の林の物見を追い払った'), '西の林の物見を追い払った'); rt.say('木下藤吉郎', 'でかした！　これで荷駄の道は安い。戻れ、二の手じゃ', 3.5); }
        else { sunoFail(rt, 'scout'); rt.say('木下藤吉郎', 'もうよい、戻れ！　二の手が来るぞ', 3); }
        rt.after(10, () => this.wave2(rt)); F.nextWaveAt = rt.t + 10;
      }
    }
    if (F.wave === 2) {
      // 荷駄
      if (F.K && !F.nidaDone) {
        for (const u of F.K.units) {
          if (u.alive && u.type === 'porter' && !u.saved && Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        }
        let alivePorters = 0;
        for (const u of F.K.units) if (u.alive && u.type === 'porter' && !u.saved) alivePorters++;
        sunoProgress(rt, 'nida', F.saved >= 2 ? '材木が届いた。残る人足を迎えよ' : `砦へ着いた人足 ${F.saved}人・南門から迎えよ`);
        if (F.saved >= 2 && (alivePorters === 0 || F.waveT > 150)) {
          F.nidaDone = true; sunoDone(rt, 'nida'); rt.unmark('nida');
          F.portersLeft = alivePorters;
          const allSaved = F.K.units.every((u) => u.type !== 'porter' || u.saved);
          const deed = allSaved ? '荷駄と人足を守った' : alivePorters ? '材木を届けた。門外の人足が残る' : '材木を届けた。人足を失った';
          rt.award((t) => { t.side.push(deed); t.c.portersSaved = F.saved; t.c.portersLeft = alivePorters; }, deed);
          if (alivePorters) rt.say('人足', `まだ外に${alivePorters}人おる。南門の道を守ってくれ`, 3.5);
          rt.say('木下藤吉郎', '材木が届いた！　人足を北の柵に回せ', 3.5);
          this.doubleFence(rt);
          battleEvent(rt, EVENT_MESSENGER, { x: 0, z: 8 }, F.K, 0, true, '材木が砦に届いた。北の柵を固める');
        } else if (F.saved + alivePorters < 2 || F.waveT > 150) {
          F.nidaDone = true; sunoFail(rt, 'nida'); rt.unmark('nida');
          rt.say('木下藤吉郎', '材木が足りぬ。今ある柵で受ける。砦へ戻れ', 3);
        }
      }
      // 荷駄を狙う組：狙った人足が倒れたか砦へ入ったら次の人足へ。狙う荷駄がもう無ければ西の林へ退く（林の口で立ち尽くさない）
      if (F.KE && !gone(F.KE) && !F.KEwithdraw) {
        const fo = F.KE.focus;
        if (!fo || !fo.alive || fo.saved) {
          const next = F.nidaDone ? null : F.K && F.K.units.find((u) => u.alive && u.type === 'porter' && !u.saved);
          if (next) F.KE.focus = next;
          else {
            F.KE.focus = null; F.KE.order = 'move'; F.KE.dest = { x: -150, z: 48 }; F.KEwithdraw = true;
            F.KE.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
          }
        }
      }
      if (F.nidaDone) rt.unmark('gate');
      if (F.KE && (gone(F.KE) || F.KEwithdraw)) rt.unmark('ke');
      if (F.W2) volleyAt(rt, 'sunoW2', F.gunW, [F.W2], { r: 34, until: rt.t + 1e9, hit: 26, who: '蜂須賀正勝', then: ['木下藤吉郎', '二の手が揺れた！　門から出て横を突け！'] });
      // 荷駄の結果が出たら、柵を直し最後の持ち場を選ぶ。
      // 二の手が崩れたら、荷駄の行方を長く待たずに三の手へ（荷駄を待つ間、六十秒以上だれも来なかった）。
      if (gone(F.W2) && F.w2ClearT == null) F.w2ClearT = rt.t;
      const nidaSettled = F.nidaDone && !F.portersUnsafe && (gone(F.KE) || (F.KEwithdraw && Math.hypot(F.KE.center().x, F.KE.center().z) > FORT + 12)) && !F.KEwait;
      if (fortSafe(rt) && gone(F.W2) && (nidaSettled || rt.t - F.w2ClearT > 6) && !F.next3) {
        F.next3 = true;
        rt.unmark('w');
        rt.say('木下藤吉郎', '日が傾いてきた。次が正念場じゃ', 3.5);
        rt.after(8, () => repairFort(rt));
        rt.after(1, () => this.probe(rt, 2, F.probe2, 'n'));
        // 判断：夕暮れの三の手に、組をどこに置くか
        rt.after(2, () => rt.choose('藤吉郎「物見が北西の旗と川の舟を見た。お主の組はどちらを守る？」', [
          { label: '北の柵に組を集める', note: '北の寄せ（旗持ちの隊）を柵で強く受ける。東の川の側は川並衆だけ' },
          { label: '東の川の側に組を置く', note: '川からの寄せを東の柵で受ける。北の柵は別組だけで受ける' },
        ], (i) => {
          F.post3 = i === 0 ? 'n' : 'e';
          const groups = rt.squadGroups || [];
          const pt = i === 0 ? { x: 0, z: -FORT + 3 } : { x: FORT - 3, z: 0 };
          for (let k = 0; k < groups.length; k++) {
            const sg = groups[k]; if (!sg.count || sg.routed) continue;
            const post = i === 0 ? { x: k * 5 - 3, z: -FORT + 6 + k * 2 } : { x: FORT - 6 - k * 5, z: k * 5 + 2 };
            sg.order = 'move'; sg.dest = post; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = post; g.facing = i === 0 ? Math.PI : Math.PI / 2; };
          }
          rt.marker('post3', pt, i === 0 ? '北の柵' : '東の川の側', { h: 2.5 });
          // 持ち場の印は最後の寄せを受け終わるまで残す。
          rt.say('木下藤吉郎', i === 0 ? 'よし、北を固めよ。東は小六に任せる' : 'よし、川の側じゃ。北は別組に踏ん張らせる', 3);
        }, 9));
        sunoObj(rt, 'defend', '柵を直し、最後の持ち場を選べ', 'main');
        // 四秒後の判断（十三秒）は読み切れる。下知のあとに空の待ちを重ねない。
        rt.after(10, () => this.wave3(rt));
        F.nextWaveAt = rt.t + 10;
      }
    }
    // 三の手と最後の押しを退け、普請の点検が済めば味方の合図で終える。
    if (F.wave === 3) {
      if (F.saved >= 2 && F.waveT >= 55 && !F.reinforced) { F.reinforced = true; this.callReinforce(rt); }
      const left = Math.max(0, Math.ceil(F.finishAt - rt.t));
      const countdown = `普請の仕上げまで、あと${left}秒。柵と人足を守れ`;
      // 三十秒おきの後続。遅く三の手へ入った時も、期限までに三組を送り出す。
      const q = F.duskWaves[F.duskNext];
      if (q && rt.t >= F.w3T + (65 + F.duskNext * 30) * (F.finishAt - F.w3T) / 180) {
        F.duskNext++;
        q.startedAt = rt.t;
        const g = q.group;
        if (!gone(g)) {
          g.noAI = false; g.order = 'assault'; g.onArrive = null;
          g.assault = assaultFn(rt, q.side); g.speed = 3; g.aggro = 8; g.seekRange = 45;
          sunoObj(rt, 'post', `${SIDE_WORD[q.side]}の柵で日暮れの寄せ手を止めよ`, 'order');
          rt.marker('w4', centerOf(g), `日暮れの寄せ手（${SIDE_WORD[q.side]}）`, { red: true, group: g });
          rt.bark(`${SIDE_WORD[q.side]}から次の寄せ手。柵の内で受けよ`, true);
        }
      }
      for (const wave of F.duskWaves) {
        if (wave.startedAt != null && rt.t - wave.startedAt >= 40 && wave.group.count <= 3 && !gone(wave.group)) {
          wave.group.noRout = false; wave.group.morale = 0;
        }
      }
      sunoProgress(rt, 'post', countdown);
      sunoProgress(rt, 'defend', countdown);
      if (F.duskNext === F.duskWaves.length && F.duskWaves.every((q) => gone(q.group)) && F.landed && F.W3d && gone(F.W3a) && gone(F.W3b) && F.boatWaves.every(gone) && gone(F.W3d) && gone(F.lastPush) && fortSafe(rt)) {
        if (!F.w3Clear) {
          sunoRemove(rt, 'post');
          sunoObj(rt, 'defend', '砦の内で普請の仕上げを守れ', 'main');
          rt.say('木下藤吉郎', '寄せ手は退いた。追うな。砦の内で柵を仕上げるぞ', 3.5);
        }
        F.w3Clear = true;
        if (rt.phase !== 'end') rt.setPhase('end');
        if (F.safeSince == null) F.safeSince = rt.t;
        if (!F.buildBusy && F.segs.some((s) => !s.alive)) repairFort(rt);
        if (!F.buildBusy && F.segs.every((s) => s.alive) && !F.finalCheckSent) {
          F.finalCheckSent = true;
          // 柵沿いは兵舎と物見でふさがる。中央の小道から結び目を見渡して仕上げる。
          F.wk.order = 'path'; F.wk.formation = 'column'; F.wk.colW = 2; F.wk.speed = 1.8;
          const c = F.wk.center(), lane = c.x < 0 ? -6 : 6;
          F.wk.path = [[lane, c.z], [lane, -10], [0, -10], [6, -10], [6, 5], [0, 10], [-6, 5], [-6, -10]]; F.wk.pathIdx = 0;
          F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -4, z: 9 }; F.finalChecked = true; };
          // 縦隊の道は後列待ちで止まる事がある。見回りは十八秒で済んだものとし、勝ちの判定を止めない。
          rt.after(18, () => { if (!F.finalCheckSent || F.finalChecked) return; F.finalChecked = true; F.wk.order = 'move'; F.wk.dest = { x: -4, z: 9 }; F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -4, z: 9 }; }; });
        }
        if (F.finalChecked && !F.buildBusy && F.segs.every((s) => s.alive) && rt.t - F.safeSince >= 20) { this.holdWin(rt); return; }
        sunoProgress(rt, 'defend', `仕上げの期限まで、あと${left}秒。${F.buildBusy ? '柵を直す人足を守れ' : F.segs.some((s) => !s.alive) ? '人足の道を空けよ' : '砦の内で点検を守れ'}`);
      } else {
        F.w3Clear = false; F.safeSince = null;
        if (rt.phase === 'end') rt.setPhase('w3');
      }
    }
  },

  // 守りきった（三の手を退け、砦の内の安全と普請の仕上げを確かめた）。
  holdWin(rt) {
    const F = rt.flags;
    if (F.won || F.ending || rt.over || !F.hut.alive || !fortSafe(rt) || F.wk.count < 2) return;
    {
      rt.unmark('w4');
      F.won = true;
      rt.unmark('w'); rt.unmark('w2'); rt.unmark('w3'); rt.unmark('flag');
      for (const id of ['post3', 'gate', 'nida', 'heal', 'hut', 'scout', 'ke', 'pr1', 'pr2']) rt.unmark(id);
      rt.uninteract('heal'); sunoRemove(rt, 'gate'); sunoRemove(rt, 'porters');
      sunoDone(rt, 'defend');
      const deed = F.perfect ? '墨俣の人足と小屋を守り、柵を破らせず普請を仕上げた'
        : '墨俣の柵は破られたが、人足と小屋を守り、普請を仕上げた';
      rt.award((t) => {
        t.main = true; t.side.push(deed);
        if (F.perfect) t.special = { label: '砦の完全防衛', pts: 30 };
      }, F.perfect ? '主任務達成・砦の完全防衛' : '辛うじて普請を仕上げた・柵の完全防衛は失敗');
      if (F.perfect) { sunoDone(rt, 'perfect'); rt.grantTitle('perfect'); }
      if (F.flagOffered && !F.flagTaken) sunoFail(rt, 'flag');
      rt.banner(F.perfect ? '守りきった' : '辛うじて砦を残した', F.perfect ? '墨俣に砦が建つ' : '柵は破られたが、人足と小屋を守り、普請を仕上げた');
      rt.say('木下藤吉郎', F.perfect ? `守りきったぞ！　${nm(rt)}、お主のおかげじゃ！`
        : '柵は破られた。じゃが、人足と小屋は残った。辛うじて普請を仕上げたな', 4);
      this.fortDone(rt);
      sfx('horagai', 0.8);
      sunoRemove(rt, 'post');
      rt.unmark('flagdrop'); rt.uninteract('flag');
      battleEvent(rt, EVENT_RETREAT, { x: 0, z: -FORT }, F.W3a, 1, true, F.perfect
        ? '寄せ手が退く。墨俣の普請を守りきった' : '寄せ手が退く。破れた柵を直し、辛うじて砦を残した');
      for (const id of TASK_ORDER) sunoRemove(rt, id);
      sunoObj(rt, 'complete', '人足と小屋を守り、普請を仕上げた', 'main');
      rt.uninteract('woodPick'); rt.uninteract('woodDrop'); rt.unmark('woodPick'); rt.unmark('woodDrop');
      F.carriedWood.visible = false;
      rt.finish({}, 12);
      // 余韻は終わりの段に入ってから積む（finish の退き口の支度が、それより前の時計を消す）。
      // 勝鬨が上がり、川向こうの旗が退き、次の戦（稲葉山）へ思いを向けて閉じる。
      rt.after(1.5, () => rt.army.play('eiei', { x: 0, z: 0 }, 1.1));
      rt.after(4, () => rt.say('木下藤吉郎', '墨俣を足場に、美濃攻めを続ける。次は稲葉山じゃ', 3.5));
      rt.after(8, () => rt.say('蜂須賀正勝', '川向こうの斎藤の旗が下がってゆく。稲葉山の城も、もう枕を高くしては眠れまい', 3.5));
    }
  },

  // 守る砦の援軍（fort-spec 18）：南から後詰の一隊が駆けつけ、砦の内へ入って加勢する
  callReinforce(rt) {
    const F = rt.flags;
    if (F.reinforceCalled || F.won || F.ending || rt.over) return;
    F.reinforceCalled = true;
    const r = F.reinforceReserve;
    if (!r.count || r.routed) return;
    r.order = 'path'; r.pathIdx = 0; r.path = [[-64, 112], [-36, 44], [0, 26], [0, FORT - 4]]; r.speed = 2.6;
    r.onArrive = (g) => {
      g.order = 'hold'; g.anchor = { x: 0, z: FORT - 4 }; g.aggro = 12;
      if (rt.over || F.won || F.ending) return;
      rt.bark('南門へ後詰が着いた。砦を固める');
      battleEvent(rt, EVENT_REINFORCEMENT, { x: 0, z: FORT + 10 }, r, 0, true, '南の門へ後詰が着いた');
    };
    rt.bark('南の後詰が砦へ向かい始めた');
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (!F.ending && !F.won && !rt.over && v === F.flagbearer && k && (k.isPlayer || k.isSub)) {
      rt.unmark('flag');
      const pos = { x: v.pos.x, z: v.pos.z };
      rt.marker('flagdrop', pos, '敵の旗', { red: true });
      F.flagOffered = true; sunoObj(rt, 'flag', '落ちた敵の旗を拾え', 'side');
      rt.addInteract('flag', pos, '敵の旗を奪う', () => {
        rt.uninteract('flag'); rt.unmark('flagdrop');
        F.flagTaken = true;
        // 士気の共通処理へ渡す。近い寄せだけがひるみ、旗一本で全軍は消えない。
        for (const g of [F.W3a, F.W3b, F.W3c, F.W3d]) {
          if (!g || !g.count || g.routed) continue;
          const c = g.center();
          if (Math.hypot(c.x - pos.x, c.z - pos.z) < 55) g.morale = Math.max(0, g.morale - 18);
        }
        rt.bark('敵の旗が失われ、近くの寄せ手がひるんだ');
        sunoDone(rt, 'flag');
        rt.award((t) => t.c.flag++, '斎藤の旗を奪った');
        rt.say('木下藤吉郎', '斎藤の旗を奪ったか！　あっぱれじゃ！', 3);
      }, { r: 3, ttl: 30, hold: 1.0 });
      rt.after(30, () => {
        if (F.flagTaken || F.won || F.ending || rt.over) return;
        sunoFail(rt, 'flag'); rt.unmark('flagdrop'); rt.uninteract('flag');
      });
    } else if (v === F.flagbearer) {
      rt.unmark('flag');
      if (F.flagOffered) sunoFail(rt, 'flag');
    }
  },

  onStructHit(rt, s) {
    if (!SIDE_WORD[s.side]) return;
    const F = rt.flags;
    F.sideWarn = F.sideWarn || {};
    if ((F.sideWarn[s.side] ?? -99) + 12 > rt.t) return;
    F.sideWarn[s.side] = rt.t;
    rt.bark(`${{ n: '北', w: '西', e: '東', s: '南' }[s.side]}の柵が攻められている！`, true);
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (F.ending || F.won || rt.over) return;
    if (s === F.hut) {
      const I = s.naka, f = s.floors;
      if (I && !I.disabled) {
        I.disabled = true;
        if (I.mesh) I.mesh.visible = false;
        for (const list of [SOLIDS, INTERIOR_WALLS]) for (let k = list.length - 1; k >= 0; k--) if (list[k].naka === I.id) list.splice(k, 1);
        for (let k = f.deckStart; k < f.deckEnd; k++) FL.decks[k].y = -10000;
        for (let k = f.rampStart; k < f.rampEnd; k++) FL.ramps[k].ya = FL.ramps[k].yb = -10000;
      }
      if (!rt.canFailMission()) return;
      F.ending = true;
      for (const id of ['gate', 'nida', 'porters', 'scout', 'post', 'flag', 'perfect']) sunoFail(rt, id);
      for (const id of ['post0', 'post3', 'gate', 'nida', 'heal', 'hut', 'scout', 'ke', 'flagdrop', 'w', 'w2', 'w3', 'w4', 'boats', 'flag', 'buildGate', 'buildSide']) rt.unmark(id);
      rt.uninteract('heal'); rt.uninteract('flag');
      sunoObj(rt, 'retreat', '小屋を失い、任務は失敗。南門の外へ退け', 'main');
      retreatFort(rt);
      rt.banner('普請小屋が破られた');
      rt.say('木下藤吉郎', '小屋を失った。普請を止める。南門へ退け！', 4);
      rt.tracker.main = false;
      sunoFail(rt, 'defend');
      rt.finish({}, 12);
      return;
    }
    F.finalChecked = false; F.finalCheckSent = false;
    if (F.perfect) {
      F.perfect = false; sunoFail(rt, 'perfect');
      rt.bark('柵の完全防衛は失敗。主任務は続く。人足と小屋を守り、破れ目を塞げ', true);
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    if (rt.t >= (F.breachSayT || 0)) { F.breachSayT = rt.t + 8; rt.say('木下藤吉郎', '柵が破られたぞ！　破れ目を塞げ！', 3); }
    sfx('wood', 1);
  },

  onFinish(rt) {
    const R = rt.G.rel.tokichiro;
    if (rt.tracker.main) { R.trust += 10; R.like += 10; }
    if (rt.flags.perfect && rt.tracker.main) R.like += 5;
  },
};

// 使番は閉じた柵を横切らず南門へ回る。遠方の点と本物の騎馬で同じ道を使う。
function sunomataRunnerWay(army, u, want) {
  if (!u.group?.isRunner) return want;
  const pos = u.pos, me = Math.abs(pos.x) < FORT - 0.3 && Math.abs(pos.z) < FORT - 0.3;
  const to = Math.abs(want.x) < FORT - 0.3 && Math.abs(want.z) < FORT - 0.3;
  let x = want.x, z = want.z;
  // 門を抜けた直後も柵から離れきるまで南へ進む。外の行き先へ斜めに折れない。
  if (!me && !to && Math.abs(pos.x) < FORT + 4 && pos.z > FORT - 1 && want.z < FORT + 2) {
    x = pos.z < FORT + 4 ? 0 : (want.x < 0 ? -1 : 1) * (FORT + 4);
    z = FORT + 4;
  }
  if (me !== to) {
    if (!me && pos.z < FORT + 2 && (Math.abs(pos.x) > 1.4 || pos.z < FORT - 1)) {
      const sx = pos.x < 0 ? -1 : 1;
      x = sx * (FORT + 4);
      z = Math.abs(pos.x) < FORT + 2.5 ? pos.z : FORT + 4;
    } else {
      const az = me ? FORT - 3 : FORT + 3;
      x = 0;
      z = Math.abs(pos.x) > 1.4 || (me ? pos.z < FORT - 5 : pos.z > FORT + 5) ? az : me ? FORT + 3 : FORT - 3;
    }
  }
  const hut = army.world?.sunoHut;
  if (me && hut?.alive) {
    const dx = x - pos.x, dz = z - pos.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((hut.x - pos.x) * dx + (hut.z - pos.z) * dz) / l2));
    if (Math.hypot(pos.x + dx * t - hut.x, pos.z + dz * t - hut.z) < 5.4 && Math.hypot(x - hut.x, z - hut.z) > 5.2) {
      const a0 = Math.atan2(pos.x - hut.x, pos.z - hut.z), a1 = Math.atan2(x - hut.x, z - hut.z);
      let da = a1 - a0; da -= Math.PI * 2 * Math.round(da / (Math.PI * 2));
      const a = a0 + Math.sign(da || 1) * Math.min(Math.abs(da), 0.7);
      x = hut.x + Math.sin(a) * 6.2; z = hut.z + Math.cos(a) * 6.2;
    }
  }
  if (x === want.x && z === want.z) return want;
  const point = u._sunoRunnerWay || (u._sunoRunnerWay = { x: 0, z: 0 });
  point.x = x; point.z = z;
  return point;
}

// 墨俣の bot：砦の内に留まり、柵の内から槍で突く。柵を越えた敵を先に討つ。荷駄を狙う敵だけは南の門から打って出て討つ
// （柵の外の敵へまっすぐ歩くと柵に当たって動けなくなるので、柵の手前で止まって待つ）
// 守りと退却で同じ道を使う。柵を横切らず、南門と普請小屋の脇を歩く。
const SHED_DOORS = [...SHEDS, MAIN_SHED];
// 砦の内の角材の山・資材・兵舎（壁の当たりではなく箱の当たり）。bot が壁へ押し続けないための避け先。
let rectCache = null;
function obstacleRects() {
  if (rectCache && rectCache.n === SOLIDS.length) return rectCache.list;
  const list = SHED_DOORS.map((s) => ({ x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2, c: Math.cos(s.rot), s: Math.sin(s.rot) }));
  for (const o of SOLIDS) if (o.k === 'r' && o.yTop == null && Math.abs(o.x) < FORT && Math.abs(o.z) < FORT && o.hw * o.hd > 0.15 && o.hw < 6 && o.hd < 6) list.push(o);
  rectCache = { n: SOLIDS.length, list };
  return list;
}
function sunomataWalk(b, inp, goTo, x, z, r) {
  const p = b.player, u = p.u, F = b.flags;
  // 押しても進まない（兵や角材の間に挟まった）時は、一秒ほど真横へ回って抜ける。
  const wd = u._sunoWedge || (u._sunoWedge = { x: u.pos.x, z: u.pos.z, t: b.t, until: 0, dir: 1 });
  if (b.t < wd.until) {
    const lx = x - u.pos.x, lz = z - u.pos.z, ll = Math.hypot(lx, lz) || 1;
    return goTo(p, inp, u.pos.x + (-lz / ll) * wd.dir * 4, u.pos.z + (lx / ll) * wd.dir * 4, 0.5);
  }
  if (b.t - wd.t >= 0.5) {
    if (Math.hypot(u.pos.x - wd.x, u.pos.z - wd.z) < 0.12 && Math.hypot(x - u.pos.x, z - u.pos.z) > r + 1.2) { wd.until = b.t + 0.9; wd.dir = -wd.dir; }
    wd.x = u.pos.x; wd.z = u.pos.z; wd.t = b.t;
  }
  const me = Math.abs(u.pos.x) < FORT - 0.3 && Math.abs(u.pos.z) < FORT - 0.3;
  const to = Math.abs(x) < FORT - 0.3 && Math.abs(z) < FORT - 0.3;
  if (!me && !to && Math.abs(u.pos.x) < FORT + 3.5 && u.pos.z > FORT - 1 && z < FORT + 2) {
    const sx = x < 0 ? -1 : 1;
    return goTo(p, inp, u.pos.z < FORT + 3.5 ? 0 : sx * (FORT + 4), FORT + 4, 0.5);
  }
  // 兵舎や小屋の中にいる時は、まず戸口（各小屋の +z の面）から外へ出る。壁越しに行き先へ押し続けない。
  for (const s of SHED_DOORS) {
    const dx = u.pos.x - s.x, dz = u.pos.z - s.z, c = Math.cos(s.rot), n = Math.sin(s.rot);
    const lx = dx * c - dz * n, lz = dx * n + dz * c;
    if (Math.abs(lx) > s.w / 2 || Math.abs(lz) > s.d / 2) continue;
    const tx = x - s.x, tz = z - s.z;
    if (Math.abs(tx * c - tz * n) < s.w / 2 && Math.abs(tx * n + tz * c) < s.d / 2) break;
    const out = lz > s.d / 2 - 0.9 ? s.d / 2 + 1.4 : s.d / 2 - 0.6;
    return goTo(p, inp, s.x + out * n, s.z + out * c, 0.4);
  }
  if (!me && to) {
    // 柵の破れ目（普請途中の北の口も）のすぐ外にいれば、砦を外から回らずにそこから入る。
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const out = (u.pos.x - mx) * s.nx + (u.pos.z - mz) * s.nz, lat = Math.abs((u.pos.x - mx) * s.nz - (u.pos.z - mz) * s.nx);
      if (out > -0.5 && out < 9 && lat < 6) return lat > 1.4 && out > 1 ? goTo(p, inp, mx + s.nx * 2.5, mz + s.nz * 2.5, 0.6) : goTo(p, inp, mx - s.nx * 4, mz - s.nz * 4, 0.8);
    }
  }
  if (me !== to) {
    // 南門へ正面から入り始めたら、そのまま通る。門の手前で外周へ戻さない。
    if (!me && u.pos.z < FORT + 2 && (Math.abs(u.pos.x) > 1.4 || u.pos.z < FORT - 1)) {
      const sx = u.pos.x < 0 ? -1 : 1;
      if (Math.abs(u.pos.x) < FORT + 2.5) return goTo(p, inp, sx * (FORT + 4), u.pos.z, 1);
      return goTo(p, inp, sx * (FORT + 4), FORT + 4, 1.5);
    }
    const az = me ? FORT - 3 : FORT + 3;
    if (Math.abs(u.pos.x) > 1.4 || (me ? u.pos.z < FORT - 5 : u.pos.z > FORT + 5)) { x = 0; z = az; r = 0.8; }
    else return goTo(p, inp, 0, me ? FORT + 3 : FORT - 3, 0.5);
  }
  // 小屋の中が行き先なら、戸口（+z の面の中ほど）の前を通ってから入る。壁の外から中へ押し続けない。
  for (const s of SHED_DOORS) {
    const c = Math.cos(s.rot), n = Math.sin(s.rot);
    const inBox = (px, pz, m) => { const dx = px - s.x, dz = pz - s.z; return Math.abs(dx * c - dz * n) < s.w / 2 + m && Math.abs(dx * n + dz * c) < s.d / 2 + m; };
    if (!inBox(x, z, -0.3) || inBox(u.pos.x, u.pos.z, 0.2)) continue;
    const lx = (u.pos.x - s.x) * c - (u.pos.z - s.z) * n, lz = (u.pos.x - s.x) * n + (u.pos.z - s.z) * c;
    if (lz > s.d / 2 + 0.5 && Math.abs(lx) < 1.2) continue;
    const fz = s.d / 2 + 1.0;
    return goTo(p, inp, s.x + fz * n, s.z + fz * c, 0.5);
  }
  // 兵舎・小屋の壁へまっすぐ押し続けない。行き先が小屋の際なら外へずらし、道が小屋を横切るなら角を回る。
  if (me && to) for (const s of obstacleRects()) {
    const c = s.c, n = s.s, hw = s.hw + 0.6, hd = s.hd + 0.6;
    const loc = (px, pz) => [(px - s.x) * c - (pz - s.z) * n, (px - s.x) * n + (pz - s.z) * c];
    const [ux, uz] = loc(u.pos.x, u.pos.z);
    if (Math.abs(ux) < hw - 0.5 && Math.abs(uz) < hd - 0.5) continue;
    let [tx, tz] = loc(x, z);
    const world = (lx, lz) => [s.x + lx * c + lz * n, s.z - lx * n + lz * c];
    if (Math.abs(tx) < hw && Math.abs(tz) < hd) {
      if (hw - Math.abs(tx) < hd - Math.abs(tz)) tx = Math.sign(tx || 1) * (hw + 0.2); else tz = Math.sign(tz || 1) * (hd + 0.2);
      [x, z] = world(tx, tz); continue;
    }
    // 線分と広げた矩形の交差（局所座標）
    let t0 = 0, t1 = 1; const dx = tx - ux, dz = tz - uz;
    for (const [d0, o, h] of [[dx, ux, hw], [dz, uz, hd]]) {
      if (Math.abs(d0) < 1e-6) { if (Math.abs(o) >= h) { t1 = -1; break; } continue; }
      let a0 = (-h - o) / d0, a1 = (h - o) / d0; if (a0 > a1) [a0, a1] = [a1, a0];
      t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
    }
    if (t0 < t1 && !(Math.abs(ux) < hw && Math.abs(uz) < hd && Math.hypot(dx, dz) < 3)) {
      const cx = (ux < 0 ? -1 : 1) * (hw + 0.5), cz = (uz < 0 ? -1 : 1) * (hd + 0.5);
      const via = Math.abs(ux) / hw > Math.abs(uz) / hd ? [cx, Math.sign(tz || 1) * (hd + 0.5)] : [Math.sign(tx || 1) * (hw + 0.5), cz];
      const w = world(via[0], via[1]); return goTo(p, inp, w[0], w[1], 0.6);
    }
  }
  const hx = F.hut.x, hz = F.hut.z;
  if (F.hut.alive && me) {
    const dx = x - u.pos.x, dz = z - u.pos.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((hx - u.pos.x) * dx + (hz - u.pos.z) * dz) / l2));
    if (Math.hypot(u.pos.x + dx * t - hx, u.pos.z + dz * t - hz) < 5.4 && Math.hypot(x - hx, z - hz) > 5.2) {
      const a0 = Math.atan2(u.pos.x - hx, u.pos.z - hz), a1 = Math.atan2(x - hx, z - hz);
      let da = a1 - a0; da -= Math.PI * 2 * Math.round(da / (Math.PI * 2));
      const a = a0 + Math.sign(da || 1) * Math.min(Math.abs(da), 0.7);
      return goTo(p, inp, hx + Math.sin(a) * 6.2, hz + Math.cos(a) * 6.2, 0.6);
    }
  }
  return goTo(p, inp, x, z, r);
}

// 殿を狙う別働隊も、閉じた柵へ直進せず南門へ回る。出撃時だけ道を作る。
sunomata.taishoRaidPath = (g, lord) => {
  if (Math.abs(lord.pos.x) >= FORT || Math.abs(lord.pos.z) >= FORT) return null;
  const c = g.center(), x = c.x < 0 ? -FORT - 6 : FORT + 6;
  return [[x, c.z], [x, FORT + 6], [0, FORT + 6], [0, FORT - 4]];
};
sunomata.botWithdraw = (b, inp, { goTo }) => {
  if (b.player.lock) inp.e.add('KeyQ');
  sunomataWalk(b, inp, goTo, 0, FORT + 70, 3);
};

sunomata.botDefendsFort = true;
function makeSunomataBrain(b) {
  let inp, goTo;
  const clampPoint = [0, 0], emptyThreats = [];
  const p = b.player, u = p.u, F = b.flags;
  // 退き先は一度だけ用意し、敵が小屋へ来た時は別の空いた所を選ぶ。
  const restPoints = [[-6, 5], [6, 10], [0, 14], [-12, 10], [12, 10]];
  let restPoint = restPoints[0], senseAt = -1, closeFoes = 0, closeFriends = 0;
  const inF = (q, m = 0) => Math.abs(q.x) < FORT - m && Math.abs(q.z) < FORT - m;
  const walk = (x, z, r) => sunomataWalk(b, inp, goTo, x, z, r);
  // 回り道で決めた歩みを保ったまま敵を向く。前進のまま向きだけ替えると柵や小屋へ突っ込む。
  const faceWalking = (e) => {
    const walking = inp.k.has('KeyW'), walkYaw = p.yaw;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (!walking) return;
    inp.k.delete('KeyW');
    const da = walkYaw - p.yaw;
    if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
  };
  const strike = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 4) faceWalking(e);
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    let attacker = null, ad = 10;
    for (const o of b.army.threats || emptyThreats) {
      if (!o.alive || o.team === u.team || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(o.pos, o.team, u.pos,
            (o.wpnKind || o.lookWeapon || o.weapon) === 'spear')) continue;
      const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // まだ届かない振りで足と反撃を止めない。構えの気力を遠くで使い切らない。
      if (od > (o.reach || 2.9) + 0.3 && !o.charging) continue;
      if (od < ad) { ad = od; attacker = o; }
    }
    if (attacker) {
      // 振りが当たるまで構えを保ち、別の敵への突きで受けを解かない。
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      inp.guardHold = true; inp.leftPressed = false; inp.chargeHold = false;
      // 受け流した直後は、次の振りが来ていても払いで押し返す。
      // 予兆だけで反撃を消し続けると、構えの気力を使い切って倒れる。
      inp.leftPressed = p.counterT > 0 && ad < (p.weapon === 'sword' ? 1.9 : 2.8) &&
        !attacker.invuln && p.cd <= 0 && !p.pending && p.sta >= 18;
    } else if (d < (p.weapon === 'sword' ? 1.9 : 2.8) && !e.invuln &&
        Math.abs(e.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, e.pos, p.weapon === 'spear')) {
      // 本体の槍と同じく柵越しに届く。柵を壁扱いすると、破られるまで一度も突けない。
      // 打ち込みを受けた後は構えを解き、払いになる猶予が過ぎてから突く。
      // 構えのまま連打して気力を使い切らず、届く相手へ一振りずつ返す。
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.leftPressed = !p.guard && p.time - (p.guardOffT ?? -9) > 0.45 &&
        p.cd <= 0 && !p.pending && p.sta > p.maxSta * 0.35;
    }
  };
  // 柵の内へ寄せる点：四隅（柵が直角に出会う袋）へは寄せず、角から 4m 手前の辺の上で待つ（(±18,±18) の詰まり）
  const clampIn = (x, z, m) => {
    let cx = Math.max(-m, Math.min(m, x)), cz = Math.max(-m, Math.min(m, z));
    const k = m - 4;
    if (Math.abs(cx) > k && Math.abs(cz) > k) {
      if (Math.abs(x) < Math.abs(z)) cx = Math.sign(cx) * k; else cz = Math.sign(cz) * k;
    }
    clampPoint[0] = cx; clampPoint[1] = cz; return clampPoint;
  };
  const fight = (e) => {
    const eIn = inF(e.pos), meIn = inF(u.pos, 0.3);
    // 柵の外の敵：柵の手前（内側）の近い所で待って突く
    if (meIn && !eIn) {
      const [cx, cz] = clampIn(e.pos.x, e.pos.z, FORT - 1.1);
      walk(cx, cz, 0.5);
    } else if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2.4) walk(e.pos.x, e.pos.z, 2.2);
    strike(e);
    // 持ち場への下知と突撃の往復で、同じ号令を何度も叫ばせない。
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 30; }
  };
  const fightable = (o) => !o.invuln && !o.fleeing && !o.woundOut && !o.group?.routed;
  const insideEnemy = (o) => fightable(o) && inF(o.pos, 0.4);
  const visible = (o) => !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 &&
    !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon || o.weapon) === 'spear');
  const supplyEnemy = (o) => fightable(o) && o.group === F.KE;
  const outsideEnemy = (o) => fightable(o) && Math.abs(o.pos.x) < FORT + 8 && Math.abs(o.pos.z) < FORT + 8;
  const activeEnemy = (o) => fightable(o) && (o.group === F.W1 || o.group === F.W1b || o.group === F.PR1 || o.group === F.PR2 || o.group === F.W2 || o.group === F.W3a || o.group === F.W3b || o.group === F.W3c || o.group === F.W3d);
  const byHeal = (x) => x.id === 'heal', byFlag = (x) => x.id === 'flag';
  return (nextInput, nextGoTo) => {
    inp = nextInput; goTo = nextGoTo;
  // 前のコマの横歩き・後ずさりを残さない（四つの歩みが同時に押されたまま、柵ぎわで六十秒止まっていた）。
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  inp.guardHold = false;
  if (!u.alive) return;
  // 狙いを固定したままだと、回り道や構えの向きが更新時に敵へ戻される。
  if (p.lock) inp.e.add('KeyQ');
  // 深手・包囲・気力切れは、小屋を回って砦の後ろへ退く。
  // 敵から離れる向きを柵の内へ丸めるだけでは、柵ぎわで足が止まる。
  const hurt = u.hp < u.maxHp * 0.55;
  const tired = p.sta < p.maxSta * 0.22;
  // 傷が増えてからでは退く前に囲まれる。人数と退き先は半秒ごとに調べる。
  if (b.t >= senseAt) {
    senseAt = b.t + 0.5;
    closeFoes = 0; closeFriends = 0;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.fleeing || o.noTarget || o.isStruct || o.woundOut || o.type === 'porter' ||
          Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (o.team !== u.team && d < 5 && visible(o)) closeFoes++;
      else if (o.team === u.team && d < 8 && o.type !== 'gun' && o.type !== 'bow' &&
          !b.army.wallBetween(u.pos, -1, o.pos)) closeFriends++;
    }
    let best = -Infinity;
    for (const point of restPoints) {
      let clearance = 20;
      for (const o of b.army.units) {
        if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.isStruct || o.woundOut) continue;
        clearance = Math.min(clearance, Math.hypot(o.pos.x - point[0], o.pos.z - point[1]));
      }
      // 手当ての小屋が安全なら戻る。追手がいる時は、同じ所で足を止めない。
      const score = clearance - Math.hypot(u.pos.x - point[0], u.pos.z - point[1]) * 0.15 +
        (point === restPoints[0] && clearance >= 12 ? 8 : 0);
      if (score > best) { best = score; restPoint = point; }
    }
  }
  const surrounded = closeFoes >= 3 && closeFoes > closeFriends + 1;
  if (hurt || tired || surrounded || u.mobbed || F.botRest) {
    // 手当ての本体は十二歩以内に敵がいると受け付けない。八歩で止まらない。
    const near = b.army.nearestEnemy(u, 12, visible);
    const heal = b.interacts.find(byHeal);
    const canHeal = heal && !p.bandaged && p.treatmentLeft > 0 && !(F.healCd > b.t);
    // 退く理由（気力切れ・囲み・手当て）が消えたら持ち場へ戻る。柵越しの敵が近いだけで休み続けると、
    // 砦へ入った敵が人足を討つ間も柵ぎわで立ち尽くした。
    const trig = tired || surrounded || u.mobbed || (hurt && canHeal);
    F.botRest = trig ? !!near || p.sta < p.maxSta * 0.6 || (hurt && canHeal) : p.sta < p.maxSta * 0.45;
    if (F.botRest) {
      inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
      // 攻め続ける組を前に置き去りにせず、退き先へ連れて戻る。
      if (b.squad.length && b.squadGroups[0].order !== 'follow' && !(b.botCmdT > b.t)) {
        inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
      }
      walk(restPoint[0], restPoint[1], 0.8);
      if (near) {
        // 近い敵より、実際に振りかぶっている敵へ構える。
        let face = null, d = 10;
        for (const o of b.army.threats || emptyThreats) {
          if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
              Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(o.pos, o.team, u.pos,
                (o.wpnKind || o.lookWeapon || o.weapon) === 'spear')) continue;
          const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
          if (od > (o.reach || 2.9) + 0.3 && !o.charging) continue;
          if (od < d) { face = o; d = od; }
        }
        if (face) faceWalking(face);
        // 近いだけの敵には構えない。振りの合間に気力と受け流しの猶予を戻す。
        inp.guardHold = !!face;
      } else if (hurt && canHeal && Math.hypot(u.pos.x + 6, u.pos.z - 5) < 3.5) {
        inp.e.add('KeyE');
      }
      return;
    }
  }
  // 落ちた敵の旗を拾う（砦の近くだけ）
  const fl = b.interacts.find(byFlag);
  if (fl && Math.hypot(fl.pos.x, fl.pos.z) < 45 && !b.army.nearestEnemy(u, 3)) {
    if (Math.hypot(fl.pos.x - u.pos.x, fl.pos.z - u.pos.z) > 2) walk(fl.pos.x, fl.pos.z, 1.5);
    else { inp.e.add('KeyE'); inp.k.add('KeyE'); }
    return;
  }
  // 柵を越えた敵が最優先（小屋と資材を失う）
  const inside = b.army.nearestEnemy(u, 60, insideEnemy);
  if (inside) { fight(inside); return; }
  // 荷駄を狙う敵は打って出て討つ
  if (F.KE && F.KE.count && !F.KE.routed && !F.nidaDone) {
    const e = b.army.nearestEnemy(u, 200, supplyEnemy);
    if (e) { fight(e); return; }
  }
  // 柵の外に出ていれば、近くの敵を討ちながら砦へ戻る
  if (!inF(u.pos, 0.3)) {
    // 開いた北の口の外へ一歩出ただけなら、追って出ずに口から内へ戻る（追い続けて敵の控えの中へ出ていた）。
    const gapOpen = F.segs.gate.some((s) => !s.alive);
    const atGap = gapOpen && Math.abs(u.pos.x) < 6 && u.pos.z < -FORT + 1 && u.pos.z > -FORT - 8;
    const foe = b.army.nearestEnemy(u, 3.5, fightable);
    if (atGap) { goTo(p, inp, 0, -FORT + 5, 0.8); if (foe) strike(foe); return; }
    if (foe) { fight(foe); return; }
    walk(0, FORT - 5, 1.5);
    return;
  }
  // 柵に寄ってくる敵：柵の内側から突く
  const e = b.army.nearestEnemy(u, 30, outsideEnemy);
  if (e) { fight(e); return; }
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 30; }
  // 寄せ手の来る側の柵の内へ
  // 控えの隊へ走らず、今寄せている隊の側へ付く。
  const far = b.army.nearestEnemy(u, 220, activeEnemy);
  if (far) { const [cx, cz] = clampIn(far.pos.x, far.pos.z, FORT - 2.5); walk(cx, cz, 2); }
  else walk(0, -10, 3);
  };
}
sunomata.botBrain = (b, inp, { goTo }) => {
  const brain = b.flags.botBrain || (b.flags.botBrain = makeSunomataBrain(b));
  brain(inp, goTo);
};
// 普請・舟・行軍の時間をまとめて飛ばすと瞬間移動になるため、この戦は待ち飛ばしを使わない。
sunomata.canSkip = () => '';
sunomata.skip = () => {};
sunomata.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// すでに砦にいる三人を共通の武将の呼び口へ渡す。新しい兵は加えない。
sunomata.famous = [
  { name: '前野長康', team: 0, g: /前野長康/, line: '西の柵を離れるな！' },
  { name: '木下藤吉郎', team: 0, g: /藤吉郎/, line: '普請の手を止めるな。柵を守れ！' },
  { name: '蜂須賀正勝', team: 0, g: /川並衆/, line: '川の側はわしらが守る。組を離すな！' },
];
sunomata.date = (rt) => `永禄九年九月（伝承）　${seasonOf('九月')}・時刻と空模様は復元`;
function sunomataCrowdOk() { return true; }

// 史料にない千五百対四千へ兵を足さず、この場に配置した人だけ一人ずつ数える。
// take で軽い姿を隠した同じ一人は実兵側だけに数え、戻した兵と討死を重ねない。
sunomata.force = (rt) => {
  let a = 0, b = 0;
  for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'dummy') {
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  for (const A of rt.world.armies || []) {
    const n = Math.max(0, A.n - A.took);
    if (A.team === 0) a += n; else if (A.team === 1) b += n;
  }
  const initial = rt.flags.sunomataForce || (rt.flags.sunomataForce = { a, b });
  return { a, a0: initial.a, b, b0: initial.b };
};
sunomata.history = '信長公記の首巻「十四条合戦之事」には、永禄四年（1561）、信長が洲股の要害を固めて在陣し、十四条の戦の後に引き払ったとある。永禄九年（1566）に藤吉郎が一夜で築いたとも伝わるが、信長公記にその記録はない。伝承のよりどころの一つである『武功夜話』は後の時代の作で、成立や内容に疑いがある。戦国当時の確かな記録としては扱えない。この戦は築城伝承を借りた防衛戦。藤吉郎・小六・前野長康の役割、三度の寄せ、舟の上陸、兵数と砦の細部は遊びの補いで、史料にある合戦の再現ではない。千五百対四千は砦の外の控えと人足を含めた仮の総勢で、三十六メートル四方の柵内に全員が入るものではない。現代の標高は大まかな低地の参考に留め、当時の川筋・縄張り、昼から夕への時刻と天気は復元とする。主人公は上役の下知に従う一組の持ち場で、任務の失敗は史実の織田軍の敗北ではない。';

sunomata.rts = true;
export { sunomata };
