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
// 11/21 cloud-41（戸次川の主・司令塔「段3の味方が尽きる」）：描かずの通しで包み（220秒）の後、四国の衆の後備えの塊が持ち場で島津の本隊に囲まれ 620→26（380秒）。
//   史実は仙石勢から崩れ、多くは川を渡って退いた（討たれたのは信親の手と十河）。後備えの塊は信親の救援の下知（s3.st≥1・仙石の「退け」の頃）から元の岸へ退く。
//   ただし本人の 70m 内の塊は残って一緒に戦う（全部退くと本人の周りが空き、act bot が救援の段で倒れた）
const hBack = (rt, r) => {
  if ((rt.flags.step || 0) >= 4) return true;
  if ((rt.flags.step || 0) !== 3 || !((rt.flags.s3?.st || 0) >= 1)) return false;
  const P = rt.player?.u?.pos; return !r || !P || Math.hypot(P.x - r.x, P.z - r.z) > 70;
};
const hAmbush = (rt) => (rt.flags.step || 0) >= 3;
//   a（浅瀬の口の手前の溜まり）は今は使わない：溜まりで待つと渡りの下知から三十秒で半分が元の岸に残った（描かずの数え 247/572）。進軍の下知で溜まらずに浅瀬を渡り、本人と並んで対岸の陣へ
const hMv = (a, b, c, d) => [{ when: hMarch, x: b[0], z: b[1], facing: S, speed: 4.6 },
  { when: hChase, x: c[0], z: c[1], facing: S, speed: 3.8 }, { when: hBack, x: d[0], z: d[1], facing: S, speed: 4.2 }];
const hAm = (x, z, f = 0) => [{ when: hAmbush, x, z, facing: f, speed: 4.6 }];
// 11/19 係（kaito「天王寺レベルの軍勢」・桶狭間・森部・墨俣・稲葉山）：nb 塊（一塊 44 人・幅 13m）の行を一つ書く。持ち場で待つだけ（noEngage）
const NUM = '一二三四五';
const blk = (key, name, side, x, z, nb, facing, flag, row, o = {}) => ({ key, name, side, x, z, w: 13 * nb, d: 12, count: 200 * nb, facing, flag, armor: side ? 0x2a2622 : 0x2e2a26, row, leaders: [],
  blocks: Array.from({ length: nb }, (_, i) => ({ name: `${name} ${NUM[i]}` })), ranks: 4, noEngage: true, ...o, _neHold: o.noEngage === true });   // _neHold：わざわざ待たせると書いた行だけ（K457 fujin_wake.js はそれ以外の待ちを段で起こす）
// 11/20 夜（kaito）：桶狭間・森部・墨俣・稲葉山の増やした備は持ち場で待たず、寄る敵と戦う（noEngage を外す。army_think の「近い敵とは打ち合う」）
const blkF = (key, name, side, x, z, nb, facing, flag, row, o = {}) => blk(key, name, side, x, z, nb, facing, flag, row, { noEngage: false, ...o });
// 11/20 K458（kaito「1800人いるのに一分歩けば敵の本陣に着く」）：三方ヶ原の武田の魚鱗は b_mikatagahara.js の TK_W で原点（徳川の本陣）から 2.5倍の間に広げた。
//   ここで足した武田の備（side 1）も同じ倍率で置き直し、備と本陣の比を保つ（徳川の側はそのまま）
// 11/20 K458 続き：手取川の上杉の奥（side 1）を柴田の本陣（0,−66）から 1.6倍の奥へ（b_tedorigawa.js の uw と同じ）。横は野の幅（±170）の内に収める
const mkUesugiWide = (rows) => rows.map((r) => (r.side === 1 ? { ...r, x: Math.max(-170, Math.min(170, r.x * 1.6)), z: -66 + (r.z + 66) * 1.6 } : r));
// 11/20 K467 の騎馬（cloud-32・司令塔「武田騎馬の突撃を天王寺の出来へ」）：足した武田の備（mkT…・後備えと脇の備え）は二割を騎馬武者に
//   （天王寺の真田の騎馬と同じ cav・depth_reserve.js）。cavKeep：馬に乗せた足軽・侍の命と一撃は元のまま（馬に乗せて強くしない・act 11/21）。平手の列へ走り込む三つの塊（b_mikatagahara.js takedaMove）にも騎馬が混ざり、駆け・馬上の槍・倒れる馬が出る。数は変えない
const mkTakedaWide = (rows) => rows.map((r) => (r.side === 1 ? { ...r, x: r.x * 2.5, z: r.z * 2.5, ...(/^mkT/.test(r.key) ? { cav: 0.2, cavKeep: true } : {}) } : r));
// 11/20 K458 続き：森部の斎藤の備は b_moribe.js の SW2 で（x −20・z 47 を軸に）2倍の間へ広げた。足した斎藤の備（side 1）も同じ式で置き直す
const mkSaitoWide = (rows) => rows.map((r) => (r.side === 1 ? { ...r, x: -20 + (r.x + 20) * 2, z: 47 + (r.z - 47) * 2 } : r));
// 11/20 K458 八尾・若江：大坂方の長瀬川の西（x<−40）の奥の備を、x −40 を軸に西へ2.5倍（盛親の本陣 −84→−150・b_k14_yao_wakae.js の YAO と k14/depth.js も同じ）。立てる遠さも同じ倍率（行の reachK）
const mkOsakaWide = (rows) => rows.map((r) => (r.side === 1 && r.x < -40 ? { ...r, x: Math.max(-300, -40 + (r.x + 40) * 2.5), reachK: 2.5 } : r));
// 11/20 K458 元和天下返し：徳川の家康の本陣（z −150）より奥の備を、z −150 を軸に北へ2.5倍（秀忠の陣 −195→−262・b_k16_secret.js の HIDE も同じ）
const mkTokugawaDeep = (rows) => rows.map((r) => (r.side === 1 && r.z < -150 ? { ...r, z: Math.max(-300, -150 + (r.z + 150) * 2.5), reachK: 2.5 } : r));
// 11/20 K458 桶狭間：今川の本陣（戦場の座標 110,33）の周りの休む備（side 1）を本陣から 1.6倍の間に（本陣・突撃の道・幕の周りはそのまま。台本の座標を動かさず、周りの六千を広く）
const mkImagawaWide = (rows) => rows.map((r) => (r.side === 1 ? { ...r, x: 110 + (r.x - 110) * 1.6, z: 33 + (r.z - 33) * 1.6, reachK: 1.6 } : r));
// 11/19 iMac 係 army-08：根来寺の谷の座標（lx 左・lz 奥）→ 戦場の座標（b_t04_negoro.js の P と同じ）。NGR＝奥（+lz）へ向く角
const NG_ROT = Math.atan2(0.849, -0.529), NG_CR = Math.cos(NG_ROT), NG_SR = Math.sin(NG_ROT);
const NGP = (x, z) => [Math.round(x * NG_CR + z * NG_SR), Math.round(-x * NG_SR + z * NG_CR)];
const NGR = NG_ROT;
// 11/19 係 army-11：杭瀬川は戦の座標が川の向きに回してある（b_k04_kuisegawa.js の T・O_L）。局所の (x,z)・向き（0＝局所 +z）を同じ式でゲームの座標へ
const kqT = (x, z) => { const a = x - 70, b = z + 20; return { x: -0.81395 * a + 0.58093 * b, z: -0.58093 * a - 0.81395 * b }; };
const kqY = (a) => { const v = kqT(70 + Math.sin(a), -20 + Math.cos(a)), o = kqT(70, -20); return Math.atan2(v.x - o.x, v.z - o.z); };
const kq = (key, name, side, lx, lz, nb, lf, flag, row, o = {}) => { const p = kqT(lx, lz); return blk(key, name, side, Math.round(p.x), Math.round(p.z), nb, kqY(lf), flag, row, o); };
// 11/20 クラウド：稲生・金ヶ崎（kaito「天王寺レベルの軍勢」）。座標の列 xs と段 zs の格子に blk を並べる（skip は置かない場所の判定）
const grid = (pre, name, side, xs, zs, nb, facing, flag, row, o = {}, skip = () => false) => { const r = []; let n = 0; for (const z of zs) for (const x of xs) { if (skip(x, z)) continue; n++; r.push(blk(pre + n, `${name} ${n}`, side, x, z, nb, facing, flag, row, o)); } return r; };
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
  k11_sanadamaru: { tRoom: 0, stayPut: true, keep: true, idleFar: true, rows: [
    { key: 'maeda', name: '前田利常の本隊', side: 0, x: -24, z: 78, w: 40, d: 14, count: 300, facing: S, flag: 'maeda', armor: 0x2e2a26, row: '前田 本隊', leaders: [], blocks: [{ name: '前田の旗本 一の手', flag: 'maeda' }, { name: '前田の二の手', flag: 'maeda' }, { name: '前田の三の手', flag: 'maeda' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'ii', name: '井伊直孝の備', side: 0, x: -100, z: 48, w: 34, d: 14, count: 240, facing: S, flag: 'ii', armor: 0x8e1f16, row: '井伊', leaders: [], blocks: [{ name: '井伊の赤備え 一の手', flag: 'ii' }, { name: '井伊の二の手', flag: 'ii' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'echizen', name: '松平忠直の越前勢', side: 0, x: -150, z: 42, w: 46, d: 14, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '松平忠直', leaders: [], blocks: [{ name: '越前勢の一の手', flag: 'tokugawa' }, { name: '越前勢の二の手', flag: 'tokugawa' }, { name: '越前勢の三の手', flag: 'tokugawa' }], blockW: 14, blockMax: 28, ranks: 4, nobori: true },
    { key: 'todo', name: '藤堂高虎の備', side: 0, x: -150, z: 104, w: 34, d: 12, count: 220, facing: S, flag: 'todo', armor: 0x2e2a26, row: '藤堂', leaders: [], blocks: [{ name: '藤堂高虎の旗本', flag: 'todo' }, { name: '藤堂の二の手', flag: 'todo' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'date', name: '伊達政宗の備', side: 0, x: -196, z: 122, w: 40, d: 14, count: 300, facing: S, flag: 'date', armor: 0x1a1a22, row: '伊達', leaders: [], blocks: [{ name: '伊達政宗の旗本', flag: 'date' }, { name: '片倉重長の備', flag: 'date' }, { name: '伊達の三の手', flag: 'date' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'asano', name: '浅野長晟の備', side: 0, x: -200, z: 62, w: 30, d: 12, count: 200, facing: S, flag: 'asano', armor: 0x2e2a26, row: '浅野', leaders: [], blocks: [{ name: '浅野長晟の備', flag: 'asano' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'sakakibara', name: '榊原康勝・松倉重政の備', side: 0, x: -34, z: 134, w: 40, d: 12, count: 220, facing: S, flag: 'sakakibara', armor: 0x2e2a26, row: '榊原・松倉', leaders: [], blocks: [{ name: '榊原康勝の備', flag: 'sakakibara' }, { name: '松倉重政の備', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'sakai', name: '酒井家次・南部利直の備（東）', side: 0, x: 120, z: 140, w: 40, d: 12, count: 220, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '東', leaders: [], blocks: [{ name: '酒井家次の備', flag: 'tokugawa' }, { name: '南部利直の備', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'hidetada', name: '徳川秀忠の本陣（岡山）', side: 0, x: 186, z: 226, w: 50, d: 16, count: 300, facing: S, flag: 'tokugawa', armor: 0x2e2a26, row: '岡山', leaders: [], blocks: [{ name: '徳川秀忠の旗本', flag: 'tokugawa' }, { name: '秀忠の馬廻り', flag: 'tokugawa' }, { name: '秀忠の後備え', flag: 'tokugawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」・真田丸）：兵の比（徳川 数万・真田方 惣構の内 数千）。丸の塀・撃ってくる所は前のまま。篠山の東の徳川の後備えと、惣構の堀（z−92）の北の豊臣の備。持ち場で待つだけ
    blk('smT1', '徳川の寄せ手の後備え 1', 0, 70, 70, 3, S, 'tokugawa', '徳川 篠山の東', { noEngage: true }),
    blk('smT2', '徳川の寄せ手の後備え 2', 0, 70, 90, 3, S, 'tokugawa', '徳川 篠山の東', { noEngage: true }),
    blk('smT3', '徳川の寄せ手の後備え 3', 0, 110, 70, 3, S, 'tokugawa', '徳川 篠山の東', { noEngage: true }),
    blk('smT4', '徳川の寄せ手の後備え 4', 0, 110, 90, 3, S, 'tokugawa', '徳川 篠山の東', { noEngage: true }),
    // K442（kaito 11/20「真田丸これくらいを考えてる」・目標の画 docs/kaito_refs_all/20261120/sanadamaru_goal.jpg：堀の前の野に寄せ手が何千と詰める）：
    //   丸の正面の左右の野（外の柵から二十m 余り外）に、前田・越前の寄せの塊を肩の触れる厚さで。本人の道（篠山 22,50 → 正面の柵 0,6・西へ回る柵の外の帯）は空ける。
    //   始めは前田の本陣の左右（z 140〜170・本人の道と段の外）で待ち、城内の爆発（blast）で空堀へ駆け込む（丸の前の野に始めから立てると act bot が正面・西の脇で三度失敗した）。丸を向いて持ち場で待つ（noEngage）・名のある武将の横へ付け直さない（fixedPos。付け直すと篠山の南 z130〜156 へ寄せられ、丸の前が空いた）。携帯は idleFar（idle_far.js）で本人から遠い間は休ませる
    blk('smF1', '前田の寄せ手 正面の左', 0, -60, 150, 3, S, 'maeda', '前田 丸の前', { deep: true, fixedPos: true, stay: true }),
    blk('smF2', '前田の寄せ手 正面の左奥', 0, -60, 168, 3, S, 'maeda', '前田 丸の前', { deep: true, fixedPos: true, stay: true }),
    blk('smF3', '越前勢の寄せ手 西の野', 0, -104, 140, 3, S, 'tokugawa', '越前 丸の西の前', { deep: true, fixedPos: true, stay: true }),
    blk('smF4', '前田の寄せ手 正面の右', 0, 64, 150, 3, S, 'maeda', '前田 丸の前', { deep: true, fixedPos: true, stay: true }),
    blk('smF5', '前田の寄せ手 正面の右奥', 0, 64, 168, 3, S, 'maeda', '前田 丸の前', { deep: true, fixedPos: true, stay: true }),
    blk('smO1', '真田丸 惣構の備 1', 1, -110, -116, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
    // K485（kaito 11/20「兵が出丸の後ろ（大坂城の側）に詰まっていて、出丸の中の兵が攻撃に出ていない」）：丸の真後ろの二つの備を丸の内の後ろの平場（塀の内）へ入れ、
    //   丸の内で構えて待つ（11/21 act bot：寄る敵と戦わせると口から外の帯へ出て③の本人を斬った）。真後ろの奥の二つ（6・7）は惣構の西の端へ寄せ、丸の後ろに兵の塊を残さない
    blk('smO2', '真田丸 惣構の備 2', 1, -14, -62, 1, 0, 'sanada', '豊臣 真田丸の内'),
    blk('smO3', '真田丸 惣構の備 3', 1, 14, -62, 1, 0, 'sanada', '豊臣 真田丸の内'),
    blk('smO4', '真田丸 惣構の備 4', 1, 110, -116, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
    blk('smO5', '真田丸 惣構の備 5', 1, -110, -136, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
    blk('smO6', '真田丸 惣構の備 6', 1, -170, -116, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
    blk('smO7', '真田丸 惣構の備 7', 1, -170, -136, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
    blk('smO8', '真田丸 惣構の備 8', 1, 110, -136, 3, 0, 'sanada', '豊臣 惣構の内', { far: true }),
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
  //   11/21 クラウド k365-cloud-09（act bot 3本に2本が新加納の砦で「岐阜方の旗本の後ろ」の侍に倒れた＝表の備が fujin_wake で起きて砦の段へ寄せた）：岐阜方の表の備は noEngage を書いて持ち場で待たせる（伏見と同じ）
  k02_kawada: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('kaS1', '浅野幸長の後ろの備', 0, -150, 70, 3, S, 'asano', '東軍 南岸 西'),
    blk('kaS2', '池田長吉の後ろの備', 0, -120, 112, 3, S, 'ageha', '東軍 南岸 西'),
    blk('kaS3', '一柳直盛の後ろの備', 0, -175, 140, 3, S, 'kuginuki', '東軍 南岸 西', { far: true, tLazy: true }),
    blk('kaS4', '山内一豊の二陣', 0, 20, 90, 3, S, 'kashiwa', '東軍 南岸 東'),
    blk('kaS5', '池田の二陣', 0, 62, 122, 3, S, 'ageha', '東軍 南岸 東'),
    blk('kaS6', '池田の三陣 西', 0, -100, 160, 3, S, 'ageha', '東軍 南岸 奥'),
    blk('kaS7', '池田の三陣 東', 0, 10, 165, 3, S, 'ageha', '東軍 南岸 奥'),
    blk('kaS8', '浅野の二の備', 0, 115, 100, 3, S, 'asano', '東軍 南岸 東', { far: true, tLazy: true }),
    blk('kaN1', '織田秀信方の北岸の備 東', 1, 0, -70, 3, 0, 'oda', '岐阜方 北岸', { noEngage: true }),
    blk('kaN2', '織田秀信方の北岸の備 東奥', 1, 30, -112, 3, 0, 'oda', '岐阜方 北岸', { noEngage: true }),
    blk('kaN3', '岐阜方の後詰', 1, -20, -142, 3, 0, 'oda', '岐阜方 後詰', { far: true, tLazy: true, noEngage: true }),
    blk('kaN4', '百々綱家の後ろの備', 1, -172, -108, 3, 0, 'oda', '岐阜方 米野', { far: true, tLazy: true, noEngage: true }),
    blk('kaN5', '米野の西の備', 1, -205, -58, 3, 0, 'oda', '岐阜方 米野', { far: true, tLazy: true, noEngage: true }),
    blk('kaN6', '東の浅瀬の後ろの備', 1, 45, -38, 3, 0, 'oda', '岐阜方 北岸', { noEngage: true }),
    blk('kaN7', '岐阜方の旗本の後ろ', 1, -55, -125, 3, 0, 'oda', '岐阜方 後詰', { noEngage: true }),
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
  k08_osaka_kizu: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, rows: [
    blk('kzA1', '蜂須賀の先手の備 西', 0, -60, 150, 3, S, 'hachisuka', '徳川 入り江の南'),
    blk('kzA2', '蜂須賀の先手の備 東', 0, 60, 150, 3, S, 'hachisuka', '徳川 入り江の南'),
    blk('kzA3', '蜂須賀の二陣の備', 0, -4, 170, 3, S, 'hachisuka', '徳川 本陣の前'),
    blk('kzA4', '浅野長晟の搦手の備 一', 0, 110, 120, 3, S, 'asano', '徳川 東'),
    blk('kzA5', '浅野長晟の搦手の備 二', 0, 150, 90, 3, S, 'asano', '徳川 東'),
    blk('kzA6', '池田忠雄の遊撃の備 一', 0, -110, 120, 3, S, 'tokugawa', '徳川 西'),
    blk('kzA7', '池田忠雄の遊撃の備 二', 0, -150, 90, 3, S, 'tokugawa', '徳川 西'),
    blk('kzA8', '蜂須賀の本陣の脇備', 0, -4, 205, 3, S, 'hachisuka', '徳川 本陣の後ろ', { far: true }),
    blk('kzE1', '明石全延の砦の外の備 西', 1, -70, -40, 3, 0, 'toyotomi', '豊臣 砦の西'),
    blk('kzE2', '明石全延の砦の外の備 東', 1, 70, -40, 3, 0, 'toyotomi', '豊臣 砦の東'),
    blk('kzE3', '薄田兼相の博労淵の備 一', 1, -40, -110, 3, 0, 'toyotomi', '豊臣 博労淵'),
    blk('kzE4', '薄田兼相の博労淵の備 二', 1, 40, -110, 3, 0, 'toyotomi', '豊臣 博労淵'),
    blk('kzE5', '砦の北の後詰 一', 1, -90, -90, 3, 0, 'toyotomi', '豊臣 砦の北'),
    blk('kzE6', '砦の北の後詰 二', 1, 90, -90, 3, 0, 'toyotomi', '豊臣 砦の北'),
  ] },
  t07_ganjaku: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, rows: [
    // 11/20 K457 cloud-08（上からの図 200秒：本人が門 (-56,67) で戦う間、蒲生の塊が全部出だしの坂の下に残った）：
    //   蒲生の先手の二つは段に合わせて大手の坂を上り（段1 坂の中ほど・段3 坂の木戸の下・段4 門の前）、寄る敵と斬り合う（blkF）。fixedPos：K456 の武将への付け直し（attachRows は付けた行の moves を消す）から外す
    blkF('gjA1', '蒲生氏郷の大手の先手 一', 0, -196, 190, 3, S + 0.6, 'gamo', '豊臣 大手の坂の下', { fixedPos: true, moves: [
      { when: (rt) => (rt.flags.stage || 0) >= 1, x: -140, z: 130, facing: S + 0.6, speed: 3.2 },
      { when: (rt) => (rt.flags.stage || 0) >= 3, x: -104, z: 104, facing: S + 0.6, speed: 3.2 },
      { when: (rt) => (rt.flags.stage || 0) >= 4, x: -74, z: 76, facing: S + 0.6, speed: 3.2 }] }),   // 段5で二の丸へ入れた回に act bot が1080秒で時切れ（熊井が本人へ来ない。この直しの無い今の main でも act は2勝2倒れなので元は別かも）。用心で門の前まで
    blkF('gjA2', '蒲生氏郷の大手の先手 二', 0, -240, 140, 3, S + 0.6, 'gamo', '豊臣 大手の坂の下', { fixedPos: true, moves: [
      { when: (rt) => (rt.flags.stage || 0) >= 2, x: -170, z: 150, facing: S + 0.6, speed: 3.2 },
      { when: (rt) => (rt.flags.stage || 0) >= 4, x: -122, z: 118, facing: S + 0.6, speed: 3.2 }] }),
    blk('gjA3', '蒲生の手の後ろ', 0, -236, 100, 3, S + 0.6, 'gamo', '豊臣 大手の後ろ'),
    blk('gjA4', '前田利勝の搦手の備 一', 0, -170, 228, 3, S, 'maeda', '豊臣 搦手'),
    blk('gjA5', '前田利勝の搦手の備 二', 0, -130, 210, 3, S, 'maeda', '豊臣 搦手'),
    blk('gjA6', '羽柴秀勝の本陣の備', 0, -214, 214, 3, S, 'toyotomi', '豊臣 本陣'),
    // 11/21 K582 クラウド持ち主（act bot 2回とも「豊臣の後ろの備 二 一」が蒲生の陣幕の脇 (-185,170) で十六〜二十八組重なって止まった・「一 三」は (-259,211) へ歩き続けた）：
    //   付け直しで秀勝の本陣と蒲生の陣幕の間（本人の進軍の道の脇）へ寄せられていた→付け直さず布陣図の後ろの備の場所に立て、後詰として持ち場で待つ（fixedPos・noEngage。坂へ二百六十人が寄せると門の段の釣り合いが崩れる）
    blk('gjA7', '豊臣の後ろの備 一', 0, -118, 206, 3, S, 'toyotomi', '豊臣 後ろの備', { fixedPos: true, noEngage: true }),
    blk('gjA8', '豊臣の後ろの備 二', 0, -92, 228, 3, S, 'toyotomi', '豊臣 後ろの備', { far: true, fixedPos: true, noEngage: true }),
    blk('gjA9', '東の尾根の羽柴勢', 0, 54, 80, 3, S, 'toyotomi', '豊臣 東の尾根'),
    blk('gjE1', '芥田悪六兵衛の坂の守り', 1, -110, 110, 3, -S / 2, 'akizuki', '秋月 坂'),
    blk('gjE2', '二の丸の城兵 一', 1, -40, 30, 3, -S / 2, 'akizuki', '秋月 二の丸'),
    blk('gjE3', '二の丸の城兵 二', 1, -10, 50, 3, -S / 2, 'akizuki', '秋月 二の丸'),
    blk('gjE4', '熊井越中守の本丸の備', 1, 20, -20, 3, -S / 2, 'akizuki', '秋月 本丸'),
    // 11/21 K582 クラウド：尾根の塀の守りは持ち場の塀で待つ（_neHold）。段で起こすと東の尾根から百十m 下りて二の丸の本人へ寄り、一太刀38で倒した（act bot 254秒）
    // 11/21 10:20 K582 クラウド持ち主（act bot 携帯の見なし 272秒 倒れ・段3で二の丸の門 (-58,68) の本人を西の尾根の塀の守り 二 が四太刀）：
    //   塊の行は近くの武将の横へ付け直され（fujin_place の付け直し）、尾根の塀の守りが門の前・本丸の脇に立ってから綱で百m の持ち場へ戦の中を歩いていた→付け直さず尾根の塀に立てる（fixedPos）
    blk('gjE5', '東の尾根の塀の守り', 1, 80, 30, 3, -S / 2, 'akizuki', '秋月 東の尾根', { noEngage: true, fixedPos: true }),
    blk('gjE6', '西の尾根の塀の守り', 1, -90, -30, 3, -S / 2, 'akizuki', '秋月 西の尾根', { noEngage: true, fixedPos: true }),
  ] },
  // 一宮城（docs/fujin/t05_ichinomiya.md）11/20 クラウド：北の河原（z −255〜−130・川は z −100 より南）に羽柴勢の塊・東の大手の前と城山の斜面に長宗我部の塊。本丸・小倉丸・明神丸・水の手・坑道（x −110〜−60）は空ける。持ち場で待つだけ
  t05_ichinomiya: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ic1', '蜂須賀正勝の備', 0, -80, -130, 3, 0, 'hachisuka', '羽柴勢 河原'),
    blk('ic2', '黒田官兵衛の備', 0, -35, -130, 3, 0, 'kuroda', '羽柴勢 河原'),
    blk('ic3', '蜂須賀家政の備', 0, 110, -130, 3, 0, 'hachisuka', '羽柴勢 河原'),
    blk('ic4', '羽柴の備 一', 0, 155, -130, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic5', '藤堂高虎の備', 0, -80, -215, 3, 0, 'todo', '羽柴勢 河原'),
    blk('ic6', '羽柴の備 二', 0, -35, -215, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic7', '増田長盛の備', 0, 10, -215, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic8', '羽柴の備 三', 0, 55, -215, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic9', '羽柴の備 四', 0, 100, -215, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic10', '羽柴の備 五', 0, 145, -215, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic11', '羽柴秀長の旗本の後備え 一', 0, -60, -255, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic12', '羽柴の備 六', 0, -15, -255, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic13', '羽柴の備 七', 0, 30, -255, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic14', '羽柴の備 八', 0, 75, -255, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic15', '羽柴の備 九', 0, 120, -255, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic16', '羽柴の備 十', 0, -80, -175, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic17', '羽柴の備 十一', 0, -35, -175, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic18', '羽柴の備 十二', 0, 110, -175, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic19', '羽柴の備 十三', 0, 155, -175, 3, 0, 'toyotomi', '羽柴勢 河原'),
    blk('ic20', '東の大手の備 一', 0, 150, -55, 3, 0, 'toyotomi', '羽柴勢 河原', { far: true, tLazy: true }),
    blk('ic21', '東の大手の備 二', 0, 195, -60, 3, 0, 'toyotomi', '羽柴勢 河原', { far: true, tLazy: true }),
    blk('ic22', '東の大手の備 三', 0, 240, -60, 3, 0, 'todo', '羽柴勢 河原', { far: true, tLazy: true }),
    blk('ie1', '長宗我部の城山の備 1', 1, 0, 45, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie2', '長宗我部の城山の備 2', 1, 45, 40, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie3', '長宗我部の城山の備 3', 1, 95, 75, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie4', '長宗我部の城山の備 4', 1, 100, 115, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie5', '長宗我部の城山の備 5', 1, 150, 95, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie6', '長宗我部の城山の備 6', 1, 160, 55, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie7', '長宗我部の城山の備 7', 1, -20, 150, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie8', '長宗我部の城山の備 8', 1, 30, 150, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie9', '長宗我部の城山の備 9', 1, -70, 130, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie10', '長宗我部の城山の備 10', 1, -120, 110, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie11', '長宗我部の城山の備 11', 1, 120, 140, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie12', '長宗我部の城山の備 12', 1, -30, 70, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie13', '長宗我部の城山の備 13', 1, 75, 20, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
    blk('ie14', '長宗我部の城山の備 14', 1, 125, 20, 3, S, 'chosokabe', '長宗我部 城山', { far: true, tLazy: true }),
  ] },
  // 今福（docs/fujin/k09_imafuku.md）11/20 クラウド：堤（z ±7）と二つの川（z ±25）は空け、堤の東の奥（x 190〜）に佐竹の後備え・大和川の南に上杉の鉄砲・鯰江川の北の今福村に豊臣の塊。持ち場で待つだけ
  k09_imafuku: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    // 11/21 K582 クラウド11（今福 act bot 221秒：佐竹の後備え 3 二が K466 の付き従いで佐竹の武将を追い、堤の脇の湿地 (-92,40) で重なり止まる）：布陣図の『後ろの厚み』どおり東の奥で待つ（stayPut）
    blk('if1', '佐竹の後備え 1', 0, 205, -14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if2', '佐竹の後備え 2', 0, 205, 0, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if3', '佐竹の後備え 3', 0, 205, 14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if4', '佐竹の後備え 4', 0, 260, -14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if5', '佐竹の後備え 5', 0, 260, 0, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if6', '佐竹の後備え 6', 0, 260, 14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { fixedPos: true, stayPut: true }),
    blk('if7', '佐竹の後備え 7', 0, 315, -14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { far: true, tLazy: true, fixedPos: true, stayPut: true }),
    blk('if8', '佐竹の後備え 8', 0, 315, 0, 4, -S / 2, 'satake', '佐竹勢 堤の東', { far: true, tLazy: true, fixedPos: true, stayPut: true }),
    blk('if9', '佐竹の後備え 9', 0, 315, 14, 4, -S / 2, 'satake', '佐竹勢 堤の東', { far: true, tLazy: true, fixedPos: true, stayPut: true }),
    // 11/21 K582 クラウド11（今福 act bot 156・196・211秒：『上杉の鉄砲の備 1 二』が K466 の付き従い（fujin_place.js fujinMoves）で武将を追って川の北へ出て重なり止まる）：史実の上杉は川を渡らず中州から横撃。起こさず（noEngage）付いて行かず（stayPut）持ち場で待つ
    blk('iu1', '上杉の鉄砲の備 1', 0, 20, 62, 3, S, 'uesugi', '上杉勢 大和川の南', { far: true, tLazy: true, fixedPos: true, noEngage: true, stayPut: true }),
    blk('iu2', '上杉の鉄砲の備 2', 0, 65, 62, 3, S, 'uesugi', '上杉勢 大和川の南', { fixedPos: true, noEngage: true, stayPut: true }),
    blk('iu3', '上杉の鉄砲の備 3', 0, 110, 62, 3, S, 'uesugi', '上杉勢 大和川の南', { fixedPos: true, noEngage: true, stayPut: true }),
    blk('iu4', '上杉の鉄砲の備 4', 0, 155, 62, 3, S, 'uesugi', '上杉勢 大和川の南', { fixedPos: true, noEngage: true, stayPut: true }),
    blk('iu5', '上杉の鉄砲の備 5', 0, 200, 62, 3, S, 'uesugi', '上杉勢 大和川の南', { fixedPos: true, noEngage: true, stayPut: true }),
    blk('ie1', '豊臣の今福村の備 1', 1, -160, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
    blk('ie2', '豊臣の今福村の備 2', 1, -115, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
    blk('ie3', '豊臣の今福村の備 3', 1, -70, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
    blk('ie4', '豊臣の今福村の備 4', 1, -25, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
    blk('ie5', '豊臣の今福村の備 5', 1, 20, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
    blk('ie6', '豊臣の今福村の備 6', 1, 65, -62, 3, S, 'toyotomi', '豊臣方 今福村', { far: true, tLazy: true, fixedPos: true }),
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
  t12_odawara: { tRoom: 0, keep: true, idleFar: true, nbTouch: [4, 2], rows: [
    // 11/21 クラウド小田原の持ち主：act bot 617秒、秀吉の旗本 二の手 六人が堀の陣の前 (-46,76) で重なって止まった（★★ 三度）。
    //   持ち場に立てても (-48,80) で同じ（562秒）＝普請場へ忍び寄る北条の物見に十八m 内で待ちを解き（engageNear）、林の縁で寄り合って止まっていた。
    //   石垣山の三つの陣（秀吉・堀・小早川）は持ち場で待つだけ（noEngage。物見は本人と普請の番・手勢が受け持つ）
    { key: 'hideyoshi', name: '豊臣秀吉の本陣（石垣山）', side: 0, x: -54, z: 104, w: 46, d: 18, count: 260, facing: 2.72, flag: 'toyotomi', armor: 0x23211e, row: '石垣山', leaders: [], blocks: [{ name: '秀吉の旗本 一の手', flag: 'toyotomi' }, { name: '秀吉の旗本 二の手', flag: 'toyotomi' }, { name: '秀吉の旗本 三の手', flag: 'toyotomi' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    { key: 'hori', name: '堀秀政の陣', side: 0, x: -46, z: 72, w: 24, d: 12, count: 80, facing: 2.69, flag: 'hori', armor: 0x23211e, row: '海蔵寺', leaders: [], blocks: [{ name: '堀秀政の備', flag: 'hori' }, { name: '堀の二の手', flag: 'hori' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    { key: 'kobayakawa', name: '小早川隆景の陣', side: 0, x: -96, z: 70, w: 24, d: 12, count: 80, facing: 2.51, flag: 'kobayakawa', armor: 0x23211e, row: '堀の西', leaders: [], blocks: [{ name: '小早川隆景の備', flag: 'kobayakawa' }, { name: '小早川の二の手', flag: 'kobayakawa' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    // 11/21 06:30 UTC クラウド小田原の持ち主：act bot 683秒、宇喜多の二つの塊が西の早川口の外を離れ、本人の55m 後ろ（総構えの中 (-5,-3)・(9,25)）へついて行こうとして
    //   画面の外の立て場 (-65,-17) で五人ずつ一点に重なって止まった（★★ 三度）。囲みの諸将は秀吉の命で総攻めをせず持ち場に居た（history）。西・北西・北の陣も石垣山の三陣と同じく持ち場で待つだけ（noEngage）
    { key: 'ukita', name: '宇喜多秀家の陣', side: 0, x: -72, z: -22, w: 24, d: 12, count: 80, facing: 2.30, flag: 'ukita', armor: 0x23211e, row: '早川口の外', leaders: [], blocks: [{ name: '宇喜多秀家の備', flag: 'ukita' }, { name: '宇喜多の二の手', flag: 'ukita' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    { key: 'nobukatsu', name: '織田信雄の陣', side: 0, x: -76, z: -110, w: 30, d: 14, count: 150, facing: 1.73, flag: 'nobukatsu', armor: 0x23211e, row: '北西の口の外', leaders: [], blocks: [{ name: '織田信雄の備', flag: 'nobukatsu' }, { name: '信雄の二の手', flag: 'nobukatsu' }, { name: '信雄の三の手', flag: 'nobukatsu' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    { key: 'hidetsugu', name: '羽柴秀次の陣', side: 0, x: -72, z: -166, w: 30, d: 14, count: 170, facing: 1.29, flag: 'toyotomi', armor: 0x23211e, row: '北の口', leaders: [], blocks: [{ name: '羽柴秀次の備', flag: 'toyotomi' }, { name: '秀次の二の手', flag: 'toyotomi' }, { name: '秀次の三の手', flag: 'toyotomi' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true, noEngage: true },
    // 11/19 iMac army-10（kaito「天王寺レベルの軍勢」）：徳川の本隊を東の岸（山王川の東 x≧140）に家ごとの塊で。篠曲輪への道（z−100〜−50）・井伊（164,−90）・康頼・家康の陣の周りは空ける
    blk('odT1', '徳川の先手 北', 0, 152, -34, 3, S * 1.5, 'tokugawa', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT2', '本多忠勝の備', 0, 168, -8, 3, S * 1.5, 'honda', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT3', '榊原康政の備', 0, 150, 18, 3, S * 1.5, 'sakakibara', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT4', '徳川の二の備 北', 0, 168, 44, 3, S * 1.5, 'tokugawa', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT5', '大久保忠世の備', 0, 148, 70, 3, S * 1.5, 'okubo', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT6', '井伊の後ろの備', 0, 170, -66, 2, S * 1.5, 'ii', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT7', '松平康頼の後ろの備', 0, 172, -120, 2, S * 1.5, 'tokugawa', '徳川 東岸', { deep: true, nobori: true }),
    blk('odT8', '徳川の旗本の後ろ 東', 0, 172, -190, 3, S * 1.5, 'tokugawa', '徳川 本陣', { deep: true, nobori: true }),
    blk('odT9', '徳川の旗本の後ろ 西', 0, 146, -208, 3, S * 1.5, 'tokugawa', '徳川 本陣', { deep: true, nobori: true }),
    blk('odT10', '徳川の後詰 一', 0, 170, -226, 3, S * 1.5, 'tokugawa', '徳川 本陣', { deep: true, nobori: true }),
    blk('odT11', '徳川の後詰 二', 0, 150, 98, 3, S * 1.5, 'tokugawa', '徳川 後詰', { deep: true, nobori: true }),
    blk('odT12', '徳川の後詰 三', 0, 168, 124, 3, S * 1.5, 'tokugawa', '徳川 後詰', { deep: true, nobori: true, far: true }),
    blk('odT13', '徳川の後詰 四', 0, 140, 140, 3, S * 1.5, 'tokugawa', '徳川 後詰', { deep: true, nobori: true, far: true }),
    blk('odT14', '徳川の後詰 五', 0, 112, -186, 3, S * 1.5, 'tokugawa', '徳川 本陣', { deep: true, nobori: true }),
    blk('odT15', '徳川の後詰 六', 0, 144, -234, 3, S * 1.5, 'tokugawa', '徳川 本陣', { deep: true, nobori: true }),
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
  k06_sekigahara: { keep: true, deep: true, noboriAll: true, idleFar: true, nbTouch: [6, 4], rows: [
    // 11/20 クラウド（kaito 11/19「天王寺レベルの軍勢」・戦の数え 722→）：家ごとの塊（blk）。東軍は井伊・藤堂の後ろと南（徳川の本陣の前）、西軍は宇喜多・大谷の後ろ。
    //   本人の道（井伊の陣→-284,36・春日神社 -212,52）と島津の退き口（-112,-36→-60,40→-10,170）は避ける。持ち場で待つだけ。出所 docs/fujin/k06_sekigahara.md
    blk('skE1', '徳川の旗本の前 1', 0, -60, 100, 3, -S / 2, 'tokugawa', '徳川 桃配山の前'),
    blk('skE2', '浅野幸長の備', 0, -60, 135, 3, -S / 2, 'asano', '東軍 南宮山の押さえ', { far: true, tLazy: true }),
    blk('skE3', '池田輝政の備', 0, -100, 215, 3, -S / 2, 'ikeda', '東軍 南宮山の押さえ', { far: true, tLazy: true }),
    blk('skE4', '本多忠勝の備', 0, -105, 150, 3, -S / 2, 'honda', '東軍 本多の手'),
    blk('skE5', '寺沢広高の備', 0, -150, 150, 3, -S / 2, 'sashi:字寺沢:#ece6d6:#201f1c', '東軍 福島の後ろ'),   // 11/21 K365：寺沢の家紋は出所が見つからず（ja.wikipedia「寺沢広高」に家紋の記載なし）。葵の旗をやめ、字の指物（塙・馬場と同じ形）で推した。陣笠は東軍の御貸の葵
    blk('skE6', '福島正則の二陣', 0, -235, 90, 3, -S / 2, 'fukushima', '東軍 福島の後ろ'),
    blk('skE7', '黒田長政の二の備', 0, -230, -20, 3, -S / 2, 'kuroda', '東軍 北の前列', { far: true, tLazy: true }),
    // 11/20 K365 クラウド38（kaito_now ③）：細川・古田と長益・金森と生駒の備が徳川の葵で、家の見分けが付かなかった。陣立ての表の家の旗に（細川＝九曜・古田＝三引両・金森＝梅鉢）
    blk('skE8', '細川忠興の二の備', 0, -190, -40, 3, -S / 2, 'kuyo', '東軍 北の前列', { far: true, tLazy: true }),
    blk('skE9', '古田・織田長益の備', 0, -150, -60, 3, -S / 2, 'furuta', '東軍 北の後ろ', { far: true, tLazy: true }),
    blk('skE10', '金森・生駒の備', 0, -110, -90, 3, -S / 2, 'kanamori', '東軍 北の後ろ', { far: true, tLazy: true }),
    // 11/21 クラウド k06（K491「抜け駆け→福島が怒る→開戦」）：武将の横へ付け直すと三の備が宇喜多の先手の前 (-310,43〜67) に立ち、①の抜け駆けの行き先 (-284,36) の二十六 m で井伊の手と斬り合い、開戦前に東西が百人余り打ち合った。後備えの持ち場のまま（fixedPos）
    blk('skW1', '宇喜多の三の備', 1, -320, 100, 3, S / 2, 'ukita', '宇喜多 後備え', { far: true, tLazy: true, fixedPos: true }),
    blk('skW2', '宇喜多の四の備', 1, -330, 135, 3, S / 2, 'ukita', '宇喜多 後備え', { far: true, tLazy: true, fixedPos: true }),   // 11/21 k06：四の備も同じ（付け直すと①で寺沢の備と打ち合った）
    blk('skW3', '大谷吉治の備', 1, -300, 175, 3, S / 2, 'otani', '大谷 後備え', { far: true, tLazy: true }),
    blk('skW4', '小西の三の備', 1, -330, -40, 3, S / 2, 'konishi', '小西 後備え', { far: true, tLazy: true }),
    // 11/21 クラウド k06（K492「敵が少なく見える」）：石田の後備え二つが柵の東 100m の野（-300,-70・-260,-60）に立ち、①〜②で黒田・細川の二の備に
    //   削られ（描かずの数え：141秒で 6塊 264→218、166秒で 197）⑩の打って出に残らなかった。布陣図の通り笹尾山の柵（x −354）の後ろ・石田の本陣の前へ
    blk('skW5', '石田の後ろの備', 1, -392, -140, 3, S / 2, 'ishida', '石田 後備え', { far: true, tLazy: true, fixedPos: true }),
    blk('skW6', '島左近の後備え', 1, -392, -212, 3, S / 2, 'ishida', '石田 後備え', { far: true, tLazy: true, fixedPos: true }),
    blk('skW7', '松尾山の麓の備', 1, -150, 250, 3, S / 2, 'kobayakawa', '松尾山の麓', { far: true, tLazy: true }),
    blk('skW8', '小早川の前の備', 1, -90, 250, 3, S / 2, 'kobayakawa', '松尾山の麓', { far: true, tLazy: true }),
    { key: 'iiB', tN: 14, name: '井伊の後備え', side: 0, x: -118, z: 118, w: 26, d: 8, count: 150, facing: -S / 2, flag: 'ii', armor: 0x8e1f16, row: '井伊 後備え', leaders: [] },
    { key: 'tadayoshi', tN: 14, name: '松平忠吉の後備え', side: 0, x: -126, z: 70, w: 24, d: 8, count: 150, facing: -S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '松平 後備え', leaders: [] },
    { key: 'kyogoku', name: '京極高知の二陣', side: 0, x: -176, z: 196, w: 28, d: 8, count: 150, facing: -S * 0.7, flag: 'kyogoku', armor: 0x2e2a26, row: '藤堂・京極 二陣', leaders: [] },
    // 11/14 クラウドせ K127 残り「始め（霧の晴れる前）の右・左が空」：本人（始め -172,99→8秒で -206,80 へ馬で出る）の右＝北と左＝南の 40m 内に備を置く（60m より先の兵は写真で点にもならなかった）。
    //   北は福島の後ろの筒井・田中の後備え（春日神社 -212,52 と本人の道より東）、南は藤堂の後備え（大谷の前の平塚 -380,155 から二百m離す）
    //   11/14 クラウドす：筒井・田中を -188→-228 へ（宇喜多の前で斬り合う本人 -275,40 の真後ろ 47m。前は 90m 後ろで振り返ると草原だけ）
    // 11/21 K365（司令塔：旗と陣笠を史料の紋に）：筒井と田中を二つの行に分ける（人数は同じ・一行 75）。筒井＝梅鉢（ja.wikipedia「筒井氏」家紋）、
    //   田中＝左三つ巴（ja.wikipedia「田中吉政」家紋の節：関ヶ原の旗に用いた）。前は二家とも葵の旗だった
    { key: 'tsutsui', tN: 7, name: '筒井定次の後備え', side: 0, x: -228, z: 49, w: 13, d: 8, count: 75, facing: -S / 2, flag: 'umebachi', armor: 0x2e2a26, row: '福島の後ろ', leaders: [] },
    { key: 'tanakaS', tN: 7, name: '田中吉政の後備え', side: 0, x: -228, z: 63, w: 13, d: 8, count: 75, facing: -S / 2, flag: 'sashi:tanaka:#ece6d6:#201f1c', armor: 0x2e2a26, row: '福島の後ろ', leaders: [] },
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
  k07_sawayama: { keep: true, deep: true, withEmpty: true, lazy: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('swA1', '小早川の備 北の野', 0, 150, -60, 3, -S / 2, 'kuki', '大手の外 北の野'),
    blk('swA2', '小早川の備 南の野', 0, 150, 60, 3, -S / 2, 'kuki', '大手の外 南の野'),
    blk('swA3', '脇坂の手 北', 0, 176, -92, 3, -S / 2, 'kuki', '大手の外 北の野'),
    blk('swA4', '赤座の後備え 南', 0, 176, 92, 3, -S / 2, 'kuki', '大手の外 南の野'),
    blk('swA5', '小早川の旗本 後ろ北', 0, 218, -66, 3, -S / 2, 'kuki', '大手の外 奥', { far: true, tLazy: true }),
    blk('swA6', '小早川の旗本 後ろ南', 0, 218, 66, 3, -S / 2, 'kuki', '大手の外 奥', { far: true, tLazy: true }),
    blk('swA7', '松野の備', 0, 232, 0, 3, -S / 2, 'kuki', '大手の外 奥', { far: true, tLazy: true }),
    blk('swA8', '朽木の後備え', 0, 140, -100, 3, -S / 2, 'ii', '大手の外 北の野'),
    blk('swA9', '井伊の手 南の尾根', 0, 120, 100, 3, -S / 2, 'ii', '南の尾根'),
    blk('swA10', '井伊の後備え', 0, 150, 120, 3, -S / 2, 'ii', '南の尾根'),
    blk('swA11', '小川の備', 0, 100, 128, 3, -S / 2, 'ii', '南の尾根', { far: true, tLazy: true }),
    blk('swA12', '脇坂の後備え 北の尾根', 0, 110, -130, 3, -S / 2, 'kuki', '北の尾根', { far: true, tLazy: true }),
    blk('swA13', '田中の手 搦手北', 0, -150, -70, 3, S / 2, 'kuki', '搦手の外'),
    blk('swA14', '田中の手 搦手南', 0, -150, 40, 3, S / 2, 'kuki', '搦手の外'),
    blk('swA15', '田中の後備え 湖', 0, -186, -14, 3, S / 2, 'kuki', '搦手の外', { far: true, tLazy: true }),
    blk('swA16', '小早川の後備え 北', 0, 196, -110, 3, -S / 2, 'kuki', '大手の外 奥', { far: true, tLazy: true }),
    blk('swA17', '小早川の後備え 南', 0, 196, 112, 3, -S / 2, 'kuki', '大手の外 奥', { far: true, tLazy: true }),
    { key: 'kobaB', name: '小早川の二陣', side: 0, x: 194, z: -30, w: 30, d: 12, count: 300, facing: -S / 2, flag: 'sashi:kobayakawa:#ece6d6:#16140f', armor: 0x2e2a26, row: '大手の外 二陣', leaders: [], blocks: [{ name: '小早川の二陣 一の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }, { name: '小早川の二陣 二の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'kobaC', name: '小早川の後備え', side: 0, x: 194, z: 30, w: 30, d: 12, count: 300, facing: -S / 2, flag: 'sashi:kobayakawa:#ece6d6:#16140f', armor: 0x2e2a26, row: '大手の外 後備え', leaders: [], blocks: [{ name: '小早川の後備え 一の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }, { name: '小早川の後備え 二の手', flag: 'sashi:kobayakawa:#ece6d6:#16140f' }], blockW: 14, blockMax: 24, ranks: 4, nobori: true },
    { key: 'tanakaB', name: '田中吉政の後備え', side: 0, x: -140, z: -26, w: 28, d: 10, count: 200, facing: S / 2, flag: 'kuki', armor: 0x2e2a26, row: '搦手の外', leaders: [], blocks: [{ name: '田中の後備え 一の手', flag: 'kuki' }, { name: '田中の後備え 二の手', flag: 'kuki' }], blockW: 14, blockMax: 22, ranks: 4, nobori: true },
  ] },
  // 11/18 クラウド k365-cloud-37（一枚表③△「200秒 柵の向こうに鉄砲衆の小さな塊・手前の野は空き」・布陣表 docs/fujin/k16_secret.md「大軍の厚みは未実装」）：
  //   創作の総勢（連合 8万7千・徳川 14万3千）の見え方を、京街道（x≒0）と陣幕の口・柵の口を避けた所に本物の備で足す（深い塊と家の幟の林）。
  //   徳川：二重の柵の奥の東西と、秀忠の陣の西。連合：主人公の組の後ろの東西。どれも持ち場で待つだけ（hold）・段の勝ち負けの組には入らない
  k16_secret: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: mkTokugawaDeep([
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
  ]) },
  // 11/19 クラウド k365-cloud-37（一枚表③△「中津留の河原の包囲の段で味方も島津もまばら」・docs/fujin/t06_hetsugi.md）：
  //   島津家久の本隊（尾根の陰 0,−182）のさらに奥・東西に、本隊の後ろの備（島津は一万〜一万三千）を本物の塊と幟で足す。
  //   伏せ（西の林 −60,−88・東の林 108,−100）には置かない。本人が河原へ寄るまで立たない（lazy・携帯 140m）。持ち場で待つだけ・勝ち負けの組に入らない
  // 11/19 係（kaito 11/19「天王寺レベルの軍勢」：60秒の両軍の本物の兵を天王寺の八割＝千八百以上に。前は 313）：
  //   豊臣方（六千）は北の岸の渡る前の陣（長宗我部元親の残り・十河・仙石・大友の手）に、島津方（一万二千）は家久の本隊（0,−182）の奥の二列と、
  //   尾根の東西に、家ごとの塊（blocks・一塊 44 人）と幟の林で置く。伏せの林（−60,−88・108,−100）と鶴賀城（70,−150）・鏡城の丘（−186,134）・
  //   浅瀬の道には置かない。島津の奥は far（本人の 260m 内で立つ・携帯は tLazy で 140m）。持ち場で待つだけ・勝ち負けの組に入らない（keep で枠の外しにも消えない）。
  //   idleFar：携帯で本人から遠く待つだけの表の備を休ませる（idle_far.js・k15 と同じ手）
  // 11/19 係（kaito 11/19「戸次川を渡ってもついて来なかった・地形を広く」）：各行に moves（段ごとの行き先）。浅瀬（主 x20・西 x−70）を通って渡る（cross）
  // 11/20 cloud-41（戸次川の主・cloud-50 の「445秒の味方 592→43」）：noAttach [1]＝島津の本隊の奥・尾根の塊は布陣図の持ち場のまま（K456 の並べ直しで
  //   一番近い島津の将＝先手の伊集院の横へ寄せられ、追い討ちの段から四国の衆と斬り合い、包みの前に味方が 547→171 に減っていた）
  t06_hetsugi: { noAttach: [1], deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], cross: { at: 0, mouth: 28, fords: [{ x: 20, w: 22 }, { x: -70, w: 12 }] }, rows: [
    // 豊臣方（北の岸・南＝−z を向く）
    { key: 'motoR', name: '長宗我部元親の本隊', side: 0, x: -150, z: 128, w: 39, d: 12, count: 600, facing: S, flag: 'chosokabe', armor: 0x2a2622, row: '北の岸 元親の残り', leaders: [], blocks: [{ name: '元親の旗本の残り' }, { name: '元親の馬廻り' }, { name: '元親の後備え' }], ranks: 4, moves: hMv([-30, 82], [-20, -24], [-24, -62], [-140, 112]) },
    { key: 'chosoB', name: '長宗我部の二の手', side: 0, x: -95, z: 136, w: 39, d: 12, count: 600, facing: S, flag: 'chosokabe', armor: 0x2a2622, row: '北の岸 二の手', leaders: [], blocks: [{ name: '土佐の一領具足 一の手' }, { name: '土佐の一領具足 二の手' }, { name: '土佐の一領具足 三の手' }], ranks: 4, moves: hMv([-24, 48], [-12, -44], [-6, -84], [-96, 92]) },
    { key: 'sogoB', name: '十河の後備え', side: 0, x: -40, z: 112, w: 26, d: 12, count: 400, facing: S, flag: 'miyoshi', armor: 0x2c2826, row: '北の岸 十河', leaders: [], blocks: [{ name: '讃岐勢の後備え' }, { name: '讃岐勢の荷駄の守り' }], ranks: 4, moves: hMv([52, 70], [64, -28], [66, -74], [-50, 74]) },
    { key: 'senB', name: '仙石の後備え', side: 0, x: 8, z: 94, w: 39, d: 12, count: 600, facing: S, flag: 'sashi:字無:#ece6d6:#16140f',   /* 11/21 K365：仙石の旗印（白地に黒の無）。桐だった */ armor: 0x2a2420, row: '北の岸 仙石', leaders: [], blocks: [{ name: '仙石の後備え 左' }, { name: '仙石の後備え 中' }, { name: '仙石の後備え 右' }], ranks: 4, moves: hMv([62, 40], [88, -44], [88, -84], [-10, 82]) },
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
  // 11/20 kaito（K443）「柵の後ろに後方の主力を多く置き、前へ出す」：北だけだった備を南（前田・福富・塙・池田・水野・榊原・家康・本多の後ろ）まで柵の全長へ12塊足した
  // 11/19 kaito「後詰めの備ももっとちゃんと前に」：一の列 x−38→−24・二の列 x−95〜−100→−50（柵の後ろの将 x−10 のすぐ後ろに二重に厚く）
  shitaragahara: { stayPut: true, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    { key: 'oL2a', name: '佐久間の後備え', side: 0, x: -50, z: -420, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '佐久間の後備え 一' }, { name: '佐久間の後備え 二' }, { name: '佐久間の後備え 三' }], ranks: 4 },
    { key: 'oL2b', name: '滝川の後備え', side: 0, x: -50, z: -370, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '滝川の後備え 一' }, { name: '滝川の後備え 二' }, { name: '滝川の後備え 三' }], ranks: 4 },
    { key: 'oL2c', name: '大宮前の後備え', side: 0, x: -50, z: -310, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '大宮前の後備え 一' }, { name: '大宮前の後備え 二' }, { name: '大宮前の後備え 三' }], ranks: 4 },
    { key: 'oL2d', name: '羽柴の先手', side: 0, x: -50, z: -250, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '羽柴の先手 一' }, { name: '羽柴の先手 二' }, { name: '羽柴の先手 三' }], ranks: 4 },
    { key: 'oL2e', name: '丹羽の先手', side: 0, x: -50, z: -190, w: 39, d: 12, count: 600, facing: S / 2, flag: 'sujikai', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '丹羽の先手 一' }, { name: '丹羽の先手 二' }, { name: '丹羽の先手 三' }], ranks: 4 },
    { key: 'oL2f', name: '野々村の後備え', side: 0, x: -50, z: -130, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '野々村の後備え 一' }, { name: '野々村の後備え 二' }, { name: '野々村の後備え 三' }], ranks: 4 },
    { key: 'oL1a', name: '佐久間の脇備え', side: 0, x: -12, z: -400, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '佐久間の脇備え 一' }, { name: '佐久間の脇備え 二' }], ranks: 4 },
    { key: 'oL1b', name: '野々村の脇備え', side: 0, x: -12, z: -228, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '野々村の脇備え 一' }, { name: '野々村の脇備え 二' }], ranks: 4 },
    { key: 'oL1c', name: '柴田の先手', side: 0, x: -12, z: -165, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '柴田の先手 一' }, { name: '柴田の先手 二' }], ranks: 4 },
    { key: 'oL1d', name: '佐々の後備え', side: 0, x: -12, z: -118, w: 26, d: 12, count: 400, facing: S / 2, flag: 'shuro', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '佐々の後備え 一' }, { name: '佐々の後備え 二' }], ranks: 4 },
    { key: 'oL2s0', name: '前田の後備え', side: 0, x: -50, z: -65, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '前田の後備え 一' }, { name: '前田の後備え 二' }, { name: '前田の後備え 三' }], ranks: 4 },
    { key: 'oL2s1', name: '福富の後備え', side: 0, x: -50, z: -5, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '福富の後備え 一' }, { name: '福富の後備え 二' }, { name: '福富の後備え 三' }], ranks: 4 },
    { key: 'oL2s2', name: '塙の後備え', side: 0, x: -50, z: 55, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '塙の後備え 一' }, { name: '塙の後備え 二' }, { name: '塙の後備え 三' }], ranks: 4 },
    { key: 'oL2s3', name: '池田の後備え', side: 0, x: -50, z: 115, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '池田の後備え 一' }, { name: '池田の後備え 二' }, { name: '池田の後備え 三' }], ranks: 4 },
    { key: 'oL2s4', name: '水野の後備え', side: 0, x: -50, z: 175, w: 39, d: 12, count: 600, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '水野の後備え 一' }, { name: '水野の後備え 二' }, { name: '水野の後備え 三' }], ranks: 4 },
    { key: 'oL2s5', name: '榊原の後備え', side: 0, x: -50, z: 235, w: 39, d: 12, count: 600, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '榊原の後備え 一' }, { name: '榊原の後備え 二' }, { name: '榊原の後備え 三' }], ranks: 4 },
    { key: 'oL2s6', name: '家康旗本の後備え', side: 0, x: -50, z: 295, w: 39, d: 12, count: 600, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '家康旗本の後備え 一' }, { name: '家康旗本の後備え 二' }, { name: '家康旗本の後備え 三' }], ranks: 4 },
    { key: 'oL2s7', name: '本多の後備え', side: 0, x: -50, z: 405, w: 39, d: 12, count: 600, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '柵の内 二の列', leaders: [], blocks: [{ name: '本多の後備え 一' }, { name: '本多の後備え 二' }, { name: '本多の後備え 三' }], ranks: 4 },
    { key: 'oL1s0', name: '前田の脇備え', side: 0, x: -12, z: -55, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '前田の脇備え 一' }, { name: '前田の脇備え 二' }], ranks: 4 },
    { key: 'oL1s1', name: '塙の脇備え', side: 0, x: -12, z: 90, w: 26, d: 12, count: 400, facing: S / 2, flag: 'oda', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '塙の脇備え 一' }, { name: '塙の脇備え 二' }], ranks: 4 },
    { key: 'oL1s2', name: '榊原の脇備え', side: 0, x: -12, z: 200, w: 26, d: 12, count: 400, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '榊原の脇備え 一' }, { name: '榊原の脇備え 二' }], ranks: 4 },
    { key: 'oL1s3', name: '家康の脇備え', side: 0, x: -12, z: 300, w: 26, d: 12, count: 400, facing: S / 2, flag: 'tokugawa', armor: 0x2e2a26, row: '柵の内 一の列', leaders: [], blocks: [{ name: '家康の脇備え 一' }, { name: '家康の脇備え 二' }], ranks: 4 },
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
    { key: 'akWo1', name: '明智の後備え 油小路の西 北', side: 1, x: -196, z: 0, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 一' }, { name: '油小路の西の備 二' }, { name: '油小路の西の備 三' }], tN: 3, ranks: 4, noEngage: true, nobori: true },
    { key: 'akWo2', name: '明智の後備え 油小路の西 中', side: 1, x: -196, z: 44, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 四' }, { name: '油小路の西の備 五' }, { name: '油小路の西の備 六' }], tN: 3, ranks: 4, noEngage: true, nobori: true },
    { key: 'akWo3', name: '明智の後備え 油小路の西 南', side: 1, x: -196, z: 88, w: 39, d: 8, count: 600, facing: S / 2, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '油小路の西の備 七' }, { name: '油小路の西の備 八' }, { name: '油小路の西の備 九' }], tN: 3, ranks: 4, noEngage: true, nobori: true },
    // 北（六角）
    // 11/20 cloud-05（kaito_now ② 司令塔の判断・数え docs/status/honnoji_street_count_1120.md：215秒で北の通り19人・東53・南74）：
    //   ①六角の備（akN1・akN2）は寄せの波（fujin_wake.js）で起こさない（_neHold）。前は門の段で寺の塀ぎわと表門へ引かれて北が空いた
    //   ②携帯の本物の数（上限二百五十）の内訳：六角の塊は一つ十人（tN 10・前は五人）。その分、通りの奥の後備え（油小路の西 akWo1〜3・町の通りの南 akE4・E5）と
    //   一番厚い蛸薬師の西（akS1）を一つ三人に（携帯で北 +25／ほか −34。総数は前より減る）
    { key: 'akWo4', name: '明智の後備え 油小路の西 六角の辻', side: 1, x: -196, z: -40, w: 39, d: 8, count: 600, facing: S / 4, flag: 'akechi', armor: 0x2a2622, row: '油小路の西', leaders: [], blocks: [{ name: '六角の辻の備 一' }, { name: '六角の辻の備 二' }, { name: '六角の辻の備 三' }], ranks: 4, noEngage: true, nobori: true },
    { key: 'akN1', name: '斎藤利三の手 六角の西', side: 1, x: -135, z: -30, w: 39, d: 8, count: 600, facing: 0, flag: 'akechi', armor: 0x2a2622, row: '六角', leaders: [], blocks: [{ name: '六角の備 一' }, { name: '六角の備 二' }, { name: '六角の備 三' }], _neHold: true, tN: 10, ranks: 4, noEngage: true, nobori: true },
    { key: 'akN2', name: '斎藤利三の手 六角の中', side: 1, x: -96, z: -30, w: 26, d: 8, count: 400, facing: 0, flag: 'akechi', armor: 0x2a2622, row: '六角', leaders: [], blocks: [{ name: '六角の備 四' }, { name: '六角の備 五' }], _neHold: true, tN: 10, ranks: 4, noEngage: true, nobori: true },
    // 南（蛸薬師）
    { key: 'akS1', name: '明智光秀の手 蛸薬師の西', side: 1, x: -133, z: 119, w: 39, d: 8, count: 600, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 一' }, { name: '蛸薬師の備 二' }, { name: '蛸薬師の備 三' }], tN: 3, ranks: 4, noEngage: true, nobori: true },
    { key: 'akS2', name: '明智光秀の手 蛸薬師の中', side: 1, x: -109, z: 119, w: 13, d: 8, count: 200, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 四' }], ranks: 4, noEngage: true, nobori: true },
    // 蛸薬師の木戸（柱 x−98・−84）の口は空ける
    { key: 'akS3', name: '明智光秀の手 蛸薬師の東', side: 1, x: -76, z: 119, w: 13, d: 8, count: 200, facing: S, flag: 'akechi', armor: 0x2a2622, row: '蛸薬師', leaders: [], blocks: [{ name: '蛸薬師の備 五' }], ranks: 4, noEngage: true, nobori: true },
    // 東（西洞院の外・町の通り x27）
    { key: 'akE1', name: '明智光忠の手 西洞院の北', side: 1, x: -10, z: 4, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '西洞院', leaders: [], blocks: [{ name: '西洞院の備 一' }, { name: '西洞院の備 二' }], ranks: 4, noEngage: true },
    { key: 'akE2', name: '明智光忠の手 西洞院の南', side: 1, x: -10, z: 98, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '西洞院', leaders: [], blocks: [{ name: '西洞院の備 三' }, { name: '西洞院の備 四' }], ranks: 4, noEngage: true },
    { key: 'akE3', name: '明智の後備え 町の通りの北', side: 1, x: 27, z: 10, w: 39, d: 8, count: 600, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 一' }, { name: '町の通りの備 二' }, { name: '町の通りの備 三' }], ranks: 4, noEngage: true },
    { key: 'akE4', name: '明智の後備え 町の通りの南', side: 1, x: 27, z: 60, w: 39, d: 8, count: 600, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 四' }, { name: '町の通りの備 五' }, { name: '町の通りの備 六' }], tN: 3, ranks: 4, noEngage: true },
    { key: 'akE5', name: '明智の後備え 町の通りの南の辻', side: 1, x: 27, z: 110, w: 26, d: 8, count: 400, facing: -S / 2, flag: 'akechi', armor: 0x2a2622, row: '町の通り', leaders: [], blocks: [{ name: '町の通りの備 七' }, { name: '町の通りの備 八' }], tN: 3, ranks: 4, noEngage: true },
  ] },
  // 11/19 係 army-07（kaito「天王寺レベルの軍勢」・田野 docs/fujin/tano.md）：日川の谷は道（z≈0）の両脇の細い平地だけが歩ける（傾き 0.7 超の山が両側）。
  //   滝川勢（約四千）を道の脇（z±14・±28）に、本人の後ろ（西 x−215〜−95）へ東向きの家ごとの塊で置く。道（z±6）と武田方の東には置かない。武田は史実どおり少数
  // 11/21 クラウド（田野の持ち主）：K456 の付け直しが滝川の塊を武将の横（谷の外の斜面 z±45）へ移し、act bot 50秒に「滝川の後備え 4 一」が斜面で重なり止まった。谷道の両脇の持ち場のままにする
  tano: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, noAttach: [0], nbTouch: [4, 2], rows: [
    blk('tnO00', '滝川の後備え 1', 0, -215, 14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO01', '滝川の後備え 2', 0, -175, 14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO02', '滝川の後備え 3', 0, -135, 14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO03', '滝川の後備え 4', 0, -95, 14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO10', '滝川の後備え 5', 0, -215, -14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO11', '滝川の後備え 6', 0, -175, -14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO12', '滝川の後備え 7', 0, -135, -14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO13', '滝川の後備え 8', 0, -95, -14, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO20', '滝川の後備え 9', 0, -215, 24, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO21', '滝川の後備え 10', 0, -175, 24, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO22', '滝川の後備え 11', 0, -135, 24, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO23', '滝川の後備え 12', 0, -95, 24, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO30', '滝川の後備え 13', 0, -215, -28, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO31', '滝川の後備え 14', 0, -175, -28, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO32', '滝川の後備え 15', 0, -135, -28, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
    blk('tnO33', '滝川の後備え 16', 0, -95, -28, 3, S / 2, 'oda', '織田 谷の道の脇', { w: 30 }),
  ] },
  // 11/21 kaito（山崎「敵が全員奥で当たらない・少ない」）：明智の備は十八塊（約二千四百人）を川の北 z−58〜−124 に前へ出し、noEngage を外して共通の寄せ（fujinAdvance）で斬り合いへ出る。far＝260m で立つ。
  // 11/19 係 army-07（kaito「天王寺レベルの軍勢」・山崎 docs/fujin/t01_yamazaki.md）：南（+z）の羽柴勢（四万）を街道（x−22 の前）と川の南の野に、北の明智勢（一万六千）を川の北の野に、家ごとの塊（一塊 44 人）と幟で置く。西の天王山の斜面（x≦−130）・街道（x−35〜−10）には置かない。持ち場で待つだけ
  // 11/21 cloud-05（司令塔・山崎 act bot「兵が戦場の外に出た」(-60,211)）：羽柴の後備えの三列（z 185・210・235）を場の端（moveLim 210）の内の z 172・185・198 へ寄せた（塊の奥行き十二m も端の内）
  t01_yamazaki: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ymH1', '羽柴の後備え 1', 0, -100, 172, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH2', '羽柴の後備え 2', 0, -58, 172, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH3', '羽柴の後備え 3', 0, 26, 172, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH4', '羽柴の後備え 4', 0, 68, 172, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH5', '羽柴の後備え 5', 0, 110, 172, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH6', '羽柴の後備え 6', 0, -100, 185, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH7', '羽柴の後備え 7', 0, -58, 185, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH8', '羽柴の後備え 8', 0, 26, 185, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH9', '羽柴の後備え 9', 0, 68, 185, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH10', '羽柴の後備え 10', 0, 110, 185, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH11', '羽柴の後備え 11', 0, -100, 198, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH12', '羽柴の後備え 12', 0, -58, 198, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH13', '羽柴の後備え 13', 0, 26, 198, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymH14', '羽柴の後備え 14', 0, 68, 198, 3, S, 'toyotomi', '羽柴 川の南の野'),
    blk('ymA1', '明智の備 1', 1, -70, -62, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA2', '明智の備 2', 1, -30, -50, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA3', '明智の備 3', 1, 15, -50, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA4', '明智の備 4', 1, 60, -50, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA5', '明智の備 5', 1, 105, -50, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA6', '明智の備 6', 1, -75, -80, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA7', '明智の備 7', 1, -30, -80, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA8', '明智の備 8', 1, 15, -80, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA9', '明智の備 9', 1, 60, -80, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA10', '明智の備 10', 1, 105, -80, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA11', '明智の備 11', 1, -75, -102, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA12', '明智の備 12', 1, -30, -102, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA13', '明智の備 13', 1, 15, -102, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA14', '明智の備 14', 1, 60, -102, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA15', '明智の備 15', 1, 105, -102, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA16', '明智の備 16', 1, -75, -124, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA17', '明智の備 17', 1, -30, -124, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
    blk('ymA18', '明智の備 18', 1, 105, -124, 3, 0, 'akechi', '明智 川の北の野', { noEngage: false, far: true }),
  ] },
  // 11/19 係 army-07（賤ヶ岳 docs/fujin/t02_shizugatake.md）：余呉湖（楕円 −41,70・80×145）の水と砦の道には置かない。羽柴は砦の東と西の野、柴田は湖の西の岸の野（佐久間の下り）に塊で置く
  t02_shizugatake: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('szH1', '羽柴の後備え 1', 0, 100, 160, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH2', '羽柴の後備え 2', 0, 100, 200, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH3', '羽柴の後備え 3', 0, 100, 240, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH4', '羽柴の後備え 4', 0, 100, 280, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH5', '羽柴の後備え 5', 0, -130, 300, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH6', '羽柴の後備え 6', 0, -130, 335, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH7', '羽柴の後備え 7', 0, 110, 300, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szH8', '羽柴の後備え 8', 0, 110, 340, 3, S, 'toyotomi', '羽柴 砦の脇'),
    blk('szS1', '柴田の備 1', 1, -150, 150, 3, 0, 'oda', '柴田 湖の西'),
    blk('szS2', '柴田の備 2', 1, -150, 185, 3, 0, 'oda', '柴田 湖の西'),
    blk('szS3', '柴田の備 3', 1, -150, 220, 3, 0, 'oda', '柴田 湖の西'),
    blk('szS4', '柴田の備 4', 1, -190, 150, 3, 0, 'oda', '柴田 湖の西'),
    blk('szS5', '柴田の備 5', 1, -190, 185, 3, 0, 'oda', '柴田 湖の西'),
    blk('szS6', '柴田の備 6', 1, -190, 220, 3, 0, 'oda', '柴田 湖の西'),
  ] },
  // 11/19 係 army-07（小牧 docs/fujin/t03_komaki.md）：北の楽田の前の野に羽柴勢（七万）、南の小牧山の東の野に徳川・信雄勢（三万）。兵の歩ける枠は z±112 ほどなので、その内（砦と秀吉の本陣の左右の野）に置く。小牧山の丘（x−140〜−60・z100〜160）と二重堀の砦（−75,−4）の前には置かない
  t03_komaki: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('kmH1', '羽柴の後備え 1', 0, -125, -100, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH2', '羽柴の後備え 2', 0, -125, -70, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH3', '羽柴の後備え 3', 0, -125, -40, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH4', '羽柴の後備え 4', 0, -125, -10, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH5', '羽柴の後備え 5', 0, 50, -100, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH6', '羽柴の後備え 6', 0, 50, -70, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH7', '羽柴の後備え 7', 0, 50, -40, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH8', '羽柴の後備え 8', 0, 95, -100, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH9', '羽柴の後備え 9', 0, 95, -70, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmH10', '羽柴の後備え 10', 0, 95, -40, 3, 0, 'toyotomi', '羽柴 楽田の前'),
    blk('kmT1', '徳川の備 1', 1, 30, 110, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT2', '徳川の備 2', 1, 70, 110, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT3', '徳川の備 3', 1, 110, 110, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT4', '徳川の備 4', 1, 30, 85, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT5', '徳川の備 5', 1, 70, 85, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT6', '徳川の備 6', 1, 110, 85, 3, S, 'tokugawa', '徳川 小牧山の東'),
    // 11/20 クラウド（K386「何千対何千」・敵の徳川勢が薄い 725）：小牧山の東の野の南側・東側に徳川・信雄勢の塊を足す
    blk('kmT7', '織田信雄の備 1', 1, -10, 110, 3, S, 'tokugawa', '信雄 小牧山の東'),
    blk('kmT8', '織田信雄の備 2', 1, -10, 85, 3, S, 'tokugawa', '信雄 小牧山の東'),
    // 11/21 クラウド 小牧の持ち主：二の備（x140）が中入りの夜明けの道（SROAD (141,76)→(146,96)→(151,124)）の上に立ち、⑦の行き先 (146,96) の五 m 先が徳川の塊だった。
    //   密かに抜ける道の脇に徳川が並ぶのは筋書きに反する→二の備を小牧山の東の野の z60 の列へ移し、z60 の列を道から十七 m 以上離す
    blk('kmT9', '徳川の二の備 1', 1, -20, 60, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT10', '徳川の二の備 2', 1, 20, 60, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT11', '徳川の旗本の後備え', 1, 60, 60, 3, S, 'tokugawa', '徳川 小牧山の東'),
    blk('kmT12', '井伊の赤備えの後備え', 1, 100, 60, 3, S, 'tokugawa', '徳川 小牧山の東'),
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
  okehazama: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: mkImagawaWide([
    blkF('okO1', '信長の馬廻りの後ろ', 0, -20, -72, 3, S / 2, 'eiraku', '織田 谷の南'),
    blkF('okO2', '信長の本隊の徒', 0, -62, -66, 3, S / 2, 'oda', '織田 谷の南'),
    blkF('okO3', '信長の本隊の後ろ', 0, -100, -58, 2, S / 2, 'oda', '織田 谷の南'),
    blkF('okI1', '今川の本陣南の坂の備', 1, 96, -52, 3, -S / 2, 'imagawa', '今川 本陣の南'),
    // 11/20 K365 クラウド38：井伊直盛の手＝彦根橘・松井宗信の手＝竹輪に九枚笹（b_okehazama.js の II_FLAG・MATSUI_FLAG と同じ。出所 docs/evidence_now/kamon_1120）
    blkF('okI2', '井伊の後備え', 1, 142, -44, 3, -S / 2, 'sashi:tachibana:#ece6d6:#201f1c', '今川 本陣の南'),
    blkF('okI3', '今川の旗本の東の備', 1, 150, 0, 3, -S / 2, 'imagawa', '今川 本陣の東'),
    blkF('okI4', '今川の旗本の東の二の手', 1, 148, 62, 3, -S / 2, 'imagawa', '今川 本陣の東'),
    blkF('okI5', '今川の後備え 南', 1, 112, -96, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blkF('okI6', '今川の後備え 中', 1, 152, -86, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blkF('okI7', '今川の後備え 北', 1, 150, 116, 3, -S / 2, 'imagawa', '今川 本陣の奥'),
    blkF('okI8', '今川の本陣北の坂の備', 1, 130, 100, 3, -S * 0.75, 'imagawa', '今川 本陣の北'),
    blkF('okI9', '今川の北の休む備', 1, 82, 108, 3, -S * 0.75, 'imagawa', '今川 本陣の北'),
    blkF('okI10', '松井の後備え', 1, 60, -66, 3, -S / 2, 'sashi:takewa_sasa:#ece6d6:#201f1c', '今川 本陣の南'),
  ]) },
  // 高遠城（docs/fujin/takato.md：織田 三万・武田 三千）。大手の東（+x）と西の搦手に織田、曲輪の南北の脇に武田。主人公の道（z±20）は空ける
  takato: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('tkOa0', '大手の寄せ手の後ろ a0', 0, 175, -120, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ'),
    blk('tkOa1', '大手の寄せ手の後ろ a1', 0, 175, -80, 3, -S / 2, 'oda', '織田 大手の脇と後ろ'),
    blk('tkOa2', '大手の寄せ手の後ろ a2', 0, 175, -40, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ'),
    blk('tkOa3', '大手の寄せ手の後ろ a3', 0, 175, 40, 3, -S / 2, 'oda', '織田 大手の脇と後ろ'),
    blk('tkOa4', '大手の寄せ手の後ろ a4', 0, 175, 80, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ'),
    blk('tkOa5', '大手の寄せ手の後ろ a5', 0, 175, 120, 3, -S / 2, 'oda', '織田 大手の脇と後ろ'),
    blk('tkOb0', '大手の寄せ手の後ろ b0', 0, 215, -120, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOb1', '大手の寄せ手の後ろ b1', 0, 215, -80, 3, -S / 2, 'oda', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOb2', '大手の寄せ手の後ろ b2', 0, 215, -40, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOb3', '大手の寄せ手の後ろ b3', 0, 215, 40, 3, -S / 2, 'oda', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOb4', '大手の寄せ手の後ろ b4', 0, 215, 80, 3, -S / 2, 'eiraku', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOb5', '大手の寄せ手の後ろ b5', 0, 215, 120, 3, -S / 2, 'oda', '織田 大手の脇と後ろ', { far: true, tLazy: true }),
    blk('tkOw0', '信忠の搦手の後ろ 0', 0, -200, -80, 3, S / 2, 'oda', '織田 搦手の本陣', { far: true, tLazy: true }),
    blk('tkOw1', '信忠の搦手の後ろ 1', 0, -160, -40, 3, S / 2, 'oda', '織田 搦手の本陣', { far: true, tLazy: true }),
    blk('tkOw2', '信忠の搦手の後ろ 2', 0, -200, 40, 3, S / 2, 'oda', '織田 搦手の本陣', { far: true, tLazy: true }),
    blk('tkOw3', '信忠の搦手の後ろ 3', 0, -160, 80, 3, S / 2, 'oda', '織田 搦手の本陣', { far: true, tLazy: true }),
    blk('tkTa0', '武田の曲輪の備え a0', 1, -20, -95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTa1', '武田の曲輪の備え a1', 1, -20, -55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTa2', '武田の曲輪の備え a2', 1, -20, 55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTa3', '武田の曲輪の備え a3', 1, -20, 95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTb0', '武田の曲輪の備え b0', 1, 30, -95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTb1', '武田の曲輪の備え b1', 1, 30, -55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTb2', '武田の曲輪の備え b2', 1, 30, 55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTb3', '武田の曲輪の備え b3', 1, 30, 95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTc0', '武田の曲輪の備え c0', 1, 80, -95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTc1', '武田の曲輪の備え c1', 1, 80, -55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTc2', '武田の曲輪の備え c2', 1, 80, 55, 3, S / 2, 'takeda', '武田 曲輪の脇'),
    blk('tkTc3', '武田の曲輪の備え c3', 1, 80, 95, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkOc0', '大手の寄せ手の脇 北', 0, 135, -75, 3, -S / 2, 'oda', '織田 大手の脇と後ろ'),
    blk('tkOc1', '大手の寄せ手の脇 南', 0, 135, 75, 3, -S / 2, 'oda', '織田 大手の脇と後ろ'),
    blk('tkTd0', '武田の曲輪の備え 北の奥', 1, 30, -130, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTd1', '武田の曲輪の備え 南の奥', 1, 30, 130, 3, S / 2, 'takeda', '武田 曲輪の脇', { far: true, tLazy: true }),
    blk('tkTw0', '武田の搦手の備え 0', 1, -120, -60, 3, -S / 2, 'takeda', '武田 搦手'),
    blk('tkTw1', '武田の搦手の備え 1', 1, -120, -30, 3, -S / 2, 'takeda', '武田 搦手'),
    blk('tkTw2', '武田の搦手の備え 2', 1, -120, 30, 3, -S / 2, 'takeda', '武田 搦手'),
    blk('tkTw3', '武田の搦手の備え 3', 1, -120, 60, 3, -S / 2, 'takeda', '武田 搦手'),
  ] },
  // 根白坂（docs/fujin/t08_nejirozaka.md：豊臣 砦の北・島津 南の坂の下）。砦の塀 z=0・本人 (0,−5)。豊臣は砦（z>−40）と本陣（14,−96）、島津は本陣（−30,158）（38,156）の手前を空ける
  t08_nejirozaka: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, idleFarPc: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blkF('nzT00', '羽柴の後詰 00', 0, -135, -55, 3, 0, 'oda', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT01', '羽柴の後詰 01', 0, -90, -55, 3, 0, 'toyotomi', '豊臣 砦の後ろ'),
    blkF('nzT02', '羽柴の後詰 02', 0, -45, -55, 3, 0, 'oda', '豊臣 砦の後ろ'),
    blkF('nzT03', '羽柴の後詰 03', 0, 45, -55, 3, 0, 'toyotomi', '豊臣 砦の後ろ'),
    blkF('nzT04', '羽柴の後詰 04', 0, 90, -55, 3, 0, 'oda', '豊臣 砦の後ろ'),
    blkF('nzT05', '羽柴の後詰 05', 0, 135, -55, 3, 0, 'toyotomi', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT10', '羽柴の後詰 10', 0, -135, -80, 3, 0, 'oda', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT11', '羽柴の後詰 11', 0, -90, -80, 3, 0, 'toyotomi', '豊臣 砦の後ろ'),
    blkF('nzT14', '羽柴の後詰 14', 0, 90, -80, 3, 0, 'oda', '豊臣 砦の後ろ'),
    blkF('nzT15', '羽柴の後詰 15', 0, 135, -80, 3, 0, 'toyotomi', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT20', '羽柴の後詰 20', 0, -135, -125, 3, 0, 'oda', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT21', '羽柴の後詰 21', 0, -90, -125, 3, 0, 'toyotomi', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT24', '羽柴の後詰 24', 0, 90, -125, 3, 0, 'oda', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    blkF('nzT25', '羽柴の後詰 25', 0, 135, -125, 3, 0, 'toyotomi', '豊臣 砦の後ろ', { far: true, tLazy: true }),
    // 11/20 K457・K467・K469 cloud-08（司令塔の判断）：島津の寄せの塊は、土橋の塀の段（dp.i 4）から前の列が堀の外（z 30）へ、破れ口の段（6）から二列目が坂の中ほど（z 52）へ上って寄せ、
    //   寄る味方と斬り合う。それより前は陣を構えて動かない（K469）。夜明けの退き（retreating）で坂の下へ戻る。fixedPos：K456 の付け直し（moves が消える）から外す
    blkF('nzS00', '島津の寄せの後ろ 00', 1, -135, 55, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS01', '島津の寄せの後ろ 01', 1, -90, 55, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 4 && !rt.flags.retreating, x: -90, z: 30, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: -90, z: 120, facing: S, speed: 3.4 }] }),
    blkF('nzS02', '島津の寄せの後ろ 02', 1, -45, 55, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 4 && !rt.flags.retreating, x: -45, z: 30, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: -45, z: 120, facing: S, speed: 3.4 }] }),
    blkF('nzS03', '島津の寄せの後ろ 03', 1, 45, 55, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 4 && !rt.flags.retreating, x: 45, z: 30, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: 45, z: 120, facing: S, speed: 3.4 }] }),
    blkF('nzS04', '島津の寄せの後ろ 04', 1, 90, 55, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 4 && !rt.flags.retreating, x: 90, z: 30, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: 90, z: 120, facing: S, speed: 3.4 }] }),
    blkF('nzS05', '島津の寄せの後ろ 05', 1, 135, 55, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS10', '島津の寄せの後ろ 10', 1, -135, 80, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS11', '島津の寄せの後ろ 11', 1, -90, 80, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 6 && !rt.flags.retreating, x: -90, z: 52, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: -90, z: 140, facing: S, speed: 3.4 }] }),
    blkF('nzS12', '島津の寄せの後ろ 12', 1, -45, 80, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 6 && !rt.flags.retreating, x: -45, z: 52, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: -45, z: 140, facing: S, speed: 3.4 }] }),
    blkF('nzS13', '島津の寄せの後ろ 13', 1, 45, 80, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 6 && !rt.flags.retreating, x: 45, z: 52, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: 45, z: 140, facing: S, speed: 3.4 }] }),
    blkF('nzS14', '島津の寄せの後ろ 14', 1, 90, 80, 3, S, 'shimazu', '島津 坂の下', { fixedPos: true, moves: [{ when: (rt) => (rt.flags.dp?.i ?? -1) >= 6 && !rt.flags.retreating, x: 90, z: 52, facing: S, speed: 2.8 }, { when: (rt) => !!rt.flags.retreating, x: 90, z: 140, facing: S, speed: 3.4 }] }),
    blkF('nzS15', '島津の寄せの後ろ 15', 1, 135, 80, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS20', '島津の寄せの後ろ 20', 1, -135, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS21', '島津の寄せの後ろ 21', 1, -90, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS22', '島津の寄せの後ろ 22', 1, -45, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS23', '島津の寄せの後ろ 23', 1, 45, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS24', '島津の寄せの後ろ 24', 1, 90, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS25', '島津の寄せの後ろ 25', 1, 135, 105, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS30', '島津の寄せの後ろ 30', 1, -135, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS31', '島津の寄せの後ろ 31', 1, -90, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS32', '島津の寄せの後ろ 32', 1, -45, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS33', '島津の寄せの後ろ 33', 1, 45, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS34', '島津の寄せの後ろ 34', 1, 90, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
    blkF('nzS35', '島津の寄せの後ろ 35', 1, 135, 130, 3, S, 'shimazu', '島津 坂の下', { far: true, tLazy: true }),
  ] },
  // 天正伊賀（11/20 クラウド：docs/fujin/iga.md・織田 約一万二千・伊賀衆 三千五百）。麓の丹羽の陣（z40〜150）に織田、比自山の曲輪（z−60〜−240）に伊賀衆の塊。
  iga: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('igO1', '織田の備 1', 0, -70, 70, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO2', '織田の備 2', 0, 0, 78, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO3', '織田の備 3', 0, 70, 70, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO4', '織田の備 4', 0, -100, 110, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO5', '織田の備 5', 0, -35, 112, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO6', '織田の備 6', 0, 35, 112, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO7', '織田の備 7', 0, 100, 110, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO8', '織田の備 8', 0, -70, 150, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO9', '織田の備 9', 0, 0, 150, 3, S, 'oda', '織田 比自山の麓'),
    blk('igO10', '織田の備 10', 0, 70, 150, 3, S, 'oda', '織田 比自山の麓'),
    blk('igE1', '伊賀衆の備 1', 1, -30, -60, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE2', '伊賀衆の備 2', 1, 30, -62, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE3', '伊賀衆の備 3', 1, -36, -90, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE4', '伊賀衆の備 4', 1, 36, -92, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE5', '伊賀衆の備 5', 1, -30, -120, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE6', '伊賀衆の備 6', 1, 30, -122, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE7', '伊賀衆の備 7', 1, 0, -150, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE8', '伊賀衆の備 8', 1, 0, -180, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE9', '伊賀衆の備 9', 1, 0, -205, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE10', '伊賀衆の備 10', 1, -40, -235, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE11', '伊賀衆の備 11', 1, 40, -235, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE12', '伊賀衆の備 12', 1, 60, -75, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE13', '伊賀衆の備 13', 1, 60, -105, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE14', '伊賀衆の備 14', 1, -62, -80, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE15', '伊賀衆の備 15', 1, -62, -110, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE16', '伊賀衆の備 16', 1, 62, -135, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE17', '伊賀衆の備 17', 1, -60, -140, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE18', '伊賀衆の備 18', 1, 30, -165, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE19', '伊賀衆の備 19', 1, -30, -165, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE20', '伊賀衆の備 20', 1, 0, -265, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE21', '伊賀衆の備 21', 1, -35, -290, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE22', '伊賀衆の備 22', 1, 35, -290, 2, 0, 'iga', '伊賀衆 比自山城'),
    blk('igE23', '伊賀衆の備 23', 1, 0, -330, 2, 0, 'iga', '伊賀衆 比自山城'),
  ] },
  // 森部（docs/fujin/moribe.md：織田 千五百・斎藤 六千）。北（−z）が斎藤、南が織田。楡俣川 z≈88・あふれた流れ z≈47（x−26〜58）。
  //   斎藤は横に並ぶ備え（z−56〜−78）の東西の外と奥の二列に、織田は川の南の後詰（丹羽・佐久間）。真ん中の戦場（x−60〜50）・道（ROAD2）・薬師堂（66,46）は空ける
  moribe: { reachK: 2, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: mkSaitoWide([
    blkF('mbO1', '丹羽長秀の後詰', 0, -78, 140, 3, S, 'oda', '織田 川の南の後詰'),
    blkF('mbO2', '佐久間信盛の後詰', 0, 36, 166, 3, S, 'oda', '織田 川の南の後詰'),
    blkF('mbO3', '織田の旗本の後ろ', 0, 98, 136, 3, S, 'eiraku', '織田 川の南の後詰'),
    blkF('mbS1', '日比野の手 東の外', 1, 78, -70, 3, 0, 'saito', '斎藤 一の備えの外'),
    blkF('mbS2', '斎藤の先手の東の備', 1, 104, -22, 3, -S / 6, 'saito', '斎藤 一の備えの外'),
    blkF('mbS3', '長井の手 西の外', 1, -112, -76, 3, 0, 'saito', '斎藤 一の備えの外', { far: true, tLazy: true }),
    blkF('mbS4', '斎藤の控え 東', 1, 128, -66, 3, 0, 'saito', '斎藤 一の備えの外', { far: true, tLazy: true }),
    blkF('mbS5', '斎藤の後ろ 西', 1, -92, -122, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blkF('mbS6', '斎藤の後ろ 東', 1, 62, -122, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blkF('mbS7', '斎藤の後ろ 東の端', 1, 116, -114, 3, 0, 'saito', '斎藤 後ろ', { far: true, tLazy: true }),
    blkF('mbS8', '斎藤の後ろの奥 西', 1, -30, -166, 3, 0, 'saito', '斎藤 後ろの奥', { far: true, tLazy: true }),
    blkF('mbS9', '斎藤の後ろの奥 東', 1, 50, -170, 3, 0, 'saito', '斎藤 後ろの奥', { far: true, tLazy: true }),
  ]) },
  // 墨俣（docs/fujin/sunomata.md：砦の内百八十・寄せ手の斎藤は一の手〜三の手と寄せ大将で千六百・本陣三千）。砦は ±18、長良川は x62〜112。
  //   斎藤は北と西の陣の空き地（SUNO_CAMP_CLEAR）と東岸（x146〜150）に砦へ向けて、織田は南の空き地に後詰（信長の先手）。
  //   北の道（x≈0）・砦の門・運びの道（SUPPLY_GUIDE）・岸を進退する六隊（x122）・川の中は空ける
  // 長篠城籠城（11/20 クラウド17・kaito_now ③「天王寺の出来に・軍勢が見て大軍」・docs/fujin/nagashinojo.md：武田 一万五千が三方から囲む）。
  //   前は60秒の本物 二百余り（城兵と大手の寄せだけ）で、塀の外の囲みの備は遠景だけだった。布陣図の置き場に家ごとの塊を並べる（持ち場で待つ・寄せの筋の組に入らない）。
  //   城の北の寄せの通り道（|x+4|<40・z −24〜−105＝竹束・井楼・梯子の寄せ）と城の中・西の村には置かない。武田は城（+z）へ向く
  // 11/21 クラウド17（司令塔：天王寺の出来に・K285 の内）：鳶ヶ巣は表が無く、携帯の120秒で尾根の寄せの本人の脇が空いていた（docs/fujin/tobinosu.md の「後続」）。
  //   酒井の別働隊の後続（徳川の諸手・金森長近）を尾根の下の東西と、本人の後ろの坂に家ごとの塊で置く。近づくまで立てない（lazy）
  // 11/21 クラウド17（司令塔：天王寺の出来に・K285 の内）：鳶ヶ巣は表が無く、携帯の120秒で尾根の寄せの本人の脇が空いていた（docs/fujin/tobinosu.md の「後続」）。
  //   酒井の別働隊の後続（徳川の諸手・金森長近）を尾根の下の東西と、本人の後ろの坂に家ごとの塊で置く。近づくまで立てない（lazy）
  tobinosu: { noAttach: [0], withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('tbA1', '松平伊忠の手', 0, -36, -18, 2, S, 'tokugawa', '徳川 尾根の下の西', { tN: 12 }),
    blk('tbA2', '本多広孝の手', 0, 36, -18, 2, S, 'tokugawa', '徳川 尾根の下の東', { tN: 12 }),
    blk('tbA3', '金森長近の鉄砲衆', 0, -6, 14, 2, S, 'oda', '織田 後ろの坂', { tN: 12 }),
    blk('tbA4', '奥平の後続', 0, 26, 18, 2, S, 'tokugawa', '徳川 後ろの坂の東', { tN: 12 }),
  ] },
  // 11/21 クラウド17（司令塔：天王寺の出来に・K285 の内）：諏訪原は表が無く、携帯の120秒で本物113・堀の外も城の奥も空だった（docs/fujin/suwahara.md）。
  //   徳川の東西の囲み（大久保・酒井）を三日月堀の外の東西に、武田の本曲輪の守りを城の奥に、家ごとの塊で置く。近づくまで立てない（lazy）・持ち場で待つ（noEngage）
  suwahara: { noAttach: [0, 1], withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('swE0', '酒井忠次の囲み', 0, 28, 26, 3, S, 'tokugawa', '徳川 三日月堀の東の外', { tN: 12 }),
    blk('swW0', '大久保忠佐の囲み', 0, -28, 26, 3, S, 'tokugawa', '徳川 三日月堀の西の外', { tN: 12 }),
    blk('swE1', '徳川の東の囲み', 0, 56, -12, 2, -S / 2, 'tokugawa', '徳川 東の台地', { tN: 12 }),
    blk('swW1', '徳川の西の囲み', 0, -56, -12, 2, S / 2, 'tokugawa', '徳川 西の台地', { tN: 12 }),
    blk('swT1', '今福浄閑の本曲輪の守り', 1, -18, -58, 2, 0, 'takeda', '武田 本曲輪の西', { tN: 12 }),
    blk('swT2', '本曲輪の守り 二', 1, 18, -58, 2, 0, 'takeda', '武田 本曲輪の東', { tN: 12 }),
  ] },
  // 11/21 クラウド17（司令塔・K285 を守って携帯を大軍に）：携帯は北の坂の備（N0〜N4）を厚く（tN 14）、本人から遠い勝頼の旗本と有海原の備は近づくまで立てない（tLazy）。上限の250は同じ
  nagashinojo: { noAttach: [1], withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    //   北の坂（城から見下ろす開けた野）の寄せの通り道の両脇とその奥に寄せて置く（百m より奥は森と朝霧で、塀の外から見えなかった。塀から三十〜九十m に）
    blk('ngN0', '小山田昌行の総がかりの後ろ', 1, -4, -110, 3, 0, 'takeda', '武田 大手の坂の奥', { tN: 14 }),
    blk('ngN1', '武田信豊の備', 1, 44, -84, 3, -0.4, 'takeda', '武田 大通寺山の裾', { tN: 14 }),
    blk('ngN2', '馬場信春の備', 1, 46, -52, 2, -0.7, 'takeda', '武田 大手の東の坂', { tN: 14 }),
    blk('ngN3', '一条信龍の備', 1, -52, -84, 3, 0.4, 'takeda', '武田 北西の坂', { tN: 14 }),
    blk('ngN4', '真田信綱の備', 1, -54, -52, 2, 0.7, 'takeda', '武田 大手の西の坂', { tN: 14 }),
    blk('ngK1', '武田勝頼の旗本', 1, -30, -158, 3, 0, 'takeda', '武田 医王寺山', { tLazy: true }),
    blk('ngW1', '山県昌景の備', 1, -150, -40, 3, S / 2, 'takeda', '武田 有海原', { tLazy: true }),
    blk('ngW2', '内藤昌豊の備', 1, -168, 8, 2, S / 2, 'takeda', '武田 有海原', { tLazy: true }),
  ] },
  sunomata: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blkF('suO1', '織田の後詰 西', 0, -36, 102, 3, S, 'oda', '織田 南の後詰'),
    blkF('suO2', '織田の後詰 東', 0, 34, 106, 3, S, 'oda', '織田 南の後詰'),
    blkF('suO3', '織田の後詰 荷の守り', 0, -128, 88, 3, S * 0.8, 'oda', '織田 南の後詰'),
    blkF('suN1', '斎藤の北の寄せの備', 1, -30, -150, 3, 0.1, 'saito', '斎藤 北'),
    blkF('suN2', '斎藤の北東の備', 1, 34, -120, 3, 0, 'saito', '斎藤 北'),
    blkF('suN3', '斎藤の北西の備', 1, -120, -106, 2, 0.85, 'saito', '斎藤 北西'),
    blkF('suN4', '斎藤の北の後ろの備', 1, -80, -132, 3, 0.4, 'saito', '斎藤 北'),
    blkF('suW1', '斎藤の西の寄せの備', 1, -150, -12, 2, S / 2, 'saito', '斎藤 西'),
    blkF('suE1', '斎藤の東岸の備 一', 1, 150, -62, 3, -S / 2, 'saito', '斎藤 東岸'),
    blkF('suE2', '斎藤の東岸の備 二', 1, 150, -8, 3, -S / 2, 'saito', '斎藤 東岸'),
    blkF('suE3', '斎藤の東岸の備 三', 1, 150, 50, 3, -S / 2, 'saito', '斎藤 東岸'),
    blkF('suE4', '斎藤の東岸の備 四', 1, 150, 110, 3, -S / 2, 'saito', '斎藤 東岸'),
    blkF('suE5', '斎藤の東岸の備 五', 1, 150, -118, 3, -S / 2, 'saito', '斎藤 東岸'),
  ] },
  // 稲生（docs/fujin/inou.md：信長方 七百・信勝方 千七百）。街道（x≈0・幅±8）・北の村（−90〜−50）・本人の始め（4,57）・信長（0,52）・佐久間と後詰の持ち場（104,112）（6,196）は空ける。
  //   信長方は南（+z）の田に北向き・信勝方（柴田・林）は北（−z）の田に南向き。西の川（x−148）の手前まで。持ち場で待つだけ
  inou: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    ...grid('inF', '信長方の備', 0, [-100, -52, 52, 100], [104, 146, 188], 3, S, 'oda', '織田 南の田', {}, (x, z) => (z === 188 && x === 52) || (z === 104 && Math.abs(x) < 60)),
    ...grid('inE', '信勝方の備', 1, [-100, -52, 52, 100], [-120, -160, -200], 3, 0, 'kari', '信勝 北の田', { far: true, tLazy: true }, (x, z) => (z === -200 && Math.abs(x) < 60)),
  ] },
  // 金ヶ崎（docs/fujin/kanegasaki.md：殿の織田・徳川と追手の朝倉）。本人の始め（-3,-26）・三つの備（8,-34）（2,32）（-22,102）・笙の川（z≈10）・退き道（x≈-30〜-50,z80〜170）は空ける。
  //   朝倉は北（−z）と東の疋田の道（78,-24）から南向き・織田と徳川は南の退き道の脇に北向き。持ち場で待つだけ
  kanegasaki: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    ...grid('kgA', '織田・徳川の備', 0, [-110, -76, 76, 112], [112, 156, 200], 3, S, 'oda', '織田 退き道の脇', {}),
    ...grid('kgB', '朝倉の追手', 1, [-110, -72, 72, 110], [-120, -150, -180], 3, 0, 'asakura', '朝倉 北の追手', { far: true, tLazy: true }, (x, z) => (z === -120 && Math.abs(x) < 50)),
  ] },
  // 稲葉山（docs/fujin/inabayama.md：織田 一万二千〜一万五千・斎藤の城兵 四千）。北（−z）が金華山、南が井口の町、西を長良川（x−127〜−165）が流れる。
  //   織田は町の南の野（瑞龍寺山の道 ROAD と本陣・佐久間・滝川の備の間を空けて）・東の野（佐久間・坂井・池田の寄せの後ろ）・西の川と町の間に、山へ向けて。
  //   斎藤は山の東と西の斜面（七曲り・百曲り・水手道の道から三十 m 外）に町へ向けて。町の家・鹿垣・寺（−58,50）・町の人の逃げ道（x−105〜−120・x124）は空ける
  inabayama: { tRoom: 0, stayPut: true, noAttach: [1], followMinZ: 58, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    // 11/20 クラウド kaito2（稲葉山の 1コマ：表あり 24.7ms・表を止めて 18.3ms＝表で約6ms）：本人が北へ上ると背中になる町の南の四つ（z 128〜155）は、携帯の塊の本物を 4 人に（遠目の大軍の絵と幟は同じ）
    blkF('inO1', '織田の本陣の西の備', 0, -80, 132, 2, S, 'eiraku', '織田 町の南', { tN: 4 }),
    blkF('inO2', '丹羽長秀の後ろの備', 0, 55, 128, 3, S, 'oda', '織田 町の南', { tN: 4 }),
    blkF('inO3', '佐久間信盛の後ろの備', 0, 95, 145, 3, S, 'oda', '織田 町の南', { tN: 4 }),
    blkF('inO4', '織田の後詰 南', 0, 55, 155, 3, S, 'oda', '織田 町の南', { tN: 4 }),
    blkF('inO5', '池田恒興の後ろの備', 0, 135, 85, 3, S * 1.25, 'oda', '織田 東の野'),
    blkF('inO6', '池田恒興の東の備', 0, 140, 40, 3, S * 1.25, 'oda', '織田 東の野'),
    blkF('inO7', '坂井政尚の後ろの備', 0, 100, 85, 3, S * 1.25, 'oda', '織田 東の野'),
    blkF('inO8', '織田の東の山裾の備', 0, 145, -5, 2, S * 1.25, 'oda', '織田 東の野'),
    blkF('inO9', '森可成の後ろの備', 0, -95, 70, 2, S * 0.75, 'tsuru', '織田 西の川べり'),
    blkF('inO10', '森可成の西の備', 0, -92, 15, 2, S * 0.75, 'tsuru', '織田 西の川べり'),
    blkF('inO11', '織田の東の尾根の備', 0, 148, -45, 2, S * 1.25, 'oda', '織田 東の野'),
    blkF('inS1', '長井道利の手 東の斜面', 1, 92, -58, 3, -S / 4, 'saito', '斎藤 山の東', { far: true, tLazy: true }),
    blkF('inS2', '斎藤の西の斜面の備', 1, -96, -58, 3, S / 4, 'saito', '斎藤 山の西', { far: true, tLazy: true }),
    blkF('inS3', '斎藤の東の尾根の備', 1, 88, -100, 2, -S / 4, 'saito', '斎藤 山の東', { far: true, tLazy: true }),
    blkF('inS4', '斎藤の西の裏手の備', 1, -90, -110, 2, S / 4, 'saito', '斎藤 山の西', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-01（kaito「天王寺レベルの軍勢」・姉川・docs/fujin/anegawa.md：織田 二万三千＋徳川 五千・浅井 五千＋朝倉 八千＝約二：一）：
  //   前は 60秒で 232。川（z≈0）の南に織田・徳川の備を本陣から前の段の左右（x±62・±108。縦の道 x−6〜10 と東の稲葉・氏家の備 x125 は空ける）に、
  //   川の北に浅井・朝倉を岸の野（z−48・−80）に。持ち場で待つだけ・川の中と三田村の館（−172,−44）には置かない。南向き＝北を向く（S）・北の敵は南を向く（0）
  anegawa: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('anO1', '坂井政尚の左の備', 0, -62, 62, 3, S, 'oda', '織田 一の段の左右'),
    blk('anO2', '坂井政尚の左の後ろ', 0, -108, 62, 3, S, 'oda', '織田 一の段の左右'),
    blk('anO3', '池田恒興の右の備', 0, 62, 62, 3, S, 'oda', '織田 一の段の左右'),
    blk('anO4', '柴田勝家の左の備', 0, -62, 90, 3, S, 'oda', '織田 中の段の左右'),
    blk('anO5', '森可成の左の備', 0, -108, 90, 3, S, 'tsuru', '織田 中の段の左右'),
    blk('anO6', '柴田勝家の右の備', 0, 62, 90, 3, S, 'oda', '織田 中の段の左右'),
    blk('anO7', '森可成の右の備', 0, 108, 90, 3, S, 'tsuru', '織田 中の段の左右'),
    blk('anO8', '佐久間信盛の左の備', 0, -62, 118, 3, S, 'oda', '織田 後ろの段の左右'),
    blk('anO9', '佐久間信盛の右の備', 0, 62, 118, 3, S, 'oda', '織田 後ろの段の左右'),
    blk('anO10', '織田の後備え 東', 0, 108, 118, 3, S, 'eiraku', '織田 後ろの段の左右'),
    blk('anA1', '浅井の先手の西の備', 1, -62, -48, 3, 0, 'azai', '浅井 川の北'),
    blk('anA2', '朝倉の先手の西の備', 1, -108, -48, 3, 0, 'asakura', '朝倉 川の北'),
    blk('anA3', '浅井の先手の東の備', 1, 62, -48, 3, 0, 'azai', '浅井 川の北'),
    blk('anA4', '浅井の二の手の東の備', 1, 108, -48, 3, 0, 'azai', '浅井 川の北'),
    blk('anA5', '朝倉の二の手の備', 1, -62, -80, 2, 0, 'asakura', '朝倉 川の北の二列'),
  ] },
  // 11/19 iMac army-01（kaito「天王寺レベルの軍勢」・箕作・docs/fujin/mitsukuri.md：織田 一万超・六角の城兵 三千）：前は 60秒で 234。
  //   南の麓（z60〜116）の大手の道（x±45）と陣（4,56）の左右に織田の備を、城の北の控えの平場（z−150〜−190）に六角の備を。持ち場で待つだけ
  mitsukuri: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('msk1', '織田の仕寄り 西の外', 0, -108, 60, 3, S, 'oda', '織田 麓の左右'),
    blk('msk2', '織田の仕寄り 西', 0, -62, 60, 3, S, 'oda', '織田 麓の左右'),
    blk('msk3', '織田の仕寄り 東', 0, 62, 60, 3, S, 'oda', '織田 麓の左右'),
    blk('msk4', '織田の仕寄り 東の外', 0, 108, 60, 3, S, 'oda', '織田 麓の左右'),
    blk('msk5', '佐久間信盛の控え 西', 0, -62, 88, 3, S, 'eiraku', '織田 後ろの左右'),
    blk('msk6', '佐久間信盛の控え 東', 0, 62, 88, 3, S, 'eiraku', '織田 後ろの左右'),
    blk('msk7', '浅井新八の後ろ', 0, -108, 88, 3, S, 'oda', '織田 後ろの左右'),
    blk('msk8', '丹羽長秀の後ろ', 0, 108, 88, 3, S, 'oda', '織田 後ろの左右'),
    blk('msk9', '織田の後詰 西', 0, -62, 116, 3, S, 'oda', '織田 後詰'),
    blk('msk10', '織田の後詰 東', 0, 62, 116, 3, S, 'oda', '織田 後詰'),
    blk('msk11', '六角の城兵の控え 西', 1, -110, -150, 3, 0, 'rokkaku', '六角 後ろの曲輪'),
    blk('msk12', '六角の城兵の控え 東', 1, 50, -150, 3, 0, 'rokkaku', '六角 後ろの曲輪'),
    blk('msk13', '六角の城兵の控え 奥 西', 1, -60, -190, 3, 0, 'rokkaku', '六角 後ろの曲輪'),
    blk('msk14', '六角の城兵の控え 奥 東', 1, 95, -150, 2, 0, 'rokkaku', '六角 後ろの曲輪'),
  ] },
  // 11/19 iMac army-01（kaito「天王寺レベルの軍勢」・大河内城・docs/fujin/okawachi.md：織田 約五万・北畠 七〜八千）：前は 60秒で 263。
  //   南の山の陣（z62〜122・陣の道 x−12〜34 と南東の控え x84 は空ける）に織田の備を、城の北（大手の曲輪の後ろ z−165）と西の谷に北畠の備を。持ち場で待つだけ
  okawachi: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('okw1', '織田の南の陣 西', 0, -62, 62, 3, S, 'oda', '織田 南の山の左右'),
    blk('okw2', '織田の南の陣 西の外', 0, -108, 62, 3, S, 'oda', '織田 南の山の左右'),
    blk('okw3', '織田の南の陣 西の端', 0, -154, 62, 3, S, 'oda', '織田 南の山の左右'),
    blk('okw4', '織田の南の陣 東', 0, 140, 62, 3, S, 'oda', '織田 南の山の左右'),
    blk('okw5', '丹羽長秀の後ろ', 0, -62, 92, 3, S, 'oda', '織田 南の後ろ'),
    blk('okw6', '池田恒興の後ろ', 0, -108, 92, 3, S, 'oda', '織田 南の後ろ'),
    blk('okw7', '稲葉良通の後ろ', 0, -154, 92, 3, S, 'oda', '織田 南の後ろ'),
    blk('okw8', '滝川一益の後ろ', 0, 140, 92, 3, S, 'oda', '織田 南の後ろ'),
    blk('okw9', '織田の後詰 西', 0, -62, 122, 3, S, 'oda', '織田 後詰'),
    blk('okw10', '織田の後詰 東', 0, 140, 122, 3, S, 'oda', '織田 後詰'),
    blk('okw11', '北畠の城兵の控え 西', 1, -85, -100, 2, 0, 'kitabatake', '北畠 西の谷'),
    blk('okw12', '北畠の城兵の控え 北西', 1, -50, -165, 3, 0, 'kitabatake', '北畠 大手の後ろ'),
    blk('okw13', '北畠の城兵の控え 北東', 1, 60, -165, 3, 0, 'kitabatake', '北畠 大手の後ろ'),
  ] },
  // 11/19 iMac army-01（kaito「天王寺レベルの軍勢」・金ヶ崎・docs/fujin/kanegasaki.md：織田・徳川 三万・朝倉 二万）：前は 60秒で 206。
  //   南の退き道（x−34）の東西（z45〜110）に織田・徳川の備を、北の峠（一の備の北 z−60〜−200）の西の谷と東の尾根に朝倉の備を。道（x−8〜90・z−50〜−14）は空ける
  kanegasaki: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('kgs1', '織田の殿の後ろ 西', 0, -100, 45, 3, S, 'oda', '織田 退き道の左右'),
    blk('kgs2', '徳川の備え', 0, 70, 45, 3, S, 'tokugawa', '織田 退き道の左右'),
    blk('kgs3', '徳川の後備え', 0, 115, 45, 3, S, 'tokugawa', '織田 退き道の左右'),
    blk('kgs4', '織田の後備え 西', 0, -100, 78, 3, S, 'oda', '織田 退き道の後ろ'),
    blk('kgs5', '徳川の二の備', 0, 70, 78, 3, S, 'tokugawa', '織田 退き道の後ろ'),
    blk('kgs6', '徳川の後ろ', 0, 115, 78, 3, S, 'tokugawa', '織田 退き道の後ろ'),
    blk('kgs7', '荷駄の守り', 0, 130, 110, 1, S, 'oda', '織田 退き道の後ろ'),
    blk('kgs8', '朝倉の追手 西の谷 1', 1, -92, -60, 3, 0, 'asakura', '朝倉 西の谷'),
    blk('kgs9', '朝倉の追手 東の尾根 1', 1, 125, -60, 3, 0, 'asakura', '朝倉 東の尾根'),
    blk('kgs10', '朝倉の追手 西の谷 2', 1, -92, -100, 3, 0, 'asakura', '朝倉 西の谷'),
    blk('kgs11', '朝倉の追手 東の尾根 2', 1, 125, -100, 3, 0, 'asakura', '朝倉 東の尾根'),
    blk('kgs12', '朝倉の追手 西の谷 3', 1, -92, -140, 3, 0, 'asakura', '朝倉 西の谷'),
    blk('kgs13', '朝倉の追手 東の尾根 3', 1, 125, -140, 3, 0, 'asakura', '朝倉 東の尾根'),
    blk('kgs14', '朝倉の後ろの備', 1, -60, -200, 3, 0, 'asakura', '朝倉 北'),
  ] },
  // 11/19 iMac army-10（kaito「天王寺レベルの軍勢」：伏見・忍・八王子・小田原）。家ごとの塊（blk・一塊 44 人）と幟の林。持ち場で待つだけ（noEngage）。
  //   伏見（docs/fujin/k01_fushimi.md：寄せ手四万の備を南・南東・南西・西・東・北東に）。本人の道（x≈0 の大手筋 z160→−46）・城下の屋敷（−30,104）・築山（22,126）は空ける
  //   11/20 クラウド k365-cloud-09（伏見の act bot が今の main で倒れ・足跡：毛利・吉川・小西の表の備が fujin_wake で起きて城の内まで寄せ、本人の一〜五歩で斬り合っていた）：
  //   伏見の表の備は城を囲んで持ち場で待つ（noEngage を書いて _neHold。城へ寄せるのは台本の波だけ＝表を足す前と同じ寄せ）
  k01_fushimi: { tRoom: 0, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('fsU1', '宇喜多秀家の先手 西', 1, -44, 150, 3, S, 'ukita', '宇喜多 先手', { noEngage: true }),
    blk('fsU2', '宇喜多秀家の先手 東', 1, 46, 152, 3, S, 'ukita', '宇喜多 先手', { noEngage: true }),
    blk('fsU3', '宇喜多の二の手 西', 1, -36, 196, 3, S, 'ukita', '宇喜多 二の手', { noEngage: true }),
    blk('fsU4', '宇喜多の二の手 東', 1, 36, 200, 3, S, 'ukita', '宇喜多 二の手', { noEngage: true }),
    blk('fsU5', '宇喜多の旗本', 1, -4, 232, 3, S, 'ukita', '宇喜多 本陣', { noEngage: true }),
    blk('fsN1', '鍋島勝茂の手', 1, 74, 172, 3, S * 0.85, 'nabeshima', '鍋島', { noEngage: true }),
    blk('fsN2', '鍋島の二の手', 1, 98, 196, 3, S * 0.85, 'nabeshima', '鍋島', { noEngage: true }),
    blk('fsC1', '長宗我部盛親の手', 1, 46, 236, 3, S, 'chosokabe', '長宗我部', { noEngage: true }),
    blk('fsM1', '長束正家の手', 1, -64, 214, 3, S, 'natsuka', '長束', { noEngage: true }),
    blk('fsK1', '小西行長の手', 1, -112, 132, 3, S * 0.7, 'konishi', '小西', { noEngage: true }),
    blk('fsK2', '小西の二の手', 1, -126, 168, 3, S * 0.7, 'konishi', '小西', { noEngage: true }),
    blk('fsB1', '小早川秀秋の先手', 1, -118, 24, 3, S / 2, 'kobayakawa', '小早川 西', { noEngage: true }),
    blk('fsB2', '小早川の本隊', 1, -150, 62, 3, S / 2, 'kobayakawa', '小早川 西', { noEngage: true }),
    blk('fsB3', '小早川の後ろ', 1, -150, -10, 2, S / 2, 'kobayakawa', '小早川 西', { noEngage: true }),
    blk('fsR1', '毛利秀元の手', 1, 136, 14, 3, -S / 2, 'mori', '毛利 東', { noEngage: true }),
    blk('fsR2', '毛利の二の手', 1, 142, 56, 3, -S / 2, 'mori', '毛利 東', { noEngage: true }),
    blk('fsQ1', '吉川広家の手', 1, 156, -36, 3, -S * 0.65, 'kikkawa', '吉川 北東', { noEngage: true }),
    blk('fsQ2', '吉川の後ろ', 1, 150, -80, 2, -S * 0.65, 'kikkawa', '吉川 北東', { noEngage: true }),
    blk('fsS1', '島津義弘の手', 1, 112, 114, 3, -S * 0.75, 'shimazu', '島津', { noEngage: true }),
  ] },
  //   忍（docs/fujin/t10_oshi.md：寄せ手二万四千）。沼と城は北西・堤は (−200,12)→(−30,20)→(30,−20)→(56,−90)・川は z36〜64 の西・陣は堤の外（南東）。丸墓山（120,74）。堤の上・堰・陣（26,34）の近くは空ける
  t10_oshi: { tRoom: -50, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('osI1', '石田の先手 一', 0, -22, 78, 3, -S * 0.75, 'ishida', '石田 堤の外'),
    blk('osI2', '石田の先手 二', 0, 30, 90, 3, -S * 0.75, 'ishida', '石田 堤の外'),
    blk('osI4', '真田昌幸の備', 0, 70, 104, 3, -S * 0.75, 'sanada_kuro', '石田 堤の外'),
    blk('osI5', '大谷吉継の備', 0, 104, 22, 3, -S * 0.75, 'otani', '石田 堤の外'),
    blk('osI6', '石田の二の備', 0, -62, 104, 3, -S * 0.75, 'ishida', '石田 堤の外'),
    blk('osI7', '石田の後備え', 0, 8, 128, 3, -S * 0.75, 'ishida', '石田 後ろ'),
    blk('osI8', '丸墓山の旗本の前', 0, 116, 116, 3, -S * 0.75, 'ishida', '石田 丸墓山'),
    blk('osI9', '佐竹義宣の二の手', 0, -112, 92, 3, -S * 0.75, 'satake', '石田 西の外'),
    blk('osI10', '長束正家の備', 0, -156, 84, 3, -S * 0.75, 'ishida', '石田 西の外', { far: true, tLazy: true }),
    blk('osI11', '石田の控え', 0, -40, 150, 3, -S * 0.75, 'ishida', '石田 後ろ'),
    blk('osI12', '浅野の控え', 0, 62, 150, 3, -S * 0.75, 'asano', '石田 後ろ'),
    blk('osI13', '丸墓山の旗本の東', 0, 154, 70, 3, -S * 0.75, 'ishida', '石田 丸墓山', { far: true, tLazy: true }),
    blk('osI14', '東の後詰', 0, 150, 124, 3, -S * 0.75, 'ishida', '石田 丸墓山', { far: true, tLazy: true }),
    blk('osI15', '堤の東の備', 0, 118, -26, 3, -S * 0.75, 'ishida', '石田 堤の東', { far: true, tLazy: true }),
    blk('osI16', '石田の先手 三', 0, -8, 56, 3, -S * 0.75, 'ishida', '石田 堤の外'),
    blk('osI17', '石田の先手 四', 0, 52, 66, 3, -S * 0.75, 'ishida', '石田 堤の外'),
    blk('osI19', '石田の後備え 西', 0, -80, 132, 3, -S * 0.75, 'ishida', '石田 後ろ'),
    blk('osI20', '石田の後備え 東', 0, 36, 118, 3, -S * 0.75, 'ishida', '石田 後ろ'),
  ] },
  //   八王子（docs/fujin/t11_hachioji.md：寄せ手三万五千）。本人の始め（182,55）は谷の下。南（z>65）は急な斜面なので、寄せ手の備は始めの北と東の平らな野（x≧150・z−80〜40）に
  t11_hachioji: { tRoom: -45, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('hcM1', '前田の二陣 一', 0, 206, 36, 3, -S / 2, 'maeda', '前田 二陣'),
    blk('hcM2', '前田の二陣 二', 0, 254, 36, 3, -S / 2, 'maeda', '前田 二陣'),
    blk('hcM3', '前田の三陣 三', 0, 302, 36, 3, -S / 2, 'maeda', '前田 三陣', { far: true, tLazy: true }),
    blk('hcM4', '前田の二陣 四', 0, 170, 0, 3, -S / 2, 'maeda', '前田 二陣'),
    blk('hcM5', '前田の二陣 五', 0, 218, 0, 3, -S / 2, 'maeda', '前田 二陣'),
    blk('hcM6', '前田の三陣 六', 0, 266, 0, 3, -S / 2, 'maeda', '前田 三陣'),
    blk('hcM7', '前田の三陣 七', 0, 314, 0, 3, -S / 2, 'maeda', '前田 三陣', { far: true, tLazy: true }),
    blk('hcM8', '前田利長の予備 八', 0, 170, -40, 3, -S / 2, 'maeda', '前田 予備'),
    blk('hcM9', '前田利長の予備 九', 0, 218, -40, 3, -S / 2, 'maeda', '前田 予備'),
    blk('hcM10', '前田の三陣 十', 0, 266, -40, 3, -S / 2, 'maeda', '前田 三陣'),
    blk('hcM11', '前田の後備え 十一', 0, 314, -40, 3, -S / 2, 'maeda', '前田 後備え', { far: true, tLazy: true }),
    blk('hcM12', '前田の後備え 十二', 0, 200, -74, 3, -S / 2, 'maeda', '前田 後備え'),
    blk('hcM13', '前田利家の本陣の旗本 十三', 0, 250, -74, 3, -S / 2, 'maeda', '前田 本陣'),
    blk('hcM14', '前田利家の本陣の旗本 十四', 0, 300, -74, 3, -S / 2, 'maeda', '前田 本陣', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」・鴫野）：docs/fujin/k10_shigino.md の上杉（先手〜後詰 約五千）と豊臣の救援（約一万一千）の比。
  //   堤（鴫野の道 z=0 の ±17）と三重の柵・本陣（192,-8）は空け、堤の南北の田（|z| 22〜62）に東西の列で塊を置く。上杉は東（西向き）・豊臣は西（東向き）。持ち場で待つだけ
  k10_shigino: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('shU1', '上杉の後備え 北一', 0, 150, -42, 3, -S / 2, 'uesugi', '上杉 堤の北'),
    blk('shU2', '上杉の後備え 南一', 0, 150, 42, 3, -S / 2, 'uesugi', '上杉 堤の南'),
    blk('shU3', '上杉の後備え 北二', 0, 168, -42, 3, -S / 2, 'uesugi', '上杉 堤の北'),
    blk('shU4', '上杉の後備え 南二', 0, 168, 42, 3, -S / 2, 'uesugi', '上杉 堤の南'),
    blk('shU5', '榊原康勝の後詰 北', 0, 186, -46, 3, -S / 2, 'sakakibara', '上杉 後詰'),
    blk('shU6', '榊原康勝の後詰 南', 0, 186, 42, 3, -S / 2, 'sakakibara', '上杉 後詰'),
    blk('shU7', '堀尾忠晴の後詰 北', 0, 204, -44, 3, -S / 2, 'uesugi', '上杉 後詰'),
    blk('shU8', '丹羽長重の後詰 南', 0, 204, 42, 3, -S / 2, 'uesugi', '上杉 後詰'),
    blk('shT1', '豊臣の救援 北一', 1, -8, -42, 3, S / 2, 'toyotomi', '豊臣 堤の北'),
    blk('shT2', '豊臣の救援 南一', 1, -8, 42, 3, S / 2, 'toyotomi', '豊臣 堤の南'),
    blk('shT3', '渡辺糺の救援 北', 1, -26, -42, 3, S / 2, 'toyotomi', '豊臣 堤の北', { far: true, tLazy: true }),
    blk('shT4', '木村宗明の救援 南', 1, -26, 42, 3, S / 2, 'toyotomi', '豊臣 堤の南', { far: true, tLazy: true }),
    blk('shT5', '大野治長の救援 北', 1, -46, -42, 3, S / 2, 'toyotomi', '豊臣 堤の北', { far: true, tLazy: true }),
    blk('shT6', '大野治長の救援 南', 1, -46, 42, 3, S / 2, 'toyotomi', '豊臣 堤の南', { far: true, tLazy: true }),
    blk('shT7', '豊臣の救援 北二', 1, -66, -42, 3, S / 2, 'toyotomi', '豊臣 後ろ', { far: true, tLazy: true }),
    blk('shT8', '豊臣の救援 南二', 1, -66, 42, 3, S / 2, 'toyotomi', '豊臣 後ろ', { far: true, tLazy: true }),
    blk('shT9', '大野治房の奥の備 北', 1, -88, -42, 3, S / 2, 'toyotomi', '豊臣 奥', { far: true, tLazy: true }),
    blk('shT10', '大野治房の奥の備 南', 1, -88, 42, 3, S / 2, 'toyotomi', '豊臣 奥', { far: true, tLazy: true }),
    blk('shT11', '豊臣の奥 北', 1, -110, -42, 3, S / 2, 'toyotomi', '豊臣 奥', { far: true, tLazy: true }),
    blk('shT12', '豊臣の奥 南', 1, -110, 42, 3, S / 2, 'toyotomi', '豊臣 奥', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」・樫井）：docs/fujin/k12_kashii.md。北（−z）が貝塚の豊臣（塙・岡部・淡輪・大野治房の本隊）、南が浅野（五千）。
  //   熊野街道（x≈−4）の両側 20m・樫井の村と家・溜め池・安松の家・浅瀬は空け、街道の東西の畑に南北の列で塊を置く。持ち場で待つだけ
  k12_kashii: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ksA1', '浅野の後備え 1西', 0, -44, -122, 3, S, 'asano', '浅野 先手の脇'),
    blk('ksA2', '浅野の後備え 1東', 0, 36, -122, 3, S, 'asano', '浅野 先手の脇'),
    blk('ksA3', '浅野の後備え 2西', 0, -44, -106, 3, S, 'asano', '浅野 先手の脇'),
    blk('ksA4', '浅野の後備え 2東', 0, 36, -106, 3, S, 'asano', '浅野 先手の脇'),
    blk('ksB1', '浅野の二陣 1西', 0, -44, 26, 3, S, 'asano', '浅野 川の南'),
    blk('ksB2', '浅野の二陣 1東', 0, 36, 26, 3, S, 'asano', '浅野 川の南'),
    blk('ksB3', '浅野の二陣 2西', 0, -44, 44, 3, S, 'asano', '浅野 川の南'),
    blk('ksB4', '浅野の二陣 2東', 0, 36, 44, 3, S, 'asano', '浅野 川の南'),
    blk('ksB5', '浅野の二陣 3西', 0, -44, 62, 3, S, 'asano', '浅野 川の南'),
    blk('ksB6', '浅野の二陣 3東', 0, 36, 62, 3, S, 'asano', '浅野 川の南'),
    blk('ksC1', '浅野の旗本・後備え 1西', 0, -44, 82, 3, S, 'asano', '浅野 本陣の前', { far: true, tLazy: true }),
    blk('ksC2', '浅野の旗本・後備え 1東', 0, 36, 82, 3, S, 'asano', '浅野 本陣の前', { far: true, tLazy: true }),
    blk('ksC3', '浅野の旗本・後備え 2西', 0, -44, 100, 3, S, 'asano', '浅野 本陣の前', { far: true, tLazy: true }),
    blk('ksC4', '浅野の旗本・後備え 2東', 0, 36, 100, 3, S, 'asano', '浅野 本陣の前', { far: true, tLazy: true }),
    blk('ksT1', '豊臣の先手 1西', 1, -44, -150, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT2', '豊臣の先手 1東', 1, 36, -150, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT3', '豊臣の先手 2西', 1, -44, -168, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT4', '豊臣の先手 2東', 1, 36, -168, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT5', '豊臣の先手 3西', 1, -44, -186, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT6', '豊臣の先手 3東', 1, 36, -186, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT7', '豊臣の先手 4西', 1, -44, -204, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT8', '豊臣の先手 4東', 1, 36, -204, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT9', '豊臣の先手 5西', 1, -44, -222, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksT10', '豊臣の先手 5東', 1, 36, -222, 3, 0, 'toyotomi', '豊臣 北の畑'),
    blk('ksU1', '大野治房の本隊の脇 1西', 1, -88, -170, 3, 0, 'toyotomi', '豊臣 貝塚', { far: true, tLazy: true }),
    blk('ksU2', '大野治房の本隊の脇 1東', 1, 80, -170, 3, 0, 'toyotomi', '豊臣 貝塚', { far: true, tLazy: true }),
    blk('ksU3', '大野治房の本隊の脇 2西', 1, -88, -190, 3, 0, 'toyotomi', '豊臣 貝塚', { far: true, tLazy: true }),
    blk('ksU4', '大野治房の本隊の脇 2東', 1, 80, -190, 3, 0, 'toyotomi', '豊臣 貝塚', { far: true, tLazy: true }),
  ] },
  // 11/19 iMac 係 army-08（kaito「全戦を天王寺レベルの軍勢に」：長久手・千石堀・根来・太田）。家ごとの塊（blk・一塊 44 人）。持ち場で待つだけ・勝ち負けの組に入らない。
  //   主人公の道・任務の場所（番所・仏ヶ根・陣・門・橋・堰）・建物・川・堤には置かない。遠い行は lazy／far。向き：0＝南へ・S/2＝東へ
  // 長久手（docs/fujin/t03b_nagakute.md）：西（−x）が退く道（z≈−12）・東が白山林の陣（112,−26）・番所（146,10）・南が仏ヶ根（34,76）。
  //   羽柴は長蛇の列の北と南の野（堀の檜ヶ根・池田森の仏ヶ根の周り）、徳川は東と南東と北東の野に備える
  t03b_nagakute: { tRoom: 0, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ngH1', '堀秀政の後ろの備', 0, -30, -70, 3, S / 2, 'hori', '羽柴 檜ヶ根の北'),
    blk('ngH2', '堀の北の二の手', 0, 24, -78, 3, S / 2, 'hori', '羽柴 檜ヶ根の北'),
    blk('ngH3', '羽柴の殿の北の備', 0, -90, -64, 3, S / 2, 'toyotomi', '羽柴 道の北'),
    blk('ngH4', '羽柴の殿の南の備', 0, -70, 40, 3, S / 2, 'toyotomi', '羽柴 道の南'),
    blk('ngH5', '羽柴の中ほどの南の備', 0, -20, 52, 3, S / 2, 'toyotomi', '羽柴 道の南'),
    blk('ngH6', '森長可の後ろの備', 0, 10, 118, 3, 0, 'tsuru', '羽柴 仏ヶ根の周り', { far: true, tLazy: true }),
    blk('ngH7', '池田元助の後ろの備', 0, 80, 120, 3, 0, 'ageha', '羽柴 仏ヶ根の周り', { far: true, tLazy: true }),
    blk('ngH8', '池田恒興の東の備', 0, 95, 70, 3, -S / 2, 'ageha', '羽柴 仏ヶ根の周り'),
    blk('ngH9', '秀次の陣の北の備', 0, 100, -80, 3, S / 2, 'toyotomi', '羽柴 白山林'),
    blk('ngT1', '徳川の北東の備', 1, 150, -50, 3, -S / 2, 'tokugawa', '徳川 東の野'),
    blk('ngT2', '大須賀の後ろの備', 1, 140, -105, 3, -S / 2, 'tokugawa', '徳川 東の野'),
    blk('ngT3', '徳川の東南の備', 1, 150, 45, 3, -S / 2, 'tokugawa', '徳川 東の野'),
    blk('ngT4', '榊原の備', 1, 60, -120, 3, -S / 2, 'sakakibara', '徳川 北の野', { far: true, tLazy: true }),
    blk('ngT5', '水野の後ろの備', 1, 110, 112, 3, -S / 2, 'tokugawa', '徳川 南東の野', { far: true, tLazy: true }),
    blk('ngT6', '信雄の南の備', 1, 150, 95, 3, -S / 2, 'nobukatsu', '徳川 南東の野', { far: true, tLazy: true }),
    blk('ngT7', '徳川の南の備', 1, 60, 130, 3, -S / 2, 'tokugawa', '徳川 南の野', { far: true, tLazy: true }),
    // 11/20 夜：一六一〇人→一八〇〇人以上へ。布陣図の本多忠勝（小牧山から駆けつけ）・信雄の本陣・水野の一の備を南北の野へ
    blk('ngT8', '本多忠勝の駆けつけの備', 1, 90, -150, 3, -S / 2, 'tokugawa', '徳川 北の野', { far: true, tLazy: true }),
    blk('ngT9', '信雄の本陣の備', 1, 150, 130, 3, -S / 2, 'nobukatsu', '徳川 南東の野', { far: true, tLazy: true }),
    blk('ngT10', '水野の一の備', 1, 20, 150, 3, -S / 2, 'tokugawa', '徳川 南の野', { far: true, tLazy: true }),
  ] },
  // 千石堀（docs/fujin/t04a_sengokubori.md）：北（−z）が羽柴の野（始め (0,−168)・本陣 (−18,−142)）・南が城（北の土橋・二の丸 (4,−16)・本丸 (0,41)）。
  //   羽柴は参道（x±30）の東西の野に、根来衆は城の東西の外と南に。参道・土橋・本陣・城の建物・中村と仙石の持ち場 (92,−44)・(−88,−52) は空ける
  // 11/21 クラウド 紀州の持ち主（act bot 91秒「仙石の西の備 二 が一点に重なって止まる」(-21,-124)）：K456 の付け直しで羽柴の十行が全部、参道沿いの秀吉・秀次・長谷川らの横へ寄せられ、
  //   「中村の東の備」が参道の西 (-29,-84)・「仙石の西の備」が本陣の前 (-21,-124) に立ち、参道に三十塊が重なっていた。noAttach [0]＝羽柴は布陣図の持ち場（東西の野）のまま（根来の側まで外すと積善寺の手が城の前 (-24,-7) で重なった）。advSides [0]＝持ち場からでも斬り合いへは前へ出す（fujinAdvance）
  t04a_sengokubori: { noAttach: [0], advSides: [0], tRoom: 0, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('sgH1', '羽柴の先手の西の備', 0, -62, -100, 3, 0, 'toyotomi', '羽柴 参道の西'),
    blk('sgH2', '羽柴の先手の東の備', 0, 62, -100, 3, 0, 'toyotomi', '羽柴 参道の東'),
    blk('sgH3', '筒井の後ろの備', 0, -56, -132, 3, 0, 'umebachi', '羽柴 参道の西'),
    blk('sgH4', '堀の後ろの備', 0, 56, -128, 3, 0, 'hori', '羽柴 参道の東'),
    blk('sgH5', '仙石の西の備', 0, -125, -70, 3, 0, 'toyotomi', '羽柴 西の野'),
    blk('sgH6', '中村の東の備', 0, 125, -66, 3, 0, 'toyotomi', '羽柴 東の野'),
    blk('sgH7', '小西の後ろの備', 0, -120, -120, 3, 0, 'konishi', '羽柴 西の奥'),
    blk('sgH8', '蜂須賀の後ろの備', 0, 122, -122, 3, 0, 'hachisuka', '羽柴 東の奥'),
    blk('sgH9', '秀吉の旗本の西の備', 0, -70, -160, 3, 0, 'toyotomi', '羽柴 本陣の周り'),
    blk('sgH10', '秀長の予備の東の備', 0, 76, -156, 3, 0, 'toyotomi', '羽柴 本陣の周り'),
    blk('sgN1', '根来の西の外の備', 1, -70, 10, 3, S, 'maru', '根来 城の西', { far: true, tLazy: true }),
    blk('sgN2', '根来の東の外の備', 1, 70, 16, 3, S, 'maru', '根来 城の東', { far: true, tLazy: true }),
    blk('sgN3', '根来の本丸の南の備', 1, 0, 96, 3, S, 'maru', '根来 城の南', { far: true, tLazy: true }),
    blk('sgN4', '積善寺の手', 1, -110, 30, 3, S, 'maru', '根来 城の西', { far: true, tLazy: true }),
    blk('sgN5', '畠中の手', 1, 112, 36, 3, S, 'maru', '根来 城の東', { far: true, tLazy: true }),
  ] },
  // 根来寺（docs/fujin/t04_negoro.md）：谷の向きの座標（lx 左・lz 奥へ）。始め P(0,−140)・大門 lz≈−86・菩提川の橋 (0,40)・大塔 lz≈86。
  //   羽柴は谷の口（lz−230〜−120）の左右の山裾に、根来衆は大門の外の左右と寺の奥の山裾に。参道（lx±28）・坊舎・大門池 (46,−26) は空ける
  t04_negoro: { tRoom: -25, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ngoH1', '秀次の左の備', 0, ...NGP(-60, -170), 3, NGR, 'toyotomi', '羽柴 谷の口'),
    blk('ngoH2', '秀次の右の備', 0, ...NGP(60, -170), 3, NGR, 'toyotomi', '羽柴 谷の口'),
    blk('ngoH3', '筒井の後ろの備', 0, ...NGP(-62, -215), 3, NGR, 'umebachi', '羽柴 谷の口'),
    blk('ngoH4', '堀の後ろの備', 0, ...NGP(62, -215), 3, NGR, 'hori', '羽柴 谷の口'),
    blk('ngoH5', '仙石の左の備', 0, ...NGP(-62, -125), 3, NGR, 'toyotomi', '羽柴 左の山裾'),
    blk('ngoH6', '中村の備', 0, ...NGP(62, -125), 3, NGR, 'toyotomi', '羽柴 右の山裾'),
    blk('ngoH7', '蜂須賀の備', 0, ...NGP(-100, -200), 3, NGR, 'hachisuka', '羽柴 左の山裾', { far: true, tLazy: true }),
    blk('ngoH8', '秀長の備', 0, ...NGP(100, -200), 3, NGR, 'toyotomi', '羽柴 右の山裾', { far: true, tLazy: true }),
    blk('ngoN1', '根来の大門の左の外', 1, ...NGP(-62, -70), 3, NGR + S, 'maru', '根来 大門の外', { far: true, tLazy: true }),
    blk('ngoN2', '根来の大門の右の外', 1, ...NGP(62, -70), 3, NGR + S, 'maru', '根来 大門の外', { far: true, tLazy: true }),
    blk('ngoN3', '雑賀の鉄砲の後ろ', 1, ...NGP(-85, -30), 3, NGR + S, 'maru', '根来 門前の左', { far: true, tLazy: true }),
    blk('ngoN4', '行人方の寺の右の備', 1, ...NGP(88, 20), 3, NGR + S, 'maru', '根来 寺の右', { far: true, tLazy: true }),
    blk('ngoN5', '奥の院の左の備', 1, ...NGP(-90, 100), 3, NGR + S, 'maru', '根来 奥の院', { far: true, tLazy: true }),
  ] },
  // 太田城（docs/fujin/t04b_ota.md）：城は中心 (0,0)・半径 24。堤の輪（半径およそ 65）・北の土橋 (0,−58)・始め (−34,−112)・陣 (−18,−104)・堰 (−46,−46)・土俵 (−34,−80)・東の堤 (60,−18)。
  //   羽柴は輪の外の四方（布陣図の五手）に。雑賀衆は城の内（空きが狭いので少し）。堤の輪の中の水と土橋・陣・堰・土俵には置かない
  t04b_ota: { tRoom: 0, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('otH1', '蜂須賀の西北の備', 0, -126, -82, 3, S / 2, 'hachisuka', '羽柴 西北'),
    blk('otH2', '蜂須賀の後ろの備', 0, -150, -30, 3, S / 2, 'hachisuka', '羽柴 西北'),
    blk('otH3', '仙石の西南の備', 0, -140, 62, 3, S / 2, 'toyotomi', '羽柴 西南', { far: true, tLazy: true }),
    blk('otH4', '浅野の南の備', 0, -10, 135, 3, S, 'toyotomi', '羽柴 南', { far: true, tLazy: true }),
    blk('otH5', '小西の東南の備', 0, 120, 95, 3, -S / 2, 'konishi', '羽柴 東南', { far: true, tLazy: true }),
    blk('otH6', '中村の東北の備', 0, 130, -50, 3, -S / 2, 'toyotomi', '羽柴 東北', { far: true, tLazy: true }),
    blk('otH7', '中村の後ろの備', 0, 150, -100, 3, -S / 2, 'toyotomi', '羽柴 東北', { far: true, tLazy: true }),
    blk('otH8', '秀吉の旗本の西の備', 0, -70, -150, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otH9', '秀吉の旗本の東の備', 0, 40, -145, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otH10', '秀長の築堤の北の備', 0, 85, -120, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otH11', '小荷駄の守り', 0, -100, -135, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otH12', '秀吉の旗本の奥の備', 0, -40, -182, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otH13', '秀長の予備の奥の備', 0, 20, -178, 3, 0, 'toyotomi', '羽柴 北の本陣'),
    blk('otS1', '太田の城の西の備', 1, -12, 8, 1, 0, 'maru', '雑賀 城の内'),
    blk('otS2', '太田の城の東の備', 1, 12, 6, 1, 0, 'maru', '雑賀 城の内'),
  ] },
  // 野田・福島（11/19 iMac army-02・kaito「天王寺レベルの軍勢」・docs/fujin/nodafukushima.md：織田 三万二千・三人衆 八千）。前は60秒で 244。
  //   織田は堤（z−8）の南の野（本人の持ち場 |x|<60・織田の本陣 (40,44)・村の家・民の道の外）に、敵は中洲の砦の奥（z−114〜−128・福島砦 (0,−46〜−100)・野田砦 x−142〜−102 の外）に、
  //   家ごとの塊（一塊 44 人）で置く。持ち場で待つだけ・勝ち負けの組に入らない（keep）。川（z−30・z−142）・浅瀬の道・砦の門の前には置かない。
  nodafukushima: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ndO1', '織田の後備え 西の端', 0, -150, 72, 3, S, 'oda', '織田 南の野', { far: true, tLazy: true }),
    blk('ndO2', '柴田の後ろの備え', 0, -108, 72, 3, S, 'oda', '織田 南の野'),
    blk('ndO3', '織田の後備え 西', 0, -66, 72, 3, S, 'oda', '織田 南の野'),
    blk('ndO4', '佐久間の後ろの備え', 0, -24, 72, 3, S, 'oda', '織田 南の野'),
    blk('ndO5', '織田の旗本の後ろ', 0, 62, 72, 3, S, 'eiraku', '織田 南の野'),
    blk('ndO6', '織田の後備え 東', 0, 104, 72, 3, S, 'oda', '織田 南の野'),
    blk('ndO7', '織田の後詰', 0, 20, 90, 2, S, 'oda', '織田 南の野'),
    blk('ndI1', '三好の後備え 野田砦の東', 1, -86, -114, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI2', '三好の後備え 福島砦の西', 1, -44, -114, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI3', '三好長逸の後備え', 1, -2, -116, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI4', '三好の後備え 福島砦の東', 1, 40, -114, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI5', '岩成の後備え', 1, 82, -112, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI6', '三好宗渭の後備え', 1, -128, -116, 3, 0, 'miyoshi', '三人衆 中洲の奥'),
    blk('ndI7', '三人衆の控え 西', 1, -86, -128, 3, 0, 'miyoshi', '三人衆 中洲の奥の奥'),
    blk('ndI8', '三人衆の控え 東', 1, -2, -130, 3, 0, 'miyoshi', '三人衆 中洲の奥の奥'),
  ] },
  // 志賀（11/19 iMac army-02・kaito「天王寺レベルの軍勢」・docs/fujin/shiga.md：織田 九百五十・浅井朝倉 三万）。前は60秒で 288。
  //   坂本の谷は狭い（x−40〜90・西は宇佐山の斜面・東は湖）。敵は谷の北（z−112〜−160・街道の先手 (28,−96)・浅井の先手 (−22,−92)・畑 (66,−108) の奥）に、
  //   織田は町の南の野（x44・湖の道 x60〜80 と宇佐山の曲輪の外）に、家ごとの塊（一塊 44 人）で置く。持ち場で待つだけ・勝ち負けの組に入らない（keep）。
  shiga: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('sgO1', '織田の守りの後詰 1', 0, 44, 58, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO2', '織田の守りの後詰 2', 0, 44, 74, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO3', '織田の守りの後詰 3', 0, 44, 90, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO4', '織田の守りの後詰 4', 0, 44, 106, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO5', '織田の守りの後詰 5', 0, 44, 122, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO6', '織田の守りの後詰 6', 0, 44, 138, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgO7', '織田の守りの後詰 7', 0, 44, 154, 2, S, 'oda', '織田 坂本の南の野'),
    blk('sgE1', '浅井の後備え 1', 1, -12, -112, 3, 0, 'azai', '浅井・朝倉 街道の奥'),
    blk('sgE2', '朝倉の後備え 2', 1, 30, -112, 3, 0, 'asakura', '浅井・朝倉 街道の奥'),
    blk('sgE3', '浅井の後備え 3', 1, -12, -128, 3, 0, 'azai', '浅井・朝倉 街道の奥'),
    blk('sgE4', '朝倉の後備え 4', 1, 30, -128, 3, 0, 'asakura', '浅井・朝倉 街道の奥'),
    blk('sgE5', '朝倉の後備え 5', 1, 72, -128, 3, 0, 'asakura', '浅井・朝倉 街道の奥'),
    blk('sgE6', '浅井の後備え 6', 1, -12, -144, 3, 0, 'azai', '浅井・朝倉 街道の奥', { far: true, tLazy: true }),
    blk('sgE7', '朝倉の後備え 7', 1, 30, -144, 3, 0, 'asakura', '浅井・朝倉 街道の奥', { far: true, tLazy: true }),
    blk('sgE8', '浅井の後備え 8', 1, -12, -160, 3, 0, 'azai', '浅井・朝倉 街道の奥', { far: true, tLazy: true }),
    blk('sgE9', '朝倉の後備え 9', 1, 30, -160, 3, 0, 'asakura', '浅井・朝倉 街道の奥', { far: true, tLazy: true }),
  ] },
  // 比叡山攻め（11/19 iMac army-02・kaito「天王寺レベルの軍勢」・docs/fujin/hieizan.md：織田 およそ三万・延暦寺方 およそ四千）。前は60秒で 217。
  //   山は急（西の x<140 は高さ 18m 超）なので、織田は東の麓の平（x208・250・坂本 (96,6) の寄せ口と z−30〜30 の道は空ける）に山へ向けて、
  //   僧兵は麓の石段（x160）に東（織田）へ向けて、家ごとの塊（一塊 44 人）。史実の比（七対一）を守って僧兵は五塊。持ち場で待つだけ（keep）。
  hieizan: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('hiO1', '織田の囲み 1', 0, 208, -96, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO2', '織田の囲み 2', 0, 208, -64, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO3', '織田の囲み 3', 0, 208, -32, 3, -S / 2, 'eiraku', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO4', '織田の囲み 4', 0, 208, 36, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO5', '織田の囲み 5', 0, 208, 68, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO6', '織田の囲み 6', 0, 208, 100, 3, -S / 2, 'eiraku', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO7', '織田の囲み 7', 0, 208, 132, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）'),
    blk('hiO8', '織田の囲み 8', 0, 250, -64, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）', { far: true, tLazy: true }),
    blk('hiO9', '織田の囲み 9', 0, 250, -32, 3, -S / 2, 'eiraku', '織田 麓の囲み（坂本・堅田）', { far: true, tLazy: true }),
    blk('hiO10', '織田の囲み 10', 0, 250, 36, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）', { far: true, tLazy: true }),
    blk('hiO11', '織田の囲み 11', 0, 250, 68, 3, -S / 2, 'oda', '織田 麓の囲み（坂本・堅田）', { far: true, tLazy: true }),
    blk('hiM1', '山門の僧兵 北の石段', 1, 160, -52, 3, S / 2, 'shuro', '延暦寺 山門の麓'),
    blk('hiM2', '山門の僧兵 南の石段', 1, 160, 52, 2, S / 2, 'shuro', '延暦寺 山門の麓'),
  ] },
  // 11/19 係（kaito「天王寺レベルの軍勢」・八尾若江）：両軍の本物の兵を千八百以上に。家ごとの塊（blk・一塊 44 人）と幟の林。持ち場で待つだけ（noEngage）・keep・idleFar。
  //   座標は b_k14_yao_wakae.js のとおり：北（−z）が若江、南が八尾。徳川は東（＋x・西向き＝−S/2）、大坂は西（−x・東向き＝S/2）。
  //   玉串川（x≈40〜48）・長瀬川（x≈−52〜−64）・若江の堤（x≈−8）・東西の道（z≈0〜10）・主人公の寄せ口（96,6）・二つの本陣の道は空ける。史実の比（藤堂 5000・井伊 3200：木村 4700・長宗我部 5300）で徳川が東に厚い
  k14_yao_wakae: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: mkOsakaWide([
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
  ]) },
  // 11/19 係（army-05・kaito「天王寺レベルの軍勢」・docs/fujin/tedorigawa.md）：手取川の北岸（−z）。前は 60秒で本物 273。
  //   織田（柴田・丹羽・前田の本陣の左右）の後備えと、上杉（先手・後備えの奥）を家ごとの塊（一塊 44 人）と幟で足す。
  //   主人公の道（x −20〜20・殿の持ち場 0,−38 から渡り口）と渡河列（x ±8）は空け、川（z −26〜20）・南岸には置かない。持ち場で待つだけ（noEngage）。
  //   idleFar：携帯で本人から遠く待つだけの備を休ませる（idle_far.js）。上杉の奥は本人が来るまで立たない（lazy）
  tedorigawa: { reachK: 1.6, withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: mkUesugiWide([
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
  ]) },
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
    // 11/21 09:40 クラウド 信貴山の持ち主（K582）：一番奥（z−250・本丸の裏）の四の備は持ち場で待つだけ（noEngage）。本丸の段で本人へ寄せようとして崖に阻まれ、十人が一点に重なった★★（せっかち 501秒 西四 (-45,-185)・act 743秒 東四 (79,-222)）
    blk('sgM4', '松永の西の斜面の備 四', 1, -100, -250, 3, 0, 'todo', '松永 西の斜面', { far: true, tLazy: true, noEngage: true }),
    // 11/21 クラウド 信貴山の持ち主：東の斜面の備は持ち場で待つ（stayPut）。松永の武将に付いて城の中へ歩こうとし、行き先へ届かず小組5人が (-76,-88)・(76,-243) に一点に重なった（act bot 04:28〜04:41 116〜156秒 ★★×2〜4）
    blk('sgM5', '松永の東の斜面の備 一', 1, 100, -100, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true, stayPut: true }),
    blk('sgM6', '松永の東の斜面の備 二', 1, 100, -150, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true, stayPut: true }),
    blk('sgM7', '松永の東の斜面の備 三', 1, 100, -200, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true, stayPut: true }),
    blk('sgM8', '松永の東の斜面の備 四', 1, 100, -250, 3, 0, 'todo', '松永 東の斜面', { far: true, tLazy: true, stayPut: true, noEngage: true }),
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
    // 11/21 クラウド 三木の持ち主（K582 携帯の act bot 101秒・★★：『毛利の搬入の護衛 1 二』5人が fujin_wake で起きて東へ出、行き先無しの攻めのまま (-153,-109) で重なり止まる）：
    //   搬入の護衛の後ろの塊は史実どおり搬入の道の西で荷を守って待つ（noEngage・stayPut。前で戦うのは本物の荷駄の護衛 F.escort）
    blk('mkM1', '毛利の搬入の護衛 1', 1, -190, -110, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true, noEngage: true, stayPut: true }),
    blk('mkM2', '毛利の搬入の護衛 2', 1, -190, -70, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true, noEngage: true, stayPut: true }),
    blk('mkM3', '毛利の搬入の護衛 3', 1, -190, -30, 3, S / 2, 'mori', '毛利 搬入の護衛', { far: true, tLazy: true, noEngage: true, stayPut: true }),
  ] },
  // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」・道明寺）：docs/fujin/k13_domyoji.md（大和口 徳川 三万四千・豊臣 一万八千）の比。道明寺の兵の多さ（ほめた物）は前のまま足すだけ。
  //   本人の道（z≈0・小松山〜石川〜野）・誉田・誉田陵・民家は空け、徳川は国分の東（x130〜190 の道の南北）、豊臣は石川の西の北寄り（z−48〜−86）に置く。持ち場で待つだけ
  k13_domyoji: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('dmT1', '大和口の寄せ手の後備え 1', 0, 130, -42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT2', '大和口の寄せ手の後備え 2', 0, 130, 42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT3', '大和口の寄せ手の後備え 3', 0, 150, -42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT4', '大和口の寄せ手の後備え 4', 0, 150, 42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT5', '大和口の寄せ手の後備え 5', 0, 170, -42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT6', '大和口の寄せ手の後備え 6', 0, 170, 42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT7', '大和口の寄せ手の後備え 7', 0, 190, -42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmT8', '大和口の寄せ手の後備え 8', 0, 190, 42, 3, -S / 2, 'tokugawa', '徳川 国分の東'),
    blk('dmO1', '豊臣の後詰 1', 1, -90, -48, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
    blk('dmO2', '豊臣の後詰 2', 1, -130, -48, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
    blk('dmO3', '豊臣の後詰 3', 1, -170, -48, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
    blk('dmO4', '豊臣の後詰 4', 1, -90, -86, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
    blk('dmO5', '豊臣の後詰 5', 1, -130, -86, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
    blk('dmO6', '豊臣の後詰 6', 1, -170, -86, 3, S / 2, 'toyotomi', '豊臣 道明寺の北', { far: true, tLazy: true }),
  ] },
  tottori: { stayPut: true, withEmpty: true, deep: true, lazy: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('toA1', '羽柴の囲み 備 1', 0, 100, -120, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA2', '羽柴の囲み 備 2', 0, 100, -175, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA3', '羽柴の囲み 備 3', 0, 60, -130, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA4', '羽柴の囲み 備 4', 0, 60, -180, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA5', '羽柴の囲み 備 5', 0, 150, -100, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA6', '羽柴の囲み 備 6', 0, 185, -130, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA7', '羽柴の囲み 備 7', 0, 185, -180, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toA8', '羽柴の囲み 備 8', 0, 150, -190, 3, -S / 2, 'kiri53', '太閤ヶ平の周り', { far: true, tLazy: true }),
    blk('toB1', '羽柴秀長・宮部の囲み 備 1', 0, -60, -196, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toB2', '羽柴秀長・宮部の囲み 備 2', 0, -100, -190, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toB3', '羽柴秀長・宮部の囲み 備 3', 0, -100, -240, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toB4', '羽柴秀長・宮部の囲み 備 4', 0, -40, -240, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toB5', '羽柴秀長・宮部の囲み 備 5', 0, 0, -230, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toB6', '羽柴秀長・宮部の囲み 備 6', 0, 40, -240, 3, S / 2, 'kiri53', '雁金山・丸山の囲み', { far: true, tLazy: true }),
    blk('toC1', '羽柴の栗谷の囲み 備 1', 0, -30, -40, 3, S, 'kiri53', '栗谷・千代川の岸'),
    blk('toC2', '羽柴の栗谷の囲み 備 2', 0, 30, -40, 3, S, 'kiri53', '栗谷・千代川の岸'),
    blk('toC3', '羽柴の栗谷の囲み 備 3', 0, -60, 20, 3, S, 'kiri53', '栗谷・千代川の岸'),
    blk('toC4', '羽柴の栗谷の囲み 備 4', 0, 60, 20, 3, S, 'kiri53', '栗谷・千代川の岸'),
    // 11/20 夜：敵（吉川・毛利の城兵と籠った民、約四千）が百人だけだった→布陣図の「麓の木戸・山上の本陣」の周りに城兵の塊（flag 'mori'）
    blk('toD1', '吉川の城兵 木戸の内', 1, -10, -100, 3, S, 'mori', '麓の木戸の内', { far: true, tLazy: true }),
    blk('toD2', '吉川の城兵 木戸の内 東', 1, 30, -100, 3, S, 'mori', '麓の木戸の内', { far: true, tLazy: true }),
    blk('toD3', '吉川の城兵 二の丸', 1, -10, -128, 3, S, 'mori', '久松山の中腹', { far: true, tLazy: true }),
    blk('toD4', '吉川の城兵 二の丸 東', 1, 30, -128, 3, S, 'mori', '久松山の中腹', { far: true, tLazy: true }),
    blk('toD6', '吉川の城兵 西の曲輪', 1, -38, -115, 3, S, 'mori', '久松山の中腹', { far: true, tLazy: true }),
    blk('toD7', '吉川の城兵 東の曲輪', 1, 58, -115, 3, S, 'mori', '久松山の中腹', { far: true, tLazy: true }),
    blk('toD8', '籠った民と城兵 西', 1, -30, -150, 3, S, 'mori', '久松山の山上', { far: true, tLazy: true }),
    blk('toD9', '籠った民と城兵 東', 1, 50, -150, 3, S, 'mori', '久松山の山上', { far: true, tLazy: true }),
    blk('toD5', '吉川経家の本陣の備', 1, 10, -165, 3, S, 'mori', '久松山の山上', { far: true, tLazy: true }),
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
  // 11/20 クラウド（kaito「天王寺レベルの軍勢」・姉川・docs/fujin/anegawa.md）：織田（南＝+z・北を向く）は各段の脇と後ろ、浅井・朝倉（北岸・南を向く）は各手の脇と後ろに家ごとの塊（一塊 44 人）を置く。持ち場で待つだけ
  anegawa: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('agX1', '坂井の脇備え 西', 0, -60, 60, 3, S, 'oda', '織田 一の段の脇'),
    blk('agX2', '池田の脇備え 東', 0, 60, 70, 3, S, 'oda', '織田 二の段の脇'),
    blk('agX3', '稲葉の後備え', 0, 100, 40, 3, S, 'inaba', '織田 東の備えの脇'),
    blk('agX4', '氏家の手', 0, 90, 100, 3, S, 'inaba', '織田 東の備えの後ろ'),
    blk('agX5', '柴田の後備え 西', 0, -70, 110, 3, S, 'oda', '織田 中の段の脇'),
    blk('agX6', '森の後備え 東', 0, 50, 120, 3, S, 'mori', '織田 中の段の脇'),
    blk('agX7', '佐久間の後備え 西', 0, -50, 150, 3, S, 'oda', '織田 後ろの段', { far: true, tLazy: true }),
    blk('agX8', '信長の馬廻 東', 0, 50, 170, 3, S, 'eiraku', '織田 本陣の脇', { far: true, tLazy: true }),
    blk('agX9', '磯野の脇備え 西', 1, -20, -50, 3, 0, 'azai', '浅井 先手の脇'),
    blk('agX10', '阿閉の脇備え 東', 1, 70, -70, 3, 0, 'azai', '浅井 二の手の脇'),
    blk('agX11', '新庄の後備え', 1, -20, -100, 3, 0, 'azai', '浅井 三の手の脇'),
    blk('agX12', '遠藤の後備え', 1, 80, -120, 3, 0, 'azai', '浅井 四の手の脇', { far: true, tLazy: true }),
    blk('agX13', '浅井政澄の脇備え', 1, -50, -150, 3, 0, 'azai', '浅井 本陣の脇', { far: true, tLazy: true }),
    blk('agX14', '朝倉の先手の脇 東', 1, -130, -50, 3, 0, 'asakura', '朝倉 先手の脇'),
    blk('agX15', '朝倉の先手の脇 西', 1, -190, -70, 3, 0, 'asakura', '朝倉 先手の脇'),
    blk('agX16', '前波の脇備え', 1, -120, -110, 3, 0, 'asakura', '朝倉 二の手の脇', { far: true, tLazy: true }),
    blk('agX17', '朝倉景健の後備え', 1, -200, -130, 3, 0, 'asakura', '朝倉 本陣の脇', { far: true, tLazy: true }),
  ] },
  // 11/20 クラウド（kaito「天王寺レベルの軍勢」・箕作城・docs/fujin/mitsukuri.md）：織田は麓の陣の脇と後ろ、六角は三の郭・二の丸・東曲輪の脇に塊を置く。持ち場で待つだけ
  mitsukuri: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('miX1', '木下の脇備え 西', 0, -40, 40, 3, S, 'oda', '織田 大手の脇'),
    blk('miX2', '佐久間の脇備え 東', 0, 50, 40, 3, S, 'oda', '織田 控えの脇'),
    blk('miX3', '織田の本陣の脇 西', 0, -50, 80, 3, S, 'oda', '織田 本陣の脇'),
    blk('miX4', '織田の本陣の脇 東', 0, 56, 84, 3, S, 'eiraku', '織田 本陣の脇'),
    blk('miX5', '浅井新八の脇備え', 0, -80, 50, 3, S, 'oda', '織田 西の谷の脇', { far: true, tLazy: true }),
    blk('miX6', '丹羽の後備え', 0, 90, 60, 3, S, 'oda', '織田 東の口の脇', { far: true, tLazy: true }),
    blk('miX7', '六角の外曲輪の脇 西', 1, -30, -62, 3, 0, 'rokkaku', '六角 三の郭の脇'),
    blk('miX8', '六角の外曲輪の脇 東', 1, 30, -62, 3, 0, 'rokkaku', '六角 三の郭の脇'),
    blk('miX9', '六角の二の丸の脇 西', 1, -34, -88, 3, 0, 'rokkaku', '六角 二の丸の脇'),
    blk('miX10', '六角の二の丸の脇 東', 1, 34, -88, 3, 0, 'rokkaku', '六角 二の丸の脇'),
    blk('miX11', '六角の東曲輪の脇', 1, 48, -120, 3, 0, 'rokkaku', '六角 東の曲輪の脇', { far: true, tLazy: true }),
    blk('miX12', '六角の本陣の脇', 1, -70, -120, 3, 0, 'rokkaku', '六角 本陣の脇', { far: true, tLazy: true }),
    blk('miX13', '木下の後備え', 0, -20, 110, 3, S, 'oda', '織田 大手の後ろ', { far: true, tLazy: true }),
    blk('miX14', '六角の後備え 北', 1, 0, -140, 3, 0, 'rokkaku', '六角 本陣の後ろ', { far: true, tLazy: true }),
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
  // 11/21 越前一向の持ち主 クラウド（act bot 0344：304秒 山門の段で、持ち場 (−60,40) の「衆徒 山の西 上 一」が外堂の戸口 (−13,−62) で本人を討った）：
  //   一揆の塊（side 1）は寺の将に付け直さず布陣図の斜面の持ち場のまま（戸次川の noAttach と同じ）
  echizen_ikko: { noAttach: [1], withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
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
  // 11/19 iMac army-02（kaito「天王寺レベルの軍勢」・docs/fujin/mikatagahara.md：武田 二万七千・徳川織田 一万一千）。前は60秒で 290。
  //   台地（x±200・z−220〜75・南は犀ヶ崖）の上に、武田は本陣の後ろ（z−146・−162）と脇に、徳川は鶴翼の後ろの両脇（x±90〜130）に、家ごとの塊（一塊 44 人）。持ち場で待つだけ（keep）。
  mikatagahara: { reachK: 2.5, withEmpty: true, deep: true, lazy: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], keep: true, rows: mkTakedaWide([
    blk('mkT1', '武田の後備え 1', 1, -80, -146, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT2', '武田の後備え 2', 1, -40, -146, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT3', '武田の後備え 3', 1, 0, -146, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT4', '武田の後備え 4', 1, 40, -146, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT5', '武田の後備え 5', 1, 80, -146, 3, 0, 'akazonae', '武田 本陣の後ろ', { far: true }),
    blk('mkT6', '武田の後備え 6', 1, -40, -162, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT7', '武田の後備え 7', 1, 0, -162, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT8', '武田の後備え 8', 1, 40, -162, 3, 0, 'takeda', '武田 本陣の後ろ', { far: true }),
    blk('mkT9', '武田の脇の備え 西', 1, -104, -112, 3, 0, 'takeda', '武田 魚鱗の脇', { far: true }),
    blk('mkT10', '武田の脇の備え 東', 1, 104, -112, 3, 0, 'akazonae', '武田 魚鱗の脇', { far: true }),
    blk('mkO1', '徳川の後備え 1', 0, -130, 30, 3, S, 'tokugawa', '徳川 鶴翼の後ろ'),
    blk('mkO2', '徳川の後備え 2', 0, -90, 30, 3, S, 'tokugawa', '徳川 鶴翼の後ろ'),
    blk('mkO3', '徳川の後備え 3', 0, 90, 30, 3, S, 'tokugawa', '徳川 鶴翼の後ろ'),
    blk('mkO4', '徳川の後備え 4', 0, 130, 30, 3, S, 'tokugawa', '徳川 鶴翼の後ろ'),

    { key: 'tkR2', name: '山県の寄騎（第二陣の外）', side: 1, x: 44, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'akazonae', armor: 0x8e1f16, row: '武田 第二陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL2', name: '小幡の寄騎（第二陣の外）', side: 1, x: -52, z: -84, w: 26, d: 10, count: 70, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第二陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkR3', name: '勝頼の後備え（第三陣の外）', side: 1, x: 58, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 右', leaders: [], ranks: 4, nobori: true },
    { key: 'tkL3', name: '馬場の後備え（第三陣の外）', side: 1, x: -64, z: -100, w: 28, d: 10, count: 75, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 第三陣 左', leaders: [], ranks: 4, nobori: true },
    { key: 'tkHQ', name: '信玄の後備え（本陣の後ろ）', side: 1, x: 0, z: -126, w: 40, d: 12, count: 90, facing: 0, flag: 'takeda', armor: 0x3a2622, row: '武田 本陣の後ろ', leaders: [], ranks: 4, nobori: true },
  ]) },
  // 11/19 iMac army-03（kaito「天王寺レベルの軍勢」・docs/fujin/tonezaka.md）：織田の後続（佐久間・丹羽・羽柴・滝川の先手＝遅れて追い付く）を本人の南の野（z 118〜162・峠道の南）に家ごとの塊で、
  //   朝倉の本隊の後備え・荷駄の守りを東北の空き地（z −110〜−146・道から離れた野）に置く。坂（傾き 0.7 超）・道（x 北西へ z≒0.27x 付近）・川には置かない。持ち場で待つだけ（noEngage）
  tonezaka: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('toO1', '佐久間信盛の後続の先手', 0, -10, 118, 3, -S / 2, 'oda', '織田 後続の先手'),
    blk('toO2', '丹羽長秀の後続の先手', 0, 36, 118, 3, -S / 2, 'oda', '織田 後続の先手'),
    blk('toO3', '羽柴秀吉の後続の先手', 0, 82, 118, 3, -S / 2, 'oda', '織田 後続の先手'),
    blk('toO4', '滝川一益の後続の先手', 0, 128, 118, 3, -S / 2, 'oda', '織田 後続の先手'),
    blk('toO5', '前田利家の後続', 0, 174, 118, 3, -S / 2, 'oda', '織田 後続の先手'),
    blk('toO6', '織田の後詰 一', 0, 12, 140, 3, -S / 2, 'oda', '織田 後詰'),
    blk('toO7', '織田の後詰 二', 0, 58, 140, 3, -S / 2, 'oda', '織田 後詰'),
    blk('toO8', '織田の後詰 三', 0, 104, 140, 3, -S / 2, 'oda', '織田 後詰'),
    blk('toO9', '織田の後詰 四', 0, 150, 140, 3, -S / 2, 'oda', '織田 後詰'),
    blk('toA1', '朝倉の後備え 一', 1, 75, -110, 3, -S / 2, 'asakura', '朝倉 後備え'),
    blk('toA2', '朝倉の後備え 二', 1, 121, -110, 3, -S / 2, 'asakura', '朝倉 後備え'),
    blk('toA3', '朝倉の荷駄の守り 一', 1, 30, -128, 3, -S / 2, 'asakura', '朝倉 荷駄の守り'),
    blk('toA4', '朝倉の荷駄の守り 二', 1, 76, -128, 3, -S / 2, 'asakura', '朝倉 荷駄の守り'),
    blk('toA5', '朝倉の荷駄の守り 三', 1, 122, -128, 3, -S / 2, 'asakura', '朝倉 荷駄の守り'),
    blk('toA6', '朝倉の荷駄の守り 四', 1, 168, -128, 3, -S / 2, 'asakura', '朝倉 荷駄の守り'),
  ] },
  // 11/19 iMac army-03（kaito「天王寺レベルの軍勢」・docs/fujin/echizen.md）：峠口（本人 13,−583・観音丸の木戸の前）の南の谷の西の野（x −62〜−94）に織田の仕寄りの後続（明智・羽柴・丹羽の手）を、
  //   東の尾根の野（x 100〜164・z −640〜−588）に西光寺丸と東尾根の一向一揆を、家ごとの塊（一塊 44 人）で置く。本道（x≒0）と観音丸の木戸の前（z −567）・坂（傾き 0.7 超）には置かない。持ち場で待つだけ
  echizen: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ecO1', '明智光秀の仕寄り 一', 0, -62, -650, 2, 0, 'oda', '織田 峠口の仕寄り'),
    blk('ecO2', '明智光秀の仕寄り 二', 0, -94, -650, 2, 0, 'oda', '織田 峠口の仕寄り'),
    blk('ecO3', '羽柴秀吉の手 一', 0, -62, -622, 2, 0, 'oda', '織田 峠口の仕寄り'),
    blk('ecO4', '羽柴秀吉の手 二', 0, -94, -622, 2, 0, 'oda', '織田 峠口の仕寄り'),
    blk('ecO5', '丹羽長秀の後詰 一', 0, -62, -594, 2, 0, 'oda', '織田 後詰'),
    blk('ecO6', '丹羽長秀の後詰 二', 0, -94, -594, 2, 0, 'oda', '織田 後詰'),
    blk('ecO7', '前田利家の手', 0, -62, -566, 2, 0, 'oda', '織田 後詰'),
    blk('ecO8', '佐々成政の手', 0, -94, -566, 2, 0, 'oda', '織田 後詰'),
    blk('ecO9', '不破光治の手', 0, -62, -538, 2, 0, 'oda', '織田 後詰'),
    blk('ecO10', '柴田勝家の手', 0, -94, -538, 2, 0, 'oda', '織田 後詰'),
    blk('ecO11', '織田の後備え 一', 0, -62, -510, 2, 0, 'oda', '織田 後備え'),
    blk('ecO12', '織田の後備え 二', 0, -94, -510, 2, 0, 'oda', '織田 後備え'),
    blk('ecI1', '西光寺丸の一向一揆 一', 1, 100, -640, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI2', '西光寺丸の一向一揆 二', 1, 132, -640, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI3', '西光寺丸の一向一揆 三', 1, 164, -640, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI4', '東尾根の伏せ勢 一', 1, 100, -614, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI5', '東尾根の伏せ勢 二', 1, 132, -614, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI6', '東尾根の伏せ勢 三', 1, 164, -614, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI7', '本覚寺の衆徒', 1, 118, -588, 2, S, 'ikko', '東尾根の一揆'),
    blk('ecI8', '鉢伏城の衆徒', 1, 160, -588, 2, S, 'ikko', '東尾根の一揆'),
  ] },
  // 11/19 iMac army-03（kaito「天王寺レベルの軍勢」・docs/fujin/odani.md）：小谷山は坂ばかりで、歩ける枠は x ±170・z ±170（外へ置くと枠の縁に重なる）。傾きの緩い所だけに置く。
  //   織田は清水谷の奥の平（x −108〜−76・z 14〜46）と谷の南の口（z 158）に羽柴の手の後続を、浅井は本丸の東の下の平（x 0・z 54〜150）に備えを家ごとの塊で置く。
  //   本人（−97,90）の行く谷道（x −120〜−72・z 60〜160）と屋敷・櫓・京極丸の口には置かない。持ち場で待つだけ（noEngage）
  odani: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('odO1', '羽柴秀吉の谷の後続', 0, -108, 14, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO2', '蜂須賀正勝の後続', 0, -76, 14, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO3', '浅野長吉の後続', 0, -108, 30, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO4', '羽柴小一郎の後続', 0, -76, 30, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO5', '堀秀政の後続', 0, -108, 46, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO6', '中川清秀の後続', 0, -76, 46, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO7', '高山右近の後続', 0, -132, 158, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odO8', '木下勝俊の後続', 0, -100, 158, 2, S, 'oda', '織田 清水谷の後続'),
    blk('odA1', '赤尾屋敷の下の守り', 1, 0, 54, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA2', '本丸の東下の備え 一', 1, 0, 70, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA3', '本丸の東下の備え 二', 1, 0, 86, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA4', '大広間の下の備え', 1, 0, 102, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA5', '御馬屋の下の備え', 1, 0, 118, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA6', '番所の下の備え', 1, 0, 134, 3, 0, 'azai', '浅井 本丸の東下'),
    blk('odA7', '大手の下の備え', 1, 0, 150, 3, 0, 'azai', '浅井 本丸の東下'),
  ] },
  // 11/19 iMac army-03（kaito「天王寺レベルの軍勢」・docs/fujin/nagashima.md）：地は平らで、川（z −132 と z −36 の東西の帯）・堤（x −46・z −6〜−48）・長島城の前（x ±20・z −70〜−30）・本人の岸の柵（z −30〜10）には置かない。
  //   織田は岸の後ろ（z 96・120）に家ごとの塊を五つずつ二列、一揆は城の西と東の野（z −92・−70・川より南）に門徒の塊を置く。持ち場で待つだけ（noEngage）
  nagashima: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('naO1', '柴田勝家の後備え', 0, -92, 96, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO2', '前田利家の手', 0, -46, 96, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO3', '佐久間信盛の手', 0, 0, 96, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO4', '滝川一益の手', 0, 46, 96, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO5', '丹羽長秀の手', 0, 92, 96, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO6', '蜂屋頼隆の手', 0, -92, 120, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO7', '稲葉一鉄の後備え', 0, -46, 120, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO8', '織田信忠の二陣', 0, 0, 120, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO9', '織田の予備 一', 0, 46, 120, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naO10', '織田の予備 二', 0, 92, 120, 3, S, 'oda', '織田 岸の後ろ'),
    blk('naI1', '下間頼旦の門徒 一', 1, -150, -92, 3, 0, 'ikko', '一揆 長島の北'),
    blk('naI2', '下間頼旦の門徒 二', 1, -104, -92, 3, 0, 'ikko', '一揆 長島の北'),
    // 11/21 k365-cloud-23（K582 act bot 二回倒れ：本人が (-60,-79) で願証寺・大鳥居の門徒の塊に囲まれ十秒で倒れた）：x −58 の二塊は本人の道の上だったので西の二列の奥（z −114）へ
    blk('naI3', '願証寺の門徒', 1, -150, -114, 3, 0, 'ikko', '一揆 長島の北'),
    blk('naI4', '屋長島の門徒', 1, 58, -92, 3, 0, 'ikko', '一揆 長島の北'),
    blk('naI5', '中江の門徒 一', 1, -150, -70, 3, 0, 'ikko', '一揆 長島の北'),
    blk('naI6', '中江の門徒 二', 1, -104, -70, 3, 0, 'ikko', '一揆 長島の北'),
    blk('naI7', '大鳥居の門徒', 1, -104, -114, 3, 0, 'ikko', '一揆 長島の北'),
  ] },
  // 11/20 cloud（kaito「天王寺レベルの軍勢」・山中城・docs/fujin/t09_yamanaka.md）：前は 60秒で 244。豊臣（南の坂・北＝−z を向く）は坂の両脇と本陣の後ろに堀・諸将の手を家ごとの塊（一塊 44 人）で。
  //   北条は障子堀・三の丸・二の丸の脇の斜面に城兵の塊。本人の道（x −20〜70）・障子堀（x −40〜60）には置かない。持ち場で待つだけ
  t09_yamanaka: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ym1', '堀秀政の手 西', 0, -150, 206, 3, S, 'toyotomi', '豊臣 坂の西'),
    blk('ym2', '堀秀政の手 西寄り', 0, -104, 206, 3, S, 'toyotomi', '豊臣 坂の西'),
    blk('ym3', '田中吉政の手', 0, -58, 206, 3, S, 'toyotomi', '豊臣 坂の西'),
    blk('ym4', '堀尾の手', 0, 104, 206, 3, S, 'toyotomi', '豊臣 坂の東'),
    blk('ym5', '蜂須賀の手', 0, 150, 206, 3, S, 'toyotomi', '豊臣 坂の東'),
    blk('ym6', '木村の手', 0, 196, 206, 3, S, 'toyotomi', '豊臣 坂の東'),
    blk('ym7', '秀次の後備え 西', 0, -130, 232, 3, S, 'toyotomi', '豊臣 本陣の後ろ'),
    blk('ym8', '秀次の後備え 西寄り', 0, -84, 232, 3, S, 'toyotomi', '豊臣 本陣の後ろ'),
    blk('ym9', '秀次の後備え 東', 0, 120, 232, 3, S, 'toyotomi', '豊臣 本陣の後ろ'),
    blk('ym10', '秀次の後備え 東寄り', 0, 166, 232, 3, S, 'toyotomi', '豊臣 本陣の後ろ'),
    blk('ym11', '北条の城兵 堀の西', 1, -110, 96, 3, 0, 'hojo', '北条 障子堀の脇'),
    blk('ym12', '北条の城兵 堀の東', 1, 120, 96, 3, 0, 'hojo', '北条 障子堀の脇'),
    blk('ym13', '北条の城兵 西の斜面', 1, -120, 60, 3, 0, 'hojo', '北条 三の丸の脇', { far: true, tLazy: true }),
    blk('ym14', '北条の城兵 東の斜面', 1, 130, 60, 3, 0, 'hojo', '北条 三の丸の脇', { far: true, tLazy: true }),
    blk('ym15', '北条の城兵 二の丸の脇', 1, -90, 10, 3, 0, 'hojo', '北条 二の丸の脇', { far: true, tLazy: true }),
  ] },
  // 11/20 cloud（kaito「天王寺レベルの軍勢」・有岡城・docs/fujin/arioka.md）：前は 60秒で 266。織田（東＝+x を向く）は木戸の手前（x −500）と陣の後ろ（x −590・−650）に丹羽・蜂屋・滝川の後備え・信忠の旗本を家ごとの塊で。
  //   荒木は侍町（x −310・−260）の通りの両脇の空き地に城兵の塊。木戸口・町の通り（z −107）には置かない。持ち場で待つだけ
  arioka: { withEmpty: true, deep: true, lazy: true, keep: true, idleFar: true, noboriAll: true, nbTouch: [4, 2], rows: [
    blk('ar1', '丹羽の後備え 北', 0, -500, -240, 3, S/2, 'oda', '織田 木戸の手前'),
    blk('ar2', '丹羽の後備え 北寄り', 0, -500, -196, 3, S/2, 'oda', '織田 木戸の手前'),
    blk('ar3', '蜂屋の後備え 南寄り', 0, -500, -20, 3, S/2, 'oda', '織田 木戸の手前'),
    blk('ar4', '蜂屋の後備え 南', 0, -500, 24, 3, S/2, 'oda', '織田 木戸の手前'),
    blk('ar5', '滝川の後詰 北', 0, -590, -215, 3, S/2, 'takigawa', '織田 陣の後ろ'),
    blk('ar6', '滝川の後詰 北寄り', 0, -590, -165, 3, S/2, 'takigawa', '織田 陣の後ろ'),
    blk('ar7', '信忠の旗本 南寄り', 0, -590, -50, 3, S/2, 'oda', '織田 陣の後ろ'),
    blk('ar8', '信忠の旗本 南', 0, -590, 0, 3, S/2, 'oda', '織田 陣の後ろ'),
    blk('ar9', '織田の後詰 北', 0, -650, -150, 3, S/2, 'oda', '織田 後詰', { far: true, tLazy: true }),
    blk('ar10', '織田の後詰 南', 0, -650, -60, 3, S/2, 'oda', '織田 後詰', { far: true, tLazy: true }),
    blk('ar11', '荒木の城兵 侍町の北', 1, -310, -230, 3, -S/2, 'maru', '荒木 侍町'),
    blk('ar12', '荒木の城兵 侍町の北寄り', 1, -310, -190, 3, -S/2, 'maru', '荒木 侍町'),
    blk('ar13', '荒木の城兵 侍町の南寄り', 1, -310, -30, 3, -S/2, 'maru', '荒木 侍町'),
    blk('ar14', '荒木の城兵 侍町の南', 1, -310, 10, 3, -S/2, 'maru', '荒木 侍町'),
    blk('ar15', '荒木の城兵 辻の奥 北', 1, -260, -240, 3, -S/2, 'maru', '荒木 辻の奥', { far: true, tLazy: true }),
    blk('ar16', '荒木の城兵 辻の奥 南', 1, -260, -20, 3, -S/2, 'maru', '荒木 辻の奥', { far: true, tLazy: true }),
  ] },
};
// 11/19 係（天王寺レベルの軍勢・番外 天王寺）：番外の真田は天王寺を丸ごと写した戦（側だけ入れ替え）なので、同じ表を使う（表の side は豊臣方＝0・徳川方＝1 のまま）
// 豊臣方（味方・side 1・南向き＝0）は毛利の三陣の北に七手組・大野の備の塊を足す（徳川方は天王寺の表のまま千以上ある）。茶臼山（−106,4）・毛利の三陣（−52,−38）・城への道は空ける
FUJIN.d07_mikatagahara = FUJIN.mikatagahara;   // 武田編 三方ヶ原（b_d07_mikatagahara.js が側を入れ替える・行は同じ）
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
