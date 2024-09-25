# peerflix-scraper

This repository defines all the scraper logic for the different websites and sources. Any new scraper should implement the Abstract class `Scraper` which defines all the base methods. The scraper could implement any extra/auxiliary method it needs to achieve its purpose.

## Scraper class

The scraper class is designed to work with Kafka. It will consume from a Kafka topic `scrapingRequests` and produce to another called `magnets`.

### processMessage Method
It's the one method to be implemented by the scraper class in case you need to implement a new scraper. It recieves a "scraping request" with the following schema:
```
  imdbId: string;
  title: string;
  spanishTitle: string;
  seasonNum: string;
  episodeNum: string;
  tvdbId: string;
  year: number;
  cacheId: string;
```

An example for this would be:
```json
{
    "cacheId":"tt0944947:3:2",
    "imdbId":"tt0944947",
    "title":"Game of Thrones",
    "spanishTitle": "Juego de Tronos",
    "seasonNum": "3",
    "episodeNum": "2",
    "tvdbId": "null",
    "year": 2011
}
```

Using the auxiliary methods as needed, the scraper should return a `Magnet` array with the following format:

```
  infoHash: string;
  language: string;
  magnetUrl: string;
  quality: string;
  source: string;
  peer?: number;
  seed?: number;
  size?: string;
  fileIdx?: number;
```

An example for this would be:
```json
{
    "magnetUrl":"magnet:?xt=urn:btih:c292................................b610&dn=Juego+De+Tronos+-+Temporada+3+%5BHDTV%5D%5BCap.302%5D%5BEspa%C3%B1ol+Castellano%5D",
    "infoHash":"c292................................b610",
    "fileIdx":1,
    "language":"es",
    "quality":"HDTV",
    "source":"DonTorrent",
    "cacheId":"tt0944947:3:2",
    "seed":0,
    "peer":0
}
```

## Linting
The commit will not be allowed if any linting rule fails. These linting rules could change over time.

## Testing
The scrapers don't have defined tests, but the repository contains the dependencies needed so any new unit test will be appreciated.

## Contributions
For future contributions, conventional commits should be used.
Git flow features and releases will be used to ensure the integrity and stability.
Every feature and release will be reviewed by the repository maintainers.
