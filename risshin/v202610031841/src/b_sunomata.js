// 墨俣の戦の定義（砦づくりと守り。battles.js から分けた。中身は元のまま）
import { palisade, bobosaku, kabukimon, tawara, hut, yagura, lumber, scaffold, umatsunagi, campfire, hasa, nobori, kagaribi, sakamogi, takataba, kobune, stumps, dorui, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { demBlend } from './dem.js';
import { gauss, allyGroup, nm, enemyGroup, centerOf, unitPos } from './bhelp.js';
import { nagashinojo } from './b_nagashinojo.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { volleyAt } from './b_okehazama.js';
import { battleEvent, EVENT_MESSENGER, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { seasonOf, sky } from './b_shared.js';
import { makeSiegeZones, ZONE_STATE, WIN } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeButai, butaiTick, adoptGroup } from './butai.js';
import { chooseRoute } from './siege_ai.js';
import { addTaba, tickTabas, patchGunCover } from './taketaba.js';
import { addFieldFence } from './yasen_obstacles.js';
import { FORT, ROAD3, ROAD3N, YOSE, SIDE_WORD, HORI, SUNOMATA_PLAN } from './castles/sunomata.js';

// ======================================================================
// 第3戦　墨俣
// 縄張りは castles/sunomata.js（riverFortPlan に倣った河川砦：砦の内・岸の舟着き・物見・外の空堀・寄せの道）。
// 斎藤の寄せは「備（butai）」：本物は波の組、後ろの数百は軽い大軍。寄せる道は寄せの頭（chooseRoute）が
// 柵の内の守りの厚さを見て毎回選び、竹束を押してゆっくり寄せ場まで来てから柵へ取り付く。
// 守り切り（三の手を退けて砦の内を持ち続ける）は siege_zones の WIN.timeHeld で決める。
// ======================================================================
const MOAT = HORI.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));

// 寄せの頭：柵の内の守り（織田の兵）が厚い側を避ける。道の長さ・口の狭さに揺らぎを掛けて選ぶ（siege_ai.js の chooseRoute）
function pickYose(rt, prefer) {
  const thick = (r) => {
    let n = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 0 && Math.hypot(u.pos.x - r.yose.x * 0.4, u.pos.z - r.yose.z * 0.4) < 14) n++;
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
  // 軽い大軍は柵から 50m ほどまで押し出して止まる
  const d = Math.max(0, Math.hypot(at.x, at.z) - FORT - 50);
  if (b.light && d > 0) b.light.advance(d, d / 1.6);
  return b;
}
// 竹束を押して寄せ場までゆっくり進み、着いたら柵へ取り付く（kaito 10/1「攻め手は竹束を押してゆっくり寄せる」）
function yoseApproach(rt, g, r, side, n = 3) {
  const sp0 = g.speed;
  g.order = 'move'; g.dest = { ...r.yose }; g.speed = 1.5;
  g.onArrive = (gg) => { gg.order = 'assault'; gg.speed = sp0; };
  g.assault = assaultFn(rt, side);
  const c = g.center();
  for (let k = 0; k < n; k++) addTaba(rt, c.x + r.dir.x * 3, c.z + r.dir.z * 3, 1, { van: g, dir: r.dir, off: (k - (n - 1) / 2) * 3.4, vanDist: 3, rot: Math.atan2(r.dir.x, r.dir.z) });
  // 道が詰まっても、しばらくすれば取り付く
  rt.after(30, () => { if (g.count && g.order === 'move') { g.order = 'assault'; g.speed = sp0; } });
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
    const d = dorui(W, s.seg, nx, nz, { batch: db });
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

// 普請の途中だった北の柵・北門を、選んだ順に一区画ずつ塞いでいく（人足が板を打つ音つき）
function finishBuild(rt, order, onDone) {
  let i = 0;
  const step = () => {
    const s = order[i++];
    if (s && !s.alive) {
      s.alive = true; s.hp = s.maxHp; s.building = false; s.mesh.visible = true;
      rt.army.play('knock', { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 }, 0.8);
    }
    if (i < order.length) rt.after(4.5, step); else if (onDone) onDone();
  };
  step();
}

// 馬防柵：南北に長い柵を三重に。列の間は数メートル、ところどころに虎口（出入りの口）を空ける
// x0 が一列目（敵に近い側）、facing が敵の方向（+1 = x の正の向き）
export function buildBobosaku(rt, o) {
  const { x0, z0, z1, rows = 3, gap = 7, segLen = 6, gates = [], facing = 1, hp = 520 } = o;
  const out = [];
  const bb = o.noBatch ? null : makeSimpleBatch();
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

// 波の合間に人足が柵を直す
function repairFort(rt) {
  let n = 0;
  for (const s of rt.flags.segs) {
    if (s.alive) continue;
    s.alive = true; s.hp = s.maxHp; s.mesh.visible = true;
    if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
    n++;
  }
  if (n) rt.say('木下藤吉郎', `今のうちじゃ、破れた柵を直せ！　……よし、${n}か所塞いだぞ`, 4);
  // 普請小屋も、人足が板を打ち直す（襲来ごとの傷が積もって、三の手の前に尽きないように）
  const h = rt.flags.hut;
  if (h && h.alive && h.hp < h.maxHp * 0.95) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.4);
    rt.say('人足', '小屋の板も繕いましてござる', 2.5);
  }
}

function assaultFn(rt, side) {
  return (u) => {
    const F = rt.flags;
    const inside = Math.abs(u.pos.x) < FORT - 0.4 && Math.abs(u.pos.z) < FORT - 0.4;
    if (inside) {
      if (!F.hut.alive) return null;
      // 小屋を一度に打てるのは6人まで。あぶれた者は小屋のまわりで守り手と斬り合う（一息に焼け落ちないように）
      const hit = F.hutHit || (F.hutHit = []);
      for (let i = hit.length - 1; i >= 0; i--) if (!hit[i].alive || !hit[i].group || hit[i].group.routed) hit.splice(i, 1);
      if (hit.includes(u)) return F.hut;
      // （組の小さい見習いの時は四人まで：五人の組で小屋へ戻る間に焼け落ちないように）
      if (hit.length < (F.few ? 4 : 6)) { hit.push(u); return F.hut; }
      const foe = rt.army.nearestEnemy(u, 16);
      if (foe) return { x: foe.pos.x, z: foe.pos.z };
      const a = u.id * 2.4;
      return { x: F.hut.x + Math.sin(a) * 7.5, z: F.hut.z + Math.cos(a) * 7.5 };
    }
    // 破れ目があればそこから入る
    let gap = null, gd = 50;
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < gd) { gd = d; gap = s; }
    }
    if (gap) {
      const mx = (gap.seg[0] + gap.seg[2]) / 2, mz = (gap.seg[1] + gap.seg[3]) / 2;
      const out = (u.pos.x - mx) * gap.nx + (u.pos.z - mz) * gap.nz;
      const lat = Math.abs((u.pos.x - mx) * gap.nz - (u.pos.z - mz) * gap.nx);
      if (out < 3 && lat < 2) return { x: mx - gap.nx * 5, z: mz - gap.nz * 5 };
      return { x: mx + gap.nx * 2.5, z: mz + gap.nz * 2.5 };
    }
    if (!u.segTarget || !u.segTarget.alive) {
      // 角（袋小路）に近い柵は外す。角へ押し込まれて詰まるのを防ぐ（kaito 10/1：4m→6mに広げた。原因を測って・束の詰まり）
      const farFromCorner = (s) => {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        const d = Math.min(Math.hypot(mx - FORT, mz - FORT), Math.hypot(mx - FORT, mz + FORT), Math.hypot(mx + FORT, mz - FORT), Math.hypot(mx + FORT, mz + FORT));
        return d > 6;
      };
      let cands = F.segs.filter((s) => s.alive && s.side === side && farFromCorner(s));
      if (!cands.length) cands = F.segs.filter((s) => s.alive && s.side === side);
      if (!cands.length) return F.hut;
      // 柵は the 一区画に何人も詰めかけない（crowdOk は的が柵の時は数を絞らないので、ここで絞る。
      // 絞らないと、人気の一区画――たいてい角のすぐ隣――に皆が寄って、角の袋へ押し込まれて詰まる）
      let best = null, bd = Infinity;
      for (const s of cands) {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        let n = 0;
        rt.army.forNear(mx, mz, 3.2, (o) => { if (o.alive && o.team === u.team && o.segTarget === s) n++; });
        if (n >= 7) continue;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) best = cands[Math.floor(Math.random() * cands.length)];
      u.segTarget = best;
    }
    return u.segTarget;
  };
}

let sunoDem = null;
import('./asset_dem_sunomata.js').then((m) => { sunoDem = m.default; }).catch(() => {});

const sunomata = {
  noWake: true, // 籠城。遠景の大軍は本物の兵へ替えない。
  spawn: { x: 0, z: 6, heading: Math.PI },
  world: {
    seed: 33,
    muddy: 0.45,     // 川辺の砦は湿っている
    paths: [ROAD3, ROAD3N],
    water: { x: 62, x2: 112, level: -0.7 },   // 長良川：向こう岸は 112 から
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
      if (x > 48) h -= Math.min(2.6, (x - 48) * 0.22);
      // 向こう岸：川を渡れば再び陸
      if (x > 106) h += Math.min(3.6, (x - 106) * 0.35);
      if (Math.abs(x) < FORT + 2 && Math.abs(z) < FORT + 2) h = h * 0.2 + 0.3;
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
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    flReset();
    // 縄張り（castles/sunomata.js）：物見・空堀・場の当たり。柵は下の buildFort が結う
    F.C = buildCastlePlan(rt, SUNOMATA_PLAN, { buildTowers: true, team: 0 });
    patchGunCover(rt);
    // 史実と仮想を分ける札（spec first6 0章）：築城の場所と「砦を築いた」事は史実寄り、
    // 縄張りの細部・寄せの道筋はゲーム補完。もしもの防衛戦である事自体が GAME_C
    F.hist = { site: 'HIST_A', fort: 'HIST_B', kuruwa: 'GAME_C', assaultRoutes: 'GAME_C', foeComposition: 'GAME_C', sheds: 'GAME_C', channels: 'GAME_C' };
    F.segs = buildFort(rt);
    // 南の冠木門と、兵糧の俵
    rt.scene.add(kabukimon(W, 0, FORT, 6.4));
    rt.scene.add(tawara(W, 9, -11, 0.4, 6), tawara(W, -10, 7, -0.3, 5), tawara(W, 6, 8, 1.2, 3));
    F.hut = rt.army.addStruct({ x: 0, z: -4, r: 3.8, solidR: 4.0, hp: 1500, maxHp: 1500, armor: 0.4, team: 0, name: '普請小屋' });
    F.hut.mesh = hut(W, 0, -4, 7, 4.5, 0, { ita: true });
    rt.scene.add(F.hut.mesh);
    // 砦の内の小屋の並び：兵舎・倉・武器置場・兵糧置場・作業場（急ごしらえの板屋。柵の内側に寄せる）
    rt.scene.add(hut(W, -12, -6, 5, 3.4, 0.08, { ita: true }), hut(W, 13, -3, 5, 3.4, -0.06, { ita: true }));   // 兵舎二つ
    rt.scene.add(hut(W, -13, 10, 4.4, 3.4, 0.1, { ita: true, h: 2.9 }));   // 倉
    rt.scene.add(hut(W, -7, 14, 3.8, 2.6, 0, { ita: true }));   // 武器置場（槍と弓を立てかける）
    rt.scene.add(hut(W, 8, 14, 3.8, 2.6, 0, { ita: true }), tawara(W, 12, 13, 0.2, 6));   // 兵糧置場
    rt.scene.add(hut(W, 13, 9, 4, 2.6, 0.3, { ita: true, h: 2.2 }));   // 作業場（材木を削る）
    rt.scene.add(yagura(W, -13, -13));
    // 斜面の逆茂木：柵の外に尖った枝の束を並べる（北と東西。南の門の前は空ける）
    for (let k = -2; k <= 2; k++) rt.scene.add(sakamogi(W, k * 7, -FORT - 5.5, Math.PI, 5), sakamogi(W, -FORT - 5.5, k * 7, -Math.PI / 2, 5), sakamogi(W, FORT + 5.5, k * 7, Math.PI / 2, 5));
    rt.scene.add(lumber(W, 9, -10, 0.2));
    rt.scene.add(lumber(W, 10, 4, -0.1));
    rt.scene.add(lumber(W, -9, 7, 1.4));
    rt.scene.add(scaffold(W, -6, -4, 0.3));
    // 未完成の柵ぎわの資材：丸太の山・足場・俵（普請の途中の跡。A049）
    rt.scene.add(lumber(W, -13, -18, 0.6), lumber(W, 14, -19, -0.4), lumber(W, -19, 12, 1.2), scaffold(W, 8, -18, -0.2), scaffold(W, -18, -6, 1.5), tawara(W, 17, 8, 0.3, 4));
    // 普請の途中：北東の隅は櫓の足場だけ、縄を張った杭で次に結う柵の線を示す
    F.scaf = scaffold(W, 13, -13, 0.1);
    rt.scene.add(F.scaf);
    rt.scene.add(umatsunagi(W, -4, -14.5, 0, 9), umatsunagi(W, 14.5, 4, Math.PI / 2, 8));
    // 大軍：川向こうの岸に斎藤の本隊が隊ごとに並ぶ。北と西の丘にも斎藤の備え（襲来はそこから来る）
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 岸の前に鉄砲と槍、後ろに騎馬の備と斎藤の本陣
    const KS = ['gun', 'spear', 'gun', 'spear', 'mixed', 'cavalry', 'honjin', 'cavalry', 'spear'];
    [[128, -118], [126, -62], [130, -8], [128, 50], [134, 110], [156, -88], [160, -30], [156, 34], [160, 92]]
      .forEach(([x, z], i) => KS[i] !== 'honjin' && DA(x, z, KS[i] === 'gun' ? 28 : (KS[i] === 'honjin' ? 30 : 16), KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 24 : 28), KS[i] === 'cavalry' ? 100 : 150, -Math.PI / 2, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 7 + i, KS[i]));
    // 川向こうの控えは軽い旗列。参戦の記録がない龍興の本陣は置かない。
    DA(160, -30, 30, 24, 150, -Math.PI / 2, 0x35382c, 'saito', 16, 'honjin');
    for (const [x, z] of [[132, -90], [134, 20], [136, 80], [150, -40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    DA(-30, -150, 60, 12, 200, 0.1, 0x35382c, 'saito', 17, 'mixed');
    DA(-120, -106, 24, 30, 160, 0.8, 0x3a3a30, 'saito', 18, 'spear');
    DA(-150, -12, 12, 40, 140, Math.PI / 2, 0x35382c, 'saito', 19, 'spear');
    // 味方：南に控える織田の備え
    DA(-64, 112, 34, 14, 170, Math.PI, KT.ARMOR.oda, 'oda', 21, 'spear');
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
    for (const [x, z, r] of [[-12, -25, Math.PI], [12, -25, Math.PI], [-25, -10, -Math.PI / 2], [-25, 10, -Math.PI / 2]]) rt.scene.add(sakamogi(W, x, z, r, 6));
    for (const [x, z] of [[40, -30], [42, -26], [40, 26], [42, 30]]) rt.scene.add(takataba(W, x, z, Math.PI / 2));
    F.perfect = true;

    const n = RANKS[rt.G.rank].squad || 15;
    // 組の小さい見習い（五人）の時は、寄せ手を少なめに。同時に本人へ打ちかかる敵は二人まで
    F.few = !rt.G.lord && n < 10;
    // 見習いの組の時は、普請小屋も少し固く（柱を太くした小屋）
    if (F.few) { F.hut.hp = F.hut.maxHp = 2100; }
    if (!rt.G.lord && (rt.G.rank || 0) <= 2) rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2);
    const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
    rt.makeSquad({ x: 0, z: 10 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    const tk = allyGroup(rt, { name: '藤吉郎', anchor: { x: 4, z: -9 }, facing: Math.PI, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', invuln: true, hat: 'jingasa_n' } }]);
    F.tokichiro = tk.units[0];
    const wk = allyGroup(rt, { name: '人足', anchor: { x: -6, z: -10 }, facing: 0, noRout: true, width: 4, aggro: 0 }, [{ type: 'porter', n: 10, o: { invuln: true } }]);
    F.wk = wk;
    F.ally = allyGroup(rt, { name: '前野長康の手', anchor: { x: -14, z: 2 }, facing: -Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '前野長康' } }, { type: 'ashigaru', n: F.few ? 13 : 10 }]);
    // 川並衆：東の柵（川の側）を受け持つ
    F.ally2 = allyGroup(rt, { name: '川並衆', anchor: { x: 13, z: 2 }, facing: Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', hat: 'jingasa_n' } }, { type: 'ashigaru', n: F.few ? 12 : 9 }]);
    F.koroku = F.ally2.units[0];

    // 守る砦：後詰は三の手の段で一度だけ呼び、区域側からは重ねて出さない。
    // 守り切り（WIN.timeHeld）：三の手を退け、砦の内を持ち続けたら勝ち。三の手が長引いた時の保険も同じ形で
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
        [() => !!F.w3Clear && rt.t >= 260 && rt.t - F.w3T >= 85, WIN.timeHeld('honjin', 4)],
        [() => F.wave === 3 && !!F.W3c && !!F.W3d && rt.t - F.w3T > 150, WIN.timeHeld('honjin', 20)],
      ],
      onWin: () => this.holdWin(rt),
    });

    rt.setPhase('brief');
    rt.obj('defend', '砦を守りきれ（襲来 0/3）', 'main');
    // 完全防衛は戦功で判定し、札は普請と持ち場を優先する。
    rt.say('木下藤吉郎', '川を背に砦を固める。お主は組を率い、普請が済むまで柵を守れ', 5);
    rt.say('木下藤吉郎', '北の柵はまだ開いておる。人足を守り、先に口を塞ぐのじゃ', 4.5);
    rt.say('木下藤吉郎', '柵を破られれば小屋を焼かれる。東の川の側は蜂須賀正勝、西の柵は前野長康に任せる。……頼りにしておるぞ', 4);
    // 砦は完成していない所から始まる（spec 17〜24）：北の柵は普請の途中で、北門もまだ塞がっていない。
    // 敵襲までにどこから片付けるかは、人足を割り振る順を選ぶ（一の手が来るまでに全部は塞ぎきれない）
    rt.obj('gate', '北の柵の普請を進めよ（北門が開いたまま）', 'side');
    rt.after(3, () => rt.choose('木下藤吉郎「北の柵、まだ普請の途中じゃ。どこから塞ぐ？」', [
      { label: '北門から塞ぐ', note: '敵が来やすい北門をまず塞ぐ。脇の破れは後回し' },
      { label: '崩れかけの柵から直す', note: '脇の破れをまず直す。北門は開いたまま残る' },
    ], (i) => {
      const [g1, g2] = F.segs.gate;
      const extra = F.segs.unfinished.find((s) => s !== g1 && s !== g2);
      const order = i === 0 ? [g1, g2, extra] : [extra, g1, g2];
      rt.say('木下藤吉郎', i === 0 ? 'よし、北門から塞ぐぞ！' : '脇の破れからじゃ、急げ！', 2.5);
      finishBuild(rt, order, () => { rt.objDone('gate'); rt.objRemove('gate'); rt.say('木下藤吉郎', '北の柵、ひとまず塞いだぞ！', 2.5); });
    }));
    // 操作の案内は字幕に積まず、短い知らせで（弓の人数も書く）
    rt.after(2, () => rt.bark(bows ? `弓 ${bows}人が組に加わった（号令の相手を「弓隊」に替えられる）` : '組は槍だけ。柵の内から突け'));
    rt.after(20, () => rt.bark('柵の内から槍で突ける。南の門から打って出て、横腹を突くこともできる'));
    // 最初の持ち場：台詞の後に、北の柵へ印を一つ（一の手が来れば敵の印に替わる）
    // 柵のすぐ際（-FORT+3）だと、柵が破られた所がそのまま自分の足元になり、始まってすぐ囲まれて倒れやすかった。
    // 柵から少し退いた所を持ち場にする（原因を測って・M9）
    // 一の手の道は、寄せの頭が選ぶ（北の畑か、西の林の口か。毎回変わる）
    F.r1 = pickYose(rt);
    rt.after(9, () => {
      if (F.wave) return;
      const w = SIDE_WORD[F.r1.side];
      rt.say('木下藤吉郎', `物見の知らせじゃ。一の手は${w}から来る。組を連れて${w}の柵に付け`, 3.5);
      rt.marker('post0', F.r1.side === 'n' ? { x: 0, z: -FORT + 6 } : { x: -FORT + 6, z: 0 }, `持ち場（${w}の柵）`, { h: 2.5 });
    });
    // 一の手まで（出会うまでが長すぎるとの声で、少し早めた分、太鼓・煙は濃く残す）
    rt.after(35, () => { rt.unmark('post0'); this.wave1(rt); });
    // 藤吉郎の策（名乗りの台詞が終わってから）
    rt.after(14, () => rt.choose('藤吉郎「材木が少し余った。どう使うかの？」', [
      { label: '柵を補強する', note: '柵の強さが4割増す（人足が北の柵を二重に結う）' },
      { label: '弓組を増やす', note: '弓兵が二人、組に加わる' },
    ], (i) => {
      if (i === 0) { for (const sg of F.segs) { sg.maxHp *= 1.4; sg.hp *= 1.4; } rt.say('木下藤吉郎', '心得た、柵を二重に結わせよう', 3); this.doubleFence(rt); }
      else {
        const bg = rt.squadGroups.find((g) => g.kind === 'bow');
        if (bg) {
          for (let k = 0; k < 2; k++) {
            const c = bg.center();
            const u = rt.army.addUnit(bg, { type: 'bow', x: c.x + k, z: c.z + 1, flag: rt.G.aijirushi || 'ichimonji' });
            u.isSub = true; u.hp = u.maxHp = u.maxHp * 1.15; u.kills = 0; u.name = '組の弓兵';
            rt.squad.push(u);
          }
          rt.tracker.subsInit = rt.squad.length;
        }
        if (bg) rt.say('木下藤吉郎', 'わしの手の者から弓の上手を二人貸そう', 3);
        // 組に弓の者がいない時は、弓を貸せないので材木は柵に回す（選んだ事と起きる事を食い違わせない）
        else { for (const sg of F.segs) { sg.maxHp *= 1.2; sg.hp *= 1.2; } rt.say('木下藤吉郎', 'お主の組には弓を引く者がおらぬな。ならば材木は柵に回そう', 3.5); }
      }
      rt.G.rel.tokichiro.like += 3;
    }));
    // 普請小屋で手当てを受けられる（襲来の合間の立て直し）
    F.healCd = 0;
    rt.addInteract('heal', { x: 0, z: 0.5 }, '手当てを受ける（体力6割回復・45秒に一度）', () => {
      if (F.healCd > rt.t) { rt.hud.flash(`手当てはあと${Math.ceil(F.healCd - rt.t)}秒`, 'dim'); return; }
      const u = rt.player.u;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
      F.healCd = rt.t + 45;
      rt.say('人足', '傷を縛りまする。ご無理なさいますな', 2.5);
      sfx('ui');
    }, { r: 4 });
    rt.after(50, () => rt.bark('深手を負ったら、普請小屋の「手当て」を選べ'));
    rt.tutStart('組頭の手ほどき', [['radial', '号令の輪を開く'], ['cmd_yari', '槍を並べ、柵の内から突く'], ['cmd_fire', '弓隊に射撃を命じる'], ['group', '号令する組を選ぶ']]);
    F.nextWaveAt = 35;
  },

  wave1(rt) {
    const F = rt.flags;
    F.wave = 1; F.waveT = 0; F.nextWaveAt = 0;
    rt.setPhase('w1');
    const r = F.r1 || YOSE.kita, w = SIDE_WORD[r.side];
    F.W1 = enemyGroup(rt, { faction: 'saito', name: '斎藤の一の手', anchor: { ...r.from }, facing: Math.atan2(r.dir.x, r.dir.z), order: 'move', fleeDir: { ...r.flee }, width: 8 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: F.few ? 18 : 24 }]);
    F.B1 = yoseButai(rt, F.W1, { name: '斎藤の一の手（先手の備）', at: r.from, dir: r.dir, back: 160 });
    yoseApproach(rt, F.W1, r, r.side);
    rt.banner('斎藤勢、来襲', `${w}より`);
    rt.army.play('eshout', { ...r.from }, 2);
    rt.say('木下藤吉郎', `来おったぞ！　${w}じゃ。竹束を押して寄せてくる。柵に取り付かせるな！`, 3.5);
    rt.after(10, () => { if (!rt.flags.W1 || !rt.flags.W1.count) return; rt.say('蜂須賀正勝', '逆茂木で足が止まる。柵に取り付いた所を、内から槍で突け', 4); });
    rt.marker('w', centerOf(F.W1), () => `敵勢・${moraleWord(F.W1.morale)}`, { red: true, group: F.W1 });
    rt.objProgress('defend', '');
    rt.obj('defend', `普請を守れ（一の手・${w}の柵）`, 'main');
  },

  wave2(rt) {
    const F = rt.flags;
    if (F.W2) return;
    F.wave = 2; F.waveT = 0; F.nextWaveAt = 0; rt.objRemove('scout');
    rt.setPhase('w2');
    // 波ごとに日が傾く：二の手は昼下がり、三の手で夕焼け
    rt.world.setTime('after');
    // 二の手の道：寄せの頭が、一の手で守りが厚くなった側を避けて選ぶ（毎回変わる）
    const r = F.r2 = pickYose(rt, F.r1 && F.r1.id === 'kita' ? 'nishi' : 'kita'), w = SIDE_WORD[r.side];
    F.W2 = enemyGroup(rt, { faction: 'saito', name: '斎藤の二の手', anchor: { ...r.far }, facing: Math.atan2(r.dir.x, r.dir.z), order: 'move', fleeDir: { ...r.flee }, width: 8 }, [{ type: 'samurai', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 16 : 20 }, { type: 'gun', n: 3 }]);
    F.B2 = yoseButai(rt, F.W2, { name: '斎藤の二の手（次の備）', at: r.far, dir: r.dir, back: 150, armor: 0x35382c });
    yoseApproach(rt, F.W2, r, r.side);
    rt.banner('二の手', `${w}より`);
    rt.say('木下藤吉郎', `${w}から来たぞ！　……いかん、南西から荷駄が着く頃じゃ！`, 4);
    rt.marker('w', centerOf(F.W2), () => `敵勢・${moraleWord(F.W2.morale)}`, { red: true, group: F.W2 });
    rt.obj('defend', `柵を守り、南の門から材木を迎えよ（二の手・${w}）`, 'main');
    // 西の柵の内に味方の鉄砲（まだ数は少ない）。二の手が柵へ寄せた所で一斉に放つ
    F.gunW = allyGroup(rt, { name: '川並衆の鉄砲', anchor: r.side === 'n' ? { x: -3, z: -FORT + 5 } : { x: -FORT + 5, z: -3 }, facing: r.side === 'n' ? Math.PI : -Math.PI / 2, order: 'hold', aggro: 3, width: 5, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }]);
    rt.after(6, () => rt.say('蜂須賀正勝', `${w}の柵の内に鉄砲を並べた。竹束の陰を出て柵へ寄った所を撃つ。揺れたら南の門から出て、横を突け`, 4));
    // 荷駄
    const ND = allyGroup(rt, { name: '荷駄', anchor: { x: -112, z: 104 }, facing: 1.2, formation: 'column', order: 'path', speed: 2.3, noRout: true, aggro: 3 },
      [{ type: 'porter', n: 4 }, { type: 'ashigaru', n: 2 }]);
    ND.path = [[-112, 104], [-90, 86], [-36, 44], [0, 26], [0, 8]];
    ND.onArrive = (g) => { g.order = 'hold'; };
    F.K = ND;
    F.saved = 0;
    rt.obj('nida', '材木の荷駄を守れ（二人以上を砦へ）', 'side');
    rt.marker('gate', { x: 0, z: FORT + 1 }, '南の門（打って出られる）', { h: 2.5 });
    rt.after(25, () => rt.unmark('gate'));
    rt.marker('nida', centerOf(ND), '荷駄');
    // 荷駄を狙う斎藤の組は、少し遅れて西の林から出る（砦から駆けつければ間に合う間をおく）
    rt.after(4, () => rt.say('木下藤吉郎', '南の門から荷駄を迎えよ！　荷を守るのも戦のうちじゃ。西の林の伏兵に気をつけよ', 4.5));
    F.KE = null; F.KEwait = true;
    rt.after(18, () => {
      F.KEwait = false;
      if (F.nidaDone || F.woodsClear) return;
      const KE = enemyGroup(rt, { faction: 'saito', anchor: { x: -150, z: 28 }, facing: 1.0, order: 'attack', seekRange: 90, fleeDir: { x: -1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
      KE.focus = ND.units.find((u) => u.alive && u.type === 'porter') || null;
      F.KE = KE;
      nagashinojo.kit.backOf(rt, KE, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 90, seed: 136 });
      rt.say('足軽', '西の林から斎藤の者が出たぞ！　荷駄を狙っておる！', 3);
      rt.marker('ke', centerOf(KE), '荷駄を狙う敵', { red: true, group: KE });
    });
  },

  wave3(rt) {
    const F = rt.flags;
    F.wave = 3; F.waveT = 0; F.nextWaveAt = 0; rt.objRemove('nida');
    rt.obj('post', '北と西の柵を守れ。舟が出たら東へ', 'order');
    rt.setPhase('w3');
    rt.world.setTime('dusk');
    F.w3T = rt.t;
    F.W3a = enemyGroup(rt, { faction: 'saito', name: '斎藤の三の手（北）', anchor: { x: -54, z: -122 }, facing: 0.45, order: 'move', fleeDir: { x: -0.4, z: -1 }, width: 7 },
      [{ type: 'samurai', n: 1, o: { name: '斎藤方の旗持ち', flag: 'saito', flagScale: 1.8, tag: 'flag' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'ashigaru', n: F.few ? 9 : 13 }]);
    F.B3a = yoseButai(rt, F.W3a, { name: '斎藤の三の手（北の備）', at: { x: -54, z: -122 }, dir: { x: 0.4, z: 0.92 }, back: 130 });
    yoseApproach(rt, F.W3a, YOSE.kita, 'n', 2);
    F.W3b = enemyGroup(rt, { faction: 'saito', name: '斎藤の三の手（西）', anchor: F.few ? { x: -162, z: -66 } : { x: -150, z: -60 }, facing: 1.2, order: 'move', fleeDir: { x: -1, z: -0.3 }, width: 7 },
      [{ type: 'busho', n: 1, o: { name: '斎藤方の侍大将' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'cavalry', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 5 : 8 }, { type: 'bow', n: F.few ? 2 : 3 }]);
    F.B3b = yoseButai(rt, F.W3b, { name: '斎藤の三の手（西の備）', at: { x: -150, z: -60 }, dir: { x: 0.93, z: 0.36 }, back: 130, armor: 0x35382c });
    yoseApproach(rt, F.W3b, YOSE.nishi, 'w', 2);
    // 川沿いの東から回り込む一隊（守りの手薄な側）。北と西の寄せと重ならないよう、少し遅れて来る
    // 長良川を舟で渡り、東の岸から上がって来る一隊（守りの手薄な側）
    rt.after(F.few ? 44 : 32, () => {
      rt.say('足軽', '川に舟が出たぞ！　斎藤の者が川を渡ってくる！', 3.5);
      this.boats(rt, () => {
        F.W3c = enemyGroup(rt, { faction: 'saito', anchor: { x: 54, z: -6 }, facing: -Math.PI / 2, order: 'assault', fleeDir: { x: 1, z: 0 }, width: 5 },
          [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 7 : 9 }]);
        F.W3c.assault = assaultFn(rt, 'e');
        // 岸で組が待ち構えていれば、上がりきる前に叩かれて浮き足立つ。北に集めた時は、東の柵が手薄で強く押される
        if (F.post3 === 'e') { F.W3c.morale -= 35; rt.bark('岸で待ち構えた組が、上がりかけの舟の者を突く！'); }
        else if (F.post3 === 'n') F.W3c.morale = Math.min(100, F.W3c.morale + 10);
        rt.army.play('eshout', { x: 54, z: -6 }, 1.4);
        rt.say('足軽', '舟の者が岸に上がった！　東の柵じゃ！', 3);
        rt.obj('post', '東の柵へ戻り、舟から上がった敵を止めよ', 'order');
        battleEvent(rt, EVENT_REINFORCEMENT, { x: 54, z: -6 }, F.W3c, 1, true, '川から新手。東の柵を守れ');
        rt.marker('w3', centerOf(F.W3c), () => `敵勢（東）・${moraleWord(F.W3c.morale)}`, { red: true, group: F.W3c });
      });
    });
    F.flagbearer = F.W3a.units[0];
    // 伏兵：西の林から不意に
    rt.after(22, () => {
      // 伏兵は数人ずつでなく、一つの組にまとめて出す（後ろに林から湧く控えを背負わせ、まとまった波に見せる）
      F.W3d = enemyGroup(rt, { faction: 'saito', anchor: { x: -92, z: -26 }, facing: Math.PI / 2, order: 'assault', fleeDir: { x: -1, z: 0 }, width: 5 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 5 : 8 }]);
      F.W3d.assault = assaultFn(rt, 'w');
      nagashinojo.kit.backOf(rt, F.W3d, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 12, depth: 6, count: 60, seed: 48, stop: () => { const c = F.W3d.center(); return Math.hypot(c.x, c.z) < FORT + 40; } });
      rt.banner('伏兵', '西の林から');
      rt.say('足軽', '伏兵だ！　西の林から出てきたぞ！', 3);
      rt.marker('w4', centerOf(F.W3d), () => `伏兵・${moraleWord(F.W3d.morale)}`, { red: true, group: F.W3d });
    });
    // 騎馬と侍大将の一撃は、柵の内の組頭を一度で崩さない強さに（駆け抜けて何度も当たるので）
    for (const u of F.W3b.units) if (u.type === 'cavalry' || u.type === 'busho') u.dmg *= 0.75;
    rt.banner('三の手', '夕暮れ、北西より大軍');
    rt.say('木下藤吉郎', '普請はあと一息じゃ！　柵を守り抜け！', 4);
    rt.marker('w', centerOf(F.W3a), () => `敵勢（北）・${moraleWord(F.W3a.morale)}`, { red: true, group: F.W3a });
    rt.marker('w2', centerOf(F.W3b), () => `敵勢（西）・${moraleWord(F.W3b.morale)}`, { red: true, group: F.W3b });
    rt.marker('flag', unitPos(F.flagbearer), '敵の旗', { red: true });
    rt.obj('defend', '最後の寄せを止め、砦の内を守れ', 'main');
    rt.obj('flag', '敵の旗を奪え', 'side');
  },

  // 材木で柵を補強：人足が材木を担いで北の柵へ運び、内側に一本ずつ二重の柵が組まれていく
  doubleFence(rt) {
    const F = rt.flags, W = rt.world;
    if (F.doubleFence) return;
    F.doubleFence = true;
    const wk = F.wk;
    if (wk) { wk.order = 'move'; wk.dest = { x: 0, z: -FORT + 3 }; wk.speed = 1.6; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: -FORT + 3 }; }; }
    const st = (FORT * 2) / 8;
    for (let i = 0; i < 8; i++) {
      rt.after(6 + i * 1.6, () => {
        const a = -FORT + i * st;
        rt.scene.add(palisade(W, [a + 0.2, -FORT + 1.3, a + st - 0.2, -FORT + 1.3]));
        rt.army.play('knock', { x: a + st / 2, z: -FORT + 1.3 }, 0.8);
      });
    }
    rt.after(6 + 8 * 1.6 + 2, () => { if (wk) { wk.order = 'move'; wk.dest = { x: -6, z: -10 }; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; }; } });
  },
  // 勝った時：足場だった隅に櫓が立ち、柵と櫓の並んだ砦を見せる
  fortDone(rt) {
    const F = rt.flags, W = rt.world;
    if (F.scaf) { rt.scene.remove(F.scaf); F.scaf = null; }
    rt.scene.add(yagura(W, 13, -13), yagura(W, 13, 13));
    for (const [x, z] of [[13, -9], [9, 13]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    rt.army.play('wood', { x: 13, z: -13 }, 1);
    if (!rt.player.lock) rt.player.cine = { x: 13, z: -13, t: 3 };
  },
  // 舟で長良川を渡って来る一隊：向こう岸から舟が漕ぎ寄せ、岸に着くと兵が上がる
  boats(rt, onLand) {
    const F = rt.flags, W = rt.world;
    const y = -0.7 + 0.05;
    F.boats = [[108, -20], [110, -6], [106, 8]].map(([x, z], i) => { const m = kobune(x, y, z, -Math.PI / 2 + (i - 1) * 0.08); rt.scene.add(m); return { m, x, z, x1: 58 + i * 0.8 }; });
    rt.marker('boats', () => ({ x: F.boats[1].m.position.x, z: F.boats[1].m.position.z }), '川を渡る舟', { red: true, h: 2.5 });
    F.boatT = 0; F.onLand = onLand;
  },
  moveBoats(rt, dt) {
    const F = rt.flags;
    if (!F.boats || F.landed) return;
    F.boatT += dt;
    const k = Math.min(1, F.boatT / 16);
    for (const b of F.boats) { b.m.position.x = b.x + (b.x1 - b.x) * k; b.m.rotation.z = Math.sin(F.boatT * 1.7 + b.z) * 0.03; }
    if (k >= 1) { F.landed = true; rt.unmark('boats'); F.onLand(); }
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
  },

  update(rt, dt) {
    const F = rt.flags;
    const gone = (g) => !g || g.count === 0 || g.routed;
    butaiTick(rt, dt);
    tickTabas(rt, dt);
    this.moveFar(rt, dt);
    this.moveBoats(rt, dt);
    if (F.SZ) F.SZ.tick(dt);
    if (F.won || F.ending || rt.over) return;
    if (rt.t >= 420) {
      F.ending = true; rt.tracker.main = false; rt.objFail('defend');
      rt.obj('retreat', '南の門から組を下げよ', 'main');
      rt.banner('普請を止め、砦から退く');
      rt.say('木下藤吉郎', '砦の内を守り切れぬ。南の門へ退け、組を散らすな！', 4);
      rt.finish({}, 8); return;
    }
    F.waveT = (F.waveT || 0) + dt;
    if (rt.t < (F.noticeT || 0)) return;
    F.noticeT = rt.t + 1;
    // 波の後ろの旗列も退く。札と後ろの動きの判定は一秒おき。
    for (const [b, g] of [[F.B1, F.W1], [F.B2, F.W2], [F.B3a, F.W3a], [F.B3b, F.W3b]]) {
      if (b && !b._back && gone(g)) { b._back = true; if (b.light) b.light.retreat(40, 14); }
    }
    // 深手のときだけ、手当ての場所を示す
    const low = rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.healCd > rt.t);
    if (low && !F.healMarked) { F.healMarked = true; rt.marker('heal', { x: 0, z: 0.5 }, '手当て', { h: 2.5 }); }
    if (!low && F.healMarked) { F.healMarked = false; rt.unmark('heal'); }
    // 普請小屋の具合と、次の襲来までの時間
    const hutPct = Math.round(F.hut.hp / F.hut.maxHp * 100);
    const wait = F.nextWaveAt ? Math.ceil(F.nextWaveAt - rt.t) : 0;
    rt.objProgress('defend', wait > 0 ? `次の襲来まで ${wait}秒` : `普請小屋 ${hutPct}%`);   // 数は一種類（小屋の具合は印の名に出す。A048）
    // 襲来の十秒前：物見が敵の旗の動きを知らせる。
    if (wait > 0 && wait <= 10 && F.warnFor !== F.nextWaveAt) { F.warnFor = F.nextWaveAt; rt.bark('物見「北と西で旗が動いた。持ち場に付け！」', true); }
    // 小屋が打たれ始めたら早めに知らせ、印を立てる（気づいた時には手遅れ、にならないように）
    const hw = [85, 50, 25].find((q) => hutPct <= q && !(F.hutSaid || []).includes(q));
    if (hw) {
      F.hutSaid = [...(F.hutSaid || []), hw];
      // 小屋が傷むほど、屋根から上がる煙が太くなる（遠くからでも小屋の具合が分かる）
      if (hw <= 50) rt.world.addSmokeColumn(hw === 50 ? 1.5 : -1.5, rt.world.heightAt(0, -4) + 3.2, -4, { size: hw === 50 ? 1.4 : 2.4 });
      if (hw === 85) { rt.say('木下藤吉郎', '小屋に敵が取り付いた！　組を連れて戻れ、小屋を守れ！', 3.5); rt.marker('hut', { x: 0, z: -4 }, () => `普請小屋 ${Math.round(F.hut.hp / F.hut.maxHp * 100)}%`, { h: 5 }); rt.after(30, () => rt.unmark('hut')); }
      else rt.bark(`普請小屋が危ない！（残り ${hutPct}%）　中に入った敵を討て`, true);
    }
    // 取り残された少数の敵・鉄砲だけの敵は、しばらくすると退く（襲来が止まらないように）
    if (F.wave) {
      for (const g of [F.W1, F.W2, F.KE, F.W3a, F.W3b, F.W3c, F.W3d]) {
        if (!g || g.routed || g.count === 0) continue;
        const live = g.units.filter((u) => u.alive);
        const gunsOnly = live.every((u) => u.type === 'gun' || u.type === 'bow');
        // 寄せが詰まった時も、最後は士気を下げて退かせる。
        if ((F.waveT > 38 && live.length <= 3) || (F.waveT > 28 && gunsOnly) || F.waveT > (F.wave === 3 ? 120 : F.wave === 2 ? 100 : 80)) { g.noRout = false; g.morale = 0; }
      }
    }
    if (F.wave === 1 && F.waveT >= 55 && gone(F.W1) && !F.next2) {
      F.next2 = true; F.next2T = rt.t;
      rt.unmark('w');
      rt.say('木下藤吉郎', 'ようやった！　じゃが、まだ来るぞ。今のうちに備えを直せ', 4);
      rt.obj('defend', '破れた柵を直し、次の寄せに備えよ', 'main');
      rt.after(12, () => rt.say('木下藤吉郎', '北と西の柵を直せ。次は材木を砦へ運び込む', 3.5));
      rt.after(8, () => repairFort(rt));
      // 判断：柵を直して待つか、打って出て西の林の物見を追い払うか（荷駄の道が安くなる）
      rt.after(6, () => rt.choose('藤吉郎「次の寄せまで少し間がある。どうする？」', [
        { label: '砦に残り、柵を直して待つ', note: '破れた柵を多めに直す。西の林の斎藤の者はそのまま' },
        { label: '打って出て、西の林の物見を追い払う', note: '追い払えば、二の手で荷駄を狙う者が出ない。砦の外で戦う' },
      ], (i) => {
        if (i === 0) { rt.after(4, () => repairFort(rt)); rt.say('木下藤吉郎', 'よし、人足を総出で柵に回す', 3); rt.after(20, () => this.wave2(rt)); F.nextWaveAt = rt.t + 20; }
        else {
          F.scoutOut = enemyGroup(rt, { faction: 'saito', name: '西の林の物見', anchor: { x: -86, z: -20 }, facing: Math.PI / 2, order: 'hold', aggro: 14, width: 5, morale: 80, fleeDir: { x: -1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]);
          nagashinojo.kit.backOf(rt, F.scoutOut, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 16, depth: 8, count: 100, seed: 137 });
          rt.obj('scout', '西の林の物見を追い払え', 'side');
          rt.marker('scout', centerOf(F.scoutOut), () => `西の林の物見・${moraleWord(F.scoutOut.morale)}`, { red: true, group: F.scoutOut });
          rt.say('木下藤吉郎', '南の門から出よ。林に潜む者を追い散らせ。遅れるなよ、二の手が来るまでに戻れ', 4);
          F.scoutT = rt.t;
        }
      }, 12));
    }
    // 保険：判断の段で二の手が始まらないまま長引いたら、二の手を始める
    if (F.next2T && !F.W2 && !F.wave2Q && rt.t - F.next2T > 110) { F.wave2Q = true; this.wave2(rt); }
    if (F.scoutOut && !F.scoutDone) {
      const q = F.scoutOut;
      if (gone(q) || rt.t - F.scoutT > 50) {
        F.scoutDone = true; rt.unmark('scout');
        if (gone(q)) { F.woodsClear = true; rt.objDone('scout'); rt.award((t) => t.side.push('西の林の物見を追い払った'), '西の林の物見を追い払った'); rt.say('木下藤吉郎', 'でかした！　これで荷駄の道は安い。戻れ、二の手じゃ', 3.5); }
        else { rt.objFail('scout'); q.noRout = false; q.morale = 0; rt.say('木下藤吉郎', 'もうよい、戻れ！　二の手が来るぞ', 3); }
        rt.after(10, () => this.wave2(rt)); F.nextWaveAt = rt.t + 10;
      }
    }
    if (F.wave === 2) {
      // 荷駄
      if (F.K && !F.nidaDone) {
        for (const u of F.K.units) {
          if (u.alive && u.type === 'porter' && !u.saved && Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        }
        const alivePorters = F.K.units.filter((u) => u.alive && u.type === 'porter' && !u.saved).length;
        rt.objProgress('nida', `砦へ ${F.saved}/4`);
        if (F.saved >= 2 && (alivePorters === 0 || F.saved >= 3 || F.K.pathIdx >= F.K.path.length || F.waveT > 95)) {
          F.nidaDone = true; rt.objDone('nida'); rt.unmark('nida');
          rt.award((t) => t.side.push('荷駄を守った'), '荷駄を守った');
          rt.say('木下藤吉郎', '材木が届いた！　人足を北の柵に回せ', 3.5);
          this.doubleFence(rt);
          battleEvent(rt, EVENT_MESSENGER, { x: 0, z: 8 }, F.K, 0, true, '材木が砦に届いた。北の柵を固める');
        } else if (F.saved + alivePorters < 2 || F.waveT > 95) {
          F.nidaDone = true; rt.objFail('nida'); rt.unmark('nida');
          rt.say('木下藤吉郎', '材木が足りぬ。今ある柵で受ける。砦へ戻れ', 3);
        }
      }
      // 荷駄を狙う組：狙った人足が倒れたか砦へ入ったら次の人足へ。狙う荷駄がもう無ければ西の林へ退く（林の口で立ち尽くさない）
      if (F.KE && !gone(F.KE) && !F.KE.routed) {
        const fo = F.KE.focus;
        if (!fo || !fo.alive || fo.saved) {
          const next = F.nidaDone ? null : F.K && F.K.units.find((u) => u.alive && u.type === 'porter' && !u.saved);
          if (next) F.KE.focus = next;
          else { F.KE.focus = null; F.KE.noRout = false; F.KE.morale = 0; }
        }
      }
      if (F.KE && gone(F.KE)) rt.unmark('ke');
      if (F.W2) volleyAt(rt, 'sunoW2', F.gunW, [F.W2], { r: 34, until: rt.t + 1e9, hit: 26, who: '蜂須賀正勝', then: ['木下藤吉郎', '二の手が揺れた！　門から出て横を突け！'] });
      // 荷駄の結果が出たら、柵を直し最後の持ち場を選ぶ。
      if (F.waveT >= 75 && F.nidaDone && gone(F.W2) && gone(F.KE) && !F.KEwait && !F.next3) {
        F.next3 = true;
        rt.unmark('w');
        rt.say('木下藤吉郎', '日が傾いてきた。次が正念場じゃ', 3.5);
        rt.after(8, () => repairFort(rt));
        // 判断：夕暮れの三の手に、組をどこに置くか
        rt.after(4, () => rt.choose('藤吉郎「三の手は大勢じゃ。お主の組をどこに置く？」', [
          { label: '北の柵に組を集める', note: '北の寄せ（旗持ちの隊）を柵で強く受ける。東の川の側は川並衆だけ' },
          { label: '東の川の側に組を置く', note: '舟で渡る一隊を岸で叩ける。北の柵は別組だけで受ける' },
        ], (i) => {
          F.post3 = i === 0 ? 'n' : 'e';
          const sg = (rt.squadGroups || []).find((g) => g.count);
          const pt = i === 0 ? { x: 0, z: -FORT + 3 } : { x: FORT - 3, z: 0 };
          if (sg) { sg.order = 'move'; sg.dest = pt; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = pt; }; }
          rt.marker('post3', pt, i === 0 ? '北の柵' : '東の川の側', { h: 2.5 });
          rt.after(20, () => rt.unmark('post3'));
          rt.say('木下藤吉郎', i === 0 ? 'よし、北を固めよ。東は小六に任せる' : 'よし、川の側じゃ。北は別組に踏ん張らせる', 3);
        }, 13));
        rt.obj('defend', '柵を直し、最後の持ち場を選べ', 'main');
        rt.after(30, () => this.wave3(rt));
        F.nextWaveAt = rt.t + 30;
      }
    }
    // 三の手を退けたか（勝ちは siege_zones の winWhen が決めて holdWin を呼ぶ）
    if (F.wave === 3) {
      if (F.saved >= 2 && F.waveT >= 55 && !F.reinforced) { F.reinforced = true; this.callReinforce(rt); }
      if (F.W3c && F.W3d && gone(F.W3a) && gone(F.W3b) && gone(F.W3c) && gone(F.W3d)) {
        if (!F.w3Clear) {
          rt.obj('defend', '砦の内で普請の仕上げを守れ', 'main');
          rt.say('木下藤吉郎', '寄せ手は退いた。追うな。砦の内で櫓を仕上げるぞ', 3.5);
        }
        F.w3Clear = true;
        rt.objProgress('defend', `普請の仕上げまで ${Math.max(0, Math.ceil(Math.max(260 - rt.t, 85 - (rt.t - F.w3T))))}秒`);
      }
    }
  },

  // 守りきった（siege_zones の winWhen：三の手を退け、砦の内を持ち続けた＝WIN.timeHeld）
  holdWin(rt) {
    const F = rt.flags;
    if (F.won || F.ending || rt.over || !F.hut.alive) return;
    {
      rt.unmark('w4');
      F.won = true;
      rt.unmark('w'); rt.unmark('w2'); rt.unmark('w3'); rt.unmark('flag');
      rt.objDone('defend');
      rt.award((t) => { t.main = true; if (F.perfect) t.special = { label: '砦の完全防衛', pts: 30 }; }, F.perfect ? '任務達成・砦の完全防衛' : '任務達成');
      if (F.perfect) { rt.objDone('perfect'); rt.grantTitle('perfect'); }
      if (!F.flagTaken) rt.objFail('flag');
      rt.banner('守りきった', '墨俣に砦が建つ');
      rt.say('木下藤吉郎', `守りきったぞ！　${nm(rt)}、お主のおかげじゃ！`, 4);
      this.fortDone(rt);
      sfx('horagai', 0.8);
      rt.objRemove('post');
      rt.unmark('flagdrop'); rt.uninteract('flag');
      battleEvent(rt, EVENT_RETREAT, { x: 0, z: -FORT }, F.W3a, 1, true, '寄せ手が退く。墨俣の普請を守りきった');
      rt.finish({}, 10);
    }
  },

  // 守る砦の援軍（fort-spec 18）：南から後詰の一隊が駆けつけ、砦の内へ入って加勢する
  callReinforce(rt) {
    const F = rt.flags;
    if (F.reinforceCalled || F.ending || rt.over) return;
    F.reinforceCalled = true;
    const r = allyGroup(rt, { name: '後詰', anchor: { x: 0, z: FORT + 10 }, facing: Math.PI, aggro: 8, width: 4 },
      [{ type: 'ashigaru', n: F.few ? 6 : 9 }]);
    r.order = 'move'; r.dest = { x: 0, z: FORT - 4 }; r.speed = 2.6;
    r.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: FORT - 4 }; g.aggro = 12; };
    rt.bark('南から後詰が駆けつけた');
    battleEvent(rt, EVENT_REINFORCEMENT, { x: 0, z: FORT + 10 }, r, 0, true, '南の門から後詰。砦を固める');
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v === F.flagbearer && k && (k.isPlayer || k.isSub)) {
      rt.unmark('flag');
      const pos = { x: v.pos.x, z: v.pos.z };
      rt.marker('flagdrop', pos, '敵の旗');
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
        rt.objDone('flag');
        rt.award((t) => t.c.flag++, '斎藤の旗を奪った');
        rt.say('木下藤吉郎', '斎藤の旗を奪ったか！　あっぱれじゃ！', 3);
      }, { r: 3, ttl: 30, hold: 1.0 });
    } else if (v === F.flagbearer) {
      rt.unmark('flag');
      rt.objFail('flag');
    }
  },

  onStructHit(rt, s) {
    if (!SIDE_WORD[s.side]) return;
    const F = rt.flags;
    F.sideWarn = F.sideWarn || {};
    if ((F.sideWarn[s.side] || -99) + 12 > rt.t) return;
    F.sideWarn[s.side] = rt.t;
    rt.bark(`${{ n: '北', w: '西', e: '東', s: '南' }[s.side]}の柵が攻められている！`, true);
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s === F.hut) {
      rt.banner('普請小屋が破られた');
      rt.say('木下藤吉郎', 'いかん……小屋をやられた。これでは砦が建たぬ', 4);
      rt.tracker.main = false;
      rt.objFail('defend');
      rt.finish({}, 7);
      return;
    }
    if (F.perfect) { F.perfect = false; rt.objFail('perfect'); }
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

// 墨俣の bot：砦の内に留まり、柵の内から槍で突く。柵を越えた敵を先に討つ。荷駄を狙う敵だけは南の門から打って出て討つ
// （柵の外の敵へまっすぐ歩くと柵に当たって動けなくなるので、柵の手前で止まって待つ）
sunomata.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const inF = (q, m = 0) => Math.abs(q.x) < FORT - m && Math.abs(q.z) < FORT - m;
  const GATE_IN = { x: 0, z: FORT - 3 }, GATE_OUT = { x: 0, z: FORT + 3 };
  // 歩く：柵の内と外を行き来する時は南の門を通る。砦の内では普請小屋（真ん中の solid）を回り込む
  const walk = (x, z, r) => {
    const me = inF(u.pos, 0.3), to = inF({ x, z }, 0.3);
    if (me !== to) {
      const a = me ? GATE_IN : GATE_OUT, c = me ? GATE_OUT : GATE_IN;
      // 外から戻る時は、柵に沿って南へ回ってから門へ
      if (!me && u.pos.z < FORT + 2) {
        const sx = u.pos.x < 0 ? -1 : 1;
        if (Math.abs(u.pos.x) < FORT + 2.5) return goTo(p, inp, sx * (FORT + 4), u.pos.z, 1);
        return goTo(p, inp, sx * (FORT + 4), FORT + 4, 1.5);
      }
      if (Math.abs(u.pos.x - a.x) > 1.4 || Math.abs(u.pos.z - a.z) > 2) return walk2(a.x, a.z, 0.8);
      return goTo(p, inp, c.x, c.z, 0.5);
    }
    return walk2(x, z, r);
  };
  const walk2 = (x, z, r) => {
    const hx = F.hut.x, hz = F.hut.z;
    if (F.hut.alive && inF(u.pos)) {
      // 小屋が行く手をふさぐ時は、小屋のまわりを輪（半径 6.2m）に沿って回り込む（小屋へ向かって押し続けない）
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
  };
  const strike = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 4) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  };
  // 柵の内へ寄せる点：四隅（柵が直角に出会う袋）へは寄せず、角から 4m 手前の辺の上で待つ（(±18,±18) の詰まり）
  const clampIn = (x, z, m) => {
    let cx = Math.max(-m, Math.min(m, x)), cz = Math.max(-m, Math.min(m, z));
    const k = m - 4;
    if (Math.abs(cx) > k && Math.abs(cz) > k) {
      if (Math.abs(x) < Math.abs(z)) cx = Math.sign(cx) * k; else cz = Math.sign(cz) * k;
    }
    return [cx, cz];
  };
  const fight = (e) => {
    const eIn = inF(e.pos), meIn = inF(u.pos, 0.3);
    // 柵の外の敵：柵の手前（内側）の近い所で待って突く
    if (meIn && !eIn) {
      const [cx, cz] = clampIn(e.pos.x, e.pos.z, FORT - 1.1);
      walk(cx, cz, 0.5);
    } else if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2.4) walk(e.pos.x, e.pos.z, 2.2);
    strike(e);
    // 組にも突かせる（号令は2秒に一度まで）
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 2; }
  };
  // 深手なら、敵から離れて構えたまま下がり、敵が寄っていなければ小屋で手当て（人ならそうする）
  if (u.hp < u.maxHp * 0.45) {
    const near = b.army.nearestEnemy(u, 8);
    const heal = b.interacts.find((x) => x.id === 'heal');
    if (!near && heal && !(F.healCd > b.t)) {
      walk(0, 1, 1.5);
      if (Math.hypot(u.pos.x, u.pos.z - 0.5) < 3.5) inp.e.add('KeyE');
      return;
    }
    if (near) {
      const m = FORT - 2;
      const d = Math.hypot(u.pos.x - near.pos.x, u.pos.z - near.pos.z) || 1;
      goTo(p, inp, Math.max(-m, Math.min(m, u.pos.x + (u.pos.x - near.pos.x) / d * 6)), Math.max(-m, Math.min(m, u.pos.z + (u.pos.z - near.pos.z) / d * 6)), 0.5);
      p.yaw = Math.atan2(near.pos.x - u.pos.x, near.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.add('KeyS');
      inp.guardHold = true;
      if (d < 3 && Math.random() < 0.3) inp.leftPressed = true;
      return;
    }
  }
  // 落ちた敵の旗を拾う（砦の近くだけ）
  const fl = b.interacts.find((x) => x.id === 'flag');
  if (fl && Math.hypot(fl.pos.x, fl.pos.z) < 45 && !b.army.nearestEnemy(u, 3)) {
    if (Math.hypot(fl.pos.x - u.pos.x, fl.pos.z - u.pos.z) > 2) walk(fl.pos.x, fl.pos.z, 1.5);
    else { inp.e.add('KeyE'); inp.k.add('KeyE'); }
    return;
  }
  // 柵を越えた敵が最優先（小屋を焼かれる）
  const inside = b.army.nearestEnemy(u, 60, (o) => inF(o.pos, -0.5));
  if (inside) { fight(inside); return; }
  // 荷駄を狙う敵は打って出て討つ
  if (F.KE && F.KE.count && !F.KE.routed && !F.nidaDone) {
    const e = b.army.nearestEnemy(u, 200, (o) => o.group === F.KE);
    if (e) { fight(e); return; }
  }
  // 柵の外に出ていれば、近くの敵を討ちながら砦へ戻る
  if (!inF(u.pos, 0.3)) {
    const foe = b.army.nearestEnemy(u, 3.5);
    if (foe) { fight(foe); return; }
    walk(0, FORT - 5, 1.5);
    return;
  }
  // 柵に寄ってくる敵：柵の内側から突く
  const e = b.army.nearestEnemy(u, 30, (o) => Math.abs(o.pos.x) < FORT + 8 && Math.abs(o.pos.z) < FORT + 8);
  if (e) { fight(e); return; }
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 2; }
  // 寄せ手の来る側の柵の内へ
  const far = b.army.nearestEnemy(u, 220);
  if (far) { const [cx, cz] = clampIn(far.pos.x, far.pos.z, FORT - 2.5); walk(cx, cz, 2); }
  else walk(0, -10, 3);
};
sunomata.canSkip = (rt) => (rt.flags.nextWaveAt && rt.flags.nextWaveAt - rt.t > 3 ? '次の襲来まで待つ' : '');
sunomata.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); rt.flags.nextWaveAt = rt.t; };
sunomata.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// すでに砦にいる二人を共通の武将の呼び口へ渡す。新しい兵は加えない。
sunomata.famous = [
  { name: '木下藤吉郎', team: 0, g: /藤吉郎/, line: '普請の手を止めるな。柵を守れ！' },
  { name: '蜂須賀正勝', team: 0, g: /川並衆/, line: '川の側はわしらが守る。組を離すな！' },
];
sunomata.date = (rt) => `永禄九年九月（伝承）　${seasonOf('九月')}・${sky(rt)}`;
// 墨俣：数は伝わらない。砦の守りと人足で千五百、斎藤は川向こうも合わせて四千ほどに見せる
sunomata.force = (rt) => {
  const F = rt.flags;
  return { a: 1500 - (F.ak || 0) * 5, a0: 1500, b: 4000 - (F.ek || 0) * 15, b0: 4000 };
};
sunomata.history = '信長公記の首巻「十四条合戦之事」には、永禄四年（1561）、信長が洲股の要害を固めて在陣し、十四条の戦の後に引き払ったとある。永禄九年（1566）に藤吉郎が一夜で築いたとも伝わるが、信長公記にその記録はない。伝承のよりどころの一つである『武功夜話』は後の時代の作で、成立や内容に疑いがある。戦国当時の確かな記録としては扱えない。この戦は築城伝承を借りた防衛戦。藤吉郎・小六の役割、三度の寄せ、舟の上陸、兵数と砦の細部は遊びの補いで、史料にある合戦の再現ではない。';

sunomata.rts = true;
export { sunomata };
