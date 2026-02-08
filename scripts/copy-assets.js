const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/renderer');
const destDir = path.join(__dirname, '../dist/renderer');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    // Only copy non-ts files
    if (!src.endsWith('.ts')) {
        fs.copyFileSync(src, dest);
    }
  }
}

console.log('Copying assets from src/renderer to dist/renderer...');
if (fs.existsSync(srcDir)) {
    copyRecursiveSync(srcDir, destDir);
    console.log('Assets copied successfully.');
} else {
    console.error('Source directory not found:', srcDir);
    process.exit(1);
}
