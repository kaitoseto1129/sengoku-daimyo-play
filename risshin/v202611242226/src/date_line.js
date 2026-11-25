// 伊達家編「若き独眼竜」（H3・K637・docs/house_date.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
//   戦の def は prototype/src/b_e<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。題の画面（SCENARIO_PICK）へは戦が揃うまで出さない
//   毛利編・島津編の線とは別のファイル（同じ時に別の係が作る）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_date.js').then((m) => addEn(m.default)).catch(() => {});   // K516：伊達家編の画面の字の英訳（英語の時だけ読む）
// 11/24 Sanae：全戦の前と後に本拠の城下を歩く（戦ごとの噂・勝ち負けの帰り道。house_towns.js）。米沢（〜1591）→小田原の前は会津の黒川（1589〜90）→岩出山（1591〜）→仙台（1601〜）
export const DATE_LINE = [
  // H3（11/24 Sanae）：初陣と二本松攻め。城下の歩きは摺上原の前だけ（ここは戦から始まる）
  { id: 'e01_soma', town: '米沢', townWhen: '天正十二年　十月', name: '相馬攻め（初陣）', year: 1584, place: '陸奥国 相馬領', file: './b_e01_soma.js' },
  { id: 'e02_kobama', town: '米沢', townWhen: '天正十三年　八月', name: '小浜城・宮森城の戦い', year: 1585, place: '陸奥国 二本松領', file: './b_e02_kobama.js' },
  // H3（11/24 Sanae）：人取橋は摺上原の四年前（天正十三年・政宗十九歳）。馬印を押し出す摺上原の逆で、孤立した馬印を守って夜を待つ。城下は歩かない（二本松の陣中から出る）
  { id: 'e03_hitotoribashi', town: '米沢', townWhen: '天正十三年　十一月', name: '人取橋の戦い', year: 1585, place: '陸奥国 人取橋', file: './b_e03_hitotoribashi.js' },
  // H3（11/24 Sanae）：郡山合戦（押し出さず持久）・小田原の陣（白装束の場面）・葛西大崎一揆（勢いが裏目）。年の順。城下は歩かない
  { id: 'e04_koriyama', town: '米沢', townWhen: '天正十六年　六月', name: '郡山合戦', year: 1588, place: '陸奥国 郡山', file: './b_e04_koriyama.js' },
  // H3（11/24 Sanae）：摺上原の前は、米沢の城下を歩く（甲府・春日山と同じ手。town3d.js の townSnow で残雪の盆地）。
  //   天正十七年（1589）五月、政宗は米沢を発って会津へ兵を進めた（伊達治家記録＝B）。足軽は城の軍議に出られない。上官屋敷の前で組頭から聞く
  { id: 'e05_suriagehara', town: '米沢', name: '摺上原の戦い', year: 1589, place: '陸奥国 摺上原', file: './b_e05_suriagehara.js', townWhen: '天正十七年　五月', townSnow: 0.25,
    eve: { who: '組頭 与惣兵衛', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く',
      lines: ['殿は二十三じゃ。若いが、旗を前へ出すお方よ', '猪苗代の盛国が、こちらに付いたそうな。会津の蘆名を討つ', '片倉様と成実様が先手じゃ。わしら足軽は、殿の馬印から離れるな'],
      card: '与惣兵衛「黒い笠の馬印が前へ出たら、皆で付いて行け」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 与惣兵衛', '会津までは峠を越える。草鞋を替えておけ', 2.6] } },
  { id: 'e06_odawara', town: '黒川', townWhen: '天正十八年　五月', name: '小田原の陣（白装束）', year: 1590, place: '相模国 小田原', file: './b_e06_odawara.js' },
  { id: 'e07_kasai', town: '米沢', townWhen: '天正十八年　十一月', name: '葛西・大崎一揆の戦い', year: 1590, place: '陸奥国 葛西・大崎領', file: './b_e07_kasai.js' },
  // H3（11/24 Sanae）：e08〜e10（後半の四戦のうち三つ）。城下は歩かない。e10 は b_domyoji.js の地形（石川・小松山・誉田）を伊達の側から写した軽い型
  { id: 'e08_korea', town: '岩出山', townWhen: '天正二十年　正月', name: '朝鮮出兵（伊達者の行列）', year: 1592, place: '肥前国 名護屋→朝鮮', file: './b_e08_korea.js' },
  { id: 'e09_matsukawa', town: '岩出山', townWhen: '慶長五年　十月', name: '松川の戦い', year: 1600, place: '陸奥国 松川', file: './b_e09_matsukawa.js' },
  { id: 'e10_domyoji', town: '仙台', townWhen: '慶長二十年　四月', name: '道明寺の戦い（大坂夏の陣）', year: 1615, place: '河内国 道明寺', file: './b_e10_domyoji.js' },
];
