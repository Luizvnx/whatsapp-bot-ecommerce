const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        await msg.reply(mensagens.inicio.boasVindas);
        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
