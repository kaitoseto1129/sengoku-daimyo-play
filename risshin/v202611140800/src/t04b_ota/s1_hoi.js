// 太田城 ① 0〜3分「巨大な包囲陣」：平地の城を、羽柴の大軍が輪になって囲む。正面からは攻めない。
// 秀吉の本陣の脇を抜け、築堤の場へ。人夫が土俵を運び始め、城から雑賀衆が様子見に打って出る。
import { P, SAIKA, porters, setMound } from './scene.js';
import { troops, host, reports, near, move, broken } from '../toyo15/kit.js';

export default {
  goal: '築堤の場へ行き、土を運ぶ人夫を守れ',
  pin: { ...P.work, label: '出水の堤' },
  enter(rt, F) {
    // 城を遠巻きに囲む備（秀長・中村・小西・浅野・仙石・蜂須賀）は depth.js の陣立てが置く。ここは北の本隊の後ろだけ
    F.hosts = [host(rt, { x: 0, z: -150, w: 70, d: 22, count: 600, facing: 0, seed: 4101 })];
    F.workers = porters(rt, '築堤の人夫', P.pile, 10);
    F.carry = 0; F.workT = 0; F.dug = 0; F.workVisited = false;
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
    if (near(rt, P.work, 26)) F.workVisited = true;
    workTick(rt, dt);
    return t > 165 && !!F.scout && (broken(F.scout, 0.35) || t > 200) && F.workVisited;
  },
  leave(rt, F) {
    if (F.scout) { F.scout.noRout = false; F.scout.morale = 0; move(F.scout, { x: 0, z: -10 }); F.scout.order = 'retreat'; }
  },
  foes: (rt) => [rt.flags.scout],
  max: Infinity, // 未到着のまま次の持ち場に替えない。残敵の刻限は上で保つ。
};
// 人夫が土俵の山と堤の間を行き来する。損耗時も後方の人夫が最低限の築堤を続ける。
export function workTick(rt, dt) {
  const F = rt.flags, g = F.workers;
  if (!g) return;
  F.workT -= dt;
  if (F.workT <= 0) { F.workT = 9; F.carry = 1 - F.carry; move(g, F.carry ? { x: P.work.x - 2, z: P.work.z - 4 } : P.pile); }
  const n = g.units.reduce((a, u) => a + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0);
  F.dug = Math.min(1, F.dug + dt * 0.0016 * Math.max(0.25, Math.min(1, n / 6)));
  setMound(F, F.dug);
}
