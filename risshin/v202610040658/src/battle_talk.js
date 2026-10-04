// 戦の前後だけで作る短い会話。史料の引用ではなく、遊びの中の会話。
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function battleTalk(G, battle, result) {
  if (!G || G.practice || G.lord || !battle) return [];
  const scenes = [], me = G.name || '自分';
  const after = !!result;
  const rank = after ? result.rankBefore : G.rank;
  const boss = battle.boss || result?.bossLine?.[0] || '上役';
  const retreat = /退き口|本能寺|三方ヶ原|手取川/.test(battle.name);
  const losses = after && ((result.squadLines || []).some((x) => !x.alive) || (result.keraiLines || []).some((x) => !x.alive) || (result.tomoFallen || []).length);
  const scene = (place, a, line, b, reply) => scenes.push({ place, lines: [[a, line], [b, reply]] });
  // 本能寺の後と総大将の討死後に、上役が生還したことにしない。
  if (!after) {
    scene('出陣前・陣の端', boss,
      retreat ? '列を離れるな。退く道も、よう見ておけ。' : '合図までは持ち場を守れ。勝手に走り出すな。',
      me, rank >= 2 ? '承知しました。組にも言い聞かせます。' : '承知しました。合図を待ちます。');
  } else if (!result.taishoLost && battle.id !== 'honnoji') {
    const disobeyed = (result.lines || []).some((l) => l.label === '命令違反');
    scene('戦の後・陣の端', boss,
      disobeyed ? '下知を違えれば、隣の組も危うくなるぞ。' : !result.mainDone ? '務めは果たせなかったな。まず傷を見せよ。' : losses ? '戻ったか。帰らぬ者の名も知らせよ。' : '戻ったか。まず息を整えよ。',
      me, disobeyed ? '申し訳ございません。次は下知を守ります。' : losses ? '討たれた者の名を、書き留めてまいります。' : '承知しました。');
  }
  if (rank === 0) {
    // 戦後は実際に生き残った同輩だけ。戦前の名の無い同輩は固有人物の生死を変えない。
    const peer = after ? (result.squadLines || []).find((x) => x.alive) : null;
    if (!after || peer) scene(after ? '引き上げの道' : '出陣前・列の中', peer?.name || '同輩の足軽',
      after ? '……帰れたな。手がまだ震えておる。' : '喉が渇くな。お主も、怖いか。',
      me, after ? 'ああ。まず水を飲もう。' : '怖いさ。互いの横を空けぬようにしよう。');
  }
  const servant = after ? (result.keraiLines || []).find((x) => x.alive) || (G.tomo || []).find((x) => x.alive && x.name !== result.tomoLeft)
    : (G.kerai || []).find((x) => x.alive && ['tomo', 'kumi', 'tegei'].includes(x.role)) || (G.tomo || []).find((x) => x.alive);
  if (servant) scene(after ? '戦の後・荷のそば' : '出陣前・支度の場', servant.name,
    after ? losses ? '殿、帰らぬ者の荷はいかがいたしますか。' : '殿、お怪我はございませぬか。' : '殿、支度はできております。',
    me, after ? losses ? '名を添えて預かれ。置き去りにはするな。' : 'わしはよい。お主も傷を洗っておけ。' : '頼むぞ。離れず、合図を待て。');
  return scenes;
}

export function battleTalkHtml(scenes) {
  if (!scenes.length) return '';
  return `<style>
    #screen .bt-talk{max-width:32em;margin:8px auto 16px;padding:8px 16px;border:1px solid #c2a25a;background:#14120f;color:#ece4d2;text-align:left;box-sizing:border-box}
    #screen .bt-talk small{font-size:max(12px,calc(12px * var(--text-scale,1)));color:#b9b09c}
    #screen .bt-talk p{font-size:max(15px,calc(16px * var(--text-scale,1)));line-height:1.6;margin:4px 0;opacity:1;animation:none;letter-spacing:normal}
    #screen .bt-talk p b{color:#c2a25a;margin-right:8px;font-weight:500}
    #screen .bt-talk .row{gap:8px;margin:8px 0 0;justify-content:flex-end;flex-wrap:wrap}
    #screen .bt-talk button{min-height:44px;margin:0;font-size:max(15px,calc(15px * var(--text-scale,1)))}
    #screen .bt-talk button:focus-visible{outline:3px solid #c2a25a;outline-offset:3px;box-shadow:0 0 0 6px #14120f}
  </style><section class="bt-talk" aria-label="戦の前後の会話"><div data-bt-lines aria-live="polite"></div><div class="row"><button class="btn" data-bt-skip>会話を飛ばす</button><button class="btn" data-bt-next>次の会話を読む</button></div></section>`;
}

export function bindBattleTalk(root, scenes, nextButton) {
  const box = root.querySelector('.bt-talk');
  if (!box) return;
  let i = 0;
  const next = box.querySelector('[data-bt-next]');
  const close = () => { box.hidden = true; (nextButton || root.querySelector('#ev-actions button'))?.focus({ preventScroll: true }); };
  const render = () => {
    const s = scenes[i];
    box.querySelector('[data-bt-lines]').innerHTML = `<small>${esc(s.place)}　${i + 1}／${scenes.length} ・ 遊びの中の会話</small>${s.lines.map(([who, line]) => `<p><b>${esc(who)}</b>「${esc(line)}」</p>`).join('')}`;
    next.textContent = i === scenes.length - 1 ? '会話を閉じる' : '次の会話を読む';
  };
  box.querySelector('[data-bt-skip]').onclick = close;
  next.onclick = () => { if (++i >= scenes.length) close(); else render(); };
  render();
}
