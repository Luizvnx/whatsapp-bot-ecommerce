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
            SELECT id_cliente AS telefone, etapa, dados_sessao, ultima_msg 
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

module.exports = router;