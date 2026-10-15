const CrmClienteService = require('../services/CrmClienteService');

class EntregaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        sessao.dadosEntregaTexto = texto;
        sessao.etapa = 'em_atendimento_humano';
        sessao.pedidoFinalizado = true;

        // Salva endereço no perfil do CRM e move oportunidade para 'aguardando_pagamento'
        try {
            const CrmPipelineService = require('../services/CrmPipelineService');
            let totalPedido = 0;
            if (Array.isArray(sessao.carrinho)) {
                sessao.carrinho.forEach(item => {
                    totalPedido += (parseFloat(item.preco) || 0) * (parseInt(item.quantidade, 10) || 1);
                });
            }
            const idAlvo = msg.numeroReal || msg.numeroCliente;
            
            // Registra endereço e tag no perfil do cliente sem concluir a compra prematurely
            await CrmClienteService.atualizar(idAlvo, { endereco: { texto } });
            await CrmClienteService.adicionarTag(idAlvo, 'aguardando_pix');

            // Move o card no Funil para 'Aguardando Pagamento' com o valor do carrinho
            await CrmPipelineService.sincronizarEtapaComBot(idAlvo, 'aguardando_dados_entrega', { 
                totalPedido,
                carrinho: sessao.carrinho,
                endereco: texto 
            });
        } catch (e) {
            console.warn('[EntregaStage] Falha ao atualizar CRM no envio de endereço:', e.message);
        }

        await msg.reply(
            "✅ *Perfeito! Recebemos seus dados de entrega com sucesso!*\n\n" +
            "Nossa equipe já está separando o seu pedido. Em instantes um de nossos atendentes vai te enviar a confirmação da taxa de entrega e a chave Pix para pagamento aqui no chat! 🐝🍯\n\n" +
            "_(Se desejar fazer outro pedido ou voltar ao menu a qualquer momento, digite *#* ou *menu*.)_"
        );
    }
}

module.exports = EntregaStage;
