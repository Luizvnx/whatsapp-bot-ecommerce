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
                description: "Olá! Seja bem-vindo(a) à Favo de Mel! 🍯\nSomos especialistas em produtos puros da colmeia, resgate de abelhas e consultoria apícola em Aracaju.\n\nEscolha uma opção no menu:",
                buttonText: "Ver Opções 🍯",
                footerText: "Apiário Favo de Mel",
                sections: [
                    {
                        title: "Menu de Atendimento",
                        rows: [
                            {
                                rowId: "1",
                                title: "1. 🍯 Comprar Produtos",
                                description: "Méis puros, própolis, pólen, favos e bebidas"
                            },
                            {
                                rowId: "2",
                                title: "2. 🐝 Resgate de Abelhas",
                                description: "Captura e remoção segura e ecológica de enxames"
                            },
                            {
                                rowId: "3",
                                title: "3. 👨‍🌾 Consultoria Apícola",
                                description: "Manejo técnico produtivo e cursos especializados"
                            },
                            {
                                rowId: "4",
                                title: "4. ❓ Dúvidas e Informações",
                                description: "Tire dúvidas com nossa inteligência artificial"
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
