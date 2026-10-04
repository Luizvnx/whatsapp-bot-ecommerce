const CatalogoService = require('../services/CatalogoService');
const mensagens = require('../data/mensagens.json');

class ProdutoStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        const catalogo = await CatalogoService.obterCatalogo();
        const catId = sessao.categoriaSelecionada || '1';
        const categoria = catalogo.categorias[catId];
        let produtoEscolhido = categoria?.produtos?.[t];

        // Se não achou na categoria atual, tenta procurar pelo número ou nome em qualquer categoria
        if (!produtoEscolhido) {
            for (const c of Object.values(catalogo.categorias || {})) {
                if (c.produtos && c.produtos[t]) {
                    produtoEscolhido = c.produtos[t];
                    break;
                }
            }
        }

        if (!produtoEscolhido) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            if (sessao.errosConsecutivos >= 3) {
                await msg.reply("🔇 Vou chamar um atendente para te auxiliar na escolha do produto. Aguarde um instante! 🐝");
                sessao.etapa = 'em_atendimento_humano';
                return;
            }
            await msg.reply("⚠️ Produto não encontrado. Digite o número correspondente ao produto desejado, ou digite *#* para voltar ao menu.");
            return;
        }

        sessao.errosConsecutivos = 0;
        sessao.produtoTemporario = produtoEscolhido;

        const precoFormatado = produtoEscolhido.preco.toFixed(2).replace('.', ',');
        const desc = produtoEscolhido.descricao ? `_${produtoEscolhido.descricao}_\n\n` : '';
        const textoMsg = `✅ Você selecionou: *${produtoEscolhido.nome}* (R$ ${precoFormatado}) 🍯\n${desc}${mensagens.produtos.pedeQuantidade}`;

        if (produtoEscolhido.foto && typeof msg.replyMedia === 'function') {
            await msg.replyMedia(produtoEscolhido.foto, textoMsg);
        } else {
            await msg.reply(textoMsg);
        }
        sessao.etapa = 'aguardando_quantidade';
    }
}

module.exports = ProdutoStage;