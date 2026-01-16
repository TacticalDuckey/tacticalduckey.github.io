// Netlify Identity Authentication Handler
// Dit bestand beheert alle login/registratie functionaliteit

class NetlifyAuth {
    constructor() {
        this.user = null;
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

    setupIdentity() {
        const netlifyIdentity = window.netlifyIdentity;

        // Check of gebruiker al is ingelogd
        this.user = netlifyIdentity.currentUser();
        this.updateUI();

        // Event listeners
        netlifyIdentity.on('init', user => {
            this.user = user;
            this.updateUI();
        });

        netlifyIdentity.on('login', user => {
            this.user = user;
            this.updateUI();
            netlifyIdentity.close();
            
            // Redirect naar dashboard na login
            if (window.location.pathname === '/login.html') {
                window.location.href = '/dashboard.html';
            }
        });

        netlifyIdentity.on('logout', () => {
            this.user = null;
            this.updateUI();
            window.location.href = '/index.html';
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
        if (roles.includes('agent')) return 'agent';
        
        return 'user';
    }

    getRoleDisplay(role) {
        const roleNames = {
            'admin': '👑 Administrator',
            'dsi': '🔒 DSI Operator',
            'staff': '⭐ Staff',
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
        if (!this.user) {
            // Niet ingelogd - redirect naar login
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }

        if (requiredRoles.length > 0 && !this.hasRole(requiredRoles)) {
            // Geen juiste rol - toon error
            this.showAccessDenied();
            return false;
        }

        return true;
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
