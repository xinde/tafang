/**
 * ImageLoader：轻量图片加载器（HTMLImageElement）。
 * - 注册 manifest（name -> 路径），load() 并行预加载全部图片。
 * - get(name) 返回已完整加载的 HTMLImageElement，未就绪/失败返回 null（调用方应回退到程序化绘制）。
 * - 模块加载期不创建 Image，Node 环境可安全 import。
 *
 * 用法：
 *   import { assets } from './engine/assets.js';
 *   assets.setManifest({ turret_sword: 'assets/img/turret_sword.svg', ... });
 *   assets.load();
 *   const img = assets.get('turret_sword'); // null 则回退程序化绘制
 */
export class ImageLoader {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} */
    this._images = new Map();
    this._manifest = null;
    this._loaded = false;
    this._loading = null;
  }

  setManifest(manifest) {
    this._manifest = manifest;
  }

  load() {
    if (this._loaded) return Promise.resolve();
    if (this._loading) return this._loading;
    if (typeof window === 'undefined' || !this._manifest) {
      this._loaded = true;
      return Promise.resolve();
    }
    this._loading = Promise.all(
      Object.entries(this._manifest).map(([name, path]) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { this._images.set(name, img); resolve(); };
          img.onerror = () => { resolve(); }; // 单个失败不阻塞其他
          img.src = path;
        });
      }),
    ).then(() => { this._loaded = true; });
    return this._loading;
  }

  /** 返回已就绪的图片，未加载/失败返回 null */
  get(name) {
    const img = this._images.get(name);
    if (!img || !img.complete || img.naturalWidth <= 0) return null;
    return img;
  }
}

export const assets = new ImageLoader();
