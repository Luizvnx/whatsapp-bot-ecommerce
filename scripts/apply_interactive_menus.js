const fs = require('fs');
const path = require('path');

// 1. Atualizar BotController.js com suporte aprimorado a botões e respostas nativas
const botControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'BotController.js');
let botController = fs.readFileSync(botControllerPath, 'utf8');

const targetProcessarTexto = `    static processarTextoProfundo(message) {
        if (!message) return '';
        let msg = message;
        while (msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message) {
            msg = msg.ephemeralMessage?.message 
               || msg.viewOnceMessage?.message 
               || msg.viewOnceMessageV2?.message 
               || msg.documentWithCaptionMessage?.message;
        }
        return (
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            msg?.documentMessage?.caption ||
            msg?.buttonsResponseMessage?.selectedButtonId ||
            msg?.buttonsResponseMessage?.selectedDisplayText ||
            msg?.templateButtonReplyMessage?.selectedId ||
            msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
            ''
        );
    }`;

const replacementProcessarTexto = `    static processarTextoProfundo(message) {
        if (!message) return '';
        let msg = message;
        while (msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message) {
            msg = msg.ephemeralMessage?.message 
               || msg.viewOnceMessage?.message 
               || msg.viewOnceMessageV2?.message 
               || msg.documentWithCaptionMessage?.message;
        }

        let texto = (
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            msg?.documentMessage?.caption ||
            msg?.buttonsResponseMessage?.selectedButtonId ||
            msg?.buttonsResponseMessage?.selectedDisplayText ||
            msg?.templateButtonReplyMessage?.selectedId ||
            msg?.templateButtonReplyMessage?.selectedDisplayText ||
            msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            msg?.listResponseMessage?.title ||
            msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
            msg?.interactiveResponseMessage?.body?.text ||
            ''
        );

        if (typeof texto === 'string' && texto.trim().startsWith('{') && texto.trim().endsWith('}')) {
            try {
                const parsed = JSON.parse(texto);
                if (parsed.id) return String(parsed.id);
                if (parsed.rowId) return String(parsed.rowId);
                if (parsed.selectedId) return String(parsed.selectedId);
                if (parsed.displayText) return String(parsed.displayText);
            } catch (_) {}
        }
        return texto;
    }`;

botController = botController.replace(targetProcessarTexto.replace(/\r\n/g, '\n'), replacementProcessarTexto.replace(/\r\n/g, '\n'));
// Caso o arquivo tenha CRLF:
if (!botController.includes('parsed.id')) {
    botController = botController.replace(targetProcessarTexto, replacementProcessarTexto);
}
fs.writeFileSync(botControllerPath, botController, 'utf8');
console.log('✅ BotController.js: Leitura de botões e listas interativas ativada!');

// 2. Atualizar InicioStage.js com replyList interativo e fallback
const inicioPath = path.join(__dirname, '..', 'src', 'stages', 'InicioStage.js');
const inicioContent = `const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        const fallback = mensagens.inicio.boasVindas;

        if (typeof msg.replyList === 'function') {
            await msg.replyList({
                title: "🐝 Apiário Favo de Mel",
                description: "Olá! Seja bem-vindo(a) à Favo de Mel! 🍯\\nSomos especialistas em produtos puros da colmeia, resgate de abelhas e consultoria apícola em Aracaju.\\n\\nEscolha uma opção no menu:",
                buttonText: "Ver Opções 🍯",
                footerText: "Apiário Favo de Mel",
                sections: [
                    {
                        title: "Menu de Atendimento",
                        rows: [
                            {
                                rowId: "1",
                                title: "1. 🍯 Comprar Produtos",
                                description: "Méis puros, própolis, pólen, favos e bebidas"
                            },
                            {
                                rowId: "2",
                                title: "2. 🐝 Resgate de Abelhas",
                                description: "Captura e remoção segura e ecológica de enxames"
                            },
                            {
                                rowId: "3",
                                title: "3. 👨‍🌾 Consultoria Apícola",
                                description: "Manejo técnico produtivo e cursos especializados"
                            },
                            {
                                rowId: "4",
                                title: "4. ❓ Dúvidas e Informações",
                                description: "Tire dúvidas com nossa inteligência artificial"
                            }
                        ]
                    }
                ]
            }, fallback);
        } else {
            await msg.reply(fallback);
        }

        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
`;
fs.writeFileSync(inicioPath, inicioContent, 'utf8');
console.log('✅ InicioStage.js: Menu de lista interativo com fallback ativado!');

// 3. Atualizar MenuPrincipalStage.js com botões e listas interativas
const menuPath = path.join(__dirname, '..', 'src', 'stages', 'MenuPrincipalStage.js');
let menuContent = fs.readFileSync(menuPath, 'utf8');

const targetMenuCategorias = `            msgCategorias += "\\n👉 *Digite o número da categoria* ou *#* para voltar ao menu principal.";

            await msg.reply(msgCategorias);
            return;`;

const replacementMenuCategorias = `            msgCategorias += "\\n👉 *Digite o número da categoria* ou *#* para voltar ao menu principal.";

            const botoesCategorias = Object.entries(catalogo.categorias || {}).map(([chave, cat]) => ({
                id: chave,
                text: \`\${chave}. \${cat.nome}\`.substring(0, 24)
            }));

            if (typeof msg.replyButtons === 'function' && botoesCategorias.length > 0 && botoesCategorias.length <= 3) {
                await msg.replyButtons({
                    title: "🍯 Categorias de Produtos",
                    description: "Escolha uma das categorias abaixo para ver os itens disponíveis:",
                    footer: "Apiário Favo de Mel",
                    buttons: botoesCategorias
                }, msgCategorias);
            } else if (typeof msg.replyList === 'function' && rows.length > 0) {
                await msg.replyList({
                    title: "🍯 Categorias de Produtos",
                    description: "Selecione uma categoria para ver os itens disponíveis:",
                    buttonText: "Ver Categorias 🍯",
                    footerText: "Apiário Favo de Mel",
                    sections: [{ title: "Categorias", rows }]
                }, msgCategorias);
            } else {
                await msg.reply(msgCategorias);
            }
            return;`;

menuContent = menuContent.replace(targetMenuCategorias.replace(/\r\n/g, '\n'), replacementMenuCategorias.replace(/\r\n/g, '\n'));
if (!menuContent.includes('botoesCategorias')) {
    menuContent = menuContent.replace(targetMenuCategorias, replacementMenuCategorias);
}
fs.writeFileSync(menuPath, menuContent, 'utf8');
console.log('✅ MenuPrincipalStage.js: Botões e listas para categorias ativados!');

// 4. Atualizar CategoriaStage.js com replyList interativo e busca inteligente de categoria
const catPath = path.join(__dirname, '..', 'src', 'stages', 'CategoriaStage.js');
const catContent = `const CatalogoService = require('../services/CatalogoService');
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
            const match = t.match(/^(\\d+)/);
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
                .map(([num, c]) => \`*\${num}* para \${c.nome}\`)
                .join(', ');

            await msg.reply(\`⚠️ Categoria não encontrada. Digite \${categoriasDisponiveis}, ou *#* para voltar ao menu.\`);
            return;
        }

        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = chave;

        let submenu = \`*\${categoriaEscolhida.nome}*\\n_\${categoriaEscolhida.descricao || ''}_\\n\\n\`;
        const rows = [];
        
        for (const [chaveProd, produto] of Object.entries(categoriaEscolhida.produtos || {})) {
            const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
            submenu += \`*\${chaveProd}️⃣* - *\${produto.nome}* - R$ \${precoFormatado}\\n\`;
            rows.push({
                title: \`\${chaveProd}. \${produto.nome}\`.substring(0, 24),
                description: \`R$ \${precoFormatado}\${produto.descricao ? ' - ' + produto.descricao : ''}\`.substring(0, 72),
                rowId: chaveProd
            });
        }

        submenu += \`\\n👉 *Digite o número do produto* que deseja escolher, *0* para trocar de categoria, ou *#* para voltar ao menu principal.\`;

        if (typeof msg.replyList === 'function' && rows.length > 0) {
            await msg.replyList({
                title: \`🍯 \${categoriaEscolhida.nome}\`,
                description: \`\${categoriaEscolhida.descricao || 'Selecione um produto abaixo:'}\`,
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
`;
fs.writeFileSync(catPath, catContent, 'utf8');
console.log('✅ CategoriaStage.js: Lista interativa de produtos com fallback ativada!');

// 5. Atualizar ProdutoStage.js para busca flexível por ID, número ou nome
const prodPath = path.join(__dirname, '..', 'src', 'stages', 'ProdutoStage.js');
let prodContent = fs.readFileSync(prodPath, 'utf8');

const targetProdutoBusca = `        const catalogo = await CatalogoService.obterCatalogo();
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
        }`;

const replacementProdutoBusca = `        const catalogo = await CatalogoService.obterCatalogo();
        const catId = sessao.categoriaSelecionada || '1';
        const categoria = catalogo.categorias[catId];
        
        let chave = t;
        const match = t.match(/^(\\d+)/);
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
        }`;

prodContent = prodContent.replace(targetProdutoBusca.replace(/\r\n/g, '\n'), replacementProdutoBusca.replace(/\r\n/g, '\n'));
if (!prodContent.includes('const match = t.match')) {
    prodContent = prodContent.replace(targetProdutoBusca, replacementProdutoBusca);
}
fs.writeFileSync(prodPath, prodContent, 'utf8');
console.log('✅ ProdutoStage.js: Reconhecimento flexível de cliques em produtos ativado!');

// 6. Atualizar CarrinhoStage.js com botões interativos
const carPath = path.join(__dirname, '..', 'src', 'stages', 'CarrinhoStage.js');
let carContent = fs.readFileSync(carPath, 'utf8');

const targetCarrinhoInvalido = `        await msg.reply("Opção inválida. Digite *1* para adicionar mais itens ao carrinho, *2* para finalizar seu pedido ou *#* para voltar ao menu.");`;

const replacementCarrinhoInvalido = `        const fallbackInvalido = "Opção inválida. Digite *1* para adicionar mais itens ao carrinho, *2* para finalizar seu pedido ou *#* para voltar ao menu.";
        if (typeof msg.replyButtons === 'function') {
            await msg.replyButtons({
                title: "🛒 Opções do Carrinho",
                description: "Selecione uma das opções abaixo para continuar:",
                footer: "Apiário Favo de Mel",
                buttons: [
                    { id: "1", text: "🛒 Adicionar Mais" },
                    { id: "2", text: "✅ Finalizar Pedido" },
                    { id: "#", text: "🏠 Menu Principal" }
                ]
            }, fallbackInvalido);
        } else {
            await msg.reply(fallbackInvalido);
        }`;

carContent = carContent.replace(targetCarrinhoInvalido.replace(/\r\n/g, '\n'), replacementCarrinhoInvalido.replace(/\r\n/g, '\n'));
if (!carContent.includes('fallbackInvalido')) {
    carContent = carContent.replace(targetCarrinhoInvalido, replacementCarrinhoInvalido);
}
fs.writeFileSync(carPath, carContent, 'utf8');
console.log('✅ CarrinhoStage.js: Botões interativos para carrinho ativados!');
