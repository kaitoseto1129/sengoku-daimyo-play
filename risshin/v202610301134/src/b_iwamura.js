import { useTerrain } from './asset_manifest.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { pressureTick } from './battle_pressure.js';
import * as THREE from 'three';
import { bodyGeometry, aimArm } from './units_model.js';
import { lodSwap } from './units_flags.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　岩村城の戦い・水晶山の夜討ち（天正三年十一月十日）
// 長篠の戦いの後、織田信忠は東美濃の岩村城（武田の秋山虎繁が守る）を囲んだ。
// 十一月十日の夜、水晶山の陣が夜討ちを受け、河尻秀隆・毛利長秀らがこれを退け、
// 城方の出撃と合流を阻んだ。城の開城・捕縛は後日の出来事。
// 足軽は河尻秀隆の手（信忠の軍）。①夕暮れ、水晶山の陣の柵の守りにつく ②夜、山道の夜討ちと城方の出撃を柵で受け止める
// ③退く武田勢を、城の麓まで追う
// 向き：北（-z）の山の上に岩村城。南（+z）の水晶山に信忠の陣
// ======================================================================
import { nobori, campfire, tawara, village, ishigaki, solidCircle, lumber, hatazao, koshisaku, tateNarabi, takataba, hut, jinmaku, kagaribiBatch } from './props.js';
import { timeslipField } from './timeslip_field.js';
import { S as SETTINGS } from './settings.js';
import { RANKS } from './state.js';
import { signal } from './audio.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { sightUnit } from './battle_sight.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { yamaLift, switchback } from './yamalift.js';
import { horiboriHeight, goten, monomi } from './castle_parts.js';
import { heightOf, buildCastlePlan, makeLordKeep, inPoly } from './castle_plan.js';
import { IWAMURA_SUISHOZAN_PLAN, IWAMURA_CASTLE_PLAN, HON as IWA_HON, SHU as IWA_SHU, ROAD as IWA_ROAD, SIDE_ROADS as IWA_SIDE_ROADS, castlePoint } from './castles/iwamura.js';

import { demDetail } from './dem.js';
import { distToPolyline } from './world.js';
import { groundAt } from './floors.js';
import { camNearMaterials } from './player.js';
import { castlePart } from './cgt_castle.js';
// 国土地理院の標高（asset_dem_iwamura.js。山頂は格子の中心から z+70m）は、そのまま混ぜると桁違いに急だった。
// そこで山の形（高さ）は手書きのままにし、尾根と谷の凹凸（まわり平均との差）だけを 0.3 倍で足す。曲輪の段は広げた尾根の本丸を最高所にそろえる。
let dem = null;
useTerrain('dem_iwamura', (data) => { if (!CASTLE_HEIGHT) dem = data; });
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FENCE_Z = -6;                         // 陣の柵
const CASTLE = { x: IWA_HON.x, z: IWA_HON.z };   // 岩村城・本丸（最高所。本丸約717m・山麓との差約180mの高い山城）
const FOOT = { x: 0, z: -90 };              // 城の麓（追う先。登城道はここから主郭・本丸へ折れながら登る）
const POSTS = [{ x: -16, z: FENCE_Z + 5 }, { x: 18, z: FENCE_Z + 5 }];   // 柵の持ち場（篝火を焚く所）
const POST_NAMES = ['西の篝火', '東の篝火'];
function fireTask(rt) {
  return `${HI(rt) ? '組と' : ''}${POST_NAMES[rt.flags.firePost]}へ。火を焚け`;
}
function fireProgress(F) {
  const next = POST_NAMES[F.firePost];
  return `${next}に近づき「篝火を焚く」を一秒半長押し`;
}
// 手当ての釦が出ない理由も、既存の任務札と退避の印へそろえる。
function treatmentOrder(rt) {
  const p = rt.player;
  if (p.treatmentLeft <= 0) return '布は使い切った。味方の後ろで身を守れ';
  if (p.treatmentNext > rt.t)
    return `味方の後ろで待て。手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
  if (p.treating) return 'そのまま押し続け、傷を縛れ';
  // 被弾直後の待ち時間を、退避先を探す案内と取り違えさせない。
  if (!p.treatmentReady && p.u.lastHitT <= 6)
    return `味方の後ろへ。手当てまであと${Math.max(1, Math.ceil(6 - p.u.lastHitT))}秒`;
  if (!p.treatmentReady && (p.aiming || p.guardOn)) return '味方の後ろで止まり、構えを解け';
  return p.treatmentReady ? '「手当て」を三秒長押し' : '味方の後ろの印へ下がり、止まれ';
}
function watchTask(F) {
  if (F.raidReturning) return '口の印を通り、柵の内へ戻れ';
  return F.raidCrossing ? `柵の内を回り、${F.raidMouthX ? '東の脇口' : '正面の口'}へ` :
    `${F.raidMouthX ? '東の脇口' : '正面の口'}で夜討ちに備えよ`;
}
// 火がそろった後も、待つ理由と守る場所を同じ札で伝える。
function watchProgress(rt, spoken = false) {
  const F = rt.flags;
  if (F.raidReturning) return '敵を防ぎ、口の印から柵の内へ戻れ';
  // 支度中も道標と同じ口へ案内し、東から戻る時は連絡道を通す。
  if (F.raidCrossing) return spoken ?
    `柵の内を回れ。${F.raidMouthX ? '東の脇口' : '正面の口'}を守れ` : '連絡道の印へ。柵の内を回れ';
  // 着いた後は移動を促さず、夜討ちに備えて持ち場を守らせる。
  const p = rt.player.u.pos;
  if (Math.hypot(p.x - F.raidGuide.x, p.z - F.raidGuide.z) >= 6)
    return `${F.raidMouthX ? '東の脇口' : '正面の口'}の印へ。柵の内の道を通れ`;
  // 敵の到着時刻を予告せず、待つ理由と今することを伝える。
  if (!spoken) {
    return rt.world.nightAmount() < 0.5 ? '夜討ちに備え、ここで味方と見張れ' :
      '柵の外を見張れ。敵が来たら味方と受けよ';
  }
  return rt.world.nightAmount() < 0.5 ?
    '夜になるまで、ここで味方と見張れ' :
    'ここで見張れ。敵が来たら柵の内で受けよ';
}
// 仮小屋の寸法を外観と床下の平場で共有する。配置・往来は推定。
const CAMP_HOUSES = [-43, 43].map(x => [x, 27, 5, 9]);
// 番小屋と兵糧小屋も、外観・床下・南の階下で同じ寸法を使う。
const CAMP_SERVICE_HOUSES = [[22, 28, 7, 5], [-30, 66, 6, 4]];
// 村の小堂も、外観・床下・階下への道で同じ寸法を使う。
const VILLAGE_HALL = [-209, 138, 6, SETTINGS.quality === 'high' ? 6.8 : 4];
const CAMP_HOUSE_PATHS = CAMP_HOUSES.map(([x, z, , d]) =>
  [[Math.sign(x) * 15, 35], [x, 35], [x, z + d / 2 + 1.5]]).concat(
  CAMP_SERVICE_HOUSES.map(([x, z, , d], i) => {
    // 番小屋は幕の東側から、兵糧小屋は南を回って板戸へ至る推定の往来。
    // 米俵のある北側から小屋を突き抜けず、階段の下で道を止める。
    const lane = i === 0 ? 35 : 72;
    return [[i === 0 ? 15 : 0, lane], [x, lane], [x, z + d / 2 + 1.5]];
  }));
const RAID_PATHS = [
  [[0, -24], [0, FENCE_Z + 3]],
  [[66, -26], [66, 12]],
  [[0, FOOT.z], [20, -62], [0, -36], [0, FENCE_Z + 3]],
  [[-8, -24], [0, -18], [0, FENCE_Z + 3]],
  [[8, -30], [0, -24], [0, FENCE_Z + 3]],
  [[0, -36], [0, FENCE_Z + 3]],
];
// 柵の東の開口（z6〜20）を通り、陣幕より手前で両口をつなぐ。
// 自動操作も寄せ手も同じ道を使う。道と高さは初めに一度だけ作る。
const MOUTH_LINK = [[0, FENCE_Z + 3], [0, 14], [52, 14], [66, 12]];
const MOUTH_BACK = MOUTH_LINK.slice().reverse();
const RETURN_PATHS = RAID_PATHS.map((path, i) => {
  const back = path.slice().reverse();
  back.push([path[0][0], -132 - i * 8]);
  return back;
});
// 追撃も地形をならした九十九折りを通る。兵と自動操作で同じ道を使う。
const CHASE_PATH = [[0, FENCE_Z + 3], ...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20)];
const CHASE_EAST_PATH = [...MOUTH_BACK, ...CHASE_PATH.slice(1)];
// 手当てに退く時も同じ山道を戻る。麓から陣へ直進すると切岸へ迷い込む。
const REST_PATH = [...CHASE_PATH].reverse().concat([[0, 14], [4, 32]]);
const REST_EAST_PATH = [...CHASE_EAST_PATH].reverse().concat([[52, 14], [4, 14], [4, 32]]);
// 『信長公記』巻八では城方を城へ追い入れる。城口の手だけは山中へ散る退路と分ける。
// 道の細部は復元。既存の九十九折りと登城道を共用し、切岸へ直進させない。
RETURN_PATHS[2] = [...CHASE_PATH, ...IWA_ROAD];
const SCOUT_PATH = [[0, -10], [0, FENCE_Z + 3]];
// 恵那市の富田地区の説明では、中世の城下は富田方面にあった。
// https://www.city.ena.lg.jp/material/files/group/31/iwamuratomida.pdf
// 西南の既存の村は名のない在所の推定復元。富田の城下や大円寺をここへ移さない。
// 民の人数・小堂・畦道も復元。陣と城へは登らず、刈田の平らな小段の奥へ退く。
// 戦場の端ではないので避難先で姿を残し、危険が再び迫れば小段の内で逃げ直す。
const PEOPLE_ROADS = [
  // 百姓の家族は東の外側、町人の一行は田寄りへ分ける。
  // 前の一行へ追いついて畦際に詰まらず、田の南端を過ぎてから奥へ曲がる。
  [[-138, 103], [-138, 126], [-138, 160], [-155, 175]],
  // 町人・商人は家並みの東の空き地で見物。家越しに戦を眺めず、田の東縁を南へ退く。
  // 村の田は z126〜154.6、東端 x-146.2。田の中を斜めに突っ切らない。
  [[-143, 119], [-143, 123], [-143, 158], [-174, 176]],
  // 堂の一行は田の西端（x-204.6）の外、堂より南の空き地から遠巻きに見る。
  // 東の家族二組の道を横切らず、西縁を下って田の南端（z154.6）の外から奥へ退く。
  [[-210, 157], [-210, 162], [-204, 170], [-190, 176]],
  // 小堂の参道を南へ出た空き地。堂や家並み越しに戦を見ず、田の南西から奥へ退く。
  // 僧と年寄りの待機先は西側へ分ける。東へ寄せると、先着した二人が
  // 堂の一行の最後の道（-204,170 → -190,176）を個別の避難先で塞いでしまう。
  // 待機先の候補が五メートル散っても、後続の畦道には掛からない間隔を残す。
  [[-216, 166], [-213, 173], [-210, 178]],
];
// 共通室内の戸口は南向き。階下から西へ回り、田の西端（x-204.6）の外を通る。
const PEOPLE_TEMPLE_APPROACH = [
  [VILLAGE_HALL[0], VILLAGE_HALL[1] + VILLAGE_HALL[3] / 2 + 1.5],
  [-216, VILLAGE_HALL[1] + VILLAGE_HALL[3] / 2 + 1.5],
  [-216, 148], [-210, 157], [-216, 166],
];
// 避難する人の畦道・参道。兵の道と分け、田際に車の轍を描かない。
const PEOPLE_FOOTPATHS = new Set([...PEOPLE_ROADS, PEOPLE_TEMPLE_APPROACH]);
const peopleRoute = (i) => PEOPLE_ROADS[i].slice(1).map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  { x: -138, z: 103, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: peopleRoute(0), routeEnd: 'wait' },
  { x: -143, z: 119, kinds: ['townsman', 'merchant', 'woman', 'child'], route: peopleRoute(1), routeEnd: 'wait' },
  { x: -210, z: 157, kinds: ['monk', 'farmer', 'woman'], route: peopleRoute(2), routeEnd: 'wait' },
  // 堂の僧と年寄りも、参道の先の空き地から遠巻きに見る。
  // 兵や火が迫れば堂へ引き返さず、田の西側から南の小段へ退く。
  { x: -216, z: 166, kinds: ['monk', 'elder'], mode: 'watch',
    route: peopleRoute(3), routeEnd: 'wait' },
];
let FIELD_PATHS_ = null; // 下で決まる道の並びを使うので、初めて要る時に組む
// 両口を結ぶ往来も、兵の道順・地ならしと同じ線で描き、草木を除ける。
const fieldPaths = () => FIELD_PATHS_ || (FIELD_PATHS_ = [[[0, 120], [0, FENCE_Z], ...CHASE_PATH.slice(1), ...IWA_ROAD], ...IWA_SIDE_ROADS, ...(SETTINGS.quality === 'high' ? [...HOUSE_APPROACH_PATHS, ...CAMP_HOUSE_PATHS] : []), ...RAID_PATHS, MOUTH_LINK, SCOUT_PATH, ...RETURN_PATHS, ...CAMP_ENTER, ...CAMP_EXIT, ...PEOPLE_ROADS, PEOPLE_TEMPLE_APPROACH]);
// 道の色と木の除け方は読み込み時だけ調べる。道の配列は共用する。
function fieldRoadDistance(x, z) {
  let d = Infinity;
  for (const path of fieldPaths()) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}

// 柵の内を正、外を負にする。中央と東の口は既存の道幅を残す。
const CAMP_EDGES = [
  [-60, -2, -8, -6], [8, -6, 60, -2],
  [-60, 30, -60, -2], [60, -2, 60, 6], [60, 20, 60, 30],
];
function campEdge(x, z) {
  let nearest = Infinity, signed = Infinity;
  for (const [ax, az, bx, bz] of CAMP_EDGES) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < nearest) { nearest = d; signed = d * Math.sign(dx * (z - az) - dz * (x - ax)); }
  }
  return signed;
}
function campEarthwork(x, z) {
  if (Math.abs(x) > 70 || z < -18 || z > 38 || castleClear(x, z)) return 0;
  const road = THREE.MathUtils.smoothstep(fieldRoadDistance(x, z), 3.5, 5.5);
  if (!road) return 0;
  const d = campEdge(x, z);
  // 内側の低い土塁と、外側の底幅二メートルの空堀。法面は既存の格子へなじませる。
  const bank = 0.8 * (1 - THREE.MathUtils.smoothstep(Math.abs(d - 3), 0, 4));
  const ditch = 0.6 * (1 - THREE.MathUtils.smoothstep(Math.abs(d + 3), 1, 4));
  const end = 1 - THREE.MathUtils.smoothstep(z, 30, 38);
  return (bank - ditch) * road * end;
}

function campGround(W) {
  const mesh = W.terrain, geo = mesh.geometry, pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 4), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    c.setRGB(0.5, 0.44, 0.3);
    W.def.tint(x, z, pos.getY(i), c);
    colors.set([c.r, c.g, c.b, (1 - THREE.MathUtils.smoothstep(Math.abs(x), 85, 110))
      * THREE.MathUtils.smoothstep(z, -125, -100) * (1 - THREE.MathUtils.smoothstep(z, 90, 120))], i * 4);
  }
  // 共通の色指定は草と土の配分に使われるため、岩村の地面だけ実際の色にも反映する。
  // 下地を混ぜた直後に色を付け、共通側の落ち葉・小石・濡れ・血の跡と夜の補正をその上へ残す。
  geo.setAttribute('iwaSoil', new THREE.BufferAttribute(colors, 4));
  const mat = mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|iwaSoil';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.vertexShader = 'attribute vec4 iwaSoil; varying vec4 vIwaSoil;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIwaSoil = iwaSoil;');
    sh.fragmentShader = 'varying vec4 vIwaSoil;\n' + sh.fragmentShader
      .replace('vec3 col = grass * w.x + dirt * w.y + mud * w.z;', `
        vec3 col = grass * w.x + dirt * w.y + mud * w.z;
        // 土の絵を単色へ置き換えず、草・泥それぞれの粒と暗い窪みを残す。
        // 配分用の明るい色をそのまま塗ると、夕方も夜も雪原のようになる。
        vec3 iwaColor = col * clamp(vIwaSoil.rgb / vec3(0.36, 0.30, 0.20), vec3(0.65), vec3(1.4));
        // 霜は北向きの法面と柵の北の日陰だけ。道と踏み跡、陣内には積もらせない。
        float iwaFenceZ = -6.0 + clamp(abs(vWP.x) - 8.0, 0.0, 52.0) * 4.0 / 52.0;
        float iwaShade = max(smoothstep(0.15, 0.6, -normalize(vWN).z),
          (1.0 - smoothstep(2.0, 9.0, iwaFenceZ - vWP.z)) * step(vWP.z, iwaFenceZ));
        float iwaFrost = iwaShade * smoothstep(0.3, 0.65, w.x) * (1.0 - trod)
          * smoothstep(0.45, 0.7, macro2) * 0.24;
        iwaColor = mix(iwaColor, iwaColor * vec3(1.15, 1.22, 1.3), iwaFrost);
        col = mix(col, iwaColor, vIwaSoil.a);`);
  };
  mat.needsUpdate = true;
  // 口・篝火・小屋を結ぶ往来だけを刻む。等間隔の平行線で陣を畑の畝にしない。
  for (const path of [
    [[0, -3], [-2, 12], [0, 27], [0, 40]],
    [[-16, -1], [-10, 9], [-2, 12]],
    [[18, -1], [13, 8], [0, 16]],
    // 高画質の番小屋は南の板戸へ向かう道だけを使う。中心へ引くと西壁を横切る。
    ...(SETTINGS.quality === 'high' ? [] : [[[0, 27], [10, 30], [22, 28]]]),
    ...(SETTINGS.quality === 'high' ? CAMP_HOUSE_PATHS : []),
  ]) W.stampTrail(path, 2.2, 65);
  const footprint = W.footprint;
  W.footprint = function (x, z, hoof, rot) {
    footprint.call(this, x, z, hoof, rot);
    if (this.feet && Math.abs(x) < 32 && z > -2 && z < 48) {
      this.feet.material.opacity = 0.22;
      this.stampWear(x, z, 1.5, 18);
    }
  };
}

// 岩村の材質だけを設営時に直す。カメラの距離は描く側で読み、毎コマ形を作らない。
// 陣の背にそびえる岩村城の山（水晶山から百二十メートル先で百五十メートル立ち上がる）を、平野と同じ霞で消さない。
// 目の高さより上か城山の麓より北（z-70 より奥）の、遠い山肌と木だけ（50〜80m より先）霞を三割半ほどに抑え、夕暮れの空に城山の暗い塊と林と切岸を見せる。平地の兵と旗の霞は変えない（10/28）。
function iwamuraMountainHaze(W) {
  const done = new Set();
  const patch = (mat) => {
    if (!mat || done.has(mat) || !mat.fog) return;
    done.add(mat);
    const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${key}|岩村の城山の霞`;
    mat.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
        .replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
          'fogFactor = min(fogFactor, mix(1.0, 0.36, max(smoothstep(-2.0, 14.0, vFogOff.y), 1.0 - smoothstep(-95.0, -70.0, cameraPosition.z + vFogOff.z)) * smoothstep(50.0, 80.0, fogD)));\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );');
    };
    mat.needsUpdate = true;
  };
  const each = (m) => { for (const x of Array.isArray(m?.material) ? m.material : [m?.material]) patch(x); };
  each(W.terrain);
  for (const m of W.treeMeshes || []) each(m);
}
// 城山の段の石垣・柵・旗だけ：遠い所（50〜80m より先）の霧を三割ほどに抑える（材質は複製して、近くの陣の石垣・柵の霧は変えない）。
function stepHaze(group) {
  const made = new Map();
  group.traverse((o) => {
    if (!o.material || Array.isArray(o.material)) return;
    let m = made.get(o.material);
    if (!m) {
      const src = o.material; m = src.clone();
      if (m.fog) {
        const compile = src.onBeforeCompile, key = src.customProgramCacheKey();
        m.customProgramCacheKey = () => `${key}|岩村の段の霧`;
        m.onBeforeCompile = function (shader, renderer) {
          compile.call(this, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
            .replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
              'fogFactor = min(fogFactor, mix(1.0, 0.3, smoothstep(50.0, 80.0, fogD)));\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );');
        };
      }
      made.set(o.material, m);
    }
    o.material = m;
  });
}
function softenIwamuraBoard(mat, leaves = false) {
  if (!mat || Array.isArray(mat) || mat.userData.iwaNear) return;
  mat.userData.iwaNear = true;
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|iwaNear|' + leaves;
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    // 岩村の草だけ、裏からの照りを弱めて十一月の枯れ色へ寄せる。
    // 木や陣幕には草の処理がないので、その照明は変えない。
    if (leaves && sh.fragmentShader.includes('float rootK =')) {
      sh.fragmentShader = sh.fragmentShader
        .replace('back * tipK * 0.3', 'back * tipK * 0.12')
        .replace('mix(0.85, 1.0, rootK) * 1.35', 'mix(0.85, 1.0, rootK)')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float iwaDry = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, iwaDry * vec3(1.08, 0.9, 0.62), 0.65);`);
    }
    sh.vertexShader = 'varying vec3 vIwaBoardView;\n' + sh.vertexShader.replace(
      '#include <fog_vertex>', '#include <fog_vertex>\nvIwaBoardView = mvPosition.xyz;');
    sh.fragmentShader = 'varying vec3 vIwaBoardView;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
      ${leaves ? `#ifdef USE_MAP
        // 負の座標は葉房の芯。絵の端を繰り返して芯へ穴を開けない。
        if (vMapUv.x >= 0.0 && vMapUv.y >= 0.0)
          diffuseColor.a = min(diffuseColor.a, texture2D(map, vMapUv, -2.0).a);
      #endif` : ''}
      #include <alphatest_fragment>`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float iwaNear = smoothstep(0.8, 3.5, length(vIwaBoardView));
      vec2 iwaPixel = floor(gl_FragCoord.xy);
      float iwaMesh = fract(iwaPixel.x * 0.75487766 + iwaPixel.y * 0.56984029);
      if (iwaNear < iwaMesh) discard;`);
  };
  mat.needsUpdate = true;
}

function detailIwamuraRock(mat, world) {
  if (mat.userData.iwaRock) return;
  mat.userData.iwaRock = true;
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|iwaRock';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.uniforms.iwaStone = world.groundU.tStone;
    sh.uniforms.iwaStoneNight = world.nightU;
    sh.vertexShader = 'varying vec3 vIwaRock;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvIwaRock = position;');
    sh.fragmentShader = 'uniform sampler2D iwaStone; uniform float iwaStoneNight; varying vec3 vIwaRock;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 iwaGrain = texture2D(iwaStone, (vIwaRock.xy + vIwaRock.zy) * 0.7).rgb;
      // 繰り返す等高線ではなく、途中で切れる二つの割れ面。
      float iwaSplit = abs(vIwaRock.y + vIwaRock.x * 0.35 - vIwaRock.z * 0.18 - 0.24
        + sin(vIwaRock.x * 9.0 + vIwaRock.z * 5.0) * 0.025);
      float iwaBranch = abs(vIwaRock.x - vIwaRock.z * 0.2 + 0.16
        + sin(vIwaRock.z * 8.0 + vIwaRock.y * 4.0) * 0.035);
      float iwaCrack = (1.0 - smoothstep(0.006, 0.025, iwaSplit)) * (1.0 - smoothstep(0.35, 0.7, abs(vIwaRock.z)))
        + (1.0 - smoothstep(0.004, 0.018, iwaBranch)) * (1.0 - smoothstep(0.12, 0.4, abs(vIwaRock.y + 0.12)));
      diffuseColor.rgb *= (0.95 + iwaGrain * 0.8) * (1.0 - min(1.0, iwaCrack) * 0.38);
      float iwaMoss = smoothstep(0.1, 0.7, vIwaRock.y) * (0.5 + 0.5 * sin(vIwaRock.x * 12.0 + vIwaRock.z * 9.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 1.08, 0.58), iwaMoss * 0.65);`);
    // 月を背にした岩も、上面の粒と腹の陰を残す。土や昼の照明には足さない。
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * iwaStoneNight
        * (0.06 + smoothstep(-0.3, 0.6, vIwaRock.y) * 0.12);`);
  };
}
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

// 六月頃から十一月の夜討ちまでを、待ち時間を足さず戦略の時間で縮める。
// 日数・蓄え・士気は遊びの補完。実際の兵糧量や包囲開始日を確定する数ではない。
const SIEGE_DAYS = [30, 31, 31, 30, 31, 10];
function siegeStart() {
  const s = { days: 0, food: 180, morale: 85, held: true, pressure: 0, relief: 'unknown' };
  for (const days of SIEGE_DAYS) {
    s.days += days;
    s.food = Math.max(0, s.food - days);
    // 籠城が長引いても夜討ちに出る力は残す。空腹だけで総崩れにはしない。
    if (s.food < 90) s.morale = Math.max(72, s.morale - days * 0.12);
  }
  return s;
}
function siegeRetreatRatio(s, leaderLost) {
  // 兵糧不足の寄せは損を抱えて長く戦えない。無傷の寄せを時間だけで退かせない。
  return (leaderLost ? 0.8 : 0.65) + Math.max(0, 1 - s.food / 30) * 0.05;
}

// 信忠の本陣は x±8、z38〜50 の陣幕。口は南だけで、北の幕は通れない。
// 入る使番も出る兵も南の口を通る。南の鍋（±11付近）と東の馬繋ぎを大回りし、道の配列は使い回す。
const CAMP_EXIT = [
  [[-6.4, 48], [0, 48], [0, 60], [-15, 60], [-15, 35]],
  [[6.4, 48], [0, 48], [0, 60], [15, 60], [15, 35]],
];
const CAMP_ENTER = [
  [[-15, 35], [-15, 60], [0, 60], [0, 48]],
  [[15, 35], [15, 60], [0, 60], [0, 48]],
];
function inCamp(x, z) { return Math.abs(x) < 8.7 && z > 37.3 && z < 50.7; }
// 追撃前に柵の外へ出た兵も、口を通って集合する。点列は全員で使い回す。
const GATHER_RETURN = [[0, -12], [0, 6]];
const GATHER_EAST_RETURN = [[66, -12], [66, 12], [52, 14]];
function campWay(army, u, goal) {
  const p = u.pos;
  if (u.group?.iwGather && !u.target && !u.atk && !u.swing && !u.combatRetreat && !(u.group.regroupT > 0)) {
    const fenceZ = fencePostZ(p.x) - 1;
    if (!u._iwGatherReturn && p.z < fenceZ && Math.abs(p.x) < 80) {
      u._iwGatherReturn = p.x > 40 ? GATHER_EAST_RETURN : GATHER_RETURN;
      u._iwGatherI = 0;
      // すでに口にいる者を、柵の外へ引き返させない。
      if (Math.abs(p.x - u._iwGatherReturn[0][0]) < 3) u._iwGatherI = 1;
    }
    const back = u._iwGatherReturn;
    if (back) {
      while (u._iwGatherI < back.length && Math.hypot(p.x - back[u._iwGatherI][0], p.z - back[u._iwGatherI][1]) < 1.5) u._iwGatherI++;
      if (u._iwGatherI < back.length) {
        const q = u._iwWay || (u._iwWay = { x: 0, z: 0 });
        q.x = back[u._iwGatherI][0]; q.z = back[u._iwGatherI][1];
        return q;
      }
      u._iwGatherReturn = null;
    }
  } else u._iwGatherReturn = null;
  // 使番は戦闘隊と別の役目。南の口までの坂も道としてならしてある。
  const enter = inCamp(goal.x, goal.z);
  // 途中で下知が変わったら、前の入退場の道を引き継がない。
  if (u._iwEntering !== enter) { u._iwExit = null; u._iwEntering = enter; }
  let path = u._iwExit;
  if (!path && enter && !inCamp(p.x, p.z)) {
    path = u._iwExit = CAMP_ENTER[p.x < 0 ? 0 : 1]; u._iwExitI = 0;
    if (p.z >= 60) u._iwExitI = 1;
    if (p.z > 50 && Math.abs(p.x) < 3) u._iwExitI = 3;
  } else if (!path && !enter && inCamp(p.x, p.z)) {
    path = u._iwExit = CAMP_EXIT[p.x < 0 ? 0 : 1]; u._iwExitI = 0;
    // すでに口の前なら、床几の側まで戻らずそのまま出る。
    if (p.z > 47 && Math.abs(p.x) < 3) u._iwExitI = 2;
  }
  if (!path) return goal;
  while (u._iwExitI < path.length && Math.hypot(p.x - path[u._iwExitI][0], p.z - path[u._iwExitI][1]) < 1) u._iwExitI++;
  if (u._iwExitI >= path.length) { u._iwExit = null; return goal; }
  const q = u._iwWay || (u._iwWay = { x: 0, z: 0 });
  q.x = path[u._iwExitI][0]; q.z = path[u._iwExitI][1];
  return q;
}

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 夜討ち・麓の追撃の下地は保つ。北西へ下る曲輪は下の共通の段でならす。
  h += 10 * gauss(x, z, 0, 50, 3000) + 92 * gauss(x, z, 0, -314, 11000);
  if (dem) h += demDetail(dem, x, z, { xy: 1, ox: CASTLE.x, oz: CASTLE.z, cz: 70, win: 25, scale: 0.3 });
  // 城を囲む尾根・谷の奥の山並み（形は東美濃の山地として推定）。
  h += 54 * gauss(x, z, -210, -250, 12500) + 65 * gauss(x, z, 230, -210, 14500) + 42 * gauss(x, z, 80, -400, 18000);
  // 西南の村と刈田の小段。川・海や近世の城下の街割りを作り足さない。
  const d = Math.max(Math.abs(x + 175) - 42, Math.abs(z - 137) - 48);
  const t = Math.max(0, Math.min(1, d / 18));
  return 0.7 + (h - 0.7) * t * t * (3 - 2 * t);
}
// 水晶山砦（織田の陣）の段と、岩村城（曲輪の段）の二つを下地に重ねる（castles/iwamura.js）
const HORI_HEIGHTS = IWAMURA_CASTLE_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) {
    const campHeight = heightOf(IWAMURA_SUISHOZAN_PLAN, liftedTerrain, 6);
    // 移した曲輪の下に山の肩を置く。百メートルの比高を三メートルの縁だけで立ち上げない。
    // 曲輪の高さは元の下地で先に決め、肩を足した分だけ城全体が高くなるのを防ぐ。
    const terraces = IWAMURA_CASTLE_PLAN.kuruwa.map((k) => ({ ...k, level: k.level(campHeight) }));
    const castleBase = (x, z) => {
      let h = campHeight(x, z), shoulder = h, ceiling = Infinity;
      if (z < FOOT.z) for (const k of terraces) {
        let distance = Infinity;
        for (let i = 0, j = k.poly.length - 1; i < k.poly.length; j = i++) {
          const a = k.poly[j], b = k.poly[i], dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
        }
        // 切岸の外は丸い山腹へつなぐ。一定勾配の円錐を重ねると、
        // 見上げた稜線が大きな三角の板になる。曲輪の足元の高さは保つ。
        const t = Math.min(1, distance / 140), blend = 1 - t * t * (3 - 2 * t);
        shoulder = Math.max(shoulder, h + Math.max(0, k.level - 3 - h) * blend);
        // 移す前の山頂が曲輪より八十メートルも高く残ると、三メートルの縁で
        // 低い平場へ落ち、巨大な三角の崖になる。低い段から外へ山腹の上限をつなぐ。
        // 曲輪の床・土塁・堀切は、この後に同じ縄張りから作る。
        ceiling = Math.min(ceiling, k.level - 3 + distance * 0.9);
      }
      // 高い肩を三十メートルで立ち上げると、麓からは空を断つ壁になる。
      // 麓より城側だけを五十メートルでつなぎ、帯曲輪の手前で元の高さへ戻す。
      // 柵・追撃路・集合の平場は保つ。曲輪の縁に新しい急段を作らない。
      const t = Math.max(0, Math.min(1, (FOOT.z - z) / 50));
      h += (Math.min(shoulder, ceiling) - h) * t * t * (3 - 2 * t);
      for (const dip of HORI_HEIGHTS) h += dip(x, z);
      return h;
    };
    CASTLE_HEIGHT = heightOf({ ...IWAMURA_CASTLE_PLAN, kuruwa: terraces }, castleBase, 3);
  }
  return CASTLE_HEIGHT(x, z);
}

// 曲輪と道だけ木を除く。建物・虎口に自動の木が食い込まない。
function castleClear(x, z) {
  if (z > -150) return false;
  if (SETTINGS.quality === 'high') for (const [px, pz, w, d] of HOUSE_CLEAR_AREAS)
    if (Math.abs(x - px) < w / 2 + 2 && Math.abs(z - pz) < d / 2 + 3) return true;
  if (SETTINGS.quality === 'high') for (const path of HOUSE_APPROACH_PATHS)
    if (distToPolyline(x, z, path) < 2) return true;
  for (const k of IWAMURA_CASTLE_PLAN.kuruwa) if (inPoly(k.poly, x, z)) return true;
  for (const path of IWAMURA_CASTLE_PLAN.paths) for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 4) return true;
  }
  return false;
}

const CASTLE_HOUSES = [
    // 堂の規模は推定。高画質では村の小堂と同じく外陣の奥行きを確保する。
    // 内へ引いた入口と内陣の格子戸の間を二メートル以上空け、
    // 礼盤前の通り道を一・一メートル取り、右脇の内陣口へ回れるようにする。
    // 外観・窓割り・室内・床下の小段はこの寸法を共有する。
    [34, -191.5, 7, SETTINGS.quality === 'high' ? 6.8 : 5, '神宮寺の堂', 'hondo'],
    // 高画質の社は神座・供物台を残して台前に七十センチの通路を取る推定復元。
    // 床下の平場・外観・窓割り・室内には同じ奥行きを渡す。
    [34, -201, 5, SETTINGS.quality === 'high' ? 5 : 4, '八幡の社', 'shrine'],
    [0, -189, 7, 6, '八幡曲輪の侍屋敷', 'yashiki'],
    [-16, -216, 5, 6, '二の丸の長屋', 'nagaya'],
    [1, -238, 4, 6, '主郭の兵糧蔵', 'kura'],
    // 番所の規模は推定。高画質では奥行きを一メートル広げ、
    // 文机前の筵と間仕切りの板戸の間に約一メートルの板間を残す。
    // 外観・梁・床・入口の階段・接続道もこの寸法を共用する。
    [-7, -174, 5, SETTINGS.quality === 'high' ? 5 : 4, '三の丸の番所', 'bansho'],
  ].map(([x, z, ...house]) => [...castlePoint(x, z), ...house]);

// 添え小屋の位置・用途は推定。外観と室内と床下の小段で同じ寸法を使う。
const CASTLE_OUTBUILDINGS = [
  [-88, -332, 4, 9, '八幡の兵の長屋', 'nagaya'],
  [-88, -318, 4, 6, '八幡の物置', 'kura'],
  [8, -272, 4, 9, '曲輪の兵の長屋', 'nagaya'],
  [-48, -207, 5, 8, '出丸の兵の長屋', 'nagaya'],
  [-47, -194, 4, 6, '出丸の物置', 'kura'],
];
// 曲輪外に移した社も、壁・軒・正面の階段へ木を生やさない。
// 判定する寸法は外観と共用し、一覧は設営前に一度だけ作る。
const HOUSE_CLEAR_AREAS = CASTLE_HOUSES.concat(CASTLE_OUTBUILDINGS);

// 添え小屋・堂・社・侍屋敷の南の階下から既存の曲輪道へ。配置は推定。
// 建物・隣棟・庭の柵を横切らず、道の絵と地面ならしで同じ点列を使う。
// 戸口の終点は床下の平場に収め、板戸・敷居・階段は共通室内に任せる。
const APPROACH_HOUSES = CASTLE_OUTBUILDINGS.concat(CASTLE_HOUSES, [VILLAGE_HALL]);
const HOUSE_APPROACH_PATHS = APPROACH_HOUSES.map(([x, z, , d], i) => {
  const front = z + d / 2 + 1.5;
  // 小堂の南の階下から、村人も使う畦道へ。堂の床下を道で横切らない。
  if (i === APPROACH_HOUSES.length - 1) return [[x - d / 2 - 1.5, z], ...PEOPLE_TEMPLE_APPROACH];
  const links = [
    [[-80, front], [-80, -335], [-70, -335]],
    [[-80, front], [-80, -335], [-70, -335]],
    [[13, front], [13, -273], [10, -273]],
    [[-40, front], [-40, -210]],
    [[-40, front], [-40, -199]],
  ];
  // 堂と社も、移した後の南の階下へつなぐ。旧座標の枝道の終点は北側に回ってしまう。
  // 八幡曲輪の分岐から西脇を回り、堂の壁・入口の板縁を横切らない推定の参道。
  const templeLink = castlePoint(24, -196);
  // 侍屋敷は地形の反転後も戸口が南側。旧枝道の裏口から入らせず、
  // 東の庭柵の開口（奥行き -345〜-342）を抜けて曲輪道へつなぐ。
  // 正面の階下から柵までは同じ高さを保ち、東脇を回って隣棟を避ける。
  if (i === CASTLE_OUTBUILDINGS.length + 2)
    return [[x, front], [-76, front], [-76, templeLink[1]], templeLink];
  // 長屋・兵糧蔵・番所も南の階下へつなぐ。反転前の枝道は北の壁側へ
  // 着くため、建物を横切らず曲輪の道へ回れる往来を別に取る推定復元。
  // 既存の室内・板戸・階段を保ち、道の絵・除草・地面ならしで共用する。
  const houseIndex = i - CASTLE_OUTBUILDINGS.length;
  if (houseIndex === 3) {
    const [roadX, roadZ] = castlePoint(-10, -218);
    return [[x, front], [roadX, front], [roadX, roadZ]];
  }
  if (houseIndex === 4) {
    const [roadX, roadZ] = castlePoint(6, -240);
    return [[x, front], [roadX, front], [roadX, roadZ]];
  }
  if (houseIndex === 5) {
    const [roadX, roadZ] = castlePoint(0, -172), west = x - 4.7;
    return [[x, front], [west, front], [west, roadZ], [roadX, roadZ]];
  }
  return [[x, front], ...(i < CASTLE_OUTBUILDINGS.length
    ? links[i] : [[templeLink[0], front], templeLink])];
});
// 道を足しても、固定の範囲で地面ならしを落とさない。設営前に一度だけ囲む。
const HOUSE_APPROACH_BOUNDS = HOUSE_APPROACH_PATHS.reduce((box, pts) => {
  for (const [x, z] of pts) {
    box.x0 = Math.min(box.x0, x - 2.4); box.x1 = Math.max(box.x1, x + 2.4);
    box.z0 = Math.min(box.z0, z - 2.4); box.z1 = Math.max(box.z1, z + 2.4);
  }
  return box;
}, { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });

function buildIwamuraLife(rt) {
  const W = rt.world;
  // 八幡曲輪の道の両側に寺社・侍屋敷。場所・規模・屋根は同時代の推定。
  // 0_naibu の共通室内を使い、板床・畳・襖・障子・入口の段と壁の当たりをそろえる。
  rt.flags.castleHouses = CASTLE_HOUSES.map(([x, z, w, d, name, kind]) => goten(rt, x, z, {
    w, d, name, kind, team: 1, tile: false, boardRoof: SETTINGS.quality === 'high' && ['yashiki', 'nagaya', 'kura', 'bansho'].includes(kind),
    templeBoardRoof: SETTINGS.quality === 'high' && kind === 'hondo',
    // 城内の用屋三棟も陣の小屋と同じ切妻板葺き・梁高へそろえる推定復元。
    // 居館の屋根形を流用せず、板間・土間・二筋の板戸は既存の専用室内を保つ。
    ...(SETTINGS.quality === 'high' && ['nagaya', 'kura', 'bansho'].includes(kind)
      ? { fieldFort: true, interiorH: 2.5 } : {}),
    // 八幡社は内側と同じ縦板で包む推定復元。拝所の障子と戸口は共通の窓割りで抜く。
    utilityBoardWalls: kind === 'shrine',
    // 高画質の兵糧蔵・長屋は、共通御殿の戸口用の篝火を自動で並べない。
    // 室内の灯明と陣の篝火は残し、用途に合わせて入口の火を分ける推定復元。
    doorFire: !(SETTINGS.quality === 'high' && ['kura', 'nagaya'].includes(kind)),
    earth: 0x9b805b, naka: true, doorX: 0, profile: 'iwamura_' + kind, noTarget: true,
  }));
  if (SETTINGS.quality === 'high') {
    // 主殿型の屋敷の脇に、背の低い板葺き長屋・物置を添える。配置と寸法は推定。
    // 板間・土間・梁と板戸を共通室内で作る。室内の形は近づいた時だけ組む。
    // 上げ床十二センチと敷居四センチを除いても、板戸の内法を一・九四メートル確保する。
    // 梁・鴨居・引き戸は共通室内が同じ室内高から組み、低い外観のまま頭上を空ける。
    for (const [x, z, w, d, name, kind] of CASTLE_OUTBUILDINGS) {
      goten(rt, x, z, { w, d, name, kind, team: 1, tile: false, boardRoof: true,
        fieldFort: true, naka: true, doorX: 0, doorFire: false, interiorH: 2.5,
        profile: 'iwamura_' + kind, noTarget: true });
    }
    // 写真の屋敷地のように、侍屋敷の両脇を背の低い格子柵で区切る。
    // 北の枝道と南の戸口は広く空ける。外周の防御柵や通行の当たりは増やさない。
    const yardParts = [];
    let yardMat;
    for (const seg of [
      [-93, -355, -93, -340],
      // 侍屋敷の参道と同じ位置に東の口を空ける。戸口へ柵越しに入らせない。
      [-79, -355, -79, -345], [-79, -342, -79, -340],
      [-93, -355, -90, -355], [-82, -355, -79, -355],
      // 八幡の長屋二棟の間と脇。東の枝道と南の物見の梯子前は空ける。
      [-93, -338, -83, -338], [-93, -338, -93, -315],
      // 長屋の戸口から東の道へ抜ける幅を空ける。
      [-93, -325, -89.2, -325], [-86.8, -325, -83, -325],
      // 出丸の屋敷地。南北の戸口と中央の道へ抜ける東側を開く。
      [-54, -216, -54, -190], [-54, -216, -46, -216],
      [-54, -200, -46, -200],
    ]) {
      const fence = koshisaku(W, seg, { h: 1.15 });
      yardParts.push(fence.geometry); yardMat = fence.material;
    }
    const yard = new THREE.Mesh(mergeGeometries(yardParts), yardMat);
    yard.castShadow = true; yard.receiveShadow = true; rt.scene.add(yard);
    for (const g of yardParts) g.dispose();
    // 物置一棟ごとの旗をやめ、曲輪の外向きの縁に二本ずつまとめる。
    // 武田方の所属を示す復元。秋山個人の未確認の馬印は作らない。
    for (const [x, z] of [[-93, -349], [-53, -218], [10, -284]]) {
      for (let i = 0; i < 2; i++) rt.scene.add(nobori(W, x + i * 3, z, 'takeda', 5.1 + i * .6));
    }
    // 水晶山は板葺きの仮小屋と修理用の丸太・巻いた織田の幟。陣の南口は空ける。
    for (const [x, z, w, d] of CAMP_HOUSES) goten(rt, x, z, { w, d, name: x < 0 ? '陣の西の仮小屋' : '陣の東の仮小屋',
      kind: 'nagaya', team: 0, tile: false, boardRoof: true, fieldFort: true,
      naka: true, doorX: 0, doorFire: false, interiorH: 2.5, profile: 'iwamura_nagaya', noTarget: true });
    rt.scene.add(lumber(W, -37, 57, .15), hatazao(W, -35, 62, 0, 5, 'oda'));
    // 陣の裏に積んだ予備の竹束（柵の前へ出す前の物。平らな土の陣に見えていた。10/28）。位置と数は推定。射線と口は塞がない。
    for (const [x, z, r] of [[-27, 54, .1], [-24.6, 54.3, .05], [27, 54, -.1], [24.6, 54.3, -.05]]) rt.scene.add(takataba(W, x, z, r));
    // 兵の寝起きする板葺きの陣小屋を三棟足す（陣が平らな土に小屋一つに見えていた。10/28）。位置は推定。往来の筋と篝火は空ける。
    for (const [x, z, r] of [[-24, 38, .08], [30, 46, -.1], [16, 62, .05]])
      rt.scene.add(hut(W, x, z, 5.5, 3.6, r, { h: 2.1, wall: 0x8a7558, minka: false, thatchTies: true, groundedHome: true }));
    // 曲輪の長屋・蔵の脇に補修材と兵糧を寄せる。戸口・枝道・梯子前は空ける。
    // 写真の作業場の並びを参考にした推定。低い既存の道具だけを使う。
    rt.scene.add(lumber(W, -80, -330, Math.PI / 2), lumber(W, 10, -244, Math.PI / 2),
      tawara(W, 10, -249, 0, 3));
  }
  // 本丸裏口の短い石留めだけ。現存の大石垣を1575年の総石垣としない。
  // 中世後期の野面積みという観光協会の記述を参考に、範囲は推定。
  // 一段の低い野面積み。最低二メートルの共通素材へ替えず、どの画質でも同じ軽い形にする。
  rt.scene.add(ishigaki(W, [[-12, -160], [-5, -160]], {
    kind: 'nozura', topY: W.heightAt(-8, -160) + .4, minH: .8, maxH: 1.2, out: -1, noKit: true,
  }));
  // 霧ヶ井と本丸の井戸。屋根を板葺きにし、井筒・柱の形と当たりを合わせる。
  const stone = [], wood = [], rope = [];
  const fineWell = true;
  for (const [x, z] of [[24, -206], [-5, -267]].map(([x, z]) => castlePoint(x, z))) {
    const y = W.heightAt(x, z);
    const ring = new THREE.CylinderGeometry(.85, .95, .8, 10, 1, true); ring.translate(x, y + .4, z); stone.push(ring);
    solidCircle(x, z, .95);
    for (const dx of [-1.1, 1.1]) {
      const post = new THREE.BoxGeometry(.14, 2.5, .14); post.translate(x + dx, y + 1.25, z); wood.push(post);
      solidCircle(x + dx, z, .12);
    }
    const beam = new THREE.BoxGeometry(2.5, .16, .16); beam.translate(x, y + 2.35, z); wood.push(beam);
    for (const sign of [-1, 1]) {
      const boards = fineWell ? 7 : 1;
      for (let i = 0; i < boards; i++) {
        const roof = new THREE.BoxGeometry(2.7 / boards - (fineWell ? .012 : 0), fineWell ? .07 : .09, 1);
        roof.rotateX(sign * .35); roof.translate(x - 1.35 + (i + .5) * 2.7 / boards, y + 2.7, z + sign * .42); wood.push(roof);
      }
      if (fineWell) {
        const batten = new THREE.BoxGeometry(2.8, .08, .08); batten.translate(x, y + 2.67, z + sign * .65); wood.push(batten);
      }
    }
    const bucket = new THREE.CylinderGeometry(.2, .17, .35, 8); bucket.translate(x + .45, y + .98, z); wood.push(bucket);
    if (fineWell) {
      // 屋根の下の木滑車と麻縄、井筒に置いた桶の箍・持ち手。全井戸を材質別に結合する。
      const wheel = new THREE.CylinderGeometry(.16, .16, .12, 8); wheel.rotateZ(Math.PI / 2); wheel.translate(x, y + 2.17, z); wood.push(wheel);
      for (const [dx, bottom] of [[-.12, .25], [.12, 1.35]]) {
        const line = new THREE.CylinderGeometry(.018, .018, 2.17 - bottom, 4); line.translate(x + dx, y + (2.17 + bottom) / 2, z); rope.push(line);
      }
      for (const h of [.86, 1.09]) {
        const hoop = new THREE.TorusGeometry(.19, .018, 3, 8); hoop.rotateX(Math.PI / 2); hoop.translate(x + .45, y + h, z); rope.push(hoop);
      }
      const handle = new THREE.TorusGeometry(.18, .022, 3, 8, Math.PI); handle.translate(x + .45, y + 1.15, z); rope.push(handle);
    }
  }
  for (const [geos, color] of [[stone, 0x817a68], [wood, 0x66513b], [rope, 0x9b8863]]) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    for (const g of geos) g.dispose();
  }
  // 村・刈田は曲輪の外の一組にまとめる。十一月に水田を満水にしない。
  rt.scene.add(village(W, -175, 108, { n: 5, r: 24, fields: 10, autumn: true, smoke: 0, seed: 1575 }));
  // 大円寺とは別の、名のない村の小堂。田の西の空き地に置き、西向きの階を参道へつなぐ。
  // 高画質では内陣の礼盤前に一・一メートルの板間を取り、外陣の出入りも保つ。
  // 内陣だけを広げて入口の格子戸へ近づけず、外観・床・天井も同じ奥行きで組む。
  const [hallX, hallZ, hallW, hallD] = VILLAGE_HALL;
  goten(rt, hallX, hallZ, { w: hallW, d: hallD, rot: -Math.PI / 2, name: '村の小堂', kind: 'hondo', team: 0,
    tile: false, templeBoardRoof: true, earth: 0x9b805b, naka: true, doorX: 0,
    doorFire: false, profile: 'iwamura_hondo', noTarget: true });
}

// 水晶山の設営道具。所在・数は推定。写真の木組みと同じく、竹・縄・割板を見せる。
// 柵際の両翼と兵糧所の脇だけに寄せ、中央の迎撃・東口・本陣南口には置かない。
function buildSuishozanTools(rt) {
  const W = rt.world, originY = W.heightAt(0, 30);
  const near = [], far = [], color = new THREE.Color();
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pose = new THREE.Object3D();
  const add = (base, x, y, z, sx, sy, sz, tint, rx = 0, ry = 0, rz = 0, detail = false) => {
    pose.position.set(x, y - originY, z - 30);
    pose.rotation.set(rx, ry, rz); pose.scale.set(sx, sy, sz); pose.updateMatrix();
    const geo = base.clone().applyMatrix4(pose.matrix);
    color.setHex(tint);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    near.push(geo);
    if (!detail) far.push(geo);
  };
  // 一本ずつ節のある青竹を束ねる。置楯と柵の背後に収め、開口を狭めない。
  // 揃えすぎない切り口と、二か所の藁縄。太い丸太の壁にはしない。
  for (const [cx, cz] of [[-53, 7], [-50, 9], [50, 9], [53, 7]]) {
    const y = W.heightAt(cx, cz);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * .14 + (row % 2) * .065, z = cz + (row - 1) * .14;
      const h = 1.75 + ((i * 3 + row * 2) % 5) * .065;
      add(cylinder, x, y + h / 2, z, .065, h, .065, (i + row) % 3 ? 0x73764b : 0x8c8658);
      for (let n = 1; n < 5; n++)
        add(cylinder, x, y + n * .35, z, .073, .026, .073, 0xa19a69, 0, 0, 0, true);
      // 断面の暗い芯を上面だけに置く。
      add(cylinder, x, y + h + .002, z, .042, .006, .042, 0x464435, 0, 0, 0, true);
    }
    for (const h of [.48, 1.25]) {
      for (const dz of [-.23, .23])
        add(box, cx, y + h, cz + dz, .84, .055, .045, 0x99815c);
      for (const dx of [-.42, .42])
        add(box, cx + dx, y + h, cz, .045, .055, .5, 0x99815c);
      add(box, cx + .22, y + h - .1, cz + .26, .035, .24, .035, 0x99815c, 0, 0, .2, true);
    }
    // 束を立て掛けた控え杭。陣内に長い突起を出さない。
    add(cylinder, cx, y + .65, cz + .45, .055, 1.4, .055, 0x65513a, -.22);
  }
  // 後方の炊事場。消し炭の竈と蓋付きの釜、桶、薪。夜討ち前の火を増やさない。
  const cx = -22, cz = 53, y = W.heightAt(cx, cz);
  add(cylinder, cx, y + .14, cz, .62, .28, .62, 0x554a3b);
  add(cylinder, cx, y + .3, cz, .4, .05, .4, 0x24221e);
  add(cylinder, cx, y + .51, cz, .36, .4, .36, 0x373832);
  add(cylinder, cx, y + .73, cz, .41, .05, .41, 0x716047);
  add(box, cx, y + .79, cz, .42, .07, .075, 0x8a7756, 0, .4, 0, true);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    add(box, cx + Math.cos(a) * .51, y + .18, cz + Math.sin(a) * .51,
      .21, .22 + i % 2 * .04, .24, i % 2 ? 0x716a59 : 0x807766, 0, a, 0, true);
  }
  for (const dx of [-1.5, -2.15]) {
    const by = W.heightAt(cx + dx, cz + .7);
    add(cylinder, cx + dx, by + .24, cz + .7, .24, .48, .24, 0x867253);
    add(cylinder, cx + dx, by + .485, cz + .7, .19, .008, .19, 0x373b30, 0, 0, 0, true);
    for (const h of [.1, .37]) {
      const hoop = new THREE.TorusGeometry(.242, .018, 3, 8);
      add(hoop, cx + dx, by + h, cz + .7, 1, 1, 1, 0x4e493e, Math.PI / 2, 0, 0, true);
      hoop.dispose();
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = -25 + i % 3 * .17, z = 55.5, h = Math.floor(i / 3) * .15;
    add(cylinder, x, W.heightAt(x, z) + .1 + h, z, .075, 1.25 - i % 2 * .13, .075,
      i % 2 ? 0x776148 : 0x60503c, Math.PI / 2, .12);
  }
  // 補修小屋の壁へ寄せた予備の割板と短い梯子。戸口と井楼の登り口は空ける。
  for (const side of [-1, 1]) {
    const x = side * 40.2, z = 28, h = W.heightAt(x, z);
    for (let i = 0; i < 4; i++)
      add(box, x, h + .85, z - 1 + i * .23, .08, 1.9 + i % 2 * .2, .2,
        i % 2 ? 0x84755c : 0x6e624f, 0, 0, side * -.23);
    for (const dz of [-.28, .28])
      add(cylinder, x - side * .6, h + 1.1, z + 1.5 + dz, .042, 2.25, .042, 0x95815f, 0, 0, side * -.18);
    for (let i = 0; i < 6; i++)
      add(box, x - side * (.8 - i * .065), h + .2 + i * .36, z + 1.5, .06, .055, .64, 0x807052, 0, 0, 0, true);
  }
  // 全道具を一材質・一描画へまとめる。遠くでは節・箍・梯子の桟を省く。
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lod = new THREE.LOD(); lod.position.set(0, originY, 30);
  lod.userData.noFreeze = true; // 共通の静止物結合から外し、遠近の切り替えを保つ。
  for (const [parts, distance] of [[near, 0], [far, 85]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.receiveShadow = true; lod.addLevel(mesh, distance, .12);
  }
  lod.addLevel(new THREE.Group(), 180, .12);
  rt.scene.add(lod);
  W.terrain.geometry.addEventListener('dispose', () => {
    lod.removeFromParent();
    for (const level of lod.levels) if (level.object.isMesh) level.object.geometry.dispose();
    material.dispose();
  });
  for (const g of near) g.dispose();
  cylinder.dispose(); box.dispose();
}

// 信長公記巻八・水精山の夜襲、城の参照表。河尻・毛利・浅野・猿荻の迎撃は史料。
// 攻め口・曲輪別の兵数は補完。城内の個々の守将は不明なので名を作らない。
const JIN = [
  rosterPlan('包囲の陣', 0, { x: 0, z: 44 }, Math.PI, [
    ['nobutada', '本陣', '織田信忠', 8000, 0, 44, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['kawajiri', '水晶山の仕寄り', '河尻秀隆', 5000, -14, 16, 'oda', 'oda', 0, { bind: 'kawa' }],
    ['mori', '水晶山の仕寄り', '毛利河内', 5000, 20, 16, 'oda', 'oda', 0, { bind: 'mouri' }],
    ['left', '西の尾根の囲み', '織田の衆（将の名は不明）', 5000, -66, 48, 'oda', 'oda', 100, { w: 30, d: 24 }],
    ['right', '東の兵糧道の囲み', '織田の衆（将の名は不明）', 5000, 66, 48, 'eiraku', 'oda', 100, { w: 30, d: 24 }],
    ['road', '登城道の仕寄り', '河尻秀隆の配下（名は不明）', 2000, 24, -64, 'oda', 'oda', 24, { w: 10, d: 8 }],
  ], '信長公記巻八・十一月十日条、城の参照表の岩村。浅野左近・猿荻甚太郎も水精山に在陣。水精山の四将の兵数は不明'),
  rosterPlan('曲輪の守り', 1, CASTLE, 0, [
    ['akiyama', '本陣', '秋山虎繁', 500, CASTLE.x, CASTLE.z, 'takeda', 'takeda', 0, { bind: 'keep.lord' }],
    ['outer', '三の丸', '秋山虎繁の配下（名は不明）', 500, ...castlePoint(0, -172), 'takeda', 'takeda', 20, { w: 8, d: 8 }],
    ['hachiman', '八幡曲輪', '秋山虎繁の配下（名は不明）', 300, ...castlePoint(16, -196), 'takeda', 'takeda', 16, { w: 7, d: 7 }],
    ['ni', '二の丸', '秋山虎繁の配下（名は不明）', 500, ...castlePoint(-10, -218), 'takeda', 'takeda', 16, { w: 7, d: 7 }],
    ['shu', '主郭', '秋山虎繁の配下（名は不明）', 400, IWA_SHU.x, IWA_SHU.z, 'takeda', 'takeda', 12, { w: 6, d: 6 }],
    ['obi', '帯曲輪', '秋山虎繁の配下（名は不明）', 300, -33, -238, 'takeda', 'takeda', 12, { w: 5, d: 8 }],
    ['demaru', '出丸・東曲輪', '秋山虎繁の配下（名は不明）', 500, -40, -210, 'takeda', 'takeda', 12, { w: 5, d: 8 }],
  ], '信長公記巻八、岩村城の曲輪資料。各曲輪の守将・兵数は不明'),
];
const iwamura = {
  // 稲生と同じ入口で任務・地図・頭上の印・一時停止をそろえる。
  missionSingleLine: true,
  hideMissionDots: true, hideGuideSteps: true,
  noPlayerFoot: true, quietMiss: true,
  enemyTriangleSigns: true, nearbyAllySignLimit: 0, noDodgeCard: true,
  missionPinCaption: '', missionDetail: () => '', missionStatus: () => '',
  minutes: 7,
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ/.test(text),
  missions: ['篝火を焚け', '柵を守れ', '▼の敵を倒せ', '麓へ進め', '味方を待て', '麓を守れ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.step < 2 && F.lit < POSTS.length && !F.scoutNear) return 0;
    if (F.step < 3) return 1;
    if (this.missionSignTarget(rt)) return 2;
    if (!atFoot(F, rt.player.u.pos)) return 3;
    return F.joinHold > 0 ? 5 : 4;
  },
  missionHeading(rt) { return this.missions[this.missionOf(rt)]; },
  // 秋山は後日捕らえられる城将。目印を付けても、この夜の討取りの対象にはしない。
  commanderSignTarget(rt) {
    const u = rt.flags.keep?.lord;
    return !rt.flags.ending && u?.alive && !u.gone && !u.dying && !u.woundOut ? u : null;
  },
  missionSignTarget(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    let nearest = null, best = Infinity;
    const groups = F.step === 3 ? F.roadDefenders : F.contacts;
    for (const g of groups || []) {
      if (g.iwWithdraw || g.routed || F.step < 3 && !g.iwSent) continue;
      for (const u of g.units) {
        if (!chaseReady(u) || u.hp <= 0 || u.gone || u.dying || u.civ || u.isStruct || u.mesh?.visible === false) continue;
        if (F.step === 3 && !roadEnemy(u, F.joinOrder || atFoot(F, p), F.footY)) continue;
        // 山肌や柵の向こうの兵を討取りの行き先にしない。
        // 見える同じ高さの相手だけを示し、見失った時は山道の案内へ戻す。
        if (F.step === 3 && (Math.abs(u.pos.y - p.y) >= 3 || !sightUnit(rt, u) ||
            rt.army.wallBetween(p, -1, u.pos) || rt.army.terrainBlocks(p, u.pos))) continue;
        const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
        if (d < best) { best = d; nearest = u; }
      }
    }
    return nearest;
  },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.goalPin || (F.goalPin = { x: 0, z: 0 });
    q.unit = null; q.enemy = false; q.fire = false; q.marker = null;
    q.route = false; q.waiting = false; q.arrived = false; q.defend = false;
    q.r = q.hide = 5;
    let pos;
    if (this.missionOf(rt) === 0) {
      // 任務札・台詞・行き先のピンで、同じ篝火を示す。
      const i = F.firePost;
      pos = POSTS[i]; q.fire = true;
      q.marker = F.fireMarkers[i]; q.r = q.hide = 3;
    } else if (F.step < 3) {
      // 味方の槍組が並ぶ口に保つ。着いても守る場所を消さない。
      pos = F.raidGuide || POSTS[0]; q.waiting = true;
    } else {
      const enemy = this.missionSignTarget(rt);
      if (enemy && Math.abs(enemy.pos.y - p.y) < 3 &&
          !rt.army.wallBetween(p, -1, enemy.pos) && !rt.army.terrainBlocks(p, enemy.pos)) {
        pos = enemy.pos; q.unit = enemy; q.enemy = true; q.r = q.hide = 3;
      } else if (atFoot(F, p)) {
        pos = FOOT; q.waiting = true; q.r = q.hide = F.chaseArrived ? 12 : 8;
      } else {
        // 切岸を横切るピンにせず、通れる山道の次の折れへ渡す。
        pos = F.chaseGuide; q.route = true; q.r = q.hide = 3;
      }
    }
    q.x = pos.x; q.z = pos.z;
    q.arrived = q.waiting && (F.step === 3 ? atFoot(F, p) :
      Math.hypot(p.x - q.x, p.z - q.z) < q.r);
    // 麓に着いた後は任務の一行で待機を示す。自分の足元へ旗と矢印を重ねない。
    // 押し戻された時は同じ山道への案内を再び出す。柵の守備の印は残す。
    if (F.step === 3 && q.arrived) return null;
    return q;
  },
  // 共通の民の仕組みで見物・兵や火からの避難を行い、兵数や戦功には加えない。
  civilianCrowd: {
    bands: PEOPLE_BANDS,
    // 近景の七人分を職・年齢ごとに使い回す。町人・商人を百姓の姿で代用しない。
    nearKinds: ['farmer', 'woman', 'child', 'monk', 'elder', 'townsman', 'merchant'],
    carryGoods: true, // 百姓の藁包みと商人の荷包みで、武器を持たない里の暮らしを見分ける。
    watchAt: { x: 0, z: FENCE_Z }, // 山上の守備兵も含む重心でなく、夜討ちを受ける柵の口を見る。
    watchTarget: (rt) => rt.flags.step >= 3 ? FOOT : iwamura.civilianCrowd.watchAt,
    keepTogether: true, // 家族・堂の一行は、子や年寄りを置き去りにせず同じ足並みで退く。
    maxSeparation: 7, // 畦の曲がり角で遅れた者を安全な所で待ち、一行が離れすぎないようにする。
    orderedFamilyWait: true, // 小段から逃げ直す時も先行者だけが待ち、家族どうしで待ち合って止まらない。
    peopleSpacing: 1.1, // 共通の曲がり角へ殺到して重ならず、前の人との間を空けて退く。
    refugeSpacing: 2.4, // 退避先の小段で一か所に重ならず、田と堂を避けて散らばる。
    refugeRadius: 0.3, // 最後だけ各人の場所まで寄る。早く止まった家族が後続の逃げ道を塞がない。
    keepRefugeRoutesClear: true, // 先着した民の待機場所は、自分の家族も別の一行も通る畦道から離す。
    keepWatchRoutesClear: true, // 見物中の民も別の家族の畦道には立たず、後から逃げる一行の道を空ける。
    refugeSearchRings: 8, // 家族が多い時も小段の空き地を広く探し、共通の終点に取り残さない。
    safeRouteSetup: true, // 堂の戸口から参道へ出る道と、最後の曲がり角から各人の避難先までを設営時に確かめる。
    evacuateAtStart: true, // 支度の時点で兵や松明が迫っていても民を省かず、安全に道へ出られる一行はすぐ退く。
    avoidFields: true, // 散らばる見物人と避難中の民を、刈田でなく周囲の空き地へ通す。
    continuousEscapeSolids: true, // 小堂の角や家の細い塀も道全体で避け、点の間をすり抜けない。
    routeRadius: 0.8, // 田の角を四メートル手前で曲がらず、東西の外縁まで進んでから南へ退く。
    soldierClearance: 12, // 畦道でも避難先でも兵を避け、兵が迫った時は間合いの内から離れられる。
    ignoreGoneSoldiers: true, // 戦場を離れた兵や手当てへ収容済みの兵を、村へ迫る兵と取り違えない。
    avoidLightArmies: true, // 軽い形で描く包囲の備も兵として警戒し、列の外側へ退く。
    avoidClashes: true, // 遠景の斬り合いにも近寄らず、兵数や乱戦の密度はそのまま保つ。
    retreatFromSoldiers: true, // 畦へ兵の列が迫っても、外縁から離れる一歩は塞がない。
    soldierNotice: 24, // 抜刀や斬り合いを待たずに退く。子や年寄りにも、兵との間を空ける余裕を持たせる。
    soldierNoticeDistance: 24, // 一人ずつの見張りでも、既存の兵への警戒距離を保つ。
    rememberSoldierCombat: true, // 短い発砲も次の見回りまで覚え、畦から撃ち手へ近寄らない。
    watchPlayerCombat: true, // 主人公の斬撃・弓・鉄砲も家族へ迫る危険として知らせる。
    evacuateAfterBattle: true, // 決着後も残る兵と火を見張り、小段への避難を途中で止めない。
    individualDanger: true, // 子や年寄りは本人の目線で兵・火を見付け、家族へ知らせる。
    watchTerrainSight: true, // 家や小堂、尾根の遮りと背丈を合わせ、壁越しに危険を見付けない。
    noticeInterval: 0.2, // 夜道の兵・松明への気づきも避難中と揃え、見物や家族待ちからすぐ退けるようにする。
    // 本人の周りだけでなく、これから通る畦と各人の待機先への接近にも気付く。
    watchRouteDistance: 48,
    watchRouteCheckInterval: 0.8,
    watchRouteFromPeople: true,
    watchEscapingRoute: true,
    escapeClearance: { soldiers: 24, troops: 24, fighting: 40, fire: 22 }, // 包囲の備にも実兵と同じ間隔を空ける。
    noticeHearingDistance: 12, // 遠い退路の兵は家・地形越しに見付けず、近くは物音でも気付く。
    // 近くの家族が逃げ出したら見物を切り上げる。元の合図から三秒だけ伝える。
    neighborAlarmDistance: 24,
    neighborAlarmDuration: 3,
    calmSeconds: 6, // 小段に全員が着いた後も、避難路を離れた後も六秒は安全を確かめる。
    stopWhenCalm: true, // 狭い小段で逃げ直した時は、走った距離でなく一行全員の安全で落ち着く。
    personalThreat: true, // 一行の反対側の危険でなく、その人に迫る兵や火から離れて道へ戻る。
    finishRefugeEscape: true, // 避難先へ兵や火が迫ったら、安全な場所へ逃げ直すまで到着扱いにしない。
    avoidOtherThreats: true, // 別の兵・火にも道の途中から警戒距離へ入らず、近づかれた時は離れて退く。
    escapeRecheck: 0.2, // 動く兵や松明で道が塞がったら、次の曲がり角を待たず逃げ先を選び直す。
    checkEscapeStep: true, // 道の再確認の合間にも、今踏み出す一歩で兵・火・田へ入り込まない。
    safeRouteRejoin: true, // 危険をよけた後は、安全に通れる次の畦道へ合流し、塞がった角へ戻らない。
    narrowEscape: true, // 田際や小堂の角では短い一歩、それも塞がれば横・後ろの隙間を探してよける。
    fireSize: 0.7, // 建物の大火だけでなく、兵の松明や篝火にも近寄らない。
    avoidFireSpread: true, // 大きな炎は中心だけでなく広がりも含め、畦と待機先を見張る。
    watchRaisedFire: true, // 台や屋根の上に見える炎も、その高さで家・小堂越しの見通しを調べる。
    // 村・堂・畦道がある平らな小段の範囲。逃げ直す時も山の陣や急な斜面へ迷い込まない。
    bounds: { minX: -220, maxX: -133, minZ: 89, maxZ: 185 },
  },
  jinkei: JIN,
  softGuideRings: true, // 行き先の輪を細く淡くする。名前は任務の札に添える。
  hidePlayerSign: true, // 肩越しに本人が見える。白い二重輪を行き先と取り違えさせない。
  openingFootSignOnly: true, // 開幕の手ほどきにも胴を囲う縦長の枠を出さない。
  groundGuideRings: true, // 坂の印は地面へ沿わせ、平たい帯を浮かせない。
  clearTravelGuide: true, // 道の矢印と旗の上に案内札を重ねない。
  pauseTurnPractice: false, // 見回しの操作待ちで夜討ちの兵と任務の時計を止めない。
  compactTravelArrow: true, // 道の帯より、行き先に添える短い矢印を優先する。
  compactDestinationSign: true, // 守る旗も小さくし、携帯の中央を覆う黒い案内札を畳む。
  smallFlagAvoidNotices: true, // 小旗の竿と布も任務札・操作札に重ねない。
  singleRetreatArrow: true, // 回避と退避も足元の短い矢印一本にし、兵へ点線を重ねない。
  compactRetreatArea: true, compactDodgeGuide: true,
  compactGroundGoalRing: true, // 小さな到着輪と旗で、柵の口の兵と槍先を空ける。
  openingFootSignOnly: true, // 最初の案内も足元の丸だけにし、本人を白い枠で囲まない。
  playerFootSignOnly: true, // 開幕後も足元の丸だけを残し、具足からずれる黄色い人型線を描かない。
  singleDestinationArrow: true, // 行き先の矢印に、足元からの案内を重ねない。
  avoidAllDestinationNotices: true, // 画面外の口への旗も任務札・台詞・小地図を避ける。
  groundFlagGuides: true, // 実物の幟を囲まず、根元の小さな旗印で示す。
  compactHoldGuide: true, // 持ち場へ着いた後は、画面内へ別の旗を移さない。
  distanceUnit: 'steps', // 行き先の距離を歩数にそろえる。
  groundLockRing: true, // 狙った相手の朱の輪も坂へ沿わせる。
  compactFieldGuides: true, // 太い人型の枠をやめ、頭の脇の小さな印で相手を示す。
  noUnitContrast: true, // 兵からずれる簡略な人型線を描かず、敵の三角と味方の丸を残す。
  compactEnemyFrame: true, // 今ねらう敵は細い四隅で示し、具足と槍先を空ける。
  enemyCornerSign: true, // 描画側が読む指定で、敵を囲む太い箱を四隅へ替える。
  compactCombatGuides: true, // 相手へ向ける矢印も細く短くし、兵の姿を空ける。
  compactGuardGuide: true, // 味方を守る印も小さくし、狭い柵の口を隠さない。
  compactMapAllies: true, // 小地図は味方一隊の番号だけ。名前と下知は隊の札で読む。
  noThreatArcs: true, // 夜の斜面では朱の平たい攻撃範囲を重ねない。
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noWake: true, // 囲みと城の備は遠景のまま。夜討ちを退けても新たな実兵を足さない。
  noHorse: true, // 柵の守りと山道の追撃は徒歩。
  nearAllyFadeRadius: 2.2,
  nearAllySolidBody: true, // 視点に入った味方だけ描く間避け、顔や具足をばらばらに透かさない。
  nearAllyWholeOcclusion: true, // 本人を隠す味方にも全身の扱いを通し、透けた笠や胴の内側を残さない。
  nearEnemyFadeRadius: 2.2, // 混戦で視点へ入る敵の背負い物も、全身と一緒に描く間だけ避ける。
  nearLongWeaponRadius: 10, // 坂の後列から視点へ届く長柄と旗竿も、描く間だけ避ける。
  nearGroundSpearRadius: 10, // 持ち主から離れた落ち槍も、視線へ食い込む間だけ避ける。
  nearSceneryScreenCut: false, // 小屋や井楼を画面の四角で切らず、視点の直近だけ距離で避ける。
  recoilPitchMin: -0.35, // 槍の手応えが重なっても地面だけの視点にしない。指で見下ろす操作は残す。
  taskDetails: true, // 携帯でも篝火の長押しと、麓で待つ人数を任務札に残す。
  persistentTaskNotice: true, // 長押しを含む任務を一時の操作助言と見なして消さない。
  keepCombatTask: true, // 構えの案内中も、点火の手順と麓の合流人数を畳まない。
  keepCombatTaskHeading: true, // 携帯の攻撃案内でも、柵を守る下知を残す。
  keepCombatTaskDetail: true, // 近い敵に応戦している間も、篝火の手順と麓の合流人数を残す。
  // 遅れて届く声と表示中の字幕も、現在の任務に合う下知だけにする。
  speechAllowed(rt, _speaker, text) {
    const F = rt.flags;
    if (/火を焚け|篝火へ向かえ|こちらの火は任せよ/.test(text) ||
        /次は[西東]の篝火/.test(text)) {
      if (F.step !== 1 || F.raidReturning || F.scoutNear || F.localContact || F.lit >= POSTS.length) return false;
      for (let i = 0; i < POSTS.length; i++)
        if (text.includes(POST_NAMES[i]) && F.litPosts.has(i)) return false;
    }
    // 声の順番を待つ間や字幕の表示中にも、札の行き先は変わる。
    // 戻り終えた口や、すでに離れた持ち場へ古い下知で呼び戻さない。
    if (/口の印(を通り、|から)柵の内へ/.test(text) && (F.step >= 3 || !F.raidReturning)) return false;
    if (/連絡道(の印)?を回れ|柵の内の連絡道を回れ|柵の内を回れ。/.test(text) &&
        (F.step >= 3 || !F.raidCrossing)) return false;
    if (/陣の奥に敵じゃ|陣の奥の印の敵|陣の奥の敵を/.test(text) && (F.step >= 3 || !F.breached)) return false;
    // 救援や帰還へ切り替わったら、口に留まる古い声で足を止めない。
    if (F.step < 3 && (F.breached || F.raidReturning || F.raidCrossing) &&
        !/連絡道|柵の内を回れ/.test(text) &&
        /口を守れ|口も固めよ|持ち場を離れず押し返せ|下知まで柵を守れ|柵の内から槍を出せ|柵の内で(敵を受けよ|受けよ)/.test(text)) return false;
    if (F.step < 3 && !F.raidReturning) {
      if (text.includes('東の脇口') && !F.raidMouthX ||
          text.includes('正面の口') && F.raidMouthX) return false;
    }
    if (F.step >= 3 && /口を守れ|口も固めよ|口で夜討ち|柵を守れ|持ち場を離れず押し返せ|夜になるまで|ここで味方と見張れ|ここで見張れ|柵の内で(敵を受けよ|受けよ|敵を押し返せ)|柵の内から槍を出せ|火は任せよ|火は味方も焚く|[東西]の篝火|[東西]の脇口|正面の口/.test(text)) return false;
    // 夜になった後や敵と槍を合わせた後は、支度中の見張りの声を外す。
    if (/夜になるまで/.test(text) && rt.world.nightAmount() >= 0.5) return false;
    if (/ここで味方と見張れ|ここで見張れ/.test(text) &&
        (F.raidReturning || F.raidCrossing || F.localContact || F.scoutContact || F.breached)) return false;
    // 麓で待つ理由が消えたら、その字幕も外す。迎撃中の下知は残す。
    if (F.step === 3) {
      // 先の折れへ進む声と、道へ戻る声を、現在の札に合わせる。
      if (/追い討ちじゃ。山道の印|山道の印をたどり、味方と麓へ進め/.test(text) &&
          (F.chaseArrived || F.chaseOffRoad || F.roadFight || F.joinOrder)) return false;
      if (/道を外れたぞ|道の印へ戻れ。崖を横切るな/.test(text) && !F.chaseOffRoad) return false;
      if (/麓を離れるな。道の印|道の印をたどり、麓へ戻れ/.test(text) &&
          (F.chaseArrived || F.chaseOffRoad || !F.joinOrder)) return false;
      if (/道に敵じゃ/.test(text) && (!F.roadFight || F.chaseArrived || F.chaseOffRoad)) return false;
      if (/味方と麓を守れ|坂へは?追うな/.test(text) && !F.chaseArrived) return false;
      // 敵の印が消えた後は、見えない敵を探させる古い声も消す。
      if (/麓の敵を味方と押し返せ/.test(text) && !F.roadMarker) return false;
      if (/麓の敵を味方と押し返せ|道の敵に備えよ/.test(text) &&
          (!F.chaseArrived || !F.roadHeld)) return false;
      if (/味方が倒れておる/.test(text) && !F.joinRecovering) return false;
      if (/味方は道で戦っている/.test(text) && !F.joinFighting) return false;
      if (/ここで味方を待て|味方が続く/.test(text) && !F.joinWaiting) return false;
    }
    return true;
  },
  keepTaskPanel: true, keepApproachTaskPanel: true, // 狭い画面で任務札を敵の頭上へ移さない。
  keepTaskWithGuard: true, // 守る釦を押す間も、柵の口と麓への下知を残す。
  keepTaskWithRain: true, // 矢をよける間も、戻る口を任務札で読めるようにする。
  keepTaskWithWork: true, // 点火中も左右の篝火と守る口の順を残す。
  releaseGuardForAttack: true, // 打ち終わった敵には、釦から指を離して反撃へ移る。
  // 切岸の上下にいる敵や退く兵を、今ふせぐ相手として案内しない。
  waitGuardAllowed(rt, enemy) {
    const p = rt.player.u;
    return !!enemy?.alive && enemy.team !== p.team && !enemy.fleeing && !enemy.woundOut &&
      !enemy.downed && !enemy.dropped && !enemy.noTarget && !enemy.isStruct &&
      (enemy.sidearm || enemy.type !== 'gun' && enemy.type !== 'bow') &&
      Math.abs(enemy.pos.y - p.pos.y) < 1.5 &&
      Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) < 6;
  },
  meleeGuide(rt, enemy) {
    const F = rt.flags;
    if (F.step >= 3) {
      // 追うのは麓の道をふさぐ兵だけ。退く列や城の坂へ案内を移さない。
      if (!enemy?.group || !F.roadDefenders.includes(enemy.group) ||
          !roadEnemy(enemy, F.joinOrder, F.footY)) return false;
      if (!F.joinOrder && distToPolyline(enemy.pos.x, enemy.pos.z, F.chasePath) >= 6) return false;
      const u = rt.player.u;
      if (F.joinOrder && (!atFoot(F, u.pos) || Math.hypot(enemy.pos.x - FOOT.x, enemy.pos.z - FOOT.z) >= 7)) return false;
      return Math.abs(enemy.pos.y - u.pos.y) < 1.5 &&
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) < 8 &&
        !rt.army.wallBetween(u.pos, -1, enemy.pos) && !rt.army.terrainBlocks(u.pos, enemy.pos);
    }
    // 柵の守りでは、届かない敵を追って口の外へ出る案内をしない。
    // 間合いに入った相手には、向き・防御・反撃の案内を残す。
    const p = rt.player, u = p.u;
    return !!enemy?.alive && Math.abs(enemy.pos.y - u.pos.y) < 1.5 &&
      Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) <=
        p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
  },
  enemyGuideAllowed(rt, enemy) {
    // 通常の敵印からも「敵へ進め」を出さず、同じ守備の間合いを使う。
    return this.meleeGuide(rt, enemy);
  },
  meleeApproachText: (rt) => rt.flags.step < 3 ? '柵の内で敵を受けよ' :
    rt.flags.joinOrder ? '麓を離れず、敵を受けよ' : '道の敵を押し返し、麓へ進め',
  retryAdvice: (rt, info) => info.down ? '' : rt.flags.step === 3 ?
    '味方と麓へ進み、そこで待とう' : '柵の内で味方と敵を防ごう',
  keepOpeningTaskLabel: true, // 指の動かし方だけでなく、最初から篝火の行き先を残す。
  keepTaskWithDodge: true, // よける間も、柵や麓の持ち場を忘れさせない。
  keepTaskLabel: true, // 近い敵一人への案内で、柵の守りや麓で待つ下知を消さない。
  keepFlagTravelTask: true, // 口へ戻る間も「旗まで」の歩数だけにせず、守る持ち場を残す。
  keepGuardTaskLabel: true, keepRescueTaskLabel: true, keepDestinationTask: true,
  guardStartText: '長押しで一撃を防げ',
  guardWaitText: '構えたまま一撃を防げ',
  guardLabel: (rt) => rt.flags.step === 3
    ? atFoot(rt.flags, rt.player.u.pos) ? '麓で味方を守れ' : '山道で味方を守れ'
    : '柵の内で味方を守れ',
  keepRetreatReason: true, // 「ここへ」だけに縮めず、道の味方の後ろへ下がる下知を見出しにも残す。
  retreatStepsNewLine: true, // 下知の途中へ歩数を折り返さず、次の行へそろえる。
  keepWoundRetreatReason: true, // 傷で下がる時も、柵の内か麓の道かを歩数と一緒に残す。
  woundEffectMin: 0.08, // 浅い打撲の残りだけで追撃中も退避を続けない。出血・深手の退避は残す。
  taskLabel(_rt, text) {
    return text.replace('組を率い、', '').replace('柵の左右に篝火を焚け', '左右の篝火を焚け')
      .replace('目の前の敵を、味方と押し返せ', '味方と敵を押し返せ')
      .replace('道の敵を押し返し、麓へ進め', '敵を押し返し麓へ進め')
      .replace('柵で武田の夜討ちを防げ', '柵で夜討ちを防げ').replace('山道を進み、麓の味方につけ', '山道から麓へ進め')
      .replace('麓に留まり、組の到着を待て', '麓で味方を待て');
  },
  taskDetail(rt, _title, detail) {
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && !cue.treatment && rt.flags.step === 3 && !rt.flags.roadFight) {
      // 一度着いた記録だけで待機を命じず、今いる場所に合わせて道へ戻す。
      if (rt.flags.chaseOffRoad) return '山道の印へ戻れ。崖を横切るな';
      // 麓では元の札に敵・後続・守り切るまでの秒数がある。退避の余韻で隠さない。
      if (atFoot(rt.flags, rt.player.u.pos))
        return detail;
      return rt.flags.joinOrder ? '道の印をたどり、麓へ戻れ' : '山道の印をたどり、城の麓へ進め';
    }
    if (cue?.active && cue.valid) return cue.treatment
      ? treatmentOrder(rt)
      : rt.flags.step === 3 && rt.flags.joinOrder
        ? (rt.flags.joinStatus || '') + '道の印へ下がれ。麓を離れるな'
        : rt.flags.step < 3 ? '柵の内の印へ下がり、槍を構えよ。山道へ出るな'
          : '道の印まで下がり、槍を構えよ。城の坂へ逃げるな';
    // 狭い札に太鼓の説明を繰り返さず、行き先・操作・到着人数を残す。
    return detail.replace('法螺と早い太鼓で追撃。', '').replace('篝火の印で長押し', '篝火へ近づき、長押し');
  },
  dodgePointAllowed: fieldGuideAllowed,
  retreatPointAllowed: fieldGuideAllowed,
  // 追撃の移動中は、打ち合いの余韻で道案内を退避へ置き換えない。
  // 深手の判断は共通側に残し、近い敵・包囲・息切れには従来の守りを使う。
  routeGuidePriority(rt) {
    const F = rt.flags, p = rt.player, u = p.u;
    if (F.step !== 3 || F.ending || F.roadFight || F.chaseArrived || u.mobbed ||
        p.sta < 20 || rt.t < (rt.retreatUntil || 0)) return false;
    for (const enemy of rt.army.units) {
      if (enemy.team === u.team || !enemy.alive || enemy.gone || enemy.fleeing || enemy.woundOut ||
          enemy.noTarget || enemy.civ || enemy.isStruct || enemy.downed || enemy.dropped) continue;
      if (Math.abs(enemy.pos.y - u.pos.y) < 3 && Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) < 12 &&
          !rt.army.wallBetween(u.pos, u.team, enemy.pos) && !rt.army.terrainBlocks(u.pos, enemy.pos)) return false;
    }
    return true;
  },
  retreatGuideLabel(rt, reached) {
    if (rt.hud.retreatGuide?.treatment) return treatmentOrder(rt);
    if (rt.flags.step < 3) return reached ? '柵の内で槍を構えよ' : '柵の内の味方へ下がれ';
    if (reached && !rt.flags.roadFight) {
      if (rt.flags.chaseOffRoad) return '山道の印へ戻れ';
      return atFoot(rt.flags, rt.player.u.pos) ? 'ここで麓を守れ' :
        rt.flags.joinOrder ? '道の印から麓へ戻れ' : '山道の印から麓へ進め';
    }
    return reached ? '道の上で槍を構えよ' : '道の味方の後ろへ下がれ';
  },
  dodgeAvoidNotices: true, // 画面端の回避札も任務や小地図を避ける。
  keepDodgeGuideLabel: true, // 画面外でも、何をよけるかを歩数だけに置き換えない。
  // 槍の構えで矢は防げない。よけた後も、矢をやり過ごす下知を残す。
  rainDodgeGuideLabel: (_rt, reached) => reached ? 'ここで矢をやり過ごせ' : '矢の外へよけよ',
  dodgeGuideLabel: (_rt, reached, rain) => rain
    ? reached ? 'ここで矢をやり過ごせ' : '矢の外へよけよ'
    : reached ? 'ここで構えよ' : '道の印へよけよ',
  // 指の動かし方だけで行き先を消さず、柵・道・矢を避ける先を一緒に示す。
  dodgeMoveLabel: (rt, side, rain) => `${rain ? '矢の外へ' : rt.flags.step < 3 ? '柵の内へ' : '道の印へ'} ${side}になぞる`,
  dodgeTurnLabel: (_rt, right, touch) => touch ? 'なぞって振り向く' : `${right ? '右' : '左'}へ動かして振り向く`,
  dodgeLabel(_rt, direction, rain) {
    if (direction.includes('振り向く')) return direction;
    if (direction.startsWith('右')) return '右へよける';
    if (direction.startsWith('左')) return '左へよける';
    if (direction.startsWith('前')) return '前へよける';
    return rain ? '矢の外へよけよ' : '道で敵から離れよ';
  },
  namedGuideMarkers: true, // 行き先の札にも篝火・柵・麓の別を残す。
  travelGuideLabel(rt) {
    const F = rt.flags;
    // 点火後は、任務札と同じ口の名を出す。連絡道へ回る下知も優先する。
    if (F.step < 3 && F.raidReturning) return '柵の内へ戻れ';
    if (F.step === 1 && !F.scoutNear && !F.localContact && F.lit < POSTS.length) return '篝火へ';
    if (F.step < 3) return F.raidCrossing ? '柵の内の道へ' : F.breached ? '陣の奥へ' : F.raidMouthX ? '東の口へ' : '柵の口へ';
    if (F.chaseOffRoad) return '山道へ戻れ';
    if (F.roadFight) return '道の敵へ';
    if (F.joinOrder && F.chaseArrived) return '麓を守れ';
    return '麓への道';
  },
  nearFlagFadeRadius: 6, // 狭い柵の口では、横から張り出す長旗も描く間だけ避ける。
  standardClothScale: 0.72, // 狭い口でも隊旗の布が敵の顔と槍先を覆わない大きさにする。
  groundStandards: true, // 坂で兵の上体が傾いても、隊旗の竿を地面から立てる。
  woundedStandardsFall: true, // 深手で倒れた旗持ちの上に隊旗だけ立ち続けさせない。
  fadeCloseStandards: true, fadeCloseStandardFrame: true, // 近い味方の隊旗は横木も一緒に透かす。
  immediateTaskChanges: true, // 同じ任務でも下知が変われば、古い文を十秒残さない。
  armySignals: false, // 固有の警報・退き太鼓・追撃の合図を使い、共通の号令は重ねない。
  uchisute: true, // 持ち場を守る間は首を取らず、敵を押し返す。
  moveLim: 410, // 共通の置換も城の奥まで扱う。世界の通行範囲とそろえる。
  noTaishoRaid: true, // 本陣狙いの架空の新手を共通処理から出さない。
  taisho: { a: { use: true }, b: { def: true } },
  botOrders: true, // 追撃や手当ての道を、空馬への寄り道で上書きしない。
  spawn: { x: 6, z: 14, heading: Math.PI },
  // 身の回りの当時の場（timeslip_field.js）。天正三年十一月の水晶山は今の十二月半ば・初冬の夕暮れ。
  // 霜枯れの草と落ち葉の乾いた土。武田の夜討ちを受けた柵の口と、麓へ追い崩した道ほど、
  // 倒れた槍・武田方の旗・刺さった矢・脱げた陣笠が多い。
  timeslip: {
    wet: 0.05, dust: 0.45, trample: 0.3, debris: 1.1, arrows: 0.7,
    grass: 0x9c8a62, grassTints: [0xffffff, 0xe2d2aa, 0xbcae8c], grassH: 1, tallGrass: 0.8,
    flagColors: [0xe6e0d0, 0x24221e, 0x9a2c22],
    fights: [[POSTS[0].x, POSTS[0].z, 24], [POSTS[1].x, POSTS[1].z, 24], [0, FENCE_Z - 8, 28], [MOUTH_LINK[3][0], MOUTH_LINK[3][1], 20], [FOOT.x, FOOT.z + 30, 30]],
  },
  world: {
    noHaori: true, // 本の足軽・徒立ち武者にならい、胴と草摺を隠す陣羽織を外す。
    seed: 15755,
    blockedHint: (rt) => {
      const F = rt.flags;
      if (F.step >= 3) return F.chaseArrived ? '麓の平場で味方と守れ。城の坂へは登るな' : '山道の印へ戻れ。崖を横切らず、道を進め';
      if (F.raidReturning) return '口の印を通り、柵の内へ戻れ';
      if (F.breached) return F.raidCrossing ? '連絡道の印を回り、陣の奥へ進め' : '陣幕と小屋を回り、陣の奥の印へ進め';
      if (F.step >= 2 || F.scoutNear || F.lit >= POSTS.length) return F.raidCrossing ? '柵の内の連絡道を回り、口の印へ進め' : '柵を越えず、内側から口の印へ回れ';
      return '陣幕と小屋を回り、残る篝火の印へ進め';
    },
    terrainTriangles: true, // 描く三角形と接地の高さをそろえ、坂で旗や足を浮かせない。
    terrainContactView: true, // 視点を切り替えた直後も、描く坂と視点の手前の面を突き抜けない。
    smoothGroundFire: true, // 篝火の照りを頂点間へ伸ばさず、地面の上の距離でぼかす。
    distantTerrainTriangles: true, // 遠景の備えも四隅の平均で浮かせず、地面の三角形へ合わせる。
    distantFootOnly: true, // 山道の控えも徒歩にそろえ、軽い軍勢だけに騎馬を残さない。
    keepTerrainGrid: true, // 携帯でも同じ格子で描き、麓の切岸に足や視点を埋めない。
    groundHalf: 430, // 地面の頂点数を増やさず、帯曲輪と外の堀まで地形の範囲に入れる。
    lookoutLogFrame: true, // 高画質の城の井楼で、指定済みの丸太組みを描く。
    moveLim: 410,   // 広げた本丸・帯曲輪・裏道の兵を麓へ引き戻さない。
    noHorse: true, // 武将の自動乗馬も止め、狭い柵と追撃路では徒立ちにする。
    nearAllyFadeRadius: 2.2, // 近い味方の扱いを描画直前の判定へそろえる。
    time: 'dusk',
    // 遠い山と霞は冬の夕の青灰（茶の霞に見えていた。10/29 採点）。
    fogTint: 0x7f8a97, fogTintStrength: 0.6, hazeColor: 0x8a95a2,
    mountainScale: 0.58, mountainHaze: 0.82, // 遠い峰は低く霞ませ、近くの城山の上へ切り絵の壁を重ねない。
    winter: true,
    winterGrass: true, // 雪ではなく枯れ草を残す。
    tuftTint: 0xb5a18a, // 草だけを薄い褐色へ。夜の月明かりで白黄に浮かせない。
    nearGrassTint: 0xb5a18a,
    darkFootprints: true, // 夜の足跡は光らない小さな泥色。
    arrowRainPerBow: 1, // 小勢の弓から数十本の飾り矢を増やさない。本物の射矢は残す。
    naturalArrowRain: true, // 飛ぶ矢を遠くで太い黒棒にせず、夜の霧へなじませる。
    arrowRainGroundCue: false, // 坂を覆う白黒の大輪を外す。矢の影・警告・よける先の案内は残す。
    noGroundArrows: true, // 外れ矢を柵の口へ積み重ね、白い針山にしない。射矢の当たりは残す。
    lifeSizePinnedArrows: true, pinnedArrowAxisScale: true, // 胴の動きと描く体の切り替えに追従し、刺さった矢の実寸を保つ。
    groundedSlopeRocks: true, // 岩の下側の縁まで坂へ埋め、宙に張り出す影の板を置かない。
    slopeRockFaces: true, // 急な坂でも岩の厚みを斜面の外へ向ける。
    rockCenterGround: true, // 岩の中心を埋め、上側の土へ全体を沈めて薄い板にしない。
    rockDrawGround: true, // 岩と根草を描かれる三角形の高さへ据え、道の折れで浮かせない。
    curvedRockTufts: true, litRockTufts: true, // 岩の根元を黒い直線の針にせず、短い葉で土へつなぐ。
    nightLift: 2.4, // 夜の一様な照り返しを抑え、道の形と篝火の明暗を残す。
    fireLightLift: 1.5, // 既存の灯りだけ強め、篝火の周りに橙の照りを残す。
    unitNightScale: 0.4, // 兵だけの輪郭補光を抑える。道と篝火の明るさは保つ。
    climbTan: 0.7, // 道のない切岸を駆け上がらせない。
    muddy: 0.3,
    patchyGround: true, // 共通の群落分布で土の絵・遠い草・足元の株の裸地をそろえる。
    meleeGroundedFeet: true, // 槍を合わせる時は前後の足を坂へ据え、上体だけ滑らせない。
    livingSpearHedge: true, // 槍の段は保ち、呼吸と押される手元だけを一人ずつ揺らす。
    variedInfantry: true, variedLoanArmor: true, variedHeadgear: true, // 貸し具足の汚れ・仕立て・被り物を既存の六組で分ける。
    variedMarch: true, strideLimit: 1.1, // 坂を寄せる列と逃げ足の歩幅を、人の振りに収める。
    fallPaceSpread: 0.35, // 一斉に討たれても膝の折れる間をずらす。
    settleSideFalls: true, groundedFalls: true, // 横斬りの亡骸を肩から土へ寝かせる。
    drawTimeUnitParts: true, // 骨と具足の逆行列を描く時にそろえ、動いた兵の首・笠を地面に取り残さない（25秒の画面に首だけの兵が出た 10/28）。
    slopeLitter: true, // 低・中画質でも落ちた槍の傾きを坂へ合わせ、角度の上限で穂を浮かせない。
    longitudinalSpearFalls: true, // 長柄は握り直下の法線でなく、穂先と石突を結ぶ坂へ寝かせる。
    groundedFallImpact: true, wetEarthBursts: true, // 地を打つ時に音と低い泥粒。湿った山道に白煙を出さない。
    mist: true,   // 霧が出やすい山城。戦の始めは霧が深く、しだいに薄れる。当夜の霧の濃さは復元
    mood: 'plain', // 夕暮れの支度に朝靄の色を重ねない。
    mistFar: 230, // 山の靄を残しつつ、柵の外の敵影と尾根の道を読める距離にする。
    groundMistScale: 0.3,
    paths: fieldPaths(),
    slopeForest: 0.65, // 奥の山腹に林の濃淡を残す。道と陣の平場は共通の除け方を使う。
    stableCliffGrain: true, // 急な城山の地肌を法線で引き伸ばさず、土と苔の斑を連続させる。
    erodedSlopes: true, // 城山の急斜面に土の溝と岩の斑を残す。地形と通れる道は変えない。
    pathWidth: 3.5, // 粗い地面でも山道に土の筋を残す。
    // 枯れ色を裸地と読み違えない。道の外は群落の芯と低い草を残す。
    grassMix(x, z, pd) {
      if (Math.abs(x) < 60 && z > FENCE_Z + 4 && z < 80) return 0;
      const verge = THREE.MathUtils.smoothstep(pd, 1.0, 2.8);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.sin(z * 0.17)) * Math.cos(z * 0.19);
      return verge * (0.48 + patch * 0.44);
    },
    treePadMul: 1.1, // 枝葉が山道へ張り出さないよう、幹を道から離す。
    nearTreeFadeRadius: 4.5, // 視点に近い幹だけを薄くし、敵と道標を隠さない。
    tint(x, z, h, c) {
      const d = fieldRoadDistance(x, z);
      const patch = Math.sin(x * 0.09) * Math.cos(z * 0.07);
      const soil = Math.sin(x * 0.17 + z * 0.11) * Math.cos(z * 0.13);
      if (d < 3.5) c.setRGB(0.30, 0.24, 0.16);
      else if (Math.abs(x) < 60 && z > FENCE_Z + 4 && z < 80) {
        // 踏み土は陣の真ん中の通い道だけ（広いと陣の内が茶の一枚になる。25秒の画面で斑が一つも見えなかった 10/28）。
        const trod = Math.exp(-(x * x / 260 + (z - 18) ** 2 / 380));
        // 陣の内は霜の解けた踏み土。白く光る広い板に見えていたので暗く湿った色へ（10/28）
        c.setRGB(0.31 - trod * 0.06 + soil * 0.025, 0.255 - trod * 0.05, 0.175 - trod * 0.035);
        // 踏まれていない所に霜の残る枯れ草の斑（十二月の夕。茶の一枚に見えていた。10/28）
        const frost = Math.max(0, Math.sin(x * 0.23 + z * 0.05) * Math.cos(z * 0.19 - x * 0.07) + patch * 0.5 - 0.15) * (1 - trod) * 0.9;
        c.setRGB(c.r + (0.47 - c.r) * frost, c.g + (0.44 - c.g) * frost, c.b + (0.36 - c.b) * frost);
        // 枯れ草の株の群れ（黄土の斑）と、窪みに溜まった湿った黒土。どちらも踏み土の外だけ。
        const tuft = Math.max(0, Math.sin(x * 0.41 - z * 0.13) * Math.sin(z * 0.37 + x * 0.09) + soil * 0.6 - 0.25) * (1 - trod);
        c.setRGB(c.r + (0.46 - c.r) * tuft, c.g + (0.38 - c.g) * tuft, c.b + (0.2 - c.b) * tuft);
        const damp = Math.max(0, -patch * 0.8 - soil * 0.6 - 0.35) * (1 - frost);
        c.multiplyScalar(1 - damp * 0.5);
        // 地面は色の緑の勝ち具合で草・土を混ぜる。色だけでは土の一枚のままなので、霜と株の斑には枯れ草の絵を出す（10/29 採点：茶の一枚）。
        const straw = Math.min(1, frost * 1.3 + tuft * 1.6) * (1 - trod * 0.7);
        if (straw > 0.05) c.g = Math.max(c.g, (c.r + c.b) / 2 + 0.02 + 0.08 * straw);
      }
      else if (Math.abs(x) < 110 && z > -125 && z < 120) {
        c.setRGB(0.43 + patch * 0.045, 0.375 + soil * 0.035, 0.26 + patch * 0.025);
        // 柵ぞいの野（篝火から西を向く25秒の画面の足もと）も、枯れ草の株の群れと湿った黒土の窪みで茶の一枚にしない（10/28）。
        const tuft = Math.max(0, Math.sin(x * 0.41 - z * 0.13) * Math.sin(z * 0.37 + x * 0.09) + soil * 0.6 - 0.2);
        c.setRGB(c.r + (0.5 - c.r) * tuft, c.g + (0.44 - c.g) * tuft, c.b + (0.24 - c.b) * tuft);
        // 日陰に残る霜の灰の斑と、踏まれて出た黒い土の筋（茶の一枚に見えていた。10/29 採点）。
        const frost = Math.max(0, Math.sin(x * 0.27 + z * 0.07) * Math.cos(z * 0.23 - x * 0.09) + patch * 0.5 - 0.35) * 0.85;
        c.setRGB(c.r + (0.46 - c.r) * frost, c.g + (0.46 - c.g) * frost, c.b + (0.43 - c.b) * frost);
        const damp = Math.max(0, -patch * 0.8 - soil * 0.6 - 0.3);
        c.multiplyScalar(1 - damp * 0.55);
        const rut = Math.max(0, Math.sin(x * 0.13 - z * 0.31 + soil * 2) - 0.8) * 4;
        c.multiplyScalar(1 - Math.min(1, rut) * 0.35);
        const straw = Math.min(1, frost * 1.3 + tuft * 1.2) * (1 - Math.min(1, rut));
        if (straw > 0.05) c.g = Math.max(c.g, (c.r + c.b) / 2 + 0.02 + 0.08 * straw);
      }
      else if (IWAMURA_CASTLE_PLAN.kuruwa.some(k => inPoly(k.poly, x, z))) {
        // 写真の屋敷段は踏み固めた褐色の平場。段の外の草と切岸は従来の色を残す。
        c.setRGB(.44 + patch * .025, .37 + soil * .025, .26 + patch * .02);
      }
      else if (z < -10) {
        // 色の緑の割合を共通の地面が草・土へ読み替える。斜面にも土の斑を残す。
        if (soil > 0.25) c.setRGB(0.36 + patch * 0.04, 0.29, 0.18);
        else c.setRGB(0.24 + patch * 0.05, 0.34 + soil * 0.05, 0.15);
        // 城山の段の石垣の天端と裾は、日の当たらない苔の暗い緑（手本の苔むした曲輪の段。10/29）。段の高さは下の hillSteps と同じ。
        if (z < -55) for (const sh of [9, 16, 24, 34]) {
          const moss = Math.max(0, 1 - Math.abs(h - sh - 0.4) / 2.2) * (0.75 + patch * 0.25);
          if (moss > 0) c.setRGB(c.r + (0.17 - c.r) * moss, c.g + (0.25 - c.g) * moss, c.b + (0.13 - c.b) * moss);
        }
      }
    },
    height,
    moveWay: campWay,
    runnerWay: campWay, // 遠くの点の使番も、姿を出す前から陣幕の口へ回る。
    // 陣の内と建物は空け、柵の外の斜面には木を残す。道は共通の植え分けで除く。
    clear: (x, z) => castleClear(x, z) || (Math.abs(x) < 80 && z > -14 && z < 80) || (Math.abs(x - 24) < 6 && Math.abs(z + 64) < 10) || (Math.abs(x + 175) < 50 && z > 88 && z < 190),
    trees: 520,
    nearCedarBranches: true, // 高画質でも杉全体を縦長の交差板へ戻さず、共有する枝房を残す。
    foldedNeedleCards: true, slopingNeedleBoughs: true, // 葉房を浅く折って枝先へ寝かせる。面数と木の位置は保つ。
    layeredNeedles: true, raggedNeedles: true, // 共用する杉の枝先を崩し、積んだ円錐の直線を和らげる。
    brokenNeedleTiers: true, // 杉の枝の段を不ぞろいにし、平らな底面の円盤を残さない。
    keepNeedleLayers: true, // 作った杉の枝葉を残し、粗い八面体への置き換えを避ける。
    softFarNeedles: true, // 遠い杉も硬い三角の輪郭を残さない。
    tufts: 3000,
    // 柵の外の手前（柵から麓まで）は木をまばらにし、篝火の持ち場から東西を向く25秒の画面で、城山の段と石垣を手前の杉でふさがない（10/28 点付け）。
    treeDensity: (x, z) => (castleClear(x, z) ? 0 : Math.abs(x) < 140 && z > -95 && z < -14 ? 0.12 : Math.abs(x) < 80 && z > -110 && z < -14 ? 0.65 : 1),
    // 柵の外の二つの木立は、段の石垣の上の山腹へ移す（篝火から東西を向く画面の右上・左上で段をふさがず、段の上に杉の林を見せる。10/28）。
    groves: [{ x: -96, z: -150, r: 14, n: 16 }, { x: 96, z: -150, r: 14, n: 16 },
      { x: -28, z: -94, r: 10, n: 12 }, { x: 32, z: -112, r: 12, n: 12 },
      { x: -46, z: -133, r: 14, n: 12 }], // 麓の道を空け、奥行きの違う木立を残す。
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  guideMarker: (rt) => {
    const F = rt.flags;
    if (F.step === 0) return 'kawa';
    // 火の支度中でも、柵の外からは先に開口へ戻す。
    if (F.step < 3 && F.raidReturning) return 'raidMouth';
    // 任務札の次の更新を待たず、近い敵を見つけたら点火への矢印を外す。
    if (F.step === 1 && !F.scoutNear && !F.localContact && F.lit < POSTS.length) return 'p' + F.firePost;
    // 目の前で槍を合わせる間も、柵の外から戻る口の案内は残す。
    if ((F.step === 1 || F.step === 2) &&
        (F.localContact || F.step === 1 && F.scoutContact || F.atRaidMouth) && !F.breached && !F.raidReturning) return null;
    if (F.step < 3) return 'raidMouth';
    // 麓の名札は残し、到着後は中心へ歩き直す方向案内を止める。
    if (F.chaseArrived) return null;
    // 近い敵の印がある間は、隠した道標への矢印を重ねない。
    if (F.roadFight) return null;
    return 'chaseRoad';
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  compactIntro: true,
  introTaskFirst: true,
  openingFootSignOnly: true, // 本人を囲む縦長の枠を省き、足元の丸と進む向きを残す。
  introSides: { a: '織田勢', b: '武田勢' },
  introText: 'まず印の篝火へ。近づき「篝火を焚く」を長押ししよう。次の持ち場は任務の札で確かめよう。',
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・霜枯れの草（def.timeslip）
    // 携帯も四本の垂直な柱と交互の横木にする。既存の結合済みの形を使う。
    const campLookout = { kind: 'ro', mon: 'oda', height: 7.2, boarded: false, logFrame: true };
    F.step = 0; F.stepT = rt.t; F.ek = 0; F.ak = 0; F.lit = 0;
    F.botMouthGuide = { x: 0, z: 0 };
    F.breach = 0; F.pollT = 0; F.quietSince = rt.t; F.duskAt = rt.t + 16; F.raidAt = rt.t + 44;
    F.siege = siegeStart();
    // 柵を守る間は地上の仕事を優先し、物見の長押し札へ誘わない。
    // 追撃に移れば元の梯子操作へ戻す。床や兵の登り方は変えない。
    const ladderUse = rt.player.updateLadderUse;
    rt.player.updateLadderUse = function (dt) {
      if (F.step < 3 && !this.u.climb) {
        if (this.ladderO) { rt.uninteract('ladder-climb'); this.ladderO = null; }
        return;
      }
      ladderUse.call(this, dt);
    };
    this.notices(rt);
    this.fallenScene(rt);
    this.slopeScene(rt);
    F.rescued = true; // この戦では倒れた主人公を共通の担ぎ起こしで戦列へ戻さない。
    // ---- 水晶山砦（castles/iwamura.js。陣の柵・木戸は下の wallLine で手組みのまま＝場と地形の段だけ借りる） ----
    // 陣の平場は城の白い砂利でなく踏み土（白く光る板に見えていた。10/28）。地面の色は def.tint の陣の内で付ける
    F.C = buildCastlePlan(rt, IWAMURA_SUISHOZAN_PLAN, { baseHeight: liftedTerrain, edgeW: 6, skipWalls: ['honjin'], life: false, floorLook: false });
    // ---- 岩村城（外側曲輪→八幡曲輪→二の丸→主郭→本丸。土塁・切岸・木柵・木戸。本丸を総石垣にしない） ----
    F.castleC = buildCastlePlan(rt, IWAMURA_CASTLE_PLAN, { baseHeight: liftedTerrain, edgeW: 3, buildGates: true, buildTowers: true, gateTeam: 1, towerTeam: 1, life: false });
    // 城方が出入りする夜討ちの木戸は開放。見た目と通行の当たりをそろえる。
    for (const g of Object.values(F.castleC.gateObjs)) { g.open(); g.struct.opened = true; }
    const lifeStart = rt.scene.children.length;
    buildIwamuraLife(rt);
    buildSuishozanTools(rt);
    this.mountainScene(rt, lifeStart);
    campGround(W);
    iwamuraMountainHaze(W);
    // ---- 水晶山の陣：柵（中央に一つの口）、陣幕、小屋 ----
    // 写真の木柵は細い杭と二段の横木。岩村の高画質だけ既存の軽い柵を使う。
    // 壊れる区画・高さ・控え・盛り土は保ち、口や兵の配置は動かさない。
    const campFence = { lightFence: true, terrainRails: true }; // 横木を途中の杭へ継ぎ、坂を斜めに横切らせない。
    F.fenceSegs = [   // F.fence とは名付けない（playbot は F.fence がある戦を設楽原の柵とみなす）
      ...wallLine(rt, [[-60, FENCE_Z + 4], [-8, FENCE_Z]], { team: 0, hp: 900, name: '陣の柵', segLen: 6, meshOpt: campFence }),
      ...wallLine(rt, [[8, FENCE_Z], [60, FENCE_Z + 4]], { team: 0, hp: 900, name: '陣の柵', segLen: 6, meshOpt: campFence }),
    ];
    // 東の迂回路に口を残し、陣の脇にも柵を置く。南は兵糧を運ぶため開ける。
    wallLine(rt, [[-60, -2], [-60, 30]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8, meshOpt: campFence });
    wallLine(rt, [[60, -2], [60, 6]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8, meshOpt: campFence });
    wallLine(rt, [[60, 20], [60, 30]], { team: 0, hp: 900, name: '陣の脇の柵', segLen: 8, meshOpt: campFence });
    if (true) {
      // 陣の両翼に二枚組の置楯。北へ表を向け、裏の支えを陣内へ出す。
      // 中央の八メートルの口・東の迂回路・既存の槍組と鉄砲組は空ける。
      // 未確認の個人紋は付けず、幟で織田方を示す。共通の楯の形と材を使い回す。
      for (const [ax, bx] of [[-51, -43], [43, 51]])
        rt.scene.add(tateNarabi(W, ax, 1.5, bx, 1.5, { fieldPairs: true }));
    }
    rt.scene.add(tawara(W, -18, 30, 0.3, 6));
    // 持ち場の手前の陣の暮らし（兵糧の俵・薪・旗竿の立て）。中央の通り道と東の迂回の道は空ける。配置は推定（10/28）。
    rt.scene.add(tawara(W, 12, 2.5, 0.5, 3), lumber(W, -8, 5, .4), hatazao(W, 16, 7, -.3, 5, 'oda'));
    // 柵の内の両脇に寝起きの陣小屋の群れ（持ち場から見える。どの画質でも同じ低い板葺き）。位置と数は推定。
    // 中央の口・東の迂回の道（z14）・篝火の持ち場・物見は空ける。西の群れは陣幕で囲い、南を口にする。
    // 東の群れは右の篝火（18, -1）の背から外す。篝火へ寄る肩越しの画面を小屋の壁でふさがない（10/28 点付け）。
    rt.scene.add(jinmaku(W, -34, 13, 17, 13, 6, { mon: 'oda' }));
    for (const [x, z, r] of [[-30, 10, .06], [-38, 15, -.08], [-27, 25, .1], [27, 4, .04], [33, 0, -.06], [32, 10, .08], [38, 8, -.05]])
      rt.scene.add(hut(W, x, z, 5, 3.4, r, { h: 2, wall: 0x7d6a50, minka: false, thatchTies: true, groundedHome: true }));
    // 柵の裏に立てかけた竹束。射線と口は塞がない。西の二つは左の篝火で焚く時のカメラをふさがないよう西へ寄せる（10/28）。
    for (const [x, z, r] of [[-40, 1.6, .05], [-37.6, 1.8, 0], [17.5, -2.6, 0], [-34, 2.4, .1], [36, 2.2, -.1]]) rt.scene.add(takataba(W, x, z, r));
    // 城山の曲輪の南面に低い野面の石垣（段の影が麓から見える）。範囲は推定。
    for (const seg of [[[8, -160], [14, -174]], [[28, -181], [44, -187]], [[-22, -208], [-2, -207]]]) {
      const pts = seg.map(([x, z]) => castlePoint(x, z));
      rt.scene.add(ishigaki(W, pts, { kind: 'nozura', topY: Math.max(...pts.map(([x, z]) => W.heightAt(x, z))) + .3, minH: 1.2, maxH: 2.2, out: -1, noKit: true }));
    }
    // 城山の南の切岸に段の野面石垣を三段（水晶山の持ち場から霧越しに段が見える。10/28）。高さの等高線に沿わせる。範囲と段の数は推定。
    // 霧の中で白く浮かないよう、苔と夕陰で沈んだ石の色にする（材質は三段で一つを共用）。
    const shadeStone = new Map();
    for (const h of [22, 44, 68]) {
      const pts = [];
      for (let x = -66; x <= 42; x += 9) {
        let lo = -175, hi = -95;   // 南（+z）ほど低い。高さ h の所を二分で探す
        for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (W.heightAt(x, m) > h) lo = m; else hi = m; }
        pts.push([x, (lo + hi) / 2 + 0.6]);
      }
      const wall = ishigaki(W, pts, { kind: 'nozura', top: 0.3, minH: 4, out: 1, big: 1.8, noKit: true });
      wall.traverse((o) => {
        if (!o.material || Array.isArray(o.material)) return;
        let m = shadeStone.get(o.material);
        if (!m) { m = o.material.clone(); m.color.multiplyScalar(0.5); shadeStone.set(o.material, m); }
        o.material = m;
      });
      rt.scene.add(wall);
    }
    // 25秒で柵の篝火へ出ると、カメラは東か西を向き、城山の裾（東 x48〜232・西 x-184〜-76、z-80〜-130）が左右の上に入る。
    // そこへ段の野面石垣を四段と、段の上に低い柵・武田方の赤い旗を（城山の段に見せる。範囲・段の数は推定。10/28）。
    // 登城道（x0 前後のつづら折り）と、上の三段の石垣（x-66〜42）の所は空ける。
    // 段の石垣・柵・旗は一つの組にまとめ、遠い霧を山肌より薄くして（夕空の霞に白く溶かさず）段の線を暗く読ませる。
    const hillSteps = new THREE.Group(); rt.scene.add(hillSteps);
    for (const [x0, x1] of [[48, 232], [-184, -76]]) for (const h of [9, 16, 24, 34]) {
      const pts = [];
      for (let x = x0; x <= x1; x += 8) {
        let lo = -150, hi = -55;   // 北（-z）ほど高い。高さ h の所を二分で探す
        for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (W.heightAt(x, m) > h) lo = m; else hi = m; }
        pts.push([x, (lo + hi) / 2 + 0.5]);
      }
      hillSteps.add(ishigaki(W, pts, { kind: 'nozura', top: 0.3, minH: 4.5, out: 1, big: 2.4, noKit: true }));
      // 段の天端の塀は城の部品の板塀（狭間つき・早い時代）。下の二段は低い腰柵のまま（10/29）。
      if (h >= 16) castlePart(W, 'hei', { pts: pts.map(([x, z]) => [x, z - 1.6]), yAt: () => h + 0.3, h: 2.1, era: 'early', kind: 'ita' });
      else for (let i = 1; i < pts.length; i++) hillSteps.add(koshisaku(W, [pts[i - 1][0], pts[i - 1][1] - 1.6, pts[i][0], pts[i][1] - 1.6], { h: 1.15 }));
      if (h === 34) for (let i = 4; i < pts.length; i += 5) hillSteps.add(hatazao(W, pts[i][0], pts[i][1] - 3, 0, 3, 'akazonae'));
      // 上の段の篝火：夕暮れの霧の中でも段の並びが灯で読める（台は二回で描く。炎は数を絞る）
      if (h === 34) {
        const fires = [];
        for (let i = 2; i < pts.length; i += 6) fires.push([pts[i][0], pts[i][1] - 2.5]);
        rt.scene.add(kagaribiBatch(W, fires));
        for (const [x, z] of fires) W.addFire(x, z, { torch: true, h: 1.3 });
      }
    }
    // 段の石は苔むした野面（手本の苔の石垣の曲輪。灰の階段に見せない。10/29 採点）。stepHaze が材質を複製した後に色だけ寄せる。
    stepHaze(hillSteps);
    const mossed = new Set();
    hillSteps.traverse((o) => {
      const m = o.material;
      if (!m || Array.isArray(m) || mossed.has(m) || !m.color || !o.isMesh) return;
      mossed.add(m);
      if (Math.abs(m.color.r - m.color.g) < 0.12 && Math.abs(m.color.g - m.color.b) < 0.12) m.color.multiply(new THREE.Color(0.62, 0.74, 0.52));
    });
    // 陣の番所も両翼の仮小屋と同じ低い切妻へ。建物の形は推定復元。
    // 梁・鴨居・板戸へ室内高をそろえて渡し、天井下地を屋根裏へ納める。
    const [watchX, watchZ, watchW, watchD] = CAMP_SERVICE_HOUSES[0];
    goten(rt, watchX, watchZ, { w: watchW, d: watchD, team: 0, tile: false, boardRoof: true, earth: 0x9b805b, naka: true, doorX: 0, kind: 'bansho', profile: 'iwamura_bansho', name: '陣の番小屋', noTarget: true,
      ...(SETTINGS.quality === 'high' ? { fieldFort: true, interiorH: 2.5 } : {}) });
    // 水晶山の本陣（総大将 織田信忠）と、岩村城の城将 秋山虎繁の陣所
    // 信忠個人の馬印は未確認。信長の金唐傘を自動で借りず、織田の所属旗で本陣を示す。
    F.honjin = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', uma: false, general: { name: '織田信忠' }, guard: 15, reserve: 200, runTo: { x: 0, z: FENCE_Z + 8 } });
    F.honjin.guard.order = 'move'; F.honjin.guard.dest = { x: 0, z: 34 };
    F.honjin.guard.onArrive = (g) => { g.order = 'hold'; };
    F.honjin.guard.formation = 'yari'; F.honjin.guard.aggro = 6;
    F.keep = makeLordKeep(rt, { name: '秋山虎繁', naka: F.castleC.seat.naka, faction: 'takeda', flag: 'takeda', guardN: 6 });
    F.keep.lord.invuln = true; F.keep.lord.mustLive = true; // 開城後に捕らえられる城将を夜の討取りにしない。
    // 切岸の縁を避け、四本の柱と南の梯子を陣内の平場へ据える。
    for (const y of IWAMURA_SUISHOZAN_PLAN.yagura)
      // 篝火の持ち場の背後を空け、肩越しの視点を井楼の丸太へ入れない。
      monomi(rt, Math.sign(y.at[0]) * 46, y.at[1], { name: y.name, team: 0, ...campLookout });
    for (const [x, z, k] of [[-8, 36, 'oda'], [8, 36, 'eiraku'], [-40, FENCE_Z + 8, 'oda'], [40, FENCE_Z + 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 柵の内に沿って幟の列（篝火の持ち場から東西を向く25秒の画面に、水晶山の陣の旗として入る。数と間は推定。10/29）
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = sx * (24 + i * 7), z = FENCE_Z + (Math.abs(x) - 8) * 4 / 52 + 1.5;
      rt.scene.add(nobori(W, x, z, 'oda', 5.6));
    }
    // ---- 包囲する織田の陣は水晶山一つに集めず、尾根・登城道の途中に散らす（見張り・兵糧所。大きな戦闘は置かない） ----
    monomi(rt, 24, -64, { name: '登城道の物見', team: 0, ...campLookout });
    rt.scene.add(nobori(W, 24, -70, 'oda', 6));              // 見張り：登城道の折れを見張る物見
    rt.scene.add(tawara(W, -24, 60, 0.3, 8));
    // 兵糧所も常設の館と分け、低い仮小屋とする。板倉・土間・滑る板戸は共通室内を使う。
    const [storeX, storeZ, storeW, storeD] = CAMP_SERVICE_HOUSES[1];
    goten(rt, storeX, storeZ, { w: storeW, d: storeD, team: 0, tile: false, boardRoof: true, earth: 0x9b805b, naka: true, doorX: 0, kind: 'kura', profile: 'iwamura_kura', name: '陣の兵糧小屋', noTarget: true,
      ...(SETTINGS.quality === 'high' ? { fieldFort: true, interiorH: 2.5, doorFire: false } : {}) });
    // ---- 岩村城の曲輪の建物（主殿・倉・番所くらい。大天守は置かない） ----
    // 本丸の主殿は縄張り（castles/iwamura.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に秋山虎繁（kaito 10/2）
    for (const [x, z] of [[CASTLE.x - 8, CASTLE.z + 6], [CASTLE.x + 8, CASTLE.z + 6]]) rt.scene.add(nobori(W, x, z, 'takeda', 7));
    // ---- 河尻秀隆の手（自分の持ち場）、毛利河内の手 ----
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -9, z: FENCE_Z + 8 }, facing: Math.PI, fixed: true, width: 7, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }, { type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '河尻秀隆', invuln: true, horo: 0 } }], ODA));
    F.kawaU = F.kawa.units.find((u) => u.name === '河尻秀隆');
    F.mouri = allyGroup(rt, { name: '毛利河内の手', anchor: { x: 9, z: FENCE_Z + 8 }, facing: Math.PI, fixed: true, width: 7, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }, { type: 'busho', n: 1, o: { name: '毛利河内', invuln: true } }], ODA));
    F.oda = [F.kawa, F.mouri]; F.front = F.oda.slice();
    // その場の河尻・毛利が列を動かす。折れごとの歩みまで本陣の新しい下知にすると、
    // 使番待ちで位置が巻き戻り、集合済みの印と到着処理だけが食い違う。
    for (const g of F.oda) { g.directOrders = true; g.defMult = 1.25; g.dmgMult = 1; g.guardOn = true; g.leader = g.units.find((u) => u.name); }
    // 鉄砲・口の槍組も初めから持ち場に置く。夜になって突然作らない。
    F.fgun = allyGroup(rt, { fixed: true, name: '柵の内の鉄砲組', anchor: { x: 4, z: FENCE_Z + 8 }, facing: Math.PI, aggro: 4, formation: 'line' },
      battleLook(rt, [{ type: 'gun', n: 10 }], ODA));
    // 信長公記巻八にある迎撃の四将をそろえる。持ち場は復元で、元の侍二人に名を付け、兵数・兵種・強さは保つ。
    // 個人の指物は未確認。指物を省く指定で、新たな旗持ちへ戦う足軽を振り替えることも防ぐ。
    F.gate = allyGroup(rt, { fixed: true, name: '水晶山の備え（浅野・猿荻）', anchor: { x: 0, z: FENCE_Z + 3 }, facing: Math.PI, width: 6, aggro: 6, formation: 'yari' },
      battleLook(rt, [{ type: 'samurai', n: 1, o: { name: '浅野左近', flag: null } }, { type: 'samurai', n: 1, o: { name: '猿荻甚太郎', flag: null } }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda.push(F.gate);
    // 夜討ちの先触れ六人。日が落ちてから登城道の下より中央の口へ歩く（配置は復元）。
    // 第一波から人数を分け、兵の総数を増やさない。
    F.scout = enemyGroup(rt, {
      faction: 'takeda', name: '登城道の見張り', anchor: { x: SCOUT_PATH[0][0], z: SCOUT_PATH[0][1] }, facing: 0,
      order: 'hold', path: SCOUT_PATH, pathIdx: 1, formation: 'column', colW: 2, roadColumn: true,
      speed: 2.8, march: false, aggro: 0, seekRange: 4, noAI: true, morale: 85, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [{ type: 'ashigaru', n: 6 }], TAKEDA));
    F.scout.morale = F.siege.morale;
    F.scout.onArrive = (g) => { g.order = 'attack'; g.march = false; g.formation = 'loose'; g.focus = rt.player.u; };
    // 元の五十六人のうち八人を追撃路へ分ける。途中の補充はしない。
    F.directedMouth = null; F.routSaid = new Set(); F.sentWaves = [];
    F.waves = RAID_PATHS.map((path, i) => enemyGroup(rt, {
      fixed: true, faction: 'takeda', name: i === 2 ? '城口から出た武田勢' : '山道の夜討ち勢',
      anchor: { x: path[0][0], z: path[0][1] }, facing: Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]), order: 'hold', formation: 'column', colW: 2, roadColumn: true,
      aggro: 4, seekRange: 28, noAI: true, morale: 85, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [
      { type: 'samurai', n: i < 3 ? 2 : 0 },
      { type: 'ashigaru', n: i < 3 ? [6, 12, 8][i] : i >= 4 ? 2 : 6 },
      { type: 'bow', n: i < 3 ? 0 : 2 },
    ], TAKEDA)));
    // 城へ退く手を守る小隊。ならした道の二つの折れに初めから置く（配置は遊びの補完）。
    // 追う段で敵に会わない間が長かった（10/6 測り：切れ目79秒）。道の奥の折れにも一組置く。
    F.roadGuards = [...new Set([2, 3, CHASE_PATH.length - 2])].map((i) => CHASE_PATH[i]).map(([x, z]) => enemyGroup(rt, {
      fixed: true, faction: 'takeda', name: '麓の道を守る武田勢', anchor: { x, z }, facing: 0,
      order: 'hold', formation: 'column', colW: 2, aggro: 4, seekRange: 8, noAI: true, guardOn: true,
      morale: F.siege.morale, fleeDir: { x: 0, z: -1 },
    }, battleLook(rt, [{ type: 'ashigaru', n: 4 }], TAKEDA)));
    F.roadDefenders = [...F.waves, ...F.roadGuards];
    for (let i = 0; i < F.waves.length; i++) {
      const g = F.waves[i];
      // 元の山道から口へ着き、必要な時だけ柵の内の連絡道へ回る。
      g.iwMouthPaths = [
        [...RAID_PATHS[i], ...(i === 1 ? MOUTH_BACK.slice(1, -1) : [[0, 14]])],
        [...RAID_PATHS[i], ...(i === 1 ? [] : MOUTH_LINK.slice(1))],
      ];
    }
    for (let i = 0; i < F.waves.length; i++) { F.waves[i].iwReturn = RETURN_PATHS[i].map((q) => q.slice()); F.waves[i].iwInitial = F.waves[i].count; }
    for (const g of F.waves) g.morale = F.siege.morale;
    F.contacts = [F.scout, ...F.waves];
    // 柵の口に着いた列を三メートル以上へ散らさず、後続と槍の前線をつなぐ。
    // 人数・到着時刻・間合い・攻撃力は元のまま。行軍中は従来の二列を使う。
    for (const g of F.contacts) g.looseSpacing = 1.15;
    F.rearGroups = [...F.contacts, ...F.roadGuards];
    // 上の兵数札は水晶山と麓の実兵。遠景の推定総勢と混ぜず、初期数と残数を同じ隊から数える。
    F.fieldAllies = [...F.oda, F.fgun, F.honjin.guard];
    F.forceA0 = F.fieldAllies.reduce((n, g) => n + g.units.length, 0);
    F.forceB0 = F.rearGroups.reduce((n, g) => n + g.units.length, 0);
    this.raidTorches(rt);
    // 待機する列は弓を射ず、夜討ちの下知を待つ。
    for (const g of F.waves) g.fire = false;
    // 守りの弓・鉄砲も支度中に山道の先触れを撃たず、敵が寄せてから射る。
    for (const g of [...F.oda, F.fgun]) g.fire = false;
    F.raidInitial = F.contacts.reduce((n, g) => n + g.count, 0);
    const n = Math.min(RANKS[rt.G.rank].squad, battleRoom(rt));
    if (n) rt.makeSquad({ x: 4, z: FENCE_Z + 14 }, Math.PI, [{ kind: 'spear', n }]);
    const hosts = rosterBuild(rt, JIN);
    F.castleDA = hosts[1].ni;
    // 戦う人数と下知を変えず、寄せ手と守り手の背後へ薄い控えの列をつなぐ。
    // 本物へ替えないので強さを増やさず、近くでは共通の間引きに任せる。
    for (const [g, flag, seed] of [[F.kawa, 'oda', 151], [F.mouri, 'oda', 152], [F.waves[0], 'takeda', 153], [F.waves[2], 'takeda', 154]]) {
      const b = KIT.backOf(rt, g, { flag, count: 24, w: 12, depth: 8, gap: 7, seed });
      b.army.noWake = true;
    }
    for (const [x, z] of [[-10, 40], [14, 42]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 柵の外の両口と山道の折れを照らす。兵の通る筋には置かず、光は共通の四灯を使う。
    for (const [x, z] of [[-6, -18], [72, 10], [-25, -34], [25, -62]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z);
    }
    // 城の坂の松明の列（遠くからも城の道筋が見える。B028・B030）
    for (let i = 2; i < IWA_ROAD.length; i += 3) { const [rx, rz] = IWA_ROAD[i]; W.addFire(rx + 3.5, rz, { torch: true, h: 1.6 }); }

    // 橙の楕円は行き先でなく篝火の大きな照り返し。坂に浮く面を外し、既存の灯で照らす。
    const hiddenGlows = new THREE.Group(); hiddenGlows.visible = false; rt.scene.add(hiddenGlows);
    for (const fire of W.fires) hiddenGlows.add(fire.glow);

    // 陣幕は岩村用の材質を共用。夜の白飛びを抑え、既存の染め紋と布の陰影を残す。
    const campCloths = new Map();
    rt.scene.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes.jpin) return;
      let mat = campCloths.get(m.material);
      if (!mat) {
        const source = m.material;
        mat = source.clone();
        // 引き継ぐ近接処理を、複製した材質へ二度足さない。
        if (camNearMaterials.has(source)) camNearMaterials.add(mat);
        mat.color.setHex(0xd0c6af);
        const compile = source.onBeforeCompile, key = source.customProgramCacheKey();
        mat.customProgramCacheKey = () => key + '|iwaCampCloth';
        mat.onBeforeCompile = (sh, renderer) => {
          compile.call(mat, sh, renderer);
          sh.uniforms.iwaClothNight = W.nightU;
          sh.fragmentShader = 'uniform float iwaClothNight;\n' + sh.fragmentShader.replace(
            '#include <opaque_fragment>', 'outgoingLight *= mix(1.0, 0.55, iwaClothNight);\n#include <opaque_fragment>');
        };
        softenIwamuraBoard(mat);
        campCloths.set(source, mat);
      }
      m.material = mat;
    });

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    // 囲みの守りは主な任務へまとめ、別の兵糧道を探させない。
    rt.banner('遠山氏の山城を囲む', '手前の柵を守る。まず左右の篝火へ');
    F.raidGuide = { x: 0, z: FENCE_Z + 3 };
    // 火の支度中は篝火だけを示す。敵が来たら任務と一緒に口の案内へ切り替える。
    rt.marker('raidMouth', F.raidGuide, () => {
      if (F.step === 1 && !F.raidReturning && !F.scoutNear && !F.localContact && F.lit < POSTS.length) return '';
      // 迎撃中は別の口の印を消す。柵の外からの帰路と、陣の奥の救援は残す。
      if ((F.localContact || F.step === 1 && F.scoutContact) && !F.breached && !F.raidReturning) return '';
      if (F.raidReturning) return '柵の内へ戻る口';
      return F.raidCrossing ? '柵の内の連絡道' : F.breached ? '陣の奥' : F.raidMouthX ? '東の脇口' : '正面の口';
    }, { guideAlways: true });
    rt.after(9, () => {
      if (F.ending || rt.over || F.step !== 1 || F.scoutNear || F.localContact) return;
      // 焚き終えた火へ戻さず、任務札と同じ残る火を知らせる。
      rt.say('使番', F.raidReturning ? watchProgress(rt, true) : F.lit < POSTS.length ? `${POST_NAMES[F.firePost]}へ。残る火を焚け` : watchProgress(rt, true), 3);
    });
    // 下知の声と任務の行き先を出陣時からそろえる。
    // 夜討ちの時刻は同じ。味方の点火の助けも元の時刻に残す。
    this.prepare(rt);
  },

  // ① 篝火を焚く
  prepare(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('prepare');
    F.litPosts = new Set();
    // 最初は近い篝火へ。歩く間に案内を反転させず、点火した時だけ残る火へ切り替える。
    const p = rt.player.u.pos;
    F.firePost = Math.hypot(p.x - POSTS[1].x, p.z - POSTS[1].z) <
      Math.hypot(p.x - POSTS[0].x, p.z - POSTS[0].z) ? 1 : 0;
    F.fireMarkers = [{ id: 'p0' }, { id: 'p1' }];
    rt.unmark('kawa');
    rt.obj('main', fireTask(rt), 'main', true);
    rt.objProgress('main', fireProgress(F));
    rt.say('河尻秀隆', `まず${POST_NAMES[F.firePost]}へ。火を焚け`, 3);
    POSTS.forEach((q, i) => rt.after(25 + i * 10, () => { if (F.step === 1 && !F.ending && !rt.over) this.light(rt, i, true); }));
    POSTS.forEach((q, i) => {
      // 任務札で指定した次の火だけに名を出し、行き先を一つにする。
      rt.marker('p' + i, q, () => F.raidReturning || F.scoutNear || F.localContact || F.firePost !== i ? '' : POST_NAMES[i], { h: 2, guideAlways: true });
      rt.addInteract('p' + i, q, '篝火を焚く', () => this.light(rt, i), { r: 3, hold: 1.5 });
    });
  },
  light(rt, i, helper = false, announce = true) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.litPosts.has(i) || !POSTS[i]) return;
    F.litPosts.add(i);
    const q = POSTS[i];
    rt.uninteract('p' + i); rt.unmark('p' + i);
    rt.scene.add(campfire(rt.world, q.x, q.z)); rt.world.addFire(q.x, q.z);
    F.lit++;
    if (F.lit < POSTS.length) F.firePost = F.litPosts.has(0) ? 1 : 0;
    if (!helper) F.playerLit = true;
    if (F.lit >= POSTS.length) {
      if (F.playerLit) rt.award((t) => t.side.push('篝火を焚いた'), '柵の篝火をそろえた');
      const contact = !F.raidReturning && (F.scoutContact || F.localContact);
      rt.obj('main', contact ? '目の前の敵を、味方と押し返せ' : watchTask(F), 'main', true);
      const fireOrder = contact ? '火はそろった。柵の内で敵を押し返せ' : watchProgress(rt);
      rt.objProgress('main', fireOrder);
      // 迎撃中の自動点火は札だけ更新し、口へ戻る声で斬り合いを遮らない。
      // 夜討ち開始と同時の点火でも、すぐ古くなる待機の声を積まない。
      if (announce && !F.scoutNear && !contact) rt.say('河尻秀隆', watchProgress(rt, true), 3);
      // 支度を早く済ませても、夜討ちの時刻は変えない。
    }
    else if (!F.scoutNear && !F.localContact) {
      rt.obj('main', F.raidReturning ? watchTask(F) : fireTask(rt), 'main', true);
      rt.objProgress('main', F.raidReturning ? watchProgress(rt) : fireProgress(F));
      // 味方が先に焚いた時も、消えた印を探させず残る持ち場へ案内する。
      if (announce) rt.say('組頭', F.raidReturning ? watchProgress(rt, true) : helper ?
        `こちらの火は任せよ。次は${POST_NAMES[F.firePost]}へ` :
        `次は${POST_NAMES[F.firePost]}じゃ。残る火を焚け`, 3);
    }
  },

  // ② 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 2) return;
    F.step = 2; F.stepT = rt.t; F.pollT = 0.5;
    rt.setPhase('raid');
    for (let i = 0; i < POSTS.length; i++) { rt.uninteract('p' + i); rt.unmark('p' + i); }
    // 柵外から戻る途中でも、開戦の下知で帰り道を消さない。
    guideRaidMouth(rt);
    rt.obj('main', F.raidReturning || F.raidCrossing ? watchTask(F) :
      HI(rt) ? '組を率い、柵で夜討ちを防げ' : '柵で武田の夜討ちを防げ', 'main', true);
    rt.objProgress('main', F.raidReturning || F.raidCrossing ? watchProgress(rt) : '柵の内で槍をそろえよ');
    // 先触れが口へ着く頃に本隊の夜討ちを知らせる。
    rt.say('河尻秀隆', F.raidReturning ? '夜討ちじゃ。口の印から柵の内へ戻れ' :
      F.raidCrossing ? '夜討ちじゃ。柵の内の連絡道を回れ' :
      '夜討ちじゃ。柵の内から槍を出せ。山道へ飛び出すな', 4);
    for (const g of F.oda) { g.order = 'hold'; g.aggro = 6; }
    // 寄せる敵の現在地は明かさず、山道から両口へ実際に歩かせる。
    const send = (i) => {
      if (F.ending || F.step !== 2) return;
      const g = F.waves[i]; g.iwSent = true; g.iwSentAt = rt.t; F.sentWaves.push(g);
      if (!g.count || g.routed) return;
      // 出現位置だけを固定する。行軍中は道幅に合わせて後列の持ち場を詰める。
      g.fixed = false; g.fire = true;
      // 中央は柵の口、東は脇の口まで寄せる。柵の外で止めない。
      g.order = 'path'; g.path = RAID_PATHS[i]; g.pathIdx = 1; g.speed = 2.8; g.march = true;
      g.aggro = 4; g.seekRange = 8; g.noAI = true;
      g.onArrive = (q) => { q.order = 'attack'; q.noAI = true; q.march = false; q.formation = 'loose'; q.seekRange = 45; };
    };
    // 山道の夜討ちを先に受け、城方の合流を二つ目の山場にする。
    // 時機と台詞は復元。既存の十人を歩かせ、兵を増やさない。
    send(0); send(1);
    rt.after(24, () => send(2));
    // 六手の人数と密度は保ち、先の手が戦う間に後続を重ねる。
    // 支度四十四秒・夜討ち約二分・山道の追撃約一分半を目安にする。
    rt.after(40, () => send(3));
    rt.after(65, () => send(4));
    rt.after(90, () => send(5));
  },

  // ③ 城の麓まで追う
  chase(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.footY = rt.world.heightAt(FOOT.x, FOOT.z);
    // 本人と歩く組も河尻の追撃の手。麓へ着いた実兵を、所属だけで到着人数から外さない。
    // 下知の時に一度だけまとめ、半秒ごとの人数調べでは配列を作らない。
    F.joinGroups = F.front.concat(rt.squadGroups);
    // 殿の小隊は山道を守る。共通の追い回しで麓から斜面へ引き出さない。
    for (const g of F.roadGuards) { g.aggro = 8; g.seekRange = 8; }
    // 残った列で麓を押さえる。開戦時の人数を追撃の失敗条件にしない。
    F.chasePath = rt.player.u.pos.x > 40 ? CHASE_EAST_PATH : CHASE_PATH;
    F.restPath = F.chasePath === CHASE_EAST_PATH ? REST_EAST_PATH : REST_PATH;
    F.restGuide = { x: 4, z: 32 };
    F.chaseI = 0;
    F.chaseGuide = { x: F.chasePath[0][0], z: F.chasePath[0][1] };
    // 道で迎え撃つ間は先の折れを示さず、近い敵の印と任務札へそろえる。
    rt.marker('chaseRoad', F.chaseGuide, () => F.chaseArrived || F.roadFight ? '' : F.chaseOffRoad ? '山道へ戻る印' : F.joinOrder ? '麓へ戻る道' : '麓へ続く山道', { guideAlways: true });
    rt.setPhase('chase'); rt.unmark('raidMouth');
    if (!gone(F.scout)) { F.scout.iwReturn = [...SCOUT_PATH.slice().reverse(), [0, -140]]; this.withdrawWave(rt, F.scout); }
    rt.award((t) => t.side.push('夜討ちを受け止めた'), '夜討ちを受け止めた');
    F.siege.pressure++;
    F.siege.morale = Math.max(55, F.siege.morale - 8);
    // 追撃の下知は早い突撃太鼓。退き太鼓と区別し、河尻の手から届かせる。
    signal('kakari', rt.distTo(F.kawa.anchor), 1);
    rt.after(2.4, () => {
      if (F.ending || rt.over || !rt.player.u.alive || F.step !== 3 || gone(F.kawa)) return;
      rt.army.play('toki', F.kawa.anchor, 0.8);
    });
    battleEvent(rt, EVENT_RETREAT, FOOT, null, 1, true, '夜討ちの者が山道へ退く');
    rt.banner('追い討ちの下知', '信忠様が敵を城へ追った。われらは山道から麓へ');
    if (F.playerOpened) rt.award((t) => t.side.push('夜討ちの列を押し返した'), '自分の手で追撃の道を開いた');
    rt.say('河尻秀隆', '追い討ちじゃ。山道の印をたどり、味方と麓へ進め', 4);
    rt.obj('main', '味方と山道を進み、城の麓を押さえよ', 'main', true);
    rt.objProgress('main', '山道の印へ。味方と麓へ進め');
    // 一度麓へ着いた後も、戻る途中は道の印だけを示して崖への直進を防ぐ。
    // 近い敵を示す間は麓の名札を重ねず、迎撃先を一つにする。
    rt.marker('foot', FOOT, () => F.roadMarker ? '' : F.chaseArrived ? 'ここで麓を守れ' :
      !F.joinOrder && !F.chaseOffRoad && F.chaseI === F.chasePath.length - 1 ? '城の麓' : '', { h: 2 });
    rt.zone('foot', FOOT.x, FOOT.z, 8);
    // 金色の到着範囲は矢の軌跡ではない。平らな輪を坂へ沿わせ、空へ浮く弧をなくす。
    const footRing = rt.rings.find((m) => m.userData.id === 'foot');
    rt.drapeRing(footRing, FOOT.x, FOOT.z);
    footRing.material.opacity = 0.16;
    // 崩れた手にも道順を残す。立て直すまでは敗走を続け、戻った時に集合から再開する。
    // ここで除くと、後で到着人数には含まれるのに追撃の下知を持たない隊になる。
    for (const g of F.front) if (g.count > 0) {
      g.fixed = false; // 柵の持ち場を離れた列にも、山道の持ち場補正を使う。
      if (!g.routed) g.order = 'move';
      // 集合中は三列の塊にする。槍衾は初期人数から横幅を決めるため、
      // 死傷者が出ても端の持ち場が集合範囲の外に残ってしまう。
      g.formation = 'dense'; g.width = 3; g.colW = 2;
      g.roadColumn = true;
      // 両手とも中央の平場へ集合するので、そこから正面の口へ進む。
      // 元の持ち場が東でも、集合後に東口まで往復させない。
      const path = CHASE_PATH;
      // まず平場へ集まり、それから縦隊を作る。柵際で縦隊へ替えると、
      // 全員の持ち場が十二メートル以上先へ飛び、後列待ちで要も動けなくなる。
      // 口の内の左右へ三列で詰める。柵を守った手を陣の奥へ戻さず、
      // 口から十二メートル内側で組み直して出る。番小屋と本陣の戸口も空ける。
      const gatherX = g === F.kawa ? -4 : 4;
      g.dest = { x: gatherX, z: 6 }; g.iwGather = true;
      g.path = [[gatherX, 34], [gatherX, 6], [path[0][0], 6], ...path];
      // 味方が敗走から戻ると共通処理が道順と集合先を消す。追撃の下知を残す。
      g.iwChasePath = g.path; g.iwGatherPoint = g.dest;
      g.pathIdx = 1; g.speed = 2.2; g.aggro = 4; g.seekRange = 8;
      // 弓・鉄砲が遠い城兵を狙うと後列が止まり、組全体が麓へ着けない。
      // 行軍中は近い敵にだけ応戦し、麓で射撃を再開する。
      g.fire = false; g.focus = null;
      g.march = false; g.noAI = true;
      // 集合の下知を、近くを進む別の武将への追従で上書きさせない。
      // 目の前の敵への応戦・敗走・手当ては共通の判断を残す。
      g.keepMoveOrder = true;
      // 死傷者の空いた段を詰める。初期人数は士気の計算に残し、兵の位置は動かさない。
      let slot = 0;
      for (const u of g.units) if (chaseReady(u)) u.slot = slot++;
      for (const u of g.units) if (!chaseReady(u)) u.slot = slot++;
      g.iwChaseCheck = { x: g.anchor.x, z: g.anchor.z, t: rt.t };
      g.iwChaseFrom = { x: 0, y: 0, z: 0 };
      g.iwChaseTo = { x: 0, y: 0, z: 0 };
      g.onArrive = null;
      g.iwChaseArrive = (q) => {
        q.keepMoveOrder = false;
        q.order = 'hold'; q.formation = 'yari'; q.yariRanks = 3; q.width = 0;
        q.anchor.x = q === F.kawa ? -6 : 6; q.anchor.z = FOOT.z + 3;
        q.facing = Math.PI; q.fire = true;
        // 二手を平場の左右に分け、城の坂へ広がらず麓の道を守る。
      };
    }
    // 馬廻と鉄砲組は陣に残り、追撃で本陣を空にしない。
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step !== 3 || F.joinHold < 3) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('chaseRoad'); rt.unmark('joinAlly');
    for (let i = 0; i < F.roadDefenders.length; i++) rt.unmark('roadEnemy' + i);
    rt.award((t) => t.side.push(`この持ち場の討死：味方${F.ak}人・敵${F.ek}人`), '持ち場の討死');
    rt.objDone('main');
    F.siege.pressure++;
    rt.award((t) => t.side.push('夜討ちを退け、囲みを守った'), '包囲の陣と麓の道を守った');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水晶山の夜討ちを退け、城の麓まで進んだ', pts: 20 }; }, '水晶山の守りを果たした');
    rt.banner('水晶山の囲みを守った', '岩村城は後日開城。次は大坂・天王寺へ');
    rt.say('河尻秀隆', 'よう守った。囲みは崩れなんだ。ここに留まれ', 3);
    // 十日の夜の任務はここまで。二十一日の捕縛・処刑は戦後の解説に分ける。
    rt.finish({ scriptedEnd: true }, 7);
  },

  lose(rt, reason = '') {
    if (!reason && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; rt.setPhase('end'); rt.tracker.main = false;
    // 局地の失敗は囲みの損として残す。後日の開城をこの夜の成功条件にしない。
    F.siege.held = false;
    F.siege.pressure = Math.max(0, F.siege.pressure - 1);
    rt.objFail('main');
    rt.objProgress('main', '');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('chaseRoad'); rt.unmark('joinAlly'); rt.unmark('kawa'); rt.unmark('raidMouth');
    for (let i = 0; i < POSTS.length; i++) { rt.unmark('p' + i); rt.uninteract('p' + i); }
    for (let i = 0; i < F.roadDefenders.length; i++) rt.unmark('roadEnemy' + i);
    const failureReason = reason || (F.step === 3 ? '麓を守る味方の列が崩れた。陣へ退け' : F.front.every(gone) ? '柵の味方の列が崩れた。本陣へ退け' : '敵に陣の奥を奪われた。本陣へ退け');
    rt.banner('持ち場を守れなかった', failureReason);
    rt.finish({ failureReason }, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    // 置換した備も持ち場の槍の列に留める。追撃の下知を受けた二手へ勝手に加わらせない。
    for (const g of rt.army.groups) if (g.woke?.jinkeiGuard && !g.iwGuard) {
      g.iwGuard = true; g.guardOn = true; g.formation = 'yari'; g.aggro = 4; g.seekRange = 8;
    }
    F.keep.tick();
    this.torchTick(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    this.footEarthTick(rt);
    this.rearTick(rt);
    if (F.step >= 2 && rt.t >= (F.pressureAt || 0)) {
      // 道順の詰まりだけを助ける。下知は任務札に残るので同じ台詞を繰り返さない。
      if (F.pressureStage !== F.step) { F.pressureStage = F.step; F.pressureSince = rt.t; }
      F.pressureSayAt = Infinity;
      pressureTick(rt, F.step, F.sentWaves, F.front, '');
    }
    // 支度から夜討ちまで四十四秒。色づくりは共通の移ろいに任せる。
    if (!F.duskStarted && rt.t >= F.duskAt) {
      F.duskStarted = true;
      const W = rt.world, from = W.currentLook(), fromNight = W.nightAmount();
      W.setTime('night');
      if (W.fade) W.fade.dur = 28;
      else W.fade = { from, to: W.lookOf('night'), fromNight, t: 0, dur: 28, env: 0 };
    }
    // 支度中は先触れも山道に留まる。夜の色になってから実際に歩かせる。
    if (!F.scout.iwSent && F.duskStarted && rt.world.nightAmount() >= 0.5) {
      F.scout.iwSent = true; F.scout.order = 'path'; F.scout.march = true;
      F.scout.aggro = 4; F.scout.seekRange = 32;
      for (const g of F.oda) g.fire = true;
      F.fgun.fire = true;
    }
    // 夜討ちの始まりは時刻で知らせる。麓の確保は本人と組の到着を待つ。
    if (F.step === 0 && rt.t - F.stepT >= 5) this.prepare(rt);
    if (F.step >= 2) this.hurtNotice(rt);
    if (F.step < 3 && rt.t >= (F.contactAt || 0)) {
      F.contactAt = rt.t + 0.5;
      const lord = F.keep.lord;
      // 城将は城に留める。近くまで来た時だけ、その場の声を聞かせる。
      if (!F.castleVoice && lord.alive && Math.hypot(lord.pos.x - rt.player.u.pos.x, lord.pos.z - rt.player.u.pos.z) < 24 && sightUnit(rt, lord)) {
        F.castleVoice = true;
        rt.say('秋山虎繁', '城を捨てるな。退いた者を収め、木戸を守れ', 4);
      }
      let distance = Infinity, nearWave = null, waveDistance = Infinity, reachableDistance = Infinity;
      let frontDistance = Infinity, eastDistance = Infinity;
      // 任務の近傍判定も読む。退く隊を追わず、同じ高さで向き合える敵を受ける。
      const closeEnemy = rt.missionGuide?.closeEnemy;
      F.localContact = !!(closeEnemy?.alive && !closeEnemy.fleeing && !closeEnemy.woundOut &&
        !closeEnemy.group?.iwWithdraw && !closeEnemy.group?.retreatOnly &&
        Math.hypot(closeEnemy.pos.x - rt.player.u.pos.x, closeEnemy.pos.z - rt.player.u.pos.z) < 4.5 &&
        Math.abs(closeEnemy.pos.y - rt.player.u.pos.y) < 2 &&
        !rt.army.wallBetween(closeEnemy.pos, -1, rt.player.u.pos) &&
        !rt.army.terrainBlocks(closeEnemy.pos, rt.player.u.pos) && sightUnit(rt, closeEnemy));
      for (const g of F.contacts) {
        if (gone(g) || g.iwWithdraw || !g.iwSent) continue;
        // 夜討ちの下知を受けた列は、守りの命令へ戻っても口への行軍を続ける。
        if (F.step === 2 && g.iwSent && (g.order === 'hold' || g.order === 'yari')) {
          g.order = g.onArrive ? 'path' : 'attack';
          g.march = !!g.onArrive;
        }
        // 曲がり角に先頭と隊の要が着けば次へ進む。後列待ちで夜討ちを止めない。
        if (g.order === 'path' && g.path?.length && g.onArrive) {
          const q = g.path[Math.min(g.pathIdx, g.path.length - 1)];
          const front = g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 5);
          if (front && Math.hypot(g.anchor.x - q[0], g.anchor.z - q[1]) < 1.5) {
            if (g.pathIdx < g.path.length - 1) g.pathIdx++;
            else { const deploy = g.onArrive; g.onArrive = null; deploy(g); }
          }
        }
        let canReach = false;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) {
          const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
          distance = Math.min(distance, d);
          if (g.iwMouthPaths && d < waveDistance) { waveDistance = d; nearWave = g; }
          const clear = d < 45 && !rt.army.wallBetween(u.pos, -1, rt.player.u.pos) &&
            !rt.army.terrainBlocks(u.pos, rt.player.u.pos);
          const sameLevel = Math.abs(u.pos.y - rt.player.u.pos.y) < 2;
          // 弓や切岸の下の兵だけで、寄せ直しの待ち時間を戻さない。
          if (clear && sameLevel && (u.sidearm || u.type !== 'bow' && u.type !== 'gun'))
            reachableDistance = Math.min(reachableDistance, d);
          // 暗がりや崖の向こうの敵では、守る口を変えない。見えた敵と近い敵だけを案内に使う。
          if (clear && (d <= 5 || sightUnit(rt, u))) {
            if (u.pos.x > 40) eastDistance = Math.min(eastDistance, d);
            else frontDistance = Math.min(frontDistance, d);
            // 少し先の敵で道標を消さず、槍を合わせる近さで迎撃へ替える。
            if (d <= 6 && sameLevel) F.localContact = true;
          }
          if (clear) canReach = true;
        }
        if (g.order === 'attack') g.focus = canReach ? rt.player.u : null;
      }
      // 柵越し・切岸の下の兵や弓だけを、斬り合える敵として数えない。
      // 近くに見えても届かない間は、既存の連絡道を通る寄せ直しを止めない。
      if (reachableDistance <= 25 || F.step !== 2) F.quietSince = rt.t;
      // 四秒静かなら本人側の口へ回す。連絡道の移動も含め、三十秒以内に近づける余裕を取る。
      // 半秒ごとの既存の調べを使い、兵の追加や瞬間移動はしない。
      if (F.step === 2 && reachableDistance > 25 &&
          (rt.t - F.quietSince >= 4 || rt.t >= 150) && rt.t >= (F.mouthHelpAt || 0)) {
        const g = nearWave;
        if (g?.iwMouthPaths && !g.iwWithdraw && !gone(g)) {
          const side = rt.player.u.pos.x > 40 ? 1 : 0;
          const route = g.iwMouthPaths[side];
          const i = F.waves.indexOf(g);
          const next = g.order === 'path' && (g.path === RAID_PATHS[i] || g.path === route) ? g.pathIdx : RAID_PATHS[i].length - 1;
          g.path = route; g.pathIdx = next; g.order = 'path'; g.fixed = false;
          g.formation = 'column'; g.march = true; g.speed = 2.8; g.focus = null;
          g.onArrive = (q) => { q.order = 'attack'; q.march = false; q.formation = 'loose'; q.seekRange = 45; };
          F.mouthHelpAt = rt.t + 12;
        }
      }
      // 現在地の透視ではなく、見張りが知らせる迎撃の口を指す。
      // 両口の敵が同じくらい近い間は、今の口を守る。半秒ごとに行き先を反転させない。
      // 別の口が八メートル以上近い時か、今の口の敵が退いた時に切り替える。
      // 敵がどちらにも見えない間は、今いる側の口を守る。古い報せで往復させない。
      if (frontDistance === Infinity && eastDistance === Infinity) F.raidMouthX = rt.player.u.pos.x > 40 ? 66 : 0;
      else if (F.raidMouthX === undefined) F.raidMouthX = eastDistance < frontDistance ? 66 : 0;
      else if (F.raidMouthX && frontDistance + 8 < eastDistance) F.raidMouthX = 0;
      else if (!F.raidMouthX && eastDistance + 8 < frontDistance) F.raidMouthX = 66;
      F.raidVisible = frontDistance < Infinity || eastDistance < Infinity;
      guideRaidMouth(rt);
      if (!F.raidReturning) F.returnInsideSaid = false;
      else if (F.step >= 1 &&
          !F.returnInsideSaid && rt.t >= (F.returnInsideAt || 0)) {
        F.returnInsideSaid = true; F.returnInsideAt = rt.t + 8;
        rt.say('組頭', '敵を防ぎ、口の印から柵の内へ戻れ', 3);
      }
      const squad = rt.squadGroups?.find((g) => g.count > 0);
      F.actionHint = distance > 25 ? '柵の内を通り、口へ進め' :
        !squad ? '口で敵を受けよ' : '組の槍をそろえ、口の敵を押し返せ';
    }
    if (F.step < 2 && rt.t >= (F.prepareAt || 0)) {
      F.prepareAt = rt.t + 1;
      const contact = F.scout.units.some((u) => {
        if (!u.alive || u.fleeing || u.woundOut || u.downed || u.dropped || u.noTarget ||
            u.group?.iwWithdraw || u.group?.retreatOnly ||
            Math.abs(u.pos.y - rt.player.u.pos.y) >= 2) return false;
        const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
        // 背後の打ち手や、画面端で槍を合わせる敵も本人には分かる。
        return d < 12 && (sightUnit(rt, u) || d < 5 || u.target === rt.player.u) &&
          !rt.army.wallBetween(u.pos, -1, rt.player.u.pos) &&
          !rt.army.terrainBlocks(u.pos, rt.player.u.pos);
      });
      if (contact) F.scoutSeenAt = rt.t;
      // 一度迎撃を命じたら、点火は味方に任せたままにする。
      // 敵が四秒見えないだけで篝火へ呼び戻し、口を空けさせない。
      // 点火を任せた記録と、今も敵が迫っているかを分ける。
      // 敵が離れた後は迎撃の札を外すが、篝火へは呼び戻さない。
      F.scoutContact = contact || F.localContact || rt.t - (F.scoutSeenAt ?? -99) < 4;
      const scoutNear = F.scoutWarned || F.scoutContact;
      F.scoutNear = scoutNear;
      // 外で敵に絡まれても、迎撃の札で戻り道を消さない。
      rt.obj('main', F.raidReturning ? watchTask(F) :
        F.scoutContact ? '目の前の敵を、味方と押し返せ' : scoutNear || F.lit >= POSTS.length ?
        watchTask(F) :
        fireTask(rt), 'main', true);
      if (scoutNear && !F.scoutWarned) {
        F.scoutWarned = true;
        // 点火を味方へ任せたら、長押しの札も外して迎撃の下知とそろえる。
        for (let i = 0; i < POSTS.length; i++) rt.uninteract('p' + i);
        if (!F.raidReturning) rt.say('組頭', '敵が来た。味方と受けよ。火は任せよ', 3);
      }
      // 火を味方へ任せた後は、点火の完了を待たず口への道順と見張る理由を示す。
      // 東の脇口から戻る時も、札を連絡道の印とそろえる。
      rt.objProgress('main', F.raidReturning ? watchProgress(rt) :
        F.scoutContact ? F.lit < POSTS.length ?
        '柵の内で敵を押し返せ。火は味方に任せよ' : '火はそろった。柵の内で敵を押し返せ' :
        scoutNear || F.lit >= POSTS.length ? watchProgress(rt) : fireProgress(F));
    }
    if (F.step === 1 && F.lit < POSTS.length && !F.raidReturning && !F.localContact && !F.scoutContact && rt.t - F.stepT > 22 && !F.litCall) {
      F.litCall = true; rt.say('組頭', F.scoutNear ? '火は味方も焚く。おぬしは口を守れ' : '残る篝火へ向かえ。火がそろえば口を守れ', 4);
    }
    if (F.step === 1 && rt.t >= F.raidAt && !rt.world.fade) {
      for (let i = 0; i < POSTS.length; i++) this.light(rt, i, true, false);
      this.raid(rt);
    }
    if (F.step < 2 || (F.pollT -= dt) > 0) return;
    const span = 0.5 - F.pollT; F.pollT = 0.5;
    let inside = 0, deep = 0, guards = 0;
    let breachEnemy = null, breachDistance = Infinity, keepBreachEnemy = false;
    for (const g of F.waves) for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut) continue;
      if (u.pos.z > -30) F.raidContact = true;
      if (Math.abs(u.pos.x) < 26 && u.pos.z > 26 && u.pos.z < 58) {
        inside++;
        // 救援先は固定の平場でなく、実際に陣へ入った敵。押し返すまでは同じ敵を示す。
        if (u === F.breachEnemy) keepBreachEnemy = true;
        const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
        if (d < breachDistance) { breachDistance = d; breachEnemy = u; }
      }
      if (Math.abs(u.pos.x) < 12 && u.pos.z > 42 && u.pos.z < 58) deep++;
    }
    for (const g of [F.honjin.guard, F.gate, F.fgun]) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.abs(u.pos.x) < 14 && u.pos.z > 40 && u.pos.z < 60) guards++;
    const breached = inside > 0 && (inside >= 4 || deep > guards);
    if (!keepBreachEnemy) F.breachEnemy = breachEnemy;
    if (F.step === 2) {
      const breachStarted = breached && !F.breached;
      F.breached = breached;
      // 救援の声を出す前に、柵の口と連絡道を通る帰路を決める。
      guideRaidMouth(rt);
      if (breachStarted) {
        rt.say('組頭', F.raidReturning ? '陣の奥に敵じゃ。口の印から柵の内へ戻れ' :
          F.raidCrossing ? '陣の奥に敵じゃ。連絡道の印を回れ' :
          '陣の奥に敵じゃ。印の敵を味方と押し返せ', 3);
        rt.hud.notices.push('！ 陣の奥を奪われる。味方と敵を押し返せ', 115, 8, 'warn',
          () => !rt.over && !F.ending && F.step === 2 && F.breached);
      }
      rt.obj('main', F.raidReturning ? '口の印を通り、柵の内へ戻れ' :
        breached ? F.raidCrossing ? '連絡道を回り、陣の奥を守れ' : '陣の奥の敵を押し返せ' :
        F.localContact ? '目の前の敵を、味方と押し返せ' :
        F.raidCrossing ? watchTask(F) :
        `${F.raidMouthX ? '東の脇口' : '正面の口'}で夜討ちを防げ`, 'main', true);
    }
    F.breach = breached ? F.breach + span : Math.max(0, F.breach - span);
    // 追撃後は下の合流人数で判定する。柵の二手が崩れても、麓の本人の組は守りを続けられる。
    if (F.step === 2 && (F.breach >= 8 || F.front.every(gone))) {
      this.lose(rt);
      if (F.ending || rt.over) return;
    }
    if (F.step === 2) {
      for (let i = 0; i < F.waves.length; i++) {
        const g = F.waves[i];
        // 先頭が口へ着いたら構える。後列全員の到着待ちで斬り合いを止めない。
        if (g.iwSent && !g.iwWithdraw && !gone(g) && g.order === 'path' && g.onArrive && g.pathIdx >= g.path.length - 1) {
          const mouth = g.path[g.path.length - 1];
          if (g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - mouth[0], u.pos.z - mouth[1]) < 8)) {
            const deploy = g.onArrive; g.onArrive = null; deploy(g);
          }
        }
        const seen = g.units.find((u) => u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u));
        // 城方を見た時だけ合流の危機を知らせる。遠い城将の声を陣まで飛ばさない。
        if (i === 2 && seen && g.iwSent && !F.castleSortieSaid) {
          F.castleSortieSaid = true; F.directionAt = rt.t + 8;
          // 陣の奥への救援中は、柵へ戻す下知を重ねない。
          if (!F.breached) {
            rt.banner('城方も出てきた', '夜討ちの者と合流させるな');
            if (!F.raidReturning) rt.say('毛利河内', '城方も来た。持ち場を離れず押し返せ', 4);
          }
        }
        const mouth = seen ? seen.pos.x > 40 ? '東の脇口' : '正面の口' : null;
        // 目の前の迎撃と陣の奥の救援を優先し、札と違う口へ呼び出さない。
        const guardingMouth = F.raidMouthX ? '東の脇口' : '正面の口';
        // 一度守った口へ戻る時も知らせる。同じ口では繰り返さず、下知は八秒あける。
        if (mouth === guardingMouth && !F.localContact && !F.breached && !F.raidReturning &&
            g.iwSent && !g.iwWithdraw && !gone(g) && F.directedMouth !== mouth && rt.t >= (F.directionAt || 0)) {
          F.directedMouth = mouth; F.directionAt = rt.t + 8;
          rt.say('見張り', F.raidCrossing ?
            `${mouth}に敵じゃ。柵の内の連絡道を回れ` :
            `${mouth}に敵じゃ。柵の内で受けよ`, 3);
        }
      }
      if (!F.raidAlarm) {
        for (const g of F.waves) for (const u of g.units) if (!F.raidAlarm && u.alive && !u.fleeing && u.pos.z > -40 && sightUnit(rt, u)) {
          F.raidAlarm = true;
          // 敵を見つけた口の篝火から警報を鳴らす。姿のない山道では鳴らさない。
          rt.army.play('horagai', POSTS[u.pos.x > 20 ? 1 : 0], 0.8);
          if (!F.breached) {
            rt.banner('夜討ち', '篝火の向こうに武田の者がいる');
            // 開戦直後と城方の報せの直後は、同じ迎撃の下知を重ねない。
            if (!F.raidReturning && rt.t - F.stepT >= 8 && rt.t >= (F.directionAt || 0)) {
              F.directionAt = rt.t + 8;
              rt.say('組頭', '夜討ちの合図じゃ。柵の内で敵を受けよ', 3);
            }
          }
        }
      }
      if (!F.raidAlarm && !F.raidNews && !F.breached && rt.t - F.stepT >= 8) {
        F.raidNews = true;
        rt.banner('夜討ちの報せ', '味方が山道の寄せを迎え撃っている');
        if (!F.raidReturning) rt.say('使番', '山道で味方が夜討ちを受けておる。こちらの口も固めよ', 4);
      }
      // 後続が歩き出した後も、口へ着くまでは見張りを続ける理由を残す。
      // 見えない敵の位置や時刻は明かさず、今の持ち場での行動だけを伝える。
      const awaitingRaid = F.waves.some((g) => !gone(g) && !g.iwWithdraw);
      const approachingRaid = F.waves.some((g) => g.iwSent && !gone(g) && !g.iwWithdraw);
      // 見えている寄せを「次」と呼ばず、迎撃・接近待ち・後続待ちを分ける。
      const cue = F.raidVisible ? '迫る敵を味方と受けよ' :
        approachingRaid ? '山道からの敵に備えよ' : awaitingRaid ? '次の敵に備えよ' :
        F.withdrawSignal ? '敵の退き太鼓。下知まで追うな' : '下知まで口を守れ';
      // 危機の残り時間だけでなく、救援先と取る行動も同じ任務札へ収める。
      rt.objProgress('main', breached ?
        `${F.raidReturning ? '口の印を通り、柵の内へ急げ' : F.raidCrossing ? '連絡道の印へ急げ' :
          '陣の奥の印の敵を、味方と押し返せ'}。あと${Math.max(0, Math.ceil(8 - F.breach))}秒で持ち場を失う` :
        F.raidReturning ? '敵を防ぎ、口の印から柵の内へ戻れ' :
        F.localContact ? '柵の内で受けよ。味方の列を離れるな' :
        F.atRaidMouth ? `${cue}。柵の内で槍をそろえよ` :
        F.raidCrossing ? '連絡道の印へ。柵の内を回れ' : '口の印へ。柵の内の道を通れ');
      // 損害で退く。時間を過ぎただけの無傷の寄せは退かせない。
      if (F.raidContact && inside === 0 && !F.front.every(gone)) {
        for (const g of F.waves) if (g.iwSent && !g.iwWithdraw && !gone(g)) {
          let fighting = 0, breached = false;
          for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { fighting++; if (Math.abs(u.pos.x) < 26 && u.pos.z > 26 && u.pos.z < 58) breached = true; }
          const leaderLost = g.leader && (!g.leader.alive || g.leader.woundOut);
          // 自分か配下が二人を倒した列は、損害条件を満たせば早く退く。
          // 無傷の敵の自動退却にはせず、本人の押し返しを追撃につなぐ。
          const hold = (g.iwOwnKills || 0) >= 2 ? 20 : 30;
          if (breached || fighting > g.iwInitial * siegeRetreatRatio(F.siege, leaderLost) || rt.t - (g.iwSentAt || F.stepT) < hold) continue;
          if ((g.iwOwnKills || 0) >= 2) F.playerOpened = true;
          this.withdrawWave(rt, g);
        }
      }
      // 最後の一手が退いた回は追撃の下知だけを出し、逆向きの守備命令を積まない。
      const allWithdrawn = F.waves.every((g) => g.iwSent && (gone(g) || g.iwWithdraw));
      if (allWithdrawn && inside === 0 && !F.front.every(gone)) this.chase(rt);
      else if (!allWithdrawn && !F.breached && !F.raidReturning && !F.brokenSaid && F.waves.some((g) =>
        (gone(g) || g.iwWithdraw) && g.units.some((u) => u.alive && sightUnit(rt, u)))) {
        F.brokenSaid = true;
        const nextRaid = F.waves.every((g) => !g.iwSent || gone(g) || g.iwWithdraw);
        rt.say('見張り', nextRaid ? '一手が退いた。次に備え、口を守れ' :
          '一手が退いた。下知まで口を守れ', 3);
      }

    } else if (F.step === 3) {
      const p = rt.player.u.pos;
      // 道標は次の折れを指す。味方の先頭と隊の要が着けば後列待ちを解く。
      while (F.chaseI < F.chasePath.length - 1 &&
          Math.hypot(p.x - F.chasePath[F.chaseI][0], p.z - F.chasePath[F.chaseI][1]) < 6) F.chaseI++;
      // 戦いで折れを通り過ぎても、通過した道標へ引き返させない。
      // 道から離れた時は先の折れへ飛ばさず、今の道標を保つ。
      for (let i = Math.max(1, F.chaseI); i < F.chasePath.length; i++) {
        const a = F.chasePath[i - 1], b = F.chasePath[i];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < 6)
          F.chaseI = Math.max(F.chaseI, Math.min(F.chasePath.length - 1, i + (t > 0.85 ? 1 : 0)));
      }
      if (Math.hypot(p.x - FOOT.x, p.z - FOOT.z) < 8) F.chaseI = F.chasePath.length - 1;
      F.chaseGuide.x = F.chasePath[F.chaseI][0]; F.chaseGuide.z = F.chasePath[F.chaseI][1];
      // 初めの追撃でも道を外れたら、まず近い道へ戻す。崖越しに折れを目指させない。
      // 一度着いた後は、麓へ戻る道順も同じ入れ物で示す。
      // 到着範囲は道幅より広い。麓の輪の中では、道外扱いで敵の印を隠さない。
      const arrived = atFoot(F, p);
      const offRoad = !arrived && distToPolyline(p.x, p.z, F.chasePath) > 6;
      F.chaseOffRoad = offRoad;
      if (!arrived && (F.joinOrder || offRoad))
        returnToRoad(F.chasePath, p, F.chaseGuide);
      for (const g of F.front) if (!gone(g) && (g.iwGather || g.onArrive)) {
        // 集合から山道への切り替えを残し、後続が柵に止まるのを防ぐ。
        if (g.routed || g.signalUntil > rt.army.time) continue;
        if (g.iwGather) {
          // 道順や集合先が残っても、立て直し後の待機命令だけでは列が歩き出せない。
          if (!g.dest || g.order !== 'move') { g.dest = g.iwGatherPoint; g.order = 'move'; }
          advanceChaseFront(rt, g, span);
          gatherChaseFront(rt, g);
          // 集まった回は二度進めず、次の調べから山道を歩く。
          continue;
        }
        // 道の途中で立て直した列も、残した折れ点から再開する。
        if (!g.iwGather && g.iwChasePath && (!g.path || g.order !== 'path')) {
          g.path = g.iwChasePath; g.order = 'path'; g.formation = 'column';
        }
        if (g.order !== 'path' || !g.path?.length || !g.onArrive) continue;
        packChaseFront(g);
        advanceChaseFront(rt, g, span);
        const q = g.path[Math.min(g.pathIdx, g.path.length - 1)];
        if (Math.hypot(g.anchor.x - q[0], g.anchor.z - q[1]) < 1.5 &&
            g.units.some((u) => chaseReady(u) && Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 5)) {
          if (g.pathIdx < g.path.length - 1) g.pathIdx++;
          else { const deploy = g.onArrive; g.onArrive = null; deploy(g); }
        }
      }
      let roadHeld = false, roadDistance = Infinity;
      F.roadMarker = null;
      F.roadFight = false;
      for (let i = 0; i < F.roadDefenders.length; i++) {
        const g = F.roadDefenders[i];
        let nearest = Infinity;
        g.iwRoadGuide = null;
        // 初めて麓へ着いた回から、麓へ迫る敵だけを迎撃の下知に数える。
        // 到着の下知を出した後に範囲を変え、遠い敵を近いと知らせない。
        for (const u of g.units) if (!g.iwWithdraw && roadEnemy(u, F.joinOrder || arrived, F.footY)) {
          roadHeld = true;
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          // 遠い折れや崖の向こうの敵へ誘わず、まず山道の印をたどらせる。
          // 任務に数える敵は減らさず、近くで槍を合わせられる敵だけに印を出す。
          if (offRoad || d > 12 || !sightUnit(rt, u) ||
              rt.army.wallBetween(p, -1, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
          if (d < nearest) { nearest = d; g.iwRoadGuide = u; }
          if (d < roadDistance) { roadDistance = d; F.roadMarker = 'roadEnemy' + i; }
        }
      }
      // 敵の印は全隊のうち最寄りの一つだけ。兵や斬り合いはそのままに道を見やすくする。
      for (let i = 0; i < F.roadDefenders.length; i++) {
        const g = F.roadDefenders[i];
        const marked = F.roadMarker === 'roadEnemy' + i;
        if (marked && !g.iwRoadMarked) {
          g.iwRoadMarked = true;
          rt.marker('roadEnemy' + i, () => g.iwRoadGuide?.pos || FOOT,
            () => F.joinOrder || F.chaseArrived ? '麓に迫る敵' : '山道をふさぐ敵', { red: true, group: g });
        } else if (!marked && g.iwRoadMarked) {
          g.iwRoadMarked = false;
          rt.unmark('roadEnemy' + i);
        }
      }
      let joined = 0, available = 0, recovering = 0, nextAllyDistance = Infinity, nextAlly = null;
      let joinFighting = false;
      for (const g of F.joinGroups) if (!gone(g)) for (const u of g.units) {
        // 後送中の深手の兵には、麓で並び直す役目を負わせない。
        if (u.alive && !u.isPlayer && !u.noTarget && !u.fleeing && !u.woundOut && !u.rearWound) {
          // 倒れた兵は起きる余地がある。後送された兵の到着は待たない。
          if (u.downed) { recovering++; continue; }
          available++;
          const d = Math.hypot(u.pos.x - FOOT.x, u.pos.z - FOOT.z);
          // 崖の上にいる兵は、麓の合流人数に含めない。
          if (d < 16 && Math.abs(u.pos.y - F.footY) < 3) joined++;
          else {
            const distance = Math.hypot(d, u.pos.y - F.footY);
            if (distance < nextAllyDistance) { nextAllyDistance = distance; nextAlly = u; }
            const enemy = u.target;
            if (enemy?.team === 1 && chaseReady(enemy) && !enemy.group?.iwWithdraw &&
                Math.hypot(u.pos.x - enemy.pos.x, u.pos.z - enemy.pos.z) < 4 &&
                !rt.army.wallBetween(u.pos, -1, enemy.pos) && !rt.army.terrainBlocks(u.pos, enemy.pos)) joinFighting = true;
          }
        }
      }
      if (available === 0 && recovering === 0) {
        this.lose(rt, '麓を守る味方が残っていない。追い討ちを止め、陣へ退け');
        return;
      }
      F.chaseArrived = arrived;
      // 到着時の迎撃の声も、麓の敵が離れたら人数待ちの札へそろえる。
      F.roadHeld = roadHeld;
      // 敵の印が出る十二メートル以内は、任務も迎撃へそろえる。
      // 八〜十二メートルで先の道標と敵の印を同時に出さない。
      F.roadFight = !!F.roadMarker && !offRoad;
      if (!F.roadFight) F.roadFightSaid = false;
      // 道外れと、到着後の離脱は声でも知らせる。札と同じ戻り先を伝え、
      // 同じ場所にいる間は繰り返さない。到着の下知とも八秒あける。
      const returnReason = offRoad ? 1 : !arrived && F.joinOrder && !F.roadFight ? 2 : 0;
      if (!returnReason) F.returnCallReason = 0;
      else if (F.returnCallReason !== returnReason &&
          rt.t >= Math.max(F.stepT, F.joinCallAt ?? -99, F.returnCallAt ?? -99, F.roadCallAt ?? -99) + 8) {
        F.returnCallReason = returnReason; F.returnCallAt = rt.t;
        rt.say('組頭', offRoad ? '道を外れたぞ。印へ戻れ。崖を横切るな' :
          '麓を離れるな。道の印をたどって戻れ', 3);
      }
      // 山道の敵へ着いたら、進軍の声を迎撃へ替える。到着時は麓の下知を優先する。
      if (F.roadFight && !arrived && !F.roadFightSaid &&
          rt.t >= Math.max(F.stepT, F.joinCallAt ?? -99, F.returnCallAt ?? -99, F.roadCallAt ?? -99) + 8) {
        F.roadFightSaid = true; F.roadCallAt = rt.t;
        rt.say('組頭', '道に敵じゃ。押し返し、味方と麓へ進め', 3);
      }
      const need = Math.min(6, Math.max(1, Math.ceil(available * 0.3)));
      // 台詞を出す前に待機理由を更新し、遅れて届く声も同じ判定を使う。
      F.joinRecovering = arrived && !roadHeld && available === 0 && recovering > 0;
      F.joinFighting = arrived && !roadHeld && joined < need && joinFighting;
      F.joinWaiting = arrived && !roadHeld && available > 0 && joined < need && !joinFighting;
      const joinWaitState = !available ? 'recovering' : joinFighting ? 'fighting' : 'following';
      if (arrived && !F.joinOrder) {
        F.joinOrder = true;
        F.joinCallAt = rt.t;
        // 到着時に伝えた待つ理由を覚え、同じ下知を八秒後に重ねない。
        F.joinWaitState = !roadHeld && joined < need ? joinWaitState : '';
        rt.say('組頭', roadHeld ? F.roadMarker ? '麓の敵を味方と押し返せ。坂へは追うな' : '道の敵に備えよ。ここで味方と麓を守れ' :
          !available ? '味方が倒れておる。ここを守り、起きるのを待て' :
          joined < need ? joinFighting ? '味方は道で戦っている。ここで麓を守れ' :
          'ここで味方を待て。迎えに戻るな' : 'ここで味方と麓を守れ。坂へは追うな', 3);
      }
      // 味方の遅れは任務札で知らせる。待つ間の行き先は麓に保ち、後続へ引き返させない。
      // 「敵を退け」も共通の退却合図に拾われるため、押し返す下知にそろえる。
      // 敵が迫る間は迎撃を先に伝える。倒れた味方の人数は同じ札の下段へ残す。
      const footTask = roadHeld ? F.roadMarker ? '麓の道の敵を押し返せ' : '敵に備え、麓を守れ' :
        !available ? '味方が起きるまで麓を守れ' :
        joined < need ? joinFighting ? '麓を守れ。味方は山道で戦っている' : '麓を守り、味方の到着を待て' :
        '味方と麓の道を守れ';
      rt.obj('main', !arrived ? offRoad ? '印をたどり、山道へ戻れ' : F.roadFight ? '道の敵を押し返し、麓へ進め' : F.joinOrder ? '麓へ戻り、味方と留まれ' : '味方と山道を進み、城の麓を押さえよ' : footTask, 'main', true);
      // 到着の下知に待機と損耗の声を重ねない。待つ理由は任務札ですぐに示す。
      // 後続の戦いが終わった時や倒れた味方が起きた時も、変わった理由だけを知らせる。
      if (arrived && !roadHeld && joined < need && F.joinWaitState !== joinWaitState && rt.t >= (F.joinCallAt ?? -99) + 8) {
        F.joinWaitState = joinWaitState;
        F.joinCallAt = rt.t;
        rt.say('組頭', !available ? '味方が倒れておる。ここを守り、起きるのを待て' :
          joinFighting ? '味方は道で戦っている。ここで麓を守れ' : '味方が続く。麓を守れ。迎えに戻るな', 3);
      }
      if (available > 0 && available < 6 && !F.joinWarn && rt.t >= (F.joinCallAt ?? -99) + 8) {
        F.joinWarn = true; F.joinCallAt = rt.t;
        rt.say('組頭', '手勢が減ったぞ。互いに離れるな', 4);
      }
      F.joinHold = arrived && available > 0 && joined >= need && !roadHeld ? (F.joinHold || 0) + span : 0;
      // 残る人数と後続の様子を同じ札に収め、待つ理由を短く伝える。
      const joining = `合流まであと${Math.max(0, need - joined)}人。`;
      const following = joinFighting ? '味方は道で戦っている。' : !nextAlly ? '' : nextAlly.group?.iwGather ? '味方は陣で集合中。' :
        nextAlly.pos.z > FENCE_Z ? '味方は柵の内。' : '味方は山道を進んでいる。';
      // 手当ての案内にも同じ合流状況を渡す。人数待ちと敵の迎撃を取り違えさせない。
      const recoveringStatus = `倒れた味方 ${recovering}人。起きるまで麓を守れ`;
      F.joinStatus = !available ? `倒れた味方 ${recovering}人。` : joined >= need ? '味方は合流済み。' : joining;
      const waiting = !available ? recoveringStatus :
        `${joining}${following}迎えに戻るな`;
      // 敵の印がない間は、見えない相手を探して麓から離れさせない。
      // 合流済みなら人数待ちをやめ、敵を押し返す役目が残ると知らせる。
      const holding = F.roadMarker ? '麓で押し返せ。坂へ追うな' : '敵に備え、麓を離れるな';
      // 麓までは敵を押し返して前進する。城の坂へ追わない下知は麓を守る時だけ。
      const progress = !arrived ? offRoad ? '道の印へ戻れ。崖を横切るな' : F.roadFight ? '味方と押し返し、道の印から麓へ' : F.joinOrder ? '道の印をたどり、麓へ戻れ' : '山道の印をたどれ。味方と麓へ' : roadHeld ?
        (!available ? `倒れた味方 ${recovering}人。${holding}` : joined < need ?
          `${joining}${following}${holding}` : `味方はそろった。${holding}`) :
        joined < need ? waiting : `麓で列を保つ あと${Math.max(0, Math.ceil(3 - F.joinHold))}秒`;
      rt.objProgress('main', progress);
      if (F.joinHold >= 3) this.win(rt);
    }
  },


  // 共通の台詞の入口を、この戦の実体だけで整える。他の戦の入口は変えない。
  notices(rt) {
    const F = rt.flags;
    F.noticeBark = rt.bark.bind(rt);
    const say = rt.say.bind(rt);
    // 字を出さず声だけを流す場合も、同じ台詞は八秒あける。
    const speechTimes = new Map();
    const holdCall = (text) => {
      // 敵の一手が退いても、救援中の持ち場や麓を守る下知は変えない。
      // 台詞と短い知らせの両方を、今の任務と同じ行き先にそろえる。
      const order = F.ending ? '味方と持ち場を守れ' : F.step < 3 ?
        F.raidReturning ? '口の印から柵の内へ戻れ' :
        F.breached ? F.raidCrossing ? '連絡道の印を回り、陣の奥を守れ' : '陣の奥の敵を、味方と押し返せ' :
        '敵の一手が退いた。柵の口を守れ' :
        atFoot(F, rt.player.u.pos) ? '味方と麓を守れ。城の坂へ追うな' :
        F.chaseOffRoad ? '道の印へ戻れ。崖を横切るな' :
        F.joinOrder ? '道の印をたどり、麓へ戻れ' :
        '山道の印をたどり、味方と麓へ進め';
      return text.replace(
        /敵は総崩れじゃ！|敵が背を見せた！\s*追え！|敵が崩れた！\s*今ぞ、押せ！|敵が槍を捨てた！/g,
        order);
    };
    const hurt = /深手だ！|深手じゃ！|危ない！|構え.*下がれ|あと一太刀|布を巻く間は動けない|お命が！/;
    rt.bark = (text, warn) => {
      if (rt.player.u.alive && hurt.test(text)) { this.hurtNotice(rt); return; }
      if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢玉じゃ|矢が当たった|矢が降る/.test(text)) { this.arrowNotice(rt); return; }
      if (text === '後ろだ！') return; // 接近の知らせと足音を先に出す。
      F.noticeBark(holdCall(text), warn);
    };
    rt.say = (sp, text, dur) => {
      if (rt.player.u.alive && hurt.test(text)) { this.hurtNotice(rt); return; }
      if (text.startsWith('後ろから来た！')) return;
      text = text.replace('の手に命が届いた。その隊は持ち場を守っている', 'へ下知が届いた。持ち場を守る');
      text = holdCall(text);
      for (const [line, at] of speechTimes) if (rt.t - at >= 8) speechTimes.delete(line);
      if (speechTimes.has(text)) return;
      speechTimes.set(text, rt.t);
      say(sp, text, dur);
    };
    rt.army.hooks.onArrowAtPlayer = () => this.arrowNotice(rt);
    // 矢は共通の実寸補正を使う。体の根へ移すと、屈んだ胴から刺さり口が離れる。
    // 矢の警報も任務と同じ三枠へ入れる。中央に別の札を重ねない。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
      F.rainUntil = Math.max(F.rainUntil || 0, rt.t + volley.T + 0.4);
      const step = F.step;
      rt.hud.notices.push(step < 3 ? '▲ 矢が降る。小屋や柵の陰へ退け' : '▲ 矢が降る。山道の脇の岩陰へ', 110, Math.max(3, volley.T + 0.4), 'warn',
        () => !rt.over && !rt.ended && rt.player.u.alive && (step < 3) === (F.step < 3));
    };
    // 気づく前に間合いへ入った者にも、知らせから三秒の猶予を守る。
    const damage = rt.army.damage.bind(rt.army);
    rt.army.damage = (target, amount, src, opts = {}) => {
      if (target === rt.player.u && src?.team === 1 && src.pos &&
          opts.kind !== 'arrow' && opts.kind !== 'gun' && opts.kind !== 'fire' && !src.isStruct && this.isRear(rt, src)) {
        this.rearNotice(rt, src);
        if (rt.t < src.iwRearReady) { if (opts.out) opts.out.res = 'miss'; return; }
      }
      return damage(target, amount, src, opts);
    };
  },
  arrowNotice(rt) {
    const F = rt.flags;
    // 長い戦でも警報を打ち切らず、同じ知らせは二十秒あける。
    if (F.ending || rt.over || !rt.player.u.alive || rt.t < 10 ||
        rt.t < (F.rainUntil || 0) || rt.t < (F.arrowAt || 0)) return;
    F.arrowAt = rt.t + 20;
    // 麓への追撃中は、遠い陣の柵や小屋へ引き返させない。
    F.noticeBark(F.step < 3 ? '矢が来る。柵や小屋の陰へ' : '矢が来る。山道の脇の岩陰へ', true);
  },
  hurtNotice(rt) {
    const F = rt.flags;
    const p = rt.player;
    if (!p.u.alive || F.ending || rt.over) return;
    if (p.u.hp > p.u.maxHp * 0.5) { F.hurtHint = 0; return; }
    // 一度きりの案内にせず、布切れ・手当て待ち・手当て可能の変化だけを知らせる。
    // 回復後に再び傷を負っても案内できる。同じ状態では積まず、変化も八秒あける。
    const state = p.treatmentLeft <= 0 ? 1 : p.treatmentNext > rt.t ? 2 :
      p.treating ? 5 : p.treatmentReady ? 4 : 3;
    if (F.hurtHint === state || rt.t < (F.hurtNoticeAt || 0)) return;
    F.hurtHint = state; F.hurtNoticeAt = rt.t + 8;
    F.noticeBark(state === 1 ? '布は使い切った。味方の後ろへ退け' :
      treatmentOrder(rt), true);
  },
  isRear(rt, u) {
    const p = rt.player.u, dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    return d > 0.1 && (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / d < -0.25;
  },
  rearNotice(rt, u) {
    if (u.iwRearReady != null) return;
    const F = rt.flags;
    u.iwRearReady = rt.t + 3;
    if (rt.t >= (F.rearNoticeAt || 0)) {
      F.rearNoticeAt = rt.t + 8;
      F.noticeBark('後ろから来る。振り向いて構えよ', true);
    }
    rt.army.play('step', u.pos, 1.2);
    u.iwFootAt = rt.t + 0.7;
  },
  footEarthTick(rt) {
    const F = rt.flags;
    if (rt.t < (F.footEarthAt || 0)) return;
    F.footEarthAt = rt.t + 0.12;
    const army = rt.army, p = rt.player.u.pos;
    let grains = 0;
    for (const u of army.units) {
      const x = u.pos.x, z = u.pos.z;
      const distance = u.iwEarthX == null ? 0 : Math.hypot(x - u.iwEarthX, z - u.iwEarthZ);
      u.iwEarthX = x; u.iwEarthZ = z;
      if (!u.alive || u.dying || u.mounted || u.isPlayer || u.downed || u.climb || u.naka || u.perch ||
          u.woundOut || u.dragging || Math.abs(x - p.x) > 24 || Math.abs(z - p.z) > 24 || distance > 1.8) {
        u.iwEarthTravel = 0; continue;
      }
      // 押されて半歩ずれる時も、敗走も、実際に足を運んだ分だけ。立った列には出さない。
      u.iwEarthTravel = (u.iwEarthTravel || 0) + distance;
      if (u.iwEarthTravel < 0.65 + (u.id % 7) * 0.045) continue;
      u.iwEarthTravel = 0;
      u.iwEarthSide = -(u.iwEarthSide || (u.id % 2 ? 1 : -1));
      if (grains >= 8 || army.world.inWaterAt(x, z)) continue;
      const gy = army.world.heightAt(x, z);
      if (Math.abs(gy - u.pos.y) > 0.25) continue;
      const side = u.iwEarthSide * 0.16;
      army.burst(x + Math.cos(u.heading) * side, gy + 0.04, z - Math.sin(u.heading) * side,
        1, 'dust', -Math.sin(u.heading) * 0.3, -Math.cos(u.heading) * 0.3, gy);
      grains++;
    }
  },
  rearTick(rt) {
    const p = rt.player.u;
    for (const g of rt.flags.rearGroups) for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || g.iwWithdraw || u.type === 'bow' || u.type === 'gun') continue;
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      if (d > 16 || !this.isRear(rt, u)) { if (d > 20) u.iwRearReady = null; continue; }
      if (rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos)) continue;
      this.rearNotice(rt, u);
      const wait = u.iwRearReady - rt.t;
      if (wait > 0) {
        // 歩みは止めず、主人公への振り出しだけを待つ。味方との戦いは続ける。
        if (u.atk?.target === p) u.atk = null;
        if (u.swing?.target === p) u.swing = null;
        if (u.target === p) u.cd = Math.max(u.cd || 0, wait + 0.1);
        if (rt.t >= u.iwFootAt) { rt.army.play('step', u.pos, 0.9); u.iwFootAt = rt.t + 0.7; }
      }
    }
  },
  raidTorches(rt) {
    const F = rt.flags, W = rt.world;
    F.torches = [];
    for (const g of F.waves) {
      let n = 0;
      for (const u of g.units) if (u.type === 'ashigaru' && n++ < 2) {
        const fire = W.addFire(u.pos.x, u.pos.z, { torch: true, h: 2 });
        // 動く松明に固定した煙柱を残さない。光は既存の灯の枠を使う。
        W.removeSmokeColumn(fire.smoke); fire.smoke = null;
        F.torches.push({ u, fire });
      }
    }
    F.torchSticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.055, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0x725137 }), F.torches.length);
    F.torchSticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    F.torchSticks.frustumCulled = false;
    F.torchPose = new THREE.Object3D();
    rt.scene.add(F.torchSticks);
    this.torchTick(rt);
  },
  torchTick(rt) {
    const F = rt.flags, pose = F.torchPose;
    if (!pose) return;
    for (let i = 0; i < F.torches.length; i++) {
      const { u, fire } = F.torches[i];
      const live = u.alive && !u.woundOut;
      fire.lit = live; fire.flame.visible = fire.inner.visible = fire.glow.visible = live;
      const x = u.pos.x + Math.cos(u.heading) * 0.4, z = u.pos.z - Math.sin(u.heading) * 0.4;
      fire.x = x; fire.z = z; fire.base = u.pos.y + 2.2; fire.ly = 2.45;
      fire.flame.position.set(x, fire.base, z); fire.inner.position.set(x, fire.base - 0.06, z);
      fire.glow.position.set(x, u.pos.y + 0.06, z);
      if (!live && fire.light) fire.light.intensity = 0;
      pose.position.set(x, u.pos.y + 1.4, z); pose.scale.setScalar(live ? 1 : 0); pose.updateMatrix();
      F.torchSticks.setMatrixAt(i, pose.matrix);
    }
    F.torchSticks.instanceMatrix.needsUpdate = true;
  },
  // この軍勢だけの短めの槍と接地。共通の装備や床・梯子の動きはそのまま使う。
  slopeScene(rt) {
    const A = rt.army, W = rt.world, add = A.addUnit, animate = A.animate;
    A.addUnit = function (g, o) {
      const u = add.call(this, g, o.type === 'ashigaru' ? { ...o, spear: 'su' } : o);
      if (u) u.iwaSlopeFeet = true;
      return u;
    };
    A.animate = function (u, dt, near) {
      animate.call(this, u, dt, near);
      if (!u.alive || u.dying || u.climb || u.downed || u.mounted || u.isStruct || u.camD > 45) return;
      const x = u.pos.x, z = u.pos.z, y = groundAt(W, x, z, u.pos.y);
      // 櫓の床にも同じ高さの読みを使う。高い床から地面へ引き下ろさない。
      const sn = Math.sin(u.heading), cs = Math.cos(u.heading), e = 0.22;
      const forward = (groundAt(W, x + sn * e, z + cs * e, y) - groundAt(W, x - sn * e, z - cs * e, y)) / (2 * e);
      const side = (groundAt(W, x + cs * e, z - sn * e, y) - groundAt(W, x - cs * e, z + sn * e, y)) / (2 * e);
      // 床の縁の段差は傾きにしない。止まった兵にも前後・左右の傾きを合わせる。
      if (Math.abs(forward) > 0.9 || Math.abs(side) > 0.9) return;
      u.mesh.position.y = y;
      u.mesh.rotation.order = 'YXZ';
      // 体全体を坂へ倒すと、走りの膝まで浮く。足は骨の接地補正で合わせる。
      u.mesh.rotation.x = -Math.atan(forward) * 0.15;
      u.mesh.rotation.z = Math.atan(side) * 0.15;
    };
  },
  // この戦の倒れ方だけを補う。形・材質・計算用の入れ物は使い回す。
  fallenScene(rt) {
    const A = rt.army, W = rt.world, animate = A.animDeath;
    const dropWeapon = A.dropWeapon;
    A.dropWeapon = function (u) {
      dropWeapon.call(this, u);
      // 深手で落とした時から、地面に寝た幟の布を隠す。亡骸になるまで黒い板を残さない。
      if (u.dropped?.userData.standard && u.standardFlag && u.dropped.parent === this.scene)
        u.standardFlag.visible = false;
    };
    const fallenKit = A.fallenKit;
    A.fallenKit = function (u) {
      // この戦では落ちた旗を消す。共通処理で別の四角い布を地面へ複製しない。
      const flag = u.flag, standard = u.standardFlag;
      u.flag = null;
      try { return fallenKit.call(this, u); }
      finally {
        u.flag = flag;
        if (flag) flag.visible = false;
        // 共通の落とし物処理は手持ちの幟を再表示する。背の指物と同じ扱いに戻す。
        if (standard) standard.visible = false;
      }
    };
    const axis = new THREE.Vector3(), normal = new THREE.Vector3(), tangent = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), slope = new THREE.Quaternion();
    const dropHat = A.dropHat, hatPoint = new THREE.Vector3();
    A.dropHat = function (u) {
      if (u.hatOff) return;
      dropHat.call(this, u);
      const hat = u.hatOff;
      if (!hat?.isMesh || u.death?.floor) return;
      // 笠の縁を坂と平行にする。一番高い土へ水平に載せて宙へ浮かせない。
      hat.updateMatrix(); hatPoint.set(0, 1.66, 0).applyMatrix4(hat.matrix);
      const x = hatPoint.x, z = hatPoint.z, e = 0.4;
      normal.set(W.heightAt(x - e, z) - W.heightAt(x + e, z), 2 * e,
        W.heightAt(x, z - e) - W.heightAt(x, z + e)).normalize();
      slope.setFromUnitVectors(up, normal); hat.quaternion.premultiply(slope);
      hat.updateMatrix();
      hatPoint.set(0, 1.66, 0).applyMatrix4(hat.matrix);
      hat.position.x += x - hatPoint.x; hat.position.z += z - hatPoint.z;
      hat.updateMatrix();
      const points = hat.geometry.attributes.position;
      let lift = -Infinity;
      for (let i = 0; i < points.count; i++) {
        hatPoint.fromBufferAttribute(points, i).applyMatrix4(hat.matrix);
        lift = Math.max(lift, W.heightAt(hatPoint.x, hatPoint.z) + 0.015 - hatPoint.y);
      }
      if (Number.isFinite(lift)) hat.position.y += lift;
    };
    const identity = new THREE.Quaternion();
    A.animDeath = function (u, dt, near) {
      u.iwaGrounded = true;
      animate.call(this, u, dt, near);
      const D = u.death, m = u.mesh;
      // 倒れ始めから布を隠す。描かない旗の竿・材質・毎コマの姿勢計算も作らない。
      if (u.flag) u.flag.visible = false;
      if (u.standardFlag) u.standardFlag.visible = false;
      if (u.gone || D.aid || D.t < 0.9) return;
      const settle = THREE.MathUtils.smoothstep(D.t, 0.9, 1.3);
      axis.copy(up).applyQuaternion(m.quaternion);
      // 胸だけを上下させると、坂の折れで足と頭が浮く。体格も含め、体の向きを胸の下の坂へ合わせる。
      const chest = 0.85 * m.scale.y;
      if (!D.floor) {
        const x = m.position.x + axis.x * chest, z = m.position.z + axis.z * chest, e = 0.6;
        normal.set(W.heightAt(x - e, z) - W.heightAt(x + e, z), 2 * e,
          W.heightAt(x, z - e) - W.heightAt(x, z + e)).normalize();
        tangent.copy(axis).addScaledVector(normal, -axis.dot(normal)).normalize();
        if (tangent.lengthSq() > 0.5) {
          slope.setFromUnitVectors(axis, tangent);
          slope.slerp(identity, 1 - settle);
          m.quaternion.premultiply(slope);
          axis.copy(up).applyQuaternion(m.quaternion);
        }
        // 腰・胸・肩のうち土へ沈む所で支える。床の上と救助中の倒れ方は変えない。
        let support = -Infinity;
        for (let i = 0; i < 3; i++) {
          const d = (0.35 + i * 0.5) * m.scale.y;
          support = Math.max(support, W.heightAt(m.position.x + axis.x * d, m.position.z + axis.z * d) + 0.16 - axis.y * d);
        }
        m.position.y += (support - m.position.y) * settle;
      }
      if (u.armR) { aimArm(u.armR, 0.36, 0.95, 0.22); aimArm(u.armL, -0.34, 0.9, 0.18); }
      if (!u.flag) return;
      if (!u.iwaPoleRemoved && u.body && u.look) {
        u.iwaPoleRemoved = true;
        const look = { ...u.look, pole: false }, key = u.body.userData.lookKey + '|iwaFallen';
        lodSwap(u.body, bodyGeometry(key, look, true, 'nohead'), bodyGeometry(key, look, false, 'nohead'));
      }
    };
  },
  mountainScene(rt, lifeStart) {
    const W = rt.world;
    // 深い靄の向こうの星を控える。大きな白点が雪のように空を埋めない。
    if (W.stars) { W.stars.geometry.setDrawRange(0, 240); W.stars.material.size = 1; W.stars.material.opacity = 0.35; }
    // 土や草の明るさは保ち、常緑の葉だけ灰緑の照り返しを抑える。
    // 遠近で共有する材質は一度だけ直し、毎コマの仕事や描画を増やさない。
    const leafMats = new Set();
    for (const m of [...(W.treeMeshes || []), ...(W.farTreeMeshes || [])]) {
      const mat = m.material;
      if (!mat?.map || mat.side !== THREE.DoubleSide || leafMats.has(mat)) continue;
      leafMats.add(mat);
      mat.color.multiply(new THREE.Color(0.64, 0.72, 0.52));
      mat.envMapIntensity = 0.08;
      const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
      mat.customProgramCacheKey = () => key + '|iwaEvergreen';
      mat.onBeforeCompile = (sh, renderer) => {
        compile.call(mat, sh, renderer);
        sh.fragmentShader = sh.fragmentShader.replace('lback * 0.35', 'lback * 0.1');
      };
      mat.needsUpdate = true;
    }
    // 木・低木・草の絵の抜きを保つ。縮小した絵が根元で白い板になるのを防ぐ。
    rt.scene.traverse((m) => {
      if (m.isInstancedMesh && m.material?.map && m.material.side === THREE.DoubleSide) softenIwamuraBoard(m.material, true);
      // 葉房の芯にも同じ近距離の抜きを使う。葉だけ消えて黒い多面体が視点へ残るのを防ぐ。
      if (m.isInstancedMesh && m.userData.treeFoliage) softenIwamuraBoard(m.material);
      // 共通の小石も岩村では苔・土汚れの頂点色を使う。
      if (m.isInstancedMesh && m.geometry?.attributes.color && m.material?.bumpMap && !m.material.map) {
        m.material.vertexColors = true; m.material.color.setHex(0xffffff);
        detailIwamuraRock(m.material, W); m.material.needsUpdate = true;
      }
    });
    // 通れる地面の格子は変えず、端の頂点から外へ四段の山肌をつなぐ。
    // 通れる格子は差し替えず、山裾だけ同じ材質の別の面にする。
    // 地面の索引と視点ごとの面の控えを保ち、遠い平場の間引きも残す。
    const groundGeo = W.terrain.geometry, seg = groundGeo.parameters.widthSegments;
    const edge = [];
    for (let i = 0; i < seg; i++) edge.push(i);
    for (let i = 0; i < seg; i++) edge.push(i * (seg + 1) + seg);
    for (let i = 0; i < seg; i++) edge.push(seg * (seg + 1) + seg - i);
    for (let i = 0; i < seg; i++) edge.push((seg - i) * (seg + 1));
    const skirtGeo = new THREE.BufferGeometry(), count = edge.length;
    for (const [name, attr] of Object.entries(groundGeo.attributes)) {
      const values = new Float32Array(count * 5 * attr.itemSize);
      for (let ring = 0; ring <= 4; ring++) for (let i = 0; i < count; i++) {
        const offset = (ring * count + i) * attr.itemSize, source = edge[i] * attr.itemSize;
        for (let k = 0; k < attr.itemSize; k++) values[offset + k] = attr.array[source + k];
        if (name === 'position' && ring > 0) {
          const x = values[offset] * (1 + ring * 60 / W.half);
          const z = values[offset + 2] * (1 + ring * 60 / W.half);
          const ridge = 32 * gauss(x, z, -530, -180, 24000)
            + 38 * gauss(x, z, 540, -260, 28000) + 30 * gauss(x, z, 60, 550, 26000);
          values[offset] = x; values[offset + 2] = z;
          // 城の持ち上げを最初の一段で落とさず、外の山肌まで四段でつなぐ。
          const t = ring / 4, blend = t * t * (3 - 2 * t);
          const outerY = baseTerrain(x, z) + ridge * Math.min(1, ring / 2);
          values[offset + 1] += (outerY - values[offset + 1]) * blend;
        }
      }
      skirtGeo.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
    }
    const skirtIndices = [];
    for (let ring = 0; ring < 4; ring++) for (let i = 0; i < count; i++) {
      const a = ring * count + i, b = ring * count + (i + 1) % count;
      skirtIndices.push(a, b, a + count, b, b + count, a + count);
    }
    skirtGeo.setIndex(skirtIndices); skirtGeo.computeVertexNormals();
    // 境目の高さと法線は元の地面から引き継ぎ、割れや照らされ方の筋を残さない。
    const normals = skirtGeo.attributes.normal, groundNormals = groundGeo.attributes.normal;
    for (let i = 0; i < count; i++) normals.setXYZ(i,
      groundNormals.getX(edge[i]), groundNormals.getY(edge[i]), groundNormals.getZ(edge[i]));
    const skirt = new THREE.Mesh(skirtGeo, W.terrain.material);
    skirt.receiveShadow = true; skirt.userData.noFreeze = true;
    rt.scene.add(skirt);
    groundGeo.addEventListener('dispose', () => {
      skirt.removeFromParent(); skirtGeo.dispose();
    });
    // 八角形の草の面は重ねない。下の地面の草・土・石の絵をそのまま見せる。
    // 細かな割れと灰褐色の土汚れを持つ岩を、道の外に半分埋める。
    const rockGeo = rockShape(1, true);
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x171410 });
    detailIwamuraRock(rockMat, W);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 24);
    const pose = new THREE.Object3D();
    for (let i = 0; i < rocks.count; i++) {
      // 道の節ごとに同じ大岩を積まず、節の間へ大小を散らす。道の幅は空ける。
      const at = (i * 0.61803398875 % 1) * (CHASE_PATH.length - 1);
      const j = Math.floor(at), t = at - j, a = CHASE_PATH[j], b = CHASE_PATH[j + 1];
      const x = a[0] + (b[0] - a[0]) * t + (i % 2 ? -1 : 1) * (7 + Math.sin(i * 4.1) * 2);
      const z = a[1] + (b[1] - a[1]) * t;
      const size = 0.3 + Math.pow((i * 0.754877666 % 1), 2) * 0.7;
      // 上半分を残し、夜の地面に薄い黒い穴のような面を並べない。
      pose.position.set(x, W.heightAt(x, z) - size * 0.12, z);
      pose.rotation.set(Math.sin(i) * 0.15, i * 1.3, Math.cos(i) * 0.12);
      // 横に広い同じ岩を並べず、高さと奥行きを残した大小の露岩にする。
      pose.scale.set(size * (1.05 + i % 3 * 0.12), size * (1.1 + i % 2 * 0.18), size * (0.9 + i % 4 * 0.08)); pose.updateMatrix();
      rocks.setMatrixAt(i, pose.matrix);
    }
    groundRocks(W, rocks);
    rocks.receiveShadow = true; rt.scene.add(rocks);
    // 戦う足元には小石の厚みを残す。同じ岩の形と材質を共有し、描画は一束。
    const gravel = new THREE.InstancedMesh(rockGeo, rockMat, 144);
    for (let i = 0; i < 144; i++) {
      const x = -28 + ((i * 0.61803398875) % 1) * 64;
      const z = -18 + ((i * 0.754877666) % 1) * 55;
      const size = 0.045 + (i % 7) * 0.012;
      pose.position.set(x, W.heightAt(x, z) - size * 0.25, z);
      pose.rotation.set(Math.sin(i) * 0.3, i * 2.4, Math.cos(i) * 0.2);
      pose.scale.set(size * 1.4, size * 0.7, size); pose.updateMatrix();
      gravel.setMatrixAt(i, pose.matrix);
    }
    groundRocks(W, gravel); gravel.receiveShadow = true; rt.scene.add(gravel);
    // 麓の見張りの篝火。霧は共通の空気の処理に任せ、杉の根元の白い板を置かない。
    for (const [x, z] of [[-14, -94], [18, -119]]) W.addFire(x, z, { torch: true, h: 1.2, nightOnly: true });
    // 岩村だけの道の絵を初めに一度作る。粗い地形の頂点の間にも九十九折りを残す。
    // 地面そのものに混ぜるので、斜面に浮く板や境目を作らず、描画や灯りも増やさない。
    // 西南の在所・小堂・避難先も絵の範囲へ入れ、高画質の道の細かさを保つ。
    const roadCanvas = document.createElement('canvas'); roadCanvas.width = roadCanvas.height = 1536;
    const roadCtx = roadCanvas.getContext('2d'), scale = roadCanvas.width / 360;
    roadCtx.fillStyle = '#000'; roadCtx.fillRect(0, 0, roadCanvas.width, roadCanvas.height);
    roadCtx.strokeStyle = '#f00'; roadCtx.lineWidth = 3.5 * scale;
    roadCtx.lineJoin = roadCtx.lineCap = 'round';
    for (const path of fieldPaths()) {
      roadCtx.lineWidth = (PEOPLE_FOOTPATHS.has(path) ? 1.4 : 3.5) * scale;
      roadCtx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const x = (path[i][0] + 240) * scale, z = (path[i][1] + 140) * scale;
        if (i === 0) roadCtx.moveTo(x, z); else roadCtx.lineTo(x, z);
      }
      roadCtx.stroke();
    }
    // 赤は道幅、緑は足跡。山道へ車の轍のような平行線を並べない。
    roadCtx.globalCompositeOperation = 'lighter';
    roadCtx.fillStyle = '#005000';
    // 村・小堂の避難路も赤の道幅と同じ座標へ重ね、不揃いな歩幅の足跡だけを残す。
    for (const path of fieldPaths()) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const nx = -dz / len, nz = dx / len;
      for (let s = 0, step = 0; s < len; step++) {
        const t = s / len, x = a[0] + dx * t, z = a[1] + dz * t;
        const drift = Math.sin(step * 2.4 + i * 1.7) * 0.38;
        for (const side of [-1, 1]) {
          roadCtx.beginPath();
          roadCtx.ellipse((x + nx * (side * 0.22 + drift) + dx / len * side * 0.3 + 240) * scale,
            (z + nz * (side * 0.22 + drift) + dz / len * side * 0.3 + 140) * scale,
            0.11 * scale, 0.24 * scale, -Math.atan2(dx, dz), 0, Math.PI * 2);
          roadCtx.fill();
        }
        s += 1.5 + (0.5 + 0.5 * Math.sin(step * 1.9 + i)) * 0.9;
      }
    }
    // 青には折れ草と小屋の軒下の堆積を焼く。足場を変えず、一枚の絵で場所の違いを出す。
    roadCtx.strokeStyle = '#0000b0'; roadCtx.lineWidth = 0.055 * scale;
    for (let i = 0; i < 1600; i++) {
      const x = -32 + ((i * 0.61803398875) % 1) * 76;
      const z = -22 + ((i * 0.754877666) % 1) * 70;
      const edge = Math.max(Math.abs(x - 22) / 3.8, Math.abs(z - 28) / 2.8);
      if (fieldRoadDistance(x, z) < 1.2 || (edge < 1 && edge > 0.15)) continue;
      const a = i * 2.4, length = 0.14 + (i % 5) * 0.035;
      roadCtx.beginPath(); roadCtx.moveTo((x + 240) * scale, (z + 140) * scale);
      roadCtx.lineTo((x + Math.sin(a) * length + 240) * scale, (z + Math.cos(a) * length + 140) * scale);
      roadCtx.stroke();
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas); roadTex.flipY = false;
    const terrainMat = W.terrain.material, compileGround = terrainMat.onBeforeCompile;
    // 坂の土は穴を開けて透かさない。柵や木の手前を透かす処理とは分ける。
    terrainMat.userData.camNearSolid = true;
    // 夜の切岸が空を白く映さないよう、岩村の地面だけ艶を抑える。
    terrainMat.envMapIntensity = 0.12; terrainMat.roughness = 1;
    const groundKey = terrainMat.customProgramCacheKey();
    terrainMat.customProgramCacheKey = () => groundKey + '|iwamura';
    terrainMat.onBeforeCompile = (sh, renderer) => {
      compileGround.call(terrainMat, sh, renderer);
      // 岩村の切岸だけ絵の縮尺を細かくする。読み出す枚数は変えず、縦長の傷も縮める。
      sh.fragmentShader = sh.fragmentShader
        // 夜だけ落ち影の暗さを半分ほどにする。昼と夕方の影はそのまま。
        .replace('#include <shadowmap_pars_fragment>', THREE.ShaderChunk.shadowmap_pars_fragment
          // 九点の読み出しは増やさず、縁を広げてぼかす。
          .replaceAll('vec2 texelSize = vec2( 1.0 ) / shadowMapSize;', 'vec2 texelSize = vec2( 2.5 ) / shadowMapSize;')
          .replaceAll('return shadow;', 'return mix(shadow, 1.0, uNight * 0.55);'))
        .replaceAll('uX * 0.12', 'uX * 0.32').replaceAll('uZ * 0.12', 'uZ * 0.32')
        .replaceAll('uX * 0.21', 'uX * 0.48').replaceAll('uZ * 0.21', 'uZ * 0.48')
        // 規則的な泥の窪みの縁を控える。歩いた跡と土の濃淡は残す。
        .replace('float clodK = (w.y * 0.55 + w.z)', 'float clodK = 0.22 * (w.y * 0.55 + w.z)')
        // 高画質の角張った土塊も薄める。升目状の割れ目を地面一面へ並べない。
        .replace('float crustK = w.y', 'float crustK = 0.18 * w.y')
        .replace('vec2(sx * 0.11, vWP.y * 0.006)', 'vec2(sx * 0.22, vWP.y * 0.045)')
        .replace('vec3 cliff = mix(earth, stT, rockK);', 'vec3 cliff = mix(earth, stT * vec3(0.72, 0.62, 0.48), rockK);');
      // 共通の濡れの処理が粗さを下げるので、その後でも夜の土の艶を抑える。
      sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, uNight);');
      sh.uniforms.iwaRoad = { value: roadTex };
      sh.fragmentShader = 'uniform sampler2D iwaRoad;\n' + sh.fragmentShader;
      // 土の細かな起伏は法線だけに付け、歩ける坂・足場・難しさは保つ。
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 iwaReliefUV = (vWP.xz + vec2(240.0, 140.0)) / 360.0;
        float iwaReliefMask = step(0.0, iwaReliefUV.x) * step(iwaReliefUV.x, 1.0)
          * step(0.0, iwaReliefUV.y) * step(iwaReliefUV.y, 1.0);
        float iwaRelief = -texture2D(iwaRoad, iwaReliefUV).g * 0.018 * iwaReliefMask;
        // 既存の土の絵から浅い起伏を読む。周期的な正弦波を掛けて升目を作らない。
        float iwaClose = 1.0 - smoothstep(8.0, 26.0, length(vWP - cameraPosition));
        iwaRelief += (dot(dirt, vec3(0.333)) - 0.2)
          * 0.012 * iwaClose * iwaReliefMask;
        vec3 iwaDx = dFdx(-vViewPosition), iwaDy = dFdy(-vViewPosition);
        vec3 iwaS = cross(iwaDy, normal), iwaT = cross(normal, iwaDx);
        float iwaDet = dot(iwaDx, iwaS);
        normal = normalize(abs(iwaDet) * normal - sign(iwaDet)
          * (dFdx(iwaRelief) * iwaS + dFdy(iwaRelief) * iwaT));`);
      // 在所まで広げた道の範囲は保ち、城の草・砂利を確定する前に土色を重ねる。
      sh.fragmentShader = sh.fragmentShader.replace('// 城の地面を確定', `
        vec2 iwaUV = (vWP.xz + vec2(240.0, 140.0)) / 360.0;
        float iwaRoadEdge = smoothstep(0.0, 0.026667, iwaUV.x) * (1.0 - smoothstep(0.973333, 1.0, iwaUV.x))
          * smoothstep(0.0, 0.026667, iwaUV.y) * (1.0 - smoothstep(0.973333, 1.0, iwaUV.y));
        // 道の絵は真上から貼るので、急な切岸では縦に引き伸ばされ、大きな弧に見える。坂では消す。
        vec3 iwaTrack = texture2D(iwaRoad, iwaUV).rgb * iwaRoadEdge * (1.0 - smoothstep(0.35, 0.8, slopeK));
        float iwaWay = iwaTrack.r;
        // 陣の土色・夜の明るさの範囲は保ち、在所には道だけを足す。
        vec2 iwaFieldUV = (vWP.xz + vec2(120.0, 140.0)) / 240.0;
        float iwaField = smoothstep(0.0, 0.04, iwaFieldUV.x) * (1.0 - smoothstep(0.96, 1.0, iwaFieldUV.x))
          * smoothstep(0.0, 0.04, iwaFieldUV.y) * (1.0 - smoothstep(0.96, 1.0, iwaFieldUV.y));
        // 土と落葉の斑は共通の絵を使い、道端の草へなだらかにつなぐ。
        float iwaSoil = smoothstep(0.38, 0.72, macro2) * iwaField * (1.0 - iwaWay);
        col = mix(col, dirt * vec3(1.12, 1.04, 0.88), iwaSoil * 0.32);
        col = mix(col, dirt * vec3(1.3, 1.24, 1.1), iwaWay * 0.72);
        col = mix(col, dirt * vec3(0.63, 0.58, 0.48), iwaTrack.g * 0.7);
        col = mix(col, vec3(0.16, 0.12, 0.065), iwaTrack.b * 0.65);
        // 足跡の浅い窪みと共通の土粒を残し、道一面へ周期的な畝を足さない。
        // 雪ではなく土の斜面。粒の濃淡を残した暗い褐色を夜の坂に混ぜる。
        // 共通側が付けた土の溝・露岩・苔の斑を、そのまま褐色へ寄せる。
        // 別の二色へ置き換えると、溝も消えて大きな一枚の壁に戻ってしまう。
        vec3 iwaSlope = col * vec3(0.72, 0.66, 0.55);
        // 陣の切岸は土色を保つ。奥の山まで九割塗ると杉林も岩肌も消え、空を断つ一枚の壁になる。
        col = mix(col, iwaSlope, uNight * slopeK * mix(0.22, 0.92, iwaField));
        // 陣の外の城山の急な山肌（夕日を受けて白く浮く）は、苔と落葉の暗い褐色へ半分ほど寄せる。段の石垣の線を山肌の上で読ませる（10/28）。
        col = mix(col, col * vec3(0.5, 0.44, 0.34), smoothstep(0.3, 0.7, slopeK) * (1.0 - iwaField) * 0.65);
        // 緩い坂と道も褐色を残す。切岸だけを直すと麓の土が雪のように白くなる。
        col *= mix(vec3(1.0), vec3(0.68, 0.51, 0.34), uNight * iwaField);
        // 柵の根元は踏んだ土から草へぼかす。板や草の描画を増やさない。
        float iwaFenceX = abs(vWP.x);
        float iwaFence = (1.0 - smoothstep(0.4, 2.2, abs(vWP.z - (-6.0 + max(0.0, iwaFenceX - 8.0) * 4.0 / 52.0))))
          * smoothstep(6.0, 9.0, iwaFenceX) * (1.0 - smoothstep(59.0, 62.0, iwaFenceX));
        col = mix(col, mix(dirt * vec3(0.72, 0.60, 0.42), grass * vec3(0.65, 0.82, 0.48), macro2), iwaFence * 0.55);
        // 城の地面を確定
        // 月の照り返しを土の粒と道の筋に残す。夜だけ効き、白い一枚の帯にしない。
        totalEmissiveRadiance += uNight * col * (iwaField * 0.04 + iwaWay * 0.04);`);
      // 山肌だけを空色へ重ね塗りすると、同じ高さの木戸や兵だけが濃く残り、
      // 空中に浮いて見える。山・木戸・兵には共通の距離の霧だけを通す。
    };
    terrainMat.needsUpdate = true;
    // 戦を離れる時、岩村専用の絵・岩・地面の材質を解放する。
    W.terrain.geometry.addEventListener('dispose', () => {
      roadTex.dispose(); rockGeo.dispose(); rocks.material.dispose(); terrainMat.dispose();
    });

    // 当時の短い石留めだけを月明かりに残す。総石垣や天守は足さない。
    const center = new THREE.Vector3();
    for (let i = lifeStart; i < rt.scene.children.length; i++) rt.scene.children[i].traverse((m) => {
      if (!m.isMesh || !m.geometry || Array.isArray(m.material)) return;
      m.geometry.computeBoundingBox(); m.geometry.boundingBox.getCenter(center);
      m.updateWorldMatrix(true, false); center.applyMatrix4(m.matrixWorld);
      if (Math.abs(center.x) < 12 && center.z < -156 && center.z > -164) {
        m.material = m.material.clone(); m.material.fog = true;
        if (m.material.emissive) m.material.emissive.setHex(0x171b24);
      }
    });
    const lampGeo = new THREE.BoxGeometry(0.75, 0.45, 0.08);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffbb62, fog: true });
    for (const tower of rt.flags.castleC.towers) {
      tower.mesh.traverse((m) => {
        if (!m.isMesh || Array.isArray(m.material)) return;
        // 山肌だけ霞んで櫓が宙に浮いて見えないよう、同じ距離の霧を通す。
        m.material = m.material.clone(); m.material.fog = true;
        if (m.material.color) m.material.color.multiplyScalar(0.65);
      });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(tower.x, tower.topY + 0.8, tower.z + 1.1); rt.scene.add(lamp);
      W.addFire(tower.x + 1, tower.z, { torch: true, h: tower.topY - W.heightAt(tower.x, tower.z) + 0.5 });
    }
  },

  withdrawWave(rt, g) {
    const F = rt.flags;
    // 損害を受けた夜討ち勢が実際に退く時だけ、一度知らせる。先触れには鳴らさない。
    if (F.step === 2 && !F.withdrawSignal && F.waves.includes(g) &&
        g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) {
      F.withdrawSignal = true;
      signal('nobiki', rt.distTo(g.anchor), 0.8);
      // 最後の一手も退いた時は、直後の追撃の下知と逆の声を重ねない。
      rt.after(0.2, () => {
        if (!F.ending && !rt.over && F.step === 2)
          rt.say('見張り', '敵の退き太鼓じゃ。下知まで柵を守れ', 3);
      });
    }
    g.iwWithdraw = true; g.order = 'path'; g.formation = 'column'; g.path = g.iwReturn;
    // 寄せた道を戻る。東の端の兵を柵の中へ斜めに引き戻さない。
    let nearest = Infinity;
    for (let i = 0; i < g.path.length; i++) {
      const d = Math.hypot(g.anchor.x - g.path[i][0], g.anchor.z - g.path[i][1]);
      if (d < nearest) { nearest = d; g.pathIdx = i; }
    }
    g.speed = 2.2; g.aggro = 0; g.seekRange = 1.8; g.retreatOnly = true; g.noAI = true;
    g.focus = null;
    for (const u of g.units) { u.target = null; u.watch = null; }
    g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.noAI = false; q.aggro = 6; };
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (F.step === 2 && v.team === 1 && F.waves.includes(v.group) && (k === rt.player.u || k?.isSub)) {
      v.group.iwOwnKills = (v.group.iwOwnKills || 0) + 1;
      if (gone(v.group) && v.group.iwOwnKills >= 2) F.playerOpened = true;
    }
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    const F = rt.flags;
    if (F.step === 2 && F.waves.includes(g) && (g.iwOwnKills || 0) >= 2) F.playerOpened = true;
    const name = String(g.name).replace(/（[^）]*）/g, '');
    if (F.routSaid.has(name)) return;
    if (rt.t - (F.routSaidT ?? -99) < 8 || g.iwRoutSaid) return;
    if (!g.units.some((u) => u.alive && sightUnit(rt, u))) return;
    g.iwRoutSaid = true; F.routSaidT = rt.t; F.routSaid.add(name);
    rt.say('足軽', `${name}が退いてくがや！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!(F.fenceSegs || []).includes(s) || F.fenceWarned) return;
    F.fenceWarned = true; rt.bark('陣の柵が破られた！', true);
  },
};

// 三万対三千は復元の参考人数。上の札は水晶山・麓の備えで、城内と遠景は加えない。
// 先触れ・鉄砲組・馬廻・麓の守兵も同じ条件で数え、開戦だけで兵数を減らさない。
iwamura.force = (rt) => {
  const F = rt.flags;
  let a = 0, b = 0;
  for (const g of F.fieldAllies || []) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) a++;
  for (const g of F.rearGroups || []) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) b++;
  return { a, a0: F.forceA0 || 1, b, b0: F.forceB0 || 1 };
};
// 戦の中の人数の札は紋と数だけ（軍の名の字は出さない。kaito 10/23）。開戦の札の名は introSides、台詞の敵味方は foeNames で分ける。
iwamura.sides = { a: { name: '', mon: 'oda' }, b: { name: '', mon: 'takeda' } };
iwamura.hideArmyPeek = true;   // 上の両軍の紋と棒は出さない（「織田勢」「武田勢」の札。10/29）
iwamura.foeNames = ['武田', '秋山', '大島', '座光寺'];
// 座光寺は開城後に捕らえられる。夜襲隊へ名付きの討取り相手を追加しない。
iwamura.famous = [];
iwamura.date = (rt) => `天正三年十一月十日　冬・${rt.world.nightAmount() >= 0.5 ? '夜' : '夕暮れ'}`;
iwamura.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
iwamura.skip = (rt) => { if (rt.phase === 'brief') iwamura.prepare(rt); };
iwamura.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
iwamura.history = '天正三年、織田信忠は秋山虎繁らの守る岩村城を囲んだ。『信長公記』巻八によれば、十一月十日の夜、水精山の攻め衆が夜討ちを受け、河尻与兵衛・毛利河内・浅野左近・猿荻甚太郎が退けた。城方は柵を破り、夜討ちの者と合流しようとしたが、信忠が先駆けとなって城へ追い込んだ。勝頼の後詰の報せを受け、信長が京都を発ったのは十四日夜。十日夜の陣に報せが届いた時刻は分からない。後日、秋山・大島・座光寺は降伏の礼に出て捕らえられ、岐阜の長良川で磔にされた。本編は河尻の手が夜討ちを退け、麓を押さえるまでを描く。夜討ち勢の所属、各備の兵数、陣所・道・霧・夕暮れの支度は復元。総勢三万対三千は『信長公記』のこの条に記された人数ではない。';

// 素直な遊び手：篝火を焚き、柵の前で夜討ちを受け、城の麓まで追う
// 左右の柵は端へ向けて南へ傾く。内側に一歩残して槍を届かせる。
function fencePostZ(x) { return FENCE_Z + Math.max(0, Math.min(52, Math.abs(x) - 8)) * 4 / 52 + 1; }
function chaseReady(u) {
  return u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget;
}
// 出発後に先頭が倒れた時も、次の兵が列の先へ歩ける持ち場にする。
// 空いた先頭を残すと、後列待ちを助ける五メートル内に誰も来なくなる。
function packChaseFront(g) {
  let ready = 0;
  for (const u of g.units) if (chaseReady(u)) ready++;
  if (g.iwMarchReady === ready && !g.units.some((u) => chaseReady(u) && u.slot >= ready)) return;
  g.iwMarchReady = ready;
  let slot = 0;
  for (const u of g.units) if (chaseReady(u)) u.slot = slot++;
  for (const u of g.units) if (!chaseReady(u)) u.slot = slot++;
  g._fitAt = 0;
}
// 集まった実兵を先頭へ詰めてから道の縦隊へ。兵の位置・士気・傷は変えない。
function gatherChaseFront(rt, g) {
  if (g.routed || g.signalUntil > rt.army.time || !g.dest) return;
  // 集合先へ南向きに歩いたままだと、後列の持ち場が柵の外へ伸びる。
  // 要が止まってから城側へ向き直し、陣内で列を作る。実兵は歩いて並び直す。
  // 共通の移動が向きを更新する三十センチの外では、旋回を取り合わない。
  if (Math.hypot(g.anchor.x - g.dest.x, g.anchor.z - g.dest.z) <= 0.3 && g.facing !== Math.PI) {
    g.facing = Math.PI; g._fitAt = 0;
  }
  let ready = 0, gathered = 0;
  for (const u of g.units) if (chaseReady(u)) {
    ready++;
    if (Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 6) gathered++;
  }
  // 集合中の死傷・後送で先頭に空きが出た時だけ詰め直す。
  // 士気用の初期人数や兵の現在位置は変えず、後列を歩いて集合させる。
  if (g.iwGatherReady !== ready) {
    g.iwGatherReady = ready;
    let slot = 0;
    for (const u of g.units) if (chaseReady(u)) u.slot = slot++;
    for (const u of g.units) if (!chaseReady(u)) u.slot = slot++;
    g._fitAt = 0;
  }
  // 後れた兵を待ち続けて、麓の本人だけを孤立させない。
  // 四人そろわなくても、集合先で八秒静まり、実兵が一人は着いていれば先頭から出る。
  // 合流の必要人数は減らさず、後列も同じ道を歩かせる。斬り合い・敗走中は待つ。
  const quiet = rt.t - Math.max(g.iwChaseCheck.t, g.iwChaseQuiet ?? g.iwChaseCheck.t) >= 8;
  if (!ready || gathered < Math.min(4, ready) && !(gathered > 0 && quiet) ||
      Math.hypot(g.anchor.x - g.dest.x, g.anchor.z - g.dest.z) > 0.3) return;
  let slot = 0;
  for (const u of g.units) if (chaseReady(u) && Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 6) u.slot = slot++;
  for (const u of g.units) if (chaseReady(u) && Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) >= 6) u.slot = slot++;
  for (const u of g.units) if (!chaseReady(u)) u.slot = slot++;
  g.iwGather = false; g.dest = null; g.order = 'path'; g.formation = 'column'; g.width = 0;
  g.path = g.iwChasePath;
  g.onArrive = g.iwChaseArrive; g.iwChaseArrive = null;
  g.iwChaseCheck.x = g.anchor.x; g.iwChaseCheck.z = g.anchor.z; g.iwChaseCheck.t = rt.t;
}
// 後列一人の遅れで二手とも柵に残さない。先頭の実兵が付いている時だけ、道順に沿って歩みを促す。
// 任務と同じ半秒の調べで動かし、到着の人数・斬り合い・崩れの判定は残す。
function advanceChaseFront(rt, g, span) {
  const check = g.iwChaseCheck;
  if (!check || g.routed || g.signalUntil > rt.army.time) return;
  // 集合中は道順が消えていても実際の集合先へ進む。道の途中だけ折れ点を読む。
  const q = g.iwGather ? g.dest : g.path?.[g.pathIdx];
  if (!q) return;
  const qx = g.iwGather ? q.x : q[0], qz = g.iwGather ? q.z : q[1];
  if (Math.hypot(g.anchor.x - check.x, g.anchor.z - check.z) > 1) {
    check.x = g.anchor.x; check.z = g.anchor.z; check.t = rt.t;
  }
  let front = false;
  for (const u of g.units) if (chaseReady(u)) {
    const target = u.target, pos = target?.pos;
    // 遠く後れた一人の打ち合いで、道を進む先頭まで柵に縛り付けない。
    // 先頭の周囲の敵には列で応戦し、後列の兵自身の戦いは止めない。
    if (Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 12 &&
        (target?.isStruct && (u.atk || u.swing) || pos && chaseReady(target) &&
        Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z) < 4 &&
        !target.fleeing && !target.group?.iwWithdraw &&
        !rt.army.wallBetween(u.pos, -1, pos) && !rt.army.terrainBlocks(u.pos, pos))) {
      g.iwChaseQuiet = rt.t;
      return;
    }
    // 集まり直した先頭が次の折れに着いていても、要の後れを少しずつ詰める。
    // 倒れた敵・退く敵・柵越しの敵を、全列を止める斬り合いとは数えない。
    if (Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 5 ||
        Math.hypot(u.pos.x - qx, u.pos.z - qz) < 5) front = true;
  }
  // 柵での立て直し位置は、縦隊へ変わると道の後方へ動き続ける。
  // 追撃の下知後、敵が離れて四秒たったら、その場の列で歩き直す。
  // 要が動く間も静かな時間を数える。要の停止待ちでは後退する集合先を追い続ける。
  // 士気・死傷・敗走は戻さず、斬り合い中の列は上の判定で待つ。
  if (g.regroupT > 0) {
    if (g.iwChaseQuiet == null) g.iwChaseQuiet = rt.t;
    if (rt.t - g.iwChaseQuiet < 4) return;
    g.regroupT = 0; g.regroupRecovered = true;
    for (const u of g.units) if (chaseReady(u)) { u.combatRetreat = false; u.aiT = 0; }
  }
  if (rt.t - check.t < 4) return;
  if (!front) return;
  const dx = qx - g.anchor.x, dz = qz - g.anchor.z, d = Math.hypot(dx, dz);
  if (d < 1) return;
  const from = g.iwChaseFrom, to = g.iwChaseTo, step = Math.min(d, span * 1.4);
  from.x = g.anchor.x; from.z = g.anchor.z; from.y = rt.world.heightAt(from.x, from.z);
  to.x = from.x + dx / d * step; to.z = from.z + dz / d * step;
  to.y = rt.world.heightAt(to.x, to.z);
  if (rt.army.wallBetween(from, -1, to) || rt.army.terrainBlocks(from, to)) return;
  g.anchor.x = to.x; g.anchor.z = to.z;
  // 促した分を基準点へ反映し、先頭が付く間は四秒待ちを繰り返さない。
  check.x = g.anchor.x; check.z = g.anchor.z;
}
// 両口を移る時は、兵と同じ連絡道の折れを指す。柵を横切る直進を勧めない。
// 半秒ごとの調べで道標の入れ物を使い回す。
function guideRaidMouth(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  // 柵の外から内側の連絡道へ直進させず、兵と同じ口を通して戻す。
  F.raidReturning = Math.abs(p.x) < 80 && p.z < fencePostZ(p.x) - 1;
  if (F.raidReturning) {
    F.raidCrossing = false; F.atRaidMouth = false;
    returnToRoad(p.x > 40 ? GATHER_EAST_RETURN : GATHER_RETURN, p, F.raidGuide);
    return;
  }
  // 陣の奥への救援も、東からは開口と連絡道を通す。
  F.raidCrossing = F.breached ? p.x > 40 : (p.x > 40) !== !!F.raidMouthX;
  F.atRaidMouth = false;
  if (F.raidCrossing) {
    returnToRoad(!F.breached && F.raidMouthX ? MOUTH_LINK : MOUTH_BACK, p, F.raidGuide);
    return;
  }
  F.raidGuide.x = F.breached ? F.breachEnemy?.pos.x ?? 0 : F.raidMouthX || 0;
  F.raidGuide.z = F.breached ? F.breachEnemy?.pos.z ?? 32 : F.raidMouthX ? 12 : FENCE_Z + 3;
  // 支度中も到着を調べ、見張る札を出した場所へ歩き直させない。
  F.atRaidMouth = !F.breached && Math.hypot(p.x - F.raidGuide.x, p.z - F.raidGuide.z) < 6;
}
// 麓の任務で数える敵と、道標・自動操作が追う敵をそろえる。
function roadEnemy(u, atFoot = false, footY = u.pos.y) {
  // 後送中の深手や倒れて討死の動きに入った兵へ、追い討ちを命じない。
  // 一時的に転んだ兵は起きて戦えるため、引き続き任務に数える。
  return u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && !u.group?.iwWithdraw &&
    // 到着後は城側から麓へ迫る兵も受ける。坂の上や柵の残兵は追わない。
    (atFoot ? Math.hypot(u.pos.x - FOOT.x, u.pos.z - FOOT.z) < 16 && Math.abs(u.pos.y - footY) < 3
      : u.pos.z > FOOT.z - 4 && Math.abs(u.pos.x) < 30);
}
// 押し合いで少し下がっても持ち場を変えず、坂の上は到着に含めない。
function atFoot(F, p) {
  return Math.hypot(p.x - FOOT.x, p.z - FOOT.z) < (F.chaseArrived ? 12 : 8) && Math.abs(p.y - F.footY) < 3;
}
// 退避も任務と同じ道へ。近くに味方がいても、切岸や城の坂を逃げ先にしない。
// 道を外れた本人には、道へ近づく向きだけを残す。既存の候補点を調べ、形は作らない。
function fieldGuideAllowed(rt, point) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.step < 3) return p.z < fencePostZ(p.x) || point.z >= fencePostZ(point.x);
  const path = F.chasePath;
  const distance = distToPolyline(point.x, point.z, path);
  const current = distToPolyline(p.x, p.z, path);
  if (distance > 4 && distance >= current) return false;
  if (F.chaseArrived && (Math.hypot(point.x - FOOT.x, point.z - FOOT.z) >= 12 ||
      Math.abs(rt.world.heightAt(point.x, point.z) - F.footY) >= 3)) return false;
  return true;
}
// 道を外れたら最寄りの道へ戻り、道に乗ったら麓側の折れへ進む。
// 行き先の入れ物を使い回し、計算は任務の半秒ごとの更新だけで行う。
function returnToRoad(path, p, guide) {
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    // 折れ目では前後の道が同じ距離になる。麓側を選び、その場で止めない。
    if (d > nearest) continue;
    nearest = d;
    // 歩く処理は一・五メートル手前で止まる。角のすぐ手前では次の折れへ送る。
    // これがないと、麓から押し戻された後に通過済みの角を指し続ける。
    const next = d <= 2 && Math.hypot(p.x - b[0], p.z - b[1]) < 2
      ? path[Math.min(i + 1, path.length - 1)] : b;
    // 道幅の外から次の折れを直に狙うと、内側の切岸を横切ってしまう。
    guide.x = d > 2 ? x : next[0]; guide.z = d > 2 ? z : next[1];
  }
}
iwamura.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
  if (!u.alive || F.ending) return;
  // 手当て済みなら待ち続けない。味方のいる後方まで退き、狙いを解いて止まる。
  if (u.hp < u.maxHp * 0.5 && !p.bandaged && p.treatmentLeft > 0) b.botRest = true;
  if (b.botRest && (u.hp > u.maxHp * 0.85 || p.bandaged || p.treatmentLeft <= 0)) b.botRest = false;
  if (b.botRest) {
    if (p.lock) inp.e.add('KeyQ');
    if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups[0].order === 'attack') {
      inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
    }
    if (p.treatmentReady) inp.k.add('KeyE');
    else if (F.step === 3) {
      returnToRoad(F.restPath, u.pos, F.restGuide);
      goTo(p, inp, F.restGuide.x, F.restGuide.z, 2);
    } else goTo(p, inp, 4, 32, 2);
    return;
  }
  // 実際の打ち手を先に受ける。塀越し・高低差のある敵へ歩き続けない。
  const reachable = (o) => !o.fleeing && !o.woundOut && !o.rearWound && !o.noTarget && !o.invuln && !o.isStruct && o.type !== 'dummy' &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, F.step === 2 && p.weapon === 'spear') &&
    !b.army.terrainBlocks(u.pos, o.pos);
  // 退却命令は個人の敗走とは別。退く列を追って柵の持ち場から離れない。
  // 退き太鼓の後も柵の外や坂の縁へ追わず、間合い内の打ち手には下の処理で防御・反撃する。
  const chaseTarget = (o) => !o.group?.iwWithdraw && !o.group?.retreatOnly &&
    (F.step !== 3 || o.group && F.roadDefenders.includes(o.group) && roadEnemy(o, F.joinOrder, F.footY));
  const pursue = (o) => chaseTarget(o) && (F.step !== 3 || (F.joinOrder
    ? Math.hypot(o.pos.x - FOOT.x, o.pos.z - FOOT.z) < 7
    : distToPolyline(o.pos.x, o.pos.z, F.chasePath) < 6));
  // 到着後、麓から離れていたら先に列へ戻る。近い打ち手には構えて退く。
  if (F.step === 3 && F.joinOrder && !atFoot(F, u.pos)) {
    // 戻る間も追撃中の組を呼び戻す。敵を追わせたまま本人だけ麓へ退かない。
    if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups[0].order === 'attack') {
      inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
    }
    if (p.lock) inp.e.add('KeyQ');
    inp.guardHold = (b.army.threats || []).some((o) => o.alive && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4);
    goTo(p, inp, F.chaseGuide.x, F.chaseGuide.z, 1.5);
    return;
  }
  let attacker = null, ad = 5;
  for (const o of b.army.threats || []) if (o.alive && o.type !== 'gun' && o.type !== 'bow' && reachable(o)) {
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 道外の打ち手には構えるが、届かない所まで追い回さない。
    if (!pursue(o) && d > reach) { inp.guardHold = true; continue; }
    if (d < ad) { ad = d; attacker = o; }
  }
  // 柵の口へ寄せる敵も見る。柵の内へ入るまで待つと、味方だけが斬り合ってしまう。
  // 塀越しは reachable で除き、追撃では遠い城兵より麓への下知を優先する。
  const e = attacker || b.army.nearestEnemy(u, F.step === 3 ? 8 : 24, (o) => reachable(o) && pursue(o) &&
    (F.step >= 2 || o.group === F.scout && F.scout.iwSent) &&
    (F.step !== 3 || F.joinOrder || distToPolyline(o.pos.x, o.pos.z, F.chasePath) < 8) &&
    (F.step !== 2 || o.pos.z > fencePostZ(o.pos.x) - reach + 0.1 && u.pos.z > FENCE_Z));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85 && !e.charging && pursue(e)) {
      // 刀も届く所まで詰める。打ち手が五歩先にいるだけで立ち止まらない。
      // 夜討ち中は柵の内側で止め、口の外へ追い出ない。
      const z = F.step === 2 ? Math.max(e.pos.z, fencePostZ(e.pos.x)) : e.pos.z;
      goTo(p, inp, e.pos.x, z, z !== e.pos.z ? 0.5 : reach * 0.85);
    }
    if (b.squad.length && pursue(e) && !(b.botCmdT > b.t) && b.squadGroups[0].order !== 'attack') {
      inp.e.add('KeyC'); b.botCmdT = b.t + 2;
    }
    if (b.squad.length && !pursue(e) && b.squadGroups[0].order === 'attack') {
      inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
    }
    patientStrike(p, inp, e, d);
    return;
  }
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups[0].order === 'attack') {
    inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
  }
  if (F.step === 1) {
    const it = b.interacts.find((q) => q.id === 'p' + F.firePost);
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      // 兵の持ち場の中心へ無理に割り込まず、実際に焚ける範囲で止まる。
      if (d >= it.r - 0.3) goTo(p, inp, it.pos.x, it.pos.z, it.r - 0.5);
      else inp.k.add('KeyE');
    } else goTo(p, inp, F.raidGuide.x, F.raidGuide.z, 1.5);
    return;
  }
  if (F.step === 2) {
    // 戻る時は退いた敵への狙いを解く。陣の奥を救う下知も同じ印へ従う。
    if (p.lock) inp.e.add('KeyQ');
    if (F.breached) {
      goTo(p, inp, F.raidGuide.x, F.raidGuide.z, 1.5);
      return;
    }
    // 押し合いで道を外れても、近い折れ点へ斜めに突っ切らず、道へ戻ってから口へ進む。
    // 追撃と同じ線分への投影を使い、井楼の柱へ向かう往復を避ける。
    returnToRoad(F.raidGuide.x > 40 ? MOUTH_LINK : MOUTH_BACK, u.pos, F.botMouthGuide);
    goTo(p, inp, F.botMouthGuide.x, F.botMouthGuide.z, 0.6);
    return;
  }
  if (F.step === 3) {
    const q = F.chaseGuide;
    goTo(p, inp, q.x, q.z, 1.5);
  }
};

// 生きた戦闘員だけで上限を数える。柵・門は兵の枠に入れない。
function battleRoom(rt) {
  let room = 225;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return Math.max(0, room);
}
function battleLook(rt, list, look) {
  let room = battleRoom(rt);
  // 本の足軽の写真：黒褐色の胴・紺の小袖・赤褐色の陣笠。
  // 六組の既存の汚れと仕立ての差を残し、材質や兵の数は増やさない。
  return dress(list.map((q) => {
    const n = Math.min(q.n, room); room -= n;
    const foot = q.type === 'ashigaru' || q.type === 'gun' || q.type === 'bow';
    return { ...q, n, o: { ...(foot ? { armor: 0x302822, cloth: 0x263332, hatColor: 0x642c24 } : {}), ...q.o } };
  }), look);
}

export { iwamura };

// 麓側の持ち上げは旧配置のまま保つ。夜討ち・追撃の坂と混戦の場所を変えない。
const LIFT = { x: 0, z: -354, tx: 0, tz: -172, w: 54, R: Math.abs(-172 - FOOT.z), rise: 1 };
LIFT.rise = (180 - (baseTerrain(0, -354) + 6 - baseTerrain(FOOT.x, FOOT.z))) /
  (1 - yamaLift(FOOT.x, FOOT.z, LIFT));
// 移した山頂にも比高180mを保つ。麓の平場の外から山頂へ広くすり付ける。
const SUMMIT_RISE = 180 - (baseTerrain(CASTLE.x, CASTLE.z) + yamaLift(CASTLE.x, CASTLE.z, LIFT) + 6 - baseTerrain(FOOT.x, FOOT.z));
function liftedTerrain(x, z) {
  // 約79mの補正を12mで立ち上げると、道脇が尖った三角の崖になる。
  // 本丸では全量、麓ではゼロのまま百メートルでつなぐ。
  // 中腹だけで立ち上げず、山裾から丸く持ち上げて空を塞ぐ急な壁を抑える。
  const t = Math.max(0, Math.min(1, (FOOT.z - z) / (FOOT.z - CASTLE.z)));
  // 山頂の補正を東西の端まで足すと、城の左右も長い崖になる。
  // 尾根の中央百メートルは保ち、その外の二百二十メートルで元の山肌へ戻す。
  const side = Math.max(0, Math.min(1, (Math.abs(x - CASTLE.x) - 100) / 220));
  const shoulder = 1 - side * side * (3 - 2 * side);
  return baseTerrain(x, z) + yamaLift(x, z, LIFT) + SUMMIT_RISE * t * t * (3 - 2 * t) * shoulder;
}

let ROAD_HEIGHTS = null;
let RAID_RAMPS = null;
let HOUSE_PADS = null;
let HOUSE_APPROACH_HEIGHTS = null;
let CHASE_HEIGHTS = null;
let FOOT_HEIGHT = null;
function height(x, z) {
  const h = fieldHeight(x, z);
  // 麓の道脇だけ、二格子先までの山肌へなじませる。
  // 道から八メートル以内・城の段・集合場所は元の高さを保つ。
  // 地形の格子を作る時に使い、形や材質、毎コマの仕事は増やさない。
  if (z < -140 || z > -60 || Math.abs(x) > 100) return h;
  const k = THREE.MathUtils.smoothstep(fieldRoadDistance(x, z), 8, 18)
    * THREE.MathUtils.smoothstep(Math.hypot(x - FOOT.x, z - FOOT.z), 20, 28)
    * THREE.MathUtils.smoothstep(z, -140, -128)
    * (1 - THREE.MathUtils.smoothstep(z, -72, -60))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 80, 100));
  if (!k) return h;
  const e = 12;
  const around = (fieldHeight(x - e, z) + fieldHeight(x + e, z)
    + fieldHeight(x, z - e) + fieldHeight(x, z + e)) / 4;
  return h + (around - h) * k;
}
function fieldHeight(x, z) {
  // 本丸までと枝道の全てをならす。道の高さを点の間でつなぎ、切岸の急な段差を登れる坂にする。
  if (!ROAD_HEIGHTS) {
    // 曲輪の中心を高さの基準にする。曲輪の外の高い下地を途中の木戸へ採ると、入口に急坂ができる。
    const main = IWA_ROAD.map(([px, pz]) => [px, pz, heightRaw(px, pz)]);
    // 麓から三の丸までを一本の坂にすると、迂回する中腹の道が百メートル以上
    // 山肌をえぐる。城外は折れごとの下地を採り、曲輪間だけ段の高さでつなぐ。
    const outer = castlePoint(0, -172);
    const outerIndex = IWA_ROAD.findIndex(([x, z]) => x === outer[0] && z === outer[1]);
    const anchors = main.slice(0, outerIndex).map((p, i) => ({ i, y: p[2] }));
    for (const [id, x, z] of [['outer', 0, -172], ['hachiman', 16, -196], ['ni', -10, -218], ['shu', 6, -240], ['hon', 0, -258]].map(([id, x, z]) => [id, ...castlePoint(x, z)])) {
      const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => q.id === id);
      anchors.push({ i: IWA_ROAD.findIndex((q) => q[0] === x && q[1] === z), y: k.level(liftedTerrain) });
    }
    for (let j = 1; j < anchors.length; j++) {
      const a = anchors[j - 1], b = anchors[j]; let len = 0, at = 0;
      for (let i = a.i + 1; i <= b.i; i++) len += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]);
      main[a.i][2] = a.y;
      for (let i = a.i + 1; i <= b.i; i++) {
        at += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]);
        main[i][2] = a.y + (b.y - a.y) * at / len;
      }
    }
    const heights = new Map(main.map(([px, pz, y]) => [px + ',' + pz, y]));
    // 枝道も平場の間を道の長さでつなぐ。曲輪外の高い下地を途中の坂に採らない。
    const branches = IWA_SIDE_ROADS.map((pts) => {
      const first = pts[0], last = pts[pts.length - 1];
      const y0 = heights.get(first.join(',')) ?? heightRaw(...first);
      let y1 = heights.get(last.join(',')) ?? heightRaw(...last);
      if (SETTINGS.quality === 'high') {
        // 南の階下へ着く枝道は、床下の平場と同じ高さで終える。
        // 階下の山肌を基準にすると、最後の平場で道が急に折れていた。
        const house = CASTLE_HOUSES.find(([px, pz, , d]) =>
          Math.abs(last[0] - px) < .01 && Math.abs(last[1] - pz - d / 2 - 1.5) < .01);
        if (house) {
          const terrace = IWAMURA_CASTLE_PLAN.kuruwa.find(q => inPoly(q.poly, house[0], house[1]));
          y1 = terrace ? terrace.level(liftedTerrain) : heightRaw(house[0], house[1]);
        }
      }
      let len = 0, at = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return pts.map(([px, pz], i) => {
        if (i) at += Math.hypot(px - pts[i - 1][0], pz - pts[i - 1][1]);
        const y = y0 + (y1 - y0) * at / (len || 1);
        heights.set(px + ',' + pz, y);
        return [px, pz, y];
      });
    });
    // 添え小屋への道は絵と除草だけで、足もとの切岸が残っていた。
    // 階下の平場から曲輪道まで、同じ点列を歩ける細い坂にする。
    // 高さと点列は初回だけ作り、建物の床下と既存の城内道へ両端を合わせる。
    HOUSE_APPROACH_HEIGHTS = SETTINGS.quality === 'high' ? HOUSE_APPROACH_PATHS.map((pts, index) => {
      const house = APPROACH_HOUSES[index], last = pts[pts.length - 1];
      const terrace = index >= CASTLE_OUTBUILDINGS.length
        ? IWAMURA_CASTLE_PLAN.kuruwa.find(q => inPoly(q.poly, house[0], house[1])) : null;
      const y0 = terrace ? terrace.level(liftedTerrain) : heightRaw(house[0], house[1]);
      const y1 = heights.get(last.join(',')) ?? heightRaw(...last);
      let length = 0, at = 0;
      for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return pts.map(([px, pz], i) => {
        if (i) at += Math.hypot(px - pts[i - 1][0], pz - pts[i - 1][1]);
        return [px, pz, y0 + (y1 - y0) * at / (length || 1)];
      });
    }) : [];
    ROAD_HEIGHTS = [[...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20), ...IWA_ROAD], ...RAID_PATHS, MOUTH_LINK, ...RETURN_PATHS, ...CAMP_ENTER, ...CAMP_EXIT, [[0, -10], [0, -140]]]
      .map((pts) => {
        // 山へ散る退路だけでなく、移した城へ向かう長い道も途中の山肌を読む。
        // 端の高さだけで数百メートルを結ぶと、麓に薄い土の壁を作ってしまう。
        // 曲輪間の短い坂は決めた高さを保つ。点を足すのは初めの一度だけ。
        const retreat = RETURN_PATHS.includes(pts) && pts !== RETURN_PATHS[2];
        if (retreat ||
            pts.some((p, i) => i > 0 && Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 24)) {
          const sampled = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const steps = length > 24 || retreat ? Math.max(1, Math.ceil(length / 12)) : 1;
            for (let j = 1; j <= steps; j++) sampled.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
          }
          pts = sampled;
        }
        return pts.map(([px, pz]) => [px, pz, heights.get(px + ',' + pz) ?? heightRaw(px, pz)]);
      });
    ROAD_HEIGHTS.push(...branches);
  }
  const raw = heightRaw(x, z);
  // 麓から最初の木戸までの道脇だけ広くすり付ける。
  // 高い曲輪と低い道を一格子でつなぎ、薄い三角の土の尖りにしない。
  const shoulderT = THREE.MathUtils.smoothstep(-z, 90, 124) * THREE.MathUtils.smoothstep(z, -180, -156);
  // 九十九折りの外縁も数列の格子へ分散する。六メートル角の一列だけで
  // 高い山腹へ戻すと、麓から見て道の脇が薄い三角の土の板になる。
  const roadEdge = 6.3 + 45 * shoulderT, roadFade = 3.5 + 45 * shoulderT;
  let weight = 0, roadH = 0, blend = 0;
  for (const pts of ROAD_HEIGHTS) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= roadEdge) continue;
    const k = Math.max(0, Math.min(1, (roadEdge - d) / roadFade)), w = k * k * (3 - 2 * k);
    weight += w; roadH += (a[2] + (b[2] - a[2]) * t) * w;
    blend = Math.max(blend, w);
  }
  // 二本の道の中間で最寄りを切り替えると、高さが数メートル跳ねて兵が止まる。
  // 重なる坂を重みでつなぎ、道の境にも高さの切れ目を作らない。
  let h = weight > 0 ? raw + (roadH / weight - raw) * blend : raw;
  // 口の外は一本の坂にそろえる。重なる九十九折りの横の段を馬や寄せ手へ踏ませない。
  // 中央は幅24m、東は幅12m。高さの基準は初めに一度だけ作り、切岸全体はならさない。
  if (!RAID_RAMPS) RAID_RAMPS = [
    [0, -62, FENCE_Z + 3, 12, heightRaw(0, -62), heightRaw(0, FENCE_Z + 3)],
    [66, -62, 12, 6, heightRaw(66, -62), heightRaw(66, 12)],
  ];
  for (const ramp of RAID_RAMPS) {
    const side = Math.max(0, Math.abs(x - ramp[0]) - ramp[3]) / 12;
    const end = Math.max(0, ramp[1] - z, z - ramp[2]) / 10;
    const fade = Math.max(side, end);
    if (fade >= 1) continue;
    const t = Math.max(0, Math.min(1, (z - ramp[1]) / (ramp[2] - ramp[1])));
    const y = ramp[4] + (ramp[5] - ramp[4]) * t;
    const k = 1 - fade * fade * (3 - 2 * fade);
    h += (y - h) * k;
  }
  // 追撃路では交差する退却路の高い中腹を平均しない。組と主人公が通る道の高さを優先する。
  // 折れの高さと計算用の点列は初めに一度だけ作る。
  if (!CHASE_HEIGHTS) CHASE_HEIGHTS = CHASE_PATH.map(([px, pz]) => [px, pz, heightRaw(px, pz)]);
  let chaseWeight = 0, chaseY = 0, chaseBlend = 0;
  for (let i = 1; i < CHASE_HEIGHTS.length; i++) {
    const a = CHASE_HEIGHTS[i - 1], b = CHASE_HEIGHTS[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d >= 16) continue;
    // 近い道が切り替わる境も高さをつなぐ。六メートルの格子に二列分の道幅を残す。
    const fade = Math.max(0, (d - 6) / 10), k = 1 - fade * fade * (3 - 2 * fade);
    chaseWeight += k; chaseY += (a[2] + (b[2] - a[2]) * t) * k;
    chaseBlend = Math.max(chaseBlend, k);
  }
  if (chaseWeight > 0) h += (chaseY / chaseWeight - h) * chaseBlend;
  // 最後の折れから麓の集合場所までを一つの平場へつなぐ。
  // 待つ輪のすぐ脇に急な段を残すと、味方の後列が坂へ張り付き、合流できない。
  const footD = Math.hypot(x - FOOT.x, z - FOOT.z);
  // 平場の外周を七列ほどの格子へ分散し、高い山腹へ戻る縁を尖らせない。
  // 城内の曲輪（麓から八十メートル以上先）と、合流を数える平場の高さは保つ。
  if (footD < 64) {
    const t = Math.max(0, (footD - 20) / 44), k = 1 - t * t * (3 - 2 * t);
    if (FOOT_HEIGHT === null) FOOT_HEIGHT = heightRaw(FOOT.x, FOOT.z);
    h += (FOOT_HEIGHT - h) * k;
  }
  // 添え小屋・堂・社・侍屋敷の通路だけ幅二メートルを確保し、その外は元の斜面へ戻す。
  // 重なる通路の高さは平均し、道の途中で段差を作らない。床下は下の平場を優先する。
  let approachWeight = 0, approachY = 0, approachBlend = 0;
  if (x > HOUSE_APPROACH_BOUNDS.x0 && x < HOUSE_APPROACH_BOUNDS.x1
    && z > HOUSE_APPROACH_BOUNDS.z0 && z < HOUSE_APPROACH_BOUNDS.z1)
  for (const pts of HOUSE_APPROACH_HEIGHTS) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const distance = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (distance >= 2.4) continue;
    const fade = Math.max(0, (distance - 1) / 1.4), k = 1 - fade * fade * (3 - 2 * fade);
    approachWeight += k; approachY += (a[2] + (b[2] - a[2]) * t) * k;
    approachBlend = Math.max(approachBlend, k);
  }
  if (approachWeight > 0) h += (approachY / approachWeight - h) * approachBlend;
  // 道のなだらかさを家の床下へ持ち込まない。建物の足もとは曲輪と同じ平らな小段。
  // 初めに一度だけ作り、毎コマ配列や形を作らない。
  // 添え小屋は曲輪外にもあるため、中心の地面を基準に床下と戸口をならす。
  // 陣の仮小屋も床下と南の木階の下端を同じ小段へ納める。
  // 正面だけ一・八メートル広げ、柵前の戦う地面は変えない。
  if (!HOUSE_PADS) {
    const high = SETTINGS.quality === 'high', seat = IWAMURA_CASTLE_PLAN.lordSeat;
    const houses = high ? CASTLE_HOUSES.concat([[...seat.at, seat.w, seat.d], VILLAGE_HALL]) : CASTLE_HOUSES;
    HOUSE_PADS = houses.flatMap(([px, pz, w, d]) => {
      const k = IWAMURA_CASTLE_PLAN.kuruwa.find((q) => inPoly(q.poly, px, pz));
      // 岩村の戸口は全棟＋奥行き側。共通室内の階下は外壁から一・三メートル先にある。
      // 床下だけをならすと階下が斜面に掛かるため、主殿も含め正面一・八メートルまで平場を延ばす。
      // 裏の切岸は広げず、中心を六十センチずらして正面側だけを足す。
      // 移した八幡社は曲輪の輪郭外。中心の下地からも平場を作り、床下と階下へ斜面を残さない。
      if (!k && !high) return [];
      const base = k ? k.level(liftedTerrain) : heightRaw(px, pz);
      if (high && px === VILLAGE_HALL[0] && pz === VILLAGE_HALL[1])
        return [[px - .6, pz, d / 2 + 1.2, w / 2 + .6, base]];
      return [[px, pz + (high ? .6 : 0), w / 2 + .6, d / 2 + (high ? 1.2 : .6), base]];
    // 番小屋・兵糧小屋にも床下と階下の平場を設け、斜面が土間へ食い込むのを防ぐ。
    }).concat(high ? CAMP_HOUSES.concat(CAMP_SERVICE_HOUSES).map(([px, pz, w, d]) =>
      [px, pz + .6, w / 2 + .6, d / 2 + 1.2, heightRaw(px, pz)]) : [])
      .concat(high ? CASTLE_OUTBUILDINGS.map(([px, pz, w, d]) =>
        [px, pz, w / 2 + .6, d / 2 + 1.8, heightRaw(px, pz)]) : []);
  }
  for (const pad of HOUSE_PADS) {
    const d = Math.max(Math.abs(x - pad[0]) - pad[2], Math.abs(z - pad[1]) - pad[3]);
    if (d >= 1.4) continue;
    const t = Math.max(0, d / 1.4), k = 1 - t * t * (3 - 2 * t);
    h += (pad[4] - h) * k;
  }
  return h + campEarthwork(x, z);
}
