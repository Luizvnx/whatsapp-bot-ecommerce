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
        if (t === '#' || t === 'menu' || t === '/menu' || t === 'voltar' || t === '/voltar' || t === 'inicio' || t === 'início' || t === '0') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // 2. CLIQUE NO MENU INTERATIVO: Opção 1 - Conhecer Catálogo
        const isCliqueOpcao1 = (
            t === '1' ||
            t === 'conhecer catalogo' ||
            t === 'conhecer catálogo' ||
            t === '🛍️ conhecer catálogo' ||
            t === '🛍️ conhecer catalogo'
        );

        if (isCliqueOpcao1) {
            sessao.etapa = 'menu_principal';
            sessao.errosConsecutivos = 0;

            const mensagemCatalogo = mensagens.catalogo?.apresentacao || 
                "🍯 *Catálogo & Loja Online - Apiário Favo de Mel* 🐝\n\n" +
                "Conheça toda a nossa linha de méis puros, favos frescos, própolis e produtos naturais colhidos direto do apiário!\n\n" +
                "Você pode conferir todos os produtos, preços e fazer seu pedido com facilidade pelo nosso site com entrega rápida:\n\n" +
                "👉 https://apiariofavodemel.com.br/catalogo\n\n" +
                "📦 *Como funciona:*\n" +
                "1. Acesse o link acima e adicione os itens ao carrinho\n" +
                "2. Escolha entre entrega em Aracaju/região ou retirada\n" +
                "3. Conclua seu pedido em poucos cliques com segurança!\n\n" +
                "_(Se precisar de ajuda com seu pedido ou tiver dúvidas, é só chamar por aqui! Digite *#* para ver o menu.)_";

            return await msg.reply(mensagemCatalogo);
        }

        // 3. CLIQUE NO MENU INTERATIVO: Opção 2 - Dúvidas sobre Mel
        const isCliqueOpcao2 = (
            t === '2' ||
            t === 'duvidas sobre mel' ||
            t === 'dúvidas sobre mel' ||
            t === '❓ dúvidas sobre mel' ||
            t === '❓ duvidas sobre mel'
        );

        if (isCliqueOpcao2) {
            sessao.etapa = 'conversando_com_ia';
            sessao.errosConsecutivos = 0;

            const mensagemDuvidas = 
                "🍯 *Dúvidas sobre Mel & Produtos da Colmeia* 🐝\n\n" +
                "Pode enviar sua dúvida aqui mesmo! Você gostaria de saber sobre nossos tipos de mel (Jataí, Uruçu, Melato), cristalização do mel puro, própolis ou benefícios?\n\n" +
                "Envie sua pergunta abaixo que vamos te responder! 💛\n\n" +
                "_(Para ver o menu de opções, digite *#*.)_";

            return await msg.reply(mensagemDuvidas);
        }

        // 4. CLIQUE NO MENU INTERATIVO: Opção 3 - Outros Serviços
        const isCliqueOpcao3 = (
            t === '3' ||
            t === 'outros servicos' ||
            t === 'outros serviços' ||
            t === '🐝 outros serviços' ||
            t === '🐝 outros servicos'
        );

        if (isCliqueOpcao3) {
            const mensagemOutros = mensagens.outrosServicos?.transferencia || 
                "🐝 *Outros Serviços & Atendimento Personalizado* 👨‍🌾\n\n" +
                "Entendido! Seja para retirada e resgate seguro de abelhas, revenda de produtos no atacado ou outras parcerias comerciais, nossa equipe já foi notificada. Um atendente humano responderá você por aqui em instantes! 💛\n\n" +
                "_(Para acessar nosso catálogo online: https://apiariofavodemel.com.br/catalogo ou digite *#* para o menu.)_";

            await msg.reply(mensagemOutros);
            return await this.transferirParaHumano(msg, sessao);
        }

        // 4.1 Saudação comum (Oi, Olá, Bom dia): reapresenta o menu de boas-vindas e opções
        const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'hey', 'alo', 'alô', 'oie', 'eai', 'e aí'];
        if (saudacoes.includes(t)) {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // 4.2 Mensagens curtas, pontuações, testes ou números fora do menu (ex: '.', '?', '!', 'teste', '4')
        const isPontuacaoOuCurto = (
            t === '.' || t === '..' || t === '...' ||
            t === '?' || t === '??' || t === '!' ||
            t === 'teste' || /^[0-9]+$/.test(t) ||
            t.length <= 2
        );

        if (isPontuacaoOuCurto) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            if (sessao.errosConsecutivos >= 2) {
                const msgTransbordo = "Não consegui entender sua mensagem após algumas tentativas. Estou transferindo seu atendimento para nossa equipe humana! 🐝💛\n\n_(Para acessar o catálogo online: https://apiariofavodemel.com.br/catalogo ou digite *#* para voltar ao menu)_";
                await msg.reply(msgTransbordo);
                return await this.transferirParaHumano(msg, sessao);
            }

            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // 5. QUALQUER OUTRA COISA DIGITADA (TEXTO LIVRE / PERGUNTA):
        // Conforme a regra: a IA avalia se é dúvida sobre mel/loja para responder;
        // caso não seja relacionado ou seja pedido de atendente/humano, encaminha para atendimento humano.
        const IaStage = require('./IaStage');
        return await IaStage.executar(msg, texto, sessao);
    }

    /**
     * Transfere a sessão para atendimento humano e desativa o robô para este contato
     */
    static async transferirParaHumano(msg, sessao) {
        sessao.etapa = 'em_atendimento_humano';
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

