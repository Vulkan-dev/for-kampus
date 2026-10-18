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
  PageBreak
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Authentication Configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MegaMall@Kampus2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'MegaMall_SuperSecret_Cryptographic_Key_2026_Corporate#991!';
const DATA_DIR = path.join(__dirname, 'data');
const SHOPS_JSON_PATH = path.join(DATA_DIR, 'shops.json');
const USERS_JSON_PATH = path.join(DATA_DIR, 'users.json');

// Ensure private data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading users database:', err);
    return [
      {
        id: 'usr_root_admin',
        username: ADMIN_USERNAME,
        passwordHash: hashPassword(ADMIN_PASSWORD),
        role: 'Administrator',
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
      error: `Too many failed login attempts. Corporate access is temporarily locked for this IP. Please try again in ${remainingSeconds} seconds.`
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

// Strong Authentication Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Access Denied: Corporate authentication token required.'
    });
  }

  const token = authHeader.substring(7).trim();
  const verifiedUser = verifyToken(token);

  if (!verifiedUser) {
    return res.status(401).json({
      error: 'Session Expired or Invalid: Please log in again.'
    });
  }

  req.user = verifiedUser;
  next();
}

// Middleware: require administrator role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Administrator') {
    return res.status(403).json({ error: 'Administrative privilege required.' });
  }
  next();
}

// ==========================================================
// Authentication Endpoints
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
      username: ADMIN_USERNAME,
      role: 'Administrator'
    };
  }

  if (!matchedUser) {
    const record = req.loginRateRecord || { count: 0 };
    record.count++;
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(ip, record);
      return res.status(429).json({
        error: `Maximum login attempts exceeded. Access locked for 15 minutes.`
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

  // Generate Session Token (24 hours valid)
  const token = generateToken({
    username: matchedUser.username,
    role: matchedUser.role || 'Administrator',
    organization: 'The Mega Mall & Kampus Integrated Services',
    exp: Date.now() + 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    token,
    user: {
      username: matchedUser.username,
      role: matchedUser.role || 'Administrator',
      organization: 'The Mega Mall & Kampus Integrated Services'
    }
  });
});

// ==========================================================
// Admin Multi-User Management Endpoints
// ==========================================================
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = readUsersDatabase().map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  if (cleanUser.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (cleanPass.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const users = readUsersDatabase();
  const exists = users.some(u => u.username.toLowerCase() === cleanUser);
  if (exists) {
    return res.status(409).json({ error: `User "${cleanUser}" already exists.` });
  }

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUser,
    passwordHash: hashPassword(cleanPass),
    role: role === 'Staff' ? 'Staff' : 'Administrator',
    createdAt: new Date().toISOString()
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

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const users = readUsersDatabase();
  const target = users.find(u => u.id === id);

  if (!target) {
    return res.status(404).json({ error: 'User account not found.' });
  }
  if (target.id === 'usr_root_admin' || target.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: 'Root administrator account cannot be deleted.' });
  }

  const filtered = users.filter(u => u.id !== id);
  writeUsersDatabaseAtomic(filtered);
  res.json({ success: true, message: `User "${target.username}" deleted.` });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }
  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ valid: false });
  }
  res.json({ valid: true, user: payload });
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
// Protected File Import Endpoint (PDF, DOCX, CSV)
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

    const tempFilePath = path.join(__dirname, `temp_upload_${Date.now()}${ext}`);
    const buffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    if (ext === '.csv' || ext === '.txt') {
      const text = buffer.toString('utf-8');
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.json({ type: 'csv', rawText: text });
    }

    // Call parse_file.py for PDF and DOCX
    const pythonScript = path.join(__dirname, 'parse_file.py');
    execFile('python', [pythonScript, tempFilePath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      if (err) {
        console.error('Python parse error:', err, stderr);
        return res.status(500).json({ error: 'Failed to parse file', details: stderr || err.message });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.error) {
          return res.status(400).json({ error: parsed.error });
        }
        res.json({ type: ext.replace('.', ''), ...parsed });
      } catch (jsonErr) {
        console.error('JSON parse error on python output:', stdout);
        res.status(500).json({ error: 'Invalid response from parser' });
      }
    });
  } catch (error) {
    console.error('File import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================
// Protected Word Export Endpoint (.docx)
// ==========================================================
app.post('/api/export/docx', requireAuth, async (req, res) => {
  try {
    const { invoices, occupier, location, ntn } = req.body;

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
                  font: "Arial"
                })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Official Billing Invoice / Reimburstment Note",
                  bold: true,
                  size: 20,
                  font: "Arial"
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
      children.push(new Paragraph({ spacing: { after: 200 } }));

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
                    children: [new TextRun({ text: "Customer", bold: true, size: 20, font: "Arial" })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Legal Occupier: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: occupier || "FALAKNAZ SPRINGS,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Location: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: location || "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Billing Month: ", bold: true, size: 18, font: "Segoe UI" }),
                      new TextRun({ text: inv.billingPeriod, bold: true, size: 18, font: "Segoe UI" })
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
                    spacing: { after: 60 }
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
      children.push(new Paragraph({ spacing: { after: 260 } }));

      // 3. Billing Table
      const thStyle = {
        borders: cellBorders,
        alignment: AlignmentType.CENTER
      };

      const billTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONSUMPTION GALLON", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "RATE PER GALLON", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BILL AMOUNT", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PREVIOUS", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TOTAL PAYABLE", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.gallons).toLocaleString(), size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.rate).toFixed(2), size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.billAmount).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inv.previous === 0 ? "0" : `${Number(inv.previous).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.totalPayable).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(billTable);
      children.push(new Paragraph({ spacing: { after: 320 } }));

      // 4. Bullet Notices
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
          spacing: { after: 450 }
        })
      );

      // 5. Signoff
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Account Department", bold: true, size: 18, font: "Arial" })],
          spacing: { after: 50 }
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Date : ${inv.issueDate}`, bold: true, size: 18, font: "Arial" })],
          spacing: { after: 1200 }
        })
      );

      // 6. Footer Address
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.",
              bold: true,
              size: 17,
              font: "Arial"
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
// Protected Shops Database Endpoints (Atomic Disk Operations)
// ==========================================================
function readShopsDatabase() {
  if (!fs.existsSync(SHOPS_JSON_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(SHOPS_JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeShopsDatabaseAtomic(data) {
  const tempPath = `${SHOPS_JSON_PATH}.tmp_${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, SHOPS_JSON_PATH);
}

// GET all shops (Protected by requireAuth)
app.get('/api/shops', requireAuth, (req, res) => {
  try {
    const shops = readShopsDatabase();
    res.json(shops);
  } catch (error) {
    console.error('Failed to read shops database:', error);
    res.status(500).json({ error: 'Failed to read shops directory' });
  }
});

// POST all shops (bulk save or full sync, Protected by requireAuth)
app.post('/api/shops', requireAuth, (req, res) => {
  try {
    const { shops } = req.body;
    if (!Array.isArray(shops)) {
      return res.status(400).json({ error: 'Shops array required' });
    }
    writeShopsDatabaseAtomic(shops);
    res.json({ success: true, count: shops.length });
  } catch (error) {
    console.error('Failed to save shops:', error);
    res.status(500).json({ error: 'Failed to save shops directory' });
  }
});

// PUT single shop update (Protected by requireAuth)
app.put('/api/shops/:canonical_key', requireAuth, (req, res) => {
  try {
    const targetKey = req.params.canonical_key;
    const updatedShop = req.body;
    if (!updatedShop || !updatedShop.canonical_key) {
      return res.status(400).json({ error: 'Valid shop data required' });
    }

    const shops = readShopsDatabase();
    const index = shops.findIndex(s => s.canonical_key === targetKey);
    if (index >= 0) {
      shops[index] = updatedShop;
    } else {
      shops.unshift(updatedShop);
    }

    writeShopsDatabaseAtomic(shops);
    res.json({ success: true, shop: updatedShop });
  } catch (error) {
    console.error('Failed to update single shop:', error);
    res.status(500).json({ error: 'Failed to update shop record' });
  }
});

// Protected Excel Export (.xlsx)
app.post('/api/shops/export/xlsx', requireAuth, (req, res) => {
  try {
    const { shops } = req.body;
    const shopsData = Array.isArray(shops) && shops.length > 0
      ? shops
      : readShopsDatabase();

    const tempJsonPath = path.join(__dirname, `temp_shops_${Date.now()}.json`);
    const tempXlsxPath = path.join(__dirname, `temp_shops_${Date.now()}.xlsx`);

    fs.writeFileSync(tempJsonPath, JSON.stringify(shopsData, null, 2), 'utf-8');

    const pythonScript = path.join(__dirname, 'export_shops_xlsx.py');
    execFile('python', [pythonScript, tempJsonPath, tempXlsxPath], (err, stdout, stderr) => {
      if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);

      if (err || !fs.existsSync(tempXlsxPath)) {
        console.error('XLSX export error:', err, stderr);
        if (fs.existsSync(tempXlsxPath)) fs.unlinkSync(tempXlsxPath);
        return res.status(500).json({ error: 'Failed to generate Excel file' });
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Mega_Mall_Shops_Directory.xlsx"');
      const fileStream = fs.createReadStream(tempXlsxPath);
      fileStream.pipe(res);
      fileStream.on('close', () => {
        if (fs.existsSync(tempXlsxPath)) fs.unlinkSync(tempXlsxPath);
      });
    });
  } catch (error) {
    console.error('Export xlsx error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dedicated route for standalone Shop Directory
app.get('/shopslist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Corporate Server running securely at http://0.0.0.0:${PORT}`);
  console.log(`Protected shops directory located at: ${SHOPS_JSON_PATH}`);
});
