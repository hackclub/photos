"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowDownTray,
  HiArrowTopRightOnSquare,
  HiArrowUturnRight,
  HiCheck,
  HiChevronLeft,
  HiChevronRight,
  HiClipboard,
  HiCommandLine,
  HiExclamationTriangle,
  HiFaceFrown,
  HiHeart,
  HiInformationCircle,
  HiOutlineBolt,
  HiOutlineCalendar,
  HiOutlineCamera,
  HiOutlineChatBubbleLeft,
  HiOutlineMapPin,
  HiOutlineSun,
  HiPaperAirplane,
  HiPencil,
  HiShare,
  HiTag,
  HiTrash,
  HiUser,
  HiUserGroup,
  HiXMark,
} from "react-icons/hi2";
import { updateMediaCaption } from "@/app/actions/media";
import {
  addMention,
  getMediaMentions,
  removeMention,
} from "@/app/actions/mentions";
import { createShareLink } from "@/app/actions/sharing";
import {
  createComment,
  deleteComment,
  getMediaComments,
  getMediaLikes,
  toggleCommentLike,
  toggleMediaLike,
} from "@/app/actions/social";
import {
  addTag,
  getMediaTags,
  removeTag,
  searchByTag,
} from "@/app/actions/tags";
import { searchUsers } from "@/app/actions/users";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { useHeicUrl } from "@/hooks/useHeicUrl";
import {
  formatAperture,
  formatExposureTime,
  formatFocalLength,
  formatISO,
} from "@/lib/media/exif";
import ReportModal from "./ReportModal";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full bg-zinc-800 animate-pulse rounded-lg flex items-center justify-center text-zinc-500 text-sm">
      Loading map...
    </div>
  ),
});
interface ExifData {
  Make?: string;
  make?: string;
  Model?: string;
  model?: string;
  LensModel?: string;
  lensModel?: string;
  FocalLength?: number;
  focalLength?: number;
  FNumber?: number;
  fNumber?: number;
  ExposureTime?: number;
  exposureTime?: number;
  ISO?: number;
  iso?: number;
  DateTimeOriginal?: string;
  dateTimeOriginal?: string;
  latitude?: number;
  longitude?: number;
}
interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    name: string;
    email?: string;
    avatarS3Key?: string | null;
    handle?: string | null;
    slackId?: string | null;
  };
  caption?: string | null;
  likeCount?: number;
  canDelete?: boolean;
  s3Url: string;
  thumbnailS3Key: string | null;
  eventId?: string;
  event?: {
    id: string;
    name: string;
    slug: string;
  };
  apiKey?: {
    id: string;
    name: string | null;
  } | null;
}
interface Event {
  id?: string;
  name?: string;
  slug?: string;
}
interface Reply {
  id: string;
  content: string;
  createdAt: string | Date;
  likeCount: number;
  hasLiked: boolean;
  user: {
    id: string;
    name: string;
    handle?: string | null;
  };
}
interface Comment {
  id: string;
  content: string;
  createdAt: string | Date;
  likeCount: number;
  hasLiked: boolean;
  user: {
    id: string;
    name: string;
    handle?: string | null;
  };
  replies: Reply[];
}
interface Tag {
  id: string;
  name: string;
  color?: string | null;
}
const TAG_COLORS: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  red: "bg-red-600/10 text-red-400 border-red-600/20",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pink: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  gray: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};
interface MentionedUser {
  id: string;
  name: string;
  handle?: string | null;
  avatarS3Key?: string | null;
  email?: string;
  slackId?: string | null;
}
interface Props {
  media: MediaItem;
  fullSizeUrl: string;
  thumbnailUrl?: string | null;
  event?: Event;
  currentUserId?: string;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void;
  onMediaUpdate?: (media: MediaItem) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  onRequestFreshUrl?: () => void;
}
export default function PhotoDetailModal({
  media,
  fullSizeUrl,
  thumbnailUrl = null,
  event,
  currentUserId,
  downloading,
  onClose,
  onDownload,
  onDelete,
  onMediaUpdate,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  onRequestFreshUrl,
}: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [videoRetryCount, setVideoRetryCount] = useState(0);

  const MAX_IMAGE_AUTO_RETRIES = 2;
  const { displayUrl } = useHeicUrl(fullSizeUrl, media.filename);
  const effectiveUrl = useMemo(() => {
    if (!displayUrl) return null;
    if (retryCount === 0) return displayUrl;
    try {
      const url = new URL(displayUrl);
      url.searchParams.set("t", Date.now().toString());
      return url.toString();
    } catch (_e) {
      return displayUrl;
    }
  }, [displayUrl, retryCount]);
  const [activeTab, setActiveTab] = useState<"info" | "comments">("info");
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [commentLikePending, setCommentLikePending] = useState<Set<string>>(
    new Set(),
  );
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [caption, setCaption] = useState(media.caption || "");
  const [savingCaption, setSavingCaption] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [_loadingTags, setLoadingTags] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [mentions, setMentions] = useState<MentionedUser[]>([]);
  const [newMention, setNewMention] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionedUser[]>(
    [],
  );
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [addingMention, setAddingMention] = useState(false);
  const [_loadingMentions, setLoadingMentions] = useState(false);
  const mentionInputRef = useRef<HTMLInputElement>(null);
  const mentionSuggestionsRef = useRef<HTMLDivElement>(null);
  const [hoveredMention, setHoveredMention] = useState<{
    user: MentionedUser;
    rect: DOMRect;
  } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinks, setShareLinks] = useState<{
    view: string;
    raw: string;
  } | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState<"view" | "raw" | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const displayedMentions = useMemo(() => {
    const uploaderIsMentioned = mentions.some(
      (m) => m.id === media.uploadedBy.id,
    );
    if (uploaderIsMentioned) {
      return mentions;
    }
    const uploaderAsMention: MentionedUser = {
      id: media.uploadedBy.id,
      name: media.uploadedBy.name,
      handle: media.uploadedBy.handle,
      avatarS3Key: media.uploadedBy.avatarS3Key,
      email: media.uploadedBy.email,
      slackId: media.uploadedBy.slackId,
    };
    return [uploaderAsMention, ...mentions];
  }, [mentions, media.uploadedBy]);
  useEffect(() => {
    if (isEditingCaption && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingCaption]);
  const previousMediaIdRef = useRef<string>(media.id);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const previousId = previousMediaIdRef.current;
    if (media.id === previousId) return;

    previousMediaIdRef.current = media.id;

    setImageLoaded(false);
    setImageError(false);
    setRetryCount(0);

    setVideoError(false);
    setVideoRetryCount(0);

    setCaption(media.caption || "");
    setIsEditingCaption(false);

    setShareLinks(null);
    setShowShareModal(false);
    setShowReportModal(false);

    setNewTag("");
    setSuggestions([]);
    setShowSuggestions(false);

    setNewMention("");
    setMentionSuggestions([]);
    setShowMentionSuggestions(false);

    setComments([]);
    setLoadingComments(true);

    setLikeCount(media.likeCount || 0);
    setHasLiked(false);

    setTags([]);
    setMentions([]);
  }, [media.id, media.caption, media.likeCount]);

  useEffect(() => {
    if (imageLoaded || imageError || !media.mimeType.startsWith("image/"))
      return;

    const timeoutId = window.setTimeout(() => {
      if (!imageLoaded && !imageError) {
        console.warn(
          `Image loading timed out after 60 seconds for ${media.id}`,
        );
        setImageError(true);
      }
    }, 60000);

    return () => window.clearTimeout(timeoutId);
  }, [imageLoaded, imageError, media.mimeType, media.id]);

  useEffect(() => {
    if (effectiveUrl) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [effectiveUrl]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
      if (
        mentionSuggestionsRef.current &&
        !mentionSuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowMentionSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (newTag.trim().length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const result = await searchByTag(newTag);
      if (result.success && result.tags) {
        const existingTagIds = new Set(tags.map((t) => t.id));
        const filteredSuggestions = result.tags.filter(
          (t) => !existingTagIds.has(t.id),
        );
        setSuggestions(filteredSuggestions);
        setShowSuggestions(filteredSuggestions.length > 0);
      }
    };
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [newTag, tags]);
  useEffect(() => {
    const fetchMentionSuggestions = async () => {
      if (newMention.trim().length < 2) {
        setMentionSuggestions([]);
        setShowMentionSuggestions(false);
        return;
      }
      const result = await searchUsers(newMention);
      if (result.success && result.users) {
        const existingIds = new Set(mentions.map((u) => u.id));
        existingIds.add(media.uploadedBy.id);
        const filteredSuggestions = result.users.filter(
          (u) => !existingIds.has(u.id),
        );
        setMentionSuggestions(filteredSuggestions);
        setShowMentionSuggestions(filteredSuggestions.length > 0);
      }
    };
    const timeoutId = setTimeout(fetchMentionSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [newMention, mentions, media.uploadedBy.id]);
  useEffect(() => {
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;
    let cancelled = false;

    const shouldIgnore = () => cancelled || requestSeqRef.current !== seq;

    const fetchData = async () => {
      try {
        const likesData = await getMediaLikes(media.id);
        if (shouldIgnore()) return;
        if (likesData.success) {
          setLikeCount(likesData.likeCount ?? 0);
          setHasLiked(likesData.hasLiked ?? false);
        }

        setLoadingTags(true);
        const tagsData = await getMediaTags(media.id);
        if (shouldIgnore()) return;
        if (tagsData.success && tagsData.tags) {
          setTags(tagsData.tags);
        }
        setLoadingTags(false);

        setLoadingMentions(true);
        const mentionsData = await getMediaMentions(media.id);
        if (shouldIgnore()) return;
        if (mentionsData.success && mentionsData.mentions) {
          setMentions(mentionsData.mentions);
        }
        setLoadingMentions(false);

        setLoadingComments(true);
        const commentsData = await getMediaComments(media.id);
        if (shouldIgnore()) return;
        if (commentsData.success && commentsData.comments) {
          setComments(commentsData.comments as unknown as Comment[]);
        }
      } catch (error) {
        if (shouldIgnore()) return;
        console.error("Error fetching data:", error);
      } finally {
        if (!shouldIgnore()) {
          setLoadingComments(false);
          setLoadingTags(false);
          setLoadingMentions(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [media.id]);
  const handleLike = async () => {
    if (!currentUserId) {
      window.location.href = "/auth/signin";
      return;
    }
    if (likePending) return;
    const previousLikeCount = likeCount;
    const previousHasLiked = hasLiked;
    const newHasLiked = !hasLiked;
    const newLikeCount = hasLiked ? likeCount - 1 : likeCount + 1;
    setHasLiked(newHasLiked);
    setLikeCount(newLikeCount);
    setLikePending(true);
    onMediaUpdate?.({
      ...media,
      likeCount: newLikeCount,
    });
    try {
      const data = await toggleMediaLike(media.id);
      if (data.success) {
        setLikeCount(data.likeCount ?? 0);
        setHasLiked(data.hasLiked ?? false);
        onMediaUpdate?.({
          ...media,
          likeCount: data.likeCount ?? 0,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      setHasLiked(previousHasLiked);
      setLikeCount(previousLikeCount);
      onMediaUpdate?.({
        ...media,
        likeCount: previousLikeCount,
      });
    } finally {
      setLikePending(false);
    }
  };
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newComment.trim();
    if (!currentUserId || !content || submittingComment) return;

    setSubmittingComment(true);
    try {
      const data = await createComment(media.id, content);
      if (data.success && data.comment) {
        const newCommentObj = {
          ...data.comment,
          replies: [],
        } as unknown as Comment;
        setComments((prev) => [newCommentObj, ...prev]);
        setNewComment("");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmittingComment(false);
    }
  };
  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      setComments((prev) =>
        prev
          .map((c) => {
            if (c.id === commentId) {
              return null;
            }
            if (c.replies.some((r) => r.id === commentId)) {
              return {
                ...c,
                replies: c.replies.filter((r) => r.id !== commentId),
              };
            }
            return c;
          })
          .filter((c): c is Comment => c !== null),
      );
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };
  const handleCommentLike = async (
    commentId: string,
    currentlyLiked: boolean,
  ) => {
    if (!currentUserId) return;

    if (commentLikePending.has(commentId)) return;

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          return {
            ...c,
            likeCount: currentlyLiked ? c.likeCount - 1 : c.likeCount + 1,
            hasLiked: !currentlyLiked,
          };
        }
        if (c.replies.some((r) => r.id === commentId)) {
          return {
            ...c,
            replies: c.replies.map((r) =>
              r.id === commentId
                ? {
                    ...r,
                    likeCount: currentlyLiked
                      ? r.likeCount - 1
                      : r.likeCount + 1,
                    hasLiked: !currentlyLiked,
                  }
                : r,
            ),
          };
        }
        return c;
      }),
    );

    setCommentLikePending((prev) => new Set(prev).add(commentId));

    try {
      const data = await toggleCommentLike(commentId);
      if (!data.success) {
        throw new Error(data.error);
      }

      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              likeCount: data.likeCount ?? 0,
              hasLiked: data.hasLiked ?? false,
            };
          }
          if (c.replies.some((r) => r.id === commentId)) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === commentId
                  ? {
                      ...r,
                      likeCount: data.likeCount ?? 0,
                      hasLiked: data.hasLiked ?? false,
                    }
                  : r,
              ),
            };
          }
          return c;
        }),
      );
    } catch (error) {
      console.error("Error toggling comment like:", error);

      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              likeCount: currentlyLiked ? c.likeCount + 1 : c.likeCount - 1,
              hasLiked: currentlyLiked,
            };
          }
          if (c.replies.some((r) => r.id === commentId)) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === commentId
                  ? {
                      ...r,
                      likeCount: currentlyLiked
                        ? r.likeCount + 1
                        : r.likeCount - 1,
                      hasLiked: currentlyLiked,
                    }
                  : r,
              ),
            };
          }
          return c;
        }),
      );
    } finally {
      setCommentLikePending((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };
  const handleReplySubmit = async (
    e: React.FormEvent,
    parentCommentId: string,
  ) => {
    e.preventDefault();
    const content = replyContent.trim();
    if (!currentUserId || !content || submittingReply) return;

    setSubmittingReply(true);
    try {
      const data = await createComment(media.id, content, parentCommentId);
      if (data.success && data.comment) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentCommentId
              ? {
                  ...c,
                  replies: [data.comment as unknown as Reply, ...c.replies],
                }
              : c,
          ),
        );
        setReplyContent("");
        setReplyingTo(null);
      }
    } catch (error) {
      console.error("Error posting reply:", error);
    } finally {
      setSubmittingReply(false);
    }
  };
  const handleSaveCaption = async () => {
    if (!currentUserId || savingCaption) return;
    setSavingCaption(true);
    try {
      const result = await updateMediaCaption(media.id, caption.trim());
      if (result.success) {
        setIsEditingCaption(false);
        onMediaUpdate?.({
          ...media,
          caption: caption.trim(),
        });
      }
    } catch (error) {
      console.error("Error saving caption:", error);
    } finally {
      setSavingCaption(false);
    }
  };
  const addTagLogic = async (tagName: string) => {
    const trimmed = tagName.trim();
    const normalizedTag = trimmed.toLowerCase().replace(/\s+/g, "-");
    if (!currentUserId || !normalizedTag || addingTag) return;

    if (tags.some((t) => t.name === normalizedTag)) {
      setNewTag("");
      setShowSuggestions(false);
      return;
    }

    setAddingTag(true);
    try {
      const result = await addTag(media.id, trimmed);

      const tag = result.success
        ? (result.tag as Tag | null | undefined)
        : null;
      if (tag) {
        setTags((prev) => [...prev, tag]);
        setNewTag("");
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Error adding tag:", error);
    } finally {
      setAddingTag(false);
    }
  };
  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    await addTagLogic(newTag);
  };
  const handleRemoveTag = async (tagId: string) => {
    if (!currentUserId) return;
    try {
      const result = await removeTag(media.id, tagId);
      if (result.success) {
        setTags((prev) => prev.filter((t) => t.id !== tagId));
      }
    } catch (error) {
      console.error("Error removing tag:", error);
    }
  };
  const handleAddMention = async (user: MentionedUser) => {
    if (!currentUserId || addingMention) return;

    if (
      mentions.some((m) => m.id === user.id) ||
      user.id === media.uploadedBy.id
    ) {
      setNewMention("");
      setShowMentionSuggestions(false);
      return;
    }

    setAddingMention(true);
    try {
      const result = await addMention(media.id, user.id);
      if (result.success) {
        setMentions((prev) => [...prev, user]);
        setNewMention("");
        setShowMentionSuggestions(false);
      }
    } catch (error) {
      console.error("Error adding mention:", error);
    } finally {
      setAddingMention(false);
    }
  };
  const handleRemoveMention = async (userId: string) => {
    if (!currentUserId) return;

    const canRemove =
      userId === currentUserId || currentUserId === media.uploadedBy.id;
    if (!canRemove) return;

    try {
      const result = await removeMention(media.id, userId);
      if (result.success) {
        setMentions((prev) => prev.filter((m) => m.id !== userId));
      }
    } catch (error) {
      console.error("Error removing mention:", error);
    }
  };
  const handleShareClick = async () => {
    setShowShareModal(true);
    if (shareLinks || generatingLink) return;
    setGeneratingLink(true);
    try {
      const result = await createShareLink(media.id, "view");
      if (result.success && result.token) {
        const baseUrl = window.location.origin;
        setShareLinks({
          view: `${baseUrl}/share/${result.token}`,
          raw: `${baseUrl}/share/${result.token}/raw`,
        });
      }
    } catch (error) {
      console.error("Error creating share link:", error);
    } finally {
      setGeneratingLink(false);
    }
  };
  const copyToClipboard = async (text: string, type: "view" | "raw") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(type);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };
  const navigationBusyRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          onClose();
        }
        return;
      }

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (navigationBusyRef.current) return;

      if (e.key === "ArrowLeft" && hasPrevious && onPrevious) {
        navigationBusyRef.current = true;
        onPrevious();
        window.setTimeout(() => {
          navigationBusyRef.current = false;
        }, 125);
      } else if (e.key === "ArrowRight" && hasNext && onNext) {
        navigationBusyRef.current = true;
        onNext();
        window.setTimeout(() => {
          navigationBusyRef.current = false;
        }, 125);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, hasPrevious, onPrevious, hasNext, onNext]);
  const exif = (media.exifData || {}) as unknown as ExifData;
  const hasCamera = exif.Make || exif.make || exif.Model || exif.model;
  const hasLens = exif.LensModel || exif.lensModel;
  const hasCameraSettings =
    exif.FocalLength !== undefined ||
    exif.focalLength !== undefined ||
    exif.FNumber !== undefined ||
    exif.fNumber !== undefined ||
    exif.ExposureTime !== undefined ||
    exif.exposureTime !== undefined ||
    exif.ISO !== undefined ||
    exif.iso !== undefined;
  const hasLocation =
    (media.latitude !== undefined &&
      media.latitude !== null &&
      media.longitude !== undefined &&
      media.longitude !== null) ||
    (exif.latitude !== undefined && exif.longitude !== undefined);
  const hasTakenDate = exif.DateTimeOriginal || exif.dateTimeOriginal;
  const latitude = media.latitude ?? exif.latitude;
  const longitude = media.longitude ?? exif.longitude;
  return (
    <div
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur-sm border border-zinc-700 flex items-center justify-center transition-all"
        aria-label="Close"
      >
        <HiXMark className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
      </button>

      {hasPrevious && onPrevious && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (navigationBusyRef.current) return;
            navigationBusyRef.current = true;
            onPrevious();
            window.setTimeout(() => {
              navigationBusyRef.current = false;
            }, 125);
          }}
          disabled={navigationBusyRef.current}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur-sm border border-zinc-700 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Previous photo"
        >
          <HiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </button>
      )}

      {hasNext && onNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (navigationBusyRef.current) return;
            navigationBusyRef.current = true;
            onNext();
            window.setTimeout(() => {
              navigationBusyRef.current = false;
            }, 125);
          }}
          disabled={navigationBusyRef.current}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur-sm border border-zinc-700 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Next photo"
        >
          <HiChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </button>
      )}

      <ReportModal
        mediaId={media.id}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />

      {showShareModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full space-y-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Share Photo</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-zinc-400 hover:text-white p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            {generatingLink ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <LoadingSpinner size="lg" />
                <p className="text-zinc-400 text-sm">Generating links...</p>
              </div>
            ) : shareLinks ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Viewer Link
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                    <div className="p-2 bg-red-600/10 rounded-lg text-red-600">
                      <HiArrowTopRightOnSquare className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={shareLinks.view}
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={() => copyToClipboard(shareLinks.view, "view")}
                      className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                      title="Copy Viewer Link"
                    >
                      {copiedLink === "view" ? (
                        <HiCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <HiClipboard className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Best for sharing on social media. Shows the photo with
                    details.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Direct Link
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                      <HiArrowDownTray className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={shareLinks.raw}
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={() => copyToClipboard(shareLinks.raw, "raw")}
                      className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                      title="Copy Direct Link"
                    >
                      {copiedLink === "raw" ? (
                        <HiCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <HiClipboard className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Direct link to the image file. Good for embedding or
                    downloading.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-red-400">
                <p>Failed to generate share links.</p>
                <button
                  onClick={handleShareClick}
                  className="mt-2 text-sm underline hover:text-red-300"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="max-w-7xl w-full max-h-full flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden relative min-h-[50vh] sm:min-h-[40vh] lg:min-h-0">
          {!imageLoaded &&
            !imageError &&
            media.mimeType.startsWith("image/") && (
              <div className="absolute inset-0 z-10">
                {thumbnailUrl && (
                  <img
                    src={thumbnailUrl}
                    alt={media.filename}
                    className="absolute inset-0 w-full h-full object-contain blur-md scale-110 opacity-60"
                    aria-hidden="true"
                  />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-4">
                  <LoadingSpinner size="xl" label="Loading image..." center />
                  <div className="text-xs text-zinc-500 font-mono max-w-xs text-center space-y-1">
                    <p>
                      {media.mimeType === "image/heic" ||
                      media.mimeType === "image/heif"
                        ? "Converting HEIC on server..."
                        : "Fetching image..."}
                    </p>
                    <p className="text-[10px] opacity-50 break-all">
                      {effectiveUrl}
                    </p>
                  </div>
                </div>
              </div>
            )}

          {media.mimeType.startsWith("image/") ? (
            imageError ? (
              <div className="flex flex-col items-center justify-center text-zinc-400 p-4 text-center max-w-md z-20">
                <HiFaceFrown className="w-12 h-12 mb-2 text-red-600" />
                <p className="font-medium text-white">
                  This image can't be loaded yet.
                </p>
                <p className="text-sm mt-1">Sadly we can't load this image.</p>

                <div className="mt-4 p-3 bg-zinc-950 rounded-lg text-left w-full overflow-hidden">
                  <p className="text-xs font-mono text-red-400 mb-1">
                    Debug Info:
                  </p>
                  <div className="text-[10px] font-mono text-zinc-500 space-y-1 break-all">
                    <p>ID: {media.id}</p>
                    <p>MIME: {media.mimeType}</p>
                    <p>URL: {effectiveUrl}</p>
                    <p>
                      HEIC:{" "}
                      {media.mimeType === "image/heic" ||
                      media.mimeType === "image/heif"
                        ? "Yes"
                        : "No"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setImageError(false);
                      setImageLoaded(false);
                      setRetryCount((c) => c + 1);
                    }}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                  >
                    Retry
                  </button>
                  <a
                    href={fullSizeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <HiArrowTopRightOnSquare className="w-4 h-4" />
                    Open Original
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                {effectiveUrl && (
                  <img
                    src={effectiveUrl}
                    alt={media.filename}
                    className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
                      imageLoaded ? "opacity-100" : "opacity-0"
                    }`}
                    onLoad={() => {
                      setImageLoaded(true);
                      setImageError(false);
                    }}
                    onError={(e) => {
                      if (retryCount < MAX_IMAGE_AUTO_RETRIES) {
                        onRequestFreshUrl?.();

                        window.setTimeout(
                          () => {
                            setRetryCount((c) => c + 1);
                          },
                          400 * (retryCount + 1),
                        );
                        return;
                      }

                      setImageError(true);
                    }}
                  />
                )}
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center relative">
              {videoError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-zinc-400 p-6 text-center max-w-md">
                  <HiFaceFrown className="w-12 h-12 mb-2 text-red-600" />
                  <p className="font-medium text-white">
                    This video can't be played.
                  </p>
                  <p className="text-sm mt-1">
                    Try again or open it in a new tab.
                  </p>
                  <div className="flex gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setVideoError(false);
                        setVideoRetryCount((c) => c + 1);
                      }}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                    >
                      Retry
                    </button>
                    <a
                      href={fullSizeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <HiArrowTopRightOnSquare className="w-4 h-4" />
                      Open
                    </a>
                  </div>
                </div>
              )}
              <video
                key={`${media.id}:${videoRetryCount}`}
                src={fullSizeUrl}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline
                loop
                muted
                preload="auto"
                onError={() => setVideoError(true)}
                onCanPlay={() => setVideoError(false)}
              />
            </div>
          )}
        </div>

        <div className="w-full lg:w-96 bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 flex flex-col max-h-[45vh] sm:max-h-[50vh] lg:max-h-[90vh]">
          <div className="p-3 sm:p-4 lg:p-6 border-b border-zinc-800 space-y-2 sm:space-y-3 lg:space-y-4">
            <div className="space-y-1">
              {isEditingCaption ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    ref={inputRef}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-400 focus:outline-none  focus:border-red-600 transition-all"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveCaption();
                      if (e.key === "Escape") {
                        setIsEditingCaption(false);
                        setCaption(media.caption || "");
                      }
                    }}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleSaveCaption}
                      disabled={savingCaption}
                      className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white disabled:opacity-50 transition-colors"
                      title="Save"
                    >
                      {savingCaption ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <HiCheck className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingCaption(false);
                        setCaption(media.caption || "");
                      }}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                      title="Cancel"
                    >
                      <HiXMark className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {caption ? (
                      <h3 className="text-sm sm:text-base lg:text-lg font-bold text-white line-clamp-2">
                        {caption}
                      </h3>
                    ) : (
                      <h3
                        className="text-sm sm:text-base lg:text-lg font-bold text-zinc-500 italic truncate"
                        title={media.filename}
                      >
                        {media.filename}
                      </h3>
                    )}
                    {caption && (
                      <p className="text-xs text-zinc-500 truncate">
                        {media.filename}
                      </p>
                    )}
                  </div>
                  {currentUserId === media.uploadedBy.id && (
                    <button
                      onClick={() => setIsEditingCaption(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white shrink-0"
                      title="Edit caption"
                    >
                      <HiPencil className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-zinc-300">
              <a
                href={`/users/${media.uploadedBy.handle || media.uploadedBy.id}`}
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <UserAvatar
                  user={media.uploadedBy}
                  size="xs"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />
                <span className="truncate">{media.uploadedBy.name}</span>
              </a>
              <span className="text-zinc-600">•</span>
              <div className="flex items-center gap-2">
                <HiOutlineCalendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
                <span className="whitespace-nowrap">
                  {new Date(
                    hasTakenDate || media.uploadedAt,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {media.apiKey && (
                <>
                  <span className="text-zinc-600">•</span>
                  <div
                    className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/50 rounded-full border border-zinc-700/50 text-zinc-400"
                    title={`Uploaded via API Key: ${media.apiKey.name || "Unnamed Key"}`}
                  >
                    <HiCommandLine className="w-3 h-3" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                      API
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-3 lg:pt-4 border-t border-zinc-800 overflow-x-auto pb-1 scrollbar-hide">
              <button
                type="button"
                onClick={handleLike}
                disabled={likePending}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm rounded-full sm:rounded-lg border transition-all shrink-0 ${
                  hasLiked
                    ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
                    : "bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
                }`}
                title={
                  !currentUserId
                    ? "Sign in to like"
                    : hasLiked
                      ? "Unlike"
                      : "Like"
                }
              >
                <HiHeart
                  className={`w-5 h-5 ${hasLiked ? "fill-current" : ""}`}
                />
                <span className="font-medium">{likeCount}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!currentUserId) {
                    window.location.href = "/auth/signin";
                    return;
                  }
                  handleShareClick();
                }}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full sm:rounded-lg transition-all shrink-0 ${!currentUserId ? "opacity-50" : ""}`}
                title={!currentUserId ? "Sign in to share" : "Share"}
              >
                <HiShare className="w-5 h-5 text-white" />
              </button>

              <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                className="flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full sm:rounded-lg transition-all disabled:opacity-50 shrink-0"
                title="Download"
              >
                <HiArrowDownTray className="w-5 h-5 text-white" />
              </button>

              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm bg-red-600 hover:bg-red-700 border border-red-600 rounded-full sm:rounded-lg transition-all ml-auto shrink-0"
                  title="Delete"
                >
                  <HiTrash className="w-5 h-5 text-white" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!currentUserId) {
                    window.location.href = "/auth/signin";
                    return;
                  }
                  setShowReportModal(true);
                }}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full sm:rounded-lg transition-all shrink-0 ${!onDelete ? "ml-auto" : ""} ${!currentUserId ? "opacity-50" : ""}`}
                title={!currentUserId ? "Sign in to report" : "Report"}
              >
                <HiExclamationTriangle className="w-5 h-5 text-zinc-400 hover:text-red-400" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={`flex-1 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === "info"
                  ? "text-white bg-zinc-800 border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiInformationCircle className="w-5 h-5" />
              <span className="hidden xs:inline">Info</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("comments")}
              className={`flex-1 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === "comments"
                  ? "text-white bg-zinc-800 border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiOutlineChatBubbleLeft className="w-5 h-5" />
              <span className="hidden xs:inline">Comments</span>
              {comments.length > 0 && (
                <span className="xs:hidden">({comments.length})</span>
              )}
              {comments.length > 0 && (
                <span className="hidden xs:inline">({comments.length})</span>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "info" ? (
              <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <HiTag className="w-5 h-5" />
                    <span>Tags</span>
                  </div>
                  <div className="flex overflow-x-auto gap-2 pb-2 -mx-2 px-2 scrollbar-hide">
                    {tags.map((tag) => {
                      const colorClass =
                        TAG_COLORS[tag.color || "blue"] || TAG_COLORS.blue;
                      return (
                        <span
                          key={tag.id}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs whitespace-nowrap shrink-0 transition-colors ${colorClass}`}
                        >
                          <a
                            href={`/search?tag=${tag.id}`}
                            className="hover:underline"
                          >
                            #{tag.name}
                          </a>
                          {currentUserId && (
                            <button
                              onClick={() => handleRemoveTag(tag.id)}
                              className="hover:text-red-400 transition-colors ml-1"
                            >
                              <HiXMark className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {currentUserId && (
                      <div className="relative inline-flex items-center shrink-0">
                        <form onSubmit={handleAddTag}>
                          <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onFocus={() => {
                              if (suggestions.length > 0)
                                setShowSuggestions(true);
                            }}
                            placeholder="+ Add tag"
                            className="w-24 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/20 transition-all"
                          />
                        </form>
                        {showSuggestions && suggestions.length > 0 && (
                          <div
                            ref={suggestionsRef}
                            className="absolute top-full left-0 mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                          >
                            {suggestions.map((suggestion) => {
                              const colorClass =
                                TAG_COLORS[suggestion.color || "blue"] ||
                                TAG_COLORS.blue;
                              const textColorClass =
                                colorClass.match(/text-\w+-\d+/)?.[0] ||
                                "text-zinc-300";
                              return (
                                <button
                                  key={suggestion.id}
                                  type="button"
                                  onClick={() => addTagLogic(suggestion.name)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors flex items-center justify-between group"
                                >
                                  <span
                                    className={`font-medium ${textColorClass}`}
                                  >
                                    #{suggestion.name}
                                  </span>
                                  <span className="text-zinc-500 group-hover:text-zinc-400">
                                    Add
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <HiUserGroup className="w-5 h-5" />
                    <span>People</span>
                  </div>
                  <div className="flex overflow-x-auto gap-3 pb-2 -mx-2 px-2 scrollbar-hide">
                    {displayedMentions.map((user) => (
                      <div
                        key={user.id}
                        className="relative inline-block shrink-0"
                        onMouseEnter={(e) => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredMention({ user, rect });
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => {
                            setHoveredMention(null);
                          }, 200);
                        }}
                        onClick={(e) => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredMention({ user, rect });
                        }}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-2 hover:bg-zinc-800 rounded-full pr-3 transition-colors group"
                        >
                          <UserAvatar
                            user={user}
                            size="xs"
                            className="w-6 h-6"
                          />
                          <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                            {user.name}
                          </span>
                        </button>
                      </div>
                    ))}

                    {currentUserId && (
                      <div className="relative inline-flex items-center shrink-0">
                        <HiUser className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        <input
                          ref={mentionInputRef}
                          type="text"
                          value={newMention}
                          onChange={(e) => setNewMention(e.target.value)}
                          onFocus={() => {
                            if (mentionSuggestions.length > 0)
                              setShowMentionSuggestions(true);
                          }}
                          placeholder="Tag person..."
                          className="w-32 pl-8 pr-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/20 transition-all"
                        />
                        {showMentionSuggestions &&
                          mentionSuggestions.length > 0 && (
                            <div
                              ref={mentionSuggestionsRef}
                              className="absolute top-full left-0 mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                            >
                              {mentionSuggestions.map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => handleAddMention(user)}
                                  className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex items-center gap-2 group"
                                >
                                  <UserAvatar
                                    user={user}
                                    size="xs"
                                    className="w-6 h-6"
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-medium text-zinc-200 truncate">
                                      {user.name}
                                    </span>
                                    {user.handle && (
                                      <span className="text-[10px] text-zinc-500 truncate">
                                        @{user.handle}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>

                {event?.name && event?.slug && (
                  <div className="flex items-start gap-3">
                    <HiOutlineCalendar className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400 mb-1">Event</p>
                      <a
                        href={`/events/${event.slug}`}
                        className="font-medium text-red-400 hover:text-red-300 transition-colors"
                      >
                        {event.name}
                      </a>
                    </div>
                  </div>
                )}

                {media.width && media.height && (
                  <div className="flex items-start gap-3">
                    <HiOutlineCamera className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400 mb-1">Dimensions</p>
                      <p className="font-medium text-white">
                        {media.width} × {media.height}
                      </p>
                    </div>
                  </div>
                )}

                {hasCamera && (
                  <div className="flex items-start gap-3">
                    <HiOutlineCamera className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400 mb-1">Camera</p>
                      <p className="font-medium text-white">
                        {exif.Make || exif.make} {exif.Model || exif.model}
                      </p>
                      {hasLens && (
                        <p className="text-sm text-zinc-400 mt-1">
                          {exif.LensModel || exif.lensModel}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {hasCameraSettings && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-400 mb-2">
                      Camera Settings
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(exif.FocalLength !== undefined ||
                        exif.focalLength !== undefined) && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                          <HiOutlineCamera className="w-5 h-5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-500">Focal</p>
                            <p className="text-sm font-medium text-white">
                              {formatFocalLength(
                                exif.FocalLength ?? exif.focalLength,
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                      {(exif.FNumber !== undefined ||
                        exif.fNumber !== undefined) && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                          <HiOutlineCamera className="w-5 h-5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-500">Aperture</p>
                            <p className="text-sm font-medium text-white">
                              {formatAperture(exif.FNumber ?? exif.fNumber)}
                            </p>
                          </div>
                        </div>
                      )}
                      {(exif.ExposureTime !== undefined ||
                        exif.exposureTime !== undefined) && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                          <HiOutlineBolt className="w-5 h-5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-500">Shutter</p>
                            <p className="text-sm font-medium text-white">
                              {formatExposureTime(
                                exif.ExposureTime ?? exif.exposureTime,
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                      {(exif.ISO !== undefined || exif.iso !== undefined) && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                          <HiOutlineSun className="w-5 h-5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-500">ISO</p>
                            <p className="text-sm font-medium text-white">
                              {formatISO(exif.ISO ?? exif.iso)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {hasLocation && latitude && longitude && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <HiOutlineMapPin className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Location</p>
                        <p className="text-sm font-mono text-white mb-2">
                          {latitude.toFixed(6)}, {longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-zinc-800">
                      <MiniMap
                        lat={latitude}
                        lng={longitude}
                        zoom={14}
                        className="h-40 w-full"
                      />
                      <a
                        href={`/map?lat=${latitude}&lng=${longitude}&zoom=15`}
                        className="block w-full py-2 text-center text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      >
                        View on Full Map
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
                  {loadingComments ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner size="lg" />
                    </div>
                  ) : comments.length > 0 ? (
                    <div className="space-y-4">
                      {comments.map((comment) => (
                        <div key={comment.id} className="space-y-3">
                          <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <a
                                  href={`/users/${comment.user.handle || comment.user.id}`}
                                  className="font-medium text-white text-sm hover:underline"
                                >
                                  {comment.user.name}
                                </a>
                                <p className="text-xs text-zinc-400">
                                  {new Date(
                                    comment.createdAt,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                              {currentUserId === comment.user.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComment(comment.id)
                                  }
                                  className="text-zinc-400 hover:text-red-400 transition-colors"
                                  aria-label="Delete comment"
                                >
                                  <HiTrash className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                            <p className="text-zinc-300 text-sm whitespace-pre-wrap mb-3">
                              {comment.content}
                            </p>

                            <div className="flex items-center gap-3 pt-2 border-t border-zinc-700">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCommentLike(
                                    comment.id,
                                    comment.hasLiked,
                                  )
                                }
                                disabled={
                                  !currentUserId ||
                                  commentLikePending.has(comment.id)
                                }
                                className={`flex items-center gap-1.5 text-xs transition-colors ${
                                  comment.hasLiked
                                    ? "text-red-400 hover:text-red-300"
                                    : "text-zinc-400 hover:text-zinc-300"
                                } ${!currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                <HiHeart
                                  className={`w-3.5 h-3.5 ${comment.hasLiked ? "fill-current" : ""}`}
                                />
                                <span>{comment.likeCount}</span>
                              </button>
                              {currentUserId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyingTo(
                                      replyingTo === comment.id
                                        ? null
                                        : comment.id,
                                    )
                                  }
                                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                                >
                                  <HiArrowUturnRight className="w-3.5 h-3.5" />
                                  <span>Reply</span>
                                </button>
                              )}
                            </div>

                            {replyingTo === comment.id && (
                              <form
                                onSubmit={(e) =>
                                  handleReplySubmit(e, comment.id)
                                }
                                className="mt-3 flex gap-2"
                              >
                                <input
                                  type="text"
                                  value={replyContent}
                                  onChange={(e) =>
                                    setReplyContent(e.target.value)
                                  }
                                  placeholder="Write a reply..."
                                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-400 focus:outline-none  focus:border-red-600"
                                  maxLength={1000}
                                />
                                <button
                                  type="submit"
                                  disabled={
                                    !replyContent.trim() || submittingReply
                                  }
                                  className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center gap-2 text-sm"
                                >
                                  {submittingReply ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : (
                                    <HiPaperAirplane className="w-5 h-5" />
                                  )}
                                </button>
                              </form>
                            )}
                          </div>

                          {comment.replies.length > 0 && (
                            <div className="ml-6 space-y-3">
                              {comment.replies.map((reply) => (
                                <div
                                  key={reply.id}
                                  className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <a
                                        href={`/users/${reply.user.handle || reply.user.id}`}
                                        className="font-medium text-white text-sm hover:underline"
                                      >
                                        {reply.user.name}
                                      </a>
                                      <p className="text-xs text-zinc-400">
                                        {new Date(
                                          reply.createdAt,
                                        ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                    {currentUserId === reply.user.id && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteComment(reply.id)
                                        }
                                        className="text-zinc-400 hover:text-red-400 transition-colors"
                                        aria-label="Delete reply"
                                      >
                                        <HiTrash className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-zinc-300 text-sm whitespace-pre-wrap mb-2">
                                    {reply.content}
                                  </p>

                                  <div className="flex items-center gap-3 pt-2 border-t border-zinc-700/50">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCommentLike(
                                          reply.id,
                                          reply.hasLiked,
                                        )
                                      }
                                      disabled={
                                        !currentUserId ||
                                        commentLikePending.has(reply.id)
                                      }
                                      className={`flex items-center gap-1.5 text-xs transition-colors ${
                                        reply.hasLiked
                                          ? "text-red-400 hover:text-red-300"
                                          : "text-zinc-400 hover:text-zinc-300"
                                      } ${!currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
                                    >
                                      <HiHeart
                                        className={`w-3.5 h-3.5 ${reply.hasLiked ? "fill-current" : ""}`}
                                      />
                                      <span>{reply.likeCount}</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <HiOutlineChatBubbleLeft className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                      <p className="text-zinc-400 text-sm">No comments yet</p>
                      <p className="text-zinc-500 text-xs mt-1">
                        Be the first to comment!
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-zinc-800 p-2 sm:p-3 lg:p-4">
                  {currentUserId ? (
                    <form
                      onSubmit={handleCommentSubmit}
                      className="flex gap-1.5 sm:gap-2"
                    >
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-400 focus:outline-none  focus:border-red-600 transition-all"
                        maxLength={1000}
                      />
                      <button
                        type="submit"
                        disabled={!newComment.trim() || submittingComment}
                        className="w-9 h-9 sm:w-auto sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
                        title="Send comment"
                      >
                        {submittingComment ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <HiPaperAirplane className="w-5 h-5" />
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="text-center py-2">
                      <a
                        href="/auth/signin"
                        className="text-sm text-red-400 hover:text-red-300 hover:underline"
                      >
                        Sign in to comment
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hoveredMention && (
        <div
          className="fixed z-100 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-4 flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: hoveredMention.rect.left + hoveredMention.rect.width / 2,
            top: hoveredMention.rect.top,
            transform: "translate(-50%, -100%) translateY(-12px)",
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredMention(null);
            }, 200);
          }}
        >
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900 border-b border-r border-zinc-700 rotate-45"></div>

          <a
            href={`/users/${hoveredMention.user.handle || hoveredMention.user.id}`}
            className="flex flex-col items-center gap-2 group/card w-full"
          >
            <UserAvatar
              user={hoveredMention.user}
              size="xl"
              className="w-16 h-16 shadow-lg"
            />
            <div className="text-center w-full min-w-0">
              <p className="text-sm font-bold text-white truncate group-hover/card:underline">
                {hoveredMention.user.name}
              </p>
              {hoveredMention.user.handle && (
                <p className="text-xs text-zinc-400 truncate">
                  @{hoveredMention.user.handle}
                </p>
              )}
            </div>
          </a>

          {currentUserId &&
            mentions.some((m) => m.id === hoveredMention.user.id) &&
            (hoveredMention.user.id === currentUserId ||
              currentUserId === media.uploadedBy.id) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveMention(hoveredMention.user.id);
                  setHoveredMention(null);
                }}
                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-red-900/30 text-xs font-medium text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-800 rounded-lg transition-colors"
              >
                <HiXMark className="w-3.5 h-3.5" />
                <span>Remove Tag</span>
              </button>
            )}
        </div>
      )}
    </div>
  );
}
