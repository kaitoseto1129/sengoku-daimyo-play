// 戦の画面の新しい札（kaito 11/1 昼の手本・docs/kaito_play_1101.md の J・K・L・M）
//   左上：章の名前（家紋付きの墨の帯）と章の戦の並び ／ その下に「戦の進行」の札（目標の段・進行率・目標までの歩数）
//   右上：四角い小さな地図（北の印 N・川・道・森・敵の赤い点・味方の青い点・自分の青い矢印・今の目標の赤いひし形・城）
//   左下：自分の顔（ゲームの中の自分の姿を胸から上で撮った絵）と HP（緑）・疲れ（金の四つの区切り）
//   右下：突く・守るの丸い金の縁のボタン（touch.js の丸に絵を付ける）
// 目標の中身と進みは stages.js（war_progress.js から読む）。ここは見せ方だけ。毎コマ new しない。
import * as THREE from 'three';
import { missionTarget } from './mission_pin.js';
import { chapterRows, stageRows, stagePercent, SVG } from './war_progress.js';

const MAP_STEP = 0.25;        // 地図の描き直しの間（秒）
const RANGE = 70;             // 地図の半径（歩）
const BG_N = 160;             // 地形の下絵の升目
const FACE = 96;              // 顔の絵の大きさ
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
#hud #jk-vit .jk-bars { display:flex; flex-direction:column; gap:5px; width:150px; }
#hud #jk-vit .jk-row { display:grid; grid-template-columns:28px 1fr; align-items:center; gap:6px; font-size:12px; line-height:1; color:#fff; font-weight:700; text-shadow:0 1px 2px #000; }
#hud #jk-vit .jk-hp i { height:10px; background:#050505; border:1px solid #6b5a33; display:block; }
#hud #jk-vit .jk-hp b { display:block; height:100%; width:100%; background:linear-gradient(#5fd06a,#2f9a3e); }
#hud #jk-vit .jk-hp.low b { background:linear-gradient(#e4c24a,#b08a1e); }
#hud #jk-vit .jk-hp.crit b { background:linear-gradient(#f05a46,#a8261a); }
#hud #jk-vit .jk-sta i { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; height:8px; }
#hud #jk-vit .jk-sta s { display:block; height:100%; background:#2a241b; border:1px solid #6b5a33; box-sizing:border-box; position:relative; overflow:hidden; text-decoration:none; }
#hud #jk-vit .jk-sta s b { position:absolute; left:0; top:0; bottom:0; width:100%; background:linear-gradient(#f0cf6a,#b8913f); }
#hud #jk-vit .jk-sta.out s { border-color:#a8261a; }
#hud :is(#jk-chap,#jk-prog,#jk-map,#jk-vit)[hidden] { display:none !important; }
html:root body #hud:has(#jk-prog:not([hidden])) #h-prog.goal-mode { display:none !important; }
body:has(#pause:not([hidden])) #hud :is(#jk-chap,#jk-prog,#jk-map,#jk-vit) { visibility:hidden; }
#hud.photo :is(#jk-chap,#jk-prog,#jk-map,#jk-vit), #hud.ending :is(#jk-chap,#jk-prog,#jk-map), #hud:has(#bigmap:not([hidden])) :is(#jk-prog,#jk-map,#jk-chap) { display:none !important; }
/* 前の札は畳む（任務の一行・小さな丸い地図・左下の体力の束）。号令の釦は地図の下に残す。 */
html:root body #hud#hud.jk.prog-on #h-prog#h-prog { top:calc(196px + env(safe-area-inset-top, 0px)) !important; background:none !important; border:0 !important; padding:0 !important; animation:none !important; }
html:root body #hud#hud.jk #h-prog#h-prog > :is(.pg-st,.pg-next,.pg-dots,.pg-time,.pg-context) { display:none !important; }
/* 戦の進行の札が無い戦（豊臣編など）：任務の一行が右上の小さな地図の下に潜って切れていた（11/2 1.6.5 の店の写真）。地図の下へ下げる */
html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(196px + env(safe-area-inset-top, 0px)) !important; }
html:root body #hud#hud.jk-map-on :is(#minimap#minimap,#fieldmap#fieldmap,#maphint#maphint) { display:none !important; }
html:root body #hud#hud.jk-vit-on .bl { display:none !important; }
html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important; top:calc(196px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important; width:min(300px, 34vw) !important; max-width:34vw !important; max-height:calc(100% - 330px) !important; }
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
 #hud #jk-vit .jk-bars { width:120px; gap:4px; }
 html:root body #hud#hud.jk.prog-on #h-prog#h-prog, html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { top:calc(120px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { max-height:calc(100% - 240px) !important; }
 html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(120px + env(safe-area-inset-top, 0px)) !important; }
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
 #hud #jk-vit .jk-bars { width:200px; gap:7px; }
 #hud #jk-vit .jk-row { font-size:14px; grid-template-columns:34px 1fr; }
 #hud #jk-vit .jk-hp i { height:12px; }
 #hud #jk-vit .jk-sta i { height:10px; }
 html:root body #hud#hud.jk.prog-on #h-prog#h-prog, html:root body #hud#hud.jk.jk.prog-on:has(#jk-prog) #battle-notices:not(.choosing):not(.pg-x) { top:calc(236px + env(safe-area-inset-top, 0px)) !important; }
 html:root body #hud#hud.jk-map-on:not(.jk) #h-prog#h-prog { top:calc(236px + env(safe-area-inset-top, 0px)) !important; }
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
  chap.innerHTML = `<div class="jk-band"><i>${SVG.mon}</i><span></span></div><ol></ol>`;
  const prog = document.createElement('div');
  prog.id = 'jk-prog';
  prog.setAttribute('role', 'button'); prog.tabIndex = 0;
  prog.setAttribute('aria-label', '戦の進行。押すと合戦の進行を開く');
  prog.innerHTML = '<h5>戦の進行</h5><ul></ul><div class="jk-rate"><span></span><i><b></b></i></div><div class="jk-dist" hidden></div>';
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
  vit.innerHTML = `<canvas width="${FACE}" height="${FACE}" aria-hidden="true"></canvas><div class="jk-bars"><div class="jk-row jk-hp" role="img"><span>命</span><i><b></b></i></div><div class="jk-row jk-sta" role="img"><span>疲れ</span><i><s><b></b></s><s><b></b></s><s><b></b></s><s><b></b></s></i></div></div>`;
  for (const el of [chap, prog, map, vit]) root.appendChild(el);
  return {
    root, chap, prog, map, vit, style,
    mapG: map.getContext('2d'), face: vit.querySelector('canvas'), faceG: vit.querySelector('canvas').getContext('2d'),
    band: chap.querySelector('.jk-band span'), line: chap.querySelector('ol'),
    list: prog.querySelector('ul'), rateT: prog.querySelector('.jk-rate span'), rateB: prog.querySelector('.jk-rate b'), dist: prog.querySelector('.jk-dist'),
    hp: vit.querySelector('.jk-hp'), hpB: vit.querySelector('.jk-hp b'), sta: vit.querySelector('.jk-sta'), staB: [...vit.querySelectorAll('.jk-sta s b')],
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

function drawMap(s, rt, goal) {
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
  // 城
  const c = rt.def.castle;
  if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
    const x = mx(c.x), y = my(c.z), h = 9 * u1;
    if (x > -h && y > -h && x < px + h && y < px + h) {
      g.fillStyle = '#f3ead6'; g.strokeStyle = '#14120f'; g.lineWidth = 1.5 * u1;
      g.beginPath(); g.moveTo(x - h, y + h * .7); g.lineTo(x + h, y + h * .7); g.lineTo(x + h * .7, y - h * .1); g.lineTo(x + h * .45, y - h * .1);
      g.lineTo(x + h * .6, y - h * .55); g.lineTo(x, y - h); g.lineTo(x - h * .6, y - h * .55); g.lineTo(x - h * .45, y - h * .1); g.lineTo(x - h * .7, y - h * .1); g.closePath();
      g.fill(); g.stroke();
    }
  }
  // 兵：味方は青い点、敵は赤い点（地図の上だけの印）
  const team = rt.player.u.team, dot = 1.8 * u1;
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = pass ? '#ff4636' : '#4ea6ff';
    g.beginPath();
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.team > 1 || u.type === 'dummy' || u.type === 'porter') continue;
      if ((u.team !== team) !== !!pass) continue;
      const x = mx(u.pos.x), y = my(u.pos.z);
      if (x < 0 || y < 0 || x > px || y > px) continue;
      g.moveTo(x + dot, y); g.arc(x, y, dot, 0, Math.PI * 2);
    }
    g.fill();
  }
  // 今の目標：赤いひし形（遠い時は縁に）
  if (goal) {
    let x = mx(goal.x), y = my(goal.z);
    const lim = 9 * u1;
    x = Math.max(lim, Math.min(px - lim, x)); y = Math.max(lim, Math.min(px - lim, y));
    const h = 7 * u1;
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * .75, y); g.lineTo(x, y + h); g.lineTo(x - h * .75, y); g.closePath();
    g.fillStyle = '#e0261a'; g.fill(); g.lineWidth = 1.6 * u1; g.strokeStyle = '#fff3ba'; g.stroke();
  }
  // 自分：青い矢印（向きは体の向き）
  const hd = rt.player.u.heading ?? rt.player.yaw ?? 0;
  const sz = 8 * u1;
  g.save(); g.translate(R, R); g.rotate(Math.PI - hd);
  g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * .7, sz * .75); g.lineTo(0, sz * .3); g.lineTo(-sz * .7, sz * .75); g.closePath();
  g.lineWidth = 2 * u1; g.strokeStyle = '#0d1a2a'; g.stroke(); g.fillStyle = '#58b4ff'; g.fill();
  g.restore();
  // 北の印「北」（北＝-z を上に固定。英字は画面に出さない）
  const nx = 12 * u1, ny = 13 * u1;
  g.fillStyle = 'rgba(14,11,8,.75)'; g.beginPath(); g.arc(nx, ny, 9 * u1, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3ead6'; g.font = `700 ${11 * u1}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('北', nx, ny + 1 * u1);
  g.beginPath(); g.moveTo(nx, ny - 13 * u1); g.lineTo(nx + 3 * u1, ny - 8 * u1); g.lineTo(nx - 3 * u1, ny - 8 * u1); g.closePath(); g.fillStyle = '#e0261a'; g.fill();
  // 金の細い内縁
  g.strokeStyle = 'rgba(232,194,90,.45)'; g.lineWidth = 1 * u1; g.strokeRect(2 * u1, 2 * u1, px - 4 * u1, px - 4 * u1);
}

// 顔：ゲームの中の自分の姿を、甲冑ごと胸から上で撮る（戦の始めと、ときどき撮り直す）
function capturePortrait(s, rt) {
  const R = window.__renderer, p = rt.player, u = p?.u;
  if (!R || window.__norender || !rt.scene || !u?.pos || !u.alive) return false;
  if ((p.fpK || 0) > 0.3) return false;
  // 11/1 実機（本能寺 0.89秒・比叡山 1.79秒の引っ掛かり）：別の絵の板（RenderTarget）へ描くと、three は画面と違う描き方
  //   （色の整え無し・直の色）を材質ごとに組み直し、写った物の数だけ同期で待っていた（iPhone の真似で一回 6 秒）。
  //   画面の左下の隅へ画面と同じ描き方で描いて読み、そのコマの本の描画で上書きする。描き方は画面の物を使い回す。
  const G = window.__game;
  if (G && (G.paused || G.mapOpen || G.photo || G.deployment)) return false;
  const gl = R.getContext && R.getContext();
  if (!gl || R.getRenderTarget()) return false;
  if (!s.faceCam) {
    s.faceCam = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
    s.faceVp = new THREE.Vector4(); s.faceSc = new THREE.Vector4();
    s.facePx = new Uint8Array(FACE * FACE * 4);
    s.faceImg = s.faceG.createImageData(FACE, FACE);
  }
  const h = u.heading ?? p.yaw ?? 0, fx = Math.sin(h), fz = Math.cos(h);
  const headY = u.pos.y + (p.mounted ? 2.5 : 1.52);
  const cam = s.faceCam;
  // 前の人や槍に遮られないよう、近く（1.2m）から胸の高さで撮る
  cam.position.set(u.pos.x + fx * 1.2 - fz * 0.3, headY + 0.05, u.pos.z + fz * 1.2 + fx * 0.3);
  cam.lookAt(u.pos.x, headY - 0.14, u.pos.z);
  cam.updateMatrixWorld();
  const vp = R.getViewport(s.faceVp), sc = R.getScissor(s.faceSc), scOn = R.getScissorTest();
  const side = Math.ceil(FACE / (R.getPixelRatio() || 1)) + 1;
  try {
    R.setViewport(0, 0, side, side); R.setScissor(0, 0, side, side); R.setScissorTest(true);
    R.clear(); R.render(rt.scene, cam);
    gl.readPixels(0, 0, FACE, FACE, gl.RGBA, gl.UNSIGNED_BYTE, s.facePx);
  } catch (e) { return false; }
  finally { R.setViewport(vp); R.setScissor(sc); R.setScissorTest(scOn); }
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

export function jkTick(rt, root, dt) {
  if (!root || !rt?.player?.u || !rt.army) return;
  const def = rt.def;
  const town = !!def.town;
  const stg = !town && !def.dojo ? stageRows(rt) : null;
  if (!st) { if (town) return; st = build(root); }
  for (const el of [st.chap, st.prog, st.map, st.vit]) if (el.parentNode !== root) root.appendChild(el);
  const s = st;
  if (s.rt !== rt) {
    s.rt = rt; s.cache = {}; s.bg = null; s.mapT = 0; s.faceAt = 1.2; s.faceOk = false; s.target = null; s.targetAt = 0; s.stageKey = '';
    drawFaceFallback(s);
  }
  const over = !!rt.over;
  const progOn = !!stg && !over;
  const mapOn = !town && !def.dojo && !over;
  const vitOn = !town;
  root.classList.toggle('jk', progOn);
  root.classList.toggle('jk-map-on', mapOn);
  root.classList.toggle('jk-vit-on', vitOn);
  s.prog.hidden = true;   // 11/1 Simple：右上の「目標」と同じ字の二重なので札は出さない（目標の位置は下で計算し続ける）
  s.map.hidden = !mapOn; s.vit.hidden = !vitOn;
  // 章の帯と並び
  const ch = progOn ? chapterRows(rt) : null;
  s.chap.hidden = !ch;
  if (ch) {
    put(s, 'band', ch.name, (v) => { s.band.textContent = v; });
    put(s, 'line', ch.rows.map((r) => r.id + r.state).join(), () => {
      s.line.innerHTML = ch.rows.map((r) => `<li class="${r.state}" aria-label="${r.name}${r.state === 'done' ? '・済み' : r.state === 'now' ? '・今の戦' : ''}"><b></b><span>${r.short}</span></li>`).join('');
    });
  }
  // 戦の進行の札
  let goal = null;
  if (progOn) {
    put(s, 'rows', stg.rows.map((r) => r.state + r.text).join('|'), () => {
      s.list.innerHTML = stg.rows.map((r) => `<li class="${r.state}"><i>${r.state === 'done' ? SVG.check : r.state === 'now' ? SVG.dot : SVG.lock}</i><span>${r.text}</span></li>`).join('');
    });
    const key = `${stg.i}/${stg.n}`;
    if (s.stageKey && s.stageKey !== key && !document.body.classList.contains('rm')) {
      s.prog.classList.remove('jk-flash'); void s.prog.offsetWidth; s.prog.classList.add('jk-flash');
    }
    s.stageKey = key;
    const pct = Math.round(stagePercent(rt, stg) * 100);
    put(s, 'pct', pct, (v) => { s.rateT.textContent = `進行率 ${v}%`; s.rateB.style.width = v + '%'; });
    const line = stg.rows[stg.i]?.text || '';
    const unit = /討|首/.test(line) ? findTarget(s, rt, line) : null;
    goal = unit?.alive ? unit.pos : missionTarget(rt);
    if (goal && !(Number.isFinite(goal.x) && Number.isFinite(goal.z))) goal = null;
    const me = rt.player.u.pos;
    const d = goal ? Math.hypot(goal.x - me.x, goal.z - me.z) - (unit ? 0 : goal.r ?? 4) : 0;
    const steps = d > 2 ? Math.round(d / 0.75) : 0;
    put(s, 'dist', 0, () => { s.dist.hidden = true; s.dist.textContent = ''; });   // 歩数の字は出さない（行き先はピン）
  }
  // 小さな地図
  if (mapOn) {
    if (!progOn) goal = missionTarget(rt);
    s.mapT -= dt || 0;
    if (s.mapT <= 0 && !s.map.hidden) {
      s.mapT = MAP_STEP;
      if (!s.bg && rt.world) { try { s.bg = buildTerrain(rt); } catch (e) { s.bg = { cv: document.createElement('canvas'), half: 200, step: 400 / BG_N }; } }
      drawMap(s, rt, goal && Number.isFinite(goal.x) ? goal : null);
    }
  }
  // HP と疲れ
  if (vitOn) {
    const u = rt.player.u, p = rt.player;
    const hp = Math.max(0, Math.min(1, (u.hp || 0) / (u.maxHp || 1)));
    const hpP = Math.round(hp * 200) / 2;
    put(s, 'hp', hpP, (v) => {
      s.hpB.style.width = v + '%';
      s.hp.classList.toggle('low', v <= 50 && v > 25); s.hp.classList.toggle('crit', v <= 25);
      s.hp.setAttribute('aria-label', `HP 残り${Math.round(v)}パーセント`);
    });
    const sta = Math.max(0, Math.min(1, (p.sta ?? 100) / (p.maxSta || 100)));
    const staP = Math.round(sta * 100);
    put(s, 'sta', staP, (v) => {
      for (let k = 0; k < 4; k++) s.staB[k].style.width = Math.max(0, Math.min(1, v / 25 - k)) * 100 + '%';
      s.sta.classList.toggle('out', v <= 2);
      s.sta.setAttribute('aria-label', `疲れ 残り${v}パーセント`);
    });
    const gb = document.querySelector('#tc .tb[data-b=guard]');
    if (gb) gb.classList.toggle('jk-tired', staP <= 2);
    if (!s.faceOk && rt.t >= s.faceAt) { s.faceOk = capturePortrait(s, rt); s.faceAt = rt.t + (s.faceOk ? 40 : 2); }
    else if (s.faceOk && rt.t >= s.faceAt) { capturePortrait(s, rt); s.faceAt = rt.t + 40; }
  }
}
