import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, lineAmount, minorDigits, parseMoney, toMinor, toPlain, isCurrencyCode } from './money.ts';

test('minorDigits follows ISO 4217', () => {
  assert.equal(minorDigits('USD'), 2);
  assert.equal(minorDigits('eur'), 2);
  assert.equal(minorDigits('JPY'), 0);
  assert.equal(minorDigits('KRW'), 0);
  assert.equal(minorDigits('BHD'), 3);
  assert.equal(minorDigits('???'), 2);
});

test('isCurrencyCode', () => {
  assert.equal(isCurrencyCode('USD'), true);
  assert.equal(isCurrencyCode('usd'), true);
  assert.equal(isCurrencyCode('US'), false);
  assert.equal(isCurrencyCode('$'), false);
});

test('parseMoney handles what people type', () => {
  const cases: [string, number | null][] = [
    ['12', 1200], ['12.5', 1250], ['12.50', 1250], ['0.05', 5], ['.5', 50],
    ['$1,234.56', 123456], ['1,234', 123400], ['12,50', 1250], ['1.234,56', 123456],
    ['1.234.567', 123456700], ['-3.20', -320], ['(3.20)', -320], ['- 3.20', -320],
    ['  7.1  ', 710], ['EUR 9,99', 999], ['0', 0], ['-0', 0], ['-0.00', 0],
    ['', null], ['   ', null], ['abc', null], ['1.2.3', null], ['1,2,3', null], ['3-2', null], ['.', null],
    ['1.234.56', null],
  ];
  for (const [input, want] of cases) assert.equal(parseMoney(input), want, `parseMoney(${JSON.stringify(input)})`);
});

test('parseMoney rounds half away from zero on the next digit', () => {
  assert.equal(parseMoney('1.005'), 101);
  assert.equal(parseMoney('1.004'), 100);
  assert.equal(parseMoney('-1.005'), -101);
  assert.equal(parseMoney('2.675'), 268);
  assert.equal(parseMoney('0.999'), 100);
});

test('parseMoney respects currency digits', () => {
  assert.equal(parseMoney('1500', 0), 1500);
  assert.equal(parseMoney('1500.6', 0), 1501);
  assert.equal(parseMoney('1.250', 3), 1250);
});

test('parseMoney rejects absurd magnitudes', () => {
  assert.equal(parseMoney('9999999999999'), null);
});

test('toMinor avoids float drift', () => {
  assert.equal(toMinor(1.005), 101);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(toMinor(19.99), 1999);
  assert.equal(toMinor(2.675), 268);
  assert.equal(toMinor(-4.35), -435);
  assert.equal(toMinor(1234.5, 0), 1235);
  assert.equal(toMinor(Number.NaN), 0);
  assert.equal(toMinor(Infinity), 0);
  assert.equal(toMinor(1e-12), 0);
  for (let c = -50000; c <= 50000; c += 7) assert.equal(toMinor(c / 100), c, `toMinor(${c / 100})`);
});

test('toPlain is the inverse of parseMoney', () => {
  assert.equal(toPlain(1250), '12.50');
  assert.equal(toPlain(5), '0.05');
  assert.equal(toPlain(-5), '-0.05');
  assert.equal(toPlain(0), '0.00');
  assert.equal(toPlain(1500, 0), '1500');
  assert.equal(toPlain(1250, 3), '1.250');
  for (let c = -2000; c <= 2000; c += 13) assert.equal(parseMoney(toPlain(c)), c);
});

test('formatMoney uses the receipt currency', () => {
  assert.equal(formatMoney(123456, 'USD'), '$1,234.56');
  assert.equal(formatMoney(-500, 'USD'), '-$5.00');
  assert.equal(formatMoney(1500, 'JPY'), '¥1,500');
  assert.match(formatMoney(999, 'EUR'), /9\.99/);
});

test('lineAmount rounds qty x price to the nearest minor unit', () => {
  assert.equal(lineAmount(2, 450), 900);
  assert.equal(lineAmount(3, 333), 999);
  assert.equal(lineAmount(0.452, 1299), 587);
  assert.equal(lineAmount(0.5, 1), 1);
  assert.equal(lineAmount(-1, 300), -300);
  assert.equal(lineAmount(1, -250), -250);
  assert.equal(lineAmount(0, 999), 0);
  assert.equal(lineAmount(Number.NaN, 100), 0);
});
