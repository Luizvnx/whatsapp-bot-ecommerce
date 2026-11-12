class HumanoStage {
    static async executar(msg, texto, sessao) {
        const SessionService = require('../services/SessionService');
        const numeroReal = msg.numeroReal || (msg.numeroCliente ? SessionService.normalizarId(msg.numeroCliente) : null);
        const t = (texto || '').toLowerCase().trim();

        // 1. Comandos para ver o catálogo online
        const comandosCatalogo = [
            '1', 'catalogo', 'catálogo', '/catalogo', '/catálogo', 'link', '/link', 'site', '/site', 'loja', '/loja',
            'ver catalogo', 'ver catálogo', 'conhecer catalogo', 'conhecer catálogo',
            '🛍️ ver catálogo', '🛍️ ver catalogo', '🛍️ conhecer catálogo', '🛍️ conhecer catalogo'
        ];
        if (comandosCatalogo.includes(t)) {
            if (numeroReal) {
                await SessionService.assumirAtendimentoPeloBot(numeroReal, sessao);
            } else {
                sessao.etapa = 'menu_principal';
                sessao.modo_atendimento = 'bot';
            }
            const MenuPrincipalStage = require('./MenuPrincipalStage');
            return await MenuPrincipalStage.executar(msg, '1', sessao);
        }

        // 2. Comandos de retorno voluntário ao menu do bot
        const comandosMenu = [
            '/voltar', '/bot', 'bot', 'menu', '/menu', '#', 'voltar', '0', 'inicio', 'início',
            'voltar ao inicio', 'voltar ao início', 'voltar ao menu',
            '🔙 voltar ao início', '🔙 voltar ao inicio', '🔙 voltar ao menu'
        ];
        if (comandosMenu.includes(t)) {
            if (numeroReal) {
                await SessionService.assumirAtendimentoPeloBot(numeroReal, sessao);
            } else {
                sessao.etapa = 'menu_principal';
                sessao.modo_atendimento = 'bot';
                sessao.errosConsecutivos = 0;
                sessao.categoriaSelecionada = null;
                sessao.produtoSelecionado = null;
            }
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // Silêncio total do robô durante atendimento humano e após vendas fechadas
        return;
    }
}
module.exports = HumanoStage;
