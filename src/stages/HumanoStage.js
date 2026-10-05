class HumanoStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();
        const comandos = ['/voltar', '/bot', 'bot', 'menu', '/menu', '#', 'voltar', '0', 'catalogo', 'catálogo', 'inicio', 'início'];
        if (comandos.includes(t)) {
            sessao.etapa = 'menu_principal';
            sessao.errosConsecutivos = 0;
            sessao.categoriaSelecionada = null;
            sessao.produtoSelecionado = null;
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }
    }
}
module.exports = HumanoStage;
