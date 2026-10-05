const mensagens = require('../data/mensagens.json');

class CarrinhoStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // Opção 1: Adicionar mais produtos
        if (t === '1' || t.includes('adicionar') || t.includes('mais')) {
            const MenuPrincipalStage = require('./MenuPrincipalStage');
            return await MenuPrincipalStage.executar(msg, '1', sessao);
        }

        // Opção 2: Finalizar pedido
        if (t === '2' || t.includes('finalizar') || t.includes('fechar') || t.includes('pedir') || t.includes('pagar')) {
            if (!sessao.carrinho || sessao.carrinho.length === 0) {
                await msg.reply(mensagens.carrinho.pedidoVazio);
                sessao.etapa = 'aguardando_categoria';
                return;
            }

            let total = 0;
            let itens = '';
            sessao.carrinho.forEach(item => {
                const sub = item.preco * item.quantidade;
                total += sub;
                itens += `- ${item.quantidade}x ${item.nome} (R$ ${sub.toFixed(2).replace('.', ',')})\n`;
            });

            const msgFinalizacao = `📦 *Resumo Final do seu Pedido:*\n\n${itens}\n💰 *Valor Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\n${mensagens.finalizacao.dadosEntrega}`;
            
            await msg.reply(msgFinalizacao);
            sessao.etapa = 'aguardando_dados_entrega';
            return;
        }

        if (typeof msg.replyButtons === 'function') {
            await msg.replyButtons({
                title: "🛒 Opções do Carrinho",
                description: "Opção não reconhecida. Por favor, escolha uma das opções abaixo:",
                footer: "Apiário Favo de Mel",
                buttons: [
                    { id: "1", text: "🛒 Adicionar Mais" },
                    { id: "2", text: "✅ Finalizar Pedido" },
                    { id: "#", text: "🏠 Menu Principal" }
                ]
            }, "Opção inválida. Digite *1* para adicionar mais itens ao carrinho, *2* para finalizar seu pedido ou *#* para voltar ao menu.");
        } else {
            await msg.reply("Opção inválida. Digite *1* para adicionar mais itens ao carrinho, *2* para finalizar seu pedido ou *#* para voltar ao menu.");
        }
    }
}

module.exports = CarrinhoStage;