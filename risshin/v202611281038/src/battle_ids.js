// 題の画面に要る戦の名前だけ。battles.js の DEF_BY_ID に戦を足した時は、ここにも足す。
import { TOYOTOMI_LINE } from './toyotomi_line.js';
import { TAKEDA_LINE } from './takeda_line.js';
import { TOKUGAWA_LINE } from './tokugawa_line.js';
import { UESUGI_LINE } from './uesugi_line.js';
import { DATE_LINE } from './date_line.js';
import { SHIMAZU_LINE } from './shimazu_line.js';
import { CHOSOKABE_LINE } from './chosokabe_line.js';   // H3 長宗我部家編（11/24）
import { MORI_LINE } from './mori_line.js';
import { IMAGAWA_LINE } from './imagawa_line.js';
import { HOJO_LINE } from './hojo_line.js';
import { IF_LINE } from './if_line.js';   // もしも編（K664）
export const BATTLE_IDS = ['inou', 'okehazama',
  'moribe',
  'sunomata',
  'shitaragahara',
  'inabayama',
  'mitsukuri',
  'nodafukushima',
  'odani',
  'nagashima',
  'takato',
  'honnoji',
  'shiga',
  'tonezaka',
  'tennoji',
  'shigisan',
  'arioka',
  'miki',
  'tedorigawa',
  'iga',
  'echizen',
  'kizugawa',
  'saika',
  'tano',
  'mikatagahara',
  'tottori',
  'iwamura',
  'okawachi',
  'nagashinojo',
  'tobinosu',
  'suwahara',
  'anegawa',
  'sekigahara',
  'sanadamaru',
  'sune',
  'kanegasaki',
  'domyoji',
  'hieizan',
  'kinome',
  'hiei_mtn',
  'takato_siege',
  'echizen_ikko',
  'mvp_yasen',
  'mvp_shiro',
  'mvp_toride',
  'mvp_rojo',
  'echizen_old',
  'takato_old',
  'hieizan_old',
  // 豊臣編は toyotomi_line.js の並びをそのまま（各戦の係はここを触らない）
  ...TOYOTOMI_LINE.map((b) => b.id),
  ...TOKUGAWA_LINE.map((b) => b.id),
  ...TAKEDA_LINE.map((b) => b.id),
  ...UESUGI_LINE.map((b) => b.id),
  ...DATE_LINE.map((b) => b.id),
  ...SHIMAZU_LINE.map((b) => b.id),
  ...MORI_LINE.map((b) => b.id),
  ...IMAGAWA_LINE.map((b) => b.id),
  ...CHOSOKABE_LINE.map((b) => b.id),
  ...HOJO_LINE.map((b) => b.id),
  ...IF_LINE.map((b) => b.id)];
