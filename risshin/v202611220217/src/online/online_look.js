// オンラインの武将（bushou_online.js）のうち、具足の表（units.js の GENERALS）に無い人の具足（K600 76〜77・kaito 11/21「甲冑はちゃんと武将ごとか」）。
// 表に無い33人は、前は全員が同じ既定の黒い具足（kabuto_m・黒・茶の威）で立っていた。ここで一人ずつ、兜の鉢・前立・胴の作り・鉢と威の色を替える。
// 本人所用の現存品は確かめられなかった人ばかりなので、同じ家・同じ時代の具足を手本に推した復元案（CLAUDE.md「代わりの手」）：
//   毛利家＝赤の威（毛利元就の表と同じ家の色）・島津家＝紺の威・武田家＝紅の威・上杉家＝紺や萌黄の威・徳川家＝黒の威。
//   前立は誰か一人の物と分かる形（信長の鍬形・謙信の飯綱など）は使わず、当世に広く使われた形（鍬形・日輪・三日月・角・羊歯・鳥毛など）から選ぶ。
//   出所と照らした結果は docs/evidence_now/k600/armor_audit.md。戦の中の具足（GENERALS）は変えない（登用・詳細・編成の画面だけ）。
// 並び：[鉢の色, 威の色, 鉢の形, 前立, 胴の作り]
const L = {
  // 毛利家
  毛利隆元: [0x1c1a1a, 0xb02a1c, 'suji', 'kuwa_sun', 'kebiki'],
  児玉就忠: [0x3a1e16, 0xb02a1c, 'zunari', 'moon', 'okegawa'],
  桂元澄: [0x1c1a1a, 0x6a4026, 'momonari', 'none', 'okegawa'],
  志道広良: [0x4a3a2e, 0xb02a1c, 'suji', 'sun', 'sugake'],
  益田元祥: [0x1c1a1a, 0x3a5a3a, 'zunari', 'kuwa', 'hotoke'],
  赤川元保: [0x5a3c28, 0xb02a1c, 'momonari', 'horn', 'okegawa'],
  清水宗治: [0x1c1a1a, 0x1f2a48, 'suji', 'kuwa_wide', 'kebiki'],
  // 島津家
  伊集院忠棟: [0x1c1a1a, 0x232c40, 'suji', 'kuwa', 'okegawa'],
  伊集院忠倉: [0x1c1a1a, 0x232c40, 'zunari', 'none', 'okegawa'],
  樺山忠助: [0x3b322b, 0x232c40, 'momonari', 'moon', 'hotoke'],
  上井覚兼: [0x1c1a1a, 0x6a6a6a, 'suji', 'sun', 'kebiki'],
  川上忠堅: [0x5a3c28, 0x232c40, 'zunari', 'horn', 'okegawa'],
  山田有信: [0x1c1a1a, 0x4a3020, 'suji', 'feather', 'sugake'],
  長寿院盛淳: [0x1c1a1a, 0x1c1a1a, 'zunari', 'manji', 'hotoke'],   // 僧籍の人（長寿院）なので卍
  種子島時尭: [0x3a1e16, 0x232c40, 'momonari', 'kuwa_ken', 'okegawa'],
  島津忠長: [0x1c1a1a, 0x232c40, 'suji', 'shida', 'kebiki'],
  島津以久: [0x1c1a1a, 0x1f2a48, 'momonari', 'kuwa_sun', 'kebiki'],
  島津忠将: [0x3b322b, 0x1f2a48, 'suji', 'yamadori', 'okegawa'],
  // 武田家
  武田信繁: [0x1c1a1a, 0xa8281c, 'suji', 'kuwa_wide', 'hotoke'],
  小幡憲重: [0x3a1e16, 0xa8281c, 'zunari', 'moon', 'okegawa'],
  甘利虎泰: [0x1c1a1a, 0xa8281c, 'momonari', 'horn', 'sugake'],
  板垣信方: [0x5a3c28, 0xa8281c, 'suji', 'sun', 'hotoke'],
  諸角虎定: [0x1c1a1a, 0x6a4026, 'zunari', 'none', 'kebiki'],
  山本勘助: [0x3b322b, 0x1c1a1a, 'momonari', 'shida', 'okegawa'],
  村上義清: [0x5a3c28, 0x1c1a1a, 'suji', 'kuwa', 'okegawa'],
  // 上杉家
  色部勝長: [0x1c1a1a, 0x1a2238, 'suji', 'moon', 'sugake'],
  宇佐美定満: [0x4a3a2e, 0x1a2238, 'zunari', 'kuwa', 'sugake'],
  中条藤資: [0x1c1a1a, 0x3a5a3a, 'suji', 'sun', 'okegawa'],
  長尾政景: [0x1c1a1a, 0x1a2238, 'momonari', 'kuwa_wide', 'hotoke'],
  新発田重家: [0x3a1e16, 0x1a2238, 'suji', 'horn', 'okegawa'],
  吉江宗信: [0x1c1a1a, 0x5a2e6a, 'zunari', 'feather', 'kebiki'],
  // 徳川家
  本多正信: [0x161412, 0x1a1816, 'zunari', 'none', 'sugake'],   // 戦場の将でなく謀臣。飾りの無い頭形
  内藤正成: [0x1c1a1a, 0x1a1816, 'suji', 'moon', 'hotoke'],
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
  return () => { for (const [nm, g, k] of back) { if (g) GENERALS[nm] = g; else delete GENERALS[nm]; if (k) KACCHU[nm] = k; else delete KACCHU[nm]; } back.length = 0; };
}
