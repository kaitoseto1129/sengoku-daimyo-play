// 同梱の形（assets/battle/*.glb）の読み口（11/1 ex_assets_v2）。
// tools/bootload_glb.mjs が gltfpack の meshopt（EXT_meshopt_compression）で縮めた形を戻す。縮めていない形もそのまま読める。
// 戻す道具は three の同じ版の物（中に wasm を持つ。読み込みの時にほかの所へ取りに行かない）。
import { GLTFLoader as BaseLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class GLTFLoader extends BaseLoader {
  constructor(manager) {
    super(manager);
    this.setMeshoptDecoder(MeshoptDecoder);
  }
}
