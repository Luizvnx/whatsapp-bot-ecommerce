const CatalogoService = require('../services/CatalogoService');
const mensagens = require('../data/mensagens.json');

class CategoriaStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'voltar' || t === 'menu') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        const catalogo = await CatalogoService.obterCatalogo();
        const categoriaEscolhida = catalogo.categorias[t];

        if (!categoriaEscolhida) {
            sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
            if (sessao.errosConsecutivos >= 3) {
                await msg.reply("🔇 Não consegui identificar a categoria. Vou te transferir para um atendente humano. Aguarde um instante! 🐝");
                sessao.etapa = 'em_atendimento_humano';
                return;
            }

            const categoriasDisponiveis = Object.entries(catalogo.categorias || {})
                .map(([num, c]) => `*${num}* para ${c.nome}`)
                .join(', ');

            await msg.reply(`⚠️ Categoria não encontrada. Digite ${categoriasDisponiveis}, ou *#* para voltar ao menu.`);
            return;
        }

        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = t;

        let submenu = `*${categoriaEscolhida.nome}*\n_${categoriaEscolhida.descricao || ''}_\n\n`;
        
        for (const [chave, produto] of Object.entries(categoriaEscolhida.produtos || {})) {
            const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
            submenu += `*${chave}️⃣* - *${produto.nome}* - R$ ${precoFormatado}\n`;
        }

        submenu += `\n👉 *Digite o número do produto* que deseja escolher, *0* para trocar de categoria, ou *#* para voltar ao menu principal.`;

        await msg.reply(submenu);
        sessao.etapa = 'aguardando_produto';
    }
}

module.exports = CategoriaStage;