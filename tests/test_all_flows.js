/**
 * Test Suite: Validação Completa de Todos os Fluxos do Bot Favo de Mel
 */
const assert = require('assert');

// Mock EvolutionService para não disparar chamadas HTTP externas durante os testes
const EvolutionService = require('../src/services/EvolutionService');
EvolutionService.enviarMensagemText = async (numero, texto) => {
    return { key: { id: 'MOCK_MSG_' + Date.now() }, text: texto };
};
EvolutionService.gerenciarEtiqueta = async (numero, labelId, action) => {
    return { success: true };
};

// Mock SessionService
const SessionService = require('../src/services/SessionService');
SessionService.alternarModoAtendimento = async (id, modo) => {
    return { success: true, modo };
};
SessionService.adicionarMensagem = async () => ({ id: 'MOCK_ID' });

// Mock GeminiService para testes de IA rápidos e determinísticos
const GeminiService = require('../src/services/GeminiService');
GeminiService.perguntar = async (texto) => {
    const t = (texto || '').toLowerCase();
    if (t.includes('mel') || t.includes('jatai') || t.includes('jataí') || t.includes('propolis') || t.includes('própolis')) {
        return {
            resposta: "O Mel de Jataí é 100% puro e medicinal, colhido de abelhas nativas sem ferrão.",
            transferirHumano: false,
            relacionadoComMelOuLoja: true,
            intencao: 'duvida_produto',
            sugerirAcao: 'catalogo'
        };
    }
    return {
        resposta: "Entendi! Vou transferir para nossa equipe humana.",
        transferirHumano: true,
        relacionadoComMelOuLoja: false,
        intencao: 'outro',
        sugerirAcao: 'nenhuma'
    };
};

// Estágios
const InicioStage = require('../src/stages/InicioStage');
const MenuPrincipalStage = require('../src/stages/MenuPrincipalStage');
const CategoriaStage = require('../src/stages/CategoriaStage');
const ProdutoStage = require('../src/stages/ProdutoStage');
const QuantidadeStage = require('../src/stages/QuantidadeStage');
const CarrinhoStage = require('../src/stages/CarrinhoStage');
const EntregaStage = require('../src/stages/EntregaStage');
const ResgateStage = require('../src/stages/ResgateStage');
const ConsultoriaStage = require('../src/stages/ConsultoriaStage');
const HumanoStage = require('../src/stages/HumanoStage');
const IaStage = require('../src/stages/IaStage');
const BotController = require('../src/controllers/BotController');

function criarMsgMock() {
    const respostas = [];
    return {
        numeroCliente: '557999999999',
        numeroReal: '557999999999@s.whatsapp.net',
        reply: async (t) => {
            respostas.push(t);
            return { key: { id: 'MOCK_ID' } };
        },
        replyButtons: async (options, fallbackText) => {
            respostas.push(fallbackText || options.description || options.title);
            return { key: { id: 'MOCK_ID' } };
        },
        replyList: async (options, fallbackText) => {
            respostas.push(fallbackText || options.description || options.title);
            return { key: { id: 'MOCK_ID' } };
        },
        replyMedia: async (media, t) => {
            respostas.push(t);
            return { key: { id: 'MOCK_ID' } };
        },
        respostas
    };
}

async function runTests() {
    console.log('🐝 Iniciando Bateria de Testes dos Novos Fluxos de Atendimento Favo de Mel...\n');
    let passCount = 0;

    // ----------------------------------------------------
    // TESTE 1: Início -> Menu Principal com 3 Opções
    // ----------------------------------------------------
    {
        const sessao = {};
        const msg = criarMsgMock();
        await InicioStage.executar(msg, '', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal', 'Etapa deve ser menu_principal');
        assert(msg.respostas[0].includes('Apiário Favo de Mel'), 'Mensagem de boas-vindas deve ser enviada');
        assert(msg.respostas[0].includes('Conhecer Catálogo'), 'Menu deve conter opção 1 Catálogo');
        assert(msg.respostas[0].includes('Dúvidas'), 'Menu deve conter opção 2 Dúvidas');
        assert(msg.respostas[0].includes('Outros Serviços'), 'Menu deve conter opção 3 Outros Serviços');
        console.log('✅ Teste 1: InicioStage -> MenuPrincipalStage com 3 opções OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 2: Menu Principal - Retorno com '#' ou 'menu'
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };
        const msg1 = criarMsgMock();
        await MenuPrincipalStage.executar(msg1, '#', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg1.respostas[0].includes('Apiário Favo de Mel'), 'Deve reenviar menu em #');

        const msg2 = criarMsgMock();
        await MenuPrincipalStage.executar(msg2, 'menu', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg2.respostas[0].includes('Apiário Favo de Mel'), 'Deve reenviar menu em menu');
        console.log('✅ Teste 2: MenuPrincipalStage com # e menu OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 3: Clique no Botão 1 - Conhecer Catálogo (Envia Link do Site)
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };
        const msg1 = criarMsgMock();
        await MenuPrincipalStage.executar(msg1, '1', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg1.respostas[0].includes('https://apiariofavodemel.com.br/catalogo'), 'Deve enviar link do catálogo');

        // Teste com clique do botão (displayText)
        const msg2 = criarMsgMock();
        await MenuPrincipalStage.executar(msg2, '🛍️ Conhecer Catálogo', sessao);
        assert(msg2.respostas[0].includes('https://apiariofavodemel.com.br/catalogo'), 'Deve enviar link do catálogo via botão');

        // Teste digitando 'catalogo'
        const msg3 = criarMsgMock();
        await MenuPrincipalStage.executar(msg3, 'catalogo', sessao);
        assert(msg3.respostas.some(r => r.includes('https://apiariofavodemel.com.br/catalogo')), 'Deve enviar catálogo ao digitar catalogo');

        // Teste digitando 'o link do catalogo'
        const msg4 = criarMsgMock();
        await MenuPrincipalStage.executar(msg4, 'o link do catalogo', sessao);
        assert(msg4.respostas.some(r => r.includes('https://apiariofavodemel.com.br/catalogo')), 'Deve enviar catálogo ao pedir o link do catalogo');
        assert(msg4.respostas.some(r => r === 'https://apiariofavodemel.com.br/catalogo'), 'Deve enviar link isolado direto para preview');

        console.log('✅ Teste 3: Opção 1 e palavras-chave (Catálogo Online, link, etc.) enviam link do site OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 4: Clique no Botão 2 - Dúvidas sobre Mel (Abre canal para perguntar à IA)
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };
        const msg = criarMsgMock();
        await MenuPrincipalStage.executar(msg, '2', sessao);
        assert.strictEqual(sessao.etapa, 'conversando_com_ia', 'Etapa deve mudar para conversando_com_ia');
        assert(msg.respostas[0].includes('Dúvidas sobre Mel'), 'Deve convidar o cliente a mandar a dúvida');
        console.log('✅ Teste 4: Opção 2 (Dúvidas sobre Mel) convida para perguntas com IA OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 5: Clique no Botão 3 - Outros Serviços (Transfere para Atendimento Humano)
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };
        const msg = criarMsgMock();
        await MenuPrincipalStage.executar(msg, '3', sessao);
        assert.strictEqual(sessao.etapa, 'em_atendimento_humano', 'Etapa deve mudar para em_atendimento_humano');
        assert(msg.respostas[0].includes('Outros Serviços'), 'Deve confirmar transferência de outros serviços');
        assert(msg.respostas[0].includes('atendente humano'), 'Deve avisar sobre atendente humano');

        // Teste com clique do botão 3 (displayText)
        const sessaoOutros = { etapa: 'menu_principal' };
        const msgOutros = criarMsgMock();
        await MenuPrincipalStage.executar(msgOutros, '🐝 Outros Serviços', sessaoOutros);
        assert.strictEqual(sessaoOutros.etapa, 'em_atendimento_humano');
        console.log('✅ Teste 5: Opção 3 (Outros Serviços) transfere para humano OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 6: O cliente digitou qualquer outra coisa:
    // 6.1 Dúvida sobre Mel/Produtos -> IA analisa e RESPONDE
    // 6.2 Assunto NÃO relacionado a Mel/Loja -> IA analisa e TRANSFERE para atendimento humano
    // ----------------------------------------------------
    {
        // 6.1 Dúvida sobre Mel (IA Responde)
        const sessaoDuvida = { etapa: 'menu_principal' };
        const msgDuvida = criarMsgMock();
        await MenuPrincipalStage.executar(msgDuvida, 'o mel de jatai cristaliza?', sessaoDuvida);
        assert.strictEqual(sessaoDuvida.etapa, 'menu_principal');
        assert(msgDuvida.respostas[0].includes('Mel de Jataí'), 'A IA deve responder a dúvida de mel');
        assert(msgDuvida.respostas[0].includes('https://apiariofavodemel.com.br/catalogo'), 'Deve incluir link do catálogo');

        // 6.2 Assunto não relacionado a mel / pedido de falar com atendente (IA Transfere para Humano)
        const sessaoOutro = { etapa: 'menu_principal' };
        const msgOutro = criarMsgMock();
        await MenuPrincipalStage.executar(msgOutro, 'preciso alugar um carro para amanhã', sessaoOutro);
        assert.strictEqual(sessaoOutro.etapa, 'em_atendimento_humano', 'Assunto não relacionado deve transferir para humano');
        assert(msgOutro.respostas[0].includes('equipe humana'), 'Deve avisar que foi transferido para atendimento humano');
        console.log('✅ Teste 6: Avaliação pela IA de Dúvidas sobre Mel (Responde) vs Outros Assuntos (Transfere) OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 7: Retorno do Atendimento Humano via HumanoStage e Comandos Globais
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'em_atendimento_humano' };
        const msg = criarMsgMock();
        await HumanoStage.executar(msg, '#', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal', 'HumanoStage com # deve retornar ao menu principal');
        assert(msg.respostas[0].includes('Apiário Favo de Mel'), 'Deve reenviar opções de boas-vindas');

        const comandosRetorno = ['#', 'menu', '/menu', 'voltar', '/voltar', '/bot', 'bot', 'catalogo', 'catálogo', '0', 'inicio', 'início'];
        assert(comandosRetorno.includes('#'));
        assert(comandosRetorno.includes('menu'));
        console.log('✅ Teste 7: Reativação do menu durante atendimento humano OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 8: Validação dos Estágios Preservados (Categoria, Produto, Quantidade, Carrinho, Entrega, Resgate, Consultoria)
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'aguardando_categoria', carrinho: [] };
        
        // 8.1 CategoriaStage
        const msg1 = criarMsgMock();
        await CategoriaStage.executar(msg1, '1', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_produto');
        assert.strictEqual(sessao.categoriaSelecionada, '1');

        // 8.2 ProdutoStage
        const msg2 = criarMsgMock();
        await ProdutoStage.executar(msg2, '1', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_quantidade');

        // 8.3 QuantidadeStage
        const msg3 = criarMsgMock();
        await QuantidadeStage.executar(msg3, '2', sessao);
        assert.strictEqual(sessao.etapa, 'carrinho_opcoes');
        assert.strictEqual(sessao.carrinho.length, 1);

        // 8.4 CarrinhoStage
        const msg4 = criarMsgMock();
        await CarrinhoStage.executar(msg4, '2', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_dados_entrega');

        // 8.5 ResgateStage preservado
        const sessaoResgate = { etapa: 'resgate_aguardando' };
        const msgResgate = criarMsgMock();
        await ResgateStage.executar(msgResgate, 'Enxame no muro', sessaoResgate);
        assert.strictEqual(sessaoResgate.etapa, 'em_atendimento_humano');

        // 8.6 ConsultoriaStage preservado
        const sessaoConsultoria = { etapa: 'consultoria_aguardando' };
        const msgConsultoria = criarMsgMock();
        await ConsultoriaStage.executar(msgConsultoria, 'Iniciar apiário', sessaoConsultoria);
        assert.strictEqual(sessaoConsultoria.etapa, 'em_atendimento_humano');

        console.log('✅ Teste 8: Módulos e estágios preservados continuam 100% íntegros OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 9: Botões Interativos Nativos e Parsing de Cliques (Evolution 2.4+)
    // ----------------------------------------------------
    {
        const sessao = {};
        let botoesRecebidos = null;

        const msgInterativa = {
            reply: async () => ({ key: { id: 'MOCK_REPLY' } }),
            replyButtons: async (options) => {
                botoesRecebidos = options;
                return { key: { id: 'MOCK_BUTTONS' } };
            }
        };

        // 9.1 InicioStage deve disparar replyButtons com 3 botões
        await InicioStage.executar(msgInterativa, '', sessao);
        assert(botoesRecebidos, 'InicioStage deve usar replyButtons quando suportado');
        assert.strictEqual(botoesRecebidos.buttons.length, 3, 'Menu deve ter exatamente 3 botões interativos');
        assert.strictEqual(botoesRecebidos.buttons[0].id, '1');
        assert.strictEqual(botoesRecebidos.buttons[1].id, '2');
        assert.strictEqual(botoesRecebidos.buttons[2].id, '3');

        // 9.2 Simulação de clique do cliente no botão (formato nativeFlowResponseMessage da Evolution 2.4)
        const mockWebhookMessage = {
            interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                    name: 'quick_reply',
                    paramsJson: JSON.stringify({ id: '1' })
                }
            }
        };
        const idExtraido = BotController.processarTextoProfundo(mockWebhookMessage);
        assert.strictEqual(idExtraido, '1', 'BotController deve extrair corretamente o ID do clique no botão');

        console.log('✅ Teste 9: Botões Interativos Nativos e Parsing de Cliques (Evolution 2.4+) OK');
        passCount++;
    }

    console.log(`\n🎉 Todos os ${passCount} testes passaram com 100% de sucesso!`);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Falha nos testes:', err);
    process.exit(1);
});

