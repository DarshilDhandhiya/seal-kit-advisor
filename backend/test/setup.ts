// Runs BEFORE any test file imports app code (config reads process.env at import time).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = process.env.TEST_MONGODB_DB || 'sealkit_test';
process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
process.env.ALLOW_UNSIGNED_WEBHOOKS = 'false';
process.env.MEDIA_DIR = './storage/test-media';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPass#123';
process.env.STAFF_EMAIL = 'staff@test.local';
process.env.STAFF_PASSWORD = 'StaffPass#123';
process.env.LOG_LEVEL = 'silent';
process.env.WHATSAPP_GRAPH_URL = 'http://graph.test';
// Make the Cloud API path active (all HTTP calls to graph.test are stubbed in the tests)
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
process.env.SEND_MAX_ATTEMPTS = '2';
