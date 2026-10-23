// 画面の大きさ（innerWidth・innerHeight）の写し。コマの初め（main.js の輪）と大きさが変わった時だけ読む。
//   札を書き換えた後に innerWidth を読むと、その場で配置をやり直して重いコマになる（携帯で目立つ）。毎コマの計算はこちらを使う
export const VIEW = { w: window.innerWidth, h: window.innerHeight };
export function viewSync() { VIEW.w = window.innerWidth; VIEW.h = window.innerHeight; }
addEventListener('resize', viewSync);
