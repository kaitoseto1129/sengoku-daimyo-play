// 伊達家編「長谷堂城救援（出羽合戦）」（慶長五年九月〔1600〕・出羽国 山形盆地 長谷堂）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e15_hasedo.md（K647・11/25 Sanae）
//   出所：『貞山公治家記録』（B）・山形市の解説（C）。上杉景勝・直江兼続に攻められた最上義光を、政宗が留守政景の援軍で助けた。関ヶ原の結果が届くと、上杉は退いた。数は推（援軍約3千・上杉約2万。clans_75_1121.md の表は1万対2万・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：はじめは向かい風で勢いが乗らない（上限三割）。関ヶ原の知らせが届いて風が追い風に回ると、勢いが乗って上杉を追う。字・札・釦は足さない
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { withCastle } from './light_castle.js';
import { HASEDO_PLAN } from './castles/hasedo.js';
import { HASEDO_LAND, HASEDO_CASTLE_AT, HASEDO_TIMESLIP, hasedoPaddy } from './b_u15_hasedo.js';   // K651：上杉編 u15 の長谷堂の地面と城をそのまま使う（同じ戦は一つの戦場に）
// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に。良い方を元にする」）：前の別の地面（城の無い野と川）をやめ、上杉編 u15 の長谷堂
//   （菅沢山・長谷堂城・道と杉の森）に載せた。伊達の援けは山形の側（東）から来て、城の前で菅沢山から寄せる上杉を受け、
//   関ヶ原の知らせで退く上杉を退き口（u15 の殿の道）まで追う。風は初め向かい（西から東）、知らせの後は追う向き（+z）に回る
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x24323a };
const SPAWN = { x: 90, z: -10 };       // 山形の側（東）から来た伊達の援け
const WIND = [1, 0.1];                 // 向かい風（西から東へ吹く・伊達は西へ進む）
const WOUT = [0.1, 1];                 // 知らせの後の追い風（退く上杉を追う +z の向き）
const FRONT = { x: 10, z: -44 };       // 長谷堂城の手前（菅沢山から寄せる上杉を受ける所）
const GOAL = { x: 14, z: 64 };         // 上杉の退き口（u15 の退く道の口の先）
const FUKADA = { x: -6, z: -20 };      // 長谷堂城の前の深田（K652②）
const SHINGARI = { x: 20, z: 96 };     // 退く上杉の殿（前田利益・水原親憲の鉄砲・K652②）
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.3, windStep: 2 });   // K652②：深田の段を足したので、知らせ（風の変わり）は二つ目の段の後

export const e15_hasedo = withCastle(lightBattle({
  id: 'e15_hasedo',
  date: '慶長五年（1600）九月　秋・晴れ　出羽国 山形盆地 長谷堂',
  intro: '関ヶ原の年の秋。上杉に攻められた最上義光を助けるため、政宗は援軍を山形盆地へ送った。',
  history: '慶長五年（1600）九月、上杉景勝の将・直江兼続は最上義光の長谷堂城を攻めた。伊達政宗は留守政景らを援軍に送ったが、関ヶ原で西軍が敗れた知らせが届くと、上杉は退き、最上と伊達の軍が追った（『貞山公治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '上杉の軍（直江兼続）', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 20000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.45,   // 11/25 K651：長谷堂の地面（城の前の田と道）で act bot の一回目（信長で出陣）が上杉の先手に89秒で倒れた → 0.55→0.45（c07 と同じ手）
  thick: true,
  allyDmg: 0.22,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  setup: hasedoPaddy,   // 11/25 せ K657②：城の前の深田の水面（u15 と同じ）
  world: { ...HASEDO_LAND, sky: { ...(HASEDO_LAND.sky || {}), wind: WIND, windStrength: 0.9, overcast: 0.3, mist: 0.2 } },   // 地面は u15・風は馬印の勢いの仕組み（date_uma.js）の分だけ

  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '留守政景の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('留守政景'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(6)] },
    // K718⑬（11/27 せ）：紙の「主役は最上軍」②最上軍と合流 ⑤城方が打って出る ⑨最上軍が追撃。今まで最上の兵が一人もいなかった。
    //   旗は u15 と同じ一文字（最上の二つ引両が手元の紋に無いため）。山形の側の後詰と、大手口（城の -28）の外へ打って出た城兵（志村光安・塀の内に置くと上杉が塀越しに詰まる）
    { name: '最上義光の後詰', flag: 'ichimonji', at: { x: FRONT.x + 22, z: FRONT.z + 6 }, list: [busho('最上義光'), uS(3), uA(14)] },
    { name: '志村光安の城兵', flag: 'ichimonji', at: { x: HASEDO_CASTLE_AT.x + 4, z: HASEDO_CASTLE_AT.z - 38 }, list: [busho('志村光安'), uS(2), uA(10), uG(4)] },
  ],
  // 11/27 せ：K674 で段を足した後、act bot が三回とも1080秒の打ち切りで失敗（直す前も同じ）→ 深田の畦に上限を付け、後ろの段の上限を詰めた
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['留守政景', '殿の名代で、山形の最上殿を助けに参りました。上杉は二万、手強うございます', 3.4],
      ['伊達政宗', '政景、無理はするな。最上の城が持てばよい', 3.2],
      ['最上義光', '伊達の援け、かたじけない。長谷堂は上杉に囲まれておる。共に先手の横を突こうぞ', 3.4]] },
    { kind: 'hold', at: FRONT, label: '長谷堂の手前', obj: '長谷堂の手前で、上杉の先手を受け止める', r: 16, dur: 60,
      title: '長谷堂の手前', sub: '向かい風の中、上杉の先手が寄せる',
      say: [['組頭', '風が向かいじゃ！　田の畦を外すな！', 3.2]],
      waves: [
        // K652（11/25 Sanae）：寄せの刻は段の始めから数える。山形の側から長谷堂の手前まで八十余m あり、信長で出陣（旗本百人を連れて歩く）の act bot は
        //   着く前の野で上杉の先手に囲まれて79秒・89秒で倒れた（一太刀も振れず）。先手は本人が持ち場に着く頃（二十二秒）に寄せる。持ちこたえる刻（dur）は変えない
        { t: 22, say: ['上杉の侍', '最上も伊達も、まとめて討て！'], foes: [{ name: '上杉の先手', from: { x: FRONT.x - 6, z: FRONT.z - 40 }, list: [uS(3), uA(16)] }] },
        { t: 46, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '上杉の二の手', from: { x: FRONT.x + 14, z: FRONT.z - 38 }, list: [uS(3), uA(14)] }] }],
      reward: '長谷堂の手前を持ちこたえた' },
    // K652②（11/25 Sanae・10分）：長谷堂城の前は深田で、上杉勢は城へ寄せあぐね、何度も押し引きした（『最上義光物語』B・山形市の解説 C）
    { kind: 'fight', at: FUKADA, limit: 90, obj: '城の前の深田で、城へ寄せる上杉の二の手を押し返す', title: '深田', sub: '城の前の田は深い。上杉は足を取られる',
      say: [['留守政景', '上杉が城の前の深田へ入った。足の止まった所を突け', 3.2], ['志村光安', '城の者、打って出よ！　援けが来たぞ！', 3], ['組頭', '田に入りすぎるな。畦から突け', 3]],
      foes: [{ name: '深田の上杉勢', from: { x: FUKADA.x - 14, z: FUKADA.z - 10 }, list: [uS(3), uA(15)] }, { name: '深田の上杉の鉄砲', from: { x: FUKADA.x - 22, z: FUKADA.z + 6 }, list: [uS(1), uG(5)] }],
      reward: '城の前の深田で上杉の二の手を押し返した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: GOAL, limit: 120, obj: '関ヶ原の知らせが届いた。馬印を押し出して、退く上杉勢の側面を突く', title: '上杉の退き', sub: '関ヶ原の知らせで、上杉が退き始める',
      say: [['使番', '申し上げます！　関ヶ原にて西軍、敗北！　東軍の勝ちにござる！', 3.4], ['直江兼続', '……関ヶ原が負けたか。全軍、退け！', 3], ['伊達成実', '殿、上杉が退き始めました。最上勢が追います、我らは側面を', 3.2]],
      foes: [{ name: '直江兼続の本隊', from: { x: GOAL.x - 4, z: GOAL.z + 10 }, list: [busho('直江兼続', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '上杉の鉄砲', from: { x: GOAL.x + 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '退く上杉勢を追い落とした' },
    // K652②：直江兼続は自ら殿に立ち、前田利益（慶次）・水原親憲の鉄砲で追う最上・伊達の兵を何度も押し返した（『上杉家御年譜』B・『最上義光物語』B）
    { kind: 'hold', at: GOAL, label: '退き口', obj: '取って返す上杉の殿の槍を、退き口で受け止める', r: 16, dur: 60, limit: 110,
      title: '上杉の殿', sub: '退く上杉が、殿で取って返す',
      say: [['最上義光', '追え！　上杉を一人も山形に残すな！', 3], ['伊達成実', '殿が取って返したぞ！　前田慶次の手じゃ、侮るな', 3.2]],
      waves: [{ t: 6, say: ['前田利益', '追うて来る者は、皆この槍の錆じゃ！'], foes: [{ name: '前田利益の手', from: { x: GOAL.x - 6, z: GOAL.z + 40 }, list: [busho('前田利益'), uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '鉄砲の列じゃ！　伏せよ！'], foes: [{ name: '水原親憲の鉄砲', from: { x: GOAL.x + 18, z: GOAL.z + 38 }, list: [uS(1), uA(4), uG(7)] }] }],
      reward: '上杉の殿の取って返しを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FUKADA.x + 30, z: FUKADA.z - 10 }, obj: '長谷堂の手前の道で、寄せて来る上杉の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '上杉の足軽を止めよ', 3.2]],
      foes: [{ name: '上杉の足軽', from: { x: FUKADA.x + 42, z: FUKADA.z - 22 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '長谷堂の手前の道を守った' },
    { kind: 'hold', at: { x: FUKADA.x - 20, z: FUKADA.z + 20 }, label: '深田の畦で、', obj: '深田の畦で、横から突く上杉の鉄砲を受け止める', r: 16, dur: 45, limit: 60,   // 11/27 せ：上限が無く、城の塀の脇で着けない act bot が420秒詰まり1080秒の打ち切りになった
      say: [['見張り', '鉄砲が横から来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '上杉の鉄砲', from: { x: FUKADA.x - 8, z: FUKADA.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '上杉の鉄砲', from: { x: FUKADA.x - 34, z: FUKADA.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '深田の畦を守った' },
    { kind: 'fight', at: { x: FUKADA.x + 30, z: FUKADA.z + 40 }, obj: '退く上杉の列の脇で、荷駄を守る上杉の兵を討つ', max: 100, limit: 70,
      say: [['組頭', '荷駄の守りを崩せ', 3.2]],
      foes: [{ name: '荷駄の上杉の兵', from: { x: FUKADA.x + 42, z: FUKADA.z + 28 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '退く列の脇の荷駄を押さえた' },
    { kind: 'fight', at: SHINGARI, limit: 80, obj: '殿の鉄砲の列を崩し、上杉を山形から追い出す', title: '殿の鉄砲', sub: '殿の鉄砲を崩せば、上杉は退くしかない',
      say: [['伊達政宗', '鉄砲の列の横へ回れ。正面から行けば撃たれるだけじゃ', 3.2]],
      foes: [{ name: '殿の鉄砲の列', from: { x: SHINGARI.x - 4, z: SHINGARI.z + 8 }, list: [uS(2), uA(8), uG(6)] }, { name: '殿の槍', from: { x: SHINGARI.x + 12, z: SHINGARI.z + 4 }, list: [uS(2), uA(10)] }],
      reward: '殿の鉄砲の列を崩した' },
    // K674（11/26・一戦10任務）：史実の流れの続きの段
    fightS({ x: SHINGARI.x - 20, z: SHINGARI.z + 20 }, '退く上杉の列の後ろで、遅れた足軽の組を討つ', '遅れた組', '列から遅れた上杉の組が道に残る', [['組頭', '列から遅れた者がおる。逃がすな', 3]],
      [foe('遅れた上杉の組', SHINGARI.x - 30, SHINGARI.z + 40, [uS(2), uA(10)])], { reward: '遅れた上杉の組を討った', limit: 70 }),
    holdS({ x: GOAL.x + 20, z: GOAL.z + 10 }, '道の辻', '道の辻で、引き返して来る上杉の追手を受け止める', '道の辻', '上杉の殿が引き返す', [['伊達政宗', '辻で止めよ。深追いはするな', 3]],
      [wave(2, '上杉の侍', '山形を目指せ！　最後の一押しじゃ！', [foe('引き返す上杉の手', GOAL.x + 30, GOAL.z + 40, [uS(2), uA(12)])])], { dur: 45, limit: 70, reward: '道の辻で追手を受け止めた' }),
  ],
  update: umaTick,
  win: {
    banner: '長谷堂、救援の勝ち', sub: '関ヶ原の一通の知らせが、東北の戦を終わらせた。上杉は山形から退いた', award: '長谷堂で最上を救った',
    say: [['留守政景', '上杉は引きました。最上殿も無事にございます', 3.2],
      ['伊達政宗', '天下の風が変わったのじゃ……', 3.2]],
  },
}), { plan: HASEDO_PLAN, at: HASEDO_CASTLE_AT, lift: 0, team: 0, life: false });   // 最上の城（伊達の味方）
e15_hasedo.camPull = 1.6;
e15_hasedo.timeslip = HASEDO_TIMESLIP;   // K657② 深田の絵（u15 と同じ）
export default e15_hasedo;
