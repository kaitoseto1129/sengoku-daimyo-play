// 太田城 ① 0〜3分「巨大な包囲陣」：平地の城を、羽柴の大軍が輪になって囲む。正面からは攻めない。
// 秀吉の本陣の脇を抜け、築堤の場へ。人夫が土俵を運び始め、城から雑賀衆が様子見に打って出る。
import { P, SAIKA, porters } from './scene.js';
import { troops, host, reports, near, move, broken } from '../toyo15/kit.js';

export default {
  goal: '築堤の場へ行き、土を運ぶ人夫を守れ',
  pin: { ...P.work, label: '出水の堤' },
  enter(rt, F) {
    // 城を遠巻きに囲む軽い大軍（輪の外。北・東・南・西）
    const ring = [[0, -140, 0], [130, -40, -1.6], [120, 90, -2.4], [-10, 140, Math.PI], [-130, 60, 1.9], [-125, -70, 1.0]];
    F.hosts = ring.map(([x, z, f], i) => host(rt, { x, z, w: 70, d: 22, count: 700, facing: f, seed: 4101 + i }));
    F.workers = porters(rt, '築堤の人夫', P.pile, 10);
    F.carry = 0; F.workT = 0; F.dug = 0;
    move(F.friends, { x: P.work.x - 4, z: P.work.z - 8 }, true);
    rt.say('羽柴秀長', '城へ斬り込むな。堤で囲み、紀の川の水で城を浮かせるのじゃ', 4);
    reports(rt, [
      [20, '使番', '堤は城を一回りする。人夫は数万、昼も夜も土を運びます'],
      [60, '使番', '雑賀の衆が城から打って出ます！　築堤の場を狙っておる！', () => {
        F.scout = troops(rt, false, '様子見に出た雑賀衆', { x: 0, z: -40 }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], SAIKA, { free: true, aggro: 16 });
        move(F.scout, P.work, true);
      }],
      [105, '人夫頭', '土俵は一つ五貫。一人が一日に何十も運ぶのじゃ'],
      [130, '使番', '南の堤も、宇喜多の人夫が半ばまで積み上げました'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    workTick(rt, dt);
    return t > 165 && !!F.scout && (broken(F.scout, 0.35) || t > 200) && near(rt, P.work, 26);
  },
  foes: (rt) => [rt.flags.scout],
  max: 240,
};
// 人夫が土俵の山と堤の間を行き来し、堤が高くなる（人夫が残っている分だけ進む）
export function workTick(rt, dt) {
  const F = rt.flags, g = F.workers;
  if (!g) return;
  F.workT -= dt;
  if (F.workT <= 0) { F.workT = 9; F.carry = 1 - F.carry; move(g, F.carry ? { x: P.work.x - 2, z: P.work.z - 4 } : P.pile); }
  const n = g.units.reduce((a, u) => a + (u.alive ? 1 : 0), 0);
  F.dug = Math.min(1, F.dug + dt * 0.0016 * Math.min(1, n / 6));
  F.mound.scale.y = 0.2 + 3.2 * F.dug;
  F.mound.position.y = rt.world.heightAt(P.work.x, P.work.z) + F.mound.scale.y / 2 - 0.2;
}
