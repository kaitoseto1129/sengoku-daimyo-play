import { VIEW } from "./viewport.js";
import { setStyle, $, fieldLabel, setClass, dismountFirst, recovering, singleBattleGuide, guidanceEnded, retreatRequired, taskLabel, groundFlag, setHidden, destinationDistance, leanHud, esc } from "./hud_common.js";
import { markerName, navigationEnemy, currentObjective } from "./mission_guide.js";
import { S } from "./settings.js";
import { isTouch } from "./touch.js";
import { sightRef } from "./battle_sight.js";

export class HudMarkers {


  project(p, y, rt, result) {
    this.tmpV.set(p.x, y, p.z).project(rt.camera);
    const out = result || {};
    out.x = (this.tmpV.x * .5 + .5) * VIEW.w;
    out.y = (-this.tmpV.y * .5 + .5) * VIEW.h;
    out.behind = this.tmpV.z < -1 || this.tmpV.z > 1;
    return out;
  }


  // HUD の札が占める四角（任務の印をその上に置かない）。0.25 秒ごとに測り直す
  hudRects() {
    const now = performance.now();
    if (this.rectsT && now - this.rectsT < 250) return this.rects;
    this.rectsT = now;
    this.rects = [];
    this.noticeRect = null;
    this.healthRect = null;
    this.workPromptRect = null;
    this.guideOrderRect = null; this.guardButtonRect = null;
    let squadRect = null;
    for (const sel of ['.hold-cover', '#wait-guard', '#wait-guard span', '#wait-guard small', '#sonae-cards', '#battle-notices', '#battle-log-entry', '#objectives', '#minimap', '#maphint', '.bl', '.tl .plaque', '.tl .next', '#h-prog', '#toasts', '#armybar', '#compass', '#h-bottom', '#h-squad', '#tutorial', '#h-units', '#skiphint', '#boss', '#target', '#subtitle', '#bark', '#choice', '#banner.show', '#prompt']) {
      const el = sel === '#sonae-cards' ? document.getElementById('sonae-cards') : this.root.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      // 今は消している札（平時の兵力の帯など）は避けなくてよい
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        this.rects.push(r);
        if (sel === '#battle-notices') this.noticeRect = r;
        if (sel === '.bl') this.healthRect = r;
        if (sel === '#prompt' && el.classList.contains('work-action')) this.workPromptRect = r;
        if (sel === '#h-squad') squadRect = r;
        if (sel === '#objectives' && !el.classList.contains('expand')) this.guideOrderRect = r;
      }
      // 折り返した兵力の字は、帯の箱からはみ出す時も実寸で避ける。
      if (sel === '#armybar') for (const side of el.querySelectorAll('.side')) {
        const sr = side.getBoundingClientRect();
        if (sr.width > 0 && sr.height > 0) this.rects.push(sr);
      }
    }
    // 寺の狭い間でも、間合いの札と気力の字の場所を先に空ける。
    if (this.rt.def.reserveCombatCues || this.guardAlly) for (const sel of ['#crosshair', '#crosshair .range-cue', '#staring', '.combat-cue-label']) {
      const el = this.root.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.rects.push(r);
    }
    // 指の端末の丸（右下の突く・構え…と左上の止める・地図）も避ける
    for (const el of document.querySelectorAll('#tc:not([hidden]) .tb:not([hidden])')) {
      let r = el.getBoundingClientRect();
      // 手当てが組の字を覆う時だけ上へ逃がす。長押しの輪の分も空ける。
      if (el.dataset.b === 'treat' && squadRect && r.left < squadRect.right && r.right > squadRect.left &&
          r.top < squadRect.bottom && r.bottom > squadRect.top) {
        const top = squadRect.top - r.height - 16;
        if (top >= 8) setStyle(el, 'top', top + 'px');
        else setStyle(el, 'left', (squadRect.right + 16) + 'px');
        // 頭上の印も、移した後の釦を避ける。
        r = el.getBoundingClientRect();
      }
      if (r.width > 0) {
        this.rects.push(r);
        if (el.dataset.b === 'grd') this.guardButtonRect = r;
      }
    }
    // 道しるべの名札（rt.markers・例：「組頭 源八」）も避ける。ここを外すと、道しるべの名と
    // 頭上の名が同じ人に二つ並んでしまう（戦の始まりに名札が二重に出る不具合）
    // （印どうしは updateMarkers の placed で離すので、印が避ける札には入れない。入れると自分の前の位置を避けて、印が 1 秒に何度も左右へ跳ねていた。10/2）
    this.mkRects = [];
    for (const el of document.querySelectorAll('#markers .mk')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) this.mkRects.push(r);
    }
    this.rectsAll = this.rects.concat(this.mkRects);
    return this.rects;
  }


  // 印（x を中心に、y から上へ伸びる箱）が札に重ならない所を探す。
  // axis：'v' なら上下にだけ、'h' なら左右にだけ動かす（画面の端に寄せた印は端に沿って滑らせる）
  avoidRects(x, y, W, H, axis, extra = null, hw = 37, height = 0, hideIfFull = false) {
    const mw = hw * 2, mh = height || (extra ? 58 : 50), rects = extra && extra.length ? this.hudRects().concat(extra) : this.hudRects();
    const free = (a, b) => a - hw > 6 && a + hw < W - 6 && b - mh > 6 && b < H - 8 && rects.every((r) => a + mw / 2 < r.left || a - mw / 2 > r.right || b < r.top || b - mh > r.bottom);
    if (free(x, y)) return [x, y];
    for (let k = 1; k <= 40; k++) {
      const d = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (axis !== 'h' && free(x, y + d)) return [x, y + d];
      if (axis !== 'v' && free(x + d, y)) return [x + d, y];
    }
    // 決めた向きだけでは空きが無い時（後ろの印が下の字幕の帯に並ぶ時など）は、斜めにも探す（重ねたままにしない）
    if (extra) for (let k = 1; k <= 12; k++) for (const dx of [0, -1, 1]) { const a = x + dx * k * 40, b = y - k * 20; if (free(a, b)) return [a, b]; }
    return hideIfFull ? null : [x, y];
  }


  // 敵勢を追い続ける方角の札は出さない。
  lullCue(rt) {
    const el = $('lullcue');
    if (el) el.hidden = true;
  }

  // 目印に最も近い味方の実物の布を拾い、同じ投影用の入れ物を使い回す。
  goalFlagBounds(rt, marker, pos) {
    if (rt.def.footFlagGuides) {
      this.goalFlag = null; this.goalFlagFoot = null; this.goalFlagOwner = null;
      return null;
    }
    // 足元だけで案内する戦では、実物の旗を囲む別の輪を重ねない。
    if (rt.def.groundFlagGuides && !marker.guideFlag && !marker.guideFlagFrame && !marker.guideFlagMesh) { this.goalFlagFoot = null; return null; }
    const explicit = marker.guideFlagMesh?.();
    // 指定された旗が消えても、隣の隊旗へ目当てを乗り換えない。
    if (marker.guideFlagMesh && !explicit?.visible) {
      this.goalFlag = null; this.goalFlagFoot = null; this.goalFlagOwner = null;
      return null;
    }
    if (explicit?.visible) {
      this.flagRt = rt; this.flagMarker = marker; this.flagScanAt = rt.t;
      this.goalFlag = explicit;
      this.goalFlagFoot = pos;
    } else if (this.flagRt !== rt || this.flagMarker !== marker || rt.t >= this.flagScanAt &&
        (!this.goalFlagOwner?.alive || this.goalFlagOwner.gone || !this.goalFlag?.visible ||
          Math.hypot(pos.x - this.flagGoalX, pos.z - this.flagGoalZ) > 4)) {
      this.flagRt = rt; this.flagMarker = marker; this.flagScanAt = rt.t + .5;
      this.goalFlag = null; this.goalFlagFoot = null; this.goalFlagOwner = null;
      this.flagGoalX = pos.x; this.flagGoalZ = pos.z;
      let best = marker.guideFlag ? 24 * 24 : 144;
      for (const group of rt.army.groups) {
        if (group.team !== rt.player.u.team) continue;
        if (marker.group && group !== marker.group) continue;
        for (const standard of group.stds || []) {
          const carrier = standard.userData.carrier, data = standard.userData.std;
          if (!carrier?.alive || data?.down || !standard.visible || !data?.cloth) continue;
          const d = (carrier.pos.x - pos.x) ** 2 + (carrier.pos.z - pos.z) ** 2;
          if (d < best) { best = d; this.goalFlag = data.cloth; this.goalFlagFoot = carrier.pos; this.goalFlagOwner = carrier; }
        }
      }
      // 組の隊旗を優先し、そばの兵の小さな指物へ囲みを移さない。
      if (!this.goalFlag) for (const unit of rt.army.units) {
        if (marker.group && !marker.group.units.includes(unit)) continue;
        if (!unit.alive || unit.gone || unit.team !== rt.player.u.team || !unit.flag?.visible || unit.flag.userData.groundDetached) continue;
        const d = (unit.pos.x - pos.x) ** 2 + (unit.pos.z - pos.z) ** 2;
        if (d < best) { best = d; this.goalFlag = unit.flag; this.goalFlagFoot = unit.pos; this.goalFlagOwner = unit; }
      }
    }
    const flag = this.goalFlag;
    if (!flag?.visible || !flag.geometry) return null;
    if (rt.def.visibleFlagGuides) {
      // 布自身が見える設定でも、親の人や隊旗が隠れていれば枠を残さない。
      for (let part = flag; part; part = part.parent) if (!part.visible) return null;
      if (!explicit && (!this.goalFlagOwner?.alive || this.goalFlagOwner.gone || this.goalFlagOwner.camHidden)) return null;
    }
    const geometry = flag.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    flag.updateWorldMatrix(true, false);
    if (rt.def.visibleFlagGuides) {
      const point = this.flagSightPoint || (this.flagSightPoint = { x: 0, y: 0, z: 0 });
      this.tmpV.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2,
        (box.min.z + box.max.z) / 2).applyMatrix4(flag.matrixWorld);
      point.x = this.tmpV.x; point.y = this.tmpV.y; point.z = this.tmpV.z;
      if (!this.friendlyGuideVisible(rt, point)) return null;
    }
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.tmpV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyMatrix4(flag.matrixWorld).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const result = this.flagBounds || (this.flagBounds = {});
    const minimum = marker.guideFlagFrame || marker.guideFlagMesh ? 24 : 44;
    result.width = Math.max(minimum, right - left + 16); result.height = Math.max(minimum, bottom - top + 16);
    result.left = (left + right - result.width) / 2; result.top = (top + bottom - result.height) / 2;
    return result;
  }

  // 近い三つは全件の配列と並べ替えを作らず、同距離なら元の順を保って選ぶ。
  prepareMarkerNames(rt, main) {
    // 同じ名の行き先は最寄りだけを名札にし、ほかは小さな印にする。
    const nearestNames = this.nearestMarkerNames || (this.nearestMarkerNames = new Map());
    const nameCounts = this.markerNameCounts || (this.markerNameCounts = new Map());
    nearestNames.clear(); nameCounts.clear();
    const pu = rt.player.u.pos;
    for (const m of rt.markers) {
      const q = typeof m.pos === 'function' ? m.pos() : m.pos, name = fieldLabel(markerName(m));
      if (!name || !q || !Number.isFinite(q.x) || !Number.isFinite(q.z) || m.person || m.red || m.intelHidden || (m.group && m.group.team !== 0)) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      if (m.hideNear && d < m.hideNear) continue;
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      const prev = nearestNames.get(name);
      if (!prev || d < prev._hudNameDistance) { m._hudNameDistance = d; nearestNames.set(name, m); }
    }
    const near3 = this.nearMarkerNames || (this.nearMarkerNames = new Set());
    near3.clear();
    if (rt.markers.length > 4) {
      let a = null, b = null, c = null, da = Infinity, db = Infinity, dc = Infinity;
      for (const m of rt.markers) {
        const q = typeof m.pos === 'function' ? m.pos() : m.pos;
        if (!q || m === main || m.person) continue;
        const d = Math.hypot(q.x - pu.x, q.z - pu.z);
        if (d < da) { c = b; dc = db; b = a; db = da; a = m; da = d; }
        else if (d < db) { c = b; dc = db; b = m; db = d; }
        else if (d < dc) { c = m; dc = d; }
      }
      if (a) near3.add(a);
      if (b) near3.add(b);
      if (c) near3.add(c);
    }
  }

  updateMarkers(rt) {
    const W = VIEW.w, H = VIEW.h;
    setClass(this.root, 'flag-guide', false);
    // 端の案内の表示状態は描画側で更新する。ここで戻すと任務札が二重になる。
    const seen = this.markerSeen || (this.markerSeen = new Set());
    const placed = this.markerPlaced || (this.markerPlaced = []);
    seen.clear(); placed.length = 0;
    // 地面の矢印と同じ行き先を、画面の端でも示す。
    const posOf = (m) => (typeof m.pos === 'function' ? m.pos() : m.pos);
    if (this.retreatGuide?.active && this.retreatGuide.valid || dismountFirst(rt) || recovering(rt) || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive || this.defendEnemy?.alive || navigationEnemy(rt) || singleBattleGuide(rt) && rt.guideEnemy?.alive || this.root.classList.contains('wait-guard-active') || guidanceEnded(rt) || rt.dodgeGuide || this.guardAlly || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive || retreatRequired(rt)) {
      for (const el of this.markerEls.values()) el.hidden = true;
      return;
    }
    const main = S.reduceGuidance || rt.missionGuide?.objective !== currentObjective(rt) ? null : rt.missionGuide?.marker || null;
    const compact = isTouch && H <= 500 && !rt.def.town && !rt.def.dojo;
    const operation = !!rt.touchCoachActive || !!rt.nearestInteract() || (!rt.def.town && !rt.def.dojo && (rt.player.u.wounds?.bleed > 0.0001 || rt.player.u.hp < rt.player.u.maxHp * 0.6));
    let markerSlots = Math.max(0, 3 - Number(operation) - this.notices.picks.length - (!$('boss').hidden ? 1 : 0) -
      (!$('target').hidden && !$('target').classList.contains('notice-muted') ? 1 : 0));
    if (compact && this.root.classList.contains('danger-notice')) markerSlots = 0;
    this.prepareMarkerNames(rt, main);
    const nearestNames = this.nearestMarkerNames, nameCounts = this.markerNameCounts, near3 = this.nearMarkerNames;
    for (let i = main ? -1 : 0; i < rt.markers.length; i++) {
      const m = i < 0 ? main : rt.markers[i];
      if (singleBattleGuide(rt) && (m !== main || !m.guidePerson && !m.entrance)) continue;
      if (m === main && rt.guideEnemy?.alive && /倒せ|たおせ|たおす|討ち取|崩せ|敵.*止め|敵.*押し返/.test(taskLabel(rt, currentObjective(rt)?.text || ''))) continue;
      if (i >= 0 && m === main) continue;
      if (m.guideSymbol === 'fire' && singleBattleGuide(rt)) continue;
      if (singleBattleGuide(rt) && m === main && m.guideTalk && m.guidePerson) continue;
      if (m.guideArea || m === main && (groundFlag(rt.missionGuide) || !m.person && !m.guidePerson && (!m.entrance || !rt.def.town && !rt.def.dojo)) || m.entrance && this.placeFrameShown) continue;
      // 戦では人の印も含めて、今の行き先一つだけにする。
      if (!rt.def.town && !rt.def.dojo && m !== main) continue;
      const person = m.guidePerson?.();
      const destination = person?.alive ? person.pos : posOf(m);
      const p = destination && !m.guideTalk && m === main && rt.world.def.guideMarkerWay && rt.world.def.guideWay ?
        rt.world.def.guideWay(rt.player.u, destination) : destination;
      const detour = destination && p && Math.hypot(p.x - destination.x, p.z - destination.z) > 0.1;
      const name = fieldLabel(rt.def.placeText?.(markerName(m)) || markerName(m));
      if (!name || !p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || m.red || (m.group && m.group.team !== 0) || m.intelHidden || (m !== main && (m.red || m.person) && !sightRef(rt, m, p))) continue;
      // 到着後に持ち場の背後へ振り向かせない。指定のある印だけ近くで畳む。
      if ((m !== main || m.hideOnArrival) && m.hideNear && Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) < m.hideNear) continue;
      if (m.entrance && rt.nearestInteract()?.hold) continue;
      if (markerSlots <= 0) continue;
      markerSlots--;
      seen.add(m.id);
      if (this.root.classList.contains('compact-battle') &&
        (m !== main || !$('boss').hidden || !$('choice').hidden || $('objectives').classList.contains('has-action'))) {
        const old = this.markerEls.get(m.id);
        if (old) old.hidden = true;
        continue;
      }
      if (rt.def.key === 'okehazama') {
        const occupied = this.notices.picks.length + (!$('boss').hidden ? 1 : 0) + (!$('target').hidden ? 1 : 0);
        if (this.okeThreatActive || occupied >= 2) {
          const old = this.markerEls.get(m.id);
          if (old) setHidden(old, true);
          continue;
        }
      }
      let el = this.markerEls.get(m.id);
      if (!el) { el = document.createElement('div'); el.className = 'mk' + (m.red ? ' red' : ''); $('markers').appendChild(el); this.markerEls.set(m.id, el); }
      // 旗への矢印は騎馬の頭より上に置き、人馬に埋もれさせない。
      const y = (p.y ?? rt.world.heightAt(p.x, p.z)) + (person?.alive ? (person.mounted ? 3.4 : 2.5) : m === main && /旗|組の列/.test(name) ? Math.max(m.h ?? 3, 4.5) : m.h ?? 3);
      let flagBounds = m === main && !person && !detour && /旗|組の列/.test(name) ? this.goalFlagBounds(rt, m, p) : null;
      if (m === main && person?.alive && !detour) {
        const frame = this.measurePersonFrame(person, rt);
        if (frame) {
          const bounds = this.personGoalBounds || (this.personGoalBounds = {});
          bounds.width = Math.max(44, frame.right - frame.left + 16);
          bounds.height = Math.max(44, frame.bottom - frame.top + 16);
          bounds.left = frame.cx - bounds.width / 2;
          bounds.top = (frame.top + frame.bottom - bounds.height) / 2;
          flagBounds = bounds;
        }
      }
      const s = flagBounds ? { x:flagBounds.left + flagBounds.width / 2, y:flagBounds.top - 36, behind:false } : this.project(p, y, rt);
      // 騎乗や姿勢で頭の位置が変わっても、吹き出しの先を本人へ合わせる。
      if (person?.alive && m.guideTalk && !detour) {
        const frame = this.measurePersonFrame(person, rt);
        if (frame) {
          s.x = frame.cx;
          s.y = frame.top - 8;
        }
      }
      const dx = p.x - rt.player.u.pos.x, dz = p.z - rt.player.u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      // 布の囲みだけでなく、その上の矢印と縁まで収まる時だけ実物を囲む。
      // 切れる時は端の短い案内へ替え、実物と違う場所へ囲みを動かさない。
      const clippedFrame = flagBounds && (flagBounds.left < 8 || flagBounds.top < 68 ||
        flagBounds.left + flagBounds.width > W - 8 || flagBounds.top + flagBounds.height > H - 8);
      const pinned = m === main && (clippedFrame || s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H);
      if (clippedFrame) flagBounds = null;
      let sx = s.x, sy = s.y;
      const off = m === main ? pinned : s.behind || sx < 40 || sx > W - 40 || sy < 60 || sy > H - 40;
      if (off && (S.reduceGuidance || m !== main)) { el.hidden = true; continue; }
      // 印が本人の体（頭から足）に重なる時は出さない（頭を指す矢印に見える）。
      if (!off && (Math.hypot(dx, dz) < 4 || rt.camera.position.distanceTo(rt.player.u.pos) < 4.5)) {
        const me = rt.player.u.pos, hd = this.project(me, me.y + 1.75, rt), ft = this.project(me, me.y, rt);
        if (!hd.behind && Math.abs(sx - hd.x) < 44 && sy > hd.y - 60 && sy < ft.y + 10) { el.hidden = true; continue; }
      }
      if (pinned || s.behind) {
        // 背後でも左右を保つ。画面の真下だけでは回る向きが分からない。
        const scale = Math.min((W / 2 - 40) / Math.max(0.001, Math.abs(right)), (H / 2 - 60) / Math.max(0.001, Math.abs(forward)));
        sx = W / 2 + right * scale; sy = H / 2 - forward * scale;
      }
      const fixedEntrance = m.entrance && !off;
      sx = Math.max(40, Math.min(W - 40, sx)); sy = Math.max(60, Math.min(H - 60, sy));
      const axis = !off ? '' : sx <= 40 || sx >= W - 40 ? 'v' : 'h';
      // 隠した印も、名を書き換えて実寸を測ってから置き直す。
      el.hidden = false;
      const d = Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z);
      const behind = m === main && forward < 0;
      el.classList.toggle('edge', off);
      el.classList.toggle('near', m !== main && d < 5);
      el.classList.toggle('main', m === main);
      const waitGoal = m === main && m.waitGuide;
      const waitArrived = waitGoal && !!m.waitArrived?.();
      el.classList.toggle('wait-goal', !!waitGoal);
      el.classList.toggle('arrived', !!waitArrived);
      const personGoal = !!m.guidePerson && !detour;
      el.classList.toggle('direction-only', m === main && !personGoal && !waitGoal && (detour || !/旗|組の列/.test(name)) && !rt.def.town && !rt.def.dojo);
      el.classList.toggle('flag-goal', m === main && !personGoal && !detour && /旗|組の列/.test(name));
      el.classList.toggle('person-goal', personGoal);
      const talk = personGoal && m.guideTalk;
      const interact = talk ? rt.nearestInteract() : null;
      const interactPos = interact && (typeof interact.pos === 'function' ? interact.pos() : interact.pos);
      const talkReady = talk && !interact?.hold && /話す|話を聞く/.test(interact?.label || '') && interactPos &&
        Math.hypot(interactPos.x - destination.x, interactPos.z - destination.z) < 1;
      el._talk = talk; el._person = person;
      if (talkReady && $('prompt').classList.contains('talk-target')) { el.hidden = true; continue; }
      const largeWay = !!rt.def.largeWaymarks && (m === main || m.id === 'sakamichi');
      el.classList.toggle('large-way', largeWay);
      const nearestDuplicate = nameCounts.get(name) > 1 && nearestNames.get(name) === m;
      const dimmed = !nearestDuplicate && rt.markers.length > 4 && m !== main && !near3.has(m) && !m.person && !(m.born && performance.now() - m.born < 2200);
      const duplicate = m !== main && !m.person && nearestNames.has(name) && nearestNames.get(name) !== m;
      const minor = duplicate || !!(m.minor && m !== main && !nearestDuplicate);
      el.classList.toggle('minor', minor);
      el.classList.toggle('dimmed', dimmed || minor);
      // 行き先は端の印にまとめ、照準の脇には重ねない。
      // 見えている近い行き先（40m 以内）は、世界そのものが目印になるので印を控えめに
      el.classList.toggle('quiet', !largeWay && m !== main && !behind && !off && d < 40 && d >= 5 && !m.red);
      el.classList.toggle('weak', !!(m.group && m.group.morale < 30 && !m.group.routed));
      if (!m.born) m.born = performance.now();
      el.classList.toggle('fresh', performance.now() - m.born < 2200);
      // 印の場所・向き・名は、変わった時だけ書く（同じ値でも書くと、毎コマ札の組み直しが起きる）
      const setAng = (a) => { const v = a.toFixed(3) + 'rad'; if (el._ang !== v) { el._ang = v; el.style.setProperty('--ang', v); } };
      if (off) setAng(pinned || behind ? Math.atan2(-forward, right) : Math.atan2(sy - H / 2, sx - W / 2));
      // 印の名は名だけ（士気は旗の傾き・揺れで見せる）。崩れかけの時だけ「崩れかけ」を添える（今が押し時と分かるように）
      const label = detour ? '屋形の前を回る' : m === main && /旗|組の列/.test(name) ? 'この はたへ' : fieldLabel(m === main ? rt.missionGuide.label : name).replace(/・(意気盛ん|平常|動揺)$/, '');
      // 名は墨の下地の上に、距離は薄い字で分ける（霧や明るい空でも読める）。すぐそばでは距離を出さず、遠い時は言葉で
      const shownDistance = m === main ? rt.missionGuide.distance : typeof m.routeDistance === 'function' ? m.routeDistance() : d;
      const dist = m.alwaysDistance || m === main ? destinationDistance(rt, shownDistance, true) : d < 12 ? '' : d > 150 ? '遠い' : destinationDistance(rt, d);
      // 最小のスマホ横：名は出たばかりの時・真ん中あたりに見ている時・敵の武将の隊（赤）だけ。距離は出さない（◆だけで行き先は分かる）
      const lean = leanHud(), look = !off && Math.abs(sx - W / 2) < W * 0.18 && Math.abs(sy - H / 2) < H * 0.3;
      // 話し相手の印（person）は、近くに来ると頭上の名札（drawOverlay）が出るので、印の名は重ねて二重に出さない
      const dupWithOverlay = m !== main && m.person && !off && d < 26;
      // 木津川口では近い三つの隊旗に名を添え、記号だけの札にしない。
      const fleetName = rt.world.def.battleKey === 'kizugawa' && m.group && near3.has(m);
      const showLabel = !dupWithOverlay && !dimmed && !minor && (!lean || fleetName || nearestDuplicate || m === main || m.red || look || performance.now() - m.born < 2200);
      const flagGoal = m === main && !personGoal && /旗|組の列/.test(name) && !detour;
      el.classList.toggle('flag-framed', !!flagBounds);
      const flagFrame = flagBounds ? '<span class="goal-flag-frame" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="50" ry="50" fill="none" stroke="#14120f" stroke-width="11" vector-effect="non-scaling-stroke"/><ellipse cx="50" cy="50" rx="50" ry="50" fill="none" stroke="#fff3ba" stroke-width="5" vector-effect="non-scaling-stroke"/></svg><svg class="goal-flag-arrow" viewBox="0 0 28 32"><path d="M9 3H19V15H25L14 29L3 15H9Z" fill="none" stroke="#14120f" stroke-width="8"/><path d="M9 3H19V15H25L14 29L3 15H9Z" fill="none" stroke="#fff" stroke-width="4"/></svg></span>' : '';
      const html = personGoal ? `${flagBounds && !off ? flagFrame : ''}${talk && !off ? '' : `<svg viewBox="0 0 48 56" aria-hidden="true"><g fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round">${m.guideTalk ? '<path d="M5 4H43V34H29L18 47V34H5Z"/><path d="M13 14H35M13 23H29" fill="none"/>' : '<circle cx="24" cy="10" r="8"/><path d="M12 37V26Q12 20 24 20Q36 20 36 26V37H30V44H36L24 54L12 44H18V37Z"/>'}</g></svg>`}<b${talkReady ? ' hidden' : ''}>${talkReady ? 'はなす' : esc(m.guidePersonLabel || (m.guideTalk ? 'この人に ちかづこう' : 'この人についていく'))}</b>${off ? `<small>${behind ? `${right >= 0 ? '右' : '左'}へ振り向こう` : 'この方向へ'}</small>` : ''}` : flagGoal ? `<b>旗まで進もう</b>${off ? '' : flagFrame}` : waitGoal ? `<b>${waitArrived ? '✓ ここで まつ' : 'ここへ'}</b><small>${esc(typeof m.waitGuide === 'function' ? m.waitGuide() : '')}</small>` : m === main && !rt.def.town && !rt.def.dojo ? `<span class="destination-chip"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 27V2H22L17 9L22 16H3" fill="#fff3ba" stroke="#14120f" stroke-width="2"/></svg>${esc(rt.def.namedGuideMarkers ? rt.def.travelGuideLabel?.(rt) || '旗へ すすめ' : '旗へ すすめ')}</span>` : off && m !== main && !largeWay ? '' : showLabel ? `${behind ? `<strong class="behind-label">${right >= 0 ? '右' : '左'}へ振り向く</strong>` : ''}<b>${m === main ? '◆ ' : ''}${s.behind && !behind ? '後ろ・' : ''}${esc(label.replace(/^[◇◆]\s*/, ''))}</b>${dist && (!lean || m === main || largeWay) ? `<small>${dist}${m === main && rt.missionGuide.floorHint ? '・' + esc(rt.missionGuide.floorHint) : ''}</small>` : ''}` : '';
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      { const al = off ? `行き先：${label}` : label; if (el._al !== al) { el._al = al; el.setAttribute('aria-label', al); } }
      // 名や形が変わった時だけ測る。毎コマの強制レイアウトを増やさない。
      if (el._measureHtml !== html || el._measureOff !== off || el._measureMain !== (m === main) || el._measureLean !== lean || el._measureW !== W || el._measureH !== H) {
        setStyle(el, 'left', sx + 'px'); setStyle(el, 'top', sy + 'px');
        el._ow = el.offsetWidth; el._oh = el.offsetHeight;
        const turn = el.querySelector('.way-turn');
        el._hw = Math.max(16, el._ow / 2, turn ? turn.offsetWidth / 2 : 0) + 4;
        el._mh = el._oh + (turn ? turn.offsetHeight : 0) + (off ? largeWay ? 32 : 20 : m === main ? 34 : 4);
        el._measureHtml = html; el._measureOff = off; el._measureMain = m === main; el._measureLean = lean; el._measureW = W; el._measureH = H;
      }
      const hw = el._hw, mh = el._mh;
      if (personGoal && !off) sy = s.y - (talk ? 64 : 0);
      if (waitGoal && !off) sy -= 30; // 矢印の先を地面の輪へ合わせる。
      // 端からの固定距離ではなく、案内・名・距離を含む実寸で収める。
      sx = fixedEntrance ? s.x : Math.max(hw + 8, Math.min(W - hw - 8, sx));
      sy = fixedEntrance ? s.y : Math.max(mh + 8, Math.min(H - (waitGoal ? 42 : 10), sy));
      // 指定した戦の背後の行き先は端へ寄せ、本人と斬り合う兵の上を空ける。
      const inabaBehind = (rt.def.edgeBehindWaymarks || rt.world.def.battleKey === 'inabayama' || rt.def.key === 'honnoji') && behind;
      if (inabaBehind) {
        sx = right >= 0 ? W - hw - 12 : hw + 12;
        sy = Math.max(mh + 8, H * 0.55);
      }
      if ((flagGoal || personGoal) && !off && flagBounds) {
        const body = this.markerFlagRect || (this.markerFlagRect = {});
        body.left = flagBounds.left - 24; body.right = flagBounds.left + flagBounds.width + 24;
        body.top = flagBounds.top - 60; body.bottom = flagBounds.top + flagBounds.height + 16;
        placed.push(body);
        sx = flagBounds.left + flagBounds.width / 2 + (sx < W / 2 ? 1 : -1) * (hw + flagBounds.width / 2 + 36);
        sy = Math.max(mh + 12, flagBounds.top + 44);
      }
      if (talk && !off && !talkReady) {
        const sign = el._signRect || (el._signRect = {});
        sign.left = s.x - 26; sign.right = s.x + 26;
        sign.top = s.y - 50; sign.bottom = s.y + 4;
        placed.push(sign);
      }
      const spot = !off && (talkReady || !rt.def.avoidMarkerNotices && m === main && !flagGoal && !personGoal) ? [sx, sy] : this.avoidRects(sx, sy, W, H, inabaBehind ? 'v' : axis, placed, hw, mh, true);
      // 行き先も空いた場所を探し、兵力の字へ重ねて戻さない。
      if (!spot) { el.hidden = true; continue; }
      sx = spot[0]; sy = spot[1];
      if ((flagGoal || personGoal) && !off && flagBounds) {
        // 札を避けても、白枠は実際の布の位置と大きさを保つ。
        const fx = Math.round(flagBounds.left - sx), fy = Math.round(flagBounds.top - sy);
        if (el._flagX !== fx) { el._flagX = fx; el.style.setProperty('--flag-x', fx + 'px'); }
        if (el._flagY !== fy) { el._flagY = fy; el.style.setProperty('--flag-y', fy + 'px'); }
        const fw = Math.round(flagBounds.width), fh = Math.round(flagBounds.height);
        if (el._flagWidth !== fw) { el._flagWidth = fw; el.style.setProperty('--flag-width', fw + 'px'); }
        if (el._flagHeight !== fh) { el._flagHeight = fh; el.style.setProperty('--flag-height', fh + 'px'); }
      }
      if (flagGoal) setClass(this.root, 'flag-guide', true);
      if (personGoal) setClass(this.root, 'person-guide', true);
      el._tipX = personGoal && !off ? s.x : null; el._tipY = personGoal && !off ? s.y : null;
      el._px = Math.round(sx * 2) / 2; el._py = Math.round(sy * 2) / 2;
      setStyle(el, 'left', el._px + 'px'); setStyle(el, 'top', el._py + 'px');
      if (off && !pinned && !behind) setAng(Math.atan2(sy - H / 2, sx - W / 2));
      const rect = el._markerRect || (el._markerRect = {});
      rect.left = sx - hw; rect.right = sx + hw; rect.top = sy - mh; rect.bottom = sy + 2;
      placed.push(rect);

    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
  }
}
