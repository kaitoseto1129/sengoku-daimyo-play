// ======================================================================
// 後から出る名のある武将の作り置き（army_reserve.js。kaito 10/27「全部やろう」①）
// 戦の途中で出る名のある武将（援軍・def.famous）は、一人作るのに軽い形と馬で
// 携帯 0.1〜0.3 秒止まっていた（姉川の稲葉一鉄など）。支度の間に同じ姿で一度作り、
// 軽い形の部品と馬を置き場に取っておく。出る時は置き場から取って置くだけ。
// 見た目・人数・強さは変わらない（姿が一致した時だけ使い、違えば今までどおり作る）。
// 顔の絵も支度で作る（humans_prepare.js の faceJobs が army.reserveUnits を見る）。
//   戦の定義：def.reserve = [{ team, faction, type, o }] か (rt) => [...]（隊の家と兵の指定は出す時と同じに）
//   def.famous は自動で入れる（家は e.faction か、その側でいちばん大きな隊の家）
// ======================================================================
import { Group } from './units_group.js';

const own = (t) => { const o = { ...t }; delete o.team; delete o.type; delete o.isPlayer; delete o.id; return o; };
const pushTo = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

export function reserveKey(u, look) { return u.team + '|' + u.type + '|' + JSON.stringify(look); }

// addUnit の軽い形を作る所：置き場に同じ姿があれば使う。作り置きの間は、もう一組作って置き場へ
export function reservedModel(A, u, look, build) {
  const R = A.reserve;
  if (!R || !u.name) return false;
  const k = reserveKey(u, look);
  if (A.reserving) {
    const t = { team: u.team, type: u.type, isPlayer: false, id: u.id };
    build(t, look);
    pushTo(R.model, k, own(t));
    return false;
  }
  const p = R.model.get(k)?.pop();
  if (!p) return false;
  Object.assign(u, p);
  u.mesh._unit = u;
  R.hits++;
  return true;
}
// 馬：名で取る（毛色は一頭ずつ違うので、同じ名の者に作った馬をそのまま使う）
export function reservedHorse(A, u, make) {
  const R = A.reserve;
  if (!R || !u.name) return make();
  const k = u.team + '|' + u.name;
  if (A.reserving) { pushTo(R.horse, k, make()); return make(); }
  return R.horse.get(k)?.pop() || make();
}

function famousSpecs(rt) {
  const out = [];
  for (const e of rt.def.famous || []) {
    const team = e.team ?? 1;
    if ((e.lord === false && rt.G.lord) || (e.lord === true && !rt.G.lord)) continue;
    let faction = e.faction;
    if (!faction) {
      let best = null;
      for (const g of rt.army.groups) if (g.team === team && !g.isPlayerSquad && (!best || g.count > best.count)) best = g;
      faction = best?.faction;
    }
    if (!faction) continue;
    out.push({ team, faction, type: 'busho', o: { name: e.name, flag: e.flag, horse: rt.def.noHorse ? false : e.horse, invuln: team === 0 && !e.mortal } });
  }
  return out;
}

// 戦の支度（def.setup の後）に一度だけ呼ぶ
export function reserveLater(rt) {
  const A = rt.army, def = rt.def;
  if (!A || def.dojo || def.town) return 0;
  const extra = typeof def.reserve === 'function' ? def.reserve(rt) : def.reserve;
  const specs = [...(Array.isArray(extra) ? extra : []), ...famousSpecs(rt)];
  if (!specs.length) return 0;
  A.reserve = { model: new Map(), horse: new Map(), hits: 0 };
  A.reserveUnits = [];
  A.reserving = true;
  try {
    for (const s of specs) {
      if (!s?.o?.name || A.units.some((u) => u.name === s.o.name)) continue;
      const g = new Group({ team: s.team ?? 1, faction: s.faction, name: s.group || '', order: 'hold', anchor: { x: 0, z: 0 }, facing: 0, morale: 100 });
      try {
        const u = A.addUnit(g, { type: s.type || 'busho', x: 0, z: 0, ...s.o });
        A.scene.remove(u.mesh);
        const i = A.units.indexOf(u);
        if (i >= 0) A.units.splice(i, 1);
        u.gone = true; u.alive = false;
        A.reserveUnits.push(u);
      } catch (e) { /* 作れない者は、出る時に今までどおり作る */ }
    }
  } finally { A.reserving = false; }
  return A.reserveUnits.length;
}
