// ======================================================================
// 小田原征伐　「包囲の陣を回る」の段（七月の初め）　docs/toyo15_plan_1108.md の 15
// 史実：八王子城（六月二十三日）・津久井城を落とした前田利家・上杉景勝の北国勢も小田原の囲みに加わった。海には長宗我部元親・九鬼嘉隆の船。
//   かつて秀吉と戦った家康（小牧）、元親（四国）までが、今は秀吉の号令で一つの囲みを作る。
// 遊び：井伊の陣から、前田の陣・上杉の陣・浜の長宗我部の船陣を順に回り、直政の言葉を伝える。各陣で将の一言。
//   （前田・上杉の陣の場所は、遊びのため徳川の陣の北に縮めて置く。）
// 入れ方：b_t12_odawara.js の depthStart の段の並び（城が現れる段の後・七月の官兵衛の段の前）に step(H) を置く。
// ======================================================================
import { allyGroup, nm } from '../bhelp.js';
import { jinmaku, nobori, kobune, tawara, kagaribi } from '../props.js';
import { sfx } from '../audio.js';

function mark(rt, C) {
  const S = C.stops[C.i];
  rt.unmark('dp');
  if (S) { C.at = S.at; C.goal = S.at; rt.marker('dp', S.at, S.label, { h: 3 }); }
}

export function step(H) {
  return {
    kind: 'move', key: 'junkai',
    start(rt, C) {
      const F = rt.flags, W = rt.world;
      F.day = -0.5; W.setTime('day');
      rt.unmark('dp');
      C.groups = []; C.i = 0; C.t = 0;
      // 前田・上杉の陣（八王子から着いた北国勢）と、浜の長宗我部の船陣
      const camp = (P, mon, name, list, look) => {
        rt.scene.add(jinmaku(W, P.x + 6, P.z, 10, 8, 4, { mon }));
        for (const [dx, dz] of [[-4, -6], [-4, 6], [8, -8]]) rt.scene.add(nobori(W, P.x + dx, P.z + dz, mon, 6));
        const g = allyGroup(rt, { faction: 'oda', name, anchor: { ...P }, facing: -Math.PI / 2, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' }, H.dress(list, look));
        for (const u of g.units) u.invuln = true;
        return g;
      };
      C.maeda = camp(H.MAEDA_JIN, 'maeda', '前田利家の陣', [{ type: 'busho', n: 1, o: { name: '前田利家', hat: 'kabuto_m', horse: false, invuln: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10 }], { flag: 'maeda' });
      C.uesugi = camp(H.UESUGI_JIN, 'uesugi', '上杉景勝の陣', [{ type: 'busho', n: 1, o: { name: '上杉景勝', hat: 'kabuto_m', horse: false, invuln: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10 }], { flag: 'uesugi' });
      // 韮山城を開いた北条氏規（氏政の弟）は徳川の陣に身を寄せ、小田原の兄たちに開城を説いた
      C.ujinori = allyGroup(rt, { faction: 'oda', name: '北条氏規の供', anchor: { ...H.UJINORI }, facing: Math.atan2(H.CASTLE.x - H.UJINORI.x, H.CASTLE.z - H.UJINORI.z), width: 3, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
        H.dress([{ type: 'busho', n: 1, o: { name: '北条氏規', hat: 'kabuto_m', horse: false, invuln: true, flag: null } }, { type: 'samurai', n: 2, o: { flag: null } }], H.HOJO));
      for (const u of C.ujinori.units) u.invuln = true;
      C.chosokabe = camp(H.BEACH, 'chosokabe', '長宗我部元親の船陣', [{ type: 'busho', n: 1, o: { name: '長宗我部元親', hat: 'kabuto_m', horse: false, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 }], { flag: 'chosokabe' });
      for (const [x, z, r] of [[H.BEACH.x + 4, H.BEACH.z + 14, 0.6], [H.BEACH.x - 10, H.BEACH.z + 18, 0.3], [H.BEACH.x + 16, H.BEACH.z + 10, 0.8]]) {
        const b = kobune(x, Math.max(-1.2, W.heightAt(x, z)) + 0.3, z, r, 9); if (b) rt.scene.add(b);
      }
      C.stops = [
        { at: H.MAEDA_JIN, label: '前田の陣', lines: [['前田利家', '八王子は一日で落とした。……城の中には、女や子が多かった'], ['前田利家', '早う開けば、もう誰も死なずに済むものを'], ['前田利家', '殿下とは若い頃から共に信長公に仕えた。……遠くまで来たものよ']] },
        { at: H.UJINORI, label: '北条氏規', lines: [['北条氏規', '韮山は開いた。……今は徳川殿の陣に身を寄せておる'], ['北条氏規', '城の兄者たちへ、開けよと文を書いた。これ以上、北条の者を死なせとうない'], [nm(rt), '北条の一門の方が、城を開けと……']] },
        { at: H.UESUGI_JIN, label: '上杉の陣', lines: [['上杉景勝', '越後から関東まで来たのは、謙信公以来よ'], ['直江兼続', '先代の謙信公は小田原を囲んで落とせなんだ。今度は囲むだけで落ちましょう'], ['上杉景勝', '今は殿下の一手じゃ。……世は変わった']] },
        { at: H.BEACH, label: '浜の船陣', lines: [['長宗我部元親', '四国で殿下と戦うた者が、今は殿下の船で城の海を塞いでおる'], ['九鬼の船頭', '沖は九鬼殿・脇坂殿の船で埋まっておる。北条は海へも出られぬ'], [nm(rt), '殿下はもう一つの軍ではない。日本中を連れてきておる']] },
      ];
      // 11/10 指示書（docs/odawara_spec_1109.md 7:00〜9:30）：馬で包囲の陣を巡る。道の左右に、今まで会った大名の旗が延々と並ぶ。
      //   包囲なのに華やか：兵糧の俵・篝火。旗は家ごとに替えて（字は出さない）
      const FL = ['tokugawa', 'maeda', 'uesugi', 'ukita', 'kobayakawa', 'hachisuka', 'asano', 'kuroda', 'ishida', 'otani', 'hori', 'kuki', 'chosokabe', 'nobukatsu'];
      let k = 0;
      for (let z = -64; z > -168; z -= 7) {
        for (const x of [135, 147.5]) { rt.scene.add(nobori(W, x, z, FL[k % FL.length], 6.5)); k++; }
      }
      for (const [x, z] of [[174, -70], [177, -128], [133, -112], [134, -140]]) {
        for (const [dx, dz] of [[2, 3], [3, -2], [-2, 4]]) rt.scene.add(tawara(W, x + dx, z + dz, 0.4, 4));
        rt.scene.add(kagaribi(W, x + 4, z));
      }
      // 組頭より上は自分の馬で回る（関所5）
      if (rt.player.canRide && !rt.player.mounted) { try { rt.player.toggleMount(); } catch (e) { /* 馬が無い時は歩く */ } }
      // 七月も現在地から歩いて陣を訪ねる。前の段は山王川の岸で達成するので、井伊の陣へ移し直さない。
      rt.banner('包囲の陣', '日本中の大名が、ひとつの城を囲む');
      rt.obj('dp', '包囲の前田の陣・北条氏規・上杉の陣・浜の船陣を順に訪ね、直政の言葉を伝える', 'main');
      rt.say('井伊直政', `${nm(rt)}殿、着いたばかりの北国勢と、浜の船陣を回って参れ。囲みを緩めるな、と伝えよ`, 4.4);
      // 遅れて新しい旗がまた豊臣側へ（伊達の参陣。戦にせず、知らせと一言で）
      rt.after(5, () => rt.say('使番', '奥州の伊達政宗殿、遅れて参陣！　殿下にお目通りを願い出ておる', 3.6));
      rt.after(9, () => rt.say(nm(rt), '……まだ増えるのか', 2.4));
      mark(rt, C);
    },
    tick(rt, C, m, ctx, el) {
      const P = rt.player.u.pos, S = C.stops[C.i];
      rt.objProgress('dp', `伝え終えた先 ${C.i}／${C.stops.length}か所`);
      if (!S) return el - C.t > 6;
      // 各陣へ着いて将の言葉を聞いてから次へ進む。
      const near = Math.hypot(P.x - S.at.x, P.z - S.at.z) < 10;
      if (!C.talk && near) {
        C.talk = true; C.tt = el;
        sfx('obj', 0.6);
        S.lines.forEach(([who, text], k) => rt.after(k * 4.2, () => rt.say(who, text, 4)));
      }
      if (C.talk && near && el - C.tt > S.lines.length * 4.2 + 1) { C.talk = false; C.i++; C.t = el; mark(rt, C); }
      return false;
    },
    end(rt) {
      rt.unmark('dp');
      rt.objDone('dp');
    },
  };
}
