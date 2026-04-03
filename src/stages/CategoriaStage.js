const catalogo = require('../data/catalogo.json');
const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');

class CategoriaStage {
    static async executar(msg, texto, sessao) {
        
        // 1. Desvio da IA (Opção 6)
        if (texto === '6') {
            await msg.reply(mensagens.ia.saudacao);
            sessao.etapa = 'conversando_com_ia';
            return; 
        }

        // 2. Desvio do Atendente Humano (Opção 0)
        if (texto === '0') {
            await msg.reply(mensagens.erros.transferenciaHumano);
            sessao.etapa = 'em_atendimento_humano';
            
            const numeroLoja = '557988125726'; 
            await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\n\nO cliente solicitou atendimento humano!\n👉 Clique aqui para falar com ele: https://wa.me/${msg.from}`);
            return;
        }

        const categoriaEscolhida = catalogo.categorias[texto];

        // 3. Retorno antecipado se o cliente digitar algo que não existe
        if (!categoriaEscolhida) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            
            if (sessao.errosConsecutivos >= 2) {
                await msg.reply(mensagens.erros.transferenciaHumano);
                sessao.etapa = 'em_atendimento_humano';
                
                // Manda o alerta porque o cliente errou 2 vezes e o bot pausou
                const numeroLoja = '557988125726'; 
                await EvolutionService.enviarMensagemText(numeroLoja, `🚨 *ATENÇÃO VENDEDOR*\n\nO bot foi pausado porque o cliente está com dificuldades!\n👉 Clique aqui para assumir: https://wa.me/${msg.from}`);
                
                sessao.errosConsecutivos = 0; 
            } else {
                await msg.reply(mensagens.erros.opcaoInvalida);
            }
            return; 
        }

        // 4. O "Caminho Feliz" (Exibe os produtos)
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = texto; 

        let submenu = `*${categoriaEscolhida.nome}*\n\n${mensagens.categoria.escolhaProduto}`;
        
        for (const [chave, produto] of Object.entries(categoriaEscolhida.produtos || {})) {
            const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
            submenu += `*${chave}️⃣ - ${produto.nome}* - R$ ${precoFormatado}\n`;
        }

        submenu += mensagens.geral.atendente;
        submenu += mensagens.geral.voltarMenu;

        await msg.reply(submenu);
        sessao.etapa = 'aguardando_produto';
    }
}

module.exports = CategoriaStage;