require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('សូមកំណត់ SUPABASE_URL និង SUPABASE_SERVICE_KEY ក្នុងឯកសារ .env');
}

// Service role key ត្រូវប្រើត្រង់នេះ ព្រោះ bot server-side ត្រូវការអានទិន្នន័យ
// ដោយមិនកំណត់ដោយ Row Level Security របស់ user ណាមួយ
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;
