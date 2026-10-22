import { isTouch } from "./touch.js";
import { groundAt } from "./floors.js";
import { VIEW } from "./viewport.js";
import { $, setCssVar, travelSignPriority, singleBattleGuide, setHidden, retreatRequired, guidanceEnded } from "./hud_common.js";
import { localClear } from "./army_local_way.js";
import { sightScreenUnit } from "./battle_sight.js";
import { rainDanger } from "./arrow_rain.js";
import { S } from "./settings.js";

export class HudEnemy {


  // 届く距離になる前も、向きと移動の操作を分けて教える。
  meleeApproachText(rt) {
    const enemy = this.approachGuideEnemy;
    if (isTouch && enemy?.alive) {
      const p = rt.player.u.pos;
      const angle = Math.atan2(enemy.pos.x - p.x, enemy.pos.z - p.z) - rt.player.yaw;
      if (Math.cos(angle) < .9) return `画面を${Math.sin(angle) <= 0 ? '右' : '左'}へなぞる`;
    }
    return (typeof rt.def.meleeApproachText === 'function' ? rt.def.meleeApproachText(rt) : rt.def.meleeApproachText) ||
      (isTouch ? '上になぞって近づく' : '近づいて たたかう');
  }


  meleeApproachPoint(rt, enemy) {
    const p = rt.player.u.pos, dx = p.x - enemy.pos.x, dz = p.z - enemy.pos.z;
    const distance = Math.hypot(dx, dz) || 1;
    const reach = rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') * .8;
    const goal = this.meleeApproachGoal || (this.meleeApproachGoal = { x:0, y:0, z:0 });
    goal.x = enemy.pos.x + dx / distance * reach;
    goal.z = enemy.pos.z + dz / distance * reach;
    goal.y = groundAt(rt.world, goal.x, goal.z, p.y);
    return goal;
  }


  // 選んだ本人だけを太く囲む。中は塗らず、重なった兵の動きを残す。
  drawPersonOutline(g, frame, ally = false, corners = false) {
    const height = frame.bottom - frame.top;
    if (height <= 0) return;
    const left = frame.left - 6, right = frame.right + 6;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    if (corners) {
      // 指定した戦だけ四隅へ畳む。相手の位置と呼び名は残し、胴の脇を空ける。
      const edge = Math.min(12, (right - left) / 3, height / 4), bottom = frame.bottom + 3;
      g.moveTo(left, frame.top + edge); g.lineTo(left, frame.top); g.lineTo(left + edge, frame.top);
      g.moveTo(right - edge, frame.top); g.lineTo(right, frame.top); g.lineTo(right, frame.top + edge);
      g.moveTo(left, bottom - edge); g.lineTo(left, bottom); g.lineTo(left + edge, bottom);
      g.moveTo(right - edge, bottom); g.lineTo(right, bottom); g.lineTo(right, bottom - edge);
    } else g.roundRect(left, frame.top, right - left, height + 3, ally ? 10 : 2);
    g.strokeStyle = '#14120f'; g.lineWidth = corners ? 6 : 12; g.stroke();
    g.strokeStyle = ally ? '#fff3ba' : '#fff'; g.lineWidth = corners ? 3 : 6; g.stroke(); g.restore();
  }


  // 相手の枠と頭上で共通の印。色だけに頼らず、一人の目標を見分ける。
  drawFocusDiamond(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x, y - 9); g.lineTo(x + 8, y); g.lineTo(x, y + 9); g.lineTo(x - 8, y); g.closePath();
    g.fillStyle = '#14120f'; g.fill();
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
  }


  // 選んだ一人だけ、現在の頭・腕・脚に沿う輪郭を重ねる。投影用の配列は使い回す。
  drawEnemyContour(g, rt, u, frame, talk = false) {
    const bones = u.human?.root.visible && u.human.bones;
    if (!bones || u.mounted && !talk && !u.isPlayer) {
      this.drawTalkModelContour(g, rt, u);
      return;
    }
    const cache = this.enemyContour || (this.enemyContour = {
      names: ['Head', 'RightArm', 'RightForeArm', 'RightHand', 'Hips', 'RightLeg', 'RightFoot', 'LeftFoot', 'LeftLeg', 'LeftHand', 'LeftForeArm', 'LeftArm'],
      points: new Float64Array(24),
      edge: [0,-.45,-.8, 0,.45,-.8, 1,.6,-.25, 2,.6,0, 3,.5,0, 3,-.4,.3, 2,-.4,.3, 1,-.2,.5,
        4,.7,0, 5,.45,0, 6,.5,.2, 6,-.4,.2, 4,0,.25, 7,.4,.2, 7,-.5,.2, 8,-.45,0, 4,-.7,0,
        11,.2,.5, 10,.4,.3, 9,.4,.3, 9,-.5,0, 10,-.6,0, 11,-.6,-.25]
    });
    const width = Math.max(3, Math.min(14, (frame.bottom - frame.top) * .12));
    for (let i = 0; i < cache.names.length; i++) {
      const bone = bones[cache.names[i]];
      if (!bone) return;
      bone.updateWorldMatrix(true, false); this.tmpV.setFromMatrixPosition(bone.matrixWorld);
      if (u.mesh) {
        this.tmpV.x += u.pos.x - u.mesh.position.x;
        this.tmpV.y += u.pos.y - u.mesh.position.y;
        this.tmpV.z += u.pos.z - u.mesh.position.z;
      }
      this.tmpV.project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return;
      cache.points[i * 2] = (this.tmpV.x * .5 + .5) * VIEW.w;
      cache.points[i * 2 + 1] = (-this.tmpV.y * .5 + .5) * VIEW.h;
    }
    const side = cache.points[2] >= cache.points[22] ? 1 : -1;
    g.save(); g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < cache.edge.length; i += 3) {
      const index = cache.edge[i] * 2;
      const x = cache.points[index] + cache.edge[i + 1] * width * side;
      const y = cache.points[index + 1] + cache.edge[i + 2] * width;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = talk ? '#fff3ba' : '#fff'; g.lineWidth = u.isPlayer ? 6 : 4; g.stroke(); g.restore();
  }


  // 基本形の人物も、武器や指物を除いた頭・胴・手足の外周で囲む。
  drawTalkModelContour(g, rt, u) {
    const c = this.talkContour || (this.talkContour = {
      names: ['head', 'body', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'],
      points: new Float64Array(128), hull: new Int16Array(129),
    });
    let count = 0;
    for (const name of c.names) {
      const part = u[name];
      if (!part?.geometry || !part.visible) continue;
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      const box = part.geometry.boundingBox;
      if (!box || box.isEmpty()) continue;
      part.updateWorldMatrix(true, false);
      for (let i = 0; i < 8; i++) {
        this.tmpV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z).applyMatrix4(part.matrixWorld);
        this.tmpV.x += u.pos.x - u.mesh.position.x;
        this.tmpV.y += u.pos.y - u.mesh.position.y;
        this.tmpV.z += u.pos.z - u.mesh.position.z;
        this.tmpV.project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) return;
        const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
        let j = count++;
        while (j > 0 && (c.points[(j - 1) * 2] > x || c.points[(j - 1) * 2] === x && c.points[(j - 1) * 2 + 1] > y)) {
          c.points[j * 2] = c.points[(j - 1) * 2]; c.points[j * 2 + 1] = c.points[(j - 1) * 2 + 1]; j--;
        }
        c.points[j * 2] = x; c.points[j * 2 + 1] = y;
      }
    }
    if (count < 3) return;
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {
      const start = n;
      for (let step = 0; step < count; step++) {
        const i = pass ? count - 1 - step : step;
        while (n >= start + 2) {
          const a = c.hull[n - 2] * 2, b = c.hull[n - 1] * 2;
          if ((c.points[b] - c.points[a]) * (c.points[i * 2 + 1] - c.points[a + 1]) -
              (c.points[b + 1] - c.points[a + 1]) * (c.points[i * 2] - c.points[a]) > 0) break;
          n--;
        }
        c.hull[n++] = i;
      }
      n--;
    }
    g.save(); g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < n; i++) {
      const at = c.hull[i] * 2;
      if (i) g.lineTo(c.points[at], c.points[at + 1]); else g.moveTo(c.points[at], c.points[at + 1]);
    }
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = u.isPlayer || u.team !== rt.player.u.team ? '#fff' : '#fff3ba'; g.lineWidth = u.isPlayer ? 6 : 5; g.stroke(); g.restore();
  }


  // 札は敵のすぐ上か脇へ。画面端への退避で「この敵」を遠ざけない。
  combatOrderEdge(width, height) {
    const spot = this.combatEdgePosition || (this.combatEdgePosition = { x: 16, y: 76 });
    spot.x = 16;
    const health = this.healthRect;
    spot.y = Math.max(16, Math.min(VIEW.h - height - 72, (health?.top ?? VIEW.h) - height - 12));
    return spot;
  }


  enemyOrderSpot(frame, width, height, headClearance = 0) {
    const spot = this.enemyOrderPosition || (this.enemyOrderPosition = { x: 12, y: 12 });
    const rects = this.hudRects();
    const bodies = this.goalBodyRects(this.rt);
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      const x = Math.max(12, Math.min(VIEW.w - width - 12,
        i >= 5 ? (i % 2 ? 12 : VIEW.w - width - 12) :
        i === 1 || i === 3 ? frame.right + 18 : i === 2 || i === 4 ? frame.left - width - 18 : frame.cx - width / 2));
      // 頭上が狭い時は左右の脇も比べ、本人と周りの兵を避ける。
      const y = Math.max(12, Math.min(VIEW.h - height - 12,
        i >= 5 ? (i < 7 ? 76 : VIEW.h - height - 72) :
        i >= 3 ? (frame.top + frame.bottom - height) / 2 :
          Math.min(frame.top, frame.headY) - height - Math.max(headClearance, 12)));
      // 画面端へ丸めた結果、体に戻る候補は選ばない。
      if (x + width + 12 > frame.left && x - 12 < frame.right &&
          y + height + 12 > frame.top && y - 12 < frame.bottom) continue;
      let overlap = 0;
      for (const r of rects) {
        if (r === this.guideOrderRect || r === this.noticeRect) continue;
        overlap += Math.max(0, Math.min(x + width + 8, r.right) - Math.max(x - 8, r.left)) *
          Math.max(0, Math.min(y + height + 8, r.bottom) - Math.max(y - 8, r.top));
      }
      overlap += Math.max(0, Math.min(x + width + 10, frame.right) - Math.max(x - 10, frame.left)) *
        Math.max(0, Math.min(y + height + 10, frame.bottom) - Math.max(y - 10, frame.top));
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(x + width + 8, bodies[j + 2]) - Math.max(x - 8, bodies[j])) *
          Math.max(0, Math.min(y + height + 8, bodies[j + 3]) - Math.max(y - 8, bodies[j + 1]));
      const distance = Math.hypot(x + width / 2 - frame.cx, y + height / 2 - frame.top);
      const score = overlap * 100 + distance;
      if (score < best) { best = score; spot.x = x; spot.y = y; }
    }
    return spot;
  }


  // 操作の札と一本の矢印を、実際に触る場所へまとめる。
  drawEnemyMoveGesture(g, rt) {
    const direction = this.destinationMoveDirection;
    if (!isTouch || !direction || rt.touchSwipeActive) return;
    // 横は見回す側、上は歩く側。同じ指と矢印で触る始点・終点を示す。
    const look = direction !== '上', side = direction === '右' ? 1 : -1;
    const start = this.clearGestureOrigin(rt, look ? side : 0, look ? 0 : -1, look);
    const drew = this.drawSwipeArrow(g, start.x, start.y,
      start.x + (look ? side * 88 : 0), start.y - (look ? 0 : 88), 26, true);
    if (drew) { this.navigationTouchOrigin.look = look; this.footDirectionDrawn = true; }
    const order = $('objectives');
    const width = this.enemyOrderW || this.approachOrderW || order.offsetWidth;
    const height = this.enemyOrderH || this.approachOrderH || order.offsetHeight;
    const x = Math.max(12, Math.min(VIEW.w - width - 12, start.x - width / 2));
    const y = Math.max(64, start.y - height - (look ? 32 : 104));
    setCssVar(order, '--enemy-order-move', `translate(${Math.round(x)}px,${Math.round(y)}px)`);
  }


  // 敵の脇へ動いた札でも、指の丸を実際の移動の始点にする。
  enemySwipeOrigin(rt, order, spot, key) {
    if (singleBattleGuide(rt) && !this.openingActive) return;
    const moveHand = order.querySelector('.swipe-instruction svg');
    const svg = moveHand || this.actionLabel?.classList.contains('approach-swipe') && !this.actionLabel.hidden &&
      this.actionLabel.querySelector('.enemy-swipe');
    if (!svg || order.classList.contains('expand') || this.root.classList.contains('attack-button-guide')) return;
    if (this.enemySwipeKey !== key) {
      const r = svg.getBoundingClientRect(), panel = order.getBoundingClientRect();
      this.enemySwipeX = r.left - panel.left + (moveHand ? r.width * 22 / 48 : r.width / 2);
      this.enemySwipeY = r.top - panel.top + (moveHand ? r.height * 28 / 54 : r.height * 54 / 96);
      this.enemySwipeKey = key;
    }
    const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
    origin.rt = rt; origin.at = rt.t;
    origin.x = spot.x + this.enemySwipeX; origin.y = spot.y + this.enemySwipeY;
    origin.look = !!moveHand && /^(右|左)$/.test(this.destinationMoveDirection); origin.radius = 32;
  }


  // 呼び名は既存の一枠を使い、剣は本人の頭上へ固定する。
  drawEnemyHeadPointer(g, frame, rt, enemy, showLabel = true) {
    if (singleBattleGuide(rt)) return; // 合戦では本人の囲みと「敵」に統一する。
    // 携帯でも、ねらう本人の頭上に大きな剣を固定する。札は既存の任務一枚を使う。
    const x = frame.cx;
    const tip = Math.min(frame.top, frame.headY) - 8;
    if (x < 24 || x > VIEW.w - 24 || tip < 0 || tip > VIEW.h) return;
    this.drawEnemySign(g, x, tip);
    g.save();
    if (!showLabel) { g.restore(); return; }
    // 押せる敵の枠に同じ一文がある間は、頭上へ説明を重ねない。
    if (isTouch && rt.touchEnemyAttack === enemy) { g.restore(); return; }
    g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    // 囲みは相手の印。向き直り・接近・攻撃・守りの次の動作を短く添える。
    const label = this.aimGuideEnemy === enemy ? 'この敵へ向こう' :
      this.approachGuideEnemy === enemy ? 'この敵へ近づこう' :
      this.defendEnemy === enemy && !this.guardFacing ? 'この敵へ向こう' :
      this.attackGuideEnemy === enemy ? 'この敵をたたこう' :
      this.defendEnemy === enemy ? 'この敵にそなえよう' : 'この敵をたおそう';
    const width = g.measureText(label).width + 20;
    const labelX = Math.max(width / 2 + 12, Math.min(VIEW.w - width / 2 - 12, x));
    g.fillStyle = '#14120f'; g.fillRect(labelX - width / 2, tip - 67, width, 28);
    g.fillStyle = '#fff3df'; g.fillText(label, labelX, tip - 43); g.restore();
  }


  // 向かう一人を太く囲み、頭上の矢印と同じ相手を示す。
  drawEnemyOutline(g, u, rt, guarding = false) {
    if (travelSignPriority(rt) && u !== this.aimGuideEnemy) return;
    // 近づく時は本人の印を残し、進む先だけ一本で示す。
    if (this.approachGuideEnemy === u) {
      const goal = this.meleeApproachPoint(rt, u);
      const clear = this.approachClear || (this.approachClear = { at:-1 });
      if (clear.rt !== rt || clear.enemy !== u || rt.t >= clear.at ||
          Math.hypot(goal.x - clear.x, goal.z - clear.z) > .5) {
        clear.rt = rt; clear.enemy = u; clear.at = rt.t + .2;
        clear.x = goal.x; clear.z = goal.z;
        clear.valid = localClear(rt.army, rt.player.u.pos, goal);
        const next = !clear.valid && rt.world.def.guideWay?.(rt.player.u, goal);
        clear.bend = !!next;
        if (next) {
          const way = clear.way || (clear.way = { x:0, y:0, z:0 });
          way.x = next.x; way.z = next.z;
          way.y = groundAt(rt.world, next.x, next.z, rt.player.u.pos.y);
        }
      }
      // 指定した戦は足元からの案内に畳み、敵の囲みへ大きな行き先札を重ねない。
      if (!isTouch && !singleBattleGuide(rt)) {
        if (rt.def.compactApproachGuide) this.drawFootDirection(g, rt, clear.bend ? clear.way : goal);
        else this.drawDestinationPointer(g, rt, clear.bend ? clear.way : goal, true);
      }
    }
    // 現在の立ち位置から頭上の印の位置を測る。
    const f = this.measurePersonFrame(u, rt);
    if (!u.alive || u.dying || !f || f.bottom <= f.top || !sightScreenUnit(rt, u)) return;
    // ねらう一人は四隅の枠と矢印。味方の丸や行き先の旗と形で見分ける。
    if (this.enemyFrameShown) return;
    // 相手の全身を四隅で囲み、頭上の矢印も同じ本人へ固定する。
    this.drawPersonOutline(g, f, false, true);
    // 頭上の矢印と同じ一人の足元を囲む。人混みで隠れても画面の層に残す。
    const foot = this.project(u.pos, u.pos.y + .08, rt,
      this.enemyRingFoot || (this.enemyRingFoot = {}));
    if (!isTouch && !foot.behind && foot.x >= 30 && foot.x <= VIEW.w - 30 && foot.y >= 64 && foot.y <= VIEW.h - 16) {
      g.save(); g.beginPath(); g.ellipse(foot.x, foot.y, 28, 11, 0, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = '#ffb49d'; g.lineWidth = 5; g.stroke(); g.restore();
    }
    const headX = Math.max(30, Math.min(VIEW.w - 30, f.cx));
    const headY = Math.max(48, Math.min(VIEW.h - 48, f.headY - 8));
    this.drawNavigationArrow(g, headX, headY - 12, Math.PI / 2, .65, true);
    // 接敵中は形だけにし、指示・目標・体力の三つへ収める。
    if (!this.root.classList.contains('combat-three') && (!isTouch || !this.aimGuideEnemy?.alive && !this.defendEnemy?.alive &&
        !$('objectives').classList.contains('facing-order')))
      this.drawTeamWord(g, Math.max(24, Math.min(VIEW.w - 24, headX + 30)), headY - 22, '敵');
    rt.army.guideWayEnemy = u; rt.army.guideWayAt = rt.army.time;
    this.enemyFrameShown = true;
    this.outlinedEnemy = u;
    setHidden($('target'), true); setHidden($('boss'), true);
  }


  // 守る線は任務の行き先と別に残す。他の戦でも同じ指定を使える。
  drawDefenseLine(g, rt) {
    if (this.aimGuideEnemy?.alive || this.outlinedEnemy?.alive || rt.guideEnemyShown ||
        rainDanger(rt.army) || rt.dodgeGuide || retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid) return false;
    const destination = rt.missionGuide;
    // 移動中は旗への一本を優先し、守る正面の矢印を重ねない。
    if (destination?.marker && /^(guard|wait|retreat)$/.test(destination.marker.guideArea) &&
        destination.distance >= (destination.marker.guideRadius || 8)) return false;
    const line = rt.def.defenseLine?.(rt);
    if (!line || (!line.keepVisibleWithEnemy && this.defendEnemy?.alive) || !line.showFacingFlag && this.root.classList.contains('wait-guard-active') || S.reduceGuidance || guidanceEnded(rt) || this.openingActive || rt.choice ||
        rt.player.camShot || this.bigmap || $('objectives').classList.contains('expand')) return false;
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    // 指定した戦は守る地点の旗だけを残し、目の前を横切る線を描かない。
    if (!line.flagOnly) {
      g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
      g.beginPath();
      let previous = false;
      // 奥行きのある持ち場は四辺を示す。従来の守備線も同じ描画を使う。
      const steps = line.depth ? 48 : 12;
      for (let i = 0; i <= steps; i++) {
        const side = Math.min(3, Math.floor(i / 12)), t = line.depth ? (i - side * 12) / 12 : i / 12;
        const x = !line.depth || side === 0 ? line.x - line.halfWidth + line.halfWidth * 2 * t :
          side === 1 ? line.x + line.halfWidth : side === 2 ? line.x + line.halfWidth - line.halfWidth * 2 * t : line.x - line.halfWidth;
        const z = !line.depth || side === 0 ? line.z : side === 1 ? line.z + line.depth * t :
          side === 2 ? line.z + line.depth : line.z + line.depth * (1 - t);
        this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .18, z).project(rt.camera);
        const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
        const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
        if (visible && previous) g.lineTo(sx, sy);
        else if (visible) g.moveTo(sx, sy);
        previous = visible;
      }
      this.groundAreaDash ||= [6, 14];
      g.setLineDash(this.groundAreaDash); g.lineCap = 'round';
      g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 1.5; g.stroke(); g.restore();
    }
    // 回避中は操作の案内を優先し、守る場所の札を増やさない。
    const waitButton = !!this.waitGuardButton && !this.waitGuardButton.hidden;
    const occupied = 1 + this.notices.picks.length - Number(waitButton && this.notices.sources[1].selected) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(waitButton) + Number(!!rt.nearestInteract()) + Number(this.flagGuideDrawn);
    if (rt.dodgeGuide || this.retreatGuide?.active) return true;
    // 同じ持ち場は任務の旗で示す。別の旗と正面向きの矢印を競わせない。
    const marker = rt.missionGuide?.marker;
    const waitFacing = rt.def.waitFacingPoint?.(rt);
    if (!line.showFacingFlag && (marker?.guideArea === 'wait' || marker?.waitGuide) && !rt.guideEnemyShown && !this.defendEnemy?.alive &&
        (!waitFacing || rt.missionGuide.distance >= (marker.guideRadius || 8))) return true;
    // 持ち場が背後でも、川や守る正面へ向く矢印は残す。
    if (!line.showFacingFlag && marker?.guideArea === 'wait' && !this.defendEnemy?.alive) return true;
    if (Number.isFinite(line.faceX) && Number.isFinite(line.faceZ)) {
      const dx = (waitFacing?.x ?? line.faceX) - p.x, dz = (waitFacing?.z ?? line.faceZ) - p.z, length = Math.hypot(dx, dz);
      if (length > .1) {
        const target = this.defenseFacingPoint || (this.defenseFacingPoint = { x: 0, y: 0, z: 0 });
        target.x = p.x + dx / length * 4; target.z = p.z + dz / length * 4;
        target.y = groundAt(rt.world, target.x, target.z, p.y);
        const facing = this.defenseFacing || (this.defenseFacing = { pos: target });
        if (line.showFacingFlag || waitFacing && !isTouch) this.drawFootDirection(g, rt, target);
        else if (!waitFacing && this.floorGoalVisible(rt, target)) this.drawEnemyDirection(g, rt, facing);
        // 向く先が画面外の時、端の矢印は「動け」と読まれる（待つ札と食い違う）。向きの矢印だけにする。
      }
    }
    if (waitFacing && !line.showFacingFlag) return true;
    // 敵へ進む旗が出ている間は、持ち場の旗を重ねない。守備線は残す。
    if (rt.guideEnemyDirection && !line.showFacingFlag) return true;
    const flagZ = line.flagZ ?? line.z;
    this.tmpV.set(line.x, groundAt(rt.world, line.x, flagZ, p.y) + .2, flagZ).project(rt.camera);
    let x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
    const off = this.tmpV.z < -1 || this.tmpV.z > 1 || x < 96 || x > W - 96 || y < 132 || y > H - 48;
    if (off) {
      const dx = line.x - p.x, dz = flagZ - p.z, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const scale = Math.min((W / 2 - 96) / Math.max(.001, Math.abs(right)),
        Math.max(16, H / 2 - 132) / Math.max(.001, Math.abs(forward)));
      x = W / 2 + right * scale; y = H / 2 - forward * scale;
    }
    x = Math.max(96, Math.min(W - 96, x)); y = Math.max(132, Math.min(H - 48, y));
    if (line.showFacingFlag) {
      // 本陣の旗は操作札があっても残す。字の札を増やさず、近くの空きへよける。
      for (const r of this.hudRects()) {
        if (x + 24 > r.left && x - 24 < r.right && y + 8 > r.top && y - 48 < r.bottom)
          x = Math.max(32, Math.min(W - 32, x < W / 2 ? r.right + 32 : r.left - 32));
      }
    } else if (this.hudRects().some(r => x + 84 > r.left && x - 84 < r.right && y + 8 > r.top && y - 66 < r.bottom)) return true;
    g.save(); g.lineJoin = 'round';
    if (!off && !line.depth) this.drawTargetFootRing(g, rt, line, 1.25);
    this.drawSmallGoalFlag(g, x, y, .65);
    // いのちも一枚に数え、空きがある時だけ場所の名を添える。
    if (!line.showFacingFlag && !singleBattleGuide(rt) && occupied < 3 && !rt.touchCoachActive && !this.root.classList.contains('travel-guide')) {
      g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#14120f'; g.fillRect(x - 84, y - 66, 168, 26);
      g.fillStyle = '#fff3ba'; g.fillText(line.label || 'この中をまもる', x, y - 53);
    }
    g.restore(); return true;
  }
}
