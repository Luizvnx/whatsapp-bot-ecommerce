const catalogo = require('../data/catalogo.json');
const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');
const numeroLoja = process.env.NUMERO_DA_LOJA;

class CarrinhoStage {
    static async executar(msg, texto, sessao) {
        
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\nO cliente pediu ajuda!${msg.linkAlerta}`);
        }

        if (texto === '1') {
            let menu = `Ótimo! Escolha outra categoria para adicionar mais produtos:\n\n`;
            for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
                menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
            }
            await msg.reply(menu);
            sessao.etapa = 'aguardando_categoria';
            return;
        }

        if (texto === '2') {
            // O cliente quer finalizar. (AQUI VAI ENTRAR O SEU FUTURO SISTEMA DE PAGAMENTO)
            await msg.reply(`🎉 Perfeito! Seu pedido está sendo processado para pagamento.`);
            sessao.etapa = 'aguardando_pagamento';
            return;
        }

        await msg.reply("⚠️ Opção inválida." + mensagens.carrinho.opcoes);
    }
}

module.exports = CarrinhoStage;