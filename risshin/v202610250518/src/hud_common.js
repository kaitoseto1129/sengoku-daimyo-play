import { rescueTarget as woundedRescueTarget, retreatRequired as dangerRetreatRequired } from "./battle_danger.js";
import { isTouch } from "./touch.js";
import { currentObjective, navigationEnemy } from "./mission_guide.js";
import { jpNum } from "./bhelp.js";
import { rainDanger } from "./arrow_rain.js";
import { decorateTerms } from "./glossary.js";
import { GENERALS } from "./units.js";
import { drawMon } from "./textures.js";
import { S } from "./settings.js";
import { knownName } from "./battle_sight.js";
import { VIEW } from "./viewport.js";


const EMPTY_MAP_PATH = [];

// 行き先と操作の札に共用する和紙。繊維と欠けた縁は一度だけ描いて写す。
let fieldPaper;
export function drawFieldPaper(g, x, y, width, height) {
  if (!fieldPaper) {
    fieldPaper = document.createElement('canvas');
    fieldPaper.width = 192; fieldPaper.height = 64;
    const p = fieldPaper.getContext('2d');
    p.beginPath(); p.moveTo(3, 3); p.lineTo(63, 1); p.lineTo(123, 3);
    p.lineTo(189, 2); p.lineTo(191, 30); p.lineTo(188, 62);
    p.lineTo(124, 60); p.lineTo(62, 63); p.lineTo(2, 61); p.closePath();
    p.fillStyle = '#e6d7b6'; p.fill();
    p.strokeStyle = '#6b5435'; p.lineWidth = 2; p.stroke(); p.clip();
    p.strokeStyle = 'rgba(100,75,40,.12)'; p.lineWidth = .5;
    for (let i = 0; i < 90; i++) {
      const px = (i * 53) % 192, py = (i * 29) % 64;
      p.beginPath(); p.moveTo(px, py); p.lineTo(px + 4 + i % 9, py + 1); p.stroke();
    }
  }
  g.drawImage(fieldPaper, x, y, width, height);
}

const YASEN_BANDS = ['A', 'B', 'C'];

const SONAE_ALERT = new Set(['敗走', '混乱', '動揺']);


// 戦では行き先か敵一人だけを示す。町と稽古の操作案内は専用のまま。
function singleBattleGuide(rt) { return !rt.def.town && !rt.def.dojo; }

function treatmentRequired(rt) {
  const p = rt.player;
  return singleBattleGuide(rt) && p.u.alive && !rt.over &&
    (p.u.hp < p.u.maxHp || p.u.wounds?.bleed > .0001);
}

// 旗の近くでは馬上でも自動で回復する。
function dismountFirst(rt) {
  return false;
}

// 救援任務の相手も共通の案内へ渡す。被害や救援の猶予には触れない。
function rescueTarget(rt) { return rt.def.rescueGuideTarget?.(rt) || woundedRescueTarget(rt); }

// 道筋の途中の点ではなく、守る持ち場そのものへの距離で案内を切り替える。
function guardPostDistance(rt, guide) {
  const point = guide?.marker?.guideDestination?.() || guide?.pos;
  return point ? Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z) : Infinity;
}

function defenseRadius(rt, marker) {
  return rt.def.defendGuideRadius?.(rt, marker) || marker.guideRadius || 8;
}

// 攻撃釦に書かれた名前と同じ言葉で、押す場所を案内する。
function attackOperation(rt) {
  const p = rt.player;
  if (p.weapon === 'gun' || p.weapon === 'bow') return isTouch ? `「${p.weapon === 'bow' ? '射る' : '攻撃'}」を押して狙い、離して放つ` : 'マウスの左ボタンで狙い、離して放つ';
  return isTouch ? `「${p.weapon === 'sword' ? 'きる' : 'つく'}」を押す` : `左クリックで${p.weapon === 'sword' ? '斬る' : '突く'}`;
}

function byAllyDistance(a, b) { return a.d - b.d; }


// 敵の頭上と同じ刀の形を、既存の札でも使う。
const ENEMY_SIGN = '<svg width="24" height="34" viewBox="-24 -64 48 64" style="vertical-align:middle;margin-right:6px" aria-hidden="true"><path d="M-5-20L9-49L16-57L15-45L1-17Z" fill="#ffb49d" stroke="#14120f" stroke-width="7" stroke-linejoin="round"/><path d="M-10-23L6-15M-3-18L-9-6" fill="none" stroke="#14120f" stroke-width="9"/><path d="M-10-23L6-15M-3-18L-9-6" fill="none" stroke="#ffb49d" stroke-width="4"/></svg>';

const RESCUE_SIGN = '<svg class="rescue-sign" viewBox="-34 -64 60 68" aria-hidden="true"><path d="M-14-4L-27-22Q-31-30-23-30L-14-21V-45Q-14-53-7-49V-33V-54Q-3-61 2-54V-33V-50Q8-57 11-49V-30V-41Q18-47 19-38V-19L12-4Z" fill="#fff3ba" stroke="#14120f" stroke-width="5" stroke-linejoin="round"/></svg>';

const FLOOR_FOOTPRINT = [-.18, -.5, .14, -.5, .17, -.18, .25, .22, 0, .65, -.13, .5, -.23, .28, -.17, -.08];

const FLOOR_DIRECTION = [0, .9, -.48, .25, -.2, .25, -.2, -.9, .2, -.9, .2, .25, .48, .25];

const FLOOR_CROSS = [-.18, -.65, .18, -.65, .18, -.18, .65, -.18, .65, .18, .18, .18, .18, .65, -.18, .65, -.18, .18, -.65, .18, -.65, -.18, -.18, -.18];


// 人に話す印や戸口は専用の案内を使い、進む先の旗だけ地面に示す。
function groundFlag(guide) {
  const m = guide?.marker;
  return !!m && !m.guidePerson && !m.entrance && !m.red &&
    (!m.guideArea || m.guideArea === 'wait') &&
    (m.guideArea === 'wait' || m.waitGuide || m.guideFlag || /旗|組の列/.test(guide.label));
}


// 遠い持ち場へ進む時は行き先を主にする。戦う必要がある任務は相手を示す。
function travelSignPriority(rt) {
  const guide = rt.missionGuide;
  return singleBattleGuide(rt) && guide?.objective === currentObjective(rt) &&
    (rt.def.routeGuidePriority?.(rt) || groundFlag(guide) &&
      guide.distance >= (guide.marker.guideRadius || 8) && !combatTask(rt) && !navigationEnemy(rt));
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
  return metres === 0 && rt.def.arrivalLabel ? rt.def.arrivalLabel : `${metres}歩`;
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


// 負傷時は道案内より退避を優先する。被害や救援の判定は変えない。
function retreatRequired(rt) {
  return woundRetreat(rt) || !rt?.def?.routeGuidePriority?.(rt) && dangerRetreatRequired(rt);
}


// 任務札・地面の札・操作の案内は同じ短い言葉で示す。
function retreatGuideText(rt, reached, fallback) { return ''; }

// 回復は自動。操作や待ち方の字は出さない。
function treatmentGuideText(rt, cue) { return ''; }


// 毎コマ書き替える札：前と同じ値なら DOM に触らない（重さの係。差分は最小に）
const _domCache = new WeakMap();

function setText(el, v) { if (_domCache.get(el) === v) return; _domCache.set(el, v); el.textContent = v; }

function setHtml(el, v) { const k = 'h:' + v; if (_domCache.get(el) === k) return; _domCache.set(el, k); el.innerHTML = v; if (el.id === 'subtitle' || el.id === 'h-who') decorateTerms(el); }


// 歩数や進み具合が動いても、変わらない任務の行は作り直さない。
const _listRowCache = new WeakMap();

function setListRows(el, rows) {
  let previous = _listRowCache.get(el);
  if (!previous) { previous = []; _listRowCache.set(el, previous); }
  let changed = 0;
  for (let i = 0; i < rows.length; i++) if (previous[i] !== rows[i]) changed++;
  // 初回や全行の入れ替えは一度で読む。行ごとの解析・挿入を重ねない。
  if (changed && changed === rows.length) {
    el.innerHTML = rows.join('');
    for (let i = 0; i < rows.length; i++) previous[i] = rows[i];
    previous.length = rows.length;
    return;
  }
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

const SHORT_KEY_NAMES = { 左上の横矢印キー: '横矢', 空白: '空白', 右の棒を押し込む: '右押込' };

const SHORT_LETTERS = ['えー', 'びー', 'しー', 'でぃー', 'いー', 'えふ', 'じー', 'えいち', 'あい', 'じぇー', 'けー', 'える', 'えむ', 'えぬ', 'おー', 'ぴー', 'きゅー', 'あーる', 'えす', 'てぃー', 'ゆー', 'ぶい', 'だぶりゅー', 'えっくす', 'わい', 'ぜっと'];
function shortcutKey(s) {
  if (/^[A-Z]$/i.test(s)) return SHORT_LETTERS[s.toUpperCase().charCodeAt(0) - 65];
  if (/^F\d+$/.test(s)) return '上段' + s.slice(1);
  return SHORT_KEY_NAMES[s] || s.replace(/のキー$/, '');
}


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
const TAG_COL = { ok: '#ece4d2', mid: '#d8b04a', low: '#c0452e', gone: '#5a534a' };

function tagOf(g) {
  const n = g.count, n0 = g.initial || n || 1;
  if (!n || g.routed) return 'gone';
  const r = n / n0;
  return r >= 0.7 ? 'ok' : r >= 0.4 ? 'mid' : 'low';
}

// 隊を率いる名のある武将（いなければ null）
function groupGeneral(g) {
  for (const u of g.units) if (u.alive && u.name && !u.isSub && (u.type === 'busho' || GENERALS[u.name.replace(/^.* /, '')])) return u;
  return null;
}

// 敵方の家紋（遠景の大軍の敵味方を、軍配 gunbai.js と同じく家紋で見分ける）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku', 'maru', 'namu', 'yatagarasu', 'sagarifuji', 'miyoshi', 'rokkaku', 'uesugi', 'mori']);

// 隊の種類（遠目の見分け）：本陣・鉄砲・騎馬・弓・槍
function groupKind(g) {
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
    return `<kbd class="cap" title="文字釦の${row}段、左から${col}番目" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><svg aria-hidden="true" viewBox="0 0 76 23" style="width:76px;height:23px">${keys}</svg>${row}段${col}</kbd>`;
  });
  if (isTouch) return s.replace(TOUCH_BTN, (m, b) => `<span class="tbtn">${b}</span>`);
  return s.replace(/(^|[\s（(／・、。])((?:[上中下]段[0-9]+|機能[0-9]+|F[0-9]{1,2}|[A-Z]|ダブリュー|エックス|ゼット|エイチ|エー|ビー|シー|ディー|イー|エフ[0-9]*|ジー|アイ|ジェー|ケー|エル|エム|エヌ|オー|ピー|キュー|アール|エス|ティー|ユー|ブイ|ワイ|左シフト|右シフト|スペース|タブ|Enter|Esc|オルト|上矢印|下矢印|左矢印|右矢印))(?=[\s）)／・で、。をのか]|$)/g, (m, a, b) => `${a}${b.split(' ').map((k) => `<kbd class="cap">${k}</kbd>`).join('')}`);
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
#hud #prompt button[data-work].fire-work { grid-template-columns:28px minmax(0,1fr); }
#hud #prompt button[data-work].fire-work svg { width:28px; height:36px; grid-row:1 / 3; }
#hud #prompt button[data-work].fire-work small { grid-column:2; }
#hud #prompt button[data-work].fire-work { grid-template-columns:44px minmax(0,1fr); padding-left:62px; min-height:56px; }
#hud #prompt button[data-work].fire-work svg { position:absolute; left:18px; top:10px; width:28px; height:36px; }
#hud #prompt button[data-work].fire-work span { grid-column:1 / -1; }
#hud #prompt button[data-work].fire-work small { display:none; }
#hud #prompt button[data-work].fire-work .holdbar { left:8px; top:4px; right:auto; bottom:auto; width:44px; height:44px; border-radius:50%; background:conic-gradient(#fff3ba var(--hold-progress,0%),#615745 0); -webkit-mask:radial-gradient(circle,transparent 57%,#000 60%); mask:radial-gradient(circle,transparent 57%,#000 60%); }
#hud #prompt button[data-work].fire-work .holdbar b { display:none; }

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
/* 火付けは戸口のすぐ脇の一枚を押す。ほかの作業の並びは保つ。 */
html body #hud #prompt.work-action.door-work:not([hidden]) {
 position:absolute !important; inset:var(--door-work-y, 120px) auto auto var(--door-work-x, 16px) !important;
 transform:none !important; width:max-content !important; max-width:calc(100vw - 32px); margin:0 !important;
}
#hud #prompt.door-work button[data-work] { min-height:56px; font-size:max(20px, calc(20px * var(--text-scale, 1))); }

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
/* 攻撃元は「！」と短い役目。行き先の旗や移動矢印と形を分ける。 */
#hud #dmgdir { width:44px; height:44px; border:0; border-radius:0; margin:0; opacity:0; animation:none; filter:drop-shadow(0 0 2px #14120f); color:#fff4eb; font:bold 12px/18px sans-serif; text-align:center; padding-top:26px; box-sizing:border-box; }
#hud #dmgdir.on { opacity:1; }
#hud #dmgdir::before { content:'！'; position:absolute; top:0; left:10px; width:24px; height:24px; border:2px solid #fff4eb; border-radius:50%; box-sizing:border-box; color:#fff4eb; background:#752515; font:bold 18px/20px sans-serif; }
#hud #dmgdir::after { content:none; }
#hud #dmgdir.has-word { background:linear-gradient(transparent 26px,#14120f 26px); }
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
/* 技の列は釦名・絵・技名を縦に分け、拡大した字も省略せず折り返す。 */
#hud #h-bottom .slot { box-sizing:border-box; height:auto; min-height:64px; padding:2px 4px 4px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:2px; }
#hud #h-bottom .slot.off { display:none; }
#hud #h-bottom .slot.cur { outline:2px solid #e8c25a; outline-offset:-2px; }
#hud #h-bottom[hidden] { display:none !important; }
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
#hud .dodge-button { position:relative; isolation:isolate; width:100%; height:100%; min-height:44px; box-sizing:border-box; display:flex; align-items:center; justify-content:flex-start; gap:8px; border:2px solid #fff3ba; border-radius:8px; background:rgba(20,18,15,.9); color:#fff3ba; font:bold 18px/1.3 sans-serif; padding:4px; touch-action:none; pointer-events:auto; }
#hud .dodge-button::before { content:""; position:absolute; inset:0; z-index:-1; border-radius:5px; background:linear-gradient(90deg,rgba(255,243,186,.3) var(--dodge-fill,0%),transparent var(--dodge-fill,0%)); pointer-events:none; }
#hud .dodge-button svg.dodge-frame { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
#hud .dodge-button .dodge-frame rect { stroke:#fff; stroke-width:4px; vector-effect:non-scaling-stroke; }
#hud .dodge-button svg { width:32px; height:32px; flex:none; }
#hud .dodge-button .dodge-gesture { width:72px; height:72px; }
#hud .dodge-button.compact .dodge-gesture { width:64px; height:64px; }
#hud .dodge-button .dodge-direction { display:none; }
#hud .dodge-button.compact { border-width:2px; font-size:max(16px,calc(16px * var(--text-scale,1))); }
#hud .dodge-button span { min-width:0; min-height:44px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:center; padding:4px; border:0; background:transparent; text-align:left; }
#hud .dodge-button b { display:block; font-size:inherit; line-height:1.3; white-space:nowrap; overflow-wrap:normal; }
#hud .dodge-button small[hidden] { display:none; }
#hud .dodge-button small { display:block; font-size:max(16px,calc(16px * var(--text-scale,1))); }
#hud .dodge-button:is(:active,[aria-pressed="true"]) span { background:#49402a; }
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

function moraleWord(m) {
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

export { EMPTY_MAP_PATH, YASEN_BANDS, SONAE_ALERT, singleBattleGuide, treatmentRequired, dismountFirst, rescueTarget, guardPostDistance, defenseRadius, attackOperation, byAllyDistance, ENEMY_SIGN, RESCUE_SIGN, FLOOR_FOOTPRINT, FLOOR_DIRECTION, FLOOR_CROSS, groundFlag, travelSignPriority, destinationDistance, firstTask, woundRetreat, recovering, combatTask, taskLabel, taskDetail, retreatRequired, retreatGuideText, treatmentGuideText, _domCache, setText, setHtml, _listRowCache, setListRows, SHORT_KEY_NAMES, shortcutKey, setClass, setHidden, setStyle, setCssVar, setAttr, subtitleMeasure, subtitlePage, _dropSp, dropSprite, setWidth, TAG_COL, tagOf, groupGeneral, ENEMY_MON, groupKind, BARK_FAMILY, ORDER_MARK, FACE_CACHE, faceCanvas, FACE_CLS, faceCls, STD_SVG, KIND_WORD, BRUSH, brushImage, FUDE, fudeImage, ICON, $, esc, TOUCH_BTN, keyCaps, tensionCss, coachCss, rtsCss, MON_ICON, monIcon, leanHud, fieldLabel, shortTask, guidanceEnded, moraleWord, progressRatio, kindWord, typeName, WARNING_FAMILY, sonaeInjectStyle, sonaeCardsRoot, stackRO, stackBottomLeft, moraleWordSC, sonaeCardRow, yasenHudInjectStyle, yasenHudRoot };
