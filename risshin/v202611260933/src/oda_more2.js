// K674（11/26 Sanae・一戦10任務）：織田家編の後半（設楽原〜本能寺）に、勝った後の史実の続きの段を足す。oda_more.js と同じ仕組み（tokugawa_more.js の moreSteps）。
//   字は任務の一行と台詞だけ。表の字は「日本語|English」。fight = [題, 副題, 任務, 敵の名, [誰, 台詞], [遅れて来る誰, 台詞, 敵の名], 兵の数[侍,足軽,鉄砲,弓], 向き]
import { MORE as M0 } from './tokugawa_more.js';
import { moreSteps, S, A, G, B } from './tokugawa_more.js';
const sp = (s) => s.split('|');
function mkSpec(faction, items) {
  const rows = [], en = [];
  const add = (s) => { const [j, e] = sp(s); en.push([j, e]); return j; };
  for (const it of items) {
    if (it.r) { rows.push({ rest: [[it.r[0], add(it.r[1])]] }); continue; }
    const [t, s, o, foe, say, lat, n, dir] = it.f;
    const mkL = (k) => [S(k[0] || 0), A(k[1] || 0), G(k[2] || 0), B(k[3] || 0)].filter((q) => q.n > 0);
    rows.push({ fight: { title: add(t), sub: add(s), obj: add(o), say: [[say[0], add(say[1])]],
      foes: [{ name: add(foe), list: mkL(n), ...(dir ? { dir } : {}) }],
      later: [{ t: 30, say: [lat[0], add(lat[1])], foes: [{ name: add(lat[2]), list: mkL([0, Math.max(6, n[1] - 2), 0, 0]), dir: (dir || 0) + 0.7 }] }] } });
  }
  return { faction, flag: faction, rows, en };
}
const MORE2 = {
  // 設楽原（1575/5/21）：武田の総崩れの後、内藤・土屋・馬場の備が勝頼の退きを支え、鳶ヶ巣山の陣も落ちた
  shitaragahara: mkSpec('takeda', [
    { r: ['織田信忠', '武田が崩れた。だが川筋で、まだ踏み止まる備があるぞ|The Takeda line has broken. But some units still hold along the river.'] },
    { f: ['川筋の殿|River rearguard', '内藤昌豊の備が勝頼を逃がす|Naito Masatoyo\'s unit covers Katsuyori\'s escape', '川筋で踏み止まる内藤昌豊の備を討て|Cut down Naito Masatoyo\'s unit holding the riverside',
      '内藤の備|Naito unit', ['内藤昌豊', '御屋形をお逃がしする。ここは通さぬ！|We see the lord away. You do not pass here!'], ['織田の侍', '横の田からも来る！|More from the paddies on the flank!', '田の内藤勢|Naito men in the paddies'], [2, 10, 3, 0]] },
    { f: ['丸山の殿|Maruyama rearguard', '土屋昌続の組が丸山に残る|Tsuchiya Masatsugu\'s men remain on Maruyama', '丸山に残る土屋昌続の組を討て|Cut down Tsuchiya Masatsugu\'s men left on Maruyama',
      '土屋の組|Tsuchiya squad', ['土屋昌続', '信玄公の御恩を返すはこの時ぞ！|Now is the time to repay the late lord\'s favor!'], ['織田の侍', '鉄砲を撃ち掛けて来た！|They are firing on us!', '丸山の鉄砲組|Maruyama gunners'], [2, 8, 4, 0], 0.5] },
    { f: ['鳶ヶ巣山の落人|Tobigasuyama fugitives', '長篠城を囲んだ武田の砦が崩れる|The Takeda forts around Nagashino fall', '鳶ヶ巣山から落ちる武田方を止めよ|Stop the Takeda men fleeing Tobigasuyama',
      '砦の落人|Fort fugitives', ['河窪信実の郎党', '砦は落ちた。せめて道を開け！|The fort has fallen. At least clear a way!'], ['足軽', '後ろから追って来る！|They are chasing from behind!', '砦の殿|Fort rearguard'], [1, 10, 2, 0], -0.5] },
    { f: ['信濃街道の追い|Pursuit on the Shinano road', '馬場の殿を破った後の追い討ち|Pursuit after breaking the Baba rearguard', '信濃街道を退く武田の殿を追い散らせ|Scatter the Takeda rearguard retreating along the Shinano road',
      '街道の殿|Road rearguard', ['武田の侍', '一人でも多く国へ帰せ！|Get as many home as we can!'], ['織田の侍', '馬が出た。槍を揃えよ！|Horsemen! Level your spears!', '街道の馬武者|Mounted men on the road'], [3, 10, 0, 0], 0.2] },
  ]),
  // 木ノ芽峠（1575/8）：観音丸を落とした後、一揆勢は峠の奥の道と鉢伏の方に逃れ、府中へ向かう道で抗った
  echizen: mkSpec('ikko', [
    { r: ['明智光秀', '木戸は破れた。だが峠の奥へ、一揆勢が逃げ込むぞ|The gate is broken. But the ikki are fleeing deeper into the pass.'] },
    { f: ['峠の奥の道|Road beyond the pass', '観音丸から落ちる一揆勢|Ikki fleeing from Kannonmaru', '峠の奥の道を塞ぐ一揆勢を討て|Cut down the ikki blocking the road beyond the pass',
      '峠の一揆勢|Pass ikki', ['一揆の僧', '南無阿弥陀仏。ここで踏み止まれ！|Namu Amida Butsu. Stand firm here!'], ['織田の侍', '木の間からも来る！|More from between the trees!', '木の間の一揆勢|Ikki in the trees'], [1, 10, 2, 0]] },
    { f: ['鉢伏の落人|Hachibuse fugitives', '鉢伏の山道へ逃れる門徒|Followers flee up the Hachibuse trail', '鉢伏の山道へ逃れる一揆の殿を討て|Cut down the ikki rearguard fleeing up the Hachibuse trail',
      '山道の殿|Trail rearguard', ['一揆の侍', '山へ入れば追手は来れぬ。ここを守れ！|Once in the mountains they cannot follow. Hold here!'], ['足軽', '岩の上から落として来る！|They are dropping rocks from above!', '岩の上の一揆|Ikki on the rocks'], [0, 10, 3, 0], -0.5] },
    { f: ['府中への道|The road to Fuchu', '府中へ向かう追い討ち|Pursuit toward Fuchu', '府中へ退く一揆勢の後ろを追い散らせ|Scatter the ikki rear falling back toward Fuchu',
      '府中の一揆勢|Fuchu ikki', ['一揆の侍', '府中の町を盾にせよ！|Use the town of Fuchu as a shield!'], ['織田の侍', '右の畦から鉄砲じゃ！|Guns from the right-hand banks!', '畦の鉄砲組|Bank gunners'], [2, 10, 4, 0], 0.3] },
  ]),
  // 大滝寺（伝承）：山狩りの後、残党は谷の奥と滝の近くに逃れた
  echizen_ikko: mkSpec('ikko', [
    { r: ['織田の侍', '本堂は押さえた。だが谷筋の奥にまだ残党が潜む|The main hall is ours. But holdouts still lurk deeper in the valley.'] },
    { f: ['谷奥の残党|Valley holdouts', '谷の奥に逃れた一揆|Ikki who fled deep into the valley', '谷の奥に潜む一揆の残党を討て|Cut down the ikki holdouts hiding deep in the valley',
      '谷奥の一揆|Valley ikki', ['一揆の者', '仏の道じゃ。降りはせぬ！|It is the Buddha\'s way. We will not give up!'], ['足軽', '岩陰から出た！|They came out from behind the rocks!', '岩陰の一揆|Ikki behind rocks'], [0, 10, 0, 3]] },
    { f: ['滝の前の殿|Rearguard by the falls', '滝へ向かう道の残党|Holdouts on the road to the falls', '滝の前で踏み止まる一揆の殿を討て|Cut down the ikki rearguard standing before the falls',
      '滝の前の一揆|Falls ikki', ['一揆の僧', '滝の上は聖地。ここは通さぬ！|The falls are holy ground. You do not pass!'], ['織田の侍', '水際から回り込んで来る！|They are circling along the water!', '水際の一揆|Shoreline ikki'], [1, 9, 0, 0], 0.6] },
    { f: ['山道の逃げ手|Fugitives on the mountain path', '山を越えて逃げる者|Those fleeing over the mountain', '山道を逃げる一揆の首魁の組を追い止めよ|Catch up with the ikki leaders\' group fleeing by the mountain path',
      '山道の首魁組|Leaders\' group', ['一揆の侍', '山を越えれば加賀じゃ。走れ！|Over the mountain is Kaga. Run!'], ['足軽', '弓が来るぞ！|Arrows incoming!', '山道の弓衆|Trail archers'], [1, 8, 0, 4], -0.4] },
  ]),
  // 岩村城（1575/11）：開城の後、武田の残兵は山道を退き、秋山の郎党が城の麓で抗った
  iwamura: mkSpec('takeda', [
    { r: ['織田信忠', '城は開いた。だが麓の道に、退かぬ武田の兵がおる|The castle is open. But Takeda men still refuse to leave the road below.'] },
    { f: ['麓の殿|Rearguard at the foot', '秋山の郎党が城下の道で抗う|Akiyama\'s retainers resist on the road below', '城下の道で抗う秋山の郎党を討て|Cut down Akiyama\'s retainers resisting on the town road',
      '秋山の郎党|Akiyama retainers', ['秋山の郎党', '殿の御首は渡さぬ！|You will not take our lord\'s head!'], ['織田の侍', '塀の陰から来る！|They come from behind the wall!', '塀の武田勢|Takeda men at the wall'], [2, 9, 3, 0]] },
    { f: ['山道の追い|Pursuit on the mountain road', '信濃へ退く武田の残兵|Takeda stragglers retreating to Shinano', '山道を信濃へ退く武田の残兵を追い散らせ|Scatter the Takeda stragglers retreating to Shinano by the mountain road',
      '山道の残兵|Road stragglers', ['武田の侍', '信濃へ戻れ。後ろは構うな！|Back to Shinano. Ignore what is behind!'], ['足軽', '先に伏せておるぞ！|They are lying in wait ahead!', '山道の伏兵|Trail ambushers'], [1, 10, 2, 0], 0.4] },
  ]),
  // 雑賀（1577/2）：退いた後、雑賀の鉄砲衆は川の東岸と社家の方から追って、織田の殿を悩ませた
  saika: mkSpec('saika', [
    { r: ['佐久間信盛', '雑賀は鉄砲を撃ち掛けて追うて来る。退く殿を守れ|The Saika are chasing with gunfire. Cover the retreating rear.'] },
    { f: ['川べりの追い|Riverside pursuit', '雑賀の鉄砲が岸から追う|Saika guns follow along the bank', '岸から撃つ雑賀の鉄砲組を討て|Cut down the Saika gunners firing from the bank',
      '岸の鉄砲組|Bank gunners', ['雑賀の者', '織田を川に追い落とせ！|Drive the Oda into the river!'], ['織田の侍', '右の竹藪から来る！|They come from the bamboo thicket!', '藪の雑賀衆|Saika in the thicket'], [0, 6, 8, 0]] },
    { f: ['社家の辻|The shrine crossroads', '社家の者が辻で道を塞ぐ|Shrine retainers block the crossroads', '辻で道を塞ぐ雑賀の社家衆を押し返せ|Push back the Saika shrine men blocking the crossroads',
      '社家衆|Shrine men', ['雑賀の者', '土地を踏み荒らすな。ここは我らの国じゃ！|Do not trample our land. This is our country!'], ['足軽', '槍が来た！|Spears!', '社家の槍組|Shrine spearmen'], [2, 9, 3, 0], 0.5] },
    { f: ['東岸の最後の寄せ|Last charge on the east bank', '退き太鼓の後も追う雑賀|The Saika pursue even after the drums', '東岸まで追って来る雑賀の最後の組を止めよ|Stop the last Saika squad pursuing to the east bank',
      '東岸の雑賀組|East bank Saika', ['雑賀の者', '一人も帰すな！|Do not let one return!'], ['織田の侍', '鉄砲を伏せよ。狙われる！|Get down. We are targeted!', '堤の鉄砲組|Embankment gunners'], [1, 6, 8, 0], -0.4] },
  ]),
  // 手取川（1577/9）：渡河を守った後、上杉の追手は川の北から続き、織田勢は加賀の方から抜けて退いた
  tedorigawa: mkSpec('uesugi', [
    { r: ['柴田勝家', '謙信の追手はまだ来る。河原で時を稼げ|Kenshin\'s pursuers keep coming. Buy time on the riverbed.'] },
    { f: ['河原の追手|Riverbed pursuit', '浅瀬を越えた上杉の先手|The Uesugi vanguard across the shallows', '浅瀬を越えて来る上杉の先手を河原で止めよ|Stop the Uesugi vanguard that crossed the shallows on the riverbed',
      '上杉の先手|Uesugi vanguard', ['上杉の侍', '毘沙門天の御加護ぞ。押せ！|Bishamonten protects us. Push!'], ['織田の侍', '馬が回り込む！|Horsemen are circling!', '上杉の騎馬|Uesugi cavalry'], [3, 10, 0, 0]] },
    { f: ['松の根の殿|Pine-root rearguard', '退く道の松林で追手を迎える|Meeting pursuers in the pines on the retreat road', '松林で追う上杉の鉄砲組を討て|Cut down the Uesugi gunners pursuing in the pines',
      '松林の鉄砲組|Pine grove gunners', ['上杉の侍', '一人も加賀から出すな！|Let none leave Kaga!'], ['足軽', '松の陰から撃つ！|Firing from behind the pines!', '松の陰の組|Pine cover squad'], [1, 8, 5, 0], 0.5] },
    { f: ['湊への退き口|Retreat toward the harbor', '舟を求めて退く織田勢の後ろ|The Oda rear falling back toward boats', '退き口を追う上杉の最後の組を討ち払え|Drive off the last Uesugi squad chasing the retreat',
      '上杉の追手|Uesugi pursuers', ['上杉の侍', '川に追い込め！|Drive them into the river!'], ['織田の侍', '右の岸からも！|From the right bank too!', '岸の上杉勢|Bank Uesugi'], [2, 10, 0, 0], -0.4] },
  ]),
  // 信貴山城（1577/10）：本丸へ攻め入った後、松永勢は天守下の曲輪と北の尾根で抗った
  shigisan: mkSpec('matsunaga', [
    { r: ['松永久秀の郎党', '本丸は燃えて落ちる。だが曲輪にまだ主の家来がおる|The keep burns. But the lord\'s retainers remain in the enclosures.'] },
    { f: ['天守下の曲輪|Enclosure under the keep', '燃える天守の下の守り|Defenders below the burning keep', '天守下の曲輪を守る松永の家来を討て|Cut down Matsunaga retainers guarding the enclosure under the keep',
      '曲輪の家来|Enclosure retainers', ['松永の侍', '殿のお供をする。ここで死ぬのじゃ！|We follow our lord. We die here!'], ['織田の侍', '火の陰から来る！|They come out of the flames!', '火の陰の家来|Retainers in the smoke'], [2, 9, 2, 0]] },
    { f: ['北尾根の道|North ridge path', '北の尾根を落ちる者|Those fleeing by the north ridge', '北尾根の道を落ちる松永勢を止めよ|Stop the Matsunaga men fleeing along the north ridge',
      '尾根の落人|Ridge fugitives', ['松永の侍', '大和へ抜けよ。次の機を待つのじゃ！|Break out to Yamato. Wait for another chance!'], ['足軽', '岩の上から来る！|From the rocks above!', '岩の上の松永勢|Matsunaga on rocks'], [1, 8, 3, 0], -0.5] },
    { f: ['土橋の殿|Earth bridge rearguard', '土橋を守る最後の備|The last unit at the earth bridge', '土橋を守る松永の殿を討ち破れ|Break the Matsunaga rearguard at the earth bridge',
      '土橋の殿|Bridge rearguard', ['松永の侍', '橋を落とすまで、一歩も退くな！|Not one step back until the bridge is down!'], ['織田の侍', '鉄砲が下から！|Guns from below!', '土橋の鉄砲組|Bridge gunners'], [2, 8, 4, 0], 0.4] },
    { f: ['屋敷の内|Inside the residence', '松永屋敷に立てこもる家来|Retainers barricaded in the residence', '松永屋敷に立てこもる家来を討て|Cut down the retainers barricaded in the Matsunaga residence',
      '屋敷の家来|Residence retainers', ['松永の家来', '茶器とともに死ぬ。入れさせるな！|We die with the tea wares. Let none in!'], ['足軽', '縁の下からも出た！|They came from under the veranda!', '縁の下の組|Veranda squad'], [2, 8, 2, 0], 0.7] },
    { f: ['麓への落人|Fugitives toward the foot', '麓の寺へ落ちる者|Those escaping to the temple below', '麓の寺へ落ちる松永勢を追い止めよ|Stop the Matsunaga men fleeing to the temple below',
      '麓の落人|Foot fugitives', ['松永の侍', '寺の門を閉めよ！|Shut the temple gate!'], ['織田の侍', '門の上から弓じゃ！|Arrows from above the gate!', '門の弓衆|Gate archers'], [1, 8, 0, 4], -0.8] },
  ]),
  // 木津川口（1578/11）：大船で敵船を退けた後、毛利の小早が接舷して斬り込み、焼き船が寄せた
  kizugawa: mkSpec('mori', [
    { r: ['九鬼嘉隆', '大将船は退いた。だが小舟が舷に取り付くぞ|The flagship has withdrawn. But small boats are grappling alongside.'] },
    { f: ['舷の斬り込み|Boarding at the rail', '毛利の小早が接舷する|Mori fast boats come alongside', '舷に斬り込む毛利の水夫を討て|Cut down the Mori sailors boarding at the rail',
      '接舷の毛利勢|Boarding Mori men', ['毛利の侍', '大船に乗り移れ。火を掛けよ！|Board the great ship. Set it afire!'], ['織田の侍', '船尾からも上がって来る！|They are climbing up astern too!', '船尾の毛利勢|Stern Mori men'], [1, 10, 2, 0]] },
    { f: ['焼き船の寄せ|Fire boats closing', '燃える小舟が大船へ寄る|Burning boats close on the great ship', '焼き船から上がる毛利の決死の組を討て|Cut down the Mori forlorn squad coming off the fire boats',
      '焼き船の決死組|Fire-boat squad', ['毛利の侍', '焼き討ちは我らの役目。引くな！|Fire is our task. Do not turn back!'], ['足軽', '火矢が来る！|Fire arrows!', '小舟の弓衆|Boat archers'], [1, 8, 0, 4], 0.6] },
  ]),
  // 三木城（1579/9）：大村で勝った後、別所の兵は三木の町の口へ落ち、搦手から出た別の組が荷駄を狙った
  miki: mkSpec('bessho', [
    { r: ['羽柴秀吉', '甚太夫は討たれた。だが城の口に、まだ出て来る者がおる|Jindayu is dead. But more men still sally from the castle gate.'] },
    { f: ['荷駄の護り|Guarding the supply train', '搦手から出た別所勢が荷駄を狙う|Bessho men from the rear gate target the train', '荷駄を狙う別所の組を討て|Cut down the Bessho squad aiming at the supply train',
      '荷駄狙いの別所勢|Bessho raiders', ['別所の侍', '兵糧を奪え。城は飢えておる！|Seize the grain. The castle is starving!'], ['織田の侍', '畦から回り込む！|They circle along the paddy banks!', '畦の別所勢|Bessho on the banks'], [2, 9, 2, 0]] },
    { f: ['町の口の殿|Rearguard at the town gate', '三木の町口へ退く別所勢|Bessho falling back to the town gate', '町の口へ退く別所の殿を追い止めよ|Catch the Bessho rearguard falling back to the town gate',
      '町口の殿|Gate rearguard', ['別所の侍', '城門が閉じるまで持ち堪えよ！|Hold until the gate shuts!'], ['足軽', '塀の上から弓だ！|Arrows from the wall!', '塀の弓衆|Wall archers'], [1, 8, 2, 3], 0.3] },
    { f: ['兵糧の橋|The grain bridge', '橋を渡して兵糧を入れようとする組|A group trying to bring grain across the bridge', '橋を渡って兵糧を運ぶ別所の組を討て|Cut down the Bessho party carrying grain across the bridge',
      '兵糧の運び手|Grain carriers', ['別所の侍', '橋さえ渡れば城は持つ！|If we cross the bridge, the castle lives!'], ['織田の侍', '槍の列が出た！|A spear line!', '橋の槍組|Bridge spearmen'], [1, 10, 0, 0], -0.5] },
    { f: ['夜の討ち入り|Night sally', '日が落ちてから出る別所勢|Bessho sally after dark', '夜に討って出た別所勢を陣の前で押し返せ|Push back the Bessho sally in front of the camp at night',
      '夜討ちの別所勢|Night-raiding Bessho', ['別所の侍', '篝を消せ。闇に紛れて斬れ！|Put out the fires. Strike in the dark!'], ['足軽', '後ろからも来た！|They are coming from behind too!', '後ろの別所勢|Bessho from behind'], [2, 9, 0, 0], 0.9] },
  ]),
  // 鳥取（1581/10）：兵糧攻めの終わりに、飢えた城兵は川岸の柵と城の木戸から打って出た
  tottori: mkSpec('mori', [
    { r: ['羽柴秀吉', '城は飢えておる。必ず最後の一撃を狙うて出るぞ|The castle is starving. They will make one last sally.'] },
    { f: ['柵の前の討ち入り|Sally at the palisade', '飢えた城兵が柵へ寄せる|Starving garrison rushes the palisade', '柵へ寄せる城兵の最後の組を討て|Cut down the garrison\'s last squad rushing the palisade',
      '城兵の決死組|Desperate garrison', ['吉川の侍', '飢えて死ぬより、斬って死ぬ！|Better to die fighting than starve!'], ['織田の侍', '右の木戸からも来る！|More from the right gate!', '木戸の城兵|Gate garrison'], [1, 10, 2, 0]] },
    { f: ['川岸の殿|Riverside rearguard', '千代川の岸で糧を求める者|Those seeking food at the Sendai riverbank', '千代川の岸へ出た城兵の組を追い返せ|Drive back the garrison squad that came out to the riverbank',
      '岸の城兵|Bank garrison', ['吉川の侍', '舟があれば、まだ助かる！|If we find a boat there is hope!'], ['足軽', '弓が来る！|Arrows!', '岸の弓衆|Bank archers'], [1, 8, 0, 4], -0.5] },
  ]),
  // 高遠城（1582/3/2）：城門を破った後、武田の守兵は二の丸の曲輪と本丸の櫓から最後に抗った
  takato: mkSpec('takeda', [
    { r: ['織田信忠', '門は破れた。だが曲輪の奥に、まだ仁科の兵がおる|The gate is broken. But Nishina\'s men remain deep in the enclosures.'] },
    { f: ['二の丸の曲輪|Ninomaru enclosure', '二の丸に踏み止まる城兵|The garrison holding the second enclosure', '二の丸の曲輪に踏み止まる城兵を討て|Cut down the garrison holding the second enclosure',
      '二の丸の城兵|Ninomaru garrison', ['仁科の侍', '五郎様の城ぞ。一歩も退くな！|This is Lord Goro\'s castle. Not one step back!'], ['織田の侍', '櫓から撃つ！|Firing from the tower!', '櫓の鉄砲組|Tower gunners'], [2, 9, 3, 0]] },
    { f: ['女たちの薙刀|Women with naginata', '城の女衆も薙刀を取る|Even the women of the castle take up naginata', '薙刀を取って寄せる城の者を退けよ|Drive back the castle folk charging with naginata',
      '薙刀の城の者|Naginata defenders', ['城の女', '主の御恩を、この手で返す！|We repay our lord with these hands!'], ['足軽', '横から槍だ！|Spears from the side!', '横の槍組|Flank spearmen'], [0, 8, 0, 0], 0.5] },
    { f: ['本丸の櫓|Keep tower', '本丸の櫓に籠もる最後の組|The last squad in the keep tower', '本丸の櫓に籠もる城兵を討て|Cut down the garrison holed up in the keep tower',
      '櫓の城兵|Tower garrison', ['仁科盛信', '腹を切る間を稼げ。通すな！|Buy me time to die with honor. Let none pass!'], ['織田の侍', '火を掛けよ！|Set it afire!', '本丸の旗本|Keep guards'], [3, 8, 2, 0], 0.2] },
    { f: ['裏門の落人|Fugitives at the back gate', '裏の門から落ちる者|Those escaping by the back gate', '裏の門から落ちる武田方を止めよ|Stop the Takeda men escaping through the back gate',
      '裏門の落人|Back gate fugitives', ['武田の侍', '信濃を捨てて、甲斐へ戻れ！|Abandon Shinano. Return to Kai!'], ['足軽', '後ろの組が槍を構えた！|The rear squad has leveled spears!', '裏門の殿|Back gate rearguard'], [1, 8, 0, 0], -0.8] },
  ]),
  // 田野（1582/3/11）：柵を押さえた後、勝頼の近習は屋敷の庭と崖道で最後まで戦った
  tano: mkSpec('takeda', [
    { r: ['滝川一益', '柵は破れた。だが屋敷の庭に、まだ近習が残っておる|The palisade is breached. But retainers remain in the residence garden.'] },
    { f: ['屋敷の庭|The residence garden', '屋敷の庭で踏み止まる近習|Retainers holding the residence garden', '屋敷の庭で踏み止まる近習を討て|Cut down the retainers holding the residence garden',
      '庭の近習|Garden retainers', ['武田の近習', '御屋形の御最期を汚させぬ！|We will not let our lord\'s end be desecrated!'], ['織田の侍', '崖の上から弓だ！|Arrows from the cliff!', '崖の弓衆|Cliff archers'], [3, 8, 0, 3]] },
    { f: ['崖道の殿|Cliff path rearguard', '山へ続く崖の道の殿|The rearguard on the cliff path', '崖道を塞ぐ武田の殿を討ち破れ|Break the Takeda rearguard blocking the cliff path',
      '崖道の殿|Cliff rearguard', ['武田の侍', '道は狭い。一人ずつ斬れ！|The path is narrow. Cut them one by one!'], ['足軽', '上から石が！|Rocks from above!', '崖の上の組|Cliff squad'], [2, 8, 0, 0], 0.4] },
    { f: ['橋の袂|Foot of the bridge', '橋を守る武田の兵|The Takeda men guarding the bridge', '橋の袂を守る武田の兵を討て|Cut down the Takeda men guarding the foot of the bridge',
      '橋の守り|Bridge guards', ['武田の侍', '橋を渡すな！|Do not let them cross!'], ['織田の侍', '川向こうから鉄砲！|Guns from across the river!', '川向こうの鉄砲組|Guns across the river'], [2, 8, 3, 0], -0.5] },
    { f: ['山の逃げ手|Fugitives in the hills', '山へ落ちる者の最後の組|The last group escaping into the hills', '山へ落ちる武田方の最後の組を追い止めよ|Stop the last Takeda group escaping into the hills',
      '山の逃げ手|Hill fugitives', ['武田の侍', '山の奥まで走れ！|Run deep into the mountains!'], ['足軽', '藪から出た！|They came out of the brush!', '藪の武田勢|Takeda in the brush'], [1, 8, 0, 0], 0.8] },
    { f: ['土屋の殿|Tsuchiya rearguard', '最期まで残る土屋の兵|Tsuchiya\'s men who remain to the end', '最後まで残る土屋昌恒の兵を討て|Cut down Tsuchiya Masatsune\'s men who remain to the end',
      '土屋の兵|Tsuchiya men', ['土屋昌恒', '片手千人斬りの手並み、見せようぞ！|I will show the skill of a thousand-man slayer!'], ['織田の侍', '強いぞ。囲め！|He is strong. Surround him!', '土屋の旗本|Tsuchiya guards'], [3, 6, 0, 0], 0.2] },
  ]),
  // 本能寺（1582/6/2）：使者を送った後、二条御所の方では信忠が明智勢と戦った。裏の通りで追手が掛かる
  honnoji: mkSpec('akechi', [
    { r: ['織田の侍', '上様は御殿に入られた。だが西の通りに追手が回った|His lordship has withdrawn into the hall. But pursuers are circling to the west street.'] },
    { f: ['西の通りの追手|Pursuers on the west street', '明智の組が裏の通りへ回る|Akechi squads circle to the back street', '西の通りへ回った明智の追手を討て|Cut down the Akechi pursuers who circled to the west street',
      '通りの明智勢|Street Akechi', ['明智の侍', '一人も二条へ行かせるな！|Let none reach Nijo!'], ['足軽', '塀を越えて来る！|They are coming over the wall!', '塀越しの明智勢|Akechi over the wall'], [2, 10, 4, 0]] },
    { f: ['二条の木戸|The Nijo gate', '二条御所の木戸へ寄る明智勢|Akechi men press the Nijo gate', '二条御所の木戸へ寄る明智の先手を押し返せ|Push back the Akechi vanguard pressing the Nijo gate',
      '木戸の明智勢|Gate Akechi', ['明智の侍', '三七様の御所も落とせ！|Take the young lord\'s residence too!'], ['織田の侍', '鉄砲が来る！|Guns!', '木戸の鉄砲組|Gate gunners'], [2, 10, 4, 0], 0.4] },
  ]),
};
Object.assign(M0, MORE2);
export { MORE2 };
// ready：元の win が「勝った時だけ」呼ばれない戦（途中の確かめを元の win 側でする戦）は、その確かめが通る時だけ続きの段へ入る
// 続きの段の間は、元の戦の update が「もう終わった」状態の持ち物を読んで落ちても、戦を止めない（田野：flowTick が C.at を読む）
const guardUpdate = (def) => {
  const t0 = def.taskDetail;   // 札の補足も、続きの段の間は元の持ち物が無くても落とさない（手取川）
  if (t0) def.taskDetail = function (rt, ...a) { if (rt.flags.k652m !== 'on') return t0.call(this, rt, ...a); try { return t0.call(this, rt, ...a); } catch (e) { return a[1] || ''; } };
  const u0 = def.update; if (!u0) return; def.update = function (rt, dt) { if (rt.flags.k652m !== 'on') return u0.call(this, rt, dt); try { return u0.call(this, rt, dt); } catch (e) { return undefined; } }; };
const capUp = (def, id) => {
  guardUpdate(def); def.pacingCap = (def.pacingCap || 1080) + 100 * MORE2[id].rows.filter((r) => r.fight).length; };   // 足した段の分だけ、共通の十八分の打ち切りを延ばす（battle_pacing.js）
export function odaMore2(def, id, ready) {
  capUp(def, id);
  const w0 = def.win;
  moreSteps(def, MORE2[id]);
  const w1 = def.win;
  if (!ready) return;
  def.win = function (rt, ...a) {
    const k = rt.flags.k652m;
    if (!k && !ready(rt, ...a)) return w0.call(this, rt, ...a);
    return w1.call(this, rt, ...a);
  };
}
// 勝ちを win でなく end(rt, won) で締める戦（三木）：won の時だけ続きの段へ入り、段が尽きたら元の end(rt, true) を呼ぶ
export function odaMoreEnd(def, id, ready) {
  capUp(def, id);
  const e0 = def.end, hadWin = def.win;
  def.win = function (rt) { return e0.call(this, rt, true); };
  moreSteps(def, MORE2[id]);
  const w1 = def.win;
  def.win = w1;
  def.end = function (rt, won, ...a) {
    const k = rt.flags.k652m;
    if (won && k === 'on') return;
    if (won && !k && ready(rt)) return w1.call(this, rt);
    return e0.call(this, rt, won, ...a);
  };
}
