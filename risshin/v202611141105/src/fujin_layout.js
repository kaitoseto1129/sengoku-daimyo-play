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
  k15_tennoji_okayama: { rows: [
    // 11/14 MB係三（K297 司令塔）：塊の無かった岡山口・本陣の後ろ・西の端・左翼・後詰も家ごとの塊と幟に（前田＝梅鉢・本多・井伊＝赤・細川＝九曜・藤堂・伊達・黒田＝黒・明石＝宇喜多の紺）。豊臣の毛利・真田の旗本は大きく（塊の幅16・最大30人・五段）
    // 徳川 天王寺口（一の列→四の列→本陣）
    // 11/14 クラウドさ（K287②・K292）：四重の列は blocks で大名・将ごとの塊（四段）に分け、塊ごとに家の旗（内藤＝下がり藤・仙石＝永楽銭・浅野＝違い鷹の羽・紋の無い家は葵）と後ろの幟の林
    { key: 'sen', name: '秋田実季・浅野長重・真田信吉（一の列）', side: 0, x: -44, z: 54, w: 40, d: 14, count: 180, facing: S, flag: 'honda', armor: 0x2c2824, row: '天王寺口 一の列', leaders: ['秋田実季', '浅野長重', '真田信吉'], blocks: [{ lead: '秋田実季', flag: 'tokugawa' }, { lead: '浅野長重', flag: 'asano' }, { lead: '真田信吉', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'echi', name: '松平忠直（二の列）', side: 0, x: -98, z: 68, w: 40, d: 10, count: 220, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '天王寺口 二の列', leaders: [], blocks: [{ name: '松平忠直の越前勢', lead: '松平忠直', onField: true }, { name: '越前勢の二の手' }], ranks: 4, nobori: true },
    { key: 'senB', name: '諏訪忠澄・保科正光（三の列）', side: 0, x: -52, z: 72, w: 56, d: 14, count: 300, facing: S, flag: 'honda', armor: 0x2c2824, row: '天王寺口 三の列', leaders: ['諏訪忠澄', '保科正光'], blocks: [{ lead: '諏訪忠澄', flag: 'tokugawa' }, { lead: '保科正光', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'ni', name: '榊原康勝（三の列）', side: 0, x: -44, z: 88, w: 46, d: 10, count: 220, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '天王寺口 三の列', leaders: [], blocks: [{ name: '榊原康勝の備', lead: '榊原康勝', onField: true }, { name: '榊原の二の手' }], ranks: 4, nobori: true },
    { key: 'senC', name: '内藤忠興・松平康長・酒井家次・松平忠良・仙石忠政（四の列）', side: 0, x: -38, z: 106, w: 60, d: 14, count: 300, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '天王寺口 四の列', leaders: ['内藤忠興', '松平康長', '松平忠良', '仙石忠政', '酒井家次'], blocks: [{ lead: '内藤忠興', flag: 'sagarifuji' }, { lead: '松平康長', flag: 'tokugawa' }, { lead: '松平忠良', flag: 'tokugawa' }, { lead: '仙石忠政', flag: 'eiraku' }, { lead: '酒井家次', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'hata', name: '徳川頼宣の備え', side: 0, x: -38, z: 162, w: 54, d: 14, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '本陣の後ろ', leaders: ['徳川頼宣'], blocks: [{ name: '徳川頼宣の旗本', lead: '徳川頼宣', onField: true }, { name: '紀州勢の二の手' }], ranks: 4, nobori: true },
    { key: 'waki', name: '本陣の脇備え', side: 0, x: -10, z: 124, w: 18, d: 22, count: 110, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '本陣の脇', leaders: [], ranks: 4, nobori: true },
    // 徳川 岡山口（二重）・西の端・後詰
    { key: 'okaA', name: '前田利常・本多康紀・片桐且元（岡山口・一の列）', side: 0, x: 46, z: 40, w: 46, d: 15, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 一の列', leaders: ['前田利常', '本多康紀', '片桐且元'], blocks: [{ lead: '前田利常', flag: 'maeda' }, { lead: '本多康紀', flag: 'honda' }, { lead: '片桐且元', flag: 'tokugawa' }], ranks: 4, nobori: true },
    { key: 'okaB', name: '井伊直孝・細川忠興・藤堂高虎（岡山口・二の列）', side: 0, x: 50, z: 66, w: 50, d: 15, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 二の列', leaders: ['井伊直孝', '細川忠興', '藤堂高虎'], blocks: [{ lead: '井伊直孝', flag: 'ii' }, { lead: '細川忠興', flag: 'kuyo' }, { lead: '藤堂高虎', flag: 'todo' }], ranks: 4, nobori: true },
    { key: 'okaC', name: '徳川秀忠の本陣（岡山口・後ろ）', side: 0, x: 40, z: 118, w: 36, d: 10, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山口 後ろ', leaders: ['徳川秀忠'], blocks: [{ name: '徳川秀忠の旗本', lead: '徳川秀忠', onField: true }, { name: '秀忠の馬廻り' }], ranks: 4, nobori: true },
    { key: 'todo', name: '藤堂高虎（岡山口・脇）', side: 0, x: 6, z: 80, w: 36, d: 12, count: 200, facing: S, flag: 'todo', armor: 0x2e2a26, row: '岡山口 脇', leaders: [], ranks: 4, nobori: true },
    { key: 'date', name: '伊達政宗・片倉重長（西の端）', side: 0, x: 24, z: 120, w: 40, d: 14, count: 240, facing: S, flag: 'date', armor: 0x1a1a22, row: '西の端', leaders: ['伊達政宗', '片倉重長'], blocks: [{ lead: '伊達政宗', flag: 'date' }, { lead: '片倉重長', flag: 'date' }], ranks: 4, nobori: true },
    { key: 'sakai', name: '酒井家次・本多忠政', side: 0, x: -128, z: 134, w: 30, d: 12, count: 160, facing: S + 0.5, flag: 'tokugawa', armor: 0x2e2a26, row: '左翼', leaders: [], blocks: [{ name: '酒井家次の備', flag: 'tokugawa' }, { name: '本多忠政の備', flag: 'honda' }], ranks: 4, nobori: true },
    { key: 'asano', name: '浅野長晟（後詰）', side: 0, x: -6, z: 200, w: 36, d: 12, count: 180, facing: S, flag: 'asano', armor: 0x2e2a26, row: '後詰', leaders: ['浅野長晟'], ranks: 4, nobori: true },
    { key: 'kuroda', name: '黒田長政・細川忠興（後詰）', side: 0, x: -80, z: 196, w: 34, d: 12, count: 160, facing: S, flag: 'kuroda', armor: 0x2e2a26, row: '後詰', leaders: [], blocks: [{ name: '黒田長政の備', flag: 'kuroda' }, { name: '細川忠興の後詰', flag: 'kuyo' }], ranks: 4, nobori: true },
    // 豊臣（11/14 クラウドか K287③司令塔「豊臣方の塊が小さく少ない」：毛利・真田・大谷を家ごとの塊に分け、塊を広く（blockW）厚く（blockMax）し、家の幟の林を立てる）
    { key: 'mori', name: '毛利勝永の後備え', side: 1, x: -20, z: -10, w: 40, d: 12, count: 300, facing: 0, flag: 'toyotomi', armor: 0x3a3028, row: '毛利', leaders: [], blocks: [{ name: '毛利勝永の旗本', flag: 'mori' }, { name: '毛利の後備え 二の手', flag: 'mori' }], blockW: 16, blockMax: 30, ranks: 5, nobori: true },
    { key: 'moriB', name: '毛利の二陣', side: 1, x: -36, z: -20, w: 58, d: 12, count: 300, facing: 0, flag: 'toyotomi', armor: 0x3a3028, row: '毛利 二陣', leaders: [], blocks: [{ name: '毛利の二陣 左', flag: 'mori' }, { name: '毛利の二陣 右', flag: 'mori' }, { name: '浅井井頼の備', flag: 'toyotomi' }], blockW: 14, blockMax: 20, ranks: 4, nobori: true },
    { key: 'moriC', name: '毛利の三陣', side: 1, x: -52, z: -38, w: 60, d: 14, count: 300, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '毛利 三陣', leaders: [], blocks: [{ name: '竹田永翁の備', flag: 'toyotomi' }, { name: '毛利の三陣 中', flag: 'mori' }], blockW: 14, blockMax: 20, ranks: 4, nobori: true },
    { key: 'sana', name: '真田の赤備え', side: 1, x: -108, z: -10, w: 46, d: 14, count: 300, facing: 0.6, flag: 'sanada', armor: 0x8e1f16, row: '真田', leaders: [], blocks: [{ name: '真田信繁の赤備え', flag: 'sanada' }, { name: '大谷吉治の備', flag: 'otani' }, { name: '真田の赤備え 二の手', flag: 'sanada' }], blockW: 16, blockMax: 30, ranks: 4, nobori: true },
    { key: 'sanaK', name: '真田の騎馬', side: 1, x: -94, z: -12, w: 26, d: 12, count: 140, facing: 0.6, flag: 'sanada', armor: 0x8e1f16, row: '真田 騎馬', leaders: [], nobori: true },
    { key: 'akashi', name: '明石全登', side: 1, x: -94, z: -40, w: 32, d: 12, count: 200, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '明石', leaders: [], blocks: [{ name: '明石全登の左', flag: 'ukita' }, { name: '明石全登の右', flag: 'ukita' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
    { key: 'ono', name: '大野治長', side: 1, x: -6, z: -84, w: 40, d: 14, count: 220, facing: 0, flag: 'toyotomi', armor: 0x352c25, row: '大野', leaders: [], blocks: [{ name: '大野治長の先手' }, { name: '大野治長の本隊' }, { name: '大野の後備え' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
  ] },
  // 関ヶ原（11/14 クラウドせ K127「戦場が狭い・振り返ると何も無い」）：noFake で遠くの軽い兵が空になり、始めの右・左・後ろが草原だけだった（reports/gate4/k06_sekigahara.jpg）。
  //   始まりの井伊の陣（-170,100）から 140m 内の、本物の隊の無い所に二陣・後備えを置く。西が西軍・東が東軍。出所 docs/fujin/k06_sekigahara.md
  //   本人の道（井伊の陣→宇喜多の先手前 -284,36・春日神社 -212,52）と島津の退き口（-112,-36→-60,40→-10,170）を空ける。
  //   西（福島の二陣 -196,14・筒井 -150,-4・宇喜多の二陣 -300,104）にも置くと宇喜多の先手が引き寄せられ段4が五百秒延びた（act bot 失敗）ので、東と南だけ
  //   11/14 クラウドす：keep＝本人が井伊の陣から宇喜多の前へ80m出ると、後ろの備が本物の上限の刈り込み（depth_reserve frontFill）で45秒までに消え、振り返ると草原だけだった
  k06_sekigahara: { keep: true, rows: [
    { key: 'iiB', name: '井伊の後備え', side: 0, x: -118, z: 118, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'ii', armor: 0x8e1f16, row: '井伊 後備え', leaders: [] },
    { key: 'tadayoshi', name: '松平忠吉の後備え', side: 0, x: -126, z: 70, w: 24, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '松平 後備え', leaders: [] },
    { key: 'kyogoku', name: '京極高知の二陣', side: 0, x: -176, z: 196, w: 28, d: 8, count: 150, facing: -S * 0.7, flag: 'kyogoku', armor: 0x2e2a26, row: '藤堂・京極 二陣', leaders: [] },
    // 11/14 クラウドせ K127 残り「始め（霧の晴れる前）の右・左が空」：本人（始め -172,99→8秒で -206,80 へ馬で出る）の右＝北と左＝南の 40m 内に備を置く（60m より先の兵は写真で点にもならなかった）。
    //   北は福島の後ろの筒井・田中の後備え（春日神社 -212,52 と本人の道より東）、南は藤堂の後備え（大谷の前の平塚 -380,155 から二百m離す）
    //   11/14 クラウドす：筒井・田中を -188→-228 へ（宇喜多の前で斬り合う本人 -275,40 の真後ろ 47m。前は 90m 後ろで振り返ると草原だけ）
    { key: 'tsutsui', name: '筒井定次・田中吉政の後備え', side: 0, x: -228, z: 56, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '福島の後ろ', leaders: [] },
    //   11/14 クラウドす（K127 残り「始めの右」）：筒井を前へ移すと始め（-206,80）の右＝北が草原に戻ったので、元の筒井の所（本人の道より東・春日神社 -212,52 を空ける）に細川・加藤の後備えを百人
    { key: 'hosokawaB', name: '細川忠興・加藤嘉明の後備え', side: 0, x: -186, z: 56, w: 22, d: 7, count: 100, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '細川・加藤 後備え', leaders: [] },
    { key: 'todoB', name: '藤堂高虎の後備え', side: 0, x: -200, z: 110, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'todo', armor: 0x2e2a26, row: '藤堂・京極 後備え', leaders: [] },
    { key: 'yamauchi', name: '山内一豊・有馬豊氏（南宮山の押さえ）', side: 0, x: -84, z: 176, w: 30, d: 8, count: 150, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '南宮山の押さえ', leaders: ['山内一豊'] },
  ] },
};
