// 太田城 ① 0〜3分「巨大な包囲陣」：平地の城を、羽柴の大軍が輪になって囲む。正面からは攻めない。
// 秀吉の本陣の脇を抜け、築堤の場へ。人夫が土俵を運び始め、城から雑賀衆が様子見に打って出る。
import { P, SAIKA, HASHIBA, porters, setMound } from './scene.js';
import { blockLook } from '../fujin_place.js';
import { troops, host, reports, near, move, broken } from '../toyo15/kit.js';

export default {
  goal: '築堤の場へ行き、土を運ぶ人夫を守れ',
  pin: { ...P.work, label: '出水の堤' },
  enter(rt, F) {
    // 城を遠巻きに囲む備（秀長・中村・小西・浅野・仙石・蜂須賀）は depth.js の陣立てが置く。ここは北の本隊の後ろだけ
    F.hosts = [host(rt, { x: 0, z: -150, w: 70, d: 22, count: 600, facing: 0, seed: 4101 })];
    F.workers = porters(rt, '築堤の人夫', P.pile, 10);
    // 11/18 クラウド 紀州の持ち主（⑥ 10秒の写真）：味方十万なのに、築堤の場から城を見ると堤の輪に人ひとりいない。
    //   堤の左右にも人夫の組を置き、輪の内の土取り場と堤の上を行き来させる（数万の人夫が昼も夜も土を運ぶ）
    F.crews = CREWS.map((c, i) => { const g = porters(rt, '築堤の人夫', c.out, 9); move(g, c.out); return g; });
    // 11/19 クラウド 紀州の持ち主（04:40 の残り：始まりの絵で城までの野に味方の兵が見えない。K285 で遠くの大軍は描かれない）：
    //   ②で立てていた堤の後詰（本物の槍組と幟）を始まりから据える
    gozume(rt, F);
    F.carry = 0; F.workT = 0; F.dug = 0; F.workVisited = false; F.workGuard = 0;
    move(F.friends, { x: P.work.x - 4, z: P.work.z - 8 }, true);
    rt.say('羽柴秀長', '城へ斬り込むな。堤で囲み、紀の川の水で城を浮かせるのじゃ', 4);
    reports(rt, [
      [20, '使番', '堤は城を一回りする。人夫は数万、昼も夜も土を運びます'],
      // 始まりから一分も待たせず、護衛が着く頃に最初の打ち出しを見せる。
      [12, '使番', '雑賀の衆が城から打って出ます！　築堤の場を狙っておる！', () => {
        F.scout = troops(rt, false, '様子見に出た雑賀衆', { x: 0, z: -6 }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], SAIKA, { free: true, aggro: 16 });
        move(F.scout, P.work, true);
      }],
      [35, '人夫頭', '土俵は一つ五貫。一人が一日に何十も運ぶのじゃ'],
      [50, '使番', '南の堤も、宇喜多の人夫が半ばまで積み上げました'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (near(rt, P.work, 26)) { F.workVisited = true; F.workGuard += dt; }
    workTick(rt, dt);
    return t > 60 && !!F.scout && (broken(F.scout, 0.35) || t > 100) && F.workVisited && F.workGuard >= 12;
  },
  leave(rt, F) {
    if (F.scout) { F.scout.noRout = false; F.scout.morale = 0; move(F.scout, { x: P.gate.x, z: P.gate.z - 8 }); F.scout.order = 'retreat'; }
  },
  foes: (rt) => [rt.flags.scout],
  max: Infinity, // 未到着のまま次の持ち場に替えない。残敵の刻限は上で保つ。
};
// 堤の左右の人夫の組（輪の内の土取り場 out と堤の上 on）。築堤の場から城を見た時、画面の左右（前から30〜45度）に入る所
const CREWS = [{ on: { x: -42, z: -50 }, out: { x: -33, z: -40 }, off: { x: -58, z: -66 } }, { on: { x: -16, z: -63 }, out: { x: -12, z: -47 }, off: { x: -14, z: -84 } }];
// 堰の段からは輪の外で休ませ、堰の斬り合いへ入れない
// 11/19 06:25 クラウド 紀州の持ち主：act bot の止まり「築堤の人夫 ord=move mv=false」が (-34,-80)・(-57,-66) で四十秒＝働きの終わった人夫が着いた後も歩みの下知のまま。
//   着いたら休み（hold）に戻す
const rest = (q) => { q.order = 'hold'; q.dest = null; };
export function crewsOff(F) { if (!F.crews || F.crewsOff) return; F.crewsOff = true; F.crews.forEach((c, i) => { move(c, CREWS[i].off); c.onArrive = rest; });
  if (F.workers) { move(F.workers, P.pile); F.workers.onArrive = rest; } }
// 人夫が土俵の山と堤の間を行き来する。損耗時も後方の人夫が最低限の築堤を続ける。
export function workTick(rt, dt) {
  const F = rt.flags, g = F.workers;
  if (!g) return;
  F.workT -= dt;
  if (F.workT <= 0) {
    F.workT = 9; F.carry = 1 - F.carry; move(g, F.carry ? { x: P.work.x - 2, z: P.work.z - 4 } : P.pile);
    if (F.crews && !F.crewsOff) F.crews.forEach((c, i) => move(c, (F.carry ^ (i & 1)) ? CREWS[i].on : CREWS[i].out));
  }
  const n = g.units.reduce((a, u) => a + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0);
  F.dug = Math.min(1, F.dug + dt * 0.0016 * Math.max(0.25, Math.min(1, n / 6)));
  setMound(F, F.dug);
}

// 堤の後詰：築堤の場と出水の堰の間（堤の外の田）に、本物の槍組を厚い塊と幟の林で据える（①②で使う）
export function gozume(rt, F) {
  if (!F.otaGozume) {
    const q = { x: -40, z: -64 }, f = 0.55;
    const g = F.otaGozume = troops(rt, true, '堤の後詰', q, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16, o: { keep: true } }], HASHIBA, { facing: f, width: 10, aggro: 0, seek: 0 });
    g.order = 'hold'; g.stay = true; g.formation = 'yari';
    for (const u of g.units) { u.invuln = true; u.noTarget = true; }
    try { blockLook(rt, g, { x: q.x, z: q.z, facing: f, flag: HASHIBA.flag, ranks: 4, nobori: true, side: 0 }); } catch (e) { /* 幟が立てられない時は兵だけ */ }
  }
}
