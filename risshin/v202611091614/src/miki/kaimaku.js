// ======================================================================
// 三木城・大村の合戦 開幕の段（0〜約2分40秒）：夜明け前の平田の付城
// 構成：docs/oda15_plan_1108.md の 26（0〜3 三木城包囲陣・秀吉・兵糧遮断）。
// 流れ：平田の井楼へ上がり城と大村道を見る（着くと松明の列＝毛利の荷駄が見え、法螺貝・手柄）
//   → 西の槍組の旗へ（行くと谷大膳が持ち場を言い渡す）→ 二分四十秒ほどで荷駄の段（convoy）へ。
// 移る間の出来事：平井山からの使番（秀吉の下知）・遠くの付城の鉄砲・官兵衛が有岡から戻らぬ噂（次の戦の伏線）。
// 兵は増やさない。台詞・音・行き先のピンだけ。
// ======================================================================
import { sfx } from '../audio.js';

export const KAIMAKU_END = 160;   // 荷駄の段へ移る秒

export function install(rt, ctx) {
  const F = rt.flags;
  const S = (F.mkOpen = { t0: rt.t, atLook: false, atSpear: false, done: false });
  const on = () => !F.step && !F.ending && !rt.over;
  rt.obj('main', '平田の井楼へ上がり、城と大村道を見よ', 'main');
  rt.objProgress('main', '');
  rt.after(24, () => {
    if (!on()) return;
    rt.say('使番', '平井山の秀吉様より！　今宵、毛利の荷が城へ入る。一粒も通すな、との仰せ', 4.5);
  });
  rt.after(52, () => {
    if (!on()) return;
    rt.army.playFar('volley', { x: 40, z: -110 }, 0.7);
    rt.say('足軽', '南の付城で鉄砲じゃ。城の者が夜ごとに柵を探りに来る', 3.5);
  });
  rt.after(84, () => {
    if (!on()) return;
    rt.say('足軽', '黒田官兵衛様は、有岡の荒木殿の所へ使いに出たきり、一年も戻らぬそうな', 4);
  });
  rt.after(118, () => {
    if (!on()) return;
    rt.army.playFar('taiko', { x: -170, z: -80 }, 0.7);
    rt.say('物見', '大村道に馬の嘶き！　荷駄がそこまで来ておる', 3.5);
  });
}

function sawRoad(rt, ctx, byPlayer) {
  const F = rt.flags, S = F.mkOpen;
  if (S.atLook) return;
  S.atLook = true;
  sfx('horagai', 0.5);
  rt.army.playFar('taiko', { x: 70, z: 30 }, 0.6);
  rt.say('物見', byPlayer ? '見えるか。西の大村道に松明の列……毛利の荷駄じゃ。城の門も開きかけておる' : '西の大村道に松明の列！　毛利の荷駄じゃ', 4.5);
  if (byPlayer) rt.award((t) => { if (!t.side.includes('井楼から荷駄の松明を見つけた')) t.side.push('井楼から荷駄の松明を見つけた'); }, '荷駄の松明を見つけた');
  rt.obj('main', '西の槍組の旗へ行け', 'main');
  rt.objProgress('main', '西の印で槍組に加われ');
  ctx.spearMark(rt);
}

// 毎コマ（半秒ごと）。荷駄の段へ移る時に true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.mkOpen;
  if (!S || S.done) return false;
  const t = rt.t - S.t0, p = rt.player.u.pos, L = ctx.look;
  if (!S.atLook && Math.hypot(p.x - L.x, p.z - L.z) < 4.5) sawRoad(rt, ctx, true);
  if (!S.atLook && t >= 95) sawRoad(rt, ctx, false);
  const sp = ctx.spearAt();
  if (S.atLook && !S.atSpear && sp && Math.hypot(p.x - sp.x, p.z - sp.z) < 6) {
    S.atSpear = true;
    rt.say('谷大膳', 'よう来た。この槍組と並べ。法螺が鳴ったら道をふさぐぞ', 4);
  }
  if (t >= KAIMAKU_END) { S.done = true; return true; }
  return false;
}

export function pin(rt, ctx) {
  const S = rt.flags.mkOpen;
  if (!S || S.done) return null;
  return S.atLook ? ctx.spearAt() : ctx.look;
}
