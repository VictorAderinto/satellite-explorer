import Graphic from '@arcgis/core/Graphic';
import { Point, Polyline } from '@arcgis/core/geometry';
import { lngLatToXY } from '@arcgis/core/geometry/support/webMercatorUtils';
import { apogeeBlue, perigeeYellow } from '../config';
import { action, makeObservable, observable } from 'mobx';
import { getSatellitePointSymbol, getStippledLineSymbol, getLineSymbol } from '../utils/visualizationUtils';

import { getSatelliteLocation, getOrbit } from '../utils/satPositionUtils';

import { updateHashParam } from '../utils/urlUtils';
import { when } from '@arcgis/core/core/reactiveUtils';
class SatelliteStore {
  selectedSatellite = null;
  view = null;
  currentTime = null;
  startTime = null;
  timeInterval = null;
  interactingWatchHandle = null;
  satellitePosition = null;
  satelliteGraphics = null;
  apogeeGraphics = null;
  perigeeGraphics = null;
  orbitGraphics = null;
  followSatellite = false;

  constructor() {
    makeObservable(this, {
      currentTime: observable.ref,
      setCurrentTime: action,
      selectedSatellite: observable.ref,
      setSelectedSatellite: action
    });
  }

  setView(view) {
    this.view = view;
    if (this.selectedSatellite) {
      this.setupSatellite();
    }
  }

  setSelectedSatellite(sat) {
    this.selectedSatellite = sat;
    this.setupSatellite();
  }

  setupSatellite() {
    if (this.view) {
      if (this.selectedSatellite) {
        this.renderSatellite(this.selectedSatellite);
        updateHashParam({ key: 'norad', value: this.selectedSatellite.norad });
      } else {
        clearInterval(this.timeInterval);
        this.timeInterval = null;
        if (this.interactingWatchHandle) {
          this.interactingWatchHandle.remove();
          this.interactingWatchHandle = null;
        }
        this.view.graphics.removeAll();
        updateHashParam({ key: 'norad', value: null });
      }
    }
  }

  renderSatellite(satellite) {
    this.setCurrentTime();
    this.startTime = new Date();
    const orbitCoordinates = getOrbit(satellite.satrec, satellite.metadata.period, this.startTime, 150);
    this.animateSatelliteOrbit(orbitCoordinates).then(
      () => {
        if (this.selectedSatellite) {
          this.setApogeeAndPerigeeGraphics(orbitCoordinates);
          this.setSatelliteGraphics();
          this.view.goTo(this.satelliteGraphics);
          this.startSatelliteAnimation(satellite, this.satelliteGraphics);
          this.interactingWatchHandle = when(
            () => this.view.interacting,
            () => {
              if (this.followSatellite) {
                this.followSatellite = false;
              }
            }
          );
        }
      },
      () => {
        this.view.graphics.removeAll();
      }
    );
  }

  setSatelliteGraphics() {
    const satellite = this.selectedSatellite;
    this.satellitePosition = new Point(getSatelliteLocation(satellite.satrec, this.currentTime, this.startTime));
    this.satelliteGraphics = this.getGraphics({
      featuredSatellite: satellite.featuredSatellite,
      color: [156, 255, 242],
      location: this.satellitePosition
    });
    this.view.graphics.addMany(this.satelliteGraphics);
  }

  startSatelliteAnimation(satellite, satelliteGraphics) {
    const orbitUpdateInterval = satellite.metadata.period * 60000;
    this.timeInterval = window.setInterval(() => {
      if (this.currentTime - this.startTime > orbitUpdateInterval) {
        this.startTime = new Date();
        const orbitCoordinates = getOrbit(satellite.satrec, satellite.metadata.period, this.startTime, 200);
        this.updateOrbit(orbitCoordinates);
        this.setApogeeAndPerigeeGraphics(orbitCoordinates);
      }
      this.updateSatellitePosition(satellite, satelliteGraphics);
      if (this.selectedSatellite.featuredSatellite) {
        this.updateSymbolHeading();
        if (this.followSatellite) {
          this.setFollowingCamera();
        }
      }
    }, 500);
  }

  setHeading() {
    const futurePosition = getSatelliteLocation(
      this.selectedSatellite.satrec,
      new Date(this.currentTime.getTime() + 10000),
      this.startTime
    );
    const [futureX, futureY] = lngLatToXY(futurePosition.x, futurePosition.y);
    const [currentX, currentY] = lngLatToXY(this.satellitePosition.x, this.satellitePosition.y);
    const dx = futureX - currentX;
    const dy = futureY - currentY;
    this.heading = (-Math.atan2(dy, dx) / Math.PI) * 180 - 90;
  }

  setFollowingCamera() {
    this.view.goTo(
      { target: this.satelliteGraphics[0], heading: this.heading + 180, tilt: 65 },
      { duration: 500, animate: false }
    );
  }

  updateOrbit(coords) {
    const geometry = new Polyline({
      paths: [coords.map((coord) => [coord.x, coord.y, coord.z])]
    });
    const geometryShadow = new Polyline({
      paths: [coords.map((coord) => [coord.x, coord.y, 1000])]
    });
    this.orbitGraphics[0].geometry = geometry;
    this.orbitGraphics[1].geometry = geometryShadow;
  }

  animateSatelliteOrbit(coords) {
    const geometry = new Polyline({
      paths: [coords.map((coord) => [coord.x, coord.y, coord.z])]
    });
    this.view.goTo(geometry);
    const orbitGraphic = new Graphic({
      geometry: new Polyline({
        paths: [
          [coords[0].x, coords[0].y, coords[0].z],
          [coords[1].x, coords[1].y, coords[1].z]
        ]
      }),
      symbol: getStippledLineSymbol([255, 255, 255, 0.7], 1.5)
    });
    const orbitGraphicShadow = new Graphic({
      geometry: new Polyline({
        paths: [
          [coords[0].x, coords[0].y, 1000],
          [coords[1].x, coords[1].y, 1000]
        ]
      }),
      symbol: getLineSymbol([255, 255, 255, 0.4], 1)
    });
    this.orbitGraphics = [orbitGraphic, orbitGraphicShadow];
    this.view.graphics.addMany(this.orbitGraphics);

    return new Promise((resolve, reject) => {
      const addLineSegment = (i) => {
        if (i < coords.length) {
          let polyline = new Polyline({
            paths: [...orbitGraphic.geometry.paths[0], [coords[i].x, coords[i].y, coords[i].z]]
          });
          orbitGraphic.geometry = polyline;
          let polylineShadow = new Polyline({
            paths: [...orbitGraphicShadow.geometry.paths[0], [coords[i].x, coords[i].y, 1000]]
          });
          orbitGraphicShadow.geometry = polylineShadow;
          if (this.selectedSatellite) {
            window.requestAnimationFrame(() => {
              addLineSegment(i + 1);
            });
          } else {
            reject();
          }
        } else {
          resolve();
        }
      };
      addLineSegment(2);
    });
  }

  setApogeeAndPerigeeGraphics(orbitCoordinates) {
    const orbitCoordinatesByHeight = [...orbitCoordinates];
    orbitCoordinatesByHeight.sort((coord1, coord2) => {
      return coord1.z - coord2.z;
    });
    if (this.apogeeGraphics) {
      this.view.graphics.removeMany(this.apogeeGraphics);
    }
    const apogeePosition = new Point(orbitCoordinatesByHeight[orbitCoordinatesByHeight.length - 1]);
    this.apogeeGraphics = this.getGraphics({
      color: apogeeBlue,
      location: apogeePosition
    });
    this.view.graphics.addMany(this.apogeeGraphics);
    if (this.perigeeGraphics) {
      this.view.graphics.removeMany(this.perigeeGraphics);
    }
    const perigeePosition = new Point(orbitCoordinatesByHeight[0]);
    this.perigeeGraphics = this.getGraphics({
      color: perigeeYellow,
      location: perigeePosition
    });
    this.view.graphics.addMany(this.perigeeGraphics);
  }

  getGraphics({ featuredSatellite, color, location }) {
    if (featuredSatellite) {
      this.setHeading();
    }
    const symbol = featuredSatellite
      ? {
          type: 'point-3d',
          symbolLayers: [
            {
              type: 'object',
              resource: { href: featuredSatellite.model },
              
              height: 100000,
              heading: this.heading
            }
          ]
        }
      : getSatellitePointSymbol({
          color: color,
          size: 10,
          outlineSize: 2,
          outlineOpacity: 0.6,
          outlineColor: color
        });
    return [
      new Graphic({
        geometry: location,
        symbol
      }),
      new Graphic({
        symbol: getLineSymbol(color, 1.5),
        geometry: new Polyline({
          paths: [
            [location.x, location.y, location.z],
            [location.x, location.y, 0]
          ]
        })
      })
    ];
  }

  updateSatellitePosition(satellite, satelliteGraphics) {
    this.setCurrentTime();
    // update the graphic's geometry with the satellite new position
    this.satellitePosition = new Point(getSatelliteLocation(satellite.satrec, this.currentTime, this.startTime));
    satelliteGraphics[0].geometry = this.satellitePosition;
    // update satellite leader line
    satelliteGraphics[1].geometry = new Polyline({
      paths: [
        [this.satellitePosition.x, this.satellitePosition.y, this.satellitePosition.z],
        [this.satellitePosition.x, this.satellitePosition.y, 0]
      ]
    });
  }

  updateSymbolHeading() {
    this.setHeading();
    const symbol = this.satelliteGraphics[0].symbol.clone();
    symbol.symbolLayers.getItemAt(0).heading = this.heading;
    this.satelliteGraphics[0].symbol = symbol;
  }

  setCurrentTime() {
    this.currentTime = new Date();
  }

  gotoPosition(type) {
    if (this.view) {
      switch (type) {
        case 'satellite':
          if (this.satelliteGraphics) {
            this.view.goTo(this.satelliteGraphics);
          }
          break;
        case 'apogee':
          if (this.apogeeGraphics) {
            this.view.goTo(this.apogeeGraphics);
          }
          break;
        case 'perigee':
          if (this.perigeeGraphics) {
            this.view.goTo(this.perigeeGraphics);
          }
          break;
      }
    }
  }
  // Add a method to draw the line between two satellites
  addConnectionLine() {
    
    const staticDate = new Date('2024-04-01T12:00:00Z');  // Static date example (UTC)

    satrec1 = twoline2satrec("1 44713U 19074A   24136.78781773  .00024628  00000+0  16638-2 0  9991", "2 44713  53.0537 282.4944 0001289 110.2028 249.9100 15.06460663248838")
    satrec2 = twoline2satrec("1 44757U 19074AW  24136.74003981  .00025093  00000+0  10497-2 0  9997", "2 44757  53.0451 288.9189 0003110 156.7147 203.3991 15.23451875248741")
    
    const pos1 = getSatelliteLocation(satrec1, staticDate, staticDate);
    const pos2 = getSatelliteLocation(satrec2, staticDate, staticDate);

    if (!pos1 || !pos2) {
      console.error('Could not get positions for satellites.');
      return;
    }

    console.log('Satellite 1 position:', pos1);
    console.log('Satellite 2 position:', pos2);

    const line = new Graphic({
      geometry: new Polyline({
        paths: [[[pos1.x, pos1.y, pos1.z], [pos2.x, pos2.y, pos2.z]]],
        spatialReference: { wkid: 4326 }  // Ensure correct spatial reference
      }),
      symbol: {
        type: 'simple-line',
        color: [0, 255, 0],  // Green color
        width: 10  // Adjusted for better visibility
      }
    });

  }
}

const satelliteStore = new SatelliteStore();
export default satelliteStore;
