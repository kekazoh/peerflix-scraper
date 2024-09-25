import { describe, it, expect } from 'vitest';
import { extractQuality, getParamFromMagnet, slugify } from '../../src/lib/strings';

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('HELLO WORLD')).toBe('helloworld');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugify('Hello, World!')).toBe('helloworld');
  });

  it('replaces spaces with empty string', () => {
    expect(slugify('hello world')).toBe('helloworld');
  });

  it('handles accented characters', () => {
    expect(slugify('áéíóúçñ')).toBe('aeioucn');
  });

  it('handles mixed case and accented characters', () => {
    expect(slugify('Crème Brûlée')).toBe('cremebrulee');
  });

  it('handles multiple consecutive non-alphanumeric characters', () => {
    expect(slugify('hello---world')).toBe('helloworld');
  });

  it('handles leading and trailing non-alphanumeric characters', () => {
    expect(slugify('!!!hello world!!!')).toBe('helloworld');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles string with only non-alphanumeric characters', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('handles long string with various characters', () => {
    expect(slugify('The quick brown fox jumps over the lazy dog!')).toBe('thequickbrownfoxjumpsoverthelazydog');
  });
});

describe('extractQuality', () => {
  const testCases = [
    { input: 'Movie Title 1080p', expected: '1080p' },
    { input: 'TV Show S01E01 720p', expected: '720p' },
    { input: 'Documentary 4K UHDRip', expected: 'UHDRip' },
    { input: 'Film 2160p HDR', expected: '2160p' },
    { input: 'Series BDRip', expected: 'BDRip' },
    { input: 'Movie Bluray', expected: 'Bluray' },
    { input: 'Show BlurayRip', expected: 'BlurayRip' },
    { input: 'Film Bluray Rip', expected: 'Bluray Rip' },
    { input: 'Movie 3D', expected: '3D' },
    { input: 'Documentary HDRip', expected: 'HDRip' },
    { input: 'Show HDTV', expected: 'HDTV' },
    { input: 'Film MicroHD', expected: 'MicroHD' },
    { input: 'Movie BRRip', expected: 'BRRip' },
    { input: 'Series WEBRip', expected: 'WEBRip' },
    { input: 'Film DVDRip', expected: 'DVDRip' },
    { input: 'Movie Screener', expected: 'Screener' },
    { input: 'New Release CAM', expected: 'CAM' },
    { input: 'Movie wolfmax4K', expected: '' },
    { input: 'TV Show UHDRip', expected: 'UHDRip' },
    { input: 'Regular Movie Title', expected: '' },
  ];
  it.each(testCases)('extracts $expected quality from $input', ({ input, expected }) => {
    expect(extractQuality(input)).toBe(expected);
  });
});

describe('getParamFromMagnet', () => {
  it('should extract a single parameter correctly', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789';
    expect(getParamFromMagnet(magnetUrl, 'xt')).toBe('urn:btih:123456789');
  });

  it('should handle multiple parameters', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&dn=Example+File&tr=udp://tracker.example.com:80';
    expect(getParamFromMagnet(magnetUrl, 'dn')).toBe('Example+File');
    expect(getParamFromMagnet(magnetUrl, 'tr')).toBe('udp://tracker.example.com:80');
  });

  it('should return an empty string for non-existent parameters', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789';
    expect(getParamFromMagnet(magnetUrl, 'nonexistent')).toBeUndefined();
  });

  it('should handle URL-encoded parameters', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&dn=File%20with%20spaces';
    expect(getParamFromMagnet(magnetUrl, 'dn')).toBe('File%20with%20spaces');
  });

  it('should handle empty parameter values', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&empty=';
    expect(getParamFromMagnet(magnetUrl, 'empty')).toBe('');
  });

  it('should handle parameters with special characters', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&special=!@#$%^&*()';
    expect(getParamFromMagnet(magnetUrl, 'special')).toBe('!@');
  });

  it('should handle malformed magnet URLs', () => {
    const magnetUrl = 'magnet:?invalid&url=format';
    expect(getParamFromMagnet(magnetUrl, 'url')).toBeUndefined();
  });

  it('should handle magnet URLs with repeated parameters picking the last one', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&tr=tracker1&tr=tracker2';
    expect(getParamFromMagnet(magnetUrl, 'tr')).toBe('tracker2');
  });

  it('should handle magnet URLs with "amp;" in parameter names', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:123456789&amp;dn=Example+File';
    expect(getParamFromMagnet(magnetUrl, 'dn')).toBe('Example+File');
  });

  it('should handle an empty magnet URL', () => {
    const magnetUrl = '';
    expect(getParamFromMagnet(magnetUrl, 'xt')).toBeUndefined();
  });
});