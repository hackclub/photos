"use client";
import { useEffect, useState } from "react";
import { HiClipboard, HiClipboardDocumentCheck, HiPlay } from "react-icons/hi2";
import FormInput from "@/components/ui/FormInput";
import { APP_URL } from "@/lib/constants";

type Endpoint =
  | "photos"
  | "videos"
  | "media"
  | "events"
  | "event-detail"
  | "series"
  | "series-detail"
  | "upload"
  | "admin-create-event"
  | "admin-temp-url"
  | "admin-media-update"
  | "admin-media-delete";

const ENDPOINTS: {
  id: Endpoint;
  label: string;
  description: string;
}[] = [
  { id: "photos", label: "Photos", description: "Get all the public photos" },
  { id: "videos", label: "Videos", description: "Get all the public videos" },
  { id: "media", label: "Media", description: "Everything mixed together" },
  { id: "events", label: "Events", description: "See what's happening" },
  {
    id: "event-detail",
    label: "Event Detail",
    description: "Get details about one event",
  },
  { id: "series", label: "Series", description: "Collections of events" },
  {
    id: "series-detail",
    label: "Series Detail",
    description: "Get details about one series",
  },
  { id: "upload", label: "Upload", description: "Upload media to an event" },
  {
    id: "admin-create-event",
    label: "Create Event",
    description: "Admin-only event creation",
  },
  {
    id: "admin-temp-url",
    label: "Temp URL",
    description: "Admin-only signed file URL",
  },
  {
    id: "admin-media-update",
    label: "Update Media",
    description: "Admin-only media metadata updates",
  },
  {
    id: "admin-media-delete",
    label: "Delete Media",
    description: "Admin-only media deletion",
  },
];

const ADMIN_ENDPOINTS = new Set<Endpoint>([
  "admin-create-event",
  "admin-temp-url",
  "admin-media-update",
  "admin-media-delete",
]);

const EXAMPLE_RESPONSES: Record<Endpoint, object> = {
  photos: {
    data: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        url: "https://photos.hackclub.com/api/v1/download/123e4567-e89b-12d3-a456-426614174000?type=media",
        thumbnailUrl:
          "https://photos.hackclub.com/api/v1/download/123e4567-e89b-12d3-a456-426614174000?variant=thumbnail&type=media",
        width: 1920,
        height: 1080,
        caption: "Hackers hacking at a hackathon",
        takenAt: "2025-07-15T14:30:00.000Z",
        uploadedAt: "2025-07-16T10:00:00.000Z",
        eventId: "event-uuid",
        eventName: "Daydream Toronto",
        mimeType: "image/jpeg",
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
    },
  },
  videos: {
    data: [
      {
        id: "987fcdeb-51a2-43c1-z567-987654321000",
        url: "https://photos.hackclub.com/api/v1/download/987fcdeb-51a2-43c1-z567-987654321000?type=media",
        thumbnailUrl: null,
        width: 1920,
        height: 1080,
        caption: "Demo presentation",
        takenAt: "2025-07-15T16:00:00.000Z",
        uploadedAt: "2025-07-16T11:00:00.000Z",
        eventId: "event-uuid",
        eventName: "Daydream Toronto",
        mimeType: "video/mp4",
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
    },
  },
  media: {
    data: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        url: "https://photos.hackclub.com/api/v1/download/123e4567-e89b-12d3-a456-426614174000?type=media",
        thumbnailUrl:
          "https://photos.hackclub.com/api/v1/download/123e4567-e89b-12d3-a456-426614174000?variant=thumbnail&type=media",
        width: 1920,
        height: 1080,
        caption: "Hackers hacking at a hackathon",
        takenAt: "2025-07-15T14:30:00.000Z",
        uploadedAt: "2025-07-16T10:00:00.000Z",
        eventId: "event-uuid",
        eventName: "Daydream Toronto",
        mimeType: "image/jpeg",
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
    },
  },
  events: {
    data: [
      {
        id: "event-uuid",
        name: "Daydream Toronto",
        slug: "daydream-toronto",
        description:
          "Game jam for high schoolers in Toronto. Organized by high schoolers.",
        location: "Toronto, ON",
        locationCity: "Toronto",
        latitude: 43.6532,
        longitude: -79.3832,
        eventDate: "2025-07-15T00:00:00.000Z",
        bannerUrl:
          "https://photos.hackclub.com/api/v1/download/event-uuid?type=event",
        detailUrl: "https://photos.hackclub.com/api/v1/events/daydream-toronto",
        mediaUrl:
          "https://photos.hackclub.com/api/v1/media?event=daydream-toronto",
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
    },
  },
  "event-detail": {
    data: {
      id: "event-uuid",
      name: "Daydream Toronto",
      slug: "daydream-toronto",
      description:
        "Game jam for high schoolers in Toronto. Organized by high schoolers.",
      eventDate: "2025-07-15T00:00:00.000Z",
      location: "Toronto, ON",
      locationCity: "Toronto",
      latitude: 43.6532,
      longitude: -79.3832,
      bannerUrl:
        "https://photos.hackclub.com/api/v1/download/event-uuid?type=event",
      createdAt: "2025-06-01T00:00:00.000Z",
      photoCount: 142,
      videoCount: 8,
      totalMedia: 150,
      participantCount: 23,
      series: {
        id: "series-uuid",
        name: "Daydream 2025",
        slug: "daydream-2025",
        detailUrl: "https://photos.hackclub.com/api/v1/series/daydream-2025",
      },
      mediaUrl:
        "https://photos.hackclub.com/api/v1/media?event=daydream-toronto",
      photosUrl:
        "https://photos.hackclub.com/api/v1/photos?event=daydream-toronto",
      videosUrl:
        "https://photos.hackclub.com/api/v1/videos?event=daydream-toronto",
    },
  },
  series: {
    data: [
      {
        id: "series-uuid",
        name: "Daydream 2025",
        slug: "daydream-2025",
        description:
          "Game jam for high schoolers. Organized by high schoolers in 100 cities worldwide.",
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
    },
  },
  "series-detail": {
    data: {
      id: "series-uuid",
      name: "Daydream 2025",
      slug: "daydream-2025",
      description:
        "Game jam for high schoolers. Organized by high schoolers in 100 cities worldwide.",
      bannerUrl:
        "https://photos.hackclub.com/api/v1/download/series-uuid?type=series",
      createdAt: "2025-01-01T00:00:00.000Z",
      totalPhotos: 4820,
      eventCount: 42,
      events: [
        {
          id: "event-uuid",
          name: "Daydream Toronto",
          slug: "daydream-toronto",
          description: "Game jam for high schoolers in Toronto.",
          eventDate: "2025-07-15T00:00:00.000Z",
          location: "Toronto, ON",
          photoCount: 150,
          detailUrl:
            "https://photos.hackclub.com/api/v1/events/daydream-toronto",
        },
      ],
    },
  },
  upload: {
    success: true,
    media: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      s3Key: "media/123e4567-e89b-12d3-a456-426614174000/original.jpg",
      thumbnailS3Key:
        "media/123e4567-e89b-12d3-a456-426614174000/thumbnail.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024000,
      width: 1920,
      height: 1080,
      eventId: "event-uuid",
      uploadedById: "user-uuid",
      latitude: 43.6532,
      longitude: -79.3832,
      exifData: { camera: "Example Camera" },
      metadata: {
        uploadedVia: "api",
        source: "website-import",
        globalAdminOnlyDelete: true,
      },
      uploadedAt: "2025-07-16T10:00:00.000Z",
    },
    tags: ["demo", "website"],
  },
  "admin-create-event": {
    data: {
      id: "event-uuid",
      name: "Hack Night",
      slug: "hack-night-2026",
      visibility: "unlisted",
      allowPublicSharing: true,
      requiresInvite: false,
      location: "New York, NY",
      createdById: "global-admin-user-uuid",
      createdAt: "2026-06-01T12:00:00.000Z",
    },
  },
  "admin-temp-url": {
    url: "https://example.com/presigned-file-url",
    expiresIn: 3600,
    type: "media",
    variant: "original",
  },
  "admin-media-update": {
    data: {
      id: "media-uuid",
      caption: "Updated caption",
      metadata: {
        uploadedVia: "api",
        externalId: "cms-123",
        globalAdminOnlyDelete: true,
      },
      globalAdminOnlyDelete: true,
      uploadedById: "user-uuid",
    },
  },
  "admin-media-delete": {
    success: true,
  },
};

export default function ApiPlayground({
  isGlobalAdmin = false,
}: {
  isGlobalAdmin?: boolean;
}) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>("photos");
  const [params, setParams] = useState({
    random: false,
    count: "1",
    event: "",
    page: "1",
    limit: "20",
    search: "",
    slug: "",
    id: "",
  });
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState(APP_URL);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleParamChange = (key: string, value: string | boolean) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const isLimitInvalid = (limit: string) => {
    const val = parseInt(limit, 10);
    return Number.isNaN(val) || val < 1 || val > 100;
  };

  const isCountInvalid = (count: string) => {
    const val = parseInt(count, 10);
    return Number.isNaN(val) || val < 1 || val > 100;
  };

  const buildUrl = () => {
    if (selectedEndpoint === "upload") {
      return `${origin}/api/v1/upload`;
    }
    if (selectedEndpoint === "admin-create-event") {
      return `${origin}/api/v1/events`;
    }
    if (selectedEndpoint === "admin-temp-url") {
      const id = params.id || "media-or-event-uuid";
      return `${origin}/api/v1/admin/temp-url/${id}`;
    }
    if (
      selectedEndpoint === "admin-media-update" ||
      selectedEndpoint === "admin-media-delete"
    ) {
      const id = params.id || "media-uuid";
      return `${origin}/api/v1/admin/media/${id}`;
    }
    if (selectedEndpoint === "event-detail") {
      const s = params.slug || "daydream-toronto";
      return `${origin}/api/v1/events/${s}`;
    }
    if (selectedEndpoint === "series-detail") {
      const s = params.slug || "daydream-2025";
      return `${origin}/api/v1/series/${s}`;
    }

    const baseUrl = `${origin}/api/v1/${selectedEndpoint}`;
    const queryParams = new URLSearchParams();

    if (["photos", "videos", "media"].includes(selectedEndpoint)) {
      if (params.random) {
        queryParams.append("random", "true");
        if (params.count && params.count !== "1")
          queryParams.append("count", params.count);
      } else {
        if (params.page && params.page !== "1")
          queryParams.append("page", params.page);
        if (params.limit && params.limit !== "20")
          queryParams.append("limit", params.limit);
      }
      if (params.event) queryParams.append("event", params.event);
    } else {
      if (params.page && params.page !== "1")
        queryParams.append("page", params.page);
      if (params.limit && params.limit !== "20")
        queryParams.append("limit", params.limit);
      if (params.search) queryParams.append("search", params.search);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  const getCurlCommand = () => {
    if (selectedEndpoint === "upload") {
      return `curl -X POST "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@/path/to/photo.jpg" \\
  -F "eventId=${params.event || "event-uuid"}" \\
  -F "caption=Demo upload" \\
  -F "tags=demo,website" \\
  -F 'metadata={"source":"website-import","externalId":"cms-123"}' \\
  -F "uploadedById=U12345678" \\
  -F "globalAdminOnlyDelete=true"`;
    }
    if (selectedEndpoint === "admin-create-event") {
      return `curl -X POST "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Hack Night","slug":"hack-night-2026","visibility":"unlisted","location":"New York, NY","eventDate":"2026-06-01T18:00:00.000Z"}'`;
    }
    if (selectedEndpoint === "admin-temp-url") {
      return `curl -X POST "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"media","variant":"original","expiresIn":3600}'`;
    }
    if (selectedEndpoint === "admin-media-update") {
      return `curl -X PATCH "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"caption":"Updated caption","metadata":{"externalId":"cms-123"},"uploadedById":"U12345678","globalAdminOnlyDelete":true}'`;
    }
    if (selectedEndpoint === "admin-media-delete") {
      return `curl -X DELETE "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY"`;
    }
    return `curl "${buildUrl()}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getCurlCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showMediaParams = ["photos", "videos", "media"].includes(
    selectedEndpoint,
  );
  const isListEndpoint = ["events", "series"].includes(selectedEndpoint);
  const isDetailEndpoint = ["event-detail", "series-detail"].includes(
    selectedEndpoint,
  );
  const isUpload = selectedEndpoint === "upload";
  const isAdminCreateEvent = selectedEndpoint === "admin-create-event";
  const isTempUrl = selectedEndpoint === "admin-temp-url";
  const isAdminMedia =
    selectedEndpoint === "admin-media-update" ||
    selectedEndpoint === "admin-media-delete";
  const visibleEndpoints = ENDPOINTS.filter(
    (endpoint) => !ADMIN_ENDPOINTS.has(endpoint.id) || isGlobalAdmin,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {visibleEndpoints.map((endpoint) => (
          <button
            key={endpoint.id}
            onClick={() => setSelectedEndpoint(endpoint.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedEndpoint === endpoint.id
                ? "bg-red-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            }`}
          >
            {endpoint.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <HiPlay className="w-5 h-5 text-red-600" />
              Build your request
            </h3>

            <div className="space-y-4">
              {isDetailEndpoint && (
                <FormInput
                  label={
                    selectedEndpoint === "event-detail"
                      ? "Event Slug"
                      : "Series Slug"
                  }
                  placeholder={
                    selectedEndpoint === "event-detail"
                      ? "e.g. daydream-toronto"
                      : "e.g. daydream-2025"
                  }
                  value={params.slug}
                  onChange={(e) => handleParamChange("slug", e.target.value)}
                  className="mb-0"
                />
              )}

              {showMediaParams && (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="random"
                      checked={params.random}
                      onChange={(e) =>
                        handleParamChange("random", e.target.checked)
                      }
                      className="w-4 h-4 rounded-md border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900"
                    />
                    <label htmlFor="random" className="text-sm text-zinc-300">
                      Surprise me (Random)
                    </label>
                  </div>

                  {params.random ? (
                    <div>
                      <FormInput
                        label="How many? (1-100)"
                        type="number"
                        min="1"
                        max="100"
                        value={params.count}
                        onChange={(e) =>
                          handleParamChange("count", e.target.value)
                        }
                        className={`mb-0 ${isCountInvalid(params.count) ? "border-red-600 focus:ring-red-600" : ""}`}
                      />
                      {isCountInvalid(params.count) && (
                        <p className="text-xs text-red-600 mt-1">
                          Must be between 1 and 100. API will default to 100 if
                          exceeded.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <FormInput
                        label="Page"
                        type="number"
                        min="1"
                        value={params.page}
                        onChange={(e) =>
                          handleParamChange("page", e.target.value)
                        }
                        className="mb-0"
                      />
                      <div>
                        <FormInput
                          label="Limit (1-100)"
                          type="number"
                          min="1"
                          max="100"
                          value={params.limit}
                          onChange={(e) =>
                            handleParamChange("limit", e.target.value)
                          }
                          className={`mb-0 ${isLimitInvalid(params.limit) ? "border-red-600 focus:ring-red-600" : ""}`}
                        />
                        {isLimitInvalid(params.limit) && (
                          <p className="text-xs text-red-600 mt-1">
                            Must be between 1 and 100. API will default to 100
                            if exceeded.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <FormInput
                    label="Filter by Event (Optional)"
                    placeholder="e.g. daydream-toronto"
                    value={params.event}
                    onChange={(e) => handleParamChange("event", e.target.value)}
                    className="mb-0"
                  />
                </>
              )}

              {isListEndpoint && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      label="Page"
                      type="number"
                      min="1"
                      value={params.page}
                      onChange={(e) =>
                        handleParamChange("page", e.target.value)
                      }
                      className="mb-0"
                    />
                    <div>
                      <FormInput
                        label="Limit (1-50)"
                        type="number"
                        min="1"
                        max="50"
                        value={params.limit}
                        onChange={(e) =>
                          handleParamChange("limit", e.target.value)
                        }
                        className={`mb-0 ${parseInt(params.limit, 10) > 50 ? "border-red-600 focus:ring-red-600" : ""}`}
                      />
                      {parseInt(params.limit, 10) > 50 && (
                        <p className="text-xs text-red-600 mt-1">
                          Must be between 1 and 50. API will default to 50 if
                          exceeded.
                        </p>
                      )}
                    </div>
                  </div>
                  <FormInput
                    label="Search (Optional)"
                    placeholder="e.g. toronto"
                    value={params.search}
                    onChange={(e) =>
                      handleParamChange("search", e.target.value)
                    }
                    className="mb-0"
                  />
                </>
              )}

              {isUpload && (
                <div className="text-sm text-zinc-400">
                  <FormInput
                    label="Event ID"
                    placeholder="e.g. event-uuid"
                    value={params.event}
                    onChange={(e) => handleParamChange("event", e.target.value)}
                    className="mb-4"
                  />
                  <p className="mb-2">
                    Uploads require a <code>multipart/form-data</code> POST
                    request.
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <code>file</code>: The image or video file
                    </li>
                    <li>
                      <code>eventId</code>: The ID of the event to upload to
                    </li>
                    <li>
                      <code>tags</code>: Comma-separated app tags
                    </li>
                    <li>
                      <code>metadata</code>: JSON object stored on media
                    </li>
                    <li>
                      <code>uploadedById</code>: Admin API key only, upload as
                      another user. Use user UUID, Slack user ID, or Hack Club
                      ID. Unknown Slack/Hack Club IDs create pending ownership
                      and auto-claim on signup.
                    </li>
                    <li>
                      <code>globalAdminOnlyDelete</code>: Admin API key only,
                      only global admins can delete this media
                    </li>
                  </ul>
                  <p className="mt-2 text-yellow-500/80">
                    Note: You must use an API key with "Upload" permissions.
                  </p>
                </div>
              )}

              {isAdminCreateEvent && isGlobalAdmin && (
                <div className="text-sm text-zinc-400 space-y-2">
                  <p>
                    Admin-only. Creates public, auth-required, or unlisted
                    events.
                  </p>
                  <p>
                    Required JSON: <code>name</code>, <code>slug</code>.
                  </p>
                  <p>
                    Optional JSON: <code>description</code>,{" "}
                    <code>visibility</code>, <code>seriesId</code>,{" "}
                    <code>eventDate</code>, <code>location</code>,{" "}
                    <code>locationCity</code>, <code>locationCountry</code>,{" "}
                    <code>latitude</code>, <code>longitude</code>,{" "}
                    <code>allowPublicSharing</code>, <code>requiresInvite</code>
                    .
                  </p>
                </div>
              )}

              {isTempUrl && isGlobalAdmin && (
                <div className="text-sm text-zinc-400">
                  <FormInput
                    label="File Owner ID"
                    placeholder="media, event, or series UUID"
                    value={params.id}
                    onChange={(e) => handleParamChange("id", e.target.value)}
                    className="mb-4"
                  />
                  <p>
                    Admin-only. Generates short-lived signed URLs for media,
                    thumbnails, event banners, and series banners.
                  </p>
                </div>
              )}

              {isAdminMedia && isGlobalAdmin && (
                <div className="text-sm text-zinc-400">
                  <FormInput
                    label="Media ID"
                    placeholder="media UUID"
                    value={params.id}
                    onChange={(e) => handleParamChange("id", e.target.value)}
                    className="mb-4"
                  />
                  <p>
                    Admin-only. Update caption, metadata, event, uploaded user,
                    or deletion lock. Uploaded user accepts user UUID, Slack
                    user ID, or Hack Club ID; unknown Slack/Hack Club IDs become
                    pending ownership. Delete removes S3 files and the DB row.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">The Code</h3>
              <button
                onClick={copyToClipboard}
                className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
              >
                {copied ? (
                  <>
                    <HiClipboardDocumentCheck className="w-4 h-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <HiClipboard className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="bg-black p-4 rounded-lg border border-zinc-800 overflow-x-auto">
              <code className="text-sm text-zinc-300 whitespace-pre font-mono">
                {getCurlCommand()}
              </code>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 flex flex-col h-full">
          <h3 className="text-white font-medium mb-4">What you get back</h3>
          <div className="flex-1 bg-black p-4 rounded-lg border border-zinc-800 overflow-auto max-h-150">
            <pre className="text-xs text-green-400 font-mono">
              {JSON.stringify(
                EXAMPLE_RESPONSES[selectedEndpoint],
                null,
                2,
              ).replace(/https:\/\/photos\.hackclub\.com/g, origin)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
