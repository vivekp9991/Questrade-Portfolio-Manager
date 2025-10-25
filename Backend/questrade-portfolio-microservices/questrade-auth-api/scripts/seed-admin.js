const mongoose = require('mongoose');
const User = require('../src/models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade-portfolio';

/**
 * Seed default admin user
 * Username: Victor
 * Password: Admin@123 (you should change this after first login)
 */
async function seedAdminUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ username: 'victor' });

    if (existingAdmin) {
      console.log('Admin user "Victor" already exists');
      console.log('User details:');
      console.log(`  - Username: ${existingAdmin.username}`);
      console.log(`  - Display Name: ${existingAdmin.displayName}`);
      console.log(`  - Role: ${existingAdmin.role}`);
      console.log(`  - Active: ${existingAdmin.isActive}`);
      console.log(`  - Created: ${existingAdmin.createdAt}`);

      // Ask if user wants to reset password
      console.log('\nTo reset password, delete the user and run this script again.');

      await mongoose.connection.close();
      return;
    }

    // Create admin user
    console.log('Creating admin user "Victor"...');

    const adminUser = new User({
      username: 'victor',
      password: 'Admin@123', // This will be hashed automatically by the model
      displayName: 'Victor',
      email: 'victor@questrade-portfolio.local',
      role: 'admin',
      isActive: true
    });

    await adminUser.save();

    console.log('\n✓ Admin user created successfully!');
    console.log('\nLogin Credentials:');
    console.log('==================');
    console.log('Username: victor');
    console.log('Password: Admin@123');
    console.log('\n⚠ IMPORTANT: Change this password after first login!');
    console.log('\nYou can now login at: http://localhost:3000/login');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');

  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

// Run the seed function
seedAdminUser();
