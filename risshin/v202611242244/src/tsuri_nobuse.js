// 島津家編の「釣り野伏せ」三拍の共通の手（H3・docs/house_shimazu.md ①）。b_s01_kizakibaru.js の作りを、戸次川・耳川でも使い回すために取り出した
//   ①囮が当たる ②退いて、追う敵の備が道に長く伸びる ③左右に伏せた備が旗を立てて出る（bhelp.js の ambush＝しゃがみの作り）
//   段の並びは s01 と同じ（0 当たる・1 退く・2 林の間で待つ・3 大将の備）。字・札・ボタンは足さない
import { allyGroup } from './bhelp.js';
import { preFoes } from './b_depth.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';

// cfg: { look(島津の見た目 {flag,armor}), kill, groves:[{p,name,list}], chase:[{name,from,list}], chaseSpeed, waitMax, trigZ, who(出す名), cry:[伏兵の台詞, 敵の台詞] }
export function tsuriNobuse(cfg) {
  const startChase = (rt) => {
    const F = rt.flags, ctx = F.dp?.ctx;
    if (F.kzChase || !ctx) return;
    F.kzChase = cfg.chase.map((c) => {
      const g = preFoes(rt, ctx, c.from, { ...c });
      if (!g) return null;
      g.stay = false; g.order = 'attack'; g.aggro = 14; g.seekRange = 60; g.noRout = true;
      g.anchor = { x: cfg.kill.x, z: cfg.kill.z + 6 };
      g.speed = Math.max(g.speed || 0, cfg.chaseSpeed || 3.4);
      if (rt.player?.u) g.focus = rt.player.u;
      return g;
    });
    sfx('taiko', 0.9);
    rt.army.play('eshout', cfg.chase[0].from, 1.8);
  };
  const spring = (rt) => {
    const F = rt.flags;
    if (F.kzSprung) return;
    F.kzSprung = true;
    for (const g of F.kzAmbush || []) {
      if (!g || !g.count) continue;
      g.ambush = false; for (const u of g.units) u._crouch = false;
      g.noAI = false; g.fixed = false; g.order = 'attack'; g.aggro = 30; g.seekRange = 70;
      g.anchor = { x: cfg.kill.x + Math.sign(g.anchor.x || 1) * 6, z: cfg.kill.z + 4 };
      F.allies.push(g);
    }
    rt.say(cfg.cry[0][0], cfg.cry[0][1], 2.6); rt.after(2.8, () => rt.say(cfg.cry[1][0], cfg.cry[1][1], 3));
    sfx('hora', 1); rt.after(0.5, () => sfx('volley', 0.9)); rt.after(0.9, () => sfx('toki', 1));
  };
  return function update(rt, dt) {
    const F = rt.flags;
    if (!F.kzAmbush && rt.player?.u) {
      F.kzAmbush = cfg.groves.map((gr) => allyGroup(rt, {
        name: gr.name, flag: cfg.look.flag, anchor: { ...gr.p }, facing: Math.sign(gr.p.x || 1) * Math.PI / 2, fullStrength: true, noRout: true,
        aggro: 0, seekRange: 0, morale: 95, dmgMult: 0.45, fixed: true, noAI: true, order: 'hold', ambush: true,
      }, dress(gr.list, cfg.look)));
      for (const g of F.kzAmbush) for (const u of g.units) u._crouch = true;
    }
    if (F.step === 1 && !F.kzChase) startChase(rt);
    if (F.kzChase && !F.kzSprung && (F._kzT = (F._kzT || 0) - (dt || 0)) <= 0) {
      F._kzT = 0.5;
      const P = rt.player?.u;
      if (P?.alive) for (const g of F.kzChase) if (g && g.count) for (const u of g.units) if (u.alive && !u.fleeing && !u.gone) { u.target = P; u.aiT = 1.5; u.moveTo = null; }
    }
    if (F.step === 2 && !F.kzSprung) {
      F.kzWait = (F.kzWait || 0) + (dt || 0);
      const lead = (F.kzChase || []).find((g) => g && g.count && !g.routed)?.center();
      if (F.kzWait > (cfg.waitMax || 40) || !lead || lead.z < cfg.kill.z + (cfg.trigZ || 34)) spring(rt);
    }
  };
}
