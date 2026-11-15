// ======================================================================
// 自分の組の稽古（K308 要件47）：侍大将からは、訓練場で自分の組（名簿の名の者）が槍衾の稽古をしている。
//   管理の札は出さない。行って「加わる」と、主人公も列の前に立ち、組頭の号令で皆そろって突く。
//   加わった稽古は一度の城下で一回だけ、組の者の稽古の数（roster.drill）が一つ増える（squad_head.js の古参の重みに入る）。
// ======================================================================
import { allyGroup } from './bhelp.js';

// at：列の真ん中 {x,z}、heading：突く向き
export function kumiDrillSetup(rt, { at, heading = Math.PI }) {
  const G = rt.G;
  if ((G.rank || 0) < 4) return null;
  const R = (G.roster || []).filter((r) => r.alive && !r.wound && (r.kind || 'spear') === 'spear').slice(0, 8);
  if (R.length < 3) return null;
  const head = R.find((r) => r.kashira) || R.reduce((a, r) => ((r.battles || 0) + (r.drill || 0) > (a.battles || 0) + (a.drill || 0) ? r : a), R[0]);
  const sx = Math.cos(heading), sz = -Math.sin(heading);   // 列の横の向き
  const fx = Math.sin(heading), fz = Math.cos(heading);    // 前
  const men = [];
  R.forEach((r, i) => {
    const row = i < 4 ? 0 : 1, col = (i % 4) - 1.5;
    const x = at.x + sx * col * 1.3 - fx * row * 1.4, z = at.z + sz * col * 1.3 - fz * row * 1.4;
    const g = allyGroup(rt, { name: '組の稽古', anchor: { x, z }, fixed: true, facing: heading, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0 },
      [{ type: 'ashigaru', n: 1, o: { flag: null, invuln: true, name: r.name, face: r.face, hat: i % 2 ? 'hachimaki' : 'none' } }]);
    const u = g.units[0];
    if (!u) return;
    u.noTarget = true; u.name = r.name;
    men.push({ u, r });
  });
  const D = rt.flags.kumiDrill = { men, head, heading, beat: 0, next: 2, joined: false, said: 0, at };
  rt.addInteract('kumi-drill', { x: at.x + fx * 2.2, z: at.z + fz * 2.2 }, '加わる　自分の組の槍衾の稽古', () => join(rt), { r: 3 });
  return D;
}

function join(rt) {
  const D = rt.flags.kumiDrill;
  if (!D || D.joined || rt.choice) return;
  D.joined = true;
  const p = rt.player, fx = Math.sin(D.heading), fz = Math.cos(D.heading);
  const x = D.at.x + fx * 1.5, z = D.at.z + fz * 1.5;
  p.u.pos.set(x, rt.world.heightAt(x, z), z);
  p.u.heading = D.heading; p.yaw = D.heading; p.camYawOff = 0;
  if (p.u.mesh) p.u.mesh.position.copy(p.u.pos);
  for (const m of D.men) m.r.drill = (m.r.drill || 0) + 1;
  rt.say(D.head.name, 'お頭が加わったぞ！　穂先を揃えい', 3);
  rt.hud.flash(`組の${D.men.length}人と槍衾を稽古した　組の者の稽古＋1`);
  rt.uninteract('kumi-drill');
}

// 毎コマ：組頭の拍子で、皆いっせいに突く（揃って突くのが槍衾）
export function kumiDrillTick(rt) {
  const D = rt.flags.kumiDrill;
  if (!D || rt.t < D.next) return;
  D.next = rt.t + 1.6;
  D.beat++;
  for (const m of D.men) {
    const u = m.u;
    if (!u.alive || u.swing) continue;
    u.heading = D.heading;
    u.swing = { kind: 'thrust', t: 0, dur: .32, at: 0, done: true, target: null, res: null, d: 1.4, side: 1 };
  }
  const p = rt.player.u.pos;
  if (Math.hypot(p.x - D.at.x, p.z - D.at.z) < 14 && D.beat % 3 === 0 && D.said++ < 6) rt.say(D.head.name, ['構え！', '揃えて、突け！', '退くな、穂先を下ろすな！'][D.said % 3], 1.5);
}
