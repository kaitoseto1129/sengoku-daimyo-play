// ======================================================================
// 小田原征伐　「北条が揺れる」の段（12:00〜13:30）　docs/odawara_spec_1109.md
// 史実：城の中では籠城を続ける・打って出る・和を結ぶで評定が割れた（後に「小田原評定」と言われる）。支城は落ち、援けは来ない。
//   氏規（韮山を開き家康と旧知）や官兵衛・滝川雄利らの説きで、氏直は和睦（降る）を考え始める。
// 遊び：主人公はその場にいない。画面を暗くして城の中の評定の声だけを聞かせる（短い敵方の場面）。漫画のように誇張しない。
//   北条は弱いのでなく、選ぶ道が無くなったと伝える。済むと七月の初め（官兵衛の段）へ。
// 入れ方：b_t12_odawara.js の段の並び（城が現れる段の後・七月の官兵衛の段の前）に step(H) を置く。
// ======================================================================
import { sfx } from '../audio.js';

export function step() {
  return {
    kind: 'rest', key: 'hyojo', max: 30,
    start(rt, C) {
      C.groups = []; C.goal = null; C.at = { x: rt.player.u.pos.x, z: rt.player.u.pos.z }; C.say = 0;
      rt.unmark('dp');
      // 城の中：暗い幕（灯の色の縁）。字は出さず、声だけ
      const wrap = C.wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;transition:opacity 1.2s;background:radial-gradient(ellipse at 50% 60%, rgba(70,44,18,0.55) 0%, rgba(12,9,6,0.93) 62%)';
      document.body.appendChild(wrap);
      requestAnimationFrame(() => { wrap.style.opacity = '1'; });
      sfx('taiko', 0.3);
      rt.banner('小田原城の中', '評定');
    },
    tick(rt, C, m, ctx, el) {
      const line = (t, who, text, d = 3.6) => { if (el >= t && C.say < t) { C.say = t; rt.say(who, text, d); } };
      line(1.5, '北条氏照', '兵はまだ五万。総構えは一度も破られておらぬ。打って出るべし', 3.8);
      line(5.6, '北条氏政', '謙信も信玄も、この城は落とせなんだ。籠もれば、いずれ上方の兵は退く', 3.8);
      // 六月十六日に内通が露見した憲秀は、城が現れた後の評定では発言させない。
      line(9.8, '北条の重臣', '……支城は皆、落ちました。援けは、どこからも来ませぬ', 3.6);
      line(13.8, '北条氏規', '殿下は徳川殿も伊達も、海も味方にした。外は全部、敵でござる', 3.8);
      line(18, '北条氏直', '戦えぬのではない。……戦うて守れる者が、もう無いのだ', 3.8);
      line(22.2, '北条氏直', '城の者と領民を守る道を探る。黒田殿の話を聞こう', 3.6);
      if (C.say >= 22.2 && !C.dn) { C.dn = true; rt.flags.keisen = Math.max(0, (rt.flags.keisen ?? 100) - 20); }
      return el > 26.5;
    },
    end(rt, C) {
      const w = C.wrap; if (!w) return;
      w.style.opacity = '0';
      rt.after(1.3, () => w.remove(), true);
    },
  };
}
