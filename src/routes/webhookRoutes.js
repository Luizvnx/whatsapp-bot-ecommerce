const PedidoRepository = require('../repositories/pedidoRepository');
const MercadoPagoService = require('../services/mercadoPagoService');
const catalogo = require('../data/catalogo.json'); 

const sessoes = new Map();
const tempoInicioServidor = Math.floor(Date.now() / 1000);
const NUMERO_ADMIN = process.env.NUMERO_ADMIN;

class BotController {
    
    static async processarMensagem(msg) {
        if (msg.timestamp < tempoInicioServidor) return;
        
        if (msg.from !== NUMERO_ADMIN) {
            console.log(`[WhatsApp] Ignorando mensagem de ${msg.from} (não é o administrador)`);
            return;
        }

        const texto = msg.body.toLowerCase();
        const numeroCliente = msg.from;

        // Gerencia a criação da sessão
        if (!sessoes.has(numeroCliente)) {
            sessoes.set(numeroCliente, { 
                etapa: 'inicio', 
                pedido_temp: null,
                categoriaSelecionada: null 
            });
        }

        const sessao = sessoes.get(numeroCliente);
        console.log(`[WhatsApp] Cliente ${numeroCliente} está na etapa: ${sessao.etapa}`);

        // Roteamento de Estados (Máquina de Estados Limpa)
        switch (sessao.etapa) {
            case 'inicio':
                return await this._etapaInicio(msg, sessao);
            case 'aguardando_categoria':
                return await this._etapaAguardandoCategoria(msg, texto, sessao);
            case 'aguardando_produto':
                return await this._etapaAguardandoProduto(msg, texto, sessao);
            case 'aguardando_pagamento':
                return await this._etapaAguardandoPagamento(msg, texto, sessao);
            case 'em_atendimento_humano':
                return await this._etapaHumano(msg, texto, sessao);
            default:
                sessao.etapa = 'inicio';
        }
    }

    // ==========================================
    // FUNÇÕES AUXILIARES (Helpers)
    // ==========================================
    
    static _gerarMenuPrincipal(titulo = "Olá! 🐝 Bem-vindo à nossa loja!") {
        let menu = `${titulo}\n\nEscolha uma categoria para ver nossos produtos:\n\n`;
        for (const [chave, categoria] of Object.entries(catalogo.categorias)) {
            menu += `*${chave}️⃣ - ${categoria.nome}*\n`;
        }
        menu += `\n*0️⃣ - Falar com atendente*`;
        return menu;
    }

    // ==========================================
    // LÓGICA DE CADA ETAPA ISOLADA
    // ==========================================

    static async _etapaInicio(msg, sessao) {
        await msg.reply(this._gerarMenuPrincipal());
        sessao.etapa = 'aguardando_categoria';
    }

    static async _etapaAguardandoCategoria(msg, texto, sessao) {
        if (texto === '0') {
            await msg.reply("👨‍🌾 Um momento, por favor. Vou te transferir para um atendente humano. Logo responderemos!");
            sessao.etapa = 'em_atendimento_humano';
            return;
        }

        const categoriaEscolhida = catalogo.categorias[texto];

        if (!categoriaEscolhida) {
            return await msg.reply("⚠️ Categoria inválida. Por favor, digite o número correspondente ou 0 para falar com um atendente.");
        }

        sessao.categoriaSelecionada = texto; 
        let submenu = `Você escolheu *${categoriaEscolhida.nome}*.\n\nDigite o número do produto desejado:\n\n`;
        
        for (const [chave, produto] of Object.entries(categoriaEscolhida.produtos)) {
            const precoFormatado = produto.preco.toFixed(2).replace('.', ',');
            submenu += `*${chave}️⃣ - ${produto.nome}* - R$ ${precoFormatado}\n`;
        }
        submenu += `\n*#️⃣ - Voltar ao menu principal*`;

        await msg.reply(submenu);
        sessao.etapa = 'aguardando_produto';
    }

    static async _etapaAguardandoProduto(msg, texto, sessao) {
        if (texto === '#') {
            const menuVoltar = this._gerarMenuPrincipal("Voltando ao menu principal... 🐝");
            await msg.reply(menuVoltar);
            sessao.etapa = 'aguardando_categoria'; 
            return;
        }

        const idCategoria = sessao.categoriaSelecionada;
        const produtoEscolhido = catalogo.categorias[idCategoria].produtos[texto];

        if (!produtoEscolhido) {
            return await msg.reply("⚠️ Produto inválido. Digite o número correspondente ou # para voltar às categorias.");
        }

        await msg.reply(`✅ Você escolheu: *${produtoEscolhido.nome}*.\nValor: R$ ${produtoEscolhido.preco.toFixed(2).replace('.', ',')}\n\n(A integração de pagamento retornará em breve. Digite 0 se quiser falar com o vendedor para finalizar seu pedido).`);
        sessao.etapa = 'inicio';

        /* ========================================================
            BLOCO MERCADO PAGO RESERVADO
           ========================================================
        try {
            await msg.reply(`⏳ Excelente escolha! Gerando o seu código Pix para *${produtoEscolhido.nome}*...`);
            const pix = await MercadoPagoService.gerarPix(produtoEscolhido.nome, produtoEscolhido.preco);
            await PedidoRepository.criarPedido(pix.transacaoId, produtoEscolhido.nome, produtoEscolhido.preco);
            
            await msg.reply(`✅ *Pedido Gerado com Sucesso!*\n\nValor: R$ ${produtoEscolhido.preco.toFixed(2)}\n\nCopie o código abaixo e cole no aplicativo do seu banco:`);
            await msg.reply(pix.pixCopiaECola);
            
            sessao.etapa = 'aguardando_pagamento';
        } catch (erro) {
            await msg.reply("❌ Puxa, tivemos um problema ao gerar seu Pix. Por favor, digite 0 para falar comigo diretamente.");
            sessao.etapa = 'inicio';
        }
        ======================================================== */
    }

    static async _etapaAguardandoPagamento(msg, texto, sessao) {
        if (texto === 'cancelar') {
            sessao.etapa = 'inicio';
            await msg.reply("Pedido cancelado. Voltamos ao menu principal!");
        } else {
            await msg.reply("⏳ Seu pedido está aguardando o pagamento do Pix.\n\nSe quiser cancelar, digite *cancelar*.");
        }
    }

    static async _etapaHumano(msg, texto, sessao) {
        if (texto === '/voltar') {
            sessao.etapa = 'inicio';
            await msg.reply("🤖 Atendimento automático reativado.");
        }
    }
}

module.exports = BotController;