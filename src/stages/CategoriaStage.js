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

        const produtosArray = Object.entries(categoriaEscolhida.produtos || {}).map(([chaveProd, prod]) => ({
            id: chaveProd,
            nome: prod.nome,
            preco: prod.preco
        }));

        if (typeof msg.replyButtons === 'function' && produtosArray.length > 0) {
            if (produtosArray.length <= 3) {
                const botoes = produtosArray.map(p => ({
                    type: 'reply',
                    displayText: `${p.id}. ${p.nome}`.substring(0, 24),
                    id: p.id
                }));
                if (botoes.length < 3) {
                    botoes.push({ type: 'reply', displayText: "🏠 Menu Principal", id: "#" });
                }
                await msg.replyButtons({
                    title: `🍯 ${categoriaEscolhida.nome}`,
                    description: submenu,
                    footer: "Apiário Favo de Mel",
                    buttons: botoes
                }, submenu);
            } else {
                // Primeira parte dos botões (produtos 1, 2, 3)
                const parte1 = produtosArray.slice(0, 3).map(p => ({
                    type: 'reply',
                    displayText: `${p.id}. ${p.nome}`.substring(0, 24),
                    id: p.id
                }));
                await msg.replyButtons({
                    title: `🍯 ${categoriaEscolhida.nome}`,
                    description: submenu,
                    footer: "Apiário Favo de Mel",
                    buttons: parte1
                }, submenu);

                // Segunda parte dos botões (produtos restantes + Menu Principal)
                const restantes = produtosArray.slice(3, 5).map(p => ({
                    type: 'reply',
                    displayText: `${p.id}. ${p.nome}`.substring(0, 24),
                    id: p.id
                }));
                if (produtosArray.length > 5) {
                    restantes.push({
                        type: 'reply',
                        displayText: `${produtosArray[5].id}. ${produtosArray[5].nome}`.substring(0, 24),
                        id: produtosArray[5].id
                    });
                } else {
                    restantes.push({ type: 'reply', displayText: "🏠 Menu Principal", id: "#" });
                }
                await msg.replyButtons({
                    title: `🍯 Mais Opções`,
                    description: "Selecione uma opção abaixo:",
                    footer: "Apiário Favo de Mel",
                    buttons: restantes
                }, submenu);
            }
        } else {
            await msg.reply(submenu);
        }

        sessao.etapa = 'aguardando_produto';
    }
}

module.exports = CategoriaStage;
