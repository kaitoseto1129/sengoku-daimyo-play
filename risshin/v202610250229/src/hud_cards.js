import { pinGuideOn, missionTarget } from './mission_pin.js';
import { setText, setWidth, coachCss, $, esc, keyCaps, shortTask, singleBattleGuide, rescueTarget, retreatRequired, attackOperation } from "./hud_common.js";
import { currentObjective, taskText, missionCaption } from "./mission_guide.js";
import { isTouch } from "./touch.js";
import { K, S } from "./settings.js";
import { sightUnit } from './battle_sight.js';

export class HudCards {


  // 最初の操作は任務と同じ札へ収め、命・敵の印と合わせて三枚にする。
  openingControls(dt, rt) {
    this.openingControlsActive = false;
    if (this.controlsEl) this.controlsEl.hidden = true;
    if (this.controlsBattle !== rt) {
      this.controlsBattle = rt;
      this.controlsElapsed = 0;
    }
    const active = isTouch && !rt.def.town && !rt.def.dojo && rt.player.u.alive && !rt.over && !rt.choice &&
      !this.introWaiting && !this.openingActive && !this.bigmap && !rt.game?.paused &&
      !rt.game?.deployment && !rt.game?.photo && !rt.player.camShot;
    if (active) this.controlsElapsed += dt;
    const dock = this.prog?.querySelector('.pg-st');
    if (dock && !this.controlsHelp) {
      const el = document.createElement('small');
      el.className = 'opening-controls-help';
      el.style.cssText = 'max-width:100%;font:600 15px/1.4 sans-serif;white-space:pre-line;color:#fff3df;margin-top:4px';
      el.hidden = true; dock.insertBefore(el, dock.lastChild); this.controlsHelp = el;
    }
    if (!this.controlsHelp) return;
    this.controlsHelp.hidden = !active || this.controlsElapsed > 12 || S.reduceGuidance;
    if (!this.controlsHelp.hidden) {
      const weapon = rt.player.weapon;
      const action = weapon === 'gun' ? '「撃つ」を押す' : weapon === 'bow' ? '「射る」を押す' : weapon === 'sword' ? '「きる」で刀をふる' : '「つく」で槍をつく';
      setText(this.controlsHelp, `${S.touchSwap ? '右' : '左'}をなぞって動く\n${S.touchSwap ? '左' : '右'}の${action}`);
    }
  }

  // 手ほどき：いまの段だけを札に出す
  renderTut(t) { this.tutCur = t; this.drawCard(); }

  // 戦の進み・戦況・次にやること（kaito 10/22 稲生 19）。戦の定義に stages と stageOf があれば左上に出す。
  //   段：「3／6　柴田隊を受け止める」、戦況：一語と細い帯（def.force の残りの割合）、次：今の任務の札の一行。
  //   段が変わる時だけ、真ん中に「第三段　柴田隊を受け止める」を短く出す。毎コマ作らず、字が変わる時だけ書く。
  // 近い敵の頭上に小さな印（▼と「敵」）。四人まで・十四メートルまで。印は使い回し、毎コマ作らない（kaito 10/22 稲生 3）。
  foeMarks(rt) {
    this.enemyTriangleSigns(rt);
    if (pinGuideOn(rt)) {
      for (const el of this.missionAllyEls || []) el.hidden = true;
      return; // 全戦で兵・隊・旗の頭上の札と印を作らない。
    }
    // 組の仲間は五人まで。名札と投影用の点は使い回す。
    const allies = rt.def.missionAllies?.(rt), single = allies ? null : rt.def.missionAlly?.(rt);
    const count = allies ? Math.min(5, allies.length) : single ? 1 : 0;
    const labels = this.missionAllyEls || (this.missionAllyEls = []);
    while (labels.length < count) {
      const e = document.createElement('div');
      e.style.cssText = 'position:absolute;left:0;top:0;padding:2px 5px;background:#17140fe6;color:#fff3df;border-bottom:2px solid #e8c25a;font-size:12px;line-height:1.4;pointer-events:none';
      this.root.appendChild(e); labels.push(e);
    }
    for (let i = 0; i < labels.length; i++) {
      const e = labels[i], ally = i < count ? allies ? allies[i] : single : null;
      e.hidden = true;
      if (ally?.alive && !ally.gone && !ally.fleeing && !ally.woundOut && !ally.noTarget &&
          rt.player.u.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap &&
          Math.hypot(ally.pos.x - rt.player.u.pos.x, ally.pos.z - rt.player.u.pos.z) <= (rt.def.missionAllyEdge ? 100 : 40) &&
          !rt.army.wallBetween(rt.player.u.pos, -1, ally.pos)) {
        this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.1 : 2.3), ally.pos.z).project(rt.camera);
        const label = (typeof rt.def.missionAllyLabel === 'function' ? rt.def.missionAllyLabel(rt) : rt.def.missionAllyLabel) || (ally === rt.flags.genpachi ? '隊長' : '仲間');
        const onScreen = this.tmpV.z >= -1 && this.tmpV.z < 1 &&
          Math.abs(this.tmpV.x) < (rt.def.missionAllyEdge ? .8 : .9) && Math.abs(this.tmpV.y) < (rt.def.missionAllyEdge ? .7 : .85);
        let x = Math.round((this.tmpV.x + 1) / 2 * innerWidth), y = Math.round((1 - this.tmpV.y) / 2 * innerHeight);
        const symbolOnly = singleBattleGuide(rt) && !rt.def.missionAllyNamed;
        e.style.background = symbolOnly ? 'transparent' : '#17140fe6';
        e.style.borderBottom = symbolOnly ? '0' : '2px solid #e8c25a';
        e.style.fontSize = symbolOnly ? '26px' : '12px';
        e.style.textShadow = symbolOnly ? '0 2px 2px #14120f, 2px 0 2px #14120f' : '';
        e.setAttribute('aria-label', label);
        if (onScreen) setText(e, symbolOnly ? '◆' : label + (rt.def.missionAllyEdge ? ' ▼' : ''));
        else if (rt.def.missionAllyEdge) {
          // 画面外も同じ人物へ向ける。名札を端へ寄せ、右上の任務と下の釦を避ける。
          const dx = ally.pos.x - rt.player.u.pos.x, dz = ally.pos.z - rt.player.u.pos.z;
          const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
          const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
          const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
          const side = right >= 0;
          x = side ? innerWidth - 80 : 80;
          y = innerHeight * (forward >= 0 ? .38 : .65);
          let arrow = side ? '→ ' : '← ';
          if (this.tmpV.z >= -1 && this.tmpV.z < 1 && Math.abs(this.tmpV.x) < .8) {
            x = Math.max(80, Math.min(innerWidth - 200, (this.tmpV.x + 1) / 2 * innerWidth));
            y = this.tmpV.y > 0 ? 110 : innerHeight * .68;
            arrow = this.tmpV.y > 0 ? '↑ ' : '↓ ';
          }
          setText(e, symbolOnly ? '◆' : arrow + label + (forward < 0 ? '・後ろ' : ''));
        }
        if (onScreen || rt.def.missionAllyEdge) {
          e.hidden = false;
          e.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
        }
      }
    }
    this.fieldMarks(rt);
    this.squadMarks(rt);
    if (!rt.def.town && !rt.def.dojo || !rt.def.foeMarks) {
      if (this.foeEls) for (const el of this.foeEls) el.hidden = true;
      return;
    }
    if (!this.foeEls) {
      this.foeEls = [];
      const box = document.createElement('div'); box.id = 'foe-marks'; box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      for (let i = 0; i < 4; i++) {
        const e = document.createElement('div');
        e.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);font-size:12px;line-height:1;color:#f1d9c6;text-shadow:0 1px 2px #000,0 0 4px #000;text-align:center;font-weight:600;letter-spacing:.05em';
        // 名（戦の定義の foeLabel。例「林の兵」）と赤い▼。「敵」の字は出さない（kaito 10/23 稲生 6）。
        e.innerHTML = '<b style="display:block;padding:1px 4px;margin-bottom:1px;background:rgba(12,10,8,.82);font-size:12px;font-weight:600;color:#ffd2c2"></b><span style="color:#ff4a2e;font-size:20px;-webkit-text-stroke:1px #2a0d06">▼</span>';
        e.hidden = true; box.appendChild(e); this.foeEls.push(e);
      }
      this.root.appendChild(box);
      this.foeList = [];
    }
    const me = rt.player.u, L = this.foeList; L.length = 0;
    if (me.alive && !rt.over) {
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.fleeing || o.gone || o.noTarget || o.isStruct) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d > (rt.def.foeMarkRange || 14) || o === this.fieldFoe) continue;
        L.push(o); o._foeD = d;
      }
      L.sort((a, b) => a._foeD - b._foeD);
    }
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 4; i++) {
      const e = this.foeEls[i], o = L[i];
      if (!o) { e.hidden = true; continue; }
      this.tmpV.set(o.pos.x, o.pos.y + (o.mounted ? 3.1 : 2.15), o.pos.z).project(rt.camera);
      if (this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) { e.hidden = true; continue; }
      e.hidden = false;
      const fl = rt.def.foeLabel, name = i < 2 ? (typeof fl === 'function' ? fl(rt, o) : fl) || (o.type === 'busho' && o.name) || '' : '';
      setText(e.firstChild, name); e.firstChild.hidden = !name;
      e.style.transform = `translate(${Math.round((this.tmpV.x + 1) / 2 * W)}px,${Math.round((1 - this.tmpV.y) / 2 * H)}px) translate(-50%,-100%)`;
    }
  }

  // 稲生の任務の相手一人。任務と同じ名を頭上に置き、画面外なら向きを示す。
  // 札と投影用の点は使い回し、倒れたら次の生きた相手に替える。
  inouMissionMark(rt) {
    // 共通の名札・▼・方向矢印と二重に出さない。
    if (pinGuideOn(rt)) {
      if (this.inouTargetMark) this.inouTargetMark.hidden = true;
      return;
    }
    const active = rt.def.key === 'inou' && rt.player.u.alive && !rt.flags.ending && !rt.over && !rt.choice &&
      !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    const enemy = active ? rt.def.missionSignTarget?.(rt) : null;
    const following = active && !enemy && rt.flags.step === 0 && rt.flags.training >= 0 && rt.flags.training <= 8;
    const u = enemy || (following ? rt.flags.genU : null);
    let el = this.inouTargetMark;
    if (!u?.alive || u.gone || u.dying || u.downed || u.woundOut || u.rearWound || u.fleeing || u.team === rt.player.u.team) {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:4;text-align:center;font:bold 16px/1.4 sans-serif;white-space:pre;color:#fff3df;text-shadow:0 1px 2px #000';
      el.innerHTML = '<b style="display:block;background:#17140f;padding:3px 7px;border:2px solid #ff634d"></b><span style="display:block;color:#ff4a2e;font-size:44px;line-height:1;-webkit-text-stroke:2px #fff3df;paint-order:stroke fill;text-shadow:0 1px 3px #000">▼</span>';
      this.root.appendChild(el); this.inouTargetMark = el;
    }
    const name = rt.def.missionEnemyLabel(rt);
    const W = innerWidth, H = innerHeight, margin = Math.min(W / 2 - 8, name.length * 8 + 104);
    this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.5 : 2.55), u.pos.z).project(rt.camera);
    let x = (this.tmpV.x + 1) * W / 2, y = (1 - this.tmpV.y) * H / 2;
    const onScreen = this.tmpV.z >= -1 && this.tmpV.z <= 1 && x > margin && x < W - margin &&
      y > 100 && y < H - 80 && u.mesh?.visible !== false && sightUnit(rt, u);
    const me = rt.player.u.pos;
    const distance = Math.ceil(Math.hypot(u.pos.x - me.x, u.pos.z - me.z));
    const steps = rt.def.missionEnemySteps(rt, u);
    let label = `目標：${name}\nあと${distance}メートル・槍まで${steps}歩`;
    if (!onScreen) {
      rt.camera.getWorldDirection(this.tmpV);
      const dx = u.pos.x - me.x, dz = u.pos.z - me.z;
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      // 後方は左右へ振り向かせる。下向きの矢印を後退の指示に見せない。
      const sideways = forward < 0 || Math.abs(right) > Math.abs(forward);
      x = sideways ? right >= 0 ? W - margin : margin : W / 2;
      y = sideways ? H * (forward >= 0 ? .45 : .65) : 128;
      const arrow = sideways ? right >= 0 ? '→' : '←' : '↑';
      // 後方も左右へ振り向かせ、同じ目標の名を残す。
      const turn = sideways ? `${right >= 0 ? '右' : '左'}へ${forward < 0 ? '振り向け' : '向け'}` : 'この先へ進め';
      label = `${arrow} 目標：${name}\n${turn}`;
    }
    setText(el.firstChild, label);
    setText(el.lastChild, following ? '↓' : '▼');
    el.lastChild.style.color = following ? '#fff3df' : '#ff634d';
    el.lastChild.style.webkitTextStroke = following ? '' : '1px #fff3df';
    el.lastChild.hidden = !onScreen;
    el.hidden = false;
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
  }

  // 敵印。枠は初回に確保し、毎コマは頭の位置だけ更新する。
  enemyTriangleSigns(rt) {
    const me = rt.player.u;
    // 敵の▼は field_signs.js の一つの形に任せる（頭上に固定。字の▼を毎コマ見え隠れさせない。kaito 10/23）。
    const on = !pinGuideOn(rt) && rt.def.enemyTriangleSigns && me.alive && !rt.over && !rt.choice &&
      !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    if (!this.enemyTriangles) {
      if (!on) return;
      this.enemyTriangles = [];
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      for (let i = 0; i < 250; i++) {
        const el = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff634d;font-size:17px;line-height:1;-webkit-text-stroke:1px #32140d;text-shadow:0 1px 2px #000;pointer-events:none';
        el.hidden = true; box.appendChild(el); this.enemyTriangles.push(el);
      }
      this.root.appendChild(box);
    }
    let n = 0;
    const markedGroup = on ? rt.def.enemyTriangleGroup?.(rt) : null;
    if (on) for (const u of rt.army.units) {
      if (n === this.enemyTriangles.length) break;
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget && !(markedGroup && u.group === markedGroup) || u.isStruct || u.team === me.team ||
          u.mesh?.visible === false || u.camHidden ||
          (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 1600 || !sightUnit(rt, u)) continue;
      this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) continue;
      const el = this.enemyTriangles[n++];
      el.hidden = false;
      el.style.transform = `translate(${((this.tmpV.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - this.tmpV.y) * innerHeight / 2).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (; n < this.enemyTriangles.length; n++) this.enemyTriangles[n].hidden = true;
  }

  // 自分の組の兵の頭上に小さな菱形（字の札の代わり。kaito 10/23）。士気は色と明るさで（高い＝金・ふつう＝白・下がる＝くすむ）。
  //   近い十二人まで・四十メートルまで。印は使い回し、毎コマ作らない。
  squadMarks(rt) {
    if (pinGuideOn(rt)) return; // 全戦で兵・隊・旗の頭上の札と印を作らない。
    const L = rt.squad, me = rt.player.u;
    const on = L?.length && me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    if (!this.sqEls) {
      if (!on) return;
      this.sqEls = []; this.sqList = [];
      const box = document.createElement('div'); box.id = 'squad-marks'; box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      for (let i = 0; i < 12; i++) {
        const e = document.createElement('i');
        e.style.cssText = 'position:absolute;left:0;top:0;width:7px;height:7px;margin:-4px 0 0 -4px;transform-origin:center;box-shadow:0 0 0 1px #14120f;font-style:normal';
        e.hidden = true; box.appendChild(e); this.sqEls.push(e);
      }
      this.root.appendChild(box);
    }
    const list = this.sqList; list.length = 0;
    if (on) for (const s of L) {
      if (!s.alive || s.gone || s === me || s.mesh?.visible === false) continue;
      const d = (s.pos.x - me.pos.x) ** 2 + (s.pos.z - me.pos.z) ** 2;
      if (d > 1600) continue;
      s._sqD = d; list.push(s);
    }
    if (list.length > 12) list.sort((a, b) => a._sqD - b._sqD);
    for (let i = 0; i < 12; i++) {
      const e = this.sqEls[i], s = list[i];
      if (!s) { e.hidden = true; continue; }
      this.tmpV.set(s.pos.x, s.pos.y + (s.mounted ? 3.0 : 2.05), s.pos.z).project(rt.camera);
      if (this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) { e.hidden = true; continue; }
      e.hidden = false;
      const m = s.group?.morale ?? 70;
      const c = m >= 75 ? '#f0c75a' : m >= 50 ? '#efe6cf' : m >= 30 ? '#a99d82' : '#6e675a';
      if (e.dataset.c !== c) { e.dataset.c = c; e.style.background = c; e.style.opacity = m >= 30 ? '1' : '.7'; }
      e.style.transform = `translate(${Math.round((this.tmpV.x + 1) / 2 * innerWidth)}px,${Math.round((1 - this.tmpV.y) / 2 * innerHeight)}px) rotate(45deg)`;
    }
  }

  // 初陣の所属は近い二人だけ。札と投影用の点を使い回す。
  fieldMarks(rt) {
    if (pinGuideOn(rt)) return; // 全戦で兵・隊・旗の頭上の札と印を作らない。
    if (this.fieldMarkBounds) for (const bounds of this.fieldMarkBounds) bounds[2] = 0;
    const signs = !rt.over && !this.introWaiting && !this.root.classList.contains('photo') && rt.def.fieldSigns?.(rt);
    if (!signs) { this.fieldFoe = null; if (this.fieldMarkBox) this.fieldMarkBox.hidden = true; return; }
    if (!this.fieldMarkBox) {
      const box = document.createElement('div'); box.id = 'field-signs';
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      this.fieldMarkEls = [];
      this.fieldMarkBounds = [[0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 2; i++) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;padding:2px 5px;background:rgba(12,10,8,.88);border-bottom:2px solid;font-size:12px;line-height:1.4;white-space:nowrap';
        el.style.color = i ? '#ffd2c2' : '#f3e7c5';
        // 追う相手・倒す相手は、名の下に大きな赤い▼（味方には出さない）。
        if (i) { el.style.textAlign = 'center'; el.style.borderBottom = '0'; el.style.background = 'transparent'; el.innerHTML = '<b style="display:block;padding:1px 5px;background:rgba(12,10,8,.88);font-size:13px;font-weight:600"></b><span style="display:block;line-height:1;color:#ff4a2e;font-size:24px;-webkit-text-stroke:1px #2a0d06">▼</span>'; }
        box.appendChild(el); this.fieldMarkEls.push(el);
      }
      this.root.appendChild(box); this.fieldMarkBox = box;
    }
    this.fieldMarkBox.hidden = false;
    let firstX = -1000, firstY = -1000;
    for (let i = 0; i < 2; i++) {
      const el = this.fieldMarkEls[i], sign = signs[i], u = i || sign?.label ? sign?.unit : null;
      if (i) { this.fieldFoe = null; el.hidden = true; continue; }
      if (!u?.alive || u.gone || u.mesh?.visible === false) { el.hidden = true; continue; }
      this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.3), u.pos.z).project(rt.camera);
      el.hidden = this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > .85 || Math.abs(this.tmpV.y) > .8;
      const edgeEnemy = i === 1 && rt.def.key === 'inou';
      if (el.hidden && !edgeEnemy) continue;
      const label = sign.label || '';
      let mark = '▼';
      let x = Math.round((this.tmpV.x + 1) / 2 * innerWidth);
      let y = Math.round((1 - this.tmpV.y) / 2 * innerHeight);
      if (edgeEnemy && (el.hidden || y < 84 || x > innerWidth - 240 && y < 150)) {
        const dx = u.pos.x - rt.player.u.pos.x, dz = u.pos.z - rt.player.u.pos.z;
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        x = right >= 0 ? innerWidth - 85 : 85;
        y = innerHeight * .55;
        mark = forward < 0 ? (right >= 0 ? '↘' : '↙') : (right >= 0 ? '→' : '←');
        el.hidden = false;
      }
      // 名と印を別々に更新し、画面外の案内でも赤い印を残す。
      setText(i ? el.firstChild : el, label);
      if (i) { el.firstChild.hidden = !label; setText(el.lastChild, mark); }
      if (i && Math.abs(x - firstX) < 150 && Math.abs(y - firstY) < 26) y -= 28;
      if (y < 84 || x > innerWidth - 240 && y < 150) { el.hidden = true; continue; }
      // 任務・台詞の下へ入り込む所属札は畳む。画面の四角は既存の測定を使う。
      const width = Math.max(i ? 24 : 0, label.length * 12 + 10);
      for (const r of this.rects || []) {
        if (x + width / 2 > r.left && x - width / 2 < r.right && y > r.top && y - 26 < r.bottom) {
          if (edgeEnemy) y = Math.min(innerHeight - 90, r.bottom + 32);
          else { el.hidden = true; break; }
        }
      }
      if (el.hidden) continue;
      firstX = x; firstY = y;
      const bounds = this.fieldMarkBounds[i];
      bounds[0] = x; bounds[1] = y - 12; bounds[2] = width;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
  }

  // 任務の札。右上に今することを大きく一行、必要な進みと残り時間を小さく添える。
  //   戦の定義に missions（または stages）と missionOf（または stageOf）があればそれを使う。無い戦は、主の任務が変わるたびに一つ進める。
  //   字が変わる時だけ書く（setText）。毎コマ作らない。
  progress(rt) {
    const def = rt.def, root = this.root;
    if (def.town || def.dojo) {
      this.progChangeAnimation?.cancel(); this.progChangeAnimation = null;
      if (this.prog) { this.prog.hidden = true; this.prog.classList.remove('pg-changing'); root.classList.remove('prog-on'); }
      return;
    }
    if (!this.prog) {
      const el = document.createElement('div');
      el.id = 'h-prog';
      el.innerHTML = '<div class="pg-st"><b></b><span></span></div><div class="pg-next"></div><div class="pg-dots"></div><div class="pg-time"><i class="pg-pie" hidden></i><span></span></div><div class="pg-context" hidden></div>';
      root.appendChild(el);
      const st = document.createElement('style');
      st.textContent = `
#hud.prog-on .tl .plaque { display:none; }
#hud #h-prog { position:absolute; right:calc(16px + env(safe-area-inset-right, 0px)); top:calc(14px + env(safe-area-inset-top, 0px)); box-sizing:border-box; width:max-content; max-width:calc(100% - 32px); padding:8px 12px; background:#14120f; border-right:3px solid var(--kin); color:#fff3df; font-size:max(20px, calc(20px * var(--text-scale, 1))); line-height:1.4; text-align:right; pointer-events:none; }
#hud #h-prog .pg-st b { display:none; }
#hud #h-prog .pg-st span { font-weight:700; }
#hud #h-prog .pg-next { margin-top:1px; font-size:max(12px, calc(13px * var(--text-scale, 1))); color:#e6dcc6; }
#hud #h-prog .pg-context { font-size:12px; color:#e6dcc6; }
#hud #h-prog .pg-dots { margin-top:2px; letter-spacing:.2em; color:var(--kin); font-size:12px; }
#hud #h-prog .pg-time { margin-top:1px; font-size:12px; color:#d9cfb8; font-variant-numeric:tabular-nums; display:flex; justify-content:flex-end; align-items:center; gap:6px; }
#hud #h-prog .pg-pie, #hud .tm-pie { display:inline-block; width:16px; height:16px; border-radius:50%; box-shadow:0 0 0 1.5px #c9b27a; background:conic-gradient(#e8c25a calc(var(--p, 0) * 1%), rgba(255,255,255,.12) 0); flex:none; }
#hud #h-prog .pg-pie[hidden] { display:none; }
/* 桶狭間の満ちる丸は時計の針を添え、待ちの経過を形だけで示す。 */
#hud #h-prog[data-battle="okehazama"] .pg-pie { position:relative; }
#hud #h-prog[data-battle="okehazama"] .pg-pie::after { content:""; position:absolute; left:calc(50% - 1px); top:12%; width:2px; height:38%; background:#fff3df; box-shadow:0 0 1px 1px #14120f; transform-origin:50% 100%; transform:rotate(calc(var(--p, 0) * 3.6deg)); }
@media (max-height:500px), (pointer:coarse) {
 #hud #h-prog { right:calc(8px + env(safe-area-inset-right, 0px)); top:calc(8px + env(safe-area-inset-top, 0px)); max-width:calc(100% - 32px); padding:6px 10px; font-size:max(20px, calc(20px * var(--text-scale, 1))); line-height:1.4; }
 #hud #h-prog .pg-next { font-size:12px; white-space:normal; }
}
/* 大きな行動一行と、小さい進み・時間を同じ札へまとめる。 */
#hud #h-prog { width:max-content; max-width:calc(100vw - 112px); background:#14120f; }
#hud #h-prog .pg-st { display:flex; flex-direction:column-reverse; align-items:flex-end; }
html:root body #hud #h-prog .opening-controls-help:not([hidden]) { display:block !important; }
html:root body #hud #h-prog .opening-controls-help[hidden] { display:none !important; }
#hud #h-prog .pg-st span { font-size:max(20px, calc(20px * var(--text-scale, 1))); line-height:1.4; white-space:nowrap; }
#hud #h-prog .pg-st b { margin:2px 0 0; font-size:12px; }
#hud #h-prog .pg-next { max-width:320px; font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4; }
#hud #h-prog .pg-dots { display:flex; justify-content:flex-end; align-items:center; gap:10px; letter-spacing:.05em; font-size:max(15px, calc(15px * var(--text-scale, 1))); color:var(--kin); }
#hud #h-prog .pg-dots[hidden] { display:none; }
#hud #h-prog .pg-pct { color:#f3e6c4; font-variant-numeric:tabular-nums; }
#hud #h-prog .pg-dir { display:inline-block; font-style:normal; font-weight:700; font-size:22px; line-height:1; color:#fff3ba; text-shadow:0 1px 2px #000; }
@media (max-height:500px) {
 #hud #h-prog { max-width:min(360px, 44vw); }
 #hud #h-prog .pg-st span, #hud #h-prog .pg-next { max-width:100%; white-space:normal; overflow:visible; overflow-wrap:anywhere; }
 #hud #h-prog .pg-time { font-size:max(15px, calc(15px * var(--text-scale, 1))); }
}

/* 共通の行動札は右上に固定し、携帯横でも一行を大きく読む。 */
#hud.field-clean #h-prog .pg-st span { font-size:max(24px, calc(24px * var(--text-scale, 1))); }
/* 同じ任務の一行だけを中央へ運ぶ。札や字を複製しない。 */
html:root body #hud #h-prog.pg-changing > :not(.pg-st) { display:none !important; }
html:root body #hud #h-prog.pg-changing .pg-st span { white-space:nowrap; }
#hud.ending #h-prog, #hud:has(#bigmap:not([hidden])) #h-prog { visibility:hidden; }
/* 稲生は任務を右、台詞を左。兵数と方位の帯の下を使う。 */
html:root body #hud:has(#h-prog[data-battle="inou"]) #h-prog {
 top:calc(72px + env(safe-area-inset-top, 0px)); width:max-content; max-width:min(440px, 54vw);
}
html:root body #hud:has(#h-prog[data-battle="inou"]) #h-prog :is(.pg-st span,.pg-next) {
 white-space:pre-line !important; overflow:visible; text-overflow:clip; overflow-wrap:normal; word-break:keep-all;
}
/* 稲生の今の操作は任務の二行目に残す。共通の一行表示で隠さない。 */
html:root body #hud.mission-only #h-prog[data-battle="inou"] > .pg-next:not([hidden]) {
 display:block !important;
}
html:root body #hud:has(#h-prog[data-battle="inou"]) #h-prog .pg-context { display:block; }
html:root body #hud.prog-on:has(#h-prog[data-battle="inou"]) #battle-notices:not(.choosing):not(.pg-x) {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
 top:calc(104px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
 width:min(300px, 38vw) !important; max-width:38vw !important; max-height:calc(100% - 200px) !important;
}
/* 操作の試し中は、同じ手ほどきを左右へ二枚出さない。 */
html:root body #hud:has(#h-prog[data-battle="inou"][data-practice="true"]) #tutorial { display:none !important; }
/* 任務は任務の札にまとめる。右の任務の札は重ねて出さない（台詞の札は残す）。 */
html:root body #hud.prog-on #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; }
/* 構えの待ち釦も出さない（構えは自分で判断する。kaito 10/23 稲生 4）。 */
html:root body #hud.prog-on #wait-guard { display:none !important; }
@media (min-height:501px) {
 html:root:not(.touch) body #hud.prog-on #battle-notices:not(.choosing):not(.pg-x) {
  left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important; top:calc(176px + env(safe-area-inset-top, 0px)) !important;
  bottom:auto !important; width:300px !important; max-height:calc(100% - 320px) !important;
 }
}`;
      root.appendChild(st);
      this.prog = el;
    }
    const el = this.prog;
    if (el.dataset.battle !== def.key) el.dataset.battle = def.key || '';
    if (def.key === 'inou') el.dataset.practice = String(rt.flags.step === 0 && rt.flags.training === 0);
    el.hidden = !!rt.over; root.classList.toggle('prog-on', !rt.over);
    const [stEl, nextEl, dotsEl, timeEl, contextEl] = el.children;
    // 稲生の右上は任務の一行だけにする。
    setText(contextEl, ''); contextEl.hidden = true;
    const list = def.missions || def.stages;
    const task = currentObjective(rt)?.text || '';
    const taskLine = task.replace(/^使番「|」$/g, '').split(/[。／]/)[0].trim();
    let i, n, title;
    const of = def.missionOf || def.stageOf;
    if (list && of) {
      n = list.length; i = Math.max(0, Math.min(n - 1, of(rt) | 0)); title = list[i];
    } else {
      // 段の無い戦も、主の任務の切り替わりを覚える。札には番号を出さない。
      if (this.progRt !== rt) { this.progRt = rt; this.progSeen = []; this.progStage = undefined; }
      if (taskLine && this.progSeen[this.progSeen.length - 1] !== taskLine) this.progSeen.push(taskLine);
      i = Math.max(0, this.progSeen.length - 1); n = 0; title = this.progSeen[i] || '';
    }
    // 案内役の印は本人の頭上だけ。任務札に別の形を添えない。
    setText(stEl.firstChild, '');
    stEl.firstChild.style.display = 'none';
    // 「左へ下がる」のような向きの字は出さない（kaito 10/23）。
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0), p = rt.player.u.pos;
    let headline = missionCaption(rt, def.missionTaskFirst ? task || title : title || task) || '味方の旗へ進め';
    // 任務の一行へ実際の攻撃操作を収める。別の札や知らせは増やさない。
    if (!def.missionSignTarget && def.key !== 'moribe' && /^(?:近くの|この)?敵を\s*(?:たおせ|倒せ)$/.test(headline)) {
      const player = rt.player;
      const enemy = (player.inRange && player.rangeCueTarget?.alive ? player.rangeCueTarget : null) ||
        this.approachGuideEnemy || this.attackGuideEnemy || this.aimGuideEnemy ||
        (rt.guideEnemyShown && rt.guideEnemy) || rt.missionGuide?.closeEnemy;
      if (enemy?.alive && enemy.team !== player.u.team && sightUnit(rt, enemy))
        headline = player.inRange ? `印の敵へ ${attackOperation(rt)}` : '印の敵へ近づこう';
    }
    // 相手の名前から一続きの一行にする。赤い▼は敵の頭上だけに置く。
    setText(stEl.lastChild, headline);
    stEl.lastChild.classList.toggle('foe-task', def.key === 'okehazama' && headline.startsWith('▼'));
    // 戦固有の案内と任務の進みは残す。同じ任務の全文は重ねない。
    const status = def.missionStatus?.(rt, taskLine);
    const sub = def.key === 'inou' || def.missionSingleLine ? '' : def.missionDetail ? def.missionDetail(rt) :
      (typeof def.missionStatusFirst === 'function' ? def.missionStatusFirst(rt) : def.missionStatusFirst) ? status || '' :
        currentObjective(rt)?.progress || (status && status !== headline ? status : '');
    // 稲生は任務の一行だけ。操作や距離の説明を重ねない。
    setText(nextEl, sub); nextEl.hidden = !(sub && (def.key === 'inou' || sub.length <= (def.missionStatusMaxLength ?? 14)) && (rt.teachOn?.() || !!def.missionDetail));
    // 必要な号令だけ、今の任務の直下で一度押せるようにする。
    if (def.missionAction && !this.missionActionButton) {
      const button = this.missionActionButton = document.createElement('button');
      button.type = 'button'; button.className = 'pg-action'; button.hidden = true;
      el.appendChild(button);
      for (const name of ['pointerdown', 'pointerup', 'keydown', 'keyup']) button.addEventListener(name, e => e.stopPropagation());
      button.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const battle = this.rt;
        if (!battle || battle.over || battle.choice || !battle.player.u.alive || button.disabled || button.hidden) return;
        const action = battle.def.missionAction?.(battle);
        if (!action || action.disabled) return;
        // 連打で「同じ号令を取り消す」が働かないよう、返事を待つ。
        this.missionActionUntil = battle.t + 4.1; button.disabled = true;
        const selected = battle.player.selGroup;
        battle.player.selGroup = 'all';
        try { battle.player.command(action.command); }
        finally { battle.player.selGroup = selected; }
      });
    }
    if (this.missionActionRt !== rt) { this.missionActionRt = rt; this.missionActionUntil = 0; }
    if (this.missionActionButton) {
      const action = !rt.over && !rt.choice && rt.player.u.alive ? def.missionAction?.(rt) : null;
      this.missionActionButton.hidden = !action;
      if (action) {
        setText(this.missionActionButton, action.label);
        this.missionActionButton.disabled = !!action.disabled || rt.t < this.missionActionUntil;
      }
    }
    // 段の進み（2／4・％）と行き先の向き（矢印）。％は段の数と、今の段の中の進み（def.missionPercent があれば）から。
    if (n && def.key !== 'inou' && !def.missionSingleLine) {
      const inner = Math.max(0, Math.min(0.99, def.missionPercent?.(rt) ?? 0));
      const pct = Math.round((i + inner) / n * 100);
      const goal = missionTarget(rt);
      let arrow = '';
      if (goal && rt.player.u.alive) {
        const gx = goal.x - p.x, gz = goal.z - p.z;
        if (Math.hypot(gx, gz) > (goal.r || 6)) {
          const r = -gx * Math.cos(yaw) + gz * Math.sin(yaw), f = gx * Math.sin(yaw) + gz * Math.cos(yaw);
          const deg = Math.round(Math.atan2(r, f) * 180 / Math.PI / 15) * 15;
          arrow = '';   // 10/25 kaito「矢印二つだるい」：向きはピン（画面の端の印）だけで示す
        }
      }
      const html = `<b>${i + 1}／${n}</b><span class="pg-pct">${pct}%</span>${arrow}`;
      if (dotsEl._h !== html) { dotsEl._h = html; dotsEl.innerHTML = html; dotsEl.setAttribute('aria-label', `${n}段のうち${i + 1}段目・${pct}パーセント`); }
      dotsEl.hidden = false;
    } else { setText(dotsEl, ''); dotsEl.hidden = true; }
    const sec = Math.max(0, rt.t | 0), est = (def.minutes || 7) * 60;
    const left = Math.max(1, Math.round((est - sec) / 60));
    void left; setText(timeEl.lastChild, '');
    // 待つ間（陣を敷く・寄せを待つ）の残りは、秒の字でなく満ちていく丸で（kaito 10/23 稲生 14）。
    const gm = rt.missionGuide?.marker, wu = gm?.waitUntil?.();
    const progress = def.missionWaitProgress?.(rt);
    // 待機中は任務一行の下地を満たす。集合ピンが視界を外れても進みを見失わない。
    const waitFill = (def.key === 'moribe' || def.key === 'okehazama') && Number.isFinite(progress)
      ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : -1;
    if (el._waitFill !== waitFill) {
      el._waitFill = waitFill;
      stEl.classList.toggle('moribe-wait', waitFill >= 0);
      stEl.style.setProperty('--wait-progress', String(Math.max(0, waitFill)));
      stEl.style.backgroundImage = waitFill < 0 ? '' :
        `linear-gradient(to right, #edc65e ${waitFill}%, #393328 ${waitFill}%)`;
      stEl.style.backgroundSize = waitFill < 0 ? '' : '100% 5px';
      stEl.style.backgroundPosition = waitFill < 0 ? '' : 'left bottom';
      stEl.style.backgroundRepeat = waitFill < 0 ? '' : 'no-repeat';
    }
    // 桶狭間の null は「今は待ちではない」。接敵中に共通の時計を戻さない。
    const pie = timeEl.firstChild, waiting = def.key === 'okehazama' ? Number.isFinite(progress) :
      Number.isFinite(progress) || Number.isFinite(wu) && wu > rt.t && gm.waitDuration > 0;
    // 一行だけの戦は待ち時間も行き先のピンにまとめる。
    timeEl.hidden = def.key === 'inou' || def.key === 'moribe' || !!def.missionSingleLine;
    pie.hidden = !waiting;
    if (waiting) pie.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1 - (wu - rt.t) / gm.waitDuration)) * 100)));
    // 古い別札は使わず、今ある一行そのものの切り替わりを伝える。
    this.progStage = i;
    this.missionChange(rt, headline);
  }

  missionChange(rt, headline) {
    const el = this.prog, reduced = S.reduceMotion;
    const changed = this.progChangeRt !== rt || this.progChangeHeadline !== headline;
    const stopMotion = reduced && this.progChangeAnimation && !this.progChangeReduced;
    if (!changed && !stopMotion && !rt.over) return;
    if (this.progChangeRt !== rt) this.progChangeTimes = new Map();
    this.progChangeRt = rt; this.progChangeHeadline = headline;
    this.progChangeAnimation?.cancel(); this.progChangeAnimation = null;
    el.classList.remove('pg-changing');
    if (rt.over || !headline) return;
    this.progChangeReduced = reduced;
    // 同じ知らせの強調は八秒あけ、札は右上から動かさない。
    const last = this.progChangeTimes.get(headline) ?? -Infinity;
    if (rt.t - last < 8) return;
    this.progChangeTimes.set(headline, rt.t);
    const animation = el.animate([
      { boxShadow: '0 0 0 transparent' },
      { boxShadow: '0 0 0 3px #e8c25a', offset: .35 },
      { boxShadow: '0 0 0 transparent' },
    ], { duration: reduced ? 0 : 800, easing: 'ease-in-out' });
    this.progChangeAnimation = animation;
    animation.onfinish = () => {
      if (this.progChangeAnimation !== animation) return;
      this.progChangeAnimation = null;
      el.classList.remove('pg-changing');
    };
  }


  // 手ほどき・ヒントの札（左の中ほど。携帯の横向きでも隠さない）
  drawCard() {
    const el = $('tutorial');
    el.hidden = true;
    if (el.textContent) el.textContent = '';
  }


  // 戦の中の選択
  renderChoice(c) {
    const el = $('choice');
    if (!c) { const restore = el.contains(document.activeElement); el.hidden = true; this.notices.sync(); if (restore) { const target = this.choiceOpener?.isConnected && this.choiceOpener !== document.body ? this.choiceOpener : $('objectives'); target?.focus?.({ preventScroll:true }); } return; }
    this.choiceOpener = document.activeElement;
    el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', 'choice-title');
    const keyboard = this.keyboardInput;
    const keys = c.options.map((o, i) => i + 1).join(' か ');
    const guide = isTouch ? '押して選ぶ' : `札か数字 ${keys} で選ぶ`;
    const deadline = `${Math.ceil(c.t)}秒後は一番上`;
    const title = c.title === '東に別手。どこを守る？' ? '東に別手。守る所は？' : c.title;
    el.hidden = false;
    el.innerHTML = `<h5 id="choice-title" tabindex="-1">${esc(title)}</h5><p class="choice-help">${guide}・${deadline}</p><span id="choice-seconds" role="status"></span>` + c.options.map((o, i) => `<button type="button" class="opt" data-pick="${i}"><kbd class="cap">${i + 1}</kbd><b>${esc(o.label)}</b><small>${esc(o.note || '')}</small></button>`).join('') + '<div class="tm"><i id="choice-t"></i></div>';
    el.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.rt?.pickChoice(+b.dataset.pick); };
      b.onkeydown = (e) => {
        e.stopPropagation();
        const pick = Number(e.key) - 1;
        if (/^[1-9]$/.test(e.key) && c.options[pick]) {
          e.preventDefault();
          if (!e.repeat) this.rt?.pickChoice(pick);
        } else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
      };
    });
    el.scrollTop = 0;
    this.choiceMax = c.t;
    if (keyboard) el.querySelector('h5').focus({ preventScroll:true });
    this.notices.sync();
  }

  choiceTime(t) { const b = $('choice-t'); if (b) setWidth(b, Math.max(0, t / (this.choiceMax || 20) * 100)); const secs = $('choice-seconds');
    // 残りは秒の字でなく、満ちていく丸で（kaito 10/23 稲生 14）。読み上げ用に字は残す。
    if (secs) { if (!secs.firstElementChild) secs.innerHTML = '<i class="tm-pie" aria-hidden="true"></i>'; secs.firstElementChild.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, 1 - t / (this.choiceMax || 20))) * 100))); secs.setAttribute('aria-label', `残り${Math.max(0, Math.ceil(t))}秒`); } }


  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['移動', `${K('forward')} ${K('left')} ${K('back')} ${K('right')}`], ['視点', '動かして見回す'], ['突く', '左押し（押すだけ）'], ['話す・取る', K('use')]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) {
      el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表</h5><button type="button" class="btn" id="cheat-close" style="min-height:44px;margin-bottom:8px">早見表を閉じる</button>');
      $('cheat-close').onclick = (e) => { e.stopPropagation(); this.toggleCheat(); };
    }
  }
}
