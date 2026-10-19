class HumanoStage {
    static async executar(msg, texto, sessao) {
        const SessionService = require('../services/SessionService');
        const numeroReal = msg.numeroReal || (msg.numeroCliente ? SessionService.normalizarId(msg.numeroCliente) : null);

        // 1. Regra 24h: se passou 24h sem nenhuma mensagem enviada ao cliente, o robô reassume o atendimento automaticamente
        if (SessionService.deveBotAssumirAtendimento(sessao)) {
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

        // 2. Comandos de retorno voluntário digitados pelo cliente
        const t = (texto || '').toLowerCase().trim();
        const comandos = ['/voltar', '/bot', 'bot', 'menu', '/menu', '#', 'voltar', '0', 'catalogo', 'catálogo', 'inicio', 'início'];
        if (comandos.includes(t)) {
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
    }
}
module.exports = HumanoStage;
