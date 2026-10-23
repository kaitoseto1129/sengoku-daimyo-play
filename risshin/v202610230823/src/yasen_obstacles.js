// 野戦の陣地。史実の配置を決める物ではなく、戦の定義が指定した並びを作る。
// plan = { team, fences: [{ pts, hp, gaps }], moats: [{ pts, width, depth }],
//          abatis: [{ pts, gaps, facing }], tabas: [{ pts, gaps, facing }] }
// pts は [[x,z],…]。gaps は空ける区画番号。facing は外向き（0 は +z）。
// 地形を作る前に world.height = fieldworkHeight(元の高さ, plan)。
// setup で F.jinchi = buildFieldworks(rt, plan)、update で F.jinchi.tick(dt)。
// 攻め手は F.jinchi.advance(既存の組, { from, to })。兵は追加しない。
import { palisade, bobosaku, sakamogi, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch } from './props.js';
import { horiboriHeight } from './castle_parts.js';
import { addTaba, patchGunCover, placeTaba } from './taketaba.js';

// 既存の馬防柵にも同じ当たり・倒れる仕組みを使う。形と材質は既存の物。
export function addFieldFence(rt, seg, o = {}) {
  const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
  if (len < 0.01) return null;
  const hp = o.hp ?? 400;
  const s = rt.army.addStruct({ ...o, seg, hp, maxHp: hp, team: o.team ?? 0,
    name: o.name || '柵', nx: o.nx ?? -(seg[3] - seg[1]) / len,
    nz: o.nz ?? (seg[2] - seg[0]) / len, noClimb: true });
  s.mesh = (o.horse ? bobosaku : palisade)(rt.world, seg, { batch: o.batch || null });
  if (!s.mesh.isBatchedPart) rt.scene.add(s.mesh);
  return s;
}

function segments(line, step = 6) {
  const out = [], pts = line.closed ? [...line.pts, line.pts[0]] : line.pts;
  let idx = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const n = Math.max(1, Math.ceil(len / Math.max(0.5, line.segLen ?? step)));
    for (let j = 0; j < n; j++, idx++) {
      if ((line.gaps || []).includes(idx)) continue;
      out.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n,
        ax + (bx - ax) * (j + 1) / n, az + (bz - az) * (j + 1) / n]);
    }
  }
  return out;
}

// 空堀は地面そのものを下げる。土橋や抜け道は gaps で切り、底を板で隠さない。
export function fieldworkHeight(base, plan) {
  const dips = [];
  for (const line of plan.moats || []) for (const seg of segments(line)) {
    dips.push(horiboriHeight([[seg[0], seg[1]], [seg[2], seg[3]]], line));
  }
  return (x, z) => {
    let dip = 0;
    for (const h of dips) dip = Math.min(dip, h(x, z));
    return base(x, z) + dip;
  };
}

function distance(x, z, seg) {
  const dx = seg[2] - seg[0], dz = seg[3] - seg[1];
  const t = Math.max(0, Math.min(1, ((x - seg[0]) * dx + (z - seg[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - seg[0] - dx * t, z - seg[1] - dz * t);
}

export function buildFieldworks(rt, plan = {}) {
  const team = plan.team ?? 0, fences = [], tabas = [], bands = [], advances = [];
  const fb = makeSimpleBatch(), kb = makeKitBatch();
  for (const line of plan.fences || []) for (const seg of segments(line)) {
    fences.push(addFieldFence(rt, seg, { ...line, team, batch: fb }));
  }
  finalizeSimpleBatch(rt, fb);
  for (const line of plan.abatis || []) for (const seg of segments(line)) {
    const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    const facing = line.facing ?? Math.atan2(-(seg[3] - seg[1]), seg[2] - seg[0]);
    const x = (seg[0] + seg[2]) / 2, z = (seg[1] + seg[3]) / 2;
    sakamogi(rt.world, x, z, facing, len, kb);
    // 梢の伸びる側を帯の中心にする。歩兵を遅くし、騎馬の突撃を止める既存の帯。
    const dx = Math.sin(facing) * 1.6, dz = Math.cos(facing) * 1.6;
    bands.push(rt.army.addStruct({ team, name: '逆茂木', hp: 1e9, maxHp: 1e9,
      x: x + dx, z: z + dz,
      band: [seg[0] + dx, seg[1] + dz, seg[2] + dx, seg[3] + dz], bandR: 1.8, noTarget: true }));
  }
  finalizeKitBatch(rt, kb);
  for (const line of plan.moats || []) for (const seg of segments(line)) {
    bands.push(rt.army.addStruct({ team, name: '空堀', hp: 1e9, maxHp: 1e9,
      x: (seg[0] + seg[2]) / 2, z: (seg[1] + seg[3]) / 2,
      band: seg, bandR: (line.width ?? 4.5) / 2, noTarget: true }));
  }
  for (const line of plan.tabas || []) for (const seg of segments(line, 2.2)) {
    tabas.push(addTaba(rt, (seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2, team,
      { fixed: true, rot: line.facing ?? Math.atan2(-(seg[3] - seg[1]), seg[2] - seg[0]) }));
  }
  for (const tb of tabas) tb.m.userData.noFreeze = true;
  patchGunCover(rt);

  const works = {
    fences, tabas, bands,
    // from は柵の手前の寄せ場、to は破った後の行き先。組の向きもそこへ揃える。
    advance(g, o) {
      if (!g || g.team === team || !g.count || advances.some((a) => a.g === g && !a.done)) return null;
      const c = g.center(), dx = o.from.x - c.x, dz = o.from.z - c.z, len = Math.hypot(dx, dz);
      const rot = len > 0.01 ? Math.atan2(dx, dz) : g.facing;
      const a = { g, from: { ...o.from }, to: { ...o.to }, speed: g.speed, oldAssault: g.assault,
        oldArrive: g.onArrive, tabas: [], t: 0, attached: false, done: false };
      g.order = 'move'; g.dest = a.from; g.speed = o.speed ?? 1.2; g.facing = rot;
      const n = Math.max(1, Math.min(5, Math.ceil(g.count / 3)));
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 1.9;
        const tb = addTaba(rt, c.x + Math.sin(rot) * 2.8 + Math.cos(rot) * off,
          c.z + Math.cos(rot) * 2.8 - Math.sin(rot) * off, g.team, { fixed: true, rot, van: g, off });
        tb.m.userData.noFreeze = true;
        a.tabas.push(tb);
      }
      // 各兵が近い区画へ取り付く。倒れた区画へ来た兵はそこから内側へ入る。
      g.assault = (u) => {
        let best = null, bd = Infinity;
        for (const s of fences) {
          const d = distance(u.pos.x, u.pos.z, s.seg);
          if (d < bd) { bd = d; best = s; }
        }
        return best && best.alive ? best : a.to;
      };
      g.onArrive = () => { a.attached = true; g.order = 'assault'; g.speed = a.speed; };
      advances.push(a);
      return a;
    },
    tick(dt) {
      for (const a of advances) {
        if (a.done) continue;
        const g = a.g;
        a.t += dt;
        if (!g.count || g.routed || (a.attached && g.order !== 'assault') || (!a.attached && g.order !== 'move')) {
          g.speed = a.speed; g.assault = a.oldAssault; g.onArrive = a.oldArrive;
          for (const tb of a.tabas) tb.van = null;
          a.done = true;
          continue;
        }
        if (!a.attached) {
          const c = g.center(), rot = g.facing, k = Math.min(1, dt * 2);
          for (const tb of a.tabas) {
            tb.x += (c.x + Math.sin(rot) * 2.8 + Math.cos(rot) * tb.off - tb.x) * k;
            tb.z += (c.z + Math.cos(rot) * 2.8 - Math.sin(rot) * tb.off - tb.z) * k;
            tb.rot = rot; placeTaba(rt, tb);
          }
          // 組全体が揃わなくても先手が寄せ場へ来たら据えて取り付く。
          if (Math.hypot(c.x - a.from.x, c.z - a.from.z) < 4 || a.t > 45) g.onArrive();
        } else if (!fences.some((s) => s.alive)) {
          g.speed = a.speed; g.assault = a.oldAssault; g.onArrive = a.oldArrive;
          g.order = 'move'; g.dest = a.to;
          for (const tb of a.tabas) tb.van = null;
          a.done = true;
        }
      }
    },
  };
  return works;
}
