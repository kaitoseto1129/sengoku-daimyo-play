// 人の処理：場面と軍勢の共有。外部向けの入口は humans.js。


let WORLD = null;
let ARMY = null;
// 戦の切り替え時も、読み手が同じ場面を参照する。
function setHumanWorld(world) { WORLD = world; }
function setHumanArmy(army) { ARMY = army; }

export { WORLD, ARMY, setHumanWorld, setHumanArmy };
