#!/usr/bin/env node

/**
 * @eva/sqlite3 自定义安装脚本
 *
 * 直接从 binary.host 下载预编译的 .node 文件
 * 不依赖 @mapbox/node-pre-gyp
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// 读取 package.json 中的 binary 配置
const pkg = require('./package.json');
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
      console.error('[eva-sqlite3] 错误: musl libc 暂不支持');
      console.error('[eva-sqlite3] 请使用 glibc 发行版（Ubuntu、Debian 等）');
      process.exit(1);
    }
  } catch {
    // ldd 不可用或其他错误
  }

  return 'unknown';
}

// 获取平台信息
function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  const libc = detectLibc();

  // 替换模板变量
  let napiVersion = 6; // 默认使用 N-API v6
  const modulePath = binary.module_path
    .replace('{napi_build_version}', napiVersion)
    .replace('{platform}', platform)
    .replace('{libc}', libc)
    .replace('{arch}', arch);

  return { platform, arch, libc, napiVersion, modulePath };
}

// 下载文件
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 跟随重定向
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', reject);
  });
}

// 解压 tar.gz
function extractTarGz(tarPath, destDir) {
  try {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { stdio: 'inherit' });
  } catch (err) {
    // Windows 上可能没有 tar，尝试使用 PowerShell
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${tarPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
    } else {
      throw err;
    }
  }
}

async function main() {
  const { platform, arch, libc, napiVersion, modulePath } = getPlatform();

  // 构建下载 URL
  const fileName = binary.package_name
    .replace('{napi_build_version}', napiVersion)
    .replace('{platform}', platform)
    .replace('{libc}', libc)
    .replace('{arch}', arch);

  const remotePath = binary.remote_path.replace('{version}', pkg.version);
  const downloadUrl = `${binary.host}${remotePath}/${fileName}`;

  // 目标路径
  const bindingDir = path.resolve(__dirname, modulePath);
  const bindingFile = path.join(bindingDir, `${binary.module_name}.node`);

  // 如果 .node 文件已存在，跳过
  if (fs.existsSync(bindingFile)) {
    console.log(`[eva-sqlite3] .node 文件已存在: ${bindingFile}`);
    return;
  }

  console.log(`[eva-sqlite3] 下载预编译二进制: ${downloadUrl}`);

  // 创建临时目录
  const tmpDir = path.join(__dirname, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const tarPath = path.join(tmpDir, fileName);

  try {
    // 下载
    await download(downloadUrl, tarPath);
    console.log(`[eva-sqlite3] 下载完成: ${tarPath}`);

    // 解压
    fs.mkdirSync(bindingDir, { recursive: true });
    extractTarGz(tarPath, bindingDir);
    console.log(`[eva-sqlite3] 解压完成: ${bindingDir}`);

    // 清理临时文件
    fs.unlinkSync(tarPath);

    console.log(`[eva-sqlite3] 安装成功: ${bindingFile}`);
  } catch (err) {
    console.error(`[eva-sqlite3] 安装失败: ${err.message}`);
    console.error(`[eva-sqlite3] 请手动下载: ${downloadUrl}`);
    process.exit(1);
  } finally {
    // 清理临时目录
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

main();
