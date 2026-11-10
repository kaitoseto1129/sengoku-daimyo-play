// ======================================================================
// 手取川の戦い　最後の段「追手を振り切る」（約12〜13分。b_tedorigawa.js の south の後、win の前に入れる）
// 史実：渡った柴田勢は南へ退き、御幸塚・大聖寺に兵を残して帰陣した。上杉勢は川を越えて深追いはしなかった。
// 遊び：南岸の殿を果たすと、濁流を押し渡った上杉の騎馬が数騎、背後から追いすがる。南の退き口の旗まで退く（追いつかれたら払う）。
//   退き口の旗へ着いてから戦の終わりへ進む。待つだけでは退いた働きにしない。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { uS, uC } from '../b_mid.js';
import { sfx } from '../audio.js';
import { nobori } from '../props.js';

// 戦えなくなった兵や隊の空いた中心へ、追手の印を残さない。
const pursuing = (u) => u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut &&
  !u.rearWound && !u.downed && !u.dragging && !u.noTarget && !u.group?.routed;

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, UESUGI, SOUTH, FORD, next } = ctx;
  const FLAG = { x: SOUTH.x, z: SOUTH.z + 62, name: '南の退き口の旗', action: '南の退き口の旗まで退け' };
  const t0 = rt.t;
  let done = false, tick = 0, landed = false;
  // 生存の印が落ちる前の命切れや、重傷の札の間も退却の処理を止める。
  const stopped = () => F.ending || rt.over || !rt.player.u.alive || rt.player.u.hp <= 0 || rt.result?.down;
  rt.scene.add(nobori(rt.world, FLAG.x, FLAG.z, 'oda', 5));
  rt.setPhase('furikiru');
  rt.obj('main', '南の退き口の旗まで退け。追いすがる騎馬に背を見せきるな', 'main');
  rt.objProgress('main', '');
  rt.marker('furikiru', FLAG, '南の退き口の旗', { h: 3, guideAlways: true, guidePriority: 450 });
  rt.say('柴田勝家', 'もうよい、退け！　南の旗まで退いて、列を組み直す！', 4);
  // 味方の殿の列も南へ
  for (const g of [F.rear, F.rgun, ...(rt.squadGroups || [])]) if (g && g.count && !g.routed) {
    g.fixed = false; g.retreatOnly = true; g.order = 'path'; g.path = [[FLAG.x + (g.id % 3) * 4 - 4, FLAG.z - 4]]; g.pathIdx = 0; g.speed = 2.4;
    g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.formation = 'yari'; };
  }
  // 濁流を押し渡った上杉の騎馬（数騎）
  let C = null;
  rt.after(8, () => {
    if (done || stopped()) return;
    C = enemyGroup(rt, { name: '濁流を渡った上杉の騎馬', anchor: { x: FORD.x + 6, z: FORD.z + 8 }, facing: 0, width: 4, order: 'attack', aggro: 40, seekRange: 50, morale: 80, faction: 'uesugi', fleeDir: { x: 0, z: -1 } },
      dress([uS(1, { horse: true }), uC(3)], UESUGI));
    sfx('hooves', 1);
    rt.say('足軽', '浅瀬に上杉の騎馬じゃ！　南の旗まで退け！', 3.5);
    rt.marker('furikiruC', () => C?.units.find(pursuing)?.pos || null, '上杉の騎馬', { red: true, group: C });
  });
  return {
    target: FLAG,
    update(dt) {
      if (done || stopped()) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const p = rt.player.u.pos, el = rt.t - t0, d = Math.hypot(p.x - FLAG.x, p.z - FLAG.z);
      // 浅瀬で止まった騎馬を、南岸まで渡ったと告げない。
      if (!landed && C?.units.some((u) => pursuing(u) && u.pos.z >= SOUTH.z - 8 && !rt.world.inWaterAt(u.pos.x, u.pos.z))) {
        landed = true;
        rt.say('足軽', '馬が川を渡って来よる！　追いつかれるぞ！', 3.5);
      }
      rt.objProgress('main', d > 10 ? `退き口の旗まで約${Math.ceil(d / 5) * 5}歩` : '');
      if (d < 9 && el > 20) {
        done = true; F.furikiruDone = true;
        rt.unmark('furikiru'); rt.unmark('furikiruC');
        // 上杉は戦場を制した側。主人公の到着で敗走させず、浅瀬を通って川へ引き返す。
        if (C) {
          C.focus = null; C.noHunt = true; C.fixed = false; C.retreatOnly = true;
          C.aggro = 0; C.seekRange = 0;
          // まだ浅瀬や北岸にいる騎馬を、退く下知で南岸へ呼び込まない。
          // 南岸まで来た隊だけ浅瀬の南口を経由し、ほかは北口へ引き返す。
          const c = C.center();
          C.order = 'path'; C.path = c.z > SOUTH.z - 4 ?
            [[4, SOUTH.z - 4], [3, FORD.z + 10], [FORD.x + 6, FORD.z - 8]] :
            [[FORD.x + 6, FORD.z - 8]]; C.pathIdx = 0;
          C.onArrive = (g) => { g.order = 'hold'; g.facing = 0; };
          for (const u of C.units) if (u.alive) {
            u.target = null; u.pullUntil = rt.army.time; u.watch = null; u.moveTo = null;
          }
        }
        if (d < 9) rt.award((t) => t.side.push('追いすがる上杉の騎馬を振り切り、南の退き口へ退いた'), '追手を振り切った');
        // 引き返す道を命じた直後には、まだ川へ戻り終えていない。
        rt.say('組頭', '南の旗まで退いた。列を組み直せ！', 3.5);
        rt.after(3, () => { if (!stopped()) next(); });
      }
    },
  };
}
