import { contrastRatio, ensureContrast, inkOn, readableNameColor, DARKEST_NAME_BACKGROUND } from './colors';

// The palette offered in the agent form
const PALETTE = [
  '#cc1919', '#ea4122', '#ed851d', '#c3c323', '#909052', '#a4bf24',
  '#7ae60f', '#7cc464', '#19b319', '#72da8c', '#0f9954', '#54c4a8',
  '#24bcbc', '#0db9f2', '#699ed3', '#193ca3', '#5e5ec5', '#4310da',
  '#ad7be0', '#9215bc', '#c16cc1', '#931b75', '#d66ba1', '#dd1346',
];

const BACKGROUNDS = ['#ffffff', '#f5f5f5', '#fff3e0', DARKEST_NAME_BACKGROUND];

test('contrastRatio matches the WCAG reference values', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
});

test('every palette color becomes readable on every message background', () => {
  for (const color of PALETTE) {
    const name = readableNameColor(color);
    for (const background of BACKGROUNDS) {
      expect(contrastRatio(name, background)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('colors that are already readable are left untouched', () => {
  expect(ensureContrast('#193ca3', '#ffffff')).toBe('#193ca3');
});

test('ensureContrast lightens colors on a dark background', () => {
  const result = ensureContrast('#193ca3', '#14161b');
  expect(contrastRatio(result, '#14161b')).toBeGreaterThanOrEqual(4.5);
});

test('inkOn picks the more readable of dark and light', () => {
  expect(inkOn('#7ae60f')).toBe('#14161b');
  expect(inkOn('#193ca3')).toBe('#ffffff');
});

test('the icon ink is readable on every palette color', () => {
  for (const color of PALETTE) {
    expect(contrastRatio(inkOn(color), color)).toBeGreaterThanOrEqual(4.5);
  }
});

test('unparsable colors fall back to gray instead of throwing', () => {
  expect(() => readableNameColor('not-a-color')).not.toThrow();
});
