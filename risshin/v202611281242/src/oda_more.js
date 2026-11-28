// K674（11/26 Sanae・一戦10任務）：織田家編の、勝った後に「史実の続き」の段を足す戦。tokugawa_more.js の moreSteps をそのまま使う。
//   使えるのは win が「勝った時だけ」呼ばれる戦（志賀・天王寺・有岡・伊賀）。字とボタンは足さない（任務の一行と台詞だけ）。
import { moreSteps, S, A, G, B } from './tokugawa_more.js';
import { MORE as M0 } from './tokugawa_more.js';
const MORE = {
  // 志賀の陣（1570/9）：宇佐山の後、浅井・朝倉は坂本から比叡山へ上がり、織田方は下で陣を固めた。山から降りる朝倉の物見が町口へ来る
  shiga: { faction: 'asakura', flag: 'asakura', rows: [
    { rest: [['森可成の郎党', '殿は討死なされた。だが宇佐山はまだ我らの城ぞ']] },
    { fight: { title: '山から降りる物見', sub: '比叡の坂から朝倉の組が降りる', obj: '比叡の坂から降りて来る朝倉の組を町口で止めよ',
      say: [['朝倉の侍', '坂本の町を焼き払え。宇佐山を孤立させよ！']],
      foes: [{ name: '坂の朝倉勢', list: [S(2), A(10)] }],
      later: [{ t: 30, say: ['織田の侍', '鉄砲を並べて来た。間を詰めよ！'], foes: [{ name: '坂の鉄砲組', list: [S(1), A(3), G(4)], dir: 0.6 }] }] } },
  ], en: [
    ['殿は討死なされた。だが宇佐山はまだ我らの城ぞ', 'Our lord has fallen. But Usayama is still our castle.'],
    ['山から降りる物見', 'Scouts coming down the hill'], ['比叡の坂から朝倉の組が降りる', 'Asakura squads descend the Hiei slope'],
    ['比叡の坂から降りて来る朝倉の組を町口で止めよ', 'Stop the Asakura squads coming down the Hiei slope at the town gate'],
    ['坂本の町を焼き払え。宇佐山を孤立させよ！', 'Burn Sakamoto town. Cut Usayama off!'],
    ['坂の朝倉勢', 'Asakura on the slope'], ['坂の鉄砲組', 'Gunners on the slope'],
    ['鉄砲を並べて来た。間を詰めよ！', 'They are lining up guns. Close in!'],
  ] },
  // 天王寺（1576/5）：砦の囲みを破った後、本願寺勢は木津の方から崩れて退き、後詰の雑賀の鉄砲が追いを止めた
  // 11/28 クラウド 天王寺砦の持ち主（K582 一つの戦は4〜7分）：act bot（携帯）で元の段が432秒で終わった後、続きの二つの戦いがどれも刻限の百秒まで続き638秒になった。
  //   有岡と同じく刻限を六十五秒に（任務の数・敵・台詞は同じ）。
  // 11/28 16:05 UTC クラウド 天王寺砦の持ち主（K582 4〜7分）：act bot --mobile 3本で続きの二つの戦いがどちらも刻限の六十五秒まで続き、全体が五百六十五〜六百十九秒になった。
  //   有岡と同じく刻限を五十秒に（後の寄せは三十〜三十五秒に出るので、寄せとの斬り合いは十五秒は残る）。
  tennoji: { faction: 'honganji', flag: 'honganji', limit: 50, rows: [
    { rest: [['明智光秀', '砦は救うた。だが門徒がまだ川の方に残っておる']] },
    { fight: { title: '退く門徒の殿', sub: '木津の方へ退く本願寺勢', obj: '木津の方へ退く門徒の殿を追い散らせ',
      say: [['門徒の侍', '南無阿弥陀仏。ここで足を止めよ！']],
      foes: [{ name: '門徒の殿', list: [S(2), A(10)] }],
      later: [{ t: 30, say: ['織田の侍', '右の畦からも来るぞ！'], foes: [{ name: '畦の門徒', list: [S(1), A(8)], dir: 0.7 }] }] } },
    { rest: [['原田直政の郎党', '鉄砲の音じゃ。雑賀衆が川向こうに出たぞ']] },
    { fight: { title: '川向こうの鉄砲', sub: '雑賀の鉄砲が追いを止める', obj: '川向こうから撃つ雑賀の鉄砲組を討て',
      say: [['雑賀の者', '門徒を逃がす間、ここで撃ち続けよ！']],
      foes: [{ name: '雑賀の鉄砲組', list: [S(1), A(3), G(6)] }],
      later: [{ t: 35, say: ['織田の侍', '散って近づけ。まとまると狙われるぞ'], foes: [] }] } },
  ], en: [
    ['砦は救うた。だが門徒がまだ川の方に残っておる', 'The fort is saved. But Honganji followers still linger toward the river.'],
    ['退く門徒の殿', 'Retreating rearguard'], ['木津の方へ退く本願寺勢', 'Honganji troops falling back toward Kizu'],
    ['木津の方へ退く門徒の殿を追い散らせ', 'Scatter the rearguard falling back toward Kizu'],
    ['南無阿弥陀仏。ここで足を止めよ！', 'Namu Amida Butsu. Stand and hold here!'],
    ['門徒の殿', 'Follower rearguard'], ['畦の門徒', 'Followers on the paddy banks'], ['右の畦からも来るぞ！', 'More along the right-hand paddy banks!'],
    ['鉄砲の音じゃ。雑賀衆が川向こうに出たぞ', 'Gunfire! The Saika men are out across the river.'],
    ['川向こうの鉄砲', 'Guns across the river'], ['雑賀の鉄砲が追いを止める', 'Saika guns stop the pursuit'],
    ['川向こうから撃つ雑賀の鉄砲組を討て', 'Cut down the Saika gunners firing from across the river'],
    ['門徒を逃がす間、ここで撃ち続けよ！', 'Keep firing here while the followers get away!'], ['雑賀の鉄砲組', 'Saika gunners'],
    ['散って近づけ。まとまると狙われるぞ', 'Spread out and close in. Bunched up, you will be shot.'],
  ] },
  // 有岡城（1579）：城が落ちる前、荒木勢は町の口と侍町で最後まで抗い、夜に尼崎へ落ちる者が出た
  // 11/28 クラウド 有岡の持ち主（K582 一つの戦は4〜7分）：act bot（携帯の見なし）で元の段が405秒で終わった後、続きの三つの戦いがどれも刻限の百秒まで続き720秒になった。
  //   有岡の三つだけ刻限を六十五秒に（任務の数・敵・台詞は同じ。討ち切れば前と同じく早く終わる）。
  // 11/28 クラウド 有岡の持ち主（K582・act bot 0725 の619秒 ★★）：本丸の口で二つの寄せを崩した後、新手の湧き（refill）を待つ間に六秒なにも起きなかった。
  //   有岡は寄せた二組を崩せば次へ（noRefill・樫井と同じ）。全体も長い（650〜720秒）ので詰まる。
  // 11/28 14:40 クラウド 有岡の持ち主（K582 4〜7分）：act bot 1420 の三本で三つの戦いが五十〜六十二秒（刻限の近くまで）続き、全体が五百八十〜六百六秒の達成から
  //   官兵衛を迎えて六百三十〜六百五十秒になった。後の『later』の寄せは三十〜三十五秒に出るので、刻限を五十秒に（寄せとの斬り合いは十五秒は残る）。
  // 11/28 16:20 クラウド 有岡の持ち主（K582 流れ）：act bot 1610 で『北の木戸の落人』が刻限五十秒で〔失〕（落人は北へ散り、追い切れない）。
  //   本人の落ち度でない〔失〕を出さない：刻が来たら残りは尼崎へ落ちて済み（timeoutWin・上田／山崎と同じ）。
  arioka: { faction: 'araki', flag: 'araki', limit: 50, noRefill: true, timeoutWin: true, rows: [
    { rest: [['滝川一益', '城の内は崩れた。侍町に、まだ降らぬ者がおる']] },
    { fight: { title: '侍町の抗い', sub: '荒木の家来が町の口に立てこもる', obj: '侍町の口に立てこもる荒木の家来を討て',
      say: [['荒木の侍', '殿は尼崎へ参られた。ここで時を稼げ！']],
      foes: [{ name: '侍町の家来', list: [S(2), A(9)] }],
      later: [{ t: 30, say: ['織田の侍', '塀の陰から撃っておる！'], foes: [{ name: '塀の鉄砲組', list: [S(1), A(3), G(4)], dir: 0.5 }] }] } },
    { rest: [['丹羽長秀', '荷を負うて逃げる者が、北の木戸へ向かうぞ']] },
    { fight: { title: '北の木戸の落人', sub: '尼崎へ落ちる荒木方', obj: '北の木戸から落ちて行く荒木方を止めよ',
      say: [['荒木の侍', '道を開けい。尼崎まで行くのじゃ！']],
      foes: [{ name: '木戸の落人', list: [S(2), A(8)], dir: -0.5 }],
      later: [{ t: 30, say: ['足軽', '後ろの組が槍を構えたぞ！'], foes: [{ name: '落人の殿', list: [S(1), A(8)], dir: 0.4 }] }] } },
    { rest: [['佐久間信盛', '火が回る。もうひと働きして、本丸の口を押さえよ']] },
    { fight: { title: '本丸の口', sub: '最後の守りが残る', obj: '本丸の口を守る荒木の旗本を討て',
      say: [['荒木の旗本', '城を枕に討死せよ！']],
      foes: [{ name: '本丸の旗本', list: [S(3), A(8), G(2)] }],
      later: [{ t: 35, say: ['織田の侍', '横から来るぞ！'], foes: [{ name: '本丸の槍組', list: [S(1), A(8)], dir: 0.7 }] }] } },
  ], en: [
    ['城の内は崩れた。侍町に、まだ降らぬ者がおる', 'The castle interior has fallen. Some in the samurai quarter still refuse to yield.'],
    ['侍町の抗い', 'Holdouts in the samurai quarter'], ['荒木の家来が町の口に立てこもる', "Araki's retainers barricade the quarter gate"],
    ['侍町の口に立てこもる荒木の家来を討て', "Cut down Araki's retainers barricaded at the quarter gate"],
    ['殿は尼崎へ参られた。ここで時を稼げ！', 'Our lord has gone to Amagasaki. Buy him time here!'],
    ['侍町の家来', 'Quarter retainers'], ['塀の陰から撃っておる！', 'They are firing from behind the wall!'], ['塀の鉄砲組', 'Wall gunners'],
    ['荷を負うて逃げる者が、北の木戸へ向かうぞ', 'People with bundles are fleeing toward the north gate.'],
    ['北の木戸の落人', 'Fugitives at the north gate'], ['尼崎へ落ちる荒木方', 'Araki men fleeing to Amagasaki'],
    ['北の木戸から落ちて行く荒木方を止めよ', 'Stop the Araki men escaping through the north gate'],
    ['道を開けい。尼崎まで行くのじゃ！', 'Clear the way. We are going to Amagasaki!'],
    ['木戸の落人', 'Gate fugitives'], ['落人の殿', 'Fugitive rearguard'], ['後ろの組が槍を構えたぞ！', 'The rear squad has leveled spears!'],
    ['火が回る。もうひと働きして、本丸の口を押さえよ', 'Fire spreads. One more push and take the keep gate.'],
    ['本丸の口', 'Keep gate'], ['最後の守りが残る', 'The last defenders remain'], ['本丸の口を守る荒木の旗本を討て', "Cut down Araki's guards at the keep gate"],
    ['城を枕に討死せよ！', 'Die with the castle!'], ['本丸の旗本', 'Keep guards'], ['本丸の槍組', 'Keep spearmen'], ['横から来るぞ！', 'From the side!'],
  ] },
  // 天正伊賀の乱（1581/9）：比自山の後、伊賀の衆は奥の谷と柏原の方へ落ち、夜討ちで追手を悩ませた
  iga: { faction: 'iga', flag: 'iga', rows: [
    { rest: [['織田信雄の侍', '比自山は落ちた。だが谷の奥から、まだ伊賀の者が出る']] },
    { fight: { title: '谷の落人', sub: '柏原の方へ落ちる伊賀衆', obj: '谷の道を落ちて行く伊賀衆の殿を討て',
      say: [['伊賀の者', '里を焼かれても、国は渡さぬ！']],
      foes: [{ name: '谷の伊賀衆', list: [S(1), A(10)] }],
      later: [{ t: 30, say: ['織田の侍', '木の上からも来るぞ！'], foes: [{ name: '木の上の弓衆', list: [A(2), B(5)], dir: 0.6 }] }] } },
    { rest: [['丹羽長秀の郎党', '日が暮れる。篝を焚け。夜討ちに備えよ']] },
    { fight: { title: '夜の討ち入り', sub: '暗がりから伊賀の組が来る', obj: '暗がりから討ち入る伊賀の組を押し返せ',
      say: [['伊賀の者', '陣の火を消せ。闇に紛れて斬れ！']],
      foes: [{ name: '夜討ちの伊賀衆', list: [S(1), A(10)] }],
      later: [{ t: 30, say: ['足軽', '後ろからも来た！'], foes: [{ name: '後ろの伊賀衆', list: [A(8)], dir: 0.9 }] }] } },
  ], en: [
    ['比自山は落ちた。だが谷の奥から、まだ伊賀の者が出る', 'Hijiyama has fallen. But Iga men still emerge from deep in the valleys.'],
    ['谷の落人', 'Valley fugitives'], ['柏原の方へ落ちる伊賀衆', 'Iga men fleeing toward Kashiwabara'],
    ['谷の道を落ちて行く伊賀衆の殿を討て', 'Cut down the Iga rearguard fleeing along the valley road'],
    ['里を焼かれても、国は渡さぬ！', 'Burn our villages if you like, we will not yield our land!'],
    ['谷の伊賀衆', 'Valley Iga men'], ['木の上の弓衆', 'Archers in the trees'], ['木の上からも来るぞ！', 'More from up in the trees!'],
    ['日が暮れる。篝を焚け。夜討ちに備えよ', 'Night falls. Light the fires. Brace for a night raid.'],
    ['夜の討ち入り', 'Night raid'], ['暗がりから伊賀の組が来る', 'Iga squads come out of the dark'],
    ['暗がりから討ち入る伊賀の組を押し返せ', 'Push back the Iga squads raiding out of the dark'],
    ['陣の火を消せ。闇に紛れて斬れ！', 'Put out the camp fires. Cut them down in the dark!'],
    ['夜討ちの伊賀衆', 'Night-raid Iga men'], ['後ろの伊賀衆', 'Iga men behind'], ['後ろからも来た！', 'They are coming from behind too!'],
  ] },
};
// 11/28 クラウド 有岡の持ち主（K582 流れ）：act bot（携帯）で続きの三つの戦いが三つとも刻限の六十五秒で終わり、討ち取りが無かった
//   （行き先へ 26m より寄れず）。敵が城の側（堀・塀の向こう）の兵の所から湧いていた。岩石城・稲葉山と同じく、本人と同じ高さで塀を挟まない所から寄せる
MORE.arioka.fromAt = (rt, P, d) => {
  const y0 = rt.player?.u?.pos?.y ?? rt.world.heightAt(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  for (let r = 34; r >= 14; r -= 4) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(rt.world.heightAt(x, z) - y0) >= 3) continue;
    if (rt.world.waterDepthAt?.(x, z) > 0.3) continue;
    if (wb && wb(P, 0, { x, z })) continue;
    return { x, z };
  }
  return { x: P.x + Math.sin(d) * 12, z: P.z + Math.cos(d) * 12 };
};
Object.assign(M0, MORE);
export { MORE };
export function odaMore(def, id) { moreSteps(def, MORE[id]); }
