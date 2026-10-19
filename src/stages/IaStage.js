const GeminiService = require('../services/GeminiService');
const EvolutionService = require('../services/EvolutionService');

class IaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        // 1. Comandos de navegação / retorno ao menu principal
        const termosVoltarIa = [
            '#', 'sair', 'voltar', '/voltar', 'menu', '/menu', 'inicio', 'início', '0',
            'voltar ao inicio', 'voltar ao início', 'voltar ao menu',
            '🔙 voltar ao início', '🔙 voltar ao inicio', '🔙 voltar ao menu'
        ];
        if (termosVoltarIa.includes(t)) {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // 2. Comandos intencionais e diretos de catálogo / menu
        const comandosDiretosCatalogoIa = [
            '1', 'catalogo', 'catálogo', 'catalog', 'link', 'site',
            'loja online', 'loja virtual', 'ver catalogo', 'ver catálogo',
            'abrir catalogo', 'abrir catálogo', 'o link do catalogo', 'o link do catálogo',
            'link do catalogo', 'link do catálogo',
            '🛍️ ver catálogo', '🛍️ ver catalogo', '🛍️ conhecer catálogo'
        ];
        if (comandosDiretosCatalogoIa.includes(t)) {
            sessao.etapa = 'menu_principal';
            const MenuPrincipalStage = require('./MenuPrincipalStage');
            return await MenuPrincipalStage.executar(msg, '1', sessao);
        }

        // 3. Saudação enquanto conversa com a IA
        const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'hey', 'alo', 'alô', 'oie', 'eai', 'e aí'];
        if (saudacoes.includes(t)) {
            sessao.etapa = 'conversando_com_ia';
            const textoSaudacao = "Olá! 🐝🍯 Sou a assistente virtual da Favo de Mel.\n\nPode me perguntar qualquer dúvida sobre nossos tipos de mel puro (Jataí, Uruçu, Melato, Silvestre), pureza, cristalização, revenda no atacado, própolis, localização da loja ou entregas!";
            if (typeof msg.replyButtons === 'function') {
                return await msg.replyButtons({
                    title: "🐝 Atendimento Favo de Mel",
                    description: textoSaudacao,
                    footer: "Apiário Favo de Mel",
                    buttons: [
                        { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                        { type: "reply", displayText: "🛍️ Ver Catálogo", id: "1" }
                    ]
                }, `${textoSaudacao}\n\n_(Para voltar ao menu inicial, clique no botão ou digite *#*)_`);
            }
            return await msg.reply(`${textoSaudacao}\n\n_(Para voltar ao menu inicial, digite *#*)_`);
        }

        if (!Array.isArray(sessao.historicoIa)) {
            sessao.historicoIa = [];
        }

        // 4. Feedback visual de "digitando..." no WhatsApp
        if (msg.numeroCliente && typeof EvolutionService.enviarPresenca === 'function') {
            await EvolutionService.enviarPresenca(msg.numeroCliente, 'composing', 1200).catch(() => {});
        }

        // 5. Consulta a IA Gemini com histórico da conversa
        const retorno = await GeminiService.perguntar(texto, sessao.historicoIa);
        const MenuPrincipalStage = require('./MenuPrincipalStage');

        // Palavras-chave de segurança que garantem relação com mel/loja/revenda
        const termosMelSeguros = [
            'mel', 'abelha', 'jatai', 'jataí', 'urucu', 'uruçu', 'moca branca', 'moça branca',
            'propolis', 'própolis', 'favo', 'geleia', 'polen', 'pólen', 'cera',
            'hidromel', 'melato', 'bracatinga', 'cristaliz', 'puro', 'pureza', 'revenda', 'atacado',
            'preco', 'preço', 'valor', 'loja', 'entrega', 'frete', 'aracaju', 'catalogo', 'catálogo'
        ];
        const contemTermoMel = termosMelSeguros.some(termo => t.includes(termo));

        // 6. Consciência de Atuação: se for pedido de atendente, ou assunto sem relação NENHUMA com mel/loja
        const ehAssuntoSemRelacao = (
            (!contemTermoMel && retorno.relacionadoComMelOuLoja === false) ||
            retorno.intencao === 'outro' ||
            retorno.intencao === 'humano' ||
            retorno.transferirHumano === true
        );

        if (ehAssuntoSemRelacao && !contemTermoMel) {
            const avisoTransbordo = "Nosso assistente virtual responde exclusivamente dúvidas sobre mel puro, própolis, revenda e produtos da Favo de Mel. Estou transferindo seu atendimento para a nossa equipe humana! 🐝💛\n\n👉 *Nosso Catálogo Online:* https://apiariofavodemel.com.br/catalogo";
            if (typeof msg.replyButtons === 'function') {
                await msg.replyButtons({
                    title: "🐝 Atendimento Humano",
                    description: avisoTransbordo,
                    footer: "Apiário Favo de Mel",
                    buttons: [
                        { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                        { type: "reply", displayText: "🛍️ Ver Catálogo", id: "1" }
                    ]
                }, avisoTransbordo);
            } else {
                await msg.reply(avisoTransbordo);
            }
            return await MenuPrincipalStage.transferirParaHumano(msg, sessao);
        }

        // 7. A IA responde a dúvida legítima sobre mel/produtos/loja/revenda:
        sessao.historicoIa.push({ role: 'user', parts: [{ text: texto }] });
        sessao.historicoIa.push({ role: 'model', parts: [{ text: retorno.resposta }] });

        if (sessao.historicoIa.length > 20) {
            sessao.historicoIa = sessao.historicoIa.slice(-20);
        }

        // Mantém a sessão conversando com a IA para continuidade
        sessao.etapa = 'conversando_com_ia';
        sessao.errosConsecutivos = 0;

        const fallback = `${retorno.resposta}\n\n👉 *Catálogo Online:* https://apiariofavodemel.com.br/catalogo\n_(Clique no botão ou digite *#* para voltar ao menu)_`;

        if (typeof msg.replyButtons === 'function') {
            return await msg.replyButtons({
                title: "",
                description: `${retorno.resposta}\n\n👉 *Catálogo Online:* https://apiariofavodemel.com.br/catalogo`,
                footer: "Apiário Favo de Mel",
                buttons: [
                    { type: "reply", displayText: "🔙 Voltar ao Início", id: "#" },
                    { type: "reply", displayText: "🛍️ Ver Catálogo", id: "1" }
                ]
            }, fallback);
        }

        return await msg.reply(fallback);
    }
}

module.exports = IaStage;