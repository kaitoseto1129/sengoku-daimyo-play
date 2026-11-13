import { battleVoiceLines } from './speech_clean.js';
// 戦の中の声を厚くする言葉の束。
// ここは表と選ぶ関数だけを持つ。使う側は import { pickLine } して、rt.bark / rt.say に渡すだけでよい。
//
// 場面（scene）は次の六つ：
//   ambient  … 足軽のざわめき（戦の間、常にある呟き。事件に紐づかない）
//   nanori   … 名乗り（開戦・組ごとの名乗り合い）
//   order    … 上役の指図（組頭・侍大将の下知）
//   allyDown … 味方がやられた時
//   pushing  … 押している時（敵がひるんだ・崩れかけた）
//   breaking … 崩れかけた時（味方が崩れる・浮き足立つ）
//
// 敵の家（mon）ごとに口ぐせを足せる。無ければ enemy 共通を使う。

// ---- 共通（ally＝味方、enemy＝敵方の共通の声） ----
export const COMMON_LINES = {
  ambient: {
    ally: [
      'ふう……槍はまだ振れる',
      '生きて帰るぞ……',
      '槍が、重い……',
      '隣、離れるな',
      '喉が渇いた……',
      '来るぞ、構えよ',
      '足元、悪いぞ',
      '指が、こわばってきた……',
      '兄者はどこじゃ……',
      '肩が上がらぬ……',
    ],
    enemy: [
      '敵陣がざわついておる',
      '来たぞ、構えい！',
      '槍を揃えよ！',
      '一人も通すな！',
      '崩すでないぞ！',
      '踏ん張れ、踏ん張れ！',
      '隙を見せるな！',
      '前へ、前へ！',
    ],
  },
  nanori: {
    ally: [
      '尾張の足軽ぞ、いざ勝負！',
      '我が名は聞こえておろう！　いざ！',
      '一番槍、頂戴つかまつる！',
      'ここな者、いざ尋常に！',
    ],
    enemy: [
      '何者じゃ、名乗れ！',
      '小癪な、名を聞いてくれよう！',
      'ほざくな、若造が！',
      '名乗るほどの者か、見てくれる！',
    ],
  },
  order: {
    ally: [
      '組頭「固まって進め！　離れるな！」',
      '侍大将「怯むな！　旗の下に集まれ！」',
      '組頭「左、寄せよ！　右は抑えじゃ！」',
      '侍大将「息を整えよ、まだ終わらぬぞ！」',
      '組頭「怪我人を後ろへ！　前は詰めよ！」',
    ],
  },
  allyDown: {
    ally: [
      '仲間が倒れた。隣の味方と列を守れ！',
      '誰か、誰か肩を貸してやれ！',
      'おのれ……　仇は必ず討つぞ！',
      '下がらせよ、後ろへ運べ！',
      '……名を、覚えておくぞ',
    ],
  },
  pushing: {
    ally: [
      'このまま押し切るぞ！',
      '敵の足が止まった、今じゃ！',
      '崩れかけておる、休ませるな！',
      '声を上げよ、勢いを付けよ！',
    ],
    enemy: [
      'ええい、押し込まれるな！',
      '下がるでない、支えよ！',
      '崩れるでないぞ、堪えよ！',
    ],
  },
  breaking: {
    ally: [
      '踏ん張れ、槍を離すな……！',
      '崩れるな、肩を寄せよ！',
      '誰ぞ、支えてくれ……！',
      '息が、続かぬ……！',
    ],
    enemy: [
      'もう、持たぬ……！',
      '崩れるぞ、支えよ！',
      'ひ、退けい……！',
    ],
  },
};

// 武将の戦況への返事。すべて遊びのための創作で、史実の発言としては扱わない。
export const GENERAL_LINES = {
  nobunaga: {
    names: /^(?:織田)?信長$/,
    pushing: ['押せ。今だ。', '敵の列を割れ。', '止まるな。旗を進めよ。'],
    breaking: ['乱れるな。列を戻せ。', '退くな。ここで支えよ。', '固まれ。まだ戦える。'],
    allyDown: ['討たれたか。列を埋めよ。', '惜しい者を。列を埋めて進め。', '残る者を守れ。'],
    // 敵が崩れた時の声は、目標（追え・守れ）と食い違わない言葉だけ。「追うな・持ち場へ戻れ」は言わない（11/6 共通の係・背を向ける）
    enemyFlee: ['敵が崩れたぞ。', '敵は背を見せた。', '一手崩した。次へかかれ。'],
  },
  hideyoshi: {
    names: /^(?:(?:木下|羽柴|豊臣)?秀吉|(?:木下)?藤吉郎)$/,
    pushing: ['よしよし、もうひと押しじゃ！', '皆、ようやった！　旗に続こうぞ！', '敵がひるんだぞ！　声を合わせて進め！'],
    breaking: ['案ずるな！　隣の者と肩を寄せよ！', '一息つこうぞ！　旗の下へ戻れ！', 'ここは皆で支えよう！　一人で出るな！'],
    allyDown: ['おお……あの者が討たれたか。残る者どもを守れ', '無念じゃ……。者ども、離れるな', 'その働き、忘れはせぬぞ。皆、生きて帰れ'],
    enemyFlee: ['敵が崩れたぞ！　ようやった！', '皆の働きじゃ！　敵が背を見せたぞ！', 'よしよし、一手崩したぞ！'],
  },
  katsuie: {
    names: /^(?:柴田)?勝家$/,
    pushing: ['踏み込め！　わしに続け！', '腰を据えろ！　押し切るぞ！', '敵がひるんだ！　槍をそろえろ！'],
    breaking: ['踏ん張れ！　わしが支える！', '退くな！　ここで槍をそろえよ！', '歯を食いしばれ！　旗を守れ！'],
    allyDown: ['無念……。残る者はわしの後ろへ来い！', '朋輩を失うたか。これ以上は討たせぬ！', '嘆くのは後じゃ。今は隣を守れ！'],
    enemyFlee: ['敵が崩れたぞ！', '見たか！　敵は背を見せたぞ！', '一手崩した！　次の敵へかかれ！'],
  },
  mitsuhide: {
    names: /^(?:(?:明智|惟任)?光秀|明智十兵衛)$/,
    // 将が足軽へ言う言葉。丁寧語にしない（11/6 天王寺の critic）
    pushing: ['敵の列が乱れた。足並みをそろえて進め', 'こちらが押しておる。隣の隊と並べ', 'よう支えた。旗を前へ進めよ'],
    breaking: ['落ち着け。旗の下へ戻れ', '押されておる。ここで支えよ', '列を整えよ。一人で前へ出るな'],
    allyDown: ['討たれたか……。残る者を守れ', 'その働き、忘れぬ。列を離れるな', '無念じゃ。空いた持ち場を支えよ'],
    enemyFlee: ['敵が崩れた', '敵は背を見せたぞ', '一手崩した。次へかかれ'],
  },
  ieyasu: {
    names: /^(?:徳川|松平)?家康$/,
    pushing: ['よし。慌てず、隣の隊と進め', '押しておるな。備えを崩すでない', '今こそ前へ。後ろの守りも忘れるな'],
    breaking: ['耐えよ。退くでない', '焦るな。旗の下で立て直すぞ', 'ここで支えよ。離れた者を呼び戻せ'],
    allyDown: ['惜しい者を失った……。残る者を守るぞ', '無念じゃ。だが列を空けてはならぬ', 'その働きは覚えておく。今は退く道を守れ'],
    enemyFlee: ['敵が崩れたか', '敵は背を見せたぞ', '一手崩した。旗を離すな'],
  },
  toshiie: {
    names: /^(?:前田)?利家$/,
    pushing: ['槍を入れよ！　わしに続け！', 'いま一押しじゃ！　槍先をそろえよ！', '敵は怯んだぞ！　押し込め！'],   // 11/6 今の言い回しをやめる（桶狭間の学び）
    breaking: ['わしの脇へ寄れ！　ここで支えよ！', '列を戻せ！　まだ槍は折れておらぬ！', '慌てるな！　退くでないぞ！'],
    allyDown: ['朋輩が……。残る者は離れるな！', '忘れはせぬ。今は味方を守れ！', '無念じゃ……。その持ち場はわしが支える！'],
    enemyFlee: ['敵が崩れたぞ！', 'よし、敵が背を見せた！', '一手崩した！　次へかかれ！'],
  },
};

// 出来事の時だけ近くの生きた味方を探す。兵や毎コマの配列を増やさない。
// group：allyDown の時の討たれた兵の組（その組の将だけが嘆く）
export function generalSituation(rt, scene, pos, group) {
  if (rt.over || rt.def.dojo || rt.flags.quiet || !rt.player.u.alive ||
      (rt.prelude && rt.prelude !== 'done') || !pos ||
      rt.t - (rt._generalCallT ?? -99) < 12 || rt._sayGate > rt.t || rt.hud.subQ.length > 1) return;
  const P = rt.player.u.pos;
  // 将の声は、本人の声の届く所（三十五歩ほど）にいる時だけ。後ろの本陣の大将の声を前の足軽に聞かせない（11/6 姉川）
  if ((pos.x - P.x) ** 2 + (pos.z - P.z) ** 2 > 3600) return;
  // 嘆き・追うなの声は、戦が動いてから（始まって四十五秒より前に「無念」「敵が逃げる」を言わせない）。
  // 嘆きは味方の方が目に見えて減っている時だけ。勝っている側の大将が「無念じゃ」と言わない（11/6 稲葉山・長島・小谷の頼み）
  if ((scene === 'allyDown' || scene === 'enemyFlee') && rt.t < 45) return;
  if (scene === 'allyDown') {
    const me = rt.player.u.team, m = rt._gsMax || (rt._gsMax = [0, 0]);
    let a = 0, b = 0;
    for (const u of rt.army.units) if (u.alive && !u.civ && !u.isStruct && !u.fleeing) { if (u.team === me) a++; else b++; }
    m[0] = Math.max(m[0], a); m[1] = Math.max(m[1], b);
    if (a / Math.max(1, m[0]) >= b / Math.max(1, m[1])) return;
  }
  let speaker = null, profile = null, best = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== rt.player.u.team || u.fleeing || (u.group && u.group.routed) ||
        !u.name || (u.type !== 'busho' && u.type !== 'samurai' && !(u.isPlayer && rt.G.lord))) continue;
    if ((u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2 > 1225) continue;
    if (group && u.group !== group) continue;
    const d = (u.pos.x - pos.x) ** 2 + (u.pos.z - pos.z) ** 2;
    if (d > 3600 || d >= best) continue;
    for (const key in GENERAL_LINES) {
      const general = GENERAL_LINES[key];
      if (general.names.test(u.name) && general[scene]) { speaker = u; profile = key; best = d; break; }
    }
  }
  if (!speaker) return;
  // 同じ将の同じ場面の台詞は、九十秒あけて一度だけ（十数秒ごとの繰り返しをなくす）
  const said = rt._generalSaid || (rt._generalSaid = {}), sk = `${speaker.name}:${scene}`;
  if (rt.t - (said[sk] ?? -999) < 90) return;
  said[sk] = rt.t;
  // 戦ごとに大将の決まり声を止める・差し替える口（def.generalLines(名, 場面) が [] なら黙る・配列なら差し替え。11/5 共通の係）
  const lines = rt.def.generalLines?.(speaker.name, scene) ?? GENERAL_LINES[profile][scene];
  if (!lines?.length) return;
  const recent = rt._generalRecent || (rt._generalRecent = {}), key = `${profile}:${scene}:${lines.length}`;
  const n = recent[key] ?? Math.floor(Math.random() * lines.length);
  recent[key] = (n + 1) % lines.length;
  // 声全体を十二秒あける。字幕も既存の共通処理で同じ文を八秒あける。
  rt._generalCallT = rt.t;
  rt.say(speaker.name, lines[n], 3);
}

// ---- 敵の家ごとの口ぐせ（mon は戦の定義の sides.b.mon） ----
// scene ごとに 3〜8 通り。無い scene は COMMON_LINES.*.enemy を使う。
export const FACTION_LINES = {
  imagawa: {
    ambient: ['駿河の旗の下ぞ、誇りを持て', '海道一の弓取りぞ、恐れるな', '尾張なぞ、一息で踏み潰す'],
    nanori: ['駿河守が家来なるぞ、名乗れい！', '今川の御旗の前ぞ、覚悟せい！'],
    order: ['駿河勢、押し出せ！', '本陣を固く守れ！', '尾張の小勢に構うな、進め！'],
    pushing: ['駿河勢の数を見よ！', '尾張の小勢、踏み潰せ！', '海道一の名にかけて！'],
    breaking: ['駿河の衆、崩れるな！', 'ここは御本陣の前ぞ！', '殿を、殿をお守りせよ……！'],
  },
  saito: {
    ambient: ['美濃三人衆はどこじゃ……', '稲葉山はまだ遠いか', '蝮の名を辱めるな'],
    nanori: ['美濃の家来なるぞ、名乗れ！', '稲葉山城下、通さぬぞ！'],
    order: ['美濃勢、崩すでないぞ！', '城へ寄せて食い止めよ！', '弓を惜しむな、射かけよ！'],
    pushing: ['美濃の地ぞ、追い返せ！', '尾張のうつけの兵ぞ、恐れるな！', '美濃の衆、押し出せ！'],
    breaking: ['美濃の者が逃げるか！', '城へ戻れ、城へ！', '稲葉山まで退け！'],
  },
  azai: {
    ambient: ['小谷の殿の御恩、忘れぬぞ', '姉川はもう近いか', '浅井三代の意地を見せよ'],
    nanori: ['近江浅井が郎党なるぞ！', '小谷の名にかけて名乗れ！'],
    order: ['近江勢、乱れるでないぞ！', '姉川を背に、退くな！', '朝倉勢と息を合わせよ！'],
    pushing: ['浅井の意地を見せよ！', '裏切り者の織田を討て！', '近江の衆、押し込め！'],
    breaking: ['近江の者、退くな！', '小谷の殿に顔向けできぬ！', '姉川を渡って退け！'],
  },
  asakura: {
    ambient: ['一乗谷はまだ遠いのう……', '越前の雪を思い出すわ', '朝倉の旗、絶やすな'],
    nanori: ['越前朝倉が家来なるぞ！', '三つ盛木瓜、覚悟して見よ！', '越前の意地、見せてくれよう！'],
    order: ['越前勢、固まって進め！', '浅井勢を見捨てるな！', '無理はするな、まず備えよ！'],
    pushing: ['越前の衆、かかれ！', '朝倉の名にかけて！', '三つ盛木瓜の旗に続け！'],
    breaking: ['越前へ戻るぞ！', '一乗谷まで持たぬ……！', '国へ帰らせてくれ……！'],
  },
  takeda: {
    ambient: ['甲斐の山を思えば、これしき', '風林火山、忘れるな', '騎馬武者の名、辱めるな'],
    nanori: ['甲斐武田が家来なるぞ、名乗れ！', 'お屋形様の御前ぞ、下がるな！', '風林火山の旗の下、参る！'],
    order: ['甲斐勢、崩すでないぞ！', '騎馬を前へ、駆けさせよ！', '鉄砲になど怯むな、進め！'],
    pushing: ['風林火山の旗を見よ！', '甲斐の武者に続け！', '騎馬武者、蹴散らせ！'],
    breaking: ['甲斐の者が退くか！', 'お屋形様の御前ぞ、踏みとどまれ！', '馬が、馬が使えぬ……！'],
  },
  namu: {
    ambient: ['南無阿弥陀仏、南無阿弥陀仏……', '御坊、我らをお導きくだされ', '仏敵、許すまじ'],
    nanori: ['一向宗の門徒なるぞ！', '進めば極楽ぞ、名乗れい！', '南無阿弥陀仏、南無阿弥陀仏！'],
    order: ['門徒衆、退いてはならぬ！', '御坊の下知に従え！', '御旗を守れ、囲め！'],
    pushing: ['「進めば極楽、退けば地獄」と伝わる', '南無阿弥陀仏！', '仏敵を討ち滅ぼせ！'],
    breaking: ['南無阿弥陀仏……！', '退けば地獄ぞ、退くな！', '御坊……　我らはもう……'],
  },
  mori: {
    ambient: ['安芸の海が恋しいのう', '三本の矢の教え、忘れるな', '瀬戸の潮のように押せ'],
    nanori: ['安芸毛利が家来なるぞ！', '三本の矢の名にかけて！'],
    order: ['毛利勢、崩れるでないぞ！', '船手と息を合わせよ！', '一丸となって支えよ！'],
    pushing: ['毛利の旗の下に集え！', '毛利の衆、肩を並べて押せ！', '瀬戸の海のように押し込め！'],
    breaking: ['安芸の者、崩れるな！', '船へ戻れ、船へ！', '隣の組が、崩れた……！'],
  },
  uesugi: {
    ambient: ['毘沙門天の御加護あれ', '越後の雪よりなお冷たく', '軍神の名を辱めるな'],
    nanori: ['越後上杉が家来なるぞ！', '毘の一字に懸けて名乗れ！'],
    order: ['越後勢、乱れ龍のごとく！', '本陣を固めよ、退くな！'],
    pushing: ['毘沙門天の加護ぞ！', '越後の衆、かかれ！', '懸かり乱れ龍の旗ぞ！'],
    breaking: ['毘の旗を守れ！', '越後へ引け！', '軍神の名が、廃る……！'],
  },
  miyoshi: {
    ambient: ['畿内はまだ渡さぬ', '阿波の兵、恐れるでないぞ'],
    nanori: ['三好が家来なるぞ、名乗れ！'],
    order: ['三好勢、都を渡すな！', '固く守れ、崩すでないぞ！'],
    pushing: ['三好の衆、押し返せ！', '都は渡さぬ！'],
    breaking: ['阿波へ戻れ！', '畿内を捨てるか……！'],
  },
  akechi: {
    ambient: ['桔梗の旗、絶やすな', 'もう後には引けぬぞ'],
    nanori: ['明智が家来なるぞ、名乗れ！'],
    order: ['惟任の衆、本能寺を囲め！', '一人も逃すでないぞ！'],
    pushing: ['寺へ押し込め！', '桔梗の旗に続け！', '天下はもう我らの物ぞ！'],
    breaking: ['惟任の衆、退くな！', '坂本へ引け！'],
  },
};

// ---- 戦ごとの口ぐせ（battle は戦の定義の key＝ODA_LINE の id）----
// その戦「らしさ」を一つ決め、常盤（COMMON_LINES）・家の口ぐせ（FACTION_LINES）に重ねて使う。
// scene ごとに無理に埋めない。無ければ常盤と家の口ぐせだけで足りる。
export const BATTLE_LINES = {
  okehazama: {
    ambient: {
      ally: ['雨で足元が見えぬ。旗を見失うな', '組と槍をそろえよ', '道の先に今川の旗じゃ'],
      enemy: ['この雨、早う止まぬか', '本陣の口を守れ'],
    },
    order: { ally: ['組頭「旗に続け。列を離すな！」', '組頭「組と槍をそろえて押せ！」'] },
    // 今川の者は主の義元を「御屋形様」と呼ぶ（守護の家の当主）
    pushing: { enemy: ['織田の旗じゃ。備えよ！', '御屋形様の囲みを崩すな！'] },
    breaking: { enemy: ['御本陣が……！　御屋形様をお守りせよ！', 'こんな小勢に、なぜ……！'] },
  },
  moribe: {
    ambient: {
      ally: ['雨で畦が滑る。組を離すな', '北岸の畦で、槍をそろえよ'],
      enemy: ['墨俣から出た備じゃ。押し返せ'],
    },
    order: { ally: ['組頭「前の味方と並べ！　槍の列を切らすな！」'] },
    pushing: { enemy: ['槍の列が乱れた！', '横から押されておる！'] },
  },
  sunomata: {
    ambient: {
      ally: ['川の舟を見張れ。東の柵を空けるな', '人足の道を空けよ。柵の内で受けるぞ'],
      enemy: ['槍をそろえよ。柵の口を押せ！', '竹束の陰へ寄れ。矢が来るぞ！'],
    },
    order: { ally: ['藤吉郎「柵の内で守れ、築くのはこちらの仕事じゃ！」'] },
  },
  inabayama: {
    ambient: {
      ally: ['井口の町の煙、もう見えるぞ', '城への道を断て。兵糧を入れるな'],
      enemy: ['三人衆が寝返ったと……！', '殿はまだ城においでか'],
    },
    order: { ally: ['組頭「鹿垣を締めよ、逃がすな！」'] },
    breaking: { enemy: ['稲葉山、もう危ういぞ……！', '城を明け渡すほかあるまい……'] },
  },
  mitsukuri: {
    ambient: {
      ally: ['列をそろえ、坂の守りを押せ', '旗を見失うな、仲間と進め'],
      enemy: ['口は狭い。槍をそろえて止めよ', '弓の組、坂道へ射かけよ'],
    },
    pushing: { enemy: ['一夜で城が……！', '観音寺城まで持つまい……'] },
  },
  okawachi: {
    ambient: {
      ally: ['この雨、鉄砲が使えぬ……', '搦手から回れ、押し込め'],
      enemy: ['夜討ちなど、この雨で通ると思うたか！'],
    },
    order: { ally: ['組頭「鉄砲は当てにするな、槍で押せ！」', '長秀「無理はするな、囲みを固めるぞ！」'] },
    breaking: { enemy: ['押し返したぞ、織田勢が退く！'] },
  },
  kanegasaki: {
    ambient: {
      ally: ['浅井が裏切ったと……！', '殿様はもう朽木へ向かわれたか', '殿の務めは辛いが、我らがやらねば'],
      enemy: ['前後から挟んでくれるわ！'],
    },
    order: { ally: ['藤吉郎「殿様が落ち延びられるまで、ここを動くな！」', '光秀「追手を防げ、一歩も通すな！」'] },
    breaking: { ally: ['まだ耐えよ、殿はもう遠くへ……'] },
  },
  anegawa: {
    ambient: {
      ally: ['川を挟んで大乱戦じゃ', '徳川勢は西で朝倉と当たっておるぞ'],
      enemy: ['磯野様の突き、見たか！'],
    },
    pushing: { enemy: ['前の備えを抜いたぞ！　奥へ押せ！'] },
    breaking: { enemy: ['列が崩れた！　旗のもとへ戻れ！', '小谷へ退くほかあるまい！'] },
  },
  nodafukushima: {
    ambient: {
      ally: ['鉄砲の音が昼も夜も絶えぬ', '深みに入るな。味方の旗を見失うな'],
      enemy: ['砦の口を固めよ！　織田を寄せるな！'],
    },
    order: { ally: ['利家「味方と槍を揃えよ。深追いするな！」'] },
  },
  shiga: {
    ambient: {
      ally: ['浅井・朝倉が坂本へ出てきたと……', '宇佐山城を、何としても守るぞ'],
      enemy: ['三万の大軍ぞ、恐れるな！'],
    },
    order: { ally: ['槍の列を離れるな。持ち場で受けよ！'] },
    breaking: { ally: ['囲まれるぞ！　味方の槍の列へ戻れ！'] },
  },
  hieizan: {
    ambient: {
      ally: ['谷へ逃げる者は後の手に任せよ。本道を急げ', '坂本の煙が山まで届いておる'],
      enemy: ['仏罰を恐れぬか、織田め！'],
    },
    order: { ally: ['組頭「刃向かう僧兵を退けよ。逃げる者は後の手に任せよ！」'] },
  },
  mikatagahara: {
    ambient: {
      ally: ['信玄の兵の数が違いすぎる……', '魚鱗の構え、崩せるか……'],
      enemy: ['甲斐の強さ、思い知るがよい！'],
    },
    order: { ally: ['家康「退くな、まだ崩れるな！」'] },
    breaking: { ally: ['平手様が……！　城へ退け、退けい！'] },
  },
  tonezaka: {
    ambient: {
      ally: ['味方の旗に続け。道を外れるな', '敵が向き直るぞ。槍を揃えよ！'],
      enemy: ['追い手が来るぞ！　退く朋輩を守れ！', '道を空けろ！　列が詰まる！'],
    },
    order: { ally: ['信長「油断するな、遅れる者は許さぬぞ！」'] },   // 11/6 fix61：この戦の「殿」は朝倉の殿（しんがり）。主君を「殿」と呼ぶと取り違える
    breaking: { enemy: ['後ろの槍が崩れた！　退け！', 'この道は守れぬ！　仲間と退くぞ！'] },
  },
  odani: {
    ambient: {
      ally: ['京極丸を突けば、本丸と小丸を裂ける', '小谷の尾根は長いぞ、気を抜くな'],
      enemy: ['京極丸を渡すな！　南北の道を守れ！', '木戸の内で槍をそろえよ！'],
    },
    order: { ally: ['秀吉「京極丸まで一気に駆け上がれ！」'] },
    breaking: { enemy: ['この口は持たぬ！　奥へ退け！', '列が崩れた！　木戸へ下がれ！'] },
  },
  nagashima: {
    ambient: {
      ally: ['南無阿弥陀仏の声が、四方から聞こえるぞ', '輪中の道は狭い、はぐれるな'],
      enemy: ['南無阿弥陀仏、南無阿弥陀仏……'],
    },
    order: { ally: ['組頭「柵の内で列をそろえよ！」', '組頭「敵を追うな、味方のそばで受け止めよ！」'] },
    breaking: { enemy: ['もう、逃げ場が……ない……'] },
  },
  shitaragahara: {
    ambient: {
      ally: ['馬防柵の内から、狙いを定めよ', '鉄砲組は列を崩すな'],
      enemy: ['徒歩は柵へ！　騎馬は後ろで備えよ！'],
    },
    order: { ally: ['組頭「寄せる敵へ放て！」'] },
    breaking: { enemy: ['前の組が崩れた！　後ろへ退け！'] },
  },
  echizen: {
    ambient: {
      ally: ['雨で足が滑る。槍の列をそろえよ', '矢玉が来るぞ。竹束の陰へ寄れ'],
      enemy: ['木戸を守れ！　峠を渡すな！', '奥の曲輪に弓を集めよ！'],
    },
    order: { ally: ['組頭「木戸を打つ者を守れ！」', '組頭「本道の先手に続け！」'] },
    breaking: { enemy: ['ここは支えられぬ！　奥へ退け！', '府中への道を残せ！'] },
  },
  iwamura: {
    ambient: {
      ally: ['冬の夜討ちじゃ、寒さに気を取られるな', '水晶山の陣を崩されるな'],
      enemy: ['この夜のうちに織田の陣を叩くぞ！'],
    },
    order: { ally: ['秀隆「槍をそろえよ。組を離れるな！」', '秀隆「一人で追うな。隣の者を守れ！」'] },
    breaking: { enemy: ['陣の柵を破れぬ！　山道へ退け！'] },
  },
  tennoji: {
    ambient: {
      ally: ['殿が自ら先頭に立たれたぞ！', 'わずかな供でも、恐れるな'],
      enemy: ['木津で織田勢を退けたぞ。砦も押せ！'],
    },
    order: { ally: ['味方の旗へ続け！　槍を揃えよ！'] },
    breaking: { enemy: ['先の列が崩れた！　城戸口へ退け！'] },
  },
  saika: {
    ambient: {
      ally: ['川底に何か沈めてあるぞ、気をつけよ', '対岸の柵から鉄砲が飛んでくる'],
      enemy: ['鉄砲なら、我らが本場ぞ！'],
    },
    order: { ally: ['組頭「乱杭に足を取られるな、慎重に渡れ！」'] },
    breaking: { enemy: ['寄せは止めじゃ！　来た道を戻れ！'] },
  },
  tedorigawa: {
    ambient: {
      ally: ['七尾城はもう落ちたと……', '夜の川、増水がひどいぞ！'],
      enemy: ['毘沙門天の御加護、いま見せてくれるわ！'],
    },
    order: { ally: ['組頭「中央の浅い所へ！　列を離れるな！」'] },
    breaking: { ally: ['川に飲まれるな……！　退くぞ、退け！'] },
  },
  shigisan: {
    ambient: {
      ally: ['尾根道は狭い。列を離れるな', '片岡城は落ちた。次は信貴山じゃ', '門を破る組に矢を近づけるな'],
      enemy: ['木戸を守れ！', '尾根の口で槍をそろえよ！'],
    },
    order: { ally: ['信忠「城を囲め、逃がすでないぞ！」'] },
    breaking: { enemy: ['次の曲輪へ退け！', '本丸の口で立て直せ！'] },
  },
  kizugawa: {
    ambient: {
      ally: ['船べりは堅い。甲板の火には気をつけよ', '寄る小早は、大筒で止めるぞ', '乗り口を味方と固めよ'],
      enemy: ['前は焼き払ったのじゃ、今度も同じよ！'],
    },
    order: { ally: ['嘉隆「船を離すな。敵を間近まで引き付けよ！」'] },
    breaking: { enemy: ['大船に歯が立たぬ……！　退け！'] },
  },
  miki: {
    ambient: {
      ally: ['囲みは長い。兵糧の道を守れ', '付城の柵を破られるな'],
      enemy: ['兵糧さえ入れば、まだ戦える……！'],
    },
    order: { ally: ['秀吉「兵糧を通すな、一粒たりとも入れさせるな！」'] },
    breaking: { ally: ['列が崩れる！　馬印の前へ戻れ！'] },
  },
  arioka: {
    ambient: {
      ally: ['もう一年近くこの囲みじゃ……', '内応する者が出たらしいぞ'],
      enemy: ['木戸を取り返せ！', '町の辻で食い止めよ！'],
    },
    order: { ally: ['一益「惣構えの内へ、一気に攻め入るぞ！」'] },
  },
  iga: {
    ambient: {
      ally: ['六つの口から一斉に攻め入るぞ', '夜討ちに気をつけよ、伊賀衆は手強い'],
      enemy: ['この山を知らぬ者に負けはせぬ！'],
    },
    order: { ally: ['丹羽「組を離れるな。林へ追うな！」'] },
    breaking: { enemy: ['比自山を捨てて柏原へ……！'] },
  },
  tottori: {
    ambient: {
      ally: ['城の中は、もう飢えておる', '陸の道は付城と柵で断った、米はもう入るまい'],
      enemy: ['腹が減った……もう、動けぬ……'],
    },
    order: { ally: ['秀吉「兵糧の道を断て、決して通すな！」'] },
    breaking: { enemy: ['式部様が城を開かれると……もう、立てぬ……'] },
  },
  takato: {
    ambient: {
      ally: ['殿（信忠）が自ら塀に取り付かれたぞ！', '女までが刀を取っておる、油断するな'],
      enemy: ['降るくらいなら、ここで死ぬまでよ！'],
    },
    order: { ally: ['信忠「柵を破れ、儂に続け！」'] },
    breaking: { enemy: ['盛信様が……！　もはやこれまで……'] },
  },
  tano: {
    ambient: {
      ally: ['勝頼様はもう、逃げ場がないぞ……', '小山田にも背かれたと……'],
      enemy: ['もう、供の数も残り少ない……'],
    },
    order: { ally: ['一益「深追いはするな、しかし逃がすでないぞ！」'] },
    breaking: { enemy: ['御屋形様……！　武田は、ここまでか……'] },
  },
  honnoji: {
    ambient: {
      ally: ['桔梗の旗が塀の外を埋めておる！', '門の内で構えよ！　敵を追うな！'],
      enemy: ['門の口へ続け！', '塀の内へ押し込め！'],
    },
    order: { ally: ['門の口を固めよ！', '供の後ろで並び直せ！'] },
    breaking: { ally: ['もう、火が回っておる……　殿……！'] },
  },
};

// ---- 選ぶ関数：同じ文が続かないよう、近くに使った物は避けて一つ選ぶ ----
// rt.flags 等に記憶を持たせず、rt._lineRecent（battle.js の voiceRecent と同じ考え）へ積む。
// rt が無い呼び出し（sim 等）にも耐えるよう、第一引数が無ければ Math.random だけで選ぶ。
function pickFrom(rt, memoKey, list) {
  if (!list || !list.length) return '';
  if (!rt) return list[Math.floor(Math.random() * list.length)];
  const R = rt._lineRecent || (rt._lineRecent = {});
  const used = R[memoKey] || (R[memoKey] = []);
  const free = list.filter((x) => !used.includes(x));
  const w = (free.length ? free : list)[Math.floor(Math.random() * (free.length || list.length))];
  used.push(w);
  while (used.length > Math.max(1, Math.floor(list.length / 2))) used.shift();
  return w;
}

// scene: 'ambient'|'nanori'|'order'|'allyDown'|'pushing'|'breaking'
// side: 'ally'|'enemy'（order・allyDown は ally のみ）
// mon: 敵の家の鍵（例：rt.def.sides.b.mon）。省略すると COMMON_LINES のみ
export function pickLine(rt, scene, side = 'enemy', mon = null) {
  const custom = battleVoiceLines(rt, scene, side);
  if (custom !== null) return pickFrom(rt, `${scene}:${side}:battle`, custom);
  const common = (COMMON_LINES[scene] && COMMON_LINES[scene][side]) || [];
  const fac = side === 'enemy' && mon && FACTION_LINES[mon] && FACTION_LINES[mon][scene];
  let list = fac && fac.length ? common.concat(fac) : common;
  const bkey = rt && rt.def && rt.def.key;
  const bat = bkey && BATTLE_LINES[bkey] && BATTLE_LINES[bkey][scene] && BATTLE_LINES[bkey][scene][side];
  if (bat && bat.length) list = list.concat(bat);
  // 雨の台詞は、いま雨が降っている時だけ（A006・A024）
  if (rt && rt.world && !(rt.world.rainLevel > 0.3)) { const dry = list.filter((s) => !/雨|豪雨/.test(s)); if (dry.length) list = dry; }
  return pickFrom(rt, `${scene}:${side}:${mon || ''}:${bkey || ''}`, list);
}

// 便利関数：戦の定義から敵の家の鍵を取り出す（rt.def.sides.b.mon）
export function monOf(rt) {
  return (rt && rt.def && rt.def.sides && rt.def.sides.b && rt.def.sides.b.mon) || null;
}
