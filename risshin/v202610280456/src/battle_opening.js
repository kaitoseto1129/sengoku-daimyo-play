import { pinGuideOn } from "./mission_pin.js";
import { BATTLES } from './state.js';
import { VIEW } from './viewport.js';
import { currentObjective, taskText } from './mission_guide.js';
import { isTouch, touchMoveLearned, touchInput } from './touch.js';
import { S } from './settings.js';

// 勝敗の処理には触れず、出陣前に読む一行だけを持つ。
const GOALS = {
  inou: '林の兵を追い、林美作守（はやしみまさかのかみ）をたおす',
  okehazama: '敵の大将・今川義元（いまがわ よしもと）の護衛を仲間と倒す。義元の討取りは味方の毛利新介に任せ、黄色い矢印の旗へ戻る',
  moribe: '仲間と敵の大将二人を倒す。次に出る印へ戻り、そこへ来る敵を倒して川への道を守る',
  sunomata: '三度の寄せから柵を守り抜く',
  inabayama: '火の合図を出し、味方と城へ進む',
  mitsukuri: '木戸を破る味方を守り、本丸を取る',
  okawachi: '退路を守って退き、城の囲みを保つ',
  kanegasaki: '追う敵を止め、命令に従って退く',
  anegawa: '持ち場で敵を受け止め、押し返す',
  nodafukushima: '竹束で攻めを支え、下知に従って味方と退く',
  shiga: '町口を守り、合図で城へ退き、木戸を守り抜く',
  hieizan: '組と山道を登り、道の守りを退ける',
  mikatagahara: '退く命令に従い、浜松城へ戻る',
  tonezaka: '敵の守りを崩し、街道を押さえる',
  odani: '京極丸を守り、小丸の守りを崩す',
  nagashima: '岸と水路を守り、囲みを保つ',
  shitaragahara: '柵を守り、合図で敵を退ける',
  echizen: '味方と二つの木戸を開き、木の芽峠城の奥を守る',
  echizen_ikko: '味方と門を破り、本堂を押さえる',
  iwamura: '夜討ちを防ぎ、城の麓で味方と合流する',
  tennoji: '砦を守り、救援と共に囲みを破る',
  saika: '杭を外して川を渡り、退く合図で戻って東岸を守る',
  tedorigawa: '味方の渡河を守り、南の岸へ退く',
  shigisan: '門を破る味方を守り、天守へ進む',
  kizugawa: '船を守り、合図で大筒を放つ',
  miki: '荷を止め、木戸を守り、合図で大村へ退く',
  arioka: '辻を押さえ、木戸へ戻って守る',
  iga: '夜討ちを防ぎ、最後に空いた城を確かめる',
  tottori: '舟二艘を焼き、柵を守り、使いを木戸へ送る',
  takato: '門を破る味方を守り、本丸を取る',
  tano: '味方と谷道の敵を退け、屋敷の口を押さえる',
  honnoji: '上様を守り、退く命令が出たら逃れる',
};

export function openingGoal(rt) {
  if (rt.def.mapCastle) return rt.def.mapInfo?.defend ? '本丸の門を守り抜く' : '本丸の門を破る';
  const id = rt.def.key || BATTLES[rt.index]?.id;
  if (rt.G.lord && id === 'honnoji') return '門と御殿を守り、奥まで戦い抜く';
  if (rt.G.lord && id === 'kanegasaki') return '味方と共に京へ退く';
  return GOALS[id] || '味方と命令を果たし、生きて戻る';
}

// 最初の行動を一枚で示す。位置と札は使い回す。
export class BattleOpening {
  constructor(hud, rt) {
    this.hud = hud;
    this.rt = rt;
    this.left = 6;
    this.scan = 0;
    this.el = document.createElement('div');
    this.el.id = 'battle-opening';
    this.el.hidden = true;
    this.el.innerHTML = '<span><i aria-hidden="true">↑</i><svg class="opening-swipe" viewBox="-16 -8 80 124" aria-hidden="true" hidden><circle cx="24" cy="10" r="14" fill="#14120f" stroke="#fff3ba" stroke-width="4"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#14120f" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#fff3ba" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path class="opening-finger" d="M18 91V76Q18 68 24 68Q30 68 30 76V88L35 85Q39 83 43 87L50 94L46 110H20L7 97Q3 90 9 89Q13 88 18 94Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg><b></b></span>';
    this.label = this.el.firstElementChild;
    this.text = this.label.lastElementChild;
    this.swipe = this.label.querySelector('.opening-swipe');
    this.el.appendChild(this.swipe);
    this.moveArea = document.createElement('div');
    this.moveArea.className = 'opening-move-area';
    this.moveArea.hidden = true;
    this.el.prepend(this.moveArea);
    this.route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.route.classList.add('opening-route');
    this.route.setAttribute('aria-hidden', 'true');
    this.route.innerHTML = '<path fill="none" stroke="#14120f" stroke-width="9"/><path fill="none" stroke="#fff3ba" stroke-width="4"/><circle r="18" fill="none" stroke="#14120f" stroke-width="9"/><circle r="18" fill="none" stroke="#fff3ba" stroke-width="4"/><g class="opening-start"><circle r="10" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path d="M-4 20V6Q-4 0 0 0Q4 0 4 6V18L9 15L20 24L16 38H-3L-15 26Q-19 20-14 18Q-10 16-4 23Z" fill="#fff3ba" stroke="#14120f" stroke-width="2" stroke-linejoin="round"/></g>';
    this.route.toggleAttribute('hidden', true);
    this.el.prepend(this.route);
    this.personArrow = document.createElement('i');
    this.personArrow.className = 'opening-person';
    this.personArrow.hidden = true;
    this.personArrow.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.personArrow);
    hud.root.appendChild(this.el);
    if (!document.getElementById('battle-opening-css')) {
      const css = document.createElement('style');
      css.id = 'battle-opening-css';
      css.textContent = `
#hud #battle-opening { position:absolute; inset:0; pointer-events:none; z-index:12; }
#hud #battle-opening[hidden], #hud #battle-opening [hidden] { display:none; }
/* 出陣直後は短い一枚と操作面の指の見本だけで教える。 */
#hud #battle-opening span { position:absolute; display:flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(20,18,15,.9); color:#fff3d0; border:0; border-left:2px solid #f3d98a; font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4; max-width:min(272px, 36vw); box-shadow:none; box-sizing:border-box; transform:translate(-50%,-50%); }
#hud #battle-opening b { font-size:max(20px, calc(20px * var(--text-scale, 1))); font-weight:700; overflow-wrap:anywhere; white-space:pre-line; }
/* 指と説明は、実際になぞる棒のそばへ一緒に置く。 */
#hud #battle-opening.opening-controls span { transform:translate(-50%,-50%); gap:4px; border:0; border-radius:6px; padding:6px 10px; background:#14120f; color:#fff; max-width:none; }
#hud #battle-opening .opening-move-area { position:absolute; box-sizing:border-box; width:152px; height:128px; border:2px dashed #fff3ba; border-radius:16px; background:rgba(20,18,15,.16); box-shadow:0 0 0 2px #14120f; }
#hud #battle-opening.opening-controls b { font-size:max(20px,calc(20px * var(--text-scale,1))); white-space:pre-line; overflow-wrap:normal; flex:none; }
#hud #battle-opening.opening-controls span { width:max-content; max-width:calc(100vw / 3 - 24px); min-height:44px; }
#hud #battle-opening.opening-controls.has-flag b::before { content:none; }
#hud #battle-opening.opening-controls .opening-route > circle { display:none; }
#hud #battle-opening.opening-controls .opening-swipe { display:none; }
/* 触る始点の丸と短い矢印を、説明と一組にする。 */
#hud #battle-opening.opening-controls .opening-start > path { display:block; animation:opening-finger-slide 8s ease-in-out infinite; }
#hud #battle-opening.opening-compact.opening-controls span { background:rgba(20,18,15,.65); padding:4px 6px; border-radius:3px; }
#hud #battle-opening.opening-compact.opening-controls b { font-size:max(20px,calc(20px * var(--text-scale,1))); }
#hud #battle-opening.opening-compact .opening-route > path:first-child { stroke-width:6; }
#hud #battle-opening.opening-compact .opening-route > path:nth-child(2) { stroke-width:2.5; }
#hud #battle-opening i { display:inline-block; flex:none; font-style:normal; font-size:24px; line-height:1; }
#hud #battle-opening .opening-person { position:absolute; transform:translate(-50%,-100%); line-height:1; color:#fff3ba; text-shadow:0 2px 3px #14120f; }
#hud #battle-opening .opening-swipe { position:absolute; width:80px; height:116px; transform:translate(-40px,-76px); filter:drop-shadow(0 1px 2px #14120f); }
#hud #battle-opening .opening-swipe circle { display:block; }
/* 始点の指と目的の丸を一本の道で結ぶ。古い短い矢印は重ねない。 */
#hud #battle-opening.opening-controls .opening-swipe > path:not(.opening-finger) { display:none; }
#hud #battle-opening.opening-controls .opening-finger { animation:none; }
#hud #battle-opening.opening-controls .opening-swipe circle { display:none; }
#hud #battle-opening.opening-foot .opening-swipe { transform:translate(-19px,-61px); }
#hud #battle-opening.opening-foot .opening-swipe > path:not(.opening-finger) { display:none; }
#hud #battle-opening .opening-route { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
#hud #battle-opening .opening-finger { animation:opening-finger-slide 2.4s ease-in-out infinite; }
#hud #battle-opening .opening-swipe > path:not(.opening-finger) { animation:none; }
@keyframes opening-arrow-slide { 0%,20%,100% { transform:translateY(0); } 65%,85% { transform:translateY(-8px); } }
@keyframes opening-finger-slide { 0%,4%,23%,100% { transform:translateY(0); } 15%,18% { transform:translateY(-56px); } }
body.rm #hud #battle-opening .opening-finger, body.rm #hud #battle-opening .opening-start > path { animation:none; }
@media (prefers-reduced-motion:reduce) { #hud #battle-opening .opening-finger, #hud #battle-opening .opening-start > path { animation:none; } }
body.rm #hud #battle-opening .opening-swipe > path { animation:none; }
@media (prefers-reduced-motion:reduce) { #hud #battle-opening .opening-swipe > path { animation:none; } }
#hud #battle-opening .opening-person svg { display:block; width:56px; height:64px; }
#hud.opening :is(#markers,#boss,#target,#sonae-cards,.bl,#h-squad) { visibility:hidden !important; }
/* 開戦案内の間は命と組の札を閉じ、重なりと見えない操作先を残さない。 */
#hud.opening :is(.bl,#h-squad) { display:none !important; }
#hud.opening #battle-log-entry { display:none !important; }
body:has(#hud.opening #battle-opening.opening-linked) #tc .stick { visibility:hidden; }
#hud #tutorial.first-controls .how { display:block !important; }
#hud #tutorial.first-controls kbd { outline:2px solid #f3d98a; box-shadow:0 0 12px #c2a25a; }
`;
      document.head.appendChild(css);
    }
  }
  update(dt) {
    const rt = this.rt;
    const input = isTouch && touchInput();
    // 実際に歩くか戦う操作ができたら、最初の案内は戻さない。
    if (isTouch && (touchMoveLearned(rt) || input && (input.mouseL || input.mouseR))) this.left = 0;
    if (rt.over || rt.choice || !rt.player.u.alive) this.left = 0;
    // ピン一本の案内では、始まりの「ここまで進む」の札と矢印を出さない（kaito 10/23 稲生 3）。
    if (pinGuideOn(rt)) this.left = 0;
    // 戸口をたどる時は、最初から行き先の札と実際の開口を見せる。
    // なぞり方は共通の操作案内に任せ、出口の印を隠さない。
    const routeMarker = rt.missionGuide?.marker;
    if (rt.def.routeDestinationSight && rt.def.routeGuidePriority?.(rt) &&
        routeMarker?.id === 'next' && !routeMarker.waitGuide && routeMarker.guideArea !== 'wait') this.left = 0;
    const active = this.left > 0 && !this.hud.introWaiting && !rt.over && !rt.choice && rt.player.u.alive;
    this.hud.openingActive = active;
    this.hud.root.classList.toggle('opening', active);
    this.el.hidden = !active;
    if (!active) return;
    // 戦が時間で案内を閉じる指定なら、操作の記録がなくても任務へ渡す。
    // 出陣札を読んでいる間は上で戻るので、六秒の案内時間を減らさない。
    if (!isTouch || touchMoveLearned(rt) || rt.def.timedOpening) this.left -= dt;
    // 見回す側に丸が寄っても、示した丸からは必ず歩く操作を受ける。
    if (isTouch && this.el.classList.contains('opening-controls') && this.swipeX != null) {
      const origin = this.hud.navigationTouchOrigin || (this.hud.navigationTouchOrigin = {});
      origin.rt = rt; origin.at = rt.t; origin.x = this.swipeX; origin.y = this.swipeY;
      origin.look = false; origin.radius = 32;
      origin.left = this.swipeX - 76; origin.right = this.swipeX + 76;
      origin.top = this.swipeY - 80; origin.bottom = this.swipeY + 48;
    }
    this.scan -= dt;
    if (this.scan > 0) return;
    this.scan = 0.1;
    const W = VIEW.w, H = VIEW.h;
    const guide = rt.missionGuide;
    const preferred = rt.def.guideMarker?.(rt);
    const marker = guide?.objective === currentObjective(rt) && guide.marker ||
      rt.markers.find((m) => m.id === preferred && !m.red && !m.intelHidden);
    // 会話は共通の頭上の名と吹き出しに任せ、始まりの矢印を重ねない。
    if (marker?.guideTalk) {
      this.left = 0; this.hud.openingActive = false;
      this.hud.root.classList.remove('opening'); this.el.hidden = true;
      return;
    }
    const person = marker?.guidePerson?.();
    const p = person?.alive ? person.pos : marker && (typeof marker.pos === 'function' ? marker.pos() : marker.pos);
    const interact = person?.alive && marker.guideTalk && rt.nearestInteract();
    const interactPos = interact && (typeof interact.pos === 'function' ? interact.pos() : interact.pos);
    if (interact && !interact.hold && /話す|話を聞く/.test(interact.label) && interactPos &&
        Math.hypot(interactPos.x - p.x, interactPos.z - p.z) < 1) {
      this.left = 0; this.hud.openingActive = false;
      this.hud.root.classList.remove('opening'); this.el.hidden = true;
      return;
    }
    const objective = currentObjective(rt);
    const guardPlace = marker?.guideArea === 'guard';
    const atGuardPlace = guardPlace && p && Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) < (marker.guideRadius || 8);
    const waitFlag = marker?.guideArea === 'wait' && marker.guideFlag;
    const atWaitFlag = waitFlag && p && Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) < (marker.guideRadius || 8);
    // 持ち場に着いたら始まりの案内を閉じ、実際に長押しできる構えの釦へ渡す。
    if ((atGuardPlace || atWaitFlag) && isTouch) {
      this.left = 0; this.hud.openingActive = false;
      this.hud.root.classList.remove('opening'); this.el.hidden = true;
      return;
    }
    const guardInstruction = (rt.def.keepWaitOrderLabel && rt.def.waitOrderLabel?.(rt, atGuardPlace)) ||
      (atGuardPlace ? rt.player.guard ? 'そのまま ふせごう' :
      S.guardToggle ? '右押しで かまえよう' : '右押しを 長くおそう' : '輪に入ろう');
    const guardShown = rt.plainOps ? rt.plainOps(guardInstruction) : guardInstruction;
    this.text.textContent = marker?.guideTalk ? 'この人に近づく' : guardPlace ? guardShown : taskText(rt, objective?.text || openingGoal(rt));
    if (waitFlag && !atWaitFlag) this.text.textContent = rt.def.openingLinkedLabel || 'あの旗へ';
    const arrow = this.label.firstElementChild;
    arrow.hidden = !p;
    this.personArrow.hidden = true;
    this.personArrow.style.fontSize = '';
    this.talkPerson = null;
    this.talkLabel = null;
    this.flagGround = null;
    this.linkStart = null;
    this.flagLabel = null;
    this.flagBounds = null;
    this.flagOffscreen = false;
    // 最初の移動は、操作する側と指を動かす向きを一緒に示す。
    const swipeHelp = isTouch && !marker?.guideTalk && !rt.def.openingWait?.(rt);
    const firstMove = swipeHelp && !touchMoveLearned(rt);
    const linkedMove = !firstMove && swipeHelp && p && (waitFlag && !atWaitFlag || guardPlace && !atGuardPlace);
    this.el.classList.remove('opening-foot');
    this.el.classList.toggle('opening-compact', !!rt.def.compactFloorGuides);
    this.el.classList.toggle('opening-controls', !linkedMove && swipeHelp && (firstMove || !rt.def.keepOpeningTaskLabel));
    this.moveArea.hidden = true;
    // 絵の hidden 属性は直接切り替える。通常の要素と違い、代入だけでは属性が残る。
    this.swipe.toggleAttribute('hidden', !!linkedMove || !swipeHelp || !firstMove && !!rt.def.keepOpeningTaskLabel);
    this.route.toggleAttribute('hidden', true);
    this.el.classList.remove('opening-linked');

    let x = W / 2, y = 90, screenTarget = null;
    if (p) {
      const groundGoal = marker?.guideArea === 'guard';
      const s = this.hud.project(p, (p.y ?? rt.world.heightAt(p.x, p.z)) + (groundGoal ? .18 : person?.alive ? 3.6 : 2.5), rt);
      // 開幕も通常の会話案内と同じ頭の見通しを使う。足元が隠れても顔の印を落とさない。
      const personVisible = person?.alive && (!marker.guideVisibleOnly || this.hud.talkPersonVisible(rt, person));
      const frame = personVisible && this.hud.measurePersonFrame(person, rt, !!marker.guideTalk);
      if (frame) { s.x = frame.cx; s.y = frame.headY - 8; }
      const off = s.behind || s.x < W * .18 || s.x > W * .82 || s.y < 80 || s.y > H - (groundGoal ? 64 : 140);
      if (!off) screenTarget = s;
      x = off ? W / 2 : Math.max(W * .18, Math.min(W * .82, s.x));
      y = off ? 90 : Math.max(80, Math.min(H - (groundGoal ? 80 : 140), s.y - 30));
      if (personVisible && !s.behind && s.x > 24 && s.x < W - 24 && s.y > 48 && s.y < H - 24) {
        this.personArrow.hidden = !!marker.guideTalk;
        if (marker.guideTalk) this.talkPerson = person;
        if (!marker.guideTalk && this.personArrow.textContent !== '◇') this.personArrow.textContent = '◇';
        this.personArrow.style.left = s.x + 'px';
        this.personArrow.style.top = s.y + 'px';
        arrow.hidden = true;
        x = Math.max(100, Math.min(W - 100, s.x)); y = Math.max(32, (marker.guideTalk && frame ? Math.min(frame.top, frame.bottom - 64) - 52 : s.y - 84));
      }
      const dx = p.x - rt.player.u.pos.x, dz = p.z - rt.player.u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const angle = off ? Math.atan2(right, forward) : Math.atan2(s.x - x, y - s.y);
      arrow.style.transform = `rotate(${angle}rad)`;
      if (marker.hideNear && Math.hypot(dx, dz) < marker.hideNear) arrow.hidden = true;
      // 行き先は地面の旗と輪の一組。実物を縦に囲む印は重ねない。
      if (!marker.guidePerson && (groundGoal || marker.guideFlag || !marker.red && !marker.person && /旗/.test(typeof marker.label === 'function' ? marker.label() : marker.label))) {
        const ground = this.hud.project(p, (p.y ?? rt.world.heightAt(p.x, p.z)) + .08, rt);
        // 足元が画面端でも、見えている実旗の布を先に囲む。
        const bounds = groundGoal ? null : this.hud.goalFlagBounds(rt, marker, p);
        const flagVisible = bounds && bounds.left >= 12 && bounds.top >= 12 &&
          bounds.left + bounds.width <= W - 12 && bounds.top + bounds.height <= H - 24;
        if (flagVisible || !ground.behind && ground.x >= 32 && ground.x <= W - 48 && ground.y >= 100 && ground.y <= H - 24) {
          this.flagGround = p;
          this.flagX = Math.max(40, Math.min(W - 40, ground.x));
          this.flagY = Math.max(84, Math.min(H - 76, ground.y - 40));
          this.flagBounds = flagVisible ? bounds : null;
          if (!rt.def.keepOpeningTaskLabel) this.text.textContent = this.hud.destinationPurpose(rt);
          arrow.hidden = true;
        } else {
          // 画面外でも同じ旗を端に置き、下向き矢印だけにしない。
          this.flagGround = p;
          this.flagOffscreen = true;
          this.flagX = right >= 0 ? W - 64 : 64;
          this.flagY = Math.max(154, Math.min(H - 64, H / 2));
          this.flagAngle = Math.atan2(-forward, right);
          arrow.hidden = true;
        }
      }
    }
    // 指の動きは絵で示す。戦固有の大切な下知は消さない。
    if (swipeHelp && !linkedMove && (firstMove || !rt.def.keepOpeningTaskLabel)) {
      // 自分の足元を始点にし、目前の旗を操作する絵に見せない。
      arrow.hidden = true;
      arrow.textContent = '↑';
      arrow.style.transform = '';
      this.text.textContent = '上にすべらせて進む';
      // 左右どちらに足元があっても、示した輪から歩行入力を受ける。
      const start = this.hud.playerControlOrigin(rt, false, false);
      // 操作側の中央寄りに、指と一枚の説明が収まる場所を取る。
      const fingerX = W * (S.touchSwap ? .75 : .25);
      const fingerY = Math.max(168, Math.min(H - 100, start.y));
      this.swipeX = fingerX; this.swipeY = fingerY;
      const origin = this.hud.navigationTouchOrigin || (this.hud.navigationTouchOrigin = {});
      origin.rt = rt; origin.at = rt.t; origin.x = fingerX; origin.y = fingerY;
      origin.look = false; origin.radius = 32;
      origin.left = fingerX - 76; origin.right = fingerX + 76;
      origin.top = fingerY - 80; origin.bottom = fingerY + 48;
      this.moveArea.style.left = origin.left + 'px';
      this.moveArea.style.top = origin.top + 'px';
      this.moveArea.hidden = false;
      // 戦の途中と同じく、指は操作面から真上へ動かす。旗へ曲げない。
      this.swipe.toggleAttribute('hidden', true);
      this.linkStart = null;
      const radius = 26, endY = fingerY - 64;
      const path = `M${fingerX} ${fingerY}V${endY}M${fingerX - 7} ${endY + 12}L${fingerX} ${endY}L${fingerX + 7} ${endY + 12}`;
      for (let i = 0; i < 2; i++) this.route.children[i].setAttribute('d', path);
      const startMark = this.route.lastElementChild;
      startMark.firstElementChild.setAttribute('r', String(radius));
      startMark.setAttribute('transform', `translate(${fingerX} ${fingerY})`);
      this.route.toggleAttribute('hidden', false);
      this.swipe.style.setProperty('--swipe-angle', '0rad');
      this.swipe.style.left = fingerX + 'px';
      this.swipe.style.top = fingerY + 'px';
      this.personArrow.hidden = true;
      // 真上へ動かす指と説明を操作面の一組にする。
      this.el.classList.toggle('has-flag', !!this.flagGround);
      const half = this.label.offsetWidth / 2;
      const halfHeight = this.label.offsetHeight / 2;
      // 指のすぐ下に説明を置き、なぞる矢印を空ける。
      x = Math.max(half + 12, Math.min(W - half - 12, fingerX));
      y = Math.min(H - halfHeight - 12, fingerY + 48 + halfHeight);
    }
    this.el.classList.toggle('has-flag', !!this.flagGround);
    if (linkedMove) this.text.textContent = rt.def.openingLinkedLabel || 'あの旗へ';
    // 旗への説明は実物か画面端の印の脇へまとめる。
    if (this.flagGround && !this.el.classList.contains('opening-controls')) {
      // 輪は着地点から動かさず、札だけ近くの空きへ置く。
      const ground = this.hud.project(this.flagGround,
        rt.world.heightAt(this.flagGround.x, this.flagGround.z) + .08, rt,
        this.groundLabelProjection || (this.groundLabelProjection = {}));
      const groundVisible = !ground.behind && ground.x >= 32 && ground.x <= W - 32 &&
        ground.y >= 100 && ground.y <= H - 24 && this.hud.floorGoalVisible(rt, this.flagGround);
      const dx = this.flagGround.x - rt.player.u.pos.x, dz = this.flagGround.z - rt.player.u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      this.flagOffscreen = !groundVisible;
      this.flagAngle = Math.atan2(-forward, side);
      this.text.textContent = rt.def.keepOpeningTaskLabel ? this.hud.destinationPurpose(rt) : 'ここまで進む';
      const halfW = this.label.offsetWidth / 2, halfH = this.label.offsetHeight / 2;
      this.flagX = groundVisible ? ground.x : side >= 0 ? W - 64 : 64;
      this.flagY = groundVisible ? ground.y : Math.max(112, Math.min(H - 64, H / 2));
      this.flagBounds = null; this.flagFoot = this.flagGround;
      x = Math.max(halfW + 12, Math.min(W - halfW - 12, this.flagX));
      y = Math.max(halfH + 12, this.flagY - 40 - halfH);
      const box = this.flagLabelBox || (this.flagLabelBox = {});
      box.left = x - halfW; box.right = x + halfW;
      box.top = y - halfH; box.bottom = y + halfH;
      this.flagLabel = box;
    }
    if (!this.el.classList.contains('opening-controls') && !arrow.hidden && screenTarget) arrow.style.transform = `rotate(${Math.atan2(screenTarget.x - x, y - screenTarget.y)}rad)`;

    if (this.talkPerson) {
      const frame = this.hud.measurePersonFrame(this.talkPerson, rt, true);
      if (frame) {
        const spot = this.hud.enemyOrderSpot(frame, this.label.offsetWidth, this.label.offsetHeight);
        x = spot.x + this.label.offsetWidth / 2;
        y = spot.y + this.label.offsetHeight / 2;
      }
    }
    this.label.style.left = x + 'px'; this.label.style.top = y + 'px';
    if (this.talkPerson) {
      const box = this.talkLabelBox || (this.talkLabelBox = {});
      const halfW = this.label.offsetWidth / 2, halfH = this.label.offsetHeight / 2;
      box.left = x - halfW; box.right = x + halfW;
      box.top = y - halfH; box.bottom = y + halfH;
      this.talkLabel = box;
    }

  }

  dispose() {
    this.el.remove();
    this.hud.openingActive = false;
    this.hud.root.classList.remove('opening');
  }
}
