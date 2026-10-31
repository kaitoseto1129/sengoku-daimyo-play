import * as THREE from 'three';
import { S } from './settings.js';
import { flagMoonlight } from './world_common.js';
import { WIND_DIR } from './world_weather.js';

// ---------------- 遠景の軍勢（軽い作りの兵） ----------------
// 一人ずつ、頭・笠か兜・肩・胴・脚と得物の形が影で分かる。動きは形の側（頂点）で付ける：
// 足踏み・見回し・向き直り・槍の傾きと持ち替え・隣へ寄る。進む・退く・崩れて逃げるも同じ仕組み
// 足もとの高さは地面の高さの絵から読む（隊ごと動かしても、坂で浮いたり埋まったりしない）
// 兵の種類（aInfo.y）：0 槍　1 鉄砲　2 弓　3 侍（兜）　4 旗持ち　5 騎馬（馬に乗る）　6 床几に座る大将　7 小者・陣夫（背に荷。部品 13）
const ARMY_GLSL = `
uniform vec2 uWindDir;
uniform float uAMotion, uAFlagWidth; varying float vASteel;
uniform float uAT, uGust, uIdle, uMarch, uCharge, uTurn, uRout, uRoutT, uShim, uYose, uFieldRanks, uOrganicRanks;
uniform sampler2D uHgt; uniform vec3 uHP; uniform float uTerrainTriangles;
attribute vec4 aInfo; attribute vec2 aInfo2; attribute float aPart;
// aHost：後詰め（隊の後ろに続く軽い兵）の奥行き（0 は隊の本体。後ろほど 1 に近く、霞む）。負は敵の寄せた後詰め（カメラの 36m から見せ、霞を薄く）
attribute float aHost; varying float vAHz;
// aSplit：兵ごとに遠さで形を選ぶ隊（lodSplit）。1 は遠い兵の束（44m の内を描かない。2 は 16m の内を描かない）・-1 は近い兵の細かい形・-2 は中ほどの形。0 は分けない
attribute float aSplit; uniform vec2 uArmySplitR;
// 列の場所から風の遅れを決める。兵ごとの乱数だけで揺らさず、隣へ波を伝える。
float aWindPhase() {
  #ifdef USE_INSTANCING
    return dot((modelMatrix * instanceMatrix[3]).xz, uWindDir) * 0.05;
  #else
    return 0.0;
  #endif
}
mat3 aRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 aRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 aRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float aTerrain(vec2 p) {
  vec2 f = clamp((p + uHP.x) / uHP.y, vec2(0.0), vec2(uHP.z - 0.001));
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float a = texelFetch(uHgt, i, 0).r, b = texelFetch(uHgt, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHgt, i + ivec2(0, 1), 0).r, d = texelFetch(uHgt, i + ivec2(1, 1), 0).r;
  // 指定した山城だけ、描く地面と同じ三角形へ兵・旗・馬の根元を据える。
  if (uTerrainTriangles > 0.5) return t.x + t.y <= 1.0
    ? a + (b - a) * t.x + (c - a) * t.y
    : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
struct APose { float show, yaw, tilt, fall, leg, spear, spLen, lift, kneel, nod, run, plant; vec3 off, foot; vec2 step; };
APose aPose() {
  APose P;
  P.plant = 0.0; P.foot = vec3(0.0); P.step = vec2(0.0);
  float sd = aInfo.x, kd = aInfo.y, hm = aInfo.z, ex = aInfo.w, s2 = aInfo2.y, pt = aPart;
  float T = uAT + sd * 97.0;
  // 見せる部品（種類に合わない得物はたたむ）
  P.show = 1.0;
  if (pt == 1.0) P.show = 1.0 - hm;
  else if (pt == 2.0) P.show = hm;
  else if (pt == 3.0) P.show = (kd == 0.0 || kd == 5.0) ? 1.0 : 0.0;
  else if (pt == 4.0) P.show = kd == 1.0 ? 1.0 : 0.0;
  else if (pt == 5.0) P.show = kd == 2.0 ? 1.0 : 0.0;
  else if (pt == 6.0) P.show = kd == 4.0 ? 1.0 : 0.0;
  else if (pt == 8.0 || pt == 9.0) P.show = kd == 5.0 ? 0.0 : 1.0;
  else if (pt == 10.0 || pt == 11.0) P.show = aInfo2.x;
  else if (pt == 13.0) P.show = kd == 7.0 ? 1.0 : 0.0;
  // 崩れて逃げる：一人ずつ少し遅れて踵を返し、ばらばらの向きへ走る。一割ほどは倒れて動かない
  float rt = uRout * max(0.0, uRoutT - sd * 1.6);
  float run = step(0.001, rt);
  float fallAt = 1.2 + s2 * 50.0;
  float falls = step(s2, 0.1) * run;
  float down = falls * smoothstep(fallAt, fallAt + 0.5, rt);
  float rtm = mix(rt, min(rt, fallAt), falls);
  float spd = 3.0 + sd * 2.2;
  P.run = run;
  // 足踏み：ときどき足を踏みかえる。進む時は歩き、逃げる時は走る
  float stepG = smoothstep(0.55, 0.95, sin(T * mix(0.11, 0.23, uIdle) + sd * 31.0));
  float gait = max(uMarch, run);
  // 隊の中の入れ替わり：ときどき一人が横へ数歩ずれて、しばらくして戻る（その間は歩く）
  float swp = (1.0 - uYose) * uIdle * smoothstep(0.86, 1.0, sin(T * 0.027 + sd * 53.0)) * (1.0 - min(1.0, gait)) * step(kd, 4.5);
  float swk = swp * (1.0 - swp) * 4.0;
  float fq = run > 0.5 ? 10.5 : (kd == 5.0 && uMarch > 0.01 ? mix(3.1, 7.0, uCharge) : (uMarch > 0.01 || swk > 0.3 ? 5.6 : 6.5));
  float amp = max(max(stepG * 0.2, uMarch * 0.42), swk * 0.4);
  amp = mix(amp, 0.7, run) * (1.0 - down);
  float ph = sin(T * fq);
  P.leg = ph * amp;
  P.lift = abs(ph) * (0.012 + amp * 0.07);
  // 見回し・ときどきの向き直り（進む・逃げる時はしない）
  float look = 0.2 * sin(T * 0.07) * sin(T * 0.031 + sd * 9.0) + 0.6 * smoothstep(0.88, 1.0, sin(T * 0.045 + sd * 20.0)) * (sd > 0.5 ? 1.0 : -1.0);
  // 小さな見回し（人ごとに速さが違う）と、ずれる時は歩く向きへ少し顔を向ける
  look += uIdle * (0.16 * sin(T * (0.3 + s2 * 0.25) + sd * 23.0) + swk * 0.5 * (s2 > 0.5 ? 1.0 : -1.0));
  look *= 1.0 - min(1.0, gait) * 0.85;
  P.yaw = look + uTurn * 3.14159 + run * (3.14159 + (s2 - 0.5) * 1.7);
  // 体の左右の揺れ（重心の移し替え）と息づかいの上下
  P.tilt = 0.035 * sin(T * 0.23 + sd * 5.0) + (1.0 - run) * ((s2 - 0.5) * 0.05 + uIdle * 0.03 * sin(T * (0.8 + sd * 0.5) + s2 * 40.0));
  P.fall = down * 1.45;
  // 槍：人ごとに傾きが違い、ゆっくり揺れ、ときどき持ち替える。進む時は少し前へ、かかる時は穂先を下ろし、逃げる時は肩に担ぐか放り出す
  float regrip = smoothstep(0.9, 1.0, sin(T * 0.083 + sd * 41.0));
  P.spear = (sd - 0.5) * 0.24 + 0.05 * sin(T * 0.37) + regrip * 0.35 + uMarch * 0.1 + uCharge * 1.15 * (1.0 - run) - run * 0.55;
  // 指定した槍隊の待機中だけ、城側へ約三十度傾けて穂先をそろえる。
  // 進軍・突撃・敗走では従来の持ち替えへ戻す。旗持ちと騎馬の得物は変えない。
  float ranks = uFieldRanks * (1.0 - min(1.0, max(gait, uCharge)));
  if (kd == 0.0) P.spear = mix(P.spear, -0.50 + (sd - 0.5) * 0.12 + 0.04 * sin(T * (0.27 + s2 * 0.13)), ranks);
  P.spLen = kd == 0.0 && ex > 0.0 ? max(0.65, ex) : 1.0;
  if ((pt == 3.0 || pt == 4.0) && run > 0.5 && s2 > 0.55) P.show = 0.0;
  P.kneel = (kd == 1.0 && ex > 0.5) ? mix(0.7, 1.0, min(1.0, gait)) : 1.0;
  // 馬の首：ときどき振る・下げる
  P.nod = gait * 0.08 * sin(T * fq) + 0.1 * sin(T * 0.5) + 0.35 * smoothstep(0.9, 1.0, sin(T * 0.06 + sd * 13.0)) * (1.0 - gait) - gait * 0.15;
  // 隣へ寄る・少し離れる（その場でゆっくり）
  vec3 wand = vec3(0.24 * sin(T * 0.013 + sd * 7.0), 0.0, 0.18 * sin(T * 0.017 + sd * 3.0)) * (1.0 - min(1.0, gait));
  wand += vec3((s2 > 0.5 ? 1.0 : -1.0) * 0.9, 0.0, -0.45) * swp;
  P.lift += uIdle * 0.012 * (1.0 - run) * sin(T * 1.7 + sd * 30.0);
  #ifdef USE_INSTANCING
  float idleFar = smoothstep(36.0, 60.0, length((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz - uArmyP));
  wand *= idleFar; P.yaw = mix(uTurn * 3.14159 + run * (3.14159 + (s2 - 0.5) * 1.7), P.yaw, idleFar);
  #endif
  // 槍ぶすまの列はその場を保つ。呼吸と足踏みは残す。
  wand *= 1.0 - ranks;
  // 槍列も一人ずつ小さく見回す。隊の向きと立ち位置は保つ。
  P.yaw = mix(P.yaw, uTurn * 3.14159 + look * 0.12 * uAMotion, ranks);
  P.off = wand * (1.0 - uYose) + aRotY(P.yaw) * vec3(0.0, 0.0, rtm * spd * (kd == 5.0 ? 2.0 : 1.0));
  P.lift += down * 0.12;
  if (kd == 5.0 && pt < 20.0) P.lift += 0.98;
  // 進む時の波打ち：隊の横へ流れる波で、列が前後にうねり、背が上下し、槍の林が揺れる（大軍が一つの生き物のように動く）
  #ifdef USE_INSTANCING
  {
    vec2 ip = instanceMatrix[3].xz;
    float wv = sin(dot(ip, vec2(0.11, 0.083)) - uAT * 1.6), mk = uMarch * (1.0 - run);
    float row = floor(ip.y / 1.8);
    float rankWave = sin(uAT * 0.85 - row * 0.55 + ip.x * 0.09);
    // 控えの組も前線の圧を受けてゆっくり詰め直す。足場を読む前に同じ変位を全部品へ渡す。
    float waiting = uOrganicRanks * uAMotion * (1.0 - min(1.0, gait)) * (1.0 - run);
    float pressureWave = sin(uAT * 0.42 + ip.x * 0.065 + ip.y * 0.047);
    P.off.z += waiting * pressureWave * 0.48;
    P.off.x += waiting * sin(uAT * 0.31 + ip.y * 0.08) * 0.16;
    P.leg += waiting * cos(uAT * 0.42 + ip.x * 0.065 + ip.y * 0.047) * 0.07;
    P.spear += waiting * (pressureWave * 0.055 + (sd - 0.5) * 0.16);
    // 同じ高さの黒い帯を作らず、圧を受ける腰と肩に個々の遅れを残す。
    P.tilt += waiting * pressureWave * (0.025 + sd * 0.025);
    P.lift -= waiting * (0.5 + 0.5 * pressureWave) * 0.035;
    // 地形に沿う控えは、組ごとに前の槍を下ろし、後ろは立てて待つ。
    // 兵の位置・長さは保ち、全員同じ角度の針の壁にしない。
    if (kd == 0.0) {
      float readyRank = step(0.48, fract(floor(ip.y / 2.3) * 0.3819 + floor(ip.x / 7.0) * 0.618));
      // 列ごとの準備と個々の持ち替えを分け、縦一列の針の壁を崩す。
      float shoulderReady = smoothstep(0.45, 0.85, sd);
      P.spear += waiting * readyRank * (0.48 + sd * 0.32);
      P.spear += uOrganicRanks * uAMotion * (1.0 - run) * shoulderReady * (0.16 + s2 * 0.22);
    }
    P.off.z += (1.0 - uYose) * uAMotion * mk * (0.55 * wv + 0.28 * rankWave);
    P.off.x += (1.0 - uYose) * uAMotion * mk * 0.18 * sin(uAT * 0.65 - row * 0.4 + ip.x * 0.07);
    P.lift += mk * 0.05 * max(0.0, wv);
    P.spear += mk * 0.1 * wv;
  }
  #endif
  // 待つ隊も止まらせない（形と数は増やさない）：槍の林は隣から隣へ揃って揺れ、後ろの列はゆっくり押し合い、
  // 旗持ちはときどき幟を振り、侍の一部は伝令として隊の横を駆けて行き来する。
  #ifdef USE_INSTANCING
  {
    vec2 ip = instanceMatrix[3].xz;
    float still = uAMotion * (1.0 - min(1.0, gait)) * (1.0 - run) * (1.0 - min(1.0, uCharge));
    if (kd == 0.0) P.spear += still * (1.0 - ranks * 0.5) * 0.075 * sin(uAT * 0.55 - ip.x * 0.16 + ip.y * 0.05);
    float press = still * (1.0 - uOrganicRanks) * (1.0 - ranks) * (1.0 - uYose) * idleFar;
    float pw = sin(uAT * 0.42 + ip.x * 0.065 + ip.y * 0.047);
    P.off.z += press * pw * 0.22;
    P.off.x += press * sin(uAT * 0.31 + ip.y * 0.08) * 0.08;
    P.tilt += press * pw * 0.02;
    P.leg += press * cos(uAT * 0.42 + ip.x * 0.065 + ip.y * 0.047) * 0.05;
    if (kd == 4.0) P.spear += still * smoothstep(0.82, 1.0, sin(T * 0.05 + sd * 29.0)) * sin(T * 2.3) * 1.3;
    if (kd == 3.0 && s2 > 0.9) {
      float go = still * idleFar * (1.0 - uYose);
      float cyc = T * (0.22 + sd * 0.06) + s2 * 61.0, at = sin(cyc), vel = cos(cyc);
      float rn = smoothstep(0.1, 0.35, abs(vel)) * go;
      float rp = sin(T * 8.5);
      P.leg = mix(P.leg, rp * 0.62, rn);
      P.lift += abs(rp) * 0.05 * rn;
      P.yaw = mix(P.yaw, uTurn * 3.14159 + (vel > 0.0 ? 1.5708 : -1.5708), rn);
      P.off.x += at * (6.0 + sd * 3.0) * go;
    }
  }
  #endif
  if (kd == 6.0) { P.lift -= 0.34; P.yaw = look * 0.5; P.off = vec3(0.0); }
  // 小者・陣夫：荷を背負って隊の後ろを行き来する（端で向きを変え、少し休んで荷を担ぎ直す）。突っ立たせない
  if (kd == 7.0) {
    float cyc = T * (0.09 + s2 * 0.05) + sd * 17.0, at = sin(cyc), vel = cos(cyc);
    float wk = smoothstep(0.12, 0.45, abs(vel)) * (1.0 - run);
    float pp = sin(T * 5.0);
    P.leg = mix(P.leg, pp * 0.36, wk);
    P.lift += abs(pp) * 0.035 * wk;
    P.fall += 0.16 * (1.0 - run) * (1.0 - down);
    P.yaw = mix(P.yaw, uTurn * 3.14159 + (1.0 - smoothstep(-0.25, 0.25, vel)) * 3.14159 + look * 0.2, 1.0 - run);
    P.off.z += at * (1.2 + sd * 1.0) * (1.0 - run) * uAMotion;
  }
  return P;
}
vec3 aApply(APose P, vec3 v, float isN) {
  float pt = aPart, kd = aInfo.y, sd = aInfo.x, pos = 1.0 - isN;
  vec3 q = v;
  // 布と横木は同じ竿を軸に回す。近くでは幅を絞り、結んだ上端と竿の側は動かさない。
  if (pt == 11.0 || pt == 12.0 || pt == 6.0) {
    float px = pt == 11.0 ? 0.0 : 0.3;
    float width = uAFlagWidth;
    #ifdef USE_INSTANCING
      mat4 wm = modelMatrix * instanceMatrix;
      width *= mix(0.78, 1.0, smoothstep(8.0, 30.0, distance(wm[3].xz, uArmyP)));
    #endif
    if (pt != 11.0 && kd == 4.0 && aInfo.w == 4.0) width *= 1.65;
    if (pt != 6.0) {
      float w = pt == 12.0 ? 0.72 : 0.34;
      float h = pt == 12.0 ? mix(2.6, 3.7, uYose) : 0.62;
      float top = pt == 12.0 ? 5.2 : 2.62;
      float k = clamp((position.x - px) / w, 0.0, 1.0);
      float t = clamp((top - position.y) / h, 0.0, 1.0);
      float amp = k * t;
      // 静かな時もひだを残す。倒れた布は風を弱め、竿ごと寝かせる。
      float wind = ${S.flagMotion ? '1.0' : '0.0'} * uGust * uAMotion * (1.0 - smoothstep(0.25, 1.2, abs(P.fall)));
      float ar = uAT * 2.7 - aWindPhase() + position.x * 6.0 + position.y * 1.5 + sd * 1.5;
      // 一本ごとに襞の位相・深さ・風に孕む膨らみ・幅を変える（同じ形の板の繰り返しに見せない）
      float vr = fract(sd * 13.7), vr2 = fract(sd * 5.3);
      float fold = position.x * (7.0 + vr * 5.0) + position.y * 2.0 + sd * 6.2832;
      float fa = 0.025 + vr2 * 0.045;
      float belly = (pt == 12.0 ? 0.05 + vr * 0.1 : 0.02 + vr * 0.04) * sin(k * 3.1416) * (0.35 + t * 0.65);
      float wave = sin(fold) * fa + sin(ar) * 0.14 * wind;
      if (pt == 12.0) width *= 0.86 + vr2 * 0.28;
      if (isN < 0.5) {
        q.z += wave * amp + belly;
        q.y -= k * k * t * t * 0.06 * (pt == 12.0 ? 1.0 : 0.3);
        q.x = px + (q.x - px) * width;
      } else {
        float dx = (cos(fold) * fa * (7.0 + vr * 5.0) + cos(ar) * 0.84 * wind) * amp + wave * t / w;
        float dy = (cos(fold) * 0.07 + cos(ar) * 0.21 * wind) * amp - wave * k / h;
        q = normalize(vec3(-dx / width, -dy, 1.0));
      }
    } else if (isN < 0.5 && q.y > 5.1) {
      q.x = px + (q.x - px) * width;
    }
    #ifdef USE_INSTANCING
      vec2 localWind = vec2(dot(normalize(wm[0].xz), uWindDir), dot(normalize(wm[2].xz), uWindDir));
      float angle = ${S.flagMotion ? '1.0' : '0.0'} * (atan(-localWind.y, localWind.x) - P.yaw) * (1.0 - smoothstep(0.25, 1.2, abs(P.fall)));
      vec3 pivot = vec3(px, 0.0, pt == 11.0 ? -0.17 : 0.14) * pos;
      q = aRotY(angle) * (q - pivot) + pivot;
    #endif
  }
  if (pt == 8.0 || pt == 9.0) {
    float a = kd == 6.0 ? -1.25 : (pt == 8.0 ? P.leg : -P.leg);
    vec3 hp = vec3(0.0, 0.82, 0.0) * pos; q = aRotX(a) * (q - hp) + hp;
  }
  if (pt == 3.0 || pt == 6.0 || pt == 12.0) {
    vec3 hp = vec3(0.3, 1.15, 0.14) * pos; vec3 r = q - hp;
    if (pt == 3.0 && isN < 0.5) r.y *= P.spLen;
    q = aRotX(P.spear * (pt == 3.0 ? 1.0 : 0.25)) * r + hp;
  }
  if (pt == 4.0) { vec3 hp = vec3(0.22, 1.1, 0.15) * pos; q = aRotX(P.spear * 0.3) * (q - hp) + hp; }
  if (pt == 21.0 || pt == 22.0) {
    vec3 hp = vec3(0.0, 1.0, q.z > 0.0 ? 0.62 : -0.62) * pos;
    q = aRotX((pt == 21.0 ? P.leg : -P.leg) * 0.8) * (q - hp) + hp;
  }
  if (pt == 23.0) { vec3 hp = vec3(0.0, 1.5, 0.72) * pos; q = aRotX(P.nod) * (q - hp) + hp; }
  q *= P.show;
  if (isN < 0.5) q.y *= P.kneel;
  q = aRotY(P.yaw) * (aRotX(P.fall) * (aRotZ(P.tilt) * q));
  // 乱戦の近い前列だけ、草鞋を据えたまま腰を運ぶ。
  // 足首ほど体の揺れを打ち消し、腿は元の動きへつなぐ。形は増やさない。
  if (P.plant > 0.001 && (pt == 8.0 || pt == 9.0)) {
    float front = pt == 8.0 ? 1.0 : 0.0;
    float pin = P.plant * (1.0 - smoothstep(0.08, 0.82, position.y));
    vec3 planted = v;
    if (isN < 0.5) {
      planted += vec3(0.0, front * P.step.y, mix(-0.22, 0.24 + P.step.x, front));
      planted -= P.foot + vec3(0.0, P.lift, 0.0);
    }
    q = mix(q, planted, pin);
  }
  if (isN < 0.5) q += vec3(0.0, P.lift, 0.0) + P.off;
  return q;
}
`;
// 通常は近い兵を隠さない。本物への置換で take した兵だけを隠す。
// 枠が尽きた軽い合戦だけ、一時的に見せない範囲を頼める。
export const ARMY_NEAR = { value: 0 };
export const ARMY_P = { value: new THREE.Vector2(1e5, 1e5) };
export const ARMY_REAL_P = { value: new THREE.Vector2(1e5, 1e5) };
export const ARMY_REAL_R = { value: 0 };
export const ARMY_REAL_NEAR = 60;
// 兵ごとに形を選ぶ隊の境（m）：x より近くは細かい形、x〜y は中ほどの形、y より先は遠い束の形
export const ARMY_SPLIT_R = { value: new THREE.Vector2(16, 44) };
const _spM = new THREE.Matrix4(), _spV = new THREE.Vector3();
// 軽い兵の束の写し（入れ物は元と同じ大きさ。形の頂点は元の物を使い回す）。sign：兵ごとに形を選ぶ印（aSplit。null は付けない）
function instTwin(m, geo, sign) {
  const n = m.instanceMatrix.count, g = new THREE.BufferGeometry(), keys = [];
  g.setIndex(geo.index);
  for (const k in geo.attributes) {
    const at = geo.attributes[k];
    if (k === 'aSplit') continue;
    if (at.isInstancedBufferAttribute) { keys.push(k); g.setAttribute(k, new THREE.InstancedBufferAttribute(new at.array.constructor(at.array.length), at.itemSize, at.normalized, at.meshPerAttribute)); } else g.setAttribute(k, at);
  }
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (sign != null) g.setAttribute('aSplit', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(sign), 1));
  g.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
  const t = new THREE.InstancedMesh(g, m.material, n);
  if (m.instanceColor) t.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceColor.array.length), 3);
  t.count = 0; t.visible = false; t.matrixAutoUpdate = false; t.frustumCulled = m.frustumCulled;
  t.castShadow = m.castShadow; t.receiveShadow = m.receiveShadow; t.renderOrder = m.renderOrder;
  t.customDepthMaterial = m.customDepthMaterial; t.customDistanceMaterial = m.customDistanceMaterial;
  t.userData.noFreeze = true; t.userData.splitTwin = true; t.userData.keys = keys;
  m.add(t);
  return t;
}
const _lodV = new THREE.Vector3();
// 軽い兵の隊で、どの兵にも使わない部品（陣笠と兜の片方・持たない得物・指物）を形から外す（シェーダーで畳んで見えない面を数えない）。
//   部品の番号（aPart）ごとの見せ方は aPose と同じ。隊の兵の種類が変わったら次の見回りで作り直す
const ARMY_TRIM_PARTS = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 13);
function armyPartMask(m) {
  const a = m.geometry.attributes.aInfo, a2 = m.geometry.attributes.aInfo2;
  if (!a || !a2 || a.itemSize !== 4 || a2.itemSize !== 2) return -1;
  const A = a.array, B = a2.array;
  let k = 0;
  for (let i = 0, n = Math.min(m.count, a.count); i < n; i++) {
    const kd = A[i * 4 + 1], hm = A[i * 4 + 2];
    if (hm < 1) k |= 1 << 1;
    if (hm > 0) k |= 1 << 2;
    if (kd === 0 || kd === 5) k |= 1 << 3; else if (kd === 1) k |= 1 << 4; else if (kd === 2) k |= 1 << 5; else if (kd === 4) k |= 1 << 6; else if (kd === 7) k |= 1 << 13;
    if (kd !== 5) k |= (1 << 8) | (1 << 9);
    if (B[i * 2] > 0) k |= (1 << 10) | (1 << 11);
    if (k === ARMY_TRIM_PARTS) break;
  }
  return k;
}
const ARMY_TRIM = new WeakMap();
function armyTrimGeo(base, mask) {
  const pa = base.attributes.aPart, idx = base.index;
  if (!pa || !idx || (mask & ARMY_TRIM_PARTS) === ARMY_TRIM_PARTS) return base;
  let byMask = ARMY_TRIM.get(base);
  if (!byMask) ARMY_TRIM.set(base, byMask = new Map());
  let g = byMask.get(mask);
  if (g) return g;
  const I = idx.array, P = pa.array, keep = [];
  for (let t = 0; t < I.length; t += 3) {
    const p = P[I[t]];
    if (p >= 0 && p < 31 && (ARMY_TRIM_PARTS >> p) & 1 && !((mask >> p) & 1)) continue;
    keep.push(I[t], I[t + 1], I[t + 2]);
  }
  if (keep.length === I.length) g = base;
  else {
    g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.setIndex(keep);
    g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;
    g.userData = base.userData;
  }
  byMask.set(mask, g);
  return g;
}
// 本物への置換ができない軽い合戦だけ、見せない輪を一時的に頼む。
const NEAR_REQ = {};
export function nearHideRequest(key, r) {
  NEAR_REQ[key] = r || 0;
  let m = 0;
  for (const v of Object.values(NEAR_REQ)) m = Math.max(m, v);
  ARMY_NEAR.value = m;
}
const ARMY_PUSH = `
 vArmyCover = 1.0;
 #ifdef USE_INSTANCING
 {
   mat4 IMw = modelMatrix * instanceMatrix; vec4 nw = IMw * vec4(AP.off.x, 0.0, AP.off.z, 1.0);
   vec2 dv = nw.xz - uArmyP; float dd = length(dv);
   // 押し出さない（押し出すと、近づくほど大軍が遠ざかって輪になる）。カメラのすぐ近くの軽い兵だけを見えなくする。
   //   近くは wake（b_nagashinojo.js）が同じ場所の軽い兵を本物の兵に替えて埋める
   //   カメラの 60m 以内も、画質に関わらず隠す（人は min(カメラ, 本人) が 60m 以内なら必ず本物。10/10 三方ヶ原の低で箱の体）
   if (dd < uArmyNear || dd < uArmyRealR || length(nw.xz - uArmyRealP) < uArmyRealR) AP.show = 0.0;
   // 遠景専用の後詰めは近景に出さない。網目の人影が実兵と重なるのを防ぐ。
   float aHN = aHost < 0.0 ? 36.0 : 48.0;
   if (aHost != 0.0 && dd < aHN) AP.show = 0.0;
   // 兵ごとに遠さで形を選ぶ隊：一人ずつの距離で、近い細かい形・中ほどの形・遠い束のどれか一つだけに描く
   if (aSplit > 1.5 ? dd < uArmySplitR.x : aSplit > 0.5 ? dd < uArmySplitR.y : aSplit < -1.5 ? (dd < uArmySplitR.x || dd >= uArmySplitR.y) : aSplit < -0.5 && dd >= uArmySplitR.x) AP.show = 0.0;
   // 近景の外でも一人ずつ徐々に間引く。体に穴を開けず、旗と槍も同じ兵ごとに残す。
   if (aHost != 0.0) vArmyCover = step(aInfo.x, smoothstep(aHN, aHN * 1.5, dd));
 }
 #endif`;
// 半透明の並べ替えを増やさず、後詰めの近い端だけを兵ごとに間引く。
function armyCover(sh) {
  sh.vertexShader = 'varying float vArmyCover;\n' + sh.vertexShader;
  sh.fragmentShader = 'varying float vArmyCover;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    if (vArmyCover < 0.5) discard;`);
}
// 画面へ：足もとを地面に合わせ、遠くは陽炎で揺らぎ（地面に近いほど強く）、後詰めは奥ほど霧の色へ沈む
const ARMY_PROJ = `vec4 aIP = vec4(transformed, 1.0), aFP = vec4(AP.off.x, 0.0, AP.off.z, 1.0);
        #ifdef USE_INSTANCING
          aIP = instanceMatrix * aIP; aFP = instanceMatrix * aFP;
        #endif
        vec4 aW = modelMatrix * aIP, aWF = modelMatrix * aFP;
        float aG = aTerrain(aWF.xz);
        aW.y += aG - aWF.y;
        vec4 mvPosition = viewMatrix * aW;
        {
          float aDist = length(mvPosition.xyz);
          float aSh = uShim * smoothstep(60.0, 220.0, aDist) * aDist * 0.0011 * (0.5 + 0.5 * smoothstep(2.5, 0.0, aW.y - aG));
          mvPosition.x += aSh * sin(uAT * 7.3 + aW.y * 5.0 + aW.x * 0.37);
          mvPosition.y += aSh * 0.5 * sin(uAT * 5.1 + aW.y * 4.0 + aW.z * 0.41);
          // 軽い兵も奥へ行くほど霞の色へなじませ、黒い点の列にしない（なじませすぎると奥の大軍が消えるので浅く）。
          // 足元の湿った空気へなじませ、頭・槍先の輪郭は残す。
          vAHz = (max(abs(aHost) * 0.30, aHost < 0.0 ? 0.10 : 0.17) + uOrganicRanks * 0.10
            * (1.0 - smoothstep(0.2, 2.4, aW.y - aG))) * smoothstep(35.0, 140.0, aDist);
        }
        gl_Position = projectionMatrix * mvPosition;`;
// 陽炎の強さ（晴れて乾いた昼ほど強い。World.update が決める）
const SHIMMER = { value: 0.6 };
// 描く直前に、軽い兵を隠す輪の中心を「いま描いているカメラ」に合わせる（humans.js は戦の進みの中でしか写さないので、
// 写真の自由なカメラ・止めている間・開戦の前でも、目の前に棒人間を出さないように）。上から見る平らなカメラ（地図など）は除く
function armyCam(mat) {
  mat.onBeforeRender = (r, s, cam) => { if (cam && cam.isPerspectiveCamera) ARMY_P.value.set(cam.position.x, cam.position.z); };
}
const ARMY_MOTION = { value: 1 };
// 穂先だけ日差しを返す。別の光源や粒を足さず、暗い戦では光らせない。
function armySteel(sh) {
  sh.fragmentShader = 'varying float vASteel;\n' + sh.fragmentShader
    .replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 + vASteel * 1.1;\n#include <opaque_fragment>');
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vASteel = 0.0;
    if (aPart == 3.0 && position.y > 4.25) {
      vec3 steelN = objectNormal;
      #ifdef USE_INSTANCING
        steelN = mat3(instanceMatrix) * steelN;
      #endif
      vASteel = pow(max(0.0, dot(normalize(normalMatrix * steelN), normalize(vec3(0.35, 0.7, 0.6)))), 12.0);
    }`);
}
function armyShader(mat, U) {
  armyCam(mat);
  U.uFieldRanks ||= { value: 0 };
  U.uOrganicRanks ||= { value: 0 };
  U.uTerrainTriangles ||= { value: 0 };
  mat.userData.armyU = U;   // 本物の兵に替わる輪の広さ（lodTick が、隊が丸ごと輪の内に入ったかを見る）
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uYose: U.uYose || { value: 0 }, uUnavailable: U.uUnavailable || { value: 0 }, uMoveLim: U.uMoveLim || { value: 176 }, uArmyNear: U.uNear || ARMY_NEAR, uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uArmySplitR: U.uSplitR || ARMY_SPLIT_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
    sh.fragmentShader = 'varying float vAHz;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, vAHz);
      #endif`);
    sh.vertexShader = 'uniform float uArmyNear, uUnavailable, uMoveLim, uArmyRealR; uniform vec2 uArmyP, uArmyRealP;\n' + ARMY_GLSL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 APose AP = aPose();${ARMY_PUSH}
 if (uUnavailable > 0.5 && max(abs((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).x), abs((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z)) < uMoveLim + 40.0) AP.show = 0.0;
 objectNormal = normalize(aApply(AP, objectNormal, 1.0) + vec3(0.0, 1e-4, 0.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = aApply(AP, transformed, 0.0);\n vAFT = (aPart == 11.0 || aPart == 12.0) ? 0.84 + 0.18 * fract(aInfo.x * 41.3) : 1.0;')
      .replace('#include <project_vertex>', ARMY_PROJ);
    // 旗の布：一本ごとの褪せの差と、裏は染めが透けて暗い
    sh.vertexShader = 'varying float vAFT;\n' + sh.vertexShader;
    sh.fragmentShader = 'varying float vAFT;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= vAFT * (gl_FrontFacing || vAFT == 1.0 ? 1.0 : 0.8);`);
    armyCover(sh);
    armySteel(sh);
  };
  return mat;
}

// ---------------- 軽い大軍の合戦（前線どうしのぶつかり合い） ----------------
// 兵を一人ずつ計算せず、幅 6m ほどの「塊」ごとに、前線の位置・討たれた数・崩れを持つ。動きは形の側（頂点）で：
// 前の列は槍を振り上げては叩き下ろし、押し合って前後する。討たれた者は倒れ姿を残し、列が減れば後ろの列が詰める
// uBlk[塊]：x 前線のずれ（m、A の向きへ）・z 討たれた数・w 崩れてからの秒（0 は崩れていない）
// uBlk2[塊]：x 打ち合いの強さ・y 歩き・z 一列の人数・w 隠す（本物の兵に置き換えた塊）
// aClash：x 塊の番号・y 塊の中の順番（前の列から討たれる）・z 列（0 が一番前）・w 亡骸は 1、倒れる途中は 2＋討死の時刻
const CLASH_NB = 40, CLASH_ROW = 1.15;
// 合戦の矢を並べる計算の入れ物（毎コマ new しない）
const _caM4 = new THREE.Matrix4(), _caQ = new THREE.Quaternion(), _caP = new THREE.Vector3(), _caD = new THREE.Vector3(), _caS = new THREE.Vector3(1, 1, 1), _caZ = new THREE.Vector3(0, 0, 1);
// （元の形の uMarch・uCharge は、塊ごとに変わるので、ここでは cInit で決める値にする）
const CLASH_GLSL = ARMY_GLSL.replace(/uMarch, uCharge, /, '').replace('attribute float aPart;', `attribute float aPart;
uniform vec4 uBlk[${CLASH_NB}], uBlk2[${CLASH_NB}]; uniform float uSide, uApp, uAppM, uAppC, uNearHide, uMeasuredMelee;
attribute vec4 aClash;
float uMarch, uCharge, cRt, cFight, cHide, cPress; vec3 cOff;
void cInit(float sd) {
  int j = int(aClash.x + 0.5);
  vec4 B = uBlk[j], B2 = uBlk2[j];
  cOff = vec3(0.0); cFight = 0.0; cPress = 0.0; cHide = 0.0; cRt = 0.0; uMarch = 0.0; uCharge = 0.0;
  if (aClash.w > 0.5) return;
  float kc = B.z / max(1.0, B2.z), fr = floor(kc), row = aClash.z;
  cHide = max(B2.w, step(aClash.y + 0.5, B.z));
  // 前の列が減るほど、後ろの列が前へ詰める
  float sh = row <= fr + 0.5 ? fr : kc;
  cOff = vec3(0.0, 0.0, uSide * B.x + sh * ${CLASH_ROW.toFixed(2)} + uApp);
  // 列ごとの直線を崩す。兵数と討死の抽選は変えず、同じ種から位置だけをずらす。
  float disorder = B2.x * (1.0 - smoothstep(fr + 2.0, fr + 5.0, row));
  // 接敵中だけ後列を半歩詰める。横幅・人数・討死と実兵の判定は保つ。
  cOff.z += disorder * min(0.85, max(0.0, row - fr) * 0.32);
  cOff.x += disorder * (fract(sd * 19.73) - 0.5) * 0.62;
  cOff.z += disorder * (fract(sd * 31.17) - 0.5) * 0.74;
  // 乱戦：前の二列は相手の列の中へ踏み込み、横へもばらける（両軍の境が崩れて入り混じる）。B.y がその強さ
  float mixF = B.y * (1.0 - smoothstep(fr + 1.5, fr + 2.6, row));
  cOff.z += mixF * (0.8 + 2.2 * fract(sd * 7.31));
  cOff.x += mixF * 1.1 * (fract(sd * 3.77) - 0.5) * 2.0;
  cRt = B.w > 0.0 ? max(0.0, B.w - sd * 1.6) : 0.0;
  cFight = B2.x * (1.0 - smoothstep(fr + 1.5, fr + 3.0, row));
  cPress = B2.x - cFight;
  uMarch = max(B2.y, uAppM);
  uCharge = max(cFight * 0.85, uAppC);
}`).replace('float rt = uRout * max(0.0, uRoutT - sd * 1.6);', 'cInit(sd); float rt = cRt;') + `
// 攻守の拍子は近景と遠景で共用。後列ほど遅れ、相手側は半周後に押し返す。
float cCycle(float sd) {
  return fract(uAT / (2.35 + fract(aClash.x * 0.731) * 0.55)
    + aClash.x * 0.173 - aClash.z * 0.09
    + (sd - 0.5) * 0.62 + (uSide < 0.0 ? 0.5 : 0.0));
}
void cPose(inout APose P) {
  float sd = aInfo.x, T = uAT + sd * 97.0;
  P.off += cOff;
  // 前線の圧が後列へ遅れて届く。両軍を同じ方向へ動かし、間に穴を作らない。
  if (aClash.w < 0.5 && P.run < 0.5) {
    // 前列の打ち込みと同じ時計で後列が踏ん張る。列ごとの遅れだけ残す。
    float pressWave = sin((uAT / (2.35 + fract(aClash.x * 0.731) * 0.55)
      + aClash.x * 0.173) * 6.283185 - aClash.z * 0.38);
    float pressure = (cFight + cPress) * uAMotion;
    P.off.z += uSide * pressure * 0.48 * pressWave;
    // 同じ列へ届く圧で腰を落として槍を送り返す。足の位置や討死の抽選は変えない。
    float brace = pressure * (0.5 + 0.5 * pressWave);
    P.tilt += pressure * 0.025 * pressWave + brace * 0.075;
    P.lift -= brace * 0.055;
    P.spear += pressure * 0.08 * pressWave + brace * 0.06;
  }
  if (cHide > 0.5) P.show = 0.0;
  // カメラの近くの者は、輪の外へ押し出す（近くでは箱に見えるので。内は本物の兵が受け持つ。消して空にはしない）
  if (aClash.w > 0.5) {
    // 倒れた者：うつ伏せか仰向け。向きはばらばら
    P.fall = aInfo2.y > 0.5 ? 1.5 : -1.45; P.yaw = sd * 6.2832; P.off = vec3(0.0); P.leg = 0.0; P.lift = 0.16;
    P.tilt = (aInfo2.y - 0.5) * 0.5; P.spear = 1.3; P.kneel = 1.0; P.nod = 0.0;
    if (uMeasuredMelee > 0.5) {
      // 膝が折れてから重さで倒れる。両方の倒れ方で、記録した死亡時刻から続ける。
      float deathAt = aClash.w >= 2.0 ? aClash.w - 2.0 : aClash.y;
      float age = max(0.0, uAT - deathAt);
      float knee = smoothstep(0.0, 0.24, age);
      float drop = clamp((age - 0.18) / (0.58 + sd * 0.2), 0.0, 1.0);
      drop *= drop;
      P.fall *= drop; P.yaw = (sd - 0.5) * 0.3 * drop;
      P.tilt *= drop; P.spear = mix(1.1, 1.3, drop);
      P.kneel = 1.0 - 0.55 * knee * (1.0 - drop);
      P.lift = 0.16 * drop - 0.22 * knee * (1.0 - drop);
    } else if (aClash.w >= 2.0) {
      // 膝が抜けてから重さで倒れ、地面に着いた姿へ続ける。兵ごとに速さを変える。
      float age = max(0.0, uAT - (aClash.w - 2.0));
      float knee = smoothstep(0.0, 0.25 + sd * 0.15, age);
      float drop = clamp((age - 0.18) / (0.48 + sd * 0.24), 0.0, 1.0);
      drop *= drop;
      P.fall *= drop; P.kneel = knee; P.lift *= drop; P.yaw *= drop;
      P.spear = mix(0.5, P.spear, drop); P.tilt *= drop;
    }
    return;
  }
  if (cFight > 0.01 && P.run < 0.5) {
    float f = cFight * uAMotion;
    float cycle = cCycle(sd);
    float melee = aInfo.y == 0.0 || aInfo.y == 3.0 ? 1.0 : 0.0;
    float detail = 1.0;
    #ifdef USE_INSTANCING
      detail = 1.0 - smoothstep(38.0, 60.0, distance((modelMatrix * instanceMatrix[3]).xz, uArmyP));
    #endif
    if (detail > 0.001) {
      vec3 footBase = P.off;
      // 個々の横揺れと、隣の列から伝わる押し返しを攻守の動きに重ねる。
      P.off.x += f * detail * 0.12 * sin(T * 0.9 + sd * 17.0);
      P.tilt += f * detail * 0.08 * sin(T * 1.3 + sd * 5.0);
      if (uMeasuredMelee > 0.5) {
        // 両軍の同じ組へ圧が届き、後列ほど遅れる。個人の時計では列がばらばらに揺れる。
        float heave = sin(uAT * 1.6 - aClash.x * 0.7 - aClash.z * 0.5 + sd * 0.35);
        float heaveWeight = f * detail * (0.82 + sd * 0.18);
        P.off.z += heaveWeight * heave * 0.16 * uSide;
        P.tilt += heaveWeight * heave * 0.07;
        P.spear += heaveWeight * heave * 0.09;
      }
      // 塊ごとに攻守を交代。両軍の拍子を半周ずらし、受けてから突き返す。
      // 塊ごとの速さは敵味方で共通にし、個々の拍子と打ち筋をずらす。
      // 小さな個人差と列の遅れは保ち、一斉の体操にしない。
      // 兵同士の探索は増やさず、種から突き・叩き・柄の押し返しを選ぶ。
      float style = fract(sd * 43.71);
      float beat = step(0.55, style) * (1.0 - step(0.82, style));
      float bind = step(0.82, style);
      float side = sd > 0.5 ? 1.0 : -1.0;
      float windup = smoothstep(0.02, 0.13, cycle) * (1.0 - smoothstep(0.16, 0.25, cycle));
      float strike = smoothstep(0.16, 0.25, cycle) * (1.0 - smoothstep(0.29, 0.46, cycle));
      float settle = smoothstep(0.29, 0.40, cycle) * (1.0 - smoothstep(0.46, 0.56, cycle));
      float receive = smoothstep(0.59, 0.68, cycle) * (1.0 - smoothstep(0.74, 0.94, cycle));
      float weight = f * detail * melee;
      // 打つ直前だけ前足を半歩運び、打ち込みと受けの間は両足を据える。
      // 槍の時計を共用し、戻す足も地面の上を滑らせず短く持ち上げる。
      float advance = smoothstep(0.06, 0.16, cycle);
      float recover = smoothstep(0.46, 0.58, cycle);
      P.plant = weight * (1.0 - smoothstep(0.25, 0.8, uMarch));
      P.step = vec2(0.18 * (advance - recover),
        0.16 * (advance * (1.0 - advance) + recover * (1.0 - recover)));
      // 叩く兵は穂先を上げて振り下ろし、柄で押す兵は短く半身で踏ん張る。
      // 溜め→踏み込み→沈んで止める順にし、毎回直立へ跳ね戻らない。
      P.spear = mix(P.spear, 1.16 - (0.16 + beat * 0.6) * windup
        + (0.3 + beat * 0.18 - bind * 0.17) * strike - 0.34 * receive
        + (sd - 0.5) * 0.12, weight);
      P.off.z += weight * (-0.10 * windup + (0.38 - beat * 0.14 - bind * 0.12) * strike
        + 0.10 * settle - 0.24 * receive);
      P.off.x += weight * side * (0.18 * receive + bind * 0.12 * strike);
      P.fall += weight * (-0.045 * windup + (0.13 + beat * 0.07) * strike + 0.045 * settle - 0.08 * receive);
      P.yaw = mix(P.yaw, (sd - 0.5) * (0.22 + 0.25 * receive)
        + side * ((0.08 + bind * 0.16) * windup - (0.10 + bind * 0.18) * strike), weight);
      P.leg = mix(P.leg, 0.18 - 0.10 * windup + 0.24 * strike + 0.08 * settle - 0.15 * receive, weight);
      P.lift -= weight * (0.025 + 0.035 * windup + 0.04 * settle + 0.055 * receive);
      P.kneel = mix(P.kneel, 1.0 - 0.035 * windup - 0.04 * settle - 0.06 * receive, weight);
      // 受け流す者と、押し負けて半歩引く者を混ぜる。兵数や戦闘判定は変えない。
      float recoil = smoothstep(0.68, 0.94, style) * receive * weight;
      P.off.z -= recoil * 0.36;
      P.off.x += recoil * side * 0.25;
      P.yaw += recoil * side * 0.38;
      P.fall -= recoil * 0.13;
      P.kneel *= 1.0 - recoil * 0.09;
      // 鉄砲・弓・旗持ちには槍の突きを付けない。
      P.kneel = mix(P.kneel, 0.75, f * detail * (1.0 - melee) * step(aInfo.y, 1.0));
      // 個人の踏み込みだけを足から差し引く。前線全体の押し引きは残す。
      P.foot = P.off - footBase;
    }
    if (detail < 0.999) {
      // 遠い前線も、槍だけを揺らさず腰と足を伴って突き、相手の突きには沈んで受ける。
      // 波は一つだけ。短い踏み込みと長い戻しに分け、近い姿との境でも同じ攻守を続ける。
      float beat = sin(cycle * 6.283185);
      float drive = max(0.0, beat), receive = max(0.0, -beat);
      drive *= drive;
      float weight = f * (1.0 - detail) * melee;
      P.spear = mix(P.spear, 1.16 + 0.34 * drive - 0.34 * receive, weight);
      P.off.z += weight * (0.38 * drive - 0.24 * receive);
      P.fall += weight * (0.16 * drive - 0.08 * receive);
      P.leg = mix(P.leg, 0.18 + 0.24 * drive - 0.15 * receive, weight);
      P.lift -= weight * (0.025 + 0.055 * receive);
      P.kneel = mix(P.kneel, 1.0 - 0.06 * receive, weight);
    }
  }
  if (cPress > 0.01 && P.run < 0.5) {
    // 後列は前線と同じ拍子を遅れて受ける。別々の五つの揺れを一つにまとめる。
    float q = cPress * uAMotion, beat = sin(cCycle(sd) * 6.283185);
    float press = max(0.0, beat), brace = max(0.0, -beat);
    P.off.z += q * (0.24 * press - 0.14 * brace + 0.06);
    P.off.x += q * (sd - 0.5) * 0.10 * brace;
    P.fall += q * (0.09 * press - 0.04 * brace);
    P.spear += q * 0.14 * beat * (aInfo.y == 0.0 || aInfo.y == 3.0 ? 1.0 : 0.0);
    // 後列の全員が槍を直立させない。前を支える低い穂先と、頭越しの構えを混ぜる。
    if (aInfo.y == 0.0) {
      float ready = 0.48 + fract(sd * 23.17) * 0.48;
      P.spear = mix(P.spear, ready + 0.16 * press - 0.10 * brace, q);
      P.yaw += q * (fract(sd * 17.31) - 0.5) * 0.28;
    }
    P.leg = mix(P.leg, 0.14 + 0.16 * press - 0.08 * brace, q);
    P.lift -= q * 0.035 * brace;
  }
}
`;
function clashShader(mat, U) {
  armyCam(mat);
  U.uOrganicRanks ||= { value: 0 };
  mat.userData.armyU = U;
  mat.onBeforeCompile = (sh) => {
    if (mat.map) flagMoonlight(sh);
    sh.uniforms.uAFlagWidth = { value: mat.map?.userData.mon === 'hachisuka' || mat.map?.userData.mon === 'yose_hachisuka' ? 0.65 : 1 };
    Object.assign(sh.uniforms, U, { uArmyP: ARMY_P, uArmyRealP: ARMY_REAL_P, uArmyRealR: U.uRealNear || ARMY_REAL_R, uArmySplitR: U.uSplitR || ARMY_SPLIT_R, uShim: SHIMMER, uAMotion: ARMY_MOTION, uWindDir: WIND_DIR });
    sh.vertexShader = 'uniform vec2 uArmyRealP; uniform float uArmyRealR; uniform vec2 uArmyP;\n' + CLASH_GLSL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 APose AP = aPose(); cPose(AP);${ARMY_PUSH.replace(/uArmyNear/g, 'uNearHide')}
 objectNormal = normalize(aApply(AP, objectNormal, 1.0) + vec3(0.0, 1e-4, 0.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = aApply(AP, transformed, 0.0);\n vAFT = (aPart == 11.0 || aPart == 12.0) ? 0.84 + 0.18 * fract(aInfo.x * 41.3) : 1.0;')
      .replace('#include <project_vertex>', ARMY_PROJ);
    // 旗の布：一本ごとの褪せの差と、裏は染めが透けて暗い
    sh.vertexShader = 'varying float vAFT;\n' + sh.vertexShader;
    sh.fragmentShader = 'varying float vAFT;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= vAFT * (gl_FrontFacing || vAFT == 1.0 ? 1.0 : 0.8);`);
    armyCover(sh);
    armySteel(sh);
  };
  return mat;
}


export { armyShader, CLASH_NB, CLASH_ROW, clashShader, NEAR_REQ, _caM4, _caQ, _caP, _caD, _caS, _caZ, _lodV, armyPartMask, armyTrimGeo, instTwin, ARMY_MOTION, SHIMMER };
