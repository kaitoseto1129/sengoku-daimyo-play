// 布陣の表（fujin_table.js）を戦場につなぐ口（11/14 束A・K292）。表を読むのはここだけ。
//   fujinLook(id)：その戦の備ごとの旗（家の旗の鍵）を、隊の名に入る大将の名で引く札にする（units.js の addGroup・addUnit が使う）。
//   fujinForce(id)：両軍の総勢（図鑑の数、無ければ備の兵の足し算）。味方は織田・徳川の側。
//   織田の戦の六つ（稲生・桶狭間・稲葉山・姉川・三方ヶ原・設楽原）と豊臣の戦。天王寺は fujin_layout.js（係一）の受け持ちなので入れない。
import { FUJIN_TABLE } from './fujin_table.js';

export const FUJIN_ON = new Set(['inou', 'okehazama', 'inabayama', 'anegawa', 'mikatagahara', 'shitaragahara',
  // 豊臣の戦（11/14）：旗だけ（両軍の数は戦の元のまま）
  't01_yamazaki', 't02_shizugatake', 't03_komaki', 't03b_nagakute', 't04a_sengokubori', 't04_negoro', 't04b_ota', 't05_ichinomiya',
  't06_hetsugi', 't07_ganjaku', 't08_nejirozaka', 't09_yamanaka', 't10_oshi', 't11_hachioji', 't12_odawara']);
const ALLY = /織田|徳川|信長/;
// 家の大将の旗：表の家の旗より、その人の旗（units_data の GENERALS。柴田の雁金・丹羽の筋違い・佐久間の紋…）を先に
//   家康の厭離穢土（onri）は本陣の旗なので、兵には家の旗（葵）を
const ownFlag = (G, nm) => { const f = G[nm]?.flag; return typeof f === 'string' && f && !f.startsWith('sashi') && f !== 'onri' ? f : null; };
const namesOf = (r) => String(r.taisho || '').replace(/（[^）]*）|\([^)]*\)/g, '').split(/[・、,]/).map((s) => s.trim().replace(/ほか$|ら$/, '')).filter((s) => s.length >= 3 && !/^[―—-]|名は伝わらない|門徒|旗本|赤備え/.test(s));   // 「旗本」だけの名で 徳川の旗本に武田の旗が付いた

export function fujinLook(id, GENERALS = {}) {   // GENERALS：units_data.js の名のある武将（three を読まずに試せるよう 呼ぶ側が渡す）
  const T = FUJIN_ON.has(id) && FUJIN_TABLE[id]; if (!T) return null;
  const full = [], sur = [];
  for (const s of T.sides) for (const r of s.rows) for (const nm of namesOf(r)) {
    const flag = ownFlag(GENERALS, nm) || r.mon; if (!flag) continue;
    full.push([nm, flag]);
    if (nm.length >= 4) sur.push([nm.slice(0, 2), flag]);
  }
  if (!full.length) return null;
  // 隊の名（「佐久間信盛の手」「内藤昌豊隊」「馬場隊」）から旗を引く。名のまるごとを先に、無ければ苗字で始まる名
  return (name) => {
    if (!name) return null;
    for (const [nm, f] of full) if (name.includes(nm)) return f;
    for (const [s, f] of sur) if (name.startsWith(s)) return f;
    return null;
  };
}

export function fujinForce(id) {
  const T = FUJIN_TABLE[id]; if (!T) return null;
  let a = 0, b = 0;
  if (T.zukan && T.zukan.length) for (const z of T.zukan) { if (ALLY.test(z.side)) a += z.n; else b += z.n; }
  else for (const s of T.sides) { const n = s.rows.reduce((t, r) => t + (r.n || 0), 0); if (ALLY.test(s.side)) a += n; else b += n; }
  return a && b ? { a, b } : null;
}

// 大将の名で その備の兵の数（表の n）。名の伝わらない備・数の無い備は null（戦の元の数のまま）
export function fujinHei(id, name) {
  const T = FUJIN_TABLE[id]; if (!T || !name || /名は伝わらない/.test(name)) return null;
  for (const s of T.sides) for (const r of s.rows) if (r.n && String(r.taisho || '').replace(/（[^）]*）/g, '') === name) return r.n;
  return null;
}
