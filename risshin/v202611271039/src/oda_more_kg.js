// K674（11/26 クラウドせ・一戦10任務）：金ヶ崎の退き口に、退き口へ着いた後の史実の続きの段を足す（tokugawa_more.js の moreSteps）。
//   史実：元亀元年（1570）四月、浅井の離反で信長は金ヶ崎から若狭の道を朽木越えで京へ退いた。木下・明智・池田らの殿は
//   敦賀から関峠・佐柿（国吉城の粟屋勝久が織田方で守った）・熊川を経て退き、朝倉の追手と道筋の地侍の落ち武者狩りを受けた
//   （『信長公記』巻三 A・『朝倉始末記』B・美浜町の国吉城の解説 C。道筋の細かな戦いは推）。
//   字は任務の一行と台詞だけ。退きの元の仕組み（退き口の待ち・追手の波・負けの決着）は続きの段の間は止める。
import { moreSteps, S, A, G, B } from './tokugawa_more.js';

const C = (n) => ({ type: 'cavalry', n });
const F = (title, sub, obj, who, said, foes, t2, said2, foes2) => ({ fight: { title, sub, obj, say: [[who, said]], foes, limit: 50,
  later: t2 ? [{ t: t2, say: said2, foes: foes2 || [] }] : [] } });

const KG_MORE = { faction: 'asakura', flag: 'asakura', rows: [
  { dur: 4, rest: [['木下藤吉郎', '退き口には出た。だが朝倉はまだ追うて来る。国吉の城まで、道を守って退くぞ']] },
  F('若狭への道の口', '道の口へ追いすがる朝倉の先手', '若狭への道の口で、追いすがる朝倉の先手を討て', '朝倉の侍', '織田の殿を逃がすな。道の口で押し包め！',
    [{ name: '朝倉の先手', list: [S(2), A(10)] }], 30, ['織田の侍', '後ろから次の手が来る！'], [{ name: '朝倉の二の手', list: [S(1), A(7)], dir: 0.6 }]),
  F('道を断つ騎馬', '先回りする朝倉の馬', '道の先へ回り込む朝倉の騎馬を、槍を揃えて止めよ', '朝倉の騎馬武者', '先へ回れ。退く者の頭を押さえよ！',
    [{ name: '朝倉の騎馬', list: [S(1), A(4), C(4)], dir: -0.5 }], 30, ['足軽', '槍を揃えよ。馬の足を止めるのじゃ！'], [{ name: '騎馬の後の足軽', list: [A(7)], dir: -0.2 }]),
  F('関峠の落ち武者狩り', '峠の林に潜む地侍', '関峠の林から落ち武者狩りに出た地侍を払え', '地侍', '負けて退く兵じゃ。具足も刀も剥いでしまえ！',
    [{ name: '峠の地侍', list: [A(9), B(3)], dir: 0.9 }], 28, ['織田の侍', '反対の林からも出た！'], [{ name: '林の地侍', list: [A(7)], dir: -0.9 }]),
  { dur: 5, rest: [['明智光秀', '国吉の城の粟屋殿は味方じゃ。城の麓まで退けば、手負いを預けられる']] },
  F('国吉の麓', '城の麓へ寄せる朝倉の後詰', '国吉城の麓で、城へ寄せる朝倉の後詰を押し返せ', '朝倉の侍', '国吉の城ごと、織田の殿を押し潰せ！',
    [{ name: '朝倉の後詰', list: [S(2), A(10), G(2)] }], 32, ['粟屋の侍', '城から鉄砲を撃ち掛ける。今のうちに押せ！'], [{ name: '麓の朝倉勢', list: [S(1), A(7)], dir: 0.5 }]),
  F('熊川の宿の鉄砲', '宿の家並みに潜む鉄砲', '熊川の宿の家並みから撃つ朝倉の鉄砲組を崩せ', '朝倉の鉄砲頭', '家の陰から撃て。一人でも多く倒せ！',
    [{ name: '宿の鉄砲組', list: [S(1), A(4), G(5)], dir: -0.3 }], 32, ['織田の侍', '散って寄れ。固まると狙われるぞ'], [{ name: '宿の槍組', list: [A(7)], dir: 0.4 }]),
  F('朽木谷の入口', '最後の追手', '朽木谷の入口で、最後に追いすがる朝倉の旗本を止めよ', '朝倉の侍大将', 'ここで逃がせば、織田はまた来る。かかれ！',
    [{ name: '朝倉の旗本', list: [S(3), A(9)] }], 30, ['木下藤吉郎', 'これが最後の追手じゃ。止めれば、皆で京へ帰れるぞ！'], [{ name: '旗本の後の組', list: [A(7)], dir: -0.6 }]),
], en: [
  ['退き口には出た。だが朝倉はまだ追うて来る。国吉の城まで、道を守って退くぞ', 'We reached the escape road. But the Asakura still pursue. We guard the road all the way to Kuniyoshi Castle.'],
  ['若狭への道の口', 'Mouth of the Wakasa road'], ['道の口へ追いすがる朝倉の先手', 'The Asakura van closes on the road'],
  ['若狭への道の口で、追いすがる朝倉の先手を討て', 'Cut down the Asakura van pressing at the mouth of the Wakasa road'],
  ['織田の殿を逃がすな。道の口で押し包め！', 'Do not let the Oda rearguard escape. Surround them at the road!'], ['朝倉の先手', 'Asakura van'],
  ['後ろから次の手が来る！', 'The next wave is coming from behind!'], ['朝倉の二の手', 'Asakura second wave'],
  ['道を断つ騎馬', 'Riders cutting the road'], ['先回りする朝倉の馬', 'Asakura horse riding ahead'],
  ['道の先へ回り込む朝倉の騎馬を、槍を揃えて止めよ', 'Level spears and stop the Asakura riders circling ahead on the road'],
  ['先へ回れ。退く者の頭を押さえよ！', 'Ride ahead. Cut off their retreat!'], ['朝倉の騎馬', 'Asakura riders'],
  ['槍を揃えよ。馬の足を止めるのじゃ！', 'Level spears. Stop the horses!'], ['騎馬の後の足軽', 'Foot behind the riders'],
  ['関峠の落ち武者狩り', 'Fugitive hunters at Seki Pass'], ['峠の林に潜む地侍', 'Local men hiding in the pass woods'],
  ['関峠の林から落ち武者狩りに出た地侍を払え', 'Drive off the local men hunting fugitives from the woods of Seki Pass'],
  ['負けて退く兵じゃ。具足も刀も剥いでしまえ！', 'Beaten men on the run. Strip their armor and swords!'], ['峠の地侍', 'Pass locals'],
  ['反対の林からも出た！', 'More from the woods on the other side!'], ['林の地侍', 'Locals in the woods'],
  ['国吉の城の粟屋殿は味方じゃ。城の麓まで退けば、手負いを預けられる', 'Lord Awaya at Kuniyoshi Castle is with us. Reach the foot of the castle and we can leave the wounded there.'],
  ['国吉の麓', 'Foot of Kuniyoshi'], ['城の麓へ寄せる朝倉の後詰', 'Asakura reinforcements close on the castle foot'],
  ['国吉城の麓で、城へ寄せる朝倉の後詰を押し返せ', 'Push back the Asakura reinforcements closing on Kuniyoshi Castle'],
  ['国吉の城ごと、織田の殿を押し潰せ！', 'Crush the Oda rearguard, castle and all!'], ['朝倉の後詰', 'Asakura reinforcements'],
  ['城から鉄砲を撃ち掛ける。今のうちに押せ！', 'The castle is firing on them. Push now!'], ['麓の朝倉勢', 'Asakura at the foot'],
  ['熊川の宿の鉄砲', 'Guns at Kumagawa post town'], ['宿の家並みに潜む鉄砲', 'Guns hidden among the houses'],
  ['熊川の宿の家並みから撃つ朝倉の鉄砲組を崩せ', 'Break the Asakura gunners firing from the houses of Kumagawa'],
  ['家の陰から撃て。一人でも多く倒せ！', 'Fire from behind the houses. Drop as many as you can!'], ['宿の鉄砲組', 'Post town gunners'],
  ['散って寄れ。固まると狙われるぞ', 'Spread out as you close. Bunch up and they will pick us off.'], ['宿の槍組', 'Post town spearmen'],
  ['朽木谷の入口', 'Entrance to Kutsuki Valley'], ['最後の追手', 'The last pursuers'],
  ['朽木谷の入口で、最後に追いすがる朝倉の旗本を止めよ', 'Stop the last Asakura guard pursuing at the entrance to Kutsuki Valley'],
  ['ここで逃がせば、織田はまた来る。かかれ！', 'Let them go now and the Oda will be back. Attack!'], ['朝倉の旗本', 'Asakura guard'],
  ['これが最後の追手じゃ。止めれば、皆で京へ帰れるぞ！', 'These are the last pursuers. Stop them and we all go home to Kyoto!'], ['旗本の後の組', 'Squads behind the guard'],
] };

// 続きの段の間は、元の退きの仕組み（退き口の待ちの負け・追手の波・旗の数え）を止める。段が尽きたら元の win が締める
export function kgMore(def) {
  const up0 = def.update, lose0 = def.lose;
  def.update = function (rt, dt) { if (rt.flags.k652m === 'on') return; return up0 ? up0.call(this, rt, dt) : undefined; };
  def.lose = function (rt, ...a) { if (rt.flags.k652m === 'on') return; return lose0.call(this, rt, ...a); };
  def.pacingCap = (def.pacingCap || 1080) + 100 * KG_MORE.rows.filter((r) => r.fight).length;
  moreSteps(def, KG_MORE);
}
