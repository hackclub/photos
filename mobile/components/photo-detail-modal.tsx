import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  Share,
  Alert,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { webBaseUrl } from "@/lib/config";
import { ScalePressable } from "@/components/scale-pressable";
import { SFIcon } from "@/components/sf-icon";
import {
  addMobileMention,
  addMobileTag,
  getComments,
  deleteMobileMedia,
  deleteMobileComment,
  getMobileMentions,
  getMobileTags,
  postComment,
  postReply,
  reportMedia,
  removeMobileMention,
  removeMobileTag,
  searchMobileUsers,
  shareMedia,
  toggleMobileCommentLike,
  toggleLike,
  type MobileMedia,
  updateMobileCaption,
} from "@/lib/trpc";

type Person = { id: string; name: string; handle?: string | null; slackId?: string | null };
type Tag = { id: string; name: string; color?: string | null };

const primaryButton = { borderRadius: 999, backgroundColor: "#e11d48", paddingHorizontal: 16, paddingVertical: 11 };
const darkButton = { borderRadius: 999, backgroundColor: "#3f3f46", paddingHorizontal: 16, paddingVertical: 11 };
const dangerButton = { borderRadius: 999, backgroundColor: "#7f1d1d", paddingHorizontal: 16, paddingVertical: 11 };
const iconOnlyButton = { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, alignItems: "center" as const, justifyContent: "center" as const };
const iconButtonContent = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 7 };
const buttonText = { color: "white", fontWeight: "900" as const };
const inputStyle = { color: "#ffffff", borderWidth: 1, borderColor: "#3f3f46", borderRadius: 16, borderCurve: "continuous" as const, padding: 12 };
const pill = { borderRadius: 999, backgroundColor: "rgba(225,29,72,0.14)", borderWidth: 1, borderColor: "rgba(225,29,72,0.28)", paddingHorizontal: 10, paddingVertical: 6 };
const pillText = { color: "#fb7185", fontWeight: "900" as const, fontSize: 12 };
const sheetSection = { borderRadius: 22, borderCurve: "continuous" as const, padding: 14, borderWidth: 1 };

function formatExifValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function InitialsAvatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: "#3f3f46", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "white", fontWeight: "900", fontSize: size * 0.34 }}>{initials || "?"}</Text></View>;
}

function absoluteUrl(url: string, token: string | null) {
  const absolute = url.startsWith("http") ? url : `${webBaseUrl}${url}`;
  if (!token) return absolute;
  const separator = absolute.includes("?") ? "&" : "?";
  return `${absolute}${separator}mobileToken=${encodeURIComponent(token)}`;
}

function updateCommentTree(items: any[], commentId: string, update: (item: any) => any): any[] {
  return items.map((item) => {
    if (item.id === commentId) return update(item);
    if (!item.replies?.length) return item;
    return { ...item, replies: updateCommentTree(item.replies, commentId, update) };
  });
}

export function PhotoDetailModal({
  media,
  initialIndex,
  onClose,
  onChanged,
}: {
  media: MobileMedia[];
  initialIndex: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token, user } = useAuth();
  const isDark = useColorScheme() === "dark";
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex ?? 0);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [captionSaving, setCaptionSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "comments">("info");
  const [editingCaption, setEditingCaption] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mentions, setMentions] = useState<Person[]>([]);
  const [mentionInput, setMentionInput] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<Person[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(initialIndex !== null);
  const [isPaging, setIsPaging] = useState(false);

  const current = media[index] ?? null;
  const displayedCurrent = current ? { ...current, caption } : null;
  const previous = index > 0 ? media[index - 1] : null;
  const next = index < media.length - 1 ? media[index + 1] : null;
  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : undefined, [token]);
  const dismissY = useRef(new Animated.Value(0)).current;
  const photoX = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;
  const sheetState = useRef(0);
  const modalScale = dismissY.interpolate({ inputRange: [0, 220], outputRange: [1, 0.95], extrapolate: "clamp" });
  const modalOpacity = dismissY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.35], extrapolate: "clamp" });
  const photoScale = sheet.interpolate({ inputRange: [0, 1], outputRange: [1, 0.58] });
  const photoTranslateY = sheet.interpolate({ inputRange: [0, 1], outputRange: [0, -118] });
  const sheetHeight = sheet.interpolate({ inputRange: [0, 1], outputRange: [250, Math.min(height * 0.76, 660)] });
  const backdropColor = useMemo(() => (isDark ? "black" : "#050505"), [isDark]);

  const closeModal = () => {
    setVisible(false);
    onClose();
  };

  useEffect(() => {
    if (!current) return;
    setLikeCount(current.likeCount);
    setMessage(null);
    setComment("");
    setCaption(current.caption ?? "");
    setCaptionSaving(false);
    setActiveTab("info");
    setEditingCaption(false);
    setTagInput("");
    setMentionInput("");
    setMentionSuggestions([]);
    setReplyingTo(null);
    setReplyText("");
    sheetState.current = 0;
    sheet.setValue(0);
    dismissY.setValue(0);
    void Promise.all([getComments(current.id), getMobileTags(current.id), getMobileMentions(current.id)]).then(([commentResult, tagResult, mentionResult]) => {
      setComments(commentResult.comments ?? []);
      setTags(tagResult.tags ?? []);
      setMentions(mentionResult.mentions ?? []);
    });
  }, [current, dismissY, sheet]);

  const refreshComments = (mediaId: string) => void getComments(mediaId).then((next) => setComments(next.comments ?? []));

  const saveCaption = () => {
    if (!current || captionSaving) return;
    setCaptionSaving(true);
    setMessage("Applying caption...");
    void updateMobileCaption(current.id, caption).then((r) => {
      setMessage(r.success ? "Caption applied" : r.error ?? "Save failed");
      if (r.success) setEditingCaption(false);
    }).finally(() => setCaptionSaving(false));
  };

  const toggleCurrentLike = () => {
    if (!current) return;
    const previousCount = likeCount;
    setLikeCount((value) => value + 1);
    void toggleLike(current.id).then((r) => {
      if (r.likeCount !== undefined) setLikeCount(r.likeCount);
    }).catch(() => setLikeCount(previousCount));
  };

  const toggleCommentLikeLocal = (commentId: string) => {
    setComments((items) => updateCommentTree(items, commentId, (item) => ({ ...item, hasLiked: !item.hasLiked, likeCount: Math.max(0, (item.likeCount ?? 0) + (item.hasLiked ? -1 : 1)) })));
    void toggleMobileCommentLike(commentId).then((r) => {
      if (!r.success) {
        if (current) refreshComments(current.id);
        return;
      }
      setComments((items) => updateCommentTree(items, commentId, (item) => ({ ...item, hasLiked: r.hasLiked ?? item.hasLiked, likeCount: r.likeCount ?? item.likeCount })));
    });
  };

  useEffect(() => {
    if (mentionInput.trim().length < 2) {
      setMentionSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchMobileUsers(mentionInput).then((result) => {
        const existing = new Set([current?.uploadedBy.id, ...mentions.map((item) => item.id)].filter(Boolean));
        setMentionSuggestions((result.users ?? []).filter((item) => !existing.has(item.id)).slice(0, 5));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [current?.uploadedBy.id, mentionInput, mentions]);

  useEffect(() => {
    if (initialIndex === null) return;
    setIndex(initialIndex);
    setVisible(true);
  }, [initialIndex]);

  useEffect(() => {
    if (!current) return;
    const targets = [media[index - 2], media[index - 1], current, media[index + 1], media[index + 2]].filter((item) => item?.mimeType.startsWith("image/")) as MobileMedia[];
    for (const item of targets) {
      void Image.prefetch(absoluteUrl(item.url, token), { headers, cachePolicy: "memory-disk" });
    }
  }, [current, headers, index, media, token]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            if ((gesture.dx > 0 && !previous) || (gesture.dx < 0 && !next)) {
              photoX.setValue(gesture.dx * 0.22);
              return;
            }
            photoX.setValue(gesture.dx);
            return;
          }
          if (gesture.dy < 0) {
            const progress = Math.min(1, Math.abs(gesture.dy) / 180);
            sheet.setValue(Math.max(sheetState.current, progress));
            return;
          }
          if (sheetState.current === 1) {
            sheet.setValue(Math.max(0, 1 - gesture.dy / 180));
            return;
          }
          dismissY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            const direction = gesture.dx < 0 ? 1 : -1;
            const nextIndex = Math.max(0, Math.min(media.length - 1, index + direction));
            const shouldPage = nextIndex !== index && (Math.abs(gesture.dx) > width * 0.22 || Math.abs(gesture.vx) > 0.55);
            if (shouldPage && !isPaging) {
              setIsPaging(true);
              Animated.timing(photoX, {
                toValue: direction > 0 ? -width : width,
                duration: 210,
                useNativeDriver: true,
              }).start(() => {
                setIndex(nextIndex);
                photoX.setValue(0);
                setIsPaging(false);
              });
            } else {
              Animated.spring(photoX, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }).start();
            }
            return;
          }
          Animated.spring(photoX, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }).start();
          if (gesture.dy < -36) {
            sheetState.current = 1;
            Animated.spring(sheet, { toValue: 1, useNativeDriver: false }).start();
            return;
          }
          if (sheetState.current === 1) {
            const next = gesture.dy > 48 || gesture.vy > 0.7 ? 0 : 1;
            sheetState.current = next;
            Animated.spring(sheet, { toValue: next, useNativeDriver: false }).start();
            return;
          }
          if (gesture.dy > 120 || gesture.vy > 1.15) {
            Animated.timing(dismissY, { toValue: height, duration: 180, useNativeDriver: false }).start(() => {
              dismissY.setValue(0);
              closeModal();
            });
            return;
          }
          Animated.spring(dismissY, { toValue: 0, friction: 7, useNativeDriver: false }).start();
        },
      }),
    [dismissY, height, index, isPaging, media.length, next, photoX, previous, sheet, width],
  );

  if (!visible || !current) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={{ flex: 1, backgroundColor: backdropColor }}>
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            flex: 1,
            opacity: modalOpacity,
            transform: [{ translateY: dismissY }, { scale: modalScale }],
          }}
        >
          <Animated.View
            style={{
              width,
              height,
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: 150,
              transform: [{ translateY: photoTranslateY }, { scale: photoScale }],
            }}
          >
            <Animated.View style={{ position: "absolute", left: -width, top: 0, width: width * 3, height, flexDirection: "row", transform: [{ translateX: photoX }] }}>
              <PhotoSlot item={previous} token={token} headers={headers} width={width} height={height} loadedIds={loadedIds} onLoaded={setLoadedIds} />
              <PhotoSlot item={current} token={token} headers={headers} width={width} height={height} loadedIds={loadedIds} onLoaded={setLoadedIds} priority="high" />
              <PhotoSlot item={next} token={token} headers={headers} width={width} height={height} loadedIds={loadedIds} onLoaded={setLoadedIds} />
            </Animated.View>
            {!loadedIds.has(current.id) ? <ActivityIndicator style={{ position: "absolute" }} color="white" /> : null}
          </Animated.View>

          <View style={{ position: "absolute", top: 54, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ borderRadius: 999, backgroundColor: "rgba(0,0,0,0.42)", paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: "white", fontWeight: "800" }}>{index + 1} / {media.length}</Text>
            </View>
            <ScalePressable onPress={closeModal} style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
              <SFIcon name="xmark" size={22} />
            </ScalePressable>
          </View>

          <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: sheetHeight, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: isDark ? "rgba(24,24,27,0.99)" : "rgba(255,255,255,0.99)", paddingHorizontal: 16, paddingTop: 10, gap: 12, boxShadow: "0 -14px 38px rgba(0,0,0,0.34)" }}>
            <Pressable onPress={() => { sheetState.current = 1; Animated.spring(sheet, { toValue: 1, useNativeDriver: false }).start(); }} style={{ alignItems: "center", paddingTop: 6, paddingBottom: 4 }}>
              <View style={{ width: 48, height: 5, borderRadius: 999, backgroundColor: isDark ? "#71717a" : "#d4d4d8" }} />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 6 }}>
                {editingCaption ? <TextInput value={caption} onChangeText={setCaption} placeholder="Add a caption" placeholderTextColor="#71717a" style={inputStyle} editable={!captionSaving} /> : <Text selectable numberOfLines={2} style={{ color: isDark ? "white" : "#111827", fontSize: 18, fontWeight: "900" }}>{caption || current.filename}</Text>}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <InitialsAvatar name={current.uploadedBy.name} size={24} />
                  <Text selectable style={{ color: isDark ? "#a1a1aa" : "#71717a", fontWeight: "800" }}>{current.uploadedBy.name}</Text>
                  <Text style={{ color: isDark ? "#52525b" : "#d1d5db" }}>•</Text>
                  <Text style={{ color: isDark ? "#a1a1aa" : "#71717a", fontWeight: "800" }}>{current.mimeType.startsWith("video/") ? "Video" : "Photo"}</Text>
                </View>
              </View>
              <ScalePressable disabled={captionSaving} onPress={() => editingCaption ? saveCaption() : setEditingCaption(true)} style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: "rgba(225,29,72,0.14)", alignItems: "center", justifyContent: "center" }}>{captionSaving ? <ActivityIndicator color="#fb7185" /> : <SFIcon name={editingCaption ? "checkmark" : "pencil"} size={18} tint="#fb7185" />}</ScalePressable>
            </View>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ScalePressable onPress={toggleCurrentLike} style={[primaryButton, { minWidth: 76 }]}><View style={iconButtonContent}><SFIcon name="heart.fill" size={16} /><Text style={buttonText}>{likeCount}</Text></View></ScalePressable>
              <ScalePressable onPress={() => void shareMedia(current.id).then(async (r) => { if (r.token) { const url = `${webBaseUrl}/share/${r.token}`; setMessage(url); await Share.share({ url, message: url }); } })} style={[darkButton, iconOnlyButton]}><SFIcon name="square.and.arrow.up" size={18} /></ScalePressable>
              {message ? <Text selectable numberOfLines={1} style={{ flex: 1, color: isDark ? "#a1a1aa" : "#71717a", fontWeight: "800" }}>{message}</Text> : <Text style={{ flex: 1, color: isDark ? "#71717a" : "#9ca3af", fontSize: 12, fontWeight: "800", textAlign: "right" }}>Swipe photo • pull sheet</Text>}
            </View>
            <View style={{ flexDirection: "row", borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: isDark ? "#09090b" : "#f3f4f6", padding: 4, borderWidth: 1, borderColor: isDark ? "#27272a" : "#e5e7eb" }}>
              <Pressable onPress={() => setActiveTab("info")} style={{ flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: "center", backgroundColor: activeTab === "info" ? "#e11d48" : "transparent" }}><View style={iconButtonContent}><SFIcon name="info.circle" size={16} tint={activeTab === "info" ? "white" : "#a1a1aa"} /><Text style={{ color: activeTab === "info" ? "white" : isDark ? "#d4d4d8" : "#111827", fontWeight: "900" }}>Info</Text></View></Pressable>
              <Pressable onPress={() => setActiveTab("comments")} style={{ flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: "center", backgroundColor: activeTab === "comments" ? "#e11d48" : "transparent" }}><View style={iconButtonContent}><SFIcon name="bubble.left.and.bubble.right.fill" size={16} tint={activeTab === "comments" ? "white" : "#a1a1aa"} /><Text style={{ color: activeTab === "comments" ? "white" : isDark ? "#d4d4d8" : "#111827", fontWeight: "900" }}>{comments.length}</Text></View></Pressable>
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              data={activeTab === "comments" ? comments : []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 28 }}
              ListHeaderComponent={activeTab === "info" ? <View style={{ gap: 14 }}><InfoPanel current={displayedCurrent ?? current} tags={tags} mentions={mentions} isDark={isDark} onRemoveTag={(tagId) => void removeMobileTag(current.id, tagId).then((r) => { if (r.success) setTags((prev) => prev.filter((tag) => tag.id !== tagId)); })} onRemoveMention={(userId) => void removeMobileMention(current.id, userId).then((r) => { if (r.success) setMentions((prev) => prev.filter((item) => item.id !== userId)); })} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput value={tagInput} onChangeText={setTagInput} placeholder="Add tag" placeholderTextColor="#71717a" style={[inputStyle, { flex: 1 }]} />
                  <ScalePressable onPress={() => void addMobileTag(current.id, tagInput).then((r) => { if (r.tag) setTags((prev) => [...prev, r.tag!]); setTagInput(""); })} style={[darkButton, { width: 48, alignItems: "center" }]}><SFIcon name="plus" size={20} /></ScalePressable>
                </View>
                <TextInput value={mentionInput} onChangeText={setMentionInput} placeholder="Mention person" placeholderTextColor="#71717a" style={inputStyle} />
                {mentionSuggestions.map((person) => <ScalePressable key={person.id} onPress={() => void addMobileMention(current.id, person.id).then((r) => { if (r.success) setMentions((prev) => [...prev, person]); setMentionInput(""); setMentionSuggestions([]); })} style={darkButton}><View style={iconButtonContent}><SFIcon name="person.badge.plus" size={17} /><Text style={buttonText}>{person.name}</Text></View></ScalePressable>)}
              </View> : <CommentComposer value={comment} setValue={setComment} onSubmit={() => void postComment(current.id, comment).then((r) => { if (r.success) { setComment(""); refreshComments(current.id); } else setMessage(r.error ?? "Failed"); })} />}
              ListFooterComponent={
                activeTab === "comments" ? <View style={{ gap: 10, paddingTop: 10 }}>
                  <TextInput value={reportReason} onChangeText={setReportReason} placeholder="Report reason" placeholderTextColor="#71717a" style={inputStyle} />
                  <ScalePressable onPress={() => void reportMedia(current.id, reportReason).then((r) => { setMessage(r.success ? "Report submitted" : r.error ?? "Report failed"); if (r.success) setReportReason(""); })} style={darkButton}><View style={iconButtonContent}><SFIcon name="exclamationmark.triangle.fill" size={16} /><Text style={buttonText}>Report</Text></View></ScalePressable>
                  {current.canDelete ? <ScalePressable onPress={() => Alert.alert("Delete photo?", "This removes it from the event.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void deleteMobileMedia(current.id).then((r) => { if (r.success) { closeModal(); onChanged(); } else setMessage(r.error ?? "Delete failed"); }) }])} style={dangerButton}><View style={iconButtonContent}><SFIcon name="trash.fill" size={16} /><Text style={buttonText}>Delete</Text></View></ScalePressable> : null}
                  {message ? <Text selectable style={{ color: "#a1a1aa" }}>{message}</Text> : null}
                </View> : null
              }
              renderItem={({ item }) => <CommentItem item={item} currentUserId={user?.id} isDark={isDark} replyingTo={replyingTo} setReplyingTo={setReplyingTo} replyText={replyText} setReplyText={setReplyText} onRefresh={() => refreshComments(current.id)} onToggleLike={toggleCommentLikeLocal} mediaId={current.id} />}
            />
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function InfoPanel({ current, tags, mentions, isDark, onRemoveTag, onRemoveMention }: { current: MobileMedia; tags: Tag[]; mentions: Person[]; isDark: boolean; onRemoveTag: (tagId: string) => void; onRemoveMention: (userId: string) => void }) {
  const exif = current.exifData ?? {};
  const rows = [
    ["Dimensions", current.width && current.height ? `${current.width} x ${current.height}` : null],
    ["Camera", [exif.Make ?? exif.make, exif.Model ?? exif.model].filter(Boolean).join(" ") || null],
    ["Lens", exif.LensModel ?? exif.lensModel],
    ["Focal", exif.FocalLength ?? exif.focalLength],
    ["Aperture", exif.FNumber ?? exif.fNumber],
    ["Shutter", exif.ExposureTime ?? exif.exposureTime],
    ["ISO", exif.ISO ?? exif.iso],
    ["Taken", exif.DateTimeOriginal ?? exif.dateTimeOriginal],
    ["Location", current.latitude && current.longitude ? `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}` : null],
  ] as const;
  return (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <View style={[sheetSection, { gap: 10, backgroundColor: isDark ? "#202024" : "#f8fafc", borderColor: isDark ? "#27272a" : "#e5e7eb" }]}>
        <View style={iconButtonContent}><SFIcon name="tag" size={16} tint={isDark ? "white" : "#111827"} /><Text selectable style={{ color: isDark ? "white" : "#111827", fontWeight: "900" }}>Tags</Text></View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tags.length ? tags.map((tag) => <Pressable key={tag.id} onPress={() => onRemoveTag(tag.id)} style={pill}><View style={iconButtonContent}><Text style={pillText}>#{tag.name}</Text><SFIcon name="xmark.circle.fill" size={14} tint="#fb7185" /></View></Pressable>) : <Text selectable style={{ color: "#71717a" }}>No tags</Text>}</View>
      </View>
      <View style={[sheetSection, { gap: 10, backgroundColor: isDark ? "#202024" : "#f8fafc", borderColor: isDark ? "#27272a" : "#e5e7eb" }]}>
        <View style={iconButtonContent}><SFIcon name="person" size={18} tint={isDark ? "white" : "#111827"} /><Text selectable style={{ color: isDark ? "white" : "#111827", fontWeight: "900" }}>People</Text></View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Pressable style={pill}><Text style={pillText}>{current.uploadedBy.name}</Text></Pressable>{mentions.map((person) => <Pressable key={person.id} onPress={() => onRemoveMention(person.id)} style={pill}><View style={iconButtonContent}><Text style={pillText}>{person.name}</Text><SFIcon name="xmark.circle.fill" size={14} tint="#fb7185" /></View></Pressable>)}</View>
      </View>
      <View style={[sheetSection, { gap: 0, backgroundColor: isDark ? "#202024" : "#f8fafc", borderColor: isDark ? "#27272a" : "#e5e7eb" }]}>
        {rows.map(([label, value], rowIndex) => {
          const formatted = formatExifValue(value);
          if (!formatted) return null;
          return <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: rowIndex === 0 ? 0 : 1, borderTopColor: isDark ? "#27272a" : "#e5e7eb", paddingVertical: 10 }}><Text style={{ color: "#71717a", fontWeight: "900", minWidth: 84 }}>{label}</Text><Text selectable style={{ flex: 1, color: isDark ? "#e4e4e7" : "#3f3f46", textAlign: "right", fontWeight: "700" }}>{formatted}</Text></View>;
        })}
      </View>
    </View>
  );
}

function CommentComposer({ value, setValue, onSubmit }: { value: string; setValue: (value: string) => void; onSubmit: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, borderRadius: 24, backgroundColor: "#18181b", borderWidth: 1, borderColor: "#3f3f46", paddingLeft: 14, paddingRight: 6, paddingVertical: 6, marginBottom: 14 }}>
      <TextInput value={value} onChangeText={setValue} placeholder="Add a comment" placeholderTextColor="#71717a" style={{ flex: 1, minHeight: 40, maxHeight: 110, color: "white", paddingVertical: 10 }} multiline />
      <ScalePressable onPress={onSubmit} style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: "#e11d48", alignItems: "center", justifyContent: "center" }}><SFIcon name="paperplane.fill" size={17} /></ScalePressable>
    </View>
  );
}

function CommentItem({ item, currentUserId, isDark, replyingTo, setReplyingTo, replyText, setReplyText, onRefresh, onToggleLike, mediaId }: { item: any; currentUserId?: string; isDark: boolean; replyingTo: string | null; setReplyingTo: (id: string | null) => void; replyText: string; setReplyText: (value: string) => void; onRefresh: () => void; onToggleLike: (commentId: string) => void; mediaId: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
      <InitialsAvatar name={item.user?.name ?? "Someone"} size={34} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ borderRadius: 18, borderCurve: "continuous", backgroundColor: isDark ? "#27272a" : "#f3f4f6", padding: 12, gap: 5 }}>
          <Text selectable style={{ color: isDark ? "white" : "#111827", fontWeight: "900" }}>{item.user?.name ?? "Someone"}</Text>
          <Text selectable style={{ color: isDark ? "#d4d4d8" : "#3f3f46", lineHeight: 20 }}>{item.content}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingLeft: 4 }}>
          <Pressable hitSlop={8} onPress={() => onToggleLike(item.id)}><View style={iconButtonContent}><SFIcon name="heart.fill" size={15} tint={item.hasLiked ? "#fb7185" : "#a1a1aa"} /><Text style={{ color: item.hasLiked ? "#fb7185" : "#a1a1aa", fontWeight: "900" }}>{item.likeCount ?? 0}</Text></View></Pressable>
          <Pressable hitSlop={8} onPress={() => setReplyingTo(replyingTo === item.id ? null : item.id)}><SFIcon name="arrowshape.turn.up.left" size={17} tint="#a1a1aa" /></Pressable>
          {currentUserId === item.user?.id ? <Pressable hitSlop={8} onPress={() => void deleteMobileComment(item.id).then(onRefresh)}><SFIcon name="trash.fill" size={16} tint="#fb7185" /></Pressable> : null}
        </View>
        {replyingTo === item.id ? <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}><TextInput value={replyText} onChangeText={setReplyText} placeholder="Write a reply" placeholderTextColor="#71717a" style={[inputStyle, { flex: 1, minHeight: 42 }]} multiline /><ScalePressable onPress={() => void postReply(mediaId, replyText, item.id).then(() => { setReplyText(""); setReplyingTo(null); onRefresh(); })} style={[primaryButton, iconOnlyButton]}><SFIcon name="paperplane.fill" size={16} /></ScalePressable></View> : null}
        {(item.replies ?? []).map((reply: any) => <View key={reply.id} style={{ flexDirection: "row", gap: 9, marginTop: 2 }}><InitialsAvatar name={reply.user?.name ?? "Someone"} size={28} /><View style={{ flex: 1, gap: 6 }}><View style={{ borderRadius: 16, borderCurve: "continuous", backgroundColor: isDark ? "#202024" : "#eef2f7", padding: 10, gap: 4 }}><Text selectable style={{ color: isDark ? "white" : "#111827", fontWeight: "800" }}>{reply.user?.name ?? "Someone"}</Text><Text selectable style={{ color: isDark ? "#d4d4d8" : "#3f3f46", lineHeight: 19 }}>{reply.content}</Text></View><Pressable hitSlop={8} onPress={() => onToggleLike(reply.id)}><View style={iconButtonContent}><SFIcon name="heart.fill" size={14} tint={reply.hasLiked ? "#fb7185" : "#a1a1aa"} /><Text style={{ color: reply.hasLiked ? "#fb7185" : "#a1a1aa", fontWeight: "900" }}>{reply.likeCount ?? 0}</Text></View></Pressable></View></View>)}
      </View>
    </View>
  );
}

function PhotoSlot({
  item,
  token,
  headers,
  width,
  height,
  loadedIds,
  onLoaded,
  priority = "normal",
}: {
  item: MobileMedia | null;
  token: string | null;
  headers?: Record<string, string>;
  width: number;
  height: number;
  loadedIds: Set<string>;
  onLoaded: (value: Set<string> | ((previous: Set<string>) => Set<string>)) => void;
  priority?: "low" | "normal" | "high";
}) {
  if (!item) return <View style={{ width, height }} />;
  if (item.mimeType.startsWith("video/")) return <VideoSlot item={item} token={token} headers={headers} width={width} height={height} loadedIds={loadedIds} onLoaded={onLoaded} active={priority === "high"} />;
  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center", paddingBottom: 150 }}>
      <Image
        source={{ uri: absoluteUrl(item.thumbnailUrl, token), headers }}
        style={{ position: "absolute", width, height: height * 0.72, opacity: loadedIds.has(item.id) ? 0 : 0.35 }}
        contentFit="contain"
        blurRadius={18}
        cachePolicy="memory-disk"
      />
      <Image
        source={{ uri: absoluteUrl(item.url, token), headers }}
        style={{ width, height: height * 0.72 }}
        contentFit="contain"
        transition={220}
        cachePolicy="memory-disk"
        priority={priority}
        onLoadEnd={() => onLoaded((previous) => new Set(previous).add(item.id))}
      />
    </View>
  );
}

function VideoSlot({ item, token, headers, width, height, loadedIds, onLoaded, active }: { item: MobileMedia; token: string | null; headers?: Record<string, string>; width: number; height: number; loadedIds: Set<string>; onLoaded: (value: Set<string> | ((previous: Set<string>) => Set<string>)) => void; active: boolean }) {
  const player = useVideoPlayer({ uri: absoluteUrl(item.url, token), headers, useCaching: true }, (nextPlayer) => {
    nextPlayer.loop = true;
    if (active) nextPlayer.play();
  });

  useEffect(() => {
    onLoaded((previous) => new Set(previous).add(item.id));
  }, [item.id, onLoaded, player]);

  useEffect(() => {
    try {
      if (active) player.play();
      else player.pause();
    } catch {
      // Native player may already be released during fast modal paging.
    }
  }, [active, player]);

  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center", paddingBottom: 150 }}>
      <Image
        source={{ uri: absoluteUrl(item.thumbnailUrl, token), headers }}
        style={{ position: "absolute", width, height: height * 0.72, opacity: loadedIds.has(item.id) ? 0 : 0.35 }}
        contentFit="contain"
        blurRadius={18}
        cachePolicy="memory-disk"
      />
      <VideoView
        player={player}
        style={{ width, height: height * 0.72 }}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true }}
        surfaceType="textureView"
      />
    </View>
  );
}
