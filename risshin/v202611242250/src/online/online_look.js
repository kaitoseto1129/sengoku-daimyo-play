// オンラインの武将（bushou_online.js）のうち、具足の表（units.js の GENERALS）に無い人の具足（K600 76〜77・kaito 11/21「甲冑はちゃんと武将ごとか」）。
// 表に無い33人は、前は全員が同じ既定の黒い具足（kabuto_m・黒・茶の威）で立っていた。ここで一人ずつ、兜の鉢・前立・胴の作り・鉢と威の色を替える。
// 本人所用の現存品は確かめられなかった人ばかりなので、同じ家・同じ時代の具足を手本に推した復元案（CLAUDE.md「代わりの手」）：
//   毛利家＝赤の威（毛利元就の表と同じ家の色）・島津家＝紺の威・武田家＝紅の威・上杉家＝紺や萌黄の威・徳川家＝黒の威。
//   前立は誰か一人の物と分かる形（信長の鍬形・謙信の飯綱など）は使わず、当世に広く使われた形（鍬形・日輪・三日月・角・羊歯・鳥毛など）から選ぶ。
//   出所と照らした結果は docs/evidence_now/k600/armor_audit.md。戦の中の具足（GENERALS）は変えない（登用・詳細・編成の画面だけ）。
// 並び：[鉢の色, 威の色, 鉢の形, 前立, 胴の作り]
// K628（11/22）：ここにいた33人は、具足の表（kacchu_required.js）の本当の行へ移した＝筋書き・オンラインの戦でも同じ姿。今は具足の表から外した人だけ
const L = {
  // K642②（11/24）：鳥居強右衛門は筋書きの長篠では走る足軽のまま（kacchu_data.js が具足の表から外す）。オンラインの武将としては徳川の当世具足に立たせる
  鳥居強右衛門: [0x1c1a1a, 0x232c40, 'momonari', 'bellflower', 'okegawa'],
};
// 表にはいるが、同じ具足が二人（金森長近・蜂屋頼隆）。蜂屋の方だけ前立と胴を替える
const OVER = { 蜂屋頼隆: { crest: 'kuwa', doStyle: 'kebiki' } };

// 立たせる時の具足：base は表か図鑑の見た目（顔はそのまま）。替える物が無ければ null
export function onlineLook(name, base) {
  const r = L[name];
  if (r) { const [helm, odo, bowl, crest, doStyle] = r; return { ...(base || {}), hat: 'kabuto', armor: helm, helm, lace: odo, odo, bowl, crest, doStyle }; }
  if (OVER[name] && base) return { ...base, ...OVER[name] };
  return null;
}
export const ONLINE_LOOK_NAMES = [...Object.keys(L), ...Object.keys(OVER)];

// オンラインの合戦（match.js の startMatch）でも、登用・編成の3Dと同じ姿で立たせる（K601 54・68）。
//   戦の兵は具足の表（units_data.js の GENERALS と kacchu_data.js の KACCHU）を名で引くので、合戦の間だけ表に無い人の行を置き、
//   合戦が終われば元へ戻す（筋書きの戦の武田信繁・山本勘助などの姿は変えない）。返す関数を呼ぶと戻す
export async function installOnlineLooks() {
  await import('../xr_order.js');
  const [{ GENERALS }, { KACCHU }, BP, { BUSHOU_ONLINE }] = await Promise.all([import('../units_data.js'), import('../kacchu_data.js'), import('../busho_portrait.js'), import('./bushou_online.js')]);
  BP.addPortraitRows(BUSHOU_ONLINE.map((x) => [x.name, x.house]));
  const back = [];
  for (const nm of ONLINE_LOOK_NAMES) {
    const ov = onlineLook(nm, GENERALS[nm] || BP.zukanLook(nm));
    if (!ov) continue;
    back.push([nm, GENERALS[nm], KACCHU[nm]]);
    const k0 = KACCHU[nm] || {};
    GENERALS[nm] = ov;
    KACCHU[nm] = { ...k0, bowl: ov.bowl, crest: ov.crest, armor: ov.helm, helm: ov.helm, lace: ov.odo, odo: ov.odo, doStyle: ov.doStyle, haori: 0, menpo: k0.menpo || 0, menpoStyle: k0.menpoStyle || 'hanbo', mon: ov.mon || k0.mon || 'none', hat: 'kabuto', hatFix: 1, lac: k0.lac || 'kuro', fuki: k0.fuki || 'kuro' };
  }
  // K642②（11/24）：具足の表にだけ行のある人（名簿の人・オンラインで足した人）は、戦の大将の姿の表（GENERALS）に居ないので、
  //   合戦では名の無い侍大将の黒い具足に立っていた。合戦の間だけ図鑑の顔と具足の表の行で GENERALS に置く（顔があると units.js が KACCHU を引く）
  for (const { name: nm } of BUSHOU_ONLINE) {
    if (GENERALS[nm] || !KACCHU[nm]) continue;
    const z = BP.zukanLook(nm), k = KACCHU[nm];
    if (!z) continue;
    back.push([nm, undefined, k]);
    GENERALS[nm] = { ...z, armor: k.armor, helm: k.helm, lace: k.lace, hat: 'kabuto', mon: k.mon || 'none', flag: k.flag };
  }
  return () => { for (const [nm, g, k] of back) { if (g) GENERALS[nm] = g; else delete GENERALS[nm]; if (k) KACCHU[nm] = k; else delete KACCHU[nm]; } back.length = 0; };
}
