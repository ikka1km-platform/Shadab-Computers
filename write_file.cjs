const fs = require('fs');
const [,, targetPath, b64Content] = process.argv;
const buffer = Buffer.from(b64Content, 'base64');
fs.writeFileSync(targetPath, buffer.toString('utf8'), 'utf8');
console.log('Wrote file:', targetPath);
