// 題字の明朝（Shippori Mincho B1・SIL OFL 1.1）。題・戦の名・位の名に使う字だけに絞った同梱の字（約72KB。docs/CREDITS.md）
// index.html の --title が先に名を引く。住所は src からの相対で決める（公開の置き場で assets の場所が変わっても読める）
try {
  const url = new URL('../assets/fonts/shippori_b1_800_title.woff2', import.meta.url).href;
  const st = document.createElement('style');
  st.textContent = `@font-face { font-family: "Risshin Title"; src: url(${url}) format("woff2"); font-weight: 100 900; font-display: swap; }`;
  document.head.appendChild(st);
} catch (e) { /* 字が読めなくても、ヒラギノ明朝で出る */ }
