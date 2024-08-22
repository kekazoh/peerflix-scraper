export const slugify = (str: string): string => {
  const map: Record<string, string> = {
    a: 'á|à|ã|â|À|Á|Ã|Â',
    e: 'é|è|ê|É|È|Ê',
    i: 'í|ì|î|Í|Ì|Î',
    o: 'ó|ò|ô|õ|Ó|Ò|Ô|Õ',
    u: 'ú|ù|û|ü|Ú|Ù|Û|Ü',
    c: 'ç|Ç',
    n: 'ñ|Ñ',
    '': '[^a-zA-Z0-9]',
  };
  str = str.toLowerCase();
  for (const pattern in map) {
    str = str.replace(new RegExp(map[pattern], 'g'), pattern);
  }
  return str;
};

export const extractQuality = (title: string): string => {
  const regexMatch = title.match(
    /.*(720p|1080p|2160p|3D|4K|HDRip|HDTV|MicroHD|BDRip|BRRip|WEBRip|DVDRip|Screener|Bluray([ ]?Rip)?|CAM).*/i,
  );
  return regexMatch && regexMatch.length > 1
    ? regexMatch[1] : '';
};

export const getParamFromMagnet = (magnetUrl: string, param: string): string => {
  const regex = /[?&]([^=#]+)=([^&#]*)/g;
  const params: Record<string, string> = {};
  let match = regex.exec(magnetUrl);
  while (match) {
    const p = match[1].replace('amp;', '');
    params[p] = match[2];
    match = regex.exec(magnetUrl);
  }
  return params[param];
};