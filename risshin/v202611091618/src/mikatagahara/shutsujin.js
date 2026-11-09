// ======================================================================
// 三方ヶ原の戦い　始まりの段「出陣と物見」（0〜3分の導入。kaito 11/8 夜・docs/oda15_plan_1108.md 13）
// 浜松から台地へ上がった織田の加勢（平手汎秀・佐久間信盛）の後ろから始まる。
//   ① 根洗の松の高みへ上がって武田の陣立てを見る：着くと武田の魚鱗が向き直り、太鼓と法螺が鳴り、敵将の名が頭上に出る（物見に着いたら必ず何か起きる）。
//   ② 平手の槍の持ち場へ戻る：着くと最初の接触（武田の物見の騎馬・先手の寄せ。本体の first）へ。
// 歩く間も、伝令・遠い太鼓・家康の法螺・鶴翼が開く動きで戦況を見せる（移動もイベント）。
// 行かなくても時が来れば戦は進む（二5）。字は札の一行と名だけ（五1）。
// ======================================================================
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

export const MI = { x: 40, z: -30 };
const JOIN = { x: 18, z: 4 };          // 平手の列の後ろ（持ち場の十六歩南）
const JOIN_WAIT = 40;   // 根洗の松の小高い所の南の肩（右の森の手前。魚鱗の先手から四十歩ほど）
const SCOUT_WAIT = 75;                 // 物見に上がらない時も、この秒で持ち場へ移る
const POST_WAIT = 45;                  // 持ち場へ戻らない時も、この秒で最初の寄せへ
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

// ctx：{ HIRATE_POST, adv, next }。next は本体の first（最初の接触）
export function install(rt, ctx) {
  const F = rt.flags;
  F.mkStage = -1; F.mkScout = JOIN;
  rt.setPhase('march');
  // まず台地を北へ進む平手・佐久間の列の後ろへ追いつく（歩く間に伝令・太鼓・家康の法螺）
  rt.obj('main', '台地を北へ進み、平手の列の後ろへ追いつけ', 'main', true);
  rt.marker('mkScout', JOIN, '平手の列の後ろ', { h: 2, guideAlways: true });
  rt.say('組頭', '遅れるな！　平手の殿の列は台地の上じゃ。北へ走れ！', 3.2);
  const t0 = rt.t;
  const live = () => !F.ending && !rt.over && F.mkStage <= 0;
  rt.after(8, () => { if (!live()) return; sfx('taiko', 0.35); rt.say('伝令', '申し上げる！　武田の本隊、祝田の坂へ向かうと見せて、台地の上に留まっておりまする！', 3.8); });
  rt.after(17, () => {
    if (!live()) return;
    sfx('horagai', 0.5);
    rt.say('徳川家康', '鶴翼に開け！　武田の背を突く', 3.2);
    for (const b of Object.values(F.bA || {})) ctx.adv(b, 5, 16);
  });
  const toScout = () => {
    if (F.mkStage !== -1) return;
    F.mkStage = 0; F.mkScout = MI; F.tScout = rt.t;
    rt.obj('main', '根洗の松の高みへ上がり、武田の陣立てを見よ', 'main', true);
    rt.marker('mkScout', MI, '根洗の松', { h: 2, guideAlways: true });
    rt.say('平手汎秀', 'よう来た。その方、右手の根洗の松の高みへ上がれ。武田がどう構えておるか見て参れ', 3.8);
    rt.after(14, () => { if (live()) rt.say('佐久間信盛', '平手殿、急くな。三万の武田ぞ。我らは右を固めるだけでよい', 3.6); });
    rt.after(24, () => { if (live()) { sfx('taiko', 0.45); rt.say('足軽', '北の台地で太鼓が鳴り止まんがや……', 2.8); } });
    scoutTick();
  };
  const joinTick = () => {
    if (F.ending || rt.over || F.mkStage !== -1) return;
    const u = rt.player?.u;
    if (u && near(u.pos, JOIN, 8) || rt.t - t0 > JOIN_WAIT) { toScout(); return; }
    rt.after(0.4, joinTick);
  };
  const toPost = () => {
    if (F.mkStage !== 0) return;
    F.mkStage = 1; F.mkScout = null; F.tPost = rt.t;
    rt.unmark('mkScout');
    rt.obj('main', '平手の槍の持ち場へ戻り、北へ槍を構えよ', 'main', true);
    rt.marker('hira', ctx.HIRATE_POST, '平手の槍の持ち場', { h: 2, guideAlways: true, guideArea: 'wait', guideRadius: 8 });
    const tick = () => {
      if (F.ending || rt.over || F.mkStage !== 1) return;
      const u = rt.player?.u;
      const there = u && near(u.pos, ctx.HIRATE_POST, 8);
      if (there || rt.t - F.tPost > POST_WAIT) {
        F.mkStage = 2;
        rt.say('平手汎秀', there ? 'よう戻った。槍を揃えよ。北の野から馬が来るぞ' : '持ち場へ急げ！　北の野から馬が来るぞ', 3);
        rt.after(3.5, () => { if (!F.ending) ctx.next(); });
        return;
      }
      rt.after(0.4, tick);
    };
    tick();
  };

  const report = () => {
    if (F.scoutDone) return;
    F.scoutDone = true;
    // 着いたら武田が動く：魚鱗の備が一斉にこちらへ向き直って一歩寄せ、太鼓と法螺。敵将の名が頭上に出る
    sfx('taiko', 0.8);
    rt.after(1.2, () => sfx('horagai', 0.6));
    rt.banner('武田、向き直る', '魚鱗の陣で台地の上に待ち構えていた');
    for (const id of ['oyamada', 'yamagata', 'baba', 'naito', 'obata', 'katsuyori', 'kosaka']) ctx.adv(F.bT?.[id], 8, 10);
    for (const n of ['武田信玄', '山県昌景', '馬場信春', '小山田信茂', '内藤昌豊', '武田勝頼', '高坂昌信']) { try { revealName(rt, n); } catch (e) { /* 名の無い将は飛ばす */ } }
    rt.award((t) => { t.side.push('根洗の松から武田の魚鱗を見届けた'); t.special = { label: '武田の陣立てを物見した', pts: Math.max(t.special ? t.special.pts : 0, 10) }; }, '武田の陣立てを見届けた', MI);
    rt.say('物見', '魚鱗じゃ！　先手は小山田、右に赤い旗の山県、奥に信玄の旗！', 3.4);
    rt.after(3.8, () => { if (!F.ending) rt.say('平手汎秀', '……誘われたか。台地の上で向き直って待っておったとは', 3.2); });
    rt.after(8, () => { if (!F.ending) { sfx('horagai', 0.7); rt.say('物見', '馬が出た！　武田の物見の騎馬が野へ散る！', 3); } });
    rt.after(14, toPost);
  };
  const scoutTick = () => {
    if (F.ending || rt.over || F.mkStage !== 0) return;
    const u = rt.player?.u;
    if (u && rt.t - F.tScout > 2 && near(u.pos, MI, 7)) { report(); return; }
    if (rt.t - F.tScout > SCOUT_WAIT) { toPost(); return; }
    rt.after(0.4, scoutTick);
  };
  joinTick();
}
