const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const SessaoService = require('../services/SessionService');
const EvolutionService = require('../services/EvolutionService');
const BotController = require('../controllers/botController');

// 1. ROTA VISUAL: Desenha a tela do Dashboard
router.get('/', (req, res) => {
    res.render('dashboard'); 
});

// 2. ROTA DE CONFIGURAÇÃO GLOBAL: Consulta e altera o status global do bot
router.get('/global-config', async (req, res) => {
    try {
        const pausado = await BotController.isPausadoGlobalmente();
        res.json({ success: true, pausado });
    } catch (err) {
        console.error('❌ Erro ao buscar status global do bot:', err);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

router.post('/global-config', async (req, res) => {
    try {
        const { pausado } = req.body;
        if (typeof pausado !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Parâmetro pausado inválido.' });
        }
        const novoStatus = await BotController.setPausadoGlobalmente(pausado);
        res.json({ success: true, pausado: novoStatus, message: novoStatus ? 'Automação pausada globalmente.' : 'Automação ativada globalmente.' });
    } catch (err) {
        console.error('❌ Erro ao alterar status global do bot:', err);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// 3. ROTA DE ESTATÍSTICAS
router.get('/stats', async (req, res) => {
    try {
        const sql = `
            SELECT COALESCE(etapa, 'desconhecido') AS etapa, COUNT(*)::int AS total 
            FROM tb_bot_sessoes 
            GROUP BY COALESCE(etapa, 'desconhecido')
        `;
        const result = await DatabaseService.executar(sql);

        const etapas = result.rows;
        let totalGeral = 0;
        let totalHumano = 0;
        let totalIa = 0;
        let totalCarrinho = 0;
        let totalBot = 0;

        etapas.forEach(item => {
            totalGeral += item.total;
            if (item.etapa === 'em_atendimento_humano') {
                totalHumano += item.total;
            } else if (item.etapa === 'conversando_com_ia') {
                totalIa += item.total;
            } else if (item.etapa === 'carrinho_opcoes') {
                totalCarrinho += item.total;
            } else {
                totalBot += item.total;
            }
        });
        
        res.json({ 
            success: true, 
            data: etapas,
            resumo: {
                totalGeral,
                totalHumano,
                totalIa,
                totalCarrinho,
                totalBot
            }
        });
    } catch (err) {
        console.error('❌ Erro ao buscar estatísticas do painel:', err);
        res.status(500).json({ success: false, message: "Erro interno no BD" });
    }
});

// 4. ROTA DE CONVERSAS (com busca e filtros por etapa)
router.get('/conversas', async (req, res) => {
    try {
        const { etapa, busca, limite = 25 } = req.query;
        let sql = `SELECT id_cliente, nome_contato, etapa, dados_sessao, ultima_msg FROM tb_bot_sessoes WHERE 1=1`;
        const params = [];

        if (etapa && etapa !== 'todas') {
            if (etapa === 'humano') {
                params.push('em_atendimento_humano');
                sql += ` AND etapa = $${params.length}`;
            } else if (etapa === 'ia') {
                params.push('conversando_com_ia');
                sql += ` AND etapa = $${params.length}`;
            } else if (etapa === 'carrinho') {
                params.push('carrinho_opcoes');
                sql += ` AND etapa = $${params.length}`;
            } else if (etapa === 'bot') {
                sql += ` AND (etapa NOT IN ('em_atendimento_humano', 'conversando_com_ia') OR etapa IS NULL)`;
            } else {
                params.push(etapa);
                sql += ` AND etapa = $${params.length}`;
            }
        }

        if (busca && busca.trim().length > 0) {
            params.push(`%${busca.trim()}%`);
            sql += ` AND (nome_contato ILIKE $${params.length} OR id_cliente ILIKE $${params.length})`;
        }

        params.push(Math.min(parseInt(limite) || 25, 100));
        sql += ` ORDER BY ultima_msg DESC LIMIT $${params.length}`;

        const result = await DatabaseService.executar(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('❌ Erro ao buscar conversas:', err);
        res.status(500).json({ success: false, message: "Erro interno no BD" });
    }
});

// 5. ALTERAÇÃO DE STATUS/ETAPA INDIVIDUAL DO CLIENTE
router.post('/alterar-status', async (req, res) => {
    const { id_cliente, novaEtapa, resetarCarrinho } = req.body;

    if (!id_cliente || !novaEtapa) {
        return res.status(400).json({ success: false, message: 'Dados incompletos.' });
    }

    try {
        await SessaoService.alterarEtapa(id_cliente, novaEtapa, Boolean(resetarCarrinho));

        const numeroLimpo = id_cliente.split('@')[0];
        if (novaEtapa === 'em_atendimento_humano') {
            // Remove tag Bot (8) e adiciona tag Humano (7)
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '8', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '7', 'add').catch(() => {});
        } else {
            // Remove tag Humano (7) e adiciona tag Bot (8)
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '7', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '8', 'add').catch(() => {});
        }
        
        console.log(`[Admin] Status do cliente ${id_cliente} alterado para: ${novaEtapa}`);
        res.json({ success: true, message: 'Status do atendimento atualizado com sucesso!' });
    } catch (err) {
        console.error('❌ Erro ao atualizar status:', err);
        res.status(500).json({ success: false, message: 'Erro interno no BD' });
    }
});

// 6. ENVIO DIRETO DE MENSAGEM DO ATENDENTE PELO DASHBOARD
router.post('/enviar-mensagem', async (req, res) => {
    const { id_cliente, mensagem, assumirAtendimento = true } = req.body;

    if (!id_cliente || !mensagem || !mensagem.trim()) {
        return res.status(400).json({ success: false, message: 'Número do cliente e mensagem são obrigatórios.' });
    }

    try {
        const numeroLimpo = id_cliente.split('@')[0];
        
        // 1. Envia via Evolution API
        await EvolutionService.enviarMensagemText(numeroLimpo, mensagem.trim());

        // 2. Registra na sessão e opcionalmente coloca em atendimento humano para o bot não interferir
        const sessao = await SessaoService.obterSessao(id_cliente);
        if (!Array.isArray(sessao.historicoIa)) sessao.historicoIa = [];
        
        sessao.historicoIa.push({
            role: 'model',
            parts: [{ text: `[Atendente Humano]: ${mensagem.trim()}` }]
        });

        if (assumirAtendimento) {
            sessao.etapa = 'em_atendimento_humano';
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '8', 'remove').catch(() => {});
            await EvolutionService.gerenciarEtiqueta(numeroLimpo, '7', 'add').catch(() => {});
        }

        await SessaoService.salvarSessao(id_cliente, sessao);

        res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } catch (err) {
        console.error('❌ Erro ao enviar mensagem do atendente:', err);
        res.status(500).json({ success: false, message: 'Falha ao enviar mensagem via WhatsApp.' });
    }
});

// 7. LIMPEZA DE CARRINHO INDIVIDUAL
router.post('/limpar-carrinho', async (req, res) => {
    const { id_cliente } = req.body;

    if (!id_cliente) {
        return res.status(400).json({ success: false, message: 'ID do cliente é obrigatório.' });
    }

    try {
        await SessaoService.limparCarrinho(id_cliente);
        res.json({ success: true, message: 'Carrinho do cliente foi esvaziado.' });
    } catch (err) {
        console.error('❌ Erro ao limpar carrinho:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar carrinho.' });
    }
});

// 8. MONITORAMENTO DE STATUS DA INSTÂNCIA EVOLUTION
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

        // Busca o QR Code de forma otimizada (apenas se desconectado)
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
        res.json({ success: false, status: 'offline' });
    }
});

module.exports = router;