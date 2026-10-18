// Builds dist/yap-mcp-<version>.vsix: the VS Code extension in vscode/ plus the
// server (src/) and its production dependencies, with the sherpa-onnx native
// runtime for macOS (arm64, x64), Windows x64 and Linux (x64, arm64), so one
// universal package runs on the editor's own Node.js everywhere.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ext = JSON.parse(fs.readFileSync(path.join(root, 'vscode', 'package.json'), 'utf8'));
if (ext.version !== pkg.version) throw new Error(`vscode/package.json ${ext.version} must match package.json ${pkg.version}`);
const stage = path.join(root, 'dist', 'vscode');
fs.rmSync(stage, { recursive: true, force: true });
fs.cpSync(path.join(root, 'vscode'), stage, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
fs.copyFileSync(path.join(root, 'mcpb', 'icon.png'), path.join(stage, 'icon.png'));
const server = path.join(stage, 'server');
fs.mkdirSync(server, { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(server, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'package.json'), path.join(server, 'package.json'));
const npm = (...args) => execFileSync('npm', args, { cwd: server, stdio: 'inherit' });
npm('install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts');
const sherpa = pkg.dependencies['sherpa-onnx-node'];
for (const [os, cpu] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['linux', 'x64'], ['linux', 'arm64']]) {
  npm('install', '--no-save', '--no-audit', '--no-fund', '--force', `--os=${os}`, `--cpu=${cpu}`, `sherpa-onnx-${os === 'win32' ? 'win' : os}-${cpu}@${sherpa}`);
}
execFileSync('npx', ['-y', '@vscode/vsce@4.0.0', 'package', '--no-dependencies', '--out', path.join(root, 'dist', `yap-mcp-${ext.version}.vsix`)], { cwd: stage, stdio: 'inherit' });
