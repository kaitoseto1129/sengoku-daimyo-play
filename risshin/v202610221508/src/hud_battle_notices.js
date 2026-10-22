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
    document.head.appendChild(style);
  }
  // 長い台詞を高さだけで消さない。収まらない時は欄全体を送って読む。
  fitMessage() {}
  sync() {
    super.sync();
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
