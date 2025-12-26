import type React from "react";
import { HiExclamationCircle } from "react-icons/hi2";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  prefix?: string;
}
export default function FormInput({
  label,
  error,
  helperText,
  icon,
  prefix,
  className = "",
  id,
  ...props
}: FormInputProps) {
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
      <div className={`relative ${prefix ? "flex" : ""}`}>
        {prefix && (
          <span
            className={`px-4 py-3 bg-zinc-900 border border-r-0 rounded-l-lg text-zinc-400 text-sm flex items-center ${error ? "border-red-600" : "border-zinc-700"}`}
          >
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          className={`w-full px-3 py-2 bg-zinc-900 border text-white placeholder-zinc-500 focus:outline-none  focus:border-red-600 transition-all ${prefix ? "rounded-r-lg" : "rounded-lg"} ${error ? "border-red-600 pr-10" : "border-zinc-800"} ${props.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          {...props}
        />
        {error && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
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
