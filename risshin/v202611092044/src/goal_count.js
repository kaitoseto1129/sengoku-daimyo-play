// 目標の数と討つ相手の居場所（kaito 11/2 夜 U・全戦）
//   「先手を破れ」のような目標：その名の敵の組を数え、札に「先手 18／30」（討った数／初めの数）を出す（o.count。hud.js が描く）。
//   「〇〇を討て」の目標：名のある敵将の、だいたいの居場所を小地図の赤い輪（rt.goalTarget。hud_map.js が描く）と、
//   画面の外にいる時は画面の端の赤い矢印で示す。戦が自分で数（o.progress に ／）を出している時は足さない。
import { VIEW, safeInsets } from './viewport.js';
import { stageNow } from './stages.js';

const VERB = /破れ|破る|崩せ|崩す|討て|討ち取れ|討ち取る|討つ|退けよ|退けろ|追い払|蹴散ら|押し返|打ち破|突き崩|叩け|潰せ|止めよ|防げ/;
const KILL = /討て|討ち取れ|討ち取る|討つ|首を/;
const GENERIC = new Set(['敵', '兵', '隊', '者', '方', '勢', '軍', '組']);
const live = (u) => u && u.alive && !u.gone && !u.isStruct && !u.civ;

// 組の名から、目標の文に出てきそうな呼び名を取る（「今川の先手」→「今川の先手」「先手」）
function partsOf(name) {
  const n = String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  if (!n) return [];
  const out = [n];
  const i = n.lastIndexOf('の');
  if (i >= 0 && n.length - i - 1 >= 2) out.push(n.slice(i + 1));
  return out.filter((s) => s.length >= 2 && !GENERIC.has(s));
}

function matchGroups(rt, text, team) {
  let label = '', units = null;
  for (const g of rt.army.groups || []) {
    if (g.team === team || g.isPlayerSquad || !g.units?.length) continue;
    for (const part of partsOf(g.name)) {
      // 目標の的（「〇〇を」「〇〇の兵を」）になっている名だけ数える（「家康の本陣の前へ」は数えない）
      if (!(text.includes(part + 'を') || text.includes(part + 'の兵を')) || part.length < label.length) continue;
      if (part.length > label.length) { label = part; units = []; }
      for (const u of g.units) if (!u.isStruct && !u.civ && !units.includes(u)) units.push(u);
    }
  }
  return label && units.length >= 3 ? { label, units } : null;
}

function matchPerson(rt, text, team) {
  let best = null, len = 0;
  for (const u of rt.army.units) {
    if (!live(u) || u.team === team || !u.name || !(u.type === 'busho' || u.isOfficer || u.isTaisho || u.mounted)) continue;
    // 姓だけ・名だけの書き方にも合わせる（「義元を討て」「今川義元を討て」）
    const nm = u.name.replace(/[（(][^）)]*[）)]/g, '');
    const keys = [nm, nm.slice(-2), nm.slice(0, 2)].filter((k) => k.length >= 2);
    for (const k of keys) if (text.includes(k) && k.length > len) { best = u; len = k.length; }
  }
  return best;
}

export function goalCountTick(rt, dt) {
  const C = rt.goalCount || (rt.goalCount = { scan: 0, person: null, memo: new WeakMap(), textMemo: new Map(), byText: new Map(), first: '' });
  const me = rt.player?.u;
  if (!me || rt.def.town || rt.def.dojo || rt.def.noGoalCount) { rt.goalTarget = null; drawEdge(rt, C, null); return; }
  C.scan -= dt;
  if (C.scan <= 0) {
    C.scan = 0.5;
    let person = null;
    for (const o of rt.objectives || []) {
      if (o.state === 'done' || o.state === 'fail' || o.kind === 'note' || o.kind === 'guide') { o.count = ''; continue; }
      const text = o.text || '';
      if (!VERB.test(text)) { o.count = ''; continue; }
      // 兵への参照は札に持たせない（札は字にして比べられる）。札ごとの覚えは別の表へ
      let m = C.memo.get(o);
      if (!m || m.text !== text) {
        m = { text, set: matchGroups(rt, text, me.team), person: KILL.test(text) ? matchPerson(rt, text, me.team) : null };
        C.memo.set(o, m);
      }
      // 戦が自分で数を出している時は重ねない
      const own = /\d+\s*[／/]\s*\d+/.test(o.progress || '');
      const S = m.set;
      if (S && !own && !(m.person && S.units.length < 6)) {
        let dead = 0;
        for (const u of S.units) if (!u.alive) dead++;
        // 11/9 分母は決めたら増やさない
        const den = C.den || (C.den = new Map()), prev = den.get(S.label), tot = prev == null ? S.units.length : Math.min(prev, S.units.length);
        if (prev == null) den.set(S.label, tot);
        o.count = `${S.label} ${Math.min(dead, den.get(S.label))}／${den.get(S.label)}`;
      } else o.count = '';
      if (!person && live(m.person)) person = m.person;
    }
    // 右上の「目標」の札（stages.js の段の目標）にも同じ数を付ける。合わない時は今の任務の数を、まだの一つ目に付ける
    C.byText.clear(); C.first = '';
    for (const o of rt.objectives || []) if (o.count && !C.first) C.first = o.count;
    const stg = stageNow(rt);
    for (const goal of stg?.goals || []) {
      if (goal.done || !VERB.test(goal.text)) continue;
      let m = C.textMemo.get(goal.text);
      if (!m) { m = { set: matchGroups(rt, goal.text, me.team), person: KILL.test(goal.text) ? matchPerson(rt, goal.text, me.team) : null }; C.textMemo.set(goal.text, m); }
      if (m.set) { let dead = 0; for (const u of m.set.units) if (!u.alive) dead++; const den = C.den || (C.den = new Map()); if (!den.has(m.set.label)) den.set(m.set.label, m.set.units.length); const dn = den.get(m.set.label); C.byText.set(goal.text, `${m.set.label} ${Math.min(dead, dn)}／${dn}`); }
      if (!person && live(m.person)) person = m.person;
    }
    C.person = person;
    // だいたいの居場所：12m の升に丸め、半径 18m の輪で示す（ぴたりとは教えない）
    if (person) {
      const gx = Math.round(person.pos.x / 12) * 12, gz = Math.round(person.pos.z / 12) * 12;
      const T = rt.goalTarget || (rt.goalTarget = { x: 0, z: 0, r: 18 });
      T.x = gx; T.z = gz;
    } else rt.goalTarget = null;
  }
  drawEdge(rt, C, live(C.person) && me.alive && !rt.over ? C.person : null);
}

// 画面の外（または 40m より遠い）にいる時だけ、端に赤い矢印。近くで見えていれば頭上の赤い▼に任せる
function drawEdge(rt, C, P) {
  const hud = rt.hud;
  let el = C.el;
  const me = rt.player?.u;
  // 画面の端の赤い矢印は出さない（五3「矢印は使わない」・11/6 共通の係で全戦。小地図の赤い輪は残す）
  const hide = !rt.def.goalEdgeArrow || !P || !me || rt.choice || hud.introWaiting || hud.bigmap || rt.player.camShot || rt.game?.photo ||
    hud.root.classList.contains('photo') || hud.root.classList.contains('ending');
  if (hide) { if (el) el.style.display = 'none'; return; }
  if (!el || !el.isConnected) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
    el.innerHTML = '<path fill="#d8392b" stroke="#2a0b07" stroke-width="3" stroke-linejoin="round"/>';
    hud.root.appendChild(el); C.el = el;
  }
  const cam = rt.camera, W = VIEW.w, H = VIEW.h, sa = safeInsets();
  const v = C.v || (C.v = cam.position.clone());
  v.set(P.pos.x, P.pos.y + 1.6, P.pos.z).project(cam);
  const d = Math.hypot(P.pos.x - me.pos.x, P.pos.z - me.pos.z);
  const onScreen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9;
  const path = el.children[0];
  if (onScreen && d < 40) { path.setAttribute('d', ''); el.style.display = ''; return; }
  const dir = C.dir || (C.dir = cam.position.clone());
  cam.getWorldDirection(dir);
  const yaw = Math.atan2(dir.x, dir.z), dx = P.pos.x - me.pos.x, dz = P.pos.z - me.pos.z;
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const a = Math.atan2(-fwd, right);
  // 前にいる時は画面の上寄り、後ろは下寄りの縁へ（任務の札・命の棒を避けて内側に）
  const cx = W / 2 + Math.cos(a) * (W / 2 - sa.left - 90), cy = H * 0.42 + Math.sin(a) * (H * 0.42 - sa.top - 60);
  path.setAttribute('d', 'M-20-9H4V-20L24 0L4 20V9H-20Z');
  path.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(a * 180 / Math.PI).toFixed(1)})`);
  el.style.display = '';
}

// 段の目標の字に付ける数（無ければ ''）。first が真なら、合う数が無い時に今の任務の数を返す
export function goalCountText(rt, text, first) {
  const C = rt.goalCount;
  if (!C) return '';
  return C.byText.get(text) || (first && C.byText.size === 0 ? C.first : '');
}

export function goalCountDispose(rt) {
  if (rt.goalCount?.el) rt.goalCount.el.remove();
  rt.goalCount = null; rt.goalTarget = null;
}
