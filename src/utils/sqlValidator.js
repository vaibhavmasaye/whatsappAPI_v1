/**
 * Very simple SQL whitelist validator.
 * - Only allow SELECT
 * - Only allow certain table names & column names (whitelist)
 * - Deny semicolons or multiple statements
 *
 * This is intentionally strict; adapt whitelist to your schema.
 */

const WHITELIST = {
  orders: ['id','order_number','total_price','created_at','customer_id'],
  customers: ['id','first_name','last_name','email','phone'],
  products: ['id','title','sku','price','inventory_quantity']
};

function validateGeneratedSQL(sql) {
  if (!sql || typeof sql !== 'string') return { valid: false, reason: 'No SQL' };

  const s = sql.trim().toLowerCase();

  if (s.includes(';')) return { valid: false, reason: 'Multiple statements or semicolon found' };
  if (!s.startsWith('select')) return { valid: false, reason: 'Only SELECT allowed' };

  // crude table/column extraction: find occurrences of known table names
  const usedTables = Object.keys(WHITELIST).filter(t => new RegExp('\\b' + t + '\\b').test(s));
  if (usedTables.length === 0) return { valid: false, reason: 'No allowed table found' };

  // ensure only allowed columns are present
  // extract columns between SELECT and FROM
  const selMatch = s.match(/select\s+(.+?)\s+from\s+/);
  if (!selMatch) return { valid: false, reason: 'Could not parse SELECT columns' };
  const colsPart = selMatch[1];

  // split columns by comma and sanitize
  const columns = colsPart.split(',').map(c => c.replace(/["`]/g,'').trim().split(' as ')[0].split('.').pop());

  for (const col of columns) {
    // allow '*' if present
    if (col === '*') continue;
    let ok = false;
    for (const t of usedTables) {
      if (WHITELIST[t].includes(col)) { ok = true; break; }
    }
    if (!ok) return { valid: false, reason: `Column ${col} not in whitelist` };
  }

  return { valid: true, reason: 'OK' };
}

module.exports = { validateGeneratedSQL };
