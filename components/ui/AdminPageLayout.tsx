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
        "border-b border-zinc-800 px-4 sm:px-8 py-8",
        className,
      )}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
          {description && <p className="text-zinc-400">{description}</p>}
        </div>
        {children && <div className="flex items-center gap-3">{children}</div>}
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
    <div className={twMerge("px-4 sm:px-8 py-8 max-w-7xl mx-auto", className)}>
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
        "flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6",
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
    <div className={twMerge("relative flex-1", className)}>
      <HiMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
      <input
        type="text"
        className="w-full pl-12 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-600/50 transition-colors"
        {...props}
      />
      {children}
    </div>
  );
}
