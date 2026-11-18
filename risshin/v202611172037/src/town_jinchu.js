// ======================================================================
// 陣中（遠征中の拠点）（K308 要件8〜11・95）
// 遠征の途中で次の戦へ続く時は、本拠地の城下へ戻さず、陣中に戻る。城下より小さく簡素：
//   本陣の幕（軍議）・武具の修理・組の者・馬・戦の様子・出陣の口だけ。字は出さず、言葉は台詞で。
// どの戦の前が陣中かは「次の戦の id」で引く（state.js の ODA_LINE。直前の戦と同じ遠征の続きだけ）。
// ======================================================================
import * as THREE from 'three';
import { jinmaku, kagaribi, hut, nobori, umatsunagi, kabukimon, dobei, yaguramon, sumiyagura, umajirushi, hatazao, hyoro } from './props.js';
import { allyGroup } from './bhelp.js';
import { BATTLES, scenarioKey, ladderStep } from './state.js';
import { seasonOf } from './oda_town.js';
import { townTabOpen } from './town_unlock.js';
import { buildRoom } from './interior_parts.js';
import { rippleWater } from './world_water.js';
import { liteMat } from './world_vegetation_materials.js';

// 次の戦の id → 陣中。prev は直前の戦（この戦から続く時だけ陣中にする）
export const JINCHU = {
  shiga: { prev: 'nodafukushima', place: '摂津 天満の陣中', news: '浅井と朝倉が坂本へ出たそうな。宇佐山の森様が危ない。殿は近江へ引き返される' },
  odani: { prev: 'tonezaka', place: '近江 虎御前山の陣中', news: '朝倉は越前で滅んだ。次は小谷の浅井じゃ。この山から城がよう見える' },
  echizen_ikko: { prev: 'echizen', place: '越前 府中の陣中', news: '木ノ芽峠は抜けた。一揆の残りは山の寺へ逃げ込んだそうな' },
  tano: { prev: 'takato', place: '信濃 高遠の陣中', news: '高遠は落ちた。勝頼は新府の城を焼いて、東へ逃げたそうな' },
  // K364 ③（drama_req_1117 14〜18）：官兵衛が有岡へ使いに出て戻らない（三木の前・平井山）／土牢から戻った官兵衛の変わった姿（鳥取の前・太閤ヶ平）
  miki: { prev: 'kizugawa', place: '播磨 平井山の陣中', when: '天正六年十月', drama: 'kanbeiGo', news: '三木の城は別所が固めておる。摂津の荒木様の様子がおかしいそうな' },
  tottori: { prev: 'iga', place: '因幡 太閤ヶ平の陣中', drama: 'kanbeiBack', news: '鳥取の城のまわりの米は、先に高う買い占めたそうな' },
  // K364 要件書60（茶の湯は政治の場）：小田原攻めの本陣（早雲寺）。誰が呼ばれ、誰が呼ばれないか
  t12_odawara: { scn: 'toyotomi', prev: 't11_hachioji', place: '相模 早雲寺の本陣', when: '天正十八年', drama: 'chanoyu', news: '北条の城は三月囲んでも落ちぬ。殿下は茶を点てて待っておられる' },
  // K364 ②（docs/specs/drama_req_1117.md 19〜23）：山崎の後、すぐ賤ヶ岳へ飛ばさず清洲城の評定（清洲会議）。身分で見え方が違う
  // K364（drama_req 27・54）：冬の陣の和議の後、徳川方の手で大坂の堀が埋められていくのを、堀の縁を歩いて見る（樫井の前・真田丸の後）
  // K364（drama_req 56・65-29）：天王寺・岡山の朝、平野の徳川本陣。使番が駆け込み、金の扇の馬印の下で下知を待つ。荷駄が米を運び、鉄砲衆が火縄を整える
  k15_tennoji_okayama: { scn: 'tokugawa', prev: 'k14_yao_wakae', place: '摂津 平野の徳川本陣', when: '慶長二十年五月七日', drama: 'hirano',
    news: '真田は茶臼山、毛利は天王寺の南に陣を据えたそうな',
    tips: ['五月七日、家康は天王寺口、秀忠は岡山口を受け持ちました。', '真田信繁は茶臼山に陣を据えて待ち受けました。'] },
  k12_kashii: { scn: 'tokugawa', prev: 'k11_sanadamaru', place: '摂津 大坂 惣構えの外', when: '慶長二十年一月', drama: 'horiume',
    news: '冬の和議が成った。堀を埋めたら、兵の多くは国へ戻される、と聞く',
    tips: ['大坂の惣構えの堀は町も城も、囲む守りでした。', '和議の後、大坂の堀は徳川方が埋めました。'] },
  t02_shizugatake: { scn: 'toyotomi', prev: 't01_yamazaki', place: '尾張 清洲城', when: '天正十年六月二十七日', drama: 'kiyosu',
    news: '柴田様は越前へ戻られた。長浜の城は柴田様の甥御、勝豊様の手に渡ったそうな' },
};

// 今の保存で、次に向かう戦の前が陣中ならその中身。そうでなければ null
export function jinchuOf(G) {
  if (!G) return null;
  const next = BATTLES[G.battle], prev = BATTLES[(G.battle || 0) - 1];
  const J = next && JINCHU[next.id];
  if (!J || (J.scn || 'oda') !== scenarioKey() || !prev || prev.id !== J.prev) return null;
  return { ...J, id: next.id, when: J.when || next.year || '' };
}

const SPOT = {
  boss: { x: 0, z: 6, n: '軍議の幕' }, shop: { x: -17, z: -3, n: '武具の修理場' }, squad: { x: 17, z: -3, n: '組の陣小屋' },
  stable: { x: 19, z: 12, n: '馬つなぎ' }, gate: { x: 0, z: -27, n: '出陣の口' },
};

const jinBase = (x, z) => 0.5 * Math.sin(x * 0.031) + 0.4 * Math.cos(z * 0.027) + Math.max(0, z - 30) * 0.12;
// 堀（horiume）：陣の北、z 22 を中に幅六メートル・深さ二・四メートルの東西の溝（x −30〜30）。縁はなだらかに
const HORI = { z: 22, half: 3, x0: -30, x1: 30, depth: 2.4, segs: 8 };
export function jinchuDef(game, J) {
  const season = seasonOf(J.when);
  const def = {
    town: true, jinchu: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    tips: J.tips,   // 町に入って二十二秒の「戦の心得・豆知識」をその場に合う物から選ぶ（main.js）
    title: J.place, info: { place: J.place, when: J.when }, year: Number((J.when.match(/\d{4}/) || [])[0] || 0), faction: 'oda',
    place: J.place, when: J.when, season,
    spawn: { x: 0, z: -21, heading: 0 },
    world: {
      seed: 1570 + J.id.length, time: 'day', clearAir: true, mood: 'plain',
      height: (x, z) => jinBase(x, z),
      // 堀は他の戦の川・堀と同じ作り（world の streams：溝を掘り、水面・流れ・縁の斜めを描く。道明寺の石川と同じ）
      streams: J.drama === 'horiume' ? [{ pts: [[HORI.x0 - 3, HORI.z], [HORI.x1 + 3, HORI.z]], w: HORI.half + 0.4, depth: HORI.depth, still: true, plainWater: true }] : undefined,
      clear: (x, z) => Math.abs(x) < 32 && z > -34 && z < (J.drama === 'horiume' ? 34 : 26),
      // 堀の場は散らす岩を置かない（溝の斜面で灰色の角ばった岩が宙に浮いて見えた）
      trees: 160, tufts: 1800, rocks: J.drama === 'horiume' ? 0 : 40, paths: [[[0, -40], [0, 2]]],
      autumn: season === '秋', winter: season === '冬', young: season === '春' || season === '夏', muddy: 0.25,
      groves: [[-60, 30, 24], [60, 34, 26], [-55, -40, 20], [58, -36, 20]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
    },
    setup(rt) {
      // 陣中には戦が無いので血の跡を置かない（11/18：支度の中で原点の手前に血だまりが二枚置かれ、主人公が近づくと赤い染みに見えた）
      rt.army.hideBlood = true;
      for (const t of [0.2, 2, 6]) rt.after(t, () => { try { rt.army.disposeStains?.(); } catch (e) { /* 跡が無い時はそのまま */ } });
      (J.drama === 'kiyosu' ? buildKiyosu : buildJinchu)(rt, J); const dl = document.getElementById('dateline'); if (dl) dl.textContent = J.when; },
    update(rt, dt) { if (J.drama === 'kiyosu') kiyosuTick(rt, dt); else if (J.drama === 'horiume') horiTick(rt, dt); else if (J.drama === 'hirano') hiranoTick(rt, dt); },
    guideTo(rt, tab) {
      const s = SPOT[tab === 'nagaya' ? 'squad' : tab] || SPOT.boss;
      rt.marker('mk-go', { x: s.x, z: s.z }, s.n);
      rt.bark(`${s.n}へ。小さな地図の印をたどる`);
    },
    onResume() {},
  };
  return def;
}

function buildJinchu(rt, J) {
  const W = rt.world, game = rt.game, G = rt.G;
  // 軍議の幕（本陣）：幕で囲い、南に口。中に上役。印の名に「本陣」を使うと画面で「守る場所」に読み替わるので「軍議の幕」
  const MON = J.scn === 'toyotomi' ? 'toyotomi' : J.scn === 'tokugawa' ? 'tokugawa' : 'oda';   // 豊臣編・徳川編の陣中に織田の紋を出さない（K360③）
  rt.scene.add(jinmaku(W, 0, 10, 18, 12, 6, { mon: MON, gapNorth: 6 }));   // K364：前（陣の口の側）にも口を開け、幕の内の上役と軍議が見えるように
  for (const [x, z] of [[-11, 2], [11, 2], [-11, 18], [11, 18], [-6, -12], [6, -12]]) rt.scene.add(kagaribi(W, x, z));
  for (const x of [-16, -11, -6, 6, 11, 16]) rt.scene.add(nobori(W, x, -9, MON, 5));
  // 陣小屋（板屋根の仮小屋）：西＝武具の修理場、東＝組の者
  rt.scene.add(hut(W, -21, -3, 7, 4.5, Math.PI / 2, { ita: true }));
  rt.scene.add(hut(W, 21, -3, 7, 4.5, -Math.PI / 2, { ita: true }));
  rt.scene.add(umatsunagi(W, 21, 12, Math.PI / 2, 8));
  // 人：本陣の上役・修理の者・組の者・火の番
  const one = (name, x, z, facing, type = 'ashigaru', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name, flag: null, invuln: true, ...o } }]);
    return g.units[0];
  };
  const bossName = ((BATTLES[G.battle] || {}).boss || '').split(/\s/).pop() || '上役';
  one(bossName, 0, 12, Math.PI, 'ashigaru', { weapon: 'none' });
  one('具足師', -17, -1.5, -Math.PI / 2, 'porter', { weapon: 'none' });
  for (let i = 0; i < 3; i++) one('組の者', 15.5 + (i % 2) * 1.4, -5 + i * 1.6, Math.PI / 2 + (i - 1) * 0.4, 'ashigaru', { hat: i % 2 ? 'hachimaki' : 'none' });
  for (const [x, z, f] of [[-9.5, 1, 0.8], [-12.5, 3, -2.2], [9.6, 1.2, -0.8], [12.4, 3.1, 2.3], [-5, -13.5, 0.4], [7.5, -13.8, -0.6]]) one('足軽', x, z, f, 'ashigaru', { weapon: 'none' });
  // 用：軍議・修理・組・馬・戦の様子・出陣
  // 武将との距離（要件書63・64）：足軽までは軍議の幕に入れず、外で待たされ、下知は組頭から聞く。足軽大将候補より上は末席に入る
  const lowRank = ladderStep(G || {}) < 2;
  rt.addInteract('jin-boss', SPOT.boss, lowRank ? `待つ　${SPOT.boss.n}の外で` : `軍議に出る　${SPOT.boss.n}`, () => {
    const F = rt.flags;
    if (!lowRank || F.bossWaited) { game.townOpen('boss'); return; }
    F.bossWaited = true;
    rt.say('番の侍', '控えよ。御大将方の話が済むまで、幕の外で待て', 3.4);
    rt.after(5, () => { if (rt.flags === F) rt.say('組頭', '済んだようじゃ。下知は、わしから伝える', 3); });
    rt.after(7.5, () => { if (rt.flags === F && !rt.over) game.townOpen('boss'); });
  }, { r: 3 });
  rt.addInteract('jin-shop', SPOT.shop, `直す　武具（${SPOT.shop.n}）`, () => game.townOpen('shop'), { r: 3 });
  rt.addInteract('jin-squad', SPOT.squad, '会う　組の者', () => townTabOpen(G, 'squad') ? game.townOpen('squad') : rt.say('組の者', '飯を食うたら、すぐ次じゃ。槍の穂先を研いでおくわい', 4), { r: 3 });
  // 兵站の暮らし（要件書57・66）：馬の給餌・休ませ・替え馬・斃れた馬、武具の繕い。見るたびに別の様子
  const UMA = [['馬方', '陣中の馬は御大将方のものじゃ。足軽は歩きよ'], ['馬方', '水と飼い葉が先じゃ。人より馬が先に飯を食う'],
    ['馬方', '脚を痛めた馬は替え馬と取り替える。替えの無い家は歩きよ'], ['馬方', '蹄が割れておる。藁の沓を履かせて休ませる'],
    ['足軽', '昨日の戦で斃れた馬じゃ。鞍だけは外して持って帰る']];
  rt.addInteract('jin-stable', SPOT.stable, '見る　馬', () => {
    const k = rt.flags.umaI = ((rt.flags.umaI ?? -1) + 1) % UMA.length;
    rt.say(UMA[k][0], UMA[k][1], 3.4);
    if (townTabOpen(G, 'stable')) { const F = rt.flags; rt.after(2.4, () => { if (rt.flags === F && !rt.over) game.townOpen('stable'); }); }
  }, { r: 3 });
  rt.addInteract('jin-news', { x: -6, z: -12 }, '聞く　戦の様子', () => rt.say('物見', J.news, 5), { r: 3 });
  // 陣中の小さな場面（要件書66）：火のそばで、聞くたびに別の話。十〜三十秒の暮らしを散らす
  const LIFE = [
    [['足軽', '城下には戻らん。ここで飯を食うて、このまま次の戦じゃ']],
    [['新参', '古参殿、槍はどこを突けばよいので'], ['古参', '腹より足じゃ。倒れたら、組の者が首を取る']],
    [['足軽', '在所の田は、もう稲刈りかのう'], ['組の者', '言うな。帰りとうなる']],
    [['鉄砲足軽', '火縄が湿った。火にかざして乾かしておる'], ['組頭', '玉薬の袋は火から離せ。陣ごと吹き飛ぶぞ']],
    [['足軽', '草鞋がもう三足目じゃ'], ['人足', '束で編んで持って来た。いくらでも履き潰せ']],
    [['組の者', '討たれた与吉の守り袋じゃ。在所の母者へ届けてやらねば'], ['組頭', '……わしが持って行こう']],
    [['足軽', '国から文が来た。字は読めんが、母者の手じゃ'], ['組の者', '読んでやる。……達者でおるとよ']],
    [['足軽', '明日の敵は、えらい数じゃと聞いたぞ'], ['組頭', '噂で槍は振れん。早う寝ろ']],
  ];
  rt.addInteract('jin-meal', { x: 6, z: -12 }, '聞く　火のそばの話', () => {
    const F = rt.flags, k = F.lifeI = ((F.lifeI ?? -1) + 1) % LIFE.length;
    LIFE[k].forEach(([who, text], i) => rt.after(i * 3.6, () => { if (rt.flags === F) rt.say(who, text, 3.4); }));
  }, { r: 3 });
  rt.addInteract('door-gate', SPOT.gate, '任務を受けて出陣する', () => game.townSortie(), { r: 3.5 });
  rt.marker('mk-boss', SPOT.boss, SPOT.boss.n);
  rt.marker('mk-gate', SPOT.gate, SPOT.gate.n);
  rt.flags.doors = { boss: SPOT.boss, shop: SPOT.shop, squad: SPOT.squad, stable: SPOT.stable, gate: SPOT.gate };
  // 戦の後の酒（要件書61・64）：同じ勝ちでも、身分で見える所が違う。足軽までは篝火のそばで組の者と、足軽大将候補より上は幕の内の末席で
  const hi = !lowRank;
  rt.addInteract('jin-sake', hi ? { x: 4, z: 4 } : { x: 12, z: -12 }, hi ? '上がる　武将の席の末席' : '飲む　組の者と', () => {
    const L = hi ? [['上役', 'よう働いた。末席じゃが、盃を受けよ'], ['侍', '上座の方々の話には、口を挟むでないぞ']]
      : [['組の者', '勝ち戦の酒じゃ。濁り酒でも旨いわい'], ['足軽', '幕の内では、殿様方が上座で盃を回しておるそうな']];
    const k = rt.flags.sakeI = ((rt.flags.sakeI ?? -1) + 1) % L.length; rt.say(L[k][0], L[k][1], 4);
  }, { r: 3 });
  if (J.drama && DRAMA[J.drama]) { DRAMA[J.drama](rt, J, one); return; }
  rt.after(1.5, () => rt.say('組頭', '城下には戻らぬ。ここが陣中じゃ。軍議の幕で次の下知を待て', 5));
}

// ======================================================================
// K364 ③ 黒田官兵衛と有岡城（drama_req_1117 14〜18）。主人公は若い兵として、出立を「普通の使い」と思って見送る。
//   帰らない日々・信長方の疑念は、使番・秀吉の様子・兵の噂で知る（神の目で有岡の中を見せない）。
//   史実の分け（docs/journey/miki.md・tottori.md の K364 の節）：村重の謀反・官兵衛が説きに有岡へ行き囚われた・一年後の落城で救われた・足が不自由になった は A。
//   言葉と見せ方は B。竹中半兵衛が松寿丸を匿った話は伝え（C）なので、兵の噂の形にとどめる。
// ======================================================================
const DRAMA = {
  // 平野の本陣（要件書56・65-29）：五月七日の朝。家康は平野から天王寺口へ、秀忠は岡山口へ（A）。真田は茶臼山（A）。
  //   主人公は陣の口から入り、使番が本陣の幕へ駆け込むのを見て（ついて行ける）、金の扇の馬印の下で下知を聞く。
  //   荷駄の人足が米俵を本陣の脇へ運び、鉄砲衆は火のそばで火縄を整え、平野の郷の衆が米を届けに来ている。言葉は B
  hirano(rt, J, one) {
    const F = rt.flags, W = rt.world;
    try {
      rt.scene.add(umajirushi(W, 4.5, 15, 0, 'ogi'));
      rt.scene.add(hatazao(W, -6, 18.5, 0, 7, 'tokugawa'));
      rt.scene.add(hyoro(W, -21, 11, Math.PI / 2));
    } catch (e) { /* 形が作れない時も話は進む */ }
    one('徳川家康', -1.5, 12.5, Math.PI, 'busho', { weapon: 'none', flag: 'tokugawa', horse: false });
    for (let i = 0; i < 3; i++) one('鉄砲足軽', -10.5 + i * 1.3, -10.8, 0.6 - i * 0.5, 'ashigaru', { weapon: 'gun' });
    one('平野の郷の者', -17.5, 7.5, -0.4, 'ashigaru', { weapon: 'none', hat: 'none' });
    // 使番：陣の口から本陣の幕へ駆け込む（三秒後）。着いたら知らせる
    const runner = allyGroup(rt, { name: '使番', anchor: { x: 1.5, z: -30 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 5 },
      [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none', flag: 'tokugawa' } }]);
    const tw = new THREE.CylinderGeometry(0.26, 0.26, 0.7, 10), twM = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 });
    const carriers = [0, 1].map((k) => {
      const g = allyGroup(rt, { name: '荷駄の人足', anchor: { x: -19 + k, z: 13 + k }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 1.5 },
        [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none', hat: k ? 'hachimaki' : 'none' } }]);
      const bale = new THREE.Mesh(tw, twM); bale.rotation.z = Math.PI / 2; rt.scene.add(bale);
      return { g, bale, from: { x: -18.5 + k * 1.2, z: 12.5 + k }, to: { x: -10.5 + k * 1.2, z: 9.5 + k * 1.4 }, go: true, wait: k * 2, full: true };
    });
    F.hirano = { runner, carriers, ran: false, told: false };
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '平野の御本陣じゃ。金の扇の馬印の下に、大御所様がおられる', 4.2);
    rt.addInteract('hirano-uma', { x: 4.5, z: 13 }, '見る　馬印', () => {
      const k = F.umaI = ((F.umaI ?? -1) + 1) % 2;
      if (k === 0) L(0, '旗本', '金の扇は大御所様の馬印。これが動けば、全軍が動く', 3.6);
      else L(0, '旗本', '今日はこの馬印を、天王寺口へ進める', 3.2);
    }, { r: 2.6 });
    rt.addInteract('hirano-gun', { x: -9.2, z: -10.8 }, '聞く　鉄砲衆', () => {
      L(0, '鉄砲足軽', '朝の露で火縄が湿る。懐で温めておけ', 3.2); L(3.6, '組頭', '茶臼山の真田は、こちらの鉄砲を待ってはくれぬぞ', 3.4);
    }, { r: 2.6 });
    rt.addInteract('hirano-sato', { x: -17.5, z: 7.5 }, '聞く　平野の郷の者', () => {
      L(0, '平野の郷の者', '郷の米を御本陣へ。戦が早う終わってくれれば、それでよい', 3.8);
    }, { r: 2.6 });
  },
  // 堀の埋め立て（要件書27・54）：冬の陣の和議の後、徳川方が惣構えの土手を崩して堀を埋め、二の丸の堀にも手を入れた（A）。
  //   「約定は外の堀だけだった」は通説なので、ここでは言わない（樫井の前の出立で兵の「と聞く」で言う）。堀の縁を歩くと、人足が土を運び、
  //   東から一間ずつ堀が埋まっていく（一区切り十二秒ほど・二分足らずで埋まり切る）。組頭・人足・大坂の町の者・組の者が一言ずつ
  horiume(rt, J, one) {
    const F = rt.flags, W = rt.world;
    const H = F.hori = { p: [1, 1, 0.35, 0, 0, 0, 0, 0], boxes: [], porters: [], t: 0, done: false };
    const segW = (HORI.x1 - HORI.x0) / HORI.segs;
    try {
      // 向こう岸の大坂の塀（白い漆喰に瓦）。門は閉じたまま
      // 惣構えらしく、瓦と狭間の漆喰の塀・櫓門・隅櫓を一つずつ（使い回し）
      rt.scene.add(dobei(W, [HORI.x0, HORI.z + 5.5, -4.2, HORI.z + 5.5], { shikkui: true, kawara: true, h: 2.8 }));
      rt.scene.add(dobei(W, [4.2, HORI.z + 5.5, HORI.x1 - 6, HORI.z + 5.5], { shikkui: true, kawara: true, h: 2.8 }));
      rt.scene.add(yaguramon(W, 0, HORI.z + 5.5, 6, 0, { inside: false, noKit: true }));   // 部品の組み（KitBatch）の白壁は、陣中では白く透けて幽霊のように見えたので、元の形で
      rt.scene.add(sumiyagura(W, HORI.x1 - 2.5, HORI.z + 6.5, { w: 6, d: 5, base: 2.2, inside: false, noKit: true }));   // 部品の組みの白壁は薄く透けて見えたので元の形で
      // 埋める土の塊（東から一区切りずつ上がる）。水は world の streams が描く
      const dirt = new THREE.MeshStandardMaterial({ color: 0x6b5434, roughness: 0.95 });
      const dirt2 = new THREE.MeshStandardMaterial({ color: 0x584530, roughness: 1 }), stoneM = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.9 });
      const tawaraM = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 });
      const moundG = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), stoneG = new THREE.DodecahedronGeometry(0.32, 0), tawaraG = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10);
      // 土の塊は堀の形（上が広く底が狭い）に合わせる。箱のままだと縁の斜面から土の壁の面が見えた
      const geo = new THREE.BoxGeometry(segW + 0.05, 2.6, (HORI.half + 0.8) * 2);
      { const P = geo.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) P.setZ(i, P.getZ(i) * (HORI.half - 0.4) / (HORI.half + 0.8)); P.needsUpdate = true; geo.computeVertexNormals(); }
      for (let i = 0; i < HORI.segs; i++) {
        const m = new THREE.Mesh(geo, dirt); m.receiveShadow = true;
        m.userData.x = HORI.x1 - segW * (i + 0.5); m.userData.g = jinBase(m.userData.x, HORI.z);
        m.position.set(m.userData.x, 0, HORI.z); rt.scene.add(m); H.boxes.push(m);
        // 落とした土の跡：上に低い土の盛り上がりと、崩した石・土を詰めた俵を混ぜる（区切りごとに少しずつ置き方を変える）
        for (let k = 0; k < 3; k++) {
          const mo = new THREE.Mesh(moundG, k === 1 ? dirt2 : dirt); mo.scale.set(1.3 + ((i + k) % 3) * 0.35, 0.28 + (k % 2) * 0.12, 1 + ((i * 2 + k) % 3) * 0.3);
          mo.position.set(-segW * 0.33 + k * segW * 0.33 + ((i * 7 + k) % 5 - 2) * 0.25, 1.3, ((i + k * 2) % 5 - 2) * 0.9); m.add(mo);
        }
        for (let k = 0; k < 2; k++) { const st = new THREE.Mesh(stoneG, stoneM); st.scale.set(1.5, 0.75, 1.2); st.position.set(((i * 3 + k * 5) % 7 - 3) * 0.9, 1.3 + 0.17, (k ? 1.4 : -1.2) + (i % 3) * 0.3); st.rotation.y = i + k; st.castShadow = true; m.add(st); }
        if (i % 2 === 0) { const tw = new THREE.Mesh(tawaraG, tawaraM); tw.rotation.z = Math.PI / 2; tw.rotation.y = i * 0.6; tw.position.set(((i * 5) % 7 - 3) * 0.7, 1.55, ((i * 3) % 5 - 2) * 0.8); tw.castShadow = true; m.add(tw); }
      }
      // 土の山（西と東）と、崩した石垣の石
      const pileM = new THREE.MeshStandardMaterial({ color: 0x5e4a30, roughness: 1 });
      for (const [x, z] of [[-14, 12.5], [14, 13]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 18), pileM); c.position.set(x, jinBase(x, z) + 0.5, z); c.castShadow = c.receiveShadow = true; rt.scene.add(c); }
      // 崩した石垣の石：角を落とした切り石（十二面体を平たく伸ばす）を地面に据えて寝かせる。色は花崗岩の灰茶
      const cutG = new THREE.DodecahedronGeometry(0.42, 0), cutM = [0x9a9384, 0x8b8577, 0xa59d8c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true }));
      for (let i = 0; i < 7; i++) {
        const x = -17.2 + (i % 4) * 0.95 + (i > 3 ? 0.45 : 0), z = 15.4 + (i > 3 ? 0.9 : 0), sy = 0.55 + (i % 3) * 0.08;
        const b = new THREE.Mesh(cutG, cutM[i % 3]); b.scale.set(1.45 + (i % 2) * 0.3, sy, 1.05); b.rotation.y = i * 0.9;
        b.position.set(x, jinBase(x, z) + 0.42 * sy * 0.8, z); b.castShadow = b.receiveShadow = true; rt.scene.add(b);
      }
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 堀の水は溜まり水：streams の水面（流れの筋と白い波）を、暗く静かな水面（弱いさざ波と空の映りだけ）の材質へ替える
    try {
      const st = (W.def.streams || [])[0];
      if (st?.mesh) {
        const old = st.mesh.material;
        const mat = rippleWater(liteMat({ color: 0x5c6a66, vertexColors: true, roughness: 0.2, metalness: 0, side: THREE.DoubleSide }), 1, 0, 0.1, W.hemi?.color || null, false, null, null, false, true);
        mat.envMapIntensity = 0.4; mat.roughness = 0.16;
        st.mesh.material = mat; old?.dispose?.();
        // 水の面の共通の作り（water_body.js）は、流れの向き（waterFlow）を持つ面を「川」として速い波と白い筋で描く。堀は流れないので向きを外す
        if (st.mesh.geometry?.attributes?.waterFlow) st.mesh.geometry.deleteAttribute('waterFlow');
      }
      // 川の作りが岸に並べる川石（丸石を低い面で作った灰色の塊）は、堀の土手には出さない（宙に浮いた灰色の角ばった塊に見えた）
      if (st?.rockMesh) st.rockMesh.visible = false;
    } catch (e) { /* 替えられない時は前の水面のまま */ }
    horiPlace(H);
    // 人足：二人一組でもっこ（縄の網に土を入れ、天秤棒を前後で担ぐ）を運び、堀の縁で土を落とす。三組（六人。重くしない）。
    //   'porter' の型と小袖の姿は骨の人にも VAT にも乗らず陣中で隠れたままだったので、得物を持たない足軽の型で描く（名は付けない）
    //   二組は東の土の山から主人公の見る縁（x 10〜16）へ、一組は西の山から西の縁へ。落とした土は堀へ落ちて消え、埋まり具合を少し進める
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 0.9 }), netM = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    const poleG = new THREE.CylinderGeometry(0.035, 0.035, 1, 6), loadG = new THREE.SphereGeometry(0.28, 10, 8);
    const mk = (pile, dump) => {
      const pair = [0, 1].map((n) => allyGroup(rt, { name: '人足', anchor: { x: pile.x + n * 1.3, z: pile.z }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 1.6 },
        [{ type: 'ashigaru', n: 1, o: { flag: null, invuln: true, weapon: 'none', hat: n ? 'hachimaki' : 'none' } }]));
      const pole = new THREE.Mesh(poleG, poleM), load = new THREE.Mesh(loadG, netM); load.scale.y = 0.8;
      rt.scene.add(pole, load);
      H.porters.push({ pair, pile, dump, toMoat: true, wait: 0, pole, load, full: true, drop: null });
    };
    mk({ x: 14 - 2.6, z: 13.6 }, { x: 13.2, z: HORI.z - HORI.half - 0.7 });
    mk({ x: 14 - 2.6, z: 12.0 }, { x: 15.8, z: HORI.z - HORI.half - 0.7 });
    mk({ x: -14 + 2.6, z: 13.4 }, { x: -13.5, z: HORI.z - HORI.half - 0.7 });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '和議が成った。大坂の堀を埋めるのは、こちらの手じゃ。北東の堀の縁へ行ってみよ', 4.6);
    one('大坂の町の者', 9.6, HORI.z - 4.4, 0.3, 'ashigaru', { weapon: 'none', hat: 'none', horse: false, vatNameOk: true });
    one('組の者', 19, HORI.z - 4.4, -0.3, 'ashigaru', { weapon: 'yari' });
    rt.addInteract('hori-see', { x: 14.5, z: HORI.z - 5.2 }, '見る　堀', () => {
      const k = F.horiSee = ((F.horiSee ?? -1) + 1) % 3;
      if (k === 0) { L(0, '人足', '惣構えの土手を崩して、その土を入れておる', 3.4); L(3.8, '組頭', '石垣の石も落として沈めよ、との御下知じゃ', 3.4); }
      else if (k === 1) L(0, '人足', '一日で一町ずつ平らになる。大坂の堀も、こうなれば溝よ', 3.6);
      else L(0, '組頭', '堀が無ければ、この城はもう城ではない', 3.2);
    }, { r: 3 });
    rt.addInteract('hori-town', { x: 9.6, z: HORI.z - 4.4 }, '聞く　大坂の町の者', () => {
      const k = F.horiTown = ((F.horiTown ?? -1) + 1) % 2;
      if (k === 0) L(0, '大坂の町の者', '堀が無うなったら、この町は城の内か外か、もう分からぬのう', 3.8);
      else L(0, '大坂の町の者', '戦が終わったと喜んだが……城の方々は、皆黙っておられる', 3.8);
    }, { r: 2.6 });
    rt.addInteract('hori-kumi', { x: 19, z: HORI.z - 4.4 }, '聞く　組の者', () => {
      L(0, '組の者', '大坂方の侍が、塀の上から黙って見ておる', 3.2); L(3.6, '足軽', '城の守りが、日に日に薄うなる', 2.8);
    }, { r: 2.6 });
  },
  // 茶の席（要件書60）：利休が点て、秀吉と家康が座る。足軽までは茶室の外で「誰が呼ばれたか」だけを聞く。足軽大将候補より上は末席から見る
  //   史実の分け：小田原の陣に利休がおり、秀吉が陣中で茶を催した・伊達政宗は遅れて着き、すぐには会われなかった は A。席の顔ぶれと言葉は B
  chanoyu(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world, C = { x: -20, z: 16 };   // 幕の外の西（幕と重ねない）
    try { rt.scene.add(hut(W, C.x, C.z, 5, 4.5, Math.PI / 2, { ita: true })); } catch (e) { /* 茶室の形なしでも進む */ }
    const ko = (col, o = {}) => ({ kosode: 1, kosodeCol: col, hat: 'none', haori: null, armor: col, lace: 0x2a2622, cloth: col, horse: false, ...o });
    one('千利休', C.x + 3.4, C.z - 1.2, Math.PI / 2, 'porter', ko(0x2a2622, { bozu: 1 }));
    one('豊臣秀吉', C.x + 3.4, C.z + 1.4, -Math.PI / 2 + 0.3, 'samurai', ko(0x7a4a2a));
    one('徳川家康', C.x + 5.2, C.z + 0.2, -Math.PI / 2, 'samurai', ko(0x3a3a2c));
    one(null, C.x + 6.6, C.z - 3, Math.PI, 'ashigaru', { weapon: 'yari' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '早雲寺の御本陣じゃ。……あの小さな庵が、殿下の茶の席よ', 4));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '千利休', '……どうぞ', 2.4);
        L(3, '豊臣秀吉', '北条の城を囲んだまま茶を飲む。これも戦よ', 3.2);
        L(7, '徳川家康', 'まことに', 2.2);
        L(10, '組頭', '（末席の者は、口を開かぬものじゃ）', 3);
        L(14, '豊臣秀吉', '伊達の若造は、まだ箱根の手前で待たせておけ', 3.4);
      } else {
        L(0, '番の侍', '茶の席じゃ。呼ばれた方しか入れぬ', 2.8);
        L(3.6, '組の者', '今日は徳川様が呼ばれたそうな。呼ばれた者と呼ばれぬ者で、もう格が決まる', 4);
        L(8.4, '足軽', '奥州の伊達様は遅れて来て、まだ会うてもらえぬと聞く', 3.4);
      }
    };
    rt.after(12, go);
    rt.addInteract('jin-cha', { x: C.x + 6, z: C.z - 1 }, inner ? '上がる　茶の席の末席' : '見る　茶の席', go, { r: 4, prio: 2 });
  },
  kanbeiGo(rt, J, one) {
    const F = rt.flags, kan = allyGroup(rt, { name: '黒田の主従', noRetinue: true, anchor: { x: 3, z: 10 }, facing: Math.PI, order: 'hold', noRout: true, width: 2, formation: 'column', aggro: 0, seekRange: 0, fixed: true, speed: 3 },
      [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', flag: 'kuroda', invuln: true, horse: true } }, { type: 'samurai', n: 2, o: { flag: 'kuroda', invuln: true, keep: true } }]);
    for (const u of kan.units) { u.invuln = true; u.noTarget = true; }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '平井山の御陣じゃ。軍議の幕の前で、下知を待て', 4));
    F.kgStep = 0;
    const go = () => {
      if (F.kgStep) return; F.kgStep = 1;
      L(0, '羽柴秀吉', '摂津の荒木殿が上様に背いた。誰ぞ、説きに行く者はおらぬか');
      L(4.5, '黒田官兵衛', '私が行きます。荒木殿とは知らぬ仲ではない。言葉で戻してみせまする');
      L(9.5, '羽柴秀吉', '頼む。……無理はするな', 3);
      rt.after(12.5, () => { if (rt.flags !== F) return; kan.fixed = false; kan.order = 'move'; kan.dest = { x: 0, z: -44 }; kan.speed = 2.4; kan.onArrive = (g) => { for (const u of g.units) if (u.alive) rt.army.despawn(u); }; });
      L(15, '組の者', '軍師殿じゃ。使いなら、すぐに戻られよう', 3.2);
      // 日が過ぎる（暗転）。官兵衛は戻らない
      rt.after(22, () => { if (rt.flags === F) rt.scene.visible = false; });
      rt.after(23.4, () => {
        if (rt.flags !== F) return;
        rt.scene.visible = true;
        rt.banner('ひと月の後', '官兵衛殿は、まだ戻らぬ');
        for (const u of kan.units) if (u.alive && !u.gone) rt.army.despawn(u);
      });
      L(26, '足軽', '官兵衛殿が戻らぬ。……どうなされたのじゃ', 3);
      L(30.5, '物見', '有岡の城に捕らわれた、と聞いた。……いや、荒木に付いた、とも', 3.6);
      L(35.5, '使番', '安土より。上様は、黒田は荒木に付いた、と仰せにござる', 3.6);
      L(40.5, '羽柴秀吉', '……官兵衛が、裏切るものか', 3.2);
      L(45, '組頭', '人質の御子は、どうなる……。さあ、支度をせよ。三木の城が先じゃ', 4);
    };
    // 軍議の幕の前に来るか、少し歩いたら始まる
    rt.after(10, go);
    rt.addInteract('jin-kanbei', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  kanbeiBack(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    // 戻った官兵衛：杖を突き、従者に支えられて幕の前をゆっくり歩く（土牢の一年で足を悪くした）
    const kan = allyGroup(rt, { name: '黒田の主従', noRetinue: true, anchor: { x: -12, z: -3 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 2, formation: 'column', aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', flag: 'kuroda', invuln: true, horse: false, weapon: 'none', hat: 'hachimaki' } }, { type: 'samurai', n: 1, o: { flag: 'kuroda', invuln: true, keep: true, weapon: 'none' } }]);
    for (const u of kan.units) { u.invuln = true; u.noTarget = true; }
    rt.after(1.5, () => rt.say('組頭', '太閤ヶ平の御陣じゃ。……幕の前を見よ。黒田官兵衛殿じゃ', 4));
    rt.after(3, () => { if (rt.flags !== F) return; kan.fixed = false; kan.order = 'move'; kan.dest = { x: 9, z: -3 }; kan.speed = 0.55; kan.onArrive = (g) => { g.order = 'hold'; }; });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(7, '足軽', 'あれが官兵衛殿か……足を引いておられる', 3);
    L(11.5, '組の者', '有岡の土牢に一年じゃ。頭も膝も、もう元には戻らぬそうな', 3.6);
    if (inner) {
      L(17, '黒田官兵衛', '……城の中の者が何を食うておるか、わしはよう知っておる', 3.6);
      L(23.5, '黒田官兵衛', 'それでも、鳥取は兵糧で落とす。槍で死なせるより、早う開かせる', 3.8);
    } else {
      L(17, '組頭', '軍師殿は、前より口数が少のうなられた', 3.2);
    }
    L(inner ? 28 : 23, '足軽', '竹中様が、官兵衛殿の御子を匿うておられた、と噂じゃ。……竹中様はもう亡い', 4);
  },
};

// ======================================================================
// K364 ② 清洲会議（天正十年六月二十七日・尾張 清洲城）。drama_req_1117 19〜23。
//   足軽まで：評定の間には入れず、庭と縁から武将の出入りと声だけ。足軽大将候補より上：評定の座に控えて聞く。
//   座って話しているだけなのに張り詰める。済むと秀吉と勝家が廊下から別々の方へ歩き去る（もう同じ側ではない）。
//   史実の分け（docs/journey/t02_shizugatake.md の K364 の節）：跡目＝三法師・長浜は勝家へ・山城と丹波は秀吉へ は A。
//   勝家が信孝を推した形は通説（B）。言葉はゲームの再構成（B）。秀吉が三法師を抱いて現れた話は軍記の伝え（C）なので入れない。
// ======================================================================
const KY = { room: { x: 0, z: 10, w: 14, d: 10 }, door: { x: 0, z: 4.2 }, gate: { x: 0, z: -27 }, shop: { x: -17, z: -3 } };
function buildKiyosu(rt, J) {
  const game = rt.game, G = rt.G, F = rt.flags;
  const inner = F.kyInner = ladderStep(G || {}) >= 2;
  try { F.kyRoom = buildRoom(rt, KY.room.x, KY.room.z, { w: KY.room.w, d: KY.room.d, council: true, rot: Math.PI }); } catch (e) { F.kyRoom = null; }
  for (const [x, z] of [[-9, 2], [9, 2], [-6, -12], [6, -12]]) rt.scene.add(kagaribi(W0(rt), x, z));
  // 城の出入りの口：冠木門と白壁の土塀（野原に印だけが浮かないように。門は開けたまま、通り道は塞がない）
  try {
    const W = W0(rt), gz = KY.gate.z;
    rt.scene.add(kabukimon(W, KY.gate.x, gz, 5, 0, { doors: false }));
    for (const seg of [[-34, gz, -3.2, gz], [3.2, gz, 34, gz]]) rt.scene.add(dobei(W, seg, { shikkui: true, kawara: true }));
  } catch (e) { /* 門なしでも進む */ }
  const one = (name, x, z, facing, type = 'busho', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name: name || undefined, flag: null, invuln: true, weapon: 'none', horse: false, ...o } }]);
    return g;
  };
  // 評定の座：上座に三法師（幼い。言葉は無い）、左右に向き合う四人の宿老
  const R = KY.room;
  F.kySanbo = one('三法師', R.x, R.z + 3.4, Math.PI, 'porter', { hat: 'none', kosode: 1, kosodeCol: 0x8a2a24, haori: null, mon: null });
  try { for (const u of F.kySanbo.units) u.mesh?.scale.setScalar(0.62); } catch (e) { /* そのままの丈でも進む */ }
  // 城の中の評定は甲冑でなく小袖・袴の姿（要件書62。色は家ごとに分けるだけで、細かな服飾は考証の前の仮）
  const ko = (col) => ({ kosode: 1, kosodeCol: col, hat: 'none', haori: null, armor: col, lace: 0x2a2622, cloth: col });
  F.kyHide = one('羽柴秀吉', R.x - 2.6, R.z + 0.6, Math.PI / 2, 'samurai', ko(0x7a4a2a));
  F.kyShiba = one('柴田勝家', R.x + 2.6, R.z + 0.6, -Math.PI / 2, 'samurai', ko(0x2a2c36));
  one('丹羽長秀', R.x - 2.6, R.z + 2.4, Math.PI / 2, 'samurai', ko(0x3e4a36));
  one('池田恒興', R.x + 2.6, R.z + 2.4, -Math.PI / 2, 'samurai', ko(0x5a4a30));
  // 庭：西に羽柴の家来、東に柴田の家来。互いに目を合わせない
  F.kyHa = allyGroup(rt, { name: '羽柴の家来', anchor: { x: -9, z: -2 }, facing: Math.PI / 2, width: 4, formation: 'line', order: 'hold', noRout: true, aggro: 0, seekRange: 0, fixed: true },
    [{ type: 'samurai', n: 4, o: { flag: 'toyotomi', invuln: true, keep: true } }]);
  F.kySb = allyGroup(rt, { name: '柴田の家来', anchor: { x: 9, z: -2 }, facing: -Math.PI / 2, width: 4, formation: 'line', order: 'hold', noRout: true, aggro: 0, seekRange: 0, fixed: true },
    [{ type: 'samurai', n: 4, o: { flag: 'kari', invuln: true, keep: true } }]);
  // 戸口の番士（名札は出さない。声だけ「番士」）
  F.kyBan = [one(null, KY.door.x - 1.8, KY.door.z - 0.6, Math.PI, 'ashigaru', { weapon: 'yari' }), one(null, KY.door.x + 1.8, KY.door.z - 0.6, Math.PI, 'ashigaru', { weapon: 'yari' })];
  for (const g of [F.kyHa, F.kySb]) for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  rt.addInteract('jin-shop', KY.shop, '直す　武具（具足師）', () => game.townOpen('shop'), { r: 3 });
  one('具足師', KY.shop.x, KY.shop.z + 1.5, -Math.PI / 2, 'porter');
  rt.addInteract('jin-news', { x: -6, z: -12 }, '聞く　城の噂', () => {
    // 山崎の後の京（要件書42）：明智の残党狩り・安土の城が焼けた（A）・信長亡き後の空白（B）も噂で
    const N = ['京では明智の残りの者が狩られておる。安土の御城も焼けたそうな', '上様も中将様も亡うなられて、誰が天下を見るのか、皆が様子をうかがっておる', '柴田様は越前へ戻られた。長浜の城は甥御の勝豊様の手じゃ', '岐阜の信孝様も、三法師様を手放されぬそうな', '冬になれば越前は雪で道が閉じる。柴田様は春まで動けまい'];
    const i = F.kyNews || 0; F.kyNews = i + 1; rt.say('城の者', N[i % N.length], 5);
  }, { r: 3 });
  rt.addInteract('door-gate', KY.gate, '任務を受けて出陣する', () => game.townSortie(), { r: 3.5 });
  rt.marker('mk-boss', KY.door, inner ? '評定の間' : '評定の間の縁');
  rt.marker('mk-gate', KY.gate, '出陣の口');
  rt.flags.doors = { boss: KY.door, shop: KY.shop, gate: KY.gate };
  F.kyStep = 0;
  rt.after(1.5, () => rt.say('組頭', inner ? '清洲の御城じゃ。上様の御跡目を決める評定に、お主も控えよとの仰せじゃ'
    : '清洲の御城じゃ。上様の御跡目を決める評定があるそうな。足軽は庭までじゃぞ', 5));
}
function W0(rt) { return rt.world; }
function kyAfter(rt, sec, fn) { const F = rt.flags; rt.after(sec, () => { if (rt.flags === F && !rt.over) fn(); }); }
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
// 堀の土の塊を、埋まり具合（0＝空・1＝地面の高さ）の所へ置く
function horiPlace(H) {
  H.boxes.forEach((m, i) => { const p = H.p[i]; m.visible = p > 0.01; m.position.y = m.userData.g - 0.08 - (1 - p) * 2.3 - 1.3; });
}
function horiTick(rt, dt) {
  const H = rt.flags.hori;
  if (!H) return;
  H.t += dt;
  const k = H.p.findIndex((p) => p < 1);
  if (k >= 0) { H.p[k] = Math.min(1, H.p[k] + dt / 12); horiPlace(H); }
  else if (!H.done) { H.done = true; rt.say('組頭', '外の堀は平らになった。次は、城から打って出るしかあるまい', 4); }
  // 人足：二人で前後にもっこを担ぎ、土の山と堀の縁を行き来する。縁で一息置いて土を落とす
  for (const q of H.porters) {
    const [a, b] = q.pair.map((g) => g.units[0]);
    if (!a || !b || !a.alive || !b.alive) continue;
    const to = q.toMoat ? q.dump : q.pile;
    const dx = to.x - a.pos.x, dz = to.z - a.pos.z, dd = Math.hypot(dx, dz) || 1;
    if (q.wait > 0) {
      q.wait -= dt;
      if (q.wait <= 0) { q.toMoat = !q.toMoat; if (!q.toMoat) { q.full = false; } else q.full = true; }
    } else if (dd < 1.2) {
      q.wait = q.toMoat ? 1.6 : 1.2;
      // 縁に着いたら土を堀へ落とす（落ちて消える。区切りの埋まりを少し進める）
      if (q.toMoat && q.full) { q.drop = { y: 0, vy: 0, x: q.load.position.x, z: q.load.position.z + 1.2 }; const k = H.p.findIndex((p) => p < 1); if (k >= 0) H.p[k] = Math.min(1, H.p[k] + 0.04); }
    } else {
      // 前の者は行き先へ、後ろの者は一メートル半あとを付いて行く
      const ux = dx / dd, uz = dz / dd;
      for (const [g, back] of [[q.pair[0], 0], [q.pair[1], 1.5]]) {
        const d2 = { x: to.x - ux * back, z: to.z - uz * back };
        if (g.order !== 'move' || !g.dest || Math.abs(g.dest.x - d2.x) + Math.abs(g.dest.z - d2.z) > 0.6) { g.order = 'move'; g.dest = d2; g.anchor = { ...d2 }; }
      }
    }
    // 天秤棒と網：二人の肩の間に渡し、網は真ん中に下げる
    const sy = 1.42, mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2, my = (a.pos.y + b.pos.y) / 2 + sy;
    // 二人の間が離れた時（曲がり角）も、棒は二メートル足らずに留め、前の者の側へ寄せる
    const L = Math.min(1.9, Math.max(0.6, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)));
    q.pole.position.set(mx, my, mz); q.pole.scale.set(1, L + 0.4, 1);
    q.pole.quaternion.setFromUnitVectors(_up, _dir.set(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z).normalize());
    // 担ぐ二人のどちらかがカメラの前で消えている時（味方を透かす決まり）は、棒と網も出さない（宙に棒だけが浮いた）
    const seen = a.mesh.visible && b.mesh.visible;
    q.pole.visible = seen;
    q.load.visible = seen && q.full; q.load.position.set(mx, my - 0.45, mz);
    if (q.drop) {
      const D = q.drop; D.vy -= 9.8 * dt; D.y += D.vy * dt;
      if (!q.dropM) { q.dropM = q.load.clone(); rt.scene.add(q.dropM); }
      q.dropM.visible = true; q.dropM.position.set(D.x, my - 0.45 + D.y, D.z);
      if (D.y < -2.6) { q.dropM.visible = false; q.drop = null; }
    }
  }
}
// 平野の本陣：使番を本陣の幕へ走らせ、着いたら知らせる。荷駄の人足は米俵を担いで置き場と本陣の脇を行き来する
function hiranoTick(rt, dt) {
  const H = rt.flags.hirano;
  if (!H) return;
  const F = rt.flags, r = H.runner, u = r.units[0];
  if (!H.ran && rt.t > 3) { H.ran = true; r.order = 'move'; r.dest = { x: 1.5, z: 6.5 }; r.anchor = { ...r.dest }; }
  if (H.ran && !H.told && u && Math.hypot(u.pos.x - 1.5, u.pos.z - 6.5) < 1.6) {
    H.told = true;
    rt.say('使番', '申し上げます！茶臼山に真田、赤備えで陣を据えた由！', 3.6);
    rt.after(4, () => { if (rt.flags === F && !rt.over) rt.say('徳川家康', '……天王寺口へ出る。将軍には岡山口を固めよと伝えよ', 4); });
    rt.after(8.5, () => { if (rt.flags === F && !rt.over) rt.say('組頭', '今日で終わる戦じゃ。手柄を焦って抜け駆けするなよ', 3.6); });
  }
  for (const c of H.carriers) {
    const v = c.g.units[0];
    if (!v || !v.alive) continue;
    const to = c.go ? c.to : c.from;
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { c.go = !c.go; c.full = c.go; } }
    else if (Math.hypot(v.pos.x - to.x, v.pos.z - to.z) < 1.1) c.wait = 1.4;
    else if (c.g.order !== 'move' || !c.g.dest || c.g.dest.x !== to.x || c.g.dest.z !== to.z) { c.g.order = 'move'; c.g.dest = to; c.g.anchor = { ...to }; }
    c.bale.visible = c.full && v.mesh.visible;
    c.bale.position.set(v.pos.x, v.pos.y + 1.62, v.pos.z);
    c.bale.rotation.y = v.heading || 0;
  }
}
function kiyosuTick(rt, dt) {
  const F = rt.flags, P = rt.player?.u?.pos, R = KY.room;
  // 宿老が戸口を通る間、番士は片膝をついて頭を下げる（要件書63）。今ある屈みの姿（_crouch。伏見の元忠の床几と同じ）を使う
  if (F.kyBowT > 0) {
    F.kyBowT -= dt;
    const on = F.kyBowT > 0;
    for (const g of F.kyBan || []) for (const u of g.units) u._crouch = on;
  }
  if (!P || F.kyStep === undefined) return;
  // 足軽は評定の間へ上がれない（戸口の手前で止める）
  if (!F.kyInner && Math.abs(P.x - R.x) < R.w / 2 + 0.4 && P.z > KY.door.z - 0.8 && P.z < R.z + R.d / 2 + 0.5) {
    P.z = KY.door.z - 0.8; rt.player.u.mesh?.position.copy(P);
    if (!F.kyBlockT || rt.t - F.kyBlockT > 15) { F.kyBlockT = rt.t; rt.say('番士', '足軽はここより先へは上がれぬ。縁の下に控えよ', 3); }
  }
  if (F.kyStep === 0 && Math.hypot(P.x - KY.door.x, P.z - KY.door.z) < (F.kyInner ? 4 : 7)) { F.kyStep = 1; kiyosuTalk(rt); }
}
function kiyosuTalk(rt) {
  const F = rt.flags, inner = F.kyInner;
  // 声：内にいれば顔を見て、外にいれば声だけ（同じ言葉の一部しか聞こえない）
  const L = inner ? [
    [0, '番士', '御着座を。声を立てるな'],
    [3.5, '柴田勝家', '上様の御跡は、三七殿（信孝）が継がれるのが道理であろう'],
    [8.5, '羽柴秀吉', '筋目から申せば、中将様（信忠）の御子、三法師様にござる'],
    [13.5, '柴田勝家', '三法師様は、まだ三つぞ'],
    [18, '丹羽長秀', '…………筋目は、三法師様じゃな'],
    [22.5, '池田恒興', 'わしも、それでよい'],
    [26.5, '丹羽長秀', '長浜の城は柴田殿へ。山城と丹波は羽柴殿へ'],
    [31, '柴田勝家', '……さようか'],
  ] : [
    [0, '組の者', '……評定の間から、声がする'],
    [5, '柴田勝家', '――信孝が継がれるのが道理であろう！'],
    [10.5, '羽柴秀吉', '――筋目から申せば、三法師様にござる'],
    [16, '組の者', '……声が止んだ。誰も口を開かん'],
    [22, '組頭', '決まったようじゃ。……柴田様の顔を見よ'],
  ];
  for (const [t, who, text] of L) kyAfter(rt, t, () => rt.say(who, text, 3.6));
  // 評定が済む：秀吉は西へ、勝家は東へ。秀吉が呼んでも勝家は振り返らない
  kyAfter(rt, inner ? 35 : 27, () => {
    F.kyStep = 2;
    // 座から戸口へ出て（壁を抜けない）、縁の先で左右へ分かれる。家来がそれぞれの主の後ろに付く
    const go = (g, home, side, dest) => {
      if (!g) return;
      const way = [{ x: side * 0.7, z: KY.room.z }, { x: side * 0.5, z: KY.door.z - 1.5 }, dest];
      const step = (q) => {
        const p = way.shift();
        q.order = p ? 'move' : 'hold'; q.dest = p || null; q.onArrive = p ? step : null;
        if (p !== dest) return;
        if (home) { home.fixed = false; home.order = 'move'; home.dest = { x: dest.x, z: dest.z - 3 }; home.speed = 1.4; }
      };
      g.fixed = false; g.speed = 1.4; step(g);
    };
    F.kyBowT = 5;
    go(F.kyHide, F.kyHa, -1, { x: -30, z: -6 });
    go(F.kyShiba, F.kySb, 1, { x: 30, z: -6 });
    rt.unmark('mk-boss');
  });
  kyAfter(rt, inner ? 39 : 31, () => rt.say('羽柴秀吉', '柴田殿！　……また、いずれ', 3));
  kyAfter(rt, inner ? 43 : 35, () => rt.say('組頭', '振り返られなんだ。……あのお二人、もう同じ道は歩かれまい', 4));
  kyAfter(rt, inner ? 49 : 41, () => { F.kyStep = 3; rt.say('組頭', '支度をせよ。いずれ、近江で柴田様と槍を合わせる日が来る', 4); rt.marker('mk-gate', KY.gate, '出陣の口'); });
}
