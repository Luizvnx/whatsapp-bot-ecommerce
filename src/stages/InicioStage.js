const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;
        sessao.boasVindasEnviadas = true;
        sessao.modo_atendimento = 'bot';

        const title = "🐝 Apiário Favo de Mel";
        const description = "Olá! Seja muito bem-vindo(a) ao *Apiário Favo de Mel*! 🍯✨\nSomos especialistas em produtos puros da colmeia, resgate ecológico de abelhas e consultoria apícola em Sergipe.\n\nComo podemos te ajudar hoje? Escolha uma das opções abaixo:";
        const footer = "Apiário Favo de Mel";
        const buttons = [
            { type: "reply", displayText: "🛍️ Conhecer Catálogo", id: "1" },
            { type: "reply", displayText: "❓ Dúvidas sobre Mel", id: "2" },
            { type: "reply", displayText: "🐝 Outros Serviços", id: "3" }
        ];

        const fallback = `*${title}*\n\n${description}\n\n1️⃣ *Conhecer Catálogo & Comprar Online*\n2️⃣ *Tirar Dúvidas sobre Mel & Abelhas*\n3️⃣ *Outros Serviços (Retirada de Abelhas, Revenda & Atendimento)*\n\n_(Responda com o número ou clique no botão desejado)_`;

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
