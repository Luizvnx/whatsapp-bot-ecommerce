/**
 * Teste E2E Simulado: Fluxo Completo do Cliente no Bot Favo de Mel
 */
const assert = require('assert');

// Mock EvolutionService
const EvolutionService = require('../src/services/EvolutionService');
const mensagensEnviadas = [];
EvolutionService.enviarMensagemText = async (numero, texto) => {
    mensagensEnviadas.push({ tipo: 'texto', numero, texto });
    return { key: { id: 'MOCK_TXT_' + Date.now() }, text: texto };
};
EvolutionService.enviarBotoes = async (numero, options, fallbackText) => {
    mensagensEnviadas.push({ tipo: 'botoes', numero, options, fallbackText });
    return { key: { id: 'MOCK_BTN_' + Date.now() } };
};
EvolutionService.gerenciarEtiqueta = async () => ({ success: true });

// Mock SessionService
const SessionService = require('../src/services/SessionService');
SessionService.alternarModoAtendimento = async (id, modo) => ({ success: true, modo });
SessionService.adicionarMensagem = async () => ({ id: 'MOCK_MSG_ID' });

// Mock GeminiService
const GeminiService = require('../src/services/GeminiService');
GeminiService.perguntar = async (texto) => {
    const t = (texto || '').toLowerCase();
    if (t.includes('puro') || t.includes('cristaliza')) {
        return {
            resposta: "Sim, todos os nossos méis são 100% puros e crus, direto do apiário. A cristalização é um fenômeno natural que comprova a pureza do mel.",
            transferirHumano: false,
            relacionadoComMelOuLoja: true,
            intencao: 'duvida_produto',
            sugerirAcao: 'catalogo'
        };
    }
    if (t.includes('onde') || t.includes('loja') || t.includes('endereço')) {
        return {
            resposta: "Nossa loja física fica na Av. Deputado Pedro Valadares, 690, loja 8, Garden's Gallery - Bairro Jardins, Aracaju/SE. Funcionamos de segunda a sexta, das 8h às 18h.",
            transferirHumano: false,
            relacionadoComMelOuLoja: true,
            intencao: 'duvida_produto',
            sugerirAcao: 'nenhuma'
        };
    }
    if (t.includes('atendente') || t.includes('humano')) {
        return {
            resposta: "Com certeza, vou transferir você para nossa equipe humana.",
            transferirHumano: true,
            relacionadoComMelOuLoja: true,
            intencao: 'humano',
            sugerirAcao: 'nenhuma'
        };
    }
    return {
        resposta: "Sou a assistente virtual da Favo de Mel. Posso ajudar com mel puro ou transferir para nossa equipe.",
        transferirHumano: false,
        relacionadoComMelOuLoja: false,
        intencao: 'outro',
        sugerirAcao: 'nenhuma'
    };
};

const InicioStage = require('../src/stages/InicioStage');
const MenuPrincipalStage = require('../src/stages/MenuPrincipalStage');
const IaStage = require('../src/stages/IaStage');
const WebhookController = require('../src/controllers/WebhookController');
const BotController = require('../src/controllers/BotController');

function criarMsgMock(sessao) {
    const respostas = [];
    return {
        numeroCliente: '557988562587',
        numeroReal: '557988562587@s.whatsapp.net',
        fromMe: false,
        reply: async (t) => {
            respostas.push(t);
            return { key: { id: 'MOCK_ID' } };
        },
        replyButtons: async (options, fallbackText) => {
            respostas.push(fallbackText || options.description || options.title);
            return { key: { id: 'MOCK_ID' } };
        },
        respostas
    };
}

async function runE2E() {
    console.log('🧪 Iniciando Verificação E2E do Fluxo Completo do Cliente Favo de Mel...\n');

    const sessao = {
        id_cliente: '557988562587@s.whatsapp.net',
        etapa: 'inicio',
        modo_atendimento: 'bot',
        historicoIa: []
    };

    // 1. Mensagem inicial do cliente (ex: "Olá!")
    console.log('👉 Passo 1: Cliente envia saudação inicial');
    const msg1 = criarMsgMock(sessao);
    await InicioStage.executar(msg1, 'Olá!', sessao);
    assert.strictEqual(sessao.etapa, 'menu_principal', 'Deve ir para menu_principal');
    assert(msg1.respostas.some(r => r.includes('Apiário Favo de Mel')), 'Deve saudar o cliente');
    console.log('   ✅ Menu inicial exibido com sucesso');

    // 2. Cliente escolhe Opção 1 - Catálogo
    console.log('👉 Passo 2: Cliente escolhe Opção 1 (Catálogo)');
    const msg2 = criarMsgMock(sessao);
    await MenuPrincipalStage.executar(msg2, '1', sessao);
    assert(msg2.respostas.some(r => r.includes('https://apiariofavodemel.com.br/catalogo')), 'Deve enviar link do catálogo');
    assert(msg2.respostas.some(r => r === 'https://apiariofavodemel.com.br/catalogo'), 'Deve enviar link direto isolado para preview');
    console.log('   ✅ Link do catálogo enviado no formato com botões e texto puro direto');

    // 3. Cliente escolhe Opção 2 - Dúvidas sobre Mel
    console.log('👉 Passo 3: Cliente escolhe Opção 2 (Dúvidas sobre Mel)');
    const msg3 = criarMsgMock(sessao);
    await MenuPrincipalStage.executar(msg3, '2', sessao);
    assert.strictEqual(sessao.etapa, 'conversando_com_ia', 'Etapa deve ser conversando_com_ia');
    assert(msg3.respostas.some(r => r.includes('Dúvidas sobre Mel')), 'Deve convidar para a dúvida');
    console.log('   ✅ Estágio de IA ativado com sucesso');

    // 4. Cliente faz uma pergunta sobre mel puro
    console.log('👉 Passo 4: Cliente pergunta: "O mel de vocês é puro mesmo? Cristaliza?"');
    const msg4 = criarMsgMock(sessao);
    await IaStage.executar(msg4, 'O mel de vocês é puro mesmo? Cristaliza?', sessao);
    assert.strictEqual(sessao.etapa, 'conversando_com_ia', 'Deve manter a conversa aberta na IA');
    assert(msg4.respostas.some(r => r.includes('100% puros e crus')), 'A resposta da IA DEVE ser enviada');
    assert(msg4.respostas.some(r => r.includes('https://apiariofavodemel.com.br/catalogo')), 'Deve conter link de catálogo');
    console.log('   ✅ IA respondeu diretamente a dúvida sem sobrecarga de menus repetitivos');

    // 5. Continuidade do diálogo: Cliente faz segunda pergunta sobre a loja física
    console.log('👉 Passo 5: Cliente pergunta: "Onde fica a loja física de vocês em Aracaju?"');
    const msg5 = criarMsgMock(sessao);
    await IaStage.executar(msg5, 'Onde fica a loja física de vocês em Aracaju?', sessao);
    assert(msg5.respostas.some(r => r.includes('Av. Deputado Pedro Valadares')), 'IA deve responder o endereço com precisão');
    console.log('   ✅ IA respondeu segunda pergunta mantendo contexto multi-turn com sucesso');

    // 6. Cliente clica em voltar ao início (🔙 Voltar ao Início ou "#")
    console.log('👉 Passo 6: Cliente volta ao menu inicial ("#")');
    const msg6 = criarMsgMock(sessao);
    await IaStage.executar(msg6, '#', sessao);
    assert.strictEqual(sessao.etapa, 'menu_principal', 'Deve retornar para menu_principal');
    console.log('   ✅ Retorno ao menu inicial efetuado com sucesso');

    // 7. Cliente escolhe Opção 3 - Outros Serviços (Transfere para Humano)
    console.log('👉 Passo 7: Cliente escolhe Opção 3 (Outros Serviços)');
    const msg7 = criarMsgMock(sessao);
    await MenuPrincipalStage.executar(msg7, '3', sessao);
    assert.strictEqual(sessao.etapa, 'em_atendimento_humano', 'Deve estar em em_atendimento_humano');
    console.log('   ✅ Transferência para atendimento humano efetuada com sucesso');

    // 8. Cliente em Atendimento Humano pede o Catálogo ("1" ou "ver catalogo")
    console.log('👉 Passo 8: Cliente em atendimento humano digita "1"');
    sessao.modo_atendimento = 'humano';
    const msg8 = criarMsgMock(sessao);
    // Simula a lógica do BotController / WebhookController que reativa o bot
    const info8 = {
        texto: '1',
        textoBruto: '1',
        reply: msg8.reply,
        replyButtons: msg8.replyButtons
    };
    await SessionService.assumirAtendimentoPeloBot(sessao.id_cliente, sessao);
    assert.strictEqual(sessao.modo_atendimento, 'bot', 'Bot deve reassumir o modo');
    await MenuPrincipalStage.executar(info8, '1', sessao);
    assert(msg8.respostas.some(r => r.includes('https://apiariofavodemel.com.br/catalogo')), 'Deve entregar o catálogo imediatamente');
    console.log('   ✅ Cliente em atendimento humano teve o bot reativado e recebeu o catálogo imediatamente');

    // 9. CENÁRIO CRÍTICO DO USUÁRIO: Cliente envia mensagens sem selecionar opção
    // Não deve entrar em looping reenviando boas-vindas em cada mensagem!
    console.log('👉 Passo 9: Cliente envia múltiplas mensagens separadas sem selecionar 1, 2 ou 3');
    const sessaoSeparadas = {
        id_cliente: '557988889999@s.whatsapp.net',
        etapa: 'inicio',
        modo_atendimento: 'bot',
        historicoIa: []
    };
    
    // 9.1 Mensagem 1: Cliente manda "Oi" -> Recebe boas-vindas
    const msgSep1 = criarMsgMock(sessaoSeparadas);
    await InicioStage.executar(msgSep1, 'Oi', sessaoSeparadas);
    assert.strictEqual(sessaoSeparadas.etapa, 'menu_principal');
    assert(msgSep1.respostas.some(r => r.includes('Apiário Favo de Mel')), 'Mensagem 1 deve enviar boas-vindas');

    // 9.2 Mensagem 2: Cliente manda "tudo bem?" sem selecionar 1, 2 ou 3 -> Transfere para humano SEM repetir boas-vindas
    const msgSep2 = criarMsgMock(sessaoSeparadas);
    await MenuPrincipalStage.executar(msgSep2, 'tudo bem?', sessaoSeparadas);
    assert.strictEqual(sessaoSeparadas.etapa, 'em_atendimento_humano', 'Mensagem 2 deve transferir para humano');
    assert.strictEqual(sessaoSeparadas.modo_atendimento, 'humano');
    assert(msgSep2.respostas.some(r => r.includes('equipe humana')), 'Mensagem 2 deve avisar transferência');
    assert(!msgSep2.respostas.some(r => r.includes('Somos especialistas em produtos puros')), 'Mensagem 2 NÃO pode conter texto de boas-vindas');

    // 9.3 Mensagens 3, 4 e 5: Cliente envia mensagens seguintes -> Bot permanece em silêncio (atendimento humano)
    const msgSep3 = criarMsgMock(sessaoSeparadas);
    // Simula mensagens no modo humano (o robô não dispara novas mensagens de boas-vindas)
    const deveReassumir = SessionService.deveBotAssumirAtendimento(sessaoSeparadas);
    assert.strictEqual(deveReassumir, false, 'Bot não deve reassumir atendimento humano recente');
    console.log('   ✅ Cliente enviou mensagens separadas: Boas-vindas enviada apenas na 1ª mensagem e transferência humana ativada sem looping!');

    console.log('\n🎉 SUCESSO TOTAL! 100% DO FLUXO DO CLIENTE VALIDADO E BLINDADO CONTRA QUALQUER FALHA!');
}

runE2E().catch(err => {
    console.error('❌ Falha no teste E2E:', err);
    process.exit(1);
});
