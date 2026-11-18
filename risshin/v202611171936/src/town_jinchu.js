// ======================================================================
// 陣中（遠征中の拠点）（K308 要件8〜11・95）
// 遠征の途中で次の戦へ続く時は、本拠地の城下へ戻さず、陣中に戻る。城下より小さく簡素：
//   本陣の幕（軍議）・武具の修理・組の者・馬・戦の様子・出陣の口だけ。字は出さず、言葉は台詞で。
// どの戦の前が陣中かは「次の戦の id」で引く（state.js の ODA_LINE。直前の戦と同じ遠征の続きだけ）。
// ======================================================================
import { jinmaku, kagaribi, hut, nobori, umatsunagi, kabukimon, dobei } from './props.js';
import { allyGroup } from './bhelp.js';
import { BATTLES, scenarioKey, ladderStep } from './state.js';
import { seasonOf } from './oda_town.js';
import { townTabOpen } from './town_unlock.js';
import { buildRoom } from './interior_parts.js';

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

export function jinchuDef(game, J) {
  const season = seasonOf(J.when);
  const def = {
    town: true, jinchu: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    title: J.place, info: { place: J.place, when: J.when }, year: Number((J.when.match(/\d{4}/) || [])[0] || 0), faction: 'oda',
    place: J.place, when: J.when, season,
    spawn: { x: 0, z: -21, heading: 0 },
    world: {
      seed: 1570 + J.id.length, time: 'day', clearAir: true, mood: 'plain',
      height: (x, z) => 0.5 * Math.sin(x * 0.031) + 0.4 * Math.cos(z * 0.027) + Math.max(0, z - 30) * 0.12,
      clear: (x, z) => Math.abs(x) < 32 && z > -34 && z < 26,
      trees: 160, tufts: 1800, rocks: 40, paths: [[[0, -40], [0, 2]]],
      autumn: season === '秋', winter: season === '冬', young: season === '春' || season === '夏', muddy: 0.25,
      groves: [[-60, 30, 24], [60, 34, 26], [-55, -40, 20], [58, -36, 20]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
    },
    setup(rt) {
      // 陣中には戦が無いので血の跡を置かない（11/18：支度の中で原点の手前に血だまりが二枚置かれ、主人公が近づくと赤い染みに見えた）
      rt.army.hideBlood = true;
      for (const t of [0.2, 2, 6]) rt.after(t, () => { try { rt.army.disposeStains?.(); } catch (e) { /* 跡が無い時はそのまま */ } });
      (J.drama === 'kiyosu' ? buildKiyosu : buildJinchu)(rt, J); const dl = document.getElementById('dateline'); if (dl) dl.textContent = J.when; },
    update(rt, dt) { if (J.drama === 'kiyosu') kiyosuTick(rt, dt); },
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
