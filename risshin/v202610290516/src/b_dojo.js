// 稽古場（腕試し）の定義（battles.js から分けた。中身は元のまま）
import { gauss, enemyGroup } from './bhelp.js';
import { palisade, nobori } from './props.js';

// ======================================================================
// 稽古場（腕試し）：押し寄せる敵を何人討てるか
// ======================================================================
export const dojo = {
  dojo: true,
  missionStyle: 'practice',
  missionSingleLine: true,
  keepTaskLabel: true,
  missionHeading: () => '敵を倒せ',
  speechAllowed: () => false,
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u;
    if (!F.guideAt || rt.t >= F.guideAt) {
      F.guideAt = rt.t + .25;
      if (!F.guideEnemy?.alive || F.guideEnemy.dying || F.guideEnemy.gone)
        F.guideEnemy = rt.army.nearestEnemy(me, 90);
    }
    const u = F.guideEnemy;
    if (!u?.alive || u.dying || u.gone || Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 5) return null;
    const pin = F.guidePin || (F.guidePin = { x: 0, z: 0, r: 3 });
    pin.x = u.pos.x; pin.z = u.pos.z;
    return pin;
  },
  trackerIndex: 0,
  spawn: { x: 0, z: 8, heading: Math.PI },
  world: {
    seed: 41,
    paths: [],
    height: (x, z) => 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 6 * gauss(x, z, 0, 0, 90000) * 0 + (Math.hypot(x, z) > 45 ? (Math.hypot(x, z) - 45) * 0.12 : 0),
    clear: (x, z) => Math.hypot(x, z) < 48,
    trees: 260,
    tufts: 2500,
    time: 'after',
  },
  sides: { a: { name: '稽古の者', mon: 'maru' }, b: { name: '敵', mon: 'saito' } },
  date: () => '清洲の稽古場　腕試し',
  setup(rt) {
    const W = rt.world;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      if (i % 4 === 0) continue;
      rt.scene.add(palisade(W, [Math.sin(a0) * 40, Math.cos(a0) * 40, Math.sin(a1) * 40, Math.cos(a1) * 40], { h: 1.8 }));
    }
    for (const [x, z] of [[-10, 36], [10, 36], [0, -38]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 乗馬は試せるようにする（canRide）が、常に騎乗の本物の馬を出し続けると重い。待たせておき、Rで乗れるように（kaito 10/1）
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    rt.flags.wave = 0; rt.flags.kills = 0;
    rt.obj('dojo', '敵を倒せ', 'main');
    // 稽古の最初から正面に一人。隠し配置や出現待ちで相手を探させない。
    const meritHit = rt.army.hooks.onMeritHit;
    rt.army.hooks.onMeritHit = function (target, source, kind, amount) {
      if (source?.isPlayer && target.team !== source.team && amount > 0) {
        target.okeHitHp = target.hp + amount;
        target.okeDamageUntil = rt.t + 2.4;
        target.okeHitUntil = rt.t + .9;
      }
      meritHit?.call(this, target, source, kind, amount);
    };
    this.next(rt);
  },
  next(rt) {
    const F = rt.flags;
    F.wave++;
    const n = F.wave;
    const list = [{ type: 'ashigaru', n: n === 1 ? 1 : Math.min(180, 2 + n * 2) }];
    if (n >= 3) list.push({ type: 'samurai', n: Math.min(40, Math.floor(n / 2)) });
    if (n >= 5) list.push({ type: 'cavalry', n: Math.min(20, 1 + Math.floor((n - 5) / 2)) });
    if (n >= 4) list.push({ type: 'gun', n: 1 });
    if (n % 5 === 0) list.push({ type: 'busho', n: 1, o: { name: '敵の頭' } });
    const a = rt.player.yaw + (rt.player.camYawOff || 0), p = rt.player.u.pos;
    const distance = n === 1 ? 9 : 16;
    let x = p.x + Math.sin(a) * distance, z = p.z + Math.cos(a) * distance;
    const edge = Math.hypot(x, z);
    if (edge > 28) { x *= 28 / edge; z *= 28 / edge; }
    // 次の陣も稽古場の柵の内側へ。実戦用の画面外への移動を行わない。
    const g = enemyGroup(rt, { faction: 'saito', fixed: true, noGuard: true, anchor: { x, z }, facing: a + Math.PI, order: 'attack', seekRange: 90, noRout: true, width: 5 }, list);
    F.cur = g;
    rt.obj('dojo', '敵を倒せ', 'main');
  },
  update(rt) {
    const F = rt.flags;
    if (F.cur && F.cur.count === 0 && !F.waiting) {
      F.waiting = true;
      rt.player.u.hp = Math.min(rt.player.u.maxHp, rt.player.u.hp + rt.player.u.maxHp * 0.25);
      rt.after(4, () => { F.waiting = false; this.next(rt); });
    }
  },
  onKill(rt, v, k) {
    if (k?.isPlayer) rt.flags.kills++;
    v.okeDefeatUntil = rt.t + .7;
  },
};
