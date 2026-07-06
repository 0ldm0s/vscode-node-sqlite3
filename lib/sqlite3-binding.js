/**
 * @eva/sqlite3 binding 加载器
 *
 * 直接从 binary 配置计算 .node 文件路径
 * 不依赖 @mapbox/node-pre-gyp
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 读取 package.json 中的 binary 配置
const pkg = require(path.join(__dirname, '../package.json'));
const binary = pkg.binary;

// 检测 libc 类型
function detectLibc() {
  if (process.platform !== 'linux') {
    return 'unknown';
  }

  try {
    const lddOutput = execSync('ldd --version 2>&1 || true', { encoding: 'utf8' });
    if (lddOutput.includes('GLIBC') || lddOutput.includes('glibc')) {
      return 'glibc';
    }
    if (lddOutput.includes('musl')) {
      throw new Error('musl libc 暂不支持，请使用 glibc 发行版');
    }
  } catch (e) {
    if (e.message.includes('musl')) {
      throw e;
    }
    // ldd 不可用或其他错误
  }

  return 'unknown';
}

// 获取平台信息
const platform = process.platform;
const arch = process.arch;
const libc = detectLibc();

// 使用 N-API v6（默认）
const napiVersion = 6;

// 替换模板变量，构建 .node 文件路径
const modulePath = binary.module_path
  .replace('{napi_build_version}', napiVersion)
  .replace('{platform}', platform)
  .replace('{libc}', libc)
  .replace('{arch}', arch);

const bindingPath = path.join(__dirname, '..', modulePath, `${binary.module_name}.node`);

// 加载 .node 文件
const binding = require(bindingPath);
module.exports = exports = binding;
