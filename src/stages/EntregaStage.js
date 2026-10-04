class EntregaStage {
    static async executar(msg, texto, sessao) {
        sessao.dadosEntregaTexto = texto;
        sessao.etapa = 'em_atendimento_humano';
        sessao.pedidoFinalizado = true;

        await msg.reply(`✅ *Perfeito! Recebemos seus dados de entrega com sucesso!*\n\nNossa equipe já está separando o seu pedido. Em instantes um de nossos atendentes vai te enviar a confirmação da taxa de entrega e o Pix para pagamento aqui no chat! 🐝🍯\n\n_Muito obrigado por escolher a Favo de Mel!_`);
    }
}

module.exports = EntregaStage;
