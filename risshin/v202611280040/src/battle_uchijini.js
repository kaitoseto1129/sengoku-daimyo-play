// 11/20 K401：名のある武将が討ち死にしたら、画面の真ん中に「〇〇 討ち死に」を出す（kaito が頼んだ字）。全戦共通。
// 戦の画面では hud.banner が出ない決まりなので、自前の一枚を #hud の上に置く。同じ文は八秒に一度。
let el = null;
export function showUchijini(rt, text) {
  const root = document.getElementById('hud') || document.body;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.id = 'uchijini';
    el.setAttribute('aria-live', 'polite');
    // 11/20 クラウド k365-cloud-03（act bot 874×402：top 38% で右上の目標の札 #h-prog と行き先の札 .gs-tag に重なった）：
    //   真ん中のまま、右上の札の下・下の釦の上（高さの六割）へ下げ、横幅を画面の六割までに（字は同じ）
    el.style.cssText = 'position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis;'
      + 'padding:10px 28px;background:rgba(18,14,12,.82);border-top:2px solid #b8402e;border-bottom:2px solid #b8402e;'
      + 'color:#f4ead6;font:700 clamp(17px, 5.2vh, 24px)/1.4 serif;letter-spacing:.12em;white-space:nowrap;opacity:0;transition:opacity .35s';
    root.appendChild(el);
  }
  el.textContent = text;
  // 11/21 木津川口の持ち主（act bot 874×402・245秒：高さ六割の札が行き先の札 .gs-tag に重なった）：
  //   六割・七割四分・四割六分の順に、行き先の札・目標の札に重ならない高さを選ぶ（どれも重なれば六割のまま）
  try {
    let pick = 60;
    for (const top of [60, 74, 46]) {
      el.style.top = top + '%';
      const a = el.getBoundingClientRect();
      if (a.height <= 0) break;
      let hit = false;
      for (const sel of ['.gs-tag', '#h-prog']) {
        for (const t of document.querySelectorAll(sel)) {
          const b = t.getBoundingClientRect();
          if (b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) { hit = true; break; }
        }
        if (hit) break;
      }
      if (!hit) { pick = top; break; }
    }
    el.style.top = pick + '%';
  } catch (e) { el.style.top = '60%'; }
  el.style.opacity = '1'; el.classList.add('on');
  clearTimeout(el._t);
  // 11/21 根白坂の持ち主（中学生 bot 874×402・176秒 ★★★ 四回：札を置いた後に、敵へ付いて動く行き先の札 .gs-tag が札の上へ入って来た。
  //   同じ 116秒：関所の済みの印 #cp-clear とも重なった。札の印は作り直されるので一つずつ隠しても効かなかった）：
  //   札を出している四秒半は #hud に印を付け、行き先の札と関所の印を隠す（札の高さは動かさない・字は同じ）
  if (!document.getElementById('uchijini-css')) {
    const st = document.createElement('style'); st.id = 'uchijini-css';
    st.textContent = 'html:root body #hud.uj-on #goal-sign .gs-tag, html:root body #hud.uj-on #cp-clear { visibility:hidden !important; }';
    document.head.appendChild(st);
  }
  root.classList.add('uj-on');
  if (!window.__keepUchijini) el._t = setTimeout(() => { el.style.opacity = '0'; el.classList.remove('on'); setTimeout(() => { if (el.style.opacity === '0') root.classList.remove('uj-on'); }, 400); }, 4500);
}
