// H3 家の装い（11/24 クラウド Sanae）：毛利・島津・伊達の兵を、織田・武田・上杉の色違いに見せない。
//   具足の黒漆の揃え（armor_uniform.js）の後に一度だけ掛ける。見た目だけ（防御力・背丈・当たりは変えない）。毎コマは呼ばない。
//   伊達：足軽は金の尖り笠（文禄元年の上洛の行列で、伊達の足軽が黒具足に金の尖り笠をそろえた話）。
//         侍と侍大将は黒漆に弦月の前立（侍は細く、侍大将は幅広く）（政宗所用 黒漆五枚胴具足の前立は新月形・金箔押。文化遺産オンライン）。名のある人は自分の立物のまま。
//   島津・毛利は旗（textures.js の FLAG_DYE）で分ける：島津は白地に黒の丸に十字だけ、毛利は下を紅に染めて一文字に三つ星。
//   毛利の組頭（足軽大将）：他家の味方の組頭は紺地に白線の指物に替わるが、毛利は赤地に白の一文字三星を一回り大きく背負う（組ごとに遠くで毛利の赤が立つ）。
//   水軍の戦（木津川口）：舟の艫に船印（毛利の赤旗・村上の丸に上）を立てる。形と材質は一つずつを全部の舟で使い回す。
//   出所は docs/house_gear_1124.md。
import * as THREE from 'three';
import { flagMaterial } from './units_flags.js';
const GOLD_KASA = 0xa07c34;   // 稲生の本人の金の笠と同じ鈍い古金（形の鍵が同じになり、形を増やさない）
const _moon = new WeakMap();  // 元の具足の表ごとに弦月の写しを一つだけ作って使い回す

const isDate = (f) => f === 'date' || (typeof f === 'string' && f.startsWith('sashi:date:'));

export function houseGear(look, { flag, named, type, busho, ashiTaisho, team }) {
  if (!look || look.hero || look.kosode || look.sohei || look.nanban || type === 'player') return look;
  // 毛利の組頭：紺地白線へ替えた背の指物を毛利の赤旗へ戻し、一回り大きく
  if (ashiTaisho && team === 0 && flag === 'mori' && typeof look.flag === 'string' && look.flag.startsWith('sashi:白線')) { look.flag = 'mori'; look.flagScale = 1.5; }
  // 長宗我部（11/24 Sanae）：足軽は一領具足の野の姿＝陣笠でなく鉢巻（田から槍を取って駆けつけた半農半兵。『土佐物語』B・南国市の解説 C）
  if (flag === 'chosokabe' && !named && type === 'ashigaru' && /^jingasa/.test(look.hat || '')) { look.hat = 'hachimaki'; look.tenugui = false; if (look.hachi == null) look.hachi = 0xbfb59c; }
  if (!isDate(look.flag) && !isDate(flag)) return look;
  if (!named && (look.hat === 'jingasa' || look.hat === 'jingasa_n')) {
    look.hatColor = GOLD_KASA; look.kasaGold = 1; look.kasaShape = 2;
  }
  const kc = look.kacchu;
  if (!named && kc && typeof kc === 'object' && kc.generic) {
    // 位は前立の大きさで：侍は細い弦月、侍大将は幅の広い弦月（鍬形の代わり）
    const crest = busho || (look.tier ?? 0) >= 2 ? 'date_moon' : 'moon';
    let m = _moon.get(kc);
    if (!m) _moon.set(kc, m = {});
    const c = m[crest] || (m[crest] = { ...kc, crest });
    look.kacchu = c; look.crest = crest;
  }
  return look;
}

// 船印：舟（props.js の kobune）の艫に竿と旗を一本。kind は旗の鍵（'mori'・'murakami'・'oda'）。len は舟の長さ
let _pole = null, _poleMat = null, _cloth = null;
export function funeJirushi(boat, len, kind, h = 5) {
  if (!boat) return boat;
  if (!_pole) {
    _pole = new THREE.CylinderGeometry(0.04, 0.05, 1, 5); _pole.translate(0, 0.5, 0);
    _poleMat = new THREE.MeshLambertMaterial({ color: 0x5a4a34 });
    _cloth = new THREE.PlaneGeometry(1, 2); _cloth.rotateY(Math.PI / 2); _cloth.translate(0, -1, 0.5);   // 竿の上から舳先の向きへ垂れる
  }
  const z = -len * 0.5 + 0.6, s = Math.max(0.8, len / 9);
  const pole = new THREE.Mesh(_pole, _poleMat); pole.position.set(0, 0.25, z); pole.scale.set(1, h * s, 1); boat.add(pole);
  const cloth = new THREE.Mesh(_cloth, flagMaterial(kind, 0, 'ally')); cloth.position.set(0, 0.25 + h * s - 0.1, z + 0.05); cloth.scale.setScalar(s); boat.add(cloth);
  return boat;
}
