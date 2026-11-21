// 紀州征伐の前後（根来寺の前の千石堀城・後の太田城）。手本と推定の区別は docs/battle_refs/t04_kishu_additions.md。
// 11/8 kaito：一戦を約15分の段の戦に作り替えた。戦ごとに別の置き場（段は一段一ファイル）。
//   千石堀城 → src/t04a_sengokubori/（舞台 scene.js・段 s1〜s5）
//   太田城   → src/t04b_ota/（舞台 scene.js・段 s1〜s5）
// 段の運び・遠くの大軍・使番の知らせは src/toyo15/kit.js。
export { t04a_sengokubori } from './t04a_sengokubori/index.js';
export { t04b_ota } from './t04b_ota/index.js';
