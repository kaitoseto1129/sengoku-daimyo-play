// 名のある将を討った時・勝った時・勝利の画面の「保存しました」（全戦共通の部品）
//   討ったら大きく「〇〇 討ち取ったり」・目標の札に印・残りがあれば「残り：〇〇」。最後の目標は止まらず「勝利」へ。
import { brushWord } from './victory_moment.js';

const nameOf = (u) => String(u.name || '').replace(/\s+/g, '');

// 討たれた名のある将（敵側）か
function isNamedFoe(rt, v) {
  return !!v.name && !v.civ && !v.isStruct && v.team !== rt.player.u.team && (v.type === 'busho' || v.type === 'samurai') && v.type !== 'dummy';
}

// 札の文が、その将の名を含むか（「林美作守」の札は「林美作守を討て」に合う）
function mentions(text, name) {
  const t = String(text || '').replace(/\s+/g, '');
  return !!name && t.includes(name);
}

export function namedKill(rt, v) {
  if (rt.over || rt.def.dojo || rt.def.town || !isNamedFoe(rt, v)) return;
  const done = (rt.flags.namedDown ||= new Set());
  const name = nameOf(v);
  if (done.has(name)) return;
  done.add(name);
  // 札へ印：その将を挙げた札を済みにする
  for (const o of rt.objectives.slice()) if (!o.state && mentions(o.text, name)) rt.objDone(o.id);
  // 残り：まだ札に挙がっていて生きている敵の名のある将
  const open = rt.objectives.filter((o) => !o.state && o.kind === 'main');
  const left = [];
  for (const u of rt.army.units) {
    if (!u.alive || u === v || !isNamedFoe(rt, u)) continue;
    const n = nameOf(u);
    if (!left.includes(u.name) && open.some((o) => mentions(o.text, n))) left.push(u.name);
  }
  // 戦の定義が名を伏せる役の侍は、討取りでも実名の将として呼ばわらない。
  // 任務と討取りの記録は上で済ませ、ほかの戦の表示は指定がない限り保つ。
  if (rt.def.hideNameTag?.(v)) return;
  rt.flags.killWordUntil = rt.t + 2.1;
  rt.flags.killWordRealUntil = performance.now() + 2300;   // 勝利の札（victory_card.js）はこの字が消えてから出す
  brushWord(rt, `${v.name} 討ち取ったり`, { hold: 1.5 });
  if (left.length) rt.after(2.4, () => { if (!rt.over) brushWord(rt, `残り：${left.slice(0, 3).join('・')}`, { hold: 1.8 }); });
}

let styleDone = false;
// 勝利の画面に出す、保存した印と短い字
export function mountSaved(parent, ok = true) {
  if (!parent) return;
  if (!styleDone) {
    styleDone = true;
    const st = document.createElement('style');
    st.textContent = `.vf-saved{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px auto 0;min-height:24px;color:#f1e6c4;font:600 13px "Hiragino Mincho ProN","Yu Mincho",serif;letter-spacing:.08em}
.vf-saved svg{width:18px;height:18px;flex:none}`;
    document.head.appendChild(st);
  }
  const e = document.createElement('div');
  e.className = 'vf-saved';
  e.setAttribute('role', 'status');
  e.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#d9b45a" stroke-width="1.5"/><path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#d9b45a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${ok ? '保存しました' : '！ 保存できませんでした'}</span>`;
  parent.appendChild(e);
}
