// ======================================================================
// 織田家編　本能寺の変（天正十年六月二日）
// 夜明け前、明智光秀の一万余りの兵が京の本能寺を囲んだ。信長はわずかな供と戦い、奥に火をかけて自害した。
// 妙覚寺にいた嫡男・信忠は二条御所に移って戦い、ここでも自害した。
// 足軽（近習寄り）の流れ（kaito 10/2「寺の中で信長と一緒に戦いたい」）：本能寺の御殿に詰める者として、甲冑を着ない小袖の信長のそばで、
// 表門→本堂→御殿の奥へ退きながら戦い、退路を開いて信長を奥へ移す。最後は史実どおり本能寺は落ち、信長の命で裏門から出て二条御所へ
// 境内の形は honno_tera.js（docs/honnoji-1582-spec.md）。この戦だけ馬には乗れない（def.noHorse）
// 信長で遊ぶ時も、寺内で戦い奥へ退いて史実の終局を迎える。
// 向き：京の町の碁盤の目。南西（-x, +z）に本能寺、北東（+x, -z）に二条御所
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, kabukimon, tobira, tsuiji, castleMat, solidSeg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildRoom } from './interior_parts.js';
import { buildTera, teraTick, breakNear, hallAt, TERA, inTera, GATES, CLIMB, PT } from './honno_tera.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { makeWeapon, poseArms } from './units.js';
import { addDeck } from './floors.js';
import { battleEvent, EVENT_FIRE_START, EVENT_RETREAT } from './battle_events.js';

import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, DAWN, dress, gone } from './b_inabayama.js';

import { camp } from './b_mid.js';

// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 本能寺の位置：今の寺町御池でなく、1582年は油小路蛸薬師の一帯（今の元本能寺町）。HIST_B（推定復元）
// 建物の細かな位置は推定。両方の遊び方で honno_tera.js の寺を使う。
const HONNO = { x: (TERA.x0 + TERA.x1) / 2, z: (TERA.z0 + TERA.z1) / 2, h: 60 }; // 寺域の大きさと各棟の位置は推定。実測値ではない。
const NIJO = { x: 54, z: -54, h: 17 };      // 二条御所
const HONNO_GATE = GATES.main;      // 本能寺の東の門
const NIJO_GATE = { x: NIJO.x - NIJO.h, z: NIJO.z };          // 二条御所の西の門
const NIJO_BACK = { x: NIJO.x, z: NIJO.z - NIJO.h };          // 二条御所の北の口（落ちる口）
const OUT = { x: NIJO.x + 4, z: -118 };                        // 落ちのびる先（北の町はずれ）
const STREETS = [-81, -27, 27, 81];         // 通りの筋（東西・南北とも。町と町の間を通る）
import { jinkeiBuild, jinkeiPoint } from './jinkei.js';

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
const AKECHI = { flag: 'akechi' };
const HONNO_DAWN = { ...DAWN, sky: 0x343d50, fog: 0x30394a, top: 0x1c2539,
  sun: 0x9eb0d0, hs: 0x8494b4, sunI: 0.18, hI: 0.45, glow: 0.08 };

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
  watari: { name: '渡り廊下を行く', note: '近い。ただ火が本堂から移りやすい', burn: ['watari'], pts: [[-55, 47], [-56, 49], [-57, 50.6], [-61.5, 50.6], [-62.4, 47.2], [-63.8, 46], [-66, 47], [-68, 51], [-68, 70], [-68, 79], [-68, 80.6], [-68, 82.2], [-64, 86], [-61, 89]] },
  niwa: { name: '中庭を突っ切る', note: '開けていて速い。ただ鉄砲に撃たれやすい', burn: ['kairo2'], pts: [[-50, 49], [-50, 51], [-50, 54], [-51, 66], [-52, 75], [-52, 80], [-52, 82.2], [-54, 86], [-55, 89]] },
  urate: { name: '裏手を回る', note: '遠回り。細い道で、少しずつしか来られない', burn: [], pts: [[-52, 44], [-52, 41.5], [-52, 38], [-62, 37], [-70, 38], [-70.5, 50], [-70.5, 70], [-70.5, 79], [-71, 80.6], [-71, 82.2], [-67, 86], [-63, 89]] },
  shukubo: { name: '宿坊を抜ける', note: '狭い部屋を抜ける。火が迫っている', burn: ['shukuboA'], pts: [[-48, 46], [-44, 50], [-40, 58], [-35.5, 64.5], [-35.5, 68.5], [-38.5, 70], [-41, 70], [-44, 71.5], [-46.5, 80], [-47.5, 88], [-50.5, 88], [-55, 89]] },
  kairo: { name: '回廊を行く', note: '屋根があり守りやすい。詰まりやすい', burn: ['kairo1', 'kairo2'], pts: [[-48, 49.4], [-45.5, 53], [-45, 58], [-45, 70], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2], [-55, 86], [-57, 89]] },
};
// 御殿の口（最終防衛で明智が入ってくる所）
const GOTEN_IN = {
  north: [[-52, 72], [-52, 80], [-52, 82.2], [-54, 86]],
  east: [[-44, 88], [-48, 88], [-50.5, 88], [-53, 88.5]],
  south: [[-61, 101], [-61, 96.5], [-61, 93]],
  west: [[-76, 86], [-75, 90], [-72, 90], [-70, 90]],
};
const NBK = { A: 1.6, B: 4, C: 7.5, D: 5, E: 5.5 };   // 信長の間合い（状態ごと）
// 居室から控えの間の襖、北の廊下、回廊の順に出る。門へ直進すると御殿の壁に残る。
// 見回りも出口と曲がり角を順に通す。御殿の壁越しに表門へ直進させない。
// 寝込みを襲われる始まり：御殿の廊下（控えの間の前）から、廊下を東へ抜け、回廊を通って表門へ走る。
const PATROL_PATH = [[PT.start.x, 82.2], [-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 54], [-40, 50], [PT.gateIn.x, PT.gateIn.z], [GATES.main.x - 1.5, GATES.main.z]];
// 足軽は表門の内側から見回る。回廊の遠回りで、最初の寄せ手とすれ違わせない。
const PATROL_START = { x: PT.start.x, z: PT.start.z };
// 開いた表門を抜けた少人数が、門の内側の持ち場へ寄せる。
// 外の備えから三人だけ替える。塀・宿坊・回廊の柱を横切らず、三〜七歩でぶつかる。
const PATROL_SKIRMISH = [[GATES.main.x - 2, GATES.main.z], [PT.gateIn.x, PT.gateIn.z], [-40, 50]];

// 人の幅を含めて壁・柱・建物を確かめる。道案内だけ半秒ごとに使う。
function patrolClear(rt, x, z) {
  const p = rt.player.u.pos, q = rt.flags.patrolProbe;
  q.x = x; q.z = z; q.y = p.y;
  if (rt.army.wallBetween(p, -1, q)) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / 0.25));
  for (let j = 1; j <= steps; j++) {
    const px = p.x + (x - p.x) * j / steps, pz = p.z + (z - p.z) * j / steps;
    if (!rt.world.walkable(px, pz, p.y)) return false;
    for (const w of rt.army.solids) {
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

// 表門側から回廊を進んだ後続。曲がり角や柱の裏へ置かず、見える六〜十メートル先へ出す。
// 倒れていない先鋒が遠くに残っても、近い斬り合いを止めない。調べるのは切れ目の時だけ。
function patrolReinforce(rt) {
  const p = rt.player.u.pos, guide = rt.flags.patrolGuide;
  let alive = 0;
  for (const u of rt.army.units) if (u.alive) alive++;
  // 枠が埋まっている時は次の半秒で調べ直す。待ちの波を重ねて予約しない。
  if (alive + 2 > 240) return;
  for (let i = PATROL_PATH.length - 1; i > 0; i--) {
    const a = PATROL_PATH[i - 1], b = PATROL_PATH[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    // 門に近い側から探し、見回りの道を逆向きに来る先手として見せる。
    for (let along = length; along >= 0; along -= 2) {
      const x = a[0] + dx * along / length, z = a[1] + dz * along / length;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 6 || d > 10 || x >= GATES.main.x - 1.6 ||
          (x - p.x) * (guide.x - p.x) + (z - p.z) * (guide.z - p.z) <= 0 ||
          !patrolClear(rt, x - 0.4, z) || !patrolClear(rt, x + 0.4, z)) continue;
      // 二人だけ。外の備えから人数を引き、開いた表門から入った先鋒に替える。
      const g = akechi(rt, '回廊へ寄せる明智の後続', [[x, z], [p.x, p.z]], [uA(2)], { entered: true });
      if (g) { rt.flags.scouts = g; rt.flags.patrolQuiet = 0; }
      return;
    }
  }
}

function patrolGuide(rt) {
  const F = rt.flags, p = rt.player.u.pos, end = F.hp === 1 ? PATROL_PATH.length - 2 : PATROL_PATH.length - 1;
  let best = Infinity, bestJoin = Infinity, rest = 0;
  // 通れる道への合流点から門までを足す。角を通り過ぎても手前の点へ戻さない。
  for (let i = end; i > 0; i--) {
    const a = PATROL_PATH[i - 1], b = PATROL_PATH[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
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
      F.patrolGuide.x = gx; F.patrolGuide.z = gz;
    }
    rest += length;
  }
  if (Number.isFinite(best)) F.patrolDistance = best;
}

function patrolLabel(rt) {
  const p = rt.player.u.pos, q = rt.flags.patrolGuide, dx = q.x - p.x, dz = q.z - p.z;
  return `${rt.flags.hp === 1 ? '表門へ' : '表門を閉めよ'}・${Math.abs(dx) > Math.abs(dz) ? dx > 0 ? '東へ' : '西へ' : dz < 0 ? '北へ' : '南へ'}`;
}
const NB_GATE_PATH = [[-67, 89], [-62, 89], [-62, 82.2], [-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 64], [-44, 54], [-40, 50]];

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
  const role = at.x < TERA.x0 ? 'west' : at.z < TERA.z0 ? 'north' : at.z > TERA.z1 ? 'south' : 'east';
  const host = (F.aHost || []).find((h) => h.honnoRole === role && h.left(at.x, at.z, 100) >= n)
    || (role === 'east' ? (F.aHost || []).find((h) => h.honnoRole === 'reserve' && h.left(at.x, at.z, 100) >= n) : null);
  if (!host) return null;
  const pts = host.take(at.x, at.z, n, 100, null, (x, z) => !inTera(x, z));
  if (!pts.length) return null;
  const g = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'saito', name, anchor: o.entered ? at : pts[0], facing: o.entered ? 0 : host.rotation.y,
    width: o.width || 4, aggro: o.aggro || 9, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 }, dmgMult: o.dmg ?? 1,
    order: 'path', seekRange: 22, formation: 'column', colW: 2, spacing: 1.4 }, dress(list, AKECHI));
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i], q = pts[i];
    if (!q) { rt.army.despawn(u); continue; }
    // 寺内の先鋒も外の備えから人数を引く。回廊の両側の柱を避けて二列に置く。
    const x = o.entered ? at.x + (i % 2 ? 0.4 : -0.4) : q.x;
    const z = o.entered ? at.z - Math.floor(i / 2) * 1.4 : q.z;
    u.pos.set(x, rt.world.heightAt(x, z), z);
    u.heading = o.entered ? 0 : q.yaw;
  }
  g.honnoMainEntry = role === 'east' && !o.hold && !o.entered;
  if (g.honnoMainEntry) for (const u of g.units) u.honnoEntryWant = { x: 0, z: 0 };
  // 門を破った後も、口を通ってから敵を追う。塀越しに本堂へ直進させない。
  g.entryPath = path.map((p) => [p[0], p[1]]);
  g.path = o.gate?.alive ? [g.entryPath[0]] : g.entryPath; g.pathIdx = 0;
  g.onArrive = (gg) => { if (o.gate?.alive) { gg.order = 'assault'; gg.assault = hitGate(o.gate); gg.gate = o.gate; return; } gg.order = 'attack'; gg.formation = 'line'; gg.spacing = 1.5; gg.seekRange = o.seek || 24; if (o.nb && F.nb && F.nb.alive) gg.focus = F.nb; };
  if (o.hold) { g.order = 'hold'; g.anchor = { x: at.x, z: at.z }; g.formation = 'line'; g.aggro = o.aggro || 30; }
  else g.order = 'path';
  if (o.nb && F.nb && F.nb.alive && g.order !== 'path') g.focus = F.nb;
  F.foes.push(g);
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
  rt.army.play('eshout', { x: x + 3, z }, 1.1);
  rt.world.gunSmoke(x + 1.5, z, 0x50483e);
  if (call) rt.bark(call, true);
  return g;
}
// 寝間着の小袖（具足・笠・指物なし）
const NEMAKI = (col) => ({ kosode: 1, kosodeCol: col, flag: null, hat: 'none', horo: 0 });
const nS = (n) => ({ type: 'samurai', n, o: NEMAKI(0x2e3440) }), nA = (n) => ({ type: 'ashigaru', n, o: NEMAKI(0x4a463e) });
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
// 門の扉（開いた二枚の扉。閉めると army の struct になる）
function openLeaves(W, x, z, w) {
  const g = tobira(W, x, z, w, Math.PI / 2, { h: 3.1 });
  g.userData.open();
  return g;
}
function closeGate(rt, by) {
  const F = rt.flags, W = rt.world, gm = GATES.main;
  if (F.gMain || F.ending || rt.over || F.hp !== 2) return;
  for (const u of rt.army.units) if (u.alive && Math.abs(u.pos.x - gm.x) < 1.2 && Math.abs(u.pos.z - gm.z) < gm.w / 2) {
    if (!F.gateBlockedSaid) { F.gateBlockedSaid = true; rt.bark('門の口に人がいる。門の脇へ寄り、口を空けよ'); }
    return;
  }
  F.gMain = rt.army.addStruct({ seg: [gm.x, gm.z - gm.w / 2, gm.x, gm.z + gm.w / 2], hp: 1500, maxHp: 1500, armor: 0.5, team: 0, name: '表門' });
  F.gMain.mesh = gateDoors(W, gm.x, gm.z, gm.w, 0); rt.scene.add(F.gMain.mesh);
  if (F.leaves) F.leaves.visible = false;
  rt.uninteract('gate');
  rt.army.play('wood', gm, 1.2);

  if (by === 'me') { rt.award((t) => t.side.push('表門を閉めた'), '表門を閉めた'); honnoSay(rt, '森蘭丸', 'よう閉めた！　閂を下ろせ！', 2.5); }
  else honnoSay(rt, '門番', '閂を下ろした！　門を押さえよ！', 2.5);
}
function smallGate(rt, gd, hp) {
  const s = rt.army.addStruct({ seg: gd.side === 'n' || gd.side === 's' ? [gd.x - gd.w / 2, gd.z, gd.x + gd.w / 2, gd.z] : [gd.x, gd.z - gd.w / 2, gd.x, gd.z + gd.w / 2], hp, maxHp: hp, armor: 0.5, team: 0, name: gd.name });
  s.mesh = gateDoors(rt.world, gd.x, gd.z, gd.w, gd.side === 'n' || gd.side === 's' ? Math.PI / 2 : 0); rt.scene.add(s.mesh);
  return s;
}
// 燃える棟の上に、屋根の棟に沿った大きな炎と煙の柱（world.addBlaze）。一棟に一度だけ。
function blaze(rt, id) {
  const F = rt.flags, r = F.T?.G.byId[id];
  if (!r || (F.blazes ||= {})[id]) return;
  F.blazes[id] = rt.world.addBlaze(r.x, r.z, { w: r.w || 8, d: r.d || 6, h: r.top || 4, rot: r.rot || 0 });
}
// 火の段（1〜6）
function fireStage(rt, n) {
  const F = rt.flags, T = F.T, W = rt.world;
  if ((F.fireSt || 0) >= n) return;
  F.fireSt = n;
  const ig = (id, why) => { T.fire.ignite(id, why); blaze(rt, id); };
  if (n === 1) { ig('soboN', '出火の原因は不明'); rt.bark('表の宿坊から火が出た！', true); }
  if (n === 2) { ig('kairo1', '宿坊からの延焼'); rt.bark('火が回廊へ移った', true); rt.after(8, () => { if (!F.ending) rt.bark('回廊が火に包まれた。もう通れぬ', true); }); }   // 火が育ってから「通れぬ」と言う（B117）
  if (n === 3) { F.smoke = 1; W.distMul = F.dm0 * 0.7; rt.bark('煙が境内に広がる。遠くが見えぬ'); }
  if (n === 4) { ig('hondo', '延焼'); ig('kairo2'); ig('shukuboA'); rt.bark('本堂に火が回った！　宿坊も燃えている', true); }
  if (n === 5) { F.smoke = 2; W.distMul = F.dm0 * 0.42; rt.bark('煙で、敵と味方の見分けがつかぬ'); }
  if (n === 6) {
    // 御殿の東の広間に火が入る：広間は熱で入れず、守る所は控えの間と居室だけになる
    F.heatZone = { x0: -57, x1: -49, z0: 83.2, z1: 95 };
    for (const [x, z] of [[-53, 86], [-51, 92], [-55, 93]]) W.addFire(x, z, { size: 1.6, h: 0.3 });
    W.addSmokeColumn(-53, 6, 89, { size: 2.5 });
    solidSeg(-57, 88.1, -57, 89.9, 0.12);   // 広間と控えの間の間の口は火で塞がる
    rt.bark('広間に火が入った！　控えの間まで退け', true);
  }
}
function teleport(rt, x, z) {
  const P = rt.player.u, W = rt.world, dx = x - P.pos.x, dz = z - P.pos.z;
  for (const g of rt.squadGroups || []) { for (const u of g.units) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; } if (g.anchor) { g.anchor.x += dx; g.anchor.z += dz; } }
  for (const u of rt.tomoUnits || []) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; }
  P.pos.x = x; P.pos.z = z; P.pos.y = W.heightAt(x, z);
}

const honnoji = {
  jinkei: [HONNO_ATTACK, HONNO_DEFEND],
  armySignals: false, // 不意の襲撃。野戦の法螺貝・太鼓と合図の知らせを使わない。
  noAllyReports: true, // 寺の中の声は使番に運ばせない（遅れて届く「○○殿より」を出さない）。
  noWake: true, // 寺の各口へ出す波だけを実兵にし、外の囲みと自動増援を重ねない。
  enemyTactics: { flank: false }, // 狭い境内では野戦の大回りで塀の外へ出ず、各口から攻める。
  botOrders: true, // 守り・退き口の道を、人ごとの突進で上書きしない。
  botEvacuating: (rt) => !rt.G.lord && rt.flags.hp === 8,
  prelude: false,   // 静かな寺に突然の襲撃：溜めない（prelude.js）
  spawn: { x: PATROL_START.x, z: PATROL_START.z, heading: Math.PI / 2 },
  noHorse: true,   // 本能寺の変だけは馬に乗れない（kaito 10/2。寺の中で戦う）
  world: {
    seed: 1582 + 6,
    time: 'night',       // 襲撃は夜明け前。夕焼けではなく青い闇から始める
    wind: [0.4, -1],
    nightLift: 0,      // 携帯でも足もとと門が見える明るさ
    fogFar: 200,
    muddy: 0,
    // 通りは境内と堀の手前で切り、寺の庭を町の道が横切らないようにする。
    paths: [...STREETS.flatMap((s) => s > TERA.x0 - 4 && s < TERA.x1 + 4 ? [[[s, -170], [s, TERA.z0 - 4]], [[s, TERA.z1 + 4], [s, 170]]] : [[[s, -170], [s, 170]]]),
      ...STREETS.flatMap((s) => s > TERA.z0 - 4 && s < TERA.z1 + 4 ? [[[-170, s], [TERA.x0 - 4, s]], [[TERA.x1 + 4, s], [170, s]]] : [[[-170, s], [170, s]]])],
    height,
    // 先頭の道だけでは後列が塀へ斜めに寄る。各兵も表門の芯を通す。
    moveWay(army, u, want) {
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
      // 境内は白っぽい砂利、町は土の道
      // 境内は掃き清めた白っぽい砂利（草は生えない：色から草の割合を読むので緑を残さない）
      if (inTera(x, z)) { const v = 0.55 + 0.03 * Math.sin(x * 0.7) * Math.cos(z * 0.9); c.setRGB(v + 0.02, v, v - 0.05); return; }
      const onSt = STREETS.some((s) => Math.abs(x - s) < 4 || Math.abs(z - s) < 4);
      if (onSt) c.lerp({ r: 0.52, g: 0.47, b: 0.38 }, 0.5);
    },
    clear: (x, z) => inTera(x, z, 6) || (Math.abs(x) < 130 && Math.abs(z) < 150),
    trees: 160,
    tufts: 1400,
    treeDensity: (x, z) => (inTera(x, z, 6) ? 0 : Math.abs(x) < 140 && Math.abs(z) < 160 ? 0.02 : 0.6),
    groves: [{ x: HONNO.x - 6, z: HONNO.z + 8, r: 6, n: 6 }, { x: NIJO.x + 6, z: NIJO.z + 6, r: 6, n: 6 }],
    camPull: 1.0,
    fleeOut: (x, z) => Math.abs(x) > 170 || Math.abs(z) > 170,
  },

  setup(rt) {
    // この戦では倒れた者を即座に担ぎ起こして戦線へ戻さない。
    rt.flags.rescued = true; rt.firstBattle = false;
    // 馬には乗れない（信長で遊ぶ時も）。降ろして、空馬も取らせない
    const P0 = rt.player;
    if (P0.mounted) { rt.army.setMounted(P0.u, false); P0.mounted = false; }
    P0.canRide = false; P0.updateTake = () => {};
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
        if (inCompound(x, z)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    rt.scene.add(well(W, -8, 62), kido(W, -27, 40, Math.PI / 2), well(W, -74, 57));
    // 寺の周りの路地：町ごとの木戸（夜は閉まる）と共同の井戸を、蛸薬師通りの両側に足す
    rt.scene.add(kido(W, TERA.x0 - 7, 36, 0), kido(W, TERA.x0 - 7, 96, 0), kido(W, -27, 78, Math.PI / 2), kido(W, -27, 104, Math.PI / 2), kido(W, TERA.x0 - 13, 66, 0), kido(W, -10, 90, Math.PI / 2));
    rt.scene.add(well(W, TERA.x0 - 14, 44), well(W, TERA.x0 - 16, 90), well(W, -24, 96), well(W, -30, 20));
    // ---- 本能寺の境内（築地・門・伽藍・中のある建物）と二条御所 ----
    F.T = buildTera(rt);
    F.leaves = openLeaves(W, GATES.main.x, GATES.main.z, GATES.main.w); rt.scene.add(F.leaves);
    F.gSide = smallGate(rt, GATES.side, 900);
    F.gKatte = smallGate(rt, GATES.katte, 700);
    NIJO.back = 'n';
    // 二条御所の塀も材質ごとの BatchedMesh にまとめ、描く回数を減らす
    const wallBatch = makeKitBatch();
    F.nwall = compound(rt, NIJO, 'w', 7, wallBatch);
    finalizeKitBatch(rt, wallBatch);
    rt.scene.add(kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    // 二条御所は戦国期の御殿。後の二条城の天守・石垣は置かない。広間と奥の間は推定。
    F.nijoRoom = buildRoom(rt, NIJO.x + 2, NIJO.z - 2, { w: 16, d: 11, kind: 'goten', rot: -Math.PI / 2, night: true });
    F.nijoRoom.inside.name = '二条御所'; F.nijoRoom.inside.where = '二条御所の奥の間';
    hut(W, NIJO.x - 6, NIJO.z + 10, 8, 5, 0, { batch: hutBatch });
    buildNearbyChurch(rt, hutBatch);
    finalizeSimpleBatch(rt, hutBatch);
    for (const [x, z] of [[NIJO.x - 10, NIJO.z - 6], [NIJO.x - 10, NIJO.z + 6], [NIJO.x + 10, NIJO.z + 10]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    rt.scene.add(nobori(W, -44, 56, 'oda', 5), nobori(W, -47.5, 88, 'eiraku', 4.5));
    // ---- 外周を封じる明智の大軍（軽い作り）。築地の外の通りを埋める ----
    F.aHost = buildSonae(rt, [HONNO_ATTACK]);
    F.ehon = camp(rt, { x: -104, z: 120, facing: Math.PI * 0.75, team: 1, faction: 'saito', mon: 'akechi', armor: 0x2a2a30, general: { name: '明智光秀', hat: 'kabuto_m', haori: 0x3a3a5a }, guard: 15, reserve: 0, runTo: { x: -86, z: 100 } });
    for (const [x, z] of [[-24, 40], [-24, 62], [TERA.x0 - 5, 50], [TERA.x0 - 5, 95], [-60, 112], [-40, TERA.z0 - 8]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[-20, 56], [TERA.x0 - 7, 60], [-50, 114], [-62, TERA.z0 - 8]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    if (F.ehon.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    // ---- 寺の中の者：信長・小姓衆・馬廻と中間・僧 ----
    F.nbG = allyGroup(rt, { fixed: true, name: '織田信長', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[0]), facing: Math.PI / 2, width: 1, aggro: NBK.A, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '織田信長', kosode: 1, kosodeCol: 0xebe5d6, obi: 0x2e3448, flag: null, horse: false, keep: true } }]);
    F.nb = F.nbG.units[0];
    // 小袖の一人の人として、通常の傷を受ける。名前で体力を増やさない。
    F.nbG.defMult = 1;
    F.nb.maxHp = F.nb.hp = 75; F.nb.dmg = 13; F.nb.isOfficer = false; F.nb.isLord = false;
    F.nbWeapons = { bow: makeWeapon('bow'), spear: makeWeapon('spear', 0, 'su') };
    nbWeapon(rt, 'bow');
    F.nb.range = 0;   // 寝所では弓を番えない（表へ出て、門の内で射る）
    F.kosho =allyGroup(rt, { fixed: true, name: '森蘭丸と小姓衆', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[1]), facing: Math.PI / 2, width: 3, aggro: 7, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 1, o: { name: '森蘭丸', kosode: 1, kosodeCol: 0x5a3a2e, obi: 0x6a2a24, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森坊丸', kosode: 1, kosodeCol: 0x3a4458, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森力丸', kosode: 1, kosodeCol: 0x4a4038, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '高橋虎松', kosode: 1, kosodeCol: 0x2e3a4a, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '菅屋角蔵', kosode: 1, kosodeCol: 0x2e3a4a, flag: null, horse: false } }]);
    F.kosho.defMult = 1;
    F.ran = F.kosho.units[0];
    F.uma = allyGroup(rt, { fixed: true, name: '馬廻と中間', anchor: jinkeiPoint(HONNO_DEFEND, HONNO_DEFEND.sonae[2]), facing: Math.PI / 2, width: 6, aggro: 8, noRout: true, fullStrength: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3, o: { ...NEMAKI(0x4a463e), keep: true } }, { type: 'ashigaru', n: 3, o: { ...NEMAKI(0x5a5244), keep: true } }], ODA));   // 具足は宿直の侍二人だけ。ほかは寝間着の小袖に槍
    F.uma.defMult = 1;
    // 供の者はそれぞれ持ち場（本堂の縁・回廊・御殿の廊下の口・勝手口の内）に詰め、そこで戦って倒れる。上様の後ろに固まらない。
    F.posts = [
      ['本堂の縁の守り', { x: -44.5, z: 46 }, Math.PI / 2, [uS(1), nA(2)]],
      ['回廊の守り', { x: -45, z: 63 }, Math.PI / 2, [nA(2)]],
      ['御殿の廊下の守り', { x: -52, z: 79 }, Math.PI, [nS(1), nA(2)]],
      ['勝手口の守り', { x: -47, z: 98 }, 0, [nA(2)]],
    ].map(([name, anchor, facing, list]) => {
      const g = allyGroup(rt, { fixed: true, name, anchor, facing, width: 3, aggro: 8, noRout: true, fullStrength: true, formation: 'line' }, dress(list, ODA));
      g.defMult = 1;
      return g;
    });
    F.monks = allyGroup(rt, { fixed: true, name: '寺の僧', anchor: { x: -52, z: 62 }, facing: 0, width: 3, aggro: 0, noRout: true, fullStrength: true },
      [{ type: 'porter', n: 3, o: { kosode: 1, bozu: 1, kosodeCol: 0x2a2826, flag: null } }]);
    F.monks.civ = true;
    for (const u of F.monks.units) { u.noTarget = true; u.invuln = true; }
    // 自分の組は、狭い寺の中なので四人まで（室内に一度に入れる数を絞る）
    const n = RANKS[rt.G.rank].squad;
    // 自分の組も寝込みを襲われた者：具足を着る間は無く、寝間着の小袖に槍だけを取って飛び出す
    if (n) {
      const spawn0 = rt.army.spawn;
      rt.army.spawn = (g, list, ...rest) => spawn0.call(rt.army, g, list.map((q) => ({ ...q, o: { ...(q.o || {}), ...NEMAKI(0x3e3a34) } })), ...rest);
      try { rt.makeSquad({ x: -60, z: 77.5 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 4) }]); } finally { rt.army.spawn = spawn0; }
    }
    // 自分も寝間着の小袖のまま（具足も笠も指物も無い）。刀と槍だけを取った
    rt.after(0, () => { const u = rt.player.u; u.look = { ...u.look, kosode: 1, sohei: 1, soheiV: null, kosodeCol: 0x3a3a40, armor: 0x5a5244, lace: 0x4a4038, hat: 'none', haori: 0, menpo: 0, horo: 0, sode: false, trim: 0, real: 0, flag: null, pole: false }; });
    // 寺の外の通りを行き交う伝令の騎馬は出さない（夜明け前の京の路地は明智勢が塞いでいる。境内に馬はいない）
    rt.after(0, () => { for (const c of rt.couriers || []) rt.scene.remove(c.m); if (rt.couriers) rt.couriers.length = 0; });
    // （寺の中は狭いので、同時に打ちかかる数は既定のまま。序盤に一人で囲まれて即死しない。10/2）
    // 敵の総大将（光秀）の仕組みは使わない：寺の中に閉じ込められた戦で、味方の組が本陣へ斬り込んで勝ちになってしまう
    rt.after(0.05, () => { rt.taisho = null; });
    if (F.ehon?.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    applyLook(rt, HONNO_DAWN);
    W.timeKey = 'night'; // 夜明けの薄明を保ち、夕暮れの進行に入れない。
    // 市内へ広がる遠景：町のあちこちで鐘が鳴り、叫びが起き、火の手が上がる（本能寺の騒ぎが町へ伝わる）
    [[34, -60, -90], [48, 100, 10], [62, -30, 130], [80, 130, -70]].forEach(([t, x, z], i) => rt.after(t, () => {
      if (rt.flags.ending) return;
      sfx('kane', 0.28); rt.army.play('eshout', { x, z }, 0.8);

      if (i === 0) rt.bark('遠くの町で鐘が鳴り、人の叫びが広がる');
    }));
    rt.setPhase('brief');
    this.p1(rt);
  },

  // P1 寝込みを襲われる：夜明け前の御殿の廊下。物音、鬨の声、鉄砲。「是非に及ばず」（信長公記）
  p1(rt) {
    const F = rt.flags;
    F.hp = 1; F.pT = rt.t;
    honnoSay(rt, '', '天正十年六月二日　夜明け前　京 本能寺（油小路蛸薬師）', 3.5);
    rt.obj('main', '御殿の廊下で不寝番をせよ', 'main');
    const at = (s, f) => rt.after(s, () => { if (F.hp === 1 && !F.ending && !rt.over) f(); });
    // 供は百ほど。寺の外には一万三千の明智勢。まだ誰も知らない
    at(1.2, () => { rt.army.play('wood', { x: GATES.main.x, z: GATES.main.z }, 0.7); rt.bark('表の方で、物音がした'); });
    at(2.6, () => honnoSay(rt, '小姓', '……表が騒がしい。下々の喧嘩でござろうか', 3));
    at(4.4, () => {
      rt.army.play('eshout', { x: -20, z: 50 }, 1.7); F.honnoShoutT = rt.t;
      rt.after(0.5, () => rt.army.play('gun', { x: -22, z: 46 }, 1)); rt.after(0.9, () => rt.army.play('gun', { x: -22, z: 58 }, 0.9));
      rt.bark('鬨の声！　御殿へ鉄砲が撃ち込まれる', true);
    });
    at(6.2, () => nbSay(rt, 'これは謀反か。いかなる者の企てぞ', 3));
    at(8.2, () => honnoSay(rt, '森蘭丸', '謀反にござる！　桔梗の旗……明智が者と見え申す！', 3.2));
    at(10.8, () => { nbSay(rt, '是非に及ばず', 3); this.p2(rt); });

    F.patrolGuide = { x: PT.gateIn.x, z: PT.gateIn.z };
    F.patrolProbe = { x: 0, y: 0, z: 0 };
    F.patrolDistance = 0; F.patrolScan = 0;
    patrolGuide(rt);
    rt.player.yaw = rt.player.u.heading = Math.PI / 2;
    // 寝込みの間は行き先の印を出さない（画面をきれいに。耳で異変を知る）
    rt.marker('nb',unitPos(F.nb), () => `上様${F.nb.hp < F.nb.maxHp * 0.5 ? '（手負い）' : ''}`, { h: 2.3, person: true });
    F.monks.order = 'hold';
    // 門へ着けば異変が起きる。見回りが遅れても襲撃を一分以上待たせない。
  },
  // P2 異変：鬨の声と鉄砲。信長が起き出す
  p2(rt) {
    const F = rt.flags;
    if (F.hp >= 2) return;
    F.hp = 2; F.pT = rt.t;
    rt.setPhase('alarm');
    rt.unmark('next');
    rt.army.play('eshout', { x: -18, z: 50 }, 1.6);
    F.honnoShoutT = rt.t;
    rt.after(0.4, () => rt.army.play('gun', { x: -20, z: 50 }, 0.8));
    rt.after(1.2, () => { sfx('bellRapid', 0.5); });
    rt.bark('表門で門番の叫び。「桔梗の旗じゃ！　明智の兵が門の前に！」', true);
    // 門の外に桔梗の旗の列と松明（B115）
    for (const dz of [-12, -7, -3, 3, 7, 12]) rt.scene.add(nobori(rt.world, -23.5 + Math.abs(dz) * 0.15, 50 + dz, 'akechi', 5.5));
    for (const dz of [-9, 0, 9]) rt.world.addFire(-26, 50 + dz, { torch: true, h: 1.4 });
    rt.banner('明智光秀、謀反', '供は百ほど。寺を囲む明智勢は一万三千');
    rt.obj('main', '表門へ走り、門を閉めよ（門の口で長押し）', 'main');
    rt.objProgress('main', '上様も弓を取って表へ出られる。先に立って門を閉め、明智勢を入れるな');
    rt.addInteract('gate', { x: GATES.main.x - 1.5, z: GATES.main.z }, '表門を閉める', () => closeGate(rt, 'me'), { r: 4.5, hold: 1, prio: 1 });
    patrolGuide(rt); F.patrolScan = 0;
    rt.marker('next', F.patrolGuide, () => patrolLabel(rt), { h: 3, guidePriority: 200, guideAlways: true, alwaysDistance: true, routeDistance: () => F.patrolDistance });
    F.scouts = akechi(rt, '表門へ入った明智の先鋒', PATROL_SKIRMISH, [uS(1), uA(2)], { entered: true });
    F.patrolQuiet = 0;
    // 僧は勝手口の方へ逃げる
    F.monks.order = 'move'; F.monks.dest = { x: -44, z: 99 }; F.monks.speed = 3.2;
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
    rt.unmark('next');
    nbSay(rt, '弓を持て！　門の口で迎え撃つ', 3.5);
    rt.obj('main', '上様と共に、表門を守れ', 'main');
    rt.zone('gz', PT.gateIn.x, PT.gateIn.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: PT.gateIn.x + 1, z: PT.gateIn.z }; F.uma.aggro = 9;
    const at = (s, f) => rt.after(s, () => { if (F.hp === 3 && !F.ending) f(); });
    const wave = (name, list, o = {}) => akechi(rt, name, IN.main, list, { gate: F.gMain, ...o });
    // 門の外：明智の人垣が通りを埋めて押し寄せる。鬨の声と鉄砲、松明の火が、門の隙・屋根越しに見える
    const W3 = rt.world;
    F.gateMob = W3.addDistantArmy({ x: -14, z: 50, w: 9, d: 26, count: 80, facing: -Math.PI / 2, team: 1, armor: 0x34302a, flagTex: flagTexture('akechi'), mon: 'akechi', kind: 'mixed', seed: 15899 });
    F.gateMob.army.noWake = true;
    for (const z of [43, 57]) W3.addFire(-25.5, z, { torch: true, h: 1.5 });
    for (const z of [42, 46.5, 51, 55.5, 60]) rt.scene.add(nobori(W3, -27.5 - (z % 3), z, 'akechi', 6.5));   // 築地の上に桔梗の幟が並んで見える
    rt.bark('門の外に明智の旗が押し寄せる！　鬨の声じゃ', true);
    const roar = (n) => rt.after(3.2 + (n % 3) * 1.1, () => {
      if (F.hp !== 3 || F.ending || rt.over) return;
      rt.army.play('eshout', { x: -27, z: 46 + (n * 5) % 9 }, 1.1);
      if (n % 2) rt.army.play('gun', { x: -26, z: 44 + (n * 3) % 12 }, 0.9);
      roar(n + 1);
    });
    roar(0);
    at(1, () => wave('明智の一の手', [uS(3), uA(11)]));
    at(6, () => { F.guns = akechi(rt, '築地の外の鉄砲', [[-23, 42], [-23, 42]], [uG(4), uB(2)], { hold: true, aggro: 40 }); honnoSay(rt, '馬廻', '塀の外から鉄砲じゃ！　頭を下げよ！', 3); });
    // 塀の外から門と屋根へ火矢。三本目で火が付き、門は燃えて倒れる
    at(9, () => {
      const g = akechi(rt, '火矢を射込む弓', [[-23, 57], [-23, 57]], [uB(4)], { hold: true, aggro: 40 });
      if (g) g.fireArrows = true;
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
    sfx('taiko', 0.8);
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
    nbSay(rt, '退け！　本堂で迎え撃つ。堂の口は狭い', 3);
    rt.obj('main', '本堂へ退き、堂の口で上様をお守りせよ', 'main');
    rt.marker('next', { ...HONDO_FRONT }, '本堂', { h: 3 });
    nbSet(rt, 'D', { pts: [[-42, 47], [-45.5, 46], [-48.5, 46], [HONDO_IN.x, HONDO_IN.z]], then: 'E' });
    F.uma.order = 'hold'; F.uma.anchor = { x: HONDO_FRONT.x + 0.5, z: HONDO_FRONT.z }; F.uma.aggro = 7;
    rt.zone('hz', HONDO_FRONT.x - 2, HONDO_FRONT.z, 6);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 4 && !F.ending) f(); });
    at(4, () => akechi(rt, 'なだれ込む明智勢', IN.main, [uS(3), uA(10)]));
    at(8, () => fireStage(rt, 2));
    // 宿坊の方（勝手口）からも回り込む：止めなければ回廊を伝って本堂の横へ
    at(12, () => {
      F.flank = akechi(rt, '宿坊から回る明智勢', [...IN.katte, [-44, 90], [-44, 76], [-44, 60], [-46, 52]], [uS(1), uA(5)], { gate: F.gKatte });
      honnoSay(rt, '小姓', '勝手口にも敵じゃ！　宿坊の口を守れ！', 3);
      if (F.flank) {
        rt.obj('flank', '宿坊から回り込む明智勢を止めよ', 'side');
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
    rt.unmark('next'); rt.unzone('hz');
    nbSay(rt, 'まだ退くな！　ここで一息に押し返す。……者ども、続け', 3.5);
    rt.obj('main', '本堂の中で、上様と共に戦え', 'main');
    nbWeapon(rt, 'spear');
    nbSet(rt, 'E', { at: { x: -50.5, z: 46 } });
    F.uma.anchor = { x: -48.5, z: 46 };
    fireStage(rt, 3);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 5 && !F.ending) f(); });
    at(3, () => { akechi(rt, '裏手から来る明智勢', [...IN.climb, [-58, 37], [-52, 38], [-52, 41.5]], [uS(2), uA(4)], { nb: true }); honnoSay(rt, '森蘭丸', '北の口から！　上様のお背中じゃ！', 3); });
    at(14, () => { akechi(rt, '脇門の明智勢', [...IN.side, [-50, 38], [-52, 41.5]], [uS(2), uA(5)], { gate: F.gSide }); honnoSay(rt, '小姓', '北の脇門を打っておる！', 2.5); });
    at(26, () => akechi(rt, '上様を狙う明智の侍', [...IN.main, [-42, 46], [-46, 46]], [uS(3), uA(3)], { nb: true }));
    at(38, () => { if (F.nb.hp < F.nb.maxHp) honnoSay(rt, '小姓', '上様が手負いじゃ。奥への道を空けよ！', 3); rt.after(2.6, () => nbSay(rt, '奥へ退くまで、口を守れ', 3.5)); });
  },
  // P6 別棟へ移る：本堂に火。燃えていない道を選び、信長を御殿へ
  p6(rt) {
    const F = rt.flags;
    if (F.hp >= 6) return;
    F.hp = 6; F.pT = rt.t;
    rt.setPhase('move');
    fireStage(rt, 4);
    nbSay(rt, '火が回る、奥へ！　あちらの棟（御殿）へ移るぞ', 3.5);
    rt.obj('main', '蘭丸の下知に従い、御殿への退路を開け', 'main');
    const burning = (id) => { const r = F.T.G.byId[id]; return r && r.state >= 1; };
    const ok = Object.entries(MOVES).filter(([, m]) => !m.burn.some(burning) && !routeBurning(F.T, m.pts)).map(([k]) => k);
    if (!ok.length) { this.nbFail(rt, '御殿への退路に火が回り、上様をお守りできなかった'); return; }
    const keys = ok.slice(0, 3);
    F.mvKeys = keys;
    // 足軽が主君の進路を決めず、上役の下知に従う。
    const route = keys.includes('urate') ? 'urate' : keys[0];
    honnoSay(rt, '森蘭丸', '燃えていない道を使う。先に立ち、御殿への道を開け！', 3);
    this.p6go(rt, route);
  },
  p6go(rt, key) {
    const F = rt.flags;
    if (F.mv) return;
    const M = MOVES[key];
    F.mv = key; F.pT = rt.t;
    honnoSay(rt, '森蘭丸', `${M.name.replace(/を.*$/, '')}じゃ！　${nm(rt)}、先に立って道を開け！`, 3);
    rt.obj('main', `上様を御殿へお移しせよ（${M.name}）`, 'main');
    F.mvGuideIdx = 0; F.mvGuide = { x: M.pts[0][0], z: M.pts[0][1] };
    rt.marker('next', F.mvGuide, '御殿への退路', { h: 3 });
    nbSet(rt, 'D', { pts: M.pts, then: 'E', done: () => this.p7(rt) });
    // 道の途中へ、煙の中から明智勢（築地の外の近い口から入る）
    const mid = M.pts[Math.floor(M.pts.length * 0.55)];
    const from = key === 'urate' ? IN.climb : key === 'watari' ? IN.ura : key === 'shukubo' ? IN.katte : IN.side;
    rt.after(3, () => { if (F.hp === 6) { const g = akechi(rt, '煙の中から来る明智勢', [...from, mid], [uS(2), uA(4)]); if (g) rt.marker('amb', centerOf(g), '道を塞ぐ明智勢', { red: true, group: g }); honnoSay(rt, '小姓', '煙の中から来るぞ！', 2.5); } });
    rt.after(14, () => { if (F.hp === 6) { fireStage(rt, 5); akechi(rt, '追ってくる明智勢', [...IN.main, [-42, 47], [-47, 47]], [uS(3), uA(8)], { nb: true }); } });
    if (key === 'niwa') rt.after(6, () => { if (F.hp === 6) { akechi(rt, '中庭を撃つ鉄砲', [[-44, 110], [-46, 103.5], [-44, 96]], [uG(4)], { hold: true, aggro: 40 }); rt.bark('勝手口の方から鉄砲！　中庭は早く抜けよ', true); } });
  },
  // P7 最終防衛：御殿の中。襖が破れ、別の部屋から回り込まれる。広間に火が入って、守る所が狭まる
  p7(rt) {
    const F = rt.flags;
    if (F.hp >= 7) return;
    F.hp = 7; F.pT = rt.t;
    rt.setPhase('goten');
    rt.unmark('next'); rt.unmark('amb');
    rt.award((t) => t.side.push('上様を御殿へお移しした'), '上様を御殿へ移した');
    nbSet(rt, 'E', { at: { ...PT.hikae } });
    nbSay(rt, '……ここが最後の間じゃ。一人も通すな', 3);
    rt.obj('main', '御殿の中で、最後まで上様をお守りせよ', 'main');
    rt.zone('gt', PT.hikae.x + 3, PT.hikae.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: -55, z: 86 };
    const at = (s, f) => rt.after(s, () => { if (F.hp === 7 && !F.ending) f(); });
    at(3, () => { akechi(rt, '廊下から来る明智勢', GOTEN_IN.north, [uS(2), uA(2)]); honnoSay(rt, '小姓', '北の廊下から来る！', 2.5); });
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
    rt.unzone('gt');
    if ((F.lastHold || 0) >= 20) rt.award((t) => t.side.push('最後の間で上様をお守りした'), '最後の間を守り抜いた');
    nbSet(rt, 'A', { at: { ...PT.oku } });
    F.nbG.aggro = 1.2;
    nbSay(rt, 'もはやこれまでじゃ。女たちは外へ出よ', 4);
    rt.after(4.2, () => honnoSay(rt, '小姓', '裏の口を守れ。退く者を通してから、そなたも退け！', 4));
    rt.after(9.4, () => honnoSay(rt, '森蘭丸', '御殿に火を！　……上様のお首は、明智に渡しませぬ', 4));
    rt.after(11, () => { F.T.fire.ignite('goten', '信長の命の火'); blaze(rt, 'goten'); });
    F.kosho.order = 'hold'; F.kosho.anchor = { ...PT.kyoshitsu }; F.koshoStay = true;
    rt.obj('main', '裏門から落ちのびよ（御殿の西の口から裏門へ）', 'main');
    rt.marker('next', { ...PT.uraOut }, '裏門の外', { h: 2.5 });
    battleEvent(rt, EVENT_RETREAT, PT.uraOut, F.uma, 0, true, '信長の命で、裏門から落ちのびる');
    F.uraG = akechi(rt, '裏門を見張る明智勢', [[PT.uraOut.x - 3, 78], [PT.uraOut.x - 3, 78]], [uS(1), uA(4)], { hold: true, aggro: 11, cap: 999 });
    if (F.uraG) rt.marker('uraG', centerOf(F.uraG), '裏門の外の見張り', { red: true, group: F.uraG });
  },
  fallen(rt) {
    const F = rt.flags;
    if (F.hp >= 9) return;
    F.hp = 9;
    rt.obj('main', '町へ退き、織田の者と合流せよ', 'main');
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
    rt.setPhase('nijo');
    F.bossName = '織田信忠';
    rt.world.setTime('morning');
    rt.world.distMul = F.dm0; F.smoke = 0;
    // 場面が切り替わる間だけ、前幕の実兵を整理する。討死の加算はしない。
    for (const b of Object.values(F.blazes || {})) b.stop();
    for (const g of [F.nbG, F.kosho, F.uma, F.monks, ...(F.posts || []), ...F.foes]) if (g) for (const u of g.units) if (u.alive) rt.army.despawn(u);
    F.foes.length = 0;
    teleport(rt, NIJO_GATE.x + 5, NIJO_GATE.z + 2);
    rt.after(0.5, () => { rt.scene.visible = true; });
    rt.banner('二条御所', '妙覚寺の信忠は、二条の新御所に移って明智を待つ');
    F.tada = allyGroup(rt, { fixed: true, name: '織田信忠の手', anchor: { x: NIJO.x + 6, z: NIJO.z - 13 }, facing: -Math.PI / 2, width: 5, aggro: 4, noRout: true, fullStrength: true },
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
    honnoSay(rt, '織田信忠', '……父上が。明智はここへも来る。逃げ道はあるまい。御所で戦う', 5);
    honnoSay(rt, '村井貞勝', '誠仁親王様は内裏へお移りにござる。御所で迎え撃てまする', 4.5);
    rt.obj('main', HI(rt) ? '二条御所の西の門の一手を預かり、中将様（信忠）をお守りせよ' : '二条御所で、中将様（信忠）をお守りせよ', 'main');
    F.tada.order = 'hold'; F.tada.aggro = 4;
    F.nGuard = allyGroup(rt, { fixed: true, fullStrength: true, name: '御所の門の守り', anchor: { x: NIJO_GATE.x + 4, z: NIJO.z }, facing: -Math.PI / 2, width: 6, formation: 'line', aggro: 8 }, dress([uS(2), uA(10)], ODA));
    F.ngun = allyGroup(rt, { fixed: true, name: '御所の鉄砲組', anchor: { x: NIJO_GATE.x + 9, z: NIJO_GATE.z + 10 }, facing: -Math.PI / 2, width: 5, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    // 近衛屋敷の正確な寸法・射座は不明。西隣の屋根に少人数の射座を復元する。
    const rx = NIJO_GATE.x - 12, rz = NIJO.z - 12, ry = rt.world.heightAt(rx, rz) + 4.4;
    hut(rt.world, rx, rz, 8, 10, 0, { h: 3 });
    addDeck({ x0: rx - 1, x1: rx + 1, z0: rz - 4, z1: rz + 4, y: ry, name: '隣の屋敷の屋根' });
    F.roof = enemyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, faction: 'saito', name: '隣の屋根の鉄砲', anchor: { x: rx, z: rz }, facing: Math.PI / 2, formation: 'line', width: 4, spacing: 1.4, aggro: 40, order: 'hold' }, dress([uG(4)], AKECHI));
    for (const u of F.roof.units) u.pos.y = ry;
    F.roof.fire = false; rt.after(30, () => { if (!F.ending && !rt.over && F.step === 4) { F.roof.fire = true; rt.bark('西隣の近衛屋敷の屋根から鉄砲じゃ！　門の脇の塀へ寄れ', true); } });
    F.nHold = 0; rt.zone('ng', NIJO_GATE.x, NIJO_GATE.z, 18);
    F.nWaves = [4, 28, 54, 82, 108];
    F.nHost = rt.world.addDistantArmy({ x: 26, z: -57, w: 10, d: 40, count: 90, facing: Math.PI / 2, team: 1, mon: 'akechi', flag: 'akechi', kind: 'mixed' });
    F.nHost.army.noWake = true;
    F.nNorth = enemyGroup(rt, { fixed: true, name: '北の口の明智勢', faction: 'saito', anchor: { x: NIJO_BACK.x, z: NIJO_BACK.z - 16 }, facing: 0, width: 6, order: 'hold', aggro: 9 }, dress([uS(2), uA(6)], AKECHI));
  },
  // 二条御所の北の口から落ちる
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('escape');
    for (const g of rt.squadGroups) g.order = 'follow';
    rt.unzone('ng');
    const W = rt.world;
    W.addFire(NIJO.x + 4, NIJO.z - 4, { h: 2.4 }); W.addSmokeColumn(NIJO.x + 4, 9, NIJO.z - 4, { size: 3 });
    rt.banner('もはやこれまで', '御所に火がかけられた');
    honnoSay(rt, '御所の組頭', '門は持たぬ。残る者が口を支える。北へ退け！', 4);

    rt.obj('main', '御所の北の口から落ちのびよ', 'main');
    rt.marker('out', OUT, '落ちのびる先', { h: 2 });
    rt.marker('nExit', NIJO_BACK, '北の口', { h: 2 });
    rt.zone('out', OUT.x, OUT.z, 7);
    F.north = F.nNorth;
    rt.marker('north', centerOf(F.north), '北の口の明智勢', { red: true, group: F.north });
    F.tada.order = 'hold'; F.tada.aggro = 4;
    honnoSay(rt, '村井貞勝', 'わしらはここに残る。行け、振り返るな！', 3.5);
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
    honnoSay(rt, '', '――本能寺で信長は亡くなり、二条御所も落ちて信忠は自害した。京の町へ落ちのびた', 5.5);
    // 山崎までの後日談は、結果の詳しい史実の札で読む。
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 6);
  },
  // 上様を守れなかった（深手で倒れられた）
  nbFail(rt, reason = '') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objRemove('escort');
    rt.objProgress('main', ''); rt.objFail('main');
    for (const id of ['next', 'nb', 'amb', 'flank', 'out', 'nExit', 'north', 'chase']) rt.unmark(id);
    for (const id of ['gz', 'hz', 'gt', 'ng', 'out']) rt.unzone(id);
    rt.uninteract('gate'); rt.objRemove('flank');
    rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.banner('守りを果たせず', reason || (F.step >= 3 ? '御所の守りが崩れた' : '上様を奥へお守りできなかった'));
    rt.finish({ scriptedEnd: true }, 8);
  },

  update(rt, dt) {
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    const F = rt.flags;
    if (!rt.player.u.alive) return;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.T) { F.T.fire.tick(dt); teraTick(rt, F.T, dt); }
    if (F.ending || rt.over) return;
    for (const g of F.foes || []) if (g.gate && !g.gate.alive && !gone(g)) {
      g.order = 'path'; g.path = g.entryPath; g.pathIdx = 0; g.assault = null; g.focus = null; g.gate = null;
    }

    if (F.hp && F.hp < 9) { honnoTick(this, rt, dt); return; }
    const p = rt.player.u.pos;
    if (F.step === 4) {
      if (!F.tadaU.alive) { this.nbFail(rt, '信忠様が倒れ、御所の守りが崩れた'); return; }
      const post = F.nPost || (F.nPost = { x: NIJO_GATE.x + 3, y: rt.world.heightAt(NIJO_GATE.x + 3, NIJO_GATE.z), z: NIJO_GATE.z });
      let friend = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct) continue;
        if (Math.hypot(u.pos.x - NIJO_GATE.x - 3, u.pos.z - NIJO_GATE.z) > 18 ||
            Math.abs(u.pos.y - post.y) > 3 || rt.army.wallBetween(u.pos, -1, post)) continue;
        if (u.team === 0) friend++;
      }
      // 門の内で味方と斬り合っている間も守備。敵が一人入っただけで時計を止めない。
      const atPost = p.x > NIJO_GATE.x && Math.hypot(p.x - NIJO_GATE.x, p.z - NIJO_GATE.z) < 18 &&
        Math.abs(p.y - post.y) < 3 && !rt.army.wallBetween(p, -1, post);
      if (atPost && friend >= 2) F.nHold += dt;
      const t = rt.t - F.stepT;
      let live = 0; for (const u of rt.army.units) if (u.alive) live++;
      while (F.nWaves.length && t >= F.nWaves[0] && live + 10 <= 240) {
        live += 10;
        F.nWaves.shift();
        const pts = F.nHost.take(26, -54, 10, 80);
        const g = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'saito', name: '御所へ寄せる明智勢', anchor: { x: 26, z: -54 }, facing: Math.PI / 2, formation: 'column', colW: 2, spacing: 1.4, width: 4, order: 'path', aggro: 9 }, dress([uS(2), uA(8)], AKECHI));
        for (let i = 0; i < g.units.length; i++) { const q = pts[i], u = g.units[i]; if (q) u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z); else rt.army.despawn(u); }
        g.path = [[NIJO_GATE.x - 3, NIJO_GATE.z], [NIJO_GATE.x + 4, NIJO_GATE.z]]; g.pathIdx = 0;
        g.onArrive = (q) => { q.order = 'attack'; q.formation = 'line'; q.seekRange = 22; };
        F.foes.push(g);
      }
      rt.objProgress('main', F.nHold >= 70
        ? '門を支えた。退く下知が来るまで持ち場を守れ'
        : !atPost
        ? '御所の門へ戻り、味方と口を支えよ'
        : friend < 2 ? '門の内の味方へ寄れ。一人では守りを支えられぬ'
        : '門の内で持ちこたえよ。退く下知を待て');
      if (t > 125) { if (F.nHold >= 70) this.escape(rt); else { this.nbFail(rt, '門を支えた時間が足りず、御所の守りが崩れた'); return; } }

    }
    if (F.step === 5) {
      const d = Math.hypot(p.x - OUT.x, p.z - OUT.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d))}歩`);
      if (d >= 7 && rt.t - F.stepT > 40 && !F.outCall) { F.outCall = true; honnoSay(rt, '御所の侍', '北の口はこちらじゃ！　町へ、早う落ちよ！　火が回るぞ', 3.5); }
      if (d < 7 && rt.player.u.alive) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    // 寺の中の味方が一人、また一人と倒れる。名のある者は名を、無名の者は残りの数を、声で伝える。
    if (v.team === 0 && !v.isPlayer && F.hp >= 2 && F.hp <= 8 && !F.ending && v !== F.nb && rt.t - (F.lossSaidT ?? -99) >= 12) {
      F.lossSaidT = rt.t;
      let left = 0;
      for (const g of [F.kosho, F.uma, ...(F.posts || []), ...(rt.squadGroups || [])]) if (g) for (const u of g.units) if (u.alive && !u.woundOut) left++;
      const where = v.group?.name?.endsWith('の守り') ? `${v.group.name.replace('の守り', '')}が破られる！　` : '';
      const lines = v.name && v.name !== '森蘭丸' && (v.group === F.kosho || (rt.squadGroups || []).includes(v.group))
        ? [`${v.name}、討死！`]
        : [`${where}また一人倒れた……供は残り${left}人ほど`, `${where}味方が討たれた！　寺の内の供は、もう${left}人ほどじゃ`];
      rt.bark(lines[(F.lossN = (F.lossN || 0) + 1) % lines.length], true);
    }
  },

};

// 本能寺の段の毎コマ（P1〜P8）
function honnoTick(def, rt, dt) {
  const F = rt.flags, P = rt.player.u, p = P.pos, NB = F.nb, T = F.T;
  const t = rt.t - F.pT;
  const dNb = NB && NB.alive ? Math.hypot(p.x - NB.pos.x, p.z - NB.pos.z) : 0;
  if (P.hp < P.maxHp * 0.65 && rt.army.threats?.length && rt.t - (F.guardHelpT ?? -99) >= 12) {
    F.guardHelpT = rt.t;
    const hit = rt.player.lastHit;
    rt.bark(hit?.guardBroken || hit?.exhausted
      ? '構える力が尽きた！　供の後ろへ退き、構えを解いて息を整えよ'
      : hit?.back || hit?.side
      ? '横や後ろから突かれた！　敵へ向き直り、門の内側の供と構えよ'
      : '門の外へ向いて構えよ。鉄砲は門の脇の築地の陰で避けよ', true);
  }
  // 小姓衆は信長の後ろに付く（終局では居室の口に残る）
  if (!gone(F.kosho) && !F.koshoStay && NB.alive && F.hp >= 2) {
    F.kosho.order = 'hold';
    const h = F.nbG.facing || 0;
    F.kosho.anchor.x = NB.pos.x - Math.sin(h) * 1.8; F.kosho.anchor.z = NB.pos.z - Math.cos(h) * 1.8;
  }
  if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; honnoSay(rt, '小姓', '蘭丸様、討死……！', 3); }
  // 寄せ手の叫び：攻める側は「逃げろ」でなく、信長を討て・寺を焼け
  if (F.hp >= 2 && F.hp <= 8 && rt.t - (F.akSayT ?? -99) >= 14) {
    F.akSayT = rt.t;
    const L = ['信長を討て！　首を取れ！', '寺に火をかけよ！', '奥じゃ、奥へ踏み込め！', '一人も逃がすな！', '桔梗の旗に続け！　御殿はあちらじゃ！'];
    honnoSay(rt, '明智の侍', L[(F.akSayN = (F.akSayN || 0) + 1) % L.length], 2.4);
  }
  // 信長の傷は回復しない。深手（二割）まで負えば護衛失敗。
  if (NB.alive) {
    let near = 0;
    rt.army.forNear(NB.pos.x, NB.pos.z, 5, (o) => { if (o.alive && o.team === 1 && !o.fleeing) near++; });
    if (near >= 3 && rt.t - (F.nbPressT || -99) > 14 && (F.nbPressN || 0) < 3 && F.hp >= 3 && F.hp <= 7) { F.nbPressT = rt.t; const nbl = ['上様が囲まれた！　${nm}、お助けせよ！', '上様の周りに敵が寄っておる！　${nm}、斬り払え！', 'このままでは上様が……！　${nm}、早う！']; honnoSay(rt, '森蘭丸', nbl[(F.nbPressN = (F.nbPressN || 0) + 1) - 1].replace('${nm}', nm(rt)), 3); }   // 三回まで・言い換え（B114）
    if (NB.hp < NB.maxHp * 0.5 && !F.nbHurtSaid) { F.nbHurtSaid = true; rt.bark('上様が肘に槍傷を負われた！　そばの敵を払え', true); honnoSay(rt, '織田信長', '……蘭丸、まだ終わらぬ。奥へ退くまで、守れ', 3); }
    // 深手の手前：もう一太刀で上様が討たれる
    if (NB.hp < NB.maxHp * 0.35 && !F.nbDireSaid && F.hp < 8) { F.nbDireSaid = true; honnoSay(rt, '森蘭丸', `上様の血が止まらぬ！　${nm(rt)}、上様の前に立て！`, 3); }
    if (NB.hp < NB.maxHp * 0.2 && F.hp < 8) { def.nbFail(rt, '上様が深手を負い、奥へ退けなかった'); return; }
  } else if (F.hp < 8) { def.nbFail(rt, '上様が倒れ、護衛を果たせなかった'); return; }
  // 上様のそばを離れない
  if (F.hp >= 3 && F.hp <= 7 && dNb > 26) {
    F.farT = (F.farT || 0) + dt;
    if (F.farT > 8 && rt.t - (F.farSaidT || -99) > 20) { F.farSaidT = rt.t; honnoSay(rt, '森蘭丸', `${nm(rt)}！　上様のそばへ戻れ！　離れたままでは護衛を果たせぬ！`, 3); }
    if (F.farT > 25) { def.nbFail(rt, '上様から離れすぎ、護衛の持ち場を失った'); return; }
  } else F.farT = 0;
  if (F.hp >= 3 && F.hp <= 7 && dNb > 26 && !(F.farGuideAt > rt.t)) {
    F.farGuideAt = rt.t + 0.5; rt.obj('escort', '上様のそばへ戻れ。離れたままではお守りできぬ', 'side');
  } else if (dNb <= 26) rt.objRemove('escort');
  // 移る間：自分が遠すぎれば、信長は待つ（その先で一人で戦わない）
  if (F.nbSt === 'D' && dNb > 20 && !(F.waitGuideAt > rt.t)) { F.waitGuideAt = rt.t + 0.5; rt.obj('escort', '上様のそばへ急げ。先に立って奥への道を開けよ', 'side'); }
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
  // 広間の火（第六段）：入れば熱い
  const Z = F.heatZone;
  if (Z && p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1 && P.alive) {
    F.hzT = (F.hzT || 0) - dt;
    if (F.hzT <= 0) { F.hzT = 0.5; const damage = Math.min(P.hp, P.maxHp * 0.035); P.hp = Math.max(0, P.hp - damage); rt.stats.taken += damage; rt.stats.fireTaken = (rt.stats.fireTaken || 0) + damage; const hit = rt.player.lastHit || (rt.player.lastHit = {}); hit.kind = 'fire'; hit.type = 'fire'; hit.name = '広間の火'; hit.t = rt.t; hit.amount = damage; hit.ranged = false; hit.mounted = false; hit.back = false; hit.side = false; hit.guardBroken = false; hit.exhausted = false; hit.mobbed = false; hit.blocked = false; if (P.hp <= 0) rt.army.kill(P, null); if (rt.t - (F.heatSaidT || -99) > 8) { F.heatSaidT = rt.t; rt.bark('広間は火の中じゃ！　控えの間へ退け', true); } }
  }
  // 火で倒れた直後は、新しい下知や敵の波を始めない。
  if (!P.alive || rt.over || F.ending) return;
  // ---- 段の進み ----
  if ((F.hp === 1 || F.hp === 2) && (F.patrolScan -= dt) <= 0) {
    F.patrolScan = 0.5; patrolGuide(rt);
  }
  if (F.hp === 1) {
    const d = Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z);
    rt.objProgress('main', t < 4.4 ? '夜明け前。上様は奥の居室でお休みじゃ' : '何事か。上様の下知を待て');
    if (t >= 14 || (d < 4 && p.x < GATES.main.x && Math.abs(p.z - GATES.main.z) < GATES.main.w / 2)) def.p2(rt);
  } else if (F.hp === 2) {
    // 門へ着く前の切れ目は十二秒で補う。歩く時間を含めても三十秒以内に斬り合える距離へ。
    // 逃げる負傷兵や壁の向こうの兵は、斬り合いの相手に数えない。
    if (F.patrolScan === 0.5) {
      let near = false;
      rt.army.forNear(p.x, p.z, 8, (o) => {
        if (o.alive && o.team === 1 && !o.isStruct && !o.noTarget && !o.fleeing && !o.woundOut &&
            Math.hypot(o.pos.x - p.x, o.pos.z - p.z) <= 8 &&
            Math.abs(o.pos.y - p.y) < 3 && !rt.army.wallBetween(p, -1, o.pos)) near = true;
      });
      F.patrolQuiet = near ? 0 : (F.patrolQuiet || 0) + 0.5;
      if (!F.gMain && F.patrolQuiet >= 12) patrolReinforce(rt);
    }
    if (!F.gMain && F.gateTryAt && rt.t >= F.gateTryAt) {
      F.gateTryAt = rt.t + 2;
      if (Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) < 10) closeGate(rt, 'other');
    }
    // 上様の着くのを待たずに門前の守りへ移る（上様は後から加わる）。門を閉められぬままでも、四十秒で押し入られる。
    if ((F.gMain && Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z) < 8) || t > 40) def.p3(rt);
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

    rt.objProgress('main', g && g.alive ? (g.hp < g.maxHp * 0.3 ? '門がきしむ。内側の輪で支え、本堂へ退く下知を待て' : '門の内側で支え、本堂へ退く下知を待て') : '門が開いている');
    if ((g && !g.alive) || (!g && F.foes.some((q) => q.units.some((u) => u.alive && u.pos.x < GATES.main.x - 2 && Math.abs(u.pos.z - GATES.main.z) < 6)))) def.gateDown(rt);
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
    rt.objProgress('main', '本堂へ合流せよ。堂の口で味方と構えよ');
    if (t > 40 && dNb < 12 && Math.hypot(NB.pos.x - HONDO_IN.x, NB.pos.z - HONDO_IN.z) < 5) def.p5(rt);
    else if (t > 85) def.nbFail(rt, '本堂で合流できず、守りが崩れた');
  } else if (F.hp === 5) {
    rt.objProgress('main', '堂の口を守り、火に気をつけよ');
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
    if (t > 50) { if (F.flank && !F.flankDone) { F.flankDone = true; rt.objFail('flank'); } def.p6(rt); }
  } else if (F.hp === 6) {
    if (F.mv && F.nbGoal) {
      // 遠い御殿だけを指すと本堂の壁へ直進してしまう。道の曲がり角を順に示す。
      const pts = MOVES[F.mv].pts;
      let i = F.mvGuideIdx;
      if (i < pts.length - 1 && Math.hypot(p.x - pts[i][0], p.z - pts[i][1]) < 1) i++;
      F.mvGuideIdx = i; F.mvGuide.x = pts[i][0]; F.mvGuide.z = pts[i][1];
      if (!(F.moveGuideAt > rt.t)) {
        F.moveGuideAt = rt.t + 0.5;
        rt.objProgress('main', dNb > 20 ? '上様のそばへ戻り、合流せよ' : '前の敵を払い、御殿へ続く道を開けよ');
      }
      if (dNb > 20 && !F.waitSaid) { F.waitSaid = true; honnoSay(rt, '森蘭丸', '上様がお待ちじゃ！　先に立って道を開け！', 3); }
      // 道が開かぬままなら護衛失敗。瞬間移動で通り抜けない。
      if (rt.t - F.pT > 100 && !F.mvLateSaid) { F.mvLateSaid = true; honnoSay(rt, '森蘭丸', '火が迫る！　急げ、上様を御殿へ！', 3); }
      if (rt.t - F.pT > 150) def.nbFail(rt, '退路を開けるのが遅れ、火が回った');
    } else if (t > 16 && !F.mv) def.p6go(rt, F.mvKeys[0]);
  } else if (F.hp === 7) {
    if (dNb < 12) F.lastHold = (F.lastHold || 0) + dt;
    rt.objProgress('main', t > 64 && dNb >= 12
      ? '上様のそばへ戻れ。退く下知が出ておる'
      : '上様のそばで間の口を守れ。退く下知を待て');
    if (t > 64 && dNb < 12) def.p8(rt);
    else if (t > 90) def.nbFail(rt, '最後の間へ戻れず、守りを失った');
  } else if (F.hp === 8) {
    const d = Math.hypot(p.x - PT.uraOut.x, p.z - PT.uraOut.z);
    rt.objProgress('main', `裏門の外まで ${Math.max(0, Math.round(d))}歩`);
    if (d < 6 && t > 12 && P.alive) def.fallen(rt);
  }
  if (!F.ending && F.farT > 0) {
    if (!(F.escortGuideAt > rt.t)) {
      F.escortGuideAt = rt.t + 0.5;
      F.escortGuide = '上様のそばへ戻れ。離れたままではお守りできぬ';
    }
    rt.objProgress('main', F.escortGuide);
  } else F.escortGuideAt = 0;
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
        if (inCompound(x, z)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    // 蛸薬師通りの路地：井戸と木戸を少し（門前の密な町割り）
    rt.scene.add(well(W, -22, 44), well(W, -8, 62), kido(W, -27, 54, Math.PI / 2));
    // 両方の遊び方で同じ塀・門・居室を使う。
    F.T = buildTera(rt); F.fire = F.T.fire; F.dm0 = W.distMul || 1;
    F.gE = smallGate(rt, GATES.main, 1500);
    F.gN = smallGate(rt, GATES.side, 900);
    const wallBatch = makeKitBatch();
    compound(rt, NIJO, 'w', 7, wallBatch); finalizeKitBatch(rt, wallBatch);
    rt.scene.add(kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    // 二条御所は戦国期の御殿。後の二条城の天守・石垣は置かない。広間と奥の間は推定。
    F.nijoRoom = buildRoom(rt, NIJO.x + 2, NIJO.z - 2, { w: 16, d: 11, kind: 'goten', rot: -Math.PI / 2, night: true });
    F.nijoRoom.inside.name = '二条御所'; F.nijoRoom.inside.where = '二条御所の奥の間';
    buildNearbyChurch(rt, hutBatch);
    finalizeSimpleBatch(rt, hutBatch);
    // 裏の松（西の築地を越える枝）
    rt.scene.add(nobori(W, HONNO.x - 4, HONNO.z - 4, 'oda', 5), nobori(W, HONNO.x + 8, HONNO.z + 4, 'eiraku', 5));
    // ---- 遠景の明智の大軍（四方）と篝・旗。落ち口の斜めの隅は空けておく ----
    F.aHost = buildSonae(rt, [HONNO_ATTACK]);
    for (const [x, z] of [[HONNO.x - 22, TERA.z1 + 10], [TERA.x0 - 10, HONNO.z - 24], [TERA.x1 + 10, HONNO.z + 22], [HONNO.x + 24, TERA.z0 - 10]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[HONNO.x - 10, TERA.z1 + 12], [TERA.x0 - 12, HONNO.z + 8], [HONNO.x + 4, TERA.z0 - 12], [TERA.x1 + 12, HONNO.z - 6]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    // ---- 小姓衆（森蘭丸ら）。自分のそばを離れない ----
    F.kosho = allyGroup(rt, { fixed: true, name: '森蘭丸と小姓衆', anchor: { ...PT.hikae }, facing: Math.PI / 2, width: 4, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '森蘭丸', kosode: 1, kosodeCol: 0x5a3a2e, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '森坊丸', kosode: 1, kosodeCol: 0x3a4458, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '森力丸', kosode: 1, kosodeCol: 0x4a4038, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '高橋虎松', kosode: 1, kosodeCol: 0x2e3a4a, flag: null, horse: false } }, { type: 'samurai', n: 1, o: { name: '菅屋角蔵', kosode: 1, kosodeCol: 0x4e5a48, flag: null, horse: false } }], ODA));
    F.kosho.defMult = 1;
    F.ran = F.kosho.units[0]; F.bo = F.kosho.units[1]; F.riki = F.kosho.units[2];
    // 供のわずかな者（槍と弓。自分の組として付いて来る）
    rt.makeSquad({ x: L_START.x - 2, z: L_START.z + 4 }, Math.PI / 2, [{ kind: 'spear', n: 12 }, { kind: 'bow', n: 8 }]);
    F.ehon = camp(rt, { x: -104, z: 120, facing: Math.PI * 0.75, team: 1, faction: 'saito', mon: 'akechi', general: { name: '明智光秀' }, guard: 15, reserve: 0 });
    if (F.ehon?.general?.mounted) rt.army.setMounted(F.ehon.general, false);
    applyLook(rt, HONNO_DAWN);
    W.timeKey = 'night'; // 夜明けの薄明を保ち、夕暮れの進行に入れない。
    // 寝入っていたところを急襲された信長：具足を着ける間が無い。小袖（肌着）のまま、兜も羽織も無しで戦い出す
    // （applyLord が戦の始めに具足一式を着せるので、その後の最初のコマで剥ぐ。rishi の段で簡単な羽織だけ足す）
    // 写真で見返すと、肌着のはずの信長がいつもの旗指物を背負ったままだった（直す：寝入りを襲われた体では指物を立てる間が無い）
    rt.after(0, () => { const u = rt.player.u; u.look = { ...u.look, kosode: 1, sohei: 1, soheiV: null, kosodeCol: 0xebe5d6, armor: 0xcfc4a8, lace: 0x8a7a5a, hat: 'none', haori: 0, menpo: 0, horo: 0, sode: false, trim: 0, real: 0, flag: null, pole: false }; });
    rt.setPhase('brief');
    rt.obj('main', '何事か、確かめよ', 'main');
    honnoSay(rt, '', '天正十年六月二日　夜明け前　京 本能寺', 3.5);
    rt.after(1.8, () => { for (let i = 0; i < 6; i++) rt.after(i * 0.3, () => rt.army.play('gun', { x: HONNO.x + 26, z: HONNO.z + (Math.random() - 0.5) * 20 }, 0.8)); });
    rt.after(3, () => rt.army.play('eshout', { x: HONNO.x + 24, z: HONNO.z }, 1.6));
    honnoSay(rt, '織田信長', '……下々の争いか。騒がしい', 3);
    honnoSay(rt, '森蘭丸', '殿！　明智光秀の兵が寺を囲んでおります！', 5);
    honnoSay(rt, '織田信長', '是非に及ばず。……弓を持て', 3);
    rt.after(12, () => this.lordDefend(rt));
  },

  // ① 弓と槍で表門を防ぐ
  lordDefend(rt) {
    const F = rt.flags;
    if (F.lstep >= 1) return;
    F.lstep = 1; F.stepT = rt.t;
    rt.setPhase('defend');
    sfx('bellRapid', 0.5);
    rt.banner('明智光秀、謀反', '桔梗の旗が本能寺を囲む');
    rt.obj('main', '弓と槍で、表門に寄せる明智勢を防げ', 'main');
    rt.marker('gE', { x: HONNO_GATE.x, z: HONNO_GATE.z }, '表門', { h: 3 });
    honnoSay(rt, '森蘭丸', '供の者は、表門の内に弓を並べよ！　槍は門の脇じゃ！', 3.5);
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
    sfx('taiko', 0.8);
    rt.banner(`${gate.name}、破らる`, gate === F.gE ? '明智勢が境内へなだれ込む' : '裏からも明智勢が入ってくる');
    for (const g of F.foes) if (g.gate === gate) { g.order = 'path'; g.path = g.entryPath; g.pathIdx = 0; g.gate = null; g.assault = null; }
    if (gate === F.gE) this.lordCourt(rt);
  },
  // 判断②：表門が破られた。自ら槍を取るか、すぐ奥へ下がるか
  lordCourt(rt) {
    const F = rt.flags;
    if (F.lstep >= 1.5) return;
    F.lstep = 1.5; F.stepT = rt.t;
    rt.obj('main', '奥へ退くか、境内で押し返すか決めよ', 'main');
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
      honnoSay(rt, '織田信長', '槍を持て！　……わしの首が欲しくば、取りに来い', 3);
      rt.obj('main', '境内で明智勢を押し返せ', 'main');
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
    honnoSay(rt, '森蘭丸', '殿、ここは我らが防ぎまする。奥へお下がりくだされ！', 3.5);
    rt.obj('main', '奥（御殿の裏）へ下がれ', 'main');
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
    sfx('taiko', 0.8);
    rt.banner('御殿へ寄せる明智勢', '廊下の口を固めよ');
    honnoSay(rt, '森蘭丸', '殿、廊下に明智の新手！　奥へ通すな！', 3.5);
    honnoSay(rt, '織田信長', '火を放つ間を稼ぐ。御殿の口を守れ', 3.5);
    rt.obj('main', '御殿の口で、明智勢を防げ', 'main');
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
    honnoSay(rt, '織田信長', '……わしの首、明智に渡すな。御殿に火をかけよ', 3.5);
    rt.obj('main', '御殿に火を放て', 'main');
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
        F.fire.ignite('soboN', '出火の原因は不明');
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
      rt.objProgress('main', !atMouth ? '御殿の口の輪へ戻れ。離れた間は守備を数えない' : '御殿の口を支えよ。火をかける合図を待て');
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
honnoji.date = (rt) => `天正十年六月二日　${!rt.G.lord && rt.flags.step >= 3 ? '二条の別の守備隊へ・' : ''}夏・${!rt.G.lord && rt.flags.step >= 3 ? '朝' : '夜明け前'}`;
honnoji.canSkip = () => ''; // 敵の行軍や出火の時刻まで早送りしない。
honnoji.history = '天正十年（1582）六月二日の夜明け前、中国の毛利攻めに向かうはずだった明智光秀の軍一万三千ほどが、京の本能寺を囲んだ。わずかな供と泊まっていた織田信長は、明智の謀反と知って「是非に及ばず」と言い、自ら弓や槍を取って戦った。傷を負って奥へ入り、火を放って自害したと『信長公記』は伝える。森成利（蘭丸）ら小姓衆も討ち死にした。近くの妙覚寺にいた嫡男の信忠は、村井貞勝らと二条御所（二条新御所）に移り、誠仁親王を御所の外へ移してから戦った。明智勢は隣の近衛前久の屋敷の屋根から鉄砲を撃ちかけ、信忠も自害した。信長の遺体は見つからなかった。十一日後、中国から引き返した羽柴秀吉が山崎の戦いで光秀を破る。この戦の主人公と組頭の甚兵衛は、遊びのための人物である。兵の数には諸説ある。 宣教師フロイスの『日本史』にも本能寺の変が記されている。ただし本人は京におらず、近くの教会にいたカリオンらの知らせを使った。宣教師の報告では銃声と火の手が教会にも伝わり、信長は背に矢、腕に銃弾を受けたとされる。傷や最期の描写は『信長公記』と異なり、一つの確かな姿とは決められない。教会の細かな位置、建物の形、十字架の置き方は遊びのための推定である。台詞は史料の意味を短く言い直したもので、本文の引用ではない。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の景色や台詞の根拠には使っていない。 本能寺の供百人ほど、二条の守り五百人ほどは諸説のある目安で、同じ兵の生き残りではない。主人公は門の守りに加わる一人とし、主君の進路を決めたり史料にない使者へ任命されたりしない。信長で遊ぶ時も奥の間の自害で終わる。二条御所への移動は時間と距離を省いた場面転換である。寺域の百二十メートル四方と各棟の位置は推定で、実測の復元ではない。発掘では内部を区切る幅四メートル以上と約六メートルの堀、南側の幅二メートル以上の堀が見つかった。外周が堀で囲まれていたとする発掘報告に沿い、外周と内部の堀を別に作っている。天文法華の乱（1536）の後、京の法華の寺は堀・土塁・塀で囲んで要害を兼ねたとされ、北東の櫓、西の区画を分ける内の塀、講堂・方丈・馬舎の位置もその考えに沿った推定である。外周の幅四メートルの形、土橋と各門の位置は推定である。各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 道の点は使い回し、歩くたびに配列を作らない。
const HONNO_BOT_PATHS = {
  h4: [[-40, 48], [-45.5, 46], [-48.5, 46]],
  h8: [[-61, 89], [-65, 89], [-70, 90], [-73, 90], [-75.5, 90], [-75.5, 79], [PT.ura.x, 79], [PT.ura.x, 76], [GATES.ura.x, 76], [PT.uraOut.x, 76]],
  d: [[NIJO_GATE.x + 5, NIJO.z - 12], [NIJO.x, NIJO.z - 13], [NIJO_BACK.x, NIJO_BACK.z + 2], [NIJO_BACK.x, NIJO_BACK.z - 6], [OUT.x, OUT.z]],
};

// 素直な遊び手：表門を閉めて守り、本堂で上様と戦い、御殿へ移して守り抜き、裏門から落ちる → 二条御所の門を守り、北の口から落ちる
honnoji.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  if (b.G.lord) { lordBot(b, inp, goTo, patientStrike); return; }
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;

  // 道の点を順にたどる
  const follow = (key, pts) => {
    if (b.botPath !== key) { b.botPath = key; let bi = 0, bd = 1e9; pts.forEach((w, i) => { const d = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z); if (d < bd) { bd = d; bi = i; } }); b.botWp = bi; }
    let w = pts[Math.min(b.botWp, pts.length - 1)];
    // 御殿の口は幅二歩。手前で曲がると、廊下から壁の角を横切ってしまう。
    // 口の中央まで寄ってから次の点へ向き、停止の間合いは到着の判定より小さくする。
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 0.5 && b.botWp < pts.length - 1) w = pts[++b.botWp];
    goTo(p, inp, w[0], w[1], 0.3);
  };
  const fight = (r, post = null) => {
    const visible = (o) => o.alive && !o.fleeing && !o.noTarget && !o.isStruct &&
      o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos);
    // 横から打ち込む相手を先に受ける。近いだけの別の兵へ向くと、構えを抜かれる。
    let attacker = null, ad = Math.min(r, 10);
    for (const o of b.army.threats || []) {
      if (o.team === u.team || !visible(o) || o.type === 'gun' || o.type === 'bow') continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < ad) { attacker = o; ad = d; }
    }
    // 構えを解いて反撃する間は、届く相手を保つ。別の兵への向き直りで突きを取り消さない。
    const e = attacker || strikeTarget(b, r);
    if (!e) return false;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.3 : 2.4;
    if (d > reach) {
      // 守りの輪から出て敵を追わない。門の外へ出ると、後続の槍に囲まれる。
      if (post && (e.pos.x >= GATES.main.x || Math.hypot(e.pos.x - post.x, e.pos.z - post.z) > 7)) {
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
  inp.guardHold = false;
  const NB = F.nb, hp = F.hp || 0;
  if (hp === 1) { goTo(p, inp, F.patrolGuide.x, F.patrolGuide.z, 0.3); return; }
  if (hp === 2) { if (fight(8)) return; if (!F.gMain && Math.hypot(u.pos.x - (GATES.main.x - 1.5), u.pos.z - GATES.main.z) < 2.5) { inp.k.add('KeyE'); return; } goTo(p, inp, F.patrolGuide.x, F.patrolGuide.z, 0.3); return; }
  if (hp === 3) { if (fight(11, PT.gateIn)) return; goTo(p, inp, PT.gateIn.x, PT.gateIn.z, 2); return; }
  if (hp === 4) { if (fight(7)) return; follow('h4', HONNO_BOT_PATHS.h4); return; }
  if (hp === 5) { if (fight(8)) return; goTo(p, inp, NB.pos.x + 1.5, NB.pos.z, 2.5); return; }
  if (hp === 6) { if (fight(6)) return; if (F.mv) follow('h6' + F.mv, MOVES[F.mv].pts); else goTo(p, inp, NB.pos.x, NB.pos.z, 2.5); return; }
  if (hp === 7) { if (fight(7)) return; goTo(p, inp, NB.pos.x + 1.5, NB.pos.z, 2); return; }
  if (hp === 8) { if (u.pos.x < GATES.ura.x + 1 && fight(6)) return; follow('h8', HONNO_BOT_PATHS.h8); return; }
  if (F.step === 3 || F.step === 4) { if (fight(10)) return; goTo(p, inp, NIJO_GATE.x + 3, NIJO_GATE.z, 2); return; }
  if (F.step === 5) { if (fight(4)) return; follow('d', HONNO_BOT_PATHS.d); }
};

export { honnoji };
