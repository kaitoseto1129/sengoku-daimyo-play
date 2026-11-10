// ======================================================================
// 桶狭間 9〜10分：本陣の左の井伊直盛の備え
//   麓の陣を破ると、本陣の左（西）に構えていた遠江の井伊直盛の備えが、義元を守ろうと前へ出て来る。
//   組と一緒に井伊の備えの槍を破る（四人まで減らすか、井伊を討てば崩れる）。井伊直盛はこの戦で討死した（史実）。
//   崩れた後に本体の「幕の前で旗本を破れ」へ（本陣の幕の前へ入れるのは、ここを破ってから）。一分四十秒で決まらなければ馬廻が押し破る。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.iiT) return;
  v.iiT = rt.t; v.ph = 'ii';
  const g = v.iiG = F.enemies?.find((q) => q.name === '井伊直盛の備え' && q.units.some(ready)) || null;
  // 備えが先の乱戦で減っていれば、井伊の手勢が後ろから加わる（遠江の井伊谷の者）
  if (!g || g.units.filter(ready).length < 9) {
    v.iiAdd = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '井伊の手勢', anchor: C.fieldPoint(-30, -128), facing: 0.3 + C.FIELD_TURN,
      formation: 'yari', spacing: 1.5, width: 6, morale: 85, aggro: 16, seekRange: 34, dmgMult: 0.42, noRout: true, fleeDir: C.fieldVector(-0.5, -1) }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }]);
    v.iiAdd.order = 'attack'; F.enemies?.push(v.iiAdd);
  }
  if (g) { g.guard = false; g.order = 'attack'; g.seekRange = 34; g.aggro = 16; g.focus = null; g.noRout = true; }
  sfx('taiko', 0.9);
  rt.army.playFar?.('toki', (g || v.iiAdd).center(), 1.3);
  rt.say('今川の侍', '遠江の井伊直盛じゃ！　御屋形様の幕へは一人も通さぬ！', 3.4);
  rt.after(3.8, () => rt.say('組頭 源八', '本陣の左から井伊の備えが出たぞ。槍を揃えて受けよ！', 3.2));
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 30; H.aggro = 14; H.focus = null; H.anchor = C.fieldPoint(-14, -104); }
}

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.iiDone || rt.over || F.ending) return;
  const g = v.iiG, lead = g?.units.find((u) => u.name === '井伊直盛') || v.iiAdd?.units.find((u) => u.type === 'samurai');
  const left = (g ? g.units.filter(ready).length : 0) + (v.iiAdd ? v.iiAdd.units.filter(ready).length : 0), t = rt.t - v.iiT;
  // 既に直盛が討たれている時も、名のない手勢が残る間は備えを破った扱いにしない。
  if (left <= 4 && t > 30 || t > 100) {
    v.iiDone = true; v.ph = null;
    // 直盛や手勢の頭が残っていても、破れた備えを攻撃命令のままにしない。
    for (const q of [g, v.iiAdd]) if (q) { q.order = 'retreat'; q.noRout = false; q.morale = 0; q.fleeSet = true; q.fleeDir = C.fieldVector(-0.6, -1); }
    // 井伊直盛は備えが崩れる中で討たれる（史実の討死。寄せた織田の兵の手で）
    if (ready(lead) && lead.name === '井伊直盛') {
      let k = null, best = 3.5 ** 2;
      for (const q of F.attackers || []) for (const o of q.units) {
        if (!ready(o) || o.isPlayer || Math.abs(o.pos.y - lead.pos.y) >= 3) continue;
        const d = (o.pos.x - lead.pos.x) ** 2 + (o.pos.z - lead.pos.z) ** 2;
        if (d < best && !rt.army.wallBetween(o.pos, o.team, lead.pos) && !rt.army.terrainBlocks(o.pos, lead.pos)) {
          best = d; k = o;
        }
      }
      if (k) { lead.invuln = false; lead.officerSaved = true; rt.army.kill(lead, k); }
    }
    sfx('taiko', 1);
    rt.say('組頭 源八', '井伊の備えが崩れたぞ！　幕の前へ進め。義元の旗本はあれじゃ！', 3.6);
    if (t <= 100) rt.award((tr) => tr.side.push('井伊直盛の備えを破った'), '井伊直盛の備えを破った');
  }
}

export function target(rt) {
  const v = rt.flags.o15, P = rt.player.u.pos;
  let best = null, bd = Infinity;
  for (const u of [...(v.iiG?.units || []), ...(v.iiAdd?.units || [])]) {
    if (!ready(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  if (!u) return null;
  const P = rt.player.u.pos;
  if (Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 14) return null;
  return { x: u.pos.x, z: u.pos.z, r: 6, hide: 6, key: 'o15-ii', always: true, area: true };
}
