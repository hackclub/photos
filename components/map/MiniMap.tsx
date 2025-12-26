"use client";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import {
  CARTO_ATTRIBUTION_URL,
  CARTO_BASEMAP_URL,
  OPENSTREETMAP_COPYRIGHT_URL,
} from "@/lib/constants";

interface Props {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
}
function MapUpdater({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}
export default function MiniMap({
  lat,
  lng,
  zoom = 13,
  className = "h-48 w-full rounded-lg overflow-hidden",
}: Props) {
  return (
    <div className={className}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        doubleClickZoom={false}
        style={{ height: "100%", width: "100%", zIndex: 0 }}
      >
        <MapUpdater center={[lat, lng]} zoom={zoom} />
        <TileLayer
          attribution={`&copy; <a href="${OPENSTREETMAP_COPYRIGHT_URL}">OpenStreetMap</a> contributors &copy; <a href="${CARTO_ATTRIBUTION_URL}">CARTO</a>`}
          url={CARTO_BASEMAP_URL}
        />
        <Marker position={[lat, lng]} />
      </MapContainer>
    </div>
  );
}
