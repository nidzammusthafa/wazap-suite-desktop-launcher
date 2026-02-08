const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');
const { execSync } = require('child_process');

const serverDistPath = path.resolve(__dirname, '../../new-server/dist');
const serverResourcesPath = path.resolve(__dirname, '../resources');
const serverZipPath = path.join(serverResourcesPath, 'server.zip');
const tempDir = path.join(__dirname, '../temp_server_build');

// Cloudflared download URL
const CLOUDFLARED_VERSION = '2024.1.5';
const CLOUDFLARED_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`;

console.log('Preparing server resources...');

// Helper to download file
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading from ${url}...`);
        const file = fs.createWriteStream(dest);
        
        const request = (url) => {
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Follow redirect
                    request(response.headers.location);
                    return;
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;
                
                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const percent = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
                    process.stdout.write(`\rDownloading... ${percent}%`);
                });
                
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('\nDownload complete.');
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        };
        
        request(url);
    });
}

async function main() {
    if (!fs.existsSync(serverDistPath)) {
        console.error(`Server dist not found at: ${serverDistPath}`);
        console.error('Please build the server first (npm run build:sea in new-server)');
        process.exit(1);
    }

    // 1. Create temp directory
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    console.log(`Copying server files from ${serverDistPath} to temp...`);

    // 2. Copy main executable
    const exeName = process.platform === 'win32' ? 'main.exe' : 'main';
    if (fs.existsSync(path.join(serverDistPath, exeName))) {
        fs.copyFileSync(path.join(serverDistPath, exeName), path.join(tempDir, exeName));
    } else {
        console.error(`Main executable not found: ${exeName}`);
        process.exit(1);
    }

    // 3. Copy .env (if exists, or create default?)
    const envPath = path.resolve(__dirname, '../../new-server/.env');
    if (fs.existsSync(envPath)) {
        fs.copyFileSync(envPath, path.join(tempDir, '.env'));
    } else {
        console.warn('No .env found, creating empty one.');
        fs.writeFileSync(path.join(tempDir, '.env'), 'PORT=4000\nNODE_ENV=production');
    }

    // 4. Copy Prisma
    console.log('Copying Prisma schema and migrations...');
    const prismaSrc = path.resolve(__dirname, '../../new-server/prisma');
    const prismaDist = path.join(tempDir, 'prisma');
    fs.mkdirSync(prismaDist, { recursive: true });

    // Copy schema
    if (fs.existsSync(path.join(prismaSrc, 'schema.prisma'))) {
        fs.copyFileSync(path.join(prismaSrc, 'schema.prisma'), path.join(prismaDist, 'schema.prisma'));
    }

    // Copy migrations folder
    const migrationsSrc = path.join(prismaSrc, 'migrations');
    if (fs.existsSync(migrationsSrc)) {
        fs.cpSync(migrationsSrc, path.join(prismaDist, 'migrations'), { recursive: true });
    }

    // Generate initial.db if possible
    const devDbPath = path.join(prismaSrc, 'dev_v3.db');
    if (fs.existsSync(devDbPath)) {
        console.log('Including dev database as initial.db template...');
        fs.copyFileSync(devDbPath, path.join(tempDir, 'initial.db'));
    }

    // 5. Copy node_modules (Filtered)
    console.log('Copying node_modules (this may take a while)...');
    const nodeModulesSrc = path.join(serverDistPath, 'node_modules');
    const nodeModulesDest = path.join(tempDir, 'node_modules');

    if (fs.existsSync(nodeModulesSrc)) {
        fs.cpSync(nodeModulesSrc, nodeModulesDest, { 
            recursive: true, 
            dereference: true,
            filter: (src) => {
                // Basic filtering
                if (src.includes('.bin')) return false;
                if (src.includes('.cache')) return false;
                if (src.includes('test')) return false;
                if (src.includes('docs')) return false;
                if (src.includes('example')) return false;
                return true;
            }
        });

        // Aggressive cleanup
        console.log('Cleaning up node_modules...');
        const prismaClientDir = path.join(nodeModulesDest, '.prisma/client');
        if (fs.existsSync(prismaClientDir)) {
            fs.readdirSync(prismaClientDir).forEach(file => {
                if (file.includes('query_engine') && !file.includes('windows')) {
                    fs.unlinkSync(path.join(prismaClientDir, file));
                }
            });
        }

    } else {
        console.error('node_modules not found in dist. Is the build correct?');
    }

    // 6. Download cloudflared
    console.log('\n--- Preparing Cloudflared ---');
    const cloudflaredDir = path.join(tempDir, 'cloudflared');
    const cloudflaredPath = path.join(cloudflaredDir, 'cloudflared.exe');
    
    fs.mkdirSync(cloudflaredDir, { recursive: true });
    
    // Check if we have a cached version in resources
    const cachedCloudflared = path.join(serverResourcesPath, 'cloudflared.exe');
    if (fs.existsSync(cachedCloudflared)) {
        console.log('Using cached cloudflared.exe...');
        fs.copyFileSync(cachedCloudflared, cloudflaredPath);
    } else {
        console.log('Downloading cloudflared.exe...');
        try {
            await downloadFile(CLOUDFLARED_URL, cloudflaredPath);
            // Cache it for future builds
            fs.copyFileSync(cloudflaredPath, cachedCloudflared);
            console.log('Cached cloudflared.exe for future builds.');
        } catch (err) {
            console.warn(`Warning: Failed to download cloudflared: ${err.message}`);
            console.warn('Tunnel feature will be unavailable.');
            // Remove empty dir if download failed
            if (fs.existsSync(cloudflaredDir)) {
                fs.rmSync(cloudflaredDir, { recursive: true, force: true });
            }
        }
    }

    // 7. Zip it
    console.log('\n--- Creating server.zip ---');
    if (!fs.existsSync(serverResourcesPath)) {
        fs.mkdirSync(serverResourcesPath, { recursive: true });
    }

    // Delete old zip
    if (fs.existsSync(serverZipPath)) {
        fs.unlinkSync(serverZipPath);
    }

    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    zip.writeZip(serverZipPath);

    console.log(`Server bundled successfully to ${serverZipPath}`);

    // Cleanup temp
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Done.');
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
