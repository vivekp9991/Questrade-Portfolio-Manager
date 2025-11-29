const fs = require('fs');
const file = 'Holdings.jsx';
let content = fs.readFileSync(file, 'utf8');

// Fix the order: sourceAccounts should come after divAdjYield is defined
content = content.replace(
  /      const divAdjCost = shares > 0 \? \(\(shares \* avgCost\) - totalDivReceived\) \/ shares : avgCost;\n      const sourceAccounts = pos\.sourceAccounts \|\| \[\];\n      const divAdjYield =/,
  `      const divAdjCost = shares > 0 ? ((shares * avgCost) - totalDivReceived) / shares : avgCost;

      // Div ADJ Yield: ((Monthly dividend * 12) / Div ADJ Cost) * 100 (in %)
      const divAdjYield =`
);

// Remove duplicate sourceAccounts line and keep only the fixed one
content = content.replace(
  /        divAdjCost: divAdjCost, \/\/ DIV ADJ COST column \(\$\)\n        sourceAccounts: Array\.isArray\(sourceAccounts\) \? sourceAccounts\.map\(acc => acc\.accountType \|\| acc\)\.filter\(Boolean\)\.join\(', '\) : sourceAccounts\.join\(', '\), \/\/ SOURCE ACCOUNTS column \(text\)\n        sourceAccounts: sourceAccounts\.join\(', '\), \/\/ SOURCE ACCOUNTS column \(text\)/,
  `        divAdjCost: divAdjCost, // DIV ADJ COST column ($)
        divAdjYield: divAdjYield, // DIV ADJ YIELD column (%)
        sourceAccounts: Array.isArray(sourceAccounts) ? sourceAccounts.map(acc => acc.accountType || acc).filter(Boolean).join(', ') : sourceAccounts.join(', '), // SOURCE ACCOUNTS column (text)`
);

// Add sourceAccounts definition after divAdjYield
content = content.replace(
  /      \/\/ Div ADJ Yield: \(\(Monthly dividend \* 12\) \/ Div ADJ Cost\) \* 100 \(in %\)\n      const divAdjYield = divAdjCost > 0 \? \(\(\(monthlyDividendPerShare \* 12\) \/ divAdjCost\) \* 100\) : 0;\n\n/,
  `      // Div ADJ Yield: ((Monthly dividend * 12) / Div ADJ Cost) * 100 (in %)
      const divAdjYield = divAdjCost > 0 ? (((monthlyDividendPerShare * 12) / divAdjCost) * 100) : 0;

      const sourceAccounts = pos.sourceAccounts || [];

`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed Holdings.jsx');
