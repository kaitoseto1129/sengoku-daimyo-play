// 軍団の編成の画面（総大将＋三人・コスト65・兵種の型5つ）。k365-cloud-48 が先に作り、cloud-24（編成と布陣の受け持ち）へ渡した。以後は cloud-24 の物。
import { HOUSES, RARITY, ROSTER, COST_CAP, KATA, ROLES, bushoOf, costOf, armyCost, startersOf, loadOnline, saveOnline, newOnline, changeHouse, monCanvas, kataCanvas, drawKata, face, root, esc, lbl, lw } from './house.js';

// ---- 軍団の編成：総大将＋三人、コスト上限65、兵種の型。onDone(o) で決めた手持ちを渡す ----
export function openHensei(o, onDone, onBack) {
  o = o || loadOnline(); if (!o) { onBack && onBack(); return null; }
  const el = root('軍団の編成');
  const army = (o.army || []).slice(0, 4); while (army.length < 4) army.push(null);
  let sel = 0;
  el.insertAdjacentHTML('beforeend', `<div class="ol-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>軍団</h2>
    <div class="ol-meter" role="meter" aria-label="武将の重さ" aria-valuemin="0" aria-valuemax="${COST_CAP}"><div class="ol-cells" aria-hidden="true">${'<i></i>'.repeat(COST_CAP)}</div><b></b></div></div>
    <div class="ol-slots" role="group" aria-label="総大将と三人"></div>
    <div class="ol-foot"><div class="ol-shelf" role="group" aria-label="手持ちの武将" style="flex:1;min-width:0"></div><button type="button" class="ol-go">この軍で決める</button></div>`);
  const slots = el.querySelector('.ol-slots'), shelf = el.querySelector('.ol-shelf'), meter = el.querySelector('.ol-meter'), go = el.querySelector('.ol-go');
  const bump = () => { meter.classList.remove('bad'); void meter.offsetWidth; meter.classList.add('bad'); navigator.vibrate?.(40); };
  const draw = () => {
    const cost = armyCost(army);
    meter.querySelectorAll('.ol-cells i').forEach((c, i) => { c.className = i < Math.min(cost, COST_CAP) ? 'on' : ''; });
    meter.querySelector('b').textContent = `${cost}/${COST_CAP}`; meter.setAttribute('aria-valuenow', String(cost));
    slots.innerHTML = '';
    ROLES.forEach((r, i) => {
      const n = army[i], b = n && bushoOf(n);
      const s = document.createElement('div'); s.className = 'ol-slot'; s.setAttribute('role', 'button'); s.tabIndex = 0; s.dataset.i = i;
      s.setAttribute('aria-pressed', String(i === sel)); s.setAttribute('aria-label', lbl(r.name, n || lw('空き')));   // 48：英語の時に日本語が残らないよう部品ごとに訳す
      s.innerHTML = `${i === 0 ? '<span class="ol-hon" aria-hidden="true"></span>' : ''}<span class="ol-role">${esc(r.name)}</span><div class="ol-face" style="--rc:${b ? RARITY[b.rare].color : '#3a3226'}"></div>${b ? `<span class="ol-name">${esc(n)}</span><span class="ol-rare" style="--rc:${RARITY[b.rare].color}">${b.rare}</span>` : ''}<div class="ol-katas" role="group" aria-label="兵種の型"></div>`;
      if (n) face(s.querySelector('.ol-face'), n);
      if (n) {
        const k = s.querySelector('.ol-katas');
        for (const kt of KATA) {
          const kb = document.createElement('button'); kb.type = 'button'; kb.className = 'ol-kata'; kb.setAttribute('aria-label', kt.name);
          kb.setAttribute('aria-pressed', String((o.kata[n] || b.fav) === kt.id)); kb.appendChild(kataCanvas(kt.id, 28));
          kb.addEventListener('click', (e) => { e.stopPropagation(); if (sel !== i) { sel = i; draw(); return; } o.kata[n] = kt.id; draw(); });
          k.appendChild(kb);
        }
      }
      const choose = () => { sel = i; draw(); };
      s.addEventListener('click', choose); s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      slots.appendChild(s);
    });
    shelf.innerHTML = '';
    for (const n of o.owned) {
      const b = bushoOf(n); if (!b) continue;
      const at0 = army.indexOf(n), try0 = army.slice(); if (at0 >= 0) try0[at0] = army[sel]; try0[sel] = n;
      const fit = armyCost(try0) <= COST_CAP;   // 選んだ持ち場に入れると上限を超える者は薄く・赤い縁（字を使わずに分からせる）
      const c = document.createElement('button'); c.type = 'button'; c.className = 'ol-card' + (army.includes(n) ? ' used' : '') + (fit ? '' : ' nofit');
      c.setAttribute('aria-label', lbl(n, b.rare, `${lw('重さ')} ${costOf(n)}`));
      c.innerHTML = `<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div><span class="ol-name">${esc(n)}</span><span class="ol-rare" style="--rc:${RARITY[b.rare].color}">${b.rare}</span>`;
      face(c.querySelector('.ol-face'), n);
      c.addEventListener('click', () => {
        const at = army.indexOf(n);
        const next = army.slice(); if (at >= 0) next[at] = army[sel]; next[sel] = n;   // 軍団の中の者なら入れ替え
        if (armyCost(next) > COST_CAP) { bump(); return; }
        army.splice(0, 4, ...next); if (!o.kata[n]) o.kata[n] = b.fav; sel = Math.min(3, sel + (army.indexOf(null) >= 0 ? 1 : 0)); draw();
      });
      shelf.appendChild(c);
    }
    go.disabled = army.some((x) => !x) || cost > COST_CAP;
  };
  draw();
  go.addEventListener('click', () => { o.army = army.slice(); saveOnline(o); el.remove(); onDone && onDone(o); });
  el.querySelector('.ol-back').addEventListener('click', () => { el.remove(); onBack && onBack(); });
  return el;
}
