require('dotenv').config();

const catalogo = require('../data/catalogo.json');
const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');
const numeroLoja = process.env.NUMERO_DA_LOJA;

class ProdutoStage {
    static async executar(msg, texto, sessao) {
        
        // Desvio para o Atendente Humano (Opção 0)
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\nO cliente pediu ajuda!${msg.linkAlerta}`);
            return;
        }

        if (texto === '#') {
            sessao.etapa = 'inicio';
            const InicioStage = require('./InicioStage');
            await InicioStage.executar(msg, '', sessao);
            return;
        }

        // Verifica se o produto existe dentro da categoria que o cliente escolheu antes
        const categoriaMestre = catalogo.categorias[sessao.categoriaSelecionada];
        const produtoEscolhido = categoriaMestre.produtos[texto];

        if (!produtoEscolhido) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            if (sessao.errosConsecutivos >= 2) {
                await msg.reply(mensagens.erros.transferenciaHumano);
                sessao.etapa = 'em_atendimento_humano';
                await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO*\nO bot foi pausado (erro na escolha do produto).\n👉 https://wa.me/${msg.from}`);
                sessao.errosConsecutivos = 0; 
            } else {
                await msg.reply("⚠️ Produto não encontrado. Digite o número do produto, 0 para atendente ou # para voltar.");
            }
            return;
        }

        //(Início do Carrinho de Compras)
        sessao.errosConsecutivos = 0;
        
        // --- CARRINHO DESATIVADO TEMPORARIAMENTE ---
        /*
        sessao.produtoTemporario = produtoEscolhido;
        
        // Formata o preço para mostrar bonito
        const precoFormatado = produtoEscolhido.preco.toFixed(2).replace('.', ',');
        await msg.reply(`Você selecionou: *${produtoEscolhido.nome}* (R$ ${precoFormatado}).\n\n${mensagens.carrinho.pedeQuantidade}`);
        await msg.reply(`✅ Você selecionou: *${produtoEscolhido.nome}* por R$ ${precoFormatado}.`);
        sessao.etapa = 'aguardando_quantidade';
        */
        // -------------------------------------------

        // NOVO FLUXO: Envio Direto do Produto do Catálogo
        if (produtoEscolhido.productId) {
            try {
                await EvolutionService.enviarProdutoNativo(
                    msg.from, 
                    produtoEscolhido.productId, 
                    `Aqui está o produto selecionado: *${produtoEscolhido.nome}*!`
                );
            } catch (err) {
                console.error(`Erro ao enviar o card do produto:`, err.message);
                await msg.reply(`✅ Você selecionou: *${produtoEscolhido.nome}*.\nAcesse nosso catálogo no perfil para ver detalhes!`);
            }
        } else {
            // Fallback caso o lojista ainda não tenha colocado o ID no JSON
            const precoFormatado = produtoEscolhido.preco.toFixed(2).replace('.', ',');
            await msg.reply(`✅ Você selecionou: *${produtoEscolhido.nome}* por R$ ${precoFormatado}.\n(Acesse nosso catálogo no perfil para comprar)`);
        }

        // Mantém a sessão aguardando produto para ele poder escolher outro dessa mesma categoria,
        // mas informa como ele pode voltar.
        await msg.reply(`\nDigite o número de outro produto dessa categoria para vê-lo, ou digite *#* para voltar ao menu principal.`);
    }
}

module.exports = ProdutoStage;