// 第三章「徳川編」の戦の並び（kaito 11/1）。各戦の係が自分の戦を一行ずつ足す。
// 戦の def は prototype/src/b_k<番号>_<名>.js に置く。ここは並びと名前だけ。筋書きは docs/chapter3_tokugawa.md。
// 徳川編は錠で入れる：できた戦から開く。
export const TOKUGAWA_LINE = [
  // 11/24 Sanae：伏見の前は歩く岡崎の城下（後は今までの清洲の東軍の陣＝town_jinchu.js k02_kawada）（甲府・春日山と同じ手。townWalk は歩く城下の名だけで、本陣の札・地図の town は替えない）。
  //   慶長五年六月、家康は会津の上杉を討つと決めて伏見を発ち、城を鳥居元忠に預けた（伏見城の戦いの history）。三河の足軽が岡崎から伏見の番に上るのは推（遊びの筋）。
  //   足軽は軍議に出られない。上官屋敷の前で組頭から聞く（town_depart.js eveSetup をそのまま使う）
  { id: 'k01_fushimi', town: '伏見', townWalk: '岡崎', townWhen: '慶長五年　六月', name: '伏見城の戦い', year: 1600, place: '京の南の伏見城', file: './b_k01_fushimi.js',
    eve: { who: '組頭 太郎作', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く',
      lines: ['殿は大坂で、会津の上杉を討つと決められた。伏見の城は鳥居彦右衛門様が預かる', '殿が東へ下られたら、上方の奉行衆が兵を挙げるやもしれぬ。伏見は捨て石じゃと、皆言うておる', '軍議は殿と重臣の方々だけで決まる。わしら三河の足軽は、下知を聞いて伏見へ上るだけじゃ'],
      card: '太郎作「伏見へ上る。彦右衛門様の旗から離れるな」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 太郎作', '草鞋を替えておけ。伏見までは遠いぞ', 2.6] } },
  // 開戦の札で題が三行に折れて「い」が一字落ちた（11/6 kaito の目）。題は短く、場所は place に
  { id: 'k02_kawada', town: '清洲', name: '河田・米野の戦い', year: 1600, place: '尾張の河田の渡し', file: './b_k02_kawada.js' },
  { id: 'k03_gifu', town: '清洲', name: '岐阜城の戦い', year: 1600, file: './b_k03_gifu.js' },
  { id: 'k04_kuisegawa', town: '赤坂', townPlace: '赤坂の陣', name: '杭瀬川の戦い', year: 1600, winWord: '東軍、退却', victoryCaption: '西軍の勝利　有馬の陣へ生還', file: './b_k04_kuisegawa.js' },
  { id: 'k05_ueda', town: '小諸', name: '第二次上田合戦', year: 1600, file: './b_k05_ueda.js' },
  { id: 'k06_sekigahara', town: '赤坂', townPlace: '赤坂の陣', name: '関ヶ原の戦い', year: 1600, file: './b_k06_sekigahara.js' },
  { id: 'k07_sawayama', town: '関ヶ原', townPlace: '関ヶ原の陣', name: '佐和山城の戦い', year: 1600, place: '近江の佐和山城', winWord: '佐和山城、落城', victoryCaption: '正継・正澄・朝成、天守に果つ', file: './b_k07_sawayama.js' },
  { id: 'k08_osaka_kizu', town: '伏見', name: '大坂冬の陣・木津川口の戦い', year: 1614, file: './b_k08_osaka_kizu.js' },
  { id: 'k09_imafuku', town: '伏見', name: '今福の戦い', year: 1614, file: './b_k09_imafuku.js' },
  { id: 'k10_shigino', town: '伏見', name: '鴫野の戦い', year: 1614, place: '大坂城の東の鴫野', file: './b_k10_shigino.js' },
  { id: 'k11_sanadamaru', town: '平野', townPlace: '平野の陣', name: '真田丸の戦い', year: 1614, place: '大坂城の南、真田丸の前', file: './b_k11_sanadamaru.js' },
  { id: 'k12_kashii', town: '和歌山', name: '樫井の戦い', year: 1615, place: '和泉の樫井', file: './b_k12_kashii.js' },
  { id: 'k13_domyoji', town: '奈良', townPlace: '奈良の町', name: '道明寺の戦い', year: 1615, file: './b_k13_domyoji.js' },
  { id: 'k14_yao_wakae', town: '伏見', name: '八尾・若江の戦い', year: 1615, file: './b_k14_yao_wakae.js' },
  // mins：戦選びに出す所要時間（11/8 kaito「天王寺は一戦20〜30分の濃い戦」。ほかの戦は4〜7分なので出さない）
  { id: 'k15_tennoji_okayama', town: '平野', townPlace: '平野の陣', name: '天王寺・岡山の戦い', year: 1615, mins: '20〜30分', file: './b_k15_tennoji_okayama.js' },
  // 秘密の最後の戦（もしもの戦）。15戦に勝つと開く（tokugawa_secret.js）。本陣では虹色の縁の札
  //   noKubi：勝った後の首実検の場面（影絵の板の絵）を出さない。総大将の自分が家康を討った締めは、戦の中の勝鬨と出世の道で済ませる
  { id: 'k16_secret', town: '伏見', name: '元和天下返し', year: 1615, place: '淀の野', secret: true, noKubi: true, winWord: '天下静謐', victoryCaption: '家康が刀を置き、戦が終わった', file: './b_k16_secret.js' },
  // 終幕（docs/finale_spec_1109.md）：淀の野に勝った後だけ、結果の「数年後へ」から入る。戦の一覧には出さない（hidden）
  { id: 'k17_shuumaku', town: '江戸', name: '静かな城下', year: 1623, place: '戦の無い城下', hidden: true, noKubi: true, winWord: '天下静謐', file: './b_k17_shuumaku.js' },
  // 番外（台帳 K295・kaito 11/17）：天王寺を真田信繁で。いつでも選べる（並びの一番下）。本編の筋・位とは切り離す（侍大将で出陣と同じ試し）。hidden：完全版の戦の数（paywall.js）に数えない
  { id: 'x15_sanada', town: '大坂', name: '番外 天王寺（真田幸村）', year: 1615, place: '茶臼山から家康の本陣へ', bangai: true, hidden: true, noKubi: true, thumb: 'k15_tennoji_okayama', file: './b_x15_sanada.js' },
];

// 徳川編の出世の段（docs/chapter3_tokugawa.md「出世と軍勢」）。出世の道（state.js の LADDER）の段の番号。
// 関ヶ原までは侍大将、冬の陣・夏の陣は武将として二〜三万の軍に加わり、秘密の戦は大名として二万を率いる
export function tokuStep(id) {
  const n = +String(id || '').slice(1, 3) || 0;
  return n >= 16 ? 5 : n >= 8 ? 4 : 3;   // 出世の道の六段（侍大将3・武将4・大名5）
}
