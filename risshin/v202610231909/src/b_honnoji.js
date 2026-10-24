import { fireGlow } from './fire_glow.js';
// ======================================================================
// 織田家編　本能寺の変（天正十年六月二日）
// 明け方、明智光秀の一万余りの兵が京の本能寺を囲んだ。信長はわずかな供と戦い、奥に火をかけて自害した。
// 妙覚寺にいた嫡男・信忠は二条御所に移って戦い、ここでも自害した。
// 足軽（近習寄り）の流れ（kaito 10/2「寺の中で信長と一緒に戦いたい」）：本能寺の御殿に詰める者として、甲冑を着ない小袖の信長のそばで、
// 表門→本堂→御殿の奥へ退きながら戦い、退路を開いて信長を奥へ移す。最後は史実どおり本能寺は落ち、信長の命で裏門から出て二条御所へ
// 境内の形は honno_tera.js（docs/honnoji-1582-spec.md）。この戦だけ馬には乗れない（def.noHorse）
// 信長で遊ぶ時も、寺内で戦い奥へ退いて史実の終局を迎える。
// 向き：京の町の碁盤の目。南西（-x, +z）に本能寺、北東（+x, -z）に二条御所
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, MK } from './units_model.js';
import { nobori, noboriClothLite, hut, kabukimon, tobira, tsuiji, kagaribi, castleMat, solidSeg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildRoom, tomyo } from './interior_parts.js';
import { allyCover } from './ally_cover.js';
import { coverGuide } from './cover_guide.js';
import { retreatThroughGap, retreatDodge } from './bot_retreat.js';
import { buildTera, teraTick, breakNear, hallAt, TERA, inTera, GATES, CLIMB, PT } from './honno_tera.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { makeWeapon, poseArms } from './units.js';
import { FL, addDeck, groundAt } from './floors.js';
import { battleEvent, EVENT_FIRE_START, EVENT_RETREAT } from './battle_events.js';
import { sightScreenUnit } from './battle_sight.js';

import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, DAWN, dress, gone } from './b_inabayama.js';

import { camp } from './b_mid.js';

// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 本能寺の位置：今の寺町御池でなく、1582年は油小路蛸薬師の一帯（今の元本能寺町）。HIST_B（推定復元）
// 建物の細かな位置は推定。両方の遊び方で honno_tera.js の寺を使う。
const HONNO = { x: (TERA.x0 + TERA.x1) / 2, z: (TERA.z0 + TERA.z1) / 2, h: 60 }; // 寺域の大きさと各棟の位置は推定。実測値ではない。
// 地面の区分は建物の外形に合わせる。地面の絵と頂点色で同じ境界を使う。
const COURT_BUILDINGS = [
  [-63, -47, 40, 52], [-73, -49, 80.2, 95], [-42, -33, 66, 74],
  [-46.3, -43.7, 52.5, 77], [-58, -45, 75.7, 78.3], [-69.2, -66.8, 52.5, 80.5],
  [-42, -34, 33, 39], [-41.5, -33.5, 81, 87], [-42, -34, 91, 97],
];
const COURT_GARDEN = { x: HONNO.x - 6, z: HONNO.z + 8, r: 6 };
function courtBuildingDistance(x, z) {
  let d = Infinity;
  for (const b of COURT_BUILDINGS) d = Math.min(d, Math.max(b[0] - x, x - b[1], b[2] - z, z - b[3]));
  return d;
}
function courtPaving(x, z) {
  return (x > -64 && Math.abs(z - 50) < 2.2) || (z > 38 && z < 80 && Math.abs(x + 64) < 2.2);
}
let courtShrubGeo, courtShrubMat;
function courtGarden(rt) {
  courtShrubGeo ||= new THREE.IcosahedronGeometry(1, 0);
  courtShrubMat ||= new THREE.MeshLambertMaterial({ color: 0x475535 });
  const shrubs = new THREE.InstancedMesh(courtShrubGeo, courtShrubMat, 18);
  const m = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const a = Math.floor(i / 3) * Math.PI / 3, r = 3.5 + (i % 3) * 0.65;
    const x = COURT_GARDEN.x + Math.cos(a) * r, z = COURT_GARDEN.z + Math.sin(a) * r;
    m.position.set(x, rt.world.heightAt(x, z) + 0.25, z);
    m.rotation.set(0, i * 1.7, 0); m.scale.set(0.8, 0.45 + (i % 3) * 0.08, 0.7);
    m.updateMatrix(); shrubs.setMatrixAt(i, m.matrix);
  }
  shrubs.receiveShadow = true;
  rt.scene.add(shrubs); rt.world.viewCull([shrubs], 0, 40);
}
function courtClashGround(rt) {
  if (rt.flags.courtClashGround) return;
  rt.flags.courtClashGround = true;
  // 門内の斬り合いと門外の人垣。それぞれ一度だけ、既存の上限内へ残す。
  rt.army.seedClashGround(-37, 50);
  rt.army.seedClashGround(-14, 50, true);
}
const NIJO = { x: 54, z: -54, h: 17 };      // 二条御所
const HONNO_GATE = GATES.main;      // 本能寺の東の門
const NIJO_GATE = { x: NIJO.x - NIJO.h, z: NIJO.z };          // 二条御所の西の門
const NIJO_BACK = { x: NIJO.x, z: NIJO.z - NIJO.h };          // 二条御所の北の口（落ちる口）
const OUT = { x: NIJO.x + 4, z: -118 };                        // 落ちのびる先（北の町はずれ）
// 京都市「本能寺跡」：北は六角、南は蛸薬師、東は西洞院、西は油小路。
// 寺域を囲む関係を再現する。道幅・距離は推定。堀の外に道を通す。
const STREET_X = [TERA.x0 - 13, -81, TERA.x1 + 9, 27, 81];
const STREET_Z = [-27, 27, 81, TERA.z1 + 13];
const onTownStreet = (x, z, margin = 4) => STREET_X.some((v) => Math.abs(x - v) < margin)
  || STREET_Z.some((v) => Math.abs(z - v) < margin);
// 洛中は城下や農村に替えず、既存の町屋と宿坊を使う。
// 寺域の根拠：京都市「本能寺跡」。民の在所と避難路は町割りに沿う遊びのための推定。
// https://www2.city.kyoto.lg.jp/html/somu/rekishi/fm/ishibumi/html/na149.html
// 囲まれた門前と二条への戦闘路を避ける。僧だけは内塀の口と裏門の土橋を通る。
const PEOPLE_BANDS = [
  { x: 27, z: 81, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder'],
    route: [{ x: 45, z: 81 }, { x: 81, z: 81 }, { x: 81, z: 172 }] },
  { x: 27, z: 27, kinds: ['merchant', 'farmer', 'townsman', 'woman'],
    route: [{ x: 45, z: 27 }, { x: 81, z: 27 }, { x: 81, z: 81 }, { x: 172, z: 81 }] },
  { x: 27, z: -6, mode: 'inside', kinds: ['townsman', 'woman', 'child', 'elder'],
    route: [{ x: 27, z: -27 }, { x: 81, z: -27 }, { x: 81, z: -100 }, { x: 81, z: -172 }] },
  { x: 81, z: -81, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: [{ x: 81, z: -100 }, { x: 81, z: -172 }] },
  { x: -44, z: 36, mode: 'inside', kinds: ['monk', 'monk', 'monk'],
    route: [{ x: -79, z: 37 }, { x: -79, z: 76 }, { x: -91, z: 79 }, { x: -140, z: 76 },
      { x: -148, z: 76 }, { x: -158, z: 76 }, { x: -164, z: 76 }, { x: -164, z: -172 }] },
];
import { jinkeiBuild, jinkeiPoint } from './jinkei.js';
import { lostCauseNote } from './battle_lost_cause.js';
import { bindWound } from './wounds.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
// 各口の軽い兵は実兵へ替える在庫。画質を下げても寄せ手を減らさない。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.honnoRole = s.id;
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記の明智勢一万余と信長の僅かな供。各口の将・人数は復元であり確定した布陣図ではない。
// 斎藤利三・明智秀満は明智の家中の備えとして配る。桔梗は明智方の共通旗。
const HONNO_ATTACK = sonaePlan('寺を囲む備え', 1, { x: -104, z: 120 }, Math.PI * 0.75, [
  ['honjin', '本陣', '明智光秀', 5000, -104, 120, Math.PI * 0.75, 'akechi', 'akechi', 120, 38, 14],
  ['north', '北の脇門への寄せ', '明智光秀の配下', 1500, -61, TERA.z0 - 16, 0, 'akechi', 'akechi', 120, 44, 10],
  ['west', '西の裏門の封鎖', '明智秀満', 2000, TERA.x0 - 9, 67, Math.PI / 2, 'akechi', 'akechi', 120, 10, 56],
  ['south', '南の勝手口の封鎖', '明智光秀の配下', 1500, -54, 117, Math.PI, 'akechi', 'akechi', 140, 44, 12],
  ['east', '表門への先手', '斎藤利三', 2000, -24.5, 72, -Math.PI / 2, 'akechi', 'akechi', 80, 8, 32],
  ['reserve', '表門の控え', '明智光秀の配下', 1000, -14, 44, -Math.PI / 2, 'akechi', 'akechi', 100, 14, 16],
]);
// 供百人ほどを復元の目安にする。公記は上洛の小姓を二、三十人と記す。
// 信長と小姓は小袖のまま。旗は寺の置き旗を指し、各人に背旗を付けない。
const HONNO_DEFEND = sonaePlan('御殿と門の守り', 0, PT.nbRoom, Math.PI / 2, [
  ['nbG', '御殿の奥', '織田信長', 1, PT.nbRoom.x, PT.nbRoom.z, Math.PI / 2, 'oda', 'oda'],
  ['kosho', '控えの間', '森蘭丸・森坊丸・森力丸', 29, PT.hikae.x, PT.hikae.z, Math.PI / 2, 'oda', 'oda'],
  ['uma', '表門と庭の馬廻', '名は伝わらない', 70, PT.gateIn.x - 2, PT.gateIn.z, Math.PI / 2, 'oda', 'oda'],
]);

const ODA = { flag: 'oda' };
const AKECHI = { flag: 'akechi', armor: 0x34302a, cloth: 0x343c50, skin: 0xb88966 };
// 公記の「六月二日早天」、言経卿記の卯刻に合わせ、月夜でなく明け方の薄明。
// 空の色・雲量・風向は推定。東北東（東は+x、北は-z）の低い光で、初夏の朝を示す。
// https://akechikai.or.jp/siryo_nenpyo/mitsuhide_after/
const HONNO_DAWN = { ...DAWN, sky: 0x7e8795, fog: 0x7b8390, top: 0x52647d,
  sun: 0xffd6ab, hs: 0xbac8db, hg: 0x716653, sunI: 0.85, hI: 1.55, glow: 0.18, dir: [1, 0.08, -0.3] };

// 井戸・木戸（蛸薬師通り一帯の細い路地の雰囲気。町家の合間に少しだけ。軽い形で当たりは取らない）
function well(W, x, z) {
  const y = W.heightAt(x, z), g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x7e7a70, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 0.9 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.5, 10), stone); ring.position.y = 0.25; g.add(ring);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), wood); p.position.set(sx * 0.6, 0.95, 0); g.add(p); }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 4), wood); roof.position.y = 1.7; roof.rotation.y = Math.PI / 4; g.add(roof);
  g.position.set(x, y, z); g.traverse((o) => { o.castShadow = true; });
  return g;
}
function kido(W, x, z, rot = 0) {
  const y = W.heightAt(x, z), g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), m); p.position.set(sx * 1.1, 1.1, 0); g.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), m); top.position.y = 2.15; g.add(top);
  g.position.set(x, y, z); g.rotation.y = rot; g.traverse((o) => { o.castShadow = true; });
  return g;
}

function height(x, z) {
  // 洛中の数百メートルに山を盛らない。遠山はこの戦場の外にある。
  return 0.08 * Math.sin(x * 0.025) * Math.cos(z * 0.025);
}

// 四角の囲い（門の口を一つ空ける）。side：'e'|'w'|'n'|'s'
// batch を渡すと、築地塀の区画ごとの形を材質別に積むだけにして（描画は呼び手の finalizeKitBatch で一括）、
// 寺・御所二つ分の塀（区画数が多い）の描く回数を減らす
function compound(rt, c, gateSide, gw = 7, batch = null) {
  const { x, z, h } = c;
  const E = [[x + h, z + h], [x + h, z - h]], Wl = [[x - h, z - h], [x - h, z + h]], N = [[x + h, z - h], [x - h, z - h]], S = [[x - h, z + h], [x + h, z + h]];
  const sides = { e: E, w: Wl, n: N, s: S };
  const out = [];
  const wo = { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji, meshOpt: batch ? { batch } : undefined };
  for (const [k, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
    if (k === gateSide || k === c.back) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const g2 = (k === gateSide ? gw : 4) / 2;
      out.push(...wallLine(rt, [[ax, az], [mx - ux * g2, mz - uz * g2]], wo));
      out.push(...wallLine(rt, [[mx + ux * g2, mz + uz * g2], [bx, bz]], wo));
    } else out.push(...wallLine(rt, [[ax, az], [bx, bz]], wo));
  }
  for (const s of out) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  return out;
}

// フロイス『日本史』の本能寺の記事と、1582年11月5日付年報のカリオンの報告。
// 近くの教会で銃声と火の手を知った話を使う。フロイス自身は現場にいない。
// 本文の紹介：https://nihonsizatugaku.net/senkyousi-honnouzinohen/
// 伝聞の確認：https://kutsukake.nichibun.ac.jp/obunsiryo/essay/20240807/
// 教会の寸法・細かな位置・十字架の置き方は推定。日本の家の形を借り、道と戦の持ち場を空ける。
const CHURCH = { x: 12, z: 100 };
const CROSS_GEO = new THREE.BoxGeometry(1, 1, 1);
function buildNearbyChurch(rt, batch) {
  const W = rt.world, { x, z } = CHURCH;
  hut(W, x, z, 8, 7, 0, { h: 3.8, wall: 0xb8ac90, roof: 0x49423a, batch });
  const wood = castleMat('wood'), y = W.heightAt(x, z) + 6.2;
  for (const [w, h, dy] of [[0.16, 1.6, 0], [0.95, 0.16, 0.3]]) {
    const m = new THREE.Mesh(CROSS_GEO, wood);
    m.scale.set(w, h, 0.16); m.position.set(x, y + dy, z); m.castShadow = true;
    rt.scene.add(m);
  }
  rt.addInteract('churchWitness', { x, z: z + 5 }, '見る　近くの教会', () => {
    honnoSay(rt, '足軽', '南蛮寺じゃ。鐘の音まで、銃声に消される', 3);
  }, { r: 3 });
}

// ---------------- 足軽の流れ：本能寺の内で、信長と共に戦う（docs/honnoji-1582-spec.md） ----------------
// 自分は御殿に詰める近習寄りの足軽。信長（甲冑なし・白い小袖・帯刀）のすぐそばで、門前→本堂→御殿の奥へ退きながら戦い、
// 退路を開いて信長を奥へ移す。最後は史実どおり本能寺は落ち、信長の命で裏門から落ちて二条御所（信忠）へ走る（第二幕）。
// P1 静かな寺 → P2 異変 → P3 門前防衛 → P4 本堂へ退く → P5 信長と共闘 → P6 別棟へ移る → P7 最終防衛 → P8 終局 → 二条御所
// 火は段で進む（1 表の宿坊 → 2 回廊 → 3 煙 → 4 本堂・宿坊（道が塞がる）→ 5 見通しが悪い → 6 御殿の広間（守る所が狭まる））
// 明智は入口ごとの隊で時間差に来る。築地の外に並ぶ兵を実兵へ替え、門・破れた塀・勝手口から入る
const IN = {
  // 最後尾まで門を抜けてから横に開く。門のすぐ内で止めると後列が築地に残る。
  main: [[-22, 50], [-28, 50], [-34, 50], [-42, 50]],
  side: [[GATES.side.x, GATES.side.z - 9], [GATES.side.x, GATES.side.z - 1], [GATES.side.x, GATES.side.z + 5]],
  climb: [[CLIMB.x, CLIMB.z - 9], [CLIMB.x, CLIMB.z - 1], [CLIMB.x, CLIMB.z + 5]],
  ura: [[GATES.ura.x - 11, GATES.ura.z], [GATES.ura.x - 1, GATES.ura.z], [GATES.ura.x + 3.5, GATES.ura.z]],
  katte: [[-47, 113], [-47, 104], [-47, 99]],
};
const HONDO_IN = { x: -51.5, z: 46 };       // 本堂の外陣
const HONDO_FRONT = { x: -45.6, z: 46 };    // 本堂の東の縁
// 本堂から御殿へ移る道。出火した持ち場から出る区間は残すが、火元への再入場は避ける。
// 棟の向きに合わせて線分全体を調べる。中心に近い一点だけでは回廊の端の火を見落とす。
function routeBurning(T, pts) {
  for (const r of T.G.recs) {
    if (r.state < 1) continue;
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0), w = r.w / 2 + 1, d = r.d / 2 + 1;
    const x0 = pts[0][0] - r.x, z0 = pts[0][1] - r.z;
    let leaving = Math.abs(x0 * c - z0 * s) < w && Math.abs(x0 * s + z0 * c) < d;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], ax = a[0] - r.x, az = a[1] - r.z, bx = b[0] - r.x, bz = b[1] - r.z;
      const x = ax * c - az * s, z = ax * s + az * c;
      const ex = bx * c - bz * s, ez = bx * s + bz * c;
      if (leaving) { leaving = Math.abs(ex) < w && Math.abs(ez) < d; continue; }
      const dx = ex - x, dz = ez - z;
      let lo = 0, hi = 1;
      if (Math.abs(dx) < 1e-8) { if (Math.abs(x) > w) continue; }
      else { const t0 = (-w - x) / dx, t1 = (w - x) / dx; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      if (Math.abs(dz) < 1e-8) { if (Math.abs(z) > d) continue; }
      else { const t0 = (-d - z) / dz, t1 = (d - z) / dz; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      // 出口の縁に触れるだけなら戻ったことにはしない。
      if (hi > lo && hi > 1e-6 && lo < 1 - 1e-6) return true;
    }
  }
  return false;
}
const MOVES = {
  watari: { name: '渡り廊下を行く', note: '近い。ただ火が本堂から移りやすい', burn: ['watari'], pts: [[-55, 47], [-56, 49], [-56.9, 49.3], [-57.4, 50.6], [-61.5, 50.6], [-62.4, 47.2], [-63.8, 46], [-66, 47], [-68, 51], [-68, 70], [-68, 79], [-68, 80.6], [-68, 82.2], [-67, 82.2], [-67, 85], [-67, 89], [-61, 89]] },
  niwa: { name: '中庭を突っ切る', note: '開けていて速い。ただ鉄砲に撃たれやすい', burn: ['kairo2'], pts: [[-50, 49], [-50, 51], [-50, 54], [-51, 66], [-52, 75], [-52, 80], [-52, 82.2], [-54, 82.2], [-54, 85], [-54, 89], [-61, 89]] },
  // 裏手：本堂の南の築地（z=40）は柱の間の口からしか抜けられない。まっすぐ南へ下ると塀に当たって立ち止まる。
  urate: { name: '裏手を回る', note: '遠回り。細い道で、少しずつしか来られない', burn: [], pts: [[-52, 44], [-56, 43], [-56, 38.5], [-62, 37], [-70, 38], [-70.5, 50], [-70.5, 70], [-70.5, 79], [-71, 80.6], [-71, 82.2], [-70.6, 82.2], [-70.6, 86.6], [-68, 86.6], [-67, 89], [-61, 89]] },
  shukubo: { name: '宿坊を抜ける', note: '狭い部屋を抜ける。火が迫っている', burn: ['shukuboA'], pts: [[-48, 46], [-44, 50], [-40, 58], [-35.5, 64.5], [-35.5, 68.5], [-38.5, 70], [-41, 70], [-44, 71.5], [-46.5, 80], [-47.5, 88], [-50.5, 88], [-55, 89]] },
  kairo: { name: '回廊を行く', note: '屋根があり守りやすい。詰まりやすい', burn: ['kairo1', 'kairo2'], pts: [[-48, 49.4], [-45.5, 53], [-45, 58], [-45, 70], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2], [-54, 82.2], [-54, 85], [-54, 89], [-61, 89]] },
};
// 御殿の西の口から裏門の土橋へ。案内と自動の歩き手で同じ道を使う。
const HONNO_ESCAPE_PATHS = {
  h8: [[-61, 89], [-65, 89], [-70, 89.3], [-73, 89.3], [-75.5, 89.3], [-75.5, 79], [PT.ura.x, 79], [PT.ura.x, 76], [GATES.ura.x, 76], [PT.uraOut.x, 76]],
  h8n: [[-71, 81.7], [-71, 79.4], [-75.5, 79], [PT.ura.x, 79], [PT.ura.x, 76], [GATES.ura.x, 76], [PT.uraOut.x, 76]],
};
// 御殿の口（最終防衛で明智が入ってくる所）
const GOTEN_IN = {
  north: [[-52, 72], [-52, 80], [-52, 82.2], [-54, 86]],
  east: [[-44, 88], [-48, 88], [-50.5, 88], [-53, 88.5]],
  south: [[-61, 101], [-61, 96.5], [-61, 93]],
  west: [[-76, 86], [-75, 89.3], [-72, 89.3], [-70, 90]],
};
// 移る間（D）は寄せ手と斬り結ばず、奥へ急ぐ（間合い 5 だと堂の口で斬り合ったまま動けず、渡りの口が火で塞がった）。
const NBK = { A: 1.6, B: 4, C: 7.5, D: 1.8, E: 5.5 };   // 信長の間合い（状態ごと）
// 居室から控えの間の襖、北の廊下、回廊の順に出る。門へ直進すると御殿の壁に残る。
// 見回りも出口と曲がり角を順に通す。御殿の壁越しに表門へ直進させない。
// 寝込みを襲われる始まり：御殿の廊下（控えの間の前）から、廊下を東へ抜け、回廊を通って表門へ走る。
const PATROL_PATH = [[PT.start.x, 82.2], [-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 54], [-40, 50], [PT.gateIn.x, PT.gateIn.z], [GATES.main.x - 1.5, GATES.main.z]];
// 門へ着く前に退却の下知が出ても、御殿の出口と回廊を通って本堂の東の口へ向かう。
const HONDO_RETREAT_PATH = [...PATROL_PATH.slice(0, 6), [-42, 50], [-45.5, 46], [-48.5, 46], [HONDO_IN.x, HONDO_IN.z]];
// 書院の各間へ押し戻された人も、襖の開口へ寄ってから北の廊下へ出る。
// 廊下だけの道では、部屋の隅から合流できず、古い印が壁の向こうに残る。
const HONDO_ROOM_PATHS = [-54, -62, -67, -70.6].map((x) => [
  [x, 89], [x, 86.6], [x, 82.2], ...HONDO_RETREAT_PATH.slice(1),
]);
const PATROL_ROOM_PATHS = [-54, -62, -67, -70.6].map((x) => [
  [x, 89], [x, 86.6], [x, 82.2], ...PATROL_PATH.slice(1),
]);
// 足軽は表門の内側から見回る。回廊の遠回りで、最初の寄せ手とすれ違わせない。
const PATROL_START = { x: PT.start.x, z: PT.start.z };
// 開いた表門を抜けた少人数が、門の内側の持ち場へ寄せる。
// 外の備えから先鋒を替える。塀・宿坊・回廊の柱を横切らず、三〜七歩でぶつかる。
const PATROL_SKIRMISH = [[GATES.main.x - 2, GATES.main.z], [PT.gateIn.x, PT.gateIn.z], [-40, 50]];
// 少数の先手だけが回廊を奥へ進む。門内で全員を待たせ、廊下を歩く本人とすれ違わせない。
const PATROL_ADVANCE = [...PATROL_SKIRMISH, [-45, 54], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2]];

// 人の幅を含めて壁・柱・建物を確かめる。道案内だけ半秒ごとに使う。
function pointSegDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
function patrolClear(rt, x, z, from = null) {
  const p = from || rt.player.u.pos, q = rt.flags.patrolProbe || (rt.flags.patrolProbe = { x: 0, y: 0, z: 0 });
  q.x = x; q.z = z; q.y = p.y;
  if (rt.army.wallBetween(p, -1, q)) return false;
  // 点を刻む検査だけでは、襖の端を斜めにかすめる道を見落とす。
  // 壁の線分は体の幅を足して、道全体との最短距離を調べる。
  for (const w of rt.army.solids) {
    if (w.k !== 's' || (w.struct && (!w.struct.alive || w.struct.opened)) ||
        (w.yTop != null && p.y >= w.yTop - 0.05) || (w.yBot != null && p.y + (w.bodyOverlap ? 1.7 : 0) < w.yBot)) continue;
    const r = w.r + (w.naka != null ? 0.3 : 0.45);
    if (Math.max(p.x, x) < w.x0 - r || Math.min(p.x, x) > w.x1 + r ||
        Math.max(p.z, z) < w.z0 - r || Math.min(p.z, z) > w.z1 + r) continue;
    const dx = x - p.x, dz = z - p.z, wx = w.bx - w.ax, wz = w.bz - w.az;
    const along = Math.max(0, Math.min(1, ((p.x - w.ax) * wx + (p.z - w.az) * wz) / (wx * wx + wz * wz || 1)));
    const nx = p.x - w.ax - wx * along, nz = p.z - w.az - wz * along;
    // 押し合いで壁際へ寄った人には、壁から離れる道を残す。
    if (Math.hypot(nx, nz) < r && nx * dx + nz * dz > 1e-8) continue;
    const det = dx * wz - dz * wx;
    if (Math.abs(det) > 1e-8) {
      const ax = w.ax - p.x, az = w.az - p.z, t = (ax * wz - az * wx) / det, u = (ax * dz - az * dx) / det;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return false;
    }
    if (Math.min(pointSegDistance(x, z, w.ax, w.az, w.bx, w.bz), pointSegDistance(p.x, p.z, w.ax, w.az, w.bx, w.bz),
      pointSegDistance(w.ax, w.az, p.x, p.z, x, z), pointSegDistance(w.bx, w.bz, p.x, p.z, x, z)) < r) return false;
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / 0.25));
  for (let j = 1; j <= steps; j++) {
    const px = p.x + (x - p.x) * j / steps, pz = p.z + (z - p.z) * j / steps;
    if (!rt.world.walkable(px, pz, p.y)) return false;
    for (const w of rt.army.solids) {
      if (w.k === 's') continue; // 壁の線分は上で道全体を確認済み。
      const r = w.naka != null ? 0.3 : 0.45;
      if (px < w.x0 - r || px > w.x1 + r || pz < w.z0 - r || pz > w.z1 + r ||
          (w.struct && (!w.struct.alive || w.struct.opened)) || (w.yTop != null && p.y >= w.yTop - 0.05) ||
          (w.yBot != null && p.y + (w.bodyOverlap ? 1.7 : 0) < w.yBot)) continue;
      if (w.k === 'r') {
        const dx = px - w.x, dz = pz - w.z, lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
        if (Math.hypot(lx - Math.max(-w.hw, Math.min(w.hw, lx)), lz - Math.max(-w.hd, Math.min(w.hd, lz))) < r) return false;
      } else if (w.k === 'c') {
        if (Math.hypot(px - w.x, pz - w.z) < w.r + r) return false;
      } else {
        const dx = w.bx - w.ax, dz = w.bz - w.az;
        const a = Math.max(0, Math.min(1, ((px - w.ax) * dx + (pz - w.az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(px - w.ax - dx * a, pz - w.az - dz * a) < w.r + r) return false;
      }
    }
  }
  return true;
}

// 表門から歩いて来る後続。閉門へ走る道の途中で、目前に兵を出さない。
// 門の近くで寄せ手が途切れた時だけ、外の備えから四人を替える。
function patrolReinforce(rt) {
  const p = rt.player.u.pos, guide = rt.flags.patrolGuide;
  // 閉門へ走る間は、御殿や回廊の目前に後続を出さない。
  // 表門に近づいてからだけ寄せ、同じ四人を倒すたびに道を塞がない。
  if (rt.flags.patrolDistance > 12 || rt.t < (rt.flags.patrolNext || 0)) return;
  let alive = 0;
  for (const u of rt.army.units) if (u.alive) alive++;
  // 枠が埋まっている時は次の半秒で調べ直す。待ちの波を重ねて予約しない。
  if (alive + 4 > 240) return;
  for (let i = PATROL_PATH.length - 1; i > 0; i--) {
    const a = PATROL_PATH[i - 1], b = PATROL_PATH[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    // 門に近い側から探し、見回りの道を逆向きに来る先手として見せる。
    for (let along = length; along >= 0; along -= 2) {
      const x = a[0] + dx * along / length, z = a[1] + dz * along / length;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 6 || d > 10 || x >= GATES.main.x - 1.6 ||
          (x - p.x) * (guide.x - p.x) + (z - p.z) * (guide.z - p.z) <= 0 ||
          !patrolClear(rt, x - 0.4, z) || !patrolClear(rt, x + 0.4, z) ||
          !patrolClear(rt, x - 0.4, z - 1.4) || !patrolClear(rt, x + 0.4, z - 1.4)) continue;
      // 四人の先手。外の備えから人数を引き、開いた表門から入った先鋒に替える。
      const g = akechi(rt, '表門から寄せる明智の後続', [...PATROL_SKIRMISH, [x, z]], [uA(4)], { player: true });
      if (g) { rt.flags.scouts = g; rt.flags.patrolQuiet = 0; rt.flags.patrolNext = rt.t + 12; }
      return;
    }
  }
}

// 道を抜けた先手は、後列の到着待ちで止まらず近習へ打ちかかる。
// 塀越しの兵を数えず、相手が途切れた時だけ一隊を自分へ向ける。
const HONDO_PRESSURE_PATH = [...IN.main, [-42, 47], [-45.5, 46], [-48.5, 46], [-52, 46]];
function honnoGrounded(rt) {
  const F = rt.flags;
  const down = !rt.player.u.alive || rt.player.u.hp <= 0;
  if (rt.t < (F.honnoGroundAt || 0) && !(down && !F.honnoGroundDown)) return;
  F.honnoGroundAt = rt.t + 0.5;
  F.honnoGroundDown = down;
  // 押し合いなどで高い所へ出た兵も、寺の廊下・庭の足場へ戻す。二条の射座は対象外。
  // 重傷の直前にも戻す。死亡後の早戻りで補正を飛ばし、屋根に亡骸を残さない。
  for (const u of rt.army.units) {
    if (u.isStruct || u.gone || !inTera(u.pos.x, u.pos.z)) continue;
    const base = rt.world.heightAt(u.pos.x, u.pos.z);
    if (u.pos.y <= base + 1.8) continue;
    u.pos.y = groundAt(rt.world, u.pos.x, u.pos.z, base);
    u.mesh.position.y = u.pos.y;
  }
}
function honnoPressure(rt) {
  const F = rt.flags, P = rt.player.u, p = P.pos;
  if (rt.over || F.ending || !P.alive || rt.t < (F.honnoPressureAt || 0)) return;
  F.honnoPressureAt = rt.t + 0.5;
  const active = rt.G.lord ? F.lstep >= 1 && F.lstep < 3 : F.hp >= 2 && F.hp <= 7;
  if (!active) return;
  let near = 0, first = null, d1 = 18;
  for (const g of F.foes || []) {
    if (g.honnoPlayerFocus) {
      g.focus = g.honnoSavedFocus?.alive ? g.honnoSavedFocus : null;
      g.honnoSavedFocus = null; g.honnoPlayerFocus = false;
    }
    if (g.gate?.alive || g.order === 'hold' || g.order === 'assault' || gone(g)) continue;
    let front = 18, atEnd = false;
    const end = g.path?.[g.path.length - 1];
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.type === 'gun' || u.type === 'bow') continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d >= 18 || Math.abs(u.pos.y - p.y) > 3 || rt.army.wallBetween(p, -1, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
      if (d <= 8) near++;
      front = Math.min(front, d);
      if (end && Math.hypot(u.pos.x - end[0], u.pos.z - end[1]) < 2) atEnd = true;
    }
    // 最後の曲がり角を通った先手が着いた時だけ隊を開く。門と塀の道順は飛ばさない。
    // 道の途中で詰まった隊（味方の体や襖の口で止まる・最後の点に届かない）、目の前に敵がいる隊も、そこで打ちかかる。
    //   道の終わりを待つと、壁の内で敵が並んで突っ立ったままになっていた（10/10 kaito「敵勢攻めてこない」）
    if (g.order === 'path' && end && g.onArrive && !atEnd) {
      let best = 1e9, close = false;
      for (const u of g.units) {
        if (!u.alive) continue;
        best = Math.min(best, Math.hypot(u.pos.x - end[0], u.pos.z - end[1]));
        // 廊下への先鋒は、門番を見ただけで進路を捨てない。
        // 本人と斬り結ぶ時か、廊下まで踏み込んだ時に隊を開く。
        if (!close && rt.army.nearestEnemy(u, 3.5, (o) => !o.fleeing &&
            (!g.honnoPatrolAdvance || o.isPlayer && !rt.army.wallBetween(u.pos, -1, o.pos)))) close = true;
      }
      const pr = g.honnoProg || (g.honnoProg = { d: best, t: rt.t });
      if (best < pr.d - 0.3) { pr.d = best; pr.t = rt.t; }
      if (close || (g.pathIdx >= g.path.length - 1 && rt.t - pr.t > 2.5)) atEnd = true;
    }
    if (g.order === 'path' && end && atEnd && g.onArrive) {
      const arrive = g.onArrive; g.onArrive = null; arrive(g);
    }
    if (g.order !== 'attack') continue;
    // 上様や供を狙う隊は、その相手を守る。全隊を自分へ向けると退き口が消える。
    if (!g.focus?.alive && front < d1) { first = g; d1 = front; }
  }
  // 退く最中は、供を追う隊まで自分へ向けて退路を塞がない。
  // 門へ走る間（hp 2）も、先鋒の一隊を丸ごと自分へ向けない。そばの兵は自分から打ちかかり、残りは馬廻と斬り合う。
  if (first && near < 6 && (rt.G.lord || (F.hp !== 2 && F.hp !== 4 && F.hp !== 6))) {
    first.honnoSavedFocus = first.focus; first.focus = P; first.honnoPlayerFocus = true;
  }
  // 本堂・御殿の守りで追撃が途切れた時だけ、通れる道の六〜十歩先へ外の備えを替える。
  // 四人とも柱・壁を避け、総数の枠と備えの在庫は akechi で守る。
  F.honnoQuiet = near >= 3 ? 0 : (F.honnoQuiet || 0) + 0.5;
  const goten = F.hp === 7;
  if (rt.G.lord || (F.hp !== 5 && F.hp !== 7) || F.honnoQuiet < (goten ? 1.5 : 4) || rt.t < (F.honnoFollowAt || 0)) return;
  F.honnoFollowAt = rt.t + (goten ? 4.5 : 8);
  let alive = 0, nearby = 0;
  for (const u of rt.army.units) {
    if (!u.alive) continue;
    alive++;
    // 戸口の向こうや八歩より遠くの追手も数える。囲みの補充と二重に足さない。
    if (u.team !== P.team && !u.isStruct && !u.noTarget && !u.fleeing && !u.woundOut &&
        Math.abs(u.pos.y - p.y) < 3 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 16) nearby++;
  }
  if (alive + 4 > 240 || nearby + 4 > (goten ? 10 : 14)) return;
  const routes = F.hp <= 5 ? [HONDO_PRESSURE_PATH] : F.hp === 6
    ? (F.mv ? [MOVES[F.mv].pts] : []) : Object.values(GOTEN_IN);
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (!len) continue;
    for (let step = 0; step <= len; step += 2) {
      const x = a[0] + dx * step / len, z = a[1] + dz * step / len, d = Math.hypot(x - p.x, z - p.z);
      if (d < 6 || d > 10 || !inTera(x, z) || !patrolClear(rt, x - 0.4, z) || !patrolClear(rt, x + 0.4, z) ||
          !patrolClear(rt, x - 0.4, z - 1.4) || !patrolClear(rt, x + 0.4, z - 1.4)) continue;
      const g = akechi(rt, '寺内へ続く明智の追手', [[x, z], [p.x, p.z]], goten ? [uS(1), uA(3)] : [uA(4)], { entered: true, player: true, dmg: goten ? 1.2 : 1 });
      if (g) F.honnoQuiet = 0;
      return;
    }
  }
}

// 肩位置を選び直した後も軒裏・天井を越えない。本能寺の数個の箱だけを調べる。
// 柱や庭の通行は変えず、燃えて沈む高さも既存の棟の値から読む。
function templeRoofFraction(T, a, p, ay, by, margin = 0) {
  if (!T.sightRoofs) return 1;
  let nearest = 1;
  for (const roof of T.sightRoofs) {
    const r = roof.rec;
    if (r.honnoRubble) continue;
    const k = r.collapseScale || 1;
    const ax = (a.x - r.x) * roof.cs - (a.z - r.z) * roof.sn;
    const az = (a.x - r.x) * roof.sn + (a.z - r.z) * roof.cs;
    const bx = (p.x - r.x) * roof.cs - (p.z - r.z) * roof.sn;
    const bz = (p.x - r.x) * roof.sn + (p.z - r.z) * roof.cs;
    let low = 0, high = nearest;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? ax : axis === 1 ? ay : az;
      const delta = (axis === 0 ? bx : axis === 1 ? by : bz) - start;
      const bottom = (axis === 0 ? -roof.w : axis === 1 ? r.y0 + roof.bottom * k : -roof.d) - margin;
      const top = (axis === 0 ? roof.w : axis === 1 ? r.y0 + roof.top * k : roof.d) + margin;
      if (Math.abs(delta) < .00001) {
        if (start < bottom || start > top) { high = -1; break; }
      } else {
        const t0 = (bottom - start) / delta, t1 = (top - start) / delta;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      }
      if (low > high) break;
    }
    if (low <= high) nearest = Math.min(nearest, low);
  }
  return nearest;
}

// 肩越しの補正で視点だけが回った後も、画面の左右と下知をそろえる。
// 見回し前の本人の向きではなく、実際に映した向きを使う。点は作らない。
function templeViewYaw(rt) {
  const q = rt.camera?.quaternion;
  if (!q) return rt.player.yaw + (rt.player.camYawOff || 0);
  const x = -2 * (q.x * q.z + q.w * q.y), z = 2 * (q.x * q.x + q.y * q.y) - 1;
  return Math.hypot(x, z) > .001 ? Math.atan2(x, z) : rt.player.yaw + (rt.player.camYawOff || 0);
}

// 戸口の実際の交点で、視点の通る幅と高さを確かめる。
// 開いた襖も滑った先の位置で調べる。鴨居と閉じた戸は残す。
function cameraDoorClear(hall, wall, cross, y) {
  if (y < hall.rec.y0 + 0.3 || y > hall.rec.y0 + 1.9) return false;
  const [ax, az, bx, bz, kind, doors] = wall;
  const alongX = Math.abs(bz - az) < 0.001, margin = 0.3;
  if (kind === 'wall') {
    for (const [mid, width] of doors) if (Math.abs(cross - mid) < width / 2 - margin) return true;
    return false;
  }
  // 柱のすぐ際は開口でも視点を通さない。
  if (cross < (alongX ? ax : az) + margin || cross > (alongX ? bx : bz) - margin) return false;
  for (const panel of hall.panels) {
    if (!panel.alive || !!panel.ax !== alongX ||
        Math.abs((alongX ? panel.z : panel.x) - (alongX ? az : ax)) > 0.15) continue;
    const slide = panel.open * panel.open * (3 - 2 * panel.open);
    const center = (alongX ? panel.x : panel.z) + slide * panel.slide * panel.pw * 0.96;
    if (Math.abs(cross - center) < panel.pw / 2 + margin) return false;
  }
  return true;
}

// 戸口の空いた幅を直進時と回り道で共用し、柱際を案内しない。
function routeDoorOpening(rt, hall, wall, cross) {
  const [ax, az, bx, bz] = wall, alongX = Math.abs(bz - az) < .001;
  let low = alongX ? ax : az, high = alongX ? bx : bz;
  if (wall[4] === 'wall') {
    for (const [mid, width] of wall[5]) if (Math.abs(cross - mid) < width / 2 - .3) {
      low = mid - width / 2; high = mid + width / 2; break;
    }
  } else for (const panel of hall.panels) {
    if (!panel.alive || !!panel.ax !== alongX ||
        Math.abs((alongX ? panel.z : panel.x) - (alongX ? az : ax)) > .15) continue;
    const slide = panel.open * panel.open * (3 - 2 * panel.open);
    const center = (alongX ? panel.x : panel.z) + slide * panel.slide * panel.pw * .96;
    if (center < cross) low = Math.max(low, center + panel.pw / 2);
    else high = Math.min(high, center - panel.pw / 2);
  }
  // 隣り合う戸が開いていても、壁一面でなく今くぐる口だけを囲む。
  const width = Math.min(2.4, high - low);
  const mid = Math.max(low + width / 2, Math.min(high - width / 2, cross));
  low = mid - width / 2; high = mid + width / 2;
  const opening = rt.flags.routeOpening || (rt.flags.routeOpening = {});
  opening.low = low; opening.high = high; opening.mid = (low + high) / 2;
  return opening;
}

function routeDoorFrame(rt, sign, hall, wall, opening) {
  const [ax, az, bx, bz] = wall, alongX = Math.abs(bz - az) < .001;
  sign.x = alongX ? opening.mid : ax;
  sign.z = alongX ? az : opening.mid;
  sign.dirX = alongX ? 0 : Math.sign(ax - rt.player.u.pos.x) || 1;
  sign.dirZ = alongX ? Math.sign(az - rt.player.u.pos.z) || 1 : 0;
  const frame = rt.flags.routeDoorFrame || (rt.flags.routeDoorFrame = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })));
  for (let i = 0; i < 4; i++) {
    const edge = i < 2 ? opening.low + .12 : opening.high - .12;
    frame[i].x = alongX ? edge : ax; frame[i].z = alongX ? az : edge;
    frame[i].y = hall.rec.y0 + (i === 1 || i === 2 ? 1.9 : .12);
  }
  sign.frame = frame;
}

function pathGuide(rt, pts, end, guide) {
  const p = rt.player.u.pos;
  let best = Infinity, bestJoin = Infinity, rest = 0;
  // 通れる道への合流点から門までを足す。角を通り過ぎても手前の点へ戻さない。
  for (let i = end; i > 0; i--) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (!length) continue;
    const s = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (length * length)));
    const x = a[0] + dx * s, z = a[1] + dz * s, join = Math.hypot(p.x - x, p.z - z);
    const distance = join + length * (1 - s) + rest;
    if ((join < bestJoin - 0.01 || (Math.abs(join - bestJoin) <= 0.01 && distance < best)) && patrolClear(rt, x, z)) {
      const along = join < 1.2 && patrolClear(rt, b[0], b[1]);
      // 合流点が足元だと歩き手が止まる。角の先がまだ見えない時も、一歩先へ進める。
      const ahead = join < 1.2 ? Math.min(1, s + 1.5 / length) : s;
      const gx = along ? b[0] : a[0] + dx * ahead, gz = along ? b[1] : a[1] + dz * ahead;
      if ((distance > 0.5 && Math.hypot(gx - p.x, gz - p.z) < 0.4) || !patrolClear(rt, gx, gz)) { rest += length; continue; }
      best = distance; bestJoin = join;
      guide.x = gx; guide.z = gz;
      // 次の角から先の向きも渡し、閉じた襖へ直進する矢印にしない。
      const next = along && i < end ? pts[i + 1] : b;
      const nx = next[0] - gx, nz = next[1] - gz, span = Math.hypot(nx, nz);
      guide.dirX = span > .01 ? nx / span : dx / length;
      guide.dirZ = span > .01 ? nz / span : dz / length;
    }
    rest += length;
  }
  return best;
}

function escapeGuide(rt) {
  const F = rt.flags, pts = HONNO_ESCAPE_PATHS[F.escapePath];
  const distance = pathGuide(rt, pts, pts.length - 1, F.escapeGuide);
  if (Number.isFinite(distance)) F.escapeDistance = distance;
}

// 先に御殿へ着いても、主君を置いていかない。戻る時も同じ戸口と曲がり角を通す。
// 点と配列は道を決めた時の物を使い回す。遅れた人は前へ、先行した人は戻す。
function moveGuide(rt) {
  const F = rt.flags, pts = MOVES[F.mv].pts;
  let distance;
  if (F.escortShown) {
    const nb = F.nb.pos, p = rt.player.u.pos;
    let at = 0, best = Infinity, nbAlong = 0, playerAlong = 0, playerBest = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const s = Math.max(0, Math.min(1, ((nb.x - a[0]) * dx + (nb.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(a[0] + dx * s - nb.x, a[1] + dz * s - nb.z);
      if (d < best) { best = d; at = i; nbAlong = i - 1 + s; }
      const ps = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const pd = Math.hypot(a[0] + dx * ps - p.x, a[1] + dz * ps - p.z);
      if (pd < playerBest) { playerBest = pd; playerAlong = i - 1 + ps; }
    }
    let end = 0;
    if (playerAlong <= nbAlong) {
      for (let i = 0; i < at; i++) F.mvReturnPts[end++] = pts[i];
    } else {
      for (let i = pts.length - 1; i >= at; i--) F.mvReturnPts[end++] = pts[i];
    }
    F.mvReturnPoint[0] = nb.x; F.mvReturnPoint[1] = nb.z;
    F.mvReturnPts[end] = F.mvReturnPoint;
    distance = pathGuide(rt, F.mvReturnPts, end, F.mvGuide);
  } else distance = pathGuide(rt, pts, pts.length - 1, F.mvGuide);
  if (Number.isFinite(distance)) F.moveDistance = distance;
}

function patrolGuide(rt) {
  const F = rt.flags, end = F.hp === 2 ? PATROL_PATH.length - 1 : PATROL_PATH.length - 2;
  let distance = pathGuide(rt, PATROL_PATH, end, F.patrolGuide);
  // 押されて控えの間へ入った時は、前の廊下の印を壁越しに残さない。
  if (!Number.isFinite(distance) && rt.player.u.pos.z > 80) {
    const probe = F.patrolRoomProbe || (F.patrolRoomProbe = { x: 0, z: 0 });
    for (const pts of PATROL_ROOM_PATHS) {
      const d = pathGuide(rt, pts, pts.length - (F.hp === 2 ? 1 : 2), probe);
      if (d < distance) { distance = d; F.patrolGuide.x = probe.x; F.patrolGuide.z = probe.z; F.patrolGuide.dirX = probe.dirX; F.patrolGuide.dirZ = probe.dirZ; }
    }
  }
  if (Number.isFinite(distance)) F.patrolDistance = distance;
}

function hondoGuide(rt) {
  const F = rt.flags;
  // 本堂で守る間も、押されて外へ出た人を壁越しの上様へ向かわせない。
  F.hondoDirect = F.hp === 5 && patrolClear(rt, F.nb.pos.x, F.nb.pos.z);
  if (F.hondoDirect) {
    F.hondoGuide.x = F.nb.pos.x; F.hondoGuide.z = F.nb.pos.z;
    F.hondoDistance = Math.hypot(rt.player.u.pos.x - F.nb.pos.x, rt.player.u.pos.z - F.nb.pos.z);
    return;
  }
  let distance = pathGuide(rt, HONDO_RETREAT_PATH, HONDO_RETREAT_PATH.length - 1, F.hondoGuide);
  if (rt.player.u.pos.z > 80 && !Number.isFinite(distance)) {
    const probe = F.hondoRoomProbe || (F.hondoRoomProbe = { x: 0, z: 0 });
    for (const pts of HONDO_ROOM_PATHS) {
      const d = pathGuide(rt, pts, pts.length - 1, probe);
      if (d < distance) { distance = d; F.hondoGuide.x = probe.x; F.hondoGuide.z = probe.z; F.hondoGuide.dirX = probe.dirX; F.hondoGuide.dirZ = probe.dirZ; break; }
    }
  }
  if (Number.isFinite(distance)) F.hondoDistance = distance;
}

// 書院の廊下と襖の口。壁越しの上様の印へ直進させず、開口を通って戻る。
// 少数の点と作業用の配列を使い回し、半秒に一度だけ調べる。
const GUARD_POINTS = [[-52, 77.5], [-52, 82.2], [-54, 82.2], [-62, 82.2], [-67, 82.2], [-70.6, 82.2],
  [-54, 85], [-54, 89], [-62, 85], [-62, 89], [-67, 85], [-67, 89], [-70.6, 86.6], [-68, 86.6]];
const GUARD_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [3, 8], [8, 9],
  [4, 10], [10, 11], [5, 12], [12, 13], [13, 11], [7, 9], [9, 11]];
// 戻る道は燃える広間を横切らない。中にいる時は、外への一方向の退避だけを許す。
function guardClear(rt, x, z, from = rt.player.u.pos) {
  if (!patrolClear(rt, x, z, from)) return false;
  const hot = rt.flags.heatZone;
  if (!hot) return true;
  const x0 = hot.x0 - 0.25, x1 = hot.x1 + 0.25, z0 = hot.z0 - 0.25, z1 = hot.z1 + 0.25;
  if (x > x0 && x < x1 && z > z0 && z < z1) return false;
  if (from.x > x0 && from.x < x1 && from.z > z0 && from.z < z1) return true;
  let lo = 0, hi = 1;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis ? from.z : from.x, delta = (axis ? z : x) - start;
    const low = axis ? z0 : x0, high = axis ? z1 : x1;
    if (Math.abs(delta) < 0.0001) { if (start <= low || start >= high) return true; }
    else {
      const a = (low - start) / delta, b = (high - start) / delta;
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      if (lo >= hi) return true;
    }
  }
  return false;
}
function guardGuide(rt) {
  const F = rt.flags, p = rt.player.u.pos, nb = F.nb.pos, q = F.guardGuide;
  F.guardDirect = guardClear(rt, nb.x, nb.z);
  if (F.guardDirect) { q.x = nb.x; q.z = nb.z; F.guardDistance = Math.hypot(p.x - nb.x, p.z - nb.z); return; }
  const nodes = F.guardNodes, dist = F.guardDist, used = F.guardUsed, open = F.guardOpen;
  // 火の入った広間の中の点は道に使わない（戻る印が燃える広間を通ると、そこで焼かれる）。
  const Z = F.heatZone, hot = (n) => !!Z && n.x > Z.x0 && n.x < Z.x1 && n.z > Z.z0 && n.z < Z.z1;
  used.fill(0);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; n.y = p.y;
    dist[i] = !hot(n) && guardClear(rt, nb.x, nb.z, n) ? Math.hypot(n.x - nb.x, n.z - nb.z) : Infinity;
  }
  for (let i = 0; i < GUARD_EDGES.length; i++) {
    const [a, b] = GUARD_EDGES[i];
    open[i] = !hot(nodes[a]) && !hot(nodes[b]) && guardClear(rt, nodes[b].x, nodes[b].z, nodes[a]) ? 1 : 0;
  }
  for (let k = 0; k < nodes.length; k++) {
    let at = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!used[i] && dist[i] < best) { at = i; best = dist[i]; }
    if (at < 0) break;
    used[at] = 1;
    for (let i = 0; i < GUARD_EDGES.length; i++) {
      if (!open[i]) continue;
      const [a, b] = GUARD_EDGES[i], to = a === at ? b : b === at ? a : -1;
      if (to < 0 || used[to]) continue;
      const d = best + Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      if (d < dist[to]) dist[to] = d;
    }
  }
  let best = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], d = Math.hypot(p.x - n.x, p.z - n.z);
    if (d < 0.4 || d + dist[i] >= best || hot(n) || !guardClear(rt, n.x, n.z)) continue;
    best = d + dist[i]; q.x = n.x; q.z = n.z;
  }
  // 広間の角からは出口を直接見通せない。中にいる人だけ、襖の口の手前を一度通って出す。
  // 外へ出た後はこの案内を使わず、燃える部屋へ戻さない。
  if (!Number.isFinite(best) && hot(p)) for (const n of nodes) {
    if (!hot(n) || !patrolClear(rt, n.x, n.z)) continue;
    for (let i = 0; i < nodes.length; i++) {
      const out = nodes[i];
      if (hot(out) || !Number.isFinite(dist[i]) || !guardClear(rt, out.x, out.z, n)) continue;
      const d = Math.hypot(p.x - n.x, p.z - n.z) + Math.hypot(n.x - out.x, n.z - out.z) + dist[i];
      if (d < best) { best = d; q.x = n.x; q.z = n.z; }
    }
  }
  if (Number.isFinite(best)) F.guardDistance = best;
  else if (F.mv) {
    const oldX = q.x, oldZ = q.z;
    const pts = MOVES[F.mv].pts, d = pathGuide(rt, pts, pts.length - 1, q);
    if (Number.isFinite(d) && guardClear(rt, q.x, q.z)) F.guardDistance = d;
    else { q.x = oldX; q.z = oldZ; }
  }
}

// 案内だけを切り替える。敵の動き・当たり・閉門の条件は変えない。
function gateFight(rt) {
  const F = rt.flags;
  if (rt.t >= (F.gateLookAt || 0)) {
    F.gateLookAt = rt.t + 0.25;
    F.gateEnemy = rt.army.nearestEnemy(rt.player.u, 5, (u) => !u.fleeing && !u.woundOut &&
      Math.abs(u.pos.y - rt.player.u.pos.y) < 3 && !rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, u.pos));
    F.gateFight = !!F.gateEnemy;
    const enemy = F.gateEnemy;
    F.gateEnemyVisible = !!enemy && sightScreenUnit(rt, enemy);
    // 視界の外でも、通れる近い敵には道を示す。襖越しの敵は追わせない。
    F.gateApproach = enemy && !F.gateEnemyVisible &&
      !rt.def.sightBlocked(rt, rt.player.u.pos, enemy.pos, rt.player.u.pos.y + 1.2, enemy.pos.y + 1.2) ? enemy : null;
  }
  if (F.gateFight && F.hp < 4 && Math.hypot(rt.player.u.pos.x - GATES.main.x, rt.player.u.pos.z - GATES.main.z) < 18) courtClashGround(rt);
  return F.gateFight && F.gateEnemyVisible;
}

function patrolLabel(rt) {
  const p = rt.player.u.pos;
  if (rt.flags.hp === 2 && Math.hypot(p.x - GATES.main.x, p.z - GATES.main.z) < 6) {
    const blocker = gateBlocker(rt);
    if (blocker) return blocker.team === 1 ? '門の敵を押し返す' : '門の内へ下がる';
    return '門をしめる';
  }
  if (rt.flags.hp !== 2) return '門の内へ';
  if (p.z > 79) return '印へ進もう';
  if (p.z > 55) return '回廊を ぬけて おもて門へ';
  return 'おもて門の内へ';
}
// 門の内まで来て斬り結んでいる人を、距離の札だけで再び門へ走らせない。
function gateDefending(rt) {
  const p = rt.player.u.pos;
  return rt.flags.hp === 3 && (rt.flags.patrolDistance <= 10 ||
    p.x < GATES.main.x && Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) < 12 && gateFight(rt));
}
const NB_GATE_PATH = [[-67, 89], [-62, 89], [-62, 82.2], [-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 64], [-44, 54], [-40, 50]];

// 段の切れ目の一息：寄せ手が途切れた間に、そばの小姓が布で傷を縛る（手当ての布を一枚使う）。
// 目の前に敵がいる時、布が無い時、傷が浅い時は縛らない。一撃の重さはそのまま。
// 段の切れ目：馬廻・小姓衆が自分の前の寄せ手へ斬り込み、数歩押し返す（兵は減らさない）。
// 押された兵は一瞬よろめき、狙いを外す。その間に上様と次の場へ移り、布を巻く。
function pushBack(rt, r, who, text) {
  const u = rt.player.u;
  let n = 0;
  for (const o of rt.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.isStruct || o.noTarget) continue;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
    if (d > r || Math.abs(o.pos.y - u.pos.y) > 2.5) continue;
    const l = d || 1;
    o.push.x += dx / l * 5; o.push.z += dz / l * 5;
    o.stagger = Math.max(o.stagger || 0, 1.4);
    o.atk = null; o.swing = null; o.target = null; o.cd = Math.max(o.cd || 0, 1.6); o.aiT = 0.8;
    n++;
  }
  if (n && text) honnoSay(rt, who, text, 3);
  return n;
}
// 味方が口を支える間（sec 秒）、at から r の内の寄せ手の組はその場で斬り合い、追って来ない。兵は減らさない。
function holdFoes(rt, at, r, sec, aggro = 3) {
  const F = rt.flags, held = [];
  for (const g of F.foes) {
    if (gone(g) || g.order === 'hold') continue;
    const c = centerOf(g);
    if (Math.hypot(c.x - at.x, c.z - at.z) > r) continue;
    held.push({ g, aggro: g.aggro, focus: g.focus });
    g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.aggro = aggro; g.focus = null;
    for (const u of g.units) if (u.alive && u.target && !(u.target.pos && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) <= aggro)) u.target = null;
  }
  rt.after(sec, () => {
    for (const h of held) if (!gone(h.g) && h.g.order === 'hold') {
      h.g.order = 'attack'; h.g.aggro = h.aggro || 9; h.g.seekRange = 30; h.g.focus = h.focus?.alive ? h.focus : null;
    }
  });
}
// 寄せ手が途切れる数秒の間、半秒ごとに縛れるか見る。
function bindWindow(rt, hp, from, to, who) {
  for (let t = from; t <= to; t += 0.5) rt.after(t, () => { const F = rt.flags; if (F.hp === hp && !F.bound?.[hp] && koshoBind(rt, who)) (F.bound || (F.bound = {}))[hp] = true; });
}
function koshoBind(rt, who = '小姓', r = 4) {
  const p = rt.player, u = p.u, F = rt.flags;
  if (!u.alive || F.ending || rt.over || p.treatmentLeft <= 0) return false;
  if (u.hp >= u.maxHp * 0.6 && !(u.wounds?.bleed > 0.0001)) return false;
  let close = false;
  rt.army.forNear(u.pos.x, u.pos.z, r, (o) => { if (o.alive && o.team !== u.team && !o.fleeing && !o.isStruct && !o.noTarget && !(o.stagger > 0.3)) close = true; });
  if (close) return false;
  p.treatmentLeft--; p.bandaged = true; p.treatmentNext = rt.t + 45;
  bindWound(u);
  if (u.wounds) u.wounds.bleed = 0;
  u.hp = Math.max(u.hp, Math.min(u.maxHp * 0.6, u.hp + u.maxHp * 0.25));
  honnoSay(rt, who, `${nm(rt)}、傷を縛る。じっとしておれ！`, 2.5);
  rt.hud.flash(`${who}が布で傷を縛った（あと${p.treatmentLeft}回）`, 'dim');
  return true;
}
function nbSet(rt, st, o = {}) {
  const F = rt.flags, g = F.nbG;
  if (!g || !F.nb || !F.nb.alive) return;
  F.nbSt = st; F.nbGoal = null;
  g.aggro = NBK[st];
  // 移る間は弓を番えない（遠くの敵を狙って居室に立ち止まり、表へ出て来なくなる）
  const u = F.nb;
  u.range = st === 'C' && u.wpnKind === 'bow' ? 60 : 0;
  if (st !== 'C') { u.target = null; u.atk = null; }
  if (st === 'D') {
    g.order = 'path'; g.path = o.pts.map((p) => [p[0], p[1]]); g.pathIdx = 0; g.speed = 3.3;
    const last = o.pts[o.pts.length - 1];
    F.nbGoal = { x: last[0], z: last[1] }; F.nbDT = rt.t;
    g.onArrive = () => { nbSet(rt, o.then || 'E', { at: F.nbGoal }); if (o.done) o.done(); };
  } else { g.order = 'hold'; g.anchor = { x: o.at.x, z: o.at.z }; g.onArrive = null; if (o.facing != null) g.facing = o.facing; }
}
// 名のある者の遠い声は共通の使番が運ぶ。無名の叫びは近い実兵だけ。
// 話し手が倒れたり、遠く離れたりした場合も、戦の進行自体は止めない。
function honnoSay(rt, speaker, text, duration = 4) {
  if (!speaker || rt.flags.ending || speaker === '使番') { rt.say(speaker, text, duration); return; }
  const F = rt.flags, p = rt.player.u.pos;
  let from = null;
  for (const u of rt.army.units) {
    if (u.alive && u.name === speaker) { from = u; break; }
  }
  if (!from && speaker === '織田信長' && rt.G.lord) from = rt.player.u;
  if (from) {
    // 信長で遊ぶ時は共通の使番を使わないので、聞こえる範囲だけ。
    // 狭い寺の中。使番に運ばせず、叫び声として届く所（四十歩）までは、その場で聞こえる。
    const d = Math.hypot(from.pos.x - p.x, from.pos.z - p.z);
    if (rt.G.lord ? d <= 25 : d <= 12) rt.say(speaker, text, duration);
    else if (!rt.G.lord && d <= 40) rt.say(`${speaker}（遠くで）`, text, duration);
    return;
  }
  const group = speaker === '小姓' ? F.kosho
    : speaker === '門番' || speaker === '馬廻' ? F.uma
    : speaker === '御所の侍' || speaker === '御所の組頭' ? F.tada : null;
  let nearest = 25;
  for (const u of group?.units || rt.army.units) {
    if (!u.alive || u.isStruct || u.isPlayer || u.noTarget) continue;
    if (speaker === '明智の侍' ? u.team !== 1 : u.team !== 0) continue;
    // 名のある人物を、亡くなった別人の代わりの話し手にしない。
    if (!group && speaker !== '足軽' && speaker !== '明智の侍') continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < nearest) { nearest = d; from = u; }
  }
  if (from) rt.say(speaker, text, duration);
}
const nbSay = (rt, s, t = 3) => honnoSay(rt, '織田信長', s, t);
// 得物と実際の射撃・間合いを一緒に替える。形は設営時に二つだけ用意する。
function nbWeapon(rt, kind) {
  const u = rt.flags.nb, w = rt.flags.nbWeapons[kind];
  if (u.wpn) u.hand.remove(u.wpn);
  u.hand.add(w); u.wpn = w; u.wpnKind = u.lookWeapon = u.look.weapon = kind;
  u.type = kind === 'bow' ? 'bow' : 'samurai';
  u.range = kind === 'bow' ? 60 : 0; u.reach = kind === 'bow' ? 1.6 : 2.8;
  u.cdBase = kind === 'bow' ? 2.6 : 1.7; u.atk = null; u.target = null; poseArms(u);
}

// 寺の建物の中：まっすぐ行けない相手へは、壁・襖の口（戸の開き）の手前と向こうを順にたどる（army_think の doorVia）
function honnoDoor(rt, u, to) {
  const T = rt.flags.T;
  if (!T || !T.halls) return null;
  const inH = (h, p) => p.x > h.x0 - 1.5 && p.x < h.x1 + 1.5 && p.z > h.z0 - 1.5 && p.z < h.z1 + 1.5;
  let any = false;
  for (const h of T.halls) if (!h.blocked && (inH(h, u.pos) || inH(h, to))) { any = true; break; }
  if (!any || patrolClear(rt, to.x, to.z, u.pos)) return null;
  let best = null, bd = 1e9;
  for (const h of T.halls) {
    if (h.blocked || !(inH(h, u.pos) || inH(h, to))) continue;
    for (const d of h.doors) for (const s of [-1, 1]) {
      const x = d.x + (d.alongX ? 0 : s * 0.9), z = d.z + (d.alongX ? s * 0.9 : 0);
      const du = Math.hypot(x - u.pos.x, z - u.pos.z);
      if (du < 0.35) continue;
      const c = du + Math.hypot(to.x - x, to.z - z);
      if (c >= bd || !patrolClear(rt, x, z, u.pos)) continue;
      best = { x, z }; bd = c;
    }
  }
  return best;
}

// 踏み込む口のまわりで、口から壁・柱を越えずに行ける空いた所（近い順。人と人は 0.8m あける）
const ENTER_OFF = (() => { const L = []; for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) L.push([i * 0.8, j * 0.8]); return L.sort((a, b) => Math.hypot(...a) - Math.hypot(...b)); })();
function enteredSpot(rt, at, used) {
  const from = { x: at.x, y: rt.world.heightAt(at.x, at.z), z: at.z };
  for (const [dx, dz] of ENTER_OFF) {
    const x = at.x + dx, z = at.z + dz;
    if (used.some((p) => Math.hypot(p.x - x, p.z - z) < 0.8)) continue;
    if ((dx || dz) && !patrolClear(rt, x, z, from)) continue;
    return { x, z };
  }
  return { x: at.x, z: at.z };
}

// 囲みから同じ位置で実兵へ替える。既存の兵を使い切れば架空の新手を作らない。
function akechi(rt, name, path, list, o = {}) {
  const F = rt.flags;
  if (F.ending) return null;
  const n = list.reduce((v, q) => v + q.n, 0);
  let alive = 0;
  for (const u of rt.army.units) if (u.alive) alive++;
  if (alive + n > 240) {
    // 枠が空くまで外の同じ備えで待つ。兵を捨てず、一秒に一度だけ試す。
    rt.after(1, () => {
      if (!F.ending && !rt.over && (rt.G.lord || F.step < 3)) akechi(rt, name, path, list, o);
    });
    return null;
  }
  if (!o.entered && inTera(path[0][0], path[0][1])) {
    const entry = path[0][1] > 90 ? IN.katte : IN.main;
    path = [...entry, ...path];
  }
  const at = { x: path[0][0], z: path[0][1] };
  const role = o.role || (at.x < TERA.x0 ? 'west' : at.z < TERA.z0 ? 'north' : at.z > TERA.z1 ? 'south' : 'east');
  // 囲みの寄せ手（o.far）は、その方角の塀の外の備えから人数を引く（寺の奥からは百歩より遠い）
  const R = o.far || 100;
  let host = (F.aHost || []).find((h) => h.honnoRole === role && h.left(at.x, at.z, R) >= n)
    || (role === 'east' ? (F.aHost || []).find((h) => h.honnoRole === 'reserve' && h.left(at.x, at.z, R) >= n) : null);
  let pts = host ? host.take(at.x, at.z, n, R, null, (x, z) => !inTera(x, z)) : [];
  // 囲みの寄せ手は、その方角が尽きれば、ほかの方角の備えから回す（塀の内に掛かる兵は数えない）
  if (!pts.length && o.far) for (const h of F.aHost || []) {
    if (h === host) continue;
    pts = h.take(at.x, at.z, n, R, null, (x, z) => !inTera(x, z));
    if (pts.length) { host = h; break; }
  }
  if (!pts.length) return null;
  // 寄せ手は具足と桔梗の指物。侍の兜と肩の具足を残し、小袖の供と形でも見分ける。
  const dressed = dress(list.map((s) => ({ ...s, o: {
    ...(s.type === 'samurai' ? { hat: 'kabuto_m', sode: true, saya: true } : {}), ...s.o,
  } })), AKECHI);
  const g = enemyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, faction: 'akechi', name, anchor: o.entered ? at : pts[0], facing: o.entered ? 0 : host.rotation.y,
    width: o.width || 4, aggro: o.aggro || 9, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 }, dmgMult: o.dmg ?? 1,
    order: 'path', seekRange: 22, formation: 'column', colW: 2, spacing: 1.4 }, dressed);
  const used = [];
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i], q = pts[i];
    u.nanori = `敵の兵。明智が家来、${u.name || '参る'}！`;
    if (!q) { rt.army.despawn(u); continue; }
    // 寺内の先鋒も外の備えから人数を引く。踏み込む口と同じ間（壁・柱の向こうでない所）に詰めて置く。
    //   前は口から北へ二列に並べ、御殿の北の壁の外に出た者が中へ入れず突っ立っていた（10/10 kaito「敵勢攻めてこない」）
    let x = q.x, z = q.z;
    if (o.entered) { const s = enteredSpot(rt, at, used); x = s.x; z = s.z; used.push(s); }
    u.pos.set(x, rt.world.heightAt(x, z), z);
    u.heading = o.entered ? 0 : q.yaw;
  }
  g.honnoMainEntry = role === 'east' && !o.hold && !o.entered;
  if (g.honnoMainEntry) for (const u of g.units) u.honnoEntryWant = { x: 0, z: 0 };
  // 門を破った後も、口を通ってから敵を追う。塀越しに本堂へ直進させない。
  g.entryPath = path.map((p) => [p[0], p[1]]);
  g.path = o.gate?.alive ? [g.entryPath[0]] : g.entryPath; g.pathIdx = 0;
  g.onArrive = (gg) => { if (o.gate?.alive) { gg.order = 'assault'; gg.assault = hitGate(o.gate); gg.gate = o.gate; return; } gg.order = 'attack'; gg.formation = 'line'; gg.spacing = 1.5; gg.seekRange = o.seek || 24; if (o.player) gg.focus = rt.player.u; else if (o.nb && F.nb && F.nb.alive) gg.focus = F.nb; else if (o.foe?.alive) gg.focus = o.foe; };
  if (o.hold) { g.order = 'hold'; g.anchor = { x: at.x, z: at.z }; g.formation = 'line'; g.aggro = o.aggro || 30; }
  else g.order = 'path';
  if (o.player && g.order !== 'path') g.focus = rt.player.u;
  else if (o.nb && F.nb && F.nb.alive && g.order !== 'path') g.focus = F.nb;
  g.honnoHp = F.hp; F.foes.push(g);
  // 寺内の先鋒は異変の鬨と重ねない。後続も同じ鬨を続けて鳴らさない。
  if (!o.entered && rt.t - (F.honnoShoutT ?? -99) >= 8) {
    F.honnoShoutT = rt.t; rt.army.play('eshout', at, 1.2);
  }
  return g;
}
// 築地を乗り越えて境内へ飛び込む明智の小勢。塀の内側の通れる所に降り、上様を目がけて来る。
function climbIn(rt, pts, list, call) {
  const F = rt.flags;
  if (F.ending || rt.over) return null;
  const [x, z] = pts.find(([px, pz]) => rt.world.walkable(px, pz, rt.world.heightAt(px, pz))) || pts[0];
  const goal = F.nb && F.nb.alive ? [F.nb.pos.x, F.nb.pos.z] : [PT.gateIn.x - 4, PT.gateIn.z];
  const g = akechi(rt, '塀を越えた明智勢', [[x, z], goal], list, { entered: true, nb: true });
  if (!g) return null;
  // 近い塀の上から降り口へ移す。旗も人と一緒に降ろし、地上の道筋は保つ。
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i];
    let nearest = null, best = 12 * 12;
    for (const wall of F.T.walls) {
      if (!wall.alive || !wall.seg) continue;
      const [ax, az, bx, bz] = wall.seg, dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / (dx * dx + dz * dz || 1)));
      const wx = ax + dx * t, wz = az + dz * t, d = (wx - u.pos.x) ** 2 + (wz - u.pos.z) ** 2;
      if (d < best) { best = d; nearest = { x: wx, z: wz, y: rt.world.heightAt(wx, wz) + (wall.h || 2.6), start: rt.t + i * 0.22 }; }
    }
    u.honnoClimb = nearest;
  }
  rt.army.play('eshout', { x: x + 3, z }, 1.1);
  rt.world.gunSmoke(x + 1.5, z, 0x50483e);
  if (call) rt.bark(call, true);
  return g;
}
// ---- 囲まれる絵（kaito 10/10「敵勢にめっちゃ囲まれてやばいみたいな感じにして」） ----
// 塀の外を埋める桔梗の旗と松明。六十メートルの内では軽い兵の形は隠れるので、旗と火だけを二重の並びで立てる。
// 幟の竿・布・松明の竿・火をそれぞれ一つの InstancedMesh にまとめ、描く回数を四つに抑える。
const RING_POLE = new THREE.CylinderGeometry(0.045, 0.06, 3.3, 5).translate(0, 1.65, 0);
const RING_FLAME = new THREE.ConeGeometry(0.2, 0.7, 6).translate(0, 3.6, 0);
const RING_POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
const RING_FLAME_MAT = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
// 松明の火の照り（丸くぼかした点。全部で一回の描画）
let RING_GLOW_MAT = null;
function ringGlowMat() {
  if (RING_GLOW_MAT) return RING_GLOW_MAT;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.25, 'rgba(255,130,40,0.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  RING_GLOW_MAT = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  return RING_GLOW_MAT;
}
function honnoRing(rt) {
  const W = rt.world, F = rt.flags;
  const proto = nobori(W, 0, 0, 'akechi', 6.4);
  // 竿は布の子。外側の子を使うと布を二重に描き、竿のない幟になる。
  const flagSrc = proto.userData.flag, staffSrc = flagSrc.children[0], yaw0 = proto.rotation.y;
  const rr = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.7) * 43758.5453; return v - Math.floor(v); };
  const flags = [], torches = [];
  // 四辺：[始まり, 終わり, 外向き]
  const sides = [[[TERA.x1, TERA.z0], [TERA.x1, TERA.z1], [1, 0]], [[TERA.x0, TERA.z0], [TERA.x0, TERA.z1], [-1, 0]],
    [[TERA.x0, TERA.z0], [TERA.x1, TERA.z0], [0, -1]], [[TERA.x0, TERA.z1], [TERA.x1, TERA.z1], [0, 1]]];
  for (const [[ax, az], [bx, bz], [nx, nz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
    for (const [off, shift, step] of [[3.6, 0, 4.4], [8.2, 2.2, 4.4], [13, 1.1, 6.5]]) {
      for (let s = 1.5 + shift; s < len - 1; s += step) {
        const j = rr(ax + s, az + off, 1);
        const along = s + (rr(ax + s, az + off, 2) - 0.5) * step * .7;
        const x = ax + tx * along + nx * (off + (j - 0.5) * 2.4), z = az + tz * along + nz * (off + (j - 0.5) * 2.4);
        flags.push([x, z, j]);
        if (off < 4 && Math.round(s / step) % 2 === 0) torches.push([x + tx * 1.6 - nx * 0.6, z + tz * 1.6 - nz * 0.6]);
        if (off > 4 && off < 9 && Math.round(s / step) % 3 === 1) torches.push([x - tx * 1.2, z - tz * 1.2]);
      }
    }
  }
  const grp = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const inst = (geo, mat, list, f) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { f(it, v, e, sc); q.setFromEuler(e); m.compose(v, q, sc); im.setMatrixAt(i, m); });
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    grp.add(im); return im;
  };
  const place = ([x, z, j], P, E, S) => {
    P.set(x, W.heightAt(x, z), z);
    E.set((j - 0.5) * 0.08, yaw0 + (j - 0.5) * 0.3, (rr(x, z, 3) - 0.5) * 0.08);
    // 竿と布を同じ比率で縮め、塀の上の高さが揃った看板の列にしない。
    const width = .9 + j * .2;
    S.set(width, .72 + rr(x, z, 4) * .3, width);
  };
  inst(staffSrc.geometry, staffSrc.material, flags, place);
  inst(noboriClothLite(6.4), flagSrc.material, flags, place);   // 囲みの幟は数が多いので、割りを減らした布
  const tp = ([x, z], P, E, S) => { P.set(x, W.heightAt(x, z), z); E.set(0, 0, 0); S.setScalar(1); };
  inst(RING_POLE, RING_POLE_MAT, torches, tp);
  const flame = inst(RING_FLAME, RING_FLAME_MAT, torches, tp);
  rt.scene.add(grp);
  const gp = new Float32Array(torches.length * 3);
  torches.forEach(([x, z], i) => { gp[i * 3] = x; gp[i * 3 + 1] = W.heightAt(x, z) + 3.75; gp[i * 3 + 2] = z; });
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const glow = new THREE.Points(gg, ringGlowMat()); glow.frustumCulled = false; grp.add(glow);
  F.ring = { grp, flame, glow };
  // 門の開口から見える低い松明。塀の外の高い火だけでは内側に灯が届かない。
  for (const z of [GATES.main.z - 2.2, GATES.main.z + 2.2]) honnoTorch(rt, GATES.main.x + 4, z, 0.65);
}

// 前後左右から寄せる寄せ手。見通せる十六歩の内の敵を数え、足りない方角（空いた背・脇を先に）へ三、四人ずつ出す。
// 外の同じ方角の備えから人数を引き（akechi の far・role）、遠く置き去りの寄せ手は消して入れ替える（総数は二百四十まで）。
// [欲しい数, 出す近さ, 出す遠さ]。味方が減るほど近くへ出して、輪が狭まる。
const SUR = { 3: [11, 10, 15], 4: [8, 10, 15], 5: [14, 9.5, 14], 6: [6, 11, 16], 7: [10, 8, 12] };
const ALLY_FALL = ['供の者が討たれた！', '馬廻が一人、倒れた！', '中間が討たれた。輪が狭まる！', '味方がまた一人倒れた！', '宿直の侍が討たれた！', '供の者がまた討たれた。囲みが狭まる！'];
function honnoSurround(rt, dt) {
  const F = rt.flags, P = rt.player.u, p = P.pos;
  if (rt.G.lord || F.ending || rt.over || !P.alive) return;
  if (F.ring) {
    F.ring.flame.material.opacity = 0.72 + Math.sin(rt.t * 11.3) * 0.12 + Math.sin(rt.t * 23.7) * 0.08;
    F.ring.glow.material.opacity = 0.62 + Math.sin(rt.t * 7.1) * 0.1 + Math.sin(rt.t * 17.3) * 0.06;
    if (F.hp >= 9 && F.ring.grp.visible) F.ring.grp.visible = false;
  }
  if (!(F.hp >= 3 && F.hp <= 7)) return;
  // 後続の発砲は少し遅れて同じ持ち場から響く。二挺を同時に鳴らさない。
  if (F.ambEchoT && rt.t >= F.ambEchoT) {
    F.ambEchoT = 0;
    rt.army.play('gun', F.ambEchoAt, 0.6);
  }
  // 塀の外から鉄砲・鬨の声・矢音。音の出所は塀の外の、四方のどこか
  if ((F.ambT = (F.ambT ?? 1) - dt) <= 0) {
    F.ambT = 1.4 + Math.random() * 2.6;
    // 距離だけで選ぶと御殿や本堂の中にも敵の声が出る。必ず外周の持ち場へ置く。
    const side = Math.floor(Math.random() * 4), along = Math.random();
    const at = F.ambAt || (F.ambAt = { x: 0, z: 0 });
    at.x = side < 2 ? (side === 0 ? TERA.x0 - 8 : TERA.x1 + 8) : TERA.x0 + (TERA.x1 - TERA.x0) * along;
    at.z = side < 2 ? TERA.z0 + (TERA.z1 - TERA.z0) * along : (side === 2 ? TERA.z0 - 8 : TERA.z1 + 8);
    const k = Math.random();
    if (k < 0.45) {
      rt.army.play('gun', at, 0.7 + Math.random() * 0.3);
      if (Math.random() < 0.5) {
        const echo = F.ambEchoAt || (F.ambEchoAt = { x: 0, z: 0 });
        echo.x = at.x + (side < 2 ? 0 : 3); echo.z = at.z + (side < 2 ? 3 : 0);
        F.ambEchoT = rt.t + 0.12 + Math.random() * 0.23;
      }
    }
    else if (k < 0.75) rt.army.play('eshout', at, 0.9);
    else { rt.army.play('arrow', at, 0.8); rt.army.play('string', at, 0.5); }
  }
  if (rt.t < (F.surAt || 0)) return;
  F.surAt = rt.t + 1;
  // 討たれた味方の知らせ（名のある小姓は名で）
  const dead = F.allyDead || (F.allyDead = new Set());
  for (const g of [F.kosho, F.uma, ...(F.posts || [])]) if (g) for (const u of g.units) {
    if (u.alive || dead.has(u)) continue;
    dead.add(u);
    if (u === F.ran || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 30 || rt.t - (F.fallSaidT ?? -99) < 6) continue;
    F.fallSaidT = rt.t;
    if (u.name && g === F.kosho) honnoSay(rt, '小姓', `${u.name}、討死……！`, 2.6);
    else { const i = (F.fallN = (F.fallN || 0) + 1) - 1; if (i < ALLY_FALL.length) rt.bark(ALLY_FALL[i], true); }
  }
  // 置き去りの寄せ手を消す（波の入れ替え）
  for (const g of F.foes) {
    if (gone(g) || g.order === 'hold' || g.order === 'assault' || (!g.surround && (g.honnoHp ?? F.hp) >= F.hp)) continue;
    let far = true;
    for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 38) { far = false; break; }
    if (far) for (const u of g.units) if (u.alive) rt.army.despawn(u);
  }
  // 守る段では、門を抜けて戦い終えた組を近くの守り手へ寄せ直す。
  // 狙いのない後列は短い索敵距離のまま古い持ち場へ戻り、庭に散ってしまう。
  // 既存の兵だけを使い、移動中の退路・待機・侍との勝負は変えない。
  if (F.hp === 3 || F.hp === 5 || F.hp === 7) for (const g of F.foes) {
    if (gone(g) || g.order !== 'attack' || g.surround || g.honnoStand ||
        g.honnoHp == null || g.focus?.alive) continue;
    if (g.units.some((u) => u.alive && (u.target?.alive || u.atk || u.swing && !u.swing.done))) continue;
    const c = g.center();
    if (Math.hypot(c.x - p.x, c.z - p.z) > 28) continue;
    let foe = null, nearest = 28;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u === F.nb || u.isStruct ||
          u.noTarget || u.fleeing || u.woundOut || u.rearWound || u.group?.hidden ||
          Math.abs(u.pos.y - p.y) > 3 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 16) continue;
      const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
      if (d < nearest) { nearest = d; foe = u; }
    }
    // 壁の向こうの守り手へは、既存の戸口の案内を通って進む。
    if (foe) g.focus = foe;
  }
  const [want0, r0, r1] = SUR[F.hp];
  // 味方が減るほど寄せ手は多く、近い
  let ally = 0;
  for (const g of [F.kosho, F.uma, ...(F.posts || [])]) if (g) for (const u of g.units) if (u.alive) ally++;
  const press = Math.max(0, Math.min(1, 1 - ally / 22));
  // 供は一人ずつ討たれる：十四秒に一人ほどの割合より早く減れば固く、遅ければ脆くする（一度に崩れない）
  F.surT0 ??= rt.t;
  const due = Math.max(3, 22 - (rt.t - F.surT0) / 14);
  const def = ally < due - 1 ? 25 : ally < due ? 5 : ally > due + 1 ? 0.8 : 1.6;
  for (const g of [F.kosho, F.uma, ...(F.posts || [])]) if (g) g.defMult = def;
  // 囲みの寄せ手が増えた分、上様が一太刀で崩れないように（上様を狙う台本の寄せ手は、これまでどおり手傷を負わせる）
  if (F.nbG && F.nb?.alive) F.nbG.defMult = F.nb.hp < F.nb.maxHp * 0.5 ? 10 : 4;
  // 鉄砲・矢は defMult を通らない。囲みの最中は上様の傷の進みを七分ほどに均す（離れて任せきりにすれば、それでも深手になる）
  if (F.nb?.alive) {
    const floor = F.nb.maxHp * Math.max(0.24, 1 - 0.76 * (rt.t - F.surT0) / 420);
    const dNb = Math.hypot(F.nb.pos.x - p.x, F.nb.pos.z - p.z);
    if (F.nb.hp < floor && dNb < 14) F.nb.hp += (floor - F.nb.hp) * 0.5;
  }
  // 体力はギリギリで減る：七分で三割ほど残る線より削られていれば、寄せ手の太刀を浅くする（立ち止まれば、それでも討たれる）
  const hpF = P.hp / P.maxHp, line = 1 - 0.7 * Math.min(1, (rt.t - F.surT0) / 420);
  const gm = hpF < line - 0.12 ? 0.3 : hpF < line ? 0.6 : hpF > line + 0.15 ? 1.4 : 1;
  for (const g of F.foes) if (!gone(g)) { g.dmg0 ??= g.dmgMult ?? 1; g.dmgMult = g.dmg0 * (g.surround ? gm : Math.min(1, gm)); }
  // 離れた供は戸口の押し合いを支えられない。本人と同じ側で戦える
  // 味方の数に合わせ、残り二人の所へ囲みの補充まで重ねない。
  let support = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u === P || u.team !== P.team || u.isStruct || u.noTarget ||
        u.civ || u.group?.civ || u.type === 'porter' || u.type === 'dummy' ||
        u.fleeing || u.woundOut || u.rearWound || u.group?.hidden ||
        Math.abs(u.pos.y - p.y) > 3 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 12 ||
        rt.army.wallBetween(p, -1, u.pos)) continue;
    support++;
  }
  const indoors = F.T && hallAt(F.T, p.x, p.z);
  // 味方が多くても、狭い堂内を補充の寄せ手だけで埋めない。台本の各口からの攻めは残す。
  const want = Math.min(want0 + Math.round(press * 4), (indoors ? 6 : 8) + support * 2, indoors ? 10 : 14);
  const cam = rt.camera, fw = F.surV || (F.surV = new THREE.Vector3());
  if (cam) cam.getWorldDirection(fw); else fw.set(Math.sin(P.heading || 0), 0, Math.cos(P.heading || 0));
  const fa = Math.atan2(fw.x, fw.z);
  const quad = [0, 0, 0, 0];
  let n = 0, alive = 0, all = 0;
  for (const u of rt.army.units) {
    if (!u.alive) continue;
    alive++;
    if (u.team !== 1 || u.isStruct || u.fleeing || u.woundOut || u.noTarget) continue;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > 16 || Math.abs(u.pos.y - p.y) > 3) continue;
    all++;
    if (rt.army.wallBetween(p, -1, u.pos)) continue;
    n++;
    let a = Math.atan2(dx, dz) - fa; a = Math.atan2(Math.sin(a), Math.cos(a));
    quad[Math.round(a / (Math.PI / 2)) & 3]++;
  }
  F.surN = n;
  // 塀・壁の向こうに詰まった寄せ手も数え、近くを敵で溢れさせない
  // 本堂・御殿へ退く間は、各口から来る台本の兵だけを追手にする。
  // 密度を補う兵を重ねると、細い廊下の前後を塞いで合流できなくなる。
  // 一隊四人を足した後の数で判定し、台本の波と補充を重ねすぎない。
  if (F.hp === 4 || F.hp === 6 || n + 4 > want || all + 4 > want + 5 || alive + 4 > 236 || rt.t < (F.surSpawnAt || 0)) return;
  // 空いた方角を先に。同じ数なら背、左右、前の順
  const order = [2, 1, 3, 0].sort((a, b) => quad[a] - quad[b]);
  for (const qd of order) {
    for (const da of [0, -0.35, 0.35, -0.7, 0.7]) {
      const ang = fa + qd * Math.PI / 2 + da;
      for (let r = r1; r >= r0; r -= 1.5) {
        const x = p.x + Math.sin(ang) * r, z = p.z + Math.cos(ang) * r;
        if (!inTera(x, z, -1.5)) continue;
        // 密度を補う兵を、閉じた部屋へ突然出さない。堂や御殿に入る
        // 寄せ手は、各口から進む既存の隊に任せる。
        if (F.T && hallAt(F.T, x, z)) continue;
        if (F.nb?.alive && Math.hypot(x - F.nb.pos.x, z - F.nb.pos.z) < 7) continue;
        const Z = F.heatZone;
        if (Z && x > Z.x0 && x < Z.x1 && z > Z.z0 && z < Z.z1) continue;
        // 燃えている棟・廊の中や際には出さない（寄せ手を追って火の中へ誘い込まない）
        if (F.T?.G?.recs.some((r) => r.state === 1 && (() => { const c = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0), dx = x - r.x, dz = z - r.z; return Math.abs(dx * c - dz * sn) < r.w / 2 + 2 && Math.abs(dx * sn + dz * c) < r.d / 2 + 2; })())) continue;
        if (!patrolClear(rt, x, z) || !patrolClear(rt, x - 0.5, z) || !patrolClear(rt, x + 0.5, z) || !patrolClear(rt, x, z - 0.8) || !patrolClear(rt, x, z + 0.8)) continue;
        const cx = x - HONNO.x, cz = z - HONNO.z;
        const role = Math.abs(cx) > Math.abs(cz) ? (cx < 0 ? 'west' : 'east') : (cz < 0 ? 'north' : 'south');
        const k = F.surK = (F.surK || 0) + 1;
        const list = F.hp === 7 ? [uS(1), uA(2)] : k % 3 === 0 ? [uS(1), uA(2), uB(1)] : [uS(1), uA(3)];
        // 自分を狙わない組は、近くの供（上様でない者）へ斬りかかる。供が一人ずつ討たれ、上様は囲みの寄せ手に狙わせない
        let foe = null, fd = 1e9;
        for (const ag of [F.kosho, F.uma, ...(F.posts || [])]) if (ag) for (const u of ag.units) {
          if (!u.alive) continue;
          const d = Math.hypot(u.pos.x - x, u.pos.z - z);
          if (d < fd) { fd = d; foe = u; }
        }
        const toMe = k % 3 === 0 || fd > 20;
        const g = akechi(rt, qd === 2 ? '背から迫る明智勢' : qd === 0 ? '前から迫る明智勢' : '脇から迫る明智勢', [[x, z], [p.x, p.z]], list,
          { entered: true, player: toMe, foe: toMe ? null : foe, role, far: 1e9, aggro: 12, seek: 26, dmg: 1.2 });
        if (!g) return;
        g.surround = true; g.honnoHp = F.hp;
        rt.world.gunSmoke(x, z, 0x4a4642);
        if (qd !== 0 && rt.t - (F.surCallT ?? -99) > 8) {
          F.surCallT = rt.t;
          const L = ['後ろからも来るぞ！', '横から回り込まれた！', '囲まれた！　四方から来る！', '背を取られるな！'];
          const i = (F.surCallN = (F.surCallN || 0) + 1) - 1;
          if (i < L.length) rt.bark(L[i], true);
        }
        F.surSpawnAt = rt.t + (n < want - 6 ? 0.8 : 1.6);
        return;
      }
    }
  }
}
// 寝間着の小袖（具足・笠・指物なし）
const NEMAKI = (col) => ({ kosode: 1, honnoCloth: true, kosodeCol: col, obi: 0x30251c, flag: null, hat: 'none', horo: 0 });
const nS = (n) => ({ type: 'samurai', n, o: NEMAKI(0x2e3440) }), nA = (n) => ({ type: 'ashigaru', n, o: NEMAKI(0x4a463e) });
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
// 門の扉（開いた二枚の扉。閉めると army の struct になる）
function openLeaves(W, x, z, w) {
  const g = tobira(W, x, z, w, Math.PI / 2, { h: 3.1 });
  g.userData.open();
  return g;
}
function gateBlocker(rt) {
  const gm = GATES.main;
  let ally = null;
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || Math.abs(u.pos.x - gm.x) >= 1.2 || Math.abs(u.pos.z - gm.z) >= gm.w / 2) continue;
    if (u.team === 1) return u;
    if (!ally || u.isPlayer) ally = u;
  }
  return ally;
}
function gateHint(rt, u) {
  return u.isPlayer ? '門の内側へ下がり、口を空けよ'
    : u.team === 1 ? '敵が門の口にいる。内側へ押し返せ'
    : '味方が門の口にいる。口が空いてから閉めよ';
}
function closeGate(rt, by) {
  const F = rt.flags, W = rt.world, gm = GATES.main;
  if (F.gMain || F.ending || rt.over || F.hp !== 2) return;
  const blocker = gateBlocker(rt);
  if (blocker) {
    rt.objProgress('main', gateHint(rt, blocker));
    return;
  }
  F.gMain = rt.army.addStruct({ seg: [gm.x, gm.z - gm.w / 2, gm.x, gm.z + gm.w / 2], hp: 1500, maxHp: 1500, armor: 0.5, team: 0, name: '表門' });
  F.gMain.mesh = gateDoors(W, gm.x, gm.z, gm.w, 0); rt.scene.add(F.gMain.mesh);
  if (F.leaves) F.leaves.visible = false;
  rt.uninteract('gate');
  rt.army.play('wood', gm, 1.2);

  F.gateClosedByMe = by === 'me';
  if (F.gateClosedByMe) { rt.award((t) => t.side.push('表門を閉めた'), '表門を閉めた'); honnoSay(rt, '森蘭丸', 'よう閉めた！　先手が止まった。今のうちに門の内へ！', 3); }
  else honnoSay(rt, '門番', '閂を下ろした！　門を押さえよ！', 2.5);
}
function smallGate(rt, gd, hp) {
  const s = rt.army.addStruct({ seg: gd.side === 'n' || gd.side === 's' ? [gd.x - gd.w / 2, gd.z, gd.x + gd.w / 2, gd.z] : [gd.x, gd.z - gd.w / 2, gd.x, gd.z + gd.w / 2], hp, maxHp: hp, armor: 0.5, team: 0, name: gd.name });
  s.mesh = gateDoors(rt.world, gd.x, gd.z, gd.w, gd.side === 'n' || gd.side === 's' ? Math.PI / 2 : 0); rt.scene.add(s.mesh);
  return s;
}
// 門の狭い所だけ、討死の時に寝る場所を予約する。毎コマ探したり体を積み上げたりしない。
function honnoFall(rt, v) {
  const D = v.death, A = rt.army, g = GATES.main;
  if (!D || D.aid || v.mounted || v.gone) return;
  // 板床の上では手足も同じ床へ下ろす。庭では既存の地面を使う。
  if (D.floor) v.corpseFloorY = groundAt(rt.world, v.pos.x, v.pos.z, v.pos.y);
  if (D.floor || v.isPlayer || v.honnoRest ||
    Math.abs(v.pos.x - g.x) > 12 || Math.abs(v.pos.z - g.z) > 12) return;
  D.tw = (Math.random() - 0.5) * 2.7;
  const lie = Math.PI / 2 * 0.96;
  let rx = 0, rz = 0;
  if (D.kind === 'back') rx = -lie;
  else if (D.kind === 'forward' || (D.kind === 'crumple' && D.fwd)) rx = lie;
  // 横斬りも倒れ終わりは横へ寝る。寝場所の予約を実際の接地姿勢に合わせる。
  else rz = -D.side * lie;
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rx, v.heading + D.tw, rz, 'YXZ'));
  let firstX = D.sx || 0, firstZ = D.sz || 0, found = false;
  for (let i = 0; i < 65; i++) {
    const r = i ? 0.5 * Math.sqrt(i) : 0, a = i * 2.399963 + v.heading;
    const sx = Math.sin(a) * r, sz = Math.cos(a) * r;
    const cx = v.pos.x + sx + axis.x * 0.85, cz = v.pos.z + sz + axis.z * 0.85;
    let open = true;
    // よろめく道と足から頭までを確認し、塀・門柱・堀へ寝かせない。
    for (let j = 0; j <= 8 && open; j++) {
      const k = Math.min(1, j / 4), body = Math.max(0, j - 4) * 0.425;
      const x = v.pos.x + sx * k + axis.x * body, z = v.pos.z + sz * k + axis.z * body;
      if (!A.aidWalkable(v, x, z)) { open = false; break; }
      for (const s of A.solids || []) {
        if (s.alive === false || (s.struct && (!s.struct.alive || s.struct.opened))) continue;
        if (x > s.x0 - 0.25 && x < s.x1 + 0.25 && z > s.z0 - 0.25 && z < s.z1 + 0.25) { open = false; break; }
      }
    }
    if (!open) continue;
    if (!found) { firstX = sx; firstZ = sz; found = true; }
    for (const u of A.dead) {
      if (u === v || u.gone || !u.honnoRest) continue;
      if ((cx - u.honnoRest.x) ** 2 + (cz - u.honnoRest.z) ** 2 < 2.4 ** 2) { open = false; break; }
    }
    if (open) { firstX = sx; firstZ = sz; break; }
  }
  D.sx = firstX; D.sz = firstZ; D.roll = null;
  v.honnoRest = { x: v.pos.x + D.sx + axis.x * 0.85, z: v.pos.z + D.sz + axis.z * 0.85 };
  // 空きが尽きた時も山にしない。重なる古い亡骸は共通の片付けで武具だけ残す。
  for (let i = A.dead.length - 1; i >= 0; i--) {
    const u = A.dead[i];
    if (u === v || u.isPlayer || u.death?.aid || !u.honnoRest) continue;
    if ((v.honnoRest.x - u.honnoRest.x) ** 2 + (v.honnoRest.z - u.honnoRest.z) ** 2 < 2.4 ** 2) A.clearCorpse(i);
  }
}

// 小袖の袂を肘へたくし上げる。この戦の人に付いた形だけを複製し、手首を空ける。
// 骨付きの人も遠目の人も同じ直し。形の複製は初回だけで、次から共有する。
function honnoClothes(rt, dt) {
  const F = rt.flags;
  F.clothesScan -= dt;
  if (F.clothesScan > 0) return;
  F.clothesScan = 0.5;
  const fit = (src, mesh, foreOnly = false) => {
    if (F.sleeveGeos.has(src)) return F.sleeveGeos.get(src);
    let g = src.clone();
    const p = g.attributes.position, skin = g.attributes.skinIndex, mtl = g.attributes.mtl, normal = g.attributes.normal;
    const cloth = (i) => !mtl || Math.floor(mtl.getX(i)) % 8 === MK.cloth;
    if (skin && mesh.skeleton) {
      // 部品をまとめた人は前腕の骨を目印にし、肘を支点に袖だけを縮める。
      const anchors = new Map();
      mesh.skeleton.bones.forEach((bone, i) => {
        if (!/^(Left|Right)ForeArm$/.test(bone.name)) return;
        const rest = mesh.skeleton.boneInverses[i].clone().invert();
        anchors.set(i, new THREE.Vector3().setFromMatrixPosition(rest));
      });
      for (let i = 0; i < p.count; i++) {
        const a = anchors.get(skin.getX(i));
        if (a && cloth(i)) {
          const dx = p.getX(i) - a.x, dy = p.getY(i) - a.y, dz = p.getZ(i) - a.z;
          p.setXYZ(i, a.x + dx * 0.85, a.y + dy * 0.8, a.z + dz * 0.85);
          if (normal) {
            const nx = normal.getX(i) / 0.85, ny = normal.getY(i) / 0.8, nz = normal.getZ(i) / 0.85;
            const len = Math.hypot(nx, ny, nz) || 1;
            normal.setXYZ(i, nx / len, ny / len, nz / len);
          }
          if (Math.hypot(dx, dy, dz) > 0.24) for (const name of ['color', 'col2']) {
            const c = g.attributes[name];
            if (c) c.setXYZ(i, c.getX(i) * 0.55, c.getY(i) * 0.55, c.getZ(i) * 0.55);
          }
        }
      }
    } else {
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        // 軽い腕の形では手の頂点を残す。袂だけを短く、薄くする。
        if (cloth(i) && (foreOnly || (y < -0.23 && y > -0.525 && Math.hypot(p.getX(i), p.getZ(i)) > 0.06))) {
          p.setXYZ(i, p.getX(i) * 0.9, -0.23 + (y + 0.23) * 0.8, p.getZ(i) * 0.85);
          // 袖の丸い陰影を保ち、縮めた向きにだけ法線を合わせる。
          if (normal) {
            const nx = normal.getX(i) / 0.9, ny = normal.getY(i) / 0.8, nz = normal.getZ(i) / 0.85;
            const len = Math.hypot(nx, ny, nz) || 1;
            normal.setXYZ(i, nx / len, ny / len, nz / len);
          }
        }
      }
    }
    // 既存の帯と合わせ襟を濃淡で立たせる。袖口も暗い縁で厚みを出す。
    const color = g.attributes.color, col2 = g.attributes.col2;
    const obi = new THREE.Color(0x392822), eri = new THREE.Color(0xaa9980), cuff = new THREE.Color(0x39342f);
    for (let i = 0; i < p.count; i++) {
      if (!cloth(i) || !color) continue;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let c = null;
      if (Math.abs(x) < 0.3 && Math.abs(z) < 0.28 && y > 0.935 && y < 1.025) c = obi;
      else if (z > 0.045 && y > 1.08 && y < 1.48 &&
        (Math.abs(x - (-0.052 + (1.472 - y) * 0.33)) < 0.018 ||
          (y > 1.25 && Math.abs(x - (0.052 - (1.472 - y) * 0.34)) < 0.018))) c = eri;
      else if (!skin && y > -0.43 && y < -0.4) c = cuff;
      if (c) {
        color.setXYZ(i, c.r, c.g, c.b);
        if (col2) col2.setXYZ(i, c.r, c.g, c.b);
      }
    }
    // 腰より下の衣にひだを付ける。帯と襟の色は残し、平らな袋に見せない。
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
      // 帯へ寄る浅い皺。胸では弱くし、肩の丸みと襟を残す。
      if (cloth(i) && y > 1.025 && y < 1.37 && Math.abs(x) < 0.3 && Math.abs(z) < 0.25) {
        const th = Math.atan2(x, z), k = Math.sin((y - 1.025) / 0.345 * Math.PI);
        const crease = Math.sin(th * 9 + y * 7) * k;
        const fold = 1 + 0.025 * crease;
        p.setXYZ(i, x * fold, y, z * fold);
        for (const c of [color, col2]) if (c) c.setXYZ(i, c.getX(i) * (1 - 0.08 * Math.max(0, -crease)),
          c.getY(i) * (1 - 0.08 * Math.max(0, -crease)), c.getZ(i) * (1 - 0.08 * Math.max(0, -crease)));
      }
      if (!cloth(i) || y < 0.58 || y > 0.94 || Math.abs(x) > 0.34 || Math.abs(z) > 0.32) continue;
      const k = (0.94 - y) / 0.36, fold = 1 + 0.065 * Math.cos(Math.atan2(x, z) * 10) * k;
      p.setXYZ(i, x * fold, y, z * fold);
    }
    // 袖・肩の継ぎ目の法線をそろえる。色や骨の割り当ては変えず、板状の陰をなくす。
    if (normal) {
      const seams = new Map();
      const key = (i) => `${Math.round(p.getX(i) * 10000)},${Math.round(p.getY(i) * 10000)},${Math.round(p.getZ(i) * 10000)},${skin ? skin.getX(i) : 0}`;
      for (let i = 0; i < p.count; i++) {
        if (!cloth(i)) continue;
        const k = key(i), n = seams.get(k);
        if (n) { n.x += normal.getX(i); n.y += normal.getY(i); n.z += normal.getZ(i); }
        else seams.set(k, new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)));
      }
      for (let i = 0; i < p.count; i++) if (cloth(i)) {
        const n = seams.get(key(i));
        if (n.lengthSq() < 0.01) continue;
        n.normalize(); normal.setXYZ(i, n.x, n.y, n.z);
      }
    }
    g = honnoFingers(g, mesh);
    // 指をまとめる時に頂点番号が外れる。ここで法線を作り直すと、
    // 元の丸い肩・胴・袖まで三角形ごとの平面になるため、元の法線を残す。
    g.attributes.position.needsUpdate = true;
    if (g.attributes.normal) g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
    F.sleeveGeos.set(src, g); F.sleeveGeos.set(g, g);
    return g;
  };
  const wrap = (mesh, foreOnly = false) => {
    if (!mesh) return;
    // 小袖は透過の板にしない。共通材質を変えず、帯の頂点色と布の陰影を引き継ぐ。
    const old = mesh.material;
    if (!F.clothMats.has(old)) {
      const mat = old.clone();
      mat.onBeforeCompile = old.onBeforeCompile;
      mat.customProgramCacheKey = old.customProgramCacheKey;
      mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
      mat.alphaHash = false; mat.alphaTest = 0;
      F.clothMats.set(old, mat); F.clothMats.set(mat, mat);
    }
    mesh.material = F.clothMats.get(old);
    // 血の染みは既存の armorWear が胴・胸の骨へ付ける。布の奥行きで裏の染みを隠す。
    if (mesh.userData.honnoSleeve) return;
    mesh.userData.honnoSleeve = true;
    mesh.geometry = fit(mesh.geometry, mesh, foreOnly);
    const L = mesh.userData.lod;
    if (L) { L[0] = fit(L[0], mesh, foreOnly); L[1] = fit(L[1], mesh, foreOnly); }   // 束へまとめる時も小袖の形で
    const before = mesh.onBeforeRender;
    // 形を入れ替える仕掛けの無い部品は、描く前の仕掛けを足さない（足すと兵の束へまとめられず、一つずつ描いていた）
    if (!L && before === THREE.Object3D.prototype.onBeforeRender && !mesh.isSkinnedMesh) return;
    mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      before.call(this, renderer, scene, camera, geometry, material, group);
      this.geometry = fit(this.geometry, this, foreOnly);
    };
  };
  const fitSword = (mesh) => {
    const src = mesh.geometry;
    if (F.swordGeos.has(src)) { mesh.geometry = F.swordGeos.get(src); return; }
    src.computeBoundingBox();
    const length = src.boundingBox.max.z - src.boundingBox.min.z;
    let g = src;
    if (length > 1.05) { g = src.clone(); g.scale(1.05 / length, 1.05 / length, 1.05 / length); g.computeBoundingSphere(); }
    F.swordGeos.set(src, g); F.swordGeos.set(g, g); mesh.geometry = g;
  };
  for (const u of rt.army.units) {
    if ((u.wpnKind || u.lookWeapon) === 'sword' && u.wpn && !u.wpn.userData.honnoSword) {
      const mesh = u.wpn, before = mesh.onBeforeRender;
      mesh.userData.honnoSword = true; fitSword(mesh);
      const SL = mesh.userData.lod;
      if (SL) { for (const i of [0, 1]) { const tmp = { geometry: SL[i] }; fitSword(tmp); SL[i] = tmp.geometry; } }
      // 形を入れ替える仕掛けの無い刀には足さない（兵の束へまとめられる）
      if (SL || before !== THREE.Object3D.prototype.onBeforeRender) mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) { before.call(this, renderer, scene, camera, geometry, material, group); fitSword(this); };
    }
    if (!u.look?.kosode) continue;
    u.honnoExpression = u.id % 4;
    wrap(u.body); wrap(u.armL); wrap(u.armR);
    const h = u.human;
    if (!h) continue;
    wrap(h.parts.armor);
    wrap(h.parts.upperP); wrap(h.parts.upperN);
    wrap(h.parts.foreP, true); wrap(h.parts.foreN, true);
    wrap(h.parts.torso); wrap(h.parts.hips);
    wrap(h.parts.handP); wrap(h.parts.handN);
  }
}

// 指は拳の表に四本を曲げて並べる。元の親指を残し、得物を握る形にする。
// 骨付きの兵は手の骨へ結び、軽い形は腕と一緒にまとめる。形を作るのは初回だけ。
function honnoFingers(g, mesh) {
  const skin = g.attributes.skinIndex, parts = [g.index ? g.toNonIndexed() : g];
  const hands = [];
  if (skin && mesh.skeleton) {
    mesh.skeleton.bones.forEach((b, i) => {
      if (!/^(Left|Right)Hand$/.test(b.name)) return;
      // 遠景など、手の頂点を持たない形には増やさない。
      let used = false;
      for (let j = 0; j < skin.count && !used; j++) used = skin.getX(j) === i;
      if (!used) return;
      const at = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert());
      const fore = mesh.skeleton.bones.findIndex(v => v.name === b.name.replace('Hand', 'ForeArm'));
      if (fore < 0) return;
      const elbow = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[fore].clone().invert());
      const down = at.clone().sub(elbow).normalize(), forward = new THREE.Vector3(0, 0, 1);
      forward.addScaledVector(down, -forward.dot(down)).normalize();
      const across = new THREE.Vector3().crossVectors(down, forward).normalize();
      hands.push({ i, at, down, forward, across });
    });
  } else {
    // 部位ごとの手、または軽い腕だけ。胴の形に指を足さない。
    g.computeBoundingBox();
    if (g.boundingBox.min.y < -0.53 && g.boundingBox.max.y < 0.15 && g.boundingBox.max.x - g.boundingBox.min.x < 0.4)
      hands.push({ at: new THREE.Vector3(0, -0.5, 0), down: new THREE.Vector3(0, -1, 0), forward: new THREE.Vector3(0, 0, 1), across: new THREE.Vector3(1, 0, 0) });
  }
  for (const h of hands) for (let f = 0; f < 4; f++) {
    const tip = new THREE.SphereGeometry(1, 6, 4);
    tip.scale(0.009, 0.025 - Math.abs(f - 1.5) * 0.003, 0.012);
    const basis = new THREE.Matrix4().makeBasis(h.across, h.down, h.forward);
    basis.setPosition(h.at.clone().addScaledVector(h.down, 0.071).addScaledVector(h.across, (f - 1.5) * 0.018).addScaledVector(h.forward, 0.043));
    tip.applyMatrix4(basis);
    const extra = P(tip, 0xb58c68, { mk: MK.skin, reg: 'skin' }).toNonIndexed();
    const n = extra.attributes.position.count;
    // 色は元の人が整数で持つこともある。型と正規化もそろえてから束ねる。
    // 値は読み書き用の口を通し、肌の色を保つ。手の骨に全頂点を結ぶ。
    for (const [name, a] of Object.entries(parts[0].attributes)) {
      const src = extra.attributes[name];
      if (src && src.array.constructor === a.array.constructor && src.itemSize === a.itemSize && src.normalized === a.normalized) continue;
      const data = new a.array.constructor(n * a.itemSize);
      if (name === 'skinIndex') for (let j = 0; j < n; j++) data[j * a.itemSize] = h.i;
      if (name === 'skinWeight') for (let j = 0; j < n; j++) data[j * a.itemSize] = 1;
      const dst = new THREE.BufferAttribute(data, a.itemSize, a.normalized);
      if (src) for (let j = 0; j < n; j++) {
        dst.setX(j, src.getX(j));
        if (a.itemSize > 1) dst.setY(j, src.getY(j));
        if (a.itemSize > 2) dst.setZ(j, src.getZ(j));
        if (a.itemSize > 3) dst.setW(j, src.getW(j));
      }
      extra.setAttribute(name, dst);
    }
    for (const name of Object.keys(extra.attributes)) if (!parts[0].attributes[name]) extra.deleteAttribute(name);
    parts.push(extra);
  }
  // 手指を足せない形でも、小袖を残して戦を続ける。
  const result = parts.length > 1 ? (mergeGeometries(parts) || g) : g;
  // 結合は形の付記を引き継がない。骨番号の並びを残し、胴まで再変換しない。
  if (result !== g) result.userData = { ...g.userData };
  return result;
}

// 門の陰でも板目と貫を残す。寺と御所だけの材質を設営時に共有する。
function templeGateWood(rt, gate) {
  const F = rt.flags;
  const mats = F.templeGateMats || (F.templeGateMats = new Map());
  gate.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material.isMeshStandardMaterial) return;
    const old = mesh.material;
    if (!mats.has(old)) {
      const mat = old.clone();
      mat.map = F.templeWoodMap;
      mat.bumpMap = null; mat.bumpScale = 0; mat.roughness = .9;
      mat.emissive.set(0x594c38); mat.emissiveIntensity = .16;
      mats.set(old, mat);
    }
    mesh.material = mats.get(old);
  });
  return gate;
}

// この戦の壁と襖だけを清める。白い紙の材質は準備時に一度だけ作る。
function cleanTemple(rt) {
  const T = rt.flags.T;
  // 回廊の軒と、堂の張り出した天井。準備時だけ箱を作り、見通しと視点で共用する。
  T.sightRoofs = [];
  for (const r of T.G.recs) if (r.kind === 'roka') T.sightRoofs.push({ rec: r,
    cs: Math.cos(r.rot || 0), sn: Math.sin(r.rot || 0), w: r.w / 2 + .8, d: r.d / 2 + .3,
    bottom: 2.7, top: 3.8 });
  for (const h of T.halls) T.sightRoofs.push({ rec: h.rec, cs: 1, sn: 0,
    w: (h.x1 - h.x0) / 2 + 1.4, d: (h.z1 - h.z0) / 2 + 1.4,
    bottom: h.H.H + .03, top: h.H.H + .09 });
  // 描いた柱を準備時に拾う。見通しと視点専用で、通行の当たりには足さない。
  T.sightPosts = [];
  for (const r of T.G.recs) {
    if (r.kind !== 'roka') continue;
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0), n = Math.round(r.d / 2.3);
    for (let i = 0; i <= n; i++) for (let side = -1; side <= 1; side += 2) {
      const x = side * r.w / 2, z = -r.d / 2 + i * r.d / n;
      T.sightPosts.push({ rec: r, x: r.x + x * c + z * s, z: r.z - x * s + z * c });
    }
  }
  // 堂の戸口の柱も拾う。襖の開口だけでは、柱際へ回った視点が本人を隠す。
  for (const hall of T.halls) for (const [ax, az, bx, bz, , doors] of hall.H.walls) {
    const alongX = Math.abs(bz - az) < .001;
    const add = (edge) => T.sightPosts.push({ rec: hall.rec,
      x: alongX ? edge : ax, z: alongX ? az : edge, radius: .12, cameraRadius: .4, height: hall.H.H });
    add(alongX ? ax : az); add(alongX ? bx : bz);
    for (const [mid, width] of doors) { add(mid - width / 2); add(mid + width / 2); }
  }
  // 寺の高い床・登り道だけを無効にする。低い戸口や廊下、寺外の屋根の射座は残す。
  const W = rt.world;
  // 門から本堂、中庭から御殿へ通った跡。既存の地面の絵へ刻み、面を重ねない。
  W.stampTrail([[-30, 50], [-37, 49.6], [-44, 50], [-48, 49]], 1.5, 32);
  W.stampTrail([[-44, 53], [-48, 58], [-50, 65], [-51, 72], [-52, 79]], 1.1, 22);
  W.stampTrail([[-42, 54], [-42, 61], [-42.5, 70], [-44, 75]], 0.85, 38);
  // 門前と灯籠の周りは広く踏まれ、中央から土が露出する。筋を等間隔に並べない。
  W.stampTrail([[-33, 49], [-37, 50.5], [-40, 49], [-44, 50]], 2.4, 54);
  W.stampTrail([[-43, 48], [-45, 46.5], [-48, 48], [-47, 51]], 1.65, 44);
  W.stampTrail([[-46, 55], [-49, 60], [-48, 66], [-51, 73], [-53, 78]], 1.7, 36);
  // 軒際と門前へ砂利・瓦片を偏らせる。一つの形と材質でまとめ、兵の通行は変えない。
  const chips = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.96 }), 168);
  const pose = new THREE.Object3D(), chipColor = new THREE.Color();
  let seed = 15820602;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 168; i++) {
    const band = i % 3;
    const x = band === 0 ? -43.2 + rand() * 1.5 : band === 1 ? -47 + rand() * 11 : -55 + rand() * 7;
    const z = band === 0 ? 54 + rand() * 21 : band === 1 ? 48 + rand() * 4 : 72 + rand() * 3;
    const tile = i % 9 === 0, size = tile ? 0.11 + rand() * 0.09 : 0.025 + rand() * 0.055;
    pose.position.set(x, W.heightAt(x, z) + size * 0.22, z);
    pose.rotation.set(rand() * 0.35, rand() * Math.PI * 2, rand() * 0.25);
    pose.scale.set(size, size * 0.3, size * (tile ? 1.4 : 0.85));
    pose.updateMatrix(); chips.setMatrixAt(i, pose.matrix);
    chipColor.setHex(tile ? 0x47494a : i % 2 ? 0xa39a85 : 0x777064);
    chips.setColorAt(i, chipColor);
  }
  chips.receiveShadow = true; chips.computeBoundingSphere(); rt.scene.add(chips);
  // 洛中の遠山は夜の霞へ隠す。信貴山と同じく、空へせり出す遠景の板を出さない。
  W.mountains.visible = false;
  for (const d of FL.decks) if (inTera(d.cx, d.cz) && d.y > W.heightAt(d.cx, d.cz) + 1.8) d.y = -1e6;
  for (let i = FL.ramps.length - 1; i >= 0; i--) {
    const r = FL.ramps[i];
    if ((inTera(r.ax, r.az) && r.ya > W.heightAt(r.ax, r.az) + 1.8) ||
        (inTera(r.bx, r.bz) && r.yb > W.heightAt(r.bx, r.bz) + 1.8)) FL.ramps.splice(i, 1);
  }
  for (const l of FL.ladders) if (inTera(l.x, l.z) && l.y1 > W.heightAt(l.x, l.z) + 1.8) l.hp = 0;
  // 板目は細い長い筋にし、煤のような粒の絵を寺の木部だけから外す。
  const woodCanvas = document.createElement('canvas'); woodCanvas.width = woodCanvas.height = 256;
  const wood = woodCanvas.getContext('2d');
  wood.fillStyle = '#c6ad87'; wood.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = i * 37 % 256;
    wood.strokeStyle = i % 3 ? 'rgba(86,60,32,0.1)' : 'rgba(247,226,192,0.16)';
    wood.lineWidth = 0.6; wood.beginPath(); wood.moveTo(x, 0);
    wood.bezierCurveTo(x + 3, 80, x - 3, 176, x, 256); wood.stroke();
  }
  const woodMap = new THREE.CanvasTexture(woodCanvas); woodMap.colorSpace = THREE.SRGBColorSpace;
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping; woodMap.anisotropy = 4;
  rt.flags.templeWoodMap = woodMap;
  for (const gate of rt.scene.children) if (gate.userData.kabuki) templeGateWood(rt, gate);
  // 共有材質を変えず、この寺だけ夜の色と拭き込んだ艶にする。
  const nightMats = new Map();
  for (const b of T.G.buckets.values()) {
    if (!b.mesh || !['plaster', 'wood', 'ita'].includes(b.mk)) continue;
    const old = b.mesh.material;
    if (!nightMats.has(old)) {
      const mat = old.isMeshBasicMaterial
        ? new THREE.MeshStandardMaterial({ map: old.map, vertexColors: old.vertexColors, side: old.side, roughness: 0.95 })
        : old.clone();
      if (b.mk !== 'plaster') { mat.map = woodMap; mat.bumpMap = null; mat.bumpScale = 0; mat.roughness = 0.78; }
      mat.color.set(b.mk === 'plaster' ? 0xb8c3d2 : 0xcbd0d8);
      // 板床と戸口の木部に弱い明るさを残し、屋根の陰でも段と通り口を読めるようにする。
      mat.emissive.set(b.mk === 'plaster' ? 0x515e70 : b.mk === 'ita' ? 0x96846b : 0x594c38);
      mat.emissiveIntensity = b.mk === 'plaster' ? .25 : b.mk === 'ita' ? .55 : .38;
      nightMats.set(old, mat);
    }
    b.mesh.material = nightMats.get(old);
    // 柱の根元と漆喰の下端に雨染み。世界座標で変え、同じ板目の反復を崩す。
    if (b.mk === 'wood' || b.mk === 'plaster') {
      const a = b.mesh.geometry.attributes.color, n = b.mesh.geometry.attributes.normal;
      const p = b.mesh.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = p.getX(i), z = p.getZ(i), h = p.getY(i) - W.heightAt(x, z);
        const base = Math.max(0, 1 - Math.max(0, h) / 1.3);
        const stain = base * (0.1 + 0.13 * (0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 0.8))));
        const shade = b.mk === 'wood' ? n.getY(i) < -0.3 ? 0.64 : n.getX(i) > 0.3 ? 0.82 : 1 : 1;
        const k = shade * (1 - stain);
        a.setXYZ(i, a.getX(i) * k, a.getY(i) * k * (1 - stain * 0.04), a.getZ(i) * k * (1 - stain * 0.12));
      }
      a.needsUpdate = true;
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#ede7d8'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(90,80,65,0.07)'; c.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = (i * 73) % 256, y = (i * 47) % 256;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7 + i % 9, y + i % 3); c.stroke();
  }
  // 円と垂れる筋に見えた略画を外し、淡い繊維だけの白い襖紙にする。
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const mats = new Map();
  for (const m of T.inst.fusuma) {
    if (!m.material.map || m.userData.camBlock) continue;
    if (!mats.has(m.material)) mats.set(m.material, new THREE.MeshStandardMaterial({ color: 0x9faec4, map, roughness: 0.95, side: m.material.side }));
    m.material = mats.get(m.material);
  }
  const paperCanvas = document.createElement('canvas'); paperCanvas.width = paperCanvas.height = 256;
  const paper = paperCanvas.getContext('2d');
  paper.fillStyle = '#f4f1e8'; paper.fillRect(0, 0, 256, 256);
  paper.strokeStyle = 'rgba(156,146,123,0.045)'; paper.lineWidth = 1;
  for (let i = 0; i < 100; i++) {
    const x = i * 73 % 256, y = i * 47 % 256;
    paper.beginPath(); paper.moveTo(x, y); paper.lineTo(x + 5, y + 1); paper.stroke();
  }
  paper.fillStyle = '#795b3b';
  for (let x = 0; x < 256; x += 64) paper.fillRect(x - 2, 0, 4, 256);
  for (let y = 0; y < 256; y += 256 / 6) paper.fillRect(0, y - 1.5, 256, 3);
  const paperMap = new THREE.CanvasTexture(paperCanvas); paperMap.colorSpace = THREE.SRGBColorSpace;
  for (const m of T.inst.shoji) {
    if (!m.material.map || m.userData.camBlock) continue;
    const old = m.material;
    if (!mats.has(old)) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, map: paperMap, roughness: 0.95,
        side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true });
      mats.set(old, mat);
    }
    m.material = mats.get(old);
  }
  // 目前の戸板・柱・梁も共通の見通し処理で抜き、入口と戦う兵を映す。
  // 瓦の形と材質は使い回し、床や戦う兵の数・当たりは変えない。
  // この寺だけの材質を準備時に共有し、ほかの戦の見通し処理は変えない。
  const nearMats = new Map();
  const solidNear = (mesh, roof = false) => {
    if (!mesh || !mesh.userData.camNear || !mesh.material.visible || mesh.material.isShaderMaterial) return;
    const old = mesh.material;
    if (!nearMats.has(old)) {
      const mat = old.clone();
      mat.onBeforeCompile = old.onBeforeCompile;
      mat.customProgramCacheKey = old.customProgramCacheKey;
      mat.userData.camNearSolid = false;
      mat.userData.camNearRoof = roof;
      mat.userData.camNearSmooth = false;
      mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.alphaHash = false;
      mat.forceSinglePass = true;
      nearMats.set(old, mat);
    }
    mesh.material = nearMats.get(old);
  };
  for (const b of T.G.buckets.values()) {
    solidNear(b.mesh, b.mk === 'tile');
    // 壁・柱・梁も視点を止め、見通し処理に頼って壁を越えない。
    // 寺の既存の形と共通の升目検査を使い、新しい形や毎コマの割り当てを増やさない。
    if (b.mesh && (b.mk === 'wood' || b.mk === 'plaster')) b.mesh.userData.camBlock = true;
  }
  for (const meshes of Object.values(T.inst)) for (const mesh of meshes) solidNear(mesh);
  // 畳と室内の木部にも夜の光を受けさせ、灯そのものと光の床は残す。
  const decorMats = new Map();
  for (const hall of T.halls) hall.decor?.traverse((m) => {
    if (!m.isMesh || !m.material.isMeshBasicMaterial || m.material.transparent || m.material.color.getHex() === 0xffd08b) return;
    const old = m.material;
    if (!decorMats.has(old)) decorMats.set(old, new THREE.MeshStandardMaterial({ color: old.color,
      map: old.map, vertexColors: old.vertexColors, side: old.side, roughness: 0.95,
      emissive: 0x625740, emissiveIntensity: .45 }));
    m.material = decorMats.get(old);
  });
  // 廊下の端と各間に灯を置く。照らす光は近い二つだけ、影なしで使い回す。
  const F = rt.flags;
  F.lampLights = [fireGlow(0xffd6a1, 0, 14, 1.5), fireGlow(0xffdfb5, 0, 14, 1.5)];
  F.lamps = [[-66.2, 93.6, 'goten'], [-51, 84.5, 'goten'], [-58.6, 43, 'hondo'],
    [-58.6, 49, 'hondo'], [-34, 67.2, 'shukuboA']].map(([x, z, id]) => ({ x, z, id,
      y: T.G.byId[id].y0 + 0.9 }));
  for (const [x, z, id] of [[-70, 80.6, 'goten'], [-61, 80.6, 'goten'], [-51, 80.6, 'goten'],
    [-61, 92, 'goten'], [-70.5, 86, 'goten'], [-49, 49, 'hondo'],
    [-68.7, 56, 'watari'], [-68.7, 68, 'watari'], [-45.8, 59, 'kairo1'], [-45.8, 71, 'kairo1']]) {
    const rec = T.G.byId[id], floor = rec.y0;
    const fixture = tomyo();
    // 購入部品の原点が中央にあっても、足の底を床へそろえる。
    const bounds = new THREE.Box3().setFromObject(fixture);
    fixture.position.set(x, floor - bounds.min.y, z); rt.scene.add(fixture);
    F.lamps.push({ x, z, id, y: floor + 0.9, fixture });
  }
  // 庭の篝は障子の外。紙越しの暖色は紙の材質にも残す。
  for (const [x, z, id] of [[-61, 97, 'goten'], [-45, 44, 'hondo']]) {
    honnoTorch(rt, x, z, 0.5);
    F.lamps.push({ x, z, id, y: rt.world.heightAt(x, z) + 1.4 });
  }
  for (const mat of mats.values()) {
    mat.emissive.set(0x6b4927); mat.emissiveIntensity = 0.12;
  }
  rt.scene.add(...F.lampLights);
  F.sleeveGeos = new WeakMap(); F.swordGeos = new WeakMap(); F.clothMats = new WeakMap(); F.clothesScan = 0;
  // 台本の出火と自然な延焼を同じ絵へ結ぶ。焼け落ちた棟では屋根の火を消す。
  // 広間だけが燃える間は控えの間と北の廊下を残す。御殿全体の火は下知で始める。
  T.G.byId.goten.noBurn = true;
  // 焼け落ちた屋根と壁を一枚の低い板として残さない。本能寺だけの瓦礫。
  // 形と材質は全棟で共用し、各棟が燃え落ちた時に一度だけ並べる。
  const rubbleGeo = new THREE.BoxGeometry(1, 1, 1);
  const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x292723, roughness: 1 });
  const rubblePose = new THREE.Object3D();
  const fallenRoof = (r) => {
    if (r.honnoRubble || !r.ranges.length || r.noBurn) return;
    r.honnoRubble = true;
    for (const range of r.ranges) {
      // 板葺き・茅葺きと潰れた木の壁も片付ける。瓦だけ消すと黒い台が残る。
      const pos = range.b.mesh.geometry.attributes.position;
      for (let j = range.start; j < range.start + range.count; j++) pos.setY(j, r.y0 - 2);
      if (pos.addUpdateRange) pos.addUpdateRange(range.start * 3, range.count * 3);
      pos.needsUpdate = true;
    }
    const count = Math.min(64, Math.max(16, Math.ceil(r.w * r.d / 3)));
    const rubble = new THREE.InstancedMesh(rubbleGeo, rubbleMat, count);
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
    for (let i = 0; i < count; i++) {
      const x = (((i * 0.618034) % 1) - 0.5) * r.w;
      const z = (((i * 0.414214 + 0.23) % 1) - 0.5) * r.d;
      const wx = r.x + x * c + z * s, wz = r.z - x * s + z * c;
      const beam = i % 5 === 0;
      rubblePose.position.set(wx, W.heightAt(wx, wz) + 0.1, wz);
      rubblePose.rotation.set((i % 3 - 1) * 0.18, i * 2.4, (i % 7 - 3) * 0.07);
      rubblePose.scale.set(beam ? 1.6 : 0.35 + i % 4 * 0.13, beam ? 0.16 : 0.09, beam ? 0.13 : 0.45);
      rubblePose.updateMatrix(); rubble.setMatrixAt(i, rubblePose.matrix);
    }
    rubble.receiveShadow = true;
    rt.scene.add(rubble);
  };
  const ignite = T.fire.ignite.bind(T.fire), tick = T.fire.tick.bind(T.fire);
  T.fire.ignite = (id, why) => {
    if ((typeof id === 'string' ? id : id.id) === 'goten') T.G.byId.goten.noBurn = false;
    const lit = ignite(id, why);
    if (lit) blaze(rt, typeof id === 'string' ? id : id.id);
    return lit;
  };
  T.fire.tick = (dt) => {
    tick(dt);
    rt.flags.blazeScan = (rt.flags.blazeScan || 0) - dt;
    if (rt.flags.blazeScan <= 0) {
      rt.flags.blazeScan = 0.5;
      for (const r of T.G.recs) {
        if (r.state === 2) fallenRoof(r);
        if (r.state === 1 && (r.collapseScale || 1) >= 0.99) blaze(rt, r.id);
        else if (r.state === 2 || r.state === 1 && (r.collapseScale || 1) < 0.99) {
          const b = rt.flags.blazes?.[r.id];
          // 崩れ始めた屋根の固定の炎を消す。寺の共通の炎は屋根の沈みに追従する。
          if (b && !b.burnt) { b.burnt = true; b.stop(); }
        }
      }
    }
    templeGlow(rt);
  };
  rt.flags.fireGlow = fireGlow(0xff873c, 0, 18, 1.4);
  rt.scene.add(rt.flags.fireGlow);
  rt.after(0, () => {
    for (const u of rt.army.units) if (u.team === 0 && !u.isStruct && !u.isPlayer) u.nanori = `味方。織田が家来、${u.name || '上様を守る'}！`;
  });
}

// 空中に炎だけを置かず、共有の鉄籠と三本脚で支える。設営時だけ作る。
function honnoTorch(rt, x, z, size = 0.7) {
  rt.scene.add(kagaribi(rt.world, x, z));
  return rt.world.addFire(x, z, { torch: true, h: 1.35, size });
}

// 三つの持ち場で侍を押し返す。外の備えから人数を引き、道の口から踏み込ませる。
function samuraiStand(rt, n, path) {
  const F = rt.flags;
  const g = akechi(rt, ['表門へ踏み込む侍', '本堂へ踏み込む侍', '最後の間へ踏み込む侍'][n - 1], path,
    [uS(3), uA(3)], { entered: true, player: true, dmg: 1.1 });
  if (!g) return;
  g.honnoStand = n;
  F.stand = g;
  rt.bark(['一の守り。門の侍を押し返せ！', '二の守り。本堂の侍を押し返せ！', '三の守り。最後の間へ通すな！'][n - 1], true);
}

// 燃える棟の上に、屋根の棟に沿った大きな炎と煙の柱（world.addBlaze）。一棟に一度だけ。
function blaze(rt, id) {
  const F = rt.flags, r = F.T?.G.byId[id];
  if (!r || r.state !== 1 || (F.blazes ||= {})[id]) return;
  // 遠い延焼は共通の炎を使い、近い棟の追加の火も六棟までにする。
  if (r.x < -80 || (F.blazeCount || 0) >= 6) return;
  F.blazeCount = (F.blazeCount || 0) + 1;
  const roofCount = 2;
  const b = F.blazes[id] = rt.world.addBlaze(r.x, r.z, { w: r.w || 8, d: r.d || 6, h: r.top || 4, rot: r.rot || 0, n: roofCount });
  // 共通の屋根の火と、下の柱の火だけを残す。側面の大きな炎も戸口を覆うので除く。
  for (const f of b.fires.splice(0)) rt.world.removeFire(f);
  // 屋根の上だけでなく、軒下の柱にも火を置く。室内から炎・煙・火の粉が見える高さ。
  const geo = F.charGeo ||= new THREE.BoxGeometry(0.18, 2.8, 0.18);
  // 火元の足元は七角の焼け跡と明るい縁。煙の中でも形で位置を読める。
  // 同じ形と材質を使い回し、熱・当たり・炎の大きさは変えない。
  const emberGeo = F.emberGeo ||= new THREE.RingGeometry(.42, .64, 7);
  const emberMat = F.emberMat ||= new THREE.MeshBasicMaterial({ color: 0xffda8b, side: THREE.DoubleSide });
  const scorchGeo = F.scorchGeo ||= new THREE.CircleGeometry(.64, 7);
  const scorchMat = F.scorchMat ||= new THREE.MeshBasicMaterial({ color: 0x1a100b, side: THREE.DoubleSide });
  const mat = F.charMat ||= new THREE.MeshStandardMaterial({ color: 0x281d16, emissive: 0x752607, emissiveIntensity: 0.12, roughness: 1 });
  const ca = Math.cos(r.rot || 0), sa = Math.sin(r.rot || 0);
  for (const side of [-1, 1]) {
    const lx = r.w >= r.d ? side * Math.min(r.w / 2 - 0.3, 8) : r.w / 2 - 0.2;
    const lz = r.w >= r.d ? r.d / 2 - 0.2 : side * Math.min(r.d / 2 - 0.3, 8);
    const x = r.x + lx * ca + lz * sa, z = r.z - lx * sa + lz * ca;
    const post = new THREE.Mesh(geo, mat); post.position.set(x, rt.world.heightAt(x, z) + 1.4, z); rt.scene.add(post); (b.posts ||= []).push(post);
    for (const [geometry, material, lift] of [[scorchGeo, scorchMat, .025], [emberGeo, emberMat, .03]]) {
      const mark = new THREE.Mesh(geometry, material);
      mark.rotation.x = -Math.PI / 2; mark.position.set(x, (r.y0 ?? rt.world.heightAt(x, z)) + lift, z);
      rt.scene.add(mark); b.posts.push(mark);
    }
    // 戸口の高さを越える炎の幕にせず、柱に沿う小さな火にする。延焼と熱の判定は変えない。
    b.fires.push(rt.world.addFire(x, z, { size: 0.9, h: 0.35 }));
  }
  const stop = b.stop;
  b.stop = () => { stop(); F.blazeCount--; for (const post of b.posts || []) rt.scene.remove(post); };
}
// 赤い光は火元に置く。壁の向こうで遊ぶ人の頭に明かりを付けない。
function templeGlow(rt) {
  const F = rt.flags, p = rt.player.u.pos, L = F.fireGlow;
  if (!L) return;
  let first = null, second = null, d1 = 18 * 18, d2 = d1;
  for (const q of F.lamps) {
    const burnt = F.T.G.byId[q.id]?.state === 2;
    if (q.fixture) q.fixture.visible = !burnt;
    if (burnt) continue;
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < d1) { second = first; d2 = d1; first = q; d1 = d; }
    else if (d < d2) { second = q; d2 = d; }
  }
  const a = F.lampLights[0], b = F.lampLights[1];
  a.intensity = first ? 4.4 : 0; b.intensity = second ? 3.2 : 0;
  if (first) a.position.set(first.x, first.y, first.z);
  if (second) b.position.set(second.x, second.y, second.z);
  let fire = null, near = 24 * 24;
  for (const f of rt.world.fires) {
    if (f.torch || !inTera(f.x, f.z, 1)) continue;
    const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2;
    if (d < near) { near = d; fire = f; }
  }
  if (!fire) { L.intensity = 0; return; }
  L.position.set(fire.x, fire.base + 0.8, fire.z);
  const sway = SETTINGS.reduceMotion ? 1 : 0.9 + 0.1 * Math.sin(rt.t * 2);
  L.intensity = Math.min(4.5, 1.5 + fire.size) * sway;
}
function gateBlaze(rt) {
  const F = rt.flags, g = GATES.main;
  if (F.gateBlaze) return;
  F.gateBlaze = true;
  // 門の内側の柱に火を見せ、通る口の中央は空ける。
  for (const z of [g.z - g.w / 2, g.z + g.w / 2]) rt.world.addFire(g.x - 0.4, z, { size: 2, h: 0.4 });
}
// 火の段（1〜6）
function fireStage(rt, n) {
  const F = rt.flags, T = F.T, W = rt.world;
  if ((F.fireSt || 0) >= n) return;
  F.fireSt = n;
  const ig = (id, why) => T.fire.ignite(id, why);
  if (n === 1) { ig('soboN', '出火の原因は不明'); rt.bark('表の宿坊から火が出た！', true); }
  if (n === 2) { ig('kairo1', '宿坊からの延焼'); ig('kairo2', '回廊からの延焼'); F.smoke = 1; rt.bark('火が回廊へ移った', true); rt.after(8, () => { if (!F.ending && F.hp === 4) rt.bark('回廊は熱い！　立ち止まらず、本堂へ退け', true); }); }
  if (n === 3) { ig('kuri', '回廊からの延焼'); F.smoke = 1; W.distMul = F.dm0 * 0.7; rt.bark('煙が境内に広がる。遠くが見えぬ'); }
  if (n === 4) {
    W.addFire(-50.6, 81.7, { size: 1.2, h: 0.2 }); ig('hondo', '延焼'); ig('kairo2'); ig('shukuboA');
    W.addSmokeColumn(-53, 6, 89, { size: 1.6 });
    rt.bark('本堂に火が回った！　宿坊も燃えている', true);
  }
  if (n === 5) { F.smoke = 2; W.distMul = F.dm0 * 0.42; rt.bark('煙で、敵と味方の見分けがつかぬ'); }
  if (n === 6) {
    // 御殿の東の広間に火が入る：広間は熱で入れず、守る所は控えの間と居室だけになる
    F.heatZone = { x0: -57, x1: -49, z0: 83.2, z1: 95 };
    // 小さな出火から広間全体が熱くなるまで、下知を読み、襖の口まで退く間を残す。
    // 火の中へ戻れない判定と案内は、出火した瞬間から有効にする。
    F.heatAt = rt.t + 8;
    for (const [x, z] of [[-53, 86], [-51, 92], [-55, 93]]) W.addFire(x, z, { size: 1.6, h: 0.3 });
    // 火は広間の柱に置く。退くよう命じる北の廊下には置かない。
    for (const z of [84, 94]) W.addFire(-50, z, { size: 1.5, h: 0.2 });
    W.addSmokeColumn(-60, 3, 82, { size: 2.2 });
    W.addSmokeColumn(-53, 6, 89, { size: 2.5 });
    // 広間の中から控えの間へ出る口は残す。再入場は道案内の熱の判定で避ける。
    if (F.hp === 7 && F.guardGuide) {
      guardGuide(rt);
      // 直線の距離でなく、襖と廊下を通る道の長さに合わせる。待ちを延ばすのは出火時の一度だけ。
      if (Number.isFinite(F.guardDistance)) F.heatAt = rt.t + Math.min(12, Math.max(8, F.guardDistance / 2 + 2));
      rt.obj('main', '燃える広間を離れ、控えの間で上様を守れ', 'main', true);
      rt.marker('next', () => F.guardDirect && F.guardDistance < 2 ? null : F.guardGuide, '控えの間へ退く道',
        { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.guardDistance });
    }
    rt.bark('広間に火が入った！　控えの間まで退け', true);
  }
}
function teleport(rt, x, z) {
  const P = rt.player.u, W = rt.world, dx = x - P.pos.x, dz = z - P.pos.z;
  for (const g of rt.squadGroups || []) { for (const u of g.units) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; } if (g.anchor) { g.anchor.x += dx; g.anchor.z += dz; } }
  for (const u of rt.tomoUnits || []) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; }
  P.pos.x = x; P.pos.z = z; P.pos.y = W.heightAt(x, z);
}

function honnoReturnLabel(rt) {
  switch (rt.flags.hp) {
    case 3: return '門の内で上様と合流';
    case 5: return '本堂の口で上様と合流';
    case 7: return '御殿で上様と合流';
    default: return '道の印で上様と合流';
  }
}

const honnoji = {
  sightBlocked(rt, a, p, ay, by, postMargin = 0) {
    const T = rt.flags.T, posts = T?.sightPosts;
    if (!posts) return false;
    if (templeRoofFraction(T, a, p, ay, by) < 1) return true;
    const dx = p.x - a.x, dz = p.z - a.z, dy = by - ay, length2 = dx * dx + dz * dz;
    // 閉じた襖と白壁は印も遮る。移動用の線分だけでは、視点からの透視を防げない。
    for (const hall of T.halls) {
      if (hall.rec.state === 2) continue;
      for (const [ax, az, bx, bz, kind, doors] of hall.H.walls) {
        const alongX = Math.abs(bz - az) < 0.001, delta = alongX ? dz : dx;
        if (Math.abs(delta) < 0.00001) continue;
        const t = ((alongX ? az - a.z : ax - a.x)) / delta;
        // 印が壁の面で終わる時も、その壁で隠す。終点だけ除くと襖へ矢印を貼ってしまう。
        if (t <= 0.001 || t > 1.001) continue;
        const cross = alongX ? a.x + dx * t : a.z + dz * t;
        if (cross < (alongX ? ax : az) || cross > (alongX ? bx : bz)) continue;
        const y = ay + dy * t - hall.rec.y0;
        if (y < 0.08 || y > hall.H.H) continue;
        if (y >= 2.15) return true;
        if (kind === 'wall') {
          let open = false;
          for (const [mid, width] of doors) if (Math.abs(cross - mid) < width / 2) { open = true; break; }
          if (!open) return true;
        }
      }
      for (const panel of hall.panels) {
        if (!panel.alive) continue;
        const slide = panel.open * panel.open * (3 - 2 * panel.open);
        const center = (panel.ax ? panel.x : panel.z) + slide * panel.slide * panel.pw * 0.96;
        const face = (panel.ax ? panel.z : panel.x) + slide * panel.depth;
        // 襖の厚みも調べる。面に平行な視線や、紙の中から始まる視線も通さない。
        let lo = .001, hi = .999;
        for (let axis = 0; axis < 3; axis++) {
          const start = axis === 0 ? (panel.ax ? a.x : a.z) : axis === 1 ? (panel.ax ? a.z : a.x) : ay;
          const delta = axis === 0 ? (panel.ax ? dx : dz) : axis === 1 ? (panel.ax ? dz : dx) : dy;
          const low = axis === 0 ? center - panel.pw / 2 : axis === 1 ? face - .04 : panel.y;
          const high = axis === 0 ? center + panel.pw / 2 : axis === 1 ? face + .04 : panel.y + 1.8 * panel.sy;
          if (Math.abs(delta) < .00001) { if (start < low || start > high) { hi = -1; break; } }
          else {
            const t0 = (low - start) / delta, t1 = (high - start) / delta;
            lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
          }
          if (lo > hi) break;
        }
        if (lo <= hi) return true;
      }
    }
    for (const post of posts) {
      if (post.rec.state === 2) continue;
      let low = 0.001, high = 0.999;
      const bottom = post.rec.y0 + 0.25, top = post.rec.y0 + (post.height ?? 2.75);
      if (Math.abs(dy) < 0.00001) { if (ay < bottom || ay > top) continue; }
      else {
        const t0 = (bottom - ay) / dy, t1 = (top - ay) / dy;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
        if (low > high) continue;
      }
      const x = a.x - post.x, z = a.z - post.z;
      // 六角柱の外接円。屋根の下すべてを壁にせず、柱の間は見通せる。
      // 本人を映す肩位置では体の幅も空ける。胸の中心だけ通る隙だと柱が半身を隠す。
      // 敵や道の印の見通しは、これまでどおり柱そのものの太さで調べる。
      const c = x * x + z * z - ((post.radius ?? .14) + postMargin) ** 2;
      if (length2 < 0.000001) { if (c <= 0) return true; continue; }
      const b = x * dx + z * dz, disc = b * b - length2 * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      if (Math.max(low, (-b - root) / length2) <= Math.min(high, (-b + root) / length2)) return true;
    }
    return false;
  },
  civilianCrowd: { bands: PEOPLE_BANDS, fireSize: 1 },
  distanceUnit: 'ken',
  rangeCueClearCenter: true,
  standardClothScale: .72, // 寺の狭い庭と回廊では隊旗の布を控えめにし、隣の兵と刃を見せる。
  nearThreatWarning: true,
  sightFromCamera: true, // 本人に見えても、視点から柱・襖に隠れる人へ札を付けない。
  rearThreatFrame: true, // 見回した後も、敵の前後左右を画面の向きに合わせる。
  compactEnemyFrame: true, // 狙う敵は細い四隅と刀で示し、柱際を太い長方形で覆わない。
  meleeThreatRange: 9,
  meleeThreatHeight: 1.5,
  meleeApproachText: '上になぞって近づく', // 横になぞって向く案内は共通の仕組みで先に出す。
  releaseGuardForAttack: true,
  // すきと間合いに合う時だけ攻撃操作を教える。敵の強さや攻撃の判定は変えない。
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (!enemy.alive || enemy.atk || enemy.swing && !enemy.swing.done || P.sta < 20 || P.guardBroken > 0 ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust')) return false;
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5) return false;
    }
    return true;
  },
  reserveCombatCues: true, // 間合い・気力の字に、上様の行き先を重ねない。
  nearAllyFadeRadius: 2.4,
  nearAllySolidBody: true, // 手前の味方だけ描く間避け、戸口と戦う相手への視界を空ける。
  nearFade: true, // 共通の見通し処理を有効にし、手前の柱・梁を抜いて進む口を見せる。
  nearSceneryScreenCut: true, // 屋根の近い面を抜き、画面の三分の二以上を見通す。
  nearSceneryClearDepth: 18, // 庭の幅に合わせ、手前の灰色の壁面と床の裏を視界へ残さない。
  nearAllyWholeOcclusion: true, // 自分との間を塞ぐ一人も全身で避け、透けた顔や手を宙に残さない。
  woundEffectMin: .05, // 浅い打撲で護衛の案内を退避へ替えない。出血と深手は引き続き知らせる。
  woundRetreatNeeded(rt) {
    const F = rt.flags;
    // 燃える棟から退く下知は、けがの一時退避より先。曲がり角の道案内を残す。
    // 傷・出血・手当ての判定は変えず、持ち場で戦う間は共通の負傷案内に戻す。
    if (!rt.G.lord && F.step < 3 && !F.ending &&
        (F.hp === 4 || F.hp === 6 || F.hp === 8 || F.hp === 7 && F.heatZone)) return false;
    return undefined;
  },
  keepWoundRetreatReason: true, // 負傷時も、置いていない旗でなく足元の退避先を示す。
  nearHatFadeRadius: 0, // 笠と顔を別々に透かさず、全身の視点よけを使う。
  nearSpearFade: false, // 長柄を一律に縮めず、構えと間合いを読める姿で残す。
  keepPlayerWeapon: true, // 自分の槍は構えと間合いの目印。味方の長柄だけ視線を避ける。
  camLift: 0.6,
  camPull: .7,
  footFrameMinDistance: 2.5, // 柱際で目元へ寄った時は、足を映すために真下を向かない。
  nearAllyFadeImportant: true,
  cameraBodyClear(rt, pos) {
    const u = rt.player.u;
    return !this.sightBlocked(rt, pos, u.pos, pos.y, u.pos.y + 1, .32);
  },
  // 壁の手前へ戻すだけでは、肩越しの視線が隣の襖へ向いたままになる。
  // 最後の注視点を決めた後、本人から見える戸口・上様への視線も確かめる。
  frameCamera(rt, pos, look) {
    const P = rt.player, F = rt.flags, u = P.u;
    if (!F.T || !u.alive || rt.over || rt.G.lord || F.step >= 3 ||
        rt.game?.photo || rt.choice || P.aiming || P.cine || P.camShot || P.overHold ||
        P.fpWanted() || !SETTINGS.autoCam || (P.lookIdle || 0) <= 1.2 || !inTera(u.pos.x, u.pos.z)) return;
    // 敵へ注目している間も、本人に見える敵を襖の裏から映さない。
    // 敵が壁の向こうなら下の見通し検査で戻り、壁越しには追わない。
    const eye = F.templeCameraEye || (F.templeCameraEye = new THREE.Vector3());
    eye.set(u.pos.x, u.pos.y + 1.6, u.pos.z);
    let enemy = P.lock?.alive ? P.lock : null;
    // 壁の裏の注視相手で道案内を止めない。判定は五回／秒に留める。
    if (enemy) {
      if (F.templeLock !== enemy || rt.t >= (F.templeLockAt || 0)) {
        F.templeLock = enemy; F.templeLockAt = rt.t + .2;
        F.templeLockClear = !this.sightBlocked(rt, eye, enemy.pos, eye.y, enemy.pos.y + 1.2);
      }
      if (!F.templeLockClear) enemy = null;
    } else F.templeLock = null;
    // 戸口へ移る途中も、すぐ届く刃を先に映す。道案内のために背を向けさせない。
    if (!enemy) {
      if (rt.t >= (F.templeFoeAt || 0)) {
        F.templeFoeAt = rt.t + .25;
        F.templeFoe = rt.army.nearestEnemy(u, 9, other => !other.isStruct && !other.fleeing && !other.woundOut &&
          Math.abs(other.pos.y - u.pos.y) < 1.5 &&
          !this.sightBlocked(rt, eye, other.pos, eye.y, other.pos.y + 1.2));
      }
      if (F.templeFoe?.alive && Math.hypot(F.templeFoe.pos.x - u.pos.x, F.templeFoe.pos.z - u.pos.z) <= 4.5) enemy = F.templeFoe;
    }
    const route = !enemy && !SETTINGS.reduceGuidance && this.routeGuidePriority(rt) && rt.missionGuide?.marker
      ? rt.missionGuide.pos : null;
    const cue = rt.hud.retreatGuide;
    const retreat = !enemy && !route && cue?.active && cue.valid ? cue : null;
    // 構え中も、壁の裏の上様ではなく、退く印か目の前で戦う敵を映す。
    if (!enemy && !route && !retreat && F.templeFoe?.alive) enemy = F.templeFoe;
    const guard = enemy || route || retreat ? null : this.guardTarget(rt);
    // 角の先の案内点ではなく、画面の矢印と同じ、手前の開いた戸口を見る。
    const destination = route || retreat || guard?.pos;
    // 味方の陰や上様が襖の向こうにいる時も、見通せる戸口から映す。
    // 退避先をそのまま注視すると、見通し検査で補正をやめ、白壁の大写しに戻っていた。
    let point = enemy ? enemy.pos : destination ? this.routeSignPoint(rt, destination) : null;
    // 戸口に着いた瞬間は足元を見下ろさず、見通せる次の道へ向く。
    if (route && point && Math.hypot(point.x - u.pos.x, point.z - u.pos.z) < .6 &&
        !this.sightBlocked(rt, eye, route, eye.y, (route.y ?? u.pos.y) + 1.1)) point = route;
    // 戸口に着いて次の印が足元へ来ても、柱に隠れた本人を映し直す。
    if (!point || Math.hypot(point.x - u.pos.x, point.z - u.pos.z) < .6) {
      if (this.cameraBodyClear(rt, pos)) return;
      const forward = F.templeCameraForward || (F.templeCameraForward = new THREE.Vector3());
      let dx = look.x - pos.x, dz = look.z - pos.z;
      const length = Math.hypot(dx, dz);
      if (length < .001) { dx = Math.sin(u.heading); dz = Math.cos(u.heading); }
      else { dx /= length; dz /= length; }
      forward.set(eye.x + dx * 3, u.pos.y, eye.z + dz * 3);
      point = forward;
    }
    const target = F.templeCameraTarget || (F.templeCameraTarget = new THREE.Vector3());
    target.set(point.x, (point.y ?? u.pos.y) + 1.1, point.z);
    // 既存の壁・襖・柱の検査を五回／秒だけ使う。見えない上様へ壁越しに向けない。
    if (rt.t >= (F.templeCameraAt || 0) || F.templeCameraPoint !== point ||
        Math.hypot(target.x - (F.templeTargetX ?? Infinity), target.z - (F.templeTargetZ ?? Infinity)) > .35 ||
        Math.abs(target.y - (F.templeTargetY ?? Infinity)) > .2 ||
        Math.hypot(pos.x - (F.templeCameraX ?? Infinity), pos.z - (F.templeCameraZ ?? Infinity)) > .35) {
      F.templeCameraAt = rt.t + .2; F.templeCameraPoint = point;
      F.templeTargetX = target.x; F.templeTargetY = target.y; F.templeTargetZ = target.z;
      F.templeCameraX = pos.x; F.templeCameraZ = pos.z;
      F.templeCameraClear = !this.sightBlocked(rt, eye, target, eye.y, target.y);
      F.templeCameraBlocked = F.templeCameraClear && this.sightBlocked(rt, pos, target, pos.y, target.y);
      F.templeLookBlocked = this.sightBlocked(rt, pos, look, pos.y, look.y);
      // 行き先が見えていても、手前の柱が本人の胸を隠す肩位置は使わない。
      F.templeBodyBlocked = this.sightBlocked(rt, pos, u.pos, pos.y, u.pos.y + 1, .32);
    }
    // 移動中は戸口だけでなく本人も映す。手で見回す間の条件は上で守る。
    const travelling = !!(route || retreat);
    const crowdedDoor = this.routeGuidePriority(rt) && F.routeSign?.door;
    // 行き先が壁の向こうでも、襖だけを映す視線と、柱に隠れた本人を直す。
    if (!F.templeCameraClear && !F.templeBodyBlocked && !F.templeLookBlocked ||
        !travelling && !crowdedDoor && !F.templeCameraBlocked && !F.templeLookBlocked && !F.templeBodyBlocked) return;
    // 戸口へ向かう線の後ろから、壁を越えず最も遠く見渡せる所を選ぶ。
    // 空きがある限り肩越しを保ち、狭い角では目元まで寄せる。
    if (F.templeCameraBlocked || F.templeLookBlocked || F.templeBodyBlocked || travelling || crowdedDoor) {
      const candidate = F.templeCameraCandidate || (F.templeCameraCandidate = new THREE.Vector3());
      const length = Math.hypot(target.x - eye.x, target.z - eye.z);
      const dx = (target.x - eye.x) / length, dz = (target.z - eye.z) / length;
      const offset = F.templeCameraOffset || (F.templeCameraOffset = new THREE.Vector3());
      // 自分が止まっていても、敵や戸口が変われば、前の肩位置は使えない。
      if (rt.t >= (F.templeCameraFitAt || 0) ||
          Math.hypot(eye.x - (F.templeCameraFitX ?? Infinity), eye.z - (F.templeCameraFitZ ?? Infinity)) > .35 ||
          Math.abs(eye.y - (F.templeCameraFitY ?? Infinity)) > .2 ||
          Math.hypot(target.x - (F.templeCameraFitTX ?? Infinity), target.z - (F.templeCameraFitTZ ?? Infinity)) > .35 ||
          Math.abs(target.y - (F.templeCameraFitTY ?? Infinity)) > .2) {
        F.templeCameraFitAt = rt.t + .2;
        F.templeCameraFitX = eye.x; F.templeCameraFitY = eye.y; F.templeCameraFitZ = eye.z;
        F.templeCameraFitTX = target.x; F.templeCameraFitTY = target.y; F.templeCameraFitTZ = target.z;
        // 本人の背後も壁に阻まれた時だけ、本人の目元を使う。
        // 元の視点を初期値にすると、狭い戸口で襖の大写しへ戻ってしまう。
        offset.set(0, 0, 0);
        let best = -Infinity;
        // 真後ろが柱に重なる時は左右の肩も試す。目元まで寄る前に、通れる隙を使う。
        // 半秒より短い再検査でも、点・配列・形は増やさない。
        for (let i = 0; i < 15; i++) {
          // 背中と壁の間に余地がない時は、横から本人を映す位置も調べる。
          const distance = i >= 11 ? .3 : i === 0 ? 4.9 : i === 1 ? 3.6 : i === 2 ? 2 : i === 3 ? .9 : i === 4 ? .45 : i < 7 ? 3 : 2;
          const side = i >= 11 ? (i % 2 ? 1 : -1) * (i < 13 ? 1.5 : 2.5)
            : i < 5 ? 0 : (i % 2 ? 1 : -1) * (i < 9 ? .75 : 1.5);
          candidate.set(eye.x - dx * distance + dz * side, eye.y + .35, eye.z - dz * distance - dx * side);
          this.clampCamera(rt, candidate);
          // 横へ回って距離だけが増える候補より、本人の後ろに余裕がある位置を選ぶ。
          const behind = (eye.x - candidate.x) * dx + (eye.z - candidate.z) * dz;
          if (behind < (i >= 11 ? .05 : .2)) continue;
          const bodyDistance = Math.hypot(candidate.x - eye.x, candidate.z - eye.z);
          let score = behind - Math.abs(side) * .15;
          // 目元への接近より、体が収まる横の隙間を優先する。
          if (bodyDistance < 1.5) score -= 8;
          // 戸口まで重なる肩を避ける構図を選ぶ。兵の数・位置・攻撃は変えない。
          if (travelling || crowdedDoor) {
            const goal = crowdedDoor ? F.routeSign : target;
            const vx = goal.x - candidate.x, vz = goal.z - candidate.z, span = vx * vx + vz * vz;
            if (span > .01) for (const other of rt.army.units) {
              if (!other.alive || other === u || other === enemy || other.isStruct || Math.abs(other.pos.y - u.pos.y) > 1.5) continue;
              const ox = other.pos.x - candidate.x, oz = other.pos.z - candidate.z;
              const t = (ox * vx + oz * vz) / span;
              if (t > 0 && t < 1 && (ox - vx * t) ** 2 + (oz - vz * t) ** 2 < .75 ** 2) score -= 2;
            }
          }
          // 曲がり角の出口が肩から隠れるだけで、自分まで消さない。
          // 出口も見える肩を優先し、無ければ本人を映せる肩を残す。
          // 間近の戸板に隠れた遠い肩より、入口を見通せる近い肩を選ぶ。
          if (F.templeCameraClear && this.sightBlocked(rt, candidate, target, candidate.y, target.y)) score -= 20;
          if (score <= best || this.sightBlocked(rt, eye, candidate, eye.y, candidate.y) ||
              this.sightBlocked(rt, candidate, u.pos, candidate.y, u.pos.y + 1, .32)) continue;
          best = score; offset.copy(candidate).sub(eye);
        }
      }
      pos.copy(eye).add(offset);
      this.clampCamera(rt, pos);
    } else F.templeCameraFitAt = 0;
    if (!F.templeCameraClear) {
      // 見えない行き先へ壁越しに注目せず、映せるようになった本人へ戻す。
      look.set(u.pos.x, u.pos.y + 1.05, u.pos.z);
      return;
    }
    look.copy(target);
    if (travelling && !crowdedDoor) {
      // 遠い出口だけを中央に置かず、自分と戸口の間を見る。
      const length = Math.hypot(target.x - eye.x, target.z - eye.z);
      const ahead = Math.min(3, length * .5) / length;
      look.set(eye.x + (target.x - eye.x) * ahead, u.pos.y + 1.05, eye.z + (target.z - eye.z) * ahead);
    }
  },
  // 棟の外だけでなく、間仕切りの向こうへ回った視点も本人の側へ戻す。
  clampCamera(rt, pos) {
    const F = rt.flags, u = rt.player.u, T = F.T;
    if (!T || rt.game?.photo) return;
    // 寺外への退却と二条の守りも、同じ肩越しの距離と高さを保つ。
    // 寺の境で制限を外すと、本人が小さくなり屋根を見下ろす視点へ戻っていた。
    if (!rt.G.lord && u.alive) {
      const dx = pos.x - u.pos.x, dz = pos.z - u.pos.z, distance = Math.hypot(dx, dz);
      if (distance > 4.5) {
        pos.x = u.pos.x + dx * 4.5 / distance; pos.z = u.pos.z + dz * 4.5 / distance;
      }
      pos.y = Math.min(pos.y, u.pos.y + 2.7);
    }
    this.clampTempleCamera(rt, pos);
    // 回廊の柱には壁の当たりがない。柱の太さと画面端の余白を含めて
    // 本人から視点への線を測り、柱列の隙を抜けた視点も手前へ戻す。
    const dx = pos.x - u.pos.x, dz = pos.z - u.pos.z, a = dx * dx + dz * dz;
    if (a < 0.0001) return;
    let fraction = templeRoofFraction(T, u.pos, pos, u.pos.y + 1.3, pos.y, .2);
    // 棟の外や戸口の境でも、背後の壁を越えない。室内判定だけでは
    // 足が外へ出た瞬間に間仕切りの検査が抜け、視点が襖の裏へ回る。
    // 開口の高さと幅が足りる時は通す。戸口に立つ本人まで押し込めない。
    for (const hall of T.halls) {
      if (hall.rec.state === 2 || u.pos.y + 1.3 < hall.rec.y0 || u.pos.y > hall.rec.y0 + hall.H.H) continue;
      for (const wall of hall.H.walls) {
        const [ax, az, bx, bz] = wall;
        const alongX = Math.abs(bz - az) < 0.001;
        const start = alongX ? u.pos.z - az : u.pos.x - ax;
        const delta = alongX ? dz : dx;
        if (Math.abs(delta) < 0.0001 || start * delta > 0) continue;
        const crossing = -start / delta;
        const doorCross = alongX ? u.pos.x + dx * crossing : u.pos.z + dz * crossing;
        if (cameraDoorClear(hall, wall, doorCross, u.pos.y + 1.3 + (pos.y - u.pos.y - 1.3) * crossing)) continue;
        const margin = Math.min(0.65, Math.abs(start));
        const t = (Math.abs(start) - margin) / Math.abs(delta);
        if (t > fraction) continue;
        const cross = alongX ? u.pos.x + dx * t : u.pos.z + dz * t;
        if (cross < (alongX ? Math.min(ax, bx) : Math.min(az, bz)) - 0.65 ||
            cross > (alongX ? Math.max(ax, bx) : Math.max(az, bz)) + 0.65) continue;
        fraction = t;
      }
    }
    for (const post of T.sightPosts || []) {
      const r = post.rec;
      if (r.state === 2) continue;
      // 終点が柱より高くても、途中で柱を横切る視線は止める。
      // 柱の高さに入る区間と、柱の周りに入る区間を重ねて調べる。
      const eyeY = u.pos.y + 1.3, dy = pos.y - eyeY;
      let low = 0, high = fraction;
      if (Math.abs(dy) < 0.0001) {
        if (eyeY < r.y0 + 0.25 || eyeY > r.y0 + (post.height ?? 2.75)) continue;
      } else {
        const bottom = (r.y0 + 0.25 - eyeY) / dy, top = (r.y0 + (post.height ?? 2.75) - eyeY) / dy;
        low = Math.max(low, Math.min(bottom, top)); high = Math.min(high, Math.max(bottom, top));
        if (low > high) continue;
      }
      const px = u.pos.x - post.x, pz = u.pos.z - post.z;
      const c = px * px + pz * pz - (post.cameraRadius ?? .85) ** 2;
      const b = px * dx + pz * dz;
      // 柱の余白の中から始まる時も、柱へ近づく視点は本人の側に留める。
      if (c <= 0 && b >= 0) continue;
      const disc = b * b - a * c;
      if (b >= 0 || disc < 0) continue;
      const root = Math.sqrt(disc), t = Math.max(low, (-b - root) / a);
      if (t <= Math.min(high, (-b + root) / a) && t < fraction) fraction = Math.max(0, t - 0.1 / Math.sqrt(a));
    }
    pos.x = u.pos.x + dx * fraction; pos.z = u.pos.z + dz * fraction;
    pos.y = u.pos.y + 1.3 + (pos.y - u.pos.y - 1.3) * fraction;
  },
  clampTempleCamera(rt, pos) {
    const T = rt.flags.T, u = rt.player.u;
    if (!T || rt.game?.photo) return;
    const h = hallAt(T, u.pos.x, u.pos.z);
    // 回廊には部屋の判定がない。本人が柱列の内にいる間は、視点も同じ内側へ収める。
    // 屋根だけの当たりでは、庭へ抜けた視点の目前を柱が覆ってしまう。
    if (!h) for (const r of T.G.recs) {
      if (r.kind !== 'roka' || r.state === 2 || Math.abs(u.pos.y - r.y0 - 0.3) > 1.2) continue;
      const cs = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0);
      const px = (u.pos.x - r.x) * cs - (u.pos.z - r.z) * sn;
      const pz = (u.pos.x - r.x) * sn + (u.pos.z - r.z) * cs;
      if (Math.abs(px) >= r.w / 2 || Math.abs(pz) >= r.d / 2) continue;
      const cx = (pos.x - r.x) * cs - (pos.z - r.z) * sn;
      const cz = (pos.x - r.x) * sn + (pos.z - r.z) * cs;
      let fraction = 1;
      const dx = cx - px, dz = cz - pz;
      const x0 = Math.min(-r.w / 2 + 0.65, px), x1 = Math.max(r.w / 2 - 0.65, px);
      const z0 = Math.min(-r.d / 2 + 0.65, pz), z1 = Math.max(r.d / 2 - 0.65, pz);
      if (cx < x0) fraction = Math.min(fraction, (x0 - px) / dx);
      if (cx > x1) fraction = Math.min(fraction, (x1 - px) / dx);
      if (cz < z0) fraction = Math.min(fraction, (z0 - pz) / dz);
      if (cz > z1) fraction = Math.min(fraction, (z1 - pz) / dz);
      pos.x = u.pos.x + (pos.x - u.pos.x) * fraction;
      pos.z = u.pos.z + (pos.z - u.pos.z) * fraction;
      pos.y = Math.min(pos.y, u.pos.y + 1.7, r.y0 + 2.2);
      break;
    }
    // 庭から振り向いた時も、横長の画面の端を棟の壁へ入れない。
    // 余白を足した箱の内側に本人が入ると、入口の判定が零になって壁を見逃す。
    // 棟そのものとの交点を測り、交点から視点の余白を引く。
    if (!h) {
      if (hallNear(T, u.pos.x, u.pos.z)) {
        const d = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z);
        if (d > 2.2) { pos.x = u.pos.x + (pos.x - u.pos.x) * 2.2 / d; pos.z = u.pos.z + (pos.z - u.pos.z) * 2.2 / d; }
        pos.y = Math.min(pos.y, u.pos.y + 1.7);
      }
      let fraction = 1;
      const length = Math.hypot(pos.x - u.pos.x, pos.y - u.pos.y - 1.3, pos.z - u.pos.z);
      // 庭にいる時も、背後の回廊へ視点を入れない。室内棟だけでは柱列と軒が画面を覆う。
      // 四つの回廊の箱を数値で調べる。本人が廊下の中にいる場合は上の内側の寄せに任せる。
      for (const r of T.G.recs) {
        if (r.kind !== 'roka' || r.state === 2) continue;
        const cs = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0);
        const px = (u.pos.x - r.x) * cs - (u.pos.z - r.z) * sn;
        const pz = (u.pos.x - r.x) * sn + (u.pos.z - r.z) * cs;
        if (Math.abs(px) < r.w / 2 && Math.abs(pz) < r.d / 2) continue;
        const cx = (pos.x - r.x) * cs - (pos.z - r.z) * sn;
        const cz = (pos.x - r.x) * sn + (pos.z - r.z) * cs;
        let lo = 0, hi = fraction;
        for (let axis = 0; axis < 3; axis++) {
          const start = axis === 0 ? px : axis === 1 ? u.pos.y + 1.3 : pz;
          const end = axis === 0 ? cx : axis === 1 ? pos.y : cz;
          const low = axis === 0 ? -r.w / 2 : axis === 1 ? r.y0 : -r.d / 2;
          const high = axis === 0 ? r.w / 2 : axis === 1 ? r.y0 + 3.8 : r.d / 2;
          const delta = end - start;
          if (Math.abs(delta) < 0.0001) { if (start < low || start > high) { hi = -1; break; } }
          else {
            const a = (low - start) / delta, b = (high - start) / delta;
            lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
          }
        }
        if (hi >= lo && hi > 0) fraction = Math.min(fraction, Math.max(0, lo - 0.9 / Math.max(0.9, length)));
      }
      for (const hall of T.halls) {
        if (hall.rec.state === 2) continue;
        let lo = 0, hi = fraction;
        for (let axis = 0; axis < 3; axis++) {
          const start = axis === 0 ? u.pos.x : axis === 1 ? u.pos.y + 1.3 : u.pos.z;
          const end = axis === 0 ? pos.x : axis === 1 ? pos.y : pos.z;
          const low = axis === 0 ? hall.x0 : axis === 1 ? hall.rec.y0 : hall.z0;
          const high = axis === 0 ? hall.x1 : axis === 1 ? hall.rec.y0 + hall.H.H + 3 : hall.z1;
          const delta = end - start;
          if (Math.abs(delta) < 0.0001) { if (start < low || start > high) { hi = -1; break; } }
          else {
            const a = (low - start) / delta, b = (high - start) / delta;
            lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
          }
        }
        if (hi >= lo && hi > 0) fraction = Math.min(fraction, Math.max(0, lo - 0.9 / Math.max(0.9, length)));
      }
      pos.x = u.pos.x + (pos.x - u.pos.x) * fraction;
      pos.y = u.pos.y + 1.3 + (pos.y - u.pos.y - 1.3) * fraction;
      pos.z = u.pos.z + (pos.z - u.pos.z) * fraction;
      return;
    }
    if (!h || h.rec.state === 2 || Math.abs(u.pos.y - h.rec.y0) > 1.2) return;
    const margin = 0.65;
    const distance = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z);
    if (distance > 2.4) { pos.x = u.pos.x + (pos.x - u.pos.x) * 2.4 / distance; pos.z = u.pos.z + (pos.z - u.pos.z) * 2.4 / distance; }
    // 外壁の戸口を抜ける視線なら、箱の内へ押し込まない（戸口に立つと視点が本人に重なり、白壁しか映らなかった。10/20）。
    let throughDoor = false;
    {
      const dx0 = pos.x - u.pos.x, dz0 = pos.z - u.pos.z;
      for (const wall of h.H.walls) {
        const [ax, az, bx, bz] = wall, alongX = Math.abs(bz - az) < 0.001;
        const outer = alongX ? Math.abs(az - h.z0) < .01 || Math.abs(az - h.z1) < .01 : Math.abs(ax - h.x0) < .01 || Math.abs(ax - h.x1) < .01;
        const delta = alongX ? dz0 : dx0;
        if (!outer || Math.abs(delta) < 0.0001) continue;
        const t = (alongX ? az - u.pos.z : ax - u.pos.x) / delta;
        if (t <= 0 || t > 1) continue;
        const cross = alongX ? u.pos.x + dx0 * t : u.pos.z + dz0 * t;
        if (cameraDoorClear(h, wall, cross, u.pos.y + 1.3 + (pos.y - u.pos.y - 1.3) * t)) { throughDoor = true; break; }
      }
    }
    if (!throughDoor) {
      pos.x = Math.max(Math.min(h.x0 + margin, u.pos.x), Math.min(Math.max(h.x1 - margin, u.pos.x), pos.x));
      pos.z = Math.max(Math.min(h.z0 + margin, u.pos.z), Math.min(Math.max(h.z1 - margin, u.pos.z), pos.z));
    }
    // 間仕切りの開口を通す。鴨居・小壁と閉じた襖では手前に留める。
    const px = u.pos.x, pz = u.pos.z, dx = pos.x - px, dz = pos.z - pz;
    let fraction = 1;
    for (const wall of h.H.walls) {
      const [ax, az, bx, bz] = wall;
      const alongX = Math.abs(bz - az) < 0.001;
      const delta = alongX ? dz : dx;
      if (Math.abs(delta) < 0.0001) continue;
      const distance = (alongX ? az - pz : ax - px);
      const t = distance / delta;
      if (t <= 0 || t > fraction) continue;
      const cross = alongX ? px + dx * t : pz + dz * t;
      if (cross < (alongX ? ax : az) - margin || cross > (alongX ? bx : bz) + margin) continue;
      if (cameraDoorClear(h, wall, cross, u.pos.y + 1.3 + (pos.y - u.pos.y - 1.3) * t)) continue;
      fraction = Math.max(0, t - Math.min(margin, Math.abs(distance)) / Math.abs(delta));
    }
    pos.x = px + dx * fraction; pos.z = pz + dz * fraction;
    pos.y = Math.min(pos.y, u.pos.y + 1.7, h.rec.y0 + h.H.H - 0.55);
  },
  jinkei: [HONNO_ATTACK, HONNO_DEFEND],
  uchisute: true, // 護衛と退却を優先し、首袋の案内を出さない。
  noticeOnce: true, // 同じ台詞と知らせは、この戦で一度だけ。
  immediatePhaseTasks: true, // 門を閉める下知と、門を守る下知を混ぜない。
  keepTaskLabel: true, // 退く下知を、近くの敵を倒す案内で上書きしない。
  keepGuardTaskLabel: true, // 槍の向きの案内でも、守る場所と退き口を残す。
  // 門の実物と画面端に同じ門形を使う。道の曲がり角は既存の経路で示す。
  destinationLandmark(rt) {
    const F = rt.flags;
    return !rt.G.lord && F.step < 3 && (F.hp === 2 || F.hp === 3) &&
      !gateFight(rt) && !gateDefending(rt) ? GATES.main : null;
  },
  destinationName(rt) {
    const F = rt.flags;
    if (!rt.G.lord && F.step < 3) {
      if (F.hp === 2 || F.hp === 3) return '表門';
      if (F.hp >= 4 && F.hp <= 7) return '信長';
    }
    return '';
  },
  namedGuideMarkers: true,
  hideGuideSteps: true, // 道案内は次の旗と短い下知だけ。
  keepDestinationTask: true, // 戸口への短い案内を、遠い表門の案内に戻さない。
  routeDestinationSight: true, // 襖越しの床に到着の旗を貼らず、曲がり角の方向を示す。
  compactTravelArrow: true, // 道案内は一本。門とお堂の入口の印を主にする。
  moveGuideObstacles: rt => rt.flags.lamps, // 指と矢印を灯りから離す。
  openingFootSignOnly: true, // 開幕も足元の輪だけにし、本人を縦長の白枠で隠さない。
  guideArrowLength: 96, // 退避の線も足元の短い案内に収め、兵の列を横切らない。
  swipeArrowLength: 96,
  guideLinkLength: 48,
  routeFootsteps: true,
  routeTurnDistance: 6,
  floorArrowMaxPixels: 72, // 手前の床へ投影しても、兵より大きい矢印にしない。
  enemyCornerSign: true, // 描画側の指定に合わせ、狭い廊下の敵は細い四隅だけを示す。
  enemyFrameAtPosition: true, // 更新前の骨の位置で空の床を囲まず、敵の現在位置から測る。
  compactRetreatSign: true, // 狭い戸口では退避の旗と矢印を小さくし、足元を見せる。
  // 寺内の斬り合いを、なぞる練習の入力待ちで止めない。下知もすぐ見せ直す。
  pauseTurnPractice: false,
  dodgeTurnDuration: 3,
  dodgeTurnInterval: 24,
  treatmentControlInset: 224, // 携帯横では命の札の横へ置き、上の歩く輪とも重ねない。
  treatmentCrossSign: true, // 傷を止める場所は十字。護衛と退却の矢印と見分ける。
  namedDestinationLabel(rt, pos) {
    const F = rt.flags;
    return !rt.G.lord && F.step < 3 && (F.hp === 2 || F.hp === 3) &&
      Math.hypot(pos.x - GATES.main.x, pos.z - GATES.main.z) < 8 ? 'ここへ' : '';
  },
  // 道の先の床ではなく、最初にくぐる開口そのものへ矢印を置く。
  routeSignPoint(rt, goal) {
    if (!rt.G.lord && rt.flags.step < 3 && (rt.flags.hp === 2 || rt.flags.hp === 3)) {
      gateFight(rt);
      if (rt.flags.gateApproach?.alive) goal = rt.flags.gateApproach.pos;
      // 庭から門へ直に通れるなら、途中の庭でなく表門そのものを示す。
      else if (rt.flags.entrancePos && patrolClear(rt, rt.flags.entrancePos.x, rt.flags.entrancePos.z)) goal = rt.flags.entrancePos;
    }
    // 戻る入口の近くでは、外の供や縁側でなく堂内へ向ける。
    if (!rt.G.lord && rt.flags.step < 3 && (rt.flags.hp === 4 || rt.flags.hp === 5) &&
        Math.hypot(rt.player.u.pos.x - HONDO_FRONT.x, rt.player.u.pos.z - HONDO_FRONT.z) < 24) goal = HONDO_IN;
    const p = rt.player.u.pos;
    let dx = goal.x - p.x, dz = goal.z - p.z;
    const sign = rt.flags.routeSign || (rt.flags.routeSign = { x: 0, z: 0 });
    if (sign.at > rt.t && sign.at <= rt.t + .5 && sign.gx === goal.x && sign.gz === goal.z &&
        Math.hypot(p.x - sign.px, p.z - sign.pz) < .4) return sign;
    sign.at = rt.t + .5; sign.gx = goal.x; sign.gz = goal.z; sign.px = p.x; sign.pz = p.z;
    sign.x = goal.x; sign.z = goal.z; sign.y = undefined; sign.door = false; sign.frame = null; sign.indoor = false; sign.corridor = false;
    // 共通の案内点は座標だけを写すため、元の道の角から向きを取り直す。
    const F = rt.flags;
    const route = F.hp <= 3 ? F.patrolGuide : F.hp <= 5 ? F.hondoGuide : F.hp === 6 ? F.mvGuide : F.hp === 7 ? F.guardGuide : F.escapeGuide;
    const direction = route && Math.hypot(route.x - goal.x, route.z - goal.z) < .01 ? route : goal;
    sign.dirX = direction.dirX; sign.dirZ = direction.dirZ;
    const halls = rt.flags.T?.halls;
    if (!halls) return sign;
    sign.indoor = halls.some(h => h.rec.state !== 2 && p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1);
    // 曲がる床は開口探しで先へ飛ばさず、共通の折れ矢印へ渡す。
    const distance = Math.hypot(dx, dz);
    if (sign.indoor && distance > .6 && distance < 7 && Number.isFinite(sign.dirX) && Number.isFinite(sign.dirZ) &&
        Math.abs((dx * sign.dirZ - dz * sign.dirX) / distance) > .5 && patrolClear(rt, sign.x, sign.z) &&
        !this.sightBlocked(rt, p, sign, p.y + 1.2, p.y + 1.2)) {
      sign.y = goal.y ?? p.y;
      return sign;
    }
    // 角の床で案内を止めず、その先で最初にくぐる開口を探す。
    // 道の座標は動かさず、表示用の点だけを延ばす。
    if (sign.indoor && Math.hypot(dx, dz) < 7 && Number.isFinite(sign.dirX) && Number.isFinite(sign.dirZ)) {
      const ahead = F.routeSignAhead || (F.routeSignAhead = { x: 0, y: 0, z: 0 });
      ahead.x = goal.x + sign.dirX * 6; ahead.z = goal.z + sign.dirZ * 6; ahead.y = goal.y ?? p.y;
      goal = ahead; dx = goal.x - p.x; dz = goal.z - p.z;
    }
    // 庭から戻る時は東の入口を示し、横の壁の別の開口へ案内しない。
    if (goal === HONDO_IN && !sign.indoor && rt.flags.hondoFrame && p.x > -47) {
      sign.x = -46.9; sign.z = HONDO_FRONT.z;
      sign.y = rt.flags.hondoFrame[0].y - .12;
      sign.door = true; sign.frame = rt.flags.hondoFrame;
      sign.dirX = -1; sign.dirZ = 0;
      return sign;
    }
    const findExit = sign.indoor && !rt.G.lord && (rt.flags.hp === 2 || rt.flags.hp === 3 ||
      (rt.flags.hp === 4 || rt.flags.hp === 5) && p.z > 80);
    const probe = rt.flags.routeDoorProbe || (rt.flags.routeDoorProbe = { x: 0, y: 0, z: 0 });
    // 遠い戸口を斜めに見ると、背後の襖に肩位置を押され、本人が消える。
    // まず廊下に沿って角へ進み、戸口の前で庭へ向きを変える。
    if (findExit) for (const hall of halls) {
      if (hall.id !== 'goten' || hall.rec.state === 2 || p.x <= hall.x0 || p.x >= hall.x1 ||
          p.z <= hall.z0 || p.z >= 83.2) continue;
      const wall = hall.H.walls[0], x = -52, z = hall.z0;
      if (Math.abs(p.x - x) > 2.4) {
        probe.x = x; probe.z = 82.2; probe.y = hall.rec.y0;
        if (patrolClear(rt, probe.x, probe.z) && !this.sightBlocked(rt, p, probe, p.y + 1.2, probe.y + 1.2)) {
          sign.x = probe.x; sign.z = probe.z; sign.y = probe.y; sign.corridor = true;
          sign.dirX = Math.sign(x - p.x); sign.dirZ = 0;
          return sign;
        }
      }
      probe.x = x; probe.z = z + .55; probe.y = hall.rec.y0;
      if (Math.hypot(p.x - x, p.z - z) < .7 || !cameraDoorClear(hall, wall, x, p.y + 1.2) ||
          !patrolClear(rt, probe.x, probe.z) || this.sightBlocked(rt, p, probe, p.y + 1.2, probe.y + 1.2)) continue;
      const opening = routeDoorOpening(rt, hall, wall, x);
      if (opening.high - opening.low < .8 || !cameraDoorClear(hall, wall, opening.mid, hall.rec.y0 + 1.2)) continue;
      sign.x = x; sign.z = z; sign.y = hall.rec.y0; sign.door = true;
      routeDoorFrame(rt, sign, hall, wall, opening);
      return sign;
    }
    let nearest = 1;
    for (const hall of halls) {
      if (hall.rec.state === 2) continue;
      for (const wall of hall.H.walls) {
        const [ax, az, bx, bz] = wall, alongX = Math.abs(bz - az) < .001;
        // 外への札は、直線上でも間仕切りでなく外周の開口を指す。
        if (findExit && !(alongX ? az === hall.z0 || az === hall.z1 : ax === hall.x0 || ax === hall.x1)) continue;
        const delta = alongX ? dz : dx;
        if (Math.abs(delta) < .0001) continue;
        const t = ((alongX ? az - p.z : ax - p.x)) / delta;
        if (t <= .001 || t > nearest) continue;
        const cross = alongX ? p.x + dx * t : p.z + dz * t;
        if (cross < (alongX ? ax : az) || cross > (alongX ? bx : bz) ||
            !cameraDoorClear(hall, wall, cross, p.y + 1.2)) continue;
        const opening = routeDoorOpening(rt, hall, wall, cross);
        if (opening.high - opening.low < .8 || !cameraDoorClear(hall, wall, opening.mid, hall.rec.y0 + 1.2)) continue;
        const mid = opening.mid;
        const x = alongX ? mid : ax, z = alongX ? az : mid, d = Math.hypot(x - p.x, z - p.z);
        if (d > .7) {
          probe.x = x + (p.x - x) * .55 / d; probe.z = z + (p.z - z) * .55 / d; probe.y = hall.rec.y0;
          if (!patrolClear(rt, probe.x, probe.z) || this.sightBlocked(rt, p, probe, p.y + 1.2, probe.y + 1.2)) continue;
        }
        nearest = t; sign.x = x; sign.z = z;
        sign.y = hall.rec.y0; sign.door = true;
        routeDoorFrame(rt, sign, hall, wall, opening);
      }
    }
    // 直線が白壁へ当たる時は、手前から通れる開口を探す。
    // 兵の道や当たりは変えず、印だけを開いた襖・戸口へ寄せる。
    // 同じ間の味方や、目の前の曲がり角へ通れる時は、別の部屋の出口へ誘わない。
    // 廊下の次の角へ通れるなら、その道を保つ。外周の出口を探すために
    // 横の部屋へ印を移すと、視点まで襖へ向き、表門への合流が遅れる。
    if (!sign.door && (!patrolClear(rt, sign.x, sign.z) ||
        this.sightBlocked(rt, p, sign, p.y + 1.2, (sign.y ?? p.y) + 1.2))) {
      let best = Infinity;
      for (const hall of halls) {
        if (hall.rec.state === 2 || Math.abs(hall.rec.y0 - p.y) > 1.5) continue;
        for (const wall of hall.H.walls) {
          const [ax, az, bx, bz] = wall, alongX = Math.abs(bz - az) < .001;
          // 外周へ直接出られない時は、まず通れる間仕切りの戸口を示す。
          const low = alongX ? ax : az, high = alongX ? bx : bz;
          for (let cross = low + .5; cross < high - .4; cross += .6) {
            if (!cameraDoorClear(hall, wall, cross, hall.rec.y0 + 1.2)) continue;
            const opening = routeDoorOpening(rt, hall, wall, cross);
            if (opening.high - opening.low < .8 || !cameraDoorClear(hall, wall, opening.mid, hall.rec.y0 + 1.2)) continue;
            const x = alongX ? opening.mid : ax, z = alongX ? az : opening.mid;
            const d = Math.hypot(x - p.x, z - p.z);
            const score = d + Math.hypot(goal.x - x, goal.z - z);
            if (d < .7 || d > 24 || score >= best) continue;
            // 曲がり角の印が壁の手前で終わっても、その先の出口を示す。
            // 横や少し後ろにある戸口も候補にする。壁へ直進する代わりに、近い開口へ回る。
            if (sign.indoor && (score > Math.hypot(dx, dz) + 12 || d > Math.max(8, Math.hypot(dx, dz) + 4))) continue;
            // 開口の少し手前まで、人の幅で通れることを確かめる。
            probe.x = x + (p.x - x) * .55 / d; probe.z = z + (p.z - z) * .55 / d; probe.y = hall.rec.y0;
            if (!patrolClear(rt, probe.x, probe.z) || this.sightBlocked(rt, p, probe, p.y + 1.2, probe.y + 1.2)) continue;
            best = score; sign.x = x; sign.z = z; sign.y = hall.rec.y0; sign.door = true;
            // 回り道でも、空いた戸口の中央と幅に輪を合わせる。
            routeDoorFrame(rt, sign, hall, wall, opening);
          }
        }
      }
    }
    return sign;
  },
  // 寄せ手のいない庭へ逃げ続けず、戸口と曲がり角を通って護衛に戻る。
  routeGuidePriority(rt) {
    const F = rt.flags;
    if (rt.G.lord || F.step >= 3 || F.ending) return false;
    // 守備の下知が先に出ても、まだ御殿や回廊にいる人には門までの道を残す。
    return !!((F.hp === 2 || F.hp === 3) && !gateFight(rt) && F.gateApproach?.alive ||
      F.hp === 1 || F.hp === 2 && !gateFight(rt) && (!F.gMain || F.patrolDistance > 10) ||
      F.hp === 3 && !gateDefending(rt) && !gateFight(rt) || F.escortShown || F.hp === 4 || F.hp === 6 || F.hp === 8 ||
      F.hp === 5 && (!F.hondoDirect || F.hondoDistance >= 6) ||
      F.hp === 7 && (!F.guardDirect || F.guardDistance >= 6 || !!F.heatZone));
  },
  // 曲がり角に着き、曲がった先まで通れる時だけ方向を教える。
  routeTurnReady(rt, sign = rt.flags.routeSign) {
    if (!sign || sign.door || !Number.isFinite(sign.dirX) || !Number.isFinite(sign.dirZ)) return false;
    const p = rt.player.u.pos, distance = Math.hypot(sign.x - p.x, sign.z - p.z);
    if (distance < .6 || distance > this.routeTurnDistance) return false;
    const ahead = rt.flags.turnGuideAhead || (rt.flags.turnGuideAhead = { x:0, y:0, z:0 });
    ahead.x = sign.x + sign.dirX * 2.5; ahead.z = sign.z + sign.dirZ * 2.5; ahead.y = sign.y ?? p.y;
    return patrolClear(rt, ahead.x, ahead.z) &&
      !this.sightBlocked(rt, p, ahead, p.y + 1.2, ahead.y + 1.2);
  },
  travelGuideLabel(rt, keepDestination = false) {
    const F = rt.flags;
    if (F.step === 5) return this.escapeGuideLabel(rt);
    if (F.step >= 3) return '御所の西の門へ';
    if ((F.hp === 2 || F.hp === 3) && gateFight(rt)) return '敵をたおせ';
    // 戸口の枠と旗に添える札は、遠い門の行き先より先に示す。
    if (F.hp === 1) return F.waitReached ? 'ここで待て' : '矢印へ進め';
    if (F.hp === 4 || F.hp === 5) {
      if (F.hp === 4 && Math.hypot(rt.player.u.pos.x - HONDO_IN.x, rt.player.u.pos.z - HONDO_IN.z) < 6)
        return '部屋で信長を待て';
      const door = rt.nearestInteract();
      return door?.id === 'naka_tobira' && door.label !== '戸を開ける' ? '東の戸を通る' : '東の戸を開ける';
    }
    if (F.routeSign?.door && this.routeGuidePriority(rt)) return 'ここを通る';
    if ((F.hp === 2 || F.hp === 3) && F.gateApproach?.alive) return '門へ走れ';
    if (gateDefending(rt)) return '門の内で信長を守れ';
    if ((F.hp === 2 || F.hp === 3) && F.routeSign && !F.routeSign.indoor) return '門へ走れ';
    if (F.routeSign?.corridor && this.routeGuidePriority(rt)) {
      return F.hp === 4 || F.hp === 5 ? '廊下の先から 本堂へ' : '廊下の先から 表門へ';
    }
    const sign = F.routeSign, p = rt.player.u.pos;
    if (sign && !sign.door && Number.isFinite(sign.dirX) && Number.isFinite(sign.dirZ)) {
      const dx = sign.x - p.x, dz = sign.z - p.z, distance = Math.hypot(dx, dz);
      if (this.routeTurnReady(rt, sign)) {
        const turn = (dx * sign.dirZ - dz * sign.dirX) / distance;
        if (Math.abs(turn) > .5) {
          const yaw = templeViewYaw(rt);
          const side = -sign.dirX * Math.cos(yaw) + sign.dirZ * Math.sin(yaw);
          return Math.abs(side) < .35 ? '角を曲がって進む' : side >= 0 ? '右へ曲がる' : '左へ曲がる';
        }
      }
    }
    if (sign?.indoor && !sign.door) {
      const yaw = templeViewYaw(rt);
      const dx = sign.x - p.x, dz = sign.z - p.z, distance = Math.hypot(dx, dz) || 1;
      const side = (-dx * Math.cos(yaw) + dz * Math.sin(yaw)) / distance;
      const forward = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance;
      if (forward < -.35) return side >= 0 ? '右へ向き直る' : '左へ向き直る';
      return side > .4 ? '右の角へ' : side < -.4 ? '左の角へ' : '旗まで進む';
    }
    // 印と任務札では同じ短い行き先を使う。
    if (!keepDestination) {
      if (F.hp === 6) return F.escortShown ? 'この人の所へ戻る' : 'この人についていく';
      if (F.hp === 8) return this.escapeGuideLabel(rt);
    }
    // 戸口の印にも行き先を添える。守りへの合流と退却を同じ「ここへ」にしない。
    if (F.hp === 2 || F.hp === 3) {
      const sign = F.routeSign;
      if (sign?.door) return 'ここを通る';
      if (sign && !sign.door && !sign.indoor) return '門へ走れ';
      if (!(F.patrolDistance > 10 && sign?.indoor)) return '門へ走れ';
      // 敵の増減で札を切り替えず、いま通る戸口の動作を短く保つ。
      return '次の印へ進む';
    }
    if (F.hp === 4 || F.hp === 5) return '信長のもとへ';
    if (F.hp === 6) return F.escortShown ? 'この人の所へ戻る' : 'この人についていく';
    if (F.hp === 7) return '奥の信長へ';
    if (F.hp === 8) return this.escapeGuideLabel(rt);
    return F.hp === 1 ? '次の印へ進む' : '印へ すすめ';
  },
  waitOrderLabel(rt, reached) {
    if (!rt.G.lord && rt.flags.hp === 1) return reached ? 'ここで待て' : '矢印へ進め';
  },
  escapeGuideLabel(rt, point = rt.missionGuide?.pos) {
    if (!rt.G.lord && rt.flags.step === 5) return '御所の北の口へ 退け';
    if (!rt.G.lord && rt.flags.hp === 8) return '裏門から 外へ退け';
    if (!point) return '印へ にげよう';
    const target = point;
    const p = rt.player.u.pos, yaw = templeViewYaw(rt);
    const side = -(target.x - p.x) * Math.cos(yaw) + (target.z - p.z) * Math.sin(yaw);
    return Math.abs(side) < .5 ? '旗へにげる' : side > 0 ? '右へにげる' : '左へにげる';
  },
  // 退避先の共通の旗と同じ言葉で示す。
  dodgeLabel: () => 'ここへ にげる',
  dodgeGuideLabel: (_rt, reached) => reached ? 'ここで かまえる' : 'ここへ にげる',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.treatmentReady) return p.treating ? '手当てを押し続ける' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '敵から離れ、味方の後ろへ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '十字まで もどろう';
    if (!p.treatmentShelter(p.u.pos)) return '敵が近い。味方の後ろへ';
    if (p.treatmentNext > rt.t) return `次の手当てまで${Math.ceil(p.treatmentNext - rt.t)}秒`;
    if (p.u.lastHitT <= 6) return `足を止め、あと${Math.max(1, Math.ceil(6 - p.u.lastHitT))}秒待つ`;
    if (p.inCombatT > 0) return '構えを解き、戦いの息を整える';
    return '足を止め、攻撃をやめて手当て';
  },
  retreatGuideLabel(rt, reached) {
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) return this.treatmentGuideLabel(rt, cue);
    if (reached) return 'ここで かまえる';
    if (rt.flags.step === 5) return this.escapeGuideLabel(rt, cue?.valid ? cue : undefined);
    if (rt.flags.step >= 3) return '西の門の内へ';
    if (rt.flags.hp === 8) return this.escapeGuideLabel(rt, cue?.valid ? cue : undefined);
    // 襖や部屋に入る下知と取り違えず、足元の退避印と行動を名指す。
    if (cue?.active && cue.valid) return this.escapeGuideLabel(rt, cue);
    return '味方の後ろへ';
  },
  distanceText(rt, distance) {
    if (!rt.G.lord && (rt.flags.hp === 4 || rt.flags.hp === 6)) return '';
    if (!rt.G.lord && rt.flags.hp === 1) return rt.flags.waitReached ? '輪に着いた' : '旗の輪へ すすむ';
    if (!rt.G.lord && rt.flags.hp === 2) return '';
    return '';
  },
  namedGuideTarget(rt) {
    const F = rt.flags;
    return !rt.G.lord && F.step < 3 && !F.ending && F.nb?.alive ? F.nb : null;
  },
  missionHeading(rt) {
    const F = rt.flags;
    if (rt.G.lord || F.step >= 3 || F.ending) return '';
    const enemy = rt.missionGuide?.closeEnemy;
    if (F.hp >= 2 && enemy?.alive && !enemy.gone && !enemy.woundOut && !enemy.fleeing &&
        Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) < 4.5) return '近くの敵をたおせ';
    if ((F.hp === 4 || F.hp === 5) && this.routeGuidePriority(rt)) return '信長へ進む';
    return this.taskLabel(rt, '');
  },
  taskLabel(rt, text) {
    const F = rt.flags;
    if (rt.G.lord || F.step >= 3) return text;
    if (F.hp === 6) return F.escortShown ? 'この人の所へ戻る' : 'この人についていく';
    // 火の知らせを一時の台詞だけに任せず、熱を受けている間は行き先と一緒に残す。
    if (F.T?.heatWarm > 0 && F.hp >= 4 && F.hp <= 8) {
      return this.routeGuidePriority(rt) ? this.travelGuideLabel(rt) : '火から はなれろ';
    }
    // 補足が畳まれても、離れたままで失敗するまでの猶予を主の札に残す。
    if (F.escortShown) return 'この人の所へ戻る';
    const enemy = rt.guideEnemy?.alive ? rt.guideEnemy : rt.missionGuide?.closeEnemy;
    if (F.hp >= 2 && !this.routeGuidePriority(rt) && !F.heatZone &&
        enemy?.alive && !enemy.gone && !enemy.woundOut && !enemy.fleeing &&
        Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) < 4.5)
      return '近くの敵をたおせ';
    if (F.hp === 7 && F.heatZone) {
      const p = rt.player.u.pos, Z = F.heatZone;
      return p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1
        ? '火から離れ、印へ退け' : '信長を守れ';
    }
    if ((F.hp === 2 || F.hp === 3) && gateFight(rt)) return '敵をたおせ';
    if (F.hp === 2 && !F.gMain && rt.nearestInteract()?.id === 'gate' && !gateBlocker(rt)) return '門をしめる';
    if (F.hp >= 2 && this.routeGuidePriority(rt)) return this.travelGuideLabel(rt, true);
    if (F.hp === 2) {
      if (F.gMain) return '門の内を守る';
      if (Math.hypot(rt.player.u.pos.x - GATES.main.x, rt.player.u.pos.z - GATES.main.z) > 6) return this.travelGuideLabel(rt, true);
      const blocker = gateBlocker(rt);
      return blocker ? blocker.team === 1 ? '敵をたおせ' : '門の内へ下がる' : '門をしめる';
    }
    return ({ 1: F.waitReached ? 'ここで待て' : '矢印へ進め', 3: '信長を守れ', 4: this.travelGuideLabel(rt, true), 5: !F.hondoDirect || F.hondoDistance >= 6 ? this.travelGuideLabel(rt, true) : '信長を守れ',
      6: this.travelGuideLabel(rt, true), 7: '信長を守れ', 8: this.escapeGuideLabel(rt) })[F.hp] || text;
  },
  // 残り時間は同じ任務札に大きく示す。失敗までの猶予は変えない。
  taskTimeLabel(rt) {
    const F = rt.flags;
    if (rt.G.lord || F.step >= 3 || F.ending) return '';
    if (F.hp === 4) return `あと${Math.max(0, Math.ceil(180 - (rt.t - F.pT)))}秒`;
    if (F.hp === 6) {
      const left = Math.max(0, Math.ceil(Math.min(150 - (rt.t - F.pT), F.farT > 0 ? 60 - F.farT : Infinity)));
      return `あと${left}びょう`;
    }
    return F.escortShown && F.farT > 0 ? `あと${Math.max(0, Math.ceil(60 - F.farT))}びょう` : '';
  },
  retryAdvice(rt, info) {
    // 傷で倒れた時は共通の手当ての助言を残す。護衛失敗では実際の役目を示す。
    if (info.down || rt.G.lord) return '';
    const F = rt.flags;
    if (F.step === 5) return '北の口へ退き、町へ逃げよう';
    if (F.step >= 3) return '御所の西の門の内で、信忠様を守ろう';
    if (F.hp === 6) return '戸口の印を追い、上様と奥へ退こう';
    if (F.hp === 8) return '道の印を追い、裏門から逃げよう';
    return '戸口の印を追い、白い着物の上様へ戻ろう';
  },
  escortGuideTarget(rt) {
    const F = rt.flags;
    return !rt.G.lord && F.step < 3 && F.hp === 6 && !F.ending ? F.nb : null;
  },
  placeFrame(rt) {
    // 本堂の入口も道の旗で示す。同じ下知の札と大枠を重ねない。
    return null;
  },
  // 二条は守備の百二十五秒と退却の九十秒で締める。
  // 寺からの移動が遅れても、共通の八分制限で守備の下知を打ち切らない。
  pacingWait: (rt) => !!rt.flags.ending || (!rt.G.lord && (rt.flags.hp === 9 || rt.flags.step >= 3)),
  missionDangerText(rt) {
    if (rt.flags.step === 5) return '危ない！ 北の口へ退け';
    if (rt.flags.step >= 3) return '危ない！ 西の門の内で守れ';
    if (rt.flags.escortShown) return '上様と離れた！ 印で合流せよ';
    if (rt.flags.hp === 2) return '危ない！ 近い敵を払い、表門へ';
    if (rt.flags.hp === 4) return this.travelGuideLabel(rt);
    if (rt.flags.hp === 6) return '危ない！ 印の道で上様と退け';
    return '危ない！ 上様の前の敵を払え';
  },
  introPlace: '京 本能寺（油小路蛸薬師）',
  introTaskFirst: true,
  introText: (rt) => rt.G.lord ? '明智勢が寺を囲む。寄せ手を防ぎ、御殿の奥へ退け。'
    : '廊下の矢印へ進み、命令を待とう。合図が出たら、戸口を抜けて表門へ。',
  battleVoices: { lines: {
    ally: { encircle1: ['敵が回り込む。上様の前を守れ'], encircle2: ['上様の前の敵を斬り、囲みを抜けよ'], ambient: ['煙を吸うな。口を袖で覆え', '火が迫る。仲間の退く道を空けよ', '倒れた者がおる。残る者で口を支えよ'] },
    enemy: { ambient: ['門を押せ！　信長は寺の中じゃ！'], nanori: ['明智の先手じゃ！　参る！'],
      waver: ['退け、退け！'], breaking: ['退け、退け！'],
      push: ['門を押せ！'], pushing: ['奥へ踏み込め！'] },
  } },
  armySignals: false, // 不意の襲撃。各隊の自動合図は止め、場面の突撃・退却だけ台本で鳴らす。
  noAllyReports: true, // 寺の中の声は使番に運ばせない（遅れて届く「○○殿より」を出さない）。
  noWake: true, // 寺の各口へ出す波だけを実兵にし、外の囲みと自動増援を重ねない。
  enemyTactics: { flank: false }, // 狭い境内では野戦の大回りで塀の外へ出ず、各口から攻める。
  guideMarker(rt) {
    const F = rt.flags;
    if (rt.G.lord) return F.lstep >= 3 ? 'fire' : F.lstep === 2.5 ? 'rishi' : F.lstep === 2 ? 'oku' : F.lstep === 1.5 ? 'court' : 'gE';
    if (F.step >= 3) return F.step === 5 ? 'out' : 'ng';
    if ((F.hp === 2 || F.hp === 3) && !gateFight(rt) && F.gateApproach?.alive) return 'next';
    if ((F.hp === 2 && F.gMain && F.patrolDistance <= 10) || ((F.hp === 2 || F.hp === 3) && gateFight(rt))) return null;
    if (F.hp === 7 && F.heatZone) return 'next';
    // 壁越しの上様より、実際に通れる口を指す。近づいたら人の印へ戻す。
    if (F.hp === 3 && !gateDefending(rt)) return 'next';
    if (F.hp === 5 && (!F.hondoDirect || F.hondoDistance >= 6)) return 'next';
    if (F.hp === 7 && (!F.guardDirect || F.guardDistance >= 6)) return 'next';
    return F.hp === 1 || F.hp === 2 || F.hp === 4 || F.hp === 6 || F.hp === 8 ? 'next' : 'nb';
  },
  guardLabel: () => '信長を守ろう',
  guardName: () => '信長',
  guardTarget(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    // 遠い主君を指す盾で戸口の道案内を隠さない。合流してから護衛の印へ替える。
    const close = gateDefending(rt) ||
      F.hp === 5 && F.hondoDirect && F.hondoDistance < 6 ||
      F.hp === 7 && F.guardDirect && F.guardDistance < 6 && !F.heatZone;
    if (rt.G.lord || F.step >= 3 || !close || !F.nb?.alive) return null;
    const p = rt.player.u.pos, nb = F.nb.pos;
    // 門を守っていても、まだ襖の奥にいる上様へ盾を重ねない。
    if (Math.hypot(nb.x - p.x, nb.z - p.z) >= 12) return null;
    // 札と視点から繰り返し呼ばれても、壁の検査は五回／秒まで。
    if (!(F.guardSightAt > rt.t)) {
      F.guardSightAt = rt.t + .2;
      // 本人に見えても、肩越しの視点では柱や襖が上様を隠すことがある。
      // その時は壁へ盾を貼らず、既存の道案内を使う。
      const camera = rt.camera.position;
      F.guardSightClear = !this.sightBlocked(rt, p, nb, p.y + 1.6, nb.y + 1.2) &&
        !this.sightBlocked(rt, camera, nb, camera.y, nb.y + 1.2);
    }
    return F.guardSightClear ? F.nb : null;
  },
  botOrders: true, // 守り・退き口の道を、人ごとの突進で上書きしない。
  // 矢玉への横歩きも、専用の退路と同じく炎・襖・柱を横切らない。
  botCoverBlocked: (rt, from, to) => !guardClear(rt, to.x, to.z, from),
  // 本堂から御殿、二条の守備と退却は専用の道を使う。離れた味方への共通の退避で持ち場を離れない。
  botEvacuating: (rt) => !rt.G.lord && ((rt.flags.hp >= 4 && rt.flags.hp <= 8) || (rt.flags.step >= 3 && rt.flags.step <= 5)),
  prelude: false,   // 静かな寺に突然の襲撃：溜めない（prelude.js）
  spawn: { x: PATROL_START.x, z: PATROL_START.z, heading: Math.PI / 2 },
  noHorse: true,   // 本能寺の変だけは馬に乗れない（kaito 10/2。寺の中で戦う）
  cornerEnemyGuide: true, // 敵の四隅と刀の印で、戸口の旗と見分ける。
  playerFootSignOnly: true, // 自分は白い足元の輪、狙う敵は頭上の矢印で見分ける。
  groundGuideRings: true,
  softGuideRings: true, // 任務の輪は地面に沿う淡い光。任務の意味は既存の札で示す。
  smallTaskAreas: true, // 狭い堂内を白い大輪で覆わず、足元に小さな印を残す。判定の広さは保つ。
  compactGuardGuide: true, // 護衛の盾を小さくし、上様の顔と近い兵の刃を見せる。
  world: {
    lowHumanDetail: 16, // 門と室内の斬り合いは保ち、遠い兵の細部だけ軽くする。
    noArrowRain: true, // 数人の弓に数十本の追加矢を重ねない。実際に射た矢と壁・屋根の遮蔽は残す。
    roundedFire: true,
    contactShadows: true, // 画質「高」でも味方と本人の足元に共用の柔らかな陰を残す。
    contactDust: true, // 近い押し合いだけ低い砂埃。共通の毎秒四つの上限を使う。
    fireLightLift: 1.35, // 既存の灯りの枠で、燃える柱と近い人への照り返しを残す。
    gravelCourt: { x0: TERA.x0, x1: TERA.x1, z0: TERA.z0, z1: TERA.z1, color: [.52, .48, .39], pathZ: 50, pathX: -64, pathWidth: 2.2, buildings: COURT_BUILDINGS, garden: COURT_GARDEN },
    opaqueCorpses: true, // 亡骸は床に残し、片付ける時まで薄くしない。
    allyPersonalSpace: 1.25,
    ordinaryFlagStride: 3, // 狭い門と堂内では指物を三人に一本。隊旗と名のある者の旗は残す。
    fallenHelmets: true,
    variedMarch: true, livingSpearHedge: true, // 列と人数を保ち、歩調・呼吸・押し返す手元を一人ずつずらす。
    fallPaceSpread: 0.35, groundedFalls: true, // 膝が折れる間をずらし、横倒しの胴と槍を地面で支える。
    settleSideFalls: true, settleFallenLimbs: true, settleFallenBody: true, // 遠目の亡骸も腰と胸を支え、手足だけ接地した宙の胴を残さない。
    contactFalls: true, // 胴が地へ着いてから音と低い埃。板床では土煙を出さない。
    seed: 1582 + 6,
    time: 'morning',     // 襲撃は早天。初夏の明け方の薄明から始める
    wind: [0.4, -1],
    nightLift: 0,      // 携帯でも足もとと門が見える明るさ
    fogFar: 200,
    muddy: 0,
    // 通りは境内と堀の手前で切り、寺の庭を町の道が横切らないようにする。
    paths: [...STREET_X.flatMap((s) => s > TERA.x0 - 4 && s < TERA.x1 + 4 ? [[[s, -170], [s, TERA.z0 - 4]], [[s, TERA.z1 + 4], [s, 170]]] : [[[s, -170], [s, 170]]]),
      ...STREET_Z.flatMap((s) => s > TERA.z0 - 4 && s < TERA.z1 + 4 ? [[[-170, s], [TERA.x0 - 4, s]], [[TERA.x1 + 4, s], [170, s]]] : [[[-170, s], [170, s]]])],
    height,
    // 先頭の道だけでは後列が塀へ斜めに寄る。各兵も表門の芯を通す。
    moveWay(army, u, want) {
      // 上様は隊の先の点へまっすぐ寄らず、移る道の点を一つずつ踏む。角を省くと渡り廊下の壁に掛かって止まる。
      const g = u.group;
      if (g?.honnoFollowPath && g.order === 'path' && g.path && !u.target && !u.atk && !u.swing) {
        if (u._honnoWayPath !== g.path) { u._honnoWayPath = g.path; u._honnoWayI = 0; }
        let i = u._honnoWayI;
        // 今より先の点で一番近い点へ（押されて道を外れても、後ろの点へ戻らない）。踏めば次へ。
        const last = Math.min(g.pathIdx, g.path.length - 1);
        let best = i, bd = i <= last ? Math.hypot(g.path[i][0] - u.pos.x, g.path[i][1] - u.pos.z) : 0;
        const prt = u._honnoPrt || (u._honnoPrt = { army, world: army.world, flags: {} });
        for (let j = i + 1; j <= last; j++) { const d = Math.hypot(g.path[j][0] - u.pos.x, g.path[j][1] - u.pos.z); if (d < bd && patrolClear(prt, g.path[j][0], g.path[j][1], u.pos)) { bd = d; best = j; } }
        const next = Math.min(best + 1, g.pathIdx, g.path.length - 1);
        i = bd < 1.2 && patrolClear(prt, g.path[next][0], g.path[next][1], u.pos) ? next : best;
        while (i < last) {
          const a = g.path[i], n = g.path[i + 1];
          if (Math.hypot(n[0] - u.pos.x, n[1] - u.pos.z) < Math.hypot(n[0] - a[0], n[1] - a[1]) - 0.3 && patrolClear(prt, n[0], n[1], u.pos)) i++; else break;
        }
        u._honnoWayI = i;
        if (i < g.pathIdx && i < g.path.length) {
          // 見通せる一番先の点（三つ先まで）へ。人や柱で点に寄れなくても、角の先が見えれば進む。
          // どの点も見えない時は隊の持ち場へ任せる（壁越しの点を追って、別の口から外へ出て行かない）。
          for (let j = Math.min(g.pathIdx, i + 3, g.path.length - 1); j >= i; j--) {
            if (!patrolClear(prt, g.path[j][0], g.path[j][1], u.pos)) continue;
            const q = u._honnoWayWant || (u._honnoWayWant = { x: 0, z: 0 });
            q.x = g.path[j][0]; q.z = g.path[j][1];
            return q;
          }
          return want;
        }
      }
      if (!u.group?.honnoMainEntry || u.pos.x < GATES.main.x - 1.6 || want.x >= GATES.main.x) return want;
      const q = u.honnoEntryWant;
      q.z = GATES.main.z + (u.slot % 2 ? 0.6 : -0.6);
      // 塀の内側へ押された後列も、まず塀沿いに門の口へ寄る。
      // ここで内へ斜めに向かうと、東の宿坊の壁（-33、66〜74）へ突っ込む。
      q.x = Math.abs(u.pos.z - q.z) > 0.8
        ? (u.pos.x > GATES.main.x ? GATES.main.x + 3 : u.pos.x)
        : GATES.main.x - 3;
      return q;
    },
    tint(x, z, h, c) {
      // 灰白の砂利、暗い石畳、軒際一・五メートルの踏まれた土。
      if (inTera(x, z)) {
        const v = 0.025 * Math.sin(x * 0.19) * Math.cos(z * 0.23);
        const garden = Math.hypot(x - COURT_GARDEN.x, z - COURT_GARDEN.z);
        if (garden < COURT_GARDEN.r + 1) c.setRGB(0.34 + v, 0.39 + v, 0.25 + v);
        else if (courtPaving(x, z)) c.setRGB(0.43 + v, 0.42 + v, 0.38 + v);
        else if (courtBuildingDistance(x, z) < 1.5) c.setRGB(0.48 + v, 0.40 + v, 0.29 + v);
        else c.setRGB(0.72 + v, 0.70 + v, 0.64 + v);
        return;
      }
      // 御所の囲い内も掃き清めた土。緑の地色から庭一面の草が生えないようにする。
      if (Math.abs(x - NIJO.x) < NIJO.h && Math.abs(z - NIJO.z) < NIJO.h) {
        const v = 0.47 + 0.025 * Math.sin(x * 0.7) * Math.cos(z * 0.9);
        c.setRGB(v + 0.05, v, v - 0.07); return;
      }
      const onSt = onTownStreet(x, z);
      if (onSt) c.lerp({ r: 0.52, g: 0.47, b: 0.38 }, 0.5);
    },
    clear: (x, z) => inTera(x, z, 6) || onTownStreet(x, z) || (Math.abs(x) < 130 && Math.abs(z) < 150),
    trees: 160,
    tufts: 1400,
    treeDensity: (x, z) => (inTera(x, z, 6) ? 0 : Math.abs(x) < 140 && Math.abs(z) < 160 ? 0.02 : 0.6),
    groves: [{ x: HONNO.x - 6, z: HONNO.z + 8, r: 6, n: 6 }, { x: NIJO.x + 6, z: NIJO.z + 6, r: 6, n: 6 }],
    camPull: 1.0,
    fleeOut: (x, z) => Math.abs(x) > 170 || Math.abs(z) > 170,
  },

  setup(rt) {
    // 初めの札は下知を切らず、本文だけ指や鍵で送れるようにする。この戦を出たら外す。
    const hud = document.getElementById('hud'), introStyle = document.createElement('style');
    hud?.setAttribute('data-honnoji', '');
    introStyle.textContent = `
#hud[data-honnoji] #intro:has(#intro-go) > .card { display:flex; flex-direction:column; align-items:stretch; }
#hud[data-honnoji] #intro .intro-reading p { margin:8px 0; }
#hud[data-honnoji] #intro .intro-reading .date { letter-spacing:.08em; line-height:1.6; text-wrap:balance; }
#hud[data-honnoji] #intro .intro-reading .ttl { font-size:clamp(28px, 4vw, 48px); margin:8px 0; }
#hud[data-honnoji] #intro .intro-reading .rule { margin:8px auto; }
#hud[data-honnoji] #intro .intro-reading { width:100%; min-height:0; flex:1 1 auto; overflow-y:auto; touch-action:pan-y; pointer-events:auto; overscroll-behavior:contain; }
#hud[data-honnoji] #intro-go { flex-shrink:0; }
#hud[data-honnoji] #objectives .destination-distance { font-size:20px; line-height:1.4; }
/* 携帯横でも危険の下知を二行で読める。日付より今の行動を先に見せる。 */
@media (max-height:500px) {
  html body #hud[data-honnoji] #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now),
  html body #hud[data-honnoji] #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
    font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
    line-height:1.4 !important;
  }
  html body #hud[data-honnoji] #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    max-height:min(33vh, calc(100% - var(--notice-top, 64px) - var(--notice-floor, 96px))) !important;
  }
  html body #hud[data-honnoji] #battle-notices #battle-message .battle-notice.warn {
    font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.45 !important;
  }
  #hud[data-honnoji] #battle-notices:has(.battle-notice.warn:not([hidden])) #situation { display:none !important; }
}
/* 大きい画面では地図の左に知らせを置き、北の門と退き道の印を空ける。 */
@media (min-width:901px) and (min-height:501px) {
  html:not(.touch) body #hud[data-honnoji] #battle-notices:not(.choosing),
  html:not(.touch) body #hud[data-honnoji].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:auto !important; right:calc(216px + env(safe-area-inset-right, 0px)) !important;
    top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
    width:min(320px, 28vw) !important; max-height:calc(100% - 216px) !important;
  }
  html:not(.touch) body #hud[data-honnoji] #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
    white-space:normal !important; overflow-wrap:anywhere; line-height:1.4 !important;
  }
}
`;
    document.head.appendChild(introStyle);
    const dispose = rt.dispose;
    rt.dispose = function (...args) {
      introStyle.remove(); hud?.removeAttribute('data-honnoji');
      const waitRing = this.flags.waitRing;
      if (waitRing) { this.scene.remove(waitRing); waitRing.geometry.dispose(); waitRing.material.dispose(); this.flags.waitRing = null; }
      return dispose.apply(this, args);
    };
    // この戦では倒れた者を即座に担ぎ起こして戦線へ戻さない。
    lostCauseNote(rt, rt.G.lord ? '寄せ手を防ぎ、奥へ退け' : '上様を守り、退く下知に従え');
    // 数の減りを知らせる共通の台詞も、今の持ち場へ言い換える。
    // 御所を守る最中に、離れた旗へ戻れと命じない。
    const say = rt.say.bind(rt);
    rt.say = (who, text, ...args) => {
      if (who === '組頭' && /^味方が(?:もう持たぬ！|討ち減らされておる。)/.test(text)) text = this.missionDangerText(rt);
      return say(who, text, ...args);
    };
    rt.flags.rescued = true; rt.firstBattle = false;
    rt.flags.patrolProbe = { x: 0, y: 0, z: 0 };
    // 馬には乗れない（信長で遊ぶ時も）。降ろして、空馬も取らせない
    const P0 = rt.player;
    const finish = rt.finish.bind(rt);
    rt.finish = (...args) => {
      // 深手のやり直し札を待つ間も、動けない本人へ護衛・退却の道案内を残さない。
      // 少し前へ戻す時は、既存の写しから任務と印も戻る。
      if (args[0]?.down && !rt.G.lord) {
        rt.flags.ending = true;
        for (const id of ['next', 'nb', 'amb', 'flank', 'out', 'nExit', 'north', 'chase']) rt.unmark(id);
        for (const id of ['gz', 'hz', 'gt', 'ng', 'out']) rt.unzone(id);
        rt.uninteract('gate'); rt.objRemove('escort'); rt.objRemove('flank');
        rt.obj('main', args[0].dead ? '討死した。やり直すか、結果へ進む' : '深手を負った。やり直すか、結果へ進む', 'main', true);
      }
      // 終戦で操作が止まる前に、構え・溜め・振りの途中を解く。生存した本人の腕を伸ばしたまま残さない。
      if (P0.u.alive) {
        P0.guard = P0.aiming = P0.charging = false;
        P0.draw = P0.chargeT = 0; P0.pending = P0.swingImpact = null;
        P0.u.atk = P0.u.swing = null; P0.u.target = null;
        P0.u.guard = false; P0.u.guarding = P0.u.guardFlash = P0.u.pAtk = 0;
        poseArms(P0.u);
      }
      return finish(...args);
    };
    if (P0.mounted) { rt.army.setMounted(P0.u, false); P0.mounted = false; }
    P0.canRide = false; P0.updateTake = () => {};
    // 寺の供の衣を少数の色で共有する。小姓は灯のそばでも肌と衣を見分けられる色にする。
    const spawnHonno = rt.army.spawn;
    const colors = [0x485c70, 0x786052, 0x59694e, 0x8b7961];
    let clothesN = 0;
    rt.army.spawn = function (group, list, ...rest) {
      const varied = list.flatMap(q => {
        if (q.o?.kosode && q.o.name && q.type === 'samurai') {
          const col = new THREE.Color(q.o.kosodeCol || 0x78634d).multiplyScalar(0.8).getHex();
          return [{ ...q, o: { ...q.o, kosodeCol: col, skin: q.o.skin ?? 0xb58c68 } }];
        }
        if (!q.o?.kosode || q.o.name || q.n < 1) return [q];
        const out = [];
        for (let i = 0; i < q.n; i++) out.push({ ...q, n: 1, o: { ...q.o, kosodeCol: colors[clothesN++ % colors.length] } });
        return out;
      });
      return spawnHonno.call(this, group, varied, ...rest);
    };
    if (rt.G.lord) { this.lordSetup(rt); return; }
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.hp = 0; F.ek = 0; F.ak = 0; F.foes = []; F.dm0 = W.distMul || 1;
    F.bossName = '森蘭丸';   // 寺の中の上役（褒め・叱りの声）。二条御所では信忠
    // ---- 京の町並み：通りに面して町屋を並べる（境内と二条御所の中は空ける） ----
    const inCompound = (x, z) => inTera(x, z, 6) || (Math.abs(x - NIJO.x) < NIJO.h + 8 && Math.abs(z - NIJO.z) < NIJO.h + 8);
    // 町屋が何十も並ぶ所なので、材質ごとの BatchedMesh にまとめて描く回数を減らす
    const hutBatch = makeSimpleBatch();
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z) || onTownStreet(x, z, 7)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    rt.scene.add(well(W, -8, 62), kido(W, -27, 40, Math.PI / 2), well(W, -74, 57));
    // 寺の周りの路地：町ごとの木戸（夜は閉まる）と共同の井戸を、蛸薬師通りの両側に足す
    rt.scene.add(kido(W, TERA.x0 - 7, 36, 0), kido(W, TERA.x0 - 7, 96, 0), kido(W, -27, 78, Math.PI / 2), kido(W, -27, 104, Math.PI / 2), kido(W, TERA.x0 - 13, 66, 0), kido(W, -10, 90, Math.PI / 2));
    rt.scene.add(well(W, TERA.x0 - 14, 44), well(W, TERA.x0 - 16, 90), well(W, -24, 96), well(W, -30, 20));
    // ---- 本能寺の境内（築地・門・伽藍・中のある建物）と二条御所 ----
    F.T = buildTera(rt); cleanTemple(rt); courtGarden(rt);
    rt.army.doorVia = (u, to) => honnoDoor(rt, u, to);
    F.leaves = templeGateWood(rt, openLeaves(W, GATES.main.x, GATES.main.z, GATES.main.w)); rt.scene.add(F.leaves);
    F.gSide = smallGate(rt, GATES.side, 900);
    F.gKatte = smallGate(rt, GATES.katte, 700);
    NIJO.back = 'n';
    // 二条御所の塀も材質ごとの BatchedMesh にまとめ、描く回数を減らす
    const wallBatch = makeKitBatch();
    F.nwall = compound(rt, NIJO, 'w', 7, wallBatch);
    finalizeKitBatch(rt, wallBatch);
    rt.scene.add(templeGateWood(rt, kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2)));
    // 二条御所は戦国期の御殿。後の二条城の天守・石垣は置かない。広間と奥の間は推定。
    F.nijoRoom = buildRoom(rt, NIJO.x + 2, NIJO.z - 2, { w: 16, d: 11, kind: 'goten', rot: -Math.PI / 2, night: true });
    F.nijoRoom.inside.name = '二条御所'; F.nijoRoom.inside.where = '二条御所の奥の間';
    hut(W, NIJO.x - 6, NIJO.z + 10, 8, 5, 0, { batch: hutBatch });
    buildNearbyChurch(rt, hutBatch);
    finalizeSimpleBatch(rt, hutBatch);
    for (const [x, z] of [[NIJO.x - 10, NIJO.z - 6], [NIJO.x - 10, NIJO.z + 6], [NIJO.x + 10, NIJO.z + 10]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // 置き旗は回廊の出口と退く道を避け、築地・外庭の脇へ。近くの兵を大きな布で覆わない。
    rt.scene.add(nobori(W, -33, 62, 'oda', 3.8), nobori(W, -42, 101, 'eiraku', 3.8));
    // ---- 外周を封じる明智の大軍（軽い作り）。築地の外の通りを埋める ----
    F.aHost = buildSonae(rt, [HONNO_ATTACK]);
    honnoRing(rt);
    F.ehon = camp(rt, { x: -104, z: 120, facing: Math.PI * 0.75, team: 1, faction: 'akechi', mon: 'akechi', armor: 0x2a2a30, general: { name: '明智光秀', hat: 'kabuto_m', haori: 0x3a3a5a }, guard: 15, reserve: 0, runTo: { x: -86, z: 100 } });
    for (const [x, z] of [[-24, 40], [-24, 62], [TERA.x0 - 5, 50], [TERA.x0 - 5, 95], [-60, 112], [-40, TERA.z0 - 8]]) honnoTorch(rt, x, z);
    for (const [x, z] of [[-20, 56], [TERA.x0 - 7, 60], [-50, 114], [-62, TERA.z0 - 8]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    if (F.ehon.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    // ---- 寺の中の者：信長・小姓衆・馬廻と中間・僧 ----
    F.nbG = allyGroup(rt, { fixed: true, name: '織田信長', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[0]), facing: Math.PI / 2, width: 1, aggro: NBK.A, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '織田信長', kosode: 1, honnoCloth: true, kosodeCol: 0xebe5d6, obi: 0x2e3448, flag: null, horse: false, keep: true } }]);
    F.nb = F.nbG.units[0];
    F.nbG.hideFlags = true; // 寝所から出た上様に本陣の大旗を背負わせない。
    F.nbG.honnoFollowPath = true;
    if (F.T) {
      F.T.keepUnits = [F.nb];
      // 御殿へ移る間は、選んだ道の通る棟の口を開けておく（上様の後から来る自分が締め出されない）。
      F.T.keepOpen = (h) => F.hp === 6 && !!F.mv && MOVES[F.mv].pts.some(([x, z]) => x > h.x0 - 0.5 && x < h.x1 + 0.5 && z > h.z0 - 0.5 && z < h.z1 + 0.5);
    }
    // 小袖の一人の人として、通常の傷を受ける。名前で体力を増やさない。
    F.nbG.defMult = 1;
    F.nb.maxHp = F.nb.hp = 125; F.nb.dmg = 13; F.nb.isOfficer = false; F.nb.isLord = false;
    F.nbWeapons = { bow: makeWeapon('bow'), spear: makeWeapon('spear', 0, 'su') };
    nbWeapon(rt, 'bow');
    F.nb.range = 0;   // 寝所では弓を番えない（表へ出て、門の内で射る）
    F.kosho =allyGroup(rt, { fixed: true, name: '森蘭丸と小姓衆', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[1]), facing: Math.PI / 2, width: 3, aggro: 7, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 1, o: { name: '森蘭丸', kosode: 1, honnoCloth: true, kosodeCol: 0x5a3a2e, obi: 0x6a2a24, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森坊丸', kosode: 1, honnoCloth: true, kosodeCol: 0x536783, obi: 0x30251c, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森力丸', kosode: 1, honnoCloth: true, kosodeCol: 0x78634d, obi: 0x30251c, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '高橋虎松', kosode: 1, honnoCloth: true, kosodeCol: 0x49617a, obi: 0x30251c, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '菅屋角蔵', kosode: 1, honnoCloth: true, kosodeCol: 0x49617a, obi: 0x30251c, flag: null, horse: false } }]);
    F.kosho.defMult = 1;
    F.kosho.hideFlags = true;
    F.ran = F.kosho.units[0];
    F.uma = allyGroup(rt, { fixed: true, name: '馬廻と中間', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[2]), facing: Math.PI / 2, width: 6, aggro: 8, noRout: true, fullStrength: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3, o: { ...NEMAKI(0x4a463e), keep: true } }, { type: 'ashigaru', n: 3, o: { ...NEMAKI(0x5a5244), keep: true } }], ODA));   // 具足は宿直の侍二人だけ。ほかは寝間着の小袖に槍
    F.uma.defMult = 1;
    F.uma.hideFlags = true;
    // 供の者はそれぞれ持ち場（本堂の縁・回廊・御殿の廊下の口・勝手口の内）に詰め、そこで戦って倒れる。上様の後ろに固まらない。
    F.posts = [
      ['本堂の縁の守り', { x: -44.5, z: 42.8 }, Math.PI / 2, [uS(1), nA(2)]],
      ['回廊の守り', { x: -45, z: 63 }, Math.PI / 2, [nA(2)]],
      ['御殿の廊下の守り', { x: -55, z: 77 }, Math.PI, [nS(1), nA(2)]],
      ['勝手口の守り', { x: -47, z: 98 }, 0, [nA(2)]],
    ].map(([name, anchor, facing, list]) => {
      const g = allyGroup(rt, { fixed: true, name, anchor, facing, width: 3, aggro: 8, noRout: true, fullStrength: true, formation: 'line' }, dress(list, ODA));
      g.defMult = 1;
      g.hideFlags = true;
      return g;
    });
    // 武器を持たない僧は民の仕組みで置き、兵の名簿・人数・戦功へ入れない。
    // 自分の組は、狭い寺の中なので四人まで（室内に一度に入れる数を絞る）
    const n = RANKS[rt.G.rank].squad;
    // 自分の組も寝込みを襲われた者：具足を着る間は無く、寝間着の小袖に槍だけを取って飛び出す
    if (n) {
      const spawn0 = rt.army.spawn;
      rt.army.spawn = (g, list, ...rest) => spawn0.call(rt.army, g, list.map((q) => ({ ...q, o: { ...(q.o || {}), ...NEMAKI(0x3e3a34) } })), ...rest);
      try { rt.makeSquad({ x: -60, z: 77.5 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 4) }]); } finally { rt.army.spawn = spawn0; }
      for (const g of rt.squadGroups) g.hideFlags = true;
    }
    // 自分も寝間着の小袖のまま（具足も笠も指物も無い）。刀と槍だけを取った
    rt.after(0, () => { const u = rt.player.u; u.look = { ...u.look, kosode: 1, honnoCloth: true, sohei: 1, soheiV: null, kosodeCol: 0x3a3a40, armor: 0x5a5244, lace: 0x4a4038, hat: 'none', haori: 0, menpo: 0, horo: 0, sode: false, trim: 0, real: 0, flag: null, pole: false }; });
    // 寺の外の通りを行き交う伝令の騎馬は出さない（明け方の京の路地は明智勢が塞いでいる。境内に馬はいない）
    rt.after(0, () => { for (const c of rt.couriers || []) rt.scene.remove(c.m); if (rt.couriers) rt.couriers.length = 0; });
    // 同時の打ち込みは共通の二人まで。寄せ手は複数で迫り、味方だけに任せて無傷では済まない。
    // 敵の総大将（光秀）の仕組みは使わない：寺の中に閉じ込められた戦で、味方の組が本陣へ斬り込んで勝ちになってしまう
    rt.after(0.05, () => { rt.taisho = null; });
    if (F.ehon?.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    applyLook(rt, HONNO_DAWN);
    W.timeKey = 'morning'; // 明け方の薄明を保ち、共通の夕暮れ・夜の遠景制限に入れない。
    // 市内へ広がる遠景：町のあちこちで鐘が鳴り、叫びが起き、火の手が上がる（本能寺の騒ぎが町へ伝わる）
    [[34, -60, -90], [48, 100, 10], [62, -30, 130], [80, 130, -70]].forEach(([t, x, z], i) => rt.after(t, () => {
      if (rt.flags.ending) return;
      sfx('kane', 0.28); rt.army.play('eshout', { x, z }, 0.8);

      if (i === 0) rt.bark('遠くの町で鐘が鳴り、人の叫びが広がる');
    }));
    rt.setPhase('brief');
    this.p1(rt);
  },

  // P1 寝込みを襲われる：明け方の御殿の廊下。物音、鬨の声、鉄砲。「是非に及ばず」（信長公記）
  p1(rt) {
    const F = rt.flags;
    F.hp = 1; F.pT = rt.t;
    rt.obj('main', '矢印へ進め', 'main', true);
    F.waitReached = false;
    const wait = F.waitPlace = { x: PT.start.x + 7.5, z: PT.start.z, y: groundAt(rt.world, PT.start.x + 7.5, PT.start.z, rt.player.u.pos.y) };
    const ring = F.waitRing = rt.ring(wait.x, wait.z, 1.1, 0xfff3ba, .65, 48, false);
    ring.position.y = wait.y + .09;
    ring.material.depthTest = true; // 床に沿わせ、人の体の向こうには描かない。
    rt.marker('next', wait, () => F.waitReached ? 'ここで待て' : '矢印へ進め', { guideArea: 'wait', h: .1, guideRadius: 1.1, waitArrived: () => F.waitReached, waitGuide: () => F.waitReached ? `待っている・あと${Math.max(1, Math.ceil(14 - (rt.t - F.pT)))}秒` : '' });
    const at = (s, f) => rt.after(s, () => { if (F.hp === 1 && !F.ending && !rt.over) f(); });
    // 供は百ほど。寺の外には一万三千の明智勢。まだ誰も知らない
    at(1.2, () => { rt.army.play('wood', { x: GATES.main.x, z: GATES.main.z }, 0.7); rt.bark('表の方で、物音がした'); });
    at(3.6, () => honnoSay(rt, '小姓', 'あやしい音がする', 2.2));
    at(4.4, () => {
      rt.army.play('eshout', { x: -20, z: 50 }, 1.7); F.honnoShoutT = rt.t;
      rt.after(0.5, () => { if (F.hp === 1 && !F.ending && !rt.over) rt.army.play('volley', { x: -22, z: 50 }, 0.9); });
      rt.bark('敵の声だ！　表から鉄砲だ！', true);
      rt.obj('main', '表から鉄砲じゃ。上様の下知を聞け', 'main', true);
      rt.objProgress('main', '供のそばで構えよ。下知が出たら表門へ走れ');
    });
    at(6.2, () => nbSay(rt, '誰の兵だ？', 2));
    at(8.5, () => honnoSay(rt, '森蘭丸', '明智の兵です！', 2.5));
    at(11.3, () => nbSay(rt, '是非に及ばず', 2.5));
    at(14, () => this.p2(rt));

    F.patrolGuide = { x: PT.gateIn.x, z: PT.gateIn.z };
    F.patrolProbe = { x: 0, y: 0, z: 0 };
    F.patrolDistance = 0; F.patrolScan = 0;
    patrolGuide(rt);
    rt.player.yaw = rt.player.u.heading = Math.PI / 2;
    // 待つ輪と上様の位置を用意し、今の行き先は共通の仕組みで一つだけ出す。
    rt.marker('nb', unitPos(F.nb), '信長', { h: 2.3, person: true, guidePerson: () => F.nb, guideName: '信長' });
    // 門へ着けば異変が起きる。見回りが遅れても襲撃を一分以上待たせない。
  },
  // P2 異変：鬨の声と鉄砲。信長が起き出す
  p2(rt) {
    const F = rt.flags;
    if (F.hp >= 2) return;
    F.hp = 2; F.pT = rt.t;
    const gate = GATES.main, y = groundAt(rt.world, gate.x, gate.z, rt.player.u.pos.y);
    F.entrancePos = { x: gate.x, y, z: gate.z };
    F.entranceFrame = [
      { x: gate.x, y: y + .12, z: gate.z - gate.w / 2 }, { x: gate.x, y: y + 3, z: gate.z - gate.w / 2 },
      { x: gate.x, y: y + 3, z: gate.z + gate.w / 2 }, { x: gate.x, y: y + .12, z: gate.z + gate.w / 2 }
    ];
    F.defenseFrame = [[-3, -3], [3, -3], [3, 3], [-3, 3]].map(([dx, dz]) => {
      const x = PT.gateIn.x + dx, z = PT.gateIn.z + dz;
      return { x, z, y: groundAt(rt.world, x, z, y) + .12 };
    });
    if (F.waitRing) {
      rt.scene.remove(F.waitRing); F.waitRing.geometry.dispose(); F.waitRing.material.dispose(); F.waitRing = null;
    }
    rt.objRemove('lostcause'); // 心得は見回り中に読む。襲撃後は門と退き道の下知を優先する。
    F.akSayT = rt.t; // 最初の下知を寄せ手の叫びで隠さない。
    rt.setPhase('alarm');
    rt.unmark('next');
    rt.army.play('eshout', { x: -18, z: 50 }, 1.6);
    F.honnoShoutT = rt.t;
    rt.after(0.4, () => rt.army.play('gun', { x: -20, z: 50 }, 0.8));
    rt.after(1.2, () => { sfx('bellRapid', 0.5); });
    rt.bark('表門で門番の叫び。「桔梗の旗じゃ！　明智の兵が門の前に！」', true);
    // 門の外に桔梗の旗の列と松明（B115）
    for (const dz of [-12, -7, -3, 3, 7, 12]) rt.scene.add(nobori(rt.world, -23.5 + Math.abs(dz) * 0.15, 50 + dz, 'akechi', 5.5));
    // 門の正面は兵が二列で通る。篝の脚を口の真ん中へ置かない。
    for (const dz of [-9, -4.5, 9]) honnoTorch(rt, -26, 50 + dz);
    rt.banner('明智光秀、謀反', '供は百ほど。寺を囲む明智勢は一万三千');
    rt.obj('main', '門へ走れ', 'main', true);
    rt.objProgress('main', '上様も弓を取って表へ出られる。先に立って門を閉め、明智勢を入れるな');
    rt.addInteract('gate', { x: GATES.main.x - 1.5, z: GATES.main.z }, '門をしめる', () => closeGate(rt, 'me'), { r: 4.5, hold: 1, prio: 1 });
    patrolGuide(rt); F.patrolScan = 0;
    rt.marker('next', () => F.patrolDistance < 12 && patrolClear(rt, F.entrancePos.x, F.entrancePos.z) ? F.entrancePos : F.patrolGuide, () => patrolLabel(rt), { h: .2, entrance: true, guideDestination: () => F.entrancePos, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.patrolDistance });
    F.scouts = akechi(rt, '回廊へ踏み込む明智の先鋒', PATROL_ADVANCE, [uS(1), uA(3)], { entered: true, player: true });
    if (F.scouts) {
      F.scouts.honnoPatrolAdvance = true;
      F.scouts.honnoFollowPath = true;
      F.scouts.roadColumn = true;
    }
    akechi(rt, '表門へ続く明智勢', PATROL_SKIRMISH, [uS(3), uA(5)]);
    F.patrolQuiet = 0;
    // 民と僧は、近づく兵や火を民の仕組みで調べて逃げる。
    // 信長が起き出し、回廊を抜けて表へ（B 警戒 → D 移る）
    nbSet(rt, 'B', { at: PT.nbRoom });
    F.kosho.order = 'hold';
    rt.after(3, () => { if (F.hp === 2) nbSet(rt, 'D', { pts: NB_GATE_PATH, then: 'C' }); });
    rt.after(2.4, () => honnoSay(rt, '森蘭丸', `${nm(rt)}、表門じゃ！　門を閉めねば、なだれ込まれる！`, 3.5));
    // 明智の先手が門へ寄る（開いたままなら、なだれ込む）
    rt.after(6, () => { F.van = akechi(rt, '明智の先手', IN.main, [uS(2), uA(5)], { nb: false }); });
    rt.after(18, () => {
      if (F.hp !== 2 || F.ending || rt.over) return;
      if (!F.gMain && Math.hypot(rt.player.u.pos.x - PT.gateIn.x, rt.player.u.pos.z - PT.gateIn.z) < 10) closeGate(rt, 'other');
      F.gateTryAt = rt.t + 2;
    });
  },
  // P3 門前防衛：門を閉め、押し返し、狭い門の口で斬り合う。鉄砲と弓が撃ち込まれる。少数で大軍を防ぐ
  p3(rt) {
    const F = rt.flags;
    if (F.hp >= 3) return;
    F.hp = 3; F.pT = rt.t;
    rt.setPhase('gate');
    rt.uninteract('gate'); // 閉め損ねた門は寄せ手が押さえる。効かない閉門操作を残さない。
      samuraiStand(rt, 1, [[-34, 50], [-40, 50]]);
    rt.unmark('next');
    patrolGuide(rt); F.patrolScan = 0;
    rt.marker('next', () => F.gateApproach?.alive ? F.gateApproach.pos : F.patrolDistance > 10 ? F.patrolGuide : null, '門の内へ戻る道',
      { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.patrolDistance });
    nbSay(rt, '弓を持て！　門の口で迎え撃つ', 3.5);
    rt.obj('main', F.gMain?.alive ? '門の内で、上様をお守りせよ' : '門を奪われた。内へ下がり、上様をお守りせよ', 'main', true);
    // 寄せ手の突撃は門外から。寺の守り手への号令と取り違えない。
    rt.army.playFar('sig_kakari', HONNO_GATE, 0.8);
    rt.objProgress('main', '門外の法螺貝と陣太鼓の早打ち＝明智勢の突撃。門の口を守れ');
    rt.zone('gz', PT.gateIn.x, PT.gateIn.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: PT.gateIn.x + 1, z: PT.gateIn.z }; F.uma.aggro = 9;
    const at = (s, f) => rt.after(s, () => { if (F.hp === 3 && !F.ending) f(); });
    const wave = (name, list, o = {}) => akechi(rt, name, IN.main, list, { gate: F.gMain, ...o });
    // 門の外：明智の人垣が通りを埋めて押し寄せる。鬨の声と鉄砲、松明の火が、門の隙・屋根越しに見える
    const W3 = rt.world;
    F.gateMob = W3.addDistantArmy({ x: -14, z: 50, w: 9, d: 26, count: 80, facing: -Math.PI / 2, team: 1, armor: 0x34302a, flagTex: flagTexture('akechi'), mon: 'akechi', kind: 'mixed', seed: 15899 });
    F.gateMob.army.noWake = true;
    at(6, () => courtClashGround(rt));
    for (const z of [43, 57]) honnoTorch(rt, -25.5, z);
    for (const z of [42, 46.5, 51, 55.5, 60]) rt.scene.add(nobori(W3, -27.5 - (z % 3), z, 'akechi', 6.5));   // 築地の上に桔梗の幟が並んで見える
    rt.bark('門の外に明智の旗が押し寄せる！　鬨の声じゃ', true);
    const roar = (n) => rt.after(3.2 + (n % 3) * 1.1, () => {
      if (F.hp !== 3 || F.ending || rt.over) return;
      rt.army.play('eshout', { x: -27, z: 46 + (n * 5) % 9 }, 1.1);
      if (n % 2) rt.army.play('gun', { x: -26, z: 44 + (n * 3) % 12 }, 0.9);
      roar(n + 1);
    });
    roar(0);
    // 自分で閉めた門は先手を八秒止める。門の内で構える間を作る。
    at(F.gateClosedByMe ? 9 : 1, () => wave('明智の一の手', [uS(3), uA(11)]));
    at(6, () => { F.guns = akechi(rt, '築地の外の鉄砲', [[-23, 42], [-23, 42]], [uG(4), uB(2)], { hold: true, aggro: 40 }); honnoSay(rt, '馬廻', '敵の陣太鼓に続いて鉄砲じゃ！　頭を下げよ！', 3); });
    // 塀の外から門と屋根へ火矢。三本目で火が付き、門は燃えて倒れる
    at(9, () => {
      const g = akechi(rt, '火矢を射込む弓', [[-23, 57], [-23, 57]], [uB(4)], { hold: true, aggro: 40 });
      if (g) g.fireArrows = true;
      gateBlaze(rt);
      rt.bark('火矢じゃ！　門に火矢が射込まれる！', true);
    });
    // 門だけでなく、表の築地を乗り越えて次々と入って来る
    at(12, () => climbIn(rt, [[-34, 44], [-34, 40]], [uS(1), uA(2)], '築地を越えて来たぞ！　門の内へ入られた！'));
    at(16, () => fireStage(rt, 1));
    at(28, () => climbIn(rt, [[-34, 58], [-34, 62]], [uS(1), uA(2)], '南の塀からも越えて来る！　上様のお側を固めよ！'));
    at(40, () => {
      // 信長公記：弓を取って戦ったが、弦が切れて槍に替えた
      if (F.nb.alive && F.nb.wpnKind === 'bow') { nbWeapon(rt, 'spear'); nbSay(rt, '弦が切れた。槍を持て！', 2.8); }
    });
    at(50, () => climbIn(rt, [[-34, 40], [-34, 44]], [uS(2), uA(2)], '塀の上に桔梗の旗！　まだ来るぞ！'));
    at(22, () => wave('明智の二の手', [uS(3), uA(12)]));
    // 外塀を乗り越えて来る（北の築地の裏手）。塀の一間が崩れる
    at(32, () => {
      const s = F.T.walls.filter((w) => w.alive && Math.hypot((w.seg[0] + w.seg[2]) / 2 - CLIMB.x, (w.seg[1] + w.seg[3]) / 2 - CLIMB.z) < 4.5);
      const wall = s[0];
      if (wall) { wall.hp = wall.maxHp = 350; wall.noTarget = false; }
      akechi(rt, '北の塀へ寄せる明智勢', [...IN.climb, [-58, 37], [-46, 41]], [uS(2), uA(4)], { gate: wall });
      honnoSay(rt, '小姓', '北の塀にも寄せて来たぞ！　裏手からじゃ！', 3);
      nbSay(rt, '裏へ回るな！　ここを守れ。……門が破られれば、どこも同じじゃ', 3.5);
    });
    at(44, () => wave('明智の三の手', [uS(3), uA(12)]));
    at(58, () => { wave('明智の大手', [uS(4), uA(14)]); honnoSay(rt, '門番', '門がきしむ！　内側で支えよ！', 3); });
    // 門を守り切っても延焼で持ち場を移す。敵の全滅待ちで止めない。
    at(72, () => {
      this.gateDown(rt, true);
    });
  },
  gateDown(rt, burned = false) {
    const F = rt.flags;
    if (F.gDown) return;
    F.gDown = true;
    const g = F.gMain;
    if (g && g.alive) { g.hp = 0; g.alive = false; rt.army.structFall(g); }
    if (F.gateMob) { F.gateMob.visible = false; F.gateMob = null; }   // 門の外の人垣は、実の兵になって入る
    rt.army.play('eshout', { x: -30, z: 50 }, 1.4);
    rt.unzone('gz'); rt.uninteract('gate');
    rt.banner(burned ? '火と寄せ手で表門が崩れる' : '表門、破らる', '明智勢が境内へなだれ込む');
    if ((F.gateHold || 0) >= 8) rt.award((t) => t.side.push('上様と共に表門を守った'), '表門を守った');
    this.p4(rt);
  },
  // P4 本堂へ退く：表庭は開けて危ない。本堂の縁と堂の中で迎える（室内と室外の往復）
  p4(rt) {
    const F = rt.flags;
    if (F.hp >= 4) return;
    F.hp = 4; F.pT = rt.t;
    rt.setPhase('hondo');
    // 門が破れた直後、馬廻が門の内で踏みとどまり、目の前の寄せ手を押し返す。その数秒で本堂へ退き、布を巻く。
    pushBack(rt, 8, '馬廻', '門の口はわしらが支える！　本堂へ退け！');
    bindWindow(rt, 4, 2, 8, '中間');
    nbSay(rt, '退き太鼓じゃ！　本堂へ退け。堂の口で迎え撃つ', 3);
    // 自動の合図を止めた戦なので、守り手の退却だけここで鳴らす。
    rt.army.playFar('sig_nobiki', PT.gateIn, 0.7);
    rt.obj('main', '信長のもとへ', 'main', true);
    rt.objProgress('main', '');
    const floor = F.T.G.byId.hondo.y0;
    F.hondoFrame = [
      { x: -46.9, y: floor + .12, z: 44.8 }, { x: -46.9, y: floor + 2.7, z: 44.8 },
      { x: -46.9, y: floor + 2.7, z: 47.2 }, { x: -46.9, y: floor + .12, z: 47.2 }
    ];
    F.hondoGuide = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
    F.hondoDistance = 0; F.hondoScan = 0;
    hondoGuide(rt);
    rt.marker('next', F.hondoGuide, '信長のもとへ', { h: .2, guideGoal: () => HONDO_IN, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.hondoDistance });
    rt.bark('三分以内に、お堂で上様と合流しよう', true);
    const approach = F.nbSt === 'D' && F.nb.pos.z > 60 ? F.nbG.path.slice(F.nbG.pathIdx) : [];
    nbSet(rt, 'D', { pts: [...approach, [-42, 47], [-45.5, 46], [-48.5, 46], [HONDO_IN.x, HONDO_IN.z]], then: 'E' });
    F.uma.order = 'hold'; F.uma.anchor = { x: HONDO_FRONT.x + 0.5, z: HONDO_FRONT.z }; F.uma.aggro = 7;
    rt.zone('hz', HONDO_FRONT.x - 2, HONDO_FRONT.z, 6);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 4 && !F.ending) f(); });
    at(7, () => akechi(rt, 'なだれ込む明智勢', IN.main, [uS(3), uA(10)]));
    at(8, () => fireStage(rt, 2));
    // 宿坊の方（勝手口）からも回り込む：止めなければ回廊を伝って本堂の横へ
    at(12, () => {
      F.flank = akechi(rt, '宿坊から回る明智勢', [...IN.katte, [-44, 90], [-44, 76], [-44, 60], [-46, 52]], [uS(1), uA(5)], { gate: F.gKatte });
      honnoSay(rt, '小姓', '宿坊から回り込むぞ！　本堂へ退け！', 3);
      if (F.flank) {
        rt.marker('flank', centerOf(F.flank), '回り込む明智勢', { red: true, group: F.flank });
      }
    });
    at(16, () => climbIn(rt, [[-42, 60], [-44, 56]], [uS(1), uA(3)], '回廊の塀を越えて来た！　本堂の横じゃ！'));
    at(24, () => akechi(rt, '明智の新手', IN.main, [uS(3), uA(9)]));
    at(34, () => climbIn(rt, [[-44, 56], [-42, 60]], [uS(2), uA(2)], 'また塀を越えて来る！　きりがない！'));
  },
  // P5 信長と共闘：本堂の外陣で、信長が横で斬る。北の口と脇門からも来る
  p5(rt) {
    const F = rt.flags;
    if (F.hp >= 5) return;
    F.hp = 5; F.pT = rt.t;
    rt.setPhase('kyoto');
    samuraiStand(rt, 2, [[-46, 46], [-50, 46]]);
    rt.unmark('next'); rt.unzone('hz');
    hondoGuide(rt); F.hondoScan = 0;
    rt.marker('next', () => F.hondoDirect && F.hondoDistance < 6 ? null : F.hondoGuide, '信長のもとへ',
      { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.hondoDistance });
    nbSay(rt, 'まだ退くな！　ここで一息に押し返す。……者ども、続け', 3.5);
    rt.obj('main', '信長を守れ', 'main', true);
    // 戦が長いので、本堂の僧が手当ての布を一枚渡す（三枚まで）。堂の奥は味方の陰で巻ける。
    if (rt.player.treatmentLeft < 3) {
      rt.player.treatmentLeft++;
      rt.after(4, () => { if (F.hp === 5 && !F.ending) rt.bark('堂の僧が布を一枚くれた。傷は上様の後ろ、味方の陰で縛れ', true); });
    }
    bindWindow(rt, 5, 1, 6, '堂の僧');
    nbWeapon(rt, 'spear');
    nbSet(rt, 'E', { at: { x: -50.5, z: 46 } });
    F.uma.anchor = { x: -48.5, z: 46 };
    fireStage(rt, 3);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 5 && !F.ending) f(); });
    at(3, () => { akechi(rt, '裏手から来る明智勢', [...IN.climb, [-58, 37], [-52, 38], [-52, 41.5]], [uS(2), uA(4)], { nb: true }); honnoSay(rt, '森蘭丸', '北の口から！　上様のお背中じゃ！', 3); });
    at(14, () => { akechi(rt, '脇門の明智勢', [...IN.side, [-50, 38], [-52, 41.5]], [uS(2), uA(5)], { gate: F.gSide }); honnoSay(rt, '小姓', '北の脇門を打っておる！', 2.5); });
    at(26, () => akechi(rt, '上様を狙う明智の侍', [...IN.main, [-42, 46], [-46, 46]], [uS(3), uA(3)], { nb: true }));
    at(38, () => { if (F.nb.hp < F.nb.maxHp) honnoSay(rt, '小姓', '上様が手負いじゃ。奥への道を空けよ！', 3); rt.after(2.6, () => nbSay(rt, '蘭丸、奥の間へ退くぞ。女どもは急ぎ出よ', 3.5)); });
  },
  // P6 別棟へ移る：本堂に火。燃えていない道を選び、信長を御殿へ
  p6(rt) {
    const F = rt.flags;
    if (F.hp >= 6) return;
    F.hp = 6; F.pT = rt.t;
    rt.setPhase('move');
    fireStage(rt, 4);
    pushBack(rt, 9, '馬廻', '堂の口はわしらが押し返す！　上様をお連れせよ！');
    // 馬廻が堂の口で食い止める十四秒：本堂に詰めた寄せ手はその場の馬廻と斬り合い、すぐには追って来ない（兵は減らさない）。
    holdFoes(rt, HONDO_FRONT, 16, 14);
    nbSay(rt, '火が回る、奥へ！　あちらの棟（御殿）へ移るぞ', 3.5);
    const burning = (id) => { const r = F.T.G.byId[id]; return r && r.state >= 1; };
    const ok = Object.entries(MOVES).filter(([, m]) => !m.burn.some(burning) && !routeBurning(F.T, m.pts)).map(([k]) => k);
    // 棟の中の道が全て燃えていても、築地沿いの裏手（建物の外）は残る。遠回りでも退く。
    if (!ok.length) ok.push('urate');
    const keys = ok.slice(0, 3);
    F.mvKeys = keys;
    // 足軽が主君の進路を決めず、上役の下知に従う。火の回らぬ渡り廊下が近い。
    // 裏手は築地の狭い口を抜ける遠回りで、列が詰まる間に煙の中の寄せ手に囲まれる。渡りが燃えている時だけ裏手へ。
    const route = keys.includes('watari') ? 'watari' : keys.includes('urate') ? 'urate' : keys[0];
    this.p6go(rt, route);
  },
  p6go(rt, key) {
    const F = rt.flags;
    if (F.mv) return;
    const M = MOVES[key];
    F.mv = key; F.pT = rt.t;
    // 守りを離れた後も包囲用の全隊で一人を追わず、殿の供と斬り結ばせる。
    // 近くの兵の攻撃と、道の途中へ入る台本の追手は残す。
    for (const g of F.foes) {
      if (!g.surround || g.focus !== rt.player.u || gone(g)) continue;
      const c = g.center();
      let cover = null, nearest = 18;
      for (const ag of [F.kosho, F.uma, ...(F.posts || [])]) if (ag) for (const u of ag.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
        if (d < nearest && !rt.army.wallBetween(c, -1, u.pos)) { cover = u; nearest = d; }
      }
      if (cover) g.focus = cover;
    }
    honnoSay(rt, '森蘭丸', `${M.name.replace(/を.*$/, '')}じゃ！　${nm(rt)}、先に立って道を開け！`, 3);
    rt.obj('main', '上様と奥へ退く', 'main', true);
    rt.objProgress('main', key === 'urate' ? '本堂の南の口を出て、西の裏手へ。火の中で止まるな' : '本堂を出て、道の印へ。火の中で止まるな');
    F.mvGuide = { x: M.pts[0][0], z: M.pts[0][1] };
    F.mvReturnPts = new Array(M.pts.length + 1); F.mvReturnPoint = [0, 0];
    F.moveDistance = pathGuide(rt, M.pts, M.pts.length - 1, F.mvGuide);
    rt.marker('next', F.mvGuide, '上様と退く道', { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.moveDistance });
    nbSet(rt, 'D', { pts: M.pts, then: 'E', done: () => this.p7(rt) });
    // 道の途中へ、煙の中から明智勢（築地の外の近い口から入る）
    const mid = M.pts[Math.floor(M.pts.length * 0.55)];
    const from = key === 'urate' ? IN.climb : key === 'watari' ? IN.ura : key === 'shukubo' ? IN.katte : IN.side;
    bindWindow(rt, 6, 1, 7, '小姓');
    // 馬廻が堂の口を支える数秒で、先に渡りへ入る。煙の中の寄せ手は道の半ばで待ち受ける。
    rt.after(7, () => { if (F.hp === 6) { const g = akechi(rt, '煙の中から来る明智勢', [...from, mid], [uS(2), uA(4)]); if (g) rt.marker('amb', centerOf(g), '道を塞ぐ明智勢', { red: true, group: g }); honnoSay(rt, '小姓', '煙の中から来るぞ！', 2.5); } });
    rt.after(18, () => { if (F.hp === 6) { fireStage(rt, 5); akechi(rt, '追ってくる明智勢', [...IN.main, [-42, 47], [-47, 47]], [uS(3), uA(8)], { nb: true }); } });
    if (key === 'niwa') rt.after(6, () => { if (F.hp === 6) { akechi(rt, '中庭を撃つ鉄砲', [[-44, 110], [-46, 103.5], [-44, 96]], [uG(4)], { hold: true, aggro: 40 }); rt.bark('勝手口の方から鉄砲！　中庭は早く抜けよ', true); } });
  },
  // P7 最終防衛：御殿の中。襖が破れ、別の部屋から回り込まれる。広間に火が入って、守る所が狭まる
  p7(rt) {
    const F = rt.flags;
    if (F.hp >= 7) return;
    F.hp = 7; F.pT = rt.t;
    rt.setPhase('goten');
    pushBack(rt, 8, '小姓', '追手を押し返した！　襖を立てよ！');
    holdFoes(rt, rt.player.u.pos, 18, 8);
    // 御殿の小姓が、残りの布を一枚分ける（三枚まで）。
    if (rt.player.treatmentLeft < 3) { rt.player.treatmentLeft++; rt.after(3, () => { if (F.hp === 7 && !F.ending) rt.bark('小姓が布を一枚くれた', true); }); }
    samuraiStand(rt, 3, [[-62, 82.2], [-62, 86]]);
    rt.unmark('next'); rt.unmark('amb');
    rt.award((t) => t.side.push('上様を御殿へお移しした'), '上様を御殿へ移した');
    nbSet(rt, 'E', { at: { ...PT.hikae } });
    F.guardGuide = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
    F.guardNodes = GUARD_POINTS.map(([x, z]) => ({ x, z, y: 0 }));
    F.guardDist = new Float64Array(GUARD_POINTS.length); F.guardUsed = new Uint8Array(GUARD_POINTS.length);
    F.guardOpen = new Uint8Array(GUARD_EDGES.length); F.guardDistance = 0;
    guardGuide(rt);
    rt.marker('next', () => F.guardDirect && F.guardDistance < 6 ? null : F.guardGuide, '上様へ戻る道',
      { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.guardDistance });
    nbSay(rt, '……ここが最後の間じゃ。一人も通すな', 3);
    rt.obj('main', '信長を守れ', 'main', true);
    rt.zone('gt', PT.hikae.x + 3, PT.hikae.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: -55, z: 86 };
    const at = (s, f) => rt.after(s, () => { if (F.hp === 7 && !F.ending) f(); });
    // 廊下の北の口（障子の向こう）から、目の前へ明智の兵が踏み込んで斬りかかる
    // 御殿へ入った直後は、小姓衆が襖を立てる数秒だけ息を整えられる（布を巻くならこの間）。
    at(1.5, () => { if (!F.bound?.[7]) honnoSay(rt, '小姓', '襖を立てた！　今のうちに息を整えよ。すぐ来るぞ', 3); });
    bindWindow(rt, 7, 1, 6, '小姓');
    at(6, () => { akechi(rt, '廊下へ踏み込む明智勢', [[-52, 81.8], [-58, 82.2]], [uA(2)], { entered: true, player: true, dmg: 1.2 }); rt.bark('廊下に敵が踏み込んだ！', true); });
    at(7.5, () => akechi(rt, '廊下へ続く明智の侍', [[-52, 81.8], [-58, 82.2]], [uS(1)], { entered: true, player: true, dmg: 1.2 }));
    at(8, () => { akechi(rt, '廊下から来る明智勢', GOTEN_IN.north, [uS(2), uA(2)]); honnoSay(rt, '小姓', '北の廊下から来る！', 2.5); });
    at(15, () => { akechi(rt, '東の口の明智勢', GOTEN_IN.east, [uS(1), uA(3)], { nb: true }); honnoSay(rt, '森蘭丸', '襖を破って来るぞ！　広間じゃ！', 2.5); });
    at(26, () => { akechi(rt, '縁側から来る明智勢', GOTEN_IN.south, [uS(2), uA(2), uB(1)]); honnoSay(rt, '小姓', '縁側の障子が破られた！', 2.5); });
    at(36, () => { fireStage(rt, 6); nbSet(rt, 'E', { at: { ...PT.kyoshitsu } }); nbSay(rt, '火が回る、奥へ！　控えの間で防げ', 3); rt.zone('gt', PT.hikae.x, PT.hikae.z, 5); });
    at(46, () => { akechi(rt, '裏から入った明智勢', GOTEN_IN.west, [uS(2), uA(3)], { nb: true }); honnoSay(rt, '森蘭丸', '裏からも！　居室の口を固めよ！', 3); });
  },
  // P8 終局：本能寺は落ちる。信長は奥へ入り、火をかける。自分は信長の命で裏門から出る
  p8(rt) {
    const F = rt.flags;
    if (F.hp >= 8) return;
    F.hp = 8; F.pT = rt.t;
    rt.setPhase('end1');
    pushBack(rt, 8, '小姓', 'ここはわしらが防ぐ！　行け！');
    // 御殿の寄せ手は居室の口の小姓衆に掛かりきりになる。脇を抜けて落ちる足軽まで追わない。
    holdFoes(rt, rt.player.u.pos, 24, 20, 1.2);
    bindWindow(rt, 8, 1, 6, '小姓');
    rt.unmark('next');
    rt.unzone('gt');
    if ((F.lastHold || 0) >= 20) rt.award((t) => t.side.push('最後の間で上様をお守りした'), '最後の間を守り抜いた');
    nbSet(rt, 'A', { at: { ...PT.oku } });
    F.nbG.aggro = 1.2;
    nbSay(rt, 'もはやこれまでじゃ。女たちは外へ出よ', 4);
    rt.after(4.2, () => honnoSay(rt, '小姓', '西の口から裏門へ！　戸を開け、印を追え！', 3));
    rt.after(9.4, () => honnoSay(rt, '森蘭丸', '御殿に火を！　……上様のお首は、明智に渡しませぬ', 4));
    rt.after(11, () => { F.T.fire.ignite('goten', '信長の命の火'); blaze(rt, 'goten'); });
    F.kosho.order = 'hold'; F.kosho.anchor = { ...PT.kyoshitsu }; F.koshoStay = true;
    rt.obj('main', '御殿の西の口を出て、裏門から落ちのびよ', 'main', true);
    const p = rt.player.u.pos;
    F.escapePath = p.z < 83.4 && p.x < -58 ? 'h8n' : 'h8';
    const first = HONNO_ESCAPE_PATHS[F.escapePath][0];
    F.escapeGuide = { x: first[0], z: first[1] }; F.escapeDistance = 0;
    escapeGuide(rt);
    rt.marker('next', F.escapeGuide, '裏門へ退く道', { h: 2.5, guidePriority: 200,
      guideAlways: true, alwaysDistance: true, routeDistance: () => F.escapeDistance });
    battleEvent(rt, EVENT_RETREAT, PT.uraOut, F.uma, 0, true, '信長の命で、裏門から落ちのびる');
    F.uraG = akechi(rt, '裏門を見張る明智勢', [[PT.uraOut.x - 3, 78], [PT.uraOut.x - 3, 78]], [uS(1), uA(4)], { hold: true, aggro: 11, cap: 999 });
    // 生き残りの馬廻が先に裏門の見張りへ斬りかかり、口を開ける。
    if (F.uraG && F.uma && !gone(F.uma)) { F.uma.order = 'attack'; F.uma.focus = F.uraG.units.find((u) => u.alive) || null; F.uma.seekRange = 40; F.uma.aggro = 12; }
    if (F.uraG) rt.marker('uraG', centerOf(F.uraG), '裏門の外の見張り', { red: true, group: F.uraG });
  },
  fallen(rt) {
    const F = rt.flags;
    if (F.hp >= 9) return;
    F.hp = 9;
    rt.obj('main', '町へ退き、織田の者と合流せよ', 'main', true);
    rt.unmark('next'); rt.unmark('uraG'); rt.unmark('nb');
    rt.unzone('gz'); rt.unzone('hz'); rt.unzone('gt'); rt.unzone('ng'); rt.uninteract('gate');
    rt.award((t) => t.side.push('本能寺から落ちのびた'), '本能寺から落ちのびた');
    sfx('kane', 0.5);
    rt.banner('本能寺、炎上', '御殿からは、もう声が聞こえない');
    honnoSay(rt, '', '――信長は奥へ入り、火の中で自害したと伝わる', 4);
    rt.army.play('eshout', { x: -60, z: 70 }, 1.3);
    rt.after(1.5, () => rt.bark('振り返れば、御殿の屋根が炎に包まれている。寺の内の鬨の声が、勝ち鬨に変わった'));
    rt.after(5, () => this.toNijo(rt));
  },

  // 第二幕：二条御所（信忠）。場面を移して、御所の門を守り、北の口から落ちる
  toNijo(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) { rt.scene.visible = true; return; }
    if (F.step >= 3) return;
    if (!F.nTransition) {
      F.nTransition = true; rt.scene.visible = false;
      rt.banner('町を抜け、二条へ', '時が過ぎた。信忠の手は二条新御所へ移った');
      rt.after(0.5, () => this.toNijo(rt)); return;
    }
    F.step = 3; F.stepT = rt.t;
    for (const g of rt.squadGroups) g.hideFlags = false;
    rt.setPhase('nijo');
    F.bossName = '織田信忠';
    rt.world.setTime('morning');
    rt.world.distMul = F.dm0; F.smoke = 0;
    // 場面が切り替わる間だけ、前幕の実兵を整理する。討死の加算はしない。
    for (const b of Object.values(F.blazes || {})) b.stop();
    for (const g of [F.nbG, F.kosho, F.uma, ...(F.posts || []), ...F.foes]) if (g) for (const u of g.units) if (u.alive) rt.army.despawn(u);
    F.foes.length = 0;
    teleport(rt, NIJO_GATE.x + 5, NIJO_GATE.z + 2);
    rt.after(0.5, () => { rt.scene.visible = true; });
    rt.banner('二条御所', '妙覚寺の信忠は、二条の新御所に移って明智を待つ');
    // 門番のすぐ後ろに控える。御所の奥へ固まると、傷を負った本人が門前で孤立する。
    F.tada = allyGroup(rt, { fixed: true, name: '織田信忠の手', anchor: { x: NIJO_GATE.x + 10, z: NIJO_GATE.z - 6 }, facing: -Math.PI / 2, width: 5, aggro: 4, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14, horse: false } }, { type: 'samurai', n: 1, o: { name: '村井貞勝', hat: 'kabuto_w', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
    F.tada.defMult = 1;
    F.tadaU = F.tada.units[0];
    F.tadaU.maxHp = F.tadaU.hp = 75; F.tadaU.dmg = 13; F.tadaU.isOfficer = false; F.tadaU.isLord = false;
    rt.after(2, () => this.arrive(rt));
  },
  arrive(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; rt.objRemove('escort');
    rt.setPhase('defend');
    honnoSay(rt, '織田信忠', '……父上が。逃げ道はあるまい。御所で戦う。西の門を守れ', 5);
    rt.after(5.2, () => { if (F.step === 4 && !F.ending && !rt.over) honnoSay(rt, '村井貞勝', '誠仁親王様は外へお移りになった。西の門の内で味方と支えよ！', 4); });
    rt.obj('main', HI(rt) ? '二条の西の門の内へ。一手を率いて信忠様を守れ' : '二条の西の門の内へ。味方と支え、信忠様を守れ', 'main', true);
    F.tada.order = 'hold'; F.tada.aggro = 4;
    // 町を抜ける間に時が過ぎた。御所の者が布を一枚分け、寄せ手の来る前に傷を縛る（三枚まで）。
    if (rt.player.treatmentLeft < 3) rt.player.treatmentLeft++;
    for (let t = 1; t <= 4; t += 0.5) rt.after(t, () => { if (F.step === 4 && !F.nBound && !F.ending) F.nBound = koshoBind(rt, '御所の者'); });
    F.nGuard = allyGroup(rt, { fixed: true, fullStrength: true, name: '御所の門の守り', anchor: { x: NIJO_GATE.x + 4, z: NIJO.z }, facing: -Math.PI / 2, width: 6, formation: 'line', aggro: 8 }, dress([uS(2), uA(10)], ODA));
    F.ngun = allyGroup(rt, { fixed: true, name: '御所の鉄砲組', anchor: { x: NIJO_GATE.x + 9, z: NIJO_GATE.z + 10 }, facing: -Math.PI / 2, width: 5, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    // 近衛屋敷の正確な寸法・射座は不明。西隣の屋根に少人数の射座を復元する。
    const rx = NIJO_GATE.x - 12, rz = NIJO.z - 12, ry = rt.world.heightAt(rx, rz) + 4.4;
    hut(rt.world, rx, rz, 8, 10, 0, { h: 3 });
    addDeck({ x0: rx - 1, x1: rx + 1, z0: rz - 4, z1: rz + 4, y: ry, name: '隣の屋敷の屋根' });
    F.roof = enemyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, faction: 'akechi', name: '隣の屋根の鉄砲', anchor: { x: rx, z: rz }, facing: Math.PI / 2, formation: 'line', width: 4, spacing: 1.4, aggro: 40, order: 'hold' }, dress([uG(4)], AKECHI));
    for (const u of F.roof.units) u.pos.y = ry;
    F.roof.fire = false; rt.after(30, () => { if (!F.ending && !rt.over && F.step === 4) { F.roof.fire = true; rt.bark('西隣の近衛屋敷の屋根から鉄砲じゃ！　門の脇の塀へ寄れ', true); } });
    rt.marker('ng', { x: NIJO_GATE.x + 3, z: NIJO_GATE.z }, '味方と守る門の内側', { h: 2.5 });
    F.nHold = 0; rt.zone('ng', NIJO_GATE.x, NIJO_GATE.z, 18);
    F.nWaves = [4, 28, 54, 82, 108];
    F.nHost = rt.world.addDistantArmy({ x: 26, z: -57, w: 10, d: 40, count: 90, facing: Math.PI / 2, team: 1, mon: 'akechi', flag: 'akechi', kind: 'mixed' });
    F.nHost.army.noWake = true;
    F.nNorth = enemyGroup(rt, { fixed: true, name: '北の口の明智勢', faction: 'akechi', anchor: { x: NIJO_BACK.x, z: NIJO_BACK.z - 16 }, facing: 0, width: 6, order: 'hold', aggro: 9 }, dress([uS(2), uA(6)], AKECHI));
  },
  // 二条御所の北の口から落ちる
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('escape');
    for (const g of rt.squadGroups) g.order = 'follow';
    rt.unzone('ng'); rt.unmark('ng');
    const W = rt.world;
    W.addFire(NIJO.x + 4, NIJO.z - 4, { h: 2.4 }); W.addSmokeColumn(NIJO.x + 4, 9, NIJO.z - 4, { size: 3 });
    rt.banner('もはやこれまで', '御所に火がかけられた');
    honnoSay(rt, '御所の組頭', '門は持たぬ。残る者が口を支える。北へ退け！', 4);

    rt.obj('main', '御所の北の口から落ちのびよ', 'main', true);
    rt.marker('out', OUT, '落ちのびる先', { h: 2 });
    rt.marker('nExit', NIJO_BACK, '北の口', { h: 2 });
    rt.zone('out', OUT.x, OUT.z, 7);
    F.north = F.nNorth;
    rt.marker('north', centerOf(F.north), '北の口の明智勢', { red: true, group: F.north });
    F.tada.order = 'hold'; F.tada.aggro = 4;
    rt.after(4.2, () => { if (F.step === 5 && !F.ending && !rt.over) honnoSay(rt, '御所の侍', 'わしらはここに残る。行け、振り返るな！', 3.5); });
    // 落ちる者を追う明智の手（徒。この戦に馬は出さない）
    rt.after(16, () => {
      if (F.step !== 5 || F.ending) return;
      F.chase = F.foes.find((g) => !gone(g));
      if (F.chase) { F.chase.order = 'attack'; F.chase.seekRange = 60; rt.marker('chase', centerOf(F.chase), '追ってくる明智勢', { red: true, group: F.chase }); }
      honnoSay(rt, '明智の侍', '御所の裏から落ちる者がおるぞ！　逃がすな！', 3);
      rt.after(3, () => rt.bark('足を止めずに、印の方へ。追手とは斬り合わずともよい'));
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.ending = true;
    rt.setPhase('end'); rt.objRemove('escort');
    rt.unmark('out'); rt.unmark('nExit'); rt.unmark('north'); rt.unmark('chase'); rt.unzone('out');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '信長と共に本能寺で戦い、生き延びた', pts: 24 }; }, '任務達成・生き延びた');
    sfx('kane', 0.5);
    rt.banner('京の町へ退く', '御所の方から火と煙が上がる');
    honnoSay(rt, '', '――信長は本能寺で、信忠は二条御所で自害した。二人は帰らなかった', 5);
    rt.after(5.2, () => honnoSay(rt, '', '十一日後、秀吉が山崎で光秀を破る。生き延びたあなたの道は、ここから続く', 5));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10.5);
  },
  // 上様を守れなかった（深手で倒れられた）
  nbFail(rt, reason = '') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objRemove('escort');
    const why = reason || '護衛の持ち場を失った';
    rt.obj('main', why, 'main', true); rt.objFail('main');
    for (const id of ['next', 'nb', 'amb', 'flank', 'out', 'nExit', 'north', 'chase']) rt.unmark(id);
    for (const id of ['gz', 'hz', 'gt', 'ng', 'out']) rt.unzone(id);
    rt.uninteract('gate'); rt.objRemove('flank');
    rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.banner('守りを果たせず', reason || (F.step >= 3 ? '御所の守りが崩れた' : '上様を奥へお守りできなかった'));
    if (F.step < 3) {
      nbSet(rt, 'A', { at: PT.oku });
      if (F.nb) { F.nb.invuln = true; F.nb.target = null; }
      F.T.fire.ignite('goten', '信長の命の火'); blaze(rt, 'goten');
      rt.after(4, () => {
        if (F.nb?.alive) rt.army.despawn(F.nb);
        rt.banner('上様の最期', '上様は奥へ入り、火の中で自害したと伝わる');
        rt.say('', '上様の首は、明智には渡らなかった', 5);
      });
    }
    rt.finish({ scriptedEnd: true, failureReason: why }, 14);
  },

  update(rt, dt) {
    honnoGrounded(rt);
    // 火や倒れ込みで本人だけが倒れた場合も、護衛の下知を残して進み続けない。
    // やり直しの札と、信長の最期の待ち時間は既存の決着に任せる。
    if ((!rt.player.u.alive || rt.player.u.hp <= 0) && !rt.over && !rt.retryOpen &&
        (!rt.G.lord || !rt.flags.ending)) {
      if (rt.G.lord) this.lordDown(rt); else rt.playerDown();
      return;
    }
    honnoPressure(rt);
    honnoSurround(rt, dt);
    honnoClothes(rt, dt);
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    const F = rt.flags;
    if (!rt.player.u.alive) return;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.T) { F.T.fire.tick(dt); teraTick(rt, F.T, dt); }
    // 深手（五割を切る）の自分へ打ち込む明智の兵には、そばの小姓・馬廻・御所の者が向き直って斬り結ぶ（一人の敵に一人まで）。
    // 門の守りから二条まで。決着の後の退き（追手の残る間）も同じ。
    if (F.hp >= 3 && (!rt.over || rt.withdrawal)) allyCover(rt, rt.player.u);
    if (F.ending || rt.over) return;
    // 寺の熱で体力が尽きたコマは、護衛失敗や次の段より先に重傷の決着へ渡す。
    if (!rt.player.u.alive || rt.player.u.hp <= 0) {
      if (!rt.retryOpen) rt.playerDown();
      return;
    }
    for (const g of F.foes || []) if (g.gate && !g.gate.alive && !gone(g)) {
      g.order = 'path'; g.path = g.entryPath; g.pathIdx = 0; g.assault = null; g.focus = null; g.gate = null;
    }

    if (F.hp && F.hp < 9) { honnoTick(this, rt, dt); return; }
    const p = rt.player.u.pos;
    if (F.step === 4) {
      if (!F.tadaU.alive) { this.nbFail(rt, '信忠様が倒れ、御所の守りが崩れた'); return; }
      const post = F.nPost || (F.nPost = { x: NIJO_GATE.x + 3, y: rt.world.heightAt(NIJO_GATE.x + 3, NIJO_GATE.z), z: NIJO_GATE.z });
      let friend = 0, helper = false;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct) continue;
        if (Math.hypot(u.pos.x - NIJO_GATE.x - 3, u.pos.z - NIJO_GATE.z) > 18 ||
            Math.abs(u.pos.y - post.y) > 3 || rt.army.wallBetween(u.pos, -1, post)) continue;
        if (u.team === 0) {
          friend++;
          if (!u.isPlayer && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 4 &&
              !rt.army.wallBetween(u.pos, -1, p)) helper = true;
        }
      }
      // 門の内で味方と斬り合っている間も守備。敵が一人入っただけで時計を止めない。
      const atPost = p.x > NIJO_GATE.x && Math.hypot(p.x - NIJO_GATE.x, p.z - NIJO_GATE.z) < 18 &&
        Math.abs(p.y - post.y) < 3 && !rt.army.wallBetween(p, -1, post);
      if (atPost && friend >= 2) F.nHold += dt;
      // 守備の途中にも、そばの味方が傷を縛る。敵の届く間は巻けず、二度まで。
      // 半秒に一度だけ調べ、布が無い時も一枚ずつ分ける。
      if (atPost && helper && rt.player.u.hp < rt.player.u.maxHp * 0.4 &&
          (F.nAid || 0) < 2 && rt.t >= (F.nAidAt || 0) && rt.t >= (F.nBindAt || 0)) {
        F.nBindAt = rt.t + 0.5;
        if (rt.player.treatmentLeft <= 0 && (F.nAidGiven || 0) < 2) {
          rt.player.treatmentLeft = 1; F.nAidGiven = (F.nAidGiven || 0) + 1;
        }
        if (koshoBind(rt, '御所の門番')) { F.nAid = (F.nAid || 0) + 1; F.nAidAt = rt.t + 35; }
      }
      const t = rt.t - F.stepT;
      let live = 0, pressing = 0;
      for (const u of rt.army.units) if (u.alive) live++;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) pressing++;
      // 前の手が残る間は後続を門外で待たせる。五波と守備の期限は保ち、二十人が一度に本人を囲まない。
      while (F.nWaves.length && t >= F.nWaves[0] && live < 240 && pressing <= 12) {
        // 七人以上残っても後続を止め切らず、空いた人数だけ四人以上の小隊で送る。
        // 各波の残りを覚え、五波・計五十人と同時十六人の上限を保つ。
        const count = Math.min(F.nWaveLeft || 10, 16 - pressing, 240 - live);
        const pts = F.nHost.take(26, -54, count, 80);
        if (!pts.length) break;
        live += pts.length; pressing += pts.length;
        F.nWaveLeft = (F.nWaveLeft || 10) - pts.length;
        if (!F.nWaveLeft) F.nWaves.shift();
        const g = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'akechi', name: '御所へ寄せる明智勢', anchor: { x: 26, z: -54 }, facing: Math.PI / 2, formation: 'column', colW: 2, spacing: 1.4, width: 4, order: 'path', aggro: 9 }, dress([uS(Math.min(2, pts.length)), uA(Math.max(0, pts.length - 2))], AKECHI));
        // 控えの大軍は隣家の屋根と重なる。実兵は屋敷の南の道へ整列してから門へ寄せる。
        for (let i = 0; i < g.units.length; i++) {
          const u = g.units[i], x = 30 - Math.floor(i / 2) * 1.4, z = NIJO_GATE.z + (i % 2 ? .7 : -.7);
          u.pos.set(x, rt.world.heightAt(x, z), z);
        }
        g.path = [[NIJO_GATE.x - 3, NIJO_GATE.z], [NIJO_GATE.x + 4, NIJO_GATE.z]]; g.pathIdx = 0;
        g.onArrive = (q) => { q.order = 'attack'; q.formation = 'line'; q.seekRange = 22; };
        F.foes.push(g);
      }
      // 携帯では補足が省かれる。持ち場と必要な守備時間は任務そのものへ出す。
      const holdLeft = Math.max(0, Math.ceil(70 - F.nHold));
      const task = !atPost ? '西の門の内へ戻れ。味方と口を支えよ'
        : friend < 2 ? '門の内の味方へ寄れ。一緒に口を支えよ'
        : holdLeft > 0 ? `西の門の内で、あと${holdLeft}秒守れ`
        : `門を支えた。あと${Math.max(0, Math.ceil(125 - t))}秒防げ`;
      if (F.nTask !== task) { F.nTask = task; rt.obj('main', task, 'main', true); }
      rt.objProgress('main', F.nHold >= 70
        ? `門を支えた。あと${Math.max(0, Math.ceil(125 - t))}秒、寄せ手を防げ`
        : !atPost
        ? '御所の門へ戻り、味方と口を支えよ'
        : friend < 2 ? '門の内の味方へ寄れ。一人では守りを支えられぬ'
        : `門の内で味方と支えよ。守りの務めはあと${Math.max(0, Math.ceil(70 - F.nHold))}秒`);
      if (t > 125) { if (F.nHold >= 70) this.escape(rt); else { this.nbFail(rt, '門を支えた時間が足りず、御所の守りが崩れた'); return; } }

    }
    if (F.step === 5) {
      const d = Math.hypot(p.x - OUT.x, p.z - OUT.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d))}歩`);
      if (d >= 7 && rt.t - F.stepT > 40 && !F.outCall) { F.outCall = true; honnoSay(rt, '御所の侍', '北の口はこちらじゃ！　町へ、早う落ちよ！　火が回るぞ', 3.5); }
      if (d < 7 && rt.player.u.alive) this.win(rt);
      else if (rt.t - F.stepT > 90) this.nbFail(rt, '北の口へ退くのが遅れ、追手に退路を塞がれた');
    }
  },

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    honnoFall(rt, v);
    if (v.team === 1 && v.group?.honnoStand && v.type === 'samurai' && killer?.isPlayer) {
      const n = v.group.honnoStand;
      if (!F.standMerit?.[n]) {
        (F.standMerit ||= {})[n] = true;
        const label = ['表門の侍を斬り払った', '本堂の侍を斬り払った', '最後の間の侍を斬り払った'][n - 1];
        rt.award((t) => t.side.push(label), label);
        if (n === 2 || n === 3) honnoSay(rt, '小姓', n === 2
          ? '本堂の侍を斬った！　残る敵を払い、上様の退く間を作れ！'
          : '寄せ手の足が鈍った！　残る敵を払い、奥の支度を守れ！', 3);
      }
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    // 寺の中の味方が一人、また一人と倒れる。名のある者は名を、無名の者は供が減る様子を、声で伝える。
    // 名のある小姓の討死は囲みの知らせに任せ、同じ死を二度叫ばない。
    if (v.team === 0 && !v.isPlayer && F.hp >= 2 && F.hp <= 8 && !F.ending && v !== F.nb &&
        !(v.group === F.kosho && v.name) && rt.t - (F.lossSaidT ?? -99) >= 12) {
      F.lossSaidT = rt.t;
      (F.allyDead ||= new Set()).add(v);
      const where = v.group?.name?.endsWith('の守り') ? `${v.group.name.replace('の守り', '')}が破られる！　` : '';
      const lines = v.name && v.name !== '森蘭丸' && (v.group === F.kosho || (rt.squadGroups || []).includes(v.group))
        ? [`${v.name}、討死！`]
        : [`${where}また一人倒れた……供が減ってゆく`, `${where}味方が討たれた！　寺の内の供が、また一人減った`];
      rt.bark(lines[(F.lossN = (F.lossN || 0) + 1) % lines.length], true);
    }
  },

};

// 本能寺の段の毎コマ（P1〜P8）
function honnoTick(def, rt, dt) {
  const F = rt.flags, P = rt.player.u, p = P.pos, NB = F.nb, T = F.T;
  const t = rt.t - F.pT;
  const dNb = NB && NB.alive ? Math.hypot(p.x - NB.pos.x, p.z - NB.pos.z) : 0;
  for (const u of rt.army.units) if (u.honnoClimb) {
    const c = u.honnoClimb, t = Math.max(0, Math.min(1, (rt.t - c.start) / 1.2));
    if (!u.alive || t >= 1) { u.honnoClimb = null; continue; }
    if (u.mesh) u.mesh.position.set(c.x + (u.pos.x - c.x) * t, c.y + (u.pos.y - c.y) * t * t, c.z + (u.pos.z - c.z) * t);
  }
  if (P.hp < P.maxHp * 0.65 && rt.army.threats?.length && rt.t - (F.guardHelpT ?? -99) >= 12) {
    F.guardHelpT = rt.t;
    const hit = rt.player.lastHit;
    const sources = F.coverSources || (F.coverSources = []);
    sources.length = 0;
    for (const u of rt.army.units) if (u.alive && u.team !== P.team && !u.fleeing && !u.woundOut &&
        (!u.sidearm && (u.type === 'gun' || u.type === 'bow') || u.atk?.bow || u.atk?.ranged) &&
        Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 45) sources.push(u);
    const cover = coverGuide(rt, sources);
    F.coverHelpUntil = cover ? rt.t + 4 : 0;
    rt.bark(cover ? rt.coverGuide.label : hit?.guardBroken || hit?.exhausted
      ? '仲間の後ろで休もう'
      : hit?.back || hit?.side
      ? '敵の方を向こう'
      : '敵を向いて構えよう', true);
  }
  // 小姓衆は信長の後ろに付く（終局では居室の口に残る）
  if (!gone(F.kosho) && !F.koshoStay && NB.alive && F.hp >= 2) {
    F.kosho.order = 'hold';
    const h = F.nbG.facing || 0;
    F.kosho.anchor.x = NB.pos.x - Math.sin(h) * 1.8; F.kosho.anchor.z = NB.pos.z - Math.cos(h) * 1.8;
  }
  if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; honnoSay(rt, '小姓', '蘭丸様、討死……！', 3); }
  // 寄せ手の叫び：討つ相手を名指しせず、寺への攻め声にする
  if ((F.hp === 3 || F.hp === 5 || F.hp === 7) && (F.akSayN || 0) < 5 && rt.t - (F.akSayT ?? -99) >= 14) {
    F.akSayT = rt.t;
    const L = ['奥へ踏み込め！　押し込め！', '寺に火をかけよ！', '奥じゃ、奥へ踏み込め！', '一人も逃がすな！', '桔梗の旗に続け！　御殿はあちらじゃ！'];
    honnoSay(rt, '明智の侍', L[F.akSayN || 0], 2.4); F.akSayN = (F.akSayN || 0) + 1;
  }
  // 信長の傷は回復しない。深手（二割）まで負えば護衛失敗。
  if (NB.alive) {
    let near = 0;
    rt.army.forNear(NB.pos.x, NB.pos.z, 5, (o) => { if (o.alive && o.team === 1 && !o.fleeing) near++; });
    if (near >= 3 && rt.t - (F.nbPressT || -99) > 14 && (F.nbPressN || 0) < 3 && F.hp >= 3 && F.hp <= 7) { F.nbPressT = rt.t; const nbl = ['上様が囲まれた！　${nm}、お助けせよ！', '上様の周りに敵が寄っておる！　${nm}、斬り払え！', 'このままでは上様が……！　${nm}、早う！']; honnoSay(rt, '森蘭丸', nbl[(F.nbPressN = (F.nbPressN || 0) + 1) - 1].replace('${nm}', nm(rt)), 3); }   // 三回まで・言い換え（B114）
    if (NB.hp < NB.maxHp * 0.5 && !F.nbHurtSaid) { F.nbHurtSaid = true; rt.bark('上様が肘に槍傷を負われた！　そばの敵を払え', true); honnoSay(rt, '織田信長', '……蘭丸、奥へ退く。女どもは苦しからず。急ぎ出よ', 3); }
    // 深手の手前：もう一太刀で上様が討たれる
    if (NB.hp < NB.maxHp * 0.35 && !F.nbDireSaid && F.hp < 8) { F.nbDireSaid = true; honnoSay(rt, '森蘭丸', `上様の血が止まらぬ！　${nm(rt)}、上様の前に立て！`, 3); }
    if (NB.hp < NB.maxHp * 0.2 && F.hp < 8) { def.nbFail(rt, '上様が深手を負い、奥へ退けなかった'); return; }
  } else if (F.hp < 8) { def.nbFail(rt, '上様が倒れ、護衛を果たせなかった'); return; }
  // 堂の口・最後の間で踏みとどまる間、手負いの自分が囲まれかけたら、小姓衆・馬廻が斬り込んで押し返す（十二秒に一度）。
  // 門の内・本堂へ退く間・御殿へ移る間も同じ（狭い口で囲まれた背を、供の者が支える）。
  // 兵の数は減らさない。押し返した一息に、そばの者が布で傷を縛る。
  if (F.hp >= 3 && F.hp <= 7 && P.hp < P.maxHp * 0.6 && rt.t >= (F.rallyAt || 0)) {
    let close = 0;
    rt.army.forNear(p.x, p.z, 5, (o) => { if (o.alive && o.team !== P.team && !o.fleeing && !o.isStruct && !o.noTarget) close++; });
    if (close >= 3) {
      F.rallyAt = rt.t + 12;
      const n = (F.rallyN = (F.rallyN || 0) + 1);
      const moving = F.hp === 4 || F.hp === 6;
      pushBack(rt, 6, n % 2 ? '小姓' : '馬廻', n % 2 ? `${nm(rt)}を囲ませるな！　斬り込め！` : moving ? '押し返せ！　退く道を空けよ！' : '押し返せ！　上様の前を空けよ！');
      for (const t of [0.4, 0.9, 1.4]) rt.after(t, () => { if (F.hp >= 3 && F.hp <= 7 && !F.rallyBound?.[n]) { if (koshoBind(rt, '小姓', 2.5)) (F.rallyBound || (F.rallyBound = {}))[n] = true; } });
    }
  }
  // 移る間に上様が一秒半も進めなければ、行く手の襖・障子を蹴破る（閉じた襖の前で立ち往生しない）。
  if (NB.alive && F.nbSt === 'D' && F.nbG.speed > 0 && !NB.target) {
    if (Math.hypot(NB.vel.x, NB.vel.z) < 0.3) F.nbStuckT = (F.nbStuckT || 0) + dt; else F.nbStuckT = 0;
    if (F.nbStuckT > 1.5) {
      F.nbStuckT = 0;
      const q = F.nbG.path?.[Math.min(NB._honnoWayI ?? F.nbG.pathIdx, F.nbG.path.length - 1)];
      const h = q ? Math.atan2(q[0] - NB.pos.x, q[1] - NB.pos.z) : NB.heading || 0;
      breakNear(rt, T, NB.pos.x + Math.sin(h) * 1.1, NB.pos.z + Math.cos(h) * 1.1, 1.2, 2);
    }
  }
  // 上様は持ち場（堂の口・最後の間）から七歩より先へ敵を追わない。追って堂の外へ出ると、移る道へ戻れなくなる。
  if (NB.alive && F.nbG.order === 'hold' && F.nbG.anchor && (F.nbSt === 'C' || F.nbSt === 'E')) {
    // 最後の間（E）は狭い。四歩半より先や、火の入った広間へは追わない（後を追う供が火と群れに巻かれる）。
    const Z = F.heatZone, hotNb = !!(Z && NB.target?.pos && NB.target.pos.x > Z.x0 && NB.target.pos.x < Z.x1 && NB.target.pos.z > Z.z0 && NB.target.pos.z < Z.z1);
    const far = Math.hypot(NB.pos.x - F.nbG.anchor.x, NB.pos.z - F.nbG.anchor.z) > (F.nbSt === 'E' ? 4.5 : 7) || hotNb;
    F.nbG.aggro = far ? 1.5 : NBK[F.nbSt];
    // 最後の間から御殿の外（西の口の先）まで出た時は、目の前の敵とも斬り結ばず、持ち場へ戻る。
    const outGoten = F.nbSt === 'E' && (NB.pos.x < -73 || NB.pos.x > -49 || NB.pos.z < 80.2 || NB.pos.z > 95);
    if (far && NB.target && (outGoten || Math.hypot(NB.target.pos?.x - NB.pos.x, NB.target.pos?.z - NB.pos.z) > 2)) { NB.target = null; NB.atk = null; }
  }
  // 上様のそばを離れない
  if (F.hp >= 3 && F.hp <= 7 && F.hp !== 4 && dNb > 26) {
    F.farT = (F.farT || 0) + dt;
    if (F.farT > 8 && rt.t - (F.farSaidT || -99) > 20) { F.farSaidT = rt.t; honnoSay(rt, '森蘭丸', `${nm(rt)}！　上様のそばへ戻れ！　離れたままでは護衛を果たせぬ！`, 3); }
    if (F.farT > 60) { def.nbFail(rt, '上様から離れすぎ、護衛の持ち場を失った'); return; }
  } else F.farT = 0;
  // 戻る案内を一つにまとめる。入る距離と消す距離を分け、二秒は文を保つ。
  // 門の見回り・閉門と本堂への退却は、その段の行き先を優先する。
  const escorting = F.hp >= 3 && F.hp <= 7 && F.hp !== 4;
  const escortNeed = escorting && (dNb > 26 || (F.nbSt === 'D' && dNb > (F.escortShown ? 14 : 22)));
  F.escortShown = escortNeed;
  // 移る間：自分が遠すぎれば、信長は待つ（その先で一人で戦わない）
  if (F.nbSt === 'D') { const wait = dNb > 20 && F.hp >= 6 && (F.waitAcc || 0) < 10; if (wait) F.waitAcc = (F.waitAcc || 0) + dt; F.nbG.speed = wait ? 0 : 3.3; }
  // 襖・障子：自分の一振りで破れる。押し寄せた敵も破って入る
  if (P.strikeT > 0.12 && !F.brkHit) { F.brkHit = true; const h = P.heading || 0; breakNear(rt, T, p.x + Math.sin(h) * 1, p.z + Math.cos(h) * 1, 1.0, 1); }
  if (!(P.strikeT > 0.12)) F.brkHit = false;
  F.brkT = (F.brkT || 0) - dt;
  if (F.brkT <= 0) {
    F.brkT = 0.1;
    // 信長と近習も、実際の一振りで襖を破り、隣の間へ進める。
    for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.noTarget || u.fleeing || u.woundOut || !u.swing || u.swing.t > u.swing.dur ||
          u.type === 'gun' || u.type === 'bow' || (!hallAt(T, u.pos.x, u.pos.z) && !hallNear(T, u.pos.x, u.pos.z))) continue;
      if (u._honFusumaSwing === u.swing) continue;
      u._honFusumaSwing = u.swing;
      const h = u.heading || 0;
      if (breakNear(rt, T, u.pos.x + Math.sin(h), u.pos.z + Math.cos(h), 0.75, 1) && u.team === 1 && rt.t - (F.brkSaidT || -99) > 10) { F.brkSaidT = rt.t; rt.bark('襖が破れた！　隣の間から来るぞ', true); }
    }
  }
  // 火元から風下へ煙が流れる。燃えていない退路には無作為に煙を置かない。
  if (F.smoke) {
    F.smT = (F.smT || 0) - dt;
    if (F.smT <= 0) {
      F.smT = F.smoke > 1 ? 0.35 : 0.7;
      const burning = T.fire.burning();
      if (burning.length) {
        const r = burning[Math.floor(Math.random() * burning.length)];
        const wind = rt.world.def.wind, wx = wind?.[0] || 0, wz = wind?.[1] || 0;
        const length = Math.hypot(wx, wz) || 1, drift = F.smoke > 1 ? 4 + Math.random() * 10 : Math.random() * 4;
        const x = r.x + (Math.random() - 0.5) * r.w + wx / length * drift;
        const z = r.z + (Math.random() - 0.5) * r.d + wz / length * drift;
        rt.world.gunSmoke(x, z, 0x4a4642);
      }
    }
  }
  // 煙は上の火元と風下から出す。燃えていない退き口へ本人を追う煙を足さない。
  // 広間の火（第六段）：入れば熱い
  const Z = F.heatZone;
  if (Z && rt.t >= F.heatAt && p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1 && P.alive) {
    F.hzT = (F.hzT || 0) - dt;
    if (F.hzT <= 0) { F.hzT = 0.5; const damage = Math.min(P.hp, P.maxHp * 0.035); P.hp = Math.max(0, P.hp - damage); rt.stats.taken += damage; rt.stats.fireTaken = (rt.stats.fireTaken || 0) + damage; const hit = rt.player.lastHit || (rt.player.lastHit = {}); hit.kind = 'fire'; hit.type = 'fire'; hit.name = '広間の火'; hit.t = rt.t; hit.amount = damage; hit.ranged = false; hit.mounted = false; hit.back = false; hit.side = false; hit.guardBroken = false; hit.exhausted = false; hit.mobbed = false; hit.blocked = false; if (P.hp <= 0) rt.army.kill(P, null); if (rt.t - (F.heatSaidT || -99) > 8) { F.heatSaidT = rt.t; rt.bark('広間は火の中じゃ！　控えの間へ退け', true); } }
  }
  // 火で倒れた直後は、新しい下知や敵の波を始めない。
  if (!P.alive || rt.over || F.ending) return;
  // ---- 段の進み ----
  if (F.hp >= 1 && F.hp <= 3 && (F.patrolScan -= dt) <= 0) {
    F.patrolScan = 0.5; patrolGuide(rt);
  }
  if ((F.hp === 4 || F.hp === 5) && (F.hondoScan -= dt) <= 0) {
    F.hondoScan = 0.5; hondoGuide(rt);
  }
  if (F.hp === 1) {
    F.waitReached = Math.hypot(p.x - F.waitPlace.x, p.z - F.waitPlace.z) <= 1.1 && Math.abs(p.y - F.waitPlace.y) < .6;
    if (F.waitRing) {
      F.waitRing.material.color.setHex(F.waitReached ? 0xfff3ba : 0xc2a25a);
      // 中では輪を太くし、ゆっくり明暗をつける。動きを減らす時も太さで分かる。
      const vertices = F.waitRing.geometry.attributes.position;
      if (F.waitRing.userData.arrived !== F.waitReached) {
        F.waitRing.userData.arrived = F.waitReached;
        const inner = F.waitReached ? .82 : .98;
        for (let i = 0; i <= 48; i++) {
          const a = i / 48 * Math.PI * 2;
          vertices.setXYZ(i, Math.cos(a) * inner, 0, -Math.sin(a) * inner);
        }
        vertices.needsUpdate = true;
      }
      F.waitRing.material.opacity = F.waitReached ? SETTINGS.reduceMotion ? .9 : .8 + Math.sin(rt.t * 3) * .12 : .65;
    }
    rt.objProgress('main', t < 4.4 ? '明け方。上様は奥の居室でお休みじゃ' : '供のそばで構えよ。下知が出たら表門へ走れ');
    if (t >= 14) { rt.hud.notices.push('待ち終わり。表門へ', 90, 4); def.p2(rt); } // 門へ先に走っても、謀反の知らせと下知は最後まで聞かせる。
  } else if (F.hp === 2) {
    if (F.patrolScan === 0.5 && !F.gMain) {
      const blocker = gateBlocker(rt);
      const nearGate = Math.hypot(p.x - GATES.main.x, p.z - GATES.main.z) <= 6;
      // 門を敵に押さえられたまま、閉門の下知を四十秒も残さない。
      F.gateOccupied = nearGate && blocker?.team === 1 ? (F.gateOccupied || 0) + 0.5 : 0;
      rt.obj('main', nearGate && blocker ? blocker.team === 1
        ? '門の口の敵を押し返し、門を閉めよ' : '門の内へ下がり、口を空けよ'
        : nearGate ? '門をしめる' : '門へ走れ', 'main', true);
      rt.objProgress('main', Math.hypot(p.x - GATES.main.x, p.z - GATES.main.z) > 6
        ? '上様も表へ出られる。先に立ち、表門の内側へ走れ'
        : blocker ? gateHint(rt, blocker) : '「門をしめる」を長押し');
    }
    // 門へ着く前も、見通せる敵が三人未満なら四秒で後続を寄せる。
    // 逃げる負傷兵や壁の向こうの兵は、斬り合いの相手に数えない。
    if (F.patrolScan === 0.5) {
      let near = 0;
      rt.army.forNear(p.x, p.z, 8, (o) => {
        if (o.alive && o.team === 1 && !o.isStruct && !o.noTarget && !o.fleeing && !o.woundOut &&
            Math.hypot(o.pos.x - p.x, o.pos.z - p.z) <= 8 &&
            Math.abs(o.pos.y - p.y) < 3 && !rt.army.wallBetween(p, -1, o.pos)) near++;
      });
      F.patrolQuiet = near >= 3 ? 0 : (F.patrolQuiet || 0) + 0.5;
      if (!F.gMain && F.patrolQuiet >= 4) patrolReinforce(rt);
    }
    if (!F.gMain && F.gateTryAt && rt.t >= F.gateTryAt) {
      F.gateTryAt = rt.t + 2;
      if (Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) < 10) closeGate(rt, 'other');
    }
    // 上様の着くのを待たずに門前の守りへ移る（上様は後から加わる）。門を閉められぬままでも、四十秒で押し入られる。
    if ((F.gMain && Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) < 8) || F.gateOccupied >= 6 || t > 40) def.p3(rt);
  } else if (F.hp === 3) {
    const g = F.gMain;
    if (Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) <= 7) F.gateHold = (F.gateHold || 0) + dt;
    // 波と波の間も、門前に十人ほどの敵がいる厚さを保つ（減れば門の外から次の寄せ手が詰める）
    if (t > 8 && (F.topScan = (F.topScan || 0) - dt) <= 0) {
      F.topScan = 1;
      let near = 0;
      rt.army.forNear(p.x, p.z, 25, (o) => { if (o.alive && o.team === 1 && !o.isStruct && !o.fleeing && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) <= 25) near++; });
      if (near < 10 && rt.t >= (F.topAt || 0) && (F.topN || 0) < 10) {
        F.topAt = rt.t + 6; F.topN = (F.topN || 0) + 1;
        akechi(rt, '門へ詰める明智勢', IN.main, [uS(1), uA(5)], g && g.alive ? { gate: F.gMain } : {});
      }
    }

    rt.objProgress('main', F.patrolDistance > 10 ? '廊下の出口から回廊へ。道の印を追い、表門の内へ進め'
      : g && g.alive ? (g.hp < g.maxHp * 0.3 ? '門がきしむ。上様の前で構え、退く下知を待て' : '門の内で構え、本堂へ退く下知を待て') : '門の口から離れ、味方の後ろで構えよ');
    if (t >= 45 && ((g && !g.alive) || (!g && F.foes.some((q) => q.units.some((u) => u.alive && u.pos.x < GATES.main.x - 2 && Math.abs(u.pos.z - GATES.main.z) < 6))))) def.gateDown(rt);
  } else if (F.hp === 4) {
    // 門が破られた後は、目の前に常に敵が数人以上いる（数で押される怖さ）。減れば表門から次の寄せ手が入る
    if ((F.topScan = (F.topScan || 0) - dt) <= 0) {
      F.topScan = 1;
      let near = 0;
      rt.army.forNear(p.x, p.z, 20, (o) => { if (o.alive && o.team === 1 && !o.isStruct && !o.fleeing && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) <= 20) near++; });
      if (near < 10 && rt.t >= (F.topAt || 0) && (F.topN || 0) < 16) {
        F.topAt = rt.t + 6; F.topN = (F.topN || 0) + 1;
        akechi(rt, '押し寄せる明智勢', [...IN.main, [-42, 47], [-45, 47], ...(p.x > -52 && p.z > 36 && p.z < 66 ? [[p.x, p.z]] : [])], [uS(1), uA(5)], { nb: true });
        rt.army.play('eshout', { x: -30, z: 50 }, 1.2);
      }
    }
    if (F.flank && !F.flankDone && (gone(F.flank) || F.flank.count <= 1)) { F.flankDone = true; rt.objDone('flank'); rt.award((t2) => t2.side.push('宿坊から回り込む明智勢を止めた'), '回り込みを止めた'); }
    const left = Math.max(0, Math.ceil(180 - t));
    rt.objProgress('main', dNb < 10 && Math.hypot(p.x - HONDO_IN.x, p.z - HONDO_IN.z) < 6
      ? '部屋で信長を待て'
      : '印を追い、東の戸へ');
    if (left <= 20 && !F.hondoLateSaid) { F.hondoLateSaid = true; rt.bark('本堂への合流が遅れておる！　印へ退け。間に合わねば護衛失敗じゃ', true); }
    if (dNb < 10 && Math.hypot(p.x - HONDO_IN.x, p.z - HONDO_IN.z) < 6 && Math.hypot(NB.pos.x - HONDO_IN.x, NB.pos.z - HONDO_IN.z) < 5) def.p5(rt);
    else if (t > 180) def.nbFail(rt, '本堂で合流できず、守りが崩れた');
  } else if (F.hp === 5) {
    rt.objProgress('main', !F.hondoDirect ? '道の印で本堂の東の口へ。戸を開け、上様のそばへ戻れ' : F.standMerit?.[2]
      ? '侍を斬った。残る寄せ手を払い、奥へ退く支度を守れ'
      : '堂の口の侍を斬り払えば、上様が早く奥へ退ける');
    // 堂の口でも、目の前に十人ほどの敵がいる厚さを保つ（減れば表門から次の寄せ手が入る）
    if ((F.topScan = (F.topScan || 0) - dt) <= 0) {
      F.topScan = 1;
      let near = 0;
      rt.army.forNear(p.x, p.z, 25, (o) => { if (o.alive && o.team === 1 && !o.isStruct && !o.fleeing && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) <= 25) near++; });
      if (near < 10 && rt.t >= (F.topAt || 0) && (F.topN || 0) < 16) {
        F.topAt = rt.t + 6; F.topN = (F.topN || 0) + 1;
        akechi(rt, '押し寄せる明智勢', [...IN.main, [-42, 47], [-45, 47], ...(p.x > -52 && p.z > 36 && p.z < 66 ? [[p.x, p.z]] : [])], [uS(1), uA(5)], { nb: true });
      }
    }
    // 手柄が退く時機を早める。倒せなくても従来の時間で下知を出す。
    // 本堂の口の斬り合いは厚いまま、退く下知を早める（長く居続けると、布も間に合わずに削り切られる。
    // 一つの戦を遊んで四〜七分に収める決まりにも合わせ、二条の幕まで含めた長さを縮める）。
    // 延焼が早ければ、堂内で熱を受け始める二十二秒より前に退く下知を出す。
    const hondo = T.G.byId.hondo;
    const burningHondo = hondo.state === 1 && hondo.burnT >= 8;
    if (burningHondo || (F.standMerit?.[2] && gone(F.stand) && t > 30) || (t > 42 && (gone(F.stand) || t > 52))) { if (F.flank && !F.flankDone) { F.flankDone = true; rt.objFail('flank'); } def.p6(rt); }
  } else if (F.hp === 6) {
    if (F.mv && F.nbGoal) {
      // 遠い御殿だけを指すと本堂の壁へ直進してしまう。道の曲がり角を順に示す。
      if (!(F.moveGuideAt > rt.t)) {
        F.moveGuideAt = rt.t + 0.5;
        moveGuide(rt);
        const left = Math.max(0, Math.ceil(150 - (rt.t - F.pT)));
        const action = F.escortShown ? '道の印で上様と合流し、奥へ退け' : F.mv === 'urate' && p.z < 53 && p.x > -64 ? '本堂の南の口から、西の裏手へ退け' : '戸口の敵だけを払い、印へ退け。追うな';
        rt.objProgress('main', `${action}。火が回るまであと${left}秒`);
      }
      if (dNb > 20 && !F.waitSaid) { F.waitSaid = true; honnoSay(rt, '森蘭丸', '上様がお待ちじゃ！　先に立って道を開け！', 3); }
      // 道が開かぬままなら護衛失敗。瞬間移動で通り抜けない。
      if (rt.t - F.pT > 100 && !F.mvLateSaid) { F.mvLateSaid = true; honnoSay(rt, '森蘭丸', '火が迫る！　急げ、上様を御殿へ！', 3); }
      if (rt.t - F.pT > 150) def.nbFail(rt, '退路を開けるのが遅れ、火が回った');
    } else if (t > 16 && !F.mv) def.p6go(rt, F.mvKeys[0]);
  } else if (F.hp === 7) {
    if (!(F.guardScanAt > rt.t)) { F.guardScanAt = rt.t + 0.5; guardGuide(rt); }
    if (dNb < 12) F.lastHold = (F.lastHold || 0) + dt;
    rt.objProgress('main', F.heatZone
      ? p.x > F.heatZone.x0 && p.x < F.heatZone.x1 && p.z > F.heatZone.z0 && p.z < F.heatZone.z1
        ? '広間は火の中じゃ。道の印で控えの間へ退け'
        : '控えの間で構え、近い敵だけを払え。広間へ戻るな'
      : t > 42 && dNb >= 12
      ? '道の印で上様へ戻れ。退く下知が出ておる'
      : F.standMerit?.[3] ? '侍を払った。上様の前で、奥へ退く支度を守れ'
      : '廊下の侍を斬り払え。上様が奥へ退く間を作れ');
    if (dNb < 12 && ((F.standMerit?.[3] && gone(F.stand) && t > 32 && F.lastHold >= 12) || (t > 42 && (gone(F.stand) || t > 52)))) def.p8(rt);
    else if (t > 135) def.nbFail(rt, '最後の間へ戻れず、守りを失った');
  } else if (F.hp === 8) {
    // 小姓衆が口をこじ開ける：落ちる自分のそばに二人より多く寄れば、五秒に一度、斬り込んで押し返す（兵は減らさない）。
    if (rt.t >= (F.p8PushAt || 0)) {
      let close = 0;
      rt.army.forNear(p.x, p.z, 5, (o) => { if (o.alive && o.team !== P.team && !o.fleeing && !o.isStruct && !o.noTarget) close++; });
      if (close >= 2) { F.p8PushAt = rt.t + 5; F.p8PushN = (F.p8PushN || 0) + 1; pushBack(rt, 5, '小姓', F.p8PushN === 1 ? `${nm(rt)}を通せ！　道を開けよ！` : F.p8PushN === 2 ? '振り返るな、行け！' : ''); }
    }
    // 落ちる段も、囲みの段と同じ体力の線で寄せ手の太刀の深さを均す（裏門の見張りも含める）。
    if (!(F.p8GmAt > rt.t)) {
      F.p8GmAt = rt.t + 1;
      const hpF = P.hp / P.maxHp, line = 1 - 0.7 * Math.min(1, (rt.t - (F.surT0 ?? rt.t)) / 420);
      const gm = hpF < line - 0.12 ? 0.3 : hpF < line ? 0.6 : hpF > line + 0.15 ? 1.4 : 1;
      for (const g of F.foes) if (!gone(g)) { g.dmg0 ??= g.dmgMult ?? 1; g.dmgMult = g.dmg0 * Math.min(1, gm); }
    }
    const d = Math.hypot(p.x - PT.uraOut.x, p.z - PT.uraOut.z);
    if (!(F.escapeScanAt > rt.t)) { F.escapeScanAt = rt.t + 0.5; escapeGuide(rt); }
    rt.objProgress('main', p.x > -75.5
      ? '印を追い、西の戸口へ。戸の前で「戸を開ける」'
      : `土橋を渡り、裏門の外へ。あと${Math.max(0, Math.ceil(F.escapeDistance))}歩`);
    if (d < 6 && t > 12 && P.alive) def.fallen(rt);
  }
  if (!F.ending && F.escortShown && F.hp !== 4) rt.objProgress('main', F.farT > 0
    ? `道の印で上様へ戻れ。あと${Math.max(0, Math.ceil(60 - F.farT))}秒`
    : '上様の印へ戻り、共に進め');
}
const hallNear = (T, x, z) => T.halls.some((h) => x > h.x0 - 1 && x < h.x1 + 1 && z > h.z0 - 1 && z < h.z1 + 1);

// ======================================================================
// 信長で遊ぶ時も、同じ本能寺で門から奥へ退く。終わりは史実の自害。
const L_START = PT.start;
const OKU = PT.oku;
const GATE_N = GATES.side;
// 門の扉：板を矧いだ二枚の扉に、貫・筋交い・肘金・乳金物と内の閂（props の tobira）。一枚板の箱にしない。
function gateDoors(W, x, z, w, rotY) {
  return tobira(W, x, z, w, rotY === 0 ? Math.PI / 2 : 0, { h: 3.1 });
}
// 門を打ち破る組の狙い（門が倒れたら null を返し、lordTick が「かかれ」に替える）
const hitGate = (gate) => () => (gate.alive ? gate : null);

Object.assign(honnoji, {
  lordSpawn: { x: L_START.x, z: L_START.z, heading: Math.PI / 2 },
  lordAt: { x: HONNO.x - 4, z: HONNO.z, r: HONNO.h, why: '本能寺の境内の内（信長は本能寺に泊まっていた）' },
  lordHata: { spear: 12, bow: 8 },   // 供のわずかな者（小姓衆は別に六人）

  lordSetup(rt) {
    const W = rt.world, F = rt.flags;
    F.lstep = 0; F.ek = 0; F.ak = 0; F.foes = [];
    rt.after(0.05, () => { rt.taisho = null; });
    // ---- 京の町並み（足軽の流れと同じ） ----
    const inCompound = (x, z) => [HONNO, NIJO].some((c) => Math.abs(x - c.x) < c.h + 5 && Math.abs(z - c.z) < c.h + 5);
    // 町屋が何十も並ぶ所なので、材質ごとの BatchedMesh にまとめて描く回数を減らす
    const hutBatch = makeSimpleBatch();
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z) || onTownStreet(x, z, 7)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    // 蛸薬師通りの路地：井戸と木戸を少し（門前の密な町割り）
    rt.scene.add(well(W, -22, 44), well(W, -8, 62), kido(W, -27, 54, Math.PI / 2));
    // 両方の遊び方で同じ塀・門・居室を使う。
    F.T = buildTera(rt); cleanTemple(rt); courtGarden(rt); rt.army.doorVia = (u, to) => honnoDoor(rt, u, to); F.fire = F.T.fire; F.dm0 = W.distMul || 1;
    F.gE = smallGate(rt, GATES.main, 1500);
    F.gN = smallGate(rt, GATES.side, 900);
    const wallBatch = makeKitBatch();
    compound(rt, NIJO, 'w', 7, wallBatch); finalizeKitBatch(rt, wallBatch);
    rt.scene.add(templeGateWood(rt, kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2)));
    // 二条御所は戦国期の御殿。後の二条城の天守・石垣は置かない。広間と奥の間は推定。
    F.nijoRoom = buildRoom(rt, NIJO.x + 2, NIJO.z - 2, { w: 16, d: 11, kind: 'goten', rot: -Math.PI / 2, night: true });
    F.nijoRoom.inside.name = '二条御所'; F.nijoRoom.inside.where = '二条御所の奥の間';
    buildNearbyChurch(rt, hutBatch);
    finalizeSimpleBatch(rt, hutBatch);
    // 裏の松（西の築地を越える枝）
    rt.scene.add(nobori(W, HONNO.x - 4, HONNO.z - 4, 'oda', 5), nobori(W, HONNO.x + 8, HONNO.z + 4, 'eiraku', 5));
    // ---- 遠景の明智の大軍（四方）と篝・旗。落ち口の斜めの隅は空けておく ----
    F.aHost = buildSonae(rt, [HONNO_ATTACK]);
    honnoRing(rt);
    for (const [x, z] of [[HONNO.x - 22, TERA.z1 + 10], [TERA.x0 - 10, HONNO.z - 24], [TERA.x1 + 10, HONNO.z + 22], [HONNO.x + 24, TERA.z0 - 10]]) honnoTorch(rt, x, z);
    for (const [x, z] of [[HONNO.x - 10, TERA.z1 + 12], [TERA.x0 - 12, HONNO.z + 8], [HONNO.x + 4, TERA.z0 - 12], [TERA.x1 + 12, HONNO.z - 6]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    // ---- 小姓衆（森蘭丸ら）。自分のそばを離れない ----
    F.kosho = allyGroup(rt, { fixed: true, name: '森蘭丸と小姓衆', anchor: { ...PT.hikae }, facing: Math.PI / 2, width: 4, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '森蘭丸', kosode: 1, honnoCloth: true, kosodeCol: 0x805244, obi: 0x30251c, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '森坊丸', kosode: 1, honnoCloth: true, kosodeCol: 0x536783, obi: 0x30251c, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '森力丸', kosode: 1, honnoCloth: true, kosodeCol: 0x78634d, obi: 0x30251c, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '高橋虎松', kosode: 1, honnoCloth: true, kosodeCol: 0x49617a, obi: 0x30251c, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '菅屋角蔵', kosode: 1, honnoCloth: true, kosodeCol: 0x6a795c, obi: 0x30251c, flag: null, horse: false } }], ODA));
    F.kosho.defMult = 1;
    F.ran = F.kosho.units[0]; F.bo = F.kosho.units[1]; F.riki = F.kosho.units[2];
    // 供のわずかな者（槍と弓。自分の組として付いて来る）
    rt.makeSquad({ x: L_START.x - 2, z: L_START.z + 4 }, Math.PI / 2, [{ kind: 'spear', n: 12 }, { kind: 'bow', n: 8 }]);
    F.ehon = camp(rt, { x: -104, z: 120, facing: Math.PI * 0.75, team: 1, faction: 'akechi', mon: 'akechi', general: { name: '明智光秀' }, guard: 15, reserve: 0 });
    if (F.ehon?.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    applyLook(rt, HONNO_DAWN);
    W.timeKey = 'morning'; // 明け方の薄明を保ち、共通の夕暮れ・夜の遠景制限に入れない。
    // 寝入っていたところを急襲された信長：具足を着ける間が無い。小袖（肌着）のまま、兜も羽織も無しで戦い出す
    // （applyLord が戦の始めに具足一式を着せるので、その後の最初のコマで剥ぐ。rishi の段で簡単な羽織だけ足す）
    // 写真で見返すと、肌着のはずの信長がいつもの旗指物を背負ったままだった（直す：寝入りを襲われた体では指物を立てる間が無い）
    rt.after(0, () => { const u = rt.player.u; u.look = { ...u.look, kosode: 1, honnoCloth: true, sohei: 1, soheiV: null, kosodeCol: 0xebe5d6, armor: 0xcfc4a8, lace: 0x8a7a5a, hat: 'none', haori: 0, menpo: 0, horo: 0, sode: false, trim: 0, real: 0, flag: null, pole: false }; });
    rt.setPhase('brief');
    rt.obj('main', '何事か、確かめよ', 'main', true);
    rt.after(1.8, () => { if (F.lstep === 0 && !F.ending && !rt.over) {
      rt.army.play('volley', { x: HONNO.x + 26, z: HONNO.z }, 0.8);
      rt.objProgress('main', '表から鉄砲の斉射。寺の外が騒がしい');
    } });
    rt.after(3, () => rt.army.play('eshout', { x: HONNO.x + 24, z: HONNO.z }, 1.6));
    // 銃声、敵の名、下知を順に聞かせる。同時に三つの台詞を積まない。
    const at = (s, f) => rt.after(s, () => { if (F.lstep === 0 && !F.ending && !rt.over) f(); });
    at(3.6, () => honnoSay(rt, '織田信長', '……喧嘩か。騒がしい', 2.2));
    at(6.2, () => honnoSay(rt, '森蘭丸', '殿！　明智光秀の兵が寺を囲んでおります！', 3));
    at(9.5, () => honnoSay(rt, '織田信長', '是非に及ばず。……弓を持て', 2.5));
    at(12.5, () => this.lordDefend(rt));
  },

  // ① 弓と槍で表門を防ぐ
  lordDefend(rt) {
    const F = rt.flags;
    if (F.lstep >= 1) return;
    F.lstep = 1; F.stepT = rt.t;
    rt.setPhase('defend');
    sfx('bellRapid', 0.5);
    rt.banner('明智光秀、謀反', '桔梗の旗が本能寺を囲む');
    rt.obj('main', '弓と槍で、表門に寄せる明智勢を防げ', 'main', true);
    rt.marker('gE', { x: HONNO_GATE.x, z: HONNO_GATE.z }, '表門', { h: 3 });
    rt.army.playFar('sig_kakari', HONNO_GATE, 0.8);
    rt.objProgress('main', '門外の法螺貝と陣太鼓の早打ち＝明智勢の突撃。門の内で防げ');
    honnoSay(rt, '森蘭丸', '敵の陣太鼓じゃ！　弓は門の内、槍は門の脇で迎えよ！', 3.5);
    const E = (dx, dz) => ({ x: HONNO_GATE.x + 16 + dx, z: HONNO_GATE.z + dz });
    rt.after(3, () => this.lordWave(rt, '明智の先手', E(0, -4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]));
    rt.after(10, () => this.lordWave(rt, '築地の外の鉄砲', E(-4, 9), null, [{ type: 'gun', n: 5 }, { type: 'bow', n: 3 }], { order: 'hold', aggro: 26 }));
    rt.after(22, () => this.lordWave(rt, '明智の二の手', E(4, 4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }]));
    rt.after(34, () => { this.lordWave(rt, '裏門へ回った明智勢', { x: GATE_N.x + 6, z: GATE_N.z - 14 }, F.gN, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }]); honnoSay(rt, '小姓', '裏門にも寄せてまいりました！', 3); rt.marker('gN', { x: GATE_N.x, z: GATE_N.z }, '北の脇門', { h: 3 }); });
    rt.after(48, () => this.lordWave(rt, '明智の三の手', E(0, 0), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]));
    // 門が持つ間も、明智勢は切れ目なく寄せる（大きな波）
    rt.after(66, () => { if (F.lstep === 1) { this.lordWave(rt, '明智の四の手', E(2, -6), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }]); honnoSay(rt, '森蘭丸', '桔梗の旗が、通りを埋めて参ります！　矢を惜しむな！', 3); } });
    rt.after(84, () => { if (F.lstep === 1) this.lordWave(rt, '築地を越えようとする明智勢', { x: HONNO.x + HONNO.h + 6, z: HONNO.z + 12 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { order: 'hold', aggro: 20 }); });
    rt.after(100, () => { if (F.lstep === 1) this.lordWave(rt, '明智の五の手', E(0, 4), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]); });
    rt.after(122, () => { if (F.lstep === 1) { this.lordWave(rt, '明智の大手', E(-2, 0), F.gE, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }]); honnoSay(rt, '小姓', '門の閂が、もう持ちませぬ！', 3); } });
  },
  // 明智の一隊（門があれば門を打ち、無ければ寺の内へ討ち入る）
  lordWave(rt, name, at, gate, list, o = {}) {
    const F = rt.flags;
    if (F.ending) return null;
    if (gate && !gate.alive) gate = null;
    if (!gate && o.order !== 'hold' && F.gE?.alive) gate = F.gE;
    let entry = gate === F.gN ? [[GATE_N.x, GATE_N.z - 8], [GATE_N.x, GATE_N.z + 4]] : [[HONNO_GATE.x + 8, HONNO_GATE.z], [HONNO_GATE.x - 4, HONNO_GATE.z]];
    if (!gate && o.order !== 'hold') entry = [...entry, ...MOVES.niwa.pts];
    if (o.order === 'hold') entry = [[at.x, at.z]];
    return akechi(rt, name, entry, list, { gate, hold: o.order === 'hold', aggro: o.aggro });
  },
  lordGateDown(rt, gate) {
    const F = rt.flags;
    if (gate.downDone) return;
    gate.downDone = true;
    if (gate.alive) { gate.hp = 0; gate.alive = false; rt.army.structFall(gate); }
    rt.unmark(gate === F.gE ? 'gE' : 'gN');
    rt.banner(`${gate.name}、破らる`, gate === F.gE ? '明智勢が境内へなだれ込む' : '裏からも明智勢が入ってくる');
    for (const g of F.foes) if (g.gate === gate) { g.order = 'path'; g.path = g.entryPath; g.pathIdx = 0; g.gate = null; g.assault = null; }
    if (gate === F.gE) this.lordCourt(rt);
  },
  // 判断②：表門が破られた。自ら槍を取るか、すぐ奥へ下がるか
  lordCourt(rt) {
    const F = rt.flags;
    if (F.lstep >= 1.5) return;
    F.lstep = 1.5; F.stepT = rt.t;
    rt.obj('main', '奥へ退くか、境内で押し返すか決めよ', 'main', true);
    honnoSay(rt, '森蘭丸', '殿、門が破れ申した！　奥へお下がりを！', 3);
    rt.choose('表門が破られた。どうする？', [
      { label: '自ら槍を取り、境内で明智勢を押し返す', note: '供の者が奮い立つ。ただ、手傷を負うおそれ' },
      { label: '蘭丸らに任せ、すぐに奥へ下がる', note: '火を放つ支度が早くできる。ただ、小姓衆が削られる' },
    ], (i) => {
      if (i === 1) {
        this.lordBack(rt);
        return;
      }
      F.court = rt.t;
      honnoSay(rt, '織田信長', '槍を持て！　……蘭丸、そばの者も槍を持て', 3);
      rt.obj('main', '境内で明智勢を押し返せ', 'main', true);
      rt.marker('court', { x: HONNO.x + 8, z: HONNO.z - 2 }, '境内', { h: 2 });
      for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: HONNO.x + 6, z: HONNO.z - 12 }; g.aggro = 10; }
      this.lordWave(rt, '境内へなだれ込む明智勢', { x: HONNO_GATE.x + 10, z: HONNO_GATE.z + 4 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
      rt.after(28, () => { if (F.lstep === 1.5) { this.lordWave(rt, '門から続く明智の新手', { x: HONNO_GATE.x + 12, z: HONNO_GATE.z - 4 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]); honnoSay(rt, '小姓', '新手が門から！　殿、もう十分にございます！', 3); } });
    }, 16);
  },

  // ② 奥へ下がる
  lordBack(rt) {
    const F = rt.flags;
    if (F.lstep >= 2) return;
    if (F.court) { rt.unmark('court'); if (!F.ending && (F.courtSupport || 0) >= 8) rt.award((t) => t.side.push('自ら槍を取り、境内で明智勢を押し返した'), '自ら槍を振るった'); }
    F.lstep = 2; F.stepT = rt.t;
    rt.setPhase('back');
    honnoSay(rt, '森蘭丸', '退き太鼓じゃ！　殿、我らが防ぐ間に奥へお下がりを！', 3.5);
    rt.army.playFar('sig_nobiki', PT.hikae, 0.7);
    rt.obj('main', '奥（御殿の裏）へ退け', 'main', true);
    rt.objProgress('main', '守り手の法螺貝と間を空けた二つ打ち＝退け。奥の印へ');
    rt.marker('oku', OKU, '奥', { h: 2 });
    rt.zone('oku', OKU.x, OKU.z, 3.6);
    // 蘭丸らは御殿の前で踏みとどまる
    F.kosho.anchor = { x: PT.hikae.x + 3, z: PT.hikae.z }; F.kosho.aggro = 14; F.koshoStay = Infinity;
    // 供の者は御殿の北の庭で踏みとどまる（狭い奥へ皆で押し込むと、火を放つ所まで行けない）
    for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: -52, z: 77.5 }; g.facing = Math.PI / 2; g.dest = null; }
    // 境内の明智勢は、蘭丸らに阻まれてしばし足が止まる

    rt.after(14, () => this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z }, null, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }]));
    F.moreT = rt.t + 26;
  },
  // ②' 御殿の縁で、斎藤利三の手を防ぐ（明智の大きな波。蘭丸らと並んで、火を放つ間を稼ぐ）
  lordRishi(rt) {
    const F = rt.flags;
    if (F.lstep >= 2.5) return;
    F.lstep = 2.5; F.stepT = rt.t; F.moreT = rt.t + 999;
    rt.setPhase('rishi');
    rt.unmark('oku'); rt.unzone('oku');
    rt.army.playFar('sig_kakari', { x: -44, z: 88 }, 0.8);
    rt.banner('御殿へ寄せる明智勢', '廊下の口を固めよ');
    honnoSay(rt, '森蘭丸', '敵の陣太鼓！　廊下に明智の新手じゃ！　奥へ通すな！', 3.5);
    honnoSay(rt, '織田信長', '火の支度を守る。廊下へ向き、ここで防げ', 3.5);
    rt.obj('main', '御殿の口で、明智勢を防げ', 'main', true);
    rt.objProgress('main', '寄せ手の法螺貝と陣太鼓の早打ち＝突撃。廊下の口を固めよ');
    rt.marker('rishi', PT.kyoshitsu, '供と守る御殿の口', {}); rt.zone('rishi', PT.kyoshitsu.x, PT.kyoshitsu.z, 12);
    F.kosho.anchor = { ...PT.kyoshitsu }; F.kosho.aggro = 14; F.koshoStay = Infinity;
    for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: -61, z: 89 }; g.aggro = 12; g.dest = null; }

    // 先手の名や本人の突入位置は確定できないため、無名の寄せとする。
    const g = this.lordWave(rt, '御殿へ寄せる明智勢', { x: HONNO.x + 12, z: HONNO.z - 13 }, null,
      [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 7 }], { dmgMult: 0.5 });
    if (g) F.rishi = g;
    rt.after(34, () => { if (F.lstep === 2.5) { this.lordWave(rt, '明智の新手', { x: HONNO.x + 12, z: HONNO.z + 8 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { dmgMult: 0.5 }); honnoSay(rt, '小姓', '南の縁からも回って参ります！', 3); } });
    rt.after(72, () => { if (F.lstep === 2.5) { this.lordWave(rt, '御殿の縁へ回る明智勢', { x: HONNO.x + 10, z: HONNO.z - 14 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { dmgMult: 0.5 }); honnoSay(rt, '森蘭丸', 'もう少しにござる！　持ちこたえよ！', 3); } });
    rt.bark('御殿の縁で踏みとどまれ。しのげば、火を放つ支度が整う');
  },
  // ③ 御殿に火を放つ
  lordFireStep(rt) {
    const F = rt.flags;
    if (F.lstep >= 3) return;
    F.lstep = 3; F.stepT = rt.t;
    rt.setPhase('fire');
    rt.unmark('oku'); rt.unzone('oku'); rt.unmark('rishi'); rt.unzone('rishi');
    rt.marker('fire', OKU, '御殿に火を放つ', { h: 2 });
    honnoSay(rt, '織田信長', '……女どもは苦しからず。急ぎ出よ。蘭丸、奥へ退く', 3.5);
    rt.obj('main', '御殿に火を放て', 'main', true);
    rt.addInteract('fire', { x: OKU.x, z: OKU.z }, '御殿に火を放つ', () => this.lordBurn(rt), { r: 5.5, hold: 1.2, prio: 6 });
    // 小姓は持ち場を守り、敵の強さや士気は変えない。
    F.moreT = rt.t + 22;
    rt.bark('奥の印のそばで長押しすると、御殿に火を放つ');   // 奥は供の者で混み合うので、少し離れていても火を放てる
  },
  lordBurn(rt) {
    const F = rt.flags;
    if (F.burnT || F.ending || rt.over || !rt.player.u.alive || F.lstep !== 3) return;
    F.burnT = rt.t;
    rt.uninteract('fire'); rt.unmark('fire');
    battleEvent(rt, EVENT_FIRE_START, OKU, F.kosho, 0, true, '御殿から火の手が上がった');
    // 御殿（本堂）に火がかかる。周りの棟へは makeTempleFire が少しずつ燃え移らせる（一度に伽藍を燃やさない）
    F.fire.ignite('goten', '御殿の火');
    rt.banner('本能寺、炎上', '御殿から火の手が上がった');
    sfx('kane', 0.5);
    rt.award((t) => t.side.push('御殿に火を放った'), '御殿に火を放った');
    this.lordEnd(rt, 'fire');
  },
  // 史実どおりの最期（討たれた・炎に呑まれた）
  lordEnd(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objRemove('escort');
    const me = rt.player.u;
    me.hp = 0; me.alive = false; me.fall = 1; me.deadT = 0;
    rt.tracker.main = false; // 自害は軍事的な勝利にはしない。
    rt.banner('是非に及ばず', how === 'fire' ? '炎が御殿を包んだ' : '織田信長、本能寺に死す');
    honnoSay(rt, '', how === 'fire' ? '――信長は奥の間に入り、火の中で自害したと伝わる。享年四十九' : '――明智勢を防ぎきれず、信長は倒れた', 5);
    rt.after(5, () => honnoSay(rt, '', '――遺体は見つからなかった。十一日後、羽柴秀吉が山崎で明智光秀を破る', 5));
    rt.finish({ down: true }, 10);
  },

  lordTick(rt, dt) {
    const F = rt.flags;
    if (!rt.player.u.alive) return;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.fire) F.fire.tick(dt);
    if (F.T) {
      teraTick(rt, F.T, dt);
      if (!rt.player.u.alive || rt.player.u.hp <= 0) { this.lordDown(rt); return; }
      if (rt.player.u.strikeT > 0.12 && !F.brkHit) { F.brkHit = true; breakNear(rt, F.T, rt.player.u.pos.x, rt.player.u.pos.z, 1.6, 1); }
      if (!(rt.player.u.strikeT > 0.12)) F.brkHit = false;
    }
    for (const g of F.foes || []) if (g.gate && !g.gate.alive && !gone(g)) { g.order = 'path'; g.path = g.entryPath; g.pathIdx = 0; g.gate = null; g.assault = null; }
    if (F.ending) return;
    const u = rt.player.u, p = u.pos;
    // 小姓衆は自分のそばに付く（奥へ下がる間は、蘭丸らが御殿の前で踏みとどまる）
    if (!gone(F.kosho) && !(F.koshoStay > rt.t)) { F.kosho.order = 'hold'; F.kosho.anchor.x = p.x - Math.sin(u.heading || 0) * 2.5; F.kosho.anchor.z = p.z - Math.cos(u.heading || 0) * 2.5; }
    if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; honnoSay(rt, '小姓', '蘭丸様、討死……！', 3); }
    if (F.lstep === 1) {
      const t = rt.t - F.stepT;

      rt.objProgress('main', '表門の内で迎え撃て。火の手に気をつけよ');
      if (!F.gE.alive) this.lordGateDown(rt, F.gE);
      else if (t >= 90) {
        F.fire.ignite('soboN', '出火の原因は不明'); gateBlaze(rt);
        // 火と寄せで門も崩れる。後続を閉じた門の外に残さない。
        F.gE.hp = 0; F.gE.alive = false; F.gE.downDone = true; rt.army.structFall(F.gE);
        rt.unmark('gE');
        rt.banner('火と寄せ手で表門が崩れる', '御殿へ退いて迎え撃て');
        this.lordBack(rt);
      }
    }
    if (F.lstep === 1.5 && F.court) {
      if (Math.hypot(p.x - HONNO.x - 8, p.z - HONNO.z + 2) < 14 && !gone(F.kosho)) F.courtSupport = (F.courtSupport || 0) + dt;
      const left = Math.max(0, 45 - (rt.t - F.court));
      rt.objProgress('main', '門の内で寄せを受けよ。奥へ退く合図を待て');
      if (left <= 0) this.lordBack(rt);
    }
    if (F.gN.alive === false && !F.gNDown) { F.gNDown = true; if (F.lstep < 4) this.lordGateDown(rt, F.gN); }
    else if (F.gN.alive === false) F.gNDown = true;
    if (F.lstep === 2) {
      const d = Math.hypot(p.x - OKU.x, p.z - OKU.z);
      rt.objProgress('main', `奥まで ${Math.max(0, Math.round(d))}歩`);
      if (d < 6) this.lordRishi(rt);
    }
    if (F.lstep === 2.5) {
      const atMouth = Math.hypot(p.x - PT.kyoshitsu.x, p.z - PT.kyoshitsu.z) < 12;
      // 供が倒れても、本人が口を守れば火を放つ段へ進める。
      if (atMouth) F.rishiSupport = (F.rishiSupport || 0) + dt;
      const left = Math.max(0, 90 - (rt.t - F.stepT));
      const holdLeft = Math.max(0, Math.ceil(45 - (F.rishiSupport || 0)));
      rt.objProgress('main', !atMouth ? '御殿の口の輪へ戻れ。離れた間は守りに数えぬ'
        : holdLeft > 0 ? `廊下へ向いて防げ。守りの務めはあと${holdLeft}秒`
        : `口を守り続けよ。火の支度はあと${Math.ceil(left)}秒`);
      if (left <= 0 && (F.rishiSupport || 0) >= 45) this.lordFireStep(rt);
    }
    if (F.lstep === 3 && rt.t - F.stepT > 28 && Math.hypot(p.x - OKU.x, p.z - OKU.z) < 6) { honnoSay(rt, '小姓', '火は我らが！　……殿、お早く！', 3); this.lordBurn(rt); }
    // 新手（境内へ討ち入る）
    if (F.lstep >= 2 && F.lstep < 3 && F.moreT && rt.t > F.moreT) {
      F.moreT = rt.t + 18;
      const n = 10;
      const g = this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z + (Math.random() - 0.5) * 10 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n }], { dmgMult: F.lstep >= 4 ? 0.85 : 0.72 });
    }
  },
});
honnoji.lordDown = (rt) => honnoji.lordEnd(rt, 'down');

// 信長の自動操作も表門から奥へ退く。落ちのびる分岐はない。
const LORD_BOT_GATE = [[-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 64], [-44, 54], [-37, 50]];
const LORD_BOT_OKU = [...MOVES.urate.pts, [OKU.x, OKU.z]];
function lordBot(b, inp, goTo, patientStrike) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive || F.ending) return;
  const fight = (r) => {
    const e = b.army.nearestEnemy(u, r, (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.isStruct &&
      !o.woundOut && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    if (!e) return false;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.6;
    goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    if (d <= reach) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    patientStrike(p, inp, e, d);
    return true;
  };
  const follow = (key, pts) => {
    if (b.botPath !== key) { b.botPath = key; b.botWp = 0; }
    const w = pts[Math.min(b.botWp, pts.length - 1)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 2.2 && b.botWp < pts.length - 1) b.botWp++;
    goTo(p, inp, w[0], w[1], 1);
  };
  const step = F.lstep || 0;
  if (step < 2) { if (fight(4)) return; follow('gate', LORD_BOT_GATE); return; }   // 御殿の北を回って表門の内へ
  if (step === 2) { if (fight(1.8)) return; follow('oku', LORD_BOT_OKU); return; }
  if (step === 2.5) { if (fight(2.6)) return; goTo(p, inp, OKU.x + 1, OKU.z - 5, 1.5); return; }   // 小姓衆の後ろで構え、寄ってきた者とだけ斬り合う
  if (step === 3) { const it = b.nearestInteract(); if (!it || it.id !== 'fire') { goTo(p, inp, OKU.x, OKU.z, 1); return; } inp.k.add('KeyE'); return; }   // 斬りかかられても、火を放つ手は止めない

}

// 両軍の総勢（京にいた織田の者 千五百ほど。明智 一万三千ほど。数には諸説ある）
honnoji.force = (rt) => ({ a: rt.flags.step >= 3 ? 500 : 100, a0: rt.flags.step >= 3 ? 500 : 100, b: 13000, b0: 13000 });
honnoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '明智軍', mon: 'akechi' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
honnoji.famous = []; // 小姓は設営時に置く。敵将は囲みの後ろで指揮し、寺内の波へ混ぜない。
honnoji.date = (rt) => `天正十年六月二日　${!rt.G.lord && rt.flags.step >= 3 ? '二条の別の守備隊へ・' : ''}夏・${!rt.G.lord && rt.flags.step >= 3 ? '朝' : '明け方'}`;
honnoji.canSkip = () => ''; // 敵の行軍や出火の時刻まで早送りしない。
honnoji.history = '天正十年（1582）六月二日の明け方、中国の毛利攻めに向かうはずだった明智光秀の軍一万三千ほどが、京の本能寺を囲んだ。わずかな供と泊まっていた織田信長は、明智の謀反と知って「是非に及ばず」と言い、自ら弓や槍を取って戦った。傷を負って奥へ入り、火を放って自害したと『信長公記』は伝える。森成利（蘭丸）ら小姓衆も討ち死にした。近くの妙覚寺にいた嫡男の信忠は、村井貞勝らと二条御所（二条新御所）に移り、誠仁親王を御所の外へ移してから戦った。明智勢は隣の近衛前久の屋敷の屋根から鉄砲を撃ちかけ、信忠も自害した。信長の遺体は見つからなかった。十一日後、中国から引き返した羽柴秀吉が山崎の戦いで光秀を破る。この戦の主人公と組頭の甚兵衛は、遊びのための人物である。兵の数には諸説ある。 宣教師ふろいすの『日本史』にも本能寺の変が記されている。ただし本人は京におらず、近くの教会にいたかりおんらの知らせを使った。宣教師の報告では銃声と火の手が教会にも伝わり、信長は背に矢、腕に銃弾を受けたとされる。傷や最期の描写は『信長公記』と異なり、一つの確かな姿とは決められない。教会の細かな位置、建物の形、十字架の置き方は遊びのための推定である。台詞は史料の意味を短く言い直したもので、本文の引用ではない。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の景色や台詞の根拠には使っていない。 本能寺の供百人ほど、二条の守り五百人ほどは諸説のある目安で、同じ兵の生き残りではない。主人公は門の守りに加わる一人とし、主君の進路を決めたり史料にない使者へ任命されたりしない。信長で遊ぶ時も奥の間の自害で終わる。二条御所への移動は時間と距離を省いた場面転換である。寺域の百二十歩四方と各棟の位置は推定で、実測の復元ではない。発掘では内部を区切る幅四歩以上と約六歩の堀、南側の幅二歩以上の堀が見つかった。外周が堀で囲まれていたとする発掘報告に沿い、外周と内部の堀を別に作っている。天文法華の乱（1536）の後、京の法華の寺は堀・土塁・塀で囲んで要害を兼ねたとされ、北東の櫓、西の区画を分ける内の塀、講堂・方丈・馬舎の位置もその考えに沿った推定である。外周の幅四歩の形、土橋と各門の位置は推定である。襲撃の時刻は『信長公記』の早天と『言経卿記』の卯刻に合わせ、明け方として描いている。天気、空の色、風向、通りの幅と距離は推定である。寺の北に六角通、南に蛸薬師通、東に西洞院通、西に油小路通を置く関係は京都市の本能寺跡の解説による。各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 道の点は使い回し、歩くたびに配列を作らない。
// 本堂へ退く時、北（御殿の側）にいれば、燃える回廊（x=-45）を通らず中庭を下る。
const HONDO_BOT_NIWA = [[-52, 77.5], [-52, 75], [-51, 66], [-50, 54], [-50, 51], [-50, 49], [HONDO_IN.x, HONDO_IN.z]];
const HONNO_BOT_PATHS = {
  h8: HONNO_ESCAPE_PATHS.h8,
  h8n: HONNO_ESCAPE_PATHS.h8n,
  d: [[NIJO_GATE.x + 5, NIJO.z - 12], [NIJO.x, NIJO.z - 13], [NIJO_BACK.x, NIJO_BACK.z + 2], [NIJO_BACK.x, NIJO_BACK.z - 6], [OUT.x, OUT.z]],
};

// 素直な遊び手：表門を閉めて守り、本堂で上様と戦い、御殿へ移して守り抜き、裏門から落ちる → 二条御所の門を守り、北の口から落ちる
function honnoRetreatStepAllowed(b, step) {
  const p = b.player, from = p.u.pos;
  return (step.x - from.x) * Math.sin(p.yaw) + (step.z - from.z) * Math.cos(p.yaw) >= -.25 &&
    guardClear(b, step.x, step.z);
}

function honnoRetreatDodgeAllowed(b, step) {
  return guardClear(b, step.x, step.z);
}

honnoji.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  if (b.G.lord) { lordBot(b, inp, goTo, patientStrike); return; }
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;

  // 行き先が壁の向こうにしか無い時（押されて堂の外へ出た等）は、見える堂・御殿の口のうち、行き先へ近い口を先に通る。
  // 半秒に一度だけ調べる。
  const goVia = (x, z, stop) => {
    // 火の入った広間の中へは行き先を置かない。上様や敵が広間の際にいても、控えの間の側で待つ。
    const HZ = F.heatZone;
    if (HZ && x > HZ.x0 - 0.8 && x < HZ.x1 && z > HZ.z0 && z < HZ.z1) x = HZ.x0 - 1.2;
    if (!(b.t - (b.doorT ?? -9) < 0.5) || Math.hypot(x - (b.doorX ?? 1e9), z - (b.doorZ ?? 1e9)) > 1) {
      b.doorT = b.t; b.doorX = x; b.doorZ = z; b.door = null;
      if (F.hp >= 4 && !patrolClear(b, x, z)) {
        let bd = 1e9;
        for (const h of F.T?.halls || []) for (const d of h.doors) {
          const dd = Math.hypot(d.x - u.pos.x, d.z - u.pos.z);
          if (dd < 0.5 || dd > 14 || h.blocked || !patrolClear(b, d.x, d.z)) continue;
          const v = dd + Math.hypot(x - d.x, z - d.z);
          if (v < bd) { bd = v; b.door = d; }
        }
      }
    }
    if (b.door) goTo(p, inp, b.door.x, b.door.z, 0.3);
    else goTo(p, inp, x, z, stop);
  };
  // 道の点を順にたどる
  const follow = (key, pts) => {
    // 一番近い点が壁の向こうだと、壁に向かって歩き続ける。見通せる点から選び、二秒進まなければ選び直す。
    const stuck = b.botPath === key && b.t - (b.botWpT ?? b.t) > 2 && Math.hypot(u.pos.x - b.botWpX, u.pos.z - b.botWpZ) < 0.6;
    if (b.botPath !== key || stuck) {
      // 詰まって選び直す時は、今の点より先の点だけを見る（後ろの点へ戻ると、燃える回廊を引き返してしまう）。
      const stuckWp = b.botWp ?? -1;
      let bi = -1, bd = 1e9;
      // 見える次の点が無くても、二巡目に通過済みの点へ戻らない。
      // 今の角まで来ていない時は、その角を戸口経由で目指し直す。
      const first = b.botPath === key ? Math.max(0, stuckWp) : 0;
      b.botPath = key;
      for (let pass = 0; pass < 2 && bi < 0; pass++) pts.forEach((w, i) => {
        if (i < first) return;
        const d = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z);
        if (d < bd && (pass || patrolClear(b, w[0], w[1])) && !(stuck && i === stuckWp && pass === 0)) { bd = d; bi = i; }
      });
      b.botWp = bi < 0 ? first : bi;
    }
    if (!(b.t - (b.botWpT ?? -9) <= 2)) { b.botWpT = b.t; b.botWpX = u.pos.x; b.botWpZ = u.pos.z; }
    let w = pts[Math.min(b.botWp, pts.length - 1)];
    // 御殿の口は幅二歩。手前で曲がると、廊下から壁の角を横切ってしまう。
    // 口の中央まで寄ってから次の点へ向き、停止の間合いは到着の判定より小さくする。
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 0.5 && b.botWp < pts.length - 1) w = pts[++b.botWp];
    goVia(w[0], w[1], 0.3);
  };
  // 退く段では反撃の待ちで止まらず、道へ歩きながら先に届く刃を受ける。
  const guardMove = () => {
    // 道の点が見えても、戸口の兵の体で足が止まる。道へ戻れる横の隙間を通す。
    // 壁と火を横切らず、退路を引き返さない一歩だけを選ぶ。
    // 火の中では隙間探しで止めず、従来の出口への歩みを保つ。
    const heat = F.heatZone;
    // 角の点を越えた壁まで調べると、まだ通れる戸口の手前から横へそれてしまう。
    if (!(heat && u.pos.x > heat.x0 && u.pos.x < heat.x1 && u.pos.z > heat.z0 && u.pos.z < heat.z1))
      retreatThroughGap(b, inp, honnoRetreatStepAllowed,
        p._gtGoal ? Math.hypot(p._gtGoal.x - u.pos.x, p._gtGoal.z - u.pos.z) : 1.5);
    const walk = p.yaw, moving = inp.k.has('KeyW');
    let face = null, soonest = Infinity;
    let firstAngle = null, leftAngle = 0, rightAngle = 0, crossed = false, imminent = false;
    for (const o of b.army.threats || []) {
      if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget ||
          Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const atk = o.atk?.target === u && !o.atk.ranged && !o.atk.bow;
      const swing = o.swing?.target === u && !o.swing.done;
      if (!atk && !swing && !(o.charging && o.target === u)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d > 8 || b.army.wallBetween(o.pos, -1, u.pos,
          (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3)) continue;
      const soon = o.charging ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
      // 遠い空振りの残り時間だけで、目前へ届く刃への向き直りや回避を奪わない。
      const reaches = soon <= .65 && d <= (o.reach || 2.8) + .6;
      if (reaches && !imminent || reaches === imminent && soon < soonest) {
        face = o; soonest = soon; imminent = reaches;
      }
      if (reaches) {
        const angle = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (firstAngle === null) firstAngle = angle;
        else {
          // 正面の一人だけとの比較では、左右から挟む二本の刃を見落とす。
          // 向きの折り返しをそろえ、届く刃全体の開きで退く判断をする。
          const turn = Math.atan2(Math.sin(angle - firstAngle), Math.cos(angle - firstAngle));
          leftAngle = Math.min(leftAngle, turn); rightAngle = Math.max(rightAngle, turn);
          if (rightAngle - leftAngle > Math.PI / 3) crossed = true;
        }
      }
    }
    // 振りの切れ目にも、間合いまで来た追手へ背を向けない。順番待ちや壁越しの兵は除く。
    if (!face) {
      let nearest = Infinity;
      for (const o of b.army.units) {
        if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.rearWound || o.noTarget ||
            o.isStruct || o.group?.hidden || o.playerQueue || o.target !== u ||
            (!o.sidearm && (o.type === 'gun' || o.type === 'bow')) || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d >= nearest || d > (o.reach || 2.8) + 1.5 || b.army.wallBetween(o.pos, -1, u.pos,
            (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
        nearest = d; face = o;
      }
    }
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false; inp.guardHold = false;
    if (p.lock) inp.e.add('KeyQ');
    // 傷や気力で駆け足は制限されない。追手が離れても出口まで走る。
    // 息を戻すのは退路の途中ではなく、安全な待ち場に着いてから。
    if (!face) {
      inp.runHeld = moving;
      return;
    }
    // 構え・回避は廃止済み。追手を待ち受けず、戸口まで調べた道を駆ける。
    // 向き直っても退路への棒を保ち、背や横の刃から離れる。
    inp.runHeld = moving;
    const uncovered = p.guardBroken > 0 ||
      Math.cos(Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z) - u.heading) <= .25;
    // 追うだけの兵へ構え続けると、長い退路で歩みと気力を失う。
    // 向きは追手へ残し、刃が届く前だけ構える。背や横には向き直る余裕を取る。
    const guardLead = Math.cos(Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z) - u.heading) < .5 ? 1.3 : .9;
    inp.guardHold = soonest <= guardLead;
    p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
    if (moving) {
      inp.k.delete('KeyW');
      // 八方向へ丸めると、追手へ向くたびに退路からそれ、狭い戸口の柱へ寄ってしまう。
      // 棒の角度をそのまま保ち、刃を受けながら道の点へ下がる。
      const axis = b.honnoGuardAxis || (b.honnoGuardAxis = { x: 0, y: 0 });
      axis.x = Math.sin(p.yaw - walk); axis.y = -Math.cos(walk - p.yaw);
      inp.axis = axis;
    }
    // 二方向の刃や、振り向く前に届く刃は構えだけでは防げない。
    // 深手では正面の一撃も致命傷になる。安全に退ける時は構えだけに頼らない。
    // 道の向きへ普通の回避を使う。柱・壁・炎へ跳び込む時と気力不足の時は使わない。
    if ((crossed || uncovered || u.hp <= u.maxHp * .35) && soonest <= .35 &&
        Math.hypot(face.pos.x - u.pos.x, face.pos.z - u.pos.z) <= (face.reach || 2.8) + .6 &&
        !p.mounted && !u.climb &&
        !(p.knockT > 0) && p.dodgeT <= -.3 &&
        p.sta >= 20 + (u.hp <= u.maxHp * .35 || p.guardBroken > 0 ? 0 : p.maxSta * .15)) {
      if (retreatDodge(b, inp, moving ? walk : p.yaw + Math.PI, honnoRetreatDodgeAllowed)) {
        inp.runHeld = true;
      }
    }
  };
  const fight = (r, post = null) => {
    // 追う半径と、受ける刃の届く範囲は分ける。深手の時の半径一歩半でも、三歩先の槍を受ける。
    // 味方へ振る兵へ向き直らず、自分へ先に届く刃を受ける。
    let attacker = null, impact = Infinity;
    for (const o of b.army.threats || []) {
      if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct ||
          Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const atk = o.atk?.target === u && !o.atk.ranged && !o.atk.bow;
      const swing = o.swing?.target === u && !o.swing.done;
      const charge = o.charging && o.target === u;
      if (!atk && !swing && !charge) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d > 8 || b.army.wallBetween(o.pos, -1, u.pos,
          (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
      const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
      if (soon < impact) { attacker = o; impact = soon; }
    }
    // 構えを解いて反撃する間は、届く相手を保つ。別の兵への向き直りで突きを取り消さない。
    const e = attacker || strikeTarget(b, r);
    if (!e) return false;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 火の入った広間の中の敵は、届く所まで来た時だけ受ける。追って火の中へ入らない。
    const HZ = F.heatZone;
    if (!attacker && HZ && d > 2.4 && e.pos.x > HZ.x0 - 0.5 && e.pos.x < HZ.x1 && e.pos.z > HZ.z0 && e.pos.z < HZ.z1) return false;
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.3 : 2.4;
    if (!attacker && d > reach) {
      // 守りの輪から出て敵を追わない。門の外へ出ると、後続の槍に囲まれる。
      const outside = F.step >= 3 ? e.pos.x <= NIJO_GATE.x : e.pos.x >= GATES.main.x;
      if (post && (outside || Math.hypot(e.pos.x - post.x, e.pos.z - post.z) > 7)) {
        goTo(p, inp, post.x, post.z, 2);
        return true;
      }
      goTo(p, inp, e.pos.x, e.pos.z, reach);
    }
    // 構えと連打を重ねると、気力の重い払いになり、受ける力もなくなる。
    // 振りかぶりを受け、隙には構えを解いてから軽い突きを出す。
    patientStrike(p, inp, e, d);
    return true;
  };
  // 移る道：人と同じ道の印（見通せる角を順に示す）をたどる。二秒進まなければ道の点を見通しで選び直す。
  const moveRoute = () => {
    // 上様より先に着いたら、着き場の口に立ち塞がらず、部屋の奥（道の先へ二歩半）で待つ。
    const pts = MOVES[F.mv].pts, end = pts[pts.length - 1], prev = pts[pts.length - 2];
    if (Math.hypot(u.pos.x - end[0], u.pos.z - end[1]) < 6 && NB?.alive && Math.hypot(NB.pos.x - end[0], NB.pos.z - end[1]) > 4) {
      const l = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
      goTo(p, inp, end[0] + (end[0] - prev[0]) / l * 2.5, end[1] + (end[1] - prev[1]) / l * 2.5, 0.5);
      return;
    }
    const g = F.mvGuide;
    if (!(b.t - (b.mvT ?? -9) <= 2)) { b.mvStuck = Math.hypot(u.pos.x - (b.mvX ?? 1e9), u.pos.z - (b.mvZ ?? 1e9)) < 0.6; b.mvT = b.t; b.mvX = u.pos.x; b.mvZ = u.pos.z; }
    if (!b.mvStuck && g && Math.hypot(g.x - u.pos.x, g.z - u.pos.z) > 0.6) goVia(g.x, g.z, 0.3);
    else follow('m6' + F.mv, MOVES[F.mv].pts);
  };
  inp.guardHold = false;
  const NB = F.nb, hp = F.hp || 0;
  // 移る間に上様が寄せ手を追って道を外れたら（道の線から五歩より先）、上様の方へは下がらず道をたどる。
  // 一人で道の外へついて行くと、築地の際で囲まれる。上様は道へ戻れば後から来る。
  // 落ちる段の道：北の廊下（または御殿の北）にいれば、廊下の北の口から外へ出て裏門へ。居室の中なら西の口から。
  // 一度決めた道は変えない（口の際で二つの道を行き来しない）。
  if (hp === 8 && !b.h8Key) b.h8Key = u.pos.z < 83.4 && u.pos.x < -58 ? 'h8n' : 'h8';
  const h8Key = b.h8Key || 'h8';
  let nbOff = false;
  if (hp === 6 && F.mv && NB?.alive) {
    const pts = MOVES[F.mv].pts;
    let gap = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const s = Math.max(0, Math.min(1, ((NB.pos.x - a[0]) * dx + (NB.pos.z - a[1]) * dz) / l2));
      gap = Math.min(gap, Math.hypot(NB.pos.x - a[0] - dx * s, NB.pos.z - a[1] - dz * s));
    }
    nbOff = gap > 5;
  }
  // 炎の広間では斬り合いや手当てより先に退く。火の中で止まって体力を失わない。
  const heatZone = F.heatZone;
  if (hp === 7 && heatZone && u.pos.x > heatZone.x0 && u.pos.x < heatZone.x1 && u.pos.z > heatZone.z0 && u.pos.z < heatZone.z1) {
    guardGuide(b);
    inp.leftPressed = false; inp.runHeld = false; inp.chargeHold = false;
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, F.guardGuide.x, F.guardGuide.z, 0.3); return;
  }
  // 味方の陰で布を巻ける時は、退く段でも先に巻く（退く段は共通の退避を使わないため、ここで押す）。
  if (p.treatmentReady && u.hp < u.maxHp * 0.6 && !(F.T?.heatWarm > 0)) {
    inp.leftPressed = false; inp.runHeld = false; inp.chargeHold = false;
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    if (p.lock) inp.e.add('KeyQ');
    inp.k.add('KeyE'); return;
  }
  // 歩き続けると手当ての札が出ない。守りの持ち場の味方の陰だけで、被弾後の六秒を待つ。
  // 移る途中・裏門への退路・火の中では止まらず、待ちも十秒で切り上げる。
  const restKey = hp * 10 + (F.step || 0);
  const restPost = (hp === 5 || hp === 7) && NB?.alive ? NB.pos
    : (F.step === 3 || F.step === 4) ? F.nPost : null;
  const canRest = restPost && u.hp < u.maxHp * .6 && p.treatmentLeft > 0 && p.treatmentNext <= b.t &&
    !(F.T?.heatWarm > 0) && !(heatZone && u.pos.x > heatZone.x0 && u.pos.x < heatZone.x1 &&
      u.pos.z > heatZone.z0 && u.pos.z < heatZone.z1) &&
    Math.hypot(u.pos.x - restPost.x, u.pos.z - restPost.z) < (F.step >= 3 ? 18 : 6) &&
    !b.army.nearestEnemy(u, 8, (o) => !o.fleeing && !o.noTarget && !o.isStruct && !o.civ &&
      Math.abs(o.pos.y - u.pos.y) <= 3 && !b.army.wallBetween(u.pos, -1, o.pos)) &&
    b.army.units.some((o) => o !== u && o.alive && o.team === u.team && !o.fleeing && !o.noTarget &&
      !o.isStruct && !o.civ && !o.woundOut && !o.rearWound && !o.downed && !o.group?.hidden &&
      !o.group?.routed && o.type !== 'porter' && o.type !== 'dummy' && o.hp >= o.maxHp * .35 &&
      Math.abs(o.pos.y - u.pos.y) <= 2.5 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 6 &&
      !b.army.wallBetween(u.pos, -1, o.pos));
  if (canRest && !(b.honnoRestNext > b.t)) {
    if (b.honnoRestKey !== restKey) { b.honnoRestKey = restKey; b.honnoRestUntil = b.t + 10; }
    if (b.t < b.honnoRestUntil) {
      inp.leftPressed = false; inp.runHeld = false; inp.chargeHold = false;
      if (p.lock) inp.e.add('KeyQ');
      return;
    }
    b.honnoRestNext = b.t + 15;
  }
  b.honnoRestKey = null;
  // 燃える堂・回廊の中で一秒半熱を受け続けたら、斬り合いと上様の陰で足を止めず、道の点を走って火の外へ出る。
  // 熱は構えで受けられない。近い敵へ反撃して足を止めず、道へ退きながら刃を受ける。
  const Z = F.heatZone;
  const inZone = !!(Z && u.pos.x > Z.x0 && u.pos.x < Z.x1 && u.pos.z > Z.z0 && u.pos.z < Z.z1);
  const hot = (F.T?.heatWarm || 0) > 0 || inZone;
  if (!hot) b.botHotAt = 0; else if (!b.botHotAt) b.botHotAt = b.t;
  // 広間の火は一秒に七分を削る。入ったらすぐ出る。
  if (hot && b.t - b.botHotAt > (inZone ? 0.3 : 1.5) && (hp === 4 || hp === 6 && F.mv || hp === 7 || hp === 8)) {
    inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
    const inKairo = u.pos.x > -46.5 && u.pos.x < -43.5 && u.pos.z > 52 && u.pos.z < 78;
    if (hp === 4) follow(u.pos.z > 58 && !inKairo ? 'h4n' : 'h4', u.pos.z > 58 && !inKairo ? HONDO_BOT_NIWA : HONDO_RETREAT_PATH);
    else if (hp === 6) follow('m6' + F.mv, MOVES[F.mv].pts);
    // 遊ぶ人に出す道の印と同じ出口へ。廊下から燃える広間の固定点へ戻らない。
    else if (hp === 7) goVia(F.guardGuide.x, F.guardGuide.z, 0.3);
    else follow(h8Key, HONNO_BOT_PATHS[h8Key]);
    guardMove();
    return;
  }
  // 二人に同時に打ち込まれたら、構えたまま味方の側へ下がる（共通の退き方を二秒使う）。
  // 寺の中は狭く、二方向の一撃は構えで受けきれない。
  let pair = 0;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        !(o.atk?.target === u && !o.atk.bow || o.swing?.target === u && !o.swing.done) ||
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 3.5) continue;
    if (++pair >= 2) { b.botSurviveUntil = b.t + 2; break; }
  }
  // 深手の時は道を開けに先へ出ず、上様の陰（寄せ手の反対側）で届く敵だけを受ける。
  // 一人で前へ出ると、裏手や廊下の寄せ手に深手のまま囲まれる。
  // 本堂で上様の前に立つ間（hp 5）は、侍の列へ斬り込まず、上様のそばで寄る者だけを払う。
  // 移る間は、寄る敵へ向いて構えたまま道の印へ下がり続ける。
  if (hp === 6 && F.mv && NB?.alive) {
    // 主君から離れた時は、前進用の終点や待ち場より戻る道の印を優先する。
    if (F.escortShown) { goVia(F.mvGuide.x, F.mvGuide.z, 0.3); guardMove(); return; }
    moveRoute(); guardMove(); return;
  }
  if ((hp === 5 || hp === 7 && u.hp < u.maxHp * 0.6) && NB?.alive) {
    const foe = b.army.nearestEnemy(NB, 12, (o) => !o.fleeing && !o.noTarget && !o.isStruct);
    let x = NB.pos.x, z = NB.pos.z;
    if (foe) { const dx = NB.pos.x - foe.pos.x, dz = NB.pos.z - foe.pos.z, l = Math.hypot(dx, dz) || 1; x += dx / l * 2.5; z += dz / l * 2.5; }
    // 二人に打ち込まれたか深手で上様から離れた時は、斬り合いを続けず、構えたまま上様の陰へ下がる。
    // 寄せ手の厚い所で一人で受け続けると、横と背から削られる。
    const far = Math.hypot(x - u.pos.x, z - u.pos.z);
    // 御殿の中は壁越しの上様へ直に下がらず、襖の口を通る道の印へ。
    if (hp === 5 && !F.hondoDirect) {
      goTo(p, inp, F.hondoGuide.x, F.hondoGuide.z, 0.3); guardMove(); return;
    }
    if (hp === 7 && !guardClear(b, x, z)) { x = F.guardGuide.x; z = F.guardGuide.z; }
    if ((b.botSurviveUntil > b.t || u.hp < u.maxHp * 0.4) && far > 2) {
      // 御殿では塀越しの敵へ構えて直進せず、見える戸口を通って陰へ退く。
      goVia(x, z, 0.5); guardMove(); return;
    }
    if (fight(1.8, NB.pos)) return;
    goTo(p, inp, x, z, hp === 7 && x === F.guardGuide.x ? 0.3 : 1); return;
  }
  if (hp === 1) { goTo(p, inp, F.waitPlace.x, F.waitPlace.z, 0.3); return; }
  // 門の内へ入った先鋒の中を一人で門まで走り抜けない。馬廻の後ろ（門から九歩）で構え、
  // 届く敵だけを受ける。門は近くの者が閉める。
  if (hp === 2 && F.patrolDistance <= 12 && F.scouts && !gone(F.scouts) && F.scouts.units.some((o) => o.alive && !o.fleeing && !o.woundOut &&
      Math.abs(o.pos.y - u.pos.y) < 3 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 10 &&
      !b.army.wallBetween(u.pos, -1, o.pos))) {
    if (fight(1.8)) return; goTo(p, inp, -44, 54, 1.5); return;
  }
  if (hp === 2) { if (fight(3)) return; if (!F.gMain && Math.hypot(u.pos.x - (GATES.main.x - 1.5), u.pos.z - GATES.main.z) < 2.5) { inp.k.add('KeyE'); return; } goTo(p, inp, F.patrolGuide.x, F.patrolGuide.z, 0.3); return; }
  // 深手で門の口に立ち続けると、次の寄せ手に押し包まれる。門の内の奥へ下がり、届く敵だけを受ける。
  if (hp === 3 && u.hp < u.maxHp * 0.45 && F.patrolDistance <= 10) { if (fight(1.8)) return; goTo(p, inp, -45, 54, 1.5); return; }
  if (hp === 3) { if (fight(F.patrolDistance > 10 ? 1.8 : 11, PT.gateIn)) return; goTo(p, inp, F.patrolGuide.x, F.patrolGuide.z, 0.3); return; }
  if (hp === 4) {
    // 退く下知では、近い敵への反撃で道順と詰まりの確認を飛ばさない。
    // 口の手前でも足を止めず、道の点へ歩きながら追手の刃を受ける。
    // 印へ歩いても二秒進まない時（人や柱に掛かった・燃える回廊の中）は、本堂への道の点をたどり直す。
    if (!(b.t - (b.h4T ?? -9) <= 2)) { b.h4Stuck = Math.hypot(u.pos.x - (b.h4X ?? 1e9), u.pos.z - (b.h4Z ?? 1e9)) < 0.6 && Math.hypot(u.pos.x - F.hondoGuide.x, u.pos.z - F.hondoGuide.z) > 1; b.h4T = b.t; b.h4X = u.pos.x; b.h4Z = u.pos.z; }
    if (u.pos.z > 80) { goTo(p, inp, F.hondoGuide.x, F.hondoGuide.z, 0.3); guardMove(); return; }
    if (u.pos.z > 58) { follow('h4n', HONDO_BOT_NIWA); guardMove(); return; }
    if (b.h4Stuck) { follow('h4', HONDO_RETREAT_PATH); guardMove(); return; }
    goTo(p, inp, F.hondoGuide.x, F.hondoGuide.z, 0.3); guardMove(); return;
  }
  if (hp === 5) { if (fight(8, NB.pos)) return; goTo(p, inp, NB.pos.x + 1.5, NB.pos.z, 2.5); return; }
  // 道が決まるまでは上様のそばで待ち、遠い寄せ手を追わない。
  if (hp === 6) { goTo(p, inp, NB.pos.x, NB.pos.z, 2.5); guardMove(); return; }
  if (hp === 7) { if (fight(F.guardDirect && F.guardDistance < 12 ? 7 : 1.8, NB.pos)) return; goTo(p, inp, F.guardGuide.x, F.guardGuide.z, F.guardDirect ? 2 : 0.3); return; }
  // 落ちる段：口を塞ぐ者だけ斬り払い、ほかは振り切って裏門の外へ走る。
  if (hp === 8) {
    // 口の敵は馬廻へ任せ、毎回道順と詰まりを確かめながら退く。
    // 構えた退き足だけで先に戻ると、詰まりの判定も襖を破る操作も通らない。
    follow(h8Key, HONNO_BOT_PATHS[h8Key]); guardMove();
    // 一秒半進めない時は、行く手の襖・障子を一振りで破る（閉じた襖の前で立ち止まり、火に巻かれない）。
    if (!(b.t - (b.h8T ?? -9) <= 1.5)) { b.h8Stuck = Math.hypot(u.pos.x - (b.h8X ?? 1e9), u.pos.z - (b.h8Z ?? 1e9)) < 0.5; b.h8T = b.t; b.h8X = u.pos.x; b.h8Z = u.pos.z; }
    if (b.h8Stuck) { const w = HONNO_BOT_PATHS[h8Key][Math.min(b.botWp, HONNO_BOT_PATHS[h8Key].length - 1)]; p.yaw = Math.atan2(w[0] - u.pos.x, w[1] - u.pos.z); inp.leftPressed = p.cd <= 0; }
    else if (!b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.noTarget && !o.isStruct)) inp.runHeld = true;
    return;
  }
  // 深手でも守備の十八歩以内で門の味方の後ろへ。御殿の奥まで退くと守備の時計が止まる。
  if ((F.step === 3 || F.step === 4) && u.hp < u.maxHp * 0.6) {
    const x = NIJO_GATE.x + 9, z = NIJO_GATE.z - 9;
    if (Math.hypot(u.pos.x - x, u.pos.z - z) > 2) {
      // 近い敵だけへ向く退き方では、横から先に届く刃を受け損なう。
      // 寺内と同じく、見える口を通り、実際の打ち手へ構えながら下がる。
      goVia(x, z, 1.5); guardMove(); return;
    }
    if (fight(2, F.nPost)) return;
    goTo(p, inp, x, z, 1.5); guardMove(); return;
  }
  if (F.step === 3 || F.step === 4) { if (fight(5, F.nPost)) return; goTo(p, inp, NIJO_GATE.x + 3, NIJO_GATE.z, 2); return; }
  // 北の口へ落ちる下知では、追手への反撃で道順を止めない。
  // 寺から退く時と同じく、先に届く刃を受けながら北の口へ歩く。
  if (F.step === 5) {
    follow('d', HONNO_BOT_PATHS.d); guardMove();
    if (!inp.guardHold) inp.runHeld = true;
  }
};

export { honnoji };
