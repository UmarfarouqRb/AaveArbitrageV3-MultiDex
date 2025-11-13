
require('dotenv').config();

function troubleshoot() {
    console.log('--- Troubleshooting Environment ---');

    const privateKey = process.env.PRIVATE_KEY;
    const infuraProjectId = process.env.INFURA_PROJECT_ID;

    if (!privateKey) {
        console.error('[ERROR] PRIVATE_KEY is not set. This is a critical error.');
    } else {
        console.log('[SUCCESS] PRIVATE_KEY is set.');
    }

    if (!infuraProjectId) {
        console.error('[ERROR] INFURA_PROJECT_ID is not set. This will cause issues with RPC connectivity.');
    } else {
        console.log('[SUCCESS] INFURA_PROJECT_ID is set.');
    }

    console.log('--- End of Troubleshooting ---');
}

troubleshoot();
