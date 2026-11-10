// ======================================================================
// 鳥取城　導入の段（0〜3分・docs/oda15_plan_1108.md 29）
// 太閤ヶ平の秀吉の本陣で下知を聞き、北西の櫓台から山の上の城を、西の土塁から千代川を見る（物見に着くと米舟の灯りが見つかる）。
// 大手口から下ると、場面は千代川の岸の組へ移る（元の①兵糧舟の段が始まる）。
// 入れ方：b_tottori.js の setup の終わりで install(rt, K) を一度。K は本体の定数（TAIKO・CASTLE）。
// ======================================================================
import { k15Off, k15Squad, k15Go as timedGo, k15Scenes, k15Fade } from '../oda15_kit.js';
import { evPerson } from '../b_ev6.js';
import { placeGroup, placePlayer } from '../b_opening.js';
import { sfx } from '../audio.js';

// 到着する役目は、時間だけで果たしたことにしない。
const k15Go = (rt, id, pos, r, text, label, fn, o = {}) =>
  timedGo(rt, id, pos, r, text, label, (r2) => {
    // 着いた後の台詞の間もピンを切らさない（関所3）：着いた所に残し、次の行き先で置き換える
    const p = typeof pos === 'function' ? pos() : pos;
    if (p) { const at = { x: p.x, z: p.z }; rt.marker('k15', () => at, label, { h: o.h || 3, guideAlways: true }); }
    fn(r2);
  }, { ...o, limit: Infinity });

export function install(rt, K) {
  const F = rt.flags;
  if (k15Off(rt)) return;
  const T = K.TAIKO, X = T.w / 2, Z = T.d / 2;
  F.k15on = true; F.k15stage = 'taiko';
  rt.unmark('hide');
  const back = rt.objectives.find((o) => o.id === 'main')?.text;
  // 本陣の内、秀吉の床几の南。組も後ろに付ける
  placePlayer(rt, T.x + 8, T.z + 16, Math.PI);
  k15Squad(rt, T.x + 10, T.z + 20);
  F.k15kanbei = rt.army.units.some((u) => u.alive && u.name === '黒田官兵衛') ? null
    : evPerson(rt, 0, '黒田官兵衛', { x: T.x - 5, z: T.z - 2 }, Math.PI, { calm: true });
  rt.banner('天正九年九月　太閤ヶ平', '羽柴秀吉の本陣。山の上の鳥取城を、付城と柵で囲む');
  // 大手口へは門の真北から真っすぐ下る（斜めに寄ると土塁の裾で止まった）
  const OTE_WP = [[T.x, T.z + Z - 10], [T.x, T.z + Z + 1]];
  let oi = 0;
  const ote = () => {
    const me = rt.player.u.pos;
    while (oi < OTE_WP.length - 1 && Math.hypot(me.x - OTE_WP[oi][0], me.z - OTE_WP[oi][1]) < 3) oi++;
    const w = OTE_WP[oi];
    if (oi === OTE_WP.length - 1 && Math.hypot(me.x - w[0], me.z - w[1]) < 4) return { x: me.x, z: me.z };
    return { x: w[0], z: w[1] };
  };
  // 11/9 二巡：北の土塁の上（前の行き先）は土塁の内の法から登れず、本人も bot も土塁の裾で止まり、導入から先へ進めなかった。
  //   城を見る所は北西の櫓台（天守台）。西の土塁の内の坂を北へ上り、櫓台へ。行き先の印は坂の上り口・坂の上・櫓台と順に移す
  const B = (T.bankW || 8) / 2, nwX = T.x - X - B - 3, nwZ = T.z - Z;
  //   秀吉の床几を囲む内の幕の南の口を出て、幕と俵の間を西へ抜け、西の土塁の内（西の物見の所）から坂の上り口へ
  //   坂は細いので、坂の途中にも印を置き、上り口と坂の上では近くまで寄ってから次へ（指の棒の八方向でも坂から外れない）
  const WP = [[T.x - 2.5, T.z + 7, 2.5], [T.x - 11, T.z + 7, 2.5], [T.x - X + 9, T.z - 4, 4.5], [T.x - X + 2.5, T.z - 8, 2.5], [T.x - X + 2.5, T.z - 17, 2.5], [T.x - X + 2.5, nwZ + 2.9, 2.5], [nwX + 3, nwZ + 1, 4]];
  // 11/9 徳川A：坂の道筋は x を 1.5 西へ（T.x-X+4 の線は坂の中ほど（z -157）の当たりに掛かり、bot が坂の下で十五分行き来した）
  let wi = 0;
  // 着いた判定は最後の印だけ（途中の印で着いた事にしない）：最後の印の内に入ったら、本人の足もとを返して k15Go を済ませる
  const north = () => {
    const me = rt.player.u.pos;
    while (wi < WP.length - 1 && Math.hypot(me.x - WP[wi][0], me.z - WP[wi][1]) < WP[wi][2]) wi++;
    const w = WP[wi];
    if (wi === WP.length - 1 && Math.hypot(me.x - w[0], me.z - w[1]) < w[2]) return { x: me.x, z: me.z };
    return { x: w[0], z: w[1] };
  };
  // 櫓台から川の物見へも、上った坂を戻る。直線では土塁の法面を横切って止まる。
  const WEST_WP = WP.slice(2, -1).reverse();
  let westIndex = 0;
  const west = () => {
    const me = rt.player.u.pos;
    while (westIndex < WEST_WP.length - 1 &&
        Math.hypot(me.x - WEST_WP[westIndex][0], me.z - WEST_WP[westIndex][1]) < WEST_WP[westIndex][2]) westIndex++;
    const w = WEST_WP[westIndex];
    if (westIndex === WEST_WP.length - 1 && Math.hypot(me.x - w[0], me.z - w[1]) < w[2]) return { x: me.x, z: me.z };
    return { x: w[0], z: w[1] };
  };
  const stop = () => F.k15stage !== 'taiko';
  k15Go(rt, 'tk-hide', { x: T.x, z: T.z }, 7, '本陣で、秀吉の下知を聞け', '羽柴秀吉', () => {
    k15Scenes(rt, [
      [0.5, () => rt.say('羽柴秀吉', 'よう来た。あの山の上を見よ。吉川式部少輔が籠もる鳥取の城じゃ', 5)],
      [5, () => rt.say('黒田官兵衛', '城には兵と民を合わせ、四千ほどが籠もるとか', 4.5)],
      [4.5, () => rt.say('羽柴秀吉', '力攻めはせぬ。付城と柵で囲み、米の道を断つ。城は飢えで落とす', 5)],
      [5, () => rt.say('黒田官兵衛', '北西の櫓台から城の様子を見て参れ', 4)],
    ], () => k15Go(rt, 'tk-north', north, 0.01, '囲みを見回れ。北西の櫓台から城を見よ', '北西の櫓台', () => {
      // 物見に着いたら：城の煙と、城の上に立つ旗の少なさが見える
      rt.banner('久松山の城', '炊ぐ煙が細い。城の米は残り少ない');
      rt.award((t) => t.side.push('太閤ヶ平から城の様子を見た'), '太閤ヶ平から城の様子を見た');
      k15Scenes(rt, [
        [3, () => rt.say('足軽', '城の煙が、昨日より細うござる', 4)],
        // 包囲線の見回り（docs/tottori_spec_1109.md 0:00〜2:00）：使番が囲みの道を一つずつ告げる
        [4, () => rt.say('使番', '北道、異常なし', 2.5)],
        [3, () => rt.say('使番', '西の谷も封鎖。海側への道も押さえております', 3.5)],
        [4, () => rt.say('黒田官兵衛', '残る道は千代川だけ。西の土塁から川を見よ', 4)],
      ], () => k15Go(rt, 'tk-west', west, 0.01, '西の土塁から、千代川を見よ', '西の土塁', () => {
        // 物見に着いたら：川面に米舟の灯り。使番が駆け込み、下知が変わる
        rt.banner('千代川に灯り', '河口の囲みを抜けた毛利の米舟が、岸に着いた');
        sfx('horagai', 0.4);
        rt.award((t) => t.side.push('物見で米舟の灯りを見つけた'), '物見で米舟の灯りを見つけた');
        k15Scenes(rt, [
          [3, () => rt.say('黒田官兵衛', '灯りが二つ。米舟じゃ。松井殿の舟手の囲みを抜けて来たか', 4.5)],
          [4.5, () => rt.say('使番', '申し上げます！　川岸の組が、舟の番と睨み合うておりまする', 4)],
          [4, () => rt.say('羽柴秀吉', 'その組に加われ。米を一粒も城へ入れるな。舟を二艘とも焼け', 5)],
        ], () => k15Go(rt, 'tk-ote', ote, 0.01, '大手口から下り、川岸の組へ急げ', '大手口', () => {
          k15Fade(rt, () => {
            const c = F.hide.center();
            placePlayer(rt, c.x + 8, c.z + 6, -Math.PI / 2);
            k15Squad(rt, c.x + 12, c.z + 10);
            F.k15on = false; F.k15stage = 'bank'; rt.unmark('k15');
            if (back) rt.obj('main', back, 'main', true);
            F.stepT = rt.t;
          }, '千代川の岸', '夜更け。米舟の灯りが近い');
        }, { progress: '坂の途中、傷ついた兵とすれ違う' }), stop);
      }), stop);
    }), stop);
  }, { limit: 40 });
  // 大手口へ下る道でも、遠くの火と声で囲みの広さを見せる
  rt.after(1, () => { if (!stop()) rt.say('組頭', '殿の前じゃ。膝をつけよ', 3); });
}
