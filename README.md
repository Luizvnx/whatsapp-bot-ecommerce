# 🐝 WhatsApp Bot - Automação de Atendimento

## 📖 Sobre o Projeto

Este projeto é um chatbot para WhatsApp focado em automação de atendimento e vendas. A aplicação foi projetada com uma arquitetura escalável e modularizada, evitando o acúmulo de complexidade e garantindo uma manutenção simplificada. O bot gerencia sessões de usuários, oferece navegação por menus dinâmicos e possui regras inteligentes de transbordo para garantir a melhor experiência ao cliente.

## ✨ Funcionalidades Principais

* **Navegação Dinâmica:** Menus e submenus de categorias renderizados a partir de configurações em JSON.
* **Transbordo Facilitado:** Presença de uma opção universal ("0 - Falar com atendente") em todos os níveis de menu.
* **Controle de Paciência (Anti-Loop):** O bot identifica quando o usuário não consegue navegar e pausa automaticamente a interação após duas respostas inválidas consecutivas, direcionando para o atendimento humano.
* **Gestão de Sessão (Timeouts):** Controle inteligente de estado com expiração automática de sessões inativas.
* **Modo Administrador:** Comandos de controle global (`/pausarbot`, `/ligarbot`) para gerenciar a operação em tempo real.
* **Silenciamento Inteligente (Handoff):** O bot entra em modo de pausa automaticamente assim que um atendente humano envia uma mensagem na conversa.

## 🏗️ Arquitetura e Padrões

O projeto foi refatorado utilizando boas práticas de engenharia de software para isolar responsabilidades:
* **Design Pattern Strategy:** O fluxo de conversa é dividido em estágios independentes (ex: `InicioStage`, `CategoriaStage`), facilitando a adição de novos comportamentos.
* **SessaoService:** Uma camada de serviço dedicada exclusivamente ao gerenciamento do estado, do timeout e da jornada do usuário durante o atendimento.

## 🚀 Tecnologias Utilizadas

* **Linguagem/Ambiente:** Node.js / JavaScript *(ou TypeScript, se estiver usando)*
* **Biblioteca WhatsApp:** *(Insira aqui a biblioteca utilizada, ex: Baileys, Venom-bot, WWebJS)*
* **Estrutura de Dados:** JSON para parametrização de menus.

## 🚧 Roadmap (Próximas Implementações)

- [ ] Integração com a API do Mercado Pago para geração e validação automática de Pix.
- [ ] Implementação de um Agente Conversacional avançado utilizando a API do Google Gemini.

## 🛠️ Como Executar Localmente

1. Clone este repositório:
   git clone [https://github.com/Luizvnx/whatsapp-bot-ecommerce.git](https://github.com/Luizvnx/whatsapp-bot-ecommerce.git)

Acesse o diretório do projeto:

2. Acesse o diretório do projeto
    cd NOME-DO-REPOSITORIO
    Instale as dependências:

3. Instale as dependências
    npm install
    
4. Configure as variáveis de ambiente (crie um arquivo .env baseado no .env.example).

5. Inicie a aplicação:
    npm start

6. Escaneie o QR Code exibido no terminal com o seu WhatsApp.