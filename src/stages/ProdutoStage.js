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
        sessao.produtoTemporario = produtoEscolhido;
        
        // Formata o preço para mostrar bonito
        const precoFormatado = produtoEscolhido.preco.toFixed(2).replace('.', ',');
        await msg.reply(`Você selecionou: *${produtoEscolhido.nome}* (R$ ${precoFormatado}).\n\n${mensagens.carrinho.pedeQuantidade}`);
        await msg.reply(`✅ Você selecionou: *${produtoEscolhido.nome}* por R$ ${precoFormatado}.`);
        sessao.etapa = 'aguardando_quantidade';
    }
}

module.exports = ProdutoStage;