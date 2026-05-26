"use client";

import { useEffect, useState } from "react";
import {
  HiArrowLongRight,
  HiArrowsRightLeft,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import {
  adminSearchMergeUsers,
  getUserMergePreview,
  mergeUsers,
} from "@/app/actions/users";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { logger } from "@/lib/client-logger";

type User = {
  id: string;
  name: string;
  email: string;
  handle?: string | null;
  slackId?: string | null;
  hackclubId?: string;
  isGlobalAdmin?: boolean;
  bio?: string | null;
  preferredName?: string | null;
  socialLinks?: Record<string, string> | null;
  storageLimit?: number;
};

type MergeEvent = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  sourceUploads: number;
  targetUploads: number;
  sourceMentions: number;
  targetMentions: number;
  sourceAttendance: number;
  targetAttendance: number;
};

type MergeField =
  | "name"
  | "preferredName"
  | "handle"
  | "bio"
  | "socialLinks"
  | "storageLimit";

type LoginBehavior = "unchanged" | "notice" | "alias";
type MergeBucket =
  | "moveLikes"
  | "moveComments"
  | "moveCommentLikes"
  | "moveReports"
  | "moveBlurRequests"
  | "moveShareLinks"
  | "moveApiKeys"
  | "moveDataExports"
  | "moveAdminRoles"
  | "moveCreatedEvents"
  | "moveCreatedSeries"
  | "movePendingGrants";

const mergeFields: { key: MergeField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "preferredName", label: "Preferred name" },
  { key: "handle", label: "Handle" },
  { key: "bio", label: "Bio" },
  { key: "socialLinks", label: "Social links" },
  { key: "storageLimit", label: "Storage limit" },
];

const mergeBuckets: { key: MergeBucket; title: string; description: string }[] =
  [
    {
      key: "moveLikes",
      title: "Likes",
      description: "Photo likes made by source.",
    },
    {
      key: "moveComments",
      title: "Comments",
      description: "Photo comments authored by source.",
    },
    {
      key: "moveCommentLikes",
      title: "Comment likes",
      description: "Likes source placed on comments.",
    },
    {
      key: "moveReports",
      title: "Reports",
      description: "Reports opened or resolved by source.",
    },
    {
      key: "moveBlurRequests",
      title: "Blur requests",
      description: "Blur requests opened or resolved by source.",
    },
    {
      key: "moveShareLinks",
      title: "Share links",
      description: "Share links created by source.",
    },
    {
      key: "moveApiKeys",
      title: "API keys",
      description: "Developer API keys owned by source.",
    },
    {
      key: "moveDataExports",
      title: "Data exports",
      description: "Old export records move to target history.",
    },
    {
      key: "moveAdminRoles",
      title: "Admin roles",
      description: "Event and series admin grants.",
    },
    {
      key: "moveCreatedEvents",
      title: "Created events",
      description: "Event creator attribution.",
    },
    {
      key: "moveCreatedSeries",
      title: "Created series",
      description: "Series creator attribution.",
    },
    {
      key: "movePendingGrants",
      title: "Pending grants",
      description: "Pending ownership/admin grant rows.",
    },
  ];

function userLabel(user: User) {
  return `${user.name}${user.slackId ? ` / ${user.slackId}` : ""}${user.hackclubId ? ` / ${user.hackclubId}` : ""}`;
}

function fieldValue(user: User, field: MergeField) {
  const value = user[field];
  if (field === "socialLinks") return JSON.stringify(value || {});
  if (field === "storageLimit") return `${value || 0} bytes`;
  return value ? String(value) : "Empty";
}

export default function MergeUserModal({
  initialUser,
  onClose,
  onMerged,
}: {
  initialUser: User;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [source, setSource] = useState<User>(initialUser);
  const [target, setTarget] = useState<User | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [events, setEvents] = useState<MergeEvent[]>([]);
  const [moveUploadsEventIds, setMoveUploadsEventIds] = useState<string[]>([]);
  const [moveMentionEventIds, setMoveMentionEventIds] = useState<string[]>([]);
  const [moveAttendanceEventIds, setMoveAttendanceEventIds] = useState<
    string[]
  >([]);
  const [selectedBuckets, setSelectedBuckets] = useState<MergeBucket[]>(
    mergeBuckets.map((bucket) => bucket.key),
  );
  const [loginBehavior, setLoginBehavior] =
    useState<LoginBehavior>("unchanged");
  const [scrubSourceProfile, setScrubSourceProfile] = useState(false);
  const [mergeDataFields, setMergeDataFields] = useState<MergeField[]>([]);
  const [step, setStep] = useState<"choose" | "review">("choose");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function search() {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      const result = await adminSearchMergeUsers(query, source.id);
      if (!cancelled && result.success) setResults(result.users || []);
    }
    const timer = setTimeout(search, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, source.id]);

  const loadPreview = async (nextSource: User, nextTarget: User) => {
    if (nextSource.id === nextTarget.id) {
      alert("Choose two different users");
      return;
    }
    setLoading(true);
    try {
      const result = await getUserMergePreview(nextSource.id, nextTarget.id);
      if (!result.success) throw new Error(result.error);
      setSource(nextSource);
      setTarget(nextTarget);
      setEvents(result.events || []);
      setMoveUploadsEventIds(
        (result.events || [])
          .filter((event) => event.sourceUploads > 0)
          .map((event) => event.eventId),
      );
      setMoveMentionEventIds(
        (result.events || [])
          .filter((event) => event.sourceMentions > 0)
          .map((event) => event.eventId),
      );
      setMoveAttendanceEventIds(
        (result.events || [])
          .filter((event) => event.sourceAttendance > 0)
          .map((event) => event.eventId),
      );
      setStep("review");
    } catch (error) {
      logger.error("Error loading merge preview:", error);
      alert("Failed to load merge preview");
    } finally {
      setLoading(false);
    }
  };

  const flipDirection = async () => {
    if (!target) return;
    const oldSource = source;
    setConfirmText("");
    setQuery("");
    setResults([]);
    await loadPreview(target, oldSource);
  };

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];

  const setLogin = (value: LoginBehavior) => {
    setLoginBehavior(value);
    if (value !== "alias") setScrubSourceProfile(false);
  };

  const applyMerge = async () => {
    if (!target || confirmText !== "MERGE") return;
    setProcessing(true);
    try {
      const result = await mergeUsers({
        sourceUserId: source.id,
        targetUserId: target.id,
        moveUploadsEventIds,
        moveMentionEventIds,
        moveAttendanceEventIds,
        moveLikes: selectedBuckets.includes("moveLikes"),
        moveComments: selectedBuckets.includes("moveComments"),
        moveCommentLikes: selectedBuckets.includes("moveCommentLikes"),
        moveReports: selectedBuckets.includes("moveReports"),
        moveBlurRequests: selectedBuckets.includes("moveBlurRequests"),
        moveShareLinks: selectedBuckets.includes("moveShareLinks"),
        moveApiKeys: selectedBuckets.includes("moveApiKeys"),
        moveDataExports: selectedBuckets.includes("moveDataExports"),
        moveAdminRoles: selectedBuckets.includes("moveAdminRoles"),
        moveCreatedEvents: selectedBuckets.includes("moveCreatedEvents"),
        moveCreatedSeries: selectedBuckets.includes("moveCreatedSeries"),
        movePendingGrants: selectedBuckets.includes("movePendingGrants"),
        scrubSourceProfile,
        migrateLogin: loginBehavior === "notice",
        aliasLogin: loginBehavior === "alias",
        mergeDataFields,
      });
      if (!result.success) throw new Error(result.error);
      onMerged();
      onClose();
    } catch (error) {
      logger.error("Error merging users:", error);
      alert(error instanceof Error ? error.message : "Failed to merge users");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 p-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Merge users</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            <UserCard title="From old/source user" user={source} />
            <button
              type="button"
              onClick={flipDirection}
              disabled={!target || loading || processing}
              className="mx-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-300 hover:text-white disabled:opacity-50"
              title="Flip merge direction"
            >
              <HiArrowsRightLeft className="h-5 w-5" />
            </button>
            {target ? (
              <UserCard title="Into target user" user={target} />
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                Choose target user.
              </div>
            )}
          </div>

          {step === "choose" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Search target by name, email, handle, Slack ID, or Hack Club ID
              </label>
              <div className="relative">
                <HiMagnifyingGlass className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-white outline-none focus:border-red-600/50"
                  placeholder="Search user..."
                />
              </div>
              <div className="mt-3 space-y-2">
                {loading && <LoadingSpinner size="sm" />}
                {results.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => loadPreview(source, user)}
                    className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-red-600/50"
                  >
                    <UserAvatar user={user} size="sm" />
                    <div>
                      <div className="font-medium text-white">{user.name}</div>
                      <div className="text-xs text-zinc-500">
                        {userLabel(user)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "review" && target && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <MergeStat label="Uploads" value={moveUploadsEventIds.length} />
                <MergeStat
                  label="Tagged-photo events"
                  value={moveMentionEventIds.length}
                />
                <MergeStat
                  label="Attendance events"
                  value={moveAttendanceEventIds.length}
                />
                <MergeStat label="Login" value={loginBehavior} />
              </div>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="font-medium text-white">
                  Event-by-event identity transfer
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-zinc-500">
                      <tr>
                        <th className="py-2">Event</th>
                        <th className="py-2">Source</th>
                        <th className="py-2">Target</th>
                        <th className="py-2">Move uploads</th>
                        <th className="py-2">Move photo tags</th>
                        <th className="py-2">Move attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {events.map((event) => (
                        <tr key={event.eventId}>
                          <td className="py-3 text-white">{event.eventName}</td>
                          <td className="py-3 text-zinc-300">
                            {event.sourceUploads} uploads,{" "}
                            {event.sourceMentions} tags,{" "}
                            {event.sourceAttendance} attendance
                          </td>
                          <td className="py-3 text-zinc-300">
                            {event.targetUploads} uploads,{" "}
                            {event.targetMentions} tags,{" "}
                            {event.targetAttendance} attendance
                          </td>
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={moveUploadsEventIds.includes(
                                event.eventId,
                              )}
                              onChange={() =>
                                setMoveUploadsEventIds(
                                  toggleId(moveUploadsEventIds, event.eventId),
                                )
                              }
                              disabled={event.sourceUploads === 0}
                              className="h-4 w-4 accent-red-600"
                            />
                          </td>
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={moveMentionEventIds.includes(
                                event.eventId,
                              )}
                              onChange={() =>
                                setMoveMentionEventIds(
                                  toggleId(moveMentionEventIds, event.eventId),
                                )
                              }
                              disabled={event.sourceMentions === 0}
                              className="h-4 w-4 accent-red-600"
                            />
                          </td>
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={moveAttendanceEventIds.includes(
                                event.eventId,
                              )}
                              onChange={() =>
                                setMoveAttendanceEventIds(
                                  toggleId(
                                    moveAttendanceEventIds,
                                    event.eventId,
                                  ),
                                )
                              }
                              disabled={event.sourceAttendance === 0}
                              className="h-4 w-4 accent-red-600"
                            />
                          </td>
                        </tr>
                      ))}
                      {events.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-6 text-center text-zinc-500"
                          >
                            No uploads, photo tags, or attendance for either
                            user.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-white">Other data</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBuckets(
                          mergeBuckets.map((bucket) => bucket.key),
                        )
                      }
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBuckets([])}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Select none
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {mergeBuckets.map((bucket) => (
                    <BucketCard
                      key={bucket.key}
                      bucket={bucket}
                      checked={selectedBuckets.includes(bucket.key)}
                      onChange={() =>
                        setSelectedBuckets(
                          toggleId(
                            selectedBuckets,
                            bucket.key,
                          ) as MergeBucket[],
                        )
                      }
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="font-medium text-white">Login behavior</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <LoginOption
                    title="No login change"
                    description="Both accounts keep logging in normally."
                    value="unchanged"
                    selected={loginBehavior}
                    onChange={setLogin}
                  />
                  <LoginOption
                    title="Show moved notice"
                    description={`Source login shows moved message for ${userLabel(target)}, then stays logged out.`}
                    value="notice"
                    selected={loginBehavior}
                    onChange={setLogin}
                  />
                  <LoginOption
                    title="Alias to target"
                    description="Source credentials log into target account automatically."
                    value="alias"
                    selected={loginBehavior}
                    onChange={setLogin}
                  />
                </div>
                {loginBehavior === "alias" && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <input
                      type="checkbox"
                      checked={scrubSourceProfile}
                      onChange={() =>
                        setScrubSourceProfile(!scrubSourceProfile)
                      }
                      className="mt-1 h-4 w-4 accent-red-600"
                    />
                    <span>
                      <span className="block font-medium text-white">
                        Wipe source into alias shell
                      </span>
                    </span>
                  </label>
                )}
                {loginBehavior !== "alias" && scrubSourceProfile && (
                  <p className="mt-3 rounded-lg border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-100">
                    Wiping source requires Alias to target. Turn on alias to
                    wipe old account into empty alias shell.
                  </p>
                )}
                {loginBehavior !== "alias" && (
                  <button
                    type="button"
                    onClick={() => {
                      setLoginBehavior("alias");
                      setScrubSourceProfile(true);
                    }}
                    className="mt-4 rounded-lg border border-red-600/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-600/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Turn on alias + wipe old account
                  </button>
                )}
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="font-medium text-white">
                  Optional user data merge
                </h3>
                <div className="mt-4 space-y-2">
                  {mergeFields.map((field) => (
                    <label
                      key={field.key}
                      className="grid cursor-pointer gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 md:grid-cols-[auto_140px_1fr_1fr]"
                    >
                      <input
                        type="checkbox"
                        checked={mergeDataFields.includes(field.key)}
                        onChange={() =>
                          setMergeDataFields(
                            toggleId(
                              mergeDataFields,
                              field.key,
                            ) as MergeField[],
                          )
                        }
                        className="mt-1 h-4 w-4 accent-red-600"
                      />
                      <span className="font-medium text-white">
                        {field.label}
                      </span>
                      <span className="truncate text-sm text-red-200">
                        From: {fieldValue(source, field.key)}
                      </span>
                      <span className="truncate text-sm text-zinc-400">
                        Current target: {fieldValue(target, field.key)}
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="font-medium text-white">Final visual review</h3>
                <AccountPreviewComparison
                  source={source}
                  target={target}
                  mergeDataFields={mergeDataFields}
                  scrubSourceProfile={scrubSourceProfile}
                  loginBehavior={loginBehavior}
                  events={events}
                  moveUploadsEventIds={moveUploadsEventIds}
                  moveMentionEventIds={moveMentionEventIds}
                  moveAttendanceEventIds={moveAttendanceEventIds}
                  selectedBuckets={selectedBuckets}
                />
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="font-medium text-white">Final confirmation</h3>
                <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                  <li>
                    Move selected uploads from `{source.name}` to `{target.name}
                    `.
                  </li>
                  <li>Move selected photo-tag records and attendance rows.</li>
                  <li>
                    Other data buckets selected: {selectedBuckets.length} of{" "}
                    {mergeBuckets.length}.
                  </li>
                  <li>
                    Login mode:{" "}
                    {loginBehavior === "alias"
                      ? "alias"
                      : loginBehavior === "notice"
                        ? "migrated notice + logout"
                        : "unchanged"}
                    .
                  </li>
                  <li>
                    Source profile:{" "}
                    {scrubSourceProfile ? "wiped into alias shell" : "kept"}.
                  </li>
                  <li>
                    User data fields copied:{" "}
                    {mergeDataFields.length
                      ? mergeDataFields.join(", ")
                      : "none"}
                    .
                  </li>
                </ul>
                <label className="mt-4 block text-sm font-medium text-zinc-300">
                  Type MERGE to apply
                </label>
                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-red-500"
                />
              </section>
            </>
          )}
        </div>

        {step === "review" && (
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-zinc-800 bg-zinc-950/95 p-5">
            <button
              type="button"
              onClick={() => setStep("choose")}
              disabled={processing}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={applyMerge}
              disabled={processing || confirmText !== "MERGE"}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Merging..." : "Apply merge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserCard({ title, user }: { title: string; user: User }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <UserAvatar user={user} size="sm" />
        <div className="min-w-0">
          <div className="truncate font-medium text-white">{user.name}</div>
          <div className="truncate text-xs text-zinc-500">
            {userLabel(user)}
          </div>
        </div>
      </div>
    </div>
  );
}

function MergeStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function AccountPreviewComparison({
  source,
  target,
  mergeDataFields,
  scrubSourceProfile,
  loginBehavior,
  events,
  moveUploadsEventIds,
  moveMentionEventIds,
  moveAttendanceEventIds,
  selectedBuckets,
}: {
  source: User;
  target: User;
  mergeDataFields: MergeField[];
  scrubSourceProfile: boolean;
  loginBehavior: LoginBehavior;
  events: MergeEvent[];
  moveUploadsEventIds: string[];
  moveMentionEventIds: string[];
  moveAttendanceEventIds: string[];
  selectedBuckets: MergeBucket[];
}) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
      <div
        className={`rounded-lg border p-4 ${
          scrubSourceProfile
            ? "border-red-600/30 bg-red-600/10"
            : "border-zinc-800 bg-zinc-950"
        }`}
      >
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Old/source after merge
        </div>
        <div className="mt-3 flex items-center gap-3">
          <UserAvatar user={source} size="sm" />
          <div className="min-w-0">
            <div
              className={`truncate font-medium text-white ${scrubSourceProfile ? "line-through decoration-red-400 decoration-2" : ""}`}
            >
              {scrubSourceProfile ? "Migrated User" : source.name}
            </div>
            <div className="truncate text-xs text-zinc-500">
              {source.handle ? `@${source.handle}` : source.id}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Profile
          </div>
          <PreviewField
            label="DB: login"
            value={
              loginBehavior === "alias"
                ? "Aliases into target"
                : loginBehavior === "notice"
                  ? "Shows moved notice"
                  : "Unchanged"
            }
            crossed={false}
            changed={loginBehavior !== "unchanged"}
          />
          <PreviewField
            label="Public/users/search"
            value={loginBehavior === "unchanged" ? "Visible as user" : "Hidden"}
            crossed={loginBehavior !== "unchanged"}
            changed={loginBehavior !== "unchanged"}
          />
          <PreviewField
            label="Old /users page"
            value={
              loginBehavior === "unchanged"
                ? "Shows old profile"
                : "Redirects to target"
            }
            changed={loginBehavior !== "unchanged"}
          />
          {mergeFields.map((field) => (
            <PreviewField
              key={field.key}
              label={`DB: ${field.label}`}
              value={
                scrubSourceProfile ? "Wiped" : fieldValue(source, field.key)
              }
              crossed={scrubSourceProfile}
              changed={scrubSourceProfile}
            />
          ))}
          <PreviewSectionTitle>Events</PreviewSectionTitle>
          {events.map((event) => {
            const moveUploads = moveUploadsEventIds.includes(event.eventId);
            const moveMentions = moveMentionEventIds.includes(event.eventId);
            const moveAttendance = moveAttendanceEventIds.includes(
              event.eventId,
            );
            return (
              <EventSidePreview
                key={event.eventId}
                name={event.eventName}
                uploads={moveUploads ? 0 : event.sourceUploads}
                mentions={moveMentions ? 0 : event.sourceMentions}
                attendance={moveAttendance ? 0 : event.sourceAttendance}
                moved={moveUploads || moveMentions || moveAttendance}
                crossed={moveUploads && moveMentions && moveAttendance}
              />
            );
          })}
          {events.length === 0 && <EmptyPreview text="No event data" />}
          <PreviewSectionTitle>Other data</PreviewSectionTitle>
          {mergeBuckets.map((bucket) => (
            <PreviewField
              key={bucket.key}
              label={bucket.title}
              value={
                selectedBuckets.includes(bucket.key)
                  ? "Moved to target"
                  : "Kept on old user"
              }
              changed={selectedBuckets.includes(bucket.key)}
              crossed={selectedBuckets.includes(bucket.key)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center text-zinc-500">
        <HiArrowLongRight className="h-8 w-8" />
      </div>

      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-green-200/70">
          New/target after merge
        </div>
        <div className="mt-3 flex items-center gap-3">
          <UserAvatar user={target} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-white">
              {mergeDataFields.includes("name") ? source.name : target.name}
            </div>
            <div className="truncate text-xs text-green-200/70">
              {mergeDataFields.includes("handle") && source.handle
                ? `@${source.handle}`
                : target.handle
                  ? `@${target.handle}`
                  : target.id}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-green-200/70">
            Profile
          </div>
          <PreviewField
            label="DB: login"
            value="Target credentials unchanged"
            changed={loginBehavior !== "unchanged"}
          />
          <PreviewField label="Public/users/search" value="Visible" />
          <PreviewField
            label="Old /users page"
            value={
              loginBehavior === "unchanged"
                ? "No redirect"
                : "Receives old profile redirects"
            }
            changed={loginBehavior !== "unchanged"}
          />
          {mergeFields.map((field) => (
            <PreviewField
              key={field.key}
              label={`DB: ${field.label}`}
              value={
                mergeDataFields.includes(field.key)
                  ? fieldValue(source, field.key)
                  : fieldValue(target, field.key)
              }
              changed={mergeDataFields.includes(field.key)}
            />
          ))}
          <PreviewSectionTitle>Events</PreviewSectionTitle>
          {events.map((event) => {
            const moveUploads = moveUploadsEventIds.includes(event.eventId);
            const moveMentions = moveMentionEventIds.includes(event.eventId);
            const moveAttendance = moveAttendanceEventIds.includes(
              event.eventId,
            );
            return (
              <EventSidePreview
                key={event.eventId}
                name={event.eventName}
                uploads={
                  event.targetUploads + (moveUploads ? event.sourceUploads : 0)
                }
                mentions={
                  event.targetMentions +
                  (moveMentions ? event.sourceMentions : 0)
                }
                attendance={
                  event.targetAttendance +
                  (moveAttendance ? event.sourceAttendance : 0)
                }
                moved={moveUploads || moveMentions || moveAttendance}
              />
            );
          })}
          {events.length === 0 && <EmptyPreview text="No event data" />}
          <PreviewSectionTitle>Other data</PreviewSectionTitle>
          {mergeBuckets.map((bucket) => (
            <PreviewField
              key={bucket.key}
              label={bucket.title}
              value={
                selectedBuckets.includes(bucket.key)
                  ? "Moved here"
                  : "No change"
              }
              changed={selectedBuckets.includes(bucket.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return (
    <div className="rounded border border-zinc-800 px-3 py-2 text-xs text-zinc-500">
      {text}
    </div>
  );
}

function EventSidePreview({
  name,
  uploads,
  mentions,
  attendance,
  moved,
  crossed = false,
}: {
  name: string;
  uploads: number;
  mentions: number;
  attendance: number;
  moved: boolean;
  crossed?: boolean;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        crossed
          ? "border-red-600/30 bg-red-600/10"
          : moved
            ? "border-green-500/30 bg-green-500/10"
            : "border-zinc-800 bg-zinc-950/70"
      }`}
    >
      <div
        className={`font-medium text-white ${crossed ? "line-through decoration-red-300" : ""}`}
      >
        {name}
      </div>
      <div className="mt-1 text-xs text-zinc-400">
        {uploads} uploads · {mentions} photo tags · {attendance} attendance
      </div>
    </div>
  );
}

function PreviewField({
  label,
  value,
  changed = false,
  crossed = false,
}: {
  label: string;
  value: string;
  changed?: boolean;
  crossed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`max-w-[65%] truncate text-right ${
          crossed
            ? "text-red-200 line-through decoration-red-300"
            : changed
              ? "text-green-200"
              : "text-zinc-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function BucketCard({
  bucket,
  checked,
  onChange,
}: {
  bucket: { key: MergeBucket; title: string; description: string };
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
        checked
          ? "border-red-600/60 bg-red-600/10"
          : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="mt-1 h-4 w-4 accent-red-600"
        />
        <span>
          <span className="block text-sm font-medium text-white">
            {bucket.title}
          </span>
          <span className="mt-1 block text-xs text-zinc-400">
            {bucket.description}
          </span>
        </span>
      </div>
    </label>
  );
}

function LoginOption({
  title,
  description,
  value,
  selected,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: LoginBehavior;
  selected: LoginBehavior;
  disabled?: boolean;
  onChange: (value: LoginBehavior) => void;
}) {
  const checked = value === selected;
  return (
    <label
      className={`cursor-pointer rounded-lg border p-4 transition-colors ${
        checked
          ? "border-red-600/60 bg-red-600/10"
          : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div>
        <div className="flex items-center gap-2 font-medium text-white">
          <input
            type="radio"
            name="loginBehavior"
            value={value}
            checked={checked}
            disabled={disabled}
            onChange={() => onChange(value)}
            className="h-4 w-4 accent-red-600"
          />
          {title}
        </div>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
      </div>
    </label>
  );
}
