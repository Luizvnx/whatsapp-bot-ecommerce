const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');
const SessionService = require('../services/SessionService');

/*
// =========================================================================
// MÓDULOS DO FLUXO ANTERIOR DE PEDIDOS VIA CHAT (PRESERVADOS / COMENTADOS)
// Os pedidos e pagamentos agora são realizados no catálogo online: https://apiariofavodemel.com.br/catalogo
// =========================================================================
// const CategoriaStage = require('./CategoriaStage');
// const ResgateStage = require('./ResgateStage');
// const ConsultoriaStage = require('./ConsultoriaStage');
// const IaStage = require('./IaStage');
*/

class MenuPrincipalStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        // 1. Comando de retorno ao Início / Menu
        const termosVoltar = [
            '#', 'menu', '/menu', 'voltar', '/voltar', 'inicio', 'início', '0',
            'voltar ao inicio', 'voltar ao início', 'voltar ao menu',
            '🔙 voltar ao início', '🔙 voltar ao inicio', '🔙 voltar ao menu'
        ];
        if (termosVoltar.some(term => t === term || t.includes(term))) {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // 2. CLIQUE NO MENU INTERATIVO OU PEDIDO DIRETO DE CATÁLOGO:
        const comandosExatosCatalogo = [
            '1', 'catalogo', 'catálogo', 'catalog', 'link', 'site',
            'loja online', 'loja virtual',
            'ver catalogo', 'ver catálogo', 'conhecer catalogo', 'conhecer catálogo',
            'abrir catalogo', 'abrir catálogo', 'o link do catalogo', 'o link do catálogo',
            'link do catalogo', 'link do catálogo', 'site da loja', 'site da favo de mel',
            '🛍️ conhecer catálogo', '🛍️ conhecer catalogo', '🛍️ ver catálogo', '🛍️ ver catalogo'
        ];

        const isPedidoDiretoCatalogo = (
            comandosExatosCatalogo.includes(t) ||
            ((t.includes('catalogo') || t.includes('catálogo') || t.includes('link') || t.includes('site')) &&
             (t.startsWith('ver ') || t.startsWith('abrir ') || t.startsWith('manda ') || t.startsWith('envia ') || t.startsWith('o link') || t.startsWith('quero ver')))
        );

        // Se contiver ponto de interrogação ou palavras interrogativas de dúvida/preço/localização, NÃO é clique no menu de catálogo: deve ser respondido pela IA
        const isPerguntaDeDuvida = (
            t.includes('?') ||
            t.includes('onde') ||
            t.includes('qual') ||
            t.includes('quanto') ||
            t.includes('como') ||
            t.includes('tem ') ||
            t.includes('voces') ||
            t.includes('vocês')
        );

        const isCliqueOpcao1 = isPedidoDiretoCatalogo && !isPerguntaDeDuvida;

        if (isCliqueOpcao1) {
            sessao.etapa = 'menu_principal';
            sessao.errosConsecutivos = 0;

            const title = "🍯 Catálogo & Loja Online - Apiário Favo de Mel 🐝";
            const description = "Conheça toda a nossa linha de méis 100% puros e crus, favos frescos, própolis verde e vermelha, geleia real e produtos naturais colhidos com todo o cuidado direto do nosso apiário!\n\n👉 *Acesse nossa loja online para ver fotos, preços e comprar com entrega rápida:*\nhttps://apiariofavodemel.com.br/catalogo\n\n📦 *Entregamos com rapidez em toda Aracaju e enviamos para todo o Brasil!*";
            const fallback = `*${title}*\n\n${description}\n\n_(Para ver outras opções ou voltar ao menu inicial, escolha abaixo ou digite *#*)_`;

            // Envia card com menu interativo de navegação (botões do tipo reply que funcionam perfeitamente em todos os celulares)
            if (typeof msg.replyButtons === 'function') {
                await msg.replyButtons({
                    title,
                    description,
                    footer: "Apiário Favo de Mel",
                    buttons: [
                        { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                        { type: "reply", displayText: "❓ Dúvidas sobre Mel", id: "2" },
                        { type: "reply", displayText: "🐝 Outros Serviços", id: "3" }
                    ]
                }, fallback);
            } else {
                await msg.reply(fallback);
            }

            // Envia também o link puro isolado em texto para garantir geração de preview e clique direto em qualquer aparelho
            await msg.reply("https://apiariofavodemel.com.br/catalogo");
            return;
        }

        // 3. CLIQUE NO MENU INTERATIVO: Opção 2 - Dúvidas sobre Mel
        const isCliqueOpcao2 = (
            t === '2' ||
            t === 'duvidas sobre mel' ||
            t === 'dúvidas sobre mel' ||
            t === '❓ dúvidas sobre mel' ||
            t === '❓ duvidas sobre mel' ||
            t === 'duvidas' ||
            t === 'dúvidas'
        );

        if (isCliqueOpcao2) {
            sessao.etapa = 'conversando_com_ia';
            sessao.errosConsecutivos = 0;

            const descDuvidas = "Pode enviar sua pergunta aqui mesmo! Você gostaria de saber sobre nossos tipos de mel puro (Jataí, Uruçu, Melato, Silvestre), pureza, cristalização, própolis, revenda ou benefícios?\n\nEnvie sua dúvida abaixo que vamos te responder! 💛";

            if (typeof msg.replyButtons === 'function') {
                return await msg.replyButtons({
                    title: "❓ Dúvidas sobre Mel & Produtos da Colmeia",
                    description: descDuvidas,
                    footer: "Apiário Favo de Mel",
                    buttons: [
                        { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                        { type: "reply", displayText: "🛍️ Ver Catálogo", id: "1" }
                    ]
                }, `🍯 *Dúvidas sobre Mel & Produtos da Colmeia* 🐝\n\n${descDuvidas}\n\n_(Para ver o menu de opções, digite *#*.)_`);
            }

            return await msg.reply(`🍯 *Dúvidas sobre Mel & Produtos da Colmeia* 🐝\n\n${descDuvidas}\n\n_(Para ver o menu de opções, digite *#*.)_`);
        }

        // 4. CLIQUE NO MENU INTERATIVO: Opção 3 - Outros Serviços
        const isCliqueOpcao3 = (
            t === '3' ||
            t === 'outros servicos' ||
            t === 'outros serviços' ||
            t === '🐝 outros serviços' ||
            t === '🐝 outros servicos' ||
            t === 'atendente' ||
            t === 'humano' ||
            t === 'atendente humano' ||
            t === 'falar com atendente' ||
            t === 'falar com humano'
        );

        if (isCliqueOpcao3) {
            const descOutros = "Entendido! Seja para retirada e resgate seguro de abelhas, revenda de produtos no atacado ou outras parcerias comerciais, nossa equipe já foi notificada. Um atendente humano responderá você por aqui em instantes! 💛\n\n_(Para acessar nosso catálogo online: https://apiariofavodemel.com.br/catalogo)_";

            if (typeof msg.replyButtons === 'function') {
                await msg.replyButtons({
                    title: "🐝 Outros Serviços & Atendimento",
                    description: descOutros,
                    footer: "Apiário Favo de Mel",
                    buttons: [
                        { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                        { type: "reply", displayText: "🛍️ Ver Catálogo", id: "1" }
                    ]
                }, `🐝 *Outros Serviços & Atendimento Personalizado* 👨‍🌾\n\n${descOutros}\n\n_(Para ver o menu de opções, digite *#*.)_`);
            } else {
                await msg.reply(`🐝 *Outros Serviços & Atendimento Personalizado* 👨‍🌾\n\n${descOutros}\n\n_(Para ver o menu de opções, digite *#*.)_`);
            }
            return await this.transferirParaHumano(msg, sessao);
        }

        // 5. QUALQUER OUTRA MENSAGEM (O CLIENTE NÃO SELECIONOU 1, 2 OU 3):
        // Conforme a regra de negócio definida: as boas-vindas são enviadas apenas na 1ª mensagem.
        // Se o cliente enviar qualquer mensagem sem selecionar 1, 2 ou 3 (seja saudação, dúvida ou texto livre),
        // o robô não repete o menu em looping: transfere imediatamente para a equipe humana.
        const descTransferencia = "Olá! Recebi sua mensagem. Como você não selecionou uma das opções do menu, já estou transferindo seu atendimento para a nossa equipe humana para te auxiliar da melhor forma. Em instantes um de nossos atendentes irá te responder por aqui! 🐝💛\n\n👉 *Nosso Catálogo Online:*\nhttps://apiariofavodemel.com.br/catalogo\n\n_(Caso queira ver as opções do menu novamente, digite *#* a qualquer momento)_";

        await msg.reply(descTransferencia);
        return await this.transferirParaHumano(msg, sessao);
    }

    /**
     * Transfere a sessão para atendimento humano e desativa o robô para este contato
     */
    static async transferirParaHumano(msg, sessao) {
        sessao.etapa = 'em_atendimento_humano';
        sessao.modo_atendimento = 'humano';
        sessao.errosConsecutivos = 0;
        sessao.transferidoParaHumanoEm = new Date().toISOString();
        sessao.ultimaMensagemEnviadaAoCliente = new Date().toISOString();

        if (msg.numeroReal) {
            await SessionService.alternarModoAtendimento(msg.numeroReal, 'humano').catch(() => { });
        }
        if (msg.numeroCliente && typeof EvolutionService.gerenciarEtiqueta === 'function') {
            await EvolutionService.gerenciarEtiqueta(msg.numeroCliente, '8', 'remove').catch(() => { });
            await EvolutionService.gerenciarEtiqueta(msg.numeroCliente, '7', 'add').catch(() => { });
        }
    }
}

/*
// =========================================================================
// HISTÓRICO: FLUXO ANTERIOR DE PEDIDOS E CATEGORIAS NO CHAT (PRESERVADO)
// =========================================================================
// if (t === '1' || t.includes('mel') || t.includes('comprar') || t.includes('produto') || t.includes('catalogo')) {
//     sessao.etapa = 'aguardando_categoria';
//     const botoesCategorias = [
//         { type: "reply", displayText: "🍯 Méis & Favos", id: "1" },
//         { type: "reply", displayText: "🌿 Própolis & Cuidados", id: "2" },
//         { type: "reply", displayText: "🕯️ Artesanais & Cera", id: "3" }
//     ];
//     const desc = "Escolha uma categoria abaixo para ver os itens disponíveis:";
//     const fallback = `🍯 *Produtos da Colmeia - Favo de Mel*\n\n${desc}\n\n[ 🍯 Méis & Favos ]  [ 🌿 Própolis & Cuidados ]  [ 🕯️ Artesanais & Cera ]`;
//     if (typeof msg.replyButtons === 'function') {
//         await msg.replyButtons({
//             title: "🍯 Produtos da Colmeia",
//             description: desc,
//             footer: "Apiário Favo de Mel",
//             buttons: botoesCategorias
//         }, fallback);
//     } else {
//         await msg.reply(fallback);
//     }
//     return;
// }
// if (t === '2' || t.includes('captura') || t.includes('resgate') || t.includes('enxame') || t.includes('remover abelha')) {
//     return await ResgateStage.executar(msg, texto, sessao);
// }
// if (t === '3' || t === 'consultoria' || t.includes('consultoria') || t.includes('curso') || t.includes('manejo') || t.includes('apiario')) {
//     return await ConsultoriaStage.executar(msg, texto, sessao);
// }
// if (t === '4' || t === 'ia' || t.includes('duvida') || t.includes('dúvida') || t.includes('pergunta')) {
//     sessao.etapa = 'conversando_com_ia';
//     await msg.reply(mensagens.ia.saudacao);
//     return;
// }
// if (t.length > 5 && !/^[0-9#]+$/.test(t)) {
//     sessao.etapa = 'conversando_com_ia';
//     return await IaStage.executar(msg, texto, sessao);
// }
// =========================================================================
*/

module.exports = MenuPrincipalStage;

