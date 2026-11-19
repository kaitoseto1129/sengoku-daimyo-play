// ======================================================================
// 八王子城の戦い　「急な山道」の段（6〜9分）　docs/toyo15_plan_1108.md の 14
// 史実：御主殿を取った寄せ手は、尾根の曲輪（金子丸・高丸・小宮曲輪）へ急な山道を登った。道は狭く、上の曲輪から弓・鉄砲・石が降った。
// 遊び：御主殿の裏から金子丸の下まで、尾根の細い坂を登る。坂の途中に北条の槍が踏み止まり、上の段から矢（石は金子丸の段から）。
//   竹束の陰で息を整え、坂の伏兵を討って金子丸の下に着くと、次の段（金子丸）へ。
// 入れ方：b_t11_hachioji.js の depthStart の段の並び（御主殿の後）に step(H) を置く。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { addTaba } from '../taketaba.js';
import { retreat, live } from './retreat.js';

export function step(H) {
  return {
    kind: 'fight', max: 160, key: 'sakamichi',
    start(rt, C, m, ctx) {
      C.at = H.SLOPE_MID; C.goal = H.SLOPE_MID; C.groups = [];
      rt.banner('尾根の山道', '上の曲輪から矢が降る');
      rt.obj('dp', '御主殿の裏の急な坂を、金子丸の下まで登る', 'main');
      // 11/19 クラウド29（中学生 bot 464秒：この段は戦の def.dpNoMark で組の赤い印も出ず、行き先の印が一つも無いまま三十秒迷った）：
      //   段の行き先（坂の半ば→坂の上）にピンを一本立てる。段の終わりで外す
      rt.marker('dp', () => C.at, () => (C.at === H.SLOPE_TOP ? '金子丸の下' : '尾根の坂'), { h: 3 });
      // 坂の途中の踊り場に竹束（寄せ手が担いで上げた物）
      for (const [x, z] of [[68, -13], [73, -15], [69, -27], [75, -28]]) addTaba(rt, x, z, 0, { fixed: true, rot: Math.PI });
      // 坂に踏み止まる北条の槍と、上の段の弓
      C.spear = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '坂の槍', anchor: { ...H.SLOPE_MID }, facing: 0, width: 6, formation: 'yari', aggro: 10, morale: 92, noRout: true, order: 'hold', seekRange: 12 },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], H.HOJO));
      C.spear.dmgMult = 0.42;
      // 11/19 06時 クラウド持ち主（⑥写真 260秒：段の初めに本人の前の斜面に敵が見えず、槍も弓も尾根の向こう）：
      //   坂の槍のうち足軽四人を、御主殿の裏から見える下の踊り場（竹束の手前）へ出す。兵の数は前と同じ十一
      C.front = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '坂の先の槍', anchor: { x: 63, z: -15 }, facing: 0, width: 4, formation: 'yari', aggro: 12, morale: 90, noRout: true, order: 'hold', seekRange: 14 },
        H.dress([{ type: 'ashigaru', n: 4 }], H.HOJO));
      C.front.dmgMult = 0.42;
      // 金子丸の段を待たず、出た時から曲輪の内に留める。坂へ追い下りて射座を空けない。
      // 木戸の二歩内では九人の射手が入口を埋める。射座は曲輪の奥に置く。
      C.bow = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '上の段の弓', anchor: { x: H.SLOPE_TOP.x, z: H.SLOPE_TOP.z - 8 }, facing: 0, width: 5, aggro: 34, morale: 90, noRout: true, order: 'hold',
        stay: true, noAI: true, t11Kuruwa: H.KANEKO_GUARD },
        H.dress([{ type: 'bow', n: 4 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 3 }], H.HOJO));
      C.bow.dmgMult = 0.3;
      // 金子丸へ退いた射手も、曲輪が落ちた時に守りと一緒に崩す。
      rt.flags.slopeBow = C.bow;
      C.groups.push(C.spear, C.front, C.bow);
      C.n0 = C.spear.units.length + C.front.units.length;
      ctx.friends(rt).forEach((g, k) => H.marchTo(rt, g, { x: H.SLOPE_MID.x, z: H.SLOPE_MID.z + 10 }, k));
      rt.say('前田の侍', '坂が細い！　二人並べぬ。竹束の陰を伝って登れ', 3.4);
      rt.after(6, () => rt.say(nm(rt), '上の段から矢が降ってくる……', 2.6));
      C.t2 = 0;
    },
    tick(rt, C, m, ctx, el) {
      const P = rt.player.u.pos;
      if (Math.hypot(P.x - H.SLOPE_MID.x, P.z - H.SLOPE_MID.z) < 14) C.entered = true;
      // 坂の半ばで、上の段から新手が駆け下りる（一度だけ）
      if (!C.down && (live(C.spear) + live(C.front) <= C.n0 * 0.5 || el > 25)) {   // 11/18 クラウド持ち主：一戦を4〜7分に（坂の段が act bot で106秒）。新手を五十五→三十五→二十五秒で（行き先を坂の上へ移すのも九十→七十秒）
        C.down = el;
        C.spear2 = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '駆け下りる新手', anchor: { ...H.SLOPE_TOP }, facing: 0, width: 4, formation: 'yari', aggro: 12, morale: 95, noRout: true, order: 'attack', seekRange: 20 },
          H.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], H.HOJO));
        C.spear2.dmgMult = 0.42;
        C.groups.push(C.spear2);
        rt.army.play('eshout', H.SLOPE_TOP, 1.3);
        rt.say('前田の侍', '上から駆け下りて来るぞ！　踏ん張れ、押し返せ！', 3);
        rt.after(5, () => rt.say('使番', '搦手、上杉勢が水の手の曲輪を破ったと！', 3.2));
      }
      // 11/18 クラウド持ち主（act bot：坂の段百秒で本人の討ち取り0＝味方の背の後ろを登るだけ）：駆け下りる新手は本人を目がけて来る。命が四割を切れば外す
      const S2 = C.spear2, PU = rt.player.u;
      if (S2 && S2.count) {
        const want = !C.withdrawn && !S2.routed && PU?.alive && PU.hp >= PU.maxHp * 0.4 && Math.hypot(P.x - H.SLOPE_MID.x, P.z - H.SLOPE_MID.z) < 40;
        if (want && S2.focus !== PU) S2.focus = PU;
        else if (!want && S2.focus === PU) { S2.focus = null; for (const u of S2.units) if (u.target === PU) { u.target = null; u.aiT = 0; } }
      }
      rt.objProgress('dp', '');
      const left = live(C.spear) + live(C.front) + live(C.spear2);
      // 坂の槍と駆け下りた新手を崩し、金子丸の下まで登ると次の段へ（上の段の弓は金子丸の段で一緒に落ちる）
      const top = Math.hypot(P.x - H.SLOPE_TOP.x, P.z - H.SLOPE_TOP.z) < 12;
      // 二巡 11/9：坂の槍がほぼ崩れたら、行き先を坂の上（金子丸の下）へ移す（行き先が坂の半ばのままで、上へ登らずに止まった）
      if (C.down && (left <= 4 || el > 70) && C.at !== H.SLOPE_TOP) {
        C.at = H.SLOPE_TOP; C.goal = H.SLOPE_TOP;
        // 本人の印だけを動かすと、味方は坂の十歩手前に残る。旗と列も坂の上へ送る。
        ctx.friends(rt).forEach((g, k) => H.marchTo(rt, g, H.SLOPE_TOP, k));
      }
      // 二巡 11/9：坂の脇の崖へ逃げた数人を討てず、十五分止まった。長引けば残りが少なくなった所で進む（味方が残りを払う）
      const total = C.n0 + (C.spear2?.units.length || 0);
      // 半ばを崩した攻防、または坂で二分戦っても動けない時は守備を退かせる（11/18 クラウド持ち主：駆け下りる新手と五十秒打ち合って進めない回があった）。
      if (!C.withdrawn && C.entered && C.down && (el > 95 || (el >= 60 && left <= total * 0.6))) {   // 11/18 19時 クラウド持ち主：act bot 550秒の回で坂の段が百十秒の打ち切り（討12）。退く下知を百二十→九十五秒・半ば→六割
        C.withdrawn = true;
        // 坂の主力を崩したら残兵を退かせ、本人が上り切る道を空ける。
        // 離れた場所で待つだけでは坂の突破にしない。
        for (const g of [C.spear, C.front, C.spear2]) retreat(g);
      }
      // 退く下知が出た組は、その直前に数えた残兵数では待たない。
      // 11/18 18時 クラウド持ち主：act bot 6回のうち2回 坂の段が98〜108秒。守りが退いた後は、七十五秒を過ぎ坂の上の二十四m 内なら次へ
      // 11/18 16時 クラウド持ち主：act bot で坂の段が百十八秒・討0（坂の上の十二m へ着けず待ち続けた）。百十秒を過ぎれば上に着かなくても金子丸の段へ
      return !!C.down && ((top && (C.withdrawn || left <= 2 || (el > 70 && left <= 5) || (el > 140 && left <= total * 0.4) || el > 200)) || el > 100 || (el > 75 && C.withdrawn && Math.hypot(P.x - H.SLOPE_TOP.x, P.z - H.SLOPE_TOP.z) < 24));
    },
    end(rt, C) {
      for (const g of [C.spear, C.front, C.spear2]) retreat(g);
      // 上の段の弓は金子丸の守りへ退く
      if (C.bow) {
        C.bow.order = 'path'; C.bow.path = [[H.SLOPE_TOP.x, H.SLOPE_TOP.z - 10]]; C.bow.pathIdx = 0;
        // 到着して hold に戻した時も、古い木戸際の持ち場へ引き返させない。
        C.bow.onArrive = (g) => { g.order = 'hold'; g.path = null; g.anchor = { x: H.SLOPE_TOP.x, z: H.SLOPE_TOP.z - 10 }; };
      }
      rt.unmark('dp');
      rt.objDone('dp');
      rt.award((t) => t.side.push('尾根の急な坂を登り切った'), '尾根の坂を登り切った');
    },
  };
}
