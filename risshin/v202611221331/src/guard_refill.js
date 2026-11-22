// 11/20 夜 K466・K468（cloud-26・司令塔）：単騎の武将を減らす戦の側の共通の手。三方ヶ原（b_mikatagahara.js）で手本（単騎の延べ 49.7→17.3・6回達成）。
//   設楽原にも入れて試したが、敵の単騎の延べ 平均128→123 で効かず外した（武田の将は寄せの筋書き nfSend が組の下知を毎回出し直す）。
//   二秒ごとに、本人の敵の名のある将（o.skip で外す将を除く）で：
//   ① 旗本（武将の組で武将のほかに立つ兵）が二人以下 → 組ごと o.home(rt, u, g) の所へ帰す（帰る間は斬り合いに入らない）
//   ② 旗本が三〜七人 → 将の十m 後ろに o.make(rt, n, at, facing) で後詰を立て、その兵を将の組へ入れて十人ほどにする
//     （本物の兵が o.cap（既定 230）を越える間は足さない・一つの組に四十五秒に一度）
export function guardTick(rt, o) {
  if (typeof window !== 'undefined' && o.off && window[o.off]) return;
  const F = rt.flags, key = o.key || '_grT';
  if (F.ending || rt.over || !o.active(rt) || (F[key] || 0) > rt.t) return;
  F[key] = rt.t + 2;
  const units = rt.army.units, me = rt.player.u, cap = o.cap ?? 230;
  let alive = 0; for (const u of units) if (u.alive && !u.gone && !u.isStruct) alive++;
  for (const u of units) {
    if (!u.alive || u.gone || u.type !== 'busho' || !u.name || u.team === me.team || u.fleeing || u._standIn || (o.skip && o.skip(u))) continue;
    const g = u.group; if (!g || g.routed || g.honjin || g._grHome) continue;
    const guard = g.units.filter((v) => v !== u && v.alive && !v.gone && !v.fleeing).length;
    if (guard <= 2 && !(o.noHome && o.noHome(u))) {   // o.noHome：任務で討つ将（設楽原の山県・馬場）は帰さず後詰だけ
      const h = o.home(rt, u, g); if (!h) continue;
      g._grHome = true; g.order = 'move'; g.dest = { x: h.x, z: h.z }; g.focus = null; g.path = null; g.retreatOnly = true; g.aggro = 0; g.seekRange = 0;
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: h.x, z: h.z }; q.dest = null; q.onArrive = null; };
      for (const v of g.units) if (v.alive) { v.target = null; v.atk = null; v.moveTo = null; }
      continue;
    }
    if (guard > 7 || alive > cap || (g._grAddT || 0) > rt.t) continue;
    g._grAddT = rt.t + 45;
    const n = Math.min(10 - guard + 2, cap - alive); if (n < 2) continue;
    const f = g.forward ? g.forward() : { x: 0, z: 1 }, at = { x: u.pos.x - f.x * 10, z: u.pos.z - f.z * 10 };
    const add = o.make(rt, n, at, g.facing ?? 0, u);
    if (!add || !add.units) continue;
    for (const v of add.units.slice()) {
      add.units = add.units.filter((q) => q !== v); v.group = g; g.units.push(v);
      const used = new Set(g.units.filter((q) => q !== v && q.alive && !q.gone).map((q) => q.slot)); let s = 0; while (used.has(s)) s++; v.slot = s;
    }
    g.initial = Math.max(g.initial || 0, g.units.filter((q) => q.alive).length); g._slotChkAt = 0; g._fitAt = 0;
    alive += n;
  }
}

// 11/21 cloud-21（司令塔：長久手の退く段で本人が囲まれて倒れた）：設楽原の shGuard（b_shitaragahara.js）を共通にした形。
//   本人の命が o.hp（既定四割五分）以下で、三歩半の内に敵が三人以上いる時、本人から o.R（既定四十五m）内の味方の組（本人の組・鉄砲・弓・筋書きの道行きは除く）を
//   本人の横へ寄せて斬り合わせる（殿の組が本人の横を守る）。敵は弱めない・兵は足さない。一度寄せたら o.cd 秒（既定二十五秒）待つ。
export function sideGuard(rt, o = {}) {
  const F = rt.flags, me = rt.player?.u, key = o.key || '_sgT';
  if (!me?.alive || F.ending || rt.over || (F[key] || 0) > rt.t || (o.active && !o.active(rt))) return 0;
  if (!(me.hp <= (me.maxHp || 110) * (o.hp ?? 0.45))) return 0;
  // o.shot：鉄砲・弓に撃たれ続けている時も寄せる（根来の築地塀の鉄砲など。最後の傷が飛び道具で四秒内なら、囲まれていなくても）
  const LH = rt.player.lastHit, shotNow = !!(o.shot && LH && LH.ranged && rt.t - (LH.t ?? -99) < 4);
  let near = 0;
  if (!shotNow) for (const e of rt.army.units) { if (!e.alive || e.gone || e.team === me.team || e.fleeing || e.isStruct || e.noTarget) continue; if (Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < (o.nearR ?? 3.5)) near++; }
  if (!shotNow && near < (o.nearN ?? 3)) { F[key] = rt.t + 1; return 0; }   // o.nearR・o.nearN：槍の間合い（四m余り）から突かれる戦は広く数える（高遠 11/21）
  F[key] = rt.t + (o.cd ?? 25);
  const R = o.R ?? 45, p = me.pos; let n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== me.team || g.routed || !g.count || g.isPlayerSquad || g.civ || g.order === 'path' || g.isGun) continue;
    if (g.units.every((w) => w.type === 'gun' || w.type === 'bow' || w.civ)) continue;
    if (o.skipGroup && o.skipGroup(g)) continue;   // 11/21 cloud-09：台本で持ち場に縛った組（伏見の三の丸の家忠・近正 noAI）を戦の側で外す
    const c = g.center?.(); if (!c || Math.hypot(c.x - p.x, c.z - p.z) > R) continue;
    // 撃たれている時は、本人と撃ち手の間（本人から撃ち手の方へ四m）に立って背を守る
    let ax = p.x, az = p.z;
    if (shotNow && LH.x != null) { const dx = LH.x - p.x, dz = LH.z - p.z, l = Math.hypot(dx, dz) || 1; ax += dx / l * 4; az += dz / l * 4; }
    g.focus = null; g.dest = null; g.path = null; g.anchor = { x: ax, z: az };
    g.stay = false; g.order = 'attack'; g.aggro = Math.max(g.aggro || 0, 12); g.seekRange = Math.max(g.seekRange || 0, 24); n++;
  }
  return n;
}
