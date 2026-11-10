import { pinGuideOn, missionTarget, TALK_SIGN } from './mission_pin.js';
import { setText, setWidth, coachCss, $, esc, keyCaps, shortTask, singleBattleGuide, rescueTarget, retreatRequired, attackOperation } from "./hud_common.js";
import { currentObjective, taskText, missionCaption } from "./mission_guide.js";
import { isTouch } from "./touch.js";
import { K, S } from "./settings.js";
import { sightUnit } from './battle_sight.js';
import { stageNow, killNow } from './stages.js';
import { goalsTick } from './hud_goals.js';
import { periodWords } from './speech_clean.js';
import { guideSymbol } from './field_guide_symbol.js';

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
    this.controlsHelp.hidden = !active || this.controlsElapsed > 12 || S.reduceGuidance || rt.def.missionStyle === 'lesson' || rt.def.missionStyle === 'raid' || rt.def.noControlsHelp || rt.def.key !== 'inou';   // 操作の字は稲生（教えの戦）だけ。noControlsHelp：操作は尾張の戦で覚える。後の戦は操作の字を出さない
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
        const label = (typeof rt.def.missionAllyLabel === 'function' ? rt.def.missionAllyLabel(rt) : rt.def.missionAllyLabel) || (ally === rt.flags.genpachi ? '組頭' : '仲間');
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
    const active = rt.def.missionStyle === 'lesson' && rt.player.u.alive && !rt.flags.ending && !rt.over && !rt.choice &&
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
    // 字は武将の名だけ。距離・歩数・向きの字は出さず、矢印と▼で示す。
    let label = name;
    if (!onScreen) {
      rt.camera.getWorldDirection(this.tmpV);
      const dx = u.pos.x - me.x, dz = u.pos.z - me.z;
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      // 後ろの目標も横の端で示し、左右へ振り向かせる。下向きの矢印を後退の指示に見せない。
      const sideways = forward < 0 || Math.abs(right) > Math.abs(forward);
      x = sideways ? right >= 0 ? W - margin : margin : W / 2;
      y = sideways ? H * (forward >= 0 ? .45 : .65) : 128;
      const arrow = sideways ? right >= 0 ? '→' : '←' : '↑';
      // 後方も左右へ振り向かせ、同じ目標の名を残す。
      label = `${arrow} ${name}`;
    }
    setText(el.firstChild, label);
    setText(el.lastChild, '▼');   // 矢印（↓）は使わない（五3・11/8 critic60 越前一向一揆）
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
    const on = (!pinGuideOn(rt) || rt.def.keepBattleSigns) && rt.def.enemyTriangleSigns && me.alive && !rt.over && !rt.choice &&
      !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    if (!this.enemyTriangles) {
      if (!on) return;
      this.enemyTriangles = [];
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      for (let i = 0; i < 250; i++) {
        const el = document.createElement('span');
        el.textContent = '▼';
        // 11/8 critic60（小谷・忍 九3・BR）：17px の橙で米粒ほどだった。大きな赤い▼に
        el.style.cssText = 'position:absolute;left:0;top:0;color:#e3261b;font-size:28px;line-height:1;-webkit-text-stroke:1.5px #2a0c08;text-shadow:0 1px 3px #000;pointer-events:none';
        el.hidden = true; box.appendChild(el); this.enemyTriangles.push(el);
      }
      this.root.appendChild(box);
    }
    let n = 0;
    const markedGroup = on ? rt.def.enemyTriangleGroup?.(rt) : null;
    // 11/10 iPhone 横の見回り：遠くの隊で▼が八つ十つ重なって赤い塊になり、左上の釦や右上の札にも被っていた。
    //   近くに置いた▼と重なる物は出さず、HUD の札・釦の上には置かない（札の囲みは一秒ごとに測り直す）。
    const now = performance.now();
    if (on && (!this.triBlock || now - this.triBlockT > 1000)) {
      this.triBlockT = now; this.triBlock = [];
      for (const b of document.querySelectorAll('#h-prog, #jk-vit, #tc button, button.tb')) {
        const r = b.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.width < innerWidth * .6) this.triBlock.push(r);
      }
    }
    const placed = this.triPlaced || (this.triPlaced = []); placed.length = 0;
    if (on) for (const u of rt.army.units) {
      if (n === this.enemyTriangles.length) break;
      if (rt.def.enemySignVisible?.(rt, u) === false) continue;
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget && !(markedGroup && u.group === markedGroup) || u.isStruct || u.team === me.team ||
          u.mesh?.visible === false || u.camHidden) continue;
      this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) continue;
      // 距離だけで敵印を切らない。画面の外を先に除き、壁・霧の見通しは兵と同じ判定にする。
      if (!sightUnit(rt, u)) continue;
      const hp = this.headPointerAt, sx = (this.tmpV.x + 1) * innerWidth / 2, sy = (1 - this.tmpV.y) * innerHeight / 2;
      if (hp && performance.now() - hp.t < 150 && Math.abs(sx - hp.x) < 28 && Math.abs(sy - hp.y) < 60) continue;   // 11/8 critic60（五3）：目標の▼と同じ兵に二つ重ねない
      let hit = false;
      // 近い別の兵まで印を消すと、柵の乱戦で敵味方を見分けられない。密集の間引きは遠景だけにする。
      const distant = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 3600;
      for (let k = 0; distant && k < placed.length && !hit; k += 2) hit = Math.abs(sx - placed[k]) < 18 && Math.abs(sy - placed[k + 1]) < 20;
      for (const r of this.triBlock) if (!hit && sx > r.left - 14 && sx < r.right + 14 && sy > r.top && sy < r.bottom + 28) hit = true;
      if (hit) continue;
      placed.push(sx, sy);
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
      const edgeEnemy = i === 1 && rt.def.missionStyle === 'lesson';
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
  progress(rt, force = false) {
    // 11/9 重さ：任務の札の字の組み立ては十分の一秒に一度で足りる（毎コマだと兵が集まった時の一コマの数%）。戦が替われば待たない
    if (!force && this.progTickRt === rt && rt.t >= this.progTickT && rt.t - this.progTickT < 0.1) return;
    this.progTickRt = rt; this.progTickT = rt.t;
    const def = rt.def, root = this.root;
    root.classList.toggle('mission-one-line', !!def.missionSingleLine);
    const battleOrder = !def.town && !def.dojo;
    root.classList.toggle('battle-order', battleOrder);
    root.classList.toggle('practice-battle', !!def.dojo && !!def.missionSingleLine);
    if (def.town || def.dojo && !def.missionSingleLine) {
      this.progChangeUntil = 0;
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
/* 練習も相手の▼と任務一行だけにし、開始の題や被弾の文章を重ねない。 */
#hud.practice-battle :is(#banner,#subtitle) { display:none !important; }
/* 「合図：〇〇＝〇〇」の説明は字で出さない。合図は音と台詞で分からせる（kaito 五の1・11/5 三方ヶ原から全戦へ）。 */
html:root body #hud #battle-notices #objectives .obj-cue { display:none !important; }
/* 始まりの札の上に任務の札を重ねない（kaito 五の4）。札を閉じてから出す。 */
html:root body:has(#intro:not([hidden]) > .card) :is(#battle-notices,#h-prog,#jk-vit,#jk-map,#side-ctl,#minimap) { visibility:hidden !important; opacity:0 !important; pointer-events:none !important; }
/* 一行の下知を使う戦は、古い任務本文と教えの札を同時に積まない。選択と操作は残す。 */
html:root body #hud.mission-one-line #battle-notices:not(.choosing) #objectives#objectives:not(.expand) :is(#obj-list,#tutorial,.obj-cue) { display:none !important; }
html:root body #hud.mission-one-line #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(:has(.battle-action:not([hidden]))) { display:none !important; }
#hud.mission-one-line #h-prog { padding:4px 8px; font-size:max(16px, calc(16px * var(--text-scale, 1))); }
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
#hud #h-prog .pg-stage { font-style:normal; font-weight:700; font-size:max(13px, calc(13px * var(--text-scale, 1))); color:#e8c86a; margin-right:8px; vertical-align:middle; font-variant-numeric:tabular-nums; white-space:nowrap; }
#hud #h-prog .pg-stage[hidden] { display:none; }
#hud #h-prog .pg-pct { color:#f3e6c4; font-variant-numeric:tabular-nums; }
#hud #h-prog .pg-dir { display:inline-block; font-style:normal; font-weight:700; font-size:22px; line-height:1; color:#fff3ba; text-shadow:0 1px 2px #000; }
@media (max-height:500px) {
 #hud #h-prog { max-width:calc(100% - 112px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); }
 #hud #h-prog .pg-st { min-width:0; }
 #hud #h-prog .pg-st span, #hud #h-prog .pg-next { min-width:0; max-width:100%; white-space:normal !important; overflow:visible; overflow-wrap:anywhere; }
 #hud #h-prog .pg-time { font-size:max(15px, calc(15px * var(--text-scale, 1))); }
}

/* 共通の行動札は右上に固定し、携帯横でも一行を大きく読む。 */
#hud.field-clean #h-prog .pg-st span { font-size:max(24px, calc(24px * var(--text-scale, 1))); }
/* 任務の文は増やさず、携帯横では一行の幅に合わせる。 */
@media (max-height:500px) {
 html:root body #hud #h-prog .pg-st span {
  font-size:max(24px, calc(24px * var(--text-scale, 1)));
  white-space:normal !important;
 }
}
/* 切り替えの一度だけ、同じ一行を光らせる。 */
@keyframes mission-change { 0%,100% { transform:scale(1); background:#14120f; } 35% { transform:scale(1.08); background:#675224; } }
#hud #h-prog.pg-changing { transform-origin:top right; animation:mission-change .8s ease-out 1; }
body.rm #hud #h-prog.pg-changing { animation:none; }
@media (prefers-reduced-motion:reduce) { #hud #h-prog.pg-changing { animation:none; } }
#hud.ending #h-prog, #hud:has(#bigmap:not([hidden])) #h-prog { visibility:hidden; }
/* 初めの二戦は右上の任務を横向きの画面の内側に収める。 */
html:root body #hud:has(#h-prog:is([data-battle="inou"],[data-battle="okehazama"])) #h-prog {
 right:calc(16px + env(safe-area-inset-right, 0px));
 top:calc(12px + env(safe-area-inset-top, 0px)); width:max-content;
 max-width:calc(100% - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); padding:4px 8px;
 animation:none; transform:none;
}
html:root body #hud:has(#h-prog:is([data-battle="inou"],[data-battle="okehazama"])) #h-prog :is(.pg-st span,.pg-next) {
 max-width:100%; white-space:normal !important; overflow:visible; text-overflow:clip; overflow-wrap:anywhere;
}
/* 小地図・体力・任務の三枚。兵力と任務の補足を畳む。 */
html:root body #hud:has(#h-prog:is([data-battle="inou"],[data-battle="okehazama"])) :is(#maphint,.pg-next:not(.route-steps),.pg-context) { display:none !important; }
html:root body #hud.compact-map #armybar { display:none !important; }
/* 稲生は任務一行を残し、地図と余分な頭上の案内を畳む。 */
html:root body #hud:has(#h-prog[data-battle="inou"]) #minimap#minimap { display:none !important; }
html:root body #hud.action-guide:has(#h-prog[data-battle="inou"]) #h-prog { display:block !important; }
html:root body #hud.field-clean.compact-map:not(.photo):not(.ending):not(:has(#mission-goal:is(.fire-action,.talk-action):not([hidden]))) #minimap { display:block !important; }
@media (max-height:500px) {
 html:root body #hud.field-clean.compact-map #minimap { width:96px !important; height:96px !important; }
 #hud #h-prog .pg-next.route-steps { font-size:max(20px, calc(20px * var(--text-scale, 1))); }
}
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
}
/* 目標の帯は小さな地図の左に置き、重ねない（--prog-right は地図の左端から測って入れる）。長い字は二行に折り、全部見せる。 */
html:root body #hud #h-prog:not([data-battle="inou"]):not([data-battle="okehazama"]) {
 right:var(--prog-right, calc(16px + env(safe-area-inset-right, 0px))) !important;
 max-width:min(380px, calc(100% - var(--prog-right, 112px) - 16px - env(safe-area-inset-left, 0px))) !important;
}
html:root body #hud #h-prog:not([data-battle="inou"]):not([data-battle="okehazama"]) :is(.pg-st span,.pg-next) {
 white-space:normal !important; overflow:visible; overflow-wrap:anywhere; max-width:100%; text-wrap:balance;
}
html:root body #hud #h-prog:not([data-battle="inou"]):not([data-battle="okehazama"]) .pg-st span { font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; }
/* 命・小地図・今する事の三枚。既存の任務札を一行だけ復帰する。 */
html:root body #hud#hud.battle-order #h-prog#h-prog {
 display:block !important; visibility:visible !important; top:calc(196px + env(safe-area-inset-top,0px)) !important;
 right:calc(16px + env(safe-area-inset-right,0px)) !important; width:max-content !important;
 max-width:30vw !important; min-width:0 !important; padding:6px 8px !important;
 background:#14120f !important; border:1px solid #c2a25a !important; pointer-events:none !important;
}
html:root body #hud#hud.battle-order #h-prog#h-prog > :not(.pg-st),
html:root body #hud#hud.battle-order #h-prog#h-prog .pg-stage { display:none !important; }
html:root body #hud#hud.battle-order #h-prog#h-prog .pg-st { display:flex !important; flex-direction:row !important; align-items:center !important; gap:6px; }
html:root body #hud#hud.battle-order #h-prog#h-prog .pg-st > b { display:block !important; flex:none; width:22px; height:26px; }
html:root body #hud#hud.battle-order #h-prog#h-prog .pg-st > span { display:block !important; color:#fff3df; font-size:max(22px,calc(22px * var(--text-scale,1))) !important; line-height:1.4; white-space:normal !important; }
/* 佐和山の内応・開城・落城は台詞と札で伝える。台詞の親枠ごと隠さない。 */
html:root body #hud#hud.battle-order:not(:has(#h-prog[data-battle="k07_sawayama"])) :is(#battle-notices:not(.choosing),#subtitle,#banner),
html:root body #hud#hud.battle-order :is(#jk-rest,#tugbar) { display:none !important; }
/* 今の目標・兵数を一枚へ。体力と行き先の目印を合わせて三枚に収める。 */
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode {
 left:auto !important; top:calc(12px + env(safe-area-inset-top,0px)) !important;
 right:calc(8px + env(safe-area-inset-right,0px)) !important; transform:none !important;
 width:min(320px,36vw) !important; min-width:0 !important; max-width:36vw !important;
 box-sizing:border-box; padding:8px !important; background:#14120f !important;
 border:1px solid #c2a25a !important; border-radius:6px !important; pointer-events:auto !important;
 max-height:calc(100dvh - 32px); overflow-y:auto; touch-action:pan-y; overscroll-behavior:contain;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals h3 { display:none !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li {
 white-space:normal !important; align-items:flex-start; line-break:strict; font-size:16px !important; line-height:1.4 !important;
 flex-wrap:nowrap; gap:6px !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li em { flex:none; white-space:nowrap; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li span { flex:1; min-width:0; }
/* 11/6 共通の係（目標の並び）：今の一つだけでなく今の5つを並べ、済んだ物に印（kaito 九1・十三1）。5つの外（li.out）だけ隠す */
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li.out { display:none !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li.now {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important; margin:0 !important; padding:4px !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:6px; }
#hud .pg-goals.goals-expanded ul { max-height:min(34dvh,150px); overflow-y:auto; touch-action:pan-y; overscroll-behavior:contain; }
#hud .goals-toggle { display:block; width:100%; min-height:44px; margin-top:8px; padding:6px 8px; border:1px solid #c2a25a; color:#fff3df; background:#242019; font:700 16px/1.4 sans-serif; cursor:pointer; }
#hud .goals-toggle:focus-visible { outline:3px solid #fff3ba; outline-offset:2px; }
html:root body #hud#hud#hud.battle-order:not(.photo):not(.ending) #armybar#armybar:not([hidden]) {
 display:grid !important; visibility:visible !important; opacity:1 !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog #armybar#armybar {
 position:static !important; inset:auto !important; transform:none !important; width:100% !important;
 max-width:100% !important; max-height:none !important; margin:0 0 8px; padding:0 !important;
 grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; gap:8px !important;
 background:none !important; border:0 !important; box-shadow:none !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog #armybar#armybar::before { content:none !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog #armybar#armybar .side.b { grid-column:2 !important; }
html:root body #hud#hud#hud.battle-order #armybar#armybar :is(.clock,canvas,.gauge) { display:none !important; }
/* 戸次川・信貴山・墨俣：人数だけでなく、両軍それぞれの残りを一本の棒で示す。 */
html:root body #hud#hud#hud.battle-order #h-prog#h-prog:is([data-battle="t06_hetsugi"],[data-battle="shigisan"],[data-battle="sunomata"]) #armybar#armybar .gauge.one {
 display:block !important; grid-column:1 / -1; width:100%;
}
html:root body #hud#hud#hud.battle-order #armybar#armybar .side { background:none !important; border:0 !important; min-width:0; }
html:root body #hud#hud#hud.battle-order #armybar#armybar .side .nm { display:flex !important; justify-content:center; gap:6px; padding:0 !important; font-size:16px !important; color:#fff3df; background:none !important; border:0 !important; }
html:root body #hud#hud#hud.battle-order #armybar#armybar .side .nm :is(.n,.army-side-label) { display:inline !important; color:#fff3df; font-variant-numeric:tabular-nums; }
html:root body:is(:has(#intro:not([hidden]) > .card),:has(#pause:not([hidden])),:has(#screen:not([hidden])),:has(#cine.on)) #hud#hud#hud.battle-order :is(#armybar#armybar,#h-prog#h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.battle-order:has(#bigmap:not([hidden])) #armybar#armybar { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > *) #hud#hud#hud :is(#goal-sign,.field-names,#markers,#mission-goal) { visibility:hidden !important; }
html:root body #hud#hud#hud.battle-order #crosshair:not(.aimtool) { visibility:hidden !important; }
html:root body #hud#hud.battle-order #h-prog#h-prog[hidden],
html:root body #hud#hud.battle-order.photo #h-prog#h-prog,
html:root body #hud#hud.battle-order:has(#bigmap:not([hidden])) #h-prog#h-prog { display:none !important; }
@media(max-height:500px) { html:root body #hud#hud.battle-order #h-prog#h-prog { top:calc(120px + env(safe-area-inset-top,0px)) !important; right:calc(8px + env(safe-area-inset-right,0px)) !important; } }
/* 桶狭間は地図の空き待ちをせず、任務一行を右上へ。印の説明や名前の札は増やさない。 */
html:root body #hud#hud.battle-order #h-prog#h-prog[data-battle="okehazama"] {
 top:calc(12px + env(safe-area-inset-top,0px)) !important;
 /* 押せる釦に見せず、任務の一行だけを重ねる。雨空でも字の輪郭を保つ。 */
 background:transparent !important; border:0 !important; box-shadow:none !important;
 text-shadow:0 2px 2px #14120f,1px 0 2px #14120f,-1px 0 2px #14120f,0 1px 3px #000;
 max-width:calc(100vw - 160px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)) !important;
}
html:root body #hud#hud.battle-order #h-prog#h-prog[data-battle="okehazama"] .pg-st > b { display:none !important; }
html:root body #hud#hud.battle-order #h-prog#h-prog[data-battle="okehazama"] .pg-st > span {
 white-space:nowrap !important;
 font-size:min(max(20px,calc(20px * var(--text-scale,1))),calc((100vw - 180px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)) / var(--mission-chars,24))) !important;
}
/* 一行任務は一覧と達成印を保ち、共通の携帯向け縮小で下知を小さく戻さない。 */
html:root body #hud#hud#hud.mission-one-line #h-prog#h-prog:not([data-battle="okehazama"]):not([data-battle="inou"]) .pg-st > span,
html:root body #hud#hud#hud.mission-one-line #h-prog#h-prog.goal-mode .pg-goals li.now {
 font-size:max(22px, calc(22px * var(--text-scale, 1))) !important; line-height:1.3 !important;
}

/* 目標・命・近くの一人（または行き先）の三枚。戦場の中央を空ける。 */
html:root body #hud#hud#hud.battle-order #h-prog#h-prog {
 top:calc(12px + env(safe-area-inset-top,0px)) !important;
 max-width:min(340px, 34vw) !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li {
 font-size:max(15px,calc(15px * var(--text-scale,1))) !important; line-height:1.35 !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li.now {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important;
 line-height:1.35 !important; margin:0 -4px !important; padding:2px 4px !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.battle-order :is(#jk-map,#fieldmap,#minimap,#maphint,#boss,#target,#h-units,#h-squad) { display:none !important; }
/* 両軍の数の棒は、武将の名札や目標の札が出ている間も消さない（kaito 物差し「両軍の数」・九3） */

` ;
      root.appendChild(st);
      this.prog = el;
    }
    const el = this.prog;
    if (el.dataset.battle !== def.key) el.dataset.battle = def.key || '';
    if (def.missionStyle === 'lesson') el.dataset.practice = String(rt.flags.step === 0 && rt.flags.training === 0);
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
      n = list.length; i = Math.max(0, Math.min(n - 1, of.call(def, rt) | 0)); title = list[i];
    } else {
      // 段の無い戦も、主の任務の切り替わりを覚える。札には番号を出さない。
      if (this.progRt !== rt) { this.progRt = rt; this.progSeen = []; this.progStage = undefined; }
      if (taskLine && this.progSeen[this.progSeen.length - 1] !== taskLine) this.progSeen.push(taskLine);
      i = Math.max(0, this.progSeen.length - 1); n = 0; title = this.progSeen[i] || '';
    }
    // 印は下で任務の内容と一緒に更新する。
    // 「左へ下がる」のような向きの字は出さない（kaito 10/23）。
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0), p = rt.player.u.pos;
    let headline = def.missionHeading?.(rt) || missionCaption(rt, def.missionTaskFirst ? task || title : title || task) || '組の旗へ進め';   // 既定の字に「味方」を出さない（五1・11/6 共通の係）
    // 任務の一行へ実際の攻撃操作を収める。別の札や知らせは増やさない。
    if (!def.missionSingleLine && !def.missionSignTarget && def.missionStyle !== 'ford' && /^(?:近くの|この)?敵を\s*(?:たおせ|倒せ)$/.test(headline)) {
      const player = rt.player;
      const enemy = (player.inRange && player.rangeCueTarget?.alive ? player.rangeCueTarget : null) ||
        this.approachGuideEnemy || this.attackGuideEnemy || this.aimGuideEnemy ||
        (rt.guideEnemyShown && rt.guideEnemy) || rt.missionGuide?.closeEnemy;
      if (enemy?.alive && enemy.team !== player.u.team && sightUnit(rt, enemy))
        headline = player.inRange ? `印の敵へ ${attackOperation(rt)}` : '印の敵へ近づこう';
    }
    // 相手の交代は既存の任務札で伝える。同じ知らせは八秒あける。
    const enemyLabel = def.missionEnemyLabel?.(rt) || '';
    const attacking = /(?:たおせ|倒せ)/.test(headline);
    const enemy = rt.army.missionMarkedEnemy || def.missionSignTarget?.(rt);
    if (this.nextEnemyRt !== rt) {
      this.nextEnemyRt = rt; this.nextEnemyLabel = ''; this.nextEnemyUnit = null;
      this.nextEnemyUntil = 0; this.nextEnemyAt = -Infinity;
    }
    if (attacking && (enemy || enemyLabel)) {
      const previous = this.nextEnemyUnit;
      const changed = this.nextEnemyLabel && enemyLabel !== this.nextEnemyLabel ||
        previous && enemy && previous !== enemy && (!previous.alive || previous.dying || previous.downed || previous.gone);
      if (changed && rt.t - this.nextEnemyAt >= 8) {
        this.nextEnemyAt = rt.t; this.nextEnemyUntil = rt.t + 3;
      }
      this.nextEnemyLabel = enemyLabel;
      if (enemy) this.nextEnemyUnit = enemy;
      // 森部の一般兵は誰を攻撃してもよい。一人ずつ指定された任務に見せない。
      if (!def.missionStyle && rt.t < this.nextEnemyUntil) headline = 'つぎの敵を たおせ';
    }
    // 桶狭間・森部は任務を保つ。行き先のピンと敵の▼を同じ「矢印」と呼ばない。
    if (attacking && !def.missionSingleLine && def.missionStyle !== 'raid' && def.missionStyle !== 'ford' && this.enemySignOffscreen && this.missionEnemyShown) headline = '矢印の先へ進め';
    // 攻撃の任務でも、本人が見えるまでは同じ一行で移動を案内する。
    else if (attacking && !def.missionSingleLine && pinGuideOn(rt) && def.missionStyle !== 'raid' && def.missionStyle !== 'ford' && def.missionStyle !== 'practice' &&
        (enemy || missionTarget(rt)) && !(this.missionEnemyShown && !this.enemySignOffscreen))
      headline = 'やじるしへすすめ';
    // 共通の会話相手を矢印で示し、実際に届く距離で文を切り替える。
    const talkGuide = rt.missionGuide;
    const talkPerson = talkGuide?.objective === currentObjective(rt) && talkGuide.marker?.guideTalk && talkGuide.marker.guidePerson?.();
    const talkSign = !!talkPerson?.alive;
    if (talkSign) {
      headline = 'この人と話す';
    }
    if (!battleOrder && stEl.firstChild._talkSign !== talkSign) {
      stEl.firstChild._talkSign = talkSign;
      stEl.firstChild.innerHTML = talkSign ? `<svg width="28" height="28" viewBox="0 0 80 68" aria-hidden="true">${TALK_SIGN}</svg>` : '';
    }
    stEl.firstChild.style.cssText = talkSign ? 'display:inline-block!important;vertical-align:middle;margin-right:4px' : 'display:none';
    // 戦の段階（stages.js・kaito 10/30）：右上は今の段階の目的の一行と「何段階目か」だけ
    const stg = def.missionSingleLine ? null : stageNow(rt);
    stEl.style.flexDirection = talkSign || stg ? 'row' : '';
    stEl.style.alignItems = talkSign || stg ? 'center' : '';
    if (stg) headline = stg.line;
    if (battleOrder) {
      // 「〇〇について行く」に差し替えず、戦の目標の一行を保つ（右上と▼の札に二つの指図を並べない。kaito 五1・11/5 共通の係・一宮と佐和山の頼み）
      headline = def.missionHeading?.(rt) || missionCaption(rt, task || title) || stg?.line || headline;
      // 戦の一行も画面の言葉（印・〇秒）を当時の言い方へ（11/6 長島の頼み・全戦）
      if (!def.teach) headline = periodWords(headline);
    }
    // 段の無い戦も、倒す数で進む任務は一行の後ろに「（12／30）」（kaito 11/2 O）
    else if (!talkSign && !def.missionSingleLine) {
      const kc = killNow(rt);
      if (kc) {
        // 「陣へ。先手を止めよ」のような任務は、数に合う後ろの文（倒す方）を一行にする
        const foeLine = headline === taskLine && task.replace(/^使番「|」$/g, '').split(/[。／]/).map((q) => q.trim()).find((q) => /止め|崩|討|退け|破|倒|払|返せ/.test(q));
        headline = (foeLine || headline) + `（${kc[0]}／${kc[1]}）`;
      }
    }
    // 段のある戦は一行の頭に番号（①②…・kaito 三3「目標に番号」）。戦の札（battleOrder）は「n／m」を隠すので、ここで付ける
    if ((def.missionSingleLine || battleOrder) && !talkSign && !/^[①-⑳]/.test(headline)) {
      const one = stageNow(rt);
      if (one) headline = ('①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'[one.i] || `${one.i + 1}`) + headline;
    }
    // 右上の「目標」の札（kaito 11/1 の手本・B 節）：段の目標を四角の印付きで並べ、済んだ物に ✓（hud_goals.js）
    //   戦の札（battleOrder）でも①から全部を並べる（九1・11/6 共通の係。前は goal-mode を外して今の一行だけだった）
    goalsTick(el, rt, stg, battleOrder);
    if (battleOrder) {
      const symbol = guideSymbol(rt, missionTarget(rt));
      if (stEl.firstChild._guideSymbol !== symbol) {
        stEl.firstChild._guideSymbol = symbol;
        stEl.firstChild.innerHTML = `<svg width="22" height="26" viewBox="0 0 80 80" aria-hidden="true"><path d="${symbol}" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/></svg>`;
      }
    }
    // 何段階目か：一行の頭に小さく「2／4」（札の中に収める。右上で一行だけの戦も同じ）
    let stEn = stEl.querySelector('.pg-stage');
    if (!stEn) { stEn = document.createElement('i'); stEn.className = 'pg-stage'; stEl.insertBefore(stEn, stEl.lastChild); }
    stEn.hidden = !stg || /^[①-⑳]/.test(headline);   // 頭に①が付く一行に「1／4」を重ねない（11/8 critic60 越前一向一揆）
    if (stg) { setText(stEn, `${stg.i + 1}／${stg.n}`); stEn.setAttribute('aria-label', `${stg.n}段のうち${stg.i + 1}段目`); }
    // 相手の名前から一続きの一行にする。赤い▼は敵の頭上だけに置く。
    // 折り返しは文節の切れ目（助詞・読点の後）だけにし、「進／み」のように語の途中で折らない（11/5 高遠・全戦）
    if (!stEl.lastChild._keepAll) { stEl.lastChild._keepAll = 1; stEl.lastChild.style.wordBreak = 'keep-all'; stEl.lastChild.style.overflowWrap = 'anywhere'; }
    setText(stEl.lastChild, headline.replace(/([をにへとでのはがも、・）])(?=[^をにへとでのはがも、・）​])/g, '$1​'));
    if (this.progFitHeadline !== headline) {
      this.progFitHeadline = headline;
      el.style.setProperty('--mission-chars', String(Math.max(1, headline.length + (stg ? 5 : 2))));
    }
    // 小さな地図の左端に帯の右端を合わせる（画面の大きさか字が変わった時だけ測る）
    const fitKey = innerWidth + 'x' + innerHeight + headline;
    if (this.progFitKey !== fitKey) {
      this.progFitKey = fitKey;
      const mm = document.getElementById('minimap'), mr = mm && mm.getBoundingClientRect();
      if (mr && mr.width > 0 && mr.left > innerWidth / 2) el.style.setProperty('--prog-right', `${Math.ceil(innerWidth - mr.left + 10)}px`);
      else el.style.removeProperty('--prog-right');
    }
    stEl.lastChild.classList.toggle('foe-task', def.missionStyle === 'raid' && headline.startsWith('▼'));
    // 戦固有の案内と任務の進みは残す。同じ任務の全文は重ねない。
    const status = def.missionStatus?.(rt, taskLine);
    const sub = def.missionSingleLine ? '' : def.missionDetail ? def.missionDetail(rt) :
      (typeof def.missionStatusFirst === 'function' ? def.missionStatusFirst(rt) : def.missionStatusFirst) ? status || '' :
        currentObjective(rt)?.progress || (status && status !== headline ? status : '');
    // 稲生は相手の名を任務一行に収め、二行目を重ねない。
    setText(nextEl, sub); nextEl.hidden = !(sub && (def.missionStyle === 'lesson' || sub.length <= (def.missionStatusMaxLength ?? 14)) && (def.missionStyle === 'lesson' || rt.teachOn?.() || !!def.missionDetail));
    // 歩数は行き先の横に札を増やさず、任務の同じ札で読む。
    const destination = missionTarget(rt), me = rt.player.u.pos;
    const enemyOutside = this.enemySignOffscreen && enemy;
    const approach = destination?.route && enemy;
    const point = approach ? destination : enemyOutside ? enemy.pos : destination;
    const steps = point && (approach || enemyOutside || !destination?.enemy && !destination?.unit && !destination?.fire)
      ? Math.ceil(Math.max(0, Math.hypot(point.x - me.x, point.z - me.z) - (approach ? .5 : enemyOutside ? 0 : destination.r ?? 6)) / .75) : 0;
    const routeSteps = steps > 0 && !def.missionSingleLine && (approach || enemyOutside || !this.missionEnemyShown && !def.hideGuideSteps);
    nextEl.classList.toggle('route-steps', routeSteps);
    if (routeSteps) { setText(nextEl, ''); nextEl.hidden = true; } // 歩数の字は出さない（行き先はピンで示す）
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
    if (stg) { setText(dotsEl, ''); dotsEl.hidden = true; } else if (n && def.missionStyle !== 'lesson' && !def.missionSingleLine) {
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
    // 待ち時間は行き先のピンにまとめる。任務の一行に別の進み棒を重ねない。
    const waitFill = -1;
    const combatProgress = def.missionCombatProgress?.(rt);
    const combatFill = Number.isFinite(combatProgress)
      ? Math.round(Math.max(0, Math.min(1, combatProgress)) * 100) : -1;
    if (el._waitFill !== waitFill || el._combatFill !== combatFill) {
      el._waitFill = waitFill; el._combatFill = combatFill;
      stEl.classList.toggle('moribe-wait', waitFill >= 0);
      stEl.classList.toggle('mission-combat', combatFill >= 0);
      stEl.style.setProperty('--wait-progress', String(Math.max(0, waitFill)));
      // 撃破の進みは同じ任務の下辺。待つ丸と使い分け、文字や札を増やさない。
      const fill = combatFill >= 0 ? combatFill : waitFill;
      stEl.style.backgroundImage = fill < 0 ? '' :
        `linear-gradient(to right, #edc65e ${fill}%, #393328 ${fill}%)`;
      stEl.style.backgroundSize = fill < 0 ? '' : '100% 6px';
      stEl.style.backgroundPosition = fill < 0 ? '' : 'left bottom';
      stEl.style.backgroundRepeat = fill < 0 ? '' : 'no-repeat';
    }
    // 桶狭間の null は「今は待ちではない」。接敵中に共通の時計を戻さない。
    const pie = timeEl.firstChild, waiting = def.missionStyle === 'raid' ? Number.isFinite(progress) :
      Number.isFinite(progress) || Number.isFinite(wu) && wu > rt.t && gm.waitDuration > 0;
    // 一行だけの戦は待ち時間も行き先のピンにまとめる。
    timeEl.hidden = def.missionStyle === 'lesson' || def.missionStyle === 'ford' || !!def.missionSingleLine;
    pie.hidden = !waiting;
    if (waiting) pie.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1 - (wu - rt.t) / gm.waitDuration)) * 100)));
    // 古い別札は使わず、今ある一行そのものの切り替わりを伝える。
    this.progStage = i;
    this.missionChange(rt, headline);
  }

  missionChange(rt, headline) {
    const el = this.prog, reduced = S.reduceMotion;
    const changed = this.progChangeRt !== rt || this.progChangeHeadline !== headline;
    if (reduced || rt.over || rt.t >= (this.progChangeUntil || 0)) el.classList.remove('pg-changing');
    if (!changed && !rt.over) return;
    if (this.progChangeRt !== rt) this.progChangeTimes = new Map();
    this.progChangeRt = rt; this.progChangeHeadline = headline;
    this.progChangeUntil = 0;
    el.classList.remove('pg-changing');
    if (rt.over || !headline || reduced) return;
    // 同じ知らせの強調は八秒あけ、札は右上から動かさない。
    const last = this.progChangeTimes.get(headline) ?? -Infinity;
    if (rt.t - last < 8) return;
    this.progChangeTimes.set(headline, rt.t);
    this.progChangeUntil = rt.t + .8;
    el.classList.add('pg-changing');
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
