const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        const fallback = mensagens.inicio.boasVindas;

        if (typeof msg.replyButtons === 'function') {
            await msg.replyButtons({
                title: "🐝 Apiário Favo de Mel",
                description: fallback,
                footer: "Apiário Favo de Mel • Aracaju/SE",
                buttons: [
                    { id: "1", text: "🍯 Comprar Produtos" },
                    { id: "2", text: "🐝 Resgate Abelhas" },
                    { id: "4", text: "❓ Dúvidas com IA" }
                ]
            }, fallback);
        } else {
            await msg.reply(fallback);
        }

        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
