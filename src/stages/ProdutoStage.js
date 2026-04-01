const catalogo = require('../data/catalogo.json');

class ProdutoStage {
    static async executar(msg, texto, sessao) {
        if (texto === '0') {
            await msg.reply("👨‍🌾 Um momento, por favor. Vou te transferir para um atendente humano. Logo responderemos!");
            sessao.etapa = 'em_atendimento_humano';
            return;
        }

        if (texto === '#') {
            sessao.errosConsecutivos = 0; 
            let menu = `Voltando ao menu principal... 🐝\n\nEscolha uma categoria para ver nossos produtos:\n\n`;
            for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
                menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
            }
            menu += `\n*0️⃣ - Falar com atendente*`;
            await msg.reply(menu);
            sessao.etapa = 'aguardando_categoria'; 
            return;
        }

        const idCategoria = sessao.categoriaSelecionada;
        const produtoEscolhido = catalogo.categorias[idCategoria].produtos[texto];

        if (produtoEscolhido) {
            sessao.errosConsecutivos = 0; 
            await msg.reply(`✅ Você escolheu: *${produtoEscolhido.nome}*.\nValor: R$ ${produtoEscolhido.preco.toFixed(2).replace('.', ',')}\n\n(A integração de pagamento retornará em breve. Digite 0 se quiser falar com o vendedor).`);
            sessao.etapa = 'inicio';
        } else {
            sessao.errosConsecutivos++;
            if (sessao.errosConsecutivos >= 2) {
                await msg.reply("🔇 Vou pausar o robô automático para que um vendedor te atenda, ok?\n\n(Para voltar ao menu, digite */bot*).");
                sessao.etapa = 'em_atendimento_humano';
                sessao.errosConsecutivos = 0;
            } else {
                await msg.reply("⚠️ Produto inválido. Digite o número correspondente, 0 para atendente, ou # para voltar.");
            }
        }
    }
}
module.exports = ProdutoStage;