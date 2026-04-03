require('dotenv').config();

const catalogo = require('../data/catalogo.json');
const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');
const numeroLoja = process.env.NUMERO_DA_LOJA;

class ProdutoStage {
    static async executar(msg, texto, sessao) {
        
        // 1. O SEGURANÇA: Desvio para o Atendente Humano (Opção 0)
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\n\nO cliente pediu ajuda enquanto olhava os produtos!\n👉 Link direto: https://wa.me/${msg.from}`);
            return;
        }

        // 2. O SEGURANÇA: Voltar ao Menu Principal (Opção #)
        if (texto === '#') {
            sessao.etapa = 'inicio';
            const InicioStage = require('./InicioStage');
            await InicioStage.executar(msg, '', sessao);
            return;
        }

        // 3. Verifica se o produto existe dentro da categoria que o cliente escolheu antes
        const categoriaMestre = catalogo.categorias[sessao.categoriaSelecionada];
        const produtoEscolhido = categoriaMestre.produtos[texto];

        if (!produtoEscolhido) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            
            if (sessao.errosConsecutivos >= 2) {
                await msg.reply(mensagens.erros.transferenciaHumano);
                sessao.etapa = 'em_atendimento_humano';
                
                await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\n\nO bot foi pausado porque o cliente está com dificuldades para escolher um produto!\n👉 Link direto: https://wa.me/${msg.from}`);
                sessao.errosConsecutivos = 0; 
            } else {
                await msg.reply("⚠️ Produto não encontrado. Digite o número correspondente ao produto, 0 para atendente ou # para voltar.");
            }
            return;
        }

        // 4. O CAMINHO FELIZ (Início do Carrinho de Compras)
        sessao.errosConsecutivos = 0;
        
        // Formata o preço para mostrar bonito
        const precoFormatado = produtoEscolhido.preco.toFixed(2).replace('.', ',');

        // (Aqui vamos colocar a lógica real de adicionar no carrinho no futuro)
        await msg.reply(`✅ Você selecionou: *${produtoEscolhido.nome}* por R$ ${precoFormatado}.`);
    }
}

module.exports = ProdutoStage;