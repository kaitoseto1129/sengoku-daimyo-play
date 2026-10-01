// ======================================================================
// 軍議の画面・砦と城の版（gungi.js）… docs/siege-plan.md F6・C6・fort-spec 37〜39・siege-spec 20〜24・68。
// 砦（または城）を攻める戦の始め、時を止めて3Dの城郭を回して見る。左：自軍の部隊（兵力・士気）。
// 右：敵（物見でわかった分だけ。わからない所は「？」）。下：部隊を選んでルートを押す→「攻め始める」。
// def.gungi(rt) のある戦だけ、main.js が startBattle の最後に一度だけ呼ぶ（画面の流れそのものは変えない）。
//
// C6（城の版）で足した物。def.gungi(rt) が返す G に、以下を足すと使える（無ければ砦の版のまま何も変わらない）：
//   G.landmarks: [{ name, x, z }]  … 城郭情報【城20】。「城郭情報」釦を押した間だけ、名を画面に出す
//   G.lines:     [{ name, color, owner }]  … 防御線の色と境【城21】。owner は '味方'|'争い中'|'敵' 等の短い語
//   G.deploy:    [{ id, name }]  … 部隊配置の選び先【城23】（前衛・左翼・右翼・後衛・予備など）。
//                 無ければ配置の行は出さず、ルートだけ（砦の版と同じ見え方）
//   G.cinema:    { attackers, gate, defenders }（それぞれ {x,z}）… 始めの寄せ【城68】。
//                 「攻め始める」を押した後、城の全体→攻め手→城門→守り→自分、の順で少し見せてから onDone
// ルート【城22】は今までどおり G.routes（大手・搦手・西の切岸・待機・陽動などは戦の定義側で用意する）。
// 守りの配置が物見しだいで隠れるのは、今までどおり G.enemy の known フラグで表す【城24】。
// ここは gungi.js だけの持ち場（rts.js の siegeCinema だけ使う。hud.js・touch.js には触らない。自前の入力とカメラで完結する）。
// ======================================================================
import * as THREE from 'three';
import { moraleWord } from './hud.js';
import { siegeCinema } from './rts.js';

const STYLE_ID = 'gungi-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
#gungi { position: fixed; inset: 0; z-index: 30; }
#gungi[hidden] { display: none !important; }
#gungi .gdrag { position: absolute; inset: 0; touch-action: none; }
#gungi .gtop { position: absolute; left: 0; right: 0; top: 0; padding: 10px 14px; text-align: center; background: linear-gradient(180deg, rgba(14,12,9,.92), rgba(14,12,9,0)); }
#gungi .gtop h3 { margin: 0; font-size: 17px; letter-spacing: .1em; color: #ece4d2; }
#gungi .gtop p { margin: 3px 0 0; font-size: 12px; color: rgba(236,228,210,.72); pointer-events: none; }
#gungi button.gpause { position: absolute; left: 10px; top: 10px; min-height: 44px; min-width: 44px; padding: 6px 12px; font-size: 13px; color: #ece4d2; background: rgba(236,228,210,.08); border: 1px solid rgba(236,228,210,.32); cursor: pointer; }
#gungi button.ginfo { position: absolute; right: 10px; top: 10px; min-height: 44px; min-width: 44px; padding: 6px 12px; font-size: 13px; color: #ece4d2; background: rgba(236,228,210,.08); border: 1px solid rgba(236,228,210,.32); cursor: pointer; }
#gungi button.ginfo.sel { background: #4a7a63; border-color: #4a7a63; color: #fff5ea; }
#gungi .glines { position: absolute; left: 0; right: 0; top: 52px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 10px; padding: 0 12px; pointer-events: none; }
#gungi .glines span { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: rgba(236,228,210,.85); }
#gungi .glines i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
#gungi .gmark { position: absolute; transform: translate(-50%, -100%); padding: 2px 7px; font-size: 12px; white-space: nowrap; color: #fff5ea; background: rgba(20,16,10,.78); border: 1px solid rgba(236,228,210,.4); pointer-events: none; }
#gungi .gside { position: absolute; top: 56px; bottom: var(--gb-h, 96px); width: min(46vw, 210px); overflow-y: auto; background: rgba(14,12,9,.82); border: 1px solid rgba(236,228,210,.22); padding: 8px; }
#gungi .gleft { left: 8px; }
#gungi .gright { right: 8px; }
#gungi .gside h4 { margin: 2px 4px 8px; font-size: 12px; letter-spacing: .1em; color: rgba(236,228,210,.65); }
#gungi button.gunit { display: block; width: 100%; min-height: 44px; margin-bottom: 8px; padding: 8px 10px; text-align: left; font-size: 14px; line-height: 1.35; color: #ece4d2; background: rgba(236,228,210,.05); border: 1px solid rgba(236,228,210,.28); cursor: pointer; }
#gungi button.gunit.sel { border-color: #e0623f; background: rgba(224,98,63,.2); }
#gungi button.gunit small { display: block; margin-top: 2px; font-size: 12px; color: rgba(236,228,210,.7); }
#gungi .genemy { margin-bottom: 8px; padding: 8px 10px; font-size: 14px; line-height: 1.35; color: #ece4d2; border: 1px solid rgba(236,228,210,.18); }
#gungi .genemy small { display: block; margin-top: 2px; font-size: 12px; color: rgba(236,228,210,.6); }
#gungi .gbottom { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(0deg, rgba(14,12,9,.94), rgba(14,12,9,.2)); }
#gungi .grow-label { text-align: center; font-size: 11px; color: rgba(236,228,210,.55); margin: 0 0 4px; }
#gungi .groutes, #gungi .gdeploys { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 8px; min-height: 44px; }
#gungi button.groute, #gungi button.gdep { min-height: 44px; padding: 8px 16px; font-size: 14px; color: #ece4d2; background: transparent; border: 1px solid rgba(236,228,210,.32); cursor: pointer; }
#gungi button.groute.sel { background: #e0623f; border-color: #e0623f; color: #fff5ea; font-weight: 600; }
#gungi button.gdep.sel { background: #4a7a63; border-color: #4a7a63; color: #fff5ea; font-weight: 600; }
#gungi button.groute:disabled, #gungi button.gdep:disabled { opacity: .4; cursor: not-allowed; }
#gungi .gpick { text-align: center; font-size: 12px; color: rgba(236,228,210,.72); min-height: 1.4em; margin-bottom: 6px; }
#gungi button.gstart { display: block; width: 100%; min-height: 48px; padding: 12px 20px; font-size: 16px; letter-spacing: .1em; color: #fff5ea; background: #e0623f; border: 1px solid #e0623f; cursor: pointer; }
#gungi button.gstart:hover { background: #d5563d; }
@media (max-width: 700px) { #gungi .gside { top: 50px; bottom: var(--gb-h, 112px); font-size: 13px; } }
/* 携帯の横向き（低い画面）：左右の札を小さく畳み、ルートは縦一列にして下の帯に収める（右の「敵」の札とルートの釦が重ならないように） */
@media (max-height: 460px) {
  #gungi .gside { top: 58px; bottom: var(--gb-h, 150px); width: min(34vw, 150px); font-size: 11.5px; padding: 5px; }
  #gungi .gside h4 { margin: 1px 2px 5px; font-size: 10.5px; }
  #gungi button.gunit { min-height: 40px; padding: 5px 7px; margin-bottom: 5px; font-size: 12px; }
  #gungi .gtop p { display: none; }
  #gungi .glines { top: 40px; }
  #gungi .gbottom { padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px)); }
  #gungi .groutes, #gungi .gdeploys { flex-direction: column; align-items: stretch; gap: 5px; max-height: 120px; overflow-y: auto; }
  #gungi button.groute, #gungi button.gdep { width: 100%; min-height: 40px; padding: 7px 10px; text-align: left; white-space: normal; line-height: 1.3; }
  #gungi button.gstart { min-height: 44px; padding: 9px 16px; }
}
`;
  document.head.appendChild(s);
}

function el() {
  let e = document.getElementById('gungi');
  if (!e) { e = document.createElement('div'); e.id = 'gungi'; e.hidden = true; document.body.appendChild(e); }
  return e;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 城郭情報【城20】：画面座標へ映す（camera.project）。範囲外・裏側なら null
const _pv = new THREE.Vector3();
function projectPoint(camera, x, y, z) {
  const v = _pv.set(x, y, z);
  v.project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}

// 砦・城を回すカメラ（rts.js とは別の、この画面だけの土台）。一本指／マウスで回す、離すとゆっくり自分で回る。
// ホイール／二本指で寄る。閉じたら確かめずに元へ戻す（player.updateCamera が次のコマで上書きする）。
// C6：landmarks（城郭情報の札）を渡すと、押している釦の間だけ名を画面へ映す【城20】
function makeCam(game, battle, center, dist0, landmarks) {
  const gy = (battle.world && battle.world.heightAt) ? battle.world.heightAt(center.x, center.z) : 0;
  const st = { yaw: Math.PI * 0.15, pitch: 0.9, dist: Math.max(20, dist0 || 70), drag: false, lx: 0, ly: 0 };
  const layer = document.createElement('div');
  layer.className = 'gdrag';
  const down = (e) => { st.drag = true; st.lx = e.clientX; st.ly = e.clientY; };
  const move = (e) => {
    if (!st.drag) return;
    const dx = e.clientX - st.lx, dy = e.clientY - st.ly;
    st.lx = e.clientX; st.ly = e.clientY;
    st.yaw -= dx * 0.006;
    st.pitch = Math.max(0.28, Math.min(1.5, st.pitch + dy * 0.004));
  };
  const up = () => { st.drag = false; };
  const wheel = (e) => { e.preventDefault(); st.dist = Math.max(18, Math.min(220, st.dist + e.deltaY * 0.08)); };
  layer.addEventListener('pointerdown', down);
  layer.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  layer.addEventListener('wheel', wheel, { passive: false });

  let showInfo = false;
  const markEls = (landmarks || []).map((l) => {
    const e = document.createElement('div');
    e.className = 'gmark'; e.textContent = l.name; e.hidden = true;
    return { l, e };
  });

  let raf = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    if (!st.drag) st.yaw += 0.09 / 60;   // 触っていない間は、ゆっくり自分で回る（見本の「回して見る」）
    const cam = game.camera;
    const cp = Math.cos(st.pitch);
    cam.position.set(
      center.x - Math.sin(st.yaw) * st.dist * cp,
      gy + st.dist * Math.sin(st.pitch) + 7,
      center.z - Math.cos(st.yaw) * st.dist * cp,
    );
    cam.lookAt(center.x, gy + 2, center.z);
    for (const m of markEls) {
      if (!showInfo) { m.e.hidden = true; continue; }
      const my = (battle.world && battle.world.heightAt) ? battle.world.heightAt(m.l.x, m.l.z) : gy;
      const p = projectPoint(cam, m.l.x, m.l.y ?? my + 3, m.l.z);
      if (!p) { m.e.hidden = true; continue; }
      m.e.hidden = false;
      m.e.style.left = `${p.x}px`; m.e.style.top = `${p.y}px`;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    layer,
    markEls,
    setShowInfo(v) { showInfo = !!v; },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerup', up);
      layer.remove();
      for (const m of markEls) m.e.remove();
    },
  };
}

// 開いている軍議（無ければ null）。戦をやめる・やり直す・題へ戻る時に main.js の stopBattle から閉じる
let active = null;
export function closeGungi() { if (active) active.abort(); }

export function gungiAvailable(def) { return !!(def && typeof def.gungi === 'function'); }

// 城の色語【城21】。owner は戦の定義側が短い語（味方・争い中・敵・中立）を渡す。色は言葉で決め打ち（形＋字で示す。色だけに頼らない）
const LINE_COLOR = { 味方: '#4a7a63', 争い中: '#e0a33f', 敵: '#b0473f', 中立: '#8a8478' };

// game：main.js の game（camera・paused を持つ）。battle：Battle（rt）。onDone：閉じた後に呼ぶ（= beginPlay）
export function openGungi(game, battle, onDone) {
  const def = battle.def;
  let G = null;
  try { G = def.gungi(battle); } catch (e) { G = null; }
  if (!G || !G.units || !G.units.length) { onDone(); return; }
  ensureStyle();
  const root = el();
  root.hidden = false;
  game.paused = true;
  // 軍議の間は「軍議中」の印を立てる：main.js の一時停止は、これが立っている間は時を止めたままにする
  // （一時停止の札の「再開する」・マウスを捕まえ直した時などに、軍議の下で戦が勝手に動き出してカメラが自分の目へ戻らないように）
  game.gungiOn = true;
  // 戦の HUD（体力・士気・組の釦・方角の帯など）は軍議の札の下に透けるので隠し、攻め始めたら戻す
  if (game.hud && game.hud.show) game.hud.show(false);
  // 出陣の時に捕まえたマウスを放す（捕まえたままだと、城を回す・札を押すができない）
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();

  const center = G.center || { x: 0, z: 0 };
  const cam = makeCam(game, battle, center, G.dist, G.landmarks);
  let cine = null, closed = false;
  let showInfo = false;

  // 霧：野戦用の近い霧（40〜230）のままだと、回して見るカメラ（最大220m）より城が先に霧へ沈む。
  // 軍議の間だけ、城が見える距離（カメラが届く最大距離＋余裕）に合わせ、閉じたら必ず元へ戻す【粗2改・1】
  const fog = battle.world && battle.world.scene && battle.world.scene.fog;
  const fog0 = fog ? { near: fog.near, far: fog.far } : null;
  // 城の全体（中心から百数十m先の曲輪まで）を見下ろすので、霧は城の向こう端まで薄く保つ（白く霞んで縄張りが読めなかった）
  if (fog) { fog.near = Math.max(fog.near, 150); fog.far = Math.max(fog.far, 620); }
  // 低く溜まる靄・硝煙・土煙の幕も、上から見ると幾重にも重なって白く覆うので、軍議の間だけ隠す
  const W0 = battle.world || {};
  const veils = [W0.haze, W0.dustVeil, W0.mistVeil].filter((v) => v && v.mesh).map((v) => [v.mesh, v.mesh.visible]);
  for (const [m] of veils) m.visible = false;
  const restoreFog = () => { if (fog && fog0) { fog.near = fog0.near; fog.far = fog0.far; } for (const [m, v] of veils) m.visible = v; };

  const assign = {};
  const deployAssign = {};
  const def0 = G.default || {};
  const deployDef0 = G.deployDefault || {};
  for (const u of G.units) {
    assign[u.id] = def0[u.id] || (G.routes && G.routes[0] && G.routes[0].id) || null;
    if (G.deploy && G.deploy.length) deployAssign[u.id] = deployDef0[u.id] || G.deploy[0].id;
  }
  let selUnit = G.units[0] ? G.units[0].id : null;

  const unitOf = (u) => { try { return typeof u.group === 'function' ? u.group() : u.group; } catch (e) { return null; } };

  function render() {
    const left = G.units.map((u) => {
      const g = unitOf(u);
      // 部隊（butai）の手は、目の前に出す本物の兵（十数人）ではなく、表す人数（nominal）を見せる
      const n = typeof u.nominal === 'function' ? u.nominal() : g ? g.count : (u.count ?? 0);
      const mo = g ? Math.round(g.morale) : (u.morale ?? 100);
      const r = assign[u.id];
      const rn = (G.routes || []).find((x) => x.id === r);
      const dp = (G.deploy || []).find((x) => x.id === deployAssign[u.id]);
      const dpTxt = dp ? `　／　配置：${esc(dp.name)}` : '';
      return `<button type="button" class="gunit${u.id === selUnit ? ' sel' : ''}" data-u="${esc(u.id)}">${u.id === selUnit ? '✓ ' : ''}${esc(u.name)}<small>兵力 ${n}　士気 ${esc(moraleWord(mo))}　／　${rn ? esc(rn.name) : '（ルート未定）'}${dpTxt}</small></button>`;
    }).join('');
    const right = (G.enemy || []).map((e) => {
      const known = typeof e.known === 'function' ? e.known() : e.known;
      const cnt = typeof e.count === 'function' ? e.count() : e.count;
      return `<div class="genemy">${esc(e.name)}<small>${known ? `およそ ${cnt != null ? cnt : '？'} 人` : '？（物見でわからない）'}</small></div>`;
    }).join('');
    const routes = (G.routes || []).map((r) => `<button type="button" class="groute${assign[selUnit] === r.id ? ' sel' : ''}" data-r="${esc(r.id)}">${assign[selUnit] === r.id ? '✓ ' : ''}${esc(r.name)}</button>`).join('');
    const deploys = (G.deploy || []).map((d) => `<button type="button" class="gdep${deployAssign[selUnit] === d.id ? ' sel' : ''}" data-d="${esc(d.id)}">${deployAssign[selUnit] === d.id ? '✓ ' : ''}${esc(d.name)}</button>`).join('');
    const lines = (G.lines || []).map((l) => {
      const owner = typeof l.owner === 'function' ? l.owner() : l.owner;
      const col = l.color || LINE_COLOR[owner] || LINE_COLOR.中立;
      return `<span><i style="background:${esc(col)}"></i>${esc(l.name)}${owner ? `（${esc(owner)}）` : ''}</span>`;
    }).join('');
    const info = (G.landmarks && G.landmarks.length)
      ? `<button type="button" class="ginfo${showInfo ? ' sel' : ''}">城郭情報</button>` : '';
    root.innerHTML = `<div class="gtop"><button type="button" class="gpause">止める</button><h3>軍議</h3><p>指かマウスで城を回して見る／部隊を選び、ルートを押す</p>${info}</div>
      ${lines ? `<div class="glines">${lines}</div>` : ''}
      <div class="gside gleft"><h4>味方の部隊</h4>${left}</div>
      <div class="gside gright"><h4>敵（物見の分だけ）</h4>${right || '<div class="genemy">まだわからない</div>'}</div>
      <div class="gbottom">
        <div class="gpick">${selUnit ? esc((G.units.find((u) => u.id === selUnit) || {}).name || '') + 'のルート' : ''}</div>
        <div class="groutes">${routes}</div>
        ${deploys ? `<div class="grow-label">配置</div><div class="gdeploys">${deploys}</div>` : ''}
        <button type="button" class="gstart">この手配りで攻め始める</button>
      </div>`;
    root.insertBefore(cam.layer, root.firstChild);
    for (const m of cam.markEls) root.appendChild(m.e);
    // 左右の部隊札は、下の帯（ルート・配置・攻め始める釦）の高さぶん空けて重ならないようにする。
    // ルートや配置の数で帯の高さが変わる（低い画面でルートを縦一列にした分、特に伸びやすい）ので、
    // 決め打ちの余白ではなく、実際に組んだ帯の高さを測って CSS 変数へ渡す【粗3】
    const gb = root.querySelector('.gbottom');
    if (gb) root.style.setProperty('--gb-h', `${Math.ceil(gb.getBoundingClientRect().height) + 8}px`);
    root.querySelectorAll('button.gunit').forEach((b) => { b.onclick = () => { selUnit = b.dataset.u; render(); }; });
    root.querySelectorAll('button.groute').forEach((b) => { b.onclick = () => { if (selUnit) assign[selUnit] = b.dataset.r; render(); }; });
    root.querySelectorAll('button.gdep').forEach((b) => { b.onclick = () => { if (selUnit) deployAssign[selUnit] = b.dataset.d; render(); }; });
    const infoBtn = root.querySelector('button.ginfo');
    if (infoBtn) infoBtn.onclick = () => { showInfo = !showInfo; cam.setShowInfo(showInfo); render(); };
    root.querySelector('button.gstart').onclick = start;
    root.querySelector('button.gpause').onclick = () => { if (game.openPause) game.openPause(); };
  }

  // 片付け（攻め始めた時も、途中でやめた時も）。done：攻め始める時だけ真
  function close() {
    if (closed) return;
    closed = true;
    active = null;
    cam.stop();
    if (cine) { const c = cine; cine = null; c.cancel(); }
    window.removeEventListener('pointerdown', skip);
    restoreFog();
    root.hidden = true;
    root.innerHTML = '';
    game.gungiOn = false;
  }
  active = { abort: close };

  function finish() {
    if (closed) return;
    close();
    if (game.hud && game.hud.show) game.hud.show(true);
    try { if (typeof G.onStart === 'function') G.onStart({ ...assign }, { ...deployAssign }); } catch (e) { /* 戦の定義の側の事。ここでは止めない */ }
    // 城を回すカメラ（上を向くこともある）を、三人称へ自分で戻す。本来は次のコマの player.updateCamera が
    // 直すはずだが、万一その一コマが例外で止まっても、ここで一度戻してあれば画面は空を向いたまま固まらない
    try { if (battle.player && game.camera) battle.player.updateCamera(1, game.camera); } catch (e) { /* 戻せなくても止めない */ }
    onDone();
  }

  // C6：始めの寄せ【城68】。城の全体→攻め手→城門→守り→自分、の順で少し見せてから終える（押せば飛ばせる）
  function start() {
    // 攻め始めの釦を押したこの時に、戦で使うマウスを捕まえておく（押した勢いの中でないと捕まえられない）
    if (game.requestLock) game.requestLock();
    cam.stop();
    if (!G.cinema) { finish(); return; }
    const gy = (battle.world && battle.world.heightAt) ? battle.world.heightAt(center.x, center.z) : 0;
    const pgy = (p) => (battle.world && battle.world.heightAt) ? battle.world.heightAt(p.x, p.z) : gy;
    const P = battle.player.u.pos;
    const shots = [
      { at: center, look: center, dist: Math.max(60, G.dist || 70) * 1.6, pitch: 1.15, sec: 1.1 },
      G.cinema.attackers && { at: G.cinema.attackers, look: G.cinema.attackers, dist: 40, pitch: 0.7, sec: 1 },
      G.cinema.gate && { at: G.cinema.gate, look: G.cinema.gate, dist: 26, pitch: 0.55, sec: 1 },
      G.cinema.defenders && { at: G.cinema.defenders, look: G.cinema.defenders, dist: 30, pitch: 0.6, sec: 1 },
      { at: P, look: P, dist: 16, pitch: 0.42, sec: 0.9 },
    ].filter(Boolean).map((s) => ({ ...s, y: pgy(s.at) }));
    root.hidden = false; // 寄せの間も画面は覆ったまま（タップで飛ばせる）
    root.innerHTML = '<div class="gtop"><p>寄せ……（押して飛ばす）</p></div>';
    // マウスを捕まえていると押した先は画面（canvas）になるので、窓で受ける
    window.addEventListener('pointerdown', skip);
    cine = siegeCinema(game, battle, shots, () => { cine = null; finish(); });
  }
  function skip() { if (cine) cine.skip(); }

  render();
}
