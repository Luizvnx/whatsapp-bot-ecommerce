const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');

// 1. ROTA VISUAL: Desenha a tela do Dashboard
router.get('/', (req, res) => {
    // Renderiza o arquivo dashboard.ejs
    res.render('dashboard'); 
});

// 2. ROTA DE DADOS (API): Alimenta a tela com informações reais
router.get('/stats', async (req, res) => {
    try {
        const sql = `SELECT etapa, COUNT(*) as total FROM tb_bot_sessoes GROUP BY etapa`;
        const result = await DatabaseService.executar(sql);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('❌ Erro ao buscar estatísticas do painel:', err);
        res.status(500).json({ success: false, message: "Erro interno no BD" });
    }
});

// 3. ROTA DE DADOS (API): Busca as últimas 10 conversas
router.get('/conversas', async (req, res) => {
    try {
        const sql = `
            SELECT id_cliente AS telefone, nome_contato, etapa, dados_sessao, ultima_msg 
            FROM tb_bot_sessoes 
            ORDER BY ultima_msg DESC 
            LIMIT 10
        `;
        const result = await DatabaseService.executar(sql);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('❌ Erro ao buscar conversas:', err);
        res.status(500).json({ success: false, message: "Erro interno no BD" });
    }
});

router.post('/alterar-status', async (req, res) => {
    const { telefone, novaEtapa } = req.body;

    if (!telefone || !novaEtapa) {
        return res.status(400).json({ success: false, message: 'Dados incompletos.' });
    }

    try {
        const numeroLimpo = telefone.replace(/\D/g, ''); 
        let sql = '';

        if (novaEtapa === 'inicio') {
            sql = `UPDATE tb_bot_sessoes SET etapa = '${novaEtapa}', dados_sessao = '{}' WHERE id_cliente = '${numeroLimpo}'`;
        } else {
            sql = `UPDATE tb_bot_sessoes SET etapa = '${novaEtapa}' WHERE id_cliente = '${numeroLimpo}'`;
        }
        
        await DatabaseService.executar(sql);
        
        console.log(`[Admin] Status do cliente ${telefone} alterado para: ${novaEtapa}`);
        res.json({ success: true, message: 'Status atualizado com sucesso!' });
    } catch (err) {
        console.error('❌ Erro ao atualizar status:', err);
        res.status(500).json({ success: false, message: 'Erro interno no BD' });
    }
});

module.exports = router;