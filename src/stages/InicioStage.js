const catalogo = require('../data/catalogo.json');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;
        let menu = `Olá! 🐝 Bem-vindo à nossa loja!\n\nEscolha uma categoria para ver nossos produtos:\n\n`;
        
        for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
            menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
        }
        
        menu += `\n*0️⃣ - Falar com atendente*`;
        
        await msg.reply(menu);
        sessao.etapa = 'aguardando_categoria';
    }
}
module.exports = InicioStage;