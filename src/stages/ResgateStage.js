const mensagens = require('../data/mensagens.json');

class ResgateStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            sessao.etapa = 'menu_principal';
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // Se já estava aguardando as informações e o cliente enviou o local/detalhes
        if (sessao.etapa === 'resgate_aguardando') {
            sessao.dadosResgate = (sessao.dadosResgate ? sessao.dadosResgate + '\n' : '') + (texto || '[Mídia do local enviada]');
            sessao.etapa = 'em_atendimento_humano';
            sessao.errosConsecutivos = 0;

            await msg.reply(
                "✅ *Solicitação de Resgate Registrada com Sucesso!* 🐝\n\n" +
                "Nossa equipe técnica e apicultores especializados já receberam suas informações. " +
                "Um atendente humano entrará em contato aqui pelo WhatsApp em instantes para avaliar o enxame e passar o orçamento!\n\n" +
                "_(Se desejar voltar ao menu de compras a qualquer momento, digite *#* ou *menu*.)_"
            );
            return;
        }

        // Primeira exibição da apresentação
        sessao.etapa = 'resgate_aguardando';
        sessao.errosConsecutivos = 0;
        await msg.reply(mensagens.resgate.apresentacao);
    }
}

module.exports = ResgateStage;
