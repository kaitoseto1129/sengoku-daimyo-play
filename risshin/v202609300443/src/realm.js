// 段2「出世と国づくり」の入口：城下の札「知行」と、戦の始め・終わりの効き目を三つの柱に配る。
// このファイルは係A（内政と知行）だけが直す。中身は domain.js（A）・retainers.js（B）・diplomacy.js（C）に持たせる。
import { scenarioKey } from './state.js';
import * as DM from './domain.js';
import * as RT from './retainers.js';
import * as DP from './diplomacy.js';

export const REALM_ICON = '<svg viewBox="0 0 24 24"><path d="M4 20 V10 L12 4 L20 10 V20 Z"/><path d="M9 20 V13 H15 V20"/><path d="M6 20 H18"/></svg>';

const on = (G) => G && !G.lord && !G.practice && scenarioKey() === 'oda';

const safe = (f) => { try { f(); } catch (e) { console.error('realm', e); } };

// battle.js が makeTomo の後に呼ぶ
export function realmBattle(rt) {
  if (!on(rt.G) || rt.def.dojo || rt.def.mapCastle) return;
  rt.realm = {};
  safe(() => DM.domainBattle(rt));
  safe(() => RT.keraiBattle(rt));
  safe(() => DP.diploBattle(rt));
}

// main.js が settle の直後に呼ぶ
export function realmAfter(G, r, b, i) {
  if (!on(G)) return;
  r.realmLines = [];
  safe(() => DM.domainAfter(G, r, b, i));
  safe(() => RT.keraiAfter(G, r, b, i));
  safe(() => DP.diploAfter(G, r, b, i));
  G.realmLog = { at: G.battle, lines: r.realmLines.slice(0, 6) };
}

// screens.js の城下「知行」札
export function realmHtml(G) {
  const log = (G.realmLog && G.realmLog.lines) || [];
  const top = log.length ? `<div class="realm-log"><p class="note">前の戦の後</p><ul>${log.slice(0, 3).map((l) => `<li>${l}</li>`).join('')}</ul></div>` : '';
  return `<div class="realm"><style>
.realm-log{margin-bottom:10px}
.realm-log ul{margin:4px 0 0;padding-left:18px;font-size:13px;color:var(--washi-dim)}
.realm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.realm-h{font-size:14px;color:var(--kin);margin:0 0 6px}
</style>${top}<div class="realm-grid">${DM.domainHtml(G)}${RT.keraiHtml(G)}${DP.diploHtml(G)}</div></div>`;
}

export function realmBind(G, done, confirm) {
  DM.domainBind(G, done, confirm);
  RT.keraiBind(G, done, confirm);
  DP.diploBind(G, done, confirm);
}
