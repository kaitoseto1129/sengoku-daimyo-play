// ======================================================================
// 八王子城の戦い　始めの段「山麓」（0〜3分）　docs/toyo15_plan_1108.md の 14
// 史実：六月二十三日の丑の刻、前田利家・利長の勢は濃い霧の中を城山川の谷から大手へ、上杉景勝の勢（藤田信吉）は北の搦手へ回った。
//   城主の北条氏照は小田原に籠もり、城には城代の横地監物ら家臣と、領内から集めた女や子が残っていた。
//   同じ頃、忍城は石田三成の水攻めの最中、韮山城はなお抵抗し、小田原は秀吉の大軍に囲まれていた。
// 遊び：霧の谷を前田勢の列と進む。谷の脇の杉の中から北条の物見の伏兵が斬り掛かる。搦手の方から上杉勢の鬨の声。
//   使番が別の戦場の様子を伝え、山下曲輪の木戸の前に着くと次の段（山下曲輪）へ。
// 入れ方：b_t11_hachioji.js の depthStart の段の並びの頭に step(H) を置く（b_depth.js の段の形：start・tick・end）。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';
import { retreat, live } from './retreat.js';

export function step(H) {
  return {
    kind: 'fight', max: 170, key: 'sanroku',
    start(rt, C, m, ctx) {
      const F = rt.flags;
      C.at = H.GATE_FRONT; C.goal = H.GATE_FRONT; C.groups = [];
      rt.banner('城山川の谷', '霧の中を、大手の木戸へ');
      rt.obj('dp', '霧の谷を進み、山下曲輪の木戸の前へ', 'main');
      // 前田の組は谷の道を列で進む（主人公の前後）
      ctx.friends(rt).forEach((g, k) => H.marchTo(rt, g, { x: H.GATE_FRONT.x + 10, z: H.GATE_FRONT.z }, k));
      // 霧の夜討ち：城方に寄せ口を知らせる篝火は焚かない。
      C.say = 0;
      F.sanroku = C;
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, P = rt.player.u.pos;
      // 台詞と知らせ：搦手の上杉の鬨・別の戦場（同じ朝、関東のあちこちで何万もの兵が戦っている）
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(4, () => rt.say('前田の侍', '前の兵の背も見えぬ。旗を見失うな、声を掛け合え', 3.4));
      line(14, () => { rt.army.play('toki', H.KARAMETE, 1.6); rt.say(nm(rt), '北の山の陰から鬨の声……', 2.8); });
      line(18, () => rt.say('前田利長', '上杉殿じゃ。搦手の水の手へ回られた。大手と搦手、二つの口から同時に攻める', 3.8));
      // 伏兵：谷の北の杉の中から、北条の物見が斬り掛かる
      if (!C.ambush && el > 26) {
        C.ambush = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '谷の伏兵', anchor: { x: H.AMBUSH.x, z: H.AMBUSH.z }, facing: Math.PI, width: 5, aggro: 14, morale: 90, noRout: true, order: 'attack', seekRange: 30 },
          H.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], H.HOJO));
        C.ambush.dmgMult = 0.4;
        C.groups.push(C.ambush);
        C.n0 = C.ambush.units.length;
        rt.army.play('eshout', H.AMBUSH, 1.4);
        sfx('gun', 0.8);
        rt.say('前田の侍', '杉の中から伏兵じゃ！　列を切らすな、迎え撃て！', 3.2);
      }
      if (C.ambush && !C.ambushDone && (live(C.ambush) <= 2 || el - 26 > 75)) {
        C.ambushDone = el;
        retreat(C.ambush);
        rt.say('前田の侍', '伏兵が霧の中へ退いた！　木戸はこの先じゃ', 3);
        rt.after(3.6, () => rt.say('使番', '小田原より！　忍城は石田殿が水攻めの最中、韮山はなお抵抗。小田原は殿下の大軍が囲んでおる', 4));
        rt.after(8.2, () => rt.say('前田利家', 'この城が落ちれば、小田原に籠もる者の心が折れる。今日のうちに落とせ', 3.8));
        rt.after(12.4, () => rt.say('前田の侍', '先手の大道寺勢が木戸へ寄せたぞ！　上から石が落ちてくる', 3.4));
      }
      if (C.ambushDone) {
        rt.objProgress('dp', '');
        // 本人が木戸の前へ着いてから進む。待った時間だけでは到着扱いにしない。
        if (Math.hypot(P.x - H.GATE_FRONT.x, P.z - H.GATE_FRONT.z) < 12 && el - C.ambushDone > 14) return true;
      } else if (C.ambush) rt.objProgress('dp', '');
      return false;
    },
    end(rt, C) {
      // 目の前の生き残りを消さず、城の方へ敗走させる。
      if (C.ambush) {
        retreat(C.ambush);
      }
      rt.objDone('dp');
    },
  };
}
