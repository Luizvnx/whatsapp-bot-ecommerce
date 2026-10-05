const fs = require('fs');
const path = require('path');

function updateBotController() {
    const filePath = path.join(__dirname, '..', 'src', 'controllers', 'BotController.js');
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. Inserir atualização de nomeContato se veio um pushName legítimo
    if (!code.includes('info.nomeCliente && SessaoService.isNomeContatoValido(info.nomeCliente)')) {
        const targetSearch = "await this._processarAcoesAdmin(info.textoBruto, numeroReal, sessao);";
        const idx = code.indexOf(targetSearch);
        if (idx !== -1) {
            const endBlock = code.indexOf('}', idx);
            if (endBlock !== -1) {
                const insertPos = endBlock + 1;
                const insertion = `\n\n            // Atualiza o nome do contato se veio um pushName legítimo do WhatsApp\n            if (info.nomeCliente && SessaoService.isNomeContatoValido(info.nomeCliente)) {\n                sessao.nome_contato = info.nomeCliente.trim();\n            }`;
                code = code.slice(0, insertPos) + insertion + code.slice(insertPos);
                console.log('✅ BotController: Adicionada persistência de nomeContato a partir do pushName');
            }
        }
    }

    // 2. Atualizar extração de pushName em _extrairDadosMensagem
    code = code.replace(
        /const nomeCliente = data\.pushName \|\| 'um Cliente';[\s\S]*?const linkAlerta = isLid[\s\S]*?: `\\n👉 Link: https:\/\/wa\.me\/\$\{numeroCliente\}`;/,
        `const rawPushName = (data.pushName && typeof data.pushName === 'string') ? data.pushName.trim() : null;\n        const nomeCliente = SessaoService.isNomeContatoValido(rawPushName) ? rawPushName : null;\n        const nomeParaExibir = nomeCliente || SessaoService.formatarNumeroWhatsapp(numeroReal);\n        \n        const linkAlerta = isLid \n            ? \`\\n👉 *Aviso:* Número oculto pelo WhatsApp. Procure pela conversa de *\${nomeParaExibir}* no seu aplicativo.\`\n            : \`\\n👉 Link: https://wa.me/\${numeroCliente}\`;`
    );

    // 3. Remover 'Bot Favo de Mel' do 4º argumento de SessaoService.adicionarMensagem
    code = code.replace(
        /SessaoService\.adicionarMensagem\(numeroReal, 'atendente', t, 'Bot Favo de Mel', \{/g,
        "SessaoService.adicionarMensagem(numeroReal, 'atendente', t, null, {"
    );
    code = code.replace(
        /SessaoService\.adicionarMensagem\(numeroReal, 'atendente', textParaHistorico, 'Bot Favo de Mel', \{/g,
        "SessaoService.adicionarMensagem(numeroReal, 'atendente', textParaHistorico, null, {"
    );
    code = code.replace(
        /SessaoService\.adicionarMensagem\(numeroReal, 'atendente', caption, 'Bot Favo de Mel', \{/g,
        "SessaoService.adicionarMensagem(numeroReal, 'atendente', caption, null, {"
    );

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ BotController.js atualizado com sucesso!');
}

function updateWebhookController() {
    const filePath = path.join(__dirname, '..', 'src', 'controllers', 'WebhookController.js');
    let code = fs.readFileSync(filePath, 'utf8');

    // Atualizar extração de nomeContato e validação
    code = code.replace(
        /const isFromMe = Boolean\(data\.key\.fromMe\);\s*const nomeContato = data\.pushName \|\| 'Cliente';/,
        `const isFromMe = Boolean(data.key.fromMe);\n            const rawPushName = (data.pushName && typeof data.pushName === 'string') ? data.pushName.trim() : null;\n            const nomeContato = (!isFromMe && SessionService.isNomeContatoValido(rawPushName)) ? rawPushName : null;`
    );

    // Atualizar autor de mensagens citadas para não exibir "Cliente" genérico
    code = code.replace(
        /autor = nomeContato \|\| 'Cliente';/g,
        `autor = nomeContato || SessionService.formatarNumeroWhatsapp(numeroReal);`
    );
    code = code.replace(
        /autor = isFromMe \? \(nomeContato \|\| 'Cliente'\) : 'Atendente';/g,
        `autor = isFromMe ? (nomeContato || SessionService.formatarNumeroWhatsapp(numeroReal)) : 'Atendente';`
    );

    // Atualizar chamada adicionarMensagem
    code = code.replace(
        /SessionService\.adicionarMensagem\(numeroReal, remetente, infoMsg\.texto, isFromMe \? null : nomeContato, \{/,
        `SessionService.adicionarMensagem(numeroReal, remetente, infoMsg.texto, nomeContato, {`
    );

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ WebhookController.js atualizado com sucesso!');
}

function updateAdminRoutes() {
    const filePath = path.join(__dirname, '..', 'src', 'routes', 'adminRoutes.js');
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. Atualizar mapeamento de conversas
    code = code.replace(
        /nome_contato: row\.nome_contato \|\| dados\.nome_contato \|\| 'Cliente',/,
        `nome_contato: SessionService.isNomeContatoValido(row.nome_contato) ? row.nome_contato.trim() : (SessionService.isNomeContatoValido(dados.nome_contato) ? dados.nome_contato.trim() : SessionService.formatarNumeroWhatsapp(row.id_cliente)),`
    );

    // 2. Atualizar exportar-txt
    code = code.replace(
        /const nome = conversa\.nome_contato \|\| 'Cliente';/,
        `const nome = SessionService.isNomeContatoValido(conversa.nome_contato) ? conversa.nome_contato.trim() : SessionService.formatarNumeroWhatsapp(id_cliente);`
    );

    // 3. Adicionar rota POST /conversa/:id_cliente/atualizar-nome se ainda não existir
    if (!code.includes('/conversa/:id_cliente/atualizar-nome')) {
        const routeInsert = `
// 3.0. ROTA PARA ATUALIZAR NOME DO CONTATO EXPLICITAMENTE
router.post('/conversa/:id_cliente/atualizar-nome', async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const { nome } = req.body;
        if (!id_cliente) return res.status(400).json({ success: false, message: 'ID do cliente obrigatório.' });

        const conversaAtualizada = await SessionService.atualizarNomeContato(id_cliente, nome);
        res.json({ success: true, nome_contato: conversaAtualizada.nome_contato });
    } catch (err) {
        console.error('❌ Erro ao atualizar nome do contato:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar nome do contato.' });
    }
});
`;
        code = code.replace(
            /\/\/ 3\. ROTA DE DETALHES DE UMA CONVERSA/,
            `${routeInsert}\n// 3. ROTA DE DETALHES DE UMA CONVERSA`
        );
        console.log('✅ adminRoutes: Rota /conversa/:id_cliente/atualizar-nome criada');
    }

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ adminRoutes.js atualizado com sucesso!');
}

function updateDashboardView() {
    const filePath = path.join(__dirname, '..', 'src', 'views', 'dashboard.ejs');
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. Sidebar avatar inicial (linha ~2293)
    code = code.replace(
        /\$\{\(item\.nome_contato \|\| 'C'\)\.charAt\(0\)\.toUpperCase\(\)\}/g,
        "${(item.nome_contato || 'C').replace(/^\\W+/, '').charAt(0).toUpperCase() || 'C'}"
    );

    // 2. Chat header avatar inicial (linha ~2432)
    code = code.replace(
        /document\.getElementById\('chatHeaderAvatar'\)\.textContent = \(conversa\.nome_contato \|\| 'C'\)\.charAt\(0\)\.toUpperCase\(\);/g,
        "document.getElementById('chatHeaderAvatar').textContent = (conversa.nome_contato || 'C').replace(/^\\W+/, '').charAt(0).toUpperCase() || 'C';"
    );

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ dashboard.ejs atualizado com sucesso!');
}

async function sanitizeDatabaseRows() {
    const DatabaseService = require('../src/services/DatabaseService');
    const SessionService = require('../src/services/SessionService');

    const res = await DatabaseService.executar(
        "SELECT id_cliente, nome_contato, dados_sessao FROM tb_bot_sessoes WHERE id_cliente NOT LIKE '%@lid%'"
    );

    let count = 0;
    for (const row of res.rows) {
        const idCanonico = SessionService.normalizarId(row.id_cliente);
        let dados = typeof row.dados_sessao === 'string' ? JSON.parse(row.dados_sessao) : (row.dados_sessao || {});
        
        const nomeAtualValido = SessionService.isNomeContatoValido(row.nome_contato) ? row.nome_contato.trim() : null;
        const nomeDadosValido = SessionService.isNomeContatoValido(dados.nome_contato) ? dados.nome_contato.trim() : null;

        const nomeLegitimo = nomeAtualValido || nomeDadosValido || SessionService.formatarNumeroWhatsapp(idCanonico);

        if (row.nome_contato !== nomeLegitimo || dados.nome_contato !== nomeLegitimo) {
            dados.nome_contato = nomeLegitimo;
            dados.id_cliente = idCanonico;

            await DatabaseService.executar(
                "UPDATE tb_bot_sessoes SET nome_contato = $1, dados_sessao = $2 WHERE id_cliente = $3",
                [nomeLegitimo, JSON.stringify(dados), row.id_cliente]
            );
            console.log(`🧹 Sanitizado: ${row.id_cliente} -> "${nomeLegitimo}" (era: "${row.nome_contato}")`);
            count++;
        }
    }
    console.log(`✅ Higienização concluída: ${count} registros corrigidos no PostgreSQL.`);
}

(async () => {
    try {
        updateBotController();
        updateWebhookController();
        updateAdminRoutes();
        updateDashboardView();
        await sanitizeDatabaseRows();
        console.log('🚀 Todas as correções foram aplicadas com sucesso!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro aplicando correções:', err);
        process.exit(1);
    }
})();
