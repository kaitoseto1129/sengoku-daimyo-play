// 織田方の武将について、史実・後の伝え・遊びの持ち場を分けて説明する。
// 本文を確認できなかった史料に、特定の家紋や軍功があるとは書かない。
// 『寛政重修諸家譜』：江戸幕府が後世にまとめた家譜。
// https://online.bunka.go.jp/index.php/heritages/detail/565826
// 佐久間（巻531）・滝川（巻466）・丹羽（巻699）の公開先を確認。
// 本文画像は今回読めず、紋や戦ごとの持ち場の裏付けには用いていない。
// https://dl.ndl.go.jp/pid/1082714/1/440
// https://dl.ndl.go.jp/pid/1082714/1/221
// https://dl.ndl.go.jp/pid/1082713/1/381
// 『細川幽斎覚書』：軍中の心得を記す伝本がある。各戦の陣立の証拠とは分ける。
// https://www.hi.u-tokyo.ac.jp/publication/syoho/19/saiho_SUIFUM~1.HTM
// 『武功夜話』：前野家の伝え。成立・内容への疑義を伝承の説明に付す。
// https://www.ritsumei.ac.jp/acd/cg/lt/rb/656/656PDF/takahashi.pdf
// 紋の照合：柴田＝二つ雁金、丹羽＝直違、蜂須賀＝左卍。
// https://www.city.gifu.lg.jp/kankoubunka/kankou/1013050/1005149/1017450/1017465/1020524.html
// https://www.city.nihonmatsu.lg.jp/file/webook/151/pageindices/index2.html
// https://museum.bunmori.tokushima.jp/museum_documents/museumnews/mnews126/126_1_top.html

const SHIBATA = '柴田の二つ雁金は、家を見分けるために使う。旗の色や戦当時の形まで分かったものではない。';
const NIWA = '丹羽の直違は、家を見分けるために使う。旗の色や戦当時の形まで分かったものではない。';
const HACHI = '蜂須賀の左卍は、後の時代の品で確かめた家紋。正勝がこの戦で掲げた旗の形を示すものではない。';
const SAKUMA = '佐久間の戦当時の紋は今回確かめられず、陣羽織と隊旗には紋を描かない。背の織田の旗は味方の目印。';
const TAKIGAWA = '滝川の丸に竪木瓜の絵は仮のもの。この戦で使われた旗の形は今回確かめられていない。';
const NOTES = {
  okehazama: [SHIBATA],
  sunomata: [HACHI, '前野の紋は今回確かめられず、描いていない。'],
  mitsukuri: [NIWA, SAKUMA, '佐久間・丹羽・藤吉郎の持ち場や攻める順、台詞は遊びのための復元。'],
  okawachi: [NIWA],
  anegawa: [SHIBATA, SAKUMA, '柴田や佐久間の段の順、援軍の合図は遊びのための復元。'],
  nodafukushima: [SAKUMA],
  mikatagahara: [SAKUMA, '滝川の参戦には説の違いがある。台地の東の兵を、滝川本人の確かな持ち場とはしない。'],
  tonezaka: [SHIBATA],
  odani: [HACHI, '蜂須賀の手が西の口を内から開ける場面は、遊びのための復元。'],
  nagashima: [SHIBATA],
  tennoji: [SAKUMA, NIWA, TAKIGAWA, '藤孝の戦当時の紋は今回確かめられず、描いていない。『細川幽斎覚書』は軍中の心得の手がかりで、この戦の持ち場や台詞を裏付けるものとはしない。'],
  shigisan: ['細川藤孝は、後に幽斎と呼ばれる人。この戦の頃の名は藤孝とする。'],
  tedorigawa: [SHIBATA],
  arioka: [TAKIGAWA],
  iga: [NIWA],
  tano: [TAKIGAWA],
  tottori: [HACHI, '蜂須賀の柵の持ち場や鉄砲の指図は、遊びのための復元。'],
};

// 戦の登録時だけ実行する。兵・材質を増やさず、毎コマの処理にも加えない。
export function addOdaHistory(defs) {
  for (const [id, notes] of Object.entries(NOTES)) {
    const def = defs[id];
    if (!def || !def.history) continue;
    def.history += ' ' + notes.join('') + '武将の台詞は遊びのために作ったもの。『寛政重修諸家譜』は後の時代の家譜で、そこから戦当時の旗や細かな持ち場をそのまま決めてはいない。';
  }
}
