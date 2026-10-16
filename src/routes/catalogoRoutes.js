const express = require('express');
const router = express.Router();
const CatalogoService = require('../services/CatalogoService');
const PedidoService = require('../services/PedidoService');

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
            arvore: catalogo
        });
    } catch (error) {
        console.error('Erro ao buscar produtos do catálogo:', error);
        return res.status(500).json({ sucesso: false, erro: error.message });
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
 * Consulta status de um pedido por código
 */
router.get('/pedidos/:codigo', async (req, res) => {
    try {
        const pedido = await PedidoService.obterPedidoPorCodigo(req.params.codigo);
        if (!pedido) {
            return res.status(404).json({ sucesso: false, erro: 'Pedido não encontrado.' });
        }
        return res.json({ sucesso: true, pedido });
    } catch (error) {
        console.error('Erro ao consultar pedido:', error);
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

module.exports = router;
