const CatalogoService = require('../services/CatalogoService');
const mensagens = require('../data/mensagens.json');

class ProdutoStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        // Permite redefinir/trocar de categoria diretamente
        if (t === '0' || t.includes('categoria') || t.includes('categorias') || t.includes('mudar') || t.includes('trocar') || t.includes('redefinir')) {
            sessao.etapa = 'aguardando_categoria';
            sessao.errosConsecutivos = 0;
            const catalogo = await CatalogoService.obterCatalogo();
            let msgCategorias = `🍯 *Categorias de Produtos - Favo de Mel*\n\nEscolha uma categoria para ver os itens:\n\n`;
            for (const [chave, cat] of Object.entries(catalogo.categorias || {})) {
                msgCategorias += `*${chave}️⃣* - ${cat.nome}\n`;
            }
            msgCategorias += `\n👉 *Digite o número da categoria* ou *#* para o menu principal.`;
            return await msg.reply(msgCategorias);
        }

        const catalogo = await CatalogoService.obterCatalogo();
        const catId = sessao.categoriaSelecionada || '1';
        const categoria = catalogo.categorias[catId];
        
        let chave = t;
        const match = t.match(/^(\d+)/);
        if (match) chave = match[1];

        let produtoEscolhido = categoria?.produtos?.[chave] || categoria?.produtos?.[t];

        // Se não achou na categoria atual, tenta procurar pelo número ou nome em qualquer categoria
        if (!produtoEscolhido) {
            for (const c of Object.values(catalogo.categorias || {})) {
                if (c.produtos && (c.produtos[chave] || c.produtos[t])) {
                    produtoEscolhido = c.produtos[chave] || c.produtos[t];
                    break;
                }
                if (c.produtos) {
                    const porNome = Object.values(c.produtos).find(p => 
                        p.nome.toLowerCase().includes(t) || t.includes(p.nome.toLowerCase())
                    );
                    if (porNome) {
                        produtoEscolhido = porNome;
                        break;
                    }
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
            await msg.reply("⚠️ Produto não encontrado. Digite o número correspondente ao produto desejado, *0* para trocar de categoria, ou *#* para voltar ao menu.");
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