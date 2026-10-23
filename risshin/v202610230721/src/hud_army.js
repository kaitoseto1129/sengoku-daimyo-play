import { famousPerson } from "./battle_welcome.js";
import { S } from "./settings.js";
import { $, setStyle, esc, setHtml, setText, ENEMY_MON } from "./hud_common.js";
import { helpSeen, firstHelp } from "./first_help.js";
import { FL } from "./floors.js";
import { simpleControls } from "./simple_controls.js";
import { CAPTURE, GATE_STATE } from "./nawabari.js";
import { sightRef, numberHint, sightScreenUnit, sightArmyMesh } from "./battle_sight.js";
import { VIEW } from "./viewport.js";
import { drawMon } from "./textures.js";

export class HudArmy {


  // 小地図・部隊札・手ほどきは画質によらず一コマ一仕事。「高」の道しるべは毎コマ動かす。
  // 待っている仕事は期限を戻さず、次のコマへ持ち越す。順に選んで取り残さない。
  // 体力・任務・危険の印と、兵の動きや当たりの更新はこの待ち順に入れない。
  periodicReady(dt) {
    this.mmT = (this.mmT || 0) - dt;
    this.unitsT = (this.unitsT || 0) - dt;
    this.firstHelpT = (this.firstHelpT || 0) - dt;
    this.peopleT = (this.peopleT || 0) - dt;
    this._armyT = (this._armyT || 0) - dt;
    const units = this.rt.army.units;
    // 増援・戦の切り替えはそのコマに拾い、札の登場を遅らせない。
    if (this.peopleRt !== this.rt || this.peopleUnits !== units || this.peopleCount !== units.length) return 16 | 8;
    const due = (this.mmT <= 0 ? 1 : 0) | (this.unitsT <= 0 ? 2 : 0) |
      (this.firstHelpT <= 0 ? 4 : 0) | (this.peopleT <= 0 ? 16 : 0) | (this._armyT <= 0 ? 32 : 0) |
      (!this.rt._terrainHints && this.rt.world && typeof this.rt.world.heightAt === 'function' ? 64 : 0);
    const start = this.periodicNext || 0;
    for (let i = 0; i < 6; i++) {
      const job = (start + i) % 6, bit = job < 3 ? 1 << job : 1 << (job + 1);
      if (!(due & bit)) continue;
      this.periodicNext = (job + 1) % 6;
      return bit | 8;
    }
    return 8;
  }


  // 名乗りは全兵を残し、敵将の札の候補は画面内だけ五回／秒で集める。
  preparePeople(rt) {
    this.peopleRt = rt; this.peopleUnits = rt.army.units; this.peopleCount = rt.army.units.length;
    this.peopleT = 0.2;
    const people = this.peopleCandidates || (this.peopleCandidates = []);
    const bosses = this.bossCandidates || (this.bossCandidates = []);
    const offscreen = this.bossOffscreen || (this.bossOffscreen = []);
    const names = this.peopleNames || (this.peopleNames = new Map());
    people.length = 0; bosses.length = 0; offscreen.length = 0;
    for (const unit of rt.army.units) {
      if (unit.name) {
        if (!names.has(unit.name)) names.set(unit.name, famousPerson(unit.name));
        if (names.get(unit.name)) people.push(unit);
      }
      if (unit.type === 'busho' || unit.type === 'samurai' && unit.name) {
        if (unit.offscreen) offscreen.push(unit); else bosses.push(unit);
      }
    }
  }


  // 初めて使える遊びの一言。既存の札を使い、半秒に一度だけ見る。
  newPlayHelp(rt, it) {
    if (!S.hints || rt.over || rt.ended || !rt.player.u.alive || rt.def.town || rt.tut || rt.tutPause || this.hintCur || this.tutCur ||
      !$('intro').hidden || !$('choice').hidden || this.bannerT > 0 || this.bigmap || !this.notices.room(10)) return;
    let id = '';
    if (it && /梯子.*登/.test(it.label) && !helpSeen('ladder')) id = 'ladder';
    else if (it && /旗/.test(it.label) && !helpSeen('flag')) id = 'flag';
    else if (!helpSeen('order')) {
      for (const o of rt.objectives) if (!o.state && (o.kind === 'order' || /下知/.test(o.text))) { id = 'order'; break; }
    }
    if (!id && rt.player.canRide && !helpSeen('ride')) id = 'ride';
    if (!id && rt.player.weapon === 'gun' && !helpSeen('gun')) id = 'gun';
    const pos = rt.player.u.pos;
    if (!id && !helpSeen('ladder')) {
      for (const l of FL.ladders) if (l.hp > 0 && l.placed !== false && (l.team == null || l.team === rt.player.u.team) &&
        Math.abs(pos.y - l.y0) < 3 && Math.hypot(l.x - pos.x, l.z - pos.z) < 8) { id = 'ladder'; break; }
    }
    if (!id && !helpSeen('flag')) {
      for (const g of rt.army.groups) if (g.team === rt.player.u.team && g.count > 0 && g.stds && g.stds.length) {
        const st = g.stds[0];
        const carrier = st.userData.carrier;
        const at = carrier && carrier.alive ? carrier.pos : st.parent === rt.scene ? st.position : null;
        if (at && st.visible && Math.hypot(at.x - pos.x, at.z - pos.z) < 25) { id = 'flag'; break; }
      }
    }
    if (!id && S.hudMinimap !== false && !this.root.classList.contains('novice') && !helpSeen('map')) id = 'map';
    if (id) this.playHelp(id);
  }


  playHelp(id) {
    if (simpleControls(this.rt) && ['map', 'ride', 'gun'].includes(id)) return false;
    if (!S.hints || this.hintCur || this.tutCur || !$('intro').hidden || !$('choice').hidden || this.bannerT > 0 ||
      this.bigmap || this.root.hidden || this.root.classList.contains('photo') || !this.notices.room(10)) return false;
    return firstHelp(id, (text) => {
      this.hint(text, '', 6500);
      this.notices.sync();
      if (this.notices.visible('tutorial')) return true;
      clearTimeout(this.hintTimer); this.hintCur = null; this.drawCard();
      return false;
    });
  }


  // 両軍の兵力と陣太鼓時計、年月日
  // 束32：制圧の札（主要地点だけ。曲輪・大手門・搦手門・主な櫓。多くて6つ）。画面の端に一列の短い札。
  // 変わった時だけ6秒強く見せ、普段は薄く。rt.nawabari（K）が無い戦は何も出さない
  updateSiegeCards(rt) {
    const K = rt.nawabari;
    if (!K || !K.kuruwa || rt.over || rt.ended || rt.def.noSiegeCards) { if (this._scEl) { this._scEl.hidden = true; setStyle(this._scEl, 'display', 'none'); } return; }
    if (!this._scEl) {
      const d = document.createElement('div');
      d.id = 'siegecards';
      d.style.cssText = 'position:fixed;right:calc(10px + env(safe-area-inset-right,0px));top:calc(84px + env(safe-area-inset-top,0px));z-index:12;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:150px;';
      document.body.appendChild(d);
      this._scEl = d; this._scState = new Map();
    }
    const CAP_WORD = { [CAPTURE.FRIEND]: '味方', [CAPTURE.ENEMY]: '敵', [CAPTURE.CONTESTED]: '交戦中', [CAPTURE.EMPTY]: '空き' };
    const GATE_WORD = { [GATE_STATE.OPEN]: '開', [GATE_STATE.BROKEN]: '破れ', [GATE_STATE.CLOSED]: '閉', [GATE_STATE.BARRED]: '閂' };
    const items = [];
    for (const ku of Object.values(K.kuruwa)) { const b = ku._box; const p = b && { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; items.push({ id: `k_${ku.id}`, name: ku.name, word: p && sightRef(rt, ku, p) ? CAP_WORD[ku.captureState] || '' : '様子不明', pri: ku.kind === 'hon' ? 0 : 2 }); }
    for (const gt of Object.values(K.gates || {})) if (gt.role) items.push({ id: `g_${gt.id}`, name: gt.name, word: gt.at && sightRef(rt, gt, gt.at) ? GATE_WORD[gt.state] || '' : '様子不明', pri: 1 });
    items.sort((a, b) => a.pri - b.pri);
    const top = this.siegeTop || (this.siegeTop = []); top.length = 0;
    let unknownCount = 0;
    for (let i = 0; i < Math.min(3, items.length); i++) {
      const it = items[i];
      if (it.word === '様子不明') unknownCount++; else top.push(it);
    }
    if (unknownCount) {
      const unknown = this.siegeUnknown || (this.siegeUnknown = { id: 'unknown', name: '', word: '様子不明' });
      unknown.name = `未見${unknownCount}か所`; top.push(unknown);
    }
    const now = rt.t || 0, rm = S.reduceMotion;
    this._scEl.hidden = !top.length; setStyle(this._scEl, 'display', top.length ? 'flex' : 'none');
    // 任務の札（#objectives）の下から並べる（札が長くなっても重ならないように）
    { const ob = document.getElementById('objectives'), r = ob && !ob.hidden ? ob.getBoundingClientRect() : null; const mm = document.getElementById('minimap'), mr = mm && mm.offsetParent ? mm.getBoundingClientRect() : null; const lowH = VIEW.h <= 500 && mr && mr.height > 0;
      // 低い画面（携帯横）：小地図の下に並べると下の操作の帯（狙い・回避）に重なるので、小地図の左に並べる（10/2 稲葉山）
      const bot = lowH ? Math.max(r && r.height > 0 ? r.bottom + 6 : 0, mr.top) : Math.max(r && r.height > 0 ? r.bottom : 0, mr && mr.height > 0 ? mr.bottom : 0) + 6; const want = Math.max(84, Math.round(bot)); const right = lowH ? Math.round(VIEW.w - mr.left + 8) : 10;
      if (this._scTop !== want) { this._scTop = want; setStyle(this._scEl, 'top', want + 'px'); }
      if (this._scRight !== right) { this._scRight = right; this._scEl.style.right = right + 'px'; } }
    const low = VIEW.h <= 500;   // 低い画面は、変わった札だけ（常に並べると小地図・丸釦に掛かる）
    let html = '';
    for (const it of top) {
      const prev = this._scState.get(it.id);
      if (!prev || prev.word !== it.word) this._scState.set(it.id, { word: it.word, t: now });
      const rec = this._scState.get(it.id);
      const strong = now - rec.t < 6;
      if (low && !strong) continue;
      const bg = it.word === '味方' ? 'rgba(74,122,99,.9)' : it.word === '敵' ? 'rgba(178,51,31,.9)' : it.word === '交戦中' ? 'rgba(194,150,30,.9)' : 'rgba(60,56,48,.75)';
      html += `<div style="padding:4px 6px;font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff5ea;background:${bg};opacity:1;border-radius:3px;${rm ? '' : 'transition:opacity .4s;'}">${esc(it.name)}　${esc(it.word)}</div>`;
    }
    setHtml(this._scEl, html);
  }


  updateArmy(rt) {
    const sides = rt.def.sides;
    const ab = $('armybar');
    if (!sides || rt.def.hideArmyPeek) { ab.hidden = true; this.armyScan = null; this._armyT = 0.5; return; }
    // 数えかけの値は表示しない。入れ物は次の集計でも使い回す。
    let work = this.armyScan;
    if (!work) work = this.armyScan = { rt: null, units: null, active: false, stage: 0, i: 0, a: 0, b: 0, part: 0, n: 0, left: 0 };
    if (!work.active || work.rt !== rt || work.units !== rt.army.units) {
      work.rt = rt; work.units = rt.army.units; work.active = true;
      work.stage = work.i = work.a = work.b = work.part = work.n = 0;
    }
    // 他の定期仕事と同じ待ち順で続ける。遠景も束の中まで地点数で分ける。
    this._armyT = 0;
    if (!this.countArmyStep(rt, work)) return;
    work.active = false;
    // 遅い端末でも完了直後に集計し直し続けない。
    this._armyT = 0.5;
    const a = work.a, b = work.b;
    if (!rt.armyInit) {
      rt.armyInit = { a: 0, b: 0 };
    }
    rt.armyInit.a = Math.max(rt.armyInit.a, a);
    rt.armyInit.b = Math.max(rt.armyInit.b, b);
    // 経過の札は段の切り替えでも戻さず、新しい戦の初めだけ零にする。
    const t = this.armyClock = Math.max(this.armyClock || 0, Math.floor(rt.t));
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const key = `${a}|${b}|${clock}|${rt.flags.ek || 0}|${rt.flags.ak || 0}`;
    this.lastA = a; this.lastB = b;
    if (key === this.armyKey) return;
    const first = !this.armyKey;
    this.armyKey = key;
    ab.hidden = false;
    if (first) {
      // 狭い画面では軍の名を短く（「織田・徳川軍」→「織田軍」）して、二行に折れないように
      //   長い名（「延暦寺の僧兵・浅井朝倉の残党」）は「・」の前だけに。それでも入らなければ末尾を「…」に（隣の数と重ならないように）
      const sn = (n) => { n = n.replace(/（[^）]*）/g, ''); if (VIEW.w >= 1000) return n; n = n.replace(/・[^・]*軍$/, '軍'); return n.length > 8 && n.includes('・') ? n.split('・')[0] : n; };
      ab.innerHTML = `<div class="side a"><div class="nm"><canvas width="44" height="44" data-m="${sides.a.mon}"></canvas><span class="n">${(rt.def.key === 'moribe' || rt.def.key === 'okehazama') ? '' : esc(sn(sides.a.name))}</span><small id="ab-a"></small></div><div class="gauge"><s id="ab-sa"></s><b id="ab-ga"></b></div></div>
        <div class="clock"><span id="ab-c"></span><small>経過</small></div>
        <div class="side b"><div class="nm"><small id="ab-b"></small><span class="n">${(rt.def.key === 'moribe' || rt.def.key === 'okehazama') ? '' : esc(sn(sides.b.name))}</span><canvas width="44" height="44" data-m="${sides.b.mon}"></canvas></div><div class="gauge"><s id="ab-sb"></s><b id="ab-gb"></b></div></div>`;
      ab.querySelectorAll('canvas[data-m]').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore();
        if (c.closest('.side.b')) { g.strokeStyle = '#d0281c'; g.lineWidth = 4; g.strokeRect(2, 2, 40, 40); } });
      $('dateline').textContent = rt.def.date ? rt.def.date(rt) : '';
      this.fitDate();
    }
    this.lastA = a; this.lastB = b;
    // 総勢・残数・兵力比は武者の目には分からない。目に入る兵の気配だけ。
    // 残りの人数は数で（kaito 10/23 稲生 21）。戦の定義に force があれば両軍の残り、無ければ目に入る兵の数。
    const f = rt.def.force?.(rt), fmt = (n) => `${Math.max(0, Math.round(n)).toLocaleString('ja-JP')}人`;
    // 両軍の人数は数の字でなく、減っていくゲージで（kaito 10/23 稲生 47）。長さは多い方の初めの人数を満ちとする。
    const full = f ? Math.max(1, f.a0 || f.a, f.b0 || f.b) : 1;
    const ga = f ? Math.max(0, Math.min(100, f.a / full * 100)) : 0, gb = f ? Math.max(0, Math.min(100, f.b / full * 100)) : 0;
    setText($('ab-a'), ''); setText($('ab-b'), '');
    $('ab-a').parentElement.setAttribute('aria-label', f ? `${sides.a.name} 残り${fmt(f.a)}` : sides.a.name);
    $('ab-b').parentElement.setAttribute('aria-label', f ? `${sides.b.name} 残り${fmt(f.b)}` : sides.b.name);
    const pa = a ? 50 : 0, pb = b ? 50 : 0;
    $('ab-ga').parentElement.hidden = !f;
    $('ab-gb').parentElement.hidden = !f;
    if (f) { $('ab-ga').style.width = ga.toFixed(1) + '%'; $('ab-gb').style.width = gb.toFixed(1) + '%'; }
    this.armyPct = { a: pa, b: pb };
    const lp = this.armyPeekAt || (this.armyPeekAt = { a: pa, b: pb });
    if (Math.abs(lp.a - pa) >= 4 || Math.abs(lp.b - pb) >= 4) { this.armyPeekAt = { a: pa, b: pb }; this.peekArmy(4); }
    setText($('ab-c'), clock);
    if (t % 5 === 0 && rt.def.date) { const d = rt.def.date(rt); if ($('dateline').textContent !== d) { $('dateline').textContent = d; this.fitDate(); } }
  }


  // 見通しだけを分割する。兵の判断・攻撃・描く人数には触れない。
  countArmyStep(rt, work) {
    const sides = rt.def.sides;
    if (work.stage === 0) {
      const end = Math.min(work.i + 24, rt.army.units.length);
      for (; work.i < end; work.i++) {
        const u = rt.army.units[work.i];
        if (u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.noTarget) continue;
        if (!u.alive || u.gone) continue;
        // 背後や画面外でも、三十メートル以内の実兵は近くの気配に含める。
        const dx = u.pos.x - rt.player.u.pos.x, dz = u.pos.z - rt.player.u.pos.z;
        const nearby = dx * dx + dz * dz <= 30 * 30;
        if (nearby || sightScreenUnit(rt, u)) { if (u.team === 0) work.a++; else work.b++; }
      }
      if (work.i < rt.army.units.length) return false;
      work.stage = 1; work.i = 0;
      return false;
    }
    // 体・後詰め・幟を合わせて一度に24地点まで。数えかけの備えも持ち越す。
    work.left = 24;
    if (work.stage === 1) {
      const armies = rt.world.armies;
      while (work.i < (armies?.length || 0)) {
        const A = armies[work.i];
        if (A.mesh?.visible) {
          if (!this.countArmyParts(rt, work, A.body, null, A.host?.meshes[0], A.parts?.banners, A.host?.meshes[2], A.U, false)) return false;
          const team = A.team ?? (A.mon === sides.b.mon ? 1 : A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0);
          if (team === 0) work.a += work.n; else work.b += work.n;
        }
        work.i++; work.part = work.n = 0;
        if (work.left <= 0) return false;
      }
      work.stage = 2; work.i = 0;
    }
    const clashes = rt.world.clashes;
    while (work.i < (clashes?.length || 0) * 2) {
      const i = work.i % 2, C = clashes[Math.floor(work.i / 2)], D = i ? C.B : C.A;
      if (C.blocks && C.mesh?.visible && D?.alive && !D.P.hidden) {
        if (!this.countArmyParts(rt, work, D.meshes.bodyN, D.meshes.bodyF, D.host?.g.children[0], D.meshes.banners, D.host?.g.children[2], D.U, true, D.host?.U)) return false;
        if ((D.P.team ?? i) === 0) work.a += work.n; else work.b += work.n;
      }
      work.i++; work.part = work.n = 0;
      if (work.left <= 0) return false;
    }
    return true;
  }


  countArmyParts(rt, work, near, far, host, banners, hostBanners, U, clash, hostU = U) {
    while (work.part < 5) {
      // 体が見えなかった時だけ幟を見る。部品の配列を毎回作らない。
      if (work.part >= 3 && work.n) return true;
      const part = work.part;
      const mesh = part === 0 ? near : part === 1 ? far : part === 2 ? host : part === 3 ? banners : hostBanners;
      const n = sightArmyMesh(rt, mesh, part === 2 || part === 4 ? hostU : U, clash && part !== 2 && part !== 4, work);
      if (n < 0) return false;
      work.n += n; work.part++;
    }
    return true;
  }


  // 兵力の帯を t 秒だけ出す（形勢が変わった・大きく減った）
  peekArmy(t = 4) { this.armyPeekT = Math.max(this.armyPeekT || 0, t); }


  // 右上の日付が、兵力の帯（敵の名前）に重なる時は、帯の下まで一段下げる
  fitDate() {
    const d = $('dateline'), ab = $('armybar');
    if (!d || !ab) return;
    if (!this.fitDateOn) { this.fitDateOn = true; addEventListener('resize', () => this.fitDate()); document.fonts?.ready.then(() => this.fitDate()); }
    d.style.marginTop = '';
    if (ab.hidden || !d.offsetParent) return;
    const r = d.getBoundingClientRect(), q = ab.getBoundingClientRect();
    if (r.width && r.left < q.right + 8 && r.top < q.bottom && r.bottom > q.top) d.style.marginTop = `${Math.ceil(q.bottom - r.top + 4)}px`;
  }


  // 兵力の帯：減った分を白く残し、1秒ほど待ってから追いつかせる（一斉射撃でどれだけ減ったか見える）
  updateArmyGhost(dt) {
    const P = this.armyPct;
    if (!P) return;
    const G = this.armyGhost = this.armyGhost || { a: P.a, b: P.b, wa: 0, wb: 0 };
    for (let i = 0; i < 2; i++) {
      const k = i ? 'b' : 'a', w = 'w' + k;
      if (P[k] >= G[k]) { G[k] = P[k]; G[w] = 0; } else {
        G[w] += dt;
        if (G[w] > 1) G[k] = Math.max(P[k], G[k] - dt * 12);
      }
      const el = $('ab-s' + k);
      if (el) setStyle(el, 'width', G[k] + '%');
    }
  }
}
