import { retreatRequired as dangerRetreatRequired, rescueTarget } from './battle_danger.js';
import { battleSpeechAllowed, battleSpeaker, noOps } from './speech_clean.js';
import { VIEW } from './viewport.js';
import { BattleOpening, openingGoal } from './battle_opening.js';
import { woundText } from './wounds.js';
import { enemyKnown, campKnown, intelText } from './battle_intel.js';
import { weatherSight, weatherSees } from './weather_gameplay.js';
import { isTouch, touchInput } from './touch.js';
import { BattleNotices } from './hud_notices.js';
import { currentObjective, markerName, goalText, taskText, destinationText, navigationEnemy } from './mission_guide.js';
import { jpNum } from './bhelp.js';
import { coverGuide, clearFoot } from './cover_guide.js';
import { groundAt } from './floors.js';
import { localClear, mountainWay } from './army_local_way.js';
import { rainDanger, visibleRainEscape } from './arrow_rain.js';

// 戦では行き先か敵一人だけを示す。町と稽古の操作案内は専用のまま。
function singleBattleGuide(rt) { return !rt.def.town && !rt.def.dojo; }
// 道筋の途中の点ではなく、守る持ち場そのものへの距離で案内を切り替える。
function guardPostDistance(rt, guide) {
  const point = guide?.marker?.guideDestination?.() || guide?.pos;
  return point ? Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z) : Infinity;
}
// 押す実物の名前を使う。敵へのタップでは攻撃できない。
function attackOperation(rt) {
  const p = rt.player;
  if (p.charging && p.chargeT > .7) return 'はなして攻撃';
  return isTouch ? `「${p.weapon === 'sword' ? 'きる' : p.weapon === 'bow' ? '射る' : p.weapon === 'gun' ? '攻撃' : 'つく'}」を長くおす` : '左クリックを長押しして はなす';
}
function byAllyDistance(a, b) { return a.d - b.d; }

// 敵の頭上と同じ刀の形を、既存の札でも使う。
const ENEMY_SIGN = '<svg width="24" height="28" viewBox="-16 -18 32 36" style="vertical-align:middle;margin-right:6px" aria-hidden="true"><path d="M-10-12L10 11M10-12L-10 11M-11 3L-3 10M3 10L11 3" fill="none" stroke="#14120f" stroke-width="7"/><path d="M-10-12L10 11M10-12L-10 11M-11 3L-3 10M3 10L11 3" fill="none" stroke="#fff3ba" stroke-width="3"/></svg>';

const FLOOR_FOOTPRINT = [-.18, -.5, .14, -.5, .17, -.18, .25, .22, .18, .48, -.13, .5, -.23, .28, -.17, -.08];
const FLOOR_DIRECTION = [0, .9, -.48, .25, -.2, .25, -.2, -.9, .2, -.9, .2, .25, .48, .25];
const FLOOR_CROSS = [-.18, -.65, .18, -.65, .18, -.18, .65, -.18, .65, .18, .18, .18, .18, .65, -.18, .65, -.18, .18, -.65, .18, -.65, -.18, -.18, -.18];

// 人に話す印や戸口は専用の案内を使い、進む先の旗だけ地面に示す。
function groundFlag(guide) {
  const m = guide?.marker;
  return !!m && !m.guidePerson && !m.entrance && !m.red &&
    (!m.guideArea || m.guideArea === 'wait') &&
    (m.guideArea === 'wait' || m.waitGuide || m.guideFlag || /旗|組の列/.test(guide.label));
}

// 到着の言葉を指定した戦では、丸めて零になる距離を到着として示す。
function destinationDistance(rt, distance, guidance = false) {
  // 戦固有の到着範囲を持つ時だけ、待機用の歩数より先に読む。
  if (guidance && rt.def.guidanceDistanceFirst && rt.def.distanceText) return rt.def.distanceText(rt, distance);
  if (guidance && rt.missionGuide?.marker?.guideArea === 'wait') {
    const remaining = distance - (rt.missionGuide.marker.guideRadius || 8);
    // 一歩を約七十五センチとして、輪に入るまでの歩数を示す。
    return remaining < 0 ? '' : `あと${Math.max(1, Math.ceil(remaining / .75))}歩`;
  }
  if (guidance && rt.missionGuide?.marker?.guideArea) return '';
  if (guidance && /旗|組の列/.test(rt.missionGuide?.label || '')) {
    return '';
  }
  if (guidance && rt.def.distanceText) return rt.def.distanceText(rt, distance);
  if (rt.def.distanceUnit === 'steps') return distance < 3 ? 'すぐ近く' : `あと${Math.ceil(distance / .75)}歩`;
  if (rt.def.distanceUnit === 'ken') {
    const ken = Math.max(1, Math.round(distance / 1.82));
    return distance < 3 ? 'すぐ近く' : `約${rt.def.key === 'okehazama' ? jpNum(ken) : ken}間`;
  }
  const metres = Math.round(distance);
  return metres === 0 && rt.def.arrivalLabel ? rt.def.arrivalLabel : `${metres}メートル`;
}

// 「／」で連ねた任務は普段の札では最初の一件。括弧の中の操作は保つ。
function firstTask(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '（' || c === '(') depth++;
    else if (c === '）' || c === ')') depth = Math.max(0, depth - 1);
    else if (!depth && (c === '／' || c === '/')) return text.slice(0, i).trim();
  }
  return text;
}

// 命の欄で退くよう知らせるけがは、転倒中も同じ案内にそろえる。
function woundRetreat(rt) {
  const u = rt.player.u, min = rt.def.woundEffectMin ?? 0;
  return singleBattleGuide(rt) && u.alive && !rt.over &&
    (rt.def.woundRetreatNeeded?.(rt) ??
      (u.wounds?.bleed > .0001 || u.hp < u.maxHp * .3 ||
        (rt.def.retreatForLimbWounds !== false && (u.woundSlow > min || u.armWound > min))));
}
function recovering(rt) { return singleBattleGuide(rt) && rt.player.u.alive && !rt.over && rt.player.knockT > 0 && !woundRetreat(rt); }

// 戦固有の攻める目的も、退避や回避を優先した一枚の札へまとめる。
function combatTask(rt) {
  return !rt.over && !recovering(rt) && !retreatRequired(rt) && !rt.dodgeGuide && !rainDanger(rt.army) &&
    !rt.hud.retreatGuide?.active && rt.def.combatTaskLabel?.(rt) || '';
}

function taskLabel(rt, text) {
  if (woundRetreat(rt) && !rt.def.keepWoundTaskLabel) return '味方へ さがれ';
  if (recovering(rt)) return rt.def.recoveryTaskLabel?.(rt) || '立つまで まとう';
  return rt.def.taskLabel?.(rt, text) || firstTask(text);
}

// 題と同じ説明は省く。後ろに続く残り人数などは残す。
function taskDetail(title, detail) {
  const text = String(detail || '');
  const shownTitle = String(title);
  const plain = (s) => s.replace(/[\s。、！？]/g, '');
  if (plain(text) === plain(shownTitle)) return '';
  const parts = text.split('。');
  if (plain(parts[0]) === plain(shownTitle)) return parts.slice(1).join('。').trim();
  return text;
}
import * as THREE from 'three';
import { sfx, speaking } from './audio.js';
import { RANKS, RANK_CEIL, ITEMS, rankLabel } from './state.js';
import { commandList, SQUAD_FORMS, ORDER_NAME, FORM_NAME, RADIAL, GROUP_NAME } from './player.js';
import { S, K, reduceMotion } from './settings.js';
import { drawMon } from './textures.js';
import { GENERALS, FACTION } from './units.js';
import { sightPoint, sightRef, sightUnit, sightScreenUnit, sightDistant, sightArmyMesh, numberHint, woundHint, knownName, groupSeen } from './battle_sight.js';
import { CAPTURE, GATE_STATE } from './nawabari.js';
import { NAKA } from './naka.js';
import { isRtsOn, rtsSelection, rtsCollect, rtsSetPick, rtsPick, rtsSetMulti, rtsMultiOn, rtsOrder, terrainHints, rtsCanCommand } from './rts.js';
import { ORDERS as RTS_ORDERS, FORMS as RTS_FORMS, icon as rtsIcon } from './gunbai.js';
import { viewLevel, playerSonae } from './senkyo.js';
import { decorateTerms } from './glossary.js';
import { famousPerson, battlePeople, castleWelcome } from './battle_welcome.js';
import { firstHelp, helpSeen } from './first_help.js';
import { FL } from './floors.js';
import { allyAction, allyPlace } from './ally_orders.js';

// 負傷時は道案内より退避を優先する。被害や救援の判定は変えない。
function retreatRequired(rt) {
  return woundRetreat(rt) || !rt?.def?.routeGuidePriority?.(rt) && dangerRetreatRequired(rt);
}

// 任務札・地面の札・操作の案内は同じ短い言葉で示す。
function retreatGuideText(rt, reached, fallback) {
  if (woundRetreat(rt) && !(rt.def.keepWoundRetreatReason && rt.def.retreatGuideLabel)) return reached ? '味方と かまえる' : 'ここへ さがろう';
  const label = rt.def.retreatGuideLabel?.(rt, reached);
  if (!reached && (label === '味方のうしろへ さがる' || label === '旗まで下がる')) return 'ここへ さがろう';
  return label || (reached ? 'ここで かまえる' : 'ここへ さがろう');
}

// 手当てができる条件は変えず、今できる操作だけを一つ示す。
function treatmentGuideText(rt, cue) {
  const label = rt.def.treatmentGuideLabel?.(rt, cue);
  if (label) return label;
  const p = rt.player;
  if (p.mounted) return 'おりる';
  if (p.treatmentNext > rt.t) return '止まって 少しまつ';
  if (p.treatmentReady) return p.treating ? 'そのまま おしつづける' : '「手当て」を三秒長おし';
  if (cue?.valid) {
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) < cue.radius) return '止まって 少しまつ';
    // 戦ごとの案内を優先し、指定がなければ家か味方への逃げ先を短く示す。
    return rt.def.treatmentApproachLabel === 'ここまで さがる' ? 'ここへ さがろう' :
      rt.def.treatmentApproachLabel || (cue.house ? '家へ にげる' : 'ここへ さがろう');
  }
  return '味方のうしろへ さがろう';
}

// 毎コマ書き替える札：前と同じ値なら DOM に触らない（重さの係。差分は最小に）
const _domCache = new WeakMap();
function setText(el, v) { if (_domCache.get(el) === v) return; _domCache.set(el, v); el.textContent = v; }
function setHtml(el, v) { const k = 'h:' + v; if (_domCache.get(el) === k) return; _domCache.set(el, k); el.innerHTML = v; if (el.id === 'subtitle' || el.id === 'h-who') decorateTerms(el); }

// 歩数や進み具合が動いても、変わらない任務の行は作り直さない。
const _listRowCache = new WeakMap();
function setListRows(el, rows) {
  let previous = _listRowCache.get(el);
  if (!previous) { previous = []; _listRowCache.set(el, previous); }
  for (let i = 0; i < rows.length; i++) {
    if (previous[i] === rows[i]) continue;
    const node = el.children[i];
    if (node) node.outerHTML = rows[i];
    else el.insertAdjacentHTML('beforeend', rows[i]);
    previous[i] = rows[i];
  }
  while (el.children.length > rows.length) el.lastElementChild.remove();
  previous.length = rows.length;
}

const SHORT_KEY_NAMES = { 左上の横矢印キー: '横矢', 空白キー: '空白', 右スティック押し込み: '右押込' };
function shortcutKey(s) { return SHORT_KEY_NAMES[s] || s.replace(/のキー$/, ''); }

// 同じ属性を再設定すると配置の観測も起きるので、今の値が変わる時だけ書く。
function setClass(el, name, on) { on = !!on; if (el.classList.contains(name) !== on) el.classList.toggle(name, on); }
function setHidden(el, on) { on = !!on; if (el.hidden !== on) el.hidden = on; }
function setStyle(el, name, value) { if (name.startsWith('--')) { setCssVar(el, name, value); return; } value = String(value); if (el.style[name] !== value) el.style[name] = value; }
function setCssVar(el, name, value, priority = '') { value = String(value); if (el.style.getPropertyValue(name) !== value || el.style.getPropertyPriority(name) !== priority) el.style.setProperty(name, value, priority); }
function setAttr(el, name, value) { value = String(value); if (el.getAttribute(name) !== value) el.setAttribute(name, value); }

// 台詞が替わる時だけ幅を調べる。名前も含めて三行に収め、続きは次の札へ。
let subtitleMeasure;
function subtitlePage(speaker, text, keepPlace = false) {
  const el = $('subtitle'), style = getComputedStyle(el);
  const rail = $('battle-notices');
  const railStyle = getComputedStyle(rail);
  const width = Math.max(1, rail.clientWidth - parseFloat(railStyle.paddingLeft) - parseFloat(railStyle.paddingRight) -
    parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.fontSize) * 2);
  subtitleMeasure ||= document.createElement('canvas').getContext('2d');
  subtitleMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const chars = Array.from((speaker ? speaker + '　' : '') + text);
  let rows = 1, used = 0, count = 0;
  for (const char of chars) {
    const size = subtitleMeasure.measureText(char).width;
    if (used + size > width) { rows++; used = 0; }
    if (rows > 3) break;
    used += size; count++;
  }
  const body = Array.from(text);
  let end = Math.max(1, count - (speaker ? Array.from(speaker).length + 1 : 0));
  if (end >= body.length) return [text, ''];
  // 文の終わりを先に選ぶ。句点が遠ければ読点で分け、文字は捨てない。
  const prefix = body.slice(0, end).join('');
  for (const mark of ['。', '！', '？', '、']) {
    const at = prefix.lastIndexOf(mark);
    if (at >= prefix.length / 2) { end = Array.from(prefix.slice(0, at + 1)).length; break; }
  }
  // 本能寺の地名と日付は、札の切り替わりでも途中を切らない。
  if (keepPlace) for (const match of text.matchAll(/本能寺|（油小路蛸薬師）|天正十年六月二日|夜明け前/g)) {
    const from = Array.from(text.slice(0, match.index)).length, to = from + Array.from(match[0]).length;
    if (end > from && end < to) { end = from || to; break; }
  }
  return [body.slice(0, end).join(''), body.slice(end).join('')];
}

// 読み上げの下ごしらえ（呼ぶたびに作り直さない）
let jaVoice = null;
const VOICE_MAJOR = /信長|源八|大沢|藤吉郎|義元|日比野|稲田|師範|可成|光秀|利家|秀吉|磯野|豪盛|勝家|長可|信忠|長秀|一益|秀政|嘉隆|元正|信盛|秀隆|弥七/;
const VOICE_V = [[/藤吉郎|秀吉/, 1.25, 1.12], [/信長/, 0.9, 1.05], [/源八|大沢|師範|可成/, 0.8, 0.92], [/光秀/, 0.95, 0.95], [/利家/, 1.05, 1.05], [/弥七|与兵衛|足軽/, 1.1, 1.05], [/義元|豪盛|磯野/, 0.85, 0.95],
        [/勝家/, 0.78, 0.9], [/長可/, 0.82, 1.08], [/信忠/, 1.0, 1.0], [/長秀/, 0.9, 0.98], [/一益/, 0.88, 0.96], [/秀政|元正|信盛|秀隆/, 0.95, 1.0], [/嘉隆/, 0.85, 0.95]];
let _dropSp = null;
function dropSprite() {
  if (_dropSp) return _dropSp;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32 - 32 * 0.3, 32 - 32 * 0.35, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.35, 'rgba(200,210,215,.18)'); gr.addColorStop(0.85, 'rgba(40,44,46,.28)'); gr.addColorStop(1, 'rgba(40,44,46,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
  return (_dropSp = c);
}
function setWidth(el, pct) { const v = pct + '%'; if (_domCache.get(el) === v) return; _domCache.set(el, v); el.style.width = v; }

// 組の数の札の色：3Dの隊旗の札・戦術マップ・部隊の帯で同じ色（白＝十分、黄＝減った、朱＝半ばより多く失った）
export const TAG_COL = { ok: '#ece4d2', mid: '#d8b04a', low: '#c0452e', gone: '#5a534a' };
export function tagOf(g) {
  const n = g.count, n0 = g.initial || n || 1;
  if (!n || g.routed) return 'gone';
  const r = n / n0;
  return r >= 0.7 ? 'ok' : r >= 0.4 ? 'mid' : 'low';
}
// 隊を率いる名のある武将（いなければ null）
export function groupGeneral(g) {
  for (const u of g.units) if (u.alive && u.name && !u.isSub && (u.type === 'busho' || GENERALS[u.name.replace(/^.* /, '')])) return u;
  return null;
}
// 敵方の家紋（遠景の大軍の敵味方を、軍配 gunbai.js と同じく家紋で見分ける）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku', 'maru', 'namu', 'yatagarasu', 'sagarifuji', 'miyoshi', 'rokkaku', 'uesugi', 'mori']);
// 隊の種類（遠目の見分け）：本陣・鉄砲・騎馬・弓・槍
export function groupKind(g) {
  if (g.isPlayerSquad) return g.kind || 'spear';
  if (groupGeneral(g)) return 'honjin';
  if (g.isGun) return 'gun';
  if (g.cav) return 'cavalry';
  let b = 0, n = 0;
  for (const u of g.units) { if (!u.alive) continue; n++; if (u.type === 'bow') b++; }
  return n && b >= n * 0.6 ? 'bow' : 'spear';
}
// 号令の小さな印（部隊の帯・号令の輪）
// 似た知らせの束（同じ束の知らせは、どれか一つが出たら 30 秒は出さない）
const BARK_FAMILY = [
  [/、崩れました$/, 'sonaeRout', 20],
  [/騎馬.*(止ま|止め)/, 'cavstop'], [/崩れ(て|た).*(逃げ|退)|敵が逃げ|敵.*(崩れ|総崩れ|背を見せ|槍を捨て)/, 'rout'], [/矢が来る|矢の雨/, 'arrow'], [/鉄砲.*(狙|来る)/, 'gun'],
  [/組頭を討ち取った/, 'leader'], [/持たぬ|押されておる|下がれ、下がれ/, 'waverA'], [/崩れるぞ|だめじゃ、逃げろ|持ちこたえられぬ/, 'waverB'],
  // 横腹の進み具合は全隊で三回まで。手柄が決まった声は別に出す
  [/横腹を突いている/, 'flank', 30, 3], [/向き直って|気づいた/, 'turn'],
  // 鉄砲組の撃った手応え（倒した数）は 8 秒に一度まで
  [/鉄砲組が.*人を倒した/, 'volleyKill', 8],
  // 同じ用向きの知らせの洪水を止める（見回り 10/8）：首の催促・鼓舞・組と離れた・使番・囲まれた・法螺と太鼓・寄せてくる
  [/証がない|首を袋に納めよ/, 'proof', 150], [/鼓舞/, 'rally', 90], [/組と離れすぎ|ついて来い/, 'tofollow', 90],
  // 戦い方の助言は全戦共通で三回まで。包囲や刃の光そのものの合図は続ける。
  [/後ろに敵！|後ろに追手！/, 'rearAdvice', 20],
  [/囲まれた！|敵に囲まれた！|囲みの薄い所|四方から敵|後ろにも敵|取り籠め/, 'mobAdvice', 60, 3],
  [/刃が光った|振りかぶった/, 'bladeAdvice', 60, 3],
  [/使番が走って/, 'runner', 60], [/囲まれた味方|向きを変えよ/, 'surround', 60], [/法螺貝と太鼓|鐘二つ|鐘の早打ち/, 'signal', 90],
  [/命が届いた/, 'delivered', 60], [/前から(槍|一撃)|振りかぶった|打ち込みを受け/, 'incoming', 45],
  [/小勢がこちらへ|寄せてくる/, 'raid', 45], [/お助けいたす|刃が光った/, 'aid', 60],
];
const ORDER_MARK = { follow: '従', hold: '待', attack: '突', retreat: '退', focus: '狙', move: '進', yari: '衾', flee: '崩', path: '進', assault: '攻' };
// 部隊の帯の顔：墨で描いた兵の半身（陣笠・兜）と、うすく家紋
const FACE_CACHE = new Map();
function faceCanvas(kind, mon) {
  const key = kind + '|' + mon;
  if (FACE_CACHE.has(key)) return FACE_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  // 和紙の地にうすく家紋
  g.fillStyle = '#d9cfb6'; g.fillRect(0, 0, 96, 96);
  const vg = g.createRadialGradient(48, 44, 20, 48, 48, 70); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,44,24,.45)');
  g.fillStyle = vg; g.fillRect(0, 0, 96, 96);
  // 半身の影
  g.fillStyle = '#1a1510';
  g.beginPath(); g.moveTo(10, 96); g.quadraticCurveTo(14, 66, 48, 64); g.quadraticCurveTo(82, 66, 86, 96); g.fill();
  g.beginPath(); g.ellipse(48, 50, 13, 15, 0, 0, 7); g.fill();
  const gen = kind === 'honjin' || kind === 'cavalry';
  if (gen) {
    // 兜：鉢・しころ・前立（本陣は金の鍬形）
    g.beginPath(); g.ellipse(48, 40, 17, 12, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(26, 44); g.lineTo(70, 44); g.lineTo(76, 54); g.lineTo(20, 54); g.closePath(); g.fill();
    g.strokeStyle = kind === 'honjin' ? '#c9a24a' : '#8a7a5a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(48, 32); g.quadraticCurveTo(36, 20, 30, 10); g.moveTo(48, 32); g.quadraticCurveTo(60, 20, 66, 10); g.stroke();
  } else {
    // 陣笠
    g.beginPath(); g.moveTo(16, 44); g.quadraticCurveTo(48, 20, 80, 44); g.quadraticCurveTo(48, 38, 16, 44); g.fill();
  }
  // 得物：槍・弓・鉄砲
  g.strokeStyle = '#1a1510'; g.lineWidth = 3;
  if (kind === 'spear' || kind === 'honjin') { g.beginPath(); g.moveTo(80, 96); g.lineTo(88, 6); g.stroke(); g.fillStyle = '#1a1510'; g.beginPath(); g.moveTo(88, 0); g.lineTo(91, 10); g.lineTo(85, 10); g.fill(); }
  else if (kind === 'bow') { g.beginPath(); g.moveTo(84, 8); g.quadraticCurveTo(70, 50, 84, 92); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(84, 8); g.lineTo(84, 92); g.stroke(); }
  else if (kind === 'gun') { g.lineWidth = 4; g.beginPath(); g.moveTo(58, 90); g.lineTo(90, 20); g.stroke(); }
  else if (kind === 'cavalry') { g.lineWidth = 3; g.beginPath(); g.moveTo(6, 92); g.lineTo(26, 20); g.stroke(); }
  // 胸に家紋の丸
  g.save(); g.beginPath(); g.arc(48, 82, 11, 0, 7); g.clip();
  const sc = 11 * 0.95 / (96 * 0.34);
  g.translate(48 - 48 * sc, 82 - 288 * 0.32 * sc); g.scale(sc, sc); drawMon(g, mon, 96, 288);
  g.restore();
  const url = c.toDataURL();
  FACE_CACHE.set(key, url);
  return url;
}
// 顔の絵は、鍵ごとに一度だけ CSS の決まり（.face.f3 など）にして、札の HTML には短い名だけを書く
// （札を作り直すたびに長い data: の字を比べ・読み直さない。戦の始めのコマ落ちを減らす）
const FACE_CLS = new Map();
function faceCls(kind, mon) {
  const key = kind + '|' + mon;
  let c = FACE_CLS.get(key);
  if (c) return c;
  c = 'f' + FACE_CLS.size;
  FACE_CLS.set(key, c);
  let st = document.getElementById('face-css');
  if (!st) { st = document.createElement('style'); st.id = 'face-css'; document.head.appendChild(st); }
  st.sheet.insertRule(`#h-units .face.${c} { background-image: url(${faceCanvas(kind, mon)}); }`, st.sheet.cssRules.length);
  return c;
}
// 凡例の小さな隊旗
const STD_SVG = {
  spear: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V1" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="1" width="5" height="11" fill="currentColor"/></svg>',
  gun: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V5" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="5" width="9" height="8" fill="currentColor"/></svg>',
  cavalry: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V1" stroke="currentColor" stroke-width="1.6"/><path d="M3 1L15 2.5V4L3 6Z" fill="currentColor"/></svg>',
  honjin: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V0" stroke="currentColor" stroke-width="2"/><rect x="3" y="0" width="8" height="13" fill="currentColor"/></svg>',
};
const KIND_WORD = { spear: '槍', bow: '弓', gun: '鉄砲', cavalry: '騎馬', honjin: '本陣' };

// 筆で掃いた朱の帯（見出しの下地）を一度だけ描いておく
let BRUSH = '';
function brushImage() {
  if (BRUSH) return BRUSH;
  const c = document.createElement('canvas');
  c.width = 900; c.height = 180;
  const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const y = 40 + Math.random() * 100;
    const x0 = 20 + Math.random() * 60, x1 = 820 + Math.random() * 60;
    g.strokeStyle = `rgba(${150 + Math.random() * 40},${30 + Math.random() * 20},${20 + Math.random() * 10},${0.25 + Math.random() * 0.35})`;
    g.lineWidth = 6 + Math.random() * 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y);
    g.bezierCurveTo(300, y + (Math.random() - 0.5) * 30, 600, y + (Math.random() - 0.5) * 30, x1, y + (Math.random() - 0.5) * 16);
    g.stroke();
  }
  // かすれ
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 900, Math.random() * 180, 2 + Math.random() * 14, 1 + Math.random() * 2); }
  BRUSH = c.toDataURL();
  return BRUSH;
}

// 筆で引いた細い線の形（体力・気力・敵将の棒のマスク）。一度だけ描いて CSS の --fude に渡す
// 左の入りは太く、右へ細り、ところどころかすれる。棒の中の色（朱・和紙）はこの形で切り抜かれる
let FUDE = '';
function fudeImage() {
  if (FUDE) return FUDE;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    // 入り（左 4%）は丸く、抜き（右 6%）はすっと細る
    const head = Math.min(1, t / 0.04), tail = Math.min(1, (1 - t) / 0.06);
    const h = 7.5 * (1 - 0.3 * t) * Math.sqrt(Math.min(head, tail)) + Math.sin(x * 0.37) * 0.35;
    const y = 8 + Math.sin(x * 0.05) * 0.5;
    g.globalAlpha = 0.82 + 0.18 * Math.abs(Math.sin(x * 1.7));
    g.fillRect(x, y - h, 1, h * 2);
  }
  // かすれ：筆の毛の筋を細く抜く（右ほど多い）
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const x = Math.pow(Math.random(), 0.6) * 256;
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.fillRect(x, 3 + Math.random() * 10, 6 + Math.random() * 30, 0.8);
  }
  FUDE = c.toDataURL();
  return FUDE;
}

// 札の小さな絵（線画）
const ICON = {
  spear: '<svg viewBox="0 0 24 24"><path d="M4 20 L18 6"/><path d="M18 6 L21 3 L20 7 Z" fill="#e9dcb8"/><path d="M6 16 L8 18"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path d="M5 19 L19 5"/><path d="M4 16 L8 20"/><path d="M3 21 L5 19"/></svg>',
  cmd: '<svg viewBox="0 0 24 24"><path d="M6 20 L12 10"/><path d="M12 10 C 9 6, 11 2, 15 3 C 20 4, 20 10, 15 11 C 13 11.5, 12 10, 12 10 Z"/></svg>',
  quick: '<svg viewBox="0 0 24 24"><path d="M4 12 H20"/><path d="M14 6 L20 12 L14 18"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><path d="M4 10 C 8 4, 16 4, 20 8 L 18 16 C 14 13, 9 14, 6 17 Z"/><path d="M4 10 L2 12"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M4 16 C 8 6, 16 6, 20 12"/><path d="M17 9 L20 12 L16 13"/></svg>',
  gun: '<svg viewBox="0 0 24 24"><path d="M3 15 L19 7"/><path d="M5 14 L4 19 L8 17"/><path d="M11 12 L12 15"/></svg>',
  bow: '<svg viewBox="0 0 24 24"><path d="M7 3 C 17 8, 17 16, 7 21"/><path d="M7 3 L7 21"/><path d="M4 12 H18"/></svg>',
  horse: '<svg viewBox="0 0 24 24"><path d="M5 20 L7 13 C 7 10, 10 9, 13 9 L 16 5 L 18 6 L 17 9 C 19 10, 19 13, 17 14 L 16 20"/><path d="M9 20 L10 15"/></svg>',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 札の字：キーの名前は鍵の形、指の端末では「突く」などの丸の名前を丸の形で見せる
const TOUCH_BTN = /「(突く|構え|回避|号令|取る|狙い|鼓舞|持替|地図|止める|乗る|降りる|手綱|視点)」/g;
function keyCaps(t) {
  let s = esc(t);
  // 移動は枠のない矢印の絵にする。キーの読みを並べず、前後左右を示す。
  s = s.replace(/↑ ← ↓ →/g, '<svg role="img" aria-label="前後左右" viewBox="0 0 32 32" style="width:32px;height:32px;vertical-align:middle"><path d="M16 12V2m-4 4 4-4 4 4M12 16H2m4-4-4 4 4 4M16 20v10m-4-4 4 4 4-4M20 16h10m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  s = s.replace(/文字([上中下])段(10|[1-9])/g, (m, row, col) => {
    const r = '上中下'.indexOf(row), c = Number(col) - 1;
    let keys = '';
    for (let y = 0; y < 3; y++) for (let x = 0; x < [10, 9, 7][y]; x++) keys += `<rect x="${2 + x * 7 + y * 2}" y="${2 + y * 7}" width="5" height="5" rx="1" fill="${y === r && x === c ? '#ffb09a' : '#b9b09c'}"/>`;
    return `<kbd class="cap" title="文字キーの${row}段、左から${col}番目" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><svg aria-hidden="true" viewBox="0 0 76 23" style="width:76px;height:23px">${keys}</svg>${row}段${col}</kbd>`;
  });
  if (isTouch) return s.replace(TOUCH_BTN, (m, b) => `<span class="tbtn">${b}</span>`);
  return s.replace(/(^|[\s（(／・、。])((?:[上中下]段[0-9]+|機能[0-9]+|ダブリュー|エックス|ゼット|エイチ|エー|ビー|シー|ディー|イー|エフ[0-9]*|ジー|アイ|ジェー|ケー|エル|エム|エヌ|オー|ピー|キュー|アール|エス|ティー|ユー|ブイ|ワイ|左シフト|右シフト|スペース|タブ|決定キー|戻るキー|オルト|上矢印|下矢印|左矢印|右矢印))(?=[\s）)／・で、。をのか]|$)/g, (m, a, b) => `${a}${b.split(' ').map((k) => `<kbd class="cap">${k}</kbd>`).join('')}`);
}
// 手ほどきの札の見た目（index.html の #tutorial を上書き）
// 緊迫の見せ方（画面の縁）：深手のにじみ・狙われている赤い脈・倒れる寸前の一撃。兵力の帯の「敵は何倍」
function tensionCss() {
  if (document.getElementById('tension-css')) return;
  const st = document.createElement('style');
  st.id = 'tension-css';
  st.textContent = `
#hud #prompt.fence-blocked { top:48%; max-width:min(280px, 34vw); box-sizing:border-box; padding:6px 8px; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.5; color:var(--washi); background:rgba(12,10,8,.95); border:2px solid var(--kin); text-align:center; }
#hud #prompt.fence-blocked strong { display:block; color:var(--kin); }
#hud #h-units .command-status { position:absolute; top:3px; left:1px; right:1px; font-style:normal; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; color:#ece4d2; background:#14120f; text-align:center; pointer-events:none; }
#hud #prompt.fence-blocked small { display:block; font-size:max(15px, calc(15px * var(--text-scale, 1))); }
html body #hud #prompt.work-action:not([hidden]) { display:block !important; top:auto; bottom:calc(64px + env(safe-area-inset-bottom, 0px)); padding:0; border:0; background:none; }
html body #hud #prompt.work-action::before { content:none; }
/* 作業札は文字に沿う小さな帯。横持ちでは下端へ逃がして兵の胴と武器を空ける。 */
@media (max-height:500px) {
 html body #hud #prompt.work-action:not([hidden]) { bottom:calc(8px + env(safe-area-inset-bottom, 0px)); }
}
#hud #prompt button[data-work] { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:0 8px; box-sizing:border-box; min-width:44px; max-width:calc(100vw - 32px); min-height:48px; padding:6px 10px 9px; position:relative; color:#fff3d0; background:#29251c; border:2px solid #e8d39c; border-radius:8px; font:700 max(16px, calc(16px * var(--text-scale, 1)))/1.4 var(--ui); text-align:left; pointer-events:auto; cursor:pointer; touch-action:none; }
#hud #prompt button[data-work].fire-work { grid-template-columns:28px minmax(0,1fr) auto; }
#hud #prompt button[data-work].fire-work svg { width:28px; height:36px; }
#hud #prompt button[data-work] span { word-break:keep-all; overflow-wrap:normal; }
#hud #prompt button[data-work]:active { background:#493f2c; }
#hud #prompt button[data-work] small { display:block; margin:0; font-size:max(13px, calc(13px * var(--text-scale, 1))); font-weight:400; color:#eee4cb; white-space:nowrap; }
#hud #prompt button[data-work] .holdbar { position:absolute; left:10px; right:10px; bottom:4px; display:block; margin:0; height:2px; background:#514a3c; border:0; }
#hud #prompt button[data-work] .holdbar b { background:#e8d39c; }
/* 作業の進みは任務札の場所へまとめる。台詞はその下へ並べる。 */
html body #hud.working #battle-notices #objectives:not(.expand) { display:none !important; }
html body #hud.working #prompt.work-action:not([hidden]) {
 position:sticky !important; inset:0 auto auto !important; transform:none !important;
 width:100% !important; margin:0 !important; order:-1; flex:0 0 auto; z-index:2;
}
#hud.working #prompt button[data-work] { width:100%; }
#hud #prompt button[data-work].holding { box-shadow:inset 0 -1px #e8d39c; }
html body #hud.retreat-priority #prompt.treatment-action:not([hidden]) { visibility:visible !important; }
#hud #prompt.treatment-action .holdbar { height:5px; }
#hud #prompt button[data-work]:focus-visible { outline:2px solid #fff3d0; outline-offset:3px; }
#hud .mk.edge::after { content:''; width:0; height:0; border:7px solid transparent; border-bottom:12px solid var(--kin); border-top:0; font-size:0; }
#hud .mk.large-way { display:flex; flex-direction:column; align-items:center; gap:4px; }
#hud .mk.large-way.edge { padding-top:28px; }
#hud .mk.large-way.edge::before { display:none; }
#hud .mk.large-way.edge::after { top:0; border-width:10px; border-bottom-width:18px; border-top:0; font-size:0; }
#hud .mk:has(.behind-label) { display:flex; flex-direction:column; align-items:center; gap:4px; }
#hud .mk .behind-label { display:block; max-width:min(280px, 42vw); white-space:normal; overflow-wrap:anywhere; line-height:1.4; font-size:max(16px, calc(16px * var(--text-scale, 1))); color:var(--kin); background:#14120f; padding:4px 8px; box-sizing:border-box; }
#hud #cmdpanel .squad-forms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
#hud #cmdpanel .squad-forms button { min-height: 48px; min-width: 44px; padding: 6px; font: inherit; font-size: max(12px, calc(13px * var(--text-scale, 1))); line-height: 1.3; color: var(--washi); background: #14120f; border: 1px solid var(--washi-dim); cursor: pointer; }
#hud #cmdpanel .squad-forms small { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-dim); }
#hud #cmdpanel .squad-forms button[aria-pressed=true] { border: 2px solid var(--kin); background: #30291c; }
#hud #cmdpanel .squad-forms button:focus-visible { outline: 3px solid var(--kin); box-shadow: 0 0 0 5px #14120f; }
#hud #cmdpanel .squad-forms button:active { background: #30291c; }
html.touch #hud #cmdpanel ol { gap: 8px; }
#hud #vignette { box-shadow:none; }
#hud #vignette.winded:not(.hurt) { box-shadow:none; animation:none; }
#vignette.hurt, #vignette.dying, body.rm #vignette.dying { box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; mask-image:none; -webkit-mask-image:none; animation:none; background:radial-gradient(ellipse at top left, rgba(140,16,4,.2), transparent 70%) top left / 20% 24% no-repeat, radial-gradient(ellipse at top right, rgba(140,16,4,.2), transparent 70%) top right / 20% 24% no-repeat, radial-gradient(ellipse at bottom left, rgba(140,16,4,.2), transparent 70%) bottom left / 20% 24% no-repeat, radial-gradient(ellipse at bottom right, rgba(140,16,4,.2), transparent 70%) bottom right / 20% 24% no-repeat; }
#aimwarn { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse 78% 74% at 50% 50%, transparent 58%, rgba(92,16,6,.34) 82%, rgba(52,8,2,.66) 100%); transition: opacity .5s; }
#aimwarn.on { opacity: 1; animation: aimPulse 1.1s ease-in-out infinite alternate; }
@keyframes aimPulse { from { opacity: .55; } to { opacity: 1; } }
#brinkfx { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(90,0,0,.15) 30%, rgba(40,0,0,.92) 100%); }
#brinkfx.on { animation: brinkA 1.6s ease-out; }
@keyframes brinkA { 0% { opacity: 1; background-color: rgba(255,240,230,.35); } 8% { background-color: rgba(0,0,0,0); } 100% { opacity: 0; } }
#mobfx { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity .5s; background: linear-gradient(90deg, rgba(20,6,4,.55), transparent 16%, transparent 84%, rgba(20,6,4,.55)); }
#mobfx.on { opacity: 1; animation: mobIn 1.2s ease-in-out infinite alternate; }
@keyframes mobIn { to { background-size: 115% 100%; } }
body.rm #mobfx.on { animation: none; }
body.rm #aimwarn.on { animation: none; }
#encircle { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .9s; -webkit-mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); }
#encircle.on { opacity: 1; }
#hud.photo #encircle, #hud.photo #aimwarn, #hud.photo #brinkfx { display: none; }
#crosshair .range-cue { position: absolute; left: 50%; top: 30px; transform: translateX(-50%); white-space: nowrap; font-size: 12px; line-height: 1.4; padding: 2px 6px; color: #ece4d2; background: #14120f; border-radius: 3px; pointer-events: none; }
#crosshair .range-cue[hidden] { display: none; }
/* 技の列はキー名・絵・技名を縦に分け、拡大した字も省略せず折り返す。 */
#hud #h-bottom .slot { box-sizing:border-box; height:auto; min-height:64px; padding:2px 4px 4px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:2px; }
#hud #h-bottom .slot.off { display:none; }
#hud #h-bottom .slot em { position:static; margin:0; width:100%; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.2; white-space:normal; overflow:visible; overflow-wrap:anywhere; text-overflow:clip; text-align:center; }
#hud #h-bottom .slot svg { position:static; transform:none; width:22px; height:22px; flex-shrink:0; }
/* 岩村・高遠：間合いは照準の上、気力は左上で輪の下。体と命中の印から離す。 */
#hud.spaced-combat-cues #crosshair .range-cue { top: auto; bottom: calc(100% + 24px); font-size: max(12px, calc(12px * var(--text-scale, 1))); z-index: 2; }
#hud.spaced-combat-cues #staring { left: calc(50% - 90px); top: calc(50% - 70px); }
#hud.spaced-combat-cues #staring + .combat-cue-label { left: calc(50% - 80px) !important; top: calc(50% - 46px) !important; transform: translateX(-50%); white-space: nowrap; font-size: max(12px, calc(12px * var(--text-scale, 1))) !important; line-height: 1.4; border-radius: 3px; z-index: 2; }
#hud.photo .combat-cue-label, #hud.ending .combat-cue-label { display: none; }
/* 軍の説明は読むだけ。子の字も携帯の突く・構えの入力を受け取らない。 */
#hud #armybar, #hud #armybar *, #sonae-cards * { pointer-events: none; }
html.touch #hud:has(#radial:not([hidden])) #armybar,
html.touch #hud:has(#cmdpanel:not([hidden])) #armybar,
html.touch body:has(#hud #radial:not([hidden])) #sonae-cards,
html.touch body:has(#hud #cmdpanel:not([hidden])) #sonae-cards { visibility: hidden; }
#armybar .outnum { color: #ff8a70; font-weight: 700; margin: 0 6px; letter-spacing: .04em; }
/* 狭い画面では見える敵の数を別行にして、札の頭が切れないようにする */
@media (max-width: 1000px) { #armybar .outnum { display: block; margin: 0; white-space: nowrap; } }
#hud #armybar .side .nm { flex-wrap: wrap; white-space: normal; overflow: visible; text-overflow: clip; }
#hud #armybar .side .nm .n { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
#hud #armybar .side .nm small { flex-basis: 100%; order: 1; line-height: 1.4; }
#hud #armybar { max-height: none; overflow: visible; }
/* 両軍名の下地は字の幅だけ。文字の下は濃く保ち、余白の両端だけ戦場へなじませる。 */
#hud #armybar::before { content:none; }
#hud #armybar .side {
 width:fit-content; min-width:0; max-width:100%; box-sizing:border-box;
 justify-self:start;
}
#hud #armybar .side.b { justify-self:end; }
#hud #armybar .side .nm {
 padding:3px 12px; box-sizing:border-box;
 background:linear-gradient(90deg, transparent, #14120f 12px, #14120f calc(100% - 12px), transparent);
 box-shadow:none;
}
#hud.hc #armybar .side .nm { background:#14120f; }
/* 全戦の行き先札で、回る矢印の余白を字の上に確保する。 */
#hud .mk.main.edge { display:flex; flex-direction:column; align-items:center; gap:4px; width:max-content; height:auto; padding-top:28px; white-space:nowrap; }
#hud .mk.main.edge::before { display: none; }
#hud .mk.main.edge::after { font-size: 24px; top: 0; text-shadow: 0 1px 3px #000; }
/* 姉川の小さな横画面でも、矢印と字を別の段へ収める。 */
#hud.anegawa #battle-notices #objectives li.cur small.goal-place { white-space:normal; overflow-wrap:anywhere; overflow:visible; line-height:1.4; }
/* 姉川の守備札は大きな字でも末尾を切らず、札の中で折り返す。 */
html body #hud.anegawa #battle-notices #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 min-width:0; max-width:100%; height:auto !important; max-height:none !important;
 white-space:normal !important; overflow-wrap:anywhere !important; overflow:visible !important; text-overflow:clip !important;
}
/* 大河内の帰陣先と距離は、携帯でも指で送らず読めるようにする。 */
#hud.okawachi #battle-notices #objectives li.cur small.goal-place { min-width:0; white-space:normal; overflow-wrap:anywhere; overflow:visible; line-height:1.4; }
#hud.anegawa .mk.main.edge { display:flex; flex-direction:column; align-items:center; gap:4px; width:max-content; height:auto; padding-top:24px; }
#hud.anegawa .mk.main.edge::after { top:0; }
#hud.anegawa #markers .mk b { min-width:0; max-width:min(240px, 30vw); white-space:normal; overflow-wrap:anywhere; }
/* 設楽原の虎口・浅瀬は、記号と地名を別の段へ収める。 */
#hud.shitaragahara #markers .mk { display:flex; flex-direction:column; align-items:center; gap:5px; height:auto; }
#hud.shitaragahara #markers .mk.edge { padding-top:24px; }
#hud.shitaragahara #markers .mk.edge::after { top:0; }
#hud.shitaragahara #markers .mk b { display:block; min-width:0; max-width:min(240px, 30vw); white-space:normal; overflow-wrap:anywhere; }
/* 桶狭間の札は記号を左の余白へ出し、字と重ねない。 */
#hud.okehazama #markers .mk { width:max-content; height:auto; padding-left:24px; box-sizing:border-box; }
#hud.okehazama #markers .mk::before { position:absolute; left:2px; top:3px; margin:0; }
#hud.okehazama #markers .mk.edge::before { display:none; }
#hud.okehazama #markers .mk.edge::after { left:8px; top:4px; }
#hud.okehazama #markers .mk b { display:block; min-width:0; max-width:min(240px, 30vw); white-space:normal; overflow-wrap:anywhere; }
/* 桶狭間の横持ちは上の余白を詰め、追い討ちと手当ての札を途中で切らない。 */
@media (max-height:500px) {
 html.touch body #hud.okehazama #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  top:calc(12px + env(safe-area-inset-top, 0px)) !important;
  max-height:calc(100% / 3 - 12px - env(safe-area-inset-top, 0px)) !important;
 }
}
/* 任務と行き先は同じ◆。細い線だけにせず、墨の地に太い字を置く。 */
html body #hud #markers .mk.main { width:max-content; height:auto; max-width:210px; padding:6px 8px; color:#fff3ba; background:#14120f; border:2px solid #fff3ba; box-shadow:0 0 0 2px #14120f; opacity:1; }
html body #hud #markers .mk.main::before { display:none; }
html body #hud #markers .mk.main :is(b,small) { display:block; position:static; max-width:100%; margin:0; padding:0; white-space:normal; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4; font-weight:700; color:#fff3ba; background:none; }
html body #hud #markers .mk.main.edge { padding-top:30px; }
html body #hud #markers .mk.main.edge::after { top:4px; border-left-width:10px; border-right-width:10px; border-bottom:18px solid #fff3ba; }
html body #hud #markers .mk.main:not(.edge)::after { content:'↓'; display:block; position:absolute; top:100%; left:50%; transform:translateX(-50%); border:0; font-size:30px; line-height:30px; font-weight:900; color:#fff3ba; text-shadow:0 2px 2px #14120f,2px 0 2px #14120f,-2px 0 2px #14120f; }
#hud .cover-guide { position:absolute; z-index:4; pointer-events:none; transform:translate(-50%, -100%); width:168px; box-sizing:border-box; padding:6px; color:#fff3ba; background:#14120f; border:3px solid #fff3ba; box-shadow:0 0 0 2px #14120f; text-align:center; font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4; font-weight:700; }
#hud .cover-guide::after { content:'↓'; display:block; font-size:30px; line-height:30px; margin-bottom:32px; }
#hud .cover-guide::before { content:''; position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:64px; height:26px; border:3px solid #fff3ba; background:rgba(255,243,186,.12); }
#hud .cover-guide.edge::before { display:none; }
#hud .cover-guide.edge::after { margin-bottom:0; }
#hud .cover-guide small { display:block; font-size:15px; }
#hud .cover-guide.edge::after { content:'➤'; transform:rotate(var(--ang)); }
#hud .battle-action .dismount-action { min-width:132px; min-height:48px; padding:8px 16px; border:2px solid #fff3ba; background:#14120f; color:#fff; font:inherit; font-weight:bold; pointer-events:auto; touch-action:manipulation; }
#hud .battle-action small { display:block; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4; }
#hud .battle-action.guard-action::before { content:'➤'; display:inline-block; margin-right:8px; color:#fff3ba; transform:rotate(var(--enemy-angle)); }
html body #hud.compact-battle #battle-notices #objectives:not(.expand) li.cur .tag,
html body #hud.compact-battle #battle-notices #objectives.arrived-order:not(.expand) li.cur small.goal-place { display:none !important; }
html body #hud.compact-battle #battle-notices #objectives:not(.expand) li.cur .obj-now { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; }
#hud :is(.aim-role,.stamina-cue) { font-size:13px; line-height:1.4; color:#ece4d2; background:#14120f; padding:2px 4px; white-space:nowrap; }
#hud .aim-role { position:absolute; top:28px; left:50%; transform:translateX(-50%); }
html.touch body #hud .stamina-cue:not([hidden]) { display:block !important; }
html body #hud.compact-battle #battle-notices:not(.choosing) #objectives:not(.travel-retreat):not(.expand) li.cur small.goal-place { display:block !important; font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4; white-space:normal; }
#hud .mk.person-goal { color:#fff3ba; font-size:16px; text-shadow:0 2px 3px #14120f; }
#hud .dodge-button { width:100%; height:100%; min-height:44px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; gap:4px; border:3px solid #fff3ba; border-radius:8px; background:#14120f; color:#fff3ba; font:bold 18px/1.3 sans-serif; padding:4px; touch-action:none; pointer-events:auto; }
#hud .dodge-button svg { width:32px; height:32px; flex:none; }
#hud .dodge-button .dodge-gesture { width:72px; height:72px; }
#hud .dodge-button span { min-width:0; padding:0; text-align:left; }
#hud .dodge-button b { display:block; font-size:inherit; line-height:1.3; white-space:normal; overflow-wrap:anywhere; }
#hud .dodge-button small[hidden] { display:none; }
#hud .dodge-button small { display:block; font-size:max(16px,calc(16px * var(--text-scale,1))); }
#hud .dodge-button:is(:active,[aria-pressed="true"]) { background:#49402a; }
#hud .dodge-button:focus-visible { outline:3px solid #fff; outline-offset:-6px; }
#hud .dodge-guide { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:3; overflow:hidden; }
#hud.photo .dodge-guide, #hud.ending .dodge-guide, #hud:has(#intro:not([hidden])) .dodge-guide, #hud:has(#bigmap:not([hidden])) .dodge-guide, body:has(#pause:not([hidden])) .dodge-guide { display:none !important; }
#hud.photo :is(.aim-role,.cover-guide), #hud.ending :is(.aim-role,.cover-guide) { display:none !important; }

#hud #h-hp.bleeding { outline: 2px solid var(--shu-text); animation: bleedPulse 1.6s ease-in-out infinite; }
@keyframes bleedPulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
body.rm #hud #h-hp.bleeding { animation: none; opacity: 1; }
`;
  document.head.appendChild(st);
}

function coachCss() {
  if (document.getElementById('coach-css')) return;
  const st = document.createElement('style');
  st.id = 'coach-css';
  st.textContent = `
#hud #tutorial.coach { left: calc(20px + env(safe-area-inset-left, 0px)); top: 34%; width: 272px; box-sizing: border-box; padding: 10px 14px 11px; background: rgba(12,10,8,.84); box-shadow: inset 0 0 0 1px var(--gold-line); border-left: 3px solid var(--kin); line-height: 1.55; font-size: 14px; }
#hud #tutorial.coach .lbl { display: flex; justify-content: space-between; font-size: 12px; letter-spacing: .2em; color: var(--kin); margin-bottom: 3px; }
#hud #tutorial.coach .lbl b { font-weight: 500; letter-spacing: .05em; color: var(--washi-dim); }
#hud #tutorial.coach p { margin: 0; display: block; }
#hud #tutorial.coach .what { font-family: var(--display); font-size: 18px; color: var(--washi); letter-spacing: .06em; }
#hud #tutorial.coach .lbl + .what:not(:last-child) { margin-bottom: 2px; }
#hud #tutorial.coach .what.ok { color: #f0d488; }
#hud #tutorial.coach .what.sm { font-family: var(--ui); font-size: 15px; letter-spacing: 0; }
#hud #tutorial.coach .what.ok i { font-style: normal; margin-right: 8px; }
#hud #tutorial.coach .how { font-size: 14px; color: #ddd4c0; }
#hud #tutorial.coach kbd.cap { font-size: 12px; }
#hud #tutorial.coach .tbtn { display: inline-grid; place-items: center; min-width: 2.6em; height: 1.9em; margin: 0 2px; padding: 0 6px; box-sizing: border-box; border-radius: 1em; border: 1.5px solid rgba(194,162,90,.7); background: rgba(14,11,8,.7); font-size: 13px; font-weight: 700; color: var(--washi); vertical-align: middle; }
#hud #tutorial.coach.in { animation: coachIn .22s ease-out; }
#hud #tutorial.coach.tutold { width: auto; min-width: 0; padding: 4px 10px; }
#hud #tutorial.coach.tutold .what, #hud #tutorial.coach.tutold .how { display: none; }
#hud:has(#banner.show) #compass { opacity: .2; transition: opacity .3s; }
#hud #skiphint:not([hidden]) { min-height: 44px; box-sizing: border-box; display: flex; align-items: center; }
@keyframes coachIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
body.rm #hud #tutorial.coach.in { animation: none; }
@media (prefers-reduced-motion: reduce) { #hud #tutorial.coach.in { animation: none; } }
/* 携帯の横向き：左上の釦と戦功の札の下、歩く棒の上に小さく */
@media (max-height: 500px) {
  /* 幅は中身に合わせる（短い札で戦場を横に長くふさがない） */
  #hud #tutorial.coach { top: calc(128px + env(safe-area-inset-top, 0px)); left: calc(76px + env(safe-area-inset-left, 0px)); width: max-content; min-width: 140px; max-width: 236px; padding: 7px 11px 8px; }
  #hud #tutorial.coach .what { font-size: 16px; }
  #hud #tutorial.coach .how { font-size: 15px; }
  #hud #tutorial.coach .what.sm { font-size: 16px; }
}`;
  document.head.appendChild(st);
}

// 上空視点（rts.js）の帯：選んだ部隊の札・下知の釦・構えの横開き（F5・docs/siege-plan.md）
function rtsCss() {
  if (document.getElementById('rts-css')) return;
  const st = document.createElement('style');
  st.id = 'rts-css';
  st.textContent = `
#rts-dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 24; display: flex; flex-direction: column; gap: 6px;
  padding: 8px calc(10px + env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) calc(10px + env(safe-area-inset-left, 0px));
  background: linear-gradient(0deg, rgba(10,9,7,.86), rgba(10,9,7,0)); pointer-events: none; }
#rts-dock[hidden] { display: none; }
#rts-dock .rts-cards { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; pointer-events: auto; padding: 2px; }
#rts-dock .rts-card { flex: 0 0 auto; width: 54px; height: 60px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 3px;
  background: linear-gradient(180deg, #2c3446, #1a1f2b); border: 1px solid rgba(143,166,200,.6); color: var(--washi); font: 600 12px var(--ui); }
#rts-dock .rts-card canvas { width: 24px; height: 24px; }
#rts-dock .rts-card .mb { display: block; width: 44px; height: 4px; background: rgba(0,0,0,.6); }
#rts-dock .rts-card .mb i { display: block; height: 100%; background: #9fc28a; }
#rts-dock .rts-card .mb.md i { background: #e0b44a; } #rts-dock .rts-card .mb.lo i { background: #d4553b; }
#rts-dock .rts-card.off { background: linear-gradient(180deg, #3a3a3a, #232323); border-color: rgba(180,180,180,.5); filter: grayscale(1); }
#rts-dock .rts-card.off canvas { opacity: .5; }
#rts-dock .rts-card.off small { font: 700 9px/1.1 var(--ui); color: #e8d7b0; text-align: center; }
#rts-dock .rts-none { pointer-events: none; margin: 0 0 2px; font: 600 13px var(--ui); color: var(--washi-dim); text-shadow: 0 1px 2px #000; }
#rts-dock .rts-row { display: flex; gap: 8px; pointer-events: auto; flex-wrap: wrap; }
#rts-dock button { min-height: 44px; min-width: 44px; font: 600 13px/1.1 var(--ui); color: var(--washi); background: rgba(44,40,33,.92);
  border: 1px solid rgba(194,162,90,.45); display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; }
#rts-dock button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
#rts-dock button.on, #rts-dock button[aria-pressed="true"] { background: rgba(192,69,46,.6); border-color: #f0c070; }
#rts-dock button[disabled] { opacity: .38; }
#rts-dock .rts-forms { display: none; gap: 8px; flex-wrap: wrap; pointer-events: auto; padding-bottom: 4px; border-bottom: 1px dashed rgba(194,162,90,.35); }
#rts-dock .rts-forms.open { display: flex; }
@media (max-width: 720px) { #rts-dock .rts-card { width: 46px; height: 54px; } #rts-dock button span.lb { display: none; } #rts-dock button { min-width: 44px; padding: 4px 8px; justify-content: center; } }
`;
  document.head.appendChild(st);
}
const MON_ICON = {};
function monIcon(k) {
  if (MON_ICON[k]) return MON_ICON[k];
  const src = document.createElement('canvas'); src.width = 48; src.height = 96;
  try { drawMon(src.getContext('2d'), k, 48, 96); } catch (e) { /* 絵の無い家紋 */ }
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  c.getContext('2d').drawImage(src, 8, 96 * 0.32 - 16, 32, 32, 0, 0, 32, 32);
  return (MON_ICON[k] = c);
}

// 触る端末（スマホ横・iPad）で「画面の札の量：最小」の時は、戦場を見せるのを一番に（字は要る瞬間だけ）
const leanHud = () => isTouch && (S.hudMode || 'normal') === 'min';
// 門や柵の操作は近くの行動札へ。任務と道しるべには下知だけ残す。
const fieldLabel = (text) => {
  const label = text.replace(/本陣/g, '守る場所').replace(/槍/g, 'やり');
  return /門|木戸|柵/.test(label) ? label.replace(/（[^）]*(?:長押し|キー)[^）]*）/g, '').trim() : label;
};
// 任務の成否は変えず、閉じた札だけやさしい一つの行動にする。
const shortTask = (text) => firstTask(text)
  .replace('組のそばで受け、敵が振り終えたら突け', '仲間のそばで守れ')
  .replace('組のそばで構え、次の下知を待て', '仲間のそばで待て')
  .replace(/組頭の旗へ進み、下知を聞け|この旗へ進め/, '旗へ進む')
  .replace('組の旗に続け。敵が来たら構えよ', '旗についていけ')
  .replace(/義元の討ち取り後、組と帰る/, '義元をたおし、仲間と帰れ')
  .replace(/討ち取れ/g, 'たおせ').replace(/組とともに、/g, '仲間と').replace(/下知/g, '指示');
const guidanceEnded = (rt) => {
  if (rt.retryOpen || rt.ended || !rt.player.u.alive) return true;
  if (rt.def.withdrawGuidance && rt.withdrawal?.losing === 0) return false;
  return rt.over || rt.flags.ending ||
    (rt.tracker?.main === false && !(rt.def.failureRetreatGuidance && rt.flags.fleeing));
};

export function moraleWord(m) {
  if (m >= 75) return '意気盛ん';
  if (m >= 50) return '平常';
  if (m >= 30) return '動揺';
  return '崩れかけ';
}

// 任務の進み具合の字から割合を読む（「5/20」「一の門 5%」）。読めなければ null
function progressRatio(s) {
  s = String(s).replace(/[０-９／％]/g, (c) => c === '／' ? '/' : c === '％' ? '%' : String(c.charCodeAt(0) - 0xff10));
  const f = /(\d+)\s*\/\s*(\d+)/.exec(s);
  if (f && +f[2] > 0) return Math.max(0, Math.min(1, f[1] / f[2]));
  const p = /(\d+)\s*%/.exec(s);
  if (p) return Math.max(0, Math.min(1, p[1] / 100));
  return null;
}

// 狙いの札に添える相手の種類
function kindWord(u) {
  if (u.mounted || u.type === 'cavalry') return '騎馬';
  return { ashigaru: '槍', samurai: '侍', busho: '武将', bow: '弓', gun: '鉄砲', porter: '人足', dummy: '稽古' }[u.type] || '';
}

function typeName(u) {
  if (knownName(u)) return knownName(u);
  return { ashigaru: '敵足軽', samurai: '敵侍', busho: '敵武将', bow: '敵弓兵', gun: '敵鉄砲足軽', cavalry: '敵騎馬', dummy: '藁人形', porter: '人足' }[u.type] || '敵';
}

// 大札・字幕・短い声が実際に出る時の共通の間引き。
// 待ち列へ入れた時には記録せず、出し方をまたいで同じ時計を使う。
const WARNING_FAMILY = [
  [/刃が光った|振りかぶった|前から(?:槍|一撃)|打ち込みを受け/, 'bladeAdvice'],
  [/囲ま|囲み|包囲/, 'encircle'],
  [/横から敵|横から突|横槍|後ろから|後ろだ/, 'flanked'],
  [/矢玉|矢が来る|矢の雨|鉄砲|筒先|火縄/, 'ranged'],
  [/一太刀|お命|倒れる|深手/, 'wounded'],
  [/構えて下がれ|味方の列へ.*(?:退|下が)/, 'retreat'],
  [/小勢|寄せて[く来]る|敵の隊が寄せ/, 'raid'],
];
class HudNotices extends BattleNotices {
  constructor(hud) {
    super(hud);
    this.textSeen = new Map();
    this.warningSeen = new Map();
    // 任務と警告は文の高さで縦に並べる。携帯でも札の間を八つ分空ける。
    const style = document.createElement('style');
    style.textContent = `
#hud #battle-notices #battle-message { gap:8px; }
#hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; margin:0 !important; box-sizing:border-box;
  height:auto !important; max-height:none !important; flex:0 0 auto;
  white-space:normal; overflow-wrap:anywhere; overflow:visible;
  text-overflow:clip; color:#ece4d2; background:#14120f !important;
}
#hud #battle-notices #battle-message > :is(#subtitle,.battle-notice).warn { color:#ffcf7a; }
#hud #battle-notices #battle-message #subtitle :is(.sp,.sys,.more) { color:#ece4d2; }
html body #hud #battle-notices #battle-message > #subtitle,
html.touch body #hud #battle-notices #battle-message > div#subtitle,
html.touch.tc-low body #hud #battle-notices #battle-message > div#subtitle {
  display:block !important; writing-mode:horizontal-tb !important;
  min-height:44px !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
/* 隠した字幕を表示用の規則で戻さない。空の黒札と余白を残さない。 */
html body #hud #battle-notices:not(.choosing) > #battle-message[hidden],
html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice):is([hidden],.notice-muted) {
  display:none !important;
}
html body #hud #battle-notices:not(.choosing) > #battle-message {
  width:fit-content !important; max-width:100% !important;
  min-height:0 !important; padding:0 !important; background:none !important;
}
html body #hud #battle-notices #battle-message > .battle-notice {
  width:fit-content !important; min-height:0 !important;
  padding:6px 10px !important;
}
/* 台詞を横並びの伸縮枠にすると、本文が一文字幅まで押し潰される。 */
#hud #battle-notices #battle-message #subtitle > span { display:inline !important; width:auto !important; white-space:normal !important; }
#hud #battle-notices #battle-message #subtitle .sp { display:inline !important; margin:0 .5em 0 0 !important; }
#hud #battle-notices #battle-message #subtitle .more { display:none !important; }
/* 台詞の表示指定より先に、非表示の札を畳む。空の台詞で警告の上を塞がない。 */
html body #hud.anegawa-notices #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted) { display:none !important; }
/* 姉川のパソコン表示は、声と任務を同じ欄へ積み、小地図と中央の敵を空ける。 */
@media (min-height:501px) {
  html:not(.touch) body #hud.anegawa.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html:not(.touch) body #hud.anegawa.mission-visible #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
  }
  html:not(.touch) body #hud.anegawa #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    min-width:0 !important; max-width:100% !important; width:auto !important;
    white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
    max-height:none !important; overflow:visible; line-height:1.4 !important;
    font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
  }
}
/* 箕作の縦に余裕がある画面では、任務と知らせを左の同じ欄へ収める。 */
@media (min-height:501px) {
  html body #hud.mitsukuri #battle-notices:not(.choosing),
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px);
  }
  html body #hud.mitsukuri #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
  html body #hud.mitsukuri.combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0; max-width:100% !important;
  }
  html body #hud.mitsukuri #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now) {
    white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
    max-height:none !important; overflow:visible; line-height:1.4 !important;
  }
  /* パソコンでも人数と手当ての末尾を読む。共通の二行省略より、この戦の欄を優先する。 */
  html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) {
    width:100% !important; min-width:0 !important; padding:8px !important;
  }
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now),
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
    font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
    line-height:1.5 !important; white-space:normal !important; overflow-wrap:anywhere;
    height:auto !important; max-height:none !important; overflow:visible !important;
    -webkit-line-clamp:unset; line-clamp:unset;
  }
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
    display:block !important;
  }
  html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small {
    font-size:max(14px, calc(14px * var(--text-scale, 1))) !important;
    white-space:normal !important; overflow-wrap:anywhere; line-height:1.5 !important;
    height:auto !important; max-height:none !important; overflow:visible !important;
  }
}
/* 天王寺と鳥取のパソコン表示は、手ほどきも任務も同じ欄で縦に積む。 */
@media (min-height:501px) {
  /* 後ろの共通の任務表示より優先し、天王寺の札を小地図へ戻さない。 */
  html body #hud.tennoji.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
  html body #hud:is(.tennoji,.tottori) #battle-notices:not(.choosing) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html body #hud:is(.tennoji,.tottori) #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
    max-height:none !important; white-space:normal; overflow-wrap:anywhere;
  }
}
/* 天王寺では補足と任務を横に押し合わず、一つずつ欄の幅で読む。 */
html body #hud.tennoji #battle-notices #objectives:not(.expand) li.cur {
  display:block !important; width:100%; box-sizing:border-box;
}
html body #hud.tennoji #battle-notices #objectives:not(.expand) :is(.obj-text,.obj-now,.battle-action) {
  display:block; flex:none; width:auto !important; min-width:0 !important; max-width:100% !important;
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow-wrap:anywhere !important; word-break:normal; overflow:visible !important;
}
html body #hud.tennoji #battle-notices :is(#subtitle,#tutorial,#banner,#situation,.battle-notice) {
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow-wrap:anywhere; overflow:visible !important; box-sizing:border-box;
}
#hud #objectives.attack-order .obj-now { white-space:nowrap; }
#hud .mk.wait-goal b { white-space:nowrap; }
#hud .mk.wait-goal.arrived::after { content: none; }
#hud.honnoji .place-word { display:inline-block; white-space:nowrap; }
#hud.honnoji :is(#objectives li,.tl .next) { height:auto !important; max-height:none !important; white-space:normal; overflow:visible; line-height:1.5; }
#hud.honnoji #staring { left:calc(50% - 94px); top:calc(50% + 48px); }
/* 有岡のパソコン表示は、任務・手ほどき・使番を同じ欄に積んで地図から離す。 */
@media (min-height:501px) {
  html body #hud.arioka #battle-notices:not(.choosing),
  html body #hud.arioka.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html body #hud.arioka #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint),
  html body #hud.arioka #battle-notices :is(#subtitle,.battle-notice,#tutorial.coach,.what,.how) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; min-width:0; height:auto !important; min-height:0;
    max-height:none !important; flex:0 0 auto; white-space:normal !important;
    overflow-wrap:anywhere; box-sizing:border-box;
  }
  html body #hud.arioka #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    display:block; width:auto !important; min-width:0; max-width:100%;
    height:auto !important; max-height:none !important; white-space:normal !important;
    overflow-wrap:normal; word-break:normal; line-break:strict;
    overflow:visible; line-height:1.5 !important;
  }
  /* 足元の案内に切り替わっても、下知は左の同じ欄で読む。 */
  html body #hud.arioka #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; max-width:100% !important;
  }
}
/* 有岡の横画面は札を左へ寄せ、木戸の敵と進む通りを空ける。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch body #hud.arioka #battle-notices:not(.choosing),
  html.touch body #hud.arioka #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
  /* 足元へ追従する共通の固定札も欄へ戻す。矢印と敵の頭に任務を重ねない。 */
  html.touch body #hud.arioka #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important;
    width:100% !important; max-width:100% !important;
  }
}
#hud.honnoji #staring + .combat-cue-label { left:calc(50% - 102px) !important; top:calc(50% + 72px) !important; }
#hud.honnoji .mk:has(.behind-label) .behind-label { font-size:14px; padding:4px 6px; }
/* 本能寺の狭い廊下では、右から寄る兵の顔と刃を札で隠さない。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch #hud.honnoji #battle-notices:not(.choosing),
  html.touch.tc-low #hud.honnoji #battle-notices:not(.choosing) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
}
/* 台詞・知らせが出る間は任務の下に二行分を収め、下の操作帯の手前まで欄を広げる。 */
html.touch body #hud #battle-notices:not(.choosing):has(#battle-message:not([hidden])) {
  max-height:calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px))))) !important;
}
@media (max-height:500px) {
  /* 長い文は欄の中で送り、戦場の四分の三と下の操作を空ける。 */
  html.touch #hud #battle-notices:not(.choosing),
  html.touch.tc-low #hud #battle-notices:not(.choosing),
  html.touch #hud #battle-notices:not(.choosing):has(#objectives.expand),
  html.touch.tc-low #hud #battle-notices:not(.choosing):has(#objectives.expand) {
    height:auto;
    max-height:min(25vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px))))));
    overflow-y:auto;
  }
}
#hud #target.notice-muted { display:none !important; }
/* 岩村の携帯横向きだけ、任務と声を左へ寄せて敵の頭と照準を空ける。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch #hud.iwamura #battle-notices:not(.choosing),
  html.touch.tc-low #hud.iwamura #battle-notices:not(.choosing) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
}
`;
    style.textContent += `
/* 横向きの携帯は短い任務を先に読む。札の面積は戦場の三分の一より小さく保つ。 */
@media (max-height:500px) {
 html.touch body #hud #battle-notices:not(.choosing) {
  width:min(300px, 34vw) !important;
  max-height:min(33vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px)))) !important;
 }
 html.touch body #hud #battle-notices #objectives:not(.expand) .victory-condition { display:none !important; }
 html.touch body #hud #battle-notices #objectives li.cur,
 html.touch body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
  font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.45 !important;
 }
 html.touch body #hud #battle-notices #objectives li.cur small.goal-place {
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
 }
 html.touch body #hud #markers .mk :is(b,small) { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; font-weight:800; }
 html.touch body #hud :is(.battle-action,#battle-notices #objectives li.cur,#battle-notices #battle-message > :is(#subtitle,.battle-notice)) { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; font-weight:800; line-height:1.4 !important; }
 /* 有岡は期限と守る場所を短く読み、秒の一字だけを次の行へ送らない。 */
 html.touch body #hud.arioka #battle-notices #objectives:not(.expand) :is(li.cur,.battle-action),
 html.touch body #hud.arioka #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow:visible !important; word-break:normal; overflow-wrap:normal !important;
  line-break:strict; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 html.touch body #hud #combo,
 html.touch body #hud .combat-cue-label { display:none !important; }
 html.touch body #hud.danger-notice #battle-message { order:-2 !important; }
 html.touch body #hud.danger-notice #markers { visibility:hidden !important; }
}
#hud #boss { font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4; letter-spacing:0; background:#14120f; padding:4px 8px; box-sizing:border-box; }
html body #hud #boss.field-boss {
 position:absolute; right:auto !important; bottom:auto !important; width:max-content !important;
 max-width:140px !important; min-width:0 !important; margin:0 !important;
 transform:translate(-50%, -100%) !important; font-size:16px !important;
 color:#ffd0c4; border-bottom:3px solid #ffd0c4; pointer-events:none;
}
html body #hud #boss.field-boss.symbol-only { background:none; border:0; padding:0; font-size:26px !important; text-shadow:0 2px 3px #14120f; }
html body #hud #boss.field-boss.symbol-only::after { display:none; }
html body #hud #boss.field-boss span { font-size:inherit !important; }
html body #hud #boss.field-boss:not(.edge)::after {
 content:'▼'; position:absolute; top:100%; left:50%; transform:translateX(-50%); color:#ffd0c4;
 font-size:18px; line-height:18px; text-shadow:0 2px 2px #14120f;
}
html body #hud #battle-notices #objectives.flag-order:not(.expand) li.cur .obj-now {
 font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; line-height:1.4;
}
#hud #target.field-target {
 position:absolute; transform:translate(-50%, -100%); margin:0; padding:4px 8px;
 background:rgba(12,10,8,.92); color:#fff1cd; border:1px solid #fff1cd;
 pointer-events:none; white-space:nowrap;
}
#hud #target.field-target span { font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4; color:#fff1cd; }
#hud #target.field-target span::before { content:none; }
#hud #target.field-target svg { width:20px; height:20px; align-self:center; }
#hud #markers .mk.main::before {
 width:16px; height:20px; border:0; border-left:2px solid #fff1cd; transform:none;
 background:linear-gradient(#f3d98a,#f3d98a) left top / 14px 11px no-repeat;
}
/* 設楽原の任務と声は同じ欄に積み、小地図と重ねない。 */
@media (min-height:501px) {
 html body #hud.shitaragahara.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.shitaragahara #battle-notices:not(.choosing) {
  left:16px !important; right:auto !important; top:104px !important;
  width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
 }
 html body #hud.shitaragahara #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint),
 html body #hud.shitaragahara #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; min-width:0 !important; max-width:100% !important;
  height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
 }
 html body #hud.shitaragahara #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  min-width:0 !important; max-width:100% !important; height:auto !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
  overflow:visible !important; line-height:1.4 !important;
 }
}
@media (max-height:500px) {
 html.touch body #hud.shitaragahara #battle-notices #objectives:not(.expand) li.cur .obj-now {
  font-size:max(18px, calc(18px * var(--text-scale, 1))); white-space:normal; overflow-wrap:anywhere;
 }
 html.touch body #hud.shitaragahara #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small:not(.goal-place) { display:none !important; }
}
`;
    style.textContent += `
/* 任務は上端、名前は人物の上。画面の中央を戦場へ空ける。 */
html body #hud.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 top:calc(12px + env(safe-area-inset-top, 0px)) !important;
 left:auto !important; right:calc(76px + env(safe-area-inset-right, 0px)) !important;
 bottom:auto !important; max-height:25vh !important;
}
/* 共通の任務札は本文・補足・距離を縦に積む。本文の幅を他の行へ分けない。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 box-sizing:border-box; height:auto !important; max-height:none !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
 width:auto !important; min-width:0 !important; max-width:100% !important;
 white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
 height:auto !important; max-height:none !important; overflow:visible !important; line-height:1.4 !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-text {
 display:block !important; width:100% !important;
}
/* 「今」だけの行と重複する種別札を省き、行動を札の先頭から読む。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { content:none !important; }
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .tag { display:none !important; }
/* 岩村の携帯横向きは、後の共通配置にも負けず左上で進路を空ける。 */
@media (min-width:601px) and (max-height:500px) {
 html.touch body #hud.iwamura.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  top:calc(12px + env(safe-area-inset-top, 0px)) !important;
  left:calc(200px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  /* 戻る下知が二行になっても、距離まで札の中へ収める。 */
  max-height:calc(100% - 12px - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px))) !important;
  overflow-y:auto;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) {
  flex:0 0 auto !important; max-height:none !important; overflow:visible !important;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place {
  font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur,
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-now,.battle-action) {
  font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 }
}
/* 岩村の縦に余裕がある画面は、任務と使番の声を左で積み、小地図を空ける。 */
@media (min-height:501px) {
 html body #hud.iwamura #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.iwamura #battle-notices:not(.choosing) {
  top:104px !important; left:16px !important; right:auto !important;
  width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 html body #hud.iwamura #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; height:auto !important; min-width:0; flex:0 0 auto;
  max-height:none !important; white-space:normal; overflow-wrap:anywhere;
 }
}
/* 岩村では接敵の操作中も柵の持ち場を同じ札で読む。共通の頭上案内で任務を隠さない。 */
/* 点火中は作業札へ一本化する。後の任務表示指定にも勝ち、空の黒帯を重ねない。 */
html body #hud.iwamura.working #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:none !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) {
 background:rgba(20,18,15,.9) !important; padding:6px 10px !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
 display:block !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 line-height:1.4 !important; max-height:none !important; overflow:visible !important;
}
#hud #prompt [data-talk] { min-width:104px; min-height:52px; font-size:32px; font-weight:900; color:#fff3ba; background:#14120f; border:2px solid #fff3ba; }
/* 相手の頭上の吹き出し全体を押せる一枚にする。 */
html body #hud #prompt.talk-target {
 left:var(--talk-x) !important; top:var(--talk-y) !important; bottom:auto !important;
 width:var(--talk-w); height:var(--talk-h); transform:none !important;
 padding:0; border:0; background:none; overflow:visible;
}
html body #hud #prompt.talk-target [data-talk] {
 position:relative; display:flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; width:100%; height:100%; min-width:44px; min-height:44px;
 padding:6px 10px; border:3px solid #14120f; border-radius:8px; background:#fff3ba; color:#14120f;
 box-shadow:0 0 0 2px #fff3ba; pointer-events:auto; cursor:pointer; touch-action:manipulation;
}
#hud #prompt.talk-target [data-talk]::after {
 content:""; position:absolute; left:calc(var(--talk-tip-x, 50%) - 8px); bottom:-12px;
 width:14px; height:14px; background:#fff3ba; border-right:3px solid #14120f; border-bottom:3px solid #14120f; transform:rotate(45deg);
}
#hud #prompt.talk-target .talk-label { display:block; font-size:20px; line-height:1.4; white-space:nowrap; }
#hud #prompt.talk-target .talk-label strong { display:block; font-size:24px; }
#hud #prompt [data-talk] svg { width:40px; height:44px; vertical-align:middle; }

html body #hud:is(.retreat-priority,.dodge-active) :is(#prompt,#markers,.cover-guide) { visibility:hidden !important; }
/* 回避中は行き先一組だけ。敵の札は次の更新を待たずに隠す。 */
html body #hud:is(.retreat-priority,.dodge-active) :is(#target,#boss,.range-cue) { visibility:hidden !important; }
html body #hud.rain-danger :is(#prompt,#markers,.cover-guide,#objectives) { visibility:hidden !important; }
html body #hud:is(.rain-danger,.dodge-active) #objectives:not(.expand) :is(#obj-list,.battle-action,.victory-condition) { display:none !important; }
html body #hud #markers .mk.main.person-goal svg { display:block; order:2; flex:none; width:48px; height:56px; margin:auto; }
html body #hud #markers .mk.main.person-goal::before,
html body #hud #markers .mk.main.person-goal:not(.edge)::after { display:none !important; }
html body #hud #markers .mk.main.person-goal b { display:block; padding:6px 10px; border:2px solid #fff3ba; font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; line-height:1.4; color:#fff3ba; background:#14120f; }
html body #hud #markers .mk.main.person-goal b[hidden] { display:none !important; }
html body #hud #markers .mk.main.person-goal small { font-size:15px; line-height:1.4; }
html body #hud #markers .mk.main.person-goal:not(.edge) { padding:0; border:0; background:none; box-shadow:none; font-size:38px; line-height:1; }
html body #hud #markers .mk.main.person-goal { display:flex; flex-direction:column; align-items:center; width:max-content; max-width:220px; }
html body #hud #markers .mk.main.person-goal b[hidden] { display:none !important; }
html body #hud #markers .mk.main.person-goal small { order:1; }
html body #hud #markers .mk.main.person-goal.edge svg { order:0; }
/* 命は一本の塗りと目盛り。空いた部分が減った命を表す。 */
html body #hud:not(.ending) .bl, html body #hud:not(.ending) .bl.full { opacity:1; }
html body #hud .bl #h-hp { display:grid !important; grid-template-columns:max-content minmax(0,1fr) !important; width:max(224px,calc(208px * var(--text-scale,1) + 16px)); box-sizing:border-box; align-items:center; gap:4px 12px; padding:6px 8px; background:#14120f; color:#fff; }
html body #hud .bl #h-hp span { display:block !important; grid-column:1; grid-row:1; white-space:nowrap; word-break:keep-all; color:#fff; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:700; line-height:1.3; }
html body #hud .bl #h-hp.hp i { grid-column:1 / -1; grid-row:2; position:relative; display:block; height:20px !important; box-sizing:border-box; border:2px solid #fff; padding:2px; background:#14120f; box-shadow:none; mask:none; -webkit-mask:none; overflow:hidden; }
html body #hud .bl #h-hp i::after { content:none; }
html body #hud .bl #h-hp i strong { position:absolute; display:block; inset:2px; width:auto; height:auto; background:#fff; transform:scaleX(var(--hp-ratio,1)); transform-origin:left center; }
/* 傷は命の札の中にまとめ、点滅や色がなくても気づける形にする。 */
html body #hud .bl #h-hp:is(.blood-loss,.deep) { border:2px solid #fff3ba; box-shadow:0 0 0 2px #14120f; }
html body #hud .bl #h-hp:is(.blood-loss,.deep) em { color:#fff3ba !important; font-weight:800; letter-spacing:0; }
/* 残りの命と傷を別の行で読む。満身でも前の戦の傷は残る。 */
html body #hud .bl #h-hp .hp-remaining { grid-column:2; grid-row:1; justify-self:end; font-size:max(18px,calc(18px * var(--text-scale,1))); font-weight:800; white-space:nowrap; }
html body #hud .bl #h-hp em,
html body #hud .bl #h-hp:is(.blood-loss,.deep) em { grid-column:1 / -1; grid-row:3; justify-self:start; display:block !important; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:800; line-height:1.4; white-space:normal; font-style:normal; text-align:left; min-width:0; max-width:100%; overflow-wrap:anywhere; box-sizing:border-box; color:#fff !important; background:#14120f; letter-spacing:0; }
/* 鳥取の傷は大きな字を保ち、長い説明を札の幅で折り返す。 */
html body #hud.tottori .bl #h-hp.hp em { font-size:max(22px,calc(22px * var(--text-scale,1))) !important; overflow-wrap:anywhere; word-break:normal; }
html body #hud .bl #h-hp em[hidden] { display:none !important; }
html body #hud .bl #h-hp em small { display:block; font-size:inherit; }
html body #hud #objectives .destination-cue { display:inline-flex; align-items:center; gap:6px; margin-right:8px; white-space:nowrap; color:#fff3ba; }
html body #hud #objectives .destination-cue small { display:inline !important; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:800; }
html body #hud #objectives.unified-destination:not(.expand) li.cur .obj-now::before { content:none !important; }
html body #hud .bl #h-hp em svg { width:26px; height:28px; vertical-align:middle; margin-right:4px; }
html body #hud.lean .bl, html.touch.tc-low body #hud .bl { width:max(224px,calc(208px * var(--text-scale,1) + 16px)); max-width:calc(100vw - 32px); }
/* 岩村の横画面では傷の長い文で列幅を押し広げず、命の札の中で折り返す。 */
html body #hud.iwamura .bl #h-hp.hp { grid-template-columns:max-content minmax(0,1fr) !important; max-width:100%; }
html body #hud.iwamura .bl #h-hp.hp :is(i,em) { min-width:0; max-width:100%; box-sizing:border-box; }
html body #hud.iwamura .bl #h-hp.hp em { justify-self:stretch; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; overflow-wrap:anywhere; word-break:normal; }
html body #hud #objectives.travel-retreat:not(.expand) :is(.battle-action,.victory-condition,li.cur small,.obj-tag) { display:none !important; }
html body #hud #battle-notices #objectives.travel-retreat:not(.expand) #obj-list { display:block !important; }
html body #hud #battle-notices #objectives.travel-retreat:not(.expand) li.cur .obj-now { display:block !important; font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; }
html body #hud #objectives.travel-retreat:not(.expand) li.cur .obj-now::before { content:none !important; }
/* 札は旗、進む向きは床の矢印で示す。 */
html body #hud #battle-notices #objectives.destination-sign:not(.expand) li.cur .obj-now::before {
 content:none !important;
}
/* 入口と任務札に同じ門形を使う。 */
html body #hud #battle-notices #objectives.place-destination:not(.expand) li.cur .obj-now::before {
 content:'' !important; display:inline-block; width:24px; height:28px; margin-right:8px; vertical-align:middle;
 background:#fff3ba; clip-path:polygon(0 26%,50% 0,100% 26%,86% 26%,86% 100%,67% 100%,67% 43%,33% 43%,33% 100%,14% 100%,14% 26%);
}
/* 行き先は大きな矢印一つ。画面外では同じ矢印を行き先へ向ける。 */
html body #hud #markers .mk.main.direction-only {
 width:36px !important; height:40px !important; min-width:0 !important; max-width:36px !important;
 padding:0 !important; border:0 !important; background:none !important; box-shadow:none !important;
}
html body #hud #markers .mk.main.direction-only::before { display:none !important; }
html body #hud #markers .mk.main.direction-only::after {
 content:'' !important; display:block; position:absolute; inset:0 !important; width:36px; height:40px;
 border:0 !important; background:#fff3ba; clip-path:polygon(35% 0,65% 0,65% 55%,95% 55%,50% 100%,5% 55%,35% 55%);
 transform:none !important; filter:none;
}
html body #hud #markers .mk.main.direction-only .destination-chip { position:absolute; bottom:44px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:4px; padding:3px 6px; white-space:nowrap; color:#fff3ba; background:#14120f; font-size:18px; font-weight:bold; }
html body #hud #markers .mk.main.direction-only .destination-chip svg { width:22px; height:26px; }
html body #hud #markers .mk.main.direction-only { filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f); }
html body #hud #markers .mk.main.direction-only.edge::after { transform:rotate(calc(var(--ang) - 1.5708rad)) !important; }
#hud #objectives.destination-order:not(.flag-order):not(.expand) li.cur .obj-now::before,
#hud #battle-notices .battle-notice.warn.cover-advice::before,
#hud .battle-action.cover-action::before { content:'◆ '; color:#fff3ba; }
html body #hud #markers .mk.main.direction-only .way-turn {
 position:absolute; top:40px; left:50%; transform:translateX(-50%); padding:2px 4px;
 color:#fff3ba; background:#14120f; font-size:15px; line-height:1.4; white-space:nowrap;
}
#hud #objectives.flag-order:not(.expand) li.cur .obj-now::before { content:'◇ '; color:#fff3ba; }
#hud #objectives.wait-order:not(.expand) li.cur .obj-now::before {
 content:''; display:inline-block; width:28px; height:12px; margin-right:8px;
 border:3px solid #fff3ba; border-radius:50%; vertical-align:middle;
}
/* 回避先のひし形と競う照準・気力の輪を隠す。 */
html body #hud.dodge-active :is(#crosshair,#staring,.stamina-cue) { visibility:hidden !important; }
/* 移動先と話す相手を示す間は、中央の白い照準を重ねない。 */
html body #hud:is(.flag-guide,.person-guide,.travel-guide) #crosshair { visibility:hidden !important; }
html body #hud.single-guide :is(.combat-cue-label,.range-cue) { visibility:hidden !important; }
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur :is(.obj-now,.obj-text) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur .obj-now::before { display:none !important; }
/* 地面の案内は任務札そのものを輪の外へ移す。押せる高さを保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 40vw) !important;
 min-height:44px !important; max-height:none !important; transform:none !important;
 overflow:visible !important; margin:0 !important;
}
html body #hud #battle-notices #objectives.ground-order:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html.touch body #hud #battle-notices #objectives.ground-order:not(.expand) li.cur .obj-now {
 white-space:normal !important; overflow-wrap:anywhere !important;
}
html.touch body #hud #battle-notices #objectives.entrance-order:not(.expand) li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important;
}
/* 志賀は敵の印が出ても持ち場の指図を残す。携帯の細い札でも末尾を切らない。 */
html.touch body #hud.shiga #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
 min-width:0; max-width:100%; white-space:normal !important; overflow-wrap:anywhere !important;
 overflow:visible !important; text-overflow:clip;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 24px) !important;
 background:#14120f !important; color:#fff3ba; padding:6px 10px !important;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important; word-break:keep-all !important;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-text {
 flex:0 0 auto !important;
}
/* 志賀・田野の任務と警告は同じ欄で縦に並べ、地図と画面の外へ張り出さない。 */
html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 max-width:100% !important; min-width:0 !important;
}
html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
 min-width:0; max-width:100%; white-space:normal !important; overflow-wrap:anywhere !important;
 word-break:normal !important; overflow:visible !important; text-overflow:clip;
}
/* 田野の合図・距離は本文の下へ。一文字幅の列と固定位置の札を作らない。 */
html body #hud.tano #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
}
html body #hud.tano #battle-notices #objectives:not(.expand) li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 height:auto !important; max-height:none !important; box-sizing:border-box;
}
html body #hud.tano #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
 display:block; width:auto !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; max-height:none !important; white-space:normal !important;
 overflow-wrap:anywhere !important; word-break:normal !important; overflow:visible !important; line-height:1.4 !important;
}
@media (min-height:501px) {
 /* 田野は移動・集合の任務が出ても、この欄を小地図の上へ戻さない。 */
 html body #hud.tano.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) {
  left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  top:104px !important; width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 /* 本文を広げて人物紹介の半行切れを避ける。低い画面は既存の送りを使う。 */
 #hud #intro[data-battle="shiga"]:has(#intro-go) > .card {
  height:min(680px, calc(100dvh - 176px));
 }
}
@media (max-height:500px) {
 html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) {
  left:calc(76px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(96px + env(safe-area-inset-top, 0px)) !important;
  max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
 }
}
/* 伊賀の指図と台詞は同じ欄に収め、固定位置の札が重なって切れないようにする。 */
html body #hud.iga #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
html body #hud.iga #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 min-width:0 !important; max-width:100% !important; box-sizing:border-box;
 transform:none !important;
}
html body #hud.iga #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
 min-width:0; max-width:100%; height:auto !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
 word-break:normal !important; overflow:visible !important; text-overflow:clip;
 line-height:1.4 !important;
}
@media (min-height:501px) {
 html body #hud.iga #battle-notices:not(.choosing) {
  left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  top:104px !important; width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 html body #hud.iga #prompt.work-action:not([hidden]) { bottom:calc(104px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-height:500px) {
 html body #hud.iga #battle-notices:not(.choosing) {
  left:calc(76px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(96px + env(safe-area-inset-top, 0px)) !important;
  width:min(280px, 34vw) !important;
  max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
 }
}
/* 今の操作が出ている間は、待機や移動の指図を同じ札へ重ねない。一覧では読める。 */
html body #hud #battle-notices #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) > :not(.battle-action) { display:none !important; }
/* 長い指図も札の幅で折り返し、端まで読めるようにする。 */
html body #hud #battle-notices #objectives:not(.expand) :is(.obj-text,.obj-now,.battle-action) {
 min-width:0; max-width:100%; white-space:normal; overflow-wrap:anywhere;
}
/* 鳥取の低い画面では、任務の三行目を共通の高さ制限で切らない。 */
@media (max-height:500px) {
 html body #hud.tottori.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  max-height:33vh !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) > #objectives:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; height:auto !important; max-height:none !important;
  flex:0 0 auto; box-sizing:border-box;
 }
 /* 行き先は本文と地面の印に残し、重複する一文字の行を増やさない。 */
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place:not([hidden]) {
  display:none !important;
 }
}
/* 頭上・旗の案内が出ている間は、同じ指図を上の札に重ねない。記録と任務一覧は残す。 */
html body #hud:is(.flag-guide,.person-guide) #objectives:not(.expand) :is(#obj-list,.battle-action,.victory-condition) { display:none !important; }
html body #hud:is(.guard-guide,.flag-guide,.person-guide) #battle-notices #objectives:not(.expand) {
 background:none !important; border:0 !important; box-shadow:none !important; padding:0 !important; min-height:0 !important;
}
/* 旗の布の実寸を白枠で囲む。画面外では矢印と短い一言だけ。 */
html body #hud #markers .mk.main.flag-goal:not(.edge) {
 padding:4px 8px; border:0; background:#14120f;
}
html body #hud #markers .mk.main.flag-goal b { font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; white-space:nowrap; }
html body #hud #markers .mk.main.flag-goal.flag-framed:not(.edge)::after { display:none !important; }
#hud .goal-flag-frame {
 position:absolute; top:calc(100% + var(--flag-y, 0px)); left:calc(50% + var(--flag-x, 0px)); width:var(--flag-width, 52px); height:var(--flag-height, 64px);
 overflow:visible; pointer-events:none;
}
#hud .goal-flag-frame > svg { display:block; width:100%; height:100%; overflow:visible; }
#hud .goal-flag-frame > svg.goal-flag-arrow { position:absolute; left:50%; top:-56px; width:42px; height:52px; transform:translateX(-50%); }
#hud .mk.edge .goal-flag-frame { display:none; }
html body #hud #markers .mk.main.person-goal .goal-flag-frame > svg { width:100%; height:100%; margin:0; }
html body #hud #markers .mk.main.person-goal .goal-flag-frame > svg.goal-flag-arrow { width:42px; height:52px; }

/* 行き先の札には常に行動を書く。地面の囲みは共通の描画へ。 */
#hud .cover-guide { width:max-content; max-width:min(200px, 30vw); padding:6px 10px; border:0; box-shadow:none; }
#hud .cover-guide::before { display:none; }
#hud .cover-guide::after { display:none; }
#hud .cover-guide.edge::after { content:"➤"; display:inline-block; margin:0 0 0 8px; transform:rotate(var(--ang)); font-size:20px; line-height:24px; }
#hud button.cover-guide.hold-cover { display:flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; white-space:pre-line; width:204px; height:auto; min-width:44px; min-height:64px; padding:8px; border:3px solid #fff3ba; border-radius:12px; background:#373326; box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f; transform:none; right:calc(24px + env(safe-area-inset-right, 0px)); bottom:calc(128px + env(safe-area-inset-bottom, 0px)); pointer-events:auto; touch-action:none; cursor:pointer; }
#hud button.cover-guide.hold-cover span { position:static; flex:1; min-width:0; padding:0; color:#fff3ba; font:800 16px/1.4 var(--ui); white-space:pre; pointer-events:none; }
#hud button.cover-guide.hold-cover svg { flex:none; width:44px; height:48px; pointer-events:none; }
#hud button.cover-guide.hold-cover svg + svg { display:none; }
#hud button.cover-guide.hold-cover::after { display:none; }
#hud button.cover-guide.hold-cover.edge::after { display:none; }
html.tc-sw #hud button.cover-guide.hold-cover.edge::after { right:auto; left:calc(100% + 16px); }
#hud button.cover-guide.hold-cover[aria-pressed="true"] { background:#493f2c; box-shadow:0 0 0 3px #14120f, inset 0 4px 0 #14120f; }
#hud button.cover-guide.hold-cover:focus-visible { outline:3px solid #fff3ba; outline-offset:5px; }
html.tc-sw #hud button.cover-guide.hold-cover { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
html.tc-sw #hud button.cover-guide.hold-cover span { right:auto; left:0; }
/* 戻る案内へまとめた任務は空の下地も消す。有岡は持ち場と期限を残す。 */
html body #hud.cover-guidance:not(.arioka) #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; visibility:hidden !important; }
/* 退く途中は攻撃の手ほどきを畳み、到着したら元の段へ戻す。 */
html body #hud.safety-travel #tutorial { display:none !important; }
/* 操作文も任務文も隠れた札は、空の下地ごと畳む。 */
html body #hud.compact-battle #battle-notices #objectives.has-action:not(.keep-combat-task):not(.expand):has(.battle-action[hidden]) { display:block !important; }

/* 接敵中は読む必要のある指図と危険を残し、周辺の大きな下地を畳む。 */
html body #hud.combat-focus:not(.army-peek) :is(#armybar,.tl .plaque) { visibility:hidden; }
html body #hud.combat-focus #compass { background:linear-gradient(90deg,transparent,rgba(20,18,15,.45),transparent); }
html body #hud.combat-focus:not(.hc) .bl #h-hp.hp {
  padding:6px 8px; background:#14120f; box-shadow:0 0 0 2px #14120f;
}
html body #hud.combat-focus .bl #h-hp.hp i { height:22px !important; border-width:2px; }
html body #hud.combat-focus:not(.hc) #battle-notices #objectives:not(.expand) {
  padding:6px 8px !important; box-shadow:none !important;
}
html body #hud:is(.single-guide,.compact-battle) #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 短い行動札は文字の幅に収め、携帯の戦場を広く残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) > #objectives:not(.expand) {
  width:fit-content !important; min-width:44px !important; min-height:44px !important;
  max-width:min(320px, 36vw) !important; align-self:flex-start;
}
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.travel-retreat.ground-order:not(.expand) {
  background:#14120f !important; box-shadow:0 0 0 2px #14120f !important;
  max-width:min(272px, 40vw) !important;
}
html body #hud.single-guide #battle-notices #objectives.travel-retreat.ground-order:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
}
html body #hud.combat-focus #markers .mk.main.flag-goal:not(.edge) b {
  font-size:max(18px, calc(20px * var(--text-scale, 1))) !important; white-space:normal;
}


#hud .guard-caption { display:inline-flex; align-items:center; justify-content:center; gap:8px; }
#hud .guard-sign { display:inline-block; position:relative; flex:none; width:26px; height:32px; background:#fff3ba; clip-path:polygon(0 0,100% 0,100% 60%,50% 100%,0 60%); }
#hud .guard-sign::after { content:''; position:absolute; left:6px; right:6px; top:8px; height:17px; background:linear-gradient(#14120f,#14120f) center/4px 100% no-repeat,linear-gradient(#14120f,#14120f) center 5px/100% 4px no-repeat; }
/* 説明と指・動作の絵を、実際に押せる一枚の枠へ収める。 */
#hud #wait-guard { position:absolute; right:calc(16px + env(safe-area-inset-right, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:156px; height:auto; min-height:80px; box-sizing:border-box; padding:8px; border:5px solid #fff3ba; border-radius:12px; background:rgba(20,18,15,.85); color:#fff3ba; box-shadow:0 0 0 3px #14120f; display:flex; flex-wrap:wrap; column-gap:12px; align-items:center; justify-content:center; font:800 16px/1.4 var(--ui); white-space:pre-line; pointer-events:auto; touch-action:none; user-select:none; cursor:pointer; }
#hud #wait-guard svg { width:44px; height:56px; flex:none; pointer-events:none; }
#hud #wait-guard svg:first-child { position:relative; z-index:1; margin-right:-48px; transform:translate(8px, 7px) scale(.72); }
/* 手と文字を実際に長押しする枠に収め、押す位置を一致させる。 */
html.touch #hud #wait-guard { top:auto; bottom:calc(128px + env(safe-area-inset-bottom, 0px)); display:grid; grid-template-columns:40px minmax(0, 1fr) 28px; width:264px; max-width:calc(100vw - 32px); min-height:80px; border-width:4px; border-radius:16px; column-gap:8px; row-gap:4px; background:#373326; box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f; }
html.touch #hud #wait-guard svg:first-child { display:block; grid-column:1; grid-row:1 / 3; width:40px; height:52px; margin:0; transform:none; }
html.touch #hud #wait-guard svg + svg { display:block; grid-column:3; grid-row:1 / 3; width:28px; height:36px; }
#hud #wait-guard .release-sign { display:none; }
#hud #wait-guard.release-ready .release-sign { display:block; }
#hud #wait-guard.release-ready .shield-sign { display:none; }
#hud #wait-guard.release-ready { border-style:double; border-width:6px; background:#14120f; }
#hud #wait-guard.release-ready .swipe-hand { transform:translateY(-10px); }
html.touch #hud #wait-guard span { grid-column:2; width:auto; font-size:max(18px,calc(18px * var(--text-scale,1))); white-space:pre-line; word-break:keep-all; overflow-wrap:normal; }
html.touch #hud #wait-guard small { grid-column:2; width:auto; white-space:normal; word-break:keep-all; overflow-wrap:normal; font-size:max(15px,calc(15px * var(--text-scale,1))); }
#hud #wait-guard span { position:static; width:100%; padding:0; pointer-events:none; }
#hud #wait-guard small { position:static; width:100%; padding:0; font:700 max(18px,calc(18px * var(--text-scale,1)))/1.4 var(--ui); pointer-events:none; }
html.tc-sw #hud #wait-guard :is(span,small) { right:auto; left:0; }
#hud #wait-guard small:empty { display:none; }
#hud #wait-guard.guard-now { border-color:#fff; background:#49372a; box-shadow:0 0 0 3px #14120f,0 0 0 6px #fff3ba; }
#hud #wait-guard .hold-progress { stroke-dasharray:113.1; stroke-dashoffset:calc(113.1 * (1 - var(--hold-progress, 0))); transform:rotate(-90deg); transform-origin:0 -12px; }
#hud #wait-guard .guard-meter { display:none; grid-column:1 / -1; grid-row:3; height:4px; border:2px solid #fff; background:#14120f; overflow:hidden; pointer-events:none; }
#hud #wait-guard[aria-pressed="true"] .guard-meter { display:block; }
#hud #wait-guard .guard-meter b { display:block; height:100%; background:#fff3ba; transform:scaleX(var(--hold-progress,0)); transform-origin:left; }
html body #hud.retreat-priority :is(#crosshair,#staring,.stamina-cue,.combat-cue-label) { visibility:hidden !important; }
html body #hud.retreat-priority #objectives:not(.expand) .obj-now { font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; }
#hud #wait-guard[aria-pressed="true"] { box-shadow:0 0 0 3px #14120f, inset 0 3px 0 #14120f; background:#373326; }
html body #hud #wait-guard[aria-pressed="true"] { border-style:double; border-width:6px; border-color:#fff; }
html.touch #hud #wait-guard:active { box-shadow:0 0 0 3px #14120f, inset 0 4px 0 #14120f; background:#493f2c; }
#hud #wait-guard:focus-visible { outline:3px solid #fff3ba; outline-offset:5px; }
html.touch body #hud.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand):not(.keep-guard-task),
html body #hud.dodge-active #battle-notices #objectives:not(.expand) { display:none !important; }
/* なぞる間は操作を一か所に集め、上の指示と行き先の印を重ねない。 */
html body #hud:is(.touch-turn-coach,.dodge-turn-coach) #battle-notices:not(.choosing) { visibility:hidden !important; pointer-events:none !important; }
#hud .escape-gesture .swipe-hand { animation: practiceSwipe 1.6s ease-in-out infinite; }
@keyframes practiceSwipe { 0%,15% { transform:translate(0,0); } 70%,100% { transform:translate(var(--swipe-shift,64px),var(--swipe-rise,0px)); } }
body.rm #hud .escape-gesture .swipe-hand { animation:none; }
@media(prefers-reduced-motion:reduce) { #hud .escape-gesture .swipe-hand { animation:none; } }

html body #hud.touch-turn-coach #markers { visibility:hidden !important; }
/* 構えは押している釦で示す。中央の盾と気力の輪を重ねて兵を隠さない。 */
html body #hud.wait-guard-active #crosshair.guard:not(.hit) { visibility:hidden !important; }
html body #hud.wait-guard-active #staring {
 left:calc(100% - 202px - env(safe-area-inset-right, 0px)) !important;
 top:calc(100% - 158px - env(safe-area-inset-bottom, 0px)) !important;
}
html body #hud.wait-guard-active .stamina-cue {
 left:calc(100% - 202px - env(safe-area-inset-right, 0px)) !important;
 top:calc(100% - 120px - env(safe-area-inset-bottom, 0px)) !important;
}
/* 押せない待機札は角形一枚。構える操作は元の操作欄に残す。 */
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) {
 display:block; min-height:0; width:auto; padding:8px 14px; border:0;
 border-left:4px solid #fff; border-radius:0; background:#14120f;
 box-shadow:none; pointer-events:none; cursor:default; opacity:1;
}
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) svg { display:none; }
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
#hud #wait-guard[hidden] { display:none; }
/* 決まった待ち時間だけ、残り秒数と実際の進みに合う輪を任務の中へ。 */
html body #hud #objectives.timed-wait:not(.expand) li.cur .obj-now::before {
 content:''; display:inline-block; width:28px; height:28px; margin-right:8px;
 border:0; border-radius:50%; vertical-align:middle;
 background:conic-gradient(#fff3ba var(--wait-progress, 0%), #655f50 0);
 mask:radial-gradient(transparent 48%, #000 52%);
}

html.tc-sw #hud #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
html body #hud.shitaragahara.pursuit-order.pursuit-order #battle-notices:not(.choosing) #objectives:not(.expand):not(.ground-order) {
 position:fixed !important; left:50% !important; top:16px !important; right:auto !important; bottom:auto !important;
 transform:translateX(-50%) !important; width:max-content !important; max-width:36vw !important;
}
/* 追撃の札は道の先端の旗と一組にし、携帯でも読める字を保つ。 */
html body #hud.shitaragahara.pursuit-order #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 transform:none !important; width:max-content !important; max-width:min(280px,36vw) !important;
}
html body #hud.shitaragahara.pursuit-order #battle-notices #objectives.ground-order:not(.expand) li.cur :is(.obj-now,.obj-text) {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important;
}
/* 設楽原の携帯横画面では、寄せ手を隠さず親指の届く下端で構える。 */
@media (max-height:500px) {
 html.touch body #hud.shitaragahara #wait-guard {
  top:auto; left:auto; right:calc(16px + env(safe-area-inset-right, 0px)); bottom:calc(16px + env(safe-area-inset-bottom, 0px)); width:240px; height:auto; min-height:72px;
  grid-template-rows:auto auto; align-content:center;
  grid-template-columns:40px minmax(0, 1fr); column-gap:8px; row-gap:2px; padding:6px; border-width:4px; border-radius:14px;
 }
 html.touch body #hud.shitaragahara #wait-guard svg:first-child { width:40px; height:52px; }
 html.touch body #hud.shitaragahara #wait-guard svg + svg { display:none; }
 html.touch body #hud.shitaragahara #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
 html.touch body #hud.shitaragahara #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
 html.touch.tc-sw body #hud.shitaragahara #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
}
html body #hud #wait-guard.guard-travel { opacity:1; border:0; box-shadow:none; background:#14120f; cursor:default; }
html body #hud #wait-guard.guard-travel svg { visibility:hidden; }
html.touch body #hud #wait-guard.guard-travel.wait-status:disabled:not([hidden]) { padding-left:48px; }
html body #hud #wait-guard.guard-travel::before { content:'◎'; position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:28px; color:#fff; }
/* 合戦共通の長押し札は端へ固定し、手の絵と操作を一枚で示す。 */
@media (max-height:500px) {
 html.touch body #hud.single-guide #wait-guard {
  top:auto; left:auto; right:calc(16px + env(safe-area-inset-right, 0px));
  bottom:calc(16px + env(safe-area-inset-bottom, 0px));
  width:240px; min-height:72px; height:max-content; padding:6px; border-width:4px;
  box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f;
  grid-template-columns:40px minmax(0,1fr); grid-template-rows:auto auto;
  align-content:center; column-gap:8px; row-gap:0;
 }
 html.touch body #hud.single-guide #wait-guard svg:first-child { width:40px; height:52px; }
 html.touch body #hud.single-guide #wait-guard svg + svg { display:none; }
 html.touch body #hud.single-guide #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
 html.touch body #hud.single-guide #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
 html.touch body #hud.single-guide #wait-guard[aria-pressed="true"] {
  border:6px double #fff; border-radius:24px;
  box-shadow:0 0 0 3px #14120f, inset 0 6px 0 #14120f;
 }
 html.touch.tc-sw body #hud.single-guide #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
 html.touch body #hud.single-guide #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
/* 岩村の柵と切岸は中央を空け、守る釦を親指の届く端へ固定する。 */
html.touch body #hud.iwamura #wait-guard {
 left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 top:auto !important; bottom:calc(24px + env(safe-area-inset-bottom, 0px));
 width:208px; min-height:64px; padding:6px; border-width:2px; border-radius:8px;
 grid-template-columns:24px minmax(0, 1fr); column-gap:8px; row-gap:2px;
}
html.tc-sw.touch body #hud.iwamura #wait-guard {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
 bottom:calc(154px + env(safe-area-inset-bottom, 0px)); /* 左下の命と傷の札も空ける。 */
}
html.touch body #hud.iwamura #wait-guard svg:first-child { width:24px; height:36px; }
html.touch body #hud.iwamura #wait-guard svg + svg { display:none; }
html.touch body #hud.iwamura #wait-guard span { font-size:max(16px,calc(16px * var(--text-scale,1))); }
html.touch body #hud.iwamura #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
html body:has(#wait-guard:not([hidden]):not(:disabled)) #tc [data-b="grd"] { visibility:hidden; }
/* 守備の操作は親指の届く端に固定し、指の印と押す枠を一つにする。 */
html.touch body #hud #wait-guard.ground-hold:not([hidden]) {
 left:auto !important; top:auto !important;
 right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important; width:196px; min-height:64px; height:auto;
 display:grid; grid-template-columns:28px minmax(0,1fr); grid-template-rows:auto auto;
 padding:6px; gap:2px 8px; border-width:3px; border-radius:10px;
}
html.touch.tc-sw body #hud #wait-guard.ground-hold:not([hidden]) { right:auto !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important; }
html.touch body #hud #wait-guard.ground-hold svg:first-child { display:block; width:28px; height:40px; margin:0; transform:none; }
html.touch body #hud #wait-guard.ground-hold svg + svg { display:none; }
html.touch body #hud #wait-guard.ground-hold span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
html.touch body #hud #wait-guard.ground-hold small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
/* 防御中も敵の体を透かして見る。頭上と照準の印は小さな中空の形へそろえる。 */
#hud #crosshair.guard:not(.hit)::after { inset:3px 4px 1px; border:2px solid #eee6ce; border-radius:3px 3px 8px 8px; background:none; clip-path:none; filter:none; box-shadow:0 0 0 1px #14120f; }
/* 防ぐ札は欄の高さ制限で切らず、実寸を測って画面内へ収める。 */
html body #hud.guard-button-help #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 max-height:none !important; overflow:visible !important;
}
html body #hud.guard-button-help #battle-notices #objectives:not(.expand):not(.keep-guard-task):has(.guard-action-button) {
 position:fixed !important; inset:auto !important; left:var(--guard-order-x, 96px) !important; top:var(--guard-order-y, 80px) !important;
 width:max-content !important; max-width:calc(100vw - 24px) !important; min-height:0 !important; padding:0 !important;
 background:none !important; border:0 !important; box-shadow:none !important; overflow:visible !important;
}
html body #hud.guard-button-help #objectives:not(.expand):not(.keep-guard-task):has(.guard-action-button) > :not(.battle-action) { display:none !important; }
#hud.guard-button-help .battle-action { margin:0; padding:0; }
html body #hud.combat-instruction #battle-notices #objectives:not(.expand) {
 position:fixed !important; inset:auto !important; left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important; top:16px !important;
 width:max-content !important; max-width:min(300px, calc(100vw - 120px)) !important; max-height:none !important; overflow:visible !important;
}
html body #hud.combat-instruction #objectives:not(.keep-combat-task):not(.keep-guard-task):not(.expand) > :not(.battle-action),
html body #hud.combat-instruction #markers,
#hud.combat-instruction .battle-action.guard-action::before { display:none !important; }
/* 接敵時は任務の長文を畳み、今必要な操作一つだけを大きく読む。 */
html body #hud #battle-notices #objectives.immediate-action.has-action:not(.expand) > :not(.battle-action) { display:none !important; }
html body #hud #battle-notices #objectives.immediate-action.has-action:not(.expand) .battle-action:not([hidden]) {
 display:block !important; font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4;
}
html.touch body #hud.honnoji #battle-notices #objectives.ground-order:not(.expand) li.cur .obj-now {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
}

#hud.melee-guide #crosshair { visibility:hidden; }
/* 気力の輪は頭上の盾から離す。照準は狙いの位置を保つ。 */
#hud.guard-guide #staring { left:calc(50% - 100px); top:calc(50% + 64px); }
#hud.guard-guide .stamina-cue { left:calc(50% - 108px) !important; top:calc(50% + 88px) !important; }
/* 反撃は一行で読み、指の印は実際の攻撃ボタンへ置く。 */
html.touch.tc-low body #hud #battle-notices #objectives.attack-help:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 112px) !important; min-height:44px !important;
}
html.touch body #hud .battle-action.attack-action {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; white-space:nowrap; overflow-wrap:normal;
}

/* 箕作の携帯横向きは小地図の左へ収め、人数の条件まで札の中で折り返す。 */
@media (max-height:500px) {
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing),
  html.touch body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:auto !important; right:calc(104px + env(safe-area-inset-right, 0px)) !important;
    top:calc(16px + env(safe-area-inset-top, 0px)) !important;
    width:min(300px, 34vw) !important; min-width:0 !important;
    max-height:33vh !important; box-sizing:border-box;
  }
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; min-width:0 !important; max-width:100% !important; box-sizing:border-box;
  }
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    min-width:0 !important; max-width:100% !important; width:auto !important;
    white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
    height:auto !important; max-height:none !important; overflow:visible !important;
    font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
  }
}

/* 畳んだ任務は本文一列。隠した状態欄や幅ゼロの伸縮欄へ本文を押し込まない。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
  display:block !important; grid-template-columns:minmax(0, 1fr); min-width:0;
  margin:0; padding:0; background:none; box-shadow:none; text-align:left;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-text {
  display:block; grid-column:1 / -1; width:auto; min-width:0; flex:1 1 auto !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-now {
  display:block; writing-mode:horizontal-tb; white-space:normal; overflow-wrap:break-word;
}
/* 常設の札は墨の端を抜いた帯へ。文字は濃い部分に収め、末尾の余白だけ透かす。 */
html body #hud:not(.guard-guide):not(.flag-guide):not(.person-guide) #battle-notices:not(.choosing) #objectives:not(.expand):not(.ground-order) {
  width:fit-content !important; max-width:100% !important; min-height:44px;
  align-self:flex-start; padding:6px 28px 6px 10px !important;
  background:linear-gradient(90deg,rgba(20,18,15,.9),rgba(20,18,15,.84) calc(100% - 24px),transparent) !important;
  border:0; border-left:1px solid #b8a273; border-radius:0; box-shadow:none !important;
}
html body #hud:is(.single-guide,.compact-battle) #battle-notices #objectives:not(.expand):not(.keep-combat-task) :is(li.cur,.obj-text,.obj-now) {
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.45 !important;
}
/* 詳しい年月日は開戦前へ移し、戦の中は今することに場所を空ける。 */
html body #hud.single-guide #dateline { display:none !important; }

`;
    // 任務札は本文の幅で止める。種別や補足が本文を一文字幅へ押す二列組みを共通で解く。
    // 開いた一覧・選択中の札は従来のまま、普段の下知だけを薄い帯にする。
    style.textContent += `
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) {
  width:fit-content !important; max-width:100% !important; min-width:44px !important;
  align-self:flex-start; box-sizing:border-box;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur {
  display:block !important; width:auto !important; min-width:0 !important;
  height:auto !important; max-height:none !important; box-sizing:border-box;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
  display:block; width:auto !important; min-width:0 !important; max-width:100% !important;
  position:static !important; inset:auto !important; transform:none !important;
  float:none !important; writing-mode:horizontal-tb !important;
  white-space:normal !important; overflow-wrap:anywhere; word-break:normal;
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small {
  width:auto !important; min-width:0; max-width:100%; box-sizing:border-box;
}
/* 墨の抜けは末尾の二十四画素だけ。長文も折り返し、文字の下地の濃さは保つ。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) {
  background:linear-gradient(90deg,rgba(20,18,15,.9),rgba(20,18,15,.84) calc(100% - 24px),transparent) !important;
  box-shadow:none !important; border:0; border-inline-start:1px solid var(--kin); border-radius:0;
  padding:6px 28px 6px 10px !important;
  /* 後段の行ごとの下地と併用し、透けた所でも字の輪郭を保つ。 */
  text-shadow:-1px -1px #080706, 1px -1px #080706, -1px 1px #080706, 1px 1px #080706, 0 2px #080706 !important;
}
/* 本文側の影なし指定にも同じ縁を渡し、補足と操作の字も明るい空に埋もれさせない。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) * {
  text-shadow:inherit !important;
}
`;
    style.textContent += `
/* 全戦共通。中央を空け、墨は文字の周りだけに留める。拡大文字と任務一覧は維持する。 */
html body #hud:not(.hc) #battle-notices:not(.choosing) {
 width:min(300px, 30vw) !important; max-height:30vh !important; gap:4px;
}
html body #hud:not(.hc) #battle-notices :is(#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) {
 background:rgba(12,10,8,.74) !important; color:#fff3df;
 padding:4px 8px !important; border-radius:2px; box-shadow:none !important;
 text-shadow:0 1px 2px #000, 1px 0 1px #000;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action),
html body #hud:not(.hc) #battle-notices:not(.choosing) :is(#tutorial,#subtitle,.battle-notice) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 常設の指図は行ごとの墨にする。折り返しの右や押せる余白には戦場を残す。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) {
 background:none !important; border:0; padding:4px 6px !important;
 min-height:44px; border-radius:0;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 font-weight:600 !important; line-height:1.65 !important;
}
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur .obj-now {
 display:inline !important; padding:2px 5px;
 background:rgba(12,10,8,.8); color:#fff3df;
 -webkit-box-decoration-break:clone; box-decoration-break:clone;
 text-shadow:0 1px 2px #000;
}
html body #hud #battle-notices #objectives > #tutorial:not([hidden]):not(.notice-muted) {
 display:block !important; background:none !important; border:0; padding:4px 0 0 !important;
 min-height:0; box-shadow:none !important;
}
html body #hud #battle-notices #objectives > #tutorial :is(.lbl,.how) {
 display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
}
html body #hud #battle-notices #objectives > #tutorial :is(.what,.how) { margin:2px 0 0; }
html body #hud #battle-notices #objectives > #tutorial .lbl { display:none !important; }
html body #hud:not(.hc) #battle-notices .battle-notice.warn { color:#ffcf7a; }
/* 常設の任務は黒い一枚板にせず、折り返した文字の行だけに墨を敷く。
   押せる外枠と全文の折り返しは保ち、行末と行間から戦場を見せる。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:none !important; border:0 !important; box-shadow:none !important;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .obj-now,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 display:inline !important; background:rgba(12,10,8,.88);
 padding:2px 4px; -webkit-box-decoration-break:clone; box-decoration-break:clone;
 line-height:1.7 !important;
}
/* 補足と手ほどきにも下地を残す。非表示の説明を表示し直さない。 */
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) > #tutorial:not([hidden]):not(.notice-muted) {
 background:rgba(12,10,8,.88) !important;
}
/* 字幕の旧来の携帯指定にも同じ小さな下地を適用する。 */
html.touch.tc-low body #hud:not(.hc) #battle-notices #battle-message > div#subtitle,
html body #hud:not(.hc) #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
 background:rgba(12,10,8,.74) !important; padding:4px 8px !important;
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 共通の案内板は横幅を保ち、接敵中は今の指図だけを二行に収める。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
 min-width:220px !important; box-sizing:border-box;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(h4,li:not(.cur),.tag,small,.obj-full,.victory-condition,.opb),
html body #hud.combat-brief #battle-notices #objectives:not(.expand) > #tutorial:not([hidden]):not(.notice-muted) {
 display:none !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:none !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) li.cur {
 display:block !important; margin:0 !important; padding:0 !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
 display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2;
 line-clamp:2; line-height:1.4 !important; max-height:2.8em !important;
 overflow:hidden !important; white-space:normal !important;
}
/* 箕作の人数条件は二行で切らない。携帯横向きでも閉じ括弧まで読む。 */
@media (max-height:500px) {
 html body #hud.mitsukuri.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
  height:auto !important; max-height:none !important; overflow:visible !important;
 }
}

`;
    style.textContent += `
/* 畳んだ札に、一覧用の絶対位置と本文を持ち越さない。距離は本文の次の行へ置く。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
 position:static !important; inset:auto !important; transform:none !important;
 float:none !important; columns:auto !important; writing-mode:horizontal-tb !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-full {
 display:none !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place {
 display:block; margin:2px 0 0 !important; line-height:1.4 !important;
}
/* 城下では案内札と台詞を八つ分離し、名前と本文を左揃えで読む。 */
html body #hud.town #battle-notices:not(.choosing),
html.touch.tc-low body #hud.town #battle-notices:not(.choosing) {
 display:flex !important; flex-direction:column !important; gap:8px !important;
 max-height:calc(100% - 172px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
}
html body #hud.town #battle-notices #battle-message > #subtitle,
html.touch.tc-low body #hud.town #battle-notices #battle-message > #subtitle {
 width:100% !important; text-align:left !important; text-indent:0 !important;
}
html body #hud.town #battle-notices #battle-message #subtitle .sp,
html.touch.tc-low body #hud.town #battle-notices #battle-message #subtitle .sp {
 display:block !important; margin:0 0 4px !important;
}
#hud.town #battle-notices #battle-message #subtitle .town-sentence {
 display:block !important; white-space:normal !important;
}
/* 頭上の盾を出しても、指示と操作は共通の札に残す。 */
html body #hud.single-guide:is(.guard-guide,.flag-guide,.person-guide) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list {
 display:block !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:none !important;
}
/* 戦の指示は同じ場所で読む。印への追従と、戦闘中の操作説明の省略を止める。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:44px !important; max-width:100% !important;
 min-height:44px !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
 display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
 max-height:none !important; overflow:visible !important; line-height:1.4 !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) small {
 display:block !important; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 line-height:1.4 !important; margin-top:4px;
}
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; right:auto !important;
  top:calc(48px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
  width:300px !important; max-width:calc(100vw - 232px) !important;
  max-height:30vh !important;
 }
}
`;
    style.textContent += `
/* 行動がある時は同じ任務を繰り返さず、一枚の札にする。 */
html body #hud #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
 display:none !important;
}
/* 操作の助言がない時も、今することを一枚残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(:has(.battle-action:not([hidden]))) #obj-list,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(:has(.battle-action:not([hidden]))) #obj-list li.cur .obj-text {
 display:block !important;
}
/* 戦う一人を示した時も、既存の任務札に短い行動を必ず残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list li.cur,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list li.cur .obj-text {
 display:block !important;
}
/* 話す札は頭上の吹き出しにつなぎ、遠い相手との対応を保つ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.talk-order:not(.expand) {
 position:fixed !important; left:var(--talk-order-x) !important; top:var(--talk-order-y) !important;
 right:auto !important; bottom:auto !important; transform:translate(-50%, -100%) !important;
 width:max-content !important; max-width:min(240px, 40vw) !important;
}
html body #hud.edge-destination #battle-notices:not(.choosing) #objectives:not(.expand),
html body #hud.talk-located #battle-notices:not(.choosing) #objectives:not(.expand),
html body #hud.single-guide:has(#prompt.talk-target:not([hidden])) #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:none !important;
}
html body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 30vw) !important;
}
/* 反撃札は親の幅も広げる。携帯横でも末尾を折り返さない。 */
html.touch body #hud #battle-notices:not(.choosing):has(#objectives.attack-help:not(.expand)) {
 width:max-content !important; max-width:calc(100vw - 144px) !important;
 left:50% !important; right:auto !important; transform:translateX(-50%);
 overflow:visible !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) {
 width:max-content !important; max-width:100% !important; min-height:44px !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) .battle-action.attack-action:not([hidden]) {
 width:max-content !important; max-width:none !important; white-space:nowrap !important;
 overflow-wrap:normal !important; word-break:keep-all !important;
 font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
}
html.touch body #hud .battle-action.attack-action::before { content:'◎ '; color:#fff3ba; }
/* 敵の指図は相手のすぐ上へ。操作は同じ一枚の二行に収める。 */
html.touch body #hud.single-guide #battle-notices:not(.choosing):has(#objectives.enemy-order:not(.expand)) {
 transform:none !important; left:16px !important; right:auto !important;
}

html body #hud.single-guide #battle-notices:not(.choosing) #objectives.enemy-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 transform:none !important; width:max-content !important; max-width:min(260px, 38vw) !important;
}
html body #hud.single-guide #battle-notices #objectives.enemy-order.has-action:not(.expand) #obj-list { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.enemy-order .battle-action::before { content:none !important; }
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.enemy-order:not(.expand) .battle-action:not([hidden]) small {
 display:block !important; font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; white-space:normal !important;
}
/* 突く時は今の操作だけを読み、長い任務は札を開いた時に読む。 */
html body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) #obj-list { display:none !important; }
html body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) .battle-action.attack-action small {
 display:block !important; font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
}
html body #hud.single-guide .battle-action.attack-action::before { content:none !important; }
html body #hud.single-guide .battle-action.attack-action.spear-action::before {
 content:'' !important; display:inline-block; width:16px; height:32px; margin-right:8px; vertical-align:middle;
 background:#fff3ba; clip-path:polygon(50% 0,100% 38%,62% 52%,62% 100%,38% 100%,38% 52%,0 38%);
}
html.touch body #hud .battle-action.attack-action::before,
html.touch body #hud.single-guide .battle-action.attack-action.spear-action::before { content:none !important; }
/* 旗の指図と地上の旗を同じ切り込みの形で結ぶ。札は増やさない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.goal-flag-order:not(.expand) li.cur .obj-now::before {
 content:'' !important; display:inline-block !important; width:20px; height:28px;
 margin-right:8px; vertical-align:middle; border:0; border-radius:0;
 background:#fff3ba; clip-path:polygon(0 100%,0 0,100% 0,75% 21%,100% 43%,10% 43%,10% 100%);
}
`;
    style.textContent += `
/* 旗の案内は一枚の大きな札。地面の印のそばへ置き、一覧を開く広さも保つ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(420px, calc(100vw - 32px)) !important;
 min-height:44px !important;
}
/* 地面へ寄せる札の座標は画面を基準にし、親の移動を重ねない。 */
html body #hud #battle-notices:not(.choosing):has(#objectives.ground-order:not(.expand)) { transform:none !important; }
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order:not(.expand):not(.has-action) #obj-list li.cur .obj-now {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
 font-weight:800 !important; line-height:1.4 !important;
}
/* 今することを先に大きく読み、距離などの補足は次の行にまとめる。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; font-weight:800 !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; font-weight:800;
}
html body #hud.single-guide .bl #h-hp em { overflow-wrap:normal; word-break:keep-all; }
/* 移動中の札は同じ場所で読み、相手と同じ形の印で結ぶ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:is(.talk-order,.route-order):not(.ground-order):not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important; min-height:44px !important;
 padding:6px 8px !important; background:#14120f !important;
}
html body #hud.single-guide #battle-notices #objectives:is(.talk-order,.route-order):not(.expand) #obj-list li.cur .obj-now::before {
 content:'' !important; display:inline-block !important; width:28px; height:32px;
 margin-right:8px; vertical-align:middle; background:#fff3ba;
 clip-path:polygon(0 0,100% 0,100% 64%,64% 64%,50% 100%,42% 64%,0 64%);
}
/* 向きは戸口の矢印一つで示し、任務札に下向き矢印を重ねない。 */
html body #hud.single-guide #battle-notices #objectives.route-order:not(.expand) #obj-list li.cur .obj-now::before {
 content:none !important; display:none !important;
}
html body #hud.single-guide #battle-notices #objectives.talk-order:not(.expand) .destination-cue { display:none !important; }
/* 歩数の末尾を落とさず、大きな一行で読む。札は既存の一枚を使う。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 32px) !important;
}
html body #hud.single-guide #battle-notices #objectives.flag-travel-order:not(.expand) li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important; word-break:keep-all !important;
}
html body #hud.single-guide .bl #h-hp.hp { min-width:204px; box-sizing:border-box; }
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; top:calc(16px + env(safe-area-inset-top, 0px)) !important;
  width:300px !important; max-height:30vh !important;
 }
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}

`;
    // 有岡は場所を十二秒守る任務。操作の助言だけで下知と期限を隠さない。
    style.textContent += `
/* 傷の長い説明で列が広がり、命の棒と残りの数が札から出るのを防ぐ。 */
html body #hud.arioka .bl #h-hp.hp {
 grid-template-columns:minmax(0,1fr) max-content !important;
}
html body #hud.arioka .bl #h-hp.hp em {
 min-width:0; max-width:100%; overflow-wrap:anywhere; word-break:normal;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) {
 display:block !important; position:relative !important; inset:auto !important;
 transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text,
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
 display:block !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur :is(.obj-now,small),
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) .battle-action:not([hidden]) {
 height:auto !important; max-height:none !important; overflow:visible !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
 font-size:max(13px,calc(13px * var(--text-scale,1))) !important;
 /* 人数と期限の改行を保ち、数字と「人」「秒」を別の行へ割らない。 */
 white-space:pre-line !important; overflow-wrap:normal !important; word-break:keep-all !important;
}
@media (min-width:601px) and (max-height:500px) {
 html.touch body #hud.arioka #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(76px + env(safe-area-inset-left,0px)) !important; right:auto !important;
  width:280px !important; max-width:calc(100vw - 176px) !important;
  /* 退避中も下知と期限を収める。命の札と下の操作帯は空ける。 */
  max-height:min(52vh,calc(100% - var(--notice-top,60px) - env(safe-area-inset-top,0px) - max(104px,var(--notice-floor,104px)))) !important;
 }
}
`;
    style.textContent += `
/* 横の携帯でも大きな字と太い棒で、命と足のけがを一枚にまとめる。 */
html body #hud .bl #h-hp.hp {
 width:max(184px,calc(168px * var(--text-scale,1) + 16px)); min-width:0;
 gap:3px 8px; padding:5px 8px;
}
html body #hud .bl #h-hp.hp :is(span,.hp-remaining) {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important;
}
html body #hud .bl #h-hp.hp > span { display:none !important; }
html body #hud .bl #h-hp.hp .hp-remaining { grid-column:1 / -1; justify-self:start; }
html body #hud .bl #h-hp.hp i { height:18px !important; border-width:2px; }
html body #hud .bl #h-hp.hp em {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 white-space:normal; overflow-wrap:anywhere; word-break:normal;
}
html body #hud .bl #h-hp.hp em svg { width:28px; height:32px; }
html body #hud.single-guide .bl #h-hp.hp { min-width:0; }
body:has(#hud.retreat-priority) #tc .stick b { display:none !important; }
html body #hud #battle-notices #objectives.travel-retreat:not(.expand) #obj-list li.cur .retreat-caption {
 display:block !important; font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 line-height:1.4; white-space:nowrap;
}
html body #hud #battle-notices #objectives .retreat-caption:empty { display:none !important; }
html body #hud #battle-notices #objectives .retreat-gesture {
 display:inline-block; width:64px; height:64px; vertical-align:middle; margin-right:4px;
}
/* 札のすぐ下の指先が、実際になぞり始める場所。札は既存の一枚を使う。 */
html.touch body #hud #battle-notices #objectives.touch-retreat-coach:not(.expand) {
 overflow:visible !important;
}
html.touch body #hud #battle-notices #objectives.touch-retreat-coach:not(.expand) .retreat-caption {
 position:absolute !important; top:100% !important; left:calc(50% - 56px) !important;
 width:112px !important; height:112px !important; pointer-events:none !important;
}
html.touch body #hud #battle-notices #objectives.touch-retreat-coach:not(.expand) .retreat-gesture {
 width:112px !important; height:112px !important; margin:0 !important; pointer-events:none !important;
}
/* 元気な時は一行だけ。傷の説明も二行に収め、戦場を空ける。 */
html body #hud .bl:has(#h-hp.healthy) { width:max-content !important; min-width:0 !important; }
html body #hud .bl #h-hp.hp.healthy {
 width:max-content !important; min-width:0 !important; padding:3px 6px; background:rgba(20,18,15,.85);
}
html body #hud .bl #h-hp.hp.healthy .hp-remaining { font-size:max(22px,calc(22px * var(--text-scale,1))) !important; }
/* 命の残量は大きな数字と太い一本の棒で示す。 */
html body #hud .bl #h-hp.hp i { display:block !important; flex:none; width:184px; max-width:100%; min-width:0; height:22px !important; }
html body #hud .bl #h-hp.hp em {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important; line-height:1.35; white-space:normal;
}
/* 命とけがは細い一行にまとめ、足元と近い敵を空ける。 */
html body #hud .bl:has(#h-hp.hp) { width:max-content !important; min-width:0 !important; max-width:calc(100vw - 32px); }
html body #hud .bl #h-hp.hp,
html body #hud .bl #h-hp.hp.healthy {
 display:flex !important; flex-direction:column; align-items:flex-start; gap:4px; width:max-content !important;
 max-width:100%; min-width:0; padding:4px 8px; background:rgba(20,18,15,.88);
}
html body #hud .bl #h-hp.hp .hp-remaining {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important;
 line-height:1.3; white-space:nowrap;
}
html body #hud .bl #h-hp.hp em {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.4; white-space:nowrap; overflow-wrap:normal;
}
html body #hud .bl #h-hp.hp .hp-remaining { order:0; }
html body #hud .bl #h-hp.hp i { order:1; }
html body #hud .bl #h-hp.hp em { order:2; }
html body #hud .bl #h-hp.hp em::before { content:none; }
html body #hud .bl #h-hp.hp em small { display:block; }
html body #hud .bl #h-hp.hp em small::before { content:none; }
html body #hud .bl #h-hp.hp em svg { display:none; }
/* 軽いけがの退避中は、次の操作より命の数字を大きくしない。 */
html body #hud.retreat-priority .bl #h-hp.hp:not(.deep):not(.blood-loss) .hp-remaining {
 font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
}
/* 画面外の話し相手は名前と矢印の一枚へまとめる。 */
html body #hud #battle-notices #objectives:not(.expand) .obj-now .task-phrase { display:inline-block; white-space:nowrap; }
html body #hud:is(.talk-located,.talk-ready) #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; }
/* 退く下知は画面端でも旗のすぐ上。元の任務欄へ置き去りにしない。 */
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(272px,40vw) !important;
 min-height:44px !important; padding:6px 10px !important; background:#14120f !important;
}
/* 退く案内は二行にまとめ、携帯でも末尾の一字を折り返さない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; font-size:max(22px,calc(22px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:normal !important; overflow-wrap:normal !important;
 word-break:normal !important; padding:0 !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) #obj-list li.cur .retreat-caption {
 display:block !important; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.5 !important; white-space:normal; word-break:auto-phrase;
}
html body #hud.single-guide #battle-notices #objectives.travel-retreat.destination-sign:not(.expand) li.cur > small {
 display:none !important;
}
/* 今の札に指と矢印を添える。触れた指は背後の見回す操作へ通す。 */
html.touch body #hud #battle-notices:not(.choosing) #objectives.turn-coach:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--turn-coach-x) !important; top:var(--turn-coach-y) !important;
 width:240px !important; max-width:40vw !important; min-height:44px !important;
 padding:6px 10px !important; background:#14120f !important; pointer-events:none !important;
}
html.touch body #hud #battle-notices #objectives.turn-coach:not(.expand) .battle-action {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; color:#fff3ba;
}
#hud #objectives.turn-coach .battle-action::before { display:none !important; }
html.touch body #hud #objectives.turn-coach:not(.expand) * { pointer-events:none !important; }
#hud .turn-gesture { display:block; width:200px; max-width:100%; height:82px; margin:4px auto 0; pointer-events:none; }
/* 矢印と既存の任務札を一組にする。親の欄の幅や位置を引き継がない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px,40vw) !important;
 min-height:44px !important; padding:6px 10px !important; transform:none !important;
}
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; font-weight:900 !important; line-height:1.3 !important;
}
html body #hud #battle-notices #objectives.linked-destination:not(.expand) :is(li.cur small,.obj-tag) { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) li.cur :is(.obj-full,.tag) { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) li.cur .obj-now { white-space:nowrap !important; }
html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice),
html.touch body #hud #battle-notices #battle-message > .battle-notice.warn {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
}
/* 横向きの携帯では会話を二十の字で読む。既存の一枠を使う。 */
@media (max-height:500px) and (orientation:landscape) {
 html body #hud #battle-notices #battle-message > div#subtitle,
 html.touch body #hud #battle-notices #battle-message > div#subtitle,
 html.touch.tc-low body #hud #battle-notices #battle-message > div#subtitle {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
  line-height:1.4 !important; background:#14120f !important;
 }
}
/* 家の札は戸口の旗の横へ置き、屋根の上へ戻さない。操作の広さは保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives.work-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--work-order-x) !important; top:var(--work-order-y) !important;
 width:max-content !important; max-width:min(200px,30vw) !important;
 min-height:44px !important; max-height:none !important; margin:0 !important;
}
html body #hud #battle-notices #objectives.work-order:not(.expand) li.cur small { display:none !important; }
/* 天王寺の退避も任務欄で読む。地面の印へ札を移して補足や距離を切らない。 */
@media (max-height:500px) {
 html body #hud.tennoji.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.tennoji #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 142px) !important; right:auto !important;
  top:calc(20px + env(safe-area-inset-top,0px)) !important; bottom:auto !important;
  width:284px !important; max-width:calc(100vw - 232px) !important;
  max-height:calc(100% - 164px) !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand),
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; min-width:44px !important;
  height:auto !important; max-height:none !important; overflow:visible !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
  height:auto !important; max-height:none !important; overflow:visible !important;
  white-space:normal !important; -webkit-line-clamp:unset !important; line-clamp:unset !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur :is(.goal-place,.retreat-caption) {
  display:none !important;
 }
}
`;
    style.textContent += `
/* 下馬の釦と手当てへ進む案内を、既存の任務一枚にまとめる。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]):has(.dismount-action) {
 display:block !important; padding:0 !important; background:none !important;
}
html body #hud #objectives .battle-action:has(.dismount-action)::before { content:none !important; }
html:root body #hud #battle-notices:not(.choosing) #objectives:not(.expand):has(.dismount-action) #obj-list,
html:root body #hud #battle-notices:not(.choosing) #objectives:not(.expand):has(.dismount-action) li.cur .obj-text,
html:root body #hud #battle-notices:not(.choosing) #objectives:not(.expand):has(.dismount-action) li.cur .obj-now {
 display:block !important;
}
/* 護衛と入口の案内は既存の任務一枚だけを印のそばに置く。 */
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur .obj-text,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; visibility:visible !important;
}
#hud .obj-now .guard-sign { width:22px; height:26px; margin-right:8px; vertical-align:middle; }
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) .battle-action { display:none !important; }
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 background:#14120f !important; padding:6px 10px !important;
}
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) #obj-list li.cur :is(.obj-full,.goal-place,.obj-cue,.tag) { display:none !important; }
/* 本文がない間は、枠と下地も出さない。 */
html:root body #hud #battle-notices #objectives.empty-task { display:none !important; }
html body #hud #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 30vw) !important;
}
@media (max-height:500px) {
 html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
    style.textContent += `
/* 向く場所と指の絵を任務一枚に収める。補足も携帯で読める大きさにする。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place.facing-help {
 display:block !important; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 white-space:normal !important; line-height:1.4 !important;
}
#hud.map-guidance #minimap { display:none !important; }
#hud .approach-gesture { display:block; width:112px; height:64px; margin:0 auto; pointer-events:none; }
#hud .facing-gesture { display:block; width:80px; height:34px; margin:4px 0; pointer-events:none; }
@media (max-height:500px) {
 html body #hud #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
  min-height:44px !important; padding:4px 8px !important; max-width:min(280px,34vw) !important;
 }
 html body #hud #battle-notices:not(.choosing) #objectives.linked-destination:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
    style.textContent += `
/* 退く案内は既存の一枚を端へ置く。押せる高さは残す。 */
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign.compact-steps:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 24px) !important;
 min-height:44px !important; padding:6px 10px !important;
}
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign.compact-steps:not(.expand) #obj-list li.cur .obj-now {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:nowrap !important;
}
#hud .step-count { display:inline !important; white-space:nowrap !important; }
html body #hud #battle-notices:not(.choosing) #objectives.compact-steps:not(.expand) .obj-now {
 white-space:nowrap !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--facing-order-x) !important; top:var(--facing-order-y) !important;
 width:176px !important; max-width:calc(50vw - 24px) !important;
 min-height:44px !important; max-height:none !important;
 padding:6px 8px !important; box-sizing:border-box;
 border:0 !important; border-radius:6px; background:#14120f !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order:not(.expand),
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order:not(.expand) * { pointer-events:none !important; }
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order.facing-left:not(.expand) {
 left:var(--facing-order-x) !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order:not(.expand) .goal-place {
 display:none !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.facing-order:not(.expand) .obj-now {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
/* 接近の札は画面の端へ寄せ、一つの短い操作文にする。 */
html:root body #hud #battle-notices:not(.choosing) #objectives.approach-order.has-action:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--approach-order-x,16px) !important; top:var(--approach-order-y,80px) !important;
 width:max-content !important; min-width:44px !important; max-width:min(240px,32vw) !important;
 height:auto !important; min-height:44px !important; max-height:none !important;
 padding:6px 10px !important; margin:0 !important; box-sizing:border-box;
 background:#14120f !important;
}
html:root body #hud #battle-notices #objectives.approach-order.has-action:not(.expand) > :not(.battle-action) { display:none !important; }
html:root body #hud #battle-notices:not(.choosing) #objectives.approach-order.has-action:not(.expand) #obj-list {
 display:none !important;
}
html:root body #hud #battle-notices #objectives.approach-order.has-action:not(.expand) .battle-action:not([hidden]) {
 width:auto !important; height:auto !important; min-height:0 !important;
 margin:0 !important; padding:0 !important; font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 line-height:1.4 !important;
}
`;
    style.textContent += `
/* 鳥取は操作中も岸・柵の任務を同じ幅で読む。横一杯の黒帯を作らない。 */
@media (max-height:500px) {
 html body #hud.tottori.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; right:auto !important;
  top:calc(16px + env(safe-area-inset-top,0px)) !important; bottom:auto !important;
  width:300px !important; max-width:calc(100vw - 176px) !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) > #objectives:not(.expand) {
  min-width:0 !important; max-width:100% !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives.has-action.keep-combat-task:not(.expand):has(.battle-action:not([hidden])) > #obj-list,
 html body #hud.tottori #battle-notices:not(.choosing) #objectives.has-action.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
  display:block !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  width:auto !important; min-width:0 !important; max-width:100% !important;
  box-sizing:border-box; white-space:normal !important; overflow-wrap:anywhere;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) li.cur > small {
  font-size:max(13px,calc(13px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
    style.textContent += `
/* 守る操作は押せる札へ集め、同じ案内を任務欄へ重ねない。 */
html.touch body #hud.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand):not(.keep-guard-task) {
 display:none !important;
}
/* 一行の任務に空の高さを残さず、字と押せる高さを保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
 height:auto !important; min-height:44px !important; padding:6px 10px !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list {
 height:auto !important; min-height:44px !important; min-width:44px; box-sizing:border-box; margin:0 !important; padding:0 !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur {
 height:auto !important; min-height:0 !important; margin:0 !important; padding:0 !important;
}
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) {
  width:fit-content !important; max-width:100% !important;
 }
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 }
 html.touch body #hud.single-guide #wait-guard {
  width:264px; min-height:56px; grid-template-rows:auto;
 }
 html.touch body #hud.single-guide #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
 html body #hud #battle-notices #objectives .retreat-gesture { width:44px; height:44px; }
}
`;
    style.textContent += `
/* 守りから反撃へ移っても、携帯の行動案内は同じ親指側に保つ。 */
@media (max-height:500px) {
 html.touch body #hud #wait-guard#wait-guard {
  top:auto !important; bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  width:280px; max-width:34vw; min-height:64px;
 }
 html.touch body #hud #wait-guard#wait-guard span { font-size:max(24px,calc(24px * var(--text-scale,1))); }
 html.touch body #hud.hand-action-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
  position:fixed !important; left:auto !important; top:auto !important;
  right:calc(16px + env(safe-area-inset-right, 0px)) !important;
  bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  transform:none !important; width:280px !important; max-width:34vw !important;
  min-height:64px !important; box-sizing:border-box; padding:8px !important;
  background:#14120f !important;
 }
 html.touch body #hud.hand-action-guide #battle-notices #objectives#objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
  white-space:normal !important; overflow-wrap:anywhere !important; min-width:0 !important; max-width:100% !important;
 }
 html.touch.tc-sw body #hud.hand-action-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
  right:auto !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important;
 }
}
`;
    style.textContent += `
/* 押す札は親指側へ固定し、守る実物の印とは分ける。 */
html.touch body #hud #wait-guard#wait-guard.ground-hold:not([hidden]) {
 left:auto !important; top:auto !important;
 right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
 width:272px; max-width:calc(50vw - 32px); min-height:72px;
 background:#14120f; grid-template-columns:32px minmax(0,1fr);
}
html.touch body #hud #wait-guard#wait-guard.ground-hold span {
 font-size:max(18px,calc(18px * var(--text-scale,1)));
}
/* 行き先が見切れても短い札は上の同じ位置に保つ。 */
html:root body #hud.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.ground-order):not(.expand) {
 position:fixed !important; inset:auto !important; left:50% !important; top:16px !important;
 transform:translateX(-50%) !important; width:300px !important; max-width:calc(100vw - 32px) !important;
 min-height:44px !important; box-sizing:border-box; padding:6px 10px !important;
 background:#14120f !important;
}
html:root body #hud.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
html:root body #hud.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) :is(li.cur small,.destination-cue,.obj-tag) { display:none !important; }
/* 高遠の長い道案内を、両軍の札と方角の帯から離す。携帯の配置は保つ。 */
@media (min-height:621px) {
 html:root:not(.touch) body #hud.takato.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
  top:calc(104px + env(safe-area-inset-top, 0px)) !important;
 }
}
/* 道案内の印だけにならないよう、選ばれた任務一枚の本文を残す。 */
html:root body #hud.route-task #battle-notices #objectives#objectives.route-summary:not(.expand):not(.notice-muted),
html:root body #hud.route-task #battle-notices #objectives#objectives.route-summary:not(.expand):not(.notice-muted) :is(#obj-list,li.cur,.obj-now) {
 display:block !important; visibility:visible !important;
}
`;
    style.textContent += `
html.touch body #hud #wait-guard#wait-guard :is(span,small) {
 min-width:0; max-width:100%; white-space:normal; word-break:normal; overflow-wrap:anywhere;
}
html.touch body #hud #wait-guard#wait-guard small {
 font-size:max(16px,calc(16px * var(--text-scale,1))); line-height:1.4;
}
/* 操作の説明は一行にまとめ、守る力は同じ札の下段へ。 */
@media (max-height:500px) {
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) {
  width:320px; max-width:calc(50vw - 32px); min-height:76px;
  grid-template-columns:28px minmax(0,1fr); column-gap:6px;
 }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) span {
  font-size:max(22px,calc(22px * var(--text-scale,1))); line-height:1.3;
 }
}
html.touch.tc-sw body #hud #wait-guard#wait-guard.ground-hold:not([hidden]) {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
}
`;
    document.head.appendChild(style);
  }
  // 長い台詞を高さだけで消さない。収まらない時は欄全体を送って読む。
  fitMessage() {}
  sync() {
    super.sync();
    // 枠の外にある相手の字列も知らせの数に含める。任務の裏へは出さない。
    $('target').classList.toggle('notice-muted', this.sources[1].selected || this.picks.length >= this.limit);
    this.root.classList.toggle('danger-notice', this.picks.some((item) => item.kind === 'warn'));
  }
  reset() { this.textSeen.clear(); this.warningSeen.clear(); super.reset(); }
  repeatOk(text, remember = false) {
    const key = this.key(text);
    // 共通の短い記録は三十秒で片付くため、二分の記録は出し口で保つ。
    if (this.clock - (this.textSeen.get(key) ?? -Infinity) < 120) return false;
    const family = WARNING_FAMILY.find(([re]) => re.test(text)) || BARK_FAMILY.find(([re]) => re.test(text));
    if (family && this.clock - (this.warningSeen.get(family[1]) ?? -Infinity) < 15) return false;
    if (!remember) return super.repeatOk(text);
    // 表示時の記録は、共通欄の別の判定で抜けないよう先に残す。
    // 待ち列の判定では記録せず、期限を過ぎた物だけ片付ける。
    for (const [text, time] of this.textSeen) if (this.clock - time >= 120) this.textSeen.delete(text);
    this.textSeen.set(key, this.clock);
    if (family) this.warningSeen.set(family[1], this.clock);
    super.repeatOk(text, true);
    return true;
  }
}

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
        if (!p || !this.rt.squadGroups.length) return;
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

  // 号令先の隊を選ぶ（G の切り替えと同じ働き。選んだ隊をもう一度選ぶと全隊に戻す）
  pickGroup(k) {
    const rt = this.rt;
    if (!rt || !rt.player || !(this.unitKinds || []).length) return;
    const p = rt.player;
    p.selGroup = k !== 'all' && p.selGroup === k ? 'all' : k;
    this.flash(p.selGroup === 'all' ? '全隊に号令' : `${GROUP_NAME[p.selGroup] || '組'}に号令`, 'dim');
    if (p.cmdOpen) p.cmdOpenT = 0;
    if (rt.tutMark) rt.tutMark('group');
    this.unitsKey = '';
  }

  // 部隊の帯（画面の右下）：自分の組の隊ごとの札と、名のある味方の武将の隊の札
  // 札：率いる者の姿（墨の半身と家紋）、士気の輪（減ると欠ける）、兵の数の札（戦場の隊旗の札と同じ色）、いまの号令の印
  updateUnits(rt) {
    const el = $('h-units');
    if (!el) return;
    const p = rt.player;
    const own = this.unitOwn || (this.unitOwn = []); own.length = 0;
    for (const g of rt.squadGroups) if (g.count > 0) own.push(g);
    const kinds = this.unitKindWork || (this.unitKindWork = []); kinds.length = 0;
    for (const g of own) if (!kinds.includes(g.kind)) kinds.push(g.kind);
    this.unitKinds = kinds;
    // 名のある味方の武将の隊（近い順に三つまで）
    const pu = p.u.pos;
    if (!(rt.t - (rt.allyAt ?? -1e9) < 2)) {   // 2 秒に一度（コマ数でなく戦の時間で数える）
      rt.allyAt = rt.t;
      const candidates = this.allyCandidates || (this.allyCandidates = []); candidates.length = 0;
      const pool = this.allyCandidatePool || (this.allyCandidatePool = []);
      for (const g of rt.army.groups) {
        const gg = g.team === 0 && !g.isPlayerSquad && g.count > 0 ? groupGeneral(g) : null;
        if (!gg || !gg.name) continue;
        const i = candidates.length, entry = pool[i] || (pool[i] = { g: null, d: 0 });
        entry.g = g; entry.d = Math.hypot(g.center().x - pu.x, g.center().z - pu.z);
        candidates.push(entry);
      }
      candidates.sort(byAllyDistance);
      const groups = rt.allyGroups || (rt.allyGroups = []); groups.length = 0;
      for (let i = 0; i < Math.min(3, candidates.length); i++) groups.push(candidates[i].g);
    }
    // 名のある味方の札は、組を率いる身分（か大名）から。足軽の時は号令できないので出さない
    const allies = this.unitAllies || (this.unitAllies = []); allies.length = 0;
    if (own.length || rt.G.lordTitle) for (const g of rt.allyGroups || []) if (g.count > 0 && sightRef(rt, g, g.center())) allies.push(g);
    if (!own.length && !allies.length) { el.hidden = true; this.unitsKey = ''; return; }
    el.hidden = false;
    const mon = rt.def.sides ? rt.def.sides.a.mon : 'tokugawa';
    const many = kinds.length > 1;
    const cards = [];
    if (many) cards.push({ k: 'all', html: `<button type="button" class="uc all ${p.selGroup === 'all' ? 'on' : ''}" data-sel="all" aria-pressed="${p.selGroup === 'all'}" aria-label="全隊に号令する${isTouch ? '' : '（オルトと0）'}"><b>全</b><span class="nm">全隊</span><kbd>0</kbd></button>` });
    for (const k of kinds) {
      const gs = this.unitGroupWork || (this.unitGroupWork = []); gs.length = 0;
      let n = 0, morale = 0, guns = 0, ready = 0;
      for (const g of own) {
        if (g.kind !== k) continue;
        gs.push(g); morale += g.morale;
        for (const u of g.units) if (sightUnit(rt, u)) {
          n++;
          // 込め終わりも同時に数え、兵の一覧を繰り返し作らない。
          if (k === 'gun' && u.type === 'gun') { guns++; if (!u.reload) ready++; }
        }
      }
      const mor = morale / gs.length;
      const g0 = gs[0];
      const seen = groupSeen(rt, g0);
      const ord = !seen ? '' : g0.focus ? 'focus' : g0.order;
      const sel = many && (p.selGroup === 'all' || p.selGroup === k);
      const tg = tagOf(g0);
      const i = kinds.indexOf(k) + 1;
      const nm = many ? GROUP_NAME[k] || '組' : '自分の組';
      // 最後の号令への返事を札に残す。短い知らせが間引かれても読み直せる。
      let receipt = g0._commandStatus || '';
      for (const g of gs) if (g._commandStatus && g._commandStatus !== '届いた') receipt = g._commandStatus;
      if (gs.some((g) => g.pending)) receipt = '伝え中';
      const lbl = `${nm} ${numberHint(n)} 号令${ORDER_NAME[ord] || '様子不明'}${receipt ? `（${receipt}）` : ''}${guns ? ` 込め終わり${ready}／${guns}` : ''}`;
      const inner = `<span class="face ${faceCls(k, mon)} ${mor < 30 ? 'waver' : ''}"></span>` +
        `<i class="ord ${g0.pending ? 'pend' : ''}" aria-hidden="true">${ORDER_MARK[ord] || '・'}</i>${g0.pending ? `<i class="runner" aria-hidden="true" title="使番が走っている">使番を出した</i>` : ''}<i class="cnt" style="box-shadow:inset 4px 0 0 ${TAG_COL[tg]}, 0 0 0 1px #000" aria-hidden="true">${numberHint(n)}</i>` +
        `<span class="nm">${esc(nm)}</span>${many ? `<kbd aria-hidden="true">${i}</kbd>` : ''}` +
        (guns ? `<i class="ready" aria-hidden="true" title="込め終わり">${ready}/${guns}</i>` : '') +
        (receipt ? `<i class="command-status" aria-hidden="true">${esc(receipt)}</i>` : '');
      cards.push({ k, html: many ? `<button type="button" class="uc own ${sel ? 'on' : ''}" data-sel="${k}" aria-pressed="${sel}" aria-label="${esc(lbl)}${isTouch ? '' : `（オルトと${i}）`}">${inner}</button>` : `<div class="uc own solo" role="img" aria-label="${esc(lbl)}">${inner}</div>` });
    }
    // 携帯の横向き：一段に自分の組の札だけ。控えの武将は［ほか］を押した時だけ
    const phone = (isTouch ? document.documentElement.classList.contains('tc-low') : window.matchMedia('(max-height: 500px)').matches) && own.length > 0;
    if (phone && allies.length) cards.push({ k: 'allies', html: `<button type="button" class="uc al ${this.alliesOpen ? 'on' : ''}" data-allies="1" aria-pressed="${!!this.alliesOpen}" aria-label="味方の武将の隊 ${allies.length}つ（押すと${this.alliesOpen ? '畳む' : '出す'}）"><b>…</b><span class="nm">ほか</span></button>` });
    for (const g of phone && !this.alliesOpen ? [] : allies) {
      const gen = groupGeneral(g);
      if (!gen || !gen.name) continue;   // 武将が討たれても隊が残る時がある
      const full = gen.name.replace(/^.* /, '');
      // 札に収まらない五字以上の名は、下の名（「藤吉郎」）で。読み上げには全部の名
      // 背の低い指の画面（札が細い）では、四字の名も下の名二字（「信長」「光秀」）に
      const nm = full.length >= 5 ? full.slice(-3) : full.length === 4 && isTouch && VIEW.h <= 500 ? full.slice(-2) : full;
      const fighting = g.units.some((u) => u.alive && (u.target || u.atk));
      const st = allyAction(g);
      const report = rt.allyOrders && rt.allyOrders.find((r) => r.g === g && r.active);
      const place = report ? allyPlace(report.x, report.z, pu) : '';
      const gm = (GENERALS[full] || {}).mon || mon;
      cards.push({ k: 'a' + g.id, html: `<button type="button" data-ally="${g.id}" class="uc ally ${fighting ? 'fight' : ''} ${g.routed || g.order === 'retreat' ? 'back' : ''}" aria-label="${report ? '小地図の' + report.number + '、' : ''}${esc(full)}の隊 ${numberHint(g.count)} ${place} ${st}">` +
        `<span class="face ${faceCls('honjin', gm)} ${g.morale < 30 ? 'waver' : ''}"></span><i class="cnt ally" aria-hidden="true">${numberHint(g.count)}</i>` +
        `<span class="nm ${nm.length >= 5 ? 'long' : ''}">${report ? report.number + ' ' : ''}${esc(nm)}</span><span class="st">${st === '持ち場を守る' ? '守る' : st === '合図を待つ' ? '待つ' : st === '戦っている' ? '戦う' : st === '攻めている' ? '攻める' : st === '移動中' ? '進む' : '退く'}</span></button>` });
    }
    let key = '';
    for (const c of cards) key += c.html;
    if (key === this.unitsKey) return;
    this.unitsKey = key;
    el.innerHTML = key;
    el.setAttribute('aria-label', many ? (isTouch ? '部隊（札を押して号令先を選ぶ）' : '部隊（札を押すか オルトと数字で号令先を選ぶ）') : '部隊');
    // 下の札（槍・打刀・指揮…）と重ならないよう、右の空きに収めて足りなければ上へ折り返す
    // 指の端末では下の札が無いので、幅は CSS（右下の丸に掛からない幅）に任せる
    if (isTouch) { setStyle(el, 'maxWidth', ''); return; }
    // 低い画面（幅 844×高さ 390 など）：札を二段・三段に積むと上の任務の札に掛かるので、一段に並べる（幅の 45%）
    if (window.matchMedia('(max-height: 500px)').matches) { setStyle(el, 'maxWidth', Math.round(VIEW.w * 0.45) + 'px'); return; }
    const hb = $('h-bottom').getBoundingClientRect();
    setStyle(el, 'maxWidth', Math.max(160, VIEW.w - (hb.right || 0) - 32) + 'px');
  }


  // 上空視点（rts.js）の帯：選んだ部隊の札・下知の釦 6・構えの横開き・複数選び（F5）
  buildRtsDock() {
    rtsCss();
    const el = document.createElement('div');
    el.id = 'rts-dock';
    el.hidden = true;
    el.innerHTML = `<div class="rts-cards" id="rts-cards" role="listbox" aria-label="選んだ部隊"></div>
      <div class="rts-forms" id="rts-forms" role="group" aria-label="構え（陣形）"></div>
      <div class="rts-row" id="rts-ord" role="group" aria-label="下知"></div>
      <div class="rts-row"><button type="button" id="rts-multi" aria-pressed="false">複数選び</button></div>`;
    document.body.appendChild(el);
    this.rtsEl = el;
    this.rtsOrdKey = ''; this.rtsCardKey = ''; this.rtsFormOpen = false;
    $('rts-ord').addEventListener('click', (e) => {
      const t = e.target.closest('[data-ord]'); if (!t || t.disabled) return;
      const id = t.dataset.ord;
      const b = this.rt;
      if (id === 'form') { this.rtsFormOpen = !this.rtsFormOpen; this.rtsOrdKey = ''; return; }
      if (id === 'move' || id === 'attack') {
        rtsSetPick(b, rtsPick(b) === id ? null : id);
        this.flash(id === 'move' ? '地図を押して行き先を指す' : '敵の隊を押す', 'dim');
        this.rtsOrdKey = '';
        return;
      }
      this.rtsFormOpen = false;
      rtsOrder(b, id, {});
    });
    $('rts-forms').addEventListener('click', (e) => {
      const t = e.target.closest('[data-form]'); if (!t || t.disabled) return;
      this.rtsFormOpen = false; this.rtsOrdKey = '';
      rtsOrder(this.rt, 'form', { f: t.dataset.form });
    });
    $('rts-multi').addEventListener('click', () => {
      const on = !rtsMultiOn(this.rt);
      rtsSetMulti(this.rt, on);
      this.rtsOrdKey = '';
    });
  }
  updateRts(rt) {
    if (!this.rtsEl) this.buildRtsDock();
    this.rtsEl.hidden = false;
    const sel = this.rtsSelected || (this.rtsSelected = new Set()); sel.clear();
    for (const o of rtsSelection(rt)) sel.add(o);
    const list = rtsCollect(rt);
    const own = this.rtsOwn || (this.rtsOwn = []); own.length = 0;
    for (const e of list) if (sel.has(e.o)) own.push(e);
    // 隊の札：家紋・兵数・士気の帯
    let cardsHtml = '';
    for (const e of own) {
      const mc = e.m > 60 ? 'hi' : e.m > 30 ? 'md' : 'lo';
      const ok = rtsCanCommand(rt, e.o);
      if (!ok) {
        cardsHtml += `<div class="rts-card off" role="img" aria-label="${esc(e.name)}。下知できない（身分が足りない）" title="下知できない（身分が足りない）">` +
          `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
          `<small>下知<br>できない</small></div>`;
        continue;
      }
      cardsHtml += `<div class="rts-card" role="img" aria-label="${esc(e.name)}。${numberHint(e.n)}">` +
        `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
        `</div>`;
    }
    if (!own.length) cardsHtml = '<p class="rts-none">隊を押して選ぶ（長押しで囲む・複数選びで足す）</p>';
    if (cardsHtml !== this.rtsCardKey) {
      this.rtsCardKey = cardsHtml;
      const box = $('rts-cards');
      box.innerHTML = cardsHtml;
      for (const c of box.querySelectorAll('canvas[data-mon]')) c.getContext('2d').drawImage(monIcon(c.dataset.mon), 0, 0, 24, 24);
    }
    // 下知の釦（choose した物、かつ身分で動かせる物がある時だけ押せる）
    const pick = rtsPick(rt), multi = rtsMultiOn(rt);
    const cmdable = this.rtsCommandable || (this.rtsCommandable = []); cmdable.length = 0;
    for (const e of own) if (rtsCanCommand(rt, e.o)) cmdable.push(e);
    const hasGun = cmdable.some((e) => e.real && e.o.units.some((u) => u.alive && (u.type === 'gun' || u.type === 'bow')));
    let ordHtml = '';
    for (const o of RTS_ORDERS) {
      const ok = cmdable.length && (o.id !== 'fire' || hasGun);
      const on = (o.id === 'form' && this.rtsFormOpen) || (o.id === pick);
      ordHtml += `<button type="button" data-ord="${o.id}" ${ok ? '' : 'disabled'} class="${on ? 'on' : ''}" aria-pressed="${on}" title="${o.note}">${rtsIcon(o.ic)}<span class="lb">${o.label}</span></button>`;
    }
    const cur = own.length === 1 && own[0].real ? own[0].o.formation : null;
    let formHtml = '';
    for (const f of RTS_FORMS) formHtml += `<button type="button" data-form="${f.f}" class="${cur === f.f ? 'on' : ''}" aria-pressed="${cur === f.f}" title="${f.note}">${rtsIcon(f.ic)}<span class="lb">${f.label}</span></button>`;
    const key = ordHtml + formHtml + this.rtsFormOpen + multi;
    if (key !== this.rtsOrdKey) {
      this.rtsOrdKey = key;
      $('rts-ord').innerHTML = ordHtml;
      $('rts-forms').innerHTML = formHtml;
      $('rts-forms').classList.toggle('open', this.rtsFormOpen);
      const mb = $('rts-multi'); mb.setAttribute('aria-pressed', String(multi)); mb.classList.toggle('on', multi);
    }
  }
  hideRts() { if (this.rtsEl) this.rtsEl.hidden = true; }

  show(on) {
    this.root.hidden = !on;
    if (!on) { clearTimeout(this.flashDefer); this.flashDefer = 0; const cv = $('overlay'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  }

  // 開戦の大見出し（◯◯軍 VS ◯◯軍）と上下の黒帯
  intro(sides, name, date) {
    const el = $('intro');
    el.hidden = false;
    // 映画の題の札のように：日付を小さく、戦の名を墨の字で、下に両軍の名を「対」で。派手な色・VS の字は使わない
    this.introWaiting = true;
    const battle = window.__game?.battle, began = performance.now();
    // 年月日と場所は、時間の止まった開戦前に読む。
    date = battle?.def.date?.(battle) || date;
    if (battle?.def.introPlace) date += '　' + battle.def.introPlace;
    const G = window.__game?.G;
    // どの戦も読む時間を取り、自分で出陣を決める。
    const read = this.introRead || G?.battle > 0 || G?.history?.some(Boolean);
    const automatic = !!battle?.startAutomatic;
    const timing = battle?.startTiming;
    const prepared = '「戦いを始める」を押すと始まります。';
    const goal = battle ? openingGoal(battle) : '味方と命令を果たし、生きて戻る';
    this.opening?.dispose();
    this.opening = battle && !battle.def.town && !battle.def.dojo ? new BattleOpening(this, battle) : null;
    const instruction = battle?.def.introText;
    el.dataset.battle = battle?.def.key || '';
    el.classList.toggle('compact-intro', !!battle?.def.compactIntro);
    const waitText = (typeof instruction === 'function' ? instruction(battle) : instruction) || (read ? '支度ができました。すぐに動けます。' : (battle?.def.teach ? '組の旗と一緒に進もう。操作は一つずつ案内します。' : '組の旗と一緒に進もう。'));
    const waitShown = battle && battle.plainOps && !battle.def.introKeepControls ? battle.plainOps(waitText) : waitText;
    // 開戦の札は軍の名だけ（「出陣時の目安」は兵の数の横で使う言葉）
    const sideName = (n) => String(n || '').replace(/（出陣時の目安）/g, '');
    const openingSide = (side) => sideName(battle?.def.introSides?.[side] || sides[side].name);
    const people = battlePeople(battle), castle = castleWelcome(battle);
    const peopleText = people.map((p) => `<div class="intro-person"><b>${esc(p.name)}</b><span>${esc(p.note)}</span></div>`).join('') + (castle ? `<p class="intro-castle">${esc(castle)}</p>` : '');
    const welcome = battle?.def.introPeopleFolded && peopleText
      ? `<details class="intro-people"><summary>人物と砦の説明を読む</summary>${peopleText}</details>` : peopleText;
    for (const person of people) this.peopleIntroduced.add(person.id);
    if (document.pointerLockElement) document.exitPointerLock?.();
    el.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-wait"><div class="intro-reading" tabindex="0" aria-label="戦の下知"><div class="date">${esc(date)}</div><div class="ttl" id="intro-title">${esc(name)}</div><i class="rule" aria-hidden="true"></i><div class="sides">味方　${esc(sideName(sides.a.name))}<em>対</em>敵　${esc(sideName(sides.b.name))}</div><p id="intro-wait" style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">${esc(waitShown)}</p><p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6"><b>勝つには：${esc(goal)}</b></p><p style="font-size:max(13px, calc(13px * var(--text-scale, 1)));line-height:1.6">${prepared}${read ? '' : '読む時間は自分で選べます'}</p></div><button type="button" class="btn primary" id="intro-go" style="min-height:48px;pointer-events:auto">出陣する</button></div>`;
    // 札の外は指を受け取らない。出陣待ちの停止は保つ。
    el.querySelector('.sides').innerHTML = `味方　${esc(openingSide('a'))}<em>対</em>敵　${esc(openingSide('b'))}`;
    // 指定した戦では、下知と勝つ条件を読んでから人物紹介へ送る。
    if (battle?.def.introTaskFirst) el.querySelector('.intro-reading').insertAdjacentHTML('beforeend', welcome);
    else el.querySelector('.sides').insertAdjacentHTML('afterend', welcome);
    decorateTerms(el.querySelector('.intro-reading'));
    el.style.pointerEvents = 'none';
    $('cine').classList.toggle('on', !reduceMotion());
    clearTimeout(this.introT);
    const go = $('intro-go'), reading = el.querySelector('.intro-reading');
    go.textContent = '戦いを始める';
    go.title = 'この札を閉じ、戦場で動き始める。';
    go.onclick = (e) => {
      e.stopPropagation();
      if (!this.introWaiting || el.hidden) return;
      if (timing) { timing.introMs = Math.round(performance.now() - began); timing.ready = true; timing.battleSecondsAtReady = battle.t; }
      clearTimeout(this.introT);
      if (!automatic) {
        this.introRead = true;
        try { localStorage.setItem('risshin-intro-read', '1'); } catch (e) { /* 保存の仕組みには触れない */ }
      }
      if (timing) timing.totalMs = timing.loadingMs + (timing.readingMs || 0) + timing.deploymentMs + timing.introMs;
      this.introWaiting = false; el.hidden = true;
      $('cine').classList.remove('on'); go.blur(); this.onIntroReady?.();
    };
    const introKeys = (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        const targets = [reading, ...reading.querySelectorAll('button, summary'), go];
        const at = targets.indexOf(document.activeElement);
        targets[(at + (e.shiftKey ? -1 : 1) + targets.length) % targets.length].focus({ preventScroll:true });
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
    };
    go.onkeydown = reading.onkeydown = introKeys;
    go.focus({ preventScroll:true });
    // 自動の試走だけは、操作待ちを省く。
    if (automatic) this.introT = setTimeout(() => { if (this.introWaiting && window.__game?.battle === battle) go.click(); }, 0);
  }

  // 大事な瞬間（名乗り・名のある武将の討死）に、上下の細い黒帯を t 秒だけ（映画の一場面のように）。動きを減らす設定では出さない
  // 開戦の見せ場の間だけ、題の札が出ていても上下の黒い帯を出し、画面の札を消す（cineFlash の 20 秒の間隔とは別）
  shotBars(t = 4.5) {
    if (reduceMotion()) return;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => $('cine').classList.remove('on'), t * 1000);
  }

  cineFlash(t = 2.5) {
    if (reduceMotion() || !$('intro').hidden) return;
    // 続けて何度も出すと映画の間にならないので、20 秒に一度まで
    const now = performance.now();
    if (now - (this.cineAt || -1e9) < 20000) return;
    this.cineAt = now;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => { if ($('intro').hidden) $('cine').classList.remove('on'); }, t * 1000);
  }

  reset() {
    this.releaseDodgeHold?.();
    this.releaseCoverHold?.();
    this.counterGuideEnemy = null; this.counterPromptHit = null; this.counterPromptUntil = 0; this.counterPromptAt = -Infinity;
    if (this.coverEl) this.coverEl.hidden = true;
    this.releaseWaitGuard?.();
    if (this.waitGuardButton) this.waitGuardButton.hidden = true;
    setClass(this.root, 'wait-guard-active', false);
    this.opening?.dispose(); this.opening = null;
    this.root.classList.add('battle-active');
    setClass(this.root, 'dodge-active', false);
    setClass(this.root, 'dodge-turn-coach', false);
    if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
    window.speechSynthesis?.cancel();
    setText($('h-merit'), '戦の最中');
    this.introWaiting = false; clearTimeout(this.introT);
    this.hurtT = 0; this.threatAt = 0;
    $('vignette').classList.remove('hurt', 'side', 'dying', 'winded');
    $('vignette').style.removeProperty('--hx'); $('vignette').style.removeProperty('--hy');
    for (const id of ['dmgdir', 'mobfx', 'aimwarn', 'brinkfx', 'encircle']) { const el = $(id); if (el) { el.classList.remove('on', 'show'); } }
    const cards = $('sonae-cards'); if (cards) cards.hidden = true;
    this._scKey = ''; this._scAlert?.clear();
    this.orderLog = []; this.warningLog = []; this.resultNotices = []; this.allyReport = '';
    this.logEntry.hidden = true;
    this.deepWas = false; this.breathHelp = false; this.moraleHelp = false; this.killHelp = false;
    $('h-squad').setAttribute('aria-expanded', 'false');
    this.subQ = []; this.subT = 0; this.shownLine = null; this.coachFoe = false; this.nearFoe = false; this.nearFoeT = 0; this.objKey = ''; this.taskShownId = null; this.taskShownText = ''; this.taskShownAt = -99; this.goalSignalAt = -99; this.curObjKey = null; this.shownGoalKey = null; this.goalFlashUntil = 0; this.log = []; this.doneAt = new Map(); this.subDrop = false;
    this.armyGhost = null; this.moveMarks = []; this.unitsKey = ''; this.radialKey = ''; this.rt = null;
    // 道筋・人物・旗の案内も戦全体を参照する。次の戦の支度へ持ち越さない。
    this.doorwaySight = this.approachRoute = this.singleGoalWay = this.guardWait = null;
    this.peopleRt = this.peopleUnits = this.ovRt = this.flagRt = this.flagMarker = this.dodgeTurnRt = null;
    this.goalFlag = this.goalFlagFoot = this.goalFlagOwner = this.attackGuideEnemy = this.approachGuideEnemy = null;
    for (const list of [this.peopleCandidates, this.bossCandidates, this.bossOffscreen, this.ovCand, this.ovOffscreen]) if (list) list.length = 0;
    this.enemyOrderKey = this.approachOrderKey = null;
    this.aimGuideEnemy = null;
    setClass($('objectives'), 'approach-order', false);
    setClass($('objectives'), 'enemy-order', false);
    this.guardAlly = this.lastGuardAlly = this.defendEnemy = this.guardThreat = null;
    this.guardPromptAt = -Infinity; this.guardPromptUntil = 0; this.guardPromptAttack = null;
    this.retreatGuide = null; this.travelGuide = null; this.retreatScanAt = 0; this.guardFacing = false;
    setClass(this.root, 'guard-button-help', false);
    this.mmT = this.unitsT = this.firstHelpT = this.siegeCardsT = this.compassT = 0; this.periodicNext = 0; this.markersF = 0;
    if ($('h-units')) $('h-units').hidden = true;
    if (this._scEl) { this._scEl.hidden = true; setStyle(this._scEl, 'display', 'none'); }
    this.armyKey = '';
    this.armyClock = 0;
    this.bannerQ = []; this.bannerT = 0; this.bannerEndingRt = null; this.lastToast = null;
    this.peopleIntroduced = new Set(); this.peopleScanAt = 0;
    this.barkSeen = new Map(); this.barkCounts = new Map(); this.barkTimes = [];
    this.nextHintAt = -99;
    this.commandPlace = null;
    this.hintCur = null; this.tutCur = null; this.cardKey = ''; clearTimeout(this.hintTimer); clearTimeout(this.hintDefer);
    if (this.staminaLabel) this.staminaLabel.hidden = true;
    for (const id of ['subtitle', 'toasts', 'markers', 'bark', 'threats']) $(id).innerHTML = '';
    this.markerEls.clear();
    this.threatEls = [];
    this.threatSizes = [];
    // 危険が迫ったコマで札を作らず、出陣の支度中に三枚用意する。
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'threat edge'; el.hidden = true;
      el.style.cssText = 'transform:translate(-50%,-50%);font-size:15px;color:#ffb09a;background:#14120f;padding:4px 8px;border:2px solid #c0452e;text-align:center';
      $('threats').appendChild(el); this.threatEls.push(el);
      this.threatSizes.push({ width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 });
    }
    this.threatRects.length = 0;
    this.workHoldId = null;
    this.workPromptKey = '';
    for (const id of ['cmdpanel', 'prompt', 'bigmap', 'hint', 'sublog', 'target', 'flash', 'intro', 'armybar', 'radial', 'combo', 'killmark', 'staring', 'skiphint', 'situation', 'maphint', 'cheat', 'tutorial', 'choice']) $(id).hidden = true;
    $('floats').innerHTML = ''; this.floats = [];
    this.ghost = undefined; this.calmT = 0;
    this.rtsCardKey = ''; this.rtsOrdKey = ''; this.rtsFormOpen = false; this.hideRts();
    $('cine').classList.remove('on');
    this.bigmap = false;
    $('banner').classList.remove('show');
    $('objectives').classList.remove('expand');
    $('obj-list').setAttribute('aria-expanded', 'false');
    $('obj-list').setAttribute('aria-label', '任務の一覧を開く');
    $('objectives').setAttribute('aria-label', '今の任務。押すとほかの任務を開く');
    this.alliesOpen = false;
    this.notices.reset();
    this.applySettings();
  }

  applySettings() {
    this.root.dataset.sub = S.subSize;
    // HUD の部品ごとの出し入れ
    for (const [k, cls] of [['hudMinimap', 'no-minimap'], ['hudCompass', 'no-compass'], ['hudArmy', 'no-army'], ['hudSquad', 'no-squad'], ['hudBottom', 'no-bottom'], ['hudObjectives', 'no-objectives']]) this.root.classList.toggle(cls, !S[k]);
    document.body.classList.toggle('mincho', S.fontBody === 'mincho');
    document.body.classList.toggle('ca', !!S.colorAssist);
    // 動きを減らす：ゲームの設定か、OS の「視差効果を減らす」
    document.body.classList.toggle('rm', reduceMotion());
    $('fps').hidden = !S.showFps;
  }

  // 台詞の読み上げ（ブラウザの音声合成。日本語の声があるときだけ）
  canSpeak(speaker) {
    if (!speaker || S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0 || S.voice === 'major' && !VOICE_MAJOR.test(speaker) || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    try { if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((v) => /^ja(?:[-_]|$)/i.test(v.lang || '')) || null; return !!jaVoice; } catch (e) { return false; }
  }
  speak(speaker, text) {
    if (!this._voiceHook && window.speechSynthesis) { this._voiceHook = true; try { speechSynthesis.addEventListener('voiceschanged', () => { jaVoice = null; }); } catch (e) { /* 声の入れ替えを聞けない環境 */ } }
    if (!window.speechSynthesis) { if (S.voice !== 'off' && !this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('この端末では声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
    // 字幕が切り替わったら、前の声を待たせず片付ける。
    try { speechSynthesis.cancel(); } catch (e) { /* 声を止められなくても字幕を続ける */ }
    if (S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0) return;
    const major = VOICE_MAJOR.test(speaker || '');
    if (S.voice === 'major' && !major) return;
    if (!speaker) return;
    try {
      if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((x) => /^ja(?:[-_]|$)/i.test(x.lang || '')) || null;
      if (!jaVoice) { if (!this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('日本語の声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
      const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
      u.lang = 'ja-JP'; u.rate = S.voiceRate; u.volume = S.volume * S.volVoice;
      u.voice = jaVoice;
      // 人ごとの声の高さと速さ（源八は低くゆっくり、藤吉郎は高く速く、若い者は少し高く。織田家編の城下で出る上役もここで聞き分ける）

      const v2 = VOICE_V.find(([re]) => re.test(speaker));
      u.pitch = v2 ? v2[1] : 1;
      u.rate = S.voiceRate * (v2 ? v2[2] : 1);
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできない環境 */ }
  }

  taskRepeats(speaker, text) {
    if (!this.rt) return false;
    const plain = (v) => String(v).replace(/[\s。、！？]/g, '');
    const key = plain(text);
    const same = (o) => {
      if (!o || o.state) return false;
      const task = plain(fieldLabel(goalText(this.rt, o.text)));
      // 行き先を添えた下知も、任務の全文を繰り返すなら札は一枚にする。
      if (!task) return false;
      if (key === task) return true;
      const guide = this.rt.missionGuide;
      const place = plain(fieldLabel(guide?.label || ''));
      return !!place && (key === task + place + 'の印を見よ' ||
        key === place + 'の印へ進め' + task ||
        key === place + 'は' + plain(guide?.floorHint || '') + task);
    };
    return this.rt.objectives.some(same) || same(this.rt.missionGuide?.objective);
  }

  // 組頭の道案内は、同じ行き先にいる間は言い直さない。
  instructionPlace(speaker, text, detail = null) {
    if (!detail?.task && !/組頭|近習/.test(speaker || text)) return null;
    const guide = this.rt?.missionGuide;
    const place = /(?:^|[「。！？])([^「」。！？]+?)の印(?:へ|を)/.exec(text);
    if (place) return this.notices.key(place[1]) + '|' + (guide?.floorHint || '');
    if (detail?.task) return this.notices.key(guide?.label || 'その場') + '|' + (guide?.floorHint || '');
    return null;
  }

  say(speaker, text, dur = 4, urgent = false, detail = null) {
    // 遊び手への括弧の説明は省かない。内部注は呼び出す側のデータで外す。
    text = String(text);
    const speakerUnit = battleSpeaker(this.rt, speaker, text);
    if (!battleSpeechAllowed(this.rt, speaker, text, speakerUnit)) return false;
    if (detail?.internalNotes) for (const note of detail.internalNotes) text = text.replace(`（${note}）`, '');
    // 長い台詞ほど長く出す。読み上げる時は、声が言い終わるまで出しておく（1 秒に 7 字ほど）
    dur = Math.max(dur, 1.2 + text.length * 0.11);
    if (this.canSpeak(speaker)) dur = Math.max(dur, 0.8 + text.length / (7 * (S.voiceRate || 1)));
    if (this.taskRepeats(speaker, text)) return false;
    const key = this.notices.key(text);
    if (!this.notices.repeatOk(text) || this.subQ.some((q) => q.key === key)) return false;
    const place = this.instructionPlace(speaker, text, detail);
    if (place !== null && place === this.commandPlace) return false;
    if (place !== null) this.commandPlace = place;
    const important = detail?.task || urgent || VOICE_MAJOR.test(speaker || '') || /伝令|使番|上官|下知/.test(speaker || '') || /任務|命令|下知|合図|守れ|守る|待て|退け|向かえ|進め|攻めよ|討て|救え|構え/.test(text);
    const line = { speaker, text, key, dur, important, goalKey: detail?.goalKey || null, queued: this.subSeq = (this.subSeq || 0) + 1, t: Math.floor(this.rt?.t || 0) };
    Object.defineProperty(line, 'speakerUnit', { value: speakerUnit });
    // 伝令の声は、待っている兵の声より先に読む。
    if (urgent || (speaker && /伝令|使番/.test(speaker))) this.subQ.unshift(line);
    else this.subQ.push(line);
    if (urgent) this.nextSub();
    this.log.push(line);
    if (this.log.length > 40) this.log.shift();
    if (important) { this.orderLog.push(line); this.updateLogEntry(); }
    // 読む速さは保つ。雑談から記録へ回し、下知と伝令は待ち列に残す。
    while (this.subQ.length > 7) {
      let i = this.subQ.findIndex((q) => !q.important);
      if (i < 0) { i = 0; for (let k = 1; k < this.subQ.length; k++) if (this.subQ[k].queued < this.subQ[i].queued) i = k; }
      this.subQ.splice(i, 1); this.subDrop = true;
    }
    if (!$('sublog').hidden) this.renderLog();
    return true;
  }

  // いまの台詞を読み終えたことにして、次の台詞へ
  nextSub() { window.speechSynthesis?.cancel(); if (this.shownLine) this.shownLine.remaining = ''; if (this.subT > 0.15) this.subT = 0.15; }

  updateLogEntry() {
    let unread = 0;
    // 一分より古い未読は数えない（数が増え続けて画面を塞がない）。記録には残る
    const nowT = Math.floor(this.rt?.t || 0);
    for (const line of this.orderLog) if (!line.read && nowT - line.t < 60) unread++;
    this.logEntry.hidden = unread === 0 || (!this.rt?.def.town && !this.rt?.def.dojo);
    this.logEntry.textContent = '報せを読む';
    this.logEntry.setAttribute('aria-label', `未読の下知・報せ${unread}件を読む`);
    // 釦の出入りや折り返しが変わったら、印が避ける範囲も測り直す。
    this.rectsT = 0;
  }

  renderLog() {
    const focused = document.activeElement?.id === 'log-close';
    for (const line of this.orderLog) line.read = true;
    this.updateLogEntry();
    const rows = [...new Set([...this.orderLog, ...this.log])].sort((a, b) => a.t - b.t);
    $('sublog').innerHTML = `<h5>会話の記録</h5><button type="button" class="btn" id="log-close" style="min-height:44px;margin-bottom:8px">記録を閉じる</button><p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">読んでいる間も戦は進みます。安全な所へ退くか、一時停止して読んでください。通常の会話は直近40件まで。下知と伝令は戦の終わりまで残ります。上下に送って読めます。</p>${this.allyReport ? `<p>${esc(this.allyReport)}</p>` : ''}` + rows.map((l) => `<div><small>${Math.floor(l.t / 60)}分${l.t % 60}秒　${l.important ? '下知・報せ　' : ''}${!l.shown ? '字幕で未表示　' : ''}</small>${l.speaker ? `<span class="sp">${esc(l.speaker)}</span>` : ''}${esc(l.text)}</div>`).join('');
    $('log-close').onclick = (e) => { e.stopPropagation(); this.toggleLog(false); };
    if (focused) $('log-close').focus({ preventScroll:true });
  }

  toggleLog(on) {
    const el = $('sublog');
    el.hidden = typeof on === 'boolean' ? !on : !el.hidden;
    if (!el.hidden) { this.logOpener = document.activeElement; this.renderLog(); $('log-close').focus({ preventScroll:true }); }
    else { if (this.logOpener?.isConnected && !this.logOpener.hidden) this.logOpener.focus?.({ preventScroll:true }); else $('objectives').focus({ preventScroll:true }); this.allyReport = ''; }
  }

  // 戦功の通知（同じ項目が続いたらまとめる）
  toast(pts, label) {
    // 「大事なものだけ」なら小さな戦功は出さない
    if (S.toastLevel === 'important' && pts !== 0 && Math.abs(pts) < 5) return;
    const big = pts >= 25;
    if (big) sfx('taiko', 0.55);
    this.notices.push(pts === 0 ? label : label, big || pts === 0 ? 75 : 40, 2.7);
  }

  // 見出しも共通の三枠で出す。古い待ち見出しは短い報せへ回す。
  banner(text, sub = '') {
    sub = taskDetail(text, sub);
    // 決着の知らせは、すでに終わった寄せや下知の見出しを待たせない。
    // 決着後の重傷などは残すため、古い列を片付けるのは一戦に一度だけ。
    const rt = this.rt;
    if (rt && (rt.over || rt.flags.ending || !rt.player.u.alive) && this.bannerEndingRt !== rt) {
      this.bannerEndingRt = rt; this.bannerEndReason = text;
      this.root.classList.add('ending');
      for (const el of this.markerEls.values()) el.hidden = true;
      this.bannerQ.length = 0; this.bannerT = 0;
      $('banner').classList.remove('show');
    }
    if (rt) {
      for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase || /救援|囲み/.test(text) && /救援|囲み/.test(this.bannerQ[i].text)) this.bannerQ.splice(i, 1);
    }
    if (rt && this.bannerEndingRt === rt) {
      if (text === '重傷' || text === '討死') {
        const previous = this.bannerQ[this.bannerQ.length - 1]?.text || this.bannerEndReason;
        if (previous && previous !== text && previous !== '重傷' && previous !== '討死') sub = sub ? `${sub}。${previous}` : previous;
        this.bannerEndReason = text;
        this.bannerQ.length = 0; this.bannerT = 0; $('banner').classList.remove('show');
      } else if (this.bannerEndReason === '重傷' || this.bannerEndReason === '討死') return;
    }
    const key = this.notices.key(sub ? text + '\n' + sub : text);
    if (this.bannerQ.some((q) => q.key === key)) return;
    if (!this.notices.repeatOk(sub ? text + '\n' + sub : text)) return;
    if (rt?.def?.latestPhaseBanner) {
      this.bannerQ.length = 0;
      if (this.bannerPhase !== rt.phase) { this.bannerT = 0; $('banner').classList.remove('show'); }
    }
    this.bannerQ.push({ text, sub, key, phase: rt?.phase, at: this.notices.clock });
    // 表示中の一つに加えて待ちは二つまで。古い出来事を捨てず、
    // 新しい下知を何枚もの大見出しの後ろで待たせない。
    if (this.bannerQ.length > 2) {
      const old = this.bannerQ.shift();
      this.notices.push(old.sub ? old.text + '\n' + old.sub : old.text, 75, 2.6);
    }
  }

  flash(text, tone = 'gold') {
    text = this.terse(text);
    if (/^外れた/.test(text)) { const ch = $('crosshair'); if (ch) { ch.classList.remove('gmiss'); void ch.offsetWidth; ch.classList.add('gmiss'); } }
    this.notices.push(text, tone === 'dim' ? 30 : 85, 1.8, tone === 'dim' ? '' : 'warn');
  }

  // 部下などの短い声
  // 同じ文の二分制限とは別に、似た知らせ（騎馬が止まった・敵が崩れた…）をまとめて間引く。
  // 立て続けの知らせは、警告でないものから間引く（docs/ui-guidelines.md）
  // 出してよい知らせか（出すかどうかだけを見る。記録はしない）。呼ぶ側が先に見て、出さない物は呼ばないようにも使える
  barkOk(text, warn = false) {
    // 間は戦の中の時で数える（機械が重くて戦がゆっくり進む時も、戦の20秒に同じ知らせを何度も出さない）
    const now = this.notices.clock * 1000;
    if (!this.barkSeen || this.barkRt !== this.rt) { this.barkSeen = new Map(); this.barkCounts = new Map(); this.barkTimes = []; this.barkRt = this.rt; }
    const fam = BARK_FAMILY.find(([re]) => re.test(text));
    if (!this.notices.repeatOk(this.terse(text))) return false;
    const key = fam ? fam[1] : 'text:' + this.terse(text);
    if (fam?.[3] && (this.barkCounts.get(key) || 0) >= fam[3]) return false;
    const gap = fam ? (fam[2] ? fam[2] * 1000 : (warn ? 12000 : 30000)) : 8000;
    if (now - (this.barkSeen.get(key) ?? -1e9) < gap) return false;
    if (this.barkSeen.size > 80) for (const [k, time] of this.barkSeen) if (k.startsWith('text:') && now - time >= 30000) this.barkSeen.delete(k);
    let barkCount = 0;
    for (const t of this.barkTimes) if (now - t < 4000) this.barkTimes[barkCount++] = t;
    this.barkTimes.length = barkCount;
    if (!warn && this.barkTimes.length >= 2) return false;
    return { now, key, limited: !!fam?.[3] };
  }
  // 戦の中の字を短く：指の端末では、キーやマウスの言い添え（「右で構えて〜」「Z で〜」）を落とす。
  // 小さな画面（iPhone 横）では、括弧の中の言い添えも落とす（中身は印と音で伝わる）
  terse(text) {
    let t = String(text);
    if (isTouch) t = t.replace(/　[^　]*(右で|左で|クリック|キー|[A-Z] で|Tab|Shift|Space)[^　]*$/, '').replace(/（[^）]*(クリック|キー|[A-Z] で|Tab|Shift)[^）]*）/g, '');
    if (isTouch && VIEW.h < 500) t = t.replace(/（[^）]{6,}）/g, '');
    return t.trim() || String(text);
  }
  warningValid(text, rt) {
    if (!rt || rt.over || !rt.player.u.alive) return false;
    const p = rt.player, u = p.u;
    if (/味方の列へ下がれ/.test(text)) return u.mobbed || u.hp < u.maxHp * 0.55;
    if (/一太刀|お命|倒れる/.test(text)) return u.hp / u.maxHp < 0.3;
    if (/囲まれるぞ/.test(text)) return rt.army.playerMobSoon >= rt.army.time - 4 || !!u.mobbed;
    if (/囲ま|囲み/.test(text)) return u.mobbed || (rt.encircle?.lv || 0) > 0;
    if (/動揺|怯えて|怯えておる|心が乱れて/.test(text)) return rt.squadGroups.some((g) => g.count > 0 && g.morale < 45);
    if (/組と離れ/.test(text)) { const g = rt.squadGroups.find((g) => g.count > 0); return !!g && Math.hypot(g.center().x - u.pos.x, g.center().z - u.pos.z) > 38; }
    if (/矢玉|鉄砲|射手|後ろだ|構えて下がれ/.test(text)) return p.inCombatT > 0 || (rt.aimedT || 0) > 0 || (rt.army.threats || []).length > 0;
    // 一度起きた出来事の報せは待ち列の三秒の期限だけで扱う。
    return true;
  }

  bark(text, warn = false) {
    const ok = this.barkOk(text, warn);
    if (!ok) return;
    const place = this.instructionPlace('', text);
    if (place !== null && place === this.commandPlace) return;
    if (place !== null) this.commandPlace = place;
    const { now, key, limited } = ok;
    if (key !== null) this.barkSeen.set(key, now);
    if (limited) this.barkCounts.set(key, (this.barkCounts.get(key) || 0) + 1);
    this.barkTimes.push(now);
    const fatal = warn && /一太刀|お命|倒れる|深手|囲まれた|矢玉|鉄砲|筒先|火縄|後ろだ|構えて下がれ|味方の列へ下がれ/.test(text);
    const rt = this.rt;
    let advice = text;
    if (warn && rt && rt.def.key !== 'tennoji' && /囲まれた|四方から敵|後ろにも敵|取り籠め/.test(text)) {
      let together = false;
      for (const u of rt.army.units) {
        if (u !== rt.player.u && u.team === rt.player.u.team && u.alive && !u.gone && !u.fleeing && !u.woundOut &&
            !u.noTarget && !u.civ && !u.isStruct && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 4 && sightUnit(rt, u)) {
          together = true; break;
        }
      }
      advice = together ? this.defendEnemy && sightScreenUnit(rt, this.defendEnemy) ? rt.player.weapon === 'spear' ? '敵にやりを向けよう' : '敵へ向こう' : '味方のそばで かまえる' : '味方とならぼう';
    }
    this.notices.push(this.terse(advice), fatal ? 110 : warn ? 85 : 20, 2.2, warn ? 'warn' : '', warn ? () => this.rt === rt && this.warningValid(text, rt) : null);
    rt?.warSpeech?.bark(text);
  }

  // ヒント：手ほどきと同じ札に出す（札は一度に一つ。ヒントの間は手ほどきを少し休む）
  hint(text, keys, ms) {
    // 開戦の題字（#intro）が出ている間は待たせる（携帯で題字の上に札が重なっていた。見回り 10/2）
    clearTimeout(this.hintDefer);
    // 待ち直すだけの呼び出しを、新しいヒントとして記録しない。
    const ready = () => {
      const io = $('intro'), bn1 = $('banner');
      if ((io && !io.hidden) || (bn1 && bn1.classList.contains('show') && this.bannerT > 0)) { this.hintDefer = setTimeout(ready, 800); return false; }
      return this.showHint(text, keys, ms);
    };
    return ready();
  }
  showHint(text, keys, ms) {
    if (this.notices.clock < (this.nextHintAt ?? -99) || !this.notices.repeatOk(text, true)) return false;
    this.nextHintAt = this.notices.clock + 8;
    this.hintCur = { text, keys };
    clearTimeout(this.hintTimer);
    // 低い画面（スマホ横）では上の真ん中に短く出して、5 秒で消す（技の札のように長い物は ms で長く）
    this.hintTimer = setTimeout(() => { this.hintCur = null; this.drawCard(); }, ms || (VIEW.h < 500 ? 5000 : 6500));
    this.drawCard();
    return true;
  }
  hintBusy() { return !!this.hintCur; }

  goalChanged(rt, guide) {
    const key = guide.key;
    const text = fieldLabel(taskText(rt, guide.objective.text));
    // 古い案内は待ち列から外し、史実の会話は会話の記録に残す。
    for (let i = this.subQ.length - 1; i >= 0; i--) if (this.subQ[i].goalKey) this.subQ.splice(i, 1);
    if (this.shownGoalKey && this.shownGoalKey !== key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    // 行き先や文が続けて変わっても、点灯と音は十秒以上あける。
    if (rt.t - (this.goalSignalAt ?? -99) >= 10) {
      this.goalSignalAt = rt.t; this.goalFlashUntil = rt.t + 1.6;
      sfx('obj', 0.55);
    }
    const line = rt.def.taskText ? text : guide.floorHint ? `${guide.label}は${guide.floorHint}。${text}` :
      guide.marker ? `${text}。${guide.label}の印を見よ。` : text;
    this.say(rt.G.lord ? '近習' : '組頭', line, 4, true, { task: true, goalKey: key });
  }

  // 連撃の数
  combo(n) {
    const el = $('combo');
    el.hidden = false;
    el.textContent = `${n} 連撃`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.comboTm);
    this.comboTm = setTimeout(() => { el.hidden = true; }, 1600);
  }

  // 討ち取った印
  killMark() {
    if (!this.rt?.def.dojo) return;
    if (!this.killHelp) { this.killHelp = true; this.notices.push('稽古相手を倒した', 30, 4); }
    const el = $('killmark');
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.killTm);
    this.killTm = setTimeout(() => { el.hidden = true; }, 700);
  }

  // 討った場所に小さく戦功を浮かべる
  floatText(pos, text, neg) {
    if (!S.floatMerit || !pos) return;
    this.floats = this.floats || [];
    const el = document.createElement('div');
    el.className = 'floatm' + (neg ? ' neg' : '');
    el.textContent = /^[＋+−-]?\d+$/.test(String(text)) ? `戦功 ${text}点` : text;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: { x: pos.x, y: pos.y, z: pos.z }, t: 0 });
  }

  hitMarker(blocked = false) {
    const c = $('crosshair');
    c.classList.toggle('blocked-hit', blocked);
    c.setAttribute('aria-label', blocked ? '防がれた一撃' : '当たった一撃');
    c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
  }

  damageNotice(angle, src, kind) {
    const word = kind === 'gun' ? '鉄砲' : kind === 'arrow' ? '矢' : (src?.wpnKind || src?.lookWeapon || src?.weapon) === 'spear' ? '槍' : '';
    const visible = src && !src.isStruct && this.rt && sightUnit(this.rt, src);
    const direction = Math.cos(angle) > 0.5 ? '前' : Math.cos(angle) < -0.5 ? '後ろ' : Math.sin(angle) > 0 ? '左' : '右';
    // 傷を受けた後の札。見えない敵の向きは明かさず、出来事と取る行動を伝える。
    if (!visible && !word) return;
    const hit = word === '槍' ? '槍で突かれた' : word === '鉄砲' ? '鉄砲で撃たれた' : word === '矢' ? '矢を受けた' : '一撃を受けた';
    const retreat = this.rt?.def.damageRetreatNeeded?.(this.rt) ?? true;
    if (this.rt && retreat) this.rt.retreatUntil = Math.max(this.rt.retreatUntil || 0, this.rt.t + 3);
    const action = retreat ? '味方の後ろへ下がれ' : word === '矢' || word === '鉄砲' ? '物陰で矢玉を避けよ' : '敵へ向いて構えよ';
    this.notices.push((visible ? direction + 'から' : '') + hit + '。' + action, 85, 3);
  }

  damageFrom(angle, amount = 8) {
    const el = $('dmgdir');
    // 斬られた側の画面の縁を赤く
    const vg = $('vignette');
    vg.style.setProperty('--hx', `${50 - Math.sin(angle) * 45}%`);
    vg.style.setProperty('--hy', `${50 - Math.cos(angle) * 45}%`);
    vg.classList.remove('side'); void vg.offsetWidth; vg.classList.add('side');
    // 向きは画面の縁の赤み一つで見せる（赤い弧は重ねない）。動きを減らす時も縁の色だけは出る
    void el;
  }

  hurt(v) { this.hurtT = Math.max(this.hurtT, v); }

  // 倒れる寸前の一撃：一瞬白く飛び、闇が画面を覆って引いていく（battle.js の brink から）
  brink() {
    tensionCss();
    let el = $('brinkfx');
    if (!el) { el = document.createElement('div'); el.id = 'brinkfx'; $('vignette').after(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  // 手ほどき：いまの段だけを札に出す
  renderTut(t) { this.tutCur = t; this.drawCard(); }

  // 手ほどき・ヒントの札（左の中ほど。携帯の横向きでも隠さない）
  drawCard() {
    coachCss();
    const el = $('tutorial');
    el.classList.add('coach');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const h = this.hintCur, t = this.tutCur;
    el.classList.toggle('first-controls', !!t?.auto);
    const firstControl = t?.auto && !t.ok && ['c_swing', 'c_cmd'].includes(t.items.find((x) => !x.done)?.id);
    const guardPractice = t?.auto && !t.ok && t.items.find((x) => !x.done)?.id === 'c_guard';
    // 優先の順：手ほどきの「よし」確認 ＞ ヒント ＞ 手ほどきの段（確認の途中でヒントに取られない）
    let html = '';
    if (this.coachFoe && !guardPractice && !firstControl && !t?.ok) {
      html = '';
    } else if (t && t.ok) {
      const n = t.items.filter((x) => x.done).length;
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      html = head + `<p class="what ok"><i aria-hidden="true">✓</i>${esc(t.ok)}　よし</p>`;
    } else if (h && !guardPractice && !firstControl) {
      html = `<span class="lbl">ヒント</span><p class="what sm">${keyCaps(h.text)}</p>${h.keys ? `<p class="how">${keyCaps(h.keys)}</p>` : ''}`;
    } else if (t) {
      const n = t.items.filter((x) => x.done).length;
      const it = t.items.find((x) => !x.done);
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      if (it) html = head + `<p class="what">${esc(it.label)}</p>${it.how ? `<p class="how">${keyCaps(it.how)}</p>` : ''}`;
    }
    const key = html;
    if (key === this.cardKey) return;
    this.cardKey = key;
    el.hidden = !html;
    el.classList.toggle('hintc', !!h && !guardPractice && !t?.ok);
    el.innerHTML = html;
    // 新しい札は少しだけ動かして気づかせる（動きを減らす設定では動かさない）
    if (html) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
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
  choiceTime(t) { const b = $('choice-t'); if (b) setWidth(b, Math.max(0, t / (this.choiceMax || 20) * 100)); const secs = $('choice-seconds'); if (secs) setText(secs, `残り${Math.max(0, Math.ceil(t))}秒`); }

  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['キーの位置', '文字キーの段を、左から数えます。上段は数字のすぐ下です'], ['危険の印', '矢・鉄砲：矢玉が来る向き。槍・刀：敵が迫る向き。印へ向いて構えるか、物陰へ退きます'], ['突き', '左クリック（押し続けて離すと溜め突き）'], ['構え', '右クリック（直前で受け流し）'], ['薙ぎ', '構え＋左クリック'], ['回避', K('dodge')], ['狙い', `${K('lock')}（ホイールで相手を替える）`], ['号令', `${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}／${K('command')}長押しで輪`], ['鼓舞', K('rally')], ['地図', `${K('map')}（${K('mapzoom')}で縮尺）`], ['視点', `${K('view')}（三人称・一人称。長押しで高くから見渡す）`], ['写真', K('photo')], ['画面の札', K('hud')], ['感度', '左角かっこと右角かっこ'], ['記録', `${K('log')}（会話の記録）`]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) {
      el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表</h5><button type="button" class="btn" id="cheat-close" style="min-height:44px;margin-bottom:8px">早見表を閉じる</button>');
      $('cheat-close').onclick = (e) => { e.stopPropagation(); this.toggleCheat(); };
    }
  }

  update(dt, rt) {
    if (window.__apx && window.__apx.nohud) return;   // 実機の試し：札を書かない（外の時間が DOM の配置かを見る）
    this.rt = rt;
    setClass(this.root, 'honnoji', rt.def.key === 'honnoji');
    setClass(this.root, 'iwamura', rt.def.key === 'iwamura');
    setClass(this.root, 'takato', rt.def.key === 'takato');
    setClass(this.root, 'mitsukuri', rt.def.key === 'mitsukuri');
    const p = rt.player;
    const u = p.u;
    const G = rt.G;
    // 見出し
    this.opening?.update(dt);
    terrainHints(rt);   // 地形の読みを小分けに支度し、小地図を初めて描くコマへ集中させない。
    const periodic = this.periodicReady(dt);
    if (periodic & 16) this.preparePeople(rt);
    // 敵将の札も、画面へ戻ったコマで候補へ戻す。
    else if (this.bossOffscreen) for (let i = this.bossOffscreen.length - 1; i >= 0; i--) {
      const unit = this.bossOffscreen[i];
      if (unit.offscreen) continue;
      this.bossCandidates.push(unit); this.bossOffscreen.splice(i, 1);
    }
    // 途中から登場する武将も、見えた時に一度だけ。既存の三枠と八秒の間隔を使う。
    if (rt.t >= this.peopleScanAt && !rt.over && $('intro').hidden) {
      this.peopleScanAt = rt.t + 1;
      for (const unit of this.peopleCandidates || []) {
        const person = this.peopleNames.get(unit.name);
        if (!person || this.peopleIntroduced.has(person.id) || !unit.alive || !sightUnit(rt, unit) || unit.team !== 0 && !enemyKnown(rt, unit)) continue;
        if (unit.pos.distanceToSquared(rt.player.u.pos) > 900) continue;
        this.peopleIntroduced.add(person.id);
        this.banner(unit.name, person.note);
        break;
      }
    }
    this.notices.update(dt);
    if (this.notices.visible('banner')) this.bannerT -= dt;
    if (this.bannerT <= 0) setClass($('banner'), 'show', false);
    if (rt) for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase) this.bannerQ.splice(i, 1);
    while (this.bannerQ.length && this.notices.clock - this.bannerQ[0].at > 8) this.bannerQ.shift();
    while (this.bannerQ.length && !this.notices.repeatOk(this.bannerQ[0].sub ? this.bannerQ[0].text + '\n' + this.bannerQ[0].sub : this.bannerQ[0].text)) this.bannerQ.shift();
    // 開戦の題の札が出ている間は、見出しを待たせる（重ねない）
    // 判断の札（#choice）が開いている間も待たせる（札の上に見出しが重なって読めなかった。見回り 10/2）
    if (this.bannerT <= 0 && this.bannerQ.length && $('intro').hidden && $('choice').hidden && this.notices.room(80) && this.notices.repeatOk(this.bannerQ[0].sub ? this.bannerQ[0].text + '\n' + this.bannerQ[0].sub : this.bannerQ[0].text, true)) {
      const { text, sub, phase } = this.bannerQ.shift();
      this.bannerPhase = phase;
      const b = $('banner');
      b.classList.remove('show'); void b.offsetWidth;
      setClass(b, 'down-reason', !!rt.def.downReasonBanner && (text === '重傷' || text === '討死'));
      b.innerHTML = `<span class="brush" style="background-image:url(${brushImage()})">${esc(text)}</span>` + (sub ? `<small>${esc(sub)}</small>` : '');
      b.classList.add('show');
      this.bannerT = 2.6;
      this.notices.sync();
    }
    // 手ほどきの札は 40 秒たったら小さな札に畳む（視界を塞がない。A015）
    { const tu = $('tutorial'); if (tu) setClass(tu, 'tutold', rt.t > 40 && !this.hintCur && !this.tutCur); }
    // 目に入る兵の気配の数（上の帯）は一秒に二回で足りる（毎コマ全ての兵の見通しを調べると重い）
    if (periodic & 32) { this._armyT = 0.5; this.updateArmy(rt); }   // 一秒に二回（全兵の見通しが一回 20〜30ms（4倍遅く）。10/21 引き算）
    if ((this.siegeCardsT = (this.siegeCardsT || 0) - dt) <= 0) { this.siegeCardsT = 0.1; this.updateSiegeCards(rt); }
    this.updateArmyGhost(dt);
    this.drawOverlay(rt);
    if (isRtsOn(rt)) this.updateRts(rt); else this.hideRts();
    // 方角の帯は毎コマ作り直さなくても気付かれない（字と印を毎コマ組み立て直すのが重かった）。十回/秒で足りる
    if ((this.compassT = (this.compassT || 0) - dt) <= 0) { this.compassT = 0.1; this.updateCompass(rt); }
    this.updateRadial(rt);
    this.sonaeCards(rt);
    this.yasenHud(rt);
    // 城下：どこから出陣すればよいか迷わないよう、右下に常の「出陣する」釦を置く
    setClass(this.root, 'battle-active', !rt.def.town);
    setClass(this.root, 'anegawa', rt.def.key === 'anegawa');
    setClass(this.root, 'echizen', rt.def.key === 'echizen');
    setClass(this.root, 'okawachi', rt.def.key === 'okawachi');
    setClass(this.root, 'arioka', rt.def.key === 'arioka');
    setClass(this.root, 'shitaragahara', rt.def.key === 'shitaragahara');
    setClass(this.root, 'pursuit-order', rt.def.key === 'shitaragahara' && !!rt.flags.chaseOrdered && !rt.flags.ending);
    setClass(this.root, 'okehazama', rt.def.key === 'okehazama');
    setClass(this.root, 'tennoji', rt.def.key === 'tennoji');
    setClass(this.root, 'tottori', rt.def.key === 'tottori');
    setClass(this.root, 'iwamura', rt.def.key === 'iwamura');
    setClass(this.root, 'compact-battle', VIEW.h <= 500 && !rt.def.town && !rt.def.dojo);
    const sortie = $('town-sortie');
    if (sortie) {
      const show = !!(rt.def && rt.def.town);
      if (sortie.hidden === show) setHidden(sortie, !show);
      if (show && !sortie.__wired) { sortie.__wired = true; sortie.onclick = () => { sfx('ui'); rt.game.townOpen('boss', { go: true }); }; }
    }
    // 浮かぶ戦功
    if (this.floats) {
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.t += dt;
        if (f.t > 1.4) { f.el.remove(); this.floats.splice(i, 1); continue; }
        if (f.el.hidden || this.root.classList.contains('photo')) continue;
        const sp = this.project(f.pos, (f.pos.y || 0) + 2.6 + f.t * 0.8, rt);
        setStyle(f.el, "left", sp.x + 'px'); setStyle(f.el, "top", sp.y + 'px');
        setStyle(f.el, "opacity", sp.behind ? 0 : Math.min(1, (1.4 - f.t) * 2));
      }
    }
    // 平時は周りの札を薄くし、戦いになったらはっきり
    // 敵が 35m 以内に来たら、斬り合う前から札を戻す（0.5 秒ごとに見る）
    this.nearFoeT = (this.nearFoeT || 0) - dt;
    if (this.nearFoeT <= 0) { this.nearFoeT = 0.5; this.nearFoe = !!(u.alive && rt.army.nearestEnemy && rt.army.nearestEnemy(u, 35, (o) => !o.fleeing && o.type !== 'dummy')); }
    const coachFoe = this.nearFoe || p.inCombatT > 0 || (rt.army.threats || []).length > 0;
    setClass(this.root, 'combat-brief', coachFoe && !rt.def.town && !rt.def.dojo);
    if (this.coachFoe !== coachFoe) { this.coachFoe = coachFoe; this.drawCard(); }
    const busy = p.inCombatT > 0 || (rt.army.threats || []).length > 0 || p.cmdOpen || p.radial || this.nearFoe;
    this.calmT = busy ? 0 : (this.calmT || 0) + dt;
    // HUD の段（S.hudMode）：'min' 最小＝平時は 2 秒で札を消し、任務・小地図・方角も引っ込める／'full' 全部＝薄めない／無ければ「ふつう」
    const mode = S.hudMode || 'normal';
    setClass(this.root, 'combat-focus', coachFoe && rt.t > 8 && mode !== 'full' && S.hudAutoFade
      && !rt.def.town && !rt.def.dojo && !p.cmdOpen && !p.radial && !this.bigmap && !rt.choice && !this.openingActive);
    setClass(this.root, 'calm', mode !== 'full' && S.hudAutoFade && this.calmT > (mode === 'min' ? 2 : 6));
    setClass(this.root, 'hudmin', mode === 'min');
    setClass(this.root, 'lean', leanHud());
    // 戦が決まった後（勝ち・負け・重傷）は、札を引っ込めて、引いていくカメラの絵と字幕だけにする
    setClass(this.root, 'ending', !!guidanceEnded(rt));
    // 必要な時だけ出す札：両軍の兵力の帯と日付は、開戦・形勢が変わった時・号令や地図を開いている間だけ（HUD の三つの層の「要る時」）
    this.armyPeekT = (this.armyPeekT || 0) - dt;
    const peek = !S.hudAutoFade || rt.t < 8 || this.armyPeekT > 0 || p.cmdOpen || p.radial || this.bigmap || rt.ended;
    // 兵力の帯は戦の間ずっと出す（平時は薄くするだけ。peek は号令・地図の間に濃くするのに使う）
    setClass(this.root, 'army-off', false);
    setClass(this.root, 'army-peek', peek);
    // 初めての戦の手ほどきの間は、方角の帯と小地図を出さない（札は戦功・任務・体力・手ほどきだけで始める）
    setClass(this.root, 'novice', !!(rt.tut?.auto || rt.tutPause?.t.auto) && !this.bigmap);
    setClass(this.root, 'date-off', S.hudAutoFade && rt.t > 8 && !this.bigmap && !p.cmdOpen);
    setClass(this.root, 'hc', !!S.hudContrast);
    setClass(this.root, 'subbg', !!S.subBg);
    // 気力の輪（使っているときだけ照準のそばに）
    const spacedCombatCues = rt.def.spacedCombatCues || rt.def.key === 'iwamura' || rt.def.key === 'takato' || rt.def.key === 'shiga' || rt.def.key === 'saika' || rt.def.key === 'okawachi';
    setClass(this.root, 'spaced-combat-cues', spacedCombatCues);
    const ring = $('staring');
    if (!this.staminaLabel) {
      const label = this.staminaLabel = document.createElement('span');
      label.className = 'combat-cue-label stamina-cue';
      label.style.cssText = 'position:absolute;left:calc(50% - 52px);top:calc(50% + 14px);font-size:12px;color:#ece4d2;background:#14120f;padding:2px 4px;pointer-events:none';
      ring.after(label);
    }
    setText(this.staminaLabel, rt.def.staminaLabel || '気力');
    setHidden(this.staminaLabel, p.sta / p.maxSta > .98 || rt.over);
    const sr = p.sta / p.maxSta;
    setHidden(ring, sr > 0.98 || rt.over);
    const ringPct = String(Math.round(sr * 100));
    if (ring.style.getPropertyValue('--p') !== ringPct) ring.style.setProperty('--p', ringPct);
    setClass(ring, 'low', p.sta < 20);
    // 飛ばせる場面の案内
    const sk = $('skiphint');
    // 初めての手ほどきの間は出さない（札は一度に一つ。待ちを飛ばすと手ほどきの間が無くなる）
    // 敵が近い間も出さない（物見と突き合う最中に「飛ばす」が真ん中に出ると、誤って押す）
    if ((this.skipFoeT = (this.skipFoeT || 0) - dt) <= 0) { this.skipFoeT = 0.25; this.skipFoe = !!rt.army.nearestEnemy(p.u, 25, (o) => !o.fleeing && o.type !== 'dummy'); }
    const can = !(rt.tut && rt.tut.auto) && !rt.tutPause && (!this.skipFoe || rt.over && rt.tracker.main === true) && rt.def.canSkip && rt.def.canSkip(rt);
    setHidden(sk, !can);
    if (can) setHtml(sk, `<kbd>${K('skip')}</kbd>${esc(can)}`);
    // 戦況の一行
    const st = $('situation');
    setHidden(st, true); // 全軍の内部集計から優劣を断定しない。
    // 字幕
    // 開戦の題の札の間は、字幕を待たせる（札の後に頭から読めるように）
    const introOn = !$('intro').hidden;
    if (this.shownGoalKey && this.shownGoalKey !== rt.missionGuide?.key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    if (this.subT > 0 && !introOn && this.notices.visible('subtitle')) this.subT -= dt;
    if (this.subT > 0 && this.shownLine && (this.taskRepeats(this.shownLine.speaker, this.shownLine.text) || !battleSpeechAllowed(rt, this.shownLine.speaker, this.shownLine.text, this.shownLine.speakerUnit))) { this.subT = 0; this.shownLine = null; window.speechSynthesis?.cancel(); setHtml($('subtitle'), ''); }
    while (this.subQ.length && (!battleSpeechAllowed(rt, this.subQ[0].speaker, this.subQ[0].text, this.subQ[0].speakerUnit) || this.taskRepeats(this.subQ[0].speaker, this.subQ[0].text) || this.subQ[0].goalKey && this.subQ[0].goalKey !== rt.missionGuide?.key || !this.notices.repeatOk(this.subQ[0].text))) this.subQ.shift();
    const continuation = this.subT <= 0 && this.shownLine?.remaining &&
      (!this.shownLine.goalKey || this.shownLine.goalKey === rt.missionGuide?.key) &&
      !this.taskRepeats(this.shownLine.speaker, this.shownLine.text) &&
      battleSpeechAllowed(rt, this.shownLine.speaker, this.shownLine.text, this.shownLine.speakerUnit);
    if (this.subT <= 0 && !introOn && this.notices.room(70) &&
      (continuation || this.subQ.length && this.notices.repeatOk(this.subQ[0].text, true))) {
      const s = continuation ? this.shownLine : this.subQ.shift();
      const [page, remaining] = subtitlePage(s.speaker, continuation ? s.remaining : s.text, rt.def.key === 'honnoji' && !s.speaker);
      s.remaining = remaining;
      const duration = Math.max(3, s.dur * page.length / Math.max(1, s.text.length), 1.2 + page.length * .11);
      this.shownLine = s;
      this.shownGoalKey = s.goalKey;
      s.shown = true;
      s.t = Math.floor(rt.t);
      // 話し手ごとに色を変える（上官・名のある人は金、自分は白、足軽は灰、敵は朱）
      // 敵か味方かは、話し手の名の家と、戦場にいるその名の者の陣営で決める
      const foeStem = rt.def.sides && rt.def.sides.b && rt.def.sides.b.name ? rt.def.sides.b.name.replace(/軍$/, '') : '';
      const foe = s.speaker && ((foeStem && s.speaker.includes(foeStem)) || (rt.def.foeNames || []).some((n) => s.speaker.includes(n)) || rt.army.groups.some((g) => g.team !== 0 && g.name && g.name !== '町の人' && s.speaker.includes(g.name)) || rt.army.units.some((o) => o.name && o.team !== 0 && (o.name === s.speaker || o.name.endsWith(s.speaker))));
      const sc = !s.speaker ? '' : s.speaker === rt.G.name ? 'me' : foe ? 'foe' : /足軽|伝令/.test(s.speaker) ? 'grunt' : 'lord';
      const pageHtml = rt.def.key === 'honnoji' && !s.speaker
        ? esc(page).replace(/本能寺|（油小路蛸薬師）|天正十年六月二日|夜明け前/g, word => `<span class="place-word">${word}</span>`)
        : rt.def.town
          ? (page.match(/[^。！？]+[。！？]?|[。！？]/g) || []).map(sentence => `<span class="town-sentence">${esc(sentence)}</span>`).join('')
        : esc(page);
      setHtml($('subtitle'), (s.speaker ? `<span class="sp ${sc}">${esc(s.speaker)}</span>` : '') + `<span class="${s.speaker ? '' : 'sys'}">${pageHtml}</span>` +
        (this.subDrop ? `<small class="more">台詞を一部とばしました（${isTouch ? '字幕を押すと会話の記録' : `<kbd class="cap">${esc(K('log').replace(/^文字([上中下])段(\d+)$/, '文字キーの$1段、左から$2番目'))}</kbd> で会話の記録`}）</small>` : ''));
      if (!this.subQ.length) this.subDrop = false;
      if (s.speaker) speaking(duration);
      // 戦の声（war_speech.js）が同じ言葉を言えたら、読み上げの声は重ねない。
      if (continuation || !rt.warSpeech?.line(s.speaker, s.text, s.speakerUnit, this.canSpeak(s.speaker))) this.speak(s.speaker, page);
      // 畳まれていた時間は数えず、読む時間を確保する。
      this.subT = duration;
      this.notices.sources[3].born = this.notices.clock;
    } else if (this.subT <= 0) setHtml($('subtitle'), '');
    // ゲージ
    setHtml($('h-who'), `${esc(G.name)}<small>${esc(rankLabel(G))}</small>`);
    const hpEl = $('h-hp');
    const hpPct = Math.max(0, Math.min(100, u.hp / u.maxHp * 100));
    const fallen = !u.alive || u.hp <= 0;
    // 生きている間は切り捨てで零にせず、倒れた時と区別する。
    const hpShown = fallen ? 0 : Math.max(1, Math.floor(hpPct));
    if (!this.hpRemaining || this.hpRemaining.parentElement !== hpEl) {
      this.hpRemaining = document.createElement('b');
      this.hpRemaining.className = 'hp-remaining';
      hpEl.appendChild(this.hpRemaining);
    }
    setText(this.hpRemaining, `◇ 自分の命 ${hpShown}％`);
    const hpTrack = hpEl.querySelector('i');
    setAttr(hpTrack, 'role', 'progressbar');
    setAttr(hpTrack, 'aria-label', '自分の残りの命');
    setAttr(hpTrack, 'aria-valuemin', 0);
    setAttr(hpTrack, 'aria-valuemax', 100);
    setAttr(hpTrack, 'aria-valuenow', hpShown);
    // 一本の太い塗りを実際の残量に合わせる。
    if (!this.hpFill || this.hpTrack !== hpTrack) {
      this.hpTrack = hpTrack;
      hpTrack.innerHTML = '<strong></strong>';
      this.hpFill = hpTrack.firstElementChild;
    }
    // 数字と塗りは同じ残量。枠内の塗りは、親の配置や高さの割合に依存させない。
    setCssVar(hpTrack, '--hp-ratio', hpShown / 100);
    setAttr(hpTrack, 'aria-valuetext', fallen ? '倒れた' : `残り${hpShown}％`);
    const tcLow = isTouch && document.documentElement.classList.contains('tc-low');
    const emEl = hpEl.querySelector('em');
    // 軽いけがも命の表示へまとめ、同じ知らせは八秒あける。
    if (this.injuryRt !== rt) { this.injuryUntil = 0; this.injuryNextAt = 0; }
    if (this.injuryRt === rt && u.alive && !rt.over && u.hp < this.injuryHp - .1 && rt.t >= this.injuryNextAt) {
      this.injuryUntil = rt.t + 1.2; this.injuryNextAt = rt.t + 8;
    }
    this.injuryRt = rt; this.injuryHp = u.hp;
    const recentInjury = u.alive && !rt.over && rt.t < this.injuryUntil;
    const bloodLoss = !fallen && u.wounds?.bleed > 0.0001;
    const deep = u.hp < u.maxHp * 0.3;
    const woundEffectMin = rt.def.woundEffectMin ?? 0;
    const slowWound = u.woundSlow > woundEffectMin;
    const wound = woundText(u).replace('胴', '体').replace('腿', 'もも').replace('の骨の傷', 'の骨に けが').replace('に傷', 'に けが');
    const wounded = fallen || bloodLoss || deep || slowWound || u.armWound > woundEffectMin || !!wound;
    const injury = fallen ? '倒れた' : bloodLoss ? '血が出ている' : deep ? '命が少ない' : wound;
    const woundEffect = !fallen && (slowWound || u.armWound > woundEffectMin)
      ? rt.def.woundEffectText?.(rt, slowWound) ?? (slowWound ? '足のけが' : '腕のけが') : '';
    const footSign = '<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M13 3H24L21 22L29 27V33H7V25L11 19Z" fill="currentColor"/><path d="M10 14L23 18M9 19L22 23" stroke="#14120f" stroke-width="3"/></svg>';
    const effect = woundEffect ? `${slowWound ? footSign : ''}${esc(woundEffect)}` : '';
    const injurySign = bloodLoss ? '<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 2C13 9 4 17 4 24A12 12 0 0 0 28 24C28 17 19 9 16 2Z" fill="currentColor"/></svg>' : deep ? '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 4L28 28M10 2L30 22M2 10L22 30" fill="none" stroke="currentColor" stroke-width="4"/></svg>' : '';
    // 命の札には状態だけを書き、退く操作は案内一枚に任せる。
    const shortInjury = fallen ? injury : deep ? '命が少ない' : bloodLoss ? '血が出ている' : recentInjury ? 'けがをした' : '';
    const flee = !fallen && !rt.over && retreatRequired(rt) && !p.treatmentReady &&
      !(this.retreatGuide?.active && this.retreatGuide.valid &&
        Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) < this.retreatGuide.radius);
    // 傷は命の札へ、退く指示は行き先に結ぶ任務札へ置く。
    setHtml(emEl, VIEW.h <= 500 ? esc(shortInjury) : fallen ? esc(injury) : deep || bloodLoss ? injurySign + esc(injury) + (effect ? `<small>${effect}</small>` : '') : recentInjury ? esc(shortInjury) : effect || esc(injury));
    setClass(hpEl, 'healthy', hpPct >= 100 && !wounded);
    setClass(hpEl, 'blood-loss', bloodLoss);
    setHidden(emEl, !fallen && !deep && !bloodLoss && !recentInjury && !flee);
    if (tcLow) setStyle(emEl, "fontWeight", '800');
    // 深手（三割を切る）は言葉でも示す。
    setClass(hpEl, 'deep', deep);
    setClass(hpEl, 'bleeding', u.alive && !rt.over && u.hp < 40 && u.wounds?.bleed > 0.0001 && !S.reduceMotion);
    this.deepWas = deep;
    setText(hpEl.querySelector('span'), 'いのち');
    // 他の帯の省略判定は保ち、命だけは満ちていても見せる。
    const bl = hpEl.parentElement;
    if (bl) setClass(bl, 'full', u.hp >= u.maxHp && p.sta >= p.maxSta * 0.98 && (!p.canRide || p.horseHp >= p.horseMax * 0.98));
    const staEl = $('h-sta');
    setWidth(staEl.querySelector('b'), Math.max(0, p.sta / p.maxSta * 100));
    setText(staEl.querySelector('em'), p.sta < 20 ? '息切れ' : p.sta < p.maxSta * 0.6 ? '疲れ' : '');
    setClass(staEl, 'low', p.sta < 20);
    if (p.sta < 20 && !this.breathHelp && !rt.over) { this.breathHelp = true; this.notices.push('息切れ。止まって息を整える', 85, 4); }
    // 気力の棒は減った時だけ（満ちていれば照準のそばの輪も消えている）
    setClass(staEl, 'full', p.sta >= p.maxSta * 0.98);
    let moraleSum = 0;
    for (const g of rt.squadGroups) moraleSum += Math.max(0, g.morale);
    const mor = rt.squadGroups.length ? moraleSum / rt.squadGroups.length : rt.hostGroup ? Math.max(0, rt.hostGroup.morale) : 100;
    const morEl = $('h-mor');
    setWidth(morEl.querySelector('b'), mor);
    setText(morEl.querySelector('em'), moraleWord(mor));
    setClass(morEl, 'low', mor < 40);
    if (mor < 40 && !this.moraleHelp && !rt.over) { this.moraleHelp = true; this.notices.push('組が動揺している。号令が届いても動きが鈍ることがある', 85, 5); }
    // 馬の体力と息（馬に乗れる身分から）
    const hEl = $('h-horse'), bEl = $('h-breath');
    // 馬の札は乗っている時か、馬が傷ついた・逃げた時だけ
    const horseNote = p.canRide && (p.mounted || p.horseHp < p.horseMax * 0.98 || (p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee')));
    setHidden(hEl, !horseNote); setHidden(bEl, !p.canRide || !p.mounted);
    if (p.canRide) {
      const away = !p.mounted && p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee');
      setText(hEl.querySelector('span'), p.horseName);
      setWidth(hEl.querySelector('b'), Math.max(0, p.horseHp / p.horseMax * 100));
      setText(hEl.querySelector('em'), p.mounted ? p.horseHp < p.horseMax * 0.3 ? '深手' : p.horseHp < p.horseMax ? '手傷' : '' : away ? '逃げた・呼べない' : '待っている');
      setClass(hEl, 'low', p.horseHp < p.horseMax * 0.3);
      setWidth(bEl.querySelector('b'), Math.max(0, p.breath / p.maxBreath * 100));
      setText(bEl.querySelector('em'), p.horse?.userData.horse?.exhausted ? '疲れ・並足だけ' : p.breathRest || p.breath <= 5 ? '息切れ・並足で休む' : p.breath < p.maxBreath * 0.25 ? '息が残り少ない' : p.horseHp < p.horseMax * 0.5 ? '傷で足が鈍い' : '落ち着いている');
      setClass(bEl, 'low', p.breathRest || p.breath < p.maxBreath * 0.25);
    }
    // 戦功と次の身分
    this.rank = G.rank; this.hasSquad = rt.squad.length > 0;
    let groupCount = 0;
    for (const g of rt.squadGroups) if (g.count > 0) groupCount++;
    this.manyGroups = groupCount > 1;
    setText($('h-merit'), rt.over ? '戦の終わり' : '戦の最中');
    setText($('h-next'), '');
    setWidth($('h-nextbar'), 0);
    setText($('h-cap'), '');
    // 被弾
    if (this.hurtT > 0) this.hurtT -= dt;
    setClass($('vignette'), 'hurt', this.hurtT > 0 || u.hp < u.maxHp * 0.3);
    // 息が上がった時（気力が一割半を切る）：画面の縁がゆっくり暗く脈打つ（気力の棒を見なくても分かる）
    setClass($('vignette'), 'winded', u.alive && p.sta < p.maxSta * 0.15 && !(this.hurtT > 0));
    // 深手（三割を切る）：視界の端がにじみ、色が抜け、鼓動に合わせて赤く脈打つ。敵の鉄砲に狙われている間は縁が赤く脈打つ
    tensionCss();
    setClass($('vignette'), 'dying', u.alive && u.hp < u.maxHp * 0.3);
    // 囲まれた時：画面の左右の縁が墨でじわりと狭まる（字を出さずに、下がれ・抜けろと伝える）
    let mob = $('mobfx');
    if (!mob) { mob = document.createElement('div'); mob.id = 'mobfx'; mob.setAttribute('aria-hidden', 'true'); $('vignette').after(mob); }
    setClass(mob, 'on', !!(u.alive && u.mobbed && (rt.army.threats || []).some((o) => sightUnit(rt, o))));
    let aw = $('aimwarn');
    if (!aw) { aw = document.createElement('div'); aw.id = 'aimwarn'; $('vignette').after(aw); }
    setClass(aw, 'on', u.alive && (rt.army.threats || []).some((o) => sightUnit(rt, o) && (o.type === 'gun' || o.type === 'bow')) && !rt.over);
    // 囲み：敵のいる向きの画面の縁が赤黒く染まる（前＝上・後ろ＝下。囲まれつつある時だけ）
    this.encT = (this.encT || 0) - dt;
    if (this.encT <= 0) {
      this.encT = 0.1;
      let ec = $('encircle');
      if (!ec) { ec = document.createElement('div'); ec.id = 'encircle'; $('vignette').after(ec); }
      const E = rt.encircle, on = false; // 全周の内部集計は知らせない。小地図には見える囲みだけ残す。
      setClass(ec, 'on', on);
      if (on) {
        const N = E.sec.length, yaw = p.yaw || 0, st = [];
        for (let j = 0; j < N; j++) {
          // 画面の j 番目の向き（上から時計回り）→ 世界の向き → その向きの敵の数
          const a = -(j * 2 * Math.PI / N) + yaw;
          const w = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const c = E.sec[Math.min(N - 1, Math.floor(w / (2 * Math.PI) * N))];
          const al = c >= 2 ? Math.min(0.75, 0.25 + c * 0.06) : 0;
          st.push(al);
        }
        // 向きの境は硬く切らず、隣の向きへ墨がにじむように（向きの真ん中どうしを滑らかにつなぐ）
        const ink = (a) => `rgba(64,10,4,${a.toFixed(2)})`, wrap = (st[0] + st[N - 1]) / 2;
        let stops = '';
        for (let j = 0; j < st.length; j++) stops += (j ? ', ' : '') + `${ink(st[j])} ${((j + 0.5) * 360 / N).toFixed(1)}deg`;
        setStyle(ec, 'background', `conic-gradient(from ${(-180 / N).toFixed(2)}deg, ${ink(wrap)} 0deg, ${stops}, ${ink(wrap)} 360deg)`);
      }
    }
    // 照準
    const ch = $('crosshair');
    setAttr(ch, 'data-style', S.crosshair);
    setClass(ch, 'inrange', p.inRange);
    let rangeCue = ch._rangeCue;
    if (!rangeCue) { rangeCue = document.createElement('span'); rangeCue.className = 'range-cue'; ch.appendChild(rangeCue); ch._rangeCue = rangeCue; }
    const rangeText = '';   // 「兵に届く」「一歩寄ると届く」は出さない（kaito 10/18「いらない」）
    // 近寄りの案内は近い敵がいる時だけ。任務や台詞には重ねない。
    // この文は、武器の届く距離から一歩以内に敵がいる時だけ作られる。
    const approachMuted = (rangeText === '一歩寄ると届く' &&
      (this.notices.visible('objectives') || this.notices.visible('subtitle'))) ||
      (isTouch && VIEW.h <= 500 && (!!rt.nearestInteract() ||
        (this.notices.picks.length >= 2 && !!rt.missionGuide?.marker)));
    const cueTarget = p.rangeCueTarget;
    const cueOffscreen = !spacedCombatCues && cueTarget && (cueTarget.offscreen || cueTarget.mesh?.visible === false);
    setHidden(rangeCue, !rangeText || approachMuted || cueOffscreen);
    const rangeLabel = rangeText.replace('兵に届く', '敵に届く');
    if (rangeCue.textContent !== rangeLabel) rangeCue.textContent = rangeLabel;
    // 岩村・高遠は照準の上に固定。ほかの戦は頭の脇へ、投影用の入れ物を使い回す。
    if (!rangeCue.hidden && !spacedCombatCues && cueTarget && cueTarget.alive) {
      const head = cueTarget.human?.bones?.Head || cueTarget.head;
      if (head) { head.getWorldPosition(this.tmpV); this.tmpV.y += 0.2; }
      else this.tmpV.set(cueTarget.pos.x, cueTarget.pos.y + (cueTarget.mounted ? 3.1 : 1.9) * (cueTarget.mesh?.scale.y || 1), cueTarget.pos.z);
      this.tmpV.project(rt.camera);
      const x = (this.tmpV.x * 0.5 + 0.5) * VIEW.w, y = (-this.tmpV.y * 0.5 + 0.5) * VIEW.h;
      setHidden(rangeCue, !rangeText || approachMuted || this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1);
      setStyle(rangeCue, 'position', 'fixed');
      const sizeKey = rangeText + ':' + VIEW.w + ':' + VIEW.h;
      if (this.rangeCueSizeKey !== sizeKey && !rangeCue.hidden) {
        this.rangeCueSizeKey = sizeKey; this.rangeCueWidth = rangeCue.offsetWidth || 112;
      }
      const width = this.rangeCueWidth || 112;
      const left = x < VIEW.w / 2 ? x + 36 : x - width - 36;
      let top = y - 10;
      // 田野の肩越し視点では気力の輪・照準・連撃の周りを空ける。
      // 頭の脇の札が中央へ入る時だけ下へ避け、ほかの戦の配置は保つ。
      if (rt.def.rangeCueClearCenter && left < VIEW.w / 2 + 100 && left + width > VIEW.w / 2 - 100 &&
          top < VIEW.h / 2 + 56 && top + 28 > VIEW.h / 2 - 40) top = VIEW.h / 2 + 64;
      setStyle(rangeCue, "left", `${Math.max(8, Math.min(VIEW.w - width - 8, left))}px`);
      setStyle(rangeCue, "top", `${Math.max(8, Math.min(VIEW.h - 28, top))}px`);
      setStyle(rangeCue, "transform", 'none');
    } else if (rangeCue.style.position) {
      setStyle(rangeCue, 'position', ''); setStyle(rangeCue, "left", ''); setStyle(rangeCue, "top", ''); setStyle(rangeCue, "transform", '');
    }
    setClass(ch, 'guard', p.guard);
    setClass(ch, 'counter', p.counterT > 0);
    setClass(ch, 'charge', !!p.charging);
    setClass(ch, 'charged', p.chargeT > 0.7);
    // 鉄砲：照準を小さな輪に。縁は込め直しの進み、込め終えて構えたら金の輪（撃てる合図）
    const gunOn = p.weapon === 'gun';
    setClass(ch, 'gun', gunOn);
    if (gunOn) {
      const ready = !!p.gunLoaded;
      setClass(ch, 'gaim', (p.aimK || 0) > 0.5);
      setClass(ch, 'gready', ready);
      setCssVar(ch, '--rl', `${Math.round((ready ? 1 : p.gunReload || 0) * 100)}%`);
      if (ready && !this.gunReadyWas) { ch.classList.remove('gping'); void ch.offsetWidth; ch.classList.add('gping'); }
      this.gunReadyWas = ready;
    } else this.gunReadyWas = true;
    // 金の輪にも意味を添える。札は一つだけ作り、状態に応じて字を替える。
    if (!this.crosshairLabel) {
      const label = this.crosshairLabel = document.createElement('span');
      label.className = 'combat-cue-label';
      label.style.cssText = 'position:absolute;left:calc(50% + 24px);top:calc(50% - 32px);font-size:12px;line-height:1.4;color:#ece4d2;background:#14120f;padding:2px 4px;pointer-events:none';
      ch.after(label);
    }
    const cue = gunOn ? p.gunLoaded ? '撃てる' : '弾を込める' : p.counterT > 0 ? '打ち返せる' : p.charging ? p.chargeT > 0.7 ? '突きを溜めた' : '突きを溜める' : '';
    if (this.crosshairLabel.textContent !== cue) this.crosshairLabel.textContent = cue;
    setHidden(this.crosshairLabel, !cue || rt.over);
    // 近くに敵の武将がいれば、画面上部に大きく名前と体力
    const boss = $('boss');
    let bu = null, bd = 30;
    for (const o of this.bossCandidates || []) {
      // 名のある敵（武将と名のある侍）。討たれない武将も、手傷で退くまでは体力を見せる（当たっているかが分かるように）
      if (o.offscreen || !o.alive || o.team === 0 || o.woundOut || !sightUnit(rt, o) || !enemyKnown(rt, o)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // 敵将の札は、名乗りの直後・狙っている時・すぐそば（14m）にいる時だけ
      if (d > 14 && p.lock !== o && !(o.announced && (o.annT ??= rt.t) + 6 > rt.t)) continue;
      if (d < bd) { bd = d; bu = o; }
    }
    const duel = rt.army.duel;
    if (duel && !duel.foe.offscreen && sightUnit(rt, duel.foe) && enemyKnown(rt, duel.foe)) bu = duel.foe;
    // 敵将の札がある時は、同じ高さの戦況の一行を隠す
    if (bu) setHidden($('situation'), true);
    // 近くで見える敵将の構えと傷だけ。
    if (bu && !rt.def.routeGuidePriority?.(rt) && !rt.guideEnemyShown && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && rt.missionGuide?.marker?.guideArea !== 'retreat') {
      // 傷は見えた手応えだけを言葉にする。残り体力や退く下限は知らせない。
      const stance = duel && bu === duel.foe ? rt.army.time < duel.naT ? '敵が名乗った' : duel.bind ? '敵と押し合い' : duel.openT > rt.army.time ? '敵にすきあり' : bu.atk && bu.atk.heavy ? '敵が強く打つ' : bu.guarding > 0 ? '敵がかまえた' : rt.def.duelStanceText || '敵と一騎打ち' : '';
      setHidden(boss, false);
      setClass(boss, 'field-boss', true);
      const at = this.project(bu.pos, bu.pos.y + (bu.mounted ? 3.3 : 2.35), rt);
      const off = at.behind || at.x < 80 || at.x > VIEW.w - 80 || at.y < 90 || at.y > VIEW.h - 64;
      const angle = Math.atan2(bu.pos.x - u.pos.x, bu.pos.z - u.pos.z) - p.yaw - (p.camYawOff || 0);
      const arrow = off ? Math.cos(angle) < -.5 ? '↓' : Math.sin(angle) > 0 ? '←' : Math.sin(angle) < 0 ? '→' : '↑' : '';
      setClass(boss, 'edge', off);
      setClass(boss, 'symbol-only', singleBattleGuide(rt) && !duel);
      setHtml(boss, singleBattleGuide(rt) && !duel ? `<span aria-hidden="true">${arrow}▼</span>` : `<span>${arrow}敵の大将${stance ? `<br>${esc(stance)}` : ''}</span>`);
      setCssVar(boss, 'left', `${off ? VIEW.w / 2 - Math.sin(angle) * (VIEW.w / 2 - 88) : at.x}px`, 'important');
      setCssVar(boss, 'top', `${Math.max(90, Math.min(VIEW.h - 72, off ? VIEW.h / 2 - Math.cos(angle) * (VIEW.h / 2 - 90) : at.y - 12))}px`, 'important');
      setAttr(boss, 'aria-label', `敵の大将。${stance || (bu.atk ? '敵が打ってくる' : bu.guarding > 0 ? '敵がかまえた' : bu.lastHitT < 5 ? woundHint(bu) : '構えて防げ')}`);
    }
    else setHidden(boss, true);
    // 狙っている敵
    const tg = $('target');
    const a = p.lock?.alive ? p.lock : p.aimed;
    // 狙いの札は、名のある者・侍・武将か、狙い定めた時だけ（平の足軽は頭の上の棒で足りる）
    if (a && !a.offscreen && !rt.def.routeGuidePriority?.(rt) && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !rt.guideEnemyShown && !rt.def.objectiveEnemies?.(rt)?.length && !(rt.missionGuide?.marker && /旗|組の列/.test(rt.missionGuide.label)) && a.alive && a.team !== u.team && !a.noTarget && sightUnit(rt, a) && (!a.isOfficer || enemyKnown(rt, a)) && (p.lock || Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 9)) {
      setHidden(tg, false);
      setClass(tg, 'locked', !!p.lock);
      setClass(tg, 'field-target', true);
      const at = this.project(a.pos, a.pos.y + (a.mounted ? 3.3 : 2.35), rt);
      setStyle(tg, 'left', Math.max(64, Math.min(VIEW.w - 64, at.x)) + 'px');
      setStyle(tg, 'top', Math.max(64, Math.min(VIEW.h - 64, at.y - 48)) + 'px');
      setHtml(tg, '<span aria-hidden="true">ねらう敵</span>');
      setAttr(tg, 'aria-label', '狙っている敵');
      if (at.behind) setHidden(tg, true);
    } else setHidden(tg, true);
    if (!this.victoryLabel) {
      this.victoryLabel = document.createElement('div');
      this.victoryLabel.className = 'victory-condition';
      $('objectives').prepend(this.victoryLabel);
      this.actionLabel = document.createElement('div');
      this.actionLabel.className = 'battle-action';
      this.actionLabel.hidden = true;
      this.actionLabel.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.actionLabel.addEventListener('keydown', (e) => {
        if (e.target.closest('button')) e.stopPropagation();
      });
      this.actionLabel.addEventListener('click', (e) => {
        if (!e.target.closest('.dismount-action')) return;
        e.stopPropagation();
        const rt = this.rt;
        if (rt && !rt.choice && !rt.over && rt.player.mounted) rt.player.toggleMount();
      });
      $('objectives').prepend(this.actionLabel);
    }
    setText(this.victoryLabel, `勝つには：${rt.victoryText()}`);
    setHidden(this.victoryLabel, !!rt.def.town || !!rt.def.dojo);
    setClass(this.root, 'mission-visible', !rt.def.town && !rt.def.dojo && !rt.over);
    setClass($('objectives'), 'goal-changed', rt.t < (this.goalFlashUntil || 0));
    // 任務
    // 済んだ任務は 8 秒見せたら畳んで「済 n」にまとめる（今やる事を埋もれさせない）
    this.doneAt = this.doneAt || new Map();
    for (const o of rt.objectives) if (o.state === 'done' && !this.doneAt.has(o.id + o.text)) this.doneAt.set(o.id + o.text, rt.t);
    const folded = this.foldedObjectives || (this.foldedObjectives = []); folded.length = 0;
    for (const o of rt.objectives) if (o.state === 'done' && rt.t - this.doneAt.get(o.id + o.text) > 8) folded.push(o);
    // 案内の半秒ごとの更新を待たず、札は現在の任務から選ぶ。
    // 次の下知まで間が空いても、畳んだ済の札だけになって欄が空にならないようにする。
    this.waitObjective ||= { id: '_wait', kind: 'guide', text: '組のそばで構え、次の下知を待て', state: '' };
    setClass($('objectives'), 'task-details', !!rt.def.taskDetails);
    setClass($('objectives'), 'keep-combat-task', !!rt.def.keepCombatTask);
    setClass($('objectives'), 'keep-guard-task', !!rt.def.keepTaskWithGuard);
    setClass($('objectives'), 'keep-dodge-task', !!rt.def.keepTaskWithDodge);
    const goalObjective = currentObjective(rt) || (!rt.over && !rt.def.town && !rt.def.dojo ? rt.missionGuide?.waitObjective || this.waitObjective : null);
    const guide = rt.missionGuide?.objective === goalObjective ? rt.missionGuide : null;
    const filler = goalObjective && !rt.objectives.includes(goalObjective) ? goalObjective : null;
    // 同じ任務の細かな言い換えは十秒待つ。済・失敗・次の任務はすぐ反映する。
    if (goalObjective && (goalObjective.id !== this.taskShownId || (rt.def.immediateTaskChanges && goalObjective.text !== this.taskShownText) || (rt.def.immediatePhaseTasks && this.taskShownPhase !== rt.phase) || rt.t - (this.taskShownAt ?? -99) >= 10)) {
      this.taskShownId = goalObjective.id; this.taskShownText = goalObjective.text; this.taskShownAt = rt.t;
      this.taskShownPhase = rt.phase;
    }
    if (!goalObjective) this.taskShownId = null;
    // 戦ごとの短い案内と、共通・各戦のやさしい言い換えを両方反映する。
    let shownTaskLabel = goalObjective ? shortTask(fieldLabel(destinationText(rt, taskText(rt, taskLabel(rt, this.taskShownText || goalObjective.text))))) : '';
    if (!rt.def.keepTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive &&
        !(rt.def.key === 'okehazama' && rt.phase === 'assault' && rt.flags.entered && !rt.flags.victory)) {
      shownTaskLabel = 'この敵を たおす';
    } else if (!rt.def.keepTaskLabel && rt.guideEnemyDirection) {
      shownTaskLabel = 'あの旗へ すすめ';
    } else if (/この敵を\s*たおす/.test(shownTaskLabel)) {
      shownTaskLabel = 'この敵を たおす';
    }
    if (!singleBattleGuide(rt) && !rt.def.keepGuardTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive && /敵.*止め|敵.*押し返/.test(shownTaskLabel)) {
      const distance = Math.hypot(rt.guideEnemy.pos.x - p.u.pos.x, rt.guideEnemy.pos.z - p.u.pos.z);
      shownTaskLabel = distance > 3 ? `近づいて とめよう・約${Math.ceil(distance / .75)}歩` : 'かまえて すきに つこう';
    }
    if (!rt.def.keepTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive && /この.*てき|この敵|敵.*止め|敵.*押し返/.test(shownTaskLabel)) shownTaskLabel = 'この敵を たおす';
    if (!rt.def.keepTaskPanel && this.attackGuideEnemy?.alive && this.guardFacing) shownTaskLabel = 'この敵を たおす';
    const waitingOrder = !!guide?.marker && (guide.marker.guideArea === 'wait' || guide.marker.guideArea === 'guard' || !!guide.marker.waitGuide) && !rt.guideEnemyShown;
    if (waitingOrder) {
      const reached = (guide.marker.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide.distance) < (guide.marker.guideRadius || 8);
      shownTaskLabel = (rt.def.keepWaitOrderLabel && rt.def.waitOrderLabel?.(rt, reached)) ||
        (!reached ? guide.marker.guideArea === 'guard' ? 'ここへ進め' : '旗まで すすむ' : rt.def.waitOrderLabel?.(rt, reached) ||
        (guide.marker.guideArea === 'guard' ? rt.player.guard ? '押したまま ふせごう' :
          isTouch ? 'ながおしで まもる' : S.guardToggle ? '右クリックで かまえよう' : '右クリックを 長くおそう' : 'ここで待とう'));
    }
    setClass($('objectives'), 'wait-order', waitingOrder);
    const atWait = guide?.marker?.waitAction && guide.distance < (guide.marker.guideRadius || 8) && !rt.guideEnemyShown;
    const waitUntil = atWait ? guide.marker.waitUntil?.() : null;
    const timedWait = rt.def.key !== 'anegawa' && Number.isFinite(waitUntil) && waitUntil > rt.t && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army);
    setClass($('objectives'), 'timed-wait', timedWait);
    if (timedWait) setCssVar($('objectives'), '--wait-progress',
      `${Math.round(Math.max(0, Math.min(1, 1 - (waitUntil - rt.t) / (guide.marker.waitDuration || 1))) * 100)}%`);
    if (atWait) {
      shownTaskLabel = timedWait ? `敵の寄せまで あと${Math.max(1, Math.ceil(waitUntil - rt.t))}秒` :
        rt.def.waitActionText?.(rt) || (rt.player.guard ? '一撃を防いで つく' : isTouch ? '押して構え、一撃を防ぐ' :
        S.guardToggle ? '右クリックで構える' : '右クリックを押し続ける');
    }
    // 待つ案内を出す時は、同じ操作を親指の届く場所で必ず押せるようにする。
    if (!this.waitGuardButton) {
      const button = this.waitGuardButton = document.createElement('button');
      button.id = 'wait-guard'; button.type = 'button'; button.hidden = true;
      button.innerHTML = '<svg viewBox="-26 -34 64 80" aria-hidden="true"><circle cy="-12" r="18" fill="none" stroke="#655f50" stroke-width="4"/><circle class="hold-progress" cy="-12" r="18" fill="none" stroke="#fff3ba" stroke-width="4"/><path class="swipe-hand" d="M-6 10V-12C-6-22 6-22 6-12V6L12 2L26 12L22 32H-5L-20 16C-28 5-16 0-6 14Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg><svg viewBox="0 0 48 56" aria-hidden="true"><g class="shield-sign"><path d="M5 5H43V28Q42 44 24 52Q6 44 5 28Z" fill="none" stroke="#fff3ba" stroke-width="4"/><path d="M24 14V37M14 25H34" stroke="#fff3ba" stroke-width="4"/></g><path class="release-sign" d="M8 24L24 8L40 24M8 46L24 30L40 46" fill="none" stroke="#fff3ba" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span><small></small>';
      const meter = document.createElement('i');
      meter.className = 'guard-meter'; meter.setAttribute('aria-hidden', 'true');
      meter.innerHTML = '<b></b>';
      button.insertBefore(meter, button.lastElementChild);
      let heldBattle = null, heldPointer = null;
      const start = () => {
        const battle = this.rt, input = touchInput();
        if (!heldBattle && !button.disabled && !button.hidden && battle?.player.u.alive && !battle.over && !battle.choice && input) {
          heldBattle = battle;
          this.waitGuardHeldBattle = battle;
          input.touchGuardToggle = true; input.mouseR = true;
          input.rightPressed = !battle.player.guardOn;
        }
      };
      const release = this.releaseWaitGuard = () => {
        if (!heldBattle) return;
        heldBattle.player.guardOn = false;
        const input = touchInput();
        if (input) { input.mouseR = false; input.rightPressed = false; }
        heldBattle = null; heldPointer = null;
        this.waitGuardHeldBattle = null;
      };
      button.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        if (e.button !== 0 || heldBattle) return;
        start();
        if (heldBattle) { heldPointer = e.pointerId; button.setPointerCapture(e.pointerId); }
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, e => {
        e.stopPropagation();
        if (e.pointerId === heldPointer) release();
      });
      button.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); }
      });
      button.addEventListener('keyup', e => {
        e.stopPropagation();
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); }
      });
      button.addEventListener('blur', release);
      window.addEventListener('blur', release);
      button.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); });
      this.root.appendChild(button);
    }
    // 反撃のすきも押している札を残し、指を離してから攻撃の案内へ渡す。
    const guardHeld = this.waitGuardHeldBattle === rt;
    const releaseReady = guardHeld && !!(this.approachGuideEnemy || this.counterGuideEnemy || rt.def.releaseGuardForAttack && this.attackGuideEnemy);
    const guardDistance = guide?.marker?.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide?.distance;
    const guardOrder = guide?.marker && guardDistance < (guide.marker.guideRadius || 8) &&
      (guide.marker.guideArea === 'guard' || /かまえる|構え/.test(shownTaskLabel)) && !this.attackGuideEnemy;
    const outsideGuardPost = guide?.marker?.guideArea === 'guard' && guardDistance >= (guide.marker.guideRadius || 8);
    const waitGuard = isTouch && !outsideGuardPost && ((guardHeld || !this.approachGuideEnemy) &&
      !(this.defendEnemy?.alive && !this.guardFacing) && rt.def.waitGuardAllowed?.(rt, this.defendEnemy || this.guardThreat) !== false &&
      (guardHeld || !this.counterGuideEnemy && !(rt.def.releaseGuardForAttack && this.attackGuideEnemy)) && (guardHeld ||
      guardOrder ||
      guide?.marker?.waitAction && guide.distance < (guide.marker.guideRadius || 8) && !rt.guideEnemyShown ||
      this.defendEnemy?.alive && !this.attackGuideEnemy ||
      this.guardThreat?.alive && !this.attackGuideEnemy && Math.cos(Math.atan2(this.guardThreat.pos.x - rt.player.u.pos.x,
        this.guardThreat.pos.z - rt.player.u.pos.z) - rt.player.yaw) > .85)) &&
      rt.player.u.alive && !rt.over && !rt.choice && !rt.player.camShot && !rt.player.radial && !rt.player.cmdOpen &&
      !this.bigmap && !this.openingActive && !guidanceEnded(rt) && !rt.dodgeGuide && !retreatRequired(rt) &&
      !this.retreatGuide?.active && !rainDanger(rt.army) && !rt.def.town && !rt.def.dojo &&
      rt.player.weapon !== 'bow' && rt.player.weapon !== 'gun' && !$('objectives').classList.contains('expand');
    if (!waitGuard || outsideGuardPost) this.releaseWaitGuard();
    setHidden(this.waitGuardButton, !waitGuard);
    setClass(this.root, 'wait-guard-active', !!waitGuard);
    setClass(this.root, 'hand-action-guide', isTouch && !rt.over && !rt.choice && !this.openingActive &&
      !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active &&
      !rt.def.town && !rt.def.dojo && !!(waitGuard || this.defendEnemy?.alive || this.attackGuideEnemy?.alive || this.approachGuideEnemy?.alive));
    const turnEnemy = !this.approachGuideEnemy && this.defendEnemy?.alive && !this.guardFacing ? this.defendEnemy : null;
    const turnAngle = turnEnemy ? Math.atan2(turnEnemy.pos.x - rt.player.u.pos.x, turnEnemy.pos.z - rt.player.u.pos.z) -
      rt.player.yaw - (rt.player.camYawOff || 0) : 0;
    const turnDirection = Math.cos(turnAngle) > .5 ? '前' : Math.cos(turnAngle) < -.5 ? '後ろ' : Math.sin(turnAngle) > 0 ? '左' : '右';
    const turnArrow = turnDirection === '左' ? '←' : turnDirection === '右' ? '→' : turnDirection === '後ろ' ? '↓' : '↑';
    setClass(this.waitGuardButton, 'turn-guard', !!turnEnemy);
    // 実際に振りかぶった敵に合わせる。同じ呼びかけの出し直しは八秒あける。
    const incoming = this.guardThreat?.alive && this.guardThreat.atk?.target === rt.player.u &&
      !this.guardThreat.atk.ranged && !this.guardThreat.atk.bow;
    if (waitGuard && !turnEnemy && incoming && !rt.player.guard && rt.t - this.guardPromptAt >= 8) {
      this.guardPromptAt = rt.t; this.guardPromptUntil = rt.t + 2; this.guardPromptAttack = this.guardThreat.atk;
    }
    // 手の印と動作を端の同じ場所へ。味方を追って敵や道を隠さない。
    const guardNow = waitGuard && !outsideGuardPost && incoming && this.guardThreat.atk === this.guardPromptAttack &&
      !rt.player.guard && rt.t < this.guardPromptUntil;
    setClass(this.waitGuardButton, 'guard-now', !!guardNow);
    // 向き直りと反撃の案内を保ち、待つ場所でも押す操作を一文で示す。
    const groundHold = guide?.marker?.guideArea === 'guard' && !outsideGuardPost;
    const passiveWait = outsideGuardPost || !groundHold && !!rt.def.passiveGuardStatus && rt.player.guard && !guardHeld && !releaseReady;
    setClass(this.waitGuardButton, 'guard-travel', outsideGuardPost);
    setClass(this.waitGuardButton, 'ground-hold', !!groundHold);
    this.waitGuardButton.disabled = passiveWait;
    setClass(this.waitGuardButton, 'wait-status', passiveWait);
    setAttr(this.waitGuardButton, 'role', passiveWait ? 'status' : 'button');
    const guardStatus = rt.def.guardStatusText || 'ここで まつ';
    const quietHold = groundHold && !this.defendEnemy?.alive && !this.guardThreat?.alive && !guardHeld && !rt.player.guard;
    const guardAction = outsideGuardPost ? 'ここへ進め' : guardNow ? 'いま おして！' : passiveWait ? guardStatus : releaseReady ? this.counterGuideEnemy ? 'ふせいだ！ はなす' : '手を はなす' : turnEnemy ? `${turnArrow} ${turnDirection}を向いて かまえる` :
      rt.player.guard ? guardHeld ? '押したまま 敵を止める' : '敵を止める' : guardHeld ? rt.player.guardBroken > 0 ? '体勢を戻す' : 'まもる力がない' : quietHold || groundHold || isTouch ? '長押しで 敵を止める' : rt.def.waitGuardButtonText || 'おして かまえる';
    const guardPurpose = rt.def.guardPurposeText?.(rt) || (groundHold ? 'ここで敵を止めよう' : '刀の印の敵を止めよう');
    const guardHint = passiveWait ? '' : releaseReady ? this.approachGuideEnemy ? rt.def.meleeApproachLabel?.(rt) || '次は 敵へ すすめ' : `次は「${p.weapon === 'sword' ? 'きる' : 'つく'}」を長押し` :
      this.guardThreat?.alive || this.defendEnemy?.alive ? '刀の印の敵に そなえる' :
      timedWait ? `あと${Math.max(1, Math.ceil(waitUntil - rt.t))}秒` :
      '';
    // 時間の決まった待機は残り時間、防御だけの時は実際の気力を同じ札で示す。
    const guardDetail = rt.player.guard && !passiveWait && !releaseReady
      ? timedWait ? `あと${Math.max(1, Math.ceil(waitUntil - rt.t))}秒` : `まもる力 ${Math.max(0, Math.ceil(rt.player.sta / rt.player.maxSta * 100))}％`
      : guardHint;
    setClass(this.waitGuardButton, 'release-ready', releaseReady);
    setText(this.waitGuardButton.querySelector('span'), guardAction);
    const guardCaption = releaseReady || rt.player.guard ? guardDetail : timedWait ? guardHint : '';
    setAttr(this.waitGuardButton, 'aria-label', `${guardPurpose}。${guardAction}${guardDetail ? `。${guardDetail}` : ''}`);
    // 決まった待ち時間は実際の残り秒数に合わせる。構えに架空の完了時間を付けない。
    const waitProgress = timedWait ? Math.max(0, Math.min(1, 1 - (waitUntil - rt.t) / (guide.marker.waitDuration || 1))) : rt.player.guard ? Math.max(0, Math.min(1, rt.player.sta / rt.player.maxSta)) : 0;
    setStyle(this.waitGuardButton, '--hold-progress', String(waitProgress));
    setText(this.waitGuardButton.lastElementChild, guardCaption);
    if (passiveWait) this.waitGuardButton.removeAttribute('aria-pressed');
    else this.waitGuardButton.setAttribute('aria-pressed', String(!!rt.player.guard));
    setStyle(this.waitGuardButton, 'right', '');
    if (this.retreatGuide?.active && this.retreatGuide.valid && this.retreatGuide.treatment)
      shownTaskLabel = treatmentGuideText(rt, this.retreatGuide);
    else if (retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment || guide?.marker?.guideArea === 'retreat') shownTaskLabel = retreatGuideText(rt, this.retreatGuide?.active && this.retreatGuide.valid && Math.hypot(this.retreatGuide.x - rt.player.u.pos.x, this.retreatGuide.z - rt.player.u.pos.z) < this.retreatGuide.radius, 'にげる場所');
    else if (!rt.def.keepRescueTaskLabel && (rescueTarget(rt) || this.guardAlly || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive) && rt.def.guardGuideAllowed?.(rt) !== false) {
      shownTaskLabel = rescueTarget(rt) ? 'この人を助けよう' : 'この人を守れ';
    }
    // 移動中でも目前の斬り合いを先に教える。札は既存の一枚を使う。
    if (!rt.def.keepTaskLabel && navigationEnemy(rt) && !rainDanger(rt.army) && !rt.dodgeGuide && !retreatRequired(rt) &&
        !this.retreatGuide?.active && !this.guardAlly && !rescueTarget(rt) && !(rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive && !waitGuard) {
      shownTaskLabel = isTouch ? `「${p.weapon === 'sword' ? 'きる' : 'つく'}」を押して はなす` : '左クリックで 攻撃';
    }
    if (/^(旗へ行け|この旗へ|この旗へ進め|旗へ進む|旗まで進む)$/.test(shownTaskLabel)) shownTaskLabel = '旗へ進もう';
    // 行き先と歩数を同じ一行へ。到着判定は元の持ち場の半径に合わせる。
    const flagTravel = groundFlag(guide) && !rt.guideEnemyShown && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army);
    const flagSteps = flagTravel ? Math.ceil((guide.distance - (guide.marker.guideRadius || 8)) / .75) : 0;
    if (flagTravel && flagSteps > 0 && (!rt.def.keepFlagTravelTask || /旗.*(?:へ|戻|下が)/.test(shownTaskLabel)) && !rt.def.hideGuideSteps) shownTaskLabel = rt.def.flagTravelLabel?.(rt, shownTaskLabel, flagSteps) || `旗まで あと${flagSteps}歩`;
    else if (flagTravel && !rt.def.keepFlagArrivalTask && /敵.*止め/.test(shownTaskLabel)) shownTaskLabel = 'ここで とまろう';
    // 歩数は既存の任務札へ。向きは地上の一本の矢印で示す。
    const unifiedDestination = !recovering(rt) && !!guide?.marker && singleBattleGuide(rt) &&
      (flagTravel && flagSteps > 0 && !waitingOrder || guide.marker.guideTalk) && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rt.guideEnemyShown;
    const destinationSteps = flagTravel ? flagSteps : Math.max(0, Math.ceil((guide?.distance || 0) / .75));
    if (unifiedDestination && flagTravel && !rt.def.keepFlagTravelTask && !rt.def.hideGuideSteps) shownTaskLabel = `旗まで あと${flagSteps}歩`;
    if (guide?.marker?.guideDefend && !rt.guideEnemyShown && !rt.def.keepDefendTaskLabel) shownTaskLabel = 'この旗を守ろう';
    if (recovering(rt)) shownTaskLabel = rt.def.recoveryTaskLabel?.(rt) || '立つまで まとう';
    // 教えの戦でない戦は、行き先と行動だけを書く（操作のやり方は出さない）
    if (rt.teachOn && !rt.teachOn()) shownTaskLabel = noOps(shownTaskLabel);
    setClass($('objectives'), 'route-summary', singleBattleGuide(rt) && !!guide?.marker && !rt.guideEnemyShown && !rt.dodgeGuide && !waitGuard && !this.retreatGuide?.active);
    setClass($('objectives'), 'unified-destination', unifiedDestination);
    const routeOrder = singleBattleGuide(rt) && !!guide?.marker && !flagTravel && !waitingOrder &&
      !guide.marker.guidePerson && !guide.marker.entrance && !guide.marker.guideSymbol &&
      !rt.guideEnemyShown && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active;
    setClass($('objectives'), 'route-order', routeOrder);
    setClass($('objectives'), 'flag-travel-order', !!flagTravel);
    setClass($('objectives'), 'goal-flag-order', /旗|はた/.test(shownTaskLabel) && !rt.def.town && !rt.def.dojo);
    setClass($('objectives'), 'attack-order', !!rt.guideEnemyShown);
    setClass($('objectives'), 'flag-order', shownTaskLabel === 'この はたへ');
    setClass($('objectives'), 'destination-order', !!guide?.marker && !guide.marker.guideArea && !rt.guideEnemyShown);
    setClass($('objectives'), 'arrived-order', !!guide?.marker && guide.distance < 8);
    const retreatMoving = this.retreatGuide?.active && this.retreatGuide.valid &&
      Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) >= this.retreatGuide.radius;
    // どちらもない時の未定義どうしの一致を、退路の一致として扱わない。
    const retreatWay = this.retreatGuide?.treatment ? this.retreatGuide : this.travelGuide && this.retreatGuide &&
      this.travelGuide.gx === this.retreatGuide.x && this.travelGuide.gz === this.retreatGuide.z
      ? this.travelGuide.retreatWay || this.retreatGuide : this.retreatGuide;
    this.retreatMoveDirection = retreatMoving && isTouch ? this.navigationDirection(rt, retreatWay) : '';
    this.retreatMoveAt = rt.t;
    const retreatCaption = retreatMoving && isTouch && !this.retreatGuide.treatment;
    const retreatGesture = retreatCaption ? this.navigationGesture(rt, retreatWay) : '';
    setClass($('objectives'), 'touch-retreat-coach', !!retreatCaption);
    if (retreatMoving) shownTaskLabel = this.retreatGuide.treatment
      ? treatmentGuideText(rt, this.retreatGuide) : retreatGuideText(rt, false);
    if (woundRetreat(rt) && !(this.retreatGuide?.active && this.retreatGuide.valid && this.retreatGuide.treatment))
      shownTaskLabel = retreatGuideText(rt, !!this.retreatGuide?.active && this.retreatGuide.valid && !retreatMoving);
    // 退く先と残りの歩数を既存の任務札へまとめる。戦固有の退路の名は保つ。
    if (retreatMoving) {
      const steps = Math.max(1, Math.ceil((Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) - this.retreatGuide.radius) / .75));
      // 越前など、退く理由を残す指定では出血中も指図を歩数で消さない。
      if (!rt.def.keepRetreatReason && woundRetreat(rt) && !rt.def.keepWoundRetreatReason) shownTaskLabel = '旗へ もどれ';
      else if (!rt.def.keepRetreatReason && (this.retreatGuide.treatment || !rt.def.retreatGuideLabel)) shownTaskLabel = this.retreatGuide.treatment ? treatmentGuideText(rt, this.retreatGuide) : '旗へ もどれ';
      if (!this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason)
        shownTaskLabel = 'ここへ さがろう';
      if (!rt.def.hideGuideSteps && !rt.def.retreatMoveGesture && shownTaskLabel !== 'ここへ さがろう') shownTaskLabel = /旗|はた/.test(shownTaskLabel) && !this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason
        ? `旗まで あと${steps}歩` : `${shownTaskLabel}${rt.def.retreatStepsNewLine ? '\n' : '・'}あと${steps}歩`;
    }
    if (retreatMoving && !this.retreatGuide.treatment &&
        (rt.def.retreatDestinationLabel?.(rt) === 'この丸まで進もう' || !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason)) {
      const target = this.project(this.retreatGuide, groundAt(rt.world, this.retreatGuide.x, this.retreatGuide.z, u.pos.y) + .18, rt,
        this.retreatLabelProjection || (this.retreatLabelProjection = {}));
      if (target.behind || target.x < 48 || target.x > VIEW.w - 48 || target.y < 100 || target.y > VIEW.h - 28 ||
          !this.floorGoalVisible(rt, this.retreatGuide)) shownTaskLabel = '味方の後ろへ さがる';
    }
    const waitFacing = waitingOrder && guide.distance < (guide.marker.guideRadius || 8) &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army) && rt.def.waitFacingPoint?.(rt);
    let waitFacingHelp = '', waitFacingSide = '';
    if (waitFacing) {
      const dx = waitFacing.x - u.pos.x, dz = waitFacing.z - u.pos.z;
      const alignment = (Math.sin(u.heading) * dx + Math.cos(u.heading) * dz) / Math.max(.001, Math.hypot(dx, dz));
      this.waitFacingReady = alignment >= (this.waitFacingReady ? .82 : .87);
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0 ? '右' : '左';
      waitFacingSide = side;
      shownTaskLabel = isTouch && !rt.def.keepWaitFacingLabel ? this.waitFacingReady ? 'そのまま待とう' : '丸から旗へ なぞろう' :
        rt.def.waitFacingLabel?.(rt, this.waitFacingReady) ||
        (this.waitFacingReady ? 'そのまま待とう' : `${side}を向く`);
      if (!this.waitFacingReady) waitFacingHelp = isTouch
        ? '' : `マウスを${side}へ動かす`;
    } else this.waitFacingReady = false;
    let edgeGoalDetail = '';
    const combatLabel = combatTask(rt);
    const fighting = !!combatLabel || !!rt.guideEnemyShown || !!navigationEnemy(rt) || !!this.defendEnemy?.alive;
    // 安全な場所に着いた後も、元の進軍先への歩数を混ぜない。
    const treatmentWaiting =
      this.retreatGuide?.active && this.retreatGuide.valid && !retreatMoving;
    const edgePos = treatmentWaiting ? null : retreatMoving ? this.retreatGuide : guide?.marker?.guideDestination?.() || guide?.pos;
    if (!fighting && !(guide?.marker?.guideArea === 'move' && rt.def.guidePath?.(rt, guide.marker)?.length > 1) && !rt.def.hideGuideSteps && !rt.def.hideEdgeGoalDistance && edgePos && !flagTravel && !guide?.marker?.guideTalk && !retreatMoving &&
        !waitFacing && !rt.def.town && !rt.def.dojo) {
      const target = this.project(edgePos, groundAt(rt.world, edgePos.x, edgePos.z, edgePos.y ?? u.pos.y), rt, this.edgeGoalProjection || (this.edgeGoalProjection = {}));
      const distance = Math.hypot(edgePos.x - u.pos.x, edgePos.z - u.pos.z);
      if (distance > (retreatMoving ? this.retreatGuide.radius : guide?.marker?.guideRadius || 3) &&
          (target.behind || target.x < 64 || target.x > VIEW.w - 64 || target.y < 76 || target.y > VIEW.h - 48))
        edgeGoalDetail = `${rt.def.guidePlaceName || '旗'}まで${Math.max(1, Math.ceil(distance / .75))}歩`;
    }
    // 戦固有の正式な退き先がある時だけ、一時退避の見出しより優先する。
    const retreatTaskLabel = rt.def.retreatTaskLabel?.(rt, this.retreatGuide);
    if (retreatTaskLabel) shownTaskLabel = retreatTaskLabel;
    // 押し方は実際の攻撃釦へ集め、任務札には目的を残す。
    if (combatLabel) shownTaskLabel = combatLabel;
    // 攻める任務でも、今する操作を先に示す。守りの札と逆の指図を並べない。
    // 見出しを保つ戦は、戦闘用の文が退避などで空でも元の下知を残す。
    if ((!rt.def.keepCombatTaskHeading || rt.def.scoutOperationGuide?.(rt)) && (combatLabel || rt.guideEnemyShown || rt.def.scoutOperationGuide?.(rt)) && isTouch && this.defendEnemy?.alive && !this.guardAlly) {
      shownTaskLabel = releaseReady ? '手を はなす' :
        waitGuard ? rt.player.guard ? 'そのまま ふせぐ' : '押して ふせぐ' :
        this.approachGuideEnemy ? (typeof rt.def.meleeApproachText === 'function' ? rt.def.meleeApproachText(rt) : rt.def.meleeApproachText) || 'はたへ すすもう' :
        !this.guardFacing ? `この人を ${Math.sin(Math.atan2(this.defendEnemy.pos.x - u.pos.x,
          this.defendEnemy.pos.z - u.pos.z) - p.yaw) <= 0 ? '右' : '左'}へなぞる` :
        this.attackGuideEnemy ? attackOperation(rt) :
        '押して ふせぐ';
    }
    // 下知を残す指定の戦では、持ち場を離れて敵へ進む案内で上書きしない。
    if (!rt.def.keepTaskLabel && isTouch && rt.guideEnemyShown && rt.guideEnemy?.alive && !waitGuard &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army) &&
        !this.guardAlly && !this.defendEnemy?.alive) {
      const enemy = rt.guideEnemy;
      const facing = Math.cos(Math.atan2(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) - p.yaw) > .85;
      const blade = p.weapon !== 'gun' && p.weapon !== 'bow';
      const near = Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
      // 向きと間合いの判定を保ち、近づく間は行き先だけを短く示す。
      shownTaskLabel = combatLabel === 'この敵をたおす' ? combatLabel : !facing || blade && !near ? 'あの敵へ すすめ' :
        '印の敵を たおそう';
    }
    if (retreatCaption && !this.retreatGuide.treatment && !retreatTaskLabel)
      shownTaskLabel = rt.def.retreatDestinationLabel?.(rt) || shownTaskLabel;
    if (retreatMoving && !retreatCaption && /^旗まで あと\d+歩$/.test(shownTaskLabel))
      shownTaskLabel += '・' + this.navigationMoveText(rt, this.retreatGuide);
    // 槍を向ける案内は、生きて見える相手と結ぶ。退避中は旗の案内を優先する。
    const missionEnemyTarget = rt.def.enemyTaskTarget?.(rt);
    const aiming = (/敵.*(?:槍|やり).*向け/.test(shownTaskLabel) || !!missionEnemyTarget) && !retreatMoving && !retreatRequired(rt) &&
      !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt);
    const aimEnemy = waitFacing ? rt.def.waitFacingTarget?.(rt) || rt.def.aimGuideTarget?.(rt) :
      aiming ? missionEnemyTarget || rt.def.waitFacingTarget?.(rt) || rt.def.aimGuideTarget?.(rt) || this.defendEnemy || rt.guideEnemy : null;
    this.aimGuideEnemy = aimEnemy?.alive && !aimEnemy.gone && !aimEnemy.fleeing && !aimEnemy.woundOut &&
      !aimEnemy.downed && !aimEnemy.dropped && !aimEnemy.noTarget && !aimEnemy.isStruct &&
      aimEnemy.team !== u.team && sightScreenUnit(rt, aimEnemy) ? aimEnemy : null;
    let aimHelp = '';
    // 向きが合ったら指の札を畳む。小さな揺れでは出し直さない。
    const aimAlignment = this.aimGuideEnemy ? Math.cos(Math.atan2(this.aimGuideEnemy.pos.x - u.pos.x,
      this.aimGuideEnemy.pos.z - u.pos.z) - rt.player.yaw) : -1;
    this.aimFacingReady = !!this.aimGuideEnemy && aimAlignment >=
      (this.aimFacingEnemy === this.aimGuideEnemy && this.aimFacingReady ? .82 : .87);
    this.aimFacingEnemy = this.aimGuideEnemy;
    const aimTurning = !!this.aimGuideEnemy && !this.aimFacingReady;
    if ((aiming || waitFacing) && this.aimGuideEnemy && !aimTurning)
      shownTaskLabel = aiming ? rt.def.aimReadyLabel?.(rt) || '輪の敵を 見て待とう' : '輪の敵を 見て待とう';
    if (aimTurning) {
      const enemy = this.aimGuideEnemy, dx = enemy.pos.x - u.pos.x, dz = enemy.pos.z - u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      waitFacingSide = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0 ? '右' : '左';
      shownTaskLabel = isTouch ? '敵へなぞろう' : rt.def.aimGuideLabel?.(rt) || 'この敵をねらう';
      aimHelp = isTouch ? '輪の敵へ やりを向ける' : `マウスを${waitFacingSide}へ動かす`;
      if (!isTouch && !rt.def.hideGuideSteps) aimHelp += `・敵まで あと${Math.max(1, Math.ceil(Math.hypot(dx, dz) / .75))}歩`;
    }
    const facingGesture = isTouch && aimTurning;
    setClass($('objectives'), 'facing-order', !!facingGesture);
    setClass($('objectives'), 'facing-left', !!facingGesture && !!S.touchSwap);
    if (facingGesture) {
      // 指先と矢印の上を空け、札は実寸の高さだけ上へ離す。
      this.facingSwipeRight = waitFacingSide === '右';
      shownTaskLabel = `丸から${waitFacingSide}へ なぞろう`;
      const foot = this.project(u.pos, u.pos.y + .08, rt,
        this.facingFootProjection || (this.facingFootProjection = {}));
      const startX = foot.behind ? VIEW.w / 2 : foot.x;
      const startY = foot.behind ? VIEW.h - 64 : foot.y;
      const x = Math.max(12, Math.min(VIEW.w - 188, startX - 88));
      const y = Math.max(12, startY - 104);
      setCssVar($('objectives'), '--facing-order-x', Math.round(x) + 'px');
      setCssVar($('objectives'), '--facing-order-y', Math.round(y) + 'px');
    }
    const targetingEnemy = !facingGesture && !this.approachGuideEnemy && !retreatMoving &&
      !rt.dodgeGuide && !!(this.aimGuideEnemy?.alive || this.attackGuideEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive);
    const showAttackOperation = !this.defendEnemy?.alive || !!this.attackGuideEnemy && this.guardFacing;
    if (targetingEnemy && showAttackOperation && !rt.def.singleTaskGuide && !rt.def.keepCombatTaskHeading) shownTaskLabel = 'この てきを たおそう';
    if (isTouch && !fighting && !facingGesture && guide?.marker &&
        /^(guard|wait)$/.test(guide.marker.guideArea) && guide.distance >= (guide.marker.guideRadius || 8))
      shownTaskLabel = rt.def.waitTravelLabel?.(rt) || '旗までなぞろう';
    // 敵をねらう・向きを変える案内を保ち、守る場所へ移動する時だけ言い換える。
    if (outsideGuardPost && !targetingEnemy && !facingGesture && !combatLabel && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !recovering(rt)) shownTaskLabel = rt.def.guardTravelLabel?.(rt) || (isTouch ? '旗まで なぞる' : '旗まで進もう');
    // 教えを終えた後も、攻撃の操作を短い一文で残す。
    if (rt.teachOn && !rt.teachOn() && !retreatMoving && !retreatRequired(rt) && !rt.dodgeGuide && !recovering(rt)) {
      if (!rt.def.keepCombatTaskHeading && showAttackOperation && (targetingEnemy || !rt.def.keepTaskLabel && navigationEnemy(rt) && !this.guardAlly)) shownTaskLabel = 'この てきを たおそう';
      else if (/^(?:旗までなぞろう|旗の輪へ\s*すすむ|この旗へ)$/.test(shownTaskLabel)) shownTaskLabel = '旗へ進もう';
    }
    if (this.approachGuideEnemy?.alive && !rt.def.keepCombatTaskHeading && !retreatMoving &&
        !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !recovering(rt))
      shownTaskLabel = (typeof rt.def.meleeApproachText === 'function' ? rt.def.meleeApproachText(rt) : rt.def.meleeApproachText) || '近づいて たたかう';
    // 同じ任務札を距離に合わせて切り替え、移動の説明だけで終わらせない。
    const attackTarget = this.approachGuideEnemy || this.attackGuideEnemy || (rt.guideEnemyShown && rt.guideEnemy);
    if (isTouch && attackTarget?.alive && !rt.def.keepTaskLabel && !rt.def.keepCombatTaskHeading && !rt.def.singleTaskGuide &&
        (!this.defendEnemy || this.approachGuideEnemy || this.attackGuideEnemy && this.guardFacing) &&
        !this.guardAlly && !facingGesture && !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active &&
        !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) && p.weapon !== 'gun' && p.weapon !== 'bow') {
      const near = Math.hypot(attackTarget.pos.x - u.pos.x, attackTarget.pos.z - u.pos.z) <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
      shownTaskLabel = near ? attackOperation(rt) : '近づいて たたかう';
    }
    // 戦固有の敵への指図も残し、退避や向き直しの操作は上書きしない。
    if (targetingEnemy && !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active && !recovering(rt))
      shownTaskLabel = rt.def.enemyTaskLabel?.(rt, this.aimGuideEnemy || this.attackGuideEnemy || rt.guideEnemy) || shownTaskLabel;
    if (retreatMoving && !this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason) {
      const target = this.project(this.retreatGuide, groundAt(rt.world, this.retreatGuide.x, this.retreatGuide.z, u.pos.y) + .18, rt,
        this.retreatLabelProjection || (this.retreatLabelProjection = {}));
      const visible = !target.behind && target.x > 48 && target.x < VIEW.w - 48 && target.y > 100 && target.y < VIEW.h - 28 &&
        this.floorGoalVisible(rt, this.retreatGuide);
      shownTaskLabel = visible ? isTouch ? '旗まで なぞる' : '旗まで進もう' : '矢印の方へ進もう';
    }
    if (retreatMoving && this.retreatGuide.treatment && isTouch)
      shownTaskLabel = (typeof rt.def.treatmentMoveCaption === 'function' ? rt.def.treatmentMoveCaption(rt) : rt.def.treatmentMoveCaption) || '丸から旗へ なぞって手当て';
    // 退く理由を残す戦では、操作の向きは補足へ置き、下知を上書きしない。
    if (retreatCaption && !rt.def.keepRetreatGestureReason) shownTaskLabel = `ここを${this.retreatMoveDirection}になぞる`;
    shownTaskLabel = fieldLabel(shownTaskLabel);
    setClass($('objectives'), 'compact-steps', /^(?:旗|敵)まで あと\d+歩(?:・.*)?$/.test(shownTaskLabel));
    // 心得の札（史実の負け戦）は、出てから六十秒は狭い画面でも「今」の下に見せる
    const noteFresh = (o) => o.kind === 'note' && !o.state && rt.t - (o.t ?? 0) < 60;
    const key = (rt.objectives.some(noteFresh) ? 'nf' : '') + (rt.enemyIntel?.version || 0) + JSON.stringify(rt.objectives) + folded.length + (filler ? filler.text : '') + (guide?.key || '') + (guide?.label || '') + Math.round(guide?.distance || 0) + (goalObjective?.id || '') + this.taskShownText + shownTaskLabel + waitFacingHelp + aimHelp + waitFacingSide + edgeGoalDetail + retreatCaption + unifiedDestination + destinationSteps + !!treatmentWaiting + fighting + targetingEnemy;
    if (key !== this.objKey) {
      this.objKey = key;
      this.doneSet = this.doneSet || new Set();
      // 今やる任務（命令があれば命令、なければ主のまだ済んでいない物）に cur を付ける。低い画面ではそれだけを出す
      const vis = this.visibleObjectives || (this.visibleObjectives = []); vis.length = 0;
      let remaining = 0, done = 0, failed = 0;
      for (const o of rt.objectives) {
        if (o.state !== 'fail') vis.push(o);
        if (o.state === 'done') done++; else if (o.state === 'fail') failed++; else remaining++;
      }
      if (filler) vis.unshift(filler);
      let openCount = 0;
      for (const o of vis) if (o.state !== 'done' && o.state !== 'fail') openCount++;
      const cur = goalObjective || filler;
      this.curObjKey = guide?.key || null;
      const statusText = `残り ${remaining}件・済 ${done}件・失敗 ${failed}件`;
      $('objectives').setAttribute('aria-label', `任務の一覧を開く。${statusText}`);
      const objectiveRows = this.objectiveRows || (this.objectiveRows = []); objectiveRows.length = 0;
      if (vis.length) objectiveRows.push('<li class="task-help"><small>「今」の任務を進めよう。</small></li>');
      for (const o of vis) {
        const tag = o.state === 'done' ? '済' : o.state === 'fail' ? '失敗' : o === cur ? '今' : { main: '主', side: '後で', order: '下知', guide: '待つ', note: '心得' }[o.kind] || '';
        // 果たしたばかりの任務は印が跳ねる
        const just = o.state === 'done' && !this.doneSet.has(o.id + o.text);
        if (o.state === 'done') this.doneSet.add(o.id + o.text);
        const pr = intelText(rt, o.text) === o.text && o.progress && o.state !== 'done' && o.state !== 'fail' ? progressRatio(o.progress) : null;
        const title = o === cur ? shownTaskLabel : (rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text);
        const facingHelp = o === cur && (waitFacing && !this.waitFacingReady || aimTurning);
        const place = facingHelp ? aimHelp || waitFacingHelp || ' ' : !fighting && !treatmentWaiting && !recovering(rt) && o === cur && guide?.marker && !waitingOrder && !flagTravel && !unifiedDestination && !retreatMoving ? (timedWait ? '敵が来たら 防いでつく' : destinationDistance(rt, guide.distance, true)) + (guide.floorHint ? '・' + guide.floorHint : '') : '';
        // 指定した戦だけ、現在の案内に合う補足へ言い換える。任務の進みや判定は変えない。
        let progress = o === cur ? rt.def.taskDetail?.(rt, title, o.progress || '') ?? (o.progress || '') : o.progress || '';
        if (combatLabel && o === cur && !rt.def.keepCombatTaskDetail) progress = '';
        if (rt.teachOn && !rt.teachOn()) progress = noOps(progress);
        const detail = o === cur && (rt.def.key === 'anegawa' && guide?.marker || !rt.def.town && !rt.def.dojo && !rt.def.keepCombatTask) ? '' : taskDetail(fieldLabel(goalText(rt, title)), fieldLabel(goalText(rt, progress)));
        objectiveRows.push(`<li class="${o.state === 'done' ? 'done' : o.state === 'fail' ? 'fail' : ''} ${o.kind} ${noteFresh(o) ? 'note-fresh' : ''} ${folded.includes(o) ? 'folded-task' : ''} ${just ? 'justdone' : ''} ${o === cur || (just && !cur) ? 'cur' : ''} ${[...o.text].length > 20 ? 'long' : ''}"><span class="tag">${tag}</span><span class="obj-text">${o === cur ? `<span class="obj-now">${shownTaskLabel === 'この人を守れ' ? '<i class="guard-sign" aria-hidden="true"></i>' : ''}${esc(shownTaskLabel).split(/(\s+)/).map(part => /\s/.test(part) || !/\s/.test(shownTaskLabel) ? part : `<span class="task-phrase">${part}</span>`).join('').replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}${edgeGoalDetail ? `<small class="edge-goal-detail" style="display:block!important;font-size:max(15px,calc(15px * var(--text-scale,1)))!important;line-height:1.4">${esc(edgeGoalDetail).replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}</small>` : ''}${retreatMoving ? `<span class="retreat-caption">${retreatGesture}</span>` : ''}</span><span class="obj-full">${esc(fieldLabel(goalText(rt, rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text)))}</span>` : esc(fieldLabel(goalText(rt, rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text)))}</span>${detail && intelText(rt, o.text) === o.text ? `<small>${esc(detail)}</small>` : ''}${o.cue && !(o === cur && (fighting || this.approachGuideEnemy || rt.def.key === 'anegawa')) && o.state !== 'done' && o.state !== 'fail' && rt.t - (o.cueT || 0) < 30 ? `<small class="obj-cue">${esc(goalText(rt, o.cue))}</small>` : ''}${place ? `<small class="goal-place${facingHelp ? ' facing-help' : ''}">${facingHelp && isTouch ? `<svg class="facing-gesture" viewBox="0 -14 96 60" aria-hidden="true"><g transform="${waitFacingSide === '右' ? '' : 'translate(96 0) scale(-1 1)'}"><circle cx="20" cy="10" r="13" fill="none" stroke="#fff3ba" stroke-width="3"/><path d="M34 10H84M73 1L84 10L73 19" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 25V10Q14 3 20 3Q26 3 26 10V23L31 20L40 27L36 38H15L5 29Q1 23 7 22Z" fill="#fff3ba" stroke="#14120f" stroke-width="2"/></g></svg>` : ''}${esc(place).replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}</small>` : ''}${pr !== null ? `<i class="opb" aria-hidden="true"><b style="width:${Math.round(pr * 100)}%"></b></i>` : ''}</li>`);
      }
      if (vis.length) objectiveRows.push(`<li class="more">ほかの任務<span class="obj-count">（${openCount}件）</span></li>`);
      setListRows($('obj-list'), objectiveRows);
    }
    // 携帯の横で、今の一言を読める大きさへ上げる。戦ごとの札に合わせた指定も保つ。
    {
      const now = isTouch ? $('obj-list').querySelector('li.cur .obj-now') : null;
      const key = now ? now.textContent + '|' + $('objectives').className + '|' + VIEW.w : '';
      if (now && (now !== this.objNowEl || key !== this.objNowKey)) {
        this.objNowEl = now; this.objNowKey = key;
        now.style.removeProperty('font-size');
        const minFont = rt.def.taskLabelMinFont ?? 20;
        if (parseFloat(getComputedStyle(now).fontSize) < minFont - 1) now.style.setProperty('font-size', `max(${minFont}px, calc(${minFont}px * var(--text-scale, 1)))`, 'important');
      }
    }
    // 組の状態
    const sq = $('h-squad');
    if (rt.squadGroups.some((g) => g.count > 0)) {
      setHidden(sq, false);
      setClass(sq, 'urge', rt.cmdUrgeUntil > rt.t);
      // 自分の組の人数・士気・下知は、後ろにいても知っている。
      let alive = 0, squadMorale = 0;
      for (const s of rt.squad) if (s.alive) { alive++; squadMorale += s.group.morale; }
      const squadCount = `${alive}人`;
      const sqMor = alive ? moraleWord(squadMorale / alive) : '組は全滅';
      let pips = '';
      for (const s of rt.squad) {
        const tip = s.name ? ` title="${esc(s.name)}"` : '';
        if (!s.alive) { pips += `<i class="dead"${tip}></i>`; continue; }
        const r = s.hp / s.maxHp;
        pips += `<i class="${r < 0.3 ? 'low blink' : r < 0.35 ? 'low' : r < 0.7 ? 'mid' : ''} ${s.type === 'bow' || s.type === 'gun' ? 'bow' : ''} ${s.roster && s.roster.battles > 0 ? 'vet' : ''}"${tip}></i>`;
      }
      // 隊ごとの号令：同じ種類の隊は一つにまとめ、どの隊も同じ号令なら「号令 ○○」の一つだけ（同じ字を並べない）
      const ordOf = (g) => {
        const order = g.focus ? ORDER_NAME.focus : ORDER_NAME[g.order] || '待て';
        return g.pending ? `${order}（${ORDER_NAME[g.pending.id] || '号令'}を伝え中）` : order;
      };
      const byKind = this.squadKindWork || (this.squadKindWork = []); byKind.length = 0;
      for (const g of rt.squadGroups) if (g.count > 0 && !byKind.some((x) => x.kind === g.kind)) byKind.push(g);
      const same = rt.squadGroups.every((g) => !g.count || ordOf(g) === ordOf(byKind[0]));
      const kindOrder = (g) => {
        const order = ordOf(g);
        for (const other of rt.squadGroups) if (other.count > 0 && other.kind === g.kind && ordOf(other) !== order) return '隊ごと';
        return order;
      };
      const fireOf = (g) => (g.kind === 'bow' || g.kind === 'gun' ? `<small>${byKind.length > 1 ? (GROUP_NAME[g.kind] || '').slice(0, -1) : ''}${g.fire ? '射撃中' : '射撃停止'}</small>` : '');
      let groups = same ? `<span class="ord">号令<b>${ordOf(byKind[0])}</b>` : '';
      for (const g of byKind) groups += same ? fireOf(g) : `<span class="ord">${byKind.length > 1 ? `${(GROUP_NAME[g.kind] || '槍隊').slice(0, -1)}：` : ''}<b>${kindOrder(g)}</b>${fireOf(g)}</span>`;
      if (same) groups += '</span>';
      const formOf = (g) => g.formation === 'yari' ? '横隊' : FORM_NAME[g.formation] || '';
      const form = rt.squadGroups.every((g) => !g.count || formOf(g) === formOf(byKind[0])) ? formOf(byKind[0]) : '隊ごと';
      const sel = byKind.length > 1 && p.selGroup !== 'all' ? `<span>号令先<b>${GROUP_NAME[p.selGroup]}</b></span>` : '';
      // 携帯の横向き：組の数・士気・今の号令・陣形の一行（押すと号令を選ぶ札を開く）。親指の輪と右下の丸の間の帯に置く
      if (isTouch && document.documentElement.classList.contains('tc-low')) {
        setStyle(sq, 'bottom', '');
        const sg = byKind.find((g) => g.kind === p.selGroup) || byKind[0];
        const now = same || p.selGroup !== 'all' ? kindOrder(sg) + ((sg.kind === 'bow' || sg.kind === 'gun') ? (sg.fire ? '・射撃中' : '・射撃停止') : '') : '隊ごと';
        const more = sq.classList.contains('open') ? `${groups}${sel}` : '';
        setHtml(sq, `<span>組<b>${squadCount}</b></span><span>士気<b>${sqMor}</b></span><span class="ord now">号令<b>${now}</b></span><span>陣形<b>${form}</b></span>${more}`);
        sq.setAttribute('aria-label', `自分の組 ${squadCount} 士気${sqMor} 号令${now} 陣形${form}（押すと陣形を選ぶ）`);
        sq.setAttribute('role', 'button');
      } else {
      // 十六人を超える組は、一人ずつの点でなく、生きている割合と深手の数の一本の帯で
      const many = rt.squad.length > 16;
      const bar = many ? '' : `<span class="pips">${pips}</span>`;
      // 馬の棒などで高さが変わった時に、体力・備え・組の札をまとめて積む。
      // 毎回の位置指定で観測側の配置を戻さない。
      stackBottomLeft();
      setHtml(sq, `<span>組<b>${squadCount}</b></span>${bar}<span>士気<b>${sqMor}</b></span><span>陣形<b>${form}</b></span>${groups}${sel}`);
      }
    } else setHidden(sq, true);
    // 指揮パネル
    const cp = $('cmdpanel');
    const squadLabel = String(!!p.cmdOpen);
    if ($('h-squad').getAttribute('aria-expanded') !== squadLabel) $('h-squad').setAttribute('aria-expanded', squadLabel);
    if (p.cmdOpen) {
      const opened = cp.hidden;
      setHidden(cp, false);
      let curOrd = '', hasOrder = false, sameOrder = true;
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && g.kind !== p.selGroup) continue;
        const order = g.focus ? 'focus' : g.order;
        if (!hasOrder) { curOrd = order; hasOrder = true; }
        else if (order !== curOrd) sameOrder = false;
      }
      if (!sameOrder) curOrd = '';
      // 札を叩く・押すと号令（数字キーの代わり。数字を割り当てていない号令もこれで出せる）。鍵盤の言い方は指の端末では出さない
      if (!cp.dataset.tap) {
        cp.dataset.tap = '1';
        cp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.rt.player.cmdOpen = false; setHidden(cp, true); document.activeElement.blur?.(); return; } const b = e.target.closest('[data-cmd]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); } });
        cp.addEventListener('click', (e) => {
          const li = e.target.closest && e.target.closest('[data-cmd]');
          const pl = this.rt && this.rt.player;
          if (!pl || !pl.cmdOpen) return;
          if (e.target.closest('[data-radial-open]')) { pl.radialKeyboard = true; pl.radial = true; pl.cmdOpen = false; pl.tabT = null; this.updateRadial(this.rt); $('radial').querySelector('[data-radial]')?.focus({ preventScroll:true }); return; }
          if (!li) return;
          pl.command(li.dataset.cmd); pl.cmdOpen = false;
        });
      }
      const cmds = commandList(G.rank);
      let formKey = `${G.rank}:${p.selGroup}`, curForm = null, sameForm = true;
      const hasKind = rt.squadGroups.some((g) => g.kind === p.selGroup);
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && hasKind && g.kind !== p.selGroup) continue;
        const f = !groupSeen(rt, g) ? '' : g.formation === 'yari' ? 'line' : g.formation;
        formKey += ':' + f;
        if (curForm === null) curForm = f; else if (curForm !== f) sameForm = false;
      }
      if (this.squadFormKey !== formKey) {
        this.squadFormKey = formKey;
        this.squadFormHtml = '';
        if (!(G.rank < 1)) for (const c of SQUAD_FORMS) {
          const f = c.id.slice(5), on = sameForm && curForm === f;
          this.squadFormHtml += `<button type="button" data-cmd="${c.id}" aria-pressed="${on}" aria-label="${c.label}。${c.desc}">${on ? '● ' : ''}${FORM_NAME[f]}<small>${c.desc}</small></button>`;
        }
      }
      let commandHtml = '', visibleSquadCount = 0;
      for (const c of cmds) if (!c.id.startsWith('form_')) commandHtml += `<li class="${c.id === curOrd ? 'cur' : ''}" data-cmd="${c.id}" role="button" aria-pressed="${c.id === curOrd}" tabindex="0">${!isTouch && c.k ? `<kbd>${c.k}</kbd>` : ''}${c.label}${c.q && !isTouch ? `<em>${c.q}</em>` : ''}<small>${c.desc}</small></li>`;
      for (const x of rt.squad) if (sightUnit(rt, x)) visibleSquadCount++;
      const forms = this.squadFormHtml;
      setHtml(cp, `<h5>部隊指揮・${esc(GROUP_NAME[p.selGroup] || '全隊')}<span>${isTouch ? '札を指で押して号令' : '数字キーで号令、または札を押す ・ タブで閉じる'}</span></h5><button type="button" class="btn" data-radial-open style="min-height:44px;margin:8px 0">号令の輪を開く</button><div class="squad-forms" role="group" aria-label="組の陣形">${forms}</div><ol>${commandHtml}</ol>` +
        (rt.squadGroups.length > 1 && !isTouch ? `<div class="grp">ジー：号令の対象を切替　現在 <b>${GROUP_NAME[p.selGroup]}</b></div>` : '') +
        (isTouch ? '' : `<div class="grp">号令の札を開かなくても ${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')} で「ついて来い・待て・突撃・退け」</div>`) +
        `<div class="grp">見える組：${numberHint(visibleSquadCount)}。離れた者の様子は分からぬ${rt.G.rank >= 2 ? ' ・ 白い小旗が「前進」の行き先、青い輪が弓の届く範囲' : ''}</div>`);
      if (opened && this.keyboardInput) cp.querySelector('button')?.focus({ preventScroll:true });
    } else setHidden(cp, true);
    // 武器・号令ショートカット
    const hasSq = rt.squad.length > 0;
    const rallyReady = p.rallyCd <= 0;
    const pad = this.padMode;
    // キー名は短い呼び方にし、号令をまとめる「ほか」は技名と重ねない。
    const kk = this.shortcutKeys || (this.shortcutKeys = {});
    kk.cmd = pad ? 'ワイ' : shortcutKey(K('command')); kk.quick = pad ? '十字' : shortcutKey(K('follow'));
    kk.rally = pad ? '左肩' : shortcutKey(K('rally')); kk.lock = shortcutKey(pad ? '右スティック押し込み' : K('lock'));
    const gunPct = Math.round((p.gunReload || 0) * 100), rallyPct = rallyReady ? 0 : Math.round(Math.min(100, p.rallyCd / 25 * 100));
    const dodgeKey = pad ? 'エー' : shortcutKey(K('dodge')), mountKey = shortcutKey(K('mount'));
    const bottomKey = `${p.weapon}|${G.equip.weapon}|${p.hasKatana}|${p.hasGun}|${p.hasBow}|${hasSq}|${rallyReady}|${p.lock}|${p.mounted}|${p.sta >= 20}|${p.canRide}|${p.gunLoaded}|${gunPct}|${Math.round((1 - (p.gunReload || 0)) * 100)}|${rallyReady ? 0 : Math.ceil(p.rallyCd)}|${rallyPct}|${kk.cmd}|${kk.quick}|${kk.rally}|${kk.lock}|${dodgeKey}|${mountKey}`;
    if (this.bottomKey !== bottomKey) {
      this.bottomKey = bottomKey;
      setHtml($('h-bottom'),
      `<div class="slot ${p.weapon === 'spear' ? 'on' : ''}"><em>1</em>${ICON.spear}${esc(ITEMS[G.equip.weapon].name.replace('数打の', '').replace('上質な', ''))}</div>` +
      `<div class="slot ${p.weapon === 'sword' ? 'on' : ''} ${p.hasKatana ? '' : 'locked'}"><em>2</em>${ICON.sword}${p.hasKatana ? '打刀' : '—'}</div>` +
      // 火縄銃・弓は持っている時だけ。火縄銃は込めの進みを札の下から満ちる影で
      (p.hasGun ? `<div class="slot ${p.weapon === 'gun' ? 'on' : ''}"><em>3</em>${ICON.gun}${p.gunLoaded ? '火縄銃' : `<span class="why">込め${gunPct}%</span>`}${p.gunLoaded ? '' : `<span class="cd" style="height:${Math.round((1 - (p.gunReload || 0)) * 100)}%"></span>`}</div>` : '') +
      (p.hasBow ? `<div class="slot ${p.weapon === 'bow' ? 'on' : ''}"><em>4</em>${ICON.bow}弓</div>` : '') +
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.cmd}</em>${ICON.cmd}指揮</div>` +
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.quick}</em>${ICON.quick}号令</div>` +
      `<div class="slot cmd ${rallyReady ? 'ready' : 'wait'}"><em>${kk.rally}</em>${ICON.rally}${rallyReady ? (hasSq ? '鼓舞' : '鬨の声') : `<span class="why">あと${Math.ceil(p.rallyCd)}秒</span>`}${rallyReady ? '' : `<span class="cd" style="height:${rallyPct}%"></span>`}</div>` +
      `<div class="slot cmd ${p.lock ? 'on' : ''}"><em>${kk.lock}</em>${ICON.lock}${p.lock ? '解除' : '狙い'}</div>` +
      (p.mounted ? `<div class="slot cmd"><em>${dodgeKey}</em>${ICON.dodge}手綱</div>` : `<div class="slot cmd ${p.sta >= 20 ? '' : 'dim'}"><em>${dodgeKey}</em>${ICON.dodge}${p.sta >= 20 ? '回避' : '<span class="why">気力不足</span>'}</div>`) +
      (p.canRide ? `<div class="slot cmd ${p.mounted ? 'on' : ''}"><em>${mountKey}</em>${ICON.horse || ICON.quick}${p.mounted ? '降りる' : '乗る'}</div>` : ''));
    }
    // 操作プロンプト
    // 倒れている間は「取る」などの札を出さない
    const rainUrgent = !guidanceEnded(rt) && rainDanger(rt.army);
    setClass(this.root, 'retreat-priority', retreatRequired(rt) || !!this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment || rt.missionGuide?.marker?.guideArea === 'retreat');
    setClass(this.root, 'rain-danger', rainUrgent);
    // 手当てが使える時は、門や落とし物より専用の操作札を先に出す。
    const it = u.alive ? (p.treatmentReady && rt.interacts.find(item => item.id === 'bandage')) || rt.nearestInteract() : null;
    const pr = $('prompt');
    const talkAction = !!it && !it.hold && /話す|話を聞く/.test(it.label);
    const talkMarker = talkAction ? rt.missionGuide?.marker : null;
    const talkPerson = talkMarker?.guideTalk && talkMarker.guidePerson?.();
    const talkPos = talkAction && (typeof it.pos === 'function' ? it.pos() : it.pos);
    const talkFrame = talkPerson?.alive && (!talkMarker.guideVisibleOnly || this.talkPersonVisible(rt, talkPerson)) && talkPos && Math.hypot(talkPos.x - talkPerson.pos.x, talkPos.z - talkPerson.pos.z) < 1 ? this.measurePersonFrame(talkPerson, rt, true) : null;
    const talkWidth = 224;
    const talkHeight = 76;
    const talkTarget = !!talkFrame && talkFrame.top > talkHeight + 76 && talkFrame.top < VIEW.h - 24 &&
      talkFrame.cx > 28 && talkFrame.cx < VIEW.w - 28;
    setClass(pr, 'talk-target', talkTarget);
    setClass(this.root, 'talk-ready', talkAction);
    if (talkTarget) {
      const left = Math.max(8, Math.min(VIEW.w - talkWidth - 8, talkFrame.cx - talkWidth / 2));
      setCssVar(pr, '--talk-x', Math.round(left) + 'px');
      setCssVar(pr, '--talk-tip-x', Math.round(talkFrame.cx - left) + 'px');
      setCssVar(pr, '--talk-y', Math.round(talkFrame.top - talkHeight - 72) + 'px');
      setCssVar(pr, '--talk-w', Math.round(talkWidth) + 'px');
      setCssVar(pr, '--talk-h', Math.round(talkHeight) + 'px');

    }
    const bandageAction = it?.id === 'bandage';
    const workAction = !!it?.hold && !/^(head|horse)/.test(it.id);
    setClass(pr, 'treatment-action', bandageAction);
    setClass(pr, 'work-action', workAction);
    if (workAction && !rainUrgent) {
      // 作業釦を任務と同じ欄へ入れる。既存の押す処理を保ったまま札を一枚にする。
      if (!this.workPromptHome) {
        this.workPromptHome = pr.parentNode;
        this.workPromptNext = pr.nextSibling;
      }
      const rail = $('battle-notices');
      if (pr.parentNode !== rail) rail.prepend(pr);
    } else if (this.workPromptHome && pr.parentNode !== this.workPromptHome) {
      this.workPromptHome.insertBefore(pr, this.workPromptNext?.parentNode === this.workPromptHome ? this.workPromptNext : null);
    }
    setClass(this.root, 'working', workAction && !rainUrgent);
    if (!workAction || this.workHoldId !== it.id) this.workHoldId = null;
    const fenceBlocked = it?.id === 'fence' && (p.blockedWalkT >= 0.7 || rt.holdId === 'fence');
    setClass(pr, 'fence-blocked', fenceBlocked);
    const actionLabel = it?.label || '', actionHold = it?.hold ? 'true' : 'false';
    if (pr.dataset.action !== actionLabel) pr.dataset.action = actionLabel;
    if (pr.dataset.hold !== actionHold) pr.dataset.hold = actionHold;
    if (it) {
      setHidden(pr, false);
      const hp = rt.holdId === it.id ? Math.max(0, Math.min(1, rt.holdPct || 0)) : 0;
      const entry = it.id.startsWith('naka_');
      const text = `${fenceBlocked ? '<strong>柵を倒して通る</strong>' : ''}${isTouch ? entry ? '' : '「使う」' : `<kbd>${pad ? 'エックス' : K('use')}</kbd>`}${esc(it.label)}${it.hold ? `<small>（${fenceBlocked ? `長押し・あと${Math.max(1, Math.ceil(it.hold * (1 - hp)))}秒` : '長押し'}）</small><i class="holdbar"><b style="width:${Math.round(hp * 100)}%"></b></i>` : ''}`;
      if (workAction) {
        const fire = /火を(?:つけ|かけ|放|移)|篝火を焚/.test(it.label);
        const label = /^(?:小屋に)?火をつける(?:（[^）]*）)?$/.test(it.label) ? '火をつける' : it.label.replace(/（[^）]*）/g, '');
        const key = it.id + '|' + label;
        if (this.workPromptKey !== key || !pr.querySelector('[data-work]')) {
          this.workHoldId = null; this.workPromptKey = key;
          setHtml(pr, `<button type="button" data-work="${esc(it.id)}"${fire ? ' class="fire-work"' : ''} aria-label="${esc('長押しで' + label)}">${fire ? '<svg viewBox="-18 -36 36 44" aria-hidden="true"><path d="M0-32C3-20 16-18 14-7C12 7-14 7-14-7C-14-16-6-20-7-25L-3-20Z" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/><path d="M0-13Q9 0 0 0Q-7 0 0-13" fill="#14120f"/></svg>' : ''}<span>${esc(label)}</span><small>長押し</small><i class="holdbar" role="progressbar" aria-label="作業の進み具合" aria-valuemin="0" aria-valuemax="100"><b></b></i></button>`);
        }
        const progress = Math.round(hp * 100);
        setStyle(pr.querySelector('.holdbar b'), 'width', `${progress}%`);
        const bar = pr.querySelector('.holdbar');
        if (bar.getAttribute('aria-valuenow') !== String(progress)) bar.setAttribute('aria-valuenow', progress);
        setClass(pr.querySelector('[data-work]'), 'holding', hp > 0);
        setText(pr.querySelector('small'), bandageAction ? hp > 0 ? `あと${Math.max(1, Math.ceil(it.hold * (1 - hp)))}秒・${progress}％` : '三秒長おし' : hp > 0 ? `${progress}％` : '長押し');
      } else { this.workPromptKey = ''; setHtml(pr, talkAction ? talkTarget ? `<button type="button" data-talk aria-label="おして はなす"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 3H44V31H29L21 44L18 31H4Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M12 12H36M12 22H30" stroke="#14120f" stroke-width="3"/></svg><span class="talk-label">おして はなす<strong>ここをおす</strong></span></button>` : '<button type="button" data-talk><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 3H44V31H29L21 44L18 31H4Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M12 12H36M12 22H30" stroke="#14120f" stroke-width="3"/></svg>おして はなす</button>' : entry ? `<button type="button" data-entry="${esc(it.id)}">${text}</button>` : text); }
    } else { this.workPromptKey = ''; setHidden(pr, true); }
    if (talkAction) pr.querySelector('[data-talk]').dataset.talkId = it.id;
    // 首取りの距離・長押しはそのまま。札だけ亡骸の頭の脇へ逃がす。
    const headSide = it?.id.startsWith('head');
    if (headSide && !pr.hidden) {
      const foe = rt.meritKills?.find((r) => 'head' + r.foe.id === it.id)?.foe;
      const head = foe?.human?.bones?.Head || foe?.head;
      const q = head ? head.getWorldPosition(this.tmpV) : foe?.mesh?.position || foe?.pos;
      if (q) {
        this.tmpV.set(q.x, q.y + 0.3, q.z).project(rt.camera);
        const x = (this.tmpV.x * 0.5 + 0.5) * VIEW.w, y = (-this.tmpV.y * 0.5 + 0.5) * VIEW.h;
        setHidden(pr, this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1);
        const sizeKey = it.id + ':' + VIEW.w + ':' + VIEW.h;
        if (this.headPromptSizeKey !== sizeKey && !pr.hidden) {
          this.headPromptSizeKey = sizeKey;
          this.headPromptWidth = pr.offsetWidth || 240; this.headPromptHeight = pr.offsetHeight || 48;
        }
        const pw = this.headPromptWidth || 240, ph = this.headPromptHeight || 48;
        const left = x < VIEW.w / 2 ? x + 36 : x - pw - 36;
        setStyle(pr, "left", Math.max(8, Math.min(VIEW.w - pw - 8, left)) + 'px');
        setStyle(pr, "top", Math.max(60, Math.min(VIEW.h - ph - 56, y - ph - 24)) + 'px');
        setStyle(pr, "transform", 'none');
      }
    } else if (this.headPromptSizeKey) {
      setStyle(pr, "left", ''); setStyle(pr, "top", ''); setStyle(pr, "transform", ''); this.headPromptSizeKey = '';
    }
    if (periodic & 4) { this.firstHelpT = 0.5; this.newPlayHelp(rt, it); }
    this.rt = rt;
    if (periodic & 2) { this.unitsT = 0.2; this.updateUnits(rt); }
    this.notices.sync();
    // 印の実寸測りと小地図の計算を同じコマへ重ねない。
    if (periodic & 8) { this.markersF = 0; this.updateMarkers(rt); }
    // 中央は振り向く案内を優先し、頭の脇の間合いの札も隠して場所を空ける。
    // 印の更新を待つコマでも確かめ、向きの指図が一瞬だけ二つ出るのを防ぐ。
    if (!rangeCue.hidden) {
      for (const marker of this.markerEls.values()) {
        if (!marker.hidden && marker.offsetParent && marker.querySelector('.behind-label')) {
          setHidden(rangeCue, true);
          break;
        }
      }
    }
    this.lullCue(rt);
    this.updateThreats(rt);
    const coverVisible = !!this.coverEl && !this.coverEl.hidden;
    setClass(this.root, 'cover-guidance', coverVisible);
    if (coverVisible !== this.coverWasVisible) { this.rectsT = 0; this.coverWasVisible = coverVisible; }
    if (!this.coverEl || this.coverEl.hidden) this.releaseCoverHold?.();
    if (isTouch && this.coverEl && !this.coverEl.hidden) {
      this.releaseWaitGuard?.();
      setHidden(this.waitGuardButton, true);
      setClass(this.root, 'wait-guard-active', false);
    }
    const safetyGoal = this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment ? this.retreatGuide :
      this.coverEl && !this.coverEl.hidden && rt.coverGuide?.valid ? rt.coverGuide.pos : null;
    const safetyTravel = !!safetyGoal && Math.hypot(safetyGoal.x - u.pos.x, safetyGoal.z - u.pos.z) >= (safetyGoal.radius || .8);
    const safetyChanged = this.root.classList.contains('safety-travel') !== safetyTravel;
    setClass(this.root, 'safety-travel', safetyTravel);
    if (safetyChanged) this.notices.sync();
    // 守る説明中は、移動先や歩数を重ねず同じ位置の一枚で読ませる。
    setClass(this.root, 'combat-instruction', !!this.defendEnemy?.alive);
    if (this.defendEnemy?.alive) {
      setClass(this.root, 'flag-guide', false);
    setClass(this.root, 'edge-destination', false);
      for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    if (this.waitGuardButton && !this.waitGuardButton.hidden) {
      // いのち・長押し・危険の三枚まで。別の指図や人名札を重ねない。
      setHidden($('target'), true); setHidden($('boss'), true);
      for (const marker of this.markerEls.values()) marker.hidden = true;
      for (const threat of this.threatEls) threat.hidden = true;
    }
    if (this.root.classList.contains('compact-battle')) {
      // 押す行動札も三枚の中へ。記録と任務のほかは、行動・相手・行き先の順に一枚。
      const promptOn = !$('prompt').hidden;
      if (promptOn) setHidden($('boss'), true);
      const extraOn = promptOn || !$('boss').hidden;
      // 記録・今の行動・敵将（または操作）の三枚まで。ねらう敵の大枠は残す。
      if (extraOn) setHidden($('target'), true);
      if (extraOn) for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    let flagShown = !!this.flagGuideDrawn;
    for (const marker of this.markerEls.values()) if (!marker.hidden && marker.classList.contains('flag-goal')) { flagShown = true; break; }
    setClass(this.root, 'flag-guide', flagShown);
    // ミニマップ
    // 小地図は見えている時だけ描く（設定で消した・手ほどきの間は描かない）
    const mapGuidance = isTouch && VIEW.h <= 500 && singleBattleGuide(rt) &&
      (this.openingActive || !!rt.missionGuide?.marker || !!this.defendEnemy?.alive ||
       !!rt.dodgeGuide || !!this.retreatGuide?.active || !!rt.touchCoachActive);
    setClass(this.root, 'map-guidance', !!mapGuidance);
    const mmOn = S.hudMinimap !== false && !this.root.classList.contains('novice') && !mapGuidance;
    // iPhone 横の 60px ほどの小さな丸の小地図は、一秒に五回で足りる（大きな地図を開いている時と、パソコンは十回）
    if (periodic & 1) { this.mmT = this.mmTiny && !this.bigmap ? 0.2 : 0.1; if (mmOn) this.drawMap($('minimap'), rt, this.mmRange || 60, true); if (this.bigmap) { this.fitBigmap(rt); this.drawMap($('bigmap'), rt, this.bigRange || 170, false); } }
  }

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
      (this.firstHelpT <= 0 ? 4 : 0) | (this.peopleT <= 0 ? 16 : 0) | (this._armyT <= 0 ? 32 : 0);
    const start = this.periodicNext || 0;
    for (let i = 0; i < 5; i++) {
      const job = (start + i) % 5, bit = job < 3 ? 1 << job : 1 << (job + 1);
      if (!(due & bit)) continue;
      this.periodicNext = (job + 1) % 5;
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
    if (!K || !K.kuruwa || rt.over || rt.ended) { if (this._scEl) { this._scEl.hidden = true; setStyle(this._scEl, 'display', 'none'); } return; }
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
    if (!sides || rt.def.hideArmyPeek) { ab.hidden = true; return; }
    let a = 0, b = 0;
    if (!rt.armyInit) {
      rt.armyInit = { a: 0, b: 0 };
    }
    for (const u of rt.army.units) {
      if (u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.noTarget) continue;
      if (!u.alive || u.gone) continue;
      // 背後や画面外でも、三十メートル以内の実兵は近くの気配に含める。
      const dx = u.pos.x - rt.player.u.pos.x, dz = u.pos.z - rt.player.u.pos.z;
      const nearby = dx * dx + dz * dz <= 30 * 30;
      if (nearby || sightScreenUnit(rt, u)) { if (u.team === 0) a++; else b++; }
    }
    // 本物に替えた兵と隠した兵を除き、実際に描く列・旗・後詰めを拾う。
    for (const A of rt.world.armies || []) {
      if (!A.mesh?.visible) continue;
      let n = sightArmyMesh(rt, A.body, A.U);
      if (A.host) n += sightArmyMesh(rt, A.host.meshes[0], A.U);
      // 丘の向こうに幟だけ見えていても、軍勢の姿として知らせる。
      if (!n && A.parts?.banners) n = sightArmyMesh(rt, A.parts.banners, A.U);
      if (!n && A.host?.meshes[2]) n = sightArmyMesh(rt, A.host.meshes[2], A.U);
      const team = A.team ?? (A.mon === sides.b.mon ? 1 : A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0);
      if (team === 0) a += n; else b += n;
    }
    for (const C of rt.world.clashes || []) {
      if (!C.blocks || !C.mesh?.visible) continue;
      for (let i = 0; i < 2; i++) {
        const D = i ? C.B : C.A;
        if (!D?.alive || D.P.hidden) continue;
        let n = sightArmyMesh(rt, D.meshes.bodyN, D.U, true) + sightArmyMesh(rt, D.meshes.bodyF, D.U, true);
        if (D.host) n += sightArmyMesh(rt, D.host.g.children[0], D.host.U);
        if (!n) n = sightArmyMesh(rt, D.meshes.banners, D.U, true);
        if (!n && D.host?.g.children[2]) n = sightArmyMesh(rt, D.host.g.children[2], D.host.U);
        if ((D.P.team ?? i) === 0) a += n; else b += n;
      }
    }
    rt.armyInit.a = Math.max(rt.armyInit.a, a);
    rt.armyInit.b = Math.max(rt.armyInit.b, b);
    // 経過の札は段の切り替えでも戻さず、新しい戦の初めだけ零にする。
    const t = this.armyClock = Math.max(this.armyClock || 0, Math.floor(rt.t));
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const key = `${a}|${b}|${clock}|${rt.flags.ek || 0}`;
    this.lastA = a; this.lastB = b;
    if (key === this.armyKey) return;
    const first = !this.armyKey;
    this.armyKey = key;
    ab.hidden = false;
    if (first) {
      // 狭い画面では軍の名を短く（「織田・徳川軍」→「織田軍」）して、二行に折れないように
      //   長い名（「延暦寺の僧兵・浅井朝倉の残党」）は「・」の前だけに。それでも入らなければ末尾を「…」に（隣の数と重ならないように）
      const sn = (n) => { n = n.replace(/（[^）]*）/g, ''); if (VIEW.w >= 1000) return n; n = n.replace(/・[^・]*軍$/, '軍'); return n.length > 8 && n.includes('・') ? n.split('・')[0] : n; };
      ab.innerHTML = `<div class="side a"><div class="nm"><canvas width="44" height="44" data-m="${sides.a.mon}"></canvas><span class="n">${esc(sn(sides.a.name))}</span><small id="ab-a"></small></div><div class="gauge"><s id="ab-sa"></s><b id="ab-ga"></b></div></div>
        <div class="clock"><span id="ab-c"></span><small>経過</small></div>
        <div class="side b"><div class="nm"><small id="ab-b"></small><span class="n">${esc(sn(sides.b.name))}</span><canvas width="44" height="44" data-m="${sides.b.mon}"></canvas></div><div class="gauge"><s id="ab-sb"></s><b id="ab-gb"></b></div></div>`;
      ab.querySelectorAll('canvas[data-m]').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
      $('dateline').textContent = rt.def.date ? rt.def.date(rt) : '';
      this.fitDate();
    }
    this.lastA = a; this.lastB = b;
    // 総勢・残数・兵力比は武者の目には分からない。目に入る兵の気配だけ。
    setText($('ab-a'), a ? `目の前の味方 ${a >= 300 ? '大軍' : numberHint(a)}` : '味方は視界の外');
    setText($('ab-b'), b ? `目の前の敵 ${b >= 300 ? '大軍' : b >= 30 ? '大勢' : numberHint(b)}` : '敵は視界の外');
    const pa = a ? 50 : 0, pb = b ? 50 : 0;
    $('ab-ga').parentElement.hidden = true;
    $('ab-gb').parentElement.hidden = true;
    this.armyPct = { a: pa, b: pb };
    const lp = this.armyPeekAt || (this.armyPeekAt = { a: pa, b: pb });
    if (Math.abs(lp.a - pa) >= 4 || Math.abs(lp.b - pb) >= 4) { this.armyPeekAt = { a: pa, b: pb }; this.peekArmy(4); }
    setText($('ab-c'), clock);
    if (t % 5 === 0 && rt.def.date) { const d = rt.def.date(rt); if ($('dateline').textContent !== d) { $('dateline').textContent = d; this.fitDate(); } }
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

  // 戦ごとの退き先を優先し、ない時は敵から離れた仲間の後ろを半秒ごとに探す。
  retreatDestination(rt, enemy, treatment = false) {
    // 手当ての陰と通常の退き先を交互に探す戦では、それぞれの印を保つ。
    // 一つの印を共有すると、陰がないたびに退き先が足元から選び直される。
    if (rt.def.separateTreatmentRetreat) {
      let search = this.retreatSearch;
      if (search?.rt !== rt) search = this.retreatSearch = {
        rt, treatment: { cue: null, scanAt: 0 }, retreat: { cue: null, scanAt: 0 },
      };
      if (this.retreatGuide && (search.treatment.cue === this.retreatGuide || search.retreat.cue === this.retreatGuide)) {
        const previous = this.retreatGuide.treatment ? search.treatment : search.retreat;
        previous.scanAt = this.retreatScanAt;
      }
      const next = treatment ? search.treatment : search.retreat;
      this.retreatGuide = next.cue || (next.cue = { x: 0, z: 0, radius: 3, active: false, valid: false });
      this.retreatScanAt = next.scanAt;
    }
    const cue = this.retreatGuide || (this.retreatGuide = { x: 0, z: 0, radius: 3, active: false, valid: false, ally: null });
    cue.active = true;
    cue.enemy = enemy;
    if (cue.treatment !== treatment) { cue.valid = false; this.retreatScanAt = 0; }
    cue.treatment = treatment; cue.radius = treatment ? .9 : 3;
    const guide = rt.missionGuide, p = rt.player.u.pos;
    if (!treatment && guide?.marker?.guideArea === 'retreat') {
      cue.x = guide.pos.x; cue.z = guide.pos.z; cue.y = guide.pos.y; cue.radius = guide.marker.guideRadius || 3; cue.valid = true;
      if (rt.t >= this.retreatScanAt) {
        this.retreatScanAt = rt.t + .5; cue.ally = guide.marker.guideAlly?.() || null;
        let best = cue.ally?.alive ? 0 : 12;
        for (const a of rt.army.units) {
          if (a === rt.player.u || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct || a.team !== rt.player.u.team) continue;
          const d = Math.hypot(a.pos.x - cue.x, a.pos.z - cue.z);
          if (d < best && sightUnit(rt, a)) { best = d; cue.ally = a; }
        }
      }
      return cue;
    }
    cue.y = undefined;
    if (rt.t < this.retreatScanAt) return cue.valid ? cue : null;
    this.retreatScanAt = rt.t + .5;
    const point = this.retreatPoint || (this.retreatPoint = { x: 0, y: 0, z: 0 });
    const safe = (x, z) => {
      point.x = x; point.z = z;
      if (rt.def.retreatPathAllowed && !rt.def.retreatPathAllowed(rt, point)) return false;
      if (rt.def.retreatPointAllowed && !rt.def.retreatPointAllowed(rt, point)) return false;
      if (!treatment) for (const u of rt.army.units) {
        if (u !== rt.player.u && u.alive && !u.gone && !u.isStruct && Math.abs(u.pos.y - p.y) < 3 &&
          Math.hypot(x - u.pos.x, z - u.pos.z) < (u.mounted ? 3 : 2)) return false;
      }
      if (treatment) {
        point.x = x; point.z = z; point.y = rt.def.retreatGroundAt?.(rt, x, z, p.y) ?? rt.world.heightAt(x, z);
        if (!rt.player.treatmentShelter(point)) return false;
      }
      for (const u of rt.army.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.civ && !u.isStruct &&
        u.team !== rt.player.u.team && Math.hypot(x - u.pos.x, z - u.pos.z) < 6) return false;
      const length = Math.hypot(x - p.x, z - p.z), steps = Math.max(1, Math.ceil(length / 2));
      for (let i = 1; i <= steps; i++) {
        point.x = p.x + (x - p.x) * i / steps; point.z = p.z + (z - p.z) * i / steps;
        point.y = rt.def.retreatGroundAt?.(rt, point.x, point.z, p.y) ?? rt.world.heightAt(point.x, point.z);
        if (rt.def.retreatPointAllowed && !rt.def.retreatPointAllowed(rt, point)) return false;
        if (!rt.world.walkable(point.x, point.z, point.y) || Math.abs(point.y - p.y) > length * i / steps * .5 + .5 || rt.army.wallBetween(p, -1, point)) return false;
      }
      return true;
    };
    // 安全な行き先は保つ。歩くたびに旗が足元へ移らないようにする。
    if (cue.valid && (!cue.house || !cue.house.burnt) && (!cue.ally || cue.ally.alive && !cue.ally.gone && !cue.ally.fleeing && sightUnit(rt, cue.ally)) && Math.hypot(cue.x - p.x, cue.z - p.z) < 28 && safe(cue.x, cue.z)) return cue;
    cue.house = null;
    // 既に味方の陰なら、動かず止まる場所を足元に示す。
    if (treatment && rt.player.treatmentShelter(p)) {
      if (!cue.valid || Math.hypot(cue.x - p.x, cue.z - p.z) >= cue.radius || !safe(cue.x, cue.z)) {
        cue.x = p.x; cue.z = p.z;
      }
      cue.valid = true; return cue;
    }
    cue.valid = false; cue.ally = null;
    let best = Infinity;
    // 家の候補がある戦も、実際に手当てでき、歩いて届く場所だけを案内する。
    if (treatment) for (const house of rt.def.treatmentHouses?.(rt) || []) {
      const q = house.approach;
      if (house.burnt || !q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > 28 || d >= best || !safe(q.x, q.z)) continue;
      point.x = q.x; point.z = q.z; point.y = groundAt(rt.world, q.x, q.z, p.y);
      if (!clearFoot(rt, point) || !localClear(rt.army, p, point)) continue;
      best = d; cue.x = q.x; cue.z = q.z; cue.valid = true; cue.house = house;
    }
    if (cue.valid) return cue;
    for (const a of rt.army.units) {
      if (a === rt.player.u || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct || a.team !== rt.player.u.team ||
          treatment && (a.farSim || a.rearWound || a.downed || a.group?.hidden || a.group?.routed || a.stagger > 0 || a.hp < a.maxHp * .35 || a.type === 'dummy' || a.type === 'porter')) continue;
      if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 32 || !sightUnit(rt, a)) continue;
      let foe = enemy;
      if (treatment) {
        let nearest = 45 * 45;
        for (const o of rt.army.units) {
          if (!o.alive || o.team === a.team || o.fleeing || o.civ || o.noTarget || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
          const d = (o.pos.x - a.pos.x) ** 2 + (o.pos.z - a.pos.z) ** 2;
          if (d < nearest) { nearest = d; foe = o; }
        }
      }
      const dx = foe ? a.pos.x - foe.pos.x : -Math.sin(rt.player.yaw);
      const dz = foe ? a.pos.z - foe.pos.z : -Math.cos(rt.player.yaw);
      const length = Math.hypot(dx, dz) || 1, x = a.pos.x + dx / length * 4, z = a.pos.z + dz / length * 4;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= best || d > 28 || !treatment && enemy && Math.hypot(x - enemy.pos.x, z - enemy.pos.z) < Math.hypot(p.x - enemy.pos.x, p.z - enemy.pos.z) + 2 || !safe(x, z)) continue;
      best = d; cue.x = x; cue.z = z; cue.valid = true; cue.ally = a;
    }
    // 仲間が近くにいない時も、歩けて敵から離れる床を半秒ごとに探す。
    if (!cue.valid && !treatment) {
      let foe = enemy, nearest = Infinity;
      if (!foe) for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.team === rt.player.u.team || u.fleeing || u.noTarget || u.civ || u.isStruct || !sightUnit(rt, u)) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < nearest) { nearest = d; foe = u; }
      }
      const away = foe ? Math.atan2(p.x - foe.pos.x, p.z - foe.pos.z) : rt.player.yaw + Math.PI;
      let score = -Infinity;
      for (let i = 0; i < 24; i++) {
        const angle = away + (i % 8) * Math.PI / 4, distance = 6 + Math.floor(i / 8) * 3;
        const x = p.x + Math.sin(angle) * distance, z = p.z + Math.cos(angle) * distance;
        point.x = x; point.z = z; point.y = groundAt(rt.world, x, z, p.y);
        if (!clearFoot(rt, point) || !localClear(rt.army, p, point) || !safe(x, z)) continue;
        const clearance = foe ? Math.hypot(x - foe.pos.x, z - foe.pos.z) - Math.hypot(p.x - foe.pos.x, p.z - foe.pos.z) : distance;
        if (clearance < 2 || clearance - distance * .2 <= score) continue;
        score = clearance - distance * .2; cue.x = x; cue.z = z; cue.y = point.y; cue.valid = true;
      }
    }
    return cue.valid ? cue : null;
  }

  // 入口と持ち場の枠。戦ごとの座標を読み、札を増やさず実際の場所へ重ねる。
  drawPlaceFrame(g, rt, doorwayFrame = null) {
    this.placeFrameShown = false;
    if (retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid) return false;
    const guardFrame = !doorwayFrame && rt.def.guardPlaceFrame?.(rt);
    // 守る持ち場と、道案内を優先する戸口は、近くに敵がいても枠を残す。
    if (!guardFrame && !(doorwayFrame && rt.def.routeGuidePriority?.(rt)) &&
        (this.defendEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive)) return false;
    if ((!doorwayFrame && rt.def.routeDestinationSight) || !guardFrame && navigationEnemy(rt) && !rt.def.routeGuidePriority?.(rt)) return false;
    if (!guardFrame && this.defendEnemy && !rt.def.routeGuidePriority?.(rt) || rainDanger(rt.army) || S.reduceGuidance || guidanceEnded(rt) || this.openingActive || rt.choice || rt.player.camShot || this.bigmap || rt.dodgeGuide) return false;
    const frame = doorwayFrame || guardFrame || rt.def.placeFrame?.(rt);
    if (!frame) return false;
    if (doorwayFrame) return this.drawDoorwayFrame(g, rt, frame);
    const W = VIEW.w, H = VIEW.h;
    // 通り口を一つの矢印で示す戦では、枠・輪・道筋を重ねない。
    if (!doorwayFrame && !guardFrame && rt.def.singlePassageArrow) {
      const goal = this.passageGoal || (this.passageGoal = { x: 0, y: 0, z: 0 });
      goal.x = (frame[2].x + frame[3].x) / 2;
      goal.y = (frame[2].y + frame[3].y) / 2;
      goal.z = (frame[2].z + frame[3].z) / 2;
      const sign = this.project(goal, goal.y, rt);
      if (sign.behind || sign.x < 32 || sign.x > W - 32 || sign.y < 136 || sign.y > H - 24) return false;
      this.drawNavigationArrow(g, sign.x, sign.y, Math.PI / 2, 1.1, true);
      this.placeFrameShown = true;
      return true;
    }
    // 入口の四隅をそのまま投影する。画面端でも入口の形を残す。
    const points = this.placeFramePoints || (this.placeFramePoints = new Float32Array(8));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const p = frame[i];
      this.tmpV.set(p.x, p.y, p.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return false;
      const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
      points[i * 2] = x; points[i * 2 + 1] = y;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 12 || left > W - 12 || bottom < 64 || top > H - 24 ||
        (right - left) * (bottom - top) > W * H / 3) return false;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
    // 入口の中心を保つ。戸口の輪も小さく収め、兵と床を見せる。
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const scale = guardFrame ? 1 : Math.min(1, 72 / Math.max(1, right - left), 64 / Math.max(1, bottom - top));
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = cx + (points[i * 2] - cx) * scale, y = cy + (points[i * 2 + 1] - cy) * scale;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    // 戸口の中は塗らず、先の兵と床を見通せるようにする。
    g.strokeStyle = '#14120f'; g.lineWidth = guardFrame ? 10 : 5; g.stroke();
    g.strokeStyle = guardFrame ? '#ffffff' : '#fff3ba'; g.lineWidth = guardFrame ? 5 : 2; g.stroke();
    if (guardFrame) { g.restore(); return true; }
    // 口の床を大きな矢印と輪で示し、手前の短い道筋だけを添える。
    const goal = this.placeFrameGoal || (this.placeFrameGoal = { x:0, y:0, z:0 });
    goal.x = (frame[2].x + frame[3].x) / 2;
    goal.y = (frame[2].y + frame[3].y) / 2;
    goal.z = (frame[2].z + frame[3].z) / 2;
    const p = rt.player.u.pos, distance = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (distance > 2) {
      const path = this.placeFramePath || (this.placeFramePath = [{ x:0, z:0 }, { x:0, z:0 }]);
      const length = Math.min(10, distance);
      path[0].x = goal.x + (p.x - goal.x) * length / distance;
      path[0].z = goal.z + (p.z - goal.z) * length / distance;
      path[1].x = goal.x; path[1].z = goal.z;
      this.drawRoutePath(g, rt, path);
    }
    this.drawTargetFootRing(g, rt, goal, 1.25);
    this.drawNavigationArrow(g, (points[4] + points[6]) / 2, (points[5] + points[7]) / 2, Math.PI / 2, 1.15);
    this.placeFrameShown = true;
    g.restore(); return true;
  }

  // 行き先のそばだけ短い線を残し、札から戦場を横切らない。
  drawGuideLink(g, x, y, left, top, right, bottom, connected = false) {
    // 左欄へ戻した任務に、以前の固定位置へ向かう線だけを残さない。
    if (!connected && isTouch && VIEW.w >= 601 && VIEW.h <= 500 && this.rt?.def.sideTaskLabel && $('objectives').classList.contains('ground-order')) return;
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const dx = x - cx, dy = y - cy, length = Math.hypot(dx, dy);
    if (length < 1 || x >= left - 8 && x <= right + 8 && y >= top - 8 && y <= bottom + 8) return;
    const t = Math.min((right - left) / 2 / Math.max(.001, Math.abs(dx)), (bottom - top) / 2 / Math.max(.001, Math.abs(dy)));
    const ux = dx / length, uy = dy / length;
    // 一組の案内は札の縁から旗へ結ぶ。ほかは行き先のそばだけに留める。
    const stem = Math.min(this.rt?.def.guideLinkLength ?? Infinity,
      connected ? Math.max(14, length * (1 - t) - 6) : Math.min(40, Math.max(14, length * (1 - t))));
    g.save(); g.globalAlpha *= .78; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - ux * stem, y - uy * stem); g.lineTo(x - ux * 14, y - uy * 14);
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - ux * 22 - uy * 10, y - uy * 22 + ux * 10);
    g.lineTo(x - ux * 22 + uy * 10, y - uy * 22 - ux * 10); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  // 小さな線描と生成りの色を合わせる。兵や地形を塗りつぶさず、暗い縁で水面でも読める。
  drawGoalArrow(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y - 28); g.lineTo(x, y);
    g.moveTo(x - 10, y - 12); g.lineTo(x, y); g.lineTo(x + 10, y - 12);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#eee6ce'; g.lineWidth = 2; g.stroke(); g.restore();
  }

  // 移動と到着に同じ太い矢印を使う。先端が指す一点は動かさない。
  drawNavigationArrow(g, x, y, angle = Math.PI / 2, scale = 1, atFoot = false) {
    if (this.rt?.touchSwipeActive && !atFoot && !this.rt.missionGuide?.marker) return;
    // 近い視点で、矢印が本人の頭や体に重なる時は描かない（頭を指す矢印に見える）。
    const rt = this.rt, me = rt?.player?.u?.pos;
    if (!atFoot && me && rt.camera.position.distanceTo(me) < 4.5) {
      const v = this.navArrowV || (this.navArrowV = this.tmpV.clone());
      v.set(me.x, me.y + 1.75, me.z).project(rt.camera);
      const hx = (v.x * .5 + .5) * VIEW.w, hy = (-v.y * .5 + .5) * VIEW.h;
      v.set(me.x, me.y, me.z).project(rt.camera);
      const fy = (-v.y * .5 + .5) * VIEW.h;
      if (Math.abs(x - hx) < 48 && y > hy - 45 && y < fy) return;
    }
    g.save(); g.translate(x, y); g.rotate(angle - Math.PI / 2);
    g.scale(scale, scale);
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -22);
    g.lineTo(-7, -22); g.lineTo(-7, -52); g.lineTo(7, -52);
    g.lineTo(7, -22); g.lineTo(18, -22); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 11; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  // 画面外の行き先も到着先と同じ旗形。墨の下地で柱や兵から離す。
  drawEdgeDestination(g, x, y, angle, defend = false, caption = '') {
    g.save();
    g.font = 'bold 16px sans-serif';
    const half = Math.max(36, caption ? g.measureText(caption).width / 2 + 12 : 36);
    g.fillStyle = '#14120f'; g.fillRect(x - half, y - 76, half * 2, 112);
    this.drawNavigationArrow(g, x + Math.cos(angle) * 22, y + Math.sin(angle) * 22, angle, .85, true);
    this.drawSmallGoalFlag(g, x - 12, y - 18, .8, false, defend);
    if (caption) {
      g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff3ba'; g.fillText(caption, x, y + 24);
    }
    g.restore();
  }

  // 守る相手は携帯でも見つかる盾。頭上に固定し、十字で敵の三角と区別する。
  drawGuardSign(g, x, y) {
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - 22, y - 52); g.lineTo(x + 22, y - 52);
    g.lineTo(x + 22, y - 23); g.quadraticCurveTo(x + 18, y - 10, x, y);
    g.quadraticCurveTo(x - 18, y - 10, x - 22, y - 23); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(x, y - 42); g.lineTo(x, y - 17);
    g.moveTo(x - 12, y - 31); g.lineTo(x + 12, y - 31);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.restore();
  }

  // 門とお堂の入口、任務札に共通の門形。
  drawEntranceSign(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x - 23, y - 34); g.lineTo(x, y - 46); g.lineTo(x + 23, y - 34);
    g.lineTo(x + 17, y - 34); g.lineTo(x + 17, y);
    g.lineTo(x + 9, y); g.lineTo(x + 9, y - 26);
    g.lineTo(x - 9, y - 26); g.lineTo(x - 9, y);
    g.lineTo(x - 17, y); g.lineTo(x - 17, y - 34); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  // 本人は白いひし形と人の形。行き先の旗とは色に頼らず見分ける。
  drawPlayerSign(g, rt) {
    // 向きの印は実際の足元に置く。操作を始める丸とは形も位置も分ける。
    if (!this.headingDrawn && !this.openingActive && !rt.def.town && !rt.def.dojo &&
        !S.reduceGuidance && !guidanceEnded(rt) && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap &&
        rt.player.u.alive && rt.player.fpK <= .5 &&
        (this.aimGuideEnemy?.alive || this.defendEnemy?.alive || rt.def.waitFacingPoint?.(rt))) {
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt, this.headingFoot || (this.headingFoot = {}));
      const tip = this.headingPoint || (this.headingPoint = { x:0, y:0, z:0 });
      tip.x = p.x + Math.sin(rt.player.yaw) * 2;
      tip.z = p.z + Math.cos(rt.player.yaw) * 2; tip.y = p.y + .12;
      const end = this.project(tip, tip.y, rt, this.headingEnd || (this.headingEnd = {}));
      const dx = end.x - foot.x, dy = end.y - foot.y, length = Math.hypot(dx, dy);
      if (!foot.behind && !end.behind && length > 1 && foot.x > 24 && foot.x < VIEW.w - 24 && foot.y > 64 && foot.y < VIEW.h - 24) {
        this.drawNavigationArrow(g, foot.x + dx / length * 34, foot.y + dy / length * 34,
          Math.atan2(dy, dx), .65, true);
        this.headingDrawn = true;
      }
    }
    // 戦では行き先と戦う相手の印を優先する。自分の印は組の詳細を開いた時だけ。
    let lifeSign = false;
    if ((rt.def.town || rt.def.dojo || rt.player.showSquad) && rt.player.u.alive && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && rt.player.fpK <= .5) {
      const p = rt.player.u.pos;
      const head = this.project(p, p.y + (rt.player.mounted ? 3.5 : 2.5), rt,
        this.selfLifeProjection || (this.selfLifeProjection = {}));
      if (!head.behind && head.x >= 16 && head.x <= VIEW.w - 16 && head.y >= 16 && head.y <= VIEW.h - 16) {
        g.save(); g.lineJoin = 'round'; g.beginPath();
        g.moveTo(head.x, head.y - 9); g.lineTo(head.x + 7, head.y);
        g.lineTo(head.x, head.y + 9); g.lineTo(head.x - 7, head.y); g.closePath();
        g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.restore();
        lifeSign = true;
      }
    }
    if (this.openingActive || this.retreatGuide?.active && this.retreatGuide.valid) {
      if (rt.choice || rt.player.camShot || this.bigmap || rt.player.fpK > .5) return false;
      // なぞる始点は案内側の大きな丸一つ。本人の囲みや足元の丸を重ねない。
      if (this.openingActive && this.opening?.el.classList.contains('opening-controls')) {
        if (!this.opening.linkStart) this.drawMoveOrigin(g, this.opening.swipeX, this.opening.swipeY, 32);
        return true;
      }
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .08, rt, this.selfGuideProjection || (this.selfGuideProjection = {}));
      if (foot.behind) return false;
      const openingSwipe = this.openingActive && this.opening?.el.classList.contains('opening-controls') && !this.opening.flagGround;
      this.drawMoveOrigin(g, openingSwipe ? this.opening.swipeX : foot.x, openingSwipe ? this.opening.swipeY : foot.y, 24, isTouch || openingSwipe ? '' : '自分');
      if (this.openingActive && !rt.def.openingFootSignOnly) {
        const frame = this.measurePersonFrame(rt.player.u, rt);
        if (frame) {
          g.save(); g.beginPath();
          g.roundRect(frame.left - 6, frame.top - 6, frame.right - frame.left + 12, frame.bottom - frame.top + 12, 12);
          g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
          g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke(); g.restore();
        }
      }
      return true;
    }
    if (singleBattleGuide(rt)) return lifeSign;
    if (this.openingActive && this.opening?.el.classList.contains('opening-controls') || rt.def.hidePlayerSign || guidanceEnded(rt) || rt.choice || rt.player.camShot || this.bigmap || rt.player.fpK > .5) return false;
    const p = rt.player.u.pos;
    this.tmpV.set(p.x, p.y + .08, p.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return false;
    const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
    // 小さい下限まで明示した戦だけ、その値を使う。他の戦の輪は保つ。
    const scale = rt.def.compactPlayerSign && rt.def.playerSignMinScale != null
      ? Math.max(.25, rt.def.playerSignMinScale ?? .4, rt.def.playerSignScale ?? .4)
      : Math.max(.95, rt.def.playerSignMinScale ?? .95, rt.def.playerSignScale ?? 1);
    g.save(); g.lineJoin = 'round';
    if (x >= 0 && x <= VIEW.w && y >= 0 && y <= VIEW.h + 16) {
      g.save(); g.translate(x, y); g.scale(scale, scale);
      g.beginPath(); g.moveTo(0, -14); g.lineTo(24, 0); g.lineTo(0, 14); g.lineTo(-24, 0); g.closePath();
      g.strokeStyle = '#14120f'; g.lineWidth = 18; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.stroke();
      g.restore();
      // 人の印を省く戦は足元の輪だけ残す。それ以外の大きさは保つ。
      const bodyScale = rt.def.playerSignBodyScale ?? 1;
      if (bodyScale > 0) {
        g.save(); g.translate(x, y - Math.max(16, 18 * scale));
        g.scale(bodyScale, bodyScale);
        g.beginPath(); g.arc(0, -22, 5, 0, Math.PI * 2);
        g.moveTo(-8, -2); g.lineTo(-8, -10); g.quadraticCurveTo(-8, -15, 0, -15);
        g.quadraticCurveTo(8, -15, 8, -10); g.lineTo(8, -2);
        g.lineTo(3, -2); g.lineTo(3, 3); g.lineTo(-3, 3); g.lineTo(-3, -2); g.closePath();
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
        g.fillStyle = '#ffffff'; g.fill(); g.restore();
      }
    }
    // 向きを変える案内では、動かす本人も足まで囲む。敵は頭上の大きな矢印で区別する。
    if (!rt.def.playerFootSignOnly && isTouch && this.defendEnemy?.alive && !this.guardFacing && !this.retreatGuide?.active && !rt.dodgeGuide) {
      const f = this.measurePersonFrame(rt.player.u, rt);
      if (f && f.top >= 12 && f.bottom <= VIEW.h - 16) {
        g.beginPath(); g.roundRect(f.left - 6, f.top - 6, f.right - f.left + 12, f.bottom - f.top + 12, 8);
        g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
      }
    }
    g.restore(); return true;
  }

  // 行き先は太い矢印。守る場所の旗と形を分ける。
  drawDestinationSign(g, x, y) {
    this.drawNavigationArrow(g, x, y, Math.PI / 2, .65, true);
  }

  // 歩く棒と同じ視点で、今必要な指の向きを短く示す。
  navigationDirection(rt, pos) {
    const p = rt.player.u.pos, yaw = rt.player.yaw;
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const diagonal = Math.min(Math.abs(right), Math.abs(forward)) > Math.max(Math.abs(right), Math.abs(forward)) * .4142;
    const side = diagonal ? `${right >= 0 ? '右' : '左'}${forward >= 0 ? '上' : '下'}` :
      Math.abs(right) > Math.abs(forward) ? right >= 0 ? '右' : '左' : forward >= 0 ? '上' : '下';
    return side;
  }

  navigationMoveText(rt, pos) {
    const side = this.navigationDirection(rt, pos);
    return isTouch ? `${side}へなぞって進む` : `${side.replace('上', '前').replace('下', '後ろ')}へ進む`;
  }

  // 開幕と同じ指の絵を既存の札に入れ、歩く側のなぞる向きを示す。
  navigationGesture(rt, pos) {
    const side = this.navigationDirection(rt, pos);
    const angle = side === '右上' ? 45 : side === '右下' ? 135 : side === '左上' ? -45 : side === '左下' ? -135 :
      side === '右' ? 90 : side === '左' ? -90 : side === '下' ? 180 : 0;
    return `<svg class="retreat-gesture" viewBox="-56 -4 160 160" aria-hidden="true"><g transform="rotate(${angle} 24 76)"><circle cx="24" cy="76" r="26" fill="#14120f" stroke="#fff3ba" stroke-width="4"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#14120f" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#fff3ba" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M18 91V76Q18 68 24 68Q30 68 30 76V88L35 85Q39 83 43 87L50 94L46 110H20L7 97Q3 90 9 89Q13 88 18 94Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg>`;
  }

  // 印の先は本人の頭上へ固定し、札をよけても相手を見失わせない。
  drawPersonSign(g, x, y, talk = false) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath();
    if (talk) {
      g.arc(0, -38, 21, 0, Math.PI * 2);
      g.moveTo(-5, -17); g.lineTo(5, -17); g.lineTo(5, -10);
      g.lineTo(12, -10); g.lineTo(0, 0); g.lineTo(-12, -10); g.lineTo(-5, -10); g.closePath();
    } else {
      g.moveTo(-17, -42); g.lineTo(17, -42); g.lineTo(17, -24);
      g.quadraticCurveTo(17, -10, 0, -3); g.quadraticCurveTo(-17, -10, -17, -24); g.closePath();
    }
    g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke(); g.fill();
    if (talk) {
      // 札と頭上で同じ顔を使う。色だけで相手を探させない。
      g.translate(0, -12);
      g.beginPath(); g.moveTo(-13, -34); g.quadraticCurveTo(0, -48, 13, -34);
      g.moveTo(-7, -29); g.lineTo(-7, -25); g.moveTo(7, -29); g.lineTo(7, -25);
      g.moveTo(-7, -18); g.quadraticCurveTo(0, -12, 7, -18);
      g.lineWidth = 3; g.stroke();
    }
    g.restore();
  }

  // 端の矢印を下の命の札などに重ねない。札の上へ逃がす。
  liftAboveLowHud(x, y, top) {
    for (const r of this.hudRects()) if (r.top > VIEW.h / 2 && x + 44 > r.left && x - 44 < r.right && y + 40 > r.top) y = Math.max(top, r.top - 48);
    return y;
  }

  // 行き先が画面外でも、端から余白を取り、同じ太い矢印で向きを保つ。
  drawOffscreenDirection(g, rt, pos, destination = false) {
    const p = destination === 'person' ? rt.camera.position : rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = destination === 'person' ? Math.atan2(this.tmpV.x, this.tmpV.z) : rt.player.yaw + (rt.player.camYawOff || 0);
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.hypot(right, forward) < .001) return;
    // 上端の任務札と下端の操作域を避けた長方形へ、向きを保って寄せる。
    const top = Math.min(112, H / 3), bottom = H - 76;
    const centerY = (top + bottom) / 2;
    const scale = Math.min(Math.max(12, W / 2 - 80) / Math.max(.001, Math.abs(right)),
      Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
    const x = W / 2 + right * scale, y = centerY - forward * scale;
    if (destination === 'person') {
      // 上の札へ向けず、左右の端で本人のいる側を示す。
      const edgeX = right >= 0 ? W - 64 : 64;
      const spot = this.avoidRects(edgeX, Math.max(180, H * .62), W, H, 'v', null, 42, 100, true);
      const point = this.offscreenGuidePoint || (this.offscreenGuidePoint = { x:0, y:0 });
      point.x = edgeX; point.y = spot ? spot[1] : Math.min(H - 80, Math.max(180, H * .62));
      // 画面外では矢印一つだけにし、画面内の顔と同時に出さない。
      this.drawNavigationArrow(g, edgeX, point.y - 24,
        right >= 0 ? 0 : Math.PI, .45);
      return point;
    }
    if (destination === 'enemy') {
      // 見える地面に進む矢印と旗を置く。画面外では同じ印を端へ寄せる。
      this.drawDestinationPointer(g, rt, pos, true, .95);
      return;
    }
    if (destination) {
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right));
      const point = this.offscreenGuidePoint || (this.offscreenGuidePoint = { x:0, y:0 });
      point.x = x; point.y = y;
      return point;
    }
    g.save(); g.translate(x, y);
    g.rotate(Math.atan2(-forward, right) - Math.PI / 2);
    g.globalAlpha *= .88; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(0, 12); g.lineTo(8, -8);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke(); g.restore();
  }

  talkPersonVisible(rt, person) {
    if (!person.alive || person.gone || person.camHidden || person.mesh?.visible === false) return false;
    if (sightScreenUnit(rt, person)) return true;
    // 足元が画面の外でも、頭が見えていれば本人の上へ印を残す。
    const point = this.talkHeadPoint || (this.talkHeadPoint = { x:0, y:0, z:0 });
    // 会話相手は現在地で調べ、描画の間引きで止まった頭の骨を参照しない。
    this.tmpV.set(person.pos.x, person.pos.y + (person.mounted ? 3.1 : (person.bodyHeight ?? 1.72) + .12), person.pos.z);
    point.x = this.tmpV.x; point.y = this.tmpV.y; point.z = this.tmpV.z;
    return sightPoint(rt, point, 170, true, 0);
  }

  drawTalkGuide(g, rt, person) {
    // 見える時だけ示す相手は、家の向こうを囲まず端の方向印へ戻す。
    const marker = rt.missionGuide?.marker;
    const visible = !marker?.guideVisibleOnly || this.talkPersonVisible(rt, person);
    // 画面内かどうかと、壁に隠れているかを分ける。壁の裏を画面外の矢印で示さない。
    const frame = this.measurePersonFrame(person, rt, true);
    const order = $('objectives');
    const onScreen = frame && frame.cx >= 0 && frame.cx <= VIEW.w && frame.top >= 0 && frame.top <= VIEW.h;
    const direction = !onScreen && this.drawOffscreenDirection(g, rt, person.pos, 'person');
    setClass(this.root, 'talk-edge', !!direction);
    setClass(this.root, 'talk-located', !!onScreen && visible);
    if (!onScreen || !visible) {
      setClass(order, 'talk-order', false);
      setClass(this.root, 'travel-guide', true);
      return !!direction;
    }
    // 頭上の札へまとめ、上の任務札に同じ文を残さない。
    setClass(order, 'talk-order', false);
    // 近くでは実際に押せる会話釦へ渡し、近づく札を同時に残さない。
    if (this.root.classList.contains('talk-ready')) {
      this.drawPersonSign(g, frame.cx, frame.top - 4, true);
      return true;
    }
    // 一枚の札で、まず近づき、それから話す順番を示す。
    const text = marker?.guideTalkLabel || 'この人に ちかづこう';
    const width = Math.min(248, VIEW.w - 32), height = 44;
    const cx = onScreen ? Math.max(width / 2 + 8, Math.min(VIEW.w - width / 2 - 8, frame.cx)) : VIEW.w / 2;
    const left = cx - width / 2, top = onScreen ? Math.max(8, frame.top - 108) : 16;
    g.save(); g.fillStyle = '#14120f'; g.fillRect(left, top, width, height);
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.strokeRect(left, top, width, height);
    g.fillStyle = '#fff3ba'; g.font = `${20 * Math.max(1, S.textScale || 1)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cx, top + height / 2, width - 20);
    // 札から本人へつなぎ、名前だけで目的を推測させない。
    if (onScreen) {
      this.drawGuideLink(g, frame.cx, frame.top - 52, left, top, left + width, top + height, true);
      // 顔の下端が頭を指す。離れた下矢印や足元の印を重ねない。
    }
    // 顔は本人の頭上だけ。画面外には顔や中央の行き先札を残さない。
    if (onScreen) this.drawPersonSign(g, frame.cx, frame.top - 4, true);
    g.restore();
    setClass(this.root, 'travel-guide', true);
    return true;
  }

  // 頭上の顔と札の顔をそろえ、札を離しても本人の位置を保つ。
  drawTalkPerson(g, rt, person, frame = this.measurePersonFrame(person, rt, true)) {
    const marker = rt.missionGuide?.marker;
    if (marker?.guideVisibleOnly && !this.talkPersonVisible(rt, person)) return false;
    if (!frame) return false;
    if (frame.cx < 0 || frame.cx > VIEW.w || frame.top < 0 || frame.top > VIEW.h) return false;
    // 始まりの札は既にあるので、ここでは頭上の顔と下矢印だけを足す。
    this.drawPersonSign(g, frame.cx, frame.top - 4, true);
    return true;
  }

  // 話す釦が出た時も、相手は頭上の吹き出し一つで示す。
  drawTalkFocus(g, frame) {
    this.drawPersonSign(g, frame.cx, frame.top - 4, true);
  }

  // 武器や指物を含めず、頭と足元から本人の位置を測る。
  measurePersonFrame(u, rt, positionOnly = false) {
    // 指定した戦だけ、頭と足を同じ現在地から測る。ほかの戦は骨の姿勢を使う。
    positionOnly ||= !!rt.def.positionFrameGuides;
    const frame = this.personFrame || (this.personFrame = {});
    const W = VIEW.w, H = VIEW.h;
    this.tmpV.set(u.pos.x, u.pos.y, u.pos.z).project(rt.camera);
    // 足元だけが手前へ切れても、画面内の頭を端の矢印へ替えない。
    const x = (this.tmpV.x * .5 + .5) * W, bottom = (-this.tmpV.y * .5 + .5) * H;
    const head = !positionOnly && !rt.def.personFrameAtPosition && u.human?.root.visible && u.human.bones?.Head;
    if (head) {
      // 描画を間引いた骨も更新し、会話と戦う相手の印を実際の頭にそろえる。
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(this.tmpV); this.tmpV.y += positionOnly ? .12 : .35;
    }
    else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.1 : positionOnly || rt.def.bodyHeightGuides ? (u.bodyHeight ?? 1.72) + .12 : 2.1), u.pos.z);
    this.tmpV.project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
    frame.cx = (this.tmpV.x * .5 + .5) * W;
    frame.top = (-this.tmpV.y * .5 + .5) * H;
    frame.left = Math.min(x, frame.cx) - 16; frame.right = Math.max(x, frame.cx) + 16;
    frame.bottom = bottom;
    return frame;
  }

  // 柱越しに床の印を描かない。視線と柱の当たりは数値だけで調べる。
  floorGoalVisible(rt, point, checkScreen = true) {
    // 床の矢印は画面の外まで延ばしてから切る。壁越しにだけは描かない。
    if (checkScreen ? !sightPoint(rt, point, 170, true, .08) : rt.army.wallBetween(rt.camera.position, -1, point)) return false;
    const a = rt.camera.position, dx = point.x - a.x, dz = point.z - a.z;
    const length2 = dx * dx + dz * dz;
    for (const wall of rt.army.solids || []) {
      if (wall.k !== 'c' || wall.struct && !wall.struct.alive) continue;
      const t = ((wall.x - a.x) * dx + (wall.z - a.z) * dz) / Math.max(.001, length2);
      if (t <= 0 || t >= 1) continue;
      if (Math.hypot(a.x + dx * t - wall.x, a.z + dz * t - wall.z) < wall.r + .2) return false;
    }
    return true;
  }

  // 戦の行き先は旗にそろえ、町と稽古では床の輪を使う。
  drawFloorGoal(g, rt, x, z, arrow = true, radius = .75) {
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    const floor = groundAt(rt.world, x, z, p.y);
    const point = this.floorGoalPoint || (this.floorGoalPoint = { x: 0, y: 0, z: 0 });
    point.x = x; point.y = floor; point.z = z;
    if (singleBattleGuide(rt)) return this.drawTargetFootRing(g, rt, point, .65);
    if (!this.floorGoalVisible(rt, point)) return false;
    g.beginPath();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const gx = x + Math.cos(angle) * radius, gz = z + Math.sin(angle) * radius;
      const gy = groundAt(rt.world, gx, gz, floor);
      point.x = gx; point.y = gy; point.z = gz;
      if (Math.abs(gy - floor) > .4 || !rt.world.walkable(gx, gz, gy) ||
          i % 6 === 0 && !this.floorGoalVisible(rt, point)) return false;
      this.tmpV.set(gx, gy + .08, gz).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z < -1 || this.tmpV.z > 1 || sx < 32 || sx > W - 32 || sy < 100 || sy > H - 28) return false;
      left = Math.min(left, sx); right = Math.max(right, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    // 持ち場だけでなく、回避・退避の小さな輪も近い視点では巨大になる。
    // 指定の戦では同じ上限を使い、到着の判定と行き先の札は残す。
    if (rt.def.compactFloorGuides && (right - left > W / 3 || bottom - top > H / 3)) return false;
    g.closePath();
    if (rt.def.compactFloorGuides) this.strokeGroundArea(g);
    else {
      g.strokeStyle = '#14120f'; g.lineWidth = rt.def.groundCombatMarkers ? 3 : 9; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = rt.def.groundCombatMarkers ? 1.3 : 4; g.stroke();
    }
    if (arrow) {
      this.tmpV.set(x, floor + .08, z).project(rt.camera);
      this.drawDestinationSign(g, (this.tmpV.x * .5 + .5) * W, (-this.tmpV.y * .5 + .5) * H - 6);
    }
    return true;
  }

  // 戸口の一部が視点や画面から切れても、見えているふちは残す。
  drawDoorwayFrame(g, rt, frame) {
    const W = VIEW.w, H = VIEW.h, camera = rt.camera;
    const view = this.doorFrameView || (this.doorFrameView = new Float64Array(12));
    const edges = this.doorFrameEdges || (this.doorFrameEdges = new Float64Array(16));
    for (let i = 0; i < 4; i++) {
      const p = frame[i];
      this.tmpV.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
      view[i * 3] = this.tmpV.x; view[i * 3 + 1] = this.tmpV.y; view[i * 3 + 2] = this.tmpV.z;
    }
    let count = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = i * 3, b = ((i + 1) % 4) * 3;
      const za = -view[a + 2], zb = -view[b + 2], delta = zb - za;
      let lo = 0, hi = 1;
      if (Math.abs(delta) < .00001) {
        if (za < camera.near || za > camera.far) continue;
      } else {
        const t0 = (camera.near - za) / delta, t1 = (camera.far - za) / delta;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
        if (lo > hi) continue;
      }
      for (let end = 0; end < 2; end++) {
        const t = end ? hi : lo;
        this.tmpV.set(view[a] + (view[b] - view[a]) * t,
          view[a + 1] + (view[b + 1] - view[a + 1]) * t,
          view[a + 2] + (view[b + 2] - view[a + 2]) * t).applyMatrix4(camera.projectionMatrix);
        const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
        edges[count++] = x; edges[count++] = y;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (!count || right < 12 || left > W - 12 || bottom < 64 || top > H - 24) return false;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
    g.beginPath();
    for (let i = 0; i < count; i += 4) { g.moveTo(edges[i], edges[i + 1]); g.lineTo(edges[i + 2], edges[i + 3]); }
    g.lineCap = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 13; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.stroke(); g.restore();
    const bounds = this.doorwayBounds || (this.doorwayBounds = {});
    bounds.left = Math.max(12, left); bounds.right = Math.min(W - 12, right);
    bounds.top = Math.max(64, top); bounds.bottom = Math.min(H - 24, bottom);
    // 遠近で台形になる戸口でも、矢じりは開口の中央へ重ねる。
    this.tmpV.set((frame[0].x + frame[2].x) / 2, (frame[0].y + frame[2].y) / 2,
      (frame[0].z + frame[2].z) / 2).project(camera);
    bounds.arrowX = Math.max(bounds.left, Math.min(bounds.right, (this.tmpV.x * .5 + .5) * W));
    bounds.arrowY = Math.max(bounds.top, Math.min(bounds.bottom, (-this.tmpV.y * .5 + .5) * H));
    this.placeFrameShown = true;
    return true;
  }

  // 手当ての十字は移動中と到着後で同じ大きな形にする。
  drawTreatmentCross(g, x, y) {
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.rect(x - 20, y - 60, 40, 40);
    g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 5;
    g.stroke(); g.fill();
    g.beginPath(); g.moveTo(x, y - 53); g.lineTo(x, y - 27);
    g.moveTo(x - 13, y - 40); g.lineTo(x + 13, y - 40);
    g.lineWidth = 4; g.stroke(); g.restore();
  }

  // 丸から旗までの案内は、切れ目や別向きの矢じりを足さず一本にする。
  drawFlagLink(g, fromX, fromY, toX, toY) {
    if (this.rt?.def.footFlagGuides) return false;
    return this.drawSwipeArrow(g, fromX, fromY, toX, toY);
  }

  // なぞる案内は足元から終点へ一本。開幕と移動、待つ向きで同じ太さを使う。
  clearMoveOrigin(rt, foot) {
    const W = VIEW.w, H = VIEW.h;
    const result = this.clearMovePoint || (this.clearMovePoint = {});
    if (result.rt === rt && result.w === W && result.h === H && rt.t >= result.at && rt.t < result.at + .1) return result;
    result.rt = rt; result.w = W; result.h = H; result.at = rt.t;
    const bodies = this.goalBodyRects(rt), rects = this.hudRects();
    const frame = this.measurePersonFrame(rt.player.u, rt);
    const fx = foot.behind ? (S.touchSwap ? W - 160 : 160) : foot.x;
    const fy = foot.behind ? H - 120 : foot.y;
    let best = Infinity;
    // 人物と既存の札を避け、丸を置ける余白を探す。
    for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) {
      const x = Math.max(48, Math.min(W - 48, fx + (col - 3) * 64));
      const y = Math.max(132, Math.min(H - 96, fy - row * 64));
      let overlap = 0;
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(x + 38, bodies[j + 2]) - Math.max(x - 38, bodies[j])) *
          Math.max(0, Math.min(y + 38, bodies[j + 3]) - Math.max(y - 38, bodies[j + 1]));
      if (frame) overlap += Math.max(0, Math.min(x + 40, frame.right + 8) - Math.max(x - 40, frame.left - 8)) *
        Math.max(0, Math.min(y + 40, frame.bottom + 8) - Math.max(y - 40, frame.top - 8));
      for (const r of rects) overlap += Math.max(0, Math.min(x + 38, r.right) - Math.max(x - 38, r.left)) *
        Math.max(0, Math.min(y + 38, r.bottom) - Math.max(y - 38, r.top));
      const score = overlap * 1000 + Math.hypot(x - fx, y - fy);
      if (score < best) { best = score; result.x = x; result.y = y; }
    }
    return result;
  }

  drawMoveOrigin(g, x, y, radius = 24, caption = '') {
    // 描いた丸は左右どちらにあっても、同じ大きさで歩く操作を受ける。
    const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
    origin.rt = this.rt; origin.at = this.rt.t; origin.x = x; origin.y = y; origin.look = false; origin.radius = radius;
    g.save(); g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    if (caption) {
      g.font = 'bold 16px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const width = g.measureText(caption).width;
      const left = Math.max(12, Math.min(VIEW.w - width - 20, x + radius + 8));
      const top = Math.max(24, Math.min(VIEW.h - 24, y));
      g.fillStyle = '#14120f'; g.fillRect(left - 4, top - 12, width + 8, 24);
      g.fillStyle = '#fff'; g.fillText(caption, left, top);
    }
    g.restore();
  }

  drawSwipeArrow(g, fromX, fromY, toX, toY, radius = 24) {
    const dx = toX - fromX, dy = toY - fromY, distance = Math.hypot(dx, dy);
    if (distance < 44) return false;
    // 指定した戦だけ足元へ短く収め、遠い旗まで兵を横切る線にしない。
    // 旗の位置と操作を受ける始点は動かさない。
    const end = Math.min(distance - 12, 24 + (this.rt?.def.swipeArrowLength ?? Infinity));
    g.save(); g.lineCap = 'round';
    this.routePathSolid ||= []; g.setLineDash(this.routePathSolid);
    g.beginPath();
    g.moveTo(fromX + dx * radius / distance, fromY + dy * radius / distance);
    const tipX = fromX + dx * end / distance, tipY = fromY + dy * end / distance;
    g.lineTo(tipX, tipY);
    g.strokeStyle = '#14120f'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 6; g.stroke();
    this.drawNavigationArrow(g, tipX, tipY, Math.atan2(dy, dx), .55, true);
    g.restore();
    this.drawMoveOrigin(g, fromX, fromY, radius);
    return true;
  }

  drawDirectionChain(g, fromX, fromY, toX, toY, single = false, maxLength = Infinity) {
    // 指定の戦だけ、旗・待機・退避のどの経路でも線を足元の短い案内に収める。
    maxLength = Math.min(maxLength, this.rt?.def.guideArrowLength ?? Infinity);
    const dx = toX - fromX, dy = toY - fromY, distance = Math.hypot(dx, dy);
    if (distance < (single ? 40 : 76)) return false;
    g.save();
    g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 80); g.clip();
    if (single) {
      const start = Math.min(24, distance * .25);
      const angle = Math.atan2(dy, dx), end = Math.min(distance - 12, start + maxLength,
        start + (this.rt?.def.directionArrowLength ?? Infinity));
      g.beginPath(); g.moveTo(fromX + dx * start / distance, fromY + dy * start / distance);
      g.lineTo(fromX + dx * end / distance, fromY + dy * end / distance);
      g.lineCap = 'round';
      g.strokeStyle = '#14120f'; g.lineWidth = 11; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke();
      this.drawNavigationArrow(g, fromX + dx * end / distance, fromY + dy * end / distance, angle, .55, true);
    } else {
      this.directionDash ||= [8, 18];
      g.setLineDash(this.directionDash); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(fromX + dx * 38 / distance, fromY + dy * 38 / distance);
      g.lineTo(toX - dx * 30 / distance, toY - dy * 30 / distance);
      g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
    }
    g.restore();
    return true;
  }

  drawRetreatDestination(g, rt, pos, visible, sx, sy, reached, way = pos, attachOrder = true, link = true) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    // 到着点の輪は実際の地面に固定し、足元から短い矢印で結ぶ。
    const obstacles = this.hudRects();
    const bodies = this.goalBodyRects(rt);
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
    const dx = way.x - p.x, dz = way.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const centerY = (154 + H - 86) / 2;
    const scale = Math.min((W / 2 - 88) / Math.max(.001, Math.abs(side)),
      Math.max(12, (H - 240) / 2) / Math.max(.001, Math.abs(forward)));
    const inset = Math.max(128, Math.min(224, W * .24));
    const x = visible ? sx : side >= 0 ? W - inset : inset;
    const y = visible ? sy : centerY - forward * scale;
    let cueX = Math.max(inset, Math.min(W - inset, x));
    let cueY = Math.max(154, Math.min(H - 76, y - (visible ? 80 : 0)));
    if (!visible) {
      // 端から余白を取り、旗・足元・矢じり全体を札から離す。
      let best = Infinity, bestY = cueY;
      for (let i = 0; i <= 12; i++) {
        const cy = 154 + Math.max(0, H - 230) * i / 12;
        let overlap = 0;
        for (const r of obstacles) {
          if (r === this.guideOrderRect) continue;
          overlap += Math.max(0, Math.min(cueX + 48, r.right) - Math.max(cueX - 32, r.left)) *
            Math.max(0, Math.min(cy + 48, r.bottom) - Math.max(cy - 80, r.top));
        }
        const score = overlap * 100 + Math.abs(cy - cueY);
        if (score < best) { best = score; bestY = cy; }
      }
      cueY = bestY;
    }
    // 退く先は地面の輪。見えない時は方向だけを示す。
    g.save();
    let goalX = visible ? sx : cueX, goalY = visible ? sy : cueY;
    const treatment = !!this.retreatGuide?.treatment;
    const foot = this.project(p, p.y + .08, rt, this.retreatFootProjection || (this.retreatFootProjection = {}));
    if (rt.def.retreatDestinationArrowOnly && !treatment) {
      // 退き先の向きは矢印一つで示す。到着後は任務の下知を読む。
      if (!reached) this.drawNavigationArrow(g, goalX, goalY,
        this.destinationDirection(rt, way), .65, true);
    } else {
      if (link && !reached && !foot.behind) {
        // 本人の白い丸から旗まで一本で結ぶ。途中に別の矢印を足さない。
        const path = !isTouch && !treatment && rt.def.retreatGuidePath?.(rt, pos);
        if (path?.length > 1 && this.drawRoutePath(g, rt, path, true, true)) {
          goalX = this.routePathTip.x; goalY = this.routePathTip.y;
        } else this.drawDirectionChain(g, foot.x, foot.y, goalX, goalY, true, rt.def.retreatArrowLength ?? 72);
        this.drawMoveOrigin(g, foot.x, foot.y, 24);
      }
      if (visible) this.drawTargetFootRing(g, rt, pos, .85);
      this.drawSmallGoalFlag(g, goalX, goalY, 1, false, false, isTouch ? '' : 'ここへ');
    }
    if (reached && treatment) this.drawTreatmentCross(g, goalX + 40, goalY);
    g.restore();
    // 下知と歩数は既存の一枚を矢印のそばへ。別の札は足さない。
    const order = $('objectives');
    if (attachOrder && this.notices.sources[1].selected && !order.classList.contains('expand')) {
      setClass(order, 'ground-order', true); setClass(order, 'travel-retreat', true);
      setClass(order, 'destination-sign', true);
      const sizeKey = order.textContent + ':' + W + ':' + H;
      if (this.retreatOrderSizeKey !== sizeKey) {
        this.retreatOrderSizeKey = sizeKey; this.retreatOrderWidth = order.offsetWidth; this.retreatOrderHeight = order.offsetHeight;
      }
      const width = this.retreatOrderWidth, height = this.retreatOrderHeight;
      let left = 12, top = 12, best = Infinity;
      // 札は左右の端へ寄せ、兵と既存の札を避ける。
      for (let i = 0; i < 8; i++) {
        const side = i % 4;
        const lx = Math.max(12, Math.min(W - width - 12,
          side % 2 === 0 ? W - width - 12 : 12));
        const ly = Math.max(12, Math.min(H - height - 12,
          12 + Math.floor(i / 2) * Math.max(0, (H - height - 24) / 3)));
        let overlap = 0;
        for (const r of obstacles) {
          if (r === this.guideOrderRect) continue;
          overlap += Math.max(0, Math.min(lx + width + 8, r.right) - Math.max(lx - 8, r.left)) *
            Math.max(0, Math.min(ly + height + 8, r.bottom) - Math.max(ly - 8, r.top));
        }
        for (let j = 0; j < this.goalBodyCount; j += 4)
          overlap += Math.max(0, Math.min(lx + width + 8, bodies[j + 2]) - Math.max(lx - 8, bodies[j])) *
            Math.max(0, Math.min(ly + height + 8, bodies[j + 3]) - Math.max(ly - 8, bodies[j + 1]));
        overlap += Math.max(0, Math.min(lx + width, goalX + 64) - Math.max(lx, goalX - 64)) *
          Math.max(0, Math.min(ly + height, goalY + 14) - Math.max(ly, goalY - 66));
        const score = overlap * 100 + Math.hypot(lx + width / 2 - goalX, ly + height / 2 - (goalY - 30));
        if (score < best) { best = score; left = lx; top = ly; }
      }
      // 兵を避ける候補がどれも狭くても、命の欄には重ねない。
      const health = rt.def.retreatOrderAvoidHealth && this.healthRect;
      if (health && left < health.right + 8 && left + width > health.left - 8 &&
          top < health.bottom + 8 && top + height > health.top - 8)
        top = Math.max(12, health.top - height - 8);
      if (isTouch && !treatment && !reached) {
        // 左右入れ替えにも合わせ、指先と矢印を歩く操作面へ置く。
        const touchX = W * (S.touchSwap ? .62 : .38);
        const touchY = Math.max(height + 80, Math.min(H - 128, H * .56));
        left = Math.max(12, Math.min(W - width - 12, touchX - width / 2));
        top = Math.max(12, Math.min(80, touchY - height - 56));
      }
      setCssVar(order, '--ground-order-x', left + 'px');
      setCssVar(order, '--ground-order-y', top + 'px');
      // 携帯の操作札は指先の上、それ以外は旗のそばへまとめる。
    }
    return true;
  }

  // 命・敵・行き先の三枚。退く道筋は同じ形の矢印で示す。
  drawRetreatCues(g, rt) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const enemy = this.retreatGuide.enemy;
    if (!enemy?.alive || !sightUnit(rt, enemy)) return;
    const frame = sightScreenUnit(rt, enemy) && this.measurePersonFrame(enemy, rt);
    const dx = enemy.pos.x - p.x, dz = enemy.pos.z - p.z;
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const x = frame ? frame.cx : side >= 0 ? W - 52 : 52;
    const y = frame ? Math.max(68, frame.top - 48) : Math.max(76, Math.min(H - 100, H / 2 - forward * 4));
    const textScale = Math.max(1, S.textScale || 1);
    const spot = this.avoidRects(x, y + 40, W, H, 'v', null, Math.max(26, 12 * textScale + 6), 64, true);
    if (!spot) return;
    const labelY = spot[1] - 40;
    g.save(); g.font = `bold ${20 * textScale}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const half = Math.max(20, g.measureText('敵').width / 2 + 6);
    g.fillStyle = '#14120f'; g.fillRect(spot[0] - half, labelY - 15, half * 2, 30);
    g.fillStyle = '#fff3ba'; g.fillText('敵', spot[0], labelY);
    if (frame) this.drawGuideLink(g, frame.cx, Math.max(24, frame.top - 4),
      spot[0] - half, labelY - 15, spot[0] + half, labelY + 15, true);
    else this.drawNavigationArrow(g, spot[0], labelY + 38, Math.atan2(-forward, side), .5);
    g.restore();
  }

  // 道案内専用の入れ物を使い、兵の命令や遊ぶ人の移動には触れない。
  drawTravelGuide(g, rt, pos, radius, ally, showLabel = true, retreat = false, routeOnly = false, goalPos = pos) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    if (!ally && !retreat) setClass(this.root, 'travel-guide', true);
    const cache = this.travelGuide || (this.travelGuide = {
      scout: { id: 0, pos: p }, goal: { x: 0, y: 0, z: 0 },
      arrow: new Float32Array(14), at: -1, gx: Infinity, gz: Infinity, valid: false
    });
    // 指定した戦だけ、描いた印の範囲も札の置き場から除く。入れ物は使い回す。
    const reserved = rt.def.clearTravelGuide ? (cache.reserved || (cache.reserved = [])) : null;
    if (reserved) reserved.length = 0;
    let arrowLeft = Infinity, arrowTop = Infinity, arrowRight = -Infinity, arrowBottom = -Infinity;
    const reached = Math.hypot(pos.x - p.x, pos.z - p.z) < radius;
    // 半秒ごとに歩ける道を調べる。矢印は道の地面に投影し、崖へ貼らない。
    if (cache.at > rt.t + .5 || cache.at <= rt.t || Math.hypot(pos.x - cache.gx, pos.z - cache.gz) > 1) {
      cache.at = rt.t + .5; cache.gx = pos.x; cache.gz = pos.z; cache.valid = false;
      cache.scout.pos = p;
      cache.goal.x = pos.x; cache.goal.z = pos.z; cache.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
      const way = rt.world.def.guideWay?.(rt.player.u, cache.goal) || mountainWay(rt.army, cache.scout, cache.goal, true);
      const dx = way.x - p.x, dz = way.z - p.z, length = Math.hypot(dx, dz);
      if (length > .8) {
        const ux = dx / length, uz = dz / length;
        // 足元から次の曲がり角まで。狭い道では幅を縮め、壁をまたがない。
        for (let tip = retreat ? length : Math.min(6, length); tip >= .8 && !cache.valid; tip *= .5) {
          const tail = .3, neck = Math.max(tail, tip - Math.min(1.4, tip * .45));
          for (let width = .8; width >= .19 && !cache.valid; width *= .5) {
            cache.valid = true;
            for (let i = 0; i < 7; i++) {
              const along = i === 0 ? tip : i === 3 || i === 4 ? tail : neck;
              const across = i === 0 ? 0 : (i < 4 ? 1 : -1) * (i === 1 || i === 6 ? width : width * .45);
              const q = cache.goal;
              q.x = p.x + ux * along - uz * across; q.z = p.z + uz * along + ux * across; q.y = p.y;
              cache.arrow[i * 2] = q.x; cache.arrow[i * 2 + 1] = q.z;
              if (!localClear(rt.army, p, q, true)) cache.valid = false;
            }
          }
        }
      }
      cache.goal.x = goalPos.x; cache.goal.z = goalPos.z;
      cache.goal.y = groundAt(rt.world, goalPos.x, goalPos.z, p.y);
      cache.goalClear = !rt.army.wallBetween(p, -1, cache.goal);
    }
    const floorY = groundAt(rt.world, goalPos.x, goalPos.z, p.y);
    const s = this.project(goalPos, floorY + .18, rt);
    let onScreen = !s.behind && s.x > 48 && s.x < W - 48 && s.y > (retreat ? 154 : 100) && s.y < H - 28 &&
      cache.goalClear && this.floorGoalVisible(rt, cache.goal);
    if (retreat && !routeOnly) {
      const target = cache.retreatWay || (cache.retreatWay = { x: 0, z: 0 });
      target.x = !onScreen && cache.valid && !cache.goalClear ? cache.arrow[0] : goalPos.x;
      target.z = !onScreen && cache.valid && !cache.goalClear ? cache.arrow[1] : goalPos.z;
      // 本人と旗の間に柵があっても、視点から見える戻り先には旗と輪を置く。
      const goalVisible = !s.behind && s.x > 48 && s.x < W - 48 && s.y > 100 && s.y < H - 28 && this.floorGoalVisible(rt, cache.goal);
      return this.drawRetreatDestination(g, rt, goalPos, goalVisible, s.x, s.y, reached, target);
    }
    let drew = false, routeArrow = false;
    g.save(); g.lineJoin = 'round';
    // 戸口や角が見えない時は左右へ振り向かせる。見える道の矢印は床への投影を保つ。
    if (routeOnly && rt.def.routeDestinationSight && !onScreen && !reached) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const turnRight = side >= 0;
      if (forward < 0 || Math.abs(side) >= forward * .45) {
        this.drawNavigationArrow(g, turnRight ? W - 80 : 80, H * .55, turnRight ? 0 : Math.PI, .6);
        drew = true;
      }
      g.restore(); return drew;
    }
    // 見えている行き先に直接、一つの短い矢印を付ける。到着の判定は変えない。
    if (retreat || !reached && (onScreen || rt.def.compactTravelArrow || rt.missionGuide?.marker?.entrance || rt.def.placeFrame?.(rt))) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      let tx = onScreen ? s.x : side >= 0 ? W - (retreat ? 84 : 48) : retreat ? 84 : 48;
      let ty = onScreen ? s.y : retreat ? Math.min(H - 84, H * .55 + 32) : H * .55 + 32;
      if (!onScreen && cache.valid && !cache.goalClear) {
        const x = cache.arrow[0], z = cache.arrow[1];
        this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .18, z).project(rt.camera);
        if (this.tmpV.z >= -1 && this.tmpV.z <= 1) {
          tx = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
          ty = Math.max(100, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
        }
      }
      this.tmpV.set(p.x, p.y + .18, p.z).project(rt.camera);
      const fx = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
      const fy = Math.max(100, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
      const angle = Math.atan2(ty - fy, tx - fx);
      // 画面内も端も同じ線描を使う。方向は保ち、塗りつぶす面を作らない。
      g.save(); g.translate(tx, ty); g.rotate(angle - Math.PI / 2);
      this.drawGoalArrow(g, 0, 0); g.restore();
      arrowLeft = tx - 32; arrowRight = tx + 32;
      arrowTop = ty - 32; arrowBottom = ty + 32;
      drew = true; routeArrow = true;
    }
    // 足元がカメラの裏へ切れても、先の床の矢印まで消さない。
    // 歩ける道の内側へ一つ置き、ほかの目印と重ねない。
    if (!routeArrow && !reached && cache.valid) {
      const screen = cache.screen || (cache.screen = new Float32Array(14));
      const dx = cache.arrow[0] - p.x, dz = cache.arrow[1] - p.z;
      const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
      const width = Math.min(.3, Math.hypot(cache.arrow[2] - cache.arrow[12], cache.arrow[3] - cache.arrow[13]) * .4);
      g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
      {
        const tip = length, back = Math.min(.6, tip * .45);
        let visible = true;
        for (let i = 0; i < 3; i++) {
          const across = i === 0 ? -width : i === 2 ? width : 0;
          const along = tip - (i === 1 ? 0 : back);
          const point = cache.goal;
          point.x = p.x + ux * along - uz * across;
          point.z = p.z + uz * along + ux * across;
          point.y = groundAt(rt.world, point.x, point.z, p.y);
          if (Math.abs(point.y - p.y) > .6 || !this.floorGoalVisible(rt, point, false)) { visible = false; break; }
          this.tmpV.set(point.x, point.y + .08, point.z).project(rt.camera);
          if (this.tmpV.z < -1 || this.tmpV.z > 1) { visible = false; break; }
          screen[i * 2] = (this.tmpV.x * .5 + .5) * W;
          screen[i * 2 + 1] = (-this.tmpV.y * .5 + .5) * H;
        }
        if (visible && screen[2] >= 12 && screen[2] <= W - 12 && screen[3] >= 64 && screen[3] <= H - 24) {
          g.beginPath(); g.moveTo(screen[0], screen[1]); g.lineTo(screen[2], screen[3]); g.lineTo(screen[4], screen[5]);
          g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
          g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
          arrowLeft = screen[2] - 24; arrowRight = screen[2] + 24;
          arrowTop = screen[3] - 24; arrowBottom = screen[3] + 24;
          drew = true; routeArrow = true;
        }
      }
      g.restore();
      cache.goal.x = goalPos.x; cache.goal.z = goalPos.z; cache.goal.y = floorY;
      if (routeArrow && reserved) {
        const box = cache.arrowBox || (cache.arrowBox = {});
        box.left = arrowLeft; box.right = arrowRight; box.top = arrowTop; box.bottom = arrowBottom;
        reserved.push(box);
      }
    }
    // 回避の札は既存の一枚を使い、道の先にも同じ形の印を置く。
    if (routeOnly) { g.restore(); return drew; }
    // 到着の判定は変えず、実際の床に置ける時だけ輪を描く。
    if (onScreen && !routeArrow && (retreat || !ally) && !(!retreat && !ally && rt.def.compactHoldGuide)) {
      const placed = this.drawFloorGoal(g, rt, goalPos.x, goalPos.z, false, retreat ? 1.5 : .75);
      drew = placed || drew;
      if (!placed) onScreen = false;
    }
    if (!onScreen && !reached && !routeArrow) {
      this.drawOffscreenDirection(g, rt, pos);
      drew = true;
    }
    if (onScreen && !routeArrow && !retreat && !ally && rt.def.compactHoldGuide) {
      this.drawSmallGoalFlag(g, s.x, s.y);
      drew = true;
    }
    let ax = s.x, ay = s.y - 78;
    if ((!ally || retreat) && this.notices.sources[1].selected && !$('objectives').classList.contains('expand')) {
      const order = $('objectives');
      setClass(order, 'ground-order', true); setClass(order, 'travel-retreat', true);
      setClass(order, 'goal-visible', onScreen && retreat);
      setClass(order, 'destination-sign', true);
      const measureKey = this.objKey + '|' + this.actionLabel?.textContent + '|' + onScreen + '|' + W + '|' + H;
      if (this.travelOrderKey !== measureKey) {
        this.travelOrderKey = measureKey;
        this.travelOrderW = order.offsetWidth; this.travelOrderH = order.offsetHeight;
      }
      if (routeArrow) ax = (arrowLeft + arrowRight) / 2;
      else if (!onScreen && !reached) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
        const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0;
        ax = right ? W - this.travelOrderW / 2 - 64 : this.travelOrderW / 2 + 64;
      }
      const left = Math.round(Math.max(12, Math.min(W - this.travelOrderW - 12, ax - this.travelOrderW / 2)));
      const top = retreat ? Math.round(Math.max(12, Math.min(H - this.travelOrderH - 12,
        (routeArrow ? arrowTop : s.y - 32) - 8 - this.travelOrderH))) : 12;
      setCssVar(order, '--ground-order-x', left + 'px');
      setCssVar(order, '--ground-order-y', top + 'px');
      // 退く札は一つだけの矢印のすぐ上へそろえる。
      drew = true;
      showLabel = false;
    }
    // 任務札と合わせて三枚以内。人の印と「ここへ」は一枚にまとめる。
    const occupied = this.notices.picks.length + Number(!this.root.classList.contains('working') && !!rt.nearestInteract()) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
    if (retreat && routeArrow) { ax = (arrowLeft + arrowRight) / 2; ay = arrowTop - 8; }
    if (showLabel && !rt.touchCoachActive && !this.notices.sources[1].selected && occupied + 1 + Number(!!rt.touchCoachActive) < 3) {
      const off = !onScreen;
      let text = retreat ? retreatGuideText(rt, reached, 'にげる場所') : rt.def.travelGuideLabel?.(rt) || 'ここへ';
      if (off && !retreat) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
        const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        ax = side >= 0 ? W - 144 : 144; ay = H * .55;
        text = retreat ? retreatGuideText(rt, reached, 'みかたへ もどれ') : forward < 0 ? side >= 0 ? '右へ向こう' : '左へ向こう' : side >= 0 ? '右の道へ' : '左の道へ';
      }
      g.font = retreat ? '900 28px sans-serif' : 'bold 20px sans-serif';
      const half = Math.max(retreat && !off ? 108 : 68, Math.ceil(g.measureText(text).width / 2) + 12);
      if (reserved && onScreen) {
        const box = cache.goalBox || (cache.goalBox = {});
        box.left = s.x - 56; box.right = s.x + 56;
        box.top = s.y - 88; box.bottom = s.y + 24;
        reserved.push(box);
      }
      const spot = this.avoidRects(ax, ay, W, H, 'v', reserved, half + (off && !retreat ? 54 : 4), 44, true);
      if (spot) {
        const x = spot[0], y = spot[1];
        g.fillStyle = '#14120f'; g.fillRect(x - half, y - 44, half * 2, 40);
        g.fillStyle = '#fff3ba'; g.font = retreat ? '900 28px sans-serif' : 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, x, y - 24);
        drew = true;
      }
    }
    g.restore(); return drew;
  }

  // 足元の輪は一人・一か所だけ。遠くても線の太さを保ち、兵の姿を塗りつぶさない。
  drawTargetFootRing(g, rt, pos, scale = 1, person = false, prominent = false, guardPost = false) {
    const point = this.targetFootPoint || (this.targetFootPoint = { x:0, y:0, z:0 });
    point.x = pos.x; point.z = pos.z;
    point.y = groundAt(rt.world, pos.x, pos.z, pos.y ?? rt.player.u.pos.y);
    // 姿を確認した敵と守る場所の輪は、手前の兵で足元が隠れても残す。
    if (!guardPost && !person && !this.floorGoalVisible(rt, point)) return;
    this.tmpV.set(point.x, point.y + .08, point.z).project(rt.camera);
    const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
    if (this.tmpV.z < -1 || this.tmpV.z > 1 || x < 24 || x > VIEW.w - 24 || y < 64 || y > VIEW.h - 16) return;
    // 小さい輪を指定した戦では、持ち場も同じ上限と線幅にそろえる。
    // 地面の円の斜め投影で、近い視点の輪だけ膨らむのを防ぐ。
    if (guardPost && rt.def.compactGuardPostRing) prominent = false;
    if (guardPost && !rt.def.compactGuardPostRing) {
      // 地面の輪郭を投影する。遠くでも読める太さを保ち、兵の上から二重線で描く。
      const circle = this.guardGroundCircle || (this.guardGroundCircle = new Float32Array(64));
      if (!this.guardGroundCircleReady) {
        for (let i = 0; i < 32; i++) {
          circle[i * 2] = Math.cos(i * Math.PI / 16);
          circle[i * 2 + 1] = Math.sin(i * Math.PI / 16);
        }
        this.guardGroundCircleReady = true;
      }
      this.tmpV.set(point.x + 1, point.y + .08, point.z).project(rt.camera);
      const px = Math.abs((this.tmpV.x * .5 + .5) * VIEW.w - x);
      this.tmpV.set(point.x, point.y + .08, point.z + 1).project(rt.camera);
      const pz = Math.abs((this.tmpV.x * .5 + .5) * VIEW.w - x);
      const radius = Math.max(1.2, Math.min(4, 38 / Math.max(1, px, pz)));
      g.save(); g.globalAlpha = 1; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i < 32; i++) {
        const gx = point.x + circle[i * 2] * radius, gz = point.z + circle[i * 2 + 1] * radius;
        this.tmpV.set(gx, groundAt(rt.world, gx, gz, point.y) + .08, gz).project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) { g.restore(); return false; }
        const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 13; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.stroke(); g.restore();
      return true;
    }
    if (singleBattleGuide(rt) && !prominent && !guardPost) {
      const marker = rt.missionGuide?.marker;
      if (marker?.guideDefend || /^(guard|wait)$/.test(marker?.guideArea))
        this.drawSmallGoalFlag(g, x, y, .65, false, true);
      else this.drawDestinationSign(g, x, y);
      return true;
    }
    this.tmpV.set(point.x, point.y + 1, point.z).project(rt.camera);
    const subtle = !prominent && !!rt.def.subtleGroundGuides;
    // 小さな到着輪を指定した戦だけ、最小半径と太さも縮める。
    const compact = !prominent && !person && rt.def.compactGroundGoalRing;
    const radius = Math.max(prominent ? 38 : person || compact || !singleBattleGuide(rt) ? 22 : 34, Math.min(42, Math.abs(y - (-this.tmpV.y * .5 + .5) * VIEW.h) * .7)) *
      (person || compact || !singleBattleGuide(rt) ? scale : Math.max(1, scale)) * (subtle ? .7 : 1);
    g.save(); g.globalAlpha = 1; g.beginPath(); g.ellipse(x, y, radius, Math.max(8, radius * .3), 0, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = subtle || compact ? 5 : Math.max(12, 10 * scale); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = subtle ? 2 : compact ? 2.5 : Math.max(7, 5 * scale); g.stroke(); g.restore();
    return true;
  }

  // 地面の旗と輪へ既存の短い任務札を結び、行き先を一組で示す。
  drawGoalFlagFrame(g, bounds, subtleFrame = false, emphasize = false) {
    if (!emphasize && this.rt && singleBattleGuide(this.rt) && !this.goalFlag) {
      this.drawSmallGoalFlag(g, bounds.left + bounds.width / 2, bounds.top - 8, .65);
      return;
    }
    // 実物の布だけを囲む。兵の密度や旗の大きさは変えない。
    // 開始時・待機・退避でも、布の周りだけを太く囲む。
    const compact = emphasize || !!this.rt?.def.compactFlagFrames;
    const subtle = !emphasize && !!this.rt?.def.subtleFlagFrames;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    if (emphasize) {
      // 目当ての旗は小さな四角にせず、遠くても見つかる白い輪で囲む。
      g.ellipse(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2,
        Math.max(24, bounds.width / 2 + 10), Math.max(32, bounds.height / 2 + 10), 0, 0, Math.PI * 2);
    } else if (this.rt?.def.cornerFlagFrames) {
      // 指定された戦だけ、布の四隅に短い印を残す。形や配列は毎コマ作らない。
      const left = bounds.left - 3, top = bounds.top - 3;
      const right = left + bounds.width + 6, bottom = top + bounds.height + 6;
      const corner = Math.min(12, (bounds.width + 6) / 3, (bounds.height + 6) / 3);
      g.moveTo(left, top + corner); g.lineTo(left, top); g.lineTo(left + corner, top);
      g.moveTo(right - corner, top); g.lineTo(right, top); g.lineTo(right, top + corner);
      g.moveTo(right, bottom - corner); g.lineTo(right, bottom); g.lineTo(right - corner, bottom);
      g.moveTo(left + corner, bottom); g.lineTo(left, bottom); g.lineTo(left, bottom - corner);
    } else if (compact) {
      g.rect(bounds.left - 3, bounds.top - 3, bounds.width + 6, bounds.height + 6);
    } else g.ellipse(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2,
      bounds.width / 2 + 6, bounds.height / 2 + 6, 0, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = subtle ? 5 : 11; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = subtle ? 2 : emphasize ? 6 : 5; g.stroke();
    g.restore();
  }

  // 道筋は足元から先端の旗へつながる実線にそろえる。
  drawRoutePath(g, rt, path, continuous = false, emphasize = false) {
    const screen = this.routePathScreen || (this.routePathScreen = new Float32Array(17 * 3));
    const W = VIEW.w, H = VIEW.h;
    const compact = !!rt.def.compactRouteGuide || continuous;
    let drew = false;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    this.routePathSolid ||= [];
    g.setLineDash(this.routePathSolid);
    const tip = this.routePathTip || (this.routePathTip = { x:0, y:0 });
    for (let part = 1; part < path.length; part++) {
      const a = path[part - 1], b = path[part];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        this.tmpV.set(x, groundAt(rt.world, x, z, rt.player.u.pos.y) + .25, z).project(rt.camera);
        screen[i * 3] = (this.tmpV.x * .5 + .5) * W;
        screen[i * 3 + 1] = (-this.tmpV.y * .5 + .5) * H;
        screen[i * 3 + 2] = this.tmpV.z >= -1 && this.tmpV.z <= 1 ? 1 : 0;
      }
      g.beginPath();
      let connected = false;
      for (let i = 1; i <= 16; i++) {
        const j = i * 3, k = j - 3;
        if (!screen[j + 2] || !screen[k + 2]) { connected = false; continue; }
        const x = screen[j], y = screen[j + 1], px = screen[k], py = screen[k + 1];
        if (Math.max(x, px) < 12 || Math.min(x, px) > W - 12 || Math.max(y, py) < 64 || Math.min(y, py) > H - 24) { connected = false; continue; }
        if (continuous) {
          // 画面から外れる所まで同じ線を保ち、その先端に旗を立てる。
          const dx = x - px, dy = y - py;
          let lo = 0, hi = 1;
          if (dx === 0 && (px < 48 || px > W - 48) || dy === 0 && (py < 112 || py > H - 32)) { connected = false; continue; }
          if (dx !== 0) { lo = Math.max(lo, Math.min((48 - px) / dx, (W - 48 - px) / dx)); hi = Math.min(hi, Math.max((48 - px) / dx, (W - 48 - px) / dx)); }
          if (dy !== 0) { lo = Math.max(lo, Math.min((112 - py) / dy, (H - 32 - py) / dy)); hi = Math.min(hi, Math.max((112 - py) / dy, (H - 32 - py) / dy)); }
          if (lo > hi) { connected = false; continue; }
          if (!connected || lo > 0) g.moveTo(px + dx * lo, py + dy * lo);
          tip.x = px + dx * hi; tip.y = py + dy * hi; tip.angle = Math.atan2(dy, dx);
          g.lineTo(tip.x, tip.y); connected = hi === 1;
        } else {
          if (!connected) g.moveTo(px, py);
          g.lineTo(x, y); connected = true;
        }
        drew = true;
      }
      g.strokeStyle = '#14120f'; g.lineWidth = emphasize ? 13 : rt.def.subtleGroundGuides || compact ? 8 : 13; g.stroke();
      g.strokeStyle = emphasize ? '#ffffff' : '#fff3ba'; g.lineWidth = emphasize ? 5 : rt.def.subtleGroundGuides || compact ? 2 : 5; g.stroke();
    }
    g.restore();
    return drew;
  }

  // 次に通る角へ旗を立てる。床の矢印が遠くて小さくなっても位置を見失わない。
  drawCornerArrow(g, rt, pos) {
    const p = rt.player.u.pos, dx = pos.x - p.x, dz = pos.z - p.z;
    const length = Math.hypot(dx, dz);
    const floor = this.cornerFloor || (this.cornerFloor = { x:0, y:0, z:0 });
    floor.x = pos.x; floor.z = pos.z; floor.y = groundAt(rt.world, pos.x, pos.z, p.y);
    if (length < .1 || !this.floorGoalVisible(rt, floor)) return false;
    const screen = this.project(floor, floor.y + .1, rt,
      this.cornerFlagProjection || (this.cornerFlagProjection = {}));
    if (screen.behind || screen.x < 32 || screen.x > VIEW.w - 48 || screen.y < 112 || screen.y > VIEW.h - 24) return false;
    this.drawTargetFootRing(g, rt, floor, .65);
    this.drawMoveGoal(g, rt, screen.x, screen.y);
    return true;
  }

  // 移動先には旗と目的を添える。任務札がある時は、その一枚を旗のそばへ移す。
  drawMoveGoal(g, rt, x, y) {
    this.drawSmallGoalFlag(g, x, y, .65);
    const order = $('objectives');
    if (this.notices.sources[1].selected && !order.classList.contains('expand')) {
      setClass(order, 'linked-destination', true);
      setClass(order, 'ground-order', true);
      const key = this.objKey + '|' + VIEW.w + '|' + VIEW.h + '|' + S.textScale;
      if (this.moveGoalOrderKey !== key) {
        this.moveGoalOrderKey = key;
        this.moveGoalOrderW = order.offsetWidth; this.moveGoalOrderH = order.offsetHeight;
      }
      const width = this.moveGoalOrderW, height = this.moveGoalOrderH;
      const left = x + 40 + width <= VIEW.w - 12 ? x + 40 : x - width - 16;
      setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, left))) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(Math.max(12, Math.min(VIEW.h - height - 12, y - height - 48))) + 'px');
      return;
    }
    const occupied = this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.nearestInteract() || !!rt.touchCoachActive || rt.player.u.wounds?.bleed > .0001 ||
        rt.player.u.hp < rt.player.u.maxHp * .6);
    if (occupied >= 3) return;
    const label = rt.def.travelGuideLabel?.(rt) || '印へ進もう';
    g.save(); g.font = `bold ${16 * Math.max(1, S.textScale || 1)}px sans-serif`;
    const half = g.measureText(label).width / 2 + 8;
    const spot = this.avoidRects(x, y - 64, VIEW.w, VIEW.h, 'v', null, half + 4, 32, true);
    if (spot) {
      g.fillStyle = '#14120f'; g.fillRect(spot[0] - half, spot[1] - 32, half * 2, 32);
      g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, spot[0], spot[1] - 16);
    }
    g.restore();
  }

  // 足形と進む矢印を実際の床へ投影する。札や立体の素材は増やさない。
  drawFloorWaymark(g, rt, pos, footprints = false, direction = null, treatment = false) {
    const p = rt.player.u.pos, dx = pos.x - p.x, dz = pos.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < .1 && !treatment) return false;
    const ux = treatment ? 0 : direction?.dirX ?? dx / length, uz = treatment ? 1 : direction?.dirZ ?? dz / length;
    const point = this.floorWaymarkPoint || (this.floorWaymarkPoint = { x: 0, y: 0, z: 0 });
    point.x = pos.x; point.z = pos.z;
    point.y = pos.y ?? groundAt(rt.world, pos.x, pos.z, p.y);
    if (!this.floorGoalVisible(rt, point, false)) return false;
    const shape = treatment ? FLOOR_CROSS : footprints ? FLOOR_FOOTPRINT : FLOOR_DIRECTION;
    const screen = this.floorWaymarkScreen || (this.floorWaymarkScreen = new Float32Array(32));
    for (let foot = 0; foot < (footprints ? 2 : 1); foot++) {
      for (let i = 0; i < shape.length; i += 2) {
        const across = shape[i] + (footprints ? (foot ? .4 : -.4) : 0);
        const along = shape[i + 1] + (footprints && foot ? .25 : 0);
        const x = pos.x + ux * along + uz * across, z = pos.z + uz * along - ux * across;
        this.tmpV.set(x, groundAt(rt.world, x, z, point.y) + .1, z).project(rt.camera);
        const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (this.tmpV.z < -1 || this.tmpV.z > 1 || sx < 12 || sx > VIEW.w - 12 || sy < 64 || sy > VIEW.h - 24) return false;
        screen[foot * shape.length + i] = sx; screen[foot * shape.length + i + 1] = sy;
      }
    }
    if (!footprints && (treatment || direction || rt.def.floorArrowMaxPixels)) {
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (let i = 0; i < shape.length; i += 2) {
        left = Math.min(left, screen[i]); right = Math.max(right, screen[i]);
        top = Math.min(top, screen[i + 1]); bottom = Math.max(bottom, screen[i + 1]);
      }
      const extent = Math.max(right - left, bottom - top, 1);
      const scale = Math.min(direction ? Math.max(1, 44 / extent) : 1,
        direction?.maxPixels ? direction.maxPixels / extent : Infinity,
        treatment ? 64 / extent : rt.def.floorArrowMaxPixels ? rt.def.floorArrowMaxPixels / extent : Infinity);
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      for (let i = 0; i < shape.length; i += 2) {
        screen[i] = cx + (screen[i] - cx) * scale;
        screen[i + 1] = cy + (screen[i + 1] - cy) * scale;
      }
    }
    g.save(); g.lineJoin = 'round'; g.beginPath();
    for (let foot = 0; foot < (footprints ? 2 : 1); foot++) {
      const offset = foot * shape.length;
      g.moveTo(screen[offset], screen[offset + 1]);
      for (let i = 2; i < shape.length; i += 2) g.lineTo(screen[offset + i], screen[offset + i + 1]);
      g.closePath();
    }
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
    return true;
  }

  // 開いている戸口の中央に印を保ち、通れる手前の床に進む矢印を置く。
  drawDoorFloorGoal(g, rt, point, sign, x, y) {
    const p = rt.player.u.pos, distance = Math.hypot(point.x - p.x, point.z - p.z);
    if (sign.door) {
      // 枠を使う戦でも、床の矢印は同じ通り口へ向ける。
      if (!rt.def.compactDoorGuide && sign.frame && (this.placeFrameShown || this.drawPlaceFrame(g, rt, sign.frame))) {
        const bounds = this.doorwayBounds;
        const ax = bounds.arrowX, ay = bounds.arrowY;
        this.drawNavigationArrow(g, ax, ay, Math.PI / 2, 1.15, true);
        return true;
      }
      // 白い戸の前でも読める墨縁の矢印を、通る開口そのものへ置く。
      this.drawNavigationArrow(g, x, y, Math.PI / 2, 1.15, true);
      const occupied = this.notices.picks.length + Number(!!this.healthRect) + Number(!$('boss').hidden) +
        Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
        Number(!!rt.nearestInteract() || !!rt.touchCoachActive);
      if (!this.notices.sources[1].selected && occupied < 3 && y + 50 <= VIEW.h - 12) {
        g.save(); g.font = `bold ${18 * Math.max(1, S.textScale || 1)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const width = g.measureText('戸口へ進もう').width + 16;
        g.fillStyle = '#14120f'; g.fillRect(x - width / 2, y + 22, width, 28);
        g.fillStyle = '#fff3ba'; g.fillText('戸口へ進もう', x, y + 36); g.restore();
      }
      return false;
    }
    const direction = this.doorFloorDirection || (this.doorFloorDirection = { dirX: 0, dirZ: 0 });
    direction.dirX = sign.dirX ?? (point.x - p.x) / (distance || 1);
    direction.dirZ = sign.dirZ ?? (point.z - p.z) / (distance || 1);
    // 曲がり角そのものに大きな矢印を一つ置く。床の遠近で小さくしない。
    this.tmpV.set(point.x + direction.dirX, point.y + .18, point.z + direction.dirZ).project(rt.camera);
    const tx = (this.tmpV.x * .5 + .5) * VIEW.w, ty = (-this.tmpV.y * .5 + .5) * VIEW.h;
    const angle = this.tmpV.z >= -1 && this.tmpV.z <= 1 && Math.hypot(tx - x, ty - y) > 1 ? Math.atan2(ty - y, tx - x) : -Math.PI / 2;
    this.drawNavigationArrow(g, x, y, angle, 1.15, true);
    return false;
  }

  drawSingleDestination(g, rt, pos, marker) {
    // 持ち場と移動の描画から呼ばれても、今の行き先は一度だけ描く。
    if (singleBattleGuide(rt) && this.destinationDrawn) return true;
    this.destinationDrawn = true;
    // 待つ持ち場は到着後も同じ地面に輪と旗を残す。札は任務の一枚だけ。
    if (marker?.guideWaitRing && this.drawTargetFootRing(g, rt, pos, .85)) {
      const goal = this.project(pos, groundAt(rt.world, pos.x, pos.z, pos.y ?? rt.player.u.pos.y) + .08, rt,
        this.waitRingProjection || (this.waitRingProjection = {}));
      this.drawSmallGoalFlag(g, goal.x, goal.y - 8, .7);
      setClass($('objectives'), 'ground-order', false);
      return true;
    }
    // なぞる手本が出ている間、目的地は文字のない形だけにする。
    if (rt.touchSwipeActive) {
      if (!this.drawTargetFootRing(g, rt, pos, .65)) this.drawOffscreenDirection(g, rt, pos);
      return true;
    }
    // 志賀など、到着後に印を畳む指定のある戦だけ。退く途中の矢印は残す。
    if (rt.def.hideArrivedDestination && marker?.hideOnArrival && marker.hideNear &&
        Math.hypot(pos.x - rt.player.u.pos.x, pos.z - rt.player.u.pos.z) < marker.hideNear) {
      this.drawFloorGoal(g, rt, pos.x, pos.z, false, .6);
      return true;
    }
    // 通り口の案内を移動用の印より先に使い、矢印を二重にしない。
    const passage = rt.def.placeFrame?.(rt);
    if (this.placeFrameShown && passage) {
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    if (passage && rt.def.singlePassageArrow) {
      const goal = this.passageGoal || (this.passageGoal = { x: 0, y: 0, z: 0 });
      goal.x = (passage[2].x + passage[3].x) / 2;
      goal.y = (passage[2].y + passage[3].y) / 2;
      goal.z = (passage[2].z + passage[3].z) / 2;
      pos = goal;
    }
    const path = rt.def.guidePath?.(rt, marker);
    // 浅瀬など二点を結ぶ道は、次に通る地面の旗一つで示す。
    // 道筋・大小の矢印・「ここへ」の札を同時に重ねない。
    if (singleBattleGuide(rt) && marker?.guideArea === 'move' && path?.length === 2 && !rt.def.routeWaymarks) {
      const p = rt.player.u.pos, start = path[0], end = path[1];
      const entered = (p.x - start.x) * (end.x - start.x) + (p.z - start.z) * (end.z - start.z) >= 0;
      const goal = entered ? end : start;
      // 長さの上限を指定した細道だけ、長い線を引かず床の短い矢印へ渡す。
      // 床への投影と画面内の大きさは既存の処理でそろえる。
      if (rt.def.groundRouteGuide && rt.def.cornerArrowMaxPixels) {
        const direction = this.moveRouteDirection || (this.moveRouteDirection = { dirX:0, dirZ:0, maxPixels:0 });
        const length = Math.hypot(goal.x - p.x, goal.z - p.z) || 1;
        direction.dirX = (goal.x - p.x) / length;
        direction.dirZ = (goal.z - p.z) / length;
        direction.maxPixels = rt.def.cornerArrowMaxPixels;
        if (!this.drawFloorWaymark(g, rt, goal, false, direction)) this.drawOffscreenDirection(g, rt, goal);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
      // 稲葉山の細道は、空に浮く旗でなく足元から道筋をつなぐ。
      // 指定のない戦では、従来の旗一つの案内を保つ。
      if (rt.def.groundRouteGuide) {
        if (this.drawRoutePath(g, rt, path, true)) {
          const tip = this.routePathTip;
          this.drawNavigationArrow(g, tip.x, tip.y, tip.angle, .65);
        } else this.drawOffscreenDirection(g, rt, goal);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
      const point = this.moveFlagPoint || (this.moveFlagPoint = { x:0, y:0, z:0 });
      point.x = goal.x; point.z = goal.z;
      point.y = groundAt(rt.world, goal.x, goal.z, p.y);
      // 指定した戦の浅瀬だけ、見切れた旗にも向きを添える。既存の札避けを共用する。
      if (rt.def.movePathDirection) {
        setClass(this.root, 'travel-guide', true);
        return this.drawDestinationPointer(g, rt, point, true, .65);
      }
      const s = this.project(point, point.y + .1, rt,
        this.moveFlagProjection || (this.moveFlagProjection = {}));
      const visible = !s.behind && s.x > 32 && s.x < VIEW.w - 32 && s.y > 80 && s.y < VIEW.h - 24 &&
        this.floorGoalVisible(rt, point);
      if (visible) this.drawSmallGoalFlag(g, s.x, s.y, .65);
      else {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const side = -(goal.x - p.x) * Math.cos(yaw) + (goal.z - p.z) * Math.sin(yaw);
        this.drawSmallGoalFlag(g, side >= 0 ? VIEW.w - 48 : 48, VIEW.h / 2, .65);
      }
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    // 道の入口を先に示し、通った後は出口へ渡す。到着の判定には触れない。
    if (singleBattleGuide(rt) && marker?.guideArea === 'move' && path?.length > 1) {
      const p = rt.player.u.pos, start = path[0], end = path[path.length - 1];
      const dx = end.x - start.x, dz = end.z - start.z;
      const entered = (p.x - start.x) * dx + (p.z - start.z) * dz >= 0;
      // 浅瀬の二点の道は足元からつなぐ。入口を通った後は後戻りの線を残さない。
      let route = path;
      if (path.length === 2) {
        route = this.moveRoute || (this.moveRoute = []);
        route.length = 0; route.push(p);
        if (!entered) route.push(start);
        route.push(end);
      }
      // 岸を横切る白線は足さず、本人から渡り先への道筋一つにまとめる。
      const routeDrawn = this.drawRoutePath(g, rt, route, true);
      const arrow = this.moveRouteArrow || (this.moveRouteArrow = { x:0, y:0, z:0 });
      const direction = this.moveRouteDirection || (this.moveRouteDirection = { dirX:0, dirZ:0, maxPixels:36 });
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 2) continue;
        direction.dirX = (b.x - a.x) / length; direction.dirZ = (b.z - a.z) / length;
        const count = rt.def.routeWaymarks ? Math.min(6, Math.max(2, Math.ceil(length / 4))) : 2;
        for (let step = 1; step <= count; step++) {
          arrow.x = a.x + (b.x - a.x) * step / (count + 1);
          arrow.z = a.z + (b.z - a.z) * step / (count + 1);
          arrow.y = groundAt(rt.world, arrow.x, arrow.z, p.y);
          this.drawFloorWaymark(g, rt, arrow, false, direction);
        }
      }
      setClass(this.root, 'travel-guide', true);
      let x, y;
      if (routeDrawn) {
        x = this.routePathTip.x; y = this.routePathTip.y;
      } else {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const goal = entered ? end : start;
        const gx = goal.x - p.x, gz = goal.z - p.z;
        const side = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
        const forward = gx * Math.sin(yaw) + gz * Math.cos(yaw);
        x = side >= 0 ? VIEW.w - 48 : 48; y = VIEW.h / 2;
      }
      // 描いた道の先端を動かさない。印だけを中央へ寄せると案内線が途切れる。
      if (!routeDrawn) {
        x = Math.max(72, Math.min(VIEW.w - 72, x));
        y = Math.max(144, Math.min(VIEW.h - 112, y));
      }
      const goal = entered ? end : start;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const gx = goal.x - p.x, gz = goal.z - p.z;
      const angle = routeDrawn ? this.routePathTip.angle : Math.atan2(-(gx * Math.sin(yaw) + gz * Math.cos(yaw)), -gx * Math.cos(yaw) + gz * Math.sin(yaw));
      this.drawNavigationArrow(g, x, y, angle, 1);
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand')) {
        setClass(order, 'linked-destination', true);
        setClass(order, 'ground-order', true);
        const sizeKey = order.textContent + ':' + VIEW.w + ':' + VIEW.h;
        if (this.singleOrderKey !== sizeKey) {
          this.singleOrderKey = sizeKey;
          this.singleOrderW = order.offsetWidth; this.singleOrderH = order.offsetHeight;
        }
        const width = this.singleOrderW, height = this.singleOrderH;
        const lx = x + 44 + width <= VIEW.w - 12 ? x + 44 : x - width - 16;
        const left = Math.round(Math.max(12, Math.min(VIEW.w - width - 12, lx)));
        const top = Math.round(Math.max(24, Math.min(VIEW.h - height - 112, y - 32 - height)));
        setCssVar(order, '--ground-order-x', left + 'px');
        setCssVar(order, '--ground-order-y', top + 'px');
        this.drawGuideLink(g, x, y - 24, left, top, left + width, top + height, true);
      }
      // 命・任務と合わせ三枚まで。矢印の先に短い行き先だけを添える。
      const occupied = this.notices.picks.length + Number(!!this.healthRect) + Number(!$('boss').hidden) +
        Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
        Number(!!rt.nearestInteract() || !!rt.touchCoachActive);
      if (!rt.touchCoachActive && !this.notices.sources[1].selected && occupied < 3) {
        const scale = Math.max(1, S.textScale || 1), height = 30 * scale;
        g.save(); g.font = `bold ${20 * scale}px sans-serif`;
        const label = rt.def.routeWaymarkLabel || 'ここへ';
        const half = g.measureText(label).width / 2 + 10;
        const spot = this.avoidRects(x, y - 62, VIEW.w, VIEW.h, 'v', null, half + 4, height + 4, true);
        if (spot) {
          const left = spot[0] - half, top = spot[1] - height;
          this.drawGuideLink(g, x, y, left, top, left + half * 2, top + height, true);
          g.fillStyle = '#14120f'; g.fillRect(left, top, half * 2, height);
          g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(label, spot[0], top + height / 2);
        }
        g.restore();
      }
      return true;
    }
    if (singleBattleGuide(rt) && marker?.guideArea === 'move') {
      setClass(this.root, 'travel-guide', true);
      if (this.drawCornerArrow(g, rt, pos)) return true;
      // 角が見えない時は左右の端で向きを示し、自分の体の上へ戻さない。
      const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      this.drawNavigationArrow(g, side >= 0 ? VIEW.w - 48 : 48, VIEW.h / 2, Math.atan2(-forward, side), .65);
      return true;
    }
    // 帰る旗がある時は、道の途中に別方向の矢印を足さない。
    const defendRoute = marker?.guideDefend && !marker.guideFlag && path?.length > 1 && this.drawRoutePath(g, rt, path, true);
    if (!marker?.guideDefend && path?.length > 1) {
      const end = path[path.length - 1];
      // 道筋を描けても到着の印を省かない。浅瀬などの場所を地面で示す。
      const routeDrawn = this.drawRoutePath(g, rt, path);
      const goalDrawn = this.drawFloorGoal(g, rt, end.x, end.z, false, rt.def.routeGoalRadius ?? 1.4);
      if (goalDrawn) {
        const goal = this.project(end, groundAt(rt.world, end.x, end.z, rt.player.u.pos.y) + .18, rt);
        this.drawSmallGoalFlag(g, goal.x, goal.y, .65);
      }
      // 指定の戦では、見えている道筋と足元の矢印を二重に出さない。
      if (!rt.def.singleRouteGuide || !routeDrawn) this.drawApproachRoute(g, rt, pos, marker?.guideRadius || 3);
      if (routeDrawn || goalDrawn) {
        if (!goalDrawn) this.drawDestinationPointer(g, rt, end, true);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
    }
    // 寺内は次の戸口・角への矢印一つ。見える戸口に重ね、壁越しなら通れる道へ向ける。
    const doorway = rt.def.routeDestinationSight && marker?.id === 'next' && !marker.waitGuide && marker.guideArea !== 'wait';
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const waiting = marker?.guideArea === 'wait' || marker?.guideArea === 'guard' || marker?.waitGuide;
    const nextMove = singleBattleGuide(rt) && marker?.guideArea === 'move' && !waiting;
    const signScale = rt.def.groundFlagGuides ? .65 : waiting || nextMove ? 1 : rt.def.compactDestinationSign || rt.def.compactTravelArrow ? .65 : 1;
    const point = this.singleGoalPoint || (this.singleGoalPoint = { x: 0, y: 0, z: 0 });
    const nextPoint = doorway && marker?.entrance ? rt.missionGuide?.pos || pos : pos;
    const sign = doorway ? rt.def.routeSignPoint?.(rt, nextPoint) || nextPoint : pos;
    point.x = sign.x; point.z = sign.z;
    point.y = sign.y ?? groundAt(rt.world, point.x, point.z, pos.y ?? p.y);
    // 旗を持つ人が動く時は根元を追う。待つ持ち場の中心は動かさない。
    const isFlag = !doorway && marker === rt.missionGuide?.marker && groundFlag(rt.missionGuide);
    let flagBounds = isFlag || marker?.guideFlag ? this.goalFlagBounds(rt, marker, pos) : null;
    // 布の一部が画面端へ切れていても、見えている目標を端の札へ追い出さない。
    if (flagBounds && (flagBounds.left + flagBounds.width < 24 || flagBounds.top + flagBounds.height < 64 ||
        flagBounds.left > W - 24 || flagBounds.top > H - 32)) flagBounds = null;
    if (isFlag && !waiting) {
      this.goalFlagBounds(rt, marker, pos);
      const foot = this.goalFlagFoot || pos;
      point.x = foot.x; point.z = foot.z;
      point.y = groundAt(rt.world, foot.x, foot.z, foot.y ?? p.y);
    }
    let s = this.project(point, point.y + .18, rt,
      this.singleGoalProjection || (this.singleGoalProjection = {}));
    if (doorway && sign.door && sign.frame) {
      // 床が画面下へ切れても、見えている入口を端の横矢印へ替えない。
      const frame = sign.frame;
      const head = this.doorwayHead || (this.doorwayHead = { x: 0, y: 0, z: 0 });
      head.x = (frame[1].x + frame[2].x) / 2;
      head.y = (frame[0].y + frame[1].y + frame[2].y + frame[3].y) / 4 + .3;
      head.z = (frame[1].z + frame[2].z) / 2;
      s = this.project(head, head.y, rt, s);
    }
    const sightPointPos = this.doorwayProbe || (this.doorwayProbe = { x: 0, y: 0, z: 0 });
    const doorDistance = Math.max(.001, Math.hypot(p.x - point.x, p.z - point.z));
    const doorInset = doorway && sign.door ? Math.min(.35, doorDistance * .5) / doorDistance : 0;
    sightPointPos.x = point.x + (p.x - point.x) * doorInset;
    sightPointPos.z = point.z + (p.z - point.z) * doorInset;
    sightPointPos.y = point.y;
    // 開口の見通しはカメラ側の面で調べる。本人側へ寄せると、
    // 三人称の視点からは壁の裏と判定され、見えている戸口の印まで消える。
    const cameraProbe = this.doorwayCameraProbe || (this.doorwayCameraProbe = { x: 0, y: 0, z: 0 });
    const cameraDistance = Math.max(.001, Math.hypot(rt.camera.position.x - point.x, rt.camera.position.z - point.z));
    const cameraInset = doorway && sign.door ? Math.min(.35, cameraDistance * .5) / cameraDistance : 0;
    cameraProbe.x = point.x + (rt.camera.position.x - point.x) * cameraInset;
    cameraProbe.z = point.z + (rt.camera.position.z - point.z) * cameraInset;
    cameraProbe.y = point.y;
    const sight = this.doorwaySight || (this.doorwaySight = { at: -1 });
    if (doorway && (sight.rt !== rt || sight.at <= rt.t || sight.at > rt.t + .5 ||
        sight.x !== point.x || sight.z !== point.z || Math.hypot(p.x - sight.px, p.z - sight.pz) > 1)) {
      sight.rt = rt; sight.at = rt.t + .5; sight.x = point.x; sight.z = point.z; sight.px = p.x; sight.pz = p.z;
      sight.clear = localClear(rt.army, p, sightPointPos);
    }
    this.placeFrameShown = false;
    const framedDoor = doorway && sign.door && sign.frame && !rt.def.compactDoorGuide && sight.clear &&
      sightPoint(rt, cameraProbe, 170, true, 1.2) && this.drawPlaceFrame(g, rt, sign.frame);
    let visible = framedDoor || !s.behind && s.x >= 48 && s.x <= W - 48 && s.y >= (doorway ? 64 : 100) && s.y <= H - 32 &&
      (doorway ? sight.clear && sightPoint(rt, cameraProbe, 170, true, 1.2) : this.floorGoalVisible(rt, point));
    if (flagBounds) {
      const fx = Math.max(48, Math.min(W - 48, flagBounds.left + flagBounds.width / 2));
      const fy = Math.max(112, Math.min(H - 32, flagBounds.top));
      visible = fx >= 32 && fx <= W - 32 && fy >= 56 && fy <= H - 32;
      if (visible) { s.x = fx; s.y = fy; }
    }
    // 目当ての実物が隠れた時は、近くの地面を別の旗に見立てない。
    if (isFlag && !waiting && !rt.def.footFlagGuides && (marker.guideFlagFrame || marker.guideFlagMesh) && !flagBounds) visible = false;
    // 指定済みの目的地は足元の投影を保つ。霧や斜面の視認判定で端へ移さない。
    const distance = Math.hypot(pos.x - p.x, pos.z - p.z);
    const atWait = waiting && (marker.guideArea === 'guard' ? guardPostDistance(rt, rt.missionGuide) : distance) < (marker.guideRadius || 8);
    // 到着前から旗の根元を大きな輪で示す。札を増やさず、行く地面を明確にする。
    if (waiting && !atWait && (isFlag || marker.guideFlag))
      this.drawTargetFootRing(g, rt, pos, 1.25, false, true);
    // 到着したら移動の旗を畳む。足元の丸に旗を重ねて、まだ進むように見せない。
    if (atWait && marker.guideArea !== 'guard' && !this.defendEnemy?.alive && !rt.def.waitFacingPoint?.(rt)) {
      if (!this.drawWaitFrame(g, rt, pos, marker.guideRadius || 8))
        this.drawTargetFootRing(g, rt, p, .65);
      setClass($('objectives'), 'ground-order', false);
      return true;
    }
    // 携帯の移動中は行き先・距離・方向を端の一枚へ。中央の兵を覆わない。
    if (isTouch && H <= 500 && isFlag && !atWait && singleBattleGuide(rt)) {
      // 端の札を描いて終える前に、実物の旗へ輪と下矢印を付ける。
      if (flagBounds) {
        this.drawGoalFlagFrame(g, flagBounds, false, true);
        this.drawTargetPointer(g, flagBounds.left + flagBounds.width / 2, flagBounds.top - 12, '#fff', true);
      }
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const dx = point.x - p.x, dz = point.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const label = rt.def.travelGuideLabel?.(rt) || 'このはたへ';
      const detail = destinationDistance(rt, distance, true) || 'すぐそこ';
      const scale = Math.max(1, S.textScale || 1);
      g.save(); g.font = `bold ${16 * scale}px sans-serif`;
      const width = Math.min(W - 24, Math.max(g.measureText(label).width, g.measureText(detail).width) + 72);
      const height = Math.ceil(56 * scale);
      const left = side >= 0 ? W - width - 12 : 12;
      let top = 12;
      // 命や操作札を避けて端を下へ探す。畳む任務札は避ける対象から外す。
      setClass(this.root, 'edge-destination', true);
      setClass(this.root, 'travel-guide', true);
      for (const rect of this.hudRects()) {
        if (rect === this.guideOrderRect || rect.width <= 0) continue;
        if (left < rect.right + 8 && left + width > rect.left - 8 && top < rect.bottom + 8 && top + height > rect.top - 8)
          top = Math.min(H - height - 12, rect.bottom + 8);
      }
      g.fillStyle = '#14120f'; g.fillRect(left, top, width, height);
      const angle = Math.atan2(-forward, side);
      this.drawNavigationArrow(g, left + 28 + Math.cos(angle) * 14,
        top + height / 2 + Math.sin(angle) * 14, angle, .55, true);
      g.fillStyle = '#fff3ba'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(label, left + 56, top + height * .3, width - 64);
      g.fillText(detail, left + 56, top + height * .72, width - 64);
      g.restore();
      return true;
    }
    if (marker.guideArea === 'guard' && atWait && this.waitGuardButton && !this.waitGuardButton.hidden) return true;
    if (marker.guideArea === 'guard' && !atWait) {
      // 帰る旗とそこへ続く道だけを残し、下向きの大矢印を重ねない。
      return this.drawRetreatDestination(g, rt, pos, visible, s.x, s.y, false);
    }
    // 待つ輪を描いて処理を終える前に、足元から向く先を示す。
    const waitFacing = atWait && !this.defendEnemy?.alive && rt.def.waitFacingPoint?.(rt);
    if (waitFacing) {
      setClass($('objectives'), 'ground-order', false);
      this.drawFootDirection(g, rt, waitFacing);
      return true;
    }
    // 到着前は旗だけを示し、地面の輪を別の行き先に見せない。
    const waitFrame = marker.guideArea === 'wait' && atWait && !this.defendEnemy?.alive &&
      this.drawWaitFrame(g, rt, point, marker.guideRadius || 8);
    if (waitFrame && (atWait || !flagBounds) && (atWait || !s.behind && s.x >= 24 && s.x <= W - 24 && s.y >= 64 && s.y <= H - 24)) {
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand') && !order.classList.contains('facing-order')) {
        setClass(order, 'linked-destination', true); setClass(order, 'ground-order', true);
        const width = order.offsetWidth, height = order.offsetHeight;
        const anchor = atWait ? this.project(p, p.y + .08, rt,
          this.waitPlayerProjection || (this.waitPlayerProjection = {})) : s;
        setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(W - width - 12, anchor.x + 48))) + 'px');
        setCssVar(order, '--ground-order-y', Math.round(Math.max(64, Math.min(H - height - 24, anchor.y - height - 48))) + 'px');
      }
      return true;
    }
    // 接敵後は持ち場の大旗を畳み、相手の足元の印へ渡す。
    if (atWait && this.defendEnemy?.alive) return true;
    // 固定する指定のない持ち場だけ、同じ輪の中で見える場所へ旗と札を寄せる。
    // 到着の判定は元の中心・半径のまま。
    if (atWait && !visible && !rt.def.compactHoldGuide) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0), radius = marker.guideRadius || 8;
      for (let i = 0; i < 3; i++) {
        const offset = radius * (.85 - i * .25);
        point.x = pos.x + Math.sin(yaw) * offset;
        point.z = pos.z + Math.cos(yaw) * offset;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
        const flag = this.project(point, point.y + .18, rt);
        if (flag.behind || flag.x < 48 || flag.x > W - 80 || flag.y < 100 || flag.y > H - 32 ||
            !this.destinationPointerClear(flag.x, flag.y - 28, this.hudRects()) || !this.floorGoalVisible(rt, point)) continue;
        s = flag; visible = true; break;
      }
      if (!visible) {
        point.x = pos.x; point.z = pos.z;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
      }
    }
    // 到着後に持ち場が背中へ隠れても、戻る矢印は出さない。
    if (atWait && marker.guideArea !== 'guard') this.drawDestinationArea(g, rt, pos, marker.guideRadius || 8, false);
    // 行き先は目的地の印か端の矢印にまとめ、足元の矢印と競わせない。
    let x = s.x, y = s.y;
    // 到着した輪が画面の下へ切れても、移動の矢印へ戻さない。
    if (!visible && atWait) {
      x = Math.max(80, Math.min(W - 80, x));
      y = Math.max(154, Math.min(H - 40, y));
    }
    setClass(this.root, 'travel-guide', true);
    // 指定した戦では旗と守備先も札を避ける。到着済みの持ち場は移動の案内へ戻さない。
    if ((rt.def.avoidAllDestinationNotices && !atWait ||
        !waiting && !groundFlag(rt.missionGuide) && rt.def.avoidDestinationNotices) &&
        (!visible || this.hudRects().some(r => x + 36 > r.left && x - 36 < r.right &&
          y + 8 > r.top && y - 64 < r.bottom))) {
      return this.drawDestinationPointer(g, rt, pos);
    }
    if (waiting && !atWait && !defendRoute && marker.guideArea !== 'guard' && !isFlag) {
      // 到着先の足形が遠くても、目の前の通れる床に一本だけ矢印を残す。
      const ahead = this.waitFloorAhead || (this.waitFloorAhead = { x: 0, y: 0, z: 0 });
      for (let step = Math.min(4, distance - 1.5); step >= 1.5; step -= 1) {
        ahead.x = p.x + (pos.x - p.x) * step / distance;
        ahead.z = p.z + (pos.z - p.z) * step / distance;
        ahead.y = groundAt(rt.world, ahead.x, ahead.z, p.y);
        if (localClear(rt.army, p, ahead) && this.drawFloorWaymark(g, rt, ahead)) break;
      }
    } else if (visible && !waiting && !nextMove && !rt.def.singleDestinationArrow && !doorway && !isFlag) this.drawApproachRoute(g, rt, pos, marker?.guideRadius || 3);
    g.save(); g.lineJoin = 'round';
    if (!visible && !atWait) {
      const way = this.singleGoalWay || (this.singleGoalWay = { x: 0, z: 0, at: -1 });
      if (way.rt !== rt || way.at <= rt.t || way.at > rt.t + .5 || way.gx !== point.x || way.gz !== point.z) {
        const next = doorway || groundFlag(rt.missionGuide) ? point : rt.world.def.guideWay?.(rt.player.u, point) || point;
        way.rt = rt; way.x = next.x; way.z = next.z;
        way.gx = point.x; way.gz = point.z; way.at = rt.t + .5;
      }
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const dx = way.x - p.x, dz = way.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      {
        const top = Math.min(144, H / 3), bottom = H - 80;
        const scale = Math.min(Math.max(12, W / 2 - 80) / Math.max(.001, Math.abs(side)),
          Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
        x = side >= 0 ? W - 64 : 64;
        y = doorway || isFlag ? (top + bottom) / 2 : (top + bottom) / 2 - forward * scale;
        // 見えない戸口には壁の上から下矢印を貼らず、画面の端で振り向く側を示す。
        if ((isFlag || waiting) && forward < 0) x = side >= 0 ? W - 64 : 64;
        // 道が見える時は、その先端に旗と矢印をまとめる。
        if (defendRoute) { x = this.routePathTip.x; y = this.routePathTip.y; }
        // 旗と矢印を一組にし、既存の札に重なる時は端に沿って空きを探す。
        if (doorway) {
          x = side >= 0 ? W - 80 : 80;
          const rects = this.hudRects();
          const middle = y;
          for (let i = 0; i < 17; i++) {
            const candidate = middle + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 12;
            if (candidate < 88 || candidate > H - 48) continue;
            if (rects.some(r => r !== this.guideOrderRect && x + 40 > r.left && x - 40 < r.right &&
                candidate + 40 > r.top && candidate - 80 < r.bottom)) continue;
            y = candidate; break;
          }
          // 戸口が隠れた時だけ向きを示す。別の行き先に見える旗は付けない。
          this.drawNavigationArrow(g, x, y, side >= 0 ? 0 : Math.PI, .85, true);
        } else if (isFlag || !defendRoute && !marker?.treatment) {
          if (isFlag && !atWait) {
            const caption = rt.def.edgeDestinationCaption?.(rt, marker, distance) || `はたまで ${Math.ceil(distance)}メートル`;
            g.font = 'bold 16px sans-serif';
            const half = g.measureText(caption).width / 2 + 12;
            x = side >= 0 ? W - half - 12 : half + 12;
            setClass(this.root, 'edge-destination', true);
            this.drawEdgeDestination(g, x, y, side >= 0 ? 0 : Math.PI, !!marker.guideDefend, caption);
          } else {
            // 実物の旗でない道の角や木戸は、戦で決めた行き先の名を示す。
            const caption = rt.def.edgeDestinationLabel?.(rt);
            if (caption) {
              g.font = 'bold 16px sans-serif';
              const half = Math.max(36, g.measureText(caption).width / 2 + 12);
              x = side >= 0 ? W - half - 12 : half + 12;
            }
            this.drawEdgeDestination(g, x, y, side >= 0 ? 0 : Math.PI, !!marker.guideDefend, caption || '旗へ');
          }
        } else if (!marker?.treatment) this.drawNavigationArrow(g, x, y, defendRoute ? this.routePathTip.angle : Math.atan2(-forward, side), signScale);
        if (isFlag) this.flagEdgeSide = side >= 0 ? '右へ' : '左へ';
        if (marker?.treatment) this.drawTreatmentCross(g, x, y);
        else if (defendRoute && !doorway && !isFlag && !(rt.def.routeGuideArrowOnly && !waiting)) this.drawSmallGoalFlag(g, x - 12, y - 28, .65, false, !!marker.guideDefend);
      }
    }
    // 実物の旗には同じ旗形を付け、近い人の足元へ印を移さない。
    if (visible) {
      if (doorway) {
        // 戸口は開口に、曲がり角は床に示す。空いた頭上へ旗を移さない。
        if (this.drawDoorFloorGoal(g, rt, point, sign, x, y)) {
          const bounds = this.doorwayBounds;
          x = bounds.arrowX;
          y = bounds.arrowY;
        }
      } else if (marker?.treatment) {
        this.drawFloorWaymark(g, rt, point, false, null, true);
        this.drawTreatmentCross(g, x, y);
      } else if (isFlag || waiting) {
        // 移動中は本人の丸から行き先まで一本で結ぶ。
        const foot = this.project(p, p.y + .08, rt,
          this.destinationPlayerProjection || (this.destinationPlayerProjection = {}));
        if (atWait && marker.guideArea !== 'guard') this.drawFloorWaymark(g, rt, point, false);
        const smallGuard = marker.guideArea === 'guard' && rt.def.compactGuardDestination;
        // 白い自分の輪とは、太い墨縁と旗形で見分ける。
        // 布の囲みか持ち上げた旗を一つだけ出し、足元に別の旗を重ねない。
        if (rt.def.footFlagGuides) {
          this.drawSmallGoalFlag(g, x, y, .65, false, waiting);
        } else if (flagBounds && !smallGuard) {
          // 目当ての布だけ太く囲む。案内は札からの一本へまとめる。
          this.drawGoalFlagFrame(g, flagBounds, false, isFlag || !!marker.guideFlagFrame || !!marker.guideFlagMesh);
          // 端の札と同じ切り込みのある旗形を、目標の布のすぐそばにも置く。
          this.drawSmallGoalFlag(g, x, y, .8, false, !!marker.guideDefend);
        } else if (marker.guideArea === 'guard') {
          // 守る場所は旗で示す。操作は持ち場の長押し釦へまとめる。
          this.drawSmallGoalFlag(g, x, y, smallGuard ? .5 : .65, false, true);
        } else {
          const flag = this.drawRaisedGoalFlag(g, rt, x, y, !!marker.guideDefend);
          x = flag.x; y = flag.y;
        }
        if (!foot.behind && !atWait && (!rt.def.singleRouteGuide || !defendRoute))
          this.drawFlagLink(g, foot.x, foot.y, x, y);
      } else if (marker?.guideArea === 'move' && !nextMove) this.drawTargetFootRing(g, rt, point);
      // 矢印が本人の体（頭から足）に重なる時は出さない（頭を指す矢印に見える）。
      else {
        const head = this.project(p, p.y + 2.1, rt), foot = this.project(p, p.y, rt);
        const onBody = Math.hypot(point.x - p.x, point.z - p.z) < 4 && !head.behind && Math.abs(x - head.x) < 44 && y > head.y - 50 && y < foot.y + 10;
        if (!onBody) this.drawNavigationArrow(g, x, y,
          rt.def.directionalDestinationArrow ? this.destinationDirection(rt, point) : Math.PI / 2, signScale);
      }
    }
    const order = $('objectives');
    const localOrder = (doorway || isFlag || waiting || !singleBattleGuide(rt)) && this.notices.sources[1].selected && !order.classList.contains('expand');
    if (localOrder && !(isFlag && !visible && !atWait)) {
      // 向きは既存の任務札へ添える。新しい知らせの枠は増やさない。
      if (isFlag && !atWait) {
        const now = order.querySelector('li.cur .obj-now');
        if (now) {
          const direction = this.flagDirectionEl || (this.flagDirectionEl = document.createElement('small'));
          if (direction.parentNode !== now) now.appendChild(direction);
          direction.style.cssText = 'display:block!important;font-size:max(22px,calc(22px * var(--text-scale,1)))!important;line-height:1.4;white-space:nowrap';
          const remaining = rt.def.distanceUnit === 'steps' ? `あと${Math.max(1, Math.ceil(distance / .75))}歩` : `あと${Math.ceil(distance)}メートル`;
          const detail = rt.def.flagDirectionOnly ? (visible ? '' : this.flagEdgeSide) :
            `${visible ? '' : this.flagEdgeSide + '・'}${remaining}`;
          setText(direction, detail);
          direction.hidden = false;
        }
      }
      setClass(order, 'linked-destination', true);
      setClass(order, 'ground-order', true);
      const sizeKey = order.textContent + ':' + W + ':' + H + ':' + (isFlag && !visible && !atWait);
      if (this.singleOrderKey !== sizeKey) {
        this.singleOrderKey = sizeKey;
        this.singleOrderW = order.offsetWidth; this.singleOrderH = order.offsetHeight;
      }
      const width = this.singleOrderW, height = this.singleOrderH;
      // 旗と札の間に余白を取り、一本の矢印で根元へ結ぶ。
      const besideFlag = doorway || isFlag || waiting;
      const doorBounds = doorway && visible && sign.door && this.placeFrameShown ? this.doorwayBounds : null;
      const flagLeft = doorBounds ? doorBounds.left : flagBounds ? Math.min(x - 28, flagBounds.left) : x - 28;
      const flagRight = doorBounds ? doorBounds.right : flagBounds ? Math.max(x + 40, flagBounds.left + flagBounds.width) : x + 40;
      const preferredX = doorway ? (x + 44 + width <= W - 12 ? x + 44 : x - width - 44) : besideFlag ? (flagRight + 16 + width <= W - 12 ? flagRight + 16 : flagLeft - width - 16) : x - width / 2;
      // 旗と指図を一か所で読めるよう、見えている旗の横へまとめる。
      const lx = besideFlag && visible ? Math.max(12, Math.min(W - width - 12, preferredX)) : x >= W / 2 ? W - width - 12 : 12;
      const overlapsFlag = besideFlag && lx < flagRight + 8 && lx + width > flagLeft - 8;
      const preferredY = doorway ? y - 30 - height / 2 : overlapsFlag ? Math.min(y - 72, flagBounds?.top ?? y - 72) - height - 16 : besideFlag ? (flagBounds?.top ?? y - 60) - height / 2 : y - 56 * signScale - height - 8;
      const ly = Math.max(12, Math.min(H - height - 12, besideFlag && visible ? preferredY : 16));
      setCssVar(order, '--ground-order-x', Math.round(lx) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(ly) + 'px');
      // 戸口の矢印と横の札を結び、隣の襖への札と取り違えないようにする。
      if (!rt.def.footFlagGuides && !doorBounds && (!isFlag || visible && flagBounds)) this.drawGuideLink(g, flagBounds && visible ? flagBounds.left + flagBounds.width / 2 : x, flagBounds && visible ? flagBounds.top + flagBounds.height / 2 : y - 18,
        lx, ly, lx + width, ly + height, true);
    }
    const occupied = this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.nearestInteract() || !!rt.touchCoachActive || rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6);
    if (!singleBattleGuide(rt) && !localOrder && occupied < 3) {
      const label = atWait ? 'ここで待とう' : rt.def.travelGuideLabel?.(rt) || (marker?.guideArea === 'wait' ? '旗の輪に入ろう' : marker?.guideArea === 'retreat' ? '旗へもどろう' : '旗へ すすめ');
      g.font = 'bold 18px sans-serif';
      const half = g.measureText(label).width / 2 + 10;
      const spot = this.avoidRects(x, Math.max(100, y - 60), W, H, 'v', this.rectsAll, half + 4, 32, true);
      if (spot) {
        const lx = spot[0], ly = spot[1] - 16;
        this.drawGuideLink(g, x, y - 18, lx - half, ly - 16, lx + half, ly + 16);
        g.fillStyle = '#14120f'; g.fillRect(lx - half, ly - 16, half * 2, 32);
        g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, lx, ly);
      }
    }
    g.restore(); return true;
  }

  // 自分から目の前の相手へ。画面の上下左右は実際の投影に合わせる。
  drawEnemyDirection(g, rt, enemy) {
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    this.tmpV.set(p.x, p.y + .2, p.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return;
    const x = Math.max(24, Math.min(W - 24, (this.tmpV.x * .5 + .5) * W));
    const y = Math.max(76, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
    this.tmpV.set(enemy.pos.x, enemy.pos.y + .2, enemy.pos.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return;
    const dx = (this.tmpV.x * .5 + .5) * W - x, dy = (-this.tmpV.y * .5 + .5) * H - y;
    const length = Math.hypot(dx, dy);
    if (length < 16) return;
    const compact = rt.def.compactCombatGuides;
    const ux = dx / length, uy = dy / length, tip = Math.min(compact ? 32 : 76, length - 8);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x + ux * 8, y + uy * 8); g.lineTo(x + ux * tip, y + uy * tip);
    g.strokeStyle = '#14120f'; g.lineWidth = compact ? 5 : 12; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = compact ? 2 : 6; g.stroke();
    g.beginPath(); g.moveTo(x + ux * tip, y + uy * tip);
    const tail = tip - (compact ? 9 : 16), wing = compact ? 5 : 9;
    g.lineTo(x + ux * tail - uy * wing, y + uy * tail + ux * wing);
    g.lineTo(x + ux * tail + uy * wing, y + uy * tail - ux * wing); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  // 待機・回避の向きは足元から示す。背後へ向く時も端へ飛ばさない。
  drawFootDirection(g, rt, target) {
    if (this.footDirectionDrawn || isTouch && this.waitFacingReady && rt.def.waitFacingPoint?.(rt)) return false;
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    this.tmpV.set(p.x, p.y + .15, p.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return false;
    let x = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
    let y = Math.max(112, Math.min(H - 24, (-this.tmpV.y * .5 + .5) * H));
    if (isTouch) {
      const foot = this.facingOriginProjection || (this.facingOriginProjection = {});
      foot.x = x; foot.y = y; foot.behind = false;
      const origin = this.clearMoveOrigin(rt, foot);
      x = origin.x; y = origin.y;
    }
    const dx = target.x - p.x, dz = target.z - p.z, length = Math.hypot(dx, dz);
    if (length < .1) return false;
    // 短い別向きの矢印を作らず、実際の行き先まで一本で結ぶ。
    const goal = this.project(target, groundAt(rt.world, target.x, target.z, p.y) + .15, rt,
      this.facingGoalProjection || (this.facingGoalProjection = {}));
    let goalX = goal.x, goalY = goal.y;
    if (goal.behind || goalX < 48 || goalX > W - 48 || goalY < 100 || goalY > H - 64) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const scale = Math.min((W / 2 - 64) / Math.max(.001, Math.abs(side)),
        (H / 2 - 100) / Math.max(.001, Math.abs(forward)));
      goalX = Math.max(48, Math.min(W - 48, W / 2 + side * scale));
      goalY = Math.max(100, Math.min(H - 64, H / 2 - forward * scale));
    }
    // 画面下で二つの投影が近づいても、なぞる長さと始点の丸を残す。
    if (Math.hypot(goalX - x, goalY - y) < 64) goalY = Math.max(40, y - 96);
    const drew = isTouch ? this.drawSwipeArrow(g, x, y, goalX, goalY, 32) : this.drawFlagLink(g, x, y, goalX, goalY);
    this.drawSmallGoalFlag(g, goalX, goalY, .65, false, false, '');
    if (drew) { this.navigationTouchOrigin.look = true; this.footDirectionDrawn = true; }
    return drew;
  }

  // 今の任務や退避先がある間は、別の守備先を重ねない。
  defendedLocation(rt) {
    return rt && !rt.over && !rt.retryOpen && !rt.choice && !this.openingActive &&
      !rt.missionGuide?.marker && !rt.dodgeGuide && !this.retreatGuide?.active &&
      !rt.player.camShot && !this.bigmap && !S.reduceGuidance &&
      !(rt.missionGuide?.distance < (rt.missionGuide?.marker?.guideRadius || 8) && rt.def.waitFacingPoint?.(rt)) &&
      rt.def.defendLocation?.(rt);
  }

  drawDefendedLocation(g, rt) {
    const pos = this.defendedLocation(rt);
    if (!pos) return false;
    const target = $('target');
    if (1 + this.notices.picks.length + Number(!!rt.touchCoachActive || !!rt.nearestInteract()) + Number(!$('boss').hidden) +
        Number(!target.hidden && !target.classList.contains('notice-muted')) >= 3) return false;
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const point = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .2, rt,
      this.defendedProjection || (this.defendedProjection = {}));
    let x = point.x, y = point.y;
    if (point.behind || x < 24 || x > W - 172 || y < 120 || y > H - 32) {
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const scale = Math.min((W / 2 - 110) / Math.max(.001, Math.abs(right)),
        (H / 2 - 92) / Math.max(.001, Math.abs(forward)));
      x = Math.max(24, Math.min(W - 172, W / 2 + right * scale));
      y = Math.max(120, Math.min(H - 32, H / 2 - forward * scale));
    }
    // 上下の札を避け、旗の向きに沿う左右の位置は保つ。
    const obstacles = this.hudRects();
    let best = Infinity, bestY = y;
    for (let i = 0; i <= 8; i++) {
      const cy = i === 0 ? y : 120 + (H - 152) * (i - 1) / 7;
      let overlap = 0;
      for (const r of obstacles) overlap += Math.max(0, Math.min(x + 156, r.right) - Math.max(x - 8, r.left)) *
        Math.max(0, Math.min(cy + 8, r.bottom) - Math.max(cy - 44, r.top));
      const score = overlap * 100 + Math.abs(cy - y);
      if (score < best) { best = score; bestY = cy; }
    }
    this.drawSmallGoalFlag(g, x, bestY, .65, false, true, '守る場所');
    return true;
  }

  // 目標は太い縁の旗で示す。大きな戦闘用矢印はそのまま残す。
  drawTargetPointer(g, x, y, color, large = false) {
    if (this.rt?.touchSwipeActive && !large) return;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    if (large) {
      g.moveTo(x - 7, y - 47); g.lineTo(x + 7, y - 47);
      g.lineTo(x + 7, y - 29); g.lineTo(x + 18, y - 29);
      g.lineTo(x, y - 7); g.lineTo(x - 18, y - 29); g.lineTo(x - 7, y - 29);
    } else {
      g.restore();
      this.drawSmallGoalFlag(g, x - 11, y - 7, .7);
      return;
    }
    g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = color; g.fill(); g.restore();
  }

  // 通す味方の名前と、その本人から進む先への矢印。札は既存分と合わせ三枚まで。
  drawPassageGuides(g, rt) {
    const units = rt.def.passageGuideUnits?.(rt), goal = rt.def.passageGuideDestination?.(rt);
    // 任務の行き先や戦う相手がある間は、味方からの別の矢印を足さない。
    if (rt.missionGuide?.marker || rt.guideEnemy?.alive || this.defendEnemy?.alive || this.approachGuideEnemy?.alive) return false;
    if (!units || !goal || rt.over || rt.choice || rt.player.camShot || this.bigmap ||
        this.openingActive || S.reduceGuidance || guidanceEnded(rt) || retreatRequired(rt) ||
        rt.dodgeGuide || this.retreatGuide?.active) return false;
    let used = 1 + this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.touchCoachActive || !!rt.nearestInteract() || rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6) +
      Number(!!this.guardAlly || !!rt.def.guardGuideTarget?.(rt));
    for (const el of this.markerEls.values()) if (!el.hidden) used++;
    const rects = this.hudRects(), placed = this.passageRects || (this.passageRects = []);
    placed.length = 0;
    const end = this.project(goal, goal.y + .1, rt, this.passageEnd || (this.passageEnd = {}));
    const eligible = (u) => u?.alive && !u.gone && !u.woundOut && !u.fleeing && sightScreenUnit(rt, u);
    const selected = units.includes(rt.player.lock) ? rt.player.lock : units.includes(rt.player.aimed) ? rt.player.aimed : this.passageGuideUnit;
    this.passageGuideUnit = units.includes(selected) && eligible(selected) ? selected : null;
    if (!this.passageGuideUnit) for (const u of units) if (eligible(u)) { this.passageGuideUnit = u; break; }
    let drew = false;
    g.save(); g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    for (const u of units) {
      if (u !== this.passageGuideUnit || used >= 3 || !eligible(u)) continue;
      const f = this.measurePersonFrame(u, rt);
      if (!f) continue;
      const foot = this.project(u.pos, u.pos.y + .1, rt, this.passageFoot || (this.passageFoot = {}));
      if (!foot.behind && !end.behind && Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z) > 1.5)
        drew = this.drawDirectionChain(g, foot.x, foot.y, end.x, end.y, true, 64) || drew;
      this.drawAllySign(g, f.cx, f.top - 12); drew = true;
      const width = g.measureText(u.name).width + 16, x = f.cx;
      let y = f.top - 40;
      // 名札は本人へ短い線で結ぶ。
      for (const r of placed) if (x + width / 2 > r.left && x - width / 2 < r.right && y + 22 > r.top && y < r.bottom) y = r.top - 26;
      if (x - width / 2 < 12 || x + width / 2 > VIEW.w - 12 || y < 12 || y + 22 > VIEW.h - 24 ||
          rects.some((r) => x + width / 2 > r.left && x - width / 2 < r.right && y + 22 > r.top && y < r.bottom)) continue;
      const box = this.passageBoxes || (this.passageBoxes = [{}, {}]);
      const r = box[placed.length];
      if (!r) break;
      r.left = x - width / 2; r.right = x + width / 2; r.top = y; r.bottom = y + 22;
      placed.push(r); used++;
      g.beginPath(); g.moveTo(x, y + 22); g.lineTo(f.cx, f.top - 20);
      g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#14120f'; g.fillRect(r.left, y, width, 22);
      g.fillStyle = '#fff3ba'; g.fillText(u.name, x, y + 16);
    }
    g.restore(); return drew;
  }

  // 普段も近い敵の所属を示す。味方の印は組の詳しい表示にまとめる。
  drawNearbyTeamSigns(g, rt, candidates) {
    if (rt.def.town || rt.def.dojo || rt.over || rt.choice ||
        !rt.player.u.alive || this.openingActive || rt.player.camShot || this.bigmap || S.reduceGuidance || guidanceEnded(rt)) return false;
    // 移動・退避中は行き先を優先する。兵の数や戦い方は変えない。
    const guide = rt.missionGuide;
    const moving = guide?.marker && guide.distance >= (guide.marker.guideRadius || 8);
    const travelling = !!rt.dodgeGuide || retreatRequired(rt) || this.retreatGuide?.active ||
      !!rt.def.routeGuidePriority?.(rt) || moving && !rt.guideEnemyShown;
    const slots = this.teamSignSlots || (this.teamSignSlots = new Float32Array(24));
    const rects = this.hudRects(), p = rt.player.u;
    const enemyRange = rt.def.nearbyEnemySignRange ?? 18;
    const visible = this.teamSignUnits || (this.teamSignUnits = []);
    // 視線の確認は既存の候補更新と同じ毎秒十回まで。入れ物は使い回す。
    if (this.teamSignRt !== rt || this.teamSignAt !== this.ovAt) {
      this.teamSignRt = rt; this.teamSignAt = this.ovAt; visible.length = 0;
      for (const u of candidates) {
        if (!rt.player.showSquad && u.team === p.team ||
            u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' ||
            !u.alive || u.gone || u.offscreen || !u.mesh.visible ||
            u.group?.hidden || u.fleeing || u.woundOut ||
            Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > (u.team !== p.team ? enemyRange : 18) ||
            u.team !== p.team && u.isOfficer && !enemyKnown(rt, u)) continue;
        if (sightScreenUnit(rt, u)) visible.push(u);
      }
    }
    let count = 0, enemies = 0, allies = 0;
    const focus = this.guardThreat || this.attackGuideEnemy || this.approachGuideEnemy || this.defendEnemy || rt.guideEnemy || rt.player.lock;
    const destinationPerson = guide?.marker?.guidePerson?.();
    const passageUnits = rt.def.passageGuideUnits?.(rt);
    // 字のない形だけを近い両軍に付け、携帯では合わせて六人まで。
    const enemyLimit = rt.player.showSquad ? 6 : (rt.def.nearbyEnemySignLimit ?? 0), allyLimit = rt.player.showSquad ? 4 : 0;
    const budget = enemyLimit + allyLimit;
    const focusFrame = focus?.alive ? this.measurePersonFrame(focus, rt) : null;
    const focusTop = focusFrame?.top ?? 0, focusX = focusFrame?.cx ?? 0;
    this.tmpV.set(p.pos.x, p.pos.y + .12, p.pos.z).project(rt.camera);
    const selfVisible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
    const selfX = (this.tmpV.x * .5 + .5) * VIEW.w, selfY = (-this.tmpV.y * .5 + .5) * VIEW.h;
    g.save(); g.lineJoin = 'round';
    for (const u of visible) {
      if (count >= budget) break;
      const enemy = u.team !== p.team;
      // 攻撃の瞬間以外も近くの所属を示す。候補は本人に近い順のまま使う。
      if (!rt.player.showSquad && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 12) continue;
      if (travelling && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 9) continue;
      if ((enemy ? enemies >= enemyLimit : allies >= allyLimit) || u === focus || u === destinationPerson || passageUnits?.includes(u) ||
          u === rt.guideEnemy && rt.guideEnemyShown || u === this.defendEnemy ||
          !u.alive || u.gone || u.offscreen || !u.mesh.visible || u.group?.hidden || u.fleeing || u.woundOut ||
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > (enemy ? enemyRange : 18) ||
          enemy && u.isOfficer && !enemyKnown(rt, u)) continue;
      const head = u.human?.root.visible && u.human.bones?.Head;
      if (head) { head.getWorldPosition(this.tmpV); this.tmpV.y += .35; }
      else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted || u.type === 'cavalry' ? 3.5 : (u.bodyHeight ?? 1.72) + .3), u.pos.z);
      this.tmpV.project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) continue;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      if (x < 20 || x > VIEW.w - 20 || y < 76 || y > VIEW.h - 32) continue;
      // 周りの兵の印も、ねらう相手の体と囲みには重ねない。
      if (focusFrame && Math.abs(x - focusX) < 28 && Math.abs(y - focusTop) < 40) continue;
      // 味方の旗も自分の丸と名前から離す。兵そのものは減らさない。
      if (selfVisible && Math.abs(x - selfX) < 80 && y + 32 > selfY - 32 && y - 22 < selfY + 40) continue;
      let covered = false;
      for (const r of rects) if (x + 14 > r.left && x - 14 < r.right && y + 12 > r.top && y - 22 < r.bottom) { covered = true; break; }
      if (covered) continue;
      let overlaps = false;
      for (let i = 0; i < count; i++) if (Math.abs(x - slots[i * 2]) < 24 && Math.abs(y - slots[i * 2 + 1]) < 26) { overlaps = true; break; }
      if (overlaps) continue;
      slots[count * 2] = x; slots[count * 2 + 1] = y; count++;
      // 近い兵だけ輪郭を補い、霧でも印と本人を結び付ける。
      if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 12) this.drawUnitContrast(g, rt, u);
      if (enemy) {
        enemies++;
        this.drawEnemySign(g, x, y);
        continue;
      } else {
        allies++; this.drawAllySign(g, x, y); continue;
      }
    }
    g.restore(); return count > 0;
  }

  // 近い体の外側だけを二重線で示す。材質や兵の数は変えない。
  drawUnitContrast(g, rt, u, personGoal = false) {
    if (!personGoal && u !== rt.player.u && u.team === rt.player.u.team && rt.def.teamSignsOnly && !this.root.classList.contains('hc')) return false;
    if (u === rt.player.u && rt.def.playerFootSignOnly && !this.root.classList.contains('hc')) return false;
    if (!personGoal && rt.def.noUnitContrast) return false;
    const f = this.measurePersonFrame(u, rt);
    if (!f || f.bottom <= f.top) return false;
    const h = f.bottom - f.top, w = Math.max(8, Math.min(28, h * .23));
    const self = u === rt.player.u;
    const nearEnemy = !self && u.team !== rt.player.u.team && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 12;
    if (f.cx < w || f.cx > VIEW.w - w || f.top < (self || personGoal ? 0 : 64) || f.top > VIEW.h || !self && !personGoal && f.bottom > VIEW.h - 16) return false;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(f.cx - w * .45, f.bottom); g.lineTo(f.cx - w, f.top + h * .4);
    g.quadraticCurveTo(f.cx - w, f.top + h * .22, f.cx - w * .45, f.top + h * .2);
    g.bezierCurveTo(f.cx - w, f.top - 4, f.cx + w, f.top - 4, f.cx + w * .45, f.top + h * .2);
    g.quadraticCurveTo(f.cx + w, f.top + h * .22, f.cx + w, f.top + h * .4);
    g.lineTo(f.cx + w * .45, f.bottom);
    g.strokeStyle = '#14120f'; g.lineWidth = personGoal ? 10 : self ? 9 : nearEnemy ? 8 : 5; g.stroke();
    g.strokeStyle = personGoal ? '#fff3ba' : '#fff'; g.lineWidth = personGoal ? 5 : self || nearEnemy ? 4 : 2; g.stroke(); g.restore(); return true;
  }

  // 味方は中空の丸。敵の刀や行き先の旗と形で分ける。
  drawAllySign(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    g.restore();
  }

  // 敵は交差した二本の刀。小さくても三角や旗と見間違えない。
  drawEnemySign(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round';
    g.scale(1.15, 1.15);
    g.beginPath();
    g.moveTo(-10, -12); g.lineTo(10, 11); g.moveTo(10, -12); g.lineTo(-10, 11);
    g.moveTo(-11, 3); g.lineTo(-3, 10); g.moveTo(3, 10); g.lineTo(11, 3);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
  }

  // 刀の形と二重の縁で、暗い服の敵も色だけに頼らず示す。
  drawSwordSign(g, x, y) {
    g.save(); g.translate(x, y - 18); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-5, -20); g.lineTo(9, -49); g.lineTo(16, -57);
    g.lineTo(15, -45); g.lineTo(1, -17); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(-10, -23); g.lineTo(6, -15);
    g.moveTo(-3, -18); g.lineTo(-9, -6);
    g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
  }

  // 任務札と同じやりの形を、ねらう敵にも付ける。
  drawSpearSign(g, x, y) {
    g.save(); g.translate(x - 8, y - 40); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(16, 12); g.lineTo(10, 17);
    g.lineTo(10, 32); g.lineTo(6, 32); g.lineTo(6, 17); g.lineTo(0, 12); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  // 近い兵の画面上の範囲を共用する。札の配置のため毎コマ全員を投影しない。
  goalBodyRects(rt) {
    const W = VIEW.w, H = VIEW.h;
    const bodies = this.goalBodies || (this.goalBodies = new Float32Array(256 * 4));
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
    let x = sx, y = sy, best = Infinity;
    for (let i = 0; i < 9; i++) {
      const cx = Math.max(48, Math.min(W - 72, sx + (i % 3 - 1) * 80));
      const cy = Math.max(112, Math.min(H - 64, sy - 76 - Math.floor(i / 3) * 64));
      // 旗の根元と本人の丸を、携帯でも矢印が入るだけ離す。
      if (!foot.behind && Math.hypot(cx - foot.x, cy - foot.y) < 96) continue;
      let overlap = 0;
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(cx + 32 * flagScale + 5, bodies[j + 2]) - Math.max(cx - 12, bodies[j])) *
          Math.max(0, Math.min(cy + 8, bodies[j + 3]) - Math.max(cy - 56 * flagScale - 5, bodies[j + 1]));
      for (const r of rects) {
        if (r === this.guideOrderRect) continue;
        overlap += Math.max(0, Math.min(cx + 32 * flagScale + 5, r.right) - Math.max(cx - 12, r.left)) *
          Math.max(0, Math.min(cy + 8, r.bottom) - Math.max(cy - 56 * flagScale - 5, r.top));
      }
      const score = overlap * 1000 + Math.hypot(cx - sx, cy - sy);
      if (score < best) { best = score; x = cx; y = cy; }
    }
    g.save(); g.beginPath(); g.moveTo(x, y + 6); g.lineTo(sx, sy - 8);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    // 旗と到着点は線だけで結び、下向き矢印を自分の人印に重ねない。
    {
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
  drawSmallGoalFlag(g, x, y, scale = 1, returning = false, defend = false, caption = 'ここへ') {
    // 通常の戦は次の旗一つ。任務の札があれば同じ案内の字を足さない。
    if (singleBattleGuide(this.rt)) {
      if (this.goalFlagDrawn) return;
      this.goalFlagDrawn = true;
      const occupied = 1 + this.notices.picks.length + Number(!!this.rt.touchCoachActive || !!this.rt.nearestInteract()) +
        Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
      if (this.notices.sources[1].selected || occupied >= 3) caption = '';
    }
    // 横持ちでも布と墨縁が兵に埋もれない最低寸法を保つ。絵は使い回す。
    scale = Math.max(.9, scale);
    const key = scale + '|' + (returning ? 1 : 0) + (defend ? 1 : 0);
    const cache = this._flagSprites || (this._flagSprites = new Map());
    let sp = cache.get(key);
    if (!sp) {
      const ox = Math.ceil(10 + 8 * scale), oy = Math.ceil(10 + 62 * scale);
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

  guardControlPoint(rt, guide) {
    const center = guide.marker.guideDestination?.() || guide.pos;
    const point = this.guardControlGround || (this.guardControlGround = { x: 0, y: 0, z: 0 });
    if (this.waitGuardHeldBattle === rt && this.guardHoldPositioned) return point;
    point.x = center.x;
    point.z = center.z;
    point.y = groundAt(rt.world, point.x, point.z, rt.player.u.pos.y);
    return point;
  }

  drawGuardPost(g, rt, guide) {
    // 敵が迫っても持ち場の輪を残す。柵や兵による遮りでは消さない。
    if (this.openingActive) return false;
    const frame = rt.def.guardPostFrame?.(rt, guide);
    if (frame) this.drawGuardPostFrame(g, rt, frame);
    // 持ち場へ向かう間は、画面の外でも既存の行き先矢印を残す。
    if (guardPostDistance(rt, guide) >= (guide.marker.guideRadius || 8)) {
      return this.drawSingleDestination(g, rt, guide.marker.guideDestination?.() || guide.pos, guide.marker);
    }
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
    const half = Math.max(12, height * .22);
    const left = frame.left + 16 - half, right = frame.right - 16 + half;
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
    g.strokeStyle = '#14120f'; g.lineWidth = corners ? 6 : 9; g.stroke();
    g.strokeStyle = ally ? '#fff3ba' : '#ffffff'; g.lineWidth = corners ? 2 : 4; g.stroke(); g.restore();
  }

  // 戦う一人は太い囲みと短い呼び名にそろえる。
  drawEnemyOutline(g, u, rt, guarding = false) {
    // 近づく時も本人の囲みを残し、進む先だけ一本で示す。
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
      if (rt.def.compactApproachGuide) this.drawFootDirection(g, rt, clear.bend ? clear.way : goal);
      else this.drawDestinationPointer(g, rt, clear.bend ? clear.way : goal, true);
    }
    // 指定した戦だけ現在の立ち位置から測り、更新前の骨で空間を囲まない。
    const f = this.measurePersonFrame(u, rt, !!rt.def.enemyFrameAtPosition);
    if (!f || f.bottom <= f.top || !sightScreenUnit(rt, u)) return;
    this.drawPersonOutline(g, f, false, !!rt.def.enemyCornerSign);
    this.drawTargetFootRing(g, rt, u.pos, rt.def.enemyFootRingRadius ?? .85, true, true);
    this.enemyFrameShown = true;
    setHidden($('target'), true); setHidden($('boss'), true);
    // 守備の下知を読む戦では、相手は小印だけにして独立した敵の札を増やさない。
    if (rt.def.enemySignOnly) return;
    // 攻める一人を剣の形で示す。説明は既存の任務札へまとめる。
    const x = Math.max(44, Math.min(VIEW.w - 44, f.cx));
    const y = Math.max(40, Math.min(VIEW.h - 24, f.top - 20));
    this.drawEnemySign(g, x, y);
  }

  // 守る線は任務の行き先と別に残す。他の戦でも同じ指定を使える。
  drawDefenseLine(g, rt) {
    if (rainDanger(rt.army) || rt.dodgeGuide || retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid) return false;
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

  // 火をつける建物は、屋根の上に同じ火の形を付ける。字の札は増やさない。
  drawFireSign(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, -32);
    g.bezierCurveTo(3, -20, 16, -18, 14, -7);
    g.bezierCurveTo(12, 7, -14, 7, -14, -7);
    g.bezierCurveTo(-14, -16, -6, -20, -7, -25);
    g.lineTo(-3, -20); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(0, -13); g.quadraticCurveTo(9, 0, 0, 0); g.quadraticCurveTo(-7, 0, 0, -13);
    g.fillStyle = '#14120f'; g.fill(); g.restore();
  }

  // 作業する建物を囲む。動かない建物の範囲は一度だけ測り、投影用の入れ物も使い回す。
  drawWorkBuilding(g, rt, marker) {
    if (marker.entrance) return this.drawWorkEntrance(g, rt, marker);
    if (!marker.guideObject) return null;
    const box = marker.workBounds || (marker.workBounds = new THREE.Box3().setFromObject(marker.guideObject));
    if (box.isEmpty()) return null;
    const points = this.workBuildingPoints || (this.workBuildingPoints = new Float64Array(16));
    const hull = this.workBuildingHull || (this.workBuildingHull = new Int8Array(17));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.tmpV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      let j = i;
      while (j > 0 && (points[(j - 1) * 2] > x || points[(j - 1) * 2] === x && points[(j - 1) * 2 + 1] > y)) {
        points[j * 2] = points[(j - 1) * 2]; points[j * 2 + 1] = points[(j - 1) * 2 + 1]; j--;
      }
      points[j * 2] = x; points[j * 2 + 1] = y;
    }
    if (right < 24 || left > VIEW.w - 24 || bottom < 100 || top > VIEW.h - 32 || right - left < 12 || bottom - top < 12) return null;
    let count = 0;
    for (let pass = 0; pass < 2; pass++) {
      const start = count;
      for (let step = 0; step < 8; step++) {
        const i = pass ? 7 - step : step;
        while (count >= start + 2) {
          const a = hull[count - 2] * 2, b = hull[count - 1] * 2;
          if ((points[b] - points[a]) * (points[i * 2 + 1] - points[a + 1]) -
              (points[b + 1] - points[a + 1]) * (points[i * 2] - points[a]) > 0) break;
          count--;
        }
        hull[count++] = i;
      }
      count--;
    }
    // 家の外周だけを太く縁取り、中の景色と周囲の兵はそのまま見せる。
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < count; i++) {
      const at = hull[i] * 2;
      if (i) g.lineTo(points[at], points[at + 1]); else g.moveTo(points[at], points[at + 1]);
    }
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
    const sign = this.workBuildingSign || (this.workBuildingSign = { x:0, y:0 });
    sign.x = Math.max(36, Math.min(VIEW.w - 36, (left + right) / 2));
    sign.y = Math.max(104, top - 8);
    return sign;
  }

  // 火付けも修理も、建物全体でなく実際に近づく戸口だけを囲む。
  drawWorkEntrance(g, rt, marker) {
    const door = typeof marker.pos === 'function' ? marker.pos() : marker.pos;
    const approach = marker.guideDestination?.();
    if (!door || !approach) return null;
    const dx = approach.x - door.x, dz = approach.z - door.z, length = Math.hypot(dx, dz) || 1;
    // 人や地面に隠れやすい足場ではなく、戸口の手前の胸の高さで見通しを調べる。
    const probe = this.workDoorProbe || (this.workDoorProbe = { x:0, y:0, z:0 });
    probe.x = door.x + dx / length * .35; probe.z = door.z + dz / length * .35;
    probe.y = (door.y ?? groundAt(rt.world, door.x, door.z, rt.player.u.pos.y)) + 1;
    if (!this.floorGoalVisible(rt, probe, false)) return null;
    const points = this.workDoorPoints || (this.workDoorPoints = new Float64Array(8));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const side = i === 0 || i === 3 ? -.75 : .75;
      this.tmpV.set(door.x + dz / length * side, (door.y ?? groundAt(rt.world, door.x, door.z, rt.player.u.pos.y)) + (i < 2 ? 1.9 : 0), door.z - dx / length * side).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      points[i * 2] = x; points[i * 2 + 1] = y;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 24 || left > VIEW.w - 24 || bottom < 72 || top > VIEW.h - 32) return null;
    // 間近でも囲みを携帯画面の小さな範囲に収める。
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const scale = Math.min(1, 80 / Math.max(1, right - left), 96 / Math.max(1, bottom - top));
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = cx + (points[i * 2] - cx) * scale, y = cy + (points[i * 2 + 1] - cy) * scale;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
    const sign = this.workBuildingSign || (this.workBuildingSign = { x:0, y:0 });
    // 印の先を画面の余白へずらさず、入口の上辺へ固定する。
    sign.x = cx; sign.y = cy - (bottom - top) * scale / 2;
    return sign;
  }

  drawWorkGuide(g, rt, main) {
    // 戸口がある作業は入口だけを示し、それ以外は従来の作業場所へ導く。
    const p = main.guideDestination?.() || (typeof main.pos === 'function' ? main.pos() : main.pos);
    if (!p) return false;
    const foot = this.workGuideFoot || (this.workGuideFoot = { x:0, y:0, z:0 });
    foot.x = p.x; foot.z = p.z; foot.y = groundAt(rt.world, p.x, p.z, rt.player.u.pos.y);
    const building = this.drawWorkBuilding(g, rt, main);
    const sign = building || this.project(foot, foot.y + .12, rt);
    const visible = !!building || !main.guideObject && !sign.behind && sign.x >= 48 && sign.x <= VIEW.w - 48 && sign.y >= 112 && sign.y <= VIEW.h - 32 && this.floorGoalVisible(rt, foot);
    if (visible) {
      if (!building) this.drawFloorGoal(g, rt, p.x, p.z, false, .6);
      // 戸口の囲みにも、長押し釦と同じ火の印を付ける。
      if (main.guideSymbol === 'fire') this.drawFireSign(g, sign.x, sign.y - 8);
      else if (!building || !main.entrance) this.drawSmallGoalFlag(g, sign.x, sign.y, .65);
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand') && !this.root.classList.contains('working')) {
        setClass(order, 'work-order', true);
        const key = this.objKey + '|' + VIEW.w + '|' + VIEW.h;
        if (this.workOrderKey !== key) {
          this.workOrderKey = key;
          this.workOrderWidth = order.offsetWidth; this.workOrderHeight = order.offsetHeight;
        }
        const width = this.workOrderWidth, height = this.workOrderHeight;
        const left = sign.x + 40 + width <= VIEW.w - 12 ? sign.x + 40 : sign.x - width - 24;
        setCssVar(order, '--work-order-x', Math.round(Math.max(12, left)) + 'px');
        setCssVar(order, '--work-order-y', Math.round(Math.max(12, Math.min(VIEW.h - height - 24, sign.y - height - 12))) + 'px');
      }
    } else this.drawOffscreenDirection(g, rt, p, true);
    setClass(this.root, 'travel-guide', true);
    return true;
  }

  // 持ち場へ歩く道は見える矢印一本。道調べは半秒ごと、入れ物は使い回す。
  drawApproachRoute(g, rt, pos, radius, retreat = false) {
    const p = rt.player.u.pos;
    const c = this.approachRoute || (this.approachRoute = {
      scout: { id: 0, pos: { x: 0, y: 0, z: 0 } }, goal: { x: 0, y: 0, z: 0 },
      point: { x: 0, y: 0, z: 0 }, vertices: new Float64Array(72), screen: new Float64Array(6), at: -1
    });
    if (c.rt !== rt || rt.t < c.at - .5 || rt.t >= c.at || c.radius !== radius || c.retreat !== retreat ||
        Math.hypot(pos.x - c.gx, pos.z - c.gz) > .2 || Math.hypot(p.x - c.px, p.z - c.pz) > .5) {
      c.rt = rt; c.at = rt.t + .5; c.gx = pos.x; c.gz = pos.z; c.radius = radius; c.retreat = retreat;
      c.px = p.x; c.pz = p.z; c.count = 0;
      const from = c.scout.pos, to = c.point;
      from.x = p.x; from.y = p.y; from.z = p.z;
      c.goal.x = pos.x; c.goal.z = pos.z; c.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
      for (let step = 0; step < (retreat ? 4 : 2); step++) {
        const remaining = Math.hypot(pos.x - from.x, pos.z - from.z) - radius;
        if (remaining <= .15) break;
        const way = rt.def.approachGuidePoint?.(rt, from, c.goal) || rt.world.def.guideWay?.(c.scout, c.goal) || mountainWay(rt.army, c.scout, c.goal, true);
        const dx = way.x - from.x, dz = way.z - from.z, distance = Math.hypot(dx, dz);
        if (distance < .15) break;
        const length = Math.min(3, distance, remaining), ux = dx / distance, uz = dz / distance;
        to.x = from.x + ux * length; to.z = from.z + uz * length;
        to.y = groundAt(rt.world, to.x, to.z, from.y);
        if (!localClear(rt.army, from, to, true)) break;
        const start = c.count, back = Math.min(.5, length * .6);
        let clear = true;
        for (let i = 0; i < 3; i++) {
          const across = i === 1 ? 0 : i === 0 ? -.25 : .25;
          const along = i === 1 ? length : length - back;
          const x = from.x + ux * along - uz * across, z = from.z + uz * along + ux * across;
          const y = groundAt(rt.world, x, z, from.y);
          c.goal.x = x; c.goal.y = y; c.goal.z = z;
          if (Math.abs(y - from.y) > .6 || !localClear(rt.army, from, c.goal, true)) clear = false;
          c.vertices[c.count++] = x; c.vertices[c.count++] = y; c.vertices[c.count++] = z;
        }
        c.goal.x = pos.x; c.goal.z = pos.z; c.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
        if (!clear) { c.count = start; break; }
        from.x = to.x; from.y = to.y; from.z = to.z;
      }
    }
    let drew = false;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'round';
    const playerFrame = this.measurePersonFrame(rt.player.u, rt);
    // 退却時は地面の二本を旗へ続ける。普段は見える一本だけ。
    for (let i = 0; i < Math.min(c.count, retreat ? 36 : 18); i += 9) {
      let visible = true;
      for (let j = 0; j < 3; j++) {
        const k = i + j * 3, q = c.point;
        q.x = c.vertices[k]; q.y = c.vertices[k + 1]; q.z = c.vertices[k + 2];
        if (!this.floorGoalVisible(rt, q, false)) { visible = false; break; }
        this.tmpV.set(q.x, q.y + .08, q.z).project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) { visible = false; break; }
        c.screen[j * 2] = (this.tmpV.x * .5 + .5) * VIEW.w;
        c.screen[j * 2 + 1] = (-this.tmpV.y * .5 + .5) * VIEW.h;
      }
      if (!visible) continue;
      // 地面の先端は動かさず、遠近で膨らむ羽だけを縮める。
      const screen = c.screen;
      const spanX = Math.max(screen[0], screen[2], screen[4]) - Math.min(screen[0], screen[2], screen[4]);
      const spanY = Math.max(screen[1], screen[3], screen[5]) - Math.min(screen[1], screen[3], screen[5]);
      const scale = Math.min(1, 36 / Math.max(1, spanX), 28 / Math.max(1, spanY));
      for (let j = 0; j < 6; j++) {
        const tip = screen[2 + j % 2];
        screen[j] = tip + (screen[j] - tip) * scale;
      }
      if (playerFrame && Math.max(screen[0], screen[2], screen[4]) > playerFrame.left - 6 &&
          Math.min(screen[0], screen[2], screen[4]) < playerFrame.right + 6 &&
          Math.max(screen[1], screen[3], screen[5]) > playerFrame.top - 6 &&
          Math.min(screen[1], screen[3], screen[5]) < playerFrame.bottom + 6) continue;
      const baseX = (screen[0] + screen[4]) / 2, baseY = (screen[1] + screen[5]) / 2;
      this.drawNavigationArrow(g, screen[2], screen[3], Math.atan2(screen[3] - baseY, screen[2] - baseX), .5);
      drew = true;
      if (!retreat) break;
    }
    g.restore(); return drew;
  }

  // 旗は頭上、到着前の持ち場は床の道筋で示す。
  drawFlagGuide(g, rt, guide, pos) {
    const W = VIEW.w, H = VIEW.h, order = $('objectives');
    const waitButton = !!this.waitGuardButton && !this.waitGuardButton.hidden;
    // 判断や警告が先に選ばれている時は、新しい札を増やさない。
    if ((!this.notices.sources[1].selected && !waitButton) || order.classList.contains('expand')) return false;
    const waiting = guide.marker.guideArea === 'wait' || !!guide.marker.waitGuide;
    const reached = (guide.marker.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide.distance) < (guide.marker.guideRadius || 8);
    const text = waiting ? reached ? 'ここで まて' : 'ここへ すすめ' : /旗についていけ|旗に つづけ/.test(goalText(rt, guide.objective.text)) ? '旗に つづけ' : 'ここへ すすむ';
    // 布の中心や組の中心ではなく、目当ての旗を持つ人の足元を指す。
    // 待つ範囲の中心は実際の持ち場。近くの別の隊旗へ移さない。
    const bounds = waiting ? null : this.goalFlagBounds(rt, guide.marker, pos);
    const foot = waiting ? pos : this.goalFlagFoot || pos;
    if (waiting) this.drawDestinationArea(g, rt, pos, guide.marker.guideRadius || 8, false);
    // 到着後は、指示も操作も長押しボタン一枚に集める。
    if (waitButton) return true;
    if (waiting && !reached) {
      // 指図は既存の任務札に残し、下向き矢印付きの札は足さない。
      setClass(this.root, 'travel-guide', true);
      this.drawApproachRoute(g, rt, pos, guide.marker.guideRadius || 8);
      return true;
    }
    const floorY = groundAt(rt.world, foot.x, foot.z, foot.y ?? rt.player.u.pos.y);
    this.tmpV.set(foot.x, floorY + .18, foot.z).project(rt.camera);
    const goalX = (this.tmpV.x * .5 + .5) * W, goalY = (-this.tmpV.y * .5 + .5) * H;
    const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1 && goalX >= 64 && goalX <= W - 64 &&
      goalY >= 112 && goalY <= H - 28 && this.floorGoalVisible(rt, foot);
    g.save(); g.lineJoin = 'round'; g.font = '900 28px sans-serif';
    const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const dx = foot.x - p.x, dz = foot.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const direction = forward < 0 ? side >= 0 ? '右後ろ' : '左後ろ' : Math.abs(side) > forward ? side >= 0 ? '右' : '左' : '前';
    const detail = visible || waiting && reached ? '' : `${direction}・あと${Math.max(1, Math.ceil(Math.hypot(dx, dz) / .75))}歩`;
    const half = Math.ceil(Math.max(g.measureText(text).width, detail ? g.measureText(detail).width * 2 / 3 : 0) / 2) + 12;
    const labelHeight = detail ? 68 : 44;
    let spot;
    if (waiting && reached) {
      // 待機中は画面外の持ち場にも移動の矢印を出さない。輪と一枚の札だけ。
      spot = this.avoidRects(Math.max(half + 12, Math.min(W - half - 12, goalX)),
        Math.max(100, Math.min(H - 48, goalY - 40)), W, H, 'h', null, half, labelHeight, true);
    } else if (visible) {
      if (bounds) this.drawGoalFlagFrame(g, bounds, rt.def.subtleTargetFrames);
      const tipX = bounds ? bounds.left + bounds.width / 2 : goalX;
      const tipY = bounds ? bounds.top - 10 : goalY - 80;
      this.drawTargetPointer(g, tipX, tipY, '#fff3ba');
      spot = this.avoidRects(Math.max(half + 12, Math.min(W - half - 12, tipX)), Math.max(56, tipY - 38),
        W, H, 'h', null, half, 44, true);
    } else {
      const right = side >= 0, x = right ? W - 68 : 68;
      // 画面端に寄せ、矢じりの先から札まで同じ向きを保つ。
      const y = Math.max(100, Math.min(H - 80, H * .55));
      spot = this.avoidRects(right ? W - half - 92 : half + 92, y + 22,
        W, H, 'v', null, half, labelHeight, true);
      const edgeY = spot ? spot[1] - 22 : y;
      g.save(); g.translate(x, edgeY); g.rotate(Math.atan2(-forward, side) - Math.PI / 2);
      this.drawGoalArrow(g, 0, 0); g.restore();

    }
    // 雨待ちの任務も残す時は、既存の知らせと合わせて三枚まで。
    const occupied = this.notices.picks.length + Number(!this.root.classList.contains('working') && !!rt.nearestInteract()) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
    if (occupied >= 3) spot = null;
    if (spot) {
      const left = spot[0] - half, top = spot[1] - labelHeight;

      g.fillStyle = '#14120f'; g.fillRect(left, top, half * 2, labelHeight);
      g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, spot[0], top + 22);
      if (detail) {
        g.font = 'bold 16px sans-serif';
        g.fillText(detail, spot[0], top + 50);
      }
    }
    this.flagGuideDrawn = !!spot;
    setClass(this.root, 'flag-guide', this.flagGuideDrawn);
    g.restore(); return !!spot || !!visible;
  }

  destinationPointerClear(x, y, rects) {
    if (x < 40 || x > VIEW.w - 40 || y < 88 || y > VIEW.h - 40) return false;
    for (const r of rects) if (x + 40 > r.left && x - 40 < r.right && y + 40 > r.top && y - 40 < r.bottom) return false;
    return true;
  }

  // 画面外の旗と既存の任務を一組にし、知らせの枚数を増やさない。
  placeEdgeOrder(x, y) {
    const order = $('objectives');
    if (!this.notices.sources[1].selected || order.classList.contains('expand')) return;
    setClass(order, 'ground-order', true);
    const width = order.offsetWidth, height = order.offsetHeight;
    const left = x < VIEW.w / 2 ? x + 44 : x - width - 44;
    setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, left))) + 'px');
    setCssVar(order, '--ground-order-y', Math.round(Math.max(12, Math.min(VIEW.h - height - 48, y - height / 2))) + 'px');
  }

  // 行き先は矢印一つ。札に隠れた床を指す時は、空いている方向へ向ける。
  // 進む目当ての旗だけ大きくし、足元の自分の輪と区別する。
  drawMarkedGoalFlag(g, x, y, scale = 1) {
    this.drawSmallGoalFlag(g, x, y, scale);
  }

  // 肩越しでも見下ろしでも、画面に映る道の進行方向に合わせる。
  destinationDirection(rt, pos) {
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = Math.atan2(this.tmpV.x, this.tmpV.z), p = rt.player.u.pos;
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    return Math.atan2(-forward, side);
  }

  drawDestinationPointer(g, rt, pos, guardFlag = false, arrowScale = .7) {
    // 指定した戦だけ、画面外へ回した補助旗と矢印も小さくそろえる。
    const pointerScale = rt.def.destinationPointerScale ?? 1;
    arrowScale *= pointerScale;
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    this.tmpV.set(pos.x, groundAt(rt.world, pos.x, pos.z, p.y) + .2, pos.z).project(rt.camera);
    const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
    const behind = this.tmpV.z < -1 || this.tmpV.z > 1;
    const rects = this.hudRects();
    if (!behind && this.destinationPointerClear(sx, sy, rects) && this.floorGoalVisible(rt, pos)) {
      this.drawNavigationArrow(g, sx, sy,
        rt.def.directionalDestinationArrow ? this.destinationDirection(rt, pos) : Math.PI / 2, arrowScale);
      if (guardFlag) this.drawMarkedGoalFlag(g, sx, sy - 12, pointerScale);
      return true;
    }
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const length = Math.hypot(right, forward);
    if (length < .001) return false;
    const cx = W / 2, cy = Math.max(100, (H + 48) / 2);
    const scale = Math.min((W / 2 - 48) / Math.max(.001, Math.abs(right)),
      Math.max(16, H / 2 - 100) / Math.max(.001, Math.abs(forward)));
    for (let i = 0; i <= 12; i++) {
      const step = scale * (1 - i / 12), x = cx + right * step, y = cy - forward * step;
      if (!this.destinationPointerClear(x, y, rects)) continue;
      if (!guardFlag && !rt.def.routeGuideArrowOnly) {
        if (rects.some(r => x + 40 > r.left && x - 40 < r.right && y + 40 > r.top && y - 80 < r.bottom)) continue;
        this.drawEdgeDestination(g, x, y, Math.atan2(-forward, right));
        this.placeEdgeOrder(x, y);
        return true;
      }
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right), arrowScale);
      if (guardFlag) this.drawMarkedGoalFlag(g, x, y - 12, pointerScale);
      else if (!rt.def.routeGuideArrowOnly || groundFlag(rt.missionGuide)) this.drawSmallGoalFlag(g, x, y - 12, .65);
      this.placeEdgeOrder(x, y);

      return true;
    }
    return false;
  }

  // 待つ場所は地面の太い点線の輪。任務札は印の外へ置く。
  drawGroundGuide(g, rt) {
    setClass($('objectives'), 'linked-destination', false);
    const guardWait = this.guardWait?.active && this.guardWait.rt === rt && rt.player.guard && this.guardFacing && this.defendEnemy?.alive ? this.guardWait : null;
    const retreat = this.retreatGuide?.active && this.retreatGuide.valid ? this.retreatGuide : null;
    // 防ぐ時は名前付きの盾だけにし、足形や待つ輪を重ねない。
    const hasCover = !!this.coverEl && !this.coverEl.hidden && !!rt.coverGuide?.valid;
    const fighting = !!(this.defendEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive);
    const routePriority = !fighting && !!rt.def.routeGuidePriority?.(rt);
    const enemyGuide = !routePriority && singleBattleGuide(rt) && (rt.guideEnemyShown || rt.guideEnemyDirection) && rt.guideEnemy?.alive;
    const guardDestination = rt.def.keepGuardTaskLabel && rt.missionGuide?.marker?.guideArea === 'guard' &&
      !this.root.classList.contains('wait-guard-active') && !guardWait && !this.guardAlly;
    const dismount = !!this.actionLabel && !this.actionLabel.hidden && !!this.actionLabel.querySelector('.dismount-action') && rt.player.mounted;
    const helpedPerson = rescueTarget(rt) || this.guardAlly;
    const personLocated = helpedPerson?.alive && sightScreenUnit(rt, helpedPerson);
    const enabled = (!personLocated || retreat || hasCover) && (!fighting || retreat || hasCover) && (!dismount || retreat) && (!this.approachGuideEnemy || retreat || hasCover) && (routePriority || retreat || hasCover || guardDestination || !enemyGuide && !navigationEnemy(rt) && !this.defendEnemy?.alive && !this.root.classList.contains('wait-guard-active') && !guardWait && !(rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive && !this.defendEnemy && !this.guardAlly) && !rainDanger(rt.army) && !S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide;
    const guide = rt.missionGuide?.objective === currentObjective(rt) ? rt.missionGuide : null;
    const cover = !retreat && this.coverEl && !this.coverEl.hidden && rt.coverGuide?.valid ? rt.coverGuide.pos : null;
    setClass(this.root, 'cover-guidance', hasCover);
    const attacking = !routePriority && !guardDestination && !retreat && !retreatRequired(rt) && (rt.guideEnemyShown || rt.guideEnemyDirection) && rt.guideEnemy?.alive;
    const flag = !guardWait && !retreat && !cover && !attacking && groundFlag(guide);
    const marker = guardWait || (!attacking && (!retreatRequired(rt) || guide?.marker?.guideArea === 'retreat') && guide?.objective === currentObjective(rt) && (guide.marker?.guideArea || flag || !guide.marker?.person && !guide.marker?.guidePerson && (!guide.marker?.entrance || !rt.def.town && !rt.def.dojo)) ? guide.marker : null);
    const order = $('objectives');
    setClass(order, 'travel-retreat', false);
    setClass(order, 'goal-visible', false);
    setClass(order, 'destination-sign', enabled && !!marker?.entrance && !retreat);
    const localOrder = enabled && !!(retreat || marker) && !cover && !flag && !(rt.def.compactHoldGuide && marker?.waitGuide) && this.notices.sources[1].selected && !order.classList.contains('expand');
    setClass(order, 'entrance-order', localOrder && !!marker?.entrance);
    if (order.classList.contains('ground-order') !== localOrder) this.groundOrderKey = null;
    setClass(order, 'ground-order', localOrder);
    setClass(this.root, 'route-task', enabled && !!marker && !retreat && !cover && !marker.guidePerson &&
      !marker.entrance && !marker.guideSymbol && !marker.waitGuide &&
      marker.guideArea !== 'wait' && marker.guideArea !== 'guard' && !rt.nearestInteract());
    if (!enabled || !retreat && !cover && !marker) return false;
    // 押す場所は操作札だけ。足元に押せそうな輪を重ねない。
    if (cover) return this.drawCoverDirection(g, rt, cover);
    if (!retreat && marker?.guideArea === 'guard') {
      return this.drawSingleDestination(g, rt, marker.guideDestination?.() || guide.pos, marker);
    }
    // 遠い門そのものを壁越しに指さず、通る順に置かれた道の印を使う。
    const routePoint = marker?.entrance && !rt.def.town && !rt.def.dojo ? guide.pos : null;
    const pos = retreat || cover || guardWait?.pos || routePoint || marker?.guideDestination?.() || guide.pos, radius = retreat ? retreat.radius : cover ? .9 : marker.guideRadius || 3;
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    // 手当てへ戻る時も共通の大旗へ導く。到着後は元の手当ての印へ渡す。
    if (retreat?.treatment && Math.hypot(pos.x - p.x, pos.z - p.z) >= radius) {
      const s = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .18, rt);
      const visible = !s.behind && s.x >= 48 && s.x <= W - 80 && s.y >= 154 && s.y <= H - 60 && this.floorGoalVisible(rt, pos);
      return this.drawRetreatDestination(g, rt, pos, visible, s.x, s.y, false);
    }
    if (!retreat && !cover && marker?.guideSymbol === 'fire') {
      setClass(order, 'ground-order', false);
      return this.drawWorkGuide(g, rt, marker);
    }
    if ((singleBattleGuide(rt) && !retreat && marker?.guideArea !== 'retreat' || retreat?.treatment) && !cover) {
      setClass(order, 'ground-order', false);
      setClass(order, 'destination-sign', false);
      setClass(order, 'entrance-order', false);
      return this.drawSingleDestination(g, rt, pos, retreat || marker);
    }
    // 移動の向きは道へ、到着の印は実際の場所へ分ける。
    if (!cover && !flag && !retreat?.treatment && (retreat || marker && (marker.guideArea !== 'wait' && !marker.waitGuide || Math.hypot(pos.x - p.x, pos.z - p.z) >= radius))) {
      setClass(order, 'ground-order', false);
      // 任務は既存の一枚。進む向きを伝える札は増やさない。
      return this.drawTravelGuide(g, rt, pos, radius, retreat?.ally || marker?.guideAlly?.() || null, !!retreat || marker?.guideArea === 'retreat', !!retreat || marker?.guideArea === 'retreat', false, marker?.guideGoal?.() || pos);
    }
    // 旗への案内は地面の行き先一つにまとめる。
    if (flag) return this.drawFlagGuide(g, rt, guide, pos);
    const reached = Math.hypot(pos.x - p.x, pos.z - p.z) < radius;
    const waiting = !flag && !retreat && !cover && (marker.guideArea === 'wait' || !!marker.waitGuide);
    // 到着の判定は保ち、待つ印は持ち場へ固定する。本人を追って場所を変えない。
    const foot = pos;
    const drawnRadius = waiting ? radius : retreat ? Math.max(1.8, radius) : cover ? .75 : Math.min(radius, 1.6);
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    let left = Infinity, top = Infinity, rightEdge = -Infinity, bottom = -Infinity, whole = true;
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2, px = foot.x + Math.cos(angle) * drawnRadius, pz = foot.z + Math.sin(angle) * drawnRadius;
      this.tmpV.set(px, groundAt(rt.world, px, pz, foot.y ?? p.y) + .15, pz).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z < -1 || this.tmpV.z > 1) whole = false;
      left = Math.min(left, sx); rightEdge = Math.max(rightEdge, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
    }
    whole = whole && left >= 12 && rightEdge <= W - 12 && top >= 64 && bottom <= H - 24 &&
      rightEdge - left <= (waiting ? W / 3 : 160) && bottom - top <= (waiting ? H / 3 : 80);
    const footY = marker?.entrance && Number.isFinite(foot.y) ? foot.y : groundAt(rt.world, foot.x, foot.z, foot.y ?? p.y) + .2;
    this.tmpV.set(foot.x, footY, foot.z).project(rt.camera);
    let x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
    const covered = retreat?.treatment && this.hudRects().some(r => r !== this.guideOrderRect &&
      x + 88 > r.left && x - 88 < r.right && y + 48 > r.top && y - 88 < r.bottom);
    const off = this.tmpV.z > 1 || this.tmpV.z < -1 || x < 50 || x > W - 50 || y < 76 || y > H - 24 || covered;
    whole = whole && !off;
    // 手当ての行き先が見える間は、輪と下向きの印に絞る。
    if (retreat?.treatment && off && !reached) this.drawTravelGuide(g, rt, pos, radius, null, false, false, true);
    const dx = pos.x - p.x, dz = pos.z - p.z, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (off && (!reached || waiting)) {
      const scale = Math.min((W / 2 - 65) / Math.max(.001, Math.abs(right)), (H / 2 - 120) / Math.max(.001, Math.abs(forward)));
      x = W / 2 + right * scale; y = H / 2 - forward * scale;
    }
    // 画面端や足元でも輪を欠かさず、全体が見える大きさで収める。
    const edgeX = retreat?.treatment ? 60 : 50, edgeY = retreat?.treatment ? 32 : 24;
    x = Math.max(edgeX, Math.min(W - edgeX, x));
    y = Math.max(76, Math.min(H - edgeY, y));
    if (off && retreat?.treatment) for (const r of this.hudRects()) {
      if (r !== this.guideOrderRect && x + 28 > r.left && x - 28 < r.right && y + 28 > r.top && y - 28 < r.bottom) {
        y = Math.max(100, r.top - 36);
      }
    }
    const ringX = whole ? (left + rightEdge) / 2 : x;
    const ringY = whole ? (top + bottom) / 2 : y;
    const ringW = cover ? Math.min(28, Math.max(18, (rightEdge - left) / 2)) : whole ? Math.max(retreat?.treatment ? 52 : 44, (rightEdge - left) / 2) : retreat?.treatment ? 52 : 44;
    const ringH = cover ? Math.min(12, Math.max(8, (bottom - top) / 2)) : whole ? Math.max(retreat?.treatment ? 20 : 15, (bottom - top) / 2) : retreat?.treatment ? 20 : 16;
    // 待つ点線は実際の地面へ投影する。画面端に偽の持ち場を作らない。
    if (waiting && rt.def.compactHoldGuide) {
      if (!off && this.drawFloorGoal(g, rt, foot.x, foot.z, false, .75)) this.drawSmallGoalFlag(g, x, y);
    } else if (waiting) {
      g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
      g.beginPath();
      let previousVisible = false;
      for (let i = 0; i <= 32; i++) {
        const angle = i / 32 * Math.PI * 2;
        const px = foot.x + Math.cos(angle) * drawnRadius, pz = foot.z + Math.sin(angle) * drawnRadius;
        this.tmpV.set(px, groundAt(rt.world, px, pz, foot.y ?? p.y) + .15, pz).project(rt.camera);
        const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
        const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
        if (visible && previousVisible) g.lineTo(sx, sy);
        else if (visible) g.moveTo(sx, sy);
        previousVisible = visible;
      }
      this.strokeGroundArea(g);
      g.restore();
    } else if (rt.def.groundCombatMarkers && !marker?.entrance && !retreat?.treatment) {
      if (!off) this.drawFloorGoal(g, rt, foot.x, foot.z, false, .6);
    } else if (!marker?.entrance && Math.hypot(rt.player.u.vel.x, rt.player.u.vel.z) < .05 && (retreat?.treatment ? !off : !(off && !reached))) {
      g.beginPath(); g.ellipse(ringX, ringY, ringW, ringH, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(154,132,88,.45)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(204,184,137,.65)'; g.lineWidth = 1; g.stroke();
    }
    if (whole && !marker?.entrance) { x = ringX; y = ringY; }
    // 布が画面外でも、輪と矢印に同じ短い名前を添える。
    if (flag && this.notices.sources[1].selected && !order.classList.contains('expand')) {
      g.font = 'bold 20px sans-serif';
      const half = Math.ceil(g.measureText('この はたへ').width / 2) + 12;
      const lx = Math.max(half + 8, Math.min(W - half - 8, x));
      const ly = Math.max(12, y - 112);
      g.fillStyle = '#14120f'; g.fillRect(lx - half, ly, half * 2, 36);
      g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('この はたへ', lx, ly + 18);
      setClass(this.root, 'flag-guide', true);
    }
    // 選ばれた一枚の札だけを輪の外へ。警告・判断・開いた任務一覧には割り込まない。
    if (localOrder) {
      // 手当ては移動用の見せ方にせず、今の操作だけを輪のそばへ置く。
      const measureKey = this.objKey + '|' + this.actionLabel?.textContent + '|' + W + '|' + H;
      if (this.groundOrderKey !== measureKey) {
        this.groundOrderKey = measureKey;
        this.groundOrderW = order.offsetWidth; this.groundOrderH = order.offsetHeight;
      }
      // 移動の札は輪のそばへ。待機と手当ては本人と目印の上を空ける。
      let labelX = Math.max(12, Math.min(W - this.groundOrderW - 12, x - this.groundOrderW / 2));
      let labelY = Math.max(12, Math.min(H - this.groundOrderH - 12, y - ringH - (retreat?.treatment ? 70 : 24) - this.groundOrderH - 12));
      // 待機と手当ての札は輪の横へ寄せる。横に入らない時だけ真上へ。
      if ((waiting || retreat?.treatment) && !off) {
        const gap = retreat?.treatment ? 12 : 36;
        const roomRight = W - 12 - (x + ringW + gap);
        const roomLeft = x - ringW - gap - 12;
        if (Math.max(roomRight, roomLeft) >= this.groundOrderW) {
          labelX = roomRight >= roomLeft ? x + ringW + gap : x - ringW - this.groundOrderW - gap;
          labelY = Math.max(12, Math.min(H - this.groundOrderH - 12, y - this.groundOrderH / 2));
        } else {
          // 横に収まらない時も、点線と足形の上を空ける。
          labelY = retreat?.treatment && y + ringH + 12 + this.groundOrderH <= H - 12
            ? y + ringH + 12
            : Math.max(12, y - (retreat?.treatment ? 70 : ringH + 24) - this.groundOrderH);
        }
      }
      const ally = !retreat?.treatment && retreat?.ally;
      if (ally?.alive) {
        this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.4 : 2.7), ally.pos.z).project(rt.camera);
        const ax = (this.tmpV.x * .5 + .5) * W, ay = (-this.tmpV.y * .5 + .5) * H;
        if (this.tmpV.z >= -1 && this.tmpV.z <= 1 && labelX < ax + 40 && labelX + this.groundOrderW > ax - 12 && labelY < ay + 8 && labelY + this.groundOrderH > ay - 48) {
          labelX = ax < W / 2 ? Math.min(W - this.groundOrderW - 12, ax + 48) : Math.max(12, ax - this.groundOrderW - 20);
        }
      }
      // 指定した戦の退避札だけ、折り返した実寸で命の欄の上へ離す。
      // 四分の一秒ごとの既存の採寸を使い、毎コマ測り直さない。
      if (retreat && rt.def.retreatOrderAvoidHealth) {
        this.hudRects();
        const health = this.healthRect;
        if (health && labelX < health.right + 8 && labelX + this.groundOrderW > health.left - 8 &&
            labelY < health.bottom + 8 && labelY + this.groundOrderH > health.top - 8)
          labelY = Math.max(12, health.top - this.groundOrderH - 8);
      }
      setCssVar(order, '--ground-order-x', Math.round(labelX) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(labelY) + 'px');
    }
    if (localOrder && (retreat?.treatment || !(off && (!reached || waiting)))) {
      const lx = parseFloat(order.style.getPropertyValue('--ground-order-x'));
      const ly = parseFloat(order.style.getPropertyValue('--ground-order-y'));
      if (!marker?.entrance && !waiting) this.drawGuideLink(g, x, off ? y : y - ringH, lx, ly, lx + this.groundOrderW, ly + this.groundOrderH);
    }
    // 門の足元と任務札を同じ旗・矢印で示す。画面外では一組のまま向ける。
    if (marker?.entrance) {
      if (off && !reached) {
        g.translate(Math.max(84, Math.min(W - 84, x)), Math.max(100, Math.min(H - 84, y)));
        g.rotate(Math.atan2(-forward, right) - Math.PI / 2);
        this.drawDestinationSign(g, 0, 0);
      } else this.drawDestinationSign(g, x, y);
      g.restore(); return true;
    }
    if (cover && !off) {
      g.beginPath(); g.ellipse(ringX, ringY, Math.max(36, ringW), Math.max(16, ringH), 0, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
      this.drawGoalArrow(g, ringX, ringY - Math.max(16, ringH) - 8);
      g.restore(); return true;
    }
    // 退く時はついていく味方の頭上に旗を立て、同じ矢印でその後ろの輪へ結ぶ。
    const ally = !retreat?.treatment && retreat?.ally;
    if (ally?.alive && !ally.gone && !ally.fleeing && sightUnit(rt, ally)) {
      this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.4 : 2.7), ally.pos.z).project(rt.camera);
      const ax = (this.tmpV.x * .5 + .5) * W, ay = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z >= -1 && this.tmpV.z <= 1 && ax > 24 && ax < W - 48 && ay > 80 && ay < H - 48) {
        this.drawGuideLink(g, x, y - ringH, ax - 3, ay - 36, ax + 30, ay);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, ay - 38); g.lineTo(ax + 28, ay - 38);
        g.lineTo(ax + 21, ay - 27); g.lineTo(ax + 28, ay - 16); g.lineTo(ax, ay - 16);
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff3ba'; g.fill();
      }
    }
    if (!localOrder && !retreat?.treatment && (retreat || cover)) {
      // 輪の脇へ太い矢印。札から戦場を横切る線は引かない。
      const side = x < W / 2 ? 1 : -1;
      const tip = x + side * (ringW + 8);
      g.beginPath(); g.moveTo(tip + side * 24, y); g.lineTo(tip, y);
      g.moveTo(tip + side * 8, y - 8); g.lineTo(tip, y); g.lineTo(tip + side * 8, y + 8);
      g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
    }
    if (retreat?.treatment && !off) {
      // 十字も札もこの輪のそばへ。離れた味方の旗へ線を伸ばさない。
      this.drawGoalArrow(g, x, y - 6);
      g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 4;
      g.beginPath(); g.rect(x + 26, y - 62, 24, 24); g.stroke(); g.fill();
      g.beginPath(); g.moveTo(x + 38, y - 57); g.lineTo(x + 38, y - 43);
      g.moveTo(x + 31, y - 50); g.lineTo(x + 45, y - 50);
      g.stroke(); g.restore(); return true;
    }
    // 同じ行き先の札は置かず、地面の目印一つにそろえる。
    g.translate(x, y); g.beginPath();
    if (off && !reached) {
      g.restore();
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right), .65);
      this.drawSmallGoalFlag(g, x, y - 16, .65);
      return true;
    } else if (flag) {
      // 実物の旗の足元に線の矢印だけを添える。
      this.drawGoalArrow(g, 0, 0); g.restore(); return true;
    } else if (cover && !rt.def.coverGuidePlace) {
      // 下がる場所は旗の根元。兵の旗と区別できる太い縁を付ける。
      g.moveTo(0, 8); g.lineTo(0, -56); g.lineTo(28, -56);
      g.lineTo(21, -43); g.lineTo(28, -30); g.lineTo(0, -30);
    } else if (waiting || marker?.waitGuide) {
      // 待つ輪の中には危険や操作に見える記号を足さない。
    } else {
      this.drawGoalArrow(g, 0, -6); g.restore(); return true;
    }
    g.closePath(); g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke(); g.fill();
    g.restore(); return true;
  }

  // 兵の頭上の体力（近くの兵だけ）
  drawOverlay(rt) {
    const previousEnemyFrame = !!this.enemyFrameShown;
    this.enemyFrameShown = false;
    this.enemyTouchShown = false;
    this.footDirectionDrawn = false;
    this.headingDrawn = false;
    if (this.flagDirectionEl) {
      this.flagDirectionEl.hidden = true;
      setCssVar(this.flagDirectionEl, 'display', 'none', 'important');
    }
    const cv = $('overlay');
    setClass(this.root, 'single-guide', singleBattleGuide(rt));
    // 写真モードでは頭上の名札・体力も消す
    if (this.root.classList.contains('photo')) { setClass($('objectives'), 'ground-order', false); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); this.ovBlank = true; return; }
    const W = VIEW.w, H = VIEW.h;
    // 守備中は持ち場の囲みにそろえ、射程の白い弧を重ねない。
    if (rt.dodgeGuide || rt.missionGuide?.marker?.guideArea === 'guard') {
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
    }
    this.flagGuideDrawn = false;
    setClass(this.root, 'flag-guide', false);
    setClass(this.root, 'edge-destination', false);
    setClass(this.root, 'travel-guide', false);
    setClass($('objectives'), 'work-order', false);
    setClass(this.root, 'person-guide', !$('prompt').hidden && $('prompt').classList.contains('talk-target'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; this.ovBlank = true; }
    const g = cv.getContext('2d');
    // 前のコマに何も描かなかったなら、消す仕事も省く（携帯で画面いっぱいを毎コマ消すのは重い）
    if (!this.ovBlank) g.clearRect(0, 0, W, H);
    this.placeFrameShown = false;
    this.destinationDrawn = false;
    this.goalFlagDrawn = false;
    this.hudRects();
    if (recovering(rt)) {
      setClass($('objectives'), 'ground-order', false);
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
      if (rt.dodgeRing) rt.dodgeRing.visible = false;
      this.ovBlank = true;
      return;
    }
    // なぞり始めを教える間は、離れた人型や旗を重ねない。
    if (this.openingActive && this.opening?.el.classList.contains('opening-controls') && !this.opening.flagGround) {
      this.drawPlayerSign(g, rt);
      this.ovBlank = false;
      return;
    }
    if (!this.approachGuideEnemy?.alive || recovering(rt)) setClass($('objectives'), 'approach-order', false);
    let swipeDrawn = false;
    if (isTouch && $('objectives').classList.contains('facing-order') && this.notices.sources[1].selected &&
        !rt.over && !rt.choice && !this.openingActive && !rt.player.camShot && !this.bigmap && !S.reduceGuidance) {
      const right = this.facingSwipeRight, direction = right ? 1 : -1;
      const foot = this.project(rt.player.u.pos, rt.player.u.pos.y + .08, rt,
        this.facingFootProjection || (this.facingFootProjection = {}));
      const x = foot.behind ? W / 2 : foot.x;
      const y = foot.behind ? H - 64 : foot.y;
      const end = Math.max(24, Math.min(W - 24, x + direction * 104));
      const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
      origin.rt = rt; origin.at = rt.t; origin.x = x; origin.y = y; origin.look = true;
      const order = $('objectives');
      const sizeKey = `${order.textContent}|${W}|${H}|${S.textScale}`;
      if (this.facingOrderKey !== sizeKey) {
        this.facingOrderKey = sizeKey;
        this.facingOrderHeight = order.offsetHeight;
      }
      setCssVar(order, '--facing-order-y', Math.round(Math.max(12,
        y - Math.max(44, this.facingOrderHeight) - 40)) + 'px');
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2);
      g.moveTo(x + direction * 28, y); g.lineTo(end, y);
      g.moveTo(end - direction * 10, y - 8); g.lineTo(end, y); g.lineTo(end - direction * 10, y + 8);
      g.strokeStyle = '#14120f'; g.lineWidth = 12; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 6; g.stroke();
      // 指先が始点の輪の中心に触れる手の形。
      g.beginPath();
      g.moveTo(x - 6, y + 22); g.lineTo(x - 6, y);
      g.bezierCurveTo(x - 6, y - 10, x + 6, y - 10, x + 6, y);
      g.lineTo(x + 6, y + 18); g.lineTo(x + 12, y + 14);
      g.lineTo(x + 26, y + 24); g.lineTo(x + 22, y + 44);
      g.lineTo(x - 5, y + 44); g.lineTo(x - 20, y + 28);
      g.bezierCurveTo(x - 28, y + 17, x - 16, y + 12, x - 6, y + 26);
      g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#fff3ba'; g.fill();
      g.restore(); swipeDrawn = true;
    }
    // 向きを教える札を出した時は、長押しの釦が出ない場合も丸と旗を必ず結ぶ。
    const facingGuide = rt.missionGuide;
    if (isTouch && !this.waitFacingReady && this.notices.sources[1].selected &&
        facingGuide?.distance < (facingGuide?.marker?.guideRadius || 8) &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active &&
        !this.openingActive && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !S.reduceGuidance &&
        !this.aimGuideEnemy?.alive && !rt.guideEnemyShown && !this.defendEnemy?.alive) {
      const facing = rt.def.waitFacingPoint?.(rt);
      if (facing) swipeDrawn = this.drawFootDirection(g, rt, facing) || swipeDrawn;
    }
    const aimEnemy = this.aimGuideEnemy;
    if (aimEnemy?.alive && !rt.over && !rt.choice && !this.openingActive && !rt.player.camShot &&
        !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && sightScreenUnit(rt, aimEnemy) &&
        this.notices.sources[1].selected && !$('objectives').classList.contains('expand')) {
      const frame = this.measurePersonFrame(aimEnemy, rt);
      if (frame) {
        const order = $('objectives');
        setClass(order, 'ground-order', false); setClass(order, 'linked-destination', false);
        setClass(order, 'enemy-order', false);
        setClass(this.root, 'guard-guide', false); setClass(this.root, 'melee-guide', false);
        rt.guideEnemy = aimEnemy; rt.guideEnemyShown = true; rt.guideEnemyDirection = false;
        this.placeFrameShown = false;
        this.drawPlayerSign(g, rt);
        const wait = rt.missionGuide;
        if (wait?.marker?.guideArea === 'wait')
          this.drawWaitFrame(g, rt, wait.marker.guideDestination?.() || wait.pos, wait.marker.guideRadius || 8);
        this.drawEnemyOutline(g, aimEnemy, rt, true);
        this.drawDefendedLocation(g, rt);
        const post = rt.missionGuide;
        if (post?.marker?.guideArea === 'guard') {
          const frame = rt.def.guardPostFrame?.(rt, post);
          if (frame) this.drawGuardPostFrame(g, rt, frame);
        }
        if (rt.lockRing) rt.lockRing.visible = false;
        if (rt.aimRing) rt.aimRing.visible = false;
        if (rt.reachRing) rt.reachRing.visible = false;
        this.drawRainDrops(g, W, H, rt); this.drawBrim(g, W, H, rt);
        this.ovBlank = false;
        return;
      }
    }
    const guideRects = this.personGuideRects || (this.personGuideRects = []); guideRects.length = 0;
    setClass($('objectives'), 'place-destination', !!rt.def.placeFrame?.(rt));
    // 戸口をたどる戦は、次に通る入口の矢印へまとめる。
    const routeDoor = rt.def.routeDestinationSight && rt.def.routeGuidePriority?.(rt) && rt.missionGuide?.marker?.id === 'next';
    let drew = (routeDoor ? false : this.drawPlaceFrame(g, rt)) || swipeDrawn;
    drew = this.drawDefendedLocation(g, rt) || drew;
    // 守備中は持ち場の境を残し、退く時は逃げ先の印だけを優先する。
    const holdGuide = rt.missionGuide?.objective === currentObjective(rt) ? rt.missionGuide : null;
    if (!retreatRequired(rt) && (holdGuide?.marker?.guideArea === 'guard' || !rt.guideEnemyShown && !this.defendEnemy) && (holdGuide?.marker?.guideArea === 'guard' || holdGuide?.marker?.waitAction &&
        holdGuide.distance < (holdGuide.marker.guideRadius || 8)) && !this.retreatGuide?.active && !rt.dodgeGuide &&
        (!this.coverEl || this.coverEl.hidden) && !S.reduceGuidance && !guidanceEnded(rt) &&
        !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap) {
      const hold = holdGuide.marker.guideDestination?.() || holdGuide.pos;
      if (hold) {
        const pressAtPost = isTouch && this.waitGuardButton && !this.waitGuardButton.hidden &&
          this.waitGuardButton.classList.contains('ground-hold');
        if (!pressAtPost && holdGuide.marker.guideArea !== 'wait' && (holdGuide.marker.guideArea !== 'guard' || !rt.def.compactGuardArea || this.openingActive))
          this.drawDestinationArea(g, rt, hold, holdGuide.marker.guideRadius || 8, false);
        if (holdGuide.marker.guideArea === 'guard') this.drawGuardPost(g, rt, holdGuide);
        else if (this.waitGuardButton?.disabled && holdGuide.distance < (holdGuide.marker.guideRadius || 8)) this.drawTargetFootRing(g, rt, hold);
        // 長押し中も、任務札の代わりに守る場所の旗を残す。
        if (!this.root.classList.contains('wait-guard-active') && this.openingActive && !this.opening?.flagGround) this.drawSingleDestination(g, rt, hold, holdGuide.marker);
        drew = true;
      }
    }
    if (this.openingActive && this.opening?.talkPerson?.alive) {
      drew = this.drawTalkPerson(g, rt, this.opening.talkPerson) || drew;
    }
    if (this.openingActive && this.opening?.flagGround) {
      const opening = this.opening, goal = opening.flagGround;
      const swipeHelp = opening.el.classList.contains('opening-controls');
      if (!opening.flagOffscreen) this.drawTargetFootRing(g, rt, goal, 1.25, false, true);
      if (opening.flagBounds && !swipeHelp) {
        this.drawGoalFlagFrame(g, opening.flagBounds, false, true);
        if (rt.missionGuide?.marker?.guideFlagFrame) this.drawTargetPointer(g, opening.flagBounds.left + opening.flagBounds.width / 2, opening.flagBounds.top - 8, '#fff3ba', !!rt.missionGuide?.marker?.guideFlagFrame);
      }
      // 始まりの下知と同じ場所の札を二枚にしない。
      if (swipeHelp && !opening.flagOffscreen) {
        // 実旗が見える時はその布に印を付け、始点から一本でつなぐ。
        const bounds = opening.flagBounds;
        let flagX, flagY;
        if (bounds) {
          flagX = bounds.left + bounds.width / 2;
          flagY = Math.max(100, bounds.top - 8);
          this.drawGoalFlagFrame(g, bounds, false, true);
          this.drawSmallGoalFlag(g, flagX, flagY, .8, false, false, '');
        } else {
          const flag = this.drawRaisedGoalFlag(g, rt, opening.flagX, opening.flagY, false, 1.15, '');
          flagX = flag.x; flagY = flag.y;
        }
        if (opening.linkStart && !rt.def.footFlagGuides)
          this.drawSwipeArrow(g, opening.linkStart.x, opening.linkStart.y, flagX, flagY, 32);
      } else if (!opening.flagBounds) this.drawSmallGoalFlag(g, opening.flagX, opening.flagY, rt.def.footFlagGuides ? .65 : 1.15, true, false, '');
      if (swipeHelp && opening.flagOffscreen && opening.linkStart && !rt.def.footFlagGuides)
        this.drawSwipeArrow(g, opening.linkStart.x, opening.linkStart.y, opening.flagX, opening.flagY, 32);
      if (opening.flagOffscreen && !swipeHelp) this.drawNavigationArrow(g, opening.flagX, opening.flagY + 12, opening.flagAngle, .65);
      const box = opening.flagLabel;
      if (box && !rt.def.footFlagGuides) this.drawGuideLink(g, opening.flagBounds ? opening.flagBounds.left + opening.flagBounds.width / 2 : opening.flagX,
        opening.flagBounds ? opening.flagBounds.top - 8 : opening.flagY - 24, box.left, box.top, box.right, box.bottom);
      drew = true;
    }
    if (rt.dodgeGuide?.valid && !rt.dodgeGuide.escapeArrow && rt.dodgeGuide.onScreen && !rt.over && !rt.choice &&
        !this.openingActive && !rt.player.camShot && !this.bigmap)
      drew = this.drawTargetFootRing(g, rt, rt.dodgeGuide.pos, rt.def.compactDodgeGuide || rt.def.dodgeDiamondSign ? .65 : 1.65) || drew;
    if (rt.dodgeGuide?.valid && !rt.dodgeGuide.escapeArrow && !rt.dodgeGuide.arrived && !this.openingActive &&
        !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !S.reduceGuidance) {
      const foot = this.project(rt.player.u.pos, rt.player.u.pos.y + .08, rt,
        this.dodgeFootProjection || (this.dodgeFootProjection = {}));
      // 線だけ描いた時も、次のコマで消す。空の扱いにすると軌跡が積み重なる。
      drew = this.drawDirectionChain(g, foot.behind ? W / 2 : foot.x, foot.behind ? H - 32 : foot.y,
        rt.dodgeGuide.markX, rt.dodgeGuide.markY, singleBattleGuide(rt) || !!rt.def.singleRetreatArrow, rt.def.retreatArrowLength) || drew;
    }
    if (rt.touchMoveGoal && rt.touchSwipeActive && !rt.missionGuide?.marker && !this.openingActive && !rt.dodgeGuide && !rt.over && !rt.choice &&
        !rt.player.camShot && !this.bigmap && !S.reduceGuidance) {
      const foot = this.project(rt.player.u.pos, rt.player.u.pos.y + .08, rt,
        this.swipeFootProjection || (this.swipeFootProjection = {}));
      const goal = this.project(rt.touchMoveGoal, rt.touchMoveGoal.y ?? groundAt(rt.world, rt.touchMoveGoal.x, rt.touchMoveGoal.z, rt.player.u.pos.y), rt,
        this.swipeGoalProjection || (this.swipeGoalProjection = {}));
      if (!foot.behind && !goal.behind) {
        // 画面外の行き先は端に収め、矢印だけを途中で切らない。
        const dx = goal.x - foot.x, dy = goal.y - foot.y;
        let scale = 1;
        if (dx > 0) scale = Math.min(scale, (W - 48 - foot.x) / dx);
        else if (dx < 0) scale = Math.min(scale, (48 - foot.x) / dx);
        if (dy > 0) scale = Math.min(scale, (H - 32 - foot.y) / dy);
        else if (dy < 0) scale = Math.min(scale, (100 - foot.y) / dy);
        if (scale > 0 && Math.hypot(dx, dy) * scale >= 40) {
          const x = foot.x + dx * scale, y = foot.y + dy * scale;
          this.drawSwipeArrow(g, foot.x, foot.y, x, y);
          this.drawMoveGoal(g, rt, x, y);
          drew = true;
        }
      }
    }
    // 自分の輪と頭上の印は、移動中も待機中も同じ形を保つ。
    const findingGoal = singleBattleGuide(rt) && !!holdGuide?.marker &&
      holdGuide.distance >= (holdGuide.marker.guideRadius || 8) && !this.defendEnemy && !this.attackGuideEnemy &&
      !S.reduceGuidance && !guidanceEnded(rt);
    if (!(rt.def.singlePassageArrow && this.placeFrameShown))
      drew = this.drawPlayerSign(g, rt) || drew;
    if (!rt.missionGuide?.marker?.guidePerson && !rt.guideEnemy?.alive && !this.defendEnemy?.alive && !this.attackGuideEnemy?.alive && !this.approachGuideEnemy?.alive && !findingGoal && !guidanceEnded(rt) && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.def.town && !rt.def.dojo && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && rt.player.fpK <= .5)
      drew = this.drawUnitContrast(g, rt, rt.player.u) || drew;
    for (const el of this.markerEls.values()) if (!S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('danger-notice') && !el.hidden && el.classList.contains('person-goal') && !el.classList.contains('edge') && el._tipX != null) {
      if (el._person?.alive) this.drawTargetFootRing(g, rt, el._person.pos);
      if (!el._talk) this.drawGuideLink(g, el._tipX, el._tipY, el._px - el._ow / 2, el._py - el._oh, el._px + el._ow / 2, el._py);
      drew = true;
    }
    // 札の枠が埋まっても、今話す相手の吹き出しは消さない。新しい札は増やさない。
    const talkGuide = rt.missionGuide?.objective === currentObjective(rt) && rt.missionGuide?.marker;
    const talkPerson = talkGuide?.guideTalk && talkGuide.guidePerson?.();
    if (talkPerson?.alive && !retreatRequired(rt) && !this.retreatGuide?.active && !S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !this.root.classList.contains('danger-notice') && (!this.root.classList.contains('talk-ready') || !$('prompt').classList.contains('talk-target'))) {
      drew = this.drawTalkGuide(g, rt, talkPerson) || drew;
    } else {
      if (talkPerson?.alive && this.root.classList.contains('talk-ready') && $('prompt').classList.contains('talk-target') &&
          !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !S.reduceGuidance &&
          !guidanceEnded(rt) && !retreatRequired(rt) && !this.retreatGuide?.active && this.talkPersonVisible(rt, talkPerson)) {
        const frame = this.measurePersonFrame(talkPerson, rt, true);
        if (frame) { this.drawTalkFocus(g, frame); drew = true; }
      }
      setClass($('objectives'), 'talk-order', false);
      setClass(this.root, 'talk-edge', false);
      setClass(this.root, 'talk-located', false);
    }
    // 構える相手の印と、自分の足元からの向きを同じ相手へそろえる。
    const cam = rt.camera.position;
    const zoom = 1;
    const namesPut = [];
    // 近い兵の候補は 0.1 秒に一度だけ選び直す（毎コマ全兵を回さない。遠い兵・倒れた兵・寝ている兵は外す）
    const P = rt.player;
    const incoming = this.guardThreat || (!this.waitGuardButton?.hidden && this.defendEnemy);
    let dangerSign = false;
    const missionGuard = rescueTarget(rt) || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
    setClass(this.root, 'guard-guide', false);
    setClass(this.root, 'melee-guide', false);
    const blockingEnemy = navigationEnemy(rt);
    let focus = this.attackGuideEnemy?.alive ? this.attackGuideEnemy : !this.guardAlly && this.defendEnemy?.alive ? this.defendEnemy : blockingEnemy || (P.lock?.alive ? P.lock : P.aimed?.alive ? P.aimed : null);
    const nowT = rt.t || 0;
    // 画面へ戻った兵だけは候補の選び直しを待たず、そのコマで札を戻す。
    let entered = false;
    for (const u of this.ovOffscreen || []) if (!u.offscreen) { entered = true; break; }
    if (!this.ovCand || this.ovRt !== rt || entered || nowT - this.ovAt >= 0.1 || nowT < this.ovAt) {
      this.ovRt = rt; this.ovAt = nowT; const cand = this.ovCand || (this.ovCand = []); cand.length = 0;
      const offscreen = this.ovOffscreen || (this.ovOffscreen = []); offscreen.length = 0;
      for (const u of rt.army.units) {
        if (u.offscreen) { offscreen.push(u); continue; }
        if (!u.alive || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
        if (Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) <= (u.team !== P.u.team || u.name && !u.isSub && u.type === 'busho' ? 56 : 30)) cand.push(u);
      }
      // 狙う相手を先にし、ほかは自分に近い兵から示す。
      const pos = P.u.pos;
      cand.sort((a, b) => a === focus ? -1 : b === focus ? 1 : a === this.guardAlly ? -1 : b === this.guardAlly ? 1 :
        (a.pos.x - pos.x) ** 2 + (a.pos.z - pos.z) ** 2 - (b.pos.x - pos.x) ** 2 - (b.pos.z - pos.z) ** 2);
    }
    // 到着して戦う時は、見える敵一人を頭上の印で示す。生きて見える間は印を移さない。
    const fightingTask = !!combatTask(rt) || /倒せ|たおせ|たおす|討ち取|崩せ|敵.*止め|敵.*押し返|引きつけ|引き付け|戦う/.test(taskText(rt, taskLabel(rt, currentObjective(rt)?.text || '')));
    const movingToFlag = !blockingEnemy && !this.defendEnemy && !!rt.missionGuide?.marker && /旗|組の列/.test(rt.missionGuide.label) &&
      rt.missionGuide.distance >= (rt.missionGuide.marker.guideRadius || 8) && !fightingTask;
    const objectiveEnemies = rt.def.objectiveEnemies?.(rt) || null;
    const retreating = !missionGuard && !blockingEnemy && !this.defendEnemy && !!rt.def.routeGuidePriority?.(rt) || !!rt.dodgeGuide || !!(this.coverEl && !this.coverEl.hidden) || retreatRequired(rt) ||
      !!(this.retreatGuide?.active && this.retreatGuide.valid) || rt.missionGuide?.marker?.guideArea === 'retreat';
    const approachingEntrance = !!rt.missionGuide?.marker?.entrance && !fightingTask;
    const inPlace = !!blockingEnemy || !!this.defendEnemy || !approachingEntrance && !movingToFlag && (!!missionGuard || fightingTask || !rt.missionGuide?.marker || rt.missionGuide.distance < 8);
    const canGuide = u => u?.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
      u.team !== P.u.team && !u.group?.hidden &&
      rt.def.enemyGuideAllowed?.(rt, u) !== false &&
      (u === blockingEnemy || u === this.defendEnemy || !objectiveEnemies?.length || objectiveEnemies.includes(u)) &&
      Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) < 18;
    const melee = P.weapon !== 'gun' && P.weapon !== 'bow';
    // 遠い敵は小さな囲みにせず、通れる向きを一本だけ示す。
    const canPoint = u => canGuide(u) && (!melee || objectiveEnemies?.includes(u) ||
      Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) <= 9) && (melee ? this.combatEnemyVisible(rt, u) : sightScreenUnit(rt, u));
    const previousEnemy = rt.guideEnemy;
    let hiddenEnemy = null;
    // 護衛中も、本人が狙っている敵の目印を主君の盾で消さない。
    const chosenEnemy = (focus === P.lock || focus === P.aimed) && canPoint(focus) ? focus : null;
    if ((!missionGuard || this.attackGuideEnemy || chosenEnemy) && !retreating && inPlace && (!this.guardAlly || this.attackGuideEnemy || chosenEnemy) && !rt.over && !P.camShot && !this.openingActive) {
      if (chosenEnemy) rt.guideEnemy = chosenEnemy;
      if (this.defendEnemy) rt.guideEnemy = canPoint(this.defendEnemy) ? this.defendEnemy : null;
      else if (canPoint(blockingEnemy)) rt.guideEnemy = blockingEnemy;
      if (!this.defendEnemy && !canPoint(rt.guideEnemy)) {
        rt.guideEnemy = null;
        for (const u of this.ovCand) if (canPoint(u)) { rt.guideEnemy = u; break; }
      }
      if (!this.defendEnemy && focus === P.lock && canPoint(focus)) rt.guideEnemy = focus;
      if (!rt.guideEnemy) hiddenEnemy = this.defendEnemy ? canGuide(this.defendEnemy) ? this.defendEnemy : null : canGuide(previousEnemy) ? previousEnemy : canGuide(focus) ? focus : null;
      if (!this.defendEnemy && !rt.guideEnemy && !hiddenEnemy) {
        for (const u of this.ovCand) if (canGuide(u) && sightUnit(rt, u) && (!u.isOfficer || enemyKnown(rt, u))) { hiddenEnemy = u; break; }
      }
      focus = rt.guideEnemy || hiddenEnemy || focus;
    } else { rt.guideEnemy = null; if (singleBattleGuide(rt)) focus = null; }
    // 一度示した敵が隠れたら、姿を囲まず通れる方向だけを示す。
    // 相手が隠れた時は、任務の道があればその戸口へ戻す。
    if (hiddenEnemy && rt.missionGuide?.marker && !this.defendEnemy) { hiddenEnemy = null; focus = rt.guideEnemy; }
    rt.guideEnemyDirection = !!hiddenEnemy;
    if (hiddenEnemy) {
      rt.guideEnemy = hiddenEnemy;
      const next = rt.world.def.guideWay?.(P.u, hiddenEnemy.pos) || hiddenEnemy.pos;
      this.drawOffscreenDirection(g, rt, next, 'enemy'); drew = true;
      setClass(this.root, 'melee-guide', melee);
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
    }
    // 迫る敵と攻撃相手の印を別々に描かず、選び終えた一人へそろえる。
    if (!focus && canPoint(incoming) && !retreating && !movingToFlag) focus = incoming;
    if (focus === incoming && focus?.alive && !rt.over && !rt.choice && !this.openingActive &&
        !P.camShot && !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) && !retreating &&
        sightScreenUnit(rt, focus)) {
      this.drawEnemyOutline(g, focus, rt, true);
      drew = true; dangerSign = true;
    }
    rt.guideEnemyShown = false;
    const quietBattle = !rt.def.town && !rt.def.dojo && !P.showSquad;
    let allySigns = 0, enemySigns = 0;
    const signSpots = this.signSpots || (this.signSpots = []); signSpots.length = 0;
    const protectedAlly = missionGuard || this.guardAlly;
    const measuredGuard = protectedAlly?.alive ? this.measurePersonFrame(protectedAlly, rt) : null;
    const guardFrame = measuredGuard ? Object.assign(this.guardSignFrame || (this.guardSignFrame = {}), measuredGuard) : null;
    this.hudRects();
    drew = this.drawNearbyTeamSigns(g, rt, this.ovCand) || drew;
    drew = this.drawPassageGuides(g, rt) || drew;
    for (const u of this.ovCand) {
      // 逃げる間は行き先一つだけを残し、敵味方の旗や刀を重ねない。
      if (rt.dodgeGuide || this.retreatGuide?.active && this.retreatGuide.valid || retreatRequired(rt)) continue;
      // 会話相手の名前は吹き出しと一組にし、通常の名札を重ねない。
      if (u === talkPerson && !S.reduceGuidance && !guidanceEnded(rt)) continue;
      // 普段の合戦では対象一人の囲みだけを残す。人数や戦い方は変えない。
      if (quietBattle && u !== focus) continue;
      // 小さな形だけを両軍六人まで。近い味方だけで敵の印を使い切らない。
      if (u !== focus && (u.team === P.u.team ? allySigns : enemySigns) >= 6) continue;
      // 守る相手は下で大きな盾だけを示し、ほかの印や名を重ねない。
      if ((retreating || this.root.classList.contains('wait-guard-active')) && u.team === P.u.team || u === this.guardAlly || u === missionGuard || u === hiddenEnemy) continue;
      // 普段の戦は選んだ敵一人だけ。組の詳しい表示では味方の印も残す。
      if (u.offscreen || !u.alive || u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      const knownGeneral = !!u.name && !u.isSub && u.type === 'busho';
      if (d > (u === focus && objectiveEnemies?.includes(u) ? 56 : knownGeneral ? 48 : 26) || !u.mesh.visible) continue;
      // 要る時だけ出す：敵は戦っている相手・狙っている相手、味方は傷ついた者（Alt で組を全部）
      // 敵の棒は、狙っている相手・自分に打ちかかる相手・すぐそばで打たれた相手だけ（遠くの斬り合いの棒が横一列に並ばないように）
      const fighting = P.lock === u || P.aimed === u || (u.target && u.target.isPlayer && d < 10) || (u.lastHitT < 3 && d < 7);
      // 味方の棒と名は、深手（六割を切った）の時だけ（乱戦で組の名が並ばないように。Alt で全部）
      const hurt = u.hp < u.maxHp * 0.6 && u.lastHitT < 10;
      // 武将（busho・名のある者）は、敵も味方も近ければ（18m 以内）いつも棒を出す（大将の傷み具合が戦の流れを決めるので）
      const showBar = !quietBattle && u.team === 0 && (hurt || (P.showSquad && u.isSub));
      // 組の者の名は、傷ついた時と Alt の時だけ（いつも出すと戦場が字だらけになる）
      // 名は名のある者だけ。名の無い侍・武将は狙った時と Alt の時だけ「侍」「武将」と出す（戦場を字で埋めない）
      let named = !quietBattle && u.team === 0 && d < 18 && !(u.isSub && !u.kerai && !hurt && !P.showSquad) && (u.name || ((u.type === 'samurai' || u.type === 'busho') && (P.lock === u || P.aimed === u || P.showSquad)));
      if (rt.def.singleEnemyPursuitSign && u === focus) named = false;
      // 最小のスマホ横：名は狙っている相手と、名のある武将（busho）だけ
      if (named && leanHud() && !(u.kerai || P.lock === u || P.aimed === u || (u.type === 'busho' && u.name))) named = false;
      // 遠目は家紋、中ほどは兜と顔、間近で名を読む。狙った相手の名は残す。
      if (knownGeneral && d >= 9 && P.lock !== u && P.aimed !== u) named = false;
      const crest = !quietBattle && u.team === 0 && knownGeneral && d >= 22 && d < 48;
      // 剣や盾は選んだ相手一人だけ。周りの兵には追加しない。
      const ally = u.team === P.u.team, missionEnemy = !!objectiveEnemies?.includes(u), selected = (!missionGuard || u === this.attackGuideEnemy || u === chosenEnemy) && !retreating && (!this.guardAlly || u === this.attackGuideEnemy || u === chosenEnemy) && u === focus && !movingToFlag;
      const teamSign = selected && !rt.over && !rt.def.town && !rt.def.dojo && !P.camShot && !this.openingActive &&
        !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) <= 22;
      if (!showBar && !named && !crest && !teamSign) continue;
      // 出す物が決まった者だけ、見えるか・画面のどこかを調べる（乱戦で何十人を毎コマ投影しない）
      if (knownGeneral && !enemyKnown(rt, u)) continue;
      if (knownGeneral && rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, u.pos)) continue;
      if (!(ally ? sightUnit(rt, u) : sightScreenUnit(rt, u))) continue;
      // 敵の札は実際の頭に合わせる。背丈や馬の高さで別の兵へずらさない。
      const head = !rt.def.positionPersonGuide && (selected || missionEnemy) && !ally && u.human?.root.visible && u.human.bones?.Head;
      if (head) { head.getWorldPosition(this.tmpV); this.tmpV.y += .35; }
      else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.3 : rt.def.bodyHeightGuides ? (u.bodyHeight ?? 1.72) + .3 : 2.35), u.pos.z);
      this.tmpV.project(rt.camera);
      const s = { x: (this.tmpV.x * .5 + .5) * W, y: (-this.tmpV.y * .5 + .5) * H, behind: this.tmpV.z > 1 || this.tmpV.z < -1 };
      if (s.behind || !selected && (s.x < 0 || s.x > W || s.y < 0 || s.y > H)) continue;
      // 札や指の丸の上には描かない（重ねて読めなくしない）
      const blocked = (this.rectsAll || []).some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 16 && s.y < r.bottom + 4);
      if (blocked && !named && !selected) continue;
      // 盾と本人の上には敵の印や名を重ねない。敵の人数や動きには触れない。
      if (!selected && guardFrame && s.x > guardFrame.left - 38 && s.x < guardFrame.right + 38 &&
          s.y > guardFrame.top - 100 && s.y < guardFrame.bottom + 16) continue;
      // 相手の形は札の枚数や頭上の空きに左右されず示す。言葉は任務の札一枚へまとめる。
      if (teamSign && (selected || !blocked && s.x >= 20 && s.x <= W - 20 && s.y >= 44 && s.y <= H - 24 &&
          !(this.rectsAll || []).some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 3 && s.y < r.bottom + 37))) {
        // 選んだ相手は頭上の大きな印と足元の輪で示す。
        const sx = s.x, sy = s.y - 16;
        let overlap = false;
        for (let i = 0; i < signSpots.length; i += 2) if (Math.abs(signSpots[i] - sx) < 24 && Math.abs(signSpots[i + 1] - sy) < 24) { overlap = true; break; }
        if (!selected && overlap) continue;
        signSpots.push(sx, sy);
        g.save(); g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
        if (!(dangerSign && u === incoming)) {
          if (ally) this.drawAllySign(g, sx, sy);
          else if (!ally && !selected) {
            this.drawEnemySign(g, sx, sy);
          }
        }
        if (ally) allySigns++; else enemySigns++;

        if (selected && !ally) {
          // 狙う一人の姿を空け、操作は既存の札へまとめる。
          if (rt.def.hidePlayerSign && !rt.def.hideDefenseArea && u === this.defendEnemy && !this.attackGuideEnemy && !this.approachGuideEnemy) {
            const area = this.defendArea || (this.defendArea = { x:0, y:0, z:0 });
            if (this.defendAreaEnemy !== u || this.defendAreaRt !== rt || !P.guard) {
              area.x = P.u.pos.x; area.y = P.u.pos.y; area.z = P.u.pos.z;
              this.defendAreaEnemy = u; this.defendAreaRt = rt;
            }
            this.drawDestinationArea(g, rt, area, 1.5, false, false, true);
          }
          // 守備中も敵の足元を示す。攻撃の押し方は向きが合ってから示す。
          if (!dangerSign || u !== incoming) this.drawEnemyOutline(g, u, rt, u === this.defendEnemy && !this.attackGuideEnemy);
          if (rt.lockRing) rt.lockRing.visible = false;
          if (rt.aimRing) rt.aimRing.visible = false;
          if (rt.reachRing) rt.reachRing.visible = false;
          setClass(this.root, 'melee-guide', P.weapon !== 'gun' && P.weapon !== 'bow');
          const body = this.enemyBodyRect || (this.enemyBodyRect = {});
          const frame = this.measurePersonFrame(u, rt);
          body.left = frame ? frame.left - 6 : s.x - 32;
          body.right = frame ? frame.right + 6 : s.x + 32;
          body.top = frame ? frame.top - 6 : s.y;
          body.bottom = frame ? frame.bottom + 6 : s.y + 74;
          guideRects.push(body);
          if (u === rt.guideEnemy && s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H) rt.guideEnemyShown = true;
        }
        g.restore(); drew = true;

      }
      if (crest) {
        const cx = s.x, cy = s.y - 12;
        if (namesPut.length >= 3 || namesPut.some((q) => Math.abs(q[0] - cx) < (q[2] + 24) / 2 + 12 && Math.abs(q[1] - cy) < 24)) continue;
        const gen = GENERALS[u.name.replace(/^.* /, '')];
        const mon = gen?.mon || FACTION[u.group?.faction]?.flag || (u.team === 0 ? rt.def.sides?.a?.mon : rt.def.sides?.b?.mon);
        if (!mon) continue;
        namesPut.push([cx, cy, 24]); drew = true;
        g.globalAlpha = Math.min(0.85, (48 - d) / 8);
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(cx - 13, cy - 13, 26, 26);
        g.drawImage(monIcon(mon), cx - 11, cy - 11, 22, 22);
        g.globalAlpha = 1;
        continue;
      }
      const k = Math.max(0.45, Math.min(1.2, 9 / d));
      const w = 34 * k, h = Math.max(3, 4 * k);
      const x = s.x / zoom - w / 2, y = s.y / zoom;
      // 戦わない者（逃げる町の者など：noTarget で打ちかからない）は、敵の赤でなく褪せた土色にする
      const civil = u.team !== 0 && u.noTarget && !(u.dmg > 0);
      const col = civil ? '#b3a58a' : u.team !== 0 ? (S.colorAssist ? '#ff9a1a' : '#d24a30') : u.isSub ? '#efe6cf' : (S.colorAssist ? '#4fc3f7' : '#4f7fca');
      const alpha = Math.min(1, (26 - d) / 6) * (u.lastHitT < 2 || u.team === 0 ? 1 : 0.7);
      g.globalAlpha = alpha;
      if (showBar && !blocked) {
        drew = true;
        // 敵は▼を添えた太い棒、味方は細い棒（色だけに頼らず形でも分ける）
        const hh = u.team !== 0 ? h : Math.max(2, h * 0.55);
        g.fillStyle = 'rgba(0,0,0,.7)';
        g.fillRect(x - 1, y - 1, w + 2, hh + 2);
        g.fillStyle = col;
        g.fillRect(x, y, w * (u.hp < u.maxHp * 0.35 ? 0.25 : 0.6), hh);
        if (u.team !== 0 && !named && !civil) { const cx = x + w / 2, ty = y - 3; g.beginPath(); g.moveTo(cx - 4, ty - 5); g.lineTo(cx + 4, ty - 5); g.lineTo(cx, ty); g.closePath(); g.fill(); }
        // 乱戦で敵味方が入り混じる時のため：本人に斬りかかっている敵だけ、足元に薄い赤の輪（色だけでなく形でも、いつでも出す）
        if (u.team !== 0 && !civil && fighting) {
          const fp = this.project(u.pos, u.pos.y + 0.05, rt);
          if (!fp.behind) {
            g.globalAlpha = alpha * 0.55;
            g.strokeStyle = S.colorAssist ? '#ff9a1a' : '#e2472c';
            g.lineWidth = 2;
            g.beginPath(); g.ellipse(fp.x, fp.y, 12 * k, 4 * k, 0, 0, Math.PI * 2); g.stroke();
            g.globalAlpha = alpha;
          }
        }
      }
      if (named) {
        // 名の字は 12px を下回らない（読めない字は置かない）
        g.font = `${Math.max(12, Math.round(11 * k * 1.1))}px "Shippori Mincho B1", serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)';
        const label = u.name || (u.type === 'busho' ? '武将' : '侍');
        // 先に書いた名と重なるなら書かない（字が重なって読めなくならないように）
        const lw = g.measureText(label).width, lx = s.x / zoom, ly = y - 3;
        // 任務の札に名の端が掛かった時も描かない。薄い字を透かして重ねない。
        if ((this.rectsAll || []).some((r) => lx + lw / 2 + 4 > r.left && lx - lw / 2 - 4 < r.right && ly + 4 > r.top && ly - 18 < r.bottom)) continue;
        if (namesPut.some((q) => Math.abs(q[0] - lx) < (q[2] + lw) / 2 + 12 && Math.abs(q[1] - ly) < 18)) continue;
        namesPut.push([lx, ly, lw]); drew = true;
        g.fillText(label, s.x / zoom + 1, y - 3 + 1);
        g.fillStyle = u.team !== 0 ? '#ffd0c4' : '#f3e6c4';
        g.fillText(label, s.x / zoom, y - 3);
      }
    }
    g.globalAlpha = 1;
    // 同じコマで選んだ相手を見て、待つ印と敵の印を重ねない。
    drew = this.drawGroundGuide(g, rt) || drew;
    drew = this.drawDefenseLine(g, rt) || drew;
    // 「この敵」の札は既存の任務一枚を移し、知らせの数を増やさない。
    const order = $('objectives');
    const enemyFrame = !rt.def.keepTaskPanel && !missionGuard && (!this.defendEnemy || this.attackGuideEnemy || this.approachGuideEnemy) && (!rt.def.keepGuardTaskLabel || !!this.attackGuideEnemy || !!this.approachGuideEnemy) && rt.guideEnemyShown && rt.guideEnemy?.alive && (!rt.def.keepTaskLabel || this.attackGuideEnemy === rt.guideEnemy || this.approachGuideEnemy === rt.guideEnemy || objectiveEnemies?.includes(rt.guideEnemy) || /この敵|この.*てき|敵.*止め|敵.*押し返|敵.*たお|敵.*倒/.test(taskText(rt, taskLabel(rt, currentObjective(rt)?.text || '')))) && !rt.def.town && !rt.def.dojo &&
      this.notices.sources[1].selected && !order.classList.contains('expand') ? this.measurePersonFrame(rt.guideEnemy, rt) : null;
    // 同じ敵を示す間は外して付け直さず、携帯の配置計算を増やさない。
    setClass(order, 'enemy-order', !!enemyFrame);
    if (enemyFrame) {
      const frame = enemyFrame;
      setClass(order, 'ground-order', true); setClass(order, 'travel-retreat', false);
      const key = this.objKey + '|' + this.actionLabel?.textContent + '|' + W + '|' + H;
      if (this.enemyOrderKey !== key) {
        this.enemyOrderKey = key;
        this.enemyOrderW = order.offsetWidth; this.enemyOrderH = order.offsetHeight;
      }
      const width = this.enemyOrderW, height = this.enemyOrderH;
      const left = Math.max(12, Math.min(W - width - 12, (isTouch ? W / 2 : frame.cx) - width / 2));
      const top = isTouch ? 12 : Math.max(12, Math.min(H - height - 12, frame.top - height - 66));
      setCssVar(order, '--ground-order-x', Math.round(left) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(top) + 'px');
    }
    const approach = this.approachGuideEnemy;
    const approachFrame = !rt.def.keepApproachTaskPanel && approach?.alive && this.notices.sources[1].selected && (!this.actionLabel?.hidden || !!combatTask(rt)) &&
      !order.classList.contains('expand') && !rt.over && !rt.choice && !this.openingActive && !P.camShot &&
      !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) ? this.measurePersonFrame(approach, rt) : null;
    if (approachFrame && !order.classList.contains('approach-order')) this.approachOrderKey = null;
    setClass(order, 'approach-order', !!approachFrame);
    if (approachFrame) {
      const key = this.objKey + '|' + this.actionLabel.textContent + '|' + W + '|' + H + '|接近';
      if (this.approachOrderKey !== key) {
        this.approachOrderKey = key;
        this.approachOrderW = order.offsetWidth; this.approachOrderH = order.offsetHeight;
      }
      const width = this.approachOrderW, height = this.approachOrderH;
      const goal = this.meleeApproachPoint(rt, approach);
      const foot = this.project(goal, goal.y + .08, rt, this.approachGoalProjection || (this.approachGoalProjection = {}));
      const rects = this.hudRects();
      let left = 16, top = 80, best = Infinity;
      const anchorX = foot.behind ? approachFrame.cx : foot.x;
      const anchorY = foot.behind ? approachFrame.bottom : foot.y;
      const bodies = this.goalBodyRects(rt);
      // 札は左右の端だけを候補にし、兵と既存の札を避ける。
      for (let i = 0; i < 8; i++) {
        const x = i % 2 ? 12 : W - width - 12;
        const y = 12 + Math.floor(i / 2) * Math.max(0, H - height - 24) / 3;
        let overlap = 0;
        for (const r of rects) {
          if (r === this.guideOrderRect || r === this.noticeRect) continue;
          overlap += Math.max(0, Math.min(x + width + 8, r.right) - Math.max(x - 8, r.left)) *
            Math.max(0, Math.min(y + height + 8, r.bottom) - Math.max(y - 8, r.top));
        }
        overlap += Math.max(0, Math.min(x + width + 12, approachFrame.right) - Math.max(x - 12, approachFrame.left)) *
          Math.max(0, Math.min(y + height + 12, approachFrame.bottom) - Math.max(y - 12, approachFrame.top));
        for (let j = 0; j < this.goalBodyCount; j += 4)
          overlap += Math.max(0, Math.min(x + width + 8, bodies[j + 2]) - Math.max(x - 8, bodies[j])) *
            Math.max(0, Math.min(y + height + 8, bodies[j + 3]) - Math.max(y - 8, bodies[j + 1]));
        if (!foot.behind && foot.x > x - 52 && foot.x < x + width + 52 && foot.y > y - 24 && foot.y < y + height + 24) overlap += 10000;
        const score = overlap * 100 + Math.hypot(x + width / 2 - anchorX, y + height / 2 - anchorY);
        if (score < best) { best = score; left = x; top = y; }
      }
      setCssVar(order, '--approach-order-x', Math.round(left) + 'px');
      setCssVar(order, '--approach-order-y', Math.round(top) + 'px');
      // 曲がり道では旗へ進む道筋も残す。
      const way = this.approachClear?.enemy === approach && this.approachClear.bend ? this.approachClear.way : null;
      if (way) {
        const playerFoot = this.project(P.u.pos, P.u.pos.y + .08, rt,
          this.approachPlayerProjection || (this.approachPlayerProjection = {}));
        const bend = this.project(way, groundAt(rt.world, way.x, way.z, P.u.pos.y) + .08, rt,
          this.approachBendProjection || (this.approachBendProjection = {}));
        if (!bend.behind && !playerFoot.behind)
          this.drawDirectionChain(g, playerFoot.x, playerFoot.y, bend.x, bend.y, true, rt.def.meleeApproachArrowLength ?? 72);
      }
      drew = true;
    }
    const guard = retreating ? null : missionGuard || (!rt.guideEnemyShown ? this.guardAlly : null);
    // 本人が見える間は輪郭と短い言葉、隠れた時だけ移動の矢印を示す。
    if (guard?.alive && rt.def.guardGuideAllowed?.(rt) !== false && !S.reduceGuidance && !rt.over && !rt.choice && !P.camShot &&
        !this.bigmap && !this.openingActive && !$('objectives').classList.contains('expand')) {
      const frame = this.measurePersonFrame(guard, rt, true);
      const s = this.project(guard.pos, guard.pos.y + (guard.mounted ? 3.3 : 2.35), rt);
      if (frame) { s.x = frame.cx; s.y = frame.top - 6; }
      const off = !frame || !sightScreenUnit(rt, guard) || s.behind || s.x < 28 || s.x > W - 28 || s.y < 48 || s.y >= H - 24;
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
      if (off) {
        const next = rt.world.def.guideWay?.(P.u, guard.pos) || guard.pos;
        rt.camera.getWorldDirection(this.tmpV);
        const angle = Math.atan2(next.x - P.u.pos.x, next.z - P.u.pos.z) - Math.atan2(this.tmpV.x, this.tmpV.z);
        s.x = Math.max(28, Math.min(W - 28, W / 2 - Math.sin(angle) * (W / 2 - 40)));
        s.y = Math.max(80, Math.min(H - 64, H / 2 - Math.cos(angle) * (H / 2 - 80)));
      }
      // 画面内は本人の頭上、画面外は端の矢印。盾と別の道案内を重ねない。
      const x = Math.max(64, Math.min(W - 64, s.x));
      const y = Math.max(112, Math.min(H - 64, s.y));
      g.save();
      if (off) {
        const angle = Math.atan2(s.y - H / 2, s.x - W / 2);
        this.drawNavigationArrow(g, x, y, angle, .65);
        if (rescueTarget(rt) === guard) this.drawTreatmentCross(g, x, y - 32);
        else this.drawGuardSign(g, x, y - 32);
      } else {
        this.drawPersonOutline(g, frame, true);
        if (rescueTarget(rt) === guard) this.drawTreatmentCross(g, s.x, s.y - 8);
        else {
          // 盾の先端を頭のすぐ上へ固定し、群れの上に浮かせない。
          g.save(); g.translate(frame.cx, frame.top - 3); g.scale(.7, .7);
          this.drawGuardSign(g, 0, 0); g.restore();
        }
      }
      if (this.notices.sources[1].selected) {
        const order = $('objectives');
        setClass(order, 'ground-order', true);
        setClass(order, 'linked-destination', true);
        setClass(order, 'travel-retreat', false);
        const key = order.textContent + ':' + W + ':' + H;
        if (this.guardOrderSizeKey !== key) {
          this.guardOrderSizeKey = key;
          this.guardOrderWidth = order.offsetWidth; this.guardOrderHeight = order.offsetHeight;
        }
        const width = this.guardOrderWidth, height = this.guardOrderHeight;
        const left = Math.max(12, Math.min(W - width - 12, off ? x < W / 2 ? x + 30 : x - width - 30 : s.x - width / 2));
        const top = Math.max(12, Math.min(H - height - 12, off ? y - height / 2 : s.y - 44 - height));
        setCssVar(order, '--ground-order-x', left + 'px');
        setCssVar(order, '--ground-order-y', top + 'px');
      }
      g.restore(); drew = true;
      setClass(this.root, 'guard-guide', true);
    }
    // 自分の組も、目に入る者だけ白い印で示す。
    if (rt.player.showSquad && !guard && !this.guardAlly) {
      g.font = '12px "Shippori Mincho B1", serif'; g.textAlign = 'center';
      for (const u of rt.squad) {
        if (u.offscreen || u === guard) continue;
        if (!sightUnit(rt, u)) continue;
        const s2 = this.project(u.pos, u.pos.y + 2.6, rt);
        if (s2.behind) continue;
        g.fillStyle = '#f1e9d6';
        // 組をまとめて見る時も、味方は共通の丸。
        g.beginPath(); g.arc(s2.x, s2.y - 3, 6, 0, Math.PI * 2);
        g.strokeStyle = '#14120f'; g.lineWidth = 3; g.stroke(); g.fill();
        if (u.name) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(u.name, s2.x + 1, s2.y - 10); g.fillStyle = '#f1e9d6'; g.fillText(u.name, s2.x, s2.y - 11); }
      }
    }
    // 組を向かわせた行き先は、戦場の地面に立てた本物の白い小旗と点線で示す（battle.js の updateDestMarks）
    // 一人称で雨の中にいる時だけ、画面（目の前）に雨粒が付いて、ゆっくり流れ落ちる。動きを減らす設定では出さない
    this.drawRainDrops(g, W, H, rt);
    this.drawBrim(g, W, H, rt);
    // 次のコマに消さずに済むか：組の印・雨粒・笠の縁も描いていない時だけ
    if (previousEnemyFrame !== !!this.enemyFrameShown) this.notices.sync();
    this.ovBlank = !drew && !rt.player.showSquad && !(this.drops && this.drops.length) && !((rt.player.fpK || 0) > 0.7);
  }

  // 一人称：画面の上の端に、かぶっている物の縁がうっすら見える（陣笠の縁・兜の眉庇）。上を向くほど大きく
  drawBrim(g, W, H, rt) {
    const P = rt.player, k = Math.max(0, ((P.fpK || 0) - 0.7) / 0.3);
    if (k <= 0 || !P.u.alive) return;
    const look = P.sightHat || 'jingasa';
    const kabuto = /kabuto/.test(look);
    const up = Math.max(0, Math.min(1, (P.pitch || 0) / 0.5));
    const h = H * (kabuto ? 0.045 : 0.035) * (1 + up * 1.6) * k;
    g.save();
    // 暗がりの勾配は、大きさ（整数の px）が変わった時だけ作り直す
    const bk = (kabuto ? 'k' : 'j') + Math.round(h) + ':' + W + ':' + H;
    if (!this.brimGr || this.brimGr.k !== bk || this.brimGr.g !== g) {
      const gr0 = g.createLinearGradient(0, 0, 0, h * 1.6);
      gr0.addColorStop(0, kabuto ? 'rgba(8,7,6,.82)' : 'rgba(20,16,12,.7)'); gr0.addColorStop(0.7, 'rgba(12,10,8,.35)'); gr0.addColorStop(1, 'rgba(12,10,8,0)');
      this.brimGr = { k: bk, g, gr: gr0 };
    }
    g.fillStyle = this.brimGr.gr;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
    // 縁は画面の両端で下がる弧（眉庇は真ん中が少し下がる）
    if (kabuto) { g.lineTo(W, h * 0.6); g.quadraticCurveTo(W / 2, h * 1.9, 0, h * 0.6); }
    else { g.lineTo(W, h * 1.5); g.quadraticCurveTo(W / 2, h * 0.2, 0, h * 1.5); }
    g.closePath(); g.fill();
    if (kabuto) {
      // 錣の端が左右にわずかに掛かる。向きを変えると、その先を見渡せる。
      g.fillStyle = 'rgba(8,7,6,.85)';
      const edge = W * 0.018 * k;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(edge, H * 0.2); g.quadraticCurveTo(edge * 0.3, H * 0.6, 0, H); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W, 0); g.lineTo(W - edge, H * 0.2); g.quadraticCurveTo(W - edge * 0.3, H * 0.6, W, H); g.closePath(); g.fill();
    }
    g.restore();
  }

  drawRainDrops(g, W, H, rt) {
    const P = rt.player, r = rt.world.rainLevel || 0;
    const on = !S.reduceMotion && (P.fpK || 0) > 0.6 && r > 0.3 && P.u.alive;
    const D = this.drops || (this.drops = []);
    const now = performance.now(), dt = Math.min(0.1, (now - (this.dropT || now)) / 1000); this.dropT = now;
    if (!on && !D.length) return;
    // 上を向くほど多く当たる
    if (on && Math.random() < dt * r * (6 + Math.max(0, P.pitch || 0) * 20) && D.length < 26) {
      D.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: 2 + Math.random() * Math.random() * 7, t: 0, life: 2.5 + Math.random() * 3, vy: 0, slide: Math.random() < 0.45 });
    }
    g.save();
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.t += dt;
      if (d.t > d.life || !on && d.t > 0.4) { D.splice(i, 1); continue; }
      // 大きい粒は重さで流れ落ち、筋を残す
      if (d.slide && d.r > 3.5) { d.vy = Math.min(90, d.vy + dt * 40 * (d.r / 5)); d.y += d.vy * dt; }
      const a = Math.min(1, d.t * 6) * (1 - d.t / d.life) * (on ? 1 : 0.4);
      g.globalAlpha = 0.5 * a;
      if (d.vy > 5) { g.strokeStyle = 'rgba(210,220,226,.35)'; g.lineWidth = d.r * 0.5; g.beginPath(); g.moveTo(d.x, d.y - Math.min(60, d.vy * 0.6)); g.lineTo(d.x, d.y); g.stroke(); }
      // 粒の絵は一枚だけ作って、大きさを変えて使い回す
      g.drawImage(dropSprite(), d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    g.restore();
    g.globalAlpha = 1;
  }

  toggleMap() {
    this.bigmap = !this.bigmap;
    if (this.bigmap) { this.bigC = null; this.bigUser = false; this.bigRange = null; }
    $('bigmap').hidden = !this.bigmap;
    const mh = $('maphint');
    mh.hidden = !this.bigmap;
    clearTimeout(this.mhT);
    if (this.bigmap) {
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      const rows = (this.rt?.allyMapRows || []).filter((r) => r.active && sightRef(this.rt, r, r));
      mh.innerHTML = `<div class="op" style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn" data-map-zoom="-200">地図を拡大する</button><button type="button" class="btn" data-map-zoom="200">地図を縮小する</button><button type="button" class="btn" id="map-close">地図を閉じる</button></div><details><summary style="min-height:44px;cursor:pointer">地図の印・操作・味方の名を見る</summary><div class="lg"><span>▲自分</span><span>●自分の組</span><span>■味方</span><span>▲敵</span><span>◇任務</span><span>本陣は本陣の旗</span></div><div class="lg std"><span>${STD_SVG.honjin}本陣</span><span>${STD_SVG.spear}槍・弓</span><span>${STD_SVG.gun}鉄砲</span><span>${STD_SVG.cavalry}騎馬</span></div><p>${lead ? '地図を押すと、号令先の隊がそこへ向かいます。' : '地図で戦場を見渡せます。'}下の顔の札で隊を選べます。</p>${rows.map((r) => `<p>${r.number}　${esc(r.name)}　${esc(r.action || '')}</p>`).join('')}</details><details><summary style="min-height:44px;cursor:pointer">小地図の広さを選ぶ</summary><div class="op" style="display:flex;flex-wrap:wrap;gap:8px">${[40,60,100].map((r) => `<button type="button" class="btn" data-map-range="${r}" aria-pressed="${(this.mmRange || 60) === r}">${destinationDistance(this.rt, r)}</button>`).join('')}</div></details>`;
      mh.querySelectorAll('button').forEach((b) => { b.style.minHeight = '44px'; b.onkeydown = (e) => { e.stopPropagation(); }; });
      mh.onclick = (e) => {
        e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mapZoom) this.zoomBigmap(+b.dataset.mapZoom);
        if (b.dataset.mapRange) { this.mmRange = +b.dataset.mapRange; mh.querySelectorAll('[data-map-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
        if (b.id === 'map-close') this.toggleMap();
      };
    }
  }

  cycleMinimap() {
    const ranges = [40, 60, 100];
    this.mmRange = ranges[(ranges.indexOf(this.mmRange || 60) + 1) % 3];
    this.flash(`小地図 ${destinationDistance(this.rt, this.mmRange)}`, 'dim');
  }
  zoomBigmap(dy) { this.bigUser = true; this.bigRange = Math.max(40, Math.min(180, (this.bigRange || 170) + dy * 0.1)); }
  // 戦術マップの中心と縮尺を、いま戦っている所（自分・両軍の隊・任務）に合わせる。ホイールで触ったらその縮尺を守る
  fitBigmap(rt) {
    const pts = [rt.player.u.pos];
    for (const g of rt.army.groups) if (g.count && !g.routed && sightRef(rt, g, g.center()) && g.units.some((u) => u.alive && u.type !== 'dummy')) pts.push(g.center());
    for (const m of rt.markers) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q && !m.intelHidden && (!(m.red || m.person) || sightRef(rt, m, q))) pts.push(q); }
    const P = rt.player.u.pos;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of pts) if (Math.hypot(q.x - P.x, q.z - P.z) < 220) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const tc = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    const tr = Math.max(45, Math.min(180, Math.max(x1 - x0, z1 - z0) / 2 * 1.3 + 12));
    // 急に跳ねないよう、少しずつ寄せる
    const c = this.bigC = this.bigC || tc;
    c.x += (tc.x - c.x) * 0.2; c.z += (tc.z - c.z) * 0.2;
    if (!this.bigUser) this.bigRange = (this.bigRange || tr) + (tr - (this.bigRange || tr)) * 0.2;
  }
  // 戦術マップ上の点を、戦場の位置に直す
  mapToWorld(cv, clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const Sz = cv.width;
    const px = (clientX - r.left) / r.width * Sz, py = (clientY - r.top) / r.height * Sz;
    const sc = Sz / 2 / (this.bigRange || 170);
    const c = this.bigC || { x: 0, z: 0 };
    return { x: c.x + (px - Sz / 2) / sc, z: c.z + (py - Sz / 2) / sc };
  }

  // 方角の帯（北東南西・任務・敵勢・自分の組）
  updateCompass(rt) {
    // 方位磁針は見た目が変わらない細かさで十分（毎コマでなく 20 回/秒ほどに絞る。重い戦ほど助かる）
    if (rt.t - (this._compassT || -1) < 0.05) return;
    this._compassT = rt.t;
    const el = $('compass');
    const p = rt.player;
    // clientWidth は描き直しを強いるので、二秒に一度だけ測る
    if (el._w === undefined || rt.t - el._wt > 2 || rt.t < el._wt) { el._w = el.clientWidth || 480; el._wt = rt.t; }
    const W = el._w;
    const items = [];
    const dirs = [['北', Math.PI], ['東', Math.PI / 2], ['南', 0], ['西', -Math.PI / 2]];
    for (const [t, a] of dirs) items.push({ a, html: `<b>${t}</b>`, cls: 'dir' });
    for (let k = 0; k < 8; k++) if (k % 2) items.push({ a: k * Math.PI / 4, html: '<i></i>', cls: 'tick' });
    const pu = p.u.pos;
    for (const m of rt.markers) {
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      const distance = destinationDistance(rt, d);
      items.push({ a: Math.atan2(q.x - pu.x, q.z - pu.z), d, hw: distance.length * 6 * (S.uiScale === 'l' ? 1.2 : 1) + 4, html: `<span>◆</span><small>${distance}</small>`, cls: m.red ? 'mk red' : 'mk' });
    }
    for (const g of rt.squadGroups) {
      if (!g.count) continue;
      const c = g.center();
      if (!sightRef(rt, g, c)) continue;
      if (Math.hypot(c.x - pu.x, c.z - pu.z) < 6) continue;
      items.push({ a: Math.atan2(c.x - pu.x, c.z - pu.z), html: '<span>●</span>', cls: 'mine' });
    }
    for (const it of items) {
      let rel = it.a - p.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      it.x = Math.abs(rel) > Math.PI / 2 ? null : W / 2 - (rel / (Math.PI / 2)) * (W / 2);
    }
    let html = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.x === null) continue;
      // 距離の札が重なる向きでは近い印だけを出す。字を大きくする設定も幅に含める。
      let crowded = false;
      if (it.d !== undefined) for (let j = 0; j < items.length; j++) {
        const other = items[j];
        if (other.x !== null && other.d !== undefined && (other.d < it.d || other.d === it.d && j < i) && Math.abs(other.x - it.x) < other.hw + it.hw) { crowded = true; break; }
      }
      if (crowded) continue;
      html += `<div class="c ${it.cls}" style="left:${it.x.toFixed(1)}px">${it.html}</div>`;
    }
    // 変わった時だけ書き換える
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }

  // 号令の輪
  // 選んでいる項目は金の塗り＋「▶」、号令先の隊がいま従っている号令は「今」の印、使えない項目は理由の字
  updateRadial(rt) {
    const el = $('radial');
    const p = rt.player;
    if (!p.radial) { el.hidden = true; this.radialKey = ''; return; }
    el.hidden = false;
    p.syncRadial();
    const gs = this.radialGroups || (this.radialGroups = []); gs.length = 0;
    if (rt.squad.length) for (const g of p.selectedGroups()) if (g.count > 0) gs.push(g);
    const cur = gs.length ? (gs[0].pending ? gs[0].pending.id : gs[0].focus ? 'focus' : gs[0].order) : '';
    const kinds = this.unitKinds || [];
    let tags = '';
    for (let i = 0; i < gs.length; i++) tags += (i ? ',' : '') + tagOf(gs[i]);
    const key = `${p.radialSel ?? ''}|${p.radialPreview ?? ''}|${p.selGroup ?? ''}|${cur}|${rt.G.rank ?? ''}|${RADIAL[3].id ?? ''}|${RADIAL[3].label ?? ''}|${kinds.join(',')}|${tags}`;
    if (key === this.radialKey) return;
    this.radialKey = key;
    const focus = el.contains(document.activeElement) ? document.activeElement : null;
    const focusItem = focus?.dataset.radial, focusTeam = focus?.dataset.radialTeam;
    // 早打ちのキーがある号令は、その鍵を添える（輪を開かなくても出せると覚えられる）
    const qk = { follow: K('follow'), hold: K('hold'), attack: K('attack'), retreat: K('retreat'), rally: K('rally') };
    if (!el.dataset.keys) {
      el.dataset.keys = '1';
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const pl = this.rt?.player; if (pl) { pl.radial = false; pl.radialKeyboard = false; pl.radialSel = -1; pl.tabT = null; } el.hidden = true; $('h-squad').focus({ preventScroll:true }); return; }
        const b = e.target.closest('[data-radial]');
        if (!b) { if (e.target.closest('[data-radial-team]')) e.stopPropagation(); return; }
        if (['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const items = el.querySelectorAll('[data-radial]');
          const i = (+b.dataset.radial + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 7 : 1)) % items.length;
          items[i].focus();
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
      });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-radial]'), team = e.target.closest('[data-radial-team]');
        e.stopPropagation();
        if (team) { this.pickGroup(team.dataset.radialTeam); return; }
        if (!b) return;
        if (b.getAttribute('aria-disabled') === 'true') { b.focus({ preventScroll: true }); b.querySelector('.why')?.setAttribute('role', 'status'); return; }
        const pl = this.rt?.player, item = RADIAL[+b.dataset.radial];
        if (!pl || !item) return;
        if (item.id === 'rally') pl.rally(); else pl.command(item.id);
        pl.radialSel = -1; pl.radial = false; pl.radialKeyboard = false; pl.tabT = null; el.hidden = true;
      });
    }
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', `号令の輪・${GROUP_NAME[p.selGroup] || '全隊'}`);
    el.innerHTML = RADIAL.map((it, i) => {
      const a = i * Math.PI / 4;
      const x = Math.sin(a) * 170, y = -Math.cos(a) * 170;
      const locked = it.min && rt.G.rank < it.min;
      const on = i === (p.radialPreview >= 0 ? p.radialPreview : p.radialSel);
      const now = !locked && it.id === cur;
      const why = locked ? `<small class="why">${esc((RANKS[it.min] || {}).name || '')}から</small>` : '';
      return `<div class="rw ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${now ? 'now' : ''}" role="menuitem" tabindex="0" data-radial="${i}" aria-disabled="${locked ? 'true' : 'false'}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${on ? '<span class="sel">▶</span>' : ''}${it.label}${now ? '<i class="nowm" title="いまの号令">今</i>' : ''}${it.min && rt.G.rank === it.min && !now ? '<i class="newm" title="この身分で増えた号令">新</i>' : ''}${qk[it.id] && !locked ? `<kbd>${esc(qk[it.id])}</kbd>` : ''}${why}</div>`;
    }).join('') +
      `<div class="rc"><strong style="display:block;font-size:max(13px, calc(13px * var(--text-scale, 1)))">号令先：${esc(GROUP_NAME[p.selGroup] || '全隊')}</strong>${p.radialSel >= 0 ? RADIAL[p.radialSel].label : (isTouch ? '指で叩いて<br>選ぶ<br><small>真ん中でやめる</small>' : 'マウスで選び<br>タブを放す<br><small>真ん中で放すとやめる</small>')}` +
      // 号令先の隊：札の並び（選んだ隊は金、数字キーでも選べる）
      (kinds.length > 1 ? `<div class="rg">${['all', ...kinds].map((k, i) => {
        const g = rt.squadGroups.find((x) => x.kind === k && x.count > 0);
        const sel = p.selGroup === k || (p.selGroup === 'all' && k === 'all');
        return `<button type="button" data-radial-team="${k}" class="${sel ? 'on' : ''}" aria-pressed="${sel}" style="min-height:44px;margin:4px">${k === 'all' ? '全隊' : KIND_WORD[k] || '組'}${g ? `<i style="background:${TAG_COL[tagOf(g)]}"></i><small>${tagOf(g) === 'ok' ? '数は十分' : tagOf(g) === 'mid' ? '数が減った' : tagOf(g) === 'gone' ? '隊が崩れた' : '半ばより多く失った'}</small>` : ''}<kbd>${i}</kbd></button>`;
      }).join('')}</div><small class="rgk">${isTouch ? '下の顔の札で号令先' : 'ジーか数字で号令先'}</small>` : '') + `</div>`;
    const teams = el.querySelector('.rg'); if (teams) el.appendChild(teams);
    if (focusItem !== undefined) el.querySelector(`[data-radial="${focusItem}"]`)?.focus({ preventScroll:true });
    else if (focusTeam) el.querySelector(`[data-radial-team="${focusTeam}"]`)?.focus({ preventScroll:true });
  }

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
    this.guideOrderRect = null; this.guardButtonRect = null;
    let squadRect = null;
    for (const sel of ['.hold-cover', '#wait-guard', '#wait-guard span', '#wait-guard small', '#sonae-cards', '#battle-notices', '#battle-log-entry', '#objectives', '#minimap', '#maphint', '.bl', '.tl .plaque', '.tl .next', '#toasts', '#armybar', '#compass', '#h-bottom', '#h-squad', '#tutorial', '#h-units', '#skiphint', '#boss', '#target', '#subtitle', '#bark', '#choice', '#banner.show', '#prompt']) {
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
    if (rt.def.groundFlagGuides && !marker.guideFlagFrame && !marker.guideFlagMesh) { this.goalFlagFoot = null; return null; }
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
      if (!sightPoint(rt, point, 170, true, 0)) return null;
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
    if (recovering(rt) || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive || this.defendEnemy?.alive || navigationEnemy(rt) || singleBattleGuide(rt) && rt.guideEnemy?.alive || this.root.classList.contains('wait-guard-active') || guidanceEnded(rt) || rt.dodgeGuide || this.guardAlly || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive || retreatRequired(rt)) {
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
      const pinned = m === main && (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H);
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
      const html = personGoal ? `${flagBounds && !off ? flagFrame : ''}${talk && !off ? '' : `<svg viewBox="0 0 48 56" aria-hidden="true"><g fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round">${m.guideTalk ? '<path d="M5 4H43V34H29L18 47V34H5Z"/><path d="M13 14H35M13 23H29" fill="none"/>' : '<circle cx="24" cy="10" r="8"/><path d="M12 37V26Q12 20 24 20Q36 20 36 26V37H30V44H36L24 54L12 44H18V37Z"/>'}</g></svg>`}<b${talkReady ? ' hidden' : ''}>${talkReady ? 'はなす' : esc(m.guidePersonLabel || (m.guideTalk ? 'この人に ちかづこう' : 'この人に 近づこう'))}</b>${off ? `<small>${behind ? `${right >= 0 ? '右' : '左'}へ振り向こう` : 'この方向へ'}</small>` : ''}` : flagGoal ? `<b>ここへ すすむ</b>${flagFrame}` : waitGoal ? `<b>${waitArrived ? '✓ ここで まつ' : 'ここへ'}</b><small>${esc(typeof m.waitGuide === 'function' ? m.waitGuide() : '')}</small>` : m === main && !rt.def.town && !rt.def.dojo ? `<span class="destination-chip"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 27V2H22L17 9L22 16H3" fill="#fff3ba" stroke="#14120f" stroke-width="2"/></svg>${esc(rt.def.namedGuideMarkers ? rt.def.travelGuideLabel?.(rt) || '旗へ すすめ' : '旗へ すすめ')}</span>` : off && m !== main && !largeWay ? '' : showLabel ? `${behind ? `<strong class="behind-label">${right >= 0 ? '右' : '左'}へ振り向く</strong>` : ''}<b>${m === main ? '◆ ' : ''}${s.behind && !behind ? '後ろ・' : ''}${esc(label.replace(/^[◇◆]\s*/, ''))}</b>${dist && (!lean || m === main || largeWay) ? `<small>${dist}${m === main && rt.missionGuide.floorHint ? '・' + esc(rt.missionGuide.floorHint) : ''}</small>` : ''}` : '';
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
        };
        const start = () => {
          const b = this.rt;
          if (!el.hidden && b?.player.u.alive && !b.over && !b.choice) {
            this.releaseWaitGuard?.(); this.coverHeldBattle = b;
            setAttr(el, 'aria-pressed', 'true');
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
    const p = rt.player.u.pos, rain = rt.army.rainEscape;
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
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        this.tmpV.set(q.x + Math.cos(angle) * 2, q.y + .1, q.z + Math.sin(angle) * 2).project(rt.camera);
        const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (this.tmpV.z < -1 || this.tmpV.z > 1 || x < 32 || x > VIEW.w - 32 || y < 88 || y > VIEW.h - 48) return false;
        if (obstacles.some(r => x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8)) return false;
      }
      this.tmpV.set(q.x, q.y + .1, q.z).project(rt.camera);
      const cx = (this.tmpV.x * .5 + .5) * VIEW.w, cy = (-this.tmpV.y * .5 + .5) * VIEW.h;
      if (cx < 120 || cx > VIEW.w - 120 || cy < 120 || cy > VIEW.h - 76) return false;
      if (obstacles.some(r => cx + 48 > r.left && cx - 48 < r.right && cy + 24 > r.top && cy - 70 < r.bottom)) return false;
      for (const u of rt.army.units) {
        if (u === rt.player.u || !u.alive || u.gone || u.isStruct) continue;
        this.tmpV.set(u.pos.x, u.pos.y, u.pos.z).project(rt.camera);
        const fx = (this.tmpV.x * .5 + .5) * VIEW.w, fy = (-this.tmpV.y * .5 + .5) * VIEW.h, behind = this.tmpV.z > 1 || this.tmpV.z < -1;
        this.tmpV.set(u.pos.x, u.pos.y + (u.mounted || u.type === 'cavalry' ? 3.2 : 2), u.pos.z).project(rt.camera);
        const hy = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (!behind && Math.abs(cx - fx) < Math.max(24, Math.abs(fy - hy) * .55) && cy > hy - 18 && cy < fy + 18) return false;
      }
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
      const end = this.project(cue.pos, cue.pos.y + .1, rt);
      obscured = !end.behind && end.x > 120 && end.x < VIEW.w - 120 && end.y > 120 && end.y < VIEW.h - 76 && !visible(cue.pos);
    }
    const threatened = !rain && same && sources.some(enemy => enemy.alive && Math.hypot(cue.pos.x - enemy.pos.x, cue.pos.z - enemy.pos.z) < 3);
    if (!rain && (!same || threatened || !unoccupied(cue.pos) || obscured || !safe(cue.pos) || !localClear(rt.army, p, cue.pos))) {
      cue.valid = false; cue.arrived = false;
      let best = -Infinity;
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
        let score = visible(point) ? 100 : 0, clear = true;
        for (const enemy of sources) {
          const d = Math.hypot(point.x - enemy.pos.x, point.z - enemy.pos.z);
          if (d < 3) clear = false;
          score += Math.min(30, d);
        }
        if (clear && score > best) { best = score; Object.assign(cue.pos, point); cue.valid = true; }
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
    const off = end.behind || end.x < 120 || end.x > W - 120 || end.y < 120 || end.y > H - 76 || covered || !this.floorGoalVisible(rt, cue.pos);
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
      direction = turning ? `${isTouch ? '画面を' : 'マウスを'}${turnRight ? '右' : '左'}へ ${isTouch ? 'なぞる' : '動かす'}` :
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
    const moveGesture = touchEscape && rt.def.dodgeMoveGesture !== false;
    // 指の絵がある時は、実際の操作を先に短く書く。
    const label = moveGesture ? rt.def.dodgeMoveCaption?.(rt, moveSide, !!rain) || `ここを ${moveSide}へ なぞる` : escapeArrow ?
      rt.def.escapePlaceLabel?.(rt, !!rain, dodgeSide) || `${dodgeSide}へ よける` : baseLabel;
    const fontSize = (H < 500 ? 18 : 24) * Math.max(1, S.textScale || 1);
    const cardHalf = Math.min((W - 24) / 2, label.length * fontSize / 2 + 48);
    let lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, x)), ly = Math.max(28, y - 82);
    const gesture = el.querySelector('.escape-gesture');
    setStyle(gesture, 'display', (showTurn && isTouch || moveGesture) ? '' : 'none');
    let gestureClear = true;
    if (showTurn && isTouch) {
      // 見回せる側に指の動きを置く。左右の入れ替えにも合わせる。
      let bestOverlap = Infinity;
      for (let i = 0; i < 3; i++) {
        const cx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, W * (S.touchSwap ? .20 : .80)));
        const cy = H - 100 - i * 24;
        if (cy - 80 < 44) continue;
        let overlap = 0;
        for (const r of obstacles) {
          if (!rt.def.dodgeAvoidNotices && (r === this.noticeRect || r === this.guideOrderRect)) continue;
          overlap += Math.max(0, Math.min(cx + cardHalf + 8, r.right) - Math.max(cx - cardHalf - 8, r.left)) *
            Math.max(0, Math.min(cy + 38, r.bottom) - Math.max(cy - 80, r.top));
        }
        if (overlap < bestOverlap) { bestOverlap = overlap; lx = cx; ly = cy - 64; }
      }
      gestureClear = bestOverlap === 0;
      if (!gestureClear) setStyle(gesture, 'display', 'none');
      gesture.setAttribute('transform', `translate(${lx} ${ly + 64})`);
      gesture.querySelector('.swipe-arrow').setAttribute('d', 'M0-12H88M74-24L88-12L74 0');
      gesture.querySelector('.swipe-arrow').setAttribute('transform', turnRight ? '' : 'scale(-1 1)');
      setCssVar(gesture, '--swipe-shift', turnRight ? '64px' : '-64px');
      setCssVar(gesture, '--swipe-rise', '0px');
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
    if (!off && !showTurn) {
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
    if (off && rt.def.dodgeAvoidNotices && !(showTurn && isTouch)) {
      const spot = this.avoidRects(lx, ly + 20, W, H, 'h', null, cardHalf + 8, 40, true);
      if (spot) { lx = spot[0]; ly = spot[1] - 20; }
      else gestureClear = false;
    }
    // 画面外では旗を端に残し、札だけをその隣へ置く。
    if (off && !showTurn) {
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12,
        x + (turnRight ? -1 : 1) * (64 + cardHalf)));
      const spot = this.avoidRects(lx, y - 20, W, H, 'v', null, cardHalf + 4, 40, true);
      gestureClear = !!spot;
      if (spot) ly = spot[1] - 20;
      // 札の空きがなくても、行き先の旗と方向は消さない。
    }
    if (escapeArrow && !moveGesture) {
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
      // 指は実際に歩く操作面へ置き、行き先の旗は元の位置に残す。
      const startX = W * (S.touchSwap ? .72 : .28), startY = Math.min(H - 128, Math.max(180, H * .68));
      lx = Math.max(cardHalf + 12, Math.min(W - cardHalf - 12, startX));
      ly = startY - 88;
      const angle = moveSide === '右上' ? -45 : moveSide === '右下' ? 45 : moveSide === '左上' ? -135 : moveSide === '左下' ? 135 :
        moveSide === '右' ? 0 : moveSide === '左' ? 180 : moveSide === '下' ? 90 : -90;
      gesture.setAttribute('transform', `translate(${startX} ${startY + 12})`);
      gesture.querySelector('.swipe-arrow').setAttribute('d', 'M0-12H48M36-22L48-12L36-2');
      gesture.querySelector('.swipe-arrow').setAttribute('transform', `translate(0 -12) rotate(${angle}) translate(0 12)`);
      setCssVar(gesture, '--swipe-shift', `${Math.cos(angle * Math.PI / 180) * 48}px`);
      setCssVar(gesture, '--swipe-rise', `${Math.sin(angle * Math.PI / 180) * 48}px`);
      gesture.lastElementChild.classList.add('swipe-hand');
      setStyle(gesture, 'display', '');
      gestureClear = true;
    }
    if (showTurn && isTouch && gestureClear && !rt.turnPractice && rt.def.pauseTurnPractice !== false) {
      rt.turnPractice = { active: true, done: false, swipe: 0 };
    }
    if (rt.turnPractice?.active && (!showTurn || !gestureClear)) {
      rt.turnPractice.active = false; rt.turnPractice.done = true;
    }
    setClass(this.root, 'dodge-turn-coach', showTurn && isTouch && gestureClear);
    el.querySelector('.escape-card').setAttribute('transform', `translate(${lx} ${ly})`);
    setStyle(el.querySelector('.escape-card'), 'display', !gestureClear ? 'none' : '');
    const card = el.querySelector('.escape-card rect');
    card.setAttribute('x', -cardHalf); card.setAttribute('width', cardHalf * 2);
    card.setAttribute('y', -20); card.setAttribute('height', 40);
    card.setAttribute('fill', '#14120f');
    el.querySelector('.escape-label').setAttribute('font-size', fontSize);
    setText(el.querySelector('.escape-label'), label);
    el.querySelector('.escape-label').setAttribute('x', off && !showTurn && !moveGesture ? turnRight ? '-12' : '12' : '0');
    const cardFlag = el.querySelector('.escape-card-flag');
    setStyle(cardFlag, 'display', 'none');
    // 回避先も一つの矢印だけ。見えている時は実際の床、画面外では端へ付ける。
    const turn = el.querySelector('.escape-turn');
    const destination = el.querySelector('.escape-destination');
    const compactEscape = !!rt.def.shortDodgeArrow;
    setStyle(destination, 'display', escapeArrow && !moveGesture ? 'none' : '');
    // 相手と退き先は、同じ太い輪と旗で見つけられるようにする。
    cardFlag.firstElementChild.setAttribute('d', 'M0-12H24L18-4L24 4H0Z');
    setStyle(cardFlag.lastElementChild, 'display', 'none');
    cardFlag.setAttribute('transform', `translate(${off && !showTurn && !turnRight ? cardHalf - 36 : -cardHalf + 16} 0) scale(.8)`);
    const flag = destination.children[1];
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
    setStyle(turn, 'display', moveGesture ? 'none' : escapeArrow ? '' : cue.arrived || !off && (rain || showTurn || !dodgeMarkClear) ? 'none' : '');
    turn.setAttribute('d', off ? 'M-8 18L-8-4L-18-4L0-24L18-4L8-4L8 18Z' : 'M-6-28H6V-14H14L0 0L-14-14H-6Z');
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const right = -cue.x * Math.cos(yaw) + cue.z * Math.sin(yaw);
    const forward = cue.x * Math.sin(yaw) + cue.z * Math.cos(yaw);
    turn.setAttribute('transform', `translate(${off ? x : x - 20} ${off ? y + 28 : y})${off ? ` rotate(${Math.atan2(right, forward) * 180 / Math.PI}) scale(.65)` : ''}`);
    const routeOutline = el.querySelector('.escape-route-outline');
    setStyle(routeOutline, 'display', escapeArrow && !moveGesture ? '' : 'none');
    routeOutline.setAttribute('stroke-width', compactEscape ? '5' : '13');
    if (escapeArrow && !moveGesture) {
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
    rt.dodgeGuide = cue;
    this.updateDodgeAction(rt, cue, el, dodgeSide, escapeArrow && isTouch && !showTurn);
    return cue;
  }

  // 札と矢印を押す実物にまとめる。移動速度・気力・当たり判定は通常の歩行のまま。
  updateDodgeAction(rt, cue, el, side, actionable) {
    if (!this.dodgeAction) {
      const ns = 'http://www.w3.org/2000/svg';
      const marks = this.dodgeMarks = document.createElementNS(ns, 'g');
      marks.setAttribute('aria-hidden', 'true');
      marks.innerHTML = '<defs><pattern id="dodge-hatch" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 10L10 0M8 12L12 8" stroke="#ffb49d" stroke-width="2"/></pattern></defs><path class="danger-floor" fill="url(#dodge-hatch)" stroke="#ffb49d" stroke-width="3"/><path class="danger-person" fill="none" stroke="#ffb49d" stroke-width="4" stroke-linejoin="round"/><path class="safe-floor" d="M0-12L22 0L0 12L-22 0Z M-8 0L-2 5L9-5" fill="#14120f" stroke="#fff3ba" stroke-width="3" stroke-linejoin="round"/>';
      el.insertBefore(marks, el.firstChild);
      const box = this.dodgeAction = document.createElementNS(ns, 'foreignObject');
      box.setAttribute('height', '64');
      const button = this.dodgeButton = document.createElement('button');
      button.type = 'button'; button.className = 'dodge-button';
      button.innerHTML = '<svg class="dodge-gesture" viewBox="-12 -22 112 112" aria-hidden="true"><circle cx="44" cy="34" r="32" fill="none" stroke="#14120f" stroke-width="11"/><circle cx="44" cy="34" r="32" fill="none" stroke="currentColor" stroke-width="5"/><g class="dodge-direction" stroke-linecap="round" stroke-linejoin="round"><path d="M44 4V-14M35-5L44-14L53-5" fill="none" stroke="#14120f" stroke-width="10"/><path d="M44 4V-14M35-5L44-14L53-5" fill="none" stroke="currentColor" stroke-width="5"/></g><text x="44" y="35" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="20">長押し</text></svg><span><b></b><small hidden></small></span>';
      this.dodgeHoldAxis = { x:0, y:0 };
      const release = this.releaseDodgeHold = () => {
        const input = touchInput();
        if (input?.axis === this.dodgeHoldAxis) input.axis = null;
        this.dodgeHeldBattle = null;
        this.dodgeDragActive = false;
        setAttr(button, 'aria-pressed', 'false');
      };
      const start = () => {
        const b = this.rt;
        if (b?.dodgeGuide?.valid && !b.dodgeGuide.arrived && !b.over && !b.choice && b.player.u.alive && box.style.display !== 'none') {
          this.releaseCoverHold?.(); this.releaseWaitGuard?.();
          this.dodgeHeldBattle = b;
          // 押している間に札が逃げないよう、位置と行き先を指を放すまで保つ。
          this.dodgeHoldX = b.dodgeGuide.cardX; this.dodgeHoldY = b.dodgeGuide.cardY;
          this.dodgeHoldGoal = this.dodgeHoldGoal || { x:0, y:0, z:0 };
          Object.assign(this.dodgeHoldGoal, b.dodgeGuide.pos);
          setAttr(button, 'aria-pressed', 'true');
        }
      };
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (e.button !== 0) return;
        start(); button.setPointerCapture(e.pointerId);
        this.dodgePointerX = e.clientX; this.dodgePointerY = e.clientY;
        this.dodgeDragActive = false;
      });
      button.addEventListener('pointermove', e => {
        if (!button.hasPointerCapture(e.pointerId) || !this.dodgeHeldBattle) return;
        e.preventDefault(); e.stopPropagation();
        const dx = e.clientX - this.dodgePointerX, dy = e.clientY - this.dodgePointerY;
        const length = Math.hypot(dx, dy);
        if (length < 8) return;
        this.dodgeDragActive = true;
        this.dodgeDragX = dx / length; this.dodgeDragY = dy / length;
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, e => { e.stopPropagation(); release(); });
      button.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } });
      button.addEventListener('keyup', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
      button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      button.addEventListener('blur', release); window.addEventListener('blur', release);
      box.appendChild(button); el.appendChild(box);
    }
    const box = this.dodgeAction, marks = this.dodgeMarks;
    setStyle(box, 'display', actionable ? '' : 'none');
    el.setAttribute('aria-hidden', actionable ? 'false' : 'true');
    if (!actionable && this.dodgeHeldBattle) this.releaseDodgeHold();
    if (actionable) {
      setStyle(el.querySelector('.escape-card'), 'display', 'none');
      setStyle(el.querySelector('.escape-turn'), 'display', 'none');
      setStyle(el.querySelector('.escape-gesture'), 'display', 'none');
      const half = Math.min((rt.def.dodgeActionHalfWidth ?? 132) * Math.max(1, S.textScale || 1), (VIEW.w - 24) / 2);
      // 指示は一つに絞り、文字を大きくした時も二行まで札の中へ収める。
      const height = Math.ceil(Math.max(96, rt.def.dodgeActionHeight || 0) * Math.max(1, S.textScale || 1));
      const halfHeight = height / 2;
      // 押す場所は左下に固定し、命の札との間を八つ以上あける。
      this.hudRects();
      const x = half + 12;
      const healthTop = this.healthRect?.top ?? VIEW.h - 76;
      const y = Math.max(halfHeight + 12, healthTop - 8 - halfHeight);
      cue.cardX = x; cue.cardY = y; cue.cardHalf = half;
      box.setAttribute('x', x - half); box.setAttribute('y', y - halfHeight); box.setAttribute('width', half * 2);
      box.setAttribute('height', height);
      setText(this.dodgeButton.querySelector('b'), rt.def.dodgeActionText || '長押しで矢印へ進む');
      const help = this.dodgeButton.querySelector('small');
      const helpText = rt.def.dodgeActionHelp?.(rt, cue) || '';
      help.hidden = !helpText;
      setText(help, helpText);
      this.dodgeButton.querySelector('.dodge-direction').setAttribute('transform', `rotate(${side === '右' ? 90 : side === '左' ? -90 : side === '後ろ' ? 180 : side === '右上' ? 45 : side === '左上' ? -45 : side === '右下' ? 135 : side === '左下' ? -135 : 0} 44 34)`);
    }
    const safe = marks.querySelector('.safe-floor');
    const goal = this.project(cue.pos, cue.pos.y + .1, rt, this.dodgeSafeProjection || (this.dodgeSafeProjection = {}));
    if (actionable) {
      // 操作の丸は固定したまま、本人から逃げ先への矢印も同じ画面に残す。
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt, this.dodgeArrowFoot || (this.dodgeArrowFoot = {}));
      const turn = el.querySelector('.escape-turn');
      let dx = goal.x - foot.x, dy = goal.y - foot.y;
      if (goal.behind) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const gx = cue.pos.x - p.x, gz = cue.pos.z - p.z;
        dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
        dy = -gx * Math.sin(yaw) - gz * Math.cos(yaw);
      }
      const length = Math.hypot(dx, dy);
      setStyle(turn, 'display', !foot.behind && length > 1 ? '' : 'none');
      turn.setAttribute('d', 'M0 0L-12-16H-5V-52H5V-16H12Z');
      turn.setAttribute('transform', `translate(${foot.x + dx / (length || 1) * 64} ${foot.y + dy / (length || 1) * 64}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90})`);
    }
    setStyle(safe, 'display', !goal.behind && goal.x > 24 && goal.x < VIEW.w - 24 && goal.y > 64 && goal.y < VIEW.h - 24 && this.floorGoalVisible(rt, cue.pos) ? '' : 'none');
    safe.setAttribute('transform', `translate(${goal.x} ${goal.y})`);
    let enemy = cue.source;
    if (cue.rain) {
      let nearest = Infinity;
      for (const volley of rt.army._rain?.volleys || []) {
        if (volley.t >= volley.T + .6 || volley.team === rt.player.u.team) continue;
        const distance = Math.hypot(rt.player.u.pos.x - volley.x, rt.player.u.pos.z - volley.z);
        if (distance < volley.r + 4 && distance < nearest) { nearest = distance; enemy = volley.owner; }
      }
    }
    const frame = enemy?.alive && this.combatEnemyVisible(rt, enemy) && this.measurePersonFrame(enemy, rt);
    const person = marks.querySelector('.danger-person');
    setStyle(person, 'display', frame ? '' : 'none');
    if (frame) {
      const l = frame.left - 6, r = frame.right + 6, t = frame.top - 6, b = frame.bottom + 6;
      person.setAttribute('d', `M${l+10} ${t}H${l}V${b}H${l+10}M${r-10} ${t}H${r}V${b}H${r-10}`);
    }
    // 射線のうち本人の近く、近接なら実際の武器の届く扇を床へ投影する。
    // 矢の雨は既存の落下範囲の斜線を使い、別の範囲を作らない。
    const area = marks.querySelector('.danger-floor');
    setStyle(area, 'display', 'none');
    if (!enemy?.alive || cue.rain) return;
    const attack = enemy.atk || enemy.swing;
    const ranged = enemy.type === 'bow' || enemy.type === 'gun' || attack?.ranged || attack?.bow;
    if (!ranged && (!attack || attack.target !== rt.player.u || attack.done)) return;
    const p = rt.player.u.pos, dx = p.x - enemy.pos.x, dz = p.z - enemy.pos.z, distance = Math.hypot(dx, dz) || 1;
    const ux = ranged ? dx / distance : Math.sin(enemy.heading), uz = ranged ? dz / distance : Math.cos(enemy.heading);
    const start = ranged ? Math.max(0, distance - 5) : .3, end = ranged ? distance + 1 : enemy.reach || 2;
    const point = this.dodgeDangerPoint || (this.dodgeDangerPoint = { x:0, y:0, z:0 });
    const screen = this.dodgeDangerProjection || (this.dodgeDangerProjection = {});
    let path = '';
    for (let i = 0; i < 4; i++) {
      const along = i < 2 ? start : end, across = (i === 0 || i === 3 ? -1 : 1) * (ranged ? .65 : along * .55);
      point.x = enemy.pos.x + ux * along - uz * across; point.z = enemy.pos.z + uz * along + ux * across;
      point.y = groundAt(rt.world, point.x, point.z, p.y);
      if (!this.floorGoalVisible(rt, point, false)) return;
      this.project(point, point.y + .08, rt, screen);
      if (screen.behind) return;
      path += `${i ? 'L' : 'M'}${screen.x} ${screen.y}`;
    }
    area.setAttribute('d', path + 'Z'); setStyle(area, 'display', '');
  }

  combatEnemyVisible(rt, enemy) {
    if (!sightScreenUnit(rt, enemy)) return false;
    const cache = this.combatSightCache || (this.combatSightCache = new WeakMap());
    let c = cache.get(enemy);
    if (!c) { c = { rt: null, at: -1, seen: false }; cache.set(enemy, c); }
    if (c.rt === rt && rt.t >= c.at && rt.t - c.at < .1) return c.seen;
    c.rt = rt; c.at = rt.t; c.seen = false;
    const a = rt.camera.position, b = enemy.pos;
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 < .01) return c.seen = true;
    // 頭と胴のどちらかが見える相手を使う。自分の背は除く。
    for (let i = 0; i < 2; i++) {
      const height = enemy.mounted ? (i ? 1.6 : 2.4) : i ? .8 : 1.6;
      if (!sightPoint(rt, b, 170, true, height)) continue;
      const by = b.y + height;
      let blocked = false;
      for (const u of rt.army.units) {
        if (u === enemy || u === rt.player.u || !u.alive || u.gone || u.isStruct || u.mesh?.visible === false) continue;
        const t = ((u.pos.x - a.x) * dx + (u.pos.z - a.z) * dz) / d2;
        if (t <= 0 || t >= 1) continue;
        const ex = a.x + dx * t - u.pos.x, ez = a.z + dz * t - u.pos.z;
        const y = a.y + (by - a.y) * t - u.pos.y;
        if (ex * ex + ez * ez < (u.mounted ? .65 : .32) ** 2 && y > .35 && y < (u.mounted ? 2.7 : 1.9)) {
          blocked = true; break;
        }
      }
      if (!blocked) return c.seen = true;
    }
    return false;
  }

  updateThreats(rt) {
    setClass($('objectives'), 'immediate-action', false);
    // 防いだ実際の一撃だけを反撃の合図にする。同じ合図は八秒あける。
    const hit = rt.player.lastHit;
    if (hit && !hit.ranged && !hit.guardBroken && (hit.blocked || hit.guard && rt.player.counterT > 0) &&
        rt.t - hit.t < .25 && hit.t !== this.counterPromptHit && rt.t - (this.counterPromptAt ?? -Infinity) >= 8) {
      this.counterPromptHit = hit.t; this.counterPromptAt = rt.t;
      this.counterPromptUntil = rt.t + (rt.player.counterT > 0 ? rt.player.counterT : .9);
      this.counterPromptEnemy = hit.source;
    }
    const counter = this.counterPromptEnemy;
    this.counterGuideEnemy = isTouch && rt.t < this.counterPromptUntil && counter?.alive &&
      !rt.player.pending && rt.player.sta > 0 && rt.player.guardBroken <= 0 &&
      Math.hypot(counter.pos.x - rt.player.u.pos.x, counter.pos.z - rt.player.u.pos.z) <= rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') ? counter : null;
    if (!guidanceEnded(rt) && !this.openingActive && rainDanger(rt.army)) {
      if (this.retreatGuide) this.retreatGuide.active = false;
      if (this.coverEl) this.coverEl.hidden = true;
      this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = this.guardThreat = null;
      for (const el of this.threatEls) el.hidden = true;
      setClass($('objectives'), 'turn-coach', false);
      if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
      setHidden($('boss'), true); setHidden($('target'), true);
      setClass(this.root, 'guard-button-help', false);
      // 矢の危険中は落下範囲からの回避だけを先に示す。近接の敵一覧は、この分岐の後で集める。
      if (rt.army.rainEscape) this.showDodge(rt, null);
      else {
        rt.dodgeGuide = null;
        setClass(this.root, 'dodge-active', false);
        setClass(this.root, 'dodge-turn-coach', false);
        if (rt.dodgeRing) rt.dodgeRing.visible = false;
        if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
      }
      return;
    }
    const treatmentNeeded = !rt.def.town && !rt.def.dojo && (rt.def.treatmentGuideNeeded?.(rt) ??
      (rt.player.treatmentLeft > 0 && (rt.player.u.wounds?.bleed > 0.0001 || rt.player.u.hp < rt.player.u.maxHp * .6)));
    const nearWarning = rt.def.nearThreatWarning || rt.def.key === 'okehazama' || rt.def.key === 'moribe';
    // 指定した戦の移動中は、周囲の空き地より任務の退き口を優先する。矢の落下範囲の警告は上で残す。
    if (recovering(rt) || rt.def.routeGuidePriority?.(rt) && !woundRetreat(rt) && !navigationEnemy(rt) && !rt.army.rainEscape || (!retreatRequired(rt) && !rescueTarget(rt) && !treatmentNeeded && !nearWarning && !rt.def.attackWarningDelay && !rt.def.rangedWarning && !rt.army.rainEscape && !this.root.classList.contains('compact-battle')) || guidanceEnded(rt) || this.openingActive) {
      rt.dodgeGuide = null;
      setClass(this.root, 'dodge-active', false);
      setClass(this.root, 'dodge-turn-coach', false);
      if (rt.dodgeRing) rt.dodgeRing.visible = false;
      if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
      this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = this.guardThreat = null;
      if (this.retreatGuide) this.retreatGuide.active = false;
      setClass(this.root, 'guard-button-help', false);
      if (this.coverEl) this.coverEl.hidden = true;
      for (const el of this.threatEls) el.hidden = true;
      setClass($('objectives'), 'turn-coach', false);
      if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
      return;
    }
    if (this.threatAt > rt.t) return;
    this.threatAt = rt.t + 0.1;
    const hadGuardWait = !!this.guardWait?.active;
    if (this.guardWait) this.guardWait.active = false;
    if (this.retreatGuide) this.retreatGuide.active = false;
    setClass(this.root, 'guard-button-help', false);
    if (rt.dodgeRing) rt.dodgeRing.visible = false;
    rt.dodgeGuide = null;
    setClass(this.root, 'dodge-active', false);
    setClass(this.root, 'dodge-turn-coach', false);
    if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
    this.guardThreat = null;
    const previousDefender = this.defendEnemy;
    let retainedMelee = null;
    this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = null;
    if (this.coverEl) this.coverEl.hidden = true;
    const p = rt.player.u, W = VIEW.w, H = VIEW.h;
    const viewYaw = rt.player.yaw + (rt.def.rearThreatFrame ? rt.player.camYawOff || 0 : 0);
    const sources = this.threatSources || (this.threatSources = []), distances = this.threatDistances || (this.threatDistances = []);
    const directions = this.threatDirections || (this.threatDirections = []);
    sources.length = 0; distances.length = 0; directions.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.team === p.team || u.fleeing || u.woundOut || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' || u.playerOpeningBlocked) continue;
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      const aimed = u.target === p || u.atk?.target === p || u.swing?.target === p;
      let flying = false;
      for (const a of rt.army.arrows || []) if (a.owner === u && !a.stuck && a.life > 0) {
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
        const dot = dx * a.vel.x + dz * a.vel.z;
        const miss = Math.abs(dx * a.vel.z - dz * a.vel.x) / (Math.hypot(a.vel.x, a.vel.z) || 1);
        if (dot > 0 && miss < 3 && Math.hypot(dx, dz) < 35) { flying = true; break; }
      }
      const ranged = flying || !!(u.atk?.bow || u.atk?.ranged) || !u.sidearm && (u.type === 'bow' || u.type === 'gun') && d > 4;
      // 狭間から撃てる射線は壁の単純判定で消さない。発射前に射手側で確かめた予告を使う。
      const called = ranged && u.shotWarnUntil > rt.army.time && d < 90;
      // 指定した戦では、玉込め中の狙い先だけで矢玉の札を出し続けない。
      if (ranged && rt.def.rangedThreatNeedsShot && !called && !flying && !(aimed && u.atk?.bow)) continue;
      if (!ranged && !nearWarning && !rt.def.attackWarningDelay && !this.root.classList.contains('compact-battle')) continue;
      // 指定した戦の近接警告だけ、届かない距離や別の段の兵を除く。矢玉の予告は残す。
      if (!ranged && (d > (rt.def.meleeThreatRange ?? 12) ||
        Math.abs(u.pos.y - p.pos.y) > (rt.def.meleeThreatHeight ?? Infinity))) continue;
      const close = (nearWarning || this.root.classList.contains('compact-battle')) && d < (rt.def.nearThreatRange ?? 12);
      if (!called && !flying && ((!close && !aimed) || d > (ranged ? 90 : 12) || rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos))) continue;
      // 壁越し・画面外の敵には向きを教えず、通れる道の案内を残す。
      if (!ranged && !this.combatEnemyVisible(rt, u)) continue;
      if (!ranged && u.atk?.target === p && u.atk.t > 0 && sightScreenUnit(rt, u) &&
          (!this.guardThreat || d < Math.hypot(this.guardThreat.pos.x - p.pos.x, this.guardThreat.pos.z - p.pos.z))) this.guardThreat = u;
      // 近さが入れ替わっても、生きて見える同じ相手を案内する。射撃の警告は優先する。
      if (u === previousDefender && !ranged && sightScreenUnit(rt, u)) retainedMelee = u;
      const score = flying ? Math.min(d, 6) : d;
      const angle = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const direction = Math.cos(angle) > .5 ? 0 : Math.cos(angle) < -.5 ? 1 : Math.sin(angle) > 0 ? 2 : 3;
      // 同じ向きは一枚にまとめ、一番近い危険を残す。
      const duplicate = directions.indexOf(direction);
      if (duplicate >= 0) {
        if (distances[duplicate] <= score) continue;
        sources.splice(duplicate, 1); distances.splice(duplicate, 1); directions.splice(duplicate, 1);
      }
      let at = 0; while (at < sources.length && distances[at] <= score) at++;
      if (at >= 3) continue;
      for (let i = Math.min(2, sources.length); i > at; i--) { sources[i] = sources[i - 1]; distances[i] = distances[i - 1]; directions[i] = directions[i - 1]; }
      sources[at] = u; distances[at] = score; directions[at] = direction;
    }
    // 任務・語り・相手の場面の札も数え、方角の札を合わせて三枚まで。
    const target = $('target');
    const oke = rt.def.key === 'okehazama';
    if (treatmentNeeded) this.retreatDestination(rt, sources[0], true);
    if (this.root.classList.contains('compact-battle') || retreatRequired(rt) || treatmentNeeded || rescueTarget(rt)) {
      // 別々の方向札を作らず、今の行動を任務と同じ一枚で伝える。
      const nearest = sources[0];
      const rangedFirst = nearest && (!nearest.sidearm && (nearest.type === 'bow' || nearest.type === 'gun') || nearest.atk?.bow || nearest.atk?.ranged);
      const counterVisible = this.counterGuideEnemy && this.combatEnemyVisible(rt, this.counterGuideEnemy);
      // 遠い相手に固定せず、間合いに入った見える敵へ渡す。
      const retain = retainedMelee && (!nearest || Math.hypot(retainedMelee.pos.x - p.pos.x, retainedMelee.pos.z - p.pos.z) <= distances[0] + 1);
      const u = (counterVisible && this.counterGuideEnemy) || (!rangedFirst && this.guardThreat) || (!rangedFirst && retain && retainedMelee) || nearest;
      const ranged = u && (!u.sidearm && (u.type === 'bow' || u.type === 'gun') || u.atk?.bow || u.atk?.ranged);
      const angle = u ? Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw : 0;
      const coverHelp = rt.def.key === 'honnoji' && rt.t < (rt.flags.coverHelpUntil || 0);
      const cover = coverHelp ? coverGuide(rt, rt.flags.coverSources || sources) : ranged ? coverGuide(rt, sources) : null;
      const coverReached = !!cover && Math.hypot(cover.x - p.pos.x, cover.z - p.pos.z) < .8;
      const dodge = !cover && (!woundRetreat(rt) && ranged || rt.army.rainEscape) ? this.showDodge(rt, ranged ? u : null) : null;
      // 目に見えて近くで戦う仲間を一人だけ示す。選んだ相手は生存・距離・見通しが保たれる間は替えない。
      const rescue = rescueTarget(rt);
      const meleeAllowed = rt.def.meleeGuide?.(rt, u) !== false;
      const missionGuard = rescue || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
      let guard = missionGuard || this.lastGuardAlly;
      const guardOrder = !!missionGuard || /仲間.*守れ|組のそばで受け/.test(taskLabel(rt, currentObjective(rt)?.text || ''));
      const canGuard = (a) => {
        if (a && a === rescue) return true;
        if (!a || a === p || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct ||
            a.type === 'dummy' || a.type === 'porter' || a.invuln && !a.name ||
            a.team !== p.team || Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) >= (a === this.lastGuardAlly ? 24 : 12) ||
            (!u && !guardOrder) || (!guardOrder && u && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) >= 10) || !sightUnit(rt, a)) return false;
        // 足元だけ見える仲間を選ばない。兜・足・頭上の札まで携帯の中へ収める。
        if (!missionGuard && !guardOrder) {
          for (let i = 0; i < 4; i++) {
            const radius = a.mounted ? 1.4 : .65;
            this.tmpV.set(a.pos.x + (i & 1 ? radius : -radius), a.pos.y + (i & 2 ? a.mounted ? 3.3 : 2.35 : 0), a.pos.z).project(rt.camera);
            const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
            if (this.tmpV.z < -1 || this.tmpV.z > 1 || x < 120 || x > W - 120 || y < 112 || y > H - 48) return false;
          }
        }
        return true;
      };
      const objective = currentObjective(rt);
      const movingOrder = !guardOrder && /旗|進め|向か|続け/.test(taskText(rt, objective?.text || ''));
      const guardAllowed = rt.def.guardGuideAllowed?.(rt) !== false &&
        (!!rescue || meleeAllowed && !movingOrder && (guardOrder || !rt.missionGuide?.marker) && !rt.nearestInteract());
      if (!guardAllowed) guard = null;
      if (guardAllowed && !canGuard(guard)) {
        guard = null; let best = Infinity;
        if (!missionGuard && (u || guardOrder) && !ranged) for (const a of rt.army.units) {
          if (!canGuard(a)) continue;
          const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
          if (d < best) { best = d; guard = a; }
        }
      }
      // 守る人が近くても、届く敵のすきには攻撃する相手を示す。
      const opening = u && !ranged && !this.guardThreat && !u.fleeing && !u.woundOut &&
        Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') &&
        this.combatEnemyVisible(rt, u) && (rt.def.attackOpening ? rt.def.attackOpening(rt, u) : !u.atk && (!u.swing || u.swing.done));
      if (!rescue && meleeAllowed && opening) guard = null;
      this.lastGuardAlly = guard;
      if (dodge && this.retreatGuide) this.retreatGuide.active = false;
      const urgentRetreat = retreatRequired(rt);
      const retreatNeeded = !dodge && (urgentRetreat || treatmentNeeded || p.hp < p.maxHp * .3 || p.mobbed || rt.player.sta < 20 || rt.missionGuide?.marker?.guideArea === 'retreat');
      let retreat = retreatNeeded ? this.retreatDestination(rt, u,
        rt.missionGuide?.marker?.guideArea !== 'retreat' && treatmentNeeded && (!urgentRetreat || woundRetreat(rt) || rt.def.preferTreatmentRetreat?.(rt))) : null;
      // 手当てできる陰が見つからなくても、歩ける退き先の矢印を残す。
      if (!retreat && retreatNeeded && woundRetreat(rt)) retreat = this.retreatDestination(rt, u);
      const retreatReached = retreat && Math.hypot(retreat.x - p.pos.x, retreat.z - p.pos.z) < retreat.radius;
      let action = dodge ? '' :
        retreat?.treatment ? treatmentGuideText(rt, retreat) :
        urgentRetreat ? retreatGuideText(rt, retreatReached, 'こっちへ にげる') :
        retreatNeeded ? treatmentNeeded ? treatmentGuideText(rt, retreat) :
          retreatGuideText(rt, retreatReached, 'こっちへ にげる') :
        cover ? coverReached ? '' : rt.coverGuide.label : ranged ? rt.def.compactGunAction || `${u?.type === 'gun' ? '鉄砲' : '矢'}！ 柱や壁のうしろへ` :
        guard ? rescue ? 'この人を助けよう' : rt.def.guardLabel?.(rt, guard) || 'この人を守れ' : u && meleeAllowed ? '敵へ向いて かまえる' : '';
      this.guardAlly = !dodge && !retreatNeeded && !cover && !ranged ? guard : null;
      const meleeHelp = !!u && !ranged && action === '敵へ向いて かまえる' && rt.player.weapon !== 'bow' && rt.player.weapon !== 'gun';
      // 届かない相手には前進を教える。本人への打ち込み中は防ぐ案内を優先する。
      const reach = meleeHelp ? rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') : 0;
      const approachHelp = meleeHelp && !this.guardThreat &&
        Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > reach;
      this.approachGuideEnemy = approachHelp ? u : null;
      const attackHelp = meleeHelp && !approachHelp && (this.counterGuideEnemy === u ||
        (rt.def.attackOpening ? rt.def.attackOpening(rt, u) : !this.guardThreat && !u.atk && (!u.swing || u.swing.done)));
      this.attackGuideEnemy = attackHelp ? u : null;
      const guardHelp = meleeHelp && !attackHelp && !approachHelp;
      if (meleeHelp) {
        this.defendEnemy = u;
        const facing = Math.cos(Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - rt.player.yaw);
        this.guardFacing = facing > (this.guardFacing ? .85 : .94);
        action = approachHelp ? (typeof rt.def.meleeApproachText === 'function' ? rt.def.meleeApproachText(rt) : rt.def.meleeApproachText) || 'はたへ すすもう' : !this.guardFacing ? isTouch ? rt.def.meleeTurnText || `${Math.sin(angle) <= 0 ? '右' : '左'}へ なぞる` : rt.player.weapon === 'spear' ? '敵にやりを向けよう' : '敵へ向こう' :
          attackHelp ? isTouch ? attackOperation(rt) : rt.player.chargeT > .7 ? `はなして ${rt.player.weapon === 'sword' ? 'きる' : 'つく'}` : rt.player.charging ? '輪が満ちるまで 長押し' : '左クリックを長押し → はなす' :
          rt.player.guard ? isTouch ? this.waitGuardHeldBattle === rt ? '押したまま ふせぐ' : rt.def.guardWaitText || 'この中で まもれ' : rt.def.guardWaitText || (S.guardToggle ? '構えたまま ふせぐ' : '右クリックを押したまま') :
          isTouch ? rt.def.guardStartText || 'この中で まもれ' : S.guardToggle ? '右クリックを一度押す' : '右クリックを押し続ける';
        if (!isTouch && rt.teachOn && !rt.teachOn() && /クリック|押|なぞ/.test(action)) action = !this.guardFacing ? '敵へ むこう' : attackHelp ? 'たたけ' : 'ふせぐ';
        setClass(this.root, 'guard-button-help', guardHelp && isTouch && this.guardFacing && !rt.player.guard);
      } else {
        this.guardFacing = false;
      }
      const turnCoach = isTouch && meleeHelp && !approachHelp && !this.guardFacing;
      const turnRight = Math.sin(Math.atan2(u?.pos.x - p.pos.x, u?.pos.z - p.pos.z) - rt.player.yaw) <= 0;
      setClass($('objectives'), 'turn-coach', turnCoach);
      if (turnCoach) {
        // 見回す側の空いた上半分へ。左右の操作を入れ替えた時も追従する。
        setCssVar($('objectives'), '--turn-coach-x', (S.touchSwap ? 56 : W - 296) + 'px');
        setCssVar($('objectives'), '--turn-coach-y', Math.max(84, H * .24) + 'px');
      }
      // 「ここ」は構え始めた足元。移動や敵の動きで待つ輪を引きずらない。
      if (guardHelp && this.guardFacing && rt.player.guard) {
        const cue = this.guardWait || (this.guardWait = { pos: { x: 0, y: 0, z: 0 }, guideArea: 'wait', guideRadius: 1 });
        if (!hadGuardWait || cue.rt !== rt || cue.enemy !== u) {
          cue.pos.x = p.pos.x; cue.pos.y = p.pos.y; cue.pos.z = p.pos.z;
        }
        cue.rt = rt; cue.enemy = u; cue.active = true;
      }
      if (this.actionLabel) {
        // 印の形と行動を対応させ、向きの矢印だけでは戦い方を迷わせない。
        if (rt.teachOn && !rt.teachOn()) {
          // 手ほどきを終えた後も、戦固有の「列を守れ」「旗へ戻れ」を残す。
          if (meleeHelp && !guardHelp) action = approachHelp ? (typeof rt.def.meleeApproachText === 'function' ? rt.def.meleeApproachText(rt) : rt.def.meleeApproachText) || 'はたへ すすもう' : !this.guardFacing ? '敵へ向こう' : rt.def.enemyTaskLabel?.(rt, u) || attackOperation(rt);
          else if (this.guardAlly && !retreatNeeded && !dodge) action = rescue ? 'この人を助けよう' : rt.def.guardLabel?.(rt, this.guardAlly) || 'この人を守れ';
        }
        setClass(this.actionLabel, 'attack-action', attackHelp && this.guardFacing);
        setClass(this.actionLabel, 'spear-action', attackHelp && this.guardFacing && rt.player.weapon === 'spear');
        setClass($('objectives'), 'attack-help', attackHelp && this.guardFacing);
        setClass(this.actionLabel, 'cover-action', false);
        setClass(this.actionLabel, 'guard-action', meleeHelp && !approachHelp && !this.guardFacing);
        setCssVar(this.actionLabel, '--enemy-angle', Math.atan2(-Math.cos(angle), -Math.sin(angle)).toFixed(3) + 'rad');
        const attack = rt.player.weapon === 'sword' ? 'きる' : rt.player.weapon === 'bow' ? '射る' : rt.player.weapon === 'gun' ? '攻撃' : 'つく';
        const help = approachHelp ? '' : rt.teachOn && !rt.teachOn() ? '' : attackHelp && this.guardFacing ? isTouch ? '' : '左クリックを長押し → はなす' : this.guardAlly && !(isTouch && this.attackGuideEnemy) ? isTouch ? rt.player.weapon === 'gun' ? '攻撃の釦を押し続けて狙い、離して撃つ' : `「${attack}」を長押し → はなす` : rt.player.weapon === 'gun' ? '左クリックを押し続けて狙い、離して撃つ' : '敵へ向き、左クリックを長押しして放す' : '';
        const dismount = retreatNeeded && treatmentNeeded && rt.player.mounted && !dodge;
        setHtml(this.actionLabel, dismount ? `<button type="button" class="dismount-action"${rt.player.mountT > 0 ? ' disabled' : ''}>${esc(rt.def.dismountActionLabel || '馬をおりる')}</button>` :
          turnCoach && (!rt.teachOn || rt.teachOn()) ? `${esc(action)}<svg class="turn-gesture" viewBox="0 0 200 82" aria-hidden="true"><g transform="${turnRight ? '' : 'translate(200 0) scale(-1 1)'}"><circle cx="32" cy="24" r="17" fill="none" stroke="#fff3ba" stroke-width="3"/><circle cx="168" cy="24" r="17" fill="none" stroke="#fff3ba" stroke-width="3" stroke-dasharray="4 4"/><path d="M51 24H148M136 15L148 24L136 33" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 40V24Q26 16 32 16Q38 16 38 24V36Q44 31 48 37Q55 35 58 43L56 53Q55 59 47 59H34Q28 59 24 52L14 40Q10 32 16 31Q20 29 26 40Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></g><g fill="#fff3ba" font-size="13" font-family="sans-serif" text-anchor="middle"><text x="${turnRight ? 32 : 168}" y="78">ここから</text><text x="${turnRight ? 168 : 32}" y="78">ここまで</text></g></svg>` :
          approachHelp && isTouch ? esc(action) :
          retreat?.treatment ? esc(action) :
          `${guardHelp ? '<span class="guard-caption"><i class="guard-sign" aria-hidden="true"></i>' : ''}${esc(action)}${guardHelp ? '</span>' : ''}${help ? `<small>${esc(help)}</small>` : ''}`);
        // 操作を任務の一枚へまとめる。下馬を明示する戦は押せる釦を保つ。
        const singleTask = !(dismount && rt.def.dismountActionLabel) &&
          (!!combatTask(rt) || !!rt.def.singleTaskGuide || approachHelp && !!rt.def.hideApproachAction);
        setHidden(this.actionLabel, singleTask || !action || !!retreat && !dismount);
        setClass($('objectives'), 'has-action', !singleTask && !!action && (!retreat || dismount));
        setClass($('objectives'), 'immediate-action', !singleTask && meleeHelp && !!action && !retreat);
        if (singleTask) setClass($('objectives'), 'attack-help', false);
      }
      this.okeThreatActive = !!u;
      if (this.guardAlly || meleeHelp || dodge || retreat || retreatNeeded) {
        setHidden($('target'), true);
        setHidden($('boss'), true);
      }
      for (const el of this.threatEls) el.hidden = true;
      // 記録の入口・今の行動・相手か行き先の三枚まで。
      let markerRoom = !action && $('boss').hidden && $('choice').hidden ? 1 : 0;
      for (const marker of this.markerEls.values()) if (!marker.hidden) {
        if (markerRoom > 0) markerRoom--; else marker.hidden = true;
      }
      this.notices.sync();
      if (cover && !coverReached && !retreatNeeded && !dodge && this.showCover(rt, cover) && this.actionLabel) {
        action = Math.hypot(cover.x - p.pos.x, cover.z - p.pos.z) < .8 ? 'そのままかくれよう' : rt.coverGuide.label;
        setClass(this.actionLabel, 'cover-action', true);
        setText(this.actionLabel, action);
        setHidden(this.actionLabel, true);
        // 操作文を戻る案内へ移した後は、空の任務札を残さない。
        setClass($('objectives'), 'has-action', false);
      }
      return;
    }
    setClass($('objectives'), 'turn-coach', false);
    if (rt.army.rainEscape) this.showDodge(rt, null);
    if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
    if (rt.def.key === 'honnoji' && rt.t < (rt.flags.coverHelpUntil || 0) && rt.coverGuide?.valid) {
      for (const marker of this.markerEls.values()) marker.hidden = true;
      if (this.showCover(rt, rt.coverGuide.pos)) {
        for (const el of this.threatEls) el.hidden = true;
        return;
      }
    }
    if (oke) {
      this.okeThreatActive = sources.length > 0;
      this.notices.sync();
      if (this.okeThreatActive || this.notices.picks.length >= 2) for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    let markerCount = 0;
    for (const marker of this.markerEls.values()) if (!marker.hidden) markerCount++;
    const warningShown = this.notices.picks.some((item) => item.kind === 'warn');
    const operation = !!rt.touchCoachActive || !!rt.nearestInteract() || (!rt.def.town && !rt.def.dojo && (p.wounds?.bleed > 0.0001 || p.hp < p.maxHp * 0.6));
    const room = $('choice').hidden && !warningShown ? Math.max(0, (oke ? 2 : 3) - Number(operation) - markerCount - this.notices.picks.length - (!$('boss').hidden ? 1 : 0) - (!target.hidden && !target.classList.contains('notice-muted') ? 1 : 0)) : 0;
    const count = Math.min(sources.length, room);
    for (let n = count; n < this.threatEls.length; n++) this.threatEls[n].hidden = true;
    const placed = this.threatRects;
    placed.length = 0;
    if (rt.def.avoidWaymarkThreats || rt.def.key === 'mikatagahara') for (const marker of this.markerEls.values()) {
      // 印の実寸と置き場は印を置いた時に覚えてある（毎コマ測ると、札を書くたびに組み直しが起きて重い）。
      // .mk は translate(-50%, -100%) なので、置いた点の上に幅・高さの箱がある。
      if (marker.hidden || marker._ow == null || marker._px == null) continue;
      const hx = marker._ow / 2;
      const box = { left:marker._px - hx - 8, right:marker._px + hx + 8, top:marker._py - marker._oh - 32, bottom:marker._py + 8 };
      // 振り向く字が出ている時だけ、その実寸も足す。名と距離のほか、札の上にある金の矢印も空ける。
      const behindLabel = marker.querySelector('.behind-label');
      const turn = behindLabel && behindLabel.offsetParent && behindLabel.getBoundingClientRect();
      if (turn) { box.left = Math.min(box.left, turn.left - 8); box.right = Math.max(box.right, turn.right + 8); box.top = Math.min(box.top, turn.top - 32); box.bottom = Math.max(box.bottom, turn.bottom + 8); }
      placed.push(box);
    }
    for (let n = 0; n < sources.length && n < room; n++) {
      const u = sources[n], ranged = !u.sidearm && (u.type === 'bow' || u.type === 'gun') && (u.atk?.bow || u.atk?.ranged || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 4);
      const el = this.threatEls[n];
      if (u.attackWarnAt == null || rt.t - (u.attackWarnLast ?? -99) > 8) u.attackWarnAt = rt.t;
      u.attackWarnLast = rt.t;
      const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const direction = Math.cos(a) > 0.5 ? '前' : Math.cos(a) < -0.5 ? '後ろ' : Math.sin(a) > 0 ? '左' : '右';
      const danger = ranged ? u.type === 'bow' ? '矢' : '鉄砲' : '敵の槍・刀';
      const arrow = !rt.def.nearThreatWarning ? '▲' : direction === '前' ? '↑' : direction === '後ろ' ? '↓' : direction === '左' ? '←' : '→';
      setText(el, rt.def.compactThreats
        ? `${arrow} ${direction}から${ranged ? danger : '敵'}。${ranged && u.type === 'gun' ? rt.def.compactGunAction || '柵の陰へ' : rt.def.compactThreatAction?.(rt, u) || '構えて防げ'}`
        : rt.def.actionableThreats
        ? `${arrow} ${direction}から${danger}。${ranged && u.type === 'gun' ? '柵の陰へ退け' : '構えて防げ'}`
        : `▲ ${direction}・${danger}`);
      // 縁の合図でも危険の意味は読み上げ用に残す。判定と予告の時刻は変えない。
      el.setAttribute('aria-label', el.textContent);
      if (rt.def.quietCombatCues) setText(el, direction === '前' ? '↑' : direction === '後ろ' ? '↓' : direction === '左' ? '←' : '→');
      el.hidden = false;
    }
    // 三枚の文を書いてから実寸をまとめて読む。札ごとに書く・測るを往復しない。
    //   文・形・置き場・画面が前と同じ札は測り直さない（測るたびに画面の組み直しが起きて重い）
    for (let n = 0; n < count; n++) {
      const el = this.threatEls[n], size = this.threatSizes[n];
      const key = el.textContent + '|' + el.className + '|' + el.style.left + '|' + el.style.top + '|' + W + '|' + H;
      if (size.key === key) continue;
      const r = el.getBoundingClientRect();
      size.width = r.width; size.height = r.height; size.key = key;
    }
    if (count) this.hudRects();
    for (let n = 0; n < count; n++) {
      const u = sources[n], el = this.threatEls[n], size = this.threatSizes[n];
      const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const h = size.height, hw = size.width / 2 + 8;
      if (rt.def.quietCombatCues) {
        // 前後は上下の端、左右は横の端へ。兵の頭と槍先が集まる中央を空ける。
        const front = Math.cos(a), side = Math.sin(a);
        setStyle(el, 'left', `${front > 0.5 || front < -0.5 ? W * 0.5 - side * W * 0.22 : side > 0 ? 28 : W - 28}px`);
        setStyle(el, 'top', `${front > 0.5 ? 100 : front < -0.5 ? H - 110 : H * 0.5}px`);
        continue;
      }
      const xy = this.avoidRects(W * 0.5 - Math.sin(a) * Math.min(W * 0.35, 340), H * 0.5 - Math.cos(a) * Math.min(H * 0.29, 200) + h / 2, W, H, 'h', placed, hw, h + 8, true);
      if (!xy) { el.hidden = true; continue; }
      setStyle(el, 'left', `${xy[0]}px`);
      setStyle(el, 'top', `${xy[1] - h / 2}px`);
      // 中心から半幅・半高を引いた実寸。置いた直後の再測定を省く。
      size.left = xy[0] - size.width / 2; size.right = xy[0] + size.width / 2;
      size.top = xy[1] - h; size.bottom = xy[1]; placed.push(size);
    }
  }

  // 行き先の白い小旗（戦場の小旗と同じ：白地に墨の縁、細い竿）
  flagIcon(g, x, y, h) {
    g.strokeStyle = '#1a1510'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.strokeStyle = '#f1e9d6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = '#f1e9d6'; g.fillRect(x, y - h, h * 0.62, h * 0.44);
    g.strokeStyle = '#1a1510'; g.lineWidth = 1.2; g.strokeRect(x, y - h, h * 0.62, h * 0.44);
    g.beginPath(); g.ellipse(x, y, h * 0.3, h * 0.1, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(241,233,214,.8)'; g.lineWidth = 1.2; g.stroke();
  }
  // 隊旗の形：幟（槍・弓）・四角の小旗（鉄砲）・吹流し（騎馬）・大旗（本陣）
  stdIcon(g, x, y, h, kind, col, lean = 0) {
    g.save(); g.translate(x, y); g.rotate(lean);
    const H = kind === 'honjin' ? h * 1.35 : kind === 'gun' ? h * 0.75 : h;
    g.lineWidth = 3; g.strokeStyle = '#120f0b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.fillStyle = col; g.strokeStyle = '#120f0b'; g.lineWidth = 1.2;
    g.beginPath();
    if (kind === 'gun') g.rect(0, -H, H * 0.62, H * 0.52);
    else if (kind === 'cavalry') { g.moveTo(0, -H); g.lineTo(h * 0.9, -H + h * 0.08); g.lineTo(h * 0.9, -H + h * 0.16); g.lineTo(0, -H + h * 0.3); g.closePath(); }
    else if (kind === 'honjin') g.rect(0, -H, H * 0.4, H * 0.62);
    else g.rect(0, -H, h * 0.24, kind === 'bow' ? h * 0.5 : h * 0.62);
    g.fill(); g.stroke();
    g.restore();
  }

  // 和紙の地（生成りの地に漉きむらと繊維）。一度だけ描いて、絵の模様として使い回す
  washi(g) {
    if (!this._washiC) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const w = c.getContext('2d');
      w.fillStyle = '#e8ddc2'; w.fillRect(0, 0, 256, 256);
      let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) { w.fillStyle = `rgba(${170 + R() * 40},${150 + R() * 36},${110 + R() * 30},${0.08 + R() * 0.1})`; w.beginPath(); w.ellipse(R() * 256, R() * 256, 10 + R() * 34, 6 + R() * 20, R() * 3, 0, Math.PI * 2); w.fill(); }
      for (let i = 0; i < 260; i++) {
        const x = R() * 256, y = R() * 256, a = R() * 6.28, l = 4 + R() * 14;
        w.strokeStyle = `rgba(${120 + R() * 40},${100 + R() * 30},${70 + R() * 20},${0.12 + R() * 0.16})`; w.lineWidth = 0.5 + R() * 0.8;
        w.beginPath(); w.moveTo(x, y); w.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); w.stroke();
      }
      this._washiC = c; this._washiP = new Map();
    }
    if (!this._washiP.has(g)) this._washiP.set(g, g.createPattern(this._washiC, 'repeat'));
    return this._washiP.get(g);
  }
  // 大軍の塊を墨のにじみで描く下地（敵・味方で一枚ずつ。大きさが同じなら使い回す）
  massLayer(i, Sz) {
    this._mass = this._mass || [];
    let c = this._mass[i];
    if (!c || c.width !== Sz) { c = document.createElement('canvas'); c.width = c.height = Sz; this._mass[i] = c; }
    return c;
  }
  drawMap(cv, rt, range, rotate) {
    const g = cv.getContext('2d');
    const Sz = cv.width;
    g.clearRect(0, 0, Sz, Sz);
    const p = rt.player.u;
    const cx = rotate ? p.pos.x : (this.bigC ? this.bigC.x : 0), cz = rotate ? p.pos.z : (this.bigC ? this.bigC.z : 0);
    const sc = Sz / 2 / range;
    const northUp = rotate && S.mapNorth;
    const yaw = rotate && !northUp ? rt.player.yaw : Math.PI;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const tr = (x, z) => {
      const dx = x - cx, dz = z - cz;
      // 画面上方向＝向いている方向
      const rx = -(dx * cos - dz * sin), rz = dx * sin + dz * cos;
      return [Sz / 2 + rx * sc, Sz / 2 - rz * sc];
    };
    // 画面での大きさ：iPhone 横では小地図が 60px ほどの小さな丸になる。その時は細かい物（兵の点・味方の鉄砲の扇・字）を描かず、線を太く
    const shown = cv.clientWidth || Sz, px = Sz / Math.max(40, shown), tiny = rotate && shown < 100;
    if (rotate) this.mmTiny = tiny;
    const k = Sz / 340;
    // 墨と顔料の色（和紙の上で読める濃さ。色だけに頼らず、敵は三角・味方は四角・自分の組は輪）
    const ca = S.colorAssist;
    const C = { ink: '#1b1712', ally: ca ? '#0a6fa8' : '#2c4f86', enemy: ca ? '#c25a00' : '#b2331f', own: '#6e4508', gold: '#7a5a10', paper: 'rgba(240,232,212,.92)' };
    const TC = (team) => (team !== 0 ? C.enemy : C.ally);
    g.save();
    if (rotate) { g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - 1, 0, Math.PI * 2); g.clip(); }
    // 和紙の地（小さい時は少し透かして、戦場を隠しすぎない）
    g.globalAlpha = tiny ? 0.74 : 0.88;
    g.fillStyle = this.washi(g); g.fillRect(0, 0, Sz, Sz);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(110,86,52,.5)'; g.lineWidth = Math.max(2 * k, 1.6 * px);
    // 道が二本以上ある戦：自分のいる道（いちばん近い道）を太く濃く引く（B062）
    const mapPaths = rt.def.mapPaths?.(rt, rotate) || (rt.world.def.paths || []).map((p) => (Array.isArray(p) ? p : (p && p.pts) || []));   // 道は点の並びか { pts, half } の形
    let mine = -1;
    if (mapPaths.length > 1 && rt.player && rt.player.u) {
      const pp = rt.player.u.pos; let bd = 30;
      mapPaths.forEach((path, pi) => {
        for (let i = 0; i < path.length - 1; i++) {
          const [x1, z1] = path[i], [x2, z2] = path[i + 1], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((pp.x - x1) * dx + (pp.z - z1) * dz) / l2));
          const d = Math.hypot(pp.x - (x1 + dx * t), pp.z - (z1 + dz * t));
          if (d < bd) { bd = d; mine = pi; }
        }
      });
    }
    mapPaths.forEach((path, pi) => {
      const my = pi === mine;
      g.strokeStyle = my ? 'rgba(110,70,30,.9)' : 'rgba(110,86,52,.5)'; g.lineWidth = my ? Math.max(4 * k, 3 * px) : Math.max(2 * k, 1.6 * px);
      g.beginPath(); path.forEach(([x, z], i) => { const [a, b] = tr(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    });
    g.lineWidth = Math.max(2 * k, 1.6 * px);
    if (rt.world.def.water) {
      g.fillStyle = 'rgba(78,108,122,.4)';
      const Wx = rt.world.def.water.x;
      const pts = [tr(Wx, -200), tr(200, -200), tr(200, 200), tr(Wx, 200)];
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill();
    }
    const now = rt.army.time;
    for (const s of rt.army.structs) {
      if (!s.seg) continue;
      const hot = s.alive && s.hitT && now - s.hitT < 1.2;
      g.strokeStyle = !s.alive ? C.enemy : hot ? '#b86a0e' : 'rgba(40,33,24,.85)';
      g.lineWidth = Math.max((hot ? 5 : 3) * k, (hot ? 2.4 : 1.5) * px);
      const [a1, b1] = tr(s.seg[0], s.seg[1]), [a2, b2] = tr(s.seg[2], s.seg[3]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    const r0 = Math.max(3, Sz / 110);
    // 身分が上がっても、敵の位置を見通せるわけではない。
    const PU = rt.player.u.pos, sight = Math.min(weatherSight(rt.world), 170);
    const seen = (x, z, grp) => grp ? sightRef(rt, grp, grp.center()) : false;
    const far = (x, z, m = 1.5) => Math.abs(x - cx) > range * m || Math.abs(z - cz) > range * m;

    // ---- 山・砦・城の地形の読み（M4）：尾根・谷の色分け・見える範囲・火の所・分かれ道と伏兵注意（bigmap だけ）----
    {
      const H = terrainHints(rt, false);
      if (H && (H.ridge.length || H.valley.length)) {
        for (const [list, col] of [[H.ridge, 'rgba(168,120,40,.55)'], [H.valley, 'rgba(60,96,120,.55)']]) {
          g.fillStyle = col;
          for (const p of list) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); g.beginPath(); g.arc(a, bb, Math.max(1.4 * k, 1 * px), 0, Math.PI * 2); g.fill(); }
        }
      }
      if (!rotate && H) {
        // 押して開く俯瞰だけ：分かれ道（丸に十）と、伏兵に気を付ける所（三角の注意）
        g.strokeStyle = 'rgba(40,33,24,.8)'; g.lineWidth = Math.max(1.6 * k, 1 * px);
        for (const p of H.branch) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 4 * k; g.beginPath(); g.arc(a, bb, rr, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.moveTo(a, bb - rr); g.lineTo(a, bb + rr); g.stroke(); }
        g.fillStyle = 'rgba(178,51,31,.75)';
        for (const p of H.ambush) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 3.6 * k; g.beginPath(); g.moveTo(a, bb - rr); g.lineTo(a + rr, bb + rr); g.lineTo(a - rr, bb + rr); g.closePath(); g.fill(); }
      }
    }
    // 見える範囲（自分の目の届く輪）：無限の時は描かない
    if (rotate && Number.isFinite(sight)) {
      const [a, bb] = tr(PU.x, PU.z);
      g.strokeStyle = 'rgba(110,86,52,.35)'; g.lineWidth = Math.max(1.2 * k, 1 * px);
      g.beginPath(); g.arc(a, bb, sight * sc, 0, Math.PI * 2); g.stroke();
    }
    // 火の所（siege_fire.js が燃やした柵・木戸・堂など）
    if (rt.army.burning && rt.army.burning.length) {
      for (const s of rt.army.burning) {
        const px = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.x, pz = s.seg ? (s.seg[1] + s.seg[3]) / 2 : s.z;
        if (px == null || far(px, pz) || !sightPoint(rt, { x: px, z: pz })) continue;
        const [a, bb] = tr(px, pz);
        g.fillStyle = '#c25a00'; g.beginPath(); g.arc(a, bb, Math.max(2.2 * k, 1.4 * px), 0, Math.PI * 2); g.fill();
      }
    }
    // ふさいだ道（退路封鎖・siege_zones.js が持てば）：道の上に×を引く
    if (rt.sz && rt.sz.blockedPaths) {
      g.strokeStyle = 'rgba(178,51,31,.8)'; g.lineWidth = Math.max(2 * k, 1.4 * px);
      for (const [x, z] of rt.sz.blockedPaths) { if (far(x, z) || !sightPoint(rt, { x, z })) continue; const [a, bb] = tr(x, z); const rr = 4 * k; g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
    }

    // ---- 城・砦の場（siege_zones.js の SZ）：塗り分けと形。色だけに頼らず、本丸は角、曲輪は丸、交戦中は縞 ----
    if (rt.sz && rt.sz.zones) {
      for (const z of rt.sz.zones) {
        const q = z.pos; if (!q || far(q.x, q.z, 2) || !sightRef(rt, z, q)) continue;
        const [a, bb] = tr(q.x, q.z);
        const col = z.state === 'friend' ? C.ally : z.state === 'enemy' ? C.enemy : z.state === 'contested' ? '#c2961e' : 'rgba(150,140,120,.8)';
        const R = (z.honmaru ? r0 * 2.2 : r0 * 1.5) * k;
        g.save(); g.translate(a, bb);
        if (z.honmaru) {
          g.rotate(Math.PI / 4);
          g.strokeStyle = C.ink; g.lineWidth = Math.max(4 * k, 3 * px); g.strokeRect(-R, -R, R * 2, R * 2);
          g.strokeStyle = col; g.lineWidth = Math.max(2 * k, 1.6 * px); g.strokeRect(-R, -R, R * 2, R * 2);
        } else {
          g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
          g.globalAlpha = z.state === 'contested' ? 0.5 : 0.3; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
          g.strokeStyle = C.ink; g.lineWidth = Math.max(2.5 * k, 1.8 * px); g.stroke();
          g.strokeStyle = col; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
          if (z.state === 'contested') {
            g.save(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
            g.strokeStyle = C.ink; g.lineWidth = Math.max(1 * k, 0.8 * px);
            for (let i = -R; i < R; i += 3 * k) { g.beginPath(); g.moveTo(i, -R); g.lineTo(i + R, R); g.stroke(); }
            g.restore();
          }
        }
        g.restore();
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 60))}px sans-serif`;
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(z.name, a + R + 3, bb + 4);
          g.fillStyle = C.ink; g.fillText(z.name, a + R + 3, bb + 4);
        }
      }
    }

    // ---- 中に入れる建物（天守・櫓・主殿。naka.js）：地図に建物の形と戸口の印（B029：主殿へ着く道が地図で分かるように）----
    for (const I of NAKA.list) {
      if (I.kind === 'gate' || far(I.x, I.z, 2)) continue;
      const lv0 = I.levels[0], hw = lv0.w / 2, hd = lv0.d / 2;
      const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => { const [wx, wz] = I.P(lx, lz); return tr(wx, wz); });
      g.beginPath(); q.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      g.globalAlpha = 0.45; g.fillStyle = I.kind === 'goten' ? '#a8824a' : '#8a7a62'; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = C.ink; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
      const [dx, dz] = I.P(I.door.lx, I.door.side * hd), [da, db] = tr(dx, dz);
      g.fillStyle = '#e8d29a'; g.beginPath(); g.arc(da, db, Math.max(2 * k, 1.5 * px), 0, Math.PI * 2); g.fill(); g.strokeStyle = C.ink; g.lineWidth = Math.max(0.8 * k, 0.7 * px); g.stroke();
    }
    // ---- 束32：rt.nawabari（K＝nawabari.js の makeNawabari の戻り）があれば、場の中心の丸の代わりに
    // 曲輪の形（bbox。K は頂点の poly までは持たないので矩形で近似）を持ち主で塗り分ける。
    // 色だけに頼らず、本丸は太い縁・交戦中は縞・無人は点線。門は小さな印（閉＝横棒・開＝隙間・破れ＝×）----
    if (rt.nawabari && rt.nawabari.kuruwa) {
      const K = rt.nawabari;
      for (const ku of Object.values(K.kuruwa)) {
        const b = ku._box; if (!b) continue;
        const kcx = (b.x0 + b.x1) / 2, kcz = (b.z0 + b.z1) / 2;
        if (far(kcx, kcz, 2) || !sightRef(rt, ku, { x: kcx, z: kcz })) continue;
        const isHon = ku.kind === 'hon';
        const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(([x, z]) => tr(x, z));
        const col = ku.captureState === CAPTURE.FRIEND ? C.ally : ku.captureState === CAPTURE.ENEMY ? C.enemy
          : ku.captureState === CAPTURE.CONTESTED ? '#c2961e' : 'rgba(150,140,120,.8)';
        g.save();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.clip();
        g.globalAlpha = ku.captureState === CAPTURE.CONTESTED ? 0.5 : ku.captureState === CAPTURE.EMPTY ? 0.14 : 0.3;
        g.fillStyle = col; g.fill(); g.globalAlpha = 1;
        if (ku.captureState === CAPTURE.CONTESTED) {
          g.strokeStyle = C.ink; g.lineWidth = Math.max(isHon ? 1.2 * k : 1 * k, 0.8 * px);
          const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) * sc + 10;
          for (let i = -span; i < span; i += 3 * k) { g.beginPath(); g.moveTo(pts[0][0] + i, pts[0][1] - span); g.lineTo(pts[0][0] + i + span, pts[0][1] + span); g.stroke(); }
        }
        g.restore();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.strokeStyle = isHon ? C.ink : col;
        g.lineWidth = Math.max((isHon ? 3.2 : 1.6) * k, (isHon ? 2.2 : 1) * px);
        if (ku.captureState === CAPTURE.EMPTY) g.setLineDash([3 * k, 3 * k]);
        g.stroke();
        g.setLineDash([]);
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
          const [lx, lz] = tr(kcx, kcz);
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(ku.name, lx + 4, lz + 4);
          g.fillStyle = C.ink; g.fillText(ku.name, lx + 4, lz + 4);
        }
      }
      for (const gt of Object.values(K.gates || {})) {
        if (!gt.at || far(gt.at.x, gt.at.z) || !sightRef(rt, gt, gt.at)) continue;
        const [a, bb] = tr(gt.at.x, gt.at.z);
        const rr = Math.max(3 * k, 2 * px);
        g.strokeStyle = C.ink; g.lineWidth = Math.max(2 * k, 1.4 * px);
        if (gt.state === GATE_STATE.BROKEN) { g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
        else if (gt.state === GATE_STATE.OPEN) { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a - rr * 0.3, bb); g.moveTo(a + rr * 0.3, bb); g.lineTo(a + rr, bb); g.stroke(); }
        else { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.stroke(); }
      }
    }

    // ---- 大軍の塊：本物の兵に、軽い兵（遠景の大軍・軽い大軍の合戦）の広がりも足して、敵・味方の墨のにじみにする ----
    // 大軍も見通せる物だけ描く。
    {
      const shapes = [[], []];   // [味方, 敵] ごとに、{ pts } か { x, z, r }
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.team !== 0 || u.type === 'dummy' || u.type === 'porter' || u.fleeing) continue;
        if (!sightUnit(rt, u)) continue;
        if (far(u.pos.x, u.pos.z)) continue;
        shapes[u.team !== 0 ? 1 : 0].push({ x: u.pos.x, z: u.pos.z, r: 3.2 });
      }
      const W = rt.world, sides = rt.def.sides || {};
      for (const A of W.armies || []) {
        if (!A.mesh || !A.mesh.visible || A.rout) continue;
        const n = (A.n || 0) - (A.took || 0);
        if (n < 6) continue;
        A.mesh.updateMatrixWorld();
        const e = A.mesh.matrixWorld.elements, ox = A.cx + A.off.x, oz = A.cz + A.off.z;
        const x = e[0] * ox + e[8] * oz + e[12], z = e[2] * ox + e[10] * oz + e[14];
        if (far(x, z, 2.2)) continue;
        // 軍配（gunbai.js）と同じ見分け：戦の定義の両軍の家紋、敵方の家紋
        const team = A.team !== undefined ? A.team : sides.b && A.mon === sides.b.mon ? 1 : sides.a && A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0;
        if (team) continue;
        // 広がりは数から見積もる（横に長い備：幅は奥行きのおよそ三倍）
        const wd = Math.sqrt(n * 1.5 * 3), dp = n * 1.5 / wd, F = A.facing || 0, fc = Math.cos(F), fs = Math.sin(F), pts = [];
        for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, lx = Math.cos(t) * wd / 2, lz = Math.sin(t) * dp / 2; pts.push(tr(x + lx * fc + lz * fs, z - lx * fs + lz * fc)); }
        shapes[team ? 1 : 0].push({ pts });
      }
      for (const Cl of W.clashes || []) {
        if (!Cl.blocks || !Cl.frontAt) continue;
        if (far(Cl.x, Cl.z, 2.5)) continue;
        for (const Sd of [Cl.A, Cl.B]) {
          if (!Sd || !Sd.P || Sd.P.hidden || Sd.routed || !Sd.alive) continue;
          if (!sightRef(rt, Cl, Cl)) continue;
          const team = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1;
          if (team) continue;
          // 前線の列から後ろへ、残った数の厚み（後詰めがあれば厚く）
          const D = ((Sd.rows || 4) * 1.15 + (Sd.host ? 12 : 3)) * Math.max(0.3, Sd.alive / (Sd.n0 || Sd.alive)), g0 = (Cl.o && Cl.o.gap || 3.4) / 2;
          const front = [], back = [];
          for (let j = 0; j < Cl.nb; j++) { const a = Cl.frontAt(j, -Sd.sgn * g0), b = Cl.frontAt(j, -Sd.sgn * (g0 + D)); front.push(tr(a.x, a.z)); back.push(tr(b.x, b.z)); }
          shapes[team ? 1 : 0].push({ pts: front.concat(back.reverse()) });
        }
      }
      // 二度塗り：外は淡く広く、芯は濃く。塊が重なっても濃くなりすぎないよう、下地に塗ってから一度に重ねる
      for (let t = 0; t < 2; t++) {
        if (!shapes[t].length) continue;
        const L = this.massLayer(t, Sz), m = L.getContext('2d');
        for (const [grow, alpha] of [[1.5, 0.16], [1, 0.2]]) {
          m.clearRect(0, 0, Sz, Sz);
          m.fillStyle = t ? C.enemy : C.ally; m.strokeStyle = m.fillStyle; m.lineJoin = 'round';
          m.lineWidth = Math.max(2, 5 * sc * grow);
          for (const s of shapes[t]) {
            m.beginPath();
            if (s.pts) { s.pts.forEach(([a, b], i) => (i ? m.lineTo(a, b) : m.moveTo(a, b))); m.closePath(); m.fill(); m.stroke(); }
            else { const [a, b] = tr(s.x, s.z); m.arc(a, b, Math.max(1.5 * px, s.r * sc * grow), 0, Math.PI * 2); m.fill(); }
          }
          g.globalAlpha = alpha; g.drawImage(L, 0, 0); g.globalAlpha = 1;
        }
      }
    }

    // ---- 鉄砲隊の向き：筒先の向きへ、玉の届く扇（敵の扇は小さい時も描く。味方は大きい時だけ） ----
    for (const grp of rt.army.groups) {
      if (!grp.count || grp.routed || grp.name === 'player') continue;
      if (!(grp.isGun || (grp._kind || groupKind(grp)) === 'gun')) continue;
      const c = grp.center();
      if (far(c.x, c.z)) continue;
      if (grp.team !== 0 && !seen(c.x, c.z, grp)) continue;
      if (grp.team !== 0 || tiny) continue;
      const f = grp.forward(), fa = Math.atan2(f.x, f.z), R = 45;
      const [a0, b0] = tr(c.x, c.z);
      g.beginPath(); g.moveTo(a0, b0);
      for (let i = 0; i <= 6; i++) { const t = fa - 0.3 + i * 0.1; const [a, b] = tr(c.x + Math.sin(t) * R, c.z + Math.cos(t) * R); g.lineTo(a, b); }
      g.closePath();
      g.fillStyle = grp.team !== 0 ? 'rgba(178,51,31,.14)' : 'rgba(44,79,134,.12)'; g.fill();
      g.strokeStyle = grp.team !== 0 ? 'rgba(178,51,31,.55)' : 'rgba(44,79,134,.45)'; g.lineWidth = Math.max(1.4 * k, 1.1 * px);
      g.setLineDash([5 * k, 4 * k]); g.stroke(); g.setLineDash([]);
    }

    // ---- 兵の点（小さい時は塊だけにして、点は描かない） ----
    if (!tiny) for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy') continue;
      if (u.team !== 0) continue;
      if (!sightUnit(rt, u)) continue;
      if (far(u.pos.x, u.pos.z)) continue;
      const [a, b] = tr(u.pos.x, u.pos.z);
      if (u.team !== 0) {
        // 敵は三角（色だけに頼らない）
        g.fillStyle = u.fleeing ? 'rgba(178,51,31,.4)' : C.enemy;
        g.beginPath(); g.moveTo(a, b - r0 * 0.9); g.lineTo(a + r0 * 0.8, b + r0 * 0.6); g.lineTo(a - r0 * 0.8, b + r0 * 0.6); g.closePath(); g.fill();
      } else if (u.isSub) {
        g.fillStyle = C.own;
        g.beginPath(); g.arc(a, b, r0 * 0.7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = u.invuln && u.name ? C.gold : C.ally;
        g.fillRect(a - r0 / 2, b - r0 / 2, r0, r0);
      }
    }
    // ---- 自分の組：組の者を囲む輪（墨の縁に金茶） ----
    for (const grp of rt.squadGroups || []) {
      if (!grp.count) continue;
      const c = grp.center();
      let rr = 2;
      for (const u of grp.units) if (u.alive) rr = Math.max(rr, Math.hypot(u.pos.x - c.x, u.pos.z - c.z));
      const [a, b] = tr(c.x, c.z), R = Math.max(r0 * 1.8, (rr + 1.5) * sc);
      g.strokeStyle = C.paper; g.lineWidth = Math.max(4 * k, 3.2 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = C.own; g.lineWidth = Math.max(2 * k, 1.8 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
    }
    // 組を向かわせた行き先（前進の号令・地図での指図）：戦場の地面と同じ白い小旗と点線。使番が走っている間は薄く
    for (const grp of rt.squadGroups || []) {
      const pend = grp.pending && grp.pending.st.order === 'move' ? grp.pending.st : null;
      const dest = pend ? pend.dest : grp.order === 'move' ? grp.dest : null;
      if (!dest || !grp.count) continue;
      const c = grp.center();
      const [a1, b1] = tr(c.x, c.z), [a2, b2] = tr(dest.x, dest.z);
      g.save();
      g.globalAlpha = pend ? 0.6 : 1;
      g.strokeStyle = 'rgba(27,23,18,.75)'; g.lineWidth = 1.6 * k; g.setLineDash([4 * k, 5 * k]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
      g.setLineDash([]);
      this.flagIcon(g, a2, b2, r0 * 4.2);
      g.restore();
    }
    // 味方の武将：台詞・隊の札と同じ番号。地図の外なら縁の四角に番号を置く。
    // 小さい丸は一隊だけ、ほかは三隊まで。字は画面上で十二画素以上。
    if (rotate) {
      let drawn = 0;
      g.font = `${Math.ceil(12 * px)}px sans-serif`;
      const rim = Sz / 2 - 10 * px;
      for (const row of rt.allyMapRows || []) {
        if (!row.active || drawn >= (tiny || rt.def.compactMapAllies ? 1 : 3) || !sightRef(rt, row, row)) continue;
        let [a, b] = tr(row.x, row.z);
        const dx = a - Sz / 2, dy = b - Sz / 2, dist = Math.hypot(dx, dy);
        if (dist > rim) { a = Sz / 2 + dx / dist * rim; b = Sz / 2 + dy / dist * rim; }
        const R = 8 * px, badge = ['anegawa', 'shitaragahara'].includes(rt.def.key) ? `隊${row.number}` : String(row.number);
        const half = Math.max(R, g.measureText(badge).width / 2 + 2 * px);
        g.fillStyle = C.ally; g.fillRect(a - half, b - R, half * 2, R * 2);
        g.strokeStyle = C.ink; g.lineWidth = px; g.strokeRect(a - half, b - R, half * 2, R * 2);
        g.fillStyle = '#fff6e5'; g.textAlign = 'center'; g.fillText(badge, a, b + 4 * px); g.textAlign = 'left';
        // 小さい丸は番号札だけにして、武将名・行動の字との重なりをなくす。
        if (tiny || rt.def.compactMapAllies) { drawn++; continue; }
        const short = row.action === '移動中' ? '進む' : row.action === '戦っている' ? '戦う' : row.action === '攻めている' ? '攻める' : row.action === '逃げている' || row.action === '退いている' ? '退く' : '待つ';
        const label = `${row.number} ${row.name} ${short}`;
        // 字の上端・下端も丸の内側へ。縁と和紙の縁取りを避けた幅に収める。
        const ly = Sz / 2 + (drawn - 1) * 14 * px + 4 * px;
        const radius = Sz / 2 - 2 * px;
        const labelDy = Math.max(Math.abs(ly - Math.ceil(12 * px) - Sz / 2), Math.abs(ly - Sz / 2));
        const maxWidth = Math.max(px, 2 * Math.sqrt(Math.max(0, radius * radius - labelDy * labelDy)) - 4 * px);
        const width = Math.min(g.measureText(label).width, maxWidth), lx = (Sz - width) / 2;
        g.strokeStyle = C.paper; g.lineWidth = 4 * px; g.strokeText(label, lx, ly, maxWidth);
        g.fillStyle = C.ink; g.fillText(label, lx, ly, maxWidth);
        drawn++;
      }
    }
    // 任務の印は札・戦場と同じ一つにそろえる。
    const destination = S.reduceGuidance || rt.missionGuide?.objective !== currentObjective(rt) ? null : rt.missionGuide?.marker;
    for (const m of rt.markers) {
      if (!rt.def.town && !rt.def.dojo && m !== destination && !m.person) continue;
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
      let [a, b] = tr(q.x, q.z);
      const col = m.red ? C.enemy : '#c2961e';
      const rr = Math.hypot(a - Sz / 2, b - Sz / 2), rim = Sz / 2 - r0 * 3.2 - (tiny ? 3 * px : 0);
      const big = tiny ? 1.5 : 1;
      if (rotate && rr > rim) {
        const ang = Math.atan2(b - Sz / 2, a - Sz / 2);
        a = Sz / 2 + Math.cos(ang) * rim; b = Sz / 2 + Math.sin(ang) * rim;
        g.save(); g.translate(a, b); g.rotate(ang); g.scale(big, big);
        g.beginPath(); g.moveTo(r0 * 2.4, 0); g.lineTo(-r0 * 1.2, -r0 * 1.7); g.lineTo(-r0 * 1.2, r0 * 1.7); g.closePath();
        g.fillStyle = col; g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke(); g.fill();
        g.restore();
        continue;
      }
      g.save(); g.translate(a, b); g.rotate(Math.PI / 4); g.scale(big, big);
      g.strokeStyle = C.ink; g.lineWidth = 6; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.restore();
      if (!rotate) {
        g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 50))}px sans-serif`;
        const t = typeof m.label === 'function' ? m.label() : m.label;
        g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(t, a + r0 * 2, b + 4);
        g.fillStyle = m.red ? C.enemy : C.ink; g.fillText(t, a + r0 * 2, b + 4);
      }
    }
    // 戦術マップでは部隊ごとの向きと、戦場と同じ形の隊旗（幟＝槍・弓、四角＝鉄砲、吹流し＝騎馬、大旗＝本陣）
    if (!rotate) {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
      const selSet = new Set(rt.squad.length ? rt.player.selectedGroups() : []);
      const many = rt.squadGroups.filter((x) => x.count > 0).length > 1;
      const fh = r0 * 3.6;
      for (const grp of rt.army.groups) {
        if (grp.team !== 0 || !grp.count || grp.name === 'player' || grp.units.every((u) => !u.alive || u.type === 'dummy' || u.type === 'porter')) continue;
        const c = grp.center();
        // 名のある敵将の隊も、今見通せる時だけ描く。
        if (grp.team !== 0 && (!weatherSees(rt.world, PU, c) || !seen(c.x, c.z, grp))) continue;
        const [a, b] = tr(c.x, c.z);
        const f = grp.forward();
        const [a2, b2] = tr(c.x + f.x * 10, c.z + f.z * 10);
        const col = grp.team !== 0 ? C.enemy : grp.isPlayerSquad ? C.own : C.ally;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
        // 号令先に選んだ自分の組は、戦場と同じ金の輪
        if (grp.isPlayerSquad && selSet.has(grp) && (many || rt.player.cmdOpen)) {
          g.strokeStyle = '#120f0b'; g.lineWidth = 5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#d8b04a'; g.lineWidth = 2.5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
        }
        const kind = grp._kind || groupKind(grp);
        // 乱れた隊は旗が傾く（戦場の旗と同じ）
        const lean = grp.routed ? 0.85 : grp.morale < 30 ? 0.32 : grp.morale < 55 ? 0.13 : 0;
        if (grp.team === 0 || (kind !== 'honjin' || (campKnown(rt) && grp.units.every((u) => !u.isOfficer || enemyKnown(rt, u))))) this.stdIcon(g, a + r0 * 1.6, b, fh, kind, col, lean);
        // 自分の組は旗の下に数の札（戦場の札と同じ色）
        if (grp.isPlayerSquad) {
          const tc = TAG_COL[tagOf(grp)];
          g.fillStyle = '#120f0b'; g.fillRect(a + r0 * 1.6 - 1, b + 2 - 1, r0 * 1.6 + 2, r0 * 1.2 + 2);
          g.fillStyle = tc; g.fillRect(a + r0 * 1.6, b + 2, r0 * 1.6, r0 * 1.2);
        }
        g.fillStyle = col;
        // 字は要る時だけ：自分の組は隊の名、敵は乱れた時だけ（意気盛ん・平常は書かない）
        const report = grp.team === 0 && rt.allyOrders && rt.allyOrders.find((r) => r.g === grp && r.active);
        const lbl = grp.isPlayerSquad ? ((rt.squadGroups.length > 1 ? GROUP_NAME[grp.kind] : '') || '自分の組') + (grp.morale < 50 ? ` ${moraleWord(grp.morale)}` : '') : grp.team !== 0 ? (grp.routed ? '潰走' : grp.morale < 50 ? moraleWord(grp.morale) : '') : report ? `${report.number} ${report.name}・${report.action}` : '';
        if (report) g.font = `${Math.ceil(12 * px)}px sans-serif`;
        if (lbl) { g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(lbl, a + r0 * 4.6, b - 4); g.fillText(lbl, a + r0 * 4.6, b - 4); }
      }
    }
    // 自分：墨の矢印に和紙の縁
    const [pa, pb] = tr(p.pos.x, p.pos.z);
    g.save(); g.translate(pa, pb);
    g.rotate(rotate && !northUp ? 0 : -(p.heading - Math.PI));
    if (tiny) g.scale(1.35, 1.35);
    g.beginPath(); g.moveTo(0, -r0 * 2.4); g.lineTo(r0 * 1.4, r0 * 1.5); g.lineTo(0, r0 * 0.8); g.lineTo(-r0 * 1.4, r0 * 1.5); g.closePath();
    g.strokeStyle = C.paper; g.lineWidth = 3; g.stroke();
    g.fillStyle = C.ink; g.fill();
    g.restore();
    g.restore();
    if (rotate) {
      // 墨の縁（筆で引いた輪。太さに少しむら）
      g.strokeStyle = 'rgba(27,23,18,.8)'; g.lineWidth = Math.max(3 * k, 1.6 * px);
      g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(27,23,18,.45)'; g.lineWidth = Math.max(2 * k, px);
      g.beginPath(); g.arc(Sz / 2 + 0.6 * px, Sz / 2 - 0.4 * px, Sz / 2 - 2.5 * px, 2.4, 5.6); g.stroke();
      // 北の方角（小さい時は描かない：丸が小さく、字が潰れる）
      if (!tiny) {
        const R = Sz / 2 - Math.max(16, 10 * px);
        const nx = Sz / 2 - Math.sin(yaw) * R, ny = Sz / 2 + Math.cos(yaw) * R;
        g.font = `bold ${Math.max(Math.ceil(12 * px), Math.round(Sz / 14))}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = C.paper; g.strokeText('北', nx, ny);
        g.fillStyle = '#8a2a18'; g.fillText('北', nx, ny);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
    } else {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 40))}px sans-serif`;
      const northY = Math.max(26, 16 * px);
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText('北 ↑', Sz / 2, northY);
      g.fillStyle = C.ink; g.fillText('北 ↑', Sz / 2, northY);
      g.textAlign = 'start';
    }
  }

  // ---- 束6（59 章）：備の札。足軽大将以上だけ、画面の隅に自分の備を一枚。隣・後詰・本陣は崩れ・危機の時だけ 6 秒 ----
  sonaeCards(rt) {
    const el = sonaeCardsRoot();
    if (rt.over || viewLevel(rt) < 2) { el.hidden = true; return; }
    const own = playerSonae(rt);
    if (!own || own.b.aliveNominal() <= 0) { el.hidden = true; return; }
    this._scAlert = this._scAlert || new Map();
    const now = rt.t || 0;
    const ALERT = new Set(['敗走', '混乱', '動揺']);
    const neigh = [own.left(), own.right(), own.behind()].filter(Boolean);
    for (const S of neigh) if (sightRef(rt, S, S.b.pos) && ALERT.has(S.state)) this._scAlert.set(S.id, now + 6);
    // 組の札がある間、平常の備は号令を開いた時だけ。危機の札は残す。
    const showOwn = $('h-squad').hidden || rt.player?.cmdOpen || ALERT.has(own.state);
    const rows = showOwn ? [sonaeCardRow(own, ALERT.has(own.state))] : [];
    for (const S of neigh) {
      const limit = VIEW.h > 620 ? ($('subtitle').textContent ? 1 : $('h-squad').hidden ? 3 : 2) : 1;
      if (rows.length >= limit) break;
      if (!sightRef(rt, S, S.b.pos)) continue;
      const until = this._scAlert.get(S.id);
      if (until != null && now < until) rows.push(sonaeCardRow(S, true));
    }
    el.hidden = rows.length === 0;
    const key = rows.join('');
    if (this._scKey !== key) { this._scKey = key; el.innerHTML = rows.join(''); }
  }

  // ---- 野戦陣地の HUD（長篠・設楽原 統合版 60〜62 章）：rt.flags.hudBands（鉄砲の一手を預かる者の班の READY%）・
  //   rt.flags.hudZone（侍大将の、自分のいる区画の柵の細いゲージ）がある時だけ出す。設楽原専用でなく、同じ形を渡せばどの野戦でも出る
  yasenHud(rt) {
    const F = rt.flags;
    const el = yasenHudRoot();
    if (!F.hudBands && !F.hudZone) { el.hidden = true; return; }
    el.hidden = false;
    const rows = [];
    if (F.hudBands) for (const k of ['A', 'B', 'C']) {
      const b = F.hudBands[k];
      if (b) rows.push(`<div class="yb"><b>${k === 'A' ? '一' : k === 'B' ? '二' : '三'}班</b><span>${b.state}</span><i>${b.pct}%</i></div>`);
    }
    if (F.hudZone) {
      const z = F.hudZone;
      rows.push(`<div class="yz${z.breach ? ' warn' : ''}"><b>${esc(z.name)}防御線</b><span>馬防柵 ${z.pct}%</span><div class="bal"><i style="width:${Math.max(0, Math.min(100, z.pct))}%"></i></div>${z.breach ? '<small>柵破られる</small>' : ''}</div>`);
    }
    const key = rows.join('');
    if (this._yhKey !== key) { this._yhKey = key; el.innerHTML = rows.join(''); }
  }
}

// ---- 備の札（sonaeCards）の小さな部品。pointer-events: none＝見るだけ（押せる札にしない）----
function sonaeInjectStyle() {
  if ($('sonae-style')) return;
  const st = document.createElement('style');
  st.id = 'sonae-style';
  st.textContent = `
#sonae-cards { position: fixed; left: calc(10px + env(safe-area-inset-left, 0px)); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 12; display: flex; flex-direction: column; gap: 6px; pointer-events: none; max-width: 46vw; }
#sonae-cards[hidden], body:has(#hud.photo) #sonae-cards { display: none; }
#sonae-cards .sc { background: rgba(10,9,7,.82); border: 1px solid rgba(194,162,90,.35); color: var(--washi); font: max(13px, calc(13px * var(--text-scale, 1)))/1.4 var(--ui);
  padding: 6px 10px; min-height: 44px; display: flex; flex-direction: column; justify-content: center; }
#sonae-cards .sc b { font-weight: 700; }
#sonae-cards .sc span { color: var(--washi-dim); }
#sonae-cards .sc .bal { position: relative; height: 6px; background: rgba(0,0,0,.4); margin-top: 3px; }
#sonae-cards .sc .bal i { position: absolute; left: 0; top: 0; bottom: 0; background: #6f86a8; }
#sonae-cards .sc.warn { border-color: #c0452e; }
#sonae-cards .sc.warn .bal i { background: #c0452e; }
@media (max-width: 480px) { #sonae-cards { bottom: 78px; max-width: 70vw; } #sonae-cards .sc { font-size: 12px; } }
`;
  document.head.appendChild(st);
}
function sonaeCardsRoot() {
  let el = document.getElementById('sonae-cards');
  if (!el) { sonaeInjectStyle(); el = document.createElement('div'); el.id = 'sonae-cards'; document.body.appendChild(el); if (stackRO) stackRO.observe(el); else stackBottomLeft(); }
  return el;
}
// 左下の体力と組の札の上に、備えの札を置く。帯の数（馬・馬の息）や札の数で高さが変わるので、
// 決め打ちの高さだと重なっていた（10/5 信貴山・侍大将）。大きさが変わった時だけ測り直す
let stackRO = null;
function stackBottomLeft() {
  if (stackRO || typeof ResizeObserver === 'undefined') return;
  const place = () => {
    const bl = document.querySelector('#hud .bl'), sc = document.getElementById('sonae-cards'), sq = document.getElementById('h-squad'), sub = document.getElementById('subtitle');
    if (!bl) return;
    const H = VIEW.h, gap = 16;
    const blr = bl.getBoundingClientRect();
    let top = blr.height ? blr.top : H;
    // 左下へ動かせる組の札は、体力と備えの札の上に積む。
    const moveSquad = sq && getComputedStyle(sq).transform === 'none' && !document.documentElement.classList.contains('tc-low');
    if (!moveSquad && sq) { sq.style.removeProperty('bottom'); sq.style.removeProperty('top'); }
    // 組の札には携帯用の位置指定がある。動かさず、その上に備えの札を置く。
    if (sq && !sq.hidden && !moveSquad) {
      const r = sq.getBoundingClientRect();
      const cr = sc?.getBoundingClientRect();
      if (r.height && r.left < (cr?.right || blr.right) + gap && r.right > (cr?.left || blr.left)) top = Math.min(top, r.top);
    }
    if (sc) {
      sc.style.setProperty('bottom', `${Math.max(0, H - top + gap)}px`, 'important');
      const r = sc.getBoundingClientRect();
      if (r.height && !sc.hidden) top = r.top;
    }
    // 下から積む時は、元の上位置を外して高さの変化に合わせる。
    if (moveSquad) {
      setStyle(sq, 'top', 'auto'); sq.style.bottom = `${Math.max(0, H - top + gap) / (parseFloat(document.getElementById('hud').style.zoom) || 1)}px`;
      const r = sq.getBoundingClientRect(); if (r.height && !sq.hidden) top = r.top;
    } else {
      sq?.style.removeProperty('bottom'); sq?.style.removeProperty('top');
    }
    // 台詞が知らせの欄に入っている時は、その欄の配置を保つ。
    if (H > 620 && !document.documentElement.classList.contains('touch') && !sub?.closest('#battle-notices')) {
      if (sub) { setStyle(sub, 'left', '20px'); sub.style.transform = 'none'; sub.style.width = 'min(360px, 32vw)'; setStyle(sub, 'maxWidth', 'none'); sub.style.textAlign = 'left'; sub.style.bottom = `${Math.max(0, H - top + gap)}px`; }
    } else {
      if (sub) for (const prop of ['left', 'transform', 'width', 'max-width', 'text-align', 'bottom']) sub.style.removeProperty(prop);
    }
  };
  stackRO = new ResizeObserver(place);
  for (const el of [document.querySelector('#hud .bl'), document.getElementById('sonae-cards'), document.getElementById('h-squad'), document.getElementById('subtitle')]) if (el) stackRO.observe(el);
  // 携帯では名前の札の高さから組の位置が変わる。大きさが同じでも、位置の変更後に積み直す。
  // 札の style・class は毎コマ変わるので、位置の積み直しは 0.25 秒に一度まで（毎コマ getBoundingClientRect で配置をやり直すと一コマ 1〜2ms・重いコマで 8ms 超。10/20）
  // 大きさの変化は上の ResizeObserver がその場で拾う。
  let pending = false, placedAt = 0;
  const positionObserver = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; placedAt = performance.now(); place(); }, Math.max(0, 250 - (performance.now() - placedAt)));
  });
  positionObserver.observe(document.getElementById('hud'), { attributes: true, attributeFilter: ['style', 'class'] });
  window.addEventListener('resize', place);
  place();
}
function moraleWordSC(m) { return m >= 70 ? '高い' : m >= 45 ? 'ふつう' : m >= 25 ? '低い' : '崩れかけ'; }
function sonaeCardRow(S, warn) {
  const m = Math.max(0, Math.round(S.morale()));
  return `<div class="sc${warn ? ' warn' : ''}"><b>${esc(S.name)}</b><span>${S.count()}人・士気${moraleWordSC(m)}（${esc(S.state)}）</span><div class="bal"><i style="width:${Math.max(0, Math.min(100, m))}%"></i></div></div>`;
}

// ---- 野戦陣地の HUD（yasenHud）の小さな部品。見るだけ（押せる札にしない）----
function yasenHudInjectStyle() {
  if ($('yasen-style')) return;
  const st = document.createElement('style');
  st.id = 'yasen-style';
  st.textContent = `
#yasen-hud { position: fixed; right: calc(10px + env(safe-area-inset-right, 0px)); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 12; display: flex; flex-direction: column; gap: 4px; pointer-events: none; max-width: 42vw; align-items: flex-end; }
#yasen-hud[hidden], body:has(#hud.photo) #yasen-hud { display: none; }
#yasen-hud .yb, #yasen-hud .yz { background: rgba(10,9,7,.82); border: 1px solid rgba(194,162,90,.35); color: var(--washi); font: max(13px, calc(13px * var(--text-scale, 1)))/1.4 var(--ui);
  padding: 4px 10px; min-height: 22px; display: flex; align-items: center; gap: 6px; }
#yasen-hud .yb span { color: #d8b04a; }
#yasen-hud .yb i { font-style: normal; color: var(--washi-dim); }
#yasen-hud .yz { flex-direction: column; align-items: flex-end; min-height: 44px; justify-content: center; }
#yasen-hud .yz span { color: var(--washi-dim); font-size: max(13px, calc(13px * var(--text-scale, 1))); }
#yasen-hud .yz small { color: var(--shu-text); font-size: max(13px, calc(13px * var(--text-scale, 1))); }
#yasen-hud .yz .bal { position: relative; width: 100px; height: 6px; background: rgba(0,0,0,.4); margin-top: 2px; }
#yasen-hud .yz .bal i { position: absolute; left: 0; top: 0; bottom: 0; background: #6f86a8; }
#yasen-hud .yz.warn { border-color: #c0452e; }
#yasen-hud .yz.warn .bal i { background: #c0452e; }
@media (max-width: 480px) { #yasen-hud { bottom: 78px; max-width: 58vw; } #yasen-hud .yb, #yasen-hud .yz { font-size: 12px; } }
`;
  document.head.appendChild(st);
}
function yasenHudRoot() {
  let el = document.getElementById('yasen-hud');
  if (!el) { yasenHudInjectStyle(); el = document.createElement('div'); el.id = 'yasen-hud'; document.body.appendChild(el); }
  return el;
}
