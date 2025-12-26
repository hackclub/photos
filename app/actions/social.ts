"use server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  broadcastNewComment,
  broadcastNewLike,
} from "@/app/api/feed/stream/route";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  commentLikes,
  media,
  mediaComments,
  mediaLikes,
} from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
export async function toggleMediaLike(mediaId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "interact", "media", mediaItem))) {
      return { success: false, error: "Unauthorized" };
    }
    const existingLike = await db.query.mediaLikes.findFirst({
      where: and(
        eq(mediaLikes.mediaId, mediaId),
        eq(mediaLikes.userId, user.id),
      ),
    });
    if (existingLike) {
      await db
        .delete(mediaLikes)
        .where(
          and(eq(mediaLikes.mediaId, mediaId), eq(mediaLikes.userId, user.id)),
        );
    } else {
      await db.insert(mediaLikes).values({
        mediaId,
        userId: user.id,
      });
    }
    const likes = await db.query.mediaLikes.findMany({
      where: eq(mediaLikes.mediaId, mediaId),
    });
    if (!existingLike) {
      try {
        broadcastNewLike(mediaId, user.id).catch(console.error);
      } catch (error) {
        console.error("Failed to broadcast new like:", error);
      }
    }
    return {
      success: true,
      likeCount: likes.length,
      hasLiked: !existingLike,
    };
  } catch (error) {
    console.error("Error toggling media like:", error);
    return { success: false, error: "Failed to toggle like" };
  }
}
export async function getMediaLikes(mediaId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "view", "media", mediaItem))) {
      if (!user) return { success: false, error: "Unauthorized" };
      return { success: false, error: "Forbidden" };
    }
    const likes = await db.query.mediaLikes.findMany({
      where: eq(mediaLikes.mediaId, mediaId),
    });
    const hasLiked = user
      ? likes.some((like) => like.userId === user.id)
      : false;
    return {
      success: true,
      likeCount: likes.length,
      hasLiked,
    };
  } catch (error) {
    console.error("Error getting media likes:", error);
    return { success: false, error: "Failed to get likes" };
  }
}
export async function getMediaComments(mediaId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "view", "media", mediaItem))) {
      if (!user) return { success: false, error: "Unauthorized" };
      return { success: false, error: "Forbidden" };
    }
    const allComments = await db.query.mediaComments.findMany({
      where: eq(mediaComments.mediaId, mediaId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            handle: true,
          },
        },
        replies: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                handle: true,
              },
            },
          },
          orderBy: [desc(mediaComments.createdAt)],
        },
      },
      orderBy: [desc(mediaComments.createdAt)],
    });
    const commentIds = allComments.flatMap((c) => [
      c.id,
      ...c.replies.map((r) => r.id),
    ]);
    const likeCounts =
      commentIds.length > 0
        ? await db
            .select({
              commentId: commentLikes.commentId,
              count: count(),
            })
            .from(commentLikes)
            .where(inArray(commentLikes.commentId, commentIds))
            .groupBy(commentLikes.commentId)
        : [];
    const likeCountMap = Object.fromEntries(
      likeCounts.map((lc) => [lc.commentId, lc.count]),
    );
    const userLikes =
      session?.id && commentIds.length > 0
        ? await db
            .select({ commentId: commentLikes.commentId })
            .from(commentLikes)
            .where(
              and(
                inArray(commentLikes.commentId, commentIds),
                eq(commentLikes.userId, session.id),
              ),
            )
        : [];
    const userLikeSet = new Set(userLikes.map((ul) => ul.commentId));
    const commentsWithLikes = allComments
      .filter((c) => !c.parentCommentId)
      .map((comment) => ({
        ...comment,
        likeCount: likeCountMap[comment.id] || 0,
        hasLiked: userLikeSet.has(comment.id),
        replies: comment.replies.map((reply) => ({
          ...reply,
          likeCount: likeCountMap[reply.id] || 0,
          hasLiked: userLikeSet.has(reply.id),
        })),
      }));
    return { success: true, comments: commentsWithLikes };
  } catch (error) {
    console.error("Error fetching comments:", error);
    return { success: false, error: "Failed to fetch comments" };
  }
}
export async function createComment(
  mediaId: string,
  content: string,
  parentCommentId?: string,
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!content || content.trim().length === 0) {
    return { success: false, error: "Comment content is required" };
  }
  if (content.length > 1000) {
    return {
      success: false,
      error: "Comment is too long (max 1000 characters)",
    };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "create", "comment", mediaItem))) {
      return { success: false, error: "Unauthorized" };
    }
    if (parentCommentId) {
      const parentComment = await db.query.mediaComments.findFirst({
        where: eq(mediaComments.id, parentCommentId),
      });
      if (!parentComment) {
        return { success: false, error: "Parent comment not found" };
      }
      if (parentComment.mediaId !== mediaId) {
        return {
          success: false,
          error: "Parent comment does not belong to this media",
        };
      }
    }
    const [comment] = await db
      .insert(mediaComments)
      .values({
        mediaId,
        userId: user.id,
        content: content.trim(),
        parentCommentId: parentCommentId || null,
      })
      .returning();
    await auditLog(user.id, "create", "comment", comment.id, {
      mediaId,
      parentCommentId,
    });
    const commentWithUser = await db.query.mediaComments.findFirst({
      where: eq(mediaComments.id, comment.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            handle: true,
          },
        },
      },
    });
    if (!commentWithUser) {
      return { success: false, error: "Failed to fetch created comment" };
    }
    const commentWithLikes = {
      ...commentWithUser,
      likeCount: 0,
      hasLiked: false,
      replies: [],
    };
    try {
      broadcastNewComment(comment.id).catch(console.error);
    } catch (error) {
      console.error("Failed to broadcast new comment:", error);
    }
    return { success: true, comment: commentWithLikes };
  } catch (error) {
    console.error("Error creating comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}
export async function deleteComment(commentId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const comment = await db.query.mediaComments.findFirst({
      where: eq(mediaComments.id, commentId),
      with: {
        media: {
          with: {
            event: {
              columns: {
                id: true,
                seriesId: true,
              },
            },
          },
        },
      },
    });
    if (!comment) {
      return { success: false, error: "Comment not found" };
    }
    if (!(await can(user, "delete", "comment", comment))) {
      return { success: false, error: "Forbidden" };
    }
    await db.delete(mediaComments).where(eq(mediaComments.id, commentId));
    await auditLog(user.id, "delete", "comment", commentId, {
      mediaId: comment.mediaId,
    });
    return { success: true };
  } catch (error) {
    console.error("Error deleting comment:", error);
    return { success: false, error: "Failed to delete comment" };
  }
}
export async function toggleCommentLike(commentId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const comment = await db.query.mediaComments.findFirst({
      where: eq(mediaComments.id, commentId),
      with: {
        media: {
          with: {
            event: true,
          },
        },
      },
    });
    if (!comment || !comment.media) {
      return { success: false, error: "Comment not found" };
    }
    if (!(await can(user, "interact", "comment", comment))) {
      return { success: false, error: "Unauthorized" };
    }
    const existing = await db
      .select()
      .from(commentLikes)
      .where(
        and(
          eq(commentLikes.commentId, commentId),
          eq(commentLikes.userId, user.id),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .delete(commentLikes)
        .where(
          and(
            eq(commentLikes.commentId, commentId),
            eq(commentLikes.userId, user.id),
          ),
        );
    } else {
      await db.insert(commentLikes).values({
        commentId,
        userId: user.id,
      });
    }
    const likeCountResult = await db
      .select({ count: count() })
      .from(commentLikes)
      .where(eq(commentLikes.commentId, commentId));
    return {
      success: true,
      likeCount: likeCountResult[0]?.count || 0,
      hasLiked: existing.length === 0,
    };
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return { success: false, error: "Failed to toggle comment like" };
  }
}
