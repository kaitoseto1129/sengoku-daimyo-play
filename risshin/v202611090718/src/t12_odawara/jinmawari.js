// ======================================================================
// 小田原征伐　始めの段「小田原の陣」（0〜3分）　docs/toyo15_plan_1108.md の 15
// 史実：天正十八年四月から、秀吉はおよそ二十一万で小田原城の総構えを囲んだ。東の酒匂川の側は徳川家康の勢、海には長宗我部・九鬼らの船。
//   秀吉は「城は攻めるな、囲みを保て」と、力攻めをせずに城の心を折る策を取った。
// 遊び：六月の初めの昼。井伊の陣から家康の本陣まで、徳川勢の陣の間を歩いて下知を受けに行く。陣の厚み・海の船・遠くの総構えを見せる。
//   本陣に着くと家康の言葉と、殿下の下知（城は攻めるな）。次の段（北条の打って出）へ。
// 入れ方：b_t12_odawara.js の depthStart の段の並びの頭に step(H) を置く（b_depth.js の段の形）。
// ======================================================================
import { nm } from '../bhelp.js';
import { sfx } from '../audio.js';

export function step(H) {
  return {
    kind: 'move', key: 'jinmawari',
    start(rt, C, m, ctx) {
      const F = rt.flags;
      F.day = -1;
      C.at = H.IE_FRONT; C.goal = H.IE_FRONT; C.groups = [];
      rt.banner('小田原の陣', '二十万の軍勢が、城を囲む');
      rt.obj('dp', '井伊の陣から、家康の本陣へ下知を受けに行く', 'main');
      // 先に川の岸の見張りの土手（総構えが一望できる）、それから家康の本陣へ
      C.at = H.LOOKOUT; C.goal = H.LOOKOUT;
      rt.marker('dp', H.LOOKOUT, '見張りの土手', { h: 3 });
      // 本陣へ歩いて近づく場所には板の軍勢を置かず、既存の旗本・陣幕・幟で厚みを見せる。
      C.say = 0;
      // 陣の組は陣に留まる（昼の囲みの最中。篠曲輪の守りへ勝手に寄せない）
      for (const g of ctx.friends(rt)) { g.ai = false; g.order = 'hold'; g.aggro = 4; g.seekRange = 6; g.onArrive = null; }
    },
    tick(rt, C, m, ctx, el) {
      const P = rt.player.u.pos, me = nm(rt);
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(2, () => rt.say('使番', `${me}殿、家康殿の本陣へ参られよ。道すがら、見張りの土手から城を見ておけ`, 3.8));
      // 見張りの土手：総構えの土塁と、その奥の城を一望する
      if (!C.looked && (Math.hypot(P.x - H.LOOKOUT.x, P.z - H.LOOKOUT.z) < 8)) {
        C.looked = el;
        rt.say(me, '町ごと、堀と土塁で囲んである……あれが総構えか', 3.4);
        rt.after(3.8, () => rt.say('井伊の侍', '総構えは二里余り。城の周りは、東は徳川、北は羽柴秀次殿と蒲生殿、西の早川口は宇喜多殿じゃ', 4.4));
        rt.after(8.6, () => rt.say('井伊の侍', '海には長宗我部と九鬼の船。……二十万が、この一つの城を囲んでおる', 4));
        rt.after(13, () => rt.say(me, '十年前は織田家の一手だった殿下が、日本中の大名を動かしておる', 3.6));
        rt.after(16, () => { C.at = H.IE_WAY; C.goal = H.IE_FRONT; rt.unmark('dp'); rt.marker('dp', H.IE_FRONT, '家康の本陣', { h: 3 }); });
      }
      // 康頼の陣の陣幕を回り込んでから本陣の前へ（bot が陣幕に突っかからない）
      if (C.looked && el - C.looked > 16 && C.at === H.IE_WAY && Math.hypot(P.x - H.IE_WAY.x, P.z - H.IE_WAY.z) < 8) C.at = H.IE_FRONT;
      if (!C.arrived && C.looked && el - C.looked > 16 && Math.hypot(P.x - H.IE_FRONT.x, P.z - H.IE_FRONT.z) < 14) {
        C.arrived = el;
        rt.unmark('dp');
        sfx('taiko', 0.5);
        rt.say('徳川家康', 'よう来た。殿下は石垣山の向こうの早雲寺におられる。下知は一つじゃ', 3.8);
        rt.after(4.2, () => rt.say('徳川家康', '城は攻めるな。囲みを保て。城の者が自ら折れるまで待つ', 3.8));
        rt.after(8.4, () => rt.say('使番', '関東の北条の城は、一つずつ落ちております。山中は半日、鉢形・八王子へも勢が向かいました', 4.2));
        rt.after(12.8, () => rt.say('徳川家康', '……六年前は、わしも殿下と小牧で睨み合うた。それが今は、この囲みの一手よ', 4));
      }
      // 下知は本陣へ着いて聞き終えるまで済ませない。
      if (C.arrived) return el - C.arrived > 17.5;
      return false;
    },
    end(rt) {
      rt.unmark('dp');
      rt.objDone('dp');
    },
  };
}
