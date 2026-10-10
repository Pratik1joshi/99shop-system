import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

const buttonVariants = {
  default: "border border-[var(--erp-primary,#16705a)] bg-[var(--erp-primary,#16705a)] text-white hover:bg-[var(--erp-primary-hover,#105b49)]",
  destructive: "border border-red-700 bg-red-700 text-white hover:bg-red-800",
  outline: "border border-[var(--erp-border-strong,#b7c4bd)] bg-white text-gray-700 hover:bg-gray-50",
  secondary: "border border-gray-700 bg-gray-700 text-white hover:bg-gray-800",
  ghost: "hover:bg-gray-100 text-gray-700 hover:text-gray-900",
  link: "text-blue-600 underline-offset-4 hover:underline font-semibold",
  success: "border border-green-700 bg-green-700 text-white hover:bg-green-800",
  warning: "border border-yellow-700 bg-yellow-700 text-white hover:bg-yellow-800",
}

const buttonSizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-8 text-lg",
  icon: "h-10 w-10",
}

export function Button({
  className = "",
  variant = "default",
  size = "default",
  disabled = false,
  loading = false,
  disabledReason,
  children,
  onClick,
  type = "button",
  asChild = false,
  ...props
}) {
  const baseStyles = "inline-flex items-center justify-center rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
  
  const variantStyles = buttonVariants[variant] || buttonVariants.default
  const sizeStyles = buttonSizes[size] || buttonSizes.default
  
  const Component = asChild ? Slot : "button"
  return (
    <Component
      {...(!asChild ? { type, disabled: disabled || loading } : { 'aria-disabled': disabled || loading || undefined })}
      className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
      aria-busy={loading || undefined}
      title={(disabled || loading) ? disabledReason : props.title}
      onClick={onClick}
      {...props}
    >
      {asChild ? children : <>{loading && <span aria-hidden className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}{loading && <span className="sr-only">Loading</span>}{children}</>}
    </Component>
  )
}
