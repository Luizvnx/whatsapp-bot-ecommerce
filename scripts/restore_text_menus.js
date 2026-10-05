const fs = require('fs');
const path = require('path');

// 1. InicioStage.js
const inicioPath = path.join(__dirname, '..', 'src', 'stages', 'InicioStage.js');
const inicioContent = `const mensagens = require('../data/mensagens.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        sessao.categoriaSelecionada = null;
        sessao.produtoSelecionado = null;

        await msg.reply(mensagens.inicio.boasVindas);
        sessao.etapa = 'menu_principal';
    }
}

module.exports = InicioStage;
`;
fs.writeFileSync(inicioPath, inicioContent, 'utf8');
console.log('✅ InicioStage.js revertido para menu de texto 100% estável');

// 2. MenuPrincipalStage.js
const menuPath = path.join(__dirname, '..', 'src', 'stages', 'MenuPrincipalStage.js');
let menuContent = fs.readFileSync(menuPath, 'utf8');
menuContent = menuContent.replace(
    /const botoesCategorias = Object\.entries[\s\S]*?await msg\.reply\(msgCategorias\);\s*\}/,
    'await msg.reply(msgCategorias);'
);
fs.writeFileSync(menuPath, menuContent, 'utf8');
console.log('✅ MenuPrincipalStage.js revertido para menu de texto 100% estável');

// 3. CategoriaStage.js
const catPath = path.join(__dirname, '..', 'src', 'stages', 'CategoriaStage.js');
let catContent = fs.readFileSync(catPath, 'utf8');
catContent = catContent.replace(
    /const botoesProdutos = \[\];[\s\S]*?await msg\.reply\(submenu\);\s*\}/,
    'await msg.reply(submenu);'
);
fs.writeFileSync(catPath, catContent, 'utf8');
console.log('✅ CategoriaStage.js revertido para menu de texto 100% estável');

// 4. CarrinhoStage.js
const carPath = path.join(__dirname, '..', 'src', 'stages', 'CarrinhoStage.js');
let carContent = fs.readFileSync(carPath, 'utf8');
carContent = carContent.replace(
    /if \(typeof msg\.replyButtons === 'function'\) \{[\s\S]*?\} else \{\s*await msg\.reply\("Opção inválida\. Digite \*1\* para adicionar mais itens ao carrinho, \*2\* para finalizar seu pedido ou \*#\* para voltar ao menu\."\);\s*\}/,
    'await msg.reply("Opção inválida. Digite *1* para adicionar mais itens ao carrinho, *2* para finalizar seu pedido ou *#* para voltar ao menu.");'
);
fs.writeFileSync(carPath, carContent, 'utf8');
console.log('✅ CarrinhoStage.js revertido para menu de texto 100% estável');
