import { groundAt } from "./floors.js";
import { VIEW } from "./viewport.js";
import { S } from "./settings.js";
import { $, setAttr, setClass, setText, setHtml, esc, setStyle, setHidden } from "./hud_common.js";
import { isTouch, touchInput } from "./touch.js";
import { clearFoot } from "./cover_guide.js";
import { visibleRainEscape } from "./arrow_rain.js";
import { localClear } from "./army_local_way.js";
import { pinGuideOn } from "./mission_pin.js";

export class HudDodge {


  // 操作札と行き先の矢印は、同じ地面の投影から向きを取る。
  coverScreenDirection(rt, pos) {
    const p = rt.player.u.pos, distance = Math.hypot(pos.x - p.x, pos.z - p.z);
    const result = this.coverScreenVector || (this.coverScreenVector = { angle: 0, arrow: '→' });
    this.tmpV.set(p.x, p.y + .15, p.z).project(rt.camera);
    const footX = this.tmpV.x, footY = this.tmpV.y;
    const step = Math.min(2, distance) / Math.max(.001, distance);
    const x = p.x + (pos.x - p.x) * step, z = p.z + (pos.z - p.z) * step;
    this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .15, z).project(rt.camera);
    const dx = (this.tmpV.x - footX) * VIEW.w, dy = -(this.tmpV.y - footY) * VIEW.h;
    result.angle = Math.atan2(dy, dx);
    result.arrow = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? '→' : '←' : dy >= 0 ? '↓' : '↑';
    return result;
  }


  drawCoverSign(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-17, -22); g.lineTo(17, -22);
    g.lineTo(17, 0); g.quadraticCurveTo(16, 14, 0, 22);
    g.quadraticCurveTo(-16, 14, -17, 0); g.closePath();
    g.fillStyle = '#14120f'; g.fill();
    g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff3ba'; g.font = 'bold 18px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('隠', 0, -1);
    g.restore();
  }


  drawCoverDirection(g, rt, pos) {
    const angle = this.coverScreenDirection(rt, pos).angle;
    this.tmpV.set(pos.x, pos.y + .65, pos.z).project(rt.camera);
    let x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
    const rects = this.hudRects();
    const onField = this.tmpV.z >= -1 && this.tmpV.z <= 1 && this.destinationPointerClear(x, y, rects);
    if (onField) {
      // 柵の向こうの安全な足場に印を立て、説明のない点線は重ねない。
      this.drawCoverSign(g, x, y);
      return true;
    }
    const cx = VIEW.w / 2, cy = Math.max(100, (VIEW.h + 48) / 2);
    const scale = Math.min((VIEW.w / 2 - 80) / Math.max(.001, Math.abs(Math.cos(angle))),
      Math.max(16, VIEW.h / 2 - 112) / Math.max(.001, Math.abs(Math.sin(angle))));
    for (let i = 0; i <= 12; i++) {
      const step = scale * (1 - i / 12);
      x = cx + Math.cos(angle) * step; y = cy + Math.sin(angle) * step;
      if (!this.destinationPointerClear(x, y, rects)) continue;
      this.drawCoverSign(g, x, y);
      g.save(); g.translate(x, y); g.rotate(angle); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(28, 0); g.lineTo(50, 0);
      g.moveTo(38, -9); g.lineTo(50, 0); g.lineTo(38, 9);
      g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
      return true;
    }
    return false;
  }


  // 夜攻めの攻撃予告と、桶狭間・森部で近い敵の向きを示す。
  // 三枚の印と入れ物を使い回し、十分の一秒ごとに選び直す。
  showCover(rt, q) {
    if (!q || S.reduceGuidance || rt.choice || this.bigmap || rt.player.camShot || $('objectives').classList.contains('expand')) return false;
    const occupied = this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) + Number(!!rt.nearestInteract());
    if (occupied >= 3) return false;
    let el = this.coverEl;
    if (!el) {
      el = this.coverEl = document.createElement(isTouch ? 'button' : 'div'); el.className = 'cover-guide';
      if (isTouch) {
        el.type = 'button'; el.classList.add('hold-cover');
        this.coverHoldAxis = { x: 0, y: 0 };
        el.innerHTML = '<svg viewBox="-4 -6 48 62" aria-hidden="true"><circle cx="20" cy="10" r="12" fill="none" stroke="#fff3ba" stroke-width="3"/><path d="M14 28V10Q14 3 20 3Q26 3 26 10V25L31 22L38 29L35 48H15L4 34Q0 27 6 27Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg><svg viewBox="-24 -28 48 56" aria-hidden="true"><path d="M-17-22H17V0Q16 14 0 22Q-16 14-17 0Z" fill="#14120f" stroke="#fff3ba" stroke-width="4" stroke-linejoin="round"/><text y="5" text-anchor="middle" fill="#fff3ba" font-size="18" font-weight="bold">隠</text></svg><span></span>';
        const release = this.releaseCoverHold = () => {
          const input = touchInput();
          if (input?.axis === this.coverHoldAxis) input.axis = null;
          this.coverHeldBattle = null;
          setAttr(el, 'aria-pressed', 'false');
          if (this.rt?.def.coverGuideHeldText) setText(el.lastElementChild, this.rt.def.coverGuideTouchLabel);
        };
        const start = () => {
          const b = this.rt;
          if (!el.hidden && b?.player.u.alive && !b.over && !b.choice) {
            this.releaseWaitGuard?.(); this.coverHeldBattle = b;
            setAttr(el, 'aria-pressed', 'true');
            if (b.def.coverGuideHeldText) setText(el.lastElementChild, b.def.coverGuideHeldText);
          }
        };
        el.addEventListener('pointerdown', e => {
          e.preventDefault(); e.stopPropagation();
          if (e.button !== 0) return;
          start(); el.setPointerCapture(e.pointerId);
        });
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(name, e => { e.stopPropagation(); release(); });
        el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } });
        el.addEventListener('keyup', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
        el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
        el.addEventListener('blur', release); window.addEventListener('blur', release);
      }
      this.root.appendChild(el);
    }
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const s = this.project(q, q.y + .1, rt);
    const dx = q.x - p.x, dz = q.z - p.z, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const off = s.behind || s.x < 50 || s.x > W - 50 || s.y < 76 || s.y > H - 24;
    setClass(el, 'edge', off);
    const label = rt.def.coverGuidePlace
      ? off ? `${right >= 0 ? '右' : '左'}をむこう` : Math.hypot(dx, dz) < .8 ? 'ここで隠れよう' : rt.coverGuide?.label || '物かげへ'
      : Math.hypot(dx, dz) < .8 ? 'ここで かくれる' : 'しるしまで さがろう';
    if (isTouch) setText(el.lastElementChild, Math.hypot(dx, dz) < .8 ? 'ここで かくれる'
      : this.coverHeldBattle === rt && rt.def.coverGuideHeldText ? rt.def.coverGuideHeldText
      : rt.def.coverGuideTouchLabel || `長く押して\n${rt.coverGuide?.label || '隠れる印へ'}`);
    else setHtml(el, esc(label));
    setStyle(el, '--ang', (forward < 0 ? right >= 0 ? 0 : Math.PI : Math.atan2(-forward, right)).toFixed(3) + 'rad');
    setAttr(el, 'aria-label', isTouch ? el.lastElementChild.textContent : label);
    setHidden(el, false);
    if (isTouch) {
      if (Math.hypot(dx, dz) < .8) this.releaseCoverHold();
      setClass(this.root, 'cover-guidance', true);
      return true;
    }
    const sizeKey = label + ':' + off + ':' + W + ':' + H;
    if (this.coverSizeKey !== sizeKey) {
      this.coverSizeKey = sizeKey; this.coverHeight = el.offsetHeight; this.coverHalf = el.offsetWidth / 2;
    }
    const height = this.coverHeight, half = this.coverHalf;
    // 上端で既存の札を避ける。戦場の中央と旗の上は空ける。
    const spot = this.avoidRects(W - half - 12, height + 12,
      W, H, 'h', null, half, height, true);
    if (!spot) { el.hidden = true; return false; }
    setStyle(el, 'left', spot[0] + 'px'); setStyle(el, 'top', spot[1] + 'px');
    // 待機の札を同時に残さず、戻る案内を今の行動にする。
    setClass(this.root, 'cover-guidance', true);
    return true;
  }


  // 安全な逃げ先を太い矢印で示す。画面外なら端へ向きを出す。
  showDodge(rt, source) {
    const p = rt.player.u.pos;
    let rain = rt.army.rainEscape;
    // 矢の雨は通常の敵の調べより先に来る。初回から同じ一覧を使い回す。
    const sources = this.threatSources || (this.threatSources = []);
    const cue = rt.dodgeCue || (rt.dodgeCue = { x: 0, z: 0, label: '', valid: false,
      pos: { x: 0, y: 0, z: 0 }, at: -Infinity, arrived: false, source: null });
    const point = this.dodgePoint || (this.dodgePoint = { x: 0, y: 0, z: 0 });
    const obstacles = this.hudRects();
    const edge = this.dodgeEdge || (this.dodgeEdge = { x: 0, y: 0, z: 0 });
    const safe = q => {
      if (rt.def.dodgePointAllowed && !rt.def.dodgePointAllowed(rt, q)) return false;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        edge.x = q.x + Math.cos(angle) * 1.1; edge.z = q.z + Math.sin(angle) * 1.1;
        edge.y = groundAt(rt.world, edge.x, edge.z, q.y);
        if (rt.def.dodgePointAllowed && !rt.def.dodgePointAllowed(rt, edge)) return false;
        if (Math.abs(edge.y - q.y) > .3 || !clearFoot(rt, edge)) return false;
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / .4));
      for (let i = 1; i <= steps; i++) {
        edge.x = p.x + (q.x - p.x) * i / steps; edge.z = p.z + (q.z - p.z) * i / steps;
        edge.y = groundAt(rt.world, edge.x, edge.z, p.y);
        if (rt.def.dodgePointAllowed && !rt.def.dodgePointAllowed(rt, edge)) return false;
        if (!clearFoot(rt, edge)) return false;
      }
      // 空いた終点でも、途中で敵の集まりへ踏み込む道は案内しない。
      const dx = q.x - p.x, dz = q.z - p.z, length2 = dx * dx + dz * dz || 1;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.isStruct || u.civ || u.team === rt.player.u.team || Math.abs(u.pos.y - p.y) > 3) continue;
        const t = Math.max(0, Math.min(1, ((u.pos.x - p.x) * dx + (u.pos.z - p.z) * dz) / length2));
        const start = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (Math.hypot(u.pos.x - p.x - dx * t, u.pos.z - p.z - dz * t) < Math.min(3, start - .15)) return false;
      }
      return true;
    };
    const visible = (q) => {
      if (!this.floorGoalVisible(rt, q)) return false;
      // 描く輪と旗・短い札が収まる範囲で調べる。遠近で広がる仮の輪は使わない。
      this.tmpV.set(q.x, q.y + .1, q.z).project(rt.camera);
      const cx = (this.tmpV.x * .5 + .5) * VIEW.w, cy = (-this.tmpV.y * .5 + .5) * VIEW.h;
      if (cx < 120 || cx > VIEW.w - 120 || cy < 120 || cy > VIEW.h - 76) return false;
      if (obstacles.some(r => cx + 48 > r.left && cx - 48 < r.right && cy + 28 > r.top && cy - 104 < r.bottom)) return false;
      // 兵との実際の距離は安全判定へ任せ、頭上の投影で地面の候補を消さない。
      return true;
    };
    const unoccupied = (q) => {
      for (const u of rt.army.units) {
        if (u === rt.player.u || !u.alive || u.gone || u.isStruct) continue;
        if (Math.abs(u.pos.y - q.y) < 3 && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < (u.mounted || u.type === 'cavalry' ? 4 : 3)) return false;
      }
      return true;
    };
    if (rain && rt.t >= (cue.rainVisibleAt ?? 0)) {
      cue.rainVisibleAt = rt.t + .5;
      visibleRainEscape(rt.army, visible);
      rain = rt.army.rainEscape;
    }
    // 矢の落下範囲から探した共通の安全地点は、画面外でも案内する。
    if (rain) {
      cue.pos.x = p.x + rain.x * (rain.distance ?? 5);
      cue.pos.z = p.z + rain.z * (rain.distance ?? 5);
      cue.pos.y = groundAt(rt.world, cue.pos.x, cue.pos.z, p.y);
      cue.valid = true; cue.arrived = false; cue.source = source; cue.rain = true; cue.at = rt.t;
    }
    const same = cue.valid && cue.source === source && cue.rain === !!rain;
    const inside = same && Math.hypot(cue.pos.x - p.x, cue.pos.z - p.z) <= 1.1 && Math.abs(cue.pos.y - p.y) < .6;
    cue.arrived = !!inside;
    // 着いてから敵が寄った時も、古い「まつ」を残さず安全な床を探し直す。
    let obscured = false;
    if (!rain && same && !inside && rt.t >= (cue.visibleAt ?? 0)) {
      cue.visibleAt = rt.t + .5;
      obscured = !visible(cue.pos);
    }
    const threatened = !rain && same && sources.some(enemy => enemy.alive && Math.hypot(cue.pos.x - enemy.pos.x, cue.pos.z - enemy.pos.z) < 3);
    if (!rain && (!same || threatened || !unoccupied(cue.pos) || obscured || !safe(cue.pos) || !localClear(rt.army, p, cue.pos))) {
      cue.valid = false; cue.arrived = false;
      let best = -Infinity, bestVisible = false;
      const sx = source ? p.x - source.pos.x : -Math.sin(rt.player.yaw), sz = source ? p.z - source.pos.z : -Math.cos(rt.player.yaw);
      const length = Math.hypot(sx, sz) || 1;
      for (let i = 0; i < 24; i++) {
        const angle = i % 8 * Math.PI / 4;
        const dx = (sz * Math.cos(angle) + sx * Math.sin(angle)) / length;
        const dz = (-sx * Math.cos(angle) + sz * Math.sin(angle)) / length;
        const distance = 5 + Math.floor(i / 8) * 1.5;
        point.x = p.x + dx * distance; point.z = p.z + dz * distance;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
        if (!localClear(rt.army, p, point) || Math.abs(point.y - p.y) > .6 || !unoccupied(point) || !safe(point)) continue;
        // 見える安全な床を優先し、見つからない時も画面端で逃げる方向を示す。
        const inView = visible(point);
        let score = 0, clear = true;
        for (const enemy of sources) {
          const d = Math.hypot(point.x - enemy.pos.x, point.z - enemy.pos.z);
          if (d < 3) clear = false;
          score += Math.min(30, d);
        }
        if (clear && (inView && !bestVisible || inView === bestVisible && score > best)) {
          best = score; bestVisible = inView; Object.assign(cue.pos, point); cue.valid = true;
        }
      }
      if (!cue.valid) return null;
      cue.source = source; cue.rain = !!rain; cue.at = rt.t;
    }
    // 逃げ先の輪は地面へ投影する。古い立体の輪は重ねない。
    if (rt.dodgeRing) rt.dodgeRing.visible = false;
    // 照準や組の輪を消し、行き先の印と競わせない。
    if (rt.reachRing) rt.reachRing.visible = false;
    if (rt.lockRing) rt.lockRing.visible = false;
    if (rt.aimRing) rt.aimRing.visible = false;
    if (rt.bowRing) rt.bowRing.visible = false;
    if (rt.moveRing) rt.moveRing.visible = false;
    for (const group of rt.squadGroups) { if (group.orderRing) group.orderRing.visible = false; if (group.selRing) group.selRing.visible = false; }
    // 共通案内では任務一枚と矢印一本へ渡す。安全地点の選び方は同じ。
    if (pinGuideOn(rt)) {
      if (this.dodgeEl) { this.dodgeEl.hidden = true; setStyle(this.dodgeEl, 'display', 'none'); }
      if (this.dodgeHeldBattle) this.releaseDodgeHold();
      if (rt.turnPractice?.active) { rt.turnPractice.active = false; rt.turnPractice.done = true; }
      setClass(this.root, 'dodge-active', false);
      setClass(this.root, 'dodge-turn-coach', false);
      cue.gestureShown = false;
      rt.dodgeGuide = cue;
      return cue;
    }
    // 落下範囲のふちと模様は残し、安全な行き先と同時に見せる。
    let el = this.dodgeEl;
    if (!el) {
      el = this.dodgeEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('class', 'dodge-guide'); el.setAttribute('aria-hidden', 'true');
      // 黒い板を薄い帯に替え、文字の下だけ濃くして端を戦場へなじませる。
      // ぼかしや影の追加はせず、この一枚の塗りを全ての戦で使い回す。
      el.innerHTML = '<defs><linearGradient id="escape-card-ink"><stop stop-color="#14120f" stop-opacity="0"/><stop offset="6%" stop-color="#14120f" stop-opacity=".88"/><stop offset="94%" stop-color="#14120f" stop-opacity=".88"/><stop offset="100%" stop-color="#14120f" stop-opacity="0"/></linearGradient></defs><g class="escape-card"><g class="escape-card-flag" aria-hidden="true"><path d="M0-56H32L24-44L32-32H0Z" fill="#fff3ba" stroke="#14120f" stroke-width="7" stroke-linejoin="round"/><path d="M0 0V-56" stroke="#fff3ba" stroke-width="4"/></g><rect x="-76" y="-16" width="152" height="32" fill="url(#escape-card-ink)"/><text class="escape-label" text-anchor="middle" dominant-baseline="central" fill="#fff3ba" font-size="18" font-weight="bold" y="0">ここへ</text></g><path class="escape-turn" style="filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f)" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M-7-58L7-58L7-30L17-30L0-10L-17-30L-7-30Z"/>';
      const cardFlag = el.querySelector('.escape-card-flag');
      const outline = el.querySelector('.escape-turn').cloneNode(false);
      outline.setAttribute('class', 'escape-route-outline');
      outline.removeAttribute('style');
      outline.setAttribute('fill', 'none');
      outline.setAttribute('stroke-width', '13');
      setStyle(outline, 'display', 'none');
      el.insertBefore(outline, el.querySelector('.escape-turn'));
      cardFlag.parentNode.appendChild(cardFlag);
      const gesture = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gesture.setAttribute('class', 'escape-gesture');
      gesture.innerHTML = '<circle class="swipe-hand" cy="-12" r="24" fill="none" stroke="#14120f" stroke-width="8"/><circle class="swipe-hand" cy="-12" r="24" fill="none" stroke="#fff3ba" stroke-width="4"/><path class="swipe-arrow" d="M0-12H88M74-24L88-12L74 0" fill="none" stroke="#fff3ba" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M-6 10V-12C-6-22 6-22 6-12V6L12 2L26 12L22 32H-5L-20 16C-28 5-16 0-6 14Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/>';
      const swipeEnd = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      swipeEnd.setAttribute('class', 'swipe-end');
      swipeEnd.innerHTML = '<circle r="12" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path d="M-6 0L-1 5L7-5" fill="none" stroke="#fff3ba" stroke-width="3"/>';
      gesture.insertBefore(swipeEnd, gesture.lastElementChild);
      el.appendChild(gesture);
      // 指と矢印は見回せる側へ置き、逃げ先の旗と区別する。
      const destination = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      destination.setAttribute('class', 'escape-destination');
      destination.innerHTML = '<g class="escape-edge-ring"><ellipse rx="30" ry="10" fill="none" stroke="#14120f" stroke-width="8"/><ellipse rx="30" ry="10" fill="none" stroke="#fff3ba" stroke-width="4"/></g><path d="M0-56H32L24-44L32-32H0Z" fill="#fff3ba" stroke="#14120f" stroke-width="7" stroke-linejoin="round"/><path d="M0 0V-56" stroke="#14120f" stroke-width="7"/><path d="M0 0V-56" stroke="#fff3ba" stroke-width="3"/>';
      const flagFace = destination.children[1].cloneNode(false);
      flagFace.setAttribute('stroke', '#ffffff');
      flagFace.setAttribute('stroke-width', '6');
      destination.appendChild(flagFace);
      el.appendChild(destination);
      this.root.appendChild(el);
    }
    el.hidden = false; setStyle(el, 'display', 'block');
    setClass(this.root, 'dodge-active', true);
    rt.guideEnemy = null; rt.guideEnemyShown = false;
    setHidden($('target'), true); setHidden($('boss'), true);
    el.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
    cue.x = cue.pos.x - p.x; cue.z = cue.pos.z - p.z;
    cue.label = rt.def.dodgeLabel?.(rt, '', !!rain) || (cue.arrived ? 'ここで かまえる' : 'ここへ にげる');
    const end = this.project(cue.pos, cue.pos.y + .1, rt);
    const W = VIEW.w, H = VIEW.h;
    const covered = obstacles.some(r => end.x + 48 > r.left && end.x - 48 < r.right && end.y + 24 > r.top && end.y - 70 < r.bottom);
    const off = end.behind || end.x < 120 || end.x > W - 120 || end.y < 120 || end.y > H - 76 || covered || !rain && !this.floorGoalVisible(rt, cue.pos);
    let x = end.x, y = end.y, direction = '', turning = false, turnRight = false;
    if (off) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -cue.x * Math.cos(yaw) + cue.z * Math.sin(yaw);
      const forward = cue.x * Math.sin(yaw) + cue.z * Math.cos(yaw);
      const top = 112, bottom = H - 120, centerY = (top + bottom) / 2;
      const scale = Math.min((W / 2 - 96) / Math.max(.001, Math.abs(right)),
        Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
      x = W / 2 + right * scale; y = centerY - forward * scale;
      // 背後の旗は画面の左右端へ置き、戦場の中の旗と見分ける。
      if (forward < 0) x = right >= 0 ? W - 96 : 96;
      // 少し振り向いただけで案内が往復しない。行き先を前へ入れたら歩く案内へ進む。
      turning = forward / (Math.hypot(cue.x, cue.z) || 1) < (cue.turning ? .18 : -.15);
      turnRight = right >= 0;
      direction = turning ? `${isTouch ? '画面を' : '手元の操作器を'}${turnRight ? '右' : '左'}へ ${isTouch ? 'なぞる' : '動かす'}` :
        `${Math.abs(forward) > Math.abs(right) ? '前' : right >= 0 ? '右' : '左'}へ にげる`;

    }
    if (this.dodgeTurnRt !== rt) {
      this.dodgeTurnRt = rt; this.dodgeTurnAt = -Infinity;
      cue.turning = false; cue.showTurn = false;
    }
    // 同じ振り向く札は既定で八秒あける。戦ごとに手ほどきの繰り返しを控えられる。
    if (turning && (!cue.turning || !cue.showTurn)) {
      cue.showTurn = rt.t - (this.dodgeTurnAt ?? -Infinity) >= (rt.def.dodgeTurnInterval ?? 8);
      if (cue.showTurn) this.dodgeTurnAt = rt.t;
    }
    cue.turning = turning;
    // 向きを変える操作の練習（なぞる・手）は、教えの戦だけ
    const showTurn = !rain && (!rt.teachOn || rt.teachOn()) && turning && cue.showTurn && !cue.arrived && !rt.turnPractice?.done &&
      rt.t - this.dodgeTurnAt < (rt.def.dodgeTurnDuration ?? Infinity);
    // 札と地面の印を一組として収める。画面外では進む方向を示す。
    if (off) {
      x = turnRight ? W - 56 : 56;
      y = Math.max(112, Math.min(H - 120, y));
    }
    // 矢じり全体で札を避ける。「いのち」などの下端の札へは近づけない。
    let dodgeMarkClear = true;
    if (off) {
      let bestY = y, best = Infinity;
      for (let i = 0; i <= 12; i++) {
        const cy = 112 + Math.max(0, H - 232) * i / 12;
        if (obstacles.some(r => x + 36 > r.left && x - 36 < r.right && cy + 44 > r.top && cy - 44 < r.bottom)) continue;
        const score = Math.abs(cy - y);
        if (score < best) { best = score; bestY = cy; }
      }
      dodgeMarkClear = best < Infinity;
      y = bestY;
    }
    if (showTurn && !rain) {
      if (cue.allyAt == null || rt.t >= cue.allyAt) {
        cue.allyAt = rt.t + .5; cue.ally = null;
        let best = Infinity;
        for (const unit of rt.army.units) {
          if (unit === rt.player.u || !unit.alive || unit.gone || unit.team !== rt.player.u.team || unit.civ || unit.isStruct || unit.fleeing) continue;
          const dx = unit.pos.x - p.x, dz = unit.pos.z - p.z;
          if (dx * cue.x + dz * cue.z <= 0 || Math.hypot(dx, dz) > 28) continue;
          const score = Math.hypot(unit.pos.x - cue.pos.x, unit.pos.z - cue.pos.z);
          if (score < best) { best = score; cue.ally = unit; }
        }
      }
    }
    // 逃げ先のすぐ上へ札を添え、戦固有の指図も残す。
    const baseLabel = rain ? rt.def.rainDodgeGuideLabel?.(rt, cue.arrived) || '旗までにげよう' : showTurn ? (cue.ally?.alive ? rt.def.dodgeTurnLabel?.(rt, turnRight, isTouch) : null) ||
      (isTouch ? 'なぞって むきをかえる' : `${turnRight ? '右' : '左'}へ動かして むきをかえる`) :
      rt.def.dodgeGuideLabel?.(rt, cue.arrived, !!rain) ||
      (cue.arrived ? 'ここで かまえる' : 'ここへ にげる');
    // 下知を残す指定の戦では、画面外でも退く理由や矢をよける指図を保つ。
    const escapeArrow = !showTurn && !cue.arrived;
    cue.escapeArrow = escapeArrow;
    const moveSide = this.navigationDirection(rt, cue.pos);
    const dodgeSide = moveSide === '上' || moveSide === '前' ? '前' : moveSide === '下' || moveSide === '後' ? '後ろ' : moveSide;
    // 回避が必要な間は同じ札に手本を残し、読む途中で矢印だけの案内へ切り替えない。
    const touchEscape = escapeArrow && isTouch;
    const moveGesture = !rain && touchEscape && rt.def.dodgeMoveGesture !== false;
    // 指の絵がある時は、実際の操作を先に短く書く。
    const turnGesture = isTouch && (showTurn || rain && off);
    const label = turnGesture ? `ここから${turnRight ? '右' : '左'}へ` : rain ? off ? isTouch ? `${turnRight ? '右' : '左'}へなぞる` : `${turnRight ? '右' : '左'}を むこう` : 'ここへ' : moveGesture ? rt.def.dodgeMoveCaption?.(rt, moveSide, false) || 'ここからなぞって にげる' : escapeArrow ?
      rt.def.escapePlaceLabel?.(rt, !!rain, dodgeSide) || `${dodgeSide}へ よける` : baseLabel;
    const fontSize = 24 * Math.max(1, S.textScale || 1);
    const cardHalf = Math.min((W - 24) / 2, label.length * fontSize / 2 + (turnGesture || moveGesture ? 16 : 48));
    let lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, x)), ly = Math.max(28, y - 82);
    const gesture = el.querySelector('.escape-gesture');
    setStyle(gesture.querySelector('.swipe-end'), 'display', 'none');
    setStyle(gesture, 'display', (turnGesture || moveGesture) ? '' : 'none');
    for (const circle of gesture.querySelectorAll('circle')) circle.classList.remove('swipe-hand');
    setStyle(gesture.lastElementChild, 'display', '');
    gesture.lastElementChild.classList.remove('swipe-hand');
    let gestureClear = true;
    if (turnGesture) {
      // 実際に見回せる操作面へ指先・矢印・入力をまとめる。
      const start = this.playerControlOrigin(rt, true);
      // 進む側に百四十四画素を空け、端で指が止まらない始点にする。
      const swipeLength = Math.min(144, W * .22);
      const startX = Math.max(swipeLength + 40, Math.min(W - swipeLength - 40,
        W * (turnRight ? .58 : .42)));
      const startY = Math.max(132, Math.min(H - 80, start.y));
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, startX));
      ly = startY - 56;
      gesture.setAttribute('transform', `translate(${startX} ${startY + 12})`);
      gesture.querySelector('.swipe-arrow').setAttribute('d',
        `M0-12H${swipeLength}M${swipeLength - 14}-24L${swipeLength}-12L${swipeLength - 14} 0`);
      gesture.querySelector('.swipe-arrow').setAttribute('transform', turnRight ? '' : 'scale(-1 1)');
      gesture.querySelector('.swipe-arrow').setAttribute('style', 'filter:drop-shadow(0 0 2px #14120f)');
      // 始点の指を動かさず、矢印だけでなぞる向きを示す。
      const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
      origin.rt = rt; origin.at = rt.t; origin.x = startX; origin.y = startY;
      origin.look = true; origin.radius = 32;
    } else if (showTurn || off && rt.def.dodgeGuideLabel && label.length > 14) {
      // 戦固有の長い指図は上端へ離し、入口と進む道を空ける。
      ly = 34;
      let bestOverlap = Infinity;
      for (let i = 0; i < 3; i++) {
        const cx = i === 0 ? W / 2 : i === 1 ? cardHalf + 12 : W - cardHalf - 12;
        let overlap = 0;
        for (const r of obstacles) overlap += Math.max(0, Math.min(cx + cardHalf + 8, r.right) - Math.max(cx - cardHalf - 8, r.left)) *
          Math.max(0, Math.min(ly + 20, r.bottom) - Math.max(ly - 20, r.top));
        if (overlap < bestOverlap) { bestOverlap = overlap; lx = cx; }
      }
    }
    // 見えている戻り旗は札と一組。近い左右・上下だけを調べ、離れた空きへ飛ばさない。
    if (!off && !showTurn && !turnGesture) {
      let best = Infinity, bestOverlap = Infinity;
      for (let i = 0; i < 4; i++) {
        const cx = i === 0 ? x + 48 + cardHalf : i === 1 ? x - 20 - cardHalf : x;
        const cy = i < 2 ? y - 40 : i === 2 ? y - 88 : y + 32;
        if (cx - cardHalf < 12 || cx + cardHalf > W - 12 || cy - 20 < 12 || cy + 20 > H - 12) continue;
        let overlap = 0;
        for (const r of obstacles) overlap += Math.max(0, Math.min(cx + cardHalf + 8, r.right) - Math.max(cx - cardHalf - 8, r.left)) *
          Math.max(0, Math.min(cy + 24, r.bottom) - Math.max(cy - 24, r.top));
        const score = overlap * 100 + Math.hypot(cx - x, cy - (y - 28));
        if (score < best) { best = score; bestOverlap = overlap; lx = cx; ly = cy; }
      }
      gestureClear = bestOverlap === 0;
    }
    // 画面外への案内だけは、ほかの札をよけて空きへ置く。
    if (off && rt.def.dodgeAvoidNotices && !turnGesture) {
      const spot = this.avoidRects(lx, ly + 20, W, H, 'h', null, cardHalf + 8, 40, true);
      if (spot) { lx = spot[0]; ly = spot[1] - 20; }
      else gestureClear = false;
    }
    // 画面外では旗を端に残し、札だけをその隣へ置く。
    if (off && !showTurn && !turnGesture) {
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12,
        x + (turnRight ? -1 : 1) * (64 + cardHalf)));
      const spot = this.avoidRects(lx, y - 20, W, H, 'v', null, cardHalf + 4, 40, true);
      gestureClear = !!spot;
      if (spot) ly = spot[1] - 20;
      // 札の空きがなくても、行き先の旗と方向は消さない。
    }
    if (escapeArrow && !moveGesture && !rain) {
      const floor = this.escapeFloor || (this.escapeFloor = { x:0, y:0, z:0 });
      const length = Math.hypot(cue.x, cue.z) || 1;
      for (let i = 0; i < 4; i++) {
        const step = Math.min(length, 3.5 - i * .7);
        floor.x = p.x + cue.x / length * step; floor.z = p.z + cue.z / length * step;
        floor.y = groundAt(rt.world, floor.x, floor.z, p.y);
        const screen = this.project(floor, floor.y + .1, rt);
        if (screen.behind || screen.x < 96 || screen.x > W - 96 || screen.y < 96 || screen.y > H - 80 ||
            !localClear(rt.army, p, floor) || !this.floorGoalVisible(rt, floor)) continue;
        x = screen.x; y = screen.y; break;
      }
      gestureClear = true;
      // 指定した戦では、中央へ戻した短い回避札も任務の欄を避ける。
      if (rt.def.avoidCenteredDodgeNotice) {
        const spot = this.avoidRects(lx, ly + 20, W, H, 'h', null, cardHalf + 8, 40, true);
        gestureClear = !!spot;
        if (spot) { lx = spot[0]; ly = spot[1] - 20; }
      }
    }
    if (moveGesture) {
      // 入力と同じ向きへ、指先から短い矢印一本で逃げ方を示す。
      const angle = moveSide === '右上' ? -45 : moveSide === '右下' ? 45 : moveSide === '左上' ? -135 : moveSide === '左下' ? 135 :
        moveSide === '右' ? 0 : moveSide === '左' ? 180 : moveSide === '下' ? 90 : -90;
      const ax = Math.cos(angle * Math.PI / 180), ay = Math.sin(angle * Math.PI / 180);
      const start = this.playerControlOrigin(rt, false);
      const startX = start.x, startY = start.y;
      const length = Math.max(28, Math.min(72,
        ax > .001 ? (W - 32 - startX) / ax : ax < -.001 ? (32 - startX) / ax : Infinity,
        ay > .001 ? (H - 32 - startY) / ay : ay < -.001 ? (80 - startY) / ay : Infinity));
      const dx = ax * length;
      const dy = ay * length;
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, startX));
      ly = Math.max(28, startY - 76);
      const distance = Math.hypot(dx, dy) || 1, ux = dx / distance, uy = dy / distance;
      const tipX = dx, tipY = dy - 12;
      gesture.setAttribute('transform', `translate(${startX} ${startY + 12})`);
      const arrow = gesture.querySelector('.swipe-arrow');
      arrow.setAttribute('d', `M0 -12L${tipX} ${tipY}M${tipX - ux * 14 - uy * 10} ${tipY - uy * 14 + ux * 10}L${tipX} ${tipY}L${tipX - ux * 14 + uy * 10} ${tipY - uy * 14 - ux * 10}`);
      arrow.removeAttribute('transform');
      arrow.setAttribute('style', 'filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f)');
      const swipeEnd = gesture.querySelector('.swipe-end');
      swipeEnd.setAttribute('transform', `translate(${tipX} ${tipY})`);
      setStyle(swipeEnd, 'display', 'none');
      // 指先は移動の操作面へ固定し、「ここ」を動かさない。
      setStyle(gesture, 'display', '');
      const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
      origin.rt = rt; origin.at = rt.t; origin.x = startX; origin.y = startY;
      origin.look = false; origin.radius = 36;
      gestureClear = true;
    }
    if (showTurn && isTouch && gestureClear && !rt.turnPractice && rt.def.pauseTurnPractice !== false) {
      rt.turnPractice = { active: true, done: false, swipe: 0 };
    }
    if (rt.turnPractice?.active && (!showTurn || !gestureClear)) {
      rt.turnPractice.active = false; rt.turnPractice.done = true;
    }
    setClass(this.root, 'dodge-turn-coach', showTurn && isTouch && gestureClear);
    // 大きな「〜へ よける」の札は下の操作の帯（槍・鬨の声…）に重ねない。帯の上へ離す（kaito 10/22 稲生 14）。
    {
      const bar = document.getElementById('h-bottom');
      const top = bar && !bar.hidden && bar.offsetParent ? bar.getBoundingClientRect().top : H;
      if (ly + 34 > top - 8) ly = Math.max(28, top - 8 - 34);
    }
    el.querySelector('.escape-card').setAttribute('transform', `translate(${lx} ${ly})`);
    setStyle(el.querySelector('.escape-card'), 'display', !gestureClear ? 'none' : '');
    const card = el.querySelector('.escape-card rect');
    card.setAttribute('x', -cardHalf); card.setAttribute('width', cardHalf * 2);
    card.setAttribute('y', -20); card.setAttribute('height', 40);
    card.setAttribute('fill', '#14120f');
    el.querySelector('.escape-label').setAttribute('font-size', fontSize);
    setText(el.querySelector('.escape-label'), label);
    el.querySelector('.escape-label').setAttribute('x', off && !showTurn && !turnGesture && !moveGesture ? turnRight ? '-12' : '12' : '0');
    const cardFlag = el.querySelector('.escape-card-flag');
    setStyle(cardFlag, 'display', 'none');
    // 回避先も一つの矢印だけ。見えている時は実際の床、画面外では端へ付ける。
    const turn = el.querySelector('.escape-turn');
    const destination = el.querySelector('.escape-destination');
    const compactEscape = !!rt.def.shortDodgeArrow;
    setStyle(destination, 'display', turnGesture || !off || escapeArrow ? 'none' : '');
    // 相手と退き先は、同じ太い輪と旗で見つけられるようにする。
    cardFlag.firstElementChild.setAttribute('d', 'M0-12H24L18-4L24 4H0Z');
    setStyle(cardFlag.lastElementChild, 'display', 'none');
    cardFlag.setAttribute('transform', `translate(${off && !showTurn && !turnRight ? cardHalf - 36 : -cardHalf + 16} 0) scale(.8)`);
    const flag = destination.children[1];
    setStyle(flag, 'display', '');
    // 小印を指定した船上では旗竿を立てず、足元のひし形にする。
    const diamond = !!rt.def.dodgeDiamondSign;
    flag.setAttribute('d', diamond ? 'M0-12L10-2L0 8L-10-2Z' : 'M0-56H32L24-44L32-32H0Z');
    flag.setAttribute('stroke-width', diamond ? '4' : '13');
    destination.children[2].setAttribute('stroke-width', '13');
    destination.children[3].setAttribute('stroke', '#ffffff');
    destination.children[3].setAttribute('stroke-width', '6');
    destination.children[2].setAttribute('d', 'M0 0V-56');
    destination.children[3].setAttribute('d', 'M0 0V-56');
    setStyle(destination.children[2], 'display', diamond ? 'none' : ''); setStyle(destination.children[3], 'display', diamond ? 'none' : '');
    // 白縁用に複製した旗面も畳む。ひし形の上に元の旗だけを残さない。
    setStyle(destination.children[4], 'display', diamond ? 'none' : '');
    destination.setAttribute('transform', `translate(${x} ${y}) scale(${compactEscape ? .5 : escapeArrow && !off ? 1 : .65})`);
    cue.markX = x; cue.markY = y; cue.cardX = lx; cue.cardY = ly; cue.cardHalf = cardHalf;
    // 足元の太い輪は共通の描画へ任せ、旗を囲む二重の輪は重ねない。
    setStyle(destination.querySelector('.escape-edge-ring'), 'display', 'none');
    cue.onScreen = !off;
    turn.setAttribute('fill', '#fff3ba'); turn.setAttribute('stroke', '#14120f'); turn.setAttribute('stroke-width', '4');
    setStyle(turn, 'display', turnGesture || moveGesture ? 'none' : escapeArrow ? '' : cue.arrived || !off && (rain || showTurn || !dodgeMarkClear) ? 'none' : '');
    turn.setAttribute('d', off ? 'M-8 18L-8-4L-18-4L0-24L18-4L8-4L8 18Z' : 'M-6-28H6V-14H14L0 0L-14-14H-6Z');
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const right = -cue.x * Math.cos(yaw) + cue.z * Math.sin(yaw);
    const forward = cue.x * Math.sin(yaw) + cue.z * Math.cos(yaw);
    turn.setAttribute('transform', `translate(${off ? x : x - 20} ${off ? y + 28 : y})${off ? ` rotate(${Math.atan2(right, forward) * 180 / Math.PI}) scale(.65)` : ''}`);
    const routeOutline = el.querySelector('.escape-route-outline');
    setStyle(routeOutline, 'display', escapeArrow && !moveGesture && !turnGesture ? '' : 'none');
    routeOutline.setAttribute('stroke-width', compactEscape ? '5' : '13');
    if (escapeArrow && !moveGesture && !rain) {
      // 自分のそばの太い矢印一本。遠い旗と長い線を同時に置かない。
      const foot = this.project(p, p.y + .08, rt,
        this.escapeFootProjection || (this.escapeFootProjection = {}));
      const fx = foot.behind ? W / 2 : foot.x, fy = foot.behind ? H - 32 : foot.y;
      const dx = off ? right : x - fx, dy = off ? -forward : y - fy;
      const distance = Math.hypot(dx, dy) || 1, ux = dx / distance, uy = dy / distance;
      const length = Math.max(0, Math.min(112,
        ux > .001 ? (W - 24 - fx) / ux : ux < -.001 ? (24 - fx) / ux : 112,
        uy > .001 ? (H - 24 - fy) / uy : uy < -.001 ? (76 - fy) / uy : 112));
      const tx = fx + ux * length, ty = fy + uy * length;
      const arrowScale = Math.max(.35, Math.min(1, (length - 32) / 64));
      turn.setAttribute('d', 'M0 0L-18-22H-7V-64H7V-22H18Z');
      turn.setAttribute('transform', `translate(${tx} ${ty}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}) scale(${arrowScale})`);
      turn.setAttribute('fill', '#fff3ba'); turn.setAttribute('stroke', '#14120f');
      turn.setAttribute('stroke-width', '6');
      setStyle(routeOutline, 'display', 'none');
      // 回避の言葉を矢印のすぐ上にまとめ、操作する足元から離さない。
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, (fx + tx) / 2));
      ly = Math.max(96, Math.min(H - 64, Math.min(fy, ty) - 36));
      // 足元へ置き直した後も、指定した戦では操作欄と下知の札を避ける。
      // 空きがなければ方向の矢印だけ残す。
      if (rt.def.avoidCenteredDodgeNotice) {
        const spot = this.avoidRects(lx, ly + 20, W, H, 'h', null, cardHalf + 8, 40, true);
        gestureClear = !!spot;
        if (spot) { lx = spot[0]; ly = spot[1] - 20; }
      }
      el.querySelector('.escape-card').setAttribute('transform', `translate(${lx} ${ly})`);
      setStyle(el.querySelector('.escape-card'), 'display', rt.def.avoidCenteredDodgeNotice && !gestureClear ? 'none' : '');
      el.querySelector('.escape-label').setAttribute('x', '0');
      cue.cardX = lx; cue.cardY = ly;
    }
    if (rain && !turnGesture) {
      // 矢をよける先は実際の地面の大きな輪と一枚の札にまとめる。
      x = off ? x : end.x; y = off ? y : end.y;
      setStyle(gesture, 'display', 'none');
      setStyle(routeOutline, 'display', 'none');
      setStyle(destination, 'display', off ? 'none' : '');
      destination.setAttribute('transform', `translate(${x} ${y})`);
      const ring = destination.querySelector('.escape-edge-ring');
      setStyle(ring, 'display', '');
      for (const ellipse of ring.children) { ellipse.setAttribute('rx', '48'); ellipse.setAttribute('ry', '20'); }
      ring.firstElementChild.setAttribute('stroke-width', '13');
      ring.lastElementChild.setAttribute('stroke-width', '7');
      for (let i = 1; i < destination.children.length; i++) setStyle(destination.children[i], 'display', '');
      setStyle(turn, 'display', off ? '' : 'none');
      turn.setAttribute('d', 'M0 0L-18-22H-7V-64H7V-22H18Z');
      turn.setAttribute('transform', `translate(${x} ${y}) rotate(${Math.atan2(-forward, right) * 180 / Math.PI - 90}) scale(.8)`);
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, x));
      ly = Math.max(32, y - 80);
      el.querySelector('.escape-card').setAttribute('transform', `translate(${lx} ${ly})`);
      el.querySelector('.escape-label').setAttribute('x', '0');
      setStyle(el.querySelector('.escape-card'), 'display', '');
      cue.cardX = lx; cue.cardY = ly; cue.markX = x; cue.markY = y;
    }
    cue.gestureShown = (turnGesture || moveGesture) && gestureClear;
    rt.dodgeGuide = cue;
    this.updateDodgeAction(rt, cue, el, dodgeSide, escapeArrow && isTouch && !showTurn && !moveGesture && !rain);
    return cue;
  }
}
