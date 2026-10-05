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
        
        let chave = t;
        if (!catalogo.categorias[chave]) {
            const match = t.match(/^(\d+)/);
            if (match && catalogo.categorias[match[1]]) {
                chave = match[1];
            } else {
                const encontrada = Object.entries(catalogo.categorias || {}).find(([k, c]) => 
                    c.nome.toLowerCase().includes(t) || t.includes(c.nome.toLowerCase())
                );
                if (encontrada) chave = encontrada[0];
            }
        }

        const categoriaEscolhida = catalogo.categorias[chave];

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
        sessao.categoriaSelecionada = chave;

        let submenu = `*${categoriaEscolhida.nome}*\n_${categoriaEscolhida.descricao || ''}_\n\n`;
        const rows = [];
        
        for (const [chaveProd, produto] of Object.entries(categoriaEscolhida.produtos || {})) {
            const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
            submenu += `*${chaveProd}️⃣* - *${produto.nome}* - R$ ${precoFormatado}\n`;
            rows.push({
                title: `${chaveProd}. ${produto.nome}`.substring(0, 24),
                description: `R$ ${precoFormatado}${produto.descricao ? ' - ' + produto.descricao : ''}`.substring(0, 72),
                rowId: chaveProd
            });
        }

        submenu += `\n👉 *Digite o número do produto* que deseja escolher, *0* para trocar de categoria, ou *#* para voltar ao menu principal.`;

        if (typeof msg.replyList === 'function' && rows.length > 0) {
            await msg.replyList({
                title: `🍯 ${categoriaEscolhida.nome}`,
                description: `${categoriaEscolhida.descricao || 'Selecione um produto abaixo:'}`,
                buttonText: "Ver Produtos 🍯",
                footerText: "Apiário Favo de Mel",
                sections: [{ title: categoriaEscolhida.nome, rows }]
            }, submenu);
        } else {
            await msg.reply(submenu);
        }

        sessao.etapa = 'aguardando_produto';
    }
}

module.exports = CategoriaStage;
