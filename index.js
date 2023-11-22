const fs = require("fs");
const fetch = require("node-fetch");
const pointsWithinPolygon = require("@turf/points-within-polygon");
const Tallinn8kmBuffer = require("./buffer.json");

const DEBUG = false;
const USEBUFFER = true;

const toGeoJSONCollection = (data, withId, withRoutes) => {
  let result = { type: "FeatureCollection", features: [] };

  data.forEach((item) => {
    const { id, SiriID, name, lat, lon } = item;

    const feature = {
      type: "Feature",
      properties: { SiriID: SiriID, Name: name },
      geometry: { type: "Point", coordinates: [lon, lat] },
    };

    if (withId) {
      feature.properties.id = item.id;
    }

    if (withRoutes) {
      feature.properties.routes = item.routes;
    }

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

let stops = {};

const fetchStops = () => {
  let url;
  if (!DEBUG) url = "https://transport.tallinn.ee/data/stops.txt";
  else url = "http://localhost:5000/stops.txt";

  fetch(url)
    .then((response) => {
      return response.text();
    })
    .then((data) => {
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
            routes: [],
            active: false,
          };

          if (!x.name && prev && prev.name) {
            x.name = prev.name;
          }

          prev = x;

          if (x.name && !x.name.includes("ei kasuta")) {
            stops[x.id] = x;
          }
        }
      });

      fetchRoutes();
    });
};

const fetchRoutes = () => {
  let url;
  if (!DEBUG) url = "https://transport.tallinn.ee/data/routes.txt";
  else url = "http://localhost:5000/routes.txt";

  fetch(url)
    .then((response) => {
      return response.text();
    })
    .then((data) => {
      let prev;

      data = parseCSV(data, ";");

      data.forEach((item, index) => {
        if (index <= 1) {
          // 0 & 1 header rows
          //console.log(item);
        }

        if (index >= 2 && item) {
          var route = {
            RouteNum: item[0],
            RouteType: item[8],
            Commercial: item[9],
            RouteName: item[10],
            RouteStops: item[13],
          };

          if (!route.RouteNum && route.RouteStops && prev && prev.RouteNum) {
            route.RouteNum = prev.RouteNum;
          }

          if (route.RouteStops) {
            prev = route;

            let route_stops = route.RouteStops.split(",");

            route_stops.forEach((stop) => {
              if (stops[stop]) {
                stops[stop].active = true;

                stops[stop].routes.push({
                  RouteNum: route.RouteNum,
                  RouteName: route.RouteName,
                  RouteType: route.RouteType,
                  Commercial: route.Commercial,
                });
              } else {
                console.error("Route has missing stop", route, stop);
              }
            });
          }
        }
      });

      const parsedData = [];

      for (const stop in stops) {
        if (stops[stop].active) {
          parsedData.push(stops[stop]);
        }
      }

      var old = toGeoJSONCollection(parsedData, false, false);

      fs.writeFile(
        "public/peatused.js",
        `var peatused = ${JSON.stringify(old)};`,
        (err) => {
          if (err) throw err;
        }
      );
      fs.writeFile("public/data.json", JSON.stringify(old, null, 2), (err) => {
        if (err) throw err;
      });

      /*var withoutroutes = toGeoJSONCollection(parsedData, true, false);

      fs.writeFile(
        "public/stops.json",
        JSON.stringify(withoutroutes),
        (err) => {
          if (err) throw err;
        }
      );

      var withroutes = toGeoJSONCollection(parsedData, true, true);

      fs.writeFile(
        "public/routes.js",
        `var peatused = ${JSON.stringify(withroutes)};`,
        (err) => {
          if (err) throw err;
        }
      );
      fs.writeFile(
        "public/routes.json",
        JSON.stringify(withroutes, null, 2),
        (err) => {
          if (err) throw err;
        }
      );*/
    });
};

fetchStops();
