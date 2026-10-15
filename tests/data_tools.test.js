'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCSV,
  normalizeRows,
  reviewDuplicates,
  toCSV,
  exportJSON,
  importJSON,
  safeCSVCell,
  normalizePrice,
  inferMapping,
  expandForExport,
} = require('../data-tools.js');

// Fixtures are deliberately fictional. Private uploads must never be copied here.
const source = {file: 'fictional-import.csv', sheet: 'Services'};

function customers(rows, headers = ['Name', 'Email', 'Phone'], mapping = ['name', 'email', 'phone']) {
  return normalizeRows({rows, headers, mapping, entity: 'customers', source});
}

function products(rows) {
  return normalizeRows({
    rows,
    headers: ['Item', 'SKU', 'Unit', 'Standard', 'Contractor', 'Special'],
    mapping: ['name', 'sku', 'unit', 'price:standard', 'price:contractor', 'price:special'],
    entity: 'products',
    source,
    rowOffset: 2,
  });
}

test('CSV recognizes BOM, comma delimiter, CRLF and trailing empty cells', () => {
  const result = parseCSV('\uFEFFName,Email,Phone\r\nFictional Customer,example@example.invalid,\r\n');
  assert.equal(result.delimiter, ',');
  assert.deepEqual(result.rows, [
    ['Name', 'Email', 'Phone'],
    ['Fictional Customer', 'example@example.invalid', ''],
  ]);
});

test('CSV preserves quoted commas, escaped quotes and multiline content', () => {
  const result = parseCSV('Name,Notes\r\n"Fictional, LLC","Use ""sample"" finish\nSecond line"');
  assert.deepEqual(result.rows, [
    ['Name', 'Notes'],
    ['Fictional, LLC', 'Use "sample" finish\nSecond line'],
  ]);
});

test('CSV detects semicolons without treating quoted decimal commas as delimiters', () => {
  const result = parseCSV('Item;Price;Note\nSample service;"12,50";"One; two"');
  assert.equal(result.delimiter, ';');
  assert.deepEqual(result.rows[1], ['Sample service', '12,50', 'One; two']);
});

test('CSV accepts an explicit tab delimiter', () => {
  const result = parseCSV('Item\tUnit\nSample service\tSF', '\t');
  assert.equal(result.delimiter, '\t');
  assert.deepEqual(result.rows[1], ['Sample service', 'SF']);
});

test('CSV rejects an unterminated quoted field', () => {
  assert.throws(() => parseCSV('Name,Notes\nSample,"unfinished'));
});

test('price normalization preserves zero and distinguishes missing or invalid prices', () => {
  assert.equal(normalizePrice(0), 0);
  assert.equal(normalizePrice('0'), 0);
  assert.equal(normalizePrice('$0.00'), 0);
  for (const value of ['', ' ', null, undefined, 'not a price', 'Infinity', 'NaN']) {
    assert.equal(normalizePrice(value), null, String(value));
  }
});

test('price normalization supports unambiguous US and Brazilian formats', () => {
  assert.equal(normalizePrice('$1,234.56'), 1234.56);
  assert.equal(normalizePrice('1.234,56'), 1234.56);
  assert.equal(normalizePrice('12.50'), 12.5);
  assert.equal(normalizePrice('12,50'), 12.5);
});

test('customer mapping preserves individual source fields and source metadata', () => {
  const result = normalizeRows({
    rows: [['  Fictional Company  ', 'contact@example.invalid', 'Sample Contact', 'Sample Billing', 'Unmapped value']],
    headers: ['Company', 'Email', 'ContactName', 'BillingName', 'Legacy'],
    mapping: ['name', 'email', 'contactName', 'billingName', ''],
    entity: 'customers',
    source,
    rowOffset: 2,
  });
  assert.equal(result.records.length, 1);
  const record = result.records[0];
  assert.equal(record.entity, 'customers');
  assert.equal(record.fields.displayName, 'Fictional Company');
  assert.equal(record.fields.contactName, 'Sample Contact');
  assert.equal(record.fields.billingName, 'Sample Billing');
  assert.ok(record.id);
  assert.ok(record.sourceColumns, 'Preserve original source columns for later review');
  assert.ok(JSON.stringify(record.sourceColumns).includes('Unmapped value'));
  assert.ok(JSON.stringify(record).includes('fictional-import.csv'));
  assert.ok(Array.isArray(result.warnings));
});

test('product price tiers retain their labels and avoid inventing a price for blanks', () => {
  const result = products([['Sample installation', 'DEMO-01', 'SF', '12.50', '0', '']]);
  assert.equal(result.records.length, 1);
  const product = result.records[0];
  assert.equal(product.entity, 'products');
  assert.equal(product.fields.name, 'Sample installation');
  assert.equal(product.fields.sku, 'DEMO-01');
  assert.ok(Array.isArray(product.prices));
  assert.equal(product.prices.length, 2);
  const tiers = Object.fromEntries(product.prices.map(price => [price.customerType, price]));
  assert.equal(tiers.standard.unitPrice, 12.5);
  assert.equal(tiers.contractor.unitPrice, 0);
  assert.equal(tiers.standard.unit, 'SF');
  assert.equal(tiers.standard.sku, 'DEMO-01');
  assert.equal(tiers.standard.productName, 'Sample installation');
  assert.equal(typeof tiers.standard.currency, 'string');
  assert.ok(tiers.standard.currency.length > 0);
  assert.equal(tiers.special, undefined);
});

test('invalid tier text raises a warning without becoming a zero price', () => {
  const result = products([['Sample repair', 'DEMO-02', 'EA', 'Review required', '', '']]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].prices.length, 1);
  assert.equal(result.records[0].prices[0].unitPrice, null);
  assert.equal(result.records[0].prices[0].originalPrice, 'Review required');
  assert.ok(result.warnings.length > 0);
});

test('duplicate review catches repeated email and preserves all imported records', () => {
  const result = customers([
    ['Fictional Alpha', 'shared@example.invalid', ''],
    ['Fictional Beta', 'shared@example.invalid', ''],
    ['Fictional Gamma', 'unique@example.invalid', ''],
  ]);
  const before = JSON.stringify(result.records);
  const groups = reviewDuplicates(result.records);
  assert.ok(Array.isArray(groups));
  const ids = result.records.slice(0, 2).map(record => record.id);
  assert.ok(groups.some(group => ids.every(id => group.ids.includes(id))));
  assert.ok(groups.every(group => Array.isArray(group.reasons) && group.reasons.length));
  assert.equal(JSON.stringify(result.records), before, 'Review must never merge or discard records');
});

test('different contacts receive distinct records for human review', () => {
  const result = customers([
    ['Fictional Alpha', 'alpha@example.invalid', ''],
    ['Fictional Beta', 'beta@example.invalid', ''],
  ]);
  assert.equal(result.records.length, 2);
  assert.notEqual(result.records[0].id, result.records[1].id);
});

test('CSV export neutralizes spreadsheet formula prefixes', () => {
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(1,2)']) {
    const escaped = safeCSVCell(value);
    assert.equal(typeof escaped, 'string');
    const decoded = parseCSV(`Value\n${escaped}`).rows[1][0];
    assert.ok(decoded.startsWith("'"), `Unsafe CSV formula prefix: ${value[0]}`);
    assert.ok(decoded.includes(value));
  }
});

test('CSV export remains parseable and includes all customer records', () => {
  const result = customers([
    ['Fictional, LLC', 'alpha@example.invalid', ''],
    ['Fictional "Sample"', 'beta@example.invalid', ''],
  ]);
  const csv = toCSV(result.records);
  const parsed = parseCSV(csv);
  assert.equal(parsed.rows.length, 3);
  const flattened = parsed.rows.flat();
  assert.ok(flattened.includes('Fictional, LLC'));
  assert.ok(flattened.includes('Fictional "Sample"'));
  assert.ok(parsed.rows.every(row => row.length === parsed.rows[0].length));
});

test('JSON backup restores original IDs, fields, price tiers and source columns', () => {
  const input = [
    ...customers([['Fictional Customer', 'fictional@example.invalid', '+15550100123']]).records,
    ...products([['Sample service', 'DEMO-03', 'SF', '5.75', '0', '']]).records,
  ];
  const json = exportJSON(input);
  assert.equal(typeof json, 'string');
  assert.doesNotThrow(() => JSON.parse(json));
  assert.deepEqual(importJSON(json), input);
});

test('JSON import rejects malformed or structurally invalid input', () => {
  assert.throws(() => importJSON('{invalid JSON'));
  assert.throws(() => importJSON('null'));
  assert.throws(() => importJSON('{"unexpected":"value"}'));
});

test('contact and billing names remain separate in inferred mapping', () => {
  assert.deepEqual(inferMapping(['Name', 'ContactName', 'BillingName', 'Email'], 'customers'), ['displayName', 'contactName', 'billingName', 'email']);
});

test('price-only export keeps customer types and zero, product-only omits price data', () => {
  const input = products([['Sample service', 'DEMO-04', 'SF', '5.75', '0', '']]).records;
  const prices = expandForExport(input, {products:false, customers:false, prices:true});
  assert.equal(prices.length, 2);
  assert.equal(prices[1].fields.customerType, 'contractor');
  assert.equal(prices[1].fields.unitPrice, 0);
  assert.equal(prices[1].fields.productId, input[0].id);
  const catalog = expandForExport(input, {products:true, prices:false});
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].prices, undefined);
  assert.deepEqual(catalog[0].sourceColumns, []);
  assert.equal(input[0].prices.length, 2);
});

test('CSV emits a row per customer price type', () => {
  const input = products([['Sample service', 'DEMO-05', 'SF', '5.75', '0', '']]).records;
  const rows = parseCSV(toCSV(input)).rows;
  const type = rows[0].indexOf('entity'), amount = rows[0].indexOf('unitPrice');
  assert.equal(rows.length, 4);
  assert.equal(rows[2][type], 'prices');
  assert.equal(rows[3][amount], '0');
});

test('CSV shields formulas after whitespace and retains harmless original phone text on import', () => {
  for (const value of [' \t=1+1', '\t@SUM(1,2)', '\r=1+1', '\n+1']) {
    const decoded = parseCSV('Value\r\n' + safeCSVCell(value)).rows[1][0];
    assert.ok(decoded.startsWith("'"));
  }
  assert.equal(customers([['Sample', '', '+15550100999']]).records[0].fields.phone, '+15550100999');
});

test('JSON rejects prototype mutation properties', () => {
  assert.throws(() => importJSON('{"schemaVersion":"gtf-data-workspace/1","records":[{"id":"demo","entity":"customers","fields":{"displayName":"Sample","__proto__":{"polluted":true}}}]}'));
  assert.equal({}.polluted, undefined);
});
