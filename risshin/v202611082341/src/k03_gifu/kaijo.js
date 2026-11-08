// ======================================================================
// 岐阜城　寄せ手の厚み・連続の知らせ・木瓜の旗が下りる（docs/toku15_plan_1108.md の 3）
//  ・0〜3分：城下の外れに東軍の本陣と後詰、南の尾根に福島・井伊、南西に浅野の備（遠景の軽い作り）
//  ・3〜6分：使番「池田隊、百曲りへ！」「福島隊、七曲りより登ります！」
//  ・9〜12分：「西の曲輪、突破！」「下の曲輪、落ちました！」と続けて届き、城方が本丸へ集まる
//  ・12〜15分：秀信は討たない。刀を置き、本丸の織田木瓜の旗が下りる
// 本物の兵は足さない。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';
import { sonaeLayers, onceWhen } from '../k_toku_a/sonae.js';

const BLACK = 0x1e1b19;

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world, T = { flags: [] };
  F.k03k = T;
  const step = () => F.step ?? 0;
  // 東軍の厚み：西の城下の外れ（池田の後詰・本陣の後ろ）、南西の瑞龍寺山（浅野）、南の尾根の麓（福島・井伊）
  sonaeLayers(rt, { x: -246, z: 6, facing: Math.PI / 2, mon: 'ageha', armor: BLACK, team: 0, seed: 31, layers: [{ back: 0, w: 36, d: 10, count: 140 }, { back: 24, w: 30, d: 10, count: 110 }] });
  sonaeLayers(rt, { x: -158, z: 176, facing: Math.PI * 0.85, mon: 'asano', armor: BLACK, team: 0, seed: 32, layers: [{ back: 0, w: 30, d: 10, count: 110 }] });
  sonaeLayers(rt, { x: 22, z: 112, facing: Math.PI, mon: 'mizuno', armor: BLACK, team: 0, seed: 33, layers: [{ back: 0, w: 34, d: 10, count: 130 }, { back: 22, w: 18, d: 10, count: 60, kind: 'honjin' }] });
  sonaeLayers(rt, { x: -64, z: 150, facing: Math.PI, mon: 'ii', armor: 0x7a2c1e, team: 0, seed: 34, layers: [{ back: 0, w: 30, d: 10, count: 110 }] });
  // 本丸の織田木瓜の旗（開城で下りる）
  for (const [dx, dz] of [[4, -5], [4, 5]]) {
    try { const m = nobori(W, 2 + dx, dz, 'oda', 6); rt.scene.add(m); T.flags.push({ m, y0: m.position.y }); } catch (e) { /* 立てられない時は置かない */ }
  }

  T.tick = onceWhen(rt, [
    [() => step() >= 3, () => rt.after(8, () => rt.say('使番', '池田隊、百曲りへ！　福島隊は七曲りより登ります！', 3.4))],
    [() => step() >= 4, () => rt.after(12, () => { sfx('horagai', 0.5); rt.say('使番', '西の曲輪、突破！', 2.6); })],
    [() => step() >= 5, () => {
      rt.after(3, () => rt.say('使番', '下の曲輪、落ちました！　城方は本丸へ集まっております', 3.4));
      rt.after(9, () => rt.say('池田長吉', '岐阜中納言殿は討つな。殿の仰せじゃ', 3));
    }],
  ]);

  // 開城：秀信が刀を置いた後、本丸の木瓜の旗がゆっくり下りる
  T.ending = () => {
    rt.after(19.5, () => {
      sfx('taiko', 0.4);
      for (let k = 1; k <= 12; k++) rt.after(k * 0.35, () => { for (const f of T.flags) { f.m.position.y = f.y0 - k * 0.5; if (k === 12) f.m.visible = false; } });
    });
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}
