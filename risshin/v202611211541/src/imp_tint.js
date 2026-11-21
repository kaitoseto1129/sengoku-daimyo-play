// 遠い軽い兵の束へ渡す、近い兵と同じ作り分けの色の入れ物（units.js が読み・humans_dress.js が soldierTint を入れる）。
// 11/21 循環の import で units.js より先に humans_dress.js が走ると TDZ で本編ごと落ちたので、何も読まない葉の部品に置く
export const IMP_TINT = { fn: null };
