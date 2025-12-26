import * as React from "react";
import { twMerge } from "tailwind-merge";

const TableContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={twMerge(
      "bg-zinc-900 shadow-xl rounded-xl overflow-hidden border border-zinc-800 flex flex-col",
      className,
    )}
    {...props}
  />
));
TableContainer.displayName = "TableContainer";
const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="overflow-x-auto w-full">
    <table
      ref={ref}
      className={twMerge("min-w-full divide-y divide-zinc-800", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={twMerge("bg-zinc-950 border-b border-zinc-800", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={twMerge("bg-zinc-900 divide-y divide-zinc-800", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={twMerge(
      "hover:bg-zinc-800/50 transition-colors data-[state=selected]:bg-zinc-800",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={twMerge(
      "px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={twMerge(
      "px-6 py-4 whitespace-nowrap text-sm text-zinc-300",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={twMerge("mt-4 text-sm text-zinc-500", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";
export {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
