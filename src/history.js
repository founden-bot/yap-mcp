// Read-only access to the dictation history the Yap app keeps on this computer.
// The database is opened read-only and never changed; nothing is sent anywhere
// except the matching text the assistant asked for.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DELIVERED = "('inserted','sent','copied')";

export function historyFiles() {
  if (process.env.YAP_HISTORY_FILE) return [process.env.YAP_HISTORY_FILE];
  const relative = path.join('Yap', 'dictation-history', 'history.sqlite');
  if (process.platform === 'darwin') {
    const support = path.join(os.homedir(), 'Library', 'Application Support');
    return [
      path.join(support, relative),
      // The Mac App Store edition lives in its sandbox container.
      path.join(os.homedir(), 'Library', 'Containers', 'cc.yapapp.mac', 'Data', 'Library', 'Application Support', relative),
    ];
  }
  if (process.platform === 'win32') return [path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), relative)];
  return [path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), relative)];
}

async function openDatabase() {
  const file = historyFiles().find(f => fs.existsSync(f));
  if (!file) return { error: 'No Yap dictation history was found on this computer. Install Yap from https://yapapp.cc (Mac, Windows), dictate anything, and it appears here.' };
  let sqlite;
  try { sqlite = await import('node:sqlite'); }
  catch { return { error: `Reading Yap history needs Node.js 22.13 or newer (this is ${process.version}).` }; }
  return { db: new sqlite.DatabaseSync(file, { readOnly: true }) };
}

/** Recent or matching dictations, newest first. */
export async function searchHistory({ query, days = 7, limit = 20 }) {
  const { db, error } = await openDatabase();
  if (error) return { error };
  try {
    const since = Date.now() - days * 86400000;
    const words = (query || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
    const where = [`status IN ${DELIVERED}`, 'created_at >= ?', ...words.map(() => 'text LIKE ? ESCAPE \'\\\'')];
    const like = w => `%${w.replace(/[\\%_]/g, c => '\\' + c)}%`;
    const rows = db.prepare(`SELECT text, created_at, word_count FROM dictations WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
      .all(since, ...words.map(like), Math.min(Math.max(limit, 1), 200));
    return { rows };
  } finally { db.close(); }
}
