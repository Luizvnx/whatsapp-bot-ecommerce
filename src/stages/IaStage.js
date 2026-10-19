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
            return await msg.reply(
                "Olá! 🐝🍯 Sou a assistente virtual da Favo de Mel.\n\n" +
                "Pode me perguntar qualquer dúvida sobre nossos tipos de mel puro (Jataí, Uruçu, Melato, Silvestre), favos, própolis, benefícios para a saúde, localização da loja ou entregas!\n\n" +
                "_(Se preferir voltar ao menu de opções, digite *#* ou *menu*)_"
            );
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

        // 6. Transferência humana: apenas se o cliente pediu atendente humano, assunto aleatório sem relação ou erro
        const precisaTransferir = (
            retorno.transferirHumano === true ||
            retorno.relacionadoComMelOuLoja === false ||
            retorno.intencao === 'outro' ||
            retorno.intencao === 'humano'
        );

        if (precisaTransferir) {
            await msg.reply(
                "Entendido! Estou transferindo seu atendimento para a nossa equipe humana. " +
                "Em instantes um de nossos atendentes irá falar com você aqui no WhatsApp! 🐝💛\n\n" +
                "👉 *Nosso Catálogo Online:* https://apiariofavodemel.com.br/catalogo\n" +
                "_(Para voltar ao menu inicial, digite *#* ou *menu*)_"
            );
            return await MenuPrincipalStage.transferirParaHumano(msg, sessao);
        }

        // 7. A IA respondeu a dúvida sobre mel/produtos/loja:
        sessao.historicoIa.push({ role: 'user', parts: [{ text: texto }] });
        sessao.historicoIa.push({ role: 'model', parts: [{ text: retorno.resposta }] });

        if (sessao.historicoIa.length > 20) {
            sessao.historicoIa = sessao.historicoIa.slice(-20);
        }

        // CONSCIÊNCIA DE DIÁLOGO: Mantém o cliente no estágio de IA para continuidade da conversa!
        sessao.etapa = 'conversando_com_ia';
        sessao.errosConsecutivos = 0;

        // Se a dúvida foi sobre preços, catálogo ou como comprar, enviamos a resposta com o link direto para comprar
        if (retorno.intencao === 'preco_catalogo' || retorno.sugerirAcao === 'catalogo') {
            const rodapeComprar = "\n\n👉 *Acesse nossa loja online para ver fotos e comprar:* https://apiariofavodemel.com.br/catalogo\n\n_(Fique à vontade para fazer outra pergunta, ou digite *#* para voltar ao menu inicial)_";
            return await msg.reply(`${retorno.resposta}${rodapeComprar}`);
        }

        // Para dúvidas normais: envia a resposta fluida da IA SEM disparar menus secundários invasivos
        const rodape = "\n\n_(Fique à vontade para enviar outra dúvida, ou digite *#* para voltar ao menu inicial)_";
        return await msg.reply(`${retorno.resposta}${rodape}`);
    }
}

module.exports = IaStage;