// 読み口の一覧。素材本体は開かず、各利用側の読み込みからまとめる。
export const ASSET_CONSUMERS = {
  humans: ['mhbody', 'soldier', 'mhhead', 'head', 'mhhand', 'domaru', 'kabuto', 'menpo', 'horse', 'yoroi'],
  props_ext: ['props_ext', 'bldg', 'kiyosu'], cgt: ['cgt', 'cgt_naibu'], yumi: ['yumi'],
  units_model: ['weapons'], generated_tex: ['tex_generated'], people_tex: ['tex_people'], war_speech: ['voice'],
  // 表の戦名に対応する b_*.js が利用する。小谷は castles/odani.js、比叡山と志賀は terrain_hiei.js。
};
export const TERRAIN = {
  moribe: 'moribe', okehazama: 'okehazama', inou: 'inou', sunomata: 'sunomata',
  shitaragahara: 'shitaragahara', anegawa: 'anegawa', arioka: 'arioka',
  inabayama: 'inabayama', mitsukuri: 'mitsukuri', odani: 'odani', iga: 'hijiyama',
  kanegasaki: 'kanegasaki', kinome: 'kinome', echizen: 'kinome', takato: 'takato', takato_siege: 'takato', takato_old: 'takato',
  mikatagahara: 'mikatagahara', tonezaka: 'tonezaka', tottori: 'tottori',
  tano: 'tano', iwamura: 'iwamura', shigisan: 'shigisan', miki: 'miki',
  shiga: 'hiei_wide', hieizan: 'hiei_wide', hieizan_old: 'hiei_wide', hiei_mtn: 'hiei_wide',
};
// 森部：低い湿地の標高、人・具足・兜・武器・弓・馬、陣と室内の部品、模様と声。
// 顔と体の旧素材は、従来どおり指定された時と読み込み失敗時にだけ読む。
const COMMON = ['mhbody', 'mhhead', 'mhhand', 'domaru', 'kabuto', 'menpo', 'weapons', 'yumi',
  'horse', 'props_ext', 'bldg', 'cgt', 'cgt_naibu', 'tex_generated', 'tex_people', 'voice'];
export const BATTLE_ASSETS = Object.fromEntries(Object.entries(TERRAIN).map(([battle, dem]) =>
  [battle, Object.freeze([...COMMON, 'dem_' + dem])]));
export function assetsForBattle(id) { return BATTLE_ASSETS[id] || COMMON; }
export const UNUSED_ASSETS = ['dem_azuchi', 'dem_hieizan', 'dem_nagashino', 'dem_okawachi', 'dem_usayama'];
export const OPTIONAL_ASSETS = ['soldier', 'head', 'yoroi', 'kiyosu'];
// 展示の甲冑は長篠城だけ。清洲の遠景は呼び出し側が置いた時だけ。
BATTLE_ASSETS.nagashinojo = Object.freeze([...COMMON, 'yoroi']);
ASSET_CONSUMERS['b_anegawa'] = ['dem_anegawa'];
ASSET_CONSUMERS['b_arioka'] = ['dem_arioka'];
ASSET_CONSUMERS['b_iga'] = ['dem_hijiyama'];
ASSET_CONSUMERS['b_inabayama'] = ['dem_inabayama'];
ASSET_CONSUMERS['b_inou'] = ['dem_inou'];
ASSET_CONSUMERS['b_iwamura'] = ['dem_iwamura'];
ASSET_CONSUMERS['b_miki'] = ['dem_miki'];
ASSET_CONSUMERS['b_kanegasaki'] = ['dem_kanegasaki'];
ASSET_CONSUMERS['b_kinome'] = ['dem_kinome'];
ASSET_CONSUMERS['b_mikatagahara'] = ['dem_mikatagahara'];
ASSET_CONSUMERS['b_mitsukuri'] = ['dem_mitsukuri'];
ASSET_CONSUMERS['b_moribe'] = ['dem_moribe'];
ASSET_CONSUMERS['b_okehazama'] = ['dem_okehazama'];
ASSET_CONSUMERS['b_shigisan'] = ['dem_shigisan'];
ASSET_CONSUMERS['b_shitaragahara'] = ['dem_shitaragahara'];
ASSET_CONSUMERS['b_sunomata'] = ['dem_sunomata'];
ASSET_CONSUMERS['b_takato_siege'] = ['dem_takato'];
ASSET_CONSUMERS['b_tano'] = ['dem_tano'];
ASSET_CONSUMERS['b_tonezaka'] = ['dem_tonezaka'];
ASSET_CONSUMERS['b_tottori'] = ['dem_tottori'];
ASSET_CONSUMERS['castles/odani'] = ['dem_odani'];
ASSET_CONSUMERS['terrain_hiei'] = ['dem_hiei_wide'];
for (const id of ['nagashinojo', 'tobinosu', 'suwahara', 'sekigahara', 'sanadamaru', 'sune', 'domyoji', 'nodafukushima', 'nagashima', 'honnoji', 'tennoji', 'miki', 'tedorigawa', 'echizen_old', 'kizugawa', 'saika', 'okawachi', 'echizen_ikko', 'mvp_yasen', 'mvp_shiro', 'mvp_toride', 'mvp_rojo']) {
  BATTLE_ASSETS[id] ||= Object.freeze([...COMMON]);
}
const users = new Map();
const active = new Map();
let generation = 0;
// 登録だけでは読まない。支度で選ばれた標高だけを渡し、終戦時には参照も外す。
export const terrainData = (name) => active.get(name) || null;
export function useTerrain(name, receive) {
  if (!users.has(name)) users.set(name, []);
  users.get(name).push(receive);
}
export async function prepareBattleAssets(id, current = () => true) {
  const seq = generation;
  const { readAsset } = await import('./asset_reader.js');
  for (const name of assetsForBattle(id)) {
    if (!name.startsWith('dem_')) continue;
    // 標高が読めない時（通信・古い版の消えた公開）は、戦を止めずに手書きの地形（各 b_*.js の base）で始める
    const data = active.get(name) || await readAsset(name, 'dem').catch((e) => { console.warn('標高を読めず、手書きの地形で続けます', name, e); return null; });
    if (seq !== generation || !current()) return false;
    if (!data) continue;
    active.set(name, data);
    for (const receive of users.get(name) || []) receive(data);
  }
  return seq === generation && current();
}
export function releaseBattleAssets() {
  generation++;
  for (const name of active.keys()) for (const receive of users.get(name) || []) receive(null);
  active.clear();
}
