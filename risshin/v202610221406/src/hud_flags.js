import { VIEW } from "./viewport.js";
import { $, singleBattleGuide } from "./hud_common.js";
import { S } from "./settings.js";
import { groundAt } from "./floors.js";

export class HudFlags {


  // 近い兵の画面上の範囲を共用する。札の配置のため毎コマ全員を投影しない。
  goalBodyRects(rt) {
    const W = VIEW.w, H = VIEW.h;
    const bodies = this.goalBodies || (this.goalBodies = new Float32Array(320 * 4));
    if (this.goalBodiesRt !== rt || rt.t >= this.goalBodiesAt || this.goalBodiesW !== W || this.goalBodiesH !== H) {
      this.goalBodiesRt = rt; this.goalBodiesAt = rt.t + .15;
      this.goalBodiesW = W; this.goalBodiesH = H;
      let n = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.isStruct || Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 28 || n >= bodies.length) continue;
        this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3 : 2.1), u.pos.z).project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) continue;
        const x = (this.tmpV.x * .5 + .5) * W, top = (-this.tmpV.y * .5 + .5) * H;
        this.tmpV.set(u.pos.x, u.pos.y, u.pos.z).project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) continue;
        const bottom = (-this.tmpV.y * .5 + .5) * H;
        const half = Math.max(18, Math.abs(bottom - top) * .3);
        bodies[n++] = x - half; bodies[n++] = top - 8;
        bodies[n++] = x + half; bodies[n++] = bottom + 8;
      }
      for (const u of rt.army.dead || []) {
        if (u.gone || n >= bodies.length || Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 28) continue;
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let i = 0; i < 4; i++) {
          this.tmpV.set(u.pos.x + (i & 1 ? 1.4 : -1.4), u.pos.y + .25,
            u.pos.z + (i & 2 ? 1.4 : -1.4)).project(rt.camera);
          if (this.tmpV.z < -1 || this.tmpV.z > 1) continue;
          const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        if (left === Infinity) continue;
        bodies[n++] = left - 8; bodies[n++] = top - 8;
        bodies[n++] = right + 8; bodies[n++] = bottom + 8;
      }
      this.goalBodyCount = n;
    }
    return bodies;
  }


  // 人の上に旗を貼らず、空いた頭上から実際の到着点へ矢印を結ぶ。
  drawRaisedGoalFlag(g, rt, sx, sy, defend = false, flagScale = rt.def.goalFlagScale ?? .9, caption = null) {
    if (rt.def.footFlagGuides) {
      this.drawSmallGoalFlag(g, sx, sy, .65, false, defend, caption ?? '');
      const result = this.raisedGoalPoint || (this.raisedGoalPoint = { x: 0, y: 0 });
      result.x = sx; result.y = sy; return result;
    }
    const W = VIEW.w, H = VIEW.h;
    const bodies = this.goalBodyRects(rt);
    const rects = this.hudRects();
    const p = rt.player.u.pos;
    const foot = this.project(p, p.y + .08, rt,
      this.raisedPlayerProjection || (this.raisedPlayerProjection = {}));
    const large = flagScale > 1;
    const order = $('objectives');
    const labelHalf = large ? Math.max(64, order.offsetWidth / 2) : 0;
    const labelHeight = large ? Math.max(44, order.offsetHeight) : 0;
    const groupHeight = 56 * flagScale + 58 + labelHeight;
    let x = large ? Math.max(labelHalf + 12, Math.min(W - labelHalf - 44, sx)) : sx;
    let y = large ? Math.max(groupHeight + 16, Math.min(H - 64, sy - 76)) : sy;
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      const cx = Math.max(large ? labelHalf + 12 : 48, Math.min(W - (large ? labelHalf + 44 : 72), sx + (i % 3 - 1) * 80));
      const cy = Math.max(large ? groupHeight + 16 : 112, Math.min(H - 64, sy - 76 - Math.floor(i / 3) * 64));
      // 旗の根元と本人の丸を、携帯でも矢印が入るだけ離す。
      if (!foot.behind && Math.hypot(cx - foot.x, cy - foot.y) < 96) continue;
      const left = large ? cx + 16 * flagScale - labelHalf - 8 : cx - 12;
      const right = large ? cx + 16 * flagScale + labelHalf + 8 : cx + 32 * flagScale + 5;
      const top = large ? cy - groupHeight : cy - 56 * flagScale - 5;
      let overlap = 0;
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(right, bodies[j + 2]) - Math.max(left, bodies[j])) *
          Math.max(0, Math.min(cy + 8, bodies[j + 3]) - Math.max(top, bodies[j + 1]));
      for (const r of rects) {
        if (r === this.guideOrderRect) continue;
        overlap += Math.max(0, Math.min(right, r.right) - Math.max(left, r.left)) *
          Math.max(0, Math.min(cy + 8, r.bottom) - Math.max(top, r.top));
      }
      const score = overlap * 1000 + Math.hypot(cx - sx, cy - sy);
      if (score < best) { best = score; x = cx; y = cy; }
    }
    g.save(); g.beginPath(); g.moveTo(x, y + 6); g.lineTo(sx, sy - 8);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    // 旗と到着点は線だけで結び、下向き矢印を自分の人印に重ねない。
    if (defend) {
      const frame = this.defendFlagFrame || (this.defendFlagFrame = {});
      frame.left = x; frame.top = y - 56 * flagScale;
      frame.width = 32 * flagScale; frame.height = 24 * flagScale;
      this.drawGoalFlagFrame(g, frame, false, true);
    }
    this.drawSmallGoalFlag(g, x, y, flagScale, true, false, caption ?? (this.notices.sources[1].selected ? '' : '旗へ進もう')); g.restore();
    const result = this.raisedGoalPoint || (this.raisedGoalPoint = { x: 0, y: 0 });
    result.x = x; result.y = y; return result;
  }


  // 遠い旗も携帯で見つかる大きさを保つ。回避先の旗も同じ形を使う。
  // 旗の形は（大きさ・戻り・守り）ごとに一度だけ描いて写し（毎コマ太い線を 4〜6 本なぞると一コマ 0.8ms。10/21）
  drawSmallGoalFlag(g, x, y, scale = 1, returning = false, defend = false, caption = 'ここを押す', prominent = false) {
    // 通常の戦は次の旗一つ。任務の札があれば同じ案内の字を足さない。
    if (singleBattleGuide(this.rt)) {
      if (this.goalFlagDrawn) return;
      this.goalFlagDrawn = true;
      const occupied = 1 + this.notices.picks.length + Number(!!this.rt.touchCoachActive || !!this.rt.nearestInteract()) +
        Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
      if (!this.openingActive && (this.notices.sources[1].selected || occupied >= 3)) caption = '';
    }
    // 通常は小旗、移動の目標は大旗にする。絵は大きさごとに使い回す。
    // 町や道場の案内は従来の大きさを保つ。
    // 戦固有の小さな行き先印と、添え字を畳む指定を優先する。
    if (prominent) scale = Math.max(1, scale);
    else if (this.rt?.def.compactDestinationSign && !this.openingActive) {
      scale = Math.max(1, scale); caption = '';
    } else scale = singleBattleGuide(this.rt) ? Math.max(1, Math.min(1.15, scale)) : Math.max(.9, scale);
    if (singleBattleGuide(this.rt)) returning = true;
    const key = scale + '|' + (returning ? 1 : 0) + (defend ? 1 : 0) + '|' + Number(!this.rt?.def.town && !this.rt?.def.dojo);
    const cache = this._flagSprites || (this._flagSprites = new Map());
    let sp = cache.get(key);
    if (!sp) {
      const ox = Math.ceil(10 + 24 * scale), oy = Math.ceil(10 + 62 * scale);
      const cv = document.createElement('canvas');
      cv.width = (ox + Math.ceil(40 * scale) + 10) * 2; cv.height = (oy + 10) * 2;
      const c2 = cv.getContext('2d');
      c2.scale(2, 2);
      this.drawSmallGoalFlagPath(c2, ox, oy, scale, returning, defend);
      cache.set(key, sp = { cv, ox, oy, w: cv.width / 2, h: cv.height / 2 });
    }
    // 指定した戦では、旗の布・竿・添え字まで含めて既存の札を避ける。
    // 地面の印を別の場所へ移さず、重なる飾りだけ畳む。描画の写しは使い回す。
    if (this.rt?.def.smallFlagAvoidNotices) {
      let left = x - sp.ox, right = left + sp.w, top = y - sp.oy, bottom = top + sp.h;
      if (caption) {
        const textScale = Math.max(1, S.textScale || 1);
        g.save(); g.font = `bold ${20 * textScale}px sans-serif`;
        const width = g.measureText(caption).width;
        g.restore();
        const side = x + 40 * scale + width + 12 > VIEW.w ? -width - 12 : 40 * scale;
        const captionLeft = x + Math.max(16 - x, Math.min(VIEW.w - x - width - 16, side));
        left = Math.min(left, captionLeft - 6); right = Math.max(right, captionLeft + width + 6);
        top = Math.min(top, y - 44 * scale - 15 * textScale);
        bottom = Math.max(bottom, y - 44 * scale + 15 * textScale);
      }
      for (const r of this.hudRects()) {
        if (right > r.left - 8 && left < r.right + 8 && bottom > r.top - 8 && top < r.bottom + 8) return;
      }
    }
    g.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.w, sp.h);
    if (caption) {
      g.save(); g.translate(x, y);
      // 字は縮めず旗の横へまとめ、兵の姿に重ねない。
      g.font = `bold ${20 * Math.max(1, S.textScale || 1)}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const width = g.measureText(caption).width, top = -44 * scale;
      const side = x + 40 * scale + width + 12 > VIEW.w ? -width - 12 : 40 * scale;
      const left = Math.max(16 - x, Math.min(VIEW.w - x - width - 16, side));
      const height = 30 * Math.max(1, S.textScale || 1);
      g.fillStyle = '#14120f'; g.fillRect(left - 6, top - height / 2, width + 12, height);
      g.fillStyle = '#fff3ba'; g.fillText(caption, left, top);
      g.restore();
    }
  }

  drawSmallGoalFlagPath(g, x, y, scale = 1, returning = false, defend = false, caption = '') {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.scale(scale, scale);
    const height = 56;
    if (defend) {
      g.beginPath(); g.rect(-5, -height - 5, 42, 34);
      g.strokeStyle = '#14120f'; g.lineWidth = 15; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 7; g.stroke();
    }
    g.beginPath(); g.moveTo(0, -height); g.lineTo(32, -height);
    g.lineTo(24, -44); g.lineTo(32, -32); g.lineTo(0, -32);
    g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = returning ? 13 : 9; g.stroke();
    if (returning) { g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.stroke(); }
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -height);
    g.strokeStyle = '#14120f'; g.lineWidth = returning ? 13 : 9; g.stroke();
    g.strokeStyle = returning ? '#ffffff' : '#fff3ba'; g.lineWidth = returning ? 6 : 4; g.stroke();
    if (caption) {
      // 字は縮めず旗の横へまとめ、兵の姿に重ねない。
      g.scale(1 / scale, 1 / scale);
      g.font = 'bold 16px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const width = g.measureText(caption).width, top = -44 * scale;
      const side = x + 40 * scale + width + 12 > VIEW.w ? -width - 12 : 40 * scale;
      const left = Math.max(16 - x, Math.min(VIEW.w - x - width - 16, side));
      g.fillStyle = '#14120f'; g.fillRect(left - 4, top - 13, width + 8, 26);
      g.fillStyle = '#fff3ba'; g.fillText(caption, left, top);
    }
    g.restore();
  }


  // 待つ場所は足形だけ。文は既存の任務や操作の一枚へまとめる。
  drawWaitFootprints(g, rt, pos) {
    const screen = this.waitLabelProjection || (this.waitLabelProjection = {});
    const point = this.waitFootprintPoint || (this.waitFootprintPoint = { x:0, y:0, z:0 });
    point.x = pos.x; point.z = pos.z;
    point.y = groundAt(rt.world, pos.x, pos.z, rt.player.u.pos.y);
    this.project(point, point.y + .1, rt, screen);
    if (screen.behind || screen.x < 24 || screen.x > VIEW.w - 24 || screen.y < 80 || screen.y > VIEW.h - 24 ||
        !this.floorGoalVisible(rt, point)) return false;
    g.save(); g.translate(screen.x, screen.y); g.lineJoin = 'round';
    g.beginPath();
    for (let foot = 0; foot < 2; foot++) {
      const x = foot ? 7 : -7, y = foot ? -4 : 2;
      g.moveTo(x - 4, y + 7); g.lineTo(x + 4, y + 7);
      g.lineTo(x + 5, y - 6); g.quadraticCurveTo(x, y - 15, x - 5, y - 6); g.closePath();
    }
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore(); return true;
  }


  // 離れている間の旗と矢印は残し、到着判定の半径も変えない。
  drawWaitFrame(g, rt, pos, radius = 1.4) {
    const drew = this.drawWaitFootprints(g, rt, pos);
    const p = rt.player.u.pos;
    if (Math.hypot(pos.x - p.x, pos.z - p.z) >= radius) {
      const foot = this.project(p, p.y + .08, rt,
        this.waitFootProjection || (this.waitFootProjection = {}));
      const goal = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .1, rt,
        this.waitGoalProjection || (this.waitGoalProjection = {}));
      if (drew && !foot.behind && !goal.behind) {
        this.drawFlagLink(g, foot.x, foot.y, goal.x, goal.y);
        this.drawSmallGoalFlag(g, goal.x, goal.y, .9);
      }
    }
    return drew;
  }
}
