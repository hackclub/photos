"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useEffect, useRef, useState } from "react";
import {
  HiArrowDown,
  HiArrowDownTray,
  HiArrowLeft,
  HiArrowUpTray,
  HiCalendar,
  HiCheck,
  HiClipboard,
  HiClipboardDocument,
  HiPlus,
  HiCheck as HiSave,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import { bulkCreateEvents } from "@/app/actions/bulk";
import { checkSlugAvailability } from "@/app/actions/events";
import { searchLocation } from "@/app/actions/location";
import { getUsersBySlackIds } from "@/app/actions/users";
import LocationSearch from "@/components/map/LocationSearch";
import UserAvatar from "@/components/ui/UserAvatar";
import UserSearch from "@/components/ui/UserSearch";

interface CsvRow {
  "Event Name": string;
  Description: string;
  "Date (YYYY-MM-DD)": string;
  Location: string;
  "Admins (Slack IDs comma separated)": string;
  [key: string]: string;
}
interface SlackUser {
  id: string;
  name: string;
  email: string;
  slackId: string | null;
  avatarS3Key: string | null;
  avatarSource:
    | "upload"
    | "slack"
    | "gravatar"
    | "libravatar"
    | "dicebear"
    | null;
}
interface BulkEventRow {
  id: string;
  name: string;
  description: string;
  location: string;
  locationCity: string;
  locationCountry: string;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  admins: {
    id: string;
    name: string;
    email: string;
    avatarS3Key?: string | null;
  }[];
  slug: string;
  slugManuallyEdited?: boolean;
  visibility: "public" | "auth_required" | "unlisted";
  allowPublicSharing: boolean;
  error?: string;
}
interface BulkCreateClientProps {
  seriesId: string;
  seriesName: string;
  seriesSlug: string;
}
export default function BulkCreateClient({
  seriesId,
  seriesName,
  seriesSlug,
}: BulkCreateClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<BulkEventRow[]>([createEmptyRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(`bulk-create-draft-${seriesId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed);
        }
      } catch (e) {
        console.error("Failed to load draft", e);
      }
    }
    setIsLoaded(true);
  }, [seriesId]);
  useEffect(() => {
    if (!isLoaded) return;
    const timeout = setTimeout(() => {
      localStorage.setItem(
        `bulk-create-draft-${seriesId}`,
        JSON.stringify(rows),
      );
    }, 1000);
    return () => clearTimeout(timeout);
  }, [rows, seriesId, isLoaded]);
  const [showReview, setShowReview] = useState(false);
  const [reviewTimer, setReviewTimer] = useState(5);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  function createEmptyRow(): BulkEventRow {
    return {
      id: Math.random().toString(36).substring(7),
      name: "",
      description: "",
      location: "",
      locationCity: "",
      locationCountry: "",
      latitude: null,
      longitude: null,
      eventDate: "",
      admins: [],
      slug: "",
      slugManuallyEdited: false,
      visibility: "auth_required",
      allowPublicSharing: true,
    };
  }
  const handleAddRow = () => {
    setRows([...rows, createEmptyRow()]);
  };
  const handleDuplicateRow = (id: string) => {
    const rowToDuplicate = rows.find((r) => r.id === id);
    if (!rowToDuplicate) return;
    const newRow = {
      ...rowToDuplicate,
      id: Math.random().toString(36).substring(7),
      name: `${rowToDuplicate.name} (Copy)`,
      slug: `${rowToDuplicate.slug}-copy`,
    };
    const index = rows.findIndex((r) => r.id === id);
    const newRows = [...rows];
    newRows.splice(index + 1, 0, newRow);
    setRows(newRows);
  };
  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(rows.filter((row) => row.id !== id));
    const newSelected = new Set(selectedRows);
    newSelected.delete(id);
    setSelectedRows(newSelected);
  };
  const updateRow = (id: string, updates: Partial<BulkEventRow>) => {
    setRows(
      rows.map((row) => {
        if (row.id !== id) return row;
        const updatedRow = { ...row, ...updates };
        if (updates.slug !== undefined) {
          updatedRow.slugManuallyEdited = true;
        }
        if (updates.name && !row.slugManuallyEdited && !updates.slug) {
          updatedRow.slug = slugify(updates.name);
        }
        return updatedRow;
      }),
    );
  };
  const slugify = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-");
  };
  const handleLocationSelect = (
    rowId: string,
    location: {
      displayName: string;
      city: string;
      country: string;
      latitude: number;
      longitude: number;
    },
  ) => {
    updateRow(rowId, {
      location: location.displayName,
      locationCity: location.city,
      locationCountry: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  };
  const handleAddAdmin = (
    rowId: string,
    user: {
      id: string;
      name: string;
      email: string;
      avatarS3Key?: string | null;
    },
  ) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    if (!row.admins.some((a) => a.id === user.id)) {
      updateRow(rowId, { admins: [...row.admins, user] });
    }
  };
  const handleRemoveAdmin = (rowId: string, userId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, {
      admins: row.admins.filter((a) => a.id !== userId),
    });
  };
  const toggleRowSelection = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };
  const toggleAllSelection = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((r) => r.id)));
    }
  };
  const handleBulkEdit = (
    field: keyof BulkEventRow,
    value: string | boolean | number | null,
  ) => {
    if (selectedRows.size === 0) return;
    setRows(
      rows.map((row) => {
        if (!selectedRows.has(row.id)) return row;
        return { ...row, [field]: value };
      }),
    );
  };
  const handleBulkAddAdmin = (user: {
    id: string;
    name: string;
    email: string;
    avatarS3Key?: string | null;
  }) => {
    if (selectedRows.size === 0) return;
    setRows(
      rows.map((row) => {
        if (!selectedRows.has(row.id)) return row;
        if (row.admins.some((a) => a.id === user.id)) return row;
        return { ...row, admins: [...row.admins, user] };
      }),
    );
  };
  const handleFillDown = () => {
    if (selectedRows.size < 2) return;
    const selectedIndices = rows
      .map((r, i) => (selectedRows.has(r.id) ? i : -1))
      .filter((i) => i !== -1);
    if (selectedIndices.length === 0) return;
    const firstIndex = selectedIndices[0];
    const sourceRow = rows[firstIndex];
    setRows(
      rows.map((row, index) => {
        if (!selectedRows.has(row.id) || index === firstIndex) return row;
        return {
          ...row,
          description: sourceRow.description,
          eventDate: sourceRow.eventDate,
          location: sourceRow.location,
          locationCity: sourceRow.locationCity,
          locationCountry: sourceRow.locationCountry,
          latitude: sourceRow.latitude,
          longitude: sourceRow.longitude,
          admins: [...sourceRow.admins],
          visibility: sourceRow.visibility,
          allowPublicSharing: sourceRow.allowPublicSharing,
        };
      }),
    );
  };
  const handleDownloadTemplate = () => {
    const csvContent =
      "Event Name,Description,Date (YYYY-MM-DD),Location,Admins (Slack IDs comma separated)\nExample Event,This is a description,2025-01-01,San Francisco,U123456,U789012";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_events_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };
  const processParsedResults = async (results: Papa.ParseResult<CsvRow>) => {
    const parsedRows = results.data.filter((row) => row["Event Name"]);
    const allSlackIds = new Set<string>();
    parsedRows.forEach((row) => {
      if (row["Admins (Slack IDs comma separated)"]) {
        row["Admins (Slack IDs comma separated)"]
          .split(",")
          .map((id: string) => id.trim())
          .filter(Boolean)
          .forEach((id: string) => {
            allSlackIds.add(id);
          });
      }
    });
    const slackUsers: Record<string, SlackUser> = {};
    if (allSlackIds.size > 0) {
      const result = await getUsersBySlackIds(Array.from(allSlackIds));
      if (result.success && result.users) {
        result.users.forEach((user) => {
          if (user.slackId) {
            slackUsers[user.slackId] = user;
          }
        });
      }
    }
    const newRows: BulkEventRow[] = [];
    for (const row of parsedRows) {
      const adminSlackIds = row["Admins (Slack IDs comma separated)"]
        ? row["Admins (Slack IDs comma separated)"]
            .split(",")
            .map((id: string) => id.trim())
            .filter(Boolean)
        : [];
      const admins = adminSlackIds
        .map((id: string) => slackUsers[id])
        .filter(Boolean);
      let locationData = {
        location: row.Location || "",
        locationCity: "",
        locationCountry: "",
        latitude: null as number | null,
        longitude: null as number | null,
      };
      if (row.Location) {
        const locResult = await searchLocation(row.Location);
        if (
          locResult.success &&
          locResult.locations &&
          locResult.locations.length > 0
        ) {
          const loc = locResult.locations[0];
          locationData = {
            location: loc.displayName,
            locationCity: loc.city,
            locationCountry: loc.country,
            latitude: loc.latitude,
            longitude: loc.longitude,
          };
        }
      }
      newRows.push({
        id: Math.random().toString(36).substring(7),
        name: row["Event Name"] || "",
        description: row.Description || "",
        ...locationData,
        eventDate: row["Date (YYYY-MM-DD)"] || "",
        admins: admins,
        slug: slugify(row["Event Name"] || ""),
        slugManuallyEdited: false,
        visibility: "auth_required",
        allowPublicSharing: true,
      });
    }
    if (newRows.length > 0) {
      setRows((prev) => {
        if (prev.length === 1 && !prev[0].name) {
          return newRows;
        }
        return [...prev, ...newRows];
      });
    }
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: processParsedResults,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  const handlePasteProcess = () => {
    if (!pasteContent.trim()) return;
    Papa.parse<CsvRow>(pasteContent, {
      header: true,
      complete: (results) => {
        processParsedResults(results);
        setShowPasteModal(false);
        setPasteContent("");
      },
    });
  };
  const handleReview = async () => {
    setIsSubmitting(true);
    const _errors: Record<string, string> = {};
    let hasErrors = false;
    const slugCounts = new Map<string, number>();
    rows.forEach((row) => {
      if (row.slug) {
        slugCounts.set(row.slug, (slugCounts.get(row.slug) || 0) + 1);
      }
    });
    const slugAvailability = new Map<string, boolean>();
    for (const row of rows) {
      if (row.slug) {
        const { available } = await checkSlugAvailability(row.slug);
        slugAvailability.set(row.slug, available);
      }
    }
    const validatedRows = rows.map((row) => {
      if (!row.name.trim()) {
        hasErrors = true;
        return { ...row, error: "Name is required" };
      }
      if (!row.slug.trim()) {
        hasErrors = true;
        return { ...row, error: "Slug is required" };
      }
      if (slugCounts.get(row.slug)! > 1) {
        hasErrors = true;
        return { ...row, error: "Duplicate slug in list" };
      }
      if (!slugAvailability.get(row.slug)) {
        hasErrors = true;
        return { ...row, error: "Slug already taken" };
      }
      return { ...row, error: undefined };
    });
    setIsSubmitting(false);
    if (hasErrors) {
      setRows(validatedRows);
      alert("Please fix errors before submitting");
      return;
    }
    setShowReview(true);
    setReviewTimer(5);
    const timer = setInterval(() => {
      setReviewTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const eventsData = rows.map((row) => ({
        name: row.name,
        slug: row.slug,
        description: row.description,
        location: row.location,
        locationCity: row.locationCity,
        locationCountry: row.locationCountry,
        latitude: row.latitude,
        longitude: row.longitude,
        eventDate: row.eventDate ? new Date(row.eventDate) : null,
        adminUserIds: row.admins.map((a) => a.id),
        visibility: row.visibility,
        allowPublicSharing: row.allowPublicSharing,
        requiresInvite: false,
      }));
      const result = await bulkCreateEvents(seriesId, eventsData);
      if (result.success && "created" in result) {
        alert(`Successfully created ${result.created} events!`);
        router.push(`/series/${seriesSlug}`);
      } else {
        throw new Error(result.error || "Failed to create events");
      }
      localStorage.removeItem(`bulk-create-draft-${seriesId}`);
    } catch (error: unknown) {
      console.error("Bulk create error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create events";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="min-h-screen bg-black pb-20">
      <div className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/series/${seriesSlug}`}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <HiArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Bulk Create Events
                </h1>
                <p className="text-sm text-zinc-400">
                  Adding events to{" "}
                  <span className="text-white">{seriesName}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors text-sm font-medium"
              >
                <HiArrowDownTray className="w-5 h-5" />
                Template
              </button>
              <button
                onClick={() => setShowPasteModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors text-sm font-medium"
              >
                <HiClipboard className="w-5 h-5" />
                Paste
              </button>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors text-sm font-medium"
                >
                  <HiArrowUpTray className="w-5 h-5" />
                  Import CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {selectedRows.size > 0 && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-white whitespace-nowrap">
                {selectedRows.size} selected
              </span>
              <div className="h-4 w-px bg-zinc-700" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Set Date:
              </span>
              <input
                type="date"
                onChange={(e) => handleBulkEdit("eventDate", e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Set Location:
              </span>
              <div className="w-48">
                <LocationSearch
                  onLocationSelect={(loc) => {
                    setRows(
                      rows.map((row) => {
                        if (!selectedRows.has(row.id)) return row;
                        return {
                          ...row,
                          location: loc.displayName,
                          locationCity: loc.city,
                          locationCountry: loc.country,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                        };
                      }),
                    );
                  }}
                  placeholder="Apply to selected..."
                />
              </div>
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Add Admin:
              </span>
              <div className="w-48">
                <UserSearch
                  onSelectUser={handleBulkAddAdmin}
                  placeholder="Add to selected..."
                />
              </div>
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Description:
              </span>
              <input
                type="text"
                placeholder="Set description for selected..."
                onChange={(e) => handleBulkEdit("description", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Visibility:
              </span>
              <select
                onChange={(e) => handleBulkEdit("visibility", e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600"
              >
                <option value="">Select...</option>
                <option value="public">Public</option>
                <option value="auth_required">Auth Required</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 whitespace-nowrap">
                Sharing:
              </span>
              <select
                onChange={(e) =>
                  handleBulkEdit(
                    "allowPublicSharing",
                    e.target.value === "true",
                  )
                }
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600"
              >
                <option value="">Select...</option>
                <option value="true">Allowed</option>
                <option value="false">Disabled</option>
              </select>
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            <button
              onClick={handleFillDown}
              title="Copy values from first selected row to others"
              className="text-zinc-400 hover:text-white text-sm font-medium flex items-center gap-2 whitespace-nowrap px-2"
            >
              <HiArrowDown className="w-5 h-5" />
              Fill Down
            </button>

            <button
              onClick={() => {
                const newRows = rows.filter((r) => !selectedRows.has(r.id));
                setRows(newRows.length ? newRows : [createEmptyRow()]);
                setSelectedRows(new Set());
              }}
              className="ml-auto text-red-400 hover:text-red-300 text-sm font-medium flex items-center gap-2 whitespace-nowrap px-2"
            >
              <HiTrash className="w-5 h-5" />
              Delete Selected
            </button>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="bg-zinc-950/50 border-b border-zinc-800">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedRows.size === rows.length && rows.length > 0
                    }
                    onChange={toggleAllSelection}
                    className="rounded-md border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-64">
                  Event Name & Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-64">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-48">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-64">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-64">
                  Admins
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-32">
                  Visibility
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-24">
                  Sharing
                </th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`group hover:bg-zinc-800/50 transition-colors ${row.error ? "bg-red-600/5" : ""}`}
                >
                  <td className="px-4 py-3 align-top pt-5">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onChange={() => toggleRowSelection(row.id)}
                      className="rounded-md border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          updateRow(row.id, { name: e.target.value })
                        }
                        placeholder="Event Name"
                        className={`w-full bg-black border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 ${
                          row.error && !row.name
                            ? "border-red-600"
                            : "border-zinc-700"
                        }`}
                      />
                      <div className="flex items-center gap-1 text-xs text-zinc-500">
                        <span className="select-none">/events/</span>
                        <input
                          type="text"
                          value={row.slug}
                          onChange={(e) =>
                            updateRow(row.id, { slug: e.target.value })
                          }
                          placeholder="slug"
                          className="bg-transparent border-b border-zinc-800 focus:border-zinc-600 focus:outline-none text-zinc-400 w-full"
                        />
                      </div>
                      {row.error && !row.name && (
                        <p className="text-xs text-red-400">Name is required</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <textarea
                      value={row.description}
                      onChange={(e) =>
                        updateRow(row.id, { description: e.target.value })
                      }
                      placeholder="Description..."
                      rows={3}
                      className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 resize-none"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="relative">
                      <HiCalendar className="absolute left-3 top-2.5 text-zinc-500 w-5 h-5" />
                      <input
                        type="date"
                        value={row.eventDate}
                        onChange={(e) =>
                          updateRow(row.id, { eventDate: e.target.value })
                        }
                        className="w-full bg-black border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-2">
                      <LocationSearch
                        onLocationSelect={(loc) =>
                          handleLocationSelect(row.id, loc)
                        }
                        placeholder="Search location..."
                      />
                      {row.location && (
                        <div className="text-xs text-zinc-400 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800">
                          <p className="font-medium text-zinc-300">
                            {row.location}
                          </p>
                          <p>
                            {[row.locationCity, row.locationCountry]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-2">
                      <UserSearch
                        onSelectUser={(user) => handleAddAdmin(row.id, user)}
                        excludeUserIds={row.admins.map((a) => a.id)}
                        placeholder="Add admin..."
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {row.admins.map((admin) => (
                          <span
                            key={admin.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-500/10 rounded-full text-xs text-zinc-400 border border-zinc-500/20 pr-3"
                          >
                            <UserAvatar user={admin} size="xs" />
                            {admin.name}
                            <button
                              onClick={() =>
                                handleRemoveAdmin(row.id, admin.id)
                              }
                              className="hover:text-red-400 ml-0.5"
                            >
                              <HiXMark className="w-4 h-4" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top pt-5">
                    <select
                      value={row.visibility}
                      onChange={(e) =>
                        updateRow(row.id, { visibility: e.target.value as any })
                      }
                      className="w-full bg-black border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-600"
                    >
                      <option value="public">Public</option>
                      <option value="auth_required">Auth Required</option>
                      <option value="unlisted">Unlisted</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.allowPublicSharing}
                        onChange={(e) =>
                          updateRow(row.id, {
                            allowPublicSharing: e.target.checked,
                          })
                        }
                        className="rounded-md border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600"
                      />
                      <span className="text-sm text-zinc-400">Allow</span>
                    </label>
                  </td>
                  <td className="px-4 py-3 align-top pt-5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDuplicateRow(row.id)}
                        className="text-zinc-600 hover:text-white transition-colors"
                        title="Duplicate row"
                      >
                        <HiClipboardDocument className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        title="Remove row"
                      >
                        <HiTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleAddRow}
          className="mt-4 w-full py-3 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex items-center justify-center gap-2 font-medium"
        >
          <HiPlus className="w-5 h-5" />
          Add Another Event
        </button>

        <div className="mt-8 flex items-center justify-end gap-4 border-t border-zinc-800 pt-8">
          <div className="text-sm text-zinc-500">
            {rows.length} event{rows.length !== 1 ? "s" : ""} to be created
          </div>
          <button
            onClick={handleReview}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg text-lg"
          >
            <HiCheck className="w-5 h-5" />
            Review & Create
          </button>
        </div>
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full flex flex-col shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                Paste from Spreadsheet
              </h2>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-zinc-400 text-sm mb-4">
                Copy and paste your data from Excel or Google Sheets. Make sure
                to include the headers:
                <br />
                <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded-md text-zinc-300">
                  Event Name
                </code>
                ,{" "}
                <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded-md text-zinc-300">
                  Description
                </code>
                ,{" "}
                <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded-md text-zinc-300">
                  Date (YYYY-MM-DD)
                </code>
                ,{" "}
                <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded-md text-zinc-300">
                  Location
                </code>
                ,{" "}
                <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded-md text-zinc-300">
                  Admins (Slack IDs comma separated)
                </code>
              </p>
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your data here..."
                className="w-full h-64 bg-black border border-zinc-700 rounded-lg p-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 font-mono"
              />
            </div>

            <div className="p-6 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-900/50">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteProcess}
                disabled={!pasteContent.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg "
              >
                <HiClipboard className="w-5 h-5" />
                Process Data
              </button>
            </div>
          </div>
        </div>
      )}

      {showReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Review Events</h2>
              <button
                onClick={() => setShowReview(false)}
                className="text-zinc-400 hover:text-white"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-zinc-300 mb-6">
                You are about to create{" "}
                <span className="font-bold text-white">{rows.length}</span>{" "}
                events in{" "}
                <span className="font-bold text-white">{seriesName}</span>.
                Please review the details below.
              </p>

              <div className="space-y-4">
                {rows.map((row, i) => (
                  <div
                    key={row.id}
                    className="bg-black border border-zinc-800 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-white">
                        {row.name || "Untitled Event"}
                      </h3>
                      <span className="text-xs text-zinc-500 font-mono">
                        /events/{row.slug}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-zinc-500 block text-xs uppercase tracking-wider mb-1">
                          Date
                        </span>
                        <span className="text-zinc-300">
                          {row.eventDate || "No date set"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-xs uppercase tracking-wider mb-1">
                          Location
                        </span>
                        <span className="text-zinc-300">
                          {row.location || "No location set"}
                        </span>
                      </div>
                      {row.admins.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-zinc-500 block text-xs uppercase tracking-wider mb-1">
                            Admins
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {row.admins.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-500/10 rounded-full text-xs text-zinc-400 border border-zinc-500/20"
                              >
                                <UserAvatar user={a} size="xs" />
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-900/50">
              <button
                onClick={() => setShowReview(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={reviewTimer > 0 || isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg min-w-[160px] justify-center"
              >
                {isSubmitting ? (
                  "Creating..."
                ) : reviewTimer > 0 ? (
                  `Confirm in ${reviewTimer}s`
                ) : (
                  <>
                    <HiSave className="w-5 h-5" />
                    Confirm Create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
