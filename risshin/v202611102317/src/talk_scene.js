// 戦の前と後の会話の場面。背景＝その戦を3Dで撮った絵（assets/story。kaito 11/3 AP 1）、右＝話す人の上半身（ゲームの3D）、下＝名札と台詞の枠。
// 押すと次の言葉。右上「とばす」。二度目からは短く（最初の一言だけ）。絵は一枚を使い回し、戦の読み込みと重ねない。
import { storyShot } from './illust.js';
const TALK_NO_BG = new Set(['mikatagahara', 'moribe', 'echizen', 'okawachi']);
const thumbURL = (id) => storyShot(String(id).replace(/_shisha$/, ''));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 戦ごとの会話：[前の話し手, [台詞...], 後の話し手, [台詞...]]。史実に合わせた遊びの中の会話
const G0 = '組頭 源八', T = '木下藤吉郎', H = '羽柴秀吉', N = '織田信長', S = '柴田勝家', A = '明智光秀';
export const TALKS = {
  // 初陣は会話で止めず、実戦のピン・敵の赤い▼・任務の一行へつなぐ。
  inou: [G0, [], G0, ['よう働いた。美作守は殿が自ら突き伏せられたぞ。', '討たれた者も同じ織田の家中じゃ。浮かれるな。']],
  okehazama: [G0, ['雨が降り出した。敵は田楽狭間で休んでおる。', '殿が前へ出られる。遅れるな。'], G0, ['義元公を討ち取ったぞ！', 'お主の槍も見ておった。手柄じゃ。']],
  moribe: [G0, ['斎藤勢が墨俣から森部へ出た。雨の楡俣川を渡って懸かるぞ。', '長井・日比野の旗本へ槍を入れよ。組を離すな。'], G0, ['長井も日比野も討たれた。お主も旗本へよく攻め入ったな。', '美濃はまだ遠い。だが一歩進んだ。']],
  sunomata: [T, ['一夜で砦を築く。人の手が足りぬ。', '敵が来る前に柵を立てよ。守り切れば手柄じゃ。'], T, ['砦は守り抜いたぞ。', 'お主、わしの下で働かぬか。']],
  inabayama: [T, ['町を焼いて城を裸にする。七曲りを登って木戸へ入るぞ。', '本丸の小屋に合図の火を上げるのは、わしらの手じゃ。'], T, ['稲葉山を落としたぞ。', '殿はここを岐阜と名づけられる。']],
  // 箕作（信長公記）：申の刻から攻めかかり、夜に入って落とす。始まりは昼なので「夜のうちに攻める」とは言わない（11/6 fixc0833）
  mitsukuri: [T, ['申の刻より箕作へかかる。昼で落ちねば夜も攻め続けるぞ。', '日が暮れたら松明を多く灯して攻め上れ。'], T, ['一夜で落ちたな。観音寺の城も逃げ出したぞ。', 'よう付いてきた。']],
  okawachi: ['丹羽長秀', ['大河内の城は固い。急がず囲め。', '兵糧を断つ。柵を守るのが務めじゃ。'], '丹羽長秀', ['北畠は降った。殿の二男が跡を継ぐ。', '長い囲みをよう耐えた。']],
  // 11/7 fixc0422（時代考証）：信長は家臣の口で「上様」、殿は殿（しんがり）だけ（戦の中の呼び分けと揃える）
  kanegasaki: [T, ['浅井が背いた。上様は先に朽木へ退かれる。', 'わしらが殿じゃ。若狭への道まで朝倉を止める。'], T, ['生きて戻ったか。それが何よりじゃ。', '上様も無事に京へ着かれたぞ。']],
  // 11/6 fixc（kaito 三1）：札の「下知があるまで渡らず岸で受け止める」と逆の「川を渡れ」を言わない
  anegawa: ['森可成', ['姉川を挟んで浅井・朝倉と向き合う。西は徳川殿じゃ。', '渡って来る浅井を、この岸で受け止めよ。'], '森可成', ['勝ったぞ。川が血に染まった。', '手柄は確かに見た。']],
  nodafukushima: ['前田利家', ['三好の野田・福島の砦を囲む。', '堤の井楼に登り、塀の内へ撃ち込め。'], '前田利家', ['砦は落とせず、囲みを解いた。よう戻った。', '浅井・朝倉が京へ迫る。次は近江じゃ。']],
  shiga: ['森可成', ['上様は摂津で三好と戦っておられる。浅井・朝倉を坂本で止め、京への道を守る。', 'お主はわしの手じゃ。坂本の町口で先手を受けよ。大軍が寄せたら退きの鉦に従い、宇佐山城の木戸を守れ。'], '武藤五郎右衛門', ['城は守った。……森殿は討死された。', 'お主は生き残った。それを忘れるな。']],
  hieizan: [A, ['山を囲み、僧兵の逃げ道を断つ。', '殿の命じゃ。ためらうな。'], A, ['山は焼かれた。', 'わしの胸にも重い。言うまいぞ。']],
  mikatagahara: ['平手汎秀', ['徳川殿の加勢に来た。武田の本隊と当たる。', '無理はするな。退き時を見よ。'], '佐久間信盛', ['……平手殿は討死された。戻らぬ者も多い。', '徳川殿も浜松へ戻られた。傷ついた者を助けよ。']],
  tonezaka: [S, ['朝倉が敗走する。追え。', '逃がすな。刀根坂で首を挙げよ。'], S, ['朝倉は崩れた。よう追った。', '次は小谷じゃ。']],
  odani: [H, ['小谷の城を攻める。お市の方様をお救いする。', '京極丸を落とせば本丸は目の前じゃ。'], H, ['小谷は落ちた。備前守殿は自害された。', 'お市の方様と姫君は、ご無事じゃ。']],
  // 七月の包囲から始まる構成に合わせ、九月の降伏を先に告げない。
  nagashima: [S, ['上様は三方から長島を囲まれる。川は九鬼の船が塞ぐ。', 'まず堤へ上がり、輪中と門徒の砦を見よ。堤伝いに砦と舟着場を押さえよ。'], S, ['大隅守殿も孫十郎殿も、斬り込みで討たれた。', '中江も屋長島も焼け落ち、二万が死んだ。忘れるでないぞ。']],
  // 11/6 fixc1721：総大将は一キロ西の茶臼山。柵の組頭へ下知するのは鉄砲奉行の前田利家（信長公記の五人の奉行の一人）。「騎馬の突撃」の通説は言わせない
  shitaragahara: ['前田利家', ['武田勢が連吾川の向こうに出た。柵からは出るな。', '鉄砲は寄せ手を引き付けてから放つ。槍は柵の口を守れ。'], '前田利家', ['武田の宿将が次々に討たれ、勝頼は退いた。', 'よう柵の口を守った。']],
  echizen: ['丹羽長秀', ['越前の一向一揆を討つ。木ノ芽峠を越えるぞ。', '風雨じゃ。足元と火縄の湿りに気を付けよ。'], '丹羽長秀', ['峠は開いた。一揆勢は府中へ落ちた。', 'よう付いてきた。']],
  echizen_ikko: ['滝川一益', ['府中は昨夜落ちた。一揆は山へ散った。', '上様の御下知じゃ。山へ逃げた者を狩り出せ。', '大滝寺の衆徒が門を閉じて籠っておる。', '竹束で矢玉を防ぎ、惣門から破れ。'], '滝川一益', ['寺は焼けた。奥の院の者も狩り出した。', '山にはまだ残りがおる。府中の衆と狩り続けよ。']],
  iwamura: ['織田信忠', ['岩村の城を囲む。山の上じゃ。', '水の手を断てば、城は落ちる。'], '織田信忠', ['城は降った。', '武田との戦はまだ続く。']],
  tennoji: ['明智光秀', ['原田殿は木津で討死。本願寺勢が砦へ来る。', '南の門を守れ。鉄砲の的になるな。'], '明智光秀', ['危ういところであった。殿が自ら駆けつけられた。', '生きて戻れたのは運じゃ。']],
  // 11/6 fixc1753：山手の先手を率いたのは堀秀政（信長公記巻十）。秀吉は同じ山手の別の手
  saika: ['堀秀政', ['雑賀の者は小雑賀川の岸に柵を結い、高い岸から鉄砲で待っておる。', '川底の杭を抜いて、中央の口から渡る。わしの先手に続け。'], '堀秀政', ['あの高岸は越えられなんだ。雑賀は誓紙を出したが、勝ち戦とは言えぬ。', '鉄砲の恐ろしさ、身にしみたろう。']],
  // 11/6 critic60：七尾落城の報せと、川を背に退く夜を開幕で言う。締めは負け戦（上杉が戦場を制し、勝家は兵を残して退く）。
  tedorigawa: [S, ['羽柴秀吉は先に無断で帰陣した。今宵はあの手を頼れぬ。', '七尾の城はもう落ちた。救う城が無うなった。', '上杉謙信が南へ来ておる。手取川を背にして退くぞ。', '殿の火で追手を止め、浅瀬を渡れ。'], S, ['手取川は謙信公に取られた。', '御幸塚と大聖寺に兵を残して、退く。', '生きて渡った。それが今宵の手柄じゃ。']],
  shigisan: ['織田信忠', ['松永久秀が信貴山城に籠もった。', '今宵、諸口から夜攻めじゃ。筒井の先手と尾根を登れ。'], '織田信忠', ['久秀は天主に火をかけて果てた。', '信貴山の城は落ちた。']],
  kizugawa: ['九鬼嘉隆', ['木津川口で毛利水軍を迎え撃つ。', '焙烙火矢に気をつけよ。大筒で返す。'], '九鬼嘉隆', ['大船が毛利の船団を退けた。', '川口の守りは、なお続くぞ。']],
  miki: [H, ['三木の城は兵糧攻めじゃ。', '飢えた城兵が打って出る。砦を守れ。'], H, ['三木の城は開いた。', '別所殿の命と引き換えに、城兵は助かる。']],
  arioka: ['荒木村重', ['有岡の城を囲む。', '荒木村重が毛利に付いた。'], '織田信忠', ['有岡は落ちた。村重は逃げた。', 'むごい仕置きになろう。']],
  iga: ['織田信雄', ['伊賀を攻める。山の中の砦じゃ。', '地の者は道を知っておる。気をつけよ。'], '織田信雄', ['伊賀は平らいだ。', 'よう戻った。']],
  tottori: [H, ['鳥取の城を囲む。付城と柵で道を断つ。', 'ひと月、ふた月と待つ戦じゃ。'], H, ['吉川式部少輔殿が腹を召され、城兵は救われた。', '飢えは何よりも辛い。']],
  takato: ['織田信忠', ['高遠の城を攻める。仁科五郎が籠もっておる。', '降れとの使いも追い返した。手強いぞ。'], '織田信忠', ['高遠は落ちた。仁科五郎、見事な最期であった。', '次は甲斐じゃ。武田四郎を追う。']],
  // 本能寺の変の終わり（kaito 11/1 ④）：京の外れの使者の家で、戦の中から開く。行の頭に話し手（'$me'＝主人公）
  honnoji_shisha: ['使者', [], '使者', [['使者', '……その血、本能寺の方か。中へ入られよ。'], ['$me', '上様は本能寺でご生害。中将様も二条の御所で腹を召された。'],
    ['使者', 'なんと……明智の謀反か。'], ['$me', 'この知らせを、羽柴様へ。'], ['使者', '承知した。備中高松の羽柴様の本陣へ走る。']]],
  // 豊臣編の頭（docs/chapter2_toyotomi.md ① 序）：使者が備中高松の本陣に着き、主人公も合流する。中国大返しから山崎へ
  //   11/10 docs/yamazaki_spec_1109.md：急報は戦の中の備中の本陣（t01_yamazaki/ogaeshi.js）で見せるので、前の話は出さない。後はまだ天下人の顔をしない
  t01_yamazaki: ['羽柴秀吉', [], '羽柴秀吉', ['日向は退けた。上様の仇は、これで討てる。', 'まだ山崎に勝っただけじゃ。柴田殿も北国におる。']],
  // 徳川編 8：木津川口の前に、大坂城の中の軍議（豊臣方の主な武将を一度に見せる。docs/generals_toyo_toku_1108.md の 8）
  //   史実：信繁・又兵衛は打って出る策を説いたが、大野治長らの籠城の策に決まった。城の外に砦を置いて囲みを遅らせる
  k08_osaka_kizu: ['豊臣秀頼', [['豊臣秀頼', '関東の大軍が城を囲み始めた。皆の存念を聞こう。'], ['大野治長', '城の外の砦で敵を止め、城に籠もって持ちこたえまする。'],
    ['真田信繁', '籠もるだけでは勝てませぬ。打って出て、宇治と瀬田で迎え撃つべし。'], ['後藤又兵衛', '真田殿に同じ。'],
    ['淀殿', 'この城は太閤様が築かれた城。外へ出ずとも落ちはせぬ。'], ['毛利勝永', 'ならば、外の砦を固く守るまで。'],
    ['長宗我部盛親', '城の南は、この盛親が持ちまする。'], ['木村重成', '今福の堤は、それがしが。'], ['大野治房', '兄上、砦が一つ落ちれば、囲みは一段狭まりますぞ。'],
    ['明石全登', '木津川口の砦には、一族の全延を置いてござる。'], ['豊臣秀頼', '籠城と決める。皆、頼むぞ。']], '蜂須賀至鎮', []],
  // 徳川編：真田丸（11）と樫井（12）の間の戦の無い場面（docs/chapter3_tokugawa.md「11と12の間」）。大砲・和議・堀を埋める・裸城・再戦の支度
  k11_sanadamaru: ['山崎長徳', ['篠山の真田の鉄砲が、仕寄りの邪魔をしておる。', '大御所様は、丸へ攻めかかるなと仰せじゃ。'], '本多正純', [
    '大御所様は、力攻めをやめると決められた。', '南蛮の大筒を、城の本丸へ向けて撃ち込む。', '一つの玉が天守の近くに落ち、淀殿の侍女が討たれたそうじゃ。', '城の内は震え上がっておる。和議の話が出るのも近い。']],
  k12_kashii: ['浅野長晟', [
    ['本多正純', '和議は成った。外の堀を埋める約束じゃ。'], ['本多正純', 'じゃが我らは、二の丸・三の丸の堀まで埋めた。真田の丸も崩した。'],
    ['浅野長晟', '大坂の城は、堀の無い裸の城になった。豊臣方は約束が違うと怒っておる。'], ['浅野長晟', '浪人どもが城に残り、また兵を集めておる。年が明けて、再び戦じゃ。'],
    ['浅野長晟', '我らは紀州から北へ上る。大野治房の先手が来る。安松に殿を残し、樫井の村で迎え撃て。']], '浅野長晟', ['塙団右衛門を討ったか。見事じゃ。', '国の一揆を鎮めてから、大坂へ上る。最後の戦が近い。']],
  tano: ['滝川一益', ['武田勝頼が天目山へ追い詰められた。', '田野で最後の戦じゃ。'], '滝川一益', ['勝頼公が自害された。', '武田は滅んだ。']],
  honnoji: [N, ['……是非に及ばず。', '敵は明智じゃ。逃げるな、ここで戦え。'], '森蘭丸', ['殿は、もう……。', '誰かこの知らせを、羽柴様へ。']],
};
const CSS = `<style>
.tk{position:fixed;inset:0;z-index:9000;background:#000;color:#ece4d2;font-family:inherit;overflow:hidden;touch-action:manipulation;cursor:pointer}
.tk .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.78) saturate(.95)}
.tk .vg{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 45%,transparent 35%,#000a 100%),linear-gradient(#0000 55%,#000c)}
.tk .who{position:absolute;right:3%;bottom:0;height:92%;aspect-ratio:230/330;opacity:0;transform:translateX(18px);transition:opacity .35s,transform .35s}
.tk .who.on{opacity:1;transform:none}
.tk .who canvas{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 4px 12px #000a) brightness(.88) contrast(1.06) saturate(.85)}
.tk .who canvas{opacity:0;transition:opacity .3s}.tk .who.d3 canvas{opacity:1}
.tk .rk{position:absolute;right:6%;top:max(70px,18%);background:#7a1b16;color:#ece4d2;border:1px solid #c2a25a;padding:6px 18px;font-size:max(16px,calc(18px * var(--text-scale,1)));letter-spacing:.15em}
.tk .box{position:absolute;left:4%;right:4%;bottom:5%;min-height:22%;background:#14120fe6;border:1px solid #c2a25a;border-radius:6px;padding:14px 20px 12px;box-sizing:border-box}
.tk .nm{position:absolute;left:18px;top:-17px;background:#7a1b16;color:#ece4d2;border:1px solid #c2a25a;padding:4px 16px;font-size:max(15px,calc(16px * var(--text-scale,1)));letter-spacing:.1em}
.tk .tx{margin:6px 0 0;font-size:max(16px,calc(18px * var(--text-scale,1)));line-height:1.65;padding-right:24%;min-height:3.3em}
.tk .nx{position:absolute;right:18px;bottom:8px;width:48px;height:48px;padding:0;box-sizing:border-box;border:1px solid #c2a25a;border-radius:50%;background:#14120f;color:#ece4d2;font:24px/1 sans-serif;cursor:pointer;touch-action:manipulation}
.tk .nx:focus-visible{outline:3px solid #ece4d2;outline-offset:3px}
.tk .sk{position:absolute;right:12px;top:12px;min-height:44px;min-width:76px;background:#14120fcc;color:#ece4d2;border:1px solid #c2a25a;border-radius:4px;font-size:max(15px,calc(15px * var(--text-scale,1)));cursor:pointer}
@media (prefers-reduced-motion:reduce){.tk .who{transition:none}}
</style>`;
const quiet = () => typeof window === 'undefined' || window.__autoplay || window.__norender === true || /[?&](autoplay|norender|bot)/.test(location.search);
// 上半身の 3D：ゲームの甲冑の人物（preview.js・units_data の GENERALS）を胸から上に寄せて撮る。描けない時は上半身を出さない（描き絵は出さない）
const PLAIN = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'kabuto', sode: true, pole: false, flag: null, weapon: null, skin: 0xb88e6a, saya: true, menpo: 0, horo: 0, haori: 0, noHaori: true, tier: 3, mon: 'oda' };
const KUMI = { ...PLAIN, armor: 0x23201c, lace: 0x3a3026, hat: 'jingasa', sode: false, tier: 1 };
function frame(pv) {
  pv.spin = 0;
  const h = pv.hu && pv.hu.human ? 1.42 : 1.6;
  pv.camera.fov = 26; pv.camera.aspect = 230 / 330; pv.camera.updateProjectionMatrix();
  pv.camera.position.set(0, h + 0.02, 2.25); pv.camera.lookAt(0, h - 0.2, 0);
}
async function put3d(pv, who, G) {
  const { GENERALS, buildModel, poseArms } = await import('./units.js');
  if (G) { pv.setLook(G); pv.holder.rotation.y = -0.35; }
  else if (GENERALS[who]) pv.setGeneral(who);
  else {
    pv.holder.clear(); pv.horse = null;
    const u = {}, m = buildModel(u, /組頭/.test(who) ? KUMI : PLAIN);
    u.hand.rotation.x = -0.5; poseArms(u);
    pv.holder.add(m); pv.humanize(u, m);
    if (pv.hu) m.rotation.y = 0.55; else pv.holder.rotation.y = -0.45;
  }
  frame(pv);
}
const seen = (k) => { try { return localStorage.getItem('tk_' + k) === '1'; } catch { return false; } };
const mark = (k) => { try { localStorage.setItem('tk_' + k, '1'); } catch { /* 保存できなくても進む */ } };

// when：'b'（戦の前）か 'a'（戦の後）。終わったら done()。会話が無い戦は、すぐ done()
// o.G と o.rank：戦の後に取り立てられた時。話す人が新しい位を告げ、最後にホームの札と同じ主人公の姿（新しい具足）と位を見せる
export function playTalk(id, when, done, o = {}) {
  // 稲生の相手は戦場の赤い▼と任務一行で示し、開戦前の会話で足止めしない。
  if (id === 'inou' && when === 'b') return done();
  const t = TALKS[id];
  if (!t || typeof document === 'undefined' || quiet()) return done();
  const who = when === 'b' ? t[0] : t[2];
  let lines = when === 'b' ? t[1] : t[3];
  if (!lines.length && !o.rank) return done();
  const key = id + '_' + when;
  if (seen(key) && !o.full) lines = lines.slice(0, 1);
  // 行が [話し手, 台詞] の時は、その行だけ話し手を替える（'$me'＝主人公の名）
  const steps = lines.map((x) => Array.isArray(x) ? { who: x[0] === '$me' ? (o.me || '') : x[0], x: x[1] } : { who, x });
  if (o.rank && o.G) {
    if (!lines.some((x) => /今日から/.test(x))) steps.push({ who, x: `今日からお主は${o.rank}じゃ。` });
    steps.push({ who: o.G.name || '', x: 'ははっ。', me: true });
  }
  const el = document.createElement('div');
  el.className = 'tk'; el.setAttribute('role', 'dialog'); el.tabIndex = -1;
  // 11/8 critic60 三方ヶ原（常識）：戦の絵が敵の大軍の真ん中の時は、会話の背に使わない（味方の陣で話すはず）。暗い幕の地にする
  // 越前は前後とも暗い幕の地。差し替えの絵でも影絵の人馬を戻さない。
  // 大河内は所属不明の黒丸の旗が写る古い写真を、前後の会話とも出さない。
  const noBg = TALK_NO_BG.has(id) && (id === 'mikatagahara' || id === 'echizen' || id === 'okawachi' || !o.thumb);
  el.innerHTML = `${CSS}<div class="bg" style="${noBg ? 'background:linear-gradient(#2a2219,#14100c)' : `background-image:url('${thumbURL(o.thumb || id)}')`}"></div><div class="vg"></div>
    <div class="who"><canvas aria-hidden="true"></canvas></div><div class="rk" hidden>${o.from ? `${esc(o.from)} → ` : ''}${esc(o.rank || '')}</div>
    <div class="box"><div class="nm">${esc(who)}</div><p class="tx" aria-live="polite"></p><button type="button" class="nx" aria-label="▼">▼</button></div>
    <button type="button" class="sk">飛ばす</button>`;
  document.body.appendChild(el);
  const tx = el.querySelector('.tx'), pic = el.querySelector('.who'), nm = el.querySelector('.nm'), cv = el.querySelector('canvas'), rk = el.querySelector('.rk');
  requestAnimationFrame(() => pic.classList.add('on'));
  let i = 0, over = false, pv = null, meOn = false;
  // 絵は一枚の描き場を使い回す。閉じたら捨てる（戦の描画と重ねない）
  // o.flat：戦の途中で開く時は、二つ目の描き場（WebGL）を作らず、上半身を出さない（携帯の記憶を増やさない）
  (o.flat ? Promise.reject(new Error('flat')) : import('./preview.js')).then(async ({ Preview }) => {
    if (over || !cv.isConnected) return;
    pv = new Preview(cv);
    if (!pv.renderer) { pv = null; return; }
    // 初回の会話でも、戦場と同じ人と甲冑を読み終えてから顔を出す。
    await pv.loadGeneral();
    if (over || !cv.isConnected) return;
    await put3d(pv, who);
    if (over) return;
    if (meOn) await put3d(pv, '', o.G);
    pic.classList.add('d3');
  }).catch(() => { pv = null; });
  const end = () => { if (over) return; over = true; mark(key); document.removeEventListener('keydown', onKey, true); el.remove(); if (pv) { try { pv.dispose(); } catch { /* 捨てられなくてもよい */ } pv = null; } done(); };
  const show = () => {
    const st = steps[i];
    nm.textContent = st.who; nm.hidden = !st.who;
    tx.textContent = '「' + st.x + '」';
    if (st.me && !meOn) {
      meOn = true; rk.hidden = false;
      pic.classList.remove('on'); requestAnimationFrame(() => pic.classList.add('on'));
      if (pv && pic.classList.contains('d3')) put3d(pv, '', o.G).catch(() => {});
    }
  };
  const next = () => { if (over) return; if (++i >= steps.length) end(); else show(); };
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      // 既存の二つの操作は標準の押し方に任せ、会話が二行進むのを防ぐ。
      if (e.target === el.querySelector('.nx') || e.target === el.querySelector('.sk')) return;
      e.preventDefault(); e.stopPropagation(); if (!e.repeat) next();
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
  }
  document.addEventListener('keydown', onKey, true);
  el.onclick = next;
  el.querySelector('.nx').onclick = (e) => { e.stopPropagation(); next(); };
  el.querySelector('.sk').onclick = (e) => { e.stopPropagation(); end(); };
  show();
}
