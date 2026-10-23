import { BattleNotices } from "./hud_notices.js";
import { noticeStyle1, noticeStyle2 } from "./hud_notice_style_1.js";
import { noticeStyle3, noticeStyle4, noticeStyle5 } from "./hud_notice_style_2.js";
import { noticeStyle6, noticeStyle7, noticeStyle8, noticeStyle9, noticeStyle10, noticeStyle11, noticeStyle12, noticeStyle13 } from "./hud_notice_style_3.js";
import { noticeStyle14, noticeStyle15, noticeStyle16, noticeStyle17, noticeStyle18, noticeStyle19, noticeStyle20, noticeStyle21, noticeStyle22, noticeStyle23, noticeStyle24 } from "./hud_notice_style_4.js";
import { $, WARNING_FAMILY, BARK_FAMILY } from "./hud_common.js";

export class HudNotices extends BattleNotices {
  constructor(hud) {
    super(hud);
    this.textSeen = new Map();
    this.warningSeen = new Map();
    // 任務と警告は文の高さで縦に並べる。携帯でも札の間を八つ分空ける。
    const style = document.createElement('style');
    style.textContent = noticeStyle1;
    style.textContent += noticeStyle2;
    style.textContent += noticeStyle3 + noticeStyle4;
    // 任務札は本文の幅で止める。種別や補足が本文を一文字幅へ押す二列組みを共通で解く。
    // 開いた一覧・選択中の札は従来のまま、普段の下知だけを薄い帯にする。
    style.textContent += noticeStyle5;
    style.textContent += noticeStyle6;
    style.textContent += noticeStyle7;
    style.textContent += noticeStyle8;
    style.textContent += noticeStyle9;
    // 有岡は場所を十二秒守る任務。操作の助言だけで下知と期限を隠さない。
    style.textContent += noticeStyle10;
    style.textContent += noticeStyle11;
    style.textContent += noticeStyle12;
    style.textContent += noticeStyle13;
    style.textContent += noticeStyle14;
    style.textContent += noticeStyle15;
    style.textContent += noticeStyle16;
    style.textContent += noticeStyle17;
    style.textContent += noticeStyle18;
    style.textContent += noticeStyle19;
    style.textContent += noticeStyle20;
    // 無傷の命は小さな透かし札へ。傷の警告と操作釦は既存の大きさで残す。
    style.textContent += noticeStyle21;
    style.textContent += noticeStyle22;
    style.textContent += noticeStyle23;
    style.textContent += noticeStyle24;
    // 同じ下知と操作文は一度だけ読み、押せる操作がある方を残す。
    style.textContent += `
html body #hud #battle-notices:not(.choosing) #objectives.duplicate-action:not(.expand) #obj-list {
 display:none !important;
}
html:root body #hud #battle-notices #objectives#objectives:not(.expand) li.cur .obj-now {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important; line-height:1.35 !important;
}
/* 長押しも任務の中で押す。移動先・命と合わせて三枚以内に保つ。 */
html:root body #hud.wait-guard-active #battle-notices:not(.choosing) {
 top:calc(8px + env(safe-area-inset-top,0px)) !important;
 left:auto !important; right:calc(8px + env(safe-area-inset-right,0px)) !important;
 width:min(280px,32vw) !important; max-height:calc(100% / 3) !important;
}

html:root body #hud.wait-guard-active #battle-notices #objectives#objectives.integrated-guard:not(.notice-muted) {
 display:block !important;
}
html:root body #hud #battle-notices #objectives#objectives.integrated-guard:not(.expand) > :is(.battle-action,.victory-condition) {
 display:none !important;
}
html:root body #hud #battle-notices #objectives#objectives.integrated-guard:not(.expand) #obj-list {
 display:block !important; min-height:44px !important; padding:0 !important; margin:0 0 8px !important;
}
html:root body #hud #battle-notices #objectives#objectives.integrated-guard:not(.expand) #obj-list :is(li:not(.cur),small,.obj-full,.tag,.opb) {
 display:none !important;
}
html:root body #hud #battle-notices #objectives#objectives #wait-guard#wait-guard:not([hidden]) {
 position:relative !important; inset:auto !important; transform:none !important;
 display:flex !important; align-items:center; justify-content:center; box-sizing:border-box;
 width:100% !important; max-width:none !important; min-width:44px !important;
 min-height:44px !important; height:auto !important; margin:0 !important; padding:8px !important;
 touch-action:none; pointer-events:auto;
}
html:root body #hud #battle-notices #objectives#objectives #wait-guard#wait-guard :is(svg,small,.guard-meter) {
 display:none !important;
}
html:root body #hud #battle-notices #objectives#objectives #wait-guard#wait-guard span {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.3 !important;
 margin:0 !important; white-space:normal !important;
}
html:root body #hud #battle-notices #objectives#objectives .destination-distance:not([hidden]) {
 display:block !important; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.4; color:#fff3ba; margin-top:4px;
}
`;
    // 戦中は右上のミッション一行だけ。武将の名と残り人数は残す。
    style.textContent += `
html:root body #hud.mission-only :is(#objectives,#boss,#target,#tutorial,#bark,#subtitle,#skiphint,#h-bottom,#wait-guard,.battle-action,.victory-condition,.destination-distance) {
 display:none !important;
}
html:root body #hud.mission-only #h-prog > :not(.pg-st) { display:none !important; }
html:root body #hud.mission-only #h-prog .pg-st span {
 display:block !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
`;
    document.head.appendChild(style);
  }
  // 長い台詞を高さだけで消さない。収まらない時は欄全体を送って読む。
  fitMessage() {}
  sync() {
    super.sync();
    const order = $('objectives');
    const action = order.querySelector('.battle-action:not([hidden])');
    const task = order.querySelector('li.cur .obj-now');
    order.classList.toggle('duplicate-action', !!action && !!task &&
      action.textContent.replace(/\s+/g, '') === task.textContent.replace(/\s+/g, ''));
    // 枠の外にある相手の字列も知らせの数に含める。任務の裏へは出さない。
    $('target').classList.toggle('notice-muted', this.sources[1].selected || this.picks.length >= this.limit);
    this.root.classList.toggle('danger-notice', this.picks.some((item) => item.kind === 'warn'));
  }
  reset() { this.textSeen.clear(); this.warningSeen.clear(); super.reset(); }
  repeatOk(text, remember = false) {
    const key = this.key(text);
    // 共通の短い記録は三十秒で片付くため、二分の記録は出し口で保つ。
    if (this.clock - (this.textSeen.get(key) ?? -Infinity) < 120) return false;
    const family = WARNING_FAMILY.find(([re]) => re.test(text)) || BARK_FAMILY.find(([re]) => re.test(text));
    if (family && this.clock - (this.warningSeen.get(family[1]) ?? -Infinity) < 15) return false;
    if (!remember) return super.repeatOk(text);
    // 表示時の記録は、共通欄の別の判定で抜けないよう先に残す。
    // 待ち列の判定では記録せず、期限を過ぎた物だけ片付ける。
    for (const [text, time] of this.textSeen) if (this.clock - time >= 120) this.textSeen.delete(text);
    this.textSeen.set(key, this.clock);
    if (family) this.warningSeen.set(family[1], this.clock);
    super.repeatOk(text, true);
    return true;
  }
}
