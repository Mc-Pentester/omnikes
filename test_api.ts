import 'dotenv/config';

async function testProformasAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/proformas');
    const text = await response.text();
    console.log('=== GET /api/proformas ===');
    console.log('Status:', response.status);
    console.log('Response:', text.substring(0, 500));
  } catch (error) {
    console.error('Error testing proformas:', error);
  }
}

async function testCustomersAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/customers');
    const text = await response.text();
    console.log('\n=== GET /api/customers ===');
    console.log('Status:', response.status);
    console.log('Response:', text.substring(0, 500));
  } catch (error) {
    console.error('Error testing customers:', error);
  }
}

async function main() {
  await testProformasAPI();
  await testCustomersAPI();
}

main();
