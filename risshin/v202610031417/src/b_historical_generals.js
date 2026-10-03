// 参戦と討死の根拠：太田牛一『信長公記』（町田本）。
// https://ja.wikisource.org/wiki/信長公記
// 台詞と隊内の立ち位置は戦場の合図として補う。逸話や人物の物語は加えない。
// 旗は所属する軍の合印。個人の指物が史料に記されない者の家紋は作らない。
const ally = (name, g, line, flag = 'oda', extra = {}) =>
  ({ name, team: 0, g, line, flag, horse: false, shared: true, ...extra });
const foe = (name, g, line, flag) =>
  ({ name, team: 1, g, line, flag, horse: false, shared: true });
const mikataFall = (rt) => rt.flags.step >= 3;
const honnoFall = (rt) => rt.G.lord ? rt.flags.lstep >= 3.5 : rt.flags.hp >= 8;

export const HISTORICAL_GENERALS = {
  // 首巻「今川義元討死之事」：首を持って参上した馬廻衆。
  okehazama: [
    ally('前田利家', /織田|馬廻|信長/, '前田利家じゃ。槍をそろえて進め！', 'eiraku'),
    ally('木下雅楽助', /織田|馬廻|信長/, '木下雅楽助じゃ。足を止めるな！', 'eiraku'),
    ally('中川金右衛門', /織田|馬廻|信長/, '中川金右衛門じゃ。信長様に続け！', 'eiraku'),
    foe('山田新右衛門', /今川|旗本|本陣/, '山田新右衛門なり。御屋形様のもとへ戻る！', 'imagawa'),
  ],
  // 巻三「あね川合戦之事」：美濃三人衆と、討ち取られた将の名。
  anegawa: [
    ally('氏家卜全', /稲葉|佐久間|森/, '氏家卜全じゃ。東の手を支えよ！'),
    ally('安藤守就', /稲葉|佐久間|森/, '安藤守就じゃ。川の浅い所へ進め！'),
    foe('真柄十郎左衛門', /朝倉/, '真柄十郎左衛門なり。朝倉の者、押せ！', 'asakura'),
    foe('前波新八', /朝倉/, '前波新八なり。槍をそろえよ！', 'asakura'),
  ],
  // 巻五「味方か原合戦之事」：水野下野守は援軍。長谷川・佐脇は討死。
  mikatagahara: [
    ally('水野信元', /佐久間/, '水野信元じゃ。浜松へ退く道を守れ！'),
    ally('長谷川橋介', /徳川の手/, '長谷川橋介じゃ。ここで受け止める！', 'tokugawa', { fall: mikataFall }),
    ally('佐脇藤八', /徳川の手/, '佐脇藤八じゃ。槍先を下げよ！', 'tokugawa', { fall: mikataFall }),
  ],
  // 巻八「三州長篠御合戦之事」：鉄砲奉行三人と、討死した土屋備前守。
  shitaragahara: [
    ally('野々村三十郎', /鉄砲組/, '野々村三十郎じゃ。柵の内から撃て！', 'oda', { faction: 'oda', keepGroup: true }),
    ally('福富平左衛門', /鉄砲組/, '福富平左衛門じゃ。弾を込めて待て！', 'oda', { faction: 'oda', keepGroup: true }),
    ally('塙直政', /鉄砲組/, '塙直政じゃ。敵が寄るまで待て！', 'oda', { faction: 'oda', keepGroup: true }),
    foe('土屋昌次', /内藤|武田|真田/, '土屋昌次なり。武田の者、前へ！', 'takeda'),
  ],
  // 巻十「柴田北国相働之事」：加賀へ出た将。上杉方の個人名・討死は同項にない。
  tedorigawa: [
    ally('佐々成政', /柴田|前田|丹羽/, '佐々成政じゃ。列を切らさず退け！'),
    ally('金森長近', /柴田|前田|丹羽/, '金森長近じゃ。川の浅い所を渡れ！'),
    ally('斎藤利治', /柴田|前田|丹羽/, '斎藤利治じゃ。渡る味方を守れ！'),
  ],
  // 巻十五「信長公本能寺にて御腹めされ候事」：御殿の討死衆。両方の遊び方で徒。
  honnoji: [
    ally('高橋虎松', /小姓/, '高橋虎松じゃ。御台所の口を守る！', 'oda', { fall: honnoFall }),
    ally('菅屋角蔵', /小姓/, '菅屋角蔵じゃ。御殿へ通すな！', 'oda', { fall: honnoFall }),
  ],
};
