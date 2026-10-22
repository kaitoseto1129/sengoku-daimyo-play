import { GROUP_NAME, ORDER_NAME } from "./player.js";
import { $, groupGeneral, byAllyDistance, tagOf, faceCls, ORDER_MARK, TAG_COL, esc, setStyle, rtsCss, monIcon } from "./hud_common.js";
import { sightRef, sightUnit, groupSeen, numberHint } from "./battle_sight.js";
import { isTouch } from "./touch.js";
import { VIEW } from "./viewport.js";
import { allyAction, allyPlace } from "./ally_orders.js";
import { GENERALS } from "./units.js";
import { rtsSetPick, rtsPick, rtsOrder, rtsMultiOn, rtsSetMulti, rtsSelection, rtsCollect, rtsCanCommand } from "./rts.js";
import { ORDERS as RTS_ORDERS, icon as rtsIcon, FORMS as RTS_FORMS } from "./gunbai.js";

export class HudUnits {


  // 号令先の隊を選ぶ（G の切り替えと同じ働き。選んだ隊をもう一度選ぶと全隊に戻す）
  pickGroup(k) {
    const rt = this.rt;
    if (!rt || !rt.player || !(this.unitKinds || []).length) return;
    const p = rt.player;
    p.selGroup = k !== 'all' && p.selGroup === k ? 'all' : k;
    this.flash(p.selGroup === 'all' ? '全隊に号令' : `${GROUP_NAME[p.selGroup] || '組'}に号令`, 'dim');
    if (p.cmdOpen) p.cmdOpenT = 0;
    if (rt.tutMark) rt.tutMark('group');
    this.unitsKey = '';
  }


  // 部隊の帯（画面の右下）：自分の組の隊ごとの札と、名のある味方の武将の隊の札
  // 札：率いる者の姿（墨の半身と家紋）、士気の輪（減ると欠ける）、兵の数の札（戦場の隊旗の札と同じ色）、いまの号令の印
  updateUnits(rt) {
    const el = $('h-units');
    if (!el) return;
    const p = rt.player;
    const own = this.unitOwn || (this.unitOwn = []); own.length = 0;
    for (const g of rt.squadGroups) if (g.count > 0) own.push(g);
    const kinds = this.unitKindWork || (this.unitKindWork = []); kinds.length = 0;
    for (const g of own) if (!kinds.includes(g.kind)) kinds.push(g.kind);
    this.unitKinds = kinds;
    // 名のある味方の武将の隊（近い順に三つまで）
    const pu = p.u.pos;
    if (!(rt.t - (rt.allyAt ?? -1e9) < 2)) {   // 2 秒に一度（コマ数でなく戦の時間で数える）
      rt.allyAt = rt.t;
      const candidates = this.allyCandidates || (this.allyCandidates = []); candidates.length = 0;
      const pool = this.allyCandidatePool || (this.allyCandidatePool = []);
      for (const g of rt.army.groups) {
        const gg = g.team === 0 && !g.isPlayerSquad && g.count > 0 ? groupGeneral(g) : null;
        if (!gg || !gg.name) continue;
        const i = candidates.length, entry = pool[i] || (pool[i] = { g: null, d: 0 });
        entry.g = g; entry.d = Math.hypot(g.center().x - pu.x, g.center().z - pu.z);
        candidates.push(entry);
      }
      candidates.sort(byAllyDistance);
      const groups = rt.allyGroups || (rt.allyGroups = []); groups.length = 0;
      for (let i = 0; i < Math.min(3, candidates.length); i++) groups.push(candidates[i].g);
    }
    // 名のある味方の札は、組を率いる身分（か大名）から。足軽の時は号令できないので出さない
    const allies = this.unitAllies || (this.unitAllies = []); allies.length = 0;
    if (own.length || rt.G.lordTitle) for (const g of rt.allyGroups || []) if (g.count > 0 && sightRef(rt, g, g.center())) allies.push(g);
    if (!own.length && !allies.length) { el.hidden = true; this.unitsKey = ''; return; }
    el.hidden = false;
    const mon = rt.def.sides ? rt.def.sides.a.mon : 'tokugawa';
    const many = kinds.length > 1;
    const cards = [];
    if (many) cards.push({ k: 'all', html: `<button type="button" class="uc all ${p.selGroup === 'all' ? 'on' : ''}" data-sel="all" aria-pressed="${p.selGroup === 'all'}" aria-label="全隊に号令する${isTouch ? '' : '（オルトと0）'}"><b>全</b><span class="nm">全隊</span><kbd>0</kbd></button>` });
    for (const k of kinds) {
      const gs = this.unitGroupWork || (this.unitGroupWork = []); gs.length = 0;
      let n = 0, morale = 0, guns = 0, ready = 0;
      for (const g of own) {
        if (g.kind !== k) continue;
        gs.push(g); morale += g.morale;
        for (const u of g.units) if (sightUnit(rt, u)) {
          n++;
          // 込め終わりも同時に数え、兵の一覧を繰り返し作らない。
          if (k === 'gun' && u.type === 'gun') { guns++; if (!u.reload) ready++; }
        }
      }
      const mor = morale / gs.length;
      const g0 = gs[0];
      const seen = groupSeen(rt, g0);
      const ord = !seen ? '' : g0.focus ? 'focus' : g0.order;
      const sel = many && (p.selGroup === 'all' || p.selGroup === k);
      const tg = tagOf(g0);
      const i = kinds.indexOf(k) + 1;
      const nm = many ? GROUP_NAME[k] || '組' : '自分の組';
      // 最後の号令への返事を札に残す。短い知らせが間引かれても読み直せる。
      let receipt = g0._commandStatus || '';
      for (const g of gs) if (g._commandStatus && g._commandStatus !== '届いた') receipt = g._commandStatus;
      if (gs.some((g) => g.pending)) receipt = '伝え中';
      const lbl = `${nm} ${numberHint(n)} 号令${ORDER_NAME[ord] || '様子不明'}${receipt ? `（${receipt}）` : ''}${guns ? ` 込め終わり${ready}／${guns}` : ''}`;
      const inner = `<span class="face ${faceCls(k, mon)} ${mor < 30 ? 'waver' : ''}"></span>` +
        `<i class="ord ${g0.pending ? 'pend' : ''}" aria-hidden="true">${ORDER_MARK[ord] || '・'}</i>${g0.pending ? `<i class="runner" aria-hidden="true" title="使番が走っている">使番を出した</i>` : ''}<i class="cnt" style="box-shadow:inset 4px 0 0 ${TAG_COL[tg]}, 0 0 0 1px #000" aria-hidden="true">${numberHint(n)}</i>` +
        `<span class="nm">${esc(nm)}</span>${many ? `<kbd aria-hidden="true">${i}</kbd>` : ''}` +
        (guns ? `<i class="ready" aria-hidden="true" title="込め終わり">${ready}/${guns}</i>` : '') +
        (receipt ? `<i class="command-status" aria-hidden="true">${esc(receipt)}</i>` : '');
      cards.push({ k, html: many ? `<button type="button" class="uc own ${sel ? 'on' : ''}" data-sel="${k}" aria-pressed="${sel}" aria-label="${esc(lbl)}${isTouch ? '' : `（オルトと${i}）`}">${inner}</button>` : `<div class="uc own solo" role="img" aria-label="${esc(lbl)}">${inner}</div>` });
    }
    // 携帯の横向き：一段に自分の組の札だけ。控えの武将は［ほか］を押した時だけ
    const phone = (isTouch ? document.documentElement.classList.contains('tc-low') : window.matchMedia('(max-height: 500px)').matches) && own.length > 0;
    if (phone && allies.length) cards.push({ k: 'allies', html: `<button type="button" class="uc al ${this.alliesOpen ? 'on' : ''}" data-allies="1" aria-pressed="${!!this.alliesOpen}" aria-label="味方の武将の隊 ${allies.length}つ（押すと${this.alliesOpen ? '畳む' : '出す'}）"><b>…</b><span class="nm">ほか</span></button>` });
    for (const g of phone && !this.alliesOpen ? [] : allies) {
      const gen = groupGeneral(g);
      if (!gen || !gen.name) continue;   // 武将が討たれても隊が残る時がある
      const full = gen.name.replace(/^.* /, '');
      // 札に収まらない五字以上の名は、下の名（「藤吉郎」）で。読み上げには全部の名
      // 背の低い指の画面（札が細い）では、四字の名も下の名二字（「信長」「光秀」）に
      const nm = full.length >= 5 ? full.slice(-3) : full.length === 4 && isTouch && VIEW.h <= 500 ? full.slice(-2) : full;
      const fighting = g.units.some((u) => u.alive && (u.target || u.atk));
      const st = allyAction(g);
      const report = rt.allyOrders && rt.allyOrders.find((r) => r.g === g && r.active);
      const place = report ? allyPlace(report.x, report.z, pu) : '';
      const gm = (GENERALS[full] || {}).mon || mon;
      cards.push({ k: 'a' + g.id, html: `<button type="button" data-ally="${g.id}" class="uc ally ${fighting ? 'fight' : ''} ${g.routed || g.order === 'retreat' ? 'back' : ''}" aria-label="${report ? '小地図の' + report.number + '、' : ''}${esc(full)}の隊 ${numberHint(g.count)} ${place} ${st}">` +
        `<span class="face ${faceCls('honjin', gm)} ${g.morale < 30 ? 'waver' : ''}"></span><i class="cnt ally" aria-hidden="true">${numberHint(g.count)}</i>` +
        `<span class="nm ${nm.length >= 5 ? 'long' : ''}">${report ? report.number + ' ' : ''}${esc(nm)}</span><span class="st">${st === '持ち場を守る' ? '守る' : st === '合図を待つ' ? '待つ' : st === '戦っている' ? '戦う' : st === '攻めている' ? '攻める' : st === '移動中' ? '進む' : '退く'}</span></button>` });
    }
    let key = '';
    for (const c of cards) key += c.html;
    if (key === this.unitsKey) return;
    this.unitsKey = key;
    el.innerHTML = key;
    el.setAttribute('aria-label', many ? (isTouch ? '部隊（札を押して号令先を選ぶ）' : '部隊（札を押すか オルトと数字で号令先を選ぶ）') : '部隊');
    // 下の札（槍・打刀・指揮…）と重ならないよう、右の空きに収めて足りなければ上へ折り返す
    // 指の端末では下の札が無いので、幅は CSS（右下の丸に掛からない幅）に任せる
    if (isTouch) { setStyle(el, 'maxWidth', ''); return; }
    // 低い画面（幅 844×高さ 390 など）：札を二段・三段に積むと上の任務の札に掛かるので、一段に並べる（幅の 45%）
    if (window.matchMedia('(max-height: 500px)').matches) { setStyle(el, 'maxWidth', Math.round(VIEW.w * 0.45) + 'px'); return; }
    const hb = $('h-bottom').getBoundingClientRect();
    setStyle(el, 'maxWidth', Math.max(160, VIEW.w - (hb.right || 0) - 32) + 'px');
  }



  // 上空視点（rts.js）の帯：選んだ部隊の札・下知の釦 6・構えの横開き・複数選び（F5）
  buildRtsDock() {
    rtsCss();
    const el = document.createElement('div');
    el.id = 'rts-dock';
    el.hidden = true;
    el.innerHTML = `<div class="rts-cards" id="rts-cards" role="listbox" aria-label="選んだ部隊"></div>
      <div class="rts-forms" id="rts-forms" role="group" aria-label="構え（陣形）"></div>
      <div class="rts-row" id="rts-ord" role="group" aria-label="下知"></div>
      <div class="rts-row"><button type="button" id="rts-multi" aria-pressed="false">複数選び</button></div>`;
    document.body.appendChild(el);
    this.rtsEl = el;
    this.rtsOrdKey = ''; this.rtsCardKey = ''; this.rtsFormOpen = false;
    $('rts-ord').addEventListener('click', (e) => {
      const t = e.target.closest('[data-ord]'); if (!t || t.disabled) return;
      const id = t.dataset.ord;
      const b = this.rt;
      if (id === 'form') { this.rtsFormOpen = !this.rtsFormOpen; this.rtsOrdKey = ''; return; }
      if (id === 'move' || id === 'attack') {
        rtsSetPick(b, rtsPick(b) === id ? null : id);
        this.flash(id === 'move' ? '地図を押して行き先を指す' : '敵の隊を押す', 'dim');
        this.rtsOrdKey = '';
        return;
      }
      this.rtsFormOpen = false;
      rtsOrder(b, id, {});
    });
    $('rts-forms').addEventListener('click', (e) => {
      const t = e.target.closest('[data-form]'); if (!t || t.disabled) return;
      this.rtsFormOpen = false; this.rtsOrdKey = '';
      rtsOrder(this.rt, 'form', { f: t.dataset.form });
    });
    $('rts-multi').addEventListener('click', () => {
      const on = !rtsMultiOn(this.rt);
      rtsSetMulti(this.rt, on);
      this.rtsOrdKey = '';
    });
  }

  updateRts(rt) {
    if (!this.rtsEl) this.buildRtsDock();
    this.rtsEl.hidden = false;
    const sel = this.rtsSelected || (this.rtsSelected = new Set()); sel.clear();
    for (const o of rtsSelection(rt)) sel.add(o);
    const list = rtsCollect(rt);
    const own = this.rtsOwn || (this.rtsOwn = []); own.length = 0;
    for (const e of list) if (sel.has(e.o)) own.push(e);
    // 隊の札：家紋・兵数・士気の帯
    let cardsHtml = '';
    for (const e of own) {
      const mc = e.m > 60 ? 'hi' : e.m > 30 ? 'md' : 'lo';
      const ok = rtsCanCommand(rt, e.o);
      if (!ok) {
        cardsHtml += `<div class="rts-card off" role="img" aria-label="${esc(e.name)}。下知できない（身分が足りない）" title="下知できない（身分が足りない）">` +
          `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
          `<small>下知<br>できない</small></div>`;
        continue;
      }
      cardsHtml += `<div class="rts-card" role="img" aria-label="${esc(e.name)}。${numberHint(e.n)}">` +
        `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
        `</div>`;
    }
    if (!own.length) cardsHtml = '<p class="rts-none">隊を押して選ぶ（長押しで囲む・複数選びで足す）</p>';
    if (cardsHtml !== this.rtsCardKey) {
      this.rtsCardKey = cardsHtml;
      const box = $('rts-cards');
      box.innerHTML = cardsHtml;
      for (const c of box.querySelectorAll('canvas[data-mon]')) c.getContext('2d').drawImage(monIcon(c.dataset.mon), 0, 0, 24, 24);
    }
    // 下知の釦（choose した物、かつ身分で動かせる物がある時だけ押せる）
    const pick = rtsPick(rt), multi = rtsMultiOn(rt);
    const cmdable = this.rtsCommandable || (this.rtsCommandable = []); cmdable.length = 0;
    for (const e of own) if (rtsCanCommand(rt, e.o)) cmdable.push(e);
    const hasGun = cmdable.some((e) => e.real && e.o.units.some((u) => u.alive && (u.type === 'gun' || u.type === 'bow')));
    let ordHtml = '';
    for (const o of RTS_ORDERS) {
      const ok = cmdable.length && (o.id !== 'fire' || hasGun);
      const on = (o.id === 'form' && this.rtsFormOpen) || (o.id === pick);
      ordHtml += `<button type="button" data-ord="${o.id}" ${ok ? '' : 'disabled'} class="${on ? 'on' : ''}" aria-pressed="${on}" title="${o.note}">${rtsIcon(o.ic)}<span class="lb">${o.label}</span></button>`;
    }
    const cur = own.length === 1 && own[0].real ? own[0].o.formation : null;
    let formHtml = '';
    for (const f of RTS_FORMS) formHtml += `<button type="button" data-form="${f.f}" class="${cur === f.f ? 'on' : ''}" aria-pressed="${cur === f.f}" title="${f.note}">${rtsIcon(f.ic)}<span class="lb">${f.label}</span></button>`;
    const key = ordHtml + formHtml + this.rtsFormOpen + multi;
    if (key !== this.rtsOrdKey) {
      this.rtsOrdKey = key;
      $('rts-ord').innerHTML = ordHtml;
      $('rts-forms').innerHTML = formHtml;
      $('rts-forms').classList.toggle('open', this.rtsFormOpen);
      const mb = $('rts-multi'); mb.setAttribute('aria-pressed', String(multi)); mb.classList.toggle('on', multi);
    }
  }

  hideRts() { if (this.rtsEl) this.rtsEl.hidden = true; }
}
