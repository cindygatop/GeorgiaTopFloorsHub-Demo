/* Private, temporary data preparation. No storage, network or provider calls.
 * Public API is also exported for Node tests. Original source values are kept.
 */
(function (root) {
  'use strict';
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_ROWS = 30000;
  const MAX_COLUMNS = 256;
  const PAGE_SIZE = 25;
  const TYPES = ['customers', 'products', 'prices'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const uid = () => root.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clean = value => String(value ?? '').trim();
  const normal = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const copy = value => JSON.parse(JSON.stringify(value));

  function parseDelimited(input, delimiter) {
    const text = String(input).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', quoted = false, afterQuote = false;
    const pushCell = () => { row.push(cell); cell = ''; afterQuote = false; if (row.length > MAX_COLUMNS) throw new Error('Too many columns. Maximum: 256.'); };
    const pushRow = () => { pushCell(); rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) throw new Error('Too many rows. Maximum: 30,000.'); };
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
        else if (char === '"') { quoted = false; afterQuote = true; }
        else cell += char;
      } else if (char === delimiter) pushCell();
      else if (char === '\r' || char === '\n') { pushRow(); if (char === '\r' && text[index + 1] === '\n') index++; }
      else if (char === '"') {
        if (cell !== '' || afterQuote) throw new Error('Unexpected quote in CSV. Check the selected separator and quoting.');
        quoted = true;
      } else if (afterQuote) {
        if (char !== ' ' && char !== '\t') throw new Error('Unexpected text after a quoted CSV cell.');
      } else cell += char;
    }
    if (quoted) throw new Error('Unclosed quoted CSV cell.');
    if (cell !== '' || row.length || afterQuote) pushRow();
    while (rows.length && rows[rows.length - 1].every(value => !clean(value))) rows.pop();
    return rows;
  }

  function parseCSV(text, delimiter) {
    if (String(text).length > MAX_FILE_BYTES) throw new Error('CSV is too large. Maximum: 20 MB.');
    if (delimiter && ![',', ';', '\t', '|'].includes(delimiter)) throw new Error('Unsupported CSV separator.');
    if (delimiter) return { rows: parseDelimited(text, delimiter), delimiter };
    const candidates = [',', ';', '\t', '|'].map(candidate => {
      try {
        const rows = parseDelimited(text, candidate);
        const sample = rows.slice(0, 30).filter(row => row.some(value => clean(value)));
        const counts = new Map();
        sample.forEach(row => counts.set(row.length, (counts.get(row.length) || 0) + 1));
        const mode = [...counts].sort((a, b) => b[1] - a[1])[0] || [1, 0];
        return { rows, delimiter: candidate, score: mode[0] > 1 ? mode[1] / Math.max(1, sample.length) * 100 + Math.min(mode[0], 30) : 0 };
      } catch (error) { return { delimiter: candidate, score: -1, error }; }
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best.score < 0) throw best.error;
    // A quoted malformed comma file must not silently become a one-column file.
    if (best.score === 0 && candidates.some(candidate => candidate.error) && /[,;\t|]/.test(String(text))) {
      throw new Error('Could not safely read this CSV. Select its separator or correct its quoting.');
    }
    return { rows: best.rows, delimiter: best.delimiter };
  }

  function normalizePrice(value) {
    let text = clean(value);
    if (!text) return null;
    text = text.replace(/^(?:USD\s*|\$\s*)/i, '').replace(/\s+/g, '');
    if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
    if (text.includes(',') && text.includes('.')) {
      text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    } else if (text.includes(',')) {
      text = /^-?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
    }
    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function inferMapping(headers, entity) {
    const aliases = {
      displayName: ['displayname', 'customername', 'fullname', 'name', 'customer', 'client', 'nome'],
      customerType: ['customertype', 'clienttype', 'accounttype', 'type', 'category'],
      companyName: ['company', 'companyname', 'businessname'], contactName: ['contactname'], billingName: ['billingname'],
      externalId: ['id', 'externalid', 'contactid', 'productid'], accountId: ['accountid'],
      email: ['email', 'emailaddress', 'email(s)'], phone: ['phone', 'telephone', 'phonenumber'], mobile: ['mobile', 'mobilephone', 'cell', 'cellphone'],
      address: ['address', 'streetaddress', 'billingaddress'], shippingAddress: ['shippingaddress'], city: ['city'], state: ['state'], postalCode: ['zip', 'zipcode', 'postalcode'],
      firstName: ['firstname'], lastName: ['lastname'], website: ['website', 'url'], terms: ['terms', 'paymentterms'], notes: ['notes', 'note', 'comments'],
      sku: ['sku', 'code', 'itemcode', 'productcode'], name: ['item', 'itemname', 'product', 'productname', 'service', 'servicename', 'name', 'description'],
      description: ['description', 'details'], unit: ['unit', 'uom', 'unitofmeasure'], category: ['category'], unitPrice: ['price', 'unitprice', 'rate', 'standardprice', 'defaultprice'], currency: ['currency']
    };
    const allowed = entity === 'customers' ? CUSTOMER_FIELDS : entity === 'products' ? PRODUCT_FIELDS : PRICE_FIELDS;
    const used = new Set();
    return headers.map(header => {
      const key = normal(header).replace(/[^a-z0-9()]/g, '');
      const found = allowed.find(field => !used.has(field) && (aliases[field] || []).includes(key));
      if (found) used.add(found);
      return found || (entity === 'products' && /^(standard|contractor|subcontractor|retail|homeowner|builder|wholesale)$/.test(key) ? 'price:' + clean(header) : '');
    });
  }

  const CUSTOMER_FIELDS = ['displayName', 'customerType', 'companyName', 'contactName', 'billingName', 'firstName', 'lastName', 'email', 'phone', 'mobile', 'address', 'shippingAddress', 'city', 'state', 'postalCode', 'country', 'website', 'terms', 'notes', 'externalId', 'accountId'];
  const PRODUCT_FIELDS = ['name', 'sku', 'description', 'unit', 'category', 'unitPrice', 'customerType', 'currency', 'notes', 'externalId'];
  const PRICE_FIELDS = ['productName', 'sku', 'customerType', 'unitPrice', 'unit', 'currency', 'notes', 'externalId'];
  const LABELS = { displayName: 'Customer / account name', customerType: 'Customer type', companyName: 'Company name', contactName: 'Contact person', billingName: 'Billing name', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', mobile: 'Mobile', address: 'Billing / property address', shippingAddress: 'Shipping address', city: 'City', state: 'State', postalCode: 'ZIP / postal code', country: 'Country', website: 'Website', terms: 'Payment terms', notes: 'Notes', externalId: 'Original ID', accountId: 'Account ID', name: 'Product / service name', sku: 'SKU / item code', description: 'Description', unit: 'Unit', category: 'Category', unitPrice: 'Unit price', currency: 'Currency', productName: 'Product / service name' };

  function normalizeRows({ rows, headers, mapping, entity = 'customers', source = {}, rowOffset = 2 }) {
    if (!TYPES.includes(entity)) throw new Error('Choose a supported record type.');
    if (!Array.isArray(rows) || !Array.isArray(headers) || !Array.isArray(mapping)) throw new Error('Rows, headers and column mapping are required.');
    const destinations = mapping.filter(value => value && value !== 'ignore' && !value.startsWith('price:'));
    if (new Set(destinations).size !== destinations.length) throw new Error('Map each field once. Use separate customer types for price columns.');
    const tierNames = mapping.filter(value => value?.startsWith('price:')).map(value => normal(value.slice(6)));
    if (tierNames.some(value => !value) || new Set(tierNames).size !== tierNames.length) throw new Error('Each price column needs a distinct customer type label.');
    const records = [], warnings = [];
    rows.forEach((row, index) => {
      if (!row.some(value => clean(value))) return;
      const fields = {}, prices = [], rowWarnings = [];
      mapping.forEach((destination, column) => {
        if (!destination || destination === 'ignore') return;
        const value = clean(row[column]);
        if (destination.startsWith('price:')) {
          if (!value) return; // Empty price cells are absent, never zero.
          const amount = normalizePrice(value);
          if (amount === null) rowWarnings.push(`Price for ${destination.slice(6)} is text or invalid; original value was preserved.`);
          prices.push({ customerType: clean(destination.slice(6)), unitPrice: amount, status: amount !== null && amount >= 0 ? 'ready' : 'needs-review', originalPrice: String(row[column] ?? '') });
        } else {
          const key = destination === 'name' && entity === 'customers' ? 'displayName' : destination;
          if (!['__proto__', 'constructor', 'prototype'].includes(key)) fields[key] = value;
        }
      });
      if (entity === 'customers') {
        fields.displayName ||= [fields.firstName, fields.lastName].filter(Boolean).join(' ') || fields.contactName || fields.billingName || fields.companyName;
      } else {
        fields.currency ||= 'USD';
        if (own(fields, 'unitPrice')) {
          const original = fields.unitPrice;
          fields.unitPrice = normalizePrice(original);
          if (clean(original) && fields.unitPrice === null) rowWarnings.push('Unit price is text or invalid; original value was preserved.');
          if (entity === 'products' && fields.unitPrice !== null) prices.unshift({ customerType: fields.customerType || 'Standard', unitPrice: fields.unitPrice, status: fields.unitPrice >= 0 ? 'ready' : 'needs-review', originalPrice: original });
        }
        prices.forEach(price => Object.assign(price, { currency: fields.currency, unit: fields.unit || '', sku: fields.sku || '', productName: fields.name || fields.productName || '' }));
      }
      const record = { id: uid(), entity, fields, source: { file: clean(source.file), sheet: clean(source.sheet), row: rowOffset + index }, sourceColumns: row.map((value, column) => ({ column: column + 1, header: String(headers[column] || `Column ${column + 1}`), value: String(value ?? '') })), warnings: rowWarnings };
      if (entity === 'products') record.prices = prices;
      record.warnings.push(...validateRecord(record));
      records.push(record);
      warnings.push(...record.warnings.map(message => ({ id: record.id, row: record.source.row, message })));
    });
    return { records, warnings };
  }

  function validateRecord(record) {
    const fields = record.fields || {}, issues = [];
    if (record.entity === 'customers') {
      if (!clean(fields.displayName || fields.name || fields.companyName)) issues.push('Customer name or company is required.');
      if (fields.email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(fields.email)) issues.push('Email needs review; use one valid address or keep the original for manual correction.');
    } else if (record.entity === 'products') {
      if (!clean(fields.name || fields.sku)) issues.push('Product name or SKU is required.');
      (record.prices || []).forEach(price => { if (!Number.isFinite(price.unitPrice) || price.unitPrice < 0) issues.push(`Review the price for ${price.customerType || 'an unlabeled customer type'}.`); });
    } else {
      if (!clean(fields.productName || fields.sku)) issues.push('Product name or SKU is required.');
      if (!clean(fields.customerType)) issues.push('Customer type is required for a price row.');
      if (!Number.isFinite(fields.unitPrice) || fields.unitPrice < 0) issues.push('A valid nonnegative price is required.');
    }
    return [...new Set(issues)];
  }

  function reviewDuplicates(records) {
    const buckets = new Map();
    records.forEach(record => {
      const fields = record.fields || {}, keys = [];
      if (fields.externalId) keys.push(['original ID', `${record.entity}:id:${normal(fields.externalId)}`]);
      if (record.entity === 'customers') {
        if (fields.email) keys.push(['email', `customers:email:${normal(fields.email)}`]);
        [fields.phone, fields.mobile].forEach(value => { const digits = clean(value).replace(/\D/g, ''); if (digits.length >= 7) keys.push(['phone', `customers:phone:${digits.slice(-10)}`]); });
        const name = normal(fields.displayName || fields.name || fields.companyName);
        if (name) keys.push(['customer name', `customers:name:${name}`]);
      } else if (record.entity === 'products') {
        if (fields.sku) keys.push(['SKU', `products:sku:${normal(fields.sku)}`]);
        if (fields.name) keys.push(['product name and unit', `products:name:${normal(fields.name)}:${normal(fields.unit)}`]);
      } else {
        const product = normal(fields.sku || fields.productName);
        if (product && fields.customerType) keys.push(['product and customer price type', `prices:${product}:${normal(fields.customerType)}:${normal(fields.unit)}`]);
      }
      keys.forEach(([reason, key]) => { if (!buckets.has(key)) buckets.set(key, { ids: new Set(), reasons: [reason] }); buckets.get(key).ids.add(record.id); });
    });
    const groups = new Map();
    [...buckets.values()].filter(bucket => bucket.ids.size > 1).forEach(bucket => {
      const ids = [...bucket.ids].sort(), key = ids.join('|');
      if (!groups.has(key)) groups.set(key, { ids, reasons: [] });
      groups.get(key).reasons.push(...bucket.reasons);
    });
    return [...groups.values()].map(group => ({ ...group, reasons: [...new Set(group.reasons)] }));
  }

  function safeCSVCell(value) {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function expandForExport(records, { customers = true, products = true, prices = true } = {}) {
    const result = [];
    records.forEach(record => {
      if (record.entity === 'customers' && customers || record.entity === 'prices' && prices) result.push(copy(record));
      if (record.entity !== 'products') return;
      if (products) { const product = copy(record); if (!prices) { delete product.prices; delete product.fields.unitPrice; delete product.fields.customerType; product.sourceColumns = []; delete product.sourceFormulas; product.warnings = []; } result.push(product); }
      if (prices && !products) (record.prices || []).forEach((price, index) => result.push({ id: `${record.id}-price-${index + 1}`, entity: 'prices', fields: { ...copy(price), productId: record.id }, source: copy(record.source || {}), sourceColumns: copy(record.sourceColumns || []), review: copy(record.review || {}) }));
    });
    return result;
  }

  function toCSV(records) {
    const flat = [];
    records.forEach(record => {
      flat.push({ entity: record.entity, id: record.id, ...record.fields, priceTypes: record.entity === 'products' ? JSON.stringify(record.prices || []) : '', sourceFile: record.source?.file || '', sourceSheet: record.source?.sheet || '', sourceRow: record.source?.row || '', reviewDecision: record.review?.decision || '' });
      if (record.entity === 'products') (record.prices || []).forEach((price, index) => flat.push({ entity: 'prices', id: `${record.id}-price-${index + 1}`, productId: record.id, ...price, sourceFile: record.source?.file || '', sourceSheet: record.source?.sheet || '', sourceRow: record.source?.row || '', reviewDecision: record.review?.decision || '' }));
    });
    const columns = [...new Set(['entity', 'id', ...flat.flatMap(row => Object.keys(row))])];
    return '\uFEFF' + [columns.map(safeCSVCell).join(','), ...flat.map(row => columns.map(column => safeCSVCell(row[column])).join(','))].join('\r\n');
  }

  function exportJSON(records) {
    return JSON.stringify({ schemaVersion: 'gtf-data-workspace/1', exportedAt: new Date().toISOString(), persistence: 'temporary-session', records: copy(records) }, null, 2);
  }

  function importJSON(text) {
    if (String(text).length > MAX_FILE_BYTES) throw new Error('JSON is too large. Maximum: 20 MB.');
    const data = JSON.parse(text);
    if (!data || data.schemaVersion !== 'gtf-data-workspace/1' || !Array.isArray(data.records) || data.records.length > MAX_ROWS) throw new Error('Use a JSON export from the GTF data workspace.');
    const ids = new Set();
    return data.records.map(record => {
      if (!record || !TYPES.includes(record.entity) || !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields) || !Array.isArray(record.sourceColumns || [])) throw new Error('Invalid workspace record.');
      const safe = copy(record);
      const invalidKey = value => value && typeof value === 'object' && Object.entries(value).some(([key, child]) => ['__proto__', 'constructor', 'prototype'].includes(key) || invalidKey(child));
      if (invalidKey(safe)) throw new Error('Unsupported property in workspace JSON.');
      if (!safe.id || ids.has(safe.id)) safe.id = uid();
      ids.add(safe.id);
      safe.warnings = [...new Set([...(Array.isArray(safe.warnings) ? safe.warnings.filter(value => typeof value === 'string') : []), ...validateRecord(safe)])];
      return safe;
    });
  }

  function exportSchema() {
    return JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'GTF temporary data workspace export', type: 'object', required: ['schemaVersion', 'records'],
      description: 'Preparation format, not a database migration or proof of persistence. Organization identity and authorization must be assigned by a secure backend. Full JSON exports may contain private original source values. Product-only exports omit original columns to exclude source prices. CSV uses normalized rows and escapes spreadsheet formula prefixes.',
      properties: {
        schemaVersion: { const: 'gtf-data-workspace/1' }, exportedAt: { type: 'string', format: 'date-time' }, persistence: { const: 'temporary-session' },
        records: { type: 'array', maxItems: MAX_ROWS, items: { type: 'object', required: ['id', 'entity', 'fields'], properties: {
          id: { type: 'string' }, entity: { enum: TYPES },
          fields: { type: 'object', description: `Customer fields: ${CUSTOMER_FIELDS.join(', ')}. Product fields: ${PRODUCT_FIELDS.join(', ')}. Price fields: ${PRICE_FIELDS.join(', ')}. Prices use numbers or null, never an invented zero for missing data.`, additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } },
          prices: { type: 'array', items: { $ref: '#/$defs/customerPrice' } }, warnings: { type: 'array', items: { type: 'string' } },
          source: { type: 'object', properties: { file: { type: 'string' }, sheet: { type: 'string' }, row: { type: 'integer', minimum: 1 } } },
          sourceColumns: { type: 'array', items: { type: 'object', required: ['column', 'header', 'value'], properties: { column: { type: 'integer', minimum: 1 }, header: { type: 'string' }, value: { type: 'string' } } } },
          review: { type: 'object', properties: { decision: { enum: ['keep-separate', 'corrected'] }, reviewedAt: { type: 'string', format: 'date-time' } } }
        } } }
      },
      $defs: { customerPrice: { type: 'object', required: ['customerType', 'unitPrice'], properties: { customerType: { type: 'string', minLength: 1 }, unitPrice: { type: ['number', 'null'] }, status: { enum: ['ready', 'needs-review'] }, originalPrice: { type: 'string' }, currency: { type: 'string' }, unit: { type: 'string' }, sku: { type: 'string' }, productName: { type: 'string' } } } }
    }, null, 2);
  }

  // Minimal XLSX reader: bounded ZIP + XML. No formulas, macros or remote files.
  async function readXLSX(buffer) {
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('XLSX is too large. Maximum: 20 MB.');
    if (typeof root.DOMParser !== 'function' || typeof root.DecompressionStream !== 'function') throw new Error('This browser cannot read XLSX locally. Use a current browser or export the sheet as CSV.');
    const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder('utf-8');
    let end = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
    if (end < 0) throw new Error('This is not a supported XLSX ZIP file.');
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Multi-volume ZIP files are not supported.');
    const count = view.getUint16(end + 10, true), directory = view.getUint32(end + 16, true), entries = new Map();
    if (count > 4096 || directory >= bytes.length) throw new Error('Unsupported or oversized XLSX structure.');
    let position = directory, expanded = 0;
    for (let index = 0; index < count; index++) {
      if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) throw new Error('Invalid XLSX directory.');
      const flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true), crc = view.getUint32(position + 16, true), compressed = view.getUint32(position + 20, true), size = view.getUint32(position + 24, true), nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true), offset = view.getUint32(position + 42, true);
      if (position + 46 + nameLength + extraLength + commentLength > bytes.length || flags & 1 || ![0, 8].includes(method)) throw new Error('Encrypted or unsupported XLSX file.');
      const name = decoder.decode(bytes.slice(position + 46, position + 46 + nameLength));
      expanded += size;
      if (size > 32 * 1024 * 1024 || expanded > 64 * 1024 * 1024 || /(^|\/)\.\.(\/|$)/.test(name) || name.startsWith('/')) throw new Error('XLSX exceeds safe reading limits.');
      if (entries.has(name)) throw new Error('Duplicate XLSX ZIP entry.');
      entries.set(name, { method, crc, compressed, size, offset });
      position += 46 + nameLength + extraLength + commentLength;
    }
    const cache = new Map();
    const crcTable = Uint32Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
    async function xml(name) {
      if (cache.has(name)) return cache.get(name);
      const entry = entries.get(name);
      if (!entry) return null;
      const offset = entry.offset;
      if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error('Invalid XLSX entry.');
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (start + entry.compressed > bytes.length) throw new Error('Truncated XLSX entry.');
      let data = bytes.slice(start, start + entry.compressed);
      if (entry.method === 8) {
        let stream;
        try { stream = new Blob([data]).stream().pipeThrough(new root.DecompressionStream('deflate-raw')); }
        catch (error) { throw new Error('This browser cannot decompress XLSX locally. Export the sheet as CSV.'); }
        const reader = stream.getReader(), chunks = []; let length = 0;
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          length += chunk.value.length;
          if (length > entry.size || length > 32 * 1024 * 1024) { await reader.cancel(); throw new Error('XLSX entry exceeds its declared size.'); }
          chunks.push(chunk.value);
        }
        data = new Uint8Array(length); let next = 0; chunks.forEach(chunk => { data.set(chunk, next); next += chunk.length; });
      }
      if (data.length !== entry.size) throw new Error('XLSX entry size does not match its directory.');
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
      if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new Error('XLSX checksum failed. The file may be damaged.');
      const text = decoder.decode(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML entities are not allowed in XLSX files.');
      const document = new root.DOMParser().parseFromString(text, 'application/xml');
      if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid XML in XLSX.');
      cache.set(name, document); return document;
    }
    const elements = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
    const workbook = await xml('xl/workbook.xml'), relationships = await xml('xl/_rels/workbook.xml.rels');
    if (!workbook || !relationships) throw new Error('Workbook metadata is missing.');
    const paths = new Map();
    elements(relationships, 'Relationship').forEach(relation => {
      if (relation.getAttribute('TargetMode') === 'External') return;
      const target = relation.getAttribute('Target') || '';
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      if (!path.includes('..') && !path.includes(':')) paths.set(relation.getAttribute('Id'), path);
    });
    const sharedDocument = await xml('xl/sharedStrings.xml');
    const shared = sharedDocument ? elements(sharedDocument, 'si').map(item => elements(item, 't').map(part => part.textContent).join('')) : [];
    const sheets = [], warnings = [];
    for (const sheet of elements(workbook, 'sheet')) {
      const path = paths.get(sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const document = path ? await xml(path) : null;
      if (!document) continue;
      const rows = [], formulas = [];
      let cells = 0;
      for (const rowElement of elements(document, 'row')) {
        const rowIndex = Number(rowElement.getAttribute('r')) - 1;
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > MAX_ROWS) throw new Error('Worksheet exceeds the 30,000-row limit.');
        const row = [];
        for (const cell of elements(rowElement, 'c')) {
          const reference = cell.getAttribute('r') || '', columnLetters = reference.match(/^[A-Z]+/i)?.[0];
          if (!columnLetters) throw new Error('A worksheet cell has no supported address.');
          const column = [...columnLetters.toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
          if (column >= MAX_COLUMNS || ++cells > 500000) throw new Error('Worksheet exceeds safe cell limits.');
          const type = cell.getAttribute('t'), value = elements(cell, 'v')[0]?.textContent ?? '', formula = elements(cell, 'f')[0]?.textContent;
          if (formula !== undefined) formulas.push({ row: rowIndex + 1, column: column + 1, formula: '=' + formula });
          let text = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? elements(cell, 't').map(part => part.textContent).join('') : type === 'b' ? value === '1' ? 'true' : 'false' : value;
          if (formula !== undefined && !text) text = '=' + formula;
          row[column] = text;
        }
        rows[rowIndex] = Array.from({ length: row.length }, (_, column) => row[column] ?? '');
      }
      for (let row = 0; row < rows.length; row++) rows[row] ||= [];
      while (rows.length && rows[rows.length - 1].every(value => !clean(value))) rows.pop();
      if (formulas.length) warnings.push('Excel formulas were not executed. Cached values may be outdated; review before using prices.');
      sheets.push({ name: sheet.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows, formulas });
    }
    if (!sheets.length) throw new Error('No readable worksheets were found.');
    return { sheets, warnings };
  }

  const api = { parseCSV, normalizePrice, inferMapping, normalizeRows, validateRecord, reviewDuplicates, safeCSVCell, toCSV, exportJSON, importJSON, exportSchema, expandForExport, readXLSX };
  root.GTFDataTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  function initialize() {
    if (document.body.dataset.page !== 'data-tools') return;
    if (root.GTFAuth && !root.GTFAuth.requireRole('office')) return;
    const $ = id => document.getElementById(id);
    const state = { workbook: null, fileName: '', csvText: null, mapping: [], preview: [], workspace: [], selected: new Set(), exportSelected: new Set(), reviewed: new Set(), previewPage: 0, sessionPage: 0, duplicates: [], editor: null, busy: false };
    const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = String(text); if (className) element.className = className; return element; };
    const message = (text, error = false) => { $('statusMessage').textContent = text; $('statusMessage').classList.toggle('error', error); };
    const button = (text, action, className = 'button subtle') => { const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element; };
    const sheet = () => state.workbook?.sheets[Number($('sheetSelect').value) || 0];
    const headers = () => { const current = sheet(); const index = Math.max(0, Number($('headerRow').value) - 1); const width = (current?.rows || []).reduce((size, row) => Math.max(size, row.length), 0); return Array.from({ length: width }, (_, column) => clean(current?.rows[index]?.[column]) || `Column ${column + 1}`); };
    const title = record => clean(record.fields.displayName || record.fields.name || record.fields.productName || record.fields.companyName || record.fields.sku) || 'Unnamed record';
    const detail = record => record.entity === 'customers' ? [record.fields.email, record.fields.phone || record.fields.mobile, record.fields.address].filter(Boolean).join(' · ') : [record.fields.sku, record.fields.unit, record.entity === 'prices' ? record.fields.customerType : record.fields.category].filter(Boolean).join(' · ');
    const duplicateFor = id => state.duplicates.filter(group => group.ids.includes(id));
    const issuesFor = record => [...new Set([...(record.warnings || []), ...validateRecord(record)])];
    const requiresReview = record => issuesFor(record).length || duplicateFor(record.id).length;
    const canUse = record => !validateRecord(record).some(issue => /required|nonnegative/.test(issue)) && (!requiresReview(record) || state.reviewed.has(record.id));

    function clearPreview() { state.preview = []; state.selected.clear(); state.reviewed.clear(); state.previewPage = 0; $('previewSection').hidden = true; }
    function refreshDuplicates() { state.duplicates = reviewDuplicates([...state.workspace, ...state.preview]); }
    function setupMapping() {
      clearPreview();
      const current = sheet();
      if (!current) return;
      const names = headers(); state.mapping = inferMapping(names, $('entitySelect').value);
      const allowed = $('entitySelect').value === 'customers' ? CUSTOMER_FIELDS : $('entitySelect').value === 'products' ? PRODUCT_FIELDS : PRICE_FIELDS;
      const grid = $('mappingGrid'); grid.replaceChildren();
      names.forEach((name, column) => {
        const item = node('label', undefined, 'mapping-item');
        item.append(node('strong', `${column + 1}. ${name}`));
        const sample = current.rows.slice(Number($('headerRow').value), Number($('headerRow').value) + 5).map(row => clean(row[column])).find(Boolean) || '(empty)';
        item.append(node('small', sample.length > 90 ? sample.slice(0, 87) + '…' : sample));
        const select = node('select'); select.setAttribute('aria-label', `Map column ${column + 1}: ${name}`);
        select.append(new Option('Keep original only', ''));
        allowed.forEach(field => select.append(new Option(LABELS[field] || field, field)));
        if ($('entitySelect').value === 'products') select.append(new Option('Price by customer type…', '__tier__'));
        select.value = state.mapping[column]?.startsWith('price:') ? '__tier__' : state.mapping[column];
        const tier = node('input'); tier.type = 'text'; tier.placeholder = 'Customer type (for example, Contractor)'; tier.value = name; tier.hidden = select.value !== '__tier__'; tier.setAttribute('aria-label', `Customer price type for column ${column + 1}`);
        select.addEventListener('change', () => { tier.hidden = select.value !== '__tier__'; state.mapping[column] = select.value === '__tier__' ? 'price:' + clean(tier.value) : select.value; clearPreview(); });
        tier.addEventListener('input', () => { state.mapping[column] = 'price:' + clean(tier.value); clearPreview(); });
        item.append(select, tier); grid.append(item);
      });
      $('sourceSummary').textContent = `${state.fileName} · ${current.name} · ${current.rows.length.toLocaleString()} source rows · ${names.length} columns. Original source values are retained.`;
    }

    function setWorkbook(workbook, fileName) {
      state.workbook = workbook; state.fileName = fileName;
      $('sheetSelect').replaceChildren(...workbook.sheets.map((item, index) => new Option(`${item.name} (${Math.max(0, item.rows.length - 1)} rows)`, String(index))));
      $('sheetSelect').value = String(Math.max(0, workbook.sheets.findIndex(item => item.rows.length)));
      $('headerRow').value = '1'; $('sourceSetup').hidden = false; $('delimiterLabel').hidden = state.csvText === null;
      setupMapping();
      if (workbook.warnings?.length) message(workbook.warnings.join(' '));
    }

    async function loadFile() {
      const file = $('sourceFile').files?.[0]; if (!file) return;
      if (file.size > MAX_FILE_BYTES) { message('File is too large. Choose a file up to 20 MB.', true); return; }
      state.busy = true; $('sourceFile').disabled = true; message('Reading your file locally…');
      try {
        state.csvText = null; clearPreview();
        const suffix = file.name.split('.').pop().toLowerCase();
        if (suffix === 'xlsx') setWorkbook(await readXLSX(await file.arrayBuffer()), file.name);
        else if (suffix === 'json') {
          const records = importJSON(await file.text()); state.workbook = null; state.fileName = file.name; $('sourceSetup').hidden = true;
          state.preview = records.map(record => { if (state.workspace.some(item => item.id === record.id)) { record.originalWorkspaceId = record.id; record.id = uid(); } return record; }); state.selected = new Set(records.map(record => record.id)); refreshDuplicates();
          $('sourceSummary').textContent = `${file.name} · ${records.length} normalized records read into preview.`;
          renderPreview();
        } else if (['csv', 'tsv'].includes(suffix)) {
          state.csvText = await file.text();
          if (state.csvText.includes('\uFFFD')) { state.csvText = new TextDecoder('windows-1252').decode(await file.arrayBuffer()); message('A legacy text encoding was detected. Review accented characters before adding rows.'); }
          const requested = $('delimiterSelect').value, delimiter = requested === 'auto' ? suffix === 'tsv' ? '\t' : undefined : requested === 'tab' ? '\t' : requested;
          const parsed = parseCSV(state.csvText, delimiter);
          setWorkbook({ sheets: [{ name: 'CSV', rows: parsed.rows }], warnings: [] }, file.name);
        } else throw new Error('Choose a CSV, TSV, XLSX or GTF workspace JSON file.');
        if (!$('statusMessage').textContent.startsWith('Excel') && !$('statusMessage').textContent.startsWith('A legacy')) message('File read locally. Review its worksheet, header row and column mapping.');
      } catch (error) { message(error.message || 'Could not read this file.', true); clearPreview(); state.workbook = null; $('sourceSetup').hidden = true; }
      finally { state.busy = false; $('sourceFile').disabled = false; }
    }

    function buildPreview() {
      try {
        const current = sheet(); if (!current) throw new Error('Choose a source file first.');
        const headerIndex = Number($('headerRow').value) - 1;
        if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= current.rows.length) throw new Error('Choose an existing header row.');
        if (!state.mapping.some(Boolean)) throw new Error('Map at least the customer name or product / price fields.');
        const normalized = normalizeRows({ rows: current.rows.slice(headerIndex + 1), headers: headers(), mapping: state.mapping, entity: $('entitySelect').value, source: { file: state.fileName, sheet: current.name }, rowOffset: headerIndex + 2 });
        clearPreview(); state.preview = normalized.records;
        // Preserve formula expressions alongside cached values; never execute them.
        state.preview.forEach(record => { const formulas = current.formulas?.filter(formula => formula.row === record.source.row); if (formulas?.length) { record.sourceFormulas = copy(formulas); record.warnings.push('Excel formula cached values need review; formulas were not recalculated.'); } });
        refreshDuplicates(); state.preview.forEach(record => state.selected.add(record.id));
        renderPreview(); message('Preview ready. Possible duplicates and questionable values need your review. Nothing has been saved.');
      } catch (error) { message(error.message, true); }
    }

    function filteredPreview() { const filter = $('previewFilter').value; return state.preview.filter(record => filter === 'review' ? requiresReview(record) && !state.reviewed.has(record.id) : filter === 'selected' ? state.selected.has(record.id) : true); }
    function pageRows(records, kind) {
      const key = kind + 'Page'; state[key] = Math.min(state[key], Math.max(0, Math.ceil(records.length / PAGE_SIZE) - 1));
      const start = state[key] * PAGE_SIZE;
      $(kind + 'Page').textContent = records.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, records.length)} of ${records.length}` : 'No rows';
      $(kind + 'Prev').disabled = state[key] === 0; $(kind + 'Next').disabled = start + PAGE_SIZE >= records.length;
      return records.slice(start, start + PAGE_SIZE);
    }

    function renderPreview() {
      $('previewSection').hidden = false; refreshDuplicates();
      const pending = state.preview.filter(record => requiresReview(record) && !state.reviewed.has(record.id));
      $('previewCount').textContent = `${state.preview.length.toLocaleString()} rows`;
      $('previewIssues').hidden = !pending.length;
      $('previewIssues').textContent = `${pending.length} row(s) need review, including possible duplicates or incomplete values. Keeping a row does not merge it with another record.`;
      const body = $('previewRows'); body.replaceChildren();
      pageRows(filteredPreview(), 'preview').forEach(record => {
        const row = node('tr'), check = node('input'); check.type = 'checkbox'; check.checked = state.selected.has(record.id); check.setAttribute('aria-label', `Use source row ${record.source?.row || ''}`);
        check.addEventListener('change', () => { if (check.checked) state.selected.add(record.id); else state.selected.delete(record.id); renderPreview(); });
        const cell = node('td'); cell.append(check); row.append(cell, node('td', record.source?.row || '—'), node('td', title(record)), node('td', detail(record)));
        const prices = node('td');
        if (record.prices?.length) record.prices.forEach(price => { prices.append(node('strong', price.customerType), node('small', Number.isFinite(price.unitPrice) ? `${price.currency || 'USD'} ${price.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}${price.unit ? ' / ' + price.unit : ''}` : 'Unavailable · review source')); });
        else prices.textContent = record.fields.customerType || '—';
        row.append(prices);
        const status = node('td'); status.append(node('span', requiresReview(record) ? state.reviewed.has(record.id) ? 'Reviewed · keep separate' : 'Needs review' : 'Ready', 'review-pill' + (!requiresReview(record) || state.reviewed.has(record.id) ? ' ready' : ''))); row.append(status);
        const action = node('td'); action.append(button('Review / edit', () => openEditor(record, 'preview'))); row.append(action); body.append(row);
      });
      if (!body.children.length) { const row = node('tr'), cell = node('td', 'No rows match this view.', 'empty-cell'); cell.colSpan = 7; row.append(cell); body.append(row); }
      const selected = state.preview.filter(record => state.selected.has(record.id)), unresolved = selected.filter(record => !canUse(record));
      $('selectedSummary').textContent = `${selected.length} selected · ${unresolved.length} need review / correction`;
      $('addToSession').disabled = !selected.length || unresolved.length > 0;
      $('selectPreview').checked = state.preview.length > 0 && state.preview.filter(canUse).every(record => state.selected.has(record.id));
    }

    function visibleSession() { return state.workspace.filter(record => $('sessionFilter').value === 'all' || record.entity === $('sessionFilter').value); }
    function renderSession() {
      const counts = TYPES.map(type => `${state.workspace.filter(record => record.entity === type).length} ${type}`);
      const tiers = state.workspace.reduce((sum, record) => sum + (record.prices?.length || 0), 0);
      $('sessionSummary').textContent = state.workspace.length ? `${counts.join(' · ')} · ${tiers} product price entries. Temporary session only; not saved to the Hub.` : 'No records in this session yet.';
      const body = $('sessionRows'); body.replaceChildren();
      pageRows(visibleSession(), 'session').forEach(record => {
        const row = node('tr'), input = node('input'); input.type = 'checkbox'; input.checked = state.exportSelected.has(record.id); input.setAttribute('aria-label', 'Export ' + title(record)); input.addEventListener('change', () => { if (input.checked) state.exportSelected.add(record.id); else state.exportSelected.delete(record.id); renderSession(); });
        const check = node('td'); check.append(input); row.append(check, node('td', record.entity), node('td', title(record)), node('td', detail(record)));
        const actions = node('td'); actions.append(button('Edit', () => openEditor(record, 'session')), document.createTextNode(' '), button('Remove', () => { state.workspace = state.workspace.filter(item => item.id !== record.id); state.exportSelected.delete(record.id); renderSession(); if (state.preview.length) renderPreview(); })); row.append(actions); body.append(row);
      });
      if (!body.children.length) { const row = node('tr'), cell = node('td', 'Add reviewed rows to this temporary session to prepare an export.', 'empty-cell'); cell.colSpan = 5; row.append(cell); body.append(row); }
      $('selectSession').checked = visibleSession().length > 0 && visibleSession().every(record => state.exportSelected.has(record.id));
      $('exportJSON').disabled = $('exportCSV').disabled = !state.exportSelected.size;
    }

    function openEditor(record, location) {
      state.editor = { record, location, fields: [], prices: [] }; $('editTitle').textContent = 'Review ' + title(record); $('editSource').textContent = `${record.source?.file || 'Imported workspace'} · ${record.source?.sheet || ''} · row ${record.source?.row || '—'}`;
      const duplicateGroups = duplicateFor(record.id), issues = [...issuesFor(record), ...duplicateGroups.map(group => `Possible duplicate by ${group.reasons.join(', ')} (${group.ids.length} records).`)];
      $('editWarnings').hidden = !issues.length; $('editWarnings').textContent = [...new Set(issues)].join(' ');
      const fields = $('editFields'); fields.replaceChildren();
      const requiredFields = record.entity === 'customers' ? ['displayName', 'email', 'phone', 'mobile', 'address', 'customerType'] : record.entity === 'products' ? ['name', 'sku', 'unit', 'currency'] : ['productName', 'sku', 'customerType', 'unitPrice', 'unit', 'currency'];
      [...new Set([...requiredFields, ...Object.keys(record.fields)])].filter(key => !(record.entity === 'products' && record.prices?.length && key === 'unitPrice')).forEach(key => {
        const label = node('label', LABELS[key] || key), input = key === 'notes' || /address/i.test(key) ? node('textarea') : node('input');
        if (input.tagName === 'INPUT') input.type = 'text';
        input.value = record.fields[key] ?? ''; if (key === 'unitPrice') input.inputMode = 'decimal';
        label.append(input); if (key === 'notes') label.className = 'wide'; fields.append(label); state.editor.fields.push({ key, input });
      });
      (record.prices || []).forEach((price, index) => {
        const typeLabel = node('label', `Price ${index + 1} · customer type`), type = node('input'); type.value = price.customerType || ''; typeLabel.append(type);
        const priceLabel = node('label', `Price ${index + 1} · amount`), input = node('input'); input.inputMode = 'decimal'; input.value = price.unitPrice ?? price.originalPrice ?? ''; priceLabel.append(input); fields.append(typeLabel, priceLabel); state.editor.prices.push({ index, type, input });
      });
      const original = $('editOriginal'); original.replaceChildren(); (record.sourceColumns || []).forEach(column => original.append(node('dt', `${column.column}. ${column.header}`), node('dd', column.value)));
      $('duplicateDecision').hidden = !issues.length; $('keepSeparate').checked = record.review?.decision === 'keep-separate';
      $('editDialog').showModal();
    }

    function saveEditor() {
      const editor = state.editor; if (!editor) return;
      const updated = copy(editor.record);
      editor.fields.forEach(({ key, input }) => { updated.fields[key] = key === 'unitPrice' ? normalizePrice(input.value) : clean(input.value); });
      editor.prices.forEach(({ index, type, input }) => { updated.prices[index].customerType = clean(type.value); updated.prices[index].unitPrice = normalizePrice(input.value); Object.assign(updated.prices[index], { status: Number.isFinite(updated.prices[index].unitPrice) && updated.prices[index].unitPrice >= 0 ? 'ready' : 'needs-review', currency: updated.fields.currency || 'USD', unit: updated.fields.unit || '', productName: updated.fields.name || '', sku: updated.fields.sku || '' }); });
      const blocking = validateRecord(updated).filter(issue => /required|nonnegative/.test(issue));
      if ((updated.prices || []).some(price => !price.customerType)) blocking.push('Every price needs a customer type.');
      if (new Set((updated.prices || []).map(price => normal(price.customerType))).size !== (updated.prices || []).length) blocking.push('Customer price type labels must be distinct.');
      if (blocking.length) { $('editWarnings').hidden = false; $('editWarnings').textContent = blocking.join(' '); return; }
      updated.warnings = validateRecord(updated);
      if (updated.entity === 'products' && own(updated.fields, 'unitPrice') && updated.prices?.length) updated.fields.unitPrice = updated.prices[0].unitPrice;
      const list = editor.location === 'preview' ? state.preview : state.workspace;
      const index = list.findIndex(record => record.id === updated.id);
      const proposedRecords = [...state.workspace, ...state.preview].map(record => record.id === updated.id ? updated : record);
      const proposedDuplicates = reviewDuplicates(proposedRecords).some(group => group.ids.includes(updated.id));
      if ((issuesFor(updated).length || proposedDuplicates) && !$('keepSeparate').checked) { $('duplicateDecision').hidden = false; $('editWarnings').hidden = false; $('editWarnings').textContent = 'Review the warnings and check the decision box to keep this row, or exclude it from the preview.'; return; }
      list[index] = updated; refreshDuplicates();
      if ($('keepSeparate').checked) { state.reviewed.add(updated.id); updated.review = { decision: 'keep-separate', reviewedAt: new Date().toISOString() }; }
      else { state.reviewed.add(updated.id); updated.review = { decision: 'corrected', reviewedAt: new Date().toISOString() }; }
      $('editDialog').close(); renderSession(); if (state.preview.length) renderPreview(); message('Row changes applied in this temporary session. Original source columns were preserved.');
    }

    function addToSession() {
      const selected = state.preview.filter(record => state.selected.has(record.id)); refreshDuplicates();
      if (!selected.length || selected.some(record => !canUse(record))) { message('Review or exclude all flagged selected rows first.', true); return; }
      selected.forEach(record => { if (state.workspace.some(item => item.id === record.id)) record.id = uid(); state.workspace.push(copy(record)); state.exportSelected.add(record.id); });
      const ids = new Set(selected.map(record => record.id)); state.preview = state.preview.filter(record => !ids.has(record.id)); state.selected.clear(); renderSession(); if (state.preview.length) renderPreview(); else $('previewSection').hidden = true;
      message(`${selected.length} records added to this temporary session. Nothing was uploaded or saved to the Hub.`);
    }

    function selectedExports() {
      const selected = state.workspace.filter(record => state.exportSelected.has(record.id));
      const records = expandForExport(selected, { customers: $('exportCustomers').checked, products: $('exportProducts').checked, prices: $('exportPrices').checked });
      if (!records.length) throw new Error('Select records and at least one matching export type.');
      return records;
    }
    function download(text, type, name) {
      const url = URL.createObjectURL(new Blob([text], { type })), anchor = node('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Export downloaded to your device. This does not save data to the Hub.');
    }
    $('sourceFile').addEventListener('change', loadFile);
    $('sheetSelect').addEventListener('change', () => { $('headerRow').value = '1'; setupMapping(); });
    $('headerRow').addEventListener('change', setupMapping); $('entitySelect').addEventListener('change', setupMapping);
    $('delimiterSelect').addEventListener('change', () => { if (state.csvText !== null) loadFile(); });
    $('buildPreview').addEventListener('click', buildPreview); $('addToSession').addEventListener('click', addToSession);
    $('previewFilter').addEventListener('change', () => { state.previewPage = 0; renderPreview(); });
    $('selectPreview').addEventListener('change', event => { state.preview.forEach(record => { if (event.target.checked && canUse(record)) state.selected.add(record.id); else state.selected.delete(record.id); }); renderPreview(); });
    $('selectSession').addEventListener('change', event => { visibleSession().forEach(record => { if (event.target.checked) state.exportSelected.add(record.id); else state.exportSelected.delete(record.id); }); renderSession(); });
    $('sessionFilter').addEventListener('change', () => { state.sessionPage = 0; renderSession(); });
    for (const kind of ['preview', 'session']) for (const [direction, increment] of [['Prev', -1], ['Next', 1]]) $(kind + direction).addEventListener('click', () => { state[kind + 'Page'] += increment; if (kind === 'preview') renderPreview(); else renderSession(); });
    $('closeEditor').addEventListener('click', () => $('editDialog').close()); $('saveEditor').addEventListener('click', saveEditor);
    $('clearSource').addEventListener('click', () => { clearPreview(); state.workbook = null; state.csvText = null; state.fileName = ''; state.mapping = []; state.editor = null; $('mappingGrid').replaceChildren(); $('previewRows').replaceChildren(); $('sheetSelect').replaceChildren(); $('editFields').replaceChildren(); $('editOriginal').replaceChildren(); $('editWarnings').textContent = ''; $('editSource').textContent = ''; $('editTitle').textContent = 'Review record'; $('sourceFile').value = ''; $('sourceSetup').hidden = true; $('sourceSummary').textContent = 'No file selected.'; message('Source cleared from this tab. Session records are unchanged.'); });
    $('clearSession').addEventListener('click', () => { if (state.workspace.length && !root.confirm('Clear the temporary session? Downloaded exports remain on your device.')) return; state.workspace = []; state.exportSelected.clear(); state.reviewed.clear(); renderSession(); if (state.preview.length) renderPreview(); message('Temporary session cleared.'); });
    $('exportJSON').addEventListener('click', () => { try { download(exportJSON(selectedExports()), 'application/json', 'gtf-workspace.json'); } catch (error) { message(error.message, true); } });
    $('exportCSV').addEventListener('click', () => { try { download(toCSV(selectedExports()), 'text/csv;charset=utf-8', 'gtf-workspace.csv'); } catch (error) { message(error.message, true); } });
    $('exportSchema').addEventListener('click', () => download(exportSchema(), 'application/json', 'gtf-data-format.json'));
    root.addEventListener('beforeunload', event => { if (state.workspace.length || state.preview.length) { event.preventDefault(); event.returnValue = ''; } });
    renderSession();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})(typeof globalThis !== 'undefined' ? globalThis : this);
