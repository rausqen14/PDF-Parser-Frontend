
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  active = false,
  className = '',
  ...props 
}) => {
  // Base styles: Pill shape, font weight, flex centering, smooth transitions
  const baseStyle = "group relative px-6 py-3 rounded-full text-sm font-bold tracking-wide transition-all duration-300 ease-out flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-95";
  
  const variants = {
    // Primary: White Bg, Black Text, Black Border (The "Next Step" look)
    primary: "bg-white text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] focus:ring-black",
    
    // Secondary: Similar to Primary but with Gray Border (Used for "Previous" or inactive states)
    secondary: "bg-white text-black border-2 border-gray-200 hover:border-black shadow-sm hover:shadow-md focus:ring-gray-200",
    
    // Outline: Transparent with border (Used for sidebar inactive items if requested)
    outline: "bg-white text-gray-900 border-2 border-gray-200 hover:border-black hover:text-black focus:ring-black",
    
    // Ghost: No border, but high contrast text (Good for clean lists)
    ghost: "bg-transparent text-gray-900 hover:text-black hover:bg-gray-100"
  };

  // Active state for sidebar/tabs - Enforce the "Primary" look when active
  const activeStyle = active 
    ? "bg-black text-white border-2 border-black shadow-none" 
    : "";

  // If active is true, it overrides the variant style logic for specific sidebar cases
  const variantStyle = active ? "" : variants[variant];

  return (
    <button 
      className={`${baseStyle} ${variantStyle} ${activeStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
