import * as THREE from 'three';

export class InitError extends Error {
  constructor(title, detail) { super(title); this.title = title; this.detail = detail; }
}

export function checkWebGL2() {
  const c = document.createElement('canvas');
  let gl = null;
  try { gl = c.getContext('webgl2'); } catch (e) { /* handled below */ }
  if (!gl) {
    throw new InitError('此瀏覽器或顯示卡不支援 WebGL2',
      '請使用最新版 Chrome / Edge / Firefox / Safari，並確認瀏覽器設定中已啟用「硬體加速」。若使用遠端桌面或虛擬機，WebGL2 可能被停用。');
  }
  const info = {
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'),
    vendor: '', renderer: '',
  };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    info.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    info.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (!info.colorBufferFloat) {
    throw new InitError('顯示卡缺少浮點渲染目標支援 (EXT_color_buffer_float)',
      'HDR 後處理需要此功能。請更新顯示卡驅動程式或改用其他瀏覽器。');
  }
  return info;
}

export function createRenderer(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // MSAA happens in the HDR scene target (see postprocessing.js)
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
  } catch (e) {
    throw new InitError('無法建立 WebGL2 繪圖環境', String(e && e.message || e));
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping is applied by our own final pass (exposure -> bloom -> ACES).
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x000000, 1);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    const ev = new CustomEvent('app-fatal', { detail: { title: 'WebGL 繪圖環境遺失', detail: '顯示卡資源不足或驅動程式重置。請重新整理頁面，或改用較低畫質。' } });
    window.dispatchEvent(ev);
  });
  return renderer;
}
