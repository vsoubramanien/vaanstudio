const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (file.endsWith('.png')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

try {
  const targetDir = path.join(process.cwd(), 'android/app/src/main/res');
  console.log("Scanning directory:", targetDir);
  const files = walk(targetDir);
  console.log("=== CHECKING ALL RES PNG HEADERS ===");
  files.forEach(f => {
    const buffer = fs.readFileSync(f);
    if (buffer.length < 8) {
      console.log(`${f.replace(process.cwd(), '')}: INVALID (too short, ${buffer.length} bytes)`);
      return;
    }
    const isPng = buffer[0] === 0x89 &&
                  buffer[1] === 0x50 &&
                  buffer[2] === 0x4E &&
                  buffer[3] === 0x47 &&
                  buffer[4] === 0x0D &&
                  buffer[5] === 0x0A &&
                  buffer[6] === 0x1A &&
                  buffer[7] === 0x0A;
                  
    if (!isPng) {
      console.log(`${f.replace(process.cwd(), '')}: NOT A VALID PNG! Header:`, buffer.slice(0, 8));
    } else {
      // Valid PNG header
      console.log(`${f.replace(process.cwd(), '')}: Valid PNG header`);
    }
  });
} catch (e) {
  console.error("Error reading dir:", e);
}
