const fs = require("fs");
const fetch = require("node-fetch");
const pointsWithinPolygon = require("@turf/points-within-polygon");
const Tallinn8kmBuffer = require("./buffer.json");

const DEBUG = true;
const USEBUFFER = true;

const toGeoJSONCollection = (data) => {
  let result = { type: "FeatureCollection", features: [] };

  data.forEach((item) => {
    const { id, SiriID, name, lat, lon } = item;

    const feature = {
      type: "Feature",
      properties: { SiriID: SiriID, Name: name },
      geometry: { type: "Point", coordinates: [lon, lat] },
    };

    result.features.push(feature);
  });

  if (USEBUFFER) {
    result = pointsWithinPolygon(result, Tallinn8kmBuffer);
  }

  return result;
};

const parseCSV = (str, delimiter = ",") => {
  let arr = [];
  let quote = false;

  for (let row = 0, col = 0, c = 0; c < str.length; c++) {
    let cc = str[c];
    let nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || "";

    if (cc === '"' && quote && nc === '"') {
      arr[row][col] += cc;
      ++c;
      continue;
    }

    if (cc === '"') {
      quote = !quote;
      continue;
    }

    if (cc === delimiter && !quote) {
      ++col;
      continue;
    }

    if (cc === "\n" && !quote) {
      ++row;
      col = 0;
      continue;
    }

    arr[row][col] += cc;
  }

  return arr;
};

const fetchStops = () => {
  let url;
  if (!DEBUG) url = "https://transport.tallinn.ee/data/stops.txt";
  else url = "http://localhost:5000/stops.txt";
  fetch(url)
    .then((response) => {
      return response.text();
    })
    .then((data) => {
      const parsedData = [];
      let prev;
      data = parseCSV(data, ";");
      data.forEach((item, index) => {
        if (index > 0 && item) {
          var x = {
            id: item[0],
            SiriID: item[1],
            lat: item[2] / 1e5,
            lon: item[3] / 1e5,
            name: item[5],
          };

          if (!x.name && prev && prev.name) {
            x.name = prev.name;
          }

          prev = x;

          if (x.name && !x.name.includes("ei kasuta")) {
            parsedData.push(x);
          }
        }
      });

      var geojson = toGeoJSONCollection(parsedData);

      fs.writeFile("data.json", JSON.stringify(geojson), (err) => {
        if (err) throw err;
      });
    });
};

fetchStops();
