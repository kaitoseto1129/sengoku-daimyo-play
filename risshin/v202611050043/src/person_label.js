// 名簿の読みを使い、札を作り替える時だけ読み仮名を組む。
import { BUSHO } from './generals_data.js';

const READINGS = {
  '弥五郎': 'やごろう', '藤吉郎': 'とうきちろう',
  '氏家卜全': 'うじいえぼくぜん',
};
export function personReading(name) {
  return READINGS[name] || BUSHO[name]?.[0] || '';
}
export function setPersonLabel(el, name) {
  if (el._personName === name) return;
  el._personName = name;
  const reading = personReading(name);
  el.textContent = '';
  if (!reading) { el.textContent = name; return; }
  const ruby = document.createElement('ruby'), rt = document.createElement('rt');
  ruby.textContent = name; rt.textContent = reading;
  rt.style.cssText = 'font-size:12px;line-height:1.2;letter-spacing:0;font-weight:700;color:#fff3df';
  ruby.appendChild(rt); el.appendChild(ruby);
}
