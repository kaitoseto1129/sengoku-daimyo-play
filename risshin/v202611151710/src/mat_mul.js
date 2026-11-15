// 11/16 K314：行列の掛け算（out = a × b）を一つの形の関数で。three の multiplyMatrices は場面のあちこちから色々な形で呼ばれて最適化が外れ、
//   天王寺・岡山のパソコンで自分の時間の一番（約7%）だった。毎コマ全部の物を辿る所（hidden_skip・骨の IK）だけここを通す。計算は同じ
export function mulMW(out, a, b) {
  const ae = a.elements, be = b.elements, te = out.elements;
  const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
  const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
  const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
  const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
  for (let c = 0; c < 16; c += 4) {
    const b1 = be[c], b2 = be[c + 1], b3 = be[c + 2], b4 = be[c + 3];
    te[c] = a11 * b1 + a12 * b2 + a13 * b3 + a14 * b4;
    te[c + 1] = a21 * b1 + a22 * b2 + a23 * b3 + a24 * b4;
    te[c + 2] = a31 * b1 + a32 * b2 + a33 * b3 + a34 * b4;
    te[c + 3] = a41 * b1 + a42 * b2 + a43 * b3 + a44 * b4;
  }
  return out;
}
