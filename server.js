import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializa o banco de dados SQLite
const db = new DatabaseSync('zeca.db');

// Ativa chaves estrangeiras
db.exec('PRAGMA foreign_keys = ON;');

// Criação de tabelas de acordo com o DER
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    end_date TEXT,
    goal REAL NOT NULL,
    user_id INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bank TEXT NOT NULL,
    price REAL NOT NULL,
    updated_price REAL NOT NULL,
    created_date TEXT NOT NULL,
    expiration_date TEXT,
    wallet_id INTEGER NOT NULL,
    FOREIGN KEY(wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_shares (
    wallet_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (wallet_id, user_id),
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers de Autorização
function hasWalletAccess(walletId, userId) {
  const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(walletId, userId);
  if (wallet) return true; // owner
  
  const share = db.prepare('SELECT wallet_id FROM wallet_shares WHERE wallet_id = ? AND user_id = ?').get(walletId, userId);
  return !!share; // shared member
}

function isWalletOwner(walletId, userId) {
  const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(walletId, userId);
  return !!wallet;
}

// Middleware de Autenticação
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
  }

  const userId = parseInt(authHeader.split(' ')[1], 10);
  if (isNaN(userId)) {
    return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// --- ROTAS DE AUTENTICAÇÃO ---

// Registrar Usuário
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome é obrigatório.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'O e-mail é obrigatório.' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ error: 'A senha é obrigatória.' });
  }

  try {
    // Verifica se e-mail já existe
    const checkEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (checkEmail) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }

    // Criptografa a senha
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
    const hashedPassword = `${salt}:${hash}`;

    const stmt = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(name.trim(), email.trim(), hashedPassword);
    
    const userId = Number(result.lastInsertRowid);
    res.status(201).json({
      message: 'Usuário cadastrado com sucesso!',
      user: { id: userId, name: name.trim(), email: email.trim() }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao cadastrar usuário.' });
  }
});

// Login do Usuário
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'O e-mail é obrigatório.' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ error: 'A senha é obrigatória.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado.' });
    }

    // Validação da senha criptografada
    if (!user.password) {
      return res.status(400).json({ error: 'Senha incorreta para esta conta.' });
    }

    if (user.password.includes(':') && user.password.split(':')[0].length === 32) {
      const [salt, key] = user.password.split(':');
      const hashedBuffer = crypto.scryptSync(password.trim(), salt, 64);
      const keyBuffer = Buffer.from(key, 'hex');
      
      const match = hashedBuffer.length === keyBuffer.length && crypto.timingSafeEqual(hashedBuffer, keyBuffer);
      if (!match) {
        return res.status(400).json({ error: 'Senha incorreta para esta conta.' });
      }
    } else {
      // Fallback para senhas não migradas (se houver alguma que escapou da migração)
      if (password.trim() !== user.password) {
        return res.status(400).json({ error: 'Senha incorreta para esta conta.' });
      }
    }

    res.json({
      message: 'Login realizado com sucesso!',
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno ao fazer login.' });
  }
});

// Obter Dados do Usuário Logado
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email } });
});


// --- ROTAS DE CARTEIRAS (WALLETS) ---

// Obter todas as carteiras do usuário (próprias e compartilhadas)
app.get('/api/wallets', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT w.*, 
             (w.user_id = ?) as is_owner,
             u.name as owner_name
      FROM wallets w
      JOIN users u ON w.user_id = u.id
      WHERE w.user_id = ? 
         OR w.id IN (SELECT wallet_id FROM wallet_shares WHERE user_id = ?)
      ORDER BY w.id DESC
    `);
    const wallets = stmt.all(req.user.id, req.user.id, req.user.id);
    res.json(wallets);
  } catch (error) {
    console.error('Erro ao listar carteiras:', error);
    res.status(500).json({ error: 'Erro ao listar carteiras.' });
  }
});

// Criar nova carteira
app.post('/api/wallets', requireAuth, (req, res) => {
  const { name, end_date, goal } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome da carteira é obrigatório.' });
  }
  if (goal === undefined || goal === null || isNaN(parseFloat(goal)) || parseFloat(goal) < 0) {
    return res.status(400).json({ error: 'A meta financeira deve ser um valor positivo.' });
  }

  try {
    const stmt = db.prepare('INSERT INTO wallets (name, end_date, goal, user_id) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name.trim(), end_date || null, parseFloat(goal), req.user.id);
    
    const walletId = Number(result.lastInsertRowid);
    res.status(201).json({
      id: walletId,
      name: name.trim(),
      end_date: end_date || null,
      goal: parseFloat(goal),
      user_id: req.user.id,
      is_owner: 1
    });
  } catch (error) {
    console.error('Erro ao criar carteira:', error);
    res.status(500).json({ error: 'Erro ao criar carteira.' });
  }
});

// Editar carteira (apenas dono)
app.put('/api/wallets/:id', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  const { name, end_date, goal } = req.body;

  if (isNaN(walletId)) return res.status(400).json({ error: 'ID da carteira inválido.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'O nome da carteira é obrigatório.' });
  if (goal === undefined || goal === null || isNaN(parseFloat(goal)) || parseFloat(goal) < 0) {
    return res.status(400).json({ error: 'A meta financeira deve ser um valor positivo.' });
  }

  try {
    if (!isWalletOwner(walletId, req.user.id)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode realizar esta ação.' });
    }

    const stmt = db.prepare('UPDATE wallets SET name = ?, end_date = ?, goal = ? WHERE id = ?');
    stmt.run(name.trim(), end_date || null, parseFloat(goal), walletId);

    res.json({ id: walletId, name: name.trim(), end_date: end_date || null, goal: parseFloat(goal), user_id: req.user.id, is_owner: 1 });
  } catch (error) {
    console.error('Erro ao editar carteira:', error);
    res.status(500).json({ error: 'Erro ao editar carteira.' });
  }
});

// Excluir carteira (apenas dono)
app.delete('/api/wallets/:id', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  if (isNaN(walletId)) return res.status(400).json({ error: 'ID da carteira inválido.' });

  try {
    if (!isWalletOwner(walletId, req.user.id)) {
      return res.status(403).json({ error: 'Apenas o dono da carteira pode excluí-la.' });
    }

    const stmt = db.prepare('DELETE FROM wallets WHERE id = ?');
    stmt.run(walletId);

    res.json({ message: 'Carteira e todos os seus ativos associados foram removidos com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir carteira:', error);
    res.status(500).json({ error: 'Erro ao excluir carteira.' });
  }
});


// --- ROTAS DE COMPARTILHAMENTO DE CARTEIRAS ---

// Listar quem tem acesso à carteira
app.get('/api/wallets/:id/shares', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  if (isNaN(walletId)) return res.status(400).json({ error: 'ID da carteira inválido.' });

  try {
    if (!isWalletOwner(walletId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas o dono pode gerenciar compartilhamentos.' });
    }

    const stmt = db.prepare(`
      SELECT u.id, u.name, u.email 
      FROM users u
      JOIN wallet_shares ws ON u.id = ws.user_id
      WHERE ws.wallet_id = ?
    `);
    const shares = stmt.all(walletId);
    res.json(shares);
  } catch (error) {
    console.error('Erro ao listar compartilhamentos:', error);
    res.status(500).json({ error: 'Erro interno ao listar compartilhamentos.' });
  }
});

// Compartilhar carteira com um email
app.post('/api/wallets/:id/share', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  const { email } = req.body;

  if (isNaN(walletId)) return res.status(400).json({ error: 'ID da carteira inválido.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'O e-mail é obrigatório.' });

  try {
    if (!isWalletOwner(walletId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas o dono pode compartilhar a carteira.' });
    }

    // Busca usuário pelo e-mail
    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.trim());
    if (!targetUser) {
      return res.status(404).json({ error: 'Nenhum usuário cadastrado com este e-mail.' });
    }
    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode compartilhar a carteira consigo mesmo.' });
    }

    // Verifica se já está compartilhado
    const existing = db.prepare('SELECT user_id FROM wallet_shares WHERE wallet_id = ? AND user_id = ?').get(walletId, targetUser.id);
    if (existing) {
      return res.status(400).json({ error: 'Esta carteira já está compartilhada com este usuário.' });
    }

    const stmt = db.prepare('INSERT INTO wallet_shares (wallet_id, user_id) VALUES (?, ?)');
    stmt.run(walletId, targetUser.id);

    res.status(201).json({ message: 'Carteira compartilhada com sucesso!', user: targetUser });
  } catch (error) {
    console.error('Erro ao compartilhar carteira:', error);
    res.status(500).json({ error: 'Erro interno ao compartilhar carteira.' });
  }
});

// Remover compartilhamento
app.delete('/api/wallets/:id/share/:userId', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  const targetUserId = parseInt(req.params.userId, 10);

  if (isNaN(walletId) || isNaN(targetUserId)) return res.status(400).json({ error: 'IDs inválidos.' });

  try {
    if (!isWalletOwner(walletId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas o dono pode remover compartilhamentos.' });
    }

    const stmt = db.prepare('DELETE FROM wallet_shares WHERE wallet_id = ? AND user_id = ?');
    stmt.run(walletId, targetUserId);

    res.json({ message: 'Acesso revogado com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover compartilhamento:', error);
    res.status(500).json({ error: 'Erro interno ao remover compartilhamento.' });
  }
});


// --- ROTAS DE ATIVOS (ASSETS) ---

// Obter ativos
app.get('/api/assets', requireAuth, (req, res) => {
  const walletId = req.query.wallet_id ? parseInt(req.query.wallet_id, 10) : null;

  try {
    if (walletId) {
      if (!hasWalletAccess(walletId, req.user.id)) {
        return res.status(403).json({ error: 'Acesso negado para esta carteira.' });
      }
      const stmt = db.prepare('SELECT * FROM assets WHERE wallet_id = ? ORDER BY id DESC');
      res.json(stmt.all(walletId));
    } else {
      const stmt = db.prepare(`
        SELECT a.* FROM assets a
        JOIN wallets w ON a.wallet_id = w.id
        WHERE w.user_id = ? 
           OR w.id IN (SELECT wallet_id FROM wallet_shares WHERE user_id = ?)
        ORDER BY a.id DESC
      `);
      res.json(stmt.all(req.user.id, req.user.id));
    }
  } catch (error) {
    console.error('Erro ao listar ativos:', error);
    res.status(500).json({ error: 'Erro ao listar ativos.' });
  }
});

// Criar novo ativo
app.post('/api/assets', requireAuth, (req, res) => {
  const { name, bank, price, updated_price, created_date, expiration_date, wallet_id } = req.body;
  const wId = parseInt(wallet_id, 10);

  if (!name || !name.trim()) return res.status(400).json({ error: 'O nome do ativo é obrigatório.' });
  if (!bank || !bank.trim()) return res.status(400).json({ error: 'O banco emissor/custodiante é obrigatório.' });
  if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) return res.status(400).json({ error: 'Preço inicial inválido.' });
  if (updated_price === undefined || isNaN(parseFloat(updated_price)) || parseFloat(updated_price) < 0) return res.status(400).json({ error: 'Preço atualizado inválido.' });
  if (!created_date || !created_date.trim()) return res.status(400).json({ error: 'A data de criação é obrigatória.' });
  if (isNaN(wId)) return res.status(400).json({ error: 'ID de carteira inválido.' });

  try {
    if (!hasWalletAccess(wId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado para esta carteira.' });
    }

    const stmt = db.prepare(`
      INSERT INTO assets (name, bank, price, updated_price, created_date, expiration_date, wallet_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name.trim(), bank.trim(), parseFloat(price), parseFloat(updated_price), created_date.trim(), expiration_date || null, wId);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      bank: bank.trim(),
      price: parseFloat(price),
      updated_price: parseFloat(updated_price),
      created_date: created_date.trim(),
      expiration_date: expiration_date || null,
      wallet_id: wId
    });
  } catch (error) {
    console.error('Erro ao criar ativo:', error);
    res.status(500).json({ error: 'Erro ao criar ativo.' });
  }
});

// Editar ativo
app.put('/api/assets/:id', requireAuth, (req, res) => {
  const assetId = parseInt(req.params.id, 10);
  const { name, bank, price, updated_price, created_date, expiration_date } = req.body;

  if (isNaN(assetId)) return res.status(400).json({ error: 'ID de ativo inválido.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'O nome do ativo é obrigatório.' });
  if (!bank || !bank.trim()) return res.status(400).json({ error: 'O banco emissor/custodiante é obrigatório.' });
  if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) return res.status(400).json({ error: 'Preço inicial inválido.' });
  if (updated_price === undefined || isNaN(parseFloat(updated_price)) || parseFloat(updated_price) < 0) return res.status(400).json({ error: 'Preço atualizado inválido.' });
  if (!created_date || !created_date.trim()) return res.status(400).json({ error: 'A data de criação é obrigatória.' });

  try {
    const asset = db.prepare('SELECT wallet_id FROM assets WHERE id = ?').get(assetId);
    if (!asset || !hasWalletAccess(asset.wallet_id, req.user.id)) {
      return res.status(404).json({ error: 'Ativo não encontrado ou permissão negada.' });
    }

    const stmt = db.prepare(`
      UPDATE assets 
      SET name = ?, bank = ?, price = ?, updated_price = ?, created_date = ?, expiration_date = ?
      WHERE id = ?
    `);
    stmt.run(name.trim(), bank.trim(), parseFloat(price), parseFloat(updated_price), created_date.trim(), expiration_date || null, assetId);

    res.json({
      id: assetId, name: name.trim(), bank: bank.trim(), price: parseFloat(price), updated_price: parseFloat(updated_price),
      created_date: created_date.trim(), expiration_date: expiration_date || null, wallet_id: asset.wallet_id
    });
  } catch (error) {
    console.error('Erro ao editar ativo:', error);
    res.status(500).json({ error: 'Erro ao editar ativo.' });
  }
});

// Excluir ativo
app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const assetId = parseInt(req.params.id, 10);
  if (isNaN(assetId)) return res.status(400).json({ error: 'ID de ativo inválido.' });

  try {
    const asset = db.prepare('SELECT wallet_id FROM assets WHERE id = ?').get(assetId);
    if (!asset || !hasWalletAccess(asset.wallet_id, req.user.id)) {
      return res.status(404).json({ error: 'Ativo não encontrado ou permissão negada.' });
    }

    const stmt = db.prepare('DELETE FROM assets WHERE id = ?');
    stmt.run(assetId);

    res.json({ message: 'Ativo removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir ativo:', error);
    res.status(500).json({ error: 'Erro ao excluir ativo.' });
  }
});


// Serve a SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
