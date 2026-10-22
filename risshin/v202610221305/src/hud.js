import { $, stackBottomLeft, fudeImage } from "./hud_common.js";
import { HudNotices } from "./hud_battle_notices.js";
import * as THREE from "three";
import { simpleControls } from "./simple_controls.js";

// 戦の画面の入口。部品は起動時に一度だけ同じ原型へ取り付ける。
export { TAG_COL, tagOf, groupGeneral, groupKind, moraleWord } from './hud_common.js';

export class Hud {
  constructor() {
    this.root = $('hud');
    stackBottomLeft();
    this.subQ = [];
    this.subT = 0;
    this.log = [];
    this.orderLog = [];
    this.introRead = false;
    try { this.introRead = localStorage.getItem('risshin-intro-read') === '1'; } catch (e) { /* 覚えられなくても、その場では一度だけ */ }
    this.objKey = '';
    this.curObjKey = null;
    this.markerEls = new Map();
    this.threatEls = [];
    this.threatRects = [];
    this.mmT = 0;
    this.hurtT = 0;
    this.bigmap = false;
    this.bannerQ = [];
    this.bannerT = 0;
    this.lastToast = null;
    this.notices = new HudNotices(this);
    this.logEntry = document.createElement('button');
    this.logEntry.id = 'battle-log-entry';
    this.logEntry.type = 'button'; this.logEntry.className = 'btn small'; this.logEntry.hidden = true;
    this.logEntry.style.cssText = 'position:relative;inset:auto;transform:none;min-height:44px;pointer-events:auto;width:100%;box-sizing:border-box;background:#14120f;color:#ece4d2;border-color:#c2a25a';
    this.logEntry.onclick = (e) => { e.stopPropagation(); this.toggleLog(true); };
    this.logEntry.addEventListener('keydown', (e) => e.stopPropagation());
    $('objectives').appendChild(this.logEntry);
    // 未読の下知は任務の札の中で読む。
    this.notices.sync();
    this.keyboardInput = false;
    window.addEventListener('keydown', () => { this.keyboardInput = true; }, true);
    window.addEventListener('pointerdown', () => { this.keyboardInput = false; }, true);
    this.tmpV = new THREE.Vector3();
    this.slowT = 0;
    // 筆の線の形を CSS へ（index.html の「墨の HUD」が使う）
    try { this.root.style.setProperty('--fude', `url(${fudeImage()})`); } catch (e) { /* 描けない時はただの細い線 */ }
    // 戸口の札は指でも押せる。移動や斬る操作へ押した事を流さない。
    const entrance = $('prompt');
    entrance.addEventListener('click', (event) => {
      const button = event.target.closest('[data-talk]');
      if (!button) return;
      const rt = this.rt, it = rt?.nearestInteract();
      event.stopPropagation();
      if (rt && !rt.over && !rt.game.paused && rt.player.u.alive && !rt.choice && it && it.id === button.dataset.talkId && !it.hold && /話す|話を聞く/.test(it.label)) rt.interact();
    });
    entrance.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-talk]')) e.stopPropagation(); });
    entrance.addEventListener('keydown', (e) => { if (e.target.closest('[data-talk]')) e.stopPropagation(); });
    // 作業の札そのものを長押しできる。進み具合の更新でボタンを作り直さない。
    this.workHoldId = null;
    const releaseWork = () => { this.workHoldId = null; };
    const startWork = (button) => {
      const rt = this.rt;
      const it = button.dataset.work === 'bandage' ? rt?.interacts.find(item => item.id === 'bandage') : rt?.nearestInteract();
      if (!rt || rt.over || rt.game.paused || !rt.player.u.alive || this.root.hidden || entrance.hidden ||
        !it?.hold || it.id !== button.dataset.work || !this.root.offsetParent) return;
      this.workHoldId = it.id;
    };
    entrance.addEventListener('pointerdown', (e) => {
      const button = e.target.closest('button[data-work]');
      if (!button || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      startWork(button);
      entrance.setPointerCapture(e.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) entrance.addEventListener(type, releaseWork);
    window.addEventListener('blur', releaseWork);
    document.addEventListener('visibilitychange', releaseWork);
    entrance.addEventListener('keydown', (e) => {
      const button = e.target.closest('button[data-work]');
      if (!button) return;
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) startWork(button); }
    });
    entrance.addEventListener('keyup', (e) => {
      if (!e.target.closest('button[data-work]')) return;
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); releaseWork(); }
    });
    entrance.addEventListener('focusout', releaseWork);
    entrance.addEventListener('click', (e) => {
      if (e.target.closest('button[data-work]')) { e.preventDefault(); e.stopPropagation(); }
    });
    entrance.addEventListener('pointerdown', (e) => { if (e.target.closest('button[data-entry]')) e.stopPropagation(); });
    entrance.addEventListener('keydown', (e) => {
      const b = e.target.closest('button[data-entry]');
      if (!b) return;
      if (e.key === 'Tab') e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
    });
    entrance.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-entry]'), rt = this.rt;
      if (!b || !rt || rt.over || !rt.player.u.alive || this.root.hidden) return;
      e.stopPropagation();
      const it = rt.nearestInteract();
      if (it && it.id === b.dataset.entry) { rt.interact(); entrance.hidden = true; }
    });
    // 任務の札：低い画面で「ほか n 件」を押すと、全部の任務を 6 秒だけ開く
    const ob = $('objectives');
    if (ob) {
      ob.tabIndex = -1; ob.setAttribute('role', 'group'); ob.setAttribute('aria-label', '今の任務。押すとほかの任務を開く');
      const list = $('obj-list');
      list.tabIndex = 0; list.setAttribute('role', 'button'); list.setAttribute('aria-expanded', 'false'); list.setAttribute('aria-label', '任務の一覧を開く');
      ob.addEventListener('click', () => { ob.classList.toggle('expand'); list.setAttribute('aria-expanded', String(ob.classList.contains('expand'))); list.setAttribute('aria-label', ob.classList.contains('expand') ? '任務の一覧を閉じる' : '任務の一覧を開く'); this.notices.sync(); clearTimeout(this.objExpT); });
      ob.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) ob.click(); } });
    }
    // 部隊の帯：札を押すと、その隊を号令先に選ぶ（もう一度押すと全隊）
    const hu = $('h-units');
    if (hu) hu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sel]');
      if (b) this.pickGroup(b.dataset.sel);
      const ally = e.target.closest('button[data-ally]');
      if (ally) { this.allyReport = ally.getAttribute('aria-label'); this.toggleLog(true); }
      // 携帯：［ほか］で控えの武将の札を 6 秒だけ開く
      if (e.target.closest('button[data-allies]')) { this.alliesOpen = !this.alliesOpen; clearTimeout(this.alliesT); this.unitsKey = ''; if (this.rt) this.updateUnits(this.rt); }
    });
    // 携帯：組の一行を押すと、陣形と隊ごとの号令を選ぶ札を開く
    const hs = $('h-squad');
    if (hs) {
      hs.tabIndex = 0; hs.setAttribute('role', 'button'); hs.setAttribute('aria-label', '組の陣形を選ぶ'); hs.setAttribute('aria-expanded', 'false'); hs.setAttribute('aria-controls', 'cmdpanel');
      hs.addEventListener('click', () => {
        const p = this.rt && this.rt.player;
        if (!p || simpleControls(this.rt) || !this.rt.squadGroups.length) return;
        p.cmdOpen = !p.cmdOpen; p.cmdOpenT = 0; p.radial = false;
      });
      hs.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) hs.click(); } });
    }
    // Alt＋数字（号令の輪を開いている間は数字だけ）でも選ぶ。武器の持ち替え（1・2）より先に受け取る
    window.addEventListener('keydown', (e) => {
      const rt = this.rt;
      if (!rt || !rt.squadGroups || this.root.hidden || !rt.player || e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) return;
      const m = /^Digit([0-9])$/.exec(e.code);
      if (!m || !(e.altKey || rt.player.radial)) return;
      const kinds = this.unitKinds || [];
      if (kinds.length < 2) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      const n = +m[1];
      if (n === 0) this.pickGroup('all');
      else if (kinds[n - 1]) this.pickGroup(kinds[n - 1]);
    }, true);
  }
}

import { HudUnits } from './hud_units.js';
import { HudOpening } from './hud_opening.js';
import { HudSpeech } from './hud_speech.js';
import { HudFeedback } from './hud_feedback.js';
import { HudCards } from './hud_cards.js';
import { HudUpdate } from './hud_update.js';
import { HudArmy } from './hud_army.js';
import { HudNavigation } from './hud_navigation.js';
import { HudDestination } from './hud_destination.js';
import { HudGestures } from './hud_gestures.js';
import { HudTravel } from './hud_travel.js';
import { HudRoute } from './hud_route.js';
import { HudGoal } from './hud_goal.js';
import { HudTeamSigns } from './hud_team_signs.js';
import { HudFlags } from './hud_flags.js';
import { HudDefense } from './hud_defense.js';
import { HudEnemy } from './hud_enemy.js';
import { HudWork } from './hud_work.js';
import { HudGround } from './hud_ground.js';
import { HudOverlay } from './hud_overlay.js';
import { HudMapControls } from './hud_map_controls.js';
import { HudMarkers } from './hud_markers.js';
import { HudDodge } from './hud_dodge.js';
import { HudThreats } from './hud_threats.js';
import { HudMap } from './hud_map.js';
import { HudSonae } from './hud_sonae.js';

for (const part of [HudUnits, HudOpening, HudSpeech, HudFeedback, HudCards, HudUpdate, HudArmy, HudNavigation, HudDestination, HudGestures, HudTravel, HudRoute, HudGoal, HudTeamSigns, HudFlags, HudDefense, HudEnemy, HudWork, HudGround, HudOverlay, HudMapControls, HudMarkers, HudDodge, HudThreats, HudMap, HudSonae]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name !== 'constructor') Object.defineProperty(Hud.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}
