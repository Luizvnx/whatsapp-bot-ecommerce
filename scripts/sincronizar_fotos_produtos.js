const DatabaseService = require('../src/services/DatabaseService');

async function sincronizarProdutosComFotos() {
    await DatabaseService.inicializar();

    console.log('🔄 Sincronizando fotos dos produtos existentes...');

    const updates = [
        { id: 1, foto: '/site-assets/products/Mel-in-natura-280g.jpeg' },
        { id: 2, foto: '/site-assets/products/Meleira-com-mel-280g.jpeg' },
        { id: 3, foto: '/site-assets/products/Kit-de-sabinete-terapeutico.jpeg' },
        { id: 4, foto: '/site-assets/products/Cera-mista-abelha-asf.jpeg' },
        { id: 5, foto: '/site-assets/products/Velas-artesanais-de-cera-de-abelha.jpeg' },
        { id: 6, foto: '/site-assets/products/Cera-alveolada.jpeg' },
        { id: 7, foto: '/site-assets/products/Licor-de-mel-250ml.jpeg' },
        { id: 8, foto: '/site-assets/products/Velas-artesanais-de-cera-de-abelha.png' },
        { id: 9, foto: '/site-assets/products/Kit-presente.jpeg' },
        { id: 10, foto: '/site-assets/products/Desmoldante-de-forma.jpeg' },
        { id: 11, foto: '/site-assets/products/Cera-alveolada.jpeg' },
        { id: 12, foto: '/site-assets/products/Formao.jpeg' }
    ];

    for (const u of updates) {
        await DatabaseService.executar(
            'UPDATE tb_produtos SET foto = $1 WHERE id = $2',
            [u.foto, u.id]
        );
    }

    console.log('✅ 12 produtos originais atualizados com fotos!');

    // Produtos adicionais do catálogo Favo de Mel
    const novosProdutos = [
        {
            categoria_id: '1',
            nome: 'Mel in Natura 500g',
            preco: 35.00,
            descricao: 'Mel 100% puro direto das colmeias do Apiário Favo de Mel em bisnaga prática.',
            foto: '/site-assets/products/Mel-in-natura-500g.jpeg'
        },
        {
            categoria_id: '1',
            nome: 'Mel com Favo 500g',
            preco: 65.00,
            descricao: 'Pedaço genuíno de favo de mel imerso no mel puro. Experiência sensorial única.',
            foto: '/site-assets/products/Mel-com-favo-500g.jpeg'
        },
        {
            categoria_id: '1',
            nome: 'Mel de Melato de Bracatinga 280g',
            preco: 55.00,
            descricao: 'Mel nobre e raro, rico em minerais, com coloração escura e notas amadeiradas.',
            foto: '/site-assets/products/Mel-de-melato-de-bracatinga-280g.jpeg'
        },
        {
            categoria_id: '1',
            nome: 'Mel in Natura 1400g (Garrafa)',
            preco: 75.00,
            descricao: 'Embalagem econômica para toda a família com mel silvestre selecionado.',
            foto: '/site-assets/products/Mel-in-natura-1400g-em-garrafa-pet.jpeg'
        },
        {
            categoria_id: '1',
            nome: 'Mel Cristalizado 500g',
            preco: 45.00,
            descricao: 'Mel puro com cristalização cremosa natural. Textura aveludada maravilhosa.',
            foto: '/site-assets/products/Mel-cristalizado.jpeg'
        },
        {
            categoria_id: '1',
            nome: 'Mel em Sachê 60g',
            preco: 15.00,
            descricao: 'Porção individual prática de sachês de mel para levar na bolsa ou lancheira.',
            foto: '/site-assets/products/Mel-em-sache-60g.jpeg'
        },
        {
            categoria_id: '2',
            nome: 'Própolis Verde 20ml',
            preco: 38.00,
            descricao: 'Extrato puro de própolis verde de alta concentração. Fortalece a imunidade.',
            foto: '/site-assets/products/Propolis-verde-20ml.jpeg'
        },
        {
            categoria_id: '2',
            nome: 'Própolis Vermelha 20ml',
            preco: 50.00,
            descricao: 'A mais nobre e potente própolis do Brasil, rica em flavonoides e antioxidantes.',
            foto: '/site-assets/products/Propolis-vermelha-20ml.jpeg'
        },
        {
            categoria_id: '2',
            nome: 'Pólen Apícola Desidratado 140g',
            preco: 42.00,
            descricao: 'Superalimento natural energizante rico em proteínas, aminoácidos e vitaminas.',
            foto: '/site-assets/products/Polen-apicola-140g.jpeg'
        },
        {
            categoria_id: '2',
            nome: 'Kit Sabonete Terapêutico',
            preco: 35.00,
            descricao: 'Sabonete artesanal elaborado com própolis e mel. Limpeza profunda e suavidade.',
            foto: '/site-assets/products/Kit-de-sabinete-terapeutico.jpeg'
        },
        {
            categoria_id: '3',
            nome: 'Kit Presente Apiário Favo de Mel',
            preco: 120.00,
            descricao: 'Caixa rústica presenteável contendo mel nobre, vela de cera, própolis e doce artesanal.',
            foto: '/site-assets/products/Kit-presente.jpeg'
        },
        {
            categoria_id: '3',
            nome: 'Vinagre de Mel 315ml',
            preco: 30.00,
            descricao: 'Fermentado natural de mel com acidez suave, ideal para saladas gourmet e marinadas.',
            foto: '/site-assets/products/Vinagre-de-mel-315ml.jpeg'
        }
    ];

    for (const np of novosProdutos) {
        const existe = await DatabaseService.executar(
            'SELECT id FROM tb_produtos WHERE nome = $1',
            [np.nome]
        );
        if (existe.rows.length === 0) {
            await DatabaseService.executar(
                `INSERT INTO tb_produtos (categoria_id, nome, preco, descricao, foto, estoque, ativo)
                 VALUES ($1, $2, $3, $4, $5, 999, true)`,
                [np.categoria_id, np.nome, np.preco, np.descricao, np.foto]
            );
            console.log(`➕ Inserido novo produto: ${np.nome}`);
        } else {
            await DatabaseService.executar(
                'UPDATE tb_produtos SET foto = $1, descricao = $2 WHERE id = $3',
                [np.foto, np.descricao, existe.rows[0].id]
            );
        }
    }

    const total = await DatabaseService.executar('SELECT count(*) FROM tb_produtos');
    console.log(`🎉 Total de produtos no banco agora: ${total.rows[0].count}`);
    process.exit(0);
}

sincronizarProdutosComFotos().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
