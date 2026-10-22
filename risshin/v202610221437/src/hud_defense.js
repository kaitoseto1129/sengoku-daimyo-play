import { groundAt } from "./floors.js";
import { VIEW } from "./viewport.js";
import { singleBattleGuide, defenseRadius, $, setClass, setCssVar, guardPostDistance } from "./hud_common.js";
import { isTouch } from "./touch.js";

export class HudDefense {


  guardControlPoint(rt, guide) {
    const center = guide.marker.guideDestination?.() || guide.pos;
    const point = this.guardControlGround || (this.guardControlGround = { x: 0, y: 0, z: 0 });
    if (this.waitGuardHeldBattle === rt && this.guardHoldPositioned) return point;
    point.x = center.x;
    point.z = center.z;
    point.y = groundAt(rt.world, point.x, point.z, rt.player.u.pos.y);
    return point;
  }


  // 守備の到着判定と同じ円を地面へ描き、内側の見える床を旗の置き場にする。
  defenseGroundSpot(g, rt, pos, radius) {
    const spot = this.defenseGroundPoint || (this.defenseGroundPoint = {});
    spot.visible = false; spot.overview = false;
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    this.drawDefenseBoundary(g, rt, pos, radius);
    let best = Infinity;
    // 中心が背後でも、範囲内の床からだけ選ぶ。旗を画面端へずらさない。
    for (let i = 0; i < 25; i++) {
      const angle = i * Math.PI / 4, distance = i === 0 ? 0 : radius * (i <= 8 ? .3 : i <= 16 ? .55 : .8);
      const x = pos.x + Math.cos(angle) * distance, z = pos.z + Math.sin(angle) * distance;
      this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .15, z).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z < -1 || this.tmpV.z > 1 || sx < 64 || sx > W - 64 || sy < 152 || sy > H - 48) continue;
      const score = Math.hypot(sx - W * .5, sy - H * .65) + distance;
      if (score < best) { best = score; spot.x = sx; spot.y = sy; spot.visible = true; }
    }
    // 境目だけが画面外でも、範囲内の床が見えればそこへ旗を置く。
    if (!spot.visible) this.drawDefenseOverview(g, rt, pos, radius, spot);
    return spot;
  }


  // 守備の判定と同じ境目を地面へ投影する。中は塗らず、兵と地形を見せる。
  drawDefenseBoundary(g, rt, pos, radius) {
    const circle = this.defenseCircle || (this.defenseCircle = new Float32Array(98));
    if (!this.defenseCircleReady) {
      for (let i = 0; i <= 48; i++) {
        circle[i * 2] = Math.cos(i / 48 * Math.PI * 2);
        circle[i * 2 + 1] = Math.sin(i / 48 * Math.PI * 2);
      }
      this.defenseCircleReady = true;
    }
    const projected = this.defenseProjection || (this.defenseProjection = new Float32Array(147));
    for (let i = 0; i <= 48; i++) {
      const x = pos.x + circle[i * 2] * radius, z = pos.z + circle[i * 2 + 1] * radius;
      this.tmpV.set(x, groundAt(rt.world, x, z, rt.player.u.pos.y) + .15, z).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
      const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
      projected[i * 3] = sx; projected[i * 3 + 1] = sy; projected[i * 3 + 2] = visible ? 1 : 0;
    }
    // 輪の全体が入らなくても、見えている境目は地面に残す。
    let previous = false, drawn = false;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip(); g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const visible = projected[i * 3 + 2];
      const sx = projected[i * 3], sy = projected[i * 3 + 1];
      if (visible && previous) {
        g.lineTo(sx, sy);
        const px = projected[(i - 1) * 3], py = projected[(i - 1) * 3 + 1];
        if (Math.max(px, sx) >= 12 && Math.min(px, sx) <= VIEW.w - 12 &&
            Math.max(py, sy) >= 64 && Math.min(py, sy) <= VIEW.h - 24) drawn = true;
      } else if (visible) g.moveTo(sx, sy);
      previous = visible;
    }
    // 太い点線を二色で縁取り、中は塗らずに兵と地形を見せる。
    this.defenseDash ||= [12, 10];
    g.setLineDash(this.defenseDash);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke(); g.restore();
    return drawn;
  }


  // 見取り図は右下の小さい一組。上が見ている方向で、丸は実際の守備半径。
  drawDefenseOverview(g, rt, pos, radius, spot) {
    const order = $('objectives'), facing = order.classList.contains('facing-order');
    const x = facing && !order.classList.contains('facing-left') ? 104 : VIEW.w - 104;
    const y = VIEW.h - (facing ? 148 : 108), r = 54;
    const p = rt.player.u.pos, dx = p.x - pos.x, dz = p.z - pos.z;
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const distance = Math.hypot(dx, dz), scale = Math.min(r / Math.max(.1, radius), 64 / Math.max(.1, distance));
    const px = x + right * scale, py = y - forward * scale;
    g.save();
    g.fillStyle = 'rgba(20,18,15,.82)'; g.fillRect(x - 88, y - 92, 176, 180);
    g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff3ba'; g.fillText('守る場所の地図', x, y - 80);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
    // 旗は守備の中心。本人は小さな白い輪で示し、範囲の内外を保つ。
    this.drawSmallGoalFlag(g, x, y, .45, false, false, '');
    g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.fillText('自分', px, py + 17);
    if (distance > radius) {
      const angle = Math.atan2(y - py, x - px);
      this.drawNavigationArrow(g, px + Math.cos(angle) * 20, py + Math.sin(angle) * 20, angle, .25, true);
    }
    g.restore();
    spot.x = x; spot.y = y; spot.visible = true; spot.overview = true;
  }


  // 守る範囲とその中の旗へ、既存の任務一枚をまとめる。
  drawDefendedFlag(g, rt, marker, pos) {
    if (!singleBattleGuide(rt) || !marker?.guideDefend || !pos) return false;
    if (this.defendedFlagDrawn) return true;
    const flag = marker.guideFlagMesh?.();
    const radius = defenseRadius(rt, marker);
    const ground = this.defenseGroundSpot(g, rt, pos, radius);
    if (!ground.visible && !flag?.visible) return false;
    const visible = ground.visible;
    let x, y;
    if (visible) {
      x = ground.x; y = ground.y;
      // 範囲内の地面へ旗を一つ置き、札もそのすぐ上にまとめる。
      if (!ground.overview) this.drawNamedGoal(g, x, y);
    } else {
      // 範囲が画面外なら、同じ守備位置へ端の矢印を向ける。
      const p = rt.player.u.pos, dx = pos.x - p.x, dz = pos.z - p.z;
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const angle = Math.atan2(-forward, right);
      x = right >= 0 ? VIEW.w - 112 : 112; y = Math.max(152, VIEW.h / 2);
      this.drawSmallGoalFlag(g, x - 10, y, .65, false, false, '');
      this.drawNavigationArrow(g, x + Math.cos(angle) * 44, y + Math.sin(angle) * 44, angle, .55, true);
    }
    const order = $('objectives'), width = order.offsetWidth, height = order.offsetHeight;
    if (this.notices.sources[1].selected && !order.classList.contains('expand') &&
        !order.classList.contains('facing-order') && !order.classList.contains('enemy-order')) {
      setClass(order, 'enemy-order', false);
      setClass(order, 'approach-order', false);
      setClass(order, 'swipe-order', false);
      setClass(order, 'defense-order', false);
      setClass(order, 'linked-destination', false);
      setClass(order, 'ground-order', true);
      setClass(order, 'destination-sign', true);
      const left = Math.max(16, Math.min(VIEW.w - width - 16, x - width / 2));
      const top = Math.max(64, Math.min(VIEW.h - height - 24, y - (ground.overview ? 100 : 64) - height));
      setCssVar(order, '--ground-order-x', Math.round(left) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(top) + 'px');
      // 守備の輪と小旗の上へ札を置き、長い矢印を重ねない。
    }
    this.defendedFlagDrawn = true;
    this.defenseAreaDrawn = true;
    return true;
  }


  // 守る判定と同じ半径を囲み、旗と既存の任務札で場所を示す。
  drawDefenseArea(g, rt, guide) {
    const defended = guide?.marker;
    if (defended?.guideDefend && this.drawDefendedFlag(g, rt, defended, defended.guideDestination?.() || guide.pos)) return true;
    if (this.aimGuideEnemy?.alive || this.approachGuideEnemy?.alive || this.defendEnemy?.alive ||
        rt.guideEnemyShown || this.outlinedEnemy?.alive) return false;
    if (this.defenseAreaDrawn) return true;
    if (isTouch && ($('objectives').classList.contains('facing-order') || !this.waitFacingReady && rt.def.waitFacingPoint?.(rt))) return false;
    const marker = guide?.marker;
    if (!marker || marker.guideArea !== 'guard' && !marker.guideDefend) return false;
    const pos = marker.guideDestination?.() || guide.pos, radius = defenseRadius(rt, marker);
    if (!pos) return false;
    if (this.drawDefendedFlag(g, rt, marker, pos)) return true;
    // 到着前は端の移動案内を先にし、守る札へ切り替えない。
    if (guardPostDistance(rt, guide) >= radius) return false;
    if (singleBattleGuide(rt)) {
      this.defenseAreaDrawn = this.drawDefenseBoundary(g, rt, pos, radius);
      return this.defenseAreaDrawn;
    }
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const center = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .15, rt,
      this.defenseCenter || (this.defenseCenter = {}));
    const circle = this.defenseCircle || (this.defenseCircle = new Float32Array(98));
    if (!this.defenseCircleReady) {
      for (let i = 0; i <= 48; i++) {
        circle[i * 2] = Math.cos(i / 48 * Math.PI * 2);
        circle[i * 2 + 1] = Math.sin(i / 48 * Math.PI * 2);
      }
      this.defenseCircleReady = true;
    }
    let flagX = center.x, flagY = center.y;
    let previous = false, drawn = false, edgeY = Infinity;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip(); g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const x = pos.x + circle[i * 2] * radius, z = pos.z + circle[i * 2 + 1] * radius;
      this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .15, z).project(rt.camera);
      const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (visible && previous) { g.lineTo(sx, sy); drawn = true; }
      else if (visible) g.moveTo(sx, sy);
      if (visible && sx >= 40 && sx <= W - 64 && sy >= 120 && sy <= H - 40 && sy < edgeY) {
        flagX = sx; flagY = sy; edgeY = sy;
      }
      previous = visible;
    }
    // 守る範囲は中空の破線。旗の竿を囲みへ直接つなぎ、一つの場所に見せる。
    this.defenseDash ||= [12, 10];
    g.setLineDash(this.defenseDash); g.lineCap = 'round';
    g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke(); g.restore();
    if (edgeY < Infinity) {
      const order = $('objectives');
      // 札を増やさず、守備の下知だけを旗の近くへ置いて一本の線で結ぶ。
      if (order.classList.contains('flag-task') && !order.classList.contains('expand') && this.notices.sources[1].selected) {
        const width = order.offsetWidth, height = order.offsetHeight;
        const left = Math.max(12, Math.min(W - width - 12, flagX + 40));
        const top = Math.max(64, Math.min(H - height - 24, flagY - height - 32));
        setClass(order, 'defense-order', true);
        setCssVar(order, '--defense-order-x', Math.round(left) + 'px');
        setCssVar(order, '--defense-order-y', Math.round(top) + 'px');
        g.save(); g.lineCap = 'round'; g.beginPath();
        g.moveTo(Math.max(left, Math.min(left + width, flagX)), top + height);
        g.lineTo(flagX, flagY - 12);
        g.moveTo(flagX - 7, flagY - 23); g.lineTo(flagX, flagY - 12); g.lineTo(flagX + 7, flagY - 23);
        g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
        g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
      }
      this.drawFlagDestinationSign(g, flagX + 9, flagY - 17);
    }
    this.defenseAreaDrawn = drawn;
    return drawn;
  }


  drawGuardPost(g, rt, guide) {
    if (this.aimGuideEnemy?.alive || this.outlinedEnemy?.alive || rt.guideEnemyShown) return false;
    // 敵が迫っても持ち場の輪を残す。柵や兵による遮りでは消さない。
    if (this.openingActive || isTouch && $('objectives').classList.contains('facing-order')) return false;
    const frame = rt.def.guardPostFrame?.(rt, guide);
    if (frame) this.drawGuardPostFrame(g, rt, frame);
    // 持ち場へ向かう間は、画面の外でも既存の行き先矢印を残す。
    if (guardPostDistance(rt, guide) >= (guide.marker.guideRadius || 8)) {
      return this.drawSingleDestination(g, rt, guide.marker.guideDestination?.() || guide.pos, guide.marker);
    }
    if (this.drawDefenseArea(g, rt, guide)) return true;
    // 押す札と守る実物の枠を残し、追加の文章は重ねない。
    if (isTouch && this.waitGuardButton && !this.waitGuardButton.hidden &&
        this.waitGuardButton.classList.contains('ground-hold')) return true;
    const point = this.guardControlPoint(rt, guide);
    const ringDrawn = this.drawTargetFootRing(g, rt, point, 1, false, true, true);
    // 守る場所を短い札と矢印で示す。操作札と既存の知らせを含め三枚まで。
    const occupied = 1 + this.notices.picks.length + Number(!!this.waitGuardButton && !this.waitGuardButton.hidden) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.touchCoachActive || !!rt.nearestInteract()) + Number(!$('h-hp').hidden);
    const screen = this.project(point, point.y + .1, rt, this.guardPostProjection || (this.guardPostProjection = {}));
    // 札の空きがなくても、地面を指す矢印は輪と一緒に残す。
    if (ringDrawn) {
      g.save(); g.lineJoin = 'round'; g.beginPath();
      g.moveTo(screen.x, screen.y - 34); g.lineTo(screen.x, screen.y - 5);
      g.moveTo(screen.x - 9, screen.y - 16); g.lineTo(screen.x, screen.y - 5); g.lineTo(screen.x + 9, screen.y - 16);
      g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke(); g.restore();
    }
    const x = Math.max(84, Math.min(VIEW.w - 84, screen.x)), y = screen.y - 68;
    let clear = occupied < 3 && !screen.behind && screen.x >= 24 && screen.x <= VIEW.w - 24 && y >= 72 && screen.y < VIEW.h - 24;
    if (clear) for (const r of this.hudRects()) {
      if (x + 80 > r.left && x - 80 < r.right && screen.y > r.top && y < r.bottom) { clear = false; break; }
    }
    if (clear) {
      g.save(); g.lineJoin = 'round';
      g.fillStyle = '#14120f'; g.fillRect(x - 80, y, 160, 30);
      g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff3ba'; g.fillText(guardPostDistance(rt, guide) >= (guide.marker.guideRadius || 8) ? 'ここへ進め' : 'ここを まもれ', x, y + 15);
      g.restore();
      return true;
    }
    return !!ringDrawn;
  }


  // 柵など守る実物を中空の枠と盾の形で示す。投影の入れ物は使い回す。
  drawGuardPostFrame(g, rt, frame) {
    const points = this.guardFrameScreens || (this.guardFrameScreens = Array.from({ length:4 }, () => ({})));
    for (let i = 0; i < 4; i++) {
      const p = frame[i], s = this.project(p, p.y, rt, points[i]);
      if (s.behind) return false;
    }
    g.save(); g.beginPath(); g.rect(12, 12, VIEW.w - 24, VIEW.h - 24); g.clip();
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < 4; i++) {
      if (i === 0) g.moveTo(points[i].x, points[i].y); else g.lineTo(points[i].x, points[i].y);
    }
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    const x = (points[0].x + points[1].x) / 2, y = (points[0].y + points[1].y) / 2 - 22;
    g.beginPath(); g.moveTo(x - 12, y - 12); g.lineTo(x + 12, y - 12);
    g.lineTo(x + 12, y); g.quadraticCurveTo(x + 10, y + 10, x, y + 16);
    g.quadraticCurveTo(x - 10, y + 10, x - 12, y); g.closePath();
    g.fillStyle = '#14120f'; g.fill(); g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + 7);
    g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke();
    g.restore(); return true;
  }


  strokeGroundArea(g, prominent = false, guardArea = false) {
    g.save();
    this.groundAreaDash ||= [6, 14];
    this.groundAreaSolid ||= [];
    g.setLineDash(prominent && !guardArea ? this.groundAreaSolid : this.groundAreaDash);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalAlpha *= prominent || guardArea ? 1 : .8;
    g.strokeStyle = '#14120f'; g.lineWidth = guardArea ? 4 : prominent ? 10 : 3.5; g.stroke();
    g.strokeStyle = prominent || guardArea ? '#ffffff' : '#d6c79e'; g.lineWidth = guardArea ? 1.5 : prominent ? 5 : 1.5; g.stroke();
    g.restore();
  }


  // 到着判定と同じ範囲を地面へ描く。画面の外へ続く輪は端で切る。
  drawDestinationArea(g, rt, pos, radius, checkCenter = true, compact = rt.def.compactDestinationArea, prominent = false) {
    if (rt.missionGuide?.marker?.guideDefend) return this.drawDefenseArea(g, rt, rt.missionGuide);
    const guardArea = rt.missionGuide?.marker?.guideArea === 'guard';
    if (guardArea && Math.hypot(pos.x - rt.player.u.pos.x, pos.z - rt.player.u.pos.z) >= radius) return false;
    if (singleBattleGuide(rt) && !guardArea) return this.drawTargetFootRing(g, rt, pos, .65);
    // 操作中の持ち場は押せる枠一つで示す。
    if (!guardArea && !prominent && this.root.classList.contains('wait-guard-active') && !this.retreatGuide?.active) return;
    // 指定した戦は案内の中心だけを示す。待機・退避側が compact を外しても、
    // 画面を横切る実線へ戻さない。到着・守備の範囲は変えない。
    // 退避も小さな印にする戦だけ、強調した大輪を足元の印へ置き換える。
    if (rt.def.smallTaskAreas && (!prominent || rt.def.smallRetreatAreas)) {
      if (rt.def.taskAreaFootRing) return this.drawTargetFootRing(g, rt, pos, .65);
      return this.drawFloorGoal(g, rt, pos.x, pos.z, false, Math.min(radius, .75));
    }
    // 待機は到着範囲の白い囲み、守備は戦ごとに指定した足元の印を使う。
    const area = rt.missionGuide?.marker?.guideArea;
    if (!prominent && area === 'wait' && rt.def.waitFacingPoint?.(rt)) {
      return this.drawWaitFrame(g, rt, pos, radius);
    }
    if (!prominent && compact && (rt.def.compactGuardArea && area === 'guard' || rt.def.compactWaitArea && area === 'wait')) {
      this.drawTargetFootRing(g, rt, pos, .85, false, true);
      return;
    }
    if (!this.floorGoalVisible(rt, pos, checkCenter)) return;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.beginPath();
    const boundary = this.areaBoundary || (this.areaBoundary = { x: 0, y: 0, valid: false });
    boundary.valid = false;
    let previousVisible = false, whole = true;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i <= 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const x = pos.x + Math.cos(angle) * radius, z = pos.z + Math.sin(angle) * radius;
      this.tmpV.set(x, groundAt(rt.world, x, z, pos.y ?? rt.player.u.pos.y) + .15, z).project(rt.camera);
      const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
      const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
      if (visible && sx >= 20 && sx <= VIEW.w - 20 && sy >= 72 && sy <= VIEW.h - 32 &&
          (!boundary.valid || sy < boundary.y)) {
        boundary.x = sx; boundary.y = sy; boundary.valid = true;
      }
      whole = whole && visible;
      left = Math.min(left, sx); right = Math.max(right, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
      if (visible && previousVisible) g.lineTo(sx, sy);
      else if (visible) g.moveTo(sx, sy);
      previousVisible = visible;
    }
    // 大きな輪が画面を覆う時も、実際の中心に小さな枠を残す。到着判定は変えない。
    if (!guardArea && !prominent && compact && (!whole || left < 12 || right > VIEW.w - 12 ||
        top < 64 || bottom > VIEW.h - 24 || right - left > VIEW.w / 3 || bottom - top > VIEW.h / 3)) {
      g.restore();
      // 旗の足元を四角で囲む。塗りつぶさず、兵と地面を見せる。
      const size = Math.min(radius, 1.6);
      g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
      g.beginPath();
      let previous = false;
      for (let i = 0; i <= 16; i++) {
        const edge = Math.floor(i / 4) % 4, t = (i % 4) / 4;
        const x = pos.x + size * (edge === 0 ? -1 + 2 * t : edge === 1 ? 1 : edge === 2 ? 1 - 2 * t : -1);
        const z = pos.z + size * (edge === 0 ? -1 : edge === 1 ? -1 + 2 * t : edge === 2 ? 1 : 1 - 2 * t);
        this.tmpV.set(x, groundAt(rt.world, x, z, pos.y ?? rt.player.u.pos.y) + .15, z).project(rt.camera);
        const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
        const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (visible && previous) g.lineTo(sx, sy);
        else if (visible) g.moveTo(sx, sy);
        previous = visible;
      }
      this.strokeGroundArea(g, true); g.restore();
      return;
    }
    // 輪の中に着いた後、画面を横切る大きな弧は戦場を隠すだけ。旗と足元の印に任せる。
    const me = rt.player.u.pos;
    if (!guardArea && Math.hypot(me.x - pos.x, me.z - pos.z) < radius && right - left > VIEW.w * .6) { g.restore(); return; }
    const marker = rt.missionGuide?.marker;
    this.strokeGroundArea(g, !guardArea && (prominent || marker?.guideArea === 'retreat' || marker?.guideArea === 'wait' || marker?.guideArea === 'guard' || !!marker?.waitGuide), guardArea); g.restore();
    return boundary.valid ? boundary : null;
  }
}
