// ======================================================================
// 河田・米野　渡河の厚みと戦況の移り（docs/toku15_plan_1108.md の 2）
//  ・0〜3分：南岸に河田の手の備が奥へ重なる（池田の二陣・本陣の後ろ、浅野・一柳・山内）。北の奥に織田の後詰
//  ・6〜9分：米野。東軍が次々渡り、北岸に味方の旗が増える。本物の隊で百々・飯沼の手と戦う
//  ・9〜12分：米野が崩れると織田勢は岐阜へ退く。深追いせず新加納へ進む
//  ・12〜15分：使番「秀信、岐阜城へ籠もりました！」。東軍の備が金華山の麓へ動く
// 本物の兵は足さない。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { sfx } from '../audio.js';
import { onceWhen } from '../k_toku_a/sonae.js';
import { depthOrder, ST } from '../army_depth.js';

const BLACK = 0x1e1b19, WEST = 0x2a2622;

export function install(rt, ctx) {
  const F = rt.flags, T = {};
  F.k02t = T;
  const di = () => F.dp?.i ?? -1;
  const crossed = () => {
    const s = F.depth?.A?.sonae.find((q) => q.id === 'ikeda2');
    return F.east?.count > 0 && F.east.center().z < -30 && s?.men > 0 && s.z < -20 && s.state !== ST.AWAY && s.state !== ST.APPROACH;
  };
  T.tick = onceWhen(rt, [
    // 段だけで渡河済みと告げず、山内の手と池田の二陣が北岸へ着くのを待つ。
    [() => di() >= 3 && crossed(), () => rt.after(1, () => rt.say('使番', '山内殿・池田の二陣、続いて渡りました！　尾越の福島殿も渡り終えたと', 3.4))],
    // 米野は本物の隊だけで戦う。段の外に勝敗・人数に入らない兵や騎馬を足さない（確認表の四の1・十二の2）
    [() => di() >= 4, () => {
      rt.after(5, () => rt.say('浅野幸長', '百々と飯沼の手を破れ。米野を抜けば敵は総崩れじゃ', 3.6));
      rt.after(40, () => rt.say('使番', '尾越を渡った福島殿・黒田殿・細川殿は、竹ヶ鼻の城を攻めておりまする', 3.6));
    }],
    // 米野が崩れた：本物の織田勢が退く。深追いはさせない
    [() => !!F.yonenoBroke, () => {
      rt.after(2, () => sfx('horagai', 0.6));
      rt.after(7, () => rt.say('池田照政', '敵は岐阜へ退く。深追いはするな、新加納の砦を先に破る', 3.8));
    }],
    // 新加納の段：北の奥の後詰は岐阜へ退いて消える
    [() => di() >= 6, () => { const V = F.depth; if (V?.B) depthOrder(V.B, 'gozume', 'retreat'); }],
  ]);

  // 締め：使番の知らせ → 東軍の備が金華山の麓へ動き出す
  T.ending = () => {
    rt.after(1, () => { sfx('horagai', 0.6); rt.say('使番', '秀信、岐阜城へ籠もりました！', 3); });
    rt.after(17.6, () => rt.say('池田照政', '皆、金華山の麓へ。明日は城攻めじゃ', 3.6));
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}

// ---- 陣立ての表（docs/army_depth_howto.md）：前の本物の隊は bind で結び、奥と翼は軽い備 ----
// 東軍（generals_toyo_toku 2）：河田の池田・浅野・一柳・山内は本物。後ろと翼は河田の手の二の備だけ（critic60：尾越を渡った福島・黒田・細川は
//   ここに居ない。使番の知らせで別の渡しの戦を伝える）。
//   渡った後の池田の二陣・山内の二陣は北岸へ後から着く（土煙と旗が先に見える）。
// 織田（岐阜方）：北岸の木造長政・東の浅瀬の鉄砲は本物。奥に後詰。
// 秀信の本陣は川手の閻魔堂で、この戦場には置かない（battle_refs/k02_kawada）。
// 備ごとの数は表示用の配分。合計は人数の棒と同じ東軍一万八千・織田三千にする。
const Fk = (k) => (rt) => rt.flags[k];
export const depthPlan = {
  byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/）
  A: { name: '東軍', facing: Math.PI, honjin: { x: -24, z: 132 }, mpu: 6, formation: '雁行', terrain: 'river', flag: 'ageha', armor: BLACK, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'mine', layer: 'sakite', wing: 'center', men: 300, taisho: '', bind: Fk('mine') },
      { id: 'hitotsu', layer: 'sakite', wing: 'left', men: 400, taisho: '一柳直盛', flag: 'kuginuki', bind: Fk('hitotsu') },
      { id: 'nagayoshi', layer: 'ichi', wing: 'center', men: 800, taisho: '池田長吉', bind: Fk('nagayoshi') },
      { id: 'asano', layer: 'ichi', wing: 'left', men: 1500, taisho: '浅野幸長', flag: 'asano', bind: Fk('asano') },
      { id: 'yamauchi', layer: 'ichi', wing: 'right', men: 1000, taisho: '山内一豊', flag: 'kashiwa', bind: Fk('east') },
      { id: 'ikeda2', layer: 'ni', wing: 'center', men: 2500, taisho: '', flag: 'ageha', at: { x: -22, z: -32 }, from: { x: -22, z: 70 }, arrive: 230 },
      { id: 'yamauchi2', layer: 'ni', wing: 'right', men: 1000, taisho: '', flag: 'kashiwa', at: { x: 30, z: -26 }, from: { x: 70, z: 60 }, arrive: 300 },
      { id: 'hitotsu2', layer: 'ni', wing: 'left', men: 1000, taisho: '', flag: 'kuginuki', at: { x: -205, z: 72 }, hold: true },
      { id: 'ikeda3', layer: 'yobi', wing: 'right', men: 6500, taisho: '', flag: 'ageha', at: { x: 62, z: 128 }, hold: true },
      { id: 'yamauchi3', layer: 'yobi', wing: 'right', men: 1000, taisho: '', flag: 'kashiwa', at: { x: 122, z: 112 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '池田照政', bind: Fk('honjin') },
    ] },
  B: { name: '岐阜方', facing: 0, honjin: { x: -40, z: -218 }, mpu: 6, formation: '長蛇', terrain: 'river', flag: 'oda', armor: WEST, uma: 'kasa', openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'gun', layer: 'sakite', wing: 'center', men: 600, taisho: '', bind: Fk('northGun') },
      { id: 'kozukuri', layer: 'ichi', wing: 'center', men: 800, taisho: '木造長政', bind: Fk('northGuard') },
      { id: 'east', layer: 'sakite', wing: 'right', men: 400, taisho: '', bind: Fk('eastFoe') },
      { id: 'gozume', layer: 'yobi', wing: 'center', men: 1200, taisho: '', at: { x: -8, z: -196 }, hold: true },
    ] },
  honjinView: { A: false, B: false },
};
