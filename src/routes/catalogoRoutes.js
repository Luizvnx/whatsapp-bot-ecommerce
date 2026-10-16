const express = require('express');
const router = express.Router();
const CatalogoService = require('../services/CatalogoService');
const PedidoService = require('../services/PedidoService');
const DatabaseService = require('../services/DatabaseService');

/**
 * Retorna configurações da loja e do PIX salvas no PostgreSQL (tb_bot_config)
 */
router.get('/config', async (req, res) => {
    try {
        const config = (await DatabaseService.obterConfig('store_config')) || {
            nome_loja: 'Apiário Favo de Mel',
            whatsapp: '557988125726',
            status_loja: 'aberto',
            status_texto: 'Aberto para Pedidos',
            taxa_entrega_padrao: 0,
            mensagem_entrega: 'A combinar na confirmação',
            pix_chave: '79988125726',
            pix_tipo: 'telefone',
            pix_titular: 'Apiario Favo de Mel',
            pix_cidade: 'Aracaju'
        };
        const safeConfig = { ...config };
        delete safeConfig.admin_senha;
        return res.json({ sucesso: true, config: safeConfig, fonte: 'postgresql' });
    } catch (error) {
        console.error('Erro ao obter configurações da loja:', error);
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

/**
 * Atualiza configurações da loja no PostgreSQL (tb_bot_config)
 */
router.post('/config', async (req, res) => {
    try {
        const dados = req.body;
        const atual = (await DatabaseService.obterConfig('store_config')) || {};
        const atualizado = { ...atual, ...dados };
        await DatabaseService.salvarConfig('store_config', atualizado);
        const safeConfig = { ...atualizado };
        delete safeConfig.admin_senha;
        return res.json({ sucesso: true, mensagem: 'Configurações salvas no PostgreSQL com sucesso', config: safeConfig });
    } catch (error) {
        console.error('Erro ao salvar configurações da loja:', error);
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

/**
 * Retorna todos os produtos e categorias ativas para a vitrine web
 */
router.get('/produtos', async (req, res) => {
    try {
        const catalogo = await CatalogoService.obterCatalogo();
        const listaPlana = await CatalogoService.listarTodosOsProdutos();
        const categorias = await CatalogoService.listarCategorias();

        return res.json({
            sucesso: true,
            categorias: categorias.filter(c => c.ativo),
            produtos: listaPlana.filter(p => p.ativo),
            arvore: catalogo,
            fonte: 'postgresql'
        });
    } catch (error) {
        console.error('Erro ao buscar produtos do catálogo:', error);
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

/**
 * CRUD de Produtos (Admin / Loja)
 */
router.post('/produtos', async (req, res) => {
    try {
        const novoProduto = await CatalogoService.criarProduto(req.body);
        return res.status(201).json({ sucesso: true, produto: novoProduto });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

router.put('/produtos/:id', async (req, res) => {
    try {
        const atualizado = await CatalogoService.atualizarProduto(req.params.id, req.body);
        return res.json({ sucesso: true, produto: atualizado });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

router.delete('/produtos/:id', async (req, res) => {
    try {
        await CatalogoService.deletarProduto(req.params.id);
        return res.json({ sucesso: true, mensagem: 'Produto excluído com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

/**
 * CRUD de Categorias (Admin / Loja)
 */
router.get('/categorias', async (req, res) => {
    try {
        const categorias = await CatalogoService.listarCategorias();
        return res.json({ sucesso: true, categorias });
    } catch (error) {
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

router.post('/categorias', async (req, res) => {
    try {
        const novaCat = await CatalogoService.criarCategoria(req.body);
        return res.status(201).json({ sucesso: true, categoria: novaCat });
    } catch (error) {
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

router.put('/categorias/:id', async (req, res) => {
    try {
        const atualizada = await CatalogoService.atualizarCategoria(req.params.id, req.body);
        return res.json({ sucesso: true, categoria: atualizada });
    } catch (error) {
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

router.delete('/categorias/:id', async (req, res) => {
    try {
        await CatalogoService.deletarCategoria(req.params.id);
        return res.json({ sucesso: true, mensagem: 'Categoria excluída com sucesso.' });
    } catch (error) {
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

/**
 * Cria e processa um novo pedido feito pelo catálogo web
 */
router.post('/pedidos', async (req, res) => {
    try {
        const dados = req.body;
        const resultado = await PedidoService.criarPedidoWeb(dados);
        return res.json(resultado);
    } catch (error) {
        console.error('Erro ao processar pedido web:', error);
        return res.status(400).json({ sucesso: false, erro: error.message });
    }
});

/**
 * Consulta status de um pedido por código com validação de segurança (Anti-IDOR)
 */
router.get('/pedidos/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const { token } = req.query;

        const pedido = await PedidoService.obterPedidoPorCodigo(codigo);
        if (!pedido) {
            return res.status(404).json({ sucesso: false, erro: 'Pedido não encontrado.' });
        }

        // Validação de Segurança (Anti-IDOR)
        if (pedido.token_acesso && pedido.token_acesso !== token) {
            return res.status(403).json({ 
                sucesso: false, 
                erro: 'Acesso não autorizado a este pedido. O link de rastreamento é exclusivo do cliente.' 
            });
        }

        return res.json({
            sucesso: true,
            pedido: {
                codigo_pedido: pedido.codigo_pedido,
                cliente_nome: pedido.cliente_nome,
                cliente_telefone: pedido.cliente_telefone,
                tipo_entrega: pedido.tipo_entrega,
                endereco: pedido.endereco,
                forma_pagamento: pedido.forma_pagamento,
                troco_para: pedido.troco_para,
                observacoes: pedido.observacoes,
                itens: pedido.itens,
                subtotal: pedido.subtotal,
                taxa_entrega: pedido.taxa_entrega,
                total: pedido.total,
                status: pedido.status,
                criado_em: pedido.criado_em,
                atualizado_em: pedido.atualizado_em
            }
        });
    } catch (error) {
        console.error('Erro ao consultar pedido:', error);
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

module.exports = router;
