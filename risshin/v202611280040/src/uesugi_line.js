// 上杉編の戦の並び（K563・12月頭）。一戦ずつ足す。並びと出所は docs/chapter_uesugi.md。
//   戦の def は prototype/src/b_u<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。作った戦だけを並べる
//   題の画面（SCENARIO_PICK）へは戦が揃うまで出さない
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_uesugi.js').then((m) => addEn(m.default)).catch(() => {});   // K516：上杉編の画面の字の英訳（英語の時だけ読む・日本語の時は重さ0）
if (isEn()) import('./i18n_en_du_left.js').then((m) => addEn(m.default)).catch(() => {});   // K516：上杉編の組の札・u06 の残り
if (isEn()) import('./i18n_en_u_left.js').then((m) => addEn(m.default)).catch(() => {});   // K516：上杉編 u01〜u15 の場・台詞・任務の残り
if (isEn()) import('./i18n_en_u_len.js').then((m) => addEn(m.default)).catch(() => {});   // K652②：上杉編を10分前後にするため足した段の字
export const UESUGI_LINE = [
  // H2（11/24 Sanae）：最初の川中島の前と後は、雪の残る春日山の城下を歩く（甲府＝takeda_line.js と同じ手。town3d.js が townSnow で雪を降らせる）。
  //   天文二十二年（1553）四月、葛尾城を追われた村上義清が越後へ逃れ、長尾景虎（のちの謙信）は信濃へ兵を出した。景虎は戦の前に毘沙門堂に籠ったと伝わる（上杉家御年譜・北越軍談＝C）。
  //   足軽は堂の軍議に入れない。上官屋敷の前で組頭から聞き、山の上の堂の篝火を遠くに仰ぐ（eve.bishamon：town3d.js が小さな堂と篝火二つを置く）
  { id: 'u01_fuse', town: '春日山', name: '布施の戦い', year: 1553, place: '信濃の布施（第一次川中島）', file: './b_u01_fuse.js', townWhen: '天文二十二年　春', townSnow: 0.5,
    eve: { who: '組頭 弥五郎', tod: 0, obj: '上官屋敷の前で、組頭から軍議の話を聞く', bishamon: true,
      lines: ['御屋形様は、山の上の毘沙門堂に籠っておられる。戦の前は、いつもそうじゃ', '葛尾を追われた村上様が、春日山へ逃げて来られた。信濃の武田を討つのだ', '軍議は堂の中で決まる。わしら足軽は、雪の中からあの篝火を仰ぐだけじゃ'],
      card: '弥五郎「雪が解けたら信濃へ出る。毘の旗から離れるな」', pick: '具足を締めて出陣を待つ', after: [0.4, '組頭 弥五郎', '藁沓を脱いで、草鞋に替えておけ', 2.6] } },
  { id: 'u02_saigawa', town: '春日山', name: '犀川の戦い', year: 1555, place: '信濃の犀川（第二次川中島）', file: './b_u02_saigawa.js', townWhen: '弘治元年　春', townSnow: 0.5 },
  // 11/21 クラウド17（関所）：cloud-42 の u03〜u05 は戦のファイルが main にあるのに、取り込み（427aca6）で並びの行が落ちて遊べなかった。行を戻す
  { id: 'u03_uenohara', town: '春日山', name: '上野原の戦い', year: 1557, place: '信濃の上野原（第三次川中島）', file: './b_u03_uenohara.js' },
  { id: 'u04_odawara', town: '春日山', name: '小田原城の戦い', year: 1561, place: '相模の小田原城', file: './b_u04_odawara.js' },
  { id: 'u05_hachimanbara', town: '春日山', name: '八幡原の戦い', year: 1561, place: '信濃の八幡原（第四次川中島）', file: './b_u05_hachimanbara.js' },
  { id: 'u06_ikunoyama', town: '春日山', name: '生野山の戦い', year: 1561, place: '武蔵の生野山', file: './b_u06_ikunoyama.js' },   // cloud-06（u03〜u05 は cloud-42 が前へ足す）
  { id: 'u07_shiozaki', town: '春日山', name: '塩崎の対陣', year: 1564, place: '信濃の塩崎（第五次川中島）', file: './b_u07_shiozaki.js' },
  { id: 'u08_usui', town: '春日山', name: '臼井城の戦い', year: 1566, place: '下総の臼井城', file: './b_u08_usui.js' },
  { id: 'u09_honjo', town: '春日山', name: '本庄繁長の乱', year: 1568, place: '越後の本庄城', file: './b_u09_honjo.js' },
  { id: 'u10_shiritarezaka', town: '春日山', name: '尻垂坂の戦い', year: 1572, place: '越中の尻垂坂', file: './b_u10_shiritarezaka.js' },
  { id: 'u11_nanao', town: '春日山', name: '七尾城の戦い', year: 1577, place: '能登の七尾城', file: './b_u11_nanao.js' },
  { id: 'u12_tedorigawa', town: '春日山', name: '手取川の戦い', year: 1577, place: '加賀の手取川', file: './b_u12_tedorigawa.js' },
  { id: 'u13_otate', town: '春日山', name: '御館の乱', year: 1578, place: '越後の春日山・御館', file: './b_u13_otate.js' },
  { id: 'u14_shibata', town: '春日山', name: '新発田重家の乱', year: 1587, place: '越後の新発田城', file: './b_u14_shibata.js' },
  { id: 'u15_hasedo', town: '春日山', name: '長谷堂城の戦い', year: 1600, place: '出羽の長谷堂城', file: './b_u15_hasedo.js' },
];
