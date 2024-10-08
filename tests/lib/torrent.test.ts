import * as crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bencode } from 'bencode-ts';
import { getLegibleSizeFromBytesLength, decodeTorrentFile, magnetURIEncode } from '../../src/lib/torrent';
import { Torrent } from '../../src/interfaces';

vi.mock('bencode-ts');
vi.mock('crypto');

describe('decodeTorrentFile', () => {
  const mockTorrent = Buffer.from('mock torrent data');
  const mockDecodedTorrent = {
    info: {
      name: 'Test Torrent',
      'name.utf-8': 'Test Torrent UTF-8',
    },
    files: ['file1', 'file2'],
  };
  const mockEncodedInfo = Buffer.from('encoded info');
  const mockInfoHash = 'mockhash123';

  beforeEach(() => {
    vi.resetAllMocks();
    (Bencode.decode as any).mockReturnValue(mockDecodedTorrent);
    (Bencode.encode as any).mockReturnValue(mockEncodedInfo);
    const mockHash = {
      update: vi.fn(),
      digest: vi.fn().mockReturnValue(mockInfoHash),
    };
    (crypto.createHash as any).mockReturnValue(mockHash);
  });

  it('should decode a torrent file successfully', async () => {
    const result = await decodeTorrentFile(mockTorrent);

    expect(Bencode.decode).toHaveBeenCalledWith(mockTorrent);
    expect(Bencode.encode).toHaveBeenCalledWith(mockDecodedTorrent.info);
    expect(crypto.createHash).toHaveBeenCalledWith('sha1');
    expect(result).toEqual({
      info: mockDecodedTorrent.info,
      infoBuffer: mockEncodedInfo,
      name: 'Test Torrent UTF-8',
      announce: [],
      infoHash: mockInfoHash,
      files: ['file1', 'file2'],
    });
  });

  it('should use non-UTF-8 name if UTF-8 name is not available', async () => {
    const nonUtf8Torrent = { ...mockDecodedTorrent, info: { name: 'Non-UTF8 Name' } };
    (Bencode.decode as any).mockReturnValue(nonUtf8Torrent);

    const result = await decodeTorrentFile(mockTorrent);

    expect(result?.name).toBe('Non-UTF8 Name');
  });

  it('should handle missing files property', async () => {
    const torrentWithoutFiles = { ...mockDecodedTorrent, files: undefined };
    (Bencode.decode as any).mockReturnValue(torrentWithoutFiles);

    const result = await decodeTorrentFile(mockTorrent);

    expect(result?.files).toEqual([]);
  });

  it('should return null and log error on decoding failure', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (Bencode.decode as any).mockImplementation(() => {
      throw new Error('Decoding error');
    });

    const result = await decodeTorrentFile(mockTorrent);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('ERROR DECODING TORRENT FILE', expect.any(Error));
  });
});

describe('magnetURIEncode', () => {
  it('encodes a torrent object into a magnet URI', () => {
    const torrent: Torrent = {
      name: 'Example Torrent',
      info: {
        name: 'Example Torrent',
      },
      files: ['file1', 'file2'],
      infoHash: '1234567890abcdef1234',
      announce: ['http://tracker1.com', 'http://tracker2.com'],
      keywords: ['keyword1', 'keyword2'],
      urlList: ['http://webseed1.com', 'http://webseed2.com'],
    };

    // eslint-disable-next-line max-len
    const expectedMagnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234&dn=Example+Torrent&kt=keyword1+keyword2&tr=http%3A%2F%2Ftracker1.com&tr=http%3A%2F%2Ftracker2.com&ws=http%3A%2F%2Fwebseed1.com&ws=http%3A%2F%2Fwebseed2.com';

    expect(magnetURIEncode(torrent)).toBe(expectedMagnetURI);
  });

  it('handles infoHashBuffer', () => {
    const torrent = {
      infoHashBuffer: Buffer.from('1234567890abcdef1234', 'hex'),
    };

    const expectedMagnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234';

    expect(magnetURIEncode(torrent as Torrent)).toBe(expectedMagnetURI);
  });

  it('encodes special characters in name', () => {
    const torrent = {
      name: 'Test & Example',
    };

    const expectedMagnetURI = 'magnet:?dn=Test+%26+Example';

    expect(magnetURIEncode(torrent as Torrent)).toBe(expectedMagnetURI);
  });

  it('handles multiple keywords', () => {
    const torrent = {
      keywords: ['key1', 'key2', 'key3'],
    };

    const expectedMagnetURI = 'magnet:?kt=key1+key2+key3';

    expect(magnetURIEncode(torrent as Torrent)).toBe(expectedMagnetURI);
  });

  it('ignores properties that are not part of the magnet URI spec', () => {
    const torrent = {
      infoHash: '1234567890abcdef1234',
      name: 'Example',
      someOtherProperty: 'should be ignored',
    };

    const expectedMagnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234&dn=Example';

    expect(magnetURIEncode(torrent as unknown as Torrent)).toBe(expectedMagnetURI);
  });

  it('handles empty torrent object', () => {
    const torrent = {};

    const expectedMagnetURI = 'magnet:?';

    expect(magnetURIEncode(torrent as Torrent)).toBe(expectedMagnetURI);
  });

  it('prioritizes infoHash over infoHashBuffer', () => {
    const torrent = {
      infoHash: '1234567890abcdef1234',
      infoHashBuffer: Buffer.from('0987654321fedcba0987', 'hex'),
    };

    const expectedMagnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234';

    expect(magnetURIEncode(torrent as Torrent)).toBe(expectedMagnetURI);
  });
});

describe('getLegibleSizeFromBytesLength', () => {
  it('should return "0B" for 0 bytes', () => {
    expect(getLegibleSizeFromBytesLength(0)).toBe('0B');
  });

  it('should handle bytes correctly', () => {
    expect(getLegibleSizeFromBytesLength(1)).toBe('1.00 B');
    expect(getLegibleSizeFromBytesLength(512)).toBe('512.00 B');
    expect(getLegibleSizeFromBytesLength(1023)).toBe('1023.00 B');
  });

  it('should handle kilobytes correctly', () => {
    expect(getLegibleSizeFromBytesLength(1024)).toBe('1.00 KB');
    expect(getLegibleSizeFromBytesLength(1536)).toBe('1.50 KB');
    expect(getLegibleSizeFromBytesLength(1048575)).toBe('1024.00 KB');
  });

  it('should handle megabytes correctly', () => {
    expect(getLegibleSizeFromBytesLength(1048576)).toBe('1.00 MB');
    expect(getLegibleSizeFromBytesLength(1572864)).toBe('1.50 MB');
    expect(getLegibleSizeFromBytesLength(1073741823)).toBe('1024.00 MB');
  });

  it('should handle gigabytes correctly', () => {
    expect(getLegibleSizeFromBytesLength(1073741824)).toBe('1.00 GB');
    expect(getLegibleSizeFromBytesLength(1610612736)).toBe('1.50 GB');
    expect(getLegibleSizeFromBytesLength(1099511627775)).toBe('1024.00 GB');
  });

  it('should handle terabytes correctly', () => {
    expect(getLegibleSizeFromBytesLength(1099511627776)).toBe('1.00 TB');
    expect(getLegibleSizeFromBytesLength(1649267441664)).toBe('1.50 TB');
    expect(getLegibleSizeFromBytesLength(1125899906842624)).toBe('1024.00 TB');
  });

  it('should handle very large numbers', () => {
    expect(getLegibleSizeFromBytesLength(1125899906842625)).toBe('1024.00 TB');
    expect(getLegibleSizeFromBytesLength(Number.MAX_SAFE_INTEGER)).toBe('8192.00 TB');
  });

  it('should handle decimal inputs', () => {
    expect(getLegibleSizeFromBytesLength(1.5)).toBe('1.50 B');
    expect(getLegibleSizeFromBytesLength(1024.5)).toBe('1.00 KB');
  });

  it('should handle negative inputs', () => {
    expect(getLegibleSizeFromBytesLength(-1024)).toBe('0B');
    expect(getLegibleSizeFromBytesLength(-1048576)).toBe('0B');
  });
});