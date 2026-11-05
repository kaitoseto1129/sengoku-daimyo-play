// 戦の画面の新しい札（kaito 11/1 昼の手本・docs/kaito_play_1101.md の J・K・L・M）
//   左上：章の名前（家紋付きの墨の帯）と章の戦の並び ／ その下に「戦の進行」の札（目標の段・進行率・目標までの歩数）
//   右上：四角い小さな地図（北の印 N・川・道・森・敵の赤い点・味方の青い点・自分の青い矢印・今の目標の赤いひし形・城）
//   左下：自分の顔（ゲームの中の自分の姿を胸から上で撮った絵）と HP（緑）・疲れ（金の四つの区切り）
//   右下：突く・守るの丸い金の縁のボタン（touch.js の丸に絵を付ける）
// 目標の中身と進みは stages.js（war_progress.js から読む）。ここは見せ方だけ。毎コマ new しない。
import * as THREE from 'three';
import { missionTarget } from './mission_pin.js';
import { chapterRows, stageRows, stagePercent, SVG, goalIcon } from './war_progress.js';
import { goalTarget } from './goals5.js';
import { sitesOf, drawCastleMark } from './map_sites.js';
import { BATTLES } from './state.js';

const MAP_STEP = 0.25;        // 地図の描き直しの間（秒）
const RANGE = 70;             // 地図の半径（歩）
const BG_N = 160;             // 地形の下絵の升目
const FACE = 96;              // 顔の絵の大きさ
const PORTRAIT_LAYER = 29;    // 顔の絵を撮る間だけ、本人と光を入れる層
let st = null;

const SPEAR = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M10 40L36 14" stroke="#e9d9a8" stroke-width="3" stroke-linecap="round"/><path d="M33 9l8-2-2 8-5 3-4-4z" fill="#f3ead6" stroke="#8a6d2c" stroke-width="1"/><path d="M28 18l4 4" stroke="#b8913f" stroke-width="3"/></svg>');
const SHIELD = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 6l14 5v12c0 9-6 15-14 19-8-4-14-10-14-19V11z" fill="#3a2f22" stroke="#e9d9a8" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 11v26M15 20h18" stroke="#b8913f" stroke-width="2"/></svg>');

const CSS = `
#hud #jk-chap, #hud #jk-prog, #hud #jk-map, #hud #jk-vit { font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; color:#f3ead6; }
#hud #jk-chap { position:absolute; left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(12px + env(safe-area-inset-top, 0px)); display:flex; align-items:center; gap:10px; pointer-events:none; max-width:calc(100% - 260px); }
#hud #jk-chap .jk-band { display:flex; align-items:center; gap:6px; padding:3px 14px 3px 6px; background:linear-gradient(90deg, rgba(10,8,6,.92) 0%, rgba(20,16,12,.86) 70%, rgba(20,16,12,0) 100%); border-left:3px solid #b8913f; font-size:15px; letter-spacing:.08em; white-space:nowrap; text-shadow:0 1px 2px #000; }
#hud #jk-chap .jk-band i { display:inline-flex; width:20px; height:20px; color:#d9b45a; }
#hud #jk-chap .jk-band i svg { width:100%; height:100%; }
#hud #jk-chap ol { list-style:none; display:flex; align-items:center; margin:0; padding:0; }
#hud #jk-chap li { display:flex; align-items:center; font-size:12px; color:#cfc4ad; white-space:nowrap; text-shadow:0 1px 2px #000,0 0 3px #000; }
#hud #jk-chap li + li::before { content:""; width:14px; height:2px; margin:0 4px; background:#8a7340; }
#hud #jk-chap li b { display:inline-block; width:10px; height:10px; margin-right:4px; border-radius:50%; border:2px solid #8a7340; background:#1a1610; box-sizing:border-box; }
#hud #jk-chap li.done b { background:#d9b45a; border-color:#d9b45a; }
#hud #jk-chap li.now b { width:12px; height:12px; background:#e0392b; border-color:#ffb3a8; box-shadow:0 0 6px #ff3b2a; }
#hud #jk-chap li.now { color:#fff; font-weight:700; }
#hud #jk-prog { position:absolute; left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(52px + env(safe-area-inset-top, 0px)); box-sizing:border-box; width:236px; padding:8px 10px 8px; background:rgba(14,11,8,.84); border:1px solid #b8913f; box-shadow:inset 0 0 0 2px rgba(14,11,8,.9), inset 0 0 0 3px rgba(184,145,63,.35), 0 2px 8px rgba(0,0,0,.5); cursor:pointer; pointer-events:auto; }
#hud #jk-prog:focus-visible { outline:3px solid #fff3ba; outline-offset:2px; }
#hud #jk-prog h5 { margin:0 0 4px; padding-bottom:3px; border-bottom:1px solid rgba(184,145,63,.5); font-size:15px; letter-spacing:.14em; color:#f3e2b4; font-weight:700; }
#hud #jk-prog ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
#hud #jk-prog li { display:grid; grid-template-columns:16px 1fr; align-items:center; gap:6px; font-size:13px; line-height:1.35; color:#e8dfcc; }
#hud #jk-prog li i { width:14px; height:14px; color:#d9b45a; }
#hud #jk-prog li i svg { width:100%; height:100%; display:block; }
#hud #jk-prog li.now { color:#fff; font-weight:700; font-size:15px; }
#hud #jk-prog li.now i { color:#ff4a36; filter:drop-shadow(0 0 4px rgba(255,60,40,.9)); }
#hud #jk-prog li.lock { color:#9d9484; }
#hud #jk-prog li.lock i { color:#8a8274; }
#hud #jk-prog li.open { color:#e8dfcc; }
#hud #jk-prog li.open i { color:#f3ead6; }
#hud #jk-prog li.done span { color:#cfc4ad; }
#hud #jk-prog .jk-rate { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; color:#f3e2b4; font-variant-numeric:tabular-nums; white-space:nowrap; }
#hud #jk-prog .jk-rate i { flex:1; height:6px; background:#3a3226; border:1px solid #6b5a33; }
#hud #jk-prog .jk-rate b { display:block; height:100%; width:0; background:linear-gradient(90deg,#a8822f,#f0cf6a); transition:width .4s; }
#hud #jk-prog .jk-dist { margin-top:4px; font-size:13px; color:#fff3ba; font-variant-numeric:tabular-nums; }
#hud #jk-prog .jk-dist[hidden] { display:none; }
#hud #jk-prog.jk-flash { animation:jk-flash .9s ease-out 1; }
@keyframes jk-flash { 0% { border-color:#fff3ba; box-shadow:0 0 0 2px #f0cf6a, 0 0 18px #f0cf6a; } 100% { } }
body.rm #hud #jk-prog.jk-flash { animation:none; }
@media (prefers-reduced-motion:reduce) { #hud #jk-prog.jk-flash { animation:none; } #hud #jk-prog .jk-rate b { transition:none; } }
#hud #jk-map { position:absolute; right:calc(16px + env(safe-area-inset-right, 0px)); top:calc(12px + env(safe-area-inset-top, 0px)); width:172px; height:172px; box-sizing:border-box; border:2px solid #b8913f; box-shadow:0 0 0 1px #0e0b08, 0 2px 8px rgba(0,0,0,.55); background:#1a1610; cursor:pointer; pointer-events:auto; }
#hud #jk-map:focus-visible { outline:3px solid #fff3ba; outline-offset:2px; }
#hud #jk-vit { position:absolute; left:calc(16px + env(safe-area-inset-left, 0px)); bottom:calc(12px + env(safe-area-inset-bottom, 0px)); display:flex; align-items:center; gap:8px; padding:4px 10px 4px 4px; background:rgba(14,11,8,.8); border:1px solid #b8913f; pointer-events:none; }
#hud #jk-vit canvas { width:56px; height:56px; display:block; border:2px solid #b8913f; box-shadow:inset 0 0 0 1px #000; background:#2a241b; }
#hud #jk-vit .jk-bars { display:flex; flex-direction:column; gap:5px; width:236px; }
/* 顔の横は名だけ。肩書きを省き、携帯でも読める字にする。 */
#hud #jk-vit .jk-name { font-size:max(20px, calc(20px * var(--text-scale, 1))); line-height:1.3; color:#f3ead6; font-weight:700; text-shadow:0 1px 2px #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#hud #jk-vit .jk-row { display:grid; grid-template-columns:2.5em 1fr; align-items:center; gap:8px; font-size:max(18px, calc(18px * var(--text-scale, 1))); line-height:1.3; color:#fff; font-weight:700; text-shadow:0 1px 2px #000; }
#hud #jk-vit .jk-hp i { height:10px; background:#050505; border:1px solid #6b5a33; display:block; }
#hud #jk-vit .jk-hp b { display:block; height:100%; width:100%; background:linear-gradient(#5fd06a,#2f9a3e); }
#hud #jk-vit .jk-hp.low b { background:linear-gradient(#e4c24a,#b08a1e); }
#hud #jk-vit .jk-hp.crit b { background:linear-gradient(#f05a46,#a8261a); }
#hud #jk-vit .jk-sta i { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; height:8px; }
#hud #jk-vit .jk-sta s { display:block; height:100%; background:#2a241b; border:1px solid #6b5a33; box-sizing:border-box; position:relative; overflow:hidden; text-decoration:none; }
#hud #jk-vit .jk-sta s b { position:absolute; left:0; top:0; bottom:0; width:100%; background:linear-gradient(#f0cf6a,#b8913f); }
#hud #jk-vit .jk-sta.out s { border-color:#a8261a; }
/* 休むと戻る案内（kaito 11/2 Q「何もしないと疲れが取れる、という案内は左下にたまに出してよい。HP も何もしなければ少しずつ戻る」） */
#hud #jk-vit .jk-rest { position:absolute; left:0; bottom:calc(100% + 6px); display:flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(14,11,8,.86); border:1px solid #b8913f; font-size:14px; line-height:1.3; color:#f3ead6; white-space:nowrap; text-shadow:0 1px 2px #000; opacity:0; transition:opacity .5s; }
#hud #jk-vit .jk-rest.on { opacity:1; }
#hud #jk-vit .jk-rest svg { width:18px; height:18px; flex:none; }
#hud #jk-vit .jk-row.regen i { box-shadow:0 0 6px rgba(240,207,106,.9); }
#hud #jk-vit .jk-hp.regen i { box-shadow:0 0 6px rgba(95,208,106,.9); }
body.rm #hud #jk-vit .jk-rest { transition:none; }
#hud :is(#jk-chap,#jk-prog,#jk-map,#jk-vit)[hidden] { display:none !important; }
html:root body #hud:has(#jk-prog:not([hidden])) #h-prog.goal-mode { display:none !important; }
body:has(#pause:not([hidden])) #hud :is(#jk-chap,#jk-prog,#jk-map,#jk-vit) { visibility:hidden; }
#hud.photo :is(#jk-chap,#jk-prog,#jk-map,#jk-vit), #hud.ending :is(#jk-chap,#jk-prog,#jk-map), #hud:has(#bigmap:not([hidden])) :is(#jk-prog,#jk-map,#jk-chap) { display:none !important; }
/* 前の札は畳む（任務の一行・小さな丸い地図・左下の体力の束）。号令の釦は地図の下に残す。 */
html:root body #hud#hud.jk.prog-on #h-prog#h-prog, html:root body #hud#hud.jk.jk:not(.prog-on) #h-prog#h-prog { top:calc(196px + env(safe-area-inset-top, 0px)) !important; background:none !important; border:0 !important; padding:0 !important; animation:none !important; }
html:root body #hud#hud.jk #h-prog#h-prog > :is(.pg-st,.pg-next,.pg-dots,.pg-time,.pg-context) { display:none !important; }
/* 戦の進行の札が無い戦（豊臣編など）：任務の一行が右上の小さな地図の下に潜って切れていた（11/2 1.6.5 の店の写真）。地図の下へ下げる */
html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(196px + env(safe-area-inset-top, 0px)) !important; }
/* 両軍の人数の棒（hud_army.js の #tugbar）が左上の章の帯と同じ高さで重なっていた（11/2 1.6.5 の店の写真）。章の帯の下へ */
html:root body #hud.jk #tugbar { top:calc(48px + env(safe-area-inset-top, 0px)) !important; }
/* 「戦の進行」の札が出ている時は、右上の「目標」の札（hud_goals.js）を重ねて出さない（同じ目標が二つ並んで見えた。J を正にする） */
html:root body #hud#hud.jk.prog-on:has(#jk-prog:not([hidden])) #h-prog#h-prog.goal-mode { display:none !important; }
html:root body #hud#hud.jk-map-on :is(#minimap#minimap,#fieldmap#fieldmap,#maphint#maphint) { display:none !important; }
html:root body #hud#hud.jk-vit-on .bl { display:none !important; }
/* 左の地図は要らない（kaito 11/2 Q「右上の地図があるから」）。戦の終わりの後も出さない */
html:root body #hud#hud.q-nomap :is(#minimap#minimap,#fieldmap#fieldmap,#maphint#maphint) { display:none !important; }
html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important; top:calc(196px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important; width:min(300px, 34vw) !important; max-width:34vw !important; max-height:calc(100% - 330px) !important; }
/* 両軍の人数の棒は章の帯の下へ（章の戦の並びが長いと帯が真ん中まで延びて棒に重なる）。 */
html:root body #hud:has(#jk-chap:not([hidden])) #tugbar { top:calc(42px + env(safe-area-inset-top, 0px)); width:min(320px, 32vw); }
@media (min-height:700px) and (min-width:1100px) { html:root body #hud:has(#jk-chap:not([hidden])) #tugbar { top:calc(52px + env(safe-area-inset-top, 0px)); } }
/* 触る端末：左上の止める・地図・視点の釦を避ける。 */
html.touch #hud #jk-chap { top:calc(12px + env(safe-area-inset-top, 0px)); left:calc(max(16px, env(safe-area-inset-left, 0px) + 12px) + 64px); }
html.touch #hud #jk-prog { left:calc(max(16px, env(safe-area-inset-left, 0px) + 12px) + 64px); }
html.touch.tc-low #hud #jk-chap { left:calc(max(16px, env(safe-area-inset-left, 0px) + 12px) + 172px); top:calc(10px + env(safe-area-inset-top, 0px)); max-width:calc(100% - 172px - 140px); }
html.touch.tc-low #hud #jk-prog { left:calc(max(16px, env(safe-area-inset-left, 0px) + 12px)); top:calc(62px + env(safe-area-inset-top, 0px)); }
html.inframe.touch.tc-low #hud #jk-prog { top:calc(122px + env(safe-area-inset-top, 0px)); }
@media (max-height:500px) {
 #hud #jk-chap .jk-band { font-size:13px; padding:2px 10px 2px 4px; }
 #hud #jk-chap li { font-size:12px; }
 #hud #jk-chap li:not(.now) span { display:none; }
 #hud #jk-prog { width:192px; padding:5px 8px 6px; }
 #hud #jk-prog h5 { font-size:13px; margin-bottom:2px; }
 #hud #jk-prog li { font-size:12px; line-height:1.3; }
 #hud #jk-prog li.now { font-size:13px; }
 #hud #jk-prog .jk-rate { margin-top:3px; }
 #hud #jk-prog .jk-dist { margin-top:2px; font-size:12px; }
 #hud #jk-map { width:104px; height:104px; top:calc(8px + env(safe-area-inset-top, 0px)); right:calc(8px + env(safe-area-inset-right, 0px)); }
 #hud #jk-vit { bottom:calc(8px + env(safe-area-inset-bottom, 0px)); padding:3px 8px 3px 3px; }
 #hud #jk-vit canvas { width:44px; height:44px; }
 #hud #jk-vit .jk-bars { width:236px; max-width:calc(100vw - 104px); gap:4px; }
 html:root body #hud#hud.jk.prog-on #h-prog#h-prog, html:root body #hud#hud.jk.jk:not(.prog-on) #h-prog#h-prog, html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { top:calc(120px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { max-height:calc(100% - 240px) !important; }
 html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(120px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud.jk #tugbar { top:calc(38px + env(safe-area-inset-top, 0px)) !important; }
}
@media (min-height:700px) and (min-width:1100px) {
 #hud #jk-chap .jk-band { font-size:17px; }
 #hud #jk-chap li { font-size:14px; }
 #hud #jk-prog { width:290px; top:calc(58px + env(safe-area-inset-top, 0px)); }
 #hud #jk-prog h5 { font-size:17px; }
 #hud #jk-prog li { font-size:15px; }
 #hud #jk-prog li.now { font-size:17px; }
 #hud #jk-prog .jk-rate, #hud #jk-prog .jk-dist { font-size:14px; }
 #hud #jk-map { width:208px; height:208px; }
 #hud #jk-vit canvas { width:72px; height:72px; }
 #hud #jk-vit .jk-bars { width:260px; gap:7px; }
 #hud #jk-vit .jk-hp i { height:12px; }
 #hud #jk-vit .jk-sta i { height:10px; }
 html:root body #hud#hud.jk.prog-on #h-prog#h-prog, html:root body #hud#hud.jk.jk:not(.prog-on) #h-prog#h-prog, html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { top:calc(236px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(236px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud.jk #tugbar { top:calc(56px + env(safe-area-inset-top, 0px)) !important; }
}
/* 突く・守る（M）：丸い金の縁に槍と盾の絵、下に字。 */
html.touch body #tc .tb:is([data-b=atk],[data-b=guard]) { border-radius:50% !important; border:3px solid #c9a24a !important; box-shadow:0 0 0 2px rgba(14,11,8,.85), inset 0 0 0 2px rgba(14,11,8,.7), 0 3px 10px rgba(0,0,0,.5) !important; background:radial-gradient(circle at 50% 38%, rgba(64,52,36,.92), rgba(16,12,9,.92) 70%) !important; color:#f3ead6 !important; font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; display:flex !important; flex-direction:column; align-items:center; justify-content:flex-end; padding-bottom:8%; box-sizing:border-box; }
html.touch body #tc .tb:is([data-b=atk],[data-b=guard])::before { content:""; position:absolute; left:50%; top:14%; width:46%; height:46%; transform:translateX(-50%); background:var(--jk-ico) center/contain no-repeat; pointer-events:none; }
html.touch body #tc .tb[data-b=atk] { --jk-ico:url("${SPEAR}"); }
html.touch body #tc .tb[data-b=guard] { --jk-ico:url("${SHIELD}"); }
html:root body #tc .tb:is([data-b=atk],[data-b=guard]) .name { position:absolute !important; left:0 !important; right:0 !important; top:auto !important; bottom:11% !important; max-width:none !important; margin:0 auto; padding:0 !important; background:none !important; font-size:15px !important; font-weight:700 !important; line-height:1.2 !important; letter-spacing:.1em; text-align:center; text-shadow:0 1px 2px #000; }
html:root body #tc .tb:is([data-b=atk],[data-b=guard]) .name::before { content:none !important; }
html.touch body #tc .tb:is([data-b=atk],[data-b=guard]) small { display:none !important; }
html.touch body #tc .tb:is([data-b=atk],[data-b=guard]).on { border-color:#fff3ba !important; background:radial-gradient(circle at 50% 38%, rgba(120,92,40,.95), rgba(30,22,12,.95) 70%) !important; }
html.touch body #tc .tb[data-b=guard].jk-tired { border-color:#a8261a !important; }
`;

function build(root) {
  const style = document.createElement('style');
  style.id = 'jk-style';
  style.textContent = CSS;
  document.head.appendChild(style);
  const chap = document.createElement('div');
  chap.id = 'jk-chap';
  chap.innerHTML = '<div class="jk-band"><span></span></div>';   // 左上は今の戦の名前だけ（kaito 11/2 P。章の名前・章の並び・家紋の印は出さない）
  const prog = document.createElement('div');
  prog.id = 'jk-prog';
  prog.setAttribute('role', 'button'); prog.tabIndex = 0;
  prog.setAttribute('aria-label', '目標。押すと合戦の進行を開く');
  prog.innerHTML = '<h5>目標</h5><ul></ul>';
  const open = (e) => { e.preventDefault(); e.stopPropagation(); window.__game?.openPause?.(); };
  prog.addEventListener('click', open);
  prog.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  const map = document.createElement('canvas');
  map.id = 'jk-map';
  map.setAttribute('role', 'button'); map.tabIndex = 0;
  map.setAttribute('aria-label', '小さな地図。押すと大きな地図を開く');
  const big = (e) => { e.preventDefault(); e.stopPropagation(); window.__game?.toggleBigMap?.(); };
  map.addEventListener('click', big);
  map.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') big(e); });
  for (const el of [prog, map]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  const vit = document.createElement('div');
  vit.id = 'jk-vit';
  vit.innerHTML = `<canvas width="${FACE}" height="${FACE}" aria-hidden="true"></canvas><div class="jk-bars"><div class="jk-name"></div><div class="jk-row jk-hp" role="img"><span>命</span><i><b></b></i></div><div class="jk-row jk-sta" role="img"><span>疲れ</span><i><s><b></b></s><s><b></b></s><s><b></b></s><s><b></b></s></i></div></div>`;
  for (const el of [chap, prog, map, vit]) root.appendChild(el);
  return {
    root, chap, prog, map, vit, style,
    mapG: map.getContext('2d'), face: vit.querySelector('canvas'), faceG: vit.querySelector('canvas').getContext('2d'),
    band: chap.querySelector('.jk-band span'), line: chap.querySelector('ol'),
    list: prog.querySelector('ul'), rateT: prog.querySelector('.jk-rate span'), rateB: prog.querySelector('.jk-rate b'), dist: prog.querySelector('.jk-dist'),
    lastHp: 0, lastSta: 0, regenT: 0,
    nameEl: vit.querySelector('.jk-name'), hp: vit.querySelector('.jk-hp'), hpB: vit.querySelector('.jk-hp b'), sta: vit.querySelector('.jk-sta'), staB: [...vit.querySelectorAll('.jk-sta s b')],
    rt: null, mapT: 0, bg: null, cache: {}, faceAt: 0, faceOk: false, target: null, targetAt: 0, stageKey: '',
  };
}

const put = (s, k, v, f) => { if (s.cache[k] !== v) { s.cache[k] = v; f(v); } };

// 地形の下絵（戦ごとに一度）。高さの陰・川や田の水・道・森（groves）
function buildTerrain(rt) {
  const w = rt.world;
  const half = w?.half || 200;
  const N = BG_N, step = half * 2 / N;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N), d = img.data;
  const H = new Float32Array((N + 1) * (N + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    let h = 0;
    try { h = w.heightAt(-half + i * step, -half + j * step); } catch (e) { h = 0; }
    if (!Number.isFinite(h)) h = 0;
    H[j * (N + 1) + i] = h; if (h < lo) lo = h; if (h > hi) hi = h;
  }
  const span = Math.max(1, hi - lo);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = H[j * (N + 1) + i], b = H[j * (N + 1) + i + 1], c = H[(j + 1) * (N + 1) + i];
    const shade = Math.max(0.55, Math.min(1.25, 1 + ((a - b) * 0.8 + (a - c) * 0.6) / step * 0.9));
    const e = (a - lo) / span;
    let r = 70 + e * 50, gg = 84 + e * 34, bb = 48 + e * 22;
    const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
    let water = false, road = false;
    try { water = (w.waterDepthAt ? w.waterDepthAt(x, z) > 0.05 : false) || !!w.inWaterAt?.(x, z); } catch (err) { water = false; }
    if (!water) try { road = !!w.onRoad?.(x, z); } catch (err) { road = false; }
    if (water) { r = 58; gg = 104; bb = 138; }
    else if (road) { r = 168; gg = 146; bb = 102; }
    else { r *= shade; gg *= shade; bb *= shade; }
    const k = (j * N + i) * 4;
    d[k] = r; d[k + 1] = gg; d[k + 2] = bb; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 森：濃い緑の丸
  const toPx = (v) => (v + half) / step;
  g.fillStyle = 'rgba(26,48,24,.82)';
  for (const gr of rt.def.groves || []) {
    if (!Number.isFinite(gr.x) || !Number.isFinite(gr.z)) continue;
    g.beginPath(); g.arc(toPx(gr.x), toPx(gr.z), Math.max(1.5, (gr.r || 10) / step), 0, Math.PI * 2); g.fill();
  }
  return { cv, half, step };
}

// 今の段の相手（段の文に名のある武将）を探す。無ければ行き先のピン
function findTarget(s, rt, line) {
  if (s.target && s.target.alive && !s.target.gone && rt.t < s.targetAt) return s.target;
  s.targetAt = rt.t + 1.5; s.target = null;
  if (!line) return null;
  const me = rt.player.u.team;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team === me || !u.name || u.name.length < 2) continue;
    if (line.includes(u.name)) { s.target = u; break; }
  }
  return s.target;
}

function drawMap(s, rt, goal, stg) {
  const cv = s.map, g = s.mapG;
  const css = Math.round(cv.clientWidth) || 104;
  const px = Math.min(2, window.devicePixelRatio || 1) * css | 0;
  if (cv.width !== px) cv.width = cv.height = px;
  const u1 = px / css, R = px / 2, me = rt.player.u.pos;
  const k = R / RANGE;
  const mx = (x) => R + (x - me.x) * k, my = (z) => R + (z - me.z) * k;
  g.fillStyle = '#1a1610'; g.fillRect(0, 0, px, px);
  const bg = s.bg;
  if (bg) {
    const sx = (me.x - RANGE + bg.half) / bg.step, sy = (me.z - RANGE + bg.half) / bg.step, sw = RANGE * 2 / bg.step;
    g.imageSmoothingEnabled = true;
    try { g.drawImage(bg.cv, sx, sy, sw, sw, 0, 0, px, px); } catch (e) { /* 外れても下地のまま */ }
  }
  // 城・砦・寺：小さな城の形の印（rt.sites と def.castle。目標の城は少し大きく金の縁）
  {
    const list = sitesOf(rt);
    const c = rt.def.castle;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.z) && !list.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 30)) list.push({ k: 'castle', x: c.x, z: c.z });
    let best = null, bd = 45;
    if (goal) for (const o of list) { const d = Math.hypot(o.x - goal.x, o.z - goal.z); if (d < bd) { bd = d; best = o; } }
    // 地図の外では、いちばん近い一つだけを縁に出す（行く先の向きの手がかり）
    let rim = null, rd = 450;
    for (const o of list) { const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < rd) { rd = d; rim = o; } }
    for (const o of list) {
      const isGoal = o === best, h = (isGoal ? 11 : 7.5) * u1;
      let x = mx(o.x), y = my(o.z);
      if (x < -h || y < -h || x > px + h || y > px + h) {
        if (!isGoal && o !== rim) continue;
        // 目標の城が地図の外なら、その向きの縁に寄せる
        const dx = x - R, dy = y - R, L = Math.hypot(dx, dy) || 1, lim = R - h * 1.4;
        x = R + dx / L * lim; y = R + dy / L * lim;
      }
      drawCastleMark(g, x, y, h, isGoal ? '#fff3ba' : '#f3ead6', '#14120f', 1.5 * u1);
    }
  }
  // 桶狭間は頭上と同じ赤い▼、味方は青い丸。色だけで所属を覚えさせない。
  const raid = rt.def.missionStyle === 'raid';
  const team = rt.player.u.team, dot = 1.8 * u1;
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = pass ? '#ff4636' : '#4ea6ff';
    g.beginPath();
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.team > 1 || u.type === 'dummy' || u.type === 'porter') continue;
      if ((u.team !== team) !== !!pass) continue;
      const x = mx(u.pos.x), y = my(u.pos.z);
      if (x < 0 || y < 0 || x > px || y > px) continue;
      if (raid && pass) {
        g.moveTo(x - dot * 1.4, y - dot); g.lineTo(x + dot * 1.4, y - dot); g.lineTo(x, y + dot * 1.5); g.closePath();
      } else { g.moveTo(x + dot, y); g.arc(x, y, dot, 0, Math.PI * 2); }
    }
    g.fill();
  }
  // 縁に寄せる（地図の外にいる相手も、その向きが分かるように）
  const lim = 9 * u1;
  const edge = (p) => [Math.max(lim, Math.min(px - lim, mx(p.x))), Math.max(lim, Math.min(px - lim, my(p.z)))];
  // 敵の先手（名に先手・先鋒・先陣のある隊）：赤い小旗（kaito 11/2 P）
  for (const gr of rt.army.groups || []) {
    if (gr.team === team || gr.team > 1 || !/先手|先鋒|先陣/.test(gr.name || '')) continue;
    let n = 0, cx = 0, cz = 0;
    for (const u of gr.units) if (u.alive && !u.gone && !u.fleeing) { n++; cx += u.pos.x; cz += u.pos.z; }
    if (n < 2) continue;
    const [x, y] = edge({ x: cx / n, z: cz / n }), h = 8 * u1;
    g.lineWidth = 1.6 * u1; g.strokeStyle = '#14120f';
    g.beginPath(); g.moveTo(x - h * .5, y + h); g.lineTo(x - h * .5, y - h); g.stroke();
    g.beginPath(); g.moveTo(x - h * .5, y - h); g.lineTo(x + h, y - h * .45); g.lineTo(x - h * .5, y + h * .1); g.closePath();
    g.fillStyle = '#ff4636'; g.fill(); g.lineWidth = 1.2 * u1; g.strokeStyle = '#fff3ba'; g.stroke();
  }
  // 討つ相手（まだ済んでいない目標の字に名のある敵将）：金の縁の赤い丸。頭上の名前と同じ相手
  if (rt.t >= (s.foesAt || 0)) {
    s.foesAt = rt.t + 1.5;
    const want = (stg?.rows || []).filter((r) => r.state !== 'done' && /討|首/.test(r.text)).map((r) => r.text).join('|');
    s.foes = want ? rt.army.units.filter((u) => u.alive && !u.gone && u.team !== team && u.name && u.name.length >= 2 && want.includes(u.name)) : [];
  }
  for (const u of s.foes || []) {
    if (!u.alive || u.gone) continue;
    const [x, y] = edge(u.pos), r = 5.5 * u1;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#e0261a'; g.fill(); g.lineWidth = 2.4 * u1; g.strokeStyle = '#f0cf6a'; g.stroke();
    g.beginPath(); g.arc(x, y, r * .38, 0, Math.PI * 2); g.fillStyle = '#fff3ba'; g.fill();
  }
  // 桶狭間の行き先は景色と同じ穴のあるピン。敵の赤い印と分ける。
  // ほかの戦は本流の赤いひし形を保つ（遠い時は縁に）。
  if (goal) {
    let x = mx(goal.x), y = my(goal.z);
    x = Math.max(lim, Math.min(px - lim, x)); y = Math.max(lim, Math.min(px - lim, y));
    const h = 7 * u1;
    g.beginPath();
    if (raid) {
      g.moveTo(x, y + h); g.bezierCurveTo(x - h * 1.6, y - h * .4, x - h, y - h * 1.5, x, y - h * 1.5);
      g.bezierCurveTo(x + h, y - h * 1.5, x + h * 1.6, y - h * .4, x, y + h);
    } else { g.moveTo(x, y - h); g.lineTo(x + h * .75, y); g.lineTo(x, y + h); g.lineTo(x - h * .75, y); }
    g.closePath();
    g.fillStyle = raid ? '#f0cf6a' : '#e0261a'; g.fill(); g.lineWidth = 1.6 * u1; g.strokeStyle = raid ? '#14120f' : '#fff3ba'; g.stroke();
    if (raid) { g.beginPath(); g.arc(x, y - h * .6, h * .32, 0, Math.PI * 2); g.fillStyle = '#14120f'; g.fill(); }
  }
  // 桶狭間の自分は白い矢じり。他の戦は青い矢印（向きは体の向き）。
  const hd = rt.player.u.heading ?? rt.player.yaw ?? 0;
  const sz = 8 * u1;
  g.save(); g.translate(R, R); g.rotate(Math.PI - hd);
  g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * .7, sz * .75); g.lineTo(0, sz * .3); g.lineTo(-sz * .7, sz * .75); g.closePath();
  g.lineWidth = 2 * u1; g.strokeStyle = '#0d1a2a'; g.stroke(); g.fillStyle = raid ? '#fff3df' : '#58b4ff'; g.fill();
  g.restore();
  // 北の印「北」（北＝-z を上に固定。英字は画面に出さない）
  //   def.mapNorth：戦の野の奥（-z）が北でない時、北の向き（上から時計回りの角）。印は縁のその向きに置き、赤い先をそちらへ向ける（稲生は奥が南東）
  const na = rt.def.mapNorth || 0, nr = R - 13 * u1;
  const nx = na ? R + Math.sin(na) * nr : 12 * u1, ny = na ? R - Math.cos(na) * nr : 13 * u1;
  g.fillStyle = 'rgba(14,11,8,.75)'; g.beginPath(); g.arc(nx, ny, 9 * u1, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3ead6'; g.font = `700 ${11 * u1}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('北', nx, ny + 1 * u1);
  g.save(); g.translate(nx, ny); g.rotate(na);
  g.beginPath(); g.moveTo(0, -13 * u1); g.lineTo(3 * u1, -8 * u1); g.lineTo(-3 * u1, -8 * u1); g.closePath(); g.fillStyle = '#e0261a'; g.fill();
  g.restore();
  // 金の細い内縁
  g.strokeStyle = 'rgba(232,194,90,.45)'; g.lineWidth = 1 * u1; g.strokeRect(2 * u1, 2 * u1, px - 4 * u1, px - 4 * u1);
}

// 顔：ゲームの中の自分の姿を、甲冑ごと胸から上で撮る（戦の始めと、ときどき撮り直す）
const _headV = new THREE.Vector3();
function capturePortrait(s, rt) {
  const R = window.__renderer, p = rt.player, u = p?.u;
  if (!R || window.__norender || !rt.scene || !u?.pos || !u.alive) return false;
  if ((p.fpK || 0) > 0.3) return false;
  // 本人の甲冑の姿（骨の人）が出来て見えている時だけ撮る（作りかけの間に撮ると、周りの兵だけが写った）
  const hm = u.human;
  if (!hm || !hm.root.visible || !hm.root.parent || hm.root.parent.visible === false || !hm.poseReady) return false;
  // 11/1 実機（本能寺 0.89秒・比叡山 1.79秒の引っ掛かり）：別の絵の板（RenderTarget）へ描くと、three は画面と違う描き方
  //   （色の整え無し・直の色）を材質ごとに組み直し、写った物の数だけ同期で待っていた（iPhone の真似で一回 6 秒）。
  //   画面の左下の隅へ画面と同じ描き方で描いて読み、そのコマの本の描画で上書きする。描き方は画面の物を使い回す。
  const G = window.__game;
  if (G && (G.paused || G.mapOpen || G.photo || G.deployment)) return false;
  const gl = R.getContext && R.getContext();
  if (!gl || R.getRenderTarget()) return false;
  if (!s.faceCam) {
    s.faceCam = new THREE.PerspectiveCamera(30, 1, 0.6, 40);   // 手前 0.6m より近い物（隣の兵の槍の柄・旗竿）は写さない
    s.faceVp = new THREE.Vector4(); s.faceSc = new THREE.Vector4();
    s.facePx = new Uint8Array(FACE * FACE * 4);
    s.faceImg = s.faceG.createImageData(FACE, FACE);
  }
  const h = u.heading ?? p.yaw ?? 0, fx = Math.sin(h), fz = Math.cos(h);
  // 頭の高さは人の形の「頭の差し口」から読む（馬上の決め打ち 2.5 では頭の上の空と槍だけが写り、顔の札が黒く見えた・11/1 鳥取）
  if (s.headOf !== u.mesh) { s.headOf = u.mesh; s.headSock = u.mesh?.getObjectByName?.('sock:Head') || null; }
  let headY = u.pos.y + (p.mounted ? 2.5 : 1.52);
  if (s.headSock) { s.headSock.getWorldPosition(_headV); if (Math.abs(_headV.y - u.pos.y - 1.9) < 1.6) headY = _headV.y + 0.1; }
  const cam = s.faceCam;
  // 11/2 夕 kaito「左下の自分の顔の絵（足軽）が変。素直な足軽の顔（甲冑ごと）に」：前の人・槍・旗・笠の鍔の陰が写り込み、
  //   顔が隠れていた。本人の体だけ（と光）を別の層（PORTRAIT_LAYER）に入れて撮り、笠の鍔の下から顔が見える高さ・やや斜めの正面から胸まで
  cam.position.set(u.pos.x + fx * 1.25 - fz * 0.35, headY - 0.06, u.pos.z + fz * 1.25 + fx * 0.35);
  cam.lookAt(u.pos.x, headY - 0.16, u.pos.z);
  cam.updateMatrixWorld();
  const marked = [];
  const mark = (o) => o && o.traverse((c) => { if (!c.layers.isEnabled(PORTRAIT_LAYER)) { c.layers.enable(PORTRAIT_LAYER); marked.push(c); } });
  mark(u.human?.root); mark(u.mesh);
  if (!s.faceLights || s.faceLightsScene !== rt.scene) { s.faceLights = []; s.faceLightsScene = rt.scene; rt.scene.traverse((c) => { if (c.isLight) s.faceLights.push(c); }); }
  for (const l of s.faceLights) mark(l);
  cam.layers.set(PORTRAIT_LAYER);
  // 背の指物の竿が顔の前を縦に横切るので、撮る間だけ外す
  const offs = [u.flag, u.human?.parts?.pole, u.standardFlag, u.horse].filter((o) => o && o.visible);
  for (const o of offs) o.visible = false;
  const vp = R.getViewport(s.faceVp), sc = R.getScissor(s.faceSc), scOn = R.getScissorTest();
  const side = Math.ceil(FACE / (R.getPixelRatio() || 1)) + 1;
  try {
    R.setViewport(0, 0, side, side); R.setScissor(0, 0, side, side); R.setScissorTest(true);
    R.clear(); R.render(rt.scene, cam);
    gl.readPixels(0, 0, FACE, FACE, gl.RGBA, gl.UNSIGNED_BYTE, s.facePx);
  } catch (e) { return false; }
  finally { R.setViewport(vp); R.setScissor(sc); R.setScissorTest(scOn); for (const c of marked) c.layers.disable(PORTRAIT_LAYER); for (const o of offs) o.visible = true; }
  const src = s.facePx, dst = s.faceImg.data;
  let sum = 0;
  for (let y = 0; y < FACE; y++) {
    const a = (FACE - 1 - y) * FACE * 4, b = y * FACE * 4;
    for (let i = 0; i < FACE * 4; i += 4) {
      // 画面と同じ仕上げ（色の整え・sRGB）を通った絵なので、そのまま写す
      dst[b + i] = src[a + i]; dst[b + i + 1] = src[a + i + 1]; dst[b + i + 2] = src[a + i + 2]; dst[b + i + 3] = 255;
      sum += src[a + i + 1];
    }
  }
  if (sum < FACE * FACE * 4) return false;   // 真っ暗（まだ描けていない）
  // 本人の人の形がまだ出来ていないと、空の色だけの灰の四角が写り、四十秒そのままだった（金ヶ崎・越前一向一揆）。
  //   隅の色（空）と違う画素が一割に満たなければ、撮れていないとして二秒後に撮り直す
  let body = 0;
  const c0 = src[0], c1 = src[1], c2 = src[2];
  for (let i = 0; i < src.length; i += 16) if (Math.abs(src[i] - c0) + Math.abs(src[i + 1] - c1) + Math.abs(src[i + 2] - c2) > 24) body++;
  if (body < src.length / 160) return false;
  // 夜の山の寺（大滝寺）は顔が黒い四角になった：暗い絵は平均が70ほどになるまで明るくする（三倍まで）
  const mean = sum / (FACE * FACE);
  if (mean < 60) { const k = Math.min(3, 70 / mean); for (let i = 0; i < dst.length; i += 4) { dst[i] = Math.min(255, dst[i] * k); dst[i + 1] = Math.min(255, dst[i + 1] * k); dst[i + 2] = Math.min(255, dst[i + 2] * k); } }
  s.faceG.putImageData(s.faceImg, 0, 0);
  return true;
}

function drawFaceFallback(s) {
  const g = s.faceG, n = FACE;
  const grd = g.createLinearGradient(0, 0, 0, n); grd.addColorStop(0, '#3a3226'); grd.addColorStop(1, '#16120d');
  g.fillStyle = grd; g.fillRect(0, 0, n, n);
  g.fillStyle = '#0c0a08';
  g.beginPath(); g.ellipse(n / 2, n * 0.48, n * 0.2, n * 0.24, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(n / 2, n * 1.02, n * 0.42, n * 0.34, 0, Math.PI, 0); g.fill();
}

const battleName = (rt) => String(BATTLES[rt.index]?.name || rt.def.title || rt.def.name || '');

export function jkTick(rt, root, dt) {
  if (!root || !rt?.player?.u || !rt.army) return;
  const def = rt.def;
  const town = !!def.town;
  const stg = !town && !def.dojo ? stageRows(rt) : null;
  if (!st) { if (town) return; st = build(root); }
  for (const el of [st.chap, st.prog, st.map, st.vit]) if (el.parentNode !== root) root.appendChild(el);
  const s = st;
  if (s.rt !== rt) {
    s.rt = rt; s.cache = {}; s.bg = null; s.mapT = 0; s.faceAt = 1.2; s.faceOk = false; s.target = null; s.targetAt = 0; s.stageKey = ''; s.foesAt = 0; s.foes = null;
    drawFaceFallback(s);
  }
  const over = !!rt.over;
  // 任務一行を進行欄用の設定で隠さず、小地図を使わない戦の指定も守る。
  const progOn = !!stg && !def.missionSingleLine && !over;
  const mapOn = !town && !def.dojo && !def.noMiniMap && !over;
  const vitOn = !town;
  root.classList.toggle('jk', progOn);
  root.classList.toggle('jk-map-on', mapOn);
  root.classList.toggle('jk-vit-on', vitOn);
  root.classList.toggle('q-nomap', !town && !def.dojo);
  s.prog.hidden = true;   // 11/1 Simple：右上の「目標」と同じ字の二重なので札は出さない（目標の位置は下で計算し続ける）
  s.map.hidden = !mapOn; s.vit.hidden = !vitOn;
  // 章の帯と並び
  // 左上は今の戦の名前だけ（kaito 11/2 P「章の名前と章の戦の並びは要らない」）
  const ch = progOn ? chapterRows(rt) : null;
  const bname = !town && !def.dojo && !over ? (ch?.rows.find((r) => r.state === 'now')?.name || battleName(rt)) : '';
  // 戦名は出陣前だけ。遊ぶ間は地図・命・行動の三枚に収める。
  s.chap.hidden = !bname || !rt.hud?.introWaiting;
  if (bname) {
    put(s, 'band', bname, (v) => { s.band.textContent = v; });
    // 章の並びの ol は作らなくなった（11/2 P）。無い時に止まらない
    if (s.line) { put(s, 'line', '', () => { s.line.innerHTML = ''; }); s.line.hidden = true; }
  }
  // 戦の進行の札
  let goal = null;
  if (progOn) {
    put(s, 'rows', stg.rows.map((r) => r.state + r.text).join('|'), () => {
      s.list.innerHTML = stg.rows.map((r) => `<li class="${r.state}" aria-label="${r.state === 'done' ? '済み：' : 'まだ：'}${r.text}"><i>${goalIcon(r.state)}</i><span>${r.text}</span></li>`).join('');
    });
    const key = stg.rows.map((r) => r.state[0]).join('');
    if (s.stageKey && s.stageKey !== key && !document.body.classList.contains('rm')) {
      s.prog.classList.remove('jk-flash'); void s.prog.offsetWidth; s.prog.classList.add('jk-flash');
    }
    s.stageKey = key;
    const line = stg.rows[stg.i]?.text || '';
    const unit = /討|首/.test(line) ? findTarget(s, rt, line) : null;
    goal = unit?.alive ? unit.pos : missionTarget(rt);
    if (goal && !(Number.isFinite(goal.x) && Number.isFinite(goal.z))) goal = null;
  }
  // 小さな地図
  if (mapOn) {
    if (!progOn) goal = missionTarget(rt);
    goal = rt.hud?.actionGuideUnit?.pos || goalTarget(rt) || goal;   // 目標5つの今の相手（地面の矢印・頭上の▼と同じ物。kaito 11/2 Q）
    s.mapT -= dt || 0;
    if (s.mapT <= 0 && !s.map.hidden) {
      s.mapT = MAP_STEP;
      if (!s.bg && rt.world) { try { s.bg = buildTerrain(rt); } catch (e) { s.bg = { cv: document.createElement('canvas'), half: 200, step: 400 / BG_N }; } }
      drawMap(s, rt, goal && Number.isFinite(goal.x) ? goal : null, stg);
    }
  }
  // HP と疲れ
  if (vitOn) {
    const u = rt.player.u, p = rt.player;
    // 桶狭間では名前を読む必要をなくし、命の棒だけを残す。
    const G0 = rt.G || window.__game?.G;
    put(s, 'name', def.missionStyle === 'raid' ? '' : (G0 && G0.name) || u.name || '', (v) => { s.nameEl.textContent = v; });
    const hp =Math.max(0, Math.min(1, (u.hp || 0) / (u.maxHp || 1)));
    const hpP = Math.round(hp * 200) / 2;
    put(s, 'hp', hpP, (v) => {
      s.hpB.style.width = v + '%';
      s.hp.classList.toggle('low', v <= 50 && v > 25); s.hp.classList.toggle('crit', v <= 25);
      s.hp.setAttribute('aria-label', `命 残り${Math.round(v)}パーセント`);
    });
    const sta = Math.max(0, Math.min(1, (p.sta ?? 100) / (p.maxSta || 100)));
    const staP = Math.round(sta * 100);
    put(s, 'sta', staP, (v) => {
      for (let k = 0; k < 4; k++) s.staB[k].style.width = Math.max(0, Math.min(1, v / 25 - k)) * 100 + '%';
      s.sta.classList.toggle('out', v <= 2);
      s.sta.setAttribute('aria-label', `疲れ 残り${v}パーセント`);
    });
    // 戻っている間は棒が光る。弱っていて敵から離れている時、案内の字は出さない
    s.regenT -= dt || 0;
    if (s.regenT <= 0) {
      s.regenT = 0.5;
      s.hp.classList.toggle('regen', hp < 0.999 && hp > s.lastHp + 0.001);
      s.sta.classList.toggle('regen', sta < 0.999 && sta > s.lastSta + 0.004);
      s.lastHp = hp; s.lastSta = sta;
    }
    const gb = document.querySelector('#tc .tb[data-b=guard]');
    if (gb) gb.classList.toggle('jk-tired', staP <= 2);
    // 11/3 kaito「顔の絵が途中で変わる（馬や耳が写る）」：撮り直すと馬上・兜の替わりで別の絵になった。戦の間ずっと同じ絵にするため、一度撮れたら撮り直さない（馬上の間は降りるまで待つ。三十秒たったら馬上でも撮る）
    if (!s.faceOk && rt.t >= s.faceAt) {
      if (rt.player?.mounted && rt.t < 30) s.faceAt = rt.t + 2;
      else { s.faceOk = capturePortrait(s, rt); s.faceAt = rt.t + 2; }
    }
  }
}
