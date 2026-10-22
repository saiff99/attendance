const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const app = express();

// Helper: Safely resolve internal API key from environment or local env files
function getInternalApiKey() {
  if (process.env.INTERNAL_API_KEY) return process.env.INTERNAL_API_KEY.trim();
  try {
    const envPaths = [
      path.join(__dirname, '..', 'backend', '.env'),
      path.join(__dirname, '..', 'frontend', '.env.local'),
      path.join(__dirname, '..', '.env')
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        const match = content.match(/INTERNAL_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
        if (match && match[1]) return match[1].trim();
      }
    }
  } catch (e) {}
  return null;
}
const INTERNAL_API_KEY = getInternalApiKey();

// Strict CORS: Allow only authorized local frontend and backend origins
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked: Origin not authorized for WhatsApp bridge.'));
  },
  credentials: true,
}));

app.use(express.json());

// Security Middleware: Require valid x-internal-secret token on all endpoints (except /health)
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  if (!INTERNAL_API_KEY) {
    return next();
  }

  const authHeader = req.headers['x-internal-secret'] || req.headers['authorization'];
  const cleanToken = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : '';

  if (!cleanToken || cleanToken !== INTERNAL_API_KEY) {
    console.warn(`[WhatsApp Security] 🚫 Blocked unauthorized ${req.method} request to ${req.path} from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid x-internal-secret authentication token.'
    });
  }

  next();
});

const PORT = process.env.WHATSAPP_PORT || 5005;
const SESSION_DIR = path.join(__dirname, 'session');

// In-Memory Global State
let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let qrDataUrl = null;
let connectedUser = null;
let isReconnecting = false;
const activeJobs = new Map();

// Helper: Ensure Session Directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Helper: Format raw phone number into standard WhatsApp JID
function normalizeToJid(rawPhone) {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return null;

  // If 10 digits (Standard Indian mobile like 9876543210), prepend 91
  if (digits.length === 10) {
    digits = '91' + digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = '91' + digits.substring(1);
  }

  return `${digits}@s.whatsapp.net`;
}

function formatDisplayPhone(jidOrPhone) {
  if (!jidOrPhone) return '';
  const digits = String(jidOrPhone).split('@')[0].replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/**
 * Initializes or restarts the Baileys WhatsApp Socket
 */
async function initWhatsAppSocket() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    connectionStatus = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp Bridge] Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['MedAttend AI Hub', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    // Save session credentials whenever updated
    sock.ev.on('creds.update', saveCreds);

    // Listen for connection updates (QR code, connect, disconnect)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          connectionStatus = 'qr_ready';
          console.log('[WhatsApp Bridge] 📸 New QR Code generated, ready for scan.');
        } catch (err) {
          console.error('[WhatsApp Bridge] QR Generation Error:', err);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        qrDataUrl = null;
        const userJid = sock.user?.id || '';
        const userPhone = userJid.split(':')[0] || userJid.split('@')[0];
        connectedUser = {
          id: userJid,
          phone: formatDisplayPhone(userPhone),
          rawPhone: userPhone,
          name: sock.user?.name || 'MedAttend WhatsApp',
        };
        console.log(`[WhatsApp Bridge] 🎉 Connected successfully as: ${connectedUser.phone} (${connectedUser.name})`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(`[WhatsApp Bridge] Connection closed. StatusCode: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WhatsApp Bridge] ⚠️ Session logged out. Wiping session directory for new QR...');
          connectionStatus = 'disconnected';
          connectedUser = null;
          qrDataUrl = null;
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } catch (e) {
            console.error('[WhatsApp Bridge] Failed to clean session directory:', e);
          }
          isReconnecting = false;
          setTimeout(initWhatsAppSocket, 2000);
        } else {
          connectionStatus = 'connecting';
          isReconnecting = false;
          setTimeout(initWhatsAppSocket, 4000);
        }
      }
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] Initialization Error:', err);
    connectionStatus = 'disconnected';
  } finally {
    isReconnecting = false;
  }
}

// Initialize on server start
initWhatsAppSocket();

// ----------------------------------------------------
// Express API Endpoints
// ----------------------------------------------------

// 1. Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 2. Connection Status & QR Code
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: qrDataUrl,
    user: connectedUser,
  });
});

// 3. Disconnect / Logout
app.post('/disconnect', async (req, res) => {
  try {
    console.log('[WhatsApp Bridge] User requested manual disconnect/logout.');
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        // Socket may already be dead
      }
    }
    try {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } catch (e) {}

    connectionStatus = 'disconnected';
    connectedUser = null;
    qrDataUrl = null;

    // Trigger fresh init to prepare new QR immediately
    setTimeout(initWhatsAppSocket, 1500);

    return res.json({ success: true, message: 'Disconnected successfully. Generating new QR...' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Send Single Message (Test or Instant)
app.post('/send', async (req, res) => {
  try {
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp is not connected. Please scan the QR code first.',
      });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }

    const jid = normalizeToJid(phone);
    if (!jid) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format.' });
    }

    // Verify if number is on WhatsApp
    const [result] = await sock.onWhatsApp(jid);
    if (!result || !result.exists) {
      return res.status(400).json({
        success: false,
        error: `Number ${phone} is not registered on WhatsApp.`,
      });
    }

    const sent = await sock.sendMessage(result.jid, { text: message.trim() });
    return res.json({
      success: true,
      messageId: sent?.key?.id,
      recipient: formatDisplayPhone(jid),
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] Send Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Send Absentee Alerts Batch
app.post('/send-batch', async (req, res) => {
  try {
    if (connectionStatus !== 'connected' || !sock) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp is not connected. Please scan the QR code first.',
      });
    }

    const { sessionId, sessionName, topicName, date, recipients } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients provided.' });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const jobState = {
      id: jobId,
      status: 'in_progress',
      sessionId: sessionId || '',
      sessionName: sessionName || 'Class Session',
      topicName: topicName || 'General Lecture',
      total: recipients.length,
      sent_count: 0,
      failed_count: 0,
      missing_phone_count: 0,
      current_student: null,
      details: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    activeJobs.set(jobId, jobState);

    // Run batch processing asynchronously in background
    (async () => {
      console.log(`[WhatsApp Batch ${jobId}] Starting dispatch for ${recipients.length} absent students...`);
      const formattedDate = date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

      for (let i = 0; i < recipients.length; i++) {
        const student = recipients[i];
        jobState.current_student = student.student_name || `Student ${i + 1}`;

        const rawPhone = student.phone || student.parent_phone || '';
        const jid = normalizeToJid(rawPhone);

        if (!jid) {
          jobState.missing_phone_count++;
          jobState.details.push({
            student_id: student.id,
            student_name: student.student_name,
            student_roll: student.student_roll,
            phone: rawPhone,
            status: 'skipped_no_phone',
            message: 'No valid phone number found',
          });
          continue;
        }

        const messageText = `🏫 *Jagannath Gupta Institute of Medical Sciences & Hospital*\n⚠️ *Student Attendance Alert Notice*\n\nDear Parent/Guardian,\nThis is to notify you that your ward *${student.student_name}* (Roll: *${student.student_roll}*) was marked *ABSENT* for today's class:\n\n📚 *Class:* ${jobState.sessionName}\n👨‍🏫 *Topic:* ${jobState.topicName}\n📅 *Date:* ${formattedDate}\n\n_If you believe this is an error, please contact the department coordinator._`;

        try {
          // Check if registered on WhatsApp
          const [verified] = await sock.onWhatsApp(jid);
          if (!verified || !verified.exists) {
            jobState.failed_count++;
            jobState.details.push({
              student_id: student.id,
              student_name: student.student_name,
              student_roll: student.student_roll,
              phone: formatDisplayPhone(jid),
              status: 'failed',
              error: 'Not registered on WhatsApp',
            });
          } else {
            await sock.sendMessage(verified.jid, { text: messageText });
            jobState.sent_count++;
            jobState.details.push({
              student_id: student.id,
              student_name: student.student_name,
              student_roll: student.student_roll,
              phone: formatDisplayPhone(jid),
              status: 'sent',
            });
            console.log(`[WhatsApp Batch ${jobId}] (${i + 1}/${recipients.length}) Sent to ${student.student_name} (${formatDisplayPhone(jid)})`);
          }
        } catch (sendErr) {
          console.error(`[WhatsApp Batch ${jobId}] Failed for ${student.student_name}:`, sendErr.message);
          jobState.failed_count++;
          jobState.details.push({
            student_id: student.id,
            student_name: student.student_name,
            student_roll: student.student_roll,
            phone: formatDisplayPhone(jid),
            status: 'failed',
            error: sendErr.message,
          });
        }

        // Anti-Spam Human Throttle: 2.8s to 3.4s delay between messages
        if (i < recipients.length - 1) {
          const delayMs = 2800 + Math.floor(Math.random() * 600);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      jobState.status = 'completed';
      jobState.current_student = null;
      jobState.completedAt = new Date().toISOString();
      console.log(`[WhatsApp Batch ${jobId}] Completed! Sent: ${jobState.sent_count}, Failed: ${jobState.failed_count}, Skipped: ${jobState.missing_phone_count}`);
    })().catch((err) => {
      console.error(`[WhatsApp Batch ${jobId}] Unexpected fatal error:`, err);
      jobState.status = 'failed';
      jobState.error = err.message;
    });

    return res.json({
      success: true,
      jobId,
      total: recipients.length,
      message: 'Absentee alert dispatching started.',
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] Batch Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Job Status Polling
app.get('/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }
  return res.json({ success: true, ...job });
});

// Start Express Listener strictly on 127.0.0.1 (Localhost / Loopback interface only)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 [WhatsApp Bridge] Service running securely on http://127.0.0.1:${PORT} (Loopback only)`);
});
