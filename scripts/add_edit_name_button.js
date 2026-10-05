const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'views', 'dashboard.ejs');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Adicionar botão de edição ao lado do nome no header
if (!code.includes('editarNomeContato()')) {
    code = code.replace(
        '<h3 id="chatHeaderNome" class="text-xs sm:text-sm font-semibold text-stone-900 leading-tight truncate">Nome do Cliente</h3>',
        `<h3 id="chatHeaderNome" class="text-xs sm:text-sm font-semibold text-stone-900 leading-tight truncate">Nome do Cliente</h3>
                                <button onclick="editarNomeContato()" title="Editar nome do cliente" class="text-stone-400 hover:text-stone-700 transition p-0.5 rounded hover:bg-stone-200/50">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>`
    );

    // 2. Adicionar função editarNomeContato no JavaScript
    const jsFunction = `
        async function editarNomeContato() {
            if (!conversaAtivaId || !conversaAtivaDados) return;
            const nomeAtual = conversaAtivaDados.nome_contato || '';
            const novoNome = prompt('Editar nome do cliente:', nomeAtual);
            if (novoNome === null) return;
            const nomeLimpo = novoNome.trim();
            if (!nomeLimpo) {
                mostrarToast('O nome não pode ficar em branco.', 'erro');
                return;
            }
            try {
                const res = await fetch(\`/admin/conversa/\${encodeURIComponent(conversaAtivaId)}/atualizar-nome\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nomeLimpo })
                });
                const result = await res.json();
                if (result.success) {
                    conversaAtivaDados.nome_contato = result.nome_contato;
                    document.getElementById('chatHeaderNome').textContent = result.nome_contato;
                    document.getElementById('chatHeaderAvatar').textContent = result.nome_contato.replace(/^\\W+/, '').charAt(0).toUpperCase() || 'C';
                    carregarListaConversas();
                    mostrarToast('Nome do contato atualizado com sucesso!', 'sucesso');
                } else {
                    mostrarToast(result.message || 'Erro ao atualizar nome.', 'erro');
                }
            } catch (err) {
                mostrarToast('Erro de comunicação ao salvar nome.', 'erro');
            }
        }
`;

    code = code.replace(
        'async function alternarModoAtendimento() {',
        `${jsFunction}\n        async function alternarModoAtendimento() {`
    );

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('✅ Botão e função editarNomeContato adicionados ao dashboard.ejs com sucesso!');
} else {
    console.log('ℹ️ editarNomeContato já estava presente no dashboard.ejs');
}
