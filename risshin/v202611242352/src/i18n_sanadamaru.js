// K516 英語版：真田丸の戦い（前田編 sanadamaru・徳川編 k11_sanadamaru）の画面に出る字（任務の一行・ピンの名・武将と組の名・結果の札）。
//   英語の時だけ b_osaka.js から読む（日本語の時は読まない・重さ0）。台詞は戦では字幕を出さないので入れない。
//   名は人の名をローマ字で、組は短い英語で。クラウド kaito2 11/21。
export default [
  // 戦の名・結果
  ['真田丸の戦い', 'Battle of the Sanada-maru'],
  ['真田丸 攻略失敗・徳川軍 撤収', 'Sanada-maru holds. The Tokugawa army pulls back'],
  ['味方部隊撤収', 'Pull back our troops'],
  ['真田丸の前で殿を務めた', 'Guarded the retreat at the Sanada-maru'],
  // 任務（右上の一行）
  ['篠山の頂まで登れ', 'Climb to the top of Sasayama'],
  ['竹束で寄せ、正面の柵を引き倒せ', 'Advance behind bamboo shields. Pull down the front fence'],
  // 任務の札は「、」で行を折るので、折った前後も引けるように
  ['竹束で寄せ、', 'Advance behind bamboo shields,'], ['正面の柵を引き倒せ', 'pull down the front fence'],
  ['真田丸の西へ回り込め', 'Go around to the west of the Sanada-maru'],
  ['真田丸の柵前で前線を整理せよ', 'Sort out the front line at the fence'],
  ['真田丸を突破せよ', 'Break through the Sanada-maru'],
  ['篠山の北の麓へ味方を退かせろ', 'Pull our troops back to the north foot of Sasayama'],
  ['味方を竹束の陣へ退かせろ', 'Pull our troops back to the bamboo shield camp'],
  ['篠山の北の麓で組を立て直せ', 'Regroup your squad at the north foot of Sasayama'],
  ['真田丸の正面へ。竹束の陰に入って柵へ寄れ', 'To the front of the Sanada-maru. Stay behind the bamboo shields and reach the fence'],
  ['篠山の北の麓まで退け', 'Fall back to the north foot of Sasayama'], ['竹束の陣まで退け', 'Fall back to the bamboo shield camp'],
  ['西の脇の窪地まで退け', 'Fall back to the hollow on the west side'],
  ['寄せの下知まで待つ', 'Wait for the order to attack'],
  ['慶長十九年（1614）十二月四日　冬・夜明けの靄', 'December 1614. Winter, morning mist'],
  ['慶長十九年（1614）十二月四日　冬・朝', 'December 1614. Winter morning'],
  ['竹束の陰に入って柵へ寄れ', 'Stay behind the bamboo shields and reach the fence'],
  ['横の鉄砲衆を抑えよ', 'Stop the gunners on the flank'],
  ['西の柵の前まで寄せよ', 'Advance to the west fence'],
  ['西の柵を打ち倒せ', 'Knock down the west fence'],
  ['柵を引き倒せ', 'Pull down the fence'],
  ['倒した柵の前で踏みとどまれ', 'Hold at the broken fence'],
  ['押し返してくる真田の槍を受けよ', 'Take the Sanada spears pushing back'],
  ['持ちこたえろ', 'Hold on'],
  // 所の名（ピン）
  ['篠山', 'Sasayama'], ['篠山の北の麓', 'North foot of Sasayama'],
  ['竹束の陣', 'Bamboo shield camp'], ['西の脇', 'West side'], ['西の脇の窪地', 'Hollow on the west side'],
  ['真田丸の正面', 'Front of the Sanada-maru'], ['真田丸の柵', 'Sanada-maru fence'],
  ['真田丸の正面の柵', 'Front fence'], ['真田丸の西の柵', 'West fence'],
  ['篠山の頂', 'Top of Sasayama'], ['竹束の陰', 'Behind the bamboo shields'], ['真田丸の西', 'West of the Sanada-maru'],
  ['篠山の北の麓で組', 'Regroup at the north foot of Sasayama'],
  ['詰まった味方', 'Jammed allies'], ['柵', 'Fence'], ['塀', 'Wall'], ['櫓', 'Tower'],
  // 数を含む字（任務の札の進み）
  [/^味方の寄せを待つ あと(\d+)秒$/, (m) => `Wait for allies: ${m[1]}s`],
  [/^柵 残り(\d+)%$/, (m) => `Fence ${m[1]}% left`],
  [/^後続の撤収 あと(\d+)秒$/, (m) => `Rear troops pulling back: ${m[1]}s`],
  [/^あと (\d+)m$/, (m) => `${m[1]}m to go`],
  [/^残り (\d+)人$/, (m) => `${m[1]} left`],
  [/^整理した組 (\d+)\/(\d+)$/, (m) => `Squads sorted ${m[1]}/${m[2]}`],
  ['あと少し……', 'Almost there...'], ['真田丸の柵前へ進め', 'Advance to the fence of the Sanada-maru'],
  // 武将
  ['真田信繁', 'Sanada Nobushige'], ['真田大助', 'Sanada Daisuke'], ['伊木遠雄', 'Iki Tooyasu'],
  ['山崎長徳', 'Yamazaki Nagatoku'], ['前田利光', 'Maeda Toshimitsu'], ['本多政重', 'Honda Masashige'],
  // 組
  ['徳川方', 'Tokugawa side'], ['豊臣方 真田丸', 'Toyotomi side: Sanada-maru'],
  ['真田信繁の旗本', 'Sanada Nobushige\'s guard'], ['真田大助の隊', 'Sanada Daisuke\'s unit'], ['伊木遠雄の隊', 'Iki Tooyasu\'s unit'],
  ['山崎長徳の組', 'Yamazaki\'s squad'], ['本多政重の二の手', 'Honda\'s second line'],
  ['前田の手の新手', 'Fresh Maeda troops'], ['前田の新手', 'Fresh Maeda troops'], ['竹束の陣の前田の備', 'Maeda troops at the camp'],
  ['柵を破る組', 'Fence breakers'],
  ['丸の内から出た真田の槍', 'Sanada spears from the fort'], ['丸の内の真田の予備', 'Sanada reserve in the fort'],
  ['二の構えの鉄砲衆', 'Second-line gunners'], ['塀の内の鉄砲', 'Guns behind the wall'], ['小櫓の鉄砲', 'Guns in the small tower'],
  ['横の鉄砲衆', 'Flank gunners'], ['東の口の真田の兵', 'Sanada troops at the east gate'], ['西の口の真田の予備', 'Sanada reserve at the west gate'],
  ['西の土塁の槍の守り', 'Spears on the west rampart'], ['西の土塁の鉄砲衆', 'Gunners on the west rampart'],
  ['真田の新手', 'Fresh Sanada troops'], ['真田の槍の二番手', 'Second Sanada spears'],
  ['篠山の真田の殿', 'Sanada rear guard on Sasayama'], ['篠山の真田の鉄砲', 'Sanada guns on Sasayama'],
  ['追い討ちの真田の槍', 'Pursuing Sanada spears'], ['追い討ちの真田の鉄砲', 'Pursuing Sanada guns'],
  // 行き先の▼の札の名（goal_sign が任務の一行から切り出す名。en_left_probe 11/21 で残っていた）
  ['西の柵の前', 'West fence'], ['真田丸の柵前で前線', 'Front line at the fence'], ['味方', 'Our troops'],
];
