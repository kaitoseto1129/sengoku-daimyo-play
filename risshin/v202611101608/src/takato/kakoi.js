// ======================================================================
// 高遠城　包囲の段（0〜3分・docs/oda15_plan_1108.md 30「包囲・仁科盛信降伏拒否」）
// 夜明け前の寄せ場の後ろ（森長可・毛利長秀の陣）から始める。物見の土手に着くと城の全景と、追い返されて戻る使いの僧が見える。
// 盛信の返事（降らぬ）を聞き、竹束の列へ走ると（移動の間も遠くで鉄砲の音と鬨の声）、元の総攻め（assault）が始まる。
// 入れ方：b_takato.js で wrap(takato) を一度。def.assault を包む。
// ======================================================================
import { k15Off, k15Squad, k15Go, k15Scenes, k15Fade } from '../oda15_kit.js';
import { evPerson, evRemove } from '../b_ev6.js';
import { placeGroup, placePlayer } from '../b_opening.js';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';
import { start as yose } from './yose.js';   // 寄せの道しるべ

export function wrap(def, K) {
  const assault = def.assault;
  def.assault = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.kakoiDone || F.step >= 1) return assault.call(this, r);
    if (F.k15stage === 'kakoi') return;
    start(r, () => { F.kakoiDone = true; F.k15on = false; assault.call(this, r); yose(r, def, K); });
  };
}

function start(rt, done) {
  const F = rt.flags;
  F.k15stage = 'kakoi'; F.k15on = true;
  // 11/8 bot：元の高遠は塀の内からの矢・鉄砲と、門の前の乱戦で本人が十四分のうちに倒れきる（段を入れる前から）。
  //   一日で落ちた城攻めの手応えは残し、本人の受ける傷だけを四割に（敵の体力・数は変えない）。
  if (!rt.player.k15soft) {
    const P = rt.player, td = P.takeDamage;
    P.k15soft = true;
    P.takeDamage = function (a, s) { return td.call(this, a * 0.4, s); };
  }
  const stop = () => F.k15stage !== 'kakoi';
  const back = rt.objectives.find((o) => o.id === 'main')?.text;
  k15Fade(rt, () => {
    placePlayer(rt, 140, 6, -Math.PI / 2);   // 組は竹束の列に残す（寄せの持ち場）
  }, '天正十年三月二日　夜明け前', '武田の城が次々に開く中、高遠城だけが降らない');
  const look = { x: 132, z: 4 }, taba = { x: 118, z: 2 };   // 竹束の列は大手の矢の届く外
  k15Scenes(rt, [
    [2, () => rt.say('森長可', `${nm(rt)}、物見の土手へ上がれ。城の様子を見よ`, 4)],
  ], () => k15Go(rt, 'tk-look', look, 6, '物見の土手から、高遠城を見よ', '物見の土手', () => {
    // 物見に着いたら：城の全景と、城から戻る使いの僧
    // 着いても手動で見回している向きは変えない。
    rt.banner('高遠城', '三峰川と藤沢川に挟まれた崖の上。大手の門は東');
    rt.award((t) => t.side.push('寄せの前に城を見た'), '寄せの前に城を見た');
    const monk = evPerson(rt, 0, '使いの僧', { x: 100, z: 0 }, Math.PI / 2, { calm: true, type: 'ashigaru' });
    monk.order = 'path'; monk.path = [[120, 2], [140, 6]]; monk.pathIdx = 0; monk.noAI = false;
    k15Scenes(rt, [
      [3, () => rt.say('足軽', '城から使いの僧が戻って来るぞ', 3.5)],
      [4, () => rt.say('使いの僧', '仁科五郎殿は「降らぬ。城を枕に戦う」と……　書状は破られ申した', 5)],
      [5, () => { rt.banner('仁科五郎、降らず', '中将様の降れとの使いは追い返された'); sfx('horagai', 0.4); }],
      [3.5, () => rt.say('森長可', 'ならば今日一日で落とす。竹束を立てよ。大手へ寄せるぞ', 4.5)],
      [4.5, () => { evRemove(rt, monk); rt.say('毛利長秀', '城の鉄砲は塀の内から撃つ。竹束の陰を出るな', 4.5); }],
    ], () => k15Go(rt, 'tk-tabaya', { x: 138, z: -10 }, 6, '陣の脇の竹束置き場へ', '竹束置き場', () => {
      // 着いたら：竹束を担ぐ（移動も出来事に）
      rt.banner('竹束を担ぐ', '青竹を束ねた楯。鉄砲の玉を止める');
      rt.award((t) => t.side.push('竹束を寄せ道へ運んだ'), '竹束を寄せ道へ運んだ');
      k15Scenes(rt, [
        [3, () => rt.say('足軽', '重いのう……　だが、これが無ければ塀の鉄砲に撃たれる', 4)],
        [4, () => rt.say('毛利長秀', '竹束を先に立て、その陰から寄せよ。走れ！', 3.5)],
      ], () => k15Go(rt, 'tk-taba', taba, 6, '竹束の列へ走れ', '竹束の列', () => {
      F.k15on = false;
      if (back) rt.obj('main', back, 'main', true);
      done();
    }, { limit: Infinity, progress: '遠くで鉄砲の音。西の搦手でも寄せが始まった' }), stop);
    }, { limit: Infinity }), stop);
    // 走る間の遠い音（移動もイベントに）
    rt.after(22, () => { if (!stop()) { sfx('far', 0.6); rt.say('足軽', '西で鬨の声じゃ。中将様の手が搦手へ寄せた', 3.5); } }, true);
  }, { limit: Infinity }), stop);
}
