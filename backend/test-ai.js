import 'dotenv/config';
import { callGemma, isConfigured } from './services/gemmaService.js';

async function testGemma() {
  console.log('--- GEMMA 3 4B AI TEST ---');
  console.log('Key:', process.env.GEMMA_API_KEY ? process.env.GEMMA_API_KEY.substring(0, 8) + '...' : 'MISSING');
  console.log('Model:', process.env.GEMMA_MODEL || 'gemma-3-4b-it (default)');

  if (!isConfigured()) {
    console.log('FAILURE: GEMMA_API_KEY is not set in .env');
    return;
  }

  try {
    const text = await callGemma('Say hello in one sentence.');
    console.log('Response:', text);
    console.log('SUCCESS: Gemma 3 4B is online!');
  } catch (err) {
    console.error('FAILURE:', err.message);
  }
}

testGemma();