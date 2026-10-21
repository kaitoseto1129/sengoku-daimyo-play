import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// 第1戦　桶狭間。雨後の急襲・旗本の囲み・元の道への帰陣。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLIDS } from './props.js';
import { UNIT_MAT } from './units.js';
import { gauss, allyGroup, enemyGroup as commonEnemyGroup, unitPos, nm, guardRecover, jpNum } from './bhelp.js';
import { distToPolyline } from './world.js';
import { palisade, hut, dou, yagura, nobori, tawara, campfire, koshi, umaFollow } from './props.js';
import { nagashinojo } from './b_nagashinojo.js';
import { customFlag } from './b_inabayama.js';
import { farArmy, moveFar, gone, sky } from './b_shared.js';
import { sfx, hush } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { demBlend } from './dem.js';
import { sendOrder, posOf } from './denrei.js';
import { clash } from './b_sekigahara.js';
import { cryCaption } from './battle_cries.js';
import { rescueTarget, retreatRequired } from './battle_danger.js';
import { isTouch } from './touch.js';
import { cloneRoomNearMaterial } from './player.js';

// ======================================================================
// 第1戦　桶狭間
// ======================================================================
// 今川の貸し具足は赤茶の胴に朱・萌黄の威。名のある武将の私物は保つ。
// 旗本の増援にも同じ仕立てを使い、人数・能力・進行条件は変えない。
function enemyGroup(rt, options, list) {
  const dressed = [];
  for (const spec of list) {
    if (spec.o?.name) { dressed.push({ ...spec, o: { flag: 'imagawa', ...spec.o } }); continue; }
    for (let i = 0; i < spec.n; i++) dressed.push({ ...spec, n: 1,
      o: { armor: i % 2 ? 0x493a28 : 0x542e25, lace: i % 2 ? 0x79934b : 0xad4932,
        hatColor: 0x493a28, flag: 'imagawa', mon: 'imagawa', ...spec.o } });
  }
  return commonEnemyGroup(rt, options, dressed);
}

const P1 = [[0, 172], [-4, 150], [-4, 144], [4, 140], [6, 118], [-8, 90], [-24, 60], [-30, 30], [-22, 0], [-12, -30], [-8, -46]];
const HONJIN = { x: 18, z: -116 };
const readyUnit = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const readyGroup = (g) => g && !g.routed && g.units.some(readyUnit);

// 退く囲みを追う時は、別の備えの残兵へ散らず、近い旗本へ歩いて寄せる。
// 相手が退場するまで狙いを保つ。討取りを担う馬廻の指定は替えない。
function followRetiringGuards(g, guards, yoshimoto) {
  if (g.focus?.group === yoshimoto.group && readyUnit(g.focus)) return;
  const from = g.leader && readyUnit(g.leader) ? g.leader : g.units.find(readyUnit);
  if (!from) return;
  let target = null, nearest = Infinity;
  for (const u of guards) {
    if (u === yoshimoto || !readyUnit(u)) continue;
    const distance = Math.hypot(u.pos.x - from.pos.x, u.pos.z - from.pos.z);
    if (distance < nearest) { target = u; nearest = distance; }
  }
  g.focus = target || yoshimoto;
}

// 桶狭間の幕だけを細かく張り直す。五辺を一枚にまとめ、風は既存の時計で描く。
function okeCloth(camp, world) {
  camp.traverse((m) => {
    if (!m.geometry?.attributes.jpin) return;
    const pieces = [], supports = [], stakes = new Map();
    // 木と縄は元の材質のまま一枚にまとめる。形を作るのは開戦時だけ。
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed();
    const wood = new THREE.Color(0x493823), rope = new THREE.Color(0x827052);
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), turn = new THREE.Quaternion();
    const rod = (a, b, radius, color, taper = 1) => {
      const geo = cylinder.clone(), P = geo.attributes.position;
      const length = direction.set(b.x - a.x, b.y - a.y, b.z - a.z).length();
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i), r = radius * (y > 0 ? taper : 1);
        P.setXYZ(i, P.getX(i) * r, y * length, P.getZ(i) * r);
      }
      turn.setFromUnitVectors(up, direction.normalize()); geo.applyQuaternion(turn);
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const colors = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals(); supports.push(geo);
    };
    const stake = (x, z) => {
      const key = `${x.toFixed(4)},${z.toFixed(4)}`;
      if (stakes.has(key)) return stakes.get(key);
      const ground = world.heightAt(x, z), phase = x * 2.7 + z * 1.3;
      const dx = Math.sin(phase) * 0.09, dz = Math.cos(phase * 1.7) * 0.08;
      const height = 2.3 + Math.sin(phase * 0.8) * 0.09;
      rod({ x, y: ground - 0.05, z }, { x: x + dx, y: ground + height, z: z + dz },
        0.065 + Math.sin(phase * 2.1) * 0.016, wood, 0.78);
      const knot = { x: x + dx * 0.9, y: ground + 2.07, z: z + dz * 0.9 };
      stakes.set(key, knot); return knot;
    };
    for (const [ax, az, bx, bz] of [[5, -125, 31, -125], [5, -125, 5, -107], [31, -125, 31, -107], [5, -107, 13, -107], [23, -107, 31, -107]]) {
      const len = Math.hypot(bx - ax, bz - az), bays = Math.max(1, Math.round(len / 3));
      const tx = (bx - ax) / len, tz = (bz - az) / len, knots = [];
      for (let i = 0; i <= bays; i++) knots.push(stake(ax + tx * len * i / bays, az + tz * len * i / bays));
      // 分割位置を杭にそろえ、柱の間の上縁と吊り縄を同じ曲線で垂らす。
      for (let bay = 0; bay < bays; bay++) {
        const a = knots[bay], b = knots[bay + 1];
        let previous = a;
        for (let i = 1; i <= 8; i++) {
          const u = i / 8, next = { x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * 0.22,
            z: a.z + (b.z - a.z) * u };
          rod(previous, next, 0.014, rope); previous = next;
        }
      }
      const geo = new THREE.PlaneGeometry(len, 1.6, bays * 24, 6);
      const P = geo.attributes.position, UV = geo.attributes.uv, pin = new Float32Array(P.count);
      // 共通の幕と同じく頂点色を渡す。張り替えた形に色がないと布全体が黒くなる。
      const colors = new Float32Array(P.count * 3);
      const tone = new THREE.Color(), linen = new THREE.Color(0xd8cfb9), hem = new THREE.Color(0x89795e);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), v = UV.getY(i), along = x + len / 2;
        const span = Math.min(bays, Math.max(0, along / len * bays));
        const bay = Math.min(bays - 1, Math.floor(span)), u = span - bay;
        const a = knots[bay], b = knots[bay + 1], sag = Math.sin(u * Math.PI);
        const fold = Math.sin(u * Math.PI * 8) * 0.11 + Math.sin(u * Math.PI * 16 + sag) * 0.035;
        pin[i] = sag;
        // 留めた上端の間も垂れ、裾は深くたるむ。下端の小さな切れ目はほつれ。
        const fray = v === 0 ? 0.025 + 0.02 * Math.sin(along * 31 + ax) : 0;
        const billow = sag * (1 - v) * 0.32 + fold * (0.18 + (1 - v) * 0.82);
        P.setXYZ(i, a.x + (b.x - a.x) * u - tz * billow,
          a.y + (b.y - a.y) * u - 0.025 - (1 - v) * 1.6 - sag * (0.22 + (1 - v) * 0.12) - fray,
          a.z + (b.z - a.z) * u + tx * billow);
        UV.setX(i, along / 4);
        tone.copy(linen).lerp(hem, Math.pow(1 - v, 3) * 0.4);
        tone.multiplyScalar(0.94 + fold * 0.4);
        colors[i * 3] = tone.r; colors[i * 3 + 1] = tone.g; colors[i * 3 + 2] = tone.b;
      }
      geo.setAttribute('jpin', new THREE.BufferAttribute(pin, 1));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      pieces.push(geo);
    }
    const oldGeo = m.geometry;
    m.geometry = mergeGeometries(pieces); m.geometry.computeBoundingSphere();
    oldGeo.dispose(); for (const geo of pieces) geo.dispose();
    const frame = m.parent.children.find((child) => child.isMesh && child !== m && !child.geometry.attributes.jpin);
    if (frame) {
      const oldFrame = frame.geometry;
      frame.geometry = mergeGeometries(supports); frame.geometry.computeBoundingSphere(); oldFrame.dispose();
    }
    cylinder.dispose(); for (const geo of supports) geo.dispose();
    // 共有の絵には書かず、この幕の絵に縫い糸・織り目・裾のほつれを足す。
    const oldMap = m.material.map, canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const g = canvas.getContext('2d'); g.drawImage(oldMap.image, 0, 0, 512, 128);
    g.fillStyle = 'rgba(236,228,208,0.45)';
    for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 512, 0.5);
    g.fillStyle = 'rgba(63,48,29,0.38)';
    for (let x = 0; x < 512; x += 64) {
      g.fillRect(x, 0, 2, 128);
      for (let y = 3; y < 126; y += 5) { g.fillRect(x + 3, y, 2, 2); g.fillRect(x + 6, y + 2, 1, 2); }
    }
    for (const y of [3, 121]) for (let x = 2; x < 512; x += 6) g.fillRect(x, y, 3, 1);
    for (let x = 0; x < 512; x++) g.clearRect(x, 125 + Math.round(Math.sin(x * 1.7) * 2), 1, 4);
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.userData.clone = true;
    m.material.map = map; oldMap.dispose(); m.material.alphaTest = 0.35;
    const compile = m.material.onBeforeCompile;
    m.material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      // 杭の所は固定し、濡れた布も裾と柱の間には重い揺れを残す。既存の時計を使う。
      shader.vertexShader = shader.vertexShader
        .replace('(1.0 - uv.y) * jpin', 'jpin * (0.12 + 0.88 * (1.0 - uv.y))')
        .replace('(0.07 + uGust * 0.09) * (1.0 - uWet * 0.6)', '(0.18 + uGust * 0.18) * (1.0 - uWet * 0.35)');
    };
    m.material.customProgramCacheKey = () => 'okeCloth3';
    m.material.needsUpdate = true;
  });
}

// この本陣の輿だけ、塗りの明暗・簾・脚を足す。寸法と当たりは元のまま。
// 形は開戦時に一枚へまとめ、共有の材質やほかの戦の輿には書き込まない。
function okeKoshi(world, x, z, rot) {
  const m = koshi(world, x, z, rot), base = m.geometry;
  const P = base.attributes.position, C = base.attributes.color;
  const lacquer = new THREE.Color(0x393029), roof = new THREE.Color(0x433a30);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i), px = P.getX(i), pz = P.getZ(i);
    // 二段の屋根は上ほど絞り、軒の中央を浅くむくらせる。
    if (y >= 1.48) {
      const taper = y > 1.65 ? 0.9 : 1;
      P.setXYZ(i, px * taper, y + 0.045 * (1 - Math.min(1, Math.abs(pz) / 0.78)), pz);
    }
    // 黒塗りは残し、昼でも窓・軒・胴が同じ黒い箱に潰れないようにする。
    if (C.getX(i) < 0.025 && C.getY(i) < 0.025 && C.getZ(i) < 0.025) {
      const color = y >= 1.48 ? roof : lacquer;
      const grain = 0.92 + Math.sin(pz * 31 + y * 17) * 0.08;
      C.setXYZ(i, color.r * grain, color.g * grain, color.b * grain);
    }
  }
  const parts = [base];
  const box = (w, h, d, bx, by, bz, hex) => {
    const source = new THREE.BoxGeometry(w, h, d);
    const geo = source.toNonIndexed(); source.dispose(); geo.translate(bx, by, bz);
    const color = new THREE.Color(hex), colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geo);
  };
  // 胴の底は地面から浮いているので、四脚と貫で実際に支える。
  for (const sx of [-0.42, 0.42]) {
    for (const sz of [-0.55, 0.55]) box(0.09, 0.46, 0.09, sx, 0.23, sz, 0x4a3827);
    box(0.07, 0.07, 1.18, sx, 0.15, 0, 0x4a3827);
    // 窓の簾は横の細い竹と左右の縁。追加の絵や透過描画は使わない。
    for (let j = 0; j < 11; j++) box(0.025, 0.018, 0.8, Math.sign(sx) * 0.527, 0.8 + j * 0.04, 0, j % 2 ? 0x9d8555 : 0xb29b68);
    for (const sz of [-0.42, 0.42]) box(0.03, 0.5, 0.035, Math.sign(sx) * 0.53, 1, sz, 0x685039);
  }
  m.geometry = mergeGeometries(parts); m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
  for (const geo of parts) geo.dispose();
  return m;
}

// 木肌・縄・削り口は共通の軽い形を使い、この二つの柵だけ傾きと太さの差を強める。
function okePalisade(world, a, b) {
  // 無地の盛り土を重ねず、杭を既存の地面へ直接打つ。当たりと幕の口は保つ。
  const m = palisade(world, [a, -104.8, b, -104.8], { h: 1.5, solid: true, mound: false });
  const P = m.geometry.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), ground = world.heightAt(x, -104.8);
    const h = Math.max(0, P.getY(i) - ground), variation = Math.sin(x * 4.7);
    P.setXYZ(i, x + h * Math.sin(x * 3.1) * 0.035,
      ground + (P.getY(i) - ground) * (1 + variation * 0.07),
      -104.8 + (z + 104.8) * (1.15 + variation * 0.08) + h * variation * 0.06);
  }
  P.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
  return m;
}

// 声は近くの隊だけへ。遠い隊は使番が実際に着いてから下知を受ける。
// 討たれたり幕で止まった使番の代わりに、秒数だけで知らせを通さない。
function fieldNotice(rt, from, target, team, apply) {
  const a = posOf(from), b = posOf(target);
  if (!a || !b) return;
  if (Math.hypot(a.x - b.x, a.z - b.z) <= 12 && !rt.army.wallBetween(a, -1, b)) apply(target);
  else return sendOrder(rt, from, target, { id: '桶狭間の知らせ', apply },
    { team, faction: team ? 'imagawa' : 'oda', name: '備の組頭' });
}

// 台詞も生きた話し手のそばだけで聞く。旗と任務の札は離れても残す。
function localSay(rt, source, who, text, dur) {
  const u = source?.units ? source.units.find(readyUnit) : source;
  if (!u || !readyUnit(u)) return;
  const p = rt.player.u.pos;
  if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 12 && !rt.army.wallBetween(u.pos, -1, p)) rt.say(who, text, dur);
}

function retreatGroup(g) {
  if (!readyGroup(g) || g.okeReturnOrdered) return;
  g.okeReturnOrdered = true;
  g.guard = false; g.focus = null; g.order = 'path'; g.formation = 'column';
  // 残った敵を追わず、帰る列の目の前の相手だけに応戦する。
  g.aggro = 3;
  g.path = [[18, -100], ...P1.filter(([, z]) => z <= 30).slice().reverse()].map(fieldPathPoint); g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; };
}

// 散った兵の平均は誰もいない場所になる。帰る印も合流も、実際の旗持ちにそろえる。
function returnCenter(rt) {
  const F = rt.flags;
  if (!readyGroup(F.returnGroup)) F.returnGroup = F.attackers.find((g) => readyGroup(g) && g.okeReturnOrdered) || F.attackers.find(readyGroup);
  const g = F.returnGroup;
  if (!g) return null;
  let carrier = null;
  for (const standard of g.stds || []) {
    const u = standard.userData.carrier;
    if (u && readyUnit(u) && !standard.userData.std?.down) { carrier = u; break; }
  }
  F.returnLeader = carrier || (g.leader && readyUnit(g.leader) ? g.leader : g.units.find(readyUnit));
  const marker = rt.markers.find((m) => m.id === 'genpachi');
  if (marker && F.pursuitDone) marker.group = g;
  return F.returnLeader.pos;
}

// 位置図の北を上にそろえる。中島砦から本陣へは西北西から東南東。
// 図の原点は (2, 3)。本陣はおけはざま山 (110, 30) に置く。
// 戦う範囲の間合いを保ち、砦までの広がりは実地のメートルで別に作る。
// 元の道の曲がりと段の間合いは、同じ回転を全ての位置へかけて保つ。
const FIELD_TURN = Math.atan2(-261, -53) - Math.atan2(-18, 278);
const FIELD_C = Math.cos(FIELD_TURN), FIELD_S = Math.sin(FIELD_TURN);
const FIELD_X = 112 - 18 * FIELD_C + 116 * FIELD_S;
const FIELD_Z = 33 + 18 * FIELD_S + 116 * FIELD_C;
const fieldX = (x, z) => FIELD_X + x * FIELD_C + z * FIELD_S;
const fieldZ = (x, z) => FIELD_Z - x * FIELD_S + z * FIELD_C;
const fieldPoint = (x, z) => ({ x: fieldX(x, z), z: fieldZ(x, z) });
const fieldVector = (x, z) => ({ x: x * FIELD_C + z * FIELD_S, z: -x * FIELD_S + z * FIELD_C });
const localX = (x, z) => (x - FIELD_X) * FIELD_C - (z - FIELD_Z) * FIELD_S;
const localZ = (x, z) => (x - FIELD_X) * FIELD_S + (z - FIELD_Z) * FIELD_C;
const fieldPathPoint = ([x, z]) => [fieldX(x, z), fieldZ(x, z)];
const FIELD_HONJIN = fieldPoint(HONJIN.x, HONJIN.z);
const NAKAJIMA = { x: -2498, z: -497 };
const ZENSHOJI = { x: -3198, z: -997 };
const zenshojiLocal = [localX(ZENSHOJI.x, ZENSHOJI.z), localZ(ZENSHOJI.x, ZENSHOJI.z)];
// 接近路の細かな曲がりは推定。中島から正面へ進み、北への迂回路は足さない。
// 待つ場所で道を切らず、小屋の東を回って幕と柵の開いた口へつなぐ。
const ASSAULT_PATH = [[-8, -46], [18, -80], [18, -100], [18, -110], [18, -116]];
const HORSE_PATH = [[-44, 8], [-44, 2], [-44, -30], [-8, -46]];
const APPROACH = [[NAKAJIMA.x, NAKAJIMA.z], [-1798, -377], [-998, -197], ...P1.map(fieldPathPoint), ...ASSAULT_PATH.slice(1).map(fieldPathPoint)];
const HORSE_ROAD = HORSE_PATH.map(fieldPathPoint);
const TOKAIDO = [[-998, -537], [742, -537], [2502, -537]];
// 名古屋市の史跡案内にある長福寺と桶狭間村、鳴海城下を分ける。
// https://www.city.nagoya.jp/midori/miryoku/1024793/1024801/1024811.html
// 村・堂の形、細かな位置と避難路は推定。江戸期の有松宿は作らない。
const OKE_VILLAGE = { x: -260, z: 360 }, CHOFUKUJI = { x: -300, z: 460 };
const NARUMI_TOWN = { x: -3910, z: -580 };
const CIVILIAN_BOUNDS = { minX: -4490, maxX: 2990, minZ: -1790, maxZ: 1790 };
const civilRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
const CIVILIAN_BANDS = [
  // 林の縁から見る百姓一家。行軍路・本陣を横切らず、南の里道へ退く。
  { ...fieldPoint(100, 12), kinds: ['farmer', 'woman', 'child', 'elder'],
    route: [fieldPoint(124, 40), { x: -280, z: 250 }, { x: -280, z: 550 }, { x: -400, z: 760 }] },
  { x: OKE_VILLAGE.x + 35, z: OKE_VILLAGE.z, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    route: civilRoute([[-225, 440], [-225, 620], [-400, 760]]) },
  { x: CHOFUKUJI.x, z: CHOFUKUJI.z + 12, kinds: ['monk', 'monk', 'woman', 'child'],
    route: civilRoute([[-300, 540], [-400, 640], [-500, 760]]) },
  // 鳴海の城下の町人と商人は、砦と中島への進軍路を避けて街道の西へ。
  { x: NARUMI_TOWN.x - 35, z: NARUMI_TOWN.z + 20, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: civilRoute([[-3990, -550], [-4200, -550], [-4430, -550]]) },
];

// 戦う地面の細かさは替えず、その外に実寸の丘・砦・道を一度だけ作る。
// 古戦場伝説地は (742, -437)、三角点の丘は (502, 23)。両説の本陣を重ねて作らない。
function fieldSurroundings(rt) {
  const world = rt.world, edge = world.half + 150, oldFarH = world.farH;
  const surroundingHeight = (x, z) => {
    const out = Math.max(Math.abs(x), Math.abs(z)) - edge;
    if (out <= 0) return oldFarH(x, z);
    const ex = Math.max(-edge, Math.min(edge, x)), ez = Math.max(-edge, Math.min(edge, z));
    const blend = Math.min(1, out / 120), t = blend * blend * (3 - 2 * blend);
    const base = 12 + 5 * Math.sin(x * 0.003) * Math.cos(z * 0.004);
    // 標高64.7mの丘は広い裾を持つ。田楽窪はその北東の低地。
    const hill = (64.7 - (12 + 5 * Math.sin(502 * 0.003) * Math.cos(23 * 0.004))) * gauss(x, z, 502, 23, 42000);
    const hollow = 7 * gauss(x, z, 742, -437, 35000);
    return oldFarH(ex, ez) * (1 - t) + (base + hill - hollow) * t;
  };
  // 粗い外周だけを足す。近景の地面・木・川・兵の数は増やさない。
  const positions = [], indices = [];
  const patch = (x0, z0, x1, z1) => {
    const nx = Math.ceil((x1 - x0) / 60), nz = Math.ceil((z1 - z0) / 60), start = positions.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      positions.push(x, surroundingHeight(x, z), z);
      if (i < nx && j < nz) {
        const k = start + j * (nx + 1) + i;
        indices.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
    }
  };
  patch(-4500, -1800, -edge, 1800); patch(edge, -1800, 3000, 1800);
  patch(-edge, -1800, edge, -edge); patch(-edge, edge, edge, 1800);
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); landGeo.setIndex(indices); landGeo.computeVertexNormals();
  const landMat = new THREE.MeshLambertMaterial({ color: 0x485333 });
  rt.scene.add(new THREE.Mesh(landGeo, landMat));
  world.farH = surroundingHeight;
  const cameraFar = rt.camera.far;
  rt.camera.far = Math.max(cameraFar, 6000); rt.camera.updateProjectionMatrix();
  // 遠い小道具と軽い控えにも外周の高さを使う。戦う範囲の補間は元のまま。
  const nearHeight = world.heightAt.bind(world);
  world.heightAt = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > edge ? surroundingHeight(x, z) : nearHeight(x, z);
  // 近景の道は元の地面の土・泥を使う。上から無地の板を重ねない。
  const roadPos = [], roadIdx = [], roadUV = [];
  for (const path of [APPROACH, HORSE_ROAD, TOKAIDO]) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(length / 20)), dx = (b[1] - a[1]) / length * 2, dz = -(b[0] - a[0]) / length * 2;
    const start = roadPos.length / 3;
    for (let j = 0; j <= n; j++) for (const side of [-1, 1]) {
      const x = a[0] + (b[0] - a[0]) * j / n + dx * side, z = a[1] + (b[1] - a[1]) * j / n + dz * side;
      roadPos.push(x, world.heightAt(x, z) + 0.035, z);
      roadUV.push(x * 0.23, z * 0.23);
    }
    for (let j = 0; j < n; j++) {
      const k = start + j * 2;
      // 戦う範囲と境目の帯は、既存の道のぼかした縁をそのまま見せる。
      let outside = true;
      for (let v = k; v < k + 4; v++) if (Math.max(Math.abs(roadPos[v * 3]), Math.abs(roadPos[v * 3 + 2])) <= edge + 20) outside = false;
      if (outside) roadIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUV, 2)); roadGeo.setIndex(roadIdx); roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x97866c, map: world.groundU.tDirt.value, side: THREE.DoubleSide });
  rt.scene.add(new THREE.Mesh(roadGeo, roadMat));
  // 砦の形は推定。丸根・鷲津は落ちた後の煙だけで、別働勢を本陣へ足さない。
  for (const [x, z, mon] of [[NAKAJIMA.x, NAKAJIMA.z, 'oda'], [ZENSHOJI.x, ZENSHOJI.z, 'oda'], [-3498, -1497, 'oda'], [-3998, -697, 'imagawa'], [-2998, 1203, 'imagawa'], [2502, -197, 'imagawa']]) {
    for (const side of [-1, 1]) rt.scene.add(palisade(world, [x + side * 18, z - 18, x + side * 18, z + 18], { h: 2.2 }));
    rt.scene.add(palisade(world, [x - 18, z + 18, x + 18, z + 18], { h: 2.2 }), hut(world, x - 6, z + 4, 6, 4, 0.2, { minka: false }), yagura(world, x + 8, z + 8), nobori(world, x, z, mon, 5.5));
  }
  // 家の数は元の六軒を村三軒・城下三軒へ分け、共有の形で一度だけ作る。
  const kit = nagashinojo.kit;
  kit.farVillage(rt, OKE_VILLAGE.x, OKE_VILLAGE.z, { n: 3, fields: 5, seed: 3 });
  kit.farVillage(rt, NARUMI_TOWN.x, NARUMI_TOWN.z, { n: 3, fields: 0, seed: 5 });
  rt.scene.add(dou(world, CHOFUKUJI.x, CHOFUKUJI.z, 8, 5));
  for (const [x, z] of [[-2298, 553], [-2898, 253]]) world.addSmokeColumn(x, surroundingHeight(x, z) + 3, z, { size: 3 });
  // 足した地面と道も、次の戦へ移る時に解放する。
  const dispose = world.dispose.bind(world);
  world.dispose = () => {
    landGeo.dispose(); landMat.dispose(); roadGeo.dispose(); roadMat.dispose();
    rt.camera.far = cameraFar; rt.camera.updateProjectionMatrix(); dispose();
  };
}

// 幕と手盾を横切る行き先は、本陣の口を経由する。兵と bot で同じ道を使う。
function wayCross(x, z, dx, dz, a, lo, hi) {
  if (Math.abs(dx) < 1e-6) return false;
  const t = (a - x) / dx, q = z + dz * t;
  return t > 0 && t < 1 && q > lo && q < hi;
}
function honjinWay(army, u, goal) {
  const x = localX(u.pos.x, u.pos.z), z = localZ(u.pos.x, u.pos.z);
  const tx = localX(goal.x, goal.z), tz = localZ(goal.x, goal.z);
  const dx = tx - x, dz = tz - z;
  if (!wayCross(x, z, dx, dz, 5, -126, -106) && !wayCross(x, z, dx, dz, 31, -126, -106) &&
      !wayCross(z, x, dz, dx, -125, 4, 32) && !wayCross(z, x, dz, dx, -107, 4, 13.8) && !wayCross(z, x, dz, dx, -107, 22.2, 32) &&
      !wayCross(z, x, dz, dx, -104.8, 3, 12.8) && !wayCross(z, x, dz, dx, -104.8, 23.2, 33)) return goal;
  let wx = 18, wz;
  const inside = x > 5 && x < 31 && z > -125 && z < -107;
  const targetInside = tx > 5 && tx < 31 && tz > -125 && tz < -107;
  if (inside) wz = z < -111 ? -110 : -100;
  // 奥の幕の外から口へ回る時は、先に奥の角を回る。
  // いきなり口の横へ向かうと、奥の幕を斜めに横切って止まる。
  else if (z <= -125 && x > 3 && x < 33) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (!targetInside && tz <= -125 && (x <= 4 || x >= 32)) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (z < -101) { wx = x < 18 ? 2 : 34; wz = -100; }
  else if (!targetInside && (tx < 5 || tx > 31)) { wx = tx < 5 ? 2 : 34; wz = -100; }
  else if (!targetInside && tz <= -125) { wx = x < 18 ? 2 : 34; wz = x > 4 && x < 32 ? -100 : -128; }
  else if (Math.abs(x - 18) > 2) wz = -100;
  else wz = -110;
  const q = u._okeWay || (u._okeWay = { x: 0, z: 0 });
  q.x = fieldX(wx, wz); q.z = fieldZ(wx, wz);
  return q;
}

// 幕・柵・丘の小道具を始めに一度だけ回す。当たりの形も同じだけ回す。
function fieldScenery(rt) {
  const scene = new THREE.Group(), start = SOLIDS.length;
  scene.rotation.y = FIELD_TURN; scene.position.set(FIELD_X, 0, FIELD_Z);
  rt.scene.add(scene);
  const world = Object.create(rt.world);
  world.heightAt = (x, z) => rt.world.heightAt(fieldX(x, z), fieldZ(x, z));
  return { world, scene, finish() {
    for (let i = start; i < SOLIDS.length; i++) {
      const o = SOLIDS[i];
      // 当たりの囲みは回す前の四隅から作り直す。
      const corners = [[o.x0, o.z0], [o.x0, o.z1], [o.x1, o.z0], [o.x1, o.z1]].map(fieldPathPoint);
      if (o.k === 's') {
        const a = fieldPoint(o.ax, o.az), b = fieldPoint(o.bx, o.bz);
        o.ax = a.x; o.az = a.z; o.bx = b.x; o.bz = b.z;
      } else {
        const p = fieldPoint(o.x, o.z); o.x = p.x; o.z = p.z;
        if (o.k === 'r') { const c = o.c; o.c = c * FIELD_C - o.s * FIELD_S; o.s = o.s * FIELD_C + c * FIELD_S; }
      }
      o.x0 = Math.min(...corners.map((p) => p[0])); o.x1 = Math.max(...corners.map((p) => p[0]));
      o.z0 = Math.min(...corners.map((p) => p[1])); o.z1 = Math.max(...corners.map((p) => p[1]));
    }
  } };
}

// 現代の標高は水平・高さとも一メートルを一単位で読む。旧地形の確定復元とはしない。
// 手書きの谷と道は推定。素材の格子を引き伸ばしたり、標高を潰したりしない。
let okeDem = null;
useTerrain('dem_okehazama', (data) => { okeDem = data; });
const OKE_DEM_OPTIONS = { scale: 1, xyScale: 1 };
const okeHeight = (dem, x, z, b) => dem ? demBlend(dem, x, z, b, OKE_DEM_OPTIONS, b - 5) : b;

// 今川の小荷駄（本陣の北の窪み）。俵と幔幕の脇に荷の隊を置く（遠景。数は軽い）
function DA0(rt, scenery) {
  const W = scenery.world;
  const KT2 = nagashinojo.kit;
  for (let i = 0; i < 6; i++) {
    const load = tawara(W, HONJIN.x + 26 + (i % 3) * 3, HONJIN.z - 58 + Math.floor(i / 3) * 3, 0.3 * i, 6);
    load.userData.hist = 'GAME_C'; scenery.scene.add(load);
  }
  const baggage = KT2.farHost(rt, fieldX(HONJIN.x + 34, HONJIN.z - 66), fieldZ(HONJIN.x + 34, HONJIN.z - 66), 26, 10, 70, FIELD_TURN, 0x4a3a2a, 'imagawa', 41, 'mixed');
  baggage.army.hist = 'GAME_C';
  return baggage;
}

// 首巻の本陣急襲。八陣の名を当てず、織田は谷の縦列、今川は休息陣と分遣隊。
const OKEHAZAMA_JIN = [
  battleJin('谷を進む縦備え', 0, fieldPoint(2, 150), Math.PI + FIELD_TURN, [
    ['okhVan', '谷の先手', '名は伝わらない', 600, 2, 140, 'cols.0', 'oda'],
    ['okhMain', '谷の本備', '名は伝わらない', 1200, 2, 158, 'cols.2', 'oda'],
    ['okhNobu', '本陣', '織田信長', 200, 2, 150, 'nob', 'eiraku', 'oda'],
    ['okhSaku', '善照寺方面の控え', '佐久間信盛', 500, ...zenshojiLocal, 'jinSaku', 'oda'],
  ], '攻撃兵二千ほど。善照寺方面の五百は別の控え。家臣ごとの配置と各備の割り振りは推定。', fieldPoint),
  battleJin('休息中の備え', 1, FIELD_HONJIN, FIELD_TURN, [
    ['okhYoshi', '本陣', '今川義元', 1500, HONJIN.x, HONJIN.z + 2, 'hatamoto', 'imagawa'],
    ['okhGuard', '本陣前の守り', '名は伝わらない', 600, 0, -96, 'enemies.0', 'imagawa'],
    ['okhFrontEast', '本陣前の右の守り', '名は伝わらない', 400, 40, -92, 'enemies.1', 'imagawa'],
    ['okhWest', '本陣左の備え', '松井宗信', 1000, -22, -118, 'enemies.2', 'imagawa'],
    ['okhEast', '本陣右の備え', '名は伝わらない', 1000, 40, -124, 'enemies.3', 'imagawa'],
    ['okhReserve', '本陣後ろの控え', '名は伝わらない', 1500, -4, -134, 'enemies.4', 'imagawa'],
  ], '今川全軍は『信長公記』では四万五千、後世には二万五千とも。本陣周辺の六千は推定の目安で、全軍の数ではない。松平元康らの大高・丸根方面の別働勢はここへ集めない。', fieldPoint),
];

const okehazama = {
  jinkei: OKEHAZAMA_JIN,
  // 初陣は重なる槍の傷を間引き、構えて味方へ退く間を残す。信長にも同じ猶予を使う。
  // 厳しい戦・矢玉・地形の傷は、共通の仕組みで従来どおり扱う。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  noWake: false,
  noReserve: true,
  botOrders: true,   // 性格の突進で、組について進む下知や反撃の隙を上書きしない。
  contextualCoach: true, // 敵が離れたら受け流しの手ほどきを休め、任務を読めるようにする。
  pauseRetry: true, // やり直しを選ぶ間に味方が討たれ、戦況が変わらないようにする。
  retryReason(rt) {
    if (rt.flags.victory) return '義元は討たれたが、組と帰れなかった';
    if (rt.phase === 'assault') return '義元を討ち取れず、攻めを止めた';
    return '組と合流できず、攻めに加われなかった';
  },
  // 印だけを選ぶ。囲みが三人欠ける判定と兵の振る舞いは変えない。
  objectiveEnemies(rt) {
    const F = rt.flags, marked = F.guardMarks || (F.guardMarks = []);
    if (!F.entered || F.victory || F.yoshiDown || rt.phase !== 'assault' ||
        F.guardOpened && !F.mouthReached && !F.koshiLeft) { marked.length = 0; return marked; }
    if (F.guardMarksAt > rt.t && (!marked.length || readyUnit(marked[0]))) return marked;
    F.guardMarksAt = rt.t + .1;
    const units = F.hatamoto.units, y = F.yoshimoto;
    let guards = 0;
    for (const u of units) if (u !== y && readyUnit(u)) guards++;
    const left = F.guardOpened ? 1 : Math.min(1, Math.max(0, 3 - (F.guardStart - guards)));
    // 幕の口に着いた後は、通す味方の近くにいる旗本だけを案内する。
    // 戦う人数や囲みを崩す条件はそのまま、印は一人にしぼる。
    const passage = F.nobKill?.[1]?.pos;
    for (let i = marked.length - 1; i >= 0; i--) if (!readyUnit(marked[i]) ||
        F.guardOpened && passage && Math.hypot(marked[i].pos.x - passage.x, marked[i].pos.z - passage.z) > 6) marked.splice(i, 1);
    if (marked.length > left) marked.length = left;
    while (marked.length < left) {
      let best = null, distance = Infinity;
      for (const u of units) {
        if (u === y || !readyUnit(u) || marked.includes(u)) continue;
        if (F.guardOpened && passage && Math.hypot(u.pos.x - passage.x, u.pos.z - passage.z) > 6) continue;
        const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
        if (d < distance) { best = u; distance = d; }
      }
      if (!best) break;
      marked.push(best);
    }
    return marked;
  },
  immediateTaskChanges: true, // 見張りの接近・雨上がり・帰陣の支度を、今の札へすぐ反映する。
  keepTaskLabel: true, // 近い敵を選んでも、組の下知と雨上がりを待つ任務を残す。
  keepDestinationTask: true, // 旗の場所の案内で、見張りを迎え撃つ下知を消さない。
  keepCombatTask: true,
  keepCombatTaskHeading: true, // 接敵しても囲みを崩す目的を残す。守る操作は既存の危険札で伝える。
  singleEnemyPursuitSign: true,
  meleeApproachText: (rt) => rt.phase === 'assault' && rt.flags.entered
    ? okehazama.taskLabel(rt) : '味方と 目印の敵へ進む',
  enemyTaskLabel(rt, enemy) {
    const p = rt.player, h = rt.hud;
    if (!enemy?.alive || h.defendEnemy && !h.attackGuideEnemy) return '';
    const reach = p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
    if (Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) > reach) return okehazama.meleeApproachText(rt);
    if (!isTouch) return '';
    return p.charging ? p.chargeT > .7 ? 'はなして攻撃' : 'そのまま 長くおす' :
      `長くおして ${p.weapon === 'sword' ? 'きる' : 'つく'}`;
  },
  meleeApproachArrowLength: 72,
  combatTaskLabel: (rt) => (((rt.phase === 'brief' || rt.phase === 'march' || rt.phase === 'wait') && rt.flags.scoutFighting) ||
    (rt.phase === 'assault' && rt.flags.entered && !rt.flags.victory)) ? okehazama.taskLabel(rt) : '',
  passageGuideUnits: (rt) => rt.phase === 'assault' && rt.flags.entered && rt.flags.guardOpened && !rt.flags.victory ? rt.flags.nobKill : null,
  passageGuideDestination: (rt) => rt.flags.yoshimoto?.pos,
  keepTaskWithGuard: false, // 守る操作は実際に押せる札一枚へまとめる。
  keepRescueTaskLabel: true, // 救援の印で、攻める相手や帰陣の下知を上書きしない。
  treatmentTaskGuidance: true,
  // 血が止まった後の手足の傷だけで、攻めの下知を退避へ替え続けない。
  // 歩速・攻撃への傷の影響と、出血・深手・包囲・息切れの退避は保つ。
  retreatForLimbWounds: false,
  keepWoundRetreatReason: true,
  keepRetreatReason: true,
  keepRetreatGestureReason: true, // なぞる向きだけで、敵から退く理由を消さない。
  retreatMoveGesture: true,
  // 傷の札は状態だけを伝え、退く下知は手当て・危険の案内へそろえる。
  woundEffectText: (_rt, slow) => slow ? 'けがで 足が おそい' : 'けがで 力が よわい',
  compactWaitGuard: true, // 横持ちの携帯は既存の固定釦を使い、地面を追う位置指定を外す。
  duelStanceText: '敵将と斬り合い',
  waitGuardActionText: '長押しで ふせぐ',
  waitGuardHint: (rt) => rt.player.guard ? '敵の振り終わりに はなす' : '敵を向いて 押し続ける',
  releaseGuardForAttack: true, // 打ち終わりは構えの長押しを解き、突く操作へ渡す。
  // 深手の義元は毛利が討つ。本人へ寄る輪と攻撃の手ほどきだけを外す。
  // 周りの旗本への案内、義元の当たり、毛利が寄せる判定は保つ。
  enemyGuideAllowed: (rt, enemy) => !(rt.flags.yoshiDown && enemy === rt.flags.yoshimoto),
  meleeGuide: (rt, enemy) => !(rt.flags.yoshiDown && enemy === rt.flags.yoshimoto),
  // 届く相手が打ち終わった時だけ反撃を教える。兵の攻撃や任務の判定は変えない。
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (!this.meleeGuide(rt, enemy) || rt.phase === 'brief' || !readyUnit(enemy) || enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust')) return false;
    // ほかの敵が本人へ打ち込む時は、構えを続ける。
    for (const e of rt.army.units) {
      if (e.team === u.team || !readyUnit(e)) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5) return false;
    }
    return true;
  },
  // 救援を先に示す。義元が深手なら、任せる相手の毛利も実際の姿で示す。
  guardGuideTarget(rt) {
    if (retreatRequired(rt)) return null;
    const rescue = rescueTarget(rt);
    if (rescue) return rescue;
    const mor = rt.flags.nobKill?.[1];
    if (!rt.flags.yoshiDown || rt.flags.victory || !mor || !readyUnit(mor)) return null;
    const p = rt.player.u.pos;
    return Math.hypot(mor.pos.x - p.x, mor.pos.z - p.z) <= 12 &&
      !rt.army.wallBetween(p, -1, mor.pos) && sightPoint(rt, mor.pos) ? mor : null;
  },
  guardGuideAllowed(rt) { return !!this.guardGuideTarget(rt); },
  // 敵が去っても長押しだけで守る札を残さず、組の旗への案内へ戻す。
  waitGuardAllowed(rt, enemy) {
    const p = rt.player.u;
    return !!enemy && readyUnit(enemy) && enemy.team !== p.team &&
      Math.abs(enemy.pos.y - p.pos.y) < 1.5 &&
      Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) < this.nearThreatRange &&
      !rt.army.wallBetween(p.pos, -1, enemy.pos);
  },
  guardLabel: (rt, u) => u === rescueTarget(rt) ? '傷ついた人を まもる' : u === rt.flags.nobKill?.[1] ? '毛利のそばで まもる' : 'この人のそばで まもる',
  guardStartText: '長おしで まもる',
  guardWaitText: '長おしで まもる',
  // 携帯でも守る本人の姿と敵の槍を隠さない。印だけ縮め、守る判定は保つ。
  compactGuardGuide: true,
  taskLabel(rt) {
    if (rt.flags.victory && !rt.flags.pursuitDone)
      return `組と追う あと${Math.max(0, Math.ceil((rt.flags.pursuitUntil || rt.t) - rt.t))}秒`;
    // 帰る支度の残り時間を本文へ入れる。閉じた任務札でも待つ理由が分かる。
    if (rt.flags.pursuitDone) {
      const c = rt.flags.returnLeader?.pos, p = rt.player.u.pos;
      if (!c || Math.hypot(c.x - p.x, c.z - p.z) > 8 || rt.army.wallBetween(p, -1, c)) return '帰る組の旗へ 集まれ';
      if (rt.flags.returnEnemyNear) return '組の旗で 味方と迎え撃て';
      return `組の旗で あと${Math.max(0, Math.ceil(10 - (rt.flags.returnGatherT || 0)))}秒待つ`;
    }
    if ((rt.phase === 'brief' || rt.phase === 'march' || rt.phase === 'wait') && rt.flags.scoutFighting)
      return rt.hud.approachGuideEnemy?.alive ? '味方と 目印の敵へ進む' : '味方と 敵を迎え撃とう';
    if (rt.phase === 'wait') return this.waitOrderLabel(rt);
    if (rt.phase === 'assault' && !rt.flags.entered) return rt.flags.attackText || '組の旗に続き、幕の口へ進め';
    if (rt.phase === 'assault' && rt.flags.entered && !rt.flags.victory) {
      if (this.objectiveEnemies(rt).length) return rt.flags.guardOpened ? '毛利の前の敵を倒す' : '味方と 義元の囲みを崩す';
      // 残り人数は攻めの処理が数えた本文を使い、毎コマ兵を数え直さない。
      if (!rt.flags.guardOpened) return '味方と 義元の囲みを崩す';
      if (rt.flags.yoshiDown) return rt.flags.nobKill[1]?.woundOut ? '毛利は手当て中。味方と構えよ' : '義元は深手。討取りは毛利に任せよ';
      if (rt.flags.koshiLeft) return '毛利と進み 義元の守りを崩す';
      return rt.flags.mouthReached ? '服部と毛利を 義元へ通す' : '味方と 幕の口へすすむ';
    }
    return '';
  },
  waitOrderLabel(rt, reached = true) {
    if (rt.phase !== 'wait') return '';
    // 待機場所の札から呼ばれても、目の前の斬り合いを雨待ちへ戻さない。
    if (rt.flags.scoutFighting) return '味方と 敵を迎え撃とう';
    if (rt.flags.kakare) return '旗に つづけ';
    if (!reached) return isTouch ? '旗までなぞろう' : '旗へ進もう';
    return 'ここで待とう';
  },
  // 囲みを崩した後は、誰を通すのかと、次に何が起きるのかを一行で残す。
  taskDetail(rt, title, progress) {
    const F = rt.flags;
    // 退避や手当ての見出しに、進軍の説明を混ぜない。帰陣中も傷を先に案内する。
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) {
      if (rt.player.mounted) return '馬をおりてから、味方の後ろで傷を縛ろう';
      if (rt.player.treatmentReady) return '「手当て」を三秒押し続け、血を止めよう';
      if (rt.player.treatmentNext > rt.t) return '手当ての後は、味方の後ろで少し休もう';
      return '敵から離れ、味方の後ろで足を止めよう';
    }
    if (retreatRequired(rt) || cue?.active && cue.valid)
      return '敵を見ながら 味方のうしろへ';
    if (rt.dodgeGuide) return 'まず敵の攻撃をよけ、味方のそばへ戻ろう';
    if (F.victory) return progress;
    // 目前の操作が出る時は、別の進軍指示を下へ足さない。
    if (rt.hud.approachGuideEnemy?.alive || rt.hud.defendEnemy?.alive || rt.guideEnemyShown) return '';
    if (rt.phase === 'assault' && this.objectiveEnemies(rt).length) return '';
    if (rt.phase === 'assault' && !F.entered) return '組の旗と進もう。本陣には、幕の開いた口から入れる';
    if (rt.phase !== 'assault' || !F.guardOpened || F.victory) return '';
    if (F.yoshiDown) return '義元は深手。毛利新介に任せよう';
    if (F.koshiLeft) return '毛利新介と退き口へ進もう。毛利の前の敵を倒そう';
    return '服部小平太と毛利新介が義元へ進む。近くの敵を倒そう';
  },
  // 義元討取り後はこの戦の追い討ち・合流で締める。共通の八分で帰陣を失敗にしない。
  pacingWait: (rt) => !!rt.flags.victory || !!rt.flags.ending,
  compactIntro: true,
  introTaskFirst: true,
  introText: isTouch
    ? '組の旗に続こう。敵が来たら長押しで守る。打ち終えたら「つく」を長押しして、はなす。雨がやみ、合図が出たら本陣へ進もう。'
    : '組の旗に続こう。敵が来たら右クリックで構える。敵が打ち終えたら左クリックでつく。雨がやみ、合図が出たら敵の本陣へ進もう。',
  prelude: false,   // 奇襲の戦は溜めない（prelude.js）
  // 組頭の旗のすぐ後ろから出る。谷の行軍と本陣の位置は保つ。
  spawn: { ...fieldPoint(-12, -25), heading: Math.PI + FIELD_TURN },
  lordSpawn: { ...fieldPoint(-44, 8), heading: Math.PI + FIELD_TURN },
  lordAt: { ...fieldPoint(-44, 2), r: 16, why: '谷の馬廻の後ろ（接近路の細かな位置は推定）' },
  civilianCrowd: { bounds: CIVILIAN_BOUNDS, bands: CIVILIAN_BANDS },
  // 周りの槍を一律に縮めず、近い長柄だけ既存の遮蔽処理で避ける。
  nearSpearFade: false,
  // 敵味方・倒れた兵の長柄も、視点のすぐそばでは描かない。
  nearLongWeaponRadius: 7,
  // 騎馬の足もとより後ろへ張り出す籠も、近い視点では背の装具だけ避ける。
  nearHoroRadius: 12,
  nearHoroHide: true,
  // 布だけ消すと竹籠が露出する。別部品は装具ごと避け、一体の姿と使番は布も保つ。
  nearHoroWhole: true,
  // 母衣が胴と一体の姿でも、目の前では上半身ごと薄くして竹だけを残さない。
  nearHoroMergedFadeRadius: 3,
  nearAllyFadeLevel: 1,
  distanceUnit: 'ken',
  actionableThreats: true,
  compactThreats: true,
  // 小さな案内で兵と槍先を空ける。印の広さだけ替え、到着・回避の判定は保つ。
  compactFieldGuides: true,
  compactCombatGuides: true,
  // 足元の人の印で本人を示す。体の姿勢や騎乗に左右されない。
  hidePlayerSign: false,
  playerFootSignOnly: true,
  compactPlayerSign: true,
  playerSignScale: 0.55,
  playerSignMinScale: 0.55,
  // 通常は頭上の丸と刀だけで見分ける。姿勢からずれる白い人型は見やすさを強めた設定に限る。
  teamSignsOnly: true,
  noUnitContrast: false,
  // 間引いた骨の位置を案内に使わず、現在の足元へ敵の印を合わせる。
  positionPersonGuide: true,
  enemyFrameAtPosition: true,
  // 狙う一人は細い四隅で示し、顔・構え・槍先を空ける。
  enemyCornerSign: true,
  // 四隅で相手が分かるので、頭上の刀を重ねない。接近先も足元の一本にする。
  enemySignOnly: true,
  compactApproachGuide: true,
  // 大きな地面の輪と太い囲みで、足運びや具足を隠さない。
  compactFloorGuides: true,
  enemyFootRingRadius: 0.45,
  groundCombatMarkers: true,
  // 守備・待機の呼び出しが大輪を指定しても、既存の上限付きの足元の輪へそろえる。
  smallTaskAreas: true,
  smallRetreatAreas: true,
  taskAreaFootRing: true,
  // 高い旗の頭へ印を浮かせず、旗持ちの足元を行き先にする。
  groundFlagGuides: true,
  compactDodgeGuide: true,
  // 矢よけの線も足元の短い一本にし、兵の胴や槍を横切らない。
  shortDodgeArrow: true,
  // 退避は足元の短い矢印で示す。長い点線で兵の胴や槍を横切らない。
  singleRetreatArrow: true,
  retreatArrowLength: 72,
  retreatDestinationLabel: () => '味方の後ろへ さがる',
  // 仮の退避先を組旗と呼ばず、画面の外でも退く理由を残す。
  keepDodgeGuideLabel: true,
  compactDestinationSign: true,
  compactDestinationArea: true,
  compactTravelArrow: true,
  // 組旗への線が味方の胴を横切らないよう、足元から短い一本だけ残す。
  guideArrowLength: 72,
  // 退避と手当ては別の描き口も通る。そちらも足元の短い線へそろえる。
  swipeArrowLength: 72,
  directionArrowLength: 72,
  subtleTargetFrames: true,
  compactFlagFrames: true, // 隊旗は短い四隅だけ示し、縦長の輪で兵を囲まない。
  // 実物の布が見える時だけ囲む。隠れた旗は既存の方向案内へ渡す。
  visibleFlagGuides: true,
  // 退く案内は共通の地面の輪と短い矢印を使い、兵を横切る長い線を出さない。
  compactRescueGuide: true,
  compactRetreatSign: true, // 退く床の旗と矢印で、目の前の敵の胴・槍を隠さない。
  compactRetreatArea: true, // 近い退避先も画面上の小さな輪に収める。
  treatmentCrossSign: true,
  treatmentApproachLabel: '手当ての印へ さがる',
  // 移動しただけでは血は止まらない。馬上では先に下馬を案内する。
  treatmentMoveCaption: (rt) => rt.player.mounted ? '馬をおりてから 手当ての印へ' : '手当ての印へ なぞって下がる',
  dismountActionLabel: '馬をおりる',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬をおりて 傷を縛ろう';
    if (p.treatmentReady) return p.treating ? '手当てを 押し続ける' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '味方の後ろで 傷を縛ろう';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return this.treatmentApproachLabel;
    if (p.treatmentNext > rt.t) return `手当てまで あと${Math.ceil(p.treatmentNext - rt.t)}秒休む`;
    return '手をはなし 止まって傷を縛る';
  },
  dodgeLabel: (_rt, direction, rain) => direction || (rain ? '矢をよけよ' : '敵から離れよ'),
  // 回避先は実物の隊旗ではない。任務札と地面の案内で同じ動きを伝える。
  dodgeGuideLabel: (_rt, arrived, rain) => arrived ? '味方のそばへ もどる' : rain ? '矢をよけて さがる' : '敵から はなれる',
  // 矢の回避は専用の入口へ渡し、この戦の指図を保つ。
  rainDodgeGuideLabel(rt, arrived) { return this.dodgeGuideLabel(rt, arrived, true); },
  escapePlaceLabel: (_rt, _rain, side) => `${side}へ よけて！`,
  dodgeTurnLabel: (_rt, right, touch) => touch ? `画面を${right ? '右' : '左'}へ なぞる` : `${right ? '右' : '左'}へ むきをかえる`,
  // 初陣の斬り合いを見回す練習で止めない。方向は端の矢印で伝える。
  dodgeTurnDuration: 0,
  pauseTurnPractice: false,
  retreatGuideLabel(rt, reached) {
    // 退避先は安全な味方の後ろ。実際の組旗とは限らない。
    if (rt.player.u.wounds?.bleed > 0.0001) return reached ? '止まって 傷を縛ろう' : '血が出ている。味方の後ろへ';
    if (rt.player.u.hp < rt.player.u.maxHp * 0.3) return reached ? '味方と かまえよう' : '深手だ。味方の後ろへ';
    if (!reached) return rt.player.u.mobbed ? '囲まれた。味方の後ろへ' :
      rt.player.sta < 20 ? '息切れ。味方の後ろへ' : '敵から離れ 味方の後ろへ';
    if (rt.player.u.mobbed) return 'みかたと かまえよ';
    if (rt.player.sta < 20) return 'ここで息を整えよ';
    return 'みかたと かまえよ';
  },
  nearThreatWarning: true,
  nearThreatRange: 6,
  // 別の味方と戦う遠い兵で「構えて防げ」を出し続けない。射矢の警告は保つ。
  meleeThreatRange: 4.5,
  meleeThreatHeight: 1.5,
  rearThreatFrame: true,
  rearAdviceView: true, // 後ろから打たれた声も、方角の札と同じ視点で伝える。
  avoidWaymarkThreats: true,
  reserveCombatCues: true,
  readableLogEntry: true,
  // 横の大旗を避ける。体や当たりは動かさず、既存の描画処理だけを使う。
  nearFlagFadeRadius: 6,
  // 顔・笠・胴を別々に透かさず、目が体に入る時だけ兵を描く間避ける。
  // 肩越しの近景でも顔や騎手が画面の脇を覆う前に、描く間だけ全身を避ける。
  nearAllyFadeRadius: 2.8,
  nearAllyHorseFade: true,
  nearAllySolidBody: true,
  // 視線を塞ぐ時も装具と顔を別々に透かさず、描く間だけ全身で避ける。
  nearAllyWholeOcclusion: true,
  world: {
    // 三列の押し合いでも肩を重ねず、倒れた兵の周りは歩いてよける。
    meleeBodySpace: 1.25,
    // 長柄足軽全員に同じ幟を立てず、組旗・隊旗・名のある将は保つ（割合は復元）。
    ordinaryFlagStride: 3,
    avoidFallenBodies: true,
    longHoro: 'round',
    // 矢の線と落下点の影を土の色へなじませる。弓兵と実際の当たりは保つ。
    naturalArrowRain: true,
    // 数本の矢が落ちるだけで、田や土を大きな黒い池に見せない。
    // 回避の札・一本ごとの影と当たりは共通の仕組みに任せる。
    arrowRainAreaShadow: false,
    // 土の上に競技場のような縞の輪を敷かず、矢の影・警告・回避先で伝える。
    arrowRainGroundCue: false,
    // 少数の弓兵から数十本を増やさず、外れ矢を本陣前へ積み重ねない。
    // 飛ぶ矢と兵・幕・柵への当たりは既存の仕組みを保つ。
    arrowRainPerBow: 1,
    noGroundArrows: true,
    // 本人に当たらない味方の矢で、組を離れる案内を出さない。
    enemyArrowWarnings: true,
    // 雨空の強い散乱光でも、草の房だけが黄色く光らないよう地面の緑へ寄せる。
    tuftTint: 0x67794f,
    // 白い冠が草のように並ばない、小さな雨の跳ね。
    rainSplashScale: 0.4,
    // 坂の岩を土へ埋め、黒い穴に見える削った頂と板状の接地影を避ける。
    // 岩と根元の草は、既存の丸い岩・曲がる葉を設営時に使い回す。
    groundedSlopeRocks: true,
    // 歩く高さの補間と描く三角形の差で岩が浮かないよう、実際の土の面へ据える。
    // 回転した腹と縁も斜面へ埋める。既存の設営処理だけを使い、毎コマは調べない。
    rockDrawGround: true,
    rockSlopeContact: true,
    curvedRockTufts: true,
    // 谷の低い白帯は地面の切れ目に見える。豪雨と遠景の霞だけで見通しを表す。
    groundMistScale: 0,
    // 尾張の丘陵の上に、共通の高山の白い稜線を大きく重ねない。
    mountainScale: 0.35,
    // 肩越しの視界を塞ぐ幹を細くし、近づく手前から網目に透かす。
    treeTrunkScale: 0.65,
    nearTreeFadeRadius: 5,
    branchTrees: true,
    // 共通の透かした葉の房で、杉・松・雑木の硬い多面体を置き換える。
    branchFoliage: true,
    // 杉は外へ垂れる専用の枝葉、松・雑木は折った房。縦長の葉の板を避ける。
    // 既存の型と材質を林全体で使い回し、幹・兵の配置や当たりは保つ。
    cedarBoughs: true,
    // 葉房を水平近くに寝かせず、目の高さからも上下の房が重なるようにする。
    // 面数と株数を増やさず、低画質と遠景にも同じ枝の傾きを使う。
    cedarBoughPitch: 0.65,
    // 同じ葉房を横へ広げ、段の間から裸の幹だけが目立つ隙間を減らす。
    cedarBoughWidth: 1.35,
    // 高画質の杉は透明な余白を送らず、遠景の葉だけ艶の計算を省く。
    lightCedarFoliage: true,
    // 高画質で杉全体を縦長の三枚板へ戻さず、近景・遠景とも既存の枝房を使う。
    nearCedarBranches: true,
    foldedNeedleCards: true,
    // 低画質でも杉の枝の段を残す。形は少数の型を林全体で使い回す。
    layeredNeedles: true,
    // 既存の枝先のばらつきを使い、杉の輪郭を円錐の段だけにしない。
    raggedNeedles: true,
    softFarNeedles: true,
    // 杉の揃った裾と、松・雑木の丸い房を崩す。木の数と頂点数は増やさない。
    brokenNeedleTiers: true,
    unevenCrowns: true,
    // 遠い雑木の重複した頂点もそろえて動かし、樹冠の面を裂かない。
    closedFarCrowns: true,
    seed: 3,
    noticeRepeatGap: 30,
    // 実寸で置いた外周の砦にも歩いて入れる。既定の176mでは梯子の前で本陣側へ戻される。
    // 地面を足した範囲に収め、近景の地面や戦う兵は増やさない。
    moveLim: 4500,
    playerBounds: { minX: -4490, maxX: 2990, minZ: -1790, maxZ: 1790 },
    moveWay: honjinWay,
    runnerWay: honjinWay,   // 遠い使番も幕の口へ回り、壁を抜けない。
    blockedHint(rt) {
      if (rt.phase === 'wait') return '今は組のそばで待とう。合図が出たら進もう';
      if (rt.phase === 'assault' || rt.phase === 'honjin') return '柵や小屋を回ろう。本陣へは幕の開いた口から入れる';
      return '味方の列を横から回り、旗のそばへ進もう';
    },
    muddy: 0.85,     // 豪雨の後の山道はぬかるむ
    patchyGround: true,
    // 土塊の陰を塊の縁へ限り、坂一面を四角い敷石に見せない。
    softEarthCrust: true,
    // 泥の窪みは踏まれた所へ薄く残す。既存の絵と凹凸を使い、面を増やさない。
    subtleMudRelief: true,
    // 本陣へ踏み込む斜面は草原にせず、草の残る縁と荒れた地肌を混ぜる。
    // 共通の草の分布を使い、足元の房も地面の色とそろえる。
    groundCover(wx, wz) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      const field = Math.max(0, 1 - Math.abs(x - 8) / 105)
        * Math.max(0, Math.min(1, (-z - 8) / 35))
        * Math.max(0, Math.min(1, (z + 158) / 24));
      return 1 - field * 0.72;
    },
    paths: [APPROACH, HORSE_ROAD, TOKAIDO],
    height(wx, wz) {
      // 舞台の最初の高さを取る時に固定する。遅れて素材が届いても地面を替えない。
      if (!Object.hasOwn(this, '_okeDem')) this._okeDem = okeDem;
      const x = localX(wx, wz), z = localZ(wx, wz);
      let h = 6 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.018) + 3 * Math.sin(x * 0.05) * Math.sin(z * 0.043 + 1);
      h += 16 * gauss(x, z, -85, -10, 2600) + 12 * gauss(x, z, 80, 40, 3000) + 10 * gauss(x, z, 75, -60, 2200) + 9 * gauss(x, z, -70, 110, 2400);
      h += 6 * gauss(x, z, HONJIN.x, HONJIN.z, 1400) + 5 * gauss(x, z, -46, -34, 500);
      // 桶狭間山の本陣周辺の丘と谷。田楽窪の伝説地は北東の外周に分ける
      h += 9 * gauss(x, z, HONJIN.x - 58, HONJIN.z - 6, 900) + 10 * gauss(x, z, HONJIN.x + 60, HONJIN.z + 4, 1000);
      const d = distToPolyline(x, z, P1);
      h -= 4 * Math.exp(-(d * d) / 300);
      return okeHeight(this._okeDem, wx, wz, h);
    },
    clear: (wx, wz) => {
      const x = localX(wx, wz), z = localZ(wx, wz);
      return Math.hypot(x - HONJIN.x, z - HONJIN.z) < 28 || Math.hypot(x, z + 96) < 16 || Math.hypot(x - 40, z + 92) < 14 ||
      Math.hypot(x + 22, z + 118) < 16 || Math.hypot(x, z - 162) < 20 || (z < -30 && z > -66 && x > -50 && x < 36) || Math.hypot(x + 46, z + 34) < 10 ||
      Math.hypot(x - 124, z - 110) < 34;
    },   // 谷の村
    trees: 520,
    lightning: true,
    // 北を上にした位置図で東は正の x。公記の楠が東へ倒れた記述から西風を復元。
    // 接近路の曲がりに風を合わせず、織田の背から今川の顔へ吹きつける。
    rainDir: [1, 0],
    // 谷あいの小川と、東の谷の村の水路（要件：竹林・小川・水路・村）
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-70, -150], [-52, -96], [-60, -40], [-80, 20]].map(fieldPathPoint), w: 1.8, depth: 0.9 }, { pts: [[100, 80], [124, 108], [150, 140]].map(fieldPathPoint), w: 1.6, depth: 0.8 }],
    // 谷の田と畦（A036）：道と本陣のまわりを除いて水を張る
    hail: false,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(wx, wz) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      if (z > 110 || z < -76 || Math.abs(x) > 96 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 40 || (Math.abs(x) < 14 && z > 0)) return 0;
      if (distToPolyline(x, z, P1) < 5) return 0;
      // 一枚おきの池にせず、道の両側の谷に田を連ねる。谷幅と畦は少しずつずらす。
      const bend = Math.sin(z * 0.035) * 5;
      const valley = Math.min(Math.abs(x + 48 - bend) / 21, Math.abs(x - 54 - bend) / 18);
      if (valley >= 1) return 0;
      const fx = x + Math.sin(z * 0.025) * 2;
      const fz = z + Math.sin(x * 0.04) * 2;
      const ex = Math.min(((fx % 20) + 20) % 20, 20 - ((fx % 20) + 20) % 20);
      const ez = Math.min(((fz % 16) + 16) % 16, 16 - ((fz % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6, (1 - valley) * 6));
    },
    groves: [{ ...fieldPoint(132, 96), r: 10, n: 22 }, { ...fieldPoint(112, 124), r: 8, n: 16 }, { ...fieldPoint(-60, -70), r: 16, n: 26 }, { ...fieldPoint(55, -20), r: 18, n: 30 }, { ...fieldPoint(-50, 20), r: 14, n: 18 }, { ...fieldPoint(HONJIN.x - 58, HONJIN.z - 6), r: 16, n: 30 }, { ...fieldPoint(HONJIN.x + 62, HONJIN.z + 6), r: 16, n: 30 }],
    // 本陣のまわりは踏み荒らされて泥（雨の後）
    tint(wx, wz, h, c) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      const d = Math.hypot(x - HONJIN.x, z - HONJIN.z);
      if (d < 34) c.lerp({ r: 0.3, g: 0.26, b: 0.2 }, 0.45 * Math.min(1, (34 - d) / 12));
    },
  },
  setup(rt) {
    // 矢へ甲冑の拡大を重ねない。距離で縮尺が替わる甲冑の部品は避け、
    // 兵の根へ留める。飛翔中の長さ・命中・傷・寿命はそのまま使う。
    const pinArrow = rt.army.pinArrow;
    const arrowScale = new THREE.Vector3(), parentScale = new THREE.Vector3(), arrowAxis = new THREE.Vector3();
    rt.army.pinArrow = function (a, life, parent, support = null) {
      if (parent && !support) for (const u of this.units) {
        if (u.armorWear?.root === parent) { parent = u.mesh; break; }
      }
      if (parent) a.mesh.getWorldScale(arrowScale);
      const pinned = pinArrow.call(this, a, life, parent, support);
      if (pinned && parent) {
        parent.getWorldScale(parentScale);
        a.mesh.scale.copy(arrowScale).divide(parentScale);
        // 横向きの矢にも、柄の向きに沿う実際の倍率を使う。
        arrowAxis.set(0, 0, 1).applyQuaternion(a.mesh.quaternion).multiply(parentScale);
        const lengthScale = arrowAxis.length();
        if (lengthScale > 0) a.mesh.scale.z = arrowScale.z / lengthScale;
      }
      return pinned;
    };
    // 別置きの矢の札で任務を覆わない。この戦だけ既存の知らせ欄へ入れる。
    // 同じ文は八秒以上あけ、落ち終えた時と落下地点を離れた時には畳む。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
      if (rt.t - (rt.rainWarnT ?? -99) < 8) return;
      rt.rainWarnT = rt.t;
      rt.hud.notices.push('矢が来る！ 印の方へよける', 110, volley.T + 0.6, 'warn', () =>
        !rt.over && !rt.ended && rt.player.u.alive && volley.t < volley.T + 0.6 &&
        Math.hypot(rt.player.u.pos.x - volley.x, rt.player.u.pos.z - volley.z) < volley.r + 2);
    };
    // 足もとの追従する草も、この戦の房と同じ色にする。材質はこの世界の専用品。
    if (rt.world.nearGrass) rt.world.nearGrass.material.color.setHex(this.world.tuftTint);
    // 坂を壁と同じように抜くと、下の無地の遠景が白い破れに見える。
    // この戦の地面は残し、視点の潜り込みは既存の地形判定で防ぐ。
    rt.world.terrain.material.userData.camNearSolid = true;
    // 設営と荷運びで既に荒れた筋。直線の帯を敷かず、既存の踏み跡へ刻む。
    // 草の房も同じ跡で倒れ、戦闘中は兵の足でさらに泥が広がる。
    for (const side of [-1, 1]) {
      rt.world.stampTrail([[-18 + side * 0.8, -28], [-9 + side * 0.8, -48],
        [5 + side * 0.8, -69], [17 + side * 0.8, -91], [18 + side * 0.8, -105]]
        .map(fieldPathPoint), 0.85, 105);
      rt.world.stampTrail([[side * 43, -74], [side * 29, -88],
        [side * 18, -98], [18, -106]].map(fieldPathPoint), 2.1, 55);
    }
    // 携帯の横画面では、任務札がある間だけ重なる相手の一行を隠す。この戦を離れたら戻す。
    const taskStyle = document.createElement('style');
    taskStyle.textContent = `
    /* 下知と勝つ条件を先に読み、長い説明は釦を隠さず送れるようにする。 */
    #hud[data-oke-task] #intro:has(#intro-go) .intro-reading {
      display: block; width: 100%; padding-bottom: 16px;
      overflow-y: auto; pointer-events: auto; touch-action: pan-y;
      overscroll-behavior: contain; scrollbar-gutter: stable; scroll-padding-bottom: 16px;
    }
    #hud[data-oke-task] #intro .card .sides { letter-spacing: 0; line-height: 1.6; }
    #hud[data-oke-task] #intro .card .sides em { margin: 0 .4em; }
    /* 行き先の長い札は、末尾の一字だけを次の行へ残さない。 */
    #hud[data-oke-task] #markers .mk b { text-wrap: pretty; }
    @media (min-height: 501px) {
      /* 台詞と手当ての札は左上へ。右上の位置図と、左下の命・組の札を空ける。 */
      html:not(.touch) body #hud[data-oke-task] #battle-notices:not(.choosing),
      html:not(.touch) body #hud[data-oke-task].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        left: calc(16px + env(safe-area-inset-left, 0px)) !important;
        right: auto !important; top: 104px !important;
        width: min(320px, 32vw) !important;
        max-height: min(35vh, calc(100% - 112px - var(--notice-floor, 196px))) !important;
      }
      /* 接敵時の固定札も同じ欄に収め、帰陣の秒数や声を位置図へ重ねない。 */
      html:not(.touch) body #hud[data-oke-task].combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
        position: relative !important; inset: auto !important;
        width: 100% !important; max-width: 100% !important;
      }
      html body #hud[data-oke-task] #intro > .card.card {
        width: min(560px, calc(100vw - 32px));
        height: min(640px, calc(100dvh - 32px));
        max-height: calc(100dvh - 32px) !important;
      }
    }
    /* 出陣の札を閉じた後は、名乗りの黒帯で敵と上の情報を隠さない。 */
    #hud[data-oke-task]:has(#intro[hidden]) #cine i { height: 0 !important; }
    #hud[data-oke-task]:has(#intro[hidden]) .tl,
    #hud[data-oke-task]:has(#intro[hidden]) .tr,
    #hud[data-oke-task]:has(#intro[hidden]) #armybar,
    #hud[data-oke-task]:has(#intro[hidden]) #compass { opacity: 1; }
    #hud[data-oke-task].opening > #battle-log-entry { visibility: hidden; }
    /* 初めの旗を太い二重枠で隠さず、細い縁と小さなひし形で示す。 */
    #hud[data-oke-task] #battle-opening .opening-flag-frame {
      border-width: 1px; box-shadow: 0 0 0 1px #14120f;
    }
    #hud[data-oke-task] #battle-opening .opening-flag-frame::before { font-size: 24px; }
    #hud[data-oke-task] #objectives { border-left: 2px solid #c2a25a; }
    /* 地面の旗を追う札で、左下の命・傷の表示を覆わない。任務は知らせ欄に保つ。 */
    html body #hud[data-oke-task].single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order.ground-order:not(.expand) {
      position: relative !important; inset: auto !important;
      width: 100% !important; max-width: 100% !important; box-sizing: border-box;
    }
    /* 防ぐ操作と組の下知を分けて読む。済んだ任務や補足は広げた時だけ。 */
    html body #hud[data-oke-task]:is(.wait-guard-active,.guard-button-help) #battle-notices #objectives:not(.expand) #obj-list {
      display: block !important;
    }
    html body #hud[data-oke-task]:is(.wait-guard-active,.guard-button-help) #battle-notices #objectives:not(.expand) :is(h4,li:not(.cur),.tag,small,.obj-full,.victory-condition,.opb) {
      display: none !important;
    }
    html body #hud[data-oke-task].wait-guard-active #objectives:not(.expand) .battle-action { display: none !important; }
    html body #hud[data-oke-task].wait-guard-active #battle-notices #objectives:not(.expand) {
      display: block !important;
    }
    /* 防ぐ釦は攻撃釦の上へ。目線の高さに大札を置かず、兵と槍先を空ける。 */
    html.touch body #hud[data-oke-task] #wait-guard {
      top: auto; bottom: calc(112px + env(safe-area-inset-bottom, 0px));
      width: 208px; min-height: 72px; padding: 6px;
      grid-template-columns: 28px minmax(0, 1fr); column-gap: 6px; row-gap: 2px;
      border-width: 2px; border-radius: 10px;
    }
    html.touch body #hud[data-oke-task] #wait-guard svg:first-child { width: 28px; height: 40px; }
    /* 三列目の盾が暗黙の列を作ると、本文が細くなり札全体が縦に伸びる。 */
    html.touch body #hud[data-oke-task] #wait-guard svg + svg { display: none; }
    html.touch body #hud[data-oke-task] #wait-guard.release-ready svg + svg {
      display: block; grid-column: 1; grid-row: 1 / 3; width: 28px; height: 40px;
    }
    html.touch body #hud[data-oke-task] #wait-guard.release-ready svg:first-child { visibility: hidden; }
    html.touch body #hud[data-oke-task] #wait-guard span { font-size: max(18px, calc(18px * var(--text-scale, 1))); }
    html.touch body #hud[data-oke-task] #wait-guard small { font-size: max(13px, calc(13px * var(--text-scale, 1))); }
    html body #hud[data-oke-task] #battle-notices #objectives:not(.expand) li.cur .obj-now {
      font-size: max(20px, calc(20px * var(--text-scale, 1))) !important;
    }
    /* 接敵中の共通指定より優先し、操作の下にも今の任務を残す。 */
    html body #hud[data-oke-task].combat-brief #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list,
    html body #hud[data-oke-task].combat-brief.wait-guard-active #battle-notices:not(.choosing) #objectives.keep-guard-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
      display: block !important; margin-top: 4px;
    }
    /* 一覧だけを戻しても共通指定が本文を隠すため、下知の文字も一緒に戻す。 */
    html body #hud[data-oke-task].combat-brief #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
      display: block !important;
    }
    /* 退く時の任務と操作は同じ文。任務の一枚だけ残し、旗と兵を見る場所を空ける。 */
    html body #hud[data-oke-task].retreat-priority #objectives:not(.expand) .battle-action:not(:has(button)) {
      display: none !important;
    }
    /* 攻める間だけ目的を添える。退避・手当て中は逆向きの下知を残さない。 */
    html:root body #hud[data-oke-task][data-oke-combat-task]:not(.retreat-priority):not(.dodge-active) #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) #obj-list li.cur .obj-full {
      display: block !important; margin-top: 4px;
      font-size: max(16px, calc(16px * var(--text-scale, 1))) !important;
      color: #ece4d2; line-height: 1.5;
    }
    /* 下馬は押せる釦を保ち、同じ下馬の見出しと長い補足を重ねない。 */
    html:root body #hud[data-oke-task] #battle-notices:not(.choosing) #objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) #obj-list,
    html:root body #hud[data-oke-task] #battle-notices:not(.choosing) #objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) #obj-list li.cur .obj-text {
      display: block !important;
    }
    html body #hud[data-oke-task][data-oke-combat-task] #battle-notices:not(.choosing) #objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) li.cur small {
      display: none !important;
    }
    /* 帰陣は残り秒数の任務一枚で読む。押せる釦と危険時の構えの案内は保つ。 */
    html body #hud[data-oke-return]:not(.retreat-priority):not(.guard-button-help):not(.wait-guard-active) #objectives:not(.expand) .battle-action:not(:has(button)) {
      display: none !important;
    }
    html body #hud[data-oke-return]:not(.retreat-priority):not(.guard-button-help):not(.wait-guard-active) #battle-notices #objectives:not(.expand) #obj-list {
      display: block !important;
    }
    #hud[data-oke-task] #objectives .victory-condition { margin-bottom: 0; }
    /* 構える釦を敵の横へ切り離さず、下知と一緒に同じ欄で読む。 */
    html body #hud[data-oke-task].guard-button-help #battle-notices #objectives:not(.expand):has(.guard-action-button) {
      position: relative !important; inset: auto !important;
      display: flex !important; flex-direction: column;
      width: 100% !important; max-width: 100% !important;
      padding: 4px 8px !important; background: #14120f !important;
      border-left: 2px solid #c2a25a !important;
    }
    /* 大きな指示一つを右上で読む。構えの釦は同じ札の中に保つ。 */
    #hud[data-oke-task] .battle-action .guard-action-button { width: 100%; min-width: 0; font-size: max(24px, calc(24px * var(--text-scale, 1))); }
    /* 傷を狭い右欄へ押し込まず、命の見出しの下で一文として読む。 */
    html body #hud[data-oke-task] .bl #h-hp:has(em:not(:empty)) em {
      grid-column: 1 / -1; grid-row: 2; justify-self: start;
      min-width: 0; max-width: 100%; white-space: normal; line-height: 1.4;
    }
    html body #hud[data-oke-task] .bl #h-hp:has(em:not(:empty)) i { grid-row: 3; }
    /* 残り人数まで読めるよう、この戦の任務は文の高さで折り返す。 */
    #hud[data-oke-task] #battle-notices #objectives li.cur,
    #hud[data-oke-task] #battle-notices #objectives li.cur .obj-text,
    #hud[data-oke-task] #battle-notices #objectives li.cur .obj-now {
      height: auto !important; max-height: none !important;
      white-space: normal !important; overflow-wrap: anywhere;
      overflow: visible !important; text-overflow: clip; line-height: 1.5;
    }
    @media (max-height: 500px) {
      /* 横長の携帯でも勝つ条件を途中で切らず、本文と開始釦を同時に収める。 */
      html body #hud[data-oke-task] #intro > .card.card {
        width: min(620px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
        height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
        max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
      }
      #hud[data-oke-task] #intro .card .ttl {
        font-size: max(24px, calc(24px * var(--text-scale, 1))); line-height: 1.4; letter-spacing: .04em;
      }
      /* 任務二行と台詞三行を一緒に読める高さ。幅は保ち、中央の戦場を空ける。 */
      html.touch #hud[data-oke-task] #battle-notices:not(.choosing) {
        max-height: min(30vh, calc(100% - var(--notice-top) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px)))))) !important;
      }
      /* 「報せ○件」を四十四画素の数字用の枠へ押し込まない。 */
      html.touch #hud[data-oke-task] > #battle-log-entry {
        left: calc(8px + env(safe-area-inset-left, 0px)) !important;
        width: auto !important; min-width: 72px; min-height: 44px; padding: 2px 6px;
        font-size: max(12px, calc(12px * var(--text-scale, 1)));
      }
      /* 名札だけを上へ収める。小さな敵将の印は本人の頭上に保つ。 */
      html.touch #hud[data-oke-task] #boss:not(.symbol-only) {
        left: auto !important;
        right: calc(96px + env(safe-area-inset-right, 0px)) !important;
        top: calc(8px + env(safe-area-inset-top, 0px)) !important;
        bottom: auto !important; width: min(280px, calc(100vw - 376px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))) !important; max-width: none !important;
        transform: none !important; margin-top: 0 !important;
        padding: 4px 8px; box-sizing: border-box; background: #14120f; color: #ece4d2;
        font-size: max(12px, calc(12px * var(--text-scale, 1)));
      }
      /* 敵将の長い名札は任務札に重なる。頭上の印を残し、行動を読む場所を空ける。 */
      #hud[data-oke-task]:not(.no-objectives):has(#objectives:not([hidden]) .cur) :is(#target,#boss:not(.symbol-only)) { display: none !important; }
      /* 治療の札と今の任務を同じ欄で読めるよう、任務の補足は開いた時だけ出す。 */
      #hud[data-oke-task] #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small { display: none !important; }
      /* 帰陣だけは距離と合流までの秒数を残し、無人の場所で待たせない。 */
      html body #hud[data-oke-task][data-oke-return] #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur small { display: block !important; }
    }`;
    rt.hud.root.setAttribute('data-oke-task', '');
    rt.hud.root.removeAttribute('data-oke-return');
    rt.hud.root.appendChild(taskStyle);
    // 共通の声は、この戦の側で差し替える。使番へ渡す前にも整える。
    const words = (text) => String(text)
      .replace(/今川義元「討ち取ったり！」/g, '今川義元「うろたえるな！　陣を固めよ！」')
      .replace(/^囲まれた！\s*味方のいる所まで下がれ$/, '囲まれた！　敵を向き、構えて組の旗へ退け')
      .replace(/「(?:前へ進め！|道を開け！　本陣へ寄せるぞ！)」/g, (line) =>
        rt.flags.pursuitDone ? '「追うな！　帰る組の旗へ集まれ！」' : line);
    const say = rt.say, bark = rt.bark;
    rt.say = function (who, text, dur) {
      text = words(text);
      // そばにいる信長の肉声は本人の名で出す。遠い声は既存の距離判定で止める。
      return say.call(this, who, text, dur);
    };
    rt.bark = function (text, warn) { return bark.call(this, words(text), warn); };
    // 味方の深手を、本人への「危ない」と取り違えさせない。元の期限・判定を保つ。
    const notices = rt.hud.notices, noticePush = notices.push;
    notices.push = function (text, ...rest) {
      text = String(text).replace(/^危ない！\s*(.+)のそばへ。敵を押し返せ$/, '$1が危ない！　そばで守れ');
      return noticePush.call(this, text, ...rest);
    };
    // 使番の到着後を含め、実際に出す台詞を三分あける。札は別の時計を保つ。
    const recent = new Map(), hudSay = rt.hud.say, hudBark = rt.hud.bark, hudBanner = rt.hud.banner;
    const repeatOk = (text) => {
      const key = String(text).replace(/^[^「]*「|」$/g, '').replace(/[。！\s]/g, '');
      if (rt.t - (recent.get(key) ?? -Infinity) < 180) return false;
      recent.set(key, rt.t); return true;
    };
    rt.hud.say = function (who, text, dur, ...rest) {
      // 任務の鍵と急ぐ下知も渡す。段が替わった後まで古い案内を待たせない。
      text = words(text);
      if (repeatOk(text)) return hudSay.call(this, who, text, dur, ...rest);
      return false;
    };
    rt.hud.bark = function (text, warn) { text = words(text); if (repeatOk(text)) return hudBark.call(this, text, warn); };
    rt.hud.banner = function (title, sub, ...rest) {
      if (title === '一騎打ち') {
        if (rt.flags.duelHintShown) return;
        rt.flags.duelHintShown = true;
        title = '敵将と斬り合い';
        sub = '味方と構え、敵の振り終わりに突け';
      }
      return hudBanner.call(this, title, sub, ...rest);
    };
    const onKill = rt.onKill;
    rt.onKill = function (victim, killer) {
      const victoryCry = victim === this.flags.yoshimoto && killer === this.flags.nobKill?.[1];
      const call = !this.over && !this.flags.quiet && killer?.alive &&
        victim.team !== killer.team && !killer.isStruct && !killer.civ &&
        !victim.isStruct && !victim.civ && !victoryCry && (killer.killCryT ?? -99) + 8 <= this.t;
      // 敵側の肉声も抑える。毛利が義元を討った時だけ勝ち名乗りを通す。
      if (killer && !victoryCry) killer.killCryT = this.t;
      if (victoryCry) killer.killCryT = -Infinity;
      onKill.call(this, victim, killer);
      if (call) cryCaption(this, killer.pos, killer === this.flags.yoshimoto ?
        '今川義元「うろたえるな！　陣を固めよ！」' :
        `${killer.name || (killer.team === this.player.u.team ? '味方の兵' : '今川の兵')}「${killer.team === this.player.u.team ? this.flags.pursuitDone ? '追うな！　帰る組の旗へ集まれ！' : '道を開け！　本陣へ寄せるぞ！' : '陣を固めよ！'}」`);
    };
    // 未の刻ごろの豪雨。鉛色の雲の下でも、顔・具足・旗に昼の散乱光を回す。
    const rainWorld = rt.world, lookOf = rainWorld.lookOf;
    rainWorld.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'storm') {
        look.sky.setHex(0x929a9d); look.fog.setHex(0xa4abad); look.top.setHex(0x737f84);
        // 厚い雨雲の下で直射の影だけを濃くしない。明るさは空からの光で保つ。
        // 雨上がりと同じ午後の方角にし、晴れる間に影が反対へ回るのも防ぐ。
        look.sunDir.set(-45, 120, 45).normalize();
        look.sun.setHex(0xe2e4de); look.sunI = 0.3;
        look.hemiSky.setHex(0xd0d3cf); look.hemiGround.setHex(0x8a8376);
        look.hemiI = Math.max(look.hemiI, 2.7);
        look.cloudDark = 0.35;
      } else if (key === 'after') {
        // 公記の攻撃は未の刻。初夏の午後の高い南西の光とし、低い夕日の色を避ける。
        // 細かな太陽の位置は復元。既存の光の入れ物を使い、形や描画数は増やさない。
        look.sunDir.set(-45, 120, 45).normalize();
        look.sun.setHex(0xfff0d8); look.glowK = 0;
      }
      return look;
    };
    // 配列の窓を開戦時に縮める。雨量・雷・ぬかるみは保ち、毎コマ動かす雨筋を減らす。
    rainWorld.rainData = rainWorld.rainData.subarray(0, 720 * 3);
    // 跳ねも既存の配列の先頭だけを使う。地面を白い印で埋めず、更新も減らす。
    rainWorld.splash = rainWorld.splash.subarray(0, 160 * 3);
    rainWorld.splashT = rainWorld.splashT.subarray(0, 160);
    rainWorld.splashPts.geometry.setDrawRange(0, 160 * 6);
    rainWorld.splashPts.material.opacity = 0.22;
    // 手前の太い板状の雨は使わず、一画素の細い線だけにする。
    rainWorld.nearRain = rainWorld.nearRain.subarray(0, 0);
    rainWorld.rainNear.geometry.setDrawRange(0, 0);
    // 共通の天候更新は昼の豪雨の見通しを220mにするので、その後にこの戦だけ整える。
    // 近くの色を残し、遠景は霞ませる。硝煙・土ぼこりによる目隠しは保つ。
    const weatherUpdate = rainWorld.update;
    rainWorld.update = function (dt, focus) {
      weatherUpdate.call(this, dt, focus);
      const smoke = Math.min(1, (this.haze?.k || 0) + (this.dustVeil?.k || 0));
      const lift = (320 - 220) * this.rainLevel * (1 - smoke);
      this.vis += lift;
      // 小数部は雲の影に使うため、見通しは整数部だけ替える。
      this.scene.fog.far = Math.floor(this.vis) + (this.scene.fog.far % 1);
      this.mountU.vis.value = this.vis;
      this.rain.material.opacity = 0.18 * this.rainLevel;
    };
    // 初陣の打撃・同時に打ち込む人数は共通設定を保つ。倒れた後の救済は使わない。
    rt.firstFights = false; rt.flags.rescued = true;
    // 忍んで寄せる間は太鼓で進めと促さない。かかれの合図で解く。
    rt.flags.quiet = true;
    fieldSurroundings(rt);
    const scenery = fieldScenery(rt);
    const W = scenery.world;
    // 今川本陣：陣幕の内に床几と馬印、脇に旗竿・兵糧・馬の杭（義元と旗本は戦う兵で置く）
    const KT = nagashinojo.kit;
    const camp = KT.honjin(scenery, HONJIN.x, HONJIN.z, { mon: 'imagawa', w: 26, d: 18, gap: 10, people: false, tate: false });
    for (const [a, b] of [[4, 11.8], [24.2, 32]]) scenery.scene.add(okePalisade(W, a, b));
    okeCloth(camp, W);
    // 母衣だけの形を複製して使い回す。共有の甲冑や次の戦には書き込まない。
    rt.flags.horoShapes = new Map();
    const dispose = rt.world.dispose.bind(rt.world);
    rt.world.dispose = () => {
      for (const [original, copy] of rt.flags.horoShapes) if (original !== copy) copy.dispose();
      rt.flags.horoShapes.clear();
      rt.hud.say = hudSay; rt.hud.bark = hudBark; rt.hud.banner = hudBanner;
      notices.push = noticePush;
      taskStyle.remove(); rt.hud.root.removeAttribute('data-oke-task');
      rt.hud.root.removeAttribute('data-oke-return');
      rt.hud.root.removeAttribute('data-oke-combat-task');
      dispose();
    };
    // 本陣の脇に兵糧の俵
    scenery.scene.add(tawara(W, HONJIN.x - 16, HONJIN.z + 4, 0.3, 6), tawara(W, HONJIN.x + 16, HONJIN.z - 3, -0.5, 5));
    for (const [x, z] of [[6, -106], [30, -106], [4, -128], [32, -128]]) scenery.scene.add(nobori(W, x, z, 'imagawa', 6));
    // 今川の赤鳥の幟：白地に朱の赤鳥（櫛の形）。本陣の奥に混ぜる
    customFlag('akadori', (g) => {
      g.save(); g.fillStyle = g.strokeStyle = '#a8281c';
      g.translate(64, 84);
      g.beginPath(); g.ellipse(0, -8, 34, 16, 0, Math.PI, 0); g.lineTo(34, 2); g.lineTo(-34, 2); g.closePath(); g.fill();
      for (let i = 0; i < 15; i++) { const x = -31 + i * 4.4; g.fillRect(x, 2, 2.4, 26); }
      g.fillStyle = '#e8e2d2'; g.beginPath(); g.ellipse(0, -8, 22, 8, 0, Math.PI, 0); g.fill();
      g.restore();
    });
    for (const [x, z] of [[12, -132], [26, -132], [-2, -118]]) scenery.scene.add(nobori(W, x, z, 'akadori', 6.5));
    // 隊の中心へ攻め寄せた兵が焚火の当たりで止まらないよう、火は備えの脇に置く。
    // 円陣の中心（18, -114）と退く口も空ける。
    for (const [x, z] of [[-10, -96], [50, -92], [-32, -118], [10, -116]]) { scenery.scene.add(campfire(W, x, z)); rt.world.addFire(fieldX(x, z), fieldZ(x, z)); }
    // 推定配置の物置を接近路から西へ離し、幕の口と味方を見る場所を空ける。
    // 当たりも小屋と一緒に作る。行軍路・退き口・兵の配置は保つ。
    const storehouse = hut(W, -18, -112, 5, 3.5, 0.4,
      { wall: 0x857058, minka: false, groundedHome: true });
    // 室内のない物置は外から壁を抜かない。屋根だけが宙に残るのを防ぐ。
    // 共有材質を書き換えず、この一棟の壁と屋根にだけ同じ設定を使う。
    const storeMaterials = new Map(), outsideStore = { value: 0 };
    storehouse.traverse((m) => {
      if (!m.isMesh) return;
      const source = m.material;
      if (!storeMaterials.has(source)) storeMaterials.set(source, cloneRoomNearMaterial(source, outsideStore));
      m.material = storeMaterials.get(source);
    });
    scenery.scene.add(storehouse);
    // 義元の塗輿：本陣の幕の内、床几の脇に据えてある
    rt.flags.koshi = okeKoshi(W, HONJIN.x + 5, HONJIN.z - 3, 0.3);
    scenery.scene.add(rt.flags.koshi);

    // 味方の行軍（先手・一の組・自分の槍組・後備）
    // 釜ヶ谷を思わせる林の低地から、十六歩ほど隠れて寄せる（場所・距離は推定）。
    // この戦だけ預かる小組。足軽は三人、組頭候補以上と主君は五人を率いる。
    // 元の槍組から分け、実兵の総数と組頭について進む任務は保つ。
    const squadN = rt.G.lord || rt.G.rank > 0 ? 5 : 3;
    const finals = [[-28, -52], [12, -52], [-8, -46], [-22, -38]];
    const specs = [
      { name: '織田の先手', n: 19 },
      { name: '織田の一の組', n: 20 },
      { name: '織田の槍組', n: 10 - squadN },
      { name: '織田の後備', n: 18 },
    ];
    rt.flags.cols = [];
    specs.forEach((sp, i) => {
      const [sx, sz] = finals[i];
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: sp.name, anchor: fieldPoint(sx, sz + 16), facing: Math.PI + FIELD_TURN, formation: 'column', spacing: 1.4, order: 'hold', speed: 3.0, morale: 100, noRout: true, fleeDir: fieldVector(0, 1) },
        [{ type: 'samurai', n: 1, o: { name: '' } }, { type: 'ashigaru', n: sp.n }]);
      g.leader = g.units[0];
      g.path = [[sx, sz + 16], [sx, sz]].map(fieldPathPoint); g.pathIdx = 0;
      if (i === 2) {
        // 列を細くし、背中と槍が正面に重なりにくくする。
        g.colW = 3;
        rt.flags.genpachi = g.units[0];
        rt.flags.yashichi = g.units[1];
        // 組頭と足軽にも、普通の兵と同じ死傷がある。
        rt.hostGroup = g;
      }
      if (i === 0) rt.flags.yohei = g.units[0];
      g.onArrive = (gg) => { gg.arrived = true; gg.order = 'hold'; gg.formation = 'yari'; gg.facing = Math.PI + FIELD_TURN; };
      rt.flags.cols.push(g);
    });
    const squadAt = rt.G.lord ? fieldPoint(-44, 13) : fieldPoint(-12, -20);
    // 預かり兵を名簿の家来に置き換えず、槍だけの小組にする。
    // 行軍の列には加えない。列の下知で自分の号令を上書きしないため。
    rt.makeSquad(squadAt, Math.PI + FIELD_TURN, [{ kind: 'spear', n: squadN, members: [] }]);
    rt.flags.okeSquadN = squadN;
    // 信長の馬廻
    const nob = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: '馬廻', anchor: fieldPoint(-44, 2), facing: Math.PI + FIELD_TURN, formation: 'column', order: 'hold', speed: 3.3, noRout: true },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, flag: 'eiraku', horse: true, haori: 0x7a1d14 } }]), { type: 'samurai', n: 1, o: { name: '服部小平太', flag: 'eiraku', invuln: true, horse: false } }, { type: 'samurai', n: 1, o: { name: '毛利新介', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '前田利家', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '木下雅楽助', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '中川金右衛門', flag: 'eiraku', invuln: true, horse: false } }, { type: 'samurai', n: 12, o: { flag: 'eiraku', horse: false } }]);
    nob.path = [[-44, 2], [-44, -30]].map(fieldPathPoint);
    nob.onArrive = (g) => { g.order = 'hold'; g.formation = 'line'; g.facing = Math.PI + FIELD_TURN; };
    rt.flags.nob = nob;
    rt.flags.nobKill = [nob.units.find((u) => u.name === '服部小平太'), nob.units.find((u) => u.name === '毛利新介')];
    const hat = rt.flags.nobKill[0];
    if (hat) {
      // 接触した相手の実際の打撃で手傷を負う。時刻だけでは傷を作らない。
      hat.allyOk = true;
      rt.flags.hattoriWound = hat.onWound = (src) => {
        const hit = hat.lastHit;
        hat.onWound = null;
        rt.army.generalWounded(hat, src);
        // 共通の退場処理が胴の傷に置き換えるため、実際の命中部位を戻す。
        if (hit && hat.hit) {
          hat.hit.part = hit.part; hat.hit.res = hit.res; hat.hit.wkind = hit.wkind;
          hat.hit.from = hit.from; hat.hit.side = hit.side;
          hat.lastHit = hat.hit;
        }
        const y = rt.flags.yoshimoto;
        if (y && src?.pos && src.group === rt.flags.hatamoto &&
            Math.hypot(hat.pos.x - y.pos.x, hat.pos.z - y.pos.z) < 6) {
          rt.flags.hattoriMet = true; rt.flags.hattoriWounded = true;
          const legCut = src === y && hit && (hit.part === 'leg' || hit.part === 'thigh') && src.weapon === 'sword' && hit.res !== 'armor';
          rt.flags.hattoriLegCut = !!legCut;
          // 義元が刀で膝を斬った細部は後世の伝承。戦中は実際の手傷だけを知らせる。
          if (sightPoint(rt, hat.pos)) rt.bark('服部が手傷を負って退く。毛利が代わって寄せる');
        }
      };
    }
    rt.flags.attackers = [...rt.flags.cols, nob];
    // 信長の馬印（金の扇）は、馬印持ちが信長の後ろについて運ぶ
    if (!rt.G.lord && nob.units[0]) rt.flags.uma = umaFollow(rt.world, rt.scene, nob.units[0], 'kasa');

    // 今川勢（休息中）
    const E = rt.flags.enemies = [];
    // 前の備えの無名の侍を一騎ずつ騎乗させる補完。討たれれば空馬が残る（実兵数は変えない）。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(0, -96), facing: FIELD_TURN, morale: 85, fleeDir: fieldVector(0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 8 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -92), facing: (-0.4) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 4 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-22, -118), facing: (0.3) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.5, -1), aggro: 7 }, [{ type: 'busho', n: 1, o: { name: '松井宗信' } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]));
    // 本陣の両脇と後方で休む組。近い敵へ備えを向ける。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -124), facing: (-0.8) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-4, -134), facing: (0.2) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'bow', n: 2 }]));
    // 義元が刀で戦う姿は後世の伝承を借りた補い。武将の既定の騎乗を使わない。
    const H = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '義元の旗本', formation: 'ring', yariRanks: 3, width: 12, anchor: fieldPoint(HONJIN.x, HONJIN.z + 2), facing: FIELD_TURN, morale: 100, fleeDir: fieldVector(0, -1), aggro: 6, noRout: true, spacing: 1.8 },
      [{ type: 'busho', n: 1, o: { name: '今川義元', horse: false, invuln: true, noHead: true, flagScale: 1.4 } }, { type: 'busho', n: 1, o: { name: '山田新右衛門', horse: false } }, { type: 'samurai', n: 29, o: { hp: 55, maxHp: 55 } }]);
    rt.flags.yoshimoto = H.units[0];
    // 義元は主人公だけでなく味方の槍でも傷つく。首を挙げる筋は毛利新介へ結ぶ。
    H.units[0].allyOk = true;
    H.units[0].onWound = () => {
      if (rt.flags.yoshiDown) return;
      rt.flags.yoshiDown = true; rt.flags.yoshiDownT = rt.t;
      const y = H.units[0];
      y.target = null; y.atk = null; y.swing = null;
      y.hit = { kind: 'kneel', t: 0, dur: 1.2, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' };
      y.lastHit = y.hit;
      if (sightPoint(rt, y.pos)) rt.bark('義元が深手を負った。旗本が囲んで支えている。味方と囲みを崩せ');
    };
    rt.flags.hatamoto = H;
    rt.flags.guardStart = H.units.filter((u) => u !== H.units[0] && readyUnit(u)).length;
    H.guard = true;
    // 義元の出る位置は円陣の中央のまま。旗本は歩いて三列へ展開する。
    H.formation = 'yari';
    // 幕の前で三列に構え、近づく敵へ踏み出す。退く間は円陣へ戻す。
    H.guardSight = 24; H.guardLeash = 6; H.seekRange = 12;
    H.defMult = 1;
    for (const g of E) { g.guard = true; g.guardSight = 32; g.guardLeash = 12; g.fire = false; }
    E.push(H);
    // 本陣前・右・左の備えから十八人を道へ分ける遊びの補完。増援を湧かせない。
    // 最初の六人は谷の出口手前の見張り。行軍中の小競り合いも遊びの補完。
    // 本陣への攻めは空が晴れてから信長の合図を待つ。
    // 出陣位置から三十五メートルほど離し、下知を読む前の斬り合いを避ける。
    // 同じ六人が行軍後に歩いて寄せる。合図や本陣の守りは変えない。
    rt.flags.road = [[-12, -60], [2, -80], [18, -96]].map(([x, z], i) => {
      const g = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa',
        name: '谷の守り' + ['一の組', '二の組', '三の組'][i], formation: 'yari',
        spacing: 1.3, width: 6, anchor: fieldPoint(x, z), facing: FIELD_TURN,
        morale: 70, aggro: 0, fleeDir: fieldVector(0, -1) },
        [{ type: 'ashigaru', n: 4 }, { type: 'ashigaru', n: 2, o: { weapon: 'sword', reach: 1.75 } }]);
      E.push(g);
      return g;
    });
    rt.flags.roadStep = -1;

    // 主君で遊ぶ時も、所在が確定していない者から義元の居場所を聞かせない。
    if (rt.G.lord) {
      rt.flags.nobSeen = true;
      rt.setPhase('brief');
      rt.world.setTime('storm'); rt.world.setRainTarget(1);
      rt.obj('honjin0', '馬廻の旗に続け。攻めるのは雨が上がってから', 'main');
      localSay(rt, rt.player.u, '織田信長', '首も分捕りも捨て置け。雨が上がってから攻めるぞ', 4);
      rt.after(4, () => this.brief(rt));
    } else {
    rt.banner('丸根・鷲津の砦が落ちた', '昼までは今川の優勢。近づいた信長勢に、激しい雨が降る');
    rt.obj('talk', '組頭の旗へ進み、下知を聞け', 'main');
    rt.marker('genpachi', unitPos(rt.flags.genpachi), '組頭・組の旗', { person: true, guideFlag: true, group: rt.hostGroup });
    rt.addInteract('talk', unitPos(rt.flags.genpachi), '下知を聞く', () => this.brief(rt), { r: 3.5 });
    rt.setPhase('brief');
    rt.world.setTime('storm'); rt.world.setRainTarget(1);
    localSay(rt, rt.flags.yashichi, '組の足軽', `おう、${nm(rt)}。ここで尾張を守るぞ。まずは組頭の旗へ行け`, 4);
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { honjin: 'HIST_B', oketaniTerrain: 'HIST_B', rain: 'HIST_A', nakajimaFort: 'HIST_B', distantArmies: 'GAME_C', takane: 'HIST_B', denrakutsubo: 'HIST_B', kamagaya: 'HIST_B', baggage: 'GAME_C', villageStream: 'GAME_C' };
    // 今川の小荷駄（本陣の北の窪みに荷車と俵。遠景の隊と荷）
    const baggage = DA0(rt, scenery);
    // 本陣周辺六千のうち、戦う範囲の外にいる控えを軽く描く。大高の別働勢は置かない。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, fieldX(x, z), fieldZ(x, z), w, d, count, facing + FIELD_TURN, armor, flag, seed, kind);
    rt.flags.imaDA = [DA(-20, -210, 70, 16, 300, 0, 0x3f2a24, 'imagawa', 3, 'mixed')];
    [[82, -180, 32, 16, 180, -0.3, 'spear'], [-72, -170, 30, 20, 160, 0.4, 'mixed']]
      .forEach(([x, z, w, d, n, f, kind], i) => rt.flags.imaDA.push(DA(x, z, w, d, kind === 'cavalry' ? 110 : n, f, i % 2 ? 0x3a3026 : 0x3f2a24, 'imagawa', 11 + i, kind)));
    // 荷の護衛も知らせを受けて退く。近づけば既存の総枠で本物へ替わる。
    rt.flags.imaDA.push(baggage);
    // 奥の控えと荷駄は本物へ替えない。迷って本陣の後ろへ寄ると、今川が百人以上湧いて250人の枠を超えた（10/7）。
    for (const m of rt.flags.imaDA) m.army.noWake = true;
    // 落ちた丸根・鷲津の煙のそばと大高方面に、別働の槍列を分ける。
    // 人数・細かな持ち場と移動は遊びの補い。本陣周辺六千の表示には足さない。
    rt.flags.detached = [[-2298, 593], [-2898, 293], [-3498, 803]].map(([x, z], i) => {
      const m = rt.world.addDistantArmy({ x, z, w: 22, d: 10, count: 72, facing: -Math.PI / 2,
        armor: 0x3f2a24, mon: 'imagawa', seed: 151 + i, kind: 'spear', host: false });
      m.army.hist = 'GAME_C';
      m.advance(18, 36 + i * 6);
      return m;
    });
    // 織田の後詰（善照寺砦の方）
    rt.flags.jinSaku = KT.farHost(rt, ZENSHOJI.x, ZENSHOJI.z, 30, 40, 80, Math.PI + FIELD_TURN, 0x2b3140, 'oda', 4, 'spear');
    // 織田の本隊（二千ほど）：行軍が始まると、組の後ろから山あいの道を続いてくる
    rt.flags.far = [];
    for (let i = 0; i < 8; i++) {
      const q = farArmy(rt, fieldX(0, 200), fieldZ(0, 200), 5, 12, 36, FIELD_TURN, 0x2b3140, i % 3 === 1 ? 'eiraku' : 'oda', 70 + i);
      const side = i % 2 ? 3 : -3;
      // 道の途中（組が待つ谷の手前）で止まる。組の待つ所を通り抜けて、戦う兵と重ならないように
      q.path = [[side, 200], ...P1.filter(([, z]) => z > -20).map(([x, z]) => [x + side, z]), [-36 + (i % 4) * 14, -18 + Math.floor(i / 4) * 12]];
      q.s = -i * 14;   // 間をあけて続く
      q.m.visible = false;
      // 行き来する本隊を本物の兵へ替えない（250人の枠を守る。帰り道で味方が湧かない）。
      q.a.noWake = true;
      rt.flags.far.push(q);
    }
    // 本陣の左右でも、ほかの織田の組が今川の備えと組み合う（軽い作り。兵の数・任務には数えない）。
    // 接近路の小隊で止まっても、その両脇から本陣へ続く押し合いを中景に残す。
    // 二隊の人数・幅・列の密度を保ったまま手前へ寄せる。至近の非表示範囲も保つ。
    rt.flags.wings = [[-46, -76, 0.12, 191], [54, -76, -0.12, 192]].map(([x, z, f, seed]) => clash(rt, {
      ...fieldPoint(x, z), facing: Math.PI + FIELD_TURN + f, w: 40, gap0: 44, closeSpeed: 2.6, seed, noRout: true, killRate: 0.1,
      gap: 2.8, measuredMelee: true, // 人数と前線の幅を保ち、槍列の間合いを詰めて突き・受け・引きを使う。
      groundedMelee: true, // 雨後の泥跳ね・膝からの崩れ・塊ごとに伝わる敗走。
      A: { flag: 'oda', armor: 0x2b3140, count: 220 },
      B: { flag: 'imagawa', armor: 0x3f2a24, count: 300, bows: true, flagRate: 0.5 } }));
    scenery.finish();
    buildBattleJin(rt);
    // 名のない敵の仮名は、この戦だけの名簿から選ぶ。実在の武将の名は保つ。
    const foeNames = ['源六', '平八', '彦七', '新八', '又六', '弥三郎', '喜助', '弥五郎']
      .filter((name) => name !== rt.G.name && name !== nm(rt));
    for (const g of E) for (const u of g.units) {
      if (!u.name && u.type === 'samurai') u.name = foeNames[u.id % foeNames.length];
    }
    // 備え表の共通接続で槍列へ戻される旗本を、義元中心の囲みへ戻す。
    H.formation = 'ring'; H.leader = rt.flags.yoshimoto;
    for (let i = 0; i < H.units.length; i++) {
      const u = H.units[i], q = H.slotPos(i, H.initial);
      u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z); u.mesh.position.copy(u.pos);
    }
    for (let i = 0; i < rt.flags.attackers.length; i++) {
      const g = rt.flags.attackers[i];
      g.yariRanks = 3; g.okeSide = [-12, 12, 0, -6, 4][i]; g.okeBack = i === 4 ? 9 : 3;
    }
  },

  // 軽い本隊は行軍だけを表す。接触域へは押し込まず、実兵と重ねない。
  moveFar(rt, dt) {
    if (rt.phase !== 'march' && !rt.flags.victory) return;
    for (const q of rt.flags.far) {
      if (rt.flags.victory && q.returnWaiting) continue;
      if (!q.done) q.s += dt * 2.5;
      // 入れ物は隊ごとに一つ。毎コマ位置の物を作らない。
      const p = q.walk || (q.walk = { x: 0, z: 0, h: 0, end: false });
      let left = Math.max(0, q.s);
      for (let i = 1; i < q.path.length; i++) {
        const a = q.path[i - 1], b = q.path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length || i === q.path.length - 1) {
          const k = length > 0 ? Math.min(1, left / length) : 1;
          p.x = a[0] + (b[0] - a[0]) * k; p.z = a[1] + (b[1] - a[1]) * k;
          p.h = Math.atan2(b[0] - a[0], b[1] - a[1]); p.end = left >= length && i === q.path.length - 1;
          break;
        }
        left -= length;
      }
      q.done = p.end; q.m.visible = q.s > 0;
      moveFar(rt, q, fieldX(p.x, p.z), fieldZ(p.x, p.z), (p.end ? rt.flags.victory ? 0 : Math.PI : p.h) + FIELD_TURN);
    }
  },
  brief(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief' || rt.flags.briefed) return;
    rt.flags.briefed = true;
    rt.uninteract('talk'); rt.unmark('genpachi'); rt.objDone('talk');
    if (!rt.G.lord) localSay(rt, rt.hostGroup, '仲間', '味方の旗について進もう', 4);
    rt.after(3, () => this.startMarch(rt));
  },
  startMarch(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief') return;
    rt.setPhase('march'); rt.flags.marchBegan = rt.t; rt.objRemove('talk'); rt.objRemove('honjin0');
    this.marchFlag(rt);
    localSay(rt, rt.hostGroup, '仲間', '林のかげを進もう', 4);
    // 合図で移し直さず、同じ兵が林の低地から歩いて接近する。
    for (const g of rt.flags.cols) { g.arrived = false; g.order = 'path'; g.pathIdx = 0; }
    rt.flags.nob.order = 'path'; rt.flags.nob.pathIdx = 0;
    // 豪雨の間は遠くの列に気づきにくい。至近の敵には普段どおり応戦する。
    for (const g of rt.flags.enemies) g.guardSight = 16;
    rt.flags.rain = true; rt.world.setTime('storm'); rt.world.setRainTarget(1);
    rt.banner('雨の谷を進む', '味方の旗に続け。見張りが来たら、組と迎え撃て');
    this.march(rt);
  },
  marchFlag(rt) {
    rt.obj('col', '組の旗に続け。見張りには構えよ', 'main');
    rt.marker('genpachi', () => {
      const g = rt.hostGroup, s = g.stds && g.stds[0], u = s && s.userData.carrier;
      return u && u.alive ? u.pos : g.count ? g.center() : null;
    }, '組の旗', { guideFlag: true, group: rt.hostGroup });
  },
  update(rt, dt) {
    const F = rt.flags;
    const combatTask = rt.phase === 'assault' && !!F.entered && !F.victory && !rt.over && !F.ending &&
      !retreatRequired(rt) && !rt.dodgeGuide && !(rt.hud.retreatGuide?.active && rt.hud.retreatGuide.valid);
    if (F.combatTaskShown !== combatTask) {
      F.combatTaskShown = combatTask;
      rt.hud.root.toggleAttribute('data-oke-combat-task', combatTask);
    }
    if (F.uma) F.uma.update(dt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    this.horoDetail(rt);
    if (rt.phase === 'brief' && rt.t > 6) this.brief(rt);
    nagashinojo.kit.backTick(rt);
    this.guideBack(rt);
    this.moveFar(rt, dt);
    if (rt.phase === 'march') this.march(rt, dt);
    else if (rt.phase === 'wait') this.wait(rt);
    else if (rt.phase === 'assault') this.assault(rt, dt);
    this.clearOldSpeech(rt);
    this.scoutGuide(rt);
  },
  // 雨の行軍の声は記録に残すが、攻め始めてから「晴れるのを待て」と読まない。
  clearOldSpeech(rt) {
    const F = rt.flags, hud = rt.hud;
    if (rt.t < (F.speechCheckAt || 0)) return;
    F.speechCheckAt = rt.t + 0.5;
    const beforeAttack = rt.phase === 'brief' || rt.phase === 'march' || rt.phase === 'wait';
    const fighting = beforeAttack && !!rt.army.nearestEnemy(rt.player.u, 16, readyUnit);
    const stale = (line) => {
      const text = line.text;
      // 寄せの予告は接敵したら終わり。隠れていた字幕も、本陣まで持ち越さない。
      if (/道の見張りが来るぞ/.test(text) &&
          (!beforeAttack || F.scoutEngaged || rt.t - F.marchBegan > 14)) return true;
      // 討取り前の声を帰陣中まで持ち越さない。履歴と新しい帰陣の声は残す。
      if (F.victory && /この囲みを抜くぞ|義元へは、この新介がかかる|毛利新介が義元へ斬りかかる/.test(text)) return true;
      if (rt.phase !== 'brief' && /まずは組頭の旗へ|ここで尾張を守るぞ/.test(text)) return true;
      // 開戦前の励ましは記録に残す。斬り合いや急襲が始まったら今の下知を先に読む。
      if ((!beforeAttack || fighting) && /殿のお言葉じゃ|敵は夜通し歩いて|こちらは新手ぞ/.test(text)) return true;
      if (!beforeAttack && /林の陰を進め|谷の出口で|空が晴れ|合図を待|攻めるのは殿の合図|石や氷を投げ/.test(text)) return true;
      return fighting && /まずは組頭の旗へ|林の陰を進め|谷の出口で|合図を待|空が晴れ|身を低く|雨が上がるのを待|雨が上がってから/.test(text);
    };
    for (let i = hud.subQ.length - 1; i >= 0; i--) if (stale(hud.subQ[i])) hud.subQ.splice(i, 1);
    if (hud.shownLine && stale(hud.shownLine)) {
      hud.nextSub(); hud.shownLine = null; hud.subT = 0;
    }
  },
  // 携帯では補足が閉じているので、見張りと斬り合う間は任務の一行で構えを教える。
  // 下知や達成条件は替えず、半秒ごとに今いる相手だけを見る。
  scoutGuide(rt) {
    const F = rt.flags;
    if ((rt.phase !== 'brief' && rt.phase !== 'march' && rt.phase !== 'wait') || rt.t < (F.scoutGuideAt || 0)) return;
    F.scoutGuideAt = rt.t + 0.5;
    // 遠い見張りだけで「迎え撃て」に替えず、近い斬り合いの時に構えを教える。
    let fighting = !!rt.army.nearestEnemy(rt.player.u, F.scoutFighting ? 10 : 8, readyUnit);
    // 雨で遠目の探索が止まっても、方角の札が出る至近の敵には構えを案内する。
    if (!fighting) for (const u of rt.army.units) {
      if (u.team === rt.player.u.team || !readyUnit(u) || u.civ || u.isStruct || u.playerOpeningBlocked) continue;
      if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < this.nearThreatRange &&
          !rt.army.wallBetween(u.pos, -1, rt.player.u.pos) && !rt.army.terrainBlocks(u.pos, rt.player.u.pos)) {
        fighting = true; break;
      }
    }
    F.scoutFighting = fighting;
    const id = rt.phase === 'brief' ? 'talk' : rt.phase === 'march' ? 'col' : 'wait';
    const text = rt.player.u.mobbed ? '敵を向き、構えて組の旗へ退け' : fighting ? '組のそばで構え、敵の振り終わりに突け' :
      rt.phase === 'brief' ? '組頭の旗へ進み、下知を聞け' :
      rt.phase === 'march' ? '組の旗に続け。敵が来たら構えよ' :
      F.clear ? '雨が上がった。組の旗で合図を待て' : '組の旗で雨が上がるのを待て';
    const objective = rt.objectives.find((o) => o.id === id && !o.state);
    if (objective && objective.text !== text) rt.obj(id, text, 'main', true);
    if (fighting) rt.objProgress(id, '敵の「！」に合わせて構え、味方と迎え撃て。本陣へは合図を待て');
  },
  // 遅れて届く骨の入った人にも、一秒に一度、新しい形だけ布の仕立てを足す。
  horoDetail(rt) {
    const F = rt.flags;
    if (!F.horoShapes || rt.t < (F.horoAt || 0)) return;
    F.horoAt = rt.t + 1;
    const dress = (m) => {
      const original = m.geometry, UV = original?.attributes.uv, N = original?.attributes.normal;
      if (!UV || !N || m.material?.map !== UNIT_MAT.map) return;
      if (F.horoShapes.has(original)) { m.geometry = F.horoShapes.get(original); return; }
      let hasCloth = false;
      for (let i = 0; i < UV.count; i++) if (UV.getX(i) > 0.75 && UV.getX(i) < 0.875 && UV.getY(i) > 0 && UV.getY(i) < 0.25) { hasCloth = true; break; }
      if (!hasCloth) { F.horoShapes.set(original, original); return; }
      const copy = original.clone(), P = copy.attributes.position;
      for (let i = 0; i < UV.count; i++) {
        const u = (UV.getX(i) - 0.75) * 8, t = UV.getY(i) * 4;
        if (u <= 0 || u >= 1 || t < 0 || t > 1) continue;
        const seam = Math.pow(Math.abs(Math.cos(u * Math.PI * 12)), 8);
        const fold = -0.012 * seam + (t > 0.9 ? 0.018 : 0);
        P.setXYZ(i, P.getX(i) + N.getX(i) * fold, P.getY(i) + N.getY(i) * fold - Math.pow(t, 8) * 0.025, P.getZ(i) + N.getZ(i) * fold);
      }
      copy.computeVertexNormals(); copy.computeBoundingSphere();
      F.horoShapes.set(original, copy); F.horoShapes.set(copy, copy); m.geometry = copy;
    };
    for (const u of rt.army.units) if (u.look?.horo && !u.gone) {
      u.mesh?.traverse(dress); u.human?.root?.traverse(dress);
    }
  },
  // 半秒に一度だけ距離を見る。戦う兵や、毎コマの入れ物は増やさない。
  guideBack(rt) {
    const F = rt.flags;
    if (F.victory && F.guideWarn) { F.guideWarn = ''; rt.objRemove('oke-back'); rt.unmark('oke-back'); }
    if (rt.G.lord || F.victory || rt.t < (F.guideAt || 0)) return;
    F.guideAt = rt.t + 0.5;
    const host = readyGroup(rt.hostGroup) ? rt.hostGroup : F.attackers.find(readyGroup);
    if (!host) return;
    const target = F.guidePos || (F.guidePos = { x: 0, z: 0 });
    let x = 0, z = 0, n = 0;
    for (const u of host.units) if (readyUnit(u)) { x += u.pos.x; z += u.pos.z; n++; }
    target.x = x / n; target.z = z / n;
    const u = rt.player.u, d = Math.hypot(target.x - u.pos.x, target.z - u.pos.z);
    const hurt = u.hp < u.maxHp * 0.65 && !!rt.army.nearestEnemy(u, 12);
    const warn = d > (F.guideWarn ? 18 : 24) || hurt;
    if (warn) {
      const text = hurt ? '傷が深い。敵を向き、味方の列へ退け' : '組の旗へ戻れ。味方と進め';
      if (F.guideWarn !== text) {
        rt.obj('oke-back', text, 'side');
        if (!F.guideWarn) rt.marker('oke-back', () => F.guidePos, 'ここへ戻る・味方の列');
        F.guideWarn = text;
        rt.bark(text, hurt);
      }
    } else if (F.guideWarn) {
      F.guideWarn = ''; rt.objRemove('oke-back'); rt.unmark('oke-back');
    }
  },
  march(rt, dt = 0) {
    const F = rt.flags, host = rt.hostGroup;
    const c = readyGroup(host) ? host.center() : null, p = rt.player.u.pos;
    const distance = c ? Math.hypot(c.x - p.x, c.z - p.z) : Infinity;
    this.scout(rt);
    F.marchAwayT = distance > 24 ? (F.marchAwayT || 0) + dt : 0;
    if (!F.marchFollowNotice && rt.t >= 15 && distance > 8) {
      F.marchFollowNotice = true;
      rt.bark('組が先へ進む。旗について進め');
    }
    if (rt.pt >= 120 && rt.canFailMission() && !readyGroup(host)) {
      F.ending = true; rt.tracker.main = false; rt.objFail('col'); rt.unmark('genpachi');
      rt.obj('retreat', '組が崩れた。残る味方と砦の方へ退け', 'main');
      for (const g of F.cols) if (g.count && !g.routed) {
        g.order = 'path'; g.path = P1.slice().reverse().map(fieldPathPoint); g.pathIdx = 0;
        g.formation = 'column'; g.onArrive = (q) => { q.order = 'hold'; };
      }
      rt.banner('組を失い、急襲へ進めず'); rt.finish({ failureReason: '組の旗について進む任務に失敗した。組が崩れ、谷の出口へ進めなかった。味方の列のそばで戦おう。' }, 7); return;
    }
    // 札を読む猶予を残す。組から二分離れ続けた時だけ置き去りとする。
    // 組のそばで道が詰まった場合も、三分は待ってから攻めを止める。
    if (F.marchAwayT >= 120 || (distance <= 24 && rt.pt > 180)) {
      F.ending = true; rt.tracker.main = false; rt.objFail('col'); rt.unmark('genpachi');
      rt.banner('谷の出口へ届かず', '残る組と元の道へ退く'); rt.finish({ failureReason: distance > 24 ? '組の旗について進む任務に失敗した。組から離れ続け、谷の出口へ合流できなかった。組の旗と戻る印へ向かおう。' : '組の旗について進む任務に失敗した。谷の出口へ進めず、攻める合図に間に合わなかった。道を空け、組の旗に続こう。' }, 7); return;
    }
    if (host?.arrived && rt.t >= (F.marchNoticeAt || 0)) {
      F.marchNoticeAt = rt.t + 1;
      const late = F.cols.find((g) => g.count && !g.routed && !g.arrived && g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget));
      rt.objProgress('col', distance > 16 ? `組の旗まで ${Math.round(distance)}歩ほど。旗について進め` : late ? `${late.name}が谷を抜けるまで、組の旗の下で構えよ` : '組の旗の下で構えよ');
    }
    if (distance <= 24 && host?.arrived && F.cols.every((g) => !g.count || g.routed || g.arrived || g.units.every((u) => !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget))) {
      rt.setPhase('wait'); rt.objRemove('col');
      rt.obj('wait', '組の旗で待て。雨が上がり、合図が出たら進め', 'main');
      // 下知を待つ場所だけを固定して示す。隊や兵の動きには触れない。
      const standard = host.stds?.[0]?.userData.carrier;
      const hold = standard?.alive ? standard.pos : host.center();
      rt.marker('wait', { x: hold.x, y: hold.y, z: hold.z }, '組の旗で待つ場所', { guideArea: 'wait', guideFlag: true, group: host, guideRadius: 8, guidePriority: 200 });
      localSay(rt, rt.hostGroup, '組頭', '身を低くせよ。殿の合図を待つぞ', 3);
    }
  },
  // 行軍が短く終わっても、見張りの寄せを取りこぼさない。
  scout(rt) {
    const F = rt.flags, host = rt.hostGroup;
    // 既存の見張りだけが行軍二秒後に寄せる。兵を足さず、位置も移し直さない。
    if (!F.scoutStarted && rt.t - F.marchBegan >= 2) {
      F.scoutStarted = true;
      const scout = F.road[0];
      if (readyGroup(scout)) {
        scout.order = 'attack'; scout.aggro = 24; scout.seekRange = 24;
        // 一人討たれただけで六人が逃げ、斬り合いにならなかった。半ばを失うまでは踏みとどまる。
        scout.noRout = true;
        // 見張りは列の端にいる自分へ斬りかかる。最初の斬り合いを一分以内に確かに起こす（主君で遊ぶ時は組の先頭へ）。
        scout.focus = (!rt.G.lord && rt.player.u.alive ? rt.player.u : host?.units.find(readyUnit)) || null;
      }
      localSay(rt, host, '組頭', '道の見張りが来るぞ。組のそばで迎え撃て。深追いするな', 4);
    }
    // 接敵後まで六人が本人だけを追うと、味方を素通りする細い追跡列になる。
    // 最初の寄せは保ち、組へ届いたら各兵が近い相手と槍を交える。
    if (F.scoutStarted && !F.scoutEngaged) {
      const scout = F.road[0];
      for (const u of scout.units) {
        if (!readyUnit(u)) continue;
        let contact = readyUnit(rt.player.u) && Math.abs(u.pos.y - rt.player.u.pos.y) < 3 &&
          Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 7 &&
          !rt.army.wallBetween(u.pos, -1, rt.player.u.pos);
        if (!contact && host) for (const mate of host.units) {
          if (readyUnit(mate) && Math.abs(u.pos.y - mate.pos.y) < 3 &&
              Math.hypot(u.pos.x - mate.pos.x, u.pos.z - mate.pos.z) < 7 &&
              !rt.army.wallBetween(u.pos, -1, mate.pos)) { contact = true; break; }
        }
        if (contact) { scout.focus = null; F.scoutEngaged = true; break; }
      }
    }
    if (F.scoutStarted && F.road[0].noRout && F.road[0].units.filter(readyUnit).length <= 3) F.road[0].noRout = false;
  },
  wait(rt) {
    const F = rt.flags;
    this.scout(rt);
    // 信長公記：中島での言葉 → 石氷を投げ打つような雨が今川の顔へ → 空が晴れ、鑓を取って「かかれ」。
    // 殿の声は遠いので、組頭が伝える。待ちは十五秒ほどで、雨と雷で張りつめさせる。
    if (!F.waitSpeech) {
      F.waitSpeech = true;
      sfx('thunder', 0.9);
      if (!rt.G.lord) {
        rt.after(1.2, () => { if (rt.phase === 'wait') localSay(rt, rt.hostGroup, '組頭', '殿のお言葉じゃ。敵は夜通し歩いて疲れておる。こちらは新手ぞ', 5); });
        rt.after(6.5, () => { if (rt.phase === 'wait') localSay(rt, rt.hostGroup, '組頭', '小勢でも大敵を恐れるな。運は天にあり、とな', 4); });
      }
      rt.after(4, () => { if (rt.phase === 'wait') { sfx('thunder', 1); rt.bark('石や氷を投げつけるような雨が、今川の陣へ吹きつけている'); } });
    }
    rt.objProgress('wait', F.clear ? '雨が上がった。かかれの合図を待て' : '敵が来たら、味方と迎え撃て');
    if (rt.pt > 11 && !F.clear) {
      F.clear = true; rt.world.setRainTarget(0); rt.world.setTime('after'); rt.world.addPuddles(30);
      for (const g of F.enemies) g.guardSight = 32;
      rt.banner('雨が上がった', '霧の向こうに、今川本陣の幕と旗が見える');
      // 晴れ間に、本陣の方へ一息だけ目を向ける。構えている時は奪わない。
      const p = rt.player;
      if (!p.lock && !(p.inCombatT > 0)) p.cine = { x: FIELD_HONJIN.x, z: FIELD_HONJIN.z, t: 1.6 };
    }
    if (rt.pt > 15 && !F.kakare) {
      F.kakare = true; hush(2);
      localSay(rt, rt.G.lord ? rt.player.u : rt.flags.nob, '織田信長', 'すわ、かかれ、かかれ！', 3);
      if (!rt.G.lord) rt.after(0.6, () => localSay(rt, rt.hostGroup, '組頭', '殿が鑓を取られた！　かかれ！', 2.5));
      rt.after(2, () => this.startAssault(rt));
    }
  },
  startAssault(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || rt.phase !== 'wait') return;
    rt.setPhase('assault'); rt.objRemove('col'); rt.objRemove('wait'); rt.objRemove('honjin0');
    rt.unmark('wait');
    F.quiet = false;
    // 下知で動き出す時だけ総懸かりを鳴らす。隊の自動合図との重なりを避ける。
    (rt.signalCalls || (rt.signalCalls = Object.create(null)))['0:kakari'] = rt.t;
    (rt.cueAt || (rt.cueAt = {})).kakari = rt.t;
    rt.army.playFar('sig_kakari', rt.G.lord ? rt.player.u.pos : F.nob.center(), 1);
    localSay(rt, rt.hostGroup, '組頭', '法螺と陣太鼓の早打ちじゃ！　味方の旗に続け、かかれ！', 4);
    for (const g of F.enemies) g.fire = true;
    for (let i = 0; i < F.cols.length; i++) {
      const g = F.cols[i];
      if (!g.count || g.routed) continue;
      g.order = 'attack'; g.formation = 'yari';
      // 公記：馬廻・小姓衆に手負い・死人は多かったが、攻めは崩れなかった。怯えは兵一人の士気に任せ、隊は崩さない。
      g.facing = Math.PI + FIELD_TURN; g.noRout = true;
    }
    // 馬廻も道から歩いて寄せる。信長を最前列へ単独で放り込まない。
    F.nob.order = 'attack'; F.nob.formation = 'yari';
    F.nob.noRout = true;
    for (const g of F.road) g.aggro = 10;
    for (const C of F.wings || []) { C.go(); C.push('A', 0.25); }
    this.pushRoad(rt);
    // 公記：かかる勢いを見て、前の備えは水をまくように崩れ、弓・槍・旗を捨てた。
    // 本陣の前の二備だけ士気を落とす。崩れるかは兵の士気の仕組みに任せる。
    rt.after(5, () => {
      if (rt.over || F.ending) return;
      let seen = false;
      for (const g of [F.enemies[0], F.enemies[1]]) if (readyGroup(g)) { g.morale -= 30; seen = seen || sightPoint(rt, g.center()); }
      if (seen) rt.bark('今川の前の備えが崩れかかる。槍も旗も捨てて逃げる者がいる');
    });
  },
  pushRoad(rt) {
    const F = rt.flags;
    let step = 0;
    while (step < F.road.length && (gone(F.road[step]) ||
      F.road[step].units.every((u) => !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget))) step++;
    const block = F.road[step];
    if (step !== F.roadStep) {
      // 本人が戦った小隊が実際に崩れ、味方の行き先が進む時だけ手柄にする。
      if (!F.roadDeed && F.road.some((g, i) => i < step && g.okePlayerHelp)) {
        F.roadDeed = true;
        rt.award((t) => t.side.push('道の守りを崩し、味方の前進を助けた'), '道を開いた。味方が本陣へ進む');
      }
      F.roadStep = step;
      rt.unmark('road');
      // 同じ札を出し直さない（札の揺れと、組頭の読み上げの重なりを防ぐ）。
      const text = block ? '組の旗に続け。道をふさぐ敵を倒せ' : '味方と本陣の幕の口へ進め';
      if (!F.entered && F.attackText !== text) {
        F.attackText = text; rt.obj('attack', text, 'main');
        const task = rt.objectives.find((o) => o.id === 'attack' && !o.state);
        if (task) { task.cue = '合図：法螺と陣太鼓の早打ちで攻める'; task.cueT = rt.cueAt.kakari; }
      }
      if (block) rt.marker('road', block.anchor, '道を守る小隊・味方と崩せ', { red: true });
      else rt.marker('honjin', fieldPoint(18, -100), '今川本陣・幕の口', { red: true });
    }
    // 行き先と探す広さは毎秒かけ直す。隊の頭の仕組みが狭い探索へ戻すと、二十歩先の小隊の前で立ち止まった（10/7）。
    for (let i = 0; i < F.attackers.length; i++) {
      const g = F.attackers[i];
      if (gone(g)) continue;
      // 道の守りへ順に寄せ、外側の遠い備えを追って止まらない。
      const side = [-8, 8, 0, -4, 4][i];
      const x = block ? localX(block.anchor.x, block.anchor.z) : 18;
      const z = block ? localZ(block.anchor.x, block.anchor.z) + 3 : -100;
      g.anchor.x = fieldX(x + side, z); g.anchor.z = fieldZ(x + side, z);
      g.seekRange = block ? 16 : 24;
    }
  },
  assault(rt, dt) {
    const F = rt.flags, y = F.yoshimoto, p = rt.player.u.pos;
    if (F.ending) return;
    if (F.victory) {
      // 公記：深田へ逃げ込んだ者は這いまわり、若者どもが追いついて討った。退き鉦までの短い追い討ち。
      if (F.pursuitUntil > rt.t) {
        if (!(F.returnNoticeAt > rt.t)) {
          F.returnNoticeAt = rt.t + 1;
          rt.objProgress('pursue', `深田へ逃げる今川勢を、組と追い討て。退き鉦まで あと${Math.ceil(F.pursuitUntil - rt.t)}秒`);
          // 近くに敵がいなくなれば、早めに鉦を打つ。
          if (rt.t - F.pursuitStart > 15 && !rt.army.nearestEnemy(rt.player.u, 40)) F.pursuitUntil = rt.t;
        }
        return;
      }
      if (F.pursuitUntil && !F.pursuitDone) {
        F.pursuitDone = true; F.returnRetryAt = 0;
        F.returnDeadline = rt.t + 120;
        // 鉦を聞いた組はその場で追い討ちをやめる。動く旗を延々追わせない。
        for (const g of F.attackers) if (readyGroup(g)) {
          const c = g.center();
          g.anchor.x = c.x; g.anchor.z = c.z;
          g.order = 'hold'; g.guard = true; g.focus = null; g.aggro = 3; g.seekRange = 8;
        }
        // 二つ打ちは「止まれ」。追撃を切り上げる退き鉦は既存の乱打にそろえる。
        rt.army.playFar('sig_hike', rt.G.lord ? rt.player.u.pos : F.nob.center(), 1);
        rt.objDone('pursue'); rt.objRemove('pursue');
        localSay(rt, F.returnGroup || rt.hostGroup, '組頭', '退き鉦じゃ！　追うのはここまで。組の旗へ集まれ', 4);
        rt.obj('return', '退き鉦の乱打。追うのをやめ、帰る組の旗へ集まれ', 'main');
        rt.marker('genpachi', () => returnCenter(rt), '帰る組の旗', { guideFlag: true, group: F.returnGroup, guideRadius: 8 });
        rt.hud.root.setAttribute('data-oke-return', '');
      }
      const c = returnCenter(rt);
      const distance = c ? Math.hypot(c.x - p.x, c.z - p.z) : Infinity;
      const atFlag = distance <= 8 && !rt.army.wallBetween(p, -1, c);
      // 組頭は遅れた本人を置き去りにしない。列と下知は保ち、追いつけば同じ道を再開する。
      const returning = F.returnGroup;
      if (returning?.okeReturnOrdered) {
        if (distance > 12 && !returning.okeRegrouping) {
          returning.okeRegrouping = true;
          returning.anchor.x = c.x; returning.anchor.z = c.z;
          returning.order = 'hold'; returning.guard = true; returning.focus = null;
        } else if (returning.okeRegrouping && atFlag) {
          returning.okeRegrouping = false;
          returning.order = 'path'; returning.guard = false;
        }
      }
      // 帰る列が詰まっても、旗の下で安全に十秒集まれば帰還の終幕へ進む。
      // 使番の到着や下知そのものを、時刻だけで成立させるわけではない。
      if (atFlag && !(F.returnEnemyAt > rt.t)) {
        F.returnEnemyAt = rt.t + 0.5;
        // 背を見せて逃げる者・手負いで退く者は、帰る支度を止めない。
        F.returnEnemyNear = !!rt.army.nearestEnemy(rt.player.u, 12, (o) => !o.fleeing && !o.woundOut &&
          Math.abs(o.pos.y - rt.player.u.pos.y) < 3 && !rt.army.wallBetween(p, -1, o.pos));
      }
      const enemyNear = atFlag && F.returnEnemyNear;
      F.returnGatherT = atFlag && !enemyNear ? (F.returnGatherT || 0) + dt : 0;
      // 使番の遅れや交戦を、共通の寄せ時間で帰還失敗にしない。
      // 組が谷を抜けた後、一人で離れ続けた時だけ知らせて待つ。
      const leftBehind = c && F.returnGroup.okeReturnOrdered && localZ(c.x, c.z) > 0 && Math.hypot(c.x - p.x, c.z - p.z) >= 16;
      F.returnAwayT = leftBehind ? (F.returnAwayT || 0) + dt : 0;
      if (!leftBehind) F.returnWarn = false;
      if (!F.returnWarn && F.returnAwayT > 30) { F.returnWarn = true; rt.bark('組は谷を抜けた。帰る旗へ戻れ。このまま離れると組に戻れぬぞ', true); }
      if (!F.returnDeadlineWarn && rt.t >= F.returnDeadline - 30) {
        F.returnDeadlineWarn = true;
        rt.bark('帰る旗へ集まれ。あと三十秒で組をまとめて退くぞ', true);
      }
      if (!(F.returnRetryAt > rt.t)) { F.returnRetryAt = rt.t + 8; this.returnOrders(rt); }
      if (!(F.returnNoticeAt > rt.t)) {
        F.returnNoticeAt = rt.t + 1;
        // 閉じた札でも、迎撃と帰る支度の残り時間を読めるようにする。
        const text = atFlag ? enemyNear ? '帰る組の旗で、味方と敵を迎え撃て' :
          '帰る組の旗で待て。組をまとめて退く' : '帰る組の旗へ集まれ';
        const objective = rt.objectives.find((o) => o.id === 'return' && !o.state);
        if (objective && objective.text !== text) rt.obj('return', text, 'main', true);
        rt.objProgress('return', !c ? '残る味方と砦の方へ退け' : atFlag ? enemyNear ? '敵を向き、味方と構えよ。旗から離れるな' : `旗の下で、組が帰る支度を終えるまであと${Math.max(0, Math.ceil(10 - F.returnGatherT))}秒` : `帰る旗まで ${Math.round(distance)}歩ほど。旗の下で組を待て`);
      }
      // 谷の曲がりまで組も本人も離脱すれば帰還。砦までの空歩きはさせない。
      const leftValley = c && F.returnGroup.okeReturnOrdered && localZ(c.x, c.z) > 0 && localZ(p.x, p.z) > 0 && distance < 16;
      if (leftValley || F.returnGatherT >= 10) {
        F.ending = true; F.returnDone = true; rt.unmark('genpachi'); rt.objDone('return'); rt.tracker.main = true;
        const deed = leftValley ? '組と砦方面へ離脱した' : '帰る旗の下で組と合流した';
        rt.award((t) => t.side.push(deed), deed);
        rt.banner(leftValley ? '組と谷を抜けた' : '帰る組に合流した', 'ここから元の道をたどり、中島を経て清洲へ戻る');
        // 余韻と次への引き。森部（美濃）へつながる一言。
        rt.after(1.5, () => localSay(rt, F.returnGroup || rt.hostGroup, '組頭', 'よう生きて戻った。倒れた仲間を忘れるな。次は美濃で働こうぞ', 5));
        rt.finish({ scriptedEnd: true }, 7);
      } else if (!c || F.returnAwayT > 60 || rt.t >= F.returnDeadline) {
        F.ending = true; rt.objFail('return'); rt.tracker.main = false;
        rt.unmark('genpachi');
        const failureReason = !c ? '義元は討たれたが、帰る組が崩れ、組への合流を果たせなかった。' : F.returnAwayT > 60 ?
          '義元は討たれたが、帰る旗から離れ続け、組への合流を果たせなかった。' :
          '義元は討たれたが、退き鉦から二分たっても組と帰る支度が整わなかった。帰る旗へ集まり、近くの敵には味方と構えよう。';
        rt.banner('織田勢は勝った', failureReason); localSay(rt, rt.hostGroup, '組頭', '残った者を集め、砦の方へ退け！', 3); rt.finish({ scriptedEnd: true, failureReason }, 5);
      }
      return;
    }
    // 局地の変化は一秒に一度。段が替わっても兵は増やさず、生存隊が歩いて動く。
    F.tacticalT = (F.tacticalT || 0) - dt;
    if (F.tacticalT > 0) return;
    F.tacticalT = 1;
    // 攻める織田の備は、手負いが出ても崩れない（公記）。備の士気が尽きて「崩れました」と誤って知らせない。
    for (const S of rt.sonae || []) if (S.team === 0 && S.state !== '敗走' && S.b.morale < 40 && F.attackers.includes(S.b.real)) S.addMorale(40 - S.b.morale);
    // 道中で負傷した服部は、既存の回復で列へ戻る。本陣での接触を待ち続けない。
    // 義元と接触した後の手傷は、そのまま退場させる。
    const hat = F.nobKill[0], mor = F.nobKill[1];
    if (hat && !F.hattoriMet && !F.hattoriWounded) {
      guardRecover(rt, hat, 1, { historicalReturn: true });
      if (!hat.woundOut) hat.onWound = F.hattoriWound;
    }
    // 討取りを担う毛利も、道中の手傷で永久に退場させない。
    // 服部と同じ史実上の復帰だけを許し、回復中は戦えず、歩いて寄せ直す。
    guardRecover(rt, mor, 1, { historicalReturn: true });
    if (!F.mainPush && !F.koshiLeft) this.pushRoad(rt);
    let guards = 0;
    for (const u of F.hatamoto.units) if (u.alive && u !== y && !u.gone && !u.noTarget && !u.woundOut && !u.fleeing) guards++;
    if (!F.entered && (Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 18 ||
        F.attackers.some((g) => g.units.some((u) => readyUnit(u) && Math.hypot(u.pos.x - y.pos.x, u.pos.z - y.pos.z) < 18)))) {
      F.entered = true; rt.unmark('honjin');
      // 本陣の左右と後ろの備えが、義元を救いに駆け寄る。幕の内外で入り乱れる斬り合いになる。
      for (const i of [2, 3, 4]) {
        const g = F.enemies[i];
        if (!readyGroup(g)) continue;
        g.guard = false; g.order = 'attack'; g.seekRange = 30; g.aggro = 12; g.focus = null;
      }
      if (sightPoint(rt, y.pos)) rt.bark('本陣の両脇から今川の備えが駆け寄る。組から離れるな', true);
      F.attackText = '義元の旗本を三人たおせ';
      rt.obj('attack', F.attackText, 'main');
    }
    // 三人分の囲みが欠けたら、討取りへ向かう任務に進む。全滅は求めない。
    if (F.entered && !F.guardOpened && F.guardStart - guards >= 3) {
      F.guardOpened = true;
      F.attackText = '組とともに、義元の幕の口へ寄せよ';
      rt.objDone('attack'); rt.objRemove('attack'); rt.obj('attack', F.attackText, 'main');
      rt.marker('honjin', fieldPoint(18, -100), '義元の幕の口', { red: true });
      if (F.hatamoto.okePlayerHelp) {
        F.guardDeed = true;
        rt.award((t) => t.side.push('義元の囲みを崩し、馬廻の攻めを助けた'), '囲みに穴を開けた。馬廻が義元へ寄せる');
      }
      localSay(rt, rt.hostGroup, '組頭', F.guardDeed ? 'おぬしの槍で囲みが欠けた！　服部と毛利が続くぞ！' : '囲みが欠けたぞ。幕の口へ寄せ、服部と毛利を通せ！', 4);
      // 近くの旗本には応戦しながら、馬廻が義元へ歩いて寄る。
      F.nobClosing = true; F.nob.guard = false; F.nob.order = 'attack'; F.nob.focus = y; F.nob.seekRange = 36;
    }
    // 幕の口へ寄せる任務は、本人が届いた時に済ませ、次の攻めを示す。
    if (F.guardOpened && !F.mouthReached && !F.koshiLeft && Math.hypot(p.x - fieldX(18, -100), p.z - fieldZ(18, -100)) <= 10) {
      F.mouthReached = true;
      F.attackText = '囲みを押せ。服部と毛利を通せ';
      rt.objDone('attack'); rt.objRemove('attack'); rt.obj('attack', F.attackText, 'main');
      rt.marker('honjin', unitPos(y), '義元の旗本・味方と押せ', { red: true });
    }
    // 道の小隊が崩れれば、馬廻も口へ歩いて寄せる。幕の外で止めない。
    if (!F.mainPush && F.roadStep === F.road.length) {
      F.mainPush = true;
      localSay(rt, rt.G.lord ? rt.player.u : F.nob, '織田信長', '旗本はあれじゃ。あれへかかれ！', 3);
      if (!rt.G.lord) rt.after(0.8, () => localSay(rt, rt.hostGroup, '組頭', '殿のお下知じゃ。義元の旗本へかかれ！', 3));
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor = fieldPoint(HONJIN.x + g.okeSide, HONJIN.z + g.okeBack); g.seekRange = 28;
      }
    }
    // 旗本を減らされると、輿を捨て、囲みを保って陣の口から退く。実際に歩く。
    if (!F.koshiLeft && guards <= 22) {
      F.koshiLeft = true; F.koshiLeftT = rt.t;
      // 義元が幕を出た後は、空の幕の口へ誘導せず、実際に退く旗本へ印を移す。
      F.attackText = '目印の敵を追う';
      rt.obj('attack', F.attackText, 'main');
      rt.marker('honjin', unitPos(y), '退く義元の旗本・味方と寄せよ', { red: true });
      // 敵将も目の前で生きた声を出す。退却の知らせを同時に重ねない。
      if (readyUnit(y) && Math.hypot(p.x - y.pos.x, p.z - y.pos.z) <= 12 && !rt.army.wallBetween(y.pos, -1, p))
        localSay(rt, y, '今川義元', 'うろたえるな！　囲みを保て。向き直って押し返せ！', 4);
      else if (sightPoint(rt, y.pos)) rt.bark('義元の旗本が囲みを保って退く。味方と押せ、一人で追うな');
      if (F.koshi) { F.koshi.rotation.z = 0.12; F.koshi.position.y -= 0.4; }
      const H = F.hatamoto;
      H.guard = false; H.order = 'path'; H.formation = 'ring'; H.speed = 1.4;
      // 退く先は本陣の東の窪みまで。遠くへ逃げ切らせず、囲みのまま向き直る斬り合いを残す（10/7）。
      H.path = [[18, -100], [44, -114], [64, -124]].map(fieldPathPoint); H.pathIdx = 0;
      H.onArrive = (g) => { g.order = 'hold'; };
    }
    if (F.koshiLeft && F.hatamoto.count && !F.hatamoto.routed) {
      const H = F.hatamoto;
      const foe = rt.army.nearestEnemy(y, H.order === 'hold' ? 12 : 8);
      if (foe && !foe.fleeing && !foe.woundOut && !rt.army.wallBetween(y.pos, 1, foe.pos)) {
        if (H.order !== 'hold') {
          H.anchor.x = y.pos.x; H.anchor.z = y.pos.z;
          // 公記：二、三度、四、五度と向き直りながら退いた。
          F.turnBack = (F.turnBack || 0) + 1;
          if (F.turnBack >= 2 && F.turnBack <= 5 && rt.t >= (F.turnBackAt || 0) && sightPoint(rt, y.pos)) {
            F.turnBackAt = rt.t + 6;
            rt.bark(`義元の旗本がまた向き直った（${['', '', '二', '三', '四', '五'][F.turnBack]}度目）。囲みは細っている`);
          }
        }
        H.order = 'hold'; H.guard = true; H.formation = 'yari'; H.yariRanks = 3;
        H.facing = Math.atan2(foe.pos.x - y.pos.x, foe.pos.z - y.pos.z);
      } else if (H.order === 'hold' && H.pathIdx < H.path.length) {
        H.guard = false; H.order = 'path'; H.formation = 'ring';
      }
    }
    if (F.entered && sightPoint(rt, y.pos) && Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 24) {
      let best = 0, angle = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        let clear = Math.PI;
        for (const u of F.hatamoto.units) {
          if (u === y || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
          const b = Math.atan2(u.pos.x - y.pos.x, u.pos.z - y.pos.z);
          clear = Math.min(clear, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
        }
        if (clear > best) { best = clear; angle = a; }
      }
      const q = F.guardGap || (F.guardGap = { x: 0, z: 0 });
      q.x = y.pos.x + Math.sin(angle) * 5; q.z = y.pos.z + Math.cos(angle) * 5;
      const visible = best > 0.55 && sightPoint(rt, q) && !rt.army.wallBetween(p, -1, q);
      if (visible && !F.guardGapMarked) rt.marker('guardGap', () => F.guardGap, '囲みの切れ目・味方と押せ', { red: true });
      if (!visible && F.guardGapMarked) rt.unmark('guardGap');
      F.guardGapMarked = visible;
      if (F.koshiLeft && !F.guardTurnSaid) { F.guardTurnSaid = true; rt.bark('旗本は退いても向き直る。槍の向きを見て、味方と押せ'); }
    } else if (F.guardGapMarked) { rt.unmark('guardGap'); F.guardGapMarked = false; }
    if (!F.entered) rt.objProgress('attack', F.roadStep < F.road.length ? `道の小隊を味方と崩せ・あと${F.road.length - F.roadStep}組。本陣へ続くぞ` : F.mainPush ? '道の守りが崩れた。味方の旗に続き、幕の口へ寄せよ' : '本陣の前の備を、味方と槍をそろえて押せ');
    if (F.entered) {
      const seenHat = hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && sightPoint(rt, hat.pos);
      const seenMor = mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && sightPoint(rt, mor.pos);
      const showPeople = !F.guardOpened && !okehazama.objectiveEnemies(rt).length &&
        !rt.hud.defendEnemy?.alive && !rt.hud.approachGuideEnemy?.alive && !rt.guideEnemyShown;
      const markHat = !!seenHat && showPeople, markMor = !!seenMor && showPeople;
      if (markHat && !F.hattoriMarked) rt.marker('hattori', unitPos(hat), '服部小平太', { person: true });
      else if (!markHat && F.hattoriMarked) rt.unmark('hattori');
      if (markMor && !F.moriMarked) rt.marker('mori', unitPos(mor), '毛利新介', { person: true });
      else if (!markMor && F.moriMarked) rt.unmark('mori');
      F.hattoriMarked = markHat; F.moriMarked = markMor;
      const left = Math.max(0, 3 - (F.guardStart - guards));
      const next = !F.guardOpened ? `崩す旗本は${jpNum(left)}人` : F.yoshiDown ? '義元への打ち込みをやめ、毛利のそばで構えよ' : F.koshiLeft ? '服部・毛利の旗と退き口へ寄せよ' : F.mouthReached ? '毛利の手が届くよう、味方と押せ' : '義元の幕の口へ寄せ、服部・毛利を通せ';
      if (!(F.guardNoticeAt > rt.t)) {
        F.guardNoticeAt = rt.t + 1;
        // 同じ印の相手と必要な人数を短く伝える。
        if (!F.guardOpened) {
          // 崩す相手と人数を一文に保つ。
          const text = `義元の旗本をあと${jpNum(left)}人たおせ`;
          if (F.attackText !== text) { F.attackText = text; rt.obj('attack', text, 'main'); }
        } else if (F.yoshiDown) {
          const text = mor?.woundOut ? '毛利は手当て中。味方と構えよ' : '毛利の道を空け、そばで構えよ';
          if (F.attackText !== text) { F.attackText = text; rt.obj('attack', text, 'main'); }
        }
        rt.objProgress('attack', `囲みの旗本${jpNum(guards)}人。${next}`);
      }
    }
    // 道に敵が残っていても、退き始めた旗本を追う。窪みで向き直っている間も更新する。
    if (F.mainPush || F.koshiLeft) {
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor.x = y.pos.x + g.okeSide * FIELD_C + g.okeBack * FIELD_S; g.anchor.z = y.pos.z - g.okeSide * FIELD_S + g.okeBack * FIELD_C;
        if (F.koshiLeft) {
          g.guard = false; g.order = 'attack'; g.seekRange = 28;
          if (g !== F.nob) followRetiringGuards(g, F.hatamoto.units, y);
        }
      }
    }
    // 囲みが薄くなったら馬廻の狙いを義元へ。別の敵を追い続けて討取りが止まらないようにする。
    // 深手の後に囲みが残っても、十五秒で馬廻は義元へ寄せる。
    const longDown = F.yoshiDown && rt.t - F.yoshiDownT > 15;
    // 囲みが退き始めて四十秒たっても崩れなければ、馬廻が義元その人へ寄せる（攻めを止まらせない）。
    const longRing = F.koshiLeft && rt.t - F.koshiLeftT > 40;
    if (guards <= 10 || longDown || longRing) F.nobClosing = true;
    if (F.nobClosing && readyGroup(F.nob)) {
      // 行軍の到着や共通の下知で「止まれ」に戻っても、馬廻は討取りへ進む。
      // 囲みを開けた一度だけの指定では、服部・毛利が古い持ち場に残ることがある。
      F.nob.guard = false; F.nob.order = 'attack'; F.nob.focus = y; F.nob.seekRange = 36;
      // 討取りの馬廻は九歩後ろの持ち場へ戻さず、義元の今いる場所へ歩かせる。
      F.nob.anchor.x = y.pos.x; F.nob.anchor.z = y.pos.z;
    }
    if (hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && Math.hypot(hat.pos.x - y.pos.x, hat.pos.z - y.pos.z) < 3 && !rt.army.wallBetween(hat.pos, 0, y.pos)) F.hattoriMet = true;
    // 深手、旗本の損失、服部の接触、毛利の到着がそろった時だけ討取りへ。
    if (F.yoshiDown && !F.moriClose && mor && mor.alive && Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) < 7 && sightPoint(rt, y.pos)) {
      F.moriClose = true;
      if (readyUnit(mor) && Math.hypot(p.x - mor.pos.x, p.z - mor.pos.z) <= 12 && !rt.army.wallBetween(mor.pos, -1, p))
        localSay(rt, mor, '毛利新介', F.hattoriWounded ? '小平太、下がれ！　義元へは、この新介がかかる！' : '毛利新介、参る！　この囲みを抜くぞ！', 4);
      else rt.bark('毛利新介が義元へ斬りかかる！');
    }
    // 服部が義元に会う前に手傷で退いた時は、毛利だけで討つ（服部の接触を待ち続けない）。
    const hattoriDone = F.hattoriMet || !hat || !hat.alive || hat.woundOut || longDown;
    // 深手から二十五秒たっても寄れない時は、毛利が数歩の間合いから飛び込む。
    const reachMori = F.yoshiDown && rt.t - F.yoshiDownT > 25 ? 6 : 3;
    if (F.yoshiDown && rt.t - F.yoshiDownT >= 5 && (guards <= 10 || longDown) && hattoriDone && mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) < reachMori && !rt.army.wallBetween(mor.pos, 0, y.pos)) {
      y.invuln = false; rt.army.kill(y, mor);
    }
    if (!y.alive) { this.returnHome(rt); return; }
    // 人数と任務の段が進まない時間を測る。敵が移動しただけでは数え直さない。
    const progressStage = (F.entered ? 1 : 0) + (F.guardOpened ? 2 : 0) + (F.mouthReached ? 4 : 0) +
      (F.koshiLeft ? 8 : 0) + (F.yoshiDown ? 16 : 0) + (F.hattoriMet ? 32 : 0);
    if (F.assaultProgressAt === undefined || F.assaultProgressStage !== progressStage ||
        F.assaultProgressRoad !== F.roadStep || guards < F.assaultProgressGuards) {
      F.assaultProgressAt = rt.t; F.assaultProgressStage = progressStage;
      F.assaultProgressRoad = F.roadStep; F.assaultProgressGuards = guards; F.assaultHint = null;
    }
    if (!F.assaultHint && rt.t - F.assaultProgressAt >= 180) {
      F.assaultHint = F.yoshiDown ? '毛利の旗へ寄れ。道を空け、そばで構えよ' :
        F.koshiLeft ? '旗本の退き口へ回れ。服部と毛利の旗に続け' :
        F.entered ? '義元の旗本へ寄れ。味方と囲みを崩せ' : '味方の旗に続け。道をふさぐ敵を崩せ';
      localSay(rt, rt.hostGroup, '組頭', F.assaultHint, 5);
      const block = !F.entered && !F.koshiLeft && F.road[F.roadStep];
      rt.marker('honjin', F.yoshiDown && mor?.alive ? unitPos(mor) : block ? block.anchor : unitPos(y), F.assaultHint, { red: true });
    }
    if (F.assaultHint) rt.objProgress('attack', F.assaultHint);
    if (!F.assaultWarn && rt.pt >= 360) {
      F.assaultWarn = true;
      localSay(rt, rt.hostGroup, '組頭', 'あと一分で攻めを止める。味方と槍をそろえて押せ！', 4);
      rt.bark('攻めの打ち切りまで、あと一分', true);
    }
    let ready = 0;
    for (const g of F.attackers) if (readyGroup(g)) ready++;
    // 姿が見えないままでも七分で攻めを止める。接敵の記録だけで終幕を止めない。
    // 囲みが退き口へ着いても、馬廻が追いつく間（九十秒）は失敗にしない（着いた途端に「攻めを止める」になった。10/7）。
    if (rt.pt > 420 || (rt.canFailMission() && (!ready || (F.koshiLeft && rt.t - F.koshiLeftT > 90 && localX(y.pos.x, y.pos.z) > 80 && (!mor || !mor.alive || Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) > 15))))) {
      F.ending = true; rt.tracker.main = false; rt.objFail('attack');
      rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap'); rt.unmark('road'); rt.unmark('honjin');
      rt.banner('攻めを止める');
      localSay(rt, rt.hostGroup, '組頭', !ready ? '攻める備が崩れた。残った者を連れて下がれ！' : rt.pt > 420 ? '攻めが長引いた。敵の守りはまだ固い。組を下げよ！' : '義元の旗本に退かれた。深追いせず、組を下げよ！', 3);
      const mission = F.attackText || '味方の旗に続き、道の守りを崩せ';
      const reason = !ready ? '攻める味方の組が崩れた。' : rt.pt > 420 ? '敵の守りを崩せず、攻めが長引いた。' : '義元の旗本が退き、追いつけなかった。';
      rt.finish({ failureReason: `「${mission}」を果たせず。${reason}味方と槍をそろえて押そう。` }, 5);
    }
  },
  returnHome(rt) {
    const F = rt.flags;
    // 帰る旗へ進むのは、実際に義元が討たれた後だけ。
    if (F.yoshimoto.alive || F.victory) return;
    rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap'); rt.unmark('road'); rt.unmark('honjin');
    F.nob.focus = null;
    F.victory = true; rt.objDone('attack'); rt.objRemove('attack');
    // 討取りの知らせと同じ本陣から、一度だけ大勢の鬨を上げる。
    rt.army.playFar('toki', F.yoshimoto.pos, 1.2);
    const mor = F.nobKill[1];
    if (sightPoint(rt, F.yoshimoto.pos) && Math.hypot(rt.player.u.pos.x - F.yoshimoto.pos.x, rt.player.u.pos.z - F.yoshimoto.pos.z) <= 12)
      rt.banner('今川義元、討ち取ったり', '毛利新介が首を挙げた');
    else if (Math.hypot(rt.player.u.pos.x - F.yoshimoto.pos.x, rt.player.u.pos.z - F.yoshimoto.pos.z) <= 45) {
      // 少し離れていても、鬨の声の方へ一息だけ目を向ける。構えている時は奪わない。
      const p = rt.player;
      if (!p.lock && !(p.inCombatT > 0)) p.cine = { x: F.yoshimoto.pos.x, z: F.yoshimoto.pos.z, t: 1.4 };
      rt.banner('義元討ち取ったり', '本陣の方で鬨の声が上がる');
    } else rt.banner('義元討ち取ったり', '毛利新介が首を挙げた。組の旗から離れるな');
    // 討死を見た生存兵から知らせが走る。隊の番号や時刻だけでは崩さない。
    const witness = F.enemies.flatMap((g) => g.units).find((u) => u.alive && !u.gone && !u.woundOut &&
      Math.hypot(u.pos.x - F.yoshimoto.pos.x, u.pos.z - F.yoshimoto.pos.z) < 30 &&
      !rt.army.wallBetween(u.pos, -1, F.yoshimoto.pos));
    for (const C of F.wings || []) C.rout('B', { from: 0, hideAfter: 40 });
    // 勝った側は崩さない。「義元討たれたり」の声で、攻める組の足は軽くなる。
    for (const g of F.attackers) if (readyGroup(g)) { g.noRout = true; g.morale = Math.max(g.morale, 90); }
    if (!rt.G.lord) rt.after(1.2, () => { if (!rt.over) rt.bark('味方の兵「義元が首、毛利新介が取ったり！」'); });
    if (witness) {
      // 討死を目の前で見た備えは、使番を待たずにその場で崩れる。遠い備えには知らせが走る。
      const yp = F.yoshimoto.pos;
      for (const g of F.enemies) if (readyGroup(g)) {
        const seen = g.units.some((u) => readyUnit(u) && Math.hypot(u.pos.x - yp.x, u.pos.z - yp.z) < 45 && !rt.army.wallBetween(u.pos, -1, yp));
        // 逃げる先は西の谷の田（深田）。追い討ちの場をそこへ作る。
        const flee = (q) => { q.noRout = false; q.morale = 0; q.fleeSet = true; q.fleeDir = fieldVector(-0.862, 0.507); };
        if (seen) flee(g); else fieldNotice(rt, witness, g, 1, flee);
      }
      for (const m of F.imaDA) fieldNotice(rt, witness, m.army, 1, () => {
        m.rout({ hideAfter: Infinity });
        // 近づいて本物へ替わった同じ控えにも、届いた知らせを渡す。
        for (const g of rt.army.groups) if (g.recyclable && g.units.some((u) => u.wkFrom?.A === m.army)) {
          g.noRout = false; g.morale = 0;
        }
      });
    }
    F.returnGroup = readyGroup(rt.hostGroup) ? rt.hostGroup : F.attackers.find(readyGroup);
    for (const q of F.far) if (q.m.visible) q.returnWaiting = true;
    // 帰る下知の前に、二十秒だけ追い討ち。集まる十秒と合わせ、帰陣へ進む。
    F.pursuitStart = rt.t; F.pursuitUntil = rt.t + 20;
    for (const g of F.attackers) if (readyGroup(g)) { g.order = 'attack'; g.seekRange = 30; g.focus = null; }
    rt.obj('pursue', '深田へ逃げる敵を 組と追う', 'main');
    if (!rt.G.lord) rt.after(2.5, () => localSay(rt, rt.hostGroup, '組頭', '逃げる者を追え！　首は捨て置け。組の旗の見える所までじゃ', 4));
  },
  // 討死と帰る下知は生きた使番で届ける。失われた便だけ送り直す。
  returnOrders(rt) {
    const F = rt.flags, mor = F.nobKill[1];
    if (F.pursuitUntil > rt.t) return;
    const commander = rt.G.lord ? rt.player.u : F.nob.units.find((u) => u.name === '織田信長' && readyUnit(u));
    // 下知役が戦列を離れた時は、古い受け手を待ち続けず報告からやり直す。
    if (F.returnChief && !readyUnit(F.returnChief)) F.returnChief = null;
    if (!F.returnChief) {
      if (F.returnReport?.state === 'run') return;
      F.returnReport = fieldNotice(rt, mor, commander || mor, 0, (chief) => {
        F.returnChief = chief;
        for (let i = 0; i < F.far.length; i++) {
          const q = F.far[i];
          if (!q.m.visible) continue;
          fieldNotice(rt, chief, q.a, 0, () => {
            q.path = [[localX(q.x, q.z), localZ(q.x, q.z)], ...q.path.slice().reverse(), [-28 + i * 8, 206 + (i % 2) * 16]];
            q.s = 0; q.done = false; q.returnWaiting = false;
          });
        }
      });
    }
    const chief = F.returnChief;
    if (!chief || !readyUnit(chief)) return;
    for (const g of F.attackers) if (readyGroup(g) && !g.okeReturnOrdered && g.okeReturnRunner?.state !== 'run') {
      g.okeReturnRunner = fieldNotice(rt, chief, g, 0, (q) => {
        retreatGroup(q);
        if (q === F.returnGroup || q === rt.hostGroup) {
          if (!sightPoint(rt, F.yoshimoto.pos)) rt.bark('義元討死の知らせが届いた。組と元の道へ戻れ');
          localSay(rt, q, '組頭', '追うのはここまでじゃ。組の旗について戻れ！', 4);
        }
      });
    }
  },
  onKill(rt, v, k) {
    // 討った本人だけを覚える。味方の働きを自分の手柄にはしない。
    if (v.team === 1 && k?.isPlayer && !rt.flags.victory &&
        (rt.flags.road.includes(v.group) || (v.group === rt.flags.hatamoto && v !== rt.flags.yoshimoto)))
      v.group.okePlayerHelp = true;
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1;
    else rt.flags.ak = (rt.flags.ak || 0) + 1;
  },
  onHead(rt) {
    if (!rt.G.lord) rt.violation('分捕りを禁じる下知に背いた', ['組頭', '首を置け。敵を突き崩せ！']);
  },
  onFinish(rt, info) {
    // 義元討取りが主の手柄。帰る組への合流は、別に得た副任務の加点とする。
    const mainDone = rt.flags.victory === true;
    rt.tracker.main = mainDone;
    if (mainDone) {
      rt.tracker.minimumGrade = '乙';
      delete info.failureReason;
    }
    // 共通処理が味方の首袋を自動で数えても、討ち捨ての戦では証言だけを採る。
    for (const record of rt.meritKills || []) { record.head = false; record.carrier = null; }
    rt.meritFirstHead = null;
    // 首実検はこの呼び出しの後。次の更新で巻物の文を整え、得点や証言の判定は保つ。
    rt.after(0, () => {
      const t = rt.tracker;
      for (const sp of t.specials) {
        sp.label = sp.label.replace(/討ち取りの証：首袋で0人分、味方の証言で(\d+)人分を確かめた/, '討ち捨ての働き：味方の証言で$1人分を確かめた');
      }
      if (rt.flags.victory) t.specials.unshift({ label: '今川義元を毛利新介が討ち取った', pts: 0 });
    });
    // 減点があっても討取りの戦功を残し、合流の二十点はその上に足す。
    const meritLines = rt.tracker.lines;
    rt.tracker.lines = function () {
      const lines = meritLines.call(this);
      if (mainDone) {
        const minimum = Math.ceil(this.battle.cap * .45) + (rt.flags.returnDone ? 20 : 0);
        const raw = lines.reduce((sum, line) => sum + line.pts, 0);
        lines.unshift({ label: '義元討取りの大手柄', detail: 'この戦で一番の手柄', pts: Math.max(0, minimum - raw), cat: '任', big: true });
      }
      const i = lines.findIndex((line) => line.label === '今川義元を毛利新介が討ち取った');
      if (i > 0) lines.unshift(lines.splice(i, 1)[0]);
      return lines;
    };
  },
};

// 史料にない迂回の選択や、一人の足軽による全軍指揮を入れない。
okehazama.rts = true;
// 討ち捨ての下知（信長公記）。首を袋へ促す知らせを出さない。足軽へ他の隊の居場所を使番で知らせない。
okehazama.uchisute = true;
okehazama.noAllyReports = true;
// 信長はこの戦の馬廻で扱う。共通の手傷による退場・本陣襲撃を重ねない。
okehazama.taisho = { a: { name: '織田信長', def: true } };
okehazama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '今川軍', mon: 'imagawa' } };
okehazama.introSides = { a: '織田軍 約2千', b: '今川軍 約2万5千' };
// 参戦者は開始時の馬廻・旗本へ置いた。後から名前のある兵を足さない。
okehazama.date = (rt) => `永禄三年五月十九日　初夏・未の刻ごろ・${sky(rt)}`;
// 見える局地戦の数。本陣から離れた大高・鳴海などの兵をここへ合算しない。
// 損害一人を何十人へ水増しせず、出陣時の目安を示す。
okehazama.force = () => ({ a: 2000, a0: 2000, b: 6000, b0: 6000 });
okehazama.history = '義元のねらいは上洛ではなく、国境で信長を押さえ、大高・鳴海の城を助けることだったと見る説がある。昼までに丸根・鷲津を落とし、今川は優勢だった。『信長公記』は、信長勢が近づいた後に石や氷を投げつけるような雨が降り、空が晴れてから攻めたと記す。義元の背後へ迂回したという記述はない。信長本人が攻めに出ることが今川の計算になかったために崩れた、と見る説もある。義元の旗本は囲みを保って退き、何度も向き直って戦った。服部小平太が手傷を負い、毛利新介が義元を討ち取った。義元が自ら刀を抜き、服部の膝を斬ったと後世の本に伝わる。義元を討った織田勢は、来た道をたどって帰った。尾張を守った信長は、やがて美濃へ進む。織田の攻撃兵は二千に足らずという。本陣周辺の今川六千は後世の推定を参考にした目安で、全軍の数ではない。今川全軍は二万五千ともいい、公記の数とは異なる。両軍の備えの割り振り、細かな配置、小川、砦の形、短い待ち時間は推定復元。本陣は桶狭間山説に置いた。北東の田楽窪と東の高い丘は別の場所として残した。戦場の位置と接近路にも諸説がある。';

// 自分の組へ続く。物陰越しの敵・遠い敵を追わず、帰陣では旗へ戻る。
okehazama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive) return;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  inp.guardHold = false;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.runHeld = false;
  // 手綱を取る間は止まる。組への追従で走り抜けると、手綱取りが取り消される。
  if (p.catching || p.mountT > 0) return;
  if (b.phase === 'brief' && !F.briefed && !b.G.lord) {
    const q = F.genpachi.pos; goTo(p, inp, q.x, q.z, 2);
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 3) inp.e.add('KeyE');
    return;
  }
  // 帰る旗と同じ、生きて戦列に残る組へ寄る。手負いの兵を含む中心では待たない。
  const returning = F.victory ? returnCenter(b) : null;
  const host = F.victory ? F.returnGroup : b.hostGroup.count ? b.hostGroup : F.attackers.find((g) => g.count && !g.routed);
  if (!host || !host.count) return;
  // 行軍中も目の前の見張りには応戦する。旗から離れて本陣へは追わない。
  if ((b.phase === 'march' || b.phase === 'wait') && F.scoutStarted) {
    const e = strikeTarget(b, 8), q = F.guidePos || host.anchor;
    if (e && e.group === F.road[0] && Math.hypot(e.pos.x - q.x, e.pos.z - q.z) <= 16 &&
        !b.army.wallBetween(u.pos, -1, e.pos)) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
      if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      patientStrike(p, inp, e, d);
      return;
    }
  }
  if (b.phase === 'assault' && (!F.victory || F.pursuitUntil > b.t)) {
    // 討ち取れない義元の一撃も受ける。攻める相手だけを探すと、構えずに打たれる。
    const threat = b.army.nearestEnemy(u, 10, (o) =>
      ((o.atk && !o.atk.bow && o.atk.target === u) ||
       (o.swing && !o.swing.done && o.swing.target === u) ||
       (o.charging && o.cv === 'in' && o.target === u)) &&
      Math.abs(o.pos.y - u.pos.y) < 3 &&
      Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (o.reach || 2.8) + 0.6 &&
      !b.army.wallBetween(u.pos, -1, o.pos));
    // 囲みを開いた後も、別の備えや深手の義元だけを追い続けない。
    const guard = F.entered && b.army.nearestEnemy(u, 10, (o) => o.group === F.hatamoto &&
      (o !== F.yoshimoto || !F.yoshiDown) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    // 深手の義元は毛利が討つ。通常の敵探しへ戻っても連打の相手にしない。
    const e = threat || guard || (F.yoshiDown && !F.victory ? b.army.nearestEnemy(u, 10, (o) =>
      o !== F.yoshimoto && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) : strikeTarget(b, 10));
    if (e) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
      // 打ち込み中は回り道で背を向けず、その場で受ける。
      if (!threat && d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 不死身の義元へ連打せず、周りの旗本の隙を突く。構えを解き、届く時だけ突く。
      patientStrike(p, inp, e, d);
      return;
    }
    // 組の中心で待つだけでは、前列が戦っていても十歩先の敵に届かない。
    // 前列が狙う敵へ道をたどる。味方の背で止まると、幕の向こうの敵へ届かない。
    let front = null, frontDist = Infinity;
    for (const mate of host.units) {
      const foe = mate.target;
      if (mate === u || !mate.alive || mate.fleeing || mate.woundOut || mate.noTarget ||
          !foe || !foe.alive || foe.fleeing || foe.woundOut || foe.noTarget || foe.isStruct ||
          Math.abs(mate.pos.y - u.pos.y) >= 3 ||
          Math.hypot(foe.pos.x - mate.pos.x, foe.pos.z - mate.pos.z) > 6) continue;
      const d = Math.hypot(mate.pos.x - u.pos.x, mate.pos.z - u.pos.z);
      if (d < frontDist) { front = mate; frontDist = d; }
    }
    if (front) {
      const foe = front.target;
      const q = honjinWay(b.army, u, foe.pos);
      goTo(p, inp, q.x, q.z, q === foe.pos ? p.weapon === 'sword' ? 1.6 : 2.4 : 1);
      return;
    }
    // 敵が目の前にいない時だけ、組の近くの空馬へ寄る。帰陣の下知では寄り道しない。
    if (!p.mounted && b.army.looseHorses && !b.army.nearestEnemy(u, 6)) {
      const q = host.center();
      let horse = null, near = 15;
      for (const o of b.army.looseHorses) {
        if (!o.from || !o.h.parent || o.mode === 'fled') continue;
        const hp = o.h.position, d = Math.hypot(hp.x - u.pos.x, hp.z - u.pos.z);
        if (d < near && Math.hypot(hp.x - q.x, hp.z - q.z) < 16 && !b.army.wallBetween(u.pos, -1, hp)) { horse = o; near = d; }
      }
      if (horse) {
        goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
        if (near < 3.2) inp.k.add('KeyE');
        return;
      }
    }
  }
  if (b.phase === 'assault' && !F.victory) {
    const block = F.road[F.roadStep];
    // 幕と手盾を横切らず、本陣の口を回って義元へ寄る（幕の外で198秒止まった。10/7）。
    const q = block ? block.anchor : honjinWay(b.army, u, F.yoshimoto.pos);
    goTo(p, inp, q.x, q.z, block ? 3 : 5);
    return;
  }
  const q = returning || host.center(); goTo(p, inp, q.x, q.z, 4);
};

// 味方の鉄砲の一斉射：敵の組が鉄砲の前へ寄せた所で一度だけ「放て」。当たった組の士気を落とし、崩れやすくする
export function volleyAt(rt, key, guns, foes, o = {}) {
  const F = rt.flags; F.vol = F.vol || {};
  if (F.vol[key] || gone(guns)) return false;
  const gc = guns.center(), r = o.r || 32;
  const near = foes.filter((g) => !gone(g) && Math.hypot(g.center().x - gc.x, g.center().z - gc.z) < r);
  if (!near.length && !(o.until && rt.t > o.until)) return false;
  F.vol[key] = true;
  const hit = near.length ? near : foes.filter((g) => !gone(g));
  guns.order = 'attack'; guns.seekRange = r + 10;
  rt.say(o.who || '鉄砲頭', o.text || '引きつけたぞ。……放てえっ！', 3);
  rt.banner(o.title || '鉄砲、放て', o.sub || '味方の鉄砲が一斉に火を噴く');
  rt.army.play('volley', gc, 1.8);
  rt.after(0.5, () => rt.army.play('volley', gc, 1.2));
  for (const g of hit) { g.morale -= o.hit || 28; if (o.unpin) g.noRout = false; }
  rt.after(2.5, () => { if (o.then) rt.say(o.then[0], o.then[1], 3); });
  return true;
}

export { okehazama };
