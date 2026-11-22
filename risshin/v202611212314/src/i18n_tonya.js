// K516 英語版：問屋（tonya_ui.js）の馬・表示の英訳。英語の時だけ tonya.js が読む（日本語の時は読まない・重さ0）。クラウド 山崎の持ち主 11/21
export default [
  ['✕ 戻る', '✕ Back'], ['疾風', 'Gale'], ['駿馬', 'Swift steed'], ['駄馬', 'Packhorse'], ['並の馬', 'Ordinary horse'], ['月影', 'Moon Shadow'], ['岩根', 'Rock Root'], ['分捕り馬', 'Captured horse'],
  ['息が長く、少し速い。打たれ弱い', 'Long-winded and a little fast. Weak to blows.'], ['荷駄を引いていた小柄な馬。遅く打たれ弱いが、安い', 'A small horse that hauled baggage. Slow and fragile, but cheap.'],
  ['癖のない馬。はじめて乗るならこれ', 'An even-tempered horse. The one to ride first.'], ['打たれ強く、槍衾にも怯みにくい。息は短い', 'Tough, and hard to rattle even by a wall of spears. Short of breath.'],
  ['戦で分捕った敵の馬。戦場の音に慣れていて、体力も息もある', 'An enemy horse captured in battle. Used to the sounds of the field, with both stamina and wind.'],
  [/^不足分を一括補充（(\d+)人・銭 ([\d,]+)）$/, (m) => `Refill all shortfalls (${m[1]} men · ${m[2]} mon)`],
  [/^あと ([\d,]+)$/, (m) => `${m[1]} more needed`],
  [/^(動き|速さ|体力|息|守り|間合い|威力) (\d)／(\d)$/, (m, tr) => `${tr(m[1])} ${m[2]}/${m[3]}`],
];
