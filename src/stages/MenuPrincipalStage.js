const mensagens = require('../data/mensagens.json');
const CategoriaStage = require('./CategoriaStage');
const ResgateStage = require('./ResgateStage');
const ConsultoriaStage = require('./ConsultoriaStage');
const IaStage = require('./IaStage');

class MenuPrincipalStage {
    static async executar(msg, texto, sessao) {
        const t = (texto || '').toLowerCase().trim();

        if (t === '#' || t === 'menu' || t === 'voltar' || t === 'inicio') {
            const InicioStage = require('./InicioStage');
            return await InicioStage.executar(msg, '', sessao);
        }

        if (t === '1' || t.includes('mel') || t.includes('comprar') || t.includes('produto') || t.includes('catalogo')) {
            sessao.etapa = 'aguardando_categoria';
            const CatalogoService = require('../services/CatalogoService');
            const catalogo = await CatalogoService.obterCatalogo();
            
            let msgCategorias = "🍯 *Produtos da Colmeia - Favo de Mel*\n\nEscolha uma categoria para ver os itens disponíveis:\n\n";
            const rows = [];
            for (const [chave, cat] of Object.entries(catalogo.categorias || {})) {
                msgCategorias += `*${chave}️⃣* - ${cat.nome}\n`;
                rows.push({
                    title: `${chave}. ${cat.nome}`,
                    description: cat.descricao ? cat.descricao.substring(0, 60) : `Ver produtos de ${cat.nome}`,
                    rowId: chave
                });
            }
            msgCategorias += "\n👉 *Digite o número da categoria* ou *#* para voltar ao menu principal.";

            if (typeof msg.replyList === 'function' && rows.length > 0) {
                await msg.replyList({
                    title: "🍯 Categorias de Produtos",
                    description: "Toque no botão abaixo para escolher uma categoria do catálogo:",
                    buttonText: "Ver Categorias 🍯",
                    footerText: "Apiário Favo de Mel",
                    sections: [
                        {
                            title: "Categorias da Colmeia",
                            rows: rows.map(r => ({
                                ...r,
                                title: r.title.substring(0, 24),
                                description: (r.description || '').substring(0, 72)
                            }))
                        }
                    ]
                }, msgCategorias);
            } else {
                await msg.reply(msgCategorias);
            }
            return;
        }

        if (t === '2' || t.includes('captura') || t.includes('resgate') || t.includes('enxame') || t.includes('remover abelha')) {
            return await ResgateStage.executar(msg, texto, sessao);
        }

        if (t === '3' || t.includes('consultoria') || t.includes('curso') || t.includes('manejo') || t.includes('apiario')) {
            return await ConsultoriaStage.executar(msg, texto, sessao);
        }

        if (t === '4' || t.includes('duvida') || t.includes('dúvida') || t.includes('pergunta')) {
            sessao.etapa = 'conversando_com_ia';
            await msg.reply(mensagens.ia.saudacao);
            return;
        }

        // Se o cliente digitou uma pergunta ou frase livre, tenta responder via IA
        if (t.length > 5 && !/^[0-9#]+$/.test(t)) {
            sessao.etapa = 'conversando_com_ia';
            return await IaStage.executar(msg, texto, sessao);
        }

        // Opção inválida
        sessao.errosConsecutivos = (sessao.errosConsecutivos || 0) + 1;
        if (sessao.errosConsecutivos >= 3) {
            await msg.reply("🔇 Vou te transferir para nossa equipe de atendimento para te ajudar melhor. Aguarde só um instante! 🐝");
            sessao.etapa = 'em_atendimento_humano';
            return;
        }

        await msg.reply(mensagens.erros.opcaoInvalida);
    }
}

module.exports = MenuPrincipalStage;
