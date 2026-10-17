import assert from 'node:assert/strict';
import {test} from 'node:test';
import i18n from '../lib/i18n.js';

test('browser language selects supported Canadian English or French locale',()=>{
 assert.equal(i18n.preferredLocale('fr-CA'),'fr-CA');
 assert.equal(i18n.preferredLocale('fr-FR'),'fr-CA');
 assert.equal(i18n.preferredLocale('en-US'),'en-CA');
 assert.equal(i18n.preferredLocale('unsupported'),'en-CA');
});

test('skip navigation labels have matching English and French locale keys',()=>{
 assert.equal(i18n.translate('en-CA','a11y.skipContent'),'Skip to content');
 assert.equal(i18n.translate('fr-CA','a11y.skipContent'),'Passer au contenu');
 assert.equal(i18n.translate('en-CA','a11y.skipBooking'),'Skip to booking');
 assert.equal(i18n.translate('fr-CA','a11y.skipBooking'),'Passer à la réservation');
});

test('browser locale resolver follows the first browser language and falls back safely',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try {
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{languages:['fr-CA','en-CA'],language:'en-CA'}});
  assert.equal(i18n.browserLocale(),'fr-CA');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language:'es-MX'}});
  assert.equal(i18n.browserLocale(),'en-CA');
 } finally { Object.defineProperty(globalThis,'navigator',original); }
});

test('CAD money and salon-local timestamps use the selected locale',()=>{
 const englishMoney=i18n.formatMoney(123456,'en-CA','CAD');
 const frenchMoney=i18n.formatMoney(123456,'fr-CA','CAD');
 assert.match(englishMoney,/,234\.56/);
 assert.match(frenchMoney,/,56/);
 assert.notEqual(englishMoney,frenchMoney);
 const instant='2025-03-09T07:30:00.000Z';
 const english=i18n.formatDateTime(instant,'en-CA',{timeZone:'America/Toronto',dateStyle:'medium',timeStyle:'short'});
 const french=i18n.formatDateTime(instant,'fr-CA',{timeZone:'America/Toronto',dateStyle:'medium',timeStyle:'short'});
 assert.match(english,/Mar/i);
 assert.match(french,/mars/i);
 assert.notEqual(english,french);
});
