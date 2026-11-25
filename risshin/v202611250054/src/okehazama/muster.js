// ======================================================================
// 桶狭間 0〜2分半：中島砦の下の集まり（善照寺から移った織田勢）
//   『信長公記』：善照寺の砦で勢を揃えた信長は、佐々隼人正・千秋四郎の三百ほどが今川の前へ先駆けして討たれるのを見て、
//   中島へ移ろうとした。家老衆は「脇は深田、一騎ずつの道で、敵に勢の少ないのが見える」と馬の轡を取って止めたが、信長は振り切った。
//   簗田政綱の物見の知らせ（義元は桶狭間山で休む）は後世の伝え。ここでは知らせとして台詞だけに使う。
//   遠くの先駆けの戦いは軽い作り（addClash・本物の兵は増やさない）。終わったら本体の startMarch（谷を下る）。
// ======================================================================
import { sfx } from '../audio.js';

// 11/10 first4：始まりの待ちは十五秒まで（kaito_standard_short）。124 秒立たせていたのを十二秒で打ち立ち、
//   先駆けの討死・家老の諫め・簗田の知らせは、谷を下る行軍の間に歩きながら聞かせる（物語はそのまま・止まらない）。
const DUR = 6;   // 11/12 司令塔：起動から最初の斬り合いまで60秒以内（初日に辞める九割）。集まりは六秒

export function start(rt, def, C) {
  const F = rt.flags, v = F.o15;
  if (v.musterT) return !v.musterDone;
  if (rt.over || F.ending || rt.phase !== 'brief') return false;
  v.musterT = rt.t;
  F.zenshojiSaid = true;   // 本体の行軍の始めの二言（二千に足らぬ・先駆けの討死）は、ここで目の前の事として言う
  F.briefWaitDuration = DUR;   // 集まりの間も、待つ輪を実際の長さで満たす
  F.briefReadyAt = rt.t + DUR;
  const lord = !!rt.G.lord, NOB = lord ? '自分' : '織田信長';
  // 集まり（brief）と谷を下る行軍（march）の間だけ語る。かかれの後には持ち越さない。
  const live = () => !rt.over && !F.ending && (rt.phase === 'brief' || rt.phase === 'march');
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (live()) rt.say(who, s, d); });
  say(1, '組頭 源八', '二千に足らぬが、殿について今川の本陣を突くぞ', 3.4);
  // 佐々・千秋の先駆け：谷の向こうの今川の前で、三百ほどが二倍の今川勢とぶつかり、崩れて討たれる（遠くの軽い大軍）
  rt.after(2, () => {
    if (!live() || !rt.world.addClash) return;
    try {
      const p = C.fieldPoint(-74, -150);
      v.saki = rt.world.addClash({ rt, play: (k, q, vv) => rt.army.play?.(k, q, vv), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
        x: p.x, z: p.z, facing: Math.PI + C.FIELD_TURN, w: 30, gap0: 14, seed: 1560, noRout: true, noWake: true,
        A: { flag: 'oda', armor: 0x24221f, count: 90 }, B: { flag: 'imagawa', armor: 0x3f2a24, count: 220, guns: true } });
      rt.after(1, () => v.saki?.go());
      rt.after(10, () => { v.saki?.push('B', 0.8); v.saki?.shake('A', 30); });
      rt.after(20, () => v.saki?.rout('A', { from: 0, hideAfter: 30 }));
    } catch (e) { v.saki = null; }
    rt.army.playFar?.('toki', C.fieldPoint(-74, -150), 1.2);
  });
  // 行軍の台詞は大事な三行だけ：雨・今川の本陣が近い・突っ込め（11/12 司令塔）
  say(6, '組頭 源八', '空が暗い……ひと雨来るぞ。雨は敵の顔へ吹きつける', 3.2);
  say(13, '簗田政綱', '申し上げます！　義元は桶狭間山で休んでおりまする。本陣はもう近い！', 3.6);
  say(21, NOB, '者ども、突っ込め！　目指すは義元が首ひとつ！', 3.4);
  rt.after(DUR, () => finish(rt, def));
  return true;
}

function finish(rt, def) {
  const F = rt.flags, v = F.o15;
  if (v.musterDone) return;
  v.musterDone = true;
  F.briefReadyAt = rt.t;
  def.startMarch(rt);
}

export function tick(rt) {
  const F = rt.flags, v = F.o15;
  // 戦の段が先へ進んだ（主君で遊ぶ時の早い出立など）なら、集まりはそこで終わる
  if (rt.phase !== 'brief' && !v.musterDone) v.musterDone = true;
}
