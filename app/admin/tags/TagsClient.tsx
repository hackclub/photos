"use client";
import { useCallback, useEffect, useState } from "react";
import { HiPencil, HiTrash, HiXMark } from "react-icons/hi2";
import { deleteTag, getAllTags, updateTag } from "@/app/actions/tags";
import { AdminSearch, AdminToolbar } from "@/components/ui/AdminPageLayout";
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

interface Tag {
  id: string;
  name: string;
  color: string | null;
  count: number;
  createdAt: Date;
}
const TAG_COLORS = [
  {
    name: "Blue",
    value: "blue",
    class: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    name: "Red",
    value: "red",
    class: "bg-red-600/10 text-red-400 border-red-600/20",
  },
  {
    name: "Green",
    value: "green",
    class: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  {
    name: "Yellow",
    value: "yellow",
    class: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  {
    name: "Purple",
    value: "purple",
    class: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    name: "Pink",
    value: "pink",
    class: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  },
  {
    name: "Orange",
    value: "orange",
    class: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  {
    name: "Gray",
    value: "gray",
    class: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
];
export default function TagsClient() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTags, setTotalTags] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [processing, setProcessing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("blue");
  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllTags(page, 50, searchQuery);
      if (result.success && result.tags) {
        setTags(result.tags as Tag[]);
        if (result.pagination) {
          setTotalPages(result.pagination.totalPages);
          setTotalTags(result.pagination.total);
        }
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);
  const handleEditClick = (tag: Tag) => {
    setSelectedTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || "blue");
    setEditModalOpen(true);
  };
  const handleDeleteClick = (tag: Tag) => {
    setSelectedTag(tag);
    setDeleteModalOpen(true);
  };
  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTag) return;
    setProcessing(true);
    try {
      const result = await updateTag(selectedTag.id, {
        name: editName,
        color: editColor,
      });
      if (result.success) {
        setEditModalOpen(false);
        fetchTags();
      } else {
        alert("Failed to update tag");
      }
    } catch (error) {
      console.error("Error updating tag:", error);
      alert("Error updating tag");
    } finally {
      setProcessing(false);
    }
  };
  const handleDeleteTag = async () => {
    if (!selectedTag) return;
    setProcessing(true);
    try {
      const result = await deleteTag(selectedTag.id);
      if (result.success) {
        setDeleteModalOpen(false);
        fetchTags();
      } else {
        alert("Failed to delete tag");
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      alert("Error deleting tag");
    } finally {
      setProcessing(false);
    }
  };
  const getTagColorClass = (colorName: string | null) => {
    const color = TAG_COLORS.find((c) => c.value === (colorName || "blue"));
    return color ? color.class : TAG_COLORS[0].class;
  };
  return (
    <div className="space-y-6">
      <AdminToolbar>
        <AdminSearch
          placeholder="Search tags..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </AdminToolbar>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Showing <span className="text-white font-medium">{tags.length}</span>{" "}
          of <span className="text-white font-medium">{totalTags}</span> results
        </p>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag Name</TableHead>
              <TableHead>Usage Count</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <LoadingSpinner />
                </TableCell>
              </TableRow>
            ) : tags.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-12 text-zinc-400"
                >
                  {searchQuery
                    ? "No tags found matching your search"
                    : "No tags found"}
                </TableCell>
              </TableRow>
            ) : (
              tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTagColorClass(tag.color)}`}
                    >
                      #{tag.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {tag.count} photos
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {new Date(tag.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditClick(tag)}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Edit Tag"
                      >
                        <HiPencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(tag)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-700/10 rounded-lg transition-colors"
                        title="Delete Tag"
                      >
                        <HiTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </TableContainer>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Edit Tag</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTag} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Tag Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-red-600"
                  placeholder="tag-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Color
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setEditColor(color.value)}
                      className={`h-8 rounded-lg border transition-all ${color.class} ${
                        editColor === color.value
                          ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
                          : "opacity-70 hover:opacity-100"
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => !processing && setDeleteModalOpen(false)}
        onConfirm={handleDeleteTag}
        title="Delete Tag"
        message={
          <div className="space-y-2">
            <p className="text-zinc-300">
              Are you sure you want to delete the tag{" "}
              <strong className="text-white">#{selectedTag?.name}</strong>?
            </p>
            <p className="text-sm text-zinc-400">
              This will remove the tag from {selectedTag?.count} photos. The
              photos themselves will not be deleted.
            </p>
          </div>
        }
        confirmText={processing ? "Deleting..." : "Delete Tag"}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        disabled={processing}
      />
    </div>
  );
}
