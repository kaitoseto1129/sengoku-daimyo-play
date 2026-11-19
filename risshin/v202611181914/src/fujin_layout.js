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
    { key: 'sakai', name: '水野勝成・本多忠政', side: 0, x: -140, z: 164, w: 30, d: 12, count: 160, facing: S + 0.5, flag: 'tokugawa', armor: 0x2e2a26, row: '左翼', leaders: [], blocks: [{ name: '水野勝成の備', lead: '水野勝成', flag: 'tokugawa' }, { name: '本多忠政の備', lead: '本多忠政', flag: 'honda' }], ranks: 4, nobori: true },
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
  k11_sanadamaru: { keep: true, rows: [
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
  k05_ueda: { keep: true, deep: true, rows: [
    { key: 'okuboB', name: '大久保忠隣の後詰', side: 0, x: 124, z: -64, w: 20, d: 10, count: 150, facing: -S / 2, flag: 'okubo', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '大久保の後詰 一の手', flag: 'okubo' }, { name: '大久保の後詰 二の手', flag: 'okubo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hondaB', name: '本多忠政の後詰', side: 0, x: 126, z: -22, w: 20, d: 10, count: 170, facing: -S / 2, flag: 'honda', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '本多の後詰 一の手', flag: 'honda' }, { name: '本多の後詰 二の手', flag: 'honda' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'yamauchiB', name: '山内一豊の後詰', side: 0, x: 128, z: 22, w: 20, d: 10, count: 130, facing: -S / 2, flag: 'kashiwa', armor: 0x2e2a26, row: '神川の向こう', leaders: [], blocks: [{ name: '山内の後詰', flag: 'kashiwa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someHonda', name: '染屋台の本多康重', side: 0, x: 244, z: -40, w: 24, d: 12, count: 220, facing: -S / 2, flag: 'honda', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の本多 一の手', flag: 'honda' }, { name: '染屋台の本多 二の手', flag: 'honda' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someArima', name: '染屋台の有馬豊氏', side: 0, x: 250, z: 34, w: 24, d: 12, count: 200, facing: -S / 2, flag: 'katabami', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の有馬 一の手', flag: 'katabami' }, { name: '染屋台の有馬 二の手', flag: 'katabami' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someHidetada', name: '染屋台の秀忠の旗本', side: 0, x: 256, z: -4, w: 24, d: 12, count: 240, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の旗本 一の手', flag: 'tokugawa' }, { name: '染屋台の旗本 二の手', flag: 'tokugawa' }, { name: '染屋台の旗本 三の手', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someOkubo', name: '染屋台の大久保', side: 0, x: 236, z: -74, w: 24, d: 12, count: 160, facing: -S / 2, flag: 'okubo', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の大久保 一の手', flag: 'okubo' }, { name: '染屋台の大久保 二の手', flag: 'okubo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'someSakakibara', name: '染屋台の榊原康政', side: 0, x: 240, z: 70, w: 24, d: 12, count: 160, facing: -S / 2, flag: 'sakakibara', armor: 0x2e2a26, row: '染屋台', leaders: [], blocks: [{ name: '染屋台の榊原 一の手', flag: 'sakakibara' }, { name: '染屋台の榊原 二の手', flag: 'sakakibara' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
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
  k06_sekigahara: { keep: true, deep: true, noboriAll: true, nbTouch: [6, 4], rows: [
    { key: 'iiB', name: '井伊の後備え', side: 0, x: -118, z: 118, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'ii', armor: 0x8e1f16, row: '井伊 後備え', leaders: [] },
    { key: 'tadayoshi', name: '松平忠吉の後備え', side: 0, x: -126, z: 70, w: 24, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '松平 後備え', leaders: [] },
    { key: 'kyogoku', name: '京極高知の二陣', side: 0, x: -176, z: 196, w: 28, d: 8, count: 150, facing: -S * 0.7, flag: 'kyogoku', armor: 0x2e2a26, row: '藤堂・京極 二陣', leaders: [] },
    // 11/14 クラウドせ K127 残り「始め（霧の晴れる前）の右・左が空」：本人（始め -172,99→8秒で -206,80 へ馬で出る）の右＝北と左＝南の 40m 内に備を置く（60m より先の兵は写真で点にもならなかった）。
    //   北は福島の後ろの筒井・田中の後備え（春日神社 -212,52 と本人の道より東）、南は藤堂の後備え（大谷の前の平塚 -380,155 から二百m離す）
    //   11/14 クラウドす：筒井・田中を -188→-228 へ（宇喜多の前で斬り合う本人 -275,40 の真後ろ 47m。前は 90m 後ろで振り返ると草原だけ）
    { key: 'tsutsui', name: '筒井定次・田中吉政の後備え', side: 0, x: -228, z: 56, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '福島の後ろ', leaders: [] },
    //   11/14 クラウドす（K127 残り「始めの右」）：筒井を前へ移すと始め（-206,80）の右＝北が草原に戻ったので、元の筒井の所（本人の道より東・春日神社 -212,52 を空ける）に細川・加藤の後備えを百人
    //   11/14 クラウドし（K127 クラウドA の写真「始めの右に細川・加藤が写らない」）：一列の備は PC で12人・携帯で5人に削られ、31m 先で点にしかならなかった。
    //   家ごとの塊（細川＝九曜・加藤＝下がり藤）に分け、段の厚みと幟の林で立てる（PC 30人×2・携帯6人×2＋幟）
    { key: 'hosokawaB', name: '細川忠興・加藤嘉明の後備え', side: 0, x: -186, z: 56, w: 26, d: 9, count: 100, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '細川・加藤 後備え', leaders: [], blocks: [{ name: '細川忠興の後備え', flag: 'kuyo' }, { name: '加藤嘉明の後備え', flag: 'sagarifuji' }], blockW: 11, blockMax: 30, ranks: 4, nobori: true },
    { key: 'todoB', name: '藤堂高虎の後備え', side: 0, x: -200, z: 110, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'todo', armor: 0x2e2a26, row: '藤堂・京極 後備え', leaders: [] },
    // 11/14 クラウドし（K127 司令塔「終わりの段＝福島と宇喜多の槍合わせの四方は野原がほぼ空で七万同士に見えない」）：描かずの数で④の本人の80m内は
    //   味方287に敵は明石・二番手の40ほど（敵の全部で78）。布陣図の「宇喜多 一万七千・軽い二の備五千（-372,72）」は K285 の noFake で消えていた。
    //   明石の先手（-320,55）の後ろ30mに宇喜多の二の備を本物の塊三つ（児の字の旗・幟の林）で立てる。持ち場で待ち、寄れば斬り合う。寝返りで崩れる（westFall）。
    //   始めの本人（-172,99）から183mなので far（携帯でも置く・携帯は二塊×6人）
    { key: 'ukitaB', name: '宇喜多の二の備', side: 1, x: -352, z: 70, w: 44, d: 12, count: 300, facing: S / 2, flag: 'ukita', armor: 0x2c2a2a, row: '宇喜多 二の備', leaders: [], far: true,
      blocks: [{ name: '宇喜多の二の備 右の手' }, { name: '宇喜多の二の備 中の手' }, { name: '宇喜多の二の備 左の手' }], blockW: 13, blockMax: 28, ranks: 5, nobori: true },
    // 11/16 K292 クラウドせ（上空の引き 60秒＝本人の後ろから西を見ると、塊は宇喜多の二の備の三つと先手だけ・小西と大谷の後ろは野だけ）：
    //   布陣図（army_depth_plans の konishi2・otani2）の小西の二の備・大谷の二の備を、家の旗の塊二つずつ・幟の林で立てる。始めの本人（-172,99）から 260m の内（far）。
    //   持ち場で待つだけ（本人の道は宇喜多の先手の前と平塚の前まで＝ここから70m 以上離れる）。寝返りの後の崩れ（otaniFall・westFall）で退く。PC 一塊20人・携帯6人
    //   11/16 クラウドせ（K292 続き「一枚に塊は八つ」）：小西の左の手（z-19）が始めの本人から 261m で far の 260m を越え立っていなかった→x -405→-400。
    //   宇喜多の二の備と大谷の二の備の間（平塚・戸田の山中の前）と、宇喜多の二の備と小西の間（秀家の旗本の後ろ）が野だったので、布陣図の「大谷・平塚・戸田」「宇喜多 一万七千」から塊を足す
    { key: 'hiratsukaB', name: '平塚・戸田の備', side: 1, x: -392, z: 112, w: 30, d: 12, count: 200, facing: S / 2, flag: 'otani', armor: 0x2c2a2a, row: '平塚・戸田', leaders: [], far: true,
      blocks: [{ name: '平塚為広の備' }, { name: '戸田重政の備' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'ukitaH', name: '宇喜多の旗本の後備え', side: 1, x: -388, z: 28, w: 16, d: 12, count: 100, facing: S / 2, flag: 'ukita', armor: 0x2c2a2a, row: '宇喜多 旗本', leaders: [], far: true,
      blocks: [{ name: '宇喜多の旗本の後備え' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'konishiB', name: '小西の二の備', side: 1, x: -400, z: -12, w: 30, d: 12, count: 200, facing: S / 2, flag: 'konishi', armor: 0x2c2a2a, row: '小西 二の備', leaders: [], far: true,
      blocks: [{ name: '小西の二の備 右の手' }, { name: '小西の二の備 左の手' }], blockW: 12, blockMax: 20, ranks: 5, nobori: true },
    { key: 'otaniB', name: '大谷の二の備', side: 1, x: -420, z: 150, w: 30, d: 12, count: 200, facing: S / 2, flag: 'otani', armor: 0x2c2a2a, row: '大谷 二の備', leaders: [], far: true,
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
  k16_secret: { deep: true, lazy: true, noboriAll: true, nbTouch: [5, 3], rows: [
    { key: 'tkW', name: '徳川の後備え 西', side: 1, x: -62, z: -142, w: 22, d: 10, count: 150, facing: 0, flag: 'tokugawa', armor: 0x2a2622, row: '柵の奥 西', leaders: [], ranks: 4 },
    { key: 'tkE', name: '徳川の後備え 東', side: 1, x: 66, z: -142, w: 22, d: 10, count: 150, facing: 0, flag: 'honda', armor: 0x2a2622, row: '柵の奥 東', leaders: [], ranks: 4 },
    { key: 'tkR', name: '秀忠の手', side: 1, x: -58, z: -198, w: 24, d: 10, count: 150, facing: 0, flag: 'tokugawa', armor: 0x2a2622, row: '本陣の後ろ 西', leaders: [], ranks: 4 },
    { key: 'alW', name: '毛利の後備え', side: 0, x: -44, z: 96, w: 22, d: 10, count: 150, facing: S, flag: 'mori', armor: 0x2e2a26, row: '連合 後備え 西', leaders: [], ranks: 4 },
    { key: 'alE', name: '島津の後備え', side: 0, x: 50, z: 96, w: 22, d: 10, count: 150, facing: S, flag: 'shimazu', armor: 0x2e2a26, row: '連合 後備え 東', leaders: [], ranks: 4 },
  ] },
  mikatagahara: { keep: true, rows: [
    { key: 'tkR2', name: '山県の寄騎（第二陣の外）', side: 1, x: 44, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'akazonae', armor: 0x8e1f16, row: '武田 第二陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL2', name: '小幡の寄騎（第二陣の外）', side: 1, x: -52, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第二陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkR3', name: '勝頼の後備え（第三陣の外）', side: 1, x: 58, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL3', name: '馬場の後備え（第三陣の外）', side: 1, x: -64, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkHQ', name: '信玄の後備え（本陣の後ろ）', side: 1, x: 0, z: -126, w: 40, d: 12, count: 90, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 本陣の後ろ', leaders: [], ranks: 4, nobori: true },
  ] },
};
