import type * as React from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}
export function AdminPageHeader({
  title,
  description,
  children,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={twMerge(
        "border-b border-zinc-800 px-4 py-5 sm:px-8 sm:py-8",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
            {title}
          </h1>
          {description && <p className="text-zinc-400">{description}</p>}
        </div>
        {children && (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
interface AdminPageContentProps {
  children: React.ReactNode;
  className?: string;
}
export function AdminPageContent({
  children,
  className,
}: AdminPageContentProps) {
  return (
    <div
      className={twMerge(
        "mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
interface AdminToolbarProps {
  children: React.ReactNode;
  className?: string;
}
export function AdminToolbar({ children, className }: AdminToolbarProps) {
  return (
    <div
      className={twMerge(
        "mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
interface AdminSearchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  children?: React.ReactNode;
}
export function AdminSearch({
  className,
  children,
  ...props
}: AdminSearchProps) {
  return (
    <div className={twMerge("relative min-w-0 flex-1", className)}>
      <HiMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
      <input
        type="text"
        className="min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3 pl-12 pr-4 text-white placeholder-zinc-500 transition-colors focus:border-red-600/50 focus:outline-none"
        {...props}
      />
      {children}
    </div>
  );
}
