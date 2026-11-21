// 戦の setup は、段に分けたい戦だけ function* にして間に yield を置ける（K112・battle.js finishBuild）。
// setup を包む手（陣立て・軍勢の厚み・信長で出陣）が「setup の後に足す仕事」を持つ時は、ここを通して、
// 段に分けた setup の最後の段の後に足す（関数の setup は今までどおりその場で足す）。
export function afterSetup(r, fn) {
  if (r && typeof r.next === 'function') return (function* () { const v = yield* r; fn(); return v; })();
  fn();
  return r;
}
