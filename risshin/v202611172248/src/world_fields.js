// 田の季節。姿と水の判定が同じ値を使う。形や材質は読み込み時だけ作る。
const STATES = Object.freeze({
  bare: Object.freeze({ wet: true, height: 0, color: 0x76634a }),
  seedling: Object.freeze({ wet: true, height: 0.3, color: 0x8aa050 }),
  growing: Object.freeze({ wet: true, height: 0.75, color: 0x73853b }),
  ripe: Object.freeze({ wet: false, height: 0.95, color: 0xb49b52 }),
  stubble: Object.freeze({ wet: false, height: 0.12, color: 0x8c7849 }),
  fallow: Object.freeze({ wet: false, height: 0, color: 0x76634a }),
});
export function fieldState(def = {}, autumn = false) {
  return STATES[def.fieldStage] || (def.snow || def.winter || def.autumn || autumn ? STATES.stubble : STATES.seedling);
}
