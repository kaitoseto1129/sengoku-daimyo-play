// ======================================================================
// 第二次木津川口 ①の段の前：開幕（0〜約2分40秒）
// 構成：docs/oda15_plan_1108.md の 25（0〜3 船上開始・九鬼嘉隆・毛利水軍接近）。
// 流れ：艫の乗り込みを払う → 西の大筒へ（着くと味方の大船が試し撃ち・まだ遠いと分かる）
//   → 舳先で沖を見る（着くと敵の陣太鼓と法螺貝・小早が櫓を揃える・手柄）→ 二分四十秒ほどで①（大筒）へ。
// 兵も船も増やさない。台詞・音・煙・水柱と、行き先のピンだけ。
// ======================================================================
import { sfx } from '../audio.js';

const BOW = { x: 0, z: -11 };   // 舳先（甲板の北の端）
export const KAIMAKU_END = 160;  // ①（大筒）へ移る秒

export function install(rt, ctx) {
  const F = rt.flags;
  const S = (F.kzOpen = { t0: rt.t, atGun: false, atBow: false, bowAsked: false, done: false });
  const alive = () => F.step === 0 && !F.ending && !rt.over;
  // 味方の大船の試し撃ち（届かない水柱）。遠い事を絵で見せる。
  const ranging = (k) => {
    const e = F.escorts?.[k % (F.escorts.length || 1)];
    if (!e) return;
    rt.army.play('volley', { x: e.x, z: e.z }, 1.3);
    rt.army.smoke(e.x - 3, 4, e.z + 2, -1, 0.4, 2.6);
    rt.after(1.4, () => {
      if (!alive() || !F.cannonSplash) return;
      F.cannonSplash.at = rt.t;
      F.cannonSplash.mesh.position.set(e.x - 70, 0.5, e.z + 45);
    });
  };
  S.ranging = ranging;
  rt.after(28, () => { if (alive()) { ranging(0); rt.say('物見', '一番船が試しに放った！　玉は沖の手前に落ちたぞ', 3); } });
  rt.after(70, () => {
    if (!alive()) return;
    rt.say('伝令', '滝川殿の白船より！　敵は二手に分かれ、西と南から寄せる構えと！', 4);
    rt.army.playFar('taiko', { x: -120, z: 120 }, 0.7);
  });
  rt.after(100, () => { if (alive()) { ranging(1); rt.say('九鬼嘉隆', 'まだ撃つな。十分に引き付けてからじゃ', 3); } });
  rt.after(128, () => {
    if (!alive()) return;
    rt.army.playFar('sig_kakari', { x: -110, z: 90 }, 0.9);
    rt.after(1.5, () => { if (alive()) rt.army.playFar('toki', { x: -90, z: 70 }, 0.8); });
    rt.say('物見', '小早が櫓を揃えた！　いっせいに漕ぎ寄せて来るぞ！', 3);
  });
}

function toBow(rt) {
  const F = rt.flags, S = F.kzOpen;
  if (S.bowAsked) return;
  S.bowAsked = true;
  rt.unmark('g1');
  rt.obj('main', '舳先へ出て、沖の船団を見よ', 'main');
  rt.marker('kzbow', BOW, '舳先', { h: 2, guidePriority: 150, guideAlways: true, hideNear: 2.4, hideOnArrival: true });
}

function sawFleet(rt, ctx, byPlayer) {
  const F = rt.flags, S = F.kzOpen;
  if (S.atBow) return;
  S.atBow = true;
  rt.unmark('kzbow');
  sfx('horagai', 0.6);
  rt.army.playFar('sig_kakari_taiko', { x: -120, z: 110 }, 0.9);
  rt.say('九鬼嘉隆', byPlayer ? '見えたか。あの奥の関船の群れに、大将が乗っておる。まず寄せる小早を払うぞ' : '敵の陣太鼓じゃ。奥の関船に大将が乗っておる。まず寄せる小早を払うぞ', 4);
  if (byPlayer) rt.award((t) => { if (!t.side.includes('舳先から毛利の船団を見届けた')) t.side.push('舳先から毛利の船団を見届けた'); }, '沖の船団を見届けた');
  rt.obj('main', '西の大筒へ戻り、寄せる船を待て', 'main');
  ctx.gunMark(rt);
}

// 毎コマ。①へ移る時に true。
export function tick(rt, dt, ctx) {
  const F = rt.flags, S = F.kzOpen;
  if (!S || S.done) return false;
  const t = rt.t - S.t0, u = rt.player.u;
  if (!S.atGun && ctx.dist(u, F.guns[1].post) <= 2.6) {
    S.atGun = true;
    rt.say('大筒の者', 'よう来た。まだ遠い、玉が届かぬ。舳先から沖の様子を見て参れ', 3.5);
    S.ranging(2);
    toBow(rt);
  }
  if (!S.bowAsked && t >= 45) toBow(rt);
  if (S.bowAsked && !S.atBow && ctx.dist(u, BOW) <= 2.6) sawFleet(rt, ctx, true);
  if (!S.atBow && t >= 112) sawFleet(rt, ctx, false);
  if (t >= KAIMAKU_END) { S.done = true; return true; }
  return false;
}

// bot：大筒 → 舳先 → 大筒
export function botGoal(rt) {
  const F = rt.flags, S = F.kzOpen;
  if (!S || S.done) return null;
  if (S.bowAsked && !S.atBow) return BOW;
  return F.guns[1].post;
}
