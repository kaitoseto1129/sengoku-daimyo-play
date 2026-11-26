// 武田編 六戦目「二俣城攻め」（元亀三年〔1572〕十月〜十二月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：西上作戦の信玄は、徳川方の中根正照が守る遠江の二俣城を勝頼・信豊らに攻めさせた。城は天竜川と二俣川に囲まれた崖の上で、
//   大手からは落ちなかった。城兵は天竜川の崖に井楼（つるべの櫓）を組んで水を汲んでいたので、武田は上流から筏を流して井楼を壊し、
//   水の手を断って開城させた（『三河物語』『甲陽軍鑑』・浜松市の史跡の案内）。主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import { withCastle } from './light_castle.js';
import { FUTAMATA_PLAN } from './castles/futamata.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 140 };
const RIVER = [[-220, -120], [-100, -112], [0, -118], [100, -110], [220, -116]];   // 天竜川（城の北の崖の下）
const OTE = { x: 8, z: 60 };          // 大手の前
const KAMI = { x: -60, z: -96 };      // 天竜川の上流の岸（筏を流す所）
const IROU = { x: 10, z: -96 };       // 井楼（水の手）の崖の下
const OTE2 = { x: 4, z: 20 };         // 開城を迫る大手の口
const HITOKOTO = { x: 70, z: 110 };    // 二俣の南の一言坂（家康の物見と当たった所・K652②）
const KAWARA = { x: 40, z: -80 };     // 井楼の下の河原（筏を引き上げる所・K652②）

// 11/25 クラウドさ（K656 K655 の弱いサムネ「川と城が戦場に無い」）：城山の頂に二俣城（北曲輪・本丸・二の丸・南曲輪と堀切）を置く（castles/futamata.js・出所 docs/battle_refs/futamata.md）。遠景の軽い形
export const d06_futamata = withCastle(lightBattle({
  id: 'd06_futamata',
  date: '元亀三年（1572）十二月　晴れ　遠江国 二俣城',
  intro: '天竜川の崖の上の二俣城は、大手から攻めても落ちぬ。城の水は、崖に組んだ井楼から天竜川で汲んでいる。',
  history: '元亀三年（1572）、西上作戦の武田信玄は、徳川方の中根正照が守る二俣城を勝頼らに攻めさせた。城は大手から落ちず、武田は天竜川の上流から筏を流して城の水の手の井楼を壊し、水を断って開城させた。この後、信玄は三方ヶ原で家康と戦う。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '中根正照の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 1200 },
  allyLook: TAKEDA, foeLook: TOKU,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1572, time: 'day', winter: true, fogFar: 420,
    river: RIVER, riverW: 26, riverDepth: 1.2,
    hills: [[0, -40, 44, 24], [-130, -20, 70, 26], [130, -10, 70, 24], [70, 110, 40, 8]],
    // 11/21 cloud-19（K563 地形・手書き）：大手道は南から城へ、もう一本は城の西を回って天竜川の上流の岸へ下る。城山と崖の上は松と雑木
    paths: [{ pts: [[0, 190], [0, 140], [8, 60], [6, 0]], w: 3 }, { pts: [[8, 60], [-50, 20], [-60, -96]], w: 2.4 }],
    groves: [{ x: 40, z: -60, r: 24, n: 26 }, { x: -110, z: -60, r: 26, n: 28 }],
    trees: 510, tufts: 1600,
  },
  allies: [
    { name: '武田勝頼の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, list: [busho('武田勝頼'), uS(4), uA(16)] },
    { name: '武田信豊の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [busho('武田信豊'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '大手を攻めても、崖の上の城は落ちぬ', 3],
      ['武田信豊', '城の水は天竜川の井楼から汲んでおる。あれを壊せば城は渇く', 3.4]] },
    // K652②（11/25 Sanae・10分に）：二俣へ向かう道で、家康の物見の手と一言坂で当たり、本多忠勝の殿に押し返された（一言坂の戦い・『三河物語』）
    { kind: 'fight', at: HITOKOTO, limit: 120, obj: '一言坂で、退く徳川の物見の手を追う', title: '一言坂', sub: '本多忠勝が殿に立つ',
      say: [['武田信豊', '徳川の物見じゃ。坂で追い崩せ！', 3], ['本多忠勝', '一人も討たせぬ。わしが殿じゃ', 3]],
      foes: [
        { name: '本多忠勝の殿', from: { x: HITOKOTO.x + 6, z: HITOKOTO.z - 16 }, list: [busho('本多忠勝'), uS(4), uA(16)] },
        { name: '徳川の物見の鉄砲', from: { x: HITOKOTO.x - 12, z: HITOKOTO.z - 20 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '坂の上から徳川の槍！　鹿の角の兜じゃ！'], foes: [{ name: '徳川の物見の槍', from: { x: HITOKOTO.x + 16, z: HITOKOTO.z - 10 }, list: [uS(3), uA(12)] }] }],
      reward: '一言坂で徳川の物見を退けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HITOKOTO.x - 20, z: HITOKOTO.z - 24 }, obj: '一言坂の上で、坂を塞ぐ徳川の足軽を討つ', limit: 90,
      say: [['組頭', '坂の上に殿の足軽が残っておる。押し上れ', 3.2]],
      foes: [{ name: '坂を塞ぐ徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: HITOKOTO.x - 20, z: HITOKOTO.z - 24 }), list: [uS(2), uA(12)] }],
      reward: '坂を塞ぐ足軽を討った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['小杉左近', '家康に過ぎたる物が二つあり　唐の頭に本多平八', 3.4], ['武田信豊', '……敵ながら見事な殿じゃった。二俣へ急げ', 3]] },
    { kind: 'hold', at: OTE, label: '大手の前', obj: '大手の前で城兵の打って出を受け、城の目を引きつける', r: 16, dur: 50,
      title: '大手', sub: '城兵が門を開けて打って出る',
      say: [['組頭', '大手で騒げ。城の目をこちらへ引きつけよ！', 3]],
      waves: [
        { t: 6, say: ['徳川の侍', '甲斐の者を追い払え！'], foes: [{ name: '大手の打って出', from: { x: OTE.x, z: OTE.z - 26 }, list: [uS(4), uA(22)] }] },
        { t: 28, say: ['組頭', '門の上から鉄砲！'], foes: [{ name: '大手の鉄砲', from: { x: OTE.x + 12, z: OTE.z - 30 }, list: [uG(6)] }] }],
      reward: '大手で城の目を引きつけた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTE.x + 14, z: OTE.z - 14 }, obj: '大手の脇の堀端で、城から出た徳川の弓を討つ', limit: 90,
      say: [['組頭', '堀端に弓が出た。射られる前に寄れ', 3.2]],
      foes: [{ name: '堀端の徳川の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: OTE.x + 14, z: OTE.z - 14 }), list: [uS(1), uA(6), uB(5)] }],
      reward: '堀端の弓を討った' },
    { kind: 'move', at: KAMI, label: '天竜川の上流の岸', obj: '天竜川の上流へ回り、筏を流す', r: 14,
      say: [['武田信豊', '筏を組め。流れに乗せて井楼へぶつけるぞ', 3.2]] },
    { kind: 'fight', at: IROU, obj: '井楼の崖の下で、水の手を守る城兵を払う', title: '水の手', sub: '筏が井楼に当たる。崖の下に城兵が下りて来る',
      say: [['物見', '筏が井楼に当たった！　柱が折れるぞ！', 3.2], ['徳川の侍', '水の手を守れ！', 2.6]],
      foes: [
        { name: '水の手の守り', from: { x: IROU.x + 8, z: IROU.z + 10 }, list: [uS(4), uA(22)] },
        { name: '崖の上の弓', from: { x: IROU.x - 10, z: IROU.z + 20 }, list: [uB(6)] }],
      reward: '水の手を断った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: IROU.x - 14, z: IROU.z - 14 }, obj: '井楼の下の崖で、柱を守る徳川の兵を斬り払う', limit: 90,
      say: [['組頭', '柱を守る兵がおる。斬り払え', 3.2]],
      foes: [{ name: '柱を守る徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: IROU.x - 14, z: IROU.z - 14 }), list: [uS(2), uA(10)] }],
      reward: '柱を守る兵を斬り払った' },
    // K652②：筏を流し続けるため、河原で筏を引き上げる者を、崖から下りる城兵から守る（井楼の柱は一度では折れなかった）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['武田信豊', '柱はまだ一本残っておる。筏をもっと流せ！', 3]] },
    { kind: 'hold', at: KAWARA, label: '河原', obj: '河原で筏を流す者を、崖から下りる城兵から守る', r: 14, dur: 65,
      title: '筏', sub: '城兵が筏を流させまいと河原へ下りる',
      say: [['組頭', '筏を守れ！　流し切れば城の水は止まる！', 3]],
      waves: [
        { t: 5, say: ['徳川の侍', '筏の者を斬れ！'], foes: [{ name: '河原へ下りた城兵', from: { x: KAWARA.x + 10, z: KAWARA.z + 16 }, list: [{ type: 'samurai', n: 1, o: { name: '二俣の組頭 青木' } }, uS(3), uA(16)] }] },
        { t: 32, say: ['物見', '崖の上から鉄砲！'], foes: [{ name: '崖の鉄砲', from: { x: KAWARA.x - 14, z: KAWARA.z + 20 }, list: [uG(5), uS(2), uA(8)] }] }],
      reward: '筏を流し切り、井楼を折った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '筏は流し切った。傷を縛れ。崖から逃げる兵が来る', 2.8]] },   // K674：続きの段で倒れた回（act bot 963秒）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KAWARA.x - 10, z: KAWARA.z - 20 }, obj: '折れた井楼の下で、崖から逃げる徳川の兵を追い崩す', limit: 90,
      say: [['組頭', '井楼が折れた。逃げる兵を崩せ', 3.2]],
      foes: [{ name: '崖から逃げる徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KAWARA.x - 10, z: KAWARA.z - 20 }), list: [uS(1), uA(7)] }],
      reward: '逃げる兵を追い崩した' },
    { kind: 'fight', at: OTE2, limit: 150,   // 中根正照は倒れない（開城して退いた）
      obj: '大手の口へ寄せ、渇いた城に開城を迫る', title: '開城を迫る', sub: '水を断たれた城兵が最後に打って出る',
      say: [['武田勝頼', '水の無い城は持たぬ。最後の一押しじゃ', 3]],
      foes: [{ name: '中根正照の手', from: { x: OTE2.x, z: OTE2.z - 12 }, list: [busho('中根正照'), uS(5), uA(19)] }],
      reward: '二俣城を開城させた' },
  ],
  win: {
    banner: '二俣城 開城', sub: '中根正照は城を明け渡し浜松へ退いた。道は三方ヶ原へ', award: '二俣城を開城させた',
    say: [['使番', '中根殿、城を明け渡し、浜松へ退くと', 3],
      ['武田勝頼', '次は家康じゃ。浜松の前を通って、出て来るか見てやろう', 3.4]],
  },
}), { plan: FUTAMATA_PLAN, at: { x: 0, z: -40 }, lift: 0, team: 1, life: false });
export default d06_futamata;
