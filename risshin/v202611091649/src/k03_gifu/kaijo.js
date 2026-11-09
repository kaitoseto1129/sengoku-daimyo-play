// ======================================================================
// 岐阜城　連続の知らせ・木瓜の旗が下りる（docs/toku15_plan_1108.md の 3）
//  ・3〜6分：使番「池田隊、百曲りへ！」「福島隊、七曲りより登ります！」
//  ・9〜12分：「西の曲輪、突破！」「下の曲輪、落ちました！」と続けて届き、城方が本丸へ集まる
//  ・12〜15分：秀信は討たない。刀を置き、本丸の織田木瓜の旗が下りる
// 軍勢は本体の実兵だけ。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';
import { onceWhen } from '../k_toku_a/sonae.js';

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world, T = { flags: [] };
  F.k03k = T;
  const step = () => F.step ?? 0;
  // 岐阜城は見せかけの軍勢を置かない。寄せ手は本体の池田・浅野・福島の隊だけにする。
  // 本丸の織田木瓜の旗（開城で下りる）
  for (const [dx, dz] of [[4, -5], [4, 5]]) {
    try { const m = nobori(W, 2 + dx, dz, 'oda', 6); rt.scene.add(m); T.flags.push({ m, y0: m.position.y }); } catch (e) { /* 立てられない時は置かない */ }
  }

  // 段の知らせが遅れて降伏の台詞に割り込まないよう、届く時にも段を確かめる。
  const report = (n, delay, fn) => rt.after(delay, () => { if (!F.ending && step() === n) fn(); });
  T.tick = onceWhen(rt, [
    [() => step() >= 3, () => report(3, 8, () => rt.say('使番', '池田隊、百曲りへ！　福島隊は七曲りより登ります！', 3.4))],
    [() => step() >= 4, () => report(4, 12, () => { sfx('horagai', 0.5); rt.say('使番', '西の曲輪、突破！', 2.6); })],
    [() => step() >= 5, () => {
      // 本体の使番（一秒）と秀信（五秒）の台詞を遮らず、順に届ける。
      report(5, 9, () => rt.say('使番', '下の曲輪、落ちました！　城方は本丸へ集まっております', 3.4));
      report(5, 14, () => rt.say('池田長吉', '岐阜中納言殿は討つな。殿の仰せじゃ', 3));
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

// ---- 布陣図（docs/fujin/k03_gifu.md）：東軍およそ三万四千が城山の西・南西・南を囲む。陣立ての表（docs/army_depth_howto.md） ----
//   前の本物の隊（池田長吉・浅野・福島・池田輝政の本陣）は bind で結び、後ろと翼は軽い備。城方は本物の守りに結ぶ。各家の兵の分け方は推定。
const Fk = (k) => (rt) => rt.flags[k];
const Pre = (n) => (rt) => rt.flags.pre?.[n];
export const depthPlan = {
  byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/）
  A: { name: '東軍', facing: Math.PI / 2, honjin: { x: -214, z: 10 }, mpu: 6, formation: '鶴翼', terrain: 'mountain', flag: 'ageha', armor: 0x1c1a1a, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'nagayoshi', layer: 'sakite', wing: 'center', men: 1500, taisho: '池田長吉', flag: 'ageha', bind: Fk('naga') },
      { id: 'ikeda2', layer: 'ni', wing: 'center', men: 2500, taisho: '', flag: 'ageha', at: { x: -232, z: -26 }, hold: true },
      { id: 'honjin', layer: 'hatamoto', wing: 'center', men: 1500, taisho: '池田輝政', flag: 'ageha', bind: Fk('honjin'), hold: true },
      { id: 'asano', layer: 'ichi', wing: 'right', men: 3000, taisho: '浅野幸長', flag: 'asano', bind: Fk('asano') },
      { id: 'asano2', layer: 'ni', wing: 'right', men: 3500, taisho: '', flag: 'asano', at: { x: -150, z: 182 }, hold: true },
      { id: 'fuku', layer: 'ichi', wing: 'right', men: 3000, taisho: '福島正則', flag: 'mizuno', bind: Fk('fuku') },
      { id: 'fuku2', layer: 'ni', wing: 'right', men: 3000, taisho: '', flag: 'mizuno', at: { x: 20, z: 110 }, hold: true },
      { id: 'hosokawa', layer: 'ni', wing: 'right', men: 5000, taisho: '細川忠興', flag: 'maru', at: { x: -40, z: 136 }, hold: true },
      { id: 'kato', layer: 'yobi', wing: 'right', men: 3000, taisho: '加藤嘉明', flag: 'maru', at: { x: 60, z: 138 }, hold: true },
      { id: 'kyogoku', layer: 'yobi', wing: 'right', men: 3000, taisho: '京極高知', flag: 'kyogoku', at: { x: -96, z: 176 }, hold: true },
      { id: 'ii', layer: 'yobi', wing: 'left', men: 3600, taisho: '井伊直政', flag: 'akazonae', at: { x: -230, z: 60 }, hold: true },
      { id: 'honda', layer: 'yobi', wing: 'left', men: 500, taisho: '本多忠勝', flag: 'honda', at: { x: -250, z: 34 }, hold: true },
    ] },
  B: { name: '岐阜方', facing: -Math.PI / 2, honjin: { x: -5, z: 0 }, mpu: 6, formation: '方円', terrain: 'castle', flag: 'oda', armor: 0x6a3022, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'tsuda', layer: 'sakite', wing: 'center', men: 1200, taisho: '津田藤三郎', bind: Fk('g1') },
      { id: 'dodo1', layer: 'ichi', wing: 'center', men: 1200, taisho: '', bind: Pre(2) },
      { id: 'dodo', layer: 'ni', wing: 'center', men: 1200, taisho: '百々綱家', bind: Pre(3) },
      { id: 'kozukuri', layer: 'ni', wing: 'right', men: 1300, taisho: '木造長政', bind: Pre(4) },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 1600, taisho: '織田秀信', bind: Pre(5), hold: true },
    ] },
  honjinView: { A: false, B: false },
};
