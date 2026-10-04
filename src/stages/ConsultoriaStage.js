const mensagens = require('../data/mensagens.json');

class ConsultoriaStage {
    static async executar(msg, texto, sessao) {
        sessao.etapa = 'consultoria_aguardando';
        sessao.errosConsecutivos = 0;

        await msg.reply(mensagens.consultoria.apresentacao);
    }
}

module.exports = ConsultoriaStage;
