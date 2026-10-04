const mensagens = require('../data/mensagens.json');

class ConsultoriaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // Se já estava aguardando as informações e o cliente enviou os dados
        if (sessao.etapa === 'consultoria_aguardando') {
            sessao.dadosConsultoria = (sessao.dadosConsultoria ? sessao.dadosConsultoria + '\n' : '') + (texto || '');
            sessao.etapa = 'em_atendimento_humano';
            sessao.errosConsecutivos = 0;

            await msg.reply(
                "✅ *Solicitação de Consultoria Recebida!* 👨‍🌾🐝\n\n" +
                "Nosso consultor apícola já foi notificado e responderá aqui em breve para entender melhor seu projeto e agendar o atendimento.\n\n" +
                "_(Digite *#* ou *menu* para voltar ao menu a qualquer momento.)_"
            );
            return;
        }

        sessao.etapa = 'consultoria_aguardando';
        sessao.errosConsecutivos = 0;
        await msg.reply(mensagens.consultoria.apresentacao);
    }
}

module.exports = ConsultoriaStage;
