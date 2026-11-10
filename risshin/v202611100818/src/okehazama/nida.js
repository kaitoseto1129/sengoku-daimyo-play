// ======================================================================
// 桶狭間 7〜9分：桶狭間山の麓の今川の陣（小荷駄と雨宿りの備え）
//   『信長公記』：雨が上がって織田勢がかかると、今川の前の備えは「水をまくように」崩れ、弓・槍・鉄砲・旗・指物を捨てて逃げた。
//   松井の先手を破った先、本陣の幕の下には、雨宿りから立ち上がったばかりの今川の組と、俵を積んだ小荷駄が入り乱れる（敵兵の混乱）。
//   組と一緒に麓の陣を破ると、服部小平太・毛利新介ら馬廻が前へ出て、本陣の幕の前へ（本体の「幕の前で旗本を破れ」）。
//   二分で決まらなければ、麓の陣は崩れて山の奥へ逃げる（物語は進む）。小荷駄の俵は形の基本形（props の tawara）。
// ======================================================================
import { sfx } from '../audio.js';
import { tawara } from '../props.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const live = (g) => g && !g.routed && g.units.some(ready);

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.nidaT) return;
  v.nidaT = rt.t; v.ph = 'nida';
  const W = rt.world;
  // 小荷駄の俵と、雨に濡れて倒れかけた幟（基本形だけ）
  try {
    for (let i = 0; i < 5; i++) {
      const p = C.fieldPoint(-20 + (i % 3) * 3.2, -92 + Math.floor(i / 3) * 3);
      const o = tawara(W, p.x, p.z, 0.5 * i, 4); if (o) rt.scene.add(o);
    }
  } catch (e) { /* 俵が置けなくても戦は進む */ }
  const mk = (name, x, z, f, list, morale) => {
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name, anchor: C.fieldPoint(x, z), facing: f + C.FIELD_TURN,
      formation: 'yari', spacing: 1.5, width: 6, morale, aggro: 8, seekRange: 16, dmgMult: 0.42, fleeDir: C.fieldVector(0.2, -1) }, list);
    F.enemies?.push(g);
    return g;
  };
  v.nidaGs = [
    mk('今川の小荷駄', -16, -88, 0.2, [{ type: 'ashigaru', n: 7, o: { weapon: 'sword', reach: 1.75 } }], 30),
    mk('雨宿りの今川勢', 6, -84, 0, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], 60),
    mk('雨宿りの今川勢', 30, -80, -0.3, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 2 }], 60),
  ];
  sfx('taiko', 0.9);
  rt.army.playFar?.('eshout', C.fieldPoint(8, -86), 1.2);
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 30; H.aggro = 14; H.focus = null; H.anchor = C.fieldPoint(-4, -84); }
  rt.after(1, () => rt.say('組頭 源八', '松井の先手は破った！　麓の陣へ突っ込め。雨宿りの今川勢は槍も揃えておらぬ！', 3.8));
  rt.after(5.5, () => rt.say('今川の足軽', 'な、何じゃ、どこの勢じゃ！　織田か！？', 2.8));
  rt.after(9, () => rt.say('足軽', '小荷駄の者が俵を捨てて逃げてゆくぞ！', 2.8));
  // 服部・毛利ら馬廻が前へ
  rt.after(18, () => {
    if (v.nidaDone) return;
    const [hat, mor] = F.nobKill || [];
    if (ready(hat)) rt.say('服部小平太', '新介、前へ出るぞ！　義元の幕はあの上じゃ！', 3.2);
    rt.after(3.4, () => { if (ready(mor)) rt.say('毛利新介', 'おう！　この新介、遅れは取らぬ！', 2.8); });
    if (F.nob && !F.nob.routed) { F.nob.order = 'attack'; F.nob.seekRange = 26; F.nob.anchor = C.fieldPoint(8, -88); }
  });
}

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.nidaDone || rt.over || F.ending) return;
  const t = rt.t - v.nidaT;
  if (!v.nidaGs.some(live) && t > 50 || t > 120) done(rt, C, t > 120);
}

function done(rt, C, late) {
  const F = rt.flags, v = F.o15;
  v.nidaDone = true; v.ph = null;
  // 組頭が生きている備えにも、知らせどおり退く下知を渡す。
  for (const g of v.nidaGs) if (live(g)) { g.order = 'retreat'; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0.4, -1); }
  sfx('taiko', 1);
  rt.say('組頭 源八', late ? '麓の陣は崩れて山の奥へ逃げた。幕の前へ進め！' : '麓の陣を破ったぞ！　見よ、旗も槍も捨てて逃げておる。幕の前へ進め！', 3.6);
  if (!late) rt.award((t) => t.side.push('桶狭間山の麓の今川の陣を破った'), '桶狭間山の麓の今川の陣を破った');
  rt.after(14, () => { for (const g of v.nidaGs) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 40) rt.army.despawn(u); });
}

export function target(rt) {
  const v = rt.flags.o15, P = rt.player.u.pos;
  let best = null, bd = Infinity;
  for (const g of v.nidaGs || []) for (const u of g.units) {
    if (!ready(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  if (!u) return null;
  // 近い戦いでも、次に進む場所のピンを残す。
  return { x: u.pos.x, z: u.pos.z, r: 6, hide: 6, key: 'o15-nida', always: true, area: true };
}
