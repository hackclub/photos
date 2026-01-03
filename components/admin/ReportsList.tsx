"use client";
import { useEffect, useState } from "react";
import {
  HiCheck,
  HiExclamationTriangle,
  HiEye,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import { getBulkMediaUrls } from "@/app/actions/bulk";
import { deleteMedia } from "@/app/actions/media";
import { getReports, resolveReport } from "@/app/actions/reports";
import { banUser } from "@/app/actions/users";
import PhotoDetailModal from "@/components/media/PhotoDetailModal";
import VideoIndicator from "@/components/media/VideoIndicator";
import ConfirmModal from "@/components/ui/ConfirmModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { useAuth } from "@/hooks/useAuth";

interface Report {
  id: string;
  mediaId: string;
  reporterId: string;
  reason: string;
  status: "pending" | "resolved" | "ignored";
  createdAt: Date;
  media: {
    id: string;
    s3Url: string;
    thumbnailS3Key: string | null;
    filename: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    uploadedBy: {
      id: string;
      name: string;
      handle: string | null;
      avatarS3Key: string | null;
      email: string;
    };
  };
  reporter: {
    id: string;
    name: string;
    handle: string | null;
    avatarS3Key: string | null;
    email: string;
  };
  resolvedBy?: {
    id: string;
    name: string;
  } | null;
}
export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<Report["media"] | null>(
    null,
  );
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>(
    {},
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banTarget, setBanTarget] = useState<"uploader" | "reporter">(
    "uploader",
  );
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const result = await getReports();
        if (result.success && result.reports) {
          setReports(result.reports as unknown as Report[]);
        }
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);
  useEffect(() => {
    const loadThumbnails = async () => {
      if (reports.length === 0) return;
      const thumbnailKeys = reports
        .map((r) => r.media?.thumbnailS3Key)
        .filter((key): key is string => !!key);
      if (thumbnailKeys.length === 0) return;
      try {
        const data = await getBulkMediaUrls(thumbnailKeys);
        setPresignedUrls(data.urls || {});
      } catch (error) {
        console.error("Failed to load thumbnails:", error);
      }
    };
    loadThumbnails();
  }, [reports]);
  useEffect(() => {
    const loadFullSize = async () => {
      if (!selectedMedia) {
        setFullSizeUrl(null);
        return;
      }
      try {
        const data = await getBulkMediaUrls(undefined, [selectedMedia.id]);
        const url = data.urls?.[selectedMedia.id] ?? null;
        setFullSizeUrl(url);
      } catch (error) {
        console.error("Failed to load full-size image:", error);
      }
    };
    loadFullSize();
  }, [selectedMedia]);
  const handleResolve = async (
    reportId: string,
    status: "resolved" | "ignored",
  ) => {
    setActionLoading(reportId);
    try {
      const result = await resolveReport(reportId, status);
      if (result.success) {
        setReports(
          reports.map((r) => (r.id === reportId ? { ...r, status } : r)),
        );
      }
    } catch (error) {
      console.error("Error resolving report:", error);
    } finally {
      setActionLoading(null);
    }
  };
  const handleDeleteMedia = async () => {
    if (!selectedReport) return;
    setActionLoading(selectedReport.id);
    try {
      const result = await deleteMedia(selectedReport.mediaId);
      if (result.success) {
        await handleResolve(selectedReport.id, "resolved");
        setReports((prev) =>
          prev.map((r) =>
            r.mediaId === selectedReport.mediaId
              ? { ...r, status: "resolved" }
              : r,
          ),
        );
        if (selectedMedia?.id === selectedReport.mediaId) {
          setSelectedMedia(null);
          setFullSizeUrl(null);
        }
      }
    } catch (error) {
      console.error("Error deleting media:", error);
    } finally {
      setActionLoading(null);
      setShowDeleteModal(false);
      setSelectedReport(null);
    }
  };
  const handleBanUser = async () => {
    if (!selectedReport) return;
    setActionLoading(selectedReport.id);
    try {
      const userId =
        banTarget === "uploader"
          ? selectedReport.media.uploadedBy.id
          : selectedReport.reporter.id;
      const reason =
        banTarget === "uploader"
          ? `Banned due to report on media ${selectedReport.mediaId}: ${selectedReport.reason}`
          : `Banned for abuse of reporting system (Report ID: ${selectedReport.id})`;
      const result = await banUser(userId, reason);
      if (result.success) {
        await handleResolve(selectedReport.id, "resolved");
      }
    } catch (error) {
      console.error("Error banning user:", error);
    } finally {
      setActionLoading(null);
      setShowBanModal(false);
      setSelectedReport(null);
    }
  };
  if (loading) {
    return <LoadingSpinner center />;
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-white mb-6">
        <HiExclamationTriangle className="w-6 h-6 text-red-600" />
        <h2 className="text-xl font-bold">Reports</h2>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 rounded-xl border border-zinc-800">
          <HiCheck className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-zinc-400">No reports found. All good!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className={`bg-zinc-900 rounded-xl border p-4 transition-colors ${
                report.status === "pending"
                  ? "border-red-600/30 bg-red-600/5"
                  : "border-zinc-800 opacity-75"
              }`}
            >
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:w-48 flex-shrink-0">
                  {report.media ? (
                    <div
                      className="aspect-video bg-zinc-800 rounded-lg overflow-hidden relative cursor-pointer group"
                      onClick={() => {
                        setSelectedMedia(report.media);
                        setSelectedReport(report);
                      }}
                    >
                      {report.media.thumbnailS3Key &&
                      presignedUrls[report.media.thumbnailS3Key] ? (
                        <img
                          src={presignedUrls[report.media.thumbnailS3Key]}
                          alt="Reported content"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <LoadingSpinner />
                        </div>
                      )}

                      {report.media.mimeType.startsWith("video/") && (
                        <VideoIndicator />
                      )}

                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                        <HiEye className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video bg-zinc-800/50 rounded-lg border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 p-4 text-center">
                      <HiTrash className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-xs">Media Deleted</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                            report.status === "pending"
                              ? "bg-red-600/10 text-red-400 border-red-600/20"
                              : report.status === "resolved"
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          }`}
                        >
                          {report.status.toUpperCase()}
                        </span>
                        <span className="text-zinc-500 text-sm">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-white font-medium mb-2">
                        {report.reason}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                      <p className="text-zinc-500 text-xs mb-2 uppercase tracking-wider">
                        Reported By
                      </p>
                      <div className="flex items-center gap-2">
                        <UserAvatar user={report.reporter} size="sm" />
                        <div>
                          <p className="text-white">{report.reporter.name}</p>
                          <p className="text-zinc-500 text-xs">
                            @{report.reporter.handle || "user"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                      <p className="text-zinc-500 text-xs mb-2 uppercase tracking-wider">
                        Uploaded By
                      </p>
                      {report.media ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            user={report.media.uploadedBy}
                            size="sm"
                          />
                          <div>
                            <p className="text-white">
                              {report.media.uploadedBy.name}
                            </p>
                            <p className="text-zinc-500 text-xs">
                              @{report.media.uploadedBy.handle || "user"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 opacity-50">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                            <HiTrash className="w-4 h-4 text-zinc-500" />
                          </div>
                          <div>
                            <p className="text-zinc-400 italic">Unknown</p>
                            <p className="text-zinc-600 text-xs">
                              Media deleted
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {report.status === "pending" && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-800/50">
                      <button
                        onClick={() => handleResolve(report.id, "ignored")}
                        disabled={actionLoading === report.id}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-lg text-sm transition-colors"
                      >
                        Ignore
                      </button>
                      {report.media && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedReport(report);
                              setShowDeleteModal(true);
                            }}
                            disabled={actionLoading === report.id}
                            className="px-3 py-1.5 bg-red-600/10 hover:bg-red-700/20 border border-red-600/20 text-red-400 font-medium rounded-lg text-sm transition-colors flex items-center gap-1.5"
                          >
                            <HiTrash className="w-4 h-4" />
                            Delete Media
                          </button>
                          <button
                            onClick={() => {
                              setSelectedReport(report);
                              setBanTarget("uploader");
                              setShowBanModal(true);
                            }}
                            disabled={actionLoading === report.id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-1.5"
                          >
                            <HiXMark className="w-4 h-4" />
                            Ban Uploader
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setSelectedReport(report);
                          setBanTarget("reporter");
                          setShowBanModal(true);
                        }}
                        disabled={actionLoading === report.id}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-1.5"
                      >
                        <HiXMark className="w-4 h-4" />
                        Ban Reporter
                      </button>
                      <button
                        onClick={() => handleResolve(report.id, "resolved")}
                        disabled={actionLoading === report.id}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-sm transition-colors ml-auto flex items-center gap-1.5"
                      >
                        <HiCheck className="w-4 h-4" />
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMedia && fullSizeUrl && (
        <PhotoDetailModal
          media={selectedMedia as any}
          fullSizeUrl={fullSizeUrl}
          downloading={false}
          currentUserId={user?.id}
          onClose={() => {
            setSelectedMedia(null);
            setFullSizeUrl(null);
            setSelectedReport(null);
          }}
          onDownload={() => {}}
          onDelete={() => setShowDeleteModal(true)}
          onNext={() => {}}
          onPrevious={() => {}}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedReport(null);
        }}
        onConfirm={handleDeleteMedia}
        title="Delete Reported Media"
        message="Are you sure you want to delete this media? This action cannot be undone."
        confirmText="Delete Media"
        cancelText="Cancel"
        danger
      />

      <ConfirmModal
        isOpen={showBanModal}
        onClose={() => {
          setShowBanModal(false);
          setSelectedReport(null);
        }}
        onConfirm={handleBanUser}
        title={`Ban ${banTarget === "uploader" ? "Uploader" : "Reporter"}`}
        message={`Are you sure you want to ban ${
          banTarget === "uploader"
            ? selectedReport?.media?.uploadedBy.name
            : selectedReport?.reporter.name
        }? They will no longer be able to access the platform.`}
        confirmText={`Ban ${banTarget === "uploader" ? "Uploader" : "Reporter"}`}
        cancelText="Cancel"
        danger
      />
    </div>
  );
}
