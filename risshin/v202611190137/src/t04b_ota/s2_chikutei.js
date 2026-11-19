// 太田城 ② 3〜6分「築堤の護衛」：城から雑賀衆が何度も打って出て人夫を狙う。人夫を守り切れば堤が積み上がる。
import { P, SAIKA, HASHIBA, porters, setMound } from './scene.js';
import { troops, reports, move, living, broken, near } from '../toyo15/kit.js';
import hoi, { workTick, crewsOff, gozume } from './s1_hoi.js';

export default {
  goal: '出水の堤で、打って出る雑賀衆から人夫を守れ',
  pin: { ...P.work, label: '出水の堤' },
  enter(rt, F) {
    // 途中からの再開では前段の leave が呼ばれないため、様子見の兵を残さない。
    hoi.leave(rt, F);
    F.workGuard = 0; F.waves = []; F.workerReliefs = 0; F.workerReliefAt = 0; F.workWithdrawn = false;
    move(F.friends, { x: P.work.x - 6, z: P.work.z - 4 }, true);   // 盛り土（城の側へ寄せた）の上に立たせない
    // 11/18 クラウド k365-cloud-07（cloud-27 の照らし 200秒 ✕「堤に兵数人」）：護衛は二百秒で半分に減り、堤の上が数人に見えた。
    //   築堤の場と出水の堰の間（堤の外の田）へ、後詰の槍組を厚い塊と幟の林で据える。持ち場で待つだけ（斬り合いには出ず、狙われない）
    gozume(rt, F);   // 11/19：①の初めから立てる（s1_hoi.js）。途中からの再開でも立つ
    rt.say('羽柴秀長', '堤ができれば城は終わりじゃ。雑賀もそれを分かっておる。人夫を一人も討たせるな', 4);
    const wave = (name, from, list) => () => { const g = troops(rt, false, name, from, list, SAIKA, { free: true, aggro: 18 }); move(g, P.work, true); F.waves.push(g); };
    reports(rt, [
      [12, '組頭', '土橋を渡って来るぞ！　槍を揃えよ！', wave('土橋を渡る雑賀衆', { x: 0, z: -44 }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }])],
      // 11/18 K306・K355（センゴク権兵衛2巻・第13話）：雇われた人夫が土俵の数で銭と米を受け、六日で堤を巡らせた。浜の道は荷担ぎの列
      [30, '人夫頭', '土俵一つで銭と米が出るぞ！　手を休めるな！'],
      [50, '組頭', '西の田の畦から回り込んで来る！', wave('畦を回る雑賀衆', { x: -56, z: -20 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }])],
      [80, '使番', '東の堤では、蜂須賀の手が雑賀の打ち出しを追い返しました'],
      [68, '足軽', '浜の道は兵糧を担ぐ列が途切れぬ。十万の腹を満たす米か'],
      [106, '使番', '湯川の衆は熊野の山へ籠もりました。熊の皮を着た大将とか'],
      [90, '組頭', 'また来た！　人夫を後ろへ下げよ！', wave('雑賀の鉄砲衆', { x: 8, z: -46 }, [{ type: 'gun', n: 5 }, { type: 'ashigaru', n: 6 }])],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    // 交代は二組まで。残った人夫を資材置き場へ戻し、隊を増やし続けない。
    if (living(F.workers) < 3 && F.workerReliefs < 2 && t >= F.workerReliefAt) {
      move(F.workers, P.pile); F.workers.onArrive = (q) => { q.order = 'hold'; q.dest = null; };
      F.workers = porters(rt, '新しい人夫', P.pile, 8);
      F.workerReliefs++; F.workerReliefAt = t + 30;
      rt.say('人夫頭', '代わりの人夫が来ました。土を運べ！', 2.5);
    }
    if (near(rt, P.work, 26)) F.workGuard += dt;
    workTick(rt, dt);
    gozumeTick(rt, F, rt.t);
    // 持ち場への到着が遅れても、打ち出しの刻限は延ばさない。
    // 任務は護衛した五秒を待つので、離れたまま達成にはならない。
    if (t > 165) withdraw(F);
    const quiet = F.waves.length >= 3 && F.waves.every((g) => broken(g, 0.35));
    return t > 120 && F.workGuard >= 5 && F.waves.length >= 3 && (quiet || t > 165);
  },
  leave(rt, F) { withdraw(F); gozumeHome(F.otaGozume, F); crewsOff(F); F.dug = Math.max(F.dug, 0.9); setMound(F, F.dug); },
  foes: (rt) => rt.flags.waves,
  max: Infinity,
};
// 11/18 15:10 UTC クラウド 紀州の持ち主（act bot「堤の後詰 敵を前に20秒止まった」131〜151秒）：
//   畦を回る雑賀衆が二十m 先を通っても、後詰の槍組は田に棒立ちだった。寄せる敵が二十四m に入れば
//   その方へ槍を向けて六m 押し出し（槍衾を見せる）、十四m 内の敵とは槍を合わせる。三十二m より離れたら元の持ち場へ戻る（戻れば狙われないのも元のまま）
const GOZUME_HOME = { x: -40, z: -64 }, GOZUME_F = 0.55;
//   この段だけ（③④でも呼ぶと、後詰が堰の小舟を先に討ち取り本人の斬り合いが0になった＝act bot 討ち取り7）。退く敵・使者は数えない
function gozumeTick(rt, F, t) {
  const g = F.otaGozume;
  if (!g || t < (F.gozumeAt || 0)) return;
  F.gozumeAt = t + 1;
  let best = null, bd = 1e9;
  for (const w of rt.army.groups || []) if (w.team === 1 && !w.peaceful && w.order !== 'retreat') for (const u of w.units) {
    if (!u.alive || u.gone || u.fleeing) continue;
    const d = Math.hypot(u.pos.x - GOZUME_HOME.x, u.pos.z - GOZUME_HOME.z);
    if (d < bd) { bd = d; best = u; }
  }
  if (best && bd < 24 && !F.gozumeOut) {
    const dx = best.pos.x - GOZUME_HOME.x, dz = best.pos.z - GOZUME_HOME.z, k = 6 / Math.max(bd, 1);
    move(g, { x: GOZUME_HOME.x + dx * k, z: GOZUME_HOME.z + dz * k });
    g.facing = Math.atan2(dx, dz); g.formation = 'yari'; F.gozumeOut = true;
    // 押し出した後は十四m 内へ来た敵と槍を合わせる（立ち尽くさない）。この間は討たれもする
    g.aggro = 14; for (const u of g.units) { u.invuln = false; u.noTarget = false; }
    if (!F.gozumeSaid) { F.gozumeSaid = true; rt.say('組頭', '後詰、槍を揃えて前へ！', 2.5); }
  } else if (F.gozumeOut && (!best || bd > 32)) gozumeHome(g, F);
}
function gozumeHome(g, F) {
  if (!g || !F.gozumeOut) return;
  move(g, GOZUME_HOME); g.facing = GOZUME_F; g.formation = 'yari'; F.gozumeOut = false;
  g.aggro = 0; for (const u of g.units) { u.invuln = true; u.noTarget = true; }
}
function withdraw(F) {
  if (F.workWithdrawn) return;
  F.workWithdrawn = true;
  for (const g of F.waves) { g.noRout = false; g.morale = 0; move(g, { x: P.gate.x, z: P.gate.z - 8 }); g.order = 'retreat'; }
}
