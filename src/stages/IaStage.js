const GeminiService = require('../services/GeminiService');
const EvolutionService = require('../services/EvolutionService');

function isPerguntaRelacionadaMel(str) {
    if (!str || typeof str !== 'string') return false;
    const termos = [
        'mel', 'abelha', 'jatai', 'jataí', 'urucu', 'uruçu', 'moca branca', 'moça branca',
        'propolis', 'própolis', 'favo', 'geleia', 'polen', 'pólen', 'cera',
        'hidromel', 'melato', 'bracatinga', 'cristaliz', 'puro', 'enxame',
        'resgate', 'apiario', 'apiário', 'catalogo', 'catálogo', 'preco', 'preço',
        'comprar', 'produto', 'loja', 'entrega', 'frete', 'aracaju'
    ];
    const s = str.toLowerCase();
    return termos.some(t => s.includes(t));
}

class IaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        // Comandos de navegação
        if (t === '#' || t === 'sair' || t === 'voltar' || t === 'menu' || t === '/menu' || t === 'inicio' || t === 'início') {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        if (t === '1' || t === 'catalogo' || t === 'catálogo') {
            sessao.etapa = 'menu_principal';
            const MenuPrincipalStage = require('./MenuPrincipalStage');
            return await MenuPrincipalStage.executar(msg, '1', sessao);
        }

        const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'hey', 'alo', 'alô', 'oie', 'eai', 'e aí'];
        if (saudacoes.includes(t)) {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        if (!Array.isArray(sessao.historicoIa)) {
            sessao.historicoIa = [];
        }

        // 1. Envia feedback visual de "digitando..." no WhatsApp
        if (msg.numeroCliente && typeof EvolutionService.enviarPresenca === 'function') {
            await EvolutionService.enviarPresenca(msg.numeroCliente, 'composing', 1200).catch(() => {});
        }

        // 2. Consulta a IA para analisar a mensagem do cliente
        const retorno = await GeminiService.perguntar(texto, sessao.historicoIa);

        const MenuPrincipalStage = require('./MenuPrincipalStage');

        // 3. Se a IA determinou transferência humana, ou se o assunto NÃO tem relação com mel/loja, ou cliente pediu atendente
        const precisaTransferir = (
            retorno.transferirHumano ||
            retorno.relacionadoComMelOuLoja === false ||
            retorno.intencao === 'outro' ||
            retorno.intencao === 'humano' ||
            !isPerguntaRelacionadaMel(texto)
        );

        if (precisaTransferir) {
            await msg.reply(
                "Entendi! Estou transferindo seu atendimento para a nossa equipe humana. " +
                "Em instantes um de nossos atendentes irá falar com você aqui no WhatsApp! 🐝💛\n\n" +
                "👉 *Nosso Catálogo Online:* https://apiariofavodemel.com.br/catalogo\n" +
                "_(Digite *#* para ver o menu de opções.)_"
            );
            return await MenuPrincipalStage.transferirParaHumano(msg, sessao);
        }

        // 4. Se é uma dúvida sobre mel/produtos/serviços da Favo de Mel, o bot responde!
        sessao.historicoIa.push({ role: 'user', parts: [{ text: texto }] });
        sessao.historicoIa.push({ role: 'model', parts: [{ text: retorno.resposta }] });

        if (sessao.historicoIa.length > 20) {
            sessao.historicoIa = sessao.historicoIa.slice(-20);
        }

        sessao.etapa = 'menu_principal';

        const rodape = "\n\n_(Para acessar nosso catálogo online: https://apiariofavodemel.com.br/catalogo | Digite *#* para o menu)_";
        await msg.reply(`${retorno.resposta}${rodape}`);
    }
}

module.exports = IaStage;