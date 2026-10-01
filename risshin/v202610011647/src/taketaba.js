// ======================================================================
// 竹束（taketaba.js）… docs/quality-upgrade-plan.md「6. 竹束」
// b_castle.js にあった竹束（形・押す・陰は前からの矢玉をほぼ防ぐ）と、
// siege_rocks.js の「抱えた者は落石の7割を防ぐ」の考えを、一つの部品にまとめた。
// castle_plan を使う攻城戦（高遠・比叡山・越前一向一揆・稲葉山など）は、
//   addTaba / placeFromSpots で竹束を置き、patchGunCover(rt) を一度呼び、
//   毎フレーム tickTabas(rt, dt) と tabaInteractTick(rt, opts) を呼べば、
//   押す・据える・陰に入る、が動く。形と材質は使い回し、毎コマ new しない。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTex } from './nature.js';
import { pinGroup, keepPinned, unpinGroup } from './siege_zones.js';

function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

let TABA_GEO = null, TABA_MAT = null;
// 竹束：青竹を束ねて縄で縛った楯（原点に、前 = -z を向けて作る。動かすので一つずつの形）
export function tabaGeo() {
  if (TABA_GEO) return TABA_GEO;
  const P = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
    g.rotateX(0.2); g.translate((i - 5) * 0.15, 1.0, (i % 2) * 0.05 - 0.2);
    P.push(paint(g, [0x7c7a48, 0x6e6c3e, 0x86804e][i % 3]));
  }
  for (const yy of [0.55, 1.45]) { const b = new THREE.BoxGeometry(1.75, 0.07, 0.09); b.translate(0, yy, -0.18 - yy * 0.2 + 0.1); P.push(paint(b, 0x4a3a22)); }
  const s = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5); s.rotateX(-0.7); s.translate(0, 0.7, 0.45); P.push(paint(s, 0x5a4a32));
  TABA_GEO = mergeGeometries(P);
  return TABA_GEO;
}
export function tabaMat() {
  if (!TABA_MAT) TABA_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 });
  return TABA_MAT;
}

function tabas(rt) { return rt.flags.tabas || (rt.flags.tabas = []); }

// 竹束を一つ置く（team の側の楯。o.van があれば、その組の前について動く）
export function addTaba(rt, x, z, team = 0, o = {}) {
  const m = new THREE.Mesh(tabaGeo(), tabaMat());
  m.castShadow = true;
  rt.scene.add(m);
  const tb = { m, x, z, rot: o.rot ?? Math.PI, team, carrier: null, van: o.van || null, off: o.off || 0, fixed: !!o.fixed,
    faceSign: o.faceSign ?? -1, vanDist: o.vanDist ?? 2.8, dir: o.dir || null };
  placeTaba(rt, tb);
  tabas(rt).push(tb);
  return tb;
}
// 定義（castles/*.js の def）に書いた置き場の列から、まとめて竹束を置く
// spots: [[x,z], ...] か [{x,z,rot?,van?,off?}, ...]
export function placeFromSpots(rt, spots, team = 0, o = {}) {
  for (const s of spots || []) {
    if (Array.isArray(s)) addTaba(rt, s[0], s[1], team, o);
    else addTaba(rt, s.x, s.z, team, { ...o, ...s });
  }
}
export function placeTaba(rt, tb) {
  tb.m.position.set(tb.x, rt.world.heightAt(tb.x, tb.z) - 0.05, tb.z);
  // 竹束の前（原点の -z）を寄せる向きへ
  tb.m.rotation.y = tb.rot + Math.PI;
}

// 竹束の陰にいる（team の味方の竹束から 2.6m 以内）か
export function nearTaba(rt, x, z, team) {
  for (const tb of tabas(rt)) {
    if (tb.team !== team) continue;
    if (Math.hypot(tb.x - x, tb.z - z) < 2.6) return tb;
  }
  return null;
}
// 石・丸太など、向きを問わない落下物を防げるか（siege_rocks.js と合わせる）
export function inCoverOf(rt, x, z, team) { return !!nearTaba(rt, x, z, team); }

// 竹束の陰にいる者には、前から来る矢玉がほとんど当たらない（army.damage を一度だけ差し替える）
export function patchGunCover(rt) {
  if (rt.flags.tabaCoverPatched) return;
  rt.flags.tabaCoverPatched = true;
  const army = rt.army;
  const dmg0 = army.damage.bind(army);
  army.damage = (t, amount, src, opts) => {
    if (t && !t.isStruct && src && (src.type === 'gun' || src.type === 'bow') && src.team !== t.team && t.pos && (rt.flags.tabas || []).length) {
      const dS = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
      if (dS > 6) {
        for (const tb of rt.flags.tabas) {
          if (tb.team !== t.team) continue;
          const dx = tb.x - t.pos.x, dz = tb.z - t.pos.z, d = Math.hypot(dx, dz);
          if (d > 2.6 || d < 0.05) continue;
          const dot = (dx * (src.pos.x - t.pos.x) + dz * (src.pos.z - t.pos.z)) / (d * dS);
          if (dot > 0.5 && Math.random() < 0.85) {
            army.play('knock', { x: tb.x, z: tb.z }, 0.5);
            army.spark(tb.x, rt.world.heightAt(tb.x, tb.z) + 1.2, tb.z, 3);
            rt.flags.tabaSaved = (rt.flags.tabaSaved || 0) + 1;
            return;
          }
        }
      }
    }
    return dmg0(t, amount, src, opts);
  };
}

// 毎フレーム：押している者の前、または組の前について動く
export function tickTabas(rt, dt) {
  const F = rt.flags, pu = rt.player.u;
  for (const tb of F.tabas || []) {
    if (tb.fixed) continue;
    if (tb.carrier === 'player') {
      const h = pu.heading || 0;
      tb.x = pu.pos.x + Math.sin(h) * 1.05; tb.z = pu.pos.z + Math.cos(h) * 1.05; tb.rot = h;
      placeTaba(rt, tb);
    } else if (tb.van && tb.van.count && (tb.van.order === 'move' || tb.van.order === 'hold')) {
      const c = tb.van.center();
      // o.dir（寄せる向きの単位の向き）を渡した竹束は、どの向きからの寄せでも組の前・横 off に付く
      const tx = tb.dir ? c.x + tb.dir.x * tb.vanDist - tb.dir.z * tb.off : c.x + tb.off;
      const tz = tb.dir ? c.z + tb.dir.z * tb.vanDist + tb.dir.x * tb.off : c.z + tb.faceSign * tb.vanDist;
      tb.x += (tx - tb.x) * Math.min(1, dt * 2); tb.z += (tz - tb.z) * Math.min(1, dt * 2);
      placeTaba(rt, tb);
    }
  }
}

// E で使う物（押す・据える）：want 配列（b_castle.js の acts と同じ形）を返す
export function wantEntries(rt, { allowPush = true, team = 0 } = {}) {
  const F = rt.flags, pu = rt.player.u, want = [];
  const mine = (F.tabas || []).find((tb) => tb.carrier === 'player');
  if (mine) want.push(['taba', () => ({ x: mine.x, z: mine.z }), '竹束を据える', () => { mine.carrier = null; mine.fixed = true; }, { r: 3 }]);
  else if (allowPush) {
    let best = null, bd = 2.6;
    for (const tb of F.tabas || []) { if (tb.team !== team || tb.van || tb.carrier) continue; const d = Math.hypot(tb.x - pu.pos.x, tb.z - pu.pos.z); if (d < bd) { bd = d; best = tb; } }
    if (best) want.push(['taba', { x: best.x, z: best.z }, '竹束を押して歩く', () => { best.carrier = 'player'; best.fixed = false; }, { r: 2.8 }]);
  }
  return want;
}
// 自前で E の札を出していない戦のための、まとめの呼び出し（毎フレーム一回）
export function tabaInteractTick(rt, opts) {
  const F = rt.flags;
  const want = wantEntries(rt, opts);
  const key = want.map((w) => w[0] + w[2]).join('|');
  if (key === F.tabaActKey) return;
  F.tabaActKey = key;
  for (const id of F.tabaActIds || []) rt.uninteract(id);
  F.tabaActIds = want.map((w) => w[0]);
  for (const [id, pos, label, fn, o] of want) rt.addInteract(id, pos, label, fn, o);
}

// ======================================================================
// 竹束の寄せ（kaito 10/1「攻城戦は、もっとみんながゆっくり竹束を持って近づいていく感じに」）
// 攻め手の組が、竹束を前に押し立てて、寄せ場（yose）の手前 near m からは歩く速さの半分ほど（speed）で進み、
// 着いたら竹束を据えて、その陰でしばらく（hold 秒）鉄砲・弓で撃ち合ってから、戦の下知どおりに進む。
// 竹束は本物の兵 2〜3 人に一つ（兵は増やさない）。castle_plan の plan.taba で置いた竹束は、組の前へ並べ直す。
// 使い方：setup で組を作った後に
//   F.TA = makeTabaAdvance(rt, { items: [{ g: F.oteSpear, yose: { x: 0, z: -70 } }, ...], avoid: [spawn] });
//   update で毎コマ F.TA.tick(dt)（tickTabas の前）
// g は butai.js の部隊でも、ふつうの組（Group）でもよい。until() が true になれば（門が破れた等）待たずに進む。
// ======================================================================
const grpOf = (b) => (b && b.real !== undefined ? b.real : b && b.units ? b : null);
const yoseOf = (it) => (typeof it.yose === 'function' ? it.yose() : it.yose);
const RANGED = (g) => { let r = 0, n = 0; for (const u of g.units) if (u.alive) { n++; if (u.type === 'gun' || u.type === 'bow') r++; } return n && r / n > 0.5; };

export function makeTabaAdvance(rt, o = {}) {
  const team = o.team ?? 0, SPD = o.speed ?? 1.2, NEAR = o.near ?? 45, PER = o.perTaba ?? 2.5, MAX = o.max ?? 5;
  const F = rt.flags;
  const avoid = (o.avoid || []).filter(Boolean);
  const pool = (F.tabas || []).filter((tb) => tb.team === team && !tb.carrier && !tb.van);
  const items = (o.items || []).filter((it) => it && it.g).map((it) => ({ ...it, st: 'ready', tabas: [], t0: 0, t1: 0 }));
  for (const it of items) {
    const g = grpOf(it.g);
    const k = Math.max(1, Math.min(MAX, Math.round((g && g.count ? g.count : 10) / PER)));
    for (let i = 0; i < k; i++) {
      const tb = pool.shift() || addTaba(rt, 0, 0, team);
      tb.fixed = true; tb.van = it; it.tabas.push(tb);
    }
  }
  // 余った置きっぱなしの竹束は、組の前の竹束へ足す（一つの組に 7 つまで）。それでも余れば片付ける
  for (let i = 0; pool.length && i < items.length * 3; i++) {
    const it = items[i % items.length];
    if (it.tabas.length >= 7) continue;
    const tb = pool.shift(); tb.fixed = true; tb.van = it; it.tabas.push(tb);
  }
  for (const tb of pool) { rt.scene.remove(tb.m); F.tabas.splice(F.tabas.indexOf(tb), 1); }
  for (const it of items) it.tabas.forEach((tb, i) => { tb.off = (i - (it.tabas.length - 1) / 2) * 1.9; });

  // 組の前（進む向き）に竹束を並べる。snap なら一度に、そうでなければ少しずつ寄せる
  function front(it, dt, snap) {
    const b = it.g, g = grpOf(b);
    let c, f;
    if (g && g.count) { c = g.center(); f = g.facing; } else { c = b.pos || (g && g.anchor); f = b.facing || 0; }
    if (!c) return;
    const Y = yoseOf(it);
    if (it.st === 'ready' && Y && Math.hypot(Y.x - c.x, Y.z - c.z) > 3) f = Math.atan2(Y.x - c.x, Y.z - c.z);
    const fx = Math.sin(f), fz = Math.cos(f), px = Math.cos(f), pz = -Math.sin(f);
    let lead = 0;
    if (g && g.count) for (const u of g.units) if (u.alive) lead = Math.max(lead, (u.pos.x - c.x) * fx + (u.pos.z - c.z) * fz);
    lead = Math.min(lead, 8) + 1.2;
    const k = snap ? 1 : Math.min(1, dt * 2);
    for (const tb of it.tabas) {
      let tx = c.x + fx * lead + px * tb.off, tz = c.z + fz * lead + pz * tb.off;
      // 自分の出だしなど、空けておく所には置かない（横へずらす）
      for (const a of avoid) { const d = Math.hypot(tx - a.x, tz - a.z); if (d < 3) { const s = tb.off >= 0 ? 1 : -1; tx += px * s * (3 - d + 0.5); tz += pz * s * (3 - d + 0.5); } }
      tb.x += (tx - tb.x) * k; tb.z += (tz - tb.z) * k; tb.rot = f;
      placeTaba(rt, tb);
    }
  }
  function plant(it) { for (const tb of it.tabas) { tb.van = null; tb.fixed = true; } }
  const moving = (g) => g && (g.order === 'move' || g.order === 'path' || g.order === 'attack' || g.order === 'assault' || g.order === 'charge');
  for (const it of items) front(it, 0, true);

  return {
    items,
    tick(dt) {
      for (const it of items) {
        if (it.st === 'free') continue;
        const b = it.g, g = grpOf(b);
        const gone = (!g || !g.count) && (!b.aliveNominal || b.aliveNominal() <= 0);
        if (gone) { if (it.st === 'cover' && g) unpinGroup(g); plant(it); it.st = 'free'; continue; }
        if (it.st === 'ready') {
          if (moving(g)) { it.st = 'push'; it.t0 = rt.t; it.spd0 = g.speed; }
          front(it, dt, false);
          continue;
        }
        if (it.st === 'push') {
          const Y = yoseOf(it);
          if (!Y || (it.until && it.until())) { if (g) g.speed = it.spd0; plant(it); it.st = 'free'; continue; }
          // 寄せ場の手前で止められた（hold）ら、また動き出すまで竹束を前に構えて待つ
          if (g && !moving(g)) { g.speed = it.spd0; it.st = 'ready'; front(it, dt, false); continue; }
          const c = g && g.count ? g.center() : b.pos;
          const d = Math.hypot(Y.x - c.x, Y.z - c.z);
          // 自分が組より 15m 以上先に出ていたら、置き去りにしないよう少しだけ足を早める（それでも歩くよりは遅い）
          const pu = rt.player && rt.player.u;
          const ahead = pu && pu.alive && Math.hypot(Y.x - pu.pos.x, Y.z - pu.pos.z) < d - 15;
          if (g) g.speed = d < NEAR ? (ahead ? Math.max(SPD, it.spd0 * 0.75) : SPD) : it.spd0;
          front(it, dt, false);
          if (d < (it.r ?? 8) || rt.t - it.t0 > (o.maxPush ?? 160)) {
            if (g) g.speed = it.spd0;
            plant(it);
            if (g && g.count) {
              const walk = (g.order === 'move' || g.order === 'path') && g.anchor;
              pinGroup(g, walk ? { x: g.anchor.x, z: g.anchor.z } : c, g.facing, { by: it, aggro: 8 });
              it.st = 'cover'; it.t1 = rt.t;
              it.holdT = it.hold ?? (RANGED(g) ? (o.holdRanged ?? 30) : (o.holdMelee ?? 14));
            } else it.st = 'free';
          }
          continue;
        }
        if (it.st === 'cover') {
          if (g && g._pinH && g._pinH.by === it) keepPinned(g);
          if (rt.t - it.t1 > it.holdT || (it.until && it.until())) { if (g) unpinGroup(g); it.st = 'free'; }
        }
      }
    },
    // 確かめ用：いま押している・陰にいる組の数と、竹束の数
    stat() { const n = (s) => items.filter((it) => it.st === s).length; return { ready: n('ready'), push: n('push'), cover: n('cover'), free: n('free'), tabas: (F.tabas || []).length }; },
  };
}

// 寄せの合図：「竹束を前へ」。大将の声と呼び出し札
export function announceAdvance(rt, speaker, line = '者ども、竹束を前へ！　押し立てて寄せよ！') {
  rt.banner('竹束を前へ', '押して、寄せ場まで');
  if (speaker) rt.say(speaker, line, 3);
}
