const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        const title = "🐝 Apiário Favo de Mel";
        const description = "Olá! Seja Bem-vindo(a) à Favo de Mel! 🍯\nSomos especialistas em produtos puros da colmeia, resgate de abelhas e consultoria apícola em Aracaju.\n\nEscolha uma das opções abaixo ou envie sua dúvida diretamente:";
        const footer = "Apiário Favo de Mel";
        const buttons = [
            { type: "reply", displayText: "🍯 Comprar Mel", id: "1" },
            { type: "reply", displayText: "🐝 Resgate Abelhas", id: "2" },
            { type: "reply", displayText: "👨‍🌾 Consultoria", id: "3" }
        ];

        const fallback = `*${title}*\n\n${description}\n\n[ 🍯 Comprar Mel ]  [ 🐝 Resgate Abelhas ]  [ 👨‍🌾 Consultoria ]`;

        if (typeof msg.replyButtons === 'function') {
            await msg.replyButtons({
                title,
                description,
                footer,
                buttons
            }, fallback);
        } else {
            await msg.reply(fallback);
        }

        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
