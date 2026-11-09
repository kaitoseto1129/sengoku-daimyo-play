// ======================================================================
// 信貴山城の戦い　始まりの段「城の麓・夜攻めの支度」（0〜2分半。b_shigisan.js の brief から入れる）
// 史実：片岡城を落とした織田勢（信忠を大将に、光秀・秀吉・筒井順慶ら）は信貴山城を囲み、十月十日に夜攻めにかかった（信長公記巻十）。
// 遊び：①城から火矢が降り、麓の尾根道の脇の枯れ草が燃える ②松永の物見の小組が尾根道を下りて探りに来るので、筒井の先手と払う
//   ③信忠の使番が夜攻めの下知を伝え、法螺で登り始める（climb）。払うか約二分で次へ。字は出さない：火・赤い印・法螺で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, MATSU, ROAD, OPEN_I, next } = ctx;
  const t0 = rt.t, W = rt.world;
  let S = null, done = false, tick = 0;
  rt.setPhase('fumoto');
  const P0 = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
  rt.obj('main', '尾根道の口で筒井の先手と構え、夜攻めの下知を待て', 'main');
  // ① 火矢
  rt.after(8, () => {
    if (done) return;
    sfx('arrow', 0.8);
    F.fumotoFire = W.addFire?.(P0.x + 9, P0.z + 6, { size: 1.0, h: 0.4 });
    rt.say('足軽', '火矢じゃ！　城から火矢を射掛けてくる！', 3.5);
  });
  // ② 松永の物見の小組（尾根道の上から）
  rt.after(24, () => {
    if (done) return;
    const a = ROAD[Math.min(ROAD.length - 1, OPEN_I + 2)] || [P0.x, P0.z - 30];
    S = enemyGroup(rt, { faction: 'matsunaga', name: '松永の物見の組', anchor: { x: a[0], z: a[1] }, facing: Math.PI, width: 5, order: 'hold', aggro: 26, seekRange: 34, morale: 80, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 1 }], MATSU));
    S.fixed = false; S.order = 'move'; S.dest = { x: P0.x, z: P0.z - 6 }; S.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
    rt.army.play?.('eshout', { x: a[0], z: a[1] }, 1.2);
    rt.say('組頭', '尾根道を下りて来る者がおる！　松永の物見じゃ、払え！', 4);
    rt.obj('main', '尾根道を下りて来た松永の物見を、筒井の先手と払え', 'main');
    rt.marker('fumotoS', () => (S.units.some((u) => u.alive && !u.fleeing && !u.woundOut) ? S.center() : null), '松永の物見', { red: true, group: S });
  });
  // 払った後：信忠の使番の下知 → 筒井の先手の旗へ寄ると法螺で登り始める（着かなくても約四十秒で）
  let gather = 0;
  const finish = () => {
    gather = rt.t;
    rt.unmark('fumotoS');
    rt.say('信忠の使番', '中将様（信忠）の御下知！　夜攻めにかかれ。諸口から一度に登れ！', 4);
    rt.obj('main', '筒井の先手の旗へ寄り、登る合図を待て', 'main');
    rt.objProgress('main', '');
    if (F.tsuU) rt.marker('fumotoT', () => F.tsuU.pos, '筒井の先手の旗', { h: 3, guideAlways: true, guidePriority: 400 });
  };
  const go = () => {
    done = true; F.fumotoDone = true;
    rt.unmark('fumotoT');
    rt.say('筒井の侍', '来たか。松明を消せ、声を立てるな。尾根を登るぞ', 3.5);
    rt.after(3.5, () => next());
  };
  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (gather) {
        const p = rt.player.u.pos, T = F.tsuU?.pos;
        if (!T || Math.hypot(p.x - T.x, p.z - T.z) < 8 || rt.t - gather > 40) go();
        return;
      }
      if (!S) { if (el > 110) finish(); return; }
      let n = 0;
      for (const u of S.units) if (u.alive && !u.fleeing && !u.woundOut) n++;
      rt.objProgress('main', n ? `松永の物見 ${n}人` : '');
      if ((!n && el > 80) || el > 150) {
        if (!n) rt.award((t) => t.side.push('夜攻めの前に、松永の物見を払った'), '松永の物見を払った');
        else for (const u of S.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: -1 }; }
        finish();
      }
    },
  };
}
