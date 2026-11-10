// 骨の入った人・顔・甲冑・馬の公開窓口。既存の読み込み名を保つ。
export { HUM_BUDGET_EARLY_SEC, HUM, HUM_Q, preparationFrame, isSohei, HSTAT, humanBuilding } from './humans_shared.js';
export { loadHumans, DOMARU, loadDomaru, KABUTO, loadKabuto, kabutoStyle, wantsDomaru, displayArmor, YOROI, displayYoroi } from './humans_armor.js';
export { setFpArm, setFpCut } from './humans_materials.js';
export { setHumanCompiler } from './humans_face_materials.js';
export { prefetchFaces, makeHuman, efudaPose, disposeBattleHumans, updateHumans, showHuman } from './humans_runtime.js';
export { quantizeAttr } from './humans_crowd_geometry.js';
export { prefetchHumanShapes, warmLooks, primeHumans, warmBattleFaces, humanProgramSamples, stepHuman, humanCount, restOf } from './humans_prepare.js';
export { humanShadowLod, TECH_NAMES, startTech, techDur } from './humans_combat.js';
export { sharedHumanResources, humanCaches } from './humans_lifecycle.js';
export { HORSE } from './humans_horse_model.js';
export { loadHorse, primeHorses, horseCount, showHorse, proxyHorse, horseExtras } from './humans_horses.js';
export { naginata } from './humans_dress.js';
export { vatBakePending } from './crowd_vat.js';
