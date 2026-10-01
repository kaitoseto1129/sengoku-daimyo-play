import { distToPolyline } from './world.js';
import { palisade, stumps, jinmaku, nobori, hut, lumber, yagura, campfire, scaffold, kabukimon, tawara, bobosaku, umatsunagi, kobune, hasa, koshi, umaFollow, kagaribi, sakamogi, takataba } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS, BATTLES, onScenario, markReady, scenarioKey } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { hush } from './audio.js';
import { depthStart, depthTick, depthOn } from './b_depth.js';
import * as DP from './b_depth.js';
// 長篠編の戦は一つずつ別のファイル（中身がまだなら null）
import { nagashinojo } from './b_nagashinojo.js';
import { tobinosu } from './b_tobinosu.js';
import { suwahara } from './b_suwahara.js';
import { anegawa } from './b_anegawa.js';
import { sekigahara, clash } from './b_sekigahara.js';
import { sanadamaru } from './b_osaka.js';
import { sune } from './b_sune.js';
import { kanegasaki } from './b_kanegasaki.js';
import { domyoji } from './b_domyoji.js';
import { hieizan } from './b_hieizan.js';
// 織田家編で足した戦（一つの戦を一つのファイルに）
import { inabayama, customFlag } from './b_inabayama.js';
import { mitsukuri } from './b_mitsukuri.js';
import { nodafukushima } from './b_nodafukushima.js';
import { odani } from './b_odani.js';
import { nagashima } from './b_nagashima.js';
import { takato } from './b_takato.js';
import { honnoji } from './b_honnoji.js';
import { shiga } from './b_shiga.js';
import { tonezaka } from './b_tonezaka.js';
import { tennoji } from './b_tennoji.js';
import { shigisan } from './b_shigisan.js';
import { arioka } from './b_arioka.js';
import { miki } from './b_miki.js';
import { tedorigawa } from './b_tedorigawa.js';
import { iga } from './b_iga.js';
import { echizen } from './b_echizen.js';
import { kizugawa } from './b_kizugawa.js';
import { saika } from './b_saika.js';
import { tano } from './b_tano.js';
import { mikatagahara } from './b_mikatagahara.js';
import { tottori } from './b_tottori.js';
import { iwamura } from './b_iwamura.js';
import { okawachi } from './b_okawachi.js';
// 攻城 MVP（docs/siege-plan.md F2）：別の id で登録し、ODA_LINE には入れない（lord.js の「信長で遊ぶ」一覧から入る）
import { kinome } from './b_kinome.js';
// 攻城 C7・C9（docs/siege-plan.md）：高遠城の縄張り版。今の takato（b_takato.js）は残し、別の id で登録
import { takato_siege } from './b_takato_siege.js';
// 山岳戦 MVP（docs/siege-plan.md M5）：同じく別の id（今の hieizan は残したまま）。lord.js の一覧から入る
import { hiei_mtn } from './b_hiei_mtn.js';
// 山の広げ（docs/siege-plan.md 7-9・mountain-spec 32）：越前一向一揆の山の寺（夜襲と霧）。lord.js の一覧から入る
import { echizen_ikko } from './b_echizen_ikko.js';
// 役目ごとに分けたファイル
import { okehazama } from './b_okehazama.js';
import { moribe } from './b_moribe.js';
import { sunomata } from './b_sunomata.js';
import { shitaragahara } from './b_shitaragahara.js';
export { buildBobosaku } from './b_sunomata.js';
export { dojo } from './b_dojo.js';


// 筋書きごとの戦。BATTLE_DEFS は、いま遊んでいる筋書きの中身に入れ替わる（state.js の BATTLES と同じ並び）
const DEF_BY_ID = { okehazama, moribe, sunomata, shitaragahara };
for (const [id, d] of Object.entries({ inabayama, mitsukuri, nodafukushima, odani, nagashima, takato, honnoji, shiga, tonezaka, tennoji, shigisan, arioka, miki, tedorigawa, iga, echizen, kizugawa, saika, tano, mikatagahara, tottori, iwamura, okawachi })) if (d) DEF_BY_ID[id] = d;
for (const [id, d] of Object.entries({ nagashinojo, tobinosu, suwahara, anegawa, sekigahara, sanadamaru, sune, kanegasaki, domyoji, hieizan })) if (d) DEF_BY_ID[id] = d;
for (const [id, d] of Object.entries({ kinome, hiei_mtn, takato_siege, echizen_ikko })) if (d) DEF_BY_ID[id] = d;
// MVP の後 7-1（docs/siege-plan.md）：織田家編（ODA_LINE）の echizen・takato・hieizan は、
// 砦・城・山の縄張り版（kinome・takato_siege・hiei_mtn）で遊ばせる。古い b_echizen.js・b_takato.js・
// b_hieizan.js は消さず、_old の id で残す（lord.js の「信長で遊ぶ」一覧は kinome 等の id のまま触らない）。
// 同じ def を二つの id に出すと .key の取り合いになるので、ODA_LINE 側だけ中身を写した別の object にする。
DEF_BY_ID.echizen_old = echizen; DEF_BY_ID.takato_old = takato; DEF_BY_ID.hieizan_old = hieizan;
// 写しは getter をそのまま写す（{ ...d } だと getter が読み込みの時の値で固まる）
const copyDef = (d) => Object.defineProperties({}, Object.getOwnPropertyDescriptors(d));
DEF_BY_ID.echizen = copyDef(kinome); DEF_BY_ID.takato = copyDef(takato_siege); DEF_BY_ID.hieizan = copyDef(hiei_mtn);
for (const [id, d] of Object.entries(DEF_BY_ID)) d.key = id;
export const BATTLE_DEFS = [];
onScenario(() => BATTLE_DEFS.splice(0, BATTLE_DEFS.length, ...BATTLES.map((b) => DEF_BY_ID[b.id])));
markReady(Object.keys(DEF_BY_ID));
