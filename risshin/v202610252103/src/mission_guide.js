// 任務の手引き。印・形・材質は使い回し、行き先と進みは半秒ごとに読む。
import { S } from './settings.js';
import { intelText } from './battle_intel.js';
import { deckAt } from './floors.js';
import { sightScreenUnit } from './battle_sight.js';
import { noOps } from './speech_clean.js';

// 桶狭間より後は、教えの設定によらず行き先と目的だけにする。
function fieldGuide(rt) {
  return !rt.def.town && !rt.def.dojo && rt.def.key !== 'inou' && rt.def.key !== 'okehazama';
}

function fieldText(text) {
  return noOps(String(text || '').replace(/「はなす」を\s*おそう/g, '話を聞け'))
    // 共通の言い換えで残る指の動かし方も、案内には含めない。
    .replace(/[^。！？、\n]*(?:触る|触れ|指で|指を|親指|釦|ボタン|キー|クリック|なぞ|おそう|押す|押して|押し続け)[^。！？、\n]*/g, '')
    .replace(/^[。！？、\s]+|[、\s]+$/g, '').replace(/、。/g, '。').trim();
}

function init(rt) {
  // 行き先の形は画面の印一つにまとめ、地面には重ねない。
  return rt.missionGuide = { marker: null, closeEnemy: null,
    closeEnemyFilter: (enemy) => !enemy.fleeing && !enemy.woundOut && !enemy.civ && !enemy.isStruct &&
      Math.abs(enemy.pos.y - rt.player.u.pos.y) < 2 && !rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, enemy.pos) && sightScreenUnit(rt, enemy),
    pos: { x: 0, y: 0, z: 0 }, objective: null, waitObjective: { id: '_wait', kind: 'guide', text: '組のそばで構え、次の下知を待て', state: '', t: -99 }, notifiedKey: '', distance: 0, label: '', floorHint: '', scan: 0, draw: 0, key: '', best: Infinity, progress: '',
    stalled: 0, lastSay: -99, spoken: new Set() };
}

// 札・印・声で共有する、今の一件。時間だけで下知を入れ替えない。
export function currentObjective(rt) {
  let main = null, order = null, other = null;
  for (const o of rt.objectives) {
    if (o.state || o.kind === 'note') continue;
    if (o.kind === 'main') { if (!main || (o.t ?? 0) >= (main.t ?? 0)) main = o; }
    else if (o.kind === 'order') { if (!order || (o.t ?? 0) >= (order.t ?? 0)) order = o; }
    else if (!other || o.progress && !other.progress) other = o;
  }
  if (rt.def.sideTaskAfter && main) return main;
  return order && (!main || order.progress || (order.t ?? 0) >= (main.t ?? 0)) ? order : main || order || other;
}

// 待機の札と地面の印は、現在の持ち場と同じ到着判定を使う。
export function missionWaitReached(rt) {
  const g = rt.missionGuide, m = g?.marker;
  if (!m || g.objective !== currentObjective(rt) || m.guidePerson ||
      !(m.waitAction || m.waitGuide || /^(wait|guard)$/.test(m.guideArea))) return null;
  const pos = m.guideDestination?.() || g.pos, p = rt.player.u.pos;
  return m.waitArrived?.() ?? Math.hypot(pos.x - p.x, pos.z - p.z) < (rt.def.defendGuideRadius?.(rt, m) ?? m.guideRadius ?? 8);
}

// 「つけ」だけの下知も、実際について行く一人と札をそろえる。
export function missionFollowTarget(rt, heading = rt.def.missionHeading?.(rt) || currentObjective(rt)?.text || '') {
  if (!/^(?:つけ|続け|(?:味方|仲間|この人|[^。！？、]+の旗)について(?:いけ|行け|いく)?|[^。！？、]+に続け)[。！]?$/.test(heading.trim())) return null;
  const m = rt.missionGuide?.marker;
  const u = (typeof m?.guidePerson === 'function' ? m.guidePerson() : m?.guidePerson) ||
    rt.def.missionAlly?.(rt) || rt.hostGroup?.leader;
  return u?.alive && !u.gone && !u.fleeing && !u.woundOut && u !== rt.player.u && u.team === rt.player.u.team ? u : null;
}

// 任務は右上の一行。待機と火付けは実際の判定に合わせる。
export function missionCaption(rt, title = currentObjective(rt)?.text || '') {
  let heading = (rt.def.missionHeading?.(rt) || title).replace(/(?:赤い印|▼)の(?:兵|敵)を(?:倒せ|たおせ)/g, 'この敵をたおせ');
  // 桶狭間は目的の一行を保つ。接近や間合いは頭上の▼の形だけで示す。
  if (rt.def.key === 'okehazama') return heading;
  if (rt.def.key === 'inou') {
    // 間合い・命中・討ち取りは本人の▼で返し、任務の一行は保つ。
    return heading;
  }
  if (rt.def.key === 'moribe') return heading;
  // 討つ任務も、届くまでは移動の印と同じ一行にする。
  if (!rt.def.town && !rt.def.dojo && /▼.*(?:たおせ|倒せ)/.test(heading)) {
    const p = rt.player, enemy = rt.army.missionMarkedEnemy || rt.def.missionSignTarget?.(rt);
    if (p.inRange && p.rangeCueTarget?.alive && p.rangeCueTarget.team !== p.u.team) return '▼の敵をたおせ';
    if (enemy?.alive && Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) < 7) return '▼の敵へ近づけ';
    // 遠い間も相手の名で言う。画面に無い「矢印」という字は使わない（テストプレイの声 10/24）。
    return heading;
  }
  if (rt.def.key === 'inou' || rt.def.key === 'okehazama') return heading;
  if (/^(敵をたおす|ここで待つ|火をつける)$/.test(heading)) return heading;
  const fireMarker = rt.missionGuide?.marker;
  if (fireMarker?.guideSymbol === 'fire') {
    const action = rt.nearestInteract();
    if (action?.id === fireMarker.id && /火/.test(action.label)) return '火をつける';
  }
  // 桶狭間は、雨・出発・合図という待つ目的を戦の一行に残す。
  if (rt.def.key !== 'okehazama' && rt.def.key !== 'moribe' && /待[つてと]|^(旗にもどれ|丸まで行け)$/.test(heading)) {
    const reached = missionWaitReached(rt);
    if (reached !== null) heading = reached ? rt.def.waitOrderLabel?.(rt, true) || '輪の中で待とう' : /旗にもどれ/.test(heading) ? '旗へもどろう' : '旗へ行こう';
  }
  // 守備の札も印も同じ到着判定を使い、移動中に「守ろう」を出さない。
  const marker = rt.missionGuide?.marker;
  if (marker?.guideDefend || marker?.guideArea === 'guard') {
    const reached = missionWaitReached(rt);
    if (reached === true) {
      const enemy = rt.missionGuide?.closeEnemy;
      return enemy?.alive && !enemy.gone && !enemy.fleeing && enemy.team !== rt.player.u.team &&
        Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) < 6 ? '敵をたおす' : 'ここで待つ';
    }
    if (reached === false) heading = '旗へ行こう';
  }
  if (missionWaitReached(rt) === true && /輪.*待とう/.test(heading)) heading = 'ここで待とう';
  heading = heading.replace(/旗にもどれ/g, '旗へもどろう');
  if (missionFollowTarget(rt, heading) || missionFollowTarget(rt)) return 'この人について';
  else if (/^(つけ|続け)$/.test(heading)) heading = missionWaitReached(rt) === true ? 'そのまま待とう' : '丸まで行け';
  return noOps(goalText(rt, heading))
    .split(/[。！？\n]/)
    .map(line => line.trim().replace(/討ち取る$|討ち取れ$|たおそう$|たおす$/, '倒せ'))
    .find(line => line && !/構え|かまえ|かまえる|ふせ[ぐげ]|防いで|押し|なぞ/.test(line)) || '';
}

// 案内の札と声では英字の操作説明を畳む。任務の原文は変えない。
export function goalText(rt, text) {
  const plain = intelText(rt, text);
  const label = (fieldGuide(rt) ? fieldText(plain) : plain)
    .replace(/(?:赤い印|▼)の(?:兵|敵)を(?:倒せ|たおせ)/g, 'この敵をたおせ')
    .replace(/法螺貝/g, 'ほらの音').replace(/陣太鼓の早打ち＝総懸かり/g, '早い太鼓で、いっせいに進め').replace(/ほらの音と退き太鼓＝退け/g, '低い音で、もどれ')
    .replace(/「突く」/g, '「つく」')
    .replace(/この人と話す/g, '近づいて話す')
    .replace(/（[^）]*[A-Za-z][^）]*）/g, '').replace(/[A-Za-z]+/g, '操作');
  if (fieldGuide(rt)) return label || '味方の旗へ。次の下知を聞け';
  return label.replace(/組頭の旗へ進み、下知を聞け|この旗へ進め/g, '旗へ すすめ')
    .replace(/組の旗に続け[。．](?:敵が来たら構えよ|見張りには構えよ)/g, '旗についていけ')
    .replace(/組の旗に続け。道をふさぐ敵を倒せ/g, '旗についていけ');
}

// 短い札だけ言い換え、任務の判定や一覧の原文は保つ。
export function taskText(rt, text) {
  const label = goalText(rt, rt.def.taskText?.(rt, text) || text);
  return !fieldGuide(rt) && /旗についていけ/.test(label) && rt.guideEnemyShown && rt.guideEnemy?.alive ? '敵をたおせ' : label;
}

// 任務札と行き先で同じ呼び方を使う。
export function destinationText(rt, text) {
  const g = rt.missionGuide;
  // 戦固有の短い行動を、難しい地名や役目の名前で引き延ばさない。
  if (rt.def.keepDestinationTask) return text;
  if (fieldGuide(rt)) {
    const task = goalText(rt, text);
    // 行動をそのまま出す戦では、印の名前に「へ」を足して二重にしない。
    if (rt.def.keepDestinationTask) return task;
    if (!g?.marker || g.objective !== currentObjective(rt)) return task;
    const name = fieldText(markerName(g.marker)).replace(/[（(].*$/, '').replace(/へ\s*$/, '').trim();
    return name && !task.includes(name) ? `${name}へ。${task}` : task;
  }
  if (!rt.def.keepTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive) return '敵をたおせ';
  if (!g?.marker || g.objective !== currentObjective(rt)) return text;
  if (/倒せ|たおせ|たおす|討ち取|崩せ|敵.*止め|敵.*押し返/.test(text)) return text;
  if (g.marker.guideArea === 'wait') {
    const reached = g.distance < (g.marker.guideRadius || 8);
    return rt.def.waitOrderLabel?.(rt, reached) || (reached ? 'ここで まて' : g.marker.guideFlag ? '旗へ すすめ' : 'ここへ進もう');
  }
  if (g.marker.guideArea === 'retreat') return g.distance < (g.marker.guideRadius || 3) ? text : 'ここへ戻る';
  if (g.marker.guidePerson) {
    if (!g.marker.guideTalk) return 'この人に 近づこう';
    const it = rt.nearestInteract();
    const pos = it && (typeof it.pos === 'function' ? it.pos() : it.pos);
    return it && !it.hold && /話す|話を聞く/.test(it.label) && pos &&
      Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z) < 1 ? '「はなす」を おそう' : goalText(rt, g.marker.guideName || `${g.label.split(/[（(・　 ]/)[0]}へ`);
  }
  const name = g.label;
  if (g.marker.entrance && /門/.test(text) && !/戻|退|逃|閉|しめ|守|止め/.test(text)) return 'もんへ すすめ';
  if (/旗|組の列/.test(name)) {
    // 退避の下知を、到着の区別がない行き先名に縮めない。
    if (/にげ|逃げ|退避/.test(text)) return g.distance < (g.marker.guideRadius || 3) ? 'ここで かまえる' : 'はたまで にげろ';
    return /旗についていけ/.test(text) ? '旗についていけ' : 'この旗へ';
  }
  if (/門/.test(name) && !/戻|退|逃|閉|しめ|守|止め|枠/.test(text)) return 'もんへ すすめ';
  return text;
}

export function markerName(m) {
  const name = typeof m.label === 'function' ? m.label() : m.label;
  return typeof name === 'string' && name.trim() && !/^(null|undefined)$/.test(name.trim()) ? name.trim().replace(/（[^）]*[A-Za-z][^）]*）/g, '').replace(/[A-Za-z]+/g, '操作') : '';
}

// 道をふさぐ近い敵だけ。壁の向こうや別の階の敵で案内を消さない。
export function navigationEnemy(rt) {
  const g = rt.missionGuide, m = g?.marker, enemy = g?.closeEnemy;
  if (!m || m.person || m.guidePerson || m.guideArea || m.waitGuide || rt.def.town || rt.def.dojo ||
      g.objective !== currentObjective(rt) || rt.player.weapon === 'gun' || rt.player.weapon === 'bow') return null;
  return enemy?.alive && !enemy.gone && !enemy.fleeing &&
    rt.def.navigationEnemyAllowed?.(rt, enemy) !== false &&
    Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) < 4.5 && sightScreenUnit(rt, enemy) ? enemy : null;
}

function select(rt, g) {
  g.closeEnemy = rt.def.town || rt.def.dojo ? null : rt.army.nearestEnemy(rt.player.u, 4, g.closeEnemyFilter);
  const objective = g.objective = currentObjective(rt) || (!rt.over && !rt.def.town && !rt.def.dojo ? g.waitObjective : null);
  let best = null, score = -Infinity;
  const preferred = rt.def.guideMarker?.(rt);
  const explicit = typeof rt.def.guideMarker === 'function';
  for (const m of rt.markers) {
    // 敵の現在地へ向く矢印は出さない。旗と指物を自分で探す。
    if (!objective || objective === g.waitObjective || m.intelHidden || (explicit && !preferred) || m.red || (m.group && m.group.team !== 0) || m.noGuide || m.id === 'horse-loose' || m.id === 'focus' || /^taisho_/.test(m.id) || (m.group && !m.group.count)) continue;
    const own = rt.objectives.find((o) => o.id === m.id);
    if (own?.state) continue;
    const p = typeof m.pos === 'function' ? m.pos() : m.pos;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const label = fieldGuide(rt) ? fieldText(markerName(m)) : markerName(m);
    if (!label) continue;
    const name = label.split(/[（(・　 ]/)[0];
    const matches = m.id === objective.id || (m.id === '_col' && /列|離れるな|先手につ/.test(objective.text)) || (name.length >= 2 && objective.text.includes(name));
    const priority = typeof m.guidePriority === 'function' ? m.guidePriority() : (m.guidePriority || 0);
    // 段の道案内と戦ごとの指定は、その任務へ向かう途中の目印。無関係な印へは向けない。
    if (!matches && m.id !== preferred && !priority && !['dp', 'next', 'turn'].includes(m.id)) continue;
    if (own && own !== objective) continue;
    let s = (matches ? 100 : 0) + priority;
    if (m.guideNearest) s -= Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) * 0.1;
    if (m.id === preferred) s += 300;
    if (s > score) { score = s; best = m; g.pos.x = p.x; g.pos.z = p.z; g.pos.y = p.y ?? rt.world.heightAt(p.x, p.z); }
  }
  g.marker = best;
  g.label = best ? fieldGuide(rt) ? fieldText(markerName(best)) : markerName(best) : '';
  const u = rt.player.u.pos;
  const dy = g.pos.y - u.y;
  const upper = best && deckAt(g.pos.x, g.pos.z, g.pos.y) !== null;
  const lower = best && deckAt(u.x, u.z, u.y) !== null;
  g.floorHint = best && !best.groundGuide && Math.abs(dy) > 2 && (upper || lower) ? dy > 0 ? '上の階へ登る' : '下の階へ降りる' : '';
  const key = objective ? `${objective.id}|${goalText(rt, objective.text).replace(/[0-9０-９]+/g, '数')}|${best?.id || ''}|${g.floorHint}` : '';
  if (key !== g.key) {
    g.key = key; g.best = Infinity; g.stalled = 0;
  }
  const distance = best ? typeof best.routeDistance === 'function' ? best.routeDistance() : Math.hypot(g.pos.x - rt.player.u.pos.x, g.pos.z - rt.player.u.pos.z) : 0;
  g.distance = distance;
  const progress = objective?.progress || '';
  const fighting = !!g.closeEnemy;
  if (!best || distance < g.best - 2 || progress !== g.progress || fighting) {
    g.best = distance; g.stalled = 0;
  } else g.stalled += 0.5;
  g.progress = progress;
  // 台詞が出ている時や順番待ちには割り込まない。任務ごとに一度、八秒以上あける。
  if (fighting || S.reduceGuidance || rt.over || rt.choice || !rt.player.u.alive || g.stalled < 20 || g.spoken.has(key) || rt.t - g.lastSay < 8 ||
    (rt._sayGate || 0) > rt.t || rt.hud.subT > 0 || rt.hud.subQ.length) return;
  const text = g.floorHint ? `${g.label}は${g.floorHint}。${goalText(rt, objective.text)}` :
    distance > 5 ? `${g.label}の印へ進め。${goalText(rt, objective.text)}` : goalText(rt, objective.text);
  g.spoken.add(key); g.lastSay = rt.t;
  rt.hud.say(rt.G.lord ? '近習' : '組頭', text, 4, false, { task: true, goalKey: key });
}

export function missionGuideTick(rt, dt) {
  let g = rt.missionGuide;
  if (!g) g = init(rt);
  if ((g.scan -= dt) <= 0) { g.scan = 0.5; select(rt, g); }
  const active = !rt.over && rt.player.u.alive && !rt.choice && !rt.player.camShot &&
    rt.phase !== 'wait' && !(rt.prelude && rt.prelude !== 'done');
  if (g.key !== g.notifiedKey && active && rt.ready && rt.t - g.lastSay >= 8) {
    g.notifiedKey = g.key;
    if (g.key) {
      g.lastSay = rt.t;
      rt.hud.goalChanged(rt, g);
    }
  }
}

export function missionGuideDispose(rt) {
  rt.missionGuide = null;
}
