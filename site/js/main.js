/**
 * Apiário Favo de Mel - Main Institutional Script
 * Zero dependências / Vanilla JS
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Navbar Scroll State
    const header = document.querySelector('.site-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // 2. Mobile Menu Toggle
    const mobileBtn = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const isOpen = navLinks.classList.contains('active');
            mobileBtn.innerHTML = isOpen ? '✕' : '☰';
        });

        // Fecha ao clicar em um link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileBtn.innerHTML = '☰';
            });
        });
    }

    // 3. Contadores Numéricos Animados
    const statNumbers = document.querySelectorAll('.stat-number');
    let animated = false;

    const animateStats = () => {
        if (animated) return;
        const statsSection = document.querySelector('.stats-section');
        if (!statsSection) return;

        const rect = statsSection.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.85) {
            animated = true;
            statNumbers.forEach(el => {
                const targetText = el.getAttribute('data-target') || el.innerText;
                const targetNum = parseInt(targetText.replace(/\D/g, ''), 10);
                const prefix = targetText.startsWith('+') ? '+' : '';
                const suffix = targetText.endsWith('%') ? '%' : '';

                let current = 0;
                const duration = 1600;
                const stepTime = 25;
                const totalSteps = duration / stepTime;
                const increment = Math.ceil(targetNum / totalSteps);

                const timer = setInterval(() => {
                    current += increment;
                    if (current >= targetNum) {
                        current = targetNum;
                        clearInterval(timer);
                    }
                    el.innerText = `${prefix}${current.toLocaleString('pt-BR')}${suffix}`;
                }, stepTime);
            });
        }
    };

    window.addEventListener('scroll', animateStats);
    animateStats(); // Testa na carga inicial

    // 4. Formulário de Contato Direto para WhatsApp
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nome = document.getElementById('cfNome').value.trim();
            const tel = document.getElementById('cfTelefone').value.trim();
            const assunto = document.getElementById('cfAssunto').value;
            const mensagem = document.getElementById('cfMensagem').value.trim();

            const textoMsg = 
`🍯 *CONTATO VIA SITE - APIÁRIO FAVO DE MEL* 🐝
👤 *Nome:* ${nome}
📱 *Telefone:* ${tel}
📌 *Assunto:* ${assunto}
💬 *Mensagem:* ${mensagem}`;

            const numeroLoja = '557988125726';
            const url = `https://wa.me/${numeroLoja}?text=${encodeURIComponent(textoMsg)}`;
            window.open(url, '_blank');
        });
    }
});
