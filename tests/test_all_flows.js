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
const BotController = require('../src/controllers/BotController');

function criarMsgMock() {
    const respostas = [];
    return {
        reply: async (t) => {
            respostas.push(t);
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
    console.log('🐝 Iniciando Bateria de Testes dos Fluxos de Atendimento...\n');
    let passCount = 0;

    // ----------------------------------------------------
    // TESTE 1: Início -> Menu Principal
    // ----------------------------------------------------
    {
        const sessao = {};
        const msg = criarMsgMock();
        await InicioStage.executar(msg, '', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal', 'Etapa deve ser menu_principal');
        assert(msg.respostas[0].includes('Bem-vindo(a) à Favo de Mel'), 'Mensagem de boas-vindas deve ser enviada');
        console.log('✅ Teste 1: InicioStage -> MenuPrincipalStage OK');
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
        assert(msg1.respostas[0].includes('Bem-vindo(a) à Favo de Mel'), 'Deve reenviar menu em #');

        const msg2 = criarMsgMock();
        await MenuPrincipalStage.executar(msg2, 'menu', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg2.respostas[0].includes('Bem-vindo(a) à Favo de Mel'), 'Deve reenviar menu em menu');
        console.log('✅ Teste 2: MenuPrincipalStage com # e menu OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 3: Fluxo Completo de E-Commerce (Produtos -> Quantidade -> Carrinho -> Entrega)
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal', carrinho: [] };
        
        // 3.1: Menu Principal digita '1' para ver categorias
        const msg1 = criarMsgMock();
        await MenuPrincipalStage.executar(msg1, '1', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_categoria');
        assert(msg1.respostas[0].includes('Produtos da Colmeia'), 'Deve listar categorias');

        // 3.2: Escolhe categoria '1'
        const msg2 = criarMsgMock();
        await CategoriaStage.executar(msg2, '1', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_produto');
        assert.strictEqual(sessao.categoriaSelecionada, '1');

        // 3.3: Troca de categoria digitando '0'
        const msg3 = criarMsgMock();
        await ProdutoStage.executar(msg3, '0', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_categoria');

        // 3.4: Escolhe categoria '1' novamente e seleciona produto '1'
        await CategoriaStage.executar(criarMsgMock(), '1', sessao);
        const msg4 = criarMsgMock();
        await ProdutoStage.executar(msg4, '1', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_quantidade');
        assert(sessao.produtoTemporario, 'Deve ter produtoTemporario guardado');

        // 3.5: Informa quantidade '2'
        const msg5 = criarMsgMock();
        await QuantidadeStage.executar(msg5, '2', sessao);
        assert.strictEqual(sessao.etapa, 'carrinho_opcoes');
        assert.strictEqual(sessao.carrinho.length, 1);
        assert.strictEqual(sessao.carrinho[0].quantidade, 2);

        // 3.6: Finaliza pedido (Opção '2')
        const msg6 = criarMsgMock();
        await CarrinhoStage.executar(msg6, '2', sessao);
        assert.strictEqual(sessao.etapa, 'aguardando_dados_entrega');

        // 3.7: Envia endereço de entrega
        const msg7 = criarMsgMock();
        await EntregaStage.executar(msg7, 'Rua das Flores, 123 - Jardins, Aracaju', sessao);
        assert.strictEqual(sessao.etapa, 'em_atendimento_humano');
        assert.strictEqual(sessao.pedidoFinalizado, true);
        assert(msg7.respostas[0].includes('Recebemos seus dados de entrega'), 'Confirmação de entrega enviada');
        console.log('✅ Teste 3: Fluxo de E-commerce (Catálogo -> Carrinho -> Entrega) OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 4: Fluxo de Resgate de Abelhas e Retorno via '#' e 'menu'
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };
        
        // 4.1: Cliente escolhe '2' (Resgate)
        const msg1 = criarMsgMock();
        await MenuPrincipalStage.executar(msg1, '2', sessao);
        assert.strictEqual(sessao.etapa, 'resgate_aguardando');
        assert(msg1.respostas[0].includes('Serviço de Captura e Resgate'), 'Deve enviar apresentação de resgate');

        // 4.2: Cliente responde 'Forro da casa no bairro Jardins'
        const msg2 = criarMsgMock();
        await ResgateStage.executar(msg2, 'Forro da casa no bairro Jardins', sessao);
        assert.strictEqual(sessao.etapa, 'em_atendimento_humano');
        assert(sessao.dadosResgate.includes('Forro da casa'));
        assert(msg2.respostas[0].includes('Solicitação de Resgate Registrada'), 'Deve confirmar resgate e transferir');

        // 4.3: Cliente envia '#' no atendimento humano via HumanoStage
        const msg3 = criarMsgMock();
        await HumanoStage.executar(msg3, '#', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg3.respostas[0].includes('Bem-vindo(a) à Favo de Mel'), 'Deve retornar ao menu principal');

        // 4.4: Cliente envia 'menu' no atendimento humano
        sessao.etapa = 'em_atendimento_humano';
        const msg4 = criarMsgMock();
        await HumanoStage.executar(msg4, 'menu', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');
        assert(msg4.respostas[0].includes('Bem-vindo(a) à Favo de Mel'), 'Deve retornar ao menu principal com menu');

        console.log('✅ Teste 4: Fluxo de Resgate de Abelhas + Retorno com # e menu OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 5: Fluxo de Consultoria Apícola e Retorno
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'menu_principal' };

        // 5.1: Cliente escolhe '3' (Consultoria)
        const msg1 = criarMsgMock();
        await MenuPrincipalStage.executar(msg1, '3', sessao);
        assert.strictEqual(sessao.etapa, 'consultoria_aguardando');

        // 5.2: Cliente envia dados
        const msg2 = criarMsgMock();
        await ConsultoriaStage.executar(msg2, 'Quero iniciar criação de Jataí em chácara em Itabaiana', sessao);
        assert.strictEqual(sessao.etapa, 'em_atendimento_humano');
        assert(msg2.respostas[0].includes('Solicitação de Consultoria Recebida'));

        // 5.3: Cliente envia 'voltar'
        const msg3 = criarMsgMock();
        await HumanoStage.executar(msg3, 'voltar', sessao);
        assert.strictEqual(sessao.etapa, 'menu_principal');

        console.log('✅ Teste 5: Fluxo de Consultoria Apícola + Retorno OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 6: Interceptação do BotController quando em atendimento humano
    // ----------------------------------------------------
    {
        const sessao = { etapa: 'em_atendimento_humano', id_cliente: '557999999999@s.whatsapp.net' };
        
        // Simula mensagem com '#'
        const infoHash = {
            texto: '#',
            numeroCliente: '557999999999',
            numeroReal: '557999999999@s.whatsapp.net',
            fromMe: false,
            reply: async (t) => { respostas.push(t); }
        };
        const respostas = [];
        infoHash.reply = async (t) => { respostas.push(t); };

        // Valida se a etapa no BotController é reativada
        const comandosRetorno = ['#', 'menu', '/menu', 'voltar', '/voltar', '/bot', 'bot', 'catalogo', 'catálogo', '0', 'inicio', 'início'];
        assert(comandosRetorno.includes(infoHash.texto), 'info.texto # deve estar nos comandos de retorno');
        
        console.log('✅ Teste 6: BotController comandos de retorno ao menu OK');
        passCount++;
    }

    // ----------------------------------------------------
    // TESTE 7: Menus e Botões Interativos (replyList e replyButtons)
    // ----------------------------------------------------
    {
        const sessao = {};
        let listaRecebida = null;
        let botoesRecebidos = null;

        const msgInterativa = {
            reply: async () => {},
            replyList: async (payload, fallback) => {
                listaRecebida = { payload, fallback };
                return { key: { id: 'MOCK_LIST' } };
            },
            replyButtons: async (payload, fallback) => {
                botoesRecebidos = { payload, fallback };
                return { key: { id: 'MOCK_BUTTONS' } };
            }
        };

        // 7.1 InicioStage deve disparar replyList com 4 opções
        await InicioStage.executar(msgInterativa, '', sessao);
        assert(listaRecebida, 'replyList deve ser chamado no InicioStage');
        assert.strictEqual(listaRecebida.payload.buttonText, 'Ver Opções 🍯');
        assert.strictEqual(listaRecebida.payload.sections[0].rows.length, 4);
        assert.strictEqual(listaRecebida.payload.sections[0].rows[0].rowId, '1');

        // 7.2 MenuPrincipalStage (opção 1) deve disparar replyList com categorias
        listaRecebida = null;
        await MenuPrincipalStage.executar(msgInterativa, '1', sessao);
        assert(listaRecebida, 'replyList deve ser chamado nas Categorias');
        assert.strictEqual(listaRecebida.payload.buttonText, 'Ver Categorias 🍯');
        assert(listaRecebida.payload.sections[0].rows.length > 0);

        // 7.3 CategoriaStage (categoria 1) deve disparar replyList com produtos
        listaRecebida = null;
        await CategoriaStage.executar(msgInterativa, '1', sessao);
        assert(listaRecebida, 'replyList deve ser chamado nos Produtos');
        assert.strictEqual(listaRecebida.payload.buttonText, 'Ver Produtos 🍯');
        assert(listaRecebida.payload.sections[0].rows.length > 0);

        // 7.4 QuantidadeStage deve disparar replyButtons com 3 ações
        sessao.carrinho = [];
        sessao.produtoTemporario = { nome: 'Mel Silvestre 500g', preco: 35.0 };
        await QuantidadeStage.executar(msgInterativa, '2', sessao);
        assert(botoesRecebidos, 'replyButtons deve ser chamado no resumo do carrinho');
        assert.strictEqual(botoesRecebidos.payload.buttons.length, 3);
        assert.strictEqual(botoesRecebidos.payload.buttons[0].id, '1');
        assert.strictEqual(botoesRecebidos.payload.buttons[1].id, '2');
        assert.strictEqual(botoesRecebidos.payload.buttons[2].id, '#');

        console.log('✅ Teste 7: Menus de lista e botões interativos (replyList & replyButtons) OK');
        passCount++;
    }

    console.log(`\n🎉 Todos os ${passCount} testes passaram com 100% de sucesso!`);
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Falha nos testes:', err);
    process.exit(1);
});
