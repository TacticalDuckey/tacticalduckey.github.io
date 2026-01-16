# 🛡️ Security Implementation - Lage Landen RP

## Overzicht Beveiligingsmaatregelen

Dit document beschrijft alle geïmplementeerde beveiligingsmaatregelen voor het sollicitatiesysteem.

---

## 1. Content Security Policy (CSP)

### Implemented in: `netlify.toml`

Beschermt tegen XSS en data injection attacks.

```
default-src 'self'
script-src 'self' 'unsafe-inline' 'unsafe-eval' 
           https://identity.netlify.com 
           https://cdnjs.cloudflare.com
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data: https://cdnjs.cloudflare.com
connect-src 'self' 
           https://discord.com 
           https://identity.netlify.com 
           https://*.netlify.app
frame-src 'self' https://identity.netlify.com
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

**Waarom unsafe-inline/unsafe-eval?**
- Netlify Identity widget vereist inline scripts
- Toekomstige versie: migreer naar nonces

---

## 2. HTTP Security Headers

### X-Content-Type-Options: nosniff
**Locatie**: `netlify.toml` + Netlify Function  
**Doel**: Voorkomt MIME-sniffing attacks  
**Waarde**: `nosniff`

### X-Frame-Options: DENY
**Locatie**: `netlify.toml` + Netlify Function  
**Doel**: Voorkomt clickjacking  
**Waarde**: `DENY` (geen embedding toegestaan)

### Strict-Transport-Security (HSTS)
**Locatie**: `netlify.toml` + Netlify Function  
**Doel**: Forceert HTTPS verbindingen  
**Waarde**: `max-age=31536000; includeSubDomains; preload`  
**Effect**: 
- 1 jaar HTTPS enforcement
- Ook voor subdomains
- Preload ready voor browser lijsten

### X-XSS-Protection
**Locatie**: `netlify.toml`  
**Doel**: Legacy XSS bescherming voor oude browsers  
**Waarde**: `1; mode=block`

### Referrer-Policy
**Locatie**: `netlify.toml` + Netlify Function  
**Doel**: Controleert welke referrer info wordt verzonden  
**Waarde**: `strict-origin-when-cross-origin`

### Permissions-Policy
**Locatie**: `netlify.toml`  
**Doel**: Beperkt browser features  
**Waarde**: Blokkeerd: geolocation, microphone, camera, payment, usb, magnetometer, gyroscope, accelerometer

---

## 3. CORS Policy (Cross-Origin Resource Sharing)

### Voor Netlify Functions

**Implemented in**: `netlify/functions/submit-sollicitatie.js`

**Whitelist**:
```javascript
const allowedOrigins = [
    'https://lagelandenrp.netlify.app',
    'https://tacticalduckey.github.io',
    'http://localhost:8888',  // Dev only
    'http://localhost:3000'   // Dev only
];
```

**Headers**:
- `Access-Control-Allow-Origin`: Alleen whitelisted domains
- `Access-Control-Allow-Methods`: `POST, OPTIONS` only
- `Access-Control-Allow-Headers`: `Content-Type` only
- `Access-Control-Max-Age`: `86400` (24 hours)

**Security checks**:
1. Origin validation voor alle POST requests
2. Method restriction (alleen POST/OPTIONS)
3. Automatic preflight handling
4. 403 Forbidden voor invalid origins

---

## 4. Environment Variables

### Gevoelige Data Opslag

**Implemented in**: Netlify Dashboard → Environment Variables

**Opgeslagen variabelen**:
- `DISCORD_WEBHOOK_URL`: Discord webhook endpoint

**Voordelen**:
- ✅ Nooit in Git repository
- ✅ Nooit in client-side code
- ✅ Alleen toegankelijk voor Netlify Functions
- ✅ Niet zichtbaar in browser
- ✅ Niet in network requests

**Toegang**:
```javascript
// Alleen server-side
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
```

---

## 5. Authentication & Authorization

### Netlify Identity

**Roles**:
- `admin`: Volledige toegang
- `staff`: Codes genereren + nakijkmodellen
- `agent`: Toetsen invullen
- `user`: Basis toegang

### Access Control

**Implemented in**: `_redirects` + `auth.js`

**Server-side protection** (`_redirects`):
```
/staff-code-generator.html    → Requires: staff, admin
/Politie/Sollicitaties/STAFF* → Requires: staff, admin
/dashboard.html               → Requires: authenticated user
```

**Client-side protection** (`auth.js`):
- Token-based authentication
- Role checking via `hasRole()`
- Auto-redirect bij unauthorized access

---

## 6. Input Validation & Sanitization

### Sollicitatie Code Verificatie

**Implemented in**: `discord-webhook-v2.js`

**Checks**:
1. Code format validation (XXX-XXX-XXX)
2. Code expiry check
3. Code usage check (single use)
4. Cooldown verification (24h per user per form type)

**Storage**: LocalStorage (client-side tracking)

### Form Data Validation

**Implemented in**: Sollicitatie HTML files

**Checks**:
1. Required field validation
2. Max length limits
3. Roblox username required
4. Access code format enforcement

---

## 7. Rate Limiting & Cooldowns

### 24-Hour Cooldown System

**Implemented in**: `discord-webhook-v2.js`

**Mechanism**:
```javascript
setCooldown(username, formType)
checkCooldown(username, formType)
```

**Storage**: LocalStorage (browser-specific)

**Limitations**:
- Per user (Roblox username)
- Per form type
- 24 hour duration
- Can be bypassed by clearing browser data (acceptable voor dit use case)

**Future enhancement**: Server-side tracking via database

---

## 8. Secure Communication

### HTTPS Enforcement

- ✅ Netlify provides free SSL/TLS certificates
- ✅ Auto-renewal
- ✅ HSTS header forceert HTTPS
- ✅ `upgrade-insecure-requests` in CSP

### API Communication

**Discord Webhook**:
- Server-side only (Netlify Function)
- HTTPS enforced
- No credentials in client code
- Error handling zonder data leakage

**Netlify Identity**:
- Official Netlify service
- JWT token authentication
- Secure cookie storage
- Auto token refresh

---

## 9. Known Limitations & Future Improvements

### Current Limitations

1. **LocalStorage voor cooldowns**: Kan omzeild worden door browser data te wissen
2. **Inline scripts**: CSP vereist `unsafe-inline` voor Netlify Identity
3. **Client-side code verification**: Codes worden client-side gevalideerd

### Planned Improvements

1. **Database voor cooldowns**: Migreren naar Netlify/Supabase database
2. **CSP Nonces**: Vervang `unsafe-inline` met nonce-based approach
3. **Server-side code verification**: Move validation naar Netlify Function
4. **Rate limiting**: IP-based rate limiting toevoegen
5. **Audit logging**: Log alle submissions server-side

---

## 10. Security Checklist

### ✅ Implemented

- [x] Content Security Policy
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] Strict-Transport-Security (HSTS)
- [x] Restrictive CORS policy
- [x] Environment variables voor secrets
- [x] Input validation
- [x] Access code system
- [x] 24h cooldown
- [x] Role-based access control
- [x] HTTPS enforcement
- [x] Referrer-Policy
- [x] Permissions-Policy

### 🔄 Future Enhancements

- [ ] CSP nonces (replace unsafe-inline)
- [ ] Server-side cooldown tracking
- [ ] IP-based rate limiting
- [ ] Audit logging
- [ ] Two-factor authentication
- [ ] Automated security scanning
- [ ] Penetration testing

---

## 11. Incident Response

### Als er een security issue wordt ontdekt:

1. **Stop submission processing**: Schakel webhook uit via environment variable
2. **Revoke active codes**: Via staff dashboard
3. **Clear cooldowns**: Als nodig via LocalStorage
4. **Update code**: Fix vulnerability
5. **Redeploy**: Via Netlify
6. **Notify users**: Via Discord

### Contact

- **Admin**: Via Netlify Dashboard
- **Technical**: GitHub Issues
- **Emergency**: Discord admin contact

---

## 12. Compliance & Standards

### Followed Standards

- OWASP Security Headers
- OWASP CSP Cheat Sheet
- RFC 6797 (HSTS)
- W3C Content Security Policy
- Mozilla Security Guidelines

### Resources

- [OWASP Security Headers](https://owasp.org/www-community/Security_Headers)
- [CSP Guide](https://content-security-policy.com/)
- [Mozilla Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)

---

**Last Updated**: January 16, 2026  
**Version**: 2.0  
**Maintained by**: Lage Landen RP Technical Team
