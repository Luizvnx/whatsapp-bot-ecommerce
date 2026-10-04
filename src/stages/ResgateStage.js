const mensagens = require('../data/mensagens.json');

class ResgateStage {
    static async executar(msg, texto, sessao) {
        sessao.etapa = 'resgate_aguardando';
        sessao.errosConsecutivos = 0;

        await msg.reply(mensagens.resgate.apresentacao);
    }
}

module.exports = ResgateStage;
