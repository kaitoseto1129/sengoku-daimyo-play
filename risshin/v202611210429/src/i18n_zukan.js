// K516 英語版：武将図鑑（zukan.js）の画面の字。英語の時だけ zukan.js が読む（日本語の時は読まない・重さ0）。
//   図鑑は戦の紙より先に開ける（戦の英訳 i18n_<戦>.js は戦に入るまで読まれない）ので、人の名・家・一言はここに置く。
//   一人ずつ足す時は「人」の所へ [名, 英名]・[一言, 英]・家 を足す（戦の持ち主が自分の戦で会える人を足す）。
//   クラウド 八王子の持ち主 11/21：画面の決まった字と、八王子城の戦い（t11_hachioji）で会える6人。
export default [
  // 画面の決まった字
  ['武将図鑑', 'Warlord Book'], ['全保存記録共通', 'Shared by all saves'], ['歩み', 'Journey'], ['実績', 'Feats'], ['戻る', 'Back'],
  ['生没年', 'Lived'], ['家', 'Clan'], ['主な戦', 'Main battles'], ['前の武将', 'Previous'], ['次の武将', 'Next'], ['図鑑にもどる', 'Back to the book'],
  ['討った', 'Slain'], ['この手で討ち取った', 'You struck him down'], ['新しい', 'New'], ['実績を得た', 'Feat earned'], ['得た実績', 'Feats earned'],
  ['まだ得ていない', 'Not earned yet'], ['まだ戦っていない', 'No battles yet'], ['まだ誰にも会っていない', 'You have met no one yet'], ['まだ何も買っていない', 'Nothing bought yet'],
  ['ほかの筋書き・天下の地図の実績', 'Feats from other stories and the realm map'],
  ['実績と図鑑は、三つの保存の枠とは別に、この閲覧画面に記しています。保存の枠を消しても残ります。', 'Feats and the book are kept apart from the three save slots. They stay even if you delete a save.'],
  // 家
  ['前田家', 'Maeda clan'], ['真田家', 'Sanada clan'], ['北条家', 'Hojo clan'], ['上杉家', 'Uesugi clan'], ['織田家', 'Oda clan'], ['豊臣家', 'Toyotomi clan'],
  // 人（八王子城の戦い）
  ['前田利家', 'Maeda Toshiie'], ['前田利長', 'Maeda Toshinaga'], ['上杉景勝', 'Uesugi Kagekatsu'], ['真田昌幸', 'Sanada Masayuki'], ['横地監物', 'Yokochi Kenmotsu'], ['北条氏照', 'Hojo Ujiteru'],
  ['若い頃から信長に仕えた槍の名手。のちに加賀を治め、秀吉の死後は豊臣家を支えた。', 'A master of the spear who served Nobunaga from his youth. He later ruled Kaga and upheld the Toyotomi after Hideyoshi died.'],
  ['前田利家の子。九州攻めや八王子城攻めで働いた。加賀百万石の土台を作った。', 'Son of Maeda Toshiie. He fought in the Kyushu campaign and at Hachioji Castle. He laid the base of the great Kaga domain.'],
  ['上杉謙信の養子。豊臣家の五大老の一人。大坂冬の陣では徳川方で鴫野を守った。', 'Adopted heir of Uesugi Kenshin. One of the five Toyotomi elders. In the Osaka winter siege he held Shigino for the Tokugawa.'],
  ['信濃上田の城主。二度にわたって徳川の大軍を上田城で退けた。', 'Lord of Ueda in Shinano. Twice he drove off great Tokugawa armies at Ueda Castle.'],
  ['北条氏照の家臣。主が小田原にいる間、八王子城を守ったと伝わる。', 'A retainer of Hojo Ujiteru. He is said to have held Hachioji Castle while his lord was in Odawara.'],
  ['氏政の弟で、八王子城の城主。小田原に籠り、開城の後に兄とともに切腹した。', 'Younger brother of Ujimasa and lord of Hachioji Castle. He held out in Odawara and took his life with his brother after it fell.'],
  // 数と名を含む字
  [/^(\d+)年〜(\d+)年$/, (m) => `${m[1]}–${m[2]}`],
  [/^生年不詳〜(\d+)年$/, (m) => `?–${m[1]}`],
  [/^(\d+)年〜没年不詳$/, (m) => `${m[1]}–?`],
  [/^生年不詳〜没年不詳$/, () => 'Unknown'],
  [/^(.+)・(\d+)年$/, (m, tr) => { const e = tr(m[1]); return e !== m[1] ? `${e}, ${m[2]}` : undefined; }],
  [/^(.+)で会える$/, (m, tr) => { const e = tr(m[1]); return e !== m[1] ? `Met in: ${e}` : undefined; }],
];
