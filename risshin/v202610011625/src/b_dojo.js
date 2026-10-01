// 稽古場（腕試し）の定義（battles.js から分けた。中身は元のまま）
import { gauss, enemyGroup } from './bhelp.js';
import { palisade, nobori } from './props.js';
import { isTouch } from './touch.js';

// ======================================================================
// 稽古場（腕試し）：押し寄せる敵を何人討てるか
// ======================================================================
export const dojo = {
  dojo: true,
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
  sides: { a: { name: '稽古の者', mon: 'maru' }, b: { name: '寄せ手', mon: 'saito' } },
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
    rt.obj('dojo', '押し寄せる寄せ手を討ち続けよ', 'main');
    rt.say('師範', '腕試しじゃ。寄せ手は波のように来る。倒れるまで、何人討てるか見せてみよ', 4.5);
    rt.say('師範', isTouch ? '右下の「持替」で槍・刀・鉄砲・弓を替え、馬には「乗る」で乗り降りできる' : '数字キー1〜4で槍・刀・鉄砲・弓を持ち替え、Rで馬に乗り降りできる', 4.5);
    rt.say('', isTouch ? '左上の「止める」から「タイトルへ戻る」で、いつでも終えられます' : 'Esc で一時停止し、「タイトルへ戻る」でいつでも終えられます', 4);
    rt.after(5, () => this.next(rt));
  },
  next(rt) {
    const F = rt.flags;
    F.wave++;
    const n = F.wave;
    const list = [{ type: 'ashigaru', n: 2 + n * 2 }];
    if (n >= 3) list.push({ type: 'samurai', n: Math.floor(n / 2) });
    if (n >= 5) list.push({ type: 'cavalry', n: 1 + Math.floor((n - 5) / 2) });
    if (n >= 4) list.push({ type: 'gun', n: 1 });
    if (n % 5 === 0) list.push({ type: 'busho', n: 1, o: { name: `寄せ手の頭 第${n}陣` } });
    const a = Math.random() * Math.PI * 2;
    const g = enemyGroup(rt, { faction: 'saito', anchor: { x: Math.sin(a) * 34, z: Math.cos(a) * 34 }, facing: a + Math.PI, order: 'attack', seekRange: 90, noRout: true, width: 5 }, list);
    F.cur = g;
    rt.banner(`第${n}陣`, `${g.units.length}人が寄せてくる`);
    rt.obj('dojo', `押し寄せる寄せ手を討ち続けよ（第${n}陣）`, 'main');
  },
  update(rt) {
    const F = rt.flags;
    rt.objProgress('dojo', `討ち取り ${F.kills}人`);
    if (F.cur && F.cur.count === 0 && !F.waiting) {
      F.waiting = true;
      rt.say('師範', F.wave % 3 === 0 ? 'ほう、やるのう。次はもう少し手ごわいぞ' : '次じゃ！', 2);
      rt.player.u.hp = Math.min(rt.player.u.maxHp, rt.player.u.hp + rt.player.u.maxHp * 0.25);
      rt.after(4, () => { F.waiting = false; this.next(rt); });
    }
  },
  onKill(rt, v, k) { if (k && k.isPlayer) rt.flags.kills++; },
};
