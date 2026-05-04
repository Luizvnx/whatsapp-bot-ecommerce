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
        const sql = `
            SELECT COALESCE(etapa, 'desconhecido') AS etapa, COUNT(*)::int AS total 
            FROM tb_bot_sessoes 
            GROUP BY COALESCE(etapa, 'desconhecido')
        `;
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
            SELECT id_cliente, nome_contato, etapa, dados_sessao, ultima_msg 
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
    const { id_cliente, novaEtapa } = req.body; // Receba id_cliente diretamente

    if (!id_cliente || !novaEtapa) {
        return res.status(400).json({ success: false, message: 'Dados incompletos.' });
    }

    try {
        let sql = "";
        let params = [];

        if (novaEtapa === 'inicio') {
            sql = `UPDATE tb_bot_sessoes SET etapa = $1, dados_sessao = '{}' WHERE id_cliente = $2`;
            params = [novaEtapa, id_cliente];
        } else {
            sql = `UPDATE tb_bot_sessoes SET etapa = $1 WHERE id_cliente = $2`;
            params = [novaEtapa, id_cliente];
        }
        
        await DatabaseService.executar(sql, params);
        
        console.log(`[Admin] Status do cliente ${id_cliente} alterado para: ${novaEtapa}`);
        res.json({ success: true, message: 'Status atualizado com sucesso!' });
    } catch (err) {
        console.error('❌ Erro ao atualizar status:', err);
        res.status(500).json({ success: false, message: 'Erro interno no BD' });
    }
});

router.get('/instance-status', async (req, res) => {
    try {
        const evolutionUrl = process.env.EVOLUTION_URL || 'http://localhost:8081';
        const apikey = process.env.EVOLUTION_API_KEY;
        const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'FavoDeMel';

        if (!apikey) {
            console.warn('⚠️ API Key da Evolution não encontrada no .env');
            return res.json({ success: false, status: 'offline', message: 'API Key ausente' });
        }

        const stateResponse = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
            headers: { 'apikey': apikey },
            signal: AbortSignal.timeout(5000) 
        });
        
        if (!stateResponse.ok) {
            return res.json({ success: false, status: 'desconhecido' });
        }
        
        const stateData = await stateResponse.json();
        let status = stateData?.instance?.state || 'desconhecido';
        let qrCodeBase64 = null;

        // 2. Busca o QR Code de forma otimizada (apenas se estiver fechado ou tentando conectar)
        if (status === 'close' || status === 'connecting') {
            const qrResponse = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
                headers: { 'apikey': apikey },
                signal: AbortSignal.timeout(5000)
            });
            
            if (qrResponse.ok) {
                const qrData = await qrResponse.json();
                if (qrData?.base64) {
                    qrCodeBase64 = qrData.base64;
                    status = 'qrcode'; 
                }
            }
        }

        res.json({ success: true, status, qrCodeBase64 });

    } catch (err) {
        console.error('❌ Erro de conexão com Evolution:', err.message);
        // Devolve o status offline de forma limpa para o Dashboard mudar a bolinha vermelha
        res.json({ success: false, status: 'offline' });
    }
});

module.exports = router;