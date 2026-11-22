// 交換所の品の絵（K600 51〜53・93・iMac 11/21）。何が手に入るかを字でなく絵で見せる。
//   口：画面に <canvas data-goods-art="<KOUKAN.goods の id>"> を置き、fillGoodsArt(root) を呼ぶ。
//   k600-ensyutsu が本物の絵（甲冑の 3D の写し・旗の写真）に替える時は、この関数の中身だけを替える（画面と表は触らない）。
//   描き方はキャンバスの線と面だけ（外の画像を読まない）。色は cosmetics.js の見た目の品と同じ。
import { KOUKAN } from './busho_bank.js';

const COL = {
  hata_shu: ['#b8342a', '#e8c77a'], hata_shiro: ['#efe9dc', '#3a2a18'],
  ashige: ['#9a9a96', '#d8d6d0'], aoge: ['#191614', '#4a4038'],
  mika: ['#e0bc5a'], tentsuki: ['#e0bc5a'], nichi: ['#c43a26'],
  kon: ['#16120f', '#24305a'], aka: ['#8e2416', '#c9a24a'], kin: ['#a8823a', '#2e4468'],
};

function draw(cv, g) {
  const x = cv.getContext('2d'); if (!x) return;
  const W = cv.width, H = cv.height, c = COL[g.look] || ['#888', '#444'];
  x.clearRect(0, 0, W, H);
  // 下地は明るい和紙の色（黒い馬・黒漆の具足が沈まないように）
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#d9ccae'); bg.addColorStop(1, '#b9a882'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.lineJoin = 'round';
  if (g.kind === 'flag') {   // 背の旗指物：竿と縦の旗
    x.fillStyle = '#3a2a18'; x.fillRect(W * 0.3, H * 0.08, 4, H * 0.86);
    x.fillStyle = c[0]; x.fillRect(W * 0.3 + 4, H * 0.12, W * 0.38, H * 0.62);
    x.strokeStyle = c[1]; x.lineWidth = 2; x.strokeRect(W * 0.3 + 4, H * 0.12, W * 0.38, H * 0.62);
    x.fillStyle = c[1]; x.beginPath(); x.arc(W * 0.49 + 2, H * 0.36, W * 0.08, 0, Math.PI * 2); x.fill();
  } else if (g.kind === 'horse') {   // 馬の横の形（胴・首・頭・脚）
    x.fillStyle = c[0];
    x.beginPath(); x.ellipse(W * 0.48, H * 0.52, W * 0.26, H * 0.16, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(W * 0.66, H * 0.48); x.lineTo(W * 0.8, H * 0.2); x.lineTo(W * 0.9, H * 0.26); x.lineTo(W * 0.76, H * 0.56); x.fill();
    x.fillRect(W * 0.28, H * 0.6, W * 0.05, H * 0.3); x.fillRect(W * 0.38, H * 0.6, W * 0.05, H * 0.3);
    x.fillRect(W * 0.56, H * 0.6, W * 0.05, H * 0.3); x.fillRect(W * 0.64, H * 0.6, W * 0.05, H * 0.3);
    x.fillStyle = c[1]; x.fillRect(W * 0.72, H * 0.18, W * 0.05, H * 0.2);   // たてがみ
    if (g.look === 'ashige') { x.fillStyle = '#f2f0ea'; for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(W * (0.3 + (i * 37 % 40) / 100), H * (0.42 + (i * 13 % 20) / 100), 2, 0, Math.PI * 2); x.fill(); } }
  } else if (g.kind === 'crest') {   // 兜の鉢と前立
    x.fillStyle = '#2a2420'; x.beginPath(); x.arc(W * 0.5, H * 0.78, W * 0.28, Math.PI, 0); x.fill();
    x.fillRect(W * 0.18, H * 0.76, W * 0.64, H * 0.08);
    x.fillStyle = c[0]; x.strokeStyle = c[0]; x.lineWidth = 5;
    if (g.look === 'mika') { x.lineWidth = 7; x.beginPath(); x.arc(W * 0.5, H * 0.04, W * 0.3, Math.PI * 0.18, Math.PI * 0.82); x.stroke(); x.fillRect(W * 0.48, H * 0.3, W * 0.04, H * 0.2); }
    else if (g.look === 'tentsuki') { x.beginPath(); x.moveTo(W * 0.42, H * 0.52); x.lineTo(W * 0.3, H * 0.06); x.lineTo(W * 0.38, H * 0.06); x.lineTo(W * 0.5, H * 0.48); x.lineTo(W * 0.62, H * 0.06); x.lineTo(W * 0.7, H * 0.06); x.lineTo(W * 0.58, H * 0.52); x.fill(); }
    else { x.beginPath(); x.arc(W * 0.5, H * 0.32, W * 0.15, 0, Math.PI * 2); x.fill(); }
  } else {   // 具足：胴の板と縅の糸
    x.fillStyle = c[0]; x.fillRect(W * 0.26, H * 0.18, W * 0.48, H * 0.66);
    x.strokeStyle = c[1]; x.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const y = H * (0.18 + i * 0.11); x.beginPath(); x.moveTo(W * 0.26, y); x.lineTo(W * 0.74, y); x.stroke(); }
    for (let i = 0; i < 7; i++) { const xx = W * (0.3 + i * 0.065); x.beginPath(); x.moveTo(xx, H * 0.18); x.lineTo(xx, H * 0.84); x.stroke(); }
    x.fillStyle = c[0]; x.fillRect(W * 0.12, H * 0.18, W * 0.12, H * 0.22); x.fillRect(W * 0.76, H * 0.18, W * 0.12, H * 0.22);   // 袖
  }
}

export function fillGoodsArt(root) {
  for (const cv of root.querySelectorAll('canvas[data-goods-art]')) {
    const g = KOUKAN.goods.find((q) => q.id === cv.dataset.goodsArt);
    if (g && !cv.dataset.drawn) { draw(cv, g); cv.dataset.drawn = '1'; }
  }
}
