# 🛡️ REGRAS DE BLINDAGEM DO SISTEMA E CHECKLIST PRÉ-DEPLOY
> **APIÁRIO FAVO DE MEL - BOT WHATSAPP & PAINEL DE ATENDIMENTO**  
> *DOCUMENTO DE LEITURA OBRIGATÓRIA ANTES DE QUALQUER ALTERAÇÃO EM CÓDIGO OU BANCO DE DADOS.*

---

## 🎯 OBJETIVO DESTE MANUAL
Este documento reúne todas as regras críticas de arquitetura, integridade de dados e comportamento de mensageria aprendidas em produção.  
**O desrespeito a qualquer regra deste documento causa regressão imediata de bugs já resolvidos** (como conversas triplicadas, mensagens do celular que não aparecem no painel web, ou menus quebrados).

---

## 🛑 AS 5 REGRAS DE OURO INVIOLÁVEIS (O QUE NUNCA ALTERAR)

### 1. Canonicidade Telefônica e Agrupamento de JIDs (Brasil)
* **O Problema Histórico:** O WhatsApp brasileiro opera com variações do 9º dígito móvel (ex: `557988562587@s.whatsapp.net` vs `5579988562587@s.whatsapp.net`) e chamadas internas/scripts podem passar números sem DDI (`79988562587`). Isso causava a criação de até 3 conversas para a mesma pessoa no banco.
* **A Blindagem:**
  - Todo identificador de cliente DEVE passar por `SessionService.normalizarId(id)` antes de qualquer busca ou inserção.
  - Para o Brasil (`55`), a chave de identidade real é sempre: **DDD (2 dígitos) + 8 últimos dígitos**.
  - `SessionService.obterOuCriarSessao` e `SessionService.gerarVariacoesId` SEMPRE buscam no banco se já existe uma sessão existente com qualquer uma das variações antes de criar uma nova.
  - `SessionService.salvarConversa` NUNCA deve alterar o `id_cliente` original canônico gravado no JSON da conversa.
  - A rota `GET /conversas` em `adminRoutes.js` SEMPRE deve aplicar o agrupamento por telefone base (`DDD + 8 dígitos`) e descartar sessões com 0 mensagens ou pertencentes ao próprio número da loja (`numeroLoja` / `557988125726`).
* 🚫 **O QUE NUNCA FAZER:**
  - NUNCA fazer query em `tb_bot_sessoes` usando apenas `WHERE id_cliente = $1` estrito sem considerar as variações de 8/9 dígitos.
  - NUNCA salvar um registro novo em `tb_crm_clientes` ou `tb_bot_sessoes` com número sem o DDI `55` (ex: `799...`).
  - NUNCA remover a desduplicação canônica em `src/routes/adminRoutes.js`.

---

### 2. Mensagens do Celular do Atendente vs. Painel Web (`fromMe: true`)
* **O Problema Histórico:** Quando o vendedor respondia pelo celular (WhatsApp físico), o webhook chegava com `fromMe: true`. Algoritmos ingênuos de desduplicação comparavam textos idênticos (`m.texto === textoTratado`) ou descartavam as mensagens achando que eram ecos do próprio bot. Como resultado, mensagens como "Ok", "Sim", "Boa tarde" ou links enviados pelo celular sumiam do painel.
* **A Blindagem:**
  - O sistema diferencia 3 origens de mensagens enviadas:
    1. **Robô (Bot Automático):** Registra o `msgId` gerado pela Evolution e guarda temporariamente na fila de ecos.
    2. **Painel Web (Atendente Web):** Registra o `msgId` ao disparar via API do painel.
    3. **Celular Físico do Vendedor (WhatsApp App/Desktop):** Recebido via webhook com `fromMe: true`, mas **sem** `msgId` prévio no cache de eco. **DEVE SEMPRE SER SALVO COMO `remetente: 'atendente'` e emitido via Socket.IO para o painel.**
  - A desduplicação de webhook repetido DEVE ser feita estritamente pelo `msgId` único do WhatsApp (com cache TTL de 15 minutos em `mensagensProcessadasCache`).
* 🚫 **O QUE NUNCA FAZER:**
  - NUNCA descartar mensagens baseando-se apenas em igualdade de texto (`texto === m.texto`). Vendedores repetem palavras rotineiramente!
  - NUNCA remover a emissão de `io.emit('nova_mensagem', ...)` no tratamento de `fromMe: true` em `WebhookController.js`.
  - NUNCA bloquear áudio (`audioMessage`/`ptt`), imagem ou documento enviado pelo celular do vendedor.

---

### 3. Integridade do Próprio Número da Loja e Contatos sem Nome
* **O Problema Histórico:**
  - O próprio WhatsApp da loja (`557988125726`) aparecia na lista de atendimentos como um cliente sem nome porque o sistema salvava mensagens de teste ou notificações para si mesmo.
  - Contatos sem cadastro no CRM ou com perfil do WhatsApp restrito apareciam apenas como `(79) 9...`.
* **A Blindagem:**
  - O número da loja definido em `process.env.STORE_PHONE` ou `557988125726` é permanentemente ignorado na listagem de clientes do painel de atendimento (`adminRoutes.js`).
  - Quando um contato não possui nome no WhatsApp (`pushName` vazio) nem cadastro prévio no CRM, o painel deve exibir o telefone formatado elegantemente: `(79) 98856-2587`, mas se houver pedido vinculado na tabela `pedidos`, o nome do pedido (`cliente_nome`) é herdado automaticamente.
* 🚫 **O QUE NUNCA FAZER:**
  - NUNCA deletar clientes do CRM sem verificar se existem pedidos atrelados em `pedidos` ou histórico no chat.
  - NUNCA permitir que o número da própria loja seja listado como cliente no painel.

---

### 4. Navegação Interativa e Links do Catálogo
* **O Problema Histórico:** O cliente ficava preso em menus se não digitasse exatamente `#` para voltar, ou links do site eram bloqueados pelo WhatsApp por falta de formatação correta.
* **A Blindagem:**
  - Toda resposta com opções de menu DEVE oferecer botões rápidos (`interactiveButtons` ou lista) com botão explícito de "⬅️ Voltar ao Início" e "🍯 Ver Catálogo".
  - O link do catálogo (`https://favodemel.store` ou link configurado) deve ser enviado tanto como link clicável no corpo da mensagem quanto em botão de URL (`type: "url"`).
* 🚫 **O QUE NUNCA FAZER:**
  - NUNCA forçar o cliente a adivinhar comandos de texto (como digitar `#` ou `SAIR`).
  - NUNCA remover o envio do link direto com preview.

---

### 5. Consciência Situacional da Inteligência Artificial (Escopo)
* **O Problema Histórico:** A IA entrava em loops de menus repetidos ou tentava responder sobre temas aleatórios sem consciência de quando transferir para o atendente humano.
* **A Blindagem:**
  - A IA só deve atuar quando a conversa estiver no estágio de dúvidas/informações gerais sobre os produtos do Apiário Favo de Mel.
  - Escopo autorizado da IA: Mel silvestre, mel de eucalipto, favo in natura, própolis verde/marrom, pólen, cera de abelha, formas de pagamento, prazos de entrega em Sergipe/Brasil e revenda/atacado.
  - Se o cliente solicitar humano, reclamar de cobrança/pedido atrasado, ou perguntar assuntos fora do escopo do apiário, o bot DEVE imediatamente alterar o estágio para `humano` e notificar o vendedor no painel.
* 🚫 **O QUE NUNCA FAZER:**
  - NUNCA responder dúvidas com outro menu repetido sem fornecer resposta explicativa antes.
  - NUNCA reativar o bot enquanto a conversa estiver em atendimento humano dentro do período de 24 horas.

---

## 📋 CHECKLIST PRÉ-ALTERAÇÃO & PRÉ-DEPLOY (ROTEIRO OBRIGATÓRIO)

Antes de realizar qualquer commit, migração de banco ou deploy em produção, execute este checklist:

### Etapa 1: Validação de Código Local
- [ ] **1.1 Testes Automatizados Unitários:**
  ```powershell
  npm test
  ```
- [ ] **1.2 Teste Específico de Sincronização do Celular e Webhook:**
  ```powershell
  node tests/test_vendedor_webhook.js
  ```
  *(Deve passar 100% de 7/7 asserções)*
- [ ] **1.3 Revisão do `git diff`:**
  Verifique se nenhuma regra de `normalizarId`, `gerarVariacoesId` ou `desduplicação por msgId` foi acidentalmente alterada ou revertida.

### Etapa 2: Validação de Banco de Dados (Postgres VPS)
- [ ] **2.1 Checar se existem JIDs duplicados para o mesmo número:**
  ```sql
  SELECT SUBSTRING(REPLACE(id_cliente, '@s.whatsapp.net', '') FROM '^(?:55)?(\d{2})9?(\d{8})$') as ddd,
         SUBSTRING(REPLACE(id_cliente, '@s.whatsapp.net', '') FROM '(\d{8})$') as base_num,
         COUNT(*) as total
  FROM tb_bot_sessoes
  GROUP BY 1, 2
  HAVING COUNT(*) > 1;
  ```
  *(Deve retornar 0 linhas duplicadas)*
- [ ] **2.2 Confirmar que o número da loja não possui sessão de chat:**
  ```sql
  SELECT id_cliente FROM tb_bot_sessoes WHERE id_cliente LIKE '%88125726%';
  ```

### Etapa 3: Deploy e Validação em Produção
- [ ] **3.1 Atualizar código no servidor:**
  ```bash
  ssh -i "D:\Download\ssh-key-2026-10-09.key" ubuntu@137.131.164.202 "cd /home/ubuntu/bots/favo-de-mel && git pull origin main && docker compose up -d --build bot-favo-de-mel"
  ```
- [ ] **3.2 Verificar logs do container em tempo real:**
  ```bash
  docker logs --tail 50 -f bot_favo_de_mel
  ```
- [ ] **3.3 Teste Real de Ponta a Ponta:**
  1. Abrir o painel web administrativo (`http://137.131.164.202/admin` ou porta correspondente).
  2. Verificar se Luiz aparece **exatamente UMA vez** na lista de conversas, com o histórico correto.
  3. Enviar uma mensagem pelo celular físico do WhatsApp para um cliente de teste.
  4. Confirmar que a mensagem aparece instantaneamente no painel web do atendente sem precisar atualizar a página (F5).
  5. Enviar uma mensagem pelo painel web e confirmar que não é duplicada nem reemitida em loop.

---

**Assinado e Blindado:** Equipe de Engenharia Apiário Favo de Mel  
*Data de última revisão e blindagem: 19 de Outubro de 2026*
