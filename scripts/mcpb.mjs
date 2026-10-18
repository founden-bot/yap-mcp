// Builds dist/yap.mcpb, the Claude Desktop extension: the server, its
// production dependencies and the sherpa-onnx native runtime for every
// supported desktop platform (macOS arm64/x64, Windows x64) in one bundle.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stage = path.join(root, 'dist', 'mcpb');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'server'), { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mcpb', 'manifest.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error(`mcpb/manifest.json ${manifest.version} must match package.json ${pkg.version}`);
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.copyFileSync(path.join(root, 'mcpb', 'icon.png'), path.join(stage, 'icon.png'));
for (const f of ['package.json', 'README.md', 'LICENSE']) fs.copyFileSync(path.join(root, f), path.join(stage, 'server', f));
fs.cpSync(path.join(root, 'src'), path.join(stage, 'server', 'src'), { recursive: true });

const npm = (...args) => execFileSync('npm', args, { cwd: path.join(stage, 'server'), stdio: 'inherit' });
npm('install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts');
const sherpa = pkg.dependencies['sherpa-onnx-node'];
for (const [os, cpu] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']]) {
  npm('install', '--no-save', '--no-audit', '--no-fund', '--force', `--os=${os}`, `--cpu=${cpu}`, `sherpa-onnx-${os === 'win32' ? 'win' : os}-${cpu}@${sherpa}`);
}
execFileSync('npx', ['-y', '@anthropic-ai/mcpb@2.1.2', 'pack', stage, path.join(root, 'dist', 'yap.mcpb')], { stdio: 'inherit' });
