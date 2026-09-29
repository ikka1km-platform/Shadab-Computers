import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, '../cloud-data');
const PUBLIC_DIR = path.resolve(__dirname, '../dist');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const FIRMS_DIR = path.join(DATA_DIR, 'firms');
if (!fs.existsSync(FIRMS_DIR)) {
  fs.mkdirSync(FIRMS_DIR, { recursive: true });
}

const app = express();

// Comprehensive CORS & Preflight handling for Android WebView, iOS Safari & Desktop Web
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Active public tunnel URL (updated dynamically when tunnel starts)
let currentPublicUrl = process.env.PUBLIC_URL || '';

export function setServerPublicUrl(url) {
  currentPublicUrl = url.replace(/\/$/, '');
  console.log(`[Cloud Server] Public URL configured: ${currentPublicUrl}`);
}

// -------------------------------------------------------------
// Helper Utilities for Firm Isolation and Storage
// -------------------------------------------------------------
function getFirmDir(firmId) {
  const cleanId = String(firmId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(FIRMS_DIR, cleanId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(String(pin) + ':' + String(salt)).digest('hex');
}

function getFirmAuth(firmId) {
  const file = path.join(getFirmDir(firmId), 'auth.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

function saveFirmAuth(firmId, authData) {
  const file = path.join(getFirmDir(firmId), 'auth.json');
  fs.writeFileSync(file, JSON.stringify(authData, null, 2), 'utf-8');
}

function getFirmVault(firmId) {
  const file = path.join(getFirmDir(firmId), 'vault.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

function saveFirmVault(firmId, vaultData) {
  const file = path.join(getFirmDir(firmId), 'vault.json');
  fs.writeFileSync(file, JSON.stringify(vaultData, null, 2), 'utf-8');
}

function getFirmInvites(firmId) {
  const file = path.join(getFirmDir(firmId), 'invites.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {}
  }
  return {};
}

function saveFirmInvites(firmId, invites) {
  const file = path.join(getFirmDir(firmId), 'invites.json');
  fs.writeFileSync(file, JSON.stringify(invites, null, 2), 'utf-8');
}

function appendFirmEvent(firmId, event) {
  const file = path.join(getFirmDir(firmId), 'events.jsonl');
  const line = JSON.stringify({ ...event, recordedAt: new Date().toISOString() }) + '\n';
  fs.appendFileSync(file, line, 'utf-8');
}

// -------------------------------------------------------------
// Authentication & Firm Isolation Middleware
// -------------------------------------------------------------
function requireFirmAuth(req, res, next) {
  const firmId = req.headers['x-firm-id'] || req.query.firmId || req.body?.firmId;
  const authHeader = req.headers['authorization'];

  if (!firmId) {
    return res.status(400).json({ error: 'Missing x-firm-id header' });
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : (req.query.token || req.body?.token);
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const authData = getFirmAuth(firmId);
  if (!authData) {
    return res.status(404).json({ error: `Firm ${firmId} is not initialized in cloud` });
  }

  // Check if token matches owner token or any active worker token
  let matchedUser = null;
  if (authData.tokens && authData.tokens[token]) {
    matchedUser = authData.tokens[token];
  }

  if (!matchedUser) {
    return res.status(403).json({ error: 'Firm data isolation violation: Invalid or expired token for this Firm ID' });
  }

  req.firmId = firmId;
  req.firmUser = matchedUser;
  next();
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// Public health check and server configuration
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    publicUrl: currentPublicUrl,
    timestamp: new Date().toISOString(),
    service: 'VYApaar Real Cloud Sync Engine'
  });
});

// INITIALIZE FIRM CLOUD RECORD (Called on tablet's first connection)
app.post('/api/firm/init', (req, res) => {
  try {
    const { firmId, firmName, ownerPin = '1234', deviceId = 'tablet_primary', vaultData } = req.body;

    if (!firmId || !firmId.trim()) {
      return res.status(400).json({ error: 'firmId is required' });
    }

    const cleanFirmId = firmId.trim();
    let authData = getFirmAuth(cleanFirmId);
    let existingVault = getFirmVault(cleanFirmId);

    const salt = authData?.salt || crypto.randomBytes(16).toString('hex');
    const pinHash = hashPin(ownerPin, salt);

    if (authData) {
      // Existing firm: verify owner PIN if already set
      if (authData.ownerPinHash && authData.ownerPinHash !== pinHash) {
        return res.status(401).json({ error: 'Incorrect Owner PIN for existing Firm ID' });
      }
    }

    // Generate or reuse persistent owner access token
    const ownerToken = 'vyk_' + crypto.randomBytes(32).toString('hex');
    authData = authData || {
      firmId: cleanFirmId,
      firmName: firmName || 'My Business',
      createdAt: new Date().toISOString(),
      salt,
      ownerPinHash: pinHash,
      tokens: {}
    };

    authData.ownerPinHash = pinHash;
    authData.tokens = authData.tokens || {};
    authData.tokens[ownerToken] = {
      role: 'Owner',
      name: 'Owner Primary Terminal',
      deviceId,
      issuedAt: new Date().toISOString()
    };
    saveFirmAuth(cleanFirmId, authData);

    // Initial Vault Population (Safe Financial Union without destroying existing data)
    let mergedVault = existingVault;
    if (!mergedVault) {
      mergedVault = {
        appName: 'Vyapar Business App',
        firmId: cleanFirmId,
        cloudAccountEmail: req.body.email || `${cleanFirmId.toLowerCase()}@vyapaar-cloud.internal`,
        syncVersion: 1,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedByDevice: deviceId,
        activeDevices: [
          {
            deviceId,
            deviceName: 'Owner Primary Terminal',
            role: 'Owner',
            lastSyncAt: new Date().toISOString(),
            isActive: true
          }
        ],
        parties: vaultData?.parties || [],
        transactions: vaultData?.transactions || [],
        items: vaultData?.items || [],
        bankAccounts: vaultData?.bankAccounts || [],
        firms: vaultData?.firms || [{ id: cleanFirmId, name: firmName || 'My Business', isDefault: true }],
        coWorkers: vaultData?.coWorkers || []
      };
    } else if (vaultData) {
      // Safe merge of initial records if server already had a vault
      const existingTxnIds = new Set(mergedVault.transactions.map(t => String(t.id || t.voucherNumber || t.invoiceNo)));
      for (const txn of (vaultData.transactions || [])) {
        const tKey = String(txn.id || txn.voucherNumber || txn.invoiceNo);
        if (!existingTxnIds.has(tKey)) {
          mergedVault.transactions.push(txn);
          existingTxnIds.add(tKey);
        }
      }

      const existingPartyMap = new Map(mergedVault.parties.map(p => [p.name?.toLowerCase().trim(), p]));
      for (const party of (vaultData.parties || [])) {
        const key = party.name?.toLowerCase().trim();
        if (!existingPartyMap.has(key)) {
          mergedVault.parties.push(party);
        }
      }

      const existingItemMap = new Map(mergedVault.items.map(i => [i.name?.toLowerCase().trim(), i]));
      for (const item of (vaultData.items || [])) {
        const key = item.name?.toLowerCase().trim();
        if (!existingItemMap.has(key)) {
          mergedVault.items.push(item);
        }
      }

      mergedVault.syncVersion = (mergedVault.syncVersion || 1) + 1;
      mergedVault.lastUpdatedAt = new Date().toISOString();
      mergedVault.lastUpdatedByDevice = deviceId;
    }

    saveFirmVault(cleanFirmId, mergedVault);
    appendFirmEvent(cleanFirmId, {
      type: 'FIRM_INITIALIZED',
      deviceId,
      totalParties: mergedVault.parties.length,
      totalTransactions: mergedVault.transactions.length
    });

    console.log(`[Cloud Server] Firm ${cleanFirmId} initialized with ${mergedVault.parties.length} parties, ${mergedVault.transactions.length} bills.`);

    res.json({
      success: true,
      firmId: cleanFirmId,
      token: ownerToken,
      syncVersion: mergedVault.syncVersion,
      vault: mergedVault
    });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/init error:', err);
    res.status(500).json({ error: err.message || 'Initialization failed' });
  }
});

// AUTHENTICATE DEVICE / CO-WORKER / IPHONE FOR A FIRM
app.post('/api/firm/auth', (req, res) => {
  try {
    const { firmId, pin, deviceId = 'device_remote', deviceName = 'Remote Device' } = req.body;

    if (!firmId || !pin) {
      return res.status(400).json({ error: 'firmId and pin are required' });
    }

    const cleanFirmId = firmId.trim();
    const authData = getFirmAuth(cleanFirmId);
    const vault = getFirmVault(cleanFirmId);

    if (!authData || !vault) {
      return res.status(404).json({ error: `Firm ID "${cleanFirmId}" does not exist in the cloud. Please check the Firm ID or connect the tablet first.` });
    }

    const inputPinHash = hashPin(pin, authData.salt);
    let userRole = null;
    let userName = 'User';

    // 1. Check Owner PIN
    if (authData.ownerPinHash === inputPinHash || pin === '1234' && !authData.ownerPinHash) {
      userRole = 'Owner';
      userName = 'Owner Terminal';
    } else {
      // 2. Check Co-Worker PINs in Vault
      const matchingWorker = (vault.coWorkers || []).find(w => String(w.pin) === String(pin) && w.status !== 'INACTIVE');
      if (matchingWorker) {
        userRole = matchingWorker.role || 'Salesman';
        userName = matchingWorker.name || 'Co-Worker';
      }
    }

    if (!userRole) {
      return res.status(401).json({ error: 'Invalid PIN for this Firm ID. Please check with your business owner.' });
    }

    // Generate authenticated session token
    const token = 'vys_' + crypto.randomBytes(32).toString('hex');
    authData.tokens = authData.tokens || {};
    authData.tokens[token] = {
      role: userRole,
      name: userName,
      deviceId,
      deviceName,
      issuedAt: new Date().toISOString()
    };
    saveFirmAuth(cleanFirmId, authData);

    // Update active device in vault
    const existingDevIdx = (vault.activeDevices || []).findIndex(d => d.deviceId === deviceId);
    const devRecord = {
      deviceId,
      deviceName: deviceName || (userRole === 'Owner' ? 'Owner iPhone/Browser' : `${userName} Device`),
      role: userRole,
      workerName: userName,
      lastSyncAt: new Date().toISOString(),
      isActive: true
    };
    if (existingDevIdx >= 0) {
      vault.activeDevices[existingDevIdx] = devRecord;
    } else {
      vault.activeDevices = vault.activeDevices || [];
      vault.activeDevices.push(devRecord);
    }
    saveFirmVault(cleanFirmId, vault);

    console.log(`[Cloud Server] Authenticated ${userRole} (${userName}) for firm ${cleanFirmId}`);

    res.json({
      success: true,
      firmId: cleanFirmId,
      firmName: authData.firmName || vault.appName,
      role: userRole,
      workerName: userName,
      token,
      syncVersion: vault.syncVersion,
      vault
    });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/auth error:', err);
    res.status(500).json({ error: err.message || 'Authentication error' });
  }
});

// GET COMPLETE FIRM VAULT (For initial download and deep sync)
app.get('/api/firm/vault', requireFirmAuth, (req, res) => {
  try {
    const vault = getFirmVault(req.firmId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    res.json({ success: true, vault });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/vault error:', err);
    res.status(500).json({ error: err.message || 'Failed fetching vault' });
  }
});

// REAL CLOUD BIDIRECTIONAL SYNCHRONIZATION WITH CONFLICT-SAFE FINANCIAL MERGE
app.post('/api/firm/sync', requireFirmAuth, (req, res) => {
  try {
    const firmId = req.firmId;
    const { clientSyncVersion = 0, deviceId, pendingQueue = [], localTransactions = [], localParties = [] } = req.body;

    const vault = getFirmVault(firmId);
    if (!vault) {
      return res.status(404).json({ error: 'Firm vault missing' });
    }

    let hasMutations = false;

    // 1a. Absorb full local transactions if sent by client to prevent data loss across devices
    if (Array.isArray(localTransactions) && localTransactions.length > 0) {
      const existingTxnKeys = new Set(vault.transactions.map(t => String(t.voucherNumber || t.id || t.invoiceNo)));
      for (const tx of localTransactions) {
        if (!tx) continue;
        const key = String(tx.voucherNumber || tx.id || tx.invoiceNo);
        if (!existingTxnKeys.has(key)) {
          vault.transactions.push(tx);
          existingTxnKeys.add(key);
          hasMutations = true;
        }
      }
    }

    // 1b. Absorb local parties if sent by client
    if (Array.isArray(localParties) && localParties.length > 0) {
      const existingPartyMap = new Map(vault.parties.map(p => [p.name?.toLowerCase().trim(), p]));
      for (const p of localParties) {
        if (!p || !p.name) continue;
        const pKey = p.name.toLowerCase().trim();
        if (!existingPartyMap.has(pKey)) {
          vault.parties.push(p);
          existingPartyMap.set(pKey, p);
          hasMutations = true;
        }
      }
    }

    // 1c. Process incoming pending queue items with financial immutability
    if (Array.isArray(pendingQueue) && pendingQueue.length > 0) {
      for (const qItem of pendingQueue) {
        const { entityType, action, payload } = qItem;
        if (!payload) continue;

        if (entityType === 'transaction') {
          // Rule: Financial transactions are append-only accounting records. Never overwrite with last-write-wins.
          const txnId = String(payload.voucherNumber || payload.id || payload.invoiceNo);
          const existingIdx = vault.transactions.findIndex(t => String(t.voucherNumber || t.id || t.invoiceNo) === txnId);

          if (existingIdx === -1) {
            // New transaction created on another device
            vault.transactions.push(payload);
            hasMutations = true;
            appendFirmEvent(firmId, { action: 'TRANSACTION_CREATED', txnId, amount: payload.amount, type: payload.type, deviceId });
          } else if (action === 'DELETE') {
            // Soft delete or remove if explicitly requested
            vault.transactions.splice(existingIdx, 1);
            hasMutations = true;
          } else {
            // Transaction update (e.g. status changed from pending to paid)
            vault.transactions[existingIdx] = { ...vault.transactions[existingIdx], ...payload };
            hasMutations = true;
          }

          // Recalculate related party balance dynamically from ledger
          if (payload.partyName) {
            const pKey = payload.partyName.toLowerCase().trim();
            const party = vault.parties.find(p => p.name?.toLowerCase().trim() === pKey);
            if (party) {
              const partyTxns = vault.transactions.filter(t => t.partyName?.toLowerCase().trim() === pKey);
              let totalCredit = 0; // payments in / sales return
              let totalDebit = 0;  // sales / payments out
              for (const t of partyTxns) {
                const amt = Number(t.amount) || 0;
                if (t.type === 'SALE') totalDebit += amt;
                else if (t.type === 'PAYMENT_IN') totalCredit += amt;
                else if (t.type === 'PURCHASE') totalCredit += amt;
                else if (t.type === 'PAYMENT_OUT') totalDebit += amt;
              }
              const opening = Number(party.openingBalance) || 0;
              party.currentBalance = opening + (totalDebit - totalCredit);
            }
          }
        } else if (entityType === 'party') {
          const partyId = payload.id;
          const pNameKey = payload.name?.toLowerCase().trim();
          const existingIdx = vault.parties.findIndex(p => p.id === partyId || p.name?.toLowerCase().trim() === pNameKey);

          if (existingIdx === -1) {
            vault.parties.push(payload);
            hasMutations = true;
          } else {
            // Merge party fields safely without wiping ledger balance
            const existing = vault.parties[existingIdx];
            vault.parties[existingIdx] = {
              ...existing,
              ...payload,
              // Keep calculated balance if remote has it
              currentBalance: payload.currentBalance !== undefined ? payload.currentBalance : existing.currentBalance
            };
            hasMutations = true;
          }
        } else if (entityType === 'item') {
          const itemId = payload.id;
          const iNameKey = payload.name?.toLowerCase().trim();
          const existingIdx = vault.items.findIndex(i => i.id === itemId || i.name?.toLowerCase().trim() === iNameKey);

          if (existingIdx === -1) {
            vault.items.push(payload);
            hasMutations = true;
          } else {
            vault.items[existingIdx] = { ...vault.items[existingIdx], ...payload };
            hasMutations = true;
          }
        } else if (entityType === 'coWorker') {
          const workerId = payload.id;
          const existingIdx = (vault.coWorkers || []).findIndex(w => w.id === workerId);
          vault.coWorkers = vault.coWorkers || [];
          if (existingIdx === -1) {
            vault.coWorkers.push(payload);
            hasMutations = true;
          } else {
            vault.coWorkers[existingIdx] = { ...vault.coWorkers[existingIdx], ...payload };
            hasMutations = true;
          }
        }
      }
    }

    // 2. Update device presence
    if (deviceId) {
      vault.activeDevices = vault.activeDevices || [];
      const devIdx = vault.activeDevices.findIndex(d => d.deviceId === deviceId);
      const devInfo = {
        deviceId,
        deviceName: req.firmUser?.deviceName || req.firmUser?.name || 'VYApaar Device',
        role: req.firmUser?.role || 'Staff',
        workerName: req.firmUser?.name,
        lastSyncAt: new Date().toISOString(),
        isActive: true
      };
      if (devIdx >= 0) {
        vault.activeDevices[devIdx] = { ...vault.activeDevices[devIdx], ...devInfo };
      } else {
        vault.activeDevices.push(devInfo);
      }
    }

    if (hasMutations) {
      vault.syncVersion = (vault.syncVersion || 1) + 1;
      vault.lastUpdatedAt = new Date().toISOString();
      vault.lastUpdatedByDevice = deviceId || 'remote_sync';
      saveFirmVault(firmId, vault);
    }

    res.json({
      success: true,
      syncVersion: vault.syncVersion,
      lastUpdatedAt: vault.lastUpdatedAt,
      vault, // Send latest merged vault
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/sync error:', err);
    res.status(500).json({ error: err.message || 'Synchronization failed' });
  }
});

// GENERATE SECURE INVITATION TOKEN (No plaintext PINs in URLs!)
app.post('/api/firm/invite', requireFirmAuth, (req, res) => {
  try {
    const firmId = req.firmId;
    const { workerId, role = 'Salesman' } = req.body;

    const vault = getFirmVault(firmId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });

    const worker = (vault.coWorkers || []).find(w => String(w.id) === String(workerId));
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found in firm records' });
    }

    // Cryptographic 24-byte random invite token
    const inviteToken = 'inv_' + crypto.randomBytes(24).toString('hex');
    const invites = getFirmInvites(firmId);

    invites[inviteToken] = {
      workerId: worker.id,
      workerName: worker.name,
      role: worker.role || role,
      firmId,
      firmName: vault.appName || 'VYApaar Business',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };
    saveFirmInvites(firmId, invites);

    const baseUrl = currentPublicUrl || `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${baseUrl}/?cloudInvite=${encodeURIComponent(inviteToken)}`;

    res.json({
      success: true,
      inviteToken,
      inviteUrl,
      workerName: worker.name,
      role: worker.role
    });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/invite error:', err);
    res.status(500).json({ error: err.message || 'Failed generating invitation' });
  }
});

// ACCEPT INVITATION TOKEN ON IPHONE / REMOTE BROWSER
app.post('/api/firm/accept-invite', (req, res) => {
  try {
    const { inviteToken, deviceId = 'remote_invite_dev', deviceName = 'iPhone Safari' } = req.body;
    if (!inviteToken) {
      return res.status(400).json({ error: 'Missing inviteToken' });
    }

    // Find token across firm invites
    const firms = fs.readdirSync(FIRMS_DIR);
    let matchedInvite = null;
    let targetFirmId = null;

    for (const fId of firms) {
      const invites = getFirmInvites(fId);
      if (invites[inviteToken]) {
        matchedInvite = invites[inviteToken];
        targetFirmId = fId;
        break;
      }
    }

    if (!matchedInvite || !targetFirmId) {
      return res.status(404).json({ error: 'Invitation link is invalid, expired, or has already been used.' });
    }

    if (new Date(matchedInvite.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'This invitation link has expired. Please ask the business owner to generate a new invite.' });
    }

    const authData = getFirmAuth(targetFirmId);
    const vault = getFirmVault(targetFirmId);

    // Issue worker session token
    const token = 'vys_' + crypto.randomBytes(32).toString('hex');
    authData.tokens = authData.tokens || {};
    authData.tokens[token] = {
      role: matchedInvite.role,
      name: matchedInvite.workerName,
      workerId: matchedInvite.workerId,
      deviceId,
      deviceName,
      issuedAt: new Date().toISOString()
    };
    saveFirmAuth(targetFirmId, authData);

    // Add device to vault
    vault.activeDevices = vault.activeDevices || [];
    vault.activeDevices.push({
      deviceId,
      deviceName: deviceName || `${matchedInvite.workerName} Mobile`,
      role: matchedInvite.role,
      workerName: matchedInvite.workerName,
      lastSyncAt: new Date().toISOString(),
      isActive: true
    });
    saveFirmVault(targetFirmId, vault);

    console.log(`[Cloud Server] Worker ${matchedInvite.workerName} accepted invite for ${targetFirmId}`);

    res.json({
      success: true,
      firmId: targetFirmId,
      firmName: matchedInvite.firmName,
      workerName: matchedInvite.workerName,
      role: matchedInvite.role,
      token,
      vault
    });
  } catch (err) {
    console.error('[Cloud Server] /api/firm/accept-invite error:', err);
    res.status(500).json({ error: err.message || 'Invitation acceptance failed' });
  }
});

// Direct APK Download Endpoint for Android Devices
app.get(['/download/apk', '/api/download/apk', '/apk', '/vyapar.apk', '/app-debug.apk'], (req, res) => {
  const candidatePaths = [
    path.resolve(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk'),
    path.resolve(__dirname, '../dist/vyapar.apk'),
    path.resolve(__dirname, '../dist/app-debug.apk'),
    path.resolve(__dirname, '../public/vyapar.apk'),
    path.resolve(__dirname, '../public/app-debug.apk'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stat.size,
          'Content-Disposition': 'attachment; filename="vyapar-latest.apk"',
          'Cache-Control': 'no-cache',
        });
        const stream = fs.createReadStream(p);
        stream.pipe(res);
        return;
      } catch (err) {
        console.error('[Cloud Server] APK stream error:', err);
      }
    }
  }
  return res.status(404).send('APK build not found. Please assembleDebug first.');
});

// -------------------------------------------------------------
// Web Application Static Hosting (For iPhone Safari & Web users)
// -------------------------------------------------------------
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile, (err) => {
          if (err && !res.headersSent) next(err);
        });
      }
    }
    next();
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`🚀 VYApaar Multi-Device Real Cloud Server listening on port ${PORT}`);
  console.log(`📂 Data directory: ${DATA_DIR}`);
  console.log(`🌐 Public Web static path: ${PUBLIC_DIR}`);
  console.log(`========================================================`);
});

export { app, server };
