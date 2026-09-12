import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedPrintFile, safeAssetFilename } from '../lib/product-assets';

void test('Druckdateien akzeptieren Modell-, Slicer- und Archivformate unabhängig von Großschreibung', () => {
  for (const filename of [
    'figur.STL',
    'projekt.3mf',
    'druck.gcode',
    'druck.bgcode',
    'modell.step',
    'paket.zip',
  ])
    assert.equal(isSupportedPrintFile(filename), true, filename);
  assert.equal(isSupportedPrintFile('notiz.pdf'), false);
});

void test('Dateinamen mit Leerzeichen und Sonderzeichen erhalten eine sichere Endung', () => {
  assert.equal(
    safeAssetFilename('Meine Büste final.3mf'),
    'Meine-B-ste-final.3mf',
  );
});
