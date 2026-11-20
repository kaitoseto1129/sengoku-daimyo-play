// 全戦の布陣の表（司令塔 11/14 束A：軍勢の数・陣形・旗。docs/ledger_plan_1114.md）。
//   備ごとに 一行：家・大将・兵の数（史料の概数）・置き場（ゲームの座標）・幅と奥行き・向き・旗（家の旗の鍵）・具足の色・列の名・将の名。
//   並べる仕組みは fujin_place.js（全戦に共通・battle.js が毎コマ呼ぶ）。戦ごとの直しは この表の数字だけ。
//   見せかけの兵は作らず、同じ置き場に「本物の備」を置く（人数は 元の数の 12%・最大 36。携帯は 4%・最大 14）。
// 一行の形：
//   { key, name, side (0=味方・1=敵), x, z, w, d, count, facing, flag, armor, row, leaders: [名のある将の名…] }
//   facing：0 は +z（南）向き・Math.PI は -z（北）向き。flag：textures の家の鍵（'tokugawa' 'toyotomi' 'sanada' 'honda' …）。
//   row：列の名（真上の写真・名札の読み取り用）。leaders：その列の大名・将（名のある武将として一人ずつ付く。同じ名は一つ）。
// 出所：docs/fujin/<戦>.md・docs/fujin_all_1109.md・docs/books/*_zukan_1114.md。係三は 他の戦の行を足す（key は戦の def.key）。
const S = Math.PI;
// 11/19 係（kaito 11/19 戸次川「増えた兵は動かず、川すら渡らなかった」）：戸次川の段ごとの行き先（moves の when。fujin_place.js の fujinMoves が歩かせる）
//   march＝軍議の後の進軍の下知で浅瀬を渡って対岸に陣を敷く・chase＝先手が退いたら追い打ちに前へ・back＝退きの段で浅瀬を渡って元の岸へ
//   ambush＝釣り野伏せ：島津の奥の備が左右と後ろ（川の側）から一気に囲む
const hMarch = (rt) => (rt.flags.s1?.st || 0) >= 1 || (rt.flags.step || 0) >= 2;
const hChase = (rt) => !!rt.flags.feigned;
const hBack = (rt) => (rt.flags.step || 0) >= 4;
const hAmbush = (rt) => (rt.flags.step || 0) >= 3;
//   a（浅瀬の口の手前の溜まり）は今は使わない：溜まりで待つと渡りの下知から三十秒で半分が元の岸に残った（描かずの数え 247/572）。進軍の下知で溜まらずに浅瀬を渡り、本人と並んで対岸の陣へ
const hMv = (a, b, c, d) => [{ when: hMarch, x: b[0], z: b[1], facing: S, speed: 4.6 },
  { when: hChase, x: c[0], z: c[1], facing: S, speed: 3.8 }, { when: hBack, x: d[0], z: d[1], facing: S, speed: 4.2 }];
const hAm = (x, z, f = 0) => [{ when: hAmbush, x, z, facing: f, speed: 4.6 }];
// 11/19 係（kaito「天王寺レベルの軍勢」・桶狭間・森部・墨俣・稲葉山）：nb 塊（一塊 44 人・幅 13m）の行を一つ書く。持ち場で待つだけ（noEngage）
const NUM = '一二三四五';
const blk = (key, name, side, x, z, nb, facing, flag, row, o = {}) => ({ key, name, side, x, z, w: 13 * nb, d: 12, count: 200 * nb, facing, flag, armor: side ? 0x2a2622 : 0x2e2a26, row, leaders: [],
  blocks: Array.from({ length: nb }, (_, i) => ({ name: `${name} ${NUM[i]}` })), ranks: 4, noEngage: true, ...o });
// 11/19 係 army-11：杭瀬川は戦の座標が川の向きに回してある（b_k04_kuisegawa.js の T・O_L）。局所の (x,z)・向き（0＝局所 +z）を同じ式でゲームの座標へ
const kqT = (x, z) => { const a = x - 70, b = z + 20; return { x: -0.81395 * a + 0.58093 * b, z: -0.58093 * a - 0.81395 * b }; };
const kqY = (a) => { const v = kqT(70 + Math.sin(a), -20 + Math.cos(a)), o = kqT(70, -20); return Math.atan2(v.x - o.x, v.z - o.z); };
const kq = (key, name, side, lx, lz, nb, lf, flag, row, o = {}) => { const p = kqT(lx, lz); return blk(key, name, side, Math.round(p.x), Math.round(p.z), nb, kqY(lf), flag, row, o); };
export const FUJIN = {   // 置き場の行（本物の備を並べる）。docs から自動で作った数の表は fujin_layout.js（FUJIN_TABLE）
  // 大坂夏の陣 天王寺・岡山口（kaito 11/13 の布陣図）。北が大坂城・南が徳川。天王寺口は四重・岡山口は二重
  // 11/14 クラウドわ（K287①司令塔「各陣を幅より奥行きのある厚い塊に」）：deep で塊を奥行きの深い密な四角に（fujin_place の blockLook）
  k15_tennoji_okayama: { deep: true, lazy: true, rows: [
    // 11/14 MB係三（K297 司令塔）：塊の無かった岡山口・本陣の後ろ・西の端・左翼・後詰も家ごとの塊と幟に（前田＝梅鉢・本多・井伊＝赤・細川＝九曜・藤堂・伊達・黒田＝黒・明石＝宇喜多の紺）。豊臣の毛利・真田の旗本は大きく（塊の幅16・最大30人・五段）
    // 徳川 天王寺口（一の列→四の列→本陣）
    // 11/14 クラウドさ（K287②・K292）：四重の列は blocks で大名・将ごとの塊（四段）に分け、塊ごとに家の旗（内藤＝下がり藤・仙石＝永楽銭・浅野＝違い鷹の羽・紋の無い家は葵）と後ろの幟の林
    { key: 'sen', name: '秋田実季・浅野長重・真田信吉（一の列）', side: 0, x: -44, z: 54, w: 64, d: 14, count: 180, facing: S, flag: 'honda', armor: 0x2c2824, row: '天王寺口 一の列', leaders: ['秋田実季', '浅野長重', '真田信吉'], blocks: [{ lead: '秋田実季', flag: 'tokugawa' }, { lead: '浅野長重', flag: 'asano' }, { lead: '真田信吉', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'echi', name: '松平忠直（二の列）', side: 0, x: -98, z: 68, w: 40, d: 10, count: 220, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '天王寺口 二の列', leaders: [], blocks: [{ name: '松平忠直の越前勢', lead: '松平忠直', onField: true }, { name: '越前勢の二の手' }], ranks: 4, nobori: true },
    { key: 'senB', name: '諏訪忠澄・保科正光（三の列）', side: 0, x: -52, z: 72, w: 86, d: 14, count: 300, facing: S, flag: 'honda', armor: 0x2c2824, row: '天王寺口 三の列', leaders: ['諏訪忠澄', '保科正光'], blocks: [{ lead: '諏訪忠澄', flag: 'tokugawa' }, { lead: '保科正光', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'ni', name: '榊原康勝（三の列）', side: 0, x: -40, z: 88, w: 74, d: 10, count: 220, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '天王寺口 三の列', leaders: [], blocks: [{ name: '榊原康勝の備', lead: '榊原康勝', onField: true }, { name: '榊原の二の手' }], ranks: 4, nobori: true },
    { key: 'senC', name: '内藤忠興・松平康長・酒井家次・松平忠良・仙石忠政（四の列）', side: 0, x: -38, z: 106, w: 96, d: 14, count: 300, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '天王寺口 四の列', leaders: ['内藤忠興', '松平康長', '松平忠良', '仙石忠政', '酒井家次'], blocks: [{ lead: '内藤忠興', flag: 'sagarifuji' }, { lead: '松平康長', flag: 'tokugawa' }, { lead: '松平忠良', flag: 'tokugawa' }, { lead: '仙石忠政', flag: 'eiraku' }, { lead: '酒井家次', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'hata', name: '徳川頼宣の備え', side: 0, x: -38, z: 196, w: 84, d: 14, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '本陣の後ろ', leaders: ['徳川頼宣'], blocks: [{ name: '徳川頼宣の旗本', lead: '徳川頼宣', onField: true }, { name: '紀州勢の二の手' }], ranks: 4, nobori: true },
    { key: 'waki', name: '本陣の脇備え', side: 0, x: 2, z: 159, w: 18, d: 22, count: 110, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '本陣の脇', leaders: [], ranks: 4, nobori: true },
    // 徳川 岡山口（二重）・西の端・後詰
    { key: 'okaA', name: '前田利常・本多康紀・片桐且元（岡山口・一の列）', side: 0, x: 96, z: 40, w: 46, d: 15, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 一の列', leaders: ['前田利常', '本多康紀', '片桐且元'], blocks: [{ lead: '前田利常', flag: 'maeda' }, { lead: '本多康紀', flag: 'honda' }, { lead: '片桐且元', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'okaB', name: '井伊直孝・細川忠興・藤堂高虎（岡山口・二の列）', side: 0, x: 100, z: 66, w: 50, d: 15, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 二の列', leaders: ['井伊直孝', '細川忠興', '藤堂高虎'], blocks: [{ lead: '井伊直孝', flag: 'ii' }, { lead: '細川忠興', flag: 'kuyo' }, { lead: '藤堂高虎', flag: 'todo' }], ranks: 4, nobori: true },
    { key: 'okaC', name: '徳川秀忠の本陣（岡山口・後ろ）', side: 0, x: 90, z: 118, w: 36, d: 10, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 後ろ', leaders: ['徳川秀忠'], blocks: [{ name: '徳川秀忠の旗本', lead: '徳川秀忠', onField: true }, { name: '秀忠の馬廻り' }], ranks: 4, nobori: true },
    { key: 'todo', name: '藤堂高虎（岡山口・脇）', side: 0, x: 56, z: 80, w: 36, d: 12, count: 200, facing: S, flag: 'todo', armor: 0x2e2a26, row: '岡山口 脇', leaders: [], ranks: 4, nobori: true },
    // 11/15 クラウドわ（K315 kaito「戦場が小さすぎて全軍が一か所に詰まっている。布陣の図はこのままで、各軍勢を本当の距離に散らす・大坂城の近くへ歩いても兵がいない」）：
    //   兵の歩ける枠を 260 へ広げ（b_k15 の world.moveLim）、戦の筋に関わらない塊を布陣図（introFujin・army_depth_plans）の本当の向きと距離へ離す。
    //   伊達は名のとおり西の端（元は東の (24,120) にいた）・松平忠輝はその後ろ・後詰は本陣の後ろの奥・明石は茶臼山の西。豊臣は七手組・秀頼の旗本を城の前、治房の本隊を岡山口の北に。
    //   塊は本人から 190m（携帯 140m）の内に入った時に出る＝遠くは数に入らず、行けばいる
    { key: 'date', name: '伊達政宗・片倉重長（西の端）', side: 0, x: -182, z: 60, w: 40, d: 14, count: 240, facing: S, flag: 'date', armor: 0x1a1a22, row: '西の端', leaders: ['伊達政宗', '片倉重長'], blocks: [{ lead: '伊達政宗', flag: 'date' }, { lead: '片倉重長', flag: 'date' }], ranks: 4, nobori: true },
    { key: 'tadateru', name: '松平忠輝（西の端・二の列）', side: 0, x: -178, z: 150, w: 40, d: 12, count: 220, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '西の端 二の列', leaders: [], blocks: [{ name: '松平忠輝の備', lead: '松平忠輝', flag: 'tokugawa' }, { name: '越後勢の二の手', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'sakai', name: '水野勝成・本多忠政', side: 0, x: -140, z: 164, w: 30, d: 12, count: 160, facing: S + 0.5, flag: 'tokugawa', armor: 0x2e2a26, row: '左翼', leaders: [], blocks: [{ name: '水野勝成の備', lead: '水野勝成', flag: 'mizuno' /* 水野の沢瀉（K365 11/19） */ }, { name: '本多忠政の備', lead: '本多忠政', flag: 'honda' }], ranks: 4, nobori: true },
    // 11/14 クラウドさ（K280・act bot「黒田長政の備が一点に重なって止まる」）：後詰の二行が兵の歩ける枠（z≒174）の外（z196・200）で、兵が枠の縁へ押し戻されて一点に重なっていた→枠の内（z166）へ
    { key: 'asano', name: '浅野長晟（後詰）', side: 0, x: 22, z: 240, w: 36, d: 12, count: 180, facing: S, flag: 'asano', armor: 0x2e2a26, row: '後詰', leaders: ['浅野長晟'], ranks: 4, nobori: true },
    { key: 'kuroda', name: '黒田長政・細川忠興（後詰）', side: 0, x: -110, z: 240, w: 34, d: 12, count: 160, facing: S, flag: 'kuroda', armor: 0x2e2a26, row: '後詰', leaders: [], blocks: [{ name: '黒田長政の備', lead: '黒田長政', flag: 'kuroda' }, { name: '細川忠興の後詰', flag: 'kuyo' }], ranks: 4, nobori: true },
    // 11/16 MacBook天王寺-厚み（K315「名のある武将は全員馬に」）：名の無かった塊に布陣図の将を付けた（松平忠輝・水野勝成・本多忠政・黒田長政・明石全登・大野治長・御宿政友・大野治房・新宮行朝・速水守久・青木一重）。
    //   将は units.js が馬に乗せる。左翼の酒井家次は四の列にもいて名が二つになるので、後詰の水野勝成に替えた（布陣表 docs/fujin の後詰）。治房は岡山口で本物が出るまでの代わり（okayamaguchi.js が外す）
    // 豊臣（11/14 クラウドか K287③司令塔「豊臣方の塊が小さく少ない」：毛利・真田・大谷を家ごとの塊に分け、塊を広く（blockW）厚く（blockMax）し、家の幟の林を立てる）
    // 11/15 K292 クラウドす：毛利勝永の手の旗を赤地（毛利輝元の一文字三星の家の旗）から黒地に白の桐へ。赤は真田の赤備えと同じで、引きの写真で毛利と真田の塊が一つの赤に見えた。
    //   勝永は秀吉から毛利の名を賜った豊臣の直臣の家なので主家の桐を抜き、豊臣の白地に金の桐・真田の赤と遠目に分かれる配色にした（屏風の図柄は確かめられず、配色は復元案）
    { key: 'mori', name: '毛利勝永の後備え', side: 1, x: -20, z: -10, w: 40, d: 12, count: 300, facing: 0, flag: 'toyotomi', armor: 0x3a3028, row: '毛利', leaders: [], blocks: [{ name: '毛利勝永の旗本', flag: 'sashi:toyotomi:#221f1b:#ece6d6' }, { name: '毛利の後備え 二の手', flag: 'sashi:toyotomi:#221f1b:#ece6d6' }], blockW: 16, blockMax: 30, ranks: 5, nobori: true },
    { key: 'moriB', name: '毛利の二陣', side: 1, x: -36, z: -20, w: 58, d: 12, count: 300, facing: 0, flag: 'toyotomi', armor: 0x3a3028, row: '毛利 二陣', leaders: [], blocks: [{ name: '毛利の二陣 左', flag: 'sashi:toyotomi:#221f1b:#ece6d6' }, { name: '毛利の二陣 右', flag: 'sashi:toyotomi:#221f1b:#ece6d6' }, { name: '浅井井頼の備', flag: 'toyotomi' }], blockW: 14, blockMax: 20, ranks: 4, nobori: true },
    { key: 'moriC', name: '毛利の三陣', side: 1, x: -52, z: -38, w: 60, d: 14, count: 300, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '毛利 三陣', leaders: [], blocks: [{ name: '竹田永翁の備', flag: 'toyotomi' }, { name: '毛利の三陣 中', flag: 'sashi:toyotomi:#221f1b:#ece6d6' }], blockW: 14, blockMax: 20, ranks: 4, nobori: true },
    { key: 'sana', name: '真田の赤備え', side: 1, x: -108, z: -10, w: 46, d: 14, count: 300, facing: 0.6, flag: 'sanada', armor: 0x8e1f16, row: '真田', leaders: [], blocks: [{ name: '真田信繁の赤備え', flag: 'sanada' }, { name: '大谷吉治の備', flag: 'otani' }, { name: '真田の赤備え 二の手', flag: 'sanada' }], blockW: 16, blockMax: 30, ranks: 4, nobori: true, cav: 0.35 },
    { key: 'sanaK', name: '真田の騎馬', side: 1, x: -94, z: -12, w: 26, d: 12, count: 140, facing: 0.6, flag: 'sanada', armor: 0x8e1f16, row: '真田 騎馬', leaders: [], nobori: true, cav: 1 },   // 11/16 MacBook天王寺-厚み：騎馬の塊は全員馬に（cav。depth_reserve.js）
    { key: 'akashi', name: '明石全登', side: 1, x: -168, z: -60, w: 32, d: 12, count: 200, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '明石', leaders: [], blocks: [{ name: '明石全登の左', lead: '明石全登', flag: 'ukita' }, { name: '明石全登の右', flag: 'ukita' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
    { key: 'ono', name: '大野治長', side: 1, x: -6, z: -104, w: 40, d: 14, count: 220, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '大野', leaders: [], blocks: [{ name: '大野治長の先手' }, { name: '大野治長の本隊', lead: '大野治長' }, { name: '御宿政友の備', lead: '御宿政友' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
    { key: 'haru', name: '大野治房の本隊（岡山口の北）', side: 1, x: 108, z: -42, w: 46, d: 14, count: 240, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '大野治房', leaders: [], blocks: [{ name: '大野治房の本隊', lead: '大野治房', onField: true }, { name: '新宮行朝の備', lead: '新宮行朝' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
    { key: 'nanate', name: '七手組（城の前）', side: 1, x: 14, z: -168, w: 70, d: 14, count: 240, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '七手組', leaders: [], blocks: [{ name: '七手組 速水守久の備', lead: '速水守久' }, { name: '七手組 青木一重の備', lead: '青木一重' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
    { key: 'hideyori', name: '豊臣秀頼の旗本（城の前）', side: 1, x: 32, z: -214, w: 80, d: 16, count: 300, facing: 0, flag: 'toyotomi', armor: 0x221f1c, row: '城の前', leaders: [], blocks: [{ name: '秀頼の旗本' }, { name: '秀頼の馬廻り' }, { name: '城の前の後備え' }], blockW: 15, blockMax: 24, ranks: 5, nobori: true },
  ] },
  // 真田丸（11/14 MB係三 K286 司令塔「四方を囲む徳川方の陣が写らない」）：noFake で k11/depth.js の軽い備は旗一本と名札だけになり、野に疎らな旗の列しか無かった。
  //   kaito 11/13 の包囲図（docs/fujin/k11_sanadamaru.md 末尾）の南の大名を、本物の塊と家の幟の林で置く。前田は本人（始め 16,112・北西向き）の左前 40m（始めの目に入る所。本人の道 x≈20 は空く）・井伊と松平忠直は西に城を背に一列・藤堂と伊達はその後ろ・秀忠は岡山。
  //   名札は depth.js の大名の名札（sonaeNames）が出すので、ここでは名のある武将を足さず、塊の名も戦の本物の組（井伊直孝の赤備え・松平忠直の越前勢・前田利光の旗本）と重ねない。本人の道（篠山 22,50・丸の正面 0,54・西の脇）は空ける
  k11_sanadamaru: { stayPut: true, keep: true, rows: [
    { key: 'maeda', name: '前田利常の本隊', side: 0, x: -24, z: 78, w: 40, d: 14, count: 300, facing: S, flag: 'maeda', armor: 0x2e2a26, row: '前田 本隊', leaders: [], blocks: [{ name: '前田の旗本 一の手', flag: 'maeda' }, { name: '前田の二の手', flag: 'maeda' }, { name: '前田の三の手', flag: 'maeda' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'ii', name: '井伊直孝の備', side: 0, x: -100, z: 48, w: 34, d: 14, count: 240, facing: S, flag: 'ii', armor: 0x8e1f16, row: '井伊', leaders: [], blocks: [{ name: '井伊の赤備え 一の手', flag: 'ii' }, { name: '井伊の二の手', flag: 'ii' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'echizen', name: '松平忠直の越前勢', side: 0, x: -150, z: 42, w: 46, d: 14, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '松平忠直', leaders: [], blocks: [{ name: '越前勢の一の手', flag: 'tokugawa' }, { name: '越前勢の二の手', flag: 'tokugawa' }, { name: '越前勢の三の手', flag: 'tokugawa' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'todo', name: '藤堂高虎の備', side: 0, x: -150, z: 104, w: 34, d: 12, count: 220, facing: S, flag: 'todo', armor: 0x2e2a26, row: '藤堂', leaders: [], blocks: [{ name: '藤堂高虎の旗本', flag: 'todo' }, { name: '藤堂の二の手', flag: 'todo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'date', name: '伊達政宗の備', side: 0, x: -196, z: 122, w: 40, d: 14, count: 300, facing: S, flag: 'date', armor: 0x1a1a22, row: '伊達', leaders: [], blocks: [{ name: '伊達政宗の旗本', flag: 'date' }, { name: '片倉重長の備', flag: 'date' }, { name: '伊達の三の手', flag: 'date' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'asano', name: '浅野長晟の備', side: 0, x: -200, z: 62, w: 30, d: 12, count: 200, facing: S, flag: 'asano', armor: 0x2e2a26, row: '浅野', leaders: [], blocks: [{ name: '浅野長晟の備', flag: 'asano' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'sakakibara', name: '榊原康勝・松倉重政の備', side: 0, x: -34, z: 134, w: 40, d: 12, count: 220, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '榊原・松倉', leaders: [], blocks: [{ name: '榊原康勝の備', flag: 'sakakibara' }, { name: '松倉重政の備', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'sakai', name: '酒井家次・南部利直の備（東）', side: 0, x: 120, z: 140, w: 40, d: 12, count: 220, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '東', leaders: [], blocks: [{ name: '酒井家次の備', flag: 'tokugawa' }, { name: '南部利直の備', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hidetada', name: '徳川秀忠の本陣（岡山）', side: 0, x: 186, z: 226, w: 50, d: 16, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山', leaders: [], blocks: [{ name: '徳川秀忠の旗本', flag: 'tokugawa' }, { name: '秀忠の馬廻り', flag: 'tokugawa' }, { name: '秀忠の後備え', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
  ] },
  // 第二次上田（11/14 MB係三 K297 司令塔「前半の戦の布陣を厚い塊に」）：noFake で b_k05_ueda.js の染屋台の尾根の諸隊と神川の向こうの後詰（addDistantArmy・計八つ）が空になり、
  //   徳川三万八千の輪が旗と陣幕だけだった。同じ所に本物の塊と家の幟の林（本多・有馬の酢漿草・大久保の上り藤・榊原の源氏車・山内の柏）。西向き（城へ）。本人の始め 92,-52 と退く先の本陣の前 80m は空く
  //   11/17 クラウド kaito2：携帯で塊が五〜九人と薄く、神川の向こうが白い幟の格子に見えた（220秒・n-allgate の検品）→ deep で肩の触れる厚い塊に（天王寺と同じ）
  // 11/19 係（army-11・kaito「天王寺レベルの軍勢」・60秒の本物 743→千八百以上）：秀忠軍三万八千のうち、城を囲む手（北の田の奥・北の林の東・神川の東の岸・城の南の野）に家ごとの塊（blk）を足す。
  //   真田（二千五百）は城の北と西の外に塊。大手門・城下の道（x 22〜92）・誘いの退き道と林（x 20〜75, z −66〜−120）・尼ヶ淵（z 22〜48）・神川の浅瀬（112,0）と中山道の道（132〜150, 4〜92）は空ける
  k05_ueda: { keep: true, deep: true, lazy: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    { key: 'okuboB', name: '大久保忠隣の後詰', side: 0, x: 124, z: -64, w: 20, d: 10, count: 150, facing: -S / 2, flag: 'okubo', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '大久保の後詰 一の手', flag: 'okubo' }, { name: '大久保の後詰 二の手', flag: 'okubo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hondaB', name: '本多忠政の後詰', side: 0, x: 126, z: -22, w: 20, d: 10, count: 170, facing: -S / 2, flag: 'honda', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '本多の後詰 一の手', flag: 'honda' }, { name: '本多の後詰 二の手', flag: 'honda' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'yamauchiB', name: '山内一豊の後詰', side: 0, x: 128, z: 22, w: 20, d: 10, count: 130, facing: -S / 2, flag: 'kashiwa', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '山内の後詰', flag: 'kashiwa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someHonda', name: '染屋台の本多康重', side: 0, x: 244, z: -40, w: 24, d: 12, count: 220, facing: -S / 2, flag: 'honda', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の本多 一の手', flag: 'honda' }, { name: '染屋台の本多 二の手', flag: 'honda' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someArima', name: '染屋台の有馬豊氏', side: 0, x: 250, z: 34, w: 24, d: 12, count: 200, facing: -S / 2, flag: 'katabami', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の有馬 一の手', flag: 'katabami' }, { name: '染屋台の有馬 二の手', flag: 'katabami' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someHidetada', name: '染屋台の秀忠の旗本', side: 0, x: 256, z: -4, w: 24, d: 12, count: 240, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の旗本 一の手', flag: 'tokugawa' }, { name: '染屋台の旗本 二の手', flag: 'tokugawa' }, { name: '染屋台の旗本 三の手', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someOkubo', name: '染屋台の大久保', side: 0, x: 236, z: -74, w: 24, d: 12, count: 160, facing: -S / 2, flag: 'okubo', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の大久保 一の手', flag: 'okubo' }, { name: '染屋台の大久保 二の手', flag: 'okubo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someSakakibara', name: '染屋台の榊原康政', side: 0, x: 240, z: 70, w: 24, d: 12, count: 160, facing: -S / 2, flag: 'sakakibara', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の榊原 一の手', flag: 'sakakibara' }, { name: '染屋台の榊原 二の手', flag: 'sakakibara' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    blk('ueA', '北の田の奥の徳川勢 西', 0, 95, -135, 3, 0, 'tokugawa', '徳川 北の奥'),
    blk('ueB', '北の田の奥の徳川勢 東', 0, 145, -140, 3, 0, 'tokugawa', '徳川 北の奥'),
    blk('ueC', '神川の東の北の備', 0, 150, -100, 3, -S / 2, 'honda', '徳川 神川の東'),
    blk('ueD', '神川の東の旗本の北', 0, 175, -72, 3, -S / 2, 'tokugawa', '徳川 神川の東'),
    blk('ueE', '染屋台の南の備', 0, 192, 52, 3, -S / 2, 'sakakibara', '徳川 神川の東'),
    blk('ueF', '城の南の野の備 西', 0, 30, 85, 3, S, 'tokugawa', '徳川 城の南'),
    blk('ueG', '城の南の野の備 東', 0, 85, 98, 3, S, 'honda', '徳川 城の南'),
    blk('ueH', '城の北を囲む備', 0, -5, -100, 3, 0, 'okubo', '徳川 城の北'),
    blk('ueI', '城の北西を囲む備', 0, -65, -85, 3, 0, 'tokugawa', '徳川 城の北'),
    blk('ueS1', '真田の城の北の備', 1, -40, -95, 2, 0, 'sanada1600', '真田 城の北'),
    blk('ueS2', '真田の城の西の備', 1, -95, -40, 2, -S / 2, 'sanada1600', '真田 城の西'),
    blk('ueS3', '真田の尼ヶ淵の上の備', 1, -45, 10, 2, S, 'sanada1600', '真田 尼ヶ淵の上'),
  ] },
  // 河田・米野（docs/fujin/k02_kawada.md：河田の手およそ一万八千・岐阜方 米野と奥の後詰）11/19 係 army-11（天王寺レベルの軍勢・60秒の本物 233→千八百以上）：
  //   木曽川は z −16〜26（x −60 で）・中洲 (−56,4)。南岸（東軍）は進む道（x −80〜−40）・池田の本陣（−24,135）・山内（80,46）を空けて東西に家ごとの塊、
  //   北岸（岐阜方）は柵の口（−60,−48）・米野の道（−84,−60〜−140,−68）・新加納の道（−84,−166）を空けて東と奥に塊。持ち場で待つだけ・勝ち負けの組に入らない
  k02_kawada: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('kaS1', '浅野幸長の後ろの備', 0, -150, 70, 3, S, 'asano', '東軍 南岸 西'),
    blk('kaS2', '池田長吉の後ろの備', 0, -120, 112, 3, S, 'ageha', '東軍 南岸 西'),
    blk('kaS3', '一柳直盛の後ろの備', 0, -175, 140, 3, S, 'kuginuki', '東軍 南岸 西', { far: true, tLazy: true }),
    blk('kaS4', '山内一豊の二陣', 0, 20, 90, 3, S, 'kashiwa', '東軍 南岸 東'),
    blk('kaS5', '池田の二陣', 0, 62, 122, 3, S, 'ageha', '東軍 南岸 東'),
    blk('kaS6', '池田の三陣 西', 0, -100, 160, 3, S, 'ageha', '東軍 南岸 奥'),
    blk('kaS7', '池田の三陣 東', 0, 10, 165, 3, S, 'ageha', '東軍 南岸 奥'),
    blk('kaS8', '浅野の二の備', 0, 115, 100, 3, S, 'asano', '東軍 南岸 東', { far: true, tLazy: true }),
    blk('kaN1', '織田秀信方の北岸の備 東', 1, 0, -70, 3, 0, 'oda', '岐阜方 北岸'),
    blk('kaN2', '織田秀信方の北岸の備 東奥', 1, 30, -112, 3, 0, 'oda', '岐阜方 北岸'),
    blk('kaN3', '岐阜方の後詰', 1, -20, -142, 3, 0, 'oda', '岐阜方 後詰', { far: true, tLazy: true }),
    blk('kaN4', '百々綱家の後ろの備', 1, -172, -108, 3, 0, 'oda', '岐阜方 米野', { far: true, tLazy: true }),
    blk('kaN5', '米野の西の備', 1, -205, -58, 3, 0, 'oda', '岐阜方 米野', { far: true, tLazy: true }),
    blk('kaN6', '東の浅瀬の後ろの備', 1, 45, -38, 3, 0, 'oda', '岐阜方 北岸'),
    blk('kaN7', '岐阜方の旗本の後ろ', 1, -55, -125, 3, 0, 'oda', '岐阜方 後詰'),
  ] },
  // 岐阜城（docs/fujin/k03_gifu.md：東軍およそ三万四千・城方六千五百）11/19 係 army-11（天王寺レベルの軍勢・60秒の本物 257→千八百以上）：
  //   金華山は東（本丸 (2,0)）・西の麓に城下と居館。東軍は城下の西の田（本陣 −214,10・先手 −184,3）の北・南・奥に家ごとの塊（東＝S/2 を向く）、
  //   城方は城下の北と南の外れ・居館の北と南・二の丸と上台所の脇に塊。寄せの道（x −210〜−132, z −8〜10）・百曲り・七曲り・長良川（z −146 より北）は空ける。持ち場で待つだけ・勝ち負けの組に入らない
  k03_gifu: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('giE1', '池田の二の備', 0, -255, -70, 3, S / 2, 'ageha', '東軍 城下の西'),
    blk('giE2', '井伊直政の備', 0, -300, -20, 3, S / 2, 'tokugawa', '東軍 城下の西', { far: true, tLazy: true }),
    blk('giE3', '本多忠勝の備', 0, -292, 60, 3, S / 2, 'honda', '東軍 城下の西', { far: true, tLazy: true }),
    blk('giE4', '池田の三の備', 0, -255, 100, 3, S / 2, 'ageha', '東軍 城下の西'),
    blk('giE5', '加藤嘉明の備', 0, -215, -85, 3, S / 2, 'tokugawa', '東軍 城下の北'),
    blk('giE6', '細川忠興の備', 0, -215, 72, 3, S / 2, 'kuyo', '東軍 城下の南'),
    blk('giE7', '京極高知の備', 0, -172, -72, 3, S / 2, 'kyogoku', '東軍 城下の北'),
    blk('giE8', '浅野幸長の備', 0, -172, 85, 3, S / 2, 'asano', '東軍 城下の南'),
    blk('giE9', '浅野の二の備', 0, -242, 140, 3, S / 2, 'asano', '東軍 瑞龍寺山の麓', { far: true, tLazy: true }),
    blk('giW1', '津田藤三郎の城下の備 北', 1, -158, -52, 3, -S / 2, 'nobukatsu', '城方 城下'),
    blk('giW2', '津田藤三郎の城下の備 南', 1, -158, 52, 3, -S / 2, 'nobukatsu', '城方 城下'),
    blk('giW3', '百々綱家の居館の北の備', 1, -122, -50, 3, -S / 2, 'nobukatsu', '城方 居館'),
    blk('giW4', '百々綱家の居館の南の備', 1, -122, 48, 3, -S / 2, 'nobukatsu', '城方 居館'),
    blk('giW5', '木造長政の二の丸の北の備', 1, -64, -42, 3, -S / 2, 'nobukatsu', '城方 二の丸'),
    blk('giW6', '木造長政の二の丸の南の備', 1, -64, 42, 3, -S / 2, 'nobukatsu', '城方 二の丸'),
    blk('giW7', '織田秀信の上台所の備', 1, -26, 40, 3, -S / 2, 'nobukatsu', '城方 上台所'),
  ] },
  // 杭瀬川（docs/fujin/k04_kuisegawa.md：東軍の中村・有馬・福島・池田・家康の旗本／西軍の石田・宇喜多）11/19 係 army-11（天王寺レベルの軍勢・60秒の本物 239→千八百以上）：
  //   川の向きに回した座標（kq＝局所 x が赤坂の側）。東軍は渡る所・刈田・有馬の陣・福島と池田の軽い備（132,10・170,−50・165,100）の脇に、西軍は葦の原（−74〜−18, 22〜72）・左近の林（−60,−52）・包みの所（−18,2）から外れた西の奥に塊。
  //   局所の z −15〜15（x 0〜130）の刈田の道は空ける。持ち場で待つだけ・勝ち負けの組に入らない
  k04_kuisegawa: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    kq('kuE1', '中村勢の後ろの備', 0, 108, -52, 3, -S / 2, 'toyotomi', '東軍 赤坂の側'),
    kq('kuE2', '有馬の後ろの備', 0, 108, 48, 3, -S / 2, 'kuki', '東軍 赤坂の側'),
    kq('kuE3', '福島正則の手の前', 0, 150, -30, 3, -S / 2, 'mizuno', '東軍 赤坂の側'),
    kq('kuE4', '池田輝政の手の前', 0, 148, 62, 3, -S / 2, 'ageha', '東軍 赤坂の側'),
    kq('kuE5', '福島正則の二の備', 0, 150, -95, 3, -S / 2, 'mizuno', '東軍 赤坂の側', { far: true, tLazy: true }),
    kq('kuE6', '徳川の旗本の前', 0, 185, -112, 3, -S / 2, 'tokugawa', '東軍 岡山のふもと', { far: true, tLazy: true }),
    kq('kuW1', '石田の備 北', 1, -125, -28, 3, S / 2, 'ishida', '西軍 大垣の側'),
    kq('kuW2', '石田の備 南', 1, -125, 28, 3, S / 2, 'ishida', '西軍 大垣の側'),
    kq('kuW3', '宇喜多の備', 1, -160, 75, 3, S / 2, 'ukita', '西軍 大垣の側', { far: true, tLazy: true }),
    kq('kuW4', '石田の後ろの備', 1, -165, -60, 3, S / 2, 'ishida', '西軍 大垣の側', { far: true, tLazy: true }),
    kq('kuW5', '宇喜多の二の備', 1, -205, 25, 3, S / 2, 'ukita', '西軍 大垣の側', { far: true, tLazy: true }),
    kq('kuW6', '石田三成の本陣の備', 1, -215, -45, 3, S / 2, 'ishida', '西軍 大垣の側', { far: true, tLazy: true }),
    kq('kuW7', '宇喜多の三の備', 1, -105, 105, 3, S / 2, 'ukita', '西軍 大垣の側', { far: true, tLazy: true }),
  ] },
  // 小田原征伐（11/14 MB係三 K297）：noFake で t12_odawara/hojin.js の全国の大名の陣（addDistantArmy・六つ）が空になり、陣幕と幟二本だけだった。
  //   同じ所に本物の塊と家の幟の林（秀吉の桐・堀・小早川・宇喜多の紺・信雄・秀次）。向きは城（51,-131）へ。本人（井伊の陣 164,-90）から 190m 内に入った時に置かれる
  t12_odawara: { keep: true, rows: [
    { key: 'hideyoshi', name: '豊臣秀吉の本陣（石垣山）', side: 0, x: -54, z: 104, w: 46, d: 18, count: 260, facing: 2.72, flag: 'toyotomi', armor: 0x23211e, row: '石垣山', leaders: [], blocks: [{ name: '秀吉の旗本 一の手', flag: 'toyotomi' }, { name: '秀吉の旗本 二の手', flag: 'toyotomi' }, { name: '秀吉の旗本 三の手', flag: 'toyotomi' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hori', name: '堀秀政の陣', side: 0, x: -46, z: 72, w: 24, d: 12, count: 80, facing: 2.69, flag: 'hori', armor: 0x23211e, row: '海蔵寺', leaders: [], blocks: [{ name: '堀秀政の備', flag: 'hori' }, { name: '堀の二の手', flag: 'hori' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'kobayakawa', name: '小早川隆景の陣', side: 0, x: -96, z: 70, w: 24, d: 12, count: 80, facing: 2.51, flag: 'kobayakawa', armor: 0x23211e, row: '堀の西', leaders: [], blocks: [{ name: '小早川隆景の備', flag: 'kobayakawa' }, { name: '小早川の二の手', flag: 'kobayakawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'ukita', name: '宇喜多秀家の陣', side: 0, x: -72, z: -22, w: 24, d: 12, count: 80, facing: 2.30, flag: 'ukita', armor: 0x23211e, row: '早川口の外', leaders: [], blocks: [{ name: '宇喜多秀家の備', flag: 'ukita' }, { name: '宇喜多の二の手', flag: 'ukita' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'nobukatsu', name: '織田信雄の陣', side: 0, x: -76, z: -110, w: 30, d: 14, count: 150, facing: 1.73, flag: 'nobukatsu', armor: 0x23211e, row: '北西の口の外', leaders: [], blocks: [{ name: '織田信雄の備', flag: 'nobukatsu' }, { name: '信雄の二の手', flag: 'nobukatsu' }, { name: '信雄の三の手', flag: 'nobukatsu' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hidetsugu', name: '羽柴秀次の陣', side: 0, x: -72, z: -166, w: 30, d: 14, count: 170, facing: 1.29, flag: 'toyotomi', armor: 0x23211e, row: '北の口', leaders: [], blocks: [{ name: '羽柴秀次の備', flag: 'toyotomi' }, { name: '秀次の二の手', flag: 'toyotomi' }, { name: '秀次の三の手', flag: 'toyotomi' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
  ] },
  // 関ヶ原（11/14 クラウドせ K127「戦場が狭い・振り返ると何も無い」）：noFake で遠くの軽い兵が空になり、始めの右・左・後ろが草原だけだった（reports/gate4/k06_sekigahara.jpg）。
  //   始まりの井伊の陣（-170,100）から 140m 内の、本物の隊の無い所に二陣・後備えを置く。西が西軍・東が東軍。出所 docs/fujin/k06_sekigahara.md
  //   本人の道（井伊の陣→宇喜多の先手前 -284,36・春日神社 -212,52）と島津の退き口（-112,-36→-60,40→-10,170）を空ける。
  //   西（福島の二陣 -196,14・筒井 -150,-4・宇喜多の二陣 -300,104）にも置くと宇喜多の先手が引き寄せられ段4が五百秒延びた（act bot 失敗）ので、東と南だけ
  //   11/14 クラウドす：keep＝本人が井伊の陣から宇喜多の前へ80m出ると、後ろの備が本物の上限の刈り込み（depth_reserve frontFill）で45秒までに消え、振り返ると草原だけだった
  //   11/18 クラウド kaito2（K358・K365「天王寺の出来に」）：携帯では始めの井伊の陣から 140m 外の備（宇喜多・小西・大谷の二の備ほか）が一度も立たず、
  //   874×402 の写真で宇喜多の前・藤堂の陣前が草原だけだった。天王寺と同じ deep（携帯で塊を肩の触れる厚い四角に）。lazy は本物の上限で近い備まで取っておきになり、立つ備が17→13に減ったので入れない
  //   11/17 クラウド kaito2（司令塔「遠い軍勢を本人150m外に厚く見せる」・K285 で絵の兵は足せない）：全部の行に幟の林（noboriAll）、携帯の本数を三＋二→六＋四に（nbTouch）
  //   11/19 クラウドさ（kaito_now 3「関ヶ原を天王寺の出来に・主人公が一人にならない」）：携帯で始まりの本人の60m内の本物が 47人（天王寺 179）。本人の道の脇の後備え五つを携帯でも塊 5〜6→12〜14人（tN）、
  //   始めに 183〜260m 先で霧に隠れる西の二の備（宇喜多・平塚・小西・大谷）は携帯だけ本人の 140m 内に来た時に立てる（tLazy）。始めの本物の合計はほぼ同じ
  k06_sekigahara: { keep: true, deep: true, noboriAll: true, nbTouch: [6, 4], rows: [
    { key: 'iiB', tN: 14, name: '井伊の後備え', side: 0, x: -118, z: 118, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'ii', armor: 0x8e1f16, row: '井伊 後備え', leaders: [] },
    { key: 'tadayoshi', tN: 14, name: '松平忠吉の後備え', side: 0, x: -126, z: 70, w: 24, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '松平 後備え', leaders: [] },
    { key: 'kyogoku', name: '京極高知の二陣', side: 0, x: -176, z: 196, w: 28, d: 8, count: 150, facing: -S * 0.7, flag: 'kyogoku', armor: 0x2e2a26, row: '藤堂・京極 二陣', leaders: [] },
    // 11/14 クラウドせ K127 残り「始め（霧の晴れる前）の右・左が空」：本人（始め -172,99→8秒で -206,80 へ馬で出る）の右＝北と左＝南の 40m 内に備を置く（60m より先の兵は写真で点にもならなかった）。
    //   北は福島の後ろの筒井・田中の後備え（春日神社 -212,52 と本人の道より東）、南は藤堂の後備え（大谷の前の平塚 -380,155 から二百m離す）
    //   11/14 クラウドす：筒井・田中を -188→-228 へ（宇喜多の前で斬り合う本人 -275,40 の真後ろ 47m。前は 90m 後ろで振り返ると草原だけ）
    { key: 'tsutsui', tN: 14, name: '筒井定次・田中吉政の後備え', side: 0, x: -228, z: 56, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '福島の後ろ', leaders: [] },
    //   11/14 クラウドす（K127 残り「始めの右」）：筒井を前へ移すと始め（-206,80）の右＝北が草原に戻ったので、元の筒井の所（本人の道より東・春日神社 -212,52 を空ける）に細川・加藤の後備えを百人
    //   11/14 クラウドし（K127 クラウドA の写真「始めの右に細川・加藤が写らない」）：一列の備は PC で12人・携帯で5人に削られ、31m 先で点にしかならなかった。
    //   家ごとの塊（細川＝九曜・加藤＝下がり藤）に分け、段の厚みと幟の林で立てる（PC 30人×2・携帯6人×2＋幟）
    { key: 'hosokawaB', tN: 12, name: '細川忠興・加藤嘉明の後備え', side: 0, x: -186, z: 56, w: 26, d: 9, count: 100, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '細川・加藤 後備え', leaders: [], blocks: [{ name: '細川忠興の後備え', flag: 'kuyo' }, { name: '加藤嘉明の後備え', flag: 'sagarifuji' }], blockW: 11, blockMax: 30, ranks: 4, nobori: true },
    { key: 'todoB', tN: 14, name: '藤堂高虎の後備え', side: 0, x: -200, z: 110, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'todo', armor: 0x2e2a26, row: '藤堂・京極 後備え', leaders: [] },
    // 11/14 クラウドし（K127 司令塔「終わりの段＝福島と宇喜多の槍合わせの四方は野原がほぼ空で七万同士に見えない」）：描かずの数で④の本人の80m内は
    //   味方287に敵は明石・二番手の40ほど（敵の全部で78）。布陣図の「宇喜多 一万七千・軽い二の備五千（-372,72）」は K285 の noFake で消えていた。
    //   明石の先手（-320,55）の後ろ30mに宇喜多の二の備を本物の塊三つ（児の字の旗・幟の林）で立てる。持ち場で待ち、寄れば斬り合う。寝返りで崩れる（westFall）。
    //   始めの本人（-172,99）から183mなので far（携帯でも置く・携帯は二塊×6人）
    { key: 'ukitaB', tLazy: true, name: '宇喜多の二の備', side: 1, x: -352, z: 70, w: 44, d: 12, count: 300, facing: S / 2, flag: 'ukita', armor: 0x2c2a2a, row: '宇喜多 二の備', leaders: [], far: true,
      blocks: [{ name: '宇喜多の二の備 右の手' }, { name: '宇喜多の二の備 中の手' }, { name: '宇喜多の二の備 左の手' }], blockW: 13, blockMax: 28, ranks: 5, nobori: true },
    // 11/16 K292 クラウドせ（上空の引き 60秒＝本人の後ろから西を見ると、塊は宇喜多の二の備の三つと先手だけ・小西と大谷の後ろは野だけ）：
    //   布陣図（army_depth_plans の konishi2・otani2）の小西の二の備・大谷の二の備を、家の旗の塊二つずつ・幟の林で立てる。始めの本人（-172,99）から 260m の内（far）。
    //   持ち場で待つだけ（本人の道は宇喜多の先手の前と平塚の前まで＝ここから70m 以上離れる）。寝返りの後の崩れ（otaniFall・westFall）で退く。PC 一塊20人・携帯6人
    //   11/16 クラウドせ（K292 続き「一枚に塊は八つ」）：小西の左の手（z-19）が始めの本人から 261m で far の 260m を越え立っていなかった→x -405→-400。
    //   宇喜多の二の備と大谷の二の備の間（平塚・戸田の山中の前）と、宇喜多の二の備と小西の間（秀家の旗本の後ろ）が野だったので、布陣図の「大谷・平塚・戸田」「宇喜多 一万七千」から塊を足す
    { key: 'hiratsukaB', tLazy: true, name: '平塚・戸田の備', side: 1, x: -392, z: 112, w: 30, d: 12, count: 200, facing: S / 2, flag: 'otani', armor: 0x2c2a2a, row: '平塚・戸田', leaders: [], far: true,
      blocks: [{ name: '平塚為広の備' }, { name: '戸田重政の備' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'ukitaH', tLazy: true, name: '宇喜多の旗本の後備え', side: 1, x: -388, z: 28, w: 16, d: 12, count: 100, facing: S / 2, flag: 'ukita', armor: 0x2c2a2a, row: '宇喜多 旗本', leaders: [], far: true,
      blocks: [{ name: '宇喜多の旗本の後備え' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'konishiB', tLazy: true, name: '小西の二の備', side: 1, x: -400, z: -12, w: 30, d: 12, count: 200, facing: S / 2, flag: 'konishi', armor: 0x2c2a2a, row: '小西 二の備', leaders: [], far: true,
      blocks: [{ name: '小西の二の備 右の手' }, { name: '小西の二の備 左の手' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'otaniB', tLazy: true, name: '大谷の二の備', side: 1, x: -420, z: 150, w: 30, d: 12, count: 200, facing: S / 2, flag: 'otani', armor: 0x2c2a2a, row: '大谷 二の備', leaders: [], far: true,
      blocks: [{ name: '大谷の二の備 右の手' }, { name: '大谷の二の備 左の手' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'yamauchi', name: '山内一豊・有馬豊氏（南宮山の押さえ）', side: 0, x: -84, z: 176, w: 30, d: 8, count: 150, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '南宮山の押さえ', leaders: ['山内一豊'] },
  ] },
  // 三方ヶ原（11/14 クラウド束A前半・K125「武田が少なすぎ・武田は魚鱗」）：b_mikatagahara.js の魚鱗（TAKEDA_JIN・本陣 z=-106、先鋒 z=-68）の
  //   両の鱗（第二陣・第三陣の外）と本陣の後ろに、武田の備を足して魚鱗の三角を厚くする（noFake の戦なので本物の備）。出所 docs/fujin/mikatagahara.md
  // 11/14 iMac十一：keep＝本人が先へ出ても上限の刈り込みで魚鱗の外の鱗・本陣の後ろを外さない（56秒で小幡・馬場・信玄の後備えが消えていた）
  // 11/14 iMac十一：本物の合計を約290以下に収めるため人数は半分（形と置き場はそのまま）
  // 11/15 iMac三十四（K210）：名の無い後備え・寄騎の五行は人数を約七割に（パソコンで一行 12〜16→8〜11人。150秒の最大 314→290 の内。携帯は最小の5人のまま）
  // 佐和山（11/18 クラウド kaito2 K358・K365「天王寺の出来に」）：寄せ手一万五千が、本丸の頂から見下ろしても大手の外の田に小早川の本陣と先手（本物）しか無く、
  //   尾根の上の写真で裾野が空だった。出所 b_k07_sawayama.js の頭（小早川・脇坂は東の大手・田中は西の搦手）と docs/journey/k07_sawayama.md。
  //   東の田（本人の寄せ口 152,0 と本陣 172,0・朽木と赤座の陣 164,±40 を空ける）の奥に小早川の二陣・後備えを、西の湖の側に田中の後備えを、家の幟の林で置く。城（西）を向く
  k07_sawayama: { keep: true, deep: true, rows: [
    { key: 'kobaB', name: '小早川の二陣', side: 0, x: 194, z: -30, w: 30, d: 12, count: 300, facing: -S / 2, flag: 'sashi:kobayakawa:#ece6d6:#16140f', armor: 0x2e2a26, row: '大手の外 二陣', leaders: [], blocks: [{ name: '小早川の二陣 一の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }, { name: '小早川の二陣 二の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'kobaC', name: '小早川の後備え', side: 0, x: 194, z: 30, w: 30, d: 12, count: 300, facing: -S / 2, flag: 'sashi:kobayakawa:#ece6d6:#16140f', armor: 0x2e2a26, row: '大手の外 後備え', leaders: [], blocks: [{ name: '小早川の後備え 一の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }, { name: '小早川の後備え 二の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'tanakaB', name: '田中吉政の後備え', side: 0, x: -140, z: -26, w: 28, d: 10, count: 200, facing: S / 2, flag: 'kuki', armor: 0x2e2a26, row: '搦手の外', leaders: [], blocks: [{ name: '田中の後備え 一の手', flag: 'kuki' }, { name: '田中の後備え 二の手', flag: 'kuki' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
  ] },
  // 11/18 クラウド k365-cloud-37（一枚表③△「200秒 柵の向こうに鉄砲衆の小さな塊・手前の野は空き」・布陣表 docs/fujin/k16_secret.md「大軍の厚みは未実装」）：
  //   創作の総勢（連合 8万7千・徳川 14万3千）の見え方を、京街道（x≒0）と陣幕の口・柵の口を避けた所に本物の備で足す（深い塊と家の幟の林）。
  //   徳川：二重の柵の奥の東西と、秀忠の陣の西。連合：主人公の組の後ろの東西。どれも持ち場で待つだけ（hold）・段の勝ち負けの組には入らない
  k16_secret: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    // 11/19 係（kaito「天王寺レベルの軍勢」・元和天下返し）：両軍の本物の兵を千八百以上に（創作の総勢 連合 8万7千・徳川 14万3千の見え方を家ごとの塊で厚く）。
    //   連合は主人公の組の後ろと東西の野（南＝＋z・北向き＝S）、徳川は二重の柵の奥の東西と秀忠の陣の周り（北＝−z・南向き＝0）。
    //   京街道（x≈0）・柵の口・陣幕の口（0,−156）・家康の陣幕（0,−166）の周り・東の林の伏せ（96,−50）・西の堤（x≈−122）は空ける。持ち場で待つだけ（noEngage）
    blk('rsA1', '連合 西の備 一', 0, -92, 70, 3, S, 'mori', '連合 西の野'),
    blk('rsA2', '連合 西の備 二', 0, -92, 118, 3, S, 'mori', '連合 西の野'),
    blk('rsA3', '連合 西の備 三', 0, -52, 148, 3, S, 'mori', '連合 後ろ'),
    blk('rsA4', '連合 中の後備え', 0, -34, 128, 3, S, 'shimazu', '連合 後ろ'),
    blk('rsA5', '連合 東の後備え', 0, 38, 136, 3, S, 'shimazu', '連合 後ろ'),
    blk('rsA6', '連合 東の備 一', 0, 90, 108, 3, S, 'shimazu', '連合 東の野'),
    blk('rsA7', '連合 東の備 二', 0, 108, 66, 3, S, 'shimazu', '連合 東の野'),
    blk('rsA8', '連合 東の備 三', 0, 132, 122, 3, S, 'shimazu', '連合 東の野'),
    blk('rsA9', '連合 西の後ろ', 0, -100, 170, 3, S, 'mori', '連合 後ろ'),
    blk('rsA10', '連合 東の後ろ', 0, 64, 176, 3, S, 'shimazu', '連合 後ろ'),
    blk('rsA11', '連合 西の脇', 0, -86, 28, 3, S, 'mori', '連合 西の野'),
    blk('rsA12', '連合 東の脇', 0, 92, 30, 3, S, 'shimazu', '連合 東の野'),
    blk('rsT1', '徳川の後備え 西の奥', 1, -100, -154, 3, 0, 'tokugawa', '徳川 柵の奥 西', { far: true, tLazy: true }),
    blk('rsT2', '徳川の後備え 西の奥二', 1, -100, -206, 3, 0, 'tokugawa', '徳川 柵の奥 西', { far: true, tLazy: true }),
    blk('rsT3', '徳川の後備え 西の後ろ', 1, -70, -172, 3, 0, 'tokugawa', '徳川 柵の奥 西', { far: true, tLazy: true }),
    blk('rsT4', '徳川の後備え 東の後ろ', 1, 62, -176, 3, 0, 'honda', '徳川 柵の奥 東', { far: true, tLazy: true }),
    blk('rsT5', '徳川の後備え 東の奥', 1, 108, -150, 3, 0, 'honda', '徳川 柵の奥 東', { far: true, tLazy: true }),
    blk('rsT6', '徳川の後備え 東の奥二', 1, 108, -206, 3, 0, 'tokugawa', '徳川 柵の奥 東', { far: true, tLazy: true }),
    blk('rsT7', '徳川の後備え 東の端', 1, 148, -176, 3, 0, 'honda', '徳川 柵の奥 東', { far: true, tLazy: true }),
    { key: 'tkW', name: '徳川の後備え 西', side: 1, x: -62, z: -142, w: 22, d: 10, count: 150, facing: 0, flag: 'tokugawa', armor: 0x2a2622, row: '柵の奥 西', leaders: [], ranks: 4 },
    { key: 'tkE', name: '徳川の後備え 東', side: 1, x: 66, z: -142, w: 22, d: 10, count: 150, facing: 0, flag: 'honda', armor: 0x2a2622, row: '柵の奥 東', leaders: [], ranks: 4 },
    { key: 'tkR', name: '秀忠の手', side: 1, x: -58, z: -198, w: 24, d: 10, count: 150, facing: 0, flag: 'tokugawa', armor: 0x2a2622, row: '本陣の後ろ 西', leaders: [], ranks: 4 },
    { key: 'alW', name: '毛利の後備え', side: 0, x: -44, z: 96, w: 22, d: 10, count: 150, facing: S, flag: 'mori', armor: 0x2e2a26, row: '連合 後備え 西', leaders: [], ranks: 4 },
    { key: 'alE', name: '島津の後備え', side: 0, x: 50, z: 96, w: 22, d: 10, count: 150, facing: S, flag: 'shimazu', armor: 0x2e2a26, row: '連合 後備え 東', leaders: [], ranks: 4 },
  ] },
  // 11/19 クラウド k365-cloud-37（一枚表③△「中津留の河原の包囲の段で味方も島津もまばら」・docs/fujin/t06_hetsugi.md）：
  //   島津家久の本隊（尾根の陰 0,−182）のさらに奥・東西に、本隊の後ろの備（島津は一万〜一万三千）を本物の塊と幟で足す。
  //   伏せ（西の林 −60,−88・東の林 108,−100）には置かない。本人が河原へ寄るまで立たない（lazy・携帯 140m）。持ち場で待つだけ・勝ち負けの組に入らない
  // 11/19 係（kaito 11/19「天王寺レベルの軍勢」：60秒の両軍の本物の兵を天王寺の八割＝千八百以上に。前は 313）：
  //   豊臣方（六千）は北の岸の渡る前の陣（長宗我部元親の残り・十河・仙石・大友の手）に、島津方（一万二千）は家久の本隊（0,−182）の奥の二列と、
  //   尾根の東西に、家ごとの塊（blocks・一塊 44 人）と幟の林で置く。伏せの林（−60,−88・108,−100）と鶴賀城（70,−150）・鏡城の丘（−186,134）・
  //   浅瀬の道には置かない。島津の奥は far（本人の 260m 内で立つ・携帯は tLazy で 140m）。持ち場で待つだけ・勝ち負けの組に入らない（keep で枠の外しにも消えない）。
  //   idleFar：携帯で本人から遠く待つだけの表の備を休ませる（idle_far.js・k15 と同じ手）
  // 11/19 係（kaito 11/19「戸次川を渡ってもついて来なかった・地形を広く」）：各行に moves（段ごとの行き先）。浅瀬（主 x20・西 x−70）を通って渡る（cross）
  t06_hetsugi: { deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], cross: { at: 0, mouth: 28, fords: [{ x: 20, w: 22 }, { x: -70, w: 12 }] }, rows: [
    // 豊臣方（北の岸・南＝−z を向く）
    { key: 'motoR', name: '長宗我部元親の本隊', side: 0, x: -150, z: 128, w: 39, d: 12, count: 600, facing: S, flag: 'chosokabe', armor: 0x2a2622, row: '北の岸 元親の残り', leaders: [], blocks: [{ name: '元親の旗本の残り' }, { name: '元親の馬廻り' }, { name: '元親の後備え' }], ranks: 4, moves: hMv([-30, 82], [-20, -24], [-24, -62], [-140, 112]) },
    { key: 'chosoB', name: '長宗我部の二の手', side: 0, x: -95, z: 136, w: 39, d: 12, count: 600, facing: S, flag: 'chosokabe', armor: 0x2a2622, row: '北の岸 二の手', leaders: [], blocks: [{ name: '土佐の一領具足 一の手' }, { name: '土佐の一領具足 二の手' }, { name: '土佐の一領具足 三の手' }], ranks: 4, moves: hMv([-24, 48], [-12, -44], [-6, -84], [-96, 92]) },
    { key: 'sogoB', name: '十河の後備え', side: 0, x: -40, z: 112, w: 26, d: 12, count: 400, facing: S, flag: 'miyoshi', armor: 0x2c2826, row: '北の岸 十河', leaders: [], blocks: [{ name: '讃岐勢の後備え' }, { name: '讃岐勢の荷駄の守り' }], ranks: 4, moves: hMv([52, 70], [64, -28], [66, -74], [-50, 74]) },
    { key: 'senB', name: '仙石の後備え', side: 0, x: 8, z: 94, w: 39, d: 12, count: 600, facing: S, flag: 'toyotomi', armor: 0x2a2420, row: '北の岸 仙石', leaders: [], blocks: [{ name: '仙石の後備え 左' }, { name: '仙石の後備え 中' }, { name: '仙石の後備え 右' }], ranks: 4, moves: hMv([62, 40], [88, -44], [88, -84], [-10, 82]) },
    { key: 'otomoB', name: '大友の手', side: 0, x: -214, z: 58, w: 26, d: 12, count: 400, facing: S, flag: 'otomo', armor: 0x2a2622, row: '北の岸 大友', leaders: [], blocks: [{ name: '大友の手 戸次の衆' }, { name: '大友の手 鏡城の衆' }], ranks: 4, moves: hMv([-66, 44], [-56, -34], [-44, -76], [-170, 60]) },
    // 島津方（南の岸の奥・北＝+z を向く）
    { key: 'shzB1', name: '島津の後備え 西の端', side: 1, x: -150, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '島津の後備え 西一' }, { name: '島津の後備え 西二' }, { name: '島津の後備え 西三' }], ranks: 4, far: true, tLazy: true, moves: hAm(-36, -40, S * 0.75) },
    { key: 'shzB2', name: '島津の後備え 西', side: 1, x: -100, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '島津の後備え 西四' }, { name: '島津の後備え 西五' }, { name: '島津の後備え 西六' }], ranks: 4, far: true, tLazy: true, moves: hAm(-64, -150, S / 4) },
    { key: 'shzB3', name: '島津の後備え 西寄り', side: 1, x: -50, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '薩摩勢 一番' }, { name: '薩摩勢 二番' }, { name: '薩摩勢 三番' }], ranks: 4, far: true, tLazy: true, moves: hAm(-22, -146) },
    { key: 'shzB4', name: '家久の旗本の奥', side: 1, x: 0, z: -220, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '家久の旗本 後ろの一' }, { name: '家久の旗本 後ろの二' }, { name: '家久の旗本 後ろの三' }], ranks: 4, far: true, tLazy: true, moves: hAm(22, -156) },
    { key: 'shzB5', name: '島津の後備え 東寄り', side: 1, x: 50, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '大隅勢 一番' }, { name: '大隅勢 二番' }, { name: '大隅勢 三番' }], ranks: 4, far: true, tLazy: true, moves: hAm(64, -146) },
    { key: 'shzB6', name: '島津の後備え 東', side: 1, x: 100, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '日向勢 一番' }, { name: '日向勢 二番' }, { name: '日向勢 三番' }], ranks: 4, far: true, tLazy: true, moves: hAm(78, -36, -S * 0.75) },
    { key: 'shzB7', name: '島津の後備え 東の端', side: 1, x: 150, z: -218, w: 39, d: 12, count: 600, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '本隊の奥', leaders: [], blocks: [{ name: '島津の後備え 東一' }, { name: '島津の後備え 東二' }, { name: '島津の後備え 東三' }], ranks: 4, far: true, tLazy: true, moves: hAm(124, -132, -S / 4) },
    { key: 'shzM1', name: '島津の尾根の備 西の端', side: 1, x: -150, z: -180, w: 26, d: 12, count: 400, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '尾根の西', leaders: [], blocks: [{ name: '尾根の西の備 一' }, { name: '尾根の西の備 二' }], ranks: 4, far: true, tLazy: true, moves: hAm(-92, -72, S / 2) },
    { key: 'shzM2', name: '島津の尾根の備 西', side: 1, x: -100, z: -180, w: 26, d: 12, count: 400, facing: 0, flag: 'shimazu', armor: 0x1c1a1a, row: '尾根の西', leaders: [], blocks: [{ name: '尾根の西の備 三' }, { name: '尾根の西の備 四' }], ranks: 4, far: true, tLazy: true, moves: hAm(-80, -112, S / 3) },
    { key: 'shzM3', name: '島津の尾根の備 東', side: 1, x: 122, z: -182, w: 26, d: 12, count: 400, facing: -Math.PI / 6, flag: 'shimazu', armor: 0x1c1a1a, row: '尾根の東', leaders: [], blocks: [{ name: '尾根の東の備 一' }, { name: '尾根の東の備 二' }], ranks: 4, far: true, tLazy: true, moves: hAm(136, -76, -S / 2) },
    { key: 'shzM4', name: '島津の尾根の備 東の端', side: 1, x: 168, z: -180, w: 26, d: 12, count: 400, facing: -Math.PI / 6, flag: 'shimazu', armor: 0x1c1a1a, row: '尾根の東', leaders: [], blocks: [{ name: '尾根の東の備 三' }, { name: '尾根の東の備 四' }], ranks: 4, far: true, tLazy: true, moves: hAm(136, -108, -S / 3) },
  ] },
  // 11/19 係（kaito「天王寺レベルの軍勢」・「追撃するまで兵は一切柵の外に出ない」・docs/fujin/shitaragahara.md）：前は 60秒で 819。
  //   柵（x＝14・7・0）の内（x≦−20）だけに、織田（大宮前の後ろ・佐久間と滝川の間・野々村の後ろ）を家ごとの塊（一塊 44 人）と幟の林で置く。東（+x）を向き、持ち場で待つだけ。
  //   柵の口（大宮前 z−280）の前と、本物の将の陣（ALLIED_POSTS・REAR_POSTS）には重ねない。始めの本人（−16,−261）の 190m 内なので始めに立つ。
  //   上限（realCap）はパソコンだけ この表の分（fujinRealN）を足す＝筋書きの寄せ・新手の空きは前と同じ
  //   withEmpty：表は足すだけなので、陣立ての入れ物の本物（depth_real.js）も前のとおり立てる（本能寺も同じ）
  // 11/19 kaito「後詰めの備ももっとちゃんと前に」：一の列 x−38→−24・二の列 x−95〜−100→−50（柵の後ろの将 x−10 のすぐ後ろに二重に厚く）
  shitaragahara: { stayPut: true, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    { key: 'oL2a', name: '佐久間の後備え', side: 0, x: -50, z: -420, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '佐久間の後備え 一' }, { name: '佐久間の後備え 二' }, { name: '佐久間の後備え 三' }], ranks: 4 },
    { key: 'oL2b', name: '滝川の後備え', side: 0, x: -50, z: -370, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '滝川の後備え 一' }, { name: '滝川の後備え 二' }, { name: '滝川の後備え 三' }], ranks: 4 },
    { key: 'oL2c', name: '大宮前の後備え', side: 0, x: -50, z: -310, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '大宮前の後備え 一' }, { name: '大宮前の後備え 二' }, { name: '大宮前の後備え 三' }], ranks: 4 },
    { key: 'oL2d', name: '羽柴の先手', side: 0, x: -50, z: -250, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '羽柴の先手 一' }, { name: '羽柴の先手 二' }, { name: '羽柴の先手 三' }], ranks: 4 },
    { key: 'oL2e', name: '丹羽の先手', side: 0, x: -50, z: -190, w: 39, d: 12, count: 600, facing: S / 2, flag: 'sujikai', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '丹羽の先手 一' }, { name: '丹羽の先手 二' }, { name: '丹羽の先手 三' }], ranks: 4 },
    { key: 'oL2f', name: '野々村の後備え', side: 0, x: -50, z: -130, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '野々村の後備え 一' }, { name: '野々村の後備え 二' }, { name: '野々村の後備え 三' }], ranks: 4 },
    { key: 'oL1a', name: '佐久間の脇備え', side: 0, x: -24, z: -400, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '佐久間の脇備え 一' }, { name: '佐久間の脇備え 二' }], ranks: 4 },
    { key: 'oL1b', name: '野々村の脇備え', side: 0, x: -24, z: -228, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '野々村の脇備え 一' }, { name: '野々村の脇備え 二' }], ranks: 4 },
    { key: 'oL1c', name: '柴田の先手', side: 0, x: -24, z: -165, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '柴田の先手 一' }, { name: '柴田の先手 二' }], ranks: 4 },
    { key: 'oL1d', name: '佐々の後備え', side: 0, x: -24, z: -118, w: 26, d: 12, count: 400, facing: S / 2, flag: 'shuro', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '佐々の後備え 一' }, { name: '佐々の後備え 二' }], ranks: 4 },
  ] },
  // 11/19 係（kaito「天王寺レベルの軍勢」・本能寺の物差し＝明智勢 約一万三千が寺の四方の通りを埋める・docs/fujin/honnoji.md）：前は 60秒で 247。
  //   寺（築地 x −151〜−31・z −16〜104）の外の四方の通り（西＝油小路 x−164 とその西・北＝六角 z−30・南＝蛸薬師 z119・東＝西洞院の外 x−10 と町の通り x27）に、
  //   明智の塊（一塊 44 人・桔梗の幟）を寺へ向けて置く。門（表門 −31,50・北の脇門 −48・裏門 z76・勝手口 −47）の口と、北の築地を越える所（−66）は空ける。
  //   寺と家の中には置かない。持ち場で待つだけ（noEngage：塀の内の織田に寄せない。寄せは台本の波が出す）。信長方（百ほど）は足さない
  //   幟の林は後ろの空いた行だけ（nobori）。油小路と西洞院の通りの行は、塊の後ろがすぐ町家なので幟を立てない（屋根を突き抜けた）
  honnoji: { withEmpty: true, deep: true, keep: true, idleFar: true, nbTouch: [4, 2], rows: [
    // 西（油小路）
    { key: 'akW1', name: '明智秀満の手 油小路の北', side: 1, x: -164, z: 10, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路', leaders: [], blocks: [{ name: '油小路の備 一' }, { name: '油小路の備 二' }, { name: '油小路の備 三' }], ranks: 4, noEngage: true },
    { key: 'akW2', name: '明智秀満の手 油小路の中', side: 1, x: -164, z: 46, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路', leaders: [], blocks: [{ name: '油小路の備 四' }, { name: '油小路の備 五' }, { name: '油小路の備 六' }], ranks: 4, noEngage: true },
    { key: 'akW3', name: '明智秀満の手 油小路の南', side: 1, x: -164, z: 96, w: 26, d: 8, count: 400, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路', leaders: [], blocks: [{ name: '油小路の備 七' }, { name: '油小路の備 八' }], ranks: 4, noEngage: true },
    { key: 'akWo1', name: '明智の後備え 油小路の西 北', side: 1, x: -196, z: 0, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 一' }, { name: '油小路の西の備 二' }, { name: '油小路の西の備 三' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akWo2', name: '明智の後備え 油小路の西 中', side: 1, x: -196, z: 44, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 四' }, { name: '油小路の西の備 五' }, { name: '油小路の西の備 六' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akWo3', name: '明智の後備え 油小路の西 南', side: 1, x: -196, z: 88, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 七' }, { name: '油小路の西の備 八' }, { name: '油小路の西の備 九' }], ranks: 4, noEngage: true, nobori: true },
    // 北（六角）
    { key: 'akWo4', name: '明智の後備え 油小路の西 六角の辻', side: 1, x: -196, z: -40, w: 39, d: 8, count: 600, facing: S / 4, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '六角の辻の備 一' }, { name: '六角の辻の備 二' }, { name: '六角の辻の備 三' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akN1', name: '斎藤利三の手 六角の西', side: 1, x: -135, z: -30, w: 39, d: 8, count: 600, facing: 0, flag: 'akechi', armor: 0x2a2622, row: '六角', leaders: [], blocks: [{ name: '六角の備 一' }, { name: '六角の備 二' }, { name: '六角の備 三' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akN2', name: '斎藤利三の手 六角の中', side: 1, x: -96, z: -30, w: 26, d: 8, count: 400, facing: 0, flag: 'akechi', armor: 0x2a2622, row: '六角', leaders: [], blocks: [{ name: '六角の備 四' }, { name: '六角の備 五' }], ranks: 4, noEngage: true, nobori: true },
    // 南（蛸薬師）
    { key: 'akS1', name: '明智光秀の手 蛸薬師の西', side: 1, x: -133, z: 119, w: 39, d: 8, count: 600, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 一' }, { name: '蛸薬師の備 二' }, { name: '蛸薬師の備 三' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akS2', name: '明智光秀の手 蛸薬師の中', side: 1, x: -109, z: 119, w: 13, d: 8, count: 200, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 四' }], ranks: 4, noEngage: true, nobori: true },
    // 蛸薬師の木戸（柱 x−98・−84）の口は空ける
    { key: 'akS3', name: '明智光秀の手 蛸薬師の東', side: 1, x: -76, z: 119, w: 13, d: 8, count: 200, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 五' }], ranks: 4, noEngage: true, nobori: true },
    // 東（西洞院の外・町の通り x27）
    { key: 'akE1', name: '明智光忠の手 西洞院の北', side: 1, x: -10, z: 4, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '西洞院', leaders: [], blocks: [{ name: '西洞院の備 一' }, { name: '西洞院の備 二' }], ranks: 4, noEngage: true },
    { key: 'akE2', name: '明智光忠の手 西洞院の南', side: 1, x: -10, z: 98, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '西洞院', leaders: [], blocks: [{ name: '西洞院の備 三' }, { name: '西洞院の備 四' }], ranks: 4, noEngage: true },
    { key: 'akE3', name: '明智の後備え 町の通りの北', side: 1, x: 27, z: 10, w: 39, d: 8, count: 600, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 一' }, { name: '町の通りの備 二' }, { name: '町の通りの備 三' }], ranks: 4, noEngage: true },
    { key: 'akE4', name: '明智の後備え 町の通りの南', side: 1, x: 27, z: 60, w: 39, d: 8, count: 600, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 四' }, { name: '町の通りの備 五' }, { name: '町の通りの備 六' }], ranks: 4, noEngage: true },
    { key: 'akE5', name: '明智の後備え 町の通りの南の辻', side: 1, x: 27, z: 110, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 七' }, { name: '町の通りの備 八' }], ranks: 4, noEngage: true },
  ] },
  // 11/19 クラウド k365-cloud-37（遠景の大軍・120秒の並べ見で一番薄い：千代川の岸の夜に柵の内の幟だけ・司令塔の許し）：
  //   秀吉の囲みの付城（b_tottori.js の TOTTORI_ATTACK＝円護寺・雁金山・太閤ヶ平。軽い兵は 11/4 kaito AP9・AV4 で置かない）に本物の備を立てる。
  //   本人の岸から 200m 先なので far（260m の内で立てる）。持ち場で待つだけ・味方・勝ち負けの組に入らない（敵味方の強さは変えない）
  // 11/19 係（kaito 11/19「天王寺レベルの軍勢」：課金の入口の四戦の 60秒の両軍の本物を千八百以上に。前は 桶狭間 284・森部 318・墨俣 291・稲葉山 231）：
  //   家ごとの塊（blk・一塊 44 人）と幟の林。持ち場で待つだけ（noEngage）・勝ち負けの組に入らない（keep で枠の外しにも消えない）。
  //   主人公の道・任務の場所・建物・柵・川には置かない。遠い行は lazy（近づけば立つ）・far は 260m の内で立つ（携帯は tLazy で 140m）。
  //   withEmpty：表は足すだけ（陣立ての入れ物の本物も前のとおり）。idleFar：携帯で遠く待つだけの塊を休ませる（idle_far.js）
  // 桶狭間（docs/fujin/okehazama.md：今川の本陣の周り六千・信長二千足らず）。座標は戦場の座標（b_okehazama.js の fieldPoint をかけた後）。
  //   織田は雨の谷（P1 の道 z−20〜−35）の南に信長の本隊の残り、今川は義元の本陣（110,33）の南・東・北の坂に休む備（地形の細かい所 x≦165 の内）。
  //   突撃の道（46,−2→76,28→112,33）と本陣の幕の内の周り二十五 m は空ける
  okehazama: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('okO1', '信長の馬廻りの後ろ', 0, -20, -72, 3, S / 2, 'eiraku', '織田 谷の南'),
    blk('okO2', '信長の本隊の徒', 0, -62, -66, 3, S / 2, 'oda', '織田 谷の南'),
    blk('okO3', '信長の本隊の後ろ', 0, -100, -58, 2, S / 2, 'oda', '織田 谷の南'),
    blk('okI1', '今川の本陣南の坂の備', 1, 96, -52, 3, -S / 2, 'imagawa', '今川 本陣の南'),
    blk('okI2', '井伊の後備え', 1, 142, -44, 3, -S / 2, 'imagawa', '今川 本陣の南'),
    blk('okI3', '今川の旗本の東の備', 1, 150, 0, 3, -S / 2, 'imagawa', '今川 本陣の東'),
    blk('okI4', '今川の旗本の東の二の手', 1, 148, 62, 3, -S / 2, 'imagawa', '今川 本陣の東'),
    blk('okI5', '今川の後備え 南', 1, 112, -96, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blk('okI6', '今川の後備え 中', 1, 152, -86, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blk('okI7', '今川の後備え 北', 1, 150, 116, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blk('okI8', '今川の本陣北の坂の備', 1, 130, 100, 3, -S * 0.75, 'imagawa', '今川 本陣の北'),
    blk('okI9', '今川の北の休む備', 1, 82, 108, 3, -S * 0.75, 'imagawa', '今川 本陣の北'),
    blk('okI10', '松井の後備え', 1, 60, -66, 3, -S / 2, 'imagawa', '今川 本陣の南'),
  ] },
  // 森部（docs/fujin/moribe.md：織田 千五百・斎藤 六千）。北（−z）が斎藤、南が織田。楡俣川 z≈88・あふれた流れ z≈47（x−26〜58）。
  //   斎藤は横に並ぶ備え（z−56〜−78）の東西の外と奥の二列に、織田は川の南の後詰（丹羽・佐久間）。真ん中の戦場（x−60〜50）・道（ROAD2）・薬師堂（66,46）は空ける
  moribe: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('mbO1', '丹羽長秀の後詰', 0, -78, 140, 3, S, 'oda', '織田 川の南の後詰'),
    blk('mbO2', '佐久間信盛の後詰', 0, 36, 166, 3, S, 'oda', '織田 川の南の後詰'),
    blk('mbO3', '織田の旗本の後ろ', 0, 98, 136, 3, S, 'eiraku', '織田 川の南の後詰'),
    blk('mbS1', '日比野の手 東の外', 1, 78, -70, 3, 0, 'saito', '斎藤 一の備えの外'),
    blk('mbS2', '斎藤の先手の東の備', 1, 104, -22, 3, -S / 6, 'saito', '斎藤 一の備えの外'),
    blk('mbS3', '長井の手 西の外', 1, -112, -76, 3, 0, 'saito', '斎藤 一の備えの外', { far: true, tLazy: true }),
    blk('mbS4', '斎藤の控え 東', 1, 128, -66, 3, 0, 'saito', '斎藤 一の備えの外', { far: true, tLazy: true }),
    blk('mbS5', '斎藤の後ろ 西', 1, -92, -122, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blk('mbS6', '斎藤の後ろ 東', 1, 62, -122, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blk('mbS7', '斎藤の後ろ 東の端', 1, 116, -114, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blk('mbS8', '斎藤の後ろの奥 西', 1, -30, -166, 3, 0, 'saito', '斎藤 後ろの奥', { far: true, tLazy: true }),
    blk('mbS9', '斎藤の後ろの奥 東', 1, 50, -170, 3, 0, 'saito', '斎藤 後ろの奥', { far: true, tLazy: true }),
  ] },
  // 墨俣（docs/fujin/sunomata.md：砦の内百八十・寄せ手の斎藤は一の手〜三の手と寄せ大将で千六百・本陣三千）。砦は ±18、長良川は x62〜112。
  //   斎藤は北と西の陣の空き地（SUNO_CAMP_CLEAR）と東岸（x146〜150）に砦へ向けて、織田は南の空き地に後詰（信長の先手）。
  //   北の道（x≈0）・砦の門・運びの道（SUPPLY_GUIDE）・岸を進退する六隊（x122）・川の中は空ける
  sunomata: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('suO1', '織田の後詰 西', 0, -36, 102, 3, S, 'oda', '織田 南の後詰'),
    blk('suO2', '織田の後詰 東', 0, 34, 106, 3, S, 'oda', '織田 南の後詰'),
    blk('suO3', '織田の後詰 荷の守り', 0, -128, 88, 3, S * 0.8, 'oda', '織田 南の後詰'),
    blk('suN1', '斎藤の北の寄せの備', 1, -30, -150, 3, 0.1, 'saito', '斎藤 北'),
    blk('suN2', '斎藤の北東の備', 1, 34, -120, 3, 0, 'saito', '斎藤 北'),
    blk('suN3', '斎藤の北西の備', 1, -120, -106, 2, 0.85, 'saito', '斎藤 北西'),
    blk('suN4', '斎藤の北の後ろの備', 1, -80, -132, 3, 0.4, 'saito', '斎藤 北'),
    blk('suW1', '斎藤の西の寄せの備', 1, -150, -12, 2, S / 2, 'saito', '斎藤 西'),
    blk('suE1', '斎藤の東岸の備 一', 1, 150, -62, 3, -S / 2, 'saito', '斎藤 東岸'),
    blk('suE2', '斎藤の東岸の備 二', 1, 150, -8, 3, -S / 2, 'saito', '斎藤 東岸'),
    blk('suE3', '斎藤の東岸の備 三', 1, 150, 50, 3, -S / 2, 'saito', '斎藤 東岸'),
    blk('suE4', '斎藤の東岸の備 四', 1, 150, 110, 3, -S / 2, 'saito', '斎藤 東岸'),
    blk('suE5', '斎藤の東岸の備 五', 1, 150, -118, 3, -S / 2, 'saito', '斎藤 東岸'),
  ] },
  // 稲葉山（docs/fujin/inabayama.md：織田 一万二千〜一万五千・斎藤の城兵 四千）。北（−z）が金華山、南が井口の町、西を長良川（x−127〜−165）が流れる。
  //   織田は町の南の野（瑞龍寺山の道 ROAD と本陣・佐久間・滝川の備の間を空けて）・東の野（佐久間・坂井・池田の寄せの後ろ）・西の川と町の間に、山へ向けて。
  //   斎藤は山の東と西の斜面（七曲り・百曲り・水手道の道から三十 m 外）に町へ向けて。町の家・鹿垣・寺（−58,50）・町の人の逃げ道（x−105〜−120・x124）は空ける
  inabayama: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('inO1', '織田の本陣の西の備', 0, -80, 132, 2, S, 'eiraku', '織田 町の南'),
    blk('inO2', '丹羽長秀の後ろの備', 0, 55, 128, 3, S, 'oda', '織田 町の南'),
    blk('inO3', '佐久間信盛の後ろの備', 0, 95, 145, 3, S, 'oda', '織田 町の南'),
    blk('inO4', '織田の後詰 南', 0, 55, 155, 3, S, 'oda', '織田 町の南'),
    blk('inO5', '池田恒興の後ろの備', 0, 135, 85, 3, S * 1.25, 'oda', '織田 東の野'),
    blk('inO6', '池田恒興の東の備', 0, 140, 40, 3, S * 1.25, 'oda', '織田 東の野'),
    blk('inO7', '坂井政尚の後ろの備', 0, 100, 85, 3, S * 1.25, 'oda', '織田 東の野'),
    blk('inO8', '織田の東の山裾の備', 0, 145, -5, 2, S * 1.25, 'oda', '織田 東の野'),
    blk('inO9', '森可成の後ろの備', 0, -95, 70, 2, S * 0.75, 'tsuru', '織田 西の川べり'),
    blk('inO10', '森可成の西の備', 0, -92, 15, 2, S * 0.75, 'tsuru', '織田 西の川べり'),
    blk('inO11', '織田の東の尾根の備', 0, 148, -45, 2, S * 1.25, 'oda', '織田 東の野'),
    blk('inS1', '長井道利の手 東の斜面', 1, 92, -58, 3, -S / 4, 'saito', '斎藤 山の東', { far: true, tLazy: true }),
    blk('inS2', '斎藤の西の斜面の備', 1, -96, -58, 3, S / 4, 'saito', '斎藤 山の西', { far: true, tLazy: true }),
    blk('inS3', '斎藤の東の尾根の備', 1, 88, -100, 2, -S / 4, 'saito', '斎藤 山の東', { far: true, tLazy: true }),
    blk('inS4', '斎藤の西の裏手の備', 1, -90, -110, 2, S / 4, 'saito', '斎藤 山の西', { far: true, tLazy: true }),
  ] },
  // 11/19 係（kaito「天王寺レベルの軍勢」・八尾若江）：両軍の本物の兵を千八百以上に。家ごとの塊（blk・一塊 44 人）と幟の林。持ち場で待つだけ（noEngage）・keep・idleFar。
  //   座標は b_k14_yao_wakae.js のとおり：北（−z）が若江、南が八尾。徳川は東（＋x・西向き＝−S/2）、大坂は西（−x・東向き＝S/2）。
  //   玉串川（x≈40〜48）・長瀬川（x≈−52〜−64）・若江の堤（x≈−8）・東西の道（z≈0〜10）・主人公の寄せ口（96,6）・二つの本陣の道は空ける。史実の比（藤堂 5000・井伊 3200：木村 4700・長宗我部 5300）で徳川が東に厚い
  k14_yao_wakae: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ywI1', '井伊の後備え 一', 0, 150, -24, 3, -S / 2, 'ii', '徳川 東の田'),
    blk('ywI2', '井伊の後備え 二', 0, 152, -76, 3, -S / 2, 'ii', '徳川 東の田'),
    blk('ywI3', '井伊の後備え 三', 0, 150, -126, 3, -S / 2, 'ii', '徳川 東の田'),
    blk('ywI4', '井伊の旗本の後ろ', 0, 186, -92, 3, -S / 2, 'ii', '徳川 東の田'),
    blk('ywT1', '藤堂の後備え 一', 0, 150, 40, 3, -S / 2, 'todo', '徳川 東の田'),
    blk('ywT2', '藤堂の後備え 二', 0, 156, 92, 3, -S / 2, 'todo', '徳川 東の田'),
    blk('ywT3', '藤堂の旗本の後ろ', 0, 172, 140, 3, -S / 2, 'todo', '徳川 東の田'),
    blk('ywT4', '藤堂の予備', 0, 190, 20, 3, -S / 2, 'todo', '徳川 東の田'),
    blk('ywT5', '藤堂の二陣の後ろ', 0, 190, 70, 3, -S / 2, 'todo', '徳川 東の田'),
    blk('ywC1', '長宗我部の後備え 一', 1, -96, 40, 3, S / 2, 'chosokabe', '大坂 長瀬川の西'),
    blk('ywC2', '長宗我部の後備え 二', 1, -100, 160, 3, S / 2, 'chosokabe', '大坂 長瀬川の西'),
    blk('ywC3', '長宗我部の旗本の後ろ', 1, -140, 60, 3, S / 2, 'chosokabe', '大坂 長瀬川の西'),
    blk('ywC4', '長宗我部の予備', 1, -144, 140, 3, S / 2, 'chosokabe', '大坂 長瀬川の西'),
    blk('ywC5', '長宗我部の八尾の南の備', 1, -30, 164, 3, S / 2, 'chosokabe', '大坂 八尾の南', { far: true, tLazy: true }),
    blk('ywK1', '木村の後備え 一', 1, -96, -96, 3, S / 2, 'toyotomi', '大坂 若江の西'),
    blk('ywK2', '木村の後備え 二', 1, -100, -150, 3, S / 2, 'toyotomi', '大坂 若江の西'),
    blk('ywK3', '木村の旗本の後ろ', 1, -142, -100, 3, S / 2, 'toyotomi', '大坂 若江の西', { far: true, tLazy: true }),
    blk('ywK4', '木村の若江の北の備', 1, -30, -176, 3, S / 2, 'toyotomi', '大坂 若江の北', { far: true, tLazy: true }),
    blk('ywK5', '山口弘定の後ろの備', 1, 12, -184, 3, S / 2, 'toyotomi', '大坂 若江の北', { far: true, tLazy: true }),
    blk('ywK6', '内藤長秋の後ろの備', 1, -30, -30, 3, S / 2, 'toyotomi', '大坂 若江の南の田', { far: true, tLazy: true }),
  ] },
  // 11/19 係（army-05・kaito「天王寺レベルの軍勢」・docs/fujin/tedorigawa.md）：手取川の北岸（−z）。前は 60秒で本物 273。
  //   織田（柴田・丹羽・前田の本陣の左右）の後備えと、上杉（先手・後備えの奥）を家ごとの塊（一塊 44 人）と幟で足す。
  //   主人公の道（x −20〜20・殿の持ち場 0,−38 から渡り口）と渡河列（x ±8）は空け、川（z −26〜20）・南岸には置かない。持ち場で待つだけ（noEngage）。
  //   idleFar：携帯で本人から遠く待つだけの備を休ませる（idle_far.js）。上杉の奥は本人が来るまで立たない（lazy）
  tedorigawa: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('tdO1', '丹羽長秀の後備え 西', 0, -75, -52, 3, S, 'sujikai', '織田 北岸の西'),
    blk('tdO2', '稲葉・氏家の後備え', 0, -118, -52, 3, S, 'oda', '織田 北岸の西'),
    blk('tdO3', '前田利家の後備え 東', 0, 75, -52, 3, S, 'maeda', '織田 北岸の東'),
    blk('tdO4', '佐々・不破の後備え', 0, 118, -52, 3, S, 'oda', '織田 北岸の東'),
    blk('tdO5', '柴田の旗本の後ろ 西', 0, -75, -92, 3, S, 'oda', '織田 北岸の奥'),
    blk('tdO6', '安藤・金森の備', 0, -118, -92, 3, S, 'oda', '織田 北岸の奥'),
    blk('tdO7', '柴田の旗本の後ろ 東', 0, 75, -92, 3, S, 'oda', '織田 北岸の奥'),
    blk('tdO8', '滝川の後詰', 0, 118, -92, 3, S, 'takigawa', '織田 北岸の奥'),
    blk('tdU1', '上杉の後備え 西の端', 1, -150, -236, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
    blk('tdU2', '上杉の後備え 西', 1, -105, -236, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
    blk('tdU3', '上杉の後備え 西寄り', 1, -60, -236, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
    blk('tdU4', '上杉の後備え 中', 1, -15, -238, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
    blk('tdU5', '上杉の後備え 東', 1, 110, -234, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
    blk('tdU6', '上杉の後備え 東の端', 1, 152, -232, 3, 0, 'uesugi', '上杉 奥', { far: true, tLazy: true }),
  ] },
  // 11/19 係（army-05・kaito「天王寺レベルの軍勢」・docs/fujin/shigisan.md）：前は 60秒で本物 275。
  //   織田（信忠の本陣・筒井・細川・羽柴の囲みの後ろと両脇の麓の野）に後備えを、松永（山の西と東の斜面）に二の曲輪の守りを、家ごとの塊（一塊 44 人）と幟で足す。
  //   登城道（x −6〜6）・九十九折り・寺（58,14）・雄嶽の曲輪の尾根（x −36〜36）・目の前の備の置き場には置かない。持ち場で待つだけ（noEngage）。携帯は idleFar で遠い備を休ませる
  shigisan: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('sgO1', '信忠の旗本の後備え 西', 0, -75, 172, 3, S, 'oda', '織田 麓の後備え'),
    blk('sgO2', '織田の後備え 西の端', 0, -120, 172, 3, S, 'oda', '織田 麓の後備え'),
    blk('sgO3', '信忠の旗本の後備え 東', 0, 75, 172, 3, S, 'oda', '織田 麓の後備え'),
    blk('sgO4', '織田の後備え 東の端', 0, 120, 172, 3, S, 'oda', '織田 麓の後備え'),
    blk('sgO5', '佐久間の後詰', 0, -75, 196, 3, S, 'sakuma', '織田 麓の奥'),
    blk('sgO6', '丹羽の後詰', 0, 75, 196, 3, S, 'sujikai', '織田 麓の奥'),
    blk('sgO7', '細川の後詰', 0, 120, 196, 3, S, 'oda', '織田 麓の奥'),
    blk('sgO8', '羽柴の後詰', 0, -120, 196, 3, S, 'oda', '織田 麓の奥'),
    blk('sgO9', '筒井の後詰', 0, 120, 70, 3, S, 'umebachi', '織田 東の野'),
    blk('sgO10', '明智の後詰', 0, 120, 42, 3, S, 'akechi', '織田 東の野'),
    blk('sgO11', '羽柴の囲みの西', 0, -125, 70, 3, S, 'oda', '織田 西の野'),
    blk('sgO12', '佐久間の囲みの西', 0, -135, 42, 3, S, 'sakuma', '織田 西の野'),
    blk('sgO13', '織田の西の野の後詰', 0, -130, 100, 3, S, 'oda', '織田 西の野'),
    blk('sgO14', '織田の東の野の後詰', 0, 130, 100, 3, S, 'oda', '織田 東の野'),
    blk('sgO15', '織田の後備え 西の奥', 0, -120, 220, 3, S, 'oda', '織田 麓の奥'),
    blk('sgO16', '織田の後備え 東の奥', 0, 120, 220, 3, S, 'oda', '織田 麓の奥'),
    blk('sgM1', '松永の西の斜面の備 一', 1, -100, -100, 3, 0, 'todo', '松永 西の斜面', { far: true, tLazy: true }),
    blk('sgM2', '松永の西の斜面の備 二', 1, -100, -150, 3, 0, 'todo', '松永 西の斜面', { far: true, tLazy: true }),
    blk('sgM3', '松永の西の斜面の備 三', 1, -100, -200, 3, 0, 'todo', '松永 西の斜面', { far: true, tLazy: true }),
    blk('sgM4', '松永の西の斜面の備 四', 1, -100, -250, 3, 0, 'todo', '松永 西の斜面', { far: true, tLazy: true }),
    blk('sgM5', '松永の東の斜面の備 一', 1, 100, -100, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true }),
    blk('sgM6', '松永の東の斜面の備 二', 1, 100, -150, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true }),
    blk('sgM7', '松永の東の斜面の備 三', 1, 100, -200, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true }),
    blk('sgM8', '松永の東の斜面の備 四', 1, 100, -250, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true }),
  ] },
  // 11/19 係（army-05・kaito「天王寺レベルの軍勢」・docs/fujin/miki.md）：三木の戦場は城（70,30）の西の平野（x −240〜12・平ら）。前は 60秒で本物 238。
  //   羽柴（二万）は平野の西の端（x −210・−168）と北（z −205）に後備えを、別所と毛利の搬入（七千五百）は城の西の麓（x 12）と搬入の護衛の後ろ（x −190）に、
  //   家ごとの塊（一塊 44 人）と幟で置く。主人公の始め（−80,−47）・大村（−64,−118）・平田（−80,−64）・大村道と搬入の道（x −155〜35・z −160〜10）の筋には置かない。持ち場で待つだけ（noEngage）
  miki: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('mkH1', '羽柴の備 平野の西 1', 0, -210, -150, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH2', '羽柴の備 平野の西 2', 0, -210, -110, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH3', '羽柴の備 平野の西 3', 0, -210, -70, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH4', '羽柴の備 平野の西 4', 0, -210, -30, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH5', '羽柴の備 平野の西 5', 0, -210, 10, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH6', '羽柴の備 平野の西 6', 0, -210, 50, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH7', '羽柴の備 平野の西 7', 0, -210, 90, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkH8', '羽柴の備 平野の西 8', 0, -210, 130, 3, S / 2, 'toyotomi', '羽柴 西の平野', { far: true, tLazy: true }),
    blk('mkB1', '別所の城下の備 1', 1, 12, -70, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkB2', '別所の城下の備 2', 1, 12, -30, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkB3', '別所の城下の備 3', 1, 12, 10, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkB4', '別所の城下の備 4', 1, 12, 50, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkB5', '別所の城下の備 5', 1, 12, 90, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkB6', '別所の城下の備 6', 1, 12, 130, 3, -S / 2, 'mori', '別所 城の西の麓'),
    blk('mkM1', '毛利の搬入の護衛 1', 1, -190, -110, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true }),
    blk('mkM2', '毛利の搬入の護衛 2', 1, -190, -70, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true }),
    blk('mkM3', '毛利の搬入の護衛 3', 1, -190, -30, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true }),
  ] },
  tottori: { stayPut: true, deep: true, noboriAll: true, nbTouch: [4, 2], rows: [
    { key: 'engoji', name: '円護寺側の付城', side: 0, x: 28, z: -200, w: 24, d: 12, count: 300, facing: Math.PI, flag: 'kiri53', armor: 0x292520, row: '円護寺の付城', leaders: [], ranks: 4, far: true },
    { key: 'karigane', name: '雁金山の宮部の備', side: 0, x: -20, z: -196, w: 20, d: 10, count: 300, facing: Math.PI / 2, flag: 'kiri53', armor: 0x292520, row: '雁金山の付城', leaders: [], ranks: 4, far: true },
    { key: 'taiko', name: '太閤ヶ平の秀吉の旗本', side: 0, x: 128, z: -150, w: 24, d: 12, count: 400, facing: -Math.PI / 2, flag: 'kiri53', armor: 0x292520, row: '太閤ヶ平', leaders: [], ranks: 4, far: true },
  ] },
  // 11/19 iMac army-04（kaito「天王寺レベルの軍勢」・雑賀攻め・docs/fujin/saika.md）：前は 60秒で 284。
  //   織田の山手勢（東岸・西を向く）は後陣（72,0）・堀の先手（26,0）の南北に、川上・川下の控え（50,±70）の外へ、羽柴・荒木・別所・佐久間の手を家ごとの塊（一塊 44 人）で置く。
  //   雑賀方（西岸・東を向く）は柵（x −47）の後ろに鈴木・土橋の手の塊を置く。川の水（x −24〜−18）・主人公の道（z 0）・使者の道・柵の鉄砲の小組・焼け家（x 78）には置かない。持ち場で待つだけ
  saika: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('saO1', '羽柴の手 川上の寄り', 0, 54, -34, 3, -S / 2, 'oda', '織田 東岸の南北'),
    blk('saO2', '荒木の手 川下の寄り', 0, 54, 34, 3, -S / 2, 'oda', '織田 東岸の南北'),
    blk('saO3', '佐久間の手 後陣の北', 0, 86, -34, 3, -S / 2, 'sakuma', '織田 後陣の脇'),
    blk('saO4', '佐久間の手 後陣の南', 0, 86, 34, 3, -S / 2, 'sakuma', '織田 後陣の脇'),
    blk('saO5', '羽柴の後備え 川上', 0, 62, -112, 3, -S / 2, 'oda', '織田 川上の控え', { far: true, tLazy: true }),
    blk('saO6', '荒木の後備え 川下', 0, 62, 112, 3, -S / 2, 'oda', '織田 川下の控え', { far: true, tLazy: true }),
    blk('saS1', '鈴木孫一の手 柵の北', 1, -68, -34, 3, S / 2, 'yatagarasu', '雑賀 柵の後ろ'),
    blk('saS2', '土橋の手 柵の南', 1, -68, 34, 3, S / 2, 'yatagarasu', '雑賀 柵の後ろ'),
    blk('saS3', '鈴木の後備え 北', 1, -96, -34, 3, S / 2, 'yatagarasu', '雑賀 西岸の後備え'),
    blk('saS4', '土橋の後備え 南', 1, -96, 34, 3, S / 2, 'yatagarasu', '雑賀 西岸の後備え'),
    blk('saS5', '雑賀の川上の備', 1, -84, -108, 3, S / 2, 'yatagarasu', '雑賀 川上', { far: true, tLazy: true }),
    blk('saS6', '雑賀の川下の備', 1, -84, 108, 3, S / 2, 'yatagarasu', '雑賀 川下', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-04（kaito「天王寺レベルの軍勢」・織田家編の天王寺の戦い・docs/fujin/tennoji.md）：前は 60秒で 283。ほめた物（天王寺の毛利と真田＝k15_tennoji_okayama）には触らない（別の戦の表）。
  //   織田（南から北＝−z を向く）は一段目（−8,72）・二段目（16,98）・三段目（8,126）の両脇と後ろに、信長の馬廻・諸将の後備えを家ごとの塊（一塊 44 人）で置く。主人公の道（x −25〜25）は空ける。
  //   本願寺方（砦の北の囲み・南を向く）は砦のきわ（半径 40m）の外、城戸口へ向かう道の両脇に塊で置く。持ち場で待つだけ
  tennoji: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('toO1', '佐久間の後備え 西', 0, -56, 70, 3, S, 'oda', '織田 一段目の脇'),
    blk('toO2', '松永の備え 東', 0, 60, 70, 3, S, 'oda', '織田 一段目の脇'),
    blk('toO3', '羽柴の備え 西', 0, -64, 110, 3, S, 'oda', '織田 二段目の脇'),
    blk('toO4', '丹羽の備え 東', 0, 68, 112, 3, S, 'oda', '織田 二段目の脇'),
    blk('toO5', '信長の馬廻の後ろ 西', 0, -40, 152, 3, S, 'eiraku', '織田 三段目の後ろ', { far: true, tLazy: true }),
    blk('toO6', '信長の馬廻の後ろ 東', 0, 44, 154, 3, S, 'eiraku', '織田 三段目の後ろ', { far: true, tLazy: true }),
    blk('toH1', '本願寺の北の囲み 西', 1, -52, -122, 3, 0, 'namu', '本願寺 砦の北'),
    blk('toH2', '本願寺の北の囲み 東', 1, 52, -122, 3, 0, 'namu', '本願寺 砦の北'),
    blk('toH3', '本願寺の二の手 西', 1, -92, -160, 3, 0, 'namu', '本願寺 城戸口の道', { far: true, tLazy: true }),
    blk('toH4', '本願寺の二の手 西寄り', 1, -34, -164, 3, 0, 'namu', '本願寺 城戸口の道', { far: true, tLazy: true }),
    blk('toH5', '本願寺の二の手 東寄り', 1, 34, -164, 3, 0, 'namu', '本願寺 城戸口の道', { far: true, tLazy: true }),
    blk('toH6', '本願寺の二の手 東', 1, 92, -160, 3, 0, 'namu', '本願寺 城戸口の道', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-04（kaito「天王寺レベルの軍勢」・越前・大滝寺の山狩り・docs/fujin/echizen_ikko.md）：前は 60秒で 259。
  //   織田（滝川一益・北＝+z を向く）は麓の陣所（−16,−200）の東西と前に、越前へ入った諸将の手（府中・前田・不破など）を家ごとの塊（一塊 44 人）で置く。
  //   一向一揆（寺・南＝−z を向く）は参道（x 0）の両脇の山の斜面（外堂・本堂・奥の院の東西）に衆徒の塊を置く。参道・石段・谷道・森の小道・堂の内には置かない。持ち場で待つだけ
  echizen_ikko: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ecO1', '滝川の手 麓の西', 0, -64, -212, 3, 0, 'takigawa', '織田 麓'),
    blk('ecO2', '滝川の手 麓の東', 0, 64, -212, 3, 0, 'takigawa', '織田 麓'),
    blk('ecO3', '府中三人衆の手', 0, -108, -178, 3, 0, 'oda', '織田 麓の西の端'),
    blk('ecO4', '前田の手', 0, 108, -178, 3, 0, 'oda', '織田 麓の東の端'),
    blk('ecO5', '不破の手', 0, -72, -148, 3, 0, 'oda', '織田 麓の前', { far: true, tLazy: true }),
    blk('ecO6', '金森の手', 0, 72, -148, 3, 0, 'oda', '織田 麓の前', { far: true, tLazy: true }),
    blk('ecI1', '衆徒 山の西 下', 1, -70, -90, 3, S, 'namu', '一揆 山の斜面'),
    blk('ecI2', '衆徒 山の東 下', 1, 70, -90, 3, S, 'namu', '一揆 山の斜面'),
    blk('ecI3', '衆徒 山の西 中', 1, -80, -30, 3, S, 'namu', '一揆 山の斜面'),
    blk('ecI4', '衆徒 山の東 中', 1, 80, -30, 3, S, 'namu', '一揆 山の斜面'),
    blk('ecI5', '衆徒 山の西 上', 1, -60, 40, 3, S, 'namu', '一揆 山の斜面', { far: true, tLazy: true }),
    blk('ecI6', '衆徒 山の東 上', 1, 60, 40, 3, S, 'namu', '一揆 山の斜面', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-04（kaito「天王寺レベルの軍勢」・岩村城・水晶山・docs/fujin/iwamura.md）：前は 60秒で 238。
  //   織田（水晶山・南＝−z を向く）は本陣（0,44）・河尻（−14,16）・毛利（20,16）・柵（z −6）の東西と後ろに、信忠の旗本・森・団・浅野・猿荻の手を家ごとの塊（一塊 44 人）で置く。
  //   武田（岩村城・北＝+z を向く・約三千）は登城道（x 0）の両脇の曲輪・尾根に秋山の配下の塊を置く。柵の口・登城道・曲輪の建物には置かない。持ち場で待つだけ
  iwamura: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('iwO1', '森長可の手', 0, -76, 30, 3, S, 'mori', '織田 本陣の西'),
    blk('iwO2', '団忠正の手', 0, 76, 30, 3, S, 'oda', '織田 本陣の東'),
    blk('iwO3', '浅野左近の手', 0, -76, 78, 3, S, 'oda', '織田 本陣の後ろ 西'),
    blk('iwO4', '猿荻甚太郎の手', 0, 76, 78, 3, S, 'oda', '織田 本陣の後ろ 東'),
    blk('iwO5', '信忠の旗本の後ろ 西', 0, -30, 112, 3, S, 'oda', '織田 本陣の奥', { far: true, tLazy: true }),
    blk('iwO6', '信忠の旗本の後ろ 東', 0, 30, 112, 3, S, 'oda', '織田 本陣の奥', { far: true, tLazy: true }),
    blk('iwT1', '秋山の配下 三の丸の西', 1, -70, -125, 4, 0, 'takeda', '武田 登城道の脇'),
    blk('iwT2', '秋山の配下 三の丸の東', 1, 70, -125, 4, 0, 'takeda', '武田 登城道の脇'),
    blk('iwT3', '大島杢之助の手', 1, -82, -168, 3, 0, 'takeda', '武田 曲輪', { far: true, tLazy: true }),
    blk('iwT4', '座光寺為清の手', 1, 82, -168, 3, 0, 'takeda', '武田 曲輪', { far: true, tLazy: true }),
    blk('iwT5', '秋山の配下 二の丸の西', 1, -52, -208, 3, 0, 'takeda', '武田 二の丸', { far: true, tLazy: true }),
    blk('iwT6', '秋山の配下 二の丸の東', 1, 52, -208, 3, 0, 'takeda', '武田 二の丸', { far: true, tLazy: true }),
  ] },
  mikatagahara: { keep: true, rows: [
    { key: 'tkR2', name: '山県の寄騎（第二陣の外）', side: 1, x: 44, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'akazonae', armor: 0x8e1f16, row: '武田 第二陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL2', name: '小幡の寄騎（第二陣の外）', side: 1, x: -52, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第二陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkR3', name: '勝頼の後備え（第三陣の外）', side: 1, x: 58, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL3', name: '馬場の後備え（第三陣の外）', side: 1, x: -64, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkHQ', name: '信玄の後備え（本陣の後ろ）', side: 1, x: 0, z: -126, w: 40, d: 12, count: 90, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 本陣の後ろ', leaders: [], ranks: 4, nobori: true },
  ] },
};
// 11/19 係（天王寺レベルの軍勢・番外 天王寺）：番外の真田は天王寺を丸ごと写した戦（側だけ入れ替え）なので、同じ表を使う（表の side は豊臣方＝0・徳川方＝1 のまま）
// 豊臣方（味方・side 1・南向き＝0）は毛利の三陣の北に七手組・大野の備の塊を足す（徳川方は天王寺の表のまま千以上ある）。茶臼山（−106,4）・毛利の三陣（−52,−38）・城への道は空ける
FUJIN.x15_sanada = { ...FUJIN.k15_tennoji_okayama, withEmpty: true, keep: true, idleFar: true, rows: [...FUJIN.k15_tennoji_okayama.rows,
  blk('sjT1', '七手組の一', 1, -130, -62, 3, 0, 'toyotomi', '豊臣 毛利の北'),
  blk('sjT2', '七手組の二', 1, -78, -84, 3, 0, 'toyotomi', '豊臣 毛利の北'),
  blk('sjT3', '大野治長の備', 1, -28, -96, 3, 0, 'toyotomi', '豊臣 毛利の北'),
  blk('sjT4', '大野治房の備', 1, 24, -56, 3, 0, 'toyotomi', '豊臣 毛利の北'),
  blk('sjT5', '真田の後備え', 1, -100, -128, 3, 0, 'sanada', '豊臣 毛利の北'),
] };
// 11/19 係（天王寺レベルの軍勢）：パソコンでこの表が立てる本物の兵の数（塊は 44 人・無い行は 36 人まで・列の将を足す）。
//   戦の上限（realCap）にこの分を足すと、筋書きの寄せ・新手の空きが表を足す前と同じになる（設楽原・本能寺）
export function fujinRealN(id) {
  const T = FUJIN[id]; if (!T) return 0;
  let n = 0;
  for (const r of T.rows) n += r.blocks && r.blocks.length ? r.blocks.length * (r.blockMax || 44) + r.blocks.filter((b) => b.lead).length : Math.max(8, Math.min(36, Math.round((r.count || 100) * 0.12))) + (r.leaders || []).length;
  return n;
}
