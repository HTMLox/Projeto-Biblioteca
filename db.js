/**
 * BiblioEEEP — Motor de Banco de Dados
 * Usa IndexedDB nativo do navegador (sem dependências externas)
 * Versão: 2.0
 */

const BiblioDb = (() => {
    const DB_NAME = 'BiblioEEEP';
    const DB_VERSION = 2;
    let db = null;

    // Schema das stores (tabelas)
    const STORES = {
        users:      { keyPath: 'id', autoIncrement: true },
        books:      { keyPath: 'id', autoIncrement: true },
        loans:      { keyPath: 'id', autoIncrement: true },
        activities: { keyPath: 'id', autoIncrement: true },
        publishers: { keyPath: 'id', autoIncrement: true },
        sessions:   { keyPath: 'token' },
        settings:   { keyPath: 'key' }
    };

    // Índices para busca eficiente
    const INDEXES = {
        users:   [
            { name: 'email',     keyPath: 'email',     unique: true  },
            { name: 'matricula', keyPath: 'matricula', unique: true  },
            { name: 'role',      keyPath: 'role',      unique: false }
        ],
        books:   [
            { name: 'title',  keyPath: 'title',  unique: false },
            { name: 'genre',  keyPath: 'genre',  unique: false },
            { name: 'status', keyPath: 'status', unique: false }
        ],
        loans:   [
            { name: 'userId',  keyPath: 'userId',  unique: false },
            { name: 'bookId',  keyPath: 'bookId',  unique: false },
            { name: 'status',  keyPath: 'status',  unique: false }
        ],
        activities: [
            { name: 'userId', keyPath: 'userId', unique: false },
            { name: 'type',   keyPath: 'type',   unique: false }
        ],
        sessions: []
    };

    // ─── Abrir banco ────────────────────────────────────────────────────────────
    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const idb = e.target.result;
                const tx  = e.target.transaction;

                Object.entries(STORES).forEach(([name, opts]) => {
                    let store;
                    if (!idb.objectStoreNames.contains(name)) {
                        store = idb.createObjectStore(name, opts);
                    } else {
                        store = tx.objectStore(name);
                    }
                    (INDEXES[name] || []).forEach(idx => {
                        if (!store.indexNames.contains(idx.name)) {
                            store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
                        }
                    });
                });
            };

            req.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            req.onerror = () => reject(req.error);
        });
    }

    // ─── Helpers de transação ───────────────────────────────────────────────────
    function tx(storeName, mode = 'readonly') {
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    function promisify(req) {
        return new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror   = () => rej(req.error);
        });
    }

    // ─── CRUD genérico ──────────────────────────────────────────────────────────
    async function add(store, data) {
        await open();
        const obj = { ...data, createdAt: data.createdAt || new Date().toISOString() };
        const id  = await promisify(tx(store, 'readwrite').add(obj));
        return { ...obj, id };
    }

    async function put(store, data) {
        await open();
        const obj = { ...data, updatedAt: new Date().toISOString() };
        await promisify(tx(store, 'readwrite').put(obj));
        return obj;
    }

    async function remove(store, id) {
        await open();
        await promisify(tx(store, 'readwrite').delete(id));
        return true;
    }

    async function getById(store, id) {
        await open();
        return promisify(tx(store).get(id));
    }

    async function getAll(store) {
        await open();
        return promisify(tx(store).getAll());
    }

    async function getByIndex(store, indexName, value) {
        await open();
        return promisify(tx(store).index(indexName).getAll(value));
    }

    async function getOneByIndex(store, indexName, value) {
        await open();
        return promisify(tx(store).index(indexName).get(value));
    }

    async function count(store) {
        await open();
        return promisify(tx(store).count());
    }

    // ─── API de Usuários ────────────────────────────────────────────────────────
    const users = {
        create: (data)          => add('users', data),
        update: (data)          => put('users', data),
        delete: (id)            => remove('users', id),
        getById: (id)           => getById('users', id),
        getAll: ()              => getAll('users'),
        getByEmail: (email)     => getOneByIndex('users', 'email', email.toLowerCase()),
        getByMatricula: (mat)   => getOneByIndex('users', 'matricula', mat),
        getByRole: (role)       => getByIndex('users', 'role', role),
        count: ()               => count('users'),

        // Busca por email OU matrícula (para login flexível)
        async findByCredential(credential) {
            const byEmail = await this.getByEmail(credential.toLowerCase());
            if (byEmail) return byEmail;
            return this.getByMatricula(credential);
        }
    };

    // ─── API de Livros ──────────────────────────────────────────────────────────
    const books = {
        create: (data)      => add('books', data),
        update: (data)      => put('books', data),
        delete: (id)        => remove('books', id),
        getById: (id)       => getById('books', id),
        getAll: ()          => getAll('books'),
        getByStatus: (s)    => getByIndex('books', 'status', s),
        getByGenre: (g)     => getByIndex('books', 'genre', g),
        count: ()           => count('books'),

        async search(query) {
            const all = await this.getAll();
            const q   = query.toLowerCase();
            return all.filter(b =>
                b.title.toLowerCase().includes(q)  ||
                b.author.toLowerCase().includes(q) ||
                b.genre.toLowerCase().includes(q)
            );
        },

        async getGenres() {
            const all    = await this.getAll();
            const genres = [...new Set(all.map(b => b.genre))].sort();
            return genres;
        }
    };

    // ─── API de Empréstimos ─────────────────────────────────────────────────────
    const loans = {
        create: (data)    => add('loans', data),
        update: (data)    => put('loans', data),
        delete: (id)      => remove('loans', id),
        getById: (id)     => getById('loans', id),
        getAll: ()        => getAll('loans'),
        getByStatus: (s)  => getByIndex('loans', 'status', s),
        getByUser: (uid)  => getByIndex('loans', 'userId', uid),
        count: ()         => count('loans'),

        async getWithDetails() {
            const all = await this.getAll();
            // Enriquece cada empréstimo com dados do livro e usuário
            const enriched = await Promise.all(all.map(async loan => {
                const book = await books.getById(loan.bookId);
                const user = await users.getById(loan.userId);
                return {
                    ...loan,
                    bookTitle:  book?.title || loan.bookTitle || '—',
                    bookAuthor: book?.author || '—',
                    userName:   user?.name  || loan.userName || '—'
                };
            }));
            return enriched;
        },

        async checkOverdue() {
            const active = await this.getByStatus('active');
            const today  = new Date(); today.setHours(0, 0, 0, 0);
            let changed  = 0;
            for (const loan of active) {
                const deadline = new Date(loan.deadlineISO);
                if (deadline < today) {
                    await this.update({ ...loan, status: 'late' });
                    changed++;
                }
            }
            return changed;
        }
    };

    // ─── API de Atividades ──────────────────────────────────────────────────────
    const activities = {
        log: (userId, text, type = 'normal') =>
            add('activities', { userId, text, type }),
        getAll: () => getAll('activities'),
        getRecent: async (n = 20) => {
            const all = await getAll('activities');
            return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, n);
        },
        count: () => count('activities')
    };

    // ─── API de Editoras ────────────────────────────────────────────────────────
    const publishers = {
        create: (data) => add('publishers', data),
        update: (data) => put('publishers', data),
        delete: (id)   => remove('publishers', id),
        getAll: ()     => getAll('publishers'),
        count: ()      => count('publishers')
    };

    // ─── API de Sessões ─────────────────────────────────────────────────────────
    const sessions = {
        create: (token, userId, expiresAt) =>
            put('sessions', { token, userId, expiresAt }),
        get: (token)   => getById('sessions', token),
        delete: (token) => remove('sessions', token),

        async cleanup() {
            const all  = await getAll('sessions');
            const now  = Date.now();
            const dead = all.filter(s => s.expiresAt < now);
            await Promise.all(dead.map(s => this.delete(s.token)));
        }
    };

    // ─── API de Settings ────────────────────────────────────────────────────────
    const settings = {
        get: async (key, fallback = null) => {
            await open();
            const r = await promisify(tx('settings').get(key));
            return r ? r.value : fallback;
        },
        set: async (key, value) => {
            await open();
            await promisify(tx('settings', 'readwrite').put({ key, value }));
        }
    };

    // ─── Seed: dados iniciais ────────────────────────────────────────────────────
    async function seed() {
        const seeded = await settings.get('seeded_v2', false);
        if (seeded) return;

        console.log('[BiblioDb] Populando banco de dados...');

        // Usuários padrão
        const { hashPassword } = window.BiblioAuth || {};
        const hash = hashPassword ? hashPassword : async (p) => p; // fallback

        const defaultUsers = [
            { name: 'Juliana Alves', email: 'juliana@escola.ce', matricula: 'ADM001', role: 'bibliotecaria', passwordHash: await hash('admin123'), approved: true },
            { name: 'Carlos Monitor', email: 'monitor@escola.ce', matricula: 'MON001', role: 'monitor', passwordHash: await hash('monitor123'), approved: true },
            { name: 'Ana Aluna', email: 'aluno@escola.ce', matricula: 'ALU001', role: 'aluno', passwordHash: await hash('aluno123'), approved: true }
        ];
        for (const u of defaultUsers) {
            try { await users.create(u); } catch(e) { /* já existe */ }
        }

        // Livros padrão
        const defaultBooks = [
            { title: 'Dom Casmurro',        author: 'Machado de Assis',    genre: 'Lit. Brasileira', status: 'available', stock: 3, year: 1899, publisher: 'Garnier' },
            { title: 'Vidas Secas',          author: 'Graciliano Ramos',    genre: 'Lit. Brasileira', status: 'available', stock: 2, year: 1938, publisher: 'José Olympio' },
            { title: 'O Cortiço',            author: 'Aluísio Azevedo',     genre: 'Romance',         status: 'available', stock: 1, year: 1890, publisher: 'Garnier' },
            { title: 'A Hora da Estrela',    author: 'Clarice Lispector',   genre: 'Romance',         status: 'available', stock: 4, year: 1977, publisher: 'Rocco' },
            { title: 'Capitães da Areia',    author: 'Jorge Amado',         genre: 'Lit. Brasileira', status: 'available', stock: 2, year: 1937, publisher: 'Record' },
            { title: 'Física Moderna',       author: 'Eisberg & Resnick',   genre: 'Ciências',        status: 'available', stock: 1, year: 2000, publisher: 'Campus' },
            { title: 'História da Arte',     author: 'Ernst Gombrich',      genre: 'Artes',           status: 'available', stock: 2, year: 1950, publisher: 'LTC' },
            { title: 'Matemática Básica',    author: 'Gelson Iezzi',        genre: 'Matemática',      status: 'available', stock: 5, year: 2013, publisher: 'Saraiva' },
            { title: 'O Alquimista',         author: 'Paulo Coelho',        genre: 'Romance',         status: 'available', stock: 3, year: 1988, publisher: 'Rocco' },
            { title: 'Filosofia Moderna',    author: 'Bertrand Russell',    genre: 'Filosofia',       status: 'available', stock: 2, year: 1945, publisher: 'Nacional' }
        ];
        for (const b of defaultBooks) {
            try { await books.create(b); } catch(e) {}
        }

        // Editoras padrão
        const defaultPublishers = [
            { name: 'Editora Saraiva',   contact: 'contato@saraiva.com.br',   city: 'São Paulo' },
            { name: 'Editora Ática',     contact: 'atendimento@atica.com.br', city: 'São Paulo' },
            { name: 'FTD Educação',      contact: 'ftd@ftd.com.br',           city: 'São Paulo' },
            { name: 'Paz e Terra',       contact: 'paze@terra.com.br',        city: 'Rio de Janeiro' },
            { name: 'Editora Rocco',     contact: 'rocco@rocco.com.br',       city: 'Rio de Janeiro' }
        ];
        for (const p of defaultPublishers) {
            try { await publishers.create(p); } catch(e) {}
        }

        // Atividade inicial
        await activities.log(null, 'Sistema Biblio EEEP iniciado com dados padrão.', 'normal');

        await settings.set('seeded_v2', true);
        console.log('[BiblioDb] Banco de dados populado com sucesso!');
    }

    // ─── Estatísticas gerais ─────────────────────────────────────────────────────
    async function getStats() {
        const [totalBooks, totalUsers, activeLoans, lateLoans] = await Promise.all([
            books.count(),
            users.count(),
            loans.getByStatus('active').then(r => r.length),
            loans.getByStatus('late').then(r => r.length)
        ]);
        const availableBooks = (await books.getByStatus('available')).length;
        return { totalBooks, totalUsers, activeLoans, lateLoans, availableBooks };
    }

    // ─── Export de dados (backup) ─────────────────────────────────────────────────
    async function exportAll() {
        const [allBooks, allLoans, allUsers, allActivities, allPublishers] = await Promise.all([
            books.getAll(), loans.getAll(), users.getAll(),
            activities.getAll(), publishers.getAll()
        ]);
        // Remove hashes de senha do export
        const safeUsers = allUsers.map(u => ({ ...u, passwordHash: '[OCULTO]' }));
        return {
            exportedAt: new Date().toISOString(),
            version: DB_VERSION,
            books: allBooks, loans: allLoans, users: safeUsers,
            activities: allActivities, publishers: allPublishers
        };
    }

    // ─── Inicialização pública ───────────────────────────────────────────────────
    async function init() {
        await open();
        await seed();
        await loans.checkOverdue();
        console.log('[BiblioDb] Banco de dados pronto.');
        return true;
    }

    return {
        init, open, getStats, exportAll, seed,
        users, books, loans, activities, publishers, sessions, settings
    };
})();

window.BiblioDb = BiblioDb;
