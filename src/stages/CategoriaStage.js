const catalogo = require('../data/catalogo.json');

class CategoriaStage {
    static async executar(msg, texto, sessao) {
        if (texto === '0') {
            await msg.reply("👨‍🌾 Um momento, por favor. Vou te transferir para um atendente humano. Logo responderemos!");
            sessao.etapa = 'em_atendimento_humano';
            return;
        }

        const categoriaEscolhida = catalogo.categorias[texto];

        if (categoriaEscolhida) {
            sessao.errosConsecutivos = 0;
            sessao.categoriaSelecionada = texto; 

            let submenu = `Você escolheu *${categoriaEscolhida.nome}*.\n\nDigite o número do produto desejado:\n\n`;
            for (const [chave, produto] of Object.entries(categoriaEscolhida.produtos)) {
                const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
                submenu += `*${chave}️⃣ - ${produto.nome}* - R$ ${precoFormatado}\n`;
            }

            submenu += `\n*0️⃣ - Falar com atendente*`;
            submenu += `\n*#️⃣ - Voltar ao menu principal*`;

            await msg.reply(submenu);
            sessao.etapa = 'aguardando_produto';
        } else {
            sessao.errosConsecutivos++;
            if (sessao.errosConsecutivos >= 2) {
                await msg.reply("🔇 Percebi que você quer falar direto com a gente! Vou pausar o robô por aqui.\n\n(Digite */bot* para voltar ao menu automático).");
                sessao.etapa = 'em_atendimento_humano';
                sessao.errosConsecutivos = 0; 
            } else {
                await msg.reply("⚠️ Categoria inválida. Por favor, digite o número correspondente ou 0 para falar com um atendente.");
            }
        }
    }
}
module.exports = CategoriaStage;