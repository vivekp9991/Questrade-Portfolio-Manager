/**
 * Generate Password Hash for Manual User Creation
 *
 * Usage:
 * node scripts/generate-password-hash.js <password>
 *
 * Example:
 * node scripts/generate-password-hash.js admin123
 */

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Get password from command line
const password = process.argv[2];

if (!password) {
  console.error('❌ Error: Please provide a password');
  console.log('\nUsage: node scripts/generate-password-hash.js <password>');
  console.log('Example: node scripts/generate-password-hash.js admin123');
  process.exit(1);
}

console.log('\n🔐 Password Hash Generator\n');
console.log('Password:', password);
console.log('\nGenerated Hash:');
console.log('─'.repeat(80));
console.log(hashPassword(password));
console.log('─'.repeat(80));
console.log('\n✅ Copy the hash above and use it as the "password" field value in DynamoDB\n');
