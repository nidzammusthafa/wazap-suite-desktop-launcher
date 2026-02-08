export {};

// --- Types ---
interface LicenseStatus {
    valid: boolean;
    reason?: string;
    expiresAt?: string;
    activated?: boolean;
}

interface WazapAPI {
    server: {
        start: () => Promise<void>;
        stop: () => Promise<void>;
        restart: () => Promise<void>; // Add restart capability later if IPC supports it, or implement via stop+start
        getStatus: () => Promise<string>;
        onLog: (callback: (msg: string) => void) => () => void;
        onStatusChange: (callback: (status: string) => void) => () => void;
    };
    app: {
        getVersion: () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
        notifyReady: () => Promise<void>;
    };
    license: {
        validate: (key: string) => Promise<LicenseStatus>;
        getHWID: () => Promise<string>;
        checkSaved: () => Promise<LicenseStatus>;
        clear: () => Promise<boolean>;
    };
    window: {
        minimize: () => Promise<void>;
        close: () => Promise<void>;
    }
}

declare global {
    interface Window {
        wazap: WazapAPI;
    }
}

// --- DOM Elements ---
const views = {
    loading: document.getElementById('view-loading') as HTMLElement,
    license: document.getElementById('view-license') as HTMLElement,
    dashboard: document.getElementById('view-dashboard') as HTMLElement,
};

const els = {
    appVersion: document.getElementById('app-version') as HTMLElement,
    loadingText: document.getElementById('loading-text') as HTMLElement,
    
    // License
    licenseInput: document.getElementById('license-input') as HTMLInputElement,
    btnActivate: document.getElementById('btn-activate') as HTMLButtonElement,
    licenseError: document.getElementById('license-error') as HTMLElement,
    hwidDisplay: document.getElementById('hwid-display') as HTMLElement,
    btnCopyHwid: document.getElementById('btn-copy-hwid') as HTMLButtonElement,
    
    // Dashboard
    serverStatusDot: document.getElementById('server-status-dot') as HTMLElement,
    serverStatusText: document.getElementById('server-status-text') as HTMLElement,
    btnStart: document.getElementById('btn-start-server') as HTMLButtonElement,
    btnStop: document.getElementById('btn-stop-server') as HTMLButtonElement,
    btnRestart: document.getElementById('btn-restart-server') as HTMLButtonElement,
    licenseExpiry: document.getElementById('license-expiry') as HTMLElement,
    btnChangeLicense: document.getElementById('btn-change-license') as HTMLButtonElement,
    btnOpenApp: document.getElementById('btn-open-app') as HTMLButtonElement,
    
    // Logs
    logContainer: document.getElementById('log-container') as HTMLElement,
    btnToggleLogs: document.getElementById('btn-toggle-logs') as HTMLButtonElement,
    
    // Window
    btnMinimize: document.getElementById('btn-minimize') as HTMLButtonElement,
    btnClose: document.getElementById('btn-close') as HTMLButtonElement,
};

// --- State ---
let isLogsVisible = true;

// --- Functions ---

function switchView(viewName: keyof typeof views) {
    Object.values(views).forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none'; // Ensure hidden elements don't take space
    });
    
    const target = views[viewName];
    target.style.display = 'flex';
    // Small delay to allow display:flex to apply before adding active class for animation
    requestAnimationFrame(() => {
        target.classList.add('active');
    });
}

function addLog(msg: string) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    
    const timestamp = new Date().toLocaleTimeString();
    const cleanMsg = msg.replace(/\[\d+m/g, ''); // Remove ANSI colors if any
    
    if (cleanMsg.toLowerCase().includes('error')) div.classList.add('error');
    else div.classList.add('info');

    div.textContent = `[${timestamp}] ${cleanMsg}`;
    els.logContainer.appendChild(div);
    
    // Auto scroll if near bottom
    if (els.logContainer.scrollTop + els.logContainer.clientHeight >= els.logContainer.scrollHeight - 50) {
        els.logContainer.scrollTop = els.logContainer.scrollHeight;
    }
}

function updateServerStatus(status: string) {
    els.serverStatusText.textContent = status.toUpperCase();
    els.serverStatusDot.className = 'dot'; // Reset
    
    els.btnStart.style.display = 'none';
    els.btnStop.style.display = 'none';
    els.btnRestart.style.display = 'none';
    els.btnOpenApp.disabled = true;

    switch (status) {
        case 'running':
            els.serverStatusDot.classList.add('running');
            els.btnStop.style.display = 'inline-block';
            els.btnRestart.style.display = 'inline-block';
            els.btnOpenApp.disabled = false;
            break;
        case 'idle':
        case 'error':
        case 'stopped':
            els.serverStatusDot.classList.add('stopped');
            els.btnStart.style.display = 'inline-block';
            break;
        default: // starting, extracting, migrating
            els.serverStatusDot.classList.add('loading');
            els.btnStop.style.display = 'inline-block'; // Allow cancel/stop during start
            break;
    }
}

async function handleLicenseValidation(key: string) {
    if (!key) return;
    
    els.licenseError.textContent = '';
    els.btnActivate.disabled = true;
    els.btnActivate.textContent = 'Verifying...';
    
    try {
        const result = await window.wazap.license.validate(key);
        
        if (result.valid) {
            setupDashboard(result);
            // Start server automatically on successful activation
            addLog('License valid. Starting server...');
            window.wazap.server.start();
        } else {
            els.licenseError.textContent = result.reason || 'Invalid license key';
        }
    } catch (err) {
        els.licenseError.textContent = 'Network error. Check connection.';
        console.error(err);
    } finally {
        els.btnActivate.disabled = false;
        els.btnActivate.textContent = 'Activate';
    }
}

function setupDashboard(licenseData: LicenseStatus) {
    switchView('dashboard');
    
    if (licenseData.expiresAt) {
        const date = new Date(licenseData.expiresAt);
        els.licenseExpiry.textContent = date.toLocaleDateString();
        
        // Check if near expiry (optional visual warning)
    } else {
        els.licenseExpiry.textContent = 'Lifetime';
    }
}

async function init() {
    addLog('System initializing...');

    // 1. Setup Window Controls
    try {
        els.btnMinimize.addEventListener('click', () => window.wazap.window.minimize());
        els.btnClose.addEventListener('click', () => window.wazap.window.close());
    } catch (e) { console.error('Error binding window controls', e); }
    
    // 2. Setup Version
    try {
        const version = await window.wazap.app.getVersion();
        els.appVersion.textContent = `v${version}`;
    } catch (e) { console.error('Error getting version', e); }
    
    // 3. Setup Logs
    try {
        window.wazap.server.onLog(addLog);
        window.wazap.server.onStatusChange(updateServerStatus);
    } catch (e) { console.error('Error binding logs', e); }
    
    els.btnToggleLogs.addEventListener('click', () => {
        isLogsVisible = !isLogsVisible;
        if (isLogsVisible) {
            els.logContainer.style.display = 'block';
            els.btnToggleLogs.textContent = 'Hide Logs';
        } else {
            els.logContainer.style.display = 'none';
            els.btnToggleLogs.textContent = 'Show Logs';
        }
    });

    // 4. Setup Server Controls
    els.btnStart.addEventListener('click', () => window.wazap.server.start());
    els.btnStop.addEventListener('click', () => window.wazap.server.stop());
    els.btnRestart.addEventListener('click', async () => {
        await window.wazap.server.stop();
        setTimeout(() => window.wazap.server.start(), 1000);
    });
    els.btnOpenApp.addEventListener('click', () => window.wazap.app.openExternal('http://localhost:4000'));

    // 5. Setup License Inputs
    try {
        const hwid = await window.wazap.license.getHWID();
        els.hwidDisplay.textContent = hwid;
        
        els.btnCopyHwid.addEventListener('click', () => {
            navigator.clipboard.writeText(hwid);
            els.btnCopyHwid.textContent = '✅';
            setTimeout(() => els.btnCopyHwid.textContent = '📋', 2000);
        });
    } catch (e) { console.error('Error getting HWID', e); }

    els.btnActivate.addEventListener('click', () => handleLicenseValidation(els.licenseInput.value));
    
    els.btnChangeLicense.addEventListener('click', async () => {
        if (confirm('Are you sure you want to deactivate and change license?')) {
            await window.wazap.license.clear();
            await window.wazap.server.stop();
            switchView('license');
        }
    });

    // 6. Notify Ready & Check License
    addLog('Connecting to main process...');
    
    try {
        // Add timeout to notifyReady
        const notifyPromise = window.wazap.app.notifyReady();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('IPC Timeout')), 3000));
        await Promise.race([notifyPromise, timeoutPromise]);
        
        addLog('Main process connected.');
    } catch (err) {
        console.error('Failed to notify main process:', err);
        addLog(`Warning: IPC handshake failed (${String(err)}). Continuing...`);
    }
    
    addLog('Checking saved license...');
    try {
        const checkPromise = window.wazap.license.checkSaved();
        const checkTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('License Check Timeout')), 5000));
        
        const savedLicense = await Promise.race([checkPromise, checkTimeout]) as LicenseStatus;
        
        if (savedLicense.valid) {
            addLog('Saved license found. Initializing...');
            setupDashboard(savedLicense);
            window.wazap.server.start();
        } else {
            addLog(savedLicense.reason || 'No valid license found. Please activate.');
            switchView('license');
        }
    } catch (err: any) {
        console.error('License check failed:', err);
        addLog(`Error checking license: ${err.message || String(err)}`);
        // Fallback to license view on error
        switchView('license');
    }
}

// Start
init();
