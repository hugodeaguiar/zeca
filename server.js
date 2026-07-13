import express from 'express';
import { DatabaseSync } from 'node:sqlite';
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

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

    const stmt = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(name.trim(), email.trim(), password.trim());
    
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

    // A senha é obrigatória e deve bater
    if (!user.password || password.trim() !== user.password) {
      return res.status(400).json({ error: 'Senha incorreta para esta conta.' });
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

// Obter todas as carteiras do usuário
app.get('/api/wallets', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY id DESC');
    const wallets = stmt.all(req.user.id);
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
      user_id: req.user.id
    });
  } catch (error) {
    console.error('Erro ao criar carteira:', error);
    res.status(500).json({ error: 'Erro ao criar carteira.' });
  }
});

// Editar carteira
app.put('/api/wallets/:id', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);
  const { name, end_date, goal } = req.body;

  if (isNaN(walletId)) {
    return res.status(400).json({ error: 'ID da carteira inválido.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome da carteira é obrigatório.' });
  }
  if (goal === undefined || goal === null || isNaN(parseFloat(goal)) || parseFloat(goal) < 0) {
    return res.status(400).json({ error: 'A meta financeira deve ser um valor positivo.' });
  }

  try {
    // Verifica propriedade
    const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(walletId, req.user.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada.' });
    }

    const stmt = db.prepare('UPDATE wallets SET name = ?, end_date = ?, goal = ? WHERE id = ? AND user_id = ?');
    stmt.run(name.trim(), end_date || null, parseFloat(goal), walletId, req.user.id);

    res.json({
      id: walletId,
      name: name.trim(),
      end_date: end_date || null,
      goal: parseFloat(goal),
      user_id: req.user.id
    });
  } catch (error) {
    console.error('Erro ao editar carteira:', error);
    res.status(500).json({ error: 'Erro ao editar carteira.' });
  }
});

// Excluir carteira
app.delete('/api/wallets/:id', requireAuth, (req, res) => {
  const walletId = parseInt(req.params.id, 10);

  if (isNaN(walletId)) {
    return res.status(400).json({ error: 'ID da carteira inválido.' });
  }

  try {
    // Verifica propriedade
    const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(walletId, req.user.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada.' });
    }

    const stmt = db.prepare('DELETE FROM wallets WHERE id = ? AND user_id = ?');
    stmt.run(walletId, req.user.id);

    res.json({ message: 'Carteira e todos os seus ativos associados foram removidos com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir carteira:', error);
    res.status(500).json({ error: 'Erro ao excluir carteira.' });
  }
});


// --- ROTAS DE ATIVOS (ASSETS) ---

// Obter ativos (opcionalmente filtrando por carteira)
app.get('/api/assets', requireAuth, (req, res) => {
  const walletId = req.query.wallet_id ? parseInt(req.query.wallet_id, 10) : null;

  try {
    if (walletId) {
      // Valida propriedade da carteira
      const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(walletId, req.user.id);
      if (!wallet) {
        return res.status(403).json({ error: 'Acesso negado para esta carteira.' });
      }
      
      const stmt = db.prepare('SELECT * FROM assets WHERE wallet_id = ? ORDER BY id DESC');
      const assets = stmt.all(walletId);
      return res.json(assets);
    } else {
      // Retorna todos os ativos de todas as carteiras do usuário
      const stmt = db.prepare(`
        SELECT a.* FROM assets a
        JOIN wallets w ON a.wallet_id = w.id
        WHERE w.user_id = ?
        ORDER BY a.id DESC
      `);
      const assets = stmt.all(req.user.id);
      return res.json(assets);
    }
  } catch (error) {
    console.error('Erro ao listar ativos:', error);
    res.status(500).json({ error: 'Erro ao listar ativos.' });
  }
});

// Criar novo ativo
app.post('/api/assets', requireAuth, (req, res) => {
  const { name, bank, price, updated_price, created_date, expiration_date, wallet_id } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome do ativo é obrigatório.' });
  }
  if (!bank || !bank.trim()) {
    return res.status(400).json({ error: 'O banco emissor/custodiante é obrigatório.' });
  }
  if (price === undefined || price === null || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    return res.status(400).json({ error: 'O preço inicial deve ser um valor positivo.' });
  }
  if (updated_price === undefined || updated_price === null || isNaN(parseFloat(updated_price)) || parseFloat(updated_price) < 0) {
    return res.status(400).json({ error: 'O preço atualizado deve ser um valor positivo.' });
  }
  if (!created_date || !created_date.trim()) {
    return res.status(400).json({ error: 'A data de criação é obrigatória.' });
  }
  if (!wallet_id || isNaN(parseInt(wallet_id, 10))) {
    return res.status(400).json({ error: 'ID de carteira inválido.' });
  }

  try {
    // Valida se a carteira pertence ao usuário logado
    const wallet = db.prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?').get(parseInt(wallet_id, 10), req.user.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada ou não pertencente ao usuário.' });
    }

    const stmt = db.prepare(`
      INSERT INTO assets (name, bank, price, updated_price, created_date, expiration_date, wallet_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name.trim(),
      bank.trim(),
      parseFloat(price),
      parseFloat(updated_price),
      created_date.trim(),
      expiration_date || null,
      parseInt(wallet_id, 10)
    );

    const assetId = Number(result.lastInsertRowid);
    res.status(201).json({
      id: assetId,
      name: name.trim(),
      bank: bank.trim(),
      price: parseFloat(price),
      updated_price: parseFloat(updated_price),
      created_date: created_date.trim(),
      expiration_date: expiration_date || null,
      wallet_id: parseInt(wallet_id, 10)
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

  if (isNaN(assetId)) {
    return res.status(400).json({ error: 'ID de ativo inválido.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome do ativo é obrigatório.' });
  }
  if (!bank || !bank.trim()) {
    return res.status(400).json({ error: 'O banco emissor/custodiante é obrigatório.' });
  }
  if (price === undefined || price === null || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    return res.status(400).json({ error: 'O preço inicial deve ser um valor positivo.' });
  }
  if (updated_price === undefined || updated_price === null || isNaN(parseFloat(updated_price)) || parseFloat(updated_price) < 0) {
    return res.status(400).json({ error: 'O preço atualizado deve ser um valor positivo.' });
  }
  if (!created_date || !created_date.trim()) {
    return res.status(400).json({ error: 'A data de criação é obrigatória.' });
  }

  try {
    // Valida se o ativo pertence a alguma carteira do usuário logado
    const asset = db.prepare(`
      SELECT a.id, a.wallet_id FROM assets a
      JOIN wallets w ON a.wallet_id = w.id
      WHERE a.id = ? AND w.user_id = ?
    `).get(assetId, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Ativo não encontrado ou permissão negada.' });
    }

    const stmt = db.prepare(`
      UPDATE assets 
      SET name = ?, bank = ?, price = ?, updated_price = ?, created_date = ?, expiration_date = ?
      WHERE id = ?
    `);
    stmt.run(
      name.trim(),
      bank.trim(),
      parseFloat(price),
      parseFloat(updated_price),
      created_date.trim(),
      expiration_date || null,
      assetId
    );

    res.json({
      id: assetId,
      name: name.trim(),
      bank: bank.trim(),
      price: parseFloat(price),
      updated_price: parseFloat(updated_price),
      created_date: created_date.trim(),
      expiration_date: expiration_date || null,
      wallet_id: asset.wallet_id
    });
  } catch (error) {
    console.error('Erro ao editar ativo:', error);
    res.status(500).json({ error: 'Erro ao editar ativo.' });
  }
});

// Excluir ativo
app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const assetId = parseInt(req.params.id, 10);

  if (isNaN(assetId)) {
    return res.status(400).json({ error: 'ID de ativo inválido.' });
  }

  try {
    // Valida se o ativo pertence a alguma carteira do usuário logado
    const asset = db.prepare(`
      SELECT a.id FROM assets a
      JOIN wallets w ON a.wallet_id = w.id
      WHERE a.id = ? AND w.user_id = ?
    `).get(assetId, req.user.id);

    if (!asset) {
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


// Serve a SPA para qualquer outra rota (para suporte a histórico se necessário, ou fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
