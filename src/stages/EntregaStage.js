class EntregaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        sessao.dadosEntregaTexto = texto;
        sessao.etapa = 'em_atendimento_humano';
        sessao.pedidoFinalizado = true;

        await msg.reply(
            "✅ *Perfeito! Recebemos seus dados de entrega com sucesso!*\n\n" +
            "Nossa equipe já está separando o seu pedido. Em instantes um de nossos atendentes vai te enviar a confirmação da taxa de entrega e a chave Pix para pagamento aqui no chat! 🐝🍯\n\n" +
            "_(Se desejar fazer outro pedido ou voltar ao menu a qualquer momento, digite *#* ou *menu*.)_"
        );
    }
}

module.exports = EntregaStage;
