// 名簿の読みを使い、札を作り替える時だけ読み仮名を組む。
import { BUSHO } from './generals_data.js';

const READINGS = {
  '弥五郎': 'やごろう', '藤吉郎': 'とうきちろう',
  '氏家卜全': 'うじいえぼくぜん',
};
// 表示の名（鍵は甲冑・名簿・持ち物の表と結んだまま、画面と台詞だけ同時代の文書の名にする。11/5 三方ヶ原の時代考証）
const SHOWN = {
  '内藤昌豊': ['内藤昌秀', 'ないとうまさひで'],
  '高坂昌信': ['春日虎綱', 'かすがとらつな'],
  // 池田輝政は慶長十二年頃まで「照政」（ゲームに出るのは長久手・河田・岐阜・関ヶ原で、みなその前。11/6 河田の時代考証）
  '池田輝政': ['池田照政', 'いけだてるまさ'],
};
const SHOWN_RE = new RegExp(Object.keys(SHOWN).join('|'), 'g');
export function shownName(name) { return SHOWN[name]?.[0] || name; }
export function shownText(text) { return typeof text === 'string' && text ? text.replace(SHOWN_RE, (k) => SHOWN[k][0]) : text; }
export function personReading(name) {
  return SHOWN[name]?.[1] || READINGS[name] || BUSHO[name]?.[0] || '';
}
export function setPersonLabel(el, name) {
  if (el._personName === name) return;
  el._personName = name;
  // 名札は漢字の名だけ（読みのひらがなを上に添えない。九7・11/6 共通の係）。読みは personReading で引ける
  el.textContent = shownName(name);
}
