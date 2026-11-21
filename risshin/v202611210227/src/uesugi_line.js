// 上杉編の戦の並び（K563・12月頭）。一戦ずつ足す。並びと出所は docs/chapter_uesugi.md。
//   戦の def は prototype/src/b_u<番号>_<名>.js（軽い型 light_battle.js）。ここは並びと名前だけ。作った戦だけを並べる
//   題の画面（SCENARIO_PICK）へは戦が揃うまで出さない
export const UESUGI_LINE = [
  { id: 'u01_fuse', town: '春日山', name: '布施の戦い', year: 1553, place: '信濃の布施（第一次川中島）', file: './b_u01_fuse.js' },
  { id: 'u02_saigawa', town: '春日山', name: '犀川の戦い', year: 1555, place: '信濃の犀川（第二次川中島）', file: './b_u02_saigawa.js' },
];
