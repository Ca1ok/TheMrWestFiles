// Loads the WestLab chemistry stack in Node exactly as the browser does (the data files declare top-level consts that the engine reads by bare name).
const fs = require('fs'), path = require('path');
module.exports = function load(root){
  const files = ['data/periodic-table-data.js', 'data/economy-data.js', 'data/chem-data.js', 'data/thermo-data.js', 'os/lib/chem.js', 'os/lib/phys.js', 'os/lib/mol.js'];
  const src = files.filter(f => fs.existsSync(path.join(root, f))).map(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/if\(typeof module[^\n]*\n?/g, '')).join('\n;\n');
  return new Function(src + '\n;return { Chem, Phys: typeof Phys !== "undefined" ? Phys : null, Mol: typeof Mol !== "undefined" ? Mol : null, THERMO, KSP, ELEMENTS };')();
};
