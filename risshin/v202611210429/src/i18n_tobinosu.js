// K516 英語版：鳶ヶ巣山砦夜襲（長篠編 三戦目 tobinosu）の画面に出る字（任務・副任務・ピン・組の名・札・選び・物語・数の入る字）。
//   英語の時だけ b_tobinosu.js から読む（日本語の時は読まない・重さ0）。rt.say の台詞は字幕を出さないので入れない。クラウド46 11/21。
const MOR = { 意気盛ん: 'high spirits', 平常: 'steady', 動揺: 'shaken', 崩れかけ: 'breaking' };
const mo = (w) => MOR[w] || w;
const FORT = { 姥ヶ懐: 'Ubagafutokoro', 君ヶ伏床: 'Kimigafushido', 中山: 'Nakayama', 久間山: 'Kumayama', 鳶ヶ巣山: 'Tobinosu' };
const fo = (n) => FORT[n] || n;
// 砦の名の形は五つの砦だけに当てる（『(.+)の木戸』のままだと PAT は全戦で一つなので、ほかの戦の『〇〇の木戸』『〇〇（3/5）』を先に取って日本語まじりにしていた。クラウド 鳶ヶ巣の持ち主 11/21）
const FN = '(姥ヶ懐|君ヶ伏床|中山|久間山|鳶ヶ巣山)', R = (src) => new RegExp(src.replace('@', FN));
const MW = '(意気盛ん|平常|動揺|崩れかけ)';
export default [
  // 砦・人・組
  ['姥ヶ懐', 'Ubagafutokoro'], ['君ヶ伏床', 'Kimigafushido'], ['中山', 'Nakayama'], ['久間山', 'Kumayama'], ['鳶ヶ巣山', 'Mt. Tobinosu'], ['砦の柵', 'Fort palisade'],
  ['鳶ヶ巣山砦夜襲', 'Night Raid on Tobinosu'], ['三河国 鳶ヶ巣山', 'Mt. Tobinosu, Mikawa'], ['天正三年（1575）五月二十一日 夜明け', 'May 21, 1575, dawn'],
  ['別の手が攻め落とした', 'Another unit took it'], ['尾根の砦', 'Ridge forts'], ['鳶ヶ巣山砦　陥落', 'Tobinosu Fort falls'], ['武田信実', 'Takeda Nobuzane'],
  ['河窪信実', 'Kawakubo Nobuzane'], ['酒井忠次', 'Sakai Tadatsugu'], ['奥平信昌', 'Okudaira Nobumasa'],
  ['使番', 'Messenger'], ['見張り', 'Sentry'], ['武田の見張り', 'Takeda sentries'], ['先手の槍組', 'Vanguard spear unit'], ['酒井隊', 'Sakai unit'],
  ['織田の鉄砲衆', 'Oda gunners'], ['二の槍組', 'Second spear unit'], ['三の槍組', 'Third spear unit'], ['別の手', 'Another unit'],
  ['酒井の供回り', 'Sakai retinue'], ['酒井の手の後続', 'Sakai reinforcements'], ['酒井の手の後続が加わった', 'Sakai reinforcements joined'],
  ['後続の槍組', 'Spear unit following'], ['砦の木戸', 'Fort gate'], ['足軽', 'Ashigaru'], ['遠くの備', 'Distant unit'],
  ['武田の騎馬の後詰', 'Takeda cavalry reserve'], ['武田の騎馬', 'Takeda cavalry'],
  ['長篠城の城兵', 'Nagashino garrison'], ['長篠城の城兵（奥平）', 'Nagashino garrison (Okudaira)'], ['谷の陣の留守の兵', 'Rear guard of the valley camp'],
  ['砦を取り返しに来た武田勢', 'Takeda troops retaking the fort'], ['沢を上がる武田勢', 'Takeda troops climbing the ravine'], ['退き遅れた武田勢', 'Stragglers of the Takeda'],
  ['有海村の武田勢', 'Takeda troops at Aomi Village'], ['谷の騎馬', 'Valley cavalry'], ['谷の西の騎馬', 'Cavalry west of the valley'], ['横槍', 'Flank spears'],
  ['酒井忠次の別働隊', 'Sakai Tadatsugu’s detachment'], ['武田軍（砦の守兵）', 'Takeda army (fort garrison)'],
  // 任務・副任務
  ['すぐ先の寄せ場へ、声を立てずに寄れ', 'Move quietly to the staging point just ahead'], ['見張りに見つからずに寄せよ', 'Approach without being seen by the sentries'],
  ['先手の一手を預かり、尾根の砦を落とせ', 'Lead the vanguard unit and take the ridge forts'], ['尾根の砦を落とせ', 'Take the ridge forts'],
  ['落とした砦の櫓に火をかけよ（0/3）', 'Set fire to the towers of the forts you take (0/3)'],
  ['鳶ヶ巣山砦の河窪信実を討て', 'Kill Kawakubo Nobuzane at Tobinosu Fort'], ['河窪信実を討つ', 'Kill Kawakubo Nobuzane'],
  ['打って出た長篠城の城兵と合流せよ', 'Join the Nagashino garrison that has sortied'],
  ['預かった一手を尾根の下に並べ、寄せる武田勢を防げ', 'Line up your unit below the ridge and hold off the Takeda attack'], ['尾根の下で、寄せる武田勢を防げ', 'Hold off the Takeda attack below the ridge'],
  ['預かった一手で有海村の武田の陣を崩せ', 'Break the Takeda camp at Aomi Village with your unit'], ['有海村の武田の陣を崩せ', 'Break the Takeda camp at Aomi Village'],
  ['預かった一手で谷の渡し場を守り、長篠城の城兵を迎えよ', 'Guard the valley ford with your unit and welcome the Nagashino garrison'], ['谷の渡し場を守り、長篠城の城兵を迎えよ', 'Guard the valley ford and welcome the Nagashino garrison'],
  ['副任務：見つからずに寄せた', 'Side mission: approached unseen'], ['副任務：砦の櫓を焼いた', 'Side mission: burned a fort tower'],
  ['寄せ場まで進む', 'Advance to the staging point'], ['合図まで待つ', 'Wait for the signal'],
  // ピン・札
  ['寄せ場', 'Staging point'], ['夜討ち、露見', 'The night raid is discovered'], ['法螺の合図', 'Conch signal'], ['夜が白む。一斉に砦へかかる', 'Dawn breaks. All units hit the fort together'],
  ['一斉射', 'Volley'], ['鉄砲衆が、寝込みの砦へ揃えて放つ', 'The gunners fire together into the sleeping fort'],
  ['控え場（矢の届かぬ所）', 'Reserve ground (out of arrow range)'], ['尾根の下', 'Below the ridge'], ['有海村', 'Aomi Village'], ['谷の渡し', 'Valley ford'],
  ['櫓に火をかける', 'Set the tower on fire'], ['櫓（火をかける）', 'Tower (set fire)'], ['砦の櫓を焼いた', 'Burned a fort tower'],
  ['谷の向こうから、砦の後詰が駆け上がる', 'A relief force charges up from across the valley'],
  ['武田の騎馬が谷から駆け上がる。どう受ける？', 'Takeda cavalry charge up from the valley. How will you meet them?'],
  ['砦の柵を背に、槍を立てて受ける', 'Brace with spears against the palisade'], ['堅い。騎馬の勢いを殺せる。手柄は並', 'Solid. Blunts the charge. Average merit'],
  ['騎馬の横へ回り込んで突く', 'Go around and strike the cavalry flank'], ['崩せば大手柄。踏まれやすい', 'Great merit if it breaks them. Easy to be trampled'],
  ['谷の有海村に、武田の陣が残る。どうする？', 'A Takeda camp remains at Aomi Village. What will you do?'],
  ['尾根の下で構え、寄せる武田勢を待ち受ける', 'Hold below the ridge and wait for the Takeda'], ['尾根を背に受ける。手柄は並', 'Back to the ridge. Average merit'],
  ['谷へ攻め下り、有海村の陣を焼く', 'Attack down into the valley and burn the Aomi camp'], ['大手柄。陣の兵が大勢で向かってくる', 'Great merit. Many camp troops will come at you'],
  // 出来事・結果
  ['見つからずに寄せた', 'Approached unseen'], ['見張りに斬りかかった', 'Attacked a sentry'], ['見張りに気づかれた', 'A sentry noticed you'], ['砦の番兵に気づかれた', 'The fort guards noticed you'],
  ['見張りが近い！　赤い輪に入るな', 'A sentry is close! Stay out of the red ring'], ['組が揃っていない', 'The unit is not assembled'], ['法螺の合図まで仕掛けるな', 'Do not attack before the conch signal'],
  ['まもなく夜が明ける', 'Dawn is coming'], ['後続の列を待っている', 'Waiting for the rear column'], ['合図の前に仕掛けた', 'Attacked before the signal'], ['合図の前に突撃を命じた', 'Ordered a charge before the signal'],
  ['武田の騎馬の横を突いて崩した', 'Broke the Takeda cavalry with a flank strike'], ['武田の騎馬の横を突いた', 'Struck the Takeda cavalry flank'],
  ['武田の騎馬を槍で受け止めた', 'Stopped the Takeda cavalry with spears'], ['武田の騎馬を受け止めた', 'Stopped the Takeda cavalry'],
  ['砦を落とした。息を整え、傷を縛った', 'The fort has fallen. You catch your breath and bind your wounds'],
  ['鳶ヶ巣山、落ちる', 'Tobinosu falls'], ['河窪信実、討死', 'Kawakubo Nobuzane killed'], ['河窪信実を討った', 'Killed Kawakubo Nobuzane'], ['鳶ヶ巣山砦を落とした', 'Took Tobinosu Fort'],
  ['長篠城の城兵、打って出る', 'The Nagashino garrison sorties'], ['奥平の旗が北の谷を渡ってくる', 'The Okudaira banners cross the north valley'],
  ['長篠城の囲みを解いた', 'Lifted the siege of Nagashino'], ['長篠城の囲み、解ける', 'The siege of Nagashino is lifted'], ['鳶ヶ巣山の戦、終わる', 'The battle of Tobinosu ends'],
  ['鳶ヶ巣山の北の口で、組を寄せ直す（手傷を縛った）', 'Regroup at the north entrance of Tobinosu (wounds bound)'],
  ['鳶ヶ巣山は落ちた。……じゃが見よ、谷の有海村に、長篠城を囲んでいた武田の陣が残っておる', 'Tobinosu has fallen... but look, the Takeda camp that besieged Nagashino still stands in the valley at Aomi'],
  ['砦を取り返しに、こちらへ向かってくる……！', 'They are coming to retake the fort...!'], ['砦を取り返しに、武田勢が谷から上がってくる', 'The Takeda come up from the valley to retake the fort'],
  ['来た！　谷から、どっと上がってくる！', 'Here they come! A rush up from the valley!'], ['東の沢からも来る！', 'They come from the east ravine too!'],
  ['尾根の下で武田勢を防いだ', 'Held off the Takeda below the ridge'], ['押し込まれたか……砦の柵まで下がれ！', 'Pushed back... fall back to the fort palisade!'],
  ['長篠城を囲んでいた武田の陣。陣の兵が向き直る', 'The Takeda camp that besieged Nagashino. Its troops turn to face you'],
  ['陣幕の前の槍を崩せば、陣は総崩れじゃ。鉄砲衆、先に放て！', 'Break the spears before the camp curtain and the camp collapses. Gunners, fire first!'],
  ['谷の西から、武田の騎馬', 'Takeda cavalry from the west of the valley'], ['西から騎馬じゃ！', 'Cavalry from the west!'], ['有海村の武田の陣を崩した', 'Broke the Takeda camp at Aomi Village'],
  ['長篠城の城兵が川を渡ってくる。渡し場を守る', 'The Nagashino garrison is crossing the river. Guard the ford'],
  ['長篠城の城兵が打って出るぞ！　渡し場を守れ。城兵が渡りきるまで、武田を寄せるな', 'The garrison is sortieing! Guard the ford. Keep the Takeda off until they are across'],
  ['退き遅れた武田勢が、渡しへ寄せてくる！', 'Takeda stragglers are closing on the ford!'], ['騎馬じゃ！　渡しの前で槍を立てよ！', 'Cavalry! Set your spears before the ford!'], ['谷の渡し場を守った', 'Guarded the valley ford'],
  ['静まれ！　声を立てるな、合図を待て！', 'Quiet! Not a sound, wait for the signal!'], ['待て！　まだじゃ、法螺を待て！', 'Wait! Not yet, wait for the conch!'],
  ['声を立てるな。旗の印の方へ、このまま静かに', 'No noise. Toward the banner mark, quietly as you are'], ['もう少しじゃ。窪みで皆が揃うのを待て', 'Almost there. Wait in the hollow for everyone to gather'],
  ['寄せ場は尾根の下の窪み。篝火には寄らず、山の背を下りなされ', 'The staging point is a hollow below the ridge. Avoid the campfires and go down along the back of the mountain'],
  ['天正三年五月二十日の軍議で、酒井忠次は長篠城を囲む鳶ヶ巣山の砦を背から突く策を進言した。信長はその場では退けたが、あとで忠次を呼んでこれを許し、自らの鉄砲衆を付けて送り出したと伝わる。別働隊はおよそ四千、夜のうちに山を越え、夜明けとともに砦を次々に落とした。守将の河窪信実（信玄の弟）は討ち死にし、長篠城の囲みは解けた。背を断たれた武田勢は、設楽原で前へ出ることになる。',
    'At the war council of May 20, 1575, Sakai Tadatsugu proposed striking the forts of Mt. Tobinosu, which ringed Nagashino Castle, from behind. Nobunaga is said to have rejected it on the spot, then called Tadatsugu back, approved it, and sent him off with some of his own gunners. The detachment, about four thousand strong, crossed the mountain in the night and took the forts one after another at dawn. The commander, Kawakubo Nobuzane (a younger brother of Shingen), was killed, and the siege of Nagashino was lifted. With their rear cut, the Takeda would have to advance at Shitaragahara.'],
  // 日時・数・形の入る字
  // 始まりの幕：日付は全角の空白で二つの字に割れる・両軍の名と人数（hud_opening.js）
  ['天正三年五月二十一日', 'May 21, 1575'], ['夏・夜明け前', 'Summer, before dawn'], ['夏・夜明け', 'Summer, dawn'], ['夏・朝', 'Summer, morning'],
  [/^(酒井忠次の別働隊|武田軍（砦の守兵）)　([\d,]+)人$/, (m) => `${m[1] === '酒井忠次の別働隊' ? 'Sakai Tadatsugu’s detachment' : 'Takeda army (fort garrison)'}  ${m[2]}`],
  [/^天正三年五月二十一日　夏・(夜明け前|夜明け|朝)$/, (m) => `May 21, 1575 — summer, ${{ 夜明け前: 'before dawn', 夜明け: 'dawn', 朝: 'morning' }[m[1]]}`],
  [R('^@の木戸$'), (m) => `${fo(m[1])} gate`], [R('^@の守兵$'), (m) => `${fo(m[1])} garrison`], [R('^@の柵、まだ破れませぬ！$'), (m) => `The ${fo(m[1])} palisade still holds!`],
  [R('^@砦・' + MW + '$'), (m) => `${fo(m[1])} Fort — ${mo(m[2])}`], [R('^@の木戸（味方が破る）$'), (m) => `${fo(m[1])} gate (allies break it)`], [R('^@の虎口$'), (m) => `${fo(m[1])} gate passage`],
  [R('^いま：@砦$'), (m) => `Now: ${fo(m[1])} Fort`], [new RegExp('^武田の騎馬・' + MW + '$'), (m) => `Takeda cavalry — ${mo(m[1])}`],
  [R('^@砦、落ちたり$'), (m) => `${fo(m[1])} Fort has fallen`], [/^残る砦 (\d+)$/, (m) => `Forts left ${m[1]}`],
  [/^(尾根の砦を落とせ|先手の一手を預かり、尾根の砦を落とせ)（(\d+)\/5）$/, (m) => `${m[1] === '尾根の砦を落とせ' ? 'Take the ridge forts' : 'Lead the vanguard unit and take the ridge forts'} (${m[2]}/5)`],
  [/^落とした砦の櫓に火をかけよ（(\d+)\/3）$/, (m) => `Set fire to the towers of the forts you take (${m[1]}/3)`],
  [R('^@の櫓に、味方が火をかけた$'), (m) => `Allies set fire to the ${fo(m[1])} tower`], [R('^@の櫓に火をかけた$'), (m) => `Set fire to the ${fo(m[1])} tower`],
  [R('^鉄砲衆、@の塀へ放て！　崩れた所へ槍を入れよ$'), (m) => `Gunners, fire at the ${fo(m[1])} wall! Send spears into the breach`],
  [R('^@の木戸を打ち破った！　押し込め！$'), (m) => `Broke the ${fo(m[1])} gate! Push in!`],
];
