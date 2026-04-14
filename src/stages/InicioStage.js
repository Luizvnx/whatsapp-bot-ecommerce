const catalogo = require('../data/catalogo.json');
const mensagens = require('../data/mensagens.json');
const EvolutionService = require('../services/EvolutionService');

class InicioStage {
    static async executar(msg, texto, sessao) {
        sessao.errosConsecutivos = 0;

        await EvolutionService.gerenciarEtiqueta(msg.from).catch(() => {});
        
        // Puxa o texto direto do JSON
        let menu = mensagens.inicio.boasVindas; 
        
        for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
            menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
        }
        
        await msg.reply(menu);
        sessao.etapa = 'aguardando_categoria';
    }
}

module.exports = InicioStage;