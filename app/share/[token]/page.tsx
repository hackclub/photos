import Image from "next/image";
import { notFound } from "next/navigation";
import {
  HiArrowDownTray,
  HiOutlineBolt,
  HiOutlineCalendar,
  HiOutlineCamera,
  HiOutlineMapPin,
  HiOutlineSun,
  HiOutlineUser,
} from "react-icons/hi2";
import { getSharedMedia } from "@/app/actions/sharing";
import SharedPageMapWrapper from "@/components/map/SharedPageMapWrapper";
import {
  type ExifData,
  formatAperture,
  formatExposureTime,
  formatFocalLength,
  formatISO,
} from "@/lib/media/exif";
export default async function SharedMediaPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = await params;
  const result = await getSharedMedia(token);
  if (!result.success || !result.link || !result.link.media) {
    notFound();
  }
  const { media } = result.link;
  const exif = (media.exifData || {}) as unknown as ExifData;
  const hasCamera = exif.make || exif.model;
  const hasLens = exif.lensModel;
  const hasCameraSettings =
    exif.focalLength !== undefined ||
    exif.fNumber !== undefined ||
    exif.exposureTime !== undefined ||
    exif.iso !== undefined;
  const hasLocation =
    exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined;
  const hasTakenDate = exif.dateTimeOriginal;
  const rawUrl = `/share/${token}/raw`;
  const displayUrl =
    media.mimeType === "image/heic" || media.mimeType === "image/heif"
      ? `${rawUrl}?variant=display`
      : rawUrl;
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <span className="font-medium text-zinc-400 text-sm">
            Shared from{" "}
            <span className="text-white">{result.link.createdBy.name}</span>
          </span>
        </div>

        <a
          href={rawUrl}
          download
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <HiArrowDownTray className="w-5 h-5" />
          <span>Download Original</span>
        </a>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden">
        <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden relative">
          {media.mimeType.startsWith("video/") ? (
            <video
              src={rawUrl}
              controls
              autoPlay
              loop
              className="w-full h-full object-contain"
            >
              <track kind="captions" />
            </video>
          ) : (
            <div className="relative w-full h-full">
              <Image
                src={displayUrl}
                alt={media.filename}
                fill
                className="object-contain shadow-2xl"
                unoptimized
              />
            </div>
          )}
        </div>

        <div className="w-full lg:w-96 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-white mb-1">
                  {media.caption || media.filename}
                </h1>
                {media.caption && (
                  <p className="text-sm text-zinc-500 truncate">
                    {media.filename}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-zinc-300">
                <div className="flex items-center gap-2">
                  <HiOutlineUser className="w-5 h-5 text-zinc-400" />
                  <span>{media.uploadedBy.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <HiOutlineCalendar className="w-5 h-5 text-zinc-400" />
                  <span>
                    {new Date(
                      hasTakenDate || media.uploadedAt,
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-px bg-zinc-800" />

            {media.event && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Event
                </h3>
                <p className="text-white font-medium">{media.event.name}</p>
              </div>
            )}

            {(hasCamera || hasCameraSettings) && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Camera Details
                </h3>

                {hasCamera && (
                  <div className="flex items-start gap-3">
                    <HiOutlineCamera className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-white">
                        {exif.make} {exif.model}
                      </p>
                      {hasLens && (
                        <p className="text-sm text-zinc-400 mt-1">
                          {exif.lensModel}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {hasCameraSettings && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {exif.focalLength !== undefined && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                        <HiOutlineCamera className="w-5 h-5 text-zinc-400" />
                        <div>
                          <p className="text-xs text-zinc-500">Focal</p>
                          <p className="text-sm font-medium text-white">
                            {formatFocalLength(exif.focalLength)}
                          </p>
                        </div>
                      </div>
                    )}
                    {exif.fNumber !== undefined && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                        <HiOutlineCamera className="w-5 h-5 text-zinc-400" />
                        <div>
                          <p className="text-xs text-zinc-500">Aperture</p>
                          <p className="text-sm font-medium text-white">
                            {formatAperture(exif.fNumber)}
                          </p>
                        </div>
                      </div>
                    )}
                    {exif.exposureTime !== undefined && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                        <HiOutlineBolt className="w-5 h-5 text-zinc-400" />
                        <div>
                          <p className="text-xs text-zinc-500">Shutter</p>
                          <p className="text-sm font-medium text-white">
                            {formatExposureTime(exif.exposureTime)}
                          </p>
                        </div>
                      </div>
                    )}
                    {exif.iso !== undefined && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                        <HiOutlineSun className="w-5 h-5 text-zinc-400" />
                        <div>
                          <p className="text-xs text-zinc-500">ISO</p>
                          <p className="text-sm font-medium text-white">
                            {formatISO(exif.iso)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasLocation &&
              exif.gpsLatitude !== undefined &&
              exif.gpsLongitude !== undefined && (
                <div className="space-y-3">
                  <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Location
                  </h3>
                  <div className="flex items-start gap-3">
                    <HiOutlineMapPin className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-mono text-white mb-2">
                        {exif.gpsLatitude.toFixed(6)},{" "}
                        {exif.gpsLongitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-zinc-800 h-40">
                    <SharedPageMapWrapper
                      lat={exif.gpsLatitude}
                      lng={exif.gpsLongitude}
                      zoom={14}
                      className="h-full w-full"
                    />
                  </div>
                </div>
              )}
          </div>

          <div className="p-6 border-t border-zinc-800 mt-auto">
            <p className="text-xs text-zinc-500 text-center">
              Shared via Hack Club Photos
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
