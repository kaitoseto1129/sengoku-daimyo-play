// ======================================================================
// 束F（K324・K315・K287）広い戦場と軍勢の厚みを、戦ごとの手直しでなく全戦の共通の仕組みに（wide_field.js）
//   kaito 11/15「戦場が小さすぎて全軍が一か所に詰まっている。布陣の図はこのままで、各軍勢を本当の距離に散らす（隣の隊でも相当離れている）。
//               近づいた時にしっかり軍勢がいる。名のある武将は全員馬に乗せる。右上に地図を出し、遠くにも軍勢がいると分かり、行けばいる」
//               「天王寺の厚み・戦場を広げる件、全戦に普及させないと」
//   天王寺（k15）の厚みは「布陣の表の行ごとに本物の備を置く」（fujin_place.js・K285 本物の兵しか映さない）。ここはそれを、
//   docs/fujin/<戦>.md から作った表（fujin_table.js の FUJIN_TABLE）がある戦なら どこでも働く形にした物。戦のファイルは触らない。
//     1. 本当の距離：表の行の置き場（xz）はそのまま。置き場の無い行は、本物の隊から測った両軍の前線と向きから、
//        army_depth.js の層の深さ（先手→中備 150m→控え 110m→本陣 180m→後詰）と翼の幅（実 240m）で置く。地面に入らない分だけ縮める
//     2. 遠くにも軍勢：行ごとに家の幟を一本、始めから立てる（幟は兵ではない。K286 と同じ）。小地図には行を墨のにじみで描く（hud_map.js）
//     3. 行けばいる：本人が行に寄ると（携帯 130m・ほか 170m）、その場に本物の備（その戦の装束・旗は表の家）を立てる。
//        離れて（+90m）斬り合っていなければ静かに外し、また寄れば立てる。本物の兵の上限 236 の内。勝ち負けの数には入らない（g._far）
//     4. 名のある武将は騎馬：行の大将は名のある武将として馬に乗る（depth_reserve.js の realFromLight。def.noHorse の戦と塀の内は徒）
//     5. 右上の地図：def.wideMap（hud.js・hud_update.js が小地図を出す。160m の広さ）
//   すでに戦の中にいる大将（台本の本物の隊）・本物の隊の 30m 内の行・城の塀の内の行は立てない（重ねない）。
//   重さ：0.5 秒に一度だけ見る。毎コマ new しない。?wide=0 で入れない（見比べ用）
// ======================================================================
import { FUJIN_TABLE } from './fujin_table.js';
import { namesOf } from './fujin_read.js';
import { realFromLight } from './depth_reserve.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori } from './props.js';
import { isTouch as TOUCH } from './touch.js';

// 束F の受け持ち：ODA_LINE の後半（前半は mini）
export const WIDE_IDS = new Set(['shitaragahara', 'echizen', 'echizen_ikko', 'iwamura', 'tennoji', 'saika', 'tedorigawa', 'shigisan',
  'kizugawa', 'miki', 'arioka', 'iga', 'tottori', 'takato', 'tano', 'honnoji',
  // K341⑤（K340 の四つを先に）：三方ヶ原も広い戦場に（布陣の表の備を本当の距離に・行けばいる）
  'mikatagahara', 'moribe', 'okehazama', 'sunomata', 'nagashima', 'okawachi', 'anegawa', 'kanegasaki', 't06_hetsugi', 'odani']);   // 稲葉山は入れた act bot が任務失敗（721秒）だったので外した   // 稲生は入れると林秀貞の備（遠い行）が hold で14人一点に重なった（act bot 391秒）ので外した
// 海の上の戦（木津川口）は陸の備を立てない（地図だけ）
const MAP_ONLY = new Set(['kizugawa']);
const ALLY = /織田|徳川|信長|羽柴|信忠|滝川/;
const FRONT = { ichi: 480, ni: 330, yobi: 220, hatamoto: 40, gozume: -140 };
const WING = [0, -1, 1];
// 人の名か（「河尻の配下」「西光寺の衆徒」「織田の将」は人でない。名のある武将として立てない）
const person = (nm) => !/[のノ衆勢配下方軍組隊者徒]|一揆|大将|物見|見張/.test(nm);
const off = () => /[?&]wide=0\b/.test(globalThis.location?.search || '');

function centroid(rt, team) {
  let x = 0, z = 0, n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== team || g.isPlayerSquad || g.civ || g.routed || !(g.count > 0)) continue;
    for (const u of g.units) if (u.alive && !u.isPlayer) { x += u.pos.x; z += u.pos.z; n++; }
  }
  return n >= 4 ? { x: x / n, z: z / n } : null;
}
// 点 C から向き f の後ろへ、限り L の内に何 m 下がれるか
function room(C, fx, fz, L) {
  let s = Infinity;
  for (const [p, d] of [[C.x, -fx], [C.z, -fz]]) { if (d > 1e-6) s = Math.min(s, (L - p) / d); else if (d < -1e-6) s = Math.min(s, (-L - p) / d); }
  return Math.max(20, s);
}
// 行の言葉から層（置き場の無い行だけ）
function layerOf(r) {
  const t = `${r.tai || ''} ${r.jinkei || ''}`;
  if (/本陣|旗本|本隊|御所|本丸/.test(t)) return 'hatamoto';
  if (/後詰|後ろ|控え|予備|後備/.test(t)) return 'yobi';
  if (/先手|先鋒|最前|寄せ|仕寄|先陣/.test(t)) return 'ichi';
  return 'ni';
}

// 表の行を置き場つきの一覧にする（戦の始めの数コマ後・本物の隊が出てから一度だけ）
function buildRows(rt) {
  const T = FUJIN_TABLE[rt.def.key];
  if (!T || MAP_ONLY.has(rt.def.key)) return [];
  const me = rt.player.u.team;
  const CA = centroid(rt, me), CB = centroid(rt, 1 - me);
  const sp = rt.def.spawn || { x: 0, z: 0, heading: 0 };
  let fA = sp.heading || 0;
  if (CA && CB && Math.hypot(CB.x - CA.x, CB.z - CA.z) > 8) fA = Math.atan2(CB.x - CA.x, CB.z - CA.z);
  const L = (rt.world.def.moveLim || rt.def.moveLim || 176) - 10;
  const clampL = (v) => Math.max(-L, Math.min(L, v));
  const alive = new Set(); for (const u of rt.army.units) if (u.alive && u.name) alive.add(u.name);
  const out = [];
  for (const S of T.sides) {
    const team = ALLY.test(S.side) ? me : 1 - me;
    const C = (team === me ? CA : CB) || (team === me ? { x: sp.x, z: sp.z } : null);
    const facing = team === me ? fA : fA + Math.PI;
    const fx = Math.sin(facing), fz = Math.cos(facing), rx = -Math.cos(facing), rz = Math.sin(facing);
    const mpu = C ? Math.max(1, Math.min(6, 720 / room(C, fx, fz, L))) : 4;   // ゲームの 1 が実の何 m（1 なら本当の距離）
    const used = {};
    for (const r of S.rows) {
      const n = r.n || 0;
      if (n < 60 || /すでに置いてある/.test(r.pos || '')) continue;
      const names = namesOf(r).filter(person);
      if (names.length && names.every((nm) => alive.has(nm))) continue;   // 台本の本物の隊が もう居る
      let x, z;
      if (r.xz) { x = r.xz[0]; z = r.xz[1]; }
      else {
        // 城の内の守り手（本丸・二の丸・曲輪…）・台本の隊（本物）は、表の場所を持たない
        if (!C || /本物|丸|城|曲輪|郭|門の内|山上|御殿|御所|境内|寺の中/.test(`${r.pos || ''} ${r.tai || ''}`)) continue;
        const layer = layerOf(r), k = used[layer] = (used[layer] || 0) + 1, w = WING[(k - 1) % 3] * Math.min(240 / mpu, L * 0.6) * (1 + ((k - 1) / 3 | 0) * 0.3);
        const H = { x: C.x - fx * 480 / mpu, z: C.z - fz * 480 / mpu };
        x = H.x + fx * FRONT[layer] / mpu + rx * w; z = H.z + fz * FRONT[layer] / mpu + rz * w;
      }
      x = clampL(x); z = clampL(z);
      if (rt.world.waterDepthAt?.(x, z) > 0.25) continue;
      if (rt.army.walledIn?.({ x, z })) continue;
      // 本物の隊の 30m 内の行は、その隊が受け持つ（重ねない）
      let near = false;
      for (const g of rt.army.groups) { if (g.team !== team || !(g.count > 0) || g.isPlayerSquad) continue; const c = g.anchor; if (c && Math.hypot(c.x - x, c.z - z) < 30) { near = true; break; } }
      if (near) continue;
      // K341⑤：端に寄せられて同じ所に落ちた行（姉川の稲葉と石川・大河内の斎藤と名無しの備が同じ点）は、先の行が受け持つ（同じ所に二つ立てて一点に重ねない）
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 30)) continue;
      const lead = names.filter((nm) => !alive.has(nm)).slice(0, TOUCH ? 1 : 2);
      out.push({ x, z, w: Math.max(14, Math.min(60, r.w || 30)), d: Math.max(8, Math.min(40, r.d || 16)), count: n, facing, team,
        flag: r.mon || null, name: names[0] ? `${names[0]}の備` : (r.tai || '備'), leaders: lead, g: null, pole: null, spent: false });
    }
  }
  return out;
}

const CAP = 236, MAX_LIVE = TOUCH ? 2 : 3;
const NEAR = TOUCH ? 130 : 170, FAR = NEAR + 90;
function liveCount(rt) { let n = 0; for (const u of rt.army.units) if (u.alive) n++; return n; }
function fighting(g) { for (const u of g.units) if (u.alive && (u.atk || u.swing || (u.target && u.target.alive))) return true; return false; }
function drop(rt, g) { for (const u of g.units) if (u.alive && !u.gone) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } } }

export function wideTick(rt) {
  const me = rt.player?.u;
  if (!me || !me.alive || rt.over || !rt.def.wideMap) return;
  const W = rt.flags.wide || (rt.flags.wide = { t: 0, rows: null, live: 0 });
  if (rt.t < W.t) return;
  W.t = rt.t + 0.5;
  if (!W.rows) {
    if (!rt._tpl || !(rt._tpl.E || rt._tpl.A) || rt.t < 1.5) return;   // 兵の装束が覚えられてから
    W.rows = buildRows(rt);
    W.alive0 = liveCount(rt);   // 戦の始めの本物の数（上限の物差し）
    // 遠くにも軍勢：行ごとに家の幟を一本（携帯は十本まで）
    let flags = TOUCH ? 10 : 24;
    for (const r of W.rows) {
      if (flags <= 0 || !r.flag) continue;
      try { r.pole = nobori(rt.world, r.x, r.z, r.flag, 6.5); rt.scene.add(r.pole); flags--; } catch (e) { /* 旗の絵が無い家は立てない */ }
    }
  }
  let alive = -1;
  for (const r of W.rows) {
    const d = Math.hypot(me.pos.x - r.x, me.pos.z - r.z);
    if (r.g) {
      if (!(r.g.count > 0)) { r.g = null; r.spent = true; W.live--; continue; }   // 討ち尽くした行は二度と立てない
      if (d > FAR && !fighting(r.g)) { drop(rt, r.g); r.g = null; W.live--; }
      continue;
    }
    if (r.spent || d > NEAR || W.live >= MAX_LIVE) continue;
    if (alive < 0) alive = liveCount(rt);
    const want = TOUCH ? 9 : 30;
    // 上限：236 か、戦の始めの本物の数に 行の分（携帯 18・ほか 40）を足した数まで（始めから兵の多い戦でも、寄った所に一つは立つ）
    //   11/15 iMac三十四（K210）：ただし戦の本物の上限（def.realCap・既定290）は越えない（設楽原は始めの約330に土屋の備30が足され 367 になっていた）
    if (alive + want > Math.max(CAP, Math.min((W.alive0 || 0) + (TOUCH ? 18 : 40), rt.def.realCap ?? 290))) continue;
    const lead = r.leaders.filter((nm) => !rt.army.units.some((u) => u.alive && u.name === nm));
    let g = null;
    try {
      g = realFromLight(rt, { x: r.x, z: r.z, w: r.w, d: r.d, count: r.count, facing: r.facing, team: r.team, look: r.flag ? { flag: r.flag } : null, min: TOUCH ? 6 : 12 },
        enemyGroup, allyGroup, TOUCH ? 0.02 : 0.1, want, null, lead.length ? lead : null);
    } catch (e) { if (!rt.flags.wideErr) { rt.flags.wideErr = 1; console.warn('広い戦場', e); } }
    if (!g) { r.spent = true; continue; }
    // 行の大将は史実で生き延びた人も多い：討たれない（名だけを奪う形にしない）
    for (const u of g.units) if (u.name && lead.includes(u.name)) u.invuln = true;
    g.wideReal = true; g.recyclable = true; g.name = r.name;
    r.g = g; W.live++; alive += g.count || want;
  }
}

// battles.js（army_jindate.js の installJindate）から：受け持ちの戦に 地図・本当の距離の備・行けばいる を付ける
export function installWide(defs) {
  if (off()) return;
  for (const [id, d] of Object.entries(defs)) {
    if (!d || d.__wide || !(d.wideField ?? WIDE_IDS.has(d.key || id))) continue;
    d.__wide = true;
    d.wideMap = true;
    const update = d.update;
    d.update = function (rt, dt, ...a) {
      const r = update?.call(this, rt, dt, ...a);
      try { wideTick(rt); } catch (e) { if (!rt.flags.wideErr) { rt.flags.wideErr = 1; console.warn('広い戦場', e); } }
      return r;
    };
  }
}
