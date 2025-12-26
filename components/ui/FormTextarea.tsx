import type React from "react";
import { HiExclamationCircle } from "react-icons/hi2";

interface FormTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}
export default function FormTextarea({
  label,
  error,
  helperText,
  icon,
  className = "",
  id,
  ...props
}: FormTextareaProps) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2"
      >
        {icon}
        {label}
        {props.required && <span className="text-red-600">*</span>}
      </label>
      <div className="relative">
        <textarea
          id={inputId}
          className={`w-full px-3 py-2 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500 focus:outline-none  focus:border-red-600 transition-all resize-none ${error ? "border-red-600" : "border-zinc-800"} ${props.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          {...props}
        />
        {error && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <HiExclamationCircle className="w-5 h-5 text-red-600" />
          </div>
        )}
      </div>
      {error ? (
        <p className="text-sm text-red-600 mt-1 animate-in slide-in-from-top-1 duration-200">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-xs text-zinc-500 mt-1.5">{helperText}</p>
      ) : null}
    </div>
  );
}
