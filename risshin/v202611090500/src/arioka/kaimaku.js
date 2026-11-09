// ======================================================================
// 有岡城 開幕の段（0〜約2分30秒）：滝川の陣から上臈塚の木戸の外へ
// 構成：docs/oda15_plan_1108.md の 27（0〜3 城下・荒木村重謀反説明・官兵衛行方不明）。
// 流れ：堀端の竹束の端へ出て惣構えを見る（着くと塀の上の鉄砲が鳴り、上臈塚の砦の灯が見える・手柄）
//   → 上臈塚の木戸の前の竹束へ（既存の①）。二分半ごろ、砦の上で松明が三度振られ、木戸が内から開く（既存の open）。
// 移る間の出来事：謀反の説明・官兵衛の行方・鵯塚の砦の鉄砲・中西新八郎の合図。兵は増やさない。
// ======================================================================
import { sfx } from '../audio.js';

export const KAIMAKU_END = 150;   // 木戸が開いてよい秒（これより前は開かない）

export function install(rt, ctx) {
  const F = rt.flags;
  const S = (F.arOpen = { t0: rt.t, atLook: false, done: false });
  const on = () => F.step === 0 && !F.ending && !rt.over;
  rt.obj('main', '堀端の竹束の端へ出て、惣構えを見よ', 'main', true);
  rt.after(22, () => { if (on()) rt.say('滝川一益', '村重は去年の十月、上様に背いた。毛利と本願寺に通じ、この城に一年籠もっておる', 5); });
  rt.after(58, () => {
    if (!on()) return;
    rt.army.playFar('volley', { x: ctx.gate.x + 40, z: ctx.gate.z + 300 }, 0.6);
    rt.say('足軽', '鵯塚の砦の方で鉄砲じゃ。あちらの寄せ手が気を引いておる', 3.5);
  });
  rt.after(88, () => { if (on()) rt.say('使番', '官兵衛殿の生死は、まだ分からぬ。城の内で見た者はおらぬそうな', 4); });
  rt.after(122, () => {
    if (!on()) return;
    sfx('horagai', 0.4);
    rt.say('物見', '上臈塚の櫓で松明が三度振れた！　中西新八郎の合図じゃ', 4);
  });
}

function sawWall(rt, ctx, byPlayer) {
  const F = rt.flags, S = F.arOpen;
  if (S.atLook) return;
  S.atLook = true;
  rt.army.play('volley', { x: ctx.gate.x + 6, z: ctx.gate.z - 12 }, 0.9);
  const x = ctx.gate.x + 4, z = ctx.gate.z - 10;
  rt.army.smoke?.(x, rt.world.heightAt(x, z) + 4, z, -1, 0, 2.2);
  rt.say('滝川の組頭', byPlayer ? '頭を下げよ！　塀の上の鉄砲じゃ。上臈塚の砦の灯が見えるか、あそこが内応の口よ' : '塀の上から鉄砲じゃ！　上臈塚の砦が内応の口よ', 4.5);
  if (byPlayer) rt.award((t) => { if (!t.side.includes('堀端から惣構えの塀を見届けた')) t.side.push('堀端から惣構えの塀を見届けた'); }, '惣構えを見届けた');
  rt.obj('main', ctx.goal0, 'main', true);
}

// 毎コマ。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.arOpen;
  if (!S || S.done) return;
  const t = rt.t - S.t0, p = rt.player.u.pos, L = ctx.look;
  if (!S.atLook && Math.hypot(p.x - L.x, p.z - L.z) < 4) sawWall(rt, ctx, true);
  if (!S.atLook && t >= 80) sawWall(rt, ctx, false);
  if (F.step >= 1) S.done = true;
}

// 木戸を開けてよいか。時が来ても、本人が竹束の後ろへ寄るまで①を終えない。
export function mayOpen(rt, near) {
  const S = rt.flags.arOpen;
  if (!S) return near;
  const t = rt.t - S.t0;
  return S.atLook && t >= KAIMAKU_END && near;
}

export function pin(rt, ctx) {
  const S = rt.flags.arOpen;
  return S && !S.done && !S.atLook ? ctx.look : null;
}
