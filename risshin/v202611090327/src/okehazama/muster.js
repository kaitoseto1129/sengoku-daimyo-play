// ======================================================================
// 桶狭間 0〜2分半：中島砦の下の集まり（善照寺から移った織田勢）
//   『信長公記』：善照寺の砦で勢を揃えた信長は、佐々隼人正・千秋四郎の三百ほどが今川の前へ先駆けして討たれるのを見て、
//   中島へ移ろうとした。家老衆は「脇は深田、一騎ずつの道で、敵に勢の少ないのが見える」と馬の轡を取って止めたが、信長は振り切った。
//   簗田政綱の物見の知らせ（義元は桶狭間山で休む）は後世の伝え。ここでは知らせとして台詞だけに使う。
//   遠くの先駆けの戦いは軽い作り（addClash・本物の兵は増やさない）。終わったら本体の startMarch（谷を下る）。
// ======================================================================
import { sfx } from '../audio.js';

const DUR = 124;

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.musterT) return !v.musterDone;
  if (rt.over || F.ending || rt.phase !== 'brief') return false;
  v.musterT = rt.t;
  F.zenshojiSaid = true;   // 本体の行軍の始めの二言（二千に足らぬ・先駆けの討死）は、ここで目の前の事として言う
  F.briefReadyAt = rt.t + DUR;
  const lord = !!rt.G.lord, NOB = lord ? '自分' : '織田信長';
  const live = () => !rt.over && !F.ending && rt.phase === 'brief' && !v.musterDone;
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (live()) rt.say(who, s, d); });
  say(1, '組頭 源八', '善照寺の砦で集まった兵は二千に足らぬ。皆が揃うまで、ここで待て', 4);
  // 佐々・千秋の先駆け：谷の向こうの今川の前で、三百ほどが二倍の今川勢とぶつかり、崩れて討たれる（遠くの軽い大軍）
  rt.after(9, () => {
    if (!live() || !rt.world.addClash) return;
    try {
      const p = C.fieldPoint(-74, -150);
      v.saki = rt.world.addClash({ rt, play: (k, q, vv) => rt.army.play?.(k, q, vv), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
        x: p.x, z: p.z, facing: Math.PI + C.FIELD_TURN, w: 30, gap0: 14, seed: 1560, noRout: true, noWake: true,
        A: { flag: 'oda', armor: 0x24221f, count: 90 }, B: { flag: 'imagawa', armor: 0x3f2a24, count: 220, guns: true } });
      rt.after(1, () => v.saki?.go());
      rt.after(22, () => { v.saki?.push('B', 0.8); v.saki?.shake('A', 30); });
      rt.after(42, () => v.saki?.rout('A', { from: 0, hideAfter: 30 }));
    } catch (e) { v.saki = null; }
    rt.army.playFar?.('toki', C.fieldPoint(-74, -150), 1.2);
  });
  say(12, '足軽', '前の方で鬨の声じゃ……佐々殿と千秋殿の先駆けが、今川の前へかかったぞ！', 3.6);
  say(26, '組頭 源八', '三百ほどで今川の大勢の前へ……あれでは持たぬ', 3.2);
  say(50, '組頭 源八', '佐々隼人正殿、千秋四郎殿、討死なされた……', 3.4);
  // 家老衆が轡を取って止める（公記）。信長は振り切る
  say(62, '家老衆', '殿、お待ちあれ！　この先は脇が深田、一騎ずつの道。こちらの小勢が敵に丸見えにござる！', 4.2);
  say(67, NOB, '止めるな。今川は勝ちに奢っておる。驕った敵の首は、今が取り時じゃ！', 3.6);
  // 簗田の物見の知らせ（使番が馬で駆けて来る）
  rt.after(76, () => {
    if (!live()) return;
    const from = C.fieldPoint(-58, -36), to = F.nob?.center?.() || rt.player.u.pos;
    try {
      v.yana = C.allyGroup(rt, { name: '簗田政綱', anchor: from, facing: C.FIELD_TURN, width: 1, aggro: 0, speed: 6, noAI: true, noRout: true, order: 'move', fixed: true,
        dest: { x: to.x + 3, z: to.z + 3 } }, [{ type: 'cavalry', n: 1, o: { name: '簗田政綱', invuln: true, flag: 'oda' } }]);
      v.yana.onArrive = (q) => { q.order = 'hold'; };
    } catch (e) { v.yana = null; }
    sfx('gallop', 0.8);
  });
  say(86, '簗田政綱', '申し上げます！　義元は桶狭間山に輿を据え、昼の休みを取っておりまする！', 4);
  say(91, NOB, 'それじゃ。山際まで寄せ、義元の本陣を突く！', 3.2);
  // 空が暗くなる（雨はまだ。降り出すのは谷を下る途中＝本体の行軍）
  rt.after(100, () => { if (live()) { sfx('thunder', 0.7); rt.say('組頭 源八', '空が暗い……ひと雨来るぞ。雨は敵の顔へ吹きつける', 3.4); } });
  say(110, NOB, '者ども、谷を下れ！　分捕りはするな、打ち捨てにせよ。目指すは義元が首ひとつ！', 4.2);
  say(116, '組頭 源八', '旗について来い。遅れるな！', 2.8);
  rt.after(DUR, () => finish(rt, def));
  return true;
}

function finish(rt, def) {
  const F = rt.flags, v = F.o15;
  if (v.musterDone) return;
  v.musterDone = true;
  F.briefReadyAt = rt.t;
  // 簗田は谷の脇へ退いて控える（本物の枠を空ける）
  if (v.yana) for (const u of v.yana.units) if (u.alive) rt.army.despawn(u);
  def.startMarch(rt);
}

export function tick(rt) {
  const F = rt.flags, v = F.o15;
  // 戦の段が先へ進んだ（主君で遊ぶ時の早い出立など）なら、集まりはそこで終わる
  if (rt.phase !== 'brief' && !v.musterDone) v.musterDone = true;
}
