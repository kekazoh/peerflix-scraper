import { Bencode } from 'bencode-ts';
import * as crypto from 'crypto';


interface Torrent {
  info: Record<string, any>;
  infoHashBuffer?: Buffer;
  infoBuffer?: Buffer;
  name: string;
  announce: string[];
  infoHash: string;
  files: string[];
}

export const decodeTorrentFile = async (torrent: Buffer): Promise<Torrent | null> => {
  try {
    const fTorrent = Bencode.decode(torrent);
    console.log('DECODED TORRENT', fTorrent);
    const result = {
      info: fTorrent.info,
      infoBuffer: Bencode.encode(fTorrent.info),
      name: (fTorrent.info['name.utf-8'] || fTorrent.info.name).toString(),
      announce: [],
      infoHash: '',
      files: fTorrent.files || [],
    };
    const shasum = crypto.createHash('sha1');
    shasum.update(result.infoBuffer);
    result.infoHash = shasum.digest('hex');
    return result;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const magnetURIEncode = (obj: Torrent): string => {
  const auxObj: Record<string, any> = Object.assign({}, obj); // clone obj, so we can mutate it

  // support using convenience names, in addition to spec names
  // (example: `infoHash` for `xt`, `name` for `dn`)
  if (auxObj.infoHashBuffer) {
    auxObj.xt = `urn:btih:${auxObj.infoHashBuffer.toString('hex')}`;
  }
  if (auxObj.infoHash) {
    auxObj.xt = `urn:btih:${auxObj.infoHash}`;
  }
  if (auxObj.name) {
    auxObj.dn = auxObj.name;
  }
  if (auxObj.keywords) {
    auxObj.kt = auxObj.keywords;
  }
  if (auxObj.announce) {
    auxObj.tr = auxObj.announce;
  }
  if (auxObj.urlList) {
    auxObj.ws = auxObj.urlList;
    delete auxObj.as;
  }
  let result = 'magnet:?';
  Object.keys(auxObj)
    .filter(key => key.length === 2)
    .forEach((key, i) => {
      const values = Array.isArray(auxObj[key]) ? auxObj[key] : [auxObj[key]];
      values.forEach((val: string, j: number) => {
        if ((i > 0 || j > 0) && (key !== 'kt' || j === 0)) {
          result += '&';
        }
        if (key === 'dn') {
          val = encodeURIComponent(val).replace(/%20/g, '+');
        }
        if (key === 'tr' || key === 'xs' || key === 'as' || key === 'ws') {
          val = encodeURIComponent(val);
        }
        if (key === 'kt') {
          val = encodeURIComponent(val);
        }
        if (key === 'kt' && j > 0) {
          result += `+${val}`;
        } else {
          result += `${key}=${val}`;
        }
      });
    });

  return result;
};