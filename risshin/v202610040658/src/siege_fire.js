// siege_fire.js … 柵・逆茂木・木戸・兵舎・兵糧庫などの「燃え移り」と、燃えた時の知らせ
// docs/siege-plan.md F8・M7［D］（要件：fort-spec 6・9・21／siege-spec 32／mountain-spec 13・19・20）
// 火を付ける仕組みそのもの（火矢・igniteStruct・燃え落ちる）は army_fx.js・army_ranged.js に
// すでにある。ここは army.igniteStruct を包んで、
//   ・近くの木の部品へ燃え移る（天気で速さが変わる。名の他に flammable の印も見る）
//   ・兵糧庫が燃えたら守りの士気を大きく下げる
//   ・火のそばは攻め手にも危ない（近い隊の士気が傷む。どちらの側も）
//   ・火は同時に4つまで（iPhone）
// だけを足す（ほかのファイルは触らない）。
//
// 使い方（戦の定義から）：
//   import { attachFireSpread, torchPoint } from './siege_fire.js';
//   const FS = attachFireSpread(rt, { onGranary: (rt2, s) => {} });
//   // update の中で毎コマ
//   FS.tick(dt);
//   // 柵・木戸のそばに、松明で火を付ける的を足したい時だけ
//   torchPoint(rt, someStruct);

import { WIND_STATE } from './world.js';

// 燃える部品の名（木でできた物だけ。石垣・築地は含まない）
const FLAMMABLE = /柵|逆茂木|木戸|門|兵舎|兵糧庫|櫓|小屋|蔵|屋敷/;

function structPoint(s) {
  if (s.seg) return { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 };
  return { x: s.x, z: s.z };
}
function edgeDistance(s, p) {
  if (!s.seg) return Math.max(0, Math.hypot(s.x - p.x, s.z - p.z) - (s.r || 0));
  const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - ax - dx * t, p.z - az - dz * t);
}
// 名で分からない物（寺の堂・僧坊など）も、部品の側で flammable: true の印（userData か定義に直に）を付ければ燃え移らせる
function isFlammable(s) {
  return FLAMMABLE.test(s.name || '') || s.flammable === true || (s.userData && s.userData.flammable === true);
}
function canBurn(s) {
  return !!(s && s.alive && !s.fireF && !s.fireProof && !(s.maxHp > 1e8) && isFlammable(s));
}

// 天気ごとの燃え広がる速さの掛け目：雨・濡れで遅く（最大 0.85 引く）、乾き（雨も濡れも無い）・強い風で速い
function weatherMult(rt) {
  const W = rt.world;
  const wet = (W.rainLevel || 0) > 0.4 || (W.wetness || 0) > 0.5 || ((W.def && W.def.muddy) || 0) > 0.5;
  const rain = Math.max(W.rainLevel || 0, wet ? 0.5 : 0);
  const gust = WIND_STATE.gust || 1;
  let m = wet ? 1 : 1.5;
  m *= 1 + Math.max(0, gust - 1) * 0.5;
  m *= 1 - Math.min(0.85, rain * 0.85);
  return Math.max(0.12, m);
}

const MORALE_DROP = { big: 22, small: 8 };

// 束30：燃えている櫓・柵・木戸の 4m 内の道を、C.nav を直に閉じて一時ふさぐ（燃え尽きたら戻す）。
// 燃えている木戸は閉じた門と同じ扱い（道が無ければ素通り、閉じれば迂回する）
function closeRoadNear(C, x, z, r) {
  if (!C || !C.nav) return [];
  const out = [];
  C.nav.pts.forEach((p, i) => { if (Math.hypot(p.x - x, p.z - z) <= r && !C.nav.closed.has(i)) { C.nav.closed.add(i); out.push(i); } });
  return out;
}
function openRoad(C, idxList) {
  if (!C || !C.nav || !idxList) return;
  for (const i of idxList) C.nav.closed.delete(i);
}

// 束30：燃えている櫓（C.towers の物）は、上の守り（床より高い所にいる本物の兵）を下の曲輪へ降ろし、
// 燃え尽きるまでまた登れない（u.pos.y を地面まで戻し、u._fireDown を立てて army_move 側の登り直しを止める）
function dropTowerGuards(rt, s) {
  const A = rt.army, p = structPoint(s);
  const gy = rt.world && rt.world.heightAt ? rt.world.heightAt(p.x, p.z) : 0;
  if (A.forNear) {
    A.forNear(p.x, p.z, 5, (u) => {
      if (!u.alive || u.isStruct) return;
      if (u.pos.y > gy + 1.2) { u.pos.y = gy; u._fireDown = true; }
    });
  }
}

// rt の戦に、燃え移り・兵糧庫の知らせ・同時4つの上限を足す。戻り値の tick(dt) を戦の update から毎コマ呼ぶ
// o.C（castle_plan.js の buildCastlePlan の戻り）を渡すと、束30：道の一時ふさぎ・燃える櫓の守り降ろしも働く
export function attachFireSpread(rt, o = {}) {
  const A = rt.army;
  const C = o.C || null;
  const maxFires = o.maxFires ?? 4;
  const radius = o.radius ?? 3.6;
  const interval = o.interval ?? 3.2;   // この秒数ごとに一度、近くへ燃え移れるか試す（天気の速さで縮む）
  const seen = new Set();
  const roadClosed = new Map();   // struct -> 閉じた nav の点の番号
  const towerSeen = new Set();

  // army.igniteStruct を一度だけ包む：同時4つの上限をここで見る（火矢・松明のどちらから呼ばれても通る）
  if (!A._fireSpreadWrapped) {
    A._fireSpreadWrapped = true;
    const orig = A.igniteStruct.bind(A);
    A.igniteStruct = (s, p) => {
      if ((A.burning || []).length >= maxFires) return;
      orig(s, p);
    };
  }

  function fireGranary(s) {
    if (seen.has(s) || !s.moraleOnBurn) return;
    seen.add(s);
    const drop = MORALE_DROP[s.moraleOnBurn] || MORALE_DROP.big;
    for (const g of A.groups) if (g.team === s.team) g.morale = Math.max(5, g.morale - drop);
    rt.bark(`${s.name}が燃えている！`, true);
    if (o.onGranary) o.onGranary(rt, s);
  }

  function trySpread(s, dt) {
    s._spreadT = (s._spreadT || 0) + dt * weatherMult(rt);
    if (s._spreadT < interval) return;
    s._spreadT = 0;
    if ((A.burning || []).length >= maxFires) return;
    const p = structPoint(s);
    let best = null, bd = Infinity;
    for (const cand of A.structs) {
      if (cand === s || !canBurn(cand)) continue;
      const q = structPoint(cand);
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      const down = d > 0 ? Math.max(0, (dx * WIND_STATE.dirX + dz * WIND_STATE.dirZ) / d) : 0;
      const reach = radius * (1 + down * Math.min(2, WIND_STATE.gust || 1));
      // 中心同士ではなく、木の端から測る。石の部品・放火前の保護は canBurn で除く。
      const gap = Math.max(0, edgeDistance(s, q) + edgeDistance(cand, p) - d);
      const score = gap / reach;
      if (score < 1 && score < bd) { bd = score; best = cand; }
    }
    if (best) { best.burn = 3; A.igniteStruct(best, structPoint(best)); }
  }

  // 火のそばは危ない：近くの隊は熱と煙で士気が傷む（味方・敵の区別なし＝攻め手にも危ない）
  const NEAR_R = 11;
  const NEAR_MORALE = 2.4; // すぐそばに居続けた時、秒あたりの目安
  function scareNearby(s, dt) {
    const p = structPoint(s);
    for (const g of A.groups) {
      if (!g.count) continue;
      const c = g.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d >= NEAR_R) continue;
      g.morale = Math.max(5, g.morale - NEAR_MORALE * (1 - d / NEAR_R) * dt);
    }
  }

  return {
    tick(dt) {
      const B = A.burning;
      // 束30：燃え尽きて外れた物の道を開け直す（struct が burning から消えたら）
      if (roadClosed.size) {
        for (const [s, idxs] of roadClosed) if (!B || !B.includes(s)) { openRoad(C, idxs); roadClosed.delete(s); }
      }
      if (!B || !B.length) return;
      for (const s of B) {
        if (!s.alive) continue;
        fireGranary(s);
        trySpread(s, dt);
        scareNearby(s, dt);
        // 束30：燃えている間、4m 内の道をふさぐ。櫓なら上の守りを降ろし、使えなくする
        if (C) {
          if (!roadClosed.has(s)) { const p = structPoint(s); roadClosed.set(s, closeRoadNear(C, p.x, p.z, 4)); }
          if (C.towers && C.towers.includes(s) && !towerSeen.has(s)) { towerSeen.add(s); s.state = '燃える'; dropTowerGuards(rt, s); }
        }
      }
    },
  };
}

// 構造物のそばに、松明で火を放つ的（長押しの interact）を足す。o: { id, at, label, r=4, hold=1.6, maxFires=4 }
export function torchPoint(rt, s, o = {}) {
  const A = rt.army;
  const p = o.at || structPoint(s);
  const id = o.id || `torch_${s.name}_${Math.round(p.x)}_${Math.round(p.z)}`;
  const label = o.label || '松明で火を放つ';
  rt.addInteract(id, p, label, () => {
    rt.uninteract(id);
    rt.unmark(id);
    if ((A.burning || []).length >= (o.maxFires ?? 4)) { rt.bark('これ以上は火が回らぬ'); return; }
    s.burn = 3;
    A.igniteStruct(s, structPoint(s));
  }, { r: o.r ?? 4, hold: o.hold ?? 1.6 });
  rt.marker(id, p, '火を放つ', { h: 2 });
}
