# Roadmap Oficial: Reconstrução do Site Apiário Favo de Mel & Catálogo Integrado

> **Projeto:** Apiário Favo de Mel (Remoção do WordPress & Criação do Catálogo Digital Integrado)  
> **Status:** 🚀 **FASES 1, 2, 3 E 4 CONCLUÍDAS - ARQUITETURA DESACOPLADA EM `site/`**  
> **Última Atualização:** 16/10/2026 00:10  
> **Arquitetura Base:** Node.js (Express), PostgreSQL, Evolution API (WhatsApp), Vanilla HTML5/CSS3/JS (Zero WordPress).  
> **Estrutura Desacoplada:** Pasta dedicada `site/` contendo o site institucional e o catálogo interativo, sem misturar com o bot de automação.

---

## 🗺️ Fases do Roadmap & Checklist de Entrega

### 🌟 Fase 1: Reconstrução do Site Institucional (Zero WordPress) [CONCLUÍDO]
*Objetivo:* Reproduzir fielmente o design do Apiário Favo de Mel em HTML5/CSS3 moderno e responsivo na pasta isolada `site/`, eliminando qualquer dependência de WordPress, Elementor ou PHP.
- [x] Extração e inventário de todos os 23 ativos visuais essenciais (logo, fotos do apiário, ícones, imagens de serviços).
- [x] Cópia dos ativos em alta resolução para `site/assets/images/` e `site/assets/products/`.
- [x] Criação do front-end limpo do site institucional em `site/index.html` e `site/css/style.css`:
  - [x] **Header:** Logo original, menu fluido (Início, Quem Somos, Produtos, Serviços, Contato) e botão de destaque para o Catálogo.
  - [x] **Hero Section:** Banner principal com slogan original, CTA de compra no WhatsApp e imagem em destaque do Kit Presente.
  - [x] **Números / Métricas:** Indicadores animados do apiário (+10 anos, 100% natural, etc.) via `site/js/main.js`.
  - [x] **Quem Somos:** História do Apiário Favo de Mel com foto do apicultor e compromisso sustentável.
  - [x] **Vitrine de Produtos em Destaque:** Cards elegantes com foto, descrição e botão "Comprar / Ver no Catálogo".
  - [x] **Nossos Serviços:** 4 serviços especializados com imagens originais (Resgate e Captura, Consultoria para Apiário, Manejo Apícola, Transferência de Abelhas).
  - [x] **Redes Sociais:** Chamada visual para o Instagram `@favodemel_apis`.
  - [x] **Contato & Localização:** Telefones, links WhatsApp diretos, horário de funcionamento e formulário rápido para WhatsApp.
- [x] Otimização para dispositivos móveis (100% responsivo, carregamento instantâneo).

---

### 🛒 Fase 2: Vitrine Digital & Catálogo Interativo (`/catalogo`) [CONCLUÍDO]
*Objetivo:* Criar a experiência de compra mobile-first onde o cliente navega por categorias, visualiza fotos reais dos produtos cadastrados no CRM/WhatsApp e adiciona ao carrinho.
- [x] Rota pública `/catalogo` com visual limpo, moderno e focado em conversão (`site/catalogo.html`).
- [x] Integração com API `GET /api/catalogo/produtos`: lista automaticamente todas as categorias e produtos ativos do banco PostgreSQL (`tb_produtos` e `tb_categorias`).
- [x] Filtro por categoria (pills horizontais deslizáveis) e campo de busca rápida em tempo real.
- [x] Cards de produtos com fotos reais, descrições, preços e stepper de quantidade dinâmico.
- [x] Gaveta de Carrinho Flutuante (*Floating Cart Drawer*) e Barra Flutuante Mobile:
  - [x] Contador de itens e subtotal em tempo real.
  - [x] Persistência do carrinho em `localStorage`.
  - [x] Ajuste de quantidade (+ / -) e remoção individual.
  - [x] Botão "Avançar para o Checkout".

---

### ⚡ Fase 3: Checkout Trem Delivery & Disparo para WhatsApp [CONCLUÍDO]
*Objetivo:* Checkout simples, sem fricção, sem necessidade de login prévio e com notificação instantânea para o vendedor no WhatsApp.
- [x] Modal de Checkout Trem Delivery em `site/catalogo.html`:
  - [x] Nome completo do cliente.
  - [x] Número de WhatsApp com máscara automática `(79) 99999-9999`.
  - [x] Modalidade: **Entrega** (com endereço completo) ou **Retirada no Apiário**.
  - [x] Formas de Pagamento selecionáveis:
    - **PIX:** Chave oficial `79988125726`, botão de copiar com feedback e orientações.
    - **Cartão na Entrega**.
    - **Dinheiro:** Com campo dinâmico de troco.
  - [x] Campo de observações adicionais.
- [x] Endpoint backend `POST /api/catalogo/pedidos`:
  - [x] Persistência do pedido na tabela `tb_pedidos`.
  - [x] Auto-registro ou atualização do cliente em `tb_crm_clientes`.
  - [x] Geração de oportunidade no CRM Kanban (`tb_crm_oportunidades`) na etapa "Aguardando Pagamento".
  - [x] Envio automático de notificação com resumo detalhado do pedido via Evolution API para o WhatsApp do Vendedor (`NUMERO_DA_LOJA`).
  - [x] Retorno da URL formatada do WhatsApp (`wa.me`) com o pedido montado e tela de confirmação.

---

### 🔄 Fase 4: Sincronização Bidirecional (Site <-> CRM <-> WhatsApp Bot) [CONCLUÍDO]
*Objetivo:* Garantir que qualquer produto adicionado, editado ou desativado no painel do CRM seja refletido instantaneamente no site e no bot de WhatsApp.
- [x] Endpoints administrativos em `src/routes/adminRoutes.js`:
  - `GET /admin/catalogo/produtos`
  - `POST /admin/catalogo/produtos`
  - `PUT /admin/catalogo/produtos/:id`
  - `PATCH /admin/catalogo/produtos/:id/toggle`
  - `DELETE /admin/catalogo/produtos/:id`
  - `GET /admin/catalogo/fotos-disponiveis`
- [x] Invalidação automática de cache em memória (`CatalogoService.invalidarCache()`) a cada alteração.
- [x] Inclusão de link do catálogo web nas respostas de categorias do bot (`CategoriaStage.js`).

---

### 📦 Fase 5: QA, Validação & Empacotamento para Hostinger [PRONTO]
*Objetivo:* Disponibilizar o pacote estático pronto para upload no `public_html` da Hostinger.
- [x] Pasta `site/` 100% autossuficiente (HTML, CSS, JS, Imagens de produtos e institucionais).
- [x] Compatibilidade com API local ou remota através da variável `window.FAVODEMEL_API_URL`.
