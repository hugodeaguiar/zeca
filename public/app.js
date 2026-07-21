// ================= ESTADO GLOBAL DA APLICAÇÃO =================
const state = {
  user: null,
  wallets: [],
  assets: [],
  activeView: 'dashboard',
  activeWalletId: null
};

// ================= CLIENTE DE API (COMUNICAÇÃO BACKEND) =================
const API = {
  baseUrl: '/api',

  async request(path, options = {}) {
    const userId = localStorage.getItem('zeca_userId');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (userId) {
      headers['Authorization'] = `Bearer ${userId}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro na requisição.');
    }
    return data;
  },

  auth: {
    async register(name, email, password) {
      return API.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
    },
    async login(email, password) {
      return API.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    async getMe() {
      return API.request('/auth/me');
    }
  },

  wallets: {
    async list() {
      return API.request('/wallets');
    },
    async create(walletData) {
      return API.request('/wallets', {
        method: 'POST',
        body: JSON.stringify(walletData),
      });
    },
    async update(id, walletData) {
      return API.request(`/wallets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(walletData),
      });
    },
    async delete(id) {
      return API.request(`/wallets/${id}`, {
        method: 'DELETE',
      });
    },
    async getShares(id) {
      return API.request(`/wallets/${id}/shares`);
    },
    async addShare(id, email) {
      return API.request(`/wallets/${id}/share`, {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async removeShare(id, userId) {
      return API.request(`/wallets/${id}/share/${userId}`, {
        method: 'DELETE'
      });
    }
  },

  assets: {
    async list(walletId = null) {
      const url = walletId ? `/assets?wallet_id=${walletId}` : '/assets';
      return API.request(url);
    },
    async create(assetData) {
      return API.request('/assets', {
        method: 'POST',
        body: JSON.stringify(assetData),
      });
    },
    async update(id, assetData) {
      return API.request(`/assets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(assetData),
      });
    },
    async delete(id) {
      return API.request(`/assets/${id}`, {
        method: 'DELETE',
      });
    }
  }
};

// ================= UTILITÁRIOS & FORMATAÇÕES BRASILEIRAS =================

// Previne vulnerabilidades de Cross-Site Scripting (XSS)
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Formatação Monetária: Real (R$)
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

// Converte string de R$ formatado de volta para Float
function parseBRL(valueStr) {
  if (!valueStr) return 0;
  const cleanStr = valueStr
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

// Máscara monetária em tempo real nos inputs
function applyBRLMask(input) {
  input.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (!value) {
      e.target.value = '';
      return;
    }
    const numberValue = parseFloat(value) / 100;
    e.target.value = formatBRL(numberValue);
  });

  // Ao focar, preenche se estiver vazio para guiar o usuário
  input.addEventListener('focus', (e) => {
    if (!e.target.value) {
      e.target.value = formatBRL(0);
    }
  });
}

// Formatação de data ISO (YYYY-MM-DD) para formato brasileiro (DD/MM/AAAA)
function formatDateBR(dateStr) {
  if (!dateStr) return 'Sem prazo';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Toast Notificações
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

// Sincronização do aria-invalid para Acessibilidade
function syncAria(element) {
  if (element && element.matches) {
    const isInvalid = element.matches(':user-invalid');
    element.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  }
}

// ================= NAVEGAÇÃO / ROTEADOR SPA =================
function showView(viewName) {
  state.activeView = viewName;

  // Esconder todas as visões
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.add('hidden');
  });

  // Mostrar a visão ativa
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  // Atualizar itens de navegação (Sidebar & Mobile Nav)
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Disparar requisições de carga de dados correspondentes
  if (viewName === 'dashboard') {
    loadDashboardData();
  } else if (viewName === 'wallets') {
    loadWalletsData();
  }
}

// ================= RENDERIZADORES DE INTERFACE (UI) =================

// Carrega dados da Visão Geral (Dashboard)
async function loadDashboardData() {
  try {
    state.wallets = await API.wallets.list();
    state.assets = await API.assets.list();

    renderDashboardOverview();
  } catch (error) {
    console.error('Erro ao carregar Dashboard:', error);
    showToast('Falha ao carregar dados do painel.', 'danger');
  }
}

// Renderiza os Cards e Gráficos da Visão Geral
function renderDashboardOverview() {
  let totalInvestedVal = 0;
  let totalUpdatedVal = 0;

  // Mapa para somar os valores atualizados por carteira
  const walletValues = {};
  state.wallets.forEach(w => {
    walletValues[w.id] = { name: w.name, invested: 0, updated: 0, goal: w.goal };
  });

  state.assets.forEach(asset => {
    totalInvestedVal += asset.price;
    totalUpdatedVal += asset.updated_price;

    if (walletValues[asset.wallet_id]) {
      walletValues[asset.wallet_id].invested += asset.price;
      walletValues[asset.wallet_id].updated += asset.updated_price;
    }
  });

  // Atualiza os Cards Superiores
  document.getElementById('total-invested').innerText = formatBRL(totalInvestedVal);
  document.getElementById('total-updated').innerText = formatBRL(totalUpdatedVal);

  const yieldVal = totalUpdatedVal - totalInvestedVal;
  const yieldPercentage = totalInvestedVal > 0 ? (yieldVal / totalInvestedVal) * 100 : 0;
  
  const yieldEl = document.getElementById('total-yield');
  const yieldBadge = document.getElementById('yield-percentage');
  const yieldIcon = document.getElementById('yield-icon');

  yieldEl.innerText = formatBRL(yieldVal);
  yieldBadge.innerText = `${yieldVal >= 0 ? '+' : ''}${yieldPercentage.toFixed(1)}%`;
  
  if (yieldVal >= 0) {
    yieldEl.className = 'value text-success';
    yieldBadge.className = 'yield-badge positive';
    yieldIcon.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>';
  } else {
    yieldEl.className = 'value text-danger';
    yieldBadge.className = 'yield-badge negative';
    yieldIcon.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>';
  }

  // Prepara dados do Gráfico (Valores por Carteira)
  const chartData = Object.values(walletValues)
    .filter(item => item.updated > 0)
    .map(item => ({ name: item.name, value: item.updated }));
  
  renderDonutChart(chartData);

  // Preenche a Tabela do Dashboard
  const tableBody = document.querySelector('#dashboard-wallets-table tbody');
  tableBody.innerHTML = '';

  if (state.wallets.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center">Nenhuma carteira cadastrada.</td>
      </tr>
    `;
    return;
  }

  state.wallets.forEach(w => {
    const data = walletValues[w.id];
    const progressPercent = w.goal > 0 ? Math.min(100, (data.updated / w.goal) * 100) : 0;
    
    // Define cor da barra
    let progressColorClass = 'progress-orange';
    if (progressPercent >= 100) progressColorClass = 'progress-green';
    else if (progressPercent >= 50) progressColorClass = 'progress-blue';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="text-bold">${escapeHTML(w.name)}</td>
      <td>${formatBRL(w.goal)}</td>
      <td>${formatBRL(data.invested)}</td>
      <td class="text-bold">${formatBRL(data.updated)}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div class="progress-bar-container" style="flex: 1; height: 6px;">
            <div class="progress-bar-fill ${progressColorClass}" style="width: ${progressPercent}%"></div>
          </div>
          <span style="font-size: 0.75rem; font-weight:600; min-width: 30px;">${progressPercent.toFixed(0)}%</span>
        </div>
      </td>
    `;
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => showWalletDetails(w.id));
    tableBody.appendChild(row);
  });
}

// Renderizador do Gráfico de Rosca SVG
function renderDonutChart(data) {
  const container = document.getElementById('chart-container');
  const legend = document.getElementById('chart-legend');
  container.innerHTML = '';
  legend.innerHTML = '';

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    container.innerHTML = `
      <svg width="180" height="180" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="20" />
        <text x="100" y="105" text-anchor="middle" fill="#64748b" font-size="12">Sem ativos</text>
      </svg>
    `;
    legend.innerHTML = '<div class="legend-item text-muted">Nenhum valor atualizado para exibir.</div>';
    return;
  }

  let svgContent = `<svg width="180" height="180" viewBox="0 0 200 200">`;
  let accumulatedAngle = -90;

  const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e'];

  data.forEach((item, index) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const color = colors[index % colors.length];

    const radStart = (accumulatedAngle * Math.PI) / 180;
    const radEnd = ((accumulatedAngle + angle) * Math.PI) / 180;

    const x1 = 100 + 70 * Math.cos(radStart);
    const y1 = 100 + 70 * Math.sin(radStart);
    const x2 = 100 + 70 * Math.cos(radEnd);
    const y2 = 100 + 70 * Math.sin(radEnd);

    const largeArcFlag = angle > 180 ? 1 : 0;

    // Quando é exatamente 100%, renderiza um círculo completo
    if (percentage >= 0.999) {
      svgContent += `<circle cx="100" cy="100" r="70" fill="none" stroke="${color}" stroke-width="20" />`;
    } else {
      svgContent += `
        <path 
          d="M ${x1} ${y1} A 70 70 0 ${largeArcFlag} 1 ${x2} ${y2}" 
          fill="none" 
          stroke="${color}" 
          stroke-width="20"
        />
      `;
    }

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-color" style="background: ${color}"></span>
      <span title="${escapeHTML(item.name)}">${escapeHTML(item.name)}: ${formatBRL(item.value)}</span>
    `;
    legend.appendChild(legendItem);

    accumulatedAngle += angle;
  });

  svgContent += `
    <circle cx="100" cy="100" r="50" fill="transparent" />
    <text x="100" y="95" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="500">VALOR TOTAL</text>
    <text x="100" y="115" text-anchor="middle" fill="#f8fafc" font-size="13" font-weight="700">${formatBRL(total)}</text>
  </svg>`;

  container.innerHTML = svgContent;
}

// Carrega e renderiza a Visão de Carteiras
async function loadWalletsData() {
  try {
    state.wallets = await API.wallets.list();
    state.assets = await API.assets.list();
    renderWalletsGrid();
  } catch (error) {
    console.error('Erro ao carregar carteiras:', error);
    showToast('Erro ao carregar carteiras.', 'danger');
  }
}

// Renderiza o grid de cards de carteiras
function renderWalletsGrid() {
  const container = document.getElementById('wallets-grid-container');
  container.innerHTML = '';

  if (state.wallets.length === 0) {
    container.innerHTML = `
      <div class="card glass text-center" style="grid-column: 1/-1; padding: 3rem; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
        <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(99, 102, 241, 0.1); color: var(--color-primary); display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
        </div>
        <h2 style="margin-top: 0.5rem;">Nenhuma carteira criada</h2>
        <p class="text-muted" style="margin-bottom: 0.5rem;">Crie carteiras para gerenciar seus diferentes objetivos financeiros.</p>
        <button class="btn btn-primary" onclick="openWalletDialog()"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:3px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Criar Minha Primeira Carteira</button>
      </div>
    `;
    return;
  }

  // Mapeia valor atualizado de cada carteira
  const walletUpdatedSums = {};
  state.assets.forEach(asset => {
    walletUpdatedSums[asset.wallet_id] = (walletUpdatedSums[asset.wallet_id] || 0) + asset.updated_price;
  });

  state.wallets.forEach(w => {
    const currentVal = walletUpdatedSums[w.id] || 0;
    const progressPercent = w.goal > 0 ? Math.min(100, (currentVal / w.goal) * 100) : 0;

    let progressColorClass = 'progress-orange';
    if (progressPercent >= 100) progressColorClass = 'progress-green';
    else if (progressPercent >= 50) progressColorClass = 'progress-blue';

    const card = document.createElement('div');
    card.className = 'card glass wallet-card';
    
    let badgeHtml = `<span class="wallet-badge">${progressPercent.toFixed(0)}%</span>`;
    let ownerHtml = '';
    let actionsHtml = `
      <div class="wallet-card-actions">
        <button class="btn-card-edit" data-id="${w.id}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Editar</button>
        <button class="btn-card-delete" data-id="${w.id}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Excluir</button>
      </div>
    `;
    
    if (w.is_owner === 0) {
      badgeHtml = `<span class="wallet-badge" style="background: var(--color-primary); color: white;">Compartilhada</span>`;
      ownerHtml = `<p class="wallet-date" style="color: var(--color-primary); margin-bottom: 0.2rem;">Por: ${escapeHTML(w.owner_name)}</p>`;
      actionsHtml = '';
    }

    card.innerHTML = `
      <div class="wallet-card-header">
        <h2>${escapeHTML(w.name)}</h2>
        ${badgeHtml}
      </div>
      
      ${ownerHtml}
      <p class="wallet-date">Prazo: ${formatDateBR(w.end_date)}</p>
      
      <div class="wallet-current-info">
        <span class="wallet-goal-info">Valor Acumulado</span>
        <span class="amount">${formatBRL(currentVal)}</span>
      </div>
      
      <div class="wallet-goal-info">
        <span>Meta</span>
        <span class="text-bold">${formatBRL(w.goal)}</span>
      </div>
      
      <div class="progress-bar-container">
        <div class="progress-bar-fill ${progressColorClass}" style="width: ${progressPercent}%"></div>
      </div>

      ${actionsHtml}
    `;

    // Clique no card abre os detalhes
    card.addEventListener('click', (e) => {
      // Ignora clique se for nos botões de ação do card
      if (e.target.closest('.wallet-card-actions')) return;
      showWalletDetails(w.id);
    });

    // Eventos de Editar/Excluir (apenas para o dono)
    if (w.is_owner !== 0) {
      card.querySelector('.btn-card-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openWalletDialog(w);
      });

      card.querySelector('.btn-card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteWallet(w);
      });
    }

    container.appendChild(card);
  });
}

// Abre a Visão de Detalhes da Carteira
async function showWalletDetails(walletId) {
  state.activeWalletId = walletId;
  
  try {
    const wallets = await API.wallets.list();
    const wallet = wallets.find(w => w.id === walletId);
    
    if (!wallet) {
      showToast('Carteira não encontrada.', 'danger');
      return;
    }

    const assets = await API.assets.list(walletId);
    
    // Atualiza cabeçalhos
    document.getElementById('detail-wallet-name').innerText = wallet.name;
    document.getElementById('detail-wallet-meta').innerText = `Meta: ${formatBRL(wallet.goal)} | Prazo: ${formatDateBR(wallet.end_date)}${wallet.is_owner === 0 ? ' | Compartilhada' : ''}`;
    
    // Configuração de botões
    const editBtn = document.getElementById('btn-edit-wallet-current');
    const shareBtn = document.getElementById('btn-share-wallet');
    
    if (wallet.is_owner === 1) {
      editBtn.style.display = 'inline-block';
      editBtn.onclick = () => openWalletDialog(wallet);
      shareBtn.style.display = 'inline-block';
      shareBtn.onclick = () => openShareDialog(wallet);
    } else {
      editBtn.style.display = 'none';
      shareBtn.style.display = 'none';
    }

    // Cálculos de Resumo
    let totalApplied = 0;
    let totalUpdated = 0;

    assets.forEach(a => {
      totalApplied += a.price;
      totalUpdated += a.updated_price;
    });

    const totalYield = totalUpdated - totalApplied;
    const progressPercent = wallet.goal > 0 ? Math.min(100, (totalUpdated / wallet.goal) * 100) : 0;

    // Atualiza Progresso da Carteira
    document.getElementById('detail-progress-percentage').innerText = `${progressPercent.toFixed(1)}%`;
    const barEl = document.getElementById('detail-progress-bar');
    barEl.style.width = `${progressPercent}%`;
    
    barEl.className = 'progress-bar-fill';
    if (progressPercent >= 100) barEl.classList.add('progress-green');
    else if (progressPercent >= 50) barEl.classList.add('progress-blue');
    else barEl.classList.add('progress-orange');

    // Atualiza Métricas
    document.getElementById('detail-applied-val').innerText = formatBRL(totalApplied);
    document.getElementById('detail-updated-val').innerText = formatBRL(totalUpdated);
    
    const yieldValEl = document.getElementById('detail-yield-val');
    yieldValEl.innerText = `${totalYield >= 0 ? '+' : ''}${formatBRL(totalYield)}`;
    yieldValEl.className = `value ${totalYield >= 0 ? 'text-success' : 'text-danger'}`;

    // Renderiza a Tabela de Ativos
    const tbody = document.getElementById('assets-table-body');
    tbody.innerHTML = '';

    if (assets.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">Nenhum ativo cadastrado nesta carteira.</td>
        </tr>
      `;
    } else {
      assets.forEach(a => {
        const assetYield = a.updated_price - a.price;
        const assetYieldPercent = a.price > 0 ? (assetYield / a.price) * 100 : 0;

        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="text-bold">${escapeHTML(a.name)}</td>
          <td><span class="bank-tag">${escapeHTML(a.bank)}</span></td>
          <td>${formatBRL(a.price)}</td>
          <td class="text-bold">${formatBRL(a.updated_price)}</td>
          <td class="${assetYield >= 0 ? 'text-success' : 'text-danger'} text-bold">
            ${assetYield >= 0 ? '+' : ''}${formatBRL(assetYield)} (${assetYieldPercent.toFixed(1)}%)
          </td>
          <td>${formatDateBR(a.created_date)}</td>
          <td>${formatDateBR(a.expiration_date)}</td>
          <td>
            <div class="asset-actions">
              <button class="btn-table-action update" title="Atualizar preço rápido" data-id="${a.id}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:3px;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> Valor</button>
              <button class="btn-table-action edit" title="Editar Ativo" data-id="${a.id}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
              <button class="btn-table-action delete" title="Excluir Ativo" data-id="${a.id}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </td>
        `;

        // Vincula eventos das ações da tabela
        row.querySelector('.btn-table-action.update').onclick = () => openPriceUpdateDialog(a);
        row.querySelector('.btn-table-action.edit').onclick = () => openAssetDialog(a);
        row.querySelector('.btn-table-action.delete').onclick = () => confirmDeleteAsset(a);

        tbody.appendChild(row);
      });
    }

    // Altera tela
    state.activeView = 'wallet-details';
    document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));
    document.getElementById('view-wallet-details').classList.remove('hidden');

  } catch (error) {
    console.error('Erro ao carregar detalhes da carteira:', error);
    showToast('Falha ao abrir carteira.', 'danger');
  }
}

// ================= DIALOGS / FORMULÁRIOS EVENTOS =================

// Modal de Carteira: Abrir para criação (sem param) ou edição (com carteira object)
const walletDialog = document.getElementById('wallet-dialog');
function openWalletDialog(wallet = null) {
  const form = document.getElementById('wallet-form');
  form.reset();
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  
  if (wallet) {
    document.getElementById('wallet-dialog-title').innerText = 'Editar Carteira';
    document.getElementById('wallet-id-input').value = wallet.id;
    document.getElementById('wallet-name').value = wallet.name;
    document.getElementById('wallet-goal').value = formatBRL(wallet.goal);
    document.getElementById('wallet-end-date').value = wallet.end_date || '';
  } else {
    document.getElementById('wallet-dialog-title').innerText = 'Nova Carteira';
    document.getElementById('wallet-id-input').value = '';
    document.getElementById('wallet-goal').value = formatBRL(0);
  }
  
  walletDialog.showModal();
}

// Fechar Modal Carteira
document.getElementById('btn-close-wallet-dialog').onclick = () => walletDialog.close();
document.getElementById('btn-cancel-wallet').onclick = () => walletDialog.close();

// Modal de Ativo: Abrir para criação (sem param) ou edição (com ativo object)
const assetDialog = document.getElementById('asset-dialog');
function openAssetDialog(asset = null) {
  const form = document.getElementById('asset-form');
  form.reset();
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));

  // Preenche data atual como sugestão ao criar
  const today = new Date().toISOString().split('T')[0];

  if (asset) {
    document.getElementById('asset-dialog-title').innerText = 'Editar Ativo';
    document.getElementById('asset-id-input').value = asset.id;
    document.getElementById('asset-name').value = asset.name;
    document.getElementById('asset-bank').value = asset.bank;
    document.getElementById('asset-price').value = formatBRL(asset.price);
    document.getElementById('asset-updated-price').value = formatBRL(asset.updated_price);
    document.getElementById('asset-created-date').value = asset.created_date;
    document.getElementById('asset-expiration-date').value = asset.expiration_date || '';
  } else {
    document.getElementById('asset-dialog-title').innerText = 'Novo Ativo';
    document.getElementById('asset-id-input').value = '';
    document.getElementById('asset-price').value = formatBRL(0);
    document.getElementById('asset-updated-price').value = formatBRL(0);
    document.getElementById('asset-created-date').value = today;
  }

  assetDialog.showModal();
}

// Fechar Modal Ativo
document.getElementById('btn-close-asset-dialog').onclick = () => assetDialog.close();
document.getElementById('btn-cancel-asset').onclick = () => assetDialog.close();

// Modal de Preço Rápido: Abrir
const priceDialog = document.getElementById('price-update-dialog');
function openPriceUpdateDialog(asset) {
  const form = document.getElementById('price-update-form');
  form.reset();
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));

  document.getElementById('price-asset-id-input').value = asset.id;
  document.getElementById('price-asset-name-label').innerText = `Ativo: ${asset.name} (${asset.bank})`;
  document.getElementById('price-updated-val').value = formatBRL(asset.updated_price);

  priceDialog.showModal();
}

// Fechar Modal Preço Rápido
document.getElementById('btn-close-price-dialog').onclick = () => priceDialog.close();
document.getElementById('btn-cancel-price').onclick = () => priceDialog.close();


// Confirmar Exclusão de Carteira
async function confirmDeleteWallet(wallet) {
  if (confirm(`Tem certeza de que deseja excluir a carteira "${wallet.name}"? Isso excluirá permanentemente todos os ativos cadastrados nela.`)) {
    try {
      await API.wallets.delete(wallet.id);
      showToast('Carteira excluída com sucesso!');
      loadWalletsData();
    } catch (error) {
      showToast(error.message, 'danger');
    }
  }
}

// Confirmar Exclusão de Ativo
async function confirmDeleteAsset(asset) {
  if (confirm(`Tem certeza de que deseja remover o ativo "${asset.name}"?`)) {
    try {
      await API.assets.delete(asset.id);
      showToast('Ativo excluído com sucesso!');
      showWalletDetails(state.activeWalletId);
    } catch (error) {
      showToast(error.message, 'danger');
    }
  }
}

// ================= INICIALIZAÇÃO DA SESSÃO DO USUÁRIO =================
async function checkAuth() {
  const userId = localStorage.getItem('zeca_userId');
  if (!userId) {
    showAuthScreen();
    return;
  }

  try {
    const data = await API.auth.getMe();
    state.user = data.user;
    
    // Atualiza nome exibido
    document.getElementById('user-name-display').innerText = state.user.name;
    document.getElementById('user-email-display').innerText = state.user.email;
    document.getElementById('user-avatar').innerText = state.user.name.charAt(0).toUpperCase();
    document.getElementById('dashboard-welcome').innerText = `Olá, ${state.user.name.split(' ')[0]}!`;

    showAppScreen();
  } catch (error) {
    console.error('Falha de sessão ativa:', error);
    localStorage.removeItem('zeca_userId');
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-container').classList.remove('hidden');
}

function showAppScreen() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  showView('dashboard');
}

// ================= SUBMISSÕES DE FORMULÁRIO =================

// Submit: Login
document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  
  // Valida campos obrigatórios
  const emailInput = document.getElementById('login-email');
  if (!form.checkValidity()) {
    form.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }

  const email = emailInput.value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await API.auth.login(email, password);
    localStorage.setItem('zeca_userId', data.user.id);
    showToast('Bem-vindo ao Zeca!');
    checkAuth();
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

// Submit: Registro
document.getElementById('register-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

  if (!form.checkValidity()) {
    form.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }

  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  try {
    const data = await API.auth.register(name, email, password);
    localStorage.setItem('zeca_userId', data.user.id);
    showToast('Conta criada com sucesso!');
    checkAuth();
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

// Submit: Salvar Carteira (Criação/Edição)
document.getElementById('wallet-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

  if (!form.checkValidity()) {
    form.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }

  const id = document.getElementById('wallet-id-input').value;
  const name = document.getElementById('wallet-name').value;
  const goal = parseBRL(document.getElementById('wallet-goal').value);
  const end_date = document.getElementById('wallet-end-date').value;

  const walletData = { name, goal, end_date };

  try {
    if (id) {
      await API.wallets.update(id, walletData);
      showToast('Carteira atualizada com sucesso!');
    } else {
      await API.wallets.create(walletData);
      showToast('Carteira criada com sucesso!');
    }
    walletDialog.close();
    
    // Atualiza a tela atual
    if (state.activeView === 'wallet-details') {
      showWalletDetails(state.activeWalletId);
    } else {
      loadWalletsData();
    }
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

// Submit: Salvar Ativo (Criação/Edição)
document.getElementById('asset-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

  if (!form.checkValidity()) {
    form.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }

  const id = document.getElementById('asset-id-input').value;
  const name = document.getElementById('asset-name').value;
  const bank = document.getElementById('asset-bank').value;
  const price = parseBRL(document.getElementById('asset-price').value);
  const updated_price = parseBRL(document.getElementById('asset-updated-price').value);
  const created_date = document.getElementById('asset-created-date').value;
  const expiration_date = document.getElementById('asset-expiration-date').value;
  const wallet_id = state.activeWalletId;

  const assetData = { name, bank, price, updated_price, created_date, expiration_date, wallet_id };

  try {
    if (id) {
      await API.assets.update(id, assetData);
      showToast('Ativo atualizado com sucesso!');
    } else {
      await API.assets.create(assetData);
      showToast('Ativo cadastrado com sucesso!');
    }
    assetDialog.close();
    showWalletDetails(state.activeWalletId);
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

// Submit: Atualização Rápida de Preço do Ativo
document.getElementById('price-update-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

  if (!form.checkValidity()) {
    form.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }

  const assetId = document.getElementById('price-asset-id-input').value;
  const updated_price = parseBRL(document.getElementById('price-updated-val').value);

  try {
    // Busca informações completas do ativo para atualizar
    const assets = await API.assets.list(state.activeWalletId);
    const asset = assets.find(a => a.id === parseInt(assetId, 10));

    if (!asset) {
      showToast('Ativo não encontrado.', 'danger');
      return;
    }

    const assetData = {
      name: asset.name,
      bank: asset.bank,
      price: asset.price,
      updated_price,
      created_date: asset.created_date,
      expiration_date: asset.expiration_date
    };

    await API.assets.update(assetId, assetData);
    showToast('Valor atualizado com sucesso!');
    priceDialog.close();
    showWalletDetails(state.activeWalletId);
  } catch (error) {
    showToast(error.message, 'danger');
  }
};


// ================= GESTÃO DE COMPARTILHAMENTO =================

const shareDialog = document.getElementById('share-dialog');
const shareForm = document.getElementById('share-form');
const shareMembersUl = document.getElementById('share-members-ul');
const btnCloseShare = document.getElementById('btn-close-share-dialog');

async function openShareDialog(wallet) {
  state.activeWalletId = wallet.id;
  await loadSharesList();
  shareDialog.showModal();
}

async function loadSharesList() {
  try {
    const shares = await API.wallets.getShares(state.activeWalletId);
    shareMembersUl.innerHTML = '';
    
    if (shares.length === 0) {
      shareMembersUl.innerHTML = '<li class="text-muted" style="text-align: center; font-size: 0.9rem;">Ninguém além de você tem acesso.</li>';
    } else {
      shares.forEach(user => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '0.5rem';
        li.style.background = 'rgba(255,255,255,0.05)';
        li.style.borderRadius = '8px';
        
        li.innerHTML = `
          <div>
            <strong>${escapeHTML(user.name)}</strong><br>
            <small class="text-muted">${escapeHTML(user.email)}</small>
          </div>
          <button class="btn-table-action delete" title="Revogar acesso" onclick="revokeShare(${user.id})">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        `;
        shareMembersUl.appendChild(li);
      });
    }
  } catch (error) {
    showToast('Erro ao carregar membros.', 'danger');
  }
}

shareForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!shareForm.checkValidity()) {
    shareForm.querySelectorAll('input[required]').forEach(syncAria);
    return;
  }
  
  const email = document.getElementById('share-email').value.trim();
  try {
    await API.wallets.addShare(state.activeWalletId, email);
    showToast('Carteira compartilhada com sucesso!');
    shareForm.reset();
    await loadSharesList();
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

window.revokeShare = async (userId) => {
  if (!confirm('Deseja realmente revogar o acesso deste usuário?')) return;
  try {
    await API.wallets.removeShare(state.activeWalletId, userId);
    showToast('Acesso revogado.');
    await loadSharesList();
  } catch (error) {
    showToast(error.message, 'danger');
  }
};

btnCloseShare.onclick = () => {
  shareDialog.close();
  shareForm.reset();
};


// ================= EVENT LISTENERS GERAIS =================

// Alternância de Telas Auth
document.getElementById('go-to-register').onclick = () => {
  document.getElementById('login-form').classList.remove('active');
  document.getElementById('register-form').classList.add('active');
};

document.getElementById('go-to-login').onclick = () => {
  document.getElementById('register-form').classList.remove('active');
  document.getElementById('login-form').classList.add('active');
};

// Navegação do Painel (Desktop Sidebar)
document.querySelectorAll('.sidebar-nav .nav-item').forEach(button => {
  button.onclick = (e) => {
    const view = e.target.closest('.nav-item').getAttribute('data-view');
    showView(view);
  };
});

// Navegação do Painel (Mobile Navigation)
document.querySelectorAll('.mobile-nav .mobile-nav-item').forEach(button => {
  button.onclick = (e) => {
    const view = e.target.closest('.mobile-nav-item').getAttribute('data-view');
    showView(view);
  };
});

// Botão de Nova Carteira
document.getElementById('btn-new-wallet').onclick = () => openWalletDialog();

// Botão de Novo Ativo
document.getElementById('btn-new-asset').onclick = () => openAssetDialog();

// Botão Voltar para Carteiras
document.getElementById('btn-back-to-wallets').onclick = () => showView('wallets');

// Logout (Sair)
const logout = () => {
  localStorage.removeItem('zeca_userId');
  state.user = null;
  showAuthScreen();
};
document.getElementById('logout-btn').onclick = logout;
document.getElementById('mobile-logout-btn').onclick = logout;

// Eventos de Validação de Input (Blur para acionar :user-invalid e sincronizar ARIA)
document.querySelectorAll('input[required], select[required]').forEach(el => {
  el.addEventListener('blur', () => syncAria(el));
  el.addEventListener('input', () => {
    if (el.hasAttribute('aria-invalid')) {
      syncAria(el);
    }
  });
});

// Aplicar Máscaras Monetárias
applyBRLMask(document.getElementById('wallet-goal'));
applyBRLMask(document.getElementById('asset-price'));
applyBRLMask(document.getElementById('asset-updated-price'));
applyBRLMask(document.getElementById('price-updated-val'));


// ================= EXECUÇÃO INICIAL =================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
