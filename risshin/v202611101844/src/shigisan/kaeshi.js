// ======================================================================
// 信貴山城の戦い　曲輪の段「城内の火・松永の逆寄せ・筒井勢との合流」（約6〜9分。b_shigisan.js の interior から入れる）
// 史実：夜攻めで筒井の先手は一度押し返され、城内の三の丸あたりから火の手が上がって守りが乱れた（多聞院日記の猛火）。
// 遊び：門を抜けて曲輪へ寄せる間に、①上の曲輪の小屋に火が回る ②松永の侍衆が逆寄せに打って出る ③麓から筒井の後続が駆け上がり合流する。
//   逆寄せを払うか約二分半で本丸の段へ（b_shigisan.js の honmaru はこの段が済むまで待つ）。字は出さない：火・赤い印・梅鉢の旗で分からせる。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { siegeFighter } from '../siege_zones.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, MATSU, TSUTSUI, RIDGE1, RIDGE2, GATE, ROAD, march, next } = ctx;
  const gate = ROAD.findIndex(([x, z]) => x === GATE.x && z === GATE.z);
  const lower = ROAD.findIndex(([x, z]) => x === RIDGE1.x && z === RIDGE1.z + RIDGE1.r);
  const upper = ROAD.findIndex(([x, z]) => x === RIDGE2.x && z === RIDGE2.z + RIDGE2.r);
  const t0 = rt.t, W = rt.world;
  let K = null, T = null, done = false, tick = 0;
  // ① 上の曲輪の小屋に火（夜空を赤く）
  rt.after(14, () => {
    if (done || F.ending || rt.over || !rt.player.u.alive) return;
    F.kaeshiFire = W.addFire?.(RIDGE2.x + 6, RIDGE2.z - 4, { size: 2.2, h: 1.4, blackSmoke: true });
    sfx('wood', 0.6);
    rt.say('足軽', '上の曲輪から火の手じゃ！　城の中が燃えておる！', 3.5);
  });
  // ② 松永の侍衆の逆寄せ（上の曲輪から下へ）
  rt.after(30, () => {
    if (done || F.ending || rt.over || !rt.player.u.alive) return;
    K = enemyGroup(rt, { faction: 'matsunaga', name: '逆寄せの松永の侍衆', anchor: { x: ROAD[upper][0], z: ROAD[upper][1] }, facing: Math.PI, width: 8, order: 'hold', aggro: 28, seekRange: 36, morale: 90, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 3, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }], MATSU));
    // 曲輪間の切岸を直進せず、南の口と尾根道を通って逆寄せする。
    K.fixed = false;
    march(rt, K, ROAD.slice(lower, upper + 1).reverse());
    K.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
    rt.army.play?.('eshout', { x: RIDGE2.x, z: RIDGE2.z + 6 }, 1.5);
    rt.banner('松永勢の逆寄せ', '火を背に、侍衆が打って出る');
    rt.say('松永の侍', '筒井の小倅どもを追い落とせ！　ここは大和の松永の城ぞ！', 4);
    rt.obj('kaeshi', '曲輪へ打って出た松永の侍衆を押し返せ', 'order');
    rt.marker('kaeshiK', () => (K.units.some(siegeFighter) ? K.center() : null), '松永の侍衆', { red: true, group: K });
  });
  // ③ 筒井の後続が麓から駆け上がる（約五十秒後）
  rt.after(55, () => {
    if (done || F.ending || rt.over || !rt.player.u.alive) return;
    T = allyGroup(rt, { fixed: true, name: '筒井の後続', anchor: { x: GATE.x, z: GATE.z + 10 }, facing: Math.PI, width: 8, aggro: 18, seekRange: 30, formation: 'yari' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], TSUTSUI));
    // 後続も木戸と西の帯道を通す。本丸への下知・停滞時の援護の対象に含める。
    T.fixed = false; T.ai = true;
    F.oda.push(T);
    march(rt, T, ROAD.slice(gate, lower + 1));
    T.onArrive = (q) => { q.order = 'attack'; };
    sfx('horagai', 0.6);
    rt.say('筒井の侍', '筒井の後続、ただいま着到！　梅鉢の旗に続け！', 3.5);
  });
  return {
    update(dt) {
      if (done || F.ending || rt.over || !rt.player.u.alive) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (!K) return;
      let n = 0;
      for (const u of K.units) if (siegeFighter(u)) n++;
      rt.objProgress('kaeshi', n ? `松永の侍衆 ${n}人` : '');
      if ((!n && el > 110) || el > 180) {
        done = true; F.kaeshiDone = true;
        rt.unmark('kaeshiK');
        if (!n) { rt.objDone('kaeshi'); rt.award((t) => t.side.push('曲輪へ打って出た松永の侍衆を押し返した'), '松永の逆寄せを押し返した'); }
        else { rt.objRemove('kaeshi'); for (const u of K.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: -1 }; } }
        rt.say('筒井順慶', '押し返したぞ！　本丸はもう目の前じゃ！', 3.5);
        rt.after(3, () => { if (!F.ending && !rt.over && rt.player.u.alive) next(); });
      }
    },
  };
}
