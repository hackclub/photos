"use client";
import Image from "next/image";
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
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
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
export default function ReportsClient() {
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
  const sortedReports = [...reports].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Uploader</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReports.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-zinc-400"
                >
                  <div className="flex flex-col items-center justify-center">
                    <HiCheck className="w-12 h-12 text-green-500 mb-3" />
                    <p>No reports found. All good!</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <div className="w-24 flex-shrink-0">
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
                            <Image
                              src={presignedUrls[report.media.thumbnailS3Key]}
                              alt="Reported content"
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <LoadingSpinner size="sm" />
                            </div>
                          )}

                          {report.media.mimeType.startsWith("video/") && (
                            <VideoIndicator />
                          )}

                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                            <HiEye className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-video bg-zinc-800/50 rounded-lg border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 p-2 text-center">
                          <HiTrash className="w-4 h-4 mb-1 opacity-50" />
                          <span className="text-[10px]">Deleted</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p
                      className="text-white text-sm max-w-xs truncate"
                      title={report.reason}
                    >
                      {report.reason}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar user={report.reporter} size="sm" />
                      <div className="max-w-[120px]">
                        <p className="text-white text-sm truncate">
                          {report.reporter.name}
                        </p>
                        <p className="text-zinc-500 text-xs truncate">
                          @{report.reporter.handle || "user"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {report.media ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar user={report.media.uploadedBy} size="sm" />
                        <div className="max-w-[120px]">
                          <p className="text-white text-sm truncate">
                            {report.media.uploadedBy.name}
                          </p>
                          <p className="text-zinc-500 text-xs truncate">
                            @{report.media.uploadedBy.handle || "user"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-sm italic">
                        Unknown
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-zinc-400 text-sm">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {report.status === "pending" ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleResolve(report.id, "ignored")}
                          disabled={actionLoading === report.id}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Ignore Report"
                        >
                          <HiXMark className="w-4 h-4" />
                        </button>
                        {report.media && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedReport(report);
                                setShowDeleteModal(true);
                              }}
                              disabled={actionLoading === report.id}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-700/10 rounded-lg transition-colors"
                              title="Delete Media"
                            >
                              <HiTrash className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedReport(report);
                                setBanTarget("uploader");
                                setShowBanModal(true);
                              }}
                              disabled={actionLoading === report.id}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-700/10 rounded-lg transition-colors"
                              title="Ban Uploader"
                            >
                              <HiExclamationTriangle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleResolve(report.id, "resolved")}
                          disabled={actionLoading === report.id}
                          className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                          title="Resolve Report"
                        >
                          <HiCheck className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-sm italic">
                        Resolved
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
