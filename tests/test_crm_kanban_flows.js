const DatabaseService = require('../src/services/DatabaseService');
const CrmPipelineService = require('../src/services/CrmPipelineService');
const CrmClienteService = require('../src/services/CrmClienteService');
const PaymentService = require('../src/services/payment/PaymentService');

// Banco em memória para testes garantidos de fluxos e regras de negócio
const mockDb = {
    clientes: [
        {
            id: 1,
            id_cliente: '5579998887766@s.whatsapp.net',
            nome: 'Cliente Teste QA',
            telefone: '5579998887766',
            email: 'cliente.qa@teste.com',
            tags: ['novo_lead'],
            endereco: 'Rua das Flores, 123',
            ltv: '0.00',
            total_pedidos: 0,
            etapa_funil: 'novo_lead'
        }
    ],
    oportunidades: [
        {
            id: 101,
            cliente_id: 1,
            id_cliente: '5579998887766@s.whatsapp.net',
            titulo: 'Atendimento - Teste Lead 1',
            valor_estimado: '150.00',
            etapa: 'novo_lead',
            status: 'aberto',
            motivo_perda: null,
            responsavel_id: null,
            origem: 'whatsapp_bot',
            dados_extras: {},
            data_fechamento: null,
            criado_em: new Date(),
            atualizado_em: new Date()
        },
        {
            id: 102,
            cliente_id: 1,
            id_cliente: '5579998887766@s.whatsapp.net',
            titulo: 'Atendimento - Venda Fechada',
            valor_estimado: '450.00',
            etapa: 'pedido_fechado',
            status: 'ganho',
            motivo_perda: null,
            responsavel_id: null,
            origem: 'whatsapp_bot',
            dados_extras: {},
            data_fechamento: new Date(),
            criado_em: new Date(),
            atualizado_em: new Date()
        }
    ],
    proximoOpId: 200
};

function configurarMockDb() {
    DatabaseService.executar = async (sql, params = []) => {
        const sqlUpper = sql.toUpperCase();

        // 1. SELECT oportunidade por ID (específico)
        if (sqlUpper.trim().startsWith('SELECT') && (sqlUpper.includes('WHERE O.ID = $1') || (sqlUpper.includes('FROM TB_CRM_OPORTUNIDADES') && sqlUpper.includes('WHERE ID = $1')))) {
            const op = mockDb.oportunidades.find(o => o.id === parseInt(params[0], 10));
            if (!op) return { rows: [] };
            const cli = mockDb.clientes.find(c => c.id === op.cliente_id) || {};
            return {
                rows: [{
                    ...op,
                    cliente_nome: cli.nome,
                    cliente_telefone: cli.telefone,
                    cliente_email: cli.email,
                    cliente_tags: cli.tags,
                    cliente_endereco: cli.endereco,
                    cliente_ltv: cli.ltv,
                    cliente_total_pedidos: cli.total_pedidos
                }]
            };
        }

        // 2. SELECT listarKanban
        if (sqlUpper.includes('FROM TB_CRM_OPORTUNIDADES O') && sqlUpper.includes('JOIN TB_CRM_CLIENTES C')) {
            let resultado = mockDb.oportunidades.map(op => {
                const cli = mockDb.clientes.find(c => c.id === op.cliente_id) || {};
                return {
                    id: op.id,
                    cliente_id: op.cliente_id,
                    id_cliente: op.id_cliente,
                    titulo: op.titulo,
                    valor_estimado: op.valor_estimado,
                    etapa: op.etapa,
                    status: op.status,
                    motivo_perda: op.motivo_perda,
                    responsavel_id: op.responsavel_id,
                    origem: op.origem,
                    dados_extras: op.dados_extras,
                    data_fechamento: op.data_fechamento,
                    criado_em: op.criado_em,
                    atualizado_em: op.atualizado_em,
                    cliente_nome: cli.nome,
                    cliente_telefone: cli.telefone,
                    cliente_email: cli.email,
                    cliente_tags: cli.tags,
                    cliente_endereco: cli.endereco,
                    cliente_ltv: cli.ltv,
                    cliente_total_pedidos: cli.total_pedidos,
                    cliente_ultima_msg: new Date()
                };
            });

            if (sql.includes('o.status = $')) {
                const statusFiltro = params[params.length - 1];
                if (statusFiltro && statusFiltro !== 'todos') {
                    resultado = resultado.filter(r => r.status === statusFiltro);
                }
            }

            return { rows: resultado };
        }

        // 4. INSERT em tb_crm_oportunidades
        if (sqlUpper.includes('INSERT INTO TB_CRM_OPORTUNIDADES')) {
            const novaOp = {
                id: mockDb.proximoOpId++,
                cliente_id: params[0],
                id_cliente: params[1],
                titulo: params[2],
                valor_estimado: String(params[3] || '0.00'),
                etapa: params[4] || 'novo_lead',
                status: params[5] || 'aberto',
                motivo_perda: null,
                responsavel_id: null,
                origem: 'teste_qa',
                dados_extras: {},
                data_fechamento: null,
                criado_em: new Date(),
                atualizado_em: new Date()
            };
            mockDb.oportunidades.push(novaOp);
            return { rows: [novaOp] };
        }

        // 5. UPDATE em tb_crm_oportunidades (atualizarEtapa ou atualizar)
        if (sqlUpper.includes('UPDATE TB_CRM_OPORTUNIDADES')) {
            const id = parseInt(params[params.length - 1], 10);
            const op = mockDb.oportunidades.find(o => o.id === id);
            if (op) {
                if (sqlUpper.includes('SET ETAPA = $1')) {
                    op.etapa = params[0];
                    op.status = params[1];
                    op.motivo_perda = params[2];
                    op.data_fechamento = params[3];
                    if (params[4] && parseFloat(params[4]) > 0) {
                        op.valor_estimado = String(params[4]);
                    }
                } else if (sqlUpper.includes('VALOR_ESTIMADO =')) {
                    op.etapa = 'pedido_fechado';
                    op.status = 'ganho';
                    if (params[0] && parseFloat(params[0]) > 0) {
                        op.valor_estimado = String(params[0]);
                    }
                }
                op.atualizado_em = new Date();
                return { rows: [op] };
            }
            return { rows: [] };
        }

        // 6. DELETE em tb_crm_oportunidades
        if (sqlUpper.includes('DELETE FROM TB_CRM_OPORTUNIDADES')) {
            const id = parseInt(params[0], 10);
            mockDb.oportunidades = mockDb.oportunidades.filter(o => o.id !== id);
            return { rows: [] };
        }

        // 7. CLIENTES: obterOuCriar / busca
        if (sqlUpper.includes('FROM TB_CRM_CLIENTES') && (sqlUpper.includes('ID_CLIENTE') || sqlUpper.includes('TELEFONE'))) {
            const paramVal = params[0];
            const paramTel = params[1] || params[0];
            const cli = mockDb.clientes.find(c => c.id_cliente === paramVal || c.telefone === paramTel || c.telefone === paramVal);
            return { rows: cli ? [cli] : [] };
        }

        if (sqlUpper.includes('FROM TB_CRM_CLIENTES WHERE ID = $1')) {
            const cli = mockDb.clientes.find(c => c.id === parseInt(params[0], 10));
            return { rows: cli ? [cli] : [] };
        }

        if (sqlUpper.includes('INSERT INTO TB_CRM_CLIENTES')) {
            const novoCli = {
                id: mockDb.clientes.length + 1,
                id_cliente: params[0],
                nome: params[1] || 'Cliente Teste',
                telefone: params[2] || '5579998887766',
                tags: [],
                ltv: '0.00',
                total_pedidos: 0,
                etapa_funil: 'novo_lead'
            };
            mockDb.clientes.push(novoCli);
            return { rows: [novoCli] };
        }

        if (sqlUpper.includes('UPDATE TB_CRM_CLIENTES') && sqlUpper.includes('TAGS = ARRAY_APPEND')) {
            const tag = params[0];
            const id = parseInt(params[1], 10);
            const cli = mockDb.clientes.find(c => c.id === id);
            if (cli) {
                if (!cli.tags.includes(tag)) cli.tags.push(tag);
                return { rows: [cli] };
            }
            return { rows: [] };
        }

        if (sqlUpper.includes('UPDATE TB_CRM_CLIENTES') && sqlUpper.includes('TAGS = ARRAY_REMOVE')) {
            const tag = params[0];
            const id = parseInt(params[1], 10);
            const cli = mockDb.clientes.find(c => c.id === id);
            if (cli) {
                cli.tags = cli.tags.filter(t => t !== tag);
                return { rows: [cli] };
            }
            return { rows: [] };
        }

        if (sqlUpper.includes('UPDATE TB_CRM_CLIENTES SET ETAPA_FUNIL = $1')) {
            const id = parseInt(params[1], 10);
            const cli = mockDb.clientes.find(c => c.id === id);
            if (cli) cli.etapa_funil = params[0];
            return { rows: [] };
        }

        if (sqlUpper.includes('UPDATE TB_CRM_CLIENTES') && sqlUpper.includes('LTV = $1')) {
            const id = parseInt(params[params.length - 1], 10);
            const cli = mockDb.clientes.find(c => c.id === id);
            if (cli) {
                cli.total_pedidos += 1;
                cli.ltv = (parseFloat(cli.ltv) + parseFloat(params[0])).toFixed(2);
                return { rows: [cli] };
            }
            return { rows: [] };
        }

        if (sqlUpper.includes('UPDATE TB_COBRANCAS_PIX')) {
            return { rows: [] };
        }

        return { rows: [] };
    };
}

async function executarTestesCompletosCrm() {
    console.log('====================================================');
    console.log('🧪 TESTE COMPLETO DE FLUXOS DO CRM & KANBAN PIPELINE');
    console.log('====================================================\n');

    configurarMockDb();

    try {
        // 1. TESTE DO LISTARKANBAN E ESTRUTURA DAS 6 COLUNAS COM STATUS='TODOS' (PADRÃO)
        console.log('--- TESTE 1: Estrutura do Kanban (6 Colunas) & Visibilidade Padrão ---');
        const kanbanTodos = await CrmPipelineService.listarKanban({ status: 'todos' });
        
        const etapasEsperadas = ['novo_lead', 'qualificacao', 'carrinho_aberto', 'aguardando_pagamento', 'pedido_fechado', 'pos_venda'];
        for (const etapa of etapasEsperadas) {
            if (!kanbanTodos.colunas[etapa]) {
                throw new Error(`Coluna obrigatória ausente no Kanban: ${etapa}`);
            }
            console.log(`  ✓ Coluna '${etapa}': ${kanbanTodos.colunas[etapa].totalCards} cards | Total: ${kanbanTodos.colunas[etapa].totalValorFormatado}`);
        }

        // Validação crucial: 'pedido_fechado' DEVE conter o card ganho existente no mock!
        if (kanbanTodos.colunas.pedido_fechado.totalCards < 1) {
            throw new Error('Falha crítica: A coluna pedido_fechado não pode ficar oculta/vazia no filtro padrão "todos"!');
        }
        console.log(`  ✓ Coluna 'pedido_fechado' exibe leads concluídos com sucesso (totalCards=${kanbanTodos.colunas.pedido_fechado.totalCards})`);
        console.log(`  ✓ Métricas Gerais: Funil: ${kanbanTodos.metricasGerais.totalValorFunilFormatado} | Ganhos: ${kanbanTodos.metricasGerais.valorGanhoFormatado} | Conversão: ${kanbanTodos.metricasGerais.taxaConversao}%\n`);

        // 2. TESTE DE CRIAÇÃO DE NOVA OPORTUNIDADE
        console.log('--- TESTE 2: Criação de Nova Oportunidade ---');
        const telTeste = '5579998887766';
        const opCriada = await CrmPipelineService.criarOportunidade({
            id_cliente: telTeste,
            nome: 'Cliente Teste QA',
            titulo: 'Pedido Mel & Própolis - QA',
            valor_estimado: 280.00,
            etapa: 'novo_lead'
        });

        console.log(`  ✓ Oportunidade criada com ID ${opCriada.id} | Etapa: ${opCriada.etapa} | Status: ${opCriada.status}`);
        if (opCriada.etapa !== 'novo_lead' || opCriada.status !== 'aberto') {
            throw new Error('Falha nos valores iniciais da oportunidade criada');
        }

        // 3. TESTE DE PROGRESSÃO NO FUNIL
        console.log('\n--- TESTE 3: Movimentação Progressiva no Funil ---');
        const opQualif = await CrmPipelineService.atualizarEtapa(opCriada.id, 'qualificacao');
        console.log(`  ✓ Movido para 'qualificacao': etapa=${opQualif.etapa}, status=${opQualif.status}`);

        const opCarrinho = await CrmPipelineService.atualizarEtapa(opCriada.id, 'carrinho_aberto');
        console.log(`  ✓ Movido para 'carrinho_aberto': etapa=${opCarrinho.etapa}, status=${opCarrinho.status}`);

        const opPagto = await CrmPipelineService.atualizarEtapa(opCriada.id, 'aguardando_pagamento');
        console.log(`  ✓ Movido para 'aguardando_pagamento': etapa=${opPagto.etapa}, status=${opPagto.status}`);

        // 4. TESTE DE CLASSIFICAÇÃO FINAL: FECHAMENTO & PÓS-VENDA
        console.log('\n--- TESTE 4: Classificação Final (Pedido Fechado & Pós-Venda) ---');
        const opFechado = await CrmPipelineService.atualizarEtapa(opCriada.id, 'pedido_fechado');
        console.log(`  ✓ Movido para 'pedido_fechado': etapa=${opFechado.etapa}, status=${opFechado.status}, data_fechamento=${opFechado.data_fechamento}`);
        if (opFechado.status !== 'ganho' || !opFechado.data_fechamento) {
            throw new Error(`Falha: oportunidade em 'pedido_fechado' deve ter status='ganho' e data_fechamento preenchida!`);
        }

        // Verifica presença na coluna 'pedido_fechado' no Kanban
        const kanbanComNovoFechado = await CrmPipelineService.listarKanban({ status: 'todos' });
        const cardFechado = kanbanComNovoFechado.colunas.pedido_fechado.cards.find(c => c.id === opCriada.id);
        if (!cardFechado) {
            throw new Error('Falha crítica: Oportunidade fechada NÃO encontrada na coluna pedido_fechado!');
        }
        console.log(`  ✓ Card ID ${opCriada.id} visível com sucesso na coluna final 'pedido_fechado' com valor ${cardFechado.valor_formatado}!`);

        // Teste de movimentação para pós-venda
        const opPosVenda = await CrmPipelineService.atualizarEtapa(opCriada.id, 'pos_venda');
        console.log(`  ✓ Movido para 'pos_venda': etapa=${opPosVenda.etapa}, status=${opPosVenda.status}`);
        if (opPosVenda.status !== 'ganho') {
            throw new Error(`Falha: oportunidade em 'pos_venda' deveria manter status='ganho'`);
        }

        // 5. TESTE DE REABERTURA (REGRESSÃO PARA ETAPA ATIVA)
        console.log('\n--- TESTE 5: Reabertura de Negócio (Movimento Regressivo) ---');
        const opReaberta = await CrmPipelineService.atualizarEtapa(opCriada.id, 'aguardando_pagamento');
        console.log(`  ✓ Regredido para 'aguardando_pagamento': etapa=${opReaberta.etapa}, status=${opReaberta.status}, data_fechamento=${opReaberta.data_fechamento}`);
        if (opReaberta.status !== 'aberto' || opReaberta.data_fechamento !== null) {
            throw new Error('Falha crítica: Ao mover lead fechado de volta para etapas ativas, o status DEVE ser revertido para "aberto" e data_fechamento nula!');
        }
        console.log(`  ✓ Status revertido corretamente para "aberto" ao reabrir oportunidade!`);

        // 6. TESTE DE CONFIRMAÇÃO DE PIX E FINALIZAÇÃO
        console.log('\n--- TESTE 6: Confirmação de Pagamento Pix e Tags de Cliente ---');
        await CrmClienteService.adicionarTag(telTeste, 'aguardando_pix');

        const resultadoPagto = await PaymentService.finalizarVendaNoCrm({
            idCliente: telTeste,
            valor: 280.00,
            oportunidadeId: opCriada.id,
            confirmadoPor: 'QA Tester'
        });

        console.log(`  ✓ Venda finalizada via finalizarVendaNoCrm: sucesso=${resultadoPagto.sucesso}`);
        const opAposPix = await CrmPipelineService.obterPorId(opCriada.id);
        console.log(`  ✓ Oportunidade após Pix: etapa=${opAposPix.etapa}, status=${opAposPix.status}`);
        if (opAposPix.etapa !== 'pedido_fechado' || opAposPix.status !== 'ganho') {
            throw new Error('Falha: Confirmação Pix não moveu oportunidade para pedido_fechado com status ganho!');
        }

        const clienteFinal = await CrmClienteService.obterPorIdOuJid(telTeste);
        console.log(`  ✓ Perfil do cliente: LTV=R$ ${clienteFinal.ltv}, Total Pedidos=${clienteFinal.total_pedidos}, Tags=[${clienteFinal.tags.join(', ')}]`);
        if (!clienteFinal.tags.includes('pedido_realizado')) {
            throw new Error('Tag "pedido_realizado" não encontrada no cliente após pagamento!');
        }
        if (clienteFinal.tags.includes('aguardando_pix')) {
            throw new Error('Tag "aguardando_pix" não foi removida do cliente após pagamento!');
        }

        // 7. TESTE DE EXCLUSÃO
        console.log('\n--- TESTE 7: Exclusão de Oportunidade ---');
        await CrmPipelineService.excluir(opCriada.id);
        const opCheckExclusao = await CrmPipelineService.obterPorId(opCriada.id);
        if (opCheckExclusao) {
            throw new Error('Falha na exclusão da oportunidade');
        }
        console.log(`  ✓ Oportunidade ID ${opCriada.id} excluída com sucesso.`);

        // 8. TESTE DE REGISTRO DE VENDA CONCLUÍDA E VENDAS CONCLUÍDAS != 0
        console.log('\n--- TESTE 8: Venda Concluída no Funil e Métricas de Vendas Concluídas ---');
        const novaOpZero = await CrmPipelineService.criarOportunidade({
            cliente_id: 1,
            titulo: 'Lead Venda R$ 0 Inicial',
            valor_estimado: 0.00,
            etapa: 'aguardando_pagamento'
        });
        console.log(`  ✓ Oportunidade criada com valor zerado: ID=${novaOpZero.id}, etapa=${novaOpZero.etapa}, valor=${novaOpZero.valor_estimado}`);

        // Conclui venda informando valor final de R$ 350,00
        const opConcluidaComValor = await CrmPipelineService.atualizarEtapa(novaOpZero.id, 'pedido_fechado', null, 350.00);
        console.log(`  ✓ Venda concluída: etapa=${opConcluidaComValor.etapa}, status=${opConcluidaComValor.status}, valor=${opConcluidaComValor.valor_estimado}`);

        if (opConcluidaComValor.status !== 'ganho' || parseFloat(opConcluidaComValor.valor_estimado) !== 350.00) {
            throw new Error(`Falha: Esperado status ganho e valor 350.00, obtido status=${opConcluidaComValor.status}, valor=${opConcluidaComValor.valor_estimado}`);
        }

        const kanbanComConcluida = await CrmPipelineService.listarKanban();
        console.log(`  ✓ Kanban após venda concluída:`);
        console.log(`    - Vendas Concluídas formatado: ${kanbanComConcluida.metricasGerais.valorGanhoFormatado}`);
        console.log(`    - Total de Ganhos: ${kanbanComConcluida.metricasGerais.totalGanhos}`);
        console.log(`    - Coluna Pedido Fechado Total: ${kanbanComConcluida.colunas.pedido_fechado.totalValorFormatado}`);

        const valorGanhoNum = parseFloat(kanbanComConcluida.metricasGerais.valorGanho);
        if (valorGanhoNum <= 0) {
            throw new Error(`Falha crítica: "Vendas Concluídas" continuou em 0 reais após marcar venda como concluída!`);
        }
        console.log(`  ✓ Validação de sucesso: Vendas Concluídas reflete faturamento real (R$ ${valorGanhoNum.toFixed(2)}) e nunca 0!`);

        console.log('\n====================================================');
        console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
        console.log('====================================================');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ ERRO NO TESTE:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

executarTestesCompletosCrm();
