"use client";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import useSupercluster from "use-supercluster";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  HiMap,
  HiMapPin,
  HiPhoto,
  HiPlay,
  HiVideoCamera,
} from "react-icons/hi2";
import LoadingQuip from "@/components/ui/LoadingQuip";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  CARTO_ATTRIBUTION_URL,
  CARTO_BASEMAP_URL,
  OPENSTREETMAP_COPYRIGHT_URL,
} from "@/lib/constants";

type ViewMode = "photos" | "events";
interface Photo {
  id: string;
  filename: string;
  mimeType: string;
  thumbnailS3Key: string | null;
  s3Key: string;
  lat: number;
  lng: number;
  uploadedAt: Date;
  event: {
    id: string;
    name: string;
    slug: string;
  };
}
interface SimplePhoto {
  id: string;
  filename: string;
  mimeType: string;
  thumbnailS3Key: string | null;
  s3Key: string;
  uploadedAt: Date;
}
interface EventLocation {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  photos?: SimplePhoto[];
}
interface MapData {
  photos: Photo[];
  events: EventLocation[];
}
function MapBoundsHandler({
  points,
  onBoundsChange,
  urlLat,
  urlLng,
  urlZoom,
}: {
  points: GeoJSON.Feature<GeoJSON.Point, any>[];
  onBoundsChange: (
    bounds: [number, number, number, number],
    zoom: number,
  ) => void;
  urlLat?: number;
  urlLng?: number;
  urlZoom?: number;
}) {
  const map = useMap();
  const hasFitBounds = useRef(false);
  const hasSetUrlPosition = useRef(false);
  useEffect(() => {
    if (urlLat && urlLng && map && !hasSetUrlPosition.current) {
      map.setView([urlLat, urlLng], urlZoom || 15, { animate: true });
      hasSetUrlPosition.current = true;
      hasFitBounds.current = true;
    }
  }, [urlLat, urlLng, urlZoom, map]);
  useEffect(() => {
    if (points.length > 0 && map && !hasFitBounds.current && !urlLat) {
      const bounds = L.latLngBounds(
        points.map((p) => [
          p.geometry.coordinates[1],
          p.geometry.coordinates[0],
        ]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      hasFitBounds.current = true;
    }
  }, [points, map, urlLat]);
  useEffect(() => {
    const updateBounds = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      onBoundsChange(
        [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ],
        zoom,
      );
    };
    map.on("moveend", updateBounds);
    map.on("zoomend", updateBounds);
    updateBounds();
    return () => {
      map.off("moveend", updateBounds);
      map.off("zoomend", updateBounds);
    };
  }, [map, onBoundsChange]);
  return null;
}
export default function PhotoMap() {
  const searchParams = useSearchParams();
  const [mapData, setMapData] = useState<MapData>({ photos: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(
    null,
  );
  const [zoom, setZoom] = useState(2);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("photos");
  const mapRef = useRef<L.Map | null>(null);
  const urlLat = searchParams.get("lat")
    ? parseFloat(searchParams.get("lat")!)
    : undefined;
  const urlLng = searchParams.get("lng")
    ? parseFloat(searchParams.get("lng")!)
    : undefined;
  const urlZoom = searchParams.get("zoom")
    ? parseInt(searchParams.get("zoom")!, 10)
    : undefined;
  const handleBoundsChange = useCallback(
    (newBounds: [number, number, number, number], newZoom: number) => {
      setBounds((prev) => {
        if (
          prev &&
          prev[0] === newBounds[0] &&
          prev[1] === newBounds[1] &&
          prev[2] === newBounds[2] &&
          prev[3] === newBounds[3]
        ) {
          return prev;
        }
        return newBounds;
      });
      setZoom((prev) => (prev === newZoom ? prev : newZoom));
    },
    [],
  );
  useEffect(() => {
    async function fetchData() {
      try {
        const { getMapData } = await import("@/app/actions/map");
        const result = await getMapData();
        if (result.success && result.data) {
          setMapData({
            photos: result.data.photos,
            events: result.data.events,
          });
        }
      } catch (error) {
        console.error("Error fetching map data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);
  const points =
    viewMode === "photos"
      ? mapData.photos.map((photo) => ({
          type: "Feature" as const,
          properties: {
            cluster: false,
            photoId: photo.id,
            photo,
            type: "photo",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [photo.lng, photo.lat],
          },
        }))
      : mapData.events
          .filter(
            (event) =>
              event.lat && event.lng && event.photos && event.photos.length > 0,
          )
          .map((event) => ({
            type: "Feature" as const,
            properties: {
              cluster: false,
              eventId: event.id,
              event,
              type: "event",
            },
            geometry: {
              type: "Point" as const,
              coordinates: [event.lng, event.lat],
            },
          }));
  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds as [number, number, number, number] | undefined,
    zoom,
    options: {
      radius: 30,
      maxZoom: 20,
      minPoints: 2,
    },
  });
  useEffect(() => {
    if (!clusters || !supercluster) return;
    const allVisiblePhotos: Photo[] = [];
    clusters.forEach((cluster) => {
      if (cluster.properties.cluster) {
        const clusterPoints = supercluster.getLeaves(
          cluster.id as number,
          Infinity,
        );
        clusterPoints.forEach((point: GeoJSON.Feature<GeoJSON.Point, any>) => {
          if (point.properties.type === "photo") {
            allVisiblePhotos.push(point.properties.photo);
          } else if (point.properties.type === "event") {
            const event = point.properties.event as EventLocation;
            if (event.photos) {
              allVisiblePhotos.push(...(event.photos as unknown as Photo[]));
            }
          }
        });
      } else if (cluster.properties.type === "photo") {
        allVisiblePhotos.push(cluster.properties.photo as Photo);
      } else if (cluster.properties.type === "event") {
        const event = cluster.properties.event as EventLocation;
        if (event.photos) {
          allVisiblePhotos.push(...(event.photos as unknown as Photo[]));
        }
      }
    });
    if (allVisiblePhotos.length === 0) return;
    const missingPhotos = allVisiblePhotos.filter(
      (p) => p.thumbnailS3Key && !photoUrls[p.thumbnailS3Key],
    );
    if (missingPhotos.length === 0) return;
    async function fetchUrls() {
      const s3Keys = missingPhotos
        .map((p) => p.thumbnailS3Key)
        .filter((key): key is string => key !== null);
      try {
        const { getMediaUrls } = await import("@/app/actions/media");
        const result = await getMediaUrls(undefined, s3Keys);
        if (result.success && result.urls) {
          setPhotoUrls((prev) => ({ ...prev, ...result.urls }));
        }
      } catch (error) {
        console.error("Error fetching presigned URLs:", error);
      }
    }
    fetchUrls();
  }, [clusters, supercluster, photoUrls]);
  const createClusterIcon = (pointCount: number, clusterId: number) => {
    const clusterPoints = supercluster?.getLeaves(clusterId, 4) || [];
    const photoPoints = clusterPoints.filter(
      (p: GeoJSON.Feature<GeoJSON.Point, any>) => p.properties.type === "photo",
    );
    const baseSize = 55;
    const maxPhotos = Math.min(3, photoPoints.length);
    const photosToShow = photoPoints.slice(0, maxPhotos);
    const stackedPhotos = photosToShow
      .map((p: GeoJSON.Feature<GeoJSON.Point, any>, index: number) => {
        const photo = p.properties.photo as Photo;
        const url = photo.thumbnailS3Key
          ? photoUrls[photo.thumbnailS3Key]
          : null;
        const offset = index * 3;
        const zIndex = maxPhotos - index;
        const background = url
          ? `url('${url}') center/cover`
          : "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)";
        return `<div class="cluster-photo" style="
				position: absolute;
				width: 48px;
				height: 48px;
				background: ${background};
				border-radius: 8px;
				border: 2px solid white;
				box-shadow: 0 2px 8px rgba(0,0,0,0.3);
				top: ${offset}px;
				left: ${offset}px;
				z-index: ${zIndex};
				display: flex;
				align-items: center;
				justify-content: center;
				color: white;
				transition: all 0.2s ease-in-out;
			">${!url ? '<svg width="20" height="20" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM11 17l-5-6h14l-4.5 6H11z"/></svg>' : ""}</div>`;
      })
      .join("");
    const badge =
      pointCount > 1
        ? `<div style="
			position: absolute;
			bottom: -4px;
			right: -4px;
			background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
			color: white;
			font-weight: bold;
			font-size: 11px;
			padding: 3px 7px;
			border-radius: 12px;
			border: 2px solid white;
			box-shadow: 0 2px 4px rgba(0,0,0,0.3);
			z-index: ${maxPhotos + 1};
		">${pointCount}</div>`
        : "";
    const containerSize = baseSize + (maxPhotos - 1) * 3;
    return L.divIcon({
      html: `<div class="cluster-marker" style="
				position: relative;
				width: ${containerSize}px;
				height: ${containerSize}px;
				cursor: pointer;
			">
				${stackedPhotos}
				${badge}
			</div>`,
      className: "",
      iconSize: [containerSize, containerSize],
      iconAnchor: [containerSize / 2, containerSize],
    });
  };
  const createPhotoIcon = (photo: Photo) => {
    const thumbnailUrl = photo.thumbnailS3Key
      ? photoUrls[photo.thumbnailS3Key]
      : null;
    const isVideo = photo.mimeType.startsWith("video/");
    if (!thumbnailUrl) {
      return L.divIcon({
        html: `<div class="photo-marker" style="
					width: 50px;
					height: 50px;
					border-radius: 8px;
					background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
					display: flex;
					align-items: center;
					justify-content: center;
					color: white;
					box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					border: 2px solid white;
					transition: all 0.2s ease-in-out;
					cursor: pointer;
				">
					<svg width="24" height="24" fill="currentColor">
						<path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM11 17l-5-6h14l-4.5 6H11z"/>
					</svg>
				</div>`,
        className: "",
        iconSize: [50, 50],
        iconAnchor: [25, 50],
      });
    }
    return L.divIcon({
      html: `<div class="photo-marker" style="
				width: 60px;
				height: 60px;
				border-radius: 8px;
				background: url('${thumbnailUrl}') center/cover;
				box-shadow: 0 4px 8px rgba(0,0,0,0.4);
				border: 3px solid white;
				position: relative;
				transition: all 0.2s ease-in-out;
				cursor: pointer;
			">
				${
          isVideo
            ? `<div style="
					position: absolute;
					top: 50%;
					left: 50%;
					transform: translate(-50%, -50%);
					background: rgba(0,0,0,0.6);
					border-radius: 50%;
					width: 24px;
					height: 24px;
					display: flex;
					align-items: center;
					justify-content: center;
				">
					<svg width="12" height="12" fill="white" viewBox="0 0 24 24">
						<path d="M8 5v14l11-7z"/>
					</svg>
				</div>`
            : ""
        }
			</div>`,
      className: "",
      iconSize: [60, 60],
      iconAnchor: [30, 60],
      popupAnchor: [0, -60],
    });
  };
  const createEventIcon = (event: EventLocation) => {
    const eventPhotos = event.photos || [];
    const photosToShow = eventPhotos.slice(0, 9);
    const photoGrid = photosToShow
      .map((photo, index) => {
        const url = photo.thumbnailS3Key
          ? photoUrls[photo.thumbnailS3Key]
          : null;
        const row = Math.floor(index / 3);
        const col = index % 3;
        const size = 20;
        const background = url
          ? `url('${url}') center/cover`
          : "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)";
        return `<div style="
				position: absolute;
				width: ${size}px;
				height: ${size}px;
				background: ${background};
				border: 1px solid white;
				top: ${row * size}px;
				left: ${col * size}px;
			"></div>`;
      })
      .join("");
    const gridSize =
      Math.min(3, Math.ceil(Math.sqrt(photosToShow.length))) * 20;
    const totalPhotos = eventPhotos.length;
    const badge =
      totalPhotos > 9
        ? `<div style="
			position: absolute;
			bottom: -6px;
			right: -6px;
			background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
			color: white;
			font-weight: bold;
			font-size: 10px;
			padding: 2px 6px;
			border-radius: 10px;
			border: 2px solid white;
			box-shadow: 0 2px 4px rgba(0,0,0,0.3);
			z-index: 100;
		">${totalPhotos}</div>`
        : "";
    return L.divIcon({
      html: `<div style="
				position: relative;
				width: ${gridSize}px;
				height: ${gridSize}px;
				cursor: pointer;
				border-radius: 4px;
				overflow: hidden;
				box-shadow: 0 4px 8px rgba(0,0,0,0.4);
			">
				${photoGrid}
				${badge}
			</div>`,
      className: "event-grid-marker",
      iconSize: [gridSize, gridSize],
      iconAnchor: [gridSize / 2, gridSize / 2],
      popupAnchor: [0, -gridSize / 2],
    });
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center max-w-lg px-4">
          <LoadingSpinner size="xl" center />
          <div className="mt-6 sm:mt-8 mb-3 sm:mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">
              Loading the map...
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500">
              Don't worry, this actually takes a while to check what you got
              access to!
            </p>
          </div>
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <LoadingQuip
              type="map"
              className="text-zinc-300 text-sm sm:text-base leading-relaxed"
            />
          </div>
        </div>
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center max-w-md px-4">
          <HiMapPin className="text-5xl sm:text-6xl text-zinc-600 mx-auto mb-3 sm:mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            No Locations Yet
          </h2>
          <p className="text-sm sm:text-base text-zinc-400">
            Photos with GPS data or events with locations will appear here.
            Upload photos with location metadata (exif) or add locations to
            events to see them on the map.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full w-full relative z-0">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{
          height: "100%",
          width: "100%",
          background: "#09090b",
          zIndex: 0,
        }}
        ref={mapRef}
      >
        <TileLayer
          attribution={`&copy; <a href="${OPENSTREETMAP_COPYRIGHT_URL}">OpenStreetMap</a> contributors &copy; <a href="${CARTO_ATTRIBUTION_URL}">CARTO</a>`}
          url={CARTO_BASEMAP_URL}
        />

        <MapBoundsHandler
          points={points as GeoJSON.Feature<GeoJSON.Point, any>[]}
          onBoundsChange={handleBoundsChange}
          urlLat={urlLat}
          urlLng={urlLng}
          urlZoom={urlZoom}
        />

        {clusters?.map((cluster) => {
          const [longitude, latitude] = cluster.geometry.coordinates;
          const { cluster: isCluster, point_count: pointCount } =
            cluster.properties;
          if (isCluster) {
            return (
              <Marker
                key={`cluster-${cluster.id}`}
                position={[latitude, longitude]}
                icon={createClusterIcon(pointCount, cluster.id as number)}
                eventHandlers={{
                  click: () => {
                    if (supercluster && mapRef.current) {
                      const expansionZoom = Math.min(
                        supercluster.getClusterExpansionZoom(
                          cluster.id as number,
                        ),
                        20,
                      );
                      mapRef.current.setView(
                        [latitude, longitude],
                        expansionZoom,
                        {
                          animate: true,
                        },
                      );
                    }
                  },
                }}
              />
            );
          }
          if (cluster.properties.type === "photo") {
            const photo = cluster.properties.photo as Photo;
            return (
              <Marker
                key={`photo-${photo.id}`}
                position={[latitude, longitude]}
                icon={createPhotoIcon(photo)}
              >
                <Popup maxWidth={250}>
                  <div className="min-w-45 sm:min-w-50">
                    {photo.thumbnailS3Key &&
                      photoUrls[photo.thumbnailS3Key] && (
                        <div className="relative mb-2 rounded-lg overflow-hidden">
                          <Image
                            src={photoUrls[photo.thumbnailS3Key]}
                            alt={photo.filename}
                            width={200}
                            height={150}
                            className="w-full h-auto"
                            unoptimized
                          />
                          {photo.mimeType.startsWith("video/") && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                              <HiPlay className="text-white text-3xl sm:text-4xl" />
                            </div>
                          )}
                        </div>
                      )}
                    <p className="font-medium text-xs sm:text-sm mb-1 truncate">
                      {photo.filename}
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-400 mb-2">
                      {photo.mimeType.startsWith("video/") ? (
                        <>
                          <HiVideoCamera className="inline mr-1" />
                          Video
                        </>
                      ) : (
                        <>
                          <HiPhoto className="inline mr-1" />
                          Photo
                        </>
                      )}
                    </p>
                    <Link
                      href={`/events/${photo.event.slug}?photo=${photo.id}`}
                      className="text-[10px] sm:text-xs font-medium inline-block"
                    >
                      View in {photo.event.name} →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          }
          if (cluster.properties.type === "event") {
            const event = cluster.properties.event as EventLocation;
            const eventPhotos = event.photos || [];
            return (
              <Marker
                key={`event-${event.id}`}
                position={[latitude, longitude]}
                icon={createEventIcon(event)}
              >
                <Popup maxWidth={280}>
                  <div className="min-w-60 sm:min-w-70">
                    <p className="font-semibold text-sm sm:text-base mb-2 truncate">
                      {event.name}
                    </p>
                    {event.city && event.country && (
                      <p className="text-[10px] sm:text-xs text-zinc-400 mb-2 sm:mb-3 flex items-center gap-1">
                        <HiMapPin className="shrink-0" />
                        <span className="truncate">
                          {event.city}, {event.country}
                        </span>
                      </p>
                    )}

                    {eventPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 mb-2 sm:mb-3 max-h-37.5 sm:max-h-45 overflow-hidden">
                        {eventPhotos.slice(0, 9).map((photo) => {
                          const url = photo.thumbnailS3Key
                            ? photoUrls[photo.thumbnailS3Key]
                            : null;
                          return (
                            <div
                              key={photo.id}
                              className="aspect-square bg-zinc-800 rounded-lg overflow-hidden relative"
                            >
                              {url && (
                                <Image
                                  src={url}
                                  alt={photo.filename}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              )}
                              {photo.mimeType.startsWith("video/") && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="bg-black bg-opacity-60 rounded-full p-1">
                                    <HiPlay className="text-white text-xs" />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="text-[10px] sm:text-xs text-zinc-400 mb-1 sm:mb-2">
                      {eventPhotos.length}{" "}
                      {eventPhotos.length === 1 ? "photo" : "photos"}
                    </div>

                    <Link
                      href={`/events/${event.slug}`}
                      className="text-[10px] sm:text-xs font-medium inline-block"
                    >
                      View Event →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          }
          return null;
        })}
      </MapContainer>

      <div className="absolute bottom-3 sm:bottom-6 left-3 sm:left-6 z-10 flex gap-1 sm:gap-2 bg-[#1a1a1a]/90 backdrop-blur-sm rounded-full p-0.5 sm:p-1 shadow-lg border border-zinc-800">
        <button
          type="button"
          onClick={() => setViewMode("photos")}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-2 ${
            viewMode === "photos"
              ? "bg-red-600 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <HiPhoto className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden xs:inline">Photos</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("events")}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-2 ${
            viewMode === "events"
              ? "bg-red-600 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <HiMap className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden xs:inline">Events</span>
        </button>
      </div>
    </div>
  );
}
