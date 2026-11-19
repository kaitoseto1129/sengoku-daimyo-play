// 接敵した名将を一度だけ見せる。兵・音源・毎コマの入れ物は増やさない。
import { playMusic } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { reduceMotion } from './settings.js';
import { shownName } from './person_label.js';

// 頭上の名札・行き先の札に、この名が今出ているか（札は十余りなので、出会った時と出ている 1.8 秒の間だけ見る）
function nameShown(name) {
  const s = shownName(name);
  for (const el of document.querySelectorAll('.field-name > span, #goal-sign .gs-tag span')) {
    if (el.textContent === s && el.offsetParent !== null && !el.closest('[hidden]')) return true;
  }
  return false;
}

export function encounterTick(rt, dt) {
  if (rt.def.town || rt.def.dojo) return;
  let e = rt.encounter;
  if (!e) e = rt.encounter = { seen: new Set(), scan: 0, left: 0, gap: 0, label: null };
  e.left = Math.max(0, e.left - dt); e.gap -= dt;
  // 11/14 iMac二十七（K080 稲生）：頭上の名札（field_signs）か行き先の札が同じ名を出している間は、真ん中の大きな白い名を出さない（名は一つだけ）
  if (e.label && !e.label.hidden && e.left > 0 && e.u && nameShown(e.u.name)) e.left = 0;
  if (e.label) e.label.hidden = e.left <= 0 || rt.over || !rt.player.u.alive;
  // K365 クラウド（11/19 中学生 bot・刀根坂190秒で3回）：:has の札隠しは置き換え（hz-has）の遅れで効かない時があり、
  //   行き先の印（.gs-tag）と大きな名の札が重なった。名の札が出ている間は #hud に印を付け、それで隠す
  if (e.label) rt.hud.root.classList.toggle('enc-on', !e.label.hidden);
  if (rt.over || !rt.player.u.alive || rt.flags.quiet || rt.choice ||
      rt.prelude && rt.prelude !== 'done' || rt.player.introT > 0) return;
  if ((e.scan -= dt) > 0 || e.gap > 0) return;
  e.scan = 0.25;
  const p = rt.player, pos = p.u.pos;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.group?.routed || u.team === p.u.team ||
        u.type !== 'busho' || !u.name || e.seen.has(u.name) ||
        Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z) > 24 ||
        rt.army.wallBetween(pos, p.u.team, u.pos) || !sightPoint(rt, u.pos, 30)) continue;
    e.seen.add(u.name); e.left = 1.8; e.gap = 8;
    if (!e.label) {
      e.label = document.createElement('div');
      // 字の幅だけの札にして画面の中ほどへ（11/11 クラウドし：左右20%の箱が右上の任務の札・中央の知らせと重なっていた）
      e.label.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);width:max-content;max-width:60%;top:36%;text-align:center;font-size:clamp(28px,5vw,46px);font-weight:bold;color:#fff0e0;text-shadow:0 2px 5px #000,0 0 12px #000;pointer-events:none;z-index:12';
      e.label.className = 'enc-name';
      if (!document.getElementById('enc-name-css')) {   // 11/17 クラウドマ三：大きな名の札（中ほど）が出る間は、行き先のピンを隠す（桶狭間 874×402 の bot で #mission-goal と重なった）
        const st = document.createElement('style'); st.id = 'enc-name-css';
        st.textContent = '#hud:has(.enc-name:not([hidden])) #mission-goal, #hud:has(.enc-name:not([hidden])) #goal-sign .gs-tag, #hud.enc-on #mission-goal, #hud.enc-on #goal-sign .gs-tag { visibility:hidden !important; }';
        document.head.appendChild(st);
      }
      rt.hud.root.appendChild(e.label);
    }
    e.u = u;
    if (nameShown(u.name)) e.left = 0;   // 名札が出ていれば曲と寄りだけ（名を二つ並べない）
    else { e.label.textContent = shownName(u.name); e.label.hidden = false; }
    playMusic('climax');
    rt.army.play('jindaiko', u.pos, 0.8);
    if (!reduceMotion() && !p.aiming && !p.camShot && !p.cine && p.lookIdle >= 0.2)
      p.cine = { x: u.pos.x, z: u.pos.z, t: 0.85, encounter: true };
    break;
  }
}

export function encounterDispose(rt) {
  rt.hud?.root?.classList.remove('enc-on');
  rt.encounter?.label?.remove();
  rt.encounter = null;
}
