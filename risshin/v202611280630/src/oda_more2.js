// K674（11/26 Sanae・一戦10任務）：織田家編の後半（設楽原〜本能寺）に、勝った後の史実の続きの段を足す。oda_more.js と同じ仕組み（tokugawa_more.js の moreSteps）。
//   字は任務の一行と台詞だけ。表の字は「日本語|English」。fight = [題, 副題, 任務, 敵の名, [誰, 台詞], [遅れて来る誰, 台詞, 敵の名], 兵の数[侍,足軽,鉄砲,弓], 向き]
import { MORE as M0 } from './tokugawa_more.js';
import { moreSteps, S, A, G, B } from './tokugawa_more.js';
const sp = (s) => s.split('|');
export function mkSpec(faction, items, lim) {   // lim：段の上限の秒（無ければ共通の百秒）
  const rows = [], en = [];
  const add = (s) => { const [j, e] = sp(s); en.push([j, e]); return j; };
  for (const it of items) {
    if (it.r) { rows.push({ rest: [[it.r[0], add(it.r[1])]] }); continue; }
    const [t, s, o, foe, say, lat, n, dir] = it.f;
    const mkL = (k) => [S(k[0] || 0), A(k[1] || 0), G(k[2] || 0), B(k[3] || 0)].filter((q) => q.n > 0);
    rows.push({ fight: { title: add(t), sub: add(s), obj: add(o), say: [[say[0], add(say[1])]], ...(lim ? { limit: lim } : {}),
      foes: [{ name: add(foe), list: mkL(n), ...(dir ? { dir } : {}) }],
      later: [{ t: 30, say: [lat[0], add(lat[1])], foes: [{ name: add(lat[2]), list: mkL([0, Math.max(6, n[1] - 2), 0, 0]), dir: (dir || 0) + 0.7 }] }] } });
  }
  return { faction, flag: faction, rows, en };
}
// 田野の続きの段の出所：屋敷・柵の塀の向こうや歩けない所に出ると、寄せが塀に止まって来ない（11/28 act bot ★★★17回）。
//   向きを左右へ振り、距離 34〜58m で「歩ける・本人との間に塀や柵が無い」所を選ぶ。無ければ元の foeFrom と同じ 40m 先
function tanoFrom(rt, P, d) {
  const A = rt.army, W = rt.world;
  for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
    for (const r of [44, 36, 52, 58, 34]) {
      const q = { x: P.x + Math.sin(d + da) * r, z: P.z + Math.cos(d + da) * r };
      if (W?.walkable && W.walkable(q.x, q.z) === false) continue;
      if ((W?.waterDepthAt?.(q.x, q.z) || 0) > 0.3) continue;
      if (W?.slopeTan && W.slopeTan(q.x, q.z) > 0.7) continue;
      if (A?.wallBetween && A.wallBetween(P, -1, q)) continue;
      // 11/28 クラウド 田野の持ち主：川岸の秋山勢が (136,35) に出て、本人 (100,35) との間の急な岸で二十秒止まった（act bot ★★12回）→ 間も歩けて段差の小さい所だけ
      if (W?.heightAt && Math.abs(W.heightAt(q.x, q.z) - W.heightAt(P.x, P.z)) > 5) continue;
      if (W && !pathOk(W, P, q.x, q.z)) continue;
      return q;
    }
  }
  return { x: P.x + Math.sin(d) * 40, z: P.z + Math.cos(d) * 40 };
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
  echizen: { key: 'fuchuDone', ...mkSpec('ikko', [
    { r: ['明智光秀', '殿は崩れた。だが峠の奥へ、一揆勢が逃げ込むぞ|The rearguard is broken. But the ikki are fleeing deeper into the pass.'] },
    { f: ['峠の奥の道|Road beyond the pass', '観音丸から落ちる一揆勢|Ikki fleeing from Kannonmaru', '峠の奥の道を塞ぐ一揆勢を討て|Cut down the ikki blocking the road beyond the pass',
      '峠の一揆勢|Pass ikki', ['一揆の僧', '南無阿弥陀仏。ここで踏み止まれ！|Namu Amida Butsu. Stand firm here!'], ['織田の侍', '木の間からも来る！|More from between the trees!', '木の間の一揆勢|Ikki in the trees'], [1, 10, 2, 0]] },
    { f: ['鉢伏の落人|Hachibuse fugitives', '鉢伏の山道へ逃れる門徒|Followers flee up the Hachibuse trail', '鉢伏の山道へ逃れる一揆の殿を討て|Cut down the ikki rearguard fleeing up the Hachibuse trail',
      '山道の殿|Trail rearguard', ['一揆の侍', '山へ入れば追手は来れぬ。ここを守れ！|Once in the mountains they cannot follow. Hold here!'], ['足軽', '岩の上から落として来る！|They are dropping rocks from above!', '岩の上の一揆|Ikki on the rocks'], [0, 10, 3, 0], -0.5] },
    { f: ['府中への道|The road to Fuchu', '府中へ向かう追い討ち|Pursuit toward Fuchu', '府中へ退く一揆勢の後ろを追い散らせ|Scatter the ikki rear falling back toward Fuchu',
      '府中の一揆勢|Fuchu ikki', ['一揆の侍', '府中の町を盾にせよ！|Use the town of Fuchu as a shield!'], ['織田の侍', '右の畦から鉄砲じゃ！|Guns from the right-hand banks!', '畦の鉄砲組|Bank gunners'], [2, 10, 4, 0], 0.3] },
  ]) },
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
      '曲輪の家来|Enclosure retainers', ['松永の侍', '殿のお供をする。ここで死ぬのじゃ！|We follow our lord. We die here!'], ['織田の侍', '火の陰から来る！|They come out of the flames!', '火の陰の家来|Retainers in the smoke'], [2, 11, 0, 0]] },
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
  ], 45),   // 11/26 クラウドす（K674・K658）：元の六段で約十分かかるので、続きの四段は一つ四十五秒まで（act bot 1073秒）
  // 田野（1582/3/11）：柵を押さえた後、勝頼の近習は屋敷の庭と崖道で最後まで戦った
  //   11/28 クラウド 田野の持ち主（K658）：信勝の近習・大龍寺麟岳・小原兄弟の三段を土屋の前に足した（『信長公記』巻十五・『甲陽軍鑑』）。
  //   寄せの出所は tanoFrom（屋敷の塀の向こうに出て 20 秒止まる★★★を無くす）
  tano: { fromAt: (rt, P, d) => tanoFrom(rt, P, d), ...mkSpec('takeda', [
    { r: ['滝川一益', '柵は破れた。だが屋敷の庭に、まだ近習が残っておる|The palisade is breached. But retainers remain in the residence garden.'] },
    { f: ['屋敷の庭|The residence garden', '屋敷の庭で踏み止まる近習|Retainers holding the residence garden', '屋敷の庭で踏み止まる近習を討て|Cut down the retainers holding the residence garden',
      '庭の近習|Garden retainers', ['武田の近習', '御屋形の御最期を汚させぬ！|We will not let our lord\'s end be desecrated!'], ['織田の侍', '崖の上から弓だ！|Arrows from the cliff!', '崖の弓衆|Cliff archers'], [3, 10, 0, 3]] },
    { f: ['崖道の殿|Cliff path rearguard', '山へ続く崖の道の殿|The rearguard on the cliff path', '崖道を塞ぐ武田の殿を討ち破れ|Break the Takeda rearguard blocking the cliff path',
      '崖道の殿|Cliff rearguard', ['武田の侍', '道は狭い。一人ずつ斬れ！|The path is narrow. Cut them one by one!'], ['足軽', '上から石が！|Rocks from above!', '崖の上の組|Cliff squad'], [2, 10, 0, 0], 0.4] },
    { f: ['橋の袂|Foot of the bridge', '橋を守る武田の兵|The Takeda men guarding the bridge', '橋の袂を守る武田の兵を討て|Cut down the Takeda men guarding the foot of the bridge',
      '橋の守り|Bridge guards', ['武田の侍', '橋を渡すな！|Do not let them cross!'], ['織田の侍', '川向こうから鉄砲！|Guns from across the river!', '川向こうの鉄砲組|Guns across the river'], [2, 10, 3, 0], -0.5] },
    { f: ['山の逃げ手|Fugitives in the hills', '山へ落ちる者の最後の組|The last group escaping into the hills', '山へ落ちる武田方の最後の組を追い止めよ|Stop the last Takeda group escaping into the hills',
      '山の逃げ手|Hill fugitives', ['武田の侍', '山の奥まで走れ！|Run deep into the mountains!'], ['足軽', '藪から出た！|They came out of the brush!', '藪の武田勢|Takeda in the brush'], [1, 10, 0, 0], 0.8] },
    { f: ['若殿の近習|The young lord\'s pages', '十六の信勝が太刀を取る|Nobukatsu, sixteen, takes up his sword', '信勝を守って斬って出る近習を討て|Cut down the pages who sally to guard Nobukatsu',
      '信勝の近習|Nobukatsu\'s pages', ['武田信勝', '武田の家の終わりを、見苦しゅうはせぬ！|The end of the Takeda house shall not be shameful!'], ['織田の侍', '若殿の旗本が回り込んだ！|The young lord\'s guards have circled round!', '信勝の旗本|Nobukatsu\'s guards'], [3, 9, 0, 0], -0.3] },
    { f: ['麟岳和尚|Abbot Ringaku', '大龍寺の僧が太刀を取って打って出る|The Dairyuji monk takes a sword and sallies', '太刀を取った麟岳和尚と供の者を退けよ|Drive back Abbot Ringaku and his followers with swords',
      '麟岳の供|Ringaku\'s followers', ['大龍寺麟岳', '経を読むだけが僧の勤めではない！|Reading sutras is not a monk\'s only duty!'], ['足軽', '寺の方からも来る！|More from the temple!', '寺の者|Temple men'], [1, 10, 0, 0], 0.5] },
    { f: ['小原の兄弟|The Ohara brothers', '小原継忠の兄弟が谷を塞ぐ|The Ohara brothers block the valley', '谷を塞ぐ小原の兄弟の組を破れ|Break the Ohara brothers\' squad blocking the valley',
      '小原の組|Ohara squad', ['小原継忠', '兄弟そろって、ここで果てようぞ！|Brothers together, we end it here!'], ['織田の侍', '弓を揃えて来た！|They have archers in line!', '小原の弓衆|Ohara archers'], [2, 10, 0, 3], -0.8] },
    { f: ['秋山の組|Akiyama squad', '秋山摂津守が谷川の岸で槍を揃える|Akiyama, Lord of Settsu, levels spears on the stream bank', '谷川の岸で槍を揃える秋山摂津守の組を崩せ|Break Akiyama\'s spearmen on the stream bank',
      '秋山の槍組|Akiyama spears', ['秋山摂津守', '槍を揃えよ。一度に突け！|Level spears. Thrust together!'], ['足軽', '川を渡って横から来る！|They are crossing the stream to our flank!', '川岸の秋山勢|Akiyama men on the bank'], [2, 11, 0, 0], 0.9] },
    { f: ['跡部と長坂|Atobe and Nagasaka', '御屋形の側近が最後の組を出す|The lord\'s close advisers send out the last squad', '跡部勝資と長坂釣閑の組を討て|Cut down the squad of Atobe Katsusuke and Nagasaka Chokan',
      '側近の組|Advisers\' squad', ['跡部勝資', '我らが御屋形を誤らせたのなら、ここで詫びる！|If we led our lord astray, we atone for it here!'], ['織田の侍', '鉄砲を持ち出した！|They have brought out guns!', '側近の鉄砲組|Advisers\' gunners'], [3, 9, 2, 0], -0.2] },
    { f: ['土屋の殿|Tsuchiya rearguard', '最期まで残る土屋の兵|Tsuchiya\'s men who remain to the end', '最後まで残る土屋昌恒の兵を討て|Cut down Tsuchiya Masatsune\'s men who remain to the end',
      '土屋の兵|Tsuchiya men', ['土屋昌恒', '片手千人斬りの手並み、見せようぞ！|I will show the skill of a thousand-man slayer!'], ['織田の侍', '強いぞ。囲め！|He is strong. Surround him!', '土屋の旗本|Tsuchiya guards'], [3, 8, 0, 0], 0.2] },
  ], 60) },
  // 本能寺（1582/6/2）：使者を送った後、二条御所の方では信忠が明智勢と戦った。裏の通りで追手が掛かる
  honnoji: mkSpec('akechi', [
    { r: ['織田の侍', '上様は御殿に入られた。だが西の通りに追手が回った|His lordship has withdrawn into the hall. But pursuers are circling to the west street.'] },
    { f: ['西の通りの追手|Pursuers on the west street', '明智の組が裏の通りへ回る|Akechi squads circle to the back street', '西の通りへ回った明智の追手を討て|Cut down the Akechi pursuers who circled to the west street',
      '通りの明智勢|Street Akechi', ['明智の侍', '一人も二条へ行かせるな！|Let none reach Nijo!'], ['足軽', '塀を越えて来る！|They are coming over the wall!', '塀越しの明智勢|Akechi over the wall'], [2, 10, 4, 0]] },
    { f: ['二条の木戸|The Nijo gate', '二条御所の木戸へ寄る明智勢|Akechi men press the Nijo gate', '二条御所の木戸へ寄る明智の先手を押し返せ|Push back the Akechi vanguard pressing the Nijo gate',
      '木戸の明智勢|Gate Akechi', ['明智の侍', '三七様の御所も落とせ！|Take the young lord\'s residence too!'], ['織田の侍', '鉄砲が来る！|Guns!', '木戸の鉄砲組|Gate gunners'], [2, 10, 4, 0], 0.4] },
    // 11/26 クラウドか（K674 今8→10）：明智勢は隣の近衛前久の屋敷の屋根に上がり、御所の内へ弓・鉄砲を撃ち込んだ。信忠の近習は門を開けて打って出た（『信長公記』巻十五 A）。
    //   段の上限は四つとも四十五秒（act bot 1478秒＝K658 の十五分を超えるので、足した二段で長くしない）
    { f: ['近衛屋敷の屋根|The Konoe mansion roof', '隣の屋敷の屋根から撃ち込む明智勢|Akechi men fire from the roof next door', '近衛屋敷の屋根から撃ち込む明智の鉄砲組を払え|Clear the Akechi gunners firing from the Konoe mansion roof',
      '屋根の鉄砲組|Roof gunners', ['明智の鉄砲頭', '屋根の上から御所の内を狙え！|From the roof, aim into the residence!'], ['織田の侍', '弓も来る。塀の陰を伝え！|Arrows too. Keep to the wall!', '屋根の弓組|Roof archers'], [1, 6, 5, 2], -0.4] },
    { f: ['御所の門前|Before the residence gate', '信忠の近習が門を開けて打って出る|Nobutada\'s pages open the gate and sally', '打って出た信忠の近習と共に、門前の明智勢を押し返せ|With Nobutada\'s pages, push back the Akechi men before the gate',
      '門前の明智勢|Akechi at the gate', ['明智の侍', '中将殿の首を取れ！|Take the Chujo\'s head!'], ['信忠の近習', '殿の御前じゃ。一歩も退くな！|Our lord is behind us. Not one step back!', '門前の二の手|Second wave at the gate'], [3, 10, 2, 0], 0.2] },
  ], 45),
  // 大河内（1569/8〜10）：南の鹿垣で兵糧を断った後の囲み。九月八日の西の搦手の雨の夜討ち（稲葉・池田・丹羽が鉄砲を使えず退いた）、
  //   滝川一益の田畠の薙ぎ捨て、多気の方からの荷の差し入れ、和睦を嫌う城の侍の打って出（『信長公記』巻二 A・11/26 クラウドか K674 今5→10）。
  //   段の口は win でなく peace（和睦）。和睦の印が全部立った時だけ続きの段へ入り、段が尽きたら元の和睦へ。段の上限は六十秒
  okawachi: { ...mkSpec('kitabatake', [
    { r: ['滝川一益', '城は飢え始めた。夜になれば、米を取りに打って出て来ようぞ|The castle has begun to starve. When night falls, they will sally for rice.'] },
    { f: ['米を取りに出る城兵|Garrison sallying for rice', '鹿垣を破りに来る北畠の組|Kitabatake squads come to break the deer fence', '鹿垣を破りに来た城兵を押し返せ|Push back the garrison coming to break the deer fence',
      '打って出た城兵|Sallying garrison', ['北畠の侍', '鹿垣を破れ。米を城へ入れよ！|Break the fence. Get the rice into the castle!'], ['織田の侍', '脇の藪からも来る！|More from the brush on the flank!', '藪の北畠勢|Kitabatake in the brush'], [1, 6, 0, 1]] },
    { f: ['雨の夜討ち|The rainy night raid', '西の搦手の夜討ちが雨で崩れる|The night raid on the west gate collapses in the rain', '雨で鉄砲が使えぬ。退く夜討ちの味方を追う城兵を止めよ|The rain has soaked the guns. Stop the garrison chasing our retreating raiders',
      '追って来る城兵|Pursuing garrison', ['北畠の侍', '火縄は濡れておる。槍で討ち取れ！|Their matches are wet. Take them with spears!'], ['足軽', '後ろからも追って来る！|They chase from behind too!', '搦手の追手|Pursuers from the back gate'], [2, 6, 0, 0], 0.6] },
    { f: ['田畠の薙ぎ捨て|Cutting down the fields', '滝川の組が城の周りの稲を刈る|Takigawa\'s men cut the rice around the castle', '稲を刈る味方を、出て来た城兵から守れ|Guard our men cutting the rice from the garrison',
      '田の北畠勢|Kitabatake in the paddies', ['北畠の侍', '稲を刈らせるな。城の命じゃ！|Do not let them take the rice. It is the castle\'s life!'], ['織田の侍', '畦の向こうに弓が並んだ！|Archers along the far ridge!', '畦の弓組|Ridge archers'], [1, 5, 0, 2], -0.5] },
    { f: ['多気からの荷|Supplies from Taki', '国司の里から城へ荷を運ぶ地侍|Local samurai carry supplies from the lord\'s home to the castle', '多気の方から城へ荷を運ぶ地侍を止めよ|Stop the local samurai carrying supplies from Taki to the castle',
      '荷の守り|Supply guards', ['北畠の地侍', '御所様に米を届けるのじゃ！|We bring rice to our lord!'], ['織田の侍', '荷の後ろに鉄砲が付いておる！|Guns are following the carts!', '荷の鉄砲組|Cart gunners'], [1, 5, 2, 0], 0.3] },
    { f: ['和睦を嫌う者|Those who refuse peace', '和睦の話の夜、城の侍が木戸から打って出る|On the night of the peace talks, castle samurai sally from the gate', '和睦を嫌って打って出た北畠の侍を討て|Cut down the Kitabatake samurai who sallied to refuse the peace',
      '木戸の北畠勢|Gate Kitabatake', ['北畠の侍', '織田の子を主と仰ぐくらいなら、ここで死ぬ！|Rather die here than serve an Oda child!'], ['織田の侍', '囲め。和睦の使いに近づけるな！|Surround them. Keep them from the envoys!', '木戸の二の手|Second wave from the gate'], [2, 6, 0, 0], 0.2] },
  ], 60), key: 'peace',
    // 囲みの段の四百秒の打ち切り（F.blockForce）が続きの段を飛ばさないよう、入った所で立てておく
    onStart: (rt) => { rt.flags.blockForce = true; },
    // 寄せの出所：既定（残る敵兵の立つ所）だと城の塀の内に湧いて出て来られず、東の野だと滝川の囲みの中に湧いて味方に討たれ、段が全部時切れた（act bot 11/26）。
    //   城の木戸の方（北西）から鹿垣の口へ、二十歩の所で寄せる
    dir: Math.atan2(0 - 34, -60 - 26), fromAt: (rt, P, d) => ({ x: P.x + Math.sin(d) * 20, z: P.z + Math.cos(d) * 20 }),
    // 和睦（peace）が通る時だけ続きの段へ（途中の保存から続けた時の印の扱いは peace と同じ）
    only: (rt) => { const F = rt.flags, rs = rt.resumedFrom || 0; return !!(F.blockHeld && rt.player.u.alive && (F.coverReached || rs >= 2) && (F.gateReached || rs >= 2) && (F.pushHeld || rs >= 3) && (F.campReached || rs >= 4)); } },
};
// 大河内の続きの段は雨の夜で斬り合いが遅く、act bot が四十五秒で一段も討ち切れなかった（11/26）→ 上限六十秒・寄せを軽く・後の寄せは二十秒で足軽四人
for (const r of MORE2.okawachi.rows) if (r.fight) { r.fight.later[0].t = 20; r.fight.later[0].foes[0].list = [A(4)]; r.fight.foes[0].hunt = true; r.fight.later[0].foes[0].hunt = true; }   // 囲みの味方と先に組み合わず、鹿垣の本人へ寄せる
// 越前の続きの段（峠の奥・鉢伏・府中の道）は、敵が味方の群れと先に組み合い、三段とも百秒の上限で切れた（act bot 11/26 1908・討ち24）→ 本人を狙わせ上限六十秒
//   峠は道の両脇が崖で、横（dir ±0.5）から出た組は斜面に止まり四十歩より寄らなかった → 三段とも峠道の側（向き0）から寄せる
for (const r of MORE2.echizen.rows) if (r.fight) { r.fight.limit = 60; r.fight.foes[0].hunt = true; r.fight.foes[0].dir = 0; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; r.fight.later[0].foes[0].dir = 0.2; }
// 信貴山の続きの段（天守下・北尾根・土橋・屋敷・麓）は、山の斜面の横から出た組が味方の群れと先に組み合い、五段とも百秒の上限で切れた（act bot 11/28 1224秒・討25）→ 越前と同じく本人を狙わせ上限六十秒・後の寄せは二十秒
// 11/28 07:27 act bot：天守下の曲輪の段の湧き直し（新手の曲輪の家来・十一人）が、段の場から四十歩先の塀・切岸の向こうに出て attack のまま一点に重なった★★（809・895秒）
//   → 信貴山の続きの段は湧き直しを出さない（寄せた組と後の寄せを崩せば済む。樫井と同じ）
MORE2.shigisan.noRefill = true;
// 11/28 07:35 act bot：天守下の曲輪の段の主の組（曲輪の家来・十一人）は本人を狙わず、本人が離れると段の場の一点に attack のまま重なった★★（733秒 50,-66・討11）
//   → 天守下の主の組だけ鉄砲を槍に替えて本人を狙わせる（鉄砲の組に狙わせると段の後も撃ち続けた 11/28 1042秒・の訳で他の段は今のまま）
{ const r0 = MORE2.shigisan.rows.find((r) => r.fight); r0.fight.foes[0].hunt = true; }
// 11/28 09:40 クラウド 信貴山の持ち主（K582 一戦4〜7分）：五段とも六十秒の上限まで続き 756〜934秒（act bot 携帯 0929）→ 雑賀と同じく上限を四十五秒に
for (const r of MORE2.shigisan.rows) if (r.fight) { r.fight.limit = 45; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; }   // 鉄砲・弓を含む主の組まで本人を狙わせると、段の後も撃ち続けて倒れた（11/28 1042秒）→ 本人を狙うのは後の足軽の組だけ
//   それでも出所が城の塀の向こう（90,-203 ほか）で本人まで届かず、五段とも六十秒で切れ討ち8（同 942秒）→ 本人から 14〜30 歩・向きに近い所のうち、歩けて高さの差が四歩より小さく、間に塀の無い所から出す
//   11/28 06:30 act bot：北尾根の段で出所 (31,-92) と本人 (23,-62) の間が歩けない急な斜面で、本人が寄れず止まった★★ → 間の四点も歩けて急でない所だけ
function pathOk(W, P, x, z) {
  for (const f of [0.25, 0.5, 0.75]) { const qx = P.x + (x - P.x) * f, qz = P.z + (z - P.z) * f;
    if (W.walkable?.(qx, qz) === false || (W.slopeTan && W.slopeTan(qx, qz) > 0.7)) return false; }
  return !(W.slopeTan && W.slopeTan(x, z) > 0.7);
}
MORE2.shigisan.fromAt = (rt, P, d) => { const W = rt.world, y0 = rt.player?.u?.pos?.y ?? W.heightAt(P.x, P.z);
  for (let r = 30; r >= 14; r -= 4) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r, h = W.heightAt(x, z);
    if (Math.abs(h - y0) < 4 && W.walkable?.(x, z, h) !== false && !rt.army.wallBetween?.({ x: P.x, y: y0, z: P.z }, -1, { x, y: h, z }) && pathOk(W, P, x, z)) return { x, z }; }
  return { x: P.x + Math.sin(d) * 12, z: P.z + Math.cos(d) * 12 }; };
// 雑賀の続きの段（川べり・社家の辻・東岸）は三段とも百秒の上限で切れ（610・710・810・910秒）、戦が十五分に延び、終わりに東岸の新手に倒れた（act bot 11/28 0418）
//   → 信貴山と同じく上限六十秒・後の寄せは二十秒で本人を狙うのは後の足軽の組だけ。出所は川の中・竹矢来の向こうを外す（tanoFrom）
// 11/28 08:40 クラウド 雑賀の持ち主（K582 一戦4〜7分）：三段とも六十秒の上限で切れ 683秒（act bot 携帯 0824）→ 上限を四十五秒に（天王寺の六十五秒に倣う）
for (const r of MORE2.saika.rows) if (r.fight) { r.fight.limit = 45; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; }
MORE2.saika.fromAt = (rt, P, d) => tanoFrom(rt, P, d);
// 三木の続きの段（荷駄・町口・橋・夜討ち）は、町口と夜討ちが百秒の上限で切れ、町口では行き先へ歩けず（塀の向こう）、戦が724秒に延びた（act bot 携帯 11/28 0514）
//   → 雑賀と同じく上限六十秒・後の寄せは二十秒で本人を狙う足軽の組だけ。出所は塀・柵の向こうと歩けない所を外す（tanoFrom）
for (const r of MORE2.miki.rows) if (r.fight) { r.fight.limit = 60; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; }
// 11/28 10:40 クラウド 三木の持ち主（K582・act bot --mobile 716秒 kiga★★）：町口の殿が美嚢川の北 (-32,-10) に出て、本人 (-35,-33) が川の歩けない帯（幅二m）の手前で二十五秒止まった。
//   tanoFrom の間の調べは四分の一ごと（九m 置き）で細い川の帯をまたいでいた→三木だけ、本人との間を一m 置きに見て、歩けない所・深い水をまたぐ出所を外す
function mikiClear(W, P, q) {
  const n = Math.ceil(Math.hypot(q.x - P.x, q.z - P.z));
  for (let i = 1; i < n; i++) { const x = P.x + (q.x - P.x) * i / n, z = P.z + (q.z - P.z) * i / n;
    if (W.walkable?.(x, z) === false || (W.waterDepthAt?.(x, z) || 0) > 0.45) return false; }
  return true;
}
MORE2.miki.fromAt = (rt, P, d) => {
  const W = rt.world;
  for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
    const q = tanoFrom(rt, P, d + da);
    if (!W || mikiClear(W, P, q)) return q;
  }
  return tanoFrom(rt, P, d);
};
// 岩村の続きの段（麓の殿・山道の追い）は、後の寄せが山の斜面の向こうに出て本人まで来ず、秋山の郎党の段で六十五秒敵が一人も居ない間ができ、
//   戦が九百秒の時切れになる回があった（11/28 K582 岩村の持ち主・描かずの流し）→ 信貴山と同じく上限六十秒・後の寄せは二十秒で本人を狙い、出所は高さの差の小さい歩ける所
for (const r of MORE2.iwamura.rows) if (r.fight) { r.fight.limit = 60; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; }
MORE2.iwamura.fromAt = MORE2.shigisan.fromAt;
// 越前一向（大滝寺）の続きの段（谷奥・滝の前・山道）は三段とも百秒の上限で切れ（484・584・684・784秒）、戦が十三分に延びた（act bot 携帯 11/28 0613・討23）
//   → 岩村と同じく上限六十秒・後の寄せは二十秒で本人を狙う足軽の組だけ。出所は山の斜面を外し、高さの差の小さい歩ける近い所
for (const r of MORE2.echizen_ikko.rows) if (r.fight) { r.fight.limit = 60; r.fight.later[0].t = 20; r.fight.later[0].foes[0].hunt = true; }
MORE2.echizen_ikko.fromAt = MORE2.shigisan.fromAt;
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
// 勝ちを win でなく別の口（大河内は peace）で締める戦：spec.key の口に続きの段を足すだけ
//   大河内は大将（本陣）が遠く、段の任務が使番で運ばれ、四十五秒の段が先に切れて任務が一度も出なかった（act bot 11/26）→ 続きの段の間は使番を通さず、その場で札にする
export function odaMoreKey(def, id) {
  capUp(def, id); moreSteps(def, MORE2[id]);
  const u1 = def.update;
  def.update = function (rt, dt) {
    if (rt.flags.k652m !== 'on' || !rt._issuingOrders) return u1.call(this, rt, dt);
    rt._issuingOrders = false;
    try { return u1.call(this, rt, dt); } finally { rt._issuingOrders = true; }
  };
}
