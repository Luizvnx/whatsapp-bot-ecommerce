const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        const fallback = mensagens.inicio.boasVindas;

        if (typeof msg.replyList === 'function') {
            await msg.replyList({
                title: "🐝 Apiário Favo de Mel",
                description: "Olá! Bem-vindo(a) à Favo de Mel! 🍯\n\nSomos especialistas em produtos puros da colmeia, resgate de abelhas e consultoria apícola em Aracaju/SE.\n\nToque no botão abaixo para escolher como podemos te ajudar:",
                buttonText: "Ver Opções 🍯",
                footerText: "Apiário Favo de Mel • Aracaju/SE",
                sections: [
                    {
                        title: "Atendimento e Serviços",
                        rows: [
                            {
                                title: "🍯 Comprar Produtos",
                                description: "Méis puros, própolis, favos e geleia",
                                rowId: "1"
                            },
                            {
                                title: "🐝 Captura e Resgate",
                                description: "Remoção ecológica e segura de enxames",
                                rowId: "2"
                            },
                            {
                                title: "👨‍🌾 Consultoria Apícola",
                                description: "Manejo técnico e assessoria para apiários",
                                rowId: "3"
                            },
                            {
                                title: "❓ Tirar Dúvidas (IA)",
                                description: "Pergunte à nossa assistente virtual IA",
                                rowId: "4"
                            }
                        ]
                    }
                ]
            }, fallback);
        } else {
            await msg.reply(fallback);
        }

        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
