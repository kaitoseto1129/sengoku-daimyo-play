import * as THREE from 'three';
import { rng } from './world_common.js';
import { skyPhotoKey, loadSkyPhoto } from './sky_photo.js';

// 空の映り込み（漆や鉄に空が映る）を作るために、描画器を借りる
let RENDERER = null;
export function setRenderer(r) { RENDERER = r; }
export function hasMultiDraw() { return !!RENDERER?.extensions?.has('WEBGL_multi_draw'); }


export class WorldSky {

  buildSky() {
    // 空：地平から天頂への色、太陽と光の輪、ゆっくり流れる雲（雑音を重ねて作る）
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x6a88a8) }, bottom: { value: new THREE.Color(0xa9b7bd) }, glow: { value: new THREE.Color(0xff9a50) }, glowK: { value: 0 }, flash: { value: 0 },
        sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) }, sunCol: { value: new THREE.Color(0xfff0d8) }, time: { value: 0 }, cover: { value: 0.4 }, cloudDark: { value: 0.1 }, pall: { value: 0 },
        rain: { value: 0 }, age: { value: 0 },
        cloudTime: { value: 0 }, cloudShift: { value: new THREE.Vector2() }, lowDetail: { value: 0 },
        tPhoto: { value: null }, photoK: { value: 0 }, photoSun: { value: 0.6 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, bottom, glow, sunCol, sunDir; uniform vec2 cloudShift; uniform float glowK, flash, time, cover, cloudDark, pall, rain, age, cloudTime, lowDetail, photoK, photoSun; uniform sampler2D tPhoto; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        // 低でも雲の大きな形と縁は残す。細かい三段だけ省き、濃さをそろえる
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { if (lowDetail > 0.5 && k >= 2) break; v += a * n(p); p *= 2.03; a *= 0.5; } return v * mix(1.0, 0.96875 / 0.75, lowDetail); }
        float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 3; k++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v / 0.875; }
        void main(){
          vec3 d = normalize(vP);
          // 雨の日は雲が空を覆い、暗く重い
          float cov = clamp(max(cover, rain * 0.9), 0.0, 0.97), cdk = max(cloudDark, rain * 0.5);
          float hgt = clamp(d.y * 1.5 + 0.04, 0.0, 1.0);
          // 地平の霞から中空の灰青、天頂の深い青へ。新しい雑音は足さない。
          vec3 middle = mix(bottom, top, 0.55) * vec3(0.97, 0.99, 1.02);
          vec3 c = mix(bottom, middle, smoothstep(0.0, 0.42, hgt));
          c = mix(c, top, smoothstep(0.18, 1.0, hgt));
          float sd = max(0.0, dot(d, normalize(sunDir)));
          // 夜は月の淡い輪だけ。雲も空の明るさを受け、昼の白い雲にならない
          float skyLight = dot(top, vec3(0.2126, 0.7152, 0.0722));
          float daylight = smoothstep(0.015, 0.1, skyLight);
          float cloudLight = clamp(skyLight * 5.0, 0.035, 1.0);
          c += sunCol * (pow(sd, 8.0) * 0.1 + pow(sd, 64.0) * 0.22) * (1.0 - cov * 0.6) * mix(0.12, 1.0, daylight);
          c += sunCol * smoothstep(0.9993, 0.9997, sd) * 1.2 * (1.0 - cov) * daylight;
          // 朝焼け・夕焼け：日の沈む（昇る）方の地平は橙、その少し上は薔薇色、天頂は紫がかった藍。
          // 日と反対の地平すれすれは地球の影の青で、その上に薄紅の帯。夕暮れは時が経つほど（age）橙から紅へ
          float toSun = max(0.0, dot(normalize(d.xz + 0.0001), normalize(sunDir.xz + 0.0001)));
          float low = 1.0 - smoothstep(0.0, 0.35, normalize(sunDir).y), anti = 1.0 - toSun;
          vec3 gl2 = mix(glow, glow * vec3(1.05, 0.6, 0.55), age);
          c += gl2 * glowK * exp(-abs(d.y) * 7.0) * (0.25 + 0.75 * toSun * toSun);
          c += vec3(0.95, 0.55, 0.62) * glowK * low * exp(-pow((d.y - 0.15) * 6.0, 2.0)) * (0.08 + 0.22 * toSun) * (1.0 - cov * 0.5);
          c = mix(c, c * vec3(0.78, 0.84, 1.0), glowK * low * anti * exp(-abs(d.y) * 12.0) * 0.55);
          c += vec3(0.5, 0.3, 0.38) * glowK * low * anti * exp(-pow((d.y - 0.1) * 9.0, 2.0)) * 0.2 * (1.0 - cov * 0.5);
          c = mix(c, c * vec3(1.02, 0.93, 1.1), glowK * smoothstep(0.15, 0.9, d.y) * 0.5);
          // 雲（写真）：CC0 の空の写真から雲の濃淡の比だけを借り、今の空の色に掛ける。日の位置は写真の日を今の日へ回して合わせる
          if (d.y > 0.0 && photoK > 0.0) {
            float az = atan(d.z, d.x) - atan(sunDir.z, sunDir.x);
            vec2 puv = vec2(fract(az * 0.15915494 + photoSun + cloudTime * 0.00002), clamp(asin(clamp(d.y, 0.0, 1.0)) * 0.63661977, 0.004, 0.996));
            vec3 pr = texture2D(tPhoto, puv).rgb;
            pr = pr * pr * 4.0;
            // 夜と雨は濃淡を控えめに（暗い空に白い雲の板を浮かせない）
            float nk2 = 1.0 - smoothstep(0.015, 0.1, dot(top, vec3(0.2126, 0.7152, 0.0722)));
            pr = mix(vec3(1.0), pr, mix(0.85, 0.55, max(nk2, rain)));
            c = mix(c, c * pr, smoothstep(0.0, 0.1, d.y) * photoK);
          }
          // 雲：空の丸天井に投影した雑音（写真が無い時だけ）
          if (d.y > 0.0 && photoK < 0.5) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.3 - cloudShift;
            // 形を少し歪めて、もくもくした塊に。歪みはゆっくり別に動くので、雲は流れながら形を変える
            vec2 warp;
            if (lowDetail > 0.5) warp = vec2(n(uv * 0.7 + 3.1 + cloudTime * 0.002));
            else warp = vec2(fbm3(uv * 0.7 + 3.1 + cloudTime * 0.002), fbm3(uv * 0.7 - 1.7));
            // 低い日は横に伸びた雲、雨は大きく重なる雲。雑音の回数は増やさない。
            vec2 uvw = uv * mix(vec2(1.0), vec2(0.7, 1.65), glowK * (1.0 - rain))
              + (warp - 0.5) * mix(0.9, 0.45, max(rain, cov - 0.4));
            float cl = fbm(uvw * 1.4);
            float dens = smoothstep(1.0 - cov - 0.1, 1.0 - cov + 0.25, cl);
            // 厚み：日の方へ少しずらした所の濃さとの差で、日の当たる縁と陰になった腹を分ける
            float cl2;
            if (lowDetail > 0.5) cl2 = cl - (n(uvw * 2.8 + normalize(sunDir.xz + 0.0001) * 0.16) - 0.5) * 0.08;
            else cl2 = fbm(uvw * 1.4 + normalize(sunDir.xz + 0.0001) * 0.12);
            float lit = clamp(0.8 + (cl - cl2) * 2.4, 0.0, 1.2) - cdk;
            vec3 ccol = mix(vec3(0.6, 0.62, 0.65), vec3(1.0, 0.98, 0.95), clamp(lit, 0.0, 1.0)) * mix(vec3(1.0), sunCol, 0.25);
            // 日が低い時は、雲の底が焼けて橙・紅に染まる（日の方ほど濃い）
            ccol = mix(ccol, ccol * 0.5 + gl2 * 0.95, glowK * low * (0.3 + 0.7 * toSun) * smoothstep(0.2, 0.9, dens) * (1.0 - cdk));
            float fade = smoothstep(0.0, 0.18, d.y);
            // 日の近くの雲は、薄い縁ほど光を通して白く輝く（雲の銀の縁）
            ccol += sunCol * pow(sd, 5.0) * (1.0 - smoothstep(0.2, 0.9, dens)) * 0.3 * (1.0 - cdk);
            // 雲の厚み：濃い所ほど底が暗く（雲の腹の影）、縁は明るい
            float belly = smoothstep(0.35, 0.95, dens) * (0.22 + cdk * 0.3);
            ccol *= 1.0 - belly * (1.0 - pow(sd, 3.0) * 0.6);
            // 曇天（雨）と夜：雲は空の地の色から大きく離れない。暗い雲の板が地平の上に垂れて「洞窟の天井」や逆さの山に見えないよう、
            // 地平へ向かってなだらかに霞へ溶かし、濃淡だけを残す
            float rk = clamp(max(rain, cov - 0.6) * 1.6, 0.0, 1.0), nk = 1.0 - daylight;
            vec3 cc = ccol * mix(0.55 + hgt * 0.55, 0.95, rk) * cloudLight;
            cc = mix(cc, c * (0.84 + 0.26 * clamp(lit, 0.0, 1.0)), max(rk * 0.72, nk * 0.8));
            c = mix(c, cc, dens * mix(fade, smoothstep(-0.05, 0.55, d.y), max(rk, nk)) * 0.92);
            // 高い所の薄い筋雲（ゆっくり、別の向きに流れる）。低い雲の隙間に見える
            vec2 uv2 = d.xz / (d.y + 0.05) * 0.55 - cloudShift * 0.35 + vec2(cloudTime * 0.0004, -cloudTime * 0.0003);
            // 高い薄雲は三段で十分。空一面の雑音計算を減らして光と煙の調整分を抑える。
            float thin = lowDetail > 0.5 ? n(uv2 * vec2(2.4, 0.7)) : fbm3(uv2 * vec2(2.4, 0.7));
            float ci = smoothstep(0.55, 0.85, thin) * (1.0 - dens) * fade * (1.0 - cov * 0.8);
            c = mix(c, mix(vec3(1.0), sunCol, 0.3) * (0.9 + pow(sd, 4.0) * 0.3) * cloudLight, ci * 0.35);
          }
          // 大きな火の煙の帳：空が茶色く濁り、日が陰る（上の方ほど濃い）
          c = mix(c, dot(c, vec3(0.3, 0.55, 0.15)) * vec3(0.92, 0.74, 0.56), pall * (0.45 + 0.4 * hgt));
          // 雨の日：空は暗く沈み、遠くの地平には斜めに垂れる灰色の雨脚
          if (rain > 0.01) {
            float sx = atan(d.x, d.z) * 38.0 + d.y * 22.0;
            float cur = n(vec2(sx, time * 0.04)) * n(vec2(sx * 0.27 + 5.0, time * 0.01));
            c = mix(c, bottom * 0.78, rain * smoothstep(0.3, 0.75, cur) * exp(-max(d.y, 0.0) * 8.0) * 0.55);
            c *= 1.0 - rain * 0.2;
          }
          c += vec3(0.8, 0.85, 1.0) * flash;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), this.skyMat);
    this.sky.scale.setScalar(0.2); // 空・星・月も描画距離の内へ収め、角度と色は保つ。
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    // 星：空の球の内側に小さな光の点を散らす（霧に沈まない。空と一緒に動く）。月：淡い光の丸
    {
      const N = 900, pos = new Float32Array(N * 3), R = rng(909);
      for (let i = 0; i < N; i++) {
        const u = 0.08 + R() * 0.92, a = R() * Math.PI * 2, r = 440, h = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(a) * h * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * h * r;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6f4, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
      this.stars.renderOrder = -1; this.stars.visible = false; this.stars.frustumCulled = false;
      this.sky.add(this.stars);
      const mc = document.createElement('canvas'); mc.width = mc.height = 64;
      const mg = mc.getContext('2d'), gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(240,244,255,1)'); gr.addColorStop(0.28, 'rgba(230,236,250,0.95)'); gr.addColorStop(0.36, 'rgba(180,196,230,0.25)'); gr.addColorStop(1, 'rgba(120,140,190,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64);
      this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, transparent: true, depthWrite: false }));
      this.moon.scale.setScalar(46); this.moon.visible = false; this.moon.renderOrder = -1;
      this.sky.add(this.moon);
    }
    // 遠くの山並み：三重に重ね、遠いほど霞ませる。山肌には杉林の筋と雑木の斑、近い山の裾には棚田
    const M = rng(this.def.seed || 5);
    this.mountMats = [];
    this.mountains = new THREE.Group();
    this.mountU = { skyCol: this.skyMat.uniforms.top, highDetail: { value: 1}, hazeCol: { value: new THREE.Color() }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol, glow: this.skyMat.uniforms.glow, glowK: this.skyMat.uniforms.glowK, mist: { value: 0 }, vis: { value: 500 }, rain: { value: 0 }, night: this.nightU };
    // 一番奥の峰は高く（峰で 150m ほど）、稜線を細かく刻んで、平たい丘の輪に見えないように
    (this.nearView ? [] : [[330, 28, 1.0], [385, 62, 0.75], [440, 118, 0.6]]).forEach(([rad, H, sharp], layer) => {
      const low = false;
      const N = layer === 2 ? (low ? 240 : 480) : (low ? 120 : 240), ROWS = low ? 3 : 5, pos = [], uv = [], crest = [], idx = [];
      const ph = M() * 10, ph2 = M() * 10, ph3 = M() * 10;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // 広い谷と片寄った峰を作り、同じ幅の山が並ぶ周期を崩す。端は閉じる。
        const bend = a + Math.sin(a * 2 + ph3) * 0.23 + Math.sin(a * 3 + ph3) * 0.11 + Math.sin(a * 7 + ph2) * 0.035;
        const massif = 0.78 + Math.sin(a * 2 + ph2) * 0.17 + Math.cos(a * 3 + ph) * 0.12;
        // 谷底を丸め、遠い層ほど細かな刻みを抑える。頂点数を増やさず鋸歯状の書き割りを避ける。
        const roll = (v) => Math.sqrt(Math.sin(v) ** 2 + 0.025) - 0.04;
        let ridge = roll(bend * 5 + ph) * 0.5 + roll(bend * 11 + ph2) * 0.3 * sharp + Math.sin(a * 23 + ph) * 0.07 * sharp + Math.sin(a * 47 + ph2) * 0.018 * sharp + Math.sin(a * 83 + ph3) * 0.009 * sharp * sharp;
        // 奥の峰：高い峰がところどころに立ち、稜線に小さな凸凹（岩と木の刻み）
        if (layer === 2) ridge = ridge * 0.7 + Math.pow(Math.abs(Math.sin(a * 3 + ph3)), 3) * 0.45;
        const hh = (H * (0.25 + ridge * massif) - layer * 4) * (this.def.mountainScale ?? 1);
        const spur = Math.sin(bend * 19 + ph2) * 0.65 + Math.sin(bend * 31 + ph3) * 0.35;
        for (let r = 0; r <= ROWS; r++) {
          // 頂点数を増やさず、裾から峰へ奥行きを付ける。角度の周期を閉じ、継ぎ目も割らない。
          const base = this.def.mountainBase ?? -12;
          const f = r / ROWS, belly = Math.sin(Math.PI * f);
          // 同じ頂点を尾根では手前へ、沢では奥へ振る。裾と頂は固定し、中腹に厚みを持たせる。
          const y = base + (hh - base) * (Math.pow(f, 0.85) + spur * belly * 0.1);
          const rr = rad - (48 + H * 0.22) * (1 - f) + Math.sin(a * 9 + ph2) * 12 * f
            + (Math.sin(a * 17 + ph3) * 14 + Math.sin(a * 7 + ph) * 18) * f * (1 - f) - spur * belly * (18 + H * 0.12);
          pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
          uv.push(a * rad, y); crest.push(f);
          if (i < N && r < ROWS) { const k = i * (ROWS + 1) + r, k2 = k + ROWS + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
        }
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      mg.setAttribute('crest', new THREE.Float32BufferAttribute(crest, 1));
      mg.setIndex(idx);
      mg.computeVertexNormals();
      // 円周の両端は同じ場所。法線も合わせ、山肌に一本の継ぎ目を残さない。
      const normals = mg.attributes.normal;
      for (let r = 0; r <= ROWS; r++) {
        const end = N * (ROWS + 1) + r;
        const nx = normals.getX(r) + normals.getX(end), ny = normals.getY(r) + normals.getY(end), nz = normals.getZ(r) + normals.getZ(end);
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.setXYZ(r, nx / len, ny / len, nz / len); normals.setXYZ(end, nx / len, ny / len, nz / len);
      }
      const mat = new THREE.ShaderMaterial({
        fog: false, side: THREE.DoubleSide, transparent: true, depthWrite: false,
        uniforms: { ...this.mountU, color: { value: new THREE.Color(0x33443e) }, haze: { value: this.def.mountainHaze ?? 0.5 }, layer: { value: layer } },
        vertexShader: 'attribute float crest; varying float vCrest; varying vec2 vUv; varying vec3 vP; varying vec3 vW; varying vec3 vN; void main(){ vCrest = crest; vUv = uv; vP = position; vN = normal; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 color, hazeCol, skyCol, sunDir, sunCol, glow; uniform float haze, layer, mist, vis, rain, glowK, night, highDetail; varying float vCrest; varying vec2 vUv; varying vec3 vP; varying vec3 vW; varying vec3 vN;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec2 q = vUv;
            // 杉林の筋：斜面を縦に走る濃い帯。雑木の斑は明るい
            float streak = n(vec2(q.x * 0.09, q.y * 0.012 + q.x * 0.004));
            float patchy = n(q * vec2(0.02, 0.05) + 3.1) * 0.6 + n(q * vec2(0.06, 0.12)) * 0.4;
            vec3 c = color * mix(0.72, 1.18, patchy);
            c *= mix(1.0, 0.7, smoothstep(0.55, 0.75, streak) * (1.0 - layer * 0.35));
            // 日の当たる側の山は明るく、日を背にした山は影になる
            vec3 d = normalize(vP);
            float lit = clamp(dot(-d.xz, normalize(sunDir.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
            c *= mix(mix(0.75, 0.48, night), mix(1.25, 0.78, night), lit) * mix(vec3(1.0), sunCol, 0.15);
            // 山を内側から見る面の法線。月夜も尾根の受光面と沢の陰を分ける。
            vec3 slopeN = -normalize(vN);
            float slopeLight = max(0.0, dot(slopeN, normalize(sunDir)));
            c *= mix(0.65, 1.3, slopeLight) * mix(0.85, 1.08, max(0.0, slopeN.y));
            // 近い山の裾の棚田：段ごとの細い明るい筋
            if (layer < 0.5) {
              float band = smoothstep(0.82, 0.95, fract(q.y * 0.28 + n(vec2(q.x * 0.01, 0.0)) * 2.0));
              float mask = smoothstep(0.6, 0.72, n(vec2(q.x * 0.012, 7.0))) * (1.0 - smoothstep(-2.0, 8.0, q.y));
              c = mix(c, c * 1.35 + vec3(0.02, 0.025, 0.0), band * mask);
              c = mix(c, c * 1.2, mask * 0.35);
            }
            // 霞：遠いほど、低いほど（谷の靄）。日の方角は明るむ
            // 霧の式と同じ量（カメラからの距離と高さの差）で霞ませる。手前の森や野より山が濃く見えることがないように
            vec3 dv = vW - cameraPosition;
            float mistY = clamp(dv.y, -30.0, 120.0) * 0.024;
            float hf = abs(mistY) < 0.01 ? 1.0 - mistY * 0.5 : (1.0 - exp(-mistY)) / mistY;
            // 張り出す尾根は薄い靄、奥まる沢は濃い靄。距離と高さの霧に重ねる。
            float hollow = smoothstep(0.25, 0.8, streak) * sin(vCrest * 3.141593);
            float fogK = 1.0 - exp(-length(dv) / max(20.0, vis) * (1.65 + hollow * 0.6) * hf);
            // 層ごとの霞：奥の峰ほど裾まで淡く、層と層の間の谷に靄の帯が溜まる（重なった山が影絵のように抜ける）
            float valley = (1.0 - smoothstep(-12.0, 18.0 + layer * 14.0, vP.y)) * (0.1 + mist * 0.3 + layer * 0.07);
            // 山の頂がカメラより高い谷の中でも、見通しの短い夜・雨には距離だけで霞ませる（手前の霞んだ尾根の上に、黒い山が逆さに浮いて見えないように）
            float fogFlat = 1.0 - exp(-length(dv) / max(20.0, vis) * 1.2);
            // 夜だけ霞の上限を下げると、霧の向こうに黒い板が残る。昼夜とも距離の霞を保ち、山肌はわずかに残す。
            float hz = clamp(max(max(fogK * 0.97, haze), fogFlat * 0.92) + valley + hollow * 0.035 + rain * 0.2, 0.0, 0.97);
            float sI = pow(max(dot(d, normalize(sunDir)), 0.0), 6.0);
            vec3 hc = (hazeCol + sunCol * sI * 0.12 * (1.0 - night)) * mix(vec3(0.9, 0.97, 1.08), vec3(0.96, 0.98, 1.0), night);   // 霧の式と同じく、遠くは青を帯びる
            // 朝夕は、日の方の霞が焼けの色に染まる
            float toS = clamp(dot(d.xz, normalize(sunDir.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
            hc = mix(hc, hc * 0.75 + glow * 0.35, glowK * toS * toS * (0.2 + layer * 0.1) * (1.0 - rain));
            // 山の裾は野の霞につなぎ、峰へ向かうほど空の青と焼けの色を残す
            hc = mix(hazeCol, hc, smoothstep(-8.0, 45.0 + layer * 15.0, vP.y));
            // 裾の不透明な切り口を霞へ溶かす。夜の稜線も細くほどき、明るい縁取りを作らない。
            float edge = smoothstep(0.0, 0.18, vCrest) * (1.0 - night * smoothstep(0.985, 1.0, vCrest));
            // 同じ距離の峰でも、張り出す尾根と谷の靄を分ける。夜の霧を一枚の灰色にしない。
            float shoulder = dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.3)));
            // 晴れた遠い峰ほど空の青へ。夜・雨・夕焼けは既存の空の色を受け継ぐ。
            float aerial = smoothstep(240.0, 650.0, length(dv)) * highDetail;
            hc = mix(hc, mix(hazeCol, skyCol, 0.32 + layer * 0.09), aerial * 0.55 * (1.0 - glowK * toS * 0.7));
            hz = min(0.97, hz + aerial * (0.04 + layer * 0.025));
            vec3 mountain = mix(c, hc, hz);
            mountain *= 1.0 + (shoulder - 0.4) * (0.16 - layer * 0.035) * (1.0 - rain * 0.65)
              * smoothstep(0.05, 0.65, vCrest);
            gl_FragColor = vec4(mountain, edge);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      // 戦の側から m.color で色を変えられるように
      mat.color = mat.uniforms.color.value;
      this.mountMats.push(mat);
      const m = new THREE.Mesh(mg, mat);
      m.renderOrder = -1 - layer * 0.1;
      m.userData.rad = rad;
      this.mountains.add(m);
    });
    this.scene.add(this.mountains);
  }


  // 空の写真を時間帯に合わせて差し替える（読み込みは戦ごとに一枚。届いたら映り込みも焼き直す）
  setSkyPhoto(timeKey, mood) {
    const key = skyPhotoKey(timeKey, mood);
    if (this.skyPhotoKey === key) return;
    this.skyPhotoKey = key;
    loadSkyPhoto(key).then((t) => {
      if (!t || this.skyPhotoKey !== key || !this.skyMat) return;
      const U = this.skyMat.uniforms;
      U.tPhoto.value = t; U.photoSun.value = t.userData.sun; U.photoK.value = 1;
      if (this.envRT) this.updateEnv();
    });
  }

  // 空を小さく焼いて、映り込みの光にする（時間帯が変わるたびに作り直す）
  updateEnv() {
    if (!RENDERER) return;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(RENDERER);
    // 焼くための小さな場面（空と地面）は一度だけ作って使い回す（毎回 new して捨てない）
    if (!this.envScene) {
      const es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(9.9, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.5; es.add(gnd);
      this.envScene = { es, gnd };
    }
    // 地面の照り返し
    this.envScene.gnd.material.color.copy(this.hemi.groundColor).multiplyScalar(0.8);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene.es, 0.02);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
    // 焼くための作業用の的（768×1024 の半精度 ×2）は毎回手放す（iPhone の WebContent の 2GB を少しでも空ける。次に焼く時に作り直す）
    this.pmrem.dispose(); this.pmrem = null;
  }
}
