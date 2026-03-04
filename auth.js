// Netlify Identity Authentication Handler
// Dit bestand beheert alle login/registratie functionaliteit

class NetlifyAuth {
    constructor() {
        this.user = null;
        this._initialized = false;
        this._initCallbacks = [];
        this.init();
    }

    init() {
        // Wacht tot Netlify Identity widget is geladen
        if (window.netlifyIdentity) {
            this.setupIdentity();
        } else {
            window.addEventListener('netlifyIdentity:init', () => this.setupIdentity());
        }
    }

    // Voer callback uit zodra identity geïnitialiseerd is (of direct als al klaar)
    onReady(callback) {
        if (this._initialized) {
            callback(this.user);
        } else {
            this._initCallbacks.push(callback);
        }
    }

    _runInitCallbacks() {
        this._initCallbacks.forEach(cb => cb(this.user));
        this._initCallbacks = [];
    }

    setupIdentity() {
        const netlifyIdentity = window.netlifyIdentity;

        // Event listeners
        netlifyIdentity.on('init', user => {
            this.user = user;
            this._initialized = true;
            this.updateUI();
            this._runInitCallbacks();

            // Als gebruiker al ingelogd is en op login pagina zit, redirect weg
            const path = window.location.pathname;
            if (user && (path.endsWith('/login.html') || path === '/login')) {
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect') || '/dashboard.html';
                window.location.href = redirect;
            }
        });

        netlifyIdentity.on('login', user => {
            this.user = user;
            this._initialized = true;
            this.updateUI();
            netlifyIdentity.close();

            // Redirect naar de oorspronkelijke pagina of dashboard na login
            const urlParams = new URLSearchParams(window.location.search);
            const redirect = urlParams.get('redirect') || '/dashboard.html';
            window.location.href = redirect;
        });

        netlifyIdentity.on('logout', () => {
            if (this._loggingOut) return; // voorkom dubbele logout events
            this._loggingOut = true;
            this.user = null;
            this.updateUI();

            // Alleen redirecten als je NIET al op index bent
            const path = window.location.pathname;
            if (!path.endsWith('/index.html') && path !== '/' && path !== '') {
                window.location.href = '/index.html';
            } else {
                this._loggingOut = false; // reset voor eventueel opnieuw inloggen
            }
        });

        netlifyIdentity.on('error', err => console.error('Identity Error:', err));
    }

    updateUI() {
        // Update login/logout buttons
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const userInfo = document.getElementById('user-info');

        if (this.user) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (userInfo) {
                const role = this.getUserRole();
                userInfo.innerHTML = `
                    <span class="user-name">${this.user.user_metadata?.full_name || this.user.email}</span>
                    <span class="user-role ${role}">${this.getRoleDisplay(role)}</span>
                `;
                userInfo.style.display = 'flex';
            }
        } else {
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'none';
        }
    }

    getUserRole() {
        if (!this.user) return 'guest';
        
        const roles = this.user.app_metadata?.roles || [];
        
        if (roles.includes('admin')) return 'admin';
        if (roles.includes('dsi')) return 'dsi';
        if (roles.includes('staff')) return 'staff';
        if (roles.includes('brandweer')) return 'brandweer';
        if (roles.includes('agent')) return 'agent';
        
        return 'user';
    }

    getRoleDisplay(role) {
        const roleNames = {
            'admin': '👑 Administrator',
            'dsi': '🔒 DSI Operator',
            'staff': '⭐ Staff',
            'brandweer': '🚒 Brandweer',
            'agent': '🚔 Agent',
            'user': '👤 Gebruiker',
            'guest': '🔒 Niet ingelogd'
        };
        return roleNames[role] || roleNames.user;
    }

    hasRole(requiredRoles) {
        const userRole = this.getUserRole();
        
        // Admin heeft altijd toegang
        if (userRole === 'admin') return true;
        
        // Check of gebruiker een van de vereiste rollen heeft
        return requiredRoles.includes(userRole);
    }

    requireAuth(requiredRoles = []) {
        // Wacht tot identity geïnitialiseerd is zodat we niet te vroeg redirecten
        this.onReady((user) => {
            if (!user) {
                // Niet ingelogd - redirect naar login met terugkeer URL
                window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
                return;
            }

            if (requiredRoles.length > 0 && !this.hasRole(requiredRoles)) {
                // Geen juiste rol - toon error
                this.showAccessDenied();
            }
        });
    }

    showAccessDenied() {
        document.body.innerHTML = `
            <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; 
                        background: linear-gradient(135deg, #0a1628 0%, #1a2642 100%);">
                <div style="text-align: center; color: white; padding: 3rem;">
                    <h1 style="font-size: 4rem; margin-bottom: 1rem;">🚫</h1>
                    <h2 style="font-size: 2rem; margin-bottom: 1rem;">Toegang Geweigerd</h2>
                    <p style="font-size: 1.2rem; opacity: 0.8; margin-bottom: 2rem;">
                        Je hebt niet de juiste rechten om deze pagina te bekijken.
                    </p>
                    <a href="/index.html" style="display: inline-block; padding: 1rem 2rem; 
                       background: #0047ab; color: white; text-decoration: none; border-radius: 8px;">
                        Terug naar home
                    </a>
                </div>
            </div>
        `;
    }

    login() {
        window.netlifyIdentity.open('login');
    }

    signup() {
        window.netlifyIdentity.open('signup');
    }

    logout() {
        window.netlifyIdentity.logout();
    }
}

// Globale auth instance
const auth = new NetlifyAuth();
