"use client";
import { useEffect, useRef, useState } from "react";
import { HiDocumentText, HiTrash, HiXMark } from "react-icons/hi2";
import { getBulkMediaUrls } from "@/app/actions/bulk";
import UserAvatar from "@/components/ui/UserAvatar";

interface User {
  name: string;
  email?: string;
  avatarS3Key?: string | null;
  slackId?: string | null;
}
interface Upload {
  s3Key: string;
  thumbnailS3Key?: string | null;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  user?: User;
  uploads?: Upload[];
  stats?: {
    photos: number;
    videos: number;
    likes: number;
    events: number;
  };
}
export default function DeleteAccountModal({
  isOpen,
  onClose,
  onConfirm,
  user,
  uploads = [],
  stats,
}: Props) {
  const [step, setStep] = useState(0);
  const [timer, setTimer] = useState(5);
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [deletingIndex, setDeletingIndex] = useState(-1);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setTimer(5);
      setDeletingIndex(-1);
      setHoldProgress(0);
      setIsHolding(false);
      const fetchPreviews = async () => {
        if (uploads.length > 0) {
          try {
            const keys = uploads
              .slice(0, 50)
              .map((u) => u.thumbnailS3Key || u.s3Key)
              .filter(Boolean);
            if (keys.length > 0) {
              const result = await getBulkMediaUrls(keys);
              if (result.success && result.urls) {
                setPreviewMap(result.urls);
              }
            }
          } catch (e) {
            console.error("Failed to fetch previews:", e);
          }
        }
      };
      fetchPreviews();
    }
  }, [isOpen, uploads]);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step < 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000) as unknown as NodeJS.Timeout;
    }
    return () => clearInterval(interval);
  }, [step, timer]);
  useEffect(() => {
    if (step === 3) {
      const totalItems = Math.min(uploads.length, 50);
      let current = 0;
      const interval = setInterval(() => {
        setDeletingIndex(current);
        current++;
        if (current > totalItems + 5) {
          clearInterval(interval);
          setTimeout(() => {
            onConfirm();
          }, 1000);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [step, onConfirm, uploads.length]);
  const handleNext = () => {
    if (step === 0) {
      setStep(1);
      setTimer(5);
    } else if (step === 1) {
      setStep(2);
    }
  };
  const handleHoldStart = () => {
    if (holdProgress >= 100) return;
    setIsHolding(true);
  };
  const handleHoldEnd = () => {
    if (holdProgress >= 100) return;
    setIsHolding(false);
  };
  useEffect(() => {
    if (isHolding) {
      holdIntervalRef.current = setInterval(() => {
        setHoldProgress((prev) => {
          if (prev >= 100) {
            if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
            setStep(3);
            return 100;
          }
          return prev + 0.133;
        });
      }, 20) as unknown as NodeJS.Timeout;
    } else {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
      setHoldProgress(0);
    }
    return () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    };
  }, [isHolding]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full relative shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <HiTrash className="text-red-600" />
            Delete Account
          </h3>
          {step !== 3 && (
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <HiXMark className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 0 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-zinc-800 grayscale opacity-50">
                    {user && <UserAvatar user={user} size="xl" />}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-red-600 text-white p-2 rounded-full border-4 border-zinc-900">
                    <HiTrash className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xl font-bold text-white">Are you sure?</h4>
                <p className="text-zinc-400">
                  This will permanently delete your profile, including your
                  avatar, bio, and all your settings.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={timer > 0}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
                >
                  {timer > 0 ? `Please wait ${timer}s...` : "Yes, continue"}
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h4 className="text-xl font-bold text-white">Your Data</h4>
                <p className="text-zinc-400">
                  All your uploaded content will be permanently removed.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 my-4 opacity-75">
                {uploads.slice(0, 6).map((upload, i) => {
                  const key = upload.thumbnailS3Key || upload.s3Key;
                  const url = previewMap[key];
                  return (
                    <div
                      key={i}
                      className="aspect-square bg-zinc-800 rounded-lg overflow-hidden relative group"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt="Preview"
                          className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                          <HiDocumentText className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-red-600/20 mix-blend-overlay pointer-events-none"></div>
                    </div>
                  );
                })}
                {uploads.length > 6 && (
                  <div className="aspect-square bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-500 text-xs font-medium">
                    +{uploads.length - 6} more
                  </div>
                )}
                {uploads.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-zinc-500 text-sm italic">
                    No files to delete
                  </div>
                )}
              </div>

              {stats && (
                <div className="flex justify-center gap-8 text-center">
                  <div>
                    <span className="block text-2xl font-bold text-white">
                      {stats.photos}
                    </span>
                    <span className="text-xs text-zinc-500 uppercase">
                      Photos
                    </span>
                  </div>
                  <div>
                    <span className="block text-2xl font-bold text-white">
                      {stats.videos}
                    </span>
                    <span className="text-xs text-zinc-500 uppercase">
                      Videos
                    </span>
                  </div>
                  <div>
                    <span className="block text-2xl font-bold text-white">
                      {stats.likes}
                    </span>
                    <span className="text-xs text-zinc-500 uppercase">
                      Likes
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={timer > 0}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
                >
                  {timer > 0
                    ? `Reviewing files (${timer}s)...`
                    : "I understand, delete everything"}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h4 className="text-xl font-bold text-white">
                  Final Confirmation
                </h4>
                <p className="text-zinc-400">
                  Hold the button below to fully delete your profile.
                </p>
              </div>

              <div className="relative h-48 flex items-center justify-center">
                <div
                  className="relative w-32 h-32 transition-all duration-75"
                  style={{
                    opacity: Math.max(0, 1 - holdProgress / 100),
                    filter: `grayscale(${holdProgress}%)`,
                    transform: `scale(${1 - holdProgress / 200})`,
                  }}
                >
                  <div className="w-full h-full rounded-full overflow-hidden border-4 border-zinc-700 shadow-2xl">
                    {user && (
                      <UserAvatar
                        user={user}
                        size="xl"
                        className="w-full h-full"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  type="button"
                  onMouseDown={handleHoldStart}
                  onMouseUp={handleHoldEnd}
                  onMouseLeave={handleHoldEnd}
                  onTouchStart={handleHoldStart}
                  onTouchEnd={handleHoldEnd}
                  className={`w-full py-4 rounded-lg font-bold text-lg transition-all relative overflow-hidden ${
                    isHolding
                      ? "bg-zinc-800 scale-95"
                      : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  <div
                    className="absolute inset-0 bg-red-600 transition-all duration-75 ease-linear"
                    style={{
                      width: `${holdProgress}%`,
                      opacity: isHolding ? 1 : 0,
                    }}
                  />

                  <span className="relative z-10 text-white flex items-center justify-center gap-2">
                    {holdProgress > 0
                      ? holdProgress > 95
                        ? "Goodbye"
                        : `Hold for ${Math.ceil((15 * (100 - holdProgress)) / 100)} more seconds`
                      : "Hold to delete data"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 text-zinc-500 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-8 overflow-hidden min-h-100">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-zinc-800 rounded-full animate-pulse"></div>
                <HiTrash className="w-24 h-24 text-red-600" />

                {uploads.slice(0, 50).map((upload, i) => {
                  const key = upload.thumbnailS3Key || upload.s3Key;
                  const url = previewMap[key];
                  const isDeleting = deletingIndex > i;
                  const randomX = (i % 5) * 20 - 40;
                  return (
                    <div
                      key={i}
                      className={`absolute w-12 h-12 bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 shadow-xl transition-all duration-700 ease-in-out ${
                        isDeleting
                          ? "opacity-0 scale-0 translate-y-12 rotate-180"
                          : "opacity-100 scale-100 -translate-y-32"
                      }`}
                      style={{
                        left: `calc(50% + ${randomX}px)`,
                        top: "50%",
                        marginLeft: "-24px",
                        marginTop: "-24px",
                        transitionDelay: `${i * 50}ms`,
                        zIndex: 50 - i,
                      }}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <HiDocumentText className="w-6 h-6 text-zinc-500" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-center space-y-1 relative z-10">
                <h4 className="text-white font-medium animate-pulse">
                  Deleting your data...
                </h4>
                <p className="text-sm text-zinc-500">
                  Goodbye, {user?.name?.split(" ")[0]}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
