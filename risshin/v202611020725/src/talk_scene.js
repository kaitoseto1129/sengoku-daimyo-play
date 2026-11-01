// 戦の前と後の会話の場面。背景＝その戦の絵（assets/thumbs）、右＝話す人の上半身（SVG）、下＝名札と台詞の枠。
// 押すと次の言葉。右上「とばす」。二度目からは短く（最初の一言だけ）。絵は一枚を使い回し、戦の読み込みと重ねない。
const thumbURL = (id) => new URL(`../assets/thumbs/${id}.webp`, import.meta.url).href;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 戦ごとの会話：[前の話し手, [台詞...], 後の話し手, [台詞...]]。史実に合わせた遊びの中の会話
const G0 = '組頭 源八', T = '木下藤吉郎', H = '羽柴秀吉', N = '織田信長', S = '柴田勝家', A = '明智光秀';
export const TALKS = {
  inou: [G0, ['林美作の殿が、まだ踏みとどまっておる。', '土手の上から崩せ。槍を揃えて行くぞ。'], G0, ['よう働いた。美作の殿は討たれたぞ。', 'だが同じ織田の者同士じゃ。喜ぶな。']],
  okehazama: [G0, ['雨が降り出した。敵は田楽狭間で休んでおる。', '殿が前へ出られる。遅れるな。'], G0, ['義元公を討ち取ったぞ！', 'お主の槍も見ておった。手柄じゃ。']],
  moribe: [G0, ['美濃の斎藤勢が来る。川を背に踏ん張れ。', '長井殿の首を狙え。'], G0, ['敵の将を討ち取った。見事じゃ。', '美濃はまだ遠い。だが一歩進んだ。']],
  sunomata: [T, ['一夜で砦を築く。人の手が足りぬ。', '敵が来る前に柵を立てよ。守り切れば手柄じゃ。'], T, ['砦は守り抜いたぞ。', 'お主、わしの下で働かぬか。']],
  inabayama: [T, ['崖を登って城へ入る。猿と笑うな。', '合図の火が上がったら一斉に行け。'], T, ['稲葉山を落としたぞ。', '殿はここを岐阜と名づけられる。']],
  mitsukuri: [T, ['箕作の城は夜のうちに攻める。', '松明を多く焚いて、敵の目を引け。'], T, ['一日で落ちたな。観音寺の城も逃げ出したぞ。', 'よう付いてきた。']],
  okawachi: ['丹羽長秀', ['大河内の城は固い。急がず囲め。', '兵糧を断つ。柵を守るのが務めじゃ。'], '丹羽長秀', ['北畠は降った。殿の二男が跡を継ぐ。', '長い囲みをよう耐えた。']],
  kanegasaki: [T, ['浅井が裏切った。殿は先に退かれる。', 'わしらは殿しんがり。ここで敵を止める。'], T, ['生きて戻ったか。それが何よりじゃ。', '殿も無事に京へ着かれたぞ。']],
  anegawa: ['森可成', ['姉川を挟んで浅井・朝倉と向き合う。', '徳川殿と並んで押す。川を渡れ。'], '森可成', ['勝ったぞ。川が血に染まった。', '手柄は確かに見た。']],
  nodafukushima: ['前田利家', ['石山の本願寺が動いた。野田の砦を攻める。', '鉄砲に気をつけよ。'], '前田利家', ['砦は落とした。だが一揆が起きておる。', '休む暇はないぞ。']],
  shiga: ['森可成', ['宇佐山の城を守る。浅井・朝倉が坂本まで来た。', '殿の戻るまで持ちこたえよ。'], '森可成', ['城は守った。……森殿は討死された。', 'お主は生き残った。それを忘れるな。']],
  hieizan: [A, ['山を囲み、僧兵の逃げ道を断つ。', '殿の命じゃ。ためらうな。'], A, ['山は焼かれた。', 'わしの胸にも重い。言うまいぞ。']],
  mikatagahara: ['平手汎秀', ['徳川殿の加勢に来た。武田の本隊と当たる。', '無理はするな。退き時を見よ。'], '平手汎秀', ['負け戦じゃ。生きて浜松へ戻れ。', '家康殿も命からがら逃げ込んだぞ。']],
  tonezaka: [S, ['朝倉が敗走する。追え。', '逃がすな。刀根坂で首を挙げよ。'], S, ['朝倉は崩れた。よう追った。', '次は小谷じゃ。']],
  odani: [H, ['小谷の城を攻める。お市の方様をお救いする。', '京極丸を落とせば本丸は目の前じゃ。'], H, ['小谷は落ちた。長政殿は自害された。', 'お市の方様と姫君は、ご無事じゃ。']],
  nagashima: [S, ['長島の一向一揆を討つ。門徒が城に籠もっておる。', '船で囲み、火をかける。'], S, ['長島は終わった。', '多くの者が死んだ。忘れるでないぞ。']],
  shitaragahara: [N, ['武田の騎馬が来る。柵の後ろから撃て。', '合図があるまで撃つな。'], N, ['勝頼の軍は崩れた。', '鉄砲がものを言ったな。']],
  echizen: [S, ['越前の一向一揆を討つ。木ノ芽峠を越えるぞ。', '雪の前に決着をつける。'], S, ['峠を越えた。越前は静まった。', 'よう付いてきた。']],
  echizen_ikko: [S, ['大滝寺の夜討ちじゃ。', '暗い。味方の旗印を見失うな。'], S, ['一揆は退いた。', '怪我はないか。']],
  iwamura: ['織田信忠', ['岩村の城を囲む。山の上じゃ。', '水の手を断てば、城は落ちる。'], '織田信忠', ['城は降った。', '武田との戦はまだ続く。']],
  tennoji: ['原田直政', ['天王寺の砦を守る。本願寺勢が来る。', '鉄砲の的になるな。'], '明智光秀', ['危ういところであった。殿が自ら駆けつけられた。', '生きて戻れたのは運じゃ。']],
  saika: [H, ['雑賀の鉄砲衆と当たる。', '小雑賀川を渡る。慎重に進め。'], H, ['雑賀は降った。', '鉄砲の恐ろしさ、身にしみたろう。']],
  tedorigawa: [S, ['上杉謙信が来ておる。', '手取川を渡る。……嫌な予感がする。'], S, ['謙信公の強さは並ではない。', '生きて退けたなら、それが手柄じゃ。']],
  shigisan: ['織田信忠', ['松永久秀が信貴山城に籠もった。', '天守に火をかける前に討ち取れ。'], '織田信忠', ['久秀は平蜘蛛とともに果てた。', '城は落ちた。']],
  kizugawa: ['九鬼嘉隆', ['木津川口で毛利水軍を迎え撃つ。', '焙烙火矢に気をつけよ。大筒で返す。'], '九鬼嘉隆', ['鉄の船が毛利を破った。', '兵糧は本願寺へ届かぬ。']],
  miki: [H, ['三木の城は兵糧攻めじゃ。', '飢えた城兵が打って出る。砦を守れ。'], H, ['三木の城は開いた。', '別所殿の命と引き換えに、城兵は助かる。']],
  arioka: ['荒木村重', ['有岡の城を囲む。', '荒木村重が毛利に付いた。'], '織田信忠', ['有岡は落ちた。村重は逃げた。', 'むごい仕置きになろう。']],
  iga: ['織田信雄', ['伊賀を攻める。山の中の砦じゃ。', '地の者は道を知っておる。気をつけよ。'], '織田信雄', ['伊賀は平らいだ。', 'よう戻った。']],
  tottori: [H, ['鳥取の城を囲む。米を買い占めてある。', 'ひと月、ふた月と待つ戦じゃ。'], H, ['吉川経家殿が自害され、城兵は救われた。', '飢えは何よりも辛い。']],
  takato: ['織田信忠', ['高遠の城を攻める。仁科盛信殿が籠もっておる。', '武田の誇りを見せる敵じゃ。'], '織田信忠', ['高遠は落ちた。盛信殿は見事な最期であった。', '武田家は終わりに近い。']],
  tano: ['滝川一益', ['武田勝頼が天目山へ追い詰められた。', '田野で最後の戦じゃ。'], '滝川一益', ['勝頼公が自害された。', '武田は滅んだ。']],
  honnoji: [N, ['……是非に及ばず。', '敵は明智じゃ。逃げるな、ここで戦え。'], '森蘭丸', ['殿は、もう……。', '誰かこの知らせを、羽柴様へ。']],
};
// 肩書きで話す人の姿を変える（色・兜の飾り）
function look(name) {
  if (/信長/.test(name)) return { arm: '#2a2a33', trim: '#c2a25a', crest: 'moon', cloak: '#7a1b16' };
  if (/柴田|滝川|森可成|前田|原田|九鬼/.test(name)) return { arm: '#5a2a1c', trim: '#d9b45a', crest: 'horn', cloak: '#3b2c1a' };
  if (/藤吉郎|秀吉|明智|丹羽|平手|荒木/.test(name)) return { arm: '#2f3d4a', trim: '#b8a063', crest: 'horn', cloak: '#6a2a1a' };
  if (/信忠|信雄|蘭丸/.test(name)) return { arm: '#6b1d1a', trim: '#d9b45a', crest: 'bar', cloak: '#2a2a33' };
  if (/組頭/.test(name)) return { arm: '#3c3a34', trim: '#a8935a', crest: 'jingasa', cloak: '#4a3b26' };
  return { arm: '#3a3a36', trim: '#8c7a4c', crest: 'jingasa', cloak: '#4a3b26' };
}
function bust(name) {
  const c = look(name);
  const crest = { moon: '<path d="M96 14a24 24 0 1 0 36 22 20 20 0 1 1 -36 -22z" fill="#d9b45a"/>', horn: '<path d="M88 52 62 4 98 40zM142 52 168 4 132 40z" fill="#d9b45a"/>', bar: '<rect x="108" y="2" width="14" height="50" fill="#d9b45a"/>', jingasa: '' }[c.crest];
  const helm = c.crest === 'jingasa'
    ? '<path d="M50 70Q115 -6 180 70Z" fill="#1a1816" stroke="#8c7a4c" stroke-width="3"/>'
    : '<path d="M72 74Q76 28 115 26Q154 28 158 74Z" fill="#1c1b1d" stroke="#8c7a4c" stroke-width="3"/><path d="M62 74H168L160 90H70Z" fill="#26231f"/>';
  return `<svg viewBox="0 0 230 330" aria-hidden="true"><path d="M0 330V250Q10 205 60 190L115 176 170 190Q220 205 230 250V330Z" fill="${c.cloak}"/>
  <path d="M20 330V258Q30 218 70 204L115 194 160 204Q200 218 210 258V330Z" fill="${c.arm}" stroke="${c.trim}" stroke-width="3"/>
  <path d="M60 330 80 232M170 330 150 232M115 330V230" stroke="${c.trim}" stroke-width="2.5" opacity=".7"/>
  <rect x="97" y="156" width="36" height="40" rx="8" fill="#b88a64"/>
  <path d="M60 188Q115 164 170 188 150 214 115 214 80 214 60 188Z" fill="${c.arm}" stroke="${c.trim}" stroke-width="3"/>
  <ellipse cx="115" cy="118" rx="42" ry="50" fill="#c79b74"/>
  <path d="M74 112Q115 126 156 112V98Q115 108 74 98Z" fill="#00000030"/>
  ${helm}${crest}
  <path d="M92 116q9-5 18 0M120 116q9-5 18 0" stroke="#1a1410" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M104 150q11 7 22 0" stroke="#7a4a3a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}
const CSS = `<style>
.tk{position:fixed;inset:0;z-index:9000;background:#000;color:#ece4d2;font-family:inherit;overflow:hidden;touch-action:manipulation;cursor:pointer}
.tk .bg{position:absolute;inset:-4%;background-size:cover;background-position:center;filter:blur(2px) brightness(.62) saturate(.9)}
.tk .vg{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 45%,transparent 35%,#000a 100%),linear-gradient(#0000 55%,#000c)}
.tk .who{position:absolute;right:3%;bottom:0;height:92%;aspect-ratio:230/330;opacity:0;transform:translateX(18px);transition:opacity .35s,transform .35s}
.tk .who.on{opacity:1;transform:none}
.tk .who svg,.tk .who canvas{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 4px 12px #000a)}
.tk .who canvas{opacity:0;transition:opacity .3s}.tk .who.d3 canvas{opacity:1}.tk .who.d3 svg{opacity:0}
.tk .rk{position:absolute;right:6%;top:max(70px,18%);background:#7a1b16;color:#ece4d2;border:1px solid #c2a25a;padding:6px 18px;font-size:max(16px,calc(18px * var(--text-scale,1)));letter-spacing:.15em}
.tk .box{position:absolute;left:4%;right:4%;bottom:5%;min-height:22%;background:#14120fe6;border:1px solid #c2a25a;border-radius:6px;padding:14px 20px 12px;box-sizing:border-box}
.tk .nm{position:absolute;left:18px;top:-17px;background:#7a1b16;color:#ece4d2;border:1px solid #c2a25a;padding:4px 16px;font-size:max(15px,calc(16px * var(--text-scale,1)));letter-spacing:.1em}
.tk .tx{margin:6px 0 0;font-size:max(16px,calc(18px * var(--text-scale,1)));line-height:1.65;padding-right:24%;min-height:3.3em}
.tk .nx{position:absolute;right:18px;bottom:8px;width:0;height:0;border:9px solid transparent;border-top:13px solid #c2a25a;animation:tkb 1s infinite}
.tk .sk{position:absolute;right:12px;top:12px;min-height:44px;min-width:76px;background:#14120fcc;color:#ece4d2;border:1px solid #c2a25a;border-radius:4px;font-size:max(15px,calc(15px * var(--text-scale,1)));cursor:pointer}
@keyframes tkb{50%{transform:translateY(5px)}}
@media (prefers-reduced-motion:reduce){.tk .nx{animation:none}.tk .who{transition:none}}
</style>`;
const quiet = () => typeof window === 'undefined' || window.__autoplay || window.__norender === true || /[?&](autoplay|norender|bot)/.test(location.search);
// 上半身の 3D：ゲームの甲冑の人物（preview.js・units_data の GENERALS）を胸から上に寄せて撮る。描けない時は SVG のまま
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
  const t = TALKS[id];
  if (!t || typeof document === 'undefined' || quiet()) return done();
  const who = when === 'b' ? t[0] : t[2];
  let lines = when === 'b' ? t[1] : t[3];
  const key = id + '_' + when;
  if (seen(key)) lines = lines.slice(0, 1);
  const steps = lines.map((x) => ({ who, x }));
  if (o.rank && o.G) {
    if (!lines.some((x) => /今日から/.test(x))) steps.push({ who, x: `今日からお主は${o.rank}じゃ。` });
    steps.push({ who: o.G.name || '', x: 'ははっ。', me: true });
  }
  const el = document.createElement('div');
  el.className = 'tk'; el.setAttribute('role', 'dialog'); el.tabIndex = -1;
  el.innerHTML = `${CSS}<div class="bg" style="background-image:url('${thumbURL(id)}')"></div><div class="vg"></div>
    <div class="who">${bust(who)}<canvas aria-hidden="true"></canvas></div><div class="rk" hidden>${esc(o.rank || '')}</div>
    <div class="box"><div class="nm">${esc(who)}</div><p class="tx" aria-live="polite"></p><i class="nx"></i></div>
    <button type="button" class="sk">とばす</button>`;
  document.body.appendChild(el);
  const tx = el.querySelector('.tx'), pic = el.querySelector('.who'), nm = el.querySelector('.nm'), cv = el.querySelector('canvas'), rk = el.querySelector('.rk');
  requestAnimationFrame(() => pic.classList.add('on'));
  let i = 0, over = false, pv = null, meOn = false;
  // 絵は一枚の描き場を使い回す。閉じたら捨てる（戦の描画と重ねない）
  import('./preview.js').then(async ({ Preview }) => {
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
  const next = () => { if (++i >= steps.length) end(); else show(); };
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); next(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
  }
  document.addEventListener('keydown', onKey, true);
  el.onclick = next;
  el.querySelector('.sk').onclick = (e) => { e.stopPropagation(); end(); };
  show();
}
