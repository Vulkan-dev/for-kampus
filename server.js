const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  PageBreak,
  UnderlineType
} = require('docx');
const { PDFParse } = require('pdf-parse');
const AdmZip = require('adm-zip');

// Optional zero-dependency .env loader
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn('Could not parse .env file:', e);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Authentication Configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MegaMall@Kampus2026!';
const KERNEL_ADMIN_USER = process.env.KERNEL_ADMIN_USER || 'Admin@kernel';
const KERNEL_ADMIN_PASS = process.env.KERNEL_ADMIN_PASS || 'kernelx2026@1';
const RENTS_PASSWORD = process.env.RENTS_PASSWORD || 'MegaMall@Rent2026!';
const REMINDERS_PASSWORD = process.env.REMINDERS_PASSWORD || 'MegaMall@Reminder2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'MegaMall_SuperSecret_Cryptographic_Key_2026_Corporate#991!';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_JSON_PATH = path.join(DATA_DIR, 'users.json');
const PROJECT_STATE_PATH = path.join(DATA_DIR, 'project_state.json');
const RENTS_DB_PATH = path.join(DATA_DIR, 'rents_database.json');

// Ensure private data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readRentsDatabase() {
  const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
  return { updatedAt: null, months: standardMonths, totalRecords: 0, records: [] };
}

function writeRentsDatabaseAtomic(data) {
  // Rent records are confidential and kept exclusively in client-side localStorage.
  // No records are persisted to server disk or database.
  return;
}

// Password hashing helper
function hashPassword(password, salt = 'MegaMall_Salt_2026') {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// Multi-User Credential Storage Helpers
function initializeUsersDatabase() {
  if (!fs.existsSync(USERS_JSON_PATH)) {
    const defaultUsers = [
      {
        id: 'usr_root_admin',
        username: ADMIN_USERNAME,
        passwordHash: hashPassword(ADMIN_PASSWORD),
        role: 'Administrator',
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(defaultUsers, null, 2), 'utf-8');
  }
}
initializeUsersDatabase();

function readUsersDatabase() {
  try {
    if (!fs.existsSync(USERS_JSON_PATH)) {
      initializeUsersDatabase();
    }
    const data = fs.readFileSync(USERS_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.map(u => ({ ...u, tokenVersion: u.tokenVersion || 1 }));
  } catch (err) {
    console.error('Error reading users database:', err);
    return [
      {
        id: 'usr_root_admin',
        username: ADMIN_USERNAME,
        passwordHash: hashPassword(ADMIN_PASSWORD),
        role: 'Administrator',
        tokenVersion: 1,
        createdAt: new Date().toISOString()
      }
    ];
  }
}

function writeUsersDatabaseAtomic(users) {
  const tempPath = `${USERS_JSON_PATH}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(users, null, 2), 'utf-8');
  fs.renameSync(tempPath, USERS_JSON_PATH);
}

// Persistent Project & Invoice Database
function getDefaultProjectState() {
  return {
    occupier: "FALAKNAZ SPRINGS,",
    location: "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,",
    ntn: "C951537",
    startMonth: "2024-01",
    endMonth: "2026-07",
    invPrefix: "#INV-",
    invStartNum: 3001,
    invSuffix: "-051026",
    autoSuffixYear: false,
    includePrevBalance: false,
    prevBalanceMode: "zero",
    openingBalance: 0,
    yearRates: {
      "2024": { rate: 1.25, gallons: 53759 },
      "2025": { rate: 1.25, gallons: 137788, overrides: { "2025-12": 99725 } },
      "2026": { rate: 1.25, gallons: 137788 }
    },
    tableColumns: [
      { id: 'gallons', label: 'CONSUMPTION GALLON', widthPct: 26.12, type: 'number', isDefault: true },
      { id: 'rate', label: 'RATE PER\nGALLON', widthPct: 16.46, type: 'number', step: '0.01', isDefault: true },
      { id: 'billAmount', label: 'BILL\nAMOUNT', widthPct: 19.14, type: 'currency', isDefault: true },
      { id: 'previous', label: 'PREVIOUS', widthPct: 18.94, type: 'currency', isDefault: true },
      { id: 'totalPayable', label: 'TOTAL PAYABLE', widthPct: 19.34, type: 'currency', isDefault: true }
    ],
    manualCorrections: {},
    updatedAt: new Date().toISOString()
  };
}

function readProjectStateDatabase() {
  try {
    if (!fs.existsSync(PROJECT_STATE_PATH)) {
      const def = getDefaultProjectState();
      writeProjectStateDatabaseAtomic(def);
      return def;
    }
    const data = fs.readFileSync(PROJECT_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed;
  } catch (err) {
    console.error('Error reading project state database:', err);
    return getDefaultProjectState();
  }
}

function writeProjectStateDatabaseAtomic(state) {
  const tempPath = `${PROJECT_STATE_PATH}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tempPath, PROJECT_STATE_PATH);
}

function normalizeMonthNames(str) {
  if (!str) return "";
  return str
    .replace(/\bMar\b/gi, "March")
    .replace(/\bApr\b/gi, "April")
    .replace(/\bJun\b/gi, "June")
    .replace(/\bJul\b/gi, "July");
}

// Security Headers & Cache Control
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  next();
});

// Body parser with 50mb limit for uploads & exports
app.use(express.json({ limit: '50mb' }));

// Serve public static assets (confidential files NOT in public)
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

// ==========================================================
// In-Memory Rate Limiter (Brute-force & DDoS Protection)
// ==========================================================
const loginAttempts = new Map(); // IP -> { count, firstAttempt, lockedUntil }
const apiRequests = new Map();   // IP -> { count, resetTime }

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minute lock

const API_MAX_REQUESTS = 180;
const API_WINDOW_MS = 60 * 1000; // 1 minute

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many failed login attempts. Access is temporarily locked for this IP.`,
      remainingSeconds,
      lockedUntil: record.lockedUntil
    });
  }

  // Reset window if expired
  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    record.count = 0;
    record.firstAttempt = now;
  }

  loginAttempts.set(ip, record);
  req.loginRateRecord = record;
  next();
}

// Public rate limit status query
app.get('/api/auth/ratelimit-status', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return res.json({
      locked: true,
      remainingSeconds,
      lockedUntil: record.lockedUntil
    });
  }
  res.json({ locked: false, remainingSeconds: 0, lockedUntil: 0 });
});

function globalApiRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = apiRequests.get(ip) || { count: 0, resetTime: now + API_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + API_WINDOW_MS;
  } else {
    record.count++;
  }

  apiRequests.set(ip, record);

  if (record.count > API_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Too many requests. Please slow down.'
    });
  }

  next();
}

// Clean up rate limiter tables every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts.entries()) {
    if (rec.lockedUntil <= now && (now - rec.firstAttempt > LOGIN_WINDOW_MS)) {
      loginAttempts.delete(ip);
    }
  }
  for (const [ip, rec] of apiRequests.entries()) {
    if (now > rec.resetTime) {
      apiRequests.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// ==========================================================
// Cryptographic Token Helpers (HMAC-SHA256)
// ==========================================================
function generateToken(payload) {
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Payload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

// Strong Authentication Middleware with Realtime Revocation Check
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Access Denied: Authentication token required.'
    });
  }

  const token = authHeader.substring(7).trim();
  const verifiedUser = verifyToken(token);

  if (!verifiedUser) {
    return res.status(401).json({
      error: 'Session Expired: Please log in again.'
    });
  }

  // Master KernelX Admin tokens are always authorized
  if (verifiedUser.isKernelAdmin) {
    req.user = verifiedUser;
    return next();
  }

  // Realtime Live Database Verification: Check if user account still exists
  const users = readUsersDatabase();
  const matchedUser = users.find(u => 
    (verifiedUser.userId && u.id === verifiedUser.userId) || 
    u.username.toLowerCase() === verifiedUser.username.toLowerCase()
  );

  if (!matchedUser) {
    return res.status(401).json({
      error: 'Account Revoked: Your account has been removed by administrator. You have been logged out.',
      revoked: true
    });
  }

  // Check if credentials or tokenVersion were changed
  const currentVersion = matchedUser.tokenVersion || 1;
  const userVersion = verifiedUser.tokenVersion || 1;
  if (currentVersion !== userVersion) {
    return res.status(401).json({
      error: 'Credentials Updated: Your password or privileges have changed. Please log in again.',
      revoked: true
    });
  }

  req.user = matchedUser;
  next();
}

// Middleware: require administrator role
function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'Administrator' && !req.user.isKernelAdmin)) {
    return res.status(403).json({ error: 'Administrative privilege required.' });
  }
  next();
}

// ==========================================================
// KernelX Master Admin Authentication & Management
// ==========================================================
function requireKernelAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'KernelX Master authentication required.' });
  }

  const token = authHeader.substring(7).trim();
  const verifiedUser = verifyToken(token);

  if (!verifiedUser || !verifiedUser.isKernelAdmin) {
    return res.status(401).json({ error: 'Unauthorized: KernelX Master credentials required.' });
  }

  req.kernelUser = verifiedUser;
  next();
}

// ==========================================================
// Rents Portal Authentication Middleware
// ==========================================================
function requireRentsAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Rents authentication token required.' });
  }

  const verified = verifyToken(token);
  if (!verified || (!verified.isRentsAdmin && !verified.isKernelAdmin && verified.role !== 'Administrator')) {
    return res.status(401).json({ error: 'Session Expired or Unauthorized: Please log into the Rents portal again.' });
  }

  req.rentsUser = verified;
  next();
}

// ==========================================================
// Reminders Portal Authentication Middleware
// ==========================================================
function requireRemindersAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Reminders authentication token required.' });
  }

  const verified = verifyToken(token);
  if (!verified || (!verified.isRemindersAdmin && !verified.isKernelAdmin && verified.role !== 'Administrator')) {
    return res.status(401).json({ error: 'Session Expired or Unauthorized: Please log into the Reminders portal again.' });
  }

  req.remindersUser = verified;
  next();
}

// KernelX Login Endpoint
app.post('/api/kernelx/login', loginRateLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  if (!username || !password) {
    return res.status(400).json({ error: 'Admin ID and Password are required.' });
  }

  const inputUser = username.trim().toLowerCase();
  const targetUser = KERNEL_ADMIN_USER.toLowerCase();

  if (inputUser === targetUser && password.trim() === KERNEL_ADMIN_PASS) {
    loginAttempts.delete(ip);
    const token = generateToken({
      username: KERNEL_ADMIN_USER,
      isKernelAdmin: true,
      role: 'Master Administrator',
      exp: Date.now() + 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      user: {
        username: KERNEL_ADMIN_USER,
        role: 'Master Administrator'
      }
    });
  }

  const record = req.loginRateRecord || { count: 0 };
  record.count++;
  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    loginAttempts.set(ip, record);
    const remainingSeconds = Math.ceil(LOGIN_LOCKOUT_MS / 1000);
    return res.status(429).json({
      error: `Maximum login attempts exceeded. Access locked for 15 minutes.`,
      remainingSeconds,
      lockedUntil: record.lockedUntil
    });
  }
  loginAttempts.set(ip, record);
  const attemptsRemaining = LOGIN_MAX_ATTEMPTS - record.count;
  return res.status(401).json({
    error: `Invalid KernelX credentials. ${attemptsRemaining} attempt(s) remaining before security lockout.`
  });
});

// KernelX Session Verification
app.get('/api/kernelx/verify', requireKernelAuth, (req, res) => {
  res.json({ valid: true, user: req.kernelUser });
});

// KernelX: Get All Users
app.get('/api/kernelx/users', requireKernelAuth, (req, res) => {
  const users = readUsersDatabase().map(u => ({
    id: u.id,
    username: u.username,
    role: u.role || 'Staff',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt || u.createdAt
  }));
  res.json({ success: true, users });
});

// KernelX: Add New User
app.post('/api/kernelx/users', requireKernelAuth, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = username.trim();
  const cleanPass = password.trim();

  if (cleanUser.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (cleanPass.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const users = readUsersDatabase();
  if (users.some(u => u.username.toLowerCase() === cleanUser.toLowerCase())) {
    return res.status(409).json({ error: `User "${cleanUser}" already exists.` });
  }

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUser,
    passwordHash: hashPassword(cleanPass),
    role: role === 'Administrator' ? 'Administrator' : 'Staff',
    tokenVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsersDatabaseAtomic(users);

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt
    }
  });
});

// KernelX: Edit Existing User
app.put('/api/kernelx/users/:id', requireKernelAuth, (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body || {};

  const users = readUsersDatabase();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const target = users[index];

  // Update username if provided
  if (username && username.trim().toLowerCase() !== target.username.toLowerCase()) {
    const cleanUser = username.trim();
    if (cleanUser.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    if (users.some(u => u.id !== id && u.username.toLowerCase() === cleanUser.toLowerCase())) {
      return res.status(409).json({ error: `Username "${cleanUser}" is already taken.` });
    }
    target.username = cleanUser;
    // Increment tokenVersion so user must log in again with new username
    target.tokenVersion = (target.tokenVersion || 1) + 1;
  }

  // Update password if provided
  if (password && password.trim().length > 0) {
    const cleanPass = password.trim();
    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    target.passwordHash = hashPassword(cleanPass);
    // Increment tokenVersion to immediately invalidate all active sessions
    target.tokenVersion = (target.tokenVersion || 1) + 1;
  }

  if (role && (role === 'Administrator' || role === 'Staff')) {
    target.role = role;
  }

  target.updatedAt = new Date().toISOString();
  users[index] = target;
  writeUsersDatabaseAtomic(users);

  res.json({
    success: true,
    message: `User "${target.username}" updated successfully.`,
    user: {
      id: target.id,
      username: target.username,
      role: target.role,
      updatedAt: target.updatedAt
    }
  });
});

// KernelX: Remove / Revoke User
app.delete('/api/kernelx/users/:id', requireKernelAuth, (req, res) => {
  const { id } = req.params;
  const users = readUsersDatabase();
  const target = users.find(u => u.id === id);

  if (!target) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const filtered = users.filter(u => u.id !== id);
  writeUsersDatabaseAtomic(filtered);

  res.json({
    success: true,
    message: `User "${target.username}" removed. All active sessions have been immediately revoked.`
  });
});

// ==========================================================
// Standard User Authentication Endpoints
// ==========================================================
app.post('/api/auth/login', loginRateLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = password.trim();

  // Check multi-user database
  const users = readUsersDatabase();
  const hashedInput = hashPassword(trimmedPass);
  let matchedUser = users.find(u => u.username.toLowerCase() === trimmedUser && u.passwordHash === hashedInput);

  // Fallback check against env admin credentials
  if (!matchedUser && trimmedUser === ADMIN_USERNAME.toLowerCase() && trimmedPass === ADMIN_PASSWORD) {
    matchedUser = {
      id: 'usr_root_admin',
      username: ADMIN_USERNAME,
      role: 'Administrator',
      tokenVersion: 1
    };
  }

  if (!matchedUser) {
    const record = req.loginRateRecord || { count: 0 };
    record.count++;
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(ip, record);
      const remainingSeconds = Math.ceil(LOGIN_LOCKOUT_MS / 1000);
      return res.status(429).json({
        error: `Maximum login attempts exceeded. Access locked for 15 minutes.`,
        remainingSeconds,
        lockedUntil: record.lockedUntil
      });
    }
    loginAttempts.set(ip, record);
    const attemptsRemaining = LOGIN_MAX_ATTEMPTS - record.count;
    return res.status(401).json({
      error: `Invalid credentials. ${attemptsRemaining} attempt(s) remaining before security lockout.`
    });
  }

  // Clear failed login attempts on success
  loginAttempts.delete(ip);

  // Generate Session Token with live tokenVersion for instant revocation
  const token = generateToken({
    userId: matchedUser.id,
    username: matchedUser.username,
    role: matchedUser.role || 'Staff',
    tokenVersion: matchedUser.tokenVersion || 1,
    organization: 'The Mega Mall & Kampus Integrated Services',
    exp: Date.now() + 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    token,
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      role: matchedUser.role || 'Staff',
      organization: 'The Mega Mall & Kampus Integrated Services'
    }
  });
});

// Verified session endpoint - checks live database on every call
app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Apply global rate limiting to all protected /api/* endpoints
app.use('/api', globalApiRateLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================================
// Protected Persistent Project State Database Endpoints
// ==========================================================
app.get('/api/project/state', requireAuth, (req, res) => {
  try {
    const state = readProjectStateDatabase();
    res.json({ success: true, state });
  } catch (err) {
    console.error('Failed to get project state:', err);
    res.status(500).json({ error: 'Failed to retrieve project state from database' });
  }
});

app.post('/api/project/state', requireAuth, (req, res) => {
  try {
    const incomingState = req.body;
    if (!incomingState || typeof incomingState !== 'object') {
      return res.status(400).json({ error: 'Invalid state payload provided' });
    }

    const stateToSave = {
      ...incomingState,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user ? req.user.username : 'User'
    };

    writeProjectStateDatabaseAtomic(stateToSave);
    res.json({
      success: true,
      message: 'Project state saved to database successfully',
      updatedAt: stateToSave.updatedAt
    });
  } catch (err) {
    console.error('Failed to save project state:', err);
    res.status(500).json({ error: 'Failed to save project state: ' + err.message });
  }
});

app.post('/api/project/state/reset', requireAuth, (req, res) => {
  try {
    const defaultState = getDefaultProjectState();
    writeProjectStateDatabaseAtomic(defaultState);
    res.json({
      success: true,
      message: 'Project state reset to default database state',
      state: defaultState
    });
  } catch (err) {
    console.error('Failed to reset project state:', err);
    res.status(500).json({ error: 'Failed to reset project state: ' + err.message });
  }
});

// ==========================================================
// Protected File Import Endpoint (PDF, DOCX, CSV) - Pure Node Engine
// ==========================================================
app.post('/api/import/file', requireAuth, async (req, res) => {
  try {
    const { filename, fileBase64 } = req.body;
    if (!filename || !fileBase64) {
      return res.status(400).json({ error: 'Filename and fileBase64 data are required' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!['.pdf', '.docx', '.csv', '.txt'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a .pdf, .docx, or .csv file.' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');

    if (ext === '.csv' || ext === '.txt') {
      const text = buffer.toString('utf-8');
      return res.json({ type: 'csv', rawText: text });
    }

    if (ext === '.pdf') {
      try {
        const parser = new PDFParse(new Uint8Array(buffer));
        const result = await parser.getText();
        const invoices = [];
        let occupier = null;
        let location = null;
        let ntn = null;

        if (Array.isArray(result.pages)) {
          result.pages.forEach((page, i) => {
            const text = page.text || '';
            if (!text.trim()) return;

            if (!occupier) {
              const occ_m = text.match(/Legal Occupier:\s*([^\n\r,]+)/i);
              if (occ_m) occupier = occ_m[1].trim() + ',';
            }
            if (!location) {
              const loc_m = text.match(/Location:\s*([^\n\r]+)/i);
              if (loc_m) location = loc_m[1].trim();
            }
            if (!ntn) {
              const ntn_m = text.match(/NTN:\s*([A-Z0-9]+)/i);
              if (ntn_m) ntn = ntn_m[1].trim();
            }

            const inv_m = text.match(/(#INV-[A-Za-z0-9\-]+)/i);
            const inv_num = inv_m ? inv_m[1] : `#INV-${3001 + i}-051026`;

            const month_m = text.match(/Billing Month:\s*([\s\S]*?(?:\.\)?|\n))/i);
            let billing_period = month_m ? normalizeMonthNames(month_m[1].replace(/\s+/g, ' ').trim()) : '';

            const date_m = text.match(/Date\s*:\s*([0-9a-zA-Z\s]+)/i);
            const issue_date = date_m ? normalizeMonthNames(date_m[1].trim()) : '';

            const table_m = text.match(/(\d[\d,]*)\s+([\d\.]+)\s+([\d,]+)\/-\s+(\d[\d,]*)\s+([\d,]+)\/-/);
            let gallons, rate, bill_amount, previous, total_payable;
            if (table_m) {
              gallons = parseInt(table_m[1].replace(/,/g, ''), 10);
              rate = parseFloat(table_m[2]);
              bill_amount = parseInt(table_m[3].replace(/,/g, ''), 10);
              previous = parseInt(table_m[4].replace(/,/g, ''), 10);
              total_payable = parseInt(table_m[5].replace(/,/g, ''), 10);
            } else {
              const alt_m = text.match(/(\d[\d,]*)\s+([\d\.]+)\s+([\d,]+)/);
              if (alt_m) {
                gallons = parseInt(alt_m[1].replace(/,/g, ''), 10);
                rate = parseFloat(alt_m[2]);
                bill_amount = parseInt(alt_m[3].replace(/,/g, ''), 10);
                previous = 0;
                total_payable = bill_amount;
              } else {
                gallons = 50000;
                rate = 1.25;
                bill_amount = 62500;
                previous = 0;
                total_payable = 62500;
              }
            }

            invoices.push({
              index: i,
              invoiceNumber: inv_num,
              billingPeriod: billing_period,
              issueDate: issue_date,
              gallons,
              rate,
              billAmount: bill_amount,
              previous,
              totalPayable: total_payable
            });
          });
        }

        return res.json({
          type: 'pdf',
          occupier,
          location,
          ntn,
          invoices
        });
      } catch (pdfErr) {
        console.error('PDF parsing error:', pdfErr);
        return res.status(500).json({ error: 'Failed to parse PDF file: ' + pdfErr.message });
      }
    }

    if (ext === '.docx') {
      try {
        const zip = new AdmZip(buffer);
        const xmlEntry = zip.getEntry('word/document.xml');
        if (!xmlEntry) throw new Error('Invalid Word document: missing word/document.xml');

        const xmlText = xmlEntry.getData().toString('utf-8');
        const cleanText = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        let occupier = null;
        const occ_m = cleanText.match(/Legal Occupier:\s*([^,]+)/i);
        if (occ_m) occupier = occ_m[1].trim() + ',';

        let location = null;
        const loc_m = cleanText.match(/Location:\s*([^\n\r]+?)(?=Billing Month|Invoice|Date|$)/i);
        if (loc_m) location = loc_m[1].trim();

        let ntn = null;
        const ntn_m = cleanText.match(/NTN:\s*([A-Z0-9]+)/i);
        if (ntn_m) ntn = ntn_m[1].trim();

        const invoices = [];
        const invMatches = [...cleanText.matchAll(/(#INV-[A-Za-z0-9\-]+)/gi)].map(m => m[1]);
        const tableMatches = [...cleanText.matchAll(/(\d[\d,]*)\s+([\d\.]+)\s+([\d,]+)\/-\s+(\d[\d,]*)\s+([\d,]+)\/-/g)];

        tableMatches.forEach((tm, idx) => {
          const invNum = invMatches[idx] || `#INV-${3001 + idx}-051026`;
          const gallons = parseInt(tm[1].replace(/,/g, ''), 10);
          const rate = parseFloat(tm[2]);
          const billAmount = parseInt(tm[3].replace(/,/g, ''), 10);
          const previous = parseInt(tm[4].replace(/,/g, ''), 10);
          const totalPayable = parseInt(tm[5].replace(/,/g, ''), 10);

          invoices.push({
            index: idx,
            invoiceNumber: invNum,
            billingPeriod: '',
            issueDate: '',
            gallons,
            rate,
            billAmount,
            previous,
            totalPayable
          });
        });

        return res.json({
          type: 'docx',
          occupier,
          location,
          ntn,
          invoices
        });
      } catch (docxErr) {
        console.error('DOCX parsing error:', docxErr);
        return res.status(500).json({ error: 'Failed to parse Word document: ' + docxErr.message });
      }
    }
  } catch (error) {
    console.error('File import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Convert numbers to English words e.g. (Rupees One Hundred Twenty Thousand Nine Hundred Fifty-Eight Only)
function numberToWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertHundreds(n) {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)];
      if (n % 10 > 0) str += '-' + ones[n % 10];
      str += ' ';
    } else if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let result = '';
  const millions = Math.floor(num / 1000000);
  num %= 1000000;
  const thousands = Math.floor(num / 1000);
  const remainder = num % 1000;

  if (millions > 0) {
    result += convertHundreds(millions) + ' Million ';
  }
  if (thousands > 0) {
    result += convertHundreds(thousands) + ' Thousand ';
  }
  if (remainder > 0) {
    result += convertHundreds(remainder);
  }

  return result.trim();
}

function formatAmountInWords(amount) {
  const words = numberToWords(amount);
  return `(Rupees ${words} Only)`;
}

// ==========================================================
// Protected Word Export Endpoint (.docx)
// ==========================================================
app.post('/api/export/docx', requireAuth, async (req, res) => {
  try {
    const { invoices, occupier, location, ntn, columns } = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ error: 'No invoices provided' });
    }

    const megaMallLogoPath = path.join(__dirname, 'public', 'assets', 'mega-mall-logo.png');
    const kampusLogoPath = path.join(__dirname, 'public', 'assets', 'kampus-logo.png');

    const megaMallLogoBytes = fs.existsSync(megaMallLogoPath) ? fs.readFileSync(megaMallLogoPath) : null;
    const kampusLogoBytes = fs.existsSync(kampusLogoPath) ? fs.readFileSync(kampusLogoPath) : null;

    const solidBorder = {
      style: BorderStyle.SINGLE,
      size: 10,
      color: '000000'
    };

    const cellBorders = {
      top: solidBorder,
      bottom: solidBorder,
      left: solidBorder,
      right: solidBorder
    };

    const emptyBorder = {
      style: BorderStyle.NONE,
      size: 0,
      color: 'auto'
    };

    const noBorders = {
      top: emptyBorder,
      bottom: emptyBorder,
      left: emptyBorder,
      right: emptyBorder
    };

    const children = [];

    invoices.forEach((inv, index) => {
      // 1. Header Table
      const headerRowCells = [
        new TableCell({
          width: { size: 26, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            megaMallLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new ImageRun({
                      data: megaMallLogoBytes,
                      transformation: { width: 128, height: 106 }
                    })
                  ]
                })
              : new Paragraph({ text: "MEGA MALL", alignment: AlignmentType.LEFT })
          ]
        }),
        new TableCell({
          width: { size: 48, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: "THE MEGA MALL",
                  bold: true,
                  size: 28,
                  font: "Segoe UI"
                })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Official Billing Invoice / Reimburstment Note",
                  bold: true,
                  size: 24,
                  font: "Segoe UI"
                })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 26, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.RIGHT,
          children: [
            kampusLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new ImageRun({
                      data: kampusLogoBytes,
                      transformation: { width: 70, height: 108 }
                    })
                  ]
                })
              : new Paragraph({ text: "KAMPUS", alignment: AlignmentType.RIGHT })
          ]
        })
      ];

      const headerTable = new Table({
        rows: [new TableRow({ children: headerRowCells })],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(headerTable);
      children.push(new Paragraph({ spacing: { after: 300 } }));

      // 2. Customer & Invoice Info Table
      const metaTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: "Customer", bold: true, size: 20, font: "Segoe UI" })],
                    spacing: { after: 180 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Legal Occupier: ", bold: false, size: 18, font: "Segoe UI" }),
                      new TextRun({ text: occupier || "FALAKNAZ SPRINGS,", size: 18, font: "Segoe UI" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Location: ", bold: false, size: 18, font: "Segoe UI" }),
                      new TextRun({ text: location || "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,", size: 18, font: "Segoe UI" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Billing Month: ", bold: true, size: 18, font: "Segoe UI" }),
                      new TextRun({ text: normalizeMonthNames(inv.billingPeriod), bold: true, size: 18, font: "Segoe UI" })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Invoice,", bold: true, size: 20, font: "Segoe UI" })],
                    spacing: { after: 180 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: inv.invoiceNumber, bold: true, size: 19, font: "Segoe UI" })],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: "NTN: ", size: 18, font: "Segoe UI" }),
                      new TextRun({ text: ntn || "C951537", bold: true, size: 18, font: "Segoe UI" })
                    ]
                  })
                ]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(metaTable);
      children.push(new Paragraph({ spacing: { after: 350 } }));

      // 3. Billing Table (Dynamic Columns Supported)
      const thStyle = {
        borders: cellBorders,
        alignment: AlignmentType.CENTER
      };

      const effectiveCols = (Array.isArray(columns) && columns.length > 0)
        ? columns
        : [
            { id: 'gallons', label: 'CONSUMPTION GALLON', type: 'number' },
            { id: 'rate', label: 'RATE PER\nGALLON', type: 'number' },
            { id: 'billAmount', label: 'BILL\nAMOUNT', type: 'currency' },
            { id: 'previous', label: 'PREVIOUS', type: 'currency' },
            { id: 'totalPayable', label: 'TOTAL PAYABLE', type: 'currency' }
          ];

      const headerCells = effectiveCols.map(col => new TableCell({
        ...thStyle,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: (col.label || col.id).replace(/\n/g, ' '),
                bold: true,
                size: 15,
                font: "Segoe UI",
                color: "5e616f"
              })
            ]
          })
        ]
      }));

      const dataCells = effectiveCols.map(col => {
        let val = inv[col.id];
        if (val === undefined || val === null) val = "";
        let displayVal = String(val);
        if (col.type === 'currency' && !isNaN(Number(val)) && val !== "") {
          if (col.id === 'previous') {
            displayVal = Number(val) === 0 ? "0" : Number(val).toLocaleString();
          } else {
            displayVal = Number(val) === 0 ? "0" : `${Number(val).toLocaleString()}/-`;
          }
        } else if (col.id === 'rate' && !isNaN(Number(val)) && val !== "") {
          displayVal = Number(val).toFixed(2);
        } else if (col.type === 'number' && !isNaN(Number(val)) && val !== "") {
          displayVal = String(val).replace(/,/g, '');
        }

        return new TableCell({
          borders: cellBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: displayVal,
                  size: 18,
                  font: "Segoe UI"
                })
              ]
            })
          ]
        });
      });

      const billTable = new Table({
        rows: [
          new TableRow({ children: headerCells }),
          new TableRow({ children: dataCells })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(billTable);
      children.push(new Paragraph({ spacing: { after: 180 } }));

      // 4. Amount in Words (Rupees ... Only)
      const words = formatAmountInWords(inv.totalPayable);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: words,
              bold: true,
              size: 21,
              font: "Segoe UI"
            })
          ],
          spacing: { before: 180, after: 260 }
        })
      );

      // 5. Bullet Notices
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.", size: 17, font: "Segoe UI" })
          ],
          spacing: { after: 120 }
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *If the payment is not received till the last payment date, ", size: 17, font: "Segoe UI" }),
            new TextRun({ text: "\"The Mega Mall\"", bold: true, size: 17, font: "Segoe UI" }),
            new TextRun({ text: " will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.", size: 17, font: "Segoe UI" })
          ],
          spacing: { after: 380 }
        })
      );

      // 6. Signoff (Two-column: Left Account Dept, Right Management)
      const signoffTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: "Account Department", bold: true, size: 18, font: "Segoe UI" })],
                    spacing: { after: 50 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: `Date : ${normalizeMonthNames(inv.issueDate)}`, bold: true, size: 18, font: "Segoe UI" })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Management", bold: true, size: 18, font: "Segoe UI" })],
                    spacing: { after: 200 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "(Kampus Integrated Services)", bold: true, size: 17, font: "Segoe UI" })],
                    spacing: { after: 50 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "(The Mega Mall)", bold: true, size: 17, font: "Segoe UI" })]
                  })
                ]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(signoffTable);
      children.push(new Paragraph({ spacing: { after: 800 } }));

      // 7. Footer Address
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.",
              bold: true,
              size: 17,
              font: "Segoe UI"
            })
          ]
        })
      );

      if (index < invoices.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1080, right: 1080 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Water_Invoices.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Word export error:', error);
    res.status(500).json({ error: 'Failed to generate Word document', details: error.message });
  }
});

// ==========================================================
// Rent Management API & Dedicated Route (/rents & /rent)
// ==========================================================
app.get(['/rents', '/rents/', '/rent', '/rent/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /api/rents/login - Password Authentication (Set via RENTS_PASSWORD env)
app.post('/api/rents/login', loginRateLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required to access Rents Register' });
  }

  const isMasterPass = password === KERNEL_ADMIN_PASS || password === ADMIN_PASSWORD;
  const isRentPass = password === RENTS_PASSWORD;

  if (!isMasterPass && !isRentPass) {
    if (req.loginRateRecord) req.loginRateRecord.count++;
    return res.status(401).json({ error: 'Invalid password for Rents Register. Access denied.' });
  }

  if (req.loginRateRecord) req.loginRateRecord.count = 0;

  const token = generateToken({
    isRentsAdmin: true,
    role: 'RentsAdministrator',
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
  });

  res.json({
    success: true,
    token,
    expiresIn: 86400
  });
});

// GET /api/rents/verify - Check if rents session token is still valid
app.get('/api/rents/verify', requireRentsAuth, (req, res) => {
  res.json({ valid: true, user: req.rentsUser });
});

// GET /api/rents - Retrieve all rent records and metadata (protected)
app.get('/api/rents', globalApiRateLimiter, requireRentsAuth, (req, res) => {
  const db = readRentsDatabase();
  const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
  const recordMonths = Array.from(new Set((db.records || []).map(r => r.month))).filter(Boolean);
  db.months = Array.from(new Set([...standardMonths, ...recordMonths]));
  res.json(db);
});

// POST /api/rents/save - Safe route: private client local storage (protected)
app.post('/api/rents/save', globalApiRateLimiter, requireRentsAuth, (req, res) => {
  res.json({ success: true, message: 'Private client local storage active. No server persistence.' });
});

// POST /api/rents/import - Safe route: private client local storage (protected)
app.post('/api/rents/import', globalApiRateLimiter, requireRentsAuth, (req, res) => {
  res.json({ success: true, message: 'Private client local storage active. No server persistence.' });
});

// GET /api/rents/download/master-excel (protected)
app.get('/api/rents/download/master-excel', requireRentsAuth, (req, res) => {
  const filePath = path.join(__dirname, 'refrence', 'consolidated_allottees_rent_master.xlsx');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'consolidated_allottees_rent_master.xlsx');
  } else {
    res.status(404).json({ error: 'Master Excel file not found' });
  }
});

// GET /api/rents/download/master-csv (protected)
app.get('/api/rents/download/master-csv', requireRentsAuth, (req, res) => {
  const filePath = path.join(__dirname, 'refrence', 'consolidated_allottees_rent_master.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'consolidated_allottees_rent_master.csv');
  }
  try {
    const db = readRentsDatabase();
    const cleanStr = str => String(str || '').replace(/[\r\n\t]+/g, ' ').trim();
    const quoteField = str => '"' + cleanStr(str).replace(/"/g, '""') + '"';
    let csv = 'S.NOS.,MONTH,BRAND NAME,SHOP NOS.,ALLOTEE,SQ.FT.,AMOUNT,CHQ NO.,PAID,DATE,IN HAND\n';
    (db.records || []).forEach((r, idx) => {
      const brand = quoteField(r.brand_name);
      const shop = quoteField(r.shop_no);
      const allotee = quoteField(r.allotee_name);
      const dateStr = quoteField(r.date);
      csv += `${idx + 1},${r.month},${brand},${shop},${allotee},${r.sq_ft || 0},${r.amount || 0},${r.chq_no || '-'},${r.paid || 0},${dateStr},${r.in_hand || 0}\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="consolidated_allottees_rent_master.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate master CSV' });
  }
});

// Dedicated route for KernelX Admin Console
app.get(['/kernelx', '/kernelx/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================================
// Payment Reminders API & Dedicated Route (/reminders & /reminder)
// ==========================================================
app.get(['/reminders', '/reminders/', '/reminder', '/reminder/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /api/reminders/login - Password Authentication (Set via REMINDERS_PASSWORD env)
app.post('/api/reminders/login', loginRateLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required to access Payment Reminders' });
  }

  const isMasterPass = password === KERNEL_ADMIN_PASS || password === ADMIN_PASSWORD;
  const isRemindersPass = password === REMINDERS_PASSWORD;

  if (!isMasterPass && !isRemindersPass) {
    if (req.loginRateRecord) req.loginRateRecord.count++;
    return res.status(401).json({ error: 'Invalid password for Payment Reminders. Access denied.' });
  }

  if (req.loginRateRecord) req.loginRateRecord.count = 0;

  const token = generateToken({
    isRemindersAdmin: true,
    role: 'RemindersAdministrator',
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
  });

  res.json({
    success: true,
    token,
    expiresIn: 86400
  });
});

// GET /api/reminders/verify - Verify token
app.get('/api/reminders/verify', requireRemindersAuth, (req, res) => {
  res.json({ valid: true, user: req.remindersUser });
});

// POST /api/reminders/export-docx - Generate Word document
app.post('/api/reminders/export-docx', requireRemindersAuth, async (req, res) => {
  try {
    const data = req.body || {};
    const mallName = (data.mallName || 'MEGA MALL').trim();
    const reminderSubtitle = (data.reminderSubtitle || 'FINAL PAYMENT REMINDER – 3').trim();
    const dateStr = (data.date || '').trim();
    const tenantBrand = (data.tenantBrand || '').trim();
    const shopNo = (data.shopNo || '').trim();
    const subject = (data.subject || 'Subject: Outstanding Payment').trim();
    const salutation = (data.salutation || 'Dear Tenant,').trim();
    const introText = (data.introText || '').trim();
    const columns = Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : [
      { id: 'sr', label: 'Sr.' },
      { id: 'invNo', label: 'Invoice No.' },
      { id: 'particulars', label: 'Particulars' },
      { id: 'dueDate', label: 'Due Date' },
      { id: 'outstanding', label: 'Outstanding (PKR)' }
    ];
    const rows = Array.isArray(data.rows) && data.rows.length > 0 ? data.rows : [
      { sr: 1, invNo: '', particulars: 'Rent / CAM / Electricity / Water / Other', dueDate: '', outstanding: '' }
    ];
    const totalOutstanding = data.totalOutstanding != null ? String(data.totalOutstanding).trim() : '0';
    const paymentDeadline = (data.paymentDeadline || '').trim();
    const notice1 = (data.notice1 || '').trim();
    const notice2 = (data.notice2 || '').trim();
    const signOff = (data.signOff || 'For Mega Mall').trim();

    const solidBorder = { style: BorderStyle.SINGLE, size: 8, color: '333333' };
    const cellBorders = { top: solidBorder, bottom: solidBorder, left: solidBorder, right: solidBorder };
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    const lineBottomBorder = { style: BorderStyle.SINGLE, size: 10, color: '000000' };
    const labelBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
    const lineBorders = { top: noBorder, bottom: lineBottomBorder, left: noBorder, right: noBorder };

    const children = [];

    // Title Section
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({ text: mallName, bold: true, size: 30, font: 'Calibri' })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 240 },
        children: [
          new TextRun({ text: reminderSubtitle, bold: true, size: 24, font: 'Calibri' })
        ]
      })
    );

    // Meta Lines (Date, Tenant/Brand, Shop No. - Underlined Lines, No Outer Box)
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              borders: labelBorders,
              children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: 'Date:', bold: true, size: 21, font: 'Calibri' })] })]
            }),
            new TableCell({
              width: { size: 78, type: WidthType.PERCENTAGE },
              borders: lineBorders,
              children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: dateStr || '', bold: true, size: 21, font: 'Calibri' })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: labelBorders,
              children: [new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: 'Tenant / Brand:', bold: true, size: 21, font: 'Calibri' })] })]
            }),
            new TableCell({
              borders: lineBorders,
              children: [new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: tenantBrand || '', bold: true, size: 21, font: 'Calibri' })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: labelBorders,
              children: [new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: 'Shop No.', bold: true, size: 21, font: 'Calibri' })] })]
            }),
            new TableCell({
              borders: lineBorders,
              children: [new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: shopNo || '', bold: true, size: 21, font: 'Calibri' })] })]
            })
          ]
        })
      ]
    });
    children.push(metaTable);

    // Spacing
    children.push(new Paragraph({ spacing: { before: 180, after: 80 } }));

    // Subject
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 120 },
        children: [
          new TextRun({ text: subject, bold: true, size: 22, font: 'Calibri' })
        ]
      })
    );

    // Salutation
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 100 },
        children: [
          new TextRun({ text: salutation, bold: true, size: 22, font: 'Calibri' })
        ]
      })
    );

    // Warning / Intro text
    if (introText) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 200 },
          children: [
            new TextRun({ text: introText, size: 21, font: 'Calibri' })
          ]
        })
      );
    }

    // Main Table
    const headerRowCells = columns.map((col, idx) => {
      return new TableCell({
        borders: cellBorders,
        shading: { fill: 'EFEFEF' },
        alignment: AlignmentType.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: col.label || `Col ${idx + 1}`, bold: true, size: 20, font: 'Calibri' })
            ]
          })
        ]
      });
    });

    const tableRows = [new TableRow({ children: headerRowCells })];

    rows.forEach((r, rowIdx) => {
      const rowCells = columns.map((col) => {
        let cellVal = '';
        if (col.id === 'sr' || col.isSr) {
          cellVal = String(rowIdx + 1);
        } else {
          cellVal = r[col.id] != null ? String(r[col.id]) : '';
        }

        const isAmountCol = col.id === 'outstanding' || col.isAmount;
        const align = (col.id === 'sr' || col.isSr) ? AlignmentType.CENTER : (isAmountCol ? AlignmentType.RIGHT : AlignmentType.LEFT);

        return new TableCell({
          borders: cellBorders,
          alignment: align,
          children: [
            new Paragraph({
              alignment: align,
              children: [
                new TextRun({ text: cellVal, size: 20, font: 'Calibri' })
              ]
            })
          ]
        });
      });
      tableRows.push(new TableRow({ children: rowCells }));
    });

    // Total Row
    const totalRowCells = [
      new TableCell({
        borders: cellBorders,
        shading: { fill: 'F9F9F9' },
        columnSpan: Math.max(1, columns.length - 1),
        alignment: AlignmentType.RIGHT,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'Total Outstanding PKR', bold: true, size: 21, font: 'Calibri' })
            ]
          })
        ]
      }),
      new TableCell({
        borders: cellBorders,
        shading: { fill: 'F9F9F9' },
        alignment: AlignmentType.RIGHT,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: totalOutstanding, bold: true, size: 21, font: 'Calibri' })
            ]
          })
        ]
      })
    ];
    tableRows.push(new TableRow({ children: totalRowCells }));

    const mainTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    });
    children.push(mainTable);

    // Payment Deadline
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 120 },
        children: [
          new TextRun({ text: 'Payment Deadline: ', bold: true, size: 21, font: 'Calibri' }),
          new TextRun({ text: paymentDeadline || '', bold: true, underline: { type: UnderlineType.SINGLE }, size: 21, font: 'Calibri' })
        ]
      })
    );

    // Notice 1
    if (notice1) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 100 },
          children: [
            new TextRun({ text: notice1, size: 20, font: 'Calibri' })
          ]
        })
      );
    }

    // Notice 2
    if (notice2) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 200 },
          children: [
            new TextRun({ text: notice2, size: 20, font: 'Calibri' })
          ]
        })
      );
    }

    // Sign-off
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 180, after: 60 },
        children: [
          new TextRun({ text: signOff, bold: true, size: 22, font: 'Calibri' })
        ]
      })
    );

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 1200,
              bottom: 1000,
              left: 1200
            }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeTenant = (tenantBrand || 'Tenant').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeShop = (shopNo || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Payment_Reminder_${safeTenant}_${safeShop}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Error generating reminder docx:', err);
    res.status(500).json({ error: 'Failed to generate Word document: ' + err.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Corporate Server running securely at http://0.0.0.0:${PORT}`);
});
