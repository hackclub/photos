"use client";

import { useState } from "react";
import Link from "next/link";
import { HiUsers, HiXMark } from "react-icons/hi2";
import UserAvatar from "@/components/ui/UserAvatar";

interface Participant {
  user: {
    id: string;
    name: string;
    handle: string | null;
    avatarS3Key: string | null;
    avatarSource: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
    email: string;
    slackId: string | null;
  };
  joinedAt?: string | Date;
}

interface ParticipantsListProps {
  participants: Participant[];
  count: number;
}

export default function ParticipantsList({ participants, count }: ParticipantsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-zinc-300 hover:text-white transition-colors"
      >
        <HiUsers className="w-5 h-5 sm:w-6 sm:h-6" />
        <span className="font-medium text-xs sm:text-sm">
          {count} {count === 1 ? "participant" : "participants"}
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <HiUsers className="text-red-600" />
                Participants
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-2 bg-zinc-900">
              {participants.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  No participants yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {participants.map(({ user }) => (
                    <Link
                      key={user.id}
                      href={`/users/${user.handle || user.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-zinc-800 rounded-lg transition-colors group"
                    >
                      <UserAvatar user={user} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate group-hover:text-red-400 transition-colors">
                          {user.name}
                        </div>
                        {user.handle && (
                          <div className="text-sm text-zinc-500 truncate">
                            @{user.handle}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
