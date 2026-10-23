// 参戦する本人の名だけを拾う。家の名から、参戦していない武将を補わない。
const PEOPLE = [
  { id:'信長', names:['織田信長'], note:'尾張から勢力を広げた、織田家の大将。' },
  { id:'秀吉', names:['木下藤吉郎', '木下秀吉', '羽柴秀吉', '豊臣秀吉'], note:'信長に仕え、のちに天下をまとめる武将。' },
  { id:'家康', names:['松平元康', '徳川家康'], note:'三河を拠点とし、のちに江戸幕府を開く武将。' },
  { id:'信玄', names:['武田信玄'], note:'甲斐を拠点に、強い軍を率いた武将。' },
  { id:'謙信', names:['上杉謙信'], note:'越後を拠点に、信玄とも戦った武将。' },
];
export function famousPerson(name) {
  return PEOPLE.find((p) => p.names.includes(name)) || null;
}

// 小谷城：長浜市の保存計画。熊本城：公式の城内紹介。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000014/14058/odani_kihonkeikaku.pdf
// https://castle.kumamoto-guide.jp/about/
const CASTLES = {
  小谷城:'尾根に沿って、城の区画が連なる山城。',
  熊本城:'川沿いに、約二百四十二歩の長い塀が続く城。',
};
// ほかの本編の札は、この遊びで再現した地形を案内する。
const STAGES = {
  // 稲生・桶狭間・森部：『信長公記』首巻。奇襲の道筋など、諸説ある細部は記さない。
  inou:['稲生の野', '川の東に広がる野。両軍の兵がぶつかる。'],
  okehazama:['桶狭間', '丘が連なる土地。今川の本陣を攻める。'],
  moribe:['森部（もりべ）の野', '川沿いの野。美濃（みの）の国の兵と戦う。'],
  // 金ヶ崎：敦賀市の城跡ガイド（海に突き出た山城と、その後の撤退戦）。
  // https://www.city.tsuruga.lg.jp/page/4440.html
  kanegasaki:['金ヶ崎', '海に突き出た山城。退く軍の背後を守る。'],
  // 姉川：長浜観光協会（川の両岸が合戦の舞台）。
  // https://kitabiwako.jp/spot/spot_2012
  anegawa:['姉川', '川の両岸に広がる野。浅井・朝倉と戦う。'],
  // 比叡山：延暦寺の境内案内。山上の堂舎へ続く山道を案内する。
  // https://hieizan.or.jp/grounds/shrine.html
  hieizan:['比叡山', '山の上に堂が連なる寺。山道が攻め口。'],
  // 三方ヶ原：浜松市の地域カルテ（三方原台地）。
  // https://www.city.hamamatsu.shizuoka.jp/c-mikatahara/mikatahara-chiikikarute.html
  mikatagahara:['三方ヶ原', '浜松の北に広がる台地。武田の軍を迎える。'],
  // 刀根坂：『信長公記』巻六。越前へ退く朝倉勢への追撃。
  tonezaka:['刀根坂', '越前へ続く峠道。退く朝倉の軍を追う。'],
  // 設楽原：新城市の馬防柵案内。三段撃ちや柵の段数は断定しない。
  // https://www.city.shinshiro.lg.jp/kanko/meisyo/babousaku.html
  shitaragahara:['設楽原', '連吾川沿いの野。柵と鉄砲で敵を迎える。'],
  // 木ノ芽峠：日本山岳会の古道案内（峠と尾根上の砦）。
  // https://kodo.jac1.or.jp/kodo120_detail/41_hokurikudo/
  echizen:['木の芽峠', '越前へ通じる峠。尾根の砦が道を守る。'],
  // 大滝寺：越前市観光協会。夜討ちは遊びの補いなので札に記さない。
  // https://www.echizen-tourism.jp/history/history2
  echizen_ikko:['大滝寺', '山あいの寺。越前の一向一揆を攻める。'],
  // 天王寺：『信長公記』巻九。小雑賀川・手取川・木津川口：巻十・十一。
  // 手取川は渡河の記録にとどめ、合戦の規模や増水による敗走を断定しない。
  tennoji:['天王寺の砦', '本願寺の南の砦。囲みを破る道が要。'],
  saika:['小雑賀川', '川の向こうは高い岸。鉄砲が渡河を阻む。'],
  tedorigawa:['手取川', '加賀の野を流れる川。軍が渡って進む。'],
  kizugawa:['木津川口', '河口の沖の海。船で本願寺への道を断つ。'],
  // 田野：甲州市の歴史散策（勝頼が天目山へ向かった経路）。
  // https://www.city.koshu.yamanashi.jp/docs/2018010400169/
  tano:['田野', '天目山のふもとの谷。武田の軍を追う。'],
  // 本能寺：京都市の旧所在地案内と『信長公記』巻十五。現在の寺とは別の場所。
  // https://www2.city.kyoto.lg.jp/html/somu/rekishi/fm/ishibumi/html/na149.html
  honnoji:['本能寺', '京の町なかの寺。明智の軍が周りを囲む。'],
  inabayama:['稲葉山城', '急な山の上の城。坂道が攻め口になる。'],
  sunomata:['墨俣の砦', '川の岸の砦。舟で荷を運び込む。'],
  mitsukuri:['箕作城', '山の斜面に区画が重なる城。坂と石段で上る。'],
  nodafukushima:['野田・福島の砦', '川と堀に囲まれた砦。水辺の道が攻め口になる。'],
  shiga:['宇佐山城', '山の上から、麓へ続く道を見張る城。'],
  okawachi:['大河内城', '坂の攻め口を持つ城。退く時も道の守りが要る。'],
  odani:['小谷城', CASTLES.小谷城],
  nagashima:['長島の砦', '川と湿地に囲まれた砦。狭い道を通って近づく。'],
  nagashinojo:['長篠城', '川に挟まれた城。門と塀で敵を防ぐ。'],
  iwamura:['岩村城', '山道の先にある城。登る道が守りの要になる。'],
  shigisan:['信貴山城', '山の上の城。坂を上って攻める。'],
  miki:['三木城', '城の周りの小さな砦と、食べ物を運ぶ道が戦の要。'],
  arioka:['有岡城', '町も守りに取り込んだ城。堀と門が行く手をふさぐ。'],
  tottori:['鳥取城', '山の城を囲み、米を運ぶ舟を止める。'],
  takato:['高遠城', '堀と門で区画を分けた城。一つずつ奥へ進む。'],
  takato_siege:['高遠城', '堀と門で区画を分けた城。一つずつ奥へ進む。'],
  iga:['比自山城', '山道の先に守りを重ねた城。狭い攻め口に注意。'],
  suwahara:['諏訪原城', '堀と土の壁で守る城。門への道を確かめよう。'],
  sanadamaru:['真田丸', '大坂城の外に設けた守り。堀と柵で敵を迎える。'],
};
export function castleWelcome(rt) {
  const info = rt?.def.mapInfo;
  if (info) {
    const feature = CASTLES[info.castle] || {
      yama:'山の斜面に区画を重ねた城。坂道を守りに使う。',
      hira:'平地の城。堀と塀で敵を防ぐ。',
      toride:'土の壁と柵で守る、小さな城。',
    }[info.type] || '門と塀で敵を防ぐ城。通れる道を探そう。';
    return `${info.castle}：${feature}`;
  }
  const stage = STAGES[rt?.def.id || rt?.def.key];
  return stage ? `${stage[0]}：${stage[1]}` : '';
}
export function battlePeople(rt) {
  if (!rt) return [];
  const names = [rt.taisho?.a?.name, rt.taisho?.b?.name];
  if (rt.G?.lord) names.push(rt.player?.u?.name);
  for (const unit of rt.army.units) if (unit.alive && unit.name) names.push(unit.name);
  const found = new Set(), result = [];
  for (const name of names) {
    const person = famousPerson(name);
    if (!person || found.has(person.id)) continue;
    found.add(person.id); result.push({ ...person, name });
  }
  return result.slice(0, 3);
}
