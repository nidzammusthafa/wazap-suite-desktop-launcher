const fs = require('fs');
const pngToIco = require('png-to-ico');
const path = require('path');

const inputPath = path.resolve(__dirname, '../../new-client/public/android-chrome-512x512.png');
const outputPath = path.resolve(__dirname, '../resources/icon.ico');

console.log(`Converting ${inputPath} to ${outputPath}...`);

pngToIco(inputPath)
  .then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log('Icon converted to ICO successfully');
  })
  .catch(err => {
    console.error('Error converting icon:', err);
    process.exit(1);
  });
