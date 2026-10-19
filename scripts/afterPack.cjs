// electron-builder afterPack hook.
// Drops the DirectX Shader Compiler that Chromium only needs for WebGPU on D3D12.
// RoundPost never uses WebGPU; removing it saves about 26 MB.
// Re-check after every Electron upgrade: GPU feature status and page rendering must stay the same.
const fs = require('node:fs')
const path = require('node:path')

const WEBGPU_ONLY_DLLS = ['dxcompiler.dll', 'dxil.dll']

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  for (const name of WEBGPU_ONLY_DLLS) {
    fs.rmSync(path.join(context.appOutDir, name), { force: true })
  }
}
