"use client";
export default function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-zinc-400">
      <svg
        className="mx-auto h-16 w-16 mb-4 opacity-50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <title>No photos</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <p className="text-lg">No photos yet</p>
      <p className="text-sm mt-2">I know... Sad!</p>
    </div>
  );
}
