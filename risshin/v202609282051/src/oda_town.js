// 織田家編の城下の中身（screens.js の baseScreen が引く）
// 城下は「次に向かう戦」で決まる。中身は戦の id で引くので、state.js の ODA_LINE に戦を足しても並びがずれない
// 足した戦の中身がまだ無ければ、ODA_LINE の town（城下の名）と年から決まりの文を出す
import { BATTLES, RANKS } from './state.js';
import { S } from './settings.js';

// 城下の見出し。place・when：見出し。mood：その場の一言。next：城下での選択が次の戦にどう効くか（施設ごとに一言）
// N(槍の稽古, 走り込み, 采配, 組の稽古, 具足, 振る舞い) で next を作る。toiya：問屋の品が次の戦のどこで効くか（供・飛び道具・馬）
const N = (spear, vit, lead, drill, shop, feast) => ({ spear, vit, lead, drill, shop, feast });
const TOWN = {
  moribe: { place: '清洲 城下', when: '永禄四年　春', mood: '今川を破った興奮が、まだ町に残っている。辻ごとに桶狭間の話が聞こえる',
    next: N('林の中の一対一で、突きが重くなる', '林を抜けて横へ回る足が保つ', '初めて預かる五人が、斎藤勢に崩されにくくなる', '五人が押し合いで踏みとどまりやすくなる', '森の中の斬り合いでは、兜と胴が不意の一撃を防ぐ', '初めて率いる五人の士気が高いまま、美濃へ入れる'),
    toiya: { tomo: '林の斬り合いの合間に、中間が傷の手当てと分捕りを担う', gun: '林の陰から寄せる敵を、槍を合わせる前に一人減らせる', horse: '森部は徒歩の戦。馬は足軽大将になってから' } },
  sunomata: { place: '小牧山 城下', when: '永禄九年　秋', mood: '信長が清洲から移した新しい城下。山の上の城から、美濃の方がよく見える',
    next: N('柵に取り付いた敵を突き落とす一撃が重くなる', '柵の破れ目へ駆けつける足が保つ', '十五人の組が、柵の内で崩れにくくなる', '組が柵の内で押し負けにくくなる', '砦の守りは長い。具足が傷を減らす', '夜通しの普請の守りでも、組の士気が落ちにくい'),
    toiya: { tomo: '若党が背を守り、柵の前で囲まれにくい', gun: '川を渡ってくる敵を、柵の内から撃てる', horse: '砦の中の戦。馬の出番はない' } },
  inabayama: { place: '小牧山 城下', when: '永禄十年　夏', mood: '西美濃の三人衆が味方についたと、城下は沸いている。美濃取りは目の前だ',
    next: N('大手口の斬り合いで、突きが重くなる', '夜明けの町を駆け回る。走っても気力が尽きにくい', '町の辻で、組がばらけにくくなる', '門の前の押し合いに、組が負けにくくなる', '大手口の斬り合いで、具足が傷を減らす', '夜明け前の待ちでも、組の士気が保つ'),
    toiya: { tomo: '町の狭い辻では、槍持ちが横を守る', gun: '櫓の上の射手を、下から撃ち落とせる', horse: '山城の坂は馬では上れない' } },
  mitsukuri: { place: '岐阜 城下', when: '永禄十一年　秋', mood: '稲葉山は岐阜と名を変えた。将軍様を奉じて京へ上るという噂で持ちきりだ',
    next: N('木戸の内の斬り合いで、突きが重くなる', '夜の山道を上る足が保つ', '夜の山攻めで、組がばらけにくくなる', '木戸の前で、組が押し返されにくくなる', '木戸の内の斬り合いで、具足が命を守る', '夕暮れから夜通しの攻めでも、組の士気が保つ'),
    toiya: { tomo: '中間が松明と荷を担ぎ、傷の手当てをする', gun: '石垣の上の弓を、下から撃てる', horse: '山城攻め。馬は麓に置いていく' } },
  kanegasaki: { place: '岐阜 城下', when: '元亀元年　春', mood: '稲葉山を「岐阜」と改めて三年。楽市の触れで、町は人と荷であふれている',
    next: N('追いすがる朝倉勢を、振り向きざまに突き伏せる', '殿は走り通し。走っても気力が尽きにくい', '退きながらでも、組がばらけにくくなる', '退き口の押し合いで、組が崩れにくくなる', '退きながらの斬り合いでは、具足が命を守る', '長い退き口でも、組の士気が落ちにくい'),
    toiya: { tomo: '若党が最後尾で背を守る', gun: '追っ手の先頭を撃ち、足を止められる', horse: '馬があれば退き口が速い（乗れるのは足軽大将から）' } },
  anegawa: { place: '岐阜 城下', when: '元亀元年　五月', mood: '金ヶ崎から逃げ帰った兵たちが、傷を縛って次の出陣を待っている',
    next: N('浅井の槍と打ち合う一撃が重くなる', '川を渡る足が保つ', '川原の押し合いで、組が崩れにくくなる', '川を渡る押し合いで、組が負けにくくなる', '浅井の槍は鋭い。兜と胴が突きを防ぐ', '渡河を待つ間も、組の士気が保つ'),
    toiya: { tomo: '槍持ちが川の中でも横に付き、槍を並べる', gun: '川を渡ってくる敵を、岸から撃てる', horse: '浅瀬なら馬で渡れる（乗れるのは足軽大将から）' } },
  nodafukushima: { place: '岐阜 城下', when: '元亀元年　夏', mood: '姉川の勝ちもつかの間。摂津へ向かう鉄砲衆の荷駄が、町を抜けていく',
    next: N('砦の柵際の斬り合いで、突きが重くなる', '竹束を担いで堤を上る。走っても気力が尽きにくい', '鉄砲の中でも、組が怯みにくくなる', '竹束の陰で、組が崩れにくくなる', '砦の鉄砲の流れ弾を、具足が防ぐ', '長い囲みでも、組の士気が保つ'),
    toiya: { tomo: '鉄砲足軽が砦の狭間を撃ち返す', gun: '砦の狭間の鉄砲衆を撃ち返せる', horse: '堤と砦の戦。馬は使いにくい' } },
  shiga: { place: '岐阜 城下', when: '元亀元年　秋', mood: '摂津の陣から、殿が急ぎ引き返されたという。近江の宇佐山が危ないらしい',
    next: N('坂を上る敵を突き落とす一撃が重くなる', '曲輪から曲輪へ駆ける足が保つ', '数に勝る敵の前で、組が崩れにくくなる', '城門の内で、組が押し負けにくくなる', '浅井・朝倉の大軍の矢玉を、具足が防ぐ', '籠城の長い夜も、組の士気が保つ'),
    toiya: { tomo: '中間が城の中で傷を手当てする', gun: '坂を上る敵を、塀の上から撃てる', horse: '城の守り。馬は使わない' } },
  hieizan: { place: '岐阜 城下', when: '元亀二年　夏', mood: '森可成の討ち死にの知らせで、町は沈んでいる。坂本へ向かう荷駄が続く',
    next: N('山道の斬り合いで、突きが重くなる', '長い石段を上る足が保つ', '山道で組がばらけにくくなる', '僧兵の薙刀に、組が押し負けにくくなる', '僧兵の薙刀は重い。具足が傷を減らす', '山を上る前に、組の士気を高くしておける'),
    toiya: { tomo: '若党が薙刀の前に立ち、主を守る', gun: '坊の縁の上の射手を撃てる', horse: '石段の山。馬は麓まで' } },
  mikatagahara: { place: '岐阜 城下', when: '元亀三年　冬', mood: '武田信玄が大軍で遠江へ入った。殿は徳川殿へ加勢を送る。冷たい風が町を抜ける',
    next: N('武田の突き掛かりを受けて突き返す一撃が重くなる', '崩れた陣から浜松へ退く足が保つ', '武田の騎馬の前で、組が怯みにくくなる', '寒さの中でも、組が押し負けにくくなる', '武田の騎馬の槍を、具足が防ぐ', '冬の夕暮れの戦でも、組の士気が保つ'),
    toiya: { tomo: '中間が寒さの中で傷を手当てする', gun: '寄せる騎馬の先頭を撃ち、足を止められる', horse: '広い台地。馬があれば退きが速い（乗れるのは足軽大将から）' } },
  tonezaka: { place: '岐阜 城下', when: '天正元年　八月', mood: '小谷を囲む陣に、朝倉の後詰が来たという。夜の雨の中、殿が自ら駆け出されたとか',
    next: N('逃げる朝倉勢に追いすがる一撃が重くなる', '峠道の追い討ちで、走っても気力が尽きにくい', '追い討ちでも、組がばらけにくくなる', '峠の押し合いで、組が負けにくくなる', '振り返って刃向かう敵の刃を、具足が防ぐ', '夜通しの追い討ちでも、組の士気が保つ'),
    toiya: { tomo: '槍持ちが追い討ちに遅れず付いて来る', gun: '峠を逃げる敵の殿を撃てる', horse: '追い討ちには馬が速い（乗れるのは足軽大将から）' } },
  odani: { place: '岐阜 城下', when: '天正元年　夏', mood: '朝倉を攻める兵が北へ向かう。浅井のお市の方の話を、誰もが声をひそめて話す',
    next: N('曲輪の木戸の斬り合いで、突きが重くなる', '急な尾根道を上る足が保つ', '夜の尾根で、組が崩れにくくなる', '京極丸の押し合いで、組が負けにくくなる', '京極丸の斬り合いで、具足が傷を減らす', '夜の山攻めでも、組の士気が保つ'),
    toiya: { tomo: '中間が松明を掲げ、足元を照らす', gun: '曲輪の塀の上の射手を撃てる', horse: '尾根の山城。馬は麓まで' } },
  nagashima: { place: '岐阜 城下', when: '天正二年　夏', mood: '長島ではこれまで二度しくじった。三度目こそと、町の空気は重い',
    next: N('舟から上がる門徒を突き落とす一撃が重くなる', '岸から岸へ駆けつける足が保つ', '門徒の叫びの中でも、組が怯みにくくなる', '柵の前で組が押し負けにくくなる', '門徒の槍と鉄砲を、具足が防ぐ', '長い囲みでも、組の士気が保つ'),
    toiya: { tomo: '鉄砲足軽が舟の門徒を撃つ', gun: '舟で寄せる門徒を、岸から撃てる', horse: '川と中洲の戦。馬は使いにくい' } },
  shitaragahara: { place: '岐阜 城下', when: '天正三年　五月', mood: '鉄砲と玉薬を積んだ荷駄が、東へ向かう。町の鍛冶場は夜も槌の音がやまない',
    next: N('柵の前で足の止まった騎馬を突く一撃が重くなる', '柵の切れ目へ駆けつける足が保つ', '柵の内で組が踏みとどまりやすくなる', '柵の守りが固くなる', '柵に取り付く武田の槍を、具足が防ぐ', '長い待ちでも、組の士気が落ちにくい'),
    toiya: { tomo: '鉄砲足軽が柵の内から撃ち加わる', gun: '柵の内から、寄せる騎馬を撃てる', horse: '柵の内の戦。馬は後ろに繋ぐ' } },
  echizen: { place: '岐阜 城下', when: '天正三年　八月', mood: '設楽原の勝ちの後、殿はすぐに越前へ兵を向けられる。一揆が国を取ったという',
    next: N('峠の木戸の斬り合いで、突きが重くなる', '雨の峠道を上る足が保つ', '一揆の大勢の前で、組が崩れにくくなる', '峠の押し合いで、組が負けにくくなる', '一揆の竹槍と鉄砲を、具足が防ぐ', '雨の山越えでも、組の士気が保つ'),
    toiya: { tomo: '中間が雨の中で荷と傷の手当てを担う', gun: '峠の砦の射手を撃てる', horse: '峠道。馬は使いにくい' } },
  iwamura: { place: '岐阜 城下', when: '天正三年　冬', mood: '信忠様が岩村城を囲んで半年。武田の後詰が来る前に落とせと、城下はせわしない',
    next: N('夜討ちの斬り合いで、突きが重くなる', '水晶山を駆け上がる足が保つ', '夜討ちの乱れの中で、組がばらけにくくなる', '寄せ手の押し合いで、組が負けにくくなる', '夜討ちの不意の刃を、具足が防ぐ', '冬の夜の待ちでも、組の士気が保つ'),
    toiya: { tomo: '若党が夜討ちで背を守る', gun: '打って出る城兵を撃てる', horse: '山の陣。馬は使いにくい' } },
  tennoji: { place: '安土 城下', when: '天正四年　五月', mood: '湖のほとりに新しい城が建ち始めた。天王寺の砦が囲まれたと、早馬が駆け込んだ',
    next: N('囲みを破る斬り合いで、突きが重くなる', '囲まれた砦へ駆けつける足が保つ', '鉄砲の雨の中でも、組が怯みにくくなる', '門徒の大勢の押し合いで、組が負けにくくなる', '本願寺の鉄砲を、具足が防ぐ', '救援の強行でも、組の士気が保つ'),
    toiya: { tomo: '鉄砲足軽が撃ち返し、囲みに穴を開ける', gun: '本願寺の鉄砲衆を撃ち返せる', horse: '平らな地。馬があれば囲みを破りやすい（乗れるのは足軽大将から）' } },
  saika: { place: '安土 城下', when: '天正五年　二月', mood: '紀州の雑賀を攻める大軍が、南へ下っていく。雑賀の鉄砲は日の本一と聞く',
    next: N('川岸の斬り合いで、突きが重くなる', '冬の川を渡る足が保つ', '雑賀の鉄砲の前で、組が怯みにくくなる', '川の中の押し合いで、組が負けにくくなる', '雑賀の鉄砲の雨を、具足が防ぐ', '冷たい川を渡る前に、組の士気を上げておける'),
    toiya: { tomo: '中間が川を渡った後の手当てをする', gun: '川向こうの雑賀の射手を撃ち返せる', horse: '川底に桶や逆茂木が沈む。馬は危ない' } },
  tedorigawa: { place: '安土 城下', when: '天正五年　九月', mood: '柴田様の北陸の軍に加わる兵が集まる。越後の上杉謙信が加賀へ出たという',
    next: N('追いすがる上杉勢を突き返す一撃が重くなる', '雨の中を退く足が保つ', '退きながらでも、組がばらけにくくなる', '川べりの押し合いで、組が負けにくくなる', '上杉の追い討ちを、具足が防ぐ', '雨の退きでも、組の士気が落ちにくい'),
    toiya: { tomo: '若党が最後尾で背を守る', gun: '追ってくる上杉勢の先頭を撃てる', horse: '馬があれば退きが速い（乗れるのは足軽大将から）' } },
  shigisan: { place: '安土 城下', when: '天正五年　十月', mood: '松永久秀がまた背いた。信貴山の城に籠もり、名物の茶釜を抱えているとか',
    next: N('曲輪の斬り合いで、突きが重くなる', '山を上る足が保つ', '山城の攻めで、組がばらけにくくなる', '木戸の押し合いで、組が負けにくくなる', '塀の上からの矢玉を、具足が防ぐ', '夜の攻めでも、組の士気が保つ'),
    toiya: { tomo: '中間が松明と荷を担ぐ', gun: '天守の狭間を撃てる', horse: '山城。馬は麓まで' } },
  kizugawa: { place: '安土 城下', when: '天正六年　十一月', mood: '伊勢の九鬼殿が、鉄の板で覆った大船を造ったという。毛利の水軍と大坂の沖で戦う',
    next: N('船べりに取り付く敵を突き落とす一撃が重くなる', '揺れる船の上でも気力が尽きにくい', '船の上の騒ぎで、組が怯みにくくなる', '船べりの押し合いで、組が負けにくくなる', '焙烙火矢の火と矢玉を、具足が防ぐ', '海の上の長い待ちでも、組の士気が保つ'),
    toiya: { tomo: '鉄砲足軽が船の上から撃ち加わる', gun: '寄せる小早の漕ぎ手を撃てる', horse: '船の戦。馬は乗せない' } },
  miki: { place: '安土 城下', when: '天正七年　九月', mood: '播磨の三木城の囲みは一年を越えた。毛利が兵糧を運び込もうとしているらしい',
    next: N('大村の野の斬り合いで、突きが重くなる', '陣から陣へ駆ける足が保つ', '夜討ちの乱れの中で、組がばらけにくくなる', '毛利勢の押し合いに、組が負けにくくなる', '夜明けの乱戦で、具足が傷を減らす', '長い囲みでも、組の士気が保つ'),
    toiya: { tomo: '若党が乱戦で背を守る', gun: '兵糧を運び込む敵を撃てる', horse: '野の戦。馬が生きる（乗れるのは足軽大将から）' } },
  arioka: { place: '安土 城下', when: '天正七年　十月', mood: '荒木村重が背き、有岡城に籠もって一年。城の中の者は飢えているという',
    next: N('惣構えの木戸の斬り合いで、突きが重くなる', '堀を越えて駆ける足が保つ', '町の中の戦で、組がばらけにくくなる', '門の前の押し合いに、組が負けにくくなる', '塀の上からの矢玉を、具足が防ぐ', '長い囲みでも、組の士気が保つ'),
    toiya: { tomo: '中間が荷と傷の手当てを担う', gun: '塀の上の射手を撃てる', horse: '城の町の戦。馬は使いにくい' } },
  iga: { place: '安土 城下', when: '天正九年　九月', mood: '伊賀へ四方から攻め入る。山と谷ばかりの国で、藪の中から不意に刃が来るという',
    next: N('山の砦の斬り合いで、突きが重くなる', '伊賀の山道を上る足が保つ', '不意打ちの中で、組がばらけにくくなる', '砦の木戸の押し合いに、組が負けにくくなる', '伊賀者の不意の刃を、具足が防ぐ', '山の夜の待ちでも、組の士気が保つ'),
    toiya: { tomo: '若党が藪からの不意打ちを防ぐ', gun: '藪に潜む射手を撃てる', horse: '山の砦。馬は麓まで' } },
  tottori: { place: '安土 城下', when: '天正九年　十月', mood: '羽柴様が鳥取城を囲んで三月。城の中の兵糧はもう尽きかけているという',
    next: N('打って出る城兵を突き返す一撃が重くなる', '柵に沿って駆ける足が保つ', '長い囲みでも、組がだれにくくなる', '柵の守りが固くなる', '打って出る城兵の刃を、具足が防ぐ', '長い兵糧攻めの囲みでも、組の士気が保つ'),
    toiya: { tomo: '中間が陣の荷を担ぎ、傷の手当てをする', gun: '城から抜け出す者を、柵の内から撃てる', horse: '囲みの陣。馬は使いにくい' } },
  takato: { place: '安土 城下', when: '天正十年　春', mood: '湖のほとりに、五層の天守がそびえる。楽市の町は、京よりにぎやかだという',
    next: N('曲輪の斬り合いで、突きが重くなる', '崖の道を上る足が保つ', '城攻めで、組がばらけにくくなる', '門の前の押し合いに、組が負けにくくなる', '塀の上からの矢玉を、具足が防ぐ', '雪解けの寒さの中でも、組の士気が保つ'),
    toiya: { tomo: '若党が塀際で背を守る', gun: '塀の上の射手を撃てる', horse: '崖の上の城。馬は麓まで' } },
  tano: { place: '安土 城下', when: '天正十年　三月', mood: '高遠が落ち、武田勝頼は新府の城に火を放って逃げたという。武田の終わりが近い',
    next: N('山中の斬り合いで、突きが重くなる', '山の追い討ちで、走っても気力が尽きにくい', '山道で組がばらけにくくなる', '最後の武田勢の押し合いに、組が負けにくくなる', '死に物狂いの刃を、具足が防ぐ', '山越えの前に、組の士気を上げておける'),
    toiya: { tomo: '槍持ちが山道でも遅れず付いて来る', gun: '山道を逃げる敵の殿を撃てる', horse: '山中の戦。馬は使いにくい' } },
  honnoji: { place: '安土 城下', when: '天正十年　五月', mood: '武田が滅び、町は祝いの酒に酔っている。殿は近く、中国の毛利攻めへ向かわれる',
    next: N('町の辻の斬り合いで、突きが重くなる', '京の通りを駆け抜ける。走っても気力が尽きにくい', '夜明けの乱れの中で、組がばらけにくくなる', '門の前の押し合いに、組が負けにくくなる', '明智の大軍を前に、具足が命を守る', '夜明け前の騒ぎでも、組の士気が保つ'),
    toiya: { tomo: '若党が辻で背を守る', gun: '辻の向こうの明智の鉄砲を撃ち返せる', horse: '京の町。馬で駆ければ速い（乗れるのは足軽大将から）' } },
};
// 問屋の品が、次の戦のどこで効くか（toiya.js が引く。無ければ ''）
export function odaToiyaHint(G, k) {
  const b = BATTLES[G.battle];
  const t = b && TOWN[b.id];
  return (t && t.toiya && t.toiya[k]) ? { name: b.name.replace(/の戦い$/, ''), text: t.toiya[k] } : null;
}

// 宿で聞く噂（次の戦の手がかり。一つの城下に四つ）
const RUMORS = {
  moribe: ['美濃の斎藤勢は、先手を前に出して様子を見るのが常らしい', '林の陰から横を突かれると、どんな備えも崩れるものよ', '斎藤義龍が死んで、跡を継いだ龍興はまだ若いと聞く', '森部の辺りは雨が続くと田がぬかるむ。足を取られるなよ'],
  sunomata: ['墨俣は川に面しておる。川沿いから回り込まれると厄介じゃ', '柵の内からなら、槍は届いても敵の刀は届かん', '藤吉郎殿は、蜂須賀の川並衆を味方に付けたそうな', '斎藤勢は夜明けと夕暮れに寄せてくると聞いた'],
  inabayama: ['稲葉山は金華山のてっぺんの城じゃ。まともに攻めては落ちん', '町に火を放つと聞いたが、逃げる町の者まで斬ってはならんぞ', '竹中半兵衛という男が、たった十数人で稲葉山を乗っ取ったことがあるそうじゃ', '城の裏の水の手を押さえれば、城は干上がる'],
  mitsukuri: ['六角は観音寺城に籠もるらしい。その前の箕作城が要じゃ', '夜の山攻めは、松明の火を絶やさぬことが肝心よ', '観音寺城は大きいが、箕作が落ちれば持たんと皆が言うておる', '六角の殿様は、甲賀の山へ逃げる支度をしておるらしい'],
  kanegasaki: ['越前は山が深い。朝倉は一乗谷の奥に籠もっておるそうな', '北近江の浅井は殿の妹婿じゃ。……じゃが、あの家は朝倉とも古い付き合いと聞く', '金ヶ崎の城は、海に面した小さな山の上じゃ', '殿は退くと決めたら速いお方じゃ。遅れる者は置いていかれるぞ'],
  anegawa: ['浅井の兵は川を渡って一気に押してくるらしい。受け止められるかどうかじゃ', '徳川殿の兵は西の瀬に陣を張るそうな。朝倉を受け持つとか', '浅井の磯野員昌は、槍で備えを幾つも破る猛者じゃ', '姉川は夏でも膝ほどの深さ。渡るのは難しゅうない'],
  nodafukushima: ['砦には紀州の鉄砲衆が入っておる。雑賀の者の鉄砲は恐ろしいぞ', 'すぐそばの石山の本願寺が、どちらにつくか分からんそうな', '砦は川と堤に囲まれておる。竹束を並べて寄せるそうな', '夜に堤が切られると、陣が水に浸かるというぞ'],
  shiga: ['朝倉・浅井の大軍が坂本まで来ておるそうな', '宇佐山の城は、森可成様の持ち場じゃ', '比叡山の坊主どもが、朝倉を山にかくまっておるらしい', '城の坂は急じゃ。上から石を落とせば、寄せ手は難儀する'],
  hieizan: ['山の上の坊主どもは、刀も薙刀も使うそうじゃ', '山には里の者も逃げ込んでおるらしい。……刃向かわぬ者まで斬るのかのう', '坂本の町は、山門の坊主の銭で潤うておったそうな', '明智様は、坂本に城を建てるおつもりらしい'],
  mikatagahara: ['信玄公の軍は三万を超えるというぞ', '徳川殿は城に籠もらず、打って出るおつもりらしい', '三方ヶ原は広い台地。騎馬には好きに駆けられる', '冬の日は短い。日が暮れれば退き道も見えん'],
  tonezaka: ['朝倉は、殿の夜討ちで大嶽の砦を失うたそうな', '朝倉が退くなら、刀根坂の峠を越えるはずじゃ', '逃げる敵ほど討ちやすいが、振り返った者は死に物狂いぞ', '追い討ちに遅れた将は、殿にひどく叱られたらしい'],
  odani: ['小谷は尾根に曲輪が並ぶ山城じゃ。真ん中を取れば、本丸と小丸が離れる', 'お市の方と姫さまたちは、まだ城の中におられるそうな', '朝倉が滅んで、浅井にはもう後詰がない', '京極丸を取れば城は二つに割れると、羽柴様は言うておられる'],
  nagashima: ['長島の門徒は、舟で砦から砦へ渡るそうじゃ', '川の中の島じゃ。柵を結うて、舟で着く者を防がねばならん', '門徒は「進めば極楽、退けば地獄」と旗に書いておるそうな', '去年は柴田様も手傷を負うたと聞く'],
  shitaragahara: ['武田の騎馬は、どんな陣でも踏み破るそうじゃ', '殿は鉄砲を千挺も集めたとか。柵を三重に結うと聞いた', '連吾川の西に柵を結う。川が堀の代わりじゃ', '武田の山県昌景は赤備えで知られる。赤い鎧が来たら気をつけよ'],
  echizen: ['越前は一揆が国を取り、坊主が治めておるそうな', '木ノ芽峠には一揆の砦が並ぶ', '雨の峠道は滑る。足を取られるな', '一揆には百姓も多い。刃向かわぬ者はどうするのかのう'],
  iwamura: ['岩村城は山の上。「霧ヶ城」と呼ばれるほど霧が深い', '城を守るのは秋山虎繁。武田の猛将じゃ', '城兵が水晶山の陣に夜討ちを掛けてくるやもしれん', '武田の後詰は、まだ来ぬらしい'],
  tennoji: ['天王寺の砦で、明智様が囲まれておるそうじゃ', '本願寺の鉄砲は数千挺というぞ', '殿は、少ない兵でも自ら救いに出られるおつもりらしい', '雑賀の鉄砲衆が、本願寺に入っておる'],
  saika: ['雑賀の者は、川底に桶を沈めて馬の足を取るそうな', '雑賀の鉄砲は、一人で何挺も持ち替えて撃つらしい', '小雑賀川を渡れば、雑賀の里じゃ', '紀州の山は深い。深追いするなと言われておる'],
  tedorigawa: ['上杉謙信は、戦で負けたことがないそうな', '七尾城はもう落ちたらしい。後詰は間に合わなんだ', '手取川は流れが速い。雨で水かさが増すと渡れん', '退く時は、川を背にせぬことじゃ'],
  shigisan: ['松永殿は、名物の茶釜を渡すくらいなら城ごと焼くと言うておるらしい', '信貴山の城は、山の上に天守がある', '本願寺の鉄砲衆が城に入っておるそうな', '総大将は信忠様じゃ'],
  kizugawa: ['九鬼殿の大船は、鉄の板で火矢を跳ね返すそうな', '毛利の水軍は、焙烙火矢を投げてくる', '大坂の沖は波が荒い。船酔いに気をつけよ', '毛利の船は六百艘というぞ'],
  miki: ['三木の城では兵糧が尽きて、草の根まで食うておるそうな', '毛利の兵が、夜に兵糧を運び込もうとしておる', '大村の辺りで、毛利勢とぶつかるやもしれん', '羽柴様は、囲みを破らせぬよう付け城を並べておられる'],
  arioka: ['荒木様は、城を抜け出して尼崎へ移ったそうな', '城に残された者は、殿のお怒りを受けるやもしれん', '惣構えの中に、町ごと囲われておる', '黒田官兵衛殿が、城の牢に囚われておるという'],
  iga: ['伊賀の者は、忍びの術を使うと聞く', '比自山の砦には、伊賀の者が集まっておる', '藪の中から不意に槍が出る。気をつけよ', '二年前、信雄様は伊賀で大負けしたそうな'],
  tottori: ['鳥取の城には、兵と町の者が四千も籠もっておる', '羽柴様は、先に因幡の米を高値で買い占めたそうな', '城の中の者は、もう草も食い尽くしたらしい', '夜に城から抜け出す者がおる'],
  takato: ['高遠の城主は、信玄公の五男じゃ。降らぬと言うておるらしい', '城は崖の上。門を破らねば入れん', '降れという使者を、城主は追い返したと聞いた', '信忠様は、自ら塀に上られるおつもりらしい'],
  tano: ['勝頼公は、天目山へ向かっておるらしい', '武田の家臣は、次々と逃げたそうな', '最後まで従う者は、もう数十人と聞く', '山道は狭い。一人ずつしか通れん'],
  honnoji: ['殿は京の本能寺に、少ない供で泊まられるそうじゃ', '明智様の軍勢も、中国へ向かうため丹波で支度をしておるとか', '明智様の軍勢が、なぜか東へ向かったという噂がある', '京の町は、夜明けに鐘が鳴るまで誰も起きておらん'],
};

// 上役から受ける次の任務
const MISSIONS = {
  moribe: { title: '美濃・森部へ', text: '斎藤義龍が急死した。殿は美濃へ兵を出される。その方には五人を付ける。先手の横を突く役じゃ。' },
  sunomata: { title: '墨俣の砦普請を守れ', text: '長良川の西、墨俣に砦を築く。普請を任されたのは木下藤吉郎じゃ。斎藤勢の邪魔が入る。組を率いて守り抜け。' },
  inabayama: { title: '稲葉山城を囲め', text: '三人衆が味方についた。殿はすぐに稲葉山を囲まれる。藤吉郎の手に入り、夜明けに井口の町へ入れ。' },
  mitsukuri: { title: '南近江・箕作城へ', text: '殿は将軍様を奉じて京へ上られる。道をふさぐ六角の箕作城を、夕暮れから攻める。藤吉郎の手に入れ。' },
  kanegasaki: { title: '越前・朝倉攻め', text: '殿は将軍の命として越前の朝倉を攻める。藤吉郎殿の手に加わり、敦賀の金ヶ崎へ向かえ。' },
  anegawa: { title: '近江・姉川へ', text: '裏切った浅井を討つ。徳川殿と共に姉川に陣を布く。森可成殿の手に入り、下知を待って川を渡れ。' },
  nodafukushima: { title: '摂津・野田と福島へ', text: '三好三人衆が摂津の野田・福島に砦を構えた。前田利家殿の手に入り、砦を囲め。' },
  shiga: { title: '近江・宇佐山城を守れ', text: '浅井・朝倉の大軍が坂本へ出た。宇佐山城を守る森家の各務元正殿の手に入り、城を守り抜け。' },
  hieizan: { title: '坂本から比叡山へ', text: '延暦寺は浅井・朝倉をかくまい、中立の求めにも応じなかった。明智光秀殿の手に入り、山道を上れ。' },
  mikatagahara: { title: '遠江・三方ヶ原へ', text: '武田信玄が遠江へ入った。殿は徳川殿へ加勢を送られる。佐久間信盛殿の手に入り、徳川勢と共に武田を迎えよ。' },
  tonezaka: { title: '越前・刀根坂へ', text: '朝倉が退き始めた。殿は自ら追われる。柴田勝家殿の手に入り、刀根坂で朝倉勢に追いすがれ。' },
  odani: { title: '北近江・小谷城へ', text: '朝倉は滅んだ。残るは小谷の浅井。羽柴秀吉殿の手に入り、夜のうちに京極丸へ攻め上れ。' },
  nagashima: { title: '伊勢・長島へ', text: '三度目の長島攻めじゃ。柴田勝家殿の手に入り、岸に柵を結うて門徒を防げ。' },
  shitaragahara: { title: '三河・設楽原へ', text: '武田勝頼が長篠城を囲んだ。殿は三河へ出陣される。前田利家殿の手に入り、鉄砲奉行の柵の内を守れ。' },
  echizen: { title: '越前・木ノ芽峠へ', text: '一揆に奪われた越前を取り戻す。明智光秀殿の手に入り、木ノ芽峠の砦を破れ。' },
  iwamura: { title: '美濃・岩村城へ', text: '信忠様が岩村城を囲んでおられる。河尻秀隆殿の手に入り、水晶山の陣を守れ。城兵の夜討ちに備えよ。' },
  tennoji: { title: '摂津・天王寺へ', text: '天王寺の砦が本願寺勢に囲まれた。明智光秀殿を救いに、殿が自ら出られる。囲みを破れ。' },
  saika: { title: '紀伊・雑賀へ', text: '本願寺に鉄砲衆を送る雑賀を攻める。堀秀政殿の手に入り、小雑賀川を渡れ。' },
  tedorigawa: { title: '加賀・手取川へ', text: '七尾城の後詰に北へ向かう。柴田勝家殿の手に入れ。上杉謙信が出てきたら、無理をせず退け。' },
  shigisan: { title: '大和・信貴山城へ', text: '松永久秀が背いた。信忠様の軍に入り、信貴山城を攻め落とせ。' },
  kizugawa: { title: '大坂の沖・木津川口へ', text: '毛利の水軍が大坂へ兵糧を運ぶ。九鬼嘉隆殿の大船に乗り、これを防げ。' },
  miki: { title: '播磨・三木へ', text: '毛利が三木城へ兵糧を運び込もうとしている。羽柴秀吉殿の手に入り、大村で防げ。' },
  arioka: { title: '摂津・有岡城へ', text: '背いた荒木村重の有岡城を落とす。滝川一益殿の手に入り、惣構えを破れ。' },
  iga: { title: '伊賀・比自山へ', text: '伊賀へ四方から攻め入る。丹羽長秀殿の手に入り、比自山の砦を落とせ。' },
  tottori: { title: '因幡・鳥取城へ', text: '羽柴秀吉殿が鳥取城を囲んでおられる。柵を守り、城への兵糧を断て。' },
  takato: { title: '甲州征伐・高遠城へ', text: '武田を攻める。信濃の高遠城だけが降らぬ。信忠様の軍の、森長可殿の手に入れ。' },
  tano: { title: '甲斐・田野へ', text: '武田勝頼が天目山へ逃れた。滝川一益殿の手に入り、田野で追いつけ。' },
  honnoji: { title: '京へ', text: '殿は中国攻めの前に京へ入られる。信忠様の供として京へ上れ。' },
};

// 人物録（at：その戦の城下から載る）
const PEOPLE = [
  { k: 'nobunaga', n: '織田信長', r: '尾張の大名', t: '桶狭間で今川義元を破り、名を天下に知られる。手柄を立てた者を身分に関わりなく取り立てる。', mon: 'oda' },
  { k: 'genpachi', n: '源八', r: '組頭', t: '桶狭間での最初の上官。口は悪いが面倒見がよい。「首は捨てよ」の下知を叩き込んだ男。', mon: 'oda' },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', t: '同じ組で槍を並べた同輩。気のいい男で、何かと話しかけてくる。', mon: 'oda' },
  { k: 'tokichiro', n: '木下藤吉郎', r: '普請奉行', t: '草履取りから身を起こしたと噂される男。口が達者で、妙に人に好かれる。のちの羽柴秀吉。', at: 'sunomata', mon: 'oda' },
  { k: 'mori', n: '森可成', r: '織田の宿老', t: '美濃攻めから仕える古参の槍の名手。「攻めの三左」と呼ばれた。', at: 'anegawa', mon: 'oda' },
  { k: 'akechi', n: '明智光秀', r: '織田の将', t: '将軍の家臣から織田に仕えた、学のある将。鉄砲にも城普請にも通じる。', at: 'hieizan', mon: 'akechi' },
  { k: 'toshiie', n: '前田利家', r: '鉄砲奉行', t: '若い頃は「槍の又左」と呼ばれた赤母衣衆の筆頭。設楽原では鉄砲衆を預かる。', at: 'shitaragahara', mon: 'maeda' },
  { k: 'shibata', n: '柴田勝家', r: '織田の宿老', t: '「鬼柴田」と呼ばれた猛将。はじめは信長の弟に仕え、のちに織田家の筆頭となる。', at: 'nagashima', mon: 'oda' },
  { k: 'nagayoshi', n: '森長可', r: '織田の将', t: '森可成の子。父に劣らぬ荒武者で「鬼武蔵」と呼ばれた。', at: 'takato', mon: 'oda' },
  { k: 'nobutada', n: '織田信忠', r: '織田家の嫡男', t: '信長の嫡男。甲州征伐の総大将として、自ら高遠城の塀に取り付いたという。', at: 'takato', mon: 'oda' },
  { k: 'yoshimoto', n: '今川義元', r: '駿河・遠江・三河の大名', t: '「海道一の弓取り」と呼ばれた大大名。桶狭間で討たれた。', mon: 'imagawa' },
];

const REL = [['genpachi', '源八'], ['yashichi', '弥七'], ['tokichiro', '藤吉郎'], ['mori', '森可成'], ['akechi', '明智光秀'], ['toshiie', '前田利家'], ['shibata', '柴田勝家'], ['nagayoshi', '森長可'], ['nobutada', '織田信忠']];
export const ODA_REL_NAME = { mori: '森可成', akechi: '明智光秀', toshiie: '前田利家', shibata: '柴田勝家', nagayoshi: '森長可', nobutada: '織田信忠' };

// 城下での会話（上役の屋敷 boss・宿 inn）。n：名、last：前の戦の結果
function talks(G, i, last) {
  const id = BATTLES[i] && BATTLES[i].id;
  const n = G.name;
  const viol = last && last.lines.some((l) => l.label === '命令違反');
  const T = [];
  if (id === 'moribe') {
    const headV = last && last.lines.some((l) => l.label === '命令違反' && String(l.detail).includes('首'));
    T.push({ id: 'o_gen1', who: '組頭 源八', rel: 'genpachi', at: 'boss',
      lines: [headV ? `${n}、首は捨てよと言うたのを忘れたか。……まあよい、よう戦うた` : `${n}、桶狭間ではよう働いた。わしも鼻が高いわ`, '次の美濃攻めで、お主に五人付ける。組頭の真似事じゃ。うまくやれば、殿のお耳にも入れてやる'],
      choices: [
        { t: '源八殿のお引き立てのおかげにございます', fx: { like: 6 }, sup: 3, reply: 'はっは、口の上手い奴め。次も頼むぞ' },
        { t: '五人、一人も死なせませぬ', fx: { trust: 6, respect: 2 }, reply: 'その意気じゃ。じゃが命あっての物種ぞ' },
      ] });
    T.push({ id: 'o_ya1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、聞いたか。お主、五人を預かるそうじゃな`, '桶狭間の褒美で、問屋で槍持ちを雇う者もおるそうな。わしは酒で消えたがのう'],
      choices: [
        { t: '弥七、お主も銭を貯めよ', fx: { like: 4 }, reply: 'わかっとる、わかっとる。……次の戦の後でな' },
        { t: '次の戦も、槍を並べよう', fx: { like: 6, trust: 3 }, reply: 'おう！　お主の横なら心強いわ' },
      ] });
  } else if (id === 'sunomata') {
    T.push({ id: 'o_tok1', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`おお、そなたが${n}か。森部で横槍を入れたと聞いたぞ`, viol ? 'じゃが合図より先に動いたとか。わしの砦では、それは困る。待つのも仕事じゃ' : 'わしは墨俣に砦を建てる。材木は川で流して運ぶ。そなたの組には、その普請を守ってもらいたい'],
      choices: [
        { t: '藤吉郎殿の砦、必ず守り抜きます', fx: { like: 6, trust: 4 }, sup: 3, reply: 'よう言うてくれた！　砦ができたら、そなたの名も殿に申し上げる' },
        { t: '本当に一夜で砦が建ちますか', fx: { trust: 3, wary: 2 }, reply: 'はっは、一夜はちと大げさじゃ。じゃが早いぞ、わしの普請は' },
      ] });
    T.push({ id: 'o_ya2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['小牧山の町は新しゅうて、どこも木の香りがするのう', '藤吉郎という男、草履取りから成り上がったとかで、口が達者で妙に人に好かれるそうじゃ'],
      choices: [
        { t: '会ってみたいものだ', fx: { like: 3 }, reply: 'お主と気が合うかもしれんな。どっちも成り上がり者じゃ' },
        { t: '口先だけの男ではないか', fx: { trust: 3 }, reply: 'さあのう。じゃが殿はそういう者を好まれるからの' },
      ] });
  } else if (id === 'kanegasaki') {
    T.push({ id: 'o_tok2', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`${n}、墨俣からこのかた、ようわしに付いて来てくれた`, '次は越前の朝倉攻めじゃ。わしの手に来い。……何やら胸騒ぎがするがのう'],
      choices: [
        { t: 'どこへなりとお供します', fx: { like: 6, trust: 3 }, sup: 3, reply: 'うむ。そなたのような者がおると、わしも心強い' },
        { t: '胸騒ぎとは、何でございますか', fx: { trust: 4, respect: 2 }, reply: '北近江の浅井よ。朝倉とは古い付き合いじゃ。……退き道は覚えておけ' },
      ] });
    T.push({ id: 'o_ya3', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['岐阜の問屋は大したもんじゃ。鉄砲まで並んでおる', '一挺三十貫と聞いた。わしの禄では何年かかるかのう'],
      choices: [
        { t: 'いずれ組に鉄砲を持たせたい', fx: { like: 3, trust: 3 }, reply: 'お主ならやりかねんな。その時はわしに撃たせてくれ' },
        { t: '槍の方が性に合う', fx: { like: 5 }, reply: 'はっは、わしもじゃ。火縄は雨に弱いしのう' },
      ] });
  } else if (id === 'anegawa') {
    T.push({ id: 'o_tok3', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`${n}、金ヶ崎の退き口、ようわしの後ろを守ってくれた`, '次は浅井を討つ。わしは横山の備えに回る。そなたは森可成殿の手に入れ。槍の名手じゃ、学ぶことは多いぞ'],
      choices: [
        { t: '藤吉郎殿のおかげで命拾いしました', fx: { like: 6, trust: 4 }, sup: 3, reply: '何を申す。命拾いしたのはわしの方じゃ' },
        { t: '森殿の下で、手柄を立ててまいります', fx: { respect: 4, trust: 2 }, reply: 'うむ。「攻めの三左」の槍を、よう見ておけ' },
      ] });
  } else if (id === 'hieizan') {
    T.push({ id: 'o_ake1', who: '明智光秀', rel: 'akechi', at: 'boss',
      lines: [`${n}か。姉川での働き、森殿から聞いておった。……その森殿も、宇佐山で討たれた`, '比叡山を攻める。刃向かう僧兵は討つ。じゃが、下知なく逃げる者を追うな。わしの手では、それを守ってもらう'],
      choices: [
        { t: '下知は必ず守ります', fx: { trust: 6, respect: 2 }, sup: 3, reply: 'うむ。その方のような者を探しておった' },
        { t: '山を焼くのは、心が痛みます', fx: { like: 4, wary: 2 }, reply: '……わしもじゃ。されど、これが戦よ。心を痛める者だけが、手を止めることもできる' },
      ] });
    T.push({ id: 'o_ya4', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['森様が討たれたと聞いて、わしは泣いた', 'お主はもう組を率いる身じゃ。……わしらのことも、忘れんでくれよ'],
      choices: [
        { t: '忘れるものか。わしらは桶狭間からの仲じゃ', fx: { like: 8, trust: 4 }, reply: 'へへ……そうじゃな。雨の中で、ずぶ濡れで走ったのう' },
        { t: '湿っぽいのはやめじゃ、飲め', fx: { like: 5 }, reply: 'おう、今日はお主のおごりじゃな！' },
      ] });
  } else if (id === 'shitaragahara') {
    T.push({ id: 'o_tos1', who: '前田利家', rel: 'toshiie', at: 'boss',
      lines: [`${n}、これまでの働きは聞いておる。${RANKS[G.rank].name}まで来たか`, '設楽原では、わしら五人の鉄砲奉行が柵の内の鉄砲を預かる。その方の組は、わしの持ち場の槍じゃ。撃ち漏らしを突き落とせ'],
      choices: [
        { t: '槍の又左殿の下で戦えるとは', fx: { like: 6, respect: 3 }, sup: 3, reply: 'はっは、昔の名よ。今は鉄砲の世じゃ。……じゃが、最後に柵を守るのは槍ぞ' },
        { t: '鉄砲の撃ち方も、学びとうございます', fx: { trust: 5 }, reply: 'よかろう。放つ前によう引きつけること。それだけじゃ' },
      ] });
  } else if (id) {
    // これから足す戦の城下（中身がまだ無い時の決まり文句）
    const b = BATTLES[i];
    T.push({ id: `o_gen_${id}`, who: b.boss || '上役', rel: b.rel || 'genpachi', at: 'boss',
      lines: [`${n}、次は${b.name.replace(/の戦い$/, '')}じゃ。${b.place}へ向かう`, '備えを整えておけ'],
      choices: [{ t: '承知いたしました', fx: { trust: 3 }, sup: 2, reply: 'うむ。励め' }] });
  }
  return T;
}

// 次の戦の作戦図（森部・墨俣は前からある図。screens.js から渡してもらう）
// ほかの戦は、地形（t）と、自分の持ち場（you）・敵の向き（foe）・やる事（go）の一枚の墨絵にする
let oldDiagram = () => '';
export function setOdaDiagram(f) { oldDiagram = f; }
const DIAG = {
  inabayama: { t: 'castle', you: '井口の町', foe: '稲葉山城', go: '夜明けに町へ入り、大手口へ' },
  mitsukuri: { t: 'castle', you: '麓の陣', foe: '箕作城', go: '夕暮れから木戸を破って上る' },
  kanegasaki: { t: 'retreat', you: '殿の後ろ', foe: '朝倉の追っ手', go: '背を守りながら南へ退く' },
  anegawa: { t: 'river', you: '南の岸', foe: '浅井勢', go: '下知を待って川を渡る' },
  nodafukushima: { t: 'fort', you: '竹束の陰', foe: '野田・福島の砦', go: '堤を上り、砦を囲む', attack: true },
  shiga: { t: 'fort', you: '宇佐山城', foe: '浅井・朝倉の大軍', go: '城の坂を守り抜く' },
  hieizan: { t: 'hill', you: '坂本の麓', foe: '山上の僧兵', go: '山道を上る。逃げる者は追わない' },
  mikatagahara: { t: 'field', you: '徳川勢の横', foe: '武田勢', go: '寄せる騎馬を受け止める' },
  tonezaka: { t: 'hill', you: '追い手', foe: '退く朝倉勢', go: '峠道で追いすがる', chase: true },
  odani: { t: 'castle', you: '尾根の下', foe: '京極丸', go: '夜のうちに尾根を上る' },
  nagashima: { t: 'river', you: '岸の柵', foe: '舟の門徒', go: '柵を結い、舟で着く者を防ぐ', hold: true },
  shitaragahara: { t: 'fort', you: '柵の内', foe: '武田の騎馬', go: '撃ち漏らしを槍で突き落とす' },
  echizen: { t: 'hill', you: '峠の下', foe: '一揆の砦', go: '雨の峠を上って砦を破る' },
  iwamura: { t: 'fort', you: '水晶山の陣', foe: '岩村城の城兵', go: '夜討ちを防ぐ' },
  tennoji: { t: 'field', you: '救いの手勢', foe: '本願寺勢の囲み', go: '囲みを破って砦へ' },
  saika: { t: 'river', you: '南へ向かう手勢', foe: '雑賀の鉄砲衆', go: '小雑賀川を渡る' },
  tedorigawa: { t: 'retreat', you: '柴田勢', foe: '上杉勢', go: '川を背にせず退く' },
  shigisan: { t: 'castle', you: '麓の陣', foe: '信貴山城', go: '曲輪を一つずつ取る' },
  kizugawa: { t: 'sea', you: '九鬼の大船', foe: '毛利の小早', go: '船べりに取り付く敵を防ぐ' },
  miki: { t: 'field', you: '付け城の手勢', foe: '毛利の兵糧方', go: '大村で兵糧入れを防ぐ' },
  arioka: { t: 'castle', you: '惣構えの外', foe: '有岡城', go: '惣構えの木戸を破る' },
  iga: { t: 'hill', you: '谷の口', foe: '比自山の砦', go: '藪に気をつけて上る' },
  tottori: { t: 'fort', you: '囲みの柵', foe: '鳥取城', go: '城から出る者を防ぐ' },
  takato: { t: 'castle', you: '崖の下', foe: '高遠城', go: '門を破って曲輪へ' },
  tano: { t: 'hill', you: '追い手', foe: '武田勝頼の一行', go: '山道で追いつく', chase: true },
  honnoji: { t: 'town', you: '京の町', foe: '明智の軍勢', go: '辻を抜けて殿の許へ' },
};
function diagram(i) {
  const id = BATTLES[i] && BATTLES[i].id;
  if (id === 'moribe') return oldDiagram(1);
  if (id === 'sunomata') return oldDiagram(2);
  const d = DIAG[id];
  if (!d) return '';
  const blue = (x, y, n = 5) => Array.from({ length: n }, (_, k) => `<rect x="${x + k * 12}" y="${y}" width="9" height="6" fill="#5b7aa6"/>`).join('');
  const red = (x, y, n = 5) => Array.from({ length: n }, (_, k) => `<rect x="${x + k * 12}" y="${y}" width="9" height="6" fill="#c0452e"/>`).join('');
  const ar = (x1, y1, x2, y2, c = '#c2a25a', dash = '') => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#odar${c === '#c2a25a' ? 'k' : 'r'})"/>`;
  let g = '';
  if (d.t === 'river') g = '<path d="M0 70 C 80 62, 200 80, 300 68 V86 C 200 98, 80 80, 0 88 Z" fill="rgba(70,95,105,.5)"/><text x="8" y="100" fill="#8fb0c0" font-size="12">川</text>';
  else if (d.t === 'castle') g = '<path d="M110 60 C 130 26, 170 26, 190 60 Z" fill="rgba(111,138,78,.25)"/><rect x="138" y="22" width="24" height="14" fill="none" stroke="#e36a52" stroke-width="2"/>';
  else if (d.t === 'hill') g = '<path d="M0 150 L150 20 L300 150 Z" fill="rgba(111,138,78,.18)"/><path d="M150 132 C 120 110, 180 90, 150 70 C 130 55, 160 45, 150 30" stroke="rgba(236,228,210,.35)" stroke-dasharray="3 3" fill="none"/>';
  else if (d.t === 'fort') g = `<rect x="${d.attack ? 110 : 95}" y="${d.attack ? 20 : 88}" width="${d.attack ? 80 : 110}" height="${d.attack ? 36 : 40}" fill="none" stroke="#c2a25a" stroke-width="2" stroke-dasharray="2 2"/>`;
  else if (d.t === 'sea') g = '<rect width="300" height="150" fill="rgba(70,95,105,.35)"/><path d="M110 100 H190 L180 118 H120 Z" fill="#2c2821" stroke="#c2a25a"/>';
  else if (d.t === 'town') g = Array.from({ length: 5 }, (_, k) => `<line x1="${30 + k * 60}" y1="0" x2="${30 + k * 60}" y2="150" stroke="rgba(236,228,210,.12)"/>`).join('') + '<rect x="130" y="20" width="40" height="26" fill="none" stroke="#c2a25a" stroke-width="2"/>';
  else if (d.t === 'retreat') g = '<path d="M150 10 C 140 60, 170 100, 150 150" stroke="rgba(236,228,210,.25)" stroke-width="10" fill="none"/>';
  // 敵は上、自分は下
  const foeY = d.t === 'castle' || d.t === 'fort' && d.attack ? 40 : 30;
  let arrows;
  if (d.t === 'retreat') arrows = ar(150, 110, 150, 140) + ar(150, 40, 150, 90, '#e36a52', '4 3');
  else if (d.chase) arrows = ar(150, 110, 150, 58) + ar(150, 40, 150, 12, '#e36a52', '4 3');
  else if (d.hold || d.t === 'fort' && !d.attack || d.t === 'sea') arrows = ar(150, 40, 150, 84, '#e36a52');
  else arrows = ar(150, 110, 150, foeY + 14);
  return `<svg class="mdiag" viewBox="0 0 300 150" width="100%" role="img" aria-label="作戦図：${d.you}から、${d.foe}へ。${d.go}">
    <rect x="0" y="0" width="300" height="150" fill="rgba(111,138,78,.06)"/>${g}
    ${red(120, foeY - 10)}<text x="${d.t === 'retreat' || d.chase ? 180 : 196}" y="${foeY - 2}" fill="#e38a74" font-size="12">${d.foe}</text>
    ${blue(120, 118)}<text x="196" y="126" fill="#a9c1e6" font-size="12">${d.you}（自分）</text>
    ${arrows}<text x="8" y="146" fill="#c2a25a" font-size="12">${d.go}</text>
    <defs><marker id="odark" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#c2a25a"/></marker><marker id="odarr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#e36a52"/></marker></defs>
  </svg>`;
}

// 戦の道のり（尾張・美濃・近江・越前・三河）。印の番号は戦の id から引く（戦が増えても済・次がずれない）
// 遠い国（摂津・播磨・因幡・紀伊・甲斐・信濃・加賀）は、地図の縁に寄せて置く
const PLACES = {
  okehazama: [218, 176, '桶狭間'], moribe: [148, 100, '森部'], sunomata: [176, 116, '墨俣'], kanegasaki: [72, 30, '金ヶ崎'], anegawa: [100, 92, '姉川'],
  hieizan: [44, 150, '比叡山'], shitaragahara: [288, 188, '設楽原'],
  inabayama: [186, 94, '稲葉山'], mitsukuri: [80, 138, '箕作'], odani: [104, 78, '小谷'], nagashima: [168, 186, '長島'], takato: [300, 60, '高遠'], honnoji: [30, 170, '本能寺'], nodafukushima: [22, 214, '野田・福島'],
  shiga: [56, 128, '宇佐山'], mikatagahara: [306, 226, '三方ヶ原'], tonezaka: [86, 50, '刀根坂'], echizen: [56, 14, '木ノ芽峠'], iwamura: [256, 104, '岩村'],
  tennoji: [34, 232, '天王寺'], saika: [12, 244, '雑賀'], tedorigawa: [120, 10, '手取川'], shigisan: [60, 222, '信貴山'], kizugawa: [10, 226, '木津川口'],
  miki: [8, 196, '三木'], arioka: [40, 204, '有岡'], iga: [100, 200, '伊賀'], tottori: [8, 180, '鳥取'], tano: [306, 36, '田野'],
};
const HOMES = { 清洲: [192, 144], 小牧山: [206, 126], 岐阜: [184, 96], 安土: [70, 120] };
// 動きを減らす：ゲームの設定か OS の設定（screens.js の RM と同じ）
const RMo = () => !!S.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function map(G) {
  const next = G.battle;
  const nodes = BATTLES.map((b, i) => ({ b: i, p: PLACES[b.id] })).filter((d) => d.p);
  const home = (BATTLES[next] && BATTLES[next].town) || (BATTLES[BATTLES.length - 1] || {}).town || '清洲';
  const H = HOMES[home] || HOMES.清洲;
  const rm = RMo();
  // 読み上げ：済んだ戦・次の戦・本拠
  const doneN = nodes.filter((d) => d.b < next).map((d) => d.p[2]);
  const curN = nodes.find((d) => d.b === next);
  const label = `戦の道のり。済：${doneN.length ? doneN.join('・') : 'まだない'}。次：${curN ? curN.p[2] : 'なし'}。本拠：${home}`;
  // 名を書くのは、済んだ戦と次の戦だけ（先の戦は小さな点だけにして、地図を名で埋めない）
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%" role="img" aria-label="${label}">
    <text x="16" y="26" fill="#9a917f" font-size="12">越前</text><text x="16" y="120" fill="#9a917f" font-size="12">近江</text><text x="210" y="70" fill="#9a917f" font-size="12">美濃</text><text x="240" y="150" fill="#9a917f" font-size="12">尾張</text><text x="262" y="244" fill="#9a917f" font-size="12">三河</text>
    <path d="M60 110 C 50 140, 60 180, 80 200" stroke="#4f6f86" stroke-width="7" fill="none" opacity=".35"/><text x="84" y="176" fill="#8fa7ba" font-size="12">琵琶湖</text>
    <path d="M150 20 C 170 80, 180 140, 175 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".55"/>
    <path d="M230 20 C 210 90, 200 150, 200 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".45"/>
    ${nodes.filter((d) => d.b <= next).map((d) => `<line x1="${H[0]}" y1="${H[1]}" x2="${d.p[0]}" y2="${d.p[1]}" stroke="rgba(194,162,90,.22)" stroke-dasharray="3 3"/>`).join('')}
    <rect x="${H[0] - 6}" y="${H[1] - 6}" width="12" height="12" fill="#ece4d2" stroke="#14120f" stroke-width="2"/><text x="${H[0]}" y="${H[1] - 12}" fill="#ece4d2" font-size="12" text-anchor="middle">${home}</text>
    ${nodes.map((d) => {
      const done = d.b < next, cur = d.b === next;
      if (!done && !cur) return `<circle cx="${d.p[0]}" cy="${d.p[1]}" r="4" fill="none" stroke="#8a8170" stroke-width="1.5"/>`;
      return `<g><circle cx="${d.p[0]}" cy="${d.p[1]}" r="${cur ? 8 : 6}" fill="${done ? '#c2a25a' : '#c0452e'}" stroke="#14120f" stroke-width="2">${cur && !rm ? '<animate attributeName="r" values="8;11;8" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      ${cur ? `<text x="${d.p[0]}" y="${d.p[1] + 22}" fill="#f3e6c4" font-size="13" text-anchor="middle">${d.p[2]}　次</text>` : `<text x="${d.p[0]}" y="${d.p[1] + 18}" fill="#b9b09c" font-size="12" text-anchor="middle">${d.p[2]}</text>`}</g>`;
    }).join('')}
  </svg>`;
}

// 見出しの季節（'春'|'夏'|'秋'|'冬'）。見出しの字か、月の数から
const MON = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
export function seasonOf(when) {
  const w = String(when || '');
  for (const k of ['春', '夏', '秋', '冬']) if (w.includes(k)) return k;
  const m = MON.slice().reverse().find((x) => w.includes(`${x}月`));
  if (!m) return '春';
  const n = MON.indexOf(m) + 1;
  return n <= 3 ? '春' : n <= 6 ? '夏' : n <= 9 ? '秋' : '冬';
}
// 前の戦からの年月（「森部の戦いから五年」）
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const yearOf = (b) => { const m = /（(\d+)）/.exec((b && b.year) || ''); return m ? +m[1] : null; };
function gapLine(i) {
  if (i <= 0) return '';
  const a = yearOf(BATTLES[i - 1]), b = yearOf(BATTLES[i]);
  if (a == null || b == null) return '';
  const n = b - a;
  const prev = BATTLES[i - 1].name.replace(/の戦い$/, '');
  if (n <= 0) return `${prev}から、まだ間もない`;
  return `${prev}から${n <= 10 ? KAN[n] : n}年`;
}

// 手前の町並み（町家・暖簾・看板・行き交う人・荷車・土埃）。見出しの絵の右手前に重ねる
// 動きは CSS の transform だけ（軽い）。「動きを減らす」では止まって、そのままの一枚絵になる
// 人と荷車は時計で位置を決めるので、施設の札を替えて描き直しても歩みが途切れない
const STREET_CSS = `<style>
  .otw .otw-go { animation: otwGo linear infinite; }
  .otw .otw-bob { animation: otwBob .5s ease-in-out infinite alternate; }
  .otw .otw-nr { transform-box: fill-box; transform-origin: 50% 0; animation: otwSway 4.5s ease-in-out infinite alternate; }
  .otw .otw-wh { transform-box: fill-box; transform-origin: 50% 50%; animation: otwTurn 2.6s linear infinite; }
  .otw .otw-dust { transform-box: fill-box; transform-origin: 100% 100%; animation: otwDust 1.8s ease-out infinite; opacity: 0; }
  .otw .otw-haze { animation: otwHaze 16s ease-in-out infinite alternate; }
  .otw .otw-lamp { opacity: .3; } .otw .otw-glow { opacity: 0; } .otw .otw-dusk { opacity: 0; }
  .tod-0 .otw .otw-lamp { opacity: 1; } .tod-0 .otw .otw-glow { opacity: .3; } .tod-0 .otw .otw-dusk { opacity: .32; }
  .tod-2 .otw .otw-morn { opacity: .06; }
  @keyframes otwGo { from { transform: translateX(var(--a)); } to { transform: translateX(var(--b)); } }
  @keyframes otwBob { to { transform: translateY(-.7px); } }
  @keyframes otwSway { from { transform: skewX(-5deg); } to { transform: skewX(4deg); } }
  @keyframes otwTurn { to { transform: rotate(360deg); } }
  @keyframes otwDust { 0% { opacity: 0; transform: scale(.5); } 25% { opacity: .5; } 100% { opacity: 0; transform: translateX(-9px) scale(2.2); } }
  @keyframes otwHaze { from { transform: translateX(-40px); opacity: .5; } to { transform: translateX(50px); opacity: 1; } }
  body.rm .otw *, body.rm .otw { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { .otw *, .otw { animation: none !important; } }
</style>`;
// 行き交う人（足元を原点に、高さ十二ほど）。kind：kasa 笠の町人・pole 天秤棒の物売り・sam 二本差しの侍・onna 被衣の女
function walker(kind, c) {
  const legs = '<path d="M-1 -4.6 L-1.8 0 M1 -4.6 L1.8 0" stroke="#0e0c0a" stroke-width="1.1"/>';
  const head = '<circle cx="0" cy="-10.4" r="1.4" fill="#2a2019"/>';
  if (kind === 'onna') return `<path d="M-2.6 0 L-2 -8.6 L2 -8.6 L2.6 0 Z" fill="${c}"/><path d="M-2.4 -8 C-2.6 -11.6, 2.6 -12.4, 2.4 -8 Z" fill="#8a7a64"/>`;
  let g = `${legs}<path d="M-2.6 -4.4 L-2 -9 L2 -9 L2.6 -4.4 Z" fill="${c}"/>${head}`;
  if (kind === 'sam') g += '<path d="M-0.4 -11.8 h1.4 v1" stroke="#0e0c0a" stroke-width=".9" fill="none"/><path d="M1.8 -6.6 L-4.8 -4.6 M1.6 -5.8 L-3.4 -4.4" stroke="#0e0c0a" stroke-width=".9"/>';
  else g += '<path d="M-3.8 -10.6 L0 -13.2 L3.8 -10.6 Z" fill="#7a6644"/>';
  if (kind === 'pole') g += '<path d="M-7 -9.6 L7 -9.2" stroke="#6b5434" stroke-width=".9"/><path d="M-7 -9.6 V-6 M7 -9.2 V-6" stroke="#6b5434" stroke-width=".5"/><rect x="-8.6" y="-6" width="3.4" height="2.6" fill="#8a7248"/><rect x="5.2" y="-6" width="3.4" height="2.6" fill="#8a7248"/>';
  return g;
}
// 荷車（俵を積み、前で一人が曳く）。dust：車輪の後ろに土埃
function cart(dust = true) {
  const wheel = (x) => `<g transform="translate(${x} -4)"><g class="otw-wh"><circle r="4" fill="none" stroke="#1a140e" stroke-width="1.1"/><path d="M-4 0 H4 M0 -4 V4 M-2.8 -2.8 L2.8 2.8 M-2.8 2.8 L2.8 -2.8" stroke="#1a140e" stroke-width=".55"/></g></g>`;
  const puff = (x, d) => `<ellipse class="otw-dust" cx="${x}" cy="-1.2" rx="3" ry="1.4" fill="#a08c6c" style="animation-delay:${d}s"/>`;
  return `${dust ? puff(-14, 0) + puff(-10, 0.6) + puff(-16, 1.2) : ''}<rect x="-15" y="-9" width="22" height="2" fill="#5a4630"/>
    <ellipse cx="-10" cy="-11.4" rx="4.2" ry="2.5" fill="#9a8456"/><ellipse cx="-2.4" cy="-11.4" rx="4.2" ry="2.5" fill="#8e7a4e"/><ellipse cx="-6.2" cy="-14.8" rx="4.2" ry="2.5" fill="#a38d5e"/>
    <path d="M-10.4 -11.4 H-9.6 M-2.8 -11.4 H-2" stroke="#5a4a2e" stroke-width="3"/>
    ${wheel(-10)}${wheel(2)}<path d="M7 -8 L14.5 -7.2" stroke="#3a2e20" stroke-width="1"/><g transform="translate(16.5 0)"><g class="otw-bob">${walker('kasa', '#4a3e30')}</g></g>`;
}
// 動くもの一つ：x0 に置き、from→to を dur 秒で歩む。left なら右から左へ（向きも裏返す）
const T0 = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
function mover(x0, y, dur, inner, left = false, s = 0.9) {
  const a = left ? 640 - x0 : 220 - x0, b = left ? 220 - x0 : 640 - x0;
  // いまの時刻から、歩みの途中の位置を決める（描き直しても同じ所から続く）
  const off = (T0() + x0 * 0.37) % dur;
  return `<g transform="translate(${x0} ${y}) scale(${s})"><g class="otw-go" style="--a:${a / s}px;--b:${b / s}px;animation-duration:${dur}s;animation-delay:-${off.toFixed(1)}s"><g${left ? ' transform="scale(-1 1)"' : ''}>${inner}</g></g></g>`;
}
// 町家一軒：厨子二階（虫籠窓）・庇・格子・暖簾・吊り看板。sign は看板の字、nc は暖簾の色
function machiya(x, w, sign, nc, lamp = true) {
  const eave = 106, base = 124;
  let g = `<path d="M${x - 3} 95 L${x + 2} 91 H${x + w - 2} L${x + w + 3} 95 Z" fill="#100e0b"/>
    <rect x="${x}" y="95" width="${w}" height="${eave - 95}" fill="#2c261d"/><rect x="${x + w * 0.22}" y="97.6" width="${w * 0.56}" height="4.4" fill="url(#otwKoshi)"/>
    <path d="M${x - 5} ${eave + 1.5} L${x - 1} ${eave - 2} H${x + w + 1} L${x + w + 5} ${eave + 1.5} Z" fill="#100e0b"/>
    <rect x="${x}" y="${eave + 1.5}" width="${w}" height="${base - eave - 1.5}" fill="#1f1a14"/>
    <rect x="${x + w * 0.58}" y="${eave + 4}" width="${w * 0.34}" height="${base - eave - 6}" fill="url(#otwKoshi)"/>`;
  // 暖簾（三枚に割れた布が風に揺れる）
  const nx = x + w * 0.1, nw = w * 0.4, pw = nw / 3;
  g += `<rect x="${nx}" y="${eave + 1.5}" width="${nw}" height="${base - eave - 1.5}" fill="#0b0a08"/>`;
  g += `<g class="otw-nr">${[0, 1, 2].map((k) => `<rect x="${nx + k * pw + 0.3}" y="${eave + 1.6}" width="${pw - 0.6}" height="9" fill="${nc}"/>`).join('')}<circle cx="${nx + nw / 2}" cy="${eave + 5.6}" r="2" fill="none" stroke="#e8dcc0" stroke-width=".7" opacity=".85"/></g>`;
  // 吊り看板（字は縦に）
  if (sign) {
    const sx = x + w * 0.62, h = 5 + sign.length * 6.2;
    g += `<rect x="${sx}" y="${eave + 2}" width="7.4" height="${h}" fill="#b39468"/><rect x="${sx}" y="${eave + 2}" width="7.4" height="${h}" fill="none" stroke="#3a2c18" stroke-width=".6"/>
      <g font-size="5.6" fill="#1b140c" text-anchor="middle" style="font-family:var(--display),serif;font-weight:800">${[...sign].map((ch, k) => `<text x="${sx + 3.7}" y="${eave + 8.2 + k * 6.2}">${ch}</text>`).join('')}</g>`;
  }
  if (lamp) g += `<circle class="otw-glow" cx="${x + w - 3}" cy="${eave + 4.6}" r="3.6" fill="#f0a040"/><rect class="otw-lamp" x="${x + w - 4.4}" y="${eave + 2.4}" width="2.8" height="4.4" rx="1.2" fill="#e8a24a"/>`;
  return g;
}
// 俵と樽の山
const goods = (x) => `<ellipse cx="${x}" cy="121.6" rx="4.4" ry="2.6" fill="#9a8456"/><ellipse cx="${x + 8}" cy="121.6" rx="4.4" ry="2.6" fill="#8a7648"/><ellipse cx="${x + 4}" cy="117.4" rx="4.4" ry="2.6" fill="#a38d5e"/>
  <rect x="${x + 14}" y="116" width="6" height="8" rx="1" fill="#4a3624"/><path d="M${x + 14} 118.4 H${x + 20} M${x + 14} 121.6 H${x + 20}" stroke="#1a140e" stroke-width=".6"/>`;
// 町ごとの看板の字
const SIGNS = { 清洲: ['酒', '米', '油', '塩'], 小牧山: ['市', '材木', '塩', '酒'], 岐阜: ['楽市', '紙', '刃物', '酒'], 安土: ['楽市', '南蛮', '茶', '紙'] };
const NOREN = ['#2b3f5c', '#7a3b22', '#4f4030', '#2b3f5c', '#5a2a24'];
function street(home, tab) {
  const S0 = SIGNS[home] || SIGNS['清洲'];
  const defs = '<defs><pattern id="otwKoshi" width="2.2" height="4" patternUnits="userSpaceOnUse"><rect width="2.2" height="4" fill="#15120e"/><rect width=".8" height="4" fill="#3e3326"/></pattern></defs>';
  // 通り（土の道・轍・漂う土埃）
  let g = `<rect class="otw-dusk" x="-400" width="1000" height="132" fill="#1c1030"/><rect class="otw-morn" x="-400" width="1000" height="132" fill="#e8d8b0" opacity="0"/>
    <path d="M200 123 C 350 121.5, 450 122.5, 600 121 V132 H200 Z" fill="#3a3026"/><path d="M200 127.5 C 300 126.5, 450 128, 600 126.5 M200 130 C 320 129, 470 130.5, 600 129" stroke="#2a221a" stroke-width=".8" fill="none"/>
    <ellipse class="otw-haze" cx="420" cy="124" rx="110" ry="4" fill="#a08c6c" fill-opacity=".16"/>`;
  // 手前の建物（施設の札で、見える所が替わる）
  if (tab === 'boss') {
    // 上官の屋敷：筋塀と長屋門、門番、松
    g += `<rect x="410" y="104" width="190" height="20" fill="#3c362c"/><path d="M406 104 L412 99.5 H600 V104 Z" fill="#100e0b"/>
      <path d="M412 109 H600 M412 113 H600 M412 117 H600" stroke="#6a6150" stroke-width=".6" opacity=".7"/>
      <rect x="440" y="96" width="46" height="28" fill="#1f1a14"/><path d="M432 97 L444 88 H482 L494 97 Z" fill="#100e0b"/><rect x="452" y="104" width="22" height="20" fill="#0b0a08"/>
      <path d="M452 104 V124 M474 104 V124 M463 104 V124" stroke="#3a2e20" stroke-width="1.2"/>
      <g transform="translate(446 124) scale(.9)">${walker('sam', '#2f3a2e')}<path d="M3 -18 L3 0" stroke="#6b5434" stroke-width=".8"/><path d="M2.3 -18 L3 -21 L3.7 -18 Z" fill="#c9c2b0"/></g>
      <path d="M560 124 C 556 110, 566 100, 552 88" stroke="#1e1812" stroke-width="3" fill="none"/>
      <ellipse cx="548" cy="88" rx="16" ry="4.4" fill="#1d2a1d"/><ellipse cx="566" cy="96" rx="12" ry="3.6" fill="#1a261a"/><ellipse cx="540" cy="99" rx="10" ry="3.2" fill="#1d2a1d"/>`;
  } else if (tab === 'toiya') {
    // 問屋：大店・白壁の蔵・俵と樽の山・荷を下ろす荷車
    g += machiya(418, 84, '問屋', NOREN[0])
      + `<rect x="506" y="92" width="40" height="32" fill="#7a7466"/><path d="M502 93 L510 86 H542 L550 93 Z" fill="#100e0b"/><path d="M506 108 H546" stroke="#3a342a" stroke-width="1.6"/><rect x="519" y="110" width="14" height="14" fill="#2c261d"/>`
      + machiya(550, 56, S0[3], NOREN[4]) + goods(486) + goods(556);
  } else {
    const sg = tab === 'shop' ? ['具足', '鍛冶', '槍', S0[0]] : tab === 'stable' ? ['馬具', S0[1], '蹄', S0[0]] : S0;
    g += machiya(420, 50, sg[0], NOREN[0]) + machiya(476, 58, sg[1], NOREN[1]) + machiya(540, 44, sg[2], NOREN[2]) + machiya(590, 50, sg[3], NOREN[3]);
    if (tab === 'shop') g += '<path d="M448 90 C 438 83, 460 77, 444 68" stroke="rgba(200,190,175,.3)" stroke-width="6" fill="none" stroke-linecap="round"/>';
    g += goods(528);
  }
  // 行き交う人と荷車（数は少なく。戦場の兵とは別で、描く物は軽い）
  g += mover(300, 126.5, 34, `<g class="otw-bob">${walker('kasa', '#46546a')}</g>`)
    + mover(470, 127.5, 40, `<g class="otw-bob">${walker('pole', '#4a3a28')}</g>`, true)
    + mover(390, 126, 38, `<g class="otw-bob">${walker('sam', '#4c4254')}</g>`)
    + mover(560, 128, 46, `<g class="otw-bob">${walker('onna', '#5a3a3a')}</g>`, true, 0.85)
    + mover(250, 129, 60, cart(), false, 0.9);
  // 右下を軸に大きく描く（見出しは背が低いので、町の手前をはっきり見せる）
  return `${defs}<g transform="translate(600 132) scale(1.6) translate(-600 -132)">${g}</g>`;
}

// 見出しの絵：その城下（清洲・小牧山・岐阜・安土）の城と町並みの影。季節で空の色を変える
const SKY = {
  春: 'linear-gradient(180deg, #3d3a3a 0%, #6b5a58 50%, #2a2420 100%)',
  夏: 'linear-gradient(180deg, #2c3a36 0%, #4f6252 50%, #1f2420 100%)',
  秋: 'linear-gradient(180deg, #3e3024 0%, #7a5634 52%, #2a2019 100%)',
  冬: 'linear-gradient(180deg, #2c3036 0%, #5a6068 50%, #202226 100%)',
};
function art(i, tab) {
  const b = BATTLES[i] || {};
  const home = b.town || '清洲';
  const season = seasonOf((TOWN[b.id] || {}).when || b.year);
  const hill = (d, c, o = 1) => `<path d="${d}" fill="${c}" opacity="${o}"/>`;
  const keep = (x, y, s, tiers = 2, c = '#15120e') => {
    let g = `<path d="M${x - 22 * s} ${y} L${x - 17 * s} ${y - 12 * s} L${x + 17 * s} ${y - 12 * s} L${x + 22 * s} ${y} Z" fill="${c}"/>`;
    let yy = y - 12 * s, w = 15 * s;
    for (let k = 0; k < tiers; k++) {
      g += `<rect x="${x - w * 0.8}" y="${yy - 9 * s}" width="${w * 1.6}" height="${9 * s}" fill="${c}"/>`;
      g += `<path d="M${x - w * 1.25} ${yy - 8 * s} L${x} ${yy - 16 * s} L${x + w * 1.25} ${yy - 8 * s} Z" fill="${c}"/>`;
      yy -= 11 * s; w *= 0.7;
    }
    return g;
  };
  const roofs = (x0, x1, y, c, seed = 1) => {
    let g = '', x = x0, k = seed;
    while (x < x1) { k = (k * 9301 + 49297) % 233280; const w = 14 + (k % 12), h = 5 + (k % 5); g += `<rect x="${x}" y="${y - h}" width="${w - 2}" height="${h + 8}" fill="${c}"/><path d="M${x - 3} ${y - h} L${x + w / 2 - 1} ${y - h - 6} L${x + w + 1} ${y - h} Z" fill="${c}"/>`; x += w + 1; }
    return g;
  };
  const smoke = (x, y, h) => `<path d="M${x} ${y} C ${x - 10} ${y - h * 0.3}, ${x + 12} ${y - h * 0.55}, ${x - 4} ${y - h}" stroke="rgba(200,190,175,.26)" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  const flags = (xs, y) => xs.map((x) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 16}" stroke="#15120e" stroke-width="1"/><rect x="${x}" y="${y - 16}" width="3.5" height="9" fill="#ece4d2"/>`).join('');
  const shade = '<defs><linearGradient id="odaShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".55" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="600" height="132" fill="url(#odaShade)"/>';
  // 季節の飾り（春は花の霞、秋は紅葉の点、冬は雪の白）
  const deco = season === '春' ? '<ellipse cx="300" cy="96" rx="80" ry="10" fill="rgba(230,190,200,.14)"/>'
    : season === '秋' ? Array.from({ length: 14 }, (_, k) => `<circle cx="${200 + k * 27}" cy="${100 + (k * 7) % 12}" r="3" fill="rgba(190,90,50,.45)"/>`).join('')
      : season === '冬' ? '<path d="M0 116 C 200 110, 400 118, 600 112 V120 C 400 126, 200 118, 0 124 Z" fill="rgba(230,232,236,.22)"/>' : '';
  let inner;
  if (home === '小牧山') inner = `${hill('M0 82 C 120 72, 240 80, 360 74 C 470 68, 540 76, 600 72 V132 H0 Z', '#3a3a30', 0.75)}
    ${hill('M380 132 V100 C 420 70, 450 48, 480 44 C 510 48, 540 70, 580 132 Z', '#1d1813')}${keep(480, 46, 1.1, 2)}
    ${roofs(170, 400, 112, '#1a1712', 5)}${roofs(120, 470, 124, '#15120e', 9)}${smoke(260, 102, 28)}${flags([300, 350], 104)}`;
  else if (home === '岐阜') inner = `${hill('M0 86 C 120 76, 240 84, 360 78 C 470 72, 540 80, 600 76 V132 H0 Z', '#34342a', 0.75)}
    ${hill('M360 132 V104 C 400 60, 430 22, 470 14 C 500 20, 540 70, 600 132 Z', '#1a1612')}${keep(468, 16, 0.9, 3)}
    ${roofs(140, 380, 114, '#1a1712', 7)}${roofs(100, 420, 126, '#15120e', 11)}${smoke(220, 104, 30)}${smoke(330, 106, 24)}
    <path d="M0 128 C 180 122, 360 132, 600 126 V132 H0 Z" fill="#3c4a48" opacity=".7"/>`;
  else if (home === '安土') inner = `<path d="M0 96 C 150 92, 300 98, 600 94 V132 H0 Z" fill="#3a4d56" opacity=".7"/>
    ${hill('M340 110 C 380 70, 420 40, 460 34 C 500 40, 530 70, 570 110 Z', '#1a1612')}${keep(458, 36, 1.3, 4)}
    <rect x="452" y="-2" width="12" height="4" fill="#c2a25a" opacity=".7"/>
    ${roofs(120, 360, 118, '#1a1712', 13)}${smoke(200, 108, 26)}${flags([250, 300, 330], 110)}
    <path d="M0 104 C 150 100, 300 108, 600 102" stroke="rgba(200,215,220,.25)" fill="none"/>`;
  else inner = `${hill('M0 90 C 120 82, 240 88, 360 84 C 470 80, 540 86, 600 82 V132 H0 Z', '#3a3a30', 0.7)}
    ${keep(470, 92, 1.2, 2)}${roofs(150, 430, 112, '#1a1712', 3)}${roofs(110, 480, 124, '#15120e', 7)}${smoke(250, 102, 28)}${smoke(360, 102, 24)}
    <path d="M0 128 C 180 122, 360 132, 600 126 V132 H0 Z" fill="#3c4a48" opacity=".7"/>${flags([320, 420], 104)}`;
  return `<svg class="otw" viewBox="0 0 600 132" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style="position:absolute;inset:0" aria-hidden="true">${STREET_CSS}${inner}${deco}${street(home, tab)}${shade}</svg>`;
}

// 城下の中身を、いまの戦の並び（BATTLES）の番号で引ける形にして返す
export function odaTown() {
  const TOWNS = {}, RUM = {}, MIS = {};
  BATTLES.forEach((b, i) => {
    const t = TOWN[b.id] || { place: `${b.town || '清洲'} 城下`, when: b.year.replace(/（\d+）/, '　').split('　').slice(0, 2).join('　') };
    TOWNS[i] = { ...t, fac: t.fac, sky: SKY[seasonOf(t.when)], season: seasonOf(t.when), gap: gapLine(i) };
    RUM[i] = RUMORS[b.id] || [];
    MIS[i] = MISSIONS[b.id] || { title: `${b.name}へ`, text: `${b.place}へ向かう。${b.boss || '上役'}の手に入り、下知を待て。` };
  });
  const idx = (id) => BATTLES.findIndex((b) => b.id === id);
  const people = PEOPLE.map((p) => ({ ...p, min: p.at ? (idx(p.at) < 0 ? 999 : idx(p.at)) : 0 }));
  return { TOWNS, RUMORS: RUM, MISSIONS: MIS, PEOPLE: people, REL, diagram, map, talks, art };
}
