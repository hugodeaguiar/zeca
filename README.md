# Zeca - Gestão de Carteiras e Ativos

Zeca é uma aplicação web de gestão de ativos e carteiras financeiras, desenvolvida com foco em segurança, responsividade e uma experiência de usuário. Permite que os usuários cadastrem diferentes carteiras (ex: "Aposentadoria", "Reserva de Emergência"), adicionem ativos, acompanhem rendimentos e, de forma inovadora, **compartilhem carteiras** com familiares ou consultores.

## Funcionalidades

- **Múltiplas Carteiras**: Crie e acompanhe metas financeiras independentes.
- **Gestão de Ativos**: Controle os valores aplicados e atualizados de cada investimento.
- **Gráficos Dinâmicos**: Acompanhamento visual da distribuição da sua carteira através de gráficos interativos.
- **Compartilhamento de Carteira (Novo!)**: Compartilhe o acesso a uma carteira com outros usuários da plataforma. Os convidados poderão visualizar, adicionar, editar ou remover ativos da sua carteira de forma colaborativa, mas não poderão excluí-la ou gerenciar os acessos.
- **Layout Premium & Responsivo**: Design Glassmorphism interativo que se ajusta a dispositivos móveis e desktops perfeitamente.

## Tecnologias Utilizadas

Este projeto foi construído para ser leve, rápido e não possuir milhares de dependências (Zero-Dependencies Frontend e Backend enxuto).

- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Semântico e CSS3 puro.
- **Backend**: [Node.js](https://nodejs.org) v23+.
- **Framework Web**: [Express.js](https://expressjs.com/).
- **Banco de Dados**: [SQLite Nativo (`node:sqlite`)](https://nodejs.org/api/sqlite.html) integrado nativamente no Node.js v23+, sem necessidade de compilação ou pacotes binários externos como `sqlite3`.

## Como Instalar e Rodar Localmente

### Pré-requisitos
- **Node.js** v23.7.0 ou superior (Devido à utilização da lib nativa `node:sqlite`).

### Passos
1. Clone o repositório:
   ```bash
   git clone https://github.com/hugodeaguiar/zeca.git
   cd zeca
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. (Apenas em cenários de migração) Se você estiver atualizando de uma versão anterior com senhas em texto puro, rode a migração:
   ```bash
   node scripts/migrate_passwords.js
   ```

4. Inicie o servidor:
   ```bash
   npm run dev
   ```

5. Acesse no navegador:
   ```text
   http://localhost:3000
   ```

## Estrutura do Projeto

```text
zeca/
├── public/                 # Arquivos públicos do Frontend
│   ├── index.html          # SPA principal
│   ├── styles.css          # Estilos (Glassmorphism, Responsividade, Animações)
│   └── app.js              # Lógica de interface e chamadas API
├── scripts/                # Scripts de manutenção e utilitários
│   └── migrate_passwords.js # Script de migração de senhas em plain-text para scrypt
├── server.js               # Servidor Backend (Express) e regras de negócio
├── package.json            # Dependências e scripts npm
└── README.md               # Documentação
```

## 🤝 Contribuindo

Se você deseja contribuir para o Zeca, sinta-se livre para abrir um *Pull Request* ou relatar *Issues* no repositório oficial.

## 📄 Licença

Distribuído sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.
