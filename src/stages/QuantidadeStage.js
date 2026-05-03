const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');
const numeroLoja = process.env.NUMERO_DA_LOJA;

class QuantidadeStage {
    static async executar(msg, texto, sessao) {
        
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\nO cliente pediu ajuda!${msg.linkAlerta}`);
            return;
        }

        // Valida se o cliente digitou um número válido (ex: não digitou "dois" ou "abc")
        const quantidade = parseInt(texto);
        
        if (isNaN(quantidade) || quantidade <= 0) {
            await msg.reply(mensagens.carrinho.quantidadeInvalida);
            return;
        }

        if (!sessao.carrinho) {
            sessao.carrinho = [];
        }

        // 2. Segurança: Verificar se existe um produto temporário na memória
        if (!sessao.produtoTemporario) {
            await msg.reply("❌ Ops, houve um erro ao recuperar o produto. Por favor, escolha o produto novamente.");
            sessao.etapa = 'catalogo'; // Volta para o catálogo por segurança
            return;
        }

        // Adiciona o produto e a quantidade no carrinho
        sessao.carrinho.push({
            nome: sessao.produtoTemporario.nome,
            preco: sessao.produtoTemporario.preco,
            quantidade: quantidade
        });

        // Limpa a memória temporária
        sessao.produtoTemporario = null;

        // Calcula o Subtotal do carrinho
        let subtotal = 0;
        let resumoCarrinho = `✅ Adicionado ao carrinho!\n\n🛒 *Seu Carrinho Atual:*\n`;
        
        sessao.carrinho.forEach((item) => {
            const totalItem = item.preco * item.quantidade;
            subtotal += totalItem;
            resumoCarrinho += `- ${item.quantidade}x ${item.nome} (R$ ${totalItem.toFixed(2).replace('.', ',')})\n`;
        });

        resumoCarrinho += `\n💰 *Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}*`;
        resumoCarrinho += mensagens.carrinho.opcoes;

        await msg.reply(resumoCarrinho);
        sessao.etapa = 'carrinho_opcoes';
    }
}

module.exports = QuantidadeStage;