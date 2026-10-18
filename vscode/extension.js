// Yap MCP for VS Code: registers the Yap MCP server (bundled in ./server) so
// Copilot chat and agent mode get on-device transcription with no setup. The
// server runs on the editor's own Node.js (process.execPath), so nothing else
// needs to be installed. Source: https://github.com/founden-bot/yap-mcp
const path = require('node:path');
const vscode = require('vscode');

function activate(context) {
  const { version } = require('./package.json');
  const server = path.join(context.extensionPath, 'server', 'src', 'index.js');
  context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider('yap', {
    provideMcpServerDefinitions: async () => [
      new vscode.McpStdioServerDefinition('Yap', process.execPath, [server], {}, version),
    ],
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
