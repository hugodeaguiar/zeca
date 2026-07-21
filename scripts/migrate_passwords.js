import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'zeca.db');

const db = new DatabaseSync(dbPath);

console.log('Iniciando migração de senhas...');

// Busca todos os usuários
const users = db.prepare('SELECT id, password FROM users').all();

let migratedCount = 0;

db.exec('BEGIN TRANSACTION;');

try {
  for (const user of users) {
    if (!user.password) continue;
    
    // Verifica se a senha já está no formato salt:hash (simplificado)
    // Uma hash segura em hex usando scrypt e randomBytes(16) tem comprimentos fixos:
    // salt (hex de 16 bytes = 32 chars), hash (hex de 64 bytes = 128 chars).
    if (user.password.includes(':') && user.password.split(':')[0].length === 32) {
      console.log(`Usuário ID ${user.id} já possui senha criptografada. Ignorando.`);
      continue;
    }

    // Criptografa a senha em texto limpo
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(user.password, salt, 64).toString('hex');
    const newPassword = `${salt}:${hash}`;

    // Atualiza o banco de dados
    const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    stmt.run(newPassword, user.id);
    migratedCount++;
    console.log(`Usuário ID ${user.id} migrado com sucesso.`);
  }

  db.exec('COMMIT;');
  console.log(`Migração concluída! ${migratedCount} senhas foram criptografadas com sucesso.`);
} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Erro durante a migração. Alterações revertidas.', error);
}

db.close();
