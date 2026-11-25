// 戦の札の下に出す「家紋 対 家紋」（K660・kaito 11/25「全ての戦のサムネの下に、織田の家紋 vs 武田の家紋 のように」）。
// 左＝自分の家、右＝敵の家。紋の絵は旗と同じ textures.js の drawMon から切り出す。紋の絵がまだ無い家は、家の名を小さな札で出す（紋を作り話で描かない）。
import { drawMon, hasMon } from './textures.js';

const P = (me, s) => Object.fromEntries(s.trim().split(/\s+/).map((x) => { const [id, foe, mine] = x.split('='); return [id, [mine || me, foe]]; }));
export const BATTLE_MON = {
  ...P('oda', `inou=oda okehazama=imagawa moribe=saito sunomata=saito inabayama=saito mitsukuri=rokkaku okawachi=kitabatake kanegasaki=asakura anegawa=azai
    nodafukushima=miyoshi shiga=azai hieizan=延暦寺 mikatagahara=takeda tonezaka=asakura odani=azai nagashima=honganji shitaragahara=takeda echizen=honganji
    echizen_ikko=honganji iwamura=takeda tennoji=honganji saika=saika tedorigawa=uesugi shigisan=松永 kizugawa=mori miki=別所 arioka=荒木 iga=伊賀 tottori=mori
    takato=takeda tano=takeda honnoji=akechi`),
  ...P('toyotomi', `t01_yamazaki=akechi t02_shizugatake=柴田 t03_komaki=tokugawa t03b_nagakute=tokugawa t04a_sengokubori=根来 t04_negoro=根来 t04b_ota=太田
    t05_ichinomiya=chosokabe t06_hetsugi=shimazu t07_ganjaku=秋月 t08_nejirozaka=shimazu t09_yamanaka=hojo t10_oshi=narita t11_hachioji=hojo t12_odawara=hojo`),
  ...P('tokugawa', `k01_fushimi=ukita k02_kawada=oda k03_gifu=oda k04_kuisegawa=ishida k05_ueda=sanada k06_sekigahara=ishida k07_sawayama=ishida
    k08_osaka_kizu=toyotomi k09_imafuku=toyotomi k10_shigino=toyotomi k11_sanadamaru=sanada k12_kashii=toyotomi k13_domyoji=toyotomi k14_yao_wakae=chosokabe
    k15_tennoji_okayama=sanada k16_secret=tokugawa=自分 x15_sanada=tokugawa=sanada`),
  ...P('takeda', `d01_kawanakajima=uesugi d02_minowa=長野 d03_mimasetoge=hojo d04_kanbara=hojo d05_hanazawa=imagawa d06_futamata=tokugawa d07_mikatagahara=tokugawa
    d08_noda=tokugawa d09_takatenjin1=tokugawa d10_nagashinojo=okudaira d11_shitaragahara=oda d12_takatenjin2=tokugawa d13_toriitoge=oda d14_takato=oda d15_tenmokuzan=oda`),
  ...P('uesugi', `u01_fuse=takeda u02_saigawa=takeda u03_uenohara=takeda u04_odawara=hojo u05_hachimanbara=takeda u06_ikunoyama=hojo u07_shiozaki=takeda u08_usui=千葉
    u09_honjo=本庄 u10_shiritarezaka=honganji u11_nanao=畠山 u12_tedorigawa=oda u13_otate=uesugi u14_shibata=新発田 u15_hasedo=mogami`),
  ...P('date', `e01_soma=相馬 e02_kobama=大内 e11_kogamori=大内 e03_hitotoribashi=satake e12_osaki=大崎 e04_koriyama=ashina e05_suriagehara=ashina e13_sukagawa=二階堂
    e06_odawara=hojo e07_kasai=葛西 e08_korea=朝鮮 e14_shiroishi=uesugi e15_hasedo=uesugi e09_matsukawa=uesugi e10_domyoji=sanada`),
  ...P('shimazu', `s09_iwatsurugi=祁答院 s10_kamou=蒲生 s11_hishikari=菱刈 s01_kizakibaru=ito s12_takahara=ito s13_hyuga=ito s02_mimikawa=otomo s14_minamata=sagara
    s03_okitanawate=ryuzoji s04_iwaya=otomo s05_hetsugi=toyotomi s06_nejirozaka=toyotomi s15_satsuma=toyotomi s07_sacheon=明 s08_sekigahara=tokugawa`),
  ...P('mori', `m11_arita=takeda m01_koriyama=尼子 m12_gassan1=尼子 m02_oshikibata=sue m03_itsukushima=sue m04_susuma=大内 m05_gassan=尼子 m06_tachibana=otomo m13_fube=尼子
    m07_kizugawa1=oda m08_kizugawa2=oda m09_kozuki=尼子 m14_tottori=oda m10_takamatsu=oda m15_nangu=tokugawa`),
  ...P('hojo', `h11_kokufudai1=里見 h01_kawagoe=uesugi h02_odawara_k=uesugi h12_matsuyama=uesugi h03_kokufudai=里見 h13_usui=uesugi h04_odawara_t=takeda h05_mimase=takeda
    h06_kanna=takigawa h07_wakamiko=tokugawa h14_numajiri=satake h15_yamanaka=toyotomi h09_hachigata=toyotomi h08_hachioji=toyotomi h10_odawara_h=toyotomi`),
  ...P('imagawa', `i01_hanakura=imagawa i02_azukizaka1=oda i03_tahara=戸田 i04_azukizaka2=oda i05_anjo=oda i06_fukaya=oda i07_terabe=鈴木 i08_otaka=oda i09_marune=oda
    i10_okehazama=oda i11_kariya=mizuno i12_ushikubo=tokugawa i13_hikuma=飯尾 i14_satta=takeda i15_kakegawa=tokugawa`),
  ...P('chosokabe', `c01_nagahama=本山 c02_asakura=本山 c11_yanagare=安芸 c03_shimanto=一条 c12_okamoto=西園寺 c04_nakatomi=miyoshi c13_hiketa=toyotomi c05_sogo=miyoshi
    c14_takao=mori c06_ichinomiya=toyotomi c07_hetsugi=shimazu c08_shimoda=hojo c09_koseki=朝鮮 c10_sekigahara=tokugawa c15_yao=todo`),
};
const NAME = { oda: '織田', imagawa: '今川', saito: '斎藤', rokkaku: '六角', kitabatake: '北畠', asakura: '朝倉', azai: '浅井', miyoshi: '三好', takeda: '武田', honganji: '本願寺', uesugi: '上杉', saika: '雑賀', mori: '毛利', akechi: '明智',
  toyotomi: '豊臣', tokugawa: '徳川', chosokabe: '長宗我部', shimazu: '島津', hojo: '北条', narita: '成田', ukita: '宇喜多', ishida: '石田', sanada: '真田', mogami: '最上', date: '伊達', satake: '佐竹', ashina: '蘆名', ito: '伊東',
  otomo: '大友', sagara: '相良', ryuzoji: '龍造寺', sue: '陶', takigawa: '滝川', mizuno: '水野', todo: '藤堂', okudaira: '奥平' };
const cache = new Map();
// 紋を地から切り出し、生成りの色に染めた一枚（家ごとに一度だけ作る）。読み込みの時に作らず、札を並べる時に
function monURL(kind) {
  if (cache.has(kind)) return cache.get(kind);
  let url = '';
  if (hasMon(kind)) try {
    const c = document.createElement('canvas'); c.width = 128; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true }); drawMon(g, kind, 128, 200);
    const b = g.getImageData(64, 150, 1, 1).data, d = g.getImageData(0, 0, 128, 128), a = d.data;
    let x0 = 128, y0 = 128, x1 = 0, y1 = 0;
    for (let i = 0; i < a.length; i += 4) {
      const x = (i >> 2) % 128, y = (i >> 2) >> 7;
      const v = x < 9 ? 0 : Math.min(255, Math.max(0, (Math.abs(a[i] - b[0]) + Math.abs(a[i + 1] - b[1]) + Math.abs(a[i + 2] - b[2]) - 40) * 2));
      a[i] = 244; a[i + 1] = 236; a[i + 2] = 216; a[i + 3] = v;
      if (v > 120) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 > x0) {
      g.clearRect(0, 0, 128, 200); g.putImageData(d, 0, 0);
      const o = document.createElement('canvas'); o.width = o.height = 64;
      const s = Math.max(x1 - x0, y1 - y0) + 2, r = 62 / s;
      o.getContext('2d').drawImage(c, x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, 32 - (x1 - x0) * r / 2, 32 - (y1 - y0) * r / 2, (x1 - x0 + 2) * r, (y1 - y0 + 2) * r);
      url = o.toDataURL();
    }
  } catch (e) { /* 描けない端末は家の名で出す */ }
  cache.set(kind, url); return url;
}
const one = (k) => { const u = monURL(k), n = NAME[k] || k; return u ? `<img src="${u}" alt="${n}">` : `<b>${n}</b>`; };
export function versusHtml(id) {
  const v = BATTLE_MON[id]; if (!v) return '';
  return `<span class="pk-vs">${one(v[0])}<em>対</em>${one(v[1])}</span>`;
}
