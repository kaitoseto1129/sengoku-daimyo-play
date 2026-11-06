// 戦の前と後の会話の場面。背景＝その戦を3Dで撮った絵（assets/story。kaito 11/3 AP 1）、右＝話す人の上半身（ゲームの3D）、下＝名札と台詞の枠。
// 押すと次の言葉。右上「とばす」。二度目からは短く（最初の一言だけ）。絵は一枚を使い回し、戦の読み込みと重ねない。
import { storyShot } from './illust.js';
const thumbURL = (id) => storyShot(String(id).replace(/_shisha$/, ''));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 戦ごとの会話：[前の話し手, [台詞...], 後の話し手, [台詞...]]。史実に合わせた遊びの中の会話
const G0 = '組頭 源八', T = '木下藤吉郎', H = '羽柴秀吉', N = '織田信長', S = '柴田勝家', A = '明智光秀';
export const TALKS = {
  // 初陣は会話で止めず、実戦のピン・敵の赤い▼・任務の一行へつなぐ。
  inou: [G0, [], G0, ['よう働いた。美作守は殿が自ら突き伏せられたぞ。', '討たれた者も同じ織田の家中じゃ。浮かれるな。']],
  okehazama: [G0, ['雨が降り出した。敵は田楽狭間で休んでおる。', '殿が前へ出られる。遅れるな。'], G0, ['義元公を討ち取ったぞ！', 'お主の槍も見ておった。手柄じゃ。']],
  moribe: [G0, ['斎藤勢が墨俣から森部へ出た。雨の楡俣川を渡って懸かるぞ。', '長井・日比野の旗本へ槍を入れよ。組を離すな。'], G0, ['長井も日比野も討たれた。お主も旗本の侍を突き伏せたな。', '美濃はまだ遠い。だが一歩進んだ。']],
  sunomata: [T, ['一夜で砦を築く。人の手が足りぬ。', '敵が来る前に柵を立てよ。守り切れば手柄じゃ。'], T, ['砦は守り抜いたぞ。', 'お主、わしの下で働かぬか。']],
  inabayama: [T, ['崖を登って城へ入る。猿と笑うな。', '合図の火が上がったら一斉に行け。'], T, ['稲葉山を落としたぞ。', '殿はここを岐阜と名づけられる。']],
  mitsukuri: [T, ['箕作の城は夜のうちに攻める。', '松明を多く焚いて、敵の目を引け。'], T, ['一日で落ちたな。観音寺の城も逃げ出したぞ。', 'よう付いてきた。']],
  okawachi: ['丹羽長秀', ['大河内の城は固い。急がず囲め。', '兵糧を断つ。柵を守るのが務めじゃ。'], '丹羽長秀', ['北畠は降った。殿の二男が跡を継ぐ。', '長い囲みをよう耐えた。']],
  kanegasaki: [T, ['浅井が裏切った。殿は先に退かれる。', 'わしらは殿しんがり。ここで敵を止める。'], T, ['生きて戻ったか。それが何よりじゃ。', '殿も無事に京へ着かれたぞ。']],
  // 11/6 fixc（kaito 三1）：札の「下知があるまで渡らず岸で受け止める」と逆の「川を渡れ」を言わない
  anegawa: ['森可成', ['姉川を挟んで浅井・朝倉と向き合う。西は徳川殿じゃ。', '渡って来る浅井を、この岸で受け止めよ。'], '森可成', ['勝ったぞ。川が血に染まった。', '手柄は確かに見た。']],
  nodafukushima: ['前田利家', ['三好の野田・福島の砦を囲む。', '竹束を据え、味方の鉄砲衆を守れ。'], '前田利家', ['砦は落とせず、囲みを解いた。よう戻った。', '浅井・朝倉が京へ迫る。次は近江じゃ。']],
  shiga: ['森可成', ['宇佐山の城を守る。浅井・朝倉が坂本まで来た。', '殿の戻るまで持ちこたえよ。'], '森可成', ['城は守った。……森殿は討死された。', 'お主は生き残った。それを忘れるな。']],
  hieizan: [A, ['山を囲み、僧兵の逃げ道を断つ。', '殿の命じゃ。ためらうな。'], A, ['山は焼かれた。', 'わしの胸にも重い。言うまいぞ。']],
  mikatagahara: ['平手汎秀', ['徳川殿の加勢に来た。武田の本隊と当たる。', '無理はするな。退き時を見よ。'], '平手汎秀', ['負け戦じゃ。生きて浜松へ戻れ。', '徳川殿も命からがら逃げ込んだぞ。']],
  tonezaka: [S, ['朝倉が敗走する。追え。', '逃がすな。刀根坂で首を挙げよ。'], S, ['朝倉は崩れた。よう追った。', '次は小谷じゃ。']],
  odani: [H, ['小谷の城を攻める。お市の方様をお救いする。', '京極丸を落とせば本丸は目の前じゃ。'], H, ['小谷は落ちた。備前守殿は自害された。', 'お市の方様と姫君は、ご無事じゃ。']],
  // 11/6 fix61：九月二十九日の場（長島の城が降り、舟で退く）に合わせる。札の「岸で受け止める」と同じ言い方
  nagashima: [S, ['長島の城が侘び言を入れた。門徒は舟で退くという。', '岸の柵を結い、舟に備えよ。川は渡るな。'], S, ['長島は終わった。中江も屋長島も焼け落ちた。', '多くの者が死んだ。忘れるでないぞ。']],
  // 11/6 fixc1721：総大将は一キロ西の茶臼山。柵の組頭へ下知するのは鉄砲奉行の前田利家（信長公記の五人の奉行の一人）。「騎馬の突撃」の通説は言わせない
  shitaragahara: ['前田利家', ['武田勢が連吾川の向こうに出た。柵からは出るな。', '鉄砲は寄せ手を引き付けてから放つ。槍は柵の口を守れ。'], '前田利家', ['武田の宿将が次々に討たれ、勝頼は退いた。', 'よう柵の口を守った。']],
  echizen: ['丹羽長秀', ['越前の一向一揆を討つ。木ノ芽峠を越えるぞ。', '風雨じゃ。足元と火縄の湿りに気を付けよ。'], '丹羽長秀', ['峠は開いた。一揆勢は府中へ落ちた。', 'よう付いてきた。']],
  echizen_ikko: [S, ['風雨の中、大滝寺へ寄せる。', '雨で暗い。味方の旗印を見失うな。'], S, ['一揆は退いた。', '怪我はないか。']],
  iwamura: ['織田信忠', ['岩村の城を囲む。山の上じゃ。', '水の手を断てば、城は落ちる。'], '織田信忠', ['城は降った。', '武田との戦はまだ続く。']],
  tennoji: ['原田直政', ['天王寺の砦を守る。本願寺勢が来る。', '鉄砲の的になるな。'], '明智光秀', ['危ういところであった。殿が自ら駆けつけられた。', '生きて戻れたのは運じゃ。']],
  // 11/6 fixc1753：山手の先手を率いたのは堀秀政（信長公記巻十）。秀吉は同じ山手の別の手
  saika: ['堀秀政', ['雑賀の者は小雑賀川の岸に柵を結い、高い岸から鉄砲で待っておる。', '川底の杭を抜いて、中央の口から渡る。わしの先手に続け。'], '堀秀政', ['あの高岸は越えられなんだ。雑賀は誓紙を出したが、勝ち戦とは言えぬ。', '鉄砲の恐ろしさ、身にしみたろう。']],
  tedorigawa: [S, ['上杉謙信が来ておる。', '手取川を渡る。……嫌な予感がする。'], S, ['謙信公の強さは並ではない。', '生きて退けたなら、それが手柄じゃ。']],
  shigisan: ['織田信忠', ['松永久秀が信貴山城に籠もった。', '今宵、諸口から夜攻めじゃ。筒井の先手と尾根を登れ。'], '織田信忠', ['久秀は天主に火をかけて果てた。', '信貴山の城は落ちた。']],
  kizugawa: ['九鬼嘉隆', ['木津川口で毛利水軍を迎え撃つ。', '焙烙火矢に気をつけよ。大筒で返す。'], '九鬼嘉隆', ['大船が毛利の船団を退けた。', '川口の守りは、なお続くぞ。']],
  miki: [H, ['三木の城は兵糧攻めじゃ。', '飢えた城兵が打って出る。砦を守れ。'], H, ['三木の城は開いた。', '別所殿の命と引き換えに、城兵は助かる。']],
  arioka: ['荒木村重', ['有岡の城を囲む。', '荒木村重が毛利に付いた。'], '織田信忠', ['有岡は落ちた。村重は逃げた。', 'むごい仕置きになろう。']],
  iga: ['織田信雄', ['伊賀を攻める。山の中の砦じゃ。', '地の者は道を知っておる。気をつけよ。'], '織田信雄', ['伊賀は平らいだ。', 'よう戻った。']],
  tottori: [H, ['鳥取の城を囲む。付城と柵で道を断つ。', 'ひと月、ふた月と待つ戦じゃ。'], H, ['吉川式部少輔殿が腹を召され、城兵は救われた。', '飢えは何よりも辛い。']],
  takato: ['織田信忠', ['高遠の城を攻める。仁科盛信殿が籠もっておる。', '武田の誇りを見せる敵じゃ。'], '織田信忠', ['高遠は落ちた。盛信殿は見事な最期であった。', '武田家は終わりに近い。']],
  // 本能寺の変の終わり（kaito 11/1 ④）：京の外れの使者の家で、戦の中から開く。行の頭に話し手（'$me'＝主人公）
  honnoji_shisha: ['使者', [], '使者', [['使者', '……その血、本能寺の方か。中へ入られよ。'], ['$me', '上様は本能寺でご生害。信忠様も二条の御所で腹を召された。'],
    ['使者', 'なんと……明智の謀反か。'], ['$me', 'この知らせを、羽柴様へ。'], ['使者', '承知した。備中高松の羽柴様の本陣へ走る。']]],
  // 豊臣編の頭（docs/chapter2_toyotomi.md ① 序）：使者が備中高松の本陣に着き、主人公も合流する。中国大返しから山崎へ
  t01_yamazaki: ['使者', [['使者', '京にて、上様ご生害。明智日向守の謀反にござる。'], ['羽柴秀吉', '……まことか。'],
    ['黒田官兵衛', '殿、ご運が開けましたな。'], ['羽柴秀吉', '（遅れて着いた主人公へ）よう生きて戻った。おぬしの槍、わしに貸せ。'],
    ['羽柴秀吉', '毛利と和を結ぶ。日向を討つは今ぞ。走れ、走れ。']], '羽柴秀吉', ['日向は討った。上様の仇はとったぞ。', 'ここからが、わしらの天下取りじゃ。']],
  // 徳川編：真田丸（11）と樫井（12）の間の戦の無い場面（docs/chapter3_tokugawa.md「11と12の間」）。大砲・和議・堀を埋める・裸城・再戦の支度
  k11_sanadamaru: ['山崎長徳', ['篠山の真田の鉄砲が、仕寄りの邪魔をしておる。', '大御所様は、丸へ攻めかかるなと仰せじゃ。'], '本多正純', [
    '大御所様は、力攻めをやめると決められた。', '南蛮の大筒を、城の本丸へ向けて撃ち込む。', '一つの玉が天守の近くに落ち、淀殿の侍女が討たれたそうじゃ。', '城の内は震え上がっておる。和議の話が出るのも近い。']],
  k12_kashii: ['浅野長晟', [
    ['本多正純', '和議は成った。外の堀を埋める約束じゃ。'], ['本多正純', 'じゃが我らは、二の丸・三の丸の堀まで埋めた。真田の丸も崩した。'],
    ['浅野長晟', '大坂の城は、堀の無い裸の城になった。豊臣方は約束が違うと怒っておる。'], ['浅野長晟', '浪人どもが城に残り、また兵を集めておる。年が明けて、再び戦じゃ。'],
    ['浅野長晟', '我らは紀州から北へ上る。大野治房の先手が来る。安松に殿を残し、樫井の村で迎え撃て。']], '浅野長晟', ['塙団右衛門を討ったか。見事じゃ。', 'これより大坂へ。最後の戦が近い。']],
  tano: ['滝川一益', ['武田勝頼が天目山へ追い詰められた。', '田野で最後の戦じゃ。'], '滝川一益', ['勝頼公が自害された。', '武田は滅んだ。']],
  honnoji: [N, ['……是非に及ばず。', '敵は明智じゃ。逃げるな、ここで戦え。'], '森蘭丸', ['殿は、もう……。', '誰かこの知らせを、羽柴様へ。']],
};
const CSS = `<style>
.tk{position:fixed;inset:0;z-index:9000;background:#000;color:#ece4d2;font-family:inherit;overflow:hidden;touch-action:manipulation;cursor:pointer}
.tk .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.78) saturate(.95)}
.tk .vg{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 45%,transparent 35%,#000a 100%),linear-gradient(#0000 55%,#000c)}
.tk .who{position:absolute;right:3%;bottom:0;height:92%;aspect-ratio:230/330;opacity:0;transform:translateX(18px);transition:opacity .35s,transform .35s}
.tk .who.on{opacity:1;transform:none}
.tk .who canvas{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 4px 12px #000a)}
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
  el.innerHTML = `${CSS}<div class="bg" style="background-image:url('${thumbURL(o.thumb || id)}')"></div><div class="vg"></div>
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
