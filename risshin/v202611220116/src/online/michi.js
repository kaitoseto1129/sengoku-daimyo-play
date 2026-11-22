// 初心者の道と対人戦への誘い（K603 の 77〜78・11/21 iMac k598-home）。紙：docs/kaito_online_battle_1121.md の 41〜78。
//   道＝模擬合戦 → NPC 織田 初級 → NPC 武田 中級 → 対人（強制しない。どこからでも好きに遊べる。次の一つを光らせるだけ）。
//   NPC 中級（以上）を一度勝つと「オンライン対戦に挑戦できます［対人戦へ］［NPC戦を続ける］」を一度だけ出す。
//   記録はオンラインの箱（house.js の loadOnline/saveOnline）の michi に置く：{ practice:1, npc:{ oda:{ shokyu:1 }, takeda:{ chukyu:1 } }, invited:1, pvp:1 }
//
//   k592-fujin（対戦の入口・NPC の選び・NPC の合戦）が呼ぶ口：
//     michiWin(save, { kind:'practice'|'npc'|'pvp', house, level })  … 戦の後に一度。勝った時だけ（模擬合戦は終えたら）。保存は呼ぶ側
//     shouldInvite(save)                                           … true なら openPvpInvite を出す（出したら invited を立てる）
//     openPvpInvite({ onPvp, onNpc })                              … 誘いの札（字は二行と釦二つ）
//     michiStrip(save)                                             … 対戦の入口に置く四つの段の小さな帯（DOM）。押しても何も強いない（data-step で呼ぶ側が繋いでよい）
//     nextStep(save)                                               … 'practice' | 'npc_oda_shokyu' | 'npc_takeda_chukyu' | 'pvp' | null
import { addEn } from '../i18n.js';

export const LEVELS = ['shokyu', 'chukyu', 'jokyu', 'shura'];   // 初級・中級・上級・修羅
export const LEVEL_NAME = { shokyu: '初級', chukyu: '中級', jokyu: '上級', shura: '修羅' };
const lv = (l) => Math.max(0, LEVELS.indexOf(l));
export const STEPS = [
  // K608 ④：模擬合戦は対戦の入口から外した（武将の詳細の［試す］から）。道は 織田 初級 → 武田 中級 → 対人
  { id: 'npc_oda_shokyu', name: '織田 初級', done: (m) => anyWin(m, 'oda', 'shokyu') },
  { id: 'npc_takeda_chukyu', name: '武田 中級', done: (m) => anyWin(m, 'takeda', 'chukyu') },
  { id: 'pvp', name: '対人戦', done: (m) => !!m.pvp },
];
// その家にその難易度以上で勝ったか
function anyWin(m, house, level) { const h = m.npc?.[house] || {}; return Object.keys(h).some((k) => h[k] && lv(k) >= lv(level)); }
const box = (save) => (save.michi = save.michi || { npc: {} });

export function michiWin(save, r = {}) {
  if (!save) return save;
  const m = box(save);
  if (r.kind === 'practice') m.practice = 1;
  else if (r.kind === 'pvp') m.pvp = 1;
  else if (r.kind === 'npc' && r.house && LEVELS.includes(r.level)) { m.npc = m.npc || {}; m.npc[r.house] = { ...(m.npc[r.house] || {}), [r.level]: 1 }; }
  return save;
}
// NPC 中級以上に一度勝ち、まだ誘っていない・まだ対人戦をしていない時
export function shouldInvite(save) {
  const m = save?.michi; if (!m || m.invited || m.pvp) return false;
  return Object.values(m.npc || {}).some((h) => Object.keys(h).some((k) => h[k] && lv(k) >= lv('chukyu')));
}
export function nextStep(save) { const m = save?.michi || {}; return STEPS.find((s) => !s.done(m))?.id || null; }

const CSS = `
.mc-ov{position:fixed;inset:0;z-index:75;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,6,4,.72)}
.mc-card{width:min(480px,100%);display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px 18px 16px;background:#17130e;border:1px solid #d9b45a;border-radius:6px;color:#ece4d2;text-align:center;font-family:var(--ui,sans-serif)}
.mc-card h2{margin:0;font:700 19px var(--display,serif);letter-spacing:.12em;color:#e6c77a}
.mc-card p{margin:0;font-size:15px;line-height:1.5;color:#cbbd9c}
.mc-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.mc-card button{min-height:44px;min-width:150px;padding:0 16px;border-radius:4px;font:600 15px var(--ui,sans-serif);letter-spacing:.06em;color:#fff4e0;background:rgba(20,18,15,.9);border:1px solid rgba(236,228,210,.35);cursor:pointer}
.mc-card button.go{background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070}
.mc-strip{display:flex;align-items:center;gap:4px;font:600 13px var(--ui,sans-serif);color:#cbbd9c}
.mc-strip i{flex:none;width:14px;height:2px;background:rgba(230,199,122,.4)}
.mc-strip span{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:0 8px;border:1px solid rgba(236,228,210,.25);border-radius:14px;white-space:nowrap}
.mc-strip span.mc-done{color:#e6c77a;border-color:rgba(230,199,122,.6)}
.mc-strip span.mc-done::before{content:'';width:8px;height:8px;border-radius:50%;background:#e6c77a}
.mc-strip span.mc-next{color:#fff;border-color:#e0a070;background:rgba(168,64,42,.45)}
`;
const css = () => { if (!document.getElementById('mc-css')) { const st = document.createElement('style'); st.id = 'mc-css'; st.textContent = CSS; document.head.appendChild(st); } };

// 対人戦への誘い（強制しない）。どちらを押しても札は閉じる。save を渡せば invited を立てる（保存は呼ぶ側）
export function openPvpInvite(o = {}) {
  en(); css();
  if (o.save) box(o.save).invited = 1;
  const el = document.createElement('div');
  el.className = 'mc-ov'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'オンライン対戦に挑戦できます');
  el.innerHTML = `<div class="mc-card"><h2>オンライン対戦に挑戦できます</h2><p>NPC 中級に勝ちました。他のプレイヤーと戦えます</p>
    <div class="mc-row"><button type="button" class="go" data-a="pvp">対人戦へ</button><button type="button" data-a="npc">NPC戦を続ける</button></div></div>`;
  document.body.appendChild(el);
  for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', () => { el.remove(); (b.dataset.a === 'pvp' ? o.onPvp : o.onNpc)?.(); });
  el.querySelector('[data-a="pvp"]').focus({ preventScroll: true });
  return el;
}

// 初心者の道の帯：済んだ段は金の丸、次の段は朱。全部済んだら null（帯を出さない）
export function michiStrip(save) {
  en(); css();
  const m = save?.michi || {}, nx = nextStep(save);
  if (!nx) return null;
  const el = document.createElement('div');
  el.className = 'mc-strip'; el.setAttribute('role', 'list'); el.setAttribute('aria-label', '初心者の道');
  el.innerHTML = STEPS.map((s, i) => `${i ? '<i aria-hidden="true"></i>' : ''}<span role="listitem" data-step="${s.id}" class="${s.done(m) ? 'mc-done' : s.id === nx ? 'mc-next' : ''}">${s.name}</span>`).join('');
  return el;
}

let enDone = false;
function en() {
  if (enDone) return; enDone = true;
  addEn([['オンライン対戦に挑戦できます', 'You can now try online battles'], ['NPC 中級に勝ちました。他のプレイヤーと戦えます', 'You beat a Normal NPC. Now you can fight other players.'],
    ['対人戦へ', 'Fight players'], ['NPC戦を続ける', 'Keep fighting NPCs'], ['初心者の道', 'Beginner path'], ['模擬合戦', 'Practice'], ['織田 初級', 'Oda Easy'], ['武田 中級', 'Takeda Normal'], ['対人戦', 'Online'],
    ['初級', 'Easy'], ['中級', 'Normal'], ['上級', 'Hard'], ['修羅', 'Shura']]);
}
