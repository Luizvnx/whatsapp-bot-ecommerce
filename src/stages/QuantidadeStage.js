const mensagens = require('../data/mensagens.json');

class QuantidadeStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').trim();

        if (t === '#' || t.toLowerCase() === 'voltar' || t.toLowerCase() === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        const qtd = parseInt(t.replace(/\D/g, ''), 10);

        if (isNaN(qtd) || qtd <= 0) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            if (sessao.errosConsecutivos >= 3) {
                await msg.reply("🔇 Não entendi a quantidade. Vou chamar um atendente para continuar seu pedido. Aguarde um instante! 🐝");
                sessao.etapa = 'em_atendimento_humano';
                return;
            }
            await msg.reply(mensagens.produtos.quantidadeInvalida);
            return;
        }

        sessao.errosConsecutivos = 0;
        const produto = sessao.produtoTemporario;

        if (!produto) {
            sessao.etapa = 'aguardando_categoria';
            await msg.reply("⚠️ Nenhum produto selecionado. Por favor, escolha uma categoria para ver os itens:");
            await msg.reply(mensagens.produtos.escolhaCategoria);
            return;
        }

        if (!Array.isArray(sessao.carrinho)) {
            sessao.carrinho = [];
        }

        // Verifica se já existe o mesmo item no carrinho para somar a quantidade
        const itemExistente = sessao.carrinho.find(i => i.nome === produto.nome);
        if (itemExistente) {
            itemExistente.quantidade += qtd;
        } else {
            sessao.carrinho.push({
                nome: produto.nome,
                preco: produto.preco,
                quantidade: qtd
            });
        }

        sessao.produtoTemporario = null;

        // Monta o resumo visual do carrinho
        let subtotalTotal = 0;
        let resumo = `🛒 *Carrinho Atualizado com Sucesso!*\n\n`;

        sessao.carrinho.forEach(item => {
            const itemTotal = item.preco * item.quantidade;
            subtotalTotal += itemTotal;
            resumo += `• *${item.quantidade}x* ${item.nome} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
        });

        resumo += `\n💰 *Total do Pedido: R$ ${subtotalTotal.toFixed(2).replace('.', ',')}*`;
        resumo += mensagens.carrinho.opcoes;

        await msg.reply(resumo);
        sessao.etapa = 'carrinho_opcoes';
    }
}

module.exports = QuantidadeStage;