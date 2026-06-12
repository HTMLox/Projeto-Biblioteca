/**
 * BiblioEEEP — Módulo de Autenticação
 * Senha hasheada com SHA-256 (Web Crypto API nativa)
 * Sessão com token seguro e expiração automática
 */

const BiblioAuth = (() => {
    const SESSION_KEY   = 'beep_session_token';
    const SESSION_HOURS = 8; // horas até expirar

    // ─── Hash de senha com SHA-256 (Web Crypto nativa) ─────────────────────────
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const salt    = 'BiblioEEEP_2026_'; // salt fixo (para app escolar sem backend)
        const data    = encoder.encode(salt + password);
        const hash    = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // ─── Gerar token de sessão seguro ───────────────────────────────────────────
    function generateToken() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ─── Login ──────────────────────────────────────────────────────────────────
    async function login(credential, password) {
        const user = await BiblioDb.users.findByCredential(credential);

        if (!user) {
            return { ok: false, message: 'Usuário não encontrado. Verifique o e-mail ou matrícula.' };
        }

        const hash = await hashPassword(password);
        if (hash !== user.passwordHash) {
            return { ok: false, message: 'Senha incorreta. Tente novamente.' };
        }

        if (!user.approved && user.role !== 'aluno') {
            return { ok: false, message: 'Sua conta ainda aguarda aprovação da bibliotecária.' };
        }

        // Criar sessão
        const token     = generateToken();
        const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
        await BiblioDb.sessions.create(token, user.id, expiresAt);
        localStorage.setItem(SESSION_KEY, token);

        // Registrar atividade
        await BiblioDb.activities.log(user.id, `${user.name} fez login no sistema.`, 'normal');

        return { ok: true, user };
    }

    // ─── Registro ───────────────────────────────────────────────────────────────
    async function register({ name, email, matricula, role, password }) {
        // Validações
        if (password.length < 6) {
            return { ok: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
        }

        const existingEmail = await BiblioDb.users.getByEmail(email);
        if (existingEmail) {
            return { ok: false, message: 'Este e-mail já está cadastrado.' };
        }

        const existingMat = await BiblioDb.users.getByMatricula(matricula);
        if (existingMat) {
            return { ok: false, message: 'Esta matrícula já está em uso.' };
        }

        const passwordHash = await hashPassword(password);
        const approved     = role === 'aluno'; // alunos entram aprovados; monitores precisam de OK

        const user = await BiblioDb.users.create({
            name, email: email.toLowerCase(), matricula,
            role, passwordHash, approved
        });

        await BiblioDb.activities.log(user.id, `Nova conta criada: ${name} (${role}).`, 'normal');

        return { ok: true, user };
    }

    // ─── Verificar sessão ativa ─────────────────────────────────────────────────
    async function checkSession() {
        const token = localStorage.getItem(SESSION_KEY);
        if (!token) return null;

        try {
            const session = await BiblioDb.sessions.get(token);
            if (!session) { localStorage.removeItem(SESSION_KEY); return null; }

            if (session.expiresAt < Date.now()) {
                await BiblioDb.sessions.delete(token);
                localStorage.removeItem(SESSION_KEY);
                return null;
            }

            const user = await BiblioDb.users.getById(session.userId);
            return user || null;
        } catch {
            return null;
        }
    }

    // ─── Logout ─────────────────────────────────────────────────────────────────
    async function logout(userId) {
        const token = localStorage.getItem(SESSION_KEY);
        if (token) {
            try { await BiblioDb.sessions.delete(token); } catch {}
        }
        localStorage.removeItem(SESSION_KEY);
        if (userId) {
            const user = await BiblioDb.users.getById(userId);
            if (user) await BiblioDb.activities.log(userId, `${user.name} saiu do sistema.`, 'normal');
        }
    }

    // ─── Alterar senha ───────────────────────────────────────────────────────────
    async function changePassword(userId, currentPass, newPass) {
        const user = await BiblioDb.users.getById(userId);
        if (!user) return { ok: false, message: 'Usuário não encontrado.' };

        const currentHash = await hashPassword(currentPass);
        if (currentHash !== user.passwordHash) {
            return { ok: false, message: 'Senha atual incorreta.' };
        }

        if (newPass.length < 6) {
            return { ok: false, message: 'Nova senha deve ter pelo menos 6 caracteres.' };
        }

        const newHash = await hashPassword(newPass);
        await BiblioDb.users.update({ ...user, passwordHash: newHash });
        return { ok: true };
    }

    // ─── Verificar força da senha ────────────────────────────────────────────────
    function passwordStrength(password) {
        let score = 0;
        if (password.length >= 6)  score++;
        if (password.length >= 10) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        const levels = ['', 'Muito fraca', 'Fraca', 'Média', 'Boa', 'Forte'];
        const colors = ['', '#dc2626', '#f97316', '#eab308', '#3b82f6', '#16a34a'];
        return {
            score,
            label: levels[score] || 'Fraca',
            color: colors[score] || '#dc2626',
            percent: Math.round((score / 5) * 100)
        };
    }

    // ─── Roles e permissões ──────────────────────────────────────────────────────
    const ROLES = {
        bibliotecaria: { label: 'Bibliotecária', canManageBooks: true,  canManageLoans: true,  canManageUsers: true,  canViewAdmin: true  },
        monitor:       { label: 'Monitor(a)',     canManageBooks: true,  canManageLoans: true,  canManageUsers: false, canViewAdmin: false },
        aluno:         { label: 'Leitor(a)',       canManageBooks: false, canManageLoans: false, canManageUsers: false, canViewAdmin: false }
    };

    function getPermissions(role) {
        return ROLES[role] || ROLES.aluno;
    }

    function can(user, permission) {
        if (!user) return false;
        const perms = getPermissions(user.role);
        return perms[permission] === true;
    }

    return {
        login, register, logout, checkSession,
        hashPassword, changePassword, passwordStrength,
        getPermissions, can, ROLES
    };
})();

window.BiblioAuth = BiblioAuth;
