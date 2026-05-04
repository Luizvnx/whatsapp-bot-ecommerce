class PagamentoStage {
    static async executar(msg, texto, sessao) {
        if (texto === 'cancelar' || texto === 'Cancelar') {
            sessao.etapa = 'inicio';
            await msg.reply("Pedido cancelado. Voltamos ao menu principal!");
        } else {
            await msg.reply("⏳ Seu pedido está aguardando o pagamento do Pix.\n\nSe quiser cancelar, digite *cancelar*.");
        }
    }
}
module.exports = PagamentoStage;