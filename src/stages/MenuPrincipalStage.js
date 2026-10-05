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
            
            const botoesCategorias = [
                { type: "reply", displayText: "🍯 Méis & Favos", id: "1" },
                { type: "reply", displayText: "🌿 Própolis & Cuidados", id: "2" },
                { type: "reply", displayText: "🕯️ Artesanais & Cera", id: "3" }
            ];

            const desc = "Escolha uma categoria abaixo para ver os itens disponíveis:";
            const fallback = `🍯 *Produtos da Colmeia - Favo de Mel*\n\n${desc}\n\n[ 🍯 Méis & Favos ]  [ 🌿 Própolis & Cuidados ]  [ 🕯️ Artesanais & Cera ]`;

            if (typeof msg.replyButtons === 'function') {
                await msg.replyButtons({
                    title: "🍯 Produtos da Colmeia",
                    description: desc,
                    footer: "Apiário Favo de Mel",
                    buttons: botoesCategorias
                }, fallback);
            } else {
                await msg.reply(fallback);
            }
            return;
        }

        if (t === '2' || t.includes('captura') || t.includes('resgate') || t.includes('enxame') || t.includes('remover abelha')) {
            return await ResgateStage.executar(msg, texto, sessao);
        }

        // Opção 3: Consultoria e Manejo Apícola
        if (t === '3' || t === 'consultoria' || t.includes('consultoria') || t.includes('curso') || t.includes('manejo') || t.includes('apiario')) {
            return await ConsultoriaStage.executar(msg, texto, sessao);
        }

        // Opção 4: Dúvidas ou falar com IA
        if (t === '4' || t === 'ia' || t.includes('duvida') || t.includes('dúvida') || t.includes('pergunta')) {
            sessao.etapa = 'conversando_com_ia';
            await msg.reply(mensagens.ia.saudacao);
            return;
        }

        // Se o cliente digitou uma pergunta ou frase livre, responde via IA
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

        const fallbackInvalido = "⚠️ Opção não reconhecida. Por favor, escolha uma das opções abaixo ou digite *#* para voltar ao menu principal.";
        if (typeof msg.replyButtons === 'function') {
            await msg.replyButtons({
                title: "🐝 Apiário Favo de Mel",
                description: "Não entendi sua resposta. Escolha uma das opções:",
                footer: "Apiário Favo de Mel",
                buttons: [
                    { type: "reply", displayText: "🍯 Comprar Produtos", id: "1" },
                    { type: "reply", displayText: "🐝 Resgate Abelhas", id: "2" },
                    { type: "reply", displayText: "❓ Dúvidas e Mais", id: "3" }
                ]
            }, fallbackInvalido);
        } else {
            await msg.reply(fallbackInvalido);
        }
    }
}

module.exports = MenuPrincipalStage;
