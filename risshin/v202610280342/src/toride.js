// ======================================================================
// toride.js … 束34：峠・橋・川の砦の決まり（docs/battle-system-plan.md 束34）
// ほかの仕組み（siege_zones.js・tsumari.js・senkyo.js）の上に薄く足すだけ。共通のファイルは直さない。
// 戦の定義の側が o に足した時だけ働く（足さなければ何も変わらない）。
//
// 使い方（戦の定義から）：
//   import { passRule, bridgeRule, fordWatch } from './toride.js';
//   const PR = passRule(rt, { fortZoneId: 'toge', beyond: (x, z) => z > 40, penalty: 3 });
//   const BR = bridgeRule(rt, { bridge: { a: { x: -3, z: 0 }, b: { x: 3, z: 0 } }, hp: 220, team: 1, C, navId: 'hashi' });
//   const FW = fordWatch(rt, { fords: [[40, 10]], team: 0 });
//   // update の中で毎コマ：PR.tick(dt); BR.tick(dt); FW.tick(dt);
// ======================================================================
import { logEvent } from './senkyo.js';
import { addChoke } from './tsumari.js';

const NEWS_GAP = 8;   // 同じ知らせは8秒に一度まで

// 峠の砦を取らずに先へ出た攻め手は、interval 秒ごとに士気 -penalty と知らせ【束34】
// o: { fortZoneId（rt.flags.SZ の区域 id）, beyond(x,z)=>bool, team=0, penalty=3, interval=30 }
export function passRule(rt, o = {}) {
  const { fortZoneId, beyond, team = 0, penalty = 3, interval = 30 } = o;
  let t = 0, lastSaid = -999;
  return {
    tick(dt) {
      const SZ = rt.flags && rt.flags.SZ;
      const taken = SZ && SZ.byId && SZ.byId[fortZoneId] && SZ.byId[fortZoneId].owner === '味方支配';
      if (taken) { t = 0; return; }
      let any = false;
      for (const g of rt.army.groups) {
        if (g.team !== team || !g.count) continue;
        const c = g.center();
        if (beyond(c.x, c.z)) { any = true; break; }
      }
      if (!any) { t = 0; return; }
      t += dt;
      if (t < interval) return;
      t = 0;
      for (const g of rt.army.groups) if (g.team === team) g.morale = Math.max(5, g.morale - penalty);
      logEvent(rt, 'supplyCut', { team });
      if ((rt.t || 0) - lastSaid >= NEWS_GAP) { lastSaid = rt.t || 0; rt.bark('補給の道が危ない'); }
    },
  };
}

// 橋：maxFlow の口（tsumari.addChoke）・橋の上は横に広がれない（陣形 column）・守りが橋を落とせる
// o: { bridge: { a:{x,z}, b:{x,z}, w }, hp=200, team=1（橋の持ち主＝落ちると困る側）, name, C, navId, maxFlow }
export function bridgeRule(rt, o = {}) {
  const { bridge, hp = 200, team = 1, name = '橋', C = null, navId = null, maxFlow = 12 } = o;
  const seg = [bridge.a.x, bridge.a.z, bridge.b.x, bridge.b.z];
  const s = rt.army.addStruct({ seg, hp, maxHp: hp, team, name });
  const choke = addChoke(rt, { a: bridge.a, b: bridge.b, w: bridge.w, maxFlow, kind: '橋', team });
  let down = false;
  // 橋の上（a-b の線の近く）にいる自隊は、横に広がれない（陣形を column に）
  function keepColumn() {
    const mx = (bridge.a.x + bridge.b.x) / 2, mz = (bridge.a.z + bridge.b.z) / 2;
    const r = Math.hypot(bridge.b.x - bridge.a.x, bridge.b.z - bridge.a.z) / 2 + 4;
    for (const g of rt.army.groups) {
      if (!g.count) continue;
      const c = g.center();
      if (Math.hypot(c.x - mx, c.z - mz) < r) g.formation = 'column';
    }
  }
  return {
    struct: s,
    get down() { return down; },
    tick() {
      keepColumn();
      if (down || s.alive) return;
      down = true;
      logEvent(rt, 'bridgeDown', { team, who: name });
      rt.bark(`${name}が落ちた`, true);
      if (choke) choke.maxFlow = 0;
      if (C && navId && C.setGateOpen) C.setGateOpen(navId, false);
    },
  };
}

// 浅瀬・舟着場を物見の見張りに足す（束25 seenBy がまだ無いため、距離だけで見る簡略版）
// o: { fords: [[x,z], ...], team（見張る側）, range=30 }
export function fordWatch(rt, o = {}) {
  const fords = (o.fords || []).map(([x, z]) => ({ x, z, spotted: false }));
  const team = o.team ?? 0, range = o.range ?? 30;
  return {
    fords,
    tick() {
      for (const f of fords) {
        if (f.spotted) continue;
        for (const g of rt.army.groups) {
          if (g.team === team || !g.count) continue;
          const c = g.center();
          if (Math.hypot(c.x - f.x, c.z - f.z) < range) { f.spotted = true; logEvent(rt, 'fordSpotted', { team, who: null, v: [f.x, f.z] }); rt.bark('浅瀬に敵影あり'); break; }
        }
      }
    },
  };
}
