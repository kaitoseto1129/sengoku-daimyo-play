// 登用の札・武将図鑑に出す、その人の家紋・旗印・馬印・顔（K586・11/21 クラウド k365-cloud-38）。
// 戦の中と同じ表から引く：家紋＝units_data.js の GENERALS の mon、旗印・馬印＝named_gear.js、顔と甲冑＝busho_portrait.js（3D で撮る一枚）。
// 札だけの家紋の替え（CARD_MON）は、戦の中の兵の陣笠を変えずに、その人自身の家の紋を札に出すため。出所は docs/k586_sashimono_1121.md。
// 使い方（online/toyo_screen.js から）：
//   import { cardLook, drawCardMon, drawCardFlag, cardPortrait } from（src の bushou_card_art.js）;
//   const L = cardLook('織田信長');            // { mon, flag, uma }
//   drawCardMon(canvas, '織田信長');            // 家紋を canvas の大きさに描く（地は透き通し）
//   drawCardFlag(canvas, '織田信長');           // 旗印を canvas の大きさに描く
//   cardPortrait('織田信長').then((img) => …);  // 甲冑姿の上半身（撮れない端末は null）
import { GENERALS, FACTION } from './units_data.js';
import { BUSHOU_ONLINE } from './online/bushou_online.js';
import { NAMED_GEAR } from './named_gear.js';
import { drawMon, flagTexture, hasMon } from './textures.js';
import { portrait } from './busho_portrait.js';

// 札の家紋をその人の家に（戦の中の GENERALS は主家の紋や「無し」の者がいる）
export const CARD_MON = {
  山県昌景: 'takeda',      // GENERALS は none（赤備えの旗）。武田の家中として割菱
  吉川元春: 'sakuma',      // 吉川の家紋「丸離れ三引」（ja.wikipedia「吉川氏」）を丸に三引両の絵で推した
  小早川隆景: 'tanaka',    // 小早川の家紋「左三つ巴」（ja.wikipedia「小早川氏」）。田中吉政と同じ左三つ巴の絵
  豊臣秀吉: 'toyotomi',
  立花宗茂: 'otomo',       // 戦の中の GENERALS は相印の蛇の目。札は旗と揃えて主家大友の抱き杏葉で推した（宗茂の頁に家紋の記載なし）
  島左近: 'kashiwa',       // 「丸に三つ柏」（ja.wikipedia「島清興」の画像の説明）。山内の丸に三つ柏の絵を使う
  蒲生氏郷: 'tsuru',       // 戦の中の GENERALS は織田の木瓜（信長の婿）。札は蒲生の家紋（ja.wikipedia「蒲生氏郷」の立鶴・舞鶴）と旗に揃える
  上杉景勝: 'uesugi',      // 戦の中の GENERALS は豊臣の桐（関ヶ原の頃）。札は上杉の竹に雀
  直江兼続: 'kari',        // 家紋は諸説（亀甲に花菱など）。札は旗印の雁金（ja.wikipedia「直江兼続」）に揃えた
  高坂昌信: 'takeda',      // 家紋の出所なし。武田の家中として割菱で推した
  小早川秀秋: 'kobayakawa', // 違い鎌（小早川の家紋）。戦の中の GENERALS は無し
  榊原康政: 'genjiguruma',  // 源氏車（榊原の家紋。旗の『無』とは別）
  北条氏康: 'hojo',        // 北条鱗（ja.wikipedia「北条氏康」の後北条氏の紋章）
};
const ALIAS = { 豊臣秀吉: '羽柴秀吉' };

export function cardLook(name) {
  const n = String(name || '');
  const g = GENERALS[n] || GENERALS[ALIAS[n]] || {};
  const gear = NAMED_GEAR[n] || NAMED_GEAR[ALIAS[n]] || {};
  // 11/21 K586（120人の照らし）：表に家紋の無い者（名の無い家臣・図鑑だけの人）は、旗の紋 → 登用の表の家（house）の紋で補う。前は札の家紋が空の者が四十人いた
  const flagMon = (f) => (typeof f !== 'string' ? null : f.startsWith('sashi:') ? f.split(':')[1] : f);
  const b = BUSHOU_ONLINE.find((r) => r.name === n);
  const houseMon = b && (FACTION[b.house]?.flag || b.house);
  const cand = [CARD_MON[n], g.mon !== 'none' && g.mon, flagMon(gear.flag), flagMon(g.flag), houseMon];
  const m = cand.find((k) => k && hasMon(k)) || null;
  return { mon: m, flag: gear.flag || (g.flag && g.flag !== 'none' ? g.flag : null) || m || null, uma: gear.uma || null };
}

// 家紋：墨の一色で、地は透き通し（札の地の色の上に置く）
export function drawCardMon(canvas, name, ink = '#201f1c') {
  const { mon } = cardLook(name); const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); if (!mon) return false;
  const t = document.createElement('canvas'); t.width = 128; t.height = 200;
  const g = t.getContext('2d'); drawMon(g, mon, 128, 200);
  // drawMon は白い地に墨の紋（旗と同じ作り）。地を抜いて墨の色に染める
  // 地の色は紋の下の真ん中（y 150）で測る（units_model.js の紋の升と同じ。左端は竿の影で暗い）
  const B0 = g.getImageData(64, 150, 1, 1).data, bg = [B0[0], B0[1], B0[2]], d = g.getImageData(0, 0, 128, 128);
  const c = parseInt(ink.slice(1), 16), R = c >> 16, G = (c >> 8) & 255, B = c & 255;
  for (let i = 0; i < d.data.length; i += 4) {
    if (((i >> 2) % 128) < 9) { d.data[i + 3] = 0; continue; }   // 左端の竿の影
    const diff = Math.abs(d.data[i] - bg[0]) + Math.abs(d.data[i + 1] - bg[1]) + Math.abs(d.data[i + 2] - bg[2]);
    d.data[i] = R; d.data[i + 1] = G; d.data[i + 2] = B; d.data[i + 3] = Math.min(255, Math.max(0, (diff - 24) * 2));
  }
  g.putImageData(d, 0, 0);
  const s = Math.min(w, h); ctx.drawImage(t, 0, 0, 128, 128, (w - s) / 2, (h - s) / 2, s, s);
  return true;
}

// 旗印：戦の旗と同じ絵（敵の赤い縁は付けない）
export function drawCardFlag(canvas, name) {
  const { flag } = cardLook(name); const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height); if (!flag) return false;
  const tex = flagTexture(flag, true, true); if (!tex?.image) return false;
  ctx.drawImage(tex.image, 0, 0, canvas.width, canvas.height);
  return true;
}

export const cardPortrait = (name) => portrait(ALIAS[name] || name);

// 札の中の [data-busho-art="名"] に家紋と旗印を並べる（交換所・登用の札。data-face="1" なら顔の絵を上に足す）
export function fillCardArt(root) {
  for (const el of root.querySelectorAll('[data-busho-art]')) {
    if (el.dataset.done) continue; el.dataset.done = '1';
    const n = el.dataset.bushoArt;
    el.style.cssText += ';display:flex;flex-direction:column;align-items:center;gap:4px';
    // 顔は撮れた時だけ上に足す（撮れない端末・顔の無い人は空の箱を出さず、家紋と旗だけ）
    // K635①：描いた肖像があればそれの顔の所を使う（無ければ今までの3Dの顔）
    if (el.dataset.face) import('./online/portrait_art.js').then(async (P) => {
      const id = P.portraitIdOf(n); if (!id || !(await P.portraits()).has(id) || !el.isConnected) return null;
      const im = new Image(); im.src = P.portraitSrc(id); im.alt = ''; im.style.cssText = 'width:72px;height:72px;object-fit:cover;object-position:50% 16%;border-radius:3px;background:#2a2218';
      el.insertBefore(im, el.firstChild); return true;
    }).then((done) => (done ? null : cardPortrait(n).then((url) => { if (!url || !el.isConnected) return; const im = new Image(); im.src = url; im.alt = ''; im.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:3px;background:#2a2218'; el.insertBefore(im, el.firstChild); }))).catch(() => {});
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center'; row.setAttribute('aria-hidden', 'true');
    const m = document.createElement('canvas'); m.width = m.height = 64; m.style.cssText = 'width:32px;height:32px';
    const f = document.createElement('canvas'); f.width = 40; f.height = 96; f.style.cssText = 'width:20px;height:48px;box-shadow:0 1px 2px #0008';
    if (drawCardMon(m, n)) row.appendChild(m); if (drawCardFlag(f, n)) row.appendChild(f);
    el.appendChild(row);
  }
}
