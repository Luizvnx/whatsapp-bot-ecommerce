const PedidoRepository = require('../repositories/pedidoRepository');
const MercadoPagoService = require('../services/mercadoPagoService');
const catalogo = require('../data/catalogo.json'); 

const sessoes = new Map();
const tempoInicioServidor = Math.floor(Date.now() / 1000);
const NUMERO_ADMIN = process.env.NUMERO_ADMIN;
const TEMPO_EXPIRACAO = 30 * 60 * 1000;

let botPausadoGlobalmente = false; 

class BotController {
    static async processarMensagem(msg) {
        if (msg.timestamp < tempoInicioServidor) return;

        if (msg.type === 'e2e_notification' || msg.type === 'call_log' || msg.type === 'protocol' || !msg.body) {
            return; 
        }

        if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') {
            return;
        }

        const texto = msg.body.toLowerCase();

        // ==========================================
        // CONTROLES DO ATENDENTE (MENSAGENS ENVIADAS POR VOCÊ)
        // ==========================================
        if (msg.fromMe) {
            if (texto === '/pausarbot') {
                botPausadoGlobalmente = true;
                console.log('⏸️ Bot pausado globalmente pelo admin.');
                return;
            }
            if (texto === '/ligarbot') {
                botPausadoGlobalmente = false;
                console.log('▶️ Bot reativado globalmente pelo admin.');
                return;
            }

            const numeroClienteAAtender = msg.to; 
            
            if (sessoes.has(numeroClienteAAtender) && texto !== '/bot') {
                const sessaoCliente = sessoes.get(numeroClienteAAtender);
                if (sessaoCliente.etapa !== 'em_atendimento_humano') {
                    sessaoCliente.etapa = 'em_atendimento_humano';
                    console.log(`[WhatsApp] Atendimento humano detectado para ${numeroClienteAAtender}. Bot silenciado.`);
                }
            }
            return; 
        }

        if (botPausadoGlobalmente) return;

        const numeroCliente = msg.from;

        if (!sessoes.has(numeroCliente)) {
            sessoes.set(numeroCliente, { 
                etapa: 'inicio', 
                pedido_temp: null,
                categoriaSelecionada: null,
                ultimaInteracao: Date.now(),
                errosConsecutivos: 0
            });
        }

        const sessao = sessoes.get(numeroCliente);
        const tempoOcioso = Date.now() - sessao.ultimaInteracao;
    
        if (tempoOcioso > TEMPO_EXPIRACAO && sessao.etapa !== 'em_atendimento_humano' && sessao.etapa !== 'inicio') {
            sessao.etapa = 'inicio';
            sessao.categoriaSelecionada = null;
            sessao.errosConsecutivos = 0;
            sessao.ultimaInteracao = Date.now();
            await msg.reply("⏳ Sua sessão expirou devido à inatividade. Vamos começar de novo! 🐝\n\nDigite qualquer coisa para ver o menu novamente.");
            return; 
        }

        sessao.ultimaInteracao = Date.now();

        // ==========================================
        // ETAPA INICIAL: Menu de Categorias
        // ==========================================
        if (sessao.etapa === 'inicio') {
            sessao.errosConsecutivos = 0;
            let menu = `Olá! 🐝 Bem-vindo à nossa loja!\n\nEscolha uma categoria para ver nossos produtos:\n\n`;
            
            for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
                menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
            }
            
            menu += `\n*0️⃣ - Falar com atendente*`;
            
            await msg.reply(menu);
            sessao.etapa = 'aguardando_categoria';
            return;
        }

        // ==========================================
        // ETAPA: Escolhendo a Categoria
        // ==========================================
        if (sessao.etapa === 'aguardando_categoria') {
            if (texto === '0') {
                await msg.reply("👨‍🌾 Um momento, por favor. Vou te transferir para um atendente humano. Logo responderemos!");
                sessao.etapa = 'em_atendimento_humano';
                return;
            }

            const categoriaEscolhida = catalogo.categorias[texto];

            if (categoriaEscolhida) {
                sessao.errosConsecutivos = 0;
                sessao.categoriaSelecionada = texto; 

                let submenu = `Você escolheu *${categoriaEscolhida.nome}*.\n\nDigite o número do produto desejado:\n\n`;
                
                for (const [chave, produto] of Object.entries(categoriaEscolhida.produtos)) {
                    const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
                    submenu += `*${chave}️⃣ - ${produto.nome}* - R$ ${precoFormatado}\n`;
                }

                // NOVO: Adicionamos a opção 0 visualmente no submenu!
                submenu += `\n*0️⃣ - Falar com atendente*`;
                submenu += `\n*#️⃣ - Voltar ao menu principal*`;

                await msg.reply(submenu);
                sessao.etapa = 'aguardando_produto';
            } else {
                sessao.errosConsecutivos++;

                if (sessao.errosConsecutivos >= 2) {
                    await msg.reply("🔇 Percebi que você quer falar direto com a gente! Vou pausar o robô por aqui para um vendedor te atender.\n\n(Se quiser voltar ao menu automático, basta digitar */bot*).");
                    sessao.etapa = 'em_atendimento_humano';
                    sessao.errosConsecutivos = 0; 
                } else {
                    await msg.reply("⚠️ Categoria inválida. Por favor, digite o número correspondente ou 0 para falar com um atendente.");
                }
            }
            return;
        }

        // ==========================================
        // ETAPA: Escolhendo o Produto Final
        // ==========================================
        if (sessao.etapa === 'aguardando_produto') {
            // NOVO: Ensinamos o bot a ler o '0' dentro do submenu dos produtos!
            if (texto === '0') {
                await msg.reply("👨‍🌾 Um momento, por favor. Vou te transferir para um atendente humano. Logo responderemos!");
                sessao.etapa = 'em_atendimento_humano';
                return;
            }

            if (texto === '#') {
                sessao.errosConsecutivos = 0; 
                let menu = `Voltando ao menu principal... 🐝\n\nEscolha uma categoria para ver nossos produtos:\n\n`;
                
                for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
                    menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
                }
                menu += `\n*0️⃣ - Falar com atendente*`;
                
                await msg.reply(menu);
                sessao.etapa = 'aguardando_categoria'; 
                return;
            }

            const idCategoria = sessao.categoriaSelecionada;
            const produtoEscolhido = catalogo.categorias[idCategoria].produtos[texto];

            if (produtoEscolhido) {
                sessao.errosConsecutivos = 0; 
                
                await msg.reply(`✅ Você escolheu: *${produtoEscolhido.nome}*.\nValor: R$ ${produtoEscolhido.preco.toFixed(2).replace('.', ',')}\n\n(A integração de pagamento retornará em breve. Digite 0 se quiser falar com o vendedor para finalizar seu pedido).`);
                sessao.etapa = 'inicio';
            } else {
                sessao.errosConsecutivos++;

                if (sessao.errosConsecutivos >= 2) {
                    await msg.reply("🔇 Vou pausar o robô automático para que um vendedor te atenda, ok?\n\n(Para voltar ao menu, digite */bot*).");
                    sessao.etapa = 'em_atendimento_humano';
                    sessao.errosConsecutivos = 0;
                } else {
                    await msg.reply("⚠️ Produto inválido. Digite o número correspondente, 0 para atendente, ou # para voltar.");
                }
            }
            return;
        }

        if (sessao.etapa === 'aguardando_pagamento') {
            if (texto === 'cancelar') {
                sessao.etapa = 'inicio';
                await msg.reply("Pedido cancelado. Voltamos ao menu principal!");
            } else {
                await msg.reply("⏳ Seu pedido está aguardando o pagamento do Pix.\n\nSe quiser cancelar, digite *cancelar*.");
            }
            return;
        }
        
        // ==========================================
        // ETAPA HUMANA
        // ==========================================
        if (sessao.etapa === 'em_atendimento_humano') {
            if (texto === '/voltar' || texto === '/bot') {
                sessao.etapa = 'inicio';
                await msg.reply("🤖 Atendimento automático reativado! Digite qualquer coisa para ver o menu.");
            }
            return;
        }
    }
}

module.exports = BotController;