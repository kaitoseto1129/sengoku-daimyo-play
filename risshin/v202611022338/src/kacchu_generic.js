// 名の無い侍・侍大将・騎馬武者の当世具足（kaito 11/1「侍大将・侍の兜が丸い・胴がイラスト・前立もイラスト。本物の当世具足に」）
// 名のある武将と同じ作り（named_kacchu.js の鉢・錣・胴・本物の立物）を、六組の作り分け（vi）で着せる。色は家と兵の色のまま。
// 形は六組×兜の種類だけなので、形の数はほとんど増えない。弓足軽などの頭形兜（足軽の自前の兜）は、鉢だけ本物の頭形にする。
// 作り分けは当時の雑兵・侍の具足の見え方による復元案（特定の人の所用品ではない）。
const BOWL = ['suji', 'zunari', 'suji', 'momonari', 'suji', 'zunari'];
const DO = ['okegawa', 'sugake', 'kebiki', 'okegawa', 'sugake', 'okegawa'];
// 名の無い侍の多くは立物を付けないか、小さな鍬形。侍大将（tier 2 以上）は鍬形の類
const PLAIN = ['none', 'none', 'kuwa', 'none', 'kuwa_ken', 'none'];
const CHIEF = ['kuwa', 'kuwa_wide', 'kuwa_ken', 'kuwa', 'kuwa_sun', 'kuwa_wide'];
// 兵の兜の種類（units_model の作り物の前立）→ 本物の立物
const BY_HAT = { kabuto_m: 'kuwa', kabuto_r: 'kuwa', kabuto_t: 'kuwa', kabuto_b: 'kuwa_wide', kabuto_g: 'kuwa_wide', kabuto_suwa: 'kuwa_wide', kabuto_w: 'sun', kabuto_s: 'sun', kabuto_f: 'moon', kabuto_shida: 'shida', kabuto_tentsuki: 'ii_tentsuki', kabuto_shika: 'horn', kabuto_sanada: 'horn' };
const RED = /^kabuto_(r|tentsuki|sanada)$/;

// look を直す（units.js の addUnit の終わりで一度だけ）。名のある武将・本人・小袖・僧兵・南蛮胴・既に具足の決まった人は触らない
export function genericKacchu(look) {
  if (!look || look.kacchu || look.hero || look.kosode || look.sohei || look.nanban || look.bari) return look;
  const face = typeof look.face === 'string' ? look.face : '';
  if (face.startsWith('g:') || face === 'player') return look;
  const hat = String(look.hat || '');
  if (!hat.startsWith('kabuto') || hat === 'kabuto_bari' || hat === 'kabuto_namazu') return look;
  const vi = ((look.vi || 0) % 6 + 6) % 6, tier = look.tier ?? 0;
  // 足軽の頭形兜：鉢だけ本物の頭形（丸い玉の兜にしない）
  if (tier < 1) { if (!look.bowl) look.bowl = 'zunari'; return look; }
  const red = RED.test(hat);
  const armor = look.armor, helm = look.helm ?? (red ? 0x8a1d14 : armor);
  const st = {
    bowl: BOWL[vi], crest: BY_HAT[hat] || (tier >= 2 ? CHIEF[vi] : PLAIN[vi]),
    armor, helm, lace: look.lace, odo: look.lace, doStyle: tier >= 2 ? (vi % 2 ? 'kebiki' : 'okegawa') : DO[vi],
    haori: look.haori || 0, menpo: look.menpo || 0, menpoStyle: look.menpoStyle || 'hanbo', mon: look.mon,
    hat: 'kabuto', hatFix: 1, lac: red ? 'shu' : 'kuro', fuki: 'kuro', ref: '', generic: 1,
  };
  Object.assign(look, st, { kacchu: st });
  return look;
}
