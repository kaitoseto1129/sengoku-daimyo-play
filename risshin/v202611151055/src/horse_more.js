// 馬を乗れる物に（kaito 11/9 天王寺の声 13）：
//   ・繋いだ馬（tetherHorse）：本陣の替え馬・杜に繋いだ馬など、立っているだけの馬を空馬の列（army.looseHorses）に入れ、寄れば R・長押しで乗れる
//   ・本陣の替え馬（spareHorses）：味方の本陣（大将のいる組・本陣・旗本）の後ろに馬つなぎの杭と替えの馬を三頭。一戦に一度
//   ・味方の騎馬から馬を借りる（borrowAllyHorse）：徒歩の時、すぐそばの名の無い味方の騎馬武者の馬に R で乗る（乗り手は下りて徒歩の侍に）
// 重さ：馬は buildHorse の形の使い回し（毛色ごとに一つ）。杭は一つの形にまとめる。動かすのは今の空馬の仕組み（止まった馬は動かさない）
import { buildHorse, horseStyleFor, TYPES } from './units.js';
import { umatsunagi } from './props.js';
import { groundAt } from './floors.js';

export function tetherHorse(army, h, x, z, heading, team, name = '替え馬') {
  if (!army || !h) return null;
  const L = army.looseHorses || (army.looseHorses = []);
  h.position.set(x, groundAt(army.world, x, z, h.position.y || 0), z); h.rotation.set(0, heading, 0);
  if (!h.parent) army.scene.add(h);
  const o = {
    h, heading, spd: 0, t: 99, kept: true, calm: true, tame: true, tied: true,
    from: { team, house: '', name: '' },
    stats: { horse: h, name, speed: 1, max: 150, hp: 150, maxBreath: 100, breath: 100, hfat: 0, yariResist: 1, warned: false, spoil: null },
  };
  L.push(o);
  return o;
}

// 本陣の後ろ（敵と逆の側）に馬つなぎと替えの馬
export function spareHorses(rt) {
  const army = rt.army, def = rt.def || {};
  if (!army || def.noHorse || def.dojo || def.noSpareHorse || def.town) return;
  const gs = army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.civ && g.count > 0 && (g.lordHere || /(本陣|旗本)/.test(g.name || '')));
  const g = gs.find((q) => q.lordHere) || gs[0];
  if (!g) return;
  const c = g.anchor || g.center();
  let ex = 0, ez = 0, n = 0;
  for (const u of army.units) if (u.alive && u.team === 1 && !u.isStruct && (n++ % 4 === 0)) { ex += u.pos.x; ez += u.pos.z; }
  const m = Math.ceil(n / 4);
  const away = m ? Math.atan2(c.x - ex / m, c.z - ez / m) : (g.facing ?? 0) + Math.PI;
  const bx = c.x + Math.sin(away) * 14, bz = c.z + Math.cos(away) * 14;
  const lim = def.moveLim || 176;
  if (Math.abs(bx) > lim - 4 || Math.abs(bz) > lim - 4 || army.walledIn?.({ x: bx, z: bz })) return;
  // 縄は敵の向きと直角に張り、馬は縄へ首を向けて並ぶ
  const rot = away + Math.PI / 2;
  const post = umatsunagi(army.world, bx, bz, rot, 7);
  post.userData.spareHorse = true;
  army.scene.add(post);
  const fac = g.faction || 'oda';
  const ca = Math.cos(rot), sa = Math.sin(rot);
  for (let i = 0; i < 3; i++) {
    const lx = (i - 1) * 2.2;
    const x = bx + lx * ca + Math.sin(away) * 1.3, z = bz - lx * sa + Math.cos(away) * 1.3;
    const h = buildHorse(horseStyleFor(31 + i * 7, 1, fac));
    tetherHorse(army, h, x, z, away + Math.PI, 0);
  }
}

// すぐそばの名の無い味方の騎馬武者から馬を借りる。乗れたら true
export function borrowAllyHorse(p) {
  const rt = p.rt, u = p.u, army = rt.army;
  if (p.mounted || !p.canRide || p.mayRide === false || !u.alive || rt.def?.noHorse) return false;
  let best = null, bd = 3.2;
  for (const a of army.units) {
    if (a === u || !a.alive || a.team !== u.team || !a.mounted || !a.horse || a.isPlayer || a.name || a.isLord || a.invuln || a.type === 'busho') continue;
    const d = Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z);
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) return false;
  const a = best, h = a.horse;
  army.setMounted(a, false);
  a.horse = null; a.charging = false; a.horseBattle = 'foot';
  if (a.type === 'cavalry') { const S = TYPES.samurai; a.type = 'samurai'; a.speed = S.speed; a.run = S.run; }
  if (h.parent) h.parent.remove(h);
  const x = a.pos.x, z = a.pos.z;
  // 乗り手は馬の左へ下りる
  a.pos.x += Math.cos(a.heading) * 1.1; a.pos.z -= Math.sin(a.heading) * 1.1;
  h.position.set(x, a.pos.y, z); h.rotation.set(0, a.heading, 0);
  army.scene.add(h);
  const L = army.looseHorses || (army.looseHorses = []);
  const o = { h, heading: a.heading, spd: 0, t: 0, tame: true, calm: true,
    from: { team: a.team, house: '', name: '', speed: Math.max(0.9, Math.min(1.12, (a.run || 8.5) / 8.5)), hp: a.horseHp ?? 140, maxHp: a.horseMax ?? 140, hfat: a.hfat || 0 } };
  L.push(o);
  u.pos.x = x - Math.cos(a.heading) * 0.4; u.pos.z = z + Math.sin(a.heading) * 0.4;
  p.takeHorse(o);
  return p.mounted;
}
