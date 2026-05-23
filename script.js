document.addEventListener('DOMContentLoaded', () => {
    const app = {
        currentUser: null,
        currentPage: 'landing',
        books: JSON.parse(localStorage.getItem('beep_books')) || [
            { id: 1, title: 'Dom Casmurro', author: 'Machado de Assis', genre: 'Lit. Brasileira', status: 'available', stock: 3 },
            { id: 2, title: 'Vidas Secas', author: 'Graciliano Ramos', genre: 'Lit. Brasileira', status: 'available', stock: 2 },
            { id: 3, title: 'O Cortiço', author: 'Aluísio Azevedo', genre: 'Romance', status: 'borrowed', stock: 0 },
            { id: 4, title: 'A Hora da Estrela', author: 'Clarice Lispector', genre: 'Romance', status: 'available', stock: 4 },
            { id: 5, title: 'Capitães da Areia', author: 'Jorge Amado', genre: 'Lit. Brasileira', status: 'available', stock: 2 },
            { id: 6, title: 'Física Moderna', author: 'Eisberg & Resnick', genre: 'Ciências', status: 'available', stock: 1 },
            { id: 7, title: 'História da Arte', author: 'Gombrich', genre: 'Artes', status: 'borrowed', stock: 0 },
            { id: 8, title: 'Matemática Básica', author: 'Iezzi', genre: 'Matemática', status: 'available', stock: 5 }
        ],
        loans: JSON.parse(localStorage.getItem('beep_loans')) || [
            { id: 1, student: 'Ana Lima', book: 'Dom Casmurro', date: '10/11/2024', deadline: '17/11/2024', status: 'late' },
            { id: 2, student: 'Pedro Santos', book: 'O Cortiço', date: '15/11/2024', deadline: '22/11/2024', status: 'active' },
            { id: 3, student: 'Maria Oliveira', book: 'Capitães da Areia', date: '20/11/2024', deadline: '27/11/2024', status: 'active' },
            { id: 4, student: 'Carlos Mendes', book: 'A Hora da Estrela', date: '01/11/2024', deadline: '08/11/2024', status: 'returned' }
        ],
        activities: [
            { text: 'Ana Lima renovou o empréstimo de Vidas Secas', type: 'normal' },
            { text: 'Pedro Santos devolveu O Cortiço — obrigado pela devolução!', type: 'normal' },
            { text: 'Atenção: 3 empréstimos vencem amanhã. Vale conferir com os alunos.', type: 'late' },
            { text: 'Novo livro no acervo: Física Quântica', type: 'normal' }
        ],
        statEmojis: ['📚', '✅', '🔄', '⏰'],
        toastIcons: { success: '✓', error: '✕', normal: '💬' },
        genreIcons: {
            'Lit. Brasileira': '📕', Romance: '📖', Ciências: '🔬',
            Matemática: '📐', Artes: '🎨', default: '📗'
        },

        init() {
            this.cacheDOM();
            this.syncSidebars();
            this.bindEvents();
            this.updateDate();
            this.checkSession();
            this.navigate('landing');
        },

        cacheDOM() {
            this.pages = document.querySelectorAll('.page');
            this.modal = document.getElementById('modal-overlay');
            this.modalContent = document.getElementById('modal-content');
            this.toastContainer = document.getElementById('toast-container');
        },

        syncSidebars() {
            const master = document.querySelector('#dashboard .sidebar');
            if (!master) return;
            document.querySelectorAll('.page-app .sidebar').forEach(el => {
                if (el !== master && !el.querySelector('.side-nav')) {
                    el.innerHTML = master.innerHTML;
                }
            });
            this.updateSideNavActive(this.currentPage);
        },

        handleNavClick(e) {
            e.preventDefault();
            const el = e.target.closest('[data-page]');
            if (!el) return;
            const target = el.dataset.page;
            if (target && ['dashboard', 'catalog', 'loans', 'admin'].includes(target)) {
                if (!this.currentUser) {
                    this.showToast('Para acessar essa área, faça login primeiro.', 'error');
                    this.navigate('login');
                    return;
                }
            }
            if (target) this.navigate(target);
        },

        bindEvents() {
            document.getElementById('app').addEventListener('click', (e) => {
                const logoutBtn = e.target.closest('.btn-logout-side');
                if (logoutBtn) { e.preventDefault(); this.logout(); return; }
                const sideLink = e.target.closest('.side-nav a[data-page]');
                if (sideLink) { this.handleNavClick(e); return; }
            });

            document.querySelectorAll('[data-page]').forEach(link => {
                if (!link.closest('.side-nav')) {
                    link.addEventListener('click', (e) => this.handleNavClick(e));
                }
            });

            document.getElementById('login-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const userInput = document.getElementById('login-user')?.value?.toLowerCase() || '';
                let name = 'Visitante';
                let role = 'Usuário';
                if (userInput.includes('juliana') || userInput.includes('admin')) {
                    name = 'Juliana';
                    role = 'Bibliotecária';
                } else if (userInput.includes('monitor')) {
                    name = 'Monitor';
                    role = 'Monitor da biblioteca';
                } else if (userInput.includes('aluno')) {
                    name = 'Aluno';
                    role = 'Leitor';
                } else {
                    name = userInput.split('@')[0] || 'Visitante';
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    role = 'Leitor';
                }
                this.login(name, role);
            });

            document.getElementById('register-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.showToast('Conta criada! Agora é só entrar com seu login.', 'success');
                this.navigate('login');
            });

            document.getElementById('nav-auth-btn').addEventListener('click', () => {
                if (this.currentUser) this.logout();
                else this.navigate('login');
            });

            document.getElementById('search-book')?.addEventListener('input', (e) => {
                this.filterBooks();
            });

            document.getElementById('filter-status')?.addEventListener('change', () => {
                this.filterBooks();
            });

            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.renderLoans(tab.dataset.tab);
                });
            });

            document.getElementById('loans-body')?.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-return')) {
                    this.returnLoan(parseInt(e.target.dataset.id));
                }
            });

            document.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal());
            this.modal?.addEventListener('click', (e) => {
                if (e.target === this.modal) this.closeModal();
            });

            document.getElementById('open-book-modal')?.addEventListener('click', () => this.openBookModal());
            document.getElementById('open-loan-modal')?.addEventListener('click', () => this.openLoanModal());
            document.getElementById('refresh-activity')?.addEventListener('click', () => {
                this.renderActivities();
                this.showToast('Lista atualizada!', 'normal');
            });

            document.querySelectorAll('.admin-card').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.admin-card').forEach(c => c.classList.remove('active-module'));
                    btn.classList.add('active-module');
                    this.renderAdminPanel(btn.dataset.module);
                });
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal?.classList.contains('active')) this.closeModal();
            });
        },

        filterBooks() {
            const q = (document.getElementById('search-book')?.value || '').toLowerCase();
            const status = document.getElementById('filter-status')?.value || 'all';
            let filtered = this.books.filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.author.toLowerCase().includes(q) ||
                b.genre.toLowerCase().includes(q)
            );
            if (status !== 'all') filtered = filtered.filter(b => b.status === status);
            this.renderBooks(filtered);
        },

        getGreeting() {
            const h = new Date().getHours();
            if (h < 12) return 'Bom dia';
            if (h < 18) return 'Boa tarde';
            return 'Boa noite';
        },

        getFirstName(name) {
            return (name || '').split(' ')[0];
        },

        navigate(page) {
            this.currentPage = page;
            this.pages.forEach(p => p.classList.remove('active'));
            document.getElementById(page)?.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.updateSideNavActive(page);

            if (['dashboard', 'catalog', 'loans', 'admin'].includes(page)) {
                this.syncSidebars();
                this.updateUserUI();
            }
            if (page === 'dashboard') this.renderDashboard();
            if (page === 'catalog') this.renderBooks(this.books);
            if (page === 'loans') this.renderLoans('active');
        },

        updateSideNavActive(page) {
            document.querySelectorAll('.side-nav a[data-page]').forEach(a => {
                a.classList.toggle('active', a.dataset.page === page);
            });
        },

        checkSession() {
            const session = JSON.parse(localStorage.getItem('beep_session'));
            if (session) this.login(session.name, session.role, true);
        },

        updateUserUI() {
            const name = this.currentUser?.name || 'Visitante';
            const role = this.currentUser?.role || '—';
            const initial = name.charAt(0).toUpperCase();

            document.querySelectorAll('.avatar, #user-avatar').forEach(el => { el.textContent = initial; });
            document.querySelectorAll('.user-info h4, #user-name').forEach(el => { el.textContent = name; });
            document.querySelectorAll('.user-info p, #user-role').forEach(el => { el.textContent = role; });

            const greeting = document.getElementById('greeting-text');
            if (greeting && this.currentUser) {
                greeting.textContent = `${this.getGreeting()}, ${this.getFirstName(name)}!`;
            }
        },

        login(name, role, silent = false) {
            this.currentUser = { name, role };
            localStorage.setItem('beep_session', JSON.stringify(this.currentUser));
            document.getElementById('nav-auth-btn').textContent = 'Sair';
            document.querySelector('.auth-only')?.classList.add('logged');
            this.updateUserUI();
            this.syncSidebars();
            if (!silent) {
                const msgs = [
                    `Que bom te ver, ${this.getFirstName(name)}!`,
                    `Olá, ${this.getFirstName(name)} — a biblioteca te espera.`,
                    `Bem-vindo(a), ${this.getFirstName(name)}!`
                ];
                this.showToast(msgs[Math.floor(Math.random() * msgs.length)], 'success');
            }
            this.navigate('dashboard');
        },

        logout() {
            this.currentUser = null;
            localStorage.removeItem('beep_session');
            document.getElementById('nav-auth-btn').textContent = 'Entrar';
            document.querySelector('.auth-only')?.classList.remove('logged');
            this.showToast('Até logo! Volte quando quiser consultar um livro.', 'normal');
            this.navigate('landing');
        },

        updateDate() {
            const el = document.getElementById('current-date');
            if (el) {
                el.textContent = new Date().toLocaleDateString('pt-BR', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                });
            }
        },

        renderDashboard() {
            const container = document.getElementById('stats-container');
            const active = this.loans.filter(l => l.status === 'active').length;
            const late = this.loans.filter(l => l.status === 'late').length;
            const available = this.books.filter(b => b.status === 'available').length;
            const stats = [
                { value: this.books.length, label: 'livros no acervo' },
                { value: available, label: 'prontos para empréstimo' },
                { value: active, label: 'empréstimos em andamento' },
                { value: late, label: late === 1 ? 'com prazo vencido' : 'com prazo vencido' }
            ];
            container.innerHTML = stats.map((s, i) => `
                <div class="stat-card">
                    <span class="stat-emoji">${this.statEmojis[i]}</span>
                    <h3>${s.value}</h3>
                    <p>${s.label}</p>
                </div>
            `).join('');
            this.updateUserUI();
            this.renderActivities();
        },

        renderActivities() {
            const list = document.getElementById('activity-list');
            if (!list) return;
            list.innerHTML = '';
            if (this.activities.length === 0) {
                list.innerHTML = '<p class="empty-hint">Nada por aqui ainda — as movimentações aparecem nesta lista.</p>';
                return;
            }
            this.activities.forEach(act => {
                const div = document.createElement('div');
                div.className = `activity-item ${act.type}`;
                div.textContent = act.text;
                list.appendChild(div);
            });
        },

        getGenreTag(genre) {
            if (genre.includes('Lit') || genre.includes('Romance')) return 'tag-lit';
            if (genre.includes('Art')) return 'tag-art';
            return 'tag-sci';
        },

        getBookIcon(genre) {
            for (const [key, icon] of Object.entries(this.genreIcons)) {
                if (genre.includes(key.split('.')[0]) || genre === key) return icon;
            }
            return this.genreIcons.default;
        },

        renderBooks(data) {
            const container = document.getElementById('book-list');
            if (!container) return;
            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">📭</span>
                        <strong>Nenhum livro encontrado</strong>
                        <p>Tente outra busca ou limpe os filtros — às vezes o título está escrito de outro jeito.</p>
                    </div>`;
                return;
            }

            data.forEach(book => {
                const el = document.createElement('article');
                el.className = 'book-item';
                const genreTag = this.getGenreTag(book.genre);
                const statusTag = book.status === 'available' ? 'tag-avail' : 'tag-borrow';
                const statusText = book.status === 'available'
                    ? `Disponível · ${book.stock} exemplar${book.stock !== 1 ? 'es' : ''}`
                    : 'Emprestado no momento';
                el.innerHTML = `
                    <div class="book-cover" aria-hidden="true">${this.getBookIcon(book.genre)}</div>
                    <div class="book-body">
                        <div class="book-title">${book.title}</div>
                        <div class="book-author">${book.author}</div>
                        <div class="book-meta">
                            <span class="book-tag ${genreTag}">${book.genre}</span>
                            <span class="book-tag ${statusTag}">${statusText}</span>
                        </div>
                    </div>
                `;
                container.appendChild(el);
            });
        },

        renderLoans(status) {
            const tbody = document.getElementById('loans-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            const filtered = this.loans.filter(l => l.status === status);

            const emptyMessages = {
                active: { icon: '📋', title: 'Nenhum empréstimo em andamento', text: 'Quando alguém pegar um livro emprestado, ele aparece aqui.' },
                late: { icon: '🎉', title: 'Nenhum atraso por enquanto', text: 'Ótima notícia — todos os prazos estão em dia.' },
                returned: { icon: '📚', title: 'Nenhuma devolução registrada', text: 'As devoluções concluídas ficam listadas nesta aba.' }
            };

            if (filtered.length === 0) {
                const msg = emptyMessages[status] || emptyMessages.active;
                tbody.innerHTML = `<tr><td colspan="6">
                    <div class="empty-state" style="border:none;background:transparent;">
                        <span class="empty-icon">${msg.icon}</span>
                        <strong>${msg.title}</strong>
                        <p>${msg.text}</p>
                    </div>
                </td></tr>`;
                return;
            }

            filtered.forEach(loan => {
                const tr = document.createElement('tr');
                const statusClass = loan.status === 'active' ? 'status-active' : loan.status === 'late' ? 'status-late' : 'status-returned';
                const statusLabel = loan.status === 'active' ? 'Em dia' : loan.status === 'late' ? 'Atrasado' : 'Devolvido';
                tr.innerHTML = `
                    <td>${loan.student}</td>
                    <td>${loan.book}</td>
                    <td>${loan.date}</td>
                    <td>${loan.deadline}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${loan.status !== 'returned'
                        ? `<button class="action-btn btn-return" data-id="${loan.id}">Registrar devolução</button>`
                        : '<span style="color:var(--text-muted)">—</span>'}</td>
                `;
                tbody.appendChild(tr);
            });
        },

        returnLoan(id) {
            const loan = this.loans.find(l => l.id === id);
            if (!loan) return;
            loan.status = 'returned';
            const book = this.books.find(b => b.title === loan.book);
            if (book) {
                book.stock++;
                book.status = 'available';
            }
            this.saveData();
            this.renderLoans(document.querySelector('.tab.active')?.dataset.tab || 'active');
            this.showToast(`${loan.student} devolveu "${loan.book}". Obrigado!`, 'success');
            this.activities.unshift({ text: `${loan.student} devolveu ${loan.book}`, type: 'normal' });
            if (this.currentPage === 'dashboard') this.renderDashboard();
            if (this.currentPage === 'catalog') this.filterBooks();
        },

        openBookModal() {
            this.modalContent.innerHTML = `
                <h3 id="modal-title">Adicionar livro ao acervo</h3>
                <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:0.5rem;">Preencha os dados abaixo — leva só um instante.</p>
                <form id="new-book-form">
                    <input type="text" placeholder="Título" required aria-label="Título">
                    <input type="text" placeholder="Autor(a)" required aria-label="Autor">
                    <select required aria-label="Editora">
                        <option value="" disabled selected>Editora</option>
                        <option>Editora Saraiva</option>
                        <option>Editora Ática</option>
                        <option>FTD</option>
                        <option>Paz e Terra</option>
                    </select>
                    <input type="number" placeholder="Ano de publicação" min="1900" max="2026" required aria-label="Ano">
                    <select required aria-label="Gênero">
                        <option value="" disabled selected>Gênero / categoria</option>
                        <option>Literatura Brasileira</option>
                        <option>Romance</option>
                        <option>Ciências</option>
                        <option>Matemática</option>
                        <option>História</option>
                        <option>Filosofia</option>
                    </select>
                    <input type="number" placeholder="Quantidade de exemplares" min="1" required aria-label="Exemplares">
                    <div class="modal-btns">
                        <button type="button" class="btn-cancel btn-logout">Cancelar</button>
                        <button type="submit" class="btn-primary">Salvar no catálogo</button>
                    </div>
                </form>
            `;
            this.modalContent.querySelector('.btn-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('new-book-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const inputs = e.target.querySelectorAll('input');
                const genre = e.target.querySelectorAll('select')[1].value;
                const stock = parseInt(inputs[3].value, 10);
                const title = inputs[0].value;
                this.books.push({
                    id: Date.now(), title, author: inputs[1].value, genre,
                    status: stock > 0 ? 'available' : 'borrowed', stock
                });
                this.saveData();
                this.filterBooks();
                this.closeModal();
                this.showToast(`"${title}" já está no catálogo!`, 'success');
                this.activities.unshift({ text: `Novo livro cadastrado: ${title}`, type: 'normal' });
            });
            this.showModal();
        },

        openLoanModal() {
            const availableBooks = this.books.filter(b => b.status === 'available' && b.stock > 0);
            if (availableBooks.length === 0) {
                this.showToast('No momento não há exemplares disponíveis para empréstimo.', 'error');
                return;
            }
            const bookOptions = availableBooks.map(b =>
                `<option value="${b.id}">${b.title} — ${b.author} (${b.stock} disp.)</option>`
            ).join('');
            this.modalContent.innerHTML = `
                <h3 id="modal-title">Registrar novo empréstimo</h3>
                <p style="color:var(--text-muted);font-size:0.9rem;">O prazo padrão é de 7 dias a partir da data de retirada.</p>
                <form id="new-loan-form">
                    <input type="text" placeholder="Nome do(a) aluno(a)" required aria-label="Aluno">
                    <select required aria-label="Livro">
                        <option value="" disabled selected>Escolha o livro</option>${bookOptions}
                    </select>
                    <input type="date" id="loan-date" required aria-label="Data de retirada">
                    <div class="modal-btns">
                        <button type="button" class="btn-cancel btn-logout">Cancelar</button>
                        <button type="submit" class="btn-primary">Confirmar empréstimo</button>
                    </div>
                </form>
            `;
            document.getElementById('loan-date').valueAsDate = new Date();
            this.modalContent.querySelector('.btn-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('new-loan-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const name = e.target.querySelector('input[type="text"]').value;
                const bookId = parseInt(e.target.querySelector('select').value, 10);
                const book = this.books.find(b => b.id === bookId);
                if (book && book.stock > 0) {
                    const today = new Date();
                    const deadline = new Date();
                    deadline.setDate(deadline.getDate() + 7);
                    book.stock--;
                    if (book.stock === 0) book.status = 'borrowed';
                    this.loans.unshift({
                        id: Date.now(), student: name, book: book.title,
                        date: today.toLocaleDateString('pt-BR'),
                        deadline: deadline.toLocaleDateString('pt-BR'),
                        status: 'active'
                    });
                    this.saveData();
                    this.renderLoans('active');
                    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'active'));
                    this.filterBooks();
                    this.closeModal();
                    this.showToast(`Empréstimo registrado para ${name}. Boa leitura!`, 'success');
                    this.activities.unshift({ text: `${name} emprestou ${book.title}`, type: 'normal' });
                }
            });
            this.showModal();
        },

        renderAdminPanel(type) {
            const panel = document.getElementById('admin-panel');
            const modules = {
                students: { title: 'Gerenciar alunos', desc: 'Cadastros, turmas e histórico de leitura de cada estudante.', emoji: '🎓' },
                monitors: { title: 'Monitores da biblioteca', desc: 'Equipe de apoio — horários, permissões e tarefas do dia.', emoji: '🙋' },
                publishers: { title: 'Editoras parceiras', desc: 'Contatos, doações e parcerias para renovar o acervo.', emoji: '🏢' }
            };
            const mod = modules[type] || { title: 'Módulo', desc: 'Em breve.', emoji: '📌' };
            panel.innerHTML = `
                <div style="width:100%;">
                    <p style="font-size:2rem;margin-bottom:0.5rem;">${mod.emoji}</p>
                    <h3 style="font-family:var(--font-display);margin-bottom:0.5rem;">${mod.title}</h3>
                    <p style="color:var(--text-muted);line-height:1.6;">${mod.desc}</p>
                    <p style="color:var(--text-muted);font-size:0.88rem;margin-top:1rem;">
                        Esta parte ainda está sendo desenvolvida pela equipe 1 — em breve estará disponível.
                    </p>
                    <button class="btn-primary" style="margin-top:1.25rem;">Falar com o TI da escola</button>
                </div>
            `;
        },

        showModal() {
            this.modal.classList.remove('hidden');
            requestAnimationFrame(() => this.modal.classList.add('active'));
        },

        closeModal() {
            this.modal.classList.remove('active');
            setTimeout(() => this.modal.classList.add('hidden'), 280);
        },

        showToast(message, type = 'normal') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<span class="toast-icon">${this.toastIcons[type] || '💬'}</span><span>${message}</span>`;
            this.toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('fadeOut');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        },

        saveData() {
            localStorage.setItem('beep_books', JSON.stringify(this.books));
            localStorage.setItem('beep_loans', JSON.stringify(this.loans));
        }
    };

    app.init();
});
