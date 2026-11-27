// 島津家編「伏兵の薩摩」（H3・K637・docs/house_shimazu.md）の戦の並び。作った戦だけを並べる（まだ作っていない戦を入れると読み込みで落ちる）。
//   戦の def は prototype/src/b_s<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。題の画面（SCENARIO_PICK）へは戦が揃うまで出さない
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_shimazu.js').then((m) => addEn(m.default)).catch(() => {});
if (isEn()) import('./i18n_shimazu_k717b.js').then((m) => addEn(m.default)).catch(() => {});   // K717 後半の足した台詞   // K516：島津家編の画面の字の英訳（英語の時だけ読む）
// 11/24 Sanae：s03〜s08 の前と後も内城の城下を歩く（戦ごとの噂・勝ち負けの帰り道。house_towns.js）。関ヶ原（1600）までは内城（鶴丸城は1601〜）
export const SHIMAZU_LINE = [
  // K647（11/25 Sanae）：足りない七戦を年の順に差し込み（s09〜s15・城下の場面は無し）
  { id: 's09_iwatsurugi', town: '内城', townWhen: '天文二十三年　八月', name: '岩剣城の戦い', year: 1554, place: '大隅国 岩剣城', file: './b_s09_iwatsurugi.js' },
  { id: 's10_kamou', town: '内城', townWhen: '弘治三年　四月', name: '蒲生合戦', year: 1557, place: '大隅国 蒲生城', file: './b_s10_kamou.js' },
  { id: 's11_hishikari', town: '内城', townWhen: '永禄九年　頃', name: '菱刈合戦', year: 1566, place: '薩摩国 北薩の川', file: './b_s11_hishikari.js' },
  // H3（11/24 Sanae）：木崎原の前と後は、夕刻の内城（鹿児島）の城下を歩く（甲府・春日山と同じ手。town3d.js が eve.sakurajima で桜島と煙を遠くに置く）。
  //   元亀三年（1572）五月、日向の伊東勢が加久藤城を狙って動いた。足軽は上官屋敷の前で組頭から聞く（town_depart.js eveSetup をそのまま使う）
  { id: 's01_kizakibaru', town: '内城', name: '木崎原の戦い', year: 1572, place: '日向国 木崎原', file: './b_s01_kizakibaru.js', townWhen: '元亀三年　五月',
    eve: { who: '組頭 新左衛門', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く', sakurajima: true,
      lines: ['日向の伊東が、三千の兵で加久藤の城を狙うておる', '飯野の義弘様の手は三百。正面から当たれば勝てぬ', 'じゃから、退いて待って挟む。わしら足軽は、退く時に振り向かぬことじゃ'],
      card: '新左衛門「走れと言われたら走れ。止まれと言われたら向き直れ」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 新左衛門', '桜島の煙が東へ流れておる。明日も晴れじゃ', 2.8] } },
  { id: 's12_takahara', town: '内城', townWhen: '天正四年　八月', name: '高原城の戦い', year: 1576, place: '日向国 高原城', file: './b_s12_takahara.js' },
  { id: 's13_hyuga', town: '内城', townWhen: '天正五年　十二月', name: '日向の追撃（三州統一）', year: 1577, place: '日向国 縣への道', file: './b_s13_hyuga.js' },
  // 耳川（天正六年〔1578〕十一月）：高城を囲む大友の大軍。出陣の前の夕刻の内城（木崎原と同じ城下・組頭から聞く）
  { id: 's02_mimikawa', town: '内城', name: '耳川の戦い', year: 1578, place: '日向国 高城・耳川', file: './b_s02_mimikawa.js', townWhen: '天正六年　十一月',
    eve: { who: '組頭 新左衛門', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く', sakurajima: true,
      lines: ['豊後の大友が、四万の兵で日向へ攻め入った。高城が囲まれておる', '高城の山田様は、三千で持ちこたえておられる', 'わしらは高城の囮。敵を引いて、丘の間で挟むのじゃ'],
      card: '新左衛門「囲みは破らぬ。引いて、待って、挟め」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 新左衛門', '桜島の煙が東へ流れておる。明日も晴れじゃ', 2.8] } },
  { id: 's14_minamata', town: '内城', townWhen: '天正九年　九月', name: '水俣城の戦い（肥後侵攻）', year: 1581, place: '肥後国 水俣', file: './b_s14_minamata.js' },
  // 沖田畷（天正十二年〔1584〕三月）・岩屋城（天正十四年〔1586〕七月）：城下の場面は無し（戦だけ）
  { id: 's03_okitanawate', town: '内城', townWhen: '天正十二年　三月', name: '沖田畷の戦い', year: 1584, place: '肥前国 島原 沖田畷', file: './b_s03_okitanawate.js' },
  { id: 's04_iwaya', town: '内城', townWhen: '天正十四年　七月', name: '岩屋城の戦い', year: 1586, place: '筑前国 岩屋城', file: './b_s04_iwaya.js' },
  // 戸次川（天正十四年〔1586〕十二月）：豊臣編 t06 の側を入れ替えた戦。城下の場面は無し（戦だけ）
  { id: 's05_hetsugi', town: '内城', townWhen: '天正十四年　十二月', name: '戸次川の戦い', year: 1586, place: '豊後国 戸次川', file: './b_s05_hetsugi.js' },
  // 根白坂（天正十五年〔1587〕四月・夜襲して追われる側）・泗川（慶長三年〔1598〕十月・堅陣に誘って大軍を破る）：城下の場面は無し（戦だけ）
  { id: 's06_nejirozaka', town: '内城', townWhen: '天正十五年　四月', name: '根白坂の戦い', year: 1587, place: '日向国 根白坂', file: './b_s06_nejirozaka.js' },
  { id: 's15_satsuma', town: '内城', townWhen: '天正十五年　五月', name: '薩摩撤退（九州征伐）', year: 1587, place: '薩摩国 川内への道', file: './b_s15_satsuma.js' },
  { id: 's07_sacheon', town: '内城', townWhen: '慶長三年　十月', name: '泗川の戦い', year: 1598, place: '朝鮮 泗川', file: './b_s07_sacheon.js' },
  // 関ヶ原の退き口（慶長五年〔1600〕九月）：k06 の関ヶ原の地形をそのまま使い、側を島津の殿（捨て奸）へ入れ替えた戦。城下の場面は無し（戦だけ）
  { id: 's08_sekigahara', town: '内城', townWhen: '慶長五年　九月', name: '関ヶ原の退き口', year: 1600, place: '美濃国 関ヶ原', file: './b_s08_sekigahara.js' },
];
